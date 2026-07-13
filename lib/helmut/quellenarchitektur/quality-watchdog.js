"use strict";

// Helmut — Quellenarchitektur · Sprint 7: Qualitäts-/Kostenmessung + mehrachsiger Watchdog.
//
// REINE, DETERMINISTISCHE LOGIK. Keine KI, kein Netz, kein Storage. ALLE Eingaben werden
// INJIZIERT (aus echten Storage-Reads: raw_documents, ko_document_links, document_findings,
// llm_usage, dem Sprint-1-Katalog und der Sprint-4-Aktivierung). Vor einer Production-Migration
// wollen wir zuverlässig erkennen (Auftrag §1..§10):
//   1. welcher Abrufweg funktioniert            -> assessRetrievalPaths.technicalHealth
//   2. welcher Abrufweg defekt ist              -> technicalHealth = 'defekt'
//   3. welche Quelle Dokumente erzeugt          -> contentYield.documentCount
//   4. welche Quelle Knowledge Objects erzeugt  -> productValue = 'ergiebig' / koCount
//   5. welche Quelle nur Duplikate erzeugt      -> productValue = 'nur_duplikate'
//   6. welche Pakete vollständig/unterversorgt  -> assessPackages
//   7. welche Profile versorgt/unversorgt       -> assessProfiles (Sprint-4-Wiederverwendung)
//   8. welche Pipeline-Teile aktuell/veraltet   -> buildWatchdog (10 getrennte Achsen)
//   9. welche KI-/Verarbeitungskosten entstehen -> assessCosts (echte llm_usage-Records)
//  10. welche konkrete Admin-Handlung empfohlen -> recommendedAction je Objekt + buildRecommendations
//
// EHRLICHKEIT (Auftrag: „erfinde keine Kennzahlen ohne reale Datengrundlage"): Wo eine
// Datenquelle in Production heute LEER ist (document_findings/Dedup, retrieval_paths.last_success_at),
// wird die betroffene Kennzahl als NICHT VERFÜGBAR markiert (available:false / kind 'unbekannt') —
// nie geraten. Verfügbar sind heute real: raw_documents (source_id), KOs via ko_document_links,
// und die llm_usage-Kosten (Blob-Ring) nach Modell/Pipeline-Schritt.

const model = require("./model");
const { profileSupplyStatus } = require("./profile-packages");

// --- kleine reine Helfer ----------------------------------------------------
function toMs(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}
function docTimestampMs(d = {}) {
  return toMs(d.retrieved_at) || toMs(d.retrievedAt) || toMs(d.published_at)
    || toMs(d.publishedAt) || toMs(d.created_at) || toMs(d.createdAt) || null;
}
function ageHours(ms, now) { return ms == null ? null : Math.max(0, (now - ms) / 3600000); }
function round1(x) { return x == null ? null : Number(Number(x).toFixed(1)); }
function round6(x) { return x == null ? null : Number(Number(x).toFixed(6)); }
function num(v) { if (v == null || v === "" || v === "unknown") return null; const n = Number(v); return Number.isFinite(n) ? n : null; }

// Frische-Achse: aus einem Alter (ms) und einem Schwellenpaar (Stunden) einen Zustand ableiten.
// null-Alter -> 'unbekannt' (kein Zeitstempel = keine Aussage, NICHT 'frisch').
function freshnessState(ageMs, freshH, warnH) {
  if (ageMs == null) return "unbekannt";
  const h = ageMs / 3600000;
  if (h < freshH) return "frisch";
  if (h < warnH) return "warn";
  return "tot";
}

// --- Standard-Frischeschwellen (Stunden). ENV-Override wie beim bestehenden Watchdog. -------
const DEFAULT_THRESHOLDS = {
  crawlFreshH: 14, crawlWarnH: 28,
  understandingFreshH: 24, understandingWarnH: 36,
  koFreshH: 24, koWarnH: 48,
  matchingFreshH: 24, matchingWarnH: 48,
  lageFreshH: 4, lageWarnH: 28,
  radarFreshH: 24, radarWarnH: 48,
  helmutFreshH: 24, helmutWarnH: 48,
  briefingsFreshH: 24, briefingsWarnH: 48,
  // Eine aktive Quelle, die seit dieser Zeit KEIN Dokument mehr geliefert hat, gilt als „ruht".
  sourceStaleH: 72
};
function resolveThresholds(overrides = {}) { return { ...DEFAULT_THRESHOLDS, ...overrides }; }

// ===========================================================================
// A) QUELLEN-METRIKEN je source_id (Dokumente / KOs / Duplikate)
// ===========================================================================
// Eingaben (real, injiziert):
//   rawDocs        : [{ source_id, retrieved_at|published_at|created_at }]  (storage.listRawDocuments)
//   koSourceLinks  : [{ knowledge_object_id|vorgang_id, source_ids:[...] }] (aus ko_document_links + raw_docs)
//   dedupDocuments : [{ primary_source_id, findings:[{ source_id }] }]      (Sprint-3-Dedup; in Prod LEER)
// source_id == v1Sources.id == retrieval_paths.legacy_source_id (wertgleich, Sprint 1).
function computeSourceMetrics({ rawDocs = [], koSourceLinks = [], dedupDocuments = [], findings = [], now = Date.now() } = {}) {
  const bySource = {};
  const ensure = (sid) => (bySource[sid] || (bySource[sid] = {
    source_id: sid, documentCount: 0, koCount: 0, duplicateCount: 0, primaryCount: 0, latestMs: null
  }));

  for (const d of rawDocs) {
    const sid = d.source_id || d.sourceId;
    if (!sid) continue;
    const rec = ensure(sid);
    rec.documentCount += 1;
    const ms = docTimestampMs(d);
    if (ms != null && (rec.latestMs == null || ms > rec.latestMs)) rec.latestMs = ms;
  }

  // KO-Ertrag: je KO die beitragenden Quellen EINMAL zählen (distinct pro KO).
  for (const link of koSourceLinks) {
    const sids = new Set((link.source_ids || link.sourceIds || []).filter(Boolean));
    for (const sid of sids) ensure(sid).koCount += 1;
  }

  // Duplikate: aus dem Sprint-3-Dedup-Modell. Jede Fundstelle mit ABWEICHENDEM source_id zur
  // Primärquelle des Dokuments ist ein Duplikat-Fund; die Primärquelle produziert das Original.
  // Ehrlich: in Production ist dieses Modell noch NICHT verdrahtet -> dedupDocuments leer ->
  // duplicatesAvailable=false -> die Duplikat-Kennzahl ist NICHT VERFÜGBAR (nicht 0 erfunden).
  const docsForDup = dedupDocuments.length ? dedupDocuments : normalizeFindings(findings);
  const duplicatesAvailable = docsForDup.length > 0;
  for (const doc of docsForDup) {
    const primary = doc.primary_source_id || doc.primarySourceId || null;
    if (primary) ensure(primary).primaryCount += 1;
    for (const f of doc.findings || []) {
      const sid = f.source_id || f.sourceId;
      if (sid && primary && sid !== primary) ensure(sid).duplicateCount += 1;
    }
  }

  return {
    bySource,
    sourceCount: Object.keys(bySource).length,
    documentTotal: rawDocs.length,
    // Verfügbarkeits-Flags: wurde die jeweilige Datengrundlage überhaupt geliefert? Damit
    // assessRetrievalPaths nie einen konkreten Wert behauptet, wo Daten schlicht fehlten.
    documentsAvailable: rawDocs.length > 0,
    koAvailable: koSourceLinks.length > 0,
    duplicatesAvailable
  };
}

// Flache findings-Liste [{raw_document_id, source_id, primary_source_id}] in das Dokument-Modell
// falten. Gruppierung nach DOKUMENT-Identität (raw_document_id) zuerst — verschiedene Storys mit
// derselben Primärquelle bleiben getrennt; erst wenn keine Dokument-ID vorliegt, dient die
// Primärquelle als Ersatzschlüssel.
function normalizeFindings(findings = []) {
  if (!findings.length) return [];
  const byDoc = new Map();
  for (const f of findings) {
    const primary = f.primary_source_id || f.primarySourceId || null;
    const key = f.raw_document_id || f.rawDocumentId || primary || JSON.stringify(f);
    if (!byDoc.has(key)) byDoc.set(key, { primary_source_id: primary, findings: [] });
    const doc = byDoc.get(key);
    if (!doc.primary_source_id && primary) doc.primary_source_id = primary;
    doc.findings.push({ source_id: f.source_id || f.sourceId });
  }
  return [...byDoc.values()];
}

// ===========================================================================
// B) ABRUFWEG-QUALITÄT — drei getrennte Qualitätsarten (Auftrag §1..§5)
// ===========================================================================
// technicalHealth : funktioniert der Abrufweg? (gesund/defekt/pruefen/ruht/inaktiv)
// contentYield    : liefert er Dokumente? (documentCount, Frische)
// productValue    : bringt er Produktnutzen? (ergiebig/nur_duplikate/ohne_ko/unbekannt)
function assessRetrievalPaths({ paths = [], sourceMetrics = {}, activePathIds = [], now = Date.now(), thresholds = {} } = {}) {
  const t = resolveThresholds(thresholds);
  const activeSet = new Set(activePathIds);
  const bySource = sourceMetrics.bySource || {};
  const dupAvailable = !!sourceMetrics.duplicatesAvailable;
  const koAvailable = !!sourceMetrics.koAvailable;
  const docsAvailable = sourceMetrics.documentsAvailable !== false;

  return paths.map((p) => {
    const legacy = p.legacy_source_id || p.legacySourceId || null;
    const m = (legacy && bySource[legacy]) || { documentCount: 0, koCount: 0, duplicateCount: 0, primaryCount: 0, latestMs: null };
    const active = activeSet.has(p.id);
    const isCritical = p.is_critical === true || p.isCritical === true;
    const latestAgeH = ageHours(m.latestMs, now);
    const hasDocs = m.documentCount > 0;

    // --- technische Gesundheit ---
    let technicalHealth;
    if (p.status === "broken") technicalHealth = "defekt";
    else if (p.status === "archived" || p.status === "paused" || p.activation_mode === "dev_only") technicalHealth = "inaktiv";
    else if (!active) technicalHealth = "inaktiv";
    else if (hasDocs && latestAgeH != null && latestAgeH < t.sourceStaleH) technicalHealth = "gesund";
    else if (hasDocs) technicalHealth = "ruht"; // liefert(e), aber seit sourceStaleH nichts Frisches
    else if (p.status === "needs_review") technicalHealth = "pruefen";
    else technicalHealth = "ruht"; // aktiv, aber (noch) keine Dokumente

    // --- inhaltlicher Ertrag --- (available spiegelt, ob Dokumentdaten geladen wurden)
    const contentYield = { documentCount: m.documentCount, latestAgeHours: round1(latestAgeH), available: docsAvailable };

    // --- Produktnutzen ---
    // Ehrlich: eine definitive Aussage (ergiebig/nur_duplikate/ohne_ko) NUR, wenn die
    // jeweilige Datengrundlage geladen wurde. Fehlen KO- ODER Dedup-Daten -> 'unbestaetigt'
    // (kein erfundenes 'ohne_ko'/'nur_duplikate'). Symmetrisch fuer KO und Duplikate.
    let productValue;
    if (!hasDocs) productValue = "unbekannt";
    else if (m.koCount > 0) productValue = "ergiebig";
    else if (!koAvailable) productValue = "ohne_ko_unbestaetigt";                 // KO-Daten fehlen -> nichts behaupten
    else if (dupAvailable && m.duplicateCount > 0 && m.primaryCount === 0) productValue = "nur_duplikate";
    else if (dupAvailable) productValue = "ohne_ko"; // KO geladen & kein KO & keine reine Duplikatlage
    else productValue = "ohne_ko_unbestaetigt"; // KO geladen, aber Dedup-Lage (noch) nicht belastbar

    return {
      id: p.id,
      legacy_source_id: legacy,
      status: p.status,
      activation_mode: p.activation_mode,
      is_critical: isCritical,
      active,
      technicalHealth,
      contentYield,
      productValue,
      koCount: m.koCount,
      duplicateCount: dupAvailable ? m.duplicateCount : null,
      recommendedAction: pathAction({ technicalHealth, productValue, isCritical, active, dupAvailable })
    };
  });
}

function pathAction({ technicalHealth, productValue, isCritical, active, dupAvailable }) {
  if (technicalHealth === "defekt") {
    return isCritical
      ? { severity: "hoch", text: "Defekter PFLICHT-Abrufweg: Ersatzweg suchen, NICHT still archivieren." }
      : { severity: "mittel", text: "Defekter Abrufweg: reparieren oder deaktivieren." };
  }
  if (technicalHealth === "pruefen") return { severity: "mittel", text: "Abrufweg liefert keine Dokumente: Feed/Endpoint prüfen." };
  if (technicalHealth === "ruht" && active) return { severity: "niedrig", text: "Aktiv, aber ohne frische Dokumente: Frische/Route beobachten." };
  if (productValue === "nur_duplikate") return { severity: "mittel", text: "Erzeugt nur Duplikate: Suchweg schärfen oder deaktivieren (spart Kosten)." };
  if (productValue === "ohne_ko" && dupAvailable) return { severity: "niedrig", text: "Dokumente ohne Knowledge Objects: Zielsemantik/Relevanz prüfen." };
  return { severity: "keine", text: "Keine." };
}

// ===========================================================================
// C) PAKETVERSORGUNG (Auftrag §6)
// ===========================================================================
function assessPackages({ packages = [], packagePaths = [], pathQuality = [], activePackageIds = [] } = {}) {
  const activeSet = new Set(activePackageIds);
  const qualityById = new Map(pathQuality.map((q) => [q.id, q]));
  const pathsByPkg = new Map();
  for (const pp of packagePaths) {
    if (!pp || !pp.package_id) continue;
    if (!pathsByPkg.has(pp.package_id)) pathsByPkg.set(pp.package_id, []);
    pathsByPkg.get(pp.package_id).push(pp.retrieval_path_id);
  }

  return packages.map((pk) => {
    const pathIds = pathsByPkg.get(pk.id) || [];
    const qualities = pathIds.map((id) => qualityById.get(id)).filter(Boolean);
    const healthy = qualities.filter((q) => q.technicalHealth === "gesund").length;
    const yielding = qualities.filter((q) => q.productValue === "ergiebig").length;
    const active = activeSet.has(pk.id);

    let supply;
    if (pk.status === "prepared" || pk.status === "draft") supply = "vorbereitet"; // strukturell, (noch) ohne Quellen
    else if (!pathIds.length) supply = "leer";
    else if (!active) supply = "inaktiv";
    else if (healthy === 0) supply = "unterversorgt";
    else if (healthy < pathIds.length) supply = "teilversorgt";
    else supply = "vollstaendig";

    return {
      id: pk.id, key: pk.key, status: pk.status, is_base: pk.is_base === true, active,
      pathCount: pathIds.length, healthyPathCount: healthy, yieldingPathCount: yielding,
      supply,
      recommendedAction: packageAction(pk, supply)
    };
  });
}

function packageAction(pk, supply) {
  if (supply === "unterversorgt") return { severity: pk.is_base ? "hoch" : "mittel", text: `Paket „${pk.key}" ist aktiv, aber ohne gesunden Abrufweg: Quellen prüfen/ersetzen.` };
  if (supply === "teilversorgt") return { severity: "niedrig", text: `Paket „${pk.key}" nur teilversorgt: defekte Abrufwege prüfen.` };
  if (supply === "vorbereitet") return { severity: "niedrig", text: `Paket „${pk.key}" ist vorbereitet (ohne Quellen): Quellenrecherche + Freigabe ausstehend.` };
  return { severity: "keine", text: "Keine." };
}

// ===========================================================================
// D) PROFILVERSORGUNG (Auftrag §7) — Sprint-4-Logik wiederverwenden
// ===========================================================================
function assessProfiles({ profiles = [], packages = [], packagePaths = [] } = {}) {
  return profiles.map((profile) => {
    const st = profileSupplyStatus(profile, { packages, packagePaths });
    return {
      profileId: profile.id || profile.user_id || null,
      eligible: st.eligible,
      fullyActivated: st.fullyActivated,
      supply: st.eligible ? (st.fullyActivated ? "versorgt" : "unversorgt") : "nicht_aktivierbar",
      requiredPackages: st.requiredPackages,
      missingBasePackages: st.missingBasePackages,
      reason: st.reason,
      recommendedAction: profileAction(st)
    };
  });
}

function profileAction(st) {
  if (!st.eligible) return { severity: "niedrig", text: "Profil nicht aktivierbar (unvollständig/deaktiviert): Pflichtfelder ergänzen." };
  if (!st.fullyActivated) return { severity: "mittel", text: `Profil unversorgt: fehlendes Pflichtpaket ${st.missingBasePackages.map((m) => m.key).join(", ") || "unbekannt"}.` };
  return { severity: "keine", text: "Keine." };
}

// ===========================================================================
// E) KOSTEN (Auftrag §9) — aus echten llm_usage-Records
// ===========================================================================
// Nutzt die vom Write-Pfad gespeicherten Records (record.estimatedCost = USD, record.pipelineStep,
// record.model, seit Sprint 7 optional record.sourceId/packageId/vorgangId). Aggregiert ehrlich:
// Quellen-/Paketkosten NUR für Records, die die Zuordnung tragen; der Rest ist „nicht zuordenbar".
// Einheit ist USD mit voller Präzision — ein einzelner Call kostet Sub-Cent, Ganz-Cent-Rundung
// würde jede reale Einzelkennzahl auf 0 verlieren.
function assessCosts({ llmUsage = [], now = Date.now(), windowDays = 30 } = {}) {
  const sinceMs = now - windowDays * 24 * 3600000;
  const byStep = {}; const byModel = {}; const bySource = {}; const byPackage = {};
  let totalUsd = 0, attributedUsd = 0, records = 0, unknownCostRecords = 0;
  let sourceAttributed = 0;
  const add = (map, key, usd) => { map[key] = round6((map[key] || 0) + usd); };

  for (const r of llmUsage) {
    const ts = toMs(r.createdAt || r.created_at);
    if (ts != null && ts < sinceMs) continue;
    // Skip-/Info-Einträge (skipped-*) zählen nicht als Kosten (konsistent mit den Alt-Reports).
    const step = String(r.pipelineStep || r.callType || "unknown");
    if (/^skipped-/.test(String(r.callType || ""))) continue;
    records += 1;
    const usd = num(r.estimatedCost); // "unknown"/null -> null
    if (usd == null) { unknownCostRecords += 1; continue; } // ehrlich nicht mitrechnen (nie 0 erfinden)
    totalUsd += usd;
    add(byStep, step, usd);
    add(byModel, String(r.model || "unknown"), usd);
    if (r.sourceId) { add(bySource, r.sourceId, usd); attributedUsd += usd; sourceAttributed += 1; }
    if (r.packageId) add(byPackage, r.packageId, usd);
  }

  const sourceAttributionAvailable = sourceAttributed > 0;
  totalUsd = round6(totalUsd); attributedUsd = round6(attributedUsd);
  return {
    windowDays,
    totalUsd,
    totalCents: Math.round(totalUsd * 100 * 100) / 100, // US-Cent, 2 Nachkommastellen (Anzeige)
    byPipelineStep: byStep,
    byModel,
    // Ehrlich: Quellen-/Paketkosten nur, wenn Records die Zuordnung tragen. Sonst null +
    // unattributedUsd = alles, damit im Admin klar „noch nicht zuordenbar" steht.
    bySource: sourceAttributionAvailable ? bySource : null,
    byPackage: Object.keys(byPackage).length ? byPackage : null,
    sourceAttributionAvailable,
    attributedUsd,
    unattributedUsd: round6(totalUsd - attributedUsd),
    records,
    unknownCostRecords
  };
}

// ===========================================================================
// F) WATCHDOG — 10 getrennte Achsen (Auftrag §8 + Watchdog-Vorgabe)
// ===========================================================================
// Bewertet Crawl, Understanding, Knowledge Objects, Matching, Lage, Radar, Helmut, Briefings,
// Paketversorgung und kritische Quellen GETRENNT. Jede Achse: frisch/warn/tot/unbekannt +
// konkrete Handlungsempfehlung. Reine Logik — alle Signale werden injiziert.
const AXIS_LABELS = {
  crawl: "Crawl", understanding: "Understanding", knowledge_objects: "Knowledge Objects",
  matching: "Matching", lage: "Lage", radar: "Radar", helmut: "Helmut", briefings: "Briefings",
  paketversorgung: "Paketversorgung", kritische_quellen: "Kritische Quellen"
};

function freshnessAxis(key, ageMs, freshH, warnH, actions) {
  const state = freshnessState(ageMs, freshH, warnH);
  return {
    key, label: AXIS_LABELS[key], status: state,
    ageHours: round1(ageMs == null ? null : ageMs / 3600000),
    recommendedAction: actions[state] || { severity: "keine", text: "Keine." }
  };
}

function buildWatchdog({ signals = {}, thresholds = {}, packageSupply = [], pathQuality = [], now = Date.now() } = {}) {
  const t = resolveThresholds(thresholds);
  const age = (ts) => { const ms = toMs(ts); return ms == null ? null : (now - ms); };
  const axes = [];

  const freshWarnTot = (base, freshTxt, warnTxt, totTxt) => ({
    frisch: { severity: "keine", text: "Keine." },
    warn: { severity: "niedrig", text: warnTxt },
    tot: { severity: "hoch", text: totTxt },
    unbekannt: { severity: "mittel", text: `${base}: kein Zeitstempel — Lauf prüfen.` }
  });

  axes.push(freshnessAxis("crawl", age(signals.crawlAt), t.crawlFreshH, t.crawlWarnH,
    freshWarnTot("Crawl", "", "Crawl älter als erwartet: Crawl-Route beobachten.", "Crawl steht: Cron/Crawl-Route prüfen.")));
  axes.push(freshnessAxis("understanding", age(signals.understandingAt), t.understandingFreshH, t.understandingWarnH,
    freshWarnTot("Understanding", "", "Understanding zieht nach: Lock/KI-Budget beobachten.", "Kein frisches Understanding: Lock/KI-Budget/OpenAI prüfen.")));
  axes.push(freshnessAxis("knowledge_objects", age(signals.newestKoAt), t.koFreshH, t.koWarnH,
    freshWarnTot("KO", "", "Keine ganz frischen KOs: Understanding-Ausbeute beobachten.", "Keine frischen Knowledge Objects: Understanding-Pipeline prüfen.")));
  axes.push(freshnessAxis("matching", age(signals.matchingAt), t.matchingFreshH, t.matchingWarnH,
    freshWarnTot("Matching", "", "Matching-Ergebnisse altern: Neuberechnung beobachten.", "Kein frisches Matching: Matching-Neuberechnung prüfen.")));
  axes.push(freshnessAxis("lage", age(signals.lageAt), t.lageFreshH, t.lageWarnH,
    freshWarnTot("Lage", "", "Lage-Check altert.", "Lage veraltet: Lage-Check/Budget prüfen.")));
  axes.push(freshnessAxis("radar", age(signals.radarAt), t.radarFreshH, t.radarWarnH,
    freshWarnTot("Radar", "", "Radar-Datenstand altert (regelbasiert).", "Radar veraltet: zugrundeliegende KO-Frische prüfen.")));
  axes.push(freshnessAxis("helmut", age(signals.helmutAt), t.helmutFreshH, t.helmutWarnH,
    freshWarnTot("Helmut", "", "Helmut-Stand altert.", "Helmut veraltet: Decisions/Understanding prüfen.")));
  axes.push(freshnessAxis("briefings", age(signals.briefingsAt), t.briefingsFreshH, t.briefingsWarnH,
    freshWarnTot("Briefings", "", "Briefings altern.", "Keine frischen Briefings: Briefing-Pfad/Budget prüfen.")));

  // Paketversorgung: keine Frische, sondern Struktur — aus assessPackages abgeleitet.
  const undersupplied = packageSupply.filter((p) => p.supply === "unterversorgt");
  const partial = packageSupply.filter((p) => p.supply === "teilversorgt");
  axes.push({
    key: "paketversorgung", label: AXIS_LABELS.paketversorgung,
    status: undersupplied.length ? "tot" : (partial.length ? "warn" : "frisch"),
    recommendedAction: undersupplied.length
      ? { severity: "hoch", text: `Unterversorgte Pakete: ${undersupplied.map((p) => p.key).join(", ")}.` }
      : (partial.length ? { severity: "niedrig", text: `Teilversorgte Pakete: ${partial.map((p) => p.key).join(", ")}.` } : { severity: "keine", text: "Keine." })
  });

  // Kritische Quellen: kein Pflicht-Abrufweg darf still defekt sein.
  const brokenCritical = pathQuality.filter((q) => q.is_critical && q.technicalHealth === "defekt");
  axes.push({
    key: "kritische_quellen", label: AXIS_LABELS.kritische_quellen,
    status: brokenCritical.length ? "tot" : "frisch",
    recommendedAction: brokenCritical.length
      ? { severity: "hoch", text: `Defekte Pflichtquellen: ${brokenCritical.map((q) => q.legacy_source_id).join(", ")} — sichtbar halten, Ersatz suchen.` }
      : { severity: "keine", text: "Keine." }
  });

  const dead = axes.filter((a) => a.status === "tot");
  const warn = axes.filter((a) => a.status === "warn");
  const unknown = axes.filter((a) => a.status === "unbekannt");
  // storageOk konsistent bewerten: nur ein AUSDRUECKLICHES false ist kritisch (fehlendes
  // Signal ist keine Aussage ueber die DB). severity und state nutzen dieselbe Basis.
  const storageOk = signals.storageOk !== false;
  const severity = (!storageOk || dead.length) ? "alarm" : (warn.length || unknown.length ? "watch" : "ok");
  const state = !storageOk ? "kritisch"
    : dead.length ? "kritisch" : (warn.length || unknown.length ? "teilweise" : "gesund");

  return {
    generatedAtMs: now,
    severity,
    state,
    storageOk,
    axes,
    deadAxes: dead.map((a) => a.key),
    warnAxes: warn.map((a) => a.key),
    unknownAxes: unknown.map((a) => a.key)
  };
}

// ===========================================================================
// G) GESAMTREPORT + ranked Admin-Handlungsempfehlungen (Auftrag §10)
// ===========================================================================
const SEV_RANK = { hoch: 0, mittel: 1, niedrig: 2, keine: 3 };

function buildRecommendations({ pathQuality = [], packageSupply = [], profileSupply = [], watchdog = null, costs = null } = {}) {
  const recs = [];
  const push = (area, ref, action) => {
    if (action && action.severity && action.severity !== "keine") recs.push({ area, ref, severity: action.severity, text: action.text });
  };
  for (const p of pathQuality) push("abrufweg", p.legacy_source_id || p.id, p.recommendedAction);
  for (const p of packageSupply) push("paket", p.key, p.recommendedAction);
  for (const p of profileSupply) push("profil", p.profileId, p.recommendedAction);
  if (watchdog) for (const a of watchdog.axes) push("watchdog", a.key, a.recommendedAction);
  if (costs && !costs.sourceAttributionAvailable && costs.records > 0) {
    recs.push({ area: "kosten", ref: "attribution", severity: "niedrig", text: "Kosten sind noch nicht je Quelle/Paket zuordenbar (llm_usage-Records tragen keine sourceId): Understanding-/Crawl-Pfad um sourceId ergänzen." });
  }
  recs.sort((a, b) => (SEV_RANK[a.severity] - SEV_RANK[b.severity]));
  return recs;
}

// Top-level: setzt alles aus INJIZIERTEN Realdaten zusammen.
function buildQualityReport(inputs = {}) {
  const now = inputs.now || Date.now();
  const catalog = inputs.catalog || {};
  const paths = catalog.retrievalPaths || inputs.paths || [];
  const packages = catalog.packages || inputs.packages || [];
  const packagePaths = catalog.packagePaths || inputs.packagePaths || [];
  const activation = inputs.activation || {};

  const sourceMetrics = computeSourceMetrics({
    rawDocs: inputs.rawDocs || [], koSourceLinks: inputs.koSourceLinks || [],
    dedupDocuments: inputs.dedupDocuments || [], findings: inputs.findings || [], now
  });
  const pathQuality = assessRetrievalPaths({
    paths, sourceMetrics, activePathIds: activation.activePathIds || [], now, thresholds: inputs.thresholds
  });
  const packageSupply = assessPackages({
    packages, packagePaths, pathQuality,
    activePackageIds: (activation.packageStatus || []).filter((p) => p.activation === "active").map((p) => p.id)
  });
  const profileSupply = assessProfiles({ profiles: inputs.profiles || [], packages, packagePaths });
  const costs = assessCosts({ llmUsage: inputs.llmUsage || [], now, windowDays: inputs.costWindowDays || 30 });
  const watchdog = buildWatchdog({ signals: inputs.signals || {}, thresholds: inputs.thresholds, packageSupply, pathQuality, now });
  const recommendations = buildRecommendations({ pathQuality, packageSupply, profileSupply, watchdog, costs });

  return {
    generatedAtMs: now,
    sourceMetrics,
    pathQuality,
    packageSupply,
    profileSupply,
    costs,
    watchdog,
    recommendations,
    // Ehrlichkeits-Flags: welche Kennzahlen tragen heute reale Daten?
    availability: {
      documents: sourceMetrics.documentTotal > 0,
      knowledgeObjects: (inputs.koSourceLinks || []).length > 0,
      duplicates: sourceMetrics.duplicatesAvailable,
      costAttribution: costs.sourceAttributionAvailable,
      pathTelemetry: false // retrieval_paths.last_success_at ist in Prod noch leer (Sprint 6/7-Verdrahtung)
    }
  };
}

module.exports = {
  DEFAULT_THRESHOLDS, resolveThresholds, freshnessState,
  computeSourceMetrics,
  assessRetrievalPaths,
  assessPackages,
  assessProfiles,
  assessCosts,
  buildWatchdog,
  buildRecommendations,
  buildQualityReport,
  AXIS_LABELS
};
