"use strict";

// No flag, JSON receipt or CLI argument can open this scope. Its only entry
// consumes native private proofs and receives an actual one-time CAS ACK.
const { AsyncLocalStorage } = require("node:async_hooks");
const { randomUUID } = require("node:crypto");
const { hrtime } = require("node:process");
const A = require("./local-unit-diagnostic-authority");
const P = require("./synthetik-500-profile");
const context = new AsyncLocalStorage(), tickets = new WeakMap(), attempted = new Set();
const now = () => new Date().toISOString();
function elapsed(timing, limitMs, code) {
  const atUTC = now(), ns = hrtime.bigint() - timing.startedMonotonic;
  A.need(ns >= 0n && ns < BigInt(limitMs) * 1000000n
    && Date.parse(atUTC) >= Date.parse(timing.lastUTC)
    && Date.parse(atUTC) - Date.parse(timing.startedAtUTC) < limitMs, code);
  timing.lastUTC = atUTC;
  return { atUTC, ns };
}
function freeze(x) { if (x && typeof x === "object") { Object.values(x).forEach(freeze); Object.freeze(x); } return x; }
function nativeStorage() {
  const s = require("./storage");
  for (const name of ["readLocalUnitDiagnosticState", "mutateLocalUnitDiagnosticState", "readLocalUnitDiagnosticAuthority", "consumeLocalUnitDiagnosticAuthority",
    "readLocalUnitDiagnosticRuntime", "consumeLocalUnitDiagnosticRuntime", "readSynthetik500CurrentInputs", "getProfileFromDb",
    "getLageEntwurfsbeleg", "readLocalUnitDiagnosticArtifact", "readLocalUnitDiagnosticOriginalControl"])
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
  return r;
}
async function runClaimed(selection, work) {
  const startedMonotonic = hrtime.bigint(), invocationStartedAtUTC = now();
  const timing = { startedMonotonic, startedAtUTC: invocationStartedAtUTC, lastUTC: invocationStartedAtUTC };
  const authorizationClock = () => elapsed(timing, A.LIMITS.authMs, "authorization-deadline");
  // Both clocks start before the FIRST proof. No await/CAS retry can reset either.
  A.selection(selection); A.need(!context.getStore() && typeof work === "function", "scope-nesting");
  A.need(attempted.size === 0, "invocation-already-attempted"); attempted.add(selection.commandHash);
  const storage = nativeStorage();
  const proof = await storage.readLocalUnitDiagnosticAuthority(selection);
  authorizationClock();
  const admitted = storage.consumeLocalUnitDiagnosticAuthority(proof, selection);
  A.need(A.exact(admitted, ["command", "admission", "sourceHandle"]), "native-authority-proof");
  A.need(P.hash(admitted.command) === selection.commandHash, "command-binding");
  A.validateAdmission(admitted.command, admitted.admission, now());
  require("./local-unit-diagnostic-source").verifyCommandSource(admitted.command, admitted.sourceHandle);
  authorizationClock();
  const transport = require("./local-unit-diagnostic-transport");
  const transportHandle = await transport.prepareOriginals(selection, admitted.command);
  authorizationClock();
  transport.verifyHandle(transportHandle, admitted.command);
  await runtime(storage, admitted.command, selection);
  authorizationClock();
  const claimId = randomUUID(); // Never mint identity inside the retryable CAS callback.
  const deadlineAtUTC = new Date(Math.min(Date.parse(invocationStartedAtUTC) + A.LIMITS.unitMs,
    Date.parse(admitted.command.calendar.endsAtUTC))).toISOString();
  const ack = await storage.mutateLocalUnitDiagnosticState(selection, state =>
    A.claim(state, selection, claimId, invocationStartedAtUTC, authorizationClock().atUTC));
  authorizationClock();
  A.need(ack?.claimId === claimId && ack.operationId === selection.operationId && ack.commandHash === selection.commandHash
    && ack.enteredAtUTC === invocationStartedAtUTC && ack.deadlineAtUTC === deadlineAtUTC
    && Date.parse(now()) < Date.parse(deadlineAtUTC), "claim-ack");
  const actual = await storage.readLocalUnitDiagnosticState(selection);
  const confirmed = authorizationClock();
  A.bind(actual, selection, claimId, confirmed.atUTC);
  A.need(P.hash(A.current(actual, selection).record.admission) === P.hash(admitted.admission), "claim-admission-readback");
  const authorization = freeze({ startedAtUTC: invocationStartedAtUTC, confirmedAtUTC: confirmed.atUTC,
    elapsedNs: String(confirmed.ns), commandHash: selection.commandHash, claimId });
  const c = { storage, selection: freeze(structuredClone(selection)), claimId, transportHandle, invocationStartedAtUTC, deadlineAtUTC,
    timing, authorization, controls: [], controlInFlight: false, failed: false, closed: false,
    public: freeze({ command: structuredClone(admitted.command), selection: structuredClone(selection) }) };
  A.need(Date.parse(now()) < Date.parse(deadlineAtUTC), "claim-readback-deadline");
  try { return await context.run(c, work); } finally { c.closed = true; }
}
function authority(auth) { const c = active(); return A.current(auth, c.selection); }
function guard(auth, at = now()) { const c = active(); return A.bind(auth, c.selection, c.claimId, at).journal; }
function assertClaimOwner(auth) {
  const c = active(), own = A.current(auth, c.selection);
  A.need(own.journal.claimId === c.claimId && ["running", "unknown", "stopped"].includes(own.journal.state), "private-claim-owner");
  return own.journal;
}
function assertClock() {
  const c = active(), at = elapsed(c.timing, A.LIMITS.unitMs, "unit-monotonic-or-utc-deadline").atUTC, cal = c.public.command.calendar;
  A.need(!c.failed, "control-failed-terminal");
  A.need(at.slice(0, 10) === cal.executionDayUTC && Date.parse(at) >= Date.parse(c.invocationStartedAtUTC)
    && Date.parse(at) >= Date.parse(cal.startsAtUTC) && Date.parse(at) < Date.parse(cal.endsAtUTC)
    && Date.parse(at) < Date.parse(c.deadlineAtUTC), "scope-clock");
}
async function verifyRuntime() { const c = active(); return runtime(c.storage, c.public.command, c.selection); }
async function checkControl(stage) {
  const c = active(), index = c.controls.length, command = c.public.command, input = command.drafts[0];
  if (c.failed || c.controlInFlight || stage !== A.CONTROL_STAGES[index]) {
    c.failed = true; A.need(false, "control-order-or-replay");
  }
  c.controlInFlight = true;
  try {
    assertClock();
    const started = elapsed(c.timing, A.LIMITS.unitMs, "control-start-deadline");
    // Every group repeats the original adapter's actual current runtime, source,
    // profile, calendar, journal and financial guards. These are not caller flags.
    const runtimeWitness = await verifyRuntime(); assertClock();
    // The genuine original reader validates its own four-field control view.
    // It has no own seven-key state or Atomic write snapshot: never guard it.
    const original = await c.storage.readLocalUnitDiagnosticOriginalControl(c.selection); assertClock();
    A.need(A.exact(original, ["synthetik500DispatchJournal", "synthetik500KostenAdmission", "testKostenAuftrag", "testKostenTage"]), "original-control-projection");
    const inputs = await c.storage.readSynthetik500CurrentInputs(input.sources); assertClock();
    const sorted = value => Object.fromEntries(["documents", "knowledgeObjects"].map(key =>
      [key, [...(value?.[key] || [])].sort((a, b) => a.id.localeCompare(b.id))]));
    A.need(inputs && require("./synthetik-500-production-command").same(sorted(inputs), sorted(input.sources)), "control-current-inputs");
    const profile = await c.storage.getProfileFromDb(input.profile.id); assertClock();
    A.need(profile && require("./synthetik-500-production-command").same(profile, input.profile), "current-profile-drift");
    A.need(require("./synthetik-500-local-calendar").acceptsInput(command, input), "control-calendar");
    const bindingHash = require("./briefing-lagebindung").pruefe(input.briefingEingabe, profile,
      profile.id, new Date(input.briefingDatum), { acceptedSnapshot: true }).eingabeHash;
    const state = await readState(); assertClock(); guard(state);
    const own = authority(state), d = own.journal.attempts.D, r = own.journal.attempts.R;
    // Re-run the whole own command/admission body for EVERY group, as the full
    // adapter does at its authority boundaries. Freeze is not a cached verdict.
    A.validateAdmission(command, own.record.admission, now());
    const committed = own.costs.spent + Object.values(own.costs.calls)
      .filter(x => ["reserved", "sent", "unknown"].includes(x.status)).reduce((n, x) => n + x.reserved, 0);
    A.need(Number.isSafeInteger(committed) && committed <= own.costs.limit
      && own.costs.day === command.calendar.executionDayUTC && own.journal.stopRequested === false, "control-finances");
    if (["unit-enter", "before-D", "reserve-D"].includes(stage)) A.need(!d && !r, "control-D-not-fresh");
    if (stage === "send-D") A.need(d?.status === "reserved" && !r && !own.sends.D, "control-D-reservation");
    if (["D-accounted", "D-retained", "before-R", "reserve-R"].includes(stage))
      A.need(d?.status === "accounted" && !r && own.sends.D && own.slot.draftCompletions[command.slot.plan.intents[0].id], "control-D-accounting");
    if (stage === "send-R") A.need(d?.status === "accounted" && r?.status === "reserved" && !own.sends.R, "control-R-reservation");
    if (index >= A.CONTROL_STAGES.indexOf("R-accounted"))
      A.need(d?.status === "accounted" && r?.status === "accounted" && own.sends.D && own.sends.R
        && Object.keys(own.costs.calls).length === 2
        && own.slot.reviewBindings[command.slot.plan.intents[1].id], "control-R-accounting");
    let artifactHash = null;
    if (stage === "D-retained" || stage === "R-retained") {
      const phase = stage === "D-retained" ? "entwurf" : "pruefung";
      const id = `bf-${input.profile.id}-lage-pruefentwurf-${command.calendar.executionDayUTC}-${command.slot.plan.runId}-${phase}`;
      const entry = await c.storage.getLageEntwurfsbeleg(input.profile.id, id); assertClock();
      A.need(entry?.id === id && entry.user_id === input.profile.id && entry.payload?.phase === phase
        && entry.payload.runId === command.slot.plan.runId && entry.payload.tag === command.calendar.executionDayUTC,
      "control-retained-artifact");
      if (phase === "entwurf") {
        const retained = await c.storage.readLocalUnitDiagnosticArtifact(c.selection, "immutable-D", command.slot.plan.intents[0].id); assertClock();
        A.need(retained && P.hash(retained.entry) === P.hash(entry)
          && P.hash(retained.completion) === P.hash(own.slot.draftCompletions[command.slot.plan.intents[0].id]), "control-immutable-D");
        artifactHash = P.hash(retained);
      } else artifactHash = P.hash(entry);
    }
    const completed = elapsed(c.timing, A.LIMITS.unitMs, "control-completion-deadline");
    const row = freeze({ index, stage, startedAtUTC: started.atUTC, completedAtUTC: completed.atUTC,
      startedElapsedNs: String(started.ns), completedElapsedNs: String(completed.ns), commandHash: c.selection.commandHash,
      runtimeHash: P.hash(runtimeWitness), inputsHash: P.hash(inputs), profileHash: P.hash(profile), bindingHash,
      stateHash: P.hash(state), costsHash: P.hash(own.costs), artifactHash });
    c.controls.push(row); return bindingHash;
  } catch (error) { c.failed = true; throw error; }
  finally { c.controlInFlight = false; }
}
function verification() {
  const c = active(); assertClock();
  A.need(!c.controlInFlight && c.controls.length === A.LIMITS.controlsPerUnit, "sixteen-fresh-controls-required");
  const value = freeze({ version: "helmut-local-unit-diagnostic-verification/1", authorization: c.authorization, controls: [...c.controls] });
  A.validateVerification(c.public.command, c.claimId, c.invocationStartedAtUTC, value, now()); return value;
}
function transportHandle() {
  const c = active(); require("./local-unit-diagnostic-transport").verifyHandle(c.transportHandle, c.public.command);
  return c.transportHandle;
}
async function readState() { const c = active(); return c.storage.readLocalUnitDiagnosticState(c.selection); }
async function mutateState(change) {
  const c = active(); A.need(typeof change === "function", "state-callback");
  try { return await c.storage.mutateLocalUnitDiagnosticState(c.selection, change); }
  catch (error) { c.failed = true; throw error; }
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
  // prepareReview has now inserted/read back immutable D. The earlier review
  // hook runs before that producer, so its actual retained witness belongs here.
  if (phase === "R") await checkControl("D-retained");
  await checkControl("reserve-" + phase);
  const ack = await mutateState(state => A.reserve(state, c.selection, c.claimId, phase, ticketId,
    requestHash, now(), reviewBinding, requestBytes));
  A.need(ack?.id === ticketId && ack.admission?.phase === phase && ack.admission.actualRequestHash === requestHash, "reserve-ack");
  // Only this private path can brand the exact result of its own confirmed CAS.
  // Neither a JSON clone nor a later read can reconstruct a lost reservation ACK.
  return confirmTicket(ack);
}
function assertTicket(ticket) { const c = active(); A.need(tickets.get(ticket) === c, "ticket-capability"); return ticket; }
async function beforeSend(ticket) {
  assertTicket(ticket); const c = active(); await checkControl("send-" + ticket.admission.phase);
  await mutateState(state => A.send(state, ticket, now()));
}
function retain(auth, evidenceHash, positions) { const c = active(); return A.retain(auth, c.selection, c.claimId, evidenceHash, positions); }
function finish(auth, evidenceHash, positions, at = now()) {
  const c = active(); assertClock();
  return A.finish(auth, c.selection, c.claimId, evidenceHash, positions, at, verification());
}
async function confirmFinalACK(ack) {
  const c = active();
  const expected = A.validateVerification(c.public.command, c.claimId, c.invocationStartedAtUTC, verification(), now());
  A.need(ack?.state === "closed" && ack.units === 1 && ack.completedUnits === 1 && ack.expectedPositions === 3
    && ack.full500Accepted === false && ack.independentFinalAcceptance === false && ack.production === false
    && Object.entries(expected).every(([key, value]) => ack[key] === value),
  "final-ack-shape");
  const actual = authority(await readState());
  A.need(actual.journal.state === "closed" && actual.journal.claimId === c.claimId && actual.journal.index === 1
    && actual.journal.inFlight === null && actual.result.state === "retained-unreviewed"
    && P.hash(actual.journal.verification) === P.hash(expected)
    && Date.parse(now()) < Date.parse(c.deadlineAtUTC), "final-ack-readback-or-deadline");
  assertClock();
  return ack;
}
function stop(auth, reason) { const c = active(); A.need(reason === "unit-not-confirmed", "terminal-stop-reason"); assertClaimOwner(auth); return A.stop(auth, c.selection, c.claimId, reason); }
module.exports = Object.freeze({ runClaimed, currentVerified, current: currentVerified, authority, guard, assertClaimOwner, assertClock, verifyRuntime, checkControl, verification, transportHandle,
  readState, mutateState, costAdmission, reserveTicket, assertTicket, beforeSend, retain, finish, confirmFinalACK, stop });
