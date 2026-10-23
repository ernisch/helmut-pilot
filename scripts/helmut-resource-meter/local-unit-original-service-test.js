"use strict";

// Every service dependency and clock below is synthetic. The only real file
// read is the code under review; no owner config, original data, child, socket,
// database, authority or provider is opened or executed.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), vm = require("node:vm");
const { EventEmitter } = require("node:events");
const sibling = path.join(__dirname, "local-unit-original-service.js");
const filename = fs.existsSync(sibling) ? sibling : "/workspace/helmut-unit60-native-20261022/scripts/helmut-resource-meter/local-unit-original-service.js";
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
function sourceSnapshot() {
  assert.equal(fs.realpathSync(filename), filename);
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const a = fs.fstatSync(fd, { bigint: true }); assert(a.isFile() && a.size > 0n && a.size < 262144n);
    const bytes = fs.readFileSync(fd), b = fs.fstatSync(fd, { bigint: true }), named = fs.lstatSync(filename, { bigint: true });
    for (const key of ["dev", "ino", "mode", "uid", "gid", "nlink", "size", "mtimeNs", "ctimeNs"]) { assert.equal(a[key], b[key]); assert.equal(b[key], named[key]); }
    assert.equal(BigInt(bytes.length), a.size); return { bytes, sha256: sha(bytes) };
  } finally { fs.closeSync(fd); }
}
const snapshot = sourceSnapshot(), code = snapshot.bytes.toString("utf8");
const CONFIG = "/bench/ORIGINAL_SERVICE_CONFIG.PRIVATE.json", SOCKET = "/ram/helmut-original-write-bridge.sock";
const LEDGER = "/bench/ORIGINAL_SERVICE_CHILDREN.SAFE.jsonl", STOP = "/bench/ORIGINAL_SERVICE_STOP.SAFE.json";
const PHASE_PREFIX = "/bench/ORIGINAL_SERVICE_PHASES_";
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function fakeClock() {
  const jobs = new Map(); let next = 0, now = 0;
  const add = (fn, delay, interval) => { const id = ++next; jobs.set(id, { fn, delay, interval, at: now + delay }); return id; };
  return { jobs, get now() { return now; }, spend: ms => { now += ms; }, setTimeout: (fn, delay) => add(fn, delay, false), clearTimeout: id => jobs.delete(id),
    setInterval: (fn, delay) => add(fn, delay, true), clearInterval: id => jobs.delete(id),
    advance: async ms => {
      const end = now + ms; let count = 0;
      while (true) {
        const entry = [...jobs].filter(([, job]) => job.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!entry) break; assert(++count < 10000, "synthetic clock remains bounded");
        const [id, job] = entry; now = job.at;
        if (job.interval) job.at += job.delay; else jobs.delete(id);
        job.fn(); await flush();
      }
      now = end; await flush();
    } };
}
function fixture(options = {}) {
  const clock = fakeClock(), events = [], files = new Map(), descriptors = new Map(), offsets = new Map(), reads = new Map(), logs = [];
  let nextFD = 10, nextInode = 100, configStats = 0, groupStats = 0, selfChanged = false;
  function add(name, bytes, props = {}) { files.set(name, { data: Buffer.from(bytes), kind: "file", uid: 1000, gid: 1000, mode: 0o600,
    dev: 1, ino: nextInode++, nlink: 1, mtimeNs: 1, ctimeNs: 1, ...props }); }
  add("/bench", "", { kind: "directory", mode: 0o700 });
  if (options.ledgerExists) add(LEDGER, "preexisting ledger");
  if (options.stopExists) add(STOP, "preexisting stop");
  if (options.phaseExists) add(PHASE_PREFIX + sha("b".repeat(64)) + ".PRIVATE.jsonl", "preexisting phase output");
  const transactionPath = path.join(path.dirname(filename), "local-unit-original-transaction.js");
  add(filename, snapshot.bytes); add(transactionPath, "synthetic transaction source");
  add("/usr/lib/postgresql/17/bin/psql", "synthetic executable bytes"); add("/usr/lib/postgresql/17/bin/postgres", "synthetic server bytes");
  const pin = name => ({ path: name, bytes: files.get(name).data.length, sha256: sha(files.get(name).data) });
  const operationId = "localUnitDiagnostic-" + "a".repeat(32), commandHash = sha("synthetic command"), database = "helmut_unit_diagnostic_" + "a".repeat(32);
  const key = Buffer.alloc(32, 7); // RAM-only synthetic protocol fixture; never printed or installed.
  const config = { schema: "helmut-local-unit-original-service/1", operationId, commandHash, database,
    issuedAtUTC: new Date(Date.now() - 1).toISOString(), expiresAtUTC: new Date(Date.now() + 120000).toISOString(),
    measuredCgroup: { path: "/owned-group", device: 1, inode: 2, procMembership: "0::/\n" },
    postgres: { pid: 42, startTicks: "345", exePin: pin("/usr/lib/postgresql/17/bin/postgres") },
    psqlPin: pin("/usr/lib/postgresql/17/bin/psql"), servicePin: pin(filename), transactionCodePin: pin(transactionPath), secretHex: key.toString("hex"),
    qualification: { operationId, commandHash, database }, libraryPath: "/usr/lib/x86_64-linux-gnu" };
  let configBytes = Buffer.from(JSON.stringify(config));
  if (options.duplicateConfig) configBytes = Buffer.from(configBytes.toString().replace('"schema":', '"schema":"duplicate","schema":'));
  add(CONFIG, options.configGrowth ? Buffer.concat([configBytes, Buffer.from("x")]) : configBytes,
    { size: configBytes.length, ...(options.configFIFO ? { kind: "fifo" } : {}), ...(options.configOversize ? { size: 1048577 } : {}) });
  function stat(name, big = false) {
    const value = files.get(name); if (!value) throw Object.assign(Error("synthetic-missing-file"), { code: "ENOENT" });
    const number = n => big ? BigInt(n) : n;
    return { dev: number(value.dev), ino: number(value.ino), uid: number(value.uid), gid: number(value.gid), nlink: number(value.nlink),
      mode: number((value.kind === "directory" ? 0o040000 : value.kind === "fifo" ? 0o010000 : 0o100000) | value.mode),
      size: number(value.size ?? value.data.length), mtimeNs: number(value.mtimeNs), ctimeNs: number(value.ctimeNs),
      isFile: () => value.kind === "file", isDirectory: () => value.kind === "directory", isSymbolicLink: () => false };
  }
  const fsStub = { constants: fs.constants,
    realpathSync: name => options.configSymlink && name === CONFIG ? "/unrelated" : name,
    openSync: (name, flags, mode) => {
      assert(flags & fs.constants.O_NOFOLLOW); assert(flags & fs.constants.O_NONBLOCK);
      if (flags & fs.constants.O_CREAT) {
        assert(flags & fs.constants.O_EXCL); assert.equal(mode, 0o600);
        if (files.has(name)) throw Object.assign(Error("synthetic-existing-file"), { code: "EEXIST" });
        if (options.ledgerOpenFailure && name === LEDGER) throw Error("synthetic-ledger-open-failure");
        if (options.phaseOpenFailure && name.startsWith(PHASE_PREFIX)) throw Error("synthetic-phase-open-failure");
        add(name, "");
      }
      assert(files.has(name));
      const fd = nextFD++; descriptors.set(fd, name); offsets.set(fd, 0); events.push("open:" + path.basename(name)); return fd;
    },
    fstatSync: (fd, opts) => {
      const name = descriptors.get(fd), result = stat(name, opts?.bigint);
      if (name === CONFIG && options.configDrift && ++configStats === 2) result.mtimeNs += opts?.bigint ? 1n : 1;
      return result;
    },
    lstatSync: (name, opts) => stat(name, opts?.bigint),
    statSync: name => {
      assert.equal(name, "/owned-group"); groupStats++;
      return { dev: options.groupDrift && groupStats >= 2 ? 2 : 1, ino: 2 };
    },
    readSync: (fd, buffer, offset, length) => {
      const name = descriptors.get(fd), value = files.get(name), start = offsets.get(fd), count = Math.min(length, value.data.length - start);
      reads.set(name, (reads.get(name) || 0) + count);
      if (name === CONFIG) assert(length <= 1048577, "config allocation/read remains capped");
      value.data.copy(buffer, offset, start, start + count); offsets.set(fd, start + count); return count;
    },
    writeSync: (fd, buffer, offset, length) => {
      const name = descriptors.get(fd), value = files.get(name);
      if (options.ledgerWriteFailure && name === LEDGER && value.data.length) throw Error("synthetic-ledger-write-failure");
      if (options.stopWriteFailure && name === STOP) throw Error("synthetic-stop-write-failure");
      if (name.startsWith(PHASE_PREFIX)) {
        if (options.phaseWriteFailureEvent && buffer.subarray(offset, offset + length).toString().includes('"event":"' + options.phaseWriteFailureEvent + '"'))
          throw Error("synthetic-phase-write-failure");
        if (options.phaseIOMS) clock.spend(options.phaseIOMS);
      }
      if (options.shortWriteZero) return 0;
      const count = options.partialWrites ? Math.min(length, 13) : length, start = offsets.get(fd), bytes = buffer.subarray(offset, offset + count);
      value.data = Buffer.concat([value.data.subarray(0, start), bytes, value.data.subarray(start + count)]); offsets.set(fd, start + count);
      value.mtimeNs++; value.ctimeNs++; events.push("write:" + path.basename(name)); return count;
    },
    fsyncSync: fd => { if (options.ledgerSyncFailure && descriptors.get(fd) === LEDGER) throw Error("synthetic-ledger-fsync-failure"); },
    closeSync: fd => { descriptors.delete(fd); offsets.delete(fd); },
    readFileSync: name => {
      if (/^\/proc\/(?:self|42|7|[1-9][0-9]{2,})\/cgroup$/.test(name)) return options.childWrongGroup && /^\/proc\/[1-9][0-9]{2,}\//.test(name) ? "0::/other\n" : "0::/\n";
      if (/^\/proc\/(?:42|7|[1-9][0-9]{2,})\/stat$/.test(name)) {
        if (options.readyIdentityFailure && name === "/proc/7/stat") throw Error("synthetic-process-identity-failed");
        const pid = Number(name.split("/")[2]);
        if (pid >= 100 && options.childProcMissing) throw Error("synthetic-child-proc-missing");
        return pid + " (synthetic process) " + Array.from({ length: 20 }, (_, i) => i === 0 ? "S" : i === 1 ? pid >= 100 ? options.childWrongParent ? "9" : "7" : "1" : i === 19 ? selfChanged && name === "/proc/7/stat" ? "346" : "345" : "0").join(" ");
      }
      if (/^\/proc\/[1-9][0-9]{2,}\/status$/.test(name)) return (options.childUIDMissing ? "" : "Uid:\t" + (options.childWrongUID ? "0\t0\t0\t0" : "1000\t1000\t1000\t1000") + "\n")
        + (options.childGIDMissing ? "" : "Gid:\t1000\t1000\t1000\t1000\n")
        + ["CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb"].map(label => label + ":\t" + (options.childCaps && label === "CapEff" ? "1" : "0000") + "\n").join("")
        + "NoNewPrivs:\t" + (options.childNoNNP ? "0" : "1") + "\n";
      throw Error("unexpected real-style read forbidden");
    },
    readlinkSync: name => /\/ns\/pid$/.test(name) ? options.childWrongNamespace && /^\/proc\/[1-9][0-9]{2,}\//.test(name) ? "pid:[456]" : "pid:[123]"
      : /^\/proc\/[1-9][0-9]{2,}\/exe$/.test(name) ? options.childWrongExe ? "/unrelated/exe" : "/usr/lib/postgresql/17/bin/psql"
        : name === "/proc/42/exe" ? "/usr/lib/postgresql/17/bin/postgres" : "/synthetic/node",
    existsSync: name => files.has(name),
    mkdirSync: (name, opts) => { assert.equal(opts.mode, 0o700); add(name, "", { kind: "directory", mode: opts.mode }); },
    writeFileSync: (name, bytes, opts) => {
      assert.equal(opts.mode, 0o600); assert.equal(opts.flag, "wx"); assert(!files.has(name));
      logs.push({ name, bytes: Buffer.from(bytes) }); add(name, bytes);
    },
    chmodSync: (name, mode) => { assert.equal(name, SOCKET); assert.equal(mode, 0o666); if (options.chmodFailure) throw Error("synthetic-chmod-failed"); }
  };
  const children = [], spawns = [];
  function child() {
    const value = new EventEmitter(); value.pid = 100 + children.length; value.spawnfile = config.psqlPin.path;
    value.exitCode = null; value.signalCode = null; value.kills = []; value.streams = [];
    for (const name of ["stdin", "stdout", "stderr"]) {
      const stream = new EventEmitter(); stream.destroyed = false; stream.destroy = () => { stream.destroyed = true; stream.emit("close"); };
      value[name] = stream; value.streams.push(stream);
    }
    value.stdin.end = sql => { value.sql = sql; events.push("stdin.end"); };
    value.kill = signal => {
      value.kills.push(signal); events.push("kill:" + signal);
      if (options.closeOnKill && !value.closed) complete(value, { code: 1 }); return true;
    };
    children.push(value); return value;
  }
  const childStub = { spawn: (executable, argv, opts) => {
    assert.equal(executable, config.psqlPin.path); assert.equal(argv[argv.indexOf("-U") + 1], "postgres");
    assert.equal(argv[argv.indexOf("-d") + 1], database); assert(argv.includes("-X") && argv.includes("-w"));
    assert.equal(opts.env.PGCONNECT_TIMEOUT, "3"); assert(!Object.keys(opts.env).some(name => /PASSWORD|TOKEN|SECRET|KEY/.test(name)));
    spawns.push({ executable, argv, opts }); events.push("spawn"); if (options.spawnThrow) throw Error("synthetic-spawn-unconfirmed"); return child();
  } };
  const server = new EventEmitter(); server.listening = false; server.closeCalls = 0;
  server.listen = name => { assert.equal(name, SOCKET); events.push("server.listen"); Promise.resolve().then(() => { server.listening = true; server.emit("listening"); }); return server; };
  server.close = callback => { events.push("server.close"); server.closeCalls++; server.listening = false; Promise.resolve().then(() => callback()); return server; };
  const netStub = { createServer: (opts, listener) => { assert.equal(opts.allowHalfOpen, true); server.connect = listener; return server; } };
  const transactionStats = { prepare: 0, accept: 0 }, result = { schema: "helmut-local-unit-original-write-result/1",
    ...(options.artifactResult ? { originalRowAck: { synthetic: true } } : { authAck: [{ synthetic: true }] }), ownAck: { synthetic: true } };
  const transaction = { prepare: (request, qualification) => {
    transactionStats.prepare++; assert.equal(request.operationId, operationId); assert.equal(request.commandHash, commandHash);
    if (options.prepareMS) clock.spend(options.prepareMS);
    if (options.prepareFailure) throw Error("synthetic-prepare-failure");
    assert.equal(qualification.database, database); const sql = "synthetic transaction text"; return { database, sql, sqlSHA256: sha(sql) };
  }, acceptResult: (prepared, raw) => {
    transactionStats.accept++; assert.equal(prepared.database, database); assert.equal(raw, JSON.stringify(result));
    if (options.acceptMS) clock.spend(options.acceptMS);
    if (options.rejectResult) throw Error("synthetic-result-unconfirmed"); return result;
  } };
  const processStub = { getuid: () => 1000, version: options.nodeVersion || "v24.19.0", env: options.env || {}, pid: 7, exitCode: 0,
    execArgv: options.execArgv || ["--max-old-space-size=384", "--max-semi-space-size=16"], umask: value => assert.equal(value, 0o077),
    hrtime: { bigint: () => BigInt(clock.now) * 1000000n } };
  processStub.stderr = { write: text => { if (options.stderrFailure) throw Error("synthetic-stderr-failure"); logs.push({ name: "stderr", bytes: Buffer.from(text) }); } };
  const buffer = Object.create(Buffer);
  buffer.from = (value, encoding) => {
    if (options.virtualBodyCap && encoding === "base64" && value === "AA==") return { length: 36 * 1024 * 1024 + 1 };
    return Buffer.from(value, encoding);
  };
  const modules = { "node:fs": fsStub, "node:net": netStub, "node:path": path, "node:crypto": crypto, "node:child_process": childStub,
    "node:v8": { getHeapStatistics: () => ({ heap_size_limit: options.heapLimit || 400000000 }) }, [transactionPath]: transaction };
  const module = { exports: {} }, localRequire = name => { assert(Object.hasOwn(modules, name), "only synthetic dependencies may load"); return modules[name]; };
  localRequire.main = {};
  const api = vm.runInNewContext(code + "\n({parse,mac,privateConfig,file,checkConfig,psql,start,nodeBudget,psqlIdentity,childLedger,transactionPhases,PHASE_CAP,LEDGER_CAP,BODY_CAP,FRAME_CAP});", {
    require: localRequire, module, __filename: filename, __dirname: path.dirname(filename), process: processStub, Buffer: buffer, Date,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, setInterval: clock.setInterval, clearInterval: clock.clearInterval
  }, { filename });
  function frame(changes = {}, rawBody = null) {
    const unsigned = { version: "helmut-local-original-owner-request/1", nonce: "b".repeat(64), atUTC: new Date().toISOString(),
      bodyBase64: rawBody === null ? Buffer.from(JSON.stringify({ operationId, commandHash, ...(options.artifactMode ? { mode: "artifact" } : {}) })).toString("base64") : rawBody, ...changes };
    return Buffer.from(JSON.stringify({ ...unsigned, hmacSHA256: crypto.createHmac("sha256", key).update(JSON.stringify(unsigned)).digest("hex") }));
  }
  function socket(holdFinish = false) {
    const value = new EventEmitter(); value.destroyed = false; value.replies = [];
    value.destroy = () => { if (!value.destroyed) { value.destroyed = true; value.emit("close"); } return value; };
    value.end = bytes => { value.replies.push(Buffer.from(bytes)); if (!holdFinish) Promise.resolve().then(() => value.emit("finish")); return value; };
    value.send = bytes => Promise.all(value.listeners("data").map(listener => listener(bytes)));
    server.connect(value); return value;
  }
  const ledger = () => api.childLedger(config, api.privateConfig().pin, { pid: 7, startTicks: "345" }, () => { processStub.exitCode = 1; });
  const runPsql = (sql, children = new Set()) => api.psql(config, sql, children, ledger(), "d".repeat(64));
  const ledgerRows = () => files.get(LEDGER).data.toString().trim().split("\n").map(text => JSON.parse(text));
  const stop = () => JSON.parse(files.get(STOP).data);
  const phaseRows = () => [...files].filter(([name]) => name.startsWith(PHASE_PREFIX)).flatMap(([, value]) =>
    value.data.toString().trim().split("\n").map(text => JSON.parse(text)));
  return { api, config, configBytes, key, frame, clock, files, reads, logs, events, children, spawns, server, process: processStub, transactionStats, result, socket, ledger, runPsql,
    ledgerRows, phaseRows, stop,
    changeSelf: () => { selfChanged = true; } };
}
function complete(child, { code = 0, stdout = null, stderr = null, outEOF = true, errEOF = true, close = true } = {}) {
  if (stdout !== null) child.stdout.emit("data", Buffer.from(stdout)); if (stderr !== null) child.stderr.emit("data", Buffer.from(stderr));
  if (outEOF) child.stdout.emit("end"); if (errEOF) child.stderr.emit("end");
  child.exitCode = code; child.signalCode = null; child.emit("exit", code, null); if (close) { child.closed = true; child.emit("close", code, null); }
}
function observe(promise) { const status = { state: "pending" }; promise.then(value => { status.state = "resolved"; status.value = value; }, error => { status.state = "rejected"; status.error = error; }); return status; }
let checks = 0, currentCheck = "initial source capture";
const phaseOnly = process.argv.includes("--phase-timing-only");
async function check(name, action) { if (phaseOnly && !name.startsWith("phase timing: ")) return; currentCheck = name; await action(); checks++; process.stdout.write("PASS " + name + "\n"); }
(async () => {
  await check("typed authenticated frame is consumed exactly once", async () => {
    const s = fixture(), observed = new Set(), frame = s.frame(); s.api.parse(frame, s.key, observed);
    assert.equal(observed.size, 1); assert.throws(() => s.api.parse(frame, s.key, observed));
  });
  for (const [name, changes] of [["nonce array", { nonce: ["b".repeat(64)] }], ["old timestamp", { atUTC: "2020-01-01T00:00:00.000Z" }],
    ["body array", { bodyBase64: ["AA=="] }]]) await check(name + " is rejected before nonce consumption", async () => {
    const s = fixture(), observed = new Set(); assert.throws(() => s.api.parse(s.frame(changes), s.key, observed)); assert.equal(observed.size, 0);
  });
  await check("incorrect MAC and duplicate frame JSON remain unauthenticated", async () => {
    const s = fixture(), frame = s.frame(), parsed = JSON.parse(frame); parsed.hmacSHA256 = "0".repeat(64);
    assert.throws(() => s.api.parse(Buffer.from(JSON.stringify(parsed)), s.key, new Set()));
    const duplicate = frame.toString().replace('"version":', '"version":"duplicate","version":');
    assert.throws(() => s.api.parse(Buffer.from(duplicate), s.key, new Set()));
  });
  await check("duplicate body JSON and noncanonical base64 cannot reach a request", async () => {
    const s = fixture(); assert.throws(() => s.api.parse(s.frame({}, Buffer.from('{"value":1,"value":2}').toString("base64")), s.key, new Set()));
    assert.throws(() => s.api.parse(s.frame({}, "YQ"), s.key, new Set()));
  });
  await check("frame and decoded-body caps fail before JSON/database processing", async () => {
    const s = fixture(); assert.throws(() => s.api.parse(Buffer.alloc(s.api.FRAME_CAP + 1), s.key, new Set()));
    const virtual = fixture({ virtualBodyCap: true }), observed = new Set();
    assert.throws(() => virtual.api.parse(virtual.frame({}, "AA=="), virtual.key, observed)); assert.equal(observed.size, 0);
  });
  await check("MAC verifies the fixed typed-field order rather than incoming property order", async () => {
    const s = fixture(), parsed = JSON.parse(s.frame());
    const reordered = { bodyBase64: parsed.bodyBase64, atUTC: parsed.atUTC, nonce: parsed.nonce, version: parsed.version, hmacSHA256: parsed.hmacSHA256 };
    assert.equal(s.api.parse(Buffer.from(JSON.stringify(reordered)), s.key, new Set()).nonce, parsed.nonce);
  });
  await check("private config returns the exact stable bounded FD bytes and pin", async () => {
    const s = fixture(), result = s.api.privateConfig(); assert.equal(result.pin.sha256, sha(s.configBytes)); assert.equal(result.pin.bytes, s.configBytes.length);
  });
  for (const [name, options] of [["config FIFO", { configFIFO: true }], ["config symlink", { configSymlink: true }], ["oversize config", { configOversize: true }]]) {
    await check(name + " fails without reading contents", async () => {
      const s = fixture(options); assert.throws(() => s.api.privateConfig()); assert.equal(s.reads.get(CONFIG) || 0, 0);
    });
  }
  for (const [name, options] of [["config drift", { configDrift: true }], ["config growth", { configGrowth: true }], ["duplicate config JSON", { duplicateConfig: true }]]) {
    await check(name + " cannot establish a config pin", async () => {
      const s = fixture(options); assert.throws(() => s.api.privateConfig()); assert((s.reads.get(CONFIG) || 0) <= s.configBytes.length + 1);
    });
  }
  await check("an array-shaped key cannot weaken HMAC configuration", async () => {
    const s = fixture(); s.config.secretHex = [s.config.secretHex]; assert.throws(() => s.api.checkConfig(s.config));
  });
  for (const [name, options] of [["extra startup flag", { execArgv: ["--max-old-space-size=384", "--max-semi-space-size=16", "--require=unrelated"] }],
    ["empty NODE_OPTIONS", { env: { NODE_OPTIONS: "" } }], ["wrong Node version", { nodeVersion: "v24.18.0" }],
    ["ineffective actual heap limit", { heapLimit: 512 * 1024 * 1024 }]]) await check(name + " cannot produce a node budget", async () => {
      const s = fixture(options); assert.throws(() => s.api.nodeBudget()); assert.equal(s.spawns.length, 0);
    });
  await check("a growing pinned file aborts after the first excess bytes", async () => {
    const s = fixture(), name = "/synthetic-growth";
    s.files.set(name, { ...s.files.get(CONFIG), data: Buffer.from("abcd"), size: 3 });
    assert.throws(() => s.api.file({ path: name, bytes: 3, sha256: sha("abc") })); assert.equal(s.reads.get(name), 4);
  });
  await check("psql success requires close0 and both natural EOFs", async () => {
    const s = fixture(), children = new Set(), state = observe(s.runPsql("synthetic SQL", children)), child = s.children[0];
    complete(child, { stdout: "synthetic output", close: false }); await flush(); assert.equal(state.state, "pending");
    child.emit("close", 0, null); await flush(); assert.equal(state.state, "resolved"); assert.equal(state.value.toString(), "synthetic output"); assert.equal(children.size, 0);
  });
  await check("ACK printed before a later nonzero psql close never succeeds", async () => {
    const s = fixture(), state = observe(s.runPsql("synthetic SQL"));
    complete(s.children[0], { code: 3, stdout: JSON.stringify(s.result) }); await flush(); assert.equal(state.state, "rejected");
  });
  for (const missing of ["outEOF", "errEOF"]) await check("missing " + missing + " rejects even close0", async () => {
    const s = fixture(), state = observe(s.runPsql("synthetic SQL"));
    complete(s.children[0], { stdout: JSON.stringify(s.result), [missing]: false }); await flush(); assert.equal(state.state, "rejected");
  });
  await check("hard close deadline rejects and retains an unobserved child without inventing EOF", async () => {
    const s = fixture(), children = new Set(), state = observe(s.runPsql("synthetic SQL", children)), child = s.children[0];
    await s.clock.advance(34000); assert.equal(state.state, "rejected"); assert.equal(children.size, 1);
    assert(child.kills.includes("SIGTERM") && child.kills.includes("SIGKILL")); assert(child.streams.every(stream => stream.destroyed));
    child.emit("close", 0, null); await flush(); assert.equal(children.size, 0); assert.equal(state.state, "rejected");
  });
  await check("stderr retention contains only byte count and hash", async () => {
    const s = fixture(), state = observe(s.runPsql("synthetic SQL")), text = "UNCLASSIFIED_PRIVATE_DIAGNOSTIC_TEXT";
    complete(s.children[0], { code: 1, stderr: text }); await flush(); assert.equal(state.state, "rejected"); assert.equal(s.logs.length, 1);
    const saved = JSON.parse(s.logs[0].bytes); assert.equal(saved.bytes, Buffer.byteLength(text)); assert.equal(saved.sha256, sha(text)); assert.equal(saved.contentsRetained, false);
    assert(!s.logs[0].bytes.toString().includes(text));
  });
  await check("nonzero child outcome cannot call transaction acceptance or reopen writes", async () => {
    const s = fixture(), service = await s.api.start(), socket = s.socket(), pending = socket.send(Buffer.concat([s.frame(), Buffer.from("\n")]));
    complete(s.children[0], { code: 3, stdout: JSON.stringify(s.result) }); await pending; await flush();
    assert.equal(s.transactionStats.accept, 0); assert.equal(JSON.parse(socket.replies[0]).status, 500);
    const second = s.socket(); assert(second.destroyed); assert.equal(s.spawns.length, 1); await assert.rejects(service.close());
  });
  await check("successful synthetic response remains locked until finish and carries the exact response MAC", async () => {
    const s = fixture(), service = await s.api.start(), socket = s.socket(true), pending = socket.send(Buffer.concat([s.frame(), Buffer.from("\n")]));
    complete(s.children[0], { stdout: JSON.stringify(s.result) }); await pending; assert.equal(s.transactionStats.accept, 1);
    const response = JSON.parse(socket.replies[0]), unsigned = { schema: response.schema, nonce: response.nonce, status: response.status, bodyBase64: response.bodyBase64 };
    assert.equal(response.status, 200); assert.equal(response.hmacSHA256, crypto.createHmac("sha256", s.key).update(JSON.stringify(unsigned)).digest("hex"));
    assert(s.socket().destroyed); socket.emit("finish"); const after = s.socket(); assert(!after.destroyed); after.destroy(); await service.close();
    assert.equal(service.ready.unitExecutionQualified, false); assert.equal(service.ready.full500Qualified, false); assert.equal(service.ready.databaseConnectionObserved, false);
    assert.equal(JSON.stringify(service.ready.actualNodeBudget), JSON.stringify({ nodeVersion: "v24.19.0",
      execArgv: ["--max-old-space-size=384", "--max-semi-space-size=16"], oldSpaceMiB: 384, semiSpaceMiB: 16, heapSizeLimitBytes: 400000000 }));
  });
  await check("artifact mode returns the actual accepted row ACK and rejects an Auth-ACK substitution", async () => {
    for (const artifactResult of [true, false]) {
      const s = fixture({ artifactMode: true, artifactResult }), service = await s.api.start(), socket = s.socket();
      const pending = socket.send(Buffer.concat([s.frame(), Buffer.from("\n")]));
      complete(s.children[0], { stdout: JSON.stringify(s.result) }); await pending; await flush();
      const response = JSON.parse(socket.replies[0]); assert.equal(response.status, artifactResult ? 200 : 500);
      if (artifactResult) assert.equal(Buffer.from(response.bodyBase64, "base64").toString(), JSON.stringify(s.result));
      else assert(s.socket().destroyed);
      assert.equal(s.transactionStats.accept, 1); if (artifactResult) await service.close(); else await assert.rejects(service.close());
    }
  });
  await check("socket loss before response makes the owner terminal even if the child later closes0", async () => {
    const s = fixture(), service = await s.api.start(), socket = s.socket(), pending = socket.send(Buffer.concat([s.frame(), Buffer.from("\n")]));
    socket.destroy(); complete(s.children[0], { stdout: JSON.stringify(s.result) }); await pending;
    assert.equal(socket.replies.length, 0); assert(s.socket().destroyed); assert.equal(s.spawns.length, 1); await assert.rejects(service.close());
    assert.equal(s.stop().cleanShutdown, false); assert.equal(s.stop().terminal, true);
  });
  await check("post-listen startup failure closes the listener", async () => {
    const s = fixture({ chmodFailure: true }); await assert.rejects(s.api.start()); assert.equal(s.server.listening, false); assert.equal(s.server.closeCalls, 1);
  });
  await check("close begins server shutdown before TERM and is idempotent", async () => {
    const s = fixture({ closeOnKill: true }), service = await s.api.start(), socket = s.socket(), pending = socket.send(Buffer.concat([s.frame(), Buffer.from("\n")]));
    const first = service.close(), second = service.close(); assert.equal(first, second); await assert.rejects(first); await pending;
    assert(s.events.indexOf("server.close") < s.events.indexOf("kill:SIGTERM")); assert.equal(s.children[0].kills.length, 1);
  });
  await check("missing child close rejects shutdown after its bounded deadline", async () => {
    const s = fixture(), service = await s.api.start(), socket = s.socket(), pending = socket.send(Buffer.concat([s.frame(), Buffer.from("\n")]));
    const closing = observe(service.close()); await s.clock.advance(6000); assert.equal(closing.state, "rejected"); assert.equal(s.server.listening, false);
    await s.clock.advance(28000); await pending; assert(s.children[0].kills.includes("SIGKILL")); assert.equal(socket.replies.length, 0);
  });
  await check("runtime identity drift closes the service with a failure exit code", async () => {
    const s = fixture(), service = await s.api.start(); s.files.get(CONFIG).data[0] ^= 1;
    await s.clock.advance(500); assert.equal(s.process.exitCode, 1); assert.equal(s.server.listening, false); await assert.rejects(service.close());
  });
  await check("the frozen service identity is rechecked independently of PostgreSQL", async () => {
    const s = fixture(), service = await s.api.start(); s.changeSelf(); await s.clock.advance(500);
    assert.equal(s.process.exitCode, 1); assert.equal(s.server.listening, false); await assert.rejects(service.close());
  });
  await check("a short-lived observed child closes from its bound handle after proc has disappeared", async () => {
    const options = {}, s = fixture(options), service = await s.api.start(), socket = s.socket();
    const pending = socket.send(Buffer.concat([s.frame(), Buffer.from("\n")]));
    assert.equal(s.children[0].sql, "synthetic transaction text");
    const rowsBeforeClose = s.ledgerRows(); assert.deepEqual(rowsBeforeClose.map(row => row.event), ["header", "spawn"]);
    assert(s.events.indexOf("stdin.end") > s.events.lastIndexOf("write:ORIGINAL_SERVICE_CHILDREN.SAFE.jsonl"));
    options.childProcMissing = true; complete(s.children[0], { stdout: JSON.stringify(s.result) }); await pending; await service.close();
    const rows = s.ledgerRows(), spawned = rows[1], closed = rows[2], receipt = s.stop();
    assert.deepEqual(spawned.process.uids, [1000, 1000, 1000, 1000]); assert.deepEqual(spawned.process.gids, [1000, 1000, 1000, 1000]);
    assert.equal(spawned.process.pid, s.children[0].pid); assert.equal(spawned.process.parentPID, 7);
    assert.equal(spawned.process.exe, s.config.psqlPin.path); assert.equal(spawned.process.pidNamespace, "pid:[123]");
    assert.equal(spawned.process.membership, "0::/\n"); assert.equal(spawned.process.capabilitiesZero, true); assert.equal(spawned.process.noNewPrivileges, true);
    assert.equal(closed.pid, spawned.process.pid); assert.equal(closed.startTicks, spawned.process.startTicks);
    assert.equal(closed.requestNonceSHA256, spawned.requestNonceSHA256); assert.equal(closed.confirmed, true);
    assert.equal(closed.exitObserved, true); assert.equal(closed.exitCode, 0); assert.equal(closed.exitSignal, null);
    assert.equal(closed.stdoutEOF, true); assert.equal(closed.stderrEOF, true); assert.equal(closed.failure, null);
    assert.equal(receipt.cleanShutdown, true); assert.equal(receipt.ledgerComplete, true); assert.equal(receipt.spawnCount, 1);
    assert.equal(receipt.closeCount, 1); assert.equal(receipt.confirmedCount, 1); assert.equal(receipt.serverClosed, true); assert.equal(receipt.childrenEmpty, true);
    assert.equal(receipt.serviceNodeExitObserved, false); assert.equal(receipt.serviceStdoutEOFObserved, false); assert.equal(receipt.serviceStderrEOFObserved, false);
    assert.equal(receipt.ledgerPin.sha256, sha(s.files.get(LEDGER).data)); assert.equal(receipt.ledgerPin.bytes, s.files.get(LEDGER).data.length);
    assert.equal(s.files.get(LEDGER).mode, 0o600); assert.equal(s.files.get(STOP).mode, 0o600);
  });
  for (const [name, fault] of [["missing proc", "childProcMissing"], ["missing UID", "childUIDMissing"], ["missing GID", "childGIDMissing"],
    ["wrong UID", "childWrongUID"], ["capability", "childCaps"], ["no NNP", "childNoNNP"], ["wrong parent", "childWrongParent"],
    ["wrong executable", "childWrongExe"], ["wrong PID namespace", "childWrongNamespace"], ["wrong cgroup", "childWrongGroup"]]) {
    await check(name + " prevents SQL before terminal child observation failure", async () => {
      const s = fixture({ [fault]: true, closeOnKill: true }), service = await s.api.start(), socket = s.socket();
      await socket.send(Buffer.concat([s.frame(), Buffer.from("\n")]));
      assert.equal(s.children[0].sql, undefined); assert.equal(s.transactionStats.accept, 0); assert.equal(s.process.exitCode, 1);
      assert(s.socket().destroyed); await assert.rejects(service.close()); assert.equal(s.stop().cleanShutdown, false); assert.equal(s.stop().ledgerComplete, false);
      assert(!s.ledgerRows().some(row => row.confirmed));
    });
  }
  for (const [name, fault] of [["preexisting ledger", "ledgerExists"], ["ledger open", "ledgerOpenFailure"], ["ledger fsync", "ledgerSyncFailure"]]) {
    await check(name + " prevents service publication and never replaces an existing artifact", async () => {
      const s = fixture({ [fault]: true }); await assert.rejects(s.api.start()); assert.equal(s.server.listening, false); assert.equal(s.spawns.length, 0);
      assert(!s.files.has(STOP)); if (fault === "ledgerExists") assert.equal(s.files.get(LEDGER).data.toString(), "preexisting ledger");
    });
  }
  await check("a failed spawn ledger write sends no SQL and cannot produce a clean stop", async () => {
    const s = fixture({ ledgerWriteFailure: true, closeOnKill: true }), service = await s.api.start(), socket = s.socket();
    await socket.send(Buffer.concat([s.frame(), Buffer.from("\n")]));
    assert.equal(s.children[0].sql, undefined); assert.equal(s.process.exitCode, 1); assert(s.socket().destroyed);
    await assert.rejects(service.close()); assert.equal(s.stop().cleanShutdown, false); assert.equal(s.stop().ledgerComplete, false);
  });
  await check("a synchronous failed spawn remains terminal without inventing a child", async () => {
    const s = fixture({ spawnThrow: true }), service = await s.api.start(), socket = s.socket();
    await socket.send(Buffer.concat([s.frame(), Buffer.from("\n")])); assert.equal(s.children.length, 0); assert.equal(s.transactionStats.accept, 0);
    assert.equal(s.process.exitCode, 1); assert(s.socket().destroyed); await assert.rejects(service.close());
    assert.equal(s.stop().cleanShutdown, false); assert.equal(s.stop().spawnCount, 0); assert.equal(s.stop().closeCount, 0);
  });
  await check("natural EOF cannot be replaced by destroyed stream close or a later synthetic end", async () => {
    const s = fixture(), service = await s.api.start(), socket = s.socket(), pending = socket.send(Buffer.concat([s.frame(), Buffer.from("\n")]));
    s.children[0].stdout.destroy(); complete(s.children[0], { stdout: JSON.stringify(s.result) }); await pending;
    const last = s.ledgerRows().at(-1); assert.equal(last.event, "close"); assert.equal(last.stdoutEOF, false); assert.equal(last.confirmed, false);
    await assert.rejects(service.close()); assert.equal(s.stop().cleanShutdown, false);
  });
  await check("lost child close never publishes a stop receipt or invents a matching ledger close", async () => {
    const s = fixture(), service = await s.api.start(), socket = s.socket(), pending = socket.send(Buffer.concat([s.frame(), Buffer.from("\n")]));
    complete(s.children[0], { stdout: JSON.stringify(s.result), close: false }); await s.clock.advance(34000); await pending;
    const stopping = observe(service.close()); await s.clock.advance(6000); assert.equal(stopping.state, "rejected");
    assert(!s.files.has(STOP)); assert.equal(s.ledgerRows().filter(row => row.event === "close").length, 0);
  });
  await check("registered child identity cannot be substituted at close", async () => {
    const s = fixture(), service = await s.api.start(), socket = s.socket(), pending = socket.send(Buffer.concat([s.frame(), Buffer.from("\n")]));
    s.children[0].pid++; complete(s.children[0], { stdout: JSON.stringify(s.result) }); await pending;
    assert.equal(s.transactionStats.accept, 0); await assert.rejects(service.close()); assert.equal(s.stop().cleanShutdown, false);
  });
  await check("child exit and close disagreement is recorded as unconfirmed", async () => {
    const s = fixture(), service = await s.api.start(), socket = s.socket(), pending = socket.send(Buffer.concat([s.frame(), Buffer.from("\n")]));
    complete(s.children[0], { stdout: JSON.stringify(s.result), close: false }); s.children[0].emit("close", 1, null); await pending;
    const row = s.ledgerRows().at(-1); assert.equal(row.exitObserved, true); assert.equal(row.exitCode, 1); assert.equal(row.confirmed, false);
    await assert.rejects(service.close()); assert.equal(s.stop().cleanShutdown, false);
  });
  await check("bounded stdout overflow cannot become a ledger or stop success", async () => {
    const s = fixture({ closeOnKill: true }), service = await s.api.start(), socket = s.socket(), pending = socket.send(Buffer.concat([s.frame(), Buffer.from("\n")]));
    s.children[0].stdout.emit("data", Buffer.alloc(1024 * 1024 + 1)); await pending;
    assert.equal(s.transactionStats.accept, 0); assert.equal(s.ledgerRows().at(-1).confirmed, false);
    await assert.rejects(service.close()); assert.equal(s.stop().cleanShutdown, false);
  });
  await check("externally oversized ledger fails without appending past the fixed byte cap", async () => {
    const s = fixture({ closeOnKill: true }), service = await s.api.start(); s.files.get(LEDGER).data = Buffer.alloc(s.api.LEDGER_CAP + 1);
    const original = s.files.get(LEDGER).data, socket = s.socket(); await socket.send(Buffer.concat([s.frame(), Buffer.from("\n")]));
    assert.equal(s.children[0].sql, undefined); assert.equal(s.files.get(LEDGER).data, original); await assert.rejects(service.close());
    assert.equal(s.stop().cleanShutdown, false);
  });
  await check("partial writes are completed once and stop publication failure stays terminal", async () => {
    const s = fixture({ partialWrites: true }), service = await s.api.start(); await service.close();
    assert.equal(s.stop().cleanShutdown, true); assert.equal(s.stop().spawnCount, 0); assert.equal(s.stop().ledgerPin.sha256, sha(s.files.get(LEDGER).data));
    const broken = fixture({ stopWriteFailure: true }), failing = await broken.api.start(); await assert.rejects(failing.close());
    assert.equal(broken.process.exitCode, 1); const bytes = broken.files.get(STOP).data; await assert.rejects(failing.close()); assert.equal(broken.files.get(STOP).data, bytes);
  });
  await check("a preexisting stop receipt is never replaced or accepted", async () => {
    const s = fixture({ stopExists: true }), service = await s.api.start(); await assert.rejects(service.close());
    assert.equal(s.files.get(STOP).data.toString(), "preexisting stop"); assert.equal(s.process.exitCode, 1);
  });
  await check("all 256 bounded request pairs fit and a 257th child stays unrecorded and terminal", async () => {
    const s = fixture(), ledger = s.ledger(), children = new Set();
    for (let i = 0; i < 256; i++) {
      const child = { pid: 100 + i }, observed = { pid: child.pid, parentPID: 7, startTicks: "345", exe: s.config.psqlPin.path,
        pidNamespace: "pid:[123]", membership: "0::/\n", uids: [1000, 1000, 1000, 1000], gids: [1000, 1000, 1000, 1000], capabilitiesZero: true, noNewPrivileges: true };
      children.add(child); ledger.spawn(child, observed, sha("VM nonce " + i));
      ledger.close(child, { exitObserved: true, exitCode: 0, exitSignal: null, stdoutEOF: true, stderrEOF: true, failure: null }, children); children.delete(child);
    }
    assert(s.files.get(LEDGER).data.length < s.api.LEDGER_CAP); assert.equal(s.ledgerRows().length, 513);
    assert.throws(() => ledger.spawn({ pid: 999 }, { pid: 999 }, sha("VM 257th nonce")));
    assert.equal(s.ledgerRows().length, 513); assert.equal(ledger.seal().ledgerComplete, false); assert.equal(s.process.exitCode, 1);
  });
  await check("ledger and stop contain only metadata with no SQL row body or authentication values", async () => {
    const s = fixture(), service = await s.api.start(), socket = s.socket(), pending = socket.send(Buffer.concat([s.frame(), Buffer.from("\n")]));
    complete(s.children[0], { stdout: JSON.stringify(s.result) }); await pending; await service.close();
    const text = s.files.get(LEDGER).data.toString() + s.files.get(STOP).data.toString();
    for (const forbidden of [s.config.secretHex, s.frame().toString(), "synthetic transaction text", JSON.stringify(s.result), "Authorization", "bodyBase64", "password", "secretHex"])
      assert(!text.includes(forbidden));
    assert(s.ledgerRows().every(row => !Object.hasOwn(row, "sql") && !Object.hasOwn(row, "args") && !Object.hasOwn(row, "stderr")));
  });
  for (const mode of ["seed", "state", "usage", "artifact"]) await check("phase timing: ordered durable boundaries for " + mode + " retain trace IO", async () => {
    const s = fixture({ prepareMS: 3, acceptMS: 5, phaseIOMS: 2, artifactMode: mode === "artifact", artifactResult: mode === "artifact" });
    const service = await s.api.start(), socket = s.socket();
    const body = Buffer.from(JSON.stringify({ operationId: s.config.operationId, commandHash: s.config.commandHash, mode })).toString("base64");
    const pending = socket.send(Buffer.concat([s.frame({}, body), Buffer.from("\n")]));
    const waiting = s.phaseRows();
    assert.deepEqual(waiting.map(row => row.event), ["header", "prepare-start", "prepare-end", "psql-start"]);
    assert.equal(waiting[0].mode, mode); assert.equal(waiting[0].requestNonceSHA256, sha("b".repeat(64)));
    assert(s.events.indexOf("spawn") > s.events.lastIndexOf("write:" + path.basename([...s.files.keys()].find(name => name.startsWith(PHASE_PREFIX)))));
    await s.clock.advance(20); complete(s.children[0], { stdout: JSON.stringify(s.result) }); await pending; await service.close();
    const rows = s.phaseRows();
    assert.deepEqual(rows.map(row => row.event), ["header", "prepare-start", "prepare-end", "psql-start", "psql-end", "accept-start", "accept-end", "terminal"]);
    assert(rows.every((row, index) => Number.isSafeInteger(row.atNS) && row.atNS >= (index ? rows[index - 1].atNS : 0)));
    assert.equal(rows[2].durationNS, 5000000); assert.equal(rows[4].durationNS, 22000000); assert.equal(rows[6].durationNS, 7000000);
    assert.equal(s.clock.now, 44); // All eight real-path trace writes remain charged; none is subtracted.
    assert(rows.slice(0, 4).every(row => row.commitProcessConfirmed === false));
    assert(rows.slice(4).every(row => row.commitProcessConfirmed === true && row.psqlInvoked === true));
    assert.equal(rows.at(-1).ackAccepted, true); assert.equal(JSON.parse(socket.replies[0]).status, 200);
    assert.deepEqual(s.ledgerRows().map(row => row.event), ["header", "spawn", "close"]);
    assert.equal(s.stop().eventCount, 3); assert.equal(s.stop().confirmedCount, 1);
    const output = [...s.files].find(([name]) => name.startsWith(PHASE_PREFIX));
    assert.equal(output[1].mode, 0o600); assert(output[1].data.length <= s.api.PHASE_CAP);
    for (const forbidden of [s.config.secretHex, s.frame().toString(), "synthetic transaction text", JSON.stringify(s.result), "bodyBase64", "Authorization"])
      assert(!output[1].data.toString().includes(forbidden));
  });
  await check("phase timing: prepare exception remains uninvoked with durable progress", async () => {
    const s = fixture({ prepareFailure: true }), service = await s.api.start(), socket = s.socket();
    await socket.send(Buffer.concat([s.frame(), Buffer.from("\n")]));
    assert.equal(s.children.length, 0); assert.equal(s.transactionStats.accept, 0);
    assert.deepEqual(s.phaseRows().map(row => row.event), ["header", "prepare-start", "prepare-end", "terminal"]);
    assert(s.phaseRows().every(row => row.psqlInvoked === false && row.commitProcessConfirmed === false));
    assert.equal(s.phaseRows().at(-1).ackAccepted, false); await assert.rejects(service.close());
  });
  await check("phase timing: nonzero or missing EOF never becomes a known commit", async () => {
    for (const outcome of [{ code: 1 }, { outEOF: false }]) {
      const s = fixture(), service = await s.api.start(), socket = s.socket(), pending = socket.send(Buffer.concat([s.frame(), Buffer.from("\n")]));
      complete(s.children[0], { stdout: JSON.stringify(s.result), ...outcome }); await pending;
      assert.equal(s.transactionStats.accept, 0); assert(s.phaseRows().every(row => row.commitProcessConfirmed === false));
      assert.equal(s.phaseRows().at(-1).ackAccepted, false); assert(!s.phaseRows().some(row => row.event === "accept-start"));
      await assert.rejects(service.close());
    }
  });
  await check("phase timing: ACK rejection preserves separately confirmed commit", async () => {
    const s = fixture({ rejectResult: true }), service = await s.api.start(), socket = s.socket(), pending = socket.send(Buffer.concat([s.frame(), Buffer.from("\n")]));
    complete(s.children[0], { stdout: JSON.stringify(s.result) }); await pending;
    assert.equal(s.ledgerRows().at(-1).confirmed, true); assert.equal(s.phaseRows().at(-1).commitProcessConfirmed, true);
    assert.equal(s.phaseRows().at(-1).ackAccepted, false); assert.equal(JSON.parse(socket.replies[0]).status, 500);
    assert(s.socket().destroyed); await assert.rejects(service.close());
  });
  await check("phase timing: postcommit trace failure cannot mark commit unsent or retry", async () => {
    for (const stderrFailure of [false, true]) {
      const s = fixture({ phaseWriteFailureEvent: "psql-end", stderrFailure }), service = await s.api.start(), socket = s.socket();
      const pending = socket.send(Buffer.concat([s.frame(), Buffer.from("\n")]));
      complete(s.children[0], { stdout: JSON.stringify(s.result) }); await pending;
      assert.equal(s.ledgerRows().at(-1).confirmed, true); assert.equal(s.transactionStats.accept, 0);
      assert.equal(JSON.parse(socket.replies[0]).status, 500); assert(s.socket().destroyed); assert.equal(s.children.length, 1);
      if (!stderrFailure) assert(s.logs.some(row => row.name === "stderr" && row.bytes.toString() === "original-owner-service-phase-publication-failed-commit-process-confirmed\n"));
      await assert.rejects(service.close()); assert.equal(s.stop().confirmedCount, 1); assert.equal(s.stop().cleanShutdown, false);
    }
  });
  await check("phase timing: preexisting and failed private outputs block before prepare", async () => {
    for (const options of [{ phaseExists: true }, { phaseOpenFailure: true }]) {
      const s = fixture(options), service = await s.api.start(), socket = s.socket();
      await socket.send(Buffer.concat([s.frame(), Buffer.from("\n")]));
      assert.equal(s.transactionStats.prepare, 0); assert.equal(s.children.length, 0); assert(s.socket().destroyed);
      if (options.phaseExists) assert.equal(s.files.get(PHASE_PREFIX + sha("b".repeat(64)) + ".PRIVATE.jsonl").data.toString(), "preexisting phase output");
      await assert.rejects(service.close());
    }
  });
  await check("phase timing: fixed fields exclude caller mode text and reject clock drift", async () => {
    const s = fixture(), outcome = { invoked: false, commitProcessConfirmed: false };
    const phases = s.api.transactionPhases("b".repeat(64), "PRIVATE_SENTINEL", 0n, outcome, () => { s.process.exitCode = 1; });
    assert.equal(s.phaseRows()[0].mode, "invalid");
    assert(!JSON.stringify(s.phaseRows()).includes("PRIVATE_SENTINEL"));
    s.clock.spend(-1); assert.throws(() => phases.start("prepare"));
    assert.throws(() => phases.finish(false)); assert.equal(s.process.exitCode, 1); assert.equal(s.phaseRows().length, 1);
  });
  const after = sourceSnapshot(); assert.equal(after.sha256, snapshot.sha256, "reviewed source changed while testing");
  process.stdout.write("Original service VM checks PASS: " + checks + "; source bytes=" + snapshot.bytes.length + "; SHA256=" + snapshot.sha256 + "; stable before/after.\n");
  process.stdout.write("No real child, socket, owner config, original data, database or native qualification.\n");
})().catch(() => { process.stderr.write("Original service VM tests FAIL at " + currentCheck + "; no native execution occurred.\n"); process.exitCode = 1; });
