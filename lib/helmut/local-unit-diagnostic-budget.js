"use strict";

// Fixture simulation only. No EU ticket mint, legacy budget, Auth writer,
// caller storage injection or provider tariff authority is used here.
const Scope = require("./local-unit-diagnostic-scope");
const A = require("./local-unit-diagnostic-authority");
const P = require("./synthetik-500-profile");
const R = require("./synthetik-500-review-receipt");
const Cost = require("./synthetik-500-kosten-admission");
const sha = bytes => require("node:crypto").createHash("sha256").update(bytes).digest("hex");
function storage() {
  const s = require("./storage");
  A.need(typeof s.readLocalUnitDiagnosticUsageReceipt === "function"
    && typeof s.localUnitDiagnosticUsagePersisted === "function", "native-usage-consumer-missing");
  return s;
}
function active() { const c = Scope.currentVerified(); A.need(c, "budget-scope-required"); return c; }
function tokenCost(input, output) {
  A.need(Number.isSafeInteger(input) && input >= 0 && input <= 272000
    && Number.isSafeInteger(output) && output >= 0 && output <= 6000, "mock-usage-ceiling");
  return Number((275n * BigInt(input) + 2200n * BigInt(output) + 999n) / 1000n);
}
function confirmedUsageReceipt(receipt, ticket) {
  try {
    active(); Scope.assertTicket(ticket);
    const known = storage().readLocalUnitDiagnosticUsageReceipt(receipt, ticket);
    return Boolean(known && known.record && known.recordHash === P.hash(known.record));
  } catch (_) { return false; }
}
async function reserviere(request) {
  const { command } = active(); Scope.assertClock();
  const state = await Scope.readState(); Scope.guard(state);
  const phase = request.phase === "entwurf" ? "D" : request.phase === "pruefung" ? "R" : null;
  const own = Scope.authority(state), intent = own.slot.plan.intents.find(x => x.phase === phase);
  const Transport = require("./local-unit-diagnostic-transport"), route = Transport.route(request.model);
  A.need(intent && request.model === Transport.model() && request.maxOutputTokens === intent.maxOutputTokens
    && request.runId === own.slot.plan.runId && request.politicianId === intent.owner
    && P.hash(request.admission) === P.hash(Scope.costAdmission())
    && request.inputVersionHash === (phase === "D" ? intent.inputVersionHash : intent.contextVersionHash)
    && P.hash(request.runtimeRouteSnapshot) === P.hash(route.snapshot)
    && route.snapshot.provider === "local-fixture" && Buffer.isBuffer(request.requestBytes)
    && request.requestBytes.length === command.requestPins[phase].bytes
    && sha(request.requestBytes) === command.requestPins[phase].sha256
    && Cost.requestHash(request.requestBytes.toString("utf8")) === request.actualRequestHash,
  "mock-request-binding");
  try {
    const binding = phase === "R" ? R.reservation(state, request.reviewReceipt, request, intent) : null;
    const ticket = await Scope.reserveTicket(phase, request.actualRequestHash, request.requestBytes, binding);
    if (phase === "R") R.reserved(request.reviewReceipt, ticket);
    return ticket;
  } catch (error) { if (request.reviewReceipt) R.stop(request.reviewReceipt); throw error; }
}
function usage(state, receipt, ticket) {
  Scope.assertTicket(ticket);
  const s = storage(), known = s.readLocalUnitDiagnosticUsageReceipt(receipt, ticket);
  A.need(known && s.localUnitDiagnosticUsagePersisted(state, receipt, ticket) === true
    && known.recordHash === P.hash(known.record), "mock-usage-not-persisted");
  const r = known.record, a = ticket.admission, own = Scope.authority(state), d = own.slot.plan.intents.find(x => x.id === a.intentId);
  A.need(d && r.model === require("./local-unit-diagnostic-transport").model() && typeof r.id === "string" && r.id.length > 0
    && r.scopeHash === ticket.execution.commandHash && r.budgetTicketId === ticket.id && r.costIntentId === a.intentId
    && r.costPlanHash === a.planHash && r.costRequestHash === a.actualRequestHash && r.costPhase === a.phase
    && r.runId === a.runId && r.politicianId === d.owner && typeof r.createdAt === "string"
    && ticket.maxOutputTokens === d.maxOutputTokens && Number.isSafeInteger(r.completionTokens)
    && r.completionTokens >= 0 && r.completionTokens <= ticket.maxOutputTokens
    && r.createdAt === new Date(r.createdAt).toISOString() && r.createdAt.slice(0, 10) === ticket.day
    && r.costBasis === "local-fixture-simulation-not-provider-charge"
    && r.totalTokens === r.promptTokens + r.completionTokens, "mock-usage-binding");
  const cost = tokenCost(r.promptTokens, r.completionTokens);
  A.need(cost <= ticket.reserved && r.estimatedCost === cost / 1e6, "mock-usage-cost");
  return { ...known, cost };
}
function completion(handle, own, ticket, known, completedAtUTC) {
  const evidence = require("./ai").readSynthetik500ProviderCompletion(handle), a = ticket.admission;
  A.need(evidence && P.hash(evidence.ticket) === P.hash(ticket) && a.phase === "D"
    && known.record.success === true, "mock-D-private-provider-handle");
  const d = own.slot.plan.intents[0];
  const base = { version: R.COMPLETION_VERSION, planHash: a.planHash, operationId: a.operationId, runId: a.runId,
    dIntentId: d.id, dTicket: { id: ticket.id, day: ticket.day }, owner: d.owner, contextHash: d.inputVersionHash,
    providerResponseHash: evidence.providerResponseHash, providerTextHash: evidence.providerTextHash, outputHash: evidence.outputHash,
    sourceContext: evidence.sourceContext, usageReceipt: { id: known.record.id, recordHash: known.recordHash },
    costMicroUsd: known.cost, completedAtUTC };
  return R.validateCompletion({ ...base, completionHash: P.hash(base) }, own.slot);
}
async function abschliessen(ticket, receipt, deps = {}) {
  active(); Scope.assertTicket(ticket);
  const completedAtUTC = new Date().toISOString();
  const ack = await Scope.mutateState(state => {
    const own = Scope.authority(state); let known, draft = null;
    try {
      known = usage(state, receipt, ticket);
      if (ticket.admission.phase === "D") draft = completion(deps.internalProviderCompletion, own, ticket, known, completedAtUTC);
    } catch (_) { A.account(state, ticket, "unknown", null, null); return { known: false }; }
    A.account(state, ticket, "accounted", known.cost, known.recordHash, draft);
    return { known: true, completion: draft };
  });
  const final = ack?.completion;
  const actual = Scope.authority(await Scope.readState()), call = actual.costs.calls[ticket.id];
  A.need(ack?.known === true && call?.status === "accounted" && call.usageReceiptHash
    && (ticket.admission.phase !== "D" || final?.completionHash
      && P.hash(actual.slot.draftCompletions[ticket.admission.intentId]) === P.hash(final)), "mock-accounting-ack");
  return final;
}
async function nichtGesendet(ticket, error) {
  active(); Scope.assertTicket(ticket);
  if (error?.kiNichtGesendet !== true) return;
  const stopped = R.notSent(ticket);
  if (ticket.admission.phase === "R") A.need(stopped === true, "mock-R-not-sent-receipt");
  await Scope.mutateState(state => A.account(state, ticket, "not-sent", 0, null));
}
function pruefeSendung(ticket, requestHash, reviewReceipt, requestBytes) {
  active(); Scope.assertTicket(ticket); Scope.assertClock();
  A.need(Buffer.isBuffer(requestBytes) && requestBytes.length === ticket.requestPin.bytes
    && sha(requestBytes) === ticket.requestPin.sha256 && Cost.requestHash(requestBytes.toString("utf8")) === requestHash
    && ticket.admission.actualRequestHash === requestHash, "mock-sender-bytes");
  if (ticket.admission.phase === "R") R.sender(reviewReceipt, ticket, requestHash);
}
module.exports = Object.freeze({ reserviere, abschliessen, nichtGesendet, pruefeSendung, confirmedUsageReceipt, tokenCost });
