"use strict";
// Only synthetic VM inputs and closed fakes. No native endpoint, DB, original
// data, child process, provider or authority is created by these checks.
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), assert = require("node:assert/strict");
const crypto = require("node:crypto"), P = require("../../lib/helmut/synthetik-500-profile");
const filename = path.join(__dirname, "../../lib/helmut/local-unit-diagnostic-store.js"), source = fs.readFileSync(filename, "utf8");
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const operationId = "localUnitDiagnostic-" + "c".repeat(32), claimId = "11111111-1111-4111-8111-111111111111";
let count = 0;
async function check(name, work) { await work(); count++; }
function setup({ active = false, usageConfirmed = true, writerFails = false, controlEnabled = true, controlDrift = false, wrongBaseline = false,
  artifactReadbackUnknown = false, stateReadbackUnknown = false, noAdmission = false, wrongGateSchema = false } = {}) {
  const original = { synthetik500DispatchJournal: {}, synthetik500KostenAdmission: {}, testKostenAuftrag: { synthetic: true }, testKostenTage: {} };
  const sourcePin = { path: "/synthetic/SOURCE_GATE.SAFE.json", bytes: 123, sha256: sha("synthetic private source gate") };
  const gate = { schema: wrongGateSchema ? "unqualified" : "helmut-local-unit-native-source-gate/1", originalControlHash: wrongBaseline ? sha("foreign baseline") : P.hash(original) };
  const command = { mode: "D-R-1-local-fixture", gatePins: { source: sourcePin }, units: [{ subject: "synthetic-profile" }], slot: { plan: { runId: "new-own-run" } } };
  const selection = { operationId, commandHash: P.hash(command) }, admission = { schema: "synthetic-test-only" };
  let stored = { journal: { state: active ? "running" : "installed", claimId: active ? claimId : null }, marker: 0 }, revision = 0;
  const calls = { state: 0, claim: 0, usage: 0, rawRPC: 0, legacy: 0, validation: 0, artifacts: 0, readbacks: 0, seals: 0, controls: 0, gates: 0 };
  let capability, claimValue, usageArgs, artifactArgs, instance; const artifacts = new Map();
  const scope = { currentVerified: () => active ? { selection, command } : null, assertTicket() {} };
  const authority = { keys: () => ({ journal: "journal" }), current: value => ({ journal: value.journal }),
    validateAdmission() { calls.validation++; } };
  const ack = args => ({ version: "helmut-local-unit-diagnostic-state-ack/1", hash: P.hash(args.nextState),
    revision: args.before.revision + 1, claimHash: sha(args.nextState.journal.claimId) });
  const writer = {
    async claimState(args, token) {
      calls.claim++; capability = token; claimValue = instance.consumeOriginalWriterClaimCapability(token);
      if (writerFails) throw Error("synthetic-before-send-failure");
      stored = structuredClone(args.nextState); revision++; return ack(args);
    },
    async mutateState(args) { calls.state++; stored = structuredClone(args.nextState); revision++; return ack(args); },
    async appendUsage(args) { calls.usage++; usageArgs = args; return usageConfirmed ? { receipt: Object.freeze({}), ownAck: { hash: P.hash(args.record) } } : { receipt: null }; },
    async appendArtifact(args) { calls.artifacts++; artifactArgs = args; artifacts.set(args.kind + ":" + args.logicalId, args.body);
      return { originalRowAck: { synthetic: true }, ownAck: { version: "helmut-local-unit-diagnostic-artifact-ack/1", kind: args.kind,
        logicalId: args.logicalId, hash: P.hash(args.body), stateRevision: args.before.revision } }; },
    sealUnknown() { calls.seals++; }
  };
  const mod = { exports: {} }, target = { database: "helmut_unit_diagnostic_" + operationId.slice(-32), origin: "http://127.0.0.1:34001" };
  const sandbox = { module: mod, Buffer, URL, structuredClone, __dirname: path.dirname(filename),
    process: { env: { HELMUT_STORAGE_BACKEND: "supabase", HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE: target.database, SUPABASE_URL: target.origin }, getuid: () => 1000 },
    __test: { noAdmission, read() { if (stateReadbackUnknown && revision > 0) throw Error("synthetic-state-readback-unknown");
      return { state: structuredClone(stored), revision }; }, admitted: { selection, command, admission, target, witness: { gateHashes: { source: sourcePin.sha256 } } },
      gate(pin) { calls.gates++; assert.deepEqual(pin, sourcePin); return gate; },
      artifact(kind, id, expectedHash) { calls.readbacks++; if (artifactReadbackUnknown) throw Error("synthetic-readback-unknown");
        const value = artifacts.get(kind + ":" + id); assert.equal(P.hash(value), expectedHash); return value; } },
    require(name) {
      if (name === "node:fs") return { existsSync: () => true };
      if (["node:path", "node:crypto", "node:util"].includes(name)) return require(name);
      if (name === "./synthetik-500-profile") return P;
      if (name === "./local-unit-diagnostic-authority") return authority;
      if (name === "./local-unit-diagnostic-scope" || name === path.join(path.dirname(filename), "local-unit-diagnostic-scope.js")) return scope;
      if (name === "./local-unit-diagnostic-original-writer") return writer;
      if (name === "./llm-usage-atomic") return { controlReadEnabled: () => controlEnabled, async readControl({ request, rowId, target: origin }) {
        calls.controls++; assert.equal(rowId, "main-auth"); assert.equal(origin, target.origin + "|main-auth");
        await request("/rest/v1/rpc/helmut_auth_state_graph_read_v1", { method: "POST", body: '{"id":"main-auth"}' });
        return { ...original, ...(controlDrift ? { testKostenTage: { changed: true } } : {}), _authStoreRevision: "revision-" + calls.controls }; } };
      if (name === "./local-unit-diagnostic-transport") return { assertTicket() {}, model: () => "synthetic-pinned-model" };
      if (name === "./local-unit-diagnostic-endpoint") return { async request() { calls.legacy++; return { status: 200, body: Buffer.from("{}") }; } };
      throw Error("offline-unexpected-module");
    } };
  vm.runInNewContext(source + `
    __test.admitted.target=JSON.parse(JSON.stringify(__test.admitted.target));
    if(!__test.noAdmission)admitted.set(__test.admitted.selection.commandHash,__test.admitted);
    jsonPin=pin=>__test.gate(pin);
    readState=async selection=>{const r=__test.read();stateProofs.set(r.state,{selection,hash:P.hash(r.state),revision:r.revision});return r.state;};
    readArtifact=async(selection,kind,id,hash)=>__test.artifact(kind,id,hash);
    rpc=async()=>{throw Error('offline-raw-write-forbidden');};
  `, sandbox, { filename });
  instance = mod.exports;
  return { api: instance, selection, calls, get capability() { return capability; }, get claimValue() { return claimValue; }, get usageArgs() { return usageArgs; }, get artifactArgs() { return artifactArgs; } };
}
(async () => {
  await check("unminted claim JSON never creates a capability", () => {
    const s = setup(); assert.throws(() => s.api.consumeOriginalWriterClaimCapability({}), /private-original-claim-capability/);
    assert.equal(s.calls.claim, 0); assert.equal(s.calls.legacy, 0);
  });
  await check("first claim uses actual original writer and consumes private capability once", async () => {
    const s = setup(); const result = await s.api.mutateState(s.selection, state => { state.journal = { state: "running", claimId }; return "changed"; });
    assert.equal(result, "changed"); assert.equal(s.calls.claim, 1); assert.equal(s.calls.state, 0);
    assert.equal(s.claimValue.ownNext.hash, P.hash({ journal: { state: "running", claimId }, marker: 0 }));
    assert.throws(() => s.api.consumeOriginalWriterClaimCapability(s.capability), /private-original-claim-capability/);
  });
  await check("claim reader is narrowly fixed to actual readonly main-auth RPCs", async () => {
    const s = setup(); await s.api.mutateState(s.selection, state => { state.journal = { state: "running", claimId }; });
    const read = s.claimValue.legacyRead;
    await read("/rest/v1/rpc/helmut_auth_state_graph_read_v1", { method: "POST", body: '{"id":"main-auth"}' });
    assert.equal(s.calls.legacy, 1);
    for (const [endpoint, options] of [["/rest/v1/rpc/helmut_auth_state_cas_v1", { method: "POST", body: '{"id":"main-auth"}' }],
      ["/rest/v1/rpc/helmut_auth_usage_read_v1", { method: "GET" }],
      ["/rest/v1/rpc/helmut_auth_usage_read_v1", { method: "POST", body: '{"id":"foreign"}' }]]) {
      assert.throws(() => read(endpoint, options), /original-claim-(?:reader-only|row)/);
    }
    assert.equal(s.calls.legacy, 1); assert.ok(s.calls.validation >= 3);
  });
  await check("a failed first claim is never minted again", async () => {
    const s = setup({ writerFails: true }), change = state => { state.journal = { state: "running", claimId }; };
    await assert.rejects(s.api.mutateState(s.selection, change), /synthetic-before-send-failure/);
    await assert.rejects(s.api.mutateState(s.selection, change), /original-first-claim-required/); assert.equal(s.calls.claim, 1);
  });
  await check("active state updates use the actual original writer instead of raw CAS", async () => {
    const s = setup({ active: true }); await s.api.mutateState(s.selection, state => { state.marker++; });
    assert.equal(s.calls.state, 1); assert.equal(s.calls.claim, 0);
  });
  await check("actual usage metadata goes through original append and requires genuine receipt", async () => {
    for (const usageConfirmed of [true, false]) {
      const s = setup({ active: true, usageConfirmed }), ticket = { id: "new-ticket", maxOutputTokens: 6000,
        execution: { commandHash: s.selection.commandHash }, admission: { phase: "R", intentId: "new-intent", planHash: "a".repeat(64),
          actualRequestHash: "b".repeat(64), runId: "new-own-run" } };
      const entry = { model: "synthetic-pinned-model", politicianId: "synthetic-profile", runId: "new-own-run", success: true,
        usage: { input_tokens: 100, output_tokens: 100, total_tokens: 200 } };
      if (usageConfirmed) assert.ok(await s.api.recordUsage(entry, ticket));
      else await assert.rejects(s.api.recordUsage(entry, ticket), /original-usage-not-confirmed/);
      assert.equal(s.calls.usage, 1); assert.equal(s.usageArgs.record.costPhase, "R"); assert.equal(s.usageArgs.record.totalTokens, 200);
      assert.equal(s.usageArgs.record.costBasis, "local-fixture-simulation-not-provider-charge");
    }
  });
  await check("artifact append uses the original writer and requires own immutable readback", async () => {
    const s = setup({ active: true }), body = { operationId, commandHash: s.selection.commandHash, failure: "unit-not-confirmed" };
    const result = await s.api.insertArtifact(s.selection, "evidence", "diagnostic-result", body);
    assert.equal(result.saved, true); assert.equal(s.calls.artifacts, 1); assert.equal(s.calls.readbacks, 1); assert.equal(s.calls.rawRPC, 0);
    assert.equal(s.artifactArgs.before.hash, P.hash(s.artifactArgs.before.state)); assert.equal(s.artifactArgs.before.revision, 0);
  });
  await check("unknown artifact readback seals the shared original writer", async () => {
    const s = setup({ active: true, artifactReadbackUnknown: true }); await assert.rejects(s.api.insertArtifact(s.selection, "evidence", "diagnostic-result", {}));
    assert.equal(s.calls.artifacts, 1); assert.equal(s.calls.seals, 1);
  });
  await check("unknown state readback also seals the shared original writer", async () => {
    const s = setup({ active: true, stateReadbackUnknown: true }); await assert.rejects(s.api.mutateState(s.selection, state => { state.marker++; }));
    assert.equal(s.calls.state, 1); assert.equal(s.calls.seals, 1);
  });
  await check("every original control read uses genuine U and private gate; revision is excluded", async () => {
    const s = setup({ active: true }), first = await s.api.readOriginalControl(s.selection), second = await s.api.readOriginalControl(s.selection);
    assert.equal(P.hash(first), P.hash(second)); assert.equal(Object.keys(first).length, 4); assert.equal(Object.hasOwn(first, "_authStoreRevision"), false);
    assert.equal(s.calls.controls, 2); assert.equal(s.calls.legacy, 2); assert.equal(s.calls.gates, 2);
  });
  for (const option of ["controlDrift", "wrongBaseline"]) await check(option + " cannot replace the genuine original baseline", async () => {
    const s = setup({ active: true, [option]: true }); await assert.rejects(s.api.readOriginalControl(s.selection, "caller-hash-is-not-proof"), /original-control-drift/);
    assert.equal(s.calls.controls, 1);
  });
  await check("disabled original control mode has no fallback", async () => {
    const s = setup({ active: true, controlEnabled: false }); await assert.rejects(s.api.readOriginalControl(s.selection), /original-control-mode-required/);
    assert.equal(s.calls.controls, 0); assert.equal(s.calls.legacy, 0);
  });
  for (const option of ["noAdmission", "wrongGateSchema"]) await check(option + " cannot open original control I/O", async () => {
    const s = setup({ active: true, [option]: true }); await assert.rejects(s.api.readOriginalControl(s.selection));
    assert.equal(s.calls.controls, 0); assert.equal(s.calls.legacy, 0);
  });
  process.stdout.write(JSON.stringify({ schema: "helmut-local-store-original-offline-checks/1", passed: count,
    nativeExecutions: 0, unitExecutionQualified: false }) + "\n");
})().catch(error => { console.error(error); process.exitCode = 1; });
