"use strict";

// Only labelled synthetic VM stores and bounded in-memory stderr. No original
// inputs, native endpoint, subprocess, database, engine or provider is opened.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const A = require("../lib/helmut/local-unit-diagnostic-authority");
const P = require("../lib/helmut/synthetik-500-profile");
const H = require("./local-unit-diagnostic-authority-test");
const filename = path.resolve(__dirname, "../lib/helmut/local-unit-diagnostic-scope.js");
const source = fs.readFileSync(filename, "utf8"), prefix = "HELMUT_SCOPE_TIMING_V1 ";
const secret = "SYNTHETIC_PRIVATE_VALUE_MUST_NEVER_BE_LOGGED";
let checks = 0;
function sink(mode = "normal") {
  const rows = [], handlers = new Map();
  return { rows, handlers, on(name, fn) { handlers.set(name, fn); }, write(row, callback) {
    rows.push(row);
    if (mode === "throw") throw Error(secret);
    if (mode === "callback") callback(Error(secret));
    else if (mode === "stream") handlers.get("error")(Error(secret));
    else callback();
    return false; // Backpressure is never an authority result or a retry request.
  } };
}
function harness(stderr, casError = null) {
  const f = H.fixture(), calls = []; let state = structuredClone(f.auth), wall = Date.parse(H.at), ns = 0n, mutations = 0;
  const tick = name => { calls.push(name); wall++; ns += 1000000n; };
  class Clock extends Date { constructor(value) { super(arguments.length ? value : wall); } static now() { return wall; } }
  const store = {
    async readLocalUnitDiagnosticAuthority() { tick("authority"); return Object.freeze({}); },
    consumeLocalUnitDiagnosticAuthority() { return { command: f.command, admission: f.admission, sourceHandle: Object.freeze({}) }; },
    async readLocalUnitDiagnosticRuntime() { tick("runtime"); return Object.freeze({}); },
    consumeLocalUnitDiagnosticRuntime() { return { ...f.selection, sourceHash: P.hash(f.command.source), targetHash: P.hash(f.command.target), observedAtUTC: new Clock().toISOString() }; },
    async readLocalUnitDiagnosticOriginalControl() {
      tick("original-control"); return { synthetik500DispatchJournal: {}, synthetik500KostenAdmission: {}, testKostenAuftrag: {}, testKostenTage: {} };
    },
    async readSynthetik500CurrentInputs() { tick("inputs"); return structuredClone(f.command.drafts[0].sources); },
    async getProfileFromDb() { tick("profile"); return structuredClone(f.command.drafts[0].profile); },
    async readLocalUnitDiagnosticState() { tick("state"); return structuredClone(state); },
    async mutateLocalUnitDiagnosticState(_selection, change) {
      tick("cas"); mutations++; const next = structuredClone(state), result = change(next); state = next;
      if (casError && mutations === 2) throw casError;
      return result;
    },
    async getLageEntwurfsbeleg() { throw Error("forbidden synthetic artifact read"); },
    async readLocalUnitDiagnosticArtifact() { throw Error("forbidden synthetic artifact read"); }
  };
  const transport = Object.freeze({});
  const box = { module: { exports: {} }, structuredClone, Date: Clock, require(name) {
    if (name === "node:process") return { hrtime: { bigint: () => ns }, stderr };
    if (name === "./storage") return store;
    if (name === "./local-unit-diagnostic-authority") return A;
    if (name === "./synthetik-500-profile") return P;
    if (name === "./local-unit-diagnostic-source") return { verifyCommandSource() { tick("source"); } };
    if (name === "./local-unit-diagnostic-transport") return {
      async prepareOriginals() { tick("transport"); return transport; }, verifyHandle(value) { assert.equal(value, transport); }
    };
    if (name === "./synthetik-500-production-command") return require("../lib/helmut/synthetik-500-production-command");
    if (name === "./synthetik-500-local-calendar") return { acceptsInput: () => true };
    if (name === "./briefing-lagebindung") return { pruefe: () => ({ eingabeHash: "f".repeat(64) }) };
    return require(name);
  } };
  vm.runInNewContext(source, box, { filename });
  return { f, calls, scope: box.module.exports, mutations: () => mutations,
    run: work => box.module.exports.runClaimed(f.selection, () => work(box.module.exports)) };
}
function rows(output) {
  return output.rows.map(line => { assert(line.startsWith(prefix)); return JSON.parse(line.slice(prefix.length)); });
}
function privateTimer(stderr, clock = () => 100n) {
  const box = { module: { exports: {} }, require(name) {
    if (name === "node:process") return { hrtime: { bigint: clock }, stderr };
    if (name === "./local-unit-diagnostic-authority") return A;
    if (name === "./synthetik-500-profile") return P;
    return require(name);
  } };
  // Expose the lexical helper only in this VM, never in the real module API.
  vm.runInNewContext(source + "\nmodule.exports = timingTrace;\n", box, { filename });
  return box.module.exports(0n);
}
async function test(name, work) { await work(); checks++; console.log("PASS " + name); }
(async () => {
  await test("one operation per await, identical return, fixed private phases and unchanged clock guards", async () => {
    const output = sink(), observed = harness(output), inert = harness(undefined), ack = Object.freeze({ private: secret });
    const work = async s => { await s.checkControl("unit-enter"); return s.mutateState(() => ack); };
    assert.equal(await observed.run(work), ack); assert.equal(await inert.run(work), ack);
    assert.deepEqual(observed.calls, inert.calls);
    assert.deepEqual(observed.calls, ["authority", "source", "transport", "runtime", "cas", "state", "runtime", "original-control", "inputs", "profile", "state", "cas"]);
    const logged = rows(output), group = logged.filter(row => row[2] === 0 && row[3] === "unit-enter");
    assert.deepEqual(group.map(row => row.slice(0, 2)), ["runtime", "original-control", "inputs", "profile", "state"].flatMap(name => [[name, 0], [name, 1]]));
    assert(logged.every(row => row.length === 6 && /^[0-9]+$/.test(row[4]) && new Date(row[5]).toISOString() === row[5]));
    assert.equal(logged[0][0], "entry"); assert.equal(logged.at(-1)[0], "scope");
    assert(!output.rows.join("").includes(secret));
    assert(!output.rows.join("").includes(observed.f.selection.commandHash));
    assert(!output.rows.join("").includes(observed.f.owner));
  });
  await test("missing sink and write, callback or stream failures never change return/error or retry unknown CAS", async () => {
    let logClockReads = 0; const absent = privateTimer(undefined, () => { logClockReads++; return 0n; });
    const ack = Object.freeze({}), failure = Object.freeze(Error(secret));
    assert.equal(await absent.wait("state", () => ack), ack); assert.equal(logClockReads, 0);
    for (const mode of ["throw", "callback", "stream"]) {
      const output = sink(mode), h = harness(output, failure);
      await assert.rejects(h.run(async s => {
        await s.checkControl("unit-enter");
        await assert.rejects(s.mutateState(() => ack), error => error === failure);
        await assert.rejects(s.checkControl("before-D"), /control-order-or-replay/);
        throw failure;
      }), error => error === failure);
      assert.equal(h.mutations(), 2); assert.equal(h.calls.filter(x => x === "authority").length, 1);
      await assert.rejects(h.run(() => ack), /invocation-already-attempted/);
      assert.equal(h.mutations(), 2); assert.equal(output.rows.length, 1);
      assert(!output.rows.join("").includes(secret));
    }
  });
  await test("256 event and 24KiB ASCII caps stop logging while operations and original errors continue", async () => {
    const output = sink(), trace = privateTimer(output), ack = Object.freeze({}); let calls = 0;
    for (let i = 0; i < 200; i++) assert.equal(await trace.wait("cas", () => { calls++; return ack; }), ack);
    assert.equal(calls, 200); assert.equal(output.rows.length, 256);
    assert(Buffer.byteLength(output.rows.join("")) <= 24576);
    const large = sink(), capped = privateTimer(large, () => 10n ** 38n);
    const stage = [...A.CONTROL_STAGES].sort((a, b) => b.length - a.length)[0];
    for (let i = 0; i < 300; i++) capped.mark("original-control", 0, 15, stage);
    const bytes = Buffer.byteLength(large.rows.join("")), count = large.rows.length;
    assert(bytes <= 24576 && count > 0 && count < 256);
    assert(large.rows.every(row => /^[\x00-\x7f]*$/.test(row)));
    const failure = Object.freeze(Error(secret)); let attempts = 0;
    await assert.rejects(capped.wait("cas", () => { attempts++; throw failure; }), error => error === failure);
    assert.equal(attempts, 1); assert.equal(large.rows.length, count);
  });
  console.log(JSON.stringify({ pass: true, checks, nativeExecution: false, databaseCalls: 0, motorCalls: 0, providerCalls: 0,
    unit60Qualified: false, auth30Qualified: false, full500Accepted: false }));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
