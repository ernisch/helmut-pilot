"use strict";

// Private original bytes are provenance only. This module never installs or
// executes the historical command, and never turns its consumed GO into a new GO.
const crypto = require("node:crypto");
const path = require("node:path");
const { isDeepStrictEqual } = require("node:util");
const P = require("./synthetik-500-profile");
const C = require("./synthetik-500-production-command");
const Codec = require("./synthetik-500-direct-codec");
const Preparation = require("./synthetik-500-unit-diagnostic-contract");
const Diagnostic = require("./local-unit-diagnostic-authority");
const handles = new WeakMap();
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const need = (ok, code) => { if (!ok) throw Error("local-unit-diagnostic-source-" + code); };
function immutable(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(immutable); Object.freeze(value);
  }
  return value;
}
function data(handle) { const value = handles.get(handle); need(value, "opaque-handle-required"); return value; }
function diagnosticReview(source) {
  const original = source.maxOutputTokens === 3000 && source.reviewRule?.reasoningEffort === "low";
  const current = source.maxOutputTokens === Diagnostic.LIMITS.maxOutputTokens.R && source.reviewRule?.reasoningEffort === "medium";
  need((original || current) && C.exact(source.reviewRule, ["version", "reasoningEffort"])
    && source.reviewRule.version === "helmut-synthetik500-review-body/1", "source-review-rule");
  return { ...source, maxOutputTokens: Diagnostic.LIMITS.maxOutputTokens.R,
    reviewRule: { version: source.reviewRule.version, reasoningEffort: "medium" } };
}

function extractPinnedSource(args) {
  const preparation = Preparation.inspectPinnedPacket(args);
  // Unlike the inert inspection, the real codec verifies the complete expanded
  // byte hash. Only the selected context is retained by this consumer.
  const envelope = JSON.parse(args.packetBytes.toString("utf8")), decoded = Codec.decode(envelope);
  const command = decoded?.command, draft = command?.drafts?.[499], unit = command?.units?.[499];
  need(command?.version === C.DIRECT_VERSION && command.mode === "D-R-500"
    && command.drafts.length === 500 && command.units.length === 500
    && command.slot?.plan?.operationId === preparation.sourceOperationId
    && command.slot.plan.intents.length === 1000, "historical-shape");
  need(C.exact(draft, ["intentId", "profile", "descriptor", "briefingEingabe", "briefingDatum", "sources"])
    && C.exact(unit, ["kind", "subject", "intentIds"]) && unit.kind === "DR"
    && unit.subject === draft.profile?.id && unit.intentIds.length === 2
    && unit.intentIds[0] === draft.intentId && unit.intentIds[0] !== unit.intentIds[1], "selected-unit");
  const intents = unit.intentIds.map(id => command.slot.plan.intents.find(x => x.id === id));
  need(intents[0]?.phase === "D" && intents[1]?.phase === "R"
    && intents.every(x => x.owner === unit.subject && x.attemptLimit === 1)
    && intents[1].dependsOn === intents[0].id
    && intents[0].inputVersionHash === P.hash(draft.descriptor)
    && intents[1].contextVersionHash === intents[0].inputVersionHash, "selected-intents");
  C.validateSources(draft.sources);
  need(C.utc(draft.briefingDatum) && draft.briefingDatum.slice(0, 10) === preparation.sourceDay
    && draft.briefingEingabe?.version === 1 && draft.briefingEingabe.eingabe?.tag === preparation.sourceDay
    && draft.descriptor?.owner === unit.subject
    && C.same(draft.descriptor.context, { profileVersionHash: P.hash(draft.profile),
      briefingEingabeHash: P.hash(draft.briefingEingabe), briefingDatum: draft.briefingDatum }), "selected-context");
  require("./briefing-lagebindung").pruefe(draft.briefingEingabe, draft.profile, unit.subject,
    new Date(draft.briefingDatum), { acceptedSnapshot: true });
  need(C.originalSourcesMatch(draft.briefingEingabe,
    new Map(draft.sources.documents.map(row => [row.id, row])),
    new Map(draft.sources.knowledgeObjects.map(row => [row.id, row]))), "selected-original-sources");
  const selected = { sourceIndex: 499, diagnosticUnit: 0, sourceOperationId: preparation.sourceOperationId,
    sourceDay: preparation.sourceDay, sourceViewAtUTC: draft.briefingDatum, draft, unit, intents };
  const selectedBytes = Buffer.from(JSON.stringify(selected));
  const diagnosticR = diagnosticReview(intents[1]);
  need(selectedBytes.length > 0 && selectedBytes.length <= 16 * 1024 * 1024, "selected-size");
  const selection = immutable(JSON.parse(selectedBytes.toString("utf8")));
  const source = immutable({ sourceIndex: 499, diagnosticUnit: 0, sourceDay: preparation.sourceDay,
    sourceOperationId: preparation.sourceOperationId, packetPin: preparation.sourcePacketPin,
    installPin: preparation.sourceInstallPin,
    terminalPin: { ...preparation.terminalPin, path: path.resolve(__dirname, "../..", preparation.terminalPin.path) },
    selectionBindingSHA256: preparation.sourceSelectionBindingSHA256,
    expandedSHA256: envelope.sha256, draftSHA256: P.hash(draft) });
  const binding = immutable({ schema: "helmut-local-unit-diagnostic-source-binding/1", preparation,
    sourceIndex: 499, diagnosticUnit: 0, sourceOperationId: preparation.sourceOperationId,
    sourceDay: preparation.sourceDay, sourceViewAtUTC: draft.briefingDatum,
    selectionSHA256: sha(selectedBytes), draftSHA256: P.hash(draft),
    sourceDIntentSHA256: P.hash(intents[0]), sourceRIntentSHA256: P.hash(intents[1]),
    reviewConfiguration: { source: { maxOutputTokens: intents[1].maxOutputTokens, reviewRule: intents[1].reviewRule },
      diagnostic: { maxOutputTokens: diagnosticR.maxOutputTokens, reviewRule: diagnosticR.reviewRule },
      sourceIntentUnmodified: true, historicalRequestReplay: false },
    expandedSHA256: envelope.sha256, expandedSHA256Verified: true, fullCommandValidated: false, executionAuthority: false,
    production: false, paidProviderCallsAllowed: false });
  const handle = Object.freeze({}); handles.set(handle, { binding, selection, source }); return handle;
}
function sourceBinding(handle) { return data(handle).binding; }
function readSelection(handle) { return data(handle).selection; }
function commandSource(handle) { return data(handle).source; }
function diagnosticIntents(handle, runId) {
  need(/^nachlauf500-[0-9]{5,20}$/.test(runId || ""), "own-run-id");
  const [d, originalR] = structuredClone(data(handle).selection.intents), r = diagnosticReview(originalR);
  const admission = require("./synthetik-500-kosten-admission");
  d.id = admission.intentHash(runId, d); r.dependsOn = d.id; r.id = admission.intentHash(runId, r);
  need(!data(handle).selection.unit.intentIds.some(id => id === d.id || id === r.id), "own-intent-id");
  return [d, r];
}
function verifyCommandSource(command, handle) {
  const { binding, selection, source } = data(handle), draft = command?.drafts?.[0], unit = command?.units?.[0];
  need(command?.version === "helmut-local-unit-diagnostic-command/1" && command.mode === "D-R-1-local-fixture"
    && command?.drafts?.length === 1 && command?.units?.length === 1 && unit?.kind === "DR"
    && unit.subject === selection.unit.subject && unit.intentIds?.length === 2
    && draft.intentId === unit.intentIds[0] && unit.intentIds.every(id => !selection.unit.intentIds.includes(id)), "own-unit-required");
  const { intentId: oldId, ...sourceDraft } = selection.draft, { intentId: newId, ...ownDraft } = draft;
  need(isDeepStrictEqual(ownDraft, sourceDraft), "draft-drift");
  const intents = command.slot?.plan?.intents;
  need(Array.isArray(intents) && intents.length === 2, "own-two-intents-required");
  const strip = x => { const { id, dependsOn, ...rest } = x; return rest; };
  need(intents[0]?.id === unit.intentIds[0] && intents[1]?.id === unit.intentIds[1]
    && intents[1].dependsOn === intents[0].id
    && isDeepStrictEqual(strip(intents[0]), strip(selection.intents[0]))
    && isDeepStrictEqual(strip(intents[1]), strip(diagnosticReview(selection.intents[1]))), "intent-context-drift");
  need(isDeepStrictEqual(command.source, source)
    && command.calendar?.sourceDay === selection.sourceDay
    && command.calendar?.sourceViewAtUTC === selection.sourceViewAtUTC, "binding-drift");
  return binding;
}

module.exports = Object.freeze({ extractPinnedSource, sourceBinding, commandSource, readSelection, diagnosticIntents, verifyCommandSource });
