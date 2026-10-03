"use strict";

// Permanent attempt memory in the existing conditional Auth writer. A lease,
// process telemetry or a new process cannot reopen a claimed operation.
const P = require("./synthetik-500-profile");
const KEY = "synthetik500DispatchJournal";
const VERSION = "helmut-synthetik500-dispatch-journal/1";
const fail = code => { const e = Error("synthetik500-dispatch-" + code); e.kiNichtGesendet = true; throw e; };
const requireThat = (ok, code) => { if (!ok) fail(code); };
const copy = x => JSON.parse(JSON.stringify(x));
function current(auth) {
  if (!Object.hasOwn(auth, KEY)) return null;
  const j = auth[KEY];
  requireThat(j?.version === VERSION && j.operations && typeof j.activeOperationId === "string", "journal-invalid");
  const c = j.operations[j.activeOperationId];
  requireThat(c && c.operationId === j.activeOperationId && Array.isArray(c.units) && c.attempts, "command-invalid");
  return c;
}
function bind(auth, commandHash, claimId, now) {
  const c = current(auth), slot = auth.synthetik500KostenAdmission;
  requireThat(c && c.commandHash === commandHash && c.claimId === claimId && c.state === "running"
    && c.stopRequested === false && slot?.planHash === c.planHash
    && Date.parse(now) >= Date.parse(slot.plan.startsAtUTC) && Date.parse(now) < Date.parse(slot.plan.endsAtUTC), "claim-or-window");
  return c;
}
function install(auth, command, commandHash, expectedControlHash) {
  requireThat(P.hash({ slot: auth.synthetik500KostenAdmission ?? null, journal: auth[KEY] ?? null }) === expectedControlHash, "install-cas");
  const previous = current(auth);
  requireThat(previous || !Object.hasOwn(auth, "synthetik500KostenAdmission"), "unmanaged-existing-slot");
  requireThat(!previous || previous.state === "closed" && !previous.inFlight, "previous-operation-not-closed");
  const j = auth[KEY] || { version: VERSION, activeOperationId: command.slot.plan.operationId, operations: {} };
  requireThat(!Object.hasOwn(j.operations, command.slot.plan.operationId) && Object.keys(j.operations).length < 64, "permanent-once-or-cap");
  // Subject memory survives a new plan/run/hash. No paid U replay via prestage.
  const oldSubjects = new Set(Object.values(j.operations).flatMap(c => c.units.filter(u => u.kind === "U" && u.entered).map(u => u.subject)));
  for (const u of command.units) if (u.kind === "U") requireThat(!oldSubjects.has(u.subject), "u-predecessor-consumed");
  j.operations[command.slot.plan.operationId] = { operationId: command.slot.plan.operationId, commandHash,
    planHash: command.slot.planHash, state: "installed", claimId: null, stopRequested: false,
    index: 0, inFlight: null, units: copy(command.units), attempts: {}, outputs: {}, terminalReason: null };
  j.activeOperationId = command.slot.plan.operationId;
  auth[KEY] = j;
  auth.synthetik500KostenAdmission = copy(command.slot);
}
function claim(auth, commandHash, claimId, now) {
  const c = current(auth), p = auth.synthetik500KostenAdmission?.plan;
  requireThat(c?.state === "installed" && c.commandHash === commandHash && c.claimId === null
    && Date.parse(now) >= Date.parse(p?.startsAtUTC) && Date.parse(now) < Date.parse(p?.endsAtUTC), "already-claimed-or-window");
  c.claimId = claimId; c.state = "running"; c.claimedAtUTC = now;
}
function enter(auth, commandHash, claimId, index, now) {
  const c = bind(auth, commandHash, claimId, now);
  requireThat(c.index === index && !c.inFlight && c.units[index] && !c.units[index].entered, "unit-reentry");
  c.units[index].entered = true;
  c.inFlight = { index, intentIds: [...c.units[index].intentIds] };
}
function reservation(auth, intentId, now) {
  const c = current(auth);
  if (!c) return; // Existing uninstalled legacy plans retain their contract.
  bind(auth, c.commandHash, c.claimId, now);
  const ids = c.inFlight?.intentIds;
  requireThat(Array.isArray(ids) && ids.includes(intentId) && !c.attempts[intentId], "outside-finite-unit");
  const before = ids.slice(0, ids.indexOf(intentId));
  requireThat(before.every(id => c.attempts[id]?.status === "accounted"), "prior-attempt-not-accounted");
}
function reserved(auth, admission, ticket, now) {
  const c = current(auth); if (!c) return null;
  reservation(auth, admission.intentId, now);
  c.attempts[admission.intentId] = { ticketId: ticket.id, day: ticket.day, status: "reserved", reservedAtUTC: now };
  return { operationId: c.operationId, commandHash: c.commandHash, claimId: c.claimId };
}
function sending(auth, ticket, now) {
  const c = bind(auth, ticket.execution.commandHash, ticket.execution.claimId, now), a = ticket.admission;
  const r = c.attempts[a.intentId];
  requireThat(c.operationId === ticket.execution.operationId && c.planHash === a.planHash
    && c.inFlight?.intentIds.includes(a.intentId) && r?.ticketId === ticket.id && r.day === ticket.day
    && r.status === "reserved" && auth.testKostenTage?.[ticket.day]?.calls?.[ticket.id]?.status === "reserviert", "send-once");
  r.status = "sent"; r.sendClaimedAtUTC = now;
}
function accounting(auth, ticket, status) {
  if (!ticket.execution) return;
  const c = current(auth), r = c?.attempts?.[ticket.admission?.intentId];
  requireThat(c?.claimId === ticket.execution.claimId && c.commandHash === ticket.execution.commandHash
    && r?.ticketId === ticket.id && r.day === ticket.day, "accounting-binding");
  requireThat(["accounted", "unknown", "not-sent"].includes(status), "accounting-status");
  r.status = status;
  if (status !== "accounted") { c.stopRequested = true; c.state = status === "unknown" ? "unknown" : "stopped"; }
}
function finish(auth, commandHash, claimId, index, resultHash, positions, now) {
  const c = bind(auth, commandHash, claimId, now), u = c.units[index];
  requireThat(c.index === index && c.inFlight?.index === index && u.intentIds.every(id => c.attempts[id]?.status === "accounted"), "unit-not-accounted");
  c.outputs[index] = { resultHash, positions }; c.inFlight = null; c.index++;
}
function stop(auth, commandHash, reason) {
  const c = current(auth); requireThat(c?.commandHash === commandHash, "stop-binding");
  c.stopRequested = true; c.terminalReason = reason;
  const unresolved = Object.values(c.attempts).some(a => ["reserved", "sent", "unknown"].includes(a.status));
  c.state = unresolved || c.inFlight ? "unknown" : "stopped";
}
function close(auth, commandHash, claimId) {
  const c = current(auth);
  requireThat(c?.commandHash === commandHash && c.claimId === claimId && c.state === "running"
    && !c.stopRequested && !c.inFlight && c.index === c.units.length
    && Object.values(c.attempts).every(a => a.status === "accounted"), "close-inflight-or-unknown");
  c.state = "closed";
  c.closedSlot = copy(auth.synthetik500KostenAdmission);
  // Keep the slot and all consumption: closing does not refund or reopen calls.
}
module.exports = { KEY, VERSION, current, bind, install, claim, enter, reservation, reserved, sending, accounting, finish, stop, close };
