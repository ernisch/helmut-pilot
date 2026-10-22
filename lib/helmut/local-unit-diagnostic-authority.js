"use strict";

// Pure transitions for ONE new LOCAL fixture operation. These functions do not
// authenticate evidence, issue capabilities, perform I/O or touch legacy keys.
// Only the separate native proof consumer may activate the execution scope.
const P = require("./synthetik-500-profile");
const A = require("./synthetik-500-kosten-admission");
const R = require("./synthetik-500-review-receipt");
const VERSION = "helmut-local-unit-diagnostic-command/1";
const SLOT_VERSION = "helmut-local-unit-diagnostic-cost-admission/1";
const PLAN_VERSION = "helmut-local-unit-diagnostic-plan/1";
const EXECUTION_VERSION = "helmut-local-unit-diagnostic-execution/1";
const GRANTS_KEY = "localUnitDiagnosticConsumedGrantsV1";
const GATES = Object.freeze(["source", "runtime", "owner", "calendar", "costs", "reservation", "sender", "review", "result", "independentAcceptance"]);
const LIMITS = Object.freeze({ units: 1, operationAttempts: 1, phaseAttempts: 1, providerCalls: 2,
  unitMs: 60000, maxOutputTokens: Object.freeze({ D: 3000, R: 6000 }),
  reservePerPhaseMicroUsd: Object.freeze({ D: 81400, R: 88000 }), maxMockCostMicroUsd: 169400,
  production: false, paidProviderCallsAllowed: false });
const exact = (x, keys) => x !== null && typeof x === "object" && !Array.isArray(x)
  && [Object.prototype, null].includes(Object.getPrototypeOf(x))
  && Object.keys(x).sort().join("|") === [...keys].sort().join("|");
const sha = x => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const utc = x => typeof x === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)
  && Number.isFinite(Date.parse(x)) && new Date(x).toISOString() === x;
const clone = x => structuredClone(x);
function need(ok, code) { if (!ok) { const e = Error("local-unit-diagnostic-" + code); e.kiNichtGesendet = true; throw e; } }
function pinShape(p) {
  need(exact(p, ["path", "bytes", "sha256"]) && typeof p.path === "string"
    && /^(\/workspace\/|\/tmp\/)/.test(p.path) && require("node:path").normalize(p.path) === p.path
    && !p.path.includes("\0") && Number.isSafeInteger(p.bytes) && p.bytes > 0 && sha(p.sha256), "pin");
}
function pin(p) { pinShape(p); need(p.bytes <= 16 * 1024 * 1024, "pin"); }
function postrunPin(p) {
  pinShape(p);
  // Metadata-only exception for this retained original, never a buffer limit
  // increase or file read. The native consumer must still stream and verify it.
  need(p.bytes <= 16 * 1024 * 1024 || p.bytes === 2147483648
    && p.sha256 === "54df2ecc0e4fdc22adf75f2ce3491d3c921e38296510543dcdadd48db3f37693", "postrun-pin");
}
function keys(operationId) {
  need(/^localUnitDiagnostic-[a-f0-9]{32}$/.test(operationId || ""), "operation");
  const prefix = "localUnitDiagnostic:" + operationId.slice(-32) + ":";
  return Object.fromEntries(["journal", "costs", "reservation", "sendClaim", "review", "result"].map(k => [k, prefix + k]));
}
function selector(command) { return { operationId: command.slot.plan.operationId, commandHash: P.hash(command) }; }
function selection(s) { need(exact(s, ["operationId", "commandHash"]) && sha(s.commandHash), "selector"); keys(s.operationId); }
function validateCommand(c) {
  need(exact(c, ["version", "mode", "source", "calendar", "target", "gatePins", "requestPins", "drafts", "units", "slot", "limits"])
    && c.version === VERSION && c.mode === "D-R-1-local-fixture" && P.hash(c.limits) === P.hash(LIMITS), "command");
  need(exact(c.source, ["sourceIndex", "diagnosticUnit", "sourceDay", "sourceOperationId", "packetPin", "installPin", "terminalPin",
    "selectionBindingSHA256", "expandedSHA256", "draftSHA256"]) && c.source.sourceIndex === 499 && c.source.diagnosticUnit === 0
    && c.source.sourceDay === "2026-10-21" && /^synthetik500-resources21-[a-f0-9]{12}$/.test(c.source.sourceOperationId)
    && [c.source.selectionBindingSHA256, c.source.expandedSHA256, c.source.draftSHA256].every(sha), "source");
  for (const p of [c.source.packetPin, c.source.installPin, c.source.terminalPin]) pin(p);
  need(exact(c.target, ["database", "postrunPin", "ownerEvidencePin", "runtimeEvidencePin", "sourceRuntimePin"])
    && /^helmut_unit_diagnostic_[a-f0-9]{32}$/.test(c.target.database), "owned-target");
  postrunPin(c.target.postrunPin);
  for (const k of ["ownerEvidencePin", "runtimeEvidencePin", "sourceRuntimePin"]) pin(c.target[k]);
  need(exact(c.gatePins, GATES), "gate-pins"); for (const p of Object.values(c.gatePins)) pin(p);
  need(exact(c.requestPins, ["D", "R"]) && Object.values(c.requestPins).every(p => exact(p, ["bytes", "sha256"])
    && Number.isSafeInteger(p.bytes) && p.bytes > 0 && p.bytes <= 16 * 1024 * 1024 && sha(p.sha256)), "request-pins");
  const cal = c.calendar, slot = c.slot, p = slot?.plan;
  need(exact(cal, ["sourceDay", "sourceViewAtUTC", "executionDayUTC", "startsAtUTC", "endsAtUTC"])
    && cal.sourceDay === c.source.sourceDay && utc(cal.sourceViewAtUTC) && cal.sourceViewAtUTC.slice(0, 10) === cal.sourceDay
    && utc(cal.startsAtUTC) && utc(cal.endsAtUTC) && cal.startsAtUTC.slice(0, 10) === cal.executionDayUTC
    && cal.endsAtUTC.slice(0, 10) === cal.executionDayUTC && Date.parse(cal.endsAtUTC) > Date.parse(cal.startsAtUTC)
    && Date.parse(cal.endsAtUTC) - Date.parse(cal.startsAtUTC) <= 9 * 3600000, "calendar");
  need(exact(slot, ["version", "plan", "planHash", "consumed", "draftCompletions", "reviewBindings", "reviewBindingsHash"])
    && slot.version === SLOT_VERSION && exact(p, ["version", "operationId", "runId", "productionCommit", "runtimeManifestHash", "startsAtUTC", "endsAtUTC", "intents"])
    && p.version === PLAN_VERSION && /^nachlauf500-[0-9]{5,20}$/.test(p.runId)
    && /^[a-f0-9]{40}$/.test(p.productionCommit) && sha(p.runtimeManifestHash)
    && p.startsAtUTC === cal.startsAtUTC && p.endsAtUTC === cal.endsAtUTC && slot.planHash === P.hash(p), "slot");
  keys(p.operationId);
  need(c.target.database === "helmut_unit_diagnostic_" + p.operationId.slice(-32), "target-operation");
  for (const m of [slot.consumed, slot.draftCompletions, slot.reviewBindings]) need(exact(m, []), "fresh-slot");
  need(slot.reviewBindingsHash === P.hash({}) && Array.isArray(p.intents) && p.intents.length === 2
    && Array.isArray(c.drafts) && c.drafts.length === 1 && Array.isArray(c.units) && c.units.length === 1, "one-unit");
  const [d, r] = p.intents, input = c.drafts[0], u = c.units[0];
  need(exact(d, ["id", "phase", "owner", "inputVersionHash", "actualRequestHash", "model", "maxOutputTokens", "attemptLimit"])
    && d.phase === "D" && d.model === "gpt-5-mini" && d.maxOutputTokens === LIMITS.maxOutputTokens.D && d.attemptLimit === 1
    && sha(d.inputVersionHash) && sha(d.actualRequestHash) && d.id === A.intentHash(p.runId, d), "D-intent");
  need(exact(r, ["id", "phase", "owner", "inputVersionHash", "actualRequestHash", "dependsOn", "contextVersionHash", "model", "maxOutputTokens", "attemptLimit", "reviewRule"])
    && r.phase === "R" && r.owner === d.owner && r.model === d.model && r.maxOutputTokens === LIMITS.maxOutputTokens.R && r.attemptLimit === 1
    && r.inputVersionHash === null && r.actualRequestHash === null && r.dependsOn === d.id
    && r.contextVersionHash === d.inputVersionHash && R.validRule(r.reviewRule, r.maxOutputTokens)
    && r.id === A.intentHash(p.runId, r) && r.id !== d.id, "R-intent");
  const synthetic = require("./synthetik-500-profile").erzeuge().profile.some(x => x.mandatsId === d.owner);
  need(synthetic && input?.profile?.id === d.owner && input.intentId === d.id && input.briefingDatum === cal.sourceViewAtUTC
    && exact(u, ["kind", "subject", "intentIds"]) && u.kind === "DR" && u.subject === d.owner
    && Array.isArray(u.intentIds) && P.hash(u.intentIds) === P.hash([d.id, r.id]), "owner-unit");
  need(Buffer.byteLength(JSON.stringify(c)) <= 16 * 1024 * 1024, "command-cap");
  return selector(c);
}
// Structural admission is NOT authentic provenance. The native scope additionally
// consumes private single-use proofs of the actual files, runtime and source.
function validateAdmission(c, a, now) {
  const s = validateCommand(c);
  need(exact(a, ["version", "grantId", "commandHash", "bindingHash", "authorizedAtUTC", "expiresAtUTC", "authorizationPin"])
    && a.version === "helmut-local-unit-diagnostic-admission/1" && /^[a-f0-9]{64}$/.test(a.grantId)
    && a.commandHash === s.commandHash && a.bindingHash === P.hash({ source: c.source, calendar: c.calendar, target: c.target,
      gatePins: c.gatePins, requestPins: c.requestPins, code: c.slot.plan.productionCommit, runtime: c.slot.plan.runtimeManifestHash, limits: c.limits })
    && utc(now) && utc(a.authorizedAtUTC) && utc(a.expiresAtUTC) && a.expiresAtUTC === c.calendar.endsAtUTC
    && Date.parse(a.authorizedAtUTC) <= Date.parse(now) && Date.parse(now) < Date.parse(a.expiresAtUTC), "admission");
  pin(a.authorizationPin); return s;
}
function current(auth, s) {
  selection(s); const k = keys(s.operationId), record = auth[k.reservation];
  need(record?.version === EXECUTION_VERSION && record.commandHash === s.commandHash && record.operationId === s.operationId
    && P.hash(record.command) === s.commandHash && record.admission.commandHash === s.commandHash, "installed-record");
  const journal = auth[k.journal], costs = auth[k.costs];
  need(journal?.commandHash === s.commandHash && journal.operationId === s.operationId && costs?.slot?.planHash === record.command.slot.planHash
    && P.hash(costs.slot.plan) === record.command.slot.planHash && costs.slot.version === SLOT_VERSION
    && costs.day === record.command.calendar.executionDayUTC && costs.limit === LIMITS.maxMockCostMicroUsd
    && Number.isSafeInteger(costs.spent) && costs.spent >= 0 && costs.spent <= costs.limit
    && auth[GRANTS_KEY]?.[record.admission.grantId]?.commandHash === s.commandHash
    && auth[GRANTS_KEY][record.admission.grantId].operationId === s.operationId
    && auth[k.sendClaim] && auth[k.review] && auth[k.result], "installed-state");
  return { record, journal, costs, slot: costs.slot, sends: auth[k.sendClaim], review: auth[k.review], result: auth[k.result] };
}
function install(auth, command, admission, now) {
  const s = validateAdmission(command, admission, now), k = keys(s.operationId);
  need(Object.values(k).every(key => !Object.hasOwn(auth, key)), "namespace-consumed");
  const grants = auth[GRANTS_KEY] || {};
  need(exact(grants, Object.keys(grants)) && Object.keys(grants).length < 64 && !Object.hasOwn(grants, admission.grantId), "grant-consumed");
  grants[admission.grantId] = { ...s, admissionHash: P.hash(admission), installedAtUTC: now }; auth[GRANTS_KEY] = grants;
  auth[k.reservation] = { version: EXECUTION_VERSION, ...s, command: clone(command), admission: clone(admission), installedAtUTC: now };
  auth[k.journal] = { ...s, state: "installed", claimId: null, index: 0, inFlight: null, attempts: {}, stopRequested: false, reason: null };
  auth[k.costs] = { day: command.calendar.executionDayUTC, limit: LIMITS.maxMockCostMicroUsd, spent: 0,
    tariff: "local-fixture-simulation-only-v1", calls: {}, slot: clone(command.slot) };
  auth[k.sendClaim] = {}; auth[k.review] = {}; auth[k.result] = { state: "pending", evidenceHash: null, positions: [] };
  return s;
}
function bind(auth, s, claimId, now) {
  const a = current(auth, s), p = a.record.command.calendar, j = a.journal;
  need(utc(now) && now.slice(0, 10) === p.executionDayUTC && Date.parse(now) >= Date.parse(p.startsAtUTC)
    && Date.parse(now) < Date.parse(p.endsAtUTC) && j.state === "running" && j.claimId === claimId
    && j.stopRequested === false && j.inFlight?.index === 0 && utc(j.inFlight.enteredAtUTC)
    && Date.parse(j.inFlight.deadlineAtUTC) === Math.min(Date.parse(j.inFlight.enteredAtUTC) + LIMITS.unitMs, Date.parse(p.endsAtUTC))
    && Date.parse(now) >= Date.parse(j.inFlight.enteredAtUTC) && Date.parse(now) < Date.parse(j.inFlight.deadlineAtUTC), "claim-window-or-deadline");
  return a;
}
function claim(auth, s, claimId, enteredAtUTC, observedAtUTC = enteredAtUTC) {
  const a = current(auth, s), c = a.record.command, j = a.journal;
  validateAdmission(c, a.record.admission, observedAtUTC);
  const deadlineAtUTC = new Date(Math.min(Date.parse(enteredAtUTC) + LIMITS.unitMs, Date.parse(c.calendar.endsAtUTC))).toISOString();
  need(typeof claimId === "string" && /^[a-f0-9-]{36}$/.test(claimId) && j.state === "installed" && j.claimId === null
    && j.index === 0 && j.inFlight === null && utc(enteredAtUTC) && enteredAtUTC.slice(0, 10) === c.calendar.executionDayUTC
    && Date.parse(enteredAtUTC) >= Date.parse(c.calendar.startsAtUTC) && Date.parse(observedAtUTC) >= Date.parse(enteredAtUTC)
    && Date.parse(observedAtUTC) < Date.parse(deadlineAtUTC), "already-claimed-or-window");
  j.claimId = claimId; j.state = "running"; j.claimedAtUTC = observedAtUTC;
  j.inFlight = { index: 0, enteredAtUTC, deadlineAtUTC };
  return { ...s, claimId, enteredAtUTC, deadlineAtUTC };
}
function reserve(auth, s, claimId, phase, ticketId, requestHash, now, reviewBinding = null, requestBytes = null) {
  const a = bind(auth, s, claimId, now), intents = a.slot.plan.intents, intent = intents.find(x => x.phase === phase);
  need(intent && typeof ticketId === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(ticketId) && sha(requestHash)
    && !Object.hasOwn(a.journal.attempts, phase) && !Object.hasOwn(a.costs.calls, ticketId), "reserve-once");
  const bodyPin = a.record.command.requestPins[phase];
  need(Buffer.isBuffer(requestBytes) && requestBytes.length === bodyPin.bytes
    && require("node:crypto").createHash("sha256").update(requestBytes).digest("hex") === bodyPin.sha256
    && Buffer.from(requestBytes.toString("utf8"), "utf8").equals(requestBytes)
    && A.requestHash(requestBytes.toString("utf8")) === requestHash, "request-bytes");
  if (phase === "D") need(requestHash === intent.actualRequestHash && reviewBinding === null, "D-request");
  else {
    need(a.journal.attempts.D?.status === "accounted", "D-before-R");
    R.validateBinding(reviewBinding, a.slot, intent);
    need(reviewBinding.actualRequestHash === requestHash && reviewBinding.bodySha256 === bodyPin.sha256, "R-request");
    a.slot.reviewBindings[intent.id] = clone(reviewBinding); a.slot.reviewBindingsHash = P.hash(a.slot.reviewBindings);
  }
  const committed = a.costs.spent + Object.values(a.costs.calls).filter(x => ["reserved", "sent", "unknown"].includes(x.status)).reduce((n, x) => n + x.reserved, 0);
  const reserved = LIMITS.reservePerPhaseMicroUsd[phase];
  need(committed + reserved <= a.costs.limit, "reserve-limit");
  const ticket = { id: ticketId, day: a.costs.day, reserved, maxOutputTokens: intent.maxOutputTokens,
    admission: { version: SLOT_VERSION, operationId: s.operationId, planHash: a.slot.planHash, runId: a.slot.plan.runId,
      intentId: intent.id, phase, actualRequestHash: requestHash, ...(reviewBinding ? { reviewBindingHash: reviewBinding.bindingHash } : {}) },
    requestPin: clone(bodyPin), execution: { version: EXECUTION_VERSION, ...s, claimId } };
  a.slot.consumed[intent.id] = { ticketId, day: ticket.day, actualRequestHash: requestHash, reserved: ticket.reserved, consumedAtUTC: now };
  a.costs.calls[ticketId] = { status: "reserved", reserved: ticket.reserved, ticket: clone(ticket), cost: null };
  a.journal.attempts[phase] = { status: "reserved", ticketId, requestHash, reservedAtUTC: now };
  return ticket;
}
function ticketState(auth, ticket) {
  need(ticket?.execution?.version === EXECUTION_VERSION, "ticket-version");
  const e = ticket.execution, s = { operationId: e.operationId, commandHash: e.commandHash }, a = current(auth, s);
  const call = a.costs.calls[ticket.id], attempt = a.journal.attempts[ticket.admission?.phase];
  need(a.journal.claimId === e.claimId && call && P.hash(call.ticket) === P.hash(ticket) && attempt?.ticketId === ticket.id, "ticket-binding");
  return { ...a, call, attempt, selection: s };
}
function send(auth, ticket, now) {
  const a = ticketState(auth, ticket), phase = ticket.admission.phase;
  bind(auth, a.selection, ticket.execution.claimId, now);
  need(a.call.status === "reserved" && a.attempt.status === "reserved" && !Object.hasOwn(a.sends, phase), "send-once");
  a.sends[phase] = { ticketId: ticket.id, requestHash: ticket.admission.actualRequestHash, claimedAtUTC: now };
  a.call.status = "sent"; a.attempt.status = "sent";
}
function account(auth, ticket, outcome, cost, usageReceiptHash, completion = null) {
  const a = ticketState(auth, ticket), phase = ticket.admission.phase;
  need(["accounted", "unknown", "not-sent"].includes(outcome) && ["reserved", "sent"].includes(a.call.status), "account-once");
  if (outcome === "accounted") {
    need(a.call.status === "sent" && Number.isSafeInteger(cost) && cost >= 0 && cost <= a.call.reserved && sha(usageReceiptHash), "account-receipt");
    if (phase === "D") {
      R.validateCompletion(completion, a.slot);
      need(completion.dTicket.id === ticket.id && completion.dTicket.day === ticket.day && completion.costMicroUsd === cost
        && completion.usageReceipt.recordHash === usageReceiptHash && !Object.hasOwn(a.slot.draftCompletions, ticket.admission.intentId), "D-completion");
      a.slot.draftCompletions[ticket.admission.intentId] = clone(completion);
    } else need(completion === null, "R-completion");
    a.call.cost = cost; a.call.usageReceiptHash = usageReceiptHash; a.costs.spent += cost;
  } else {
    need(outcome !== "not-sent" || a.call.status === "reserved", "sent-not-refundable");
    a.journal.stopRequested = true; a.journal.state = outcome === "unknown" ? "unknown" : "stopped";
    a.journal.reason = outcome;
    if (outcome === "not-sent") a.call.cost = 0;
  }
  a.call.status = outcome; a.attempt.status = outcome;
}
function retain(auth, s, claimId, evidenceHash, positions) {
  const a = current(auth, s);
  need(a.journal.claimId === claimId && a.result.state === "pending" && sha(evidenceHash)
    && Array.isArray(positions) && positions.length === 3 && new Set(positions.map(x => x.bereich)).size === 3
    && positions.every(x => ["mandatsbriefing", "morgenbriefing", "lage"].includes(x.bereich)
      && x.owner === a.record.command.units[0].subject && sha(x.hash)), "result-binding");
  a.result = auth[keys(s.operationId).result] = { state: "retained-unreviewed", evidenceHash, positions: clone(positions) };
}
function finish(auth, s, claimId, evidenceHash, positions, now) {
  const a = bind(auth, s, claimId, now);
  need(a.journal.index === 0 && ["D", "R"].every(p => a.journal.attempts[p]?.status === "accounted")
    && Object.keys(a.costs.calls).length === 2 && a.result.state === "retained-unreviewed"
    && a.result.evidenceHash === evidenceHash && P.hash(a.result.positions) === P.hash(positions), "finish-receipts");
  a.journal.index = 1; a.journal.inFlight = null; a.journal.state = "closed"; a.journal.closedAtUTC = now;
  return { state: "closed", units: 1, completedUnits: 1, expectedPositions: 3, independentFinalAcceptance: false,
    full500Accepted: false, production: false, paidProviderCalls: 0 };
}
function stop(auth, s, claimId, reason) {
  const a = current(auth, s);
  need(a.journal.claimId === claimId && a.journal.state !== "closed" && typeof reason === "string" && /^[a-z0-9-]{1,80}$/.test(reason), "stop-owner");
  a.journal.stopRequested = true; a.journal.reason = reason;
  a.journal.state = Object.values(a.costs.calls).some(x => ["reserved", "sent", "unknown"].includes(x.status)) ? "unknown" : "stopped";
}
module.exports = Object.freeze({ VERSION, SLOT_VERSION, PLAN_VERSION, EXECUTION_VERSION, GRANTS_KEY, GATES, LIMITS,
  need, exact, pin, keys, selector, selection, validateCommand, validateAdmission, current, install, bind, claim, reserve, send, account, retain, finish, stop });
