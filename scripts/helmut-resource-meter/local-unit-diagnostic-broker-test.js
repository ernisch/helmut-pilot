"use strict";
// Offline transport simulation. No real socket, process, provider or database.
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto");
const assert = require("node:assert/strict"), { EventEmitter } = require("node:events");
const filename = path.join(__dirname, "local-unit-diagnostic-broker.js"), source = fs.readFileSync(filename, "utf8");
const key = crypto.randomBytes(32), nonce = crypto.randomBytes(32).toString("hex"), bytes = Buffer.from('{"closed":"offline"}');
let checks = 0;
function transport({ mode = "valid", finishDelay = 0, connectDelay = 0 } = {}) {
  const socket = new EventEmitter(), state = { connections: 0, writes: 0, destroyed: false, endCalled: false, closed: false };
  socket.destroy = () => { state.destroyed = true; };
  socket.end = () => { state.endCalled = true; throw Error("request-half-close-forbidden"); };
  socket.write = frame => {
    state.writes++;
    assert.ok(frame.at(-1) === 10 && frame.indexOf(10) === frame.length - 1);
    const m = JSON.parse(frame.subarray(0, -1));
    assert.ok(Object.keys(m).join("|") === "version|nonce|atUTC|bodyBase64|hmacSHA256");
    const unsigned = { version: m.version, nonce: m.nonce, atUTC: m.atUTC, bodyBase64: m.bodyBase64 };
    const actual = crypto.createHmac("sha256", key).update(JSON.stringify(unsigned)).digest();
    assert.ok(m.version === "helmut-local-original-owner-request/1" && m.nonce === nonce
      && Buffer.from(m.bodyBase64, "base64").equals(bytes) && Math.abs(Date.now() - Date.parse(m.atUTC)) < 1000);
    assert.ok(crypto.timingSafeEqual(actual, Buffer.from(m.hmacSHA256, "hex")));
    queueMicrotask(() => {
      if (mode === "silent") return;
      if (mode === "error") { socket.emit("error", Error("offline")); return; }
      if (mode === "close-only") { socket.emit("close", false); return; }
      const r = { schema: "helmut-local-original-owner-response/1", nonce: mode === "nonce" ? "0".repeat(64) : nonce,
        status: mode === "failure" ? 500 : 200, bodyBase64: bytes.toString("base64") };
      const hmacSHA256 = crypto.createHmac("sha256", mode === "hmac" ? crypto.randomBytes(32) : key).update(JSON.stringify(r)).digest("hex");
      let response = Buffer.from(JSON.stringify({ ...r, hmacSHA256 }) + (mode === "no-newline" ? "" : "\n"));
      if (mode === "trailing") response = Buffer.concat([response, Buffer.from("x")]);
      if (mode === "two-frames") response = Buffer.concat([response, response]);
      if (mode === "duplicate-key") response = Buffer.from(response.toString().replace('{"schema":', '{"nonce":"discarded","schema":'));
      if (mode === "invalid-base64") {
        const bad = { ...r, bodyBase64: "%%%" };
        response = Buffer.from(JSON.stringify({ ...bad, hmacSHA256: crypto.createHmac("sha256", key).update(JSON.stringify(bad)).digest("hex") }) + "\n");
      }
      socket.emit("data", response.subarray(0, 15)); socket.emit("data", response.subarray(15));
      if (mode !== "no-eof") socket.emit("end");
      setTimeout(() => { state.closed = true; socket.emit("close", mode === "error-close"); }, finishDelay);
    });
    return true;
  };
  const mod = { exports: {} }, sandbox = { Buffer, URL, structuredClone, setTimeout, clearTimeout, module: mod, __filename: filename,
    process: { env: {}, getuid: () => 0, hrtime: process.hrtime },
    require(name) {
      if (name === "node:net") return { createConnection(options) {
        assert.ok(Object.keys(options).length === 1 && options.path === "/ram/helmut-original-write-bridge.sock");
        state.connections++;
        if (connectDelay) setTimeout(() => socket.emit("connect"), connectDelay); else queueMicrotask(() => socket.emit("connect"));
        return socket;
      } };
      if (["node:http", "node:fs"].includes(name)) return new Proxy({}, { get() { throw Error("offline-native-access-forbidden"); } });
      return require(name);
    } };
  vm.runInNewContext(source + "\nmodule.exports={originalUpstream};", sandbox);
  return { state, run: (remaining = 1000) => mod.exports.originalUpstream({ nonce }, bytes, key, remaining) };
}
function rootProcessFixture(fault = null) {
  let reads = 0;
  const fsStub = { readFileSync(name) {
    if (name.endsWith("/stat")) return "123 (root broker) " + Array.from({ length: 20 }, (_, i) => i === 0 ? "S" : i === 1 ? "1"
      : i === 19 ? fault === "drift" && ++reads > 1 ? "99" : "11" : "0").join(" ");
    if (name.endsWith("/status")) return (fault === "noUID" ? "" : "Uid:\t" + (fault === "uid" ? "1000" : "0") + "\t0\t0\t0\n")
      + (fault === "noGID" ? "" : "Gid:\t0\t0\t0\t" + (fault === "gid" ? "1000" : "0") + "\n")
      + ["CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb"].map(k => k + ":\t" + (fault === "cap" && k === "CapEff" ? "1" : "0000") + "\n").join("")
      + "NoNewPrivs:\t" + (fault === "nnp" ? "0" : "1") + "\n";
    if (name.endsWith("/cgroup")) return "0::/\n";
    throw Error("offline-proc-only");
  }, readlinkSync: name => name.endsWith("/ns/pid") ? fault === "ns" ? "unbound" : "pid:[99]" : "/opt/node-pinned" };
  const mod = { exports: {} }, sandbox = { module: mod, __filename: filename, Buffer, process: { env: {} }, require(name) {
    if (name === "node:fs") return fsStub; if (name === "node:http" || name === "node:net") return {};
    return require(name);
  } };
  vm.runInNewContext(source + "\nmodule.exports={processInfo};", sandbox); return mod.exports;
}
function brokerLifecycle() {
  const state = { observations: 0, reads: [], handler: null, closeCalls: 0, listenerLost: false, addressChanged: false,
    rootDrift: false, upstreamDrift: false, sourceDrift: false, signingKeyDrift: false, trustDrift: false, socketDrift: false };
  const files = new Map(), publicDir = "/run/helmut-local-unit-diagnostic", privateDir = publicDir + "-owner";
  const pin = (name, data) => ({ path: name, bytes: Buffer.byteLength(data), sha256: crypto.createHash("sha256").update(data).digest("hex") });
  const put = (name, data) => { const bytes = Buffer.from(data); files.set(name, { bytes, pin: pin(name, bytes), identity: [name, "stable"] }); return files.get(name); };
  const op = "localUnitDiagnostic-" + "b".repeat(32), commandHash = "a".repeat(64), database = "helmut_unit_diagnostic_" + "b".repeat(32);
  const exe = put("/opt/postgrest-pinned", "VM PostgREST byte pin"), config = put("/run/bootstrap/REST.PRIVATE.conf", "VM private config byte pin");
  const nodePin = pin("/opt/node-pinned", "VM Node code"), servicePin = pin("/bench/local-unit-original-service.js", "VM source service code");
  const sourceConfigPin = pin("/bench/ORIGINAL_SERVICE_CONFIG.PRIVATE.json", "VM source config");
  const hmac = put("/run/bootstrap/ORIGINAL_HMAC.PRIVATE.bin", crypto.randomBytes(32));
  const original = { schema: "helmut-local-unit-original-source-binding/1", operationId: op, commandHash, database,
    socketPath: "/ram/helmut-original-write-bridge.sock", containerId: "c".repeat(64), pidNamespace: "pid:[88]",
    supervisor: { uid: 1000, pid: 77, startTicks: "8" }, service: { uid: 1000, pid: 78, startTicks: "9", exePin: nodePin,
      codePin: servicePin, configPin: sourceConfigPin, nodeBudget: { nodeVersion: "v24.19.0", execArgv: ["--max-old-space-size=384", "--max-semi-space-size=16"],
        oldSpaceMiB: 384, semiSpaceMiB: 16, heapSizeLimitBytes: 432 * 1048576 } },
    measuredCgroup: { device: 1, inode: 2, procMembership: "0::/\n" }, hmacKeySHA256: hmac.pin.sha256 };
  const now = Date.now(), sourceQ = put("/run/bootstrap/SOURCE_QUALIFICATION.PRIVATE.json", JSON.stringify({
    schema: "helmut-local-unit-source-supervisor-qualification/1", operationId: op, commandHash, database,
    issuedAtUTC: new Date(now).toISOString(), expiresAtUTC: new Date(now + 180000).toISOString(), publicSourceBinding: original }));
  const brokerCode = put(filename, source), token = put("/run/bootstrap/TOKEN.PRIVATE", "e30." + Buffer.from(JSON.stringify({ role: "helmut_ud_runtime_" + "b".repeat(32) })).toString("base64url") + ".e30");
  const c = { schema: "helmut-local-unit-diagnostic-broker-config/2", operationId: op, commandHash, database,
    upstream: { port: 3456, pid: 456, startTicks: "22", exePin: exe.pin, configPin: config.pin, runtimeTokenPath: token.pin.path },
    measuredCgroup: { path: "/owned-group", device: 1, inode: 2, procMembership: { broker: "0::/\n", upstream: "0::/\n" } },
    legacy: { tables: [], rpcs: [] }, originalService: { hmacKeyPath: hmac.pin.path, sourceQualificationPin: sourceQ.pin, publicSourceBinding: original } };
  const ownerQ = put("/run/bootstrap/OWNER.PRIVATE.json", JSON.stringify({ schema: "helmut-local-unit-diagnostic-owner-qualification/2",
    operationId: op, commandHash, database, brokerCodeSHA256: brokerCode.pin.sha256, upstream: c.upstream,
    measuredCgroup: c.measuredCgroup, legacy: c.legacy, originalService: c.originalService })); c.ownerQualificationPin = ownerQ.pin;
  const proc = pid => ({ pid, parentPID: pid === 123 ? 1 : 123, startTicks: pid === 123 ? state.rootDrift ? "99" : "11" : state.upstreamDrift ? "99" : "22",
    exe: pid === 123 ? "/opt/node-pinned" : exe.pin.path, membership: "0::/\n", pidNamespace: "pid:[99]", uids: [0, 0, 0, 0], gids: [0, 0, 0, 0],
    capabilitiesZero: true, noNewPrivileges: true });
  const server = new EventEmitter(); server.listening = false;
  server.listen = (name, callback) => { assert.equal(name, publicDir + "/broker.sock"); server.listening = true; queueMicrotask(callback); };
  server.address = () => state.addressChanged ? "/wrong/socket" : publicDir + "/broker.sock";
  server.close = callback => { state.closeCalls++; server.listening = false; queueMicrotask(() => callback()); };
  const fsStub = { realpathSync: x => x,
    lstatSync(name, options) {
      if (name === "/owned-group") return { isDirectory: () => true, isSymbolicLink: () => false, dev: 1, ino: 2 };
      if (name.endsWith(".sock")) {
        const n = x => options?.bigint ? BigInt(x) : x;
        return { dev: n(1), ino: n(name === original.socketPath ? 10 : state.socketDrift ? 12 : 11), mode: n(0o140666),
          uid: n(name === original.socketPath ? 1000 : 0), gid: n(0), nlink: n(1), size: n(0), mtimeNs: n(1), ctimeNs: n(1), isSocket: () => true };
      }
      return { isDirectory: () => true, isSymbolicLink: () => false, uid: 0, mode: 0o40755 };
    }, statfsSync: () => ({ type: 0x63677270 }), readdirSync: () => ["7"], readlinkSync: () => "socket:[9]",
    readFileSync(name) { assert.equal(name, "/proc/net/tcp"); return "header\n0: 0100007F:0D80 00000000:0000 0A 0 0 0 0 0 9\n"; },
    existsSync: name => files.has(name), mkdirSync: name => put(name, "VM dir"), chmodSync() {}, writeFileSync: (name, bytes) => { assert(!files.has(name)); put(name, bytes); } };
  const hooks = { processInfo(pid) { state.observations++; return proc(pid); }, readRegular(name, cap, options = {}) {
    state.reads.push(name); const record = name === "/proc/456/exe" ? exe : files.get(name); assert(record, "VM closed file list");
    if (state.sourceDrift && name === sourceQ.pin.path || state.signingKeyDrift && name.endsWith("signing-key.pem") || state.trustDrift && name.endsWith("trust.json"))
      throw Error("local-unit-broker-VM-pin-drift");
    if (options.expected) assert.equal(record.pin.sha256, options.expected.sha256);
    return { ...record, bytes: options.contents === false ? Buffer.alloc(0) : record.bytes };
  } };
  const mod = { exports: {} }, sandbox = { module: mod, __filename: filename, __hooks: hooks, Buffer, URL, structuredClone,
    setTimeout, clearTimeout, process: { env: {}, getuid: () => 0, pid: 123, version: "v24.19.0",
      execArgv: ["--max-old-space-size=384", "--max-semi-space-size=16"], hrtime: process.hrtime, umask() {} }, require(name) {
      if (name === "node:fs") return fsStub;
      if (name === "node:http") return { createServer(handler) { state.handler = handler; return server; }, request() { throw Error("offline-upstream-forbidden"); } };
      if (name === "node:net") return { createConnection() { throw Error("offline-original-forbidden"); } };
      if (name === "node:v8") return { getHeapStatistics: () => ({ heap_size_limit: 432 * 1048576 }) };
      return require(name);
    } };
  vm.runInNewContext(source + "\nstructuredClone=value=>JSON.parse(JSON.stringify(value));({readRegular,processInfo}=__hooks);", sandbox);
  return { start: () => mod.exports.start(c), state, files, c, server, async unknown() {
    const req = { method: "POST", url: "/v1/execute", async *[Symbol.asyncIterator]() { yield Buffer.from("[]"); }, destroy() {} };
    const res = { headersSent: false, writeHead() { this.headersSent = true; return this; }, end() {} };
    await state.handler(req, res);
  } };
}
(async () => {
  const good = transport({ finishDelay: 10 }); let accepted = false;
  const pending = good.run().then(r => { accepted = true; return r; });
  await new Promise(resolve => setTimeout(resolve, 1)); assert.ok(!accepted && !good.state.closed); checks++;
  const result = await pending;
  assert.ok(result.status === 200 && result.bytes.equals(bytes) && good.state.closed && !good.state.endCalled
    && good.state.connections === 1 && good.state.writes === 1); checks++;
  for (const mode of ["silent", "error", "close-only", "nonce", "failure", "hmac", "no-newline", "trailing", "two-frames",
    "duplicate-key", "invalid-base64", "no-eof", "error-close"]) {
    const f = transport({ mode });
    await assert.rejects(f.run(mode === "silent" ? 5 : 1000), /^Error: local-unit-broker-[a-z0-9-]+$/);
    assert.ok(f.state.connections === 1 && f.state.writes === 1 && f.state.destroyed && !f.state.endCalled); checks++;
  }
  for (const remaining of [0, -1, 28001, NaN]) {
    const f = transport(); await assert.rejects(f.run(remaining)); assert.ok(f.state.connections === 0); checks++;
  }
  const late = transport({ connectDelay: 15 }); await assert.rejects(late.run(5));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(late.state.destroyed && late.state.connections === 1 && late.state.writes === 0); checks++;
  const root = rootProcessFixture().processInfo(123);
  assert(root.uids.every(x => x === 0) && root.gids.every(x => x === 0) && root.pidNamespace === "pid:[99]" && root.parentPID === 1
    && root.capabilitiesZero && root.noNewPrivileges && Object.isFrozen(root)); checks++;
  for (const fault of ["noUID", "uid", "noGID", "gid", "cap", "nnp", "ns", "drift"]) {
    assert.throws(() => rootProcessFixture(fault).processInfo(123)); checks++;
  }
  {
    const f = brokerLifecycle(), running = await f.start(), before = f.state.observations, value = running.observe();
    assert(Object.isFrozen(running) && Object.isFrozen(value) && value.listenerObserved && value.unitExecutionQualified === false
      && f.state.observations > before && Buffer.byteLength(JSON.stringify(value)) <= 2048);
    assert(f.state.reads.some(x => x.endsWith("signing-key.pem")) && f.state.reads.some(x => x.endsWith("SOURCE_QUALIFICATION.PRIVATE.json")));
    const text = JSON.stringify(value); for (const hidden of ["publicKeyPEM", "runtimeTokenPath", "sourceQualificationPin", "ownerQualificationPin", "hmacKeyPath", "publicSourceBinding"])
      assert(!text.includes(hidden));
    await running.close(); assert.throws(() => running.observe()); checks++;
  }
  for (const fault of ["rootDrift", "upstreamDrift", "sourceDrift", "signingKeyDrift", "trustDrift", "socketDrift", "addressChanged", "listenerLost"]) {
    const f = brokerLifecycle(), running = await f.start(); f.state[fault] = true; if (fault === "listenerLost") f.server.listening = false;
    assert.throws(() => running.observe()); f.state[fault] = false; assert.throws(() => running.observe(), "lost observation stays terminal");
    await running.close(); checks++;
  }
  {
    const f = brokerLifecycle(), running = await f.start(); await f.unknown(); const before = f.state.observations;
    assert.throws(() => running.observe()); assert.equal(f.state.observations, before); await running.close(); checks++;
  }
  {
    const f = brokerLifecycle(); f.state.addressChanged = true; await assert.rejects(f.start());
    assert.equal(f.server.listening, false); assert.equal(f.state.closeCalls, 1); checks++;
  }
  assert.equal(fs.readFileSync(filename, "utf8"), source, "reviewed broker source stayed stable");
  console.log("local-unit-diagnostic-broker offline: " + checks + " checks passed; native sockets=0; database=0");
})().catch(error => { const code = /^local-unit-broker-[a-z0-9-]+$/.test(error?.message || "") ? error.message : "bounded-test-failure";
  console.error("local-unit-diagnostic-broker offline transport failed after " + checks + " checks: " + code); process.exitCode = 1; });
