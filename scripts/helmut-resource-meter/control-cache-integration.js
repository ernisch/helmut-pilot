"use strict";
// Inert local Control source gate. No IO on import; no sourceOnly authority.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { createHash } = require("node:crypto"), { TextDecoder } = require("node:util");
const ROOT = path.resolve(__dirname, "../.."), MODE = "verified-control-view-v1";
const DIR = "scripts/helmut-resource-meter/";
const FILES = Object.freeze([DIR + "control-cache-integration.js", DIR + "control-cache-source-delta.json",
  DIR + "control-cache-native-qualification-20261020.SAFE.json",
  "docs/betrieb/bounded-control-cache-code-sol-review-20261020.SAFE.json"]);
const COMMIT = "67b5c4ef8ccd482d726126f8bbc41a00ee4151a3";
const U = "lib/helmut/llm-usage-atomic.js", PARTS = "lib/helmut/auth-state-parts.js";
const ORIGINAL = Object.freeze([
  { file: U, bytes: 23685, sha256: "31a0b8d323e7db43751af2ad2cf5c2c9c95fc2d65fcc765e65ec0ac436e5f8a0" },
  { file: PARTS, bytes: 22149, sha256: "6b1236aec6858a03dc099e272bdcdd9f79df3efa8c8744d42c5e193e5d57b3d9" }
]);
const CURRENT = Object.freeze([
  { file: U, bytes: 25446, sha256: "93917a57bf8714baea2a21a7ed06fbc6aeb2cd8081f54093b70b7134d0a31c3b" },
  { file: PARTS, bytes: 22169, sha256: "f30089e790f2ac8bee306385a92f39440d5001ff84d22874b9e808540f469d63" }
]);
// Native OLD uses the export-only COMMON_PARTS too; historical Parts6b is NOT its runtime.
const BASELINE_ARM = Object.freeze([ORIGINAL[0], CURRENT[1]]);
const REVIEW_PIN = Object.freeze({ name: path.basename(FILES[3]), bytes: 8663,
  sha256: "8f6544d3ebbc6e0489d940056c053480313ae66daa4844721965a7cf356acee3" });
const FREEZE_PIN = Object.freeze({ bytes: 4265,
  sha256: "5ce7e3658d7ef9e33631879992224d9cd78ac34b6ce09f01dd50580b330275b8" });
const CASES = "/workspace/helmut-ram-fix-20261020/control-cache-comparison-20261020/cases/";
const MAX = 256 * 1024, sha = b => createHash("sha256").update(b).digest("hex");
function pinShape(p, maximum = MAX) {
  assert(p && Number.isSafeInteger(p.bytes) && p.bytes > 0 && p.bytes <= maximum);
  assert.equal(typeof p.sha256, "string");assert.match(p.sha256, /^[a-f0-9]{64}$/);
}
function readBytes(file, p = null) {
  assert(FILES.includes(file) || CURRENT.some(x => x.file === file));
  if (p) { pinShape(p);assert.equal(p.name, path.basename(file)); }
  const absolute = path.join(ROOT, file), before = fs.lstatSync(absolute);
  assert(before.isFile() && !before.isSymbolicLink());assert.equal(fs.realpathSync(absolute), absolute);
  const fd = fs.openSync(absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const st = fs.fstatSync(fd);assert(st.isFile());
    assert.equal(st.dev, before.dev);assert.equal(st.ino, before.ino);
    assert(st.size > 0 && st.size <= MAX);if (p) assert.equal(st.size, p.bytes);
    const b = Buffer.alloc(st.size + 1);let n = 0, count;
    while (n < b.length && (count = fs.readSync(fd, b, n, b.length - n, null)) > 0) n += count;
    const after = fs.fstatSync(fd), current = fs.lstatSync(absolute);
    assert.equal(n, st.size);
    for (const key of ["dev", "ino", "size", "mtimeMs", "ctimeMs"]) {
      assert.equal(after[key], st[key]);assert.equal(current[key], st[key]);
    }
    assert(current.isFile() && !current.isSymbolicLink());assert.equal(fs.realpathSync(absolute), absolute);
    const bytes = b.subarray(0, n);if (p) assert.equal(sha(bytes), p.sha256, "Control cache proof/source drift");
    return bytes;
  } finally { fs.closeSync(fd); }
}
function json(file, p = null) { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(readBytes(file, p))); }
function provenancePin(p, expectedPath = null) {
  pinShape(p, 4 * 1024 * 1024);assert.equal(typeof p.path, "string");
  assert(path.isAbsolute(p.path) && path.normalize(p.path) === p.path);
  if (expectedPath) assert.equal(p.path, expectedPath);
}
function sameCasePin(p, caseId, basename) { provenancePin(p, CASES + caseId + "/" + basename); }
function caseClosure(c, preparedPin) {
  assert.match(c.caseId, /^control-[a-f0-9]{24}$/);assert.deepEqual(c.nativePreparedPin, preparedPin);
  for (const [key, basename] of [["actualResultPin", "ACTUAL_RESULT.SAFE.json"],
    ["workerResultPin", "WORKER_RESULT.SAFE.json"], ["stopReceiptPin", "POSTGREST_STOP.SAFE.json"]])
    sameCasePin(c[key], c.caseId, basename);
  assert.equal(c.status, "PASS");assert.equal(c.workerPass, true);assert.equal(c.workerExitCode, 0);
  for (const key of ["allOwnedProcessesExited", "nativeGroupEmpty", "fullLastProcessExitCovered",
    "sourceUnchanged", "postgrestStopQualified", "catalogQualified", "originalStateRestored"])
    assert.equal(c[key], true, "Native closure/identity not qualified: " + key);
  assert.equal(c.postgresExitCode, 0);assert.equal(c.oomCount, 0);assert.equal(c.oomKillCount, 0);
  assert([-2, -15, 0].includes(c.postgrestRawReturnCode));
}
function acceptance() {
  assert.equal(arguments.length, 0, "No sourceOnly/test override accepted");
  const d = json(FILES[1]);
  assert.equal(d.schema, "helmut-control-cache-source-delta/1");assert.equal(d.mode, MODE);
  assert.equal(d.candidateCommit, COMMIT);assert.equal(d.production, false);assert.equal(d.full500Accepted, false);
  assert.equal(d.requiresFreshIntegrationAcceptance, true);assert.equal(d.ramBenefitClaimed, false);
  assert.deepEqual(d.historicalSources, ORIGINAL);assert.deepEqual(d.currentSources, CURRENT);
  assert.deepEqual(d.nativeBaselineArmSources, BASELINE_ARM);
  assert.equal(d.retainedControlPayloadCapBytes, 2097152);assert.equal(d.maxDecodedTextBytes, 268435456);
  const gateSHA256 = sha(readBytes(FILES[0]));assert.equal(d.integrationGateSourceSHA256, gateSHA256);
  for (const p of CURRENT) readBytes(p.file, { name: path.basename(p.file), bytes: p.bytes, sha256: p.sha256 });
  const q = d.currentQualification;
  assert.equal(q.qualified, true, "Control cache delta is PENDING/NOT_QUALIFIED");
  assert.equal(q.status, "QUALIFIED_NATIVE_COMPONENT_SOURCE_DELTA");
  assert.deepEqual(q.independentCodeReviewPin, REVIEW_PIN);
  pinShape(q.nativeProofPin);assert.equal(q.nativeProofPin.name, path.basename(FILES[2]));
  const review = json(FILES[3], REVIEW_PIN), native = json(FILES[2], q.nativeProofPin);
  assert.equal(review.schema, "helmut-bounded-control-cache-independent-static-sol-review/1");
  assert.equal(review.status, "SAFE_INDEPENDENT_CODE_REVIEW_NO_CRITICAL_BLOCKERS_FOUND");
  assert.equal(review.commit, COMMIT);assert.equal(review.reviewerSourceCodeChanged, false);
  assert.equal(review.nativeQualification, "NOT_QUALIFIED_BY_THIS_REVIEW");
  assert.equal(review.integrationOrSourceDescriptorAcceptanceTransferred, false);
  assert.equal(review.production, false);assert.equal(review.full500, false);
  assert.deepEqual({ bytes: review.preparedPin.bytes, sha256: review.preparedPin.sha256 }, FREEZE_PIN);
  // Read exact old proof bytes; map its known candidate paths without following private paths at runtime.
  for (const p of CURRENT) assert.deepEqual(review.sourcePins.filter(x => x.path.endsWith("/" + p.file)),
    [{ path: "/workspace/helmut-control-cache-sol-20261020/" + p.file, bytes: p.bytes, sha256: p.sha256 }]);
  assert.equal(native.schema, "helmut-control-cache-native-source-qualification/1");
  assert.equal(native.status, "passed");assert.equal(native.scope, "LOCAL_COMPONENT_ONLY");
  assert.equal(native.mode, MODE);assert.equal(native.candidateCommit, COMMIT);
  assert.deepEqual(native.sourceFreezePin, FREEZE_PIN);assert.deepEqual(native.sourcePins, CURRENT);
  assert.deepEqual(native.baselineArmSources, BASELINE_ARM);assert.deepEqual(native.independentCodeReviewPin, REVIEW_PIN);
  assert.equal(native.integrationGateSourceSHA256, gateSHA256);
  assert.equal(native.integrationGateExecutionProven, false);
  for (const key of ["production", "full500Accepted", "ramBenefitClaimed", "automaticRetry"])
    assert.equal(native[key], false);
  assert.equal(native.providerCalls, 0);assert.equal(native.privateActualPinsVerifiedByRoot, true);
  // Private raw-result pins below are Root-verified provenance. Only this complete, hash-verified
  // repo SAFE proof and the exact independent review are read by the runtime gate.
  provenancePin(native.nativePreparedPin);assert.equal(path.basename(native.nativePreparedPin.path), "PREPARED.SAFE.json");
  assert.deepEqual(q.nativePreparedPin, native.nativePreparedPin);
  const life = native.lifecycle;caseClosure(life, native.nativePreparedPin);
  assert.equal(life.measurementMode, "lifecycle-only");assert.equal(life.variant, "NONE");
  assert.equal(life.authRPCCount, 0);assert.equal(life.nodeStarted, false);
  assert.equal(native.comparisonCases.length, 4);const ids = new Set([life.caseId]);
  for (const [index, variant] of ["OLD", "NEW", "NEW", "OLD"].entries()) {
    const c = native.comparisonCases[index];caseClosure(c, native.nativePreparedPin);
    assert(!ids.has(c.caseId));ids.add(c.caseId);
    assert.equal(c.variant, variant);assert.equal(c.measurementMode, "control-cache");
    assert.deepEqual(c.lifecycleActualResultPin, life.actualResultPin);
    assert.deepEqual(c.sourcePins, variant === "OLD" ? BASELINE_ARM : CURRENT);
    sameCasePin(c.controlObservationPin, c.caseId, "CONTROL_CACHE.SAFE.json");
    assert.equal(c.nodeStarted, true);assert.equal(c.nodeExitCode, 0);
    assert.equal(c.nodeHeapAndExitReceiptsPassed, true);
    assert.equal(c.authRPCCount, 27);assert.equal(c.rpcResponsesCompleted, 27);
    assert.equal(c.nativeHTTPSendCount, 27);assert.equal(c.fullReadCount, 5);
    assert.equal(c.writeCount, 4);assert.equal(c.controlReadCount, 18);
    for (const key of ["realWireAndSelectedUVerified", "requestResponseBindingsVerified",
      "freshNativeChecksAccepted", "detachedControlViewsVerified", "mutationAndRestorationVerified",
      "authorizedRevisionDeltaQualified"])
      assert.equal(c[key], true);
  }
  return { schema: "helmut-control-cache-source-acceptance/1", mode: MODE,
    candidateCommit: COMMIT, acceptedLocalCacheDelta: true, production: false, full500Accepted: false,
    ramBenefitClaimed: false, requiresFreshIntegrationAcceptance: true,
    currentSources: d.currentSources, nativeBaselineArmSources: d.nativeBaselineArmSources,
    integrationGateSourceSHA256: gateSHA256, currentQualification: q };
}
module.exports = Object.freeze({ MODE, FILES, acceptance });
