"use strict";
// PREPARED, NOT RUN. No invented originals, FS mocks, subprocesses or test overrides.
// Requires the genuine five-case published SAFE bundle. Pending data fails; it never skips green.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const G = require("./helmut-resource-meter/control-cache-integration");
const ROOT = path.resolve(__dirname, ".."), read = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const data = read(G.FILES[1]);
assert.equal(data.currentQualification.qualified, true, "GENUINE_FIVE_CASE_BUNDLE_REQUIRED_NOT_A_SKIP");
assert.equal(G.acceptance().currentQualification.qualified, true);
const genuine = { data, native:read(G.FILES[2]), review:read(G.FILES[3]), publication:read(G.FILES[4]),
  actualReview:read(G.FILES[5]), audit:read(G.FILES[6]), gatePin:data.currentQualification.integrationGateOriginalPin };
G.validateQualification(genuine);
assert.throws(() => G.acceptance({ sourceOnly:true }));
assert.throws(() => G.acceptance(undefined));
let rejected = 0;
function reject(label, change) {
  const value = structuredClone(genuine); change(value);
  assert.throws(() => G.validateQualification(value), undefined, label); rejected++;
}
for (const schema of ["helmut-control-cache-native-source-qualification/1", "unknown"])
  reject("old/unknown proof schema", x => { x.native.schema = schema; });
reject("pending source data", x => { x.data.currentQualification.qualified = false; });
for (const key of ["nativeProofPin", "generationAuditPin", "independentActualReviewPin", "independentPublicationReviewPin"])
  reject("null actual publication pin", x => { x.data.currentQualification[key] = null; });
reject("historical source acceptance transferred", x => { x.data.historicalAcceptanceTransferred = true; });
reject("wrong candidate commit", x => { x.native.candidateCommit = "67b5c4ef8ccd482d726126f8bbc41a00ee4151a3"; });
reject("old source freeze", x => { x.native.sourceFreezePin.sha256 = "5ce7e3658d7ef9e33631879992224d9cd78ac34b6ce09f01dd50580b330275b8"; });
reject("wrong prepared root", x => { x.native.nativePreparedPin.path = x.native.nativePreparedPin.path.replace("prepared-v2", "prepared-v1"); });
reject("missing comparison arm", x => { x.native.comparisonCases.pop(); });
reject("duplicate lifecycle/comparison case", x => { x.native.comparisonCases[0] = structuredClone(x.native.comparisonCases[1]); });
reject("ABBA order changed", x => { [x.native.comparisonCases[0], x.native.comparisonCases[1]] = [x.native.comparisonCases[1], x.native.comparisonCases[0]]; });
reject("genuine OLD must retain OLD Parts too", x => { x.native.comparisonCases[0].sourcePins[1] = structuredClone(x.native.sourcePins[1]); });
reject("NEW cannot reuse OLD U", x => { x.native.comparisonCases[1].sourcePins[0] = structuredClone(x.native.baselineArmSources[0]); });
reject("lifecycle must not start Node", x => { x.native.lifecycle.nodeStarted = true; });
reject("lifecycle must have zero RPC", x => { x.native.lifecycle.authRPCCount = 27; });
for (const key of ["allOwnedProcessesExited", "nativeGroupEmpty", "fullLastProcessExitCovered", "sourceUnchanged",
  "postgrestStopQualified", "catalogQualified", "originalStateRestored"])
  for (const arm of [-1, 0, 1, 2, 3]) reject("each case independently closed", x => {
    (arm === -1 ? x.native.lifecycle : x.native.comparisonCases[arm])[key] = false;
  });
for (const key of ["workerExitCode", "postgresExitCode", "oomCount", "oomKillCount"])
  reject("failed process/kernel status", x => { x.native.comparisonCases[0][key] = 1; });
reject("unsupported PostgREST exit", x => { x.native.comparisonCases[0].postgrestRawReturnCode = 9; });
for (const key of ["authRPCCount", "rpcResponsesCompleted", "nativeHTTPSendCount", "fullReadCount", "writeCount", "controlReadCount"])
  reject("exact workload counters", x => { x.native.comparisonCases[0][key]--; });
for (const key of ["realWireAndSelectedUVerified", "requestResponseBindingsVerified", "freshNativeChecksAccepted",
  "detachedControlViewsVerified", "mutationAndRestorationVerified", "authorizedRevisionDeltaQualified", "nodeHeapAndExitReceiptsPassed"])
  reject("real control/history/restore checks required", x => { x.native.comparisonCases[0][key] = false; });
reject("wrong lifecycle result join", x => { x.native.comparisonCases[1].lifecycleActualResultPin = structuredClone(x.native.comparisonCases[0].actualResultPin); });
reject("foreign case file", x => { x.native.comparisonCases[0].stopReceiptPin.path += ".foreign"; });
reject("unknown proof field", x => { x.native.sourceOnly = true; });
reject("unknown case field", x => { x.native.comparisonCases[0].sourceOnly = true; });
for (const key of ["generatorPreparedPin", "generatorSourcePin", "proofSchemaPin", "integrationSourceGatePin"])
  reject("exact verifier/schema/gate join", x => { x.audit[key].sha256 = "0".repeat(64); });
reject("audit proof bytes mismatch", x => { x.audit.generatedProofPin.bytes++; });
reject("audit actual review mismatch", x => { x.audit.independentActualReviewPin.sha256 = "0".repeat(64); });
reject("audit reordered actual results", x => { x.audit.independentlyReviewedActualResultPins.reverse(); });
reject("old logical history", x => { x.audit.semanticComparison.nativeProof.count = 5999; });
reject("wrong control text fixture", x => { x.audit.semanticComparison.controlTextBytes--; });
reject("offline verifier must not read PGDATA", x => { x.audit.sourcePGDATARead = true; });
reject("actual reviewer missing fifth result", x => { x.actualReview.actualResultPins.pop(); });
reject("actual reviewer wrong plan", x => { x.actualReview.casePlanPin.sha256 = "0".repeat(64); });
for (const field of ["actualReview", "publication"]) {
  reject("independent review mandatory", x => { x[field].independent = false; });
  reject("pending review not sufficient", x => { x[field].status = "PENDING_NOT_REVIEWED"; });
  reject("review with blocker", x => { x[field].blockingFindings = ["BLOCKED"]; });
}
reject("publication gate bytes mismatch", x => { x.publication.integrationGatePin.bytes++; });
reject("old source review cannot cover changed current pair", x => { x.review.sourcePinsVerifiedAgainstRootIntegration[0].sha256 = "0".repeat(64); });
for (const key of ["production", "full500Accepted", "ramBenefitClaimed", "automaticRetry"])
  reject("no scope expansion", x => { x.native[key] = true; });
// Preserve the actual file-reader negative boundary using temporary byte-copies
// of the genuine published SAFE files and public code; no original Auth/PGDATA.
const U = "lib/helmut/llm-usage-atomic.js", PARTS = "lib/helmut/auth-state-parts.js";
function temporary(change, shouldPass = false) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-current-pair-gate-negative-"));
  try {
    for (const file of [...G.FILES, U, PARTS]) {
      const target = path.join(base, file); fs.mkdirSync(path.dirname(target), { recursive:true });
      fs.copyFileSync(path.join(ROOT, file), target);
    }
    const file = name => path.join(base, name);
    change(file);
    const gate = require(file(G.FILES[0]));
    if (shouldPass) assert.equal(gate.acceptance().acceptedLocalCacheDelta, true);
    else assert.throws(() => gate.acceptance());
  } finally { fs.rmSync(base, { recursive:true, force:true }); }
}
temporary(() => {}, true);
for (const file of G.FILES.slice(2)) {
  temporary(p => fs.unlinkSync(p(file)));
  temporary(p => fs.appendFileSync(p(file), " "));
}
for (const file of [U, PARTS]) temporary(p => fs.appendFileSync(p(file), "\n"));
temporary(p => {
  fs.renameSync(p(G.FILES[2]), p("native-original.SAFE.json"));
  fs.symlinkSync(p("native-original.SAFE.json"), p(G.FILES[2]));
});
temporary(p => fs.writeFileSync(p(G.FILES[2]), Buffer.alloc(256 * 1024 + 1, 32)));
// Keep descriptor read-closure checks. This is the existing explicit current
// storage source binding, not new cache qualification or execution authority.
const atomic = require("./helmut-resource-meter/atomic-usage-integration");
const normal = atomic.descriptor(); assert(!Object.hasOwn(normal, "controlCacheSourceAcceptance"));
assert(normal.sourcePins.every(p => !G.FILES.some(f => p.path === path.join(ROOT, f))));
const noControlRoot = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-current-pair-no-control-"));
try {
  for (const p of normal.sourcePins) {
    const relative = path.relative(ROOT, p.path); assert(!relative.startsWith("..") && !path.isAbsolute(relative));
    const destination = path.join(noControlRoot, relative);
    fs.mkdirSync(path.dirname(destination), { recursive:true }); fs.copyFileSync(p.path, destination);
  }
  const isolated = require(path.join(noControlRoot, "scripts/helmut-resource-meter/atomic-usage-integration.js"));
  assert(!Object.hasOwn(isolated.descriptor(), "controlCacheSourceAcceptance"));
} finally { fs.rmSync(noControlRoot, { recursive:true, force:true }); }
const localSourceDeltaPin = atomic.pin(path.join(ROOT,
  "docs/betrieb/belege/local-unit-control-bundle-source-20261024/CURRENT_LOCAL_SOURCE_DELTA.SAFE.json"));
const control = atomic.descriptor({ stateStorage:"merkle-auth-v1", historyReadReuse:"verified-history-reuse-v1",
  controlRead:"verified-control-view-v1", localSourceDeltaPin });
assert.equal(control.controlCacheSourceAcceptance.acceptedLocalCacheDelta, true);
for (const file of G.FILES) assert(control.sourcePins.some(p => p.path === path.join(ROOT, file)));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-current-pair-descriptor-"));
try {
  const file = path.join(dir, "descriptor.json"); fs.writeFileSync(file, JSON.stringify(control));
  assert.deepEqual(atomic.readDescriptor(atomic.pin(file)), control);
  control.controlCacheSourceAcceptance.acceptedLocalCacheDelta = false;
  fs.writeFileSync(file, JSON.stringify(control));
  assert.throws(() => atomic.readDescriptor(atomic.pin(file)));
} finally { fs.rmSync(dir, { recursive:true, force:true }); }
console.log(JSON.stringify({ scope:"GENUINE_FIVE_CASE_SAFE_PROOF_SEMANTIC_MUTATIONS_ONLY", pass:true,
  rejectedMutations:rejected, sourceOnlyOverrides:0, databaseStarts:0, providerCalls:0, originalAuthReads:0 }));
