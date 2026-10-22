"use strict";

// Public entry bytes only. Every endpoint, trust mount, process, clock and
// output in these tests is a RAM-only VM fixture, never native qualification.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), vm = require("node:vm"), assert = require("node:assert/strict");
const filename = path.join(__dirname, "local-unit-native-endpoint-qualification.js"), root = path.resolve(__dirname, "../..");
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
function snapshot() {
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try { const a = fs.fstatSync(fd, { bigint: true }); assert(a.isFile() && a.nlink === 1n && a.size < 262144n);
    const bytes = fs.readFileSync(fd), b = fs.fstatSync(fd, { bigint: true }), n = fs.lstatSync(filename, { bigint: true });
    for (const k of ["dev", "ino", "mode", "uid", "gid", "nlink", "size", "mtimeNs", "ctimeNs"]) assert(a[k] === b[k] && b[k] === n[k]);
    assert.equal(BigInt(bytes.length), a.size); return { bytes, sha256: sha(bytes) };
  } finally { fs.closeSync(fd); }
}
const before = snapshot(), code = before.bytes.toString("utf8"), TRUST_DIR = "/run/helmut-local-unit-diagnostic", TRUST = TRUST_DIR + "/trust.json";
function fixture(options = {}) {
  const files = new Map(), fds = new Map(), offsets = new Map(), calls = [], writes = [], lines = [];
  let nextInode = 30, nextFD = 1, processDrift = false, nativeRequests = 0;
  const nonce = "a".repeat(32), selection = { operationId: "localUnitDiagnostic-" + nonce, commandHash: sha("VM selected command") };
  const directory = "/workspace/helmut-unit-diagnostic-native/" + nonce, selectorPath = directory + "/SELECTION.SAFE.json";
  const configPath = directory + "/ENDPOINT_QUALIFICATION_CONFIG.PRIVATE.json", reportPath = directory + "/ENDPOINT_QUALIFICATION.SAFE.json";
  const endpointPath = path.join(root, "lib/helmut/local-unit-diagnostic-endpoint.js"), gatePath = path.join(__dirname, "local-unit-native-observation-gate.js"), events = [];
  const add = (name, data, extra = {}) => files.set(name, { data: Buffer.from(data), kind: "file", uid: 1000, gid: 1000, mode: 0o600,
    dev: 1, ino: nextInode++, nlink: 1, mtimeNs: 1, ctimeNs: 1, ...extra });
  const pin = name => ({ path: name, bytes: files.get(name).data.length, sha256: sha(files.get(name).data) });
  add(filename, before.bytes); add(endpointPath, "VM pinned endpoint module"); add(gatePath, "VM pinned gate module"); add("/synthetic/node", "VM Node executable", { mode: 0o755 });
  add(selectorPath, JSON.stringify(selection, null, 2) + "\n");
  const database = "helmut_unit_diagnostic_" + nonce, now = new Date().toISOString();
  const publicSourceBinding = { schema: "helmut-local-unit-original-source-binding/1", ...selection, database, vmOnly: "public binding" };
  const legacy = { rpcs: ["helmut_auth_state_graph_read_v1", "helmut_auth_usage_read_v1"].map((name, i) => ({ name, oid: String(100 + i),
    identityArguments: "jsonb", prosrcSHA256: sha("VM readonly body " + i), qualificationPin: { path: "/VM/read.SAFE.json", bytes: 2, sha256: sha("VM qualification") } })) };
  if (options.duplicateReadName) legacy.rpcs[1] = { ...legacy.rpcs[0] };
  const anchor = { schema: "helmut-local-unit-diagnostic-root-anchor/2", ...selection, database, originalService: publicSourceBinding, legacy };
  add(TRUST, JSON.stringify(anchor) + "\n", { uid: 0, mode: 0o444 }); add(TRUST_DIR + "/broker.sock", "", { kind: "socket", uid: 0, mode: 0o666 });
  const config = { schema: "helmut-local-unit-native-endpoint-qualification-config/1", selection, database, databaseOID: "12345",
    sqlSources: { "public.local_unit_diagnostic_contract_v1()": sha("VM contract body"), "helmut_unit_diagnostic.exact(jsonb, text[])": sha("VM helper body") },
    publicSourceBinding, codePins: [pin(filename), pin(gatePath), pin(endpointPath)], nodePin: pin("/synthetic/node"), issuedAtUTC: now,
    expiresAtUTC: new Date(Date.now() + 120000).toISOString(), measuredCgroup: { path: "/owned-group", device: 1, inode: 2, procMembership: "0::/\n" } };
  if (options.expired) config.expiresAtUTC = new Date(Date.now() - 1).toISOString();
  if (options.oldConfig) config.issuedAtUTC = new Date(Date.now() - 11000).toISOString();
  if (options.missingEndpointPin) config.codePins.pop();
  if (options.missingGatePin) config.codePins.splice(1, 1);
  if (options.badCodePin) config.codePins[1].sha256 = sha("VM wrong code");
  if (options.wrongConfigBinding) config.publicSourceBinding = { ...publicSourceBinding, vmOnly: "different binding" };
  if (options.badOID) config.databaseOID = "0";
  let configText = JSON.stringify(config); if (options.duplicateConfig) configText = configText.replace('"schema":', '"schema":"duplicate","schema":');
  add(configPath, configText, { ...(options.fifo ? { kind: "fifo" } : {}), ...(options.hardlink ? { nlink: 2 } : {}),
    ...(options.badMode ? { mode: 0o640 } : {}), ...(options.configOversize ? { size: 1048577 } : {}) });
  if (options.reportExists) add(reportPath, "VM preexisting report");
  if (options.nonrootTrust) files.get(TRUST).uid = 1000;
  if (options.badTrustMode) files.get(TRUST).mode = 0o644;
  if (options.badSocket) files.get(TRUST_DIR + "/broker.sock").uid = 1000;
  function stat(name, big = false) {
    const x = files.get(name) || { data: Buffer.alloc(0), kind: "directory", uid: name.startsWith(directory) ? 1000 : 0, gid: 0,
      mode: name.startsWith(directory) ? 0o700 : 0o755, dev: 1, ino: 2, nlink: 1, mtimeNs: 1, ctimeNs: 1 };
    const number = n => big ? BigInt(n) : n;
    return { ...Object.fromEntries(["dev", "ino", "uid", "gid", "nlink", "mtimeNs", "ctimeNs"].map(k => [k, number(x[k])])), size: number(x.size ?? x.data.length),
      mode: number(x.mode | (x.kind === "directory" ? 0o040000 : x.kind === "socket" ? 0o140000 : x.kind === "fifo" ? 0o010000 : 0o100000)),
      isFile: () => x.kind === "file", isDirectory: () => x.kind === "directory", isSocket: () => x.kind === "socket", isSymbolicLink: () => Boolean(options.symlink && name === configPath) };
  }
  const fsStub = { constants: fs.constants, realpathSync: n => n, lstatSync: (n, opts) => stat(n, opts?.bigint),
    statSync: n => { assert.equal(n, "/owned-group"); return { ...stat(n), ino: options.wrongGroup ? 3 : 2 }; },
    statfsSync: () => ({ type: options.notCgroup ? 0x01021994 : 0x63677270 }),
    openSync(name, flags, mode) { assert(flags & fs.constants.O_NOFOLLOW); assert(flags & fs.constants.O_NONBLOCK);
      if (flags & fs.constants.O_CREAT) { assert.equal(name, reportPath); assert(flags & fs.constants.O_EXCL); assert.equal(mode, 0o600);
        if (files.has(name)) { const e = Error("VM exists"); e.code = "EEXIST"; throw e; } add(name, ""); writes.push(name); }
      assert(files.has(name)); const fd = nextFD++; fds.set(fd, name); offsets.set(fd, 0); return fd; },
    fstatSync: (fd, opts) => stat(fds.get(fd), opts?.bigint), closeSync(fd) { fds.delete(fd); offsets.delete(fd); }, fsyncSync: () => {},
    readSync(fd, b, off, len) { const x = files.get(fds.get(fd)), from = offsets.get(fd), n = Math.min(len, x.data.length - from);
      x.data.copy(b, off, from, from + n); offsets.set(fd, from + n); return n; },
    writeSync(fd, b, off, len) { const x = files.get(fds.get(fd)); x.data = Buffer.concat([x.data, b.subarray(off, off + len)]); return len; },
    readFileSync(name) { if (name === "/proc/7/cgroup") return "0::/\n";
      if (name === "/proc/7/stat") return "7 (VM client) " + Array.from({ length: 20 }, (_, i) => i === 0 ? "S" : i === 19 ? processDrift ? "346" : "345" : "0").join(" ");
      assert.equal(name, "/proc/self/mountinfo"); return "1 0 0:1 / " + TRUST_DIR + " " + (options.writableTrust ? "rw" : "ro")
        + " - tmpfs tmpfs rw\n2 0 0:2 / /owned-group " + (options.writableGroup ? "rw" : "ro") + " - cgroup2 cgroup rw\n"; },
    readlinkSync(name) { if (name === "/proc/7/exe") return "/synthetic/node"; const n = name.split("/").at(-1); return n + ":[123]"; } };
  const Endpoint = { async request(selected, db, method, pathname, body) {
    events.push("endpoint.request");
    calls.push({ selected, db, method, pathname, body }); assert.equal(db, database); assert.equal(method, "POST");
    assert.equal(pathname, "/rest/v1/rpc/local_unit_diagnostic_contract_v1"); assert.equal(body.toString(), "{}");
    if (selected.commandHash !== selection.commandHash) {
      if (options.foreignAccepted) return { status: 200, body: Buffer.from("{}") };
      throw Error(options.foreignWrongError ? "local-unit-diagnostic-endpoint-request-outcome-unknown" : "local-unit-diagnostic-endpoint-root-anchor-binding");
    }
    nativeRequests++;
    if (options.endpointFailure) throw Error("VM endpoint rejected");
    const catalog = { version: "helmut-local-unit-diagnostic-native-store/1", database, databaseOID: config.databaseOID,
      sources: config.sqlSources, legacyReadRPCs: legacy.rpcs, sourceQualified: false };
    if (options.badVersion) catalog.version = "wrong";
    if (options.contractWrongOID) catalog.databaseOID = "98765";
    if (options.badSources) catalog.sources = {};
    if (options.badLegacy) catalog.legacyReadRPCs = [];
    if (options.sourceQualified) catalog.sourceQualified = true;
    if (options.extraContract) catalog.extra = true;
    if (options.trustDrift) files.get(TRUST).data = Buffer.from(JSON.stringify({ ...anchor, changed: true }) + "\n");
    if (options.pidDrift) processDrift = true;
    if (options.codeDrift) files.get(endpointPath).data = Buffer.from("VM changed endpoint");
    return { status: options.badStatus ? 403 : 200, body: Buffer.from(options.badBody ? "malformed" : JSON.stringify(catalog)) };
  } };
  const ModuleStub = { _cache: { [filename]: {} }, isBuiltin: n => n.startsWith("node:"), _resolveFilename: n => n };
  const Gate = { async wait(args) {
    events.push("gate.wait"); assert.equal(JSON.stringify(args), JSON.stringify({ selection, process: { pid: 7, startTicks: "345" }, kind: "endpoint" }));
    if (options.gateFailure) throw Error("VM closed gate");
  }, async quiesce() { events.push("gate.quiesce"); assert.equal(writes.length, 1); assert(files.has(reportPath));
    if (options.exitGateFailure) throw Error("VM exit gate closed"); } };
  ModuleStub._load = name => {
    if (name === gatePath) { events.push("gate.import"); ModuleStub._cache[name] = { filename: name }; return Gate; }
    events.push("endpoint.import"); assert.equal(name, endpointPath);
    if (options.unqualifiedImport) ModuleStub._load(path.join(root, "lib/helmut/unlisted.js"));
    ModuleStub._cache[name] = { filename: name }; return Endpoint; };
  const processStub = { pid: 7, version: options.nodeVersion || "v24.19.0", getuid: () => options.rootClient ? 0 : 1000, geteuid: () => 1000,
    env: { HELMUT_NATIVE_NODE_OLD_SPACE_MIB: "384", ...options.env }, execPath: "/synthetic/node",
    execArgv: options.flags || ["--max-old-space-size=384", "--max-semi-space-size=16"],
    argv: ["/synthetic/node", filename, "--selector", options.selectorPath || selectorPath], hrtime: { bigint: () => 0n }, stdout: { write: x => lines.push(x) } };
  const builtins = { "node:fs": fsStub, "node:path": path, "node:crypto": crypto, "node:v8": { getHeapStatistics: () => ({ heap_size_limit: options.heap || 400000000 }) },
    "node:module": ModuleStub, "node:util": require("node:util") };
  const localRequire = n => Object.hasOwn(builtins, n) ? builtins[n] : ModuleStub._load(n); localRequire.main = { filename };
  const module = { exports: {}, filename }, api = vm.runInNewContext(code + "\n({start,checkConfig,parseJSON,nodeBudget});", {
    require: localRequire, module, __filename: filename, __dirname, process: processStub, Buffer, URL, Date
  }, { filename });
  return { api, files, config, calls, writes, lines, reportPath, events, asCLI() { localRequire.main = module; }, get nativeRequests() { return nativeRequests; } };
}
let count = 0, current = "initialization";
async function check(name, fn) { current = name; await fn(); count++; }
(async () => {
  await check("one genuine-module contract read and local foreign rejection publish one bounded report", async () => {
    const s = fixture(), report = await s.api.start(); assert.equal(s.nativeRequests, 1); assert.equal(s.calls.length, 2); assert.equal(s.writes.length, 1); assert.equal(s.lines.length, 1);
    assert(!s.events.includes("gate.import"));
    assert.equal(report.signedReadonlyContractObserved, true); assert.equal(report.foreignScopeRejectedBeforeRequest, true);
    assert.equal(report.foreignScopeNativeRequestCount, null); assert.equal(report.foreignScopeNativeRequestCountMeasured, false);
    for (const k of ["liveRawMutatorNegativesPerformed", "liveOriginalControlReadPerformed", "nativeACLProofPerformed", "seedPerformed", "scopeClaimConsumed", "unitExecutionQualified", "full500Qualified"])
      assert.equal(report[k], false);
    const summary = JSON.parse(s.lines[0]); assert.equal(summary.reportPin.sha256, sha(s.files.get(s.reportPath).data));
    assert.equal(summary.rootTrustSHA256, report.rootTrustSHA256); assert.equal(report.actualNodeBudget.oldSpaceMiB, 384);
    assert(!s.lines[0].includes("public binding") && !s.lines[0].includes("legacyReadRPCs")); await assert.rejects(s.api.start()); assert.equal(s.calls.length, 2);
  });
  await check("module import is inert before either public API or actual CLI", async () => {
    const s = fixture(); assert.equal(s.events.length, 0); assert.equal(s.calls.length, 0); assert.equal(s.writes.length, 0);
  });
  await check("actual CLI waits before endpoint import and quiesces after its report", async () => {
    const s = fixture(); s.asCLI(); await s.api.start(); assert.equal(s.nativeRequests, 1);
    assert(s.events.indexOf("gate.wait") < s.events.indexOf("endpoint.import"));
    assert(s.events.indexOf("endpoint.request") < s.events.indexOf("gate.quiesce"));
    assert.equal(s.events.filter(x => x === "gate.wait").length, 1); assert.equal(s.events.filter(x => x === "gate.quiesce").length, 1);
  });
  await check("failed CLI gate cannot import endpoint or reopen", async () => {
    const s = fixture({ gateFailure: true }); s.asCLI(); await assert.rejects(s.api.start());
    assert.equal(s.nativeRequests, 0); assert(!s.events.includes("endpoint.import")); assert.equal(s.writes.length, 0); await assert.rejects(s.api.start());
    assert.equal(s.events.filter(x => x === "gate.wait").length, 1);
  });
  await check("failed exit release prevents successful CLI output despite existing report", async () => {
    const s = fixture({ exitGateFailure: true }); s.asCLI(); await assert.rejects(s.api.start()); assert.equal(s.writes.length, 1); assert.equal(s.lines.length, 0);
    await assert.rejects(s.api.start()); assert.equal(s.events.filter(x => x === "gate.quiesce").length, 1);
  });
  for (const [name, options] of [["FIFO", { fifo: true }], ["hardlink", { hardlink: true }], ["mode", { badMode: true }],
    ["oversize", { configOversize: true }], ["symlink", { symlink: true }], ["duplicate JSON", { duplicateConfig: true }],
    ["old configuration", { oldConfig: true }], ["expired", { expired: true }], ["OID shape", { badOID: true }],
    ["missing code", { missingEndpointPin: true }], ["missing observation gate", { missingGatePin: true }], ["changed code", { badCodePin: true }], ["unqualified import", { unqualifiedImport: true }],
    ["foreign selector path", { selectorPath: "/tmp/SELECTION.SAFE.json" }]])
    await check(name + " rejects before endpoint use", async () => { const s = fixture(options); await assert.rejects(s.api.start()); assert.equal(s.calls.length, 0); assert.equal(s.writes.length, 0); });
  for (const [name, options] of [["Node version", { nodeVersion: "v24.18.0" }], ["heap", { heap: 512 * 1024 * 1024 }], ["root client", { rootClient: true }],
    ["flags", { flags: ["--max-old-space-size=384", "--max-semi-space-size=16", "--inspect"] }], ["NODE_OPTIONS", { env: { NODE_OPTIONS: "" } }],
    ["unknown environment", { env: { UNEXPECTED_PRIVATE_OPTION: "closed" } }], ["wrong group identity", { wrongGroup: true }], ["wrong filesystem", { notCgroup: true }],
    ["writable group", { writableGroup: true }], ["nonroot trust", { nonrootTrust: true }], ["trust mode", { badTrustMode: true }],
    ["writable trust mount", { writableTrust: true }], ["nonroot socket", { badSocket: true }], ["public binding mismatch", { wrongConfigBinding: true }]])
    await check(name + " cannot make a live request or report", async () => { const s = fixture(options); await assert.rejects(s.api.start()); assert.equal(s.calls.length, 0); assert.equal(s.writes.length, 0); });
  for (const [name, options] of [["endpoint unknown", { endpointFailure: true }], ["wrong status", { badStatus: true }], ["malformed body", { badBody: true }],
    ["wrong version", { badVersion: true }], ["wrong database OID", { contractWrongOID: true }], ["wrong sources", { badSources: true }],
    ["wrong read catalog", { badLegacy: true }], ["duplicated read entry", { duplicateReadName: true }], ["invented source authority", { sourceQualified: true }], ["extra contract field", { extraContract: true }],
    ["foreign scope accepted", { foreignAccepted: true }], ["foreign failure at wrong stage", { foreignWrongError: true }],
    ["trust replacement", { trustDrift: true }], ["process drift", { pidDrift: true }], ["code drift", { codeDrift: true }]])
    await check(name + " stays terminal without report or retries", async () => {
      const s = fixture(options); await assert.rejects(s.api.start()); assert.equal(s.nativeRequests, 1); assert.equal(s.writes.length, 0); assert.equal(s.lines.length, 0);
      const old = s.calls.length; await assert.rejects(s.api.start()); assert.equal(s.calls.length, old);
    });
  await check("preexisting qualification is never overwritten", async () => {
    const s = fixture({ reportExists: true }), initial = Buffer.from(s.files.get(s.reportPath).data); await assert.rejects(s.api.start());
    assert(s.files.get(s.reportPath).data.equals(initial)); assert.equal(s.writes.length, 0); assert.equal(s.lines.length, 0);
  });
  await check("entry has no database process source producer engine or raw write path", async () => {
    for (const text of ["child_process", "local-unit-native-prepare", "extractPinnedSource", "Producer.derive", "U.readControl", "state_cas_v1", "artifact_insert_v1", "original_write_v1"])
      assert(!code.includes(text));
    const s = fixture(); assert.throws(() => s.api.parseJSON(Buffer.from('{"x":1,"x":2}')));
    assert.throws(() => s.api.parseJSON(Buffer.from('{"x":1,"x":2}\n'), true));
  });
  assert.equal(snapshot().sha256, before.sha256);
  process.stdout.write("Endpoint qualification VM checks PASS: " + count + "; source SHA256=" + before.sha256 + "; stable before/after; native requests/DB/containers/providers=0.\n");
})().catch(() => { process.stderr.write("Endpoint qualification VM tests FAIL at " + current + "; no native request occurred.\n"); process.exitCode = 1; });
