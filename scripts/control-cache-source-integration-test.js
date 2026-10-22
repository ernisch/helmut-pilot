"use strict";
// PREPARED ONLY. Requires Root's completed real qualification before running via lokal.js.
// All negative fixtures are temporary copies of those real proof bytes, never repo proofs.
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os");
const path = require("node:path"), { createHash } = require("node:crypto");
const ROOT = path.resolve(__dirname, ".."), DIR = "scripts/helmut-resource-meter/";
const FILES = [DIR + "control-cache-integration.js", DIR + "control-cache-source-delta.json",
  DIR + "control-cache-native-qualification-20261020.SAFE.json",
  "docs/betrieb/bounded-control-cache-code-sol-review-20261020.SAFE.json"];
const U = "lib/helmut/llm-usage-atomic.js", PARTS = "lib/helmut/auth-state-parts.js";
const sha = x => createHash("sha256").update(x).digest("hex");
const realGate = require(path.join(ROOT, FILES[0]));
// This must fail while preparation is PENDING; it is never replaced by a fabricated positive fixture.
const accepted = realGate.acceptance();assert.equal(accepted.acceptedLocalCacheDelta, true);
let count = 0;
function temporary(change, shouldPass = false) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-cache-gate-negative-"));
  try {
    for (const file of [...FILES, U, PARTS]) {
      const target = path.join(base, file);fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(ROOT, file), target);
    }
    const file = name => path.join(base, name);
    const read = name => JSON.parse(fs.readFileSync(file(name), "utf8"));
    const write = (name, value) => fs.writeFileSync(file(name), JSON.stringify(value) + "\n");
    const repinNative = () => {
      const d = read(FILES[1]), bytes = fs.readFileSync(file(FILES[2]));
      d.currentQualification.nativeProofPin = { name: path.basename(FILES[2]), bytes: bytes.length, sha256: sha(bytes) };
      write(FILES[1], d);
    };
    change({ base, file, read, write, repinNative });
    const gate = require(file(FILES[0]));
    if (shouldPass) assert.equal(gate.acceptance().acceptedLocalCacheDelta, true);
    else assert.throws(() => gate.acceptance());
    count++;
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
}
temporary(() => {}, true);
temporary(({ file }) => fs.unlinkSync(file(FILES[2])));
temporary(({ file }) => fs.appendFileSync(file(FILES[2]), " "));
temporary(({ base }) => fs.appendFileSync(path.join(base, U), "\n"));
temporary(({ base }) => fs.appendFileSync(path.join(base, PARTS), "\n"));
temporary(({ file }) => {
  fs.renameSync(file(FILES[2]), file(DIR + "native-original.SAFE.json"));
  fs.symlinkSync("native-original.SAFE.json", file(FILES[2]));
});
temporary(({ file }) => fs.writeFileSync(file(FILES[2]), Buffer.alloc(256 * 1024 + 1, 32)));
temporary(({ read, write }) => { const d = read(FILES[1]);d.currentQualification.qualified = false;write(FILES[1], d); });
temporary(({ read, write }) => { const d = read(FILES[1]);d.currentQualification.nativeProofPin = null;write(FILES[1], d); });
temporary(({ read, write }) => { const d = read(FILES[1]);delete d.currentQualification.nativeProofPin;write(FILES[1], d); });
temporary(({ read, write }) => { const d = read(FILES[1]);d.currentQualification.nativeProofPin.sha256 = "0".repeat(64);write(FILES[1], d); });
temporary(({ read, write }) => { const d = read(FILES[1]);d.integrationGateSourceSHA256 = "0".repeat(64);write(FILES[1], d); });
temporary(({ read, write, repinNative }) => {
  const n = read(FILES[2]);n.status = "failed";write(FILES[2], n);repinNative();
});
temporary(({ read, write, repinNative }) => {
  const n = read(FILES[2]);n.baselineArmSources[1].sha256 =
    "6b1236aec6858a03dc099e272bdcdd9f79df3efa8c8744d42c5e193e5d57b3d9";
  write(FILES[2], n);repinNative();
});
for (const mutate of [
  n => { n.comparisonCases[0].variant = "NEW"; },
  n => { n.comparisonCases[1].caseId = n.comparisonCases[0].caseId; },
  n => { n.comparisonCases[1].nativePreparedPin.sha256 = "0".repeat(64); },
  n => { n.comparisonCases[1].lifecycleActualResultPin.sha256 = "0".repeat(64); },
  n => { n.comparisonCases[1].authRPCCount = 26; },
  n => { n.comparisonCases[1].nodeExitCode = 1; },
  n => { n.comparisonCases[1].postgrestStopQualified = false; },
  n => { n.comparisonCases[1].fullLastProcessExitCovered = false; },
  n => { n.comparisonCases[1].sourceUnchanged = false; },
  n => { n.comparisonCases[1].authorizedRevisionDeltaQualified = false; },
  n => { n.comparisonCases[1].oomKillCount = 1; },
  n => { n.lifecycle.authRPCCount = 1; },
  n => { n.ramBenefitClaimed = true; },
  n => { n.full500Accepted = true; },
  n => { n.privateActualPinsVerifiedByRoot = false; },
  n => { n.independentCodeReviewPin.sha256 = "0".repeat(64); }
]) temporary(({ read, write, repinNative }) => { const n = read(FILES[2]);mutate(n);write(FILES[2], n);repinNative(); });
temporary(({ file, read, write }) => {
  const proof = read(FILES[3]);proof.commit = "0".repeat(40);write(FILES[3], proof);
  const d = read(FILES[1]), bytes = fs.readFileSync(file(FILES[3]));
  d.currentQualification.independentCodeReviewPin.sha256 = sha(bytes);
  d.currentQualification.independentCodeReviewPin.bytes = bytes.length;write(FILES[1], d);
});
assert.throws(() => realGate.acceptance({ sourceOnly: true }));count++;
// Generic runtime closure consumes every descriptor.sourcePin; ensure the new files reach it.
const atomic = require(path.join(ROOT, DIR, "atomic-usage-integration.js"));
const normal = atomic.descriptor();assert(!Object.hasOwn(normal, "controlCacheSourceAcceptance"));
assert(normal.sourcePins.every(p => !FILES.some(f => p.path === path.join(ROOT, f))));
const noControlRoot = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-cache-no-control-"));
try {
  for (const p of normal.sourcePins) {
    const relative = path.relative(ROOT, p.path);assert(!relative.startsWith("..") && !path.isAbsolute(relative));
    const destination = path.join(noControlRoot, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });fs.copyFileSync(p.path, destination);
  }
  // No gate or new proof files exist here: nonControl must still import and construct its descriptor.
  const isolatedAtomic = require(path.join(noControlRoot, DIR, "atomic-usage-integration.js"));
  assert(!Object.hasOwn(isolatedAtomic.descriptor(), "controlCacheSourceAcceptance"));count++;
} finally { fs.rmSync(noControlRoot, { recursive: true, force: true }); }
const control = atomic.descriptor({ stateStorage: "merkle-auth-v1",
  historyReadReuse: "verified-history-reuse-v1", controlRead: "verified-control-view-v1" });
assert.equal(control.controlCacheSourceAcceptance.acceptedLocalCacheDelta, true);
for (const f of FILES) assert(control.sourcePins.some(p => p.path === path.join(ROOT, f)));
const d = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-cache-descriptor-"));
try {
  const file = path.join(d, "descriptor.json");fs.writeFileSync(file, JSON.stringify(control));
  assert.deepEqual(atomic.readDescriptor(atomic.pin(file)), control);
  control.controlCacheSourceAcceptance.acceptedLocalCacheDelta = false;
  fs.writeFileSync(file, JSON.stringify(control));
  assert.throws(() => atomic.readDescriptor(atomic.pin(file)));count++;
} finally { fs.rmSync(d, { recursive: true, force: true }); }
process.stdout.write(JSON.stringify({ schema: "helmut-control-cache-source-gate-test/1", passed: count,
  nativeStarted: false, databaseCalls: 0, ramQualification: false, full500: false }) + "\n");
