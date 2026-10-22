"use strict";

// Pure producer tests only. The opt-in qualification reads retained originals
// without executing a command, provider, database, authority or engine.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const vm = require("node:vm"), Module = require("node:module");
const root = path.resolve(__dirname, ".."), realLoad = Module._load;
const forbidden = () => { throw Error("original-producer-test-side-effect-forbidden"); };
global.fetch = forbidden;
for (const name of ["node:http", "node:https"]) {
  require(name).request = forbidden; require(name).get = forbidden;
}
for (const name of ["connect", "createConnection"]) require("node:net")[name] = forbidden;
require("node:tls").connect = forbidden;
for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"])
  require("node:child_process")[name] = forbidden;
for (const name of ["writeFile", "writeFileSync", "appendFile", "appendFileSync", "mkdir", "mkdirSync", "rm", "rmSync",
  "unlink", "unlinkSync", "rename", "renameSync", "createWriteStream", "truncate", "truncateSync"])
  fs[name] = forbidden;
Module._load = function (name, parent, ...rest) {
  if (name === "./storage" && parent?.filename.startsWith(path.join(root, "lib/helmut/")))
    return new Proxy({}, { get: () => forbidden });
  return realLoad.call(this, name, parent, ...rest);
};
const Producer = require("../lib/helmut/local-unit-diagnostic-original-producer");
const Source = require("../lib/helmut/local-unit-diagnostic-source");
const P = require("../lib/helmut/synthetik-500-profile");
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const need = (ok, name) => { if (!ok) throw Error("original-producer-test-" + name); };
let checks = 0;
function check(name, fn) { fn(); checks++; process.stdout.write("PASS " + name + "\n"); }
const input = { sourceHandle: Object.freeze({}), preparedBytes: Buffer.from("[]"), bindingBytes: Buffer.from("[]"), fixtureBytes: Buffer.from("[]") };
check("only the narrow pure producer API is exposed", () => {
  assert.deepEqual(Object.keys(Producer).sort(), ["LATENCY_MS", "ORIGINAL_INPUTS", "PROOF_VERSION", "VERSION", "derive"]);
  assert(Object.isFrozen(Producer)); assert(Object.isFrozen(Producer.ORIGINAL_INPUTS.providerFixtures));
});
check("the original worst phase delay remains exactly19900ms", () => assert.equal(Producer.LATENCY_MS, 19900));
check("fabricated and serialized handles cannot select an original", () => {
  for (const sourceHandle of [{}, null, "trusted", JSON.parse(JSON.stringify(input.sourceHandle))])
    assert.throws(() => Producer.derive({ ...input, sourceHandle }), /opaque-handle-required/);
});
check("caller approval switches and output overrides are rejected", () => {
  for (const extra of [{ trusted: true }, { latencyMs: 19901 }, { responseBytes: Buffer.from("invented") }, { executionAuthority: true }])
    assert.throws(() => Producer.derive({ ...input, ...extra }), /producer-arguments/);
});
check("missing inputs and arrays cannot masquerade as the producer arguments", () => {
  assert.throws(() => Producer.derive([]), /producer-arguments/);
  for (const key of Object.keys(input)) { const args = { ...input }; delete args[key]; assert.throws(() => Producer.derive(args), /producer-arguments/); }
});

const args = process.argv.slice(2);
need(args.length === 0 || args.length === 1 && args[0] === "--qualify-originals", "unknown-argument");
function readStable(filename) {
  need(path.isAbsolute(filename) && fs.realpathSync(filename) === filename, "canonical-original-path");
  let current = path.parse(filename).root;
  for (const part of filename.slice(current.length).split(path.sep)) {
    current = path.join(current, part); need(!fs.lstatSync(current).isSymbolicLink(), "original-symlink");
  }
  const signature = s => [s.dev, s.ino, s.mode, s.size, s.mtimeNs, s.ctimeNs, s.nlink].map(String).join(":");
  const before = fs.lstatSync(filename, { bigint: true });
  need(before.isFile(), "original-regular-file");
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  let bytes, first, last;
  try { first = fs.fstatSync(fd, { bigint: true }); bytes = fs.readFileSync(fd); last = fs.fstatSync(fd, { bigint: true }); }
  finally { fs.closeSync(fd); }
  const after = fs.lstatSync(filename, { bigint: true });
  need(signature(before) === signature(first) && signature(first) === signature(last) && signature(last) === signature(after)
    && BigInt(bytes.length) === before.size, "original-read-stability");
  return bytes;
}
function producerForSelection(selection, handle) {
  const filename = path.join(root, "lib/helmut/local-unit-diagnostic-original-producer.js"), localRequire = Module.createRequire(filename);
  const module = { exports: {} };
  const source = { readSelection: h => { need(h === handle, "test-source-handle"); return selection; },
    commandSource: Source.commandSource, sourceBinding: Source.sourceBinding };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), { module, exports: module.exports, Buffer, Object, URL, structuredClone,
    require: name => name === "./local-unit-diagnostic-source" ? source : localRequire(name) }, { filename });
  return module.exports;
}
if (args.length) {
  const base = "/workspace/helmut-parallel-20261015/wave20-resource-integration/attempt-f3375a7d5548";
  const packetPath = base + "/FRESH_PACKET.PRIVATE.json";
  const installPath = base + "/native-end-preparation/run-combined500-synthetik500-resources21-f3375a7d5548/LOCAL_INSTALL_PINS.PRIVATE.json";
  const installPinsBytes = readStable(installPath), packetBytes = readStable(packetPath);
  let sourceHandle;
  try {
    sourceHandle = Source.extractPinnedSource({ packetBytes, packetPath, installPinsBytes,
      installPin: { path: installPath, bytes: installPinsBytes.length, sha256: sha(installPinsBytes) },
      terminalBytes: readStable(path.join(root, "docs/betrieb/belege/next-local-full500-20261021/V12_ACTUAL_TERMINAL.SAFE.json")),
      diagnosticNonce: "0123456789abcdef0123456789abcdef", preparedAtUTC: "2026-10-22T00:00:00.000Z" });
  } catch (error) {
    // Retain the genuine Source precondition failure. Never manufacture a
    // handle, change publication policy or replace the real/source clocks.
    process.stdout.write("FAIL actual original Source precondition; producer qualification has not run.\n");
    throw error;
  }
  const original = { sourceHandle, preparedBytes: readStable(base + "/NEW_PREPARED_REQUESTS.PRIVATE.json"),
    bindingBytes: readStable(base + "/ALL500_ACTUAL_REQUEST_TEMPLATE_BINDINGS.SAFE.json"),
    fixtureBytes: readStable(base + "/BOUND_LOCAL_PROVIDER_FIXTURES.PRIVATE.json") };
  const before = [original.preparedBytes, original.bindingBytes, original.fixtureBytes].map(sha);
  const selected = Source.readSelection(sourceHandle), selectedHash = P.hash(selected);
  let result;
  check("actual retained originals derive through current native D and review builders", () => {
    result = Producer.derive(original);
    need(result.proof.originalRows.entriesVerified === 500 && result.proof.originalOutputsPreserved === true, "complete-original-crossbindings");
    need(Object.keys(result.phases).join("|") === "D|R" && result.proof.executionAuthority === false
      && result.proof.actualModelOutput === false && result.proof.full500Accepted === false, "pure-not-authority");
  });
  check("D remains byte-identical while R explicitly retains the historical mismatch", () => {
    const prepared = JSON.parse(original.preparedBytes.toString("utf8"));
    need(result.phases.D.requestBytes.equals(Buffer.from(prepared[499].body)), "D-exact-original-bytes");
    const d = JSON.parse(result.phases.D.requestBytes), r = JSON.parse(result.phases.R.requestBytes);
    need(d.max_output_tokens === 3000 && d.reasoning.effort === "low" && r.max_output_tokens === 6000
      && r.reasoning.effort === "medium", "native-phase-rules");
    const proof = result.proof;
    need(proof.originalDByteIdentical && proof.originalRByteIdentical === false && proof.originalRDiffers === true
      && proof.originalRequests.R.maxOutputTokens === 3000 && proof.originalRequests.R.reasoningEffort === "low"
      && proof.originalRequests.R.sha256 !== proof.diagnosticRequests.R.sha256
      && proof.diagnosticRequests.R.sha256 === sha(result.phases.R.requestBytes), "R-mismatch-disclosed");
  });
  check("both Responses envelopes preserve original output and usage with19900ms configured delay", () => {
    const fixture = JSON.parse(original.fixtureBytes.toString("utf8"))[499];
    for (const phase of ["D", "R"]) {
      const value = result.phases[phase], reply = JSON.parse(value.responseBytes), latency = JSON.parse(value.latencyBytes);
      need(value.latencyMs === 19900 && latency.latencyMs === 19900 && latency.actualElapsedTimeClaimed === false
        && value.responseStatus === 200 && reply.status === "completed" && reply.id === "LOCAL_MOCK_ONLY_499_" + phase,
      "original-response-contract");
      need(reply.output[0].content[0].text === JSON.stringify(phase === "D" ? fixture.draftOutput : fixture.reviewOutput)
        && JSON.stringify(reply.usage) === JSON.stringify(fixture.mockUsage), "original-response-values-preserved");
    }
  });
  check("original bytes and source selection remain unchanged across independent derivations", () => {
    const again = Producer.derive(original);
    for (const phase of ["D", "R"]) for (const field of ["requestBytes", "responseBytes", "latencyBytes"])
      need(again.phases[phase][field] !== result.phases[phase][field] && again.phases[phase][field].equals(result.phases[phase][field]), "fresh-deterministic-bytes");
    need(before.every((h, i) => h === sha([original.preparedBytes, original.bindingBytes, original.fixtureBytes][i]))
      && selectedHash === P.hash(selected), "original-inputs-unmodified");
  });
  check("arbitrary replacement originals fail even when their own JSON is valid", () => {
    for (const key of ["preparedBytes", "bindingBytes", "fixtureBytes"]) {
      const changed = Buffer.from(original[key]); changed[changed.length - 1] ^= 1;
      assert.throws(() => Producer.derive({ ...original, [key]: changed }), /original-input-pin/);
      assert.throws(() => Producer.derive({ ...original, [key]: Buffer.from("[]") }), /original-input-pin/);
    }
  });
  check("current source profile, D intent, R budget and phase mapping cannot drift", () => {
    for (const mutate of [x => { x.draft.profile.id += "-fictional-drift"; }, x => { x.intents[0].actualRequestHash = "0".repeat(64); },
      x => { x.intents[1].maxOutputTokens = 3000; }, x => { x.intents[1].reviewRule.reasoningEffort = "low"; },
      x => { x.unit.intentIds.reverse(); }]) {
      const changed = structuredClone(selected); mutate(changed);
      assert.throws(() => producerForSelection(changed, sourceHandle).derive(original), /producer-(source-draft-intents|source-review-rule)/);
    }
  });
  process.stdout.write("Original pure-read qualification PASS; no authority, engine, provider or database execution.\n");
}
process.stdout.write("Original producer checks PASS: " + checks + "\n");
