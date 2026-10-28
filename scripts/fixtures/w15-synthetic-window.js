"use strict";

// Explicit synthetic performance inputs only. A derived publication timestamp
// is not news, a fresh source reading or a current professional/Production GO.
const A = require("../../lib/helmut/briefing-aussagenbindung");
const F = require("../../lib/helmut/briefing-fachurteil");
const B = require("../../lib/helmut/briefing-lagebindung");
const { hash } = require("../../lib/helmut/briefing-speicher");
const { rebindOrdinaryRow, describeChangedPaths } = require("./w15-local-calendar");
const SCOPE = "SYNTHETIC_PERFORMANCE_FIXTURE_NOT_NEWS_OR_PRODUCTION";
const SOURCE_ID = "rd-691117a4712de0582634fca3081d3ee6c2d6a65c3c4360086dd5caffbd44800d";
const ORIGINAL_TIME = "2026-10-13T11:02:48+00:00";
const demand = (ok, code) => { if (!ok) throw Error("w15-synthetic-window-" + code); };
const part = key => String(key).replaceAll("~", "~0").replaceAll("/", "~1");

function sourceTime(executionISO) {
  demand(typeof executionISO === "string", "execution-time-required");
  const date = new Date(executionISO);
  demand(Number.isFinite(date.getTime()) && date.toISOString() === executionISO,
    "canonical-execution-time-required");
  const day = new Date(Date.parse(executionISO.slice(0, 10) + "T00:00:00.000Z") - 2 * 86400000)
    .toISOString().slice(0, 10);
  const synthetic = day + "T11:02:48+00:00";
  demand(synthetic !== ORIGINAL_TIME && Date.parse(synthetic) < date.getTime(), "distinct-past-synthetic-day-required");
  return synthetic;
}
function changeSource(document, synthetic, pointer, allowed, changes) {
  if (document?.id !== SOURCE_ID) return false;
  demand(document.published_at === ORIGINAL_TIME, "unexpected-original-source-time");
  const before = hash(document); document.published_at = synthetic;
  allowed.add(pointer + "/published_at");
  changes.push({ path: pointer + "/published_at", originalHash: before, derivedHash: hash(document) });
  return true;
}
function report(changedPaths, changes, synthetic) {
  return { scope: SCOPE, changedSourceCount: 1, changedSourceCountMeaning: "one unique source ID, including its bound copies",
    sourceId: SOURCE_ID, originalPublishedAt: ORIGINAL_TIME, syntheticPublishedAt: synthetic,
    changedPaths, sourceVersionChanges: changes, originalFilesModified: false,
    currentNewsClaimed: false, freshSourceReadingClaimed: false,
    currentProfessionalOrProductionApprovalClaimed: false, executionRightsIssued: false };
}

function deriveRow(originalRow, executionISO) {
  const originalRowHash = hash(originalRow), synthetic = sourceTime(executionISO);
  // This performs the actual B/A/F checks on the original historical day and
  // again on the calendar-only local fixture, with no replaced validator.
  const calendar = rebindOrdinaryRow(originalRow, executionISO), row = calendar.row;
  const basis = row.briefingEingabe, allowed = new Set(calendar.report.changedPaths), changes = [];
  demand(Array.isArray(row.sources?.documents), "source-documents-required");
  let primaryMatches = 0;
  row.sources.documents.forEach((document, index) => {
    if (changeSource(document, synthetic, "/sources/documents/" + index, allowed, changes)) primaryMatches++;
  });
  demand(primaryMatches === 1, "exactly-one-primary-source-required");
  demand(basis.korrekturBasis?.sourcesByVorgang && typeof basis.korrekturBasis.sourcesByVorgang === "object",
    "correction-sources-required");
  for (const [vorgangId, documents] of Object.entries(basis.korrekturBasis.sourcesByVorgang)) {
    demand(Array.isArray(documents), "correction-source-array-required");
    documents.forEach((document, index) => changeSource(document, synthetic,
      "/briefingEingabe/korrekturBasis/sourcesByVorgang/" + part(vorgangId) + "/" + index, allowed, changes));
  }
  const oldInput = basis.eingabe;
  const rebuilt = A.baueEingabe({ briefing: basis.briefing,
    sourcesByVorgang: basis.korrekturBasis.sourcesByVorgang, profile: row.profile, userId: row.profile.id,
    day: oldInput.tag, kos: basis.korrekturBasis.kos, korrekturHash: oldInput.korrekturHash });
  const inputAllowed = new Set(["/eingabeHash"]);
  oldInput.quellen.forEach((q, index) => {
    if (q.documentId === SOURCE_ID) inputAllowed.add("/quellen/" + index + "/veroeffentlichtAm");
  });
  demand(describeChangedPaths(oldInput, rebuilt).every(p => inputAllowed.has(p)), "unexpected-source-contract-change");
  for (const p of inputAllowed) allowed.add("/briefingEingabe/eingabe" + p);
  basis.eingabe = rebuilt;
  basis.urteil.eingabeHash = rebuilt.eingabeHash;
  basis.urteil.gesamtpruefung.umfang.eingabeHash = rebuilt.eingabeHash;
  allowed.add("/briefingEingabe/urteil/eingabeHash");
  allowed.add("/briefingEingabe/urteil/gesamtpruefung/umfang/eingabeHash");
  const sourceReviewChanges = [];
  basis.urteil.gesamtpruefung.quellen.forEach((review, index) => {
    if (review.documentId !== SOURCE_ID) return;
    const matches = q => q.documentId === SOURCE_ID && q.vorgangId === review.vorgangId;
    const oldSources = oldInput.quellen.filter(matches), nextSources = rebuilt.quellen.filter(matches);
    demand(oldSources.length === 1 && nextSources.length === 1, "unique-reviewed-source-required");
    const originalHash = hash(oldSources[0]), derivedHash = hash(nextSources[0]);
    demand(review.quellenHash === originalHash, "original-source-review-hash-mismatch");
    review.quellenHash = derivedHash;
    const pointer = "/briefingEingabe/urteil/gesamtpruefung/quellen/" + index;
    allowed.add(pointer + "/quellenHash");
    if (Object.hasOwn(review, "lesebeleg")) {
      demand(review.lesebeleg.quellenHash === originalHash, "original-reading-note-hash-mismatch");
      review.lesebeleg.quellenHash = derivedHash;
      allowed.add(pointer + "/lesebeleg/quellenHash");
    }
    sourceReviewChanges.push({ path: pointer, originalHash, derivedHash,
      readingNoteHashRebound: Object.hasOwn(review, "lesebeleg"), readingDateAndTextUnchanged: true });
  });
  demand(A.pruefe(basis.eingabe, basis.urteil).bereit === true, "derived-statement-binding-rejected");
  demand(F.pruefe(basis, basis.urteil).bereit === true, "derived-whole-review-binding-rejected");
  B.pruefe(basis, row.profile, row.profile.id, new Date(executionISO));
  const changedPaths = describeChangedPaths(originalRow, row);
  demand(changedPaths.every(p => allowed.has(p)), "unlisted-change-forbidden");
  demand(hash(originalRow) === originalRowHash, "original-row-mutated");
  return { row, report: { ...report(changedPaths, changes, synthetic), originalRowHash, derivedRowHash: hash(row),
    originalInputHash: originalRow.briefingEingabe.eingabe.eingabeHash,
    calendarInputHash: calendar.report.derivedInputHash, derivedInputHash: basis.eingabe.eingabeHash,
    originalWholeReviewHash: hash(originalRow.briefingEingabe.urteil.gesamtpruefung),
    derivedWholeReviewHash: hash(basis.urteil.gesamtpruefung),
    calendar: calendar.report, sourceReviewChanges, originalObjectsUnchanged: true,
    professionalTextsAndCriteriaUnchanged: true, originalOriginAndDisplayHashesUnchanged: true,
    generatedAtAndOriginalReadingDatesUnchanged: true } };
}

function deriveNative(native, executionISO) {
  const originalNativeHash = hash(native), synthetic = sourceTime(executionISO);
  const derived = structuredClone(native), allowed = new Set(), changes = [];
  const K = require("../../lib/helmut/synthetik-500-kosten-plan");
  const V = require("../../lib/helmut/verstehen-vertrag");
  const route = native.costInputs?.routeContract;
  // Validate every original coverage binding before deriving any replacement.
  K.sourceVersions(native.documents, native.knowledgeObjects, native.clusters, K.ROUTE_INPUT_VERSION, route, null);
  const originalSources = K.sourceVersions(native.documents, native.knowledgeObjects, null, K.ROUTE_INPUT_VERSION, route, null);
  demand(Array.isArray(derived.documents), "native-documents-required");
  let matches = 0;
  derived.documents.forEach((entry, index) => {
    if (entry?.id !== SOURCE_ID && entry?.version?.id !== SOURCE_ID) return;
    demand(entry.id === SOURCE_ID && entry.version?.id === SOURCE_ID, "native-source-identity-mismatch");
    if (changeSource(entry.version, synthetic, "/documents/" + index + "/version", allowed, changes)) matches++;
  });
  demand(matches === 1, "exactly-one-native-source-required");
  const nextSources = K.sourceVersions(derived.documents, derived.knowledgeObjects, null, K.ROUTE_INPUT_VERSION, route, null);
  const oldById = new Map(originalSources.documents.map(document => [document.id, document]));
  const nextById = new Map(nextSources.documents.map(document => [document.id, document]));
  const oldByKey = new Map(originalSources.documents.map(document => [document.key, document]));
  const nextByKey = new Map(nextSources.documents.map(document => [document.key, document]));
  demand(oldById.size === originalSources.documents.length && nextById.size === oldById.size,
    "unique-native-document-identities-required");
  const replacements = new Map(), documentKeyChanges = [];
  for (const [id, before] of oldById) {
    const after = nextById.get(id); demand(after, "native-document-identity-lost");
    if (before.key !== after.key) {
      demand(id === SOURCE_ID, "unrelated-document-key-change");
      replacements.set(before.key, after.key);
      documentKeyChanges.push({ documentId: id, originalKey: before.key, derivedKey: after.key });
    }
  }
  demand(replacements.size === 1, "exactly-one-derived-document-key-required");
  function remapKeys(keys, pointer) {
    demand(Array.isArray(keys) && keys.every(key => oldByKey.has(key)), "unknown-original-cluster-key");
    const next = keys.map(key => replacements.get(key) || key).sort();
    for (const changed of describeChangedPaths(keys, next)) {
      demand(/^\/\d+$/.test(changed), "unexpected-key-array-change"); allowed.add(pointer + changed);
    }
    return next;
  }
  const clusterChanges = [];
  demand(Array.isArray(derived.clusters), "native-clusters-required");
  derived.clusters.forEach((cluster, index) => {
    if (!cluster.documentKeys.some(key => replacements.has(key))) return;
    demand(cluster.artikelkontextVersuch === null, "unsupported-bound-article-context");
    const base = "/clusters/" + index, oldKeys = cluster.documentKeys;
    const contractHash = (keys, documents) => V.eingabeHash({ vorgangId: cluster.vorgangId,
      modus: cluster.mode, koVersion: cluster.koVersion,
      dokumente: keys.map(key => { const document = documents.get(key); demand(document, "cluster-document-missing"); return { id: document.id }; }) });
    const originalContractInputHash = contractHash(oldKeys, oldByKey);
    cluster.documentKeys = remapKeys(oldKeys, base + "/documentKeys");
    const derivedContractInputHash = contractHash(cluster.documentKeys, nextByKey);
    if (cluster.coverage !== null) {
      demand(cluster.coverage.contractInputHash === originalContractInputHash, "original-coverage-contract-mismatch");
      cluster.coverage.documentKeys = remapKeys(cluster.coverage.documentKeys, base + "/coverage/documentKeys");
      if (derivedContractInputHash !== originalContractInputHash) {
        cluster.coverage.contractInputHash = derivedContractInputHash;
        allowed.add(base + "/coverage/contractInputHash");
      }
    }
    clusterChanges.push({ vorgangId: cluster.vorgangId, originalContractInputHash, derivedContractInputHash,
      contractHashChanged: originalContractInputHash !== derivedContractInputHash });
  });
  // The real generator validates the complete derived coverage and inventory.
  K.sourceVersions(derived.documents, derived.knowledgeObjects, derived.clusters, K.ROUTE_INPUT_VERSION, route, null);
  const changedPaths = describeChangedPaths(native, derived);
  demand(changedPaths.every(p => allowed.has(p)), "unexpected-native-change");
  demand(hash(native) === originalNativeHash, "original-native-mutated");
  return { native: derived, report: { ...report(changedPaths, changes, synthetic), originalNativeHash,
    derivedNativeHash: hash(derived), documentKeyChanges, clusterChanges,
    sourceAndCoverageKeysValidatedByActualGenerator: true,
    knowledgeObjectsUnchanged: true, manualVersionHashRewrite: false } };
}

module.exports = { deriveRow, deriveNative };
