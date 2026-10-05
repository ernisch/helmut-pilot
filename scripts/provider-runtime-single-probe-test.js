"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const P = require("../lib/helmut/provider-runtime-single-probe");
const K = require("../lib/helmut/testkosten-budget");

function fixture() {
  let clock = new Date("2026-10-05T03:00:00.000Z"), writes = 0, calls = [];
  const secret = "synthetic-test-only-never-valid-for-production";
  const pin = { operationNonce: "6f98b9bb-8895-4681-9780-fe42bdd524a1", runId: "nachlauf500-20261005024845",
    expiresAtUTC: "2026-10-05T04:00:00.000Z", bearerSha256: crypto.createHash("sha256").update(secret).digest("hex") };
  const env = { VERCEL_ENV: "production", HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt",
    VERCEL_GIT_COMMIT_SHA: "a".repeat(40), VERCEL_URL: "fixture-immutable.vercel.app" };
  const auth = { testKostenAuftrag: { version: 3, limit: 7000000 }, llmUsage: [], historic: { kept: true } };
  const configuration = { resolved: { sendEnabled: true, intendedProvider: "azure", providerForSend: "azure",
    responsesURL: "https://helmut-resource.openai.azure.com/openai/v1/responses", activeModel: { value: "gpt-5-mini" },
    understandingModel: { value: "gpt-5-mini" }, loopbackExactOne: false },
    secretNamePresence: { AZURE_OPENAI_KEY: true }, conservativeTextReservationPolicy: K.konfiguration(env) };
  const deps = { env, operationAuth: pin, now: () => clock, readRuntimeConfiguration: () => configuration,
    kosten: { ...K, pruefeStart: () => ({ startklar: true }), laufGebundenUsd: async () => K.tokenKosten(5, 2) / 1e6 },
    storage: { getStorageStatus: () => ({ backend: "supabase", supabaseConfigured: true }), readAuthStore: async () => auth, leseLlmTageszaehler: async () => ({ ok: true, used: 0 }),
      mutateAuthStore: async fn => { writes++; return fn(auth); } },
    requestText: async (...args) => { calls.push(args); assert.ok(auth[P.KEY][pin.operationNonce]);
      auth.llmUsage.push({ id: "receipt-one", runId: pin.runId, callType: "pre500-provider-probe", model: "gpt-5-mini",
        promptTokens: 5, completionTokens: 2, totalTokens: 7, success: true, durationMs: 1,
        estimatedCost: 0.000005, createdAt: clock.toISOString() }); return "OK"; } };
  const request = { method: "POST", headers: { authorization: "Bearer " + secret, "content-length": "0",
    "x-helmut-root-nonce": pin.operationNonce, "x-helmut-root-admitted-at": "2026-10-05T02:59:50.000Z",
    "x-helmut-root-deadline-at": "2026-10-05T03:19:50.000Z", "x-helmut-production-commit": env.VERCEL_GIT_COMMIT_SHA,
    "x-helmut-deployment-host": env.VERCEL_URL } };
  async function invoke() {
    const response = { writeHead(status, headers) { this.status = status; this.headers = headers; },
      end(text) { this.body = JSON.parse(text); } };
    await P.handleRequest(request, response, new URL("https://public-alias.vercel.app/api/cron/testnachweis-status?modus=" + P.MODUS), deps);
    assert.equal(response.headers["Cache-Control"], "no-store");
    return response;
  }
  return { request, deps, auth, configuration, invoke, writes: () => writes, calls,
    advance: value => { clock = new Date(value); } };
}

async function main() {
  let passed = 0;
  async function test(name, run) { await run(); passed++; console.log("PASS", name); }
  await test("fixed synthetic request uses existing budget and conservative receipt", async () => {
    const f = fixture(), r = await f.invoke(); assert.equal(r.status, 200); assert.equal(r.body.ok, true);
    assert.equal(f.calls.length, 1); assert.deepEqual(f.calls[0], ["Reply with exactly OK.",
      { callType: "pre500-provider-probe", runId: "nachlauf500-20261005024845", politicianId: null },
      { model: "gpt-5-mini", maxOutputTokens: 16 }]);
    assert.deepEqual(f.auth.historic, { kept: true }); assert.equal(r.body.actual500Test, false);
    assert.equal(r.body.boundUsd, 0.000011); assert.equal(r.body.usage.estimatedCost, 0.000005);
    assert.equal(Object.hasOwn(r.body, "text"), false);
  });
  await test("concurrent replay claims once and invokes AI once", async () => {
    const f = fixture(); const rs = await Promise.all([f.invoke(), f.invoke()]);
    assert.deepEqual(rs.map(r => r.status).sort(), [200, 409]); assert.equal(f.calls.length, 1);
    assert.equal(Object.keys(f.auth[P.KEY]).length, 1);
  });
  await test("invalid auth method body clock or runtime never writes", async () => {
    for (const mutate of [f => { f.request.headers.authorization = "Bearer wrong"; },
      f => { f.request.method = "GET"; }, f => { f.request.headers["content-length"] = "1"; },
      f => { f.request.headers["transfer-encoding"] = "chunked"; },
      f => { f.request.headers["x-helmut-root-deadline-at"] = "2026-10-05T03:19:50.001Z"; },
      f => { f.request.headers["x-helmut-production-commit"] = "b".repeat(40); },
      f => { f.configuration.resolved.providerForSend = "openai"; },
      f => { f.configuration.resolved.loopbackExactOne = true; },
      f => { f.configuration.secretNamePresence.AZURE_OPENAI_KEY = false; },
      f => { f.deps.storage.getStorageStatus = () => ({ backend: "local", supabaseConfigured: false }); },
      f => { delete f.auth.testKostenAuftrag; },
      f => { f.auth.synthetik500KostenAdmission = {}; }]) {
      const f = fixture(); mutate(f); const r = await f.invoke(); assert.notEqual(r.status, 200);
      assert.equal(f.writes(), 0); assert.equal(f.calls.length, 0);
    }
  });
  await test("uncertain CAS aborts provider and reports unknown consumption", async () => {
    const f = fixture(); f.deps.storage.mutateAuthStore = async fn => { fn(f.auth); throw new Error("unknown persisted result"); };
    const r = await f.invoke(); assert.equal(r.status, 503); assert.equal(r.body.consumed, null); assert.equal(f.calls.length, 0);
    f.deps.storage.mutateAuthStore = async fn => fn(f.auth); assert.equal((await f.invoke()).status, 409);
  });
  await test("unknown provider result stays consumed without retry", async () => {
    const f = fixture(); f.deps.requestText = async () => { f.calls.push([]); throw new Error("private upstream body never returned"); };
    const r = await f.invoke(); assert.equal(r.status, 502); assert.equal(r.body.consumed, true);
    assert.equal(r.body.providerCompletionProven, false); assert.equal((await f.invoke()).status, 409);
    assert.equal(f.calls.length, 1); assert.equal(JSON.stringify(r.body).includes("private upstream"), false);
  });
  await test("incomplete diagnosis is whitelisted, never raw provider data or retry", async () => {
    for (const diagnostic of [{ status: "incomplete", incompleteReason: "max_output_tokens", private: "PRIVATE_MODEL_BODY" },
      { status: "PRIVATE_STATUS", incompleteReason: "PRIVATE_REASON" }]) {
      const f = fixture();
      f.deps.requestText = async () => {
        f.calls.push([]);
        const e = new Error("PRIVATE_ERROR_BODY"); e.code = "AI_RESPONSE_NOT_COMPLETED";
        e.providerDiagnostic = diagnostic; throw e;
      };
      const r = await f.invoke(); assert.equal(r.status, 502); assert.equal(r.body.consumed, true);
      assert.equal(r.body.providerCompletionProven, false);
      assert.deepEqual(r.body.providerFailure, diagnostic.status === "incomplete"
        ? { status: "incomplete", incompleteReason: "max_output_tokens" } : null);
      assert.equal(JSON.stringify(r.body).includes("PRIVATE"), false);
      assert.equal((await f.invoke()).status, 409); assert.equal(f.calls.length, 1);
    }
  });
  await test("expiry during awaited preflight never claims or sends", async () => {
    const f = fixture(); f.deps.storage.leseLlmTageszaehler = async () => {
      f.advance("2026-10-05T04:00:00.000Z"); return { ok: true, used: 0 }; };
    assert.equal((await f.invoke()).status, 400); assert.equal(f.writes(), 0); assert.equal(f.calls.length, 0);
  });
  await test("missing corrupt duplicate or unmatched accounting is never success", async () => {
    for (const change of [f => { f.auth.llmUsage = []; }, f => { f.auth.llmUsage.push({ ...f.auth.llmUsage[0] }); },
      f => { f.auth.llmUsage[0].completionTokens = 17; },
      f => { f.auth.llmUsage[0].id = { private: "must not leave auth" }; },
      f => { f.deps.kosten.laufGebundenUsd = async () => 0; }]) {
      const f = fixture(), real = f.deps.requestText; f.deps.requestText = async (...args) => { await real(...args); change(f); return "OK"; };
      const r = await f.invoke(); assert.equal(r.status, 502); assert.equal(r.body.accountingConfirmed, false);
      assert.equal(JSON.stringify(r.body).includes("must not leave auth"), false);
    }
  });
  await test("fixture bearer rejected by actual production verifier", async () => {
    const f = fixture(); delete f.deps.operationAuth; const r = await f.invoke(); assert.equal(r.status, 403); assert.equal(f.writes(), 0);
  });
  await test("fixed operation identifiers satisfy real manual run and reservation policy", async () => {
    assert.ok(K.MANUELLE_RUN_ID.test(P.AUTH.runId)); assert.equal(K.reservierungHoeheUsd(16), 0.200064);
  });
  await require("./provider-runtime-single-probe-cas-test").run(fixture);
  console.log(`${passed} targeted handler checks plus real storage CAS passed; provider calls not run`);
}
module.exports = { fixture };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
