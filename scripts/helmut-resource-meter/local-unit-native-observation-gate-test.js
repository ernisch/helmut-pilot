"use strict";

// Synthetic VM streams/files/timers, then two short Node pipe-lifecycle
// negatives. No sockets, native runtime, database, provider or engine runs.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const crypto = require("node:crypto"), { EventEmitter } = require("node:events");
const { spawn } = require("node:child_process");
const filename = path.join(__dirname, "local-unit-native-observation-gate.js"), source = fs.readFileSync(filename, "utf8");
const sha = x => crypto.createHash("sha256").update(x).digest("hex");
function fixture(options = {}) {
  const selection = { operationId: "localUnitDiagnostic-" + "a".repeat(32), commandHash: "b".repeat(64) }, proc = { pid: 7, startTicks: "345" };
  const directory = "/workspace/helmut-unit-diagnostic-native/" + selection.operationId.slice(-32), files = new Map(), fds = new Map(), timers = new Map(), events = [];
  let nextFD = 10, nextIno = 100, nextTimer = 1, mono = 0n, drift = false;
  const add = (name, kind, data = Buffer.alloc(0), extra = {}) => files.set(name, { kind, data: Buffer.from(data), uid: 1000, gid: 1000,
    dev: 1, ino: nextIno++, mode: kind === "directory" ? 0o700 : 0o600, nlink: 1, mtimeNs: 1, ctimeNs: 1, ...extra });
  for (const name of ["/", "/workspace", "/workspace/helmut-unit-diagnostic-native", directory]) add(name, "directory");
  const fail = code => { throw Object.assign(Error("synthetic filesystem failure"), { code }); };
  function stat(name, big = false) {
    const x = files.get(name); if (!x) fail("ENOENT"); const n = x => big ? BigInt(x) : x;
    return { ...Object.fromEntries(["dev", "ino", "uid", "gid", "nlink", "mtimeNs", "ctimeNs"].map(k => [k, n(x[k])])),
      mode: n(x.mode | (x.kind === "directory" ? 0o040000 : 0o100000)), size: n(x.data.length),
      isFile: () => x.kind === "file", isDirectory: () => x.kind === "directory", isSymbolicLink: () => x.kind === "symlink" };
  }
  const stdin = new EventEmitter(); Object.assign(stdin, { readableFlowing: null, readableEnded: false, destroyed: false,
    resume() { this.readableFlowing = true; }, pause() { this.readableFlowing = false; }, destroy() { this.destroyed = true; } });
  const fsStub = { constants: fs.constants, realpathSync: x => x,
    lstatSync: (name, opts) => stat(name, opts?.bigint), fstatSync: (fd, opts) => stat(fds.get(fd).name, opts?.bigint),
    readFileSync(name) { assert.equal(name, "/proc/self/stat"); events.push("self");
      return "7 (synthetic gate) " + Array.from({ length: 20 }, (_, i) => i === 0 ? "S" : i === 19 ? drift ? "346" : "345" : "0").join(" "); },
    openSync(name, flags, mode) {
      assert(flags & fs.constants.O_NOFOLLOW); assert(flags & fs.constants.O_NONBLOCK);
      if (flags & fs.constants.O_CREAT) { assert(flags & fs.constants.O_EXCL); assert.equal(mode, 0o600);
        if (files.has(name)) fail("EEXIST"); add(name, "file"); events.push("create:" + path.basename(name)); }
      if (!files.has(name)) fail("ENOENT"); const fd = nextFD++; fds.set(fd, { name, offset: 0 }); return fd;
    },
    closeSync(fd) { fds.delete(fd); },
    writeSync(fd, bytes, off, len) { const x = files.get(fds.get(fd).name), n = options.shortWrite ? 0 : Math.min(len, 31);
      x.data = Buffer.concat([x.data, bytes.subarray(off, off + n)]); return n; },
    readSync(fd, bytes, off, len) { const d = fds.get(fd), x = files.get(d.name), n = Math.min(len, x.data.length - d.offset);
      x.data.copy(bytes, off, d.offset, d.offset + n); d.offset += n;
      if (options.releaseGrow && d.name.endsWith("RELEASE.SAFE.json")) x.mtimeNs++;
      if (options.releaseSlow && d.name.endsWith("RELEASE.SAFE.json")) mono += 8000000000n;
      return n; },
    fsyncSync(fd) { events.push("fsync:" + path.basename(fds.get(fd).name));
      if (options.receiptSlow && fds.get(fd).name.endsWith("/ENTRY_OBSERVATION_GATE.SAFE.json")) mono += 8000000000n; },
    mkdirSync(name, opts) {
      assert.equal(opts.mode, 0o700); if (files.has(name)) fail("EEXIST"); add(name, "directory"); events.push("publish");
      assert(events.indexOf("fsync:ENTRY_OBSERVATION_EXIT_READY.SAFE.json") < events.indexOf("publish"));
      assert(events.lastIndexOf("fsync:" + path.basename(directory)) < events.indexOf("publish"));
      if (!options.noRelease) {
        const ready = JSON.parse(files.get(directory + "/ENTRY_OBSERVATION_EXIT_READY.SAFE.json").data.toString()), now = new Date().toISOString();
        let release = { schema: "helmut-local-unit-native-observation-exit-release/1", selection, process: proc, issuedAtUTC: now,
          expiresAtUTC: new Date(Date.now() + 2500).toISOString(), readyNonceSHA256: sha(ready.nonce), nonce: "d".repeat(64) };
        if (options.releaseChange) release = options.releaseChange(release);
        let text = JSON.stringify(release) + "\n"; if (options.releaseText) text = options.releaseText(text);
        add(directory + "/ENTRY_OBSERVATION_EXIT_RELEASE.SAFE.json", "file", Buffer.from(text), options.releaseMeta || {});
      }
    }
  };
  const processStub = { pid: 7, stdin, hrtime: { bigint: () => mono } }, module = { exports: {} };
  const builtins = { "node:fs": fsStub, "node:path": path, "node:crypto": crypto };
  const gate = vm.runInNewContext(source + "\nmodule.exports;", { require: n => { assert(Object.hasOwn(builtins, n)); return builtins[n]; },
    module, process: processStub, Buffer, Date,
    setTimeout(fn, ms) { const id = nextTimer++; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id)
  }, { filename });
  const args = { selection, process: proc, kind: "entry" };
  const frame = change => {
    const x = { schema: "helmut-local-unit-native-observation-gate/1", selection: { ...selection }, process: { ...proc },
      issuedAtUTC: new Date().toISOString(), expiresAtUTC: new Date(Date.now() + 2500).toISOString(), nonce: "c".repeat(64) };
    return Buffer.from(JSON.stringify(change ? change(x) : x) + "\n");
  };
  return { gate, stdin, args, frame, files, events, fds, timers, directory,
    eof() { stdin.readableEnded = true; stdin.emit("end"); }, advance(ms) { mono += BigInt(ms) * 1000000n; }, tick(ms) { mono += BigInt(ms) * 1000000n;
      const pending = [...timers]; timers.clear(); for (const [, timer] of pending) timer.fn(); }, drift() { drift = true; } };
}
let count = 0, current = "initialization";
async function check(name, fn) { current = name; await fn(); count++; }
async function accepted(s) { const promise = s.gate.wait(s.args), b = s.frame(); s.stdin.emit("data", b); s.eof(); return promise; }
async function pipeNegative(keepOpen) {
  const script = 'const fs=require("node:fs"),G=require(' + JSON.stringify(filename) + ');'
    + 'const s=fs.readFileSync("/proc/self/stat","utf8"),a=s.slice(s.lastIndexOf(")")+2).trim().split(/\\s+/);'
    + 'G.wait({selection:{operationId:"localUnitDiagnostic-'+ "a".repeat(32) + '",commandHash:"' + "b".repeat(64)
    + '"},process:{pid:process.pid,startTicks:a[19]},kind:"entry"}).then(()=>{process.exitCode=9},()=>{process.exitCode=1});';
  const env = { PATH: process.env.PATH, HELMUT_SOURCE_MODE: "off" };
  if (Object.hasOwn(process.env, "NODE_OPTIONS")) env.NODE_OPTIONS = process.env.NODE_OPTIONS;
  const child = spawn(process.execPath, ["--max-old-space-size=384", "--max-semi-space-size=16", "-e", script], { env, stdio: ["pipe", "pipe", "pipe"] });
  let stdoutEOF = false, stderrEOF = false, outputBytes = 0, killed = false;
  child.stdout.on("data", b => { outputBytes += b.length; }); child.stderr.on("data", b => { outputBytes += b.length; });
  child.stdout.on("end", () => { stdoutEOF = true; }); child.stderr.on("end", () => { stderrEOF = true; });
  child.stdin.on("error", () => {});
  const result = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code, signal) => resolve({ code, signal })); });
  const timer = setTimeout(() => { killed = true; child.kill("SIGKILL"); }, 2000);
  try {
    if (keepOpen) child.stdin.write(Buffer.alloc(4097, 32)); else child.stdin.end(Buffer.from("{}\n"));
    const close = await result; assert.equal(killed, false); assert.equal(close.code, 1); assert.equal(close.signal, null);
    assert(stdoutEOF && stderrEOF); assert.equal(outputBytes, 0);
  } finally { clearTimeout(timer); child.stdin.destroy(); if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); }
}
(async () => {
  await check("import is inert and canonical split frame requires real observed EOF before receipt", async () => {
    const s = fixture(); assert.equal(s.events.length, 0); assert.equal(s.timers.size, 0); assert.equal(s.stdin.listenerCount("data"), 0);
    const bytes = s.frame(), promise = s.gate.wait(s.args);
    s.stdin.emit("data", bytes.subarray(0, 7)); s.stdin.emit("data", bytes.subarray(7));
    assert(!s.files.has(s.directory + "/ENTRY_OBSERVATION_GATE.SAFE.json")); s.eof(); const pin = await promise;
    const raw = s.files.get(pin.path).data, receipt = JSON.parse(raw.toString()); assert.equal(sha(raw), pin.sha256);
    assert.equal(receipt.frameSHA256, sha(bytes)); assert.equal(receipt.nonceSHA256, sha("c".repeat(64))); assert.equal(receipt.stdinEOF, true);
    assert.equal(receipt.byteCount, bytes.length); assert(!raw.toString().includes('"nonce":')); assert.equal(s.timers.size, 0); assert.equal(s.fds.size, 0);
    await assert.rejects(s.gate.wait(s.args), /once-only$/);
    await s.gate.quiesce(); await assert.rejects(s.gate.quiesce(), /exit-once-only$/);
  });
  for (const [name, change] of [
    ["wrong selection", x => ({ ...x, selection: { ...x.selection, commandHash: "0".repeat(64) } })],
    ["wrong pid", x => ({ ...x, process: { ...x.process, pid: 8 } })],
    ["wrong start time", x => ({ ...x, process: { ...x.process, startTicks: "346" } })],
    ["wrong schema", x => ({ ...x, schema: "unrecognized" })], ["extra authority", x => ({ ...x, qualified: true })],
    ["future issuance", x => ({ ...x, issuedAtUTC: new Date(Date.now() + 1000).toISOString() })],
    ["expired", x => ({ ...x, issuedAtUTC: new Date(Date.now() - 2000).toISOString(), expiresAtUTC: new Date(Date.now() - 1).toISOString() })],
    ["long TTL", x => ({ ...x, expiresAtUTC: new Date(Date.now() + 4000).toISOString() })],
    ["noncanonical UTC", x => ({ ...x, issuedAtUTC: x.issuedAtUTC.replace(".000Z", "Z") + " " })],
    ["nonhex nonce", x => ({ ...x, nonce: "x".repeat(64) })]
  ]) await check(name + " cannot release or be retried", async () => {
    const s = fixture(), promise = s.gate.wait(s.args); s.stdin.emit("data", s.frame(change)); s.eof();
    await assert.rejects(promise); assert.equal(s.files.size, 4); await assert.rejects(s.gate.wait(s.args), /once-only$/);
    await assert.rejects(s.gate.quiesce(), /exit-once-only$/);
  });
  for (const [name, change] of [
    ["duplicate key", b => Buffer.from(b.toString().replace('"schema":', '"schema":"discarded","schema":'))],
    ["second frame", b => Buffer.concat([b, b])], ["missing final LF", b => b.subarray(0, b.length - 1)],
    ["extra LF", b => Buffer.concat([b, Buffer.from("\n")])],
    ["reordered fields", b => { const x = JSON.parse(b); return Buffer.from(JSON.stringify({ nonce: x.nonce, ...x }) + "\n"); }],
    ["invalid UTF8", b => Buffer.concat([b, Buffer.from([255])])], ["over cap", () => Buffer.alloc(4097, 32)],
    ["empty", () => Buffer.alloc(0)]
  ]) await check(name + " is terminal without receipt", async () => {
    const s = fixture(), promise = s.gate.wait(s.args); s.stdin.emit("data", change(s.frame())); s.eof(); await assert.rejects(promise); assert.equal(s.files.size, 4);
  });
  for (const event of ["close", "error"])
    await check("stdin " + event + " never synthesizes EOF", async () => {
      const s = fixture(), promise = s.gate.wait(s.args); s.stdin.emit("data", s.frame()); s.stdin.emit(event, Error("synthetic stream error"));
      await assert.rejects(promise); assert.equal(s.files.size, 4); assert.equal(s.timers.size, 0);
    });
  await check("complete bytes with missing EOF time out", async () => {
    const s = fixture(), promise = s.gate.wait(s.args); s.stdin.emit("data", s.frame()); s.tick(8000); await assert.rejects(promise, /timeout$/); assert.equal(s.files.size, 4);
  });
  await check("EOF after elapsed limit cannot beat a delayed timer", async () => {
    const s = fixture(), promise = s.gate.wait(s.args); s.stdin.emit("data", s.frame()); s.advance(8001); s.eof(); await assert.rejects(promise); assert.equal(s.files.size, 4);
  });
  await check("process drift at EOF is rejected", async () => {
    const s = fixture(), promise = s.gate.wait(s.args); s.stdin.emit("data", s.frame()); s.drift(); s.eof(); await assert.rejects(promise, /process-drift$/);
  });
  await check("exclusive receipt cannot reopen an existing attempt", async () => {
    const s = fixture(); s.files.set(s.directory + "/ENTRY_OBSERVATION_GATE.SAFE.json", { data: Buffer.from("preserved") });
    await assert.rejects(accepted(s), { code: "EEXIST" }); assert.equal(s.files.get(s.directory + "/ENTRY_OBSERVATION_GATE.SAFE.json").data.toString(), "preserved");
  });
  await check("short receipt write fails closed", async () => { const s = fixture({ shortWrite: true }); await assert.rejects(accepted(s), /receipt-write$/); });
  await check("receipt fsync time is included in the gate bound", async () => { const s = fixture({ receiptSlow: true }); await assert.rejects(accepted(s), /timeout$/); });
  for (const [name, options] of [
    ["wrong nonce binding", { releaseChange: x => ({ ...x, readyNonceSHA256: "0".repeat(64) }) }],
    ["wrong release PID", { releaseChange: x => ({ ...x, process: { ...x.process, pid: 8 } }) }],
    ["expired release", { releaseChange: x => ({ ...x, expiresAtUTC: new Date(Date.now() - 1).toISOString() }) }],
    ["long release TTL", { releaseChange: x => ({ ...x, expiresAtUTC: new Date(Date.now() + 4000).toISOString() }) }],
    ["duplicate release field", { releaseText: x => x.replace('"schema":', '"schema":"discarded","schema":') }],
    ["release without LF", { releaseText: x => x.trimEnd() }], ["overcap release", { releaseText: () => " ".repeat(4097) }],
    ["hardlinked release", { releaseMeta: { nlink: 2 } }], ["nonprivate release", { releaseMeta: { mode: 0o644 } }],
    ["release owner", { releaseMeta: { uid: 0 } }], ["release FIFO", { releaseMeta: { kind: "fifo" } }],
    ["release drift", { releaseGrow: true }], ["release read crosses final deadline", { releaseSlow: true }]
  ]) await check(name + " never releases or reopens the process", async () => {
    const s = fixture(options); await accepted(s); await assert.rejects(s.gate.quiesce()); await assert.rejects(s.gate.quiesce(), /exit-once-only$/); assert.equal(s.fds.size, 0);
  });
  await check("missing release is bounded without reopening READY", async () => {
    const s = fixture({ noRelease: true }); await accepted(s); const promise = s.gate.quiesce(); s.tick(8000); await assert.rejects(promise, /exit-timeout$/);
    assert.equal(s.events.filter(x => x === "create:ENTRY_OBSERVATION_EXIT_READY.SAFE.json").length, 1);
  });
  await check("actual malformed pipe EOF exits nonzero with both output EOFs", () => pipeNegative(false));
  await check("actual overcap input exits nonzero even if sender keeps stdin open", () => pipeNegative(true));
  process.stdout.write("Observation gate checks PASS: " + count + "; short Node pipe children=2; native/engine/HTTP=0.\n");
})().catch(() => { process.stderr.write("Observation gate checks FAIL at " + current + "; native/engine/HTTP=0.\n"); process.exitCode = 1; });
