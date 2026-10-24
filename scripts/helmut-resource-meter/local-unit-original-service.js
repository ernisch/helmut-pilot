"use strict";

// Source-owner service for a NEW isolated copy. The application never receives
// this socket, HMAC key or administrator connection. No default execution.
const fs = require("node:fs"), net = require("node:net"), path = require("node:path");
const crypto = require("node:crypto"), childProcess = require("node:child_process");
const v8 = require("node:v8");
const CONFIG = "/bench/ORIGINAL_SERVICE_CONFIG.PRIVATE.json";
const SOCKET = "/ram/helmut-original-write-bridge.sock";
const LEDGER = "/bench/ORIGINAL_SERVICE_CHILDREN.SAFE.jsonl", STOP = "/bench/ORIGINAL_SERVICE_STOP.SAFE.json";
const LEDGER_CAP = 256 * 1024, META = ["dev", "ino", "mode", "uid", "gid", "nlink", "size", "mtimeNs", "ctimeNs"];
const BODY_CAP = 36 * 1024 * 1024, FRAME_CAP = 50 * 1024 * 1024;
const PHASE_CAP = 2048;
const exact = (x, keys) => x && typeof x === "object" && !Array.isArray(x)
  && Object.keys(x).sort().join("|") === [...keys].sort().join("|");
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const need = (ok, code) => { if (!ok) throw Error("original-owner-service-" + code); };
function file(pin, { privateFile = false, bytes = false } = {}) {
  need(exact(pin, ["path", "bytes", "sha256"]) && path.isAbsolute(pin.path)
    && path.normalize(pin.path) === pin.path && /^[a-f0-9]{64}$/.test(pin.sha256)
    && Number.isSafeInteger(pin.bytes) && pin.bytes > 0 && pin.bytes <= 256 * 1024 * 1024, "file-pin");
  need(fs.realpathSync(pin.path) === pin.path, "file-path");
  const fd = fs.openSync(pin.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const a = fs.fstatSync(fd, { bigint: true }), h = crypto.createHash("sha256");
    need(a.isFile() && a.nlink === 1n && a.size === BigInt(pin.bytes)
      && (!privateFile || a.uid === 1000n && (a.mode & 0o777n) === 0o600n), "file-metadata");
    const buffer = Buffer.alloc(Math.min(pin.bytes, 65536)), blocks = []; let n, count = 0;
    while ((n = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      count += n; need(count <= pin.bytes, "file-grew"); h.update(buffer.subarray(0, n));
      if (bytes) blocks.push(Buffer.from(buffer.subarray(0, n)));
    }
    const b = fs.fstatSync(fd, { bigint: true }), named = fs.lstatSync(pin.path, { bigint: true });
    need(count === pin.bytes && h.digest("hex") === pin.sha256
      && ["dev", "ino", "mode", "uid", "gid", "nlink", "size", "mtimeNs", "ctimeNs"].every(k => a[k] === b[k] && b[k] === named[k]), "file-drift");
    return bytes ? Buffer.concat(blocks) : null;
  } finally { fs.closeSync(fd); }
}
function privateConfig() {
  need(fs.realpathSync(CONFIG) === CONFIG, "config-path");
  const fd = fs.openSync(CONFIG, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const a = fs.fstatSync(fd, { bigint: true });
    need(a.isFile() && a.nlink === 1n && a.uid === 1000n && (a.mode & 0o7777n) === 0o600n
      && a.size > 0n && a.size <= 1048576n, "config-metadata");
    const buffer = Buffer.alloc(Number(a.size) + 1); let total = 0;
    while (total < buffer.length) {
      const n = fs.readSync(fd, buffer, total, buffer.length - total, null); if (!n) break; total += n;
    }
    const b = fs.fstatSync(fd, { bigint: true }), named = fs.lstatSync(CONFIG, { bigint: true });
    need(total === Number(a.size) && named.isFile() && fs.realpathSync(CONFIG) === CONFIG
      && ["dev", "ino", "mode", "uid", "gid", "nlink", "size", "mtimeNs", "ctimeNs"].every(k => a[k] === b[k] && b[k] === named[k]), "config-drift");
    const bytes = buffer.subarray(0, total);
    need(Buffer.from(bytes.toString("utf8")).equals(bytes), "config-utf8");
    const value = JSON.parse(bytes.toString("utf8"));
    need(JSON.stringify(value) === bytes.toString("utf8"), "config-unique-json");
    return { value, pin: { path: CONFIG, bytes: total, sha256: sha(bytes) } };
  } finally { fs.closeSync(fd); }
}
function utc(x) { return typeof x === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)
  && Number.isFinite(Date.parse(x)) && new Date(x).toISOString() === x; }
function processIdentity(pid) {
  need(Number.isSafeInteger(pid) && pid > 0, "process-id");
  const text = fs.readFileSync(`/proc/${pid}/stat`, "utf8"), fields = text.slice(text.lastIndexOf(")") + 2).trim().split(/\s+/);
  need(!["Z", "X"].includes(fields[0]) && /^[0-9]+$/.test(fields[19]), "process-live");
  return { pid, startTicks: fields[19], exe: fs.readlinkSync(`/proc/${pid}/exe`),
    membership: fs.readFileSync(`/proc/${pid}/cgroup`, "utf8") };
}
function nodeBudget() {
  need(process.version === "v24.19.0" && process.execArgv.length === 2
    && process.execArgv[0] === "--max-old-space-size=384" && process.execArgv[1] === "--max-semi-space-size=16"
    && !Object.hasOwn(process.env, "NODE_OPTIONS"), "node-budget");
  const heapSizeLimitBytes = v8.getHeapStatistics().heap_size_limit;
  need(Number.isSafeInteger(heapSizeLimitBytes) && heapSizeLimitBytes > 0 && heapSizeLimitBytes <= 448 * 1024 * 1024, "actual-heap-limit");
  return { nodeVersion: process.version, execArgv: [...process.execArgv], oldSpaceMiB: 384, semiSpaceMiB: 16, heapSizeLimitBytes };
}
function checkConfig(c) {
  need(process.getuid() === 1000 && !process.env.VERCEL && process.version === "v24.19.0", "local-owner-only");
  nodeBudget();
  need(exact(c, ["schema", "operationId", "commandHash", "database", "issuedAtUTC", "expiresAtUTC", "measuredCgroup",
    "postgres", "psqlPin", "servicePin", "transactionCodePin", "secretHex", "qualification", "libraryPath"])
    && c.schema === "helmut-local-unit-original-service/1" && /^localUnitDiagnostic-[a-f0-9]{32}$/.test(c.operationId)
    && c.database === "helmut_unit_diagnostic_" + c.operationId.slice(-32) && /^[a-f0-9]{64}$/.test(c.commandHash), "configuration");
  need(utc(c.issuedAtUTC) && utc(c.expiresAtUTC) && Date.now() >= Date.parse(c.issuedAtUTC)
    && Date.now() - Date.parse(c.issuedAtUTC) <= 10000 && Date.parse(c.expiresAtUTC) - Date.parse(c.issuedAtUTC) <= 180000
    && Date.parse(c.expiresAtUTC) > Date.now(), "configuration-window");
  need(typeof c.secretHex === "string" && /^[a-f0-9]{64}$/.test(c.secretHex), "private-key");
  need(c.servicePin.path === __filename && c.transactionCodePin.path === path.join(__dirname, "local-unit-original-transaction.js")
    && c.psqlPin.path === "/usr/lib/postgresql/17/bin/psql", "fixed-code");
  for (const p of [c.servicePin, c.transactionCodePin, c.psqlPin, c.postgres.exePin]) file(p);
  need(exact(c.postgres, ["pid", "startTicks", "exePin"])
    && c.postgres.exePin.path === "/usr/lib/postgresql/17/bin/postgres", "fixed-postgres");
  need(exact(c.measuredCgroup, ["path", "device", "inode", "procMembership"])
    && c.measuredCgroup.path === "/owned-group" && Number.isSafeInteger(c.measuredCgroup.device)
    && Number.isSafeInteger(c.measuredCgroup.inode) && c.measuredCgroup.inode > 0
    && c.measuredCgroup.procMembership === "0::/\n", "measured-group");
  need(typeof c.libraryPath === "string" && c.libraryPath.length <= 1024 && c.libraryPath.split(":").every(p =>
    /^\/(?:ram\/jit-root|jit-root\/tree|usr\/lib\/x86_64-linux-gnu)(?:\/[a-zA-Z0-9_.-]+)*$/.test(p)), "library-path");
  need(c.qualification && c.qualification.database === c.database && c.qualification.operationId === c.operationId
    && c.qualification.commandHash === c.commandHash, "qualification-scope");
  return c;
}
function mac(key, object) { return crypto.createHmac("sha256", key).update(JSON.stringify(object)).digest("hex"); }
function parse(frame, key, observed, now = Date.now()) {
  need(Buffer.isBuffer(frame) && frame.length > 0 && frame.length <= FRAME_CAP
    && Buffer.from(frame.toString("utf8")).equals(frame), "frame-bytes");
  const p = JSON.parse(frame.toString("utf8"));
  need(exact(p, ["version", "nonce", "atUTC", "bodyBase64", "hmacSHA256"])
    && p.version === "helmut-local-original-owner-request/1" && typeof p.nonce === "string" && /^[a-f0-9]{64}$/.test(p.nonce)
    && typeof p.bodyBase64 === "string" && typeof p.hmacSHA256 === "string"
    && !observed.has(p.nonce) && observed.size < 256 && utc(p.atUTC)
    && Math.abs(now - Date.parse(p.atUTC)) <= 3000 && /^[a-f0-9]{64}$/.test(p.hmacSHA256)
    && Buffer.from(JSON.stringify(p)).equals(frame), "frame-binding");
  const { hmacSHA256 } = p, unsigned = { version: p.version, nonce: p.nonce, atUTC: p.atUTC, bodyBase64: p.bodyBase64 };
  need(crypto.timingSafeEqual(Buffer.from(hmacSHA256, "hex"), Buffer.from(mac(key, unsigned), "hex")), "frame-authentication");
  const body = Buffer.from(p.bodyBase64, "base64");
  need(body.length > 0 && body.length <= BODY_CAP && body.toString("base64") === p.bodyBase64
    && Buffer.from(body.toString("utf8")).equals(body), "request-bytes");
  const request = JSON.parse(body.toString("utf8"));
  need(Buffer.from(JSON.stringify(request)).equals(body), "request-unique-json");
  observed.add(p.nonce); // Consume before any database interaction. No replay.
  return { nonce: p.nonce, request };
}
function saveError(label, bytes) {
  const directory = "/bench/OriginalBridgeErrors";
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { mode: 0o700 });
  const row = { schema: "helmut-local-original-owner-stderr/1", bytes: bytes.length, sha256: sha(bytes), contentsRetained: false };
  fs.writeFileSync(path.join(directory, label + ".SAFE.json"), JSON.stringify(row) + "\n", { mode: 0o600, flag: "wx" });
}
function psqlIdentity(c, child) {
  const pid = child.pid;
  need(Number.isSafeInteger(pid) && pid > 0 && child.spawnfile === c.psqlPin.path, "child-handle");
  const root = `/proc/${pid}`, stat = fs.readFileSync(root + "/stat", "utf8"), fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
  need(Number(stat.slice(0, stat.indexOf(" "))) === pid && fields.length >= 20 && !["Z", "X"].includes(fields[0])
    && Number(fields[1]) === process.pid && /^[1-9][0-9]{0,29}$/.test(fields[19]), "child-stat");
  const status = fs.readFileSync(root + "/status", "utf8"), ids = label => {
    const match = new RegExp("^" + label + ":[\\t ]+([0-9\\t ]+)$", "m").exec(status), values = match?.[1].trim().split(/\s+/).map(Number);
    need(values?.length === 4 && values.every(value => value === 1000), "child-uid-gid"); return values;
  };
  const uids = ids("Uid"), gids = ids("Gid");
  for (const label of ["CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb"])
    need(new RegExp("^" + label + ":\\s*0+\\s*$", "m").test(status), "child-capabilities");
  need(/^NoNewPrivs:\s*1\s*$/m.test(status), "child-no-new-privileges");
  const observed = { pid, parentPID: Number(fields[1]), startTicks: fields[19], exe: fs.readlinkSync(root + "/exe"),
    pidNamespace: fs.readlinkSync(root + "/ns/pid"), membership: fs.readFileSync(root + "/cgroup", "utf8"),
    uids, gids, capabilitiesZero: true, noNewPrivileges: true };
  const after = fs.readFileSync(root + "/stat", "utf8"), tail = after.slice(after.lastIndexOf(")") + 2).trim().split(/\s+/);
  need(child.pid === pid && observed.exe === c.psqlPin.path && observed.membership === c.measuredCgroup.procMembership
    && /^pid:\[[1-9][0-9]{0,19}\]$/.test(observed.pidNamespace) && observed.pidNamespace === fs.readlinkSync("/proc/self/ns/pid")
    && Number(after.slice(0, after.indexOf(" "))) === pid && !["Z", "X"].includes(tail[0])
    && tail[1] === fields[1] && tail[19] === fields[19], "child-process-drift");
  return Object.freeze({ ...observed, uids: Object.freeze(uids), gids: Object.freeze(gids) });
}
function privateOutput(fd, filename, size) {
  const a = fs.fstatSync(fd, { bigint: true }), named = fs.lstatSync(filename, { bigint: true });
  need(a.isFile() && a.uid === 1000n && a.gid === 1000n && a.nlink === 1n && a.size === BigInt(size)
    && (a.mode & 0o7777n) === 0o600n && fs.realpathSync(filename) === filename
    && META.every(k => a[k] === named[k]), "ledger-file-identity"); return a;
}
function childLedger(c, configPin, self, fail) {
  need(fs.realpathSync("/bench") === "/bench", "ledger-parent"); const directory = fs.lstatSync("/bench", { bigint: true });
  need(directory.isDirectory() && !directory.isSymbolicLink() && directory.uid === 1000n && (directory.mode & 0o7777n) === 0o700n, "ledger-private-parent");
  const fd = fs.openSync(LEDGER, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK, 0o600);
  let previous, bytes = 0, events = 0, spawns = 0, closes = 0, confirmed = 0, broken = false, publicationFailed = false, sealed = false, closedFD = false;
  const digest = crypto.createHash("sha256"), records = new Map();
  const mark = () => { broken = true; fail(); };
  function append(value) {
    try {
      need(!sealed && !publicationFailed && !closedFD, "ledger-sealed-or-failed"); const before = privateOutput(fd, LEDGER, bytes);
      need(!previous || META.every(k => previous[k] === before[k]), "ledger-drift");
      const raw = Buffer.from(JSON.stringify(value) + "\n"); need(raw.length <= 4096 && bytes + raw.length <= LEDGER_CAP, "ledger-cap");
      let offset = 0; while (offset < raw.length) { const n = fs.writeSync(fd, raw, offset, raw.length - offset, null); need(n > 0, "ledger-short-write"); offset += n; }
      fs.fsyncSync(fd); const after = privateOutput(fd, LEDGER, bytes + raw.length);
      need(["dev", "ino", "mode", "uid", "gid", "nlink"].every(k => before[k] === after[k]), "ledger-write-drift");
      bytes += raw.length; events++; digest.update(raw); previous = after;
    } catch (error) { publicationFailed = true; mark(); throw error; }
  }
  try {
    append({ schema: "helmut-local-unit-original-service-children/1", event: "header", operationId: c.operationId,
      commandHash: c.commandHash, configPin, servicePID: self.pid, serviceStartTicks: self.startTicks });
  } catch (error) { fs.closeSync(fd); closedFD = true; throw error; }
  return {
    failed: () => broken,
    fail: mark,
    spawn(child, observed, nonce) {
      try {
        need(!broken && !records.has(child) && spawns < 256 && /^[a-f0-9]{64}$/.test(nonce), "ledger-child-cap-or-nonce");
        const record = Object.freeze({ index: spawns, requestNonceSHA256: sha(nonce), process: observed });
        append({ event: "spawn", ...record }); records.set(child, record); spawns++;
      } catch (error) { mark(); throw error; }
    },
    close(child, outcome, children) {
      try {
        const record = records.get(child);
        need(record && children.has(child) && child.pid === record.process.pid && !record.closed, "ledger-child-registration");
        const success = outcome.exitObserved && outcome.exitCode === 0 && outcome.exitSignal === null
          && outcome.stdoutEOF && outcome.stderrEOF && outcome.failure === null;
        append({ event: "close", index: record.index, requestNonceSHA256: record.requestNonceSHA256,
          pid: record.process.pid, startTicks: record.process.startTicks, ...outcome, confirmed: success });
        records.delete(child); closes++; if (success) confirmed++;
        if (!success) mark();
      } catch (error) { mark(); throw error; }
    },
    seal() {
      let pin = null;
      try {
        need(!sealed && records.size === 0 && !broken && spawns === closes && confirmed === closes, "ledger-incomplete");
        const current = privateOutput(fd, LEDGER, bytes); need(META.every(k => previous[k] === current[k]), "ledger-final-drift"); fs.fsyncSync(fd);
        pin = { path: LEDGER, bytes, sha256: digest.copy().digest("hex") }; file(pin, { privateFile: true }); sealed = true;
      } catch { pin = null; mark(); }
      finally { if (!closedFD) { fs.closeSync(fd); closedFD = true; } }
      return { ledgerPin: pin, ledgerComplete: !broken && sealed, eventCount: events, spawnCount: spawns, closeCount: closes, confirmedCount: confirmed };
    }
  };
}
function stopReceipt(value) {
  const raw = Buffer.from(JSON.stringify(value) + "\n"); need(raw.length <= 32768, "stop-cap");
  const fd = fs.openSync(STOP, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK, 0o600);
  try {
    privateOutput(fd, STOP, 0); let n = 0;
    while (n < raw.length) { const count = fs.writeSync(fd, raw, n, raw.length - n, null); need(count > 0, "stop-short-write"); n += count; }
    fs.fsyncSync(fd); privateOutput(fd, STOP, raw.length);
  } finally { fs.closeSync(fd); }
  file({ path: STOP, bytes: raw.length, sha256: sha(raw) }, { privateFile: true });
}
function transactionPhases(nonce, mode, begin, outcome, fail) {
  const filename = "/bench/ORIGINAL_SERVICE_PHASES_" + sha(nonce) + ".PRIVATE.jsonl";
  let fd = null, bytes = 0, rows = 0, previous = null, broken = false, phase = null, started = 0, last = 0;
  const failed = () => {
    broken = true; fail();
    // Publication failure never makes an already observed COMMIT unsent.
    try { process.stderr.write(outcome.commitProcessConfirmed
      ? "original-owner-service-phase-publication-failed-commit-process-confirmed\n"
      : "original-owner-service-phase-publication-failed-commit-not-confirmed\n"); } catch (_) {}
  };
  function append(event, details = {}) {
    try {
      need(!broken && fd !== null && rows < 8, "phase-output-state");
      const now = Number(process.hrtime.bigint() - begin), before = privateOutput(fd, filename, bytes);
      need(Number.isSafeInteger(now) && now >= last && (!previous || META.every(k => previous[k] === before[k])), "phase-clock-or-drift");
      const raw = Buffer.from(JSON.stringify({ event, atNS: now, ...details,
        psqlInvoked: outcome.invoked, commitProcessConfirmed: outcome.commitProcessConfirmed }) + "\n");
      need(raw.length <= 512 && bytes + raw.length <= PHASE_CAP, "phase-output-cap");
      let offset = 0;
      while (offset < raw.length) { const n = fs.writeSync(fd, raw, offset, raw.length - offset, null); need(n > 0, "phase-short-write"); offset += n; }
      fs.fsyncSync(fd); const after = privateOutput(fd, filename, bytes + raw.length);
      need(["dev", "ino", "mode", "uid", "gid", "nlink"].every(k => before[k] === after[k]), "phase-write-drift");
      bytes += raw.length; rows++; previous = after; last = now; return now;
    } catch (error) { failed(); throw error; }
  }
  try {
    fd = fs.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK, 0o600);
    append("header", { schema: "helmut-local-unit-original-service-phases/1", requestNonceSHA256: sha(nonce),
      mode: ["seed", "state", "usage", "artifact"].includes(mode) ? mode : "invalid" });
  } catch (error) { if (!broken) failed(); if (fd !== null) fs.closeSync(fd); throw error; }
  return {
    start(name) { need(phase === null && ["prepare", "psql", "accept"].includes(name), "phase-start"); phase = name; started = append(name + "-start"); },
    end(name) { need(phase === name, "phase-end"); append(name + "-end", { durationNS: Number(process.hrtime.bigint() - begin) - started }); phase = null; },
    finish(ackAccepted) {
      try { append("terminal", { ackAccepted }); }
      finally { if (fd !== null) { fs.closeSync(fd); fd = null; } }
    }
  };
}
async function psql(c, sql, children, ledger, nonce, phaseOutcome = null) {
  need(typeof sql === "string" && Buffer.byteLength(sql) <= BODY_CAP, "sql-size");
  let child;
  try {
    file(c.psqlPin);
    child = childProcess.spawn(c.psqlPin.path, ["-X", "-qAt", "-w", "-h", "/ram/socket", "-p", "5432", "-U", "postgres",
      "-d", c.database, "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=terse", "-f", "-"], {
      env: { PATH: "/usr/lib/postgresql/17/bin:/usr/bin:/bin", LANG: "C.UTF-8", LC_ALL: "C.UTF-8",
        LD_LIBRARY_PATH: c.libraryPath, PGCONNECT_TIMEOUT: "3", HOME: "/ram", TMPDIR: "/ram" }, stdio: ["pipe", "pipe", "pipe"] });
  } catch { ledger.fail(); throw Error("original-owner-service-transaction-spawn-unconfirmed"); }
  children.add(child);
  return new Promise((resolve, reject) => {
    const out = [], err = []; let outBytes = 0, errBytes = 0, failure = null, exited = false, outEOF = false, errEOF = false;
    let actualExitCode = null, actualExitSignal = null;
    let done = false;
    const timer = setTimeout(() => abort("transaction-deadline-unknown"), 28000);
    const terminalTimer = setTimeout(() => {
      if (done) return;
      done = true; failure ||= "transaction-close-not-observed"; ledger.fail();
      child.kill("SIGKILL");
      for (const stream of [child.stdin, child.stdout, child.stderr]) stream.destroy();
      clearTimeout(timer); clearTimeout(killer);
      // Keep this child registered until its actual close. The controller must
      // close/observe the owner group; a timeout never pretends EOF or exit.
      reject(Error("original-owner-service-" + failure));
    }, 34000);
    let killer;
    function abort(code) {
      if (done) return;
      failure ||= code; ledger.fail();
      if (!exited) { child.kill("SIGTERM"); killer ||= setTimeout(() => child.kill("SIGKILL"), 3000); }
    }
    function finish(code, signal) {
      clearTimeout(timer); clearTimeout(terminalTimer); clearTimeout(killer);
      if (!exited || actualExitCode !== code || actualExitSignal !== signal || child.exitCode !== code || child.signalCode !== signal)
        failure ||= "transaction-exit-identity";
      if (phaseOutcome && !failure && code === 0 && signal === null && outEOF && errEOF)
        phaseOutcome.commitProcessConfirmed = true;
      if (errBytes) {
        try { saveError(crypto.randomBytes(12).toString("hex"), Buffer.concat(err)); }
        catch { failure ||= "private-error-retention-failed"; }
      }
      try {
        need((code === null || Number.isInteger(code) && code >= 0 && code <= 255)
          && (signal === null || typeof signal === "string" && /^SIG[A-Z0-9]{1,16}$/.test(signal)), "child-close-values");
        ledger.close(child, { exitObserved: exited, exitCode: code, exitSignal: signal,
          stdoutEOF: outEOF, stderrEOF: errEOF, failure }, children);
      } catch { ledger.fail(); failure ||= "transaction-ledger-unconfirmed"; }
      children.delete(child); if (done) return; done = true;
      if (failure || code !== 0 || signal || !outEOF || !errEOF) {
        reject(Error("original-owner-service-" + (failure || "transaction-not-confirmed"))); return;
      }
      // psql's close with code0 and both EOFs includes the final COMMIT. Rows
      // printed before a later failed commit cannot become an acceptance.
      resolve(Buffer.concat(out));
    }
    child.once("error", () => abort("transaction-process-error"));
    child.stdout.on("data", b => { if (outBytes + b.length > 1024 * 1024) abort("transaction-output-cap");
      else { outBytes += b.length; out.push(b); } });
    child.stderr.on("data", b => { if (errBytes + b.length > 131072) abort("transaction-error-cap");
      else { errBytes += b.length; err.push(b); } });
    child.stdout.once("end", () => { if (!child.stdout.destroyed) outEOF = true; }); child.stderr.once("end", () => { if (!child.stderr.destroyed) errEOF = true; });
    child.stdout.once("error", () => abort("transaction-stdout-error")); child.stderr.once("error", () => abort("transaction-stderr-error"));
    child.stdin.once("error", () => abort("transaction-stdin-error"));
    child.once("exit", (code, signal) => { exited = true; actualExitCode = code; actualExitSignal = signal; }); child.once("close", finish);
    try { ledger.spawn(child, psqlIdentity(c, child), nonce); child.stdin.end(sql); }
    catch { abort("transaction-spawn-observation"); }
  });
}
async function start() {
  process.umask(0o077);
  const read = privateConfig(), configPin = read.pin;
  const c = checkConfig(read.value), key = Buffer.from(c.secretHex, "hex"); need(key.length === 32, "private-key-bytes");
  const transaction = require(c.transactionCodePin.path), begin = process.hrtime.bigint();
  const self = Object.freeze(processIdentity(process.pid)), actualNodeBudget = nodeBudget();
  need(typeof transaction.prepare === "function" && typeof transaction.acceptResult === "function", "transaction-builder");
  const observed = new Set(), children = new Set(), sockets = new Set();
  let stopping = false, writing = false, terminal = false, lifecycleFailure = false, ledger = null, closing = null, observer = null, deadline = null;
  const lifecycleFailed = () => { terminal = true; lifecycleFailure = true; process.exitCode = 1; };
  const groupIdentity = () => {
    const actual = processIdentity(process.pid);
    need(Object.keys(self).every(key => actual[key] === self[key]), "self-process-drift");
    file(configPin, { privateFile: true });
    const s = fs.statSync(c.measuredCgroup.path);
    need(s.dev === c.measuredCgroup.device && s.ino === c.measuredCgroup.inode
      && fs.readFileSync("/proc/self/cgroup", "utf8") === c.measuredCgroup.procMembership, "cgroup-drift");
    const pg = processIdentity(c.postgres.pid);
    need(pg.startTicks === c.postgres.startTicks && pg.exe === c.postgres.exePin.path
      && pg.membership === c.measuredCgroup.procMembership, "postgres-drift");
    need(!ledger?.failed(), "child-ledger-failed");
    need(Date.now() < Date.parse(c.expiresAtUTC) && process.hrtime.bigint() - begin < 180000000000n, "expired");
  };
  groupIdentity();
  need(!fs.existsSync(SOCKET), "new-owner-socket-required");
  ledger = childLedger(c, configPin, self, lifecycleFailed);
  // This socket is inside the owner container only; its path is never mounted
  // into the application. The root broker additionally authenticates every frame.
  const server = net.createServer({ allowHalfOpen: true }, socket => {
    if (stopping || terminal || sockets.size >= 2 || writing) { socket.destroy(); return; }
    sockets.add(socket);
    let blocks = [], size = 0, consumed = false, ownsWrite = false, responseFinished = false;
    socket.once("finish", () => { responseFinished = true; if (ownsWrite) writing = false; });
    socket.once("close", () => {
      sockets.delete(socket);
      if (ownsWrite && !responseFinished) terminal = true; // Unknown outcome: never reopen for a subsequent write.
    });
    const timer = setTimeout(() => socket.destroy(), 30000);
    socket.once("close", () => clearTimeout(timer)); socket.on("error", () => {});
    socket.on("data", async block => {
      if (consumed || stopping) { socket.destroy(); return; }
      size += block.length;
      if (size > FRAME_CAP + 1) { socket.destroy(); return; }
      blocks.push(block);
      if (!block.includes(10)) return;
      consumed = true;
      let message, phases = null, status = 500, body = Buffer.from('{"error":"original-write-not-confirmed"}');
      const phaseOutcome = { invoked: false, commitProcessConfirmed: false };
      try {
        const frame = Buffer.concat(blocks); blocks = [];
        need(frame.at(-1) === 10 && frame.indexOf(10) === frame.length - 1, "single-frame");
        message = parse(frame.subarray(0, -1), key, observed); groupIdentity();
        need(!terminal && !writing && message.request.operationId === c.operationId && message.request.commandHash === c.commandHash, "request-scope");
        writing = true; ownsWrite = true;
        phases = transactionPhases(message.nonce, message.request.mode, begin, phaseOutcome, lifecycleFailed);
        phases.start("prepare");
        let prepared;
        try { prepared = transaction.prepare(message.request, c.qualification); } finally { phases.end("prepare"); }
        need(prepared.database === c.database && prepared.sqlSHA256 === sha(Buffer.from(prepared.sql)), "prepared-transaction");
        phases.start("psql"); phaseOutcome.invoked = true;
        try { body = await psql(c, prepared.sql, children, ledger, message.nonce, phaseOutcome); } finally { phases.end("psql"); }
        groupIdentity(); phases.start("accept");
        let result;
        try { result = transaction.acceptResult(prepared, body.toString("utf8")); } finally { phases.end("accept"); }
        const artifact = message.request.mode === "artifact";
        need(exact(result, ["schema", artifact ? "originalRowAck" : "authAck", "ownAck"])
          && result.schema === "helmut-local-unit-original-write-result/1" && result.ownAck && typeof result.ownAck === "object"
          && (artifact ? result.originalRowAck && typeof result.originalRowAck === "object" && !Array.isArray(result.originalRowAck)
            : Array.isArray(result.authAck) && result.authAck.length === 1), "confirmed-result");
        body = Buffer.from(JSON.stringify(result)); status = 200;
      } catch { if (ownsWrite) terminal = true; body = Buffer.from('{"error":"original-write-not-confirmed"}'); }
      finally {
        if (phases) {
          try { phases.finish(status === 200); }
          catch { lifecycleFailed(); status = 500; body = Buffer.from('{"error":"original-write-not-confirmed"}'); }
        }
      }
      if (!message || stopping || socket.destroyed) { if (ownsWrite) terminal = true; socket.destroy(); return; }
      const response = { schema: "helmut-local-original-owner-response/1", nonce: message.nonce, status, bodyBase64: body.toString("base64") };
      socket.end(JSON.stringify({ ...response, hmacSHA256: mac(key, response) }) + "\n");
    });
  });
  server.maxConnections = 2;
  const close = () => {
    if (closing) return closing;
    stopping = true;
    closing = (async () => {
    clearInterval(observer); clearTimeout(deadline);
    for (const socket of sockets) socket.destroy();
    const serverClosed = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await Promise.all([...children].map(child => new Promise((resolve, reject) => {
      const kill = setTimeout(() => child.kill("SIGKILL"), 3000);
      const limit = setTimeout(() => { clearTimeout(kill); reject(Error("original-owner-service-child-close-deadline")); }, 6000);
      child.once("close", () => { clearTimeout(kill); clearTimeout(limit); resolve(); }); child.kill("SIGTERM");
    })));
    await serverClosed;
    need(children.size === 0, "children-exit-open");
    const final = ledger.seal(), cleanShutdown = !terminal && !lifecycleFailure && final.ledgerComplete;
    try {
      stopReceipt({ schema: "helmut-local-unit-original-service-stop/1", operationId: c.operationId, commandHash: c.commandHash,
        servicePID: self.pid, serviceStartTicks: self.startTicks, serverClosed: true, childrenEmpty: true, terminal,
        cleanShutdown, ...final, serviceNodeExitObserved: false, serviceStdoutEOFObserved: false, serviceStderrEOFObserved: false });
    } catch (error) { lifecycleFailed(); throw error; }
    need(cleanShutdown, "service-stop-unconfirmed");
    })();
    return closing;
  };
  let readyProcess;
  try {
    readyProcess = self;
    await new Promise((resolve, reject) => {
      const failed = error => { server.removeListener("listening", listening); reject(error); };
      const listening = () => { server.removeListener("error", failed); resolve(); };
      server.once("error", failed); server.once("listening", listening); server.listen(SOCKET);
    });
    fs.chmodSync(SOCKET, 0o666); groupIdentity();
  } catch (error) { lifecycleFailed(); await close(); throw error; }
  server.on("error", () => { lifecycleFailed(); void close().catch(() => { process.exitCode = 1; }); });
  observer = setInterval(() => { try { groupIdentity(); } catch { lifecycleFailed(); void close().catch(() => { process.exitCode = 1; }); } }, 500);
  deadline = setTimeout(() => { lifecycleFailed(); void close().catch(() => { process.exitCode = 1; }); }, Math.max(1, Date.parse(c.expiresAtUTC) - Date.now() - 6000));
  return { close, ready: { schema: "helmut-local-unit-original-service-ready/1", ...readyProcess,
    database: c.database, commandHash: c.commandHash, configPin, actualNodeBudget, configuredInitialDatabaseRole: "postgres", databaseConnectionObserved: false,
    unitExecutionQualified: false, full500Qualified: false } };
}
module.exports = Object.freeze({ start });
if (require.main === module) {
  if (process.argv.length !== 3 || process.argv[2] !== "--serve-original-writes") throw Error("original-owner-service-explicit-start-required");
  start().then(service => {
    process.stdout.write(JSON.stringify(service.ready) + "\n");
    for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => {
      void service.close().catch(() => { process.exitCode = 1; });
    });
  }).catch(() => { process.stderr.write("original-owner-service-start-not-confirmed\n"); process.exitCode = 1; });
}
