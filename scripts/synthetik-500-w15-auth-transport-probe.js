"use strict";
// Fresh local Auth transport diagnosis only. No Unit/provider/old operation replay.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const assert = require("node:assert/strict"), http = require("node:http"), dc = require("node:diagnostics_channel");
const { fork, spawn } = require("node:child_process"), { performance, PerformanceObserver } = require("node:perf_hooks");
const STOP_CHECK = require.main === module && ["--stop-check", "--serve-stop-check"].includes(process.argv[2]);
const BASE = STOP_CHECK ? "/tmp/w15-postgrest-stop-check-20261028" : "/tmp/w15-auth-transport-probe-20261028a", STATE = BASE + "/state";
const DB = "helmut_w15_transport_probe_20261028a", sha = b => crypto.createHash("sha256").update(b).digest("hex");
const file = n => path.join(STATE, n), read = n => JSON.parse(fs.readFileSync(file(n)));
const save = (n, x) => fs.writeFileSync(file(n), JSON.stringify(x, null, 2) + "\n", { flag: "wx", mode: 0o600 });
const stamp = () => ({ atUTC: new Date().toISOString(), monoNS: process.hrtime.bigint().toString() });
const CODES = new Set(["UND_ERR_SOCKET", "ECONNRESET", "EPIPE", "ETIMEDOUT", "ECONNREFUSED", "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT", "UND_ERR_CONNECT_TIMEOUT", "ABORT_ERR", "AUTH_STORE_CONFLICT"]);
function failure(e) {
  const out = [];
  for (let n = 0; e && n < 4; n++, e = e.cause) {
    const frames = String(e.stack || "").split("\n").slice(1).flatMap(s => {
      const m = s.match(/(?:\(|\s)(node:[^\s()]+|\/[^\s()]+):(\d+):(\d+)\)?$/);
      if (!m || !(m[1].startsWith("node:") || m[1].startsWith(BASE + "/app/"))) return [];
      return [{ file: m[1].startsWith("node:") ? m[1] : m[1].slice((BASE + "/app/").length), line: +m[2], column: +m[3] }];
    }).slice(0, 4);
    out.push({ name: ["Error", "TypeError", "SocketError", "AbortError", "TimeoutError", "AssertionError"].includes(e.name) ? e.name : "OtherError",
      code: CODES.has(e.code) ? e.code : null, frames });
  }
  return out;
}
// PostgREST12.2.3 maps its owned SIGTERM handler to GHC UserInterrupt,
// which this pinned binary reports as SIGINT. Accept only a requested stop.
function expectedPostgrestStop(exit, requested) {
  return requested === true && !!exit && (exit.code === 0 && exit.signal === null
    || exit.code === null && ["SIGTERM", "SIGINT"].includes(exit.signal));
}
function socketMeta(s, tuple) { return s ? { localPort: tuple?.localPort ?? s.localPort ?? null,
  remotePort: tuple?.remotePort ?? s.remotePort ?? null, bytesRead: s.bytesRead, bytesWritten: s.bytesWritten,
  destroyed: s.destroyed, readableEnded: s.readableEnded, writableEnded: s.writableEnded } : null; }
function guard() {
  assert.equal(process.version, "v24.19.0");assert(require.cache[require.resolve("./lokaler-netzschutz")]);
  assert.deepEqual(require("./lokaler-netzschutz").pruefe(process.env), []);
  const c = read("configuration.PRIVATE.json");assert.equal(c.database, DB);assert.equal(c.base, BASE);
  assert.match(c.nonce, /^[a-f0-9-]{36}$/);assert.equal(c.maximumMutations, STOP_CHECK ? 0 : 16);
  if (STOP_CHECK) assert.equal(c.mode, "REAL_SERVICE_STOP_ONLY_NO_AUTH");return c;
}
function common() {
  const n = x => fs.readFileSync("/sys/fs/cgroup/" + x, "utf8").trim();
  const m = { currentBytes: +n("memory.current"), lifetimePeakBytes: +n("memory.peak"), limit: n("memory.max"),
    swapMax: n("memory.swap.max"), swap: +n("memory.swap.current"),
    events: Object.fromEntries(n("memory.events").split("\n").map(s => s.split(/\s+/)).map(([k, v]) => [k, +v])) };
  assert(m.limit === "2048000000" && m.swapMax === "0" && m.swap === 0 && m.lifetimePeakBytes <= 1638400000
    && ["max", "oom", "oom_kill", "oom_group_kill"].every(k => !m.events[k]), "auth-probe-common-limit-or-unknown");return m;
}
function logFile(name) {
  const fd = fs.openSync(file(name), "wx", 0o600);let sequence = 0;
  return { write: (name, value = {}) => { fs.writeSync(fd, JSON.stringify({ sequence: sequence++, ...stamp(), name, ...value }) + "\n");fs.fdatasyncSync(fd); },
    close: () => { fs.fdatasyncSync(fd);fs.closeSync(fd); } };
}
async function serve() {
  const c = guard(), log = logFile("gateway-observations.SAFE.jsonl");
  fs.writeFileSync(file("gateway.pid"), String(process.pid), { flag: "wx", mode: 0o600 });
  const pglog = fs.openSync(file("postgrest.PRIVATE.log"), "wx", 0o600);
  const pg = spawn(BASE + "/postgrest", [file("postgrest.PRIVATE.conf")], { env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" }, stdio: ["ignore", pglog, pglog] });
  fs.writeFileSync(file("postgrest.pid"), String(pg.pid), { flag: "wx", mode: 0o600 });
  let pgExit = null, expectedStop = false, gateway, server, stopping = false;const serverSockets = new Set();
  const exited = new Promise(resolve => pg.once("exit", (code, signal) => { pgExit = { code, signal };log.write("postgrest-exit", pgExit);resolve(pgExit); }));
  pg.once("error", e => { log.write("postgrest-start-error", { error: failure(e) });process.exitCode = 1; });
  async function stop() {
    if (stopping) return;stopping = true;expectedStop = true;const pgWasRunning = !pgExit;
    if (server) { server.closeAllConnections();await gateway.stoppe(); }
    let terminationRequested = false;
    if (!pgExit) {
      terminationRequested = pg.kill("SIGTERM");
      log.write("postgrest-signal-request", { pid: pg.pid, signal: "SIGTERM", accepted: terminationRequested });
    }
    let timer;await Promise.race([exited, new Promise(resolve => { timer = setTimeout(resolve, 4000); })]);clearTimeout(timer);
    let forced = false;if (!pgExit) { forced = true;pg.kill("SIGKILL");await exited; }
    http.globalAgent.destroy();await new Promise(resolve => setImmediate(resolve));
    const agentCount = key => Object.values(http.globalAgent[key]).reduce((n, sockets) => n + sockets.length, 0);
    const until = Date.now() + 1500;
    while ((serverSockets.size || agentCount("sockets") || agentCount("freeSockets")) && Date.now() < until)
      await new Promise(resolve => setTimeout(resolve, 10));
    const agentSockets = agentCount("sockets"), agentFreeSockets = agentCount("freeSockets");
    const expectedExit = expectedPostgrestStop(pgExit, terminationRequested);
    const confirmed = pgWasRunning && expectedExit && !forced && serverSockets.size === 0 && agentSockets === 0 && agentFreeSockets === 0;
    log.write("services-stopped", { pgExit, gateway: gateway?.bericht(), forced, openSockets: serverSockets.size,
      agentSockets, agentFreeSockets, confirmed });
    if (!serverSockets.size) log.close();fs.closeSync(pglog);
    if (process.connected) process.send({ type: "stopped", confirmed }, () => process.exit(confirmed ? 0 : 1));else process.exit(confirmed ? 0 : 1);
  }
  process.once("SIGTERM", () => void stop());process.on("message", m => { if (m.type === "stop") void stop(); });
  const until = Date.now() + 8000;let ready = false;
  while (Date.now() < until && !pgExit) {
    ready = await new Promise(resolve => {
      const req = http.get({ host: "127.0.0.1", port: 3228, path: "/", headers: { Authorization: "Bearer " + c.token }, timeout: 500 }, res => {
        let s = "";res.on("data", b => { if (s.length < 1024 * 1024) s += b; });res.on("end", () => {
          try { const p = JSON.parse(s).paths;resolve(res.statusCode === 200 && p?.["/rpc/helmut_auth_usage_read_v1"] && p?.["/rpc/helmut_auth_usage_cas_v1"]); } catch { resolve(false); }
        }); });req.on("error", () => resolve(false));req.on("timeout", () => req.destroy());
    });
    if (ready) break;await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) { await stop();throw Error("auth-probe-native-rpc-readiness"); }
  const create = http.createServer;let socketN = 0;const ids = new WeakMap();
  http.createServer = function(...args) {
    server = create.apply(this, args);
    server.on("connection", s => { const id = ++socketN, tuple = socketMeta(s);ids.set(s, id);serverSockets.add(s);
      log.write("socket-connect", { id, socket: tuple });
      for (const event of ["end", "close", "error"]) s.on(event, e => {
        if (event === "close") serverSockets.delete(s);
        log.write("socket-" + event, { id, socket: socketMeta(s, tuple), ...(event === "error" ? { error: failure(e) } : {}) });
      }); });
    server.on("request", (req, res) => { const p = req.url.split("?")[0];const route = p.endsWith("read_v1") ? "read" : p.endsWith("cas_v1") ? "cas" : "other";
      log.write("gateway-request", { id: ids.get(req.socket), route });
      res.on("finish", () => log.write("gateway-finish", { id: ids.get(req.socket), route, status: res.statusCode,
        keepAlive: res.getHeader("keep-alive") ?? null })); });return server;
  };
  try { gateway = await require("./fixtures/z3-plattform").starteDatenbankTor({ postgrestPort: 3228 }); }
  finally { http.createServer = create; }
  log.write("real-defaults", { keepAliveTimeout: server.keepAliveTimeout, keepAliveTimeoutBuffer: server.keepAliveTimeoutBuffer,
    headersTimeout: server.headersTimeout, requestTimeout: server.requestTimeout, agentKeepAlive: http.globalAgent.keepAlive });
  pg.on("exit", () => { if (!expectedStop && process.connected) process.send({ type: "service-failed", error: pgExit }); });
  process.send({ type: "ready", url: gateway.url });
}
async function main({ dryRun = false } = {}) {
  const c = guard();if (dryRun) { console.log(JSON.stringify({ status: "PASS_DRY_ARGS_CONFIG_NO_HTTP_OR_DATABASE", database: DB, maximumMutations: 16 }));return; }
  const Auth = require("./fixtures/w15-auth-measurement-report"), Durable = require("./fixtures/w15-durable-observations");
  const log = logFile("transport-observations.SAFE.jsonl"), durable = Durable.open(STATE, "run");
  let observed, worker, workerExit, serviceStopped = false, index = -1, stage = "setup", expectedRevision, nativeCalls = 0, stopped = false, firstError = null;
  const started = performance.now(), deadline = Date.now() + 300000, reports = [], sockets = new WeakMap(), clientSockets = new Set(), requests = new WeakMap(), subscriptions = [], socketSubscriptions = [], requestErrors = [];let socketN = 0, requestN = 0;
  function snapshot() { return { index, stage, error: firstError, reports, authTimings: observed ? Auth.summarize(observed) : null,
    mutations: observed?.mutations, casWrites: observed?.casWrites, common: (() => { try { return common(); } catch { return null; } })() }; }
  const remove = Auth.retainOnTermination(snapshot, x => { durable.write("termination-received", x);save("ABORT.SAFE.json", x); });durable.ready();
  const timer = setInterval(() => { try { const m = common();if (Date.now() >= deadline) throw Error("auth-probe-300s-deadline");
    log.write("common-memory", { ...m, node: process.memoryUsage() }); } catch (e) { stopped = true;firstError ||= failure(e);process.kill(process.pid, "SIGTERM"); } }, 100);
  const gc = new PerformanceObserver(list => { for (const e of list.getEntries()) log.write("node-gc", { startMs: e.startTime, durationMs: e.duration, kind: e.detail.kind }); });gc.observe({ entryTypes: ["gc"] });
  for (const name of ["undici:request:create", "undici:client:connected", "undici:client:sendHeaders", "undici:request:bodySent", "undici:request:headers", "undici:request:trailers", "undici:request:error"]) {
    const handler = x => { if (x.request && !requests.has(x.request)) requests.set(x.request, ++requestN);
      if (x.socket && !sockets.has(x.socket)) {
        const id = ++socketN, tuple = socketMeta(x.socket);sockets.set(x.socket, id);clientSockets.add(x.socket);
        for (const event of ["end", "close", "error"]) {
          const handler = e => { if (event === "close") clientSockets.delete(x.socket);
            log.write("client-socket-" + event, { id, socket: socketMeta(x.socket, tuple), ...(event === "error" ? { error: failure(e) } : {}) }); };
          x.socket.on(event, handler);socketSubscriptions.push([x.socket, event, handler]);
        }
      }
      const p = String(x.request?.path || "").split("?")[0];
      const fields = { index, stage, requestID: x.request ? requests.get(x.request) : null,
        route: p.endsWith("read_v1") ? "read" : p.endsWith("cas_v1") ? "cas" : "other",
        socketID: x.socket ? sockets.get(x.socket) : null, socket: socketMeta(x.socket),
        status: x.response?.statusCode ?? null, ...(x.error ? { error: failure(x.error) } : {}) };
      if (x.error) requestErrors.push({ name, ...stamp(), ...fields });log.write(name, fields);
    };dc.channel(name).subscribe(handler);subscriptions.push([name, handler]);
  }
  let result;
  try {
    common();worker = fork(__filename, ["--serve"], { execPath: process.execPath,
      execArgv: ["--require", path.join(__dirname, "lokaler-netzschutz.js")],
      env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8", HELMUT_SOURCE_MODE: "off", HELMUT_STORAGE_BACKEND: "local" }, stdio: ["ignore", "ignore", "ignore", "ipc"] });
    worker.once("exit", (code, signal) => { workerExit = { code, signal }; });
    const ready = await new Promise((resolve, reject) => { const t = setTimeout(() => reject(Error("auth-probe-service-ready-timeout")), 12000);
      worker.on("message", m => { if (m.type === "ready") { clearTimeout(t);resolve(m); }
        if (m.type === "stopped") serviceStopped = m.confirmed === true;
        if (m.type === "service-failed") { stopped = true;firstError ||= [{ name: "Error", code: null, frames: [] }]; } });
      worker.once("exit", () => { clearTimeout(t);reject(Error("auth-probe-service-early-exit")); });worker.once("error", reject); });
    Object.assign(process.env, { SUPABASE_URL: ready.url, SUPABASE_SERVICE_ROLE_KEY: c.token, HELMUT_STORAGE_BACKEND: "supabase",
      HELMUT_SUPABASE_AUTH_STORE_ID: "main-auth", HELMUT_LLM_USAGE_STORAGE: "relational-atomic-v1" });
    const P = require("../lib/helmut/synthetik-500-profile"), S = require("../lib/helmut/storage"), Atomic = require("../lib/helmut/llm-usage-atomic");
    const encoded = fs.readFileSync(file("current-command.PRIVATE.json"));assert.equal(encoded.length, c.commandPin.bytes);assert.equal(sha(encoded), c.commandPin.sha256);
    const held = require("../lib/helmut/synthetik-500-direct-codec").decode(JSON.parse(encoded)).command;
    assert.equal(held.drafts.length, 500);assert.equal(held.units.length, 500);assert(Object.isFrozen(held));assert.equal(typeof require("../server"), "function");
    const content = a => P.hash(Object.fromEntries(Object.entries(a).filter(([k]) => !["_authStoreRevision", "w15TransportProbe"].includes(k))));
    stage = "baseline";let before = await S.readAuthStore({ strict: true });assert.equal(before.llmUsage.length, 6000);
    assert.equal(before.w15MemoryProbeSequence, 9);assert(!Object.hasOwn(before, "w15TransportProbe"));const beforeHash = content(before);before = null;
    const native = Atomic.write;Atomic.write = async function(...args) { nativeCalls++;assert.equal(nativeCalls, 1, "auth-probe-refuse-second-native-write");
      const value = await native.apply(this, args);expectedRevision = value._authStoreRevision;return value; };
    observed = require("./synthetik-500-w15-full500-runtime").observeAuth(S, { currentIndex: () => index });durable.observe(observed);
    for (index = 0; index < 16; index++) {
      common();assert(!stopped && Date.now() + 40000 < deadline && !fs.existsSync(file("STOP_REQUESTED.SAFE.json")), "auth-probe-stop-or-time-budget");
      nativeCalls = 0;expectedRevision = null;stage = "mutate";
      await S.mutateAuthStore(a => { a.w15TransportProbe = { nonce: c.nonce, index }; });
      assert.equal(nativeCalls, 1);assert(expectedRevision);assert(observed.assessment().pass);
      stage = "readback";const after = await S.readAuthStore({ strict: true });
      assert.equal(after._authStoreRevision, expectedRevision);assert.deepEqual(after.w15TransportProbe, { nonce: c.nonce, index });
      assert.equal(after.llmUsage.length, 6000);assert.equal(after.w15MemoryProbeSequence, 9);assert.equal(content(after), beforeHash);
      const row = { index, acknowledged: true, postimagePreserved: true, authTimings: Auth.summarize(observed), common: common() };reports.push(row);
      log.write("new-nonce-ACK", row);console.log(JSON.stringify({ name: "new-nonce-ACK", ...row }));
    }
    assert.equal(held.drafts.length, 500);result = { status: "PASS_BOUNDED_16_NO_REPRO_NOT_RAM_ACCEPTANCE" };
  } catch (e) {
    stopped = true;firstError ||= failure(e);
    const transportCodes = new Set(["UND_ERR_SOCKET", "ECONNRESET", "EPIPE", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"]);
    const matching = firstError[0]?.name === "TypeError" && requestErrors.find(x => x.index === index && x.stage === "mutate" && x.route === "cas"
      && x.error.some(y => transportCodes.has(y.code)) && firstError.some(y => transportCodes.has(y.code)));
    result = { status: matching ? "OBSERVED_TRANSPORT_FAILURE_NEW_NONCE_DIAGNOSTIC_ONLY" : "FAIL_UNKNOWN_STOPPED", error: firstError,
      matchingRequestError: matching || null, rootCauseBeyondTransportProven: false };
  }
  finally {
    gc.disconnect();for (const [name, handler] of subscriptions) dc.channel(name).unsubscribe(handler);
    if (worker && !workerExit && worker.connected) worker.send({ type: "stop" });
    if (worker && !workerExit) await new Promise(resolve => { const t = setTimeout(resolve, 6000);worker.once("exit", () => { clearTimeout(t);resolve(); }); });
    // Only after processing has stopped: close owned diagnostic client sockets,
    // record every terminal close, then seal the journal. No request is retried.
    for (const socket of clientSockets) { log.write("owned-client-cleanup", { socketID: sockets.get(socket) });socket.destroy(); }
    const until = Date.now() + 1500;
    while (clientSockets.size && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 10));
    await new Promise(resolve => setImmediate(resolve));
    if (!clientSockets.size) for (const [socket, name, handler] of socketSubscriptions) socket.removeListener(name, handler);
    let finalCommon = null;
    try { finalCommon = common(); } catch (error) { firstError ||= failure(error);result = { status: "FAIL_UNKNOWN_FINAL_MEMORY" }; }
    if (result?.status === "PASS_BOUNDED_16_NO_REPRO_NOT_RAM_ACCEPTANCE" && firstError) result.status = "FAIL_UNKNOWN_LATE_SERVICE_ERROR";
    clearInterval(timer);remove();
    result ||= { status: "FAIL_UNKNOWN_STOPPED" };Object.assign(result, snapshot(), { finalCommon, nonce: c.nonce,
      runtimeWallMs: performance.now() - started, childExit: workerExit || null, childStopConfirmed: serviceStopped && workerExit?.code === 0 && workerExit?.signal === null,
      remainingClientSockets: clientSockets.size, requestErrors, originalEleventhOutcome: "UNCHANGED_UNKNOWN_NOT_REPLAYED",
      databaseOperationsScope: "new-cloned-local-database-only", profileActivations: 0, units: 0, modelCalls: 0, retries: 0, RAMAcceptance: false });
    if (!result.childStopConfirmed || clientSockets.size) result.status = "FAIL_UNKNOWN_CHILD_OR_SOCKET_CLOSURE";
    log.write("result", { status: result.status });if (!clientSockets.size) log.close();save("RESULT.SAFE.json", result);
  }
  console.log(JSON.stringify({ status: result.status, completed: reports.length, error: firstError }));
  if (result.status.startsWith("FAIL")) process.exitCode = 1;return result;
}
// Same genuine serve()/PostgREST signal predicate as the Auth diagnosis. This
// mode never enters main(), storage, any RPC, or an Auth observer.
async function stopCheck({ dryRun = false } = {}) {
  const c = guard();assert(STOP_CHECK);assert.equal(c.maximumMutations, 0);
  if (dryRun) { console.log(JSON.stringify({ status: "PASS_STOP_CHECK_DRY_NO_HTTP_OR_DATABASE", database: DB,
    maximumMutations: 0, sourceSHA256: sha(fs.readFileSync(__filename)) }));return; }
  const Auth = require("./fixtures/w15-auth-measurement-report"), Durable = require("./fixtures/w15-durable-observations");
  const journal = Durable.open(STATE, "run"), started = performance.now();
  let child, exit, stoppedReceipt = null, error = null, ready = false;
  const abort = Auth.retainOnTermination(() => ({ phase: "real-stop-check", exit, ready, stoppedReceipt,
    authCalls: 0, CASWrites: 0, units: 0, modelCalls: 0 }), x => { journal.write("termination-received", x);save("ABORT.SAFE.json", x); });
  journal.ready();
  try {
    common();
    child = fork(__filename, ["--serve-stop-check"], { execPath: process.execPath,
      execArgv: ["--require", path.join(__dirname, "lokaler-netzschutz.js")],
      env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8", HELMUT_SOURCE_MODE: "off", HELMUT_STORAGE_BACKEND: "local" },
      stdio: ["ignore", "ignore", "ignore", "ipc"] });
    child.once("exit", (code, signal) => { exit = { code, signal }; });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("stop-check-child-readiness-timeout")), 12000);
      child.on("message", m => {
        if (m.type === "stopped") stoppedReceipt = m;
        if (m.type === "service-failed") { error ||= [{ name: "Error", code: null, frames: [] }]; }
        if (m.type === "ready") { ready = true;clearTimeout(timer);resolve(); }
      });
      child.once("error", e => { clearTimeout(timer);reject(e); });
      child.once("exit", () => { clearTimeout(timer);if (!ready) reject(Error("stop-check-child-early-exit")); });
    });
    assert(!error && !exit, "stop-check-service-failed-before-stop");
    journal.write("IPC-stop-request", { childPID: child.pid });child.send({ type: "stop" });
    await new Promise((resolve, reject) => {
      if (exit) return resolve();const timer = setTimeout(() => reject(Error("stop-check-child-stop-timeout")), 8000);
      child.once("exit", () => { clearTimeout(timer);resolve(); });
    });
    assert(exit?.code === 0 && exit?.signal === null && stoppedReceipt?.confirmed === true && !error,
      "stop-check-child-stop-unconfirmed");
    const rows = fs.readFileSync(file("gateway-observations.SAFE.jsonl"), "utf8").trim().split("\n").map(s => JSON.parse(s));
    const signals = rows.filter(x => x.name === "postgrest-signal-request"), exits = rows.filter(x => x.name === "postgrest-exit");
    const closed = rows.filter(x => x.name === "services-stopped");
    assert.equal(signals.length, 1);assert.equal(signals[0].signal, "SIGTERM");assert.equal(signals[0].accepted, true);
    assert.equal(exits.length, 1);assert(expectedPostgrestStop(exits[0], signals[0].accepted));
    assert.equal(closed.length, 1);assert(closed[0].confirmed === true && closed[0].forced === false && closed[0].openSockets === 0);
    assert.equal(closed[0].agentSockets, 0);assert.equal(closed[0].agentFreeSockets, 0);
    assert.equal(closed[0].gateway.anfragen, 0, "stop-check-must-not-send-gateway-request");
    assert(!rows.some(x => x.name === "gateway-request"), "stop-check-no-gateway-RPC");common();
    const result = { status: "PASS_REAL_POSTGREST_CONTROLLED_STOP", signalRequest: signals[0], postgrestExit: exits[0],
      servicesStopped: closed[0], childExit: exit, stoppedReceipt, realElapsedMs: performance.now() - started,
      authCalls: 0, CASWrites: 0, units: 0, modelCalls: 0, gatewayHTTPRequests: 0,
      HTTPscope: "Only existing serve() bounded small authenticated OpenAPI readiness GETs, no RPC.",
      memoryAcceptance: false, common: common(), sourceSHA256: sha(fs.readFileSync(__filename)),
      serveSHA256: sha(Buffer.from(serve.toString())), expectedStopSHA256: sha(Buffer.from(expectedPostgrestStop.toString())) };
    journal.write("real-stop-check-passed", result);save("RESULT.SAFE.json", result);return result;
  } catch (e) {
    error ||= failure(e);const result = { status: "FAIL_REAL_POSTGREST_CONTROLLED_STOP_UNKNOWN", error,
      ready, childExit: exit || null, stoppedReceipt, authCalls: 0, CASWrites: 0, units: 0, modelCalls: 0,
      retryAllowed: false, outerOwnedCleanupRequired: !exit };
    journal.write("real-stop-check-failed", result);save("RESULT.SAFE.json", result);process.exitCode = 1;return result;
  } finally { abort(); }
}
if (require.main === module) {
  const args = process.argv.slice(2);
  const stopArgs = args[0] === "--stop-check" && (args.length === 1 || args.length === 2 && args[1] === "--dry-run")
    || args.length === 1 && args[0] === "--serve-stop-check";
  assert(stopArgs || args.length <= 1 && [undefined, "--serve", "--dry-run"].includes(args[0]));
  Promise.resolve().then(() => ["--serve", "--serve-stop-check"].includes(args[0]) ? serve()
    : STOP_CHECK ? stopCheck({ dryRun: args[1] === "--dry-run" }) : main({ dryRun: args[0] === "--dry-run" }))
    .catch(e => { console.error(JSON.stringify({ status: "FAIL_PRECONDITION", error: failure(e) }));process.exitCode = 1; });
}
module.exports = { main, failure, common, expectedPostgrestStop, stopCheck };
