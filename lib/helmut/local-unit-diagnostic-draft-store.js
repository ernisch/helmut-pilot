"use strict";

// Actual own native artifacts only. No legacy io/auth projection, upsert,
// retry, caller writer or externally supplied storage implementation.
const Scope = require("./local-unit-diagnostic-scope");
const A = require("./local-unit-diagnostic-authority");
const P = require("./synthetik-500-profile");
const R = require("./synthetik-500-review-receipt");
const VERSION = "helmut-local-unit-diagnostic-insert-readback-D-storage/1";
const CONTRACT_HASH = P.hash({ version: VERSION, storage: "local-unit-diagnostic-native-artifacts-v1",
  write: "insert-once", read: "scope-owner-run-entry-completion-usage-hashes", nativeImmutableRetention: false });
async function context() {
  const scope = Scope.currentVerified(); A.need(scope, "D-store-scope");
  const storage = require("./storage");
  for (const method of ["assertLocalUnitDiagnosticArtifactContract", "insertLocalUnitDiagnosticArtifact", "readLocalUnitDiagnosticArtifact"])
    A.need(typeof storage[method] === "function", "D-native-store-consumer-missing");
  await Scope.verifyRuntime(); await storage.assertLocalUnitDiagnosticArtifactContract();
  const state = await Scope.readState(); Scope.guard(state);
  return { ...Scope.authority(state), selection: scope.selection, storage };
}
async function contract() { await context(); return { version: VERSION, contractHash: CONTRACT_HASH }; }
function validate(record, own) {
  A.need(A.exact(record, ["version", "contractHash", "entry", "completion", "usage"])
    && record.version === VERSION && record.contractHash === CONTRACT_HASH, "D-store-record");
  const { entry, completion, usage } = record;
  R.validateCompletion(completion, own.slot);
  const d = own.slot.plan.intents[0], call = own.costs.calls[completion.dTicket.id];
  A.need(own.journal.attempts.D?.status === "accounted" && own.journal.attempts.D.ticketId === completion.dTicket.id
    && call?.status === "accounted" && call.cost === completion.costMicroUsd && call.usageReceiptHash === completion.usageReceipt.recordHash
    && call.ticket.admission.intentId === d.id && call.ticket.admission.planHash === own.slot.planHash
    && completion.dIntentId === d.id && completion.owner === d.owner
    && P.hash(own.slot.draftCompletions[d.id]) === P.hash(completion)
    && P.hash(usage) === completion.usageReceipt.recordHash && usage.id === completion.usageReceipt.id
    && usage.scopeHash === own.record.commandHash && usage.budgetTicketId === completion.dTicket.id
    && usage.costBasis === "local-fixture-simulation-not-provider-charge"
    && entry?.user_id === d.owner && entry.slot === "lage-pruefentwurf"
    && entry.payload?.phase === "entwurf" && entry.payload.auslieferbar === false && entry.payload.qualitaetBestanden === false
    && entry.payload.runId === own.slot.plan.runId && entry.payload.tag === own.costs.day
    && P.hash(entry.payload.antwort) === completion.outputHash && P.hash(entry.payload.quellen) === completion.sourceContext.sourcesHash
    && entry.payload.profilHash === completion.sourceContext.profileHash, "D-store-provenance");
}
async function store(_io, entry, completion, expectedHash) {
  const own = await context(); A.need(expectedHash === CONTRACT_HASH, "D-store-contract");
  const usage = await own.storage.readLocalUnitDiagnosticArtifact(own.selection, "usage-D", completion.dTicket.id,
    completion.usageReceipt.recordHash);
  const record = { version: VERSION, contractHash: CONTRACT_HASH, entry, completion, usage };
  validate(record, own);
  await own.storage.insertLocalUnitDiagnosticArtifact(own.selection, "immutable-D", completion.dIntentId, record, P.hash(entry));
  const back = await own.storage.readLocalUnitDiagnosticArtifact(own.selection, "immutable-D", completion.dIntentId, P.hash(record));
  A.need(P.hash(back) === P.hash(record), "D-store-readback-unknown");
  return { id: entry.id, versionHash: P.hash(entry), contractHash: CONTRACT_HASH };
}
async function read(_io, owner, id, versionHash, expectedHash) {
  const own = await context(), d = own.slot.plan.intents[0];
  A.need(expectedHash === CONTRACT_HASH && owner === d.owner, "D-read-owner-contract");
  const record = await own.storage.readLocalUnitDiagnosticArtifact(own.selection, "immutable-D", d.id);
  validate(record, own);
  A.need(record.entry.id === id && P.hash(record.entry) === versionHash, "D-read-version");
  return record.entry;
}
module.exports = Object.freeze({ VERSION, CONTRACT_HASH, contract, store, read });
