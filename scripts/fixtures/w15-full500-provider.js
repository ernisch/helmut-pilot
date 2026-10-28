"use strict";

// Full500 test-only HTTPS boundary, one immutable two-call fixture per unit. Security, sender claims, storage, clocks and cost
// accounting remain the application's real implementations. Never model output.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const { performance } = require("node:perf_hooks");
const EU = require("../../lib/helmut/synthetik-500-eu-service-contract");
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const SCOPE = "REVIEWED_LOCAL_MOCK_OUTPUT_SYNTHETIC_PERFORMANCE_FIXTURE_NOT_MODEL_OUTPUT";
const DELAY_MS = 19900;

function validIndex(index) {
  assert(Number.isInteger(index) && index >= 0 && index < 500, "w15-full500-index");
  return index;
}
function delay(index) { return index === 0 || index === 499 ? DELAY_MS : 0; }
function prepare({ index, ...inputs }) {
  validIndex(index);
  // Reuse every original constructor and deterministic template check unchanged.
  return { ...require("./w15-unit0-provider").prepare(inputs), index, delayMs: delay(index) };
}

function install({ fixture, selector, readSenderClaim, providerPhases = [] }) {
  assert.equal(fixture.scope, SCOPE); validIndex(fixture.index);
  assert.equal(fixture.actualModelOutput, false); assert.equal(fixture.delayMs, delay(fixture.index));
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
  const live = new Set(); let calls = 0, admittedRequests = 0, pending = 0, restored = false;
  function requestMock(url, options, callback) {
    // Fail closed for every other URL/method/call; never delegate to a real
    // network sender, including the network-blocking preload's replacement.
    assert.equal(String(url), fixture.responsesURL, "w15-full500-exact-provider-url");
    assert.equal(options.method, "POST"); assert.equal(options.timeout, EU.CONTRACT.providerMs);
    assert(!restored && admittedRequests < 2, "w15-full500-no-third-provider-call-or-retry");
    admittedRequests++;
    const request = new EventEmitter(), chunks = [];
    let destroyed = false, ended = false, timer = null, outstanding = false;
    const state = { destroy: null }; live.add(state);
    const finishPending = () => { if (outstanding) { pending--; outstanding = false; } };
    request.write = chunk => {
      assert(!ended && !destroyed, "w15-full500-provider-write-after-end");
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
      assert(!ended && !destroyed, "w15-full500-provider-end-once"); ended = true;
      const body = Buffer.concat(chunks).toString("utf8"), phase = ++calls === 1 ? "D" : "R";
      const begin = performance.now(), payload = JSON.parse(body);
      assert.equal(sha(body), phase === "D" ? fixture.requestBodySHA256 : fixture.reviewRequestBodySHA256,
        "w15-full500-original-app-sender-body-must-match-real-constructor");
      assert.equal(payload.model, fixture.model);
      const claim = readSenderClaim({ phase, body, index: fixture.index });
      assert(claim && typeof claim.then !== "function", "w15-full500-claim-read-must-be-synchronous");
      assert.equal(claim.operationId, selector.operationId); assert.equal(claim.commandHash, selector.commandHash);
      assert.equal(claim.index, fixture.index); assert.equal(claim.journalState, "running");
      assert.equal(claim.attemptStatus, "sent"); assert.equal(claim.reservationStatus, "reserviert");
      assert.equal(claim.actualRequestHash,
        require("../../lib/helmut/synthetik-500-kosten-admission").requestHash(body));
      const record = { index: fixture.index, phase, requestBytes: Buffer.byteLength(body), requestSHA256: sha(body),
        beginMS: begin, requiredDelayMs: fixture.delayMs, nativePermanentSendClaim: true,
        nativeCostReservation: true, actualModelOutput: false, simulatedUsage: true };
      providerPhases.push(record); pending++; outstanding = true;
      const responseBody = JSON.stringify({ id: "LOCAL_MOCK_ONLY_" + fixture.index + "_" + phase, status: "completed", model: payload.model,
        usage: fixture.mockUsage, output: [{ type: "message", status: "completed", role: "assistant",
          content: [{ type: "output_text", text: JSON.stringify(phase === "D" ? fixture.draftOutput : fixture.reviewOutput), annotations: [] }] }] });
      const deliver = () => {
        if (destroyed) return;
        const remaining = fixture.delayMs - (performance.now() - begin);
        if (remaining > 0) { timer = setTimeout(deliver, Math.max(1, Math.ceil(remaining))); return; }
        record.endMS = performance.now(); record.actualDelayMS = record.endMS - begin;
        finishPending(); live.delete(state);
        const reply = new EventEmitter(); reply.statusCode = 200;
        reply.setEncoding = () => reply; reply.destroy = () => {};
        callback(reply); reply.emit("data", responseBody); reply.emit("end");
      };
      timer = setTimeout(deliver, Math.max(1, Math.ceil(fixture.delayMs - (performance.now() - begin))));
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
      for (const state of [...live]) state.destroy(Object.assign(new Error("w15-full500-provider-stopped"), { code: "ECANCELED" }));
    } };
}

module.exports = { prepare, install };
