"use strict";

// Tests fuer Sprint 6 Stufe 1: Migrations-Mapper-Validierung + Mandats-Alt-gegen-Neu-Vergleich.
// Reine Offline-Tests (Fixtures + echter Katalog via buildCatalog/buildFullModel). Kein Netz,
// kein DB-Write, kein Live-Crawl. Prueft: Coverage, Datenverlust-Erkennung, Orphan-Konsistenz
// (musterbasiert, KEINE Mandanten-IDs im Code), erklaerte Konsolidierung vs. echte Regression,
// Shadow-Flag-Default. Alle Mandats-Testdaten sind KLAR KUENSTLICH (fixtures/test-profiles).

const { buildCatalog, EXPLICIT_ORPHAN_CLASSIFICATION, classifyOrphanId, classifyOrphans } = require("../lib/helmut/quellenarchitektur/catalog");
const { buildFullModel } = require("../lib/helmut/quellenarchitektur");
const pp = require("../lib/helmut/quellenarchitektur/profile-packages");
const mm = require("../lib/helmut/quellenarchitektur/migration-mapper");
const cs = require("../lib/helmut/quellenarchitektur/supply-shadow-compare");
const { testPoliticianOne } = require("./fixtures/test-profiles");

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass += 1; console.log(`PASS  ${name}`); } else { fail += 1; console.log(`FAIL  ${name}`); } }

const cat = buildCatalog();

console.log("== Orphan-Klassifikation: musterbasiert, kein Mandant im Code ==");
check("KEIN Namensmuster: '<id>-news-<suffix>' wird NICHT automatisch als Legacy maskiert (lebende Mandatsquellen!)", classifyOrphanId("tenant-alpha-news-region") === null);
check("KEIN Namensmuster: 'test-…' wird NICHT automatisch klassifiziert", classifyOrphanId("test-politician-news-alt") === null);
check("'dip' -> active_uncatalogued (einziger expliziter Eintrag)", classifyOrphanId("dip") === "active_uncatalogued");
check("Personenquelle selbst ('<id>-news') ist KEIN Orphan", classifyOrphanId("tenant-alpha-news") === null);
check("EXPLICIT_ORPHAN_CLASSIFICATION enthaelt NUR dip", JSON.stringify(Object.keys(EXPLICIT_ORPHAN_CLASSIFICATION)) === JSON.stringify(["dip"]));
check("classifyOrphans klassifiziert NUR explizite Eintraege; Unbekanntes/Muster faellt raus", (() => {
  const rows = classifyOrphans(["tenant-alpha-news-region", "test-politician-news-alt", "voellig-unbekannt"]);
  return rows.length === 1 && rows[0].legacy_source_id === "dip" && rows[0].classification === "active_uncatalogued";
})());
check("classifyOrphans ohne Datenkontext: nur dip", (() => { const rows = classifyOrphans(); return rows.length === 1 && rows[0].legacy_source_id === "dip"; })());

console.log("== Migrations-Mapper: Coverage (strukturell) ==");
const vStruct = mm.validateMigration({ catalog: cat });
check("144 Abrufwege (143 v1Sources + dip)", vStruct.counts.legacyIds === 144);
check("keine Quelle ohne Paketzuordnung (unmapped leer)", vStruct.counts.unmappedPackages === 0 && cat.unmapped.length === 0);
check("ohne raw_documents: availability.observedSources=false (ehrlich, nichts erfunden)", vStruct.availability.observedSources === false);
check("strukturell verdict=ok", vStruct.verdict === "ok");

console.log("== Migrations-Mapper: Datenverlust-Erkennung (injizierte observed) ==");
const observed = [
  { source_id: "bundestag", source_name: "Deutscher Bundestag", count: 120 },              // gemappt
  { source_id: "tenant-alpha-news-region", source_name: "Test Politician One", count: 8 }, // orphan_legacy (explizite Karte unten)
  { source_id: "test-politician-news-alt", source_name: "Test", count: 0 },                // orphan_test (explizite Karte unten)
  { source_id: "geister-quelle-x", source_name: "Unbekannt", count: 42 }                   // unerklärt + Docs!
];
// Orphan-Wissen ist DATEN des Aufrufers: explizite Karte statt Namensmuster.
const ORPHAN_MAP = { "tenant-alpha-news-region": "orphan_legacy", "test-politician-news-alt": "orphan_test" };
const vObs = mm.validateMigration({ catalog: cat, orphanClassification: ORPHAN_MAP, observedSources: observed });
check("availability.observedSources=true bei Injektion", vObs.availability.observedSources === true);
check("gemappte Quelle erkannt (bundestag)", vObs.mappedObserved.some((m) => m.source_id === "bundestag"));
check("orphan_legacy + orphan_test erkannt (explizite Karte)", vObs.counts.orphan === 2 && vObs.orphanObserved.some((o) => o.classification === "orphan_legacy") && vObs.orphanObserved.some((o) => o.classification === "orphan_test"));
check("unerklärte Quelle MIT Dokumenten -> verdict kritisch (Datenverlust-Risiko)", vObs.verdict === "kritisch" && vObs.counts.unexplainedWithDocs === 1);
check("die unerklärte Quelle ist geister-quelle-x", vObs.unexplainedObserved.length === 1 && vObs.unexplainedObserved[0].source_id === "geister-quelle-x");

console.log("== Migrations-Mapper: unerklärt OHNE Dokumente -> nur Warnung ==");
const vWarn = mm.validateMigration({ catalog: cat, orphanClassification: ORPHAN_MAP, observedSources: [{ source_id: "leiche-ohne-docs", source_name: "X", count: 0 }] });
check("unerklärt ohne Dokumente -> verdict warnungen (kein Datenverlust)", vWarn.verdict === "warnungen" && vWarn.counts.unexplainedWithDocs === 0);

console.log("== Migrations-Mapper: alles erklärt -> ok ==");
const vOk = mm.validateMigration({ catalog: cat, orphanClassification: ORPHAN_MAP, observedSources: [{ source_id: "bundestag", source_name: "Deutscher Bundestag", count: 5 }, { source_id: "tenant-alpha-news-region", source_name: "Test Politician One", count: 3 }] });
check("nur gemappte/orphan -> verdict ok", vOk.verdict === "ok" && vOk.counts.unexplained === 0);

console.log("== Migrations-Mapper: Namensdrift nur informativ (kein Fehler) ==");
const vDrift = mm.validateMigration({ catalog: cat, orphanClassification: ORPHAN_MAP, observedSources: [{ source_id: "bundestag", source_name: "VÖLLIG ANDERER NAME", count: 3 }] });
check("Namensdrift erfasst, ändert verdict NICHT (bleibt ok)", vDrift.counts.nameDrift === 1 && vDrift.verdict === "ok");

console.log("== Versorgungs-Vergleich: erklärte Konsolidierung vs. Regression ==");
const cmpClean = cs.compareSupply({
  altSourceIds: ["bundestag", "tenant-alpha-news", "tenant-alpha-news-region", "die-linke"],
  newSourceIds: ["bundestag", "tenant-alpha-news", "die-linke", "dip"],
  consolidationBases: ["tenant-alpha-news"]
});
check("both = gemeinsame Quellen (bundestag/tenant-alpha-news/die-linke)", cmpClean.bothCount === 3);
check("onlyAlt tenant-alpha-news-region ueber DEKLARIERTE Konsolidierungsbasis erklärt", cmpClean.onlyAltExplained.some((e) => e.id === "tenant-alpha-news-region" && e.reason === "konsolidiert"));
check("onlyNew = dip (Gewinn)", cmpClean.onlyNew.includes("dip"));
check("kein unerklärter Wegfall -> keine Regression", cmpClean.regression === false && cmpClean.verdict === "erklaerte_konsolidierung");

console.log("== Versorgungs-Vergleich: Personenquellen-Konsolidierung NUR mit expliziter Basis ==");
const cmpPrefix = cs.compareSupply({
  altSourceIds: ["tenant-alpha-suche", "tenant-alpha-suche-neuer-suffix"],
  newSourceIds: ["tenant-alpha-suche"],
  orphanClassification: {},
  consolidationBases: ["tenant-alpha-suche"]
});
check("tenant-alpha-suche-neuer-suffix via DEKLARIERTE Basis-Konsolidierung erklärt", cmpPrefix.onlyAltExplained.some((e) => e.id === "tenant-alpha-suche-neuer-suffix" && e.reason === "konsolidiert") && cmpPrefix.regression === false);

console.log("== Preflight-Fix M2: KEIN blinder Prefix-Match (fremde Quelle X-fake) ==");
const cmpM2 = cs.compareSupply({
  altSourceIds: ["bundestag", "bundestag-fake-eigenstaendig"],
  newSourceIds: ["bundestag"],
  orphanClassification: {},
  docsBySource: { "bundestag-fake-eigenstaendig": 99 }
  // KEINE consolidationBases -> darf NICHT als konsolidiert durchgehen
});
check("eigenständige 'bundestag-fake' wird NICHT fälschlich zu 'bundestag' konsolidiert -> regression", cmpM2.regression === true && cmpM2.onlyAltUnexplained.some((e) => e.id === "bundestag-fake-eigenstaendig"));
const cmpM2b = cs.compareSupply({ altSourceIds: ["bundestag", "bundestag-x"], newSourceIds: ["bundestag"], orphanClassification: {}, consolidationBases: ["tenant-alpha-suche"] });
check("Prefix-Match nur für DEKLARIERTE Basis (bundestag nicht deklariert -> regression)", cmpM2b.regression === true);

console.log("== Preflight-Fix M3: unbekannte Dokumentzahl konservativ als Risiko ==");
const cmpM3 = cs.compareSupply({
  altSourceIds: ["bundestag", "seltene-quelle"],
  newSourceIds: ["bundestag"],
  orphanClassification: {},
  docsBySource: { "bundestag": 100 } // seltene-quelle NICHT im Snapshot -> docs=null (unbekannt)
});
check("unerklärter Wegfall mit UNBEKANNTER Dokumentzahl -> regression (nicht struktur_warnung)", cmpM3.regression === true && cmpM3.verdict === "regression");
const cmpM3b = cs.compareSupply({
  altSourceIds: ["bundestag", "nachweislich-leer"],
  newSourceIds: ["bundestag"],
  orphanClassification: {},
  docsBySource: { "bundestag": 100, "nachweislich-leer": 0 } // explizit 0 -> struktur_warnung
});
check("unerklärter Wegfall mit NACHWEISLICH 0 Dokumenten -> struktur_warnung (keine Regression)", cmpM3b.regression === false && cmpM3b.verdict === "struktur_warnung");

console.log("== Versorgungs-Vergleich: echte Regression (unerklärter Wegfall MIT Dokumenten) ==");
const cmpReg = cs.compareSupply({
  altSourceIds: ["bundestag", "wichtige-quelle"],
  newSourceIds: ["bundestag"],
  orphanClassification: {},
  docsBySource: { "wichtige-quelle": 30 }
});
check("unerklärter Wegfall mit 30 Dokumenten -> regression", cmpReg.regression === true && cmpReg.verdict === "regression" && cmpReg.docsAtRisk === 30);

console.log("== Versorgungs-Vergleich: unerklärt OHNE Dokumente -> nur Struktur-Warnung ==");
const cmpStruct = cs.compareSupply({
  altSourceIds: ["bundestag", "tote-quelle"],
  newSourceIds: ["bundestag"],
  orphanClassification: {},
  docsBySource: { "tote-quelle": 0 }
});
check("unerklärter Wegfall ohne Dokumente -> struktur_warnung (keine Regression)", cmpStruct.regression === false && cmpStruct.verdict === "struktur_warnung");

console.log("== Versorgungs-Vergleich: identische Mengen -> keine Verschlechterung ==");
const cmpSame = cs.compareSupply({ altSourceIds: ["a", "b"], newSourceIds: ["a", "b"], orphanClassification: {} });
check("keine Differenz -> keine_verschlechterung", cmpSame.verdict === "keine_verschlechterung" && cmpSame.onlyAlt.length === 0);

console.log("== Shadow-Flag (default AUS) ==");
check("Flag ohne env -> AUS", cs.shadowCompareEnabled({}) === false && cs.shadowCompareEnabled(undefined) === false);
check("Flag 'shadow'/'on'/'1'/'true' -> AN", ["shadow", "on", "1", "true"].every((v) => cs.shadowCompareEnabled({ HELMUT_V3_SHADOW_COMPARE: v })));
check("Flag 'off'/'0'/'' -> AUS", ["off", "0", ""].every((v) => cs.shadowCompareEnabled({ HELMUT_V3_SHADOW_COMPARE: v }) === false));

console.log("== NEU-Auflösung Fixture-Mandat (echter Katalog, sync) ==");
const M = buildFullModel();
const res = pp.resolveProfilePackages(testPoliticianOne);
check("Fixture-Mandat: bund-basis als Pflichtpaket", res.required.includes("bund-basis"));
check("Fixture-Mandat: Personenpaket-Key 'profil-<id>' per Konvention referenziert", res.all.includes("profil-test-politician-one"));
const pkgIdByKey = new Map(M.packages.map((p) => [p.key, p.id]));
const activePkgIds = new Set(res.all.map((k) => pkgIdByKey.get(k)).filter(Boolean));
const pathById = new Map(M.retrievalPaths.map((p) => [p.id, p]));
const newLegacyIds = new Set();
for (const pk of M.packagePaths) if (activePkgIds.has(pk.package_id)) { const path = pathById.get(pk.retrieval_path_id); if (path && path.legacy_source_id) newLegacyIds.add(path.legacy_source_id); }
check("Katalog enthaelt KEINE Personenquelle mehr (entsteht dynamisch als '<id>-news')", M.retrievalPaths.every((p) => !/-news$/.test(String(p.legacy_source_id))));
check("Fixture-Mandat NEU: dip als amtliche Quelle enthalten", newLegacyIds.has("dip"));

console.log("== SQL offline: Idempotenz + Rollback-Symmetrie (read-only) ==");
const fs = require("fs");
const path = require("path");
const mig = (f) => fs.readFileSync(path.join(__dirname, "..", "supabase", f), "utf8");
const archUp = mig("migrations/20260713_source_architecture.sql");
const archDown = mig("migrations/20260713_source_architecture_rollback.sql");
const seed = mig("seeds/20260713_source_architecture_seed.sql");
const llmUp = mig("migrations/20260716_llm_usage_source_attribution.sql");
const llmDown = mig("migrations/20260716_llm_usage_source_attribution_rollback.sql");
// Alle CREATE TABLE sind idempotent (if not exists)
const createdTables = [...archUp.matchAll(/create\s+table\s+if\s+not\s+exists\s+public\.(\w+)/gi)].map((m) => m[1]);
const plainCreates = [...archUp.matchAll(/create\s+table\s+(?!if\s+not\s+exists)/gi)];
check("Struktur-Migration: jede CREATE TABLE ist idempotent (if not exists)", createdTables.length >= 8 && plainCreates.length === 0);
// Rollback droppt JEDE erstellte Tabelle (Symmetrie)
const droppedTables = [...archDown.matchAll(/drop\s+table\s+if\s+exists\s+public\.(\w+)/gi)].map((m) => m[1]);
check("Rollback ist symmetrisch: jede erstellte Tabelle wird gedroppt", createdTables.every((t) => droppedTables.includes(t)));
check("Rollback nutzt if exists (wiederholbar)", /drop\s+table\s+if\s+exists/i.test(archDown) && !/drop\s+table\s+(?!if\s+exists)/i.test(archDown));
// Seed idempotent + transaktional
check("Seed: transaktional (begin/commit)", /^\s*begin\s*;/im.test(seed) && /commit\s*;/i.test(seed));
check("Seed: idempotent (on conflict) und additiv (nur insert, kein delete/drop)", /on\s+conflict/i.test(seed) && !/\b(delete\s+from|drop\s+table|truncate)\b/i.test(seed));
// llm_usage additiv + symmetrisch
check("llm_usage-Migration: additiv (add column if not exists), keine bestehende Spalte geändert", /add\s+column\s+if\s+not\s+exists/i.test(llmUp) && !/\b(drop\s+column|alter\s+column)\b/i.test(llmUp));
check("llm_usage-Rollback: drop column if exists (symmetrisch)", /drop\s+column\s+if\s+exists/i.test(llmDown));
const addedCols = [...llmUp.matchAll(/add\s+column\s+if\s+not\s+exists\s+(\w+)/gi)].map((m) => m[1]);
const droppedCols = [...llmDown.matchAll(/drop\s+column\s+if\s+exists\s+(\w+)/gi)].map((m) => m[1]);
check("llm_usage: alle 4 hinzugefügten Spalten werden im Rollback entfernt", addedCols.length === 4 && addedCols.every((c) => droppedCols.includes(c)));

console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
