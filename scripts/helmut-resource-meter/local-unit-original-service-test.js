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
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function fakeClock() {
  const jobs = new Map(); let next = 0, now = 0;
  const add = (fn, delay, interval) => { const id = ++next; jobs.set(id, { fn, delay, interval, at: now + delay }); return id; };
  return { jobs, get now() { return now; }, setTimeout: (fn, delay) => add(fn, delay, false), clearTimeout: id => jobs.delete(id),
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
    openSync: (name, flags) => {
      assert(flags & fs.constants.O_NOFOLLOW); assert(flags & fs.constants.O_NONBLOCK); assert(files.has(name));
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
    closeSync: fd => { descriptors.delete(fd); offsets.delete(fd); },
    readFileSync: name => {
      if (/^\/proc\/(?:self|42|7)\/cgroup$/.test(name)) return "0::/\n";
      if (/^\/proc\/(?:42|7)\/stat$/.test(name)) {
        if (options.readyIdentityFailure && name === "/proc/7/stat") throw Error("synthetic-process-identity-failed");
        return "42 (synthetic process) " + Array.from({ length: 20 }, (_, i) => i === 0 ? "S" : i === 19 ? selfChanged && name === "/proc/7/stat" ? "346" : "345" : "0").join(" ");
      }
      throw Error("unexpected real-style read forbidden");
    },
    readlinkSync: name => name === "/proc/42/exe" ? "/usr/lib/postgresql/17/bin/postgres" : "/synthetic/node",
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
    const value = new EventEmitter(); value.kills = []; value.streams = [];
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
    spawns.push({ executable, argv, opts }); events.push("spawn"); return child();
  } };
  const server = new EventEmitter(); server.listening = false; server.closeCalls = 0;
  server.listen = name => { assert.equal(name, SOCKET); events.push("server.listen"); Promise.resolve().then(() => { server.listening = true; server.emit("listening"); }); return server; };
  server.close = callback => { events.push("server.close"); server.closeCalls++; server.listening = false; Promise.resolve().then(() => callback()); return server; };
  const netStub = { createServer: (opts, listener) => { assert.equal(opts.allowHalfOpen, true); server.connect = listener; return server; } };
  const transactionStats = { prepare: 0, accept: 0 }, result = { schema: "helmut-local-unit-original-write-result/1", authAck: [{ synthetic: true }], ownAck: { synthetic: true } };
  const transaction = { prepare: (request, qualification) => {
    transactionStats.prepare++; assert.equal(request.operationId, operationId); assert.equal(request.commandHash, commandHash);
    assert.equal(qualification.database, database); const sql = "synthetic transaction text"; return { database, sql, sqlSHA256: sha(sql) };
  }, acceptResult: (prepared, raw) => {
    transactionStats.accept++; assert.equal(prepared.database, database); assert.equal(raw, JSON.stringify(result));
    if (options.rejectResult) throw Error("synthetic-result-unconfirmed"); return result;
  } };
  const processStub = { getuid: () => 1000, version: options.nodeVersion || "v24.19.0", env: options.env || {}, pid: 7, exitCode: 0,
    execArgv: options.execArgv || ["--max-old-space-size=384", "--max-semi-space-size=16"], umask: value => assert.equal(value, 0o077),
    hrtime: { bigint: () => BigInt(clock.now) * 1000000n } };
  const buffer = Object.create(Buffer);
  buffer.from = (value, encoding) => {
    if (options.virtualBodyCap && encoding === "base64" && value === "AA==") return { length: 36 * 1024 * 1024 + 1 };
    return Buffer.from(value, encoding);
  };
  const modules = { "node:fs": fsStub, "node:net": netStub, "node:path": path, "node:crypto": crypto, "node:child_process": childStub,
    "node:v8": { getHeapStatistics: () => ({ heap_size_limit: options.heapLimit || 400000000 }) }, [transactionPath]: transaction };
  const module = { exports: {} }, localRequire = name => { assert(Object.hasOwn(modules, name), "only synthetic dependencies may load"); return modules[name]; };
  localRequire.main = {};
  const api = vm.runInNewContext(code + "\n({parse,mac,privateConfig,file,checkConfig,psql,start,nodeBudget,BODY_CAP,FRAME_CAP});", {
    require: localRequire, module, __filename: filename, __dirname: path.dirname(filename), process: processStub, Buffer: buffer, Date,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, setInterval: clock.setInterval, clearInterval: clock.clearInterval
  }, { filename });
  function frame(changes = {}, rawBody = null) {
    const unsigned = { version: "helmut-local-original-owner-request/1", nonce: "b".repeat(64), atUTC: new Date().toISOString(),
      bodyBase64: rawBody === null ? Buffer.from(JSON.stringify({ operationId, commandHash })).toString("base64") : rawBody, ...changes };
    return Buffer.from(JSON.stringify({ ...unsigned, hmacSHA256: crypto.createHmac("sha256", key).update(JSON.stringify(unsigned)).digest("hex") }));
  }
  function socket(holdFinish = false) {
    const value = new EventEmitter(); value.destroyed = false; value.replies = [];
    value.destroy = () => { if (!value.destroyed) { value.destroyed = true; value.emit("close"); } return value; };
    value.end = bytes => { value.replies.push(Buffer.from(bytes)); if (!holdFinish) Promise.resolve().then(() => value.emit("finish")); return value; };
    value.send = bytes => Promise.all(value.listeners("data").map(listener => listener(bytes)));
    server.connect(value); return value;
  }
  return { api, config, configBytes, key, frame, clock, files, reads, logs, events, children, spawns, server, process: processStub, transactionStats, result, socket,
    changeSelf: () => { selfChanged = true; } };
}
function complete(child, { code = 0, stdout = null, stderr = null, outEOF = true, errEOF = true, close = true } = {}) {
  if (stdout !== null) child.stdout.emit("data", Buffer.from(stdout)); if (stderr !== null) child.stderr.emit("data", Buffer.from(stderr));
  if (outEOF) child.stdout.emit("end"); if (errEOF) child.stderr.emit("end");
  child.emit("exit", code, null); if (close) { child.closed = true; child.emit("close", code, null); }
}
function observe(promise) { const status = { state: "pending" }; promise.then(value => { status.state = "resolved"; status.value = value; }, error => { status.state = "rejected"; status.error = error; }); return status; }
let checks = 0;
async function check(name, action) { await action(); checks++; process.stdout.write("PASS " + name + "\n"); }
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
    const s = fixture(), children = new Set(), state = observe(s.api.psql(s.config, "synthetic SQL", children)), child = s.children[0];
    complete(child, { stdout: "synthetic output", close: false }); await flush(); assert.equal(state.state, "pending");
    child.emit("close", 0, null); await flush(); assert.equal(state.state, "resolved"); assert.equal(state.value.toString(), "synthetic output"); assert.equal(children.size, 0);
  });
  await check("ACK printed before a later nonzero psql close never succeeds", async () => {
    const s = fixture(), state = observe(s.api.psql(s.config, "synthetic SQL", new Set()));
    complete(s.children[0], { code: 3, stdout: JSON.stringify(s.result) }); await flush(); assert.equal(state.state, "rejected");
  });
  for (const missing of ["outEOF", "errEOF"]) await check("missing " + missing + " rejects even close0", async () => {
    const s = fixture(), state = observe(s.api.psql(s.config, "synthetic SQL", new Set()));
    complete(s.children[0], { stdout: JSON.stringify(s.result), [missing]: false }); await flush(); assert.equal(state.state, "rejected");
  });
  await check("hard close deadline rejects and retains an unobserved child without inventing EOF", async () => {
    const s = fixture(), children = new Set(), state = observe(s.api.psql(s.config, "synthetic SQL", children)), child = s.children[0];
    await s.clock.advance(34000); assert.equal(state.state, "rejected"); assert.equal(children.size, 1);
    assert(child.kills.includes("SIGTERM") && child.kills.includes("SIGKILL")); assert(child.streams.every(stream => stream.destroyed));
    child.emit("close", 0, null); await flush(); assert.equal(children.size, 0); assert.equal(state.state, "rejected");
  });
  await check("stderr retention contains only byte count and hash", async () => {
    const s = fixture(), state = observe(s.api.psql(s.config, "synthetic SQL", new Set())), text = "UNCLASSIFIED_PRIVATE_DIAGNOSTIC_TEXT";
    complete(s.children[0], { code: 1, stderr: text }); await flush(); assert.equal(state.state, "rejected"); assert.equal(s.logs.length, 1);
    const saved = JSON.parse(s.logs[0].bytes); assert.equal(saved.bytes, Buffer.byteLength(text)); assert.equal(saved.sha256, sha(text)); assert.equal(saved.contentsRetained, false);
    assert(!s.logs[0].bytes.toString().includes(text));
  });
  await check("nonzero child outcome cannot call transaction acceptance or reopen writes", async () => {
    const s = fixture(), service = await s.api.start(), socket = s.socket(), pending = socket.send(Buffer.concat([s.frame(), Buffer.from("\n")]));
    complete(s.children[0], { code: 3, stdout: JSON.stringify(s.result) }); await pending; await flush();
    assert.equal(s.transactionStats.accept, 0); assert.equal(JSON.parse(socket.replies[0]).status, 500);
    const second = s.socket(); assert(second.destroyed); assert.equal(s.spawns.length, 1); await service.close();
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
  await check("socket loss before response makes the owner terminal even if the child later closes0", async () => {
    const s = fixture(), service = await s.api.start(), socket = s.socket(), pending = socket.send(Buffer.concat([s.frame(), Buffer.from("\n")]));
    socket.destroy(); complete(s.children[0], { stdout: JSON.stringify(s.result) }); await pending;
    assert.equal(socket.replies.length, 0); assert(s.socket().destroyed); assert.equal(s.spawns.length, 1); await service.close();
  });
  await check("post-listen startup failure closes the listener", async () => {
    const s = fixture({ chmodFailure: true }); await assert.rejects(s.api.start()); assert.equal(s.server.listening, false); assert.equal(s.server.closeCalls, 1);
  });
  await check("close begins server shutdown before TERM and is idempotent", async () => {
    const s = fixture({ closeOnKill: true }), service = await s.api.start(), socket = s.socket(), pending = socket.send(Buffer.concat([s.frame(), Buffer.from("\n")]));
    const first = service.close(), second = service.close(); assert.equal(first, second); await first; await pending;
    assert(s.events.indexOf("server.close") < s.events.indexOf("kill:SIGTERM")); assert.equal(s.children[0].kills.length, 1);
  });
  await check("missing child close rejects shutdown after its bounded deadline", async () => {
    const s = fixture(), service = await s.api.start(), socket = s.socket(), pending = socket.send(Buffer.concat([s.frame(), Buffer.from("\n")]));
    const closing = observe(service.close()); await s.clock.advance(6000); assert.equal(closing.state, "rejected"); assert.equal(s.server.listening, false);
    await s.clock.advance(28000); await pending; assert(s.children[0].kills.includes("SIGKILL")); assert.equal(socket.replies.length, 0);
  });
  await check("runtime identity drift closes the service with a failure exit code", async () => {
    const s = fixture(), service = await s.api.start(); s.files.get(CONFIG).data[0] ^= 1;
    await s.clock.advance(500); assert.equal(s.process.exitCode, 1); assert.equal(s.server.listening, false); await service.close();
  });
  await check("the frozen service identity is rechecked independently of PostgreSQL", async () => {
    const s = fixture(), service = await s.api.start(); s.changeSelf(); await s.clock.advance(500);
    assert.equal(s.process.exitCode, 1); assert.equal(s.server.listening, false); await service.close();
  });
  const after = sourceSnapshot(); assert.equal(after.sha256, snapshot.sha256, "reviewed source changed while testing");
  process.stdout.write("Original service VM checks PASS: " + checks + "; source bytes=" + snapshot.bytes.length + "; SHA256=" + snapshot.sha256 + "; stable before/after.\n");
  process.stdout.write("No real child, socket, owner config, original data, database or native qualification.\n");
})().catch(() => { process.stderr.write("Original service VM tests FAIL; no native execution occurred.\n"); process.exitCode = 1; });
