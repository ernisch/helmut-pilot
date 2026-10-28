"use strict";

// HTTP transport diagnosis only. No database, Auth, profile, model or historical
// write is opened/replayed. The real seven-second driver event-loop stall is a
// declared diagnostic stimulus, never a RAM/performance acceptance measurement.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const assert = require("node:assert/strict"), http = require("node:http");
const { fork } = require("node:child_process"), dc = require("node:diagnostics_channel");
const DEFAULT_WORK = "/workspace/shared/helmut-w15-http-idle-probe-20261028";
const CODES = new Set(["UND_ERR_SOCKET", "ECONNRESET", "EPIPE", "ETIMEDOUT", "ECONNREFUSED",
  "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_CONNECT_TIMEOUT", "ABORT_ERR"]);
const MESSAGES = new Set(["fetch failed", "terminated", "other side closed", "socket hang up"]);
const stamp = () => ({ atUTC: new Date().toISOString(), monoNS: process.hrtime.bigint().toString() });
const hash = b => crypto.createHash("sha256").update(b).digest("hex");
function safeFailure(error) {
  const rows = [];let e = error;
  for (let n = 0; e && n < 4; n++, e = e.cause) rows.push({
    name: ["Error", "TypeError", "SocketError", "AbortError", "TimeoutError"].includes(e.name) ? e.name : "OtherError",
    code: CODES.has(e.code) ? e.code : null, message: MESSAGES.has(e.message) ? e.message : "redacted" });
  return rows;
}
function guard() {
  assert.equal(process.version, "v24.19.0", "idle-probe-pinned-node");
  assert(require.cache[require.resolve("./lokaler-netzschutz")], "idle-probe-preloaded-network-guard");
  assert.deepEqual(require("./lokaler-netzschutz").pruefe(process.env), []);
}
function configuration(input = {}) {
  assert(input && typeof input === "object" && !Array.isArray(input));
  assert(Object.keys(input).every(k => k === "work"), "idle-probe-unsupported-configuration");
  const work = input.work || DEFAULT_WORK;
  assert.equal(work, DEFAULT_WORK, "idle-probe-exact-fresh-output");
  assert(!fs.existsSync(work), "idle-probe-once-only-existing-output");
  const parent = fs.lstatSync(path.dirname(work));assert(parent.isDirectory() && !parent.isSymbolicLink());
  return { work, node: process.version, eventLoopStallMs: 7000, maximumCases: 2,
    maximumHTTPRequests: 6, requestDeadlineMs: 10000, databaseOperations: 0, modelCalls: 0, memoryAcceptance: false };
}
function journal(filename) {
  const fd = fs.openSync(filename, "wx", 0o600);let sequence = 0;
  return { write: (name, fields = {}) => fs.writeSync(fd, JSON.stringify({ sequence: sequence++, ...stamp(), name, ...fields }) + "\n"),
    sync: () => fs.fdatasyncSync(fd), close: () => { fs.fdatasyncSync(fd);fs.closeSync(fd); } };
}
const safeSocket = socket => socket ? { localPort: socket.localPort ?? null, remotePort: socket.remotePort ?? null,
  bytesRead: socket.bytesRead ?? null, bytesWritten: socket.bytesWritten ?? null,
  destroyed: socket.destroyed === true, readableEnded: socket.readableEnded === true,
  writableEnded: socket.writableEnded === true } : null;
function timeouts(server) {
  return Object.fromEntries(["keepAliveTimeout", "keepAliveTimeoutBuffer", "headersTimeout", "requestTimeout",
    "timeout", "maxRequestsPerSocket"].map(k => [k, server[k] ?? null]));
}
function attachServer(server, role, log) {
  let sequence = 0;const ids = new WeakMap(), open = new Set();
  server.on("connection", socket => {
    const id = role + "-" + (++sequence), tuple = safeSocket(socket);ids.set(socket, id);open.add(socket);
    const observed = () => ({ ...safeSocket(socket), localPort: tuple.localPort, remotePort: tuple.remotePort });
    log.write("server-socket-connect", { role, socketID: id, socket: safeSocket(socket) });
    socket.on("end", () => log.write("server-socket-end", { role, socketID: id, socket: observed() }));
    socket.on("close", hadError => { open.delete(socket);log.write("server-socket-close", { role, socketID: id, hadError, socket: observed() });log.sync(); });
    socket.on("error", error => log.write("server-socket-error", { role, socketID: id, error: safeFailure(error), socket: observed() }));
  });
  server.on("request", (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const fields = { role, socketID: ids.get(req.socket), case: url.searchParams.get("case"), step: url.searchParams.get("step") };
    log.write("server-request", fields);
    res.on("finish", () => log.write("server-response-finish", { ...fields, status: res.statusCode,
      keepAliveHeader: res.getHeader("keep-alive") ?? null, socket: safeSocket(req.socket) }));
  });
  return open;
}
async function serverProcess(config) {
  guard();assert.equal(config.work, DEFAULT_WORK);
  const s = fs.lstatSync(config.work);assert(s.isDirectory() && !s.isSymbolicLink() && (s.mode & 511) === 448);
  const log = journal(path.join(config.work, "servers.SAFE.jsonl"));let gateway, gatewayServer, gatewaySockets, stopped = false;
  const origin = http.createServer((req, res) => {
    const chunks = [];let bytes = 0;
    req.on("data", b => { bytes += b.length;if (bytes > 65536) req.destroy();else chunks.push(b); });
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      try { const value = JSON.parse(body);assert.match(value.id, /^[a-f0-9-]{36}$/);
        res.writeHead(200, { "content-type": "application/json" });res.end(JSON.stringify({ id: value.id }));
      } catch { res.writeHead(400);res.end(); }
    });
  });
  const originSockets = attachServer(origin, "origin", log);
  await new Promise(resolve => origin.listen(0, "127.0.0.1", resolve));
  // Observe the genuine gateway server returned by Node's constructor. No
  // gateway request handler/header/timeout behavior is replaced or configured.
  const create = http.createServer;
  http.createServer = function(...args) { const server = create.apply(this, args);gatewayServer = server;
    gatewaySockets = attachServer(server, "gateway", log);return server; };
  try { gateway = await require("./fixtures/z3-plattform").starteDatenbankTor({ postgrestPort: origin.address().port }); }
  finally { http.createServer = create; }
  log.write("server-defaults", { origin: timeouts(origin), gateway: timeouts(gatewayServer),
    globalAgent: { keepAlive: http.globalAgent.keepAlive, maxFreeSockets: http.globalAgent.maxFreeSockets,
      maxSockets: String(http.globalAgent.maxSockets), timeout: http.globalAgent.options.timeout ?? null } });log.sync();
  process.send({ type: "ready", url: gateway.url, originPort: origin.address().port,
    defaults: { origin: timeouts(origin), gateway: timeouts(gatewayServer) } });
  async function stop() {
    if (stopped) return;stopped = true;
    try {
      await Promise.all([gateway.stoppe(), new Promise(resolve => origin.close(resolve))]);
      http.globalAgent.destroy();
      const until = Date.now() + 1500;
      while ((originSockets.size || gatewaySockets.size) && Date.now() < until)
        await new Promise(resolve => setTimeout(resolve, 10));
      assert.equal(originSockets.size + gatewaySockets.size, 0, "idle-probe-server-sockets-not-drained");
      log.write("servers-stopped", { gateway: gateway.bericht(), openSockets: 0 });log.close();
      process.send({ type: "stopped", confirmed: true }, () => process.exit(0));
    } catch { process.exit(1); }
  }
  process.on("message", message => { if (message.type === "stop") void stop(); });
  process.once("SIGTERM", () => { gatewayServer.closeAllConnections();origin.closeAllConnections();void stop(); });
}
async function child(config, log) {
  const child = fork(__filename, ["--server"], { execPath: process.execPath,
    execArgv: ["--require", path.join(__dirname, "lokaler-netzschutz.js")],
    env: { PATH: process.env.PATH, LANG: "C.UTF-8", HELMUT_SOURCE_MODE: "off", HELMUT_STORAGE_BACKEND: "local" },
    stdio: ["ignore", "ignore", "ignore", "ipc"] });
  let exit, receipt = false;
  const exited = new Promise(resolve => child.once("exit", (code, signal) => { exit = { code, signal };resolve(exit); }));
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("idle-probe-child-readiness")), 10000);
    child.on("message", m => { if (m.type === "stopped") receipt = m.confirmed === true;
      if (m.type === "ready") { clearTimeout(timer);resolve(m); } });
    child.once("error", error => { clearTimeout(timer);reject(error); });
    child.once("exit", () => { clearTimeout(timer);reject(Error("idle-probe-child-early-exit")); });
  });
  child.send({ type: "start", ...config });
  return { ready, async stop() {
    if (!exit && child.connected) child.send({ type: "stop" });
    let timer;await Promise.race([exited, new Promise(resolve => { timer = setTimeout(resolve, 5000); })]);clearTimeout(timer);
    let fallback = false;
    if (!exit) { fallback = true;child.kill("SIGTERM");
      await Promise.race([exited, new Promise(resolve => { timer = setTimeout(resolve, 2500); })]);clearTimeout(timer); }
    if (!exit) { child.kill("SIGKILL");await exited; }
    const value = { confirmed: receipt && exit?.code === 0 && !fallback, stoppedReceipt: receipt,
      exit, fallback };log.write("child-stop", value);return value;
  } };
}
async function main(config = {}, { dryRun = false } = {}) {
  guard();const c = configuration(config);
  if (dryRun) { const result = { status: "PASS_DRY_ARGUMENTS_AND_CONFIGURATION_NO_HTTP", ...c,
    sourceSHA256: hash(fs.readFileSync(__filename)), HTTPRequests: 0, children: 0 };
    console.log(JSON.stringify(result));return result; }
  fs.mkdirSync(c.work, { mode: 0o700 });const log = journal(path.join(c.work, "driver.SAFE.jsonl"));
  const observations = [], requests = [], socketIds = new WeakMap(), subscriptions = [];let socketN = 0, stopped = false, worker, cleanup;
  const record = (name, fields) => { const value = { ...stamp(), name, ...fields };observations.push(value);log.write(name, fields); };
  const socketId = socket => { if (!socketIds.has(socket)) socketIds.set(socket, ++socketN);return socketIds.get(socket); };
  for (const name of ["undici:client:sendHeaders", "undici:request:error"]) {
    const handler = value => {
      const u = new URL(value.request?.path || "/", "http://127.0.0.1");
      record(name, { case: u.searchParams.get("case"), step: u.searchParams.get("step"),
        socketID: value.socket ? socketId(value.socket) : null, socket: safeSocket(value.socket),
        ...(value.error ? { error: safeFailure(value.error) } : {}) });
    };
    dc.channel(name).subscribe(handler);subscriptions.push([name, handler]);
  }
  let failure = null, ready;
  async function request(which, step) {
    assert(!stopped && requests.length < c.maximumHTTPRequests, "idle-probe-no-request-after-failure-or-budget");
    const id = crypto.randomUUID(), row = { case: which, step, id, begin: stamp() };requests.push(row);
    try {
      const response = await fetch(ready.url + "/rest/v1/idle-probe?case=" + which + "&step=" + step,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }),
          signal: AbortSignal.timeout(c.requestDeadlineMs) });
      assert.equal(response.status, 200);assert.deepEqual(await response.json(), { id });row.complete = true;row.end = stamp();
      record("request-completed", row);return row;
    } catch (e) { row.complete = false;row.error = safeFailure(e);row.end = stamp();
      stopped = true;failure ||= row;record("request-failed", row);throw e; }
  }
  try {
    worker = await child(c, log);ready = await worker.ready;
    record("ready", { defaults: ready.defaults, node: process.version, undici: process.versions.undici ?? null,
      gatewayPort: new URL(ready.url).port, originPort: ready.originPort });
    for (const which of ["baseline", "stall"]) {
      const warmed = await Promise.allSettled([request(which, "warm0"), request(which, "warm1")]);
      if (warmed.some(x => x.status !== "fulfilled")) break;
      if (which === "stall") {
        record("diagnostic-event-loop-stall-start", { milliseconds: c.eventLoopStallMs, productionClockChanged: false });
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, c.eventLoopStallMs);
        record("diagnostic-event-loop-stall-end", { productionClockChanged: false });
      }
      try { await request(which, "fresh"); } catch { break; }
    }
  } catch (e) { stopped = true;failure ||= { case: "control", step: "setup", error: safeFailure(e) };record("control-failed", failure); }
  finally {
    if (worker) cleanup = await worker.stop();
    for (const [name, handler] of subscriptions) dc.channel(name).unsubscribe(handler);
  }
  const serverFile = path.join(c.work, "servers.SAFE.jsonl"), servers = fs.existsSync(serverFile)
    ? fs.readFileSync(serverFile, "utf8").trim().split("\n").filter(Boolean).map(x => JSON.parse(x)) : [];
  const send = observations.find(x => x.name === "undici:client:sendHeaders" && x.case === "stall" && x.step === "fresh");
  const warmUsesSameSocket = send && observations.some(x => x.name === "undici:client:sendHeaders"
    && x.case === "stall" && x.step.startsWith("warm") && x.socketID === send.socketID);
  const closed = send && servers.find(x => x.name === "server-socket-close" && x.role === "gateway"
    && x.socket?.remotePort === send.socket?.localPort && BigInt(x.monoNS) < BigInt(send.monoNS));
  const failureCodes = new Set((failure?.error || []).map(x => x.code));
  const reproduced = failure?.case === "stall" && failure.step === "fresh" && warmUsesSameSocket && !!closed
    && (failureCodes.has("UND_ERR_SOCKET") || failureCodes.has("ECONNRESET"));
  const status = cleanup?.confirmed !== true ? "FAIL_OR_UNKNOWN_CHILD_STOP"
    : reproduced ? "REPRODUCED_EXPECTED_TRANSPORT_FAILURE"
      : failure ? "FAIL_OR_UNKNOWN_NOT_PROVEN_KEEPALIVE" : "PASS_NO_REPRO_CAUSE_NOT_PROVEN";
  const result = { schema: "helmut-w15-http-idle-probe/1", status, configuration: c, actualRequests: requests,
    failure, socketLink: { warmUsesSameSocket: Boolean(warmUsesSameSocket), serverClosedBeforeFreshSend: Boolean(closed),
      send: send || null, serverClose: closed || null }, cleanup,
    historicalEleventhOutcome: "UNCHANGED_UNKNOWN_NOT_REPLAYED", originalCauseProven: false,
    noRAMOrUnitAcceptance: true, databaseOperations: 0, modelCalls: 0, retries: 0,
    sourceSHA256: hash(fs.readFileSync(__filename)), gatewaySHA256: hash(fs.readFileSync(path.join(__dirname, "fixtures/z3-plattform.js"))) };
  log.write("result", { status });log.close();
  fs.writeFileSync(path.join(c.work, "RESULT.SAFE.json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ status, requests: requests.length, childStopped: cleanup?.confirmed === true,
    databaseOperations: 0, modelCalls: 0, historicalEleventhOutcome: result.historicalEleventhOutcome }));
  if (status.startsWith("FAIL")) process.exitCode = 1;return result;
}
function argumentsFor(argv) {
  let dryRun = false, config = {};
  for (let n = 0; n < argv.length; n++) {
    if (argv[n] === "--dry-run") { assert(!dryRun);dryRun = true; }
    else if (argv[n] === "--config") {
      const file = argv[++n];assert(file && path.isAbsolute(file));const s = fs.lstatSync(file);
      assert(s.isFile() && !s.isSymbolicLink() && (s.mode & 511) === 384);config = JSON.parse(fs.readFileSync(file));
    } else throw Error("idle-probe-invalid-argument");
  }
  return { config, dryRun };
}
if (require.main === module) {
  if (process.argv[2] === "--server") {
    assert(process.argv.length === 3 && typeof process.send === "function" && process.connected);
    process.once("message", config => serverProcess(config).catch(() => process.exit(1)));
  } else {
    Promise.resolve().then(() => { const args = argumentsFor(process.argv.slice(2));return main(args.config, args); })
      .catch(error => { console.error(JSON.stringify({ status: "FAIL_PRECONDITION_OR_CONTROL", error: safeFailure(error) }));process.exitCode = 1; });
  }
}
module.exports = { main, argumentsFor, safeFailure };
