"use strict";

// No flag, JSON receipt or CLI argument can open this scope. Its only entry
// consumes native private proofs and receives an actual one-time CAS ACK.
const { AsyncLocalStorage } = require("node:async_hooks");
const { randomUUID } = require("node:crypto");
const A = require("./local-unit-diagnostic-authority");
const P = require("./synthetik-500-profile");
const context = new AsyncLocalStorage(), tickets = new WeakMap();
const now = () => new Date().toISOString();
function freeze(x) { if (x && typeof x === "object") { Object.values(x).forEach(freeze); Object.freeze(x); } return x; }
function nativeStorage() {
  const s = require("./storage");
  for (const name of ["readLocalUnitDiagnosticState", "mutateLocalUnitDiagnosticState", "readLocalUnitDiagnosticAuthority", "consumeLocalUnitDiagnosticAuthority",
    "readLocalUnitDiagnosticRuntime", "consumeLocalUnitDiagnosticRuntime"])
    A.need(typeof s[name] === "function", "native-consumer-missing");
  return s;
}
function active() { const c = context.getStore(); A.need(c && !c.closed, "scope-missing"); return c; }
function currentVerified() {
  const c = context.getStore(); if (!c) return null;
  A.need(!c.closed, "scope-closed"); return c.public;
}
async function runtime(storage, command, selection) {
  const proof = await storage.readLocalUnitDiagnosticRuntime(selection);
  const r = storage.consumeLocalUnitDiagnosticRuntime(proof, selection, command);
  A.need(r && r.operationId === selection.operationId && r.commandHash === selection.commandHash
    && r.targetHash === P.hash(command.target) && r.sourceHash === P.hash(command.source)
    && typeof r.observedAtUTC === "string" && r.observedAtUTC === new Date(r.observedAtUTC).toISOString()
    && Date.parse(now()) >= Date.parse(r.observedAtUTC) && Date.parse(now()) - Date.parse(r.observedAtUTC) <= 30000,
  "runtime-binding");
}
async function runClaimed(selection, work) {
  const invocationStartedAtUTC = now(); // Includes every native proof/transport await and CAS retry.
  A.selection(selection); A.need(!context.getStore() && typeof work === "function", "scope-nesting");
  const storage = nativeStorage();
  const proof = await storage.readLocalUnitDiagnosticAuthority(selection);
  const admitted = storage.consumeLocalUnitDiagnosticAuthority(proof, selection);
  A.need(A.exact(admitted, ["command", "admission", "sourceHandle"]), "native-authority-proof");
  A.need(P.hash(admitted.command) === selection.commandHash, "command-binding");
  A.validateAdmission(admitted.command, admitted.admission, now());
  require("./local-unit-diagnostic-source").verifyCommandSource(admitted.command, admitted.sourceHandle);
  const transport = require("./local-unit-diagnostic-transport");
  const transportHandle = await transport.prepareOriginals(selection, admitted.command);
  transport.verifyHandle(transportHandle, admitted.command);
  await runtime(storage, admitted.command, selection);
  const claimId = randomUUID(); // Never mint identity inside the retryable CAS callback.
  const deadlineAtUTC = new Date(Math.min(Date.parse(invocationStartedAtUTC) + A.LIMITS.unitMs,
    Date.parse(admitted.command.calendar.endsAtUTC))).toISOString();
  const ack = await storage.mutateLocalUnitDiagnosticState(selection, state => A.claim(state, selection, claimId, invocationStartedAtUTC, now()));
  A.need(ack?.claimId === claimId && ack.operationId === selection.operationId && ack.commandHash === selection.commandHash
    && ack.enteredAtUTC === invocationStartedAtUTC && ack.deadlineAtUTC === deadlineAtUTC
    && Date.parse(now()) < Date.parse(deadlineAtUTC), "claim-ack");
  const actual = await storage.readLocalUnitDiagnosticState(selection);
  A.bind(actual, selection, claimId, now());
  A.need(P.hash(A.current(actual, selection).record.admission) === P.hash(admitted.admission), "claim-admission-readback");
  const c = { storage, selection: freeze(structuredClone(selection)), claimId, transportHandle, invocationStartedAtUTC, deadlineAtUTC, closed: false,
    public: freeze({ command: structuredClone(admitted.command), selection: structuredClone(selection) }) };
  A.need(Date.parse(now()) < Date.parse(deadlineAtUTC), "claim-readback-deadline");
  try { return await context.run(c, work); } finally { c.closed = true; }
}
function authority(auth) { const c = active(); return A.current(auth, c.selection); }
function guard(auth, at = now()) { const c = active(); return A.bind(auth, c.selection, c.claimId, at).journal; }
function assertClock() {
  const c = active(), at = now(), cal = c.public.command.calendar;
  A.need(at.slice(0, 10) === cal.executionDayUTC && Date.parse(at) >= Date.parse(c.invocationStartedAtUTC)
    && Date.parse(at) >= Date.parse(cal.startsAtUTC) && Date.parse(at) < Date.parse(cal.endsAtUTC)
    && Date.parse(at) < Date.parse(c.deadlineAtUTC), "scope-clock");
}
async function verifyRuntime() { const c = active(); return runtime(c.storage, c.public.command, c.selection); }
function transportHandle() {
  const c = active(); require("./local-unit-diagnostic-transport").verifyHandle(c.transportHandle, c.public.command);
  return c.transportHandle;
}
async function readState() { const c = active(); return c.storage.readLocalUnitDiagnosticState(c.selection); }
async function mutateState(change) {
  const c = active(); A.need(typeof change === "function", "state-callback");
  return c.storage.mutateLocalUnitDiagnosticState(c.selection, change);
}
function costAdmission() {
  const c = active(), plan = c.public.command.slot;
  return freeze({ version: A.SLOT_VERSION, operationId: c.selection.operationId, planHash: plan.planHash,
    routeContractHash: P.hash({ version: "helmut-local-unit-diagnostic-fixture-route/1", commandHash: c.selection.commandHash,
      requestPins: c.public.command.requestPins, paidProviderCallsAllowed: false }) });
}
async function confirmTicket(ticket) {
  const c = active(), auth = await readState(); guard(auth);
  const a = authority(auth), call = a.costs.calls[ticket?.id];
  A.need(call && P.hash(call.ticket) === P.hash(ticket) && ticket.execution.claimId === c.claimId
    && ticket.execution.version === A.EXECUTION_VERSION && ticket.execution.commandHash === c.selection.commandHash
    && ticket.execution.operationId === c.selection.operationId && !tickets.has(ticket) && call.status === "reserved"
    && a.journal.attempts[ticket.admission.phase]?.status === "reserved" && !Object.hasOwn(a.sends, ticket.admission.phase), "ticket-ack");
  freeze(ticket); tickets.set(ticket, c); return ticket;
}
async function reserveTicket(phase, requestHash, requestBytes, reviewBinding = null) {
  const c = active(), ticketId = randomUUID();
  const ack = await mutateState(state => A.reserve(state, c.selection, c.claimId, phase, ticketId,
    requestHash, now(), reviewBinding, requestBytes));
  A.need(ack?.id === ticketId && ack.admission?.phase === phase && ack.admission.actualRequestHash === requestHash, "reserve-ack");
  // Only this private path can brand the exact result of its own confirmed CAS.
  // Neither a JSON clone nor a later read can reconstruct a lost reservation ACK.
  return confirmTicket(ack);
}
function assertTicket(ticket) { const c = active(); A.need(tickets.get(ticket) === c, "ticket-capability"); return ticket; }
async function beforeSend(ticket) {
  assertTicket(ticket); const c = active(); await verifyRuntime();
  guard(await readState());
  await mutateState(state => A.send(state, ticket, now()));
}
function retain(auth, evidenceHash, positions) { const c = active(); return A.retain(auth, c.selection, c.claimId, evidenceHash, positions); }
function finish(auth, evidenceHash, positions, at = now()) { const c = active(); return A.finish(auth, c.selection, c.claimId, evidenceHash, positions, at); }
async function confirmFinalACK(ack) {
  const c = active();
  A.need(ack?.state === "closed" && ack.units === 1 && ack.completedUnits === 1 && ack.expectedPositions === 3
    && ack.full500Accepted === false && ack.independentFinalAcceptance === false && ack.production === false,
  "final-ack-shape");
  const actual = authority(await readState());
  A.need(actual.journal.state === "closed" && actual.journal.claimId === c.claimId && actual.journal.index === 1
    && actual.journal.inFlight === null && actual.result.state === "retained-unreviewed"
    && Date.parse(now()) < Date.parse(c.deadlineAtUTC), "final-ack-readback-or-deadline");
  assertClock();
  return ack;
}
function stop(auth, reason) { const c = active(); return A.stop(auth, c.selection, c.claimId, reason); }
module.exports = Object.freeze({ runClaimed, currentVerified, current: currentVerified, authority, guard, assertClock, verifyRuntime, transportHandle,
  readState, mutateState, costAdmission, reserveTicket, assertTicket, beforeSend, retain, finish, confirmFinalACK, stop });
