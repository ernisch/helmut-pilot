"use strict";
// Real store RPC/frame consumer and genuine U/Parts verifier; synthetic RAM
// responses only. No HTTP, native process, database, authority or provider.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const crypto = require("node:crypto"), H = require("../auth-control-view-test");
const P = require("../../lib/helmut/synthetik-500-profile"), A = require("../../lib/helmut/local-unit-diagnostic-authority");
const root = path.resolve(__dirname, "../.."), file = path.join(root, "lib/helmut/local-unit-diagnostic-store.js");
const sha = s => crypto.createHash("sha256").update(s).digest("hex"), copy = structuredClone;
const claimId = "11111111-1111-4111-8111-111111111111", operationId = "localUnitDiagnostic-" + "c".repeat(32);
const projection = original => Object.fromEntries(["synthetik500DispatchJournal", "synthetik500KostenAdmission", "testKostenAuftrag", "testKostenTage"].map(k => [k, original[k]]));
function setup(mutate = () => {}) {
  const partsFile = path.join(root, "lib/helmut/auth-state-parts.js"), atomicFile = path.join(root, "lib/helmut/llm-usage-atomic.js");
  const parts = H.compile(fs.readFileSync(partsFile, "utf8"), partsFile), U = H.compile(fs.readFileSync(atomicFile, "utf8"), atomicFile, parts);
  const server = H.server(parts), sourcePin = { path: "/synthetic/SOURCE.json", bytes: 123, sha256: sha("synthetic source gate") };
  const gate = { schema: "helmut-local-unit-native-source-gate/1", originalControlHash: P.hash(projection(server.auth())) };
  const command = { mode: "D-R-1-local-fixture", gatePins: { source: sourcePin } }, selection = { operationId, commandHash: P.hash(command) };
  const target = { database: "helmut_unit_diagnostic_" + operationId.slice(-32), origin: "http://127.0.0.1:34001" };
  const catalog = { version: "helmut-local-unit-diagnostic-native-store/1", database: target.database, databaseOID: "123", sources: { synthetic: sha("synthetic SQL") } };
  const state = { journal: { claimId }, ownSevenProofRemainsSeparate: true }, calls = [], module = { exports: {} };
  let last, clock = Date.now();
  class Clock extends Date { static now() { return clock; } }
  const sandbox = { module, Buffer, URL, structuredClone, Date: Clock, __dirname: path.dirname(file), process: { env: {
    HELMUT_STORAGE_BACKEND: "supabase", HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE: target.database, SUPABASE_URL: target.origin } },
    __test: { admitted: { selection, command, target, witness: { runtimeManifestPin: { syntheticRuntime: true }, gateHashes: { source: sourcePin.sha256 } } }, gate, runtime: { sqlSources: catalog.sources },
      current: { selection, command }, runtimeList: [{ name: "synthetic-read", oid: "123", identityArguments: "jsonb", prosrcSHA256: sha("synthetic read source"), qualificationPin: sourcePin }] }, require(name) {
      if (name === "node:fs") return { existsSync: () => true };
      if (["node:path", "node:crypto", "node:util"].includes(name)) return require(name);
      if (name === "./synthetik-500-profile") return P;
      if (name === "./local-unit-diagnostic-authority") return { CONTROL_STAGES: A.CONTROL_STAGES, current: value => ({ journal: value.journal }) };
      if (name === path.join(path.dirname(file), "local-unit-diagnostic-scope.js")) return { currentVerified: () => sandbox.__test.current };
      if (name === "./llm-usage-atomic") return U;
      if (name === "./local-unit-diagnostic-endpoint") return { async request(identity, database, method, endpoint, body) {
        assert.equal(JSON.stringify(identity), JSON.stringify(selection)); assert.equal(database, target.database); assert.equal(method, "POST");
        assert.equal(endpoint, "/rest/v1/rpc/local_unit_diagnostic_control_snapshot_read_v1");
        const args = JSON.parse(body); calls.push(args); assert.equal(JSON.stringify(args.p_expected_legacy_reads), JSON.stringify(sandbox.__test.runtimeList));
        const canonical = P.kanonisch(state);
        last = { version: "helmut-local-unit-control-snapshot/1", scopeHash: selection.commandHash, operationId,
          claimHash: sha(claimId), index: args.p_control_index, stage: args.p_stage, nonce: args.p_nonce,
          catalog, original: server.response(args.p_graph_request), documents: [{ id: "synthetic-document" }], knowledgeObjects: [],
          profiles: [{ id: "synthetic-profile" }], state: { version: "helmut-local-unit-diagnostic-state-witness/1",
            scopeHash: selection.commandHash, canonical, hash: P.hash(state), revision: args.p_control_index, nonce: args.p_nonce } };
        mutate(last, args, state); return { status: 200, body: Buffer.from(JSON.stringify(last)) };
      } };
      throw Error("offline-unexpected-module-" + name);
    } };
  vm.runInNewContext(fs.readFileSync(file, "utf8") + `
    __test.admitted.target=JSON.parse(JSON.stringify(__test.admitted.target));
    admitted.set(__test.admitted.selection.commandHash,__test.admitted);
    __test.issueRuntime=(control=true)=>{const token=Object.freeze({});runtimeProofs.set(token,{selection:structuredClone(__test.admitted.selection),
      r:{observedAtUTC:new Date(Date.now()).toISOString()},readAt:Date.now(),expectedLegacyReads:control?structuredClone(__test.runtimeList):null});return token;};
    jsonPin=pin=>JSON.parse(JSON.stringify(pin.syntheticRuntime?__test.runtime:__test.gate));
  `, sandbox, { filename: file });
  return { api: module.exports, selection, calls, state, server, last: () => last, advance: ms => { clock += ms; },
    runtime: (control = true) => module.exports.consumeRuntime(sandbox.__test.issueRuntime(control), selection, command),
    read: (index = 0, witness = module.exports.consumeRuntime(sandbox.__test.issueRuntime(), selection, command)) =>
      module.exports.readControlSnapshot(selection, claimId, index, A.CONTROL_STAGES[index], witness),
    consume: (token, index = 0, claim = claimId) => module.exports.consumeControlSnapshot(token, selection, claim, index, A.CONTROL_STAGES[index]) };
}
let count = 0;
async function check(work) { await work(); count++; }
(async () => {
  const saved = Object.keys(H.ENV).map(k => [k, process.env[k]]);
  try {
    Object.assign(process.env, H.ENV);
    await check(async () => {
      const f = setup(), first = await f.read(), result = f.consume(first);
      assert.equal(f.calls.length, 1); assert.equal(JSON.stringify(first), "{}");
      assert.equal(P.hash(result.original), P.hash(projection(f.server.auth())));
      assert.equal(result.state.ownSevenProofRemainsSeparate, true); assert(!UHasWriteSnapshot(result.original));
      assert.throws(() => f.consume(first), /private-control-frame/);
      await assert.rejects(f.read(), /control-frame-retry/); assert.equal(f.calls.length, 1);
      const second = await f.read(1); f.consume(second, 1); assert.equal(f.calls.length, 2);
      assert.notEqual(f.calls[0].p_nonce, f.calls[1].p_nonce);
      assert.notEqual(f.calls[0].p_graph_request.readNonce, f.calls[1].p_graph_request.readNonce);
      assert(f.calls[1].p_graph_request.knownGraph); // genuine U verified first graph, then fresh native reuse proof.
    });
    for (const mode of ["missing", "ordinary", "cloned", "expired", "backwards"]) await check(async () => {
      const f = setup(), witness = mode === "missing" ? undefined : f.runtime(mode !== "ordinary");
      if (mode === "expired") f.advance(30001); if (mode === "backwards") f.advance(-1);
      await assert.rejects(f.api.readControlSnapshot(f.selection, claimId, 0, A.CONTROL_STAGES[0], mode === "cloned" ? copy(witness) : witness), /private-control-read-proof/);
      assert.equal(f.calls.length, 0); await assert.rejects(f.read(), /control-frame-retry/); assert.equal(f.calls.length, 0);
    });
    await check(async () => { const foreign = setup().runtime(), f = setup();
      await assert.rejects(f.read(0, foreign), /private-control-read-proof/); assert.equal(f.calls.length, 0); });
    await check(async () => { const f = setup(), witness = f.runtime(); f.consume(await f.read(0, witness));
      await assert.rejects(f.read(1, witness), /private-control-read-proof/); assert.equal(f.calls.length, 1); });
    await check(async () => { const f = setup(r => { delete r.original; }), witness = f.runtime(); await assert.rejects(f.read(0, witness));
      await assert.rejects(f.read(1, witness), /private-control-read-proof/); assert.equal(f.calls.length, 1); });
    await check(async () => {
      const sql = fs.readFileSync(path.join(__dirname, "local-unit-diagnostic-store.sql"), "utf8");
      const stageText = /stages text\[\]:=array\[([^;]+)\];/.exec(sql)[1];
      assert.deepEqual([...stageText.matchAll(/'([^']+)'/g)].map(m => m[1]), [...A.CONTROL_STAGES]);
      const ko = sql.split("into knowledge")[0].split("select coalesce(jsonb_agg(jsonb_build_object('id',k.id")[1];
      const names = ["id", ...[...ko.matchAll(/'([^']+)',k\.[a-z_]+/g)].map(m => m[1])];
      assert.deepEqual(names, [...require("../../lib/helmut/knowledge-object-version").VERSION_FIELDS]);
    });
    for (const elapsed of [30001, -1]) await check(async () => { const f = setup(), token = await f.read(); f.advance(elapsed);
      assert.throws(() => f.consume(token), /private-control-frame/); assert.throws(() => f.consume(token), /private-control-frame/); });
    await check(async () => { const f = setup(), token = await f.read(); assert.throws(() => f.consume(token, 1), /private-control-frame/);
      assert.throws(() => f.consume(token), /private-control-frame/); });
    await check(async () => { const f = setup(), token = await f.read(); assert.throws(() => f.consume(token, 0, "22222222-2222-4222-8222-222222222222"), /private-control-frame/); });
    for (const mutate of [r => delete r.original, r => delete r.state, r => r.index++, r => r.stage = "before-D",
      r => r.claimHash = "0".repeat(64), r => r.nonce = "0".repeat(64), r => r.scopeHash = "0".repeat(64),
      r => r.original.graphReuse.nonce = "00000000-0000-4000-8000-000000000000",
      r => r.original.graph.nodes[0].payload += " ", r => r.state.hash = "0".repeat(64),
      r => r.catalog.sources = { changed: true }, r => r.state.nonce = "0".repeat(64), r => r.state.revision = -1,
      r => { const v = JSON.parse(r.state.canonical); v.journal.claimId = "foreign"; r.state.canonical = P.kanonisch(v); r.state.hash = P.hash(v); }])
      await check(async () => { const f = setup(mutate); await assert.rejects(f.read()); await assert.rejects(f.read(), /control-frame-retry/); assert.equal(f.calls.length, 1); });
    await check(async () => { const f = setup(); f.server.change({ ...f.server.auth(), testKostenTage: { changed: true } });
      await assert.rejects(f.read(), /original-control-drift/); });
    process.stdout.write(JSON.stringify({ schema: "helmut-control-bundle-offline/1", passed: count,
      genuineOriginalVerifier: true, actualHTTP: 0, database: 0, native: 0, unitAcceptance: false }) + "\n");
  } finally { for (const [k, v] of saved) if (v === undefined) delete process.env[k]; else process.env[k] = v; }
})().catch(error => { console.error(error); process.exitCode = 1; });
function UHasWriteSnapshot(value) { return require("../../lib/helmut/llm-usage-atomic").hasSnapshot(value); }
