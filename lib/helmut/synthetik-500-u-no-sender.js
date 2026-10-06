"use strict";
// Structural checks are not a no-send proof. Root must independently qualify
// the private primaries; the native installer must enforce the current CAS.
const P = require("./synthetik-500-profile");
const VERSION = "helmut-synthetik500-qualified-no-sender-proof/1";
const BASE_KEYS = ["operationId", "commandHash", "planHash", "journalHash"];
const QUAL_KEYS = [...BASE_KEYS, "qualification", "noSenderProofHash"];
const ORIGINAL_ROLES = ["scope", "native", "packet", "installed", "runtime", "qualification", "reader", "adapter"];
const exact = (x, keys) => x && typeof x === "object" && !Array.isArray(x)
  && Object.keys(x).sort().join("|") === [...keys].sort().join("|");
const sha = x => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const need = (ok, code) => { if (!ok) throw Error("synthetik500-no-sender-" + code); };
function bindings(command) { return (command.predecessors || []).filter(x => x.qualification === "no-sender"); }
function validBinding(x) {
  return exact(x, QUAL_KEYS) && x.qualification === "no-sender" && typeof x.operationId === "string"
    && [x.commandHash, x.planHash, x.journalHash, x.noSenderProofHash].every(sha);
}
function qualified(old, command) {
  const xs = bindings(command);
  if (xs.length !== 1) return false;
  const x = xs[0];
  return Boolean(validBinding(x) && old?.operationId === x.operationId && old.commandHash === x.commandHash
    && old.planHash === x.planHash && P.hash(old) === x.journalHash
    && old.state === "unknown" && old.stopRequested === true && old.index === 0
    && old.terminalReason === "unit-not-confirmed" && typeof old.claimId === "string" && old.claimId.length > 0
    && !Object.hasOwn(old, "closedSlot") && exact(old.attempts, []) && exact(old.outputs, [])
    && Array.isArray(old.units) && old.units.length === 1 && old.units[0].kind === "U"
    && old.units[0].entered === true && typeof old.units[0].subject === "string" && old.units[0].subject.length > 0
    && Array.isArray(old.units[0].intentIds) && old.units[0].intentIds.length === 1
    && typeof old.units[0].intentIds[0] === "string" && old.units[0].intentIds[0].length > 0
    && exact(old.inFlight, ["index", "intentIds"]) && old.inFlight.index === 0
    && P.hash(old.inFlight.intentIds) === P.hash(old.units[0].intentIds));
}
function validateProof(proof, command) {
  const xs = bindings(command); need(xs.length === 1 && validBinding(xs[0]), "one-binding-required");
  const x = xs[0], predecessor = Object.fromEntries(BASE_KEYS.map(k => [k, x[k]]));
  need(exact(proof, ["version", "predecessor", "originalJournal", "providerCalls", "productionCommit", "primaryEvidencePins", "originalEvidencePins"])
    && proof.version === VERSION && exact(proof.predecessor, BASE_KEYS)
    && P.hash(proof.predecessor) === P.hash(predecessor) && qualified(proof.originalJournal, command)
    && proof.providerCalls === 0 && typeof proof.productionCommit === "string"
    && /^[a-f0-9]{40}$/.test(proof.productionCommit) && Array.isArray(proof.primaryEvidencePins)
    && proof.primaryEvidencePins.length >= 3 && proof.primaryEvidencePins.length <= 16
    && exact(proof.originalEvidencePins, ORIGINAL_ROLES)
    && Object.values(proof.originalEvidencePins).every(pin => proof.primaryEvidencePins.some(p => P.hash(p) === P.hash(pin))), "private-qualified-proof");
  return proof;
}
function validateOriginalEvidence(proof, bytes) {
  const json = role => JSON.parse(bytes[role].toString("utf8"));
  const scope = json("scope"), native = json("native"), packet = json("packet"), installed = json("installed"), q = json("qualification");
  const selector = JSON.parse(scope.body), x = proof.predecessor, old = proof.originalJournal, plan = packet.command.slot.plan;
  need(scope.method === "POST" && scope.path === "/api/cron/testnachweis-status?modus=synthetik500-u-vorlauf"
    && scope.retry === false && scope.actual500 === false && scope.profilesActive === 0
    && selector.operationId === x.operationId && selector.commandHash === x.commandHash
    && P.hash(packet.command) === x.commandHash && packet.command.slot.planHash === x.planHash
    && packet.command.mode === "U-prestage" && packet.command.units.length === 1
    && packet.command.units[0].subject === old.units[0].subject && scope.commit === proof.productionCommit
    && plan.productionCommit === proof.productionCommit && native.slot.plan.productionCommit === proof.productionCommit
    && native.slot.planHash === x.planHash && native.slot.plan.runId === plan.runId, "original-scope-plan-commit");
  need(native.operationId === x.operationId && P.hash(native.journal) === P.hash(old)
    && native.selectedUsageBlob?.length === 0 && native.selectedUsageRelational?.length === 0
    && exact(native.ownTicketSummary, ["cost", "status", "reserved", "admission", "createdAt", "maxOutputTokens"])
    && Object.values(native.ownTicketSummary).every(v => v === null) && native.activeProfiles === 0
    && native.ownEvidenceCount === 1 && native.ownEvidence?.operationId === x.operationId
    && native.ownEvidence.commandHash === x.commandHash && native.ownEvidence.index === 0
    && native.ownEvidence.result === null && native.ownEvidence.postimage === null
    && native.ownEvidence.failure === "unit-not-confirmed", "original-native-zero-ticket-usage");
  need(installed.operationId === x.operationId && installed.commandHash === x.commandHash
    && ["packetExact", "slotExact", "journalExact", "exactOwnAuditRow", "oldFullParentRowsAndXminsUnchanged",
      "todayUsageNativeHashUnchanged", "todayCounterNativeHashUnchanged"].every(k => installed[k] === true), "original-native-install");
  const sdk = json("runtime"), deployment = JSON.parse(sdk.content.find(c => c.type === "text").text).result.deployment;
  need(!sdk.isError && deployment.state === "READY" && deployment.meta.githubCommitSha === proof.productionCommit
    && deployment.url === scope.host && deployment.id === plan.routeContract.route.deploymentId, "original-ready-runtime");
  need(q.status === "QUALIFIED_ZERO_PROVIDER_SENDERS_NOT_YET_NATIVE_RECONCILED" && q.actualProviderCalls === 0
    && q.actualHTTPAttemptsToHelmut === 1 && q.independentReview?.status === "ok"
    && q.originalProductionCommit === proof.productionCommit && P.hash(q.originalJournal) === P.hash(old)
    && q.operationId === x.operationId && q.commandHash === x.commandHash && q.planHash === x.planHash,
  "independent-original-qualification");
  const reader = bytes.reader.toString("utf8"), adapter = bytes.adapter.toString("utf8"), start = adapter.indexOf("async function executeUnits");
  const execute = adapter.slice(start), before = execute.indexOf("await guard(command, claimId, index);");
  const ids = packet.command.understanding[0].sources.knowledgeObjects.map(k => k.id);
  need(reader.startsWith("async function readSynthetik500CurrentInputs(expected)")
    && reader.includes("!/^[A-Za-z0-9_-]{1,200}$/.test(id)") && ids.some(id => !/^[A-Za-z0-9_-]{1,200}$/.test(id))
    && start >= 0 && before >= 0 && before < execute.indexOf(".understandOneCluster(")
    && adapter.includes("await storage.readSynthetik500CurrentInputs(input.sources);"), "original-deterministic-pre-understanding-stop");
}
module.exports = { VERSION, BASE_KEYS, QUAL_KEYS, ORIGINAL_ROLES, bindings, validBinding, qualified, validateProof, validateOriginalEvidence };
