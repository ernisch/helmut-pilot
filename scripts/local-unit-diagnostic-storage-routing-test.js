"use strict";

// Routing-only VM fixtures. Both real module sources are evaluated, with RAM
// artifact/endpoint stand-ins and a synthetic scope. No native admission,
// authority, I/O, credential, provider, process or database is created.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, ".."), storagePath = path.join(root, "lib/helmut/storage.js"), storePath = path.join(root, "lib/helmut/local-unit-diagnostic-store.js");
const source = fs.readFileSync(storagePath, "utf8"), storeSource = fs.readFileSync(storePath, "utf8");
const P = require("../lib/helmut/synthetik-500-profile"), C = require("../lib/helmut/synthetik-500-production-command");
const fields = require("../lib/helmut/synthetik-500-w-inventar").SOURCE_VERSION_FIELDS;
const owner = "synthetic-owner", day = "2026-10-22", runId = "nachlauf500-123456", selection = {
  operationId: "localUnitDiagnostic-" + "a".repeat(32), commandHash: "b".repeat(64) };
const doc = Object.fromEntries(fields.map(k => [k, k === "id" ? "synthetic_doc" : null]));
const inputs = { documents: [doc], knowledgeObjects: [] };
const draft = (subject = owner) => ({ id: `bf-${subject}-lage-pruefentwurf-${day}-${runId}-entwurf`, user_id: subject,
  slot: "lage-pruefentwurf", generated_at: day + "T12:00:00.000Z", payload: { phase: "entwurf", tag: day, runId,
    auslieferbar: false, qualitaetBestanden: false } });
const rendered = (subject = owner) => ({ id: `bf-${subject}-lage-${day}`, user_id: subject, slot: "lage", generated_at: day + "T12:00:00.000Z", payload: {} });
function fixture(options = {}) {
  let active = options.active !== false, closed = false, profileRows = [{ id: owner, name: "Synthetic owner", mandate_profiles: [{ user_id: owner, aktiv: true }] }];
  const calls = { nativeReads: [], artifacts: [], legacy: [], batch: 0, logs: [], injected: 0, runtimeWitness: null }, artifacts = new Map();
  const command = { mode: "D-R-1-local-fixture", units: [{ subject: owner }], calendar: { executionDayUTC: day },
    slot: { plan: { runId, intents: [{ id: "synthetic-D-intent" }] } }, drafts: [{ sources: inputs, profile: { id: owner } }] };
  const scope = { currentVerified() { if (closed) throw Error("local-unit-diagnostic-scope-closed"); return active ? { command, selection } : null; } };
  const env = { HELMUT_STORAGE_BACKEND: "supabase", SUPABASE_URL: "http://127.0.0.1:3000",
    HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE: "helmut_unit_diagnostic_" + selection.operationId.slice(-32) };
  const ioForbidden = () => { throw Error("routing-test-real-io-forbidden"); };
  const fsStub = { constants: fs.constants, existsSync: () => true, readFileSync: ioForbidden, writeFileSync: ioForbidden,
    openSync: ioForbidden, mkdirSync: ioForbidden, statSync: ioForbidden, promises: new Proxy({}, { get: () => ioForbidden }) };
  const storeModule = { exports: {} };
  const storeSandbox = { module: storeModule, Buffer, URL, structuredClone, __dirname: path.dirname(storePath), __filename: storePath,
    process: { env }, __routing: {
      read(kind, id) { calls.artifacts.push({ operation: "read", kind, id }); return artifacts.get(kind + ":" + id) ?? null; },
      insert(kind, id, body, parentHash) { calls.artifacts.push({ operation: "insert", kind, id, body, parentHash }); artifacts.set(kind + ":" + id, body); return { saved: true, id }; }
    }, require(name) {
      if (name === "node:fs") return fsStub;
      if (["node:path", "node:crypto", "node:util"].includes(name)) return require(name);
      if (name === "./synthetik-500-profile") return P;
      if (name === path.join(path.dirname(storePath), "local-unit-diagnostic-scope.js")) return scope;
      if (name === "./local-unit-diagnostic-endpoint") return { async request(_selection, _database, method, endpoint, body) {
        assert.equal(JSON.stringify(_selection), JSON.stringify(selection)); assert.equal(method, "GET"); assert.equal(body.length, 0);
        calls.nativeReads.push(endpoint);
        if (options.readFailure) throw Error("synthetic-native-read-unknown");
        const value = endpoint.startsWith("/rest/v1/profiles?") ? profileRows : endpoint.startsWith("/rest/v1/raw_documents?") ? inputs.documents : [];
        return { status: 200, body: Buffer.from(JSON.stringify(value)) };
      } };
      throw Error("routing-test-store-module-" + name);
    } };
  vm.runInNewContext(storeSource + "\nadmissionFor=()=>({});readArtifact=async(_s,k,id)=>__routing.read(k,id);"
    + "insertArtifact=async(_s,k,id,b,p=null)=>__routing.insert(k,id,b,p);", storeSandbox, { filename: storePath });
  const nativeStore = { ...storeModule.exports,
    async readControlSnapshot(_s, _c, _i, _stage, runtimeWitness) { calls.runtimeWitness = runtimeWitness; calls.nativeReads.push("synthetic-bundle"); return Object.freeze({}); },
    consumeControlSnapshot() { return { original: { synthetic: "genuine Original proof is tested separately" }, state: { synthetic: "Own proof" },
      documents: options.missingInput ? [] : options.changedInput ? [{ ...doc, title: "changed" }] : inputs.documents,
      knowledgeObjects: [], profiles: profileRows }; }
  };
  // Parents required by real renderedInsert; these are plain synthetic RAM rows.
  artifacts.set("review:" + draft().id.replace(/entwurf$/, "pruefung"), { synthetic: "parent review" });
  artifacts.set("lage:" + rendered().id, rendered());
  const module = { exports: {} }, noops = { llmUsageRelationalEnabled: () => false }, builtins = {
    fs: fsStub, path, crypto, "node:path": path, "node:crypto": crypto, "node:util": require("node:util"), "node:async_hooks": require("node:async_hooks") };
  const imports = { "./sources": { v1Sources: [] }, "./pending-terminal": {}, "./mandatsklasse": {}, "./llm-usage-relational": noops,
    "./tenant-context": {}, "./speicherpfad-vorflug": {}, "./auth-store-cas": {}, "./llm-usage-atomic": { enabled: () => false },
    "./briefing-speicher-lesediagnose": {}, "./blob-relational": {}, "./knowledge-object-version": { SELECT: "id" },
    "./local-unit-diagnostic-store": nativeStore, "./synthetik-500-production-command": C,
    "./synthetik-500-current-inputs-read-batch": { readBatches() { calls.batch++; return null; } } };
  const sandbox = { module, exports: module.exports, __dirname: path.dirname(storagePath), __filename: storagePath,
    Buffer, URL, URLSearchParams, structuredClone, process: { env },
    console: { error: (...args) => calls.logs.push(args), warn: (...args) => calls.logs.push(args), log: ioForbidden },
    fetch: ioForbidden, require(name) {
      if (Object.hasOwn(builtins, name)) return builtins[name]; if (Object.hasOwn(imports, name)) return imports[name];
      throw Error("routing-test-storage-module-" + name);
    }, __routing: { request: async (endpoint, options = {}) => { calls.legacy.push({ endpoint, options });
      if (endpoint.startsWith("/rest/v1/raw_documents?")) return inputs.documents;
      if (endpoint.startsWith("/rest/v1/knowledge_objects?")) return [];
      return options.body ? [JSON.parse(options.body)] : []; } } };
  vm.runInNewContext(source + `
    module.exports.__routing={backend:()=>[useSupabase(),v3StoreReady(),profileDbModeEnabled()],
      readyLegacy(){v3StoreReady=()=>true;useSupabase=()=>true;profileDbModeEnabled=()=>true;supabaseRequest=__routing.request;},
      writeStore,writeAuthStore,mutateAuthStore,reserveLlmCall,acquirePipelineLock,releasePipelineLock,
      supabase:(...args)=>supabaseRequest(...args)};`, sandbox, { filename: storagePath });
  return { api: module.exports, calls, env, artifacts, request: sandbox.__routing.request,
    injected() { calls.injected++; throw Error("caller-transport-must-not-run"); },
    rows(value) { profileRows = value; }, deactivate() { active = false; }, close() { closed = true; } };
}
let count = 0, current = "initialization";
async function check(name, fn) { current = name; await fn(); count++; }
(async () => {
  await check("active source reads use native GET with unchanged freshness checks and no backend elevation", async () => {
    const s = fixture(); assert.equal(JSON.stringify(s.api.__routing.backend()), "[false,false,false]");
    assert.equal(JSON.stringify(await s.api.readSynthetik500CurrentInputs(inputs)), JSON.stringify(inputs));
    assert.equal(s.calls.nativeReads.length, 1); assert.equal(s.calls.batch, 0); assert.equal(s.calls.legacy.length, 0);
    await assert.rejects(s.api.readSynthetik500CurrentInputs({ ...inputs, extra: true }));
    assert.equal(s.calls.nativeReads.length, 1); assert.equal(JSON.stringify(s.api.__routing.backend()), "[false,false,false]");
  });
  await check("active profile read binds own subject and ignores caller transport without profile/V3 flags", async () => {
    const s = fixture(), profile = await s.api.getProfileFromDb(owner, { request: s.injected });
    assert.equal(profile.id, owner); assert.equal(profile.fullName, "Synthetic owner"); assert.equal(s.calls.injected, 0); assert.equal(s.calls.nativeReads.length, 1);
    await assert.rejects(s.api.getProfileFromDb("other-owner", { request: s.injected }), /profile-owner$/); assert.equal(s.calls.nativeReads.length, 1);
  });
  for (const [name, rows] of [["missing", []], ["foreign", [{ id: "other-owner" }]], ["duplicate", [{ id: owner }, { id: owner }]],
    ["missing mandate", [{ id: owner }]], ["multiple mandates", [{ id: owner, mandate_profiles: [{}, {}] }]],
    ["deleted mandate", [{ id: owner, mandate_profiles: [{ geloescht_at: day }] }]]])
    await check("native " + name + " profile fails without fallback or logging payload", async () => {
      const s = fixture(); s.rows(rows); await assert.rejects(s.api.getProfileFromDb(owner), /profile-readback$/); assert.equal(s.calls.logs.length, 0); assert.equal(s.calls.legacy.length, 0);
    });
  await check("native read failure propagates without legacy profile fallback", async () => {
    const s = fixture({ readFailure: true }); await assert.rejects(s.api.getProfileFromDb(owner), /synthetic-native-read-unknown/); assert.equal(s.calls.logs.length, 0);
  });
  await check("bundled rows reuse actual source/profile normalization with one frame and no GET fallback", async () => {
    const s = fixture(), witness = Object.freeze({}), frame = await s.api.readLocalUnitDiagnosticControlSnapshot(selection, "synthetic-claim", 0, "unit-enter", witness);
    assert.equal(s.calls.runtimeWitness, witness);
    assert.equal(JSON.stringify(frame.inputs), JSON.stringify(inputs)); assert.equal(frame.profile.id, owner);
    assert.equal(frame.profile.fullName, "Synthetic owner"); assert.deepEqual(s.calls.nativeReads, ["synthetic-bundle"]);
    assert.equal(s.calls.legacy.length, 0); assert.equal(s.calls.batch, 0);
  });
  for (const option of ["missingInput", "changedInput"]) await check("bundle " + option + " fails unchanged source freshness checks", async () => {
    const s = fixture({ [option]: true }); await assert.rejects(s.api.readLocalUnitDiagnosticControlSnapshot(selection, "synthetic-claim", 0, "unit-enter"));
    assert.deepEqual(s.calls.nativeReads, ["synthetic-bundle"]); assert.equal(s.calls.legacy.length, 0);
  });
  await check("bundle does not accept a missing RLS profile or fall back", async () => {
    const s = fixture(); s.rows([]); await assert.rejects(s.api.readLocalUnitDiagnosticControlSnapshot(selection, "synthetic-claim", 0, "unit-enter"), /profile-readback$/);
    assert.deepEqual(s.calls.nativeReads, ["synthetic-bundle"]); assert.equal(s.calls.logs.length, 0);
  });
  await check("native draft insert/read retain tenant payload and own-scope checks before any fallback", async () => {
    const s = fixture(), entry = draft(); assert.equal((await s.api.insertLageEntwurfsbeleg(entry, { request: s.injected, bereit: false })).saved, true);
    assert.equal(JSON.stringify(await s.api.getLageEntwurfsbeleg(owner, entry.id, { request: s.injected, bereit: false })), JSON.stringify(entry));
    assert.equal(s.calls.injected, 0); assert.equal(s.calls.legacy.length, 0);
    const old = s.calls.artifacts.length;
    await assert.rejects(s.api.insertLageEntwurfsbeleg({ ...entry, user_id: "" }));
    await assert.rejects(s.api.insertLageEntwurfsbeleg({ ...entry, payload: { ...entry.payload, auslieferbar: true } }));
    await assert.rejects(s.api.insertLageEntwurfsbeleg(draft("other-owner")));
    await assert.rejects(s.api.getLageEntwurfsbeleg("other-owner", draft("other-owner").id));
    assert.equal(s.calls.artifacts.length, old);
  });
  await check("native rendered routes preserve own tenant/slot/day/ID and ignore readiness overrides", async () => {
    const s = fixture(), entry = rendered(); assert.equal((await s.api.insertRenderedBriefingV3(entry, { request: s.injected, bereit: false })).saved, true);
    assert.equal(JSON.stringify(await s.api.getRenderedBriefingV3(owner, "lage", day, { strict: true })), JSON.stringify(entry));
    assert.equal(s.calls.injected, 0); assert.equal(s.calls.legacy.length, 0); const old = s.calls.artifacts.length;
    for (const bad of [{ ...entry, user_id: "" }, { ...entry, slot: "other" }, rendered("other-owner"), { ...entry, id: "foreign-id" }])
      await assert.rejects(s.api.insertRenderedBriefingV3(bad, { request: s.injected }));
    await assert.rejects(s.api.getRenderedBriefingV3("other-owner", "lage", day));
    await assert.rejects(s.api.getRenderedBriefingV3(owner, "lage", "2026-10-23"));
    await assert.rejects(s.api.getRenderedBriefingV3(owner, "lage", day, { profilHash: "c".repeat(64) }));
    assert.equal(s.calls.artifacts.length, old);
  });
  await check("closed scope never reopens production routes", async () => {
    const s = fixture(); s.close();
    for (const action of [() => s.api.getProfileFromDb(owner), () => s.api.readSynthetik500CurrentInputs(inputs),
      () => s.api.insertLageEntwurfsbeleg(draft()), () => s.api.getLageEntwurfsbeleg(owner, draft().id),
      () => s.api.insertRenderedBriefingV3(rendered()), () => s.api.getRenderedBriefingV3(owner, "lage", day)]) await assert.rejects(action());
    assert.equal(s.calls.nativeReads.length + s.calls.artifacts.length + s.calls.legacy.length, 0);
  });
  await check("native legacy mutation chokes and POST/DELETE denial remain intact", async () => {
    const s = fixture();
    for (const action of [() => s.api.__routing.writeStore({}), () => s.api.__routing.writeAuthStore({}),
      () => s.api.__routing.mutateAuthStore(() => {}), () => s.api.__routing.reserveLlmCall(),
      () => s.api.__routing.acquirePipelineLock("legacy"), () => s.api.__routing.releasePipelineLock("legacy"),
      () => s.api.saveRenderedBriefingV3(rendered()), () => s.api.ergaenzeUnvollstaendigesBriefing({}, rendered())])
      await assert.rejects(async () => action(), /legacy-write-forbidden$/);
    for (const method of ["POST", "DELETE"]) await assert.rejects(s.api.__routing.supabase("/rest/v1/briefings", { method }));
    assert.equal(s.calls.nativeReads.length + s.calls.legacy.length, 0);
  });
  await check("inactive legacy readiness and opt-in behavior remain closed without credentials", async () => {
    const s = fixture({ active: false }); assert.equal(await s.api.getProfileFromDb(owner, { request: s.injected }), null);
    assert.equal(await s.api.getRenderedBriefingV3(owner, "lage", day), null);
    await assert.rejects(s.api.readSynthetik500CurrentInputs(inputs), /native-backend-missing$/);
    await assert.rejects(s.api.insertRenderedBriefingV3(rendered()), /speicher-nicht-bereit$/);
    await assert.rejects(s.api.insertLageEntwurfsbeleg(draft()), /speicher-nicht-bereit$/);
    await assert.rejects(s.api.getLageEntwurfsbeleg(owner, draft().id), /speicher-nicht-bereit$/);
    assert.equal(s.calls.injected + s.calls.nativeReads.length + s.calls.artifacts.length + s.calls.legacy.length, 0);
  });
  await check("inactive explicit ready callbacks retain the original rendered/draft request ABI", async () => {
    const s = fixture({ active: false });
    await s.api.insertRenderedBriefingV3(rendered(), { bereit: true, request: s.request });
    await s.api.insertLageEntwurfsbeleg(draft(), { bereit: true, request: s.request });
    assert.equal(s.calls.legacy.length, 2); assert(s.calls.legacy.every(x => x.options.method === "POST" && x.endpoint.startsWith("/rest/v1/briefings?on_conflict=id")));
    assert.equal(s.calls.nativeReads.length + s.calls.artifacts.length, 0);
  });
  await check("inactive enabled legacy source/profile paths remain legacy with RAM-only readiness stand-in", async () => {
    const s = fixture({ active: false }); s.api.__routing.readyLegacy();
    assert.equal(JSON.stringify(await s.api.readSynthetik500CurrentInputs(inputs)), JSON.stringify(inputs));
    assert.equal(s.calls.batch, 1); assert.equal(s.calls.legacy.length, 1);
    let read = 0; const profile = await s.api.getProfileFromDb(owner, { request: async () => { read++; return [{ id: owner, mandate_profiles: [{}] }]; } });
    assert.equal(profile.id, owner); assert.equal(read, 1); assert.equal(s.calls.nativeReads.length, 0);
    assert.equal(await s.api.getProfileFromDb(owner, { request: async () => { throw Error("synthetic-legacy-read-failure"); } }), null);
    assert.equal(s.calls.logs.length, 1);
  });
  process.stdout.write("Storage diagnostic routing checks PASS: " + count + "; VM only; native/DB/provider/process/fileWrites=0.\n");
})().catch(error => { process.stderr.write("Storage diagnostic routing checks FAIL at " + current + ": " + error.name + " " + error.message + "\n"); process.exitCode = 1; });
