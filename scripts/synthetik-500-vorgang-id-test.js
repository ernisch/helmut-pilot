"use strict";
// Synthetic regression for the actual planner/central U selection seam; no I/O.
const assert = require("node:assert/strict");
const P = require("../lib/helmut/synthetik-500-profile");
const A = require("../lib/helmut/synthetik-500-kosten-admission");
const C = require("../lib/helmut/synthetik-500-kosten-plan");
const V = require("../lib/helmut/verstehen-vertrag");
const { fixture } = require("./synthetik-500-kosten-plan-test");
const noNetwork = () => { throw Error("network-forbidden"); };
global.fetch = noNetwork;
require("node:https").request = noNetwork;
const START = "2026-10-02T12:00:00.000Z";
function slot(vorgangId) {
  const descriptor = { phase: "U", vorgangId, contractInputHash: "d".repeat(40),
    actualRequestHash: P.hash("fictional-body"), model: "gpt-5-mini", maxOutputTokens: 3000, attemptLimit: 1 };
  const plan = { version: A.PLAN_VERSION, operationId: "synthetik500-fictional-vorgang-test", runId: "nachlauf500-1790935200000",
    productionCommit: "c".repeat(40), runtimeManifestHash: P.hash("fictional-runtime"), startsAtUTC: START,
    endsAtUTC: "2026-10-02T13:00:00.000Z", intents: [{ id: A.intentHash("nachlauf500-1790935200000", descriptor), ...descriptor }] };
  return { version: A.VERSION, plan, planHash: P.hash(plan), consumed: {} };
}
function select(s, vorgangId) {
  return A.pruefe({ [A.KEY]: s }, { phase: null, vorgangId, contractInputHash: "d".repeat(40),
    runId: s.plan.runId, admission: { operationId: s.plan.operationId, planHash: s.planHash },
    model: "gpt-5-mini", maxOutputTokens: 3000, actualRequestHash: P.hash("fictional-body") }, START, s.plan.productionCommit);
}
for (const id of ["fictional-ascii_1", "vg-fiktiv-präsidentin", "vg-ÄÖÜäöüß", "x".repeat(200)]) {
  const s = slot(id); A.pruefeSlot(s); const admitted = select(s, id);
  assert.equal(admitted.intentId, s.plan.intents[0].id);
  assert.equal(s.plan.intents[0].vorgangId, id);
  assert.throws(() => select(s, id + "x"), /intent-missing/);
  const ko = { vorgangId: id, koVersion: 1, version: { vorgang_id: id, ko_version: 1 } };
  assert.equal(C.sourceVersions([], [ko], null).knowledgeObjects[0].vorgangId, id);
}
const bad = ["", "x".repeat(201), "vg fiktiv", "vg/fiktiv", "vg\\fiktiv", "vg\nfiktiv", "vg-fiktiv\n", "vg-fiktiv\r", "vg-fiktiv\t", "vg-\0", 'vg-"', "vg-é", "vg-a\u0308", "vg-🚫"];
for (const id of bad) {
  assert.throws(() => A.pruefeSlot(slot(id)), /u-intent/);
  assert.throws(() => select(slot("fictional-ascii_1"), id), /intent-missing/);
  assert.throws(() => C.sourceVersions([], [{ vorgangId: id, koVersion: 1, version: { vorgang_id: id, ko_version: 1 } }], null), /ko-version/);
}
// The full cost-plan constructor binds the original Unicode cluster, not a rewritten slug.
const e = fixture(); e.clusters[0].vorgangId = "vg-fiktiv-präsidentin";
const hash = V.eingabeHash({ vorgangId: e.clusters[0].vorgangId, dokumente: e.documents, modus: "erst" });
const source = C.sourceVersions(e.documents, e.knowledgeObjects, e.clusters);
e.understandingInputs[0].versionKey = source.clusters[0].key;
e.understandingInputs[0].contractInputHash = hash;
e.understandingCompleteness = { ...e.understandingCompleteness, clusterInventoryHash: P.hash(source.clusters), requiredVersionKeys: [source.clusters[0].key] };
e.paidRoutes = null; const preliminary = C.vorbereite(P.erzeuge(), e);
e.paidRoutes = fixture().paidRoutes;
e.paidRoutes[0].admittedRequestIds = [...preliminary.phasePositions.U, ...preliminary.phasePositions.D].map(x => x.requestId).sort();
const result = C.vorbereite(P.erzeuge(), e); C.pruefe(result, P.erzeuge());
assert.equal(result.phasePositions.U[0].vorgangId, e.clusters[0].vorgangId);
assert.equal(result.phasePositions.U[0].contractInputHash, hash);
assert.notEqual(slot("vg-fiktiv-präsidentin").planHash, slot("vg-fiktiv-praesidentin").planHash);
assert.throws(() => C.sourceVersions([{ id: "fiktiv-ä", scope: "BT", version: { id: "fiktiv-ä" } }], [], null), /dokumentversion/);
const invalidOperation = slot("vg-fiktiv-ä"); invalidOperation.plan.operationId += "ä";
invalidOperation.planHash = P.hash(invalidOperation.plan); assert.throws(() => A.pruefeSlot(invalidOperation), /plan-bindung/);
console.log(JSON.stringify({ status: "PASS_GERMAN_VORGANG_ID_PLAN_AND_CENTRAL_U_SELECTION", acceptedIdentifiers: 4, rejectedIdentifiers: bad.length,
  identityRewritten: false, genericAsciiIdsUnchanged: true, productionCalls: 0, modelCalls: 0 }));
