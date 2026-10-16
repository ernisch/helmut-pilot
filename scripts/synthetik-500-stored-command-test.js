"use strict";
// Actual backend/ALS state machines with REAL temporary Ed25519 test keys.
// Worker full-C/restore, native RPC, immutable rows and Root-FS gates are explicit
// mocks. No database, full-C, Auth30, Unit60, owner-GO or Production acceptance.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const vm = require("node:vm"), crypto = require("node:crypto");
const sourceFile = path.resolve(__dirname, "../lib/helmut/synthetik-500-stored-command.js");
const storageFile = path.resolve(__dirname, "../lib/helmut/storage.js");
const commandFile = path.resolve(__dirname, "../lib/helmut/synthetik-500-production-command.js");
const source = fs.readFileSync(sourceFile, "utf8"), storageSource = fs.readFileSync(storageFile, "utf8");
const commandSource = fs.readFileSync(commandFile, "utf8");
const pins = require("../lib/helmut/synthetik-500-stored-command-native-pins.json");
const canonical = require("../lib/helmut/synthetik-500-profile").kanonisch;
const sha = x => crypto.createHash("sha256").update(x).digest("hex");
const BASE = Date.parse("2026-10-15T22:00:00.000Z"), NINE_HOURS = 9 * 3600000;
const PUB = "HELMUT_SYNTHETIK500_CONTENT_PUBLIC_KEY", PRIV = "HELMUT_SYNTHETIK500_CONTENT_PRIVATE_KEY";
const keys = crypto.generateKeyPairSync("ed25519"), otherKeys = crypto.generateKeyPairSync("ed25519");
const pem = key => key.export({ type: key.type === "private" ? "pkcs8" : "spki", format: "pem" });
const clone = x => JSON.parse(JSON.stringify(x));
const jsonb = x => Array.isArray(x) ? x.map(jsonb) : x && typeof x === "object"
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k, jsonb(x[k])])) : x;
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const selectedFilter = process.argv.find(x => x.startsWith("--match="));
const filter = selectedFilter ? new RegExp(selectedFilter.slice(8)) : null;
const results = [];
function loadActual(text, filename, localRequire, fakeProcess, ClockDate) {
  const m = { exports: {} };
  vm.runInThisContext("(function(require,module,exports,process,Date){" + text + "\n})", { filename })(localRequire, m, m.exports, fakeProcess, ClockDate);
  return m.exports;
}
function fixture(options = {}) {
  const state = { clock: 0, wallOffset: 0, target: "mock-owned-target", sources: "mock-reviewed-sources",
    calls: [], fullWorkers: 0, restoreWorkers: 0, rows: new Map(), patch: null, rowError: null,
    privatePatch: null, workerPatch: null, fullMS: 5, restoreMS: 5, rpcGate: null, rpcEntered: null,
    planEnd: BASE + (options.planHours ?? 8) * 3600000 };
  state.env = { [PUB]: pem(keys.publicKey), [PRIV]: pem(keys.privateKey) };
  class ClockDate extends Date { constructor(...xs) { super(...(xs.length ? xs : [BASE + state.clock + state.wallOffset])); }
    static now() { return BASE + state.clock + state.wallOffset; } }
  const operationId = options.operationId || "synthetik500-local-signed-context-tests";
  function command() { const shared = { immutable: "é😀\ud800" }; return { version: "MOCK-CONTENT-NOT-FULL-C-VALIDATED",
    shared: [shared, shared], slot: { planHash: "b".repeat(64), plan: { operationId, endsAtUTC: new Date(state.planEnd).toISOString() } },
    ...(options.ordinaryLegacy ? { version: "helmut-synthetik500-production-command/2-direct", mode: "D-R-500",
      drafts: Array.from({ length: 500 }, () => ({ briefingEingabe: { version: 1 } })) } : {}) }; }
  const selector = Object.freeze({ operationId, commandHash: sha(canonical(command())) });
  state.body = JSON.stringify({ command: command(), admission: { oldEmbedded: "not-authority" }, testAuthority: { oldEmbeddedGO: true } });
  const fakeProcess = { env: state.env, version: process.version, resourceUsage: () => ({ maxRSS: 1 }) };
  const runner = { sourceBinding: () => state.sources,
    validateStoredContent: input => worker(input, "full"), restoreStoredContent: input => worker(input, "restore") };
  async function worker(input, mode) {
    assert.equal(input.dataText, state.body); assert.equal(input.storedSHA256, sha(state.body));
    if (mode === "full") { state.fullWorkers++; state.clock += state.fullMS; }
    else { state.restoreWorkers++; state.clock += state.restoreMS; }
    const root = command(); assert.equal(sha(canonical(root)), input.commandHash);
    const answer = { mode, storedSHA256: input.storedSHA256, commandHash: input.commandHash,
      operationId: input.operationId, packet: { command: root, admission: { embeddedIgnored: true }, testAuthority: { embeddedIgnored: true } },
      diagnostics: { commandCalls: mode === "full" ? 1 : 0, enteredCount: mode === "full" ? 1 : 0, codecEnteredCount: 1 }, phases: [] };
    if (options.ordinaryLegacy && mode === "full") Object.assign(answer.diagnostics,
      { enteredCount: 0, qualifiedFalseCount: 1, lastFailure: "unsupported-command-dispatch" });
    if (state.workerPatch) state.workerPatch(answer, input, mode); return answer;
  }
  const localRequire = name => name === "./synthetik-500-content-runner" ? runner
    : name === "./synthetik-500-stored-command-native-pins.json" ? pins
      : name === "./synthetik-500-profile" ? { kanonisch: canonical }
        : name === "node:perf_hooks" ? { performance: { now: () => state.clock } } : require(name);
  const actual = loadActual(source, sourceFile, localRequire, fakeProcess, ClockDate);
  async function request(url, options = {}) {
    const parsed = new URL(url, "http://mock.invalid"), method = options.method || "GET";
    if (parsed.pathname.includes("/rpc/")) {
      const args = JSON.parse(options.body); state.calls.push({ kind: "native", args });
      if (state.rpcEntered) state.rpcEntered.resolve(); if (state.rpcGate) await state.rpcGate.promise;
      if (state.rowError) throw Error(state.rowError);
      const row = { version: "helmut-s500-stored-command-binding/1", nonce: args.p_nonce,
        rowId: "synthetik500-command-" + args.p_operation_id, database: "mock_owned_local", tableOID: "123", xmin: "456", ctid: "(0,7)",
        storedBytes: Buffer.byteLength(state.body), storedSHA256: sha(state.body), nativeSources: { ...pins.nativeSources },
        dataText: args.p_include_data ? state.body : null };
      if (state.patch) state.patch(row, args); return row;
    }
    if (method === "POST") {
      const data = JSON.parse(options.body); state.calls.push({ kind: "insert", id: data.id });
      assert.match(data.id, /^synthetik500-command-synthetik500-[a-z0-9-]{8,80}$/);
      if (state.rows.has(data.id)) throw Error("mock-immutable-insert-conflict");
      state.rows.set(data.id, jsonb(clone(data.data))); return [{ id: data.id }];
    }
    const id = parsed.searchParams.get("id").slice(3); state.calls.push({ kind: "private", id });
    if (!state.rows.has(id)) return [];
    const data = clone(state.rows.get(id)); if (state.privatePatch) state.privatePatch(data, id);
    return [{ id, data }];
  }
  function rowId(kind) { return "synthetik500-command-synthetik500-" + kind + "-" + sha(JSON.stringify([
    selector.operationId, selector.commandHash, state.target, kind === "proof" ? state.sources : ""])).slice(0, 48); }
  const backend = actual.createBackend(request, () => state.target);
  function another() { return actual.createBackend(request, () => state.target); }
  async function offline() { return backend.prepare(selector); }
  async function install() {
    const p = await backend.open(selector, true), base = await backend.read(p.token, selector);
    await backend.installAuthority(p.token, selector, { command: base.command,
      admission: { mockRootFSValidated: true, issuedAtUTC: new ClockDate().toISOString() },
      testAuthority: { mockAuthorityOnly: true } }); backend.release(p.token); return p;
  }
  async function ready() { const p = await offline(); backend.release(p.token); await install(); return backend.open(selector); }
  function resign(value, mutation = () => {}, privateKey = keys.privateKey) {
    const next = clone(value); mutation(next.payload); next.signature = crypto.sign(null, Buffer.from(JSON.stringify(next.payload)), privateKey).toString("base64"); return next;
  }
  const nativeCalls = () => state.calls.filter(x => x.kind === "native");
  return { state, selector, backend, another, offline, install, ready, rowId, resign, nativeCalls, ClockDate };
}
async function check(name, body) {
  if (filter && !filter.test(name)) return;
  try { await body(); results.push({ name, status: "PASS" }); process.stdout.write("PASS " + name + "\n"); }
  catch (error) { results.push({ name, status: "FAIL", error: error.message, stack: error.stack }); process.stdout.write("FAIL " + name + ": " + error.message + "\n"); }
}
(async () => {
  await check("signed90-offline-once-then-warm-cross-request-content", async () => {
    const x = fixture(); x.state.fullMS = 65000; const offline = await x.offline();
    assert.equal(offline.metrics.wallMs, 65000); assert.equal(offline.executionAuthorized, false);
    const base = await x.backend.read(offline.token, x.selector); assert.equal(base.admission, null); assert.equal(base.testAuthority, null);
    x.backend.release(offline.token); await x.install(); delete x.state.env[PRIV];
    const one = await x.backend.open(x.selector), a = await x.backend.read(one.token, x.selector); x.backend.release(one.token);
    const two = await x.backend.open(x.selector), b = await x.backend.read(two.token, x.selector);
    assert.equal(a.command, b.command); assert.notEqual(one.token, two.token); assert.equal(a.command.shared[0], a.command.shared[1]);
    assert(Object.isFrozen(b.command.shared[0])); assert.equal(x.state.fullWorkers, 1); assert.equal(x.state.restoreWorkers, 0);
  });
  await check("real-ed25519-closed-payload-survives-jsonb-key-order", async () => {
    const x = fixture(), p = await x.offline(); const cert = x.state.rows.get(x.rowId("proof"));
    assert.equal(cert.payload[0], "helmut-s500-content-proof/1"); assert.equal(cert.payload.length, 13);
    assert(cert.payload.every(v => typeof v === "string" || typeof v === "number"));
    assert(crypto.verify(null, Buffer.from(JSON.stringify(cert.payload)), keys.publicKey, Buffer.from(cert.signature, "base64")));
    assert.equal(cert.payload[12], 5); x.backend.release(p.token);
  });
  await check("full90-deadline-and-proof-only-worker-cannot-issue", async () => {
    let x = fixture(); x.state.fullMS = 90000; await assert.rejects(x.offline(), /offline-deadline/); assert.equal(x.state.rows.size, 0);
    for (const patch of [a => { a.mode = "restore"; }, a => { a.diagnostics.commandCalls = 0; }, a => { a.diagnostics.enteredCount = 0; }, a => { a.commandHash = "0".repeat(64); }]) {
      x = fixture(); x.state.workerPatch = patch; await assert.rejects(x.offline(), /worker-binding/); assert.equal(x.state.rows.size, 0);
    }
  });
  await check("ordinary-v1-complete-original-C-without-CPU-epoch-content-only", async () => {
    const x = fixture({ ordinaryLegacy: true }), p = await x.offline();
    assert.equal(p.executionAuthorized, false); assert.equal(x.state.fullWorkers, 1);
    x.backend.release(p.token); await x.install(); delete x.state.env[PRIV];
    const restarted = x.another(), opened = await restarted.open(x.selector);
    const packet = await restarted.read(opened.token, x.selector);
    assert.equal(packet.command.drafts.length, 500); assert(Object.isFrozen(packet.command.drafts[0]));
    assert.equal(x.state.restoreWorkers, 1); assert.equal(x.state.fullWorkers, 1);
  });
  await check("ordinary-v1-incomplete-C-or-wrong-dispatch-cannot-issue-proof", async () => {
    for (const patch of [
      a => { a.diagnostics.commandCalls = 0; }, a => { a.mode = "restore"; },
      a => { a.diagnostics.codecEnteredCount = 0; }, a => { a.diagnostics.qualifiedFalseCount = 0; },
      a => { a.diagnostics.qualifiedFalseCount = 2; }, a => { a.diagnostics.lastFailure = "source-drift"; },
      a => { a.packet.command.drafts[499].briefingEingabe.version = 2; },
      a => { a.packet.command.drafts.pop(); }, a => { a.packet.command.mode = "U-prestage"; },
      a => { a.packet.command.version = "unreviewed"; }
    ]) {
      const x = fixture({ ordinaryLegacy: true }); x.state.workerPatch = patch;
      await assert.rejects(x.offline(), /worker-binding/); assert.equal(x.state.rows.size, 0);
    }
  });
  await check("runtime-cannot-issue-or-install-without-private-key", async () => {
    const x = fixture(); delete x.state.env[PRIV]; await assert.rejects(x.offline()); await assert.rejects(x.backend.open(x.selector, true));
    await assert.rejects(x.backend.open(x.selector)); assert.equal(x.state.fullWorkers, 0); assert.equal(x.state.restoreWorkers, 0); assert.equal(x.state.rows.size, 0);
  });
  await check("proof-cannot-be-reissued-over-immutable-existing-certificate", async () => {
    const x = fixture(), p = await x.offline(); x.backend.release(p.token); const count = x.state.rows.size;
    await assert.rejects(x.offline(), /proof-already-issued/); assert.equal(x.state.fullWorkers, 1); assert.equal(x.state.rows.size, count);
  });
  await check("certificate-alone-and-old-embedded-go-never-authorize-runtime", async () => {
    const x = fixture(), p = await x.offline(); x.backend.release(p.token); delete x.state.env[PRIV];
    await assert.rejects(x.backend.open(x.selector), /root-authority-required/); assert.equal(x.state.restoreWorkers, 0);
  });
  await check("failed-open-does-not-leave-dangling-busy-owner", async () => {
    const x = fixture(), p = await x.offline(); x.backend.release(p.token);
    await assert.rejects(x.backend.open(x.selector), /root-authority-required/);
    const install = await x.backend.open(x.selector, true); x.backend.release(install.token);
    assert.equal(x.state.fullWorkers, 1); assert.equal(x.state.restoreWorkers, 1);
  });
  await check("cold-restart-verifies-proof-and-full-T-root-SHA-with-zero-C", async () => {
    const x = fixture(), p = await x.ready(); x.backend.release(p.token); delete x.state.env[PRIV];
    const other = x.another(), restored = await other.open(x.selector), packet = await other.read(restored.token, x.selector);
    assert.equal(x.state.fullWorkers, 1); assert.equal(x.state.restoreWorkers, 1);
    assert.equal(sha(canonical(packet.command)), x.selector.commandHash); assert.equal(packet.admission.mockRootFSValidated, true);
  });
  await check("restore-worker-mode-or-C-count-mismatch-rejected", async () => {
    for (const patch of [a => { a.mode = "full"; }, a => { a.diagnostics.commandCalls = 1; }, a => { a.diagnostics.codecEnteredCount = 0; }, a => { a.storedSHA256 = "0".repeat(64); }]) {
      const x = fixture(), p = await x.ready(); x.backend.release(p.token); x.state.workerPatch = (a, i, mode) => { if (mode === "restore") patch(a); };
      await assert.rejects(x.another().open(x.selector)); assert.equal(x.state.fullWorkers, 1);
    }
  });
  await check("cold-runtime60-deadline-is-not-offline90", async () => {
    const x = fixture(), p = await x.ready(); x.backend.release(p.token); x.state.restoreMS = 60000;
    await assert.rejects(x.another().open(x.selector), /restore-deadline/); assert.equal(x.state.fullWorkers, 1);
  });
  for (const [name, change] of [
    ["nonce", row => { row.nonce = "0".repeat(64); }], ["body-sha", row => { row.storedSHA256 = "0".repeat(64); }],
    ["body-bytes", row => { row.storedBytes++; }], ["row-id", row => { row.rowId += "-other"; }],
    ["native-source", row => { row.nativeSources.helmut_s500_command_immutable_row_v1 = "0".repeat(64); }],
    ["native-source-missing", row => { delete row.nativeSources.helmut_s500_command_no_truncate_v1; }],
    ["native-source-extra", row => { row.nativeSources.extra = "0".repeat(64); }]
  ]) await check("native-" + name + "-rejects-before-full-worker", async () => { const x = fixture(); x.state.patch = change;
    await assert.rejects(x.offline()); assert.equal(x.state.fullWorkers, 0); });
  for (const [name, change] of [
    ["target", s => { s.target = "other-target"; }], ["source-policy", s => { s.sources = "changed-source-or-policy"; }],
    ["xmin-ABA", s => { s.patch = row => { row.xmin = "457"; }; }], ["ctid-ABA", s => { s.patch = row => { row.ctid = "(0,8)"; }; }],
    ["database", s => { s.patch = row => { row.database = "other-db"; }; }], ["content", s => { s.body = JSON.stringify({ changed: true }); }],
    ["unknown-IO", s => { s.rowError = "unknown-native-read"; }]
  ]) await check("reuse-" + name + "-revokes-without-auto-offline", async () => { const x = fixture(), p = await x.ready(); change(x.state);
    await assert.rejects(x.backend.read(p.token, x.selector)); x.state.patch = null; x.state.rowError = null;
    await assert.rejects(x.backend.read(p.token, x.selector)); assert.equal(x.state.fullWorkers, 1); });
  for (const [name, token] of [["forged", {}], ["serialized", JSON.parse("{}")], ["primitive", 1]])
    await check(name + "-session-token-rejected", async () => { const x = fixture(), p = await x.ready();
      await assert.rejects(x.backend.read(token, x.selector), /context/); await assert.rejects(x.backend.read(p.token, x.selector), /context/); });
  await check("cross-backend-session-token-rejected", async () => { const x = fixture(), p = await x.ready(); await assert.rejects(x.another().read(p.token, x.selector), /context/); });
  await check("fresh-content-and-authority-read-every-checkpoint", async () => {
    const x = fixture(), p = await x.ready(), before = x.state.calls.length;
    let packet;
    for(let i=0;i<10;i++)packet=await x.backend.read(p.token,x.selector);
    for(let i=0;i<6;i++){const proof=await x.backend.readProof(p.token,x.selector,packet);x.backend.consumeProof(p.token,x.selector,packet.command,proof);}
    const calls = x.state.calls.slice(before); assert.equal(calls.filter(c => c.kind === "native").length, 16);
    assert.equal(calls.filter(c => c.kind === "private" && c.id === x.rowId("authority")).length, 16);
    assert.equal(new Set(x.nativeCalls().map(c => c.args.p_nonce)).size, x.nativeCalls().length);
    assert.equal(x.state.fullWorkers, 1);
  });
  await check("single-use-admission-proof-and-release", async () => {
    const x = fixture(), p = await x.ready(), packet = await x.backend.read(p.token, x.selector), before = x.nativeCalls().length;
    const proof = await x.backend.readProof(p.token, x.selector, packet); assert.equal(x.nativeCalls().length, before + 1);
    assert(Object.isFrozen(proof)); assert.equal(Object.getPrototypeOf(proof), null);
    assert.equal(x.backend.consumeProof(p.token, x.selector, packet.command, proof).commandHash, x.selector.commandHash);
    assert.throws(() => x.backend.consumeProof(p.token, x.selector, packet.command, proof), /proof/);
    await assert.rejects(x.backend.read(p.token, x.selector), /context/);
  });
  for (const [name, proof] of [["forged", {}], ["serialized", JSON.parse("{}")], ["primitive", 1]])
    await check(name + "-admission-proof-rejected", async () => { const x = fixture(), p = await x.ready(), packet = await x.backend.read(p.token, x.selector);
      assert.throws(() => x.backend.consumeProof(p.token, x.selector, packet.command, proof), /proof/); });
  await check("foreign-backend-proof-cannot-authorize-current-command", async () => {
    const x = fixture(), p = await x.ready(), packet = await x.backend.read(p.token, x.selector), other = x.another(), q = await other.open(x.selector), foreign = await other.read(q.token, x.selector), proof = await other.readProof(q.token, x.selector, foreign);
    assert.throws(() => x.backend.consumeProof(p.token, x.selector, packet.command, proof), /proof/);
  });
  await check("copied-packet-command-and-authority-overlay-rejected", async () => {
    let x = fixture(), p = await x.ready(), packet = await x.backend.read(p.token, x.selector);
    await assert.rejects(x.backend.readProof(p.token, x.selector, { ...packet, admission: { fake: true } }), /packet-identity/);
    x = fixture(); p = await x.ready(); packet = await x.backend.read(p.token, x.selector); const proof = await x.backend.readProof(p.token, x.selector, packet);
    assert.throws(() => x.backend.consumeProof(p.token, x.selector, structuredClone(packet.command), proof), /proof/);
  });
  await check("request-release-invalidates-old-token-and-cross-request-unused-proof", async () => {
    const x = fixture(), p = await x.ready(), a = await x.backend.read(p.token, x.selector), proof = await x.backend.readProof(p.token, x.selector, a);
    x.backend.release(p.token); const q = await x.backend.open(x.selector), b = await x.backend.read(q.token, x.selector);
    assert.equal(a.command, b.command); assert.notEqual(p.token, q.token);
    assert.throws(() => x.backend.consumeProof(q.token, x.selector, b.command, proof), /proof/);
  });
  await check("proof-before-authority-attachment-cannot-authorize-later-packet",async()=>{
    const x=fixture(),offline=await x.offline();x.backend.release(offline.token);
    const owner=await x.backend.open(x.selector,true),base=await x.backend.read(owner.token,x.selector);
    const oldProof=await x.backend.readProof(owner.token,x.selector,base);
    await x.backend.installAuthority(owner.token,x.selector,{command:base.command,admission:{mockRootFSValidated:true},testAuthority:{mockAuthorityOnly:true}});
    const actual=await x.backend.read(owner.token,x.selector);assert.notEqual(actual,base);
    assert.throws(()=>x.backend.consumeProof(owner.token,x.selector,actual.command,oldProof),/proof|authority/);
  });
  await check("released-session-hash-and-proof-never-reopen", async () => {
    const x = fixture(), p = await x.ready(), packet = await x.backend.read(p.token, x.selector), proof = await x.backend.readProof(p.token, x.selector, packet);
    x.backend.release(p.token); assert.throws(() => x.backend.content(p.token, x.selector, packet.command), /context/);
    assert.throws(() => x.backend.consumeProof(p.token, x.selector, packet.command, proof), /context/);
  });
  for (const [name, change] of [["expiry", s => { s.clock = 8 * 3600000; }], ["source", s => { s.sources += "-drift"; }], ["target", s => { s.target += "-drift"; }]])
    await check(name + "-between-fresh-read-and-consume-rejected", async () => { const x = fixture(), p = await x.ready(), packet = await x.backend.read(p.token, x.selector), proof = await x.backend.readProof(p.token, x.selector, packet);
      change(x.state); assert.throws(() => x.backend.consumeProof(p.token, x.selector, packet.command, proof), /context|certificate|plan-expired/); });
  await check("fixed-plan-expiry-over-requests-and-restart-no-renewal", async () => {
    const x = fixture(), p = await x.ready(), expires = x.state.rows.get(x.rowId("proof")).payload[11];
    x.state.clock = 7 * 3600000; await x.backend.read(p.token, x.selector); x.backend.release(p.token);
    const q = await x.backend.open(x.selector); assert.equal(x.state.rows.get(x.rowId("proof")).payload[11], expires); x.backend.release(q.token);
    x.state.clock = 8 * 3600000; await assert.rejects(x.another().open(x.selector), /certificate-binding/); assert.equal(x.state.fullWorkers, 1);
  });
  await check("expiry-during-native-read-fails-closed", async () => { const x = fixture(), p = await x.ready(); x.state.patch = () => { x.state.clock = 8 * 3600000; }; await assert.rejects(x.backend.read(p.token, x.selector)); });
  await check("signature-type-domain-base64-and-trusted-key-negatives", async () => {
    for (const mutate of [c => { c.signature = "!" + c.signature; }, c => { c.signature = Buffer.alloc(63).toString("base64"); },
      c => { c.payload[0] = "helmut-s500-root-authority/1"; }, c => { c.payload[1] = "0".repeat(64); },
      c => { c.signature = crypto.sign(null, Buffer.from(JSON.stringify(c.payload)), otherKeys.privateKey).toString("base64"); }, c => { c.extra = true; }]) {
      const x = fixture(), p = await x.ready(); x.backend.release(p.token); const id = x.rowId("proof"), cert = clone(x.state.rows.get(id)); mutate(cert); x.state.rows.set(id, cert);
      await assert.rejects(x.another().open(x.selector)); assert.equal(x.state.restoreWorkers, 0); assert.equal(x.state.fullWorkers, 1);
    }
  });
  for (const [name, index, value] of [["operation",2,"synthetik500-other-operation"],["command-hash",3,"0".repeat(64)],["target",4,"foreign-target"],["sources",5,"foreign-sources"],["actual-row",6,"wrong-actual-row"],["native-sources",7,"0".repeat(64)],["node",8,"v0.0.0"],["policy",9,"0".repeat(64)],["future-issued",10,"2099-01-01T00:00:00.000Z"],["expired",11,"2020-01-01T00:00:00.000Z"],["offline-over90",12,90001]])
    await check("signed-certificate-binding-" + name, async () => { const x = fixture(), p = await x.ready(); x.backend.release(p.token); const id=x.rowId("proof"); x.state.rows.set(id,x.resign(x.state.rows.get(id), a=>{a[index]=value;})); await assert.rejects(x.another().open(x.selector)); assert.equal(x.state.fullWorkers,1); });
  await check("signed-certificate-max9h-and-plan-end-enforced", async () => {
    let x=fixture(),p=await x.ready();x.backend.release(p.token);let id=x.rowId("proof");x.state.rows.set(id,x.resign(x.state.rows.get(id),a=>{a[11]=new Date(BASE+NINE_HOURS+1000).toISOString();}));await assert.rejects(x.another().open(x.selector),/certificate-binding/);
    x=fixture({planHours:2});p=await x.ready();x.backend.release(p.token);id=x.rowId("proof");x.state.rows.set(id,x.resign(x.state.rows.get(id),a=>{a[11]=new Date(BASE+3*3600000).toISOString();}));await assert.rejects(x.another().open(x.selector),/certificate-plan-expiry/);
  });
  await check("fake-authority-row-and-content-cert-as-authority-rejected", async () => {
    for(const mutate of [x=>{x.state.rows.set(x.rowId("authority"),{payload:["fake"],signature:"fake"});},x=>{x.state.rows.set(x.rowId("authority"),clone(x.state.rows.get(x.rowId("proof"))));},x=>{const c=clone(x.state.rows.get(x.rowId("authority")));c.payload[6]=canonical({admission:{fakeGO:true},testAuthority:{fakeGO:true}});x.state.rows.set(x.rowId("authority"),c); }]){const x=fixture(),p=await x.ready();mutate(x);await assert.rejects(x.backend.read(p.token,x.selector));}
  });
  await check("signed-authority-wrong-binding-or-noncanonical-overlay-rejected", async () => {
    for(const mutate of [p=>{p[2]+="-other";},p=>{p[3]="0".repeat(64);},p=>{p[4]+="-other";},p=>{p[5]+="-other";},p=>{p[6]='{"testAuthority":null,"admission":null}';},p=>{p[6]=canonical({admission:null,testAuthority:null,extra:true});}]){const x=fixture(),p=await x.ready(),id=x.rowId("authority");x.state.rows.set(id,x.resign(x.state.rows.get(id),mutate));await assert.rejects(x.backend.read(p.token,x.selector));}
  });
  await check("authority-disappearance-or-replacement-invalidates-pending-proof", async () => {
    for(const change of [x=>x.state.rows.delete(x.rowId("authority")),x=>{const id=x.rowId("authority");x.state.rows.set(id,x.resign(x.state.rows.get(id),a=>{a[6]=canonical({admission:{different:true},testAuthority:null});}));}]){const x=fixture(),p=await x.ready();change(x);await assert.rejects(x.backend.read(p.token,x.selector));}
  });
  await check("runtime-session-cannot-sign-authority-and-verifyFile-binds-actual-blob", async () => {
    const x=fixture(),p=await x.ready(),packet=await x.backend.read(p.token,x.selector);x.backend.verifyFile(p.token,x.selector,Buffer.from(x.state.body));
    assert.throws(()=>x.backend.verifyFile(p.token,x.selector,Buffer.from('{"changed":true}')),/original-content-file/);
    await assert.rejects(x.backend.installAuthority(p.token,x.selector,packet),/authority-install-scope/);
  });
  await check("proof-authority-ids-covered-for-min-max-operations", async () => {
    for(const operationId of ["synthetik500-"+"a".repeat(8),"synthetik500-"+"a".repeat(80)]){const x=fixture({operationId}),p=await x.ready();assert.match(x.rowId("proof"),/^synthetik500-command-synthetik500-[a-z0-9-]{8,80}$/);assert.match(x.rowId("authority"),/^synthetik500-command-synthetik500-[a-z0-9-]{8,80}$/);x.backend.release(p.token);}
  });
  await check("active-winner-cannot-be-revoked-by-open-or-prepare-contender", async () => {
    const x=fixture(),p=await x.ready();await assert.rejects(x.backend.open(x.selector),/busy/);await assert.rejects(x.backend.prepare(x.selector),/busy/);await x.backend.read(p.token,x.selector);assert.equal(x.state.fullWorkers,1);
  });
  await check("busy-read-or-readProof-contender-preserves-winning-read", async () => {
    const x=fixture(),p=await x.ready(),packet=await x.backend.read(p.token,x.selector);x.state.rpcGate=deferred();x.state.rpcEntered=deferred();const winning=x.backend.read(p.token,x.selector);await x.state.rpcEntered.promise;
    await assert.rejects(x.backend.read(p.token,x.selector),/busy/);await assert.rejects(x.backend.readProof(p.token,x.selector,packet),/busy/);x.state.rpcGate.resolve();assert.equal(await winning,packet);
  });
  // Actual extracted ALS scope functions, explicit open-based backend mock.
  function scopeFixture(){
    let owner;const state={opens:0,prepares:0,reads:0,releases:0,installs:0,verifyFiles:0,loadAuthorityError:null};const packet={command:{slot:{plan:{operationId:"synthetik500-scope-tests"}}}};
    const api={async open(args,installation){state.opens++;owner={token:{},kind:installation?"installation":"request",closed:false};return{token:owner.token,metrics:{mock:true}};},async prepare(){state.prepares++;throw Error("should-not-offline");},async read(token){if(token!==owner.token||owner.closed)throw Error("mock-owner");state.reads++;return packet;},release(token){assert.equal(token,owner.token);owner.closed=true;state.releases++;},verifyFile(){state.verifyFiles++;},async installAuthority(token){if(owner.kind!=="installation")throw Error("mock-authority-install-scope");state.installs++;},readProof:async()=>({}),consumeProof:()=>({}),content:()=>({})};
    const start=storageSource.indexOf("async function loadSynthetik500ProductionCommand("),end=storageSource.indexOf("async function retainSynthetik500ProductionEvidence(",start);assert(start>=0&&end>start);
    const names=["withSynthetik500PreparedCommand","withSynthetik500InstallationCommand","installSynthetik500StoredAuthority","prepareSynthetik500StoredCommand","readPreparedSynthetik500StoredCommand","loadSynthetik500ProductionCommand","synthetik500StoredAdmissionProof","synthetik500BoundContent"];
    const text=storageSource.slice(start,end)+"\nmodule.exports={"+names.join(",")+"};";const m={exports:{}};
    const C={readPin:()=>Buffer.from("mock-file"),loadAuthority:()=>{if(state.loadAuthorityError)throw state.loadAuthorityError;return packet;}};
    vm.runInThisContext("(function(require,module,crypto,process,synthetik500ProductionBackend,supabaseRequest,supabaseServiceRoleKey,supabaseStoreId,synthetik500PrivateRead,synthetik500PrivateId){"+text+"})",{filename:storageFile})(n=>n==="node:async_hooks"?require(n):n==="./synthetik-500-stored-command"?{createBackend:()=>api}:n==="./synthetik-500-production-command"?C:(()=>{throw Error("unexpected-module:"+n);})(),m,crypto,{env:{}},()=>{},()=>{throw Error("network-forbidden");},()=>"mock","mock",()=>{throw Error("unexpected-private-read");},()=>"mock");
    return{S:m.exports,state,args:{operationId:"synthetik500-scope-tests",commandHash:"a".repeat(64)}};
  }
  await check("ALS-now-uses-open-and-contenders-cannot-evict-winner", async()=>{const h=scopeFixture(),entered=deferred(),leave=deferred();const p=h.S.withSynthetik500PreparedCommand(h.args,async()=>{entered.resolve();await leave.promise;await h.S.loadSynthetik500ProductionCommand(h.args.operationId,h.args.commandHash);});await entered.promise;await assert.rejects(h.S.withSynthetik500PreparedCommand(h.args,()=>{}),/execution-busy/);await assert.rejects(h.S.prepareSynthetik500StoredCommand(h.args),/execution-busy/);await assert.rejects(h.S.readPreparedSynthetik500StoredCommand({},h.args),/execution-busy/);leave.resolve();await p;assert.equal(h.state.opens,1);assert.equal(h.state.prepares,0);assert.equal(h.state.releases,1);});
  await check("ALS-closed-generation-rejects-late-async-before-later-winner",async()=>{const h=scopeFixture(),gate=deferred();let late;await h.S.withSynthetik500PreparedCommand(h.args,async()=>{late=gate.promise.then(()=>h.S.loadSynthetik500ProductionCommand(h.args.operationId,h.args.commandHash));});const entered=deferred(),leave=deferred();const p=h.S.withSynthetik500PreparedCommand(h.args,async()=>{entered.resolve();await leave.promise;await h.S.loadSynthetik500ProductionCommand(h.args.operationId,h.args.commandHash);});await entered.promise;gate.resolve();await assert.rejects(late,/execution-scope/);leave.resolve();await p;assert.equal(h.state.opens,2);assert.equal(h.state.reads,1);});
  await check("ALS-Root-FS-gate-failure-precedes-authority-signing-INSERT",async()=>{const h=scopeFixture();h.state.loadAuthorityError=Error("mock-real-Root-FS-rejection");await assert.rejects(h.S.withSynthetik500InstallationCommand(h.args,()=>h.S.installSynthetik500StoredAuthority({}, {},h.args)),/mock-real-Root-FS-rejection/);assert.equal(h.state.verifyFiles,1);assert.equal(h.state.installs,0);assert.equal(h.state.releases,1);});
  await check("ALS-request-cannot-escalate-to-installation-via-nested-scope",async()=>{const h=scopeFixture();await h.S.withSynthetik500PreparedCommand(h.args,async()=>{await assert.rejects(h.S.withSynthetik500InstallationCommand(h.args,()=>h.S.installSynthetik500StoredAuthority({}, {},h.args)),/mock-authority-install-scope/);});assert.equal(h.state.installs,0);assert.equal(h.state.opens,1);});
  // Real original Root-FS pin/admission functions, mocked private immutable
  // content capability. These temporary protocol fixtures are NOT owner GO.
  async function rootFSFixture(body) {
    const dir=fs.mkdtempSync(path.join(require("node:os").tmpdir(),"helmut-s500-rootfs-mock-"));
    let counter=0,now=BASE+65000,fullCCalls=0,currentCommand;
    class RootClock extends Date {constructor(...xs){super(...(xs.length?xs:[now]));}static now(){return now;}}
    const immutableHash="d".repeat(64),planHash="e".repeat(64);
    const epoch={bindFacts(){},bindSelector(){},isActive(){return false;},bindCommand(){return()=>{fullCCalls++;throw Error("full-C-forbidden-in-Root-FS-test");};}};
    const req=name=>{
      if(name==="node:fs"||name==="node:crypto")return require(name);
      if(name==="./storage")return{synthetik500BoundContent:command=>command===currentCommand?{commandHash:immutableHash,plan:command.slot.plan}:null};
      if(name==="./synthetik-500-profile")return{hash:()=>immutableHash,kanonisch:canonical};
      if(name==="./synthetik-500-cpu-epoch")return epoch;
      if(name==="./synthetik-500-u-no-sender")return{bindings:()=>[]};
      if(["./canonical-content-facts","./synthetik-500-eu-service-contract","./synthetik-500-date-binding","./synthetik-500-kosten-admission","./knowledge-object-version"].includes(name))return{};
      throw Error("unexpected-Root-FS-module:"+name);
    };
    const C=loadActual(commandSource,commandFile,req,{env:{}},RootClock);
    currentCommand={version:C.DIRECT_VERSION,mode:"D-R-500",package:{bindung:{paketHash:"f".repeat(64)}},slot:{planHash,plan:{operationId:"synthetik500-rootfs-protocol-tests",runId:"mock-run",productionCommit:"c".repeat(40),startsAtUTC:new Date(BASE+60000).toISOString(),endsAtUTC:new Date(BASE+7200000).toISOString(),routeContract:{route:{deploymentId:"mock-deployment"}}}}};
    function pin(value){const bytes=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value)),file=path.join(dir,String(counter++)+".json");fs.writeFileSync(file,bytes,{mode:0o600});return{path:file,bytes:bytes.length,sha256:sha(bytes)};}
    const commandPin=pin({MOCK_CONTENT_ONLY:true});
    function record(age=0,goChange=()=>{}) {
      const plan=currentCommand.slot.plan,go={version:"helmut-synthetik500-test-go/1",operationId:plan.operationId,productionCommit:plan.productionCommit,deploymentId:plan.routeContract.route.deploymentId,planHash,paketHash:currentCommand.package.bindung.paketHash,startsAtUTC:plan.startsAtUTC,endsAtUTC:plan.endsAtUTC,authorizedAtUTC:new RootClock().toISOString(),authorizationReference:"MOCK PROTOCOL FIXTURE ONLY; NOT OWNER GO",confirmation:"SEPARATES_GO_EXAKT500_SYNTHETIK_PRODUCTION_TEST"};goChange(go);
      const primary=pin(Buffer.from("MOCK LOCAL PRIMARY; NO PRODUCTION EVIDENCE")),goPin=pin(go),gates={},evidencePins={};
      for(const purpose of C.DIRECT_GATES){gates[purpose]=true;evidencePins[purpose]=pin({version:C.ACTUAL_GATE_VERSION,purpose,rootExecutor:"/root",operationId:plan.operationId,runId:plan.runId,productionCommit:plan.productionCommit,planHash,commandHash:immutableHash,acceptedActualScope:true,primaryEvidencePins:[purpose==="testGo"?goPin:primary]});}
      const value={version:C.ADMISSION_VERSION,executor:"/root",purpose:"finite-D-R-500",commandHash:immutableHash,planHash,productionCommit:plan.productionCommit,admittedAtUTC:new Date(now-age).toISOString(),expiresAtUTC:plan.endsAtUTC,controlHash:immutableHash,booksHash:immutableHash,gates,evidencePins};return{value,pin:pin(value),primary};
    }
    try{await body({C,command:currentCommand,commandPin,record,pin,now:()=>now,setNow:value=>{now=value;},fullCCalls:()=>fullCCalls});}
    finally{fs.rmSync(dir,{recursive:true,force:true});}
  }
  await check("Root-FS-fresh60-starts-after-simulated65s-offline",()=>rootFSFixture(h=>{
    const fresh=h.record(),packet=h.C.loadAuthority(h.command,h.commandPin,fresh.pin,new Date(h.now()).toISOString());assert.equal(packet.command,h.command);assert.equal(packet.admission.admittedAtUTC,new Date(BASE+65000).toISOString());assert.equal(h.fullCCalls(),0);
    const old=h.record(65000);assert.throws(()=>h.C.loadAuthority(h.command,h.commandPin,old.pin,new Date(h.now()).toISOString()),/genuine-root-admission-required/);assert.equal(h.fullCCalls(),0);
  }));
  await check("Root-FS-missing-or-drifted-original-primary-refuses-authority",()=>rootFSFixture(h=>{
    let value=h.record();fs.unlinkSync(value.primary.path);assert.throws(()=>h.C.loadAuthority(h.command,h.commandPin,value.pin,new Date(h.now()).toISOString()));
    value=h.record();const bytes=fs.readFileSync(value.primary.path);bytes[0]^=1;fs.writeFileSync(value.primary.path,bytes);assert.throws(()=>h.C.loadAuthority(h.command,h.commandPin,value.pin,new Date(h.now()).toISOString()),/synthetik500-production-evidence-bytes/);assert.equal(h.fullCCalls(),0);
  }));
  await check("Root-FS-wrong-original-testGO-binding-refuses-authority",()=>rootFSFixture(h=>{
    const wrong=h.record(0,go=>{go.operationId+="-wrong";});assert.throws(()=>h.C.loadAuthority(h.command,h.commandPin,wrong.pin,new Date(h.now()).toISOString()),/direct-separate-test-go-required/);assert.equal(h.fullCCalls(),0);
  }));
  const failed=results.filter(x=>x.status==="FAIL").length;
  const result={passed:results.length-failed,failed,cases:results,sourceSHA256:sha(source),storageSourceSHA256:sha(storageSource),commandSourceSHA256:sha(commandSource),
    scope:"ACTUAL_BACKEND_AND_EXTRACTED_ALS_MOCKED_RPC_WORKER_ROOTFS_WITH_REAL_TEMPORARY_ED25519_KEYS",productionCalls:0,networkCalls:0,nativeDB:false,fullC:false,Auth30:false,Unit60:false};
  const output=process.argv.find(x=>x.startsWith("--output="));if(output)fs.writeFileSync(output.slice(9),JSON.stringify(result,null,2)+"\n");
  process.stdout.write(JSON.stringify({passed:result.passed,failed,sourceSHA256:result.sourceSHA256,storageSourceSHA256:result.storageSourceSHA256,scope:result.scope,productionCalls:0,networkCalls:0,fullC:false,Auth30:false,Unit60:false})+"\n");if(failed)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
