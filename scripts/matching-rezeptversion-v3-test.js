"use strict";
const A = require("node:assert/strict"), M = require("../lib/helmut/matching");
const C = require("../lib/helmut/matching-contract"), G = require("./e2e-vertrag-geruest");
const profile = { id: "synthetisches-menschenrechtsmandat", parliamentType: "Bundestag",
  committees: ["Ausschuss für Menschenrechte und humanitäre Hilfe"] };
const ko = { id: "ko-synthetisches-recht", vorgang_id: "vg-synthetisches-recht", ko_version: 1,
  status: "neu", understanding_status: "complete", decision_level: "bund",
  ausschuesse: ["Ausschuss für Recht und Verbraucherschutz"], headline: "Verwaltungsverfahren beraten",
  was_ist_passiert: "Der Rechtsausschuss berät den Gesetzentwurf.", tags: [], policy_field: [] };
ko.embedding = M.computeFeatureVectorForKnowledgeObject(ko);
const store = G.neuerStore({ getProfile: () => profile,
  requestUnderstanding: () => { throw Error("Modellpfad verboten"); }, relevanzGateEnabled: () => false });
let nr = 0; store.auditDeps.randomSuffix = () => "rv3lauf" + (++nr);
store.knowledgeObjects.set(ko.id, ko);
const run = async rezept => {
  const vorher = C.LEGACY_RECIPE_VERSION; C.LEGACY_RECIPE_VERSION = rezept;
  try { return await M.runMatchingShadow({ profile, ausloeser: "test" }, store.matchingOverrides); }
  finally { C.LEGACY_RECIPE_VERSION = vorher; }
};
const rows = () => store.api.listMatchingResults({ userId: profile.id, limit: 10, includeAbgeloest: true });
(async () => {
  A.equal(C.LEGACY_RECIPE_VERSION, "legacy_relevance_v3");
  const alt = await run("legacy_relevance_v2"); A.equal(alt.audit.idempotent, false);
  // Persistierter Altfehler am Speicherrand. Keine Behauptung, dass der neue
  // Rechner selbst unter einem alten Versionsetikett den Altfehler erzeugt.
  for (const r of store.matchingResults.values()) r.matched_features = [{ type: "ausschuss", value: profile.committees[0] }];
  const wiederAlt = await run("legacy_relevance_v2");
  A.equal(wiederAlt.audit.idempotent, true); A.equal(rows()[0].matched_features[0].type, "ausschuss");
  const neu = await run(C.LEGACY_RECIPE_VERSION);
  A.equal(neu.audit.idempotent, false); A.notEqual(neu.audit.fingerprint, alt.audit.fingerprint);
  A.equal(rows().length, 1); A.equal(rows()[0].rezept_version, "legacy_relevance_v3");
  A(!rows()[0].matched_features.some(f => f.type === "ausschuss"));
  const nochmal = await run(C.LEGACY_RECIPE_VERSION);
  A.equal(nochmal.audit.idempotent, true); A.equal(nochmal.saved, 0);
  A.equal(C.LEGACY_ENGINE_VERSION, "legacy-shadow-1"); A.equal(C.legacyVectorVersion(256), "feature-hash-256-v1");
  console.log("5/5 Rezept-v3-Gruppen: alter Fehlbeleg ohne Versionswechsel stabil, neue Generation, Korrektur, Idempotenz und Vektorkompatibilitaet.");
})().catch(e => { console.error(e); process.exitCode = 1; });
