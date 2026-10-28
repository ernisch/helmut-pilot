"use strict";

// Signal a verified inner process first. Killing a docker exec client is not a
// delivery acknowledgement. No database command or workload restart is allowed.
const fs = require("node:fs"), assert = require("node:assert/strict");
const { startTicks } = require("./w15-durable-observations");
async function stop(base, action, database, registration = "active") {
  assert(["active", "never-started"].includes(registration));
  assert(/^\/tmp\/w15-[a-z0-9-]+$/.test(base));
  assert(["prepare", "run", "setup", "audit", "gateway", "postgrest", "signal-proof"].includes(action));
  const state = `${base}/state`, pidFile = `${state}/${action}.pid`;
  const log = fs.openSync(`${state}/stop-${action}.SAFE.jsonl`, "a", 0o600);
  const record = value => { fs.writeFileSync(log, JSON.stringify({ atUTC: new Date().toISOString(), action, ...value }) + "\n"); fs.fdatasyncSync(log); };
  const marker = `${state}/STOP_REQUESTED.SAFE.json`;
  if (!fs.existsSync(marker)) fs.writeFileSync(marker, JSON.stringify({ action, stopRequestedAtUTC: new Date().toISOString() }), { flag: "wx", mode: 0o600 });
  // A late Docker exec must see the stop marker before any action. Bound the
  // registration race; never declare a missing PID a successful process stop.
  if (!fs.existsSync(pidFile) && registration === "never-started") { record({ status: "PHASE_NOT_STARTED" }); return; }
  const registrationEnd = Date.now() + 2000;
  while (!fs.existsSync(pidFile) && Date.now() < registrationEnd) await new Promise(resolve => setTimeout(resolve, 25));
  assert(fs.existsSync(pidFile), "owned-pid-registration-unknown");
  const pid = Number(fs.readFileSync(pidFile, "utf8")); assert(Number.isSafeInteger(pid) && pid > 1);
  const grouped = ["prepare", "run", "setup", "audit", "signal-proof"].includes(action);
  function members() {
    const out = [];
    for (const d of fs.readdirSync("/proc").filter(x => /^\d+$/.test(x))) {
      try {
        const s = fs.readFileSync(`/proc/${d}/stat`, "utf8"), f = s.slice(s.lastIndexOf(") ") + 2).split(" ");
        if (f[0] === "Z" || (grouped ? Number(f[2]) !== pid : Number(d) !== pid)) continue;
        const command = fs.readFileSync(`/proc/${d}/cmdline`, "utf8").replaceAll("\0", " ");
        assert(command.includes(base) || (grouped && command.includes("psql") && command.includes(database)), "unowned-live-process");
        out.push(Number(d));
      } catch (e) { if (["ENOENT", "ESRCH"].includes(e.code)) continue; throw e; }
    }
    return out;
  }
  if (!members().length) { record({ status: "OWNED_PROCESS_ALREADY_EXITED" }); return; }
  const identityFile = `${state}/${action}.node.SAFE.json`;
  const readyEnd = Date.now() + 2000;
  if (["prepare", "run", "signal-proof"].includes(action)) {
    while (members().length && !fs.existsSync(identityFile) && Date.now() < readyEnd) await new Promise(resolve => setTimeout(resolve, 25));
    if (!members().length) { record({ status: "OWNED_PROCESS_EXIT_CONFIRMED_BEFORE_READY" }); return; }
    assert(fs.existsSync(identityFile), "inner-handler-registration-unknown");
  }
  if (fs.existsSync(identityFile)) {
    const identity = JSON.parse(fs.readFileSync(identityFile));
    assert(identity.phase === action && members().includes(identity.pid));
    assert.equal(startTicks(identity.pid), identity.startTicks, "inner-process-pid-reused");
    record({ status: "SIGTERM_REQUEST", ...identity });
    process.kill(identity.pid, "SIGTERM");
  } else { record({ status: "GROUP_SIGTERM_NO_REGISTERED_NODE", pid }); process.kill(grouped ? -pid : pid, "SIGTERM"); }
  const end = Date.now() + 20000;
  while (members().length && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 50));
  if (members().length) { record({ status: "BOUNDED_SIGKILL_FALLBACK", pid }); process.kill(grouped ? -pid : pid, "SIGKILL"); }
  const killEnd = Date.now() + 2000;
  while (members().length && Date.now() < killEnd) await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(members().length, 0, "owned-process-group-still-live");
  record({ status: "OWNED_PROCESS_EXIT_CONFIRMED" });
}
if (require.main === module) stop(...process.argv.slice(2)).catch(() => { process.stderr.write("w15-inner-stop-unknown\n"); process.exitCode = 1; });
module.exports = { stop };
