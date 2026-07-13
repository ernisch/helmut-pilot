"use strict";

// Tests fuer Sprint 6 Stufe 1: Migrations-Mapper-Validierung + Cem Alt-gegen-Neu-Vergleich.
// Reine Offline-Tests (Fixtures + echter Katalog via buildCatalog/buildFullModel). Kein Netz,
// kein DB-Write, kein Live-Crawl. Prueft: Coverage, Datenverlust-Erkennung, Orphan-Konsistenz,
// erklaerte Konsolidierung vs. echte Regression, Shadow-Flag-Default.

const { buildCatalog, ORPHAN_CLASSIFICATION } = require("../lib/helmut/quellenarchitektur/catalog");
const { buildFullModel } = require("../lib/helmut/quellenarchitektur");
const pp = require("../lib/helmut/quellenarchitektur/profile-packages");
const mm = require("../lib/helmut/quellenarchitektur/migration-mapper");
const cs = require("../lib/helmut/quellenarchitektur/cem-shadow-compare");

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass += 1; console.log(`PASS  ${name}`); } else { fail += 1; console.log(`FAIL  ${name}`); } }

const cat = buildCatalog();

console.log("== Migrations-Mapper: Coverage (strukturell) ==");
const vStruct = mm.validateMigration({ catalog: cat, orphanClassification: ORPHAN_CLASSIFICATION });
check("145 Abrufwege (144 v1Sources + dip)", vStruct.counts.legacyIds === 145);
check("keine Quelle ohne Paketzuordnung (unmapped leer)", vStruct.counts.unmappedPackages === 0 && cat.unmapped.length === 0);
check("ohne raw_documents: availability.observedSources=false (ehrlich, nichts erfunden)", vStruct.availability.observedSources === false);
check("strukturell verdict=ok", vStruct.verdict === "ok");

console.log("== Migrations-Mapper: Datenverlust-Erkennung (injizierte observed) ==");
const observed = [
  { source_id: "bundestag", source_name: "Deutscher Bundestag", count: 120 }, // gemappt
  { source_id: "cem-ince-news-region", source_name: "Cem Ince", count: 8 },   // orphan_legacy
  { source_id: "test-mdb-news-bmas-vorhaben", source_name: "Test", count: 0 },// orphan_test
  { source_id: "geister-quelle-x", source_name: "Unbekannt", count: 42 }      // unerklärt + Docs!
];
const vObs = mm.validateMigration({ catalog: cat, orphanClassification: ORPHAN_CLASSIFICATION, observedSources: observed });
check("availability.observedSources=true bei Injektion", vObs.availability.observedSources === true);
check("gemappte Quelle erkannt (bundestag)", vObs.mappedObserved.some((m) => m.source_id === "bundestag"));
check("orphan_legacy + orphan_test erkannt", vObs.counts.orphan === 2 && vObs.orphanObserved.some((o) => o.classification === "orphan_legacy") && vObs.orphanObserved.some((o) => o.classification === "orphan_test"));
check("unerklärte Quelle MIT Dokumenten -> verdict kritisch (Datenverlust-Risiko)", vObs.verdict === "kritisch" && vObs.counts.unexplainedWithDocs === 1);
check("die unerklärte Quelle ist geister-quelle-x", vObs.unexplainedObserved.length === 1 && vObs.unexplainedObserved[0].source_id === "geister-quelle-x");

console.log("== Migrations-Mapper: unerklärt OHNE Dokumente -> nur Warnung ==");
const vWarn = mm.validateMigration({ catalog: cat, orphanClassification: ORPHAN_CLASSIFICATION, observedSources: [{ source_id: "leiche-ohne-docs", source_name: "X", count: 0 }] });
check("unerklärt ohne Dokumente -> verdict warnungen (kein Datenverlust)", vWarn.verdict === "warnungen" && vWarn.counts.unexplainedWithDocs === 0);

console.log("== Migrations-Mapper: alles erklärt -> ok ==");
const vOk = mm.validateMigration({ catalog: cat, orphanClassification: ORPHAN_CLASSIFICATION, observedSources: [{ source_id: "bundestag", source_name: "Deutscher Bundestag", count: 5 }, { source_id: "cem-ince-news-region", source_name: "Cem", count: 3 }] });
check("nur gemappte/orphan -> verdict ok", vOk.verdict === "ok" && vOk.counts.unexplained === 0);

console.log("== Migrations-Mapper: Namensdrift nur informativ (kein Fehler) ==");
const vDrift = mm.validateMigration({ catalog: cat, orphanClassification: ORPHAN_CLASSIFICATION, observedSources: [{ source_id: "bundestag", source_name: "VÖLLIG ANDERER NAME", count: 3 }] });
check("Namensdrift erfasst, ändert verdict NICHT (bleibt ok)", vDrift.counts.nameDrift === 1 && vDrift.verdict === "ok");

console.log("== Cem-Vergleich: erklärte Konsolidierung vs. Regression ==");
const cmpClean = cs.compareSupply({
  altSourceIds: ["bundestag", "cem-ince-news", "cem-ince-news-region", "die-linke"],
  newSourceIds: ["bundestag", "cem-ince-news", "die-linke", "dip"],
  orphanClassification: ORPHAN_CLASSIFICATION
});
check("both = gemeinsame Quellen (bundestag/cem-ince-news/die-linke)", cmpClean.bothCount === 3);
check("onlyAlt cem-ince-news-region als orphan_legacy erklärt", cmpClean.onlyAltExplained.some((e) => e.id === "cem-ince-news-region" && e.reason === "orphan_legacy"));
check("onlyNew = dip (Gewinn)", cmpClean.onlyNew.includes("dip"));
check("kein unerklärter Wegfall -> keine Regression", cmpClean.regression === false && cmpClean.verdict === "erklaerte_konsolidierung");

console.log("== Cem-Vergleich: Prefix-Konsolidierung ohne Orphan-Eintrag ==");
const cmpPrefix = cs.compareSupply({
  altSourceIds: ["cem-ince-news", "cem-ince-news-neuer-suffix"],
  newSourceIds: ["cem-ince-news"],
  orphanClassification: {}
});
check("cem-ince-news-neuer-suffix via Basis-Konsolidierung erklärt (kein Orphan nötig)", cmpPrefix.onlyAltExplained.some((e) => e.id === "cem-ince-news-neuer-suffix" && e.reason === "konsolidiert") && cmpPrefix.regression === false);

console.log("== Cem-Vergleich: echte Regression (unerklärter Wegfall MIT Dokumenten) ==");
const cmpReg = cs.compareSupply({
  altSourceIds: ["bundestag", "wichtige-quelle"],
  newSourceIds: ["bundestag"],
  orphanClassification: {},
  docsBySource: { "wichtige-quelle": 30 }
});
check("unerklärter Wegfall mit 30 Dokumenten -> regression", cmpReg.regression === true && cmpReg.verdict === "regression" && cmpReg.docsAtRisk === 30);

console.log("== Cem-Vergleich: unerklärt OHNE Dokumente -> nur Struktur-Warnung ==");
const cmpStruct = cs.compareSupply({
  altSourceIds: ["bundestag", "tote-quelle"],
  newSourceIds: ["bundestag"],
  orphanClassification: {},
  docsBySource: { "tote-quelle": 0 }
});
check("unerklärter Wegfall ohne Dokumente -> struktur_warnung (keine Regression)", cmpStruct.regression === false && cmpStruct.verdict === "struktur_warnung");

console.log("== Cem-Vergleich: identische Mengen -> keine Verschlechterung ==");
const cmpSame = cs.compareSupply({ altSourceIds: ["a", "b"], newSourceIds: ["a", "b"], orphanClassification: {} });
check("keine Differenz -> keine_verschlechterung", cmpSame.verdict === "keine_verschlechterung" && cmpSame.onlyAlt.length === 0);

console.log("== Shadow-Flag (default AUS) ==");
check("Flag ohne env -> AUS", cs.shadowCompareEnabled({}) === false && cs.shadowCompareEnabled(undefined) === false);
check("Flag 'shadow'/'on'/'1'/'true' -> AN", ["shadow", "on", "1", "true"].every((v) => cs.shadowCompareEnabled({ HELMUT_V3_SHADOW_COMPARE: v })));
check("Flag 'off'/'0'/'' -> AUS", ["off", "0", ""].every((v) => cs.shadowCompareEnabled({ HELMUT_V3_SHADOW_COMPARE: v }) === false));

console.log("== Cem NEU-Auflösung (echter Katalog, sync) ==");
const M = buildFullModel();
const { cemInceProfile } = require("../lib/helmut/config");
const res = pp.resolveProfilePackages(cemInceProfile);
check("Cem NEU: bund-basis als Pflichtpaket", res.required.includes("bund-basis"));
check("Cem NEU: Personenpaket profil-cem-ince enthalten", res.all.includes("profil-cem-ince"));
const pkgIdByKey = new Map(M.packages.map((p) => [p.key, p.id]));
const activePkgIds = new Set(res.all.map((k) => pkgIdByKey.get(k)).filter(Boolean));
const pathById = new Map(M.retrievalPaths.map((p) => [p.id, p]));
const newLegacyIds = new Set();
for (const pk of M.packagePaths) if (activePkgIds.has(pk.package_id)) { const path = pathById.get(pk.retrieval_path_id); if (path && path.legacy_source_id) newLegacyIds.add(path.legacy_source_id); }
check("Cem NEU: cem-ince-news (Personenquelle) über Paket abgedeckt", newLegacyIds.has("cem-ince-news"));
check("Cem NEU: dip als amtliche Quelle enthalten", newLegacyIds.has("dip"));

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
