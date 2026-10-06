"use strict";

// Permanent attempt memory in the existing conditional Auth writer. A lease,
// process telemetry or a new process cannot reopen a claimed operation.
const P = require("./synthetik-500-profile");
const N = require("./synthetik-500-u-no-sender");
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
function expiredUnclaimedU(auth, previous, command, historicalDR = false) {
  const empty = x => x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).length === 0;
  const utc = x => typeof x === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)
    && Number.isFinite(Date.parse(x)) && new Date(x).toISOString() === x;
  const slot = auth.synthetik500KostenAdmission, old = slot?.plan, next = command.slot?.plan;
  const observedMs = Date.now();
  const nextShape = historicalDR && command.mode === "D-R-500"
    || command.mode === "U-prestage" && command.units.length === 1 && command.units[0].kind === "U"
      && Array.isArray(next?.intents) && next.intents.length === 1 && next.intents[0].phase === "U"
      && Array.isArray(command.units[0].intentIds) && command.units[0].intentIds.length === 1
      && command.units[0].intentIds[0] === next.intents[0].id
      && command.units[0].subject === JSON.stringify([next.intents[0].vorgangId, next.intents[0].contractInputHash]);
  if (!(previous?.state === "installed" && previous.claimId === null && previous.index === 0
    && previous.inFlight === null && previous.stopRequested === false && previous.terminalReason === null
    && Object.keys(previous).sort().join("|") === ["operationId", "commandHash", "planHash", "state", "claimId",
      "stopRequested", "index", "inFlight", "units", "attempts", "outputs", "terminalReason"].sort().join("|")
    && empty(previous.attempts) && empty(previous.outputs)
    && previous.units.length === 1 && previous.units[0].kind === "U"
    && Object.keys(previous.units[0]).sort().join("|") === ["kind", "subject", "intentIds",
      ...(Object.hasOwn(previous.units[0], "entered") ? ["entered"] : [])].sort().join("|")
    && (!Object.hasOwn(previous.units[0], "entered") || previous.units[0].entered === false)
    && Array.isArray(previous.units[0].intentIds) && previous.units[0].intentIds.length === 1
    && old?.operationId === previous.operationId && slot.planHash === previous.planHash
    && Array.isArray(old.intents) && old.intents.length === 1 && old.intents[0].phase === "U"
    && old.intents[0].id === previous.units[0].intentIds[0]
    && previous.units[0].subject === JSON.stringify([old.intents[0].vorgangId, old.intents[0].contractInputHash])
    && empty(slot.consumed) && empty(slot.draftCompletions) && empty(slot.reviewBindings)
    && nextShape
    && utc(old.startsAtUTC) && utc(old.endsAtUTC) && Date.parse(old.startsAtUTC) < Date.parse(old.endsAtUTC)
    && utc(next.startsAtUTC) && utc(next.endsAtUTC) && Date.parse(next.startsAtUTC) < Date.parse(next.endsAtUTC)
    && Date.parse(next.startsAtUTC) >= Date.parse(old.endsAtUTC)
    && Number.isFinite(observedMs) && observedMs >= Date.parse(old.endsAtUTC))) return false;
  try { require("./synthetik-500-kosten-admission").pruefeSlot(slot); } catch { return false; }
  return true;
}
// After installation the active slot belongs to the new command. Read the old
// immutable command to prove its original expiry; never relabel its journal.
function expiredUnclaimedPredecessor(previous, priorCommand, nextCommand) {
  try {
    const C = require("./synthetik-500-production-command");
    C.validate(priorCommand); C.validate(nextCommand);
    if (priorCommand.mode !== "U-prestage" || P.hash(priorCommand) !== previous?.commandHash
      || priorCommand.slot.planHash !== previous.planHash
      || priorCommand.slot.plan.operationId !== previous.operationId) return false;
    return expiredUnclaimedU({ synthetik500KostenAdmission: priorCommand.slot }, previous, nextCommand, true);
  } catch { return false; }
}
function install(auth, command, commandHash, expectedControlHash) {
  requireThat(P.hash({ slot: auth.synthetik500KostenAdmission ?? null, journal: auth[KEY] ?? null }) === expectedControlHash, "install-cas");
  const previous = current(auth);
  requireThat(previous || !Object.hasOwn(auth, "synthetik500KostenAdmission"), "unmanaged-existing-slot");
  const qualifiedPrevious = previous && N.qualified(previous, command);
  // Only a never-claimed, fully expired U preparation can be superseded. Keep
  // its original entry and slot history; no paid attempt is closed or reopened.
  requireThat(!previous || previous.state === "closed" && !previous.inFlight || qualifiedPrevious
    || expiredUnclaimedU(auth, previous, command), "previous-operation-not-closed");
  if (qualifiedPrevious) requireThat(command.mode === "U-prestage" && command.units.length === 1
    && command.units[0].subject === previous.units[0].subject, "no-sender-first-handover-pair");
  const j = auth[KEY] || { version: VERSION, activeOperationId: command.slot.plan.operationId, operations: {} };
  requireThat(!Object.hasOwn(j.operations, command.slot.plan.operationId) && Object.keys(j.operations).length < 64, "permanent-once-or-cap");
  // Subject memory survives a new plan/run/hash. No paid U replay via prestage.
  const oldSubjects = new Set(Object.values(j.operations).flatMap(c => N.qualified(c, command) ? []
    : c.units.filter(u => u.kind === "U" && u.entered).map(u => u.subject)));
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
module.exports = { KEY, VERSION, current, bind, expiredUnclaimedPredecessor, install, claim, enter, reservation, reserved, sending, accounting, finish, stop, close };
