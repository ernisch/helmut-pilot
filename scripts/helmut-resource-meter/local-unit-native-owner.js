"use strict";

// Owner container only. Importing this module starts nothing. Root supplies the
// independently checked START file; this component does not install authority,
// run SQL, qualify a source, call a provider or execute a diagnostic unit.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { spawn } = require("node:child_process"), { isDeepStrictEqual } = require("node:util");
const START = "/run/bootstrap/START.PRIVATE.json", BOOT = "/run/bootstrap";
const OWNER = "/opt/local-unit-native-owner.js", BROKER = "/opt/local-unit-diagnostic-broker.js";
const POSTGREST = "/opt/postgrest-pinned", PUBLIC = "/run/helmut-local-unit-diagnostic";
const PRIVATE = "/run/helmut-local-unit-diagnostic-owner";
const TOKEN = BOOT + "/RUNTIME_TOKEN.PRIVATE", REST_CONFIG = BOOT + "/POSTGREST.PRIVATE.conf";
const QUALIFICATION = BOOT + "/OWNER_QUALIFICATION.PRIVATE.json";
const MAX_LOG = 128 * 1024, MAX_LIFETIME = 180000, STARTUP_MS = 15000, STOP_MS = 4500;
let startConsumed = false;
const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join("|") === [...keys].sort().join("|");
function need(ok, code) { if (!ok) { const e = Error("local-unit-native-owner-" + code); e.ownerCode = code; throw e; } }
function safeError(error) { return Error("local-unit-native-owner-" + (/^[a-z0-9-]{1,96}$/.test(error?.ownerCode || "") ? error.ownerCode : "start-or-runtime-failed")); }
function canonical(filename) { return typeof filename === "string" && path.isAbsolute(filename)
  && path.normalize(filename) === filename && !filename.includes("\0"); }
function pinShape(pin, expectedPath) {
  need(exact(pin, ["path", "bytes", "sha256"]) && canonical(pin.path) && (!expectedPath || pin.path === expectedPath)
    && Number.isSafeInteger(pin.bytes) && pin.bytes > 0 && pin.bytes <= 256 * 1024 * 1024
    && typeof pin.sha256 === "string" && /^[a-f0-9]{64}$/.test(pin.sha256), "public-pin-shape");
}
function utc(value) {
  need(typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value, "utc");
  return Date.parse(value);
}
function validateConfig(value, now = Date.now()) {
  need(exact(value, ["schema", "mode", "operationId", "commandHash", "database", "issuedAtUTC", "expiresAtUTC",
    "measuredCgroup", "pins", "authenticator", "postgrestPort", "legacy"])
    && value.schema === "helmut-local-unit-native-owner-start/1" && value.mode === "owner-local-no500"
    && typeof value.operationId === "string" && /^localUnitDiagnostic-[a-f0-9]{32}$/.test(value.operationId)
    && typeof value.commandHash === "string" && /^[a-f0-9]{64}$/.test(value.commandHash)
    && value.database === "helmut_unit_diagnostic_" + value.operationId.slice(-32), "start-scope");
  const issued = utc(value.issuedAtUTC), expires = utc(value.expiresAtUTC);
  need(Number.isFinite(now) && issued <= now && now - issued <= 10000 && expires - issued <= MAX_LIFETIME
    && expires - now >= STARTUP_MS + STOP_MS, "fresh-window");
  need(exact(value.pins, ["owner", "broker", "postgrest", "node"]), "public-pins");
  pinShape(value.pins.owner, OWNER); pinShape(value.pins.broker, BROKER);
  pinShape(value.pins.postgrest, POSTGREST); pinShape(value.pins.node);
  need(exact(value.measuredCgroup, ["path", "device", "inode", "procMembership"])
    && canonical(value.measuredCgroup.path) && Number.isSafeInteger(value.measuredCgroup.device)
    && value.measuredCgroup.device >= 0 && Number.isSafeInteger(value.measuredCgroup.inode) && value.measuredCgroup.inode > 0
    && typeof value.measuredCgroup.procMembership === "string"
    && /^0::\/[^\0\r\n]*\n$/.test(value.measuredCgroup.procMembership), "cgroup-shape");
  const suffix = value.operationId.slice(-32), a = value.authenticator;
  need(exact(a, ["username", "passwordHex", "jwtSecretHex"])
    && a.username === "helmut_ud_authenticator_" + suffix
    && [a.passwordHex, a.jwtSecretHex].every(x => typeof x === "string" && /^[a-f0-9]{64}$/.test(x) && new Set(x).size > 1)
    && a.passwordHex !== a.jwtSecretHex, "fresh-local-credential-shape");
  need(Number.isSafeInteger(value.postgrestPort) && value.postgrestPort >= 1024 && value.postgrestPort <= 65535
    && value.postgrestPort !== 5432, "fixed-local-port");
  const l = value.legacy;
  need(exact(l, ["tables", "rpcs"]) && Array.isArray(l.tables) && l.tables.length <= 64
    && l.tables.every(x => typeof x === "string" && /^[a-z][a-z0-9_]{0,62}$/.test(x))
    && new Set(l.tables).size === l.tables.length && Array.isArray(l.rpcs) && l.rpcs.length <= 3, "legacy-shape");
  const names = new Set();
  for (const r of l.rpcs) {
    need(exact(r, ["name", "identityArguments", "oid", "prosrcSHA256", "qualificationPin", "requestKeys"])
      && typeof r.name === "string" && /^helmut_auth_(?:state_graph|usage|control)_read_v1$/.test(r.name)
      && !names.has(r.name) && typeof r.identityArguments === "string" && r.identityArguments.length <= 512
      && typeof r.oid === "string" && /^[1-9][0-9]{0,9}$/.test(r.oid)
      && typeof r.prosrcSHA256 === "string" && /^[a-f0-9]{64}$/.test(r.prosrcSHA256)
      && Array.isArray(r.requestKeys) && r.requestKeys.length <= 16
      && r.requestKeys.every(x => typeof x === "string" && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(x))
      && new Set(r.requestKeys).size === r.requestKeys.length, "qualified-read-shape");
    pinShape(r.qualificationPin); need(path.dirname(r.qualificationPin.path) === BOOT
      && ![START, TOKEN, REST_CONFIG, QUALIFICATION].includes(r.qualificationPin.path), "qualified-read-private-path");
    names.add(r.name);
  }
  return value;
}
function identity(s) { return [s.dev, s.ino, s.mode, s.uid, s.gid, s.nlink, s.size, s.mtimeNs, s.ctimeNs].map(String); }
function secureParents(filename) {
  need(canonical(filename), "canonical-path"); let current = "/";
  for (const name of ["", ...filename.split("/").slice(1, -1)]) {
    if (name) current = path.join(current, name);
    const s = fs.lstatSync(current);
    need(s.isDirectory() && !s.isSymbolicLink() && s.uid === 0 && (s.mode & 0o022) === 0, "root-parent");
  }
}
function mountRows(text) {
  const decode = x => x.replace(/\\(040|011|012|134)/g, (_, n) => String.fromCharCode(parseInt(n, 8)));
  return text.trim().split("\n").filter(Boolean).map(line => {
    const f = line.split(" "), sep = f.indexOf("-"); need(sep >= 6 && f.length > sep + 3, "mount-record");
    return { point: decode(f[4]), options: f[5].split(","), filesystem: f[sep + 1] };
  });
}
function mountFor(filename, rows) {
  const matches = rows.filter(r => filename === r.point || filename.startsWith(r.point === "/" ? "/" : r.point + "/"));
  need(matches.length > 0, "mount-missing"); return matches.sort((a, b) => b.point.length - a.point.length)[0];
}
function readFile(filename, cap, { expected = null, privateFile = false, publicMode = null, contents = false } = {}) {
  secureParents(filename); need(fs.realpathSync(filename) === filename, "file-canonical");
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    need(before.isFile() && before.nlink === 1n && before.size > 0n && before.size <= BigInt(cap) && (before.mode & 0o7000n) === 0n
      && (!privateFile || before.uid === 0n && (before.mode & 0o777n) === 0o600n), "file-kind-or-private-mode");
    if (publicMode === "js") need((before.mode & 0o777n) === 0o444n, "public-js-mode");
    if (publicMode === "rest") need((before.mode & 0o777n) === 0o555n, "public-rest-mode");
    if (publicMode === "node") need((before.mode & 0o022n) === 0n && (before.mode & 0o005n) === 0o005n, "public-node-mode");
    if (publicMode) need(mountFor(filename, mountRows(fs.readFileSync("/proc/self/mountinfo", "utf8"))).options.includes("ro"), "public-readonly-mount");
    const h = crypto.createHash("sha256"), chunks = [], buffer = Buffer.alloc(65536); let bytes = 0, n;
    while ((n = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      bytes += n; need(bytes <= cap, "file-cap"); h.update(buffer.subarray(0, n)); if (contents) chunks.push(Buffer.from(buffer.subarray(0, n)));
    }
    const pin = { path: filename, bytes, sha256: h.digest("hex") }, record = identity(before);
    need(bytes === Number(before.size) && isDeepStrictEqual(record, identity(fs.fstatSync(fd, { bigint: true })))
      && isDeepStrictEqual(record, identity(fs.lstatSync(filename, { bigint: true }))), "file-drift");
    if (expected) need(isDeepStrictEqual(pin, expected), "file-pin");
    return { pin, identity: record, bytes: contents ? Buffer.concat(chunks) : undefined };
  } finally { fs.closeSync(fd); }
}
function unchanged(record) { need(isDeepStrictEqual(record.identity, identity(fs.lstatSync(record.pin.path, { bigint: true }))), "file-drift"); }
function privateJSON(filename, expected = null) {
  const r = readFile(filename, 1024 * 1024, { privateFile: true, contents: true, expected });
  let value; try { value = JSON.parse(r.bytes.toString("utf8")); } catch { need(false, "private-json"); }
  return { ...r, value };
}
function writePrivate(filename, text) {
  secureParents(filename); const fd = fs.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_CREAT
    | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, text); } finally { fs.closeSync(fd); }
  return readFile(filename, 1024 * 1024, { privateFile: true });
}
function processInfo(pid) {
  need(Number.isSafeInteger(pid) && pid > 0, "pid");
  const s = fs.readFileSync(`/proc/${pid}/stat`, "utf8"), f = s.slice(s.lastIndexOf(")") + 2).trim().split(/\s+/);
  need(!["Z", "X"].includes(f[0]) && /^[0-9]+$/.test(f[19]), "live-process");
  const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
  need(/^Uid:\s*0\s+0\s+0\s+0\s*$/m.test(status), "actual-process-root");
  for (const key of ["CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb"])
    need(new RegExp("^" + key + ":\\s*0+\\s*$", "m").test(status), "actual-process-capdrop");
  return { pid, startTicks: f[19], exe: fs.readlinkSync(`/proc/${pid}/exe`), membership: fs.readFileSync(`/proc/${pid}/cgroup`, "utf8") };
}
function listeners(port) {
  const rows = [];
  for (const filename of ["/proc/net/tcp", "/proc/net/tcp6"]) for (const line of fs.readFileSync(filename, "utf8").trim().split("\n").slice(1)) {
    const f = line.trim().split(/\s+/);
    if (f[3] === "0A" && parseInt(f[1].split(":")[1], 16) === port) rows.push({ address: f[1].split(":")[0], inode: f[9] });
  }
  return rows;
}
function ownListener(pid, port) {
  const rows = listeners(port); if (rows.length === 0) return false;
  need(rows.length === 1 && rows[0].address === "0100007F", "loopback-listener");
  const sockets = new Set();
  for (const name of fs.readdirSync(`/proc/${pid}/fd`)) {
    try { const m = /^socket:\[([0-9]+)\]$/.exec(fs.readlinkSync(`/proc/${pid}/fd/${name}`)); if (m) sockets.add(m[1]); } catch { /* FD may close between enumeration and readlink. */ }
  }
  need(sockets.has(rows[0].inode), "listener-process-owner"); return true;
}
function actualGroup(c) {
  need(fs.realpathSync(c.path) === c.path, "cgroup-canonical"); const s = fs.lstatSync(c.path);
  need(s.isDirectory() && !s.isSymbolicLink() && s.dev === c.device && s.ino === c.inode
    && fs.statfsSync(c.path).type === 0x63677270, "actual-cgroup");
}
function environmentCheck(c) {
  need(process.getuid() === 0 && process.geteuid() === 0 && process.getgid() === 0 && process.getegid() === 0, "owner-root-only");
  need(!process.env.NODE_OPTIONS && !process.env.NODE_PATH && !Object.keys(process.env).some(k => k.startsWith("PGRST_")), "injected-runtime-environment");
  const status = fs.readFileSync("/proc/self/status", "utf8");
  for (const key of ["CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb"]) need(new RegExp("^" + key + ":\\s*0+\\s*$", "m").test(status), "capabilities-must-be-dropped");
  const interfaces = fs.readFileSync("/proc/net/dev", "utf8").trim().split("\n").slice(2).map(x => x.split(":")[0].trim());
  need(interfaces.length === 1 && interfaces[0] === "lo", "network-loopback-only");
  const run = fs.lstatSync("/run"), boot = fs.lstatSync(BOOT), stats = fs.statfsSync("/run");
  const mount = mountFor("/run", mountRows(fs.readFileSync("/proc/self/mountinfo", "utf8")));
  need(run.isDirectory() && !run.isSymbolicLink() && run.uid === 0 && (run.mode & 0o022) === 0
    && boot.isDirectory() && !boot.isSymbolicLink() && boot.uid === 0 && (boot.mode & 0o777) === 0o700
    && stats.type === 0x01021994 && mount.point === "/run" && mount.filesystem === "tmpfs" && mount.options.includes("rw")
    && stats.blocks * stats.bsize >= 1024 * 1024 && stats.blocks * stats.bsize <= 64 * 1024 * 1024, "bounded-private-tmpfs");
  for (const filename of [PUBLIC, PRIVATE, TOKEN, REST_CONFIG, QUALIFICATION]) {
    try { fs.lstatSync(filename); need(false, "fresh-runtime-path-required"); } catch (e) { if (e.code !== "ENOENT") throw e; }
  }
  actualGroup(c.measuredCgroup);
  const self = processInfo(process.pid);
  need(self.membership === c.measuredCgroup.procMembership && self.exe === process.execPath
    && c.pins.node.path === process.execPath && __filename === OWNER, "actual-owner-process");
  const pg = listeners(5432); need(pg.length === 1 && pg[0].address === "0100007F", "fixed-local-postgres-listener");
  need(listeners(c.postgrestPort).length === 0, "fresh-upstream-port");
  return { self, noNewPrivilegesObserved: /^NoNewPrivs:\s*1\s*$/m.test(status) };
}
function restConfig(c) {
  const runtime = "helmut_ud_runtime_" + c.operationId.slice(-32);
  return [
    'db-uri = "postgresql://' + c.authenticator.username + ':' + c.authenticator.passwordHex
      + '@127.0.0.1:5432/' + c.database + '?sslmode=disable&connect_timeout=5&application_name=helmut_local_unit_owner"',
    'db-schemas = "public"', 'db-anon-role = "' + runtime + '"', 'db-config = false',
    'db-channel-enabled = false', 'db-pool = 1', 'db-pool-acquisition-timeout = 5',
    'db-pool-automatic-recovery = false', 'server-host = "127.0.0.1"', 'server-port = ' + c.postgrestPort,
    'jwt-secret = "' + c.authenticator.jwtSecretHex + '"', 'jwt-aud = "helmut-local-unit-diagnostic"',
    'openapi-mode = "disabled"', 'log-level = "error"', "",
  ].join("\n");
}
function runtimeJWT(c, now = Date.now()) {
  const encode = x => Buffer.from(JSON.stringify(x)).toString("base64url");
  const head = encode({ alg: "HS256", typ: "JWT" }), body = encode({ role: "helmut_ud_runtime_" + c.operationId.slice(-32),
    aud: "helmut-local-unit-diagnostic", iat: Math.floor(now / 1000), nbf: Math.floor(now / 1000), exp: Math.floor(utc(c.expiresAtUTC) / 1000) });
  const signed = head + "." + body;
  return signed + "." + crypto.createHmac("sha256", c.authenticator.jwtSecretHex).update(signed).digest("base64url");
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function bounded(promise, ms, cancelled = null) {
  let timer; try { return await Promise.race([promise.then(value => ({ done: true, value })),
    new Promise(resolve => { timer = setTimeout(() => resolve({ done: false }), ms); }),
    ...(cancelled ? [cancelled.then(() => ({ done: false }))] : [])]); } finally { clearTimeout(timer); }
}
async function start(configPath = START) {
  need(!startConsumed, "owner-start-already-consumed"); startConsumed = true;
  const began = process.hrtime.bigint();
  let child = null, broker = null, upstream = null, c = null, timer = null, guard = null, closing = false, stopPromise = null;
  let failure = null, forced = false, childClosed = false, childExited = false, exitCode = null, exitSignal = null;
  let stdoutEOF = false, stderrEOF = false, logBytes = 0, logOverflow = false, streamError = false;
  let resolveDone; const done = new Promise(resolve => { resolveDone = resolve; });
  let resolveCancelled; const cancelled = new Promise(resolve => { resolveCancelled = resolve; });
  const failed = code => { if (!failure) failure = code; if (!closing) void close(); };
  const records = [];
  const onSignal = () => { void close(); };
  process.once("SIGTERM", onSignal); process.once("SIGINT", onSignal);
  async function close() {
    if (stopPromise) return stopPromise;
    closing = true; resolveCancelled(); clearTimeout(timer); clearInterval(guard);
    stopPromise = (async () => {
      const brokerStop = broker ? Promise.resolve().then(() => broker.close()).catch(() => { failure ||= "broker-close"; }) : Promise.resolve();
      function signal(sig) {
        if (child && !childExited) {
          try { const observed = processInfo(child.pid); need(!upstream || observed.startTicks === upstream.startTicks, "stop-process-identity"); child.kill(sig); }
          catch { failure ||= "child-signal-or-identity"; }
        }
      }
      if (child && !childClosed) {
        signal("SIGTERM"); const until = process.hrtime.bigint() + 2500000000n;
        while (!childClosed && process.hrtime.bigint() < until) await pause(20);
        if (!childClosed) { forced = true; failure ||= "forced-child-stop"; signal("SIGKILL"); }
        const final = process.hrtime.bigint() + 1000000000n; while (!childClosed && process.hrtime.bigint() < final) await pause(20);
      }
      if (!(await bounded(brokerStop, 500)).done) failure ||= "broker-close-deadline";
      if (child && (!childClosed || !childExited)) failure ||= "child-close-deadline";
      if (child && (!stdoutEOF || !stderrEOF)) failure ||= "child-pipe-eof";
      if (child && !(exitCode === 0 && exitSignal === null || exitCode === null && exitSignal === "SIGTERM")) failure ||= "child-exit-status";
      const clean = !failure && !forced && childClosed && childExited && stdoutEOF && stderrEOF && !streamError && !logOverflow
        && (exitCode === 0 && exitSignal === null || exitCode === null && exitSignal === "SIGTERM");
      const report = Object.freeze({ schema: "helmut-local-unit-native-owner-stop/1", cleanShutdown: clean,
        childClosed, childExited, childStdoutEOF: stdoutEOF, childStderrEOF: stderrEOF, logBytes, logOverflow,
        streamError, forcedKill: forced, childExitCode: exitCode, childTerminatedBySIGTERM: exitSignal === "SIGTERM",
        failed: Boolean(failure), unitExecuted: false, full500: false });
      process.removeListener("SIGTERM", onSignal); process.removeListener("SIGINT", onSignal);
      resolveDone(report); return report;
    })();
    return stopPromise;
  }
  try {
    need(configPath === START, "fixed-start-path"); process.umask(0o077);
    const startRecord = privateJSON(START); c = validateConfig(startRecord.value); records.push(startRecord);
    const remainingLifetime = Math.min(MAX_LIFETIME, utc(c.expiresAtUTC) - Date.now());
    const lifetimeEnd = process.hrtime.bigint() + BigInt(Math.floor(remainingLifetime)) * 1000000n;
    const observed = environmentCheck(c);
    for (const [key, mode] of [["owner", "js"], ["broker", "js"], ["postgrest", "rest"], ["node", "node"]])
      records.push(readFile(c.pins[key].path, 256 * 1024 * 1024, { expected: c.pins[key], publicMode: mode }));
    for (const r of c.legacy.rpcs) {
      const q = privateJSON(r.qualificationPin.path, r.qualificationPin), v = q.value;
      need(exact(v, ["schema", "database", "name", "oid", "identityArguments", "prosrcSHA256", "readOnly", "sourceReviewAccepted"])
        && v.schema === "helmut-local-unit-diagnostic-read-rpc-qualification/1" && v.database === c.database
        && v.name === r.name && v.oid === r.oid && v.identityArguments === r.identityArguments
        && v.prosrcSHA256 === r.prosrcSHA256 && v.readOnly === true && v.sourceReviewAccepted === true, "root-read-qualification-binding");
      records.push(q);
    }
    records.push(writePrivate(TOKEN, runtimeJWT(c) + "\n"));
    const configuration = writePrivate(REST_CONFIG, restConfig(c)); records.push(configuration);
    // No inherited credentials, Node preloads, proxy, database, PGRST or loader overrides.
    child = spawn(POSTGREST, [REST_CONFIG], { cwd: BOOT, env: { LANG: "C.UTF-8", LC_ALL: "C.UTF-8", TZ: "UTC", PATH: "/usr/bin:/bin" },
      stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let spawned = false;
    child.once("spawn", () => { spawned = true; });
    child.once("error", () => { failure ||= "child-spawn"; });
    child.once("exit", (code, signal) => { childExited = true; exitCode = code; exitSignal = signal; if (!closing) failed("unexpected-child-exit"); });
    child.once("close", () => { childClosed = true; });
    for (const [stream, which] of [[child.stdout, "stdout"], [child.stderr, "stderr"]]) {
      stream.on("data", bytes => { logBytes += bytes.length; if (logBytes > MAX_LOG) { logOverflow = true; failed("child-log-cap"); } });
      stream.once("end", () => { if (which === "stdout") stdoutEOF = true; else stderrEOF = true; });
      stream.once("error", () => { streamError = true; failed("child-stream"); });
    }
    const startupLeft = () => Math.min(STARTUP_MS - Number(process.hrtime.bigint() - began) / 1000000,
      Number(lifetimeEnd - process.hrtime.bigint()) / 1000000 - STOP_MS);
    while (!spawned) { need(!failure && !closing && startupLeft() > 0, "spawn-deadline-or-failure"); await pause(20); }
    upstream = processInfo(child.pid);
    need(upstream.exe === POSTGREST && upstream.membership === c.measuredCgroup.procMembership, "actual-upstream-process");
    while (!ownListener(child.pid, c.postgrestPort)) {
      need(!failure && !closing && !childExited && startupLeft() > 0, "listener-deadline-or-exit");
      const p = processInfo(child.pid); need(p.startTicks === upstream.startTicks && p.exe === POSTGREST
        && p.membership === c.measuredCgroup.procMembership, "upstream-start-identity"); await pause(25);
    }
    const group = { path: c.measuredCgroup.path, device: c.measuredCgroup.device, inode: c.measuredCgroup.inode,
      procMembership: { broker: observed.self.membership, upstream: upstream.membership } };
    const endpoint = { port: c.postgrestPort, pid: upstream.pid, startTicks: upstream.startTicks,
      exePin: c.pins.postgrest, configPin: configuration.pin, runtimeTokenPath: TOKEN };
    records.push(writePrivate(QUALIFICATION, JSON.stringify({ schema: "helmut-local-unit-diagnostic-owner-qualification/1",
      operationId: c.operationId, commandHash: c.commandHash, database: c.database, brokerCodeSHA256: c.pins.broker.sha256,
      upstream: endpoint, measuredCgroup: group, legacy: c.legacy }) + "\n"));
    const Broker = require(BROKER);
    const brokerStarting = Broker.start({ schema: "helmut-local-unit-diagnostic-broker-config/1", operationId: c.operationId,
      commandHash: c.commandHash, database: c.database, upstream: endpoint, measuredCgroup: group,
      legacy: c.legacy, ownerQualificationPin: records[records.length - 1].pin });
    // A late listen result is closed, never adopted or retried after cancellation.
    void brokerStarting.then(value => { if (closing) void value.close().catch(() => {}); }, () => {});
    const brokerResult = await bounded(brokerStarting, Math.max(1, startupLeft()), cancelled);
    need(brokerResult.done, "broker-start-deadline-unknown"); broker = brokerResult.value;
    need(!failure && !closing && startupLeft() > 0, "broker-start-deadline-or-exit");
    function check() {
      for (const r of records) unchanged(r);
      actualGroup(c.measuredCgroup); const self = processInfo(process.pid), p = processInfo(child.pid);
      need(self.startTicks === observed.self.startTicks && self.exe === observed.self.exe && self.membership === observed.self.membership
        && p.startTicks === upstream.startTicks && p.exe === POSTGREST && p.membership === upstream.membership
        && ownListener(child.pid, c.postgrestPort), "active-process-binding");
      need(Date.now() < utc(c.expiresAtUTC) && process.hrtime.bigint() < lifetimeEnd, "owner-window-expired");
    }
    check(); guard = setInterval(() => { try { check(); } catch { failed("active-runtime-binding"); } }, 250);
    timer = setTimeout(() => { void close(); }, Math.max(0, Number(lifetimeEnd - process.hrtime.bigint()) / 1000000 - STOP_MS));
    const ready = Object.freeze({ schema: "helmut-local-unit-native-owner-ready/1", ownerPID: process.pid,
      ownerStartTicks: observed.self.startTicks, upstreamPID: upstream.pid, upstreamStartTicks: upstream.startTicks,
      measuredCgroup: group, ownerCodePin: c.pins.owner, brokerCodePin: c.pins.broker, upstreamExePin: c.pins.postgrest,
      upstreamConfigPin: configuration.pin, nodeExePin: c.pins.node, trustPublicPath: PUBLIC + "/trust.json",
      noNewPrivilegesObserved: observed.noNewPrivilegesObserved, databaseAuthorityQualified: false,
      databaseConnectionConfirmed: false, unitExecutionAuthorized: false, full500: false });
    return Object.freeze({ ready, close, done });
  } catch (error) { failure ||= "startup-failed"; await close(); throw safeError(error); }
}
module.exports = Object.freeze({ start });
if (require.main === module) {
  (async () => {
    need(process.argv.length === 3 && process.argv[2] === "--start-own-native-endpoint", "explicit-cli-only");
    const running = await start();
    process.stdout.write(JSON.stringify(running.ready) + "\n");
    const stopped = await running.done;
    process.stdout.write(JSON.stringify(stopped) + "\n"); process.exit(stopped.cleanShutdown ? 0 : 1);
  })().catch(() => { process.stderr.write("local-unit-native-owner-start-or-runtime-failed\n"); process.exit(1); });
}
