"use strict";
// PRIVATE timing schema/flow tests only: actual writer, existing synthetic
// transition-fixture preparation, in-memory sink and injected monotonic clock.
// No native original reader/service, DB, HTTP, provider or execution claim.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const fixturePath = path.join(__dirname, "local-unit-diagnostic-original-writer-test.js");
const prefix = "HELMUT_OWN_WRITE_TIMING_V1 ";
const phases = ["performSettled", "readOwnAwait", "readWire", "writeOwnAwait", "nativeWriteHTTPawait"];
let preparation = fs.readFileSync(fixturePath, "utf8").split("async function check(name, action) {")[0];
function replaceOnce(from, to) { assert.equal(preparation.split(from).length, 2, "fixture seam must be unique"); preparation = preparation.replace(from, to); }
replaceOnce('process: { env }, Buffer, URL, Date', 'process: { env, stderr: __traceSink, hrtime: __traceClock }, Buffer, URL, Date, JSON: __traceJSON');
replaceOnce('events.push("original.read"); stats.reads++; return {};', 'events.push("original.read"); stats.reads++; if(options.readError) throw __traceError; return {};');
replaceOnce('legacyRead: async (...args) => { required(current, "normal-reader-scope"); return reader(...args); }',
  'legacyRead: (...args) => { required(current, "normal-reader-scope"); const pending=reader(...args); __traceReturns.readerPromise=pending; return pending; }');
replaceOnce('await args.request("/rest/v1/rpc/helmut_auth_state_graph_read_v1", { method: "POST", body: JSON.stringify({ id: "main-auth" }) });',
  'const pending=args.request("/rest/v1/rpc/helmut_auth_state_graph_read_v1", { method: "POST", body: JSON.stringify({ id: "main-auth" }) }); __traceReturns.requestPromise=pending; await pending;');
replaceOnce('stats.writes++; events.push("original.write");', 'stats.writes++; events.push("original.write"); if(options.writeCaptureError) throw __traceError;');
replaceOnce('if (options.endpointUnknown) throw Error("synthetic-endpoint-outcome-unknown");', 'if (options.endpointUnknown) throw __traceError;');
replaceOnce('return accepted;', '__traceReturns.accepted=accepted; return accepted;');
function sink(failure = "") {
  const out = { lines: [], calls: 0, subscriptions: 0, listener: null,
    on(name, listener) { out.subscriptions++; assert.equal(name, "error"); if (failure === "subscribe") throw Error("private-subscribe-error"); out.listener = listener; },
    write(line, callback) {
      out.calls++; out.lines.push(line);
      if (failure === "throw") throw Error("private-write-error");
      if (failure === "event") out.listener(Error("private-event-error"));
      callback(failure === "callback" ? Error("private-callback-error") : null);
      return failure !== "backpressure";
    } }; return out;
}
function fixture(output, options = {}, base = 1000n) {
  const returns = {}, error = Error("PRIVATE-DO-NOT-LOG-\u00e4-\ud83d\ude80"), holder = { exports: {} }; let ticks = 0;
  const clock = { bigint: () => { ticks++; return base + BigInt(ticks); } };
  const json = { stringify: JSON.stringify, parse(text) {
    const value = JSON.parse(text); if (value?.schema === "helmut-local-unit-original-write-result/1") returns.parsed = value; return value;
  } };
  vm.runInNewContext(preparation + "\nmodule.exports={setup};", { require, module: holder, __dirname,
    __traceSink: output, __traceClock: clock, __traceReturns: returns, __traceError: error, __traceJSON: json,
    Buffer, URL, Date, console }, { filename: fixturePath });
  const s = holder.exports.setup(options); return { ...s, returns, error, ticks: () => ticks };
}
function rows(output) {
  let previous = -1n;
  return output.lines.map(line => {
    assert.ok(/^[\x20-\x7e]+\n$/.test(line), "ASCII only"); assert.ok(line.startsWith(prefix));
    const row = JSON.parse(line.slice(prefix.length)); assert.equal(row.length, 6);
    assert.ok(Number.isSafeInteger(row[0]) && row[0] >= 0); assert.ok(["state", "usage"].includes(row[1]));
    assert.ok(phases.includes(row[2])); assert.ok([0, 1].includes(row[3])); assert.match(row[4], /^\d+$/);
    assert.match(row[5], /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    const ns = BigInt(row[4]); assert.ok(ns >= previous); previous = ns; return row;
  });
}
const expected = ["performSettled:0", "readOwnAwait:0", "readWire:0", "readWire:1", "readOwnAwait:1",
  "writeOwnAwait:0", "nativeWriteHTTPawait:0", "nativeWriteHTTPawait:1", "writeOwnAwait:1", "performSettled:1"];
let groups = 0;
async function check(name, run) { await run(); groups++; console.log("PASS " + name); }
(async () => {
  await check("inert import; fixed schema, exact await order, original Promise/return identity and monotonic operation index", async () => {
    for (const usage of [false, true]) {
      const out = sink(), s = fixture(out, { usage });
      assert.equal(out.calls, 0); assert.equal(out.subscriptions, 0); assert.equal(s.ticks(), 0);
      const invoke = () => usage ? s.writer.appendUsage(s.args()) : s.writer.mutateState(s.args());
      const result = await invoke(), trace = rows(out);
      assert.deepEqual(trace.map(r => r[2] + ":" + r[3]), expected);
      assert.ok(trace.every(r => r[0] === 0 && r[1] === (usage ? "usage" : "state")));
      assert.equal(s.returns.readerPromise, s.returns.requestPromise, "readWire returns the same Promise");
      assert.equal(usage ? result.receipt : result, usage ? s.returns.accepted.receipt : s.returns.parsed.ownAck);
      assert.deepEqual(Array.from(s.events), ["original.read", "original.write", "closed.request"]);
      assert.equal(out.subscriptions, 1);
      for (const privateValue of [s.selection.operationId, s.selection.commandHash, s.record.id, s.error.message])
        assert.equal(out.lines.join("").includes(privateValue), false);
      await assert.rejects(invoke());
      assert.deepEqual(rows(out).slice(10).map(r => [r[0], r[2], r[3]]), [[1, "performSettled", 0], [1, "performSettled", 1]]);
      assert.equal(s.stats.reads, 1); assert.equal(s.stats.requests, 1);
    }
  });
  await check("global128-event and16KiB bounds stop logging without changing attempted-call guards", async () => {
    for (const largeClock of [false, true]) {
      const out = sink(), s = fixture(out, {}, largeClock ? BigInt("1" + "0".repeat(500)) : 1000n);
      await s.writer.mutateState(s.args());
      for (let i = 0; i < 150; i++) await assert.rejects(s.writer.mutateState(s.args()));
      const trace = rows(out), bytes = Buffer.byteLength(out.lines.join(""));
      assert.ok(trace.length <= 128 && bytes <= 16384);
      if (largeClock) assert.ok(trace.length < 128 && bytes > 14000, "byte budget independently limits fixed ASCII rows");
      else assert.equal(trace.length, 128);
      assert.equal(out.subscriptions, 1); assert.equal(s.stats.reads, 1); assert.equal(s.stats.requests, 1);
      const calls = out.calls; await assert.rejects(s.writer.mutateState(s.args())); assert.equal(out.calls, calls);
    }
  });
  await check("sink throw/event/callback/backpressure disable only logging; exact failures settle and sent unknown remains no-retry", async () => {
    for (const failure of ["throw", "event", "callback", "backpressure", "subscribe"]) {
      const out = sink(failure), s = fixture(out); const ack = await s.writer.mutateState(s.args());
      assert.equal(ack, s.returns.parsed.ownAck); assert.equal(out.calls, failure === "subscribe" ? 0 : 1);
      await assert.rejects(s.writer.mutateState(s.args())); assert.equal(out.calls, failure === "subscribe" ? 0 : 1);
    }
    for (const at of ["readError", "writeCaptureError", "endpointUnknown"]) {
      const out = sink(), s = fixture(out, { [at]: true }); let actual;
      try { await s.writer.mutateState(s.args()); } catch (error) { actual = error; }
      assert.equal(actual, s.error, "failure identity survives every timing finally/observer");
      const trace = rows(out); assert.equal(trace.at(-1)[2], "performSettled"); assert.equal(trace.at(-1)[3], 1);
      for (const phase of phases) {
        const seen = trace.filter(r => r[2] === phase); if (seen.length) assert.deepEqual(seen.map(r => r[3]), [0, 1]);
      }
      assert.equal(trace.some(r => r[2] === "nativeWriteHTTPawait"), at === "endpointUnknown");
      const requests = s.stats.requests; await assert.rejects(s.writer.mutateState(s.args())); assert.equal(s.stats.requests, requests);
      if (at === "endpointUnknown") {
        const changed = s.args(); changed.before = { ...changed.before, revision: changed.before.revision + 1 };
        await assert.rejects(s.writer.mutateState(changed)); assert.equal(s.stats.requests, 1, "unknown native outcome seals later revision attempts too");
      }
      assert.equal(out.lines.join("").includes(s.error.message), false);
    }
  });
  console.log(JSON.stringify({ schema: "helmut-own-write-timing-pure/1", pass: true, groups, nativeCalls: 0,
    databaseCalls: 0, providerCalls: 0, unit60Qualified: false, optimizationClaimed: false }));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
