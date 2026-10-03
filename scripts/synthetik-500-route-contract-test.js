"use strict";

// New route opt-in only. Synthetic books, fake clock and mocked HTTPS; no ARM,
// provider, DB, environment mutation outside this isolated offline process.
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const P = require("../lib/helmut/synthetik-500-profile");
const A = require("../lib/helmut/synthetik-500-kosten-admission");
const B = require("../lib/helmut/testkosten-budget");
const C = require("../lib/helmut/synthetik-500-kosten-plan");
const E = require("../lib/helmut/synthetik-500-executor");
const KO = require("../lib/helmut/knowledge-object-version");
const START = "2030-01-02T12:00:00.000Z", END = "2030-01-02T13:00:00.000Z", DAY = START.slice(0, 10);
const COMMIT = "c".repeat(40), RUN = "nachlauf500-1893585600000", OP = "synthetik500-route-offline-only-20300102";
const OWNER = "test-kohorte-synthetik-bt-001", INPUT = P.hash("synthetic-context-only");
const PROMPT = "Fiktiver Text mit Größe, 😀 und \\\"Zitat\\\".", SCHEMA = { type: "object" };
const payload = (input = PROMPT) => ({ model: "gpt-5-mini", input, max_output_tokens: 3000,
  reasoning: { effort: "minimal" }, text: { format: { type: "json_schema", name: "knowledge_object", schema: SCHEMA, strict: false } } });
const BODY = JSON.stringify(payload()), HASH = A.requestHash(BODY);
const ENV = { VERCEL_ENV: "production", HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt",
  AZURE_OPENAI_KEY: "fictional-original-key", AZURE_OPENAI_ENDPOINT: "https://helmut-resource.openai.azure.com",
  AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini", VERCEL_GIT_COMMIT_SHA: COMMIT,
  VERCEL_URL: "helmut-fictional-immutable.vercel.app", VERCEL_DEPLOYMENT_ID: "dpl_FictionalImmutable" };
const clone = structuredClone;
function contract() {
  const evidencePins = Object.fromEntries(["rootAdmission", "management", "serviceContext", "price"]
    .map(name => [name, { name: "fictional-" + name, sha256: P.hash("fixture-only-" + name), bytes: 10 }]));
  return { version: A.ROUTE_CONTRACT_VERSION, runtimeManifestHash: "f".repeat(64),
    route: { provider: "azure", responsesUrl: ENV.AZURE_OPENAI_ENDPOINT + "/openai/v1/responses", model: "gpt-5-mini",
      productionCommit: COMMIT, deploymentHost: ENV.VERCEL_URL, deploymentId: ENV.VERCEL_DEPLOYMENT_ID, authMode: "api-key" },
    management: { modelFamily: "gpt-5-mini", versionPolicy: "family-context-price-class-re-admit-on-contradiction",
      contextTokens: 400000, maxInputTokens: 272000, inputReserveTokens: 400000, maxOutputTokens: 128000,
      reasoningIncludedInOutput: true, inputUsdPerMillion: 0.5, outputUsdPerMillion: 4,
      validFromUTC: START, validUntilUTC: END, evidencePins } };
}
function fixture() {
  const descriptor = { phase: "D", owner: OWNER, inputVersionHash: INPUT, actualRequestHash: HASH,
    model: "gpt-5-mini", maxOutputTokens: 3000, attemptLimit: 1 };
  const plan = { version: A.ROUTE_PLAN_VERSION, operationId: OP, runId: RUN, productionCommit: COMMIT,
    runtimeManifestHash: "f".repeat(64), startsAtUTC: START, endsAtUTC: END,
    intents: [{ id: A.intentHash(RUN, descriptor), ...descriptor }],
    sourceBinding: { inputVersion: A.ROUTE_INPUT_VERSION, inputHash: P.hash("fixture-not-actual-W"),
      projectionVersion: KO.VERSION, projectionFieldsetHash: KO.FIELDSET_HASH }, routeContract: contract() };
  const slot = { version: A.ROUTE_VERSION, plan, planHash: P.hash(plan), consumed: {},
    draftCompletions: {}, reviewBindings: {}, reviewBindingsHash: P.hash({}) };
  let state = { llmUsage: [], [A.KEY]: slot,
    [B.AUFTRAG_KEY]: { version: 3, id: "fixture-order", abTag: DAY, limit: 7000000, externGebunden: 0 } };
  const h = { read: () => clone(state), modify: fn => fn(state) };
  h.storage = { readAuthStore: async () => h.read(), leseLlmTageszaehler: async () => ({ ok: true, used: 0 }),
    mutateAuthStore: async fn => { const working = h.read(), result = await fn(working); state = working; return result; } };
  h.args = { model: "gpt-5-mini", maxOutputTokens: 3000, runId: RUN, politicianId: OWNER, phase: "entwurf",
    admission: { operationId: OP, planHash: slot.planHash, routeContractHash: P.hash(plan.routeContract) },
    inputVersionHash: INPUT, actualRequestHash: HASH, runtimeRouteSnapshot: clone(plan.routeContract.route) };
  h.meta = { callType: "route-contract-offline", runId: RUN, politicianId: OWNER, testKostenPhase: "entwurf",
    costAdmission: h.args.admission, costInputVersionHash: INPUT };
  h.deps = { storage: h.storage, env: ENV, now: () => new Date(START), id: () => "fictional-ticket" };
  return h;
}
async function withSender(h, afterReserve, check, response = "ok") {
  const https = require("node:https"), storage = require("../lib/helmut/storage"), ai = require("../lib/helmut/ai");
  const provider = require("../lib/helmut/anbieter-steuerung"), RealDate = global.Date;
  const oldEnv = { ...process.env }, oldHttps = https.request, oldProvider = provider.steuerungAktiv;
  const names = ["mutateAuthStore", "readAuthStore", "leseLlmTageszaehler", "reserveLlmCall", "recordLlmUsage"];
  const old = Object.fromEntries(names.map(k => [k, storage[k]])), sent = [];
  try {
    global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [START])); } static now() { return RealDate.parse(START); } };
    for (const k of ["HELMUT_PRODUCTION_COMMIT", "OPENAI_API_KEY", "HELMUT_KI_LOOPBACK_ERLAUBT"]) delete process.env[k];
    Object.assign(process.env, ENV);
    for (const k of ["mutateAuthStore", "readAuthStore", "leseLlmTageszaehler"]) storage[k] = h.storage[k];
    storage.reserveLlmCall = async () => { await afterReserve(); return { allowed: true }; };
    storage.recordLlmUsage = async () => ({ id: "fictional-usage", model: "gpt-5-mini",
      ...(response === "error" ? {} : { promptTokens: 100, completionTokens: 20 }), _ablage: { blob: true } });
    provider.steuerungAktiv = () => false;
    https.request = (url, opts, cb) => {
      const info = { url, auth: opts.headers["api-key"], body: null }; sent.push(info);
      const req = new EventEmitter(); req.destroy = () => {}; req.write = body => { info.body = body; };
      req.end = () => setImmediate(() => {
        if (response === "error") { const error = Error("mock-timeout"); error.code = "ETIMEDOUT"; req.emit("error", error); return; }
        const res = new EventEmitter(); res.statusCode = 200; res.setEncoding = () => {}; res.destroy = () => {};
        cb(res); res.emit("data", JSON.stringify({ status: "completed", usage: { input_tokens: 100, output_tokens: 20 },
          output: [{ content: [{ type: "output_text", text: '{"ok":true}' }] }] })); res.emit("end");
      }); return req;
    };
    await check(() => ai.requestStructuredJson(PROMPT, SCHEMA, h.meta, "gpt-5-mini"), sent);
  } finally {
    global.Date = RealDate; https.request = oldHttps; provider.steuerungAktiv = oldProvider;
    for (const k of names) storage[k] = old[k];
    for (const k of Object.keys(process.env)) if (!(k in oldEnv)) delete process.env[k];
    Object.assign(process.env, oldEnv);
  }
}
let passed = 0;
const reasoningOnly = process.argv.includes("--reasoning-guard-only");
async function test(name, fn) {
  if (reasoningOnly && name !== "present reasoning must be exact approved effort, including falsy inputs") return;
  await fn(); passed++; console.log("PASS " + name);
}
async function drift(change) {
  const h = fixture();
  await withSender(h, change, async (send, sent) => {
    await assert.rejects(send(), e => e.kiNichtGesendet === true); assert.equal(sent.length, 0);
    const state = h.read(); assert.equal(Object.keys(state[A.KEY].consumed).length, 1);
    assert.equal(Object.values(state[B.KEY][DAY].calls)[0].status, "nicht-gesendet");
    assert.equal(Object.values(state[B.KEY][DAY].calls)[0].reserved, 212000);
    // A removed Azure key is stopped by the existing model gate before the
    // consumed-intent gate; both retain the same consumed ticket and send zero.
    await assert.rejects(send(), /intent-consumed|reservation-route-drift|route-snapshot|test-usd-modell-nicht-freigegeben/);
    assert.equal(sent.length, 0); assert.equal(Object.keys(h.read()[A.KEY].consumed).length, 1);
  });
}
async function main() {
  await test("new contract follows exact one mocked URL/body/auth and atomic ticket", async () => {
    const h = fixture(); await withSender(h, async () => {}, async (send, sent) => {
      assert.deepEqual(await send(), { ok: true }); assert.equal(sent.length, 1);
      assert.equal(sent[0].url, contract().route.responsesUrl); assert.equal(sent[0].body, BODY);
      assert.equal(sent[0].auth, ENV.AZURE_OPENAI_KEY);
      const s = h.read(), a = Object.values(s[B.KEY][DAY].calls)[0].admission;
      assert.equal(a.version, A.ROUTE_VERSION); assert.equal(a.routeContractHash, P.hash(contract()));
      assert.deepEqual(a.runtimeRouteSnapshot, contract().route);
      assert.equal(s[A.KEY].consumed[s[A.KEY].plan.intents[0].id].routeContractHash, a.routeContractHash);
      assert(!JSON.stringify(s).includes(ENV.AZURE_OPENAI_KEY));
    });
  });
  await test("endpoint drift after awaited gate blocks HTTPS", () => drift(async () => { process.env.AZURE_OPENAI_ENDPOINT = "https://changed.openai.azure.com"; }));
  await test("provider fallback drift blocks HTTPS", () => drift(async () => { delete process.env.AZURE_OPENAI_KEY; delete process.env.AZURE_OPENAI_ENDPOINT; process.env.OPENAI_API_KEY = "fictional-other"; }));
  await test("same commit different immutable host blocks HTTPS", () => drift(async () => { process.env.VERCEL_URL = "other-immutable.vercel.app"; }));
  await test("same commit different deployment id blocks HTTPS", () => drift(async () => { process.env.VERCEL_DEPLOYMENT_ID = "dpl_Other"; }));
  await test("missing actual Vercel commit blocks even with override", () => drift(async () => { delete process.env.VERCEL_GIT_COMMIT_SHA; process.env.HELMUT_PRODUCTION_COMMIT = COMMIT; }));
  await test("missing immutable identity blocks HTTPS", () => drift(async () => { delete process.env.VERCEL_DEPLOYMENT_ID; }));
  await test("auth uses private reservation snapshot after gate", async () => {
    const h = fixture(); await withSender(h, async () => { process.env.AZURE_OPENAI_KEY = "fictional-rotated-key"; }, async (send, sent) => {
      await send(); assert.equal(sent[0].auth, ENV.AZURE_OPENAI_KEY); assert(!JSON.stringify(h.read()).includes("fictional-rotated-key"));
    });
  });
  await test("new version missing route hash never silently legacy", async () => {
    const h = fixture(); delete h.args.admission.routeContractHash;
    await assert.rejects(B.reserviere(h.args, h.deps), /foreign-run-or-plan/);
    assert.equal(Object.keys(h.read()[A.KEY].consumed).length, 0);
    const k = fixture(), t = await B.reserviere(k.args, k.deps); delete t.admission.routeContractHash;
    assert.throws(() => A.pruefeSendung(t, HASH, START, COMMIT, null, contract().route), /sender-route-drift/);
  });
  await test("contract pin, runtime manifest and finite window drift rejected", () => {
    for (const change of [p => { p.routeContract.management.evidencePins.management.sha256 = "wrong"; },
      p => { p.routeContract.runtimeManifestHash = "a".repeat(64); },
      p => { p.routeContract.management.validUntilUTC = START; }, p => { delete p.routeContract; }]) {
      const s = fixture().read()[A.KEY]; change(s.plan); s.planHash = P.hash(s.plan);
      assert.throws(() => A.pruefeSlot(s), /route|plan-bindung/);
    }
  });
  await test("new text feature set rejects images/tools, unsupported model/output", () => {
    for (const mutate of [p => { p.input = [{ type: "input_image", image_url: "https://example.org" }]; },
      p => { p.tools = []; }, p => { p.model = "other"; }, p => { p.max_output_tokens = 8001; }]) {
      const p = payload(); mutate(p); assert.throws(() => A.pruefeRoutePayload(p), /route-text-features/);
    }
  });
  await test("present reasoning must be exact approved effort, including falsy inputs", () => {
    for (const reasoning of [false, 0, "", null, [], {}, { effort: "high" }, { effort: "low", extra: true }]) {
      const p = payload(); p.reasoning = reasoning;
      assert.throws(() => A.pruefeRoutePayload(p), /route-reasoning-features/);
    }
    for (const effort of ["minimal", "low", "medium"]) {
      const p = payload(); p.reasoning = { effort }; assert.doesNotThrow(() => A.pruefeRoutePayload(p));
    }
    const p = payload(); delete p.reasoning; assert.doesNotThrow(() => A.pruefeRoutePayload(p));
  });
  await test("every final input/schema/output/model content bound, including Unicode", async () => {
    const h = fixture(), t = await B.reserviere(h.args, h.deps);
    for (const mutate of [p => { p.input += " Änderung😀"; }, p => { p.instructions = "new"; },
      p => { p.text.format.schema = { type: "string" }; }, p => { p.max_output_tokens = 6000; }, p => { p.model = "other"; }]) {
      const p = payload(); mutate(p);
      assert.throws(() => A.pruefeSendung(t, A.requestHash(JSON.stringify(p)), START, COMMIT, null, contract().route), /sender-input-drift/);
    }
  });
  await test("unknown provider outcome retains complete reserve", async () => {
    const h = fixture(); await withSender(h, async () => {}, async (send, sent) => {
      await assert.rejects(send(), e => e.code === "TEST_USD_UNKNOWN" || /request-error|timeout|AI request/.test(e.message));
      assert.equal(sent.length, 1);
      const c = Object.values(h.read()[B.KEY][DAY].calls)[0];
      assert.equal(c.status, "ungeklaert"); assert.equal(c.reserved, 212000); assert.equal(c.cost, undefined);
    }, "error");
  });
  await test("legacy slot readable and no opt-in upgrade or reserve/rate increase", () => {
    const s = fixture().read()[A.KEY]; s.version = A.REVIEW_VERSION; s.plan.version = A.MULTI_U_PLAN_VERSION;
    s.plan.sourceBinding.inputVersion = C.ARTICLE_INPUT_VERSION; delete s.plan.routeContract; s.planHash = P.hash(s.plan);
    assert.doesNotThrow(() => A.pruefeSlot(s)); assert.equal(B.reservierungHoeheUsd(3000), 0.212);
    assert.equal(B.reservierungHoeheUsd(8000), 0.232); assert.equal(B.LIMIT_MICRO_USD, 6000000);
    assert.equal(E.offeneEingaben(E.ROUTE_INPUT_VERSION).kostenPlan, null);
    assert.throws(() => E.productionStart(), /nicht-implementiert/);
  });
  await test("new costplan explicit NULL contract stays inert; legacy rejects added contract", () => {
    const input = { version: C.ROUTE_INPUT_VERSION, operationId: OP, runId: RUN,
      window: { startUTC: START, endUTC: END }, productionCommit: COMMIT, runtimeManifestHash: "f".repeat(64),
      documents: null, knowledgeObjects: null, clusters: null, understandingInputs: null, understandingCompleteness: null,
      draftInputs: null, reviewMaxOutputTokens: 3000, paidRoutes: null, otherPaidInputs: null, routeContract: null };
    const plan = C.vorbereite(P.erzeuge(), input); assert.equal(plan.version, C.ROUTE_VERSION);
    assert.equal(plan.admissionCandidate, null); assert(plan.requiredActualInputs.includes("root-admitted-finite-route-context-price-contract"));
    assert.equal(plan.status.executionReady, false); assert.equal(plan.money.dailyLimitMicroUsd, 6000000);
    input.version = C.ARTICLE_INPUT_VERSION; assert.throws(() => C.vorbereite(P.erzeuge(), input), /eingaben-format/);
  });
  await test("new full offline costplan binds contract and multi-U source projection through candidate", () => {
    const paket = P.erzeuge(), documents = ["BT", "BE", "BB"].map(scope => ({ scope,
      id: "fictional-" + scope, version: { id: "fictional-" + scope, fictional: true } }));
    const docs = C.sourceVersions(documents, [], null).documents.map(d => d.key);
    const clusters = [{ vorgangId: "fictional-process", mode: "erst", koVersion: null,
      documentKeys: docs, requiresUnderstanding: true, coverage: null, artikelkontextVersuch: null }];
    const source = C.sourceVersions(documents, [], clusters, C.ROUTE_INPUT_VERSION);
    const e = { version: C.ROUTE_INPUT_VERSION, operationId: OP, runId: RUN,
      window: { startUTC: START, endUTC: END }, productionCommit: COMMIT, runtimeManifestHash: "f".repeat(64),
      documents, knowledgeObjects: [], clusters,
      understandingInputs: source.clusters.map(v => ({ versionKey: v.key, contractInputHash: v.contractInputHash,
        requestBody: JSON.stringify(payload("fictional source-only U")), routeId: null, attemptLimit: 1 })),
      understandingCompleteness: { version: C.PROOF_VERSION, documentInventoryHash: P.hash(source.documents),
        knowledgeObjectInventoryHash: P.hash(source.knowledgeObjects), clusterInventoryHash: P.hash(source.clusters),
        requiredVersionKeys: source.clusters.map(v => v.key), evidence: { reference: "fictional-offline-only", sha256: P.hash("not-real-W") } },
      draftInputs: paket.profile.map(p => ({ owner: p.mandatsId, profileHash: P.hash(p), context: { fictional: true },
        documentKeys: docs, knowledgeObjectKeys: [], requestBody: BODY, routeId: null, attemptLimit: 1 })),
      reviewMaxOutputTokens: 3000, paidRoutes: null, otherPaidInputs: [], routeContract: contract() };
    const plan = C.vorbereite(paket, e), slot = plan.admissionCandidate;
    assert.equal(slot.version, A.ROUTE_VERSION); assert.equal(slot.plan.version, A.ROUTE_PLAN_VERSION);
    assert.equal(slot.plan.sourceBinding.inputVersion, C.ROUTE_INPUT_VERSION);
    assert.deepEqual(slot.plan.routeContract, contract()); assert.equal(slot.plan.intents.length, 1001);
    assert.equal(slot.plan.intents.filter(x => x.phase === "R").length, 500);
    assert.equal(plan.status.executionReady, false); assert.equal(plan.status.paidGo, false);
    assert.doesNotThrow(() => C.pruefe(plan, paket));
    e.routeContract.management.evidencePins.management.sha256 = "b".repeat(64);
    assert.notEqual(C.vorbereite(paket, e).admissionCandidate.planHash, slot.planHash);
  });
  await test("valid-shaped route hash drift rejected and ledger contract cannot be relabeled", async () => {
    const h = fixture(); h.args.admission.routeContractHash = "a".repeat(64);
    await assert.rejects(B.reserviere(h.args, h.deps), /reservation-route-drift/);
    const k = fixture(); await B.reserviere(k.args, k.deps);
    k.modify(s => { Object.values(s[B.KEY][DAY].calls)[0].admission.runtimeRouteSnapshot.deploymentId = "dpl_Relabeled"; });
    await assert.rejects(B.reserviere(k.args, k.deps), /consumption-ledger-drift/);
  });
  console.log(passed + "/" + passed + " new offline route groups; no current ARM/window/Production proof.");
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
