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
function load({ filesystem = fs, processStub = {}, childModule = null, brokerModule = null, hooks = null } = {}) {
  let spawns = 0;
  const fakeProcess = { execPath: "/opt/node-pinned", pid: 123, env: {}, hrtime: process.hrtime,
    umask() {}, once() {}, removeListener() {}, ...processStub };
  const mod = { exports: {} };
  const sandbox = { Buffer, URL, setTimeout, clearTimeout, setInterval, clearInterval, console: { log() {}, error() {} },
    process: fakeProcess, module: mod, __filename: "/opt/local-unit-native-owner.js", __testHooks: hooks,
    require(name) {
      if (name === "node:fs") return filesystem;
      if (name === "node:child_process") return childModule || { spawn() { spawns++; throw Error("offline-spawn-forbidden"); } };
      if (name === "/opt/local-unit-diagnostic-broker.js" && brokerModule) return brokerModule;
      if (["node:path", "node:crypto", "node:util"].includes(name)) return require(name);
      throw Error("offline-unexpected-require");
    } };
  const patch = hooks ? "\n({privateJSON,readFile,writePrivate,environmentCheck,processInfo,ownListener,actualGroup,unchanged}=__testHooks);" : "";
  vm.runInNewContext(source + patch + "\nmodule.exports={start,validateConfig,restConfig,runtimeJWT,pinShape,mountRows,mountFor,readFile:(filename,cap,options)=>readFile(filename,cap,JSON.parse(JSON.stringify(options))),environmentCheck,bounded,safeError};", sandbox);
  return { api: mod.exports, get spawns() { return spawns; } };
}
function configuration() {
  const pin = (file, h) => ({ path: file, bytes: 120, sha256: h.repeat(64) });
  return { schema: "helmut-local-unit-native-owner-start/1", mode: "owner-local-no500",
    operationId: "localUnitDiagnostic-" + suffix, commandHash: "a".repeat(64), database: "helmut_unit_diagnostic_" + suffix,
    issuedAtUTC: new Date(now).toISOString(), expiresAtUTC: new Date(now + 180000).toISOString(),
    measuredCgroup: { path: "/sys/fs/cgroup/owned", device: 29, inode: 12345, procMembership: "0::/\n" },
    pins: { owner: pin("/opt/local-unit-native-owner.js", "c"), broker: pin("/opt/local-unit-diagnostic-broker.js", "d"),
      postgrest: pin("/opt/postgrest-pinned", "e"), node: pin("/opt/node-pinned", "f") },
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
function lifecycle({ noEOF = false, heldBroker = false } = {}) {
  const p = new EventEmitter(), child = new EventEmitter(); child.pid = 456; child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  const c = configuration(), realNow = Date.now();
  c.issuedAtUTC = new Date(realNow).toISOString(); c.expiresAtUTC = new Date(realNow + 180000).toISOString();
  const state = { spawns: 0, signals: [], writes: [], brokerClosed: 0, brokerConfig: null, childEnded: false, releaseBroker: null, brokerStarting: null };
  let announceBroker; state.brokerStarting = new Promise(resolve => { announceBroker = resolve; });
  function end(code = 0) { if (state.childEnded) return; state.childEnded = true; child.emit("exit", code, null);
    if (!noEOF) { child.stdout.emit("end"); child.stderr.emit("end"); } child.emit("close"); }
  child.kill = sig => { state.signals.push(sig); queueMicrotask(() => end(0)); return true; };
  const record = (file, text = "offline") => ({ pin: { path: file, bytes: Buffer.byteLength(text), sha256: crypto.createHash("sha256").update(text).digest("hex") }, identity: ["stable"] });
  const proc = pid => ({ pid, startTicks: pid === 123 ? "11" : "22", exe: pid === 123 ? "/opt/node-pinned" : "/opt/postgrest-pinned", membership: "0::/\n" });
  const runningBroker = { close: async () => { state.brokerClosed++; } };
  const brokerModule = { start(conf) { state.brokerConfig = conf; announceBroker();
    return heldBroker ? new Promise(resolve => { state.releaseBroker = () => resolve(runningBroker); }) : Promise.resolve(runningBroker); } };
  const hooks = { privateJSON: () => ({ ...record("/run/bootstrap/START.PRIVATE.json"), value: c }),
    readFile: (file, cap, options) => ({ ...record(file), pin: options.expected }),
    writePrivate: (file, text) => { state.writes.push({ file, text }); return record(file, text); },
    environmentCheck: () => ({ self: proc(123), noNewPrivilegesObserved: true }), processInfo: proc,
    ownListener: () => !state.childEnded, actualGroup() {}, unchanged() {} };
  const instance = load({ hooks, brokerModule, processStub: { once: p.once.bind(p), removeListener: p.removeListener.bind(p) },
    childModule: { spawn(binary, args, options) {
      assert.ok(binary === "/opt/postgrest-pinned" && args.length === 1 && args[0] === "/run/bootstrap/POSTGREST.PRIVATE.conf");
      assert.ok(Object.keys(options.env).sort().join("|") === ["LANG", "LC_ALL", "TZ", "PATH"].sort().join("|"));
      assert.ok(options.stdio.join("|") === "ignore|pipe|pipe"); state.spawns++; queueMicrotask(() => child.emit("spawn")); return child;
    } } });
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
      && running.ready.databaseAuthorityQualified === false && running.ready.databaseConnectionConfirmed === false
      && running.ready.unitExecutionAuthorized === false);
    assert.ok(f.state.brokerConfig.upstream.pid === 456 && f.state.brokerConfig.upstream.startTicks === "22");
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
  console.log("local-unit-native-owner offline: " + tests + " checks passed; native starts=0");
})().catch(() => { console.error("local-unit-native-owner offline test failed"); process.exitCode = 1; });
