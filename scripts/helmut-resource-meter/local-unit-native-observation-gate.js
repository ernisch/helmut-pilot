"use strict";

// Process-observation synchronization only. Importing this module performs no
// reads, timers or stream operations and grants no execution authority.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const ROOT = "/workspace/helmut-unit-diagnostic-native", CAP = 4096, WAIT_MS = 8000;
const META = ["dev", "ino", "mode", "uid", "gid", "nlink", "size", "mtimeNs", "ctimeNs"];
const exact = (x, keys) => x !== null && typeof x === "object" && !Array.isArray(x)
  && Reflect.ownKeys(x).length === keys.length && keys.every(k => Object.hasOwn(x, k));
const hex = x => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const utc = x => typeof x === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)
  && Number.isFinite(Date.parse(x)) && new Date(x).toISOString() === x;
const sha = x => crypto.createHash("sha256").update(x).digest("hex");
const need = (ok, code) => { if (!ok) throw Error("local-unit-native-observation-gate-" + code); };
let attempted = false, accepted = null, exiting = false;
function self() {
  const text = fs.readFileSync("/proc/self/stat", "utf8"), end = text.lastIndexOf(")"), a = text.slice(end + 2).trim().split(/\s+/);
  need(end > 0 && Number(text.slice(0, text.indexOf(" "))) === process.pid && !["Z", "X"].includes(a[0])
    && /^[1-9][0-9]{0,29}$/.test(a[19] || ""), "self-process");
  return { pid: process.pid, startTicks: a[19] };
}
function context(args) {
  need(exact(args, ["selection", "process", "kind"]) && ["entry", "endpoint"].includes(args.kind), "arguments");
  const s = args.selection, p = args.process;
  need(exact(s, ["operationId", "commandHash"]) && typeof s.operationId === "string"
    && /^localUnitDiagnostic-[a-f0-9]{32}$/.test(s.operationId) && hex(s.commandHash), "selection");
  need(exact(p, ["pid", "startTicks"]) && Number.isSafeInteger(p.pid) && p.pid > 0 && typeof p.startTicks === "string"
    && /^[1-9][0-9]{0,29}$/.test(p.startTicks), "process");
  const actual = self(); need(p.pid === actual.pid && p.startTicks === actual.startTicks, "process-binding");
  return { selection: { operationId: s.operationId, commandHash: s.commandHash }, process: actual, kind: args.kind,
    directory: path.join(ROOT, s.operationId.slice(-32)) };
}
function canonicalPath(name) {
  need(path.isAbsolute(name) && path.normalize(name) === name && fs.realpathSync(name) === name, "canonical-path");
  let current = path.parse(name).root;
  for (const part of name.slice(current.length).split(path.sep)) {
    current = path.join(current, part); need(!fs.lstatSync(current).isSymbolicLink(), "symlink-component");
  }
}
function privateDirectory(name) {
  canonicalPath(name); const a = fs.lstatSync(name, { bigint: true });
  need(a.isDirectory() && a.uid === 1000n && (a.mode & 0o7777n) === 0o700n, "private-directory"); return a;
}
function writeOnce(c, basename, value) {
  const directory = privateDirectory(c.directory), name = path.join(c.directory, basename), bytes = Buffer.from(JSON.stringify(value) + "\n");
  need(bytes.length <= CAP, "receipt-cap");
  const dirfd = fs.openSync(c.directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  const sameDirectory = () => {
    const fd = fs.fstatSync(dirfd, { bigint: true }), named = privateDirectory(c.directory);
    need(["dev", "ino", "mode", "uid", "gid"].every(k => directory[k] === fd[k] && fd[k] === named[k]), "directory-drift");
  };
  try {
    sameDirectory(); const fd = fs.openSync(name, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL
      | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK, 0o600);
    try {
      const a = fs.fstatSync(fd, { bigint: true });
      need(a.isFile() && a.size === 0n && a.nlink === 1n && a.uid === 1000n && (a.mode & 0o7777n) === 0o600n, "receipt-file");
      let n = 0; while (n < bytes.length) { const count = fs.writeSync(fd, bytes, n, bytes.length - n, null); need(count > 0, "receipt-write"); n += count; }
      fs.fsyncSync(fd); const b = fs.fstatSync(fd, { bigint: true }), named = fs.lstatSync(name, { bigint: true });
      need(b.size === BigInt(bytes.length) && ["dev", "ino", "mode", "uid", "gid", "nlink"].every(k => a[k] === b[k])
        && META.every(k => b[k] === named[k]), "receipt-drift");
    } finally { fs.closeSync(fd); }
    fs.fsyncSync(dirfd); sameDirectory();
  } finally { fs.closeSync(dirfd); }
  return Object.freeze({ path: name, bytes: bytes.length, sha256: sha(bytes) });
}
function frame(bytes, c, now) {
  need(bytes.length > 0 && bytes.length <= CAP && Buffer.from(bytes.toString("utf8")).equals(bytes), "frame-bytes");
  let x; try { x = JSON.parse(bytes.toString("utf8")); } catch { need(false, "frame-json"); }
  need(exact(x, ["schema", "selection", "process", "issuedAtUTC", "expiresAtUTC", "nonce"])
    && x.schema === "helmut-local-unit-native-observation-gate/1" && exact(x.selection, ["operationId", "commandHash"])
    && exact(x.process, ["pid", "startTicks"]) && x.selection.operationId === c.selection.operationId
    && x.selection.commandHash === c.selection.commandHash && x.process.pid === c.process.pid
    && x.process.startTicks === c.process.startTicks && hex(x.nonce), "frame-binding");
  need(utc(x.issuedAtUTC) && utc(x.expiresAtUTC) && Date.parse(x.issuedAtUTC) <= now && now < Date.parse(x.expiresAtUTC)
    && Date.parse(x.expiresAtUTC) - Date.parse(x.issuedAtUTC) <= 3000, "frame-window");
  const typed = { schema: x.schema, selection: { operationId: x.selection.operationId, commandHash: x.selection.commandHash },
    process: { pid: x.process.pid, startTicks: x.process.startTicks }, issuedAtUTC: x.issuedAtUTC, expiresAtUTC: x.expiresAtUTC, nonce: x.nonce };
  need(Buffer.from(JSON.stringify(typed) + "\n").equals(bytes), "frame-canonical"); return typed;
}
async function wait(args) {
  need(!attempted, "once-only"); attempted = true;
  const c = context(args), input = process.stdin, began = process.hrtime.bigint();
  need(input && !input.isTTY && !input.destroyed && !input.readableEnded && input.readableFlowing !== true, "stdin-state");
  const bytes = await new Promise((resolve, reject) => {
    const chunks = []; let count = 0, settled = false;
    const clean = () => { clearTimeout(timer); input.removeListener("data", data); input.removeListener("end", end);
      input.removeListener("error", error); input.removeListener("close", close); input.pause(); };
    const fail = code => { if (settled) return; settled = true; clean();
      // Pausing a live pipe alone retains its handle and can prevent exit when
      // the sender never closes. Destroy only the failed input, never report
      // its close as the natural EOF required on the successful path.
      try { input.destroy(); } finally { reject(Error("local-unit-native-observation-gate-" + code)); } };
    const data = chunk => { if (!Buffer.isBuffer(chunk)) { fail("stdin-bytes"); return; }
      count += chunk.length; if (count > CAP) { fail("frame-cap"); return; } chunks.push(Buffer.from(chunk)); };
    const end = () => { if (settled) return;
      if (process.hrtime.bigint() - began >= BigInt(WAIT_MS) * 1000000n) { fail("timeout"); return; }
      settled = true; clean(); resolve(Buffer.concat(chunks)); };
    const error = () => fail("stdin-error"), close = () => fail("stdin-close-before-eof");
    const timer = setTimeout(() => fail("timeout"), WAIT_MS);
    input.on("data", data); input.once("end", end); input.once("error", error); input.once("close", close); input.resume();
  });
  const receivedAtUTC = new Date().toISOString(), x = frame(bytes, c, Date.parse(receivedAtUTC)), actual = self();
  need(actual.pid === c.process.pid && actual.startTicks === c.process.startTicks, "process-drift");
  const receipt = { schema: "helmut-local-unit-native-observation-gate-receipt/1", selection: c.selection, process: c.process,
    issuedAtUTC: x.issuedAtUTC, expiresAtUTC: x.expiresAtUTC, receivedAtUTC, nonceSHA256: sha(x.nonce), frameSHA256: sha(bytes),
    byteCount: bytes.length, stdinEOF: true };
  const pin = writeOnce(c, c.kind.toUpperCase() + "_OBSERVATION_GATE.SAFE.json", receipt);
  need(process.hrtime.bigint() - began < BigInt(WAIT_MS) * 1000000n, "timeout");
  accepted = c; return pin;
}
function releaseFile(name) {
  // Absence is the only polling condition. An existing malformed or changing
  // file is terminal and is never reopened as a successful second attempt.
  let named; try { named = fs.lstatSync(name, { bigint: true }); }
  catch (error) { if (error?.code === "ENOENT") return null; throw error; }
  canonicalPath(name);
  const fd = fs.openSync(name, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const a = fs.fstatSync(fd, { bigint: true });
    need(a.isFile() && a.uid === 1000n && a.nlink === 1n && (a.mode & 0o7777n) === 0o600n
      && a.size > 0n && a.size <= BigInt(CAP) && META.every(k => named[k] === a[k]), "release-file");
    const bytes = Buffer.alloc(Number(a.size) + 1); let n = 0;
    while (n < bytes.length) { const count = fs.readSync(fd, bytes, n, bytes.length - n, null); if (count === 0) break; n += count; }
    const b = fs.fstatSync(fd, { bigint: true }); named = fs.lstatSync(name, { bigint: true });
    need(n === Number(a.size) && META.every(k => a[k] === b[k] && b[k] === named[k]), "release-drift");
    return bytes.subarray(0, n);
  } finally { fs.closeSync(fd); }
}
function release(bytes, c, ready, now) {
  need(Buffer.from(bytes.toString("utf8")).equals(bytes), "release-bytes");
  let x; try { x = JSON.parse(bytes.toString("utf8")); } catch { need(false, "release-json"); }
  need(exact(x, ["schema", "selection", "process", "issuedAtUTC", "expiresAtUTC", "readyNonceSHA256", "nonce"])
    && x.schema === "helmut-local-unit-native-observation-exit-release/1" && exact(x.selection, ["operationId", "commandHash"])
    && exact(x.process, ["pid", "startTicks"]) && x.selection.operationId === c.selection.operationId
    && x.selection.commandHash === c.selection.commandHash && x.process.pid === c.process.pid
    && x.process.startTicks === c.process.startTicks && x.readyNonceSHA256 === sha(ready.nonce) && hex(x.nonce), "release-binding");
  need(utc(x.issuedAtUTC) && utc(x.expiresAtUTC) && Date.parse(ready.issuedAtUTC) <= Date.parse(x.issuedAtUTC)
    && Date.parse(x.issuedAtUTC) <= now && now < Date.parse(x.expiresAtUTC)
    && Date.parse(x.expiresAtUTC) - Date.parse(x.issuedAtUTC) <= 3000, "release-window");
  const typed = { schema: x.schema, selection: { operationId: x.selection.operationId, commandHash: x.selection.commandHash },
    process: { pid: x.process.pid, startTicks: x.process.startTicks }, issuedAtUTC: x.issuedAtUTC, expiresAtUTC: x.expiresAtUTC,
    readyNonceSHA256: x.readyNonceSHA256, nonce: x.nonce };
  need(Buffer.from(JSON.stringify(typed) + "\n").equals(bytes), "release-canonical");
}
async function quiesce() {
  need(arguments.length === 0 && accepted && !exiting, "exit-once-only"); exiting = true;
  const c = accepted, began = process.hrtime.bigint(), issuedAtUTC = new Date().toISOString(), prefix = c.kind.toUpperCase() + "_OBSERVATION_EXIT_";
  const actual = self(); need(actual.pid === c.process.pid && actual.startTicks === c.process.startTicks, "process-drift");
  const ready = { schema: "helmut-local-unit-native-observation-exit-ready/1", selection: c.selection, process: c.process,
    issuedAtUTC, expiresAtUTC: new Date(Date.parse(issuedAtUTC) + WAIT_MS).toISOString(), nonce: crypto.randomBytes(32).toString("hex") };
  writeOnce(c, prefix + "READY.SAFE.json", ready);
  // The host watches this exclusive atomic directory entry, never the file
  // while it is being written. Its file read therefore needs no parse retry.
  const published = path.join(c.directory, prefix + "READY.SAFE.json.PUBLISHED");
  fs.mkdirSync(published, { mode: 0o700 }); privateDirectory(published);
  for (const name of [published, c.directory]) {
    const fd = fs.openSync(name, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }
  const name = path.join(c.directory, prefix + "RELEASE.SAFE.json");
  while (true) {
    need(process.hrtime.bigint() - began < BigInt(WAIT_MS) * 1000000n && Date.now() < Date.parse(ready.expiresAtUTC), "exit-timeout");
    privateDirectory(c.directory); const bytes = releaseFile(name);
    if (bytes !== null) {
      release(bytes, c, ready, Date.now()); const last = self();
      need(last.pid === c.process.pid && last.startTicks === c.process.startTicks, "process-drift");
      need(process.hrtime.bigint() - began < BigInt(WAIT_MS) * 1000000n && Date.now() < Date.parse(ready.expiresAtUTC), "exit-timeout"); return;
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
module.exports = Object.freeze({ wait, quiesce });
