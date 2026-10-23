"use strict";
// Offline transport simulation. No real socket, process, provider or database.
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto");
const assert = require("node:assert/strict"), { EventEmitter } = require("node:events");
const filename = path.join(__dirname, "local-unit-diagnostic-broker.js"), source = fs.readFileSync(filename, "utf8");
const key = crypto.randomBytes(32), nonce = crypto.randomBytes(32).toString("hex"), bytes = Buffer.from('{"closed":"offline"}');
const BOOT_ID = "01234567-89ab-4cde-8fab-0123456789ab";
let checks = 0;
function clockFixture({ namespace = "time:[42]", namespaceError = null, boot = BOOT_ID + "\n", bootError = null } = {}) {
  const calls = [], mod = { exports: {} }, sandbox = { module: mod, __filename: filename, process: { env: {} }, require(name) {
    if (name === "node:fs") return {
      readlinkSync(name) {
        calls.push(name); assert.equal(name, "/proc/self/ns/time");
        if (namespaceError) throw Object.assign(Error("VM filesystem failure"), { code: namespaceError });
        return namespace;
      }, readFileSync(name, encoding) {
        calls.push(name); assert.equal(name, "/proc/sys/kernel/random/boot_id"); assert.equal(encoding, "utf8");
        if (bootError) throw Object.assign(Error("VM filesystem failure"), { code: bootError });
        return boot;
      }
    };
    if (name === "node:http" || name === "node:net") return {};
    return require(name);
  } };
  vm.runInNewContext(source + "\nmodule.exports={monotonicClockDomain};", sandbox);
  return { calls, run: (...args) => mod.exports.monotonicClockDomain(...args) };
}
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
    rootDrift: false, upstreamDrift: false, sourceDrift: false, signingKeyDrift: false, trustDrift: false, socketDrift: false,
    phaseLogs: [], phaseWrites: 0, upstreamSpans: [] };
  const phaseSink = new EventEmitter(); phaseSink.write = (row, callback) => {
    state.phaseWrites++;
    if (state.phaseFault === "throw") throw Error("VM hidden timing error");
    state.phaseLogs.push(row);
    if (state.phaseFault === "callback") queueMicrotask(() => callback(Error("VM hidden timing error"))); else callback(null);
    return state.phaseFault !== "backpressure";
  };
  const files = new Map(), descriptors = new Map(), publicDir = "/run/helmut-local-unit-diagnostic", privateDir = publicDir + "-owner";
  const tracePath = "/run/bootstrap/CONTROL_READ_TRACE.SAFE.jsonl"; let nextFD = 20;
  const pin = (name, data) => ({ path: name, bytes: Buffer.byteLength(data), sha256: crypto.createHash("sha256").update(data).digest("hex") });
  const put = (name, data) => { const bytes = Buffer.from(data); files.set(name, { bytes, pin: pin(name, bytes), identity: [name, "stable"], revision: 1 }); return files.get(name); };
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
  const graphName = "helmut_auth_state_graph_read_v1", graphSHA = crypto.createHash("sha256").update("VM qualified graph reader").digest("hex");
  const graphQ = put("/run/bootstrap/READ_GRAPH.PRIVATE.json", JSON.stringify({ schema: "helmut-local-unit-diagnostic-read-rpc-qualification/1",
    database, name: graphName, oid: "123", identityArguments: "jsonb", prosrcSHA256: graphSHA, readOnly: true, sourceReviewAccepted: true }));
  const c = { schema: "helmut-local-unit-diagnostic-broker-config/2", operationId: op, commandHash, database,
    upstream: { port: 3456, pid: 456, startTicks: "22", exePin: exe.pin, configPin: config.pin, runtimeTokenPath: token.pin.path },
    measuredCgroup: { path: "/owned-group", device: 1, inode: 2, procMembership: { broker: "0::/\n", upstream: "0::/\n" } },
    legacy: { tables: [], rpcs: [{ name: graphName, oid: "123", identityArguments: "jsonb", prosrcSHA256: graphSHA,
      qualificationPin: graphQ.pin, requestKeys: ["id", "knownProof", "readNonce", "knownGraph"] }] },
    originalService: { hmacKeyPath: hmac.pin.path, sourceQualificationPin: sourceQ.pin, publicSourceBinding: original } };
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
  function traceStat() { const row = files.get(tracePath); return { dev: 1n, ino: state.traceReplaced ? 51n : 50n, mode: 0o100600n,
    uid: 0n, gid: 0n, nlink: 1n, size: BigInt(row.bytes.length), mtimeNs: BigInt(row.revision), ctimeNs: BigInt(row.revision), isFile: () => true }; }
  const fsStub = { constants: fs.constants, realpathSync: x => x,
    lstatSync(name, options) {
      if (name === tracePath) return traceStat();
      if (name === "/owned-group") return { isDirectory: () => true, isSymbolicLink: () => false, dev: 1, ino: 2 };
      if (name.endsWith(".sock")) {
        const n = x => options?.bigint ? BigInt(x) : x;
        return { dev: n(1), ino: n(name === original.socketPath ? 10 : state.socketDrift ? 12 : 11), mode: n(0o140666),
          uid: n(name === original.socketPath ? 1000 : 0), gid: n(0), nlink: n(1), size: n(0), mtimeNs: n(1), ctimeNs: n(1), isSocket: () => true };
      }
      return { isDirectory: () => true, isSymbolicLink: () => false, uid: 0, mode: 0o40755 };
    }, statfsSync: () => ({ type: 0x63677270 }), readdirSync: () => ["7"], readlinkSync(name) {
      if (name === "/proc/self/ns/time") {
        if (state.withoutTimeNamespace) throw Object.assign(Error("VM unsupported kernel"), { code: "ENOENT" });
        return "time:[42]";
      }
      return "socket:[9]";
    },
    readFileSync(name) {
      if (name === "/proc/sys/kernel/random/boot_id") return BOOT_ID + "\n";
      assert.equal(name, "/proc/net/tcp"); return "header\n0: 0100007F:0D80 00000000:0000 0A 0 0 0 0 0 9\n";
    },
    existsSync: name => files.has(name), mkdirSync: name => put(name, "VM dir"), chmodSync() {}, writeFileSync: (name, bytes) => { assert(!files.has(name)); put(name, bytes); },
    openSync(name, flags, mode) {
      assert.equal(name, tracePath); assert(flags & fs.constants.O_EXCL); assert(flags & fs.constants.O_NOFOLLOW); assert(flags & fs.constants.O_NONBLOCK); assert.equal(mode, 0o600);
      if (files.has(name)) throw Error("VM existing trace"); put(name, ""); const fd = nextFD++; descriptors.set(fd, name); return fd;
    }, fstatSync(fd) { assert(descriptors.has(fd)); return traceStat(); },
    writeSync(fd, buffer, offset, length) {
      assert(descriptors.has(fd)); if (state.traceWriteFailure) throw Error("VM trace write failure");
      const row = files.get(tracePath); row.bytes = Buffer.concat([row.bytes, buffer.subarray(offset, offset + length)]); row.pin = pin(tracePath, row.bytes); row.revision++; return length;
    }, fsyncSync() { if (state.traceSyncFailure) throw Error("VM trace sync failure"); }, closeSync(fd) { assert(descriptors.delete(fd)); }
  };
  const hooks = { processInfo(pid) { state.observations++; return proc(pid); }, readRegular(name, cap, options = {}) {
    state.reads.push(name); const record = name === "/proc/456/exe" ? exe : files.get(name); assert(record, "VM closed file list");
    if (state.sourceDrift && name === sourceQ.pin.path || state.signingKeyDrift && name.endsWith("signing-key.pem") || state.trustDrift && name.endsWith("trust.json"))
      throw Error("local-unit-broker-VM-pin-drift");
    if (options.expected) assert.equal(record.pin.sha256, options.expected.sha256);
    return { ...record, bytes: options.contents === false ? Buffer.alloc(0) : record.bytes };
  } };
  const mod = { exports: {} }, sandbox = { module: mod, __filename: filename, __hooks: hooks, Buffer, URL, structuredClone,
    setTimeout, clearTimeout, process: { env: {}, getuid: () => 0, pid: 123, version: "v24.19.0",
      execArgv: ["--max-old-space-size=384", "--max-semi-space-size=16"], hrtime: process.hrtime, stderr: phaseSink, umask() {} }, require(name) {
      if (name === "node:fs") return fsStub;
      if (name === "node:http") return { createServer(handler) { state.handler = handler; return server; }, request(options, onResponse) {
        const span = { route: options.path, begin: process.hrtime.bigint() }; state.upstreamSpans.push(span);
        const req = new EventEmitter(); req.destroy = () => {}; req.end = body => {
          queueMicrotask(() => {
            req.emit("finish"); const res = new EventEmitter(); res.complete = !state.incompleteHTTP; res.destroy = () => {};
            res.statusCode = 200; onResponse(res); const route = options.path;
            const value = route === "/rpc/local_unit_diagnostic_contract_v1" ? { database, version: "helmut-local-unit-diagnostic-native-store/1",
              legacyReadRPCs: c.legacy.rpcs.map(({ name, oid, identityArguments, prosrcSHA256, qualificationPin }) => ({ name, oid, identityArguments, prosrcSHA256, qualificationPin })) }
              : route === "/rpc/local_unit_diagnostic_state_read_v1" ? state.stateWitness : { VM: "control response payload" };
            res.emit("data", Buffer.from(JSON.stringify(value))); if (!state.noHTTPEnd) { span.end = process.hrtime.bigint(); res.emit("end"); }
          });
        }; return req;
      } };
      if (name === "node:net") return { createConnection() {
        const socket = new EventEmitter(); socket.destroy = () => {}; queueMicrotask(() => socket.emit("connect"));
        socket.write = data => { const request = JSON.parse(data.toString()), response = { schema: "helmut-local-original-owner-response/1",
          nonce: request.nonce, status: 200, bodyBase64: Buffer.from(JSON.stringify(state.originalResult)).toString("base64") };
          queueMicrotask(() => { const unsigned = JSON.stringify(response); socket.emit("data", Buffer.from(JSON.stringify({ ...response,
            hmacSHA256: crypto.createHmac("sha256", hmac.bytes).update(unsigned).digest("hex") }) + "\n")); socket.emit("end"); socket.emit("close", false); });
        }; return socket;
      } };
      if (name === "node:v8") return { getHeapStatistics: () => ({ heap_size_limit: 432 * 1048576 }) };
      return require(name);
    } };
  vm.runInNewContext(source + "\nstructuredClone=value=>JSON.parse(JSON.stringify(value));({readRegular,processInfo}=__hooks);", sandbox);
  let requestIndex = 0;
  async function request(pathname, body) {
    const m = { operationId: op, commandHash, database, nonce: crypto.createHash("sha256").update("VM request " + requestIndex++).digest("hex"),
      method: "POST", path: pathname, bodyBase64: Buffer.from(JSON.stringify(body)).toString("base64") };
    const req = { method: "POST", url: "/v1/execute", complete: true, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(m)); }, destroy() {} };
    const res = new EventEmitter(); res.headersSent = false; res.writableFinished = false;
    res.writeHead = status => { res.headersSent = true; res.statusCode = status; return res; };
    res.end = output => { res.output = output; queueMicrotask(() => { if (state.lostDownstream) { res.emit("close"); return; }
      res.writableFinished = true; res.emit("finish"); res.emit("close"); }); };
    await state.handler(req, res); return { m, res };
  }
  const readNonce = i => "00000000-0000-4000-8000-" + String(i).padStart(12, "0");
  return { start: () => mod.exports.start(c), state, files, c, server, descriptors, request, readNonce, phaseSink,
    graph: i => request("/rest/v1/rpc/helmut_auth_state_graph_read_v1", { id: "main-auth", knownProof: null, readNonce: readNonce(i), knownGraph: null }),
    rows: () => files.get(tracePath).bytes.toString().trim().split("\n").map(JSON.parse), async unknown() {
    const req = { method: "POST", url: "/v1/execute", async *[Symbol.asyncIterator]() { yield Buffer.from("[]"); }, destroy() {} };
    const res = { headersSent: false, writeHead() { this.headersSent = true; return this; }, end() {} };
    await state.handler(req, res);
  } };
}
(async () => {
  {
    const f = brokerLifecycle(), running = await f.start(), reply = await f.graph(1);
    assert.equal(reply.res.statusCode, 200); assert.equal(f.state.phaseLogs.length, 1);
    const row = JSON.parse(f.state.phaseLogs[0].slice("HELMUT_BROKER_READ_PHASES_V1 ".length)), t = row[4];
    assert.deepEqual(row.slice(0, 4), [0, "legacy", "settled", crypto.createHash("sha256").update(reply.m.nonce).digest("hex")]);
    assert.equal(t.length, 9); assert(t.every((n, i) => /^\d{1,20}$/.test(n) && (!i || BigInt(n) >= BigInt(t[i - 1]))));
    assert.equal(f.state.upstreamSpans.length, 2);
    const [contract, graph] = f.state.upstreamSpans;
    assert.equal(contract.route, "/rpc/local_unit_diagnostic_contract_v1"); assert.equal(graph.route, "/rpc/helmut_auth_state_graph_read_v1");
    assert(BigInt(t[3]) <= contract.begin && contract.end <= BigInt(t[4]));
    assert(BigInt(t[5]) <= graph.begin && graph.end <= BigInt(t[6]));
    for (const hidden of [reply.m.nonce, f.readNonce(1), reply.m.path, "VM control response payload", "bodyBase64", "runtimeTokenPath", "Bearer"])
      assert(!f.state.phaseLogs[0].includes(hidden));
    assert(/^[\x20-\x7e]+\n$/.test(f.state.phaseLogs[0]) && Buffer.byteLength(f.state.phaseLogs[0]) <= 512);
    await f.request("/rest/v1/rpc/local_unit_diagnostic_contract_v1", {});
    const native = JSON.parse(f.state.phaseLogs[1].slice("HELMUT_BROKER_READ_PHASES_V1 ".length));
    assert.equal(native[1], "native"); assert.equal(native[4][3], null); assert.equal(native[4][4], null);
    await running.close(); checks++;
  }
  for (const phaseFault of ["throw", "callback", "backpressure", "event"]) {
    const f = brokerLifecycle(), running = await f.start(); f.state.phaseFault = phaseFault;
    assert.equal((await f.request("/rest/v1/rpc/local_unit_diagnostic_contract_v1", {})).res.statusCode, 200);
    if (phaseFault === "event") f.phaseSink.emit("error", Error("VM hidden timing error"));
    const at = f.state.phaseWrites;
    assert.equal((await f.request("/rest/v1/rpc/local_unit_diagnostic_contract_v1", {})).res.statusCode, 200);
    assert.equal(f.state.phaseWrites, at); assert(running.observe().listenerObserved); await running.close(); checks++;
  }
  {
    const f = brokerLifecycle(), running = await f.start(); f.state.rootDrift = true;
    assert.equal((await f.graph(1)).res.statusCode, 502);
    const row = JSON.parse(f.state.phaseLogs[0].slice("HELMUT_BROKER_READ_PHASES_V1 ".length));
    assert.equal(row[1], "legacy"); assert.equal(row[2], "failed"); assert.equal(row[4][2], null); assert(row[4][8] !== null);
    assert.equal(f.state.upstreamSpans.length, 0); assert.throws(() => running.observe()); await assert.rejects(running.close()); checks++;
  }
  {
    const f = brokerLifecycle(), running = await f.start();
    for (let i = 0; i < 300; i++) assert.equal((await f.request("/rest/v1/rpc/local_unit_diagnostic_contract_v1", {})).res.statusCode, 200);
    assert(f.state.phaseLogs.length > 0 && f.state.phaseLogs.length <= 256 && Buffer.byteLength(f.state.phaseLogs.join("")) <= 65536);
    assert(f.state.phaseLogs.every(row => Buffer.byteLength(row) <= 512));
    assert(running.observe().listenerObserved); await running.close(); checks++;
  }
  for (const options of [{}, { boot: BOOT_ID }, { namespaceError: "ENOENT" }]) {
    const f = clockFixture(options), domain = f.run(), absent = options.namespaceError === "ENOENT";
    assert(Object.isFrozen(domain)); assert.deepEqual(JSON.parse(JSON.stringify(domain)), {
      schema: "helmut-local-unit-monotonic-domain/1", kind: absent ? "kernel-without-time-namespaces" : "time-namespace",
      namespace: absent ? null : "time:[42]", bootId: BOOT_ID });
    assert.deepEqual(f.calls, ["/proc/self/ns/time", "/proc/sys/kernel/random/boot_id"]); checks++;
  }
  for (const namespaceError of ["EACCES", "EIO", "ENOTDIR", "EINVAL", "EPERM", "unknown"]) {
    const f = clockFixture({ namespaceError }); assert.throws(f.run, /^Error: local-unit-broker-trace-time-namespace-read$/);
    assert.deepEqual(f.calls, ["/proc/self/ns/time"]); checks++;
  }
  for (const namespace of [null, "", "time:[0]", "pid:[42]", "time:[42]\n", "time:[42]\r", " time:[42]"]) {
    assert.throws(clockFixture({ namespace }).run, /^Error: local-unit-broker-trace-time-namespace$/); checks++;
  }
  for (const namespaceError of [null, "ENOENT"]) for (const boot of [null, "", "invalid", BOOT_ID.toUpperCase(), " " + BOOT_ID,
    BOOT_ID + "\n\n", BOOT_ID + "\r\n", BOOT_ID + " extra"]) {
    assert.throws(clockFixture({ namespaceError, boot }).run, /^Error: local-unit-broker-trace-boot-id$/); checks++;
  }
  for (const namespaceError of [null, "ENOENT"]) {
    assert.throws(clockFixture({ namespaceError, bootError: "EACCES" }).run, /^Error: local-unit-broker-trace-boot-id-read$/); checks++;
  }
  assert.throws(() => clockFixture().run({ kind: "kernel-without-time-namespaces" }), /^Error: local-unit-broker-trace-clock-no-arguments$/); checks++;
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
    await assert.rejects(running.close()); checks++;
  }
  {
    const f = brokerLifecycle(), running = await f.start(); await f.unknown(); const before = f.state.observations;
    assert.throws(() => running.observe()); assert.equal(f.state.observations, before); await assert.rejects(running.close()); checks++;
  }
  {
    const f = brokerLifecycle(); f.state.addressChanged = true; await assert.rejects(f.start());
    assert.equal(f.server.listening, false); assert.equal(f.state.closeCalls, 1); checks++;
  }
  for (const absent of [false, true]) {
    const f = brokerLifecycle(); f.state.withoutTimeNamespace = absent;
    const running = await f.start(), requests = [];
    assert.throws(() => running.controlReadTracePin());
    // Three-key ordinary U.read is deliberately excluded from the control trace.
    await f.request("/rest/v1/rpc/helmut_auth_state_graph_read_v1", { id: "main-auth", knownProof: null, readNonce: f.readNonce(99) });
    for (let i = 1; i <= 16; i++) requests.push(await f.graph(i));
    const claim = "00000000-0000-4000-8000-000000000100", h = x => crypto.createHash("sha256").update(x).digest("hex");
    const verification = { authorizationHash: h("VM authorization"), controlsHash: h("VM controls"), controlCount: 16 };
    const prefix = "localUnitDiagnostic:" + f.c.operationId.slice(-32) + ":", state = { [prefix + "journal"]: {
      state: "closed", index: 1, inFlight: null, claimId: claim, verification }, [prefix + "result"]: { state: "retained-unreviewed", evidenceHash: h("VM evidence") } };
    const canonical = JSON.stringify(state), bodyHash = h(canonical), ownNonce = h("VM own ACK nonce");
    f.state.originalResult = { schema: "helmut-local-unit-original-write-result/1", authAck: [{ VM: "unexported old auth ACK" }],
      ownAck: { version: "helmut-local-unit-diagnostic-state-ack/1", scopeHash: f.c.commandHash, hash: bodyHash, revision: 17,
        claimHash: h(claim), nonce: ownNonce, ...verification } };
    requests.push(await f.request("/rest/v1/rpc/local_unit_diagnostic_original_write_v1", { schema: "helmut-local-unit-original-write/1", mode: "state",
      operationId: f.c.operationId, commandHash: f.c.commandHash, claimId: claim,
      originalCAS: { id: "main-auth", expectedRevision: 1, expectedProof: {}, expectedState: {}, revision: 2, root: {}, nodes: [], additions: [] },
      ownBefore: { hash: h("VM old own state"), revision: 16 }, ownNext: { canonical, hash: bodyHash }, artifact: null }));
    const stateNonce = h("VM state read nonce");
    f.state.stateWitness = { version: "helmut-local-unit-diagnostic-state-witness/1", scopeHash: f.c.commandHash,
      canonical, hash: bodyHash, revision: 17, nonce: stateNonce };
    for (let i = 0; i < 2; i++) requests.push(await f.request("/rest/v1/rpc/local_unit_diagnostic_state_read_v1", { p_scope_hash: f.c.commandHash, p_nonce: stateNonce }));
    await running.close(); const rows = f.rows(), records = rows.slice(1, -1), footer = rows.at(-1), pin = running.controlReadTracePin();
    assert.equal(rows[0].header.timeNamespace, absent ? null : "time:[42]"); assert.equal(rows[0].schema, "helmut-local-unit-native-control-read-trace/1");
    assert.deepEqual(rows[0].header.clockDomain, { schema: "helmut-local-unit-monotonic-domain/1",
      kind: absent ? "kernel-without-time-namespaces" : "time-namespace", namespace: absent ? null : "time:[42]", bootId: BOOT_ID });
    assert.equal(records.length, 19); assert.equal(footer.controlCount, 16); assert.equal(footer.finalAckCount, 1); assert.equal(footer.closedReadbackCount, 2); assert.equal(footer.complete, true);
    assert.equal(pin.bytes, f.files.get(pin.path).bytes.length); assert.equal(pin.sha256, h(f.files.get(pin.path).bytes)); assert(pin.bytes <= 65536 && f.descriptors.size === 0);
    for (let i = 0; i < records.length; i++) {
      const row = records[i]; assert.equal(row.seq, i + 1); assert.equal(row.requestNonceSHA256, h(requests[i].m.nonce));
      const result = JSON.parse(requests[i].res.output); assert.equal(row.envelopeSHA256, h(requests[i].res.output));
      assert.equal(row.attestationSHA256, h(JSON.stringify(result.attestation))); assert.equal(row.responseBodySHA256, h(Buffer.from(result.bodyBase64, "base64")));
      assert.equal(row.signatureSHA256, h(Buffer.from(result.signatureBase64, "base64"))); assert.equal(row.io.downstreamFinish, true);
      const t = row.timing; assert(BigInt(t.sendNs) <= BigInt(t.upstreamEndNs) && BigInt(t.upstreamEndNs) <= BigInt(t.signedNs) && BigInt(t.signedNs) <= BigInt(t.finishNs));
      assert.deepEqual(Object.keys(t).sort(), ["finishNs", "finishUTC", "sendNs", "sendUTC", "signedNs", "signedUTC", "upstreamEndNs", "upstreamEndUTC"]);
      if (i) assert(BigInt(records[i - 1].timing.finishNs) < BigInt(t.sendNs));
    }
    assert.equal(records[16].ownAck.nonceSHA256, h(ownNonce)); assert.equal(records[16].ownAck.claimHash, h(claim));
    assert.equal(records[17].readback.claimIdSHA256, h(claim)); assert.equal(records[17].readback.hash, bodyHash); assert.equal(records[18].readback.controlCount, 16);
    assert.equal(records[16].io.upstreamResponseEnd, null); assert.equal(records[16].io.ownerSocketClose, true); assert.equal(records[0].io.upstreamResponseEnd, true);
    const text = f.files.get(pin.path).bytes.toString();
    for (const hidden of [claim, ownNonce, stateNonce, f.readNonce(1), requests[0].m.nonce, "VM control response payload", "unexported old auth ACK", '"canonical"', '"bodyBase64"'])
      assert(!text.includes(hidden)); checks++;
  }
  for (const fault of ["incompleteHTTP", "lostDownstream", "traceWriteFailure", "traceSyncFailure", "traceReplaced"]) {
    const f = brokerLifecycle(), running = await f.start(); f.state[fault] = true; await f.graph(1);
    assert.throws(() => running.observe()); await assert.rejects(running.close()); assert.equal(f.descriptors.size, 0); checks++;
  }
  {
    const f = brokerLifecycle(), running = await f.start();
    for (let i = 1; i <= 33; i++) await f.graph(i);
    assert.throws(() => running.observe()); await assert.rejects(running.close());
    const footer = f.rows().at(-1); assert.equal(footer.recordCount, 32); assert.equal(footer.complete, false);
    assert.equal(f.descriptors.size, 0); assert(f.files.get("/run/bootstrap/CONTROL_READ_TRACE.SAFE.jsonl").bytes.length <= 65536); checks++;
  }
  {
    const f = brokerLifecycle(); f.files.set("/run/bootstrap/CONTROL_READ_TRACE.SAFE.jsonl", { bytes: Buffer.from("preexisting trace") });
    await assert.rejects(f.start()); assert.equal(f.files.get("/run/bootstrap/CONTROL_READ_TRACE.SAFE.jsonl").bytes.toString(), "preexisting trace");
    assert.equal(f.server.listening, false); checks++;
  }
  assert.equal(fs.readFileSync(filename, "utf8"), source, "reviewed broker source stayed stable");
  console.log("local-unit-diagnostic-broker offline: " + checks + " checks passed; native sockets=0; database=0");
})().catch(error => { const code = /^local-unit-broker-[a-z0-9-]+$/.test(error?.message || "") ? error.message : "bounded-test-failure";
  console.error("local-unit-diagnostic-broker offline transport failed after " + checks + " checks: " + code); process.exitCode = 1; });
