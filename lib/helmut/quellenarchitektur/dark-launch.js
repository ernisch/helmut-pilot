"use strict";

// Helmut — Quellenarchitektur · Sprint 4: DARK LAUNCH der neuen Quellenplattform.
// =============================================================================================
// ZWECK (Auftrag): Nachweis, dass die neue Quellenplattform in der Realität funktioniert —
// OHNE etwas produktiv umzuschalten. Für JEDES Mandat wird PARALLEL berechnet:
//   (1) das LEGACY-Ergebnis (die Quellen, die der Mandant heute tatsächlich erlebt) und
//   (2) das NEUE-Ergebnis (die Quellen, die die relationale Plattform liefern würde).
// Beide laufen unabhängig; NUR das Legacy-Ergebnis bleibt sichtbar. Diese Datei erzeugt aus
// beiden Ergebnissen einen automatischen Vergleich, einen Difference-Report, Metriken,
// Telemetrie, einen internen Admin-Report und die Abbruchregeln.
//
// SICHERHEIT (verbindlich):
//   - REINE, DETERMINISTISCHE LOGIK. Kein Netz, keine KI, kein Storage-Write, KEIN Rendering.
//   - Alle Eingaben (Profil, Legacy-Quellen, Neu-Quellen, Katalog) werden INJIZIERT.
//   - Die neue Plattform darf NIEMALS automatisch aktiviert werden. `autoActivateNewAllowed`
//     ist strukturell IMMER false — unabhängig vom Flag, unabhängig vom Vergleichsergebnis.
//   - Kein Live-Pfad wird verdrahtet; das Modul ist additiv und wird über HELMUT_DARK_LAUNCH
//     (Default AUS) gelesen, aber NICHT scharf in Scheduler/Server geschaltet.
//   - Telemetrie speichert NUR technische Kennzahlen (Zeit, Mandats-ID, Zahlen) — nie
//     personenbezogene Inhalte (keine Namen, keine Quellentitel, keine URLs).

const { flagValue } = require("../flags");
const model = require("./model");
const { normalizeParty, normalizeCommittee } = require("../matching");
const { compareSupply } = require("./supply-shadow-compare");
const { resolveProfilePackages } = require("./profile-packages");

// --- Flag-Leser (Default AUS) --------------------------------------------------------------
// off (Default) -> Dark Launch inaktiv. shadow -> parallele Berechnung + Vergleich/Report.
// Jeder Wahrheitswert außer off wird als "shadow" verstanden — "on" existiert hier bewusst
// NICHT: der Dark Launch aktiviert die neue Plattform NIE.
function darkLaunchMode(env = process.env) {
  const raw = String(flagValue("HELMUT_DARK_LAUNCH", env) || "").trim().toLowerCase();
  if (raw === "shadow" || raw === "on" || raw === "1" || raw === "true" || raw === "active") return "shadow";
  return "off";
}
function darkLaunchEnabled(env = process.env) {
  return darkLaunchMode(env) === "shadow";
}

// --- Normalisierung ------------------------------------------------------------------------
function norm(s) {
  return String(s == null ? "" : s).toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}
function toArr(v) { return Array.isArray(v) ? v : (v == null || v === "" ? [] : [v]); }
function uniq(list) { return [...new Set(list)]; }

// Wortanfang-Treffer (deutsche Präfix-Komposita: "pflege" -> "pflegeversicherung"),
// KEIN blindes Substring-Matching. Erwartet bereits normalisierte Eingaben.
function matchesAtWordStart(haystack, needle) {
  if (!haystack || !needle) return false;
  let from = 0;
  for (;;) {
    const idx = haystack.indexOf(needle, from);
    if (idx < 0) return false;
    const before = idx === 0 ? "" : haystack[idx - 1];
    if (idx === 0 || !/[a-z0-9]/.test(before)) return true;
    from = idx + 1;
  }
}

// --- Quelle klassifizieren -----------------------------------------------------------------
// tier: "primaer" (amtliche/parlamentarische/behördliche Primärquelle, Datenquelle) vs.
//       "sekundaer" (journalistisch/Aggregator/direktes Interesse). Google News ist immer
//       sekundär (Aggregator). Belegfunktion wird aus Kategorie + Typ abgeleitet.
// isGoogleNews: die reale Abruf-URL zeigt auf news.google.com.
// quality: deterministischer 0..1-Score aus Vertrauensstufe + Primär-Bonus.
// health: aus dem Abrufweg-/Quellen-Status (healthy/degraded/broken) — sonst "unbekannt".
const TRUST_QUALITY = { hoch: 1.0, mittel: 0.6, niedrig: 0.3, unbekannt: 0.4, blockiert: 0.0 };

function primaryUrlOf(source = {}) {
  return source.rssUrl || (Array.isArray(source.rssUrls) ? source.rssUrls[0] : "") || source.url || "";
}

function classifySource(source = {}) {
  const category = source.category || model.categorizeSource(source);
  const entityType = model.entityTypeForLegacy(source.type);
  const isGoogleNews = model.isGoogleNewsUrl(primaryUrlOf(source));
  const evidenceRole = model.evidenceRoleFor({ category, entityType });
  // Primärquelle = amtlicher Primärbeleg oder Datenquelle (Statistik/Behörde/Parlament/
  // Regierung/Ministerium). Alles andere (Medien, Partei, Aggregator) = Sekundärquelle.
  const tier = (!isGoogleNews && (evidenceRole === "official_primary" || evidenceRole === "data_source"))
    ? "primaer" : "sekundaer";
  const trust = source.trust || model.trustForSource(source);
  let quality = TRUST_QUALITY[trust] != null ? TRUST_QUALITY[trust] : 0.4;
  if (tier === "primaer") quality = Math.min(1, quality + 0.1);
  if (isGoogleNews) quality = Math.max(0, quality - 0.1); // Aggregator ohne Herausgeber-Identität
  quality = Math.round(quality * 100) / 100;
  const status = String(source.status || "").toLowerCase();
  const health = status === "broken" ? "defekt"
    : (status === "healthy" || status === "degraded" ? "gesund"
      : (status === "paused" || status === "archived" ? "inaktiv" : "unbekannt"));
  return { id: source.id || null, tier, isGoogleNews, evidenceRole, category, trust, quality, health };
}

// --- Abdeckungs-Tags einer Quelle ----------------------------------------------------------
// Symmetrisch für Legacy- UND Neu-Quellen. Neu-Quellen tragen `packageKeys` (autoritativ);
// Legacy-Quellen tragen Alt-Katalog-Merkmale (party/regional/themeTerms/committee/type).
// Explizites source.coverage übersteuert die Ableitung. Rückgabe: Sets committees/parties/
// topics/regions + base (institutionelle Grundversorgung).
const PACKAGE_COVERAGE = {
  "bund-basis": { base: true },
  "arbeit-und-soziales": { committees: ["arbeit-und-soziales"], topics: ["soziales", "arbeit", "rente", "pflege", "buergergeld", "mindestlohn", "arbeitsmarkt"] },
  "die-linke-bund": { parties: ["linke"] },
  "regional-niedersachsen": { regions: ["niedersachsen"] },
  "berlin-basis": { regions: ["berlin"], base: true },
  "brandenburg-basis": { regions: ["brandenburg"], base: true }
};

function deriveSourceCoverage(source = {}) {
  const cov = { committees: new Set(), parties: new Set(), topics: new Set(), regions: new Set(), base: false };
  const add = (set, vals) => { for (const v of toArr(vals)) { const n = norm(v); if (n) set.add(n); } };

  // 0) Explizite Abdeckung hat Vorrang (Test/Katalog kann sie mitgeben).
  if (source.coverage && typeof source.coverage === "object") {
    add(cov.committees, source.coverage.committees);
    add(cov.parties, (source.coverage.parties || []).map((p) => normalizeParty(p)));
    add(cov.topics, source.coverage.topics);
    add(cov.regions, source.coverage.regions);
    if (source.coverage.base) cov.base = true;
  }

  // 1) Neu-Quellen: packageKeys sind die autoritative Abdeckungswahrheit.
  for (const key of toArr(source.packageKeys)) {
    const map = PACKAGE_COVERAGE[String(key || "").toLowerCase()];
    if (!map) continue;
    if (map.base) cov.base = true;
    add(cov.committees, (map.committees || []).map((c) => normalizeCommittee(c)));
    add(cov.parties, (map.parties || []).map((p) => normalizeParty(p)));
    add(cov.topics, map.topics);
    add(cov.regions, map.regions);
  }

  // 2) Legacy-Merkmale.
  const category = source.category || model.categorizeSource(source);
  const entityType = model.entityTypeForLegacy(source.type);
  // Institutionelle Grundversorgung: Parlament/Regierung/Ministerium/Behörde/Ausschuss/amtlich.
  if (["parliament", "government", "ministry", "authority", "committee", "statistical_office"].includes(entityType) || category === "offiziell") {
    cov.base = true;
  }
  // Ausschuss.
  add(cov.committees, toArr(source.committee).concat(toArr(source.committees)).map((c) => normalizeCommittee(c)));
  // Partei/Fraktion.
  if (source.party) add(cov.parties, [normalizeParty(source.party)]);
  if (category === "partei_fraktion" && source.name) add(cov.parties, [normalizeParty(source.name)]);
  // Region.
  if (source.state) add(cov.regions, [source.state]);
  if (source.regional || category === "regional" || entityType === "other_institution" && source.regional) {
    // Regionalname aus dem Quellennamen (best effort) — nur wenn als regional markiert.
    add(cov.regions, toArr(source.regions));
  }
  add(cov.regions, toArr(source.regions));
  // Themen.
  add(cov.topics, toArr(source.themeTerms));
  add(cov.topics, toArr(source.topics));
  return cov;
}

// Deckt IRGENDEINE Quelle der Seite einen Bedarfswert ab? Gibt {covered, byGoogleNewsOnly}.
// covered = mind. eine Quelle trägt den Wert. byGoogleNewsOnly = ALLE deckenden Quellen sind
// Google-News-Aggregatoren (kritisch: keine echte Herausgeber-Versorgung).
function coversNeed(sources, dimension, needValue) {
  const need = norm(dimension === "parties" ? normalizeParty(needValue)
    : dimension === "committees" ? normalizeCommittee(needValue) : needValue);
  if (!need) return { covered: false, byGoogleNewsOnly: false };
  let covered = false, nonGoogle = 0, googleOnly = 0;
  for (const s of sources) {
    const cov = deriveSourceCoverage(s);
    const set = cov[dimension];
    if (!set) continue;
    let hit = false;
    for (const val of set) { if (val === need || matchesAtWordStart(val, need) || matchesAtWordStart(need, val)) { hit = true; break; } }
    if (!hit) continue;
    covered = true;
    if (model.isGoogleNewsUrl(primaryUrlOf(s))) googleOnly += 1; else nonGoogle += 1;
  }
  return { covered, byGoogleNewsOnly: covered && nonGoogle === 0 && googleOnly > 0 };
}

// --- Bedarfe eines Profils ableiten --------------------------------------------------------
// Ehrlich aus den Profilfeldern (nicht nur aus vorhandenen Paketen): so werden echte
// Versorgungslücken sichtbar, auch wenn (noch) kein Paket existiert.
function profileNeeds(profile = {}) {
  const committees = uniq(toArr(profile.committees).concat(toArr(profile.committee)).map((c) => normalizeCommittee(c)).filter(Boolean));
  const parties = uniq(toArr(profile.party).concat(toArr(profile.faction), toArr(profile.partei), toArr(profile.fraktion)).map((p) => normalizeParty(p)).filter(Boolean));
  const topics = uniq(toArr(profile.focusTopics).concat(toArr(profile.themen), toArr(profile.fachpolitische_schwerpunkte)).map(norm).filter(Boolean));
  const regions = uniq(
    toArr(profile.state).concat(toArr(profile.bundesland), toArr(profile.constituency), toArr(profile.wahlkreis), toArr(profile.regionalInterests), toArr(profile.regionale_interessen))
      .map(norm).filter((r) => r && r.length >= 3)
  );
  return { committees, parties, topics, regions };
}

// --- Metriken einer Ergebnisseite (Aufgabe 4) ----------------------------------------------
// referenceCount (optional): Bezugsgröße für den Versorgungsgrad (z. B. Legacy-Quellenzahl).
function computeSourceMetrics(sources = [], opts = {}) {
  const list = (sources || []).filter(Boolean);
  const classes = list.map(classifySource);
  const anzahlQuellen = list.length;
  const anzahlPrimaerquellen = classes.filter((c) => c.tier === "primaer").length;
  const anzahlSekundaerquellen = classes.filter((c) => c.tier === "sekundaer").length;
  const googleNews = classes.filter((c) => c.isGoogleNews).length;
  const googleNewsAnteil = anzahlQuellen ? Math.round((googleNews / anzahlQuellen) * 1000) / 1000 : 0;
  const durchschnittlicheQuellenqualitaet = anzahlQuellen
    ? Math.round((classes.reduce((s, c) => s + c.quality, 0) / anzahlQuellen) * 1000) / 1000 : 0;

  const health = { gesund: 0, defekt: 0, unbekannt: 0, inaktiv: 0 };
  for (const c of classes) health[c.health] = (health[c.health] || 0) + 1;
  const gesundheitsstatus = health.defekt > 0 ? "beeintraechtigt"
    : (anzahlQuellen === 0 ? "leer" : (health.gesund > 0 ? "gesund" : "unbekannt"));

  // Redundanz: Quellen, die dieselbe normalisierte Abruf-URL teilen (echte Dubletten).
  const urlSeen = new Map();
  let doppelte = 0;
  for (const s of list) {
    const key = model.normalizeUrl(primaryUrlOf(s));
    if (!key) continue;
    if (urlSeen.has(key)) doppelte += 1; else urlSeen.set(key, s.id);
  }
  const redundanz = anzahlQuellen ? Math.round((doppelte / anzahlQuellen) * 1000) / 1000 : 0;

  // Coverage/Versorgungsgrad: Anteil der Profilbedarfe, die von ≥1 Quelle abgedeckt sind.
  // + kritische Versorgungslücken (unversorgte Pflichtbedarfe / Google-News-Alleinversorgung).
  const needs = opts.profile ? profileNeeds(opts.profile) : (opts.needs || { committees: [], parties: [], topics: [], regions: [] });
  const coverageDetail = evaluateCoverage(list, needs);
  const versorgungsgrad = coverageDetail.versorgungsgrad;

  return {
    anzahlQuellen,
    anzahlPrimaerquellen,
    anzahlSekundaerquellen,
    googleNewsQuellen: googleNews,
    googleNewsAnteil,
    durchschnittlicheQuellenqualitaet,
    gesundheit: health,
    gesundheitsstatus,
    redundanz,
    doppelteWege: doppelte,
    coverage: versorgungsgrad,
    versorgungsgrad,
    coverageDetail,
    kritischeVersorgungsluecken: coverageDetail.kritischeLuecken.length,
    // Versorgungsgrad relativ zu einer Referenzquellenzahl (z. B. Legacy) — ehrlich null,
    // wenn keine Referenz gegeben ist.
    quellenVersorgungsgrad: Number.isFinite(Number(opts.referenceCount)) && Number(opts.referenceCount) > 0
      ? Math.round((anzahlQuellen / Number(opts.referenceCount)) * 1000) / 1000 : null
  };
}

// Coverage je Dimension + kritische Lücken. Kritisch = unversorgter Pflichtbedarf
// (Ausschuss/Partei des Mandats) ODER ein nur durch Google News abgedeckter Bedarf.
function evaluateCoverage(sources, needs) {
  const dims = [
    { key: "committees", label: "ausschuss", kritisch: true },
    { key: "parties", label: "partei", kritisch: true },
    { key: "topics", label: "thema", kritisch: false },
    { key: "regions", label: "region", kritisch: false }
  ];
  const perDimension = {};
  const kritischeLuecken = [];
  const googleNewsAlleinversorgung = [];
  let needTotal = 0, coveredTotal = 0;
  for (const d of dims) {
    const values = needs[d.key] || [];
    const covered = [], luecken = [];
    for (const v of values) {
      const r = coversNeed(sources, d.key, v);
      needTotal += 1;
      if (r.covered) coveredTotal += 1;
      if (r.covered) covered.push(v); else luecken.push(v);
      if (!r.covered && d.kritisch) kritischeLuecken.push({ dimension: d.label, wert: v, grund: "unversorgt" });
      if (r.byGoogleNewsOnly) {
        googleNewsAlleinversorgung.push({ dimension: d.label, wert: v });
        if (d.kritisch) kritischeLuecken.push({ dimension: d.label, wert: v, grund: "nur-google-news" });
      }
    }
    perDimension[d.key] = { bedarf: values.length, abgedeckt: covered.length, luecken, gedeckt: covered };
  }
  const versorgungsgrad = needTotal ? Math.round((coveredTotal / needTotal) * 1000) / 1000 : 1;
  return { versorgungsgrad, needTotal, coveredTotal, perDimension, kritischeLuecken, googleNewsAlleinversorgung };
}

// --- Aufgabe 1: Shadow-Berechnung für EIN Mandat -------------------------------------------
// Berechnet Legacy- und Neu-Ergebnis UNABHÄNGIG voneinander (beide bekommen dieselben
// Profil-Bedarfe als Bezug). Verändert NICHTS am sichtbaren Verhalten.
function computeMandateShadow({ profile = {}, legacySources = [], newSources = [], orphanClassification = {}, consolidationBases = null } = {}) {
  const mandateId = String(profile.id || profile.user_id || profile.politicianId || "").trim() || null;
  const legacy = (legacySources || []).filter(Boolean);
  const neu = (newSources || []).filter(Boolean);
  const legacyMetrics = computeSourceMetrics(legacy, { profile });
  const newMetrics = computeSourceMetrics(neu, { profile, referenceCount: legacy.length });
  const supply = compareSupply({
    altSourceIds: legacy.map((s) => s.id),
    newSourceIds: neu.map((s) => s.id),
    orphanClassification,
    consolidationBases
  });
  return {
    mandateId,
    parliamentType: profile.parliament || profile.parliamentType || null,
    needs: profileNeeds(profile),
    resolvedPackages: resolveProfilePackages(profile),
    legacy: { sourceIds: legacy.map((s) => s.id), metrics: legacyMetrics },
    neu: { sourceIds: neu.map((s) => s.id), metrics: newMetrics },
    supply
  };
}

// --- Aufgabe 2: automatischer Vergleich (13 Dimensionen) -----------------------------------
// Jede Dimension: { dimension, legacy, neu, verdict, detail }. verdict ∈
// identisch | besser | schlechter | abweichung (Richtung immer aus Sicht der NEUEN Plattform).
function compareMandate(shadow) {
  const L = shadow.legacy.metrics, N = shadow.neu.metrics;
  const rows = [];
  const cmpNum = (dim, l, n, higherIsBetter, detail) => {
    let verdict;
    if (l === n) verdict = "identisch";
    else if ((n > l) === higherIsBetter) verdict = "besser";
    else verdict = "schlechter";
    rows.push({ dimension: dim, legacy: l, neu: n, verdict, detail: detail || "" });
  };

  // 1) gewählte Quellen (Mengenvergleich).
  rows.push({
    dimension: "gewaehlteQuellen",
    legacy: shadow.legacy.sourceIds.length, neu: shadow.neu.sourceIds.length,
    verdict: shadow.supply.onlyAlt.length === 0 && shadow.supply.onlyNew.length === 0 ? "identisch" : "abweichung",
    detail: `${shadow.supply.bothCount} gemeinsam, ${shadow.supply.onlyAlt.length} nur Legacy, ${shadow.supply.onlyNew.length} nur Neu.`
  });
  // 2) Quellenanzahl.
  cmpNum("quellenanzahl", L.anzahlQuellen, N.anzahlQuellen, true);
  // 3) Gewichtung (Primärquellen-Anteil — höher = besser).
  const primShare = (m) => m.anzahlQuellen ? Math.round((m.anzahlPrimaerquellen / m.anzahlQuellen) * 1000) / 1000 : 0;
  cmpNum("gewichtung", primShare(L), primShare(N), true, "Primärquellen-Anteil (höher = mehr amtliche Belege).");
  // 4) Gesundheit (Anteil gesunder Quellen — höher = besser; defekte senken).
  const healthScore = (m) => m.anzahlQuellen ? Math.round(((m.gesundheit.gesund) / m.anzahlQuellen) * 1000) / 1000 : 0;
  cmpNum("gesundheit", healthScore(L), healthScore(N), true, `Legacy defekt=${L.gesundheit.defekt}, Neu defekt=${N.gesundheit.defekt}.`);
  // 5) Coverage / Versorgungsgrad.
  cmpNum("coverage", L.versorgungsgrad, N.versorgungsgrad, true, "Anteil abgedeckter Profilbedarfe.");
  // 6) fehlende Quellen (unerklärte Wegfälle — weniger = besser).
  rows.push({
    dimension: "fehlendeQuellen",
    legacy: 0, neu: shadow.supply.onlyAltUnexplained.length,
    verdict: shadow.supply.onlyAltUnexplained.length === 0 ? "identisch" : "schlechter",
    detail: shadow.supply.onlyAltUnexplained.length
      ? `${shadow.supply.onlyAltUnexplained.length} Legacy-Quelle(n) ohne Erklärung nicht im Neu-Plan.` : "Keine unerklärten Wegfälle."
  });
  // 7) Duplikate / Redundanz (niedriger = besser).
  cmpNum("duplikate", L.redundanz, N.redundanz, false, `Legacy ${L.doppelteWege}, Neu ${N.doppelteWege} doppelte Wege.`);
  // 8) Google-News-Abhängigkeit (niedriger = besser).
  cmpNum("googleNewsAbhaengigkeit", L.googleNewsAnteil, N.googleNewsAnteil, false);
  // 9) Versorgungslücken (kritische — weniger = besser).
  cmpNum("versorgungsluecken", L.kritischeVersorgungsluecken, N.kritischeVersorgungsluecken, false);
  // 10-13) Themen-/Ausschuss-/Partei-/Regionalabdeckung.
  const dimCov = (key) => (m) => {
    const d = m.coverageDetail.perDimension[key] || { bedarf: 0, abgedeckt: 0 };
    return d.bedarf ? Math.round((d.abgedeckt / d.bedarf) * 1000) / 1000 : 1;
  };
  cmpNum("themenabdeckung", dimCov("topics")(L), dimCov("topics")(N), true);
  cmpNum("ausschussabdeckung", dimCov("committees")(L), dimCov("committees")(N), true);
  cmpNum("parteiabdeckung", dimCov("parties")(L), dimCov("parties")(N), true);
  cmpNum("regionalabdeckung", dimCov("regions")(L), dimCov("regions")(N), true);

  const besser = rows.filter((r) => r.verdict === "besser").map((r) => r.dimension);
  const schlechter = rows.filter((r) => r.verdict === "schlechter").map((r) => r.dimension);
  const identisch = rows.filter((r) => r.verdict === "identisch").map((r) => r.dimension);
  const abweichung = rows.filter((r) => r.verdict === "abweichung").map((r) => r.dimension);
  return { dimensions: rows, besser, schlechter, identisch, abweichung };
}

// --- Aufgabe 3: Difference-Report (keine Black Box) ----------------------------------------
// Für jede Berechnung: identisch / besser / schlechter / fehlende Quelle / zusätzlich gefundene
// Quelle / WARUM sie sich unterscheiden. Jeder Unterschied trägt eine Begründung.
function buildDifferenceReport(shadow, comparison) {
  const cmp = comparison || compareMandate(shadow);
  const begruendungen = [];
  for (const r of cmp.dimensions) {
    if (r.verdict === "identisch") continue;
    begruendungen.push({
      dimension: r.dimension,
      richtung: r.verdict,
      legacy: r.legacy, neu: r.neu,
      warum: erklaereUnterschied(r, shadow)
    });
  }
  return {
    mandateId: shadow.mandateId,
    wasWaereIdentisch: cmp.identisch,
    wasWaereBesser: cmp.besser,
    wasWaereSchlechter: cmp.schlechter,
    welcheQuelleFehlt: shadow.supply.onlyAltUnexplained.map((e) => e.id),
    welcheQuelleFehltErklaert: shadow.supply.onlyAltExplained.map((e) => ({ id: e.id, grund: e.reason })),
    welcheQuelleZusaetzlich: shadow.supply.onlyNew.slice(),
    warumUnterschiede: begruendungen,
    blackBox: false
  };
}

function erklaereUnterschied(row, shadow) {
  switch (row.dimension) {
    case "gewaehlteQuellen":
      return `Neu wählt Quellen über Pakete/Referenzzählung (${(shadow.resolvedPackages.all || []).join(", ") || "keine"}) statt über den Alt-Katalog — ${shadow.supply.onlyNew.length} zusätzlich, ${shadow.supply.onlyAlt.length} nur Legacy.`;
    case "quellenanzahl":
      return row.neu < row.legacy ? "Globale URL-/ID-Dedup und Paketauflösung reduzieren die Wegezahl (weniger Doppel-Crawls)." : "Neu bindet zusätzliche Paket-Abrufwege ein.";
    case "gewichtung":
      return row.verdict === "besser" ? "Neu bündelt mehr amtliche Primärquellen je Paket." : "Neu enthält anteilig mehr Sekundär-/Aggregatorquellen.";
    case "gesundheit":
      return "Gesundheit misst den Anteil gesunder Wege; defekte (bot-gesperrte) Wege werden im Neu-Plan sichtbar als nicht ausführbar geführt.";
    case "coverage":
      return "Coverage = Anteil abgedeckter Profilbedarfe (Ausschuss/Partei/Thema/Region).";
    case "fehlendeQuellen":
      return row.neu ? "Unerklärte Legacy-Quellen ohne Paket-/Konsolidierungsbezug — echte Regressionsgefahr." : "Keine unerklärten Wegfälle.";
    case "duplikate":
      return "Redundanz = Anteil Quellen mit identischer normalisierter Abruf-URL.";
    case "googleNewsAbhaengigkeit":
      return row.verdict === "besser" ? "Neu ersetzt Google-News-Suchen durch kuratierte Herausgeber-Wege." : "Neu stützt sich anteilig stärker auf Google-News-Aggregation.";
    case "versorgungsluecken":
      return "Kritische Lücke = unversorgter Pflichtbedarf (Ausschuss/Partei) oder Google-News-Alleinversorgung.";
    case "themenabdeckung": case "ausschussabdeckung": case "parteiabdeckung": case "regionalabdeckung":
      return "Abdeckung je Dimension = Anteil der Profilbedarfe mit ≥1 deckender Quelle.";
    default:
      return "Unterschied aus der jeweiligen Berechnungsgrundlage.";
  }
}

// --- Aufgabe 8: Abbruchregeln --------------------------------------------------------------
// Die neue Plattform darf NIE automatisch aktiviert werden. Zusätzlich: sobald einer der
// harten Gründe zutrifft, MUSS Legacy gewinnen. Rückgabe: winner (immer "legacy" im Dark
// Launch), autoActivateNewAllowed (IMMER false), forceLegacy (Abbruch ausgelöst?),
// forceLegacyReasons[], wouldRecommend (was ohne Dark-Launch-Sperre ratsam wäre).
function evaluateAbortRules(shadow, comparison, opts = {}) {
  const cmp = comparison || compareMandate(shadow);
  const L = shadow.legacy.metrics, N = shadow.neu.metrics;
  const reasons = [];

  // 1) Coverage wird schlechter.
  if (N.versorgungsgrad < L.versorgungsgrad) {
    reasons.push({ regel: "coverage-schlechter", detail: `Versorgungsgrad Neu ${N.versorgungsgrad} < Legacy ${L.versorgungsgrad}.` });
  }
  // 2) Pflichtquellen fehlen (unerklärte Wegfälle, die real Dokumente liefern / unbekannt sind).
  if (shadow.supply.regression) {
    reasons.push({ regel: "pflichtquellen-fehlen", detail: shadow.supply.summary });
  }
  // Zusätzlich: kritische Wege ausdrücklich als Pflicht deklariert (opts.criticalLegacyIds).
  const criticalSet = new Set((opts.criticalLegacyIds || []).map(String));
  const fehlendKritisch = shadow.supply.onlyAltUnexplained.map((e) => e.id).filter((id) => criticalSet.has(String(id)));
  if (fehlendKritisch.length) {
    reasons.push({ regel: "pflichtquellen-fehlen", detail: `Kritische Pflichtquelle(n) fehlen im Neu-Plan: ${fehlendKritisch.join(", ")}.` });
  }
  // 3) Google News wäre alleinige Versorgung (ein Pflichtbedarf nur über Google News gedeckt).
  const gnAllein = N.coverageDetail.googleNewsAlleinversorgung.filter((g) => g.dimension === "ausschuss" || g.dimension === "partei");
  if (gnAllein.length) {
    reasons.push({ regel: "google-news-alleinversorgung", detail: `Pflichtbedarf nur über Google News gedeckt: ${gnAllein.map((g) => `${g.dimension}:${g.wert}`).join(", ")}.` });
  }
  // Gesamt-Google-News-Alleinversorgung (alle Neu-Quellen sind Aggregatoren, Legacy nicht).
  if (N.anzahlQuellen > 0 && N.googleNewsAnteil === 1 && L.googleNewsAnteil < 1) {
    reasons.push({ regel: "google-news-alleinversorgung", detail: "Der gesamte Neu-Plan besteht ausschließlich aus Google-News-Aggregation." });
  }
  // 4) Neue kritische Versorgungslücken (Neu hat mehr als Legacy).
  if (N.kritischeVersorgungsluecken > L.kritischeVersorgungsluecken) {
    reasons.push({ regel: "kritische-versorgungsluecke", detail: `Kritische Lücken Neu ${N.kritischeVersorgungsluecken} > Legacy ${L.kritischeVersorgungsluecken}.` });
  }

  const forceLegacy = reasons.length > 0;
  // Empfehlung OHNE die (immer geltende) Dark-Launch-Sperre — reine Diagnose:
  let wouldRecommend;
  if (forceLegacy) wouldRecommend = "legacy";
  else if (cmp.schlechter.length > cmp.besser.length) wouldRecommend = "legacy";
  else if (cmp.besser.length > cmp.schlechter.length) wouldRecommend = "neu";
  else wouldRecommend = "gleichwertig";

  return {
    winner: "legacy",              // im Dark Launch bleibt IMMER Legacy sichtbar
    autoActivateNewAllowed: false, // strukturell NIE — unabhängig vom Ergebnis
    forceLegacy,
    forceLegacyReasons: reasons,
    wouldRecommend
  };
}

// --- Aufgabe 5: Telemetrie (nur technische Kennzahlen, KEINE personenbezogenen Inhalte) -----
// Speichert Zeit, Mandats-ID, Anzahl Quellen, Dauer, Fehler, Warnungen, Abweichungen.
// Enthält NIE Namen, Quellentitel oder URLs.
function buildTelemetryRecord({ shadow, comparison, abort, nowMs = 0, durationMs = 0, errors = [], warnings = [] } = {}) {
  const cmp = comparison || compareMandate(shadow);
  const ab = abort || evaluateAbortRules(shadow, cmp);
  const record = {
    zeitpunktMs: Number(nowMs) || 0,
    mandatsId: shadow.mandateId,       // technischer Schlüssel, kein personenbezogener Inhalt
    anzahlQuellenLegacy: shadow.legacy.sourceIds.length,
    anzahlQuellenNeu: shadow.neu.sourceIds.length,
    dauerMs: Math.max(0, Number(durationMs) || 0),
    fehler: Array.isArray(errors) ? errors.length : Number(errors) || 0,
    warnungen: Array.isArray(warnings) ? warnings.length : Number(warnings) || 0,
    abweichungen: cmp.besser.length + cmp.schlechter.length + cmp.abweichung.length,
    forceLegacy: ab.forceLegacy,
    forceLegacyRegeln: ab.forceLegacyReasons.map((r) => r.regel),
    kritischeVersorgungsluecken: shadow.neu.metrics.kritischeVersorgungsluecken
  };
  // Fail-safe Selbstprüfung: der Datensatz darf keine offensichtlich personenbezogenen
  // Felder tragen. Wirft NIE — markiert nur (der Aufrufer kann die Warnung loggen).
  record._piiClean = telemetryIsPiiClean(record);
  return record;
}

// Erlaubte Telemetrie-Schlüssel (Allowlist). Alles andere gilt als potenziell personenbezogen.
const TELEMETRY_ALLOWED_KEYS = new Set([
  "zeitpunktMs", "mandatsId", "anzahlQuellenLegacy", "anzahlQuellenNeu", "dauerMs",
  "fehler", "warnungen", "abweichungen", "forceLegacy", "forceLegacyRegeln",
  "kritischeVersorgungsluecken", "_piiClean"
]);
function telemetryIsPiiClean(record) {
  for (const k of Object.keys(record)) {
    if (k === "_piiClean") continue;
    if (!TELEMETRY_ALLOWED_KEYS.has(k)) return false;
    const v = record[k];
    // Nur Skalare oder Arrays kurzer Regel-Slugs erlaubt — keine freien Textinhalte.
    if (Array.isArray(v)) {
      if (v.some((x) => typeof x !== "string" || x.length > 40 || /\s/.test(x))) return false;
    } else if (v !== null && typeof v !== "number" && typeof v !== "boolean" && typeof v !== "string") {
      return false;
    }
  }
  return true;
}

// --- Ein Mandat vollständig durch den Dark Launch fahren ------------------------------------
function runMandateDarkLaunch(input = {}) {
  const shadow = computeMandateShadow(input);
  const comparison = compareMandate(shadow);
  const differenceReport = buildDifferenceReport(shadow, comparison);
  const abort = evaluateAbortRules(shadow, comparison, { criticalLegacyIds: input.criticalLegacyIds });
  const telemetry = buildTelemetryRecord({
    shadow, comparison, abort,
    nowMs: input.nowMs || 0, durationMs: input.durationMs || 0,
    errors: input.errors || [], warnings: input.warnings || []
  });
  return { shadow, comparison, differenceReport, abort, telemetry };
}

// --- Aufgabe 7: Belastungstest / Batch über mehrere Mandate --------------------------------
// Führt viele Mandate parallel-fachlich (nacheinander, deterministisch) durch den Dark Launch.
function runDarkLaunchBatch(mandates = []) {
  const results = (mandates || []).filter(Boolean).map((m) => runMandateDarkLaunch(m));
  return { count: results.length, results };
}

// --- Aufgabe 6: interner Admin-Report (nicht öffentlich, reine Daten) -----------------------
// Legacy gegen neue Plattform über ALLE Mandate: wer wäre besser/schlechter versorgt, welche
// Quellen fehlen, welche Discovery-Regeln (Paketauflösung) greifen, welche Qualitätsregeln
// (Primär/Sekundär/Health/Google-News) greifen.
function buildDarkLaunchAdminReport(batch, opts = {}) {
  const results = (batch && batch.results) || [];
  const now = Number(opts.nowMs) || 0;

  const besser = [], schlechter = [], gleichwertig = [], forceLegacy = [];
  const fehlendeQuellen = new Map();     // id -> Anzahl Mandate
  const zusaetzlicheQuellen = new Map(); // id -> Anzahl Mandate
  const discoveryRegeln = new Map();     // Paket-Key -> Anzahl Mandate (welche Pakete greifen)
  const qualitaetsRegeln = { primaerBevorzugung: 0, defekteWegeSichtbar: 0, googleNewsReduktion: 0, dedupWirksam: 0 };
  const dimAgg = {}; // Dimension -> { besser, schlechter, identisch }

  for (const r of results) {
    const rec = { mandatsId: r.shadow.mandateId, wouldRecommend: r.abort.wouldRecommend, forceLegacy: r.abort.forceLegacy, besser: r.comparison.besser, schlechter: r.comparison.schlechter };
    if (r.abort.forceLegacy) forceLegacy.push({ mandatsId: r.shadow.mandateId, gruende: r.abort.forceLegacyReasons.map((x) => x.regel) });
    if (r.abort.wouldRecommend === "neu") besser.push(rec);
    else if (r.abort.wouldRecommend === "legacy") schlechter.push(rec);
    else gleichwertig.push(rec);

    for (const id of r.shadow.supply.onlyAltUnexplained.map((e) => e.id)) fehlendeQuellen.set(id, (fehlendeQuellen.get(id) || 0) + 1);
    for (const id of r.shadow.supply.onlyNew) zusaetzlicheQuellen.set(id, (zusaetzlicheQuellen.get(id) || 0) + 1);
    for (const key of r.shadow.resolvedPackages.all || []) discoveryRegeln.set(key, (discoveryRegeln.get(key) || 0) + 1);

    const L = r.shadow.legacy.metrics, N = r.shadow.neu.metrics;
    if (N.anzahlPrimaerquellen / Math.max(1, N.anzahlQuellen) > L.anzahlPrimaerquellen / Math.max(1, L.anzahlQuellen)) qualitaetsRegeln.primaerBevorzugung += 1;
    if (N.gesundheit.defekt > 0) qualitaetsRegeln.defekteWegeSichtbar += 1;
    if (N.googleNewsAnteil < L.googleNewsAnteil) qualitaetsRegeln.googleNewsReduktion += 1;
    if (N.redundanz < L.redundanz) qualitaetsRegeln.dedupWirksam += 1;

    for (const d of r.comparison.dimensions) {
      if (!dimAgg[d.dimension]) dimAgg[d.dimension] = { besser: 0, schlechter: 0, identisch: 0, abweichung: 0 };
      dimAgg[d.dimension][d.verdict] = (dimAgg[d.dimension][d.verdict] || 0) + 1;
    }
  }

  const sortMap = (m) => [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).map(([id, count]) => ({ id, mandate: count }));
  return {
    generatedAtMs: now,
    intern: true,               // NICHT öffentlich
    autoActivateNewAllowed: false,
    mandateGesamt: results.length,
    besserVersorgt: besser,
    schlechterVersorgt: schlechter,
    gleichwertig,
    forceLegacy,
    fehlendeQuellen: sortMap(fehlendeQuellen),
    zusaetzlicheQuellen: sortMap(zusaetzlicheQuellen),
    discoveryRegeln: sortMap(discoveryRegeln),
    qualitaetsRegeln,
    dimensionen: dimAgg,
    zusammenfassung: {
      besser: besser.length, schlechter: schlechter.length, gleichwertig: gleichwertig.length,
      forceLegacy: forceLegacy.length,
      // Gesamt-Urteil: darf die neue Plattform als GLEICH GUT ODER BESSER gelten? (Nur Diagnose.)
      neuMindestensGleichwertig: schlechter.length === 0 && forceLegacy.length === 0
    }
  };
}

module.exports = {
  darkLaunchMode,
  darkLaunchEnabled,
  classifySource,
  deriveSourceCoverage,
  profileNeeds,
  computeSourceMetrics,
  evaluateCoverage,
  computeMandateShadow,
  compareMandate,
  buildDifferenceReport,
  evaluateAbortRules,
  buildTelemetryRecord,
  telemetryIsPiiClean,
  runMandateDarkLaunch,
  runDarkLaunchBatch,
  buildDarkLaunchAdminReport,
  PACKAGE_COVERAGE
};
