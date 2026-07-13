"use strict";

// Helmut — Quellenarchitektur · Sprint 8: Admin-Report (reine Reshaping-Logik).
//
// REINE, DETERMINISTISCHE LOGIK. Keine KI, kein Netz, kein Storage, KEIN Rendering.
// Formt die bereits gebauten Ergebnisse aus Sprint 1 (Katalog), Sprint 4 (Aktivierung/
// Profilversorgung) und Sprint 7 (Qualitäts-/Kosten-/Watchdog-Report) in die SECHS
// Admin-Ansichten um, die der Betreiber (Ein-Personen-Gründer) sofort versteht:
//   1. Länder und Pakete        2. Quellen und Abrufwege     3. Profile und Paketversorgung
//   4. Prüfbedarf               5. Quellendetail             6. Kosten und Produktnutzen
//
// EHRLICHKEIT (Auftrag): keine erfundenen Demozahlen. Wo eine Datengrundlage fehlt
// (neue Tabellen nicht migriert, Dedup/Telemetrie/Kostenattribution leer), wird der Wert
// als NICHT VERFÜGBAR markiert (available:false), nie geraten. Health-Anzeige kennt nur
// die drei ehrlichen Kübel gesund / defekt / unbekannt (+ inaktiv), solange keine echte
// Abrufweg-Telemetrie vorliegt.

const { LANDESMODUL_PFLICHTKLASSEN } = require("./seeds/packages");

function round6(x) { return x == null ? null : Number(Number(x).toFixed(6)); }
function bySeverity(a, b) { const r = { hoch: 0, mittel: 1, niedrig: 2, keine: 3 }; return (r[a.severity] ?? 3) - (r[b.severity] ?? 3); }

// Ehrliche Health-Anzeige: ohne echte Abrufweg-Telemetrie kennen wir nur gesund (frische
// Dokumente), defekt (Status broken) oder unbekannt (aktiv, aber kein bestätigendes Signal);
// inaktiv = pausiert/archiviert/dev_only/nicht aktiviert.
function healthBucket(pq) {
  if (pq.technicalHealth === "defekt") return "defekt";
  if (pq.technicalHealth === "gesund") return "gesund";
  if (pq.technicalHealth === "inaktiv") return "inaktiv";
  return "unbekannt"; // ruht/pruefen -> kein belastbares Signal -> ehrlich unbekannt
}

// Produktnutzen-Anzeige: erzeugt der Weg Nutzen (KO), nur Duplikate, oder ist es unklar?
function valueBucket(pq) {
  if (pq.productValue === "ergiebig") return "ergiebig";
  if (pq.productValue === "nur_duplikate") return "nur_duplikate";
  if (pq.productValue === "ohne_ko") return "ohne_ko";
  if (pq.productValue === "unbekannt") return "keine_dokumente";
  return "unbestaetigt"; // ohne_ko_unbestaetigt -> Datenlage nicht belastbar
}

function buildSourceAdminReport(inputs = {}) {
  const now = inputs.now || Date.now();
  const catalog = inputs.catalog || {};
  const activation = inputs.activation || {};
  const quality = inputs.qualityReport || {};
  const availability = quality.availability || { documents: false, knowledgeObjects: false, duplicates: false, costAttribution: false, pathTelemetry: false };

  const publishers = catalog.publishers || [];
  const paths = catalog.retrievalPaths || [];
  const packages = catalog.packages || [];
  const packagePaths = catalog.packagePaths || [];
  const geographies = catalog.geographies || [];
  const pubById = new Map(publishers.map((p) => [p.id, p]));
  const pathQualityById = new Map((quality.pathQuality || []).map((q) => [q.id, q]));
  const packageSupplyById = new Map((quality.packageSupply || []).map((p) => [p.id, p]));
  const packagesByGeo = new Map();
  for (const pk of packages) if (pk.geography_id) { if (!packagesByGeo.has(pk.geography_id)) packagesByGeo.set(pk.geography_id, []); packagesByGeo.get(pk.geography_id).push(pk); }

  // Migrationszustand: die neuen relationalen Tabellen sind heute NICHT migriert -> die
  // Struktur stammt aus dem Code-Modell (Vorschau), Kennzahlen aus Bestandsdaten.
  const migration = {
    newTablesMigrated: inputs.newTablesMigrated === true,
    note: inputs.newTablesMigrated === true
      ? "Neue Quellentabellen migriert."
      : "Neue Quellentabellen noch nicht migriert — Struktur aus dem Code-Modell (Vorschau), Kennzahlen aus Bestandsdaten."
  };

  // ---- View 1: Länder und Pakete ----
  const laender = geographies.filter((g) => g.level === "land").map((g) => {
    const pkgs = packagesByGeo.get(g.id) || [];
    const basePkg = pkgs.find((p) => p.is_base && p.political_level === "land");
    const anyPkg = basePkg || pkgs[0] || null;
    // Status aus dem Paket-LIFECYCLE (aktiv/vorbereitet), unabhängig von Laufzeit-Metriken:
    // „vorbereitet oder aktiv" ist eine strukturelle Aussage über das Landesmodul.
    let status;
    if (!anyPkg) status = "kein_modul";
    else if (anyPkg.status === "active") status = "aktiv";
    else status = "vorbereitet"; // prepared/draft
    // Pflichtklassen: required_classes des Landesmoduls minus abgedeckte. Klassen-Tagging an
    // Abrufwegen existiert noch nicht -> abgedeckt=0 -> alle als fehlend ausgewiesen (ehrlich).
    const required = (basePkg && basePkg.required_classes && basePkg.required_classes.length) ? basePkg.required_classes : [];
    const pflichtklassen = required.length
      ? { total: required.length, present: 0, missing: required.slice(), available: true }
      : { total: 0, present: 0, missing: [], available: anyPkg ? true : false };
    return { geography_id: g.id, name: g.name, status, hasPackage: !!anyPkg, packageKey: anyPkg ? anyPkg.key : null, pflichtklassen };
  });

  // Paket-Versorgung STRUKTURELL aus der Abrufweg-Health ableiten (nicht aus Metrik-Artefakten):
  // „unterversorgt" NUR, wenn alle Wege des Pakets defekt/inaktiv sind (z. B. beide Die-Linke-
  // Quellen broken). Enthält es unbekannte Wege (noch keine Metriken), ist es 'unbekannt', NICHT
  // fälschlich unterversorgt — sonst wären ohne Ingest alle Pakete „unterversorgt".
  const pathsByPkgId = new Map();
  for (const pp of packagePaths) { if (!pp || !pp.package_id) continue; if (!pathsByPkgId.has(pp.package_id)) pathsByPkgId.set(pp.package_id, []); pathsByPkgId.get(pp.package_id).push(pp.retrieval_path_id); }
  function pkgHealth(pkgId) {
    const ids = pathsByPkgId.get(pkgId) || [];
    let gesund = 0, defekt = 0, unbekannt = 0, inaktiv = 0;
    for (const id of ids) { const pq = pathQualityById.get(id); const h = pq ? healthBucket(pq) : "unbekannt"; if (h === "gesund") gesund++; else if (h === "defekt") defekt++; else if (h === "inaktiv") inaktiv++; else unbekannt++; }
    return { pathCount: ids.length, gesund, defekt, unbekannt, inaktiv };
  }
  function pkgSupply(pk, h) {
    if (pk.status === "prepared" || pk.status === "draft") return "vorbereitet";
    if (h.pathCount === 0) return "leer";
    if (h.gesund > 0 && h.defekt === 0 && h.unbekannt === 0) return "vollstaendig";
    if (h.gesund > 0) return "teilversorgt";
    if (h.defekt + h.inaktiv === h.pathCount) return "unterversorgt"; // alle Wege nicht nutzbar
    return "unbekannt"; // enthält unbekannte Wege -> nicht bestätigt (noch keine Metriken)
  }
  const pakete = packages.map((pk) => {
    const act = (activation.packageStatus || []).find((p) => p.id === pk.id) || {};
    const h = pkgHealth(pk.id);
    const supply = pkgSupply(pk, h);
    return {
      key: pk.key, name: pk.name, status: pk.status, is_base: pk.is_base === true,
      political_level: pk.political_level, geography_id: pk.geography_id,
      supply, pathCount: h.pathCount, healthyPathCount: h.gesund, defektPathCount: h.defekt, unknownPathCount: h.unbekannt,
      activation: act.activation || "inactive", refCount: act.refCount ?? 0,
      recommendedAction: (packageSupplyById.get(pk.id) || {}).recommendedAction || { severity: "keine", text: "Keine." }
    };
  });

  // ---- View 2 + 5: Quellen/Abrufwege (gruppiert je Herausgeber) + Detail ----
  const pkgKeyByPathId = new Map();
  for (const pp of packagePaths) {
    if (!pp || !pp.retrieval_path_id) continue;
    if (!pkgKeyByPathId.has(pp.retrieval_path_id)) pkgKeyByPathId.set(pp.retrieval_path_id, []);
    const pk = packages.find((x) => x.id === pp.package_id);
    if (pk) pkgKeyByPathId.get(pp.retrieval_path_id).push(pk.key);
  }
  const costBySource = (quality.costs && quality.costs.bySource) || null;

  const pathViews = paths.map((p) => {
    const pq = pathQualityById.get(p.id) || { technicalHealth: "unbekannt", productValue: "unbekannt", contentYield: { documentCount: 0 }, koCount: 0, duplicateCount: null, is_critical: p.is_critical === true, active: false, recommendedAction: { severity: "keine", text: "Keine." } };
    const pub = pubById.get(p.publisher_id) || null;
    const health = healthBucket(pq);
    const value = valueBucket(pq);
    const costUsd = costBySource ? round6(costBySource[p.legacy_source_id] || 0) : null;
    return {
      id: p.id, legacy_source_id: p.legacy_source_id, name: p.name, method: p.method,
      publisher: pub ? pub.name : null, publisherId: p.publisher_id,
      status: p.status, activation_mode: p.activation_mode, is_critical: pq.is_critical || p.is_critical === true,
      active: pq.active, health, value,
      documentCount: availability.documents ? (pq.contentYield && pq.contentYield.documentCount) || 0 : null,
      koCount: availability.knowledgeObjects ? pq.koCount : null,
      duplicateCount: pq.duplicateCount, // schon null wenn Dedup nicht verfügbar
      packages: pkgKeyByPathId.get(p.id) || [],
      cost: { available: !!costBySource, usd: costUsd },
      recommendedAction: pq.recommendedAction || { severity: "keine", text: "Keine." }
    };
  });

  const herausgeber = [];
  const byPub = new Map();
  for (const pv of pathViews) {
    const key = pv.publisherId || "unbekannt";
    if (!byPub.has(key)) { byPub.set(key, { publisherId: key, name: pv.publisher || "Unbekannt", paths: [] }); herausgeber.push(byPub.get(key)); }
    byPub.get(key).paths.push(pv);
  }
  herausgeber.sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const healthCounts = { gesund: 0, defekt: 0, unbekannt: 0, inaktiv: 0 };
  for (const pv of pathViews) healthCounts[pv.health] = (healthCounts[pv.health] || 0) + 1;

  // ---- View 3: Profile und Paketversorgung ----
  const profileVersorgung = (quality.profileSupply || []).map((p) => ({
    profileId: p.profileId, supply: p.supply, eligible: p.eligible, fullyActivated: p.fullyActivated,
    requiredPackages: p.requiredPackages || [], missingBasePackages: p.missingBasePackages || [],
    recommendedAction: p.recommendedAction || { severity: "keine", text: "Keine." }
  }));

  // ---- View 4: Prüfbedarf — nur KONKRETE, strukturell reale Probleme (Auftrag: keine
  // Rauschliste). Wichtig: solange keine Metriken vorliegen, sind „aktiv, aber keine
  // frischen Dokumente"-Hinweise KEIN echter Prüfbedarf (dieselbe Ursache: nichts migriert/
  // ingestet) — sie werden NICHT als N Einzelprobleme ausgewiesen, sondern erscheinen als
  // EIN Verfügbarkeitshinweis. Real und immer gültig: defekte Abrufwege (Status broken),
  // unterversorgte Pakete, unversorgte Profile; Nutzen-Probleme nur bei vorhandenen Daten.
  const pruefActions = [];
  for (const pv of pathViews) if (pv.health === "defekt") pruefActions.push({ area: "abrufweg", ref: pv.legacy_source_id, severity: pv.is_critical ? "hoch" : "mittel", text: pv.recommendedAction.text });
  for (const pk of pakete) if (pk.supply === "unterversorgt") pruefActions.push({ area: "paket", ref: pk.key, severity: pk.is_base ? "hoch" : "mittel", text: `Paket „${pk.key}“: alle ${pk.pathCount} Abrufwege defekt — Quellen ersetzen.` });
  for (const pr of profileVersorgung) if (pr.supply === "unversorgt") pruefActions.push({ area: "profil", ref: pr.profileId, severity: "mittel", text: pr.recommendedAction.text });
  if (availability.documents) {
    for (const pv of pathViews) if (pv.value === "nur_duplikate") pruefActions.push({ area: "nutzen", ref: pv.legacy_source_id, severity: "mittel", text: pv.recommendedAction.text });
  }
  const pruefbedarf = pruefActions;
  // Ehrliche Hinweise auf noch nicht verfügbare Messwerte (kein Alarm, nur Transparenz).
  const missingMetrics = [];
  if (!availability.documents) missingMetrics.push("Dokumente je Quelle (keine raw_documents geladen)");
  if (!availability.knowledgeObjects) missingMetrics.push("Knowledge Objects je Quelle (ko_document_links noch nicht ausgewertet)");
  if (!availability.duplicates) missingMetrics.push("Duplikate (Dedup-Ingest noch nicht verdrahtet)");
  if (!availability.pathTelemetry) missingMetrics.push("Abrufweg-Telemetrie (last_success_at leer)");
  if (!availability.costAttribution) missingMetrics.push("Kosten je Quelle (llm_usage ohne sourceId)");

  // ---- View 6: Kosten und Produktnutzen ----
  const costs = quality.costs || { totalUsd: 0, byPipelineStep: {}, byModel: {}, sourceAttributionAvailable: false, records: 0 };
  // „Kosten, aber kein Nutzen": Wege, die Dokumente/Kosten erzeugen, aber keinen KO-Nutzen
  // (nur_duplikate ODER ohne_ko). Real belegt aus dem Produktnutzen — auch ohne Kostenattribution.
  const kostenOhneNutzen = pathViews
    .filter((pv) => (pv.value === "nur_duplikate" || pv.value === "ohne_ko"))
    .map((pv) => ({ legacy_source_id: pv.legacy_source_id, name: pv.name, value: pv.value, cost: pv.cost, recommendedAction: pv.recommendedAction }));

  return {
    generatedAtMs: now,
    migration,
    availability,
    counts: {
      laenderAktiv: laender.filter((l) => l.status === "aktiv").length,
      laenderVorbereitet: laender.filter((l) => l.status === "vorbereitet").length,
      laenderKeinModul: laender.filter((l) => l.status === "kein_modul").length,
      paketeAktiv: pakete.filter((p) => p.activation === "active").length,
      paketeVorbereitet: pakete.filter((p) => p.status === "prepared").length,
      paketeUnterversorgt: pakete.filter((p) => p.supply === "unterversorgt").length,
      abrufwege: pathViews.length,
      abrufwegeGesund: healthCounts.gesund, abrufwegeDefekt: healthCounts.defekt,
      abrufwegeUnbekannt: healthCounts.unbekannt, abrufwegeInaktiv: healthCounts.inaktiv,
      profileVersorgt: profileVersorgung.filter((p) => p.supply === "versorgt").length,
      profileUnversorgt: profileVersorgung.filter((p) => p.supply === "unversorgt").length,
      pruefbedarf: pruefbedarf.length,
      kostenOhneNutzen: kostenOhneNutzen.length
    },
    views: {
      laenderPakete: { laender, pakete },
      quellenAbrufwege: { herausgeber, healthCounts, pathCount: pathViews.length },
      profileVersorgung,
      pruefbedarf: { actions: pruefbedarf.sort(bySeverity), missingMetrics },
      quellendetail: { paths: pathViews },
      kostenNutzen: { costs, kostenOhneNutzen }
    }
  };
}

module.exports = { buildSourceAdminReport, healthBucket, valueBucket, LANDESMODUL_PFLICHTKLASSEN };
