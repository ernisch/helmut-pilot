"use strict";
// New lifecycle wiring only: controlled promises are not Auth/storage/security proofs.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const assert = require("node:assert/strict"), { fork } = require("node:child_process");
const ROOT = path.resolve(__dirname, ".."), WORK = "/workspace/shared/helmut-w15-memory-lifecycle-check-20261028d";
const REVIEW = path.join(WORK, "REPORTS/LIFECYCLE_PRESTART_REVIEW_D.SAFE.json");
const FORWARD = "scripts/synthetik-500-w15-memory-forward.js";
const DURABLE = "scripts/fixtures/w15-durable-observations.js", AUTH = "scripts/fixtures/w15-auth-measurement-report.js";
const Durable = require("./fixtures/w15-durable-observations"), Auth = require("./fixtures/w15-auth-measurement-report");
const { observationLifetime } = require("./synthetik-500-w15-memory-forward");
const SCOPE = "CONTROLLED_LOCAL_LIFECYCLE_ONLY_NOT_AUTH_STORAGE_COST_OR_MEMORY_ACCEPTANCE";
const hash = b => crypto.createHash("sha256").update(b).digest("hex");
const read = p => JSON.parse(fs.readFileSync(p, "utf8"));
function save(p, value) {
  const fd = fs.openSync(p, "wx", 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value, null, 2) + "\n");fs.fdatasyncSync(fd); }
  finally { fs.closeSync(fd); }
}
function protectedPath(p, directory = false) {
  const s = fs.lstatSync(p);assert(!s.isSymbolicLink() && s.uid === process.getuid());
  assert(directory ? s.isDirectory() && (s.mode & 0o777) === 0o700 : s.isFile() && (s.mode & 0o777) === 0o600);
}
function prestart() {
  protectedPath(WORK, true);protectedPath(path.dirname(REVIEW), true);protectedPath(REVIEW);
  const review = read(REVIEW);assert.equal(review.status, "PASS_LIFECYCLE_PRESTART_REVIEW_D");
  assert(Array.isArray(review.sourcePins));const pins = new Map();
  for (const pin of review.sourcePins) {
    assert(typeof pin.path === "string" && !path.isAbsolute(pin.path));
    const filename = path.resolve(ROOT, pin.path);assert(filename.startsWith(ROOT + path.sep));
    assert(!pins.has(pin.path));const bytes = fs.readFileSync(filename);
    assert.equal(bytes.length, pin.bytes);assert.equal(hash(bytes), pin.sha256);pins.set(pin.path, pin);
  }
  for (const filename of [path.relative(ROOT, __filename), FORWARD, DURABLE, AUTH]) assert(pins.has(filename));
  return { path: REVIEW, sha256: hash(fs.readFileSync(REVIEW)), sourcePins: [...pins.values()] };
}
function deferred() { let resolve;const promise = new Promise(yes => { resolve = yes; });return { promise, resolve }; }
function failure(e) { return { code: e.code || null, reason: e.message === "w15-forward-stop-requested" ? e.message : "lifecycle-check-failed" }; }
async function child(mode) {
  assert(["read", "sent"].includes(mode));prestart();
  const state = path.join(WORK, mode);protectedPath(state, true);
  const journal = Durable.openAsync(state, "run"), gate = deferred();
  const counters = { loopStarts: 0, nativeCalls: 0, acceptedPostimages: 0, laterCalls: 0 };
  const pending = { id: 1, kind: "CONTROLLED_PROMISE_NOT_AUTH", beginMS: 10.25, acknowledged: false };
  let stoppedObservers = 0, operationFailure = null, task;
  const snapshot = () => ({ scope: SCOPE, mode, currentIndex: 0, pending, counters, operationFailure, stoppedObservers });
  const life = observationLifetime({ journal, snapshot, stopObservers: () => { stoppedObservers++; },
    persistAbort: (phase, value) => save(path.join(state, phase.toUpperCase() + ".SAFE.json"), value) });
  const deadline = setTimeout(() => { console.error("lifecycle-child-deadline");process.exit(1); }, 20000);
  Auth.retainOnTermination(life.signalSnapshot, async initial => {
    assert(life.isTerminating());assert.equal(initial.pending.acknowledged, false);
    gate.resolve(); // Settles only the controlled operation; never an actual API.
    await life.abort(initial);await task;
    assert.equal(initial.pending.acknowledged, false, "lifecycle-initial-snapshot-mutated");
    clearTimeout(deadline);
  });
  await journal.ready();await journal.write("controlled-pending", { scope: SCOPE, mode, pending, payload: "new-fixture-".repeat(32) });
  task = (async () => {
    for (let index = 0; index < 2; index++) {
      counters.loopStarts++;
      if (mode === "read") {
        await life.operation(async () => { await gate.promise;pending.readSettled = true;return "CONTROLLED_READ"; });
        life.ensureRunning();counters.nativeCalls++;
      } else {
        await life.operation(async () => {
          counters.nativeCalls++;await gate.promise;
          Object.assign(pending, { acknowledged: true, ackMS: 19.5, endMS: 20.75, wallMs: 10.5 });
          return "CONTROLLED_CAS_COMPLETION_NOT_STORAGE";
        });
      }
      life.ensureRunning();counters.acceptedPostimages++;
      await journal.write("unexpected-accepted-progress", { index });counters.laterCalls++;
    }
  })().catch(e => { operationFailure = failure(e); });
  process.send({ type: "ready", mode, pid: process.pid, identity: journal.identity,
    nativeCalls: counters.nativeCalls, pendingAcknowledged: pending.acknowledged });
  await task; // IPC/deadline keeps the process alive until the owned SIGTERM.
}
async function fileCases() {
  let state = { failureCode: "W15_DURABLE_WRITE_FAILED" }, external = false;
  const synthetic = observationLifetime({ journal: { snapshot: () => state }, snapshot: () => ({}),
    stopObservers: () => {}, persistAbort: () => {}, externalStop: () => external });
  assert.throws(() => synthetic.ensureRunning(), { code: "W15_DURABLE_WRITE_FAILED" });
  state = {};synthetic.ensureRunning();external = true;
  assert.throws(() => synthetic.ensureRunning(), { message: "w15-forward-stop-requested" });
  external = false;synthetic.stop();assert.throws(() => synthetic.ensureRunning(), { message: "w15-forward-stop-requested" });
  const statePath = path.join(WORK, "seal");fs.mkdirSync(statePath, { mode: 0o700 });
  const journal = Durable.openAsync(statePath, "run");let stops = 0, closes = 0;
  const close = journal.close;journal.close = () => { closes++;return close(); };
  const life = observationLifetime({ journal, snapshot: () => ({ scope: SCOPE }),
    stopObservers: () => { stops++; }, persistAbort: (phase, x) => save(path.join(statePath, phase + ".SAFE.json"), x) });
  const remove = Auth.retainOnTermination(life.signalSnapshot, life.abort);
  try {
    await journal.ready();journal.write("new-file-lifecycle", { scope: SCOPE, value: "two-real-durable-lines" });await journal.flush();
    const a = life.seal(), b = life.seal();assert.strictEqual(a, b);await a;
    assert.strictEqual(life.seal(), a);assert.equal(stops, 1);assert.equal(closes, 1);
    const lines = fs.readFileSync(path.join(statePath, "run-observations.SAFE.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(lines.length, 2);assert.equal(journal.snapshot().completedSyncs, 2);
    assert.equal(journal.snapshot().closed, true);assert.equal(journal.snapshot().pendingEntries, 0);
    return { status: "PASS_NEW_FILE_LIFECYCLE", stops, closes, lines: lines.length, journal: journal.snapshot() };
  } finally { remove(); }
}
async function runChild(mode) {
  const state = path.join(WORK, mode);fs.mkdirSync(state, { mode: 0o700 });
  const fd = fs.openSync(path.join(state, "child.PRIVATE.log"), "wx", 0o600);
  let c, exit, requests = 0, accepted = false, protocolError, forcedKill = null, timer, ready;
  try {
    c = fork(__filename, ["--child", mode], { cwd: ROOT, execPath: process.execPath,
      execArgv: ["--require", path.join(__dirname, "lokaler-netzschutz.js")],
      env: { PATH: process.env.PATH, LANG: "C.UTF-8", HELMUT_SOURCE_MODE: "off", HELMUT_STORAGE_BACKEND: "local" },
      stdio: ["ignore", fd, fd, "ipc"] });
    c.on("message", x => {
      try {
        assert.equal(requests, 0);assert.equal(x.type, "ready");assert.equal(x.mode, mode);
        assert.equal(x.pid, c.pid);assert.equal(x.identity.pid, c.pid);assert.equal(x.identity.phase, "run");
        assert.equal(x.pendingAcknowledged, false);assert.equal(x.nativeCalls, mode === "sent" ? 1 : 0);
        ready = x;requests++;accepted = c.kill("SIGTERM");assert.equal(accepted, true);
      } catch(e) { protocolError = failure(e);if (!exit) forcedKill = c.kill("SIGKILL"); }
    });
    timer = setTimeout(() => { if (!exit) forcedKill = c.kill("SIGKILL"); }, 30000);
    exit = await new Promise((resolve, reject) => { c.once("error", reject);c.once("exit", (code, signal) => resolve({ code, signal })); });
  } finally {
    clearTimeout(timer);fs.fdatasyncSync(fd);fs.closeSync(fd);
    save(path.join(state, "CHILD_EXIT.SAFE.json"), { mode, childPID: c?.pid || null, exit: exit || null,
      signalRequests: requests, signalAccepted: accepted, forcedKill, protocolError: protocolError || null, ready: ready || null });
  }
  assert(!protocolError && forcedKill === null);assert.equal(requests, 1);assert.equal(accepted, true);
  assert.deepEqual(exit, { code: 143, signal: null });
  const initial = read(path.join(state, "INITIAL.SAFE.json")), final = read(path.join(state, "FINAL.SAFE.json"));
  assert.equal(initial.terminationSignal, "SIGTERM");assert.equal(initial.status, "FAIL_OR_UNKNOWN");
  assert.equal(initial.unfinishedOperationOutcome, "UNKNOWN");assert.equal(initial.pending.acknowledged, false);
  assert.equal(final.pending.acknowledged, false);assert.equal(final.durableDrainFailure, null);
  const after = final.afterStopObservation;assert.equal(after.stoppedObservers, 1);
  assert.equal(after.counters.loopStarts, 1);assert.equal(after.counters.nativeCalls, mode === "sent" ? 1 : 0);
  assert.equal(after.counters.acceptedPostimages, 0);assert.equal(after.counters.laterCalls, 0);
  assert.deepEqual(after.operationFailure, { code: "ERR_ASSERTION", reason: "w15-forward-stop-requested" });
  const expected = { id: 1, kind: "CONTROLLED_PROMISE_NOT_AUTH", beginMS: 10.25, acknowledged: mode === "sent" };
  Object.assign(expected, mode === "sent" ? { ackMS: 19.5, endMS: 20.75, wallMs: 10.5 } : { readSettled: true });
  assert.deepEqual(after.pending, expected);assert.equal(final.journal.closed, true);assert.equal(final.journal.pendingEntries, 0);
  const lines = fs.readFileSync(path.join(state, "run-observations.SAFE.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  assert.deepEqual(lines.map(x => x.name), ["process-start", "controlled-pending", "termination-received"]);
  assert(lines.every((x, i) => x.sequence === i));assert.equal(final.journal.completedSyncs, 3);
  return { mode, status: "PASS_OWNED_SIGTERM_CONTROLLED_PROMISE_LIFECYCLE", exit, accepted, finalCounters: after.counters,
    preservedInitialUnknown: true, exactControlledFinalTiming: true, journal: final.journal };
}
async function main() {
  const review = prestart();assert(!fs.existsSync(path.join(WORK, "RESULT.SAFE.json")), "lifecycle-once-only");
  for (const name of ["seal", "read", "sent"]) assert(!fs.existsSync(path.join(WORK, name)), "lifecycle-case-already-started");
  const cases = [];let error;
  try { cases.push(await fileCases());for (const mode of ["read", "sent"]) cases.push(await runChild(mode)); }
  catch(e) { error = failure(e); }
  save(path.join(WORK, "RESULT.SAFE.json"), { status: error ? "FAIL_OR_UNKNOWN" : "PASS_NEW_OBSERVATION_LIFECYCLE_WIRING_ONLY",
    scope: SCOPE, prestartReview: review, cases, error: error || null, retryAllowed: false,
    historicalJournalReplay: false, IOFaultInjection: false, HTTP: 0, databaseCalls: 0, AuthCalls: 0,
    modelCalls: 0, profileActivations: 0, UnitCalls: 0, securityOrMemoryAcceptance: false });
  console.log(JSON.stringify({ status: error ? "FAIL_OR_UNKNOWN" : "PASS", cases: cases.length }));if (error) process.exitCode = 1;
}
if (require.main === module) Promise.resolve().then(() => {
  assert(require.cache[require.resolve("./lokaler-netzschutz")]);assert.deepEqual(require("./lokaler-netzschutz").pruefe(process.env), []);
  const args = process.argv.slice(2);assert(args.length === 1 && args[0] === "--run" || args.length === 2 && args[0] === "--child");
  return args[0] === "--child" ? child(args[1]) : main();
}).catch(e => { console.error(JSON.stringify({ status: "FAIL_OR_UNKNOWN", error: failure(e) }));
  if (process.argv[2] === "--child") process.exit(1);process.exitCode = 1; });
