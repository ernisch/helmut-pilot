"use strict";

// Test-only HTTPS boundary. Security, sender claims, storage, clocks and cost
// accounting remain the application's real implementations. Never model output.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const { performance } = require("node:perf_hooks");
const EU = require("../../lib/helmut/synthetik-500-eu-service-contract");
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const SCOPE = "REVIEWED_LOCAL_MOCK_OUTPUT_SYNTHETIC_PERFORMANCE_FIXTURE_NOT_MODEL_OUTPUT";
const DELAY_MS = 19900;

function prepare({ row, model, candidate, template,
  responsesURL = EU.CONTRACT.responseURL, mockUsage = { input_tokens: 100, output_tokens: 100 } }) {
  const B = require("../../lib/helmut/briefing-lagebindung");
  const L = require("../../lib/helmut/lage"), ai = require("../../lib/helmut/ai");
  const Q = require("../../lib/helmut/lage-textqualitaet");
  assert.equal(ai.aiProviderName(), "azure");
  assert.equal(model, EU.CONTRACT.model); assert.equal(responsesURL, EU.CONTRACT.responseURL);
  const time = new Date(row.briefingDatum); assert(Number.isFinite(time.getTime()));
  const bound = B.pruefe(row.briefingEingabe, row.profile, row.profile.id, time, { acceptedSnapshot: true });
  const { koLite } = L.prepareDContext(bound.ranked, bound.sources, time, bound);
  assert(koLite.length > 0, "w15-unit0-provider-empty-context");
  assert(candidate?.draftCandidate && template?.response && template?.binding);
  assert.equal(sha(JSON.stringify(template.response)), template.binding.responseJSONSHA256);
  const draft = structuredClone(candidate.draftCandidate), review = structuredClone(template.response);
  const derived = ai.prepareLageReviewInput(draft, koLite, row.profile);
  assert.equal(Q.pruefe(derived.paragraphs, koLite, review, row.profile).ok, true,
    "w15-unit0-reviewed-template-must-match-current-context");
  const schema = structuredClone(ai.LAGE_BRIEFING_SCHEMA);
  // Same Azure transport normalization as the genuine generator; its server
  // paragraph-count check remains untouched.
  delete schema.properties.paragraphs.minItems; delete schema.properties.paragraphs.maxItems;
  const options = { jsonSchemaName: "knowledge_object", maxOutputTokens: 3000,
    strictJsonSchema: true, reasoningEffort: "low" };
  const d = ai.responsesPayload(ai.buildLageBriefingPrompt(koLite, structuredClone(row.profile),
    { briefingDatum: row.briefingDatum }), model, { ...options, jsonSchema: schema });
  const r = ai.responsesPayload(derived.prompt, model, { ...options, jsonSchema: Q.SCHEMA });
  EU.assertPayload(d); EU.assertPayload(r);
  assert(Number.isSafeInteger(mockUsage.input_tokens) && mockUsage.input_tokens > 0);
  assert(Number.isSafeInteger(mockUsage.output_tokens) && mockUsage.output_tokens > 0
    && mockUsage.output_tokens <= 3000);
  return { scope: SCOPE, index: 0, model, responsesURL, actualModelOutput: false,
    owner: row.profile.id, contextSources: koLite.length, delayMs: DELAY_MS,
    requestBodySHA256: sha(JSON.stringify(d)), reviewRequestBodySHA256: sha(JSON.stringify(r)),
    draftOutput: draft, reviewOutput: review,
    draftOutputSHA256: sha(JSON.stringify(draft)), reviewOutputSHA256: sha(JSON.stringify(review)),
    mockUsage: { input_tokens: mockUsage.input_tokens, output_tokens: mockUsage.output_tokens,
      total_tokens: mockUsage.input_tokens + mockUsage.output_tokens }, simulatedUsage: true };
}

function install({ fixture, selector, readSenderClaim, providerPhases = [] }) {
  assert.equal(fixture.scope, SCOPE); assert.equal(fixture.index, 0);
  assert.equal(fixture.actualModelOutput, false); assert.equal(fixture.delayMs, DELAY_MS);
  assert.equal(fixture.responsesURL, EU.CONTRACT.responseURL); assert.equal(fixture.model, EU.CONTRACT.model);
  assert.equal(sha(JSON.stringify(fixture.draftOutput)), fixture.draftOutputSHA256);
  assert.equal(sha(JSON.stringify(fixture.reviewOutput)), fixture.reviewOutputSHA256);
  assert.equal(typeof readSenderClaim, "function"); assert(Array.isArray(providerPhases));
  assert.match(selector.operationId, /^synthetik500-[A-Za-z0-9_-]{8,100}$/);
  assert.match(selector.commandHash, /^[a-f0-9]{64}$/);
  // Freeze private test inputs by value, so caller mutation cannot change an
  // already installed output or an expected body after its audit.
  fixture = structuredClone(fixture); selector = structuredClone(selector);
  const https = require("node:https"), original = https.request;
  const live = new Set(); let calls = 0, pending = 0, restored = false;
  function requestMock(url, options, callback) {
    // Fail closed for every other URL/method/call; never delegate to a real
    // network sender, including the network-blocking preload's replacement.
    assert.equal(String(url), fixture.responsesURL, "w15-unit0-exact-provider-url");
    assert.equal(options.method, "POST"); assert.equal(options.timeout, EU.CONTRACT.providerMs);
    assert(!restored && calls < 2, "w15-unit0-no-third-provider-call-or-retry");
    const request = new EventEmitter(), chunks = [];
    let destroyed = false, ended = false, timer = null, outstanding = false;
    const state = { destroy: null }; live.add(state);
    const finishPending = () => { if (outstanding) { pending--; outstanding = false; } };
    request.write = chunk => {
      assert(!ended && !destroyed, "w15-unit0-provider-write-after-end");
      chunks.push(Buffer.from(chunk)); return true;
    };
    request.destroy = error => {
      if (destroyed) return request;
      destroyed = true; if (timer) clearTimeout(timer); finishPending(); live.delete(state);
      if (error) queueMicrotask(() => request.emit("error", error));
      return request;
    };
    state.destroy = request.destroy;
    request.end = () => {
      assert(!ended && !destroyed, "w15-unit0-provider-end-once"); ended = true;
      const body = Buffer.concat(chunks).toString("utf8"), phase = ++calls === 1 ? "D" : "R";
      const begin = performance.now(), payload = JSON.parse(body);
      assert.equal(sha(body), phase === "D" ? fixture.requestBodySHA256 : fixture.reviewRequestBodySHA256,
        "w15-unit0-original-app-sender-body-must-match-real-constructor");
      assert.equal(payload.model, fixture.model);
      const claim = readSenderClaim({ phase, body });
      assert(claim && typeof claim.then !== "function", "w15-unit0-claim-read-must-be-synchronous");
      assert.equal(claim.operationId, selector.operationId); assert.equal(claim.commandHash, selector.commandHash);
      assert.equal(claim.index, 0); assert.equal(claim.journalState, "running");
      assert.equal(claim.attemptStatus, "sent"); assert.equal(claim.reservationStatus, "reserviert");
      assert.equal(claim.actualRequestHash,
        require("../../lib/helmut/synthetik-500-kosten-admission").requestHash(body));
      const record = { index: 0, phase, requestBytes: Buffer.byteLength(body), requestSHA256: sha(body),
        beginMS: begin, requiredDelayMs: DELAY_MS, nativePermanentSendClaim: true,
        nativeCostReservation: true, actualModelOutput: false, simulatedUsage: true };
      providerPhases.push(record); pending++; outstanding = true;
      const responseBody = JSON.stringify({ id: "LOCAL_MOCK_ONLY_0_" + phase, status: "completed", model: payload.model,
        usage: fixture.mockUsage, output: [{ type: "message", status: "completed", role: "assistant",
          content: [{ type: "output_text", text: JSON.stringify(phase === "D" ? fixture.draftOutput : fixture.reviewOutput), annotations: [] }] }] });
      const deliver = () => {
        if (destroyed) return;
        const remaining = DELAY_MS - (performance.now() - begin);
        if (remaining > 0) { timer = setTimeout(deliver, Math.max(1, Math.ceil(remaining))); return; }
        record.endMS = performance.now(); record.actualDelayMS = record.endMS - begin;
        finishPending(); live.delete(state);
        const reply = new EventEmitter(); reply.statusCode = 200;
        reply.setEncoding = () => reply; reply.destroy = () => {};
        callback(reply); reply.emit("data", responseBody); reply.emit("end");
      };
      timer = setTimeout(deliver, Math.max(1, Math.ceil(DELAY_MS - (performance.now() - begin))));
      return request;
    };
    return request;
  }
  https.request = requestMock;
  return { count: () => calls, pending: () => pending, actualModelOutput: false,
    restore() {
      if (restored) return; restored = true;
      // Never overwrite a different owner's later hook.
      if (https.request === requestMock) https.request = original;
      for (const state of [...live]) state.destroy(Object.assign(new Error("w15-unit0-provider-stopped"), { code: "ECANCELED" }));
    } };
}

module.exports = { prepare, install };
