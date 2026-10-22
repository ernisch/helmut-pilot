"use strict";

// Pure, narrowly pinned V12 fixture derivation. No file reader, transport,
// clock, storage receipt, authority or original-command execution lives here.
const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const Source = require("./local-unit-diagnostic-source");
const P = require("./synthetik-500-profile");
const Admission = require("./synthetik-500-kosten-admission");
const ai = require("./ai");
const Q = require("./lage-textqualitaet");
const Review = require("./synthetik-500-review-receipt");
const Diagnostic = require("./local-unit-diagnostic-authority");

const VERSION = "helmut-local-unit-diagnostic-original-producer/1";
const PROOF_VERSION = "helmut-local-unit-diagnostic-original-producer-proof/1";
const LATENCY_MS = 19900; // Original contracts.js LIMITS.worstDelayMS, index499.
const ORIGINAL_INPUTS = Object.freeze({
  preparedRequests: Object.freeze({ bytes: 8209746, sha256: "79498729160c30dd3aaccfcce3b5613b4f97e3a1b0074b83273e172f5455fb32" }),
  actualRequestBindings: Object.freeze({ bytes: 306392, sha256: "8bef63b785b7afdf7a370080d108c2ce613dec40f7734a0d63766663d24dbbe0" }),
  providerFixtures: Object.freeze({ bytes: 1472456, sha256: "ebf215088d81524a7bb5d1465a1f61f0064be541a98707400f9a6519e0fdcaa5" })
});
const ORIGINAL_PACKET = Object.freeze({ bytes: 1233928, sha256: "29cf691713b875c5a720882644963f9c2ca2dc39c51a4c284588d815c863cf44" });
const ORIGINAL_REVIEW = Object.freeze({ path: "/workspace/helmut-parallel-20261015/wave12/ROOT_STATIC_LOCAL_R_TEMPLATE_ACCEPTANCE.SAFE.json",
  bytes: 3409, sha256: "c3088f502d3b5c278af583929712cd4b43d8b80412c36a3f291d8c00c63ee0d4" });
const PREPARED_FIELDS = ["owner", "body", "bodySHA256", "actualRequestHash"];
const BINDING_FIELDS = ["index", "owner", "variantIndex", "commandHash", "planHash", "D_SHA256", "R_SHA256",
  "draftJSONSHA256", "reviewJSONSHA256", "actualModelOutput", "originalPreRAndQPassed"];
const FIXTURE_FIELDS = ["scope", "index", "owner", "reviewedMockOutputs", "actualModelOutput", "independentReview",
  "requestBodySHA256", "reviewRequestBodySHA256", "draftOutput", "reviewOutput", "mockUsage", "responsesURL"];
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const exact = (x, keys) => x !== null && typeof x === "object" && !Array.isArray(x)
  && [Object.prototype, null].includes(Object.getPrototypeOf(x))
  && Object.keys(x).sort().join("|") === [...keys].sort().join("|");
const hash = x => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
function need(ok, code) { if (!ok) throw Error("local-unit-diagnostic-original-producer-" + code); }
function freeze(x) {
  if (x && typeof x === "object") { Object.values(x).forEach(freeze); Object.freeze(x); }
  return x;
}
function parse(bytes, pin) {
  need(Buffer.isBuffer(bytes) && bytes.length === pin.bytes && sha(bytes) === pin.sha256, "original-input-pin");
  need(Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes), "original-input-utf8");
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { need(false, "original-input-json"); }
  need(Array.isArray(value) && value.length === 500, "original-500-array");
  return value;
}
function originalRows(prepared, bindings, fixtures) {
  const owners = new Set(); let commandHash = null, planHash = null;
  for (let index = 0; index < 500; index++) {
    const p = prepared[index], b = bindings[index], f = fixtures[index];
    need(exact(p, PREPARED_FIELDS) && exact(b, BINDING_FIELDS) && exact(f, FIXTURE_FIELDS), "original-row-schema");
    need(typeof p.owner === "string" && p.owner.length > 0 && p.owner === b.owner && b.owner === f.owner
      && !owners.has(p.owner) && b.index === index && f.index === index
      && Number.isSafeInteger(b.variantIndex) && b.variantIndex >= 0 && b.variantIndex < 26, "original-owner-index");
    owners.add(p.owner);
    need(typeof p.body === "string" && hash(p.bodySHA256) && hash(p.actualRequestHash)
      && sha(p.body) === p.bodySHA256 && Admission.requestHash(p.body) === p.actualRequestHash
      && p.bodySHA256 === b.D_SHA256 && b.D_SHA256 === f.requestBodySHA256
      && hash(b.R_SHA256) && b.R_SHA256 === f.reviewRequestBodySHA256
      && hash(b.draftJSONSHA256) && b.draftJSONSHA256 === sha(JSON.stringify(f.draftOutput))
      && hash(b.reviewJSONSHA256) && b.reviewJSONSHA256 === sha(JSON.stringify(f.reviewOutput)), "original-row-hashes");
    need(hash(b.commandHash) && hash(b.planHash) && (commandHash === null || commandHash === b.commandHash)
      && (planHash === null || planHash === b.planHash), "original-command-plan");
    commandHash = b.commandHash; planHash = b.planHash;
    need(b.actualModelOutput === false && b.originalPreRAndQPassed === true
      && f.scope === "INDEPENDENTLY_REVIEWED_LOCAL_PROVIDER_FIXTURE_NOT_MODEL_OUTPUT"
      && f.reviewedMockOutputs === true && f.actualModelOutput === false
      && isDeepStrictEqual(f.independentReview, ORIGINAL_REVIEW)
      && exact(f.mockUsage, ["input_tokens", "output_tokens"])
      && Object.values(f.mockUsage).every(x => Number.isSafeInteger(x) && x >= 0)
      && exact(f.draftOutput, ["paragraphs"]) && Array.isArray(f.draftOutput.paragraphs)
      && exact(f.reviewOutput, ["pruefungen", "vergleiche"])
      && Array.isArray(f.reviewOutput.pruefungen) && Array.isArray(f.reviewOutput.vergleiche), "original-fixture-scope");
    let url; try { url = new URL(f.responsesURL); } catch { need(false, "original-fixture-url"); }
    need(url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash, "original-fixture-url");
  }
  return { commandHash, planHash, entriesVerified: owners.size };
}
function payload(prompt, model, schema, maxOutputTokens, reasoningEffort) {
  return Buffer.from(JSON.stringify(ai.responsesPayload(prompt, model, { jsonSchema: schema, jsonSchemaName: "knowledge_object",
    maxOutputTokens, strictJsonSchema: true, reasoningEffort })), "utf8");
}
function phaseBytes(phase, requestBytes, fixture, sourceIntentId) {
  const output = phase === "D" ? fixture.draftOutput : fixture.reviewOutput;
  // Exact local-provider.js Responses envelope, including its original ID and
  // usage field order. These are reviewed fixture outputs, never model output.
  const responseBytes = Buffer.from(JSON.stringify({ id: "LOCAL_MOCK_ONLY_499_" + phase, status: "completed", model: "gpt-5-mini-eu",
    usage: fixture.mockUsage, output: [{ type: "message", status: "completed", role: "assistant",
      content: [{ type: "output_text", text: JSON.stringify(output), annotations: [] }] }] }));
  const latencyBytes = Buffer.from(JSON.stringify({ schema: "helmut-local-unit-diagnostic-original-latency/1",
    sourceIndex: 499, phase, sourceIntentId, latencyMs: LATENCY_MS,
    basis: "ORIGINAL_LOCAL_PROVIDER_CONFIGURED_WORST_DELAY", actualElapsedTimeClaimed: false,
    originalContract: "native-end-preparation/contracts.js:LIMITS.worstDelayMS", actualModelOutput: false }));
  return Object.freeze({ requestBytes, responseBytes, latencyBytes, responseStatus: 200, latencyMs: LATENCY_MS });
}
function bodyProof(bytes) { return { bytes: bytes.length, sha256: sha(bytes), actualRequestHash: Admission.requestHash(bytes.toString("utf8")) }; }
function derive(args) {
  need(exact(args, ["sourceHandle", "preparedBytes", "bindingBytes", "fixtureBytes"]), "arguments");
  const selected = Source.readSelection(args.sourceHandle), source = Source.commandSource(args.sourceHandle), binding = Source.sourceBinding(args.sourceHandle);
  need(selected.sourceIndex === 499 && selected.diagnosticUnit === 0 && selected.sourceDay === "2026-10-21"
    && selected.sourceOperationId === "synthetik500-resources21-f3375a7d5548"
    && source.packetPin.bytes === ORIGINAL_PACKET.bytes && source.packetPin.sha256 === ORIGINAL_PACKET.sha256,
  "selected-original-source");
  const selectedHash = P.hash(selected), prepared = parse(args.preparedBytes, ORIGINAL_INPUTS.preparedRequests),
    bindings = parse(args.bindingBytes, ORIGINAL_INPUTS.actualRequestBindings), fixtures = parse(args.fixtureBytes, ORIGINAL_INPUTS.providerFixtures);
  const rows = originalRows(prepared, bindings, fixtures), p = prepared[499], b = bindings[499], f = fixtures[499];
  const draft = selected.draft, [d, r] = selected.intents;
  need(draft.profile.id === p.owner && selected.unit.subject === p.owner && draft.intentId === d.id
    && selected.unit.intentIds[0] === d.id && selected.unit.intentIds[1] === r.id
    && d.phase === "D" && r.phase === "R" && d.owner === p.owner && r.owner === p.owner && r.dependsOn === d.id
    && d.actualRequestHash === p.actualRequestHash && d.inputVersionHash === P.hash(draft.descriptor)
    && r.contextVersionHash === d.inputVersionHash && binding.draftSHA256 === P.hash(draft), "source-draft-intents");
  // The retained Source intent itself is3000/low. The separate diagnostic
  // contract owns6000/medium; never rewrite or relabel that original intent.
  need(d.model === "gpt-5-mini" && r.model === d.model && d.maxOutputTokens === 3000 && r.maxOutputTokens === 3000
    && r.inputVersionHash === null && r.actualRequestHash === null
    && isDeepStrictEqual(r.reviewRule, { version: Review.RULE_VERSION, reasoningEffort: "low" }), "source-review-rule");
  const diagnosticReview = { maxOutputTokens: Diagnostic.LIMITS.maxOutputTokens.R,
    rule: { version: Review.RULE_VERSION, reasoningEffort: "medium" } };
  need(Diagnostic.VERSION === "helmut-local-unit-diagnostic-command/1" && Diagnostic.LIMITS.maxOutputTokens.D === d.maxOutputTokens
    && diagnosticReview.maxOutputTokens === 6000 && Review.validRule(diagnosticReview.rule, diagnosticReview.maxOutputTokens),
  "diagnostic-review-contract");
  const date = new Date(draft.briefingDatum);
  const bound = require("./briefing-lagebindung").pruefe(draft.briefingEingabe, draft.profile, p.owner, date, { acceptedSnapshot: true });
  const { koLite: sources } = require("./lage").prepareDContext(bound.ranked, bound.sources, date, bound);
  need(Array.isArray(sources) && sources.length > 0, "source-D-context");
  const originalD = Buffer.from(p.body, "utf8"), parsedD = JSON.parse(p.body), schema = structuredClone(ai.LAGE_BRIEFING_SCHEMA);
  delete schema.properties.paragraphs.minItems; delete schema.properties.paragraphs.maxItems;
  const nativeD = payload(ai.buildLageBriefingPrompt(sources, structuredClone(draft.profile), { briefingDatum: draft.briefingDatum }),
    "gpt-5-mini-eu", schema, d.maxOutputTokens, "low");
  need(parsedD.model === "gpt-5-mini-eu" && nativeD.equals(originalD), "native-D-original-byte-mismatch");
  const review = ai.prepareLageReviewInput(f.draftOutput, sources, draft.profile);
  need(Q.pruefe(review.paragraphs, sources, f.reviewOutput, draft.profile).ok === true, "original-review-verdict");
  // The original assembly genuinely used 3000/low. Reconstruct and verify that
  // historical body before deriving the current native 6000/medium request.
  const originalR = payload(review.prompt, parsedD.model, Q.SCHEMA, r.maxOutputTokens, r.reviewRule.reasoningEffort);
  need(sha(originalR) === b.R_SHA256, "native-R-original-binding-mismatch");
  const diagnosticR = payload(review.prompt, parsedD.model, Q.SCHEMA,
    diagnosticReview.maxOutputTokens, diagnosticReview.rule.reasoningEffort);
  need(!diagnosticR.equals(originalR) && P.hash(selected) === selectedHash, "source-review-mismatch-required");
  const phases = Object.freeze({ D: phaseBytes("D", originalD, f, d.id), R: phaseBytes("R", diagnosticR, f, r.id) });
  const proof = freeze({ schema: PROOF_VERSION, sourceIndex: 499, diagnosticUnit: 0,
    sourceOperationId: selected.sourceOperationId, sourceSelectionSHA256: binding.selectionSHA256,
    sourceDraftSHA256: P.hash(draft), sourceProfileSHA256: P.hash(draft.profile), sourceBindingsSHA256: P.hash(draft.sources),
    preparedSourcesSHA256: P.hash(sources), sourceIntentIds: { D: d.id, R: r.id },
    sourceIntentSHA256: { D: P.hash(d), R: P.hash(r) }, originalInputs: ORIGINAL_INPUTS,
    originalRows: rows, originalOutputsSHA256: { D: b.draftJSONSHA256, R: b.reviewJSONSHA256 },
    originalRequests: { D: { ...bodyProof(originalD), maxOutputTokens: 3000, reasoningEffort: "low" },
      R: { ...bodyProof(originalR), maxOutputTokens: r.maxOutputTokens, reasoningEffort: r.reviewRule.reasoningEffort } },
    diagnosticRequests: { D: { ...bodyProof(originalD), maxOutputTokens: 3000, reasoningEffort: "low" },
      R: { ...bodyProof(diagnosticR), maxOutputTokens: diagnosticReview.maxOutputTokens,
        reasoningEffort: diagnosticReview.rule.reasoningEffort } },
    diagnosticReviewOverride: { schema: "helmut-local-unit-diagnostic-review-override/1",
      sourceIntentSHA256: P.hash(r), sourceIntentModified: false,
      originalRule: { maxOutputTokens: r.maxOutputTokens, reviewRule: structuredClone(r.reviewRule) },
      diagnosticRule: { maxOutputTokens: diagnosticReview.maxOutputTokens, reviewRule: diagnosticReview.rule },
      basis: { commandVersion: Diagnostic.VERSION, limitsSHA256: P.hash(Diagnostic.LIMITS) },
      originalRequestSHA256: sha(originalR), diagnosticRequestSHA256: sha(diagnosticR),
      sourceProfilePreserved: true, sourceBindingsPreserved: true, originalOutputsPreserved: true },
    originalDByteIdentical: true, originalRByteIdentical: false, originalRDiffers: true,
    reviewDifference: "ORIGINAL_3000_LOW_TO_EXPLICIT_DIAGNOSTIC_CONTRACT_6000_MEDIUM",
    originalOutputsPreserved: true, originalConfiguredLatencyMs: LATENCY_MS, originalLatencyMeasured: false,
    actualModelOutput: false, full500Accepted: false, independentFinalAcceptance: false, executionAuthority: false, production: false });
  return Object.freeze({ schema: VERSION, sourceIndex: 499, diagnosticUnit: 0, phases, proof });
}
module.exports = Object.freeze({ VERSION, PROOF_VERSION, ORIGINAL_INPUTS, LATENCY_MS, derive });
