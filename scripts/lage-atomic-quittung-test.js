"use strict";

// Narrow offline regression for the actual ai.js completion/receipt handoff.
// SQL atomicity is covered separately by auth-usage-atomic-check.js with real PG.
// This test mocks the provider and storage ACK; no network, DB or profile action.
const assert = require("node:assert/strict"), { randomUUID } = require("node:crypto");
const { EventEmitter } = require("node:events"), https = require("node:https");
const U = require("../lib/helmut/llm-usage-atomic"), EU = require("../lib/helmut/synthetik-500-eu-service-contract");
const storage = require("../lib/helmut/storage"), provider = require("../lib/helmut/anbieter-steuerung");
const ai = require("../lib/helmut/ai");
const env = { ...process.env }, original = { request: https.request, read: storage.readAuthStore,
  reserve: storage.reserveLlmCall, record: storage.recordLlmUsage, active: provider.steuerungAktiv };

async function brandedReceipt() {
  const proof = { generation: randomUUID(), count: 0, head: "1".repeat(64), originalHash: "2".repeat(64) };
  const state = await U.read({ rowId: "unit-auth", target: "unit-only",
    request: async () => ({ data: { _authStoreRevision: randomUUID(), llmUsage: [],
      testKostenAuftrag: { version: EU.ORDER_VERSION, serviceContractHash: EU.HASH } }, proof }) });
  const record = { id: randomUUID(), model: "gpt-4.1", promptTokens: 1, completionTokens: 1 };
  state.llmUsage = [record];
  await U.write(state, { rowId: "unit-auth", target: "unit-only", request: async (_path, options) => {
    const sent = JSON.parse(options.body);
    return [{ id: "unit-auth", revision: sent.data._authStoreRevision,
      proof: { ...proof, count: 1, head: "3".repeat(64) } }];
  } });
  return U.receipt(record, state);
}

(async () => {
  delete process.env.VERCEL; delete process.env.AZURE_OPENAI_KEY; delete process.env.AZURE_OPENAI_ENDPOINT;
  process.env.OPENAI_API_KEY = "offline-dummy";
  process.env.SUPABASE_URL = "http://127.0.0.1:38419";
  process.env.HELMUT_LLM_USAGE_STORAGE = U.VERSION;
  storage.readAuthStore = async () => ({}); // No finite order: isolate completion handoff.
  storage.reserveLlmCall = async () => ({ allowed: true });
  provider.steuerungAktiv = () => false;
  const good = await brandedReceipt();assert(U.confirmed(good));
  for (const [name, receipt, pass] of [["exact-receipt", good, true],
    ["serialized-clone", JSON.parse(JSON.stringify(good)), false],
    ["forged-blob-flag", { ...good, _ablage: { blob: true } }, false]]) {
    let requests = 0, records = 0;
    storage.recordLlmUsage = async () => { records++;return receipt; };
    https.request = (_url, _options, callback) => {
      requests++;const req = new EventEmitter();req.write = () => {};req.destroy = () => {};
      req.end = () => setImmediate(() => {
        const res = new EventEmitter();res.statusCode = 200;res.setEncoding = () => {};
        callback(res);res.emit("data", JSON.stringify({ status: "completed", usage: { input_tokens: 1, output_tokens: 1 },
          output: [{ content: [{ type: "output_text", text: "local-response" }] }] }));
        res.emit("end");req.emit("error", Error("late-local-transport-event"));
      });return req;
    };
    const call = ai.requestText("local-test", { callType: "lageBriefing" }, { model: "gpt-4.1" });
    if (pass) assert.equal(await call, "local-response");
    else await assert.rejects(call, e => e.code === "LLM_USAGE_NOT_CONFIRMED");
    assert.equal(requests, 1);assert.equal(records, 1);
    console.log("PASS " + name);
  }
  console.log("3 passed; provider/storage mocked; no network, activation or resource GO");
})().catch(e => { console.error(e);process.exitCode = 1; }).finally(() => {
  https.request = original.request;storage.readAuthStore = original.read;storage.reserveLlmCall = original.reserve;
  storage.recordLlmUsage = original.record;provider.steuerungAktiv = original.active;
  for (const key of Object.keys(process.env)) if (!Object.hasOwn(env, key)) delete process.env[key];
  Object.assign(process.env, env);
});
