"use strict";

// Real storage/mutate/receipt/accounting path against the same local fixture DB.
// Provider transport is an explicit in-process mock; no model or engine run.
const assert = require("node:assert/strict");
const { EventEmitter, once } = require("node:events");
const http = require("node:http");
const https = require("node:https");
const A = require("../../lib/helmut/llm-usage-atomic");
const { fixture } = require("./fixture");
const S = require("./support");

async function gateway(config) {
  const raw = new URL(config.apiBase);
  const server = http.createServer((req, res) => {
    const upstream = http.request({ hostname: raw.hostname, port: raw.port,
      path: req.url.replace(/^\/rest\/v1/, ""), method: req.method, headers: req.headers }, response => {
      res.writeHead(response.statusCode, response.headers);response.pipe(res);
    });
    upstream.on("error", () => { res.writeHead(502);res.end(); });req.pipe(upstream);
  });
  server.listen(0, "127.0.0.1");await once(server, "listening");
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) };
}
async function main(config) {
  const sql = S.sqlClient(config), id = "component-integration", data = fixture({ historyCount: 5000, paddingBytes: 0 });
  data.llmUsage = data.llmUsage.map(x => ({ ...x, id: id + "-" + x.id }));
  // No installed execution slot exists in this isolated storage/accounting case.
  delete data.synthetik500KostenAdmission;delete data.synthetik500DispatchJournal;
  S.seed(sql, id, data);S.bootstrap(sql, id);const gate = await gateway(config), checks = [];
  const check = async (name, body) => { await body();checks.push(name);console.log(`PASS ${name}`); };
  const originalEnv = { ...process.env };
  Object.assign(process.env, { HELMUT_STORAGE_BACKEND: "supabase", SUPABASE_URL: gate.url,
    SUPABASE_SERVICE_ROLE_KEY: S.token(config, "service_role"), HELMUT_SUPABASE_AUTH_STORE_ID: id,
    HELMUT_LLM_USAGE_STORAGE: A.VERSION, HELMUT_SOURCE_MODE: "off", OPENAI_API_KEY: "INERT_LOCAL_TRANSPORT_MOCK_ONLY" });
  delete process.env.VERCEL;delete process.env.VERCEL_ENV;delete process.env.AZURE_OPENAI_KEY;
  delete process.env.AZURE_OPENAI_API_KEY;delete process.env.AZURE_OPENAI_ENDPOINT;
  // This helper owns its Node process; load storage only after binding the local target.
  assert(!require.cache[require.resolve("../../lib/helmut/storage")], "Integration storage must load after target binding");
  const storage = require("../../lib/helmut/storage"), budget = require("../../lib/helmut/testkosten-budget");
  const provider = require("../../lib/helmut/anbieter-steuerung"), ai = require("../../lib/helmut/ai");
  const saved = { request: https.request, reserve: storage.reserveLlmCall, record: storage.recordLlmUsage, active: provider.steuerungAktiv };
  let receipt;
  try {
    await check("Actual storage read/mutate preserves more than5000 full historical records and future fields", async () => {
      const before = await storage.readAuthStore({ strict: true });assert.equal(before.llmUsage.length, 5000);
      await storage.mutateAuthStore(auth => { auth.adminSettings.integrationMutation = true; });
      const after = await storage.readAuthStore({ strict: true });assert.equal(after.adminSettings.integrationMutation, true);
      assert.deepEqual(after.llmUsage, data.llmUsage);assert.deepEqual(after.unknownFutureField, data.unknownFutureField);
    });
    await check("Actual storage.recordLlmUsage produces private relational receipt and full history remains complete", async () => {
      receipt = await storage.recordLlmUsage({ model: "gpt-5-mini", callType: "component-accounting",
        politicianId: "component-owner", usage: { input_tokens: 20, output_tokens: 10 }, success: true });
      assert(receipt);assert.equal(receipt._ablage.blob, false);assert(A.confirmed(receipt));
      const fresh = await storage.readAuthStore({ strict: true });assert(A.persisted(fresh, receipt));
      assert.equal(fresh.llmUsage.length, 5001);assert.deepEqual(fresh.llmUsage.slice(1), data.llmUsage);
      assert.equal((await storage.getLlmUsage(null, 6000)).length, 5001);
    });
    await check("Unchanged budget completion accepts genuinely persisted receipt and keeps reserved unknown costs", async () => {
      const day = new Date().toISOString().slice(0, 10), reserved = budget.tokenKosten(400000, 3000);
      const makeCall = () => ({ status: "reserviert", reserved, maxOutputTokens: 3000, manual: false, createdAt: day + "T00:00:00.000Z" });
      await storage.mutateAuthStore(auth => { auth.testKostenTage[day] = { version: 2, day, limit: 6000000,
        tarif: "azure-gpt5-mini-obergrenze-20260909", spent: 0, baseline: 0, baselineCalls: 0,
        manualCalls: 0, manualUntil: null, frozen: null, calls: { "component-accounted": makeCall(), "component-unknown": makeCall() } }; });
      const ticket = { id: "component-accounted", day, reserved };
      await budget.abschliessen(ticket, receipt);
      let after = await storage.readAuthStore({ strict: true });
      assert.equal(after.testKostenTage[day].calls[ticket.id].status, "abgerechnet");
      const expectedCost = budget.tokenKosten(20, 10);assert.equal(after.testKostenTage[day].spent, expectedCost);
      const forged = JSON.parse(JSON.stringify(receipt));
      await assert.rejects(budget.abschliessen({ ...ticket, id: "component-unknown" }, forged), { code: "TEST_USD_UNKNOWN" });
      after = await storage.readAuthStore({ strict: true });assert.equal(after.testKostenTage[day].calls["component-unknown"].status, "ungeklaert");
      assert.equal(after.testKostenTage[day].calls["component-unknown"].reserved, reserved);
      assert.equal(after.testKostenTage[day].spent, expectedCost);assert.equal(after.testKostenTage[day].calls["component-unknown"].cost, undefined);
    });
    await check("AI completion waits for real atomic storage receipt; forged relational flags deny completion", async () => {
      let mockRequests = 0;storage.reserveLlmCall = async () => ({ allowed: true });provider.steuerungAktiv = () => false;
      https.request = (_url, _options, callback) => {
        mockRequests++;const req = new EventEmitter();req.write = () => {};req.destroy = () => {};
        req.end = () => setImmediate(() => {
          const res = new EventEmitter();res.statusCode = 200;res.setEncoding = () => {};res.destroy = () => {};
          callback(res);res.emit("data", JSON.stringify({ status: "completed", usage: { input_tokens: 20, output_tokens: 10 },
            output: [{ content: [{ type: "output_text", text: "INERT_COMPONENT_RESPONSE" }] }] }));res.emit("end");
        });return req;
      };
      const before = (await storage.readAuthStore({ strict: true })).llmUsage.length;
      const answer = await ai.requestText("INERT_COMPONENT_PROMPT", { callType: "lageBriefing", politicianId: "component-owner" }, { model: "gpt-5-mini" });
      assert.equal(answer, "INERT_COMPONENT_RESPONSE");assert.equal(mockRequests, 1);
      assert.equal((await storage.readAuthStore({ strict: true })).llmUsage.length, before + 1);
      storage.recordLlmUsage = async () => JSON.parse(JSON.stringify(receipt));
      await assert.rejects(ai.requestText("INERT_COMPONENT_PROMPT", { callType: "lageBriefing", politicianId: "component-owner" }, { model: "gpt-5-mini" }), { code: "LLM_USAGE_NOT_CONFIRMED" });
      assert.equal(mockRequests, 2);storage.recordLlmUsage = saved.record;
    });
    await check("Disabled split mode rejects physical markers and already-read split snapshots without legacy fallback", async () => {
      const snapshot = await storage.readAuthStore({ strict: true });process.env.HELMUT_LLM_USAGE_STORAGE = "blob";
      await assert.rejects(storage.readAuthStore({ strict: true }), /ATOMIC_USAGE_READER_REQUIRED/);
      await assert.rejects(storage.writeAuthStore(snapshot), /ATOMIC_USAGE_READER_REQUIRED/);
      process.env.HELMUT_LLM_USAGE_STORAGE = A.VERSION;
      assert.equal((await storage.readAuthStore({ strict: true })).llmUsage.length, 5002);
    });
    const result = { schema: "helmut-auth-usage-split-actual-storage-integration/1", pass: true,
      checks: checks.length, groups: checks, realLocalDatabase: true, mockProviderResponses: 2,
      actualPaidModelCalls: 0, historicalUsage: 5000, finalUsage: 5002, profiles: 0, engineUnits: 0, complete500Attempts: 0 };
    console.log(JSON.stringify(result));return result;
  } finally {
    https.request = saved.request;storage.reserveLlmCall = saved.reserve;storage.recordLlmUsage = saved.record;provider.steuerungAktiv = saved.active;
    for (const key of Object.keys(process.env)) if (!Object.hasOwn(originalEnv, key)) delete process.env[key];Object.assign(process.env, originalEnv);
    await gate.close();
  }
}
if (require.main === module) main(S.readConfig(process.argv[2])).catch(error => { console.error(error.stack);process.exitCode = 1; });
module.exports = { main };
