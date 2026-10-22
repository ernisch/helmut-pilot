"use strict";

// Only these public entry bytes are read from disk. Source constructors, native
// rows, clocks, processes and all output files below are RAM-only VM fixtures.
// They are never native qualification, original input or execution evidence.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), vm = require("node:vm"), assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const filename = path.join(__dirname, "local-unit-native-prepare.js"), root = path.resolve(__dirname, "../..");
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const canonical = x => Array.isArray(x) ? "[" + x.map(canonical).join(",") + "]" : x !== null && typeof x === "object"
  ? "{" + Object.keys(x).sort().map(k => JSON.stringify(k) + ":" + canonical(x[k])).join(",") + "}" : JSON.stringify(x);
function snapshot() {
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try { const a = fs.fstatSync(fd, { bigint: true }); assert(a.isFile() && a.nlink === 1n && a.size < 262144n);
    const bytes = fs.readFileSync(fd), b = fs.fstatSync(fd, { bigint: true }), named = fs.lstatSync(filename, { bigint: true });
    for (const k of ["dev", "ino", "mode", "uid", "gid", "nlink", "size", "mtimeNs", "ctimeNs"]) assert(a[k] === b[k] && b[k] === named[k]);
    assert(BigInt(bytes.length) === a.size); return { bytes, sha256: sha(bytes) };
  } finally { fs.closeSync(fd); }
}
const before = snapshot(), code = before.bytes.toString("utf8");
const CONFIG = "/bench/PREPARE_CONFIG.PRIVATE.json", INPUT = "/bench/COMMAND_INPUT.PRIVATE.json", CLIENT = "/bench/client";
const flush = async () => { for (let i = 0; i < 160; i++) await Promise.resolve(); };
function clock() {
  let now = 0, next = 0; const jobs = new Map(), epoch = Date.parse("2026-10-22T12:00:00.000Z");
  return { jobs, get now() { return now; }, get wall() { return epoch + now; },
    setTimeout(fn, ms) { const id = ++next; jobs.set(id, { at: now + ms, fn }); return id; }, clearTimeout(id) { jobs.delete(id); },
    async advance(ms) { const end = now + ms; let n = 0;
      while (true) { const job = [...jobs].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!job) break; assert(++n < 1000); now = job[1].at; jobs.delete(job[0]); job[1].fn(); await flush(); }
      now = end; await flush(); }
  };
}
function observed(promise) { const x = { state: "pending" }; promise.then(value => { x.state = "resolved"; x.value = value; }, () => { x.state = "rejected"; }); return x; }
function fixture(options = {}) {
  const timer = clock(), files = new Map(), fds = new Map(), offsets = new Map(), spawns = [], children = [], writes = [], events = [], lines = [];
  let inode = 50, fdNext = 1, pidDrift = false, builderCalls = 0, normalizerCalls = 0;
  const add = (name, data, extra = {}) => files.set(name, { data: Buffer.from(data), kind: "file", mode: 0o600, uid: 1000, gid: 1000,
    dev: 1, ino: inode++, nlink: 1, mtimeNs: 1, ctimeNs: 1, ...extra });
  const pin = name => ({ path: name, bytes: files.get(name).data.length, sha256: sha(files.get(name).data) });
  const nonce = "a".repeat(32), operationId = "localUnitDiagnostic-" + nonce, database = "helmut_unit_diagnostic_" + nonce;
  const logical = "/workspace/helmut-unit-diagnostic-native/" + nonce + "/";
  add(filename, before.bytes); add("/synthetic/node", "VM Node bytes"); add("/usr/lib/postgresql/17/bin/psql", "VM psql bytes");
  add("/usr/lib/postgresql/17/bin/postgres", "VM postgres bytes");
  const entries = { source: "lib/helmut/local-unit-diagnostic-source.js", producer: "lib/helmut/local-unit-diagnostic-original-producer.js",
    command: "scripts/helmut-resource-meter/local-unit-native-command.js", usage: "lib/helmut/llm-usage-atomic.js", profile: "lib/helmut/synthetik-500-profile.js",
    storage: "lib/helmut/storage.js", ko: "lib/helmut/knowledge-object-version.js", inventory: "lib/helmut/synthetik-500-w-inventar.js" };
  for (const [key, name] of Object.entries(entries)) add(path.join(root, name), "VM source " + key);
  const originalPins = Object.fromEntries(["packet", "install", "terminal", "preparedRequests", "actualRequestBindings", "providerFixtures"].map(key => {
    const name = "/original/" + key + ".json"; add(name, JSON.stringify({ vmOnly: key })); return [key, pin(name)]; }));
  const policy = Buffer.from('{"version":1,"holds":[]}'.padEnd(493, " ")); add("/original/policy.json", policy);
  const config = { schema: "helmut-local-unit-native-prepare/1", nonce, runId: "nachlauf500-1234567890123", database,
    issuedAtUTC: new Date(timer.wall - 1).toISOString(), expiresAtUTC: new Date(timer.wall + 120000).toISOString(), selfPin: pin(filename),
    nodePin: pin("/synthetic/node"), psqlPin: pin("/usr/lib/postgresql/17/bin/psql"), sourceCodePins: Object.values(entries).map(name => pin(path.join(root, name))),
    readRPCPins: ["helmut_auth_state_graph_read_v1", "helmut_auth_usage_read_v1"].map((n, i) => ({ oid: String(1000 + i), name: "public." + n,
      identityArguments: "jsonb", prosrcSHA256: sha("VM SQL " + i), volatility: "s", returnType: "jsonb", language: "plpgsql", config: ["search_path=pg_catalog"] })),
    postgres: { pid: 42, startTicks: "345", exePin: pin("/usr/lib/postgresql/17/bin/postgres") },
    measuredCgroup: { path: "/owned-group", device: 1, inode: 2, procMembership: "0::/\n" }, libraryPath: "/usr/lib/x86_64-linux-gnu",
    originalPins, originalPublicationPolicyPin: pin("/original/policy.json") };
  if (options.missingCode) config.sourceCodePins.pop();
  if (options.wrongCode) config.sourceCodePins[0].sha256 = sha("VM different source");
  if (options.wrongDatabase) config.database = "postgres";
  if (options.wrongReadPin) config.readRPCPins[0].identityArguments = "p jsonb";
  add(CONFIG, JSON.stringify(config), { ...(options.fifo ? { kind: "fifo" } : {}), ...(options.hardlink ? { nlink: 2 } : {}),
    ...(options.wrongMode ? { mode: 0o640 } : {}), ...(options.oversize ? { size: 1048577 } : {}) });
  const selectedProfile = { id: "test-kohorte-synthetik-bt-001", fullName: "VM synthetic profile" };
  const koFields = ["id", "headline", ...Array.from({ length: options.fullKO60 ? 58 : 0 }, (_, i) => "field_" + i)];
  const knowledgeObject = Object.fromEntries(koFields.map(key => [key, key === "id" ? "ko-a" : key === "headline" ? "VM KO" : "VM " + key]));
  const selected = { sourceIndex: 499, diagnosticUnit: 0, draft: { profile: selectedProfile,
    sources: { documents: [{ id: "doc-z", title: "VM document" }, { id: "doc-a", title: "VM other document" }], knowledgeObjects: [knowledgeObject] } } };
  const sourceBinding = { schema: "VM-only-source-binding", selectionSHA256: sha("VM selection") }, sourceHandle = Object.freeze({});
  const derived = { sourceIndex: 499, diagnosticUnit: 0, phases: Object.fromEntries(["D", "R"].map(p => [p, {
    requestBytes: Buffer.from(JSON.stringify({ vmRequest: p })), responseBytes: Buffer.from(JSON.stringify({ vmResponse: p })),
    latencyBytes: Buffer.from(JSON.stringify({ vmLatency: p })), responseStatus: 200, latencyMs: 19900 }])), proof: { schema: "VM-only-proof" } };
  const control = { synthetik500DispatchJournal: { vm: 1 }, synthetik500KostenAdmission: { vm: 2 }, testKostenAuftrag: { vm: 3 }, testKostenTage: { vm: 4 }, _authStoreRevision: "VM revision" };
  const moduleObjects = {
    source: { extractPinnedSource(args) { events.push("source"); assert.equal(processStub.env.HELMUT_PUBLICATION_ELIGIBILITY_JSON, policy.toString());
      assert.equal(args.diagnosticNonce, nonce); assert.equal(args.packetPath, originalPins.packet.path); assert(args.packetBytes.equals(files.get(originalPins.packet.path).data));
      assert.equal(args.preparedAtUTC, new Date(timer.wall).toISOString()); if (options.sourceFailure) throw Error("VM-source-rejected"); return sourceHandle; },
    readSelection(handle) { assert.equal(handle, sourceHandle); return selected; }, sourceBinding(handle) { assert.equal(handle, sourceHandle); return sourceBinding; } },
    producer: { derive(args) { events.push("producer"); assert.equal(args.sourceHandle, sourceHandle);
      assert(args.preparedBytes.equals(files.get(originalPins.preparedRequests.path).data)); return derived; } },
    command: { build(args) { builderCalls++; events.push("command"); assert.equal(args.sourceHandle, sourceHandle); assert.equal(args.producerResult, derived);
      assert.equal(args.nonce, nonce); assert.equal(args.runId, config.runId); assert.equal(args.nowUTC, new Date(timer.wall).toISOString());
      const command = { target: { database }, vm: "prepared only" }; return { command, admission: {}, initialState: {}, selection: { operationId,
        commandHash: options.wrongBuiltHash ? sha("VM wrong command") : sha(canonical(command)) }, sourceBinding }; } },
    usage: { enabled: () => true, controlReadEnabled: () => true, async readControl({ rowId, target, request }) {
      assert.equal(rowId, "main-auth"); assert.equal(target, "http://127.0.0.1:54321|main-auth");
      return request("/rest/v1/rpc/helmut_auth_state_graph_read_v1", { method: "POST", body: JSON.stringify({ id: "main-auth" }) }); } },
    profile: { hash: x => sha(canonical(x)), kanonisch: canonical },
    storage: { fromMandateProfileRow(p, m) { normalizerCalls++; assert.equal(p.id, selectedProfile.id); assert.equal(m.user_id, selectedProfile.id); return { ...selectedProfile, ...(options.profileDrift ? { changed: true } : {}) }; } },
    ko: { VERSION_FIELDS: koFields, pruefe(row) { assert.equal(row.id, "ko-a"); assert.deepEqual(Object.keys(row).sort(), [...koFields].sort()); } }, inventory: { SOURCE_VERSION_FIELDS: ["id", "title"] }
  };
  function stat(name, big = false) {
    const x = files.get(name) || { kind: "directory", data: Buffer.alloc(0), mode: 0o700, uid: 1000, gid: 1000, dev: 1, ino: 2, nlink: 1, mtimeNs: 1, ctimeNs: 1 };
    const n = v => big ? BigInt(v) : v;
    return { ...Object.fromEntries(["dev", "ino", "uid", "gid", "nlink", "mtimeNs", "ctimeNs"].map(k => [k, n(x[k])])),
      size: n(x.size ?? x.data.length), mode: n(x.mode | (x.kind === "directory" ? 0o040000 : x.kind === "fifo" ? 0o010000 : 0o100000)),
      isFile: () => x.kind === "file", isDirectory: () => x.kind === "directory", isSymbolicLink: () => Boolean(options.symlink && name === CONFIG) };
  }
  const fsStub = { constants: fs.constants, realpathSync: n => n, lstatSync(name, opts) {
    if (name === INPUT && !files.has(name)) { const e = Error("VM absent"); e.code = "ENOENT"; throw e; } return stat(name, opts?.bigint); },
    statSync: name => { assert.equal(name, "/owned-group"); return { dev: 1, ino: options.groupDrift ? 3 : 2 }; }, existsSync: n => files.has(n),
    openSync(name, flags, mode) { assert(flags & fs.constants.O_NOFOLLOW); assert(flags & fs.constants.O_NONBLOCK);
      if (flags & fs.constants.O_CREAT) { assert(flags & fs.constants.O_EXCL); assert.equal(mode, 0o600); assert(name.startsWith(CLIENT + "/"));
        if (files.has(name)) { const e = Error("VM exists"); e.code = "EEXIST"; throw e; } add(name, ""); writes.push(name); }
      assert(files.has(name)); const fd = fdNext++; fds.set(fd, name); offsets.set(fd, 0); return fd; },
    fstatSync: (fd, opts) => stat(fds.get(fd), opts?.bigint), closeSync(fd) { fds.delete(fd); offsets.delete(fd); }, fsyncSync: () => {},
    readSync(fd, b, off, len) { const x = files.get(fds.get(fd)), from = offsets.get(fd), n = Math.min(len, x.data.length - from);
      x.data.copy(b, off, from, from + n); offsets.set(fd, from + n); return n; },
    writeSync(fd, b, off, len) { const x = files.get(fds.get(fd)); x.data = Buffer.concat([x.data, b.subarray(off, off + len)]); return len; },
    readFileSync(name) { if (/^\/proc\/(7|42)\/cgroup$/.test(name)) return "0::/\n";
      const m = /^\/proc\/(7|42)\/stat$/.exec(name); assert(m);
      return m[1] + " (VM process) " + Array.from({ length: 20 }, (_, i) => i === 0 ? "S" : i === 19 ? pidDrift ? "346" : "345" : "0").join(" "); },
    readlinkSync: n => n === "/proc/42/exe" ? "/usr/lib/postgresql/17/bin/postgres" : "/synthetic/node" };
  const ModuleStub = { _cache: { [filename]: {} }, isBuiltin: n => n.startsWith("node:"), _resolveFilename: n => n };
  ModuleStub._load = name => { const key = Object.keys(entries).find(k => path.join(root, entries[k]) === name); assert(key, "only VM modules load");
    if (options.unqualifiedImport && key === "source") ModuleStub._load(path.join(root, "lib/helmut/unlisted.js"));
    ModuleStub._cache[name] = { filename: name }; return moduleObjects[key]; };
  const childStub = { spawn(exe, argv, opts) { assert.equal(exe, config.psqlPin.path); assert.equal(argv[argv.indexOf("-U") + 1], "postgres");
    assert.equal(argv[argv.indexOf("-d") + 1], database); assert.equal(argv[argv.indexOf("-h") + 1], "/ram/socket");
    assert(!Object.keys(opts.env).some(n => /SECRET|TOKEN|PASSWORD|KEY/.test(n))); const child = new EventEmitter(); child.kills = [];
    for (const n of ["stdin", "stdout", "stderr"]) { child[n] = new EventEmitter(); child[n].destroy = () => { child[n].destroyed = true; }; }
    child.kill = signal => { child.kills.push(signal); return true; };
    child.stdin.end = sql => { spawns.push(sql); assert(sql.startsWith("BEGIN READ ONLY;") && sql.endsWith("COMMIT;"));
      assert(!/\b(?:INSERT|UPDATE|DELETE|COPY|CREATE|ALTER|DROP)\b/.test(sql)); if (options.hangRead) return;
      Promise.resolve().then(() => { let value = sql.includes("FROM public.profiles") ? [{ profile: { id: selectedProfile.id }, mandate: { user_id: selectedProfile.id } }]
        : sql.includes("FROM public.raw_documents") ? [...selected.draft.sources.documents].reverse()
          : sql.includes("FROM public.knowledge_objects") ? selected.draft.sources.knowledgeObjects : control;
        if (options.sourceDrift && sql.includes("FROM public.raw_documents")) value = [];
        child.stdout.emit("data", Buffer.from(JSON.stringify(value) + "\n")); if (!options.missingEOF) child.stdout.emit("end"); child.stderr.emit("end");
        if (options.pidDrift) pidDrift = true; child.emit("close", options.nonzeroRead ? 3 : 0, null); }); };
    children.push(child); return child; } };
  const env = { HELMUT_NATIVE_NODE_OLD_SPACE_MIB: "384", HELMUT_STORAGE_BACKEND: "supabase", HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE: database,
    HELMUT_LLM_USAGE_STORAGE: "relational-atomic-v1", HELMUT_AUTH_STATE_STORAGE: "merkle-auth-v1", HELMUT_AUTH_CONTROL_READ: "verified-control-view-v1",
    HELMUT_AUTH_HISTORY_READ_REUSE: "verified-history-reuse-v1", SUPABASE_URL: "http://127.0.0.1:54321", ...options.env };
  const processStub = { pid: 7, version: options.nodeVersion || "v24.19.0", getuid: () => 1000, geteuid: () => 1000, umask: () => {}, env,
    execPath: "/synthetic/node", execArgv: options.execArgv || ["--max-old-space-size=384", "--max-semi-space-size=16"], argv: ["/synthetic/node", filename, "--prepare-own-native-copy"],
    hrtime: { bigint: () => BigInt(timer.now) * 1000000n }, stdout: { write(text) {
      lines.push(text); events.push("ready"); const ready = JSON.parse(text); if (options.noCommand) return;
      const gate = Buffer.from(JSON.stringify({ schema: "helmut-local-unit-native-source-gate/1", originalControlHash: options.wrongGate ? sha("VM wrong control") : ready.originalControlHash }, null, 2) + "\n");
      add(CLIENT + "/SOURCE.SAFE.json", gate); const gatePin = { ...pin(CLIENT + "/SOURCE.SAFE.json"), path: logical + "SOURCE.SAFE.json" };
      const input = { schema: "helmut-local-unit-native-command-input/1", nowUTC: new Date(timer.wall - (options.staleCommand ? 4000 : 0)).toISOString(),
        window: {}, target: { database }, gatePins: { source: gatePin }, codeCommit: "VM-only", runtimeManifestPin: {}, authPin: {}, freshGrantId: sha("VM grant") };
      if (options.spoofHandle) input.sourceHandle = {};
      if (options.codeDriftAfterReady) files.get(config.sourceCodePins[0].path).data = Buffer.from("VM changed source");
      if (options.originalDriftAfterReady) files.get(config.originalPins.packet.path).data = Buffer.from("VM changed original");
      add(INPUT, JSON.stringify(input), options.inputMode ? { mode: 0o640 } : {});
    } } };
  class VMDate extends Date { constructor(...args) { super(...(args.length ? args : [timer.wall])); } static now() { return timer.wall; } }
  const builtins = { "node:fs": fsStub, "node:path": path, "node:crypto": crypto, "node:v8": { getHeapStatistics: () => ({ heap_size_limit: options.heap || 400000000 }) },
    "node:child_process": childStub, "node:module": ModuleStub };
  const localRequire = n => Object.hasOwn(builtins, n) ? builtins[n] : ModuleStub._load(n); localRequire.main = { filename };
  const module = { exports: {} }, api = vm.runInNewContext(code + "\n({start,readFile,jsonFile,nodeBudget,checkConfig,rpcSQL,commandInput,sourceGate});", {
    require: localRequire, module, __filename: filename, __dirname, process: processStub, Buffer, URL, Date: VMDate, setTimeout: timer.setTimeout, clearTimeout: timer.clearTimeout
  }, { filename });
  return { api, timer, files, config, selected, spawns, children, writes, events, lines, process: processStub,
    get builderCalls() { return builderCalls; }, get normalizerCalls() { return normalizerCalls; } };
}
let count = 0, current = "initialization";
async function check(name, fn) { current = name; await fn(); count++; }
(async () => {
  await check("two phases retain genuine VM handles and write exactly seven private files", async () => {
    const s = fixture(), result = await s.api.start(); assert.equal(result.phase, "command-prepared"); assert.equal(result.authorityInstalled, false);
    assert.equal(s.spawns.length, 4); assert.equal(s.builderCalls, 1); assert.equal(s.normalizerCalls, 1); assert.equal(s.lines.length, 1);
    assert.equal(s.writes.length, 7); assert(s.events.indexOf("producer") < s.events.indexOf("ready") && s.events.indexOf("ready") < s.events.indexOf("command"));
    const ready = JSON.parse(s.lines[0]); assert.equal(ready.prepared, true); assert.equal(ready.nativeBridgeQualified, false); assert.equal(ready.originallyUnprivileged, false);
    assert.equal(ready.selectedProfileHash, sha(canonical(s.selected.draft.profile))); assert.equal(ready.selectedSourcesHash, sha(canonical(s.selected.draft.sources)));
    for (const p of Object.values(ready.derivedPins).flatMap(x => Object.values(x))) assert(p.path.startsWith("/workspace/helmut-unit-diagnostic-native/") && !p.path.includes("/client/"));
    assert(!s.lines[0].includes("VM synthetic profile") && !s.lines[0].includes("VM document") && !s.lines[0].includes("testKostenAuftrag"));
    await assert.rejects(s.api.start()); assert.equal(s.spawns.length, 4);
  });
  await check("KO60 retains every actual field within PostgreSQL's100-argument limit", async () => {
    const s = fixture({ fullKO60: true }); await s.api.start();
    const sql = s.spawns.find(text => text.includes("FROM public.knowledge_objects"));
    assert(sql); const chunks = [...sql.matchAll(/jsonb_build_object\(([^()]*(?:to_jsonb\(t\.[a-z0-9_]+\)[^()]*)*)\)/g)];
    assert.equal(chunks.length, 2);
    const fields = chunks.flatMap(match => [...match[1].matchAll(/'([a-z0-9_]+)',to_jsonb\(t\.([a-z0-9_]+)\)/g)].map(pair => {
      assert.equal(pair[1], pair[2]); return pair[1]; }));
    assert.equal(fields.length, 60); assert.equal(new Set(fields).size, 60);
    assert.deepEqual([...fields].sort(), Object.keys(s.selected.draft.sources.knowledgeObjects[0]).sort());
    assert(chunks.every(match => [...match[1].matchAll(/to_jsonb\(/g)].length * 2 <= 100));
    assert.equal(JSON.parse(s.lines[0]).selectedSourcesHash, sha(canonical(s.selected.draft.sources)));
  });
  for (const [name, options] of [["FIFO", { fifo: true }], ["hardlink", { hardlink: true }], ["mode", { wrongMode: true }],
    ["oversize", { oversize: true }], ["symlink", { symlink: true }], ["unlisted code", { missingCode: true }], ["changed code", { wrongCode: true }],
    ["target DB", { wrongDatabase: true }], ["read RPC args", { wrongReadPin: true }], ["unqualified transitive import", { unqualifiedImport: true }]])
    await check(name + " fails before native read or output", async () => { const s = fixture(options); await assert.rejects(s.api.start()); assert.equal(s.spawns.length, 0); assert.equal(s.writes.length, 0); });
  for (const [name, options] of [["Node version", { nodeVersion: "v24.18.0" }], ["extra flag", { execArgv: ["--max-old-space-size=384", "--max-semi-space-size=16", "--inspect"] }],
    ["heap limit", { heap: 512 * 1024 * 1024 }], ["NODE_OPTIONS", { env: { NODE_OPTIONS: "" } }], ["extra environment", { env: { UNEXPECTED_OPTION: "closed" } }]])
    await check(name + " rejects before database", async () => { const s = fixture(options); await assert.rejects(s.api.start()); assert.equal(s.spawns.length, 0); });
  for (const [name, options] of [["source derivation", { sourceFailure: true }], ["read exit", { nonzeroRead: true }], ["read EOF", { missingEOF: true }],
    ["process drift", { pidDrift: true }], ["cgroup drift", { groupDrift: true }], ["profile drift", { profileDrift: true }], ["source rows drift", { sourceDrift: true }]])
    await check(name + " cannot publish ready or command", async () => { const s = fixture(options); await assert.rejects(s.api.start()); assert.equal(s.lines.length, 0); assert.equal(s.builderCalls, 0); assert.equal(s.writes.length, 0); });
  for (const [name, options] of [["missing command", { noCommand: true }], ["old command UTC", { staleCommand: true }], ["input mode", { inputMode: true }],
    ["injected handle", { spoofHandle: true }], ["source gate mismatch", { wrongGate: true }], ["source code drift", { codeDriftAfterReady: true }],
    ["original drift", { originalDriftAfterReady: true }], ["built command mismatch", { wrongBuiltHash: true }]])
    await check(name + " cannot publish phase two result or retry", async () => {
      const s = fixture(options), outcome = observed(s.api.start()); await flush(); if (options.noCommand) await s.timer.advance(15000); await flush();
      assert.equal(outcome.state, "rejected"); assert.equal(s.lines.length, 1); assert.equal(s.writes.length, 6); await assert.rejects(s.api.start());
    });
  await check("bounded read timeout never invents close or EOF", async () => {
    const s = fixture({ hangRead: true }), outcome = observed(s.api.start()); await flush(); await s.timer.advance(34000);
    assert.equal(outcome.state, "rejected"); assert(s.children[0].kills.includes("SIGTERM") && s.children[0].kills.includes("SIGKILL"));
    assert.equal(s.children[0].stdout.destroyed, true); assert.equal(s.lines.length, 0); assert.equal(s.writes.length, 0);
  });
  await check("closed RPC selection and native source code pins are present in read-only SQL", async () => {
    const s = fixture(); for (const p of s.config.readRPCPins) {
      const sql = s.api.rpcSQL(s.config, "/rest/v1/rpc/" + p.name.slice(7), { method: "POST", body: '{"id":"main-auth"}' });
      assert(sql.includes("oidvectortypes(p.proargtypes)='jsonb'") && sql.includes(p.prosrcSHA256) && sql.includes("NOT p.prosecdef"));
    }
    assert.throws(() => s.api.rpcSQL(s.config, "/rest/v1/rpc/arbitrary", { method: "POST", body: '{"id":"main-auth"}' }));
    assert.throws(() => s.api.rpcSQL(s.config, "/rest/v1/rpc/helmut_auth_usage_read_v1", { method: "POST", body: '{"id":"other"}' }));
    assert(!code.includes(".write(auth") && !code.includes("fetch(") && !code.includes("net.createConnection"));
  });
  const after = snapshot(); assert.equal(after.sha256, before.sha256);
  process.stdout.write("Native prepare VM checks PASS: " + count + "; source SHA256=" + before.sha256 + "; stable before/after; native processes/database/provider calls=0.\n");
})().catch(() => { process.stderr.write("Native prepare VM tests FAIL at " + current + "; no native execution occurred.\n"); process.exitCode = 1; });
