"use strict";

// Pure counter acceptance tests. Never call start(), a database, or a child.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { functionProfileDelta } = require("./local-unit-native-function-profile");
const CAS = "public.helmut_auth_state_cas_v1(jsonb)";
const ROOT = "public.helmut_auth_state_assert_graph_local_v1(text, text, text)";
const MISSING = "public.synthetic_untracked(text)";
const row = (label, calls, totalMs = null, selfMs = null) =>
  ({ label, sourceEqual: true, calls, totalMs, selfMs });
const snapshot = rows => ({ schema: "helmut-write-function-stats-snapshot/1",
  databaseOID: "12345", statsReset: null, rows });
const before = () => snapshot([row(CAS, null), row(ROOT, 10, 100, 70), row(MISSING, null)]);
const after = () => snapshot([row(CAS, 4, 120, 20), row(ROOT, 16, 180, 110), row(MISSING, null)]);
let checks = 0;
function test(work) { work(); checks++; }
function reject(change, code) {
  test(() => { const b = before(), a = after(); change(b, a);
    assert.throws(() => functionProfileDelta(b, a), code); });
}
test(() => {
  const b = before(), a = after(), saved = JSON.stringify([b, a]);
  const result = functionProfileDelta(b, a);
  assert.deepEqual(result[0], { label: CAS, calls: 4, totalMs: 120, selfMs: 20, status: "OBSERVED" });
  assert.deepEqual(result[1], { label: ROOT, calls: 6, totalMs: 80, selfMs: 40, status: "OBSERVED" });
  assert.deepEqual(result[2], { label: MISSING, calls: null, totalMs: null,
    selfMs: null, status: "OPEN_NOT_TRACKED_OR_INLINED" });
  assert.equal(JSON.stringify([b, a]), saved, "inputs remain unchanged");
});
test(() => {
  const b = before(), a = after(); a.rows.reverse();
  assert.equal(functionProfileDelta(b, a).find(r => r.label === CAS).calls, 4);
});
test(() => {
  const b = before(), a = after(); b.rows[0] = row(CAS, 3, 10, 2); a.rows[0] = row(CAS, 7, 130, 22);
  assert.equal(functionProfileDelta(b, a)[0].calls, 4, "subtract genuine pre-existing counters");
});
test(() => {
  const b = before(), a = after(); a.rows[1] = { ...b.rows[1] };
  assert.deepEqual(functionProfileDelta(b, a)[1], { label: ROOT, calls: null,
    totalMs: null, selfMs: null, status: "OPEN_NO_OBSERVED_CALL" });
});
reject((b, a) => { a.databaseOID = "54321"; }, /no-reset-or-replacement/);
reject((b, a) => { a.statsReset = "synthetic reset"; }, /no-reset-or-replacement/);
reject((b, a) => { a.databaseOID = "not-an-oid"; }, /snapshot-shape/);
reject((b, a) => { a.schema = "other"; }, /snapshot-shape/);
reject((b, a) => { a.rows = []; }, /snapshot-shape/);
reject((b, a) => { a.rows = Array.from({ length: 257 }, (_, n) => row("f" + n, null)); }, /snapshot-shape/);
reject((b, a) => { a.rows.pop(); }, /stats-label/);
reject((b, a) => { a.rows[2].label = "public.unexpected()"; }, /stats-label/);
reject((b, a) => { a.rows[2].label = ROOT; }, /snapshot-row/);
reject((b, a) => { a.rows[0].label = "line\nbreak"; }, /snapshot-row/);
reject((b, a) => { a.rows[0].sourceEqual = false; }, /snapshot-row/);
reject((b, a) => { a.rows[0].extra = true; }, /snapshot-row/);
reject((b, a) => { a.rows[0].calls = null; }, /stats-shape/);
reject((b, a) => { a.rows[0].totalMs = null; }, /stats-shape/);
for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, "4", true])
  reject((b, a) => { a.rows[0].calls = value; }, /stats-shape/);
for (const field of ["totalMs", "selfMs"])
  for (const value of [-1, NaN, Infinity, "1"])
    reject((b, a) => { a.rows[0][field] = value; }, /stats-shape/);
reject((b, a) => { a.rows[1] = row(ROOT, null); }, /counter-disappeared/);
reject((b, a) => { a.rows[1].calls = 9; }, /counter-regression/);
reject((b, a) => { a.rows[1].totalMs = 99; }, /counter-regression/);
reject((b, a) => { a.rows[1].selfMs = 69; }, /counter-regression/);
for (const calls of [0, 3, 5])
  reject((b, a) => { a.rows[0].calls = calls; }, /original-cas-not-observed/);
reject((b, a) => { b.rows.shift(); a.rows.shift(); }, /original-cas-not-observed/);
reject((b, a) => { b.rows[0].label = a.rows[0].label = "public.helmut_auth_state_cas_v1(text)"; },
  /original-cas-not-observed/);
test(() => assert.throws(() => functionProfileDelta(null, after()), /snapshot-shape/));

// Run the actual publisher against a wholly in-memory filesystem. No /bench access.
const source = fs.readFileSync(path.join(__dirname, "local-unit-native-function-profile.js"), "utf8");
const publisher = source.slice(source.indexOf("function publish(name, bytes) {"),
  source.indexOf("\nfunction errorMatches", source.indexOf("function publish(name, bytes) {")));
function publication({ exists = false, short = false } = {}) {
  const calls = [], content = Buffer.from("synthetic");
  const fake = {
    constants: fs.constants,
    openSync(name, flags, mode) {
      calls.push(["open", name, flags, mode]);
      if (name === "/bench") return 2;
      assert.ok(flags & fs.constants.O_EXCL);
      assert.ok(flags & fs.constants.O_NOFOLLOW);
      assert.equal(mode, 0o600);
      if (exists) throw Object.assign(Error("synthetic exclusive collision"), { code: "EEXIST" });
      return 1;
    },
    writeSync(fd, bytes) { calls.push(["write", fd]); return bytes.length - (short ? 1 : 0); },
    fsyncSync(fd) { calls.push(["sync", fd]); },
    closeSync(fd) { calls.push(["close", fd]); }
  };
  const publish = vm.runInNewContext("(" + publisher + ")", { fs: fake, path, CAP: 4194304,
    need(ok, code) { if (!ok) throw Error(code); },
    readFile(name, options) {
      calls.push(["verify", name]); assert.equal(options.privateFile, true);
      return { pin: { path: name, bytes: content.length, sha256: "synthetic" } };
    } });
  return { publish, calls, content };
}
test(() => {
  const p = publication();
  assert.equal(p.publish("TRANSACTION_GUARD_FUNCTION_PROFILE.SAFE.json", p.content).path,
    "/bench/TRANSACTION_GUARD_FUNCTION_PROFILE.SAFE.json");
  assert.equal(p.calls.filter(c => c[0] === "open").length, 2);
  assert.deepEqual(p.calls.filter(c => c[0] === "sync").map(c => c[1]), [1, 2]);
});
for (const name of ["FUNCTION_PROFILE.SAFE.json", "../TRANSACTION_GUARD_FUNCTION_PROFILE.SAFE.json",
  "TRANSACTION_GUARD_PROFILE.txt", "/tmp/TRANSACTION_GUARD_PROFILE.SAFE.json"])
  test(() => { const p = publication(); assert.throws(() => p.publish(name, p.content), /output-name/);
    assert.equal(p.calls.length, 0); });
test(() => {
  const p = publication({ exists: true });
  assert.throws(() => p.publish("TRANSACTION_GUARD_FUNCTION_PROFILE.SAFE.json", p.content), /collision/);
  assert.equal(p.calls.length, 1, "no retry or fallback after exclusive-create collision");
});
test(() => {
  const p = publication({ short: true });
  assert.throws(() => p.publish("TRANSACTION_GUARD_FUNCTION_PROFILE.SAFE.json", p.content), /output-short-write/);
  assert.deepEqual(p.calls.map(c => c[0]), ["open", "write", "close"]);
});
console.log("PASS native function profile pure acceptance: " + checks);
