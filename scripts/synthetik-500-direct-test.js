"use strict";
// Bounded offline regression for the explicit direct Production contract.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const P = require("../lib/helmut/synthetik-500-profile");
const C = require("../lib/helmut/synthetik-500-production-command");
const E = require("../lib/helmut/synthetik-500-executor");
const R = require("../lib/helmut/synthetik-500-review-receipt");
const D = require("../lib/helmut/synthetik-500-direct-d-store");
const Entry = require("../lib/helmut/synthetik-500-direct-entry");
const CLI = require("./synthetik-500-direct");
const Adapter = require("../lib/helmut/synthetik-500-production-adapter");
const storage = require("../lib/helmut/storage");
const hash = P.hash, clone = structuredClone;
let groups = 0, network = 0;
const noNet = () => { network++; throw Error("offline test forbids network"); };
global.fetch = require("node:https").request = require("node:http").request = noNet;
const test = async (name, fn) => { await fn(); groups++; console.log("PASS " + name); };
const pin = bytes => ({ path: "/tmp/fictional-only", bytes: bytes.length,
  sha256: crypto.createHash("sha256").update(bytes).digest("hex") });
async function main() {
  let command;
  await test("full real direct assembly binds500 owners1000 D/R intents1500 positions without Native D", async () => {
    const input = require("./fixtures/synthetik500-direct")();
    const codec = require("../lib/helmut/synthetik-500-direct-codec");
    command = CLI.prepare(codec.decode(codec.encode(input)));
    assert.equal(C.validate(command).commandHash, hash(command));
    assert.equal(command.units.length, 500); assert.equal(command.slot.plan.intents.length, 1000);
    assert.equal(command.executor.erwartetePositionen.length, 1500); assert.equal(command.native, null);
    assert(command.drafts.every(d => d.profile.profileActive));
    assert(!command.executor.offeneProductionTore.includes("native-immutable-d-storage-und-retention"));
    assert.equal(command.executor.startrecht, false);
    const encoded = codec.encode(command);
    assert(Buffer.byteLength(JSON.stringify(encoded)) < codec.MAX_ENCODED);
    assert.equal(hash(codec.decode(encoded)), hash(command));
    const bad = { ...encoded, bytes: 1 }; assert.throws(() => codec.decode(bad));
    assert.throws(() => codec.decode({ ...encoded, sha256: hash("drift") }));
    assert.throws(() => codec.decode({ ...encoded, bytes: codec.MAX_BYTES + 1 }));
    const fs = require("node:fs"), dir = fs.mkdtempSync("/tmp/helmut-direct-cli-offline-");
    try {
      for (const [name, data] of [["plain", input], ["gzip", codec.encode(input)]]) {
        const inputPath = dir + "/" + name + ".json", out = dir + "/" + name + "-out.json";
        fs.writeFileSync(inputPath, JSON.stringify(data), { mode: 0o600 });
        await CLI.main(["prepare", "--input", inputPath, "--out", out]);
        assert.equal(fs.statSync(out).mode & 0o777, 0o600);
        assert.equal(hash(codec.decode(JSON.parse(fs.readFileSync(out)))), hash(command));
      }
    } finally { fs.rmSync(dir, { recursive: true }); }
  });
  await test("direct contract cannot accept495+5, inactive targets, a native binding or altered executor", () => {
    for (const mutate of [c => { c.drafts.pop(); }, c => { c.drafts[0].profile.profileActive = false; },
      c => { c.native = {}; }, c => { c.executor.regeln.paidRetry = true; }]) {
      const c = clone(command); mutate(c); assert.throws(() => C.validate(c));
    }
    const p = E.vorbereite(P.erzeuge(), E.offeneEingaben(E.DIRECT_INPUT_VERSION));
    assert.equal(p.version, E.DIRECT_VERSION); assert.equal(p.strukturVollstaendig, false);
  });
  await test("CLI is inert by default and forbids unknown actions automatic steps and sharp reads", () => {
    assert.deepEqual(CLI.args(["prepare", "--input", "/tmp/in", "--out", "/tmp/out"]), { action: "prepare", sharp: false, input: "/tmp/in", out: "/tmp/out" });
    for (const argv of [["start", "--command", "/tmp/c", "--out", "/tmp/o"], ["activate"], ["next", "--scharf", "--command", "/tmp/c", "--out", "/tmp/o", "--index", "1"],
      ["status", "--scharf", "--command", "/tmp/c", "--out", "/tmp/o"], ["export", "--command", "/tmp/c", "--out", "/tmp/o", "--index", "500"]]) assert.throws(() => CLI.args(argv));
  });
  await test("separate testGO preserves exact scope and original byte pins, every drift rejects", () => {
    const plan = command.slot.plan, time = plan.startsAtUTC;
    const go = { version: "helmut-synthetik500-test-go/1", operationId: plan.operationId, productionCommit: plan.productionCommit,
      deploymentId: plan.routeContract.route.deploymentId, planHash: command.slot.planHash, paketHash: command.package.bindung.paketHash,
      startsAtUTC: plan.startsAtUTC, endsAtUTC: plan.endsAtUTC, authorizedAtUTC: time,
      authorizationReference: "FICTIONAL ONLY — no actual operator authorization", confirmation: "SEPARATES_GO_EXAKT500_SYNTHETIK_PRODUCTION_TEST" };
    C.validateTestGo(command, go, time);
    for (const key of Object.keys(go)) { const bad = clone(go); bad[key] = key === "authorizationReference" ? "" : "drift"; assert.throws(() => C.validateTestGo(command, bad, time)); }
    const goBytes = Buffer.from(JSON.stringify(go));
    const gate = { version: C.ACTUAL_GATE_VERSION, purpose: "testGo", rootExecutor: "/root", operationId: plan.operationId,
      runId: plan.runId, productionCommit: plan.productionCommit, planHash: command.slot.planHash, commandHash: hash(command),
      acceptedActualScope: true, primaryEvidencePins: [pin(goBytes)] };
    const gateBytes = Buffer.from(JSON.stringify(gate));
    const record = { productionCommit: plan.productionCommit, planHash: command.slot.planHash, commandHash: hash(command),
      evidencePins: { testGo: pin(gateBytes) } };
    const authority = { gateBytes: gateBytes.toString("base64"), goBytes: goBytes.toString("base64") };
    assert.deepEqual(C.validateStoredAuthority(command, record, authority, time), go);
    for (const key of ["gateBytes", "goBytes"]) assert.throws(() => C.validateStoredAuthority(command, record, { ...authority, [key]: Buffer.from("{}").toString("base64") }, time));
    assert.throws(() => C.validateStoredAuthority(command, record, null, time));
    assert(!C.DIRECT_GATES.includes("nativeD")); assert(C.DIRECT_GATES.includes("testGo"));
    // Real private-pin loader with explicitly fictional gate originals. This
    // proves the install seam accepts the direct set and still reads all pins;
    // it is neither an actual Root review nor an operator authorization.
    const fs = require("node:fs"), dir = fs.mkdtempSync("/tmp/helmut-direct-offline-");
    const write = (name, value) => {
      const file = dir + "/" + name, bytes = Buffer.from(JSON.stringify(value));
      fs.writeFileSync(file, bytes, { mode: 0o600 }); return { ...pin(bytes), path: file };
    };
    try {
      const primary = write("primary.json", { purpose: "FICTIONAL OFFLINE ONLY" }), goPin = write("go.json", go);
      const admission = { version: C.ADMISSION_VERSION, executor: "/root", purpose: "finite-D-R-500",
        commandHash: hash(command), planHash: command.slot.planHash, productionCommit: plan.productionCommit,
        admittedAtUTC: time, expiresAtUTC: plan.endsAtUTC, controlHash: hash("fictional-control"), booksHash: hash("fictional-books"),
        gates: {}, evidencePins: {} };
      for (const purpose of C.DIRECT_GATES) {
        admission.gates[purpose] = true;
        admission.evidencePins[purpose] = write(purpose + ".json", { ...gate, purpose,
          primaryEvidencePins: [purpose === "testGo" ? goPin : primary] });
      }
      const commandPin = write("command.json", require("../lib/helmut/synthetik-500-direct-codec").encode(command));
      const admissionPin = write("admission.json", admission), packet = C.loadPacket(commandPin, admissionPin, time);
      assert.equal(hash(packet.command), hash(command));
      assert.deepEqual(C.validateStoredAuthority(command, admission, packet.testAuthority, time), go);
      fs.writeFileSync(primary.path, "{}", { mode: 0o600 });
      assert.throws(() => C.loadPacket(commandPin, admissionPin, time), /evidence/);
    } finally { fs.rmSync(dir, { recursive: true }); }
  });
  await test("direct private D storage enforces actual completion ledger usage owner and readback without RPC", async () => {
    const now = new Date().toISOString(), day = now.slice(0, 10), owner = command.drafts[0].profile.id;
    const start = new Date(Date.now() - 1000).toISOString(), end = new Date(Date.now() + 60000).toISOString();
    const intent = { id: hash("fictional-D"), phase: "D", owner, inputVersionHash: hash("context"), maxOutputTokens: 3000 };
    const slot = { planHash: hash("plan"), plan: { operationId: "synthetik500-direct-fictional", runId: "nachlauf500-1790848860000",
      startsAtUTC: start, endsAtUTC: end, intents: [intent] } };
    const entry = { id: "fictional-draft", user_id: owner, slot: "lage-pruefentwurf", generated_at: now,
      payload: { runId: slot.plan.runId, phase: "entwurf", auslieferbar: false, qualitaetBestanden: false,
        antwort: { paragraphs: ["Fiktiv"] }, quellen: [], profilHash: hash("profile") } };
    const usage = { id: "fictional-usage", success: true };
    const base = { version: R.COMPLETION_VERSION, planHash: slot.planHash, operationId: slot.plan.operationId,
      runId: slot.plan.runId, dIntentId: intent.id, dTicket: { id: "fictional-ticket", day }, owner,
      contextHash: intent.inputVersionHash, providerResponseHash: hash("response"), providerTextHash: hash("text"),
      outputHash: hash(entry.payload.antwort), sourceContext: { profileHash: entry.payload.profilHash, sourcesHash: hash([]) },
      usageReceipt: { id: usage.id, recordHash: hash(usage) }, costMicroUsd: 20, completedAtUTC: now };
    const completion = { ...base, completionHash: hash(base) };
    const journal = { operationId: slot.plan.operationId, commandHash: hash("command"), planHash: slot.planHash,
      claimId: "fictional-claim", state: "running", stopRequested: false, index: 0,
      units: [{ subject: owner }], inFlight: { intentIds: [intent.id] }, attempts: { [intent.id]: { status: "accounted", ticketId: "fictional-ticket", day } } };
    const auth = { synthetik500KostenAdmission: slot, llmUsage: [usage], testKostenTage: { [day]: { calls: { "fictional-ticket": {
      status: "abgerechnet", cost: 20, admission: { intentId: intent.id, planHash: slot.planHash } } } } },
      synthetik500DispatchJournal: { version: "helmut-synthetik500-dispatch-journal/1", activeOperationId: journal.operationId, operations: { [journal.operationId]: journal } } };
    let saved, inserts = 0;
    const io = { auth: async () => auth, command: async () => ({ command: { version: C.DIRECT_VERSION, mode: "D-R-500", native: null, slot }, admission: {} }),
      insert: async (_op, _id, value) => { inserts++; saved = clone(value); }, read: async () => clone(saved) };
    const old = C.admission; C.admission = () => "isolated-context-boundary-stub";
    try {
      assert.deepEqual(await D.contract(io), { version: D.VERSION, contractHash: D.CONTRACT_HASH });
      const q = await D.store(io, entry, completion, D.CONTRACT_HASH);
      assert.deepEqual(await D.read(io, owner, q.id, q.versionHash, q.contractHash), entry);
      const before = inserts;
      for (const change of [x => { x.user_id = "foreign"; }, x => { x.payload.antwort = {}; }]) {
        const bad = clone(entry); change(bad); await assert.rejects(D.store(io, bad, completion, D.CONTRACT_HASH));
      }
      auth.llmUsage[0].success = false; await assert.rejects(D.store(io, entry, completion, D.CONTRACT_HASH)); auth.llmUsage[0].success = true;
      assert.equal(inserts, before);
      await assert.rejects(D.store({ ...io, insert: async () => { inserts++; throw Error("unknown INSERT"); } }, entry, completion, D.CONTRACT_HASH));
      assert.equal(inserts, before + 1);
      saved.entry.payload.antwort = {}; await assert.rejects(D.read(io, owner, q.id, q.versionHash, q.contractHash));
      journal.stopRequested = true; await assert.rejects(D.contract(io));
    } finally { C.admission = old; }
  });
  await test("active500 runtime guard rejects partial stale foreign or expired states before paid work", async () => {
    const names = ["profileDbModeEnabled", "profileDbExclusiveEnabled", "readSynthetik500Runtime"];
    const old = Object.fromEntries(names.map(k => [k, storage[k]])), T = require("../lib/helmut/kommunikationsriegel"), mode = T.modus;
    let runtime = { zustand: "aktiv", aktiv: 500, gesamt: 500, identitaeten: 501,
      profilManifestHash: hash(command.executor.eingaben.runtimeManifest.profilvertrag),
      endeAm: command.slot.plan.endsAtUTC, beobachtetAm: new Date().toISOString() };
    try {
      T.modus = () => T.MODUS_TESTFENSTER; storage.profileDbModeEnabled = storage.profileDbExclusiveEnabled = () => true;
      storage.readSynthetik500Runtime = async () => runtime;
      assert.deepEqual(await Adapter.directRuntime(command), runtime);
      for (const change of [r => { r.aktiv = 499; }, r => { r.aktiv = 501; }, r => { r.identitaeten = 500; },
        r => { r.zustand = "beendet"; }, r => { r.profilManifestHash = hash("foreign"); },
        r => { r.beobachtetAm = new Date(Date.now() - 61000).toISOString(); }, r => { r.beobachtetAm = new Date(Date.now() + 1000).toISOString(); }]) {
        const prior = clone(runtime); change(runtime); await assert.rejects(Adapter.directRuntime(command)); runtime = prior;
      }
      T.modus = () => "off"; await assert.rejects(Adapter.directRuntime(command));
    } finally { T.modus = mode; Object.assign(storage, old); }
  });
  await test("retained unit evidence keeps full D/R and cost receipts independently of later usage rings", async () => {
    const oldRead = storage.readAuthStore, oldDraft = storage.getLageEntwurfsbeleg;
    const exportNames = ["loadSynthetik500ProductionCommand", "readSynthetik500Runtime", "readSynthetik500RuntimeEnvelope", "readSynthetik500ProductionEvidence"];
    const oldExport = Object.fromEntries(exportNames.map(k => [k, storage[k]]));
    const owner = command.drafts[0].profile.id, ids = command.units[0].intentIds;
    const auth = { synthetik500KostenAdmission: { planHash: command.slot.planHash,
      consumed: Object.fromEntries(ids.map(id => [id, { day: "2026-10-01", ticketId: id }])),
      draftCompletions: { [ids[0]]: { original: "D-completion" } }, reviewBindings: { [ids[1]]: { original: "R-binding" } } },
      testKostenTage: { "2026-10-01": { calls: Object.fromEntries(ids.map(id => [id, { status: "abgerechnet", cost: 20 }])) } },
      llmUsage: [{ id: "D", runId: command.slot.plan.runId, profileId: owner },
        { id: "R", runId: command.slot.plan.runId, politicianId: owner }, { id: "foreign", runId: "foreign", profileId: owner }] };
    try {
      storage.readAuthStore = async () => auth;
      storage.getLageEntwurfsbeleg = async (user_id, id) => ({ user_id, id, payload: {
        phase: id.endsWith("entwurf") ? "entwurf" : "pruefung", fullText: "FICTIONAL COMPLETE TEXT" } });
      const evidence = await Adapter.directArtifacts(command, 0, true);
      assert.equal(evidence.draft.payload.fullText, "FICTIONAL COMPLETE TEXT");
      assert.equal(evidence.review.payload.phase, "pruefung"); assert.equal(evidence.costs.intents.length, 2);
      assert.equal(evidence.costs.intents[0].draftCompletion.original, "D-completion");
      assert.equal(evidence.costs.intents[1].reviewBinding.original, "R-binding");
      assert.deepEqual(evidence.costs.usage.map(x => x.id), ["D", "R"]);
      const closedSlot = clone(auth.synthetik500KostenAdmission);
      auth.llmUsage.length = 0; auth.synthetik500KostenAdmission.consumed = {};
      assert.equal(evidence.costs.usage.length, 2); assert(evidence.costs.intents[0].consumed);
      auth.synthetik500KostenAdmission.planHash = hash("drift"); await assert.rejects(Adapter.directArtifacts(command, 0, true));
      storage.getLageEntwurfsbeleg = async () => null; await assert.rejects(Adapter.directArtifacts(command, 0, true));
      const args = { operationId: command.slot.plan.operationId, commandHash: hash(command) };
      const unit = { ...args, index: 0, artifacts: evidence }, c = { commandHash: args.commandHash,
        closedSlot, units: [{ entered: true }], outputs: [{ resultHash: hash(unit) }] };
      auth.synthetik500DispatchJournal = { operations: { [args.operationId]: c } };
      storage.loadSynthetik500ProductionCommand = async () => ({ command });
      storage.readSynthetik500Runtime = storage.readSynthetik500RuntimeEnvelope = async () => ({ fixture: true });
      storage.readSynthetik500ProductionEvidence = async () => unit;
      assert.deepEqual((await Adapter.exportEvidence(args, null)).costs.admission, closedSlot);
      assert.deepEqual(await Adapter.exportEvidence(args, 0), unit);
      unit.artifacts = {}; await assert.rejects(Adapter.exportEvidence(args, 0), /export-evidence-drift/);
    } finally { storage.readAuthStore = oldRead; storage.getLageEntwurfsbeleg = oldDraft; Object.assign(storage, oldExport); }
  });
  await test("operator accepts only protected bounded selectors on exact immutable deployment", async () => {
    const oldLoad = storage.loadSynthetik500ProductionCommand, oldValidate = C.validate;
    const names = ["productionStart", "productionNext", "requestStop", "status", "exportEvidence"];
    const old = Object.fromEntries(names.map(k => [k, Adapter[k]])), calls = [];
    const route = command.slot.plan.routeContract.route, env = { VERCEL_ENV: "production", HELMUT_ADMIN_SECRET: "fictional-admin-secret",
      VERCEL_GIT_COMMIT_SHA: route.productionCommit, VERCEL_URL: route.deploymentHost, VERCEL_DEPLOYMENT_ID: route.deploymentId };
    const invoke = async (body, overrides = {}, search = "", envOverride = {}) => {
      const req = new EventEmitter(); req.method = "POST"; req.pause = () => {}; req.headers = { authorization: "Bearer " + env.HELMUT_ADMIN_SECRET, "content-type": "application/json" };
      Object.assign(req, overrides);
      const res = { status: null, body: null, writeHead(code) { this.status = code; }, end(text) { this.body = JSON.parse(text); } };
      const work = Entry.handleRequest(req, res, new URL("https://example.org" + Entry.PATH + search), { jsonHeaders: x => x, env: { ...env, ...envOverride } });
      setImmediate(() => { req.emit("data", Buffer.from(JSON.stringify(body))); req.emit("end"); });
      await work; return res;
    };
    try {
      storage.loadSynthetik500ProductionCommand = async () => ({ command }); C.validate = () => ({ plan: command.slot.plan });
      for (const n of names) Adapter[n] = async (...a) => { calls.push([n, a]); return { fictional: true }; };
      const body = { action: "status", operationId: command.slot.plan.operationId, commandHash: hash(command) };
      for (const action of Entry.ACTIONS) {
        const r = await invoke({ ...body, action, ...(action === "export" ? { index: null } : {}) });
        assert.equal(r.status, 200);
      }
      assert.deepEqual(calls.map(c => c[0]), names);
      const before = calls.length;
      for (const r of [await invoke(body, { headers: {} }), await invoke(body, { method: "GET" }),
        await invoke({ ...body, command: {} }), await invoke(body, {}, "?secret=forbidden"),
        await invoke(body, {}, "", { VERCEL_URL: "foreign.vercel.app" }),
        await invoke(body, {}, "", { VERCEL_DEPLOYMENT_ID: "dpl_Foreign" }),
        await invoke({ ...body, action: "export", index: 500 }), await invoke({ ...body, huge: "x".repeat(1024) })]) assert.notEqual(r.status, 200);
      assert.equal(calls.length, before);
    } finally { storage.loadSynthetik500ProductionCommand = oldLoad; C.validate = oldValidate; Object.assign(Adapter, old); }
  });
  assert.equal(network, 0);
  console.log(JSON.stringify({ groups, networkCalls: network, modelCalls: 0, production: false, nativeD: false }));
}
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { main };
