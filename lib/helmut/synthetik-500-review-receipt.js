"use strict";

// Interne Herkunftskette. Keine trusted:true-Option, kein Installer und kein RPC.
// Opaque In-Process-Belege ersetzen NICHT den noch fehlenden nativen,
// unveraenderlichen D-Versions-/Retentionvertrag (storage liefert derzeit null).
const crypto = require("node:crypto");
const P = require("./synthetik-500-profile");
const VERSION = "helmut-synthetik500-review-binding/1";
const COMPLETION_VERSION = "helmut-synthetik500-D-completion/1";
const RULE_VERSION = "helmut-synthetik500-review-body/1";
const STORAGE_VERSION = "helmut-synthetik500-immutable-D-storage/1";
const reviews = new WeakMap(), ticketReceipts = new Map();
const sha = x => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const exact = (x, keys) => x !== null && typeof x === "object" && !Array.isArray(x)
  && [Object.prototype, null].includes(Object.getPrototypeOf(x))
  && Object.keys(x).sort().join("|") === [...keys].sort().join("|");
const byteHash = s => crypto.createHash("sha256").update(s, "utf8").digest("hex");
function requireThat(ok, code) {
  if (ok) return;
  const e = new Error("synthetik500-admission-" + code);
  e.reason = e.message; e.code = "LLM_BUDGET_EXHAUSTED"; e.kiNichtGesendet = true; throw e;
}
function token(map, data) { const key = Object.freeze({}); map.set(key, structuredClone(data)); return key; }
function validRule(rule, tokens) {
  return exact(rule, ["version", "reasoningEffort"]) && rule.version === RULE_VERSION
    && ((tokens === 3000 && rule.reasoningEffort === "low") || (tokens === 6000 && rule.reasoningEffort === "medium"));
}
function validateCompletion(c, slot) {
  requireThat(exact(c, ["version", "planHash", "operationId", "runId", "dIntentId", "dTicket", "owner", "contextHash",
    "providerResponseHash", "providerTextHash", "outputHash", "sourceContext", "usageReceipt", "costMicroUsd", "completedAtUTC", "completionHash"])
    && c.version === COMPLETION_VERSION && c.planHash === slot.planHash && c.runId === slot.plan.runId
    && c.operationId === slot.plan.operationId && exact(c.dTicket, ["id", "day"])
    && typeof c.dTicket.id === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(c.dTicket.id)
    && /^\d{4}-\d{2}-\d{2}$/.test(c.dTicket.day) && exact(c.usageReceipt, ["id", "recordHash"])
    && typeof c.usageReceipt.id === "string" && c.usageReceipt.id.length > 0 && sha(c.usageReceipt.recordHash)
    && exact(c.sourceContext, ["profileHash", "sourcesHash"]) && Object.values(c.sourceContext).every(sha)
    && [c.providerResponseHash, c.providerTextHash, c.outputHash, c.contextHash].every(sha)
    && Number.isSafeInteger(c.costMicroUsd) && c.costMicroUsd >= 0
    && typeof c.completedAtUTC === "string" && new Date(c.completedAtUTC).toISOString() === c.completedAtUTC,
  "D-completion-binding");
  const { completionHash, ...base } = c, d = slot.plan.intents.find(x => x.id === c.dIntentId);
  requireThat(completionHash === P.hash(base) && d?.phase === "D" && d.owner === c.owner
    && d.inputVersionHash === c.contextHash && c.costMicroUsd <= 200000 + 4 * d.maxOutputTokens
    && c.completedAtUTC.slice(0, 10) === c.dTicket.day && c.dTicket.day === slot.plan.startsAtUTC.slice(0, 10), "D-completion-binding");
  return c;
}
function validateBinding(b, slot, r) {
  requireThat(exact(b, ["version", "dCompletionHash", "dIntentId", "storedD", "rule", "promptHash", "actualRequestHash", "bodySha256", "bindingHash"])
    && b.version === VERSION && b.dIntentId === r.dependsOn && validRule(b.rule, r.maxOutputTokens)
    && P.hash(b.rule) === P.hash(r.reviewRule) && [b.promptHash, b.actualRequestHash, b.bodySha256, b.bindingHash].every(sha)
    && exact(b.storedD, ["id", "owner", "runId", "versionHash", "outputHash", "contextHash", "profileHash", "sourcesHash", "storageContractHash"])
    && typeof b.storedD.id === "string" && b.storedD.id.length > 0 && b.storedD.owner === r.owner
    && b.storedD.runId === slot.plan.runId && b.storedD.contextHash === r.contextVersionHash
    && [b.storedD.versionHash, b.storedD.outputHash, b.storedD.contextHash, b.storedD.profileHash,
      b.storedD.sourcesHash, b.storedD.storageContractHash].every(sha), "R-binding-invalid");
  const c = validateCompletion(slot.draftCompletions[b.dIntentId], slot), { bindingHash, ...base } = b;
  requireThat(b.dCompletionHash === c.completionHash && b.storedD.outputHash === c.outputHash
    && b.storedD.profileHash === c.sourceContext.profileHash && b.storedD.sourcesHash === c.sourceContext.sourcesHash
    && bindingHash === P.hash(base), "R-parent-output-drift");
  return b;
}
async function prepareReview(raw, saveResult, { sources, profile, owner, runId, contextHash, rule, maxOutputTokens }) {
  const saved = require("./lage-entwurfsbeleg").readSynthetik500StoredDraftReceipt(saveResult);
  const completion = require("./ai").readSynthetik500DraftCompletion(raw);
  requireThat(saved && completion && saved.completion.completionHash === completion.completionHash
    && P.hash(raw) === completion.outputHash && owner === completion.owner && runId === completion.runId
    && contextHash === completion.contextHash && validRule(rule, maxOutputTokens), "D-save-receipt-forged");
  const storage = require("./storage"), contract = await storage.synthetik500ReviewStorageContract();
  requireThat(exact(contract, ["version", "contractHash"]) && contract.version === STORAGE_VERSION
    && sha(contract.contractHash), "review-storage-contract-unavailable");
  const entry = saved.entry, B = require("./briefing-speicher");
  requireThat(profile?.id === owner && entry.payload.profilHash === B.profilHash(profile)
    && P.hash(entry.payload.quellen) === P.hash(sources)
    && entry.payload.profilHash === completion.sourceContext.profileHash
    && P.hash(sources) === completion.sourceContext.sourcesHash, "D-source-profile-drift");
  // Nur serverselektierter, noch nicht installierter Immutable-History-Adapter.
  // Niemals Netzwerk im konfliktweise wiederholten Auth-CAS-Callback.
  const kept = await storage.storeSynthetik500ImmutableDraft(entry, completion, contract.contractHash);
  requireThat(exact(kept, ["id", "versionHash", "contractHash"]) && kept.id === entry.id
    && kept.versionHash === P.hash(entry) && kept.contractHash === contract.contractHash, "D-immutable-store-unknown");
  const frozen = await storage.getSynthetik500ImmutableDraft(owner, kept.id, kept.versionHash, contract.contractHash);
  requireThat(P.hash(frozen) === kept.versionHash && P.hash(frozen.payload?.antwort) === completion.outputHash,
    "D-stored-version-drift");
  const derived = require("./ai").prepareLageReviewInput(frozen.payload.antwort, sources, profile);
  const body = JSON.stringify({ model: "gpt-5-mini", input: derived.prompt, max_output_tokens: maxOutputTokens,
    reasoning: { effort: rule.reasoningEffort }, text: { format: { type: "json_schema", name: "knowledge_object",
      schema: require("./lage-textqualitaet").SCHEMA, strict: true } } });
  const base = { version: VERSION, dCompletionHash: completion.completionHash, dIntentId: completion.dIntentId,
    storedD: { id: entry.id, owner, runId, versionHash: kept.versionHash, outputHash: completion.outputHash,
      contextHash, profileHash: B.profilHash(profile), sourcesHash: P.hash(sources), storageContractHash: contract.contractHash },
    rule, promptHash: P.hash(derived.prompt), actualRequestHash: P.hash(JSON.parse(body)), bodySha256: byteHash(body) };
  return { receipt: token(reviews, { binding: { ...base, bindingHash: P.hash(base) }, body, reserved: null, stopped: false, sent: false }),
    prompt: derived.prompt, paragraphs: derived.paragraphs };
}
function reservation(auth, receipt, request, r) {
  const data = reviews.get(receipt), slot = auth.synthetik500KostenAdmission;
  requireThat(data && !data.stopped && data.reserved === null, "R-receipt-forged-or-used");
  const b = validateBinding(data.binding, slot, r), c = slot.draftCompletions[b.dIntentId];
  const ledger = auth.testKostenTage?.[c.dTicket.day]?.calls?.[c.dTicket.id];
  requireThat(ledger?.status === "abgerechnet" && ledger.cost === c.costMicroUsd
    && ledger.admission?.intentId === c.dIntentId && ledger.admission.planHash === slot.planHash,
  "D-cost-outcome-unknown");
  requireThat(request.actualRequestHash === b.actualRequestHash && request.inputVersionHash === r.contextVersionHash,
    "R-payload-drift");
  return structuredClone(b);
}
const ticketKey = ticket => P.hash({ day: ticket?.day, id: ticket?.id });
function reserved(receipt, ticket) {
  if (!receipt) return;
  const d = reviews.get(receipt); requireThat(d && !d.stopped && !d.reserved, "R-receipt-forged-or-used");
  d.reserved = structuredClone(ticket); ticketReceipts.set(ticketKey(ticket), new WeakRef(receipt));
}
function stop(receipt) { const d = reviews.get(receipt); if (d && d.reserved === null) d.stopped = true; }
function notSent(ticket) {
  const receipt = ticketReceipts.get(ticketKey(ticket))?.deref(), d = reviews.get(receipt);
  // Auch ein strukturgleicher Klon stoppt dieselbe Sendefreigabe. Unbekannte
  // R-Tickets/Prozesswechsel koennen die Reserve nicht vor einem anderen
  // noch lebenden Sender entlasten; kein freies Ticketobjekt ist Autoritaet.
  if (!d && ticket?.admission?.phase !== "R") return false;
  requireThat(d && P.hash(d.reserved) === P.hash(ticket), "R-not-sent-ticket-unbound");
  d.stopped = true; return true;
}
function sender(receipt, ticket, hash) {
  const d = reviews.get(receipt);
  requireThat(d && !d.stopped && !d.sent && d.reserved && P.hash(d.reserved) === P.hash(ticket)
    && d.binding.bindingHash === ticket.admission.reviewBindingHash && d.binding.actualRequestHash === hash, "R-sender-receipt-drift");
  d.sent = true; // Genau ein Senderversuch, auch bei anschließendem Nicht-Senden.
}
module.exports = { VERSION, COMPLETION_VERSION, RULE_VERSION, STORAGE_VERSION, validRule, validateCompletion, validateBinding,
  prepareReview, reservation, reserved, stop, notSent, sender };
