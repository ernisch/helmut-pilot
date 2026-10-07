"use strict";

// Existing private INSERT/readback evidence. No native catalog/retention claim,
// overwrite, retry or provider. Only the installed direct command selects it.
const P = require("./synthetik-500-profile");
const C = require("./synthetik-500-production-command");
const J = require("./synthetik-500-dispatch-journal");
const R = require("./synthetik-500-review-receipt");
const VERSION = "helmut-synthetik500-insert-readback-D-storage/1";
const CONTRACT_HASH = P.hash({ version: VERSION, storage: "private-helmut-store", write: "insert-once",
  read: "owner-run-entry-completion-usage-hashes", nativeImmutableRetention: false });
async function context(io) {
  const auth = await io.auth(), j = J.current(auth);
  C.requireThat(j?.state === "running" && !j.stopRequested, "direct-D-no-claim");
  const packet = await io.command(j.operationId, j.commandHash);
  C.admission(packet.command, packet.admission, new Date().toISOString());
  C.requireThat(C.isDirect(packet.command) && packet.command.native === null
    && auth.synthetik500KostenAdmission?.planHash === packet.command.slot.planHash, "direct-D-contract-required");
  J.bind(auth, j.commandHash, j.claimId, new Date().toISOString());
  return { auth, j };
}
async function contract(io) {
  await context(io);
  return { version: VERSION, contractHash: CONTRACT_HASH };
}
async function store(io, entry, completion, expectedHash) {
  const { auth, j } = await context(io), slot = auth.synthetik500KostenAdmission;
  C.requireThat(expectedHash === CONTRACT_HASH, "direct-D-contract-drift");
  R.validateCompletion(completion, slot);
  const d = slot.plan.intents.find(x => x.id === completion.dIntentId), a = j.attempts[d.id];
  const call = auth.testKostenTage?.[completion.dTicket.day]?.calls?.[completion.dTicket.id];
  const usage = (auth.llmUsage || []).filter(x => x.id === completion.usageReceipt.id);
  C.requireThat(j.units[j.index]?.subject === completion.owner && j.inFlight?.intentIds.includes(d.id)
    && a?.status === "accounted" && a.ticketId === completion.dTicket.id && a.day === completion.dTicket.day
    && call?.status === "abgerechnet" && call.cost === completion.costMicroUsd
    && call.admission?.intentId === d.id && call.admission.planHash === slot.planHash
    && usage.length === 1 && P.hash(usage[0]) === completion.usageReceipt.recordHash
    && entry.user_id === completion.owner && entry.slot === "lage-pruefentwurf"
    && entry.payload?.phase === "entwurf" && entry.payload.auslieferbar === false
    && entry.payload.qualitaetBestanden === false && entry.payload.runId === completion.runId
    && P.hash(entry.payload.antwort) === completion.outputHash
    && P.hash(entry.payload.quellen) === completion.sourceContext.sourcesHash
    && entry.payload.profilHash === completion.sourceContext.profileHash, "direct-D-provenance");
  const record = { version: VERSION, contractHash: CONTRACT_HASH, entry, completion, usage: usage[0] };
  await io.insert(j.operationId, completion.dIntentId, record);
  const back = await io.read(j.operationId, completion.dIntentId);
  C.requireThat(C.same(back, record), "direct-D-insert-readback-unknown");
  return { id: entry.id, versionHash: P.hash(entry), contractHash: CONTRACT_HASH };
}
async function read(io, owner, id, versionHash, expectedHash) {
  const { auth, j } = await context(io), slot = auth.synthetik500KostenAdmission;
  const d = slot.plan.intents.find(x => x.phase === "D" && x.owner === owner);
  C.requireThat(expectedHash === CONTRACT_HASH && j.units[j.index]?.subject === owner && d
    && j.inFlight?.intentIds.includes(d.id), "direct-D-read-owner");
  const record = await io.read(j.operationId, d.id);
  C.requireThat(C.exact(record, ["version", "contractHash", "entry", "completion", "usage"])
    && record.version === VERSION && record.contractHash === CONTRACT_HASH, "direct-D-read-contract");
  R.validateCompletion(record.completion, slot);
  C.requireThat(record.entry?.id === id && record.entry.user_id === owner && P.hash(record.entry) === versionHash
    && record.completion.owner === owner && record.completion.dIntentId === d.id
    && P.hash(record.entry.payload?.antwort) === record.completion.outputHash
    && record.entry.payload?.profilHash === record.completion.sourceContext.profileHash
    && P.hash(record.entry.payload?.quellen) === record.completion.sourceContext.sourcesHash
    && P.hash(record.usage) === record.completion.usageReceipt.recordHash, "direct-D-read-version");
  return record.entry;
}
module.exports = { VERSION, CONTRACT_HASH, contract, store, read };
