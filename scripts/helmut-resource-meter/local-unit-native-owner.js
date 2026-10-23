"use strict";

// Owner container only. Importing this module starts nothing. Root supplies the
// independently checked START file; this component does not install authority,
// run SQL, qualify a source, call a provider or execute a diagnostic unit.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { spawn } = require("node:child_process"), { isDeepStrictEqual } = require("node:util");
const v8 = require("node:v8");
const START = "/run/bootstrap/START.PRIVATE.json", BOOT = "/run/bootstrap";
const OWNER = "/opt/local-unit-native-owner.js", BROKER = "/opt/local-unit-diagnostic-broker.js";
const POSTGREST = "/opt/postgrest-pinned", PUBLIC = "/run/helmut-local-unit-diagnostic";
const PRIVATE = "/run/helmut-local-unit-diagnostic-owner";
const TOKEN = BOOT + "/RUNTIME_TOKEN.PRIVATE", REST_CONFIG = BOOT + "/POSTGREST.PRIVATE.conf";
const QUALIFICATION = BOOT + "/OWNER_QUALIFICATION.PRIVATE.json";
const SOURCE_QUALIFICATION = BOOT + "/SOURCE_QUALIFICATION.PRIVATE.json", HMAC_KEY = BOOT + "/ORIGINAL_HMAC.PRIVATE.bin";
const MAX_LOG = 128 * 1024, MAX_LIFETIME = 180000, STARTUP_MS = 15000, STOP_MS = 4500;
const DIAGNOSTIC_OWNER_CODES = new Set(["file-drift", "cgroup-canonical", "actual-cgroup", "pid", "live-process",
  "actual-process-root-uid-gid", "actual-process-capdrop", "actual-process-no-new-privileges", "actual-process-pid-namespace",
  "actual-process-read-drift", "loopback-listener", "listener-process-owner", "active-process-binding", "active-listener-binding", "owner-window-expired",
  "source-supervisor-qualification", "source-qualification-window", "utc", "actual-node-budget", "live-observation-required",
  "actual-broker-observation-binding", "private-observation-cap", "stop-process-identity"]);
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
function nodeBudget(value = { nodeVersion: process.version, execArgv: [...process.execArgv], oldSpaceMiB: 384,
  semiSpaceMiB: 16, heapSizeLimitBytes: v8.getHeapStatistics().heap_size_limit }) {
  need(exact(value, ["nodeVersion", "execArgv", "oldSpaceMiB", "semiSpaceMiB", "heapSizeLimitBytes"])
    && value.nodeVersion === "v24.19.0" && Array.isArray(value.execArgv) && value.execArgv.length === 2
    && value.execArgv.includes("--max-old-space-size=384") && value.execArgv.includes("--max-semi-space-size=16")
    && value.oldSpaceMiB === 384 && value.semiSpaceMiB === 16 && Number.isSafeInteger(value.heapSizeLimitBytes)
    && value.heapSizeLimitBytes >= 384 * 1048576 && value.heapSizeLimitBytes <= 448 * 1048576, "actual-node-budget");
  return value;
}
function sourceBinding(c) {
  const o = c.originalService, b = o?.publicSourceBinding;
  need(exact(o, ["hmacKeyPath", "sourceQualificationPin", "publicSourceBinding"])
    && o.hmacKeyPath === HMAC_KEY && o.sourceQualificationPin?.path === SOURCE_QUALIFICATION, "original-private-paths");
  pinShape(o.sourceQualificationPin, SOURCE_QUALIFICATION);
  need(exact(b, ["schema", "operationId", "commandHash", "database", "socketPath", "containerId", "pidNamespace", "supervisor", "service", "measuredCgroup", "hmacKeySHA256"])
    && b.schema === "helmut-local-unit-original-source-binding/1" && b.operationId === c.operationId
    && b.commandHash === c.commandHash && b.database === c.database && b.socketPath === "/ram/helmut-original-write-bridge.sock"
    && /^[a-f0-9]{64}$/.test(b.containerId) && /^pid:\[[1-9][0-9]*\]$/.test(b.pidNamespace)
    && /^[a-f0-9]{64}$/.test(b.hmacKeySHA256), "original-source-binding");
  for (const p of [b.supervisor, b.service]) need(p?.uid === 1000 && Number.isSafeInteger(p.pid) && p.pid > 0
    && /^[0-9]+$/.test(p.startTicks), "source-observed-process");
  need(exact(b.supervisor, ["uid", "pid", "startTicks"]) && b.supervisor.pid !== b.service.pid
    && exact(b.service, ["uid", "pid", "startTicks", "exePin", "codePin", "configPin", "nodeBudget"]), "source-process-shape");
  for (const p of [b.service.exePin, b.service.codePin, b.service.configPin]) pinShape(p);
  nodeBudget(b.service.nodeBudget);
  need(exact(b.measuredCgroup, ["device", "inode", "procMembership"])
    && b.measuredCgroup.device === c.measuredCgroup.device && b.measuredCgroup.inode === c.measuredCgroup.inode
    && typeof b.measuredCgroup.procMembership === "string" && /^0::\/[^\0\r\n]*\n$/.test(b.measuredCgroup.procMembership), "source-measured-cgroup");
  return b;
}
function sourceQualification(c, q, now = Date.now(), fresh = false) {
  need(exact(q, ["schema", "operationId", "commandHash", "database", "issuedAtUTC", "expiresAtUTC", "publicSourceBinding"])
    && q.schema === "helmut-local-unit-source-supervisor-qualification/1" && q.operationId === c.operationId
    && q.commandHash === c.commandHash && q.database === c.database
    && isDeepStrictEqual(q.publicSourceBinding, c.originalService.publicSourceBinding), "source-supervisor-qualification");
  const issued = utc(q.issuedAtUTC), expires = utc(q.expiresAtUTC);
  need(issued <= now && now < expires && expires > issued && expires - issued <= MAX_LIFETIME
    && (!fresh || now - issued <= 15000), "source-qualification-window");
  return expires;
}
function validateConfig(value, now = Date.now()) {
  need(exact(value, ["schema", "mode", "operationId", "commandHash", "database", "issuedAtUTC", "expiresAtUTC",
    "measuredCgroup", "pins", "authenticator", "postgrestPort", "legacy", "originalService"])
    && value.schema === "helmut-local-unit-native-owner-start/2" && value.mode === "owner-local-no500"
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
  sourceBinding(value); return value;
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
  need(Number(s.slice(0, s.indexOf(" "))) === pid && !["Z", "X"].includes(f[0]) && /^[0-9]+$/.test(f[19]) && /^[0-9]+$/.test(f[1]), "live-process");
  const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
  const ids = label => {
    const m = new RegExp("^" + label + ":[\\t ]+([0-9\\t ]+)$", "m").exec(status), values = m?.[1].trim().split(/\s+/).map(Number);
    need(values?.length === 4 && values.every(value => value === 0), "actual-process-root-uid-gid"); return Object.freeze(values);
  };
  const uids = ids("Uid"), gids = ids("Gid");
  for (const key of ["CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb"])
    need(new RegExp("^" + key + ":\\s*0+\\s*$", "m").test(status), "actual-process-capdrop");
  need(/^NoNewPrivs:\s*1\s*$/m.test(status), "actual-process-no-new-privileges");
  const pidNamespace = fs.readlinkSync(`/proc/${pid}/ns/pid`); need(/^pid:\[[1-9][0-9]*\]$/.test(pidNamespace), "actual-process-pid-namespace");
  const observed = { pid, parentPID: Number(f[1]), startTicks: f[19], exe: fs.readlinkSync(`/proc/${pid}/exe`),
    membership: fs.readFileSync(`/proc/${pid}/cgroup`, "utf8"), pidNamespace, uids, gids, capabilitiesZero: true, noNewPrivileges: true };
  const after = fs.readFileSync(`/proc/${pid}/stat`, "utf8"), fields = after.slice(after.lastIndexOf(")") + 2).trim().split(/\s+/);
  need(Number(after.slice(0, after.indexOf(" "))) === pid && !["Z", "X"].includes(fields[0])
    && fields[1] === f[1] && fields[19] === f[19], "actual-process-read-drift"); return Object.freeze(observed);
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
  const budget = nodeBudget();
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
  return { self, nodeBudget: budget, noNewPrivilegesObserved: /^NoNewPrivs:\s*1\s*$/m.test(status) };
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
  let child = null, broker = null, upstream = null, c = null, timer = null, guard = null, heartbeat = null, closing = false, stopPromise = null;
  let failure = null, forced = false, childClosed = false, childExited = false, exitCode = null, exitSignal = null;
  let stdoutEOF = false, stderrEOF = false, logBytes = 0, logOverflow = false, streamError = false;
  const stamp = () => Object.freeze({ observedAtUTC: new Date().toISOString(), monotonicNs: process.hrtime.bigint().toString() });
  const started = Object.freeze({ observedAtUTC: new Date().toISOString(), monotonicNs: began.toString() });
  let firstFailure = null, childExit = null, closeStarted = null, closeIntent = null;
  const stopSignals = [];
  let logPending = 0, logQueuedBytes = 0, logWrittenBytes = 0, logForwardError = false;
  const logSink = process.stderr;
  function rememberFailure(code, error = null) {
    if (failure) return;
    let detail = null;
    try { const value = Object.getOwnPropertyDescriptor(error || {}, "ownerCode")?.value;
      if (DIAGNOSTIC_OWNER_CODES.has(value)) detail = value; } catch { /* No getters or arbitrary error text in SAFE metadata. */ }
    failure = code; firstFailure = Object.freeze({ code, ownerCode: detail, ...stamp() });
  }
  let resolveDone; const done = new Promise(resolve => { resolveDone = resolve; });
  let resolveCancelled; const cancelled = new Promise(resolve => { resolveCancelled = resolve; });
  const setCloseIntent = (kind, detail = {}) => { closeIntent ||= Object.freeze({ kind, ...detail, ...stamp() }); };
  const failed = (code, error = null) => { rememberFailure(code, error); setCloseIntent("failure", { code }); if (!closing) void close(); };
  const logError = () => { logForwardError = true; for (const stream of [child?.stdout, child?.stderr]) stream?.resume(); failed("private-log-stream"); };
  const logDrain = () => { for (const stream of [child?.stdout, child?.stderr]) stream?.resume(); };
  function forwardLog(bytes) {
    logBytes += bytes.length;
    const data = bytes.subarray(0, Math.max(0, MAX_LOG - logQueuedBytes));
    if (data.length && !logForwardError) {
      logPending++; logQueuedBytes += data.length;
      let callbackCalled = false;
      const completed = error => { if (callbackCalled) return; callbackCalled = true; logPending--;
        if (error) logError(); else logWrittenBytes += data.length; };
      try {
        // Only this PRIVATE pipe receives raw REST bytes. The global byte cap
        // also bounds queued writes when the Host temporarily applies pressure.
        if (!logSink.write(data, completed)) for (const stream of [child.stdout, child.stderr]) stream.pause();
      } catch { completed(true); }
    }
    if (logBytes > MAX_LOG) { logOverflow = true; failed("child-log-cap"); }
  }
  const records = [];
  const onSignal = signal => { setCloseIntent("owner-signal", { signal }); void close(); };
  const onTerm = () => onSignal("SIGTERM"), onInt = () => onSignal("SIGINT");
  process.once("SIGTERM", onTerm); process.once("SIGINT", onInt);
  async function close() {
    if (stopPromise) return stopPromise;
    setCloseIntent("programmatic"); closing = true; closeStarted = stamp(); resolveCancelled(); clearTimeout(timer); clearInterval(guard); clearInterval(heartbeat);
    stopPromise = (async () => {
      let brokerSettled = false;
      const brokerStop = (broker ? Promise.resolve().then(() => broker.close()).catch(() => { rememberFailure("broker-close"); }) : Promise.resolve())
        .finally(() => { brokerSettled = true; });
      function signal(sig) {
        if (child && !childExited) {
          const attempt = { signal: sig, pid: child.pid, ...stamp(), identityVerified: false, killReturned: null };
          try { const observed = processInfo(child.pid); need(!upstream || observed.startTicks === upstream.startTicks, "stop-process-identity");
            attempt.identityVerified = true; attempt.startTicks = observed.startTicks; attempt.killReturned = child.kill(sig); }
          catch (error) { rememberFailure("child-signal-or-identity", error); }
          finally { stopSignals.push(Object.freeze(attempt)); }
        }
      }
      if (child && !childClosed) {
        signal("SIGTERM"); const until = process.hrtime.bigint() + 2500000000n;
        while (!childClosed && process.hrtime.bigint() < until) await pause(20);
        if (!childClosed) { forced = true; rememberFailure("forced-child-stop"); signal("SIGKILL"); }
        const final = process.hrtime.bigint() + 1000000000n; while (!childClosed && process.hrtime.bigint() < final) await pause(20);
      }
      // Share the existing 500ms broker-close allowance; do not extend STOP_MS.
      const drain = (async () => { const until = process.hrtime.bigint() + 500000000n;
        while (logPending && process.hrtime.bigint() < until) await pause(10); })();
      await bounded(Promise.all([brokerStop, drain]), 500);
      if (!brokerSettled) rememberFailure("broker-close-deadline");
      if (logPending) { rememberFailure("private-log-drain-deadline"); logForwardError = true; logSink?.destroy?.(); }
      logSink?.removeListener?.("drain", logDrain);
      if (!logForwardError) logSink?.removeListener?.("error", logError);
      const logComplete = !logForwardError && logPending === 0 && logWrittenBytes === logBytes;
      if (!logComplete) rememberFailure("private-log-incomplete");
      if (child && (!childClosed || !childExited)) rememberFailure("child-close-deadline");
      if (child && (!stdoutEOF || !stderrEOF)) rememberFailure("child-pipe-eof");
      if (child && !(exitCode === 0 && exitSignal === null || exitCode === null && exitSignal === "SIGTERM")) rememberFailure("child-exit-status");
      const clean = !failure && !forced && childClosed && childExited && stdoutEOF && stderrEOF && !streamError && !logOverflow
        && logComplete && (exitCode === 0 && exitSignal === null || exitCode === null && exitSignal === "SIGTERM");
      const report = Object.freeze({ schema: "helmut-local-unit-native-owner-stop/1", cleanShutdown: clean,
        childClosed, childExited, childStdoutEOF: stdoutEOF, childStderrEOF: stderrEOF, logBytes, logOverflow,
        streamError, forcedKill: forced, childExitCode: exitCode, childExitSignal: exitSignal, childTerminatedBySIGTERM: exitSignal === "SIGTERM",
        logForwardedBytes: logWrittenBytes, privateLogForwardingComplete: logComplete,
        diagnostics: Object.freeze({ started, firstFailure, childExit, closeIntent, closeStarted,
          stopSignals: Object.freeze([...stopSignals]), closed: stamp() }),
        failed: Boolean(failure), unitExecuted: false, full500: false });
      process.removeListener("SIGTERM", onTerm); process.removeListener("SIGINT", onInt);
      resolveDone(report); return report;
    })();
    return stopPromise;
  }
  try {
    need(configPath === START, "fixed-start-path"); process.umask(0o077);
    const startRecord = privateJSON(START); c = validateConfig(startRecord.value); records.push(startRecord);
    need(logSink && typeof logSink.write === "function" && typeof logSink.on === "function", "private-log-pipe-required");
    logSink.on("error", logError); logSink.on("drain", logDrain);
    const sourceRecord = privateJSON(c.originalService.sourceQualificationPin.path, c.originalService.sourceQualificationPin);
    const sourceExpires = sourceQualification(c, sourceRecord.value, Date.now(), true); records.push(sourceRecord);
    const keyRecord = readFile(c.originalService.hmacKeyPath, 32, { privateFile: true });
    need(keyRecord.pin.bytes === 32 && keyRecord.pin.sha256 === c.originalService.publicSourceBinding.hmacKeySHA256, "original-key-binding");
    records.push(keyRecord);
    const remainingLifetime = Math.min(MAX_LIFETIME, utc(c.expiresAtUTC) - Date.now(), sourceExpires - Date.now());
    need(remainingLifetime >= STARTUP_MS + STOP_MS, "source-remaining-window");
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
    child.once("error", () => { rememberFailure("child-spawn"); });
    child.once("exit", (code, signal) => { childExited = true; exitCode = code; exitSignal = signal;
      childExit = Object.freeze({ code, signal, ...stamp() }); if (!closing) failed("unexpected-child-exit"); });
    child.once("close", () => { childClosed = true; });
    for (const [stream, which] of [[child.stdout, "stdout"], [child.stderr, "stderr"]]) {
      stream.on("data", forwardLog);
      stream.once("end", () => { if (which === "stdout") stdoutEOF = true; else stderrEOF = true; });
      stream.once("error", () => { streamError = true; failed("child-stream"); });
    }
    const startupLeft = () => Math.min(STARTUP_MS - Number(process.hrtime.bigint() - began) / 1000000,
      Number(lifetimeEnd - process.hrtime.bigint()) / 1000000 - STOP_MS);
    while (!spawned) { need(!failure && !closing && startupLeft() > 0, "spawn-deadline-or-failure"); await pause(20); }
    upstream = processInfo(child.pid);
    need(upstream.exe === POSTGREST && upstream.membership === c.measuredCgroup.procMembership
      && upstream.parentPID === observed.self.pid && upstream.pidNamespace === observed.self.pidNamespace, "actual-upstream-process");
    while (!ownListener(child.pid, c.postgrestPort)) {
      need(!failure && !closing && !childExited && startupLeft() > 0, "listener-deadline-or-exit");
      const p = processInfo(child.pid); need(p.startTicks === upstream.startTicks && p.exe === POSTGREST
        && p.membership === c.measuredCgroup.procMembership, "upstream-start-identity"); await pause(25);
    }
    const group = { path: c.measuredCgroup.path, device: c.measuredCgroup.device, inode: c.measuredCgroup.inode,
      procMembership: { broker: observed.self.membership, upstream: upstream.membership } };
    const endpoint = { port: c.postgrestPort, pid: upstream.pid, startTicks: upstream.startTicks,
      exePin: c.pins.postgrest, configPin: configuration.pin, runtimeTokenPath: TOKEN };
    records.push(writePrivate(QUALIFICATION, JSON.stringify({ schema: "helmut-local-unit-diagnostic-owner-qualification/2",
      operationId: c.operationId, commandHash: c.commandHash, database: c.database, brokerCodeSHA256: c.pins.broker.sha256,
      upstream: endpoint, measuredCgroup: group, legacy: c.legacy, originalService: c.originalService }) + "\n"));
    const Broker = require(BROKER);
    const brokerStarting = Broker.start({ schema: "helmut-local-unit-diagnostic-broker-config/2", operationId: c.operationId,
      commandHash: c.commandHash, database: c.database, upstream: endpoint, measuredCgroup: group,
      legacy: c.legacy, originalService: c.originalService, ownerQualificationPin: records[records.length - 1].pin });
    // A late listen result is closed, never adopted or retried after cancellation.
    void brokerStarting.then(value => { if (closing) void value.close().catch(() => {}); }, () => {});
    const brokerResult = await bounded(brokerStarting, Math.max(1, startupLeft()), cancelled);
    need(brokerResult.done, "broker-start-deadline-unknown"); broker = brokerResult.value;
    need(!failure && !closing && startupLeft() > 0, "broker-start-deadline-or-exit");
    function check() {
      for (const r of records) unchanged(r);
      actualGroup(c.measuredCgroup); const self = processInfo(process.pid), p = processInfo(child.pid);
      need(isDeepStrictEqual(self, observed.self) && isDeepStrictEqual(p, upstream), "active-process-binding");
      need(ownListener(child.pid, c.postgrestPort), "active-listener-binding");
      need(Date.now() < utc(c.expiresAtUTC) && process.hrtime.bigint() < lifetimeEnd, "owner-window-expired");
      sourceQualification(c, sourceRecord.value);
      return { owner: self, upstream: p };
    }
    function observe() {
      try {
        need(arguments.length === 0 && !closing && !failure && typeof broker.observe === "function", "live-observation-required");
        const actual = check(), proof = broker.observe(), budget = nodeBudget();
        need(isDeepStrictEqual(proof.broker, actual.owner) && isDeepStrictEqual(proof.upstream, actual.upstream)
          && proof.listenerObserved === true && proof.brokerCodeSHA256 === c.pins.broker.sha256
          && proof.upstreamExeSHA256 === c.pins.postgrest.sha256 && proof.upstreamConfigSHA256 === configuration.pin.sha256
          && isDeepStrictEqual({ ...proof.measuredCgroup }, { path: c.measuredCgroup.path, device: c.measuredCgroup.device, inode: c.measuredCgroup.inode }), "actual-broker-observation-binding");
        const value = Object.freeze({ schema: "helmut-local-unit-native-owner-observation/1", operationId: c.operationId,
          commandHash: c.commandHash, observedAtUTC: new Date().toISOString(), ...actual,
          measuredCgroup: proof.measuredCgroup, actualNodeBudget: Object.freeze({ ...budget, execArgv: Object.freeze([...budget.execArgv]) }),
          pins: Object.freeze({ owner: c.pins.owner.sha256, broker: c.pins.broker.sha256, node: c.pins.node.sha256,
            upstreamExe: c.pins.postgrest.sha256, upstreamConfig: configuration.pin.sha256 }),
          brokerListenerObserved: true, unitExecutionQualified: false, full500Qualified: false });
        need(Buffer.byteLength(JSON.stringify(value)) <= 2048, "private-observation-cap"); return value;
      } catch (error) { if (!closing) failed("live-observation-failed", error); throw safeError(error); }
    }
    observe(); guard = setInterval(() => { try { check(); } catch (error) { failed("active-runtime-binding", error); } }, 250);
    timer = setTimeout(() => { setCloseIntent("lifetime"); void close(); }, Math.max(0, Number(lifetimeEnd - process.hrtime.bigint()) / 1000000 - STOP_MS));
    const ready = Object.freeze({ schema: "helmut-local-unit-native-owner-ready/2", ownerPID: process.pid,
      ownerStartTicks: observed.self.startTicks, upstreamPID: upstream.pid, upstreamStartTicks: upstream.startTicks,
      measuredCgroup: group, ownerCodePin: c.pins.owner, brokerCodePin: c.pins.broker, upstreamExePin: c.pins.postgrest,
      upstreamConfigPin: configuration.pin, nodeExePin: c.pins.node, trustPublicPath: PUBLIC + "/trust.json",
      nodeBudget: observed.nodeBudget, originalService: c.originalService.publicSourceBinding,
      noNewPrivilegesObserved: observed.noNewPrivilegesObserved, databaseAuthorityQualified: false,
      databaseConnectionConfirmed: false, unitExecutionAuthorized: false, full500: false });
    if (require.main === module) heartbeat = setInterval(() => {
      try { process.stdout.write(JSON.stringify(observe()) + "\n"); } catch (error) { failed("heartbeat-observation-failed", error); }
    }, 5000);
    function controlReadTracePin() {
      need(arguments.length === 0 && closing && typeof broker.controlReadTracePin === "function", "private-trace-not-closed");
      return broker.controlReadTracePin();
    }
    return Object.freeze({ ready, close, done, observe, controlReadTracePin });
  } catch (error) { rememberFailure("startup-failed", error); setCloseIntent("failure", { code: "startup-failed" }); await close(); throw safeError(error); }
}
module.exports = Object.freeze({ start });
if (require.main === module) {
  (async () => {
    need(process.argv.length === 3 && process.argv[2] === "--start-own-native-endpoint", "explicit-cli-only");
    const running = await start();
    process.stdout.write(JSON.stringify(running.ready) + "\n");
    const stopped = await running.done;
    process.stdout.write(JSON.stringify(stopped) + "\n"); process.exitCode = stopped.cleanShutdown ? 0 : 1;
  })().catch(() => { process.stderr.write("local-unit-native-owner-start-or-runtime-failed\n"); process.exitCode = 1; });
}
