"use strict";

// New FPA1/FPA2 regression only. Local fictional dependencies; never call the
// Native/backend/provider, change environment, or replay the old 15 checks.
const assert = require("node:assert/strict");
const noNet = () => { throw Error("new fix regression forbids network"); };
global.fetch = noNet; require("node:https").request = noNet; require("node:http").request = noNet;
const Storage = require("../lib/helmut/storage");
const L = require("../lib/helmut/briefing-lauf");
const U = require("../lib/helmut/understanding");
const V = require("../lib/helmut/verstehen-vertrag");
const Guard = require("../lib/helmut/synthetik-500-u-guard");
const copy = structuredClone, at = "2030-01-02T12:00:00.000Z", owner = "test-kohorte-synthetik-bt-001", day = "2030-01-02";
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
function morning() {
  const payload = L.quittung({ tenantId: owner, berlinTag: day, status: L.STATUS_ERFOLG,
    ausloeser: L.AUSLOESER_NACHLAUF, erzeugtAm: at, fensterStart: at, signatur: "a".repeat(32),
    ausgabeBeleg: { version: 1, mandat: owner, tag: day, paketId: `bf-${owner}-mandatsbriefing-${day}`,
      profilHash: "b".repeat(64), briefingHash: "c".repeat(64) } });
  return { id: L.laufId(owner, day), user_id: owner, slot: L.SLOT_ERFOLG, generated_at: at, payload };
}
function uFixture(existing = null) {
  const counters = { writers: 0, reserve: 0, start: 0, provider: 0, release: 0, failed: 0, memo: 0 };
  const doc = { id: "fictional-new-doc", title: "Haushalt Berlin", summary: "Fiktiver Haushaltsbeschluss", published_at: at };
  const oldDoc = { ...doc, id: "fictional-linked-doc", title: "Schulgesetz Brandenburg", summary: "Fiktiver Schulgesetzbeschluss" }, cluster = { documents: [doc] };
  const contract = { reserviere: async () => { counters.reserve++; return { erlaubt: true, fencing: 1 }; },
    modellstart: async () => { counters.start++; return { erlaubt: true }; },
    freigabeOhneAufruf: async () => { counters.release++; return { ok: true }; },
    freigabe: async () => { counters.release++; return { ok: true }; },
    ausgangUnbekannt: async () => { throw Error("unknown must not run for proved guard stop"); },
    vormerkungLese: async () => 0, vormerkungErhoehe: async () => { counters.memo++; }, vormerkungLoese: async () => { counters.memo++; } };
  const effect = async () => { counters.writers++; return { ok: true, saved: true }; };
  const deps = { getExisting: async () => existing, listVorgangDocuments: async () => [oldDoc],
    verstehenVertrag: () => contract, canSpend: async () => ({ allowed: true }), requestUnderstanding: async () => { counters.provider++; return { fake: true }; },
    saveSources: effect, save: effect, savePending: effect, writeUpdateRetries: effect,
    markFailed: async () => { counters.failed++; }, recordGateParkung: effect, markGateGeparkt: effect, releaseGateGeparkt: effect,
    gateMode: () => "off", logSkip() {}, modelName: () => "fake-only" };
  const options = { vorgangId: "fixture-vorgang", existing };
  const resolution = { vorgangId: options.vorgangId, existing, bestandsDokumente: existing ? [oldDoc] : [] };
  const pair = Guard.beforeEffectsPair(cluster, resolution, {}, deps);
  return { counters, deps, cluster, options, pair, resolution };
}
async function main() {
  await test("real dedicated morning writer inserts exact receipt and reads it back without upsert", async () => {
    const entry = morning(), calls = []; let stored = null;
    const result = await Storage.insertSynthetik500MorningReceipt(entry, { bereit: true,
      request: async (url, options) => { calls.push({ url, options }); if (options) { stored = JSON.parse(options.body); return [copy(stored)]; } return [copy(stored)]; } });
    assert.deepEqual(result, { saved: true, id: entry.id }); assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "/rest/v1/briefings?select=*"); assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.headers.Prefer, "return=representation"); assert(!calls[0].url.includes("on_conflict"));
    assert.deepEqual(stored, entry); assert(calls[1].url.includes("user_id=eq." + owner));
  });
  await test("morning slot/owner/day/payload forgery rejects before INSERT; unknown result never retries", async () => {
    let calls = 0; const deps = { bereit: true, request: async () => { calls++; return []; } };
    for (const mutate of [e => { e.slot = "lage"; }, e => { e.user_id = "foreign"; }, e => { e.payload.berlinTag = "2030-01-03"; },
      e => { e.payload.extra = "unbound"; }, e => { e.payload.ausgabeBeleg.briefingHash = "bad"; }]) {
      const entry = morning(); mutate(entry); await assert.rejects(Storage.insertSynthetik500MorningReceipt(entry, deps), /morning-receipt/);
    }
    assert.equal(calls, 0); await assert.rejects(Storage.insertSynthetik500MorningReceipt(morning(), deps), /insert-unknown/);
    assert.equal(calls, 1);
  });
  await test("morning native-like readback mismatch stops after exactly INSERT and GET", async () => {
    const entry = morning(); let calls = 0;
    await assert.rejects(Storage.insertSynthetik500MorningReceipt(entry, { bereit: true, request: async (_url, options) => {
      calls++; return [options ? copy(entry) : { ...entry, user_id: "foreign" }]; } }), /morning-readback/);
    assert.equal(calls, 2);
  });
  await test("closed adapter missing-morning branch reaches the real dedicated writer once", async () => {
    const P = require("../lib/helmut/synthetik-500-profile"), C = require("../lib/helmut/synthetik-500-production-command"),
      K = require("../lib/helmut/testkosten-budget"), A = require("../lib/helmut/synthetik-500-kosten-admission"),
      J = require("../lib/helmut/synthetik-500-dispatch-journal"), Adapter = require("../lib/helmut/synthetik-500-production-adapter");
    const names = ["storage", "lage", "briefing-lagebindung", "briefing-speicher", "briefing-ausgabebeleg"];
    const paths = names.map(n => require.resolve("../lib/helmut/" + n)), cache = paths.map(p => require.cache[p]);
    const originals = [C.admission, K.aktiv, K.pruefeStart, K.kontrolliere, K.pruefeTag, K.auftragsStand];
    const time = new Date(), start = new Date(time.getTime() - 1000).toISOString(), end = new Date(time.getTime() + 3600000).toISOString();
    const today = require("../lib/helmut/briefing-frische").berlinTagKey(time), op = "synthetik500-fpa1-fake-only", run = "fictional-fix-only";
    const ids = [P.hash("fictional-D"), P.hash("fictional-R")], input = { profile: { id: owner }, intentId: ids[0],
      briefingDatum: start, briefingEingabe: { briefing: { available: true } }, sources: { documents: [], knowledgeObjects: [] } };
    const slot = { planHash: P.hash("fictional-plan"), consumed: {}, plan: { operationId: op, runId: run,
      productionCommit: process.env.HELMUT_PRODUCTION_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA,
      startsAtUTC: start, endsAtUTC: end, routeContract: {}, intents: [{ id: ids[0], inputVersionHash: P.hash("fictional-input") }, { id: ids[1], maxOutputTokens: 3000 }] } };
    const command = { mode: "D-R-500", slot, units: [{ kind: "DR", subject: owner, intentIds: ids }], drafts: [input], predecessors: [] };
    let auth = {}, stored = null, insertCalls = 0, generatorCalls = 0, retained = 0;
    const admission = { booksHash: C.booksHash(auth) }; J.install(auth, command, P.hash(command), C.controlHash(auth));
    const row = area => ({ id: `bf-${owner}-${area}-${today}`, user_id: owner, slot: area, generated_at: new Date().toISOString(), payload: {} });
    const fakeStorage = { synthetik500ProductionBackend() {}, loadSynthetik500ProductionCommand: async () => ({ command, admission }),
      leseLlmTageszaehler: async () => ({ ok: true, used: 0 }), readAuthStore: async () => copy(auth),
      mutateAuthStore: async fn => { const next = copy(auth), result = await fn(next); auth = next; return result; },
      readSynthetik500CurrentInputs: async x => x, getProfileFromDb: async () => input.profile, synthetik500ReviewStorageContract: async () => ({}),
      getRenderedBriefingV3: async (_owner, area) => area === L.SLOT_ERFOLG ? stored : row(area),
      insertRenderedBriefingV3: async () => { throw Error("old slot-limited writer must not be used"); },
      insertSynthetik500MorningReceipt: async entry => Storage.insertSynthetik500MorningReceipt(entry, { bereit: true,
        request: async (_url, opts) => { if (opts) { insertCalls++; stored = JSON.parse(opts.body); } return [copy(stored)]; } }),
      retainSynthetik500ProductionEvidence: async () => { retained++; } };
    const fakeLage = { buildLageBriefing: async (_profile, opts) => {
      generatorCalls++; await opts.beforeGenerate();
      const c = J.current(auth), utcDay = time.toISOString().slice(0, 10);
      for (const id of ids) { c.attempts[id] = { status: "accounted", ticketId: id, day: utcDay };
        auth[A.KEY].consumed[id] = { ticketId: id, day: utcDay }; auth.testKostenTage ||= {};
        auth.testKostenTage[utcDay] ||= { calls: {} }; auth.testKostenTage[utcDay].calls[id] = { status: "abgerechnet", admission: { intentId: id, planHash: slot.planHash } }; }
      await opts.beforeSave(); return { available: true }; } };
    const fakePacket = { ...row("mandatsbriefing"), payload: { pruefung: { strukturellVollstaendig: true }, briefing: { available: true } } };
    try {
      C.admission = () => "fictional-boundary-only"; K.aktiv = () => true; K.pruefeStart = K.kontrolliere = () => ({});
      K.pruefeTag = () => ({ limit: 6000000 }); K.auftragsStand = () => ({ limitMicroUsd: 7000000 });
      const modules = [fakeStorage, fakeLage, { pruefe: () => ({ eingabeHash: P.hash("fictional-binding") }) },
        { materialisiere: async () => {}, lese: async () => fakePacket }, { ausPaket: () => ({ version: 1, mandat: owner, tag: today,
          paketId: fakePacket.id, profilHash: "b".repeat(64), briefingHash: "c".repeat(64) }) }];
      paths.forEach((p, i) => { require.cache[p] = { id: p, filename: p, loaded: true, exports: modules[i] }; });
      const result = await Adapter.productionStart({ operationId: op, commandHash: P.hash(command) });
      assert.equal(result.state, "closed"); assert.equal(insertCalls, 1); assert.equal(generatorCalls, 1); assert.equal(retained, 1);
      assert.equal(stored.slot, L.SLOT_ERFOLG); assert.equal(stored.id, L.laufId(owner, today));
      assert.equal(stored.payload.ausgabeBeleg.paketId, fakePacket.id);
      assert.equal(J.current(auth).outputs[0].positions.find(p => p.bereich === "morgenbriefing").status, "stored-unreviewed");
    } finally {
      paths.forEach((p, i) => { if (cache[i]) require.cache[p] = cache[i]; else delete require.cache[p]; });
      [C.admission, K.aktiv, K.pruefeStart, K.kontrolliere, K.pruefeTag, K.auftragsStand] = originals;
    }
  });
  await test("actual first and update pair use unchanged native hash before any early effect", async () => {
    for (const existing of [null, { id: "ko-fixture", status: "complete", ko_version: 3 }]) {
      const f = uFixture(existing);
      const expected = V.eingabeHash({ vorgangId: f.pair.vorgangId, dokumente: existing ? [...f.resolution.bestandsDokumente, ...f.cluster.documents] : f.cluster.documents,
        modus: existing ? "update" : "erst", koVersion: existing ? 4 : null });
      assert.equal(f.pair.contractInputHash, expected);
      Guard.attach(f.deps, actual => { assert.deepEqual(actual, f.pair); throw Error("planned-pair-differs"); }, async () => {});
      await assert.rejects(U.understandOneCluster(f.cluster, f.deps, f.options), e => e.code === Guard.CODE && e.kiNichtGesendet === true);
      assert.deepEqual(f.counters, { writers: 0, reserve: 0, start: 0, provider: 0, release: 0, failed: 0, memo: 0 });
    }
  });
  await test("expired early window and await drift reject every wrapped effect and native reservation", async () => {
    const f = uFixture(); let open = false;
    const control = async () => { if (!open) throw Error("expired"); };
    Guard.attach(f.deps, async actual => { assert.deepEqual(actual, f.pair); await control(); }, control);
    await assert.rejects(U.understandOneCluster(f.cluster, f.deps, f.options), e => e.code === Guard.CODE);
    for (const name of ["save", "saveSources", "savePending", "markFailed", "writeUpdateRetries", "recordGateParkung", "markGateGeparkt", "releaseGateGeparkt"])
      await assert.rejects(f.deps[name](), /u-mutation-guard/);
    await assert.rejects(f.deps.verstehenVertrag().reserviere({}), /u-mutation-guard/);
    assert.deepEqual(f.counters, { writers: 0, reserve: 0, start: 0, provider: 0, release: 0, failed: 0, memo: 0 });
    // The window changes during the real canSpend await, after reservation but
    // before modellstart: the model-start wrapper must refuse the effect.
    open = true; f.deps.canSpend = async () => { open = false; return { allowed: true }; };
    await assert.rejects(U.understandOneCluster(f.cluster, f.deps, f.options), /u-mutation-guard/);
    assert.equal(f.counters.reserve, 1); assert.equal(f.counters.start, 0); assert.equal(f.counters.provider, 0);
    assert.equal(f.counters.writers + f.counters.failed + f.counters.memo, 0);
  });
  await test("late proved first-request guard stop releases native lease without failure/link writers", async () => {
    const f = uFixture(); let checks = 0;
    Guard.attach(f.deps, actual => { assert.deepEqual(actual, f.pair); if (++checks === 3) throw Error("late-window-stop"); }, async () => {});
    const result = await U.understandOneCluster(f.cluster, f.deps, f.options);
    assert.equal(result.status, "skipped-production-admission"); assert.equal(checks, 3);
    assert.deepEqual(f.counters, { writers: 0, reserve: 1, start: 1, provider: 0, release: 1, failed: 0, memo: 0 });
  });
  await test("late proved update guard stop makes no failure or update memo", async () => {
    const f = uFixture({ id: "ko-fixture", status: "complete", ko_version: 3 }); let checks = 0;
    Guard.attach(f.deps, actual => { assert.deepEqual(actual, f.pair); if (++checks === 3) throw Error("late-window-stop"); }, async () => {});
    const result = await U.understandOneCluster(f.cluster, f.deps, f.options);
    assert.equal(result.status, "skipped-production-admission"); assert.equal(result.modus, "update");
    assert.deepEqual(f.counters, { writers: 1, reserve: 1, start: 1, provider: 0, release: 1, failed: 0, memo: 0 });
  });
  await test("matching finite request delegates exact prompt and pair; ordinary dependencies stay unhooked", async () => {
    const f = uFixture(), ordinary = uFixture(); let checks = 0;
    Guard.attach(f.deps, actual => { assert.deepEqual(actual, f.pair); checks++; }, async () => {});
    assert.deepEqual(await f.deps.requestUnderstanding("fictional prompt", f.pair), { fake: true });
    assert.equal(checks, 1); assert.equal(f.counters.provider, 1);
    assert.equal(Object.hasOwn(ordinary.deps, "beforeUnderstandingMutation"), false);
    assert.equal(Object.hasOwn(ordinary.deps, "beforeUnderstandingReservation"), false);
  });
  await test("only pre-provider pair/sender failures carry proof; post-provider writer guard does not", async () => {
    const f = uFixture(); let writes = 0;
    f.deps.verstehenVertrag = () => ({ speichere: async () => { writes++; }, freigabeOhneAufruf: async () => ({ ok: true }) });
    Guard.attach(f.deps, async () => {}, async () => { throw Error("expired-after-provider"); });
    await assert.rejects(f.deps.verstehenVertrag().speichere({}), e => e.message === "synthetik500-production-u-mutation-guard" && e.kiNichtGesendet !== true);
    assert.equal(writes, 0); assert.deepEqual(await f.deps.verstehenVertrag().freigabeOhneAufruf({}), { ok: true });
    await assert.rejects(Guard.provedPreSend(async () => { throw Error("late-sender-window"); }), e => e.code === Guard.CODE && e.kiNichtGesendet === true);
    const Adapter = require("../lib/helmut/synthetik-500-production-adapter");
    await assert.rejects(Adapter.beforeSend({ execution: null }), e => e.code === Guard.CODE && e.kiNichtGesendet === true);
  });
  console.log(JSON.stringify({ newFixChecks: passed, production: false, native: false, modelCalls: 0 }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
