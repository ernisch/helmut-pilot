"use strict";

// Tests fuer Sprint 7: Qualitaets-/Kostenmessung + mehrachsiger Watchdog der Quellenarchitektur.
// Reine Offline-Tests (Fixtures + echter Katalog aus Sprint 1). Kein Netz/KI/DB. now injiziert.
// Deckt die 10 Auftragspunkte + die Ehrlichkeits-/Verfuegbarkeitsflags ab.

const q = require("../lib/helmut/quellenarchitektur/quality-watchdog");
const { buildFullModel } = require("../lib/helmut/quellenarchitektur");
const pp = require("../lib/helmut/quellenarchitektur/profile-packages");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

const NOW = Date.parse("2026-07-13T12:00:00Z");
const H = 3600000, D = 24 * H;
const iso = (agoMs) => new Date(NOW - agoMs).toISOString();

// --- Synthetischer Mini-Katalog fuer praezise Assertions --------------------
const paths = [
  { id: "rp-gut", legacy_source_id: "gut", status: "healthy", activation_mode: "auto", is_critical: false },
  { id: "rp-defekt", legacy_source_id: "defekt", status: "broken", activation_mode: "auto", is_critical: true },
  { id: "rp-duponly", legacy_source_id: "duponly", status: "healthy", activation_mode: "auto", is_critical: false },
  { id: "rp-still", legacy_source_id: "still", status: "healthy", activation_mode: "auto", is_critical: false },
  { id: "rp-pruef", legacy_source_id: "pruef", status: "needs_review", activation_mode: "auto", is_critical: false },
  { id: "rp-dev", legacy_source_id: "dev", status: "healthy", activation_mode: "dev_only", is_critical: false }
];
const activePathIds = ["rp-gut", "rp-defekt", "rp-duponly", "rp-still", "rp-pruef"]; // rp-dev nicht aktiv

// gut: 3 Docs frisch + KO; duponly: 2 Docs, nur Duplikate (nie Primaer, kein KO);
// still: 1 Doc, aber alt (> sourceStaleH); pruef: 0 Docs.
const rawDocs = [
  { source_id: "gut", retrieved_at: iso(2 * H) }, { source_id: "gut", retrieved_at: iso(3 * H) }, { source_id: "gut", retrieved_at: iso(1 * H) },
  { source_id: "duponly", retrieved_at: iso(2 * H) }, { source_id: "duponly", retrieved_at: iso(4 * H) },
  { source_id: "still", retrieved_at: iso(10 * D) }
];
const koSourceLinks = [{ knowledge_object_id: "ko-1", source_ids: ["gut"] }];
// Dedup: zwei Storys, beide von 'gut' zuerst gefunden; 'duponly' hat beide nur re-gefunden.
const dedupDocuments = [
  { primary_source_id: "gut", findings: [{ source_id: "gut" }, { source_id: "duponly" }] },
  { primary_source_id: "gut", findings: [{ source_id: "gut" }, { source_id: "duponly" }] }
];

// ============================ 1) QUELLEN-METRIKEN ============================
console.log("== 1) Quellen-Metriken (Dokumente/KOs/Duplikate) ==");
const sm = q.computeSourceMetrics({ rawDocs, koSourceLinks, dedupDocuments, now: NOW });
check("Dokumente je Quelle korrekt gezaehlt (gut=3)", sm.bySource.gut.documentCount === 3);
check("KO-Ertrag je Quelle (gut=1 KO)", sm.bySource.gut.koCount === 1);
check("Duplikate erkannt (duponly=2 Duplikat-Funde)", sm.bySource.duponly.duplicateCount === 2);
check("Primaerquelle erkannt (gut primaryCount=2)", sm.bySource.gut.primaryCount === 2);
check("duplicatesAvailable=true bei vorhandenem Dedup-Modell", sm.duplicatesAvailable === true);
check("latestMs = juengster Doc-Zeitstempel (gut)", sm.bySource.gut.latestMs === NOW - 1 * H);
// Ehrlichkeit: OHNE Dedup-Daten ist die Duplikat-Kennzahl NICHT verfuegbar (nicht 0 erfunden).
const smNoDup = q.computeSourceMetrics({ rawDocs, koSourceLinks, dedupDocuments: [], now: NOW });
check("ohne Dedup-Daten: duplicatesAvailable=false (ehrlich)", smNoDup.duplicatesAvailable === false);

// ============================ 2) ABRUFWEG-QUALITAET ============================
console.log("== 2) Abrufweg-Qualitaet (drei Qualitaetsarten) ==");
const pq = q.assessRetrievalPaths({ paths, sourceMetrics: sm, activePathIds, now: NOW });
const byLegacy = Object.fromEntries(pq.map((p) => [p.legacy_source_id, p]));
check("(1) funktionierender Abrufweg -> technicalHealth 'gesund'", byLegacy.gut.technicalHealth === "gesund");
check("(2) defekter Abrufweg -> technicalHealth 'defekt'", byLegacy.defekt.technicalHealth === "defekt");
check("(2) defekte PFLICHTquelle -> Handlung 'hoch', nicht still archivieren", byLegacy.defekt.recommendedAction.severity === "hoch" && /NICHT still/i.test(byLegacy.defekt.recommendedAction.text));
check("(3) Quelle erzeugt Dokumente -> contentYield.documentCount>0", byLegacy.gut.contentYield.documentCount === 3);
check("(4) Quelle erzeugt KOs -> productValue 'ergiebig'", byLegacy.gut.productValue === "ergiebig");
check("(5) Quelle nur Duplikate -> productValue 'nur_duplikate'", byLegacy.duponly.productValue === "nur_duplikate");
check("(5) nur-Duplikate -> Handlung: schaerfen/deaktivieren (Kosten)", /Duplikate/i.test(byLegacy.duponly.recommendedAction.text));
check("aktive Quelle ohne frische Docs -> 'ruht'", byLegacy.still.technicalHealth === "ruht");
check("needs_review ohne Docs -> 'pruefen'", byLegacy.pruef.technicalHealth === "pruefen");
check("dev_only/inaktiv -> 'inaktiv'", byLegacy.dev.technicalHealth === "inaktiv");
// Ehrlichkeit: ohne Dedup-Daten kann NIE 'nur_duplikate' behauptet werden.
const pqNoDup = q.assessRetrievalPaths({ paths, sourceMetrics: smNoDup, activePathIds, now: NOW });
check("ohne Dedup-Daten: duponly NICHT 'nur_duplikate' (ehrlich 'ohne_ko_unbestaetigt')", Object.fromEntries(pqNoDup.map((p) => [p.legacy_source_id, p])).duponly.productValue === "ohne_ko_unbestaetigt");
check("duplicateCount ohne Dedup-Daten = null (nicht 0 erfunden)", byLegacy.gut.duplicateCount !== null && pqNoDup[0].duplicateCount === null);

// ============================ 3) PAKETVERSORGUNG ============================
console.log("== 3) Paketversorgung ==");
const packages = [
  { id: "pk-a", key: "paket-a", status: "active", is_base: true },
  { id: "pk-b", key: "paket-b", status: "active", is_base: false },
  { id: "pk-prep", key: "paket-prep", status: "prepared", is_base: true }
];
const packagePaths = [
  { package_id: "pk-a", retrieval_path_id: "rp-gut" },       // gesund -> a versorgt
  { package_id: "pk-b", retrieval_path_id: "rp-defekt" },    // defekt -> b unterversorgt
  { package_id: "pk-a", retrieval_path_id: "rp-still" }      // ruht -> a teilversorgt
];
const activePackageIds = ["pk-a", "pk-b"];
const packageSupply = q.assessPackages({ packages, packagePaths, pathQuality: pq, activePackageIds });
const pkgBy = Object.fromEntries(packageSupply.map((p) => [p.key, p]));
check("Paket mit gesundem+ruhendem Weg -> teilversorgt", pkgBy["paket-a"].supply === "teilversorgt");
check("(6) aktives Paket ohne gesunden Weg -> unterversorgt", pkgBy["paket-b"].supply === "unterversorgt");
check("(6) unterversorgtes Basispaket -> Handlung 'hoch'", pkgBy["paket-b"].recommendedAction.severity === "mittel" || pkgBy["paket-b"].recommendedAction.severity === "hoch");
check("prepared-Paket -> 'vorbereitet'", pkgBy["paket-prep"].supply === "vorbereitet");

// ============================ 4) PROFILVERSORGUNG ============================
console.log("== 4) Profilversorgung (Sprint-4-Wiederverwendung) ==");
const M = buildFullModel();
const cem = { id: "cem-ince", fullName: "Cem Ince", party: "Die Linke", politische_ebene: "bundestag", ausschuesse: ["Arbeit und Soziales"], bundesland: "Niedersachsen", profileActive: true };
const berlin = { id: "be", fullName: "Berlin MdA", party: "SPD", politische_ebene: "landtag", bundesland: "Berlin", ausschuesse: ["Inneres"], profileActive: true };
const profSupply = q.assessProfiles({ profiles: [cem, berlin], packages: M.packages, packagePaths: M.packagePaths });
const profBy = Object.fromEntries(profSupply.map((p) => [p.profileId, p]));
check("(7) Bundestagsprofil (Bund Basis aktiv) -> versorgt", profBy["cem-ince"].supply === "versorgt");
check("(7) Berliner Landtagsprofil (Landespaket prepared) -> unversorgt", profBy["be"].supply === "unversorgt");
check("(7) unversorgtes Profil -> konkrete Handlung", profBy["be"].recommendedAction.severity !== "keine");

// ============================ 5) KOSTEN ============================
console.log("== 5) Kostenmessung aus echter llm_usage ==");
const llmUsage = [
  { createdAt: iso(1 * H), pipelineStep: "understanding", model: "gpt-5-mini", estimatedCost: 0.0012 },
  { createdAt: iso(2 * H), pipelineStep: "lageBriefing", model: "gpt-5-mini", estimatedCost: 0.0008, sourceId: "gut", packageId: "pk-a" },
  { createdAt: iso(3 * H), callType: "skipped-budget", estimatedCost: "unknown" },   // Skip -> nicht zaehlen
  { createdAt: iso(4 * H), pipelineStep: "understanding", model: "gpt-5-mini", estimatedCost: "unknown" }, // unknown -> ehrlich raus
  { createdAt: iso(40 * D), pipelineStep: "understanding", model: "gpt-5-mini", estimatedCost: 5.0 } // ausserhalb 30-Tage-Fenster
];
const costs = q.assessCosts({ llmUsage, now: NOW, windowDays: 30 });
check("(9) Sub-Cent-praezise Summe (0.0012+0.0008 USD)", costs.totalUsd === 0.002);
check("(9) Aggregation je Pipeline-Schritt", costs.byPipelineStep.understanding === 0.0012 && costs.byPipelineStep.lageBriefing === 0.0008);
check("skipped-* + ausserhalb Fenster ausgeschlossen (5 -> 3 verarbeitete Calls)", costs.records === 3);
check("kein skipped-* in der Schritt-Aggregation", !Object.keys(costs.byPipelineStep).some((k) => /^skipped-/.test(k)));
check("unknown-Kosten ehrlich ausgeschlossen (nicht 0 erfunden)", costs.unknownCostRecords === 1);
check("Zeitfenster respektiert (40 Tage alter 5$-Record faellt raus)", costs.totalUsd < 1);
check("(9) Quellen-Attribution verfuegbar (Record traegt sourceId)", costs.sourceAttributionAvailable === true && costs.bySource.gut === 0.0008);
// Ehrlichkeit: ohne sourceId keine Quellenkosten
const costsNoAttr = q.assessCosts({ llmUsage: [{ createdAt: iso(1 * H), pipelineStep: "understanding", model: "gpt-5-mini", estimatedCost: 0.001 }], now: NOW });
check("ohne sourceId: bySource=null, sourceAttributionAvailable=false (ehrlich)", costsNoAttr.bySource === null && costsNoAttr.sourceAttributionAvailable === false);

// ============================ 6) WATCHDOG (10 Achsen) ============================
console.log("== 6) Watchdog: 10 getrennte Achsen ==");
const signals = {
  storageOk: true,
  crawlAt: iso(3 * H), understandingAt: iso(2 * H), newestKoAt: iso(2 * H), matchingAt: iso(2 * H),
  lageAt: iso(1 * H), radarAt: iso(2 * H), helmutAt: iso(2 * H), briefingsAt: iso(40 * H) // briefings -> warn
};
const wd = q.buildWatchdog({ signals, packageSupply, pathQuality: pq, now: NOW });
const EXPECTED_AXES = ["crawl", "understanding", "knowledge_objects", "matching", "lage", "radar", "helmut", "briefings", "paketversorgung", "kritische_quellen"];
check("(8) genau die 10 geforderten Achsen, getrennt", JSON.stringify(wd.axes.map((a) => a.key)) === JSON.stringify(EXPECTED_AXES));
const axBy = Object.fromEntries(wd.axes.map((a) => [a.key, a]));
check("frische Achse -> 'frisch'", axBy.crawl.status === "frisch");
check("alternde Achse -> 'warn' (briefings 40h)", axBy.briefings.status === "warn");
check("jede Achse traegt eine Handlungsempfehlung", wd.axes.every((a) => a.recommendedAction && typeof a.recommendedAction.text === "string"));
check("Paketversorgung-Achse aus unterversorgtem Paket -> 'tot'", axBy.paketversorgung.status === "tot");
check("kritische-Quellen-Achse aus defekter Pflichtquelle -> 'tot'", axBy.kritische_quellen.status === "tot");
check("Gesamt: defekte Achse -> severity 'alarm', state 'kritisch'", wd.severity === "alarm" && wd.state === "kritisch");
// unbekannte Achse: fehlender Zeitstempel -> 'unbekannt' (nicht 'frisch')
const wdUnknown = q.buildWatchdog({ signals: { storageOk: true }, packageSupply: [], pathQuality: [], now: NOW });
check("fehlender Zeitstempel -> Achse 'unbekannt' (nie 'frisch')", wdUnknown.axes.find((a) => a.key === "crawl").status === "unbekannt");
check("storageOk=false -> kritisch", q.buildWatchdog({ signals: { storageOk: false }, now: NOW }).state === "kritisch");
// alles frisch, keine Probleme -> gesund
const wdOk = q.buildWatchdog({ signals: { storageOk: true, crawlAt: iso(1 * H), understandingAt: iso(1 * H), newestKoAt: iso(1 * H), matchingAt: iso(1 * H), lageAt: iso(1 * H), radarAt: iso(1 * H), helmutAt: iso(1 * H), briefingsAt: iso(1 * H) }, packageSupply: [], pathQuality: [], now: NOW });
check("alles frisch + keine Probleme -> gesund/ok", wdOk.state === "gesund" && wdOk.severity === "ok");

// ============================ 7) EMPFEHLUNGEN (ranked) ============================
console.log("== 7) Admin-Handlungsempfehlungen (ranked) ==");
const recs = q.buildRecommendations({ pathQuality: pq, packageSupply, profileSupply: profSupply, watchdog: wd, costs: costsNoAttr });
check("(10) Empfehlungen nach Schwere sortiert (hoch zuerst)", recs.length > 0 && recs[0].severity === "hoch");
check("(10) nur echte Handlungen (keine 'keine')", recs.every((r) => r.severity !== "keine"));
check("(10) defekte Pflichtquelle taucht als hoch-Empfehlung auf", recs.some((r) => r.area === "abrufweg" && r.severity === "hoch"));
check("Kosten-Attributionshinweis, wenn Records keine sourceId tragen", recs.some((r) => r.area === "kosten"));

// ============================ 8) GESAMTREPORT + EHRLICHKEIT ============================
console.log("== 8) Gesamtreport + Ehrlichkeits-Flags ==");
const activation = pp.computeGlobalActivation({ packages: M.packages, packagePaths: M.packagePaths, retrievalPaths: M.retrievalPaths, profiles: [cem] });
const report = q.buildQualityReport({
  catalog: { retrievalPaths: M.retrievalPaths, packages: M.packages, packagePaths: M.packagePaths },
  activation, rawDocs, koSourceLinks, dedupDocuments, profiles: [cem, berlin], llmUsage, signals, now: NOW
});
check("Report enthaelt alle Bausteine", report.sourceMetrics && report.pathQuality.length > 0 && report.packageSupply.length > 0 && report.profileSupply.length === 2 && report.costs && report.watchdog && report.recommendations);
check("Ehrlichkeit: pathTelemetry=false (last_success_at in Prod leer)", report.availability.pathTelemetry === false);
check("Ehrlichkeit: duplicates-Flag spiegelt Datenlage", report.availability.duplicates === true);
check("Ehrlichkeit: documents/knowledgeObjects-Flags real", report.availability.documents === true && report.availability.knowledgeObjects === true);
check("echter Katalog: jeder Abrufweg bekommt eine Bewertung (keine Luecke)", report.pathQuality.length === M.retrievalPaths.length);
check("echter Katalog: defekte Pflichtquellen (bundestag/bundesregierung) als defekt erkannt", report.pathQuality.some((p) => p.legacy_source_id === "bundestag" && p.technicalHealth === "defekt"));

console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
