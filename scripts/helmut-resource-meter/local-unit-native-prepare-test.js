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
const VERIFY_CONFIG = "/bench/VERIFY_CONFIG.PRIVATE.json", VERIFY_EXPECTED = "/bench/VERIFY_EXPECTED.PRIVATE.json", VERIFICATION = "/bench/SOURCE_VERIFICATION.SAFE.json";
const SOURCE_COMMAND = "/bench/PREPARED_COMMAND.PRIVATE.json";
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
  const sourceHandles = new WeakMap(), extracted = [], produced = [], retainedOutputs = new Map();
  const add = (name, data, extra = {}) => files.set(name, { data: Buffer.from(data), kind: "file", mode: 0o600, uid: 1000, gid: 1000,
    dev: 1, ino: inode++, nlink: 1, mtimeNs: 1, ctimeNs: 1, ...extra });
  const pin = name => ({ path: name, bytes: files.get(name).data.length, sha256: sha(files.get(name).data) });
  const nonce = "a".repeat(32), operationId = "localUnitDiagnostic-" + nonce, database = "helmut_unit_diagnostic_" + nonce;
  const logical = "/workspace/helmut-unit-diagnostic-native/" + nonce + "/";
  const configPath = options.verify ? VERIFY_CONFIG : CONFIG, authorizedAtUTC = new Date(timer.wall - 1500).toISOString();
  const bindingAt = at => ({ schema: "VM-only-source-binding", selectionSHA256: sha("VM selection"), preparation: { preparedAtUTC: at } });
  add(filename, before.bytes); add("/synthetic/node", "VM Node bytes"); add("/usr/lib/postgresql/17/bin/psql", "VM psql bytes");
  add("/usr/lib/postgresql/17/bin/postgres", "VM postgres bytes");
  const entries = { source: "lib/helmut/local-unit-diagnostic-source.js", producer: "lib/helmut/local-unit-diagnostic-original-producer.js",
    command: "scripts/helmut-resource-meter/local-unit-native-command.js", usage: "lib/helmut/llm-usage-atomic.js", profile: "lib/helmut/synthetik-500-profile.js",
    storage: "lib/helmut/storage.js", ko: "lib/helmut/knowledge-object-version.js", inventory: "lib/helmut/synthetik-500-w-inventar.js" };
  for (const [key, name] of Object.entries(entries)) add(path.join(root, name), "VM source " + key);
  const originalPins = Object.fromEntries(["packet", "install", "terminal", "preparedRequests", "actualRequestBindings", "providerFixtures"].map(key => {
    const name = "/original/" + key + ".json"; add(name, JSON.stringify({ vmOnly: key })); return [key, pin(name)]; }));
  const policy = Buffer.from('{"version":1,"holds":[]}'.padEnd(493, " ")); add("/original/policy.json", policy);
  const config = { schema: options.verify ? "helmut-local-unit-native-source-verify/1" : "helmut-local-unit-native-prepare/1", nonce, runId: "nachlauf500-1234567890123", database,
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
  if (options.staleConfig) config.issuedAtUTC = new Date(timer.wall - 10001).toISOString();
  if (options.expiredConfig) config.expiresAtUTC = new Date(timer.wall - 1).toISOString();
  const configExtra = { ...(options.fifo ? { kind: "fifo" } : {}), ...(options.hardlink ? { nlink: 2 } : {}),
    ...(options.wrongMode ? { mode: 0o640 } : {}), ...(options.oversize ? { size: 1048577 } : {}) };
  add(configPath, JSON.stringify(config), configExtra);
  const selectedProfile = { id: "test-kohorte-synthetik-bt-001", fullName: "VM synthetic profile" };
  const koFields = ["id", "headline", ...Array.from({ length: options.fullKO60 ? 58 : 0 }, (_, i) => "field_" + i)];
  const knowledgeObject = Object.fromEntries(koFields.map(key => [key, key === "id" ? "ko-a" : key === "headline" ? "VM KO" : "VM " + key]));
  const selected = { sourceIndex: 499, diagnosticUnit: 0, draft: { profile: selectedProfile,
    sources: { documents: [{ id: "doc-z", title: "VM document" }, { id: "doc-a", title: "VM other document" }], knowledgeObjects: [knowledgeObject] } } };
  const derived = { sourceIndex: 499, diagnosticUnit: 0, phases: Object.fromEntries(["D", "R"].map(p => [p, {
    requestBytes: Buffer.from(JSON.stringify({ vmRequest: p })), responseBytes: Buffer.from(JSON.stringify({ vmResponse: p })),
    latencyBytes: Buffer.from(JSON.stringify({ vmLatency: p })), responseStatus: 200, latencyMs: 19900 }])),
    proof: { schema: "VM-only-proof", sourceIntentIds: { D: sha("VM original D"), R: sha("VM original R") } } };
  const control = { synthetik500DispatchJournal: { vm: 1 }, synthetik500KostenAdmission: { vm: 2 }, testKostenAuftrag: { vm: 3 }, testKostenTage: { vm: 4 }, _authStoreRevision: "VM revision" };
  const proofAt = at => ({ ...derived.proof, ...(options.timeBoundProducerProof ? { vmPreparedAtUTC: at } : {}) });
  const moduleObjects = {
    source: { extractPinnedSource(args) { events.push("source"); assert.equal(processStub.env.HELMUT_PUBLICATION_ELIGIBILITY_JSON, policy.toString());
      assert.equal(args.diagnosticNonce, nonce); assert.equal(args.packetPath, originalPins.packet.path); assert(args.packetBytes.equals(files.get(originalPins.packet.path).data));
      assert.equal(args.preparedAtUTC, options.verify ? authorizedAtUTC : new Date(timer.wall).toISOString()); if (options.sourceFailure) throw Error("VM-source-rejected");
      const handle = Object.freeze({}), binding = bindingAt(args.preparedAtUTC);
      sourceHandles.set(handle, binding); extracted.push({ handle, binding }); return handle; },
    readSelection(handle) { assert(sourceHandles.has(handle)); return selected; }, sourceBinding(handle) { assert(sourceHandles.has(handle)); return sourceHandles.get(handle); },
    verifyCommandSource(command, handle) { assert(sourceHandles.has(handle)); assert.equal(extracted.length, 1); assert.equal(command.vm, "prepared only");
      events.push("verify-command-source"); if (options.verifyCommandFailure) throw Error("VM-command-source-rejected"); return sourceHandles.get(handle); } },
    producer: { derive(args) { events.push("producer"); assert(sourceHandles.has(args.sourceHandle));
      assert.equal(args.sourceHandle, extracted.at(-1).handle); assert(args.preparedBytes.equals(files.get(originalPins.preparedRequests.path).data));
      assert(args.bindingBytes.equals(files.get(originalPins.actualRequestBindings.path).data)); assert(args.fixtureBytes.equals(files.get(originalPins.providerFixtures.path).data));
      let result = { ...derived, proof: proofAt(sourceHandles.get(args.sourceHandle).preparation.preparedAtUTC), phases: Object.fromEntries(Object.entries(derived.phases).map(([p, value]) => [p, { ...value,
        ...Object.fromEntries(["requestBytes", "responseBytes", "latencyBytes"].map(k => [k, Buffer.from(value[k])])) }])) };
      if (produced.length && options.lateDrift) {
        if (options.aliasEarlierProducer) result = produced[0];
        const { phase, field } = options.lateDrift;
        result.phases[phase][field] = field.endsWith("Bytes") ? Buffer.concat([result.phases[phase][field], Buffer.from(" VM drift")]) : result.phases[phase][field] + 1;
      }
      if (options.verifyDrift) { const { phase, field } = options.verifyDrift;
        result.phases[phase][field] = field.endsWith("Bytes") ? Buffer.concat([result.phases[phase][field], Buffer.from(" VM drift")]) : result.phases[phase][field] + 1; }
      produced.push(result); return result; } },
    command: { build(args) { builderCalls++; events.push("command"); assert.equal(extracted.length, 2); assert.equal(produced.length, 2);
      assert.equal(args.sourceHandle, extracted[1].handle); assert.notEqual(args.sourceHandle, extracted[0].handle); assert.equal(args.producerResult, produced[1]);
      assert.equal(args.nonce, nonce); assert.equal(args.runId, config.runId); assert.equal(args.nowUTC, new Date(timer.wall).toISOString());
      assert.equal(sourceHandles.get(args.sourceHandle).preparation.preparedAtUTC, args.nowUTC);
      const command = { target: { database }, vm: "prepared only" }; return { command, admission: { authorizedAtUTC: args.nowUTC }, initialState: {}, selection: { operationId,
        commandHash: options.wrongBuiltHash ? sha("VM wrong command") : sha(canonical(command)) },
        sourceBinding: sourceHandles.get(extracted[options.earlyBuiltBinding ? 0 : 1].handle) }; } },
    usage: { enabled: () => true, controlReadEnabled: () => true, async readControl({ rowId, target, request }) {
      assert.equal(rowId, "main-auth"); assert.equal(target, "http://127.0.0.1:54321|main-auth");
      return request("/rest/v1/rpc/helmut_auth_state_graph_read_v1", { method: "POST", body: JSON.stringify({ id: "main-auth" }) }); } },
    profile: { hash: x => sha(canonical(x)), kanonisch: canonical },
    storage: { fromMandateProfileRow(p, m) { normalizerCalls++; assert.equal(p.id, selectedProfile.id); assert.equal(m.user_id, selectedProfile.id); return { ...selectedProfile, ...(options.profileDrift ? { changed: true } : {}) }; } },
    ko: { VERSION_FIELDS: koFields, pruefe(row) { assert.equal(row.id, "ko-a"); assert.deepEqual(Object.keys(row).sort(), [...koFields].sort()); } }, inventory: { SOURCE_VERSION_FIELDS: ["id", "title"] }
  };
  if (options.verify) {
    const command = { target: { database }, vm: "prepared only" }, commandHash = sha(canonical(command));
    const built = { command, admission: { commandHash, authorizedAtUTC }, initialState: {}, selection: { operationId, commandHash }, sourceBinding: bindingAt(authorizedAtUTC) };
    if (options.wrongVerifiedAdmission) built.admission.authorizedAtUTC = new Date(timer.wall).toISOString();
    if (options.wrongPreparedBinding) built.sourceBinding = bindingAt(new Date(timer.wall - 2000).toISOString());
    add(SOURCE_COMMAND, JSON.stringify(built));
    const derivedPins = Object.fromEntries(["D", "R"].map(phase => [phase, Object.fromEntries(["request", "response", "latency"].map(kind => {
      const name = phase + "_" + kind.toUpperCase() + ".PRIVATE.json"; add(CLIENT + "/" + name, derived.phases[phase][kind + "Bytes"]);
      retainedOutputs.set(CLIENT + "/" + name, Buffer.from(files.get(CLIENT + "/" + name).data)); return [kind, { ...pin(CLIENT + "/" + name), path: logical + name }]; }))]));
    const expected = { schema: "helmut-local-unit-native-source-verify-expected/1", operationId, commandHash, authorizedAtUTC,
      preparedCommandPin: pin(SOURCE_COMMAND),
      sourceProofHash: sha(canonical(bindingAt(options.earlyExpectedSource ? new Date(timer.wall - 2000).toISOString() : authorizedAtUTC))),
      selectionHash: sha("VM selection"), selectedProfileHash: sha(canonical(selectedProfile)), selectedSourcesHash: sha(canonical(selected.draft.sources)),
      originalControlHash: sha(canonical(Object.fromEntries(Object.entries(control).filter(([key]) => key !== "_authStoreRevision")))),
      producerProofHash: sha(canonical(proofAt(options.earlyExpectedProducer ? new Date(timer.wall - 2000).toISOString() : authorizedAtUTC))),
      producerTransport: { sourceIntentIds: { ...derived.proof.sourceIntentIds }, phases: { D: { responseStatus: 200, latencyMs: 19900 }, R: { responseStatus: 200, latencyMs: 19900 } } }, derivedPins };
    if (options.verifyExpectedField) expected[options.verifyExpectedField] = sha("VM different expected hash");
    if (options.verifyMetadataDrift) expected.producerTransport.phases.R.latencyMs++;
    if (options.verifyIntentDrift) expected.producerTransport.sourceIntentIds.R = sha("VM different intent");
    if (options.verifyOutputDrift) { const name = CLIENT + "/R_RESPONSE.PRIVATE.json"; files.get(name).data = Buffer.from("VM changed response");
      if (options.verifyReboundOutput) expected.derivedPins.R.response = { ...pin(name), path: logical + "R_RESPONSE.PRIVATE.json" }; }
    if (options.verifyOutputPath) expected.derivedPins.D.request.path = logical + "R_REQUEST.PRIVATE.json";
    if (options.clientPreparedPath) expected.preparedCommandPin.path = CLIENT + "/PREPARED_COMMAND.PRIVATE.json";
    if (options.logicalPreparedPath) expected.preparedCommandPin.path = logical + "PREPARED_COMMAND.PRIVATE.json";
    if (options.verifyExpectedExtra) expected.sourceHandle = {};
    add(VERIFY_EXPECTED, JSON.stringify(expected), options.expectedFIFO ? { kind: "fifo" } : options.expectedMode ? { mode: 0o640 } : {});
    config.expectedPin = pin(VERIFY_EXPECTED); if (options.wrongExpectedPath) config.expectedPin.path = "/bench/OTHER.PRIVATE.json";
    add(configPath, JSON.stringify(config), configExtra);
    if (options.verificationExists) add(VERIFICATION, "VM old result");
    // Verification must also tolerate existing preparation-only input; it never
    // reads or consumes that earlier phase's command-input protocol.
    add(INPUT, "VM must not be parsed");
  }
  function stat(name, big = false) {
    const x = files.get(name) || { kind: "directory", data: Buffer.alloc(0), mode: 0o700, uid: 1000, gid: 1000, dev: 1, ino: 2, nlink: 1, mtimeNs: 1, ctimeNs: 1 };
    const n = v => big ? BigInt(v) : v;
    return { ...Object.fromEntries(["dev", "ino", "uid", "gid", "nlink", "mtimeNs", "ctimeNs"].map(k => [k, n(x[k])])),
      size: n(x.size ?? x.data.length), mode: n(x.mode | (x.kind === "directory" ? 0o040000 : x.kind === "fifo" ? 0o010000 : 0o100000)),
      isFile: () => x.kind === "file", isDirectory: () => x.kind === "directory", isSymbolicLink: () => Boolean(options.symlink && name === configPath) };
  }
  const fsStub = { constants: fs.constants, realpathSync: n => n, lstatSync(name, opts) {
    if (name === INPUT && !files.has(name)) { const e = Error("VM absent"); e.code = "ENOENT"; throw e; } return stat(name, opts?.bigint); },
    statSync: name => { assert.equal(name, "/owned-group"); return { dev: 1, ino: options.groupDrift ? 3 : 2 }; }, existsSync: n => files.has(n),
    openSync(name, flags, mode) { assert(flags & fs.constants.O_NOFOLLOW); assert(flags & fs.constants.O_NONBLOCK);
      if (flags & fs.constants.O_CREAT) { assert(flags & fs.constants.O_EXCL); assert.equal(mode, 0o600); assert(options.verify ? name === VERIFICATION : name.startsWith(CLIENT + "/"));
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
          : sql.includes("FROM public.knowledge_objects") ? selected.draft.sources.knowledgeObjects
            : sql.includes("jsonb_build_object('readRPCs',2)") ? { readRPCs: options.badCatalog ? 1 : 2 } : control;
        if (options.sourceDrift && sql.includes("FROM public.raw_documents")) value = [];
        if (options.controlDrift && sql.includes("SELECT public.helmut_auth_state_graph_read_v1")) value = { ...control, testKostenAuftrag: { changed: true } };
        if (options.outputDriftAfterRead && sql.includes("FROM public.raw_documents")) files.get(CLIENT + "/D_REQUEST.PRIVATE.json").data = Buffer.from("VM response-time drift");
        if (options.expectedDriftAfterRead && sql.includes("FROM public.raw_documents")) files.get(VERIFY_EXPECTED).data = Buffer.from("VM changed expected");
        child.stdout.emit("data", Buffer.from(JSON.stringify(value) + "\n")); if (!options.missingEOF) child.stdout.emit("end"); child.stderr.emit("end");
        if (options.pidDrift) pidDrift = true; child.emit("close", options.nonzeroRead ? 3 : 0, null); }); };
    children.push(child); return child; } };
  const env = { HELMUT_NATIVE_NODE_OLD_SPACE_MIB: "384", HELMUT_STORAGE_BACKEND: "supabase", HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE: database,
    HELMUT_LLM_USAGE_STORAGE: "relational-atomic-v1", HELMUT_AUTH_STATE_STORAGE: "merkle-auth-v1", HELMUT_AUTH_CONTROL_READ: "verified-control-view-v1",
    HELMUT_AUTH_HISTORY_READ_REUSE: "verified-history-reuse-v1", SUPABASE_URL: "http://127.0.0.1:54321", ...options.env };
  const processStub = { pid: 7, version: options.nodeVersion || "v24.19.0", getuid: () => 1000, geteuid: () => 1000, umask: () => {}, env,
    execPath: "/synthetic/node", execArgv: options.execArgv || ["--max-old-space-size=384", "--max-semi-space-size=16"], argv: ["/synthetic/node", filename,
      options.verify ? "--verify-own-native-source" : "--prepare-own-native-copy"],
    hrtime: { bigint: () => BigInt(timer.now) * 1000000n }, stdout: { write(text) {
      lines.push(text); events.push("ready"); const ready = JSON.parse(text);
      for (const name of writes) retainedOutputs.set(name, Buffer.from(files.get(name).data));
      if (options.noCommand) return;
      const publishCommand = () => {
      const gate = Buffer.from(JSON.stringify({ schema: "helmut-local-unit-native-source-gate/1", originalControlHash: options.wrongGate ? sha("VM wrong control") : ready.originalControlHash }, null, 2) + "\n");
      add(CLIENT + "/SOURCE.SAFE.json", gate); const gatePin = { ...pin(CLIENT + "/SOURCE.SAFE.json"), path: logical + "SOURCE.SAFE.json" };
      const input = { schema: "helmut-local-unit-native-command-input/1", nowUTC: new Date(timer.wall - (options.staleCommand ? 4000 : 0)).toISOString(),
        window: {}, target: { database }, gatePins: { source: gatePin }, codeCommit: "VM-only", runtimeManifestPin: {}, authPin: {}, freshGrantId: sha("VM grant") };
      if (options.spoofHandle) input.sourceHandle = {};
      if (options.codeDriftAfterReady) files.get(config.sourceCodePins[0].path).data = Buffer.from("VM changed source");
      if (options.originalDriftAfterReady) files.get(config.originalPins.packet.path).data = Buffer.from("VM changed original");
      if (options.outputDriftAfterReady) files.get(CLIENT + "/R_RESPONSE.PRIVATE.json").data = Buffer.from("VM changed retained response");
      add(INPUT, JSON.stringify(input), options.inputMode ? { mode: 0o640 } : {});
      };
      if (options.commandDelayMs) timer.setTimeout(publishCommand, options.commandDelayMs); else publishCommand();
    } } };
  class VMDate extends Date { constructor(...args) { super(...(args.length ? args : [timer.wall])); } static now() { return timer.wall; } }
  const builtins = { "node:fs": fsStub, "node:path": path, "node:crypto": crypto, "node:v8": { getHeapStatistics: () => ({ heap_size_limit: options.heap || 400000000 }) },
    "node:child_process": childStub, "node:module": ModuleStub };
  const localRequire = n => Object.hasOwn(builtins, n) ? builtins[n] : ModuleStub._load(n); localRequire.main = { filename };
  const module = { exports: {} }, api = vm.runInNewContext(code + "\n({start,readFile,jsonFile,nodeBudget,checkConfig,rpcSQL,commandInput,sourceGate});", {
    require: localRequire, module, __filename: filename, __dirname, process: processStub, Buffer, URL, Date: VMDate, setTimeout: timer.setTimeout, clearTimeout: timer.clearTimeout
  }, { filename });
  return { api, timer, files, config, selected, spawns, children, writes, events, lines, extracted, produced, retainedOutputs, process: processStub,
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
    assert.deepEqual(ready.producerTransport.sourceIntentIds, { D: sha("VM original D"), R: sha("VM original R") });
    assert.deepEqual(ready.producerTransport.phases, { D: { responseStatus: 200, latencyMs: 19900 }, R: { responseStatus: 200, latencyMs: 19900 } });
    for (const p of Object.values(ready.derivedPins).flatMap(x => Object.values(x))) assert(p.path.startsWith("/workspace/helmut-unit-diagnostic-native/") && !p.path.includes("/client/"));
    assert(!s.lines[0].includes("VM synthetic profile") && !s.lines[0].includes("VM document") && !s.lines[0].includes("testKostenAuftrag"));
    await assert.rejects(s.api.start()); assert.equal(s.spawns.length, 4);
  });
  await check("late opaque source binding uses admission UTC while early READY and six outputs stay unchanged", async () => {
    const s = fixture({ commandDelayMs: 1000 }), outcome = observed(s.api.start()); await flush();
    assert.equal(outcome.state, "pending"); assert.equal(s.lines.length, 1); const readyLine = s.lines[0], ready = JSON.parse(readyLine);
    await s.timer.advance(1000); assert.equal(outcome.state, "resolved");
    assert.equal(s.extracted.length, 2); assert.equal(s.produced.length, 2); assert.notEqual(s.extracted[0].handle, s.extracted[1].handle);
    assert.notEqual(s.extracted[0].binding.preparation.preparedAtUTC, s.extracted[1].binding.preparation.preparedAtUTC);
    const built = JSON.parse(s.files.get(CLIENT + "/PREPARED_COMMAND.PRIVATE.json").data);
    assert.equal(built.admission.authorizedAtUTC, "2026-10-22T12:00:01.000Z");
    assert.equal(built.sourceBinding.preparation.preparedAtUTC, built.admission.authorizedAtUTC);
    assert.deepEqual(built.sourceBinding, s.extracted[1].binding);
    assert.equal(ready.sourceProofHash, sha(canonical(s.extracted[0].binding)));
    assert.notEqual(sha(canonical(built.sourceBinding)), ready.sourceProofHash); assert.equal(s.lines[0], readyLine);
    assert.equal(s.writes.length, 7); assert.equal(s.retainedOutputs.size, 6);
    for (const [name, bytes] of s.retainedOutputs) assert(s.files.get(name).data.equals(bytes));
  });
  await check("every late D/R byte and metadata drift rejects including mutation of an aliased early result", async () => {
    for (const phase of ["D", "R"]) for (const field of ["requestBytes", "responseBytes", "latencyBytes", "responseStatus", "latencyMs"]) {
      const s = fixture({ lateDrift: { phase, field }, aliasEarlierProducer: true }); await assert.rejects(s.api.start());
      assert.equal(s.produced.length, 2); assert.equal(s.produced[0], s.produced[1]);
      assert.equal(s.builderCalls, 0); assert.equal(s.lines.length, 1); assert.equal(s.writes.length, 6);
      assert(!s.files.has(CLIENT + "/PREPARED_COMMAND.PRIVATE.json"));
      for (const [name, bytes] of s.retainedOutputs) assert(s.files.get(name).data.equals(bytes));
    }
  });
  await check("early binding substitution and retained-file changes cannot bypass late derivation", async () => {
    const s = fixture({ commandDelayMs: 1000, earlyBuiltBinding: true }), outcome = observed(s.api.start()); await flush();
    await s.timer.advance(1000); assert.equal(outcome.state, "rejected"); assert.equal(s.builderCalls, 1); assert.equal(s.writes.length, 6);
    const changed = fixture({ outputDriftAfterReady: true }); await assert.rejects(changed.api.start());
    assert.equal(changed.builderCalls, 0); assert.equal(changed.writes.length, 6);
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
  await check("verification reconstructs the late opaque handle and only publishes one metadata file", async () => {
    const s = fixture({ verify: true, timeBoundProducerProof: true, fullKO60: true }), initial = new Map([...s.files].map(([name, value]) => [name, Buffer.from(value.data)]));
    const result = await s.api.start(); assert.equal(result.schema, "helmut-local-unit-native-source-verification/1");
    assert.equal(s.extracted.length, 1); assert.equal(s.produced.length, 1); assert.equal(s.builderCalls, 0); assert.equal(s.normalizerCalls, 1);
    assert.equal(s.lines.length, 0); assert.equal(s.spawns.length, 5); assert.deepEqual(s.writes, [VERIFICATION]);
    assert.equal(result.preparedCommandPin.path, SOURCE_COMMAND); assert(!s.files.has(CLIENT + "/PREPARED_COMMAND.PRIVATE.json"));
    assert(s.events.includes("verify-command-source")); assert.equal(result.authorizedAtUTC, "2026-10-22T11:59:58.500Z");
    assert.equal(result.checkedAtUTC, "2026-10-22T12:00:00.000Z");
    assert.equal(result.sourceProofHash, sha(canonical(s.extracted[0].binding)));
    assert.equal(result.producerProofHash, sha(canonical(s.produced[0].proof)));
    assert.equal(result.process.pid, 7); assert.equal(result.process.startTicks, "345"); assert.equal(result.actualNodeBudget.heapSizeLimitBytes, 400000000);
    assert(s.spawns[0].includes("p.prokind='f'") && s.spawns[0].includes("NOT p.prosecdef"));
    for (const p of s.config.readRPCPins) assert(s.spawns[0].includes(p.prosrcSHA256) && s.spawns[0].includes("p.oid=" + p.oid + "::oid"));
    for (const [name, bytes] of initial) assert(s.files.get(name).data.equals(bytes));
    assert.deepEqual(JSON.parse(s.files.get(VERIFICATION).data), JSON.parse(JSON.stringify(result)));
    const text = s.files.get(VERIFICATION).data.toString();
    for (const forbidden of ["VM synthetic profile", "VM document", "vmRequest", "vmResponse", "vmLatency", "qualified", "authorityInstalled", "sourceHandle", "testKostenAuftrag"])
      assert(!text.includes(forbidden));
    await assert.rejects(s.api.start()); assert.equal(s.spawns.length, 5);
  });
  await check("verification accepts an unchanged time-independent genuine producer proof", async () => {
    const s = fixture({ verify: true, earlyExpectedProducer: true }); await s.api.start();
    assert.equal(s.produced[0].proof.vmPreparedAtUTC, undefined); assert.deepEqual(s.writes, [VERIFICATION]);
  });
  for (const [name, options] of [["early source proof", { earlyExpectedSource: true }],
    ["early time-dependent producer proof", { earlyExpectedProducer: true, timeBoundProducerProof: true }],
    ["prepared admission UTC", { wrongVerifiedAdmission: true }], ["prepared early binding", { wrongPreparedBinding: true }],
    ["genuine command source rejection", { verifyCommandFailure: true }], ["unexpected DTO key", { verifyExpectedExtra: true }],
    ["client-visible prepared command path", { clientPreparedPath: true }], ["logical prepared command path", { logicalPreparedPath: true }],
    ["expected FIFO", { expectedFIFO: true }], ["expected private mode", { expectedMode: true }],
    ["nonfixed expected path", { wrongExpectedPath: true }], ["existing terminal", { verificationExists: true }]])
    await check("verification rejects " + name + " before database and output", async () => {
      const s = fixture({ verify: true, ...options }); await assert.rejects(s.api.start()); assert.equal(s.spawns.length, 0); assert.equal(s.builderCalls, 0); assert.equal(s.writes.length, 0);
    });
  await check("verification binds all six actual buffers and both phase metadata without replacing existing files", async () => {
    for (const phase of ["D", "R"]) for (const field of ["requestBytes", "responseBytes", "latencyBytes", "responseStatus", "latencyMs"]) {
      const s = fixture({ verify: true, verifyDrift: { phase, field } }); await assert.rejects(s.api.start());
      assert.equal(s.spawns.length, 0); assert.equal(s.writes.length, 0);
      for (const [name, bytes] of s.retainedOutputs) assert(s.files.get(name).data.equals(bytes));
    }
  });
  for (const [name, options] of [["changed retained FD", { verifyOutputDrift: true }],
    ["rebound retained hash with different bytes", { verifyOutputDrift: true, verifyReboundOutput: true }],
    ["phase filename substitution", { verifyOutputPath: true }], ["transport metadata", { verifyMetadataDrift: true }], ["source intent", { verifyIntentDrift: true }]])
    await check("verification rejects " + name, async () => { const s = fixture({ verify: true, ...options }); await assert.rejects(s.api.start()); assert.equal(s.spawns.length, 0); assert.equal(s.writes.length, 0); });
  await check("verification compares every expected actual source hash", async () => {
    for (const field of ["sourceProofHash", "producerProofHash", "selectionHash", "selectedProfileHash", "selectedSourcesHash", "originalControlHash", "commandHash"]) {
      const s = fixture({ verify: true, verifyExpectedField: field }); await assert.rejects(s.api.start()); assert.equal(s.writes.length, 0);
    }
  });
  for (const [name, options] of [["fresh typed catalog", { badCatalog: true }], ["native original control", { controlDrift: true }],
    ["native profile", { profileDrift: true }], ["native raw source", { sourceDrift: true }], ["native read exit", { nonzeroRead: true }],
    ["native read EOF", { missingEOF: true }], ["immutable output drift during native read", { outputDriftAfterRead: true }],
    ["expected-file drift during native read", { expectedDriftAfterRead: true }]])
    await check("verification cannot publish after " + name + " failure", async () => {
      const s = fixture({ verify: true, ...options }); await assert.rejects(s.api.start()); assert.equal(s.writes.length, 0); assert.equal(s.lines.length, 0); assert.equal(s.builderCalls, 0);
    });
  await check("verification retains strict common Node/config/code/PG/cgroup guards", async () => {
    for (const options of [{ nodeVersion: "v24.18.0" }, { env: { NODE_OPTIONS: "" } }, { wrongCode: true }, { fifo: true }, { staleConfig: true },
      { expiredConfig: true }, { wrongReadPin: true }, { pidDrift: true }, { groupDrift: true }, { env: { HELMUT_AUTH_GRAPH_READ_REUSE: "on" } },
      { env: { HELMUT_AUTH_SINGLE_WRITE_CAPTURE: "on" } }]) {
      const s = fixture({ verify: true, ...options }); await assert.rejects(s.api.start()); assert.equal(s.writes.length, 0);
    }
  });
  await check("verification read timeout preserves unknown close and cannot write a result", async () => {
    const s = fixture({ verify: true, hangRead: true }), outcome = observed(s.api.start()); await flush(); await s.timer.advance(34000);
    assert.equal(outcome.state, "rejected"); assert(s.children[0].kills.includes("SIGTERM") && s.children[0].kills.includes("SIGKILL"));
    assert.equal(s.writes.length, 0); assert.equal(s.lines.length, 0);
  });
  const after = snapshot(); assert.equal(after.sha256, before.sha256);
  process.stdout.write("Native prepare VM checks PASS: " + count + "; source SHA256=" + before.sha256 + "; stable before/after; native processes/database/provider calls=0.\n");
})().catch(() => { process.stderr.write("Native prepare VM tests FAIL at " + current + "; no native execution occurred.\n"); process.exitCode = 1; });
