"use strict";

// Exact accepted SQL ABI. io is supplied by storage's closed service transport;
// no web route or mutable/local-history fallback is provided.
const P = require("./synthetik-500-profile");
const R = require("./synthetik-500-review-receipt");
const C = require("./synthetik-500-production-command");
const J = require("./synthetik-500-dispatch-journal");
const requireThat = C.requireThat;
function canonical(x, cap) {
  require("./knowledge-object-version").jsonValue(x);
  const s = P.kanonisch(x);
  requireThat(Buffer.byteLength(s, "utf8") <= cap, "native-D-blob-cap");
  return s;
}
async function context(io) {
  const auth = await io.auth(), j = J.current(auth);
  requireThat(j?.state === "running" && !j.stopRequested, "native-D-no-claim");
  const packet = await io.command(j.operationId, j.commandHash);
  C.admission(packet.command, packet.admission, new Date().toISOString());
  requireThat(packet.command.mode === "D-R-500" && packet.command.native?.abiHash === C.ABI_HASH
    && auth.synthetik500KostenAdmission?.planHash === packet.command.slot.planHash, "native-D-no-actual-contract");
  return { auth, j, native: packet.command.native };
}
async function contract(io) {
  const { native } = await context(io);
  const result = await io.rpc(C.NATIVE_ABI.contract.name, { p_expected_contract_hash: native.contractHash });
  requireThat(C.exact(result, ["version", "contractHash"]) && result.version === R.STORAGE_VERSION
    && result.contractHash === native.contractHash, "native-D-contract-drift");
  return result;
}
async function store(io, entry, completion, expectedHash) {
  const { auth, j, native } = await context(io), slot = auth.synthetik500KostenAdmission;
  requireThat(expectedHash === native.contractHash, "native-D-contract-hash");
  R.validateCompletion(completion, slot);
  const d = slot.plan.intents.find(x => x.id === completion.dIntentId), attempt = j.attempts[d.id];
  const call = auth.testKostenTage?.[completion.dTicket.day]?.calls?.[completion.dTicket.id];
  const usage = (auth.llmUsage || []).filter(x => x.id === completion.usageReceipt.id);
  requireThat(j.inFlight?.intentIds.includes(d.id) && attempt?.status === "accounted"
    && attempt.ticketId === completion.dTicket.id && call?.status === "abgerechnet" && call.cost === completion.costMicroUsd
    && usage.length === 1 && P.hash(usage[0]) === completion.usageReceipt.recordHash
    && entry.user_id === completion.owner && entry.payload?.runId === completion.runId
    && P.hash(entry.payload?.antwort) === completion.outputHash
    && P.hash(entry.payload?.quellen) === completion.sourceContext.sourcesHash
    && entry.payload?.profilHash === completion.sourceContext.profileHash, "native-D-completion-provenance");
  const { completionHash, ...preimage } = completion;
  requireThat(P.hash(preimage) === completionHash, "native-D-completion-preimage");
  const versionHash = P.hash(entry);
  const result = await io.rpc(C.NATIVE_ABI.store.name, {
    p_owner: completion.owner, p_id: entry.id, p_version_hash: versionHash,
    p_entry_canonical: canonical(entry, 524288), p_completion_preimage: canonical(preimage, 8192),
    p_output_canonical: canonical(entry.payload.antwort, 131072), p_sources_canonical: canonical(entry.payload.quellen, 131072),
    p_usage_canonical: canonical(usage[0], 16384), p_expected_contract_hash: expectedHash });
  requireThat(C.exact(result, ["id", "versionHash", "contractHash"]) && result.id === entry.id
    && result.versionHash === versionHash && result.contractHash === expectedHash, "native-D-store-unknown");
  return result;
}
async function read(io, owner, id, versionHash, expectedHash) {
  const { j, native } = await context(io);
  requireThat(expectedHash === native.contractHash && j.units[j.index]?.subject === owner
    && typeof id === "string" && /^[a-f0-9]{64}$/.test(versionHash), "native-D-read-owner");
  const result = await io.rpc(C.NATIVE_ABI.read.name, {
    p_owner: owner, p_id: id, p_version_hash: versionHash, p_expected_contract_hash: expectedHash });
  requireThat(result?.id === id && result.user_id === owner && P.hash(result) === versionHash, "native-D-read-version");
  return result;
}
module.exports = { contract, store, read };
