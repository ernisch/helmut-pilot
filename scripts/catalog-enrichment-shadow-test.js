"use strict";

// Sprint 5 · Shadow-Wirkung der Katalog-Befuellung (A/B, reproduzierbar). REINE LOGIK.
// Vergleicht den Katalog OHNE Ministeriums-Tagging (Sprint-4-Stand) gegen den getaggten Sprint-5-
// Katalog — beide durch dieselbe (unveraenderte) Zuweisung. Deckt ab: Google-News-Reduktion,
// neue Primaerquellen, Parteien/Ausschuesse/Regionen versorgt, neue Partei/Region ehrlich als
// Luecke, Determinismus.

const shadow = require("../lib/helmut/quellenarchitektur/shadow");
const report = require("../lib/helmut/quellenarchitektur/shadow-report");
const master = require("../lib/helmut/quellenarchitektur/master");
const F = require("./shadow-fixtures");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const enriched = master.buildMasterCatalog().records;
// Sprint-4-Simulation: dieselben Records, aber OHNE die Ministeriums-Politikfeld-Tags.
const baseline = enriched.map((r) => (r.source_type === "ministerium" ? { ...r, topics: [] } : r));

// Repraesentative Betriebstelemetrie (technisch) fuer aktive Quellen — isoliert die Katalogqualitaet.
const telemetry = enriched.filter((r) => r.review_status === "active").map((r) => ({ source_id: r.id, status: "ok", finished_at: "2026-07-20T10:00:00Z" }));
const profiles = F.representativeMandates().map((m) => m.profile);

function run(records) {
  const ctx = shadow.buildShadowContext({ catalog: { records }, health: { telemetry } });
  return report.buildInternalReport(shadow.runShadowBatch(profiles, ctx, {}), { label: "ab" });
}
const repBase = run(baseline);
const repEnr = run(enriched);

// 1) Google-News-Abhaengigkeit MESSBAR reduziert.
check("1 Google-News-Abhaengigkeit sinkt durch das Tagging",
  repEnr.suchanbieterAbhaengigkeitDurchschnitt < repBase.suchanbieterAbhaengigkeitDurchschnitt,
  `base=${repBase.suchanbieterAbhaengigkeitDurchschnitt} enriched=${repEnr.suchanbieterAbhaengigkeitDurchschnitt}`);
// 2) Suchanbieter-Alleinversorgung der Pflichtbedarfe verschwindet.
check("2 keine Suchanbieter-Alleinversorgung mehr (Google News nie einzige Pflichtquelle)",
  repEnr.mandateMitSuchanbieterAlleinversorgung === 0 && repBase.mandateMitSuchanbieterAlleinversorgung > 0,
  `base=${repBase.mandateMitSuchanbieterAlleinversorgung} enriched=${repEnr.mandateMitSuchanbieterAlleinversorgung}`);
// 3) mehr Mandate als 'besser' klassifiziert, weniger blockiert.
check("3 deutlich mehr Mandate versorgt (besser hoch, blockiert runter)",
  repEnr.besser > repBase.besser && repEnr.blockiert < repBase.blockiert,
  `base besser=${repBase.besser}/blk=${repBase.blockiert} enriched besser=${repEnr.besser}/blk=${repEnr.blockiert}`);

// 4) Neue Primaerquelle deckt einen Ausschussbedarf (nicht-Suchanbieter).
const ctxEnr = shadow.buildShadowContext({ catalog: { records: enriched }, health: { telemetry } });
const gesundheit = shadow.runOne({ id: "t", partei: "SPD", fraktion: "SPD", ausschuesse: ["Gesundheit"] }, ctxEnr, {}).shadow.neu;
const gesundheitPrimary = gesundheit.sources.filter((s) => (s.auswahlgrund || []).some((r) => (r.matched || []).includes("gesundheit")) && !s.suchanbieter);
check("4 Ausschuss 'Gesundheit' erhaelt eine PRIMAERE (nicht-Suchanbieter) Quelle",
  gesundheitPrimary.some((s) => s.versorgungsebene.startsWith("primaer")), JSON.stringify(gesundheitPrimary.map((s) => s.id + ":" + s.versorgungsebene)));

// 5) verschiedene Parteien versorgt.
const linke = shadow.runOne({ id: "p1", partei: "Die Linke", fraktion: "Die Linke" }, ctxEnr, {}).shadow.neu;
const spd = shadow.runOne({ id: "p2", partei: "SPD", fraktion: "SPD" }, ctxEnr, {}).shadow.neu;
check("5 verschiedene Parteien werden versorgt (Linke + SPD je eigene Parteiquelle)",
  linke.sources.some((s) => s.id === "seed-party-linke") && spd.sources.some((s) => s.id === "seed-party-spd"));
// 6) verschiedene Regionen versorgt.
const berlin = shadow.runOne({ id: "r1", partei: "SPD", mandatsebene: "Landtag", bundesland: "Berlin" }, ctxEnr, {}).shadow.neu;
const nrw = shadow.runOne({ id: "r2", partei: "SPD", mandatsebene: "Landtag", bundesland: "Nordrhein-Westfalen" }, ctxEnr, {}).shadow.neu;
check("6 verschiedene Regionen werden versorgt (Berlin + NRW je regionale Quelle)",
  berlin.sources.some((s) => (s.auswahlgrund || []).some((r) => (r.matched || []).includes("berlin"))) &&
  nrw.sources.some((s) => (s.auswahlgrund || []).some((r) => (r.matched || []).includes("nordrhein-westfalen"))));

// 7) neue Partei OHNE Sonderlogik bleibt EHRLICH als Luecke (keine erfundene Quelle).
check("7 neue Partei ohne Quelle bleibt ehrlich als Unterversorgung ausgewiesen",
  repEnr.parteienUnterversorgt.some((p) => p.key === "neue-zukunftspartei"));

// 8) Determinismus: identischer Katalog -> identischer Bericht.
check("8 Shadow-Bericht ueber den befuellten Katalog ist deterministisch",
  JSON.stringify(repEnr) === JSON.stringify(run(enriched)));

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Katalog-Shadow-Assertions`);
process.exit(failed > 0 ? 1 : 0);
