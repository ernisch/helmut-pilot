"use strict";

// New adapter checks only: local in-memory stores and explicit fictional
// receipts. No native SQL, provider, environment file, archive or old suite.
const assert = require("node:assert/strict");
const P = require("../lib/helmut/synthetik-500-profile");
const A = require("../lib/helmut/synthetik-500-kosten-admission");
const K = require("../lib/helmut/testkosten-budget");
const KO = require("../lib/helmut/knowledge-object-version");
const C = require("../lib/helmut/synthetik-500-production-command");
const J = require("../lib/helmut/synthetik-500-dispatch-journal");
const Adapter = require("../lib/helmut/synthetik-500-production-adapter");
const START = "2030-01-02T12:00:00.000Z", END = "2030-01-02T13:00:00.000Z", DAY = START.slice(0, 10);
const COMMIT = "c".repeat(40), OP = "synthetik500-production-fake-only", RUN = "nachlauf500-1893585600000";
const sha = x => P.hash(x), clone = structuredClone;
const noNet = () => { throw Error("this test forbids all network"); };
global.fetch = noNet;
require("node:https").request = noNet;
require("node:http").request = noNet;
let passed = 0;
const orderV4Only = process.argv.includes("--order-v4");
const boundedDrOnly = process.argv.includes("--bounded-dr-only");
async function test(name, f) {
  if (orderV4Only && !name.startsWith("20USD order")) return;
  if (boundedDrOnly && !name.startsWith("bounded DR")) return;
  await f(); passed++; console.log("PASS " + name);
}
function fixture(phase = "U") {
  const descriptor = phase === "U" ? { phase: "U", vorgangId: "fixture-only", contractInputHash: "d".repeat(40),
    actualRequestHash: sha("fake-U-body"), model: "gpt-5-mini", maxOutputTokens: 3000, attemptLimit: 1 }
    : { phase: "D", owner: "test-kohorte-synthetik-bt-001", inputVersionHash: sha("fake-context"),
      actualRequestHash: sha("fake-D-body"), model: "gpt-5-mini", maxOutputTokens: 3000, attemptLimit: 1 };
  const routeContract = { version: A.ROUTE_CONTRACT_VERSION, runtimeManifestHash: sha("fake-runtime"), route: {
    provider: "azure", responsesUrl: "https://helmut-resource.openai.azure.com/openai/v1/responses", model: "gpt-5-mini",
    productionCommit: COMMIT, deploymentHost: "helmut-fake-immutable.vercel.app", deploymentId: "dpl_FakeOnly", authMode: "api-key" }, management: {
    modelFamily: "gpt-5-mini", versionPolicy: "family-context-price-class-re-admit-on-contradiction", contextTokens: 400000,
    maxInputTokens: 272000, inputReserveTokens: 400000, maxOutputTokens: 128000, reasoningIncludedInOutput: true,
    inputUsdPerMillion: 0.5, outputUsdPerMillion: 4, validFromUTC: START, validUntilUTC: END,
    evidencePins: Object.fromEntries(["rootAdmission", "management", "serviceContext", "price"].map(name => [name,
      { name: "fake-" + name, sha256: sha(name), bytes: 1 }])) } };
  const intent = { id: A.intentHash(RUN, descriptor), ...descriptor };
  const plan = { version: A.ROUTE_PLAN_VERSION, operationId: OP, runId: RUN, productionCommit: COMMIT,
    runtimeManifestHash: sha("fake-runtime"), startsAtUTC: START, endsAtUTC: END, intents: [intent],
    sourceBinding: { inputVersion: A.ROUTE_INPUT_VERSION, inputHash: sha("fake-W-no-actual"), projectionVersion: KO.VERSION,
      projectionFieldsetHash: KO.FIELDSET_HASH }, routeContract };
  const slot = { version: A.ROUTE_VERSION, plan, planHash: sha(plan), consumed: {}, draftCompletions: {},
    reviewBindings: {}, reviewBindingsHash: sha({}) };
  const doc = Object.fromEntries(require("../lib/helmut/synthetik-500-w-inventar").SOURCE_VERSION_FIELDS.map(k => [k, null]));
  doc.id = "fake-document";
  const command = { version: C.VERSION, mode: "U-prestage", package: null, executor: null, slot,
    understanding: [{ intentId: intent.id, cluster: { documents: [require("../lib/helmut/quellen-auszug").geleseneQuelle(clone(doc))] },
      reads: { getExisting: { "fixture-only": null }, findVorgangCandidates: {}, listVorgangDocuments: {} },
      sources: { documents: [doc], knowledgeObjects: [] }, options: {} }], drafts: [], predecessors: [], native: null,
    units: [{ kind: "U", subject: JSON.stringify([descriptor.vorgangId, descriptor.contractInputHash]), intentIds: [intent.id] }] };
  const auth = { llmUsage: [], testKostenAuftrag: { version: 3, id: "fake-order", abTag: DAY, limit: 7000000, externGebunden: 0 } };
  const record = { version: C.ADMISSION_VERSION, executor: "/root", purpose: "finite-U-prestage-no-500", commandHash: sha(command),
    planHash: slot.planHash, productionCommit: COMMIT, admittedAtUTC: START, expiresAtUTC: END,
    controlHash: C.controlHash(auth), booksHash: C.booksHash(auth),
    gates: Object.fromEntries(C.GATES.filter(g => !["nativeD", "endGuard", "outputContract"].includes(g)).map(g => [g, true])), evidencePins: {} };
  record.evidencePins = Object.fromEntries(Object.keys(record.gates).map(g => [g, { path: "/tmp/fake-only-" + g,
    bytes: 1, sha256: sha("never-read-as-actual") }]));
  return { command, record, auth, intent };
}
function setup() {
  const f = fixture();
  J.install(f.auth, f.command, sha(f.command), C.controlHash(f.auth));
  J.claim(f.auth, sha(f.command), "fake-claim", START);
  J.enter(f.auth, sha(f.command), "fake-claim", 0, START);
  return f;
}
async function main() {
  await test("20USD order installs an inert U-prestage with real financial validation; invalid pairing consumes nothing", async () => {
    const storagePath = require.resolve("../lib/helmut/storage"), oldCache = require.cache[storagePath];
    const oldLoad = C.loadPacket, oldActive = K.aktiv, oldCommit = process.env.HELMUT_PRODUCTION_COMMIT;
    const time = new Date(), start = new Date(time.getTime() - 1000).toISOString(), end = new Date(time.getTime() + 3600000).toISOString();
    try {
      K.aktiv = () => true; process.env.HELMUT_PRODUCTION_COMMIT = COMMIT;
      for (const version of [4, 3]) {
        const f = fixture();
        f.auth[K.AUFTRAG_KEY] = { version, id: "fake-order", abTag: time.toISOString().slice(0, 10), limit: 20000000, externGebunden: 0 };
        const day = time.toISOString().slice(0, 10);
        f.auth[K.KEY] = { [day]: { version: K.VERSION, day, tarif: K.konfiguration({}).tarif,
          limit: K.LIMIT_MICRO_USD, spent: 0, baseline: 0, manualCalls: 0, manualUntil: null, calls: {}, frozen: null } };
        Object.assign(f.command.slot.plan, { startsAtUTC: start, endsAtUTC: end });
        Object.assign(f.command.slot.plan.routeContract.management, { validFromUTC: start, validUntilUTC: end });
        f.command.slot.planHash = sha(f.command.slot.plan);
        Object.assign(f.record, { commandHash: sha(f.command), planHash: f.command.slot.planHash,
          admittedAtUTC: start, expiresAtUTC: end, controlHash: C.controlHash(f.auth), booksHash: C.booksHash(f.auth) });
        let auth = clone(f.auth), staged = 0;
        C.loadPacket = () => ({ command: f.command, admission: f.record });
        require.cache[storagePath] = { id: storagePath, filename: storagePath, loaded: true, exports: {
          synthetik500ProductionBackend() {}, leseLlmTageszaehler: async () => ({ ok: true, used: 0 }),
          stageSynthetik500ProductionCommand: async () => { staged++; },
          mutateAuthStore: async fn => { const next = clone(auth), result = await fn(next); auth = next; return result; }
        } };
        if (version === 4) {
          const result = await Adapter.install({}, {});
          assert.equal(result.installed, true); assert.equal(result.started, false);
          assert.equal(K.auftragsStand(auth, day).limitMicroUsd, 20000000);
          assert.deepEqual(auth[K.KEY], f.auth[K.KEY], "Installation preserves the existing book and creates no money ticket");
          assert.equal(J.current(auth).state, "installed");
        } else {
          await assert.rejects(Adapter.install({}, {}), /test-usd-auftrag-unlesbar/);
          assert.deepEqual(auth, f.auth, "Invalid pairing does not install a plan or consume a position");
        }
        assert.equal(staged, 1);
      }
    } finally {
      if (oldCache) require.cache[storagePath] = oldCache; else delete require.cache[storagePath];
      C.loadPacket = oldLoad; K.aktiv = oldActive;
      if (oldCommit === undefined) delete process.env.HELMUT_PRODUCTION_COMMIT; else process.env.HELMUT_PRODUCTION_COMMIT = oldCommit;
    }
  });
  await test("closed production selector refuses booleans/functions before storage", async () => {
    await assert.rejects(Adapter.productionStart({ go: true }), /closed-selector-only/);
    await assert.rejects(Adapter.productionStart({ operationId: OP, commandHash: sha("x"), dispatch: noNet }), /closed-selector-only/);
  });
  await test("real strict routed U-prestage schema is not full 500 admission", () => {
    const f = fixture(); assert.equal(C.validate(f.command).plan.intents.length, 1);
    assert.equal(C.admission(f.command, f.record, START, true), sha(f.command));
    const bad = clone(f.command); bad.mode = "D-R-500";
    assert.throws(() => C.validate(bad), /future-u-dependent-D/);
  });
  await test("each missing actual gate or pin rejects, not source-derived acceptance", () => {
    const f = fixture();
    for (const name of Object.keys(f.record.gates)) {
      const bad = clone(f.record); bad.gates[name] = false;
      assert.throws(() => C.admission(f.command, bad, START), /actual-gate/);
      bad.gates[name] = true; bad.evidencePins[name] = null;
      assert.throws(() => C.admission(f.command, bad, START), /evidence-pin/);
    }
    assert.throws(() => C.admission(f.command, { ...f.record, admittedAtUTC: "2029-12-31T12:00:00.000Z" }, START, true), /root-admission/);
  });
  await test("separate actual receipts bind exact purpose/operation/plan/commit and primary bytes", () => {
    const f = fixture(), gate = { version: C.ACTUAL_GATE_VERSION, purpose: "finiteW", rootExecutor: "/root",
      operationId: OP, runId: RUN, productionCommit: COMMIT, planHash: f.record.planHash,
      commandHash: f.record.commandHash, acceptedActualScope: true, primaryEvidencePins: [f.record.evidencePins.finiteW] };
    C.validateActualGate(f.command, f.record, "finiteW", gate);
    for (const name of ["version", "purpose", "rootExecutor", "operationId", "runId", "productionCommit", "planHash", "commandHash", "acceptedActualScope"]) {
      const bad = clone(gate); bad[name] = name === "acceptedActualScope" ? false : "source-only-is-not-actual";
      assert.throws(() => C.validateActualGate(f.command, f.record, "finiteW", bad), /actual-receipt-scope/);
    }
    assert.throws(() => C.validateActualGate(f.command, f.record, "finiteW", { ...gate, primaryEvidencePins: [] }), /actual-receipt-scope/);
  });
  await test("arbitrary cluster/source expansion and function dependencies refuse", () => {
    const f = fixture(), bad = clone(f.command); bad.understanding[0].cluster.documents[0].id = "outside";
    assert.throws(() => C.validate(bad), /original-cluster/);
    f.command.understanding[0].options.requestUnderstanding = noNet;
    assert.throws(() => C.validate(f.command), /json-wert/);
  });
  await test("install compares prior slot/journal, never blind replacement", () => {
    const f = fixture();
    assert.throws(() => J.install(f.auth, f.command, sha(f.command), sha("stale")), /install-cas/);
    f.auth[A.KEY] = f.command.slot;
    assert.throws(() => J.install(f.auth, f.command, sha(f.command), C.controlHash(f.auth)), /unmanaged-existing-slot/);
  });
  await test("concurrent claims have one winner; process death and expiry do not reopen", () => {
    const f = setup();
    assert.throws(() => J.claim(f.auth, sha(f.command), "second-worker", START), /already-claimed/);
    assert.throws(() => J.claim(f.auth, sha(f.command), "new-process", END), /already-claimed/);
    assert.throws(() => J.enter(f.auth, sha(f.command), "fake-claim", 0, START), /unit-reentry/);
  });
  await test("installed closed central gate refuses foreign finite intent and stop", () => {
    const f = setup();
    assert.throws(() => J.reservation(f.auth, sha("foreign"), START), /outside-finite-unit/);
    J.stop(f.auth, sha(f.command), "fake-root-stop");
    assert.throws(() => J.reservation(f.auth, f.intent.id, START), /claim-or-window/);
    delete f.auth[A.KEY];
    assert.throws(() => A.pruefeInaktiv(f.auth), /cost-guard-inactive/);
    assert.throws(() => A.pruefe(f.auth, { admission: null }, START, COMMIT), /permanent-journal-without-slot/);
  });
  await test("new budget reservation books cost and permanent attempt in same fake CAS", async () => {
    const f = setup(); let state = f.auth;
    const storage = { mutateAuthStore: async fn => { const next = clone(state); const r = await fn(next); state = next; return r; },
      leseLlmTageszaehler: async () => ({ ok: true, used: 0 }) };
    const request = { model: "gpt-5-mini", maxOutputTokens: 3000, runId: RUN, politicianId: null, phase: null,
      admission: { operationId: OP, planHash: f.command.slot.planHash, routeContractHash: sha(f.command.slot.plan.routeContract) },
      vorgangId: f.intent.vorgangId, contractInputHash: f.intent.contractInputHash,
      actualRequestHash: f.intent.actualRequestHash, runtimeRouteSnapshot: f.command.slot.plan.routeContract.route };
    const deps = { storage, env: { VERCEL_ENV: "production", HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt", AZURE_OPENAI_KEY: "fictional-only",
      HELMUT_PRODUCTION_COMMIT: COMMIT }, now: () => new Date(START), id: () => "fake-ticket" };
    // Create the genuine-shaped current day in this fake, not a production book.
    state.testKostenTage = { [DAY]: { version: 2, day: DAY, tarif: "azure-gpt5-mini-obergrenze-20260909", limit: 6000000,
      spent: 0, baseline: 0, baselineCalls: 0, manualCalls: 0, manualUntil: null, calls: {}, frozen: null } };
    const ticket = await K.reserviere(request, deps);
    assert.equal(ticket.execution.claimId, "fake-claim");
    assert.equal(state.testKostenTage[DAY].calls[ticket.id].reserved, 212000);
    J.sending(state, ticket, START);
    assert.throws(() => J.sending(state, ticket, START), /send-once/);
    await assert.rejects(K.reserviere(request, { ...deps, id: () => "second-ticket" }), /intent-consumed|outside-finite-unit|reservierung-nicht-bestaetigt/);
    assert.equal(Object.keys(state.testKostenTage[DAY].calls).length, 1);
    await assert.rejects(K.abschliessen(ticket, { model: "gpt-5-mini" }, { storage }), /abschluss/);
    assert.equal(state.testKostenTage[DAY].calls[ticket.id].status, "ungeklaert");
    assert.equal(J.current(state).attempts[f.intent.id].status, "unknown");
    assert.equal(state.testKostenTage[DAY].calls[ticket.id].reserved, 212000);
    assert.throws(() => J.close(state, sha(f.command), "fake-claim"), /close-inflight-or-unknown/);
  });
  await test("D→R is ordered by accounted D, unknown D forbids R permanently", () => {
    const f = setup(), c = J.current(f.auth), rid = sha("fake-R"); c.inFlight.intentIds.push(rid);
    const t = { id: "fake-D-ticket", day: DAY };
    const a = { ...f.command.slot.plan, intentId: f.intent.id };
    const execution = J.reserved(f.auth, a, t, START);
    assert.throws(() => J.reservation(f.auth, rid, START), /prior-attempt-not-accounted/);
    J.accounting(f.auth, { ...t, admission: a, execution }, "accounted");
    J.reservation(f.auth, rid, START);
    J.accounting(f.auth, { ...t, admission: a, execution }, "unknown");
    assert.throws(() => J.reservation(f.auth, rid, START), /claim-or-window/);
  });
  await test("terminal archive retains consumed slot; cross-plan U pair cannot replay", () => {
    const f = setup(), c = J.current(f.auth); c.attempts[f.intent.id] = { status: "accounted" };
    J.finish(f.auth, sha(f.command), "fake-claim", 0, sha("fake-result"), [], START);
    J.close(f.auth, sha(f.command), "fake-claim"); assert.deepEqual(c.closedSlot, f.auth[A.KEY]);
    const next = clone(f.command); next.slot.plan.operationId = OP + "-next"; next.slot.planHash = sha(next.slot.plan);
    assert.throws(() => J.install(f.auth, next, sha(next), C.controlHash(f.auth)), /u-predecessor-consumed/);
  });
  await test("non-JSON private Lage token cannot be minted by request fields", () => {
    const B = require("../lib/helmut/synthetik-500-lage-input"), d = { profile: { id: "fictional" }, briefingDatum: START, briefingEingabe: { fake: true } };
    assert.throws(() => B.read({ briefingDatum: START }, d.profile), /forged/);
    const token = B.create(d); assert.equal(B.read(token, d.profile).briefingDatum, START);
    assert.throws(() => B.read(token, { id: "foreign" }), /profile-drift/);
  });
  await test("canonical native argument bytes preserve existing hash domain and UTF8 caps", () => {
    const value = { z: "Größe 😀", a: [null, 1, true] };
    assert.equal(require("node:crypto").createHash("sha256").update(P.kanonisch(value), "utf8").digest("hex"), sha(value));
    assert.equal(P.kanonisch(value), '{"a":[null,1,true],"z":"Größe 😀"}');
  });
  await test("native D uses exact nine text arguments, rejects provenance and unknown receipts", async () => {
    const Native = require("../lib/helmut/synthetik-500-native-d-store"), R = require("../lib/helmut/synthetik-500-review-receipt");
    const f = fixture("D"), owner = f.intent.owner, output = { paragraphs: ["fictional-only"] }, sources = [{ id: "fake" }];
    const usage = { id: "fake-usage", success: true }, entry = { id: "fake-draft", user_id: owner, slot: "lage-pruefentwurf",
      generated_at: START, payload: { runId: RUN, antwort: output, quellen: sources, profilHash: sha("fake-profile") } };
    const base = { version: R.COMPLETION_VERSION, planHash: f.command.slot.planHash, operationId: OP, runId: RUN,
      dIntentId: f.intent.id, dTicket: { id: "fake-D-ticket", day: DAY }, owner, contextHash: f.intent.inputVersionHash,
      providerResponseHash: sha("fake-provider-response"), providerTextHash: sha("fake-provider-text"), outputHash: sha(output),
      sourceContext: { profileHash: entry.payload.profilHash, sourcesHash: sha(sources) },
      usageReceipt: { id: usage.id, recordHash: sha(usage) }, costMicroUsd: 20, completedAtUTC: START };
    const completion = { ...base, completionHash: sha(base) }, auth = { [A.KEY]: f.command.slot, llmUsage: [usage],
      testKostenTage: { [DAY]: { calls: { "fake-D-ticket": { status: "abgerechnet", cost: 20 } } } }, [J.KEY]: {
        version: J.VERSION, activeOperationId: OP, operations: { [OP]: { operationId: OP, commandHash: sha("mock-native-command"),
          state: "running", stopRequested: false, index: 0, units: [{ subject: owner }], inFlight: { intentIds: [f.intent.id] },
          attempts: { [f.intent.id]: { status: "accounted", ticketId: "fake-D-ticket" } } } } } };
    const native = { version: R.STORAGE_VERSION, contractHash: sha("fake-native-contract"), abiHash: C.ABI_HASH };
    const calls = [], io = { auth: async () => auth, command: async () => ({ command: { mode: "D-R-500", native, slot: f.command.slot } }),
      rpc: async (name, args) => { calls.push({ name, args }); return name === C.NATIVE_ABI.store.name
        ? { id: entry.id, versionHash: sha(entry), contractHash: native.contractHash }
        : name === C.NATIVE_ABI.read.name ? clone(entry) : { version: R.STORAGE_VERSION, contractHash: native.contractHash }; } };
    const realAdmission = C.admission; C.admission = () => "mock-only-not-actual";
    try {
      assert.deepEqual(await Native.contract(io), { version: R.STORAGE_VERSION, contractHash: native.contractHash });
      await Native.store(io, entry, completion, native.contractHash);
      const storeCall = calls[1]; assert.equal(storeCall.name, C.NATIVE_ABI.store.name);
      assert.deepEqual(Object.keys(storeCall.args).sort(), [...C.NATIVE_ABI.store.args].sort());
      assert(Object.values(storeCall.args).every(x => typeof x === "string"));
      assert.equal(sha(JSON.parse(storeCall.args.p_completion_preimage)), completion.completionHash);
      assert.deepEqual(await Native.read(io, owner, entry.id, sha(entry), native.contractHash), entry);
      const before = calls.length; const bad = clone(entry); bad.payload.antwort = { forged: true };
      await assert.rejects(Native.store(io, bad, completion, native.contractHash), /provenance/);
      assert.equal(calls.length, before);
      await assert.rejects(Native.store({ ...io, rpc: async () => null }, entry, completion, native.contractHash), /store-unknown/);
      await assert.rejects(Native.read(io, "foreign", entry.id, sha(entry), native.contractHash), /read-owner/);
    } finally { C.admission = realAdmission; }
  });
  await test("bounded DR steps preserve one claim, stop races and finish exactly500 owners/1500 positions", async () => {
    // Mock the already-admitted Root/native boundary, not the real admission
    // validator tested above. No fixture is written or accepted as actual W.
    const paths = ["storage", "lage", "briefing-lagebindung", "briefing-speicher"].map(n => require.resolve("../lib/helmut/" + n));
    const oldCache = paths.map(p => require.cache[p]), oldAdmission = C.admission, oldActive = K.aktiv, oldStart = K.pruefeStart;
    const time = new Date(), start = new Date(time.getTime() - 1000).toISOString(), end = new Date(time.getTime() + 3600000).toISOString();
    const owners = P.erzeuge().profile.map(p => p.mandatsId).sort();
    const drafts = owners.map(id => ({ profile: { id }, intentId: sha([id, "D"]), briefingDatum: start,
      briefingEingabe: { briefing: { available: true } }, sources: { documents: [], knowledgeObjects: [] } }));
    const units = owners.map(id => ({ kind: "DR", subject: id, intentIds: [sha([id, "D"]), sha([id, "R"])] }));
    const slot = { planHash: sha("fictional-full-plan"), consumed: {}, plan: { operationId: OP, runId: RUN,
      productionCommit: process.env.HELMUT_PRODUCTION_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA,
      startsAtUTC: start, endsAtUTC: end, routeContract: {}, intents: units.flatMap(u => [
        { id: u.intentIds[0], inputVersionHash: sha(u.subject) }, { id: u.intentIds[1], maxOutputTokens: 3000 }]) } };
    const command = { mode: "D-R-500", slot, units, drafts, predecessors: [] };
    let auth = { testKostenAuftrag: { version: 3, id: "fake-order", abTag: time.toISOString().slice(0, 10), limit: 7000000, externGebunden: 0 } };
    const admission = { booksHash: C.booksHash(auth) }, packet = { command, admission };
    J.install(auth, command, sha(command), C.controlHash(auth));
    let lageCalls = 0, materializations = 0, retained = 0, rejectEvidence = false, holdGenerate = null;
    let mutations = Promise.resolve();
    const cas = fn => {
      const work = mutations.then(async () => { const next = clone(auth), result = await fn(next);
        const current = J.current(next);
        if (current?.index === 500) assert.equal(current.state, "closed", "final finish+close must be one CAS");
        auth = next; return result; });
      mutations = work.catch(() => {}); return work;
    };
    const row = (owner, area, payload = {}) => ({ id: `fake-${owner}-${area}`, user_id: owner, slot: area,
      generated_at: new Date().toISOString(), payload });
    const fakeStorage = { synthetik500ProductionBackend() {}, loadSynthetik500ProductionCommand: async () => packet,
      leseLlmTageszaehler: async () => ({ ok: true, used: 0 }), readAuthStore: async () => clone(auth),
      mutateAuthStore: cas,
      readSynthetik500CurrentInputs: async x => x, getProfileFromDb: async id => ({ id }),
      synthetik500ReviewStorageContract: async () => ({}),
      getRenderedBriefingV3: async (owner, area) => row(owner, area), retainSynthetik500ProductionEvidence: async () => { retained++; if (rejectEvidence) throw Error("fake-unknown-insert"); } };
    const fakeLage = { buildLageBriefing: async (...args) => {
      assert.equal(args.length, 2); const [profile, opts] = args; lageCalls++;
      if (holdGenerate) await holdGenerate;
      assert.equal(opts.missingOnly, true); assert.equal(opts.costRunId, RUN);
      await opts.beforeGenerate(); const c = J.current(auth), unit = c.units[c.index], day = time.toISOString().slice(0, 10);
      for (const [i, id] of unit.intentIds.entries()) {
        if (i === 1) await opts.beforeGenerate();
        J.reservation(auth, id, new Date().toISOString());
        const ticketId = "fake-" + id;
        c.attempts[id] = { ticketId, day, status: "accounted" };
        auth[A.KEY].consumed[id] = { ticketId, day };
        auth.testKostenTage ||= {}; auth.testKostenTage[day] ||= { calls: {} };
        auth.testKostenTage[day].calls[ticketId] = { status: "abgerechnet", admission: { intentId: id, planHash: slot.planHash } };
      }
      await opts.beforeSave(); assert.equal(profile.id, unit.subject); return { available: true, fake: true };
    } };
    const realControl = K.kontrolliere, realDay = K.pruefeTag, realOrder = K.auftragsStand;
    K.kontrolliere = () => ({}); K.pruefeTag = () => ({ limit: 6000000 }); K.auftragsStand = () => ({ limitMicroUsd: 7000000 });
    const fakeB = { materialisiere: async opts => { assert(opts.briefing); assert.equal(opts.build, undefined); materializations++; },
      lese: async ({ userId }) => row(userId, "mandatsbriefing", { pruefung: { strukturellVollstaendig: false } }) };
    try {
      C.admission = () => "mock-only-not-actual"; K.aktiv = () => true; K.pruefeStart = () => ({});
      const modules = [fakeStorage, fakeLage, { pruefe: () => ({ eingabeHash: sha("fake-binding") }) }, fakeB];
      paths.forEach((p, i) => { require.cache[p] = { id: p, filename: p, loaded: true, exports: modules[i] }; });
      const selector = { operationId: OP, commandHash: sha(command) };
      const result = await Adapter.productionStart(selector);
      assert.equal(result.state, "running"); assert.equal(result.dispatchedUnits, 1); assert.equal(result.completedUnits, 1);
      assert.equal(lageCalls, 1); assert.equal(materializations, 1); assert.equal(retained, 1);
      const permanentClaim = J.current(auth).claimId, afterFirst = clone(auth);
      const rejectUnchanged = async (edit, pattern) => {
        auth = clone(afterFirst); edit(auth); const before = clone(auth), calls = lageCalls;
        await assert.rejects(Adapter.productionNext(selector), pattern);
        assert.deepEqual(auth, before, "rejection may not change journal or stop a winner"); assert.equal(lageCalls, calls);
      };
      await rejectUnchanged(a => { J.current(a).inFlight = { index: 1, intentIds: units[1].intentIds }; }, /next-unit-not-proven/);
      await rejectUnchanged(a => { J.current(a).units[1].entered = true; }, /next-unit-not-proven/);
      await rejectUnchanged(a => { J.current(a).attempts[units[0].intentIds[0]].status = "unknown"; }, /next-unit-not-proven/);
      await rejectUnchanged(a => { J.current(a).state = "stopped"; }, /claim-or-window/);
      await rejectUnchanged(a => { delete J.current(a).outputs[0]; }, /next-unit-not-proven/);
      await rejectUnchanged(a => { J.current(a).index = 0; }, /next-unit-not-proven/);
      auth = clone(afterFirst);
      await assert.rejects(Adapter.productionStart(selector), /claim-books-cas|already-claimed/);
      await assert.rejects(Adapter.productionNext({ ...selector, index: 1 }), /closed-selector-only/);
      const keptMode = command.mode; command.mode = "U-prestage";
      await assert.rejects(Adapter.productionNext(selector), /next-only-installed-500-dr/); command.mode = keptMode;
      const savedStartCheck = K.pruefeStart, savedAdmission = C.admission;
      K.pruefeStart = () => { throw Error("fake-budget-denial"); };
      await assert.rejects(Adapter.productionNext(selector), /fake-budget-denial/); K.pruefeStart = savedStartCheck;
      K.aktiv = () => false; await assert.rejects(Adapter.productionNext(selector), /inactive-or-deployment-drift/); K.aktiv = () => true;
      C.admission = () => { throw Error("fake-expired-window"); };
      await assert.rejects(Adapter.productionNext(selector), /fake-expired-window/); C.admission = savedAdmission;
      assert.deepEqual(auth, afterFirst); assert.equal(lageCalls, 1);
      // Same observed index races through a serial fake CAS. Hold the winner
      // inside its unit; a loser cannot stop it or take a later unit on retry.
      let release; holdGenerate = new Promise(resolve => { release = resolve; });
      const winner = Adapter.productionNext(selector);
      const raceDeadline = Date.now() + 5000;
      while (lageCalls < 2) { assert(Date.now() < raceDeadline, "winner must enter the held unit");
        await new Promise(resolve => setImmediate(resolve)); }
      await assert.rejects(Adapter.productionNext(selector), /next-unit-not-proven/);
      assert.equal(J.current(auth).state, "running"); assert.equal(J.current(auth).stopRequested, false);
      release(); await winner; holdGenerate = null;
      assert.equal(J.current(auth).index, 2); assert.equal(J.current(auth).claimId, permanentClaim);
      // Unknown evidence INSERT blocks the entered unit forever, with no retry.
      const afterSecond = clone(auth); rejectEvidence = true;
      await assert.rejects(Adapter.productionNext(selector), /stopped-or-unknown/);
      assert.equal(J.current(auth).state, "unknown"); const callsAfterUnknown = lageCalls;
      await assert.rejects(Adapter.productionNext(selector), /claim-or-window/);
      assert.equal(lageCalls, callsAfterUnknown); assert.equal(J.current(auth).claimId, permanentClaim);
      // Resume the separate fictional successful scenario from its saved fixture.
      // This is local test isolation, never an allowed Production restoration.
      auth = clone(afterSecond); rejectEvidence = false; lageCalls = materializations = retained = 2;
      for (let index = 2; index < 500; index++) {
        const next = await Adapter.productionNext(selector);
        assert.equal(next.dispatchedUnits, 1); assert.equal(next.completedUnits, index + 1);
        assert.equal(next.state, index === 499 ? "closed" : "running");
        assert.equal(J.current(auth).claimId, permanentClaim); assert.equal(lageCalls, index + 1);
      }
      assert.equal(lageCalls, 500); assert.equal(materializations, 500); assert.equal(retained, 500);
      assert.equal(Object.keys(J.current(auth).attempts).length, 1000);
      const report = await Adapter.status(selector);
      assert.equal(report.positions.length, 1500); assert.equal(report.fachabnahme, false);
      await assert.rejects(Adapter.productionStart(selector), /claim-books-cas|already-claimed/);
      await assert.rejects(Adapter.productionNext(selector), /claim-or-window/);
      assert.equal(lageCalls, 500);
    } finally {
      paths.forEach((p, i) => { if (oldCache[i]) require.cache[p] = oldCache[i]; else delete require.cache[p]; });
      C.admission = oldAdmission; K.aktiv = oldActive; K.pruefeStart = oldStart; K.kontrolliere = realControl;
      K.pruefeTag = realDay; K.auftragsStand = realOrder;
    }
  });
  console.log(JSON.stringify({ newChecks: passed, production: false, native: false, modelCalls: 0 }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
