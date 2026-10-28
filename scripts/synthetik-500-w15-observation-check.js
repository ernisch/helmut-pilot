"use strict";

// Targeted telemetry check only: no database, HTTP, Auth, Unit or provider call.
// No execution on import. The real child/owned SIGTERM path runs once only.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const crypto = require("node:crypto"), { spawn } = require("node:child_process");
const Auth = require("./fixtures/w15-auth-measurement-report");
const Owned = require("./fixtures/w15-owned-process-stop");
const Durable = require("./fixtures/w15-durable-observations");
const ROOT = path.resolve(__dirname, ".."), BASE = "/tmp/w15-observation-check-20261028";
const WORK = "/workspace/shared/helmut-w15-observation-check-20261028";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function write(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 }); }
function privateDirectory(file) {
  const s = fs.lstatSync(file);
  assert(s.isDirectory() && !s.isSymbolicLink() && (s.mode & 0o777) === 0o700 && s.uid === process.getuid());
}
function pins() {
  return ["scripts/fixtures/w15-auth-measurement-report.js", "scripts/fixtures/w15-owned-process-stop.js",
    "scripts/fixtures/w15-durable-observations.js", "scripts/synthetik-500-w15-full500-controller.py",
    "scripts/synthetik-500-w15-observation-check.js"].map(file => {
    const full = path.join(ROOT, file), s = fs.lstatSync(full); assert(s.isFile() && !s.isSymbolicLink());
    const b = fs.readFileSync(full); return { path: file, bytes: b.length, sha256: crypto.createHash("sha256").update(b).digest("hex") };
  });
}
function pure() {
  const sentinel = "PRIVATE_SENTINEL_URL_BODY_KEY";
  const cases = [
    [{ name: "Error", message: `Supabase storage timed out after 100ms: ${sentinel}` }, { name: "Error", failureKind: "storage-timeout", timeoutMs: 100 }],
    [{ name: "Error", message: `Supabase storage failed (503): ${sentinel}` }, { name: "Error", failureKind: "storage-http-error", httpStatus: 503 }],
    [{ name: "Error", code: "ATOMIC_USAGE_READ_INVALID", message: sentinel }, { name: "Error", failureKind: "atomic-read-invalid" }],
    [{ name: "Error", code: "ERR_ASSERTION", message: sentinel }, { name: "Error", failureKind: "assertion" }],
    [{ name: "TypeError", cause: { code: "UND_ERR_SOCKET", socket: { bytesRead: 3, bytesWritten: 5, secret: sentinel } } },
      { name: "TypeError", causeCode: "UND_ERR_SOCKET", socket: { bytesRead: 3, bytesWritten: 5 }, failureKind: "transport-error" }],
    [{ name: "Error", message: `Supabase storage timed out after 20001ms: ${sentinel}` }, { name: "Error", failureKind: "unknown" }],
    [{ name: "Error", message: `Supabase storage timed out after 0ms: ${sentinel}` }, { name: "Error", failureKind: "unknown" }],
    [{ name: "Error", message: `Supabase storage failed (399): ${sentinel}` }, { name: "Error", failureKind: "unknown" }],
    [{ name: "AbortError", message: sentinel }, { name: "AbortError", failureKind: "aborted" }],
    [{ name: "Error", message: "Supabase request deadline exceeded" }, { name: "Error", failureKind: "storage-timeout" }],
    [{ name: "Error", message: `Supabase request deadline exceeded${sentinel}` }, { name: "Error", failureKind: "unknown" }],
    [null, { name: "Error", failureKind: "unknown" }],
  ];
  const bomb = {};
  for (const key of ["name", "code", "cause", "message"]) Object.defineProperty(bomb, key, { get() { throw Error(sentinel); } });
  cases.push([bomb, { name: "Error", failureKind: "unknown" }]);
  for (const [input, expected] of cases) {
    const actual = Auth.failureMetadata(input); assert.deepEqual(actual, expected);
    assert(!JSON.stringify(actual).includes(sentinel));
  }
  const stop = Owned.stopFailure(Object.assign(Error(sentinel), { code: "EPERM" }), "signal-term", 12);
  assert.deepEqual(stop, { status: "STOP_FAILURE", phase: "signal-term", reason: "owned-stop-unknown", code: "EPERM", pid: 12 });
  assert(!JSON.stringify(stop).includes(sentinel));
  return { cases: cases.length + 1, status: "PASS_CLOSED_ENUMS_GETTERS_AND_SENTINEL" };
}
function child() {
  privateDirectory(BASE); privateDirectory(`${BASE}/state`);
  const journal = Durable.open(`${BASE}/state`, "signal-proof");
  process.once("SIGTERM", () => { journal.write("controlled-stop", { signal: "SIGTERM" }); process.exit(0); });
  write(`${BASE}/state/signal-proof.pid`, process.pid); journal.ready();
  setTimeout(() => { journal.write("child-deadline", { status: "UNKNOWN" }); process.exit(1); }, 40000);
}
async function main(argv = process.argv.slice(2)) {
  if (argv[0] === "--owned-child") {
    assert(argv.length === 2 && argv[1] === BASE, "w15-observation-child-cli-invalid");
    return child();
  }
  assert(argv.length === 1 && ["--dry-run", "--run"].includes(argv[0]), "w15-observation-cli-invalid");
  const sourcePins = pins();
  assert(!fs.existsSync(BASE) && !fs.existsSync(WORK), "w15-observation-existing-target");
  if (argv[0] === "--dry-run") return { status: "PASS_ARGUMENTS_AND_FILES_ONLY", sourcePins, HTTP: 0, databaseCalls: 0, childStarts: 0 };
  assert(process.env.HELMUT_SOURCE_MODE === "off", "w15-observation-use-local-launcher");
  fs.mkdirSync(WORK, { mode: 0o700 }); fs.mkdirSync(BASE, { mode: 0o700 }); fs.mkdirSync(`${BASE}/state`, { mode: 0o700 });
  let worker, exit, exitPromise, childStartedAt, stopAttempted = false;
  const report = { status: "FAIL_OR_UNKNOWN", sourcePins, HTTP: 0, databaseCalls: 0, AuthCalls: 0, Units: 0,
    profileActivations: 0, providerCalls: 0, retries: 0, oldPostgrestStopRepeated: false };
  try {
    report.pure = pure();
    childStartedAt = Date.now();
    worker = spawn(process.execPath, [__filename, "--owned-child", BASE], { detached: true, stdio: ["ignore", "ignore", "pipe"], cwd: ROOT, env: process.env });
    // Never serialize arbitrary child stderr. Record only that bytes existed.
    let stderrBytes = 0; worker.stderr.on("data", chunk => { stderrBytes += chunk.length; });
    exitPromise = new Promise(resolve => {
      worker.once("error", error => resolve(exit = { spawnFailure: Auth.failureMetadata(error) }));
      worker.once("exit", (code, signal) => resolve(exit = { code, signal }));
    });
    const readyEnd = Date.now() + 5000;
    while (!fs.existsSync(`${BASE}/state/signal-proof.node.SAFE.json`) && !exit && Date.now() < readyEnd) await delay(25);
    assert(fs.existsSync(`${BASE}/state/signal-proof.node.SAFE.json`) && !exit, "w15-observation-child-not-ready");
    const identity = JSON.parse(fs.readFileSync(`${BASE}/state/signal-proof.node.SAFE.json`));
    assert.equal(identity.pid, worker.pid); assert.equal(identity.startTicks, Durable.startTicks(worker.pid));
    // Genuine negative ownership case: the current CLI process is deliberately
    // unowned. The unchanged helper must reject it before attempting any signal.
    assert(!fs.readFileSync("/proc/self/cmdline", "utf8").includes(BASE));
    write(`${BASE}/state/gateway.pid`, process.pid);
    let rejected;
    try { await Owned.stop(BASE, "gateway", "helmut_w15_observation_check"); }
    catch (error) { rejected = error.stopFailure; }
    assert.equal(rejected?.status, "STOP_FAILURE"); assert.equal(rejected.phase, "proc-ownership");
    assert.equal(rejected.reason, "unowned-live-process"); assert.equal(rejected.code, "ERR_ASSERTION");
    const negativeReceipts = fs.readFileSync(`${BASE}/state/stop-gateway.SAFE.jsonl`, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(negativeReceipts.length, 1); assert.deepEqual(negativeReceipts[0], {
      atUTC: negativeReceipts[0].atUTC, action: "gateway", ...rejected });
    assert(!negativeReceipts.some(r => r.status === "SIGNAL_REQUEST_ACCEPTED"));
    report.negativeOwnership = { status: "EXPECTED_REJECTION", failure: rejected, signalsAccepted: 0 };
    stopAttempted = true; await Owned.stop(BASE, "signal-proof", "helmut_w15_observation_check");
    const exitEnd = Date.now() + 2000; while (!exit && Date.now() < exitEnd) await delay(10);
    assert.deepEqual(exit, { code: 0, signal: null });
    const receipts = fs.readFileSync(`${BASE}/state/stop-signal-proof.SAFE.jsonl`, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(receipts.filter(r => r.status === "SIGNAL_REQUEST_ACCEPTED" && r.signal === "SIGTERM").length, 1);
    assert.equal(receipts.filter(r => r.status === "OWNED_PROCESS_EXIT_CONFIRMED").length, 1);
    assert(!receipts.some(r => r.status === "STOP_FAILURE" || r.signal === "SIGKILL"));
    report.controlledStop = { childExit: exit, acceptedSIGTERM: true, exitReceipt: true, childStderrBytes: stderrBytes };
    report.status = "PASS_OBSERVATION_ENUMS_AND_REAL_OWNED_STOP";
  } catch (error) { report.failure = Auth.failureMetadata(error); }
  finally {
    // Exact owned PID cleanup only; never re-execute the stop test or a workload.
    if (worker && !exit && !stopAttempted) {
      try {
        const identity = JSON.parse(fs.readFileSync(`${BASE}/state/signal-proof.node.SAFE.json`));
        assert.equal(identity.pid, worker.pid); assert.equal(identity.startTicks, Durable.startTicks(worker.pid));
        process.kill(worker.pid, "SIGTERM"); report.emergencySIGTERM = true;
      } catch (error) { report.cleanupFailure = Auth.failureMetadata(error); }
    }
    // After an uncertain helper stop no second signal is allowed. The owned
    // child has a real 40s natural deadline; wait boundedly and keep FAIL.
    if (worker && !exit) {
      report.waitedForNaturalChildEnd = stopAttempted;
      const end = stopAttempted ? childStartedAt + 41000 : Date.now() + 2000;
      while (!exit && Date.now() < end) await delay(25);
    }
    report.stopAttempted = stopAttempted; report.childExit = exit || null;
    report.childStopped = !!exit && !exit.spawnFailure;
    if (!report.childStopped || report.emergencySIGTERM || report.cleanupFailure) report.status = "FAIL_OR_UNKNOWN";
    write(`${WORK}/RESULT.SAFE.json`, report);
  }
  return report;
}
if (require.main === module) main().then(result => { if (result) console.log(JSON.stringify(result));
  if (result && result.status === "FAIL_OR_UNKNOWN") process.exitCode = 1;
}).catch(error => { console.error(JSON.stringify({ status: "FAIL_OR_UNKNOWN", failure: Auth.failureMetadata(error) })); process.exitCode = 1; });
module.exports = { main, pure };
