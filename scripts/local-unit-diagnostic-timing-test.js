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
  store.readLocalUnitDiagnosticControlRuntime = (...args) => store.readLocalUnitDiagnosticRuntime(...args);
  store.readLocalUnitDiagnosticControlSnapshot = async selection => ({
    original: await store.readLocalUnitDiagnosticOriginalControl(selection),
    inputs: await store.readSynthetik500CurrentInputs(), profile: await store.getProfileFromDb(),
    state: await store.readLocalUnitDiagnosticState(selection)
  });
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
function forensicScope() {
  let ns = 64000000000n;
  const box = { module: { exports: {} }, Date, require(name) {
    if (name === "node:process") return { hrtime: { bigint: () => ns } };
    if (name === "./local-unit-diagnostic-authority") return A;
    if (name === "./synthetik-500-profile") return P;
    return require(name);
  } };
  // Only this synthetic VM exposes lexical context; no native scope is opened.
  vm.runInNewContext(source + "\nmodule.exports = { observeFailure, rememberFailure, consumeFailureDiagnostics, timingTrace, run: (c, work) => context.run(c, work) };\n", box, { filename });
  const c = { selection: { operationId: "synthetic", commandHash: "b".repeat(64) }, timing: { startedMonotonic: 0n },
    authorization: { startedAtUTC: "2026-10-24T00:00:00.000Z", confirmedAtUTC: "2026-10-24T00:00:01.000Z", elapsedNs: "1000000000" },
    controls: [], activeControl: null };
  return { scope: box.module.exports, c, clock: value => { ns = value; } };
}
function earlyWriter(observer) {
  const file = path.join(__dirname, "../lib/helmut/local-unit-diagnostic-original-writer.js");
  const box = { module: { exports: {} }, process: { stderr: null }, require(name) {
    if (name.startsWith("node:")) return require(name);
    if (name === "./local-unit-diagnostic-scope") return { observeFailure: observer };
    return {}; // Invalid closed API fails before any real dependency or I/O.
  } };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), box, { filename: file });
  return box.module.exports;
}
async function test(name, work) { await work(); checks++; console.log("PASS " + name); }
(async () => {
  await test("first observed writer error survives a swallowed usage error and later cleanup", async () => {
    const h = forensicScope(), primary = Error("local-unit-diagnostic-unit-monotonic-or-utc-deadline");
    Object.defineProperty(primary, "stack", { value: "Error: " + secret + "\n    at elapsed (/workspace/synthetic/lib/helmut/local-unit-diagnostic-scope.js:36:5)", configurable: true });
    const later = Error(secret);
    h.scope.run(h.c, () => {
      h.scope.observeFailure(primary, "original-writer-usage");
      h.clock(65000000000n); h.scope.observeFailure(later, "original-writer-state");
      h.scope.rememberFailure(h.c, later);
    });
    const d = h.scope.consumeFailureDiagnostics(later), first = d.firstObservedFailure;
    assert.equal(first.elapsedNs, "64000000000"); assert.equal(d.capturedElapsedNs, "65000000000");
    assert.equal(first.point, "original-writer-usage");
    assert.equal(first.errors[0].reason, primary.message);
    assert.equal(first.errors[0].frames[0].file, "local-unit-diagnostic-scope.js");
    assert.equal(first.errors[0].frames[0].line, 36);
    assert(Object.isFrozen(first)); assert(Object.isFrozen(first.errors));
    assert(!JSON.stringify(d).includes(secret)); assert(!JSON.stringify(d).includes("/workspace/"));
    assert.equal(h.scope.consumeFailureDiagnostics(later), null);
  });
  await test("unknown text and code prefixes, arbitrary stack paths and accessors cannot leak", async () => {
    const h = forensicScope(), failure = Error(secret); let getters = 0;
    Object.defineProperties(failure, { message: { get() { getters++; throw Error(secret); } },
      code: { get() { getters++; throw Error(secret); } }, cause: { get() { getters++; throw Error(secret); } },
      stack: { get() { getters++; throw Error(secret); } } });
    h.scope.run(h.c, () => h.scope.observeFailure(failure, "original-writer-usage"));
    assert.equal(getters, 0); assert.equal(h.c.firstObservedFailure.errors[0].reason, null);
    assert.equal(h.c.firstObservedFailure.errors[0].code, null);
    assert.equal(h.c.firstObservedFailure.errors[0].frames.length, 0);
    assert(!JSON.stringify(h.c.firstObservedFailure).includes(secret));
    const other = forensicScope(), prefixed = Error("local-unit-diagnostic-" + secret); prefixed.code = "AUTH_" + secret;
    other.scope.run(other.c, () => other.scope.observeFailure(prefixed, "scope-await"));
    assert.equal(other.c.firstObservedFailure.errors[0].reason, null); assert.equal(other.c.firstObservedFailure.errors[0].code, null);
  });
  await test("capture requires a native error, active context and fixed observation point", async () => {
    const h = forensicScope(), failure = Error("LLM_USAGE_NOT_CONFIRMED");
    h.scope.observeFailure(failure, "scope-await"); assert.equal(h.c.firstObservedFailure, undefined);
    h.scope.run(h.c, () => {
      h.scope.observeFailure(failure, secret); h.scope.observeFailure({ message: secret }, "scope-await");
      h.scope.observeFailure(new Proxy(failure, { get() { throw Error(secret); } }), "scope-await");
    });
    assert.equal(h.c.firstObservedFailure, undefined);
  });
  await test("cause cycles and stack volume remain bounded without a raw fallback", async () => {
    const h = forensicScope(), first = Error(secret); let value = first;
    for (let i = 0; i < 7; i++) { value.cause = Error(secret); value.stack = secret.repeat(2000); value = value.cause; }
    value.cause = first;
    h.scope.run(h.c, () => h.scope.observeFailure(first, "scope-await"));
    const bytes = JSON.stringify(h.c.firstObservedFailure);
    assert.equal(h.c.firstObservedFailure.errors.length, 4); assert(bytes.length <= 2048);
    assert(!bytes.includes(secret)); assert(/^[\x00-\x7f]*$/.test(bytes));
  });
  await test("unknown fingerprints use bounded own UTF-8 text and maximum detail preserves the first observation", async () => {
    const h = forensicScope(), first = Error(secret + "ä"); let value = first;
    const stack = "Error: " + secret + "\n" + Array(3).fill("    at f (/workspace/synthetic/lib/helmut/local-unit-diagnostic-original-writer.js:999999:999999)").join("\n");
    for (let i = 0; i < 4; i++) {
      value.code = "AUTH_STORE_CONFLICT"; Object.defineProperty(value, "stack", { value: stack, configurable: true });
      if (i < 3) { value.cause = Error(secret + i); value = value.cause; }
    }
    h.c.controls = Array.from({ length: 16 }, (_, index) => ({ index, stage: A.CONTROL_STAGES[index],
      startedAtUTC: h.c.authorization.startedAtUTC, completedAtUTC: h.c.authorization.confirmedAtUTC,
      startedElapsedNs: "10000000000000000000", completedElapsedNs: "10000000000000000001" }));
    h.scope.run(h.c, () => { h.scope.observeFailure(first, "original-writer-usage"); h.scope.rememberFailure(h.c, first); });
    const d = h.scope.consumeFailureDiagnostics(first), captured = d.firstObservedFailure;
    assert.equal(captured.point, "original-writer-usage"); assert.equal(captured.errors.length, 4);
    assert.equal(captured.errors[0].code, "AUTH_STORE_CONFLICT");
    assert.equal(captured.errors[0].messageSHA256, require("node:crypto").createHash("sha256").update(secret + "ä", "utf8").digest("hex"));
    assert(JSON.stringify(captured).length <= 2048); assert(Buffer.byteLength(JSON.stringify(d)) <= 8192);
    assert(!JSON.stringify(d).includes(secret));
    const oversized = forensicScope();
    oversized.scope.run(oversized.c, () => oversized.scope.observeFailure(Error(secret.repeat(1000)), "scope-await"));
    assert.equal(oversized.c.firstObservedFailure.errors[0].messageSHA256, undefined);
  });
  await test("scope awaits rethrow the identical error and never repeat work", async () => {
    const h = forensicScope(), failure = Error("LLM_USAGE_NOT_CONFIRMED"); let calls = 0;
    await h.scope.run(h.c, () => assert.rejects(h.scope.timingTrace(0n).wait("state", () => { calls++; throw failure; }), error => error === failure));
    assert.equal(calls, 1); assert.equal(h.c.firstObservedFailure.point, "scope-await");
  });
  await test("both writer modes observe before rethrow and failed diagnostics cannot replace errors", async () => {
    for (const [method, point] of [["mutateState", "original-writer-state"], ["appendUsage", "original-writer-usage"]]) {
      let observed, calls = 0;
      const writer = earlyWriter((error, where) => { calls++; observed = error; assert.equal(where, point); });
      await assert.rejects(writer[method]({}), error => error === observed && /closed-api/.test(error.message));
      assert.equal(calls, 1);
      const broken = earlyWriter(() => { throw Error(secret); });
      await assert.rejects(broken[method]({}), error => /local-unit-original-writer-closed-api/.test(error.message) && !error.message.includes(secret));
    }
  });
  await test("one operation per await, identical return, fixed private phases and unchanged clock guards", async () => {
    const output = sink(), observed = harness(output), inert = harness(undefined), ack = Object.freeze({ private: secret });
    const work = async s => { await s.checkControl("unit-enter"); return s.mutateState(() => ack); };
    assert.equal(await observed.run(work), ack); assert.equal(await inert.run(work), ack);
    assert.deepEqual(observed.calls, inert.calls);
    assert.deepEqual(observed.calls, ["authority", "source", "transport", "runtime", "cas", "state", "runtime", "original-control", "inputs", "profile", "state", "cas"]);
    const logged = rows(output), group = logged.filter(row => row[2] === 0 && row[3] === "unit-enter");
    assert.deepEqual(group.map(row => row.slice(0, 2)), ["runtime", "control-bundle"].flatMap(name => [[name, 0], [name, 1]]));
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
