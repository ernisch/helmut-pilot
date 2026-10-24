"use strict";

// Only the entry's source bytes are real. All configuration, executable pins,
// auth snapshots, children, clocks and IPC below live in synthetic VM fixtures.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), vm = require("node:vm");
const { EventEmitter } = require("node:events");
const filename = path.join(__dirname, "local-unit-original-seed.js"), root = path.resolve(__dirname, "../..");
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
function sourceSnapshot() {
  assert.equal(fs.realpathSync(filename), filename);
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const a = fs.fstatSync(fd, { bigint: true }); assert(a.isFile() && a.size > 0n && a.size < 262144n);
    const bytes = fs.readFileSync(fd), b = fs.fstatSync(fd, { bigint: true }), n = fs.lstatSync(filename, { bigint: true });
    for (const field of ["dev", "ino", "mode", "uid", "gid", "nlink", "size", "mtimeNs", "ctimeNs"]) { assert.equal(a[field], b[field]); assert.equal(b[field], n[field]); }
    assert.equal(BigInt(bytes.length), a.size); return { bytes, sha256: sha(bytes) };
  } finally { fs.closeSync(fd); }
}
const snapshot = sourceSnapshot(), code = snapshot.bytes.toString("utf8");
const CONFIG = "/bench/ORIGINAL_SEED_CONFIG.PRIVATE.json", SERVICE = "/bench/ORIGINAL_SERVICE_CONFIG.PRIVATE.json";
const INIT = "/bench/ORIGINAL_SEED_INITIALIZATION.PRIVATE.json", SOCKET = "/ram/helmut-original-write-bridge.sock";
const canonical = value => Array.isArray(value) ? "[" + value.map(canonical).join(",") + "]" : value !== null && typeof value === "object"
  ? "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}" : JSON.stringify(value);
const flush = async () => { for (let i = 0; i < 32; i++) await Promise.resolve(); };
function fakeClock() {
  const jobs = new Map(); let now = 0, next = 0;
  return { jobs, setTimeout: (fn, ms) => { const id = ++next; jobs.set(id, { fn, at: now + ms }); return id; }, clearTimeout: id => jobs.delete(id),
    advance: async ms => {
      const until = now + ms; let count = 0;
      while (true) {
        const entry = [...jobs].filter(([, job]) => job.at <= until).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!entry) break; assert(++count < 1000); now = entry[1].at; jobs.delete(entry[0]); entry[1].fn(); await flush();
      }
      now = until; await flush();
    } };
}
function observe(promise) {
  const result = { state: "pending" }; promise.then(value => { result.state = "resolved"; result.value = value; }, () => { result.state = "rejected"; }); return result;
}
function fixture(options = {}) {
  const files = new Map(), descriptors = new Map(), offsets = new Map(), readCounts = new Map(), clock = fakeClock(), events = [];
  let inode = 10, descriptor = 10, configStats = 0, selfChanged = false;
  const add = (name, bytes, props = {}) => files.set(name, { data: Buffer.from(bytes), uid: 1000, gid: 1000, mode: 0o600, nlink: 1,
    dev: 1, ino: inode++, kind: "file", mtimeNs: 1, ctimeNs: 1, ...props });
  const pin = name => ({ path: name, bytes: files.get(name).data.length, sha256: sha(files.get(name).data) });
  add(filename, snapshot.bytes); add("/synthetic/node", "synthetic Node executable");
  add("/usr/lib/postgresql/17/bin/psql", "synthetic psql executable"); add("/usr/lib/postgresql/17/bin/postgres", "synthetic PostgreSQL executable");
  const bases = { llmUsageAtomic: "llm-usage-atomic", authStateParts: "auth-state-parts", authStoreCas: "auth-store-cas",
    euServiceContract: "synthetik-500-eu-service-contract", profile: "synthetik-500-profile", streamingCanonicalHash: "streaming-canonical-hash",
    canonicalContentFacts: "canonical-content-facts", cpuEpoch: "synthetik-500-cpu-epoch", canonicalShaByteWriter: "canonical-sha-byte-writer" };
  const codePins = Object.fromEntries(Object.entries(bases).map(([key, base]) => { const name = path.join(root, "lib/helmut", base + ".js"); add(name, "synthetic " + base); return [key, pin(name)]; }));
  const operationId = "localUnitDiagnostic-" + "a".repeat(32), database = "helmut_unit_diagnostic_" + "a".repeat(32), grantId = sha("synthetic fresh grant");
  const command = { mode: "D-R-1-local-fixture", target: { database }, limits: { units: 1, production: false, paidProviderCallsAllowed: false } };
  const commandHash = sha(canonical(command)), admission = { grantId }, prefix = "localUnitDiagnostic:" + "a".repeat(32) + ":";
  const own = { localUnitDiagnosticConsumedGrantsV1: { [grantId]: { operationId, commandHash } },
    [prefix + "journal"]: { state: "installed", claimId: null, index: 0, inFlight: null, attempts: {}, stopRequested: false },
    [prefix + "costs"]: { spent: 0, calls: {} }, [prefix + "reservation"]: { operationId, commandHash, command, admission },
    [prefix + "sendClaim"]: {}, [prefix + "review"]: {}, [prefix + "result"]: { state: "pending", evidenceHash: null, positions: [] } };
  const initialization = { schema: "helmut-local-unit-original-seed-initialization/1", initialState: own,
    authority: { grantId, commandCanonical: canonical(command), admissionCanonical: canonical(admission), admissionHash: sha(canonical(admission)),
      sourceHash: sha("source"), targetHash: sha("target"), postrunHash: sha("postrun"), sourceProofHash: sha("source proof"),
      codeManifestPin: { sha256: sha("code manifest") }, runtimeManifestPin: { sha256: sha("runtime manifest") }, gateHashes: {}, verifierCodeHash: sha("verifier"),
      requestModels: {}, verifiedAtUTC: new Date().toISOString(), expiresAtUTC: new Date(Date.now() + 120000).toISOString() },
    observation: { proofCanonical: canonical({ synthetic: "observation" }), proofHash: sha(canonical({ synthetic: "observation" })), observedAtUTC: new Date().toISOString() } };
  if (options.extraOwn) own.unrelated = {};
  if (options.running) own[prefix + "journal"].state = "running";
  if (options.wrongBinding) initialization.authority.commandCanonical += " ";
  add(INIT, JSON.stringify(initialization));
  const key = Buffer.alloc(32, 9); // Fixed RAM-only fixture. Never emitted or installed.
  const processes = { measuredCgroup: { path: "/owned-group", device: 1, inode: 2, procMembership: "0::/\n" },
    postgres: { pid: 42, startTicks: "345", exePin: pin("/usr/lib/postgresql/17/bin/postgres") },
    psqlPin: pin("/usr/lib/postgresql/17/bin/psql"), libraryPath: "/usr/lib/x86_64-linux-gnu" };
  const service = { operationId, commandHash, database, ...processes, secretHex: options.arrayKey ? [key.toString("hex")] : key.toString("hex"),
    issuedAtUTC: new Date(Date.now() - 1).toISOString(), expiresAtUTC: new Date(Date.now() + 120000).toISOString() };
  add(SERVICE, JSON.stringify(service)); add(SOCKET, "", { kind: "socket", mode: 0o666 });
  const config = { schema: "helmut-local-unit-original-seed/1", operationId, commandHash, database, selfPin: pin(filename), nodePin: pin("/synthetic/node"),
    originalServiceConfigPin: pin(SERVICE), seedInitializationPin: pin(INIT), codePins,
    readRPCPins: ["helmut_auth_state_graph_read_v1", "helmut_auth_usage_read_v1"].map((name, i) => ({ oid: String(110 + i), name: "public." + name,
      identityArguments: "jsonb", prosrcSHA256: sha("synthetic body " + i), volatility: "s", returnType: "jsonb", language: "plpgsql", config: ["search_path=pg_catalog"] })), ...processes };
  if (options.missingReadPin) config.readRPCPins.pop();
  if (options.wrongCodePin) config.codePins.profile.sha256 = sha("different bytes");
  let configBytes = Buffer.from(JSON.stringify(config));
  if (options.duplicateConfig) configBytes = Buffer.from(configBytes.toString().replace('"schema":', '"schema":"duplicate","schema":'));
  add(CONFIG, options.configGrowth ? Buffer.concat([configBytes, Buffer.from("x")]) : configBytes,
    { size: configBytes.length, ...(options.configFIFO ? { kind: "fifo" } : {}), ...(options.configOversize ? { size: 1048577 } : {}),
      ...(options.configMode ? { mode: 0o640 } : {}), ...(options.configHardlink ? { nlink: 2 } : {}) });
  function stat(name, big = false) {
    const value = files.get(name) || { kind: "directory", dev: 1, ino: 2, mode: 0o700, uid: 1000, gid: 1000, nlink: 1, data: Buffer.alloc(0), mtimeNs: 1, ctimeNs: 1 };
    const number = n => big ? BigInt(n) : n;
    return { dev: number(value.dev), ino: number(value.ino), mode: number(value.mode | (value.kind === "directory" ? 0o040000 : value.kind === "socket" ? 0o140000 : value.kind === "fifo" ? 0o010000 : 0o100000)),
      uid: number(value.uid), gid: number(value.gid), nlink: number(value.nlink), size: number(value.size ?? value.data.length), mtimeNs: number(value.mtimeNs), ctimeNs: number(value.ctimeNs),
      isFile: () => value.kind === "file", isSymbolicLink: () => false, isSocket: () => value.kind === "socket" };
  }
  const fsStub = { constants: fs.constants, realpathSync: name => options.configSymlink && name === CONFIG ? "/elsewhere" : name,
    openSync: (name, flags) => { assert(files.has(name)); assert(flags & fs.constants.O_NOFOLLOW); assert(flags & fs.constants.O_NONBLOCK);
      const fd = descriptor++; descriptors.set(fd, name); offsets.set(fd, 0); return fd; },
    fstatSync: (fd, opts) => { const name = descriptors.get(fd), value = stat(name, opts?.bigint);
      if (name === CONFIG && options.configDrift && ++configStats === 2) value.ctimeNs += opts?.bigint ? 1n : 1; return value; },
    lstatSync: (name, opts) => stat(name, opts?.bigint), statSync: name => { assert.equal(name, "/owned-group"); return { dev: 1, ino: 2 }; },
    readSync: (fd, buffer, offset, length) => { const name = descriptors.get(fd), entry = files.get(name), from = offsets.get(fd), count = Math.min(length, entry.data.length - from);
      entry.data.copy(buffer, offset, from, from + count); offsets.set(fd, from + count); readCounts.set(name, (readCounts.get(name) || 0) + count); return count; },
    closeSync: fd => { descriptors.delete(fd); offsets.delete(fd); },
    readFileSync: name => { if (/^\/proc\/(7|42)\/cgroup$/.test(name)) return "0::/\n";
      const match = /^\/proc\/(7|42)\/stat$/.exec(name); assert(match, "only synthetic process metadata is readable");
      return match[1] + " (synthetic process) " + Array.from({ length: 20 }, (_, i) => i === 0 ? "S" : i === 19 ? selfChanged && match[1] === "7" ? "346" : "345" : "0").join(" "); },
    readlinkSync: name => name === "/proc/42/exe" ? "/usr/lib/postgresql/17/bin/postgres" : "/synthetic/node" };
  const spawns = [], children = [], sockets = [];
  function completeChild(child, changes = {}) {
    if (child.closed) return; child.closed = true;
    child.stdout.emit("data", Buffer.from("{}\n")); if (changes.outEOF !== false) child.stdout.emit("end"); if (changes.errEOF !== false) child.stderr.emit("end");
    child.emit("close", changes.code ?? 0, null);
  }
  const childStub = { spawn: (exe, argv, opts) => {
    assert.equal(exe, config.psqlPin.path); assert.equal(argv[argv.indexOf("-d") + 1], database); assert.equal(argv[argv.indexOf("-h") + 1], "/ram/socket");
    assert.equal(argv[argv.indexOf("-U") + 1], "postgres"); assert.equal(opts.env.PGCONNECT_TIMEOUT, "3");
    assert(!Object.keys(opts.env).some(name => /PASSWORD|TOKEN|SECRET|KEY/.test(name))); spawns.push({ exe, argv, opts });
    const child = new EventEmitter(); child.kills = [];
    for (const name of ["stdin", "stdout", "stderr"]) { child[name] = new EventEmitter(); child[name].destroy = () => { child[name].destroyed = true; }; }
    child.kill = signal => { child.kills.push(signal); return true; };
    child.stdin.end = sql => { child.sql = sql; if (!options.hangRead) Promise.resolve().then(() => completeChild(child, { code: options.nonzeroRead ? 3 : 0, outEOF: !options.missingReadEOF })); };
    children.push(child); return child;
  } };
  let originalCAS = null, receivedDTO = null;
  const netStub = { createConnection: arg => {
    assert.equal(arg.path, SOCKET); const socket = new EventEmitter(); socket.destroyed = false;
    socket.destroy = () => { if (!socket.destroyed) { socket.destroyed = true; socket.emit("close", true); } };
    socket.end = bytes => {
      events.push("owner-write"); const frame = JSON.parse(bytes.toString()), typed = { version: frame.version, nonce: frame.nonce, atUTC: frame.atUTC, bodyBase64: frame.bodyBase64 };
      assert.equal(frame.hmacSHA256, crypto.createHmac("sha256", key).update(JSON.stringify(typed)).digest("hex"));
      receivedDTO = JSON.parse(Buffer.from(frame.bodyBase64, "base64"));
      assert.equal(JSON.stringify(receivedDTO.originalCAS), JSON.stringify(originalCAS), "the genuine U.write body passes unchanged");
      assert.equal(Object.keys(receivedDTO.originalCAS).length, 8); assert.equal(receivedDTO.mode, "seed"); assert.equal(receivedDTO.claimId, null);
      assert.equal(receivedDTO.ownBefore, null); assert.equal(receivedDTO.artifact, null);
      assert.equal(canonical(receivedDTO.privateOwnerInitialization), canonical({ authority: initialization.authority, observation: initialization.observation }));
      if (options.hangOwner) return;
      const result = { schema: "helmut-local-unit-original-write-result/1", authAck: options.emptyAuthAck ? [] : [{ id: "main-auth", revision: "synthetic accepted revision" }],
        ownAck: { version: "helmut-local-unit-diagnostic-seed-ack/1", scopeHash: commandHash, operationId, revision: 0,
          hash: options.wrongOwnAck ? sha("different own state") : sha(canonical(own)), nonce: "c".repeat(64) } };
      let resultText = JSON.stringify(result); if (options.duplicateResult) resultText = resultText.replace('"schema":', '"schema":"duplicate","schema":');
      const unsigned = { schema: "helmut-local-original-owner-response/1", nonce: options.wrongNonce ? "d".repeat(64) : frame.nonce,
        status: 200, bodyBase64: Buffer.from(resultText).toString("base64") };
      const response = { ...unsigned, hmacSHA256: options.wrongMAC ? "0".repeat(64) : crypto.createHmac("sha256", key).update(JSON.stringify(unsigned)).digest("hex") };
      let raw = JSON.stringify(response); if (options.duplicateResponse) raw = raw.replace('"status":', '"status":201,"status":');
      Promise.resolve().then(() => { socket.emit("data", Buffer.from(raw + "\n")); if (!options.missingOwnerEOF) socket.emit("end"); socket.emit("close", false); });
    };
    sockets.push(socket); Promise.resolve().then(() => socket.emit("connect")); return socket;
  } };
  const history = Object.freeze([Object.freeze({ id: "old one" }), Object.freeze({ id: "old two" })]), snapshotMark = Symbol("private snapshot");
  const preserved = { stable: true, toJSON() { throw Error("full-auth-clone-forbidden"); } }, auth = { llmUsage: history, unrelated: preserved };
  Object.defineProperty(auth, snapshotMark, { value: true }); if (options.existingOwn) auth[prefix + "journal"] = {};
  const usage = { reads: 0, writes: 0, accepted: false, receivedAuthAck: null };
  const U = { enabled: () => true, hasSnapshot: value => Boolean(value?.[snapshotMark]),
    read: async ({ rowId, target, request }) => {
      usage.reads++; assert.equal(rowId, "main-auth"); assert.equal(target, "http://127.0.0.1:54321|main-auth");
      await request("/rest/v1/rpc/helmut_auth_state_graph_read_v1", { method: "POST", body: JSON.stringify({ id: "main-auth" }) }); return auth;
    }, write: async (store, { rowId, target, request }) => {
      usage.writes++; assert.equal(store, auth); assert.equal(rowId, "main-auth"); assert.equal(target, "http://127.0.0.1:54321|main-auth");
      assert.equal(store[snapshotMark], true); assert.equal(store.unrelated, preserved); assert.equal(store.llmUsage, history);
      for (let i = 0; i < history.length; i++) assert.equal(store.llmUsage[i], history[i]);
      originalCAS = { id: "main-auth", expectedRevision: "synthetic previous revision", expectedProof: { synthetic: "proof" }, expectedState: { synthetic: "state" },
        revision: "synthetic accepted revision", root: sha("new graph root"), nodes: [], additions: [] };
      const ack = await request("/rest/v1/rpc/helmut_auth_state_cas_v1", { method: "POST", body: JSON.stringify(originalCAS) }); usage.receivedAuthAck = ack;
      assert(Array.isArray(ack) && ack.length === 1 && ack[0].revision === originalCAS.revision, "U.write requires its actual IPC auth ACK");
      usage.accepted = true; return store;
    } };
  const env = { HELMUT_NATIVE_NODE_OLD_SPACE_MIB: "384", HELMUT_STORAGE_BACKEND: "supabase", HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE: database,
    HELMUT_LLM_USAGE_STORAGE: "relational-atomic-v1", HELMUT_AUTH_STATE_STORAGE: "merkle-auth-v1", SUPABASE_URL: "http://127.0.0.1:54321", ...options.env };
  const processStub = { pid: 7, version: options.nodeVersion || "v24.19.0", getuid: () => 1000, geteuid: () => 1000, env,
    execPath: "/synthetic/node", execArgv: options.execArgv || ["--max-old-space-size=384", "--max-semi-space-size=16"], argv: ["/synthetic/node", filename, "--seed-own-native-copy"] };
  const modules = { "node:fs": fsStub, "node:path": path, "node:crypto": crypto, "node:net": netStub, "node:child_process": childStub,
    "node:v8": { getHeapStatistics: () => ({ heap_size_limit: options.heapLimit || 400000000 }) },
    [codePins.llmUsageAtomic.path]: U, [codePins.profile.path]: { kanonisch: canonical, hash: value => sha(canonical(value)) }, [codePins.authStateParts.path]: { enabled: () => true } };
  const localRequire = name => { assert(Object.hasOwn(modules, name), "only synthetic dependency modules may load"); return modules[name]; }; localRequire.main = {};
  const module = { exports: {} }, api = vm.runInNewContext(code + "\n({readFile,jsonFile,nodeBudget,checkConfig,readonlySQL,psqlRead,ownerWrite,start});", {
    require: localRequire, module, __filename: filename, __dirname, process: processStub, Buffer, URL, Date, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout
  }, { filename });
  return { api, files, config, configBytes, service, initialization, own, auth, history, usage, events, spawns, children, sockets, clock, readCounts,
    get receivedDTO() { return receivedDTO; }, changeSelf: () => { selfChanged = true; } };
}
let checks = 0, current = "initialization";
async function check(name, fn) { current = name; await fn(); checks++; }
(async () => {
  await check("synthetic seed preserves full snapshot and old object identities", async () => {
    const s = fixture(), result = await s.api.start(); assert.equal(result.nativeSeed, true); assert.equal(result.oldHistoryPreserved, true);
    assert.equal(result.originalWrites, 1); assert.equal(s.usage.reads, 1); assert.equal(s.usage.writes, 1); assert.equal(s.spawns.length, 1); assert.equal(s.sockets.length, 1);
    assert.equal(s.usage.accepted, true); assert.equal(result.ownHash, sha(canonical(s.own))); assert.equal(s.receivedDTO.ownNext.canonical, canonical(s.own));
    assert.equal(result.actualNodeBudget.heapSizeLimitBytes, 400000000); assert.equal(result.claimConsumed, false); assert.equal(result.unitExecutionQualified, false); assert.equal(result.full500Qualified, false);
    assert(!JSON.stringify(result).includes("authAck")); assert(!JSON.stringify(result).includes("secretHex")); await assert.rejects(s.api.start()); assert.equal(s.sockets.length, 1);
  });
  for (const [name, options] of [["FIFO", { configFIFO: true }], ["symlink", { configSymlink: true }], ["oversize", { configOversize: true }],
    ["nonprivate mode", { configMode: true }], ["hardlink", { configHardlink: true }]]) await check("config " + name + " fails before contents", async () => {
    const s = fixture(options); assert.throws(() => s.api.jsonFile(CONFIG, { privateFile: true })); assert.equal(s.readCounts.get(CONFIG) || 0, 0); assert.equal(s.spawns.length, 0);
  });
  for (const [name, options] of [["metadata drift", { configDrift: true }], ["growth", { configGrowth: true }], ["duplicate JSON", { duplicateConfig: true }]]) await check("config " + name + " rejects boundedly", async () => {
    const s = fixture(options); assert.throws(() => s.api.jsonFile(CONFIG, { privateFile: true })); assert((s.readCounts.get(CONFIG) || 0) <= s.configBytes.length + 1);
  });
  for (const [name, options] of [["wrong version", { nodeVersion: "v24.18.0" }], ["extra flag", { execArgv: ["--max-old-space-size=384", "--max-semi-space-size=16", "--inspect"] }],
    ["empty NODE_OPTIONS", { env: { NODE_OPTIONS: "" } }], ["oversize actual heap", { heapLimit: 512 * 1024 * 1024 }]]) await check("budget " + name + " fails before I/O", async () => {
    const s = fixture(options); await assert.rejects(s.api.start()); assert.equal(s.readCounts.size, 0); assert.equal(s.spawns.length, 0);
  });
  for (const [name, options] of [["extra environment name", { env: { UNEXPECTED_OPTION: "closed" } }], ["missing RPC source pin", { missingReadPin: true }],
    ["wrong code bytes", { wrongCodePin: true }], ["array owner key", { arrayKey: true }], ["extra own field", { extraOwn: true }],
    ["already running initialization", { running: true }], ["wrong command binding", { wrongBinding: true }]]) await check(name + " fails before child/IPC", async () => {
    const s = fixture(options); await assert.rejects(s.api.start()); assert.equal(s.spawns.length, 0); assert.equal(s.sockets.length, 0);
  });
  await check("existing original namespace cannot be seeded", async () => {
    const s = fixture({ existingOwn: true }); await assert.rejects(s.api.start()); assert.equal(s.spawns.length, 1); assert.equal(s.usage.writes, 0); assert.equal(s.sockets.length, 0);
  });
  await check("readonly SQL binds exact native OID, source, invoker and pg_catalog", async () => {
    const s = fixture(); s.api.checkConfig(s.config);
    for (const pin of s.config.readRPCPins) {
      const sql = s.api.readonlySQL(s.config, "/rest/v1/rpc/" + pin.name.slice(7), { method: "POST", body: '{"id":"main-auth"}' });
      assert(sql.startsWith("BEGIN READ ONLY;")); assert(sql.includes("NOT p.prosecdef")); assert(sql.includes("p.oid=" + pin.oid + "::oid")); assert(sql.includes(pin.prosrcSHA256));
      assert(sql.includes("p.provolatile IN('i','s')")); assert(sql.includes("p.proconfig=ARRAY['search_path=pg_catalog']")); assert(sql.endsWith(" COMMIT;"));
    }
  });
  await check("unlisted RPC and arbitrary row/body cannot become SQL", async () => {
    const s = fixture();
    for (const [endpoint, options] of [["/rest/v1/rpc/arbitrary", { method: "POST", body: '{"id":"main-auth"}' }],
      ["/rest/v1/rpc/helmut_auth_usage_read_v1", { method: "POST", body: '{"id":"other"}' }],
      ["/rest/v1/rpc/helmut_auth_usage_read_v1", { method: "POST", body: '{"id":"main-auth","sql":"arbitrary"}' }]]) assert.throws(() => s.api.readonlySQL(s.config, endpoint, options));
  });
  for (const [name, options] of [["nonzero read close", { nonzeroRead: true }], ["missing read EOF", { missingReadEOF: true }]]) await check(name + " cannot reach owner write", async () => {
    const s = fixture(options); await assert.rejects(s.api.start()); assert.equal(s.sockets.length, 0); assert.equal(s.usage.writes, 0);
  });
  await check("read timeout requires bounded TERM/KILL and never invents EOF", async () => {
    const s = fixture({ hangRead: true }), outcome = observe(s.api.start()); await flush(); assert.equal(s.children.length, 1);
    await s.clock.advance(34000); assert.equal(outcome.state, "rejected"); assert(s.children[0].kills.includes("SIGTERM")); assert(s.children[0].kills.includes("SIGKILL"));
    assert.equal(s.children[0].stdout.destroyed, true); assert.equal(s.sockets.length, 0); assert.equal(s.clock.jobs.size, 0);
  });
  for (const [name, options] of [["MAC mismatch", { wrongMAC: true }], ["nonce mismatch", { wrongNonce: true }], ["duplicate response JSON", { duplicateResponse: true }],
    ["duplicate decoded result JSON", { duplicateResult: true }],
    ["missing IPC EOF", { missingOwnerEOF: true }], ["empty auth ACK", { emptyAuthAck: true }], ["wrong own ACK", { wrongOwnAck: true }]]) await check(name + " stays terminal unknown with no retry", async () => {
    const s = fixture(options); await assert.rejects(s.api.start()); await assert.rejects(s.api.start()); assert.equal(s.sockets.length, 1); assert.equal(s.usage.writes, 1);
    if (!options.wrongOwnAck) assert.equal(s.usage.accepted, false);
  });
  await check("owner timeout destroys one socket without retrying the write", async () => {
    const s = fixture({ hangOwner: true }), outcome = observe(s.api.start()); await flush(); assert.equal(s.sockets.length, 1);
    await s.clock.advance(30000); assert.equal(outcome.state, "rejected"); assert.equal(s.sockets[0].destroyed, true); await assert.rejects(s.api.start()); assert.equal(s.sockets.length, 1);
  });
  await check("frozen seed process identity is checked before every I/O phase", async () => {
    const s = fixture({ hangRead: true }), outcome = observe(s.api.start()); await flush(); s.changeSelf();
    s.children[0].stdout.emit("data", Buffer.from("{}")); s.children[0].stdout.emit("end"); s.children[0].stderr.emit("end"); s.children[0].emit("close", 0, null);
    await flush(); assert.equal(outcome.state, "rejected"); assert.equal(s.sockets.length, 0);
  });
  const after = sourceSnapshot(); assert.equal(after.sha256, snapshot.sha256);
  process.stdout.write("Original seed VM checks PASS: " + checks + "; source bytes=" + snapshot.bytes.length + "; SHA256=" + snapshot.sha256 + "; stable before/after.\n");
  process.stdout.write("No real children, sockets, private files, original snapshots, database writes or native qualification.\n");
})().catch(() => { process.stderr.write("Original seed VM tests FAIL at " + current + "; no native execution occurred.\n"); process.exitCode = 1; });
