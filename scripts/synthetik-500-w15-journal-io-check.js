"use strict";
// One bounded local file-I/O comparison. Historical C events are inert payloads.
// No HTTP, database, Auth operation, profile, model, clock change or retry.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const assert = require("node:assert/strict"), { fork } = require("node:child_process");
const { performance } = require("node:perf_hooks");
const Durable = require("./fixtures/w15-durable-observations"), Auth = require("./fixtures/w15-auth-measurement-report");
const ROOT = path.resolve(__dirname, ".."), WORK = "/workspace/shared/helmut-w15-journal-io-check-20261028b";
const SOURCE = "/workspace/shared/helmut-w15-memory-atomic-20261028c/state/run-observations.SAFE.jsonl";
const REVIEW = "/workspace/shared/helmut-w15-atomic-integration-source-20261028/JOURNAL_DRAIN_PRESTART_REVIEW.SAFE.json";
const PREVIOUS = "/workspace/shared/helmut-w15-journal-io-check-20261028a/RESULT.SAFE.json";
const hash = b => crypto.createHash("sha256").update(b).digest("hex");
// Small final receipts only. Do not report them before native durable completion.
function save(p, x) {
  const fd = fs.openSync(p, "wx", 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(x, null, 2) + "\n");fs.fdatasyncSync(fd); }
  finally { fs.closeSync(fd); }
}
function source() {
  const s = fs.lstatSync(SOURCE); assert(s.isFile() && !s.isSymbolicLink() && (s.mode & 0o777) === 0o600);
  const bytes = fs.readFileSync(SOURCE); assert(bytes.length < 8 * 1024 * 1024);
  const events = bytes.toString("utf8").trim().split("\n").map(s => JSON.parse(s));
  assert.equal(events.length, 10820); assert(events.every((e, i) => e.sequence === i));
  return { events, pin: { bytes: bytes.length, sha256: hash(bytes) } };
}
function directory(name) {
  assert(["sync", "async", "drain"].includes(name)); return path.join(WORK, name);
}
function pulse() {
  let last = performance.now(), maximumGapMs = 0, ticks = 0;
  const timer = setInterval(() => { const now = performance.now(); maximumGapMs = Math.max(maximumGapMs, now - last);last = now;ticks++; }, 10);
  return { snapshot: () => ({ ticks, maximumGapMs: Math.max(maximumGapMs, performance.now() - last) }), stop: () => clearInterval(timer) };
}
async function child(mode) {
  const state = directory(mode), s = fs.lstatSync(state); assert(s.isDirectory() && !s.isSymbolicLink() && (s.mode & 0o777) === 0o700);
  const original = source(), io = [], beat = pulse(); let journal, removeSignal = () => {};
  const begin = performance.now(); let enqueueMs, attempted = 0, aliveDeadline;
  if (mode === "sync") {
    const write = fs.writeFileSync, sync = fs.fdatasyncSync;
    fs.writeFileSync = function(...args) { const startMs = performance.now();try { return write.apply(this, args); }
      finally { io.push({ operation: "write", startMs, endMs: performance.now(), durationMs: performance.now() - startMs }); } };
    fs.fdatasyncSync = function(...args) { const startMs = performance.now();try { return sync.apply(this, args); }
      finally { io.push({ operation: "fdatasync", startMs, endMs: performance.now(), durationMs: performance.now() - startMs }); } };
    journal = Durable.open(state, "prepare");
    await new Promise(resolve => setTimeout(resolve, 20));
    for (const event of original.events) { journal.write("retained-c-observation", { sourceSequence: event.sequence, observation: event }); attempted++; }
    enqueueMs = performance.now() - begin;
    await new Promise(resolve => setTimeout(resolve, 20));
    fs.writeFileSync = write; fs.fdatasyncSync = sync;
  } else {
    journal = Durable.openAsync(state, "prepare", { flushDeadlineMs: mode === "drain" ? 15000 : 180000, onIO: span => io.push(span) });
    if (mode === "drain") removeSignal = Auth.retainOnTermination(() => ({ testOnly: true, attempted, successfulAuthOperations: 0,
      unfinishedOperations: "UNKNOWN", io: journal.snapshot() }), async snapshot => {
      journal.write("controlled-termination", snapshot); await journal.close();
      clearTimeout(aliveDeadline);beat.stop(); save(path.join(state, "DRAIN.SAFE.json"), { status: "PASS_CONTROLLED_DURABLE_DRAIN_NO_AUTH", attempted,
        journal: journal.snapshot(), observedSignal: snapshot.terminationSignal, unfinishedOperations: "UNKNOWN" });
    });
    else removeSignal = Auth.retainOnTermination(() => ({ testOnly: true, attempted, unfinishedOperations: "UNKNOWN" }), async snapshot => {
      journal.write("unexpected-termination", snapshot);await journal.close();
      save(path.join(state, "ABORT.SAFE.json"), snapshot);
    });
    await journal.ready(); await new Promise(resolve => setTimeout(resolve, 20));
    for (const event of original.events) {
      if (mode === "drain" && attempted > 0 && (attempted === original.events.length - 64
        || attempted < original.events.length - 64 && attempted % 64 === 0)) await journal.flush();
      journal.write("retained-c-observation", { sourceSequence: event.sequence, observation: event }); attempted++;
    }
    enqueueMs = performance.now() - begin;
    if (mode === "drain") {
      process.send({ type: "drain-ready", attempted, journal: journal.snapshot() });
      // The referenced pulse timer already keeps the child alive. Retain an
      // additional explicit bound until the parent's one owned SIGTERM.
      aliveDeadline = setTimeout(() => { console.error("journal-io-owned-signal-not-received");process.exit(1); }, 200000);
      await new Promise(() => {}); return;
    }
    await journal.close(); await new Promise(resolve => setTimeout(resolve, 20));
  }
  const result = { status: "PASS_RETAINED_ALL_EVENTS", mode, attempted, sourcePin: original.pin, enqueueMs,
    totalWallMs: performance.now() - begin, producerEventloop: beat.snapshot(), journal: journal.snapshot?.() || null,
    IO: io, HTTP: 0, databaseWrites: 0, profilesActivated: 0, AuthCalls: 0, modelCalls: 0 };
  beat.stop();removeSignal();save(path.join(state, "RESULT.SAFE.json"), result);
  process.send({ type: "complete", mode, attempted });
}
async function runChild(mode) {
  const state = directory(mode);fs.mkdirSync(state, { mode: 0o700 });
  const stdout = fs.openSync(path.join(state, "child.PRIVATE.log"), "wx", 0o600), beat = pulse();
  let termAccepted = false, termRequests = 0, exit, parentHeartbeat, protocolError = null, deadlineKillAccepted = null, drainReadiness = null;
  const c = fork(__filename, ["--child", mode], { cwd: ROOT, execPath: process.execPath,
    execArgv: ["--require", path.join(__dirname, "lokaler-netzschutz.js")],
    env: { PATH: process.env.PATH, LANG: "C.UTF-8", HELMUT_SOURCE_MODE: "off", HELMUT_STORAGE_BACKEND: "local" },
    stdio: ["ignore", stdout, stdout, "ipc"] });
  c.on("message", m => {
    try {
      assert(m && ["drain-ready", "complete"].includes(m.type), "journal-io-invalid-ipc");
      if (m.type === "drain-ready") {
        assert(mode === "drain" && m.attempted === 10820 && termRequests === 0, "journal-io-invalid-drain-ready");
        assert.equal(m.journal.pendingEntries, 64);assert.equal(m.journal.nextSequence, 10821);
        assert.equal(m.journal.acknowledgedSequence, 10756);drainReadiness = m.journal;
        termRequests++;termAccepted = c.kill("SIGTERM");
      } else assert(mode !== "drain" && m.mode === mode && m.attempted === 10820, "journal-io-invalid-completion");
    } catch(e) {
      protocolError ||= Auth.failureMetadata(e);
      if (!exit && termRequests === 0) { termRequests++;termAccepted = c.kill("SIGTERM"); }
    }
  });
  const timeout = setTimeout(() => { // Bound one failed child, never start another mode.
    if (!exit) { deadlineKillAccepted = c.kill("SIGKILL"); }
  }, 210000);
  try { exit = await new Promise((resolve, reject) => { c.once("error", reject);c.once("exit", (code, signal) => resolve({ code, signal })); }); }
  finally {
    clearTimeout(timeout);parentHeartbeat = beat.snapshot();beat.stop();fs.fdatasyncSync(stdout);fs.closeSync(stdout);
    save(path.join(state, "CHILD_EXIT.SAFE.json"), { mode, childPID: c.pid || null, exit: exit || null, termRequests, termAccepted,
      deadlineKillAccepted, drainReadiness, protocolError, independentParentHeartbeat: parentHeartbeat });
  }
  assert(!protocolError, "journal-io-invalid-ipc-stopped");
  assert(mode === "drain" ? termRequests === 1 && termAccepted && exit.code === 143 && exit.signal === null : exit.code === 0 && exit.signal === null,
    "journal-io-child-failed-or-unknown");
  const result = JSON.parse(fs.readFileSync(path.join(state, mode === "drain" ? "DRAIN.SAFE.json" : "RESULT.SAFE.json")));
  const lines = fs.readFileSync(path.join(state, "prepare-observations.SAFE.jsonl"), "utf8").trim().split("\n").map(s => JSON.parse(s));
  const expected = source().events, copied = lines.filter(x => x.name === "retained-c-observation");
  assert.equal(copied.length, expected.length);assert(lines.every((x, i) => x.sequence === i));
  for (let i = 0; i < expected.length; i++) { assert.equal(copied[i].sourceSequence, i);assert.deepEqual(copied[i].observation, expected[i]); }
  assert.equal(lines.length, expected.length + (mode === "drain" ? 2 : 1));
  if (mode !== "sync") {
    assert.equal(result.journal.closed, true);assert.equal(result.journal.pendingEntries, 0);
    assert.equal(result.journal.completedSyncs, lines.length);
    assert.equal(result.journal.acknowledgedSequence, lines.length - 1);
    assert.equal(result.journal.status, "DURABLE_ACKNOWLEDGED");
  }
  if (mode === "drain") { assert.equal(result.status, "PASS_CONTROLLED_DURABLE_DRAIN_NO_AUTH");assert.equal(result.observedSignal, "SIGTERM"); }
  return { mode, exit, termRequests, termAccepted, drainReadiness, retainedEvents: copied.length, completeRows: lines.length,
    exactPayloadSHA256: hash(Buffer.from(JSON.stringify(copied.map(x => x.observation)))),
    independentParentHeartbeat: parentHeartbeat, result };
}
async function faults() {
  const result = [], base = path.join(WORK, "faults");fs.mkdirSync(base, { mode: 0o700 });
  const passed = entry => { save(path.join(base, `${result.length + 1}.SAFE.json`), entry);result.push(entry); };
  const create = name => { const p = path.join(base, name);fs.mkdirSync(p, { mode: 0o700 });return p; };
  const state = create("snapshot-partial"), originalWrite = fs.write;
  // Genuine partial native writes to this new file, with every byte retained.
  fs.write = function(fd, bytes, offset, length, position, callback) {
    return originalWrite.call(this, fd, bytes, offset, Math.min(length, 31), position, callback);
  };
  try {
    const j = Durable.openAsync(state, "prepare"), row = { value: "before" };
    j.write("snapshot", { row });row.value = "after";await j.close();
    const lines = fs.readFileSync(path.join(state, "prepare-observations.SAFE.jsonl"), "utf8").trim().split("\n").map(s => JSON.parse(s));
    assert.equal(lines.length, 2);assert.equal(lines[1].row.value, "before");assert.equal(j.snapshot().completedSyncs, 2);
    passed({ case: "captured-snapshot-and-real-partial-writes", status: "PASS", exactRows: 2 });
  } finally { fs.write = originalWrite; }
  const originalSync = fs.fdatasync;
  fs.fdatasync = function(fd, callback) { setImmediate(() => callback(Object.assign(Error("injected-test-only"), { code: "EIO" }))); };
  try {
    const j = Durable.openAsync(create("sync-error"), "prepare");
    await assert.rejects(j.flush(), { code: "W15_DURABLE_SYNC_FAILED" });
    await assert.rejects(j.close(), { code: "W15_DURABLE_SYNC_FAILED" });
    assert.equal(j.snapshot().acknowledgedSequence, -1);assert.equal(j.snapshot().status, "FAIL_OR_UNKNOWN");
    passed({ case: "injected-sync-error-no-ack", status: "PASS", expectedFailure: "W15_DURABLE_SYNC_FAILED" });
  } finally { fs.fdatasync = originalSync; }
  let release, ready, observedFD, closeCalls = 0;
  const pending = new Promise(resolve => { ready = resolve; }), originalClose = fs.close;
  fs.fdatasync = function(fd, callback) { observedFD = fd;release = () => new Promise(resolve => originalSync(fd, error => { callback(error);resolve(); }));ready(); };
  fs.close = function(...args) { if (args[0] === observedFD) closeCalls++;return originalClose.apply(this, args); };
  try {
    const j = Durable.openAsync(create("pending-deadline"), "prepare", { flushDeadlineMs: 50 });await pending;
    await assert.rejects(j.flush(25), { code: "W15_DURABLE_DEADLINE" });
    await assert.rejects(j.close(), { code: "W15_DURABLE_DEADLINE" });
    assert.equal(closeCalls, 0);assert.equal(j.snapshot().descriptorRetainedOpen, true);
    let lateIOTimer;
    try { await Promise.race([release(), new Promise((_, reject) => {
      lateIOTimer = setTimeout(() => reject(Error("journal-io-late-callback-deadline")), 15000);
    })]); } finally { clearTimeout(lateIOTimer); }
    assert.equal(j.snapshot().acknowledgedSequence, -1);assert.equal(j.snapshot().status, "FAIL_OR_UNKNOWN");
    assert.throws(() => j.write("late", {}), { code: "W15_DURABLE_DEADLINE" });
    passed({ case: "injected-pending-deadline-late-io-no-fd-reuse-or-ack", status: "PASS", expectedFailure: "W15_DURABLE_DEADLINE", closeCalls });
  } finally { fs.fdatasync = originalSync;fs.close = originalClose; }
  {
    const j = Durable.openAsync(create("overflow"), "prepare");await j.flush();
    assert.throws(() => j.write("overflow", { value: "x".repeat(8 * 1024 * 1024) }), { code: "W15_DURABLE_QUEUE_OVERFLOW" });
    await assert.rejects(j.close(), { code: "W15_DURABLE_QUEUE_OVERFLOW" });
    assert.equal(j.snapshot().acknowledgedSequence, 0);
    passed({ case: "injected-queue-overflow-no-extra-ack", status: "PASS", expectedFailure: "W15_DURABLE_QUEUE_OVERFLOW" });
  }
  return result;
}
async function main(dry) {
  assert(require.cache[require.resolve("./lokaler-netzschutz")]);assert.deepEqual(require("./lokaler-netzschutz").pruefe(process.env), []);
  const input = source();
  if (dry) { console.log(JSON.stringify({ status: "PASS_ARGUMENTS_AND_RETAINED_FILE_ONLY", sourcePin: input.pin,
    expectedEvents: input.events.length, childStarts: 0, HTTP: 0, databaseWrites: 0 }));return; }
  assert(!fs.existsSync(WORK), "journal-io-once-only");
  // Reuse the exact successful comparison without running sync/async again.
  const previousBytes = fs.readFileSync(PREVIOUS);
  assert.equal(hash(previousBytes), "b5e37a1e42bc3d677bc45080c81bea40300266d031410e5173a2596af4b5e470");
  const previous = JSON.parse(previousBytes);assert.deepEqual(previous.sourcePin, input.pin);
  assert.equal(previous.status, "FAIL_OR_UNKNOWN");assert.equal(previous.failedMode, "drain");
  assert.deepEqual(previous.modes.map(x => x.mode), ["sync", "async"]);
  for (const m of previous.modes) {
    assert.equal(m.result.status, "PASS_RETAINED_ALL_EVENTS");assert.equal(m.retainedEvents, 10820);
    assert.deepEqual(m.exit, { code: 0, signal: null });
    assert.equal(m.exactPayloadSHA256, "5aa7c19291b111d34edc815538194d43137760df258e50752a85720c41000a28");
  }
  const inheritedComparison = { source: PREVIOUS, sha256: hash(previousBytes), modes: ["sync", "async"],
    retainedEventsEach: 10820, historicalOverallStatus: previous.status, rerun: false };
  const review = JSON.parse(fs.readFileSync(REVIEW));assert.equal(review.status, "PASS_BOUNDED_JOURNAL_DRAIN_PRESTART");
  assert.deepEqual(review.sourcePin, input.pin);
  for (const p of review.sourcePins) { const b = fs.readFileSync(path.join(ROOT, p.path));assert.equal(b.length, p.bytes);assert.equal(hash(b), p.sha256); }
  fs.mkdirSync(WORK, { mode: 0o700 }); const results = [];let error, failedMode = null, faultResults;
  try {
    for (const mode of ["drain"]) { failedMode = mode;results.push(await runChild(mode));console.log(JSON.stringify({ stage: mode, status: "PASS", retainedEvents: results.at(-1).retainedEvents })); }
    assert.equal(results[0].exactPayloadSHA256, previous.modes[0].exactPayloadSHA256);
    failedMode = "bounded-expected-faults";faultResults = await faults();
  } catch(e) { error = { ...Auth.failureMetadata(e), reason: /^journal-io-[a-z-]{1,120}$/.test(e.message) ? e.message : "closed-assertion-or-io-failure" }; }
  save(path.join(WORK, "RESULT.SAFE.json"), { status: error ? "FAIL_OR_UNKNOWN" : "PASS_EXACT_DURABLE_NONBLOCKING_JOURNAL_AND_CONTROLLED_DRAIN",
    sourcePin: input.pin, originalEvents: input.events.length, inheritedComparison, modes: results, faultResults, error, failedMode: error ? failedMode : null, retryAllowed: false,
    historicalCCause: "UNCHANGED_UNKNOWN", HTTP: 0, databaseWrites: 0, AuthCalls: 0, profileActivations: 0, modelCalls: 0,
    scope: "Real bounded file-I/O and controlled owned-child stop only; not RAM/End500/Auth acceptance." });
  console.log(JSON.stringify({ status: error ? "FAIL_OR_UNKNOWN" : "PASS", error }));if (error) process.exitCode = 1;
}
const args = process.argv.slice(2);
assert(args.length === 1 && ["--dry-run", "--run"].includes(args[0]) || args.length === 2 && args[0] === "--child" && ["sync", "async", "drain"].includes(args[1]));
Promise.resolve().then(() => args[0] === "--child" ? child(args[1]) : main(args[0] === "--dry-run")).catch(e => {
  console.error(JSON.stringify({ status: "FAIL_OR_UNKNOWN", error: Auth.failureMetadata(e) }));
  if (args[0] === "--child") process.exit(1);
  process.exitCode = 1;
});
