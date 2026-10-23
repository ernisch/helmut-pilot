"use strict";
// PREPARED only. No IO on import, source-only override or new execution authority.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { createHash } = require("node:crypto"), { TextDecoder } = require("node:util");
const ROOT = path.resolve(__dirname, "../.."), MODE = "verified-control-view-v1";
const DIR = "scripts/helmut-resource-meter/", REVIEW_DIR = "docs/betrieb/belege/current-control-source-qualification-20261023/";
const FILES = Object.freeze([DIR + "control-cache-integration.js", DIR + "control-cache-source-delta.json",
  DIR + "control-cache-native-qualification-20261023.SAFE.json", REVIEW_DIR + "ROOT_SOURCE_REVIEW_FINAL.SAFE.json",
  REVIEW_DIR + "INDEPENDENT_PUBLICATION_REVIEW.SAFE.json", REVIEW_DIR + "INDEPENDENT_ACTUAL_REVIEW.SAFE.json",
  REVIEW_DIR + "GENERATION_AUDIT.SAFE.json"]);
const COMMIT = "208e02ab9d80be79cc54cd132935b1347b411ddf";
const HARNESS = "/workspace/helmut-native-integration-checks-20261022/current-control-source-native-prepared-v2-20261023/";
const CASES = HARNESS + "cases/";
const U = "lib/helmut/llm-usage-atomic.js", PARTS = "lib/helmut/auth-state-parts.js";
const BASELINE_ARM = Object.freeze([
  { file: U, bytes: 25446, sha256: "93917a57bf8714baea2a21a7ed06fbc6aeb2cd8081f54093b70b7134d0a31c3b" },
  { file: PARTS, bytes: 22169, sha256: "f30089e790f2ac8bee306385a92f39440d5001ff84d22874b9e808540f469d63" }
]);
const CURRENT = Object.freeze([
  { file: U, bytes: 32050, sha256: "dc12a5c8abf7a7b4f4334ff0b886106b42381efa864ac13d4374285242886d0a" },
  { file: PARTS, bytes: 27356, sha256: "0ff039245d60ceb7f5855f62433feab0ae0eea989606d3ad8022510a8d1d80a3" }
]);
const SOURCE_REVIEW_PIN = Object.freeze({ name: "ROOT_SOURCE_REVIEW_FINAL.SAFE.json", bytes: 3718,
  sha256: "94e97fafedcdb47c383ab73d308596615df4ff60e4c90cdd306b5c64f05d1d10" });
// Required immutable joins. V1 values must never stand in for the pending V2 freeze.
// No future native-proof SHA belongs in this code; only the separate data artifact gets it.
const FROZEN = Object.freeze({
  nativePreparedPin: { path:HARNESS + "launcher/PREPARED.SAFE.json", bytes:35924,
    sha256:"f6e4d3e20e903b7f193da419e074973a56767baab1554232e089f48e705313b7" },
  sourceFreezePin: { bytes:5599, sha256:"552820cc8ad57cae5e3e5c745af7ae148090bc9f72c88f6922b74d5652a92f07" },
  verifierPreparedPin: { path:HARNESS + "verifier/PREPARED.SAFE.json", bytes:2372,
    sha256:"68f10ad62a4be64e01adc895aa541a678b14a39fb96091f84ac939f5521d9295" },
  verifierSourcePin: { path:HARNESS + "verifier/generate_native_source_proof.py", bytes:56601,
    sha256:"4395ec3cf446a78ee81d63c165a6f8758b7631ef1ae2f3c8a88a7193a2240898" },
  proofSchemaPin: { path:HARNESS + "verifier/NATIVE_PROOF_SCHEMA.json", bytes:11866,
    sha256:"ce32a6005f7856bacf0864c80a83c4eabe590a1405b7cbe9fe675d359b9ecb9a" },
  casePlanPath:HARNESS + "ROOT_CASE_PLAN_V2.SAFE.json" });
const MAX = 256 * 1024, sha = b => createHash("sha256").update(b).digest("hex");
const CORE = ["caseId", "nativePreparedPin", "actualResultPin", "workerResultPin", "stopReceiptPin", "status",
  "workerPass", "workerExitCode", "postgresExitCode", "postgrestRawReturnCode", "oomCount", "oomKillCount",
  "allOwnedProcessesExited", "nativeGroupEmpty", "fullLastProcessExitCovered", "sourceUnchanged",
  "postgrestStopQualified", "catalogQualified", "originalStateRestored", "measurementMode", "variant", "authRPCCount", "nodeStarted"];
const CONTROL = ["sourcePins", "lifecycleActualResultPin", "controlObservationPin", "nodeExitCode",
  "nodeHeapAndExitReceiptsPassed", "rpcResponsesCompleted", "nativeHTTPSendCount", "fullReadCount", "writeCount",
  "controlReadCount", "realWireAndSelectedUVerified", "requestResponseBindingsVerified", "freshNativeChecksAccepted",
  "detachedControlViewsVerified", "mutationAndRestorationVerified", "authorizedRevisionDeltaQualified"];
const PROOF_KEYS = ["schema", "status", "scope", "mode", "candidateCommit", "sourceFreezePin", "sourcePins",
  "baselineArmSources", "independentCodeReviewPin", "integrationGateSourceSHA256", "integrationGateExecutionProven",
  "privateActualPinsVerifiedByRoot", "nativePreparedPin", "lifecycle", "comparisonCases", "providerCalls",
  "production", "full500Accepted", "ramBenefitClaimed", "automaticRetry"];
function keys(value, expected) {
  assert(value && typeof value === "object" && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort());
}
function pinShape(p, named = false, maximum = 4 * 1024 * 1024) {
  keys(p, [named ? "name" : "path", "bytes", "sha256"]);
  assert(Number.isSafeInteger(p.bytes) && p.bytes > 0 && p.bytes <= maximum);
  assert.match(p.sha256, /^[a-f0-9]{64}$/);
  if (named) assert.equal(path.basename(p.name), p.name);
  else assert(path.isAbsolute(p.path) && path.normalize(p.path) === p.path && !p.path.includes("\0"));
}
function sameBytes(a, b) {
  assert.deepEqual({ bytes: a.bytes, sha256: a.sha256 }, { bytes: b.bytes, sha256: b.sha256 });
}
function readBytes(file, p = null) {
  assert(FILES.includes(file) || CURRENT.some(x => x.file === file));
  if (p) { pinShape(p, true, MAX); assert.equal(p.name, path.basename(file)); }
  const absolute = path.join(ROOT, file), before = fs.lstatSync(absolute);
  assert(before.isFile() && !before.isSymbolicLink()); assert.equal(fs.realpathSync(absolute), absolute);
  const fd = fs.openSync(absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const st = fs.fstatSync(fd); assert(st.isFile());
    assert.equal(st.dev, before.dev); assert.equal(st.ino, before.ino);
    assert(st.size > 0 && st.size <= MAX); if (p) assert.equal(st.size, p.bytes);
    const b = Buffer.alloc(st.size + 1); let n = 0, count;
    while (n < b.length && (count = fs.readSync(fd, b, n, b.length - n, null)) > 0) n += count;
    const after = fs.fstatSync(fd), current = fs.lstatSync(absolute);
    assert.equal(n, st.size);
    for (const key of ["dev", "ino", "size", "mtimeMs", "ctimeMs"]) {
      assert.equal(after[key], st[key]); assert.equal(current[key], st[key]);
    }
    assert(current.isFile() && !current.isSymbolicLink()); assert.equal(fs.realpathSync(absolute), absolute);
    const raw = b.subarray(0, n); if (p) assert.equal(sha(raw), p.sha256, "Control pair proof/source drift");
    return raw;
  } finally { fs.closeSync(fd); }
}
function json(file, p = null) { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(readBytes(file, p))); }
function frozenBindings() {
  for (const key of ["nativePreparedPin", "verifierPreparedPin", "verifierSourcePin", "proofSchemaPin"])
    pinShape(FROZEN[key]);
  assert.equal(FROZEN.nativePreparedPin.path, HARNESS + "launcher/PREPARED.SAFE.json");
  assert.equal(FROZEN.verifierPreparedPin.path, HARNESS + "verifier/PREPARED.SAFE.json");
  assert.equal(FROZEN.verifierSourcePin.path, HARNESS + "verifier/generate_native_source_proof.py");
  assert.equal(FROZEN.proofSchemaPin.path, HARNESS + "verifier/NATIVE_PROOF_SCHEMA.json");
  keys(FROZEN.sourceFreezePin, ["bytes", "sha256"]);
  assert(Number.isSafeInteger(FROZEN.sourceFreezePin.bytes) && FROZEN.sourceFreezePin.bytes > 0);
  assert.match(FROZEN.sourceFreezePin.sha256, /^[a-f0-9]{64}$/);
  assert.equal(typeof FROZEN.casePlanPath, "string");
  assert.equal(path.dirname(FROZEN.casePlanPath) + "/", HARNESS);
}
function sameCasePin(p, caseId, name) {
  pinShape(p); assert.equal(p.path, CASES + caseId + "/" + name);
}
function closure(c, preparedPin) {
  assert.match(c.caseId, /^control-[a-f0-9]{24}$/); assert.deepEqual(c.nativePreparedPin, preparedPin);
  for (const [key, name] of [["actualResultPin", "ACTUAL_RESULT.SAFE.json"], ["workerResultPin", "WORKER_RESULT.SAFE.json"],
    ["stopReceiptPin", "POSTGREST_STOP.SAFE.json"]]) sameCasePin(c[key], c.caseId, name);
  assert.equal(c.status, "PASS"); assert.equal(c.workerPass, true); assert.equal(c.workerExitCode, 0);
  for (const key of ["allOwnedProcessesExited", "nativeGroupEmpty", "fullLastProcessExitCovered", "sourceUnchanged",
    "postgrestStopQualified", "catalogQualified", "originalStateRestored"]) assert.equal(c[key], true);
  assert.equal(c.postgresExitCode, 0); assert.equal(c.oomCount, 0); assert.equal(c.oomKillCount, 0);
  assert([-2, -15, 0].includes(c.postgrestRawReturnCode));
}
function sourceReview(review) {
  assert.equal(review.schema, "helmut-original-small-mutation-root-source-review/1");
  assert.equal(review.reviewResult, "PASS"); assert.equal(review.reviewer, "root");
  assert.equal(review.independentReviewer, "typed_cleanup_guard");
  assert.equal(review.independentFullAndDeltaReviewResult, "PASS");
  for (const source of CURRENT) assert.deepEqual(review.sourcePinsVerifiedAgainstRootIntegration.filter(p =>
    p.path === "/workspace/helmut-unit60-native-20261022/" + source.file),
  [{ path: "/workspace/helmut-unit60-native-20261022/" + source.file, bytes: source.bytes, sha256: source.sha256 }]);
  for (const key of ["unit60Qualified", "reserveQualified", "full500Authorized", "actualNativeOrDatabaseOrProviderExecutionByThisReview"])
    assert.equal(review[key], false);
  // Other reviewed writer/test pins are provenance, not acceptance of later timing changes.
}
function sourceDelta(d) {
  assert.equal(d.schema, "helmut-control-cache-source-delta/2"); assert.equal(d.mode, MODE);
  assert.equal(d.candidateCommit, COMMIT); assert.equal(d.production, false); assert.equal(d.full500Accepted, false);
  assert.equal(d.requiresFreshIntegrationAcceptance, true); assert.equal(d.ramBenefitClaimed, false);
  assert.equal(d.historicalAcceptanceTransferred, false);
  assert.deepEqual(d.historicalSources, BASELINE_ARM); assert.deepEqual(d.nativeBaselineArmSources, BASELINE_ARM);
  assert.deepEqual(d.currentSources, CURRENT);
  assert.equal(d.retainedControlPayloadCapBytes, 2097152); assert.equal(d.maxDecodedTextBytes, 268435456);
  const q = d.currentQualification;
  assert.equal(q.qualified, true, "Control pair is PENDING/NOT_QUALIFIED");
  assert.equal(q.status, "QUALIFIED_NATIVE_COMPONENT_SOURCE_DELTA");
  assert.deepEqual(q.independentCodeReviewPin, SOURCE_REVIEW_PIN);
  for (const key of ["nativeProofPin", "independentPublicationReviewPin", "independentActualReviewPin", "generationAuditPin"])
    pinShape(q[key], true, MAX);
  pinShape(q.integrationGateOriginalPin); pinShape(q.nativePreparedPin); pinShape(q.casePlanPin);
  return q;
}
// Pure semantic validator. It creates no receipt/authority and is also the narrow test seam.
// Positive tests must use the genuine generated five-case SAFE bundle, never invented originals.
function validateQualification({ data: d, native, review, publication, actualReview, audit, gatePin }) {
  frozenBindings(); sourceReview(review); pinShape(gatePin);
  const q = sourceDelta(d); assert.equal(d.integrationGateSourceSHA256, gatePin.sha256);
  keys(native, PROOF_KEYS);
  assert.equal(native.schema, "helmut-control-cache-native-source-qualification/2");
  assert.equal(native.status, "passed"); assert.equal(native.scope, "LOCAL_COMPONENT_ONLY");
  assert.equal(native.mode, MODE); assert.equal(native.candidateCommit, COMMIT);
  assert.deepEqual(native.sourceFreezePin, FROZEN.sourceFreezePin);
  assert.deepEqual(native.sourcePins, CURRENT); assert.deepEqual(native.baselineArmSources, BASELINE_ARM);
  assert.deepEqual(native.independentCodeReviewPin, SOURCE_REVIEW_PIN);
  assert.equal(native.integrationGateSourceSHA256, gatePin.sha256);
  assert.equal(native.integrationGateExecutionProven, false); assert.equal(native.privateActualPinsVerifiedByRoot, true);
  for (const key of ["production", "full500Accepted", "ramBenefitClaimed", "automaticRetry"]) assert.equal(native[key], false);
  assert.equal(native.providerCalls, 0); assert.deepEqual(native.nativePreparedPin, FROZEN.nativePreparedPin);
  assert.deepEqual(q.nativePreparedPin, native.nativePreparedPin);
  const life = native.lifecycle; keys(life, CORE); closure(life, native.nativePreparedPin);
  assert.equal(life.measurementMode, "lifecycle-only"); assert.equal(life.variant, "NONE");
  assert.equal(life.authRPCCount, 0); assert.equal(life.nodeStarted, false);
  assert(Array.isArray(native.comparisonCases)); assert.equal(native.comparisonCases.length, 4);
  const ids = new Set([life.caseId]);
  for (const [index, variant] of ["OLD", "NEW", "NEW", "OLD"].entries()) {
    const c = native.comparisonCases[index]; keys(c, [...CORE, ...CONTROL]); closure(c, native.nativePreparedPin);
    assert(!ids.has(c.caseId)); ids.add(c.caseId);
    assert.equal(c.variant, variant); assert.equal(c.measurementMode, "control-cache");
    assert.deepEqual(c.sourcePins, variant === "OLD" ? BASELINE_ARM : CURRENT);
    assert.deepEqual(c.lifecycleActualResultPin, life.actualResultPin);
    sameCasePin(c.controlObservationPin, c.caseId, "CONTROL_CACHE.SAFE.json");
    assert.equal(c.nodeStarted, true); assert.equal(c.nodeExitCode, 0); assert.equal(c.nodeHeapAndExitReceiptsPassed, true);
    for (const [key, value] of Object.entries({ authRPCCount:27, rpcResponsesCompleted:27, nativeHTTPSendCount:27,
      fullReadCount:5, writeCount:4, controlReadCount:18 })) assert.equal(c[key], value);
    for (const key of ["realWireAndSelectedUVerified", "requestResponseBindingsVerified", "freshNativeChecksAccepted",
      "detachedControlViewsVerified", "mutationAndRestorationVerified", "authorizedRevisionDeltaQualified"])
      assert.equal(c[key], true);
  }
  const orderedActuals = [life, ...native.comparisonCases].map(c => c.actualResultPin);
  assert.equal(audit.schema, "helmut-control-cache-native-source-proof-generation/1");
  assert.equal(audit.status, "ROOT_OFFLINE_ACTUAL_EVIDENCE_VERIFIED");
  assert.deepEqual(audit.nativePreparedPin, FROZEN.nativePreparedPin);
  assert.deepEqual(audit.generatorPreparedPin, FROZEN.verifierPreparedPin);
  assert.deepEqual(audit.generatorSourcePin, FROZEN.verifierSourcePin);
  assert.deepEqual(audit.proofSchemaPin, FROZEN.proofSchemaPin);
  assert.deepEqual(audit.integrationSourceGatePin, gatePin);
  pinShape(audit.generatedProofPin); sameBytes(audit.generatedProofPin, q.nativeProofPin);
  assert.equal(path.basename(audit.generatedProofPin.path), path.basename(FILES[2]));
  pinShape(audit.independentActualReviewPin); sameBytes(audit.independentActualReviewPin, q.independentActualReviewPin);
  pinShape(audit.casePlanPin); assert.equal(audit.casePlanPin.path, FROZEN.casePlanPath);
  assert.deepEqual(q.casePlanPin, audit.casePlanPin);
  assert.deepEqual(audit.independentlyReviewedActualResultPins, orderedActuals);
  for (const key of ["sourcePGDATARead", "newCompleteMotorPathExecuted", "ramBenefitClaimed", "full500Accepted", "production"])
    assert.equal(audit[key], false);
  for (const key of ["subjectImports", "testsExecuted", "containersStarted", "sqlExecuted"]) assert.equal(audit[key], 0);
  assert.equal(audit.semanticComparison.nativeProof.count, 6000);
  assert.match(audit.semanticComparison.history, /^[a-f0-9]{64}$/);
  assert.equal(audit.semanticComparison.controlTextBytes, 4856607);
  keys(audit.semanticComparison.controlFields, ["synthetik500DispatchJournal", "synthetik500KostenAdmission", "testKostenAuftrag", "testKostenTage"]);
  for (const digest of Object.values(audit.semanticComparison.controlFields)) assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(actualReview.schema, "helmut-current-control-native-independent-actual-review/1");
  assert.equal(actualReview.independent, true); assert.equal(actualReview.status, "PASS");
  assert.deepEqual(actualReview.blockingFindings, []);
  assert.deepEqual(actualReview.nativePreparedPin, FROZEN.nativePreparedPin);
  assert.deepEqual(actualReview.casePlanPin, audit.casePlanPin); assert.deepEqual(actualReview.actualResultPins, orderedActuals);
  assert.equal(publication.schema, "helmut-current-control-native-publication-review/1");
  assert.equal(publication.independent, true); assert.equal(publication.status, "PASS");
  assert.deepEqual(publication.blockingFindings, []);
  assert.deepEqual(publication.nativePreparedPin, FROZEN.nativePreparedPin);
  assert.deepEqual(publication.verifierPreparedPin, FROZEN.verifierPreparedPin);
  assert.deepEqual(publication.sourceFreezePin, FROZEN.sourceFreezePin);
  assert.deepEqual(publication.proofSchemaPin, FROZEN.proofSchemaPin); assert.deepEqual(publication.integrationGatePin, gatePin);
}
function acceptance() {
  assert.equal(arguments.length, 0, "No sourceOnly/test override accepted");
  const d = json(FILES[1]), q = sourceDelta(d);
  const rawGate = readBytes(FILES[0]); assert.equal(d.integrationGateSourceSHA256, sha(rawGate));
  pinShape(q.integrationGateOriginalPin); sameBytes(q.integrationGateOriginalPin, { bytes:rawGate.length, sha256:sha(rawGate) });
  for (const p of CURRENT) readBytes(p.file, { name:path.basename(p.file), bytes:p.bytes, sha256:p.sha256 });
  const native = json(FILES[2], q.nativeProofPin), review = json(FILES[3], SOURCE_REVIEW_PIN);
  const publication = json(FILES[4], q.independentPublicationReviewPin);
  const actualReview = json(FILES[5], q.independentActualReviewPin), audit = json(FILES[6], q.generationAuditPin);
  validateQualification({ data:d, native, review, publication, actualReview, audit, gatePin:q.integrationGateOriginalPin });
  return { schema:"helmut-control-cache-source-acceptance/1", mode:MODE, candidateCommit:COMMIT,
    acceptedLocalCacheDelta:true, production:false, full500Accepted:false, ramBenefitClaimed:false,
    requiresFreshIntegrationAcceptance:true, currentSources:d.currentSources, nativeBaselineArmSources:d.nativeBaselineArmSources,
    integrationGateSourceSHA256:sha(rawGate), currentQualification:q };
}
module.exports = Object.freeze({ MODE, FILES, acceptance, validateQualification });
