"use strict";

// Tests der Quellenplattform-KONSOLIDIERUNG · Laufzeit-Versorgungsplan ("Paket" = Laufzeitobjekt).
// REINE LOGIK, synthetische Fixtures. Deckt ab (Phase 3/4/5):
//   - Katalog-Adapter: Sprint-3-Master-Records -> Sprint-2-Registry (dynamische Auswahl).
//   - Ein Paket ist ein DYNAMISCH erzeugter Laufzeitplan (persisted:false) — nichts gespeichert.
//   - Dynamische Zuweisung aus dem Mandat (Sprint-1-Wahrheit) gegen den Master-Katalog (Sprint 3).
//   - Global: gleiche Quelle EINMAL (100 gleiche Mandate = 1x, refCount=100) — nicht pro Mandant kopiert.
//   - Determinismus: gleiche Eingabe -> identischer Plan.
//   - Robustheit: der reale Master-Katalog laeuft ohne Ausnahme durch den Adapter.

const K = require("../lib/helmut/quellenarchitektur/konsolidierung");
const VP = require("../lib/helmut/quellenarchitektur/konsolidierung-versorgungsplan");
const master = require("../lib/helmut/quellenarchitektur/master");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// Repraesentative Master-Records (Sprint-3-Schema): Partei, Ausschuss/Thema, Region, universale Basis.
const RECORDS = [
  { id: "src-basis-bt", publisher_id: "publisher-bundestag.de", source_type: "parlament", political_level: "bund", universal: true, retrieval: { method: "rss", url: "https://www.bundestag.de/rss", expected_frequency: "daily" }, trust: "hoch", review_status: "active", license_status: "offen_erlaubt" },
  { id: "src-linke", publisher_id: "publisher-die-linke.de", source_type: "fraktion", political_level: "bund", party_id: "linke", group_id: "linke", retrieval: { method: "rss", url: "https://www.die-linke.de/feed", expected_frequency: "daily" }, trust: "mittel", review_status: "active", license_status: "presse_erlaubt" },
  { id: "src-bmas", publisher_id: "publisher-bmas.de", source_type: "ministerium", political_level: "bund", committee_ids: ["arbeit-und-soziales"], topics: ["arbeit-und-soziales"], retrieval: { method: "rss", url: "https://www.bmas.de/rss" }, trust: "hoch", review_status: "active", license_status: "offen_erlaubt" },
  { id: "src-nds", publisher_id: "publisher-braunschweiger-zeitung.de", source_type: "medien_regional", political_level: "land", region_ids: ["niedersachsen"], retrieval: { method: "rss", url: "https://www.bz.de/rss" }, trust: "mittel", review_status: "active", license_status: "eingeschraenkt" },
  { id: "src-untersagt", publisher_id: "publisher-verboten.de", source_type: "medien_regional", political_level: "bund", topics: ["arbeit-und-soziales"], retrieval: { method: "rss", url: "https://verboten.de/rss" }, trust: "mittel", review_status: "active", license_status: "untersagt" }
];

const plat = K.buildPlatform(RECORDS);

// ── Adapter + Aufnahme ────────────────────────────────────────────────────────
check("A1 Adapter nimmt die Master-Records in die Registry auf",
  plat.report.added.length === RECORDS.length && plat.report.rejected.length === 0, JSON.stringify(plat.report));
check("A2 untersagte Lizenz (->prohibited) ist in der Registry NICHT zuweisbar",
  plat.registry.get("src-untersagt") != null && plat.registry.isEligible(plat.registry.get("src-untersagt")) === false);

// ── Laufzeit-Versorgungsplan (Paket als Laufzeitobjekt) ───────────────────────
const linkeSozialesMandat = { id: "m-linke", partei: "Die Linke", fraktion: "Die Linke", ausschuesse: ["Arbeit und Soziales"] };
const plan = plat.supplyPlanFor(linkeSozialesMandat);
check("P1 Plan ist ein Laufzeitobjekt (kind runtime_supply_plan, persisted:false)",
  plan.kind === "runtime_supply_plan" && plan.persisted === false);
check("P2 dynamische Zuweisung trifft Partei-Quelle (Sprint-2-Logik ueber Sprint-3-Katalog)",
  plan.sources.some((s) => s.id === "src-linke"));
check("P3 dynamische Zuweisung trifft Ausschuss/Thema-Quelle",
  plan.sources.some((s) => s.id === "src-bmas"));
check("P4 universale Grundversorgung ist immer dabei",
  plan.sources.some((s) => s.id === "src-basis-bt"));
check("P5 untersagte Quelle taucht NIE im Plan auf",
  !plan.sources.some((s) => s.id === "src-untersagt"));
check("P6 nicht zugehoerige Regionalquelle wird NICHT zugewiesen (kein Regionstreffer)",
  !plan.sources.some((s) => s.id === "src-nds"));

// ── Determinismus ─────────────────────────────────────────────────────────────
const plan2 = K.buildPlatform(RECORDS).supplyPlanFor(linkeSozialesMandat);
check("D1 gleiche Eingabe -> identische Quellenmenge (deterministisch)",
  JSON.stringify(plan.sources.map((s) => s.id)) === JSON.stringify(plan2.sources.map((s) => s.id)));

// ── Global: nicht pro Mandant kopiert ─────────────────────────────────────────
const profiles = Array.from({ length: 100 }, (_, i) => ({ id: "m" + i, partei: "Die Linke", fraktion: "Die Linke", ausschuesse: ["Arbeit und Soziales"] }));
const global = plat.globalSupplyPlan(profiles);
check("G1 100 gleiche Mandate -> jede Quelle EINMAL (global nicht kopiert)",
  global.activeSourceCount <= RECORDS.length && global.mandateCount === 100);
check("G2 Referenzzaehlung: geteilte Quelle traegt refCount=100",
  global.activeSources.some((s) => s.id === "src-linke" && s.refCount === 100),
  JSON.stringify(global.activeSources));
check("G3 global-Plan ist ebenfalls unpersistiert",
  global.kind === "runtime_global_supply_plan" && global.persisted === false);

// ── Robustheit gegen den realen Master-Katalog ────────────────────────────────
let realOk = true, realDetail = "";
try {
  const realCatalog = master.buildMasterCatalog();
  const realPlat = K.buildPlatform(realCatalog.records);
  const realPlan = realPlat.supplyPlanFor({ id: "real-1", partei: "Die Linke", ausschuesse: ["Arbeit und Soziales"], bundesland: "" });
  realOk = Array.isArray(realPlan.sources) && realPlan.kind === "runtime_supply_plan";
  realDetail = `records=${realCatalog.records.length} added=${realPlat.report.added.length} planSources=${realPlan.sourceCount}`;
} catch (e) { realOk = false; realDetail = e.message; }
check("R1 realer Master-Katalog laeuft ohne Ausnahme durch Adapter+Plan", realOk, realDetail);

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Versorgungsplan-Assertions`);
process.exit(failed > 0 ? 1 : 0);
