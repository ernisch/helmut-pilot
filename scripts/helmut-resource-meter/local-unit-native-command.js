"use strict";

// Pure proposal construction for the native owner. Input pins and caller-
// supplied grant identity remain unqualified metadata here. Only the separate
// native owner may verify them, persist the new namespace and admit execution.
const crypto = require("node:crypto");
const P = require("../../lib/helmut/synthetik-500-profile");
const A = require("../../lib/helmut/local-unit-diagnostic-authority");
const Source = require("../../lib/helmut/local-unit-diagnostic-source");
const Producer = require("../../lib/helmut/local-unit-diagnostic-original-producer");
const Admission = require("../../lib/helmut/synthetik-500-kosten-admission");
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const need = (ok, code) => { if (!ok) throw Error("local-unit-native-command-" + code); };
const copy = x => structuredClone(x);
const utc = value => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function requestPins(result, selected, sourceBinding, intents) {
  need(A.exact(result, ["schema", "sourceIndex", "diagnosticUnit", "phases", "proof"])
    && result.schema === Producer.VERSION && result.sourceIndex === 499 && result.diagnosticUnit === 0
    && A.exact(result.phases, ["D", "R"]), "producer-result");
  const proof = result.proof, override = proof?.diagnosticReviewOverride;
  need(proof?.schema === Producer.PROOF_VERSION && proof.sourceIndex === 499 && proof.diagnosticUnit === 0
    && proof.sourceOperationId === selected.sourceOperationId && proof.sourceSelectionSHA256 === sourceBinding.selectionSHA256
    && proof.sourceDraftSHA256 === P.hash(selected.draft) && proof.sourceProfileSHA256 === P.hash(selected.draft.profile)
    && proof.sourceBindingsSHA256 === P.hash(selected.draft.sources)
    && proof.sourceIntentIds?.D === selected.intents[0].id && proof.sourceIntentIds?.R === selected.intents[1].id
    && proof.sourceIntentSHA256?.D === P.hash(selected.intents[0]) && proof.sourceIntentSHA256?.R === P.hash(selected.intents[1])
    && P.hash(proof.originalInputs) === P.hash(Producer.ORIGINAL_INPUTS)
    && proof.originalDByteIdentical === true && proof.originalRByteIdentical === false && proof.originalRDiffers === true
    && proof.originalOutputsPreserved === true && proof.actualModelOutput === false && proof.executionAuthority === false
    && proof.full500Accepted === false && proof.production === false, "producer-source-binding");
  need(override?.schema === "helmut-local-unit-diagnostic-review-override/1" && override.sourceIntentModified === false
    && override.sourceIntentSHA256 === P.hash(selected.intents[1])
    && P.hash(override.originalRule) === P.hash({ maxOutputTokens: selected.intents[1].maxOutputTokens, reviewRule: selected.intents[1].reviewRule })
    && P.hash(override.diagnosticRule) === P.hash({ maxOutputTokens: intents[1].maxOutputTokens, reviewRule: intents[1].reviewRule })
    && override.basis?.commandVersion === A.VERSION && override.basis.limitsSHA256 === P.hash(A.LIMITS)
    && override.basis.sourceViewAtUTC === selected.sourceViewAtUTC, "producer-review-override");
  const pins = {};
  for (const [index, phase] of ["D", "R"].entries()) {
    const value = result.phases[phase], expected = proof.diagnosticRequests?.[phase];
    need(A.exact(value, ["requestBytes", "responseBytes", "latencyBytes", "responseStatus", "latencyMs"])
      && Buffer.isBuffer(value.requestBytes) && value.requestBytes.length > 0 && value.requestBytes.length <= 16 * 1024 * 1024
      && Buffer.isBuffer(value.responseBytes) && Buffer.isBuffer(value.latencyBytes)
      && value.responseStatus === 200 && value.latencyMs === Producer.LATENCY_MS, "producer-phase");
    const bytes = value.requestBytes, text = bytes.toString("utf8");
    need(Buffer.from(text, "utf8").equals(bytes), "request-utf8");
    let body; try { body = JSON.parse(text); } catch { need(false, "request-json"); }
    const reasoningEffort = index === 0 ? "low" : intents[index].reviewRule.reasoningEffort;
    pins[phase] = { bytes: bytes.length, sha256: sha(bytes) };
    const actualRequestHash = Admission.requestHash(text);
    need(body?.model === "gpt-5-mini-eu" && body.max_output_tokens === intents[index].maxOutputTokens
      && body.reasoning?.effort === reasoningEffort && expected?.bytes === pins[phase].bytes
      && expected.sha256 === pins[phase].sha256 && expected.actualRequestHash === actualRequestHash
      && expected.maxOutputTokens === intents[index].maxOutputTokens && expected.reasoningEffort === reasoningEffort,
    "request-intent-producer-binding");
    if (phase === "D") need(actualRequestHash === intents[0].actualRequestHash
      && proof.originalRequests?.D?.sha256 === pins.D.sha256, "original-D-request");
    else need(override.diagnosticRequestSHA256 === pins.R.sha256
      && override.originalRequestSHA256 === proof.originalRequests?.R?.sha256
      && override.originalRequestSHA256 !== pins.R.sha256, "explicit-R-request-override");
  }
  return pins;
}

// nowUTC is supplied by the native owner's fresh observation. This pure helper
// validates its window relationship; it never reads or replaces a real clock.
function build(args) {
  need(A.exact(args, ["sourceHandle", "producerResult", "nonce", "runId", "nowUTC", "window", "target", "gatePins",
    "codeCommit", "runtimeManifestPin", "authPin", "freshGrantId"]), "arguments");
  need(typeof args.nonce === "string" && /^[a-f0-9]{32}$/.test(args.nonce)
    && typeof args.runId === "string" && /^nachlauf500-[0-9]{5,20}$/.test(args.runId)
    && typeof args.codeCommit === "string" && /^[a-f0-9]{40}$/.test(args.codeCommit)
    && typeof args.freshGrantId === "string" && /^[a-f0-9]{64}$/.test(args.freshGrantId), "own-identities");
  need(A.exact(args.window, ["startsAtUTC", "endsAtUTC"]) && utc(args.nowUTC)
    && utc(args.window.startsAtUTC) && utc(args.window.endsAtUTC)
    && args.nowUTC.slice(0, 10) === args.window.startsAtUTC.slice(0, 10)
    && args.nowUTC.slice(0, 10) === args.window.endsAtUTC.slice(0, 10)
    && Date.parse(args.window.startsAtUTC) <= Date.parse(args.nowUTC)
    && Date.parse(args.nowUTC) < Date.parse(args.window.endsAtUTC)
    && Date.parse(args.window.endsAtUTC) - Date.parse(args.window.startsAtUTC) <= 9 * 3600000, "fresh-window");
  A.pin(args.runtimeManifestPin); A.pin(args.authPin);
  need(typeof Source.diagnosticIntents === "function", "source-diagnostic-intents-unavailable");
  const selected = Source.readSelection(args.sourceHandle), sourceBinding = Source.sourceBinding(args.sourceHandle);
  const source = copy(Source.commandSource(args.sourceHandle)), intents = Source.diagnosticIntents(args.sourceHandle, args.runId);
  need(selected.sourceIndex === 499 && selected.diagnosticUnit === 0 && Array.isArray(intents) && intents.length === 2, "one-source-unit");
  const calendar = { sourceDay: selected.sourceDay, sourceViewAtUTC: selected.sourceViewAtUTC,
    executionDayUTC: args.nowUTC.slice(0, 10), ...copy(args.window) };
  const plan = { version: A.PLAN_VERSION, operationId: "localUnitDiagnostic-" + args.nonce, runId: args.runId,
    productionCommit: args.codeCommit, runtimeManifestHash: args.runtimeManifestPin.sha256,
    startsAtUTC: calendar.startsAtUTC, endsAtUTC: calendar.endsAtUTC, intents };
  const command = { version: A.VERSION, mode: "D-R-1-local-fixture", source, calendar, target: copy(args.target), gatePins: copy(args.gatePins),
    requestPins: requestPins(args.producerResult, selected, sourceBinding, intents),
    drafts: [{ ...copy(selected.draft), intentId: intents[0].id }],
    units: [{ kind: "DR", subject: selected.unit.subject, intentIds: intents.map(i => i.id) }],
    slot: { version: A.SLOT_VERSION, plan, planHash: P.hash(plan), consumed: {}, draftCompletions: {}, reviewBindings: {}, reviewBindingsHash: P.hash({}) },
    limits: copy(A.LIMITS) };
  need(P.hash(Source.verifyCommandSource(command, args.sourceHandle)) === P.hash(sourceBinding), "source-verification");
  const admission = { version: "helmut-local-unit-diagnostic-admission/1", grantId: args.freshGrantId,
    commandHash: P.hash(command), bindingHash: P.hash({ source: command.source, calendar, target: command.target,
      gatePins: command.gatePins, requestPins: command.requestPins, code: plan.productionCommit, runtime: plan.runtimeManifestHash, limits: command.limits }),
    authorizedAtUTC: args.nowUTC, expiresAtUTC: calendar.endsAtUTC, authorizationPin: copy(args.authPin) };
  const selection = A.validateAdmission(command, admission, args.nowUTC), initialState = {};
  const installed = A.install(initialState, command, admission, args.nowUTC);
  need(P.hash(installed) === P.hash(selection)
    && Object.keys(initialState).sort().join("|") === [...Object.values(A.keys(selection.operationId)), A.GRANTS_KEY].sort().join("|"), "new-namespace-only");
  return freeze({ command, admission, initialState, selection, sourceBinding: copy(sourceBinding) });
}
module.exports = Object.freeze({ build });
