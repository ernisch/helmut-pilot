"use strict";

// Only the selected local source/KO fixture inventory changes. This is the
// already existing explicitly manual U0 fixture contract, never a native U
// receipt, a source publication change, execution authority or Production GO.
const assert = require("node:assert/strict");
const P = require("../../lib/helmut/synthetik-500-profile");
const K = require("../../lib/helmut/synthetik-500-kosten-plan");
const V = require("../../lib/helmut/verstehen-vertrag");

function deriveNative(original, replacements, witness) {
  assert(original.curatedLocalFixture === true && original.nativeUnderstandingAcceptance === false);
  assert(Array.isArray(replacements) && replacements.length === 2);
  assert(witness && typeof witness.reference === "string" && /^[a-f0-9]{64}$/.test(witness.sha256));
  const originalHash = P.hash(original), native = structuredClone(original);
  // Existing historical coverage remains bound to its original evidence.
  K.sourceVersions(native.documents, native.knowledgeObjects, native.clusters,
    K.ROUTE_INPUT_VERSION, native.costInputs.routeContract, null);
  const changes = [];
  for (const r of replacements) {
    assert(["BE", "BT"].includes(r.scope) && r.koVersion === 1);
    assert(r.document?.id && r.knowledgeObject?.vorgang_id === r.vorgangId);
    assert.equal(r.knowledgeObject.understanding_model,
      "local-curated-independent-source-review-NOT-native-U");
    assert.equal(r.knowledgeObject.understanding_tokens, 0);
    assert.equal(r.knowledgeObject.verstehen_fencing, null);
    const removedDocuments = native.documents.filter(d => r.oldDocumentIds.includes(d.id));
    assert.equal(removedDocuments.length, r.oldDocumentIds.length);
    assert.equal(native.knowledgeObjects.filter(k => k.vorgangId === r.oldVorgangId).length, 1);
    assert.equal(native.clusters.filter(c => c.vorgangId === r.oldVorgangId).length, 1);
    native.documents = native.documents.filter(d => !r.oldDocumentIds.includes(d.id));
    native.knowledgeObjects = native.knowledgeObjects.filter(k => k.vorgangId !== r.oldVorgangId);
    native.clusters = native.clusters.filter(c => c.vorgangId !== r.oldVorgangId);
    native.documents.push({ id: r.document.id, scope: r.scope, version: structuredClone(r.document) });
    native.knowledgeObjects.push({ vorgangId: r.vorgangId, koVersion: r.koVersion,
      version: structuredClone(r.knowledgeObject) });
    const versions = K.sourceVersions(native.documents, native.knowledgeObjects, null,
      K.ROUTE_INPUT_VERSION, native.costInputs.routeContract, null);
    const document = versions.documents.find(d => d.id === r.document.id);
    const ko = versions.knowledgeObjects.find(k => k.vorgangId === r.vorgangId);
    assert(document && ko);
    const documentKeys = [document.key];
    const contractInputHash = V.eingabeHash({ vorgangId: r.vorgangId,
      modus: "erst", koVersion: null, dokumente: [{ id: document.id }] });
    native.clusters.push({ vorgangId: r.vorgangId, mode: "erst", koVersion: null,
      documentKeys, requiresUnderstanding: false,
      coverage: { knowledgeObjectKey: ko.key, documentKeys: [...documentKeys],
        contractInputHash, evidence: { ...witness } }, artikelkontextVersuch: null });
    changes.push({ scope: r.scope, removedSelectedDocumentIds: r.oldDocumentIds,
      oldVorgangId: r.oldVorgangId, addedDocumentId: document.id, addedVorgangId: r.vorgangId,
      documentVersionHash: document.versionHash, knowledgeObjectVersionHash: ko.versionHash,
      publicationOriginalDateRetained: true, newManualCoverageWitness: { ...witness } });
  }
  native.curatedWitnessReference = { ...witness };
  const checked = K.sourceVersions(native.documents, native.knowledgeObjects, native.clusters,
    K.ROUTE_INPUT_VERSION, native.costInputs.routeContract, null);
  assert.equal(native.documents.length, 6); assert.equal(native.knowledgeObjects.length, 6);
  assert.equal(native.clusters.length, 6); assert(checked.clusters.every(c => !c.requiresUnderstanding));
  assert.equal(P.hash(original), originalHash);
  return { native, report: { scope: "LOCAL_SELECTED_ORIGINAL_SOURCE_REPLACEMENTS_WITH_EXPLICIT_MANUAL_U0_FIXTURE",
    originalNativeHash: originalHash, derivedNativeHash: P.hash(native), changes,
    documents: 6, knowledgeObjects: 6, clusters: 6,
    originalSourceDatabaseWritten: false, originalFilesModified: false,
    oldSourceDatesRewritten: false, originalHistoricalCoverageUnchanged: true,
    nativeUnderstandingAcceptance: false, paidModelCalls: 0, executionRightsIssued: false } };
}

module.exports = { deriveNative };
