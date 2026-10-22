"use strict";
// Offline only: VM exposes pure helpers locally. No child, socket, SQL or
// production/provider action can be started by this test's substituted modules.
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path"), crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const filename = path.join(__dirname, "local-unit-native-owner.js"), source = fs.readFileSync(filename, "utf8");
const now = Date.parse("2026-10-22T12:00:00.000Z"), suffix = "b".repeat(32);
let tests = 0;
function check(name, work) { work(); tests++; }
function rejected(work) { let caught = false; try { work(); } catch (e) { caught = /^local-unit-native-owner-[a-z0-9-]+$/.test(e.message); } assert.ok(caught, "expected bounded symbolic rejection"); }
function load({ filesystem = fs, processStub = {}, childModule = null, brokerModule = null, hooks = null, timers = null, mainToggle = null } = {}) {
  let spawns = 0;
  const fakeProcess = { execPath: "/opt/node-pinned", pid: 123, env: {}, hrtime: process.hrtime, version: "v24.19.0",
    execArgv: ["--max-old-space-size=384", "--max-semi-space-size=16"],
    umask() {}, once() {}, removeListener() {}, ...processStub };
  const mod = { exports: {} };
  const sandbox = { Buffer, URL, setTimeout: timers?.setTimeout || setTimeout, clearTimeout: timers?.clearTimeout || clearTimeout,
    setInterval: timers?.setInterval || setInterval, clearInterval: timers?.clearInterval || clearInterval, console: { log() {}, error() {} },
    process: fakeProcess, module: mod, __filename: "/opt/local-unit-native-owner.js", __testHooks: hooks,
    require(name) {
      if (name === "node:fs") return filesystem;
      if (name === "node:v8") return { getHeapStatistics: () => ({ heap_size_limit: 432 * 1048576 }) };
      if (name === "node:child_process") return childModule || { spawn() { spawns++; throw Error("offline-spawn-forbidden"); } };
      if (name === "/opt/local-unit-diagnostic-broker.js" && brokerModule) return brokerModule;
      if (["node:path", "node:crypto", "node:util"].includes(name)) return require(name);
      throw Error("offline-unexpected-require");
    } };
  Object.defineProperty(sandbox.require, "main", { get: () => mainToggle?.enabled ? mod : null });
  const patch = hooks ? "\n({privateJSON,readFile,writePrivate,environmentCheck,processInfo,ownListener,actualGroup,unchanged}=__testHooks);" : "";
  vm.runInNewContext(source + patch + "\nmodule.exports={start,validateConfig,restConfig,runtimeJWT,pinShape,mountRows,mountFor,readFile:(filename,cap,options)=>readFile(filename,cap,JSON.parse(JSON.stringify(options))),environmentCheck,bounded,safeError,nodeBudget,sourceQualification,processInfo};", sandbox);
  return { api: mod.exports, get spawns() { return spawns; } };
}
function configuration() {
  const pin = (file, h) => ({ path: file, bytes: 120, sha256: h.repeat(64) });
  const operationId = "localUnitDiagnostic-" + suffix, commandHash = "a".repeat(64), database = "helmut_unit_diagnostic_" + suffix;
  const publicSourceBinding = { schema: "helmut-local-unit-original-source-binding/1", operationId, commandHash, database,
    socketPath: "/ram/helmut-original-write-bridge.sock", containerId: "9".repeat(64), pidNamespace: "pid:[99]",
    supervisor: { uid: 1000, pid: 77, startTicks: "10" }, service: { uid: 1000, pid: 78, startTicks: "11",
      exePin: pin("/opt/node-pinned", "f"), codePin: pin("/bench/local-unit-original-service.js", "c"),
      configPin: pin("/bench/ORIGINAL_SERVICE_CONFIG.PRIVATE.json", "d"),
      nodeBudget: { nodeVersion: "v24.19.0", execArgv: ["--max-old-space-size=384", "--max-semi-space-size=16"],
        oldSpaceMiB: 384, semiSpaceMiB: 16, heapSizeLimitBytes: 432 * 1048576 } },
    measuredCgroup: { device: 29, inode: 12345, procMembership: "0::/\n" }, hmacKeySHA256: "6".repeat(64) };
  return { schema: "helmut-local-unit-native-owner-start/2", mode: "owner-local-no500",
    operationId: "localUnitDiagnostic-" + suffix, commandHash: "a".repeat(64), database: "helmut_unit_diagnostic_" + suffix,
    issuedAtUTC: new Date(now).toISOString(), expiresAtUTC: new Date(now + 180000).toISOString(),
    measuredCgroup: { path: "/sys/fs/cgroup/owned", device: 29, inode: 12345, procMembership: "0::/\n" },
    pins: { owner: pin("/opt/local-unit-native-owner.js", "c"), broker: pin("/opt/local-unit-diagnostic-broker.js", "d"),
      postgrest: pin("/opt/postgrest-pinned", "e"), node: pin("/opt/node-pinned", "f") },
    originalService: { hmacKeyPath: "/run/bootstrap/ORIGINAL_HMAC.PRIVATE.bin",
      sourceQualificationPin: pin("/run/bootstrap/SOURCE_QUALIFICATION.PRIVATE.json", "8"), publicSourceBinding },
    authenticator: { username: "helmut_ud_authenticator_" + suffix,
      passwordHex: "12".repeat(32), jwtSecretHex: "ab".repeat(32) }, postgrestPort: 3456, legacy: { tables: ["profiles"], rpcs: [] } };
}
const { api } = load();
check("accept owned scope only", () => { assert.ok(api.validateConfig(configuration(), now)); });
check("strict start keys and no broad owner role", () => {
  for (const mutate of [c => { c.mode = "full500"; }, c => { c.database = "postgres"; },
    c => { c.operationId = "localUnitDiagnostic-" + "c".repeat(32); }, c => { c.commandHash = "bad"; },
    c => { c.extra = true; }, c => { c.authenticator.username = "postgres"; },
    c => { c.authenticator.role = "owner"; }]) { const c = configuration(); mutate(c); rejected(() => api.validateConfig(c, now)); }
});
check("v2 binds observed UID1000 service without assuming root process access", () => {
  for (const change of [c => { c.schema = "helmut-local-unit-native-owner-start/1"; }, c => { delete c.originalService; },
    c => { c.originalService.hmacKeyPath = "/tmp/key"; }, c => { c.originalService.sourceQualificationPin.path = "/tmp/qualification"; },
    c => { c.originalService.publicSourceBinding.commandHash = "0".repeat(64); },
    c => { c.originalService.publicSourceBinding.service.uid = 0; }, c => { c.originalService.publicSourceBinding.supervisor.uid = 0; },
    c => { c.originalService.publicSourceBinding.measuredCgroup.inode++; },
    c => { c.originalService.publicSourceBinding.service.nodeBudget.heapSizeLimitBytes = 1024 * 1048576; }]) {
    const c = configuration(); change(c); rejected(() => api.validateConfig(c, now));
  }
});
check("actual heap receipt and exact startup budgets required for both Node configurations", () => {
  assert.ok(api.nodeBudget().heapSizeLimitBytes === 432 * 1048576);
  const valid = configuration().originalService.publicSourceBinding.service.nodeBudget;
  assert.ok(api.nodeBudget(valid));
  for (const change of [x => { x.heapSizeLimitBytes = 0; }, x => { x.heapSizeLimitBytes = 449 * 1048576; },
    x => { x.nodeVersion = "v22.0.0"; }, x => { x.execArgv.push("--max-old-space-size=4096"); }, x => { x.semiSpaceMiB = 0; }]) {
    const value = structuredClone(valid); change(value); rejected(() => api.nodeBudget(value));
  }
  rejected(() => load({ processStub: { execArgv: [] } }).api.nodeBudget());
});
check("source qualification is fresh scoped immutable and cannot extend its deadline", () => {
  const c = configuration(), q = { schema: "helmut-local-unit-source-supervisor-qualification/1", operationId: c.operationId,
    commandHash: c.commandHash, database: c.database, issuedAtUTC: c.issuedAtUTC, expiresAtUTC: c.expiresAtUTC,
    publicSourceBinding: c.originalService.publicSourceBinding };
  assert.ok(api.sourceQualification(c, q, now, true) === now + 180000);
  for (const [value, at] of [[q, now + 15001], [q, now + 180000], [{ ...q, commandHash: "0".repeat(64) }, now],
    [{ ...q, publicSourceBinding: { ...q.publicSourceBinding, containerId: "0".repeat(64) } }, now],
    [{ ...q, expiresAtUTC: new Date(now + 180001).toISOString() }, now]]) rejected(() => api.sourceQualification(c, value, at, true));
});
check("fresh finite UTC window", () => {
  for (const [issued, expires, current] of [[now + 1, now + 180000, now], [now - 10001, now + 120000, now],
    [now, now + 180001, now], [now, now + 19000, now], [now, now + 180000, NaN]]) {
    const c = configuration(); c.issuedAtUTC = new Date(issued).toISOString(); c.expiresAtUTC = new Date(expires).toISOString();
    rejected(() => api.validateConfig(c, current));
  }
  const c = configuration(); c.issuedAtUTC = "2026-10-22"; rejected(() => api.validateConfig(c, now));
});
check("fixed code aliases and bounded pins", () => {
  for (const mutate of [c => { c.pins.broker.path = "/tmp/broker.js"; }, c => { c.pins.postgrest.path = "https://example.invalid"; },
    c => { c.pins.owner.bytes = 268435457; }, c => { c.pins.node.sha256 = "G".repeat(64); },
    c => { c.pins.node.path = "/opt/../node"; }, c => { c.pins.broker.flag = true; }]) {
    const c = configuration(); mutate(c); rejected(() => api.validateConfig(c, now));
  }
});
check("private local credentials cannot inject config or URI", () => {
  for (const mutate of [c => { c.authenticator.passwordHex = "0".repeat(64); },
    c => { c.authenticator.passwordHex = "bad\nserver-host=0.0.0.0"; },
    c => { c.authenticator.jwtSecretHex = c.authenticator.passwordHex; },
    c => { c.authenticator.jwtSecretHex = "AA".repeat(32); }, c => { c.postgrestPort = 5432; },
    c => { c.postgrestPort = 1023; }, c => { c.postgrestPort = 65536; }]) {
    const c = configuration(); mutate(c); rejected(() => api.validateConfig(c, now));
  }
});
check("actual cgroup identity shape", () => {
  for (const mutate of [c => { c.measuredCgroup.inode = 0; }, c => { c.measuredCgroup.device = -1; },
    c => { c.measuredCgroup.procMembership = "0::/\n0::/other\n"; },
    c => { c.measuredCgroup.procMembership = "0::/"; }, c => { c.measuredCgroup.path = "relative"; }]) {
    const c = configuration(); mutate(c); rejected(() => api.validateConfig(c, now));
  }
});
check("legacy RPC admission requires exact private root producer pins", () => {
  const c = configuration();
  const r = { name: "helmut_auth_state_graph_read_v1", identityArguments: "jsonb", oid: "1234", prosrcSHA256: "d".repeat(64),
    qualificationPin: { path: "/run/bootstrap/READ_GRAPH.PRIVATE.json", bytes: 512, sha256: "c".repeat(64) }, requestKeys: ["id", "readNonce"] };
  c.legacy.rpcs = [r]; assert.ok(api.validateConfig(c, now));
  for (const mutate of [x => { x.name = "helmut_auth_state_graph_write_v1"; },
    x => { x.qualificationPin.path = "/tmp/qualification.json"; }, x => { x.qualificationPin.path = "/run/bootstrap/START.PRIVATE.json"; },
    x => { x.requestKeys = ["id", "id"]; }, x => { x.oid = "0"; }, x => { x.readOnly = true; }]) {
    const d = configuration(); d.legacy.rpcs = [structuredClone(r)]; mutate(d.legacy.rpcs[0]); rejected(() => api.validateConfig(d, now));
  }
  c.legacy.rpcs = [r, r]; rejected(() => api.validateConfig(c, now));
});
check("PostgREST target and role are fixed with all recovery disabled", () => {
  const c = configuration(), text = api.restConfig(c);
  assert.ok(text.includes("@127.0.0.1:5432/" + c.database + "?sslmode=disable&connect_timeout=5"));
  for (const required of ['db-schemas = "public"', 'server-host = "127.0.0.1"', 'db-config = false',
    'db-channel-enabled = false', 'db-pool-automatic-recovery = false', 'openapi-mode = "disabled"',
    'db-anon-role = "helmut_ud_runtime_' + suffix + '"']) assert.ok(text.includes(required), "required local config absent");
  assert.ok(!text.includes("helmut_ud_owner_")); assert.ok(text.split("\n").filter(x => x.startsWith("db-uri =")).length === 1);
});
check("JWT has exact runtime claims and genuine HS256 signature", () => {
  const c = configuration(), token = api.runtimeJWT(c, now), parts = token.split(".");
  const header = JSON.parse(Buffer.from(parts[0], "base64url")), body = JSON.parse(Buffer.from(parts[1], "base64url"));
  assert.ok(JSON.stringify(header) === JSON.stringify({ alg: "HS256", typ: "JWT" }));
  assert.ok(Object.keys(body).sort().join("|") === ["role", "aud", "iat", "nbf", "exp"].sort().join("|"));
  assert.ok(body.role === "helmut_ud_runtime_" + suffix && body.aud === "helmut-local-unit-diagnostic"
    && body.iat === now / 1000 && body.nbf === now / 1000 && body.exp === (now + 180000) / 1000);
  const expected = crypto.createHmac("sha256", c.authenticator.jwtSecretHex).update(parts[0] + "." + parts[1]).digest();
  assert.ok(crypto.timingSafeEqual(expected, Buffer.from(parts[2], "base64url")));
  assert.ok(!JSON.stringify(body).includes(c.authenticator.username));
});
check("mount parser selects actual nested mount and preserves RO", () => {
  const rows = api.mountRows("1 0 0:1 / / rw - overlay overlay rw\n2 1 0:2 / /opt/node-pinned ro - ext4 /dev/a rw\n");
  assert.ok(api.mountFor("/opt/node-pinned", rows).options.includes("ro"));
  assert.ok(api.mountFor("/opt/another", rows).point === "/");
  rejected(() => api.mountRows("malformed"));
});
function syntheticFile({ mode = 0o100755, uid = 1000n, writable = false, drift = false, links = 1n, privateFile = false } = {}) {
  const content = Buffer.from("offline-public-byte-pin"), file = "/opt/node-pinned"; let offset = 0, reads = 0, flags = 0, closed = false;
  const stat = { dev: 3n, ino: 9n, mode: BigInt(mode), uid, gid: uid, nlink: links, size: BigInt(content.length), mtimeNs: 1n, ctimeNs: 1n, isFile: () => true };
  const filesystem = { constants: fs.constants, realpathSync: x => x,
    lstatSync(x) { if (x === "/" || x === "/opt") return { isDirectory: () => true, isSymbolicLink: () => false, uid: 0, mode: 0o40755 };
      return { ...stat, ctimeNs: drift ? 2n : 1n }; },
    openSync(x, f) { assert.ok(x === file); flags = f; return 8; },
    fstatSync() { reads++; return { ...stat, ctimeNs: drift && reads > 1 ? 2n : 1n }; },
    readSync(fd, target) { const n = Math.min(target.length, content.length - offset); content.copy(target, 0, offset, offset + n); offset += n; return n; },
    readFileSync() { return "1 0 0:1 / / rw - overlay overlay rw\n2 1 0:2 / /opt/node-pinned " + (writable ? "rw" : "ro") + " - ext4 /dev/a rw\n"; },
    closeSync() { closed = true; } };
  const instance = load({ filesystem });
  return { run() { return instance.api.readFile(file, 1024, { privateFile, publicMode: privateFile ? null : "node",
      expected: { path: file, bytes: content.length, sha256: crypto.createHash("sha256").update(content).digest("hex") } }); },
    get closed() { return closed; }, get flags() { return flags; } };
}
check("UID1000 original node0755 accepted with RO and stable pinned FD", () => {
  const f = syntheticFile(); assert.ok(f.run().pin.bytes > 0); assert.ok(f.closed);
  assert.ok((f.flags & fs.constants.O_NOFOLLOW) !== 0 && (f.flags & fs.constants.O_NONBLOCK) !== 0);
});
check("writable mounts links FD drift and wrong private ownership are rejected", () => {
  for (const settings of [{ writable: true }, { links: 2n }, { drift: true }, { mode: 0o100777 }, { mode: 0o104755 },
    { mode: 0o100600, privateFile: true }, { mode: 0o100644, uid: 0n, privateFile: true }]) {
    const f = syntheticFile(settings); rejected(() => f.run()); assert.ok(f.closed);
  }
});
check("nonroot owner exits before reading credentials or starting processes", () => {
  const instance = load({ processStub: { getuid: () => 1000 } }); rejected(() => instance.api.environmentCheck(configuration()));
  assert.ok(instance.spawns === 0);
});
check("safe errors never expose callback or credential contents", () => {
  const e = api.safeError(Error("synthetic-private-content-must-not-escape"));
  assert.ok(e.message === "local-unit-native-owner-start-or-runtime-failed");
});
function processFixture(options = {}) {
  let statReads = 0;
  const filesystem = { readFileSync(name) {
    if (name.endsWith("/stat")) return "123 (root owner) " + Array.from({ length: 20 }, (_, i) => i === 0 ? "S"
      : i === 1 ? "1" : i === 19 ? options.drift && ++statReads > 1 ? "99" : "11" : "0").join(" ");
    if (name.endsWith("/cgroup")) return "0::/\n";
    if (name.endsWith("/status")) return (options.noUID ? "" : "Uid:\t" + (options.uid ? "1000" : "0") + "\t0\t0\t0\n")
      + (options.noGID ? "" : "Gid:\t0\t0\t0\t" + (options.gid ? "1000" : "0") + "\n")
      + ["CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb"].map(key => key + ":\t" + (options.cap && key === "CapBnd" ? "1" : "0000") + "\n").join("")
      + "NoNewPrivs:\t" + (options.nnp ? "0" : "1") + "\n";
    throw Error("offline-proc-only");
  }, readlinkSync: name => name.endsWith("/ns/pid") ? options.ns ? "unbound" : "pid:[99]" : "/opt/node-pinned" };
  return load({ filesystem }).api;
}
check("root process observation reads exact real UID GID cap NNP namespace and stable stat", () => {
  const value = processFixture().processInfo(123);
  assert.ok(value.pid === 123 && value.parentPID === 1 && value.startTicks === "11" && value.pidNamespace === "pid:[99]");
  assert.ok(value.uids.join() === "0,0,0,0" && value.gids.join() === "0,0,0,0" && value.capabilitiesZero && value.noNewPrivileges);
  assert.ok(Object.isFrozen(value) && Object.isFrozen(value.uids));
});
for (const fault of ["noUID", "uid", "noGID", "gid", "cap", "nnp", "ns", "drift"])
  check("root process " + fault + " cannot become a live observation", () => rejected(() => processFixture({ [fault]: true }).processInfo(123)));
function lifecycle({ noEOF = false, heldBroker = false, cliHeartbeat = false } = {}) {
  const p = new EventEmitter(), child = new EventEmitter(); child.pid = 456; child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  const c = configuration(), realNow = Date.now();
  c.issuedAtUTC = new Date(realNow).toISOString(); c.expiresAtUTC = new Date(realNow + 180000).toISOString();
  const state = { spawns: 0, signals: [], writes: [], brokerClosed: 0, brokerConfig: null, childEnded: false, releaseBroker: null, brokerStarting: null,
    observations: 0, brokerUnknown: false, procDrift: false, lines: [], intervals: new Map() };
  let announceBroker; state.brokerStarting = new Promise(resolve => { announceBroker = resolve; });
  function end(code = 0) { if (state.childEnded) return; state.childEnded = true; child.emit("exit", code, null);
    if (!noEOF) { child.stdout.emit("end"); child.stderr.emit("end"); } child.emit("close"); }
  child.kill = sig => { state.signals.push(sig); queueMicrotask(() => end(0)); return true; };
  const record = (file, text = "offline") => ({ pin: { path: file, bytes: Buffer.byteLength(text), sha256: crypto.createHash("sha256").update(text).digest("hex") }, identity: ["stable"] });
  const proc = pid => ({ pid, parentPID: pid === 123 ? 1 : 123, startTicks: state.procDrift ? "999" : pid === 123 ? "11" : "22",
    exe: pid === 123 ? "/opt/node-pinned" : "/opt/postgrest-pinned", membership: "0::/\n", pidNamespace: "pid:[99]",
    uids: [0, 0, 0, 0], gids: [0, 0, 0, 0], capabilitiesZero: true, noNewPrivileges: true });
  const runningBroker = { close: async () => { state.brokerClosed++; if (state.traceFailure) throw Error("VM trace unconfirmed"); },
    controlReadTracePin: () => ({ path: "/run/bootstrap/CONTROL_READ_TRACE.SAFE.jsonl", bytes: 120, sha256: "a".repeat(64), complete: !state.traceFailure }), observe() {
    state.observations++; if (state.brokerUnknown) throw Error("local-unit-broker-offline-unknown");
    return { broker: proc(123), upstream: proc(456), listenerObserved: true, brokerCodeSHA256: c.pins.broker.sha256,
      upstreamExeSHA256: c.pins.postgrest.sha256, upstreamConfigSHA256: state.brokerConfig.upstream.configPin.sha256,
      measuredCgroup: { path: c.measuredCgroup.path, device: c.measuredCgroup.device, inode: c.measuredCgroup.inode } };
  } };
  const brokerModule = { start(conf) { state.brokerConfig = conf; announceBroker();
    return heldBroker ? new Promise(resolve => { state.releaseBroker = () => resolve(runningBroker); }) : Promise.resolve(runningBroker); } };
  const sourceQ = { schema: "helmut-local-unit-source-supervisor-qualification/1", operationId: c.operationId, commandHash: c.commandHash,
    database: c.database, issuedAtUTC: c.issuedAtUTC, expiresAtUTC: c.expiresAtUTC, publicSourceBinding: c.originalService.publicSourceBinding };
  const hooks = { privateJSON: file => ({ ...record(file), value: file.endsWith("START.PRIVATE.json") ? c : sourceQ }),
    readFile: (file, cap, options) => ({ ...record(file), pin: file.endsWith("ORIGINAL_HMAC.PRIVATE.bin")
      ? { path: file, bytes: 32, sha256: c.originalService.publicSourceBinding.hmacKeySHA256 } : options.expected }),
    writePrivate: (file, text) => { state.writes.push({ file, text }); return record(file, text); },
    environmentCheck: () => ({ self: proc(123), nodeBudget: c.originalService.publicSourceBinding.service.nodeBudget, noNewPrivilegesObserved: true }), processInfo: proc,
    ownListener: () => !state.childEnded, actualGroup() {}, unchanged() {} };
  const mainToggle = { enabled: false }; let intervalId = 0;
  const timers = { setInterval(fn, delay) { const id = ++intervalId; state.intervals.set(id, { fn, delay }); return id; },
    clearInterval(id) { state.intervals.delete(id); } };
  const instance = load({ hooks, brokerModule, timers, mainToggle, processStub: { once: p.once.bind(p), removeListener: p.removeListener.bind(p),
    stdout: { write: bytes => { state.lines.push(bytes); return true; } } },
    childModule: { spawn(binary, args, options) {
      assert.ok(binary === "/opt/postgrest-pinned" && args.length === 1 && args[0] === "/run/bootstrap/POSTGREST.PRIVATE.conf");
      assert.ok(Object.keys(options.env).sort().join("|") === ["LANG", "LC_ALL", "TZ", "PATH"].sort().join("|"));
      assert.ok(options.stdio.join("|") === "ignore|pipe|pipe"); state.spawns++; queueMicrotask(() => child.emit("spawn")); return child;
    } } });
  mainToggle.enabled = cliHeartbeat;
  return { instance, c, state, child, p, end };
}
(async () => {
  const instance = load();
  await assert.rejects(instance.api.start("/tmp/untrusted.json"), e => e.message === "local-unit-native-owner-fixed-start-path");
  await assert.rejects(instance.api.start(), e => e.message === "local-unit-native-owner-owner-start-already-consumed");
  assert.ok(instance.spawns === 0); tests++;
  const canceled = Promise.resolve();
  assert.ok((await api.bounded(new Promise(() => {}), 1000, canceled)).done === false); tests++;
  assert.ok((await api.bounded(Promise.resolve(7), 1000)).value === 7); tests++;
  {
    const f = lifecycle(), running = await f.instance.api.start();
    const readyText = JSON.stringify(running.ready);
    assert.ok(!readyText.includes(f.c.authenticator.passwordHex) && !readyText.includes(f.c.authenticator.jwtSecretHex)
      && !readyText.includes(f.c.authenticator.username), "ready must contain no credential material");
    assert.ok(running.ready.ownerPID === 123 && running.ready.upstreamPID === 456
      && running.ready.schema === "helmut-local-unit-native-owner-ready/2" && running.ready.nodeBudget.heapSizeLimitBytes === 432 * 1048576
      && running.ready.originalService.service.uid === 1000
      && running.ready.databaseAuthorityQualified === false && running.ready.databaseConnectionConfirmed === false
      && running.ready.unitExecutionAuthorized === false);
    assert.ok(f.state.brokerConfig.upstream.pid === 456 && f.state.brokerConfig.upstream.startTicks === "22");
    assert.ok(f.state.brokerConfig.schema === "helmut-local-unit-diagnostic-broker-config/2"
      && f.state.brokerConfig.originalService.sourceQualificationPin.path.endsWith("SOURCE_QUALIFICATION.PRIVATE.json"));
    assert.ok(f.state.writes.length === 3 && f.state.spawns === 1);
    const result = await running.close(); assert.ok(result.cleanShutdown && !result.failed && result.childStdoutEOF && result.childStderrEOF);
    assert.ok(f.state.signals.join("|") === "SIGTERM" && f.state.brokerClosed === 1 && f.p.listenerCount("SIGTERM") === 0); tests++;
  }
  {
    const f = lifecycle({ noEOF: true }), running = await f.instance.api.start(), result = await running.close();
    assert.ok(!result.cleanShutdown && result.failed && !result.childStdoutEOF && !result.childStderrEOF && f.state.spawns === 1); tests++;
  }
  {
    const f = lifecycle(), running = await f.instance.api.start(); f.end(0); const result = await running.done;
    assert.ok(!result.cleanShutdown && result.failed && f.state.spawns === 1 && f.state.brokerClosed === 1); tests++;
  }
  {
    const f = lifecycle(), running = await f.instance.api.start(); f.child.stderr.emit("data", Buffer.alloc(128 * 1024 + 1));
    const result = await running.done; assert.ok(result.logOverflow && result.failed && !result.cleanShutdown && f.state.spawns === 1); tests++;
  }
  {
    const f = lifecycle({ heldBroker: true }), starting = f.instance.api.start();
    await f.state.brokerStarting; f.p.emit("SIGTERM");
    await assert.rejects(starting, e => /^local-unit-native-owner-[a-z0-9-]+$/.test(e.message));
    f.state.releaseBroker(); await new Promise(resolve => setTimeout(resolve, 0));
    assert.ok(f.state.spawns === 1 && f.state.brokerClosed === 1 && f.state.childEnded); tests++;
  }
  {
    const f = lifecycle(), running = await f.instance.api.start(), before = f.state.observations, value = running.observe();
    assert.ok(Object.isFrozen(running) && Object.isFrozen(value) && f.state.observations === before + 1);
    assert.ok(value.schema === "helmut-local-unit-native-owner-observation/1" && Buffer.byteLength(JSON.stringify(value)) <= 2048);
    assert.ok(value.owner.pid === 123 && value.upstream.pid === 456 && value.owner.gids.join() === "0,0,0,0"
      && value.owner.pidNamespace === value.upstream.pidNamespace && value.actualNodeBudget.oldSpaceMiB === 384
      && value.unitExecutionQualified === false && value.full500Qualified === false);
    const text = JSON.stringify(value);
    for (const privateValue of [f.c.authenticator.passwordHex, f.c.authenticator.jwtSecretHex, f.c.authenticator.username,
      "runtimeTokenPath", "publicSourceBinding", "hmacKeyPath", "ownerQualificationPin", "publicKeyPEM"])
      assert.ok(!text.includes(privateValue), "private observation must omit credential and qualification material");
    await running.close(); rejected(() => running.observe()); assert.ok(f.state.intervals.size === 0); tests++;
  }
  {
    const f = lifecycle(), running = await f.instance.api.start(); f.state.brokerUnknown = true;
    rejected(() => running.observe()); const stopped = await running.done;
    assert.ok(!stopped.cleanShutdown && stopped.failed && f.state.brokerClosed === 1 && f.state.intervals.size === 0); tests++;
  }
  {
    const f = lifecycle(), running = await f.instance.api.start(); f.state.procDrift = true;
    rejected(() => running.observe()); const stopped = await running.done;
    assert.ok(!stopped.cleanShutdown && stopped.failed && f.state.intervals.size === 0); tests++;
  }
  {
    const f = lifecycle({ cliHeartbeat: true }), running = await f.instance.api.start();
    const beats = [...f.state.intervals.values()].filter(job => job.delay === 5000); assert.ok(beats.length === 1 && f.state.lines.length === 0);
    const count = f.state.observations; beats[0].fn(); beats[0].fn();
    assert.ok(f.state.observations === count + 2 && f.state.lines.length === 2);
    assert.ok(f.state.lines.every(line => line.endsWith("\n") && line.indexOf("\n") === line.length - 1
      && JSON.parse(line).schema === "helmut-local-unit-native-owner-observation/1"));
    await running.close(); assert.ok(f.state.intervals.size === 0); tests++;
  }
  {
    const f = lifecycle({ cliHeartbeat: true }), running = await f.instance.api.start(), beat = [...f.state.intervals.values()].find(job => job.delay === 5000);
    f.state.brokerUnknown = true; beat.fn(); const stopped = await running.done;
    assert.ok(stopped.failed && !stopped.cleanShutdown && f.state.lines.length === 0 && f.state.intervals.size === 0); tests++;
  }
  {
    const f = lifecycle(), running = await f.instance.api.start(); rejected(() => running.controlReadTracePin());
    const stopped = await running.close(), pin = running.controlReadTracePin();
    assert.ok(stopped.cleanShutdown && pin.path === "/run/bootstrap/CONTROL_READ_TRACE.SAFE.jsonl" && pin.complete === true); tests++;
  }
  {
    const f = lifecycle(), running = await f.instance.api.start(); f.state.traceFailure = true;
    const stopped = await running.close(); assert.ok(stopped.failed && !stopped.cleanShutdown && running.controlReadTracePin().complete === false);
    assert.ok(stopped.childStdoutEOF && stopped.childStderrEOF && f.state.intervals.size === 0); tests++;
  }
  assert.ok(!source.includes("process.exit("), "CLI drains natural EOF after timer cleanup"); tests++;
  assert.ok(fs.readFileSync(filename, "utf8") === source, "reviewed owner code stayed stable");
  console.log("local-unit-native-owner offline: " + tests + " checks passed; native starts=0");
})().catch(() => { console.error("local-unit-native-owner offline test failed"); process.exitCode = 1; });
