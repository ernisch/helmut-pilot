"use strict";
// Synthetic VM/file fixtures only. No original inputs, endpoint, DB or motor.
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os");
const path = require("node:path"), crypto = require("node:crypto"), vm = require("node:vm");
const { createRequire } = require("node:module");
const filename = require.resolve("../../lib/helmut/local-unit-diagnostic-store"), nativeRequire = createRequire(filename);
const source = fs.readFileSync(filename, "utf8"), sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
let passed = 0;
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-manifest-proof-test-"));
  const lib = path.join(root, "lib/helmut"); fs.mkdirSync(lib, { recursive: true });
  const store = path.join(lib, "local-unit-diagnostic-store.js"), storage = path.join(lib, "storage.js"), executable = path.join(root, "synthetic-node");
  const put = (name, bytes) => { fs.writeFileSync(name, bytes, { mode: 0o600 }); return { path: name, bytes: Buffer.byteLength(bytes), sha256: sha(bytes) }; };
  const code = [put(store, source), put(storage, "synthetic storage fixture")], runtime = [put(executable, "synthetic runtime fixture")];
  const database = "helmut_unit_diagnostic_" + "a".repeat(32), sqlSources = [{ name: "synthetic-function", sha256: "b".repeat(64) }];
  const witness = { operationId: "localUnitDiagnostic-" + "a".repeat(32), scopeHash: "c".repeat(64), verifierCodeHash: code[0].sha256,
    codeManifestPin: put(path.join(root, "CODE.json"), JSON.stringify({ schema: "helmut-local-unit-diagnostic-code-manifest/1", files: code })),
    runtimeManifestPin: put(path.join(root, "RUNTIME.json"), JSON.stringify({ schema: "helmut-local-unit-diagnostic-runtime-manifest/1", database, sqlSources, files: runtime, transport: {} })) };
  const f = { root, store, storage, executable, witness, code, runtime, catalogCalls: 0, payloadReads: 0, manifestReads: 0,
    namespace: "mnt:[1234]", mountText: "1 0 0:1 / / ro - overlay overlay rw\n", status: 200, catalogSources: sqlSources, openHook: null, statHook: null, catalogResponse: null };
  const descriptors = new Map(), payload = new Set([...code, ...runtime].map(p => p.path));
  const io = { ...fs,
    readlinkSync(name, ...args) { return name === "/proc/self/ns/mnt" ? f.namespace : fs.readlinkSync(name, ...args); },
    readFileSync(name, ...args) { return name === "/proc/self/mountinfo" ? Buffer.from(f.mountText) : fs.readFileSync(name, ...args); },
    openSync(name, ...args) { if (f.openHook) f.openHook(name); const fd = fs.openSync(name, ...args); descriptors.set(fd, name); return fd; },
    closeSync(fd) { descriptors.delete(fd); return fs.closeSync(fd); },
    readSync(fd, ...args) { if (payload.has(descriptors.get(fd))) f.payloadReads++; else f.manifestReads++; return fs.readSync(fd, ...args); },
    fstatSync(fd, ...args) { const stat = fs.fstatSync(fd, ...args); if (f.statHook) f.statHook(descriptors.get(fd)); return stat; }
  };
  function req(name) {
    if (name === "node:fs") return io;
    if (name === "./local-unit-diagnostic-endpoint") return { request: async (_selection, _database, _method, endpoint, body) => {
      f.catalogCalls++;
      const status = f.catalogResponse ? await f.catalogResponse() : f.status;
      const catalog = { version: "helmut-local-unit-diagnostic-native-store/1", database, databaseOID: "42", sources: f.catalogSources };
      const args = JSON.parse(body), value = endpoint.includes("control_runtime_read")
        ? { version: "helmut-local-unit-control-runtime/1", scopeHash: args.p_scope_hash, nonce: args.p_nonce, catalog,
          runtime: { nonce: args.p_nonce, scopeHash: args.p_scope_hash } } : catalog;
      if (f.bundleMutation) f.bundleMutation(value);
      return { status, body: Buffer.from(JSON.stringify(value)) };
    } };
    return nativeRequire(name);
  }
  req.cache = {};
  const module = { exports: {} }, fakeProcess = { getuid: () => process.getuid(), execPath: executable,
    env: { HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE: database, HELMUT_STORAGE_BACKEND: "supabase", SUPABASE_URL: "http://127.0.0.1:1234" } };
  vm.runInNewContext("(function(require,module,exports,__filename,__dirname){" + source
    + "\nmodule.exports = {checkManifests};\n})", { Buffer, structuredClone, URL, process: fakeProcess })(req, module, module.exports, store, lib);
  f.check = () => module.exports.checkManifests(witness);
  f.control = () => module.exports.checkManifests(witness, true);
  f.cache = req.cache;
  f.put = put;
  f.dispose = () => fs.rmSync(root, { recursive: true, force: false });
  return f;
}
async function check(name, work) {
  const f = fixture();
  try { await work(f); passed++; } finally { f.dispose(); }
}
async function rejectedAndPoisoned(f, pattern) {
  await assert.rejects(f.check(), pattern);
  const reads = f.payloadReads, calls = f.catalogCalls;
  await assert.rejects(f.check(), /manifest-proof-terminal/);
  assert.equal(f.payloadReads, reads); assert.equal(f.catalogCalls, calls);
}
(async () => {
  await check("initial SHA; sixteen fresh catalogs and small manifests without repeated payload hashing", async f => {
    await f.check(); assert(f.payloadReads > 0); assert.equal(f.catalogCalls, 1);
    f.payloadReads = 0; f.manifestReads = 0;
    for (let i = 0; i < 16; i++) await f.check();
    assert.equal(f.catalogCalls, 17); assert.equal(f.payloadReads, 0); assert(f.manifestReads >= 32);
  });
  await check("same-size sibling write behind client RO bind stops on 9MD drift", async f => {
    await f.check(); const before = fs.statSync(f.executable);
    fs.writeFileSync(f.executable, "changed!! runtime fixture"); fs.utimesSync(f.executable, before.atime, before.mtime);
    await rejectedAndPoisoned(f, /manifest-file-drift/);
  });
  await check("byte-identical inode replacement stops", async f => {
    await f.check(); fs.renameSync(f.executable, f.executable + ".old"); f.put(f.executable, "synthetic runtime fixture");
    await rejectedAndPoisoned(f, /manifest-file-drift/);
  });
  await check("symlink replacement stops before opening target", async f => {
    await f.check(); fs.renameSync(f.executable, f.executable + ".old"); fs.symlinkSync(f.executable + ".old", f.executable);
    await rejectedAndPoisoned(f, /manifest-file-proof-binding/);
  });
  await check("named-to-open replacement race stops", async f => {
    await f.check(); let changed = false;
    f.openHook = name => { if (name === f.executable && !changed) { changed = true; fs.renameSync(name, name + ".old"); f.put(name, "synthetic runtime fixture"); } };
    await rejectedAndPoisoned(f, /manifest-file-drift/); assert(changed);
  });
  await check("write during opened-FD recheck stops", async f => {
    await f.check(); let changed = false;
    f.statHook = name => { if (name === f.executable && !changed) { changed = true; fs.chmodSync(name, 0o400); } };
    await rejectedAndPoisoned(f, /manifest-file-drift/); assert(changed);
  });
  await check("namespace change stops without rehash", async f => {
    await f.check(); f.payloadReads = 0; f.namespace = "mnt:[9999]";
    await rejectedAndPoisoned(f, /manifest-file-proof-binding/); assert.equal(f.payloadReads, 0);
  });
  await check("mount snapshot change stops without rehash", async f => {
    await f.check(); f.payloadReads = 0; f.mountText += "2 1 0:2 / /new ro - tmpfs tmpfs ro\n";
    await rejectedAndPoisoned(f, /manifest-file-proof-binding/); assert.equal(f.payloadReads, 0);
  });
  await check("initial writable covering mount rejects before payload proof", async f => {
    f.mountText = "1 0 0:1 / / rw - overlay overlay rw\n";
    await rejectedAndPoisoned(f, /manifest-readonly-mount/); assert.equal(f.payloadReads, 0); assert.equal(f.catalogCalls, 0);
  });
  await check("fresh catalog drift rejects despite unchanged files", async f => {
    await f.check(); f.catalogSources = [];
    await rejectedAndPoisoned(f, /actual-native-catalog/); assert.equal(f.catalogCalls, 2);
  });
  await check("file mutation while awaiting catalog prevents initial proof", async f => {
    f.catalogSources = { toJSON() { fs.chmodSync(f.executable, 0o400); return [{ name: "synthetic-function", sha256: "b".repeat(64) }]; } };
    await rejectedAndPoisoned(f, /manifest-file-drift/);
  });
  await check("catalog request failure poisons without retry", async f => {
    f.status = 500; await rejectedAndPoisoned(f, /native-http-not-confirmed/); assert.equal(f.catalogCalls, 1);
  });
  await check("changed private witness command binding stops", async f => {
    await f.check(); f.witness.scopeHash = "d".repeat(64);
    await rejectedAndPoisoned(f, /manifest-file-proof-binding/);
  });
  await check("changed manifest pin cannot refresh a proof", async f => {
    await f.check(); f.witness.codeManifestPin = f.put(path.join(f.root, "NEWCODE.json"), JSON.stringify({ schema: "helmut-local-unit-diagnostic-code-manifest/1", files: f.code }));
    await rejectedAndPoisoned(f, /manifest-file-proof-binding/);
  });
  await check("loaded-code closure remains fresh", async f => {
    await f.check(); f.cache[path.join(f.root, "not-in-measured-closure.js")] = {};
    await rejectedAndPoisoned(f, /loaded-code-outside-pinned-closure/); assert.equal(f.catalogCalls, 1);
  });
  await check("stacked writable mount cannot masquerade as RO", async f => {
    f.mountText += "2 1 0:2 / / rw - tmpfs tmpfs rw\n";
    await rejectedAndPoisoned(f, /manifest-readonly-mount/);
  });
  await check("overlapping fresh catalog cannot publish success after another caller poisoned the proof", async f => {
    const pending = []; f.catalogResponse = () => new Promise(resolve => pending.push(resolve));
    const first = f.check(), second = f.check(); assert.equal(pending.length, 2);
    pending[0](500); await assert.rejects(first, /native-http-not-confirmed/);
    pending[1](200); await assert.rejects(second, /manifest-proof-terminal/);
    await assert.rejects(f.check(), /manifest-proof-terminal/); assert.equal(f.catalogCalls, 2);
  });
  await check("control runtime has one actual catalog await with unchanged manifest bookends", async f => {
    const first = await f.control(); assert(first.runtimeWitness); assert.equal(f.catalogCalls, 1);
    f.payloadReads = 0; await f.control(); assert.equal(f.catalogCalls, 2); assert.equal(f.payloadReads, 0);
  });
  await check("missing bundled runtime cannot leave a reusable manifest proof", async f => {
    f.bundleMutation = value => { delete value.runtime; };
    await assert.rejects(f.control(), /control-runtime-envelope/);
    f.bundleMutation = null; await assert.rejects(f.control(), /manifest-proof-terminal/); assert.equal(f.catalogCalls, 1);
  });
  await check("file mutation during bundled catalog still poisons", async f => {
    f.bundleMutation = () => { fs.chmodSync(f.executable, 0o400); };
    await assert.rejects(f.control(), /manifest-file-drift/);
    await assert.rejects(f.control(), /manifest-proof-terminal/);
  });
  process.stdout.write(JSON.stringify({ schema: "helmut-local-unit-manifest-proof-offline-checks/1", passed,
    syntheticFixturesOnly: true, nativeExecution: false, databaseStarted: false, motorCalls: 0, unit60: false, reserve: false, full500: false }) + "\n");
})().catch(error => { process.stderr.write(String(error.stack) + "\n"); process.exitCode = 1; });
