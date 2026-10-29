"use strict";

// Signal a verified inner process first. Killing a docker exec client is not a
// delivery acknowledgement. No database command or workload restart is allowed.
const fs = require("node:fs"), assert = require("node:assert/strict");
const { startTicks } = require("./w15-durable-observations");
const STOP_REASONS = new Set(["owned-pid-registration-unknown", "unowned-live-process", "inner-handler-registration-unknown",
  "inner-process-pid-reused", "owned-process-group-still-live"]);
const STOP_CODES = new Set(["ERR_ASSERTION", "ENOENT", "ESRCH", "EACCES", "EPERM", "EIO", "EINVAL", "EMFILE", "ENFILE", "ENOSPC", "EBADF"]);
function stopFailure(error, phase = "entry", pid) {
  const get = key => { try { return error?.[key]; } catch { return undefined; } };
  const code = get("code"), message = get("message");
  const reason = typeof message === "string" && [...STOP_REASONS].find(value => message === value || message.startsWith(value + "\n"));
  return { status: "STOP_FAILURE", phase,
    reason: reason || "owned-stop-unknown",
    ...(STOP_CODES.has(code) ? { code } : {}),
    ...(Number.isSafeInteger(pid) && pid > 1 ? { pid } : {}) };
}
async function stop(base, action, database, registration = "active", scope = "legacy") {
  assert(["active", "never-started"].includes(registration));
  assert(/^\/tmp\/w15-[a-z0-9-]+$/.test(base));
  assert(["legacy", "end500-backup", "end500-restore"].includes(scope));
  const backup = scope === "end500-backup";
  const restore = scope === "end500-restore";
  assert((backup ? ["backup-before", "backup-dump", "backup-roles", "backup-after"] : restore ?
    ["restore-create", "restore-roles", "restore-render", "restore-apply", "restore-check"] :
    ["prepare", "run", "setup", "audit", "gateway", "postgrest", "signal-proof", "eu-component"]).includes(action));
  const state = `${base}/state`, pidFile = `${state}/${action}.pid`;
  const log = fs.openSync(`${state}/stop-${action}.SAFE.jsonl`, "a", 0o600);
  const record = value => { fs.writeFileSync(log, JSON.stringify({ atUTC: new Date().toISOString(), action, ...value }) + "\n"); fs.fdatasyncSync(log); };
  let phase = "stop-marker", observedPID;
  try {
  const marker = `${state}/STOP_REQUESTED.SAFE.json`;
  if (!fs.existsSync(marker)) fs.writeFileSync(marker, JSON.stringify({ action, stopRequestedAtUTC: new Date().toISOString() }), { flag: "wx", mode: 0o600 });
  // A late Docker exec must see the stop marker before any action. Bound the
  // registration race; never declare a missing PID a successful process stop.
  if (!fs.existsSync(pidFile) && registration === "never-started") { record({ status: "PHASE_NOT_STARTED" }); return; }
  const registrationEnd = Date.now() + 2000;
  phase = "pid-registration";
  while (!fs.existsSync(pidFile) && Date.now() < registrationEnd) await new Promise(resolve => setTimeout(resolve, 25));
  assert(fs.existsSync(pidFile), "owned-pid-registration-unknown");
  const pid = Number(fs.readFileSync(pidFile, "utf8")); assert(Number.isSafeInteger(pid) && pid > 1); observedPID = pid;
  const grouped = backup || restore || ["prepare", "run", "setup", "audit", "signal-proof", "eu-component"].includes(action);
  function members() {
    const out = [];
    phase = "proc-list";
    for (const d of fs.readdirSync("/proc").filter(x => /^\d+$/.test(x))) {
      try {
        phase = "proc-stat";
        const s = fs.readFileSync(`/proc/${d}/stat`, "utf8"), f = s.slice(s.lastIndexOf(") ") + 2).split(" ");
        if (f[0] === "Z" || (grouped ? Number(f[2]) !== pid : Number(d) !== pid)) continue;
        phase = "proc-cmdline";
        const command = fs.readFileSync(`/proc/${d}/cmdline`, "utf8").replaceAll("\0", " ");
        phase = "proc-ownership";
        assert(command.includes(base) || (grouped && command.includes("psql") && command.includes(database)), "unowned-live-process");
        out.push(Number(d));
      } catch (e) { if (["ENOENT", "ESRCH"].includes(e.code)) continue; throw e; }
    }
    return out;
  }
  if (!members().length) { record({ status: "OWNED_PROCESS_ALREADY_EXITED" }); return; }
  const identityFile = `${state}/${action}.node.SAFE.json`;
  const readyEnd = Date.now() + 2000;
  if (backup || restore || ["prepare", "run", "signal-proof", "eu-component"].includes(action)) {
    while (members().length && !fs.existsSync(identityFile) && Date.now() < readyEnd) await new Promise(resolve => setTimeout(resolve, 25));
    if (!members().length) { record({ status: "OWNED_PROCESS_EXIT_CONFIRMED_BEFORE_READY" }); return; }
    assert(fs.existsSync(identityFile), "inner-handler-registration-unknown");
  }
  if (fs.existsSync(identityFile)) {
    phase = "identity-read";
    const identity = JSON.parse(fs.readFileSync(identityFile));
    assert(identity.phase === action && members().includes(identity.pid));
    phase = "identity-start-ticks";
    assert.equal(startTicks(identity.pid), identity.startTicks, "inner-process-pid-reused");
    record({ status: "SIGTERM_REQUEST", ...identity });
    phase = "signal-term";
    process.kill(identity.pid, "SIGTERM");
    record({ status: "SIGNAL_REQUEST_ACCEPTED", signal: "SIGTERM", pid: identity.pid, target: "registered-node" });
  } else { record({ status: "GROUP_SIGTERM_NO_REGISTERED_NODE", pid }); phase = "signal-term";
    process.kill(grouped ? -pid : pid, "SIGTERM");
    record({ status: "SIGNAL_REQUEST_ACCEPTED", signal: "SIGTERM", pid, target: grouped ? "owned-group" : "owned-process" }); }
  const end = Date.now() + 20000;
  while (members().length && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 50));
  if (members().length) { record({ status: "BOUNDED_SIGKILL_FALLBACK", pid }); phase = "signal-kill";
    process.kill(grouped ? -pid : pid, "SIGKILL");
    record({ status: "SIGNAL_REQUEST_ACCEPTED", signal: "SIGKILL", pid, target: grouped ? "owned-group" : "owned-process" }); }
  const killEnd = Date.now() + 2000;
  while (members().length && Date.now() < killEnd) await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(members().length, 0, "owned-process-group-still-live");
  record({ status: "OWNED_PROCESS_EXIT_CONFIRMED" });
  } catch (error) {
    const failure = stopFailure(error, phase, observedPID);
    try { record(failure); } catch { failure.journalFailure = true; }
    const safe = new Error("w15-owned-stop-failed"); safe.stopFailure = failure; throw safe;
  } finally { fs.closeSync(log); }
}
if (require.main === module) stop(...process.argv.slice(2)).catch(error => {
  process.stderr.write(JSON.stringify({ kind: "W15_OWNED_STOP_FAILURE", ...(error?.stopFailure || stopFailure(error)) }) + "\n");
  process.exitCode = 1;
});
module.exports = { stop, stopFailure };
