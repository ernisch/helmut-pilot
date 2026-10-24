"use strict";

// Closed bridge to the same original Atomic CAS/ACK kernel. No generic
// mutator, supplied transport, authority mint, provider or retry is exposed.
const { createHash } = require("node:crypto");
const { isDeepStrictEqual: same } = require("node:util");
const U = require("./llm-usage-atomic"), Parts = require("./auth-state-parts");
const A = require("./local-unit-diagnostic-authority"), P = require("./synthetik-500-profile");
const Scope = require("./local-unit-diagnostic-scope"), Transport = require("./local-unit-diagnostic-transport");
const operations = new Map(), ROW = "main-auth", CAP = 36 * 1024 * 1024;
const CAS_FIELDS = ["id", "expectedRevision", "expectedProof", "expectedState", "revision", "root", "nodes", "additions"];
const RECORD_FIELDS = ["id", "createdAt", "model", "promptTokens", "completionTokens", "totalTokens", "estimatedCost", "success",
  "scopeHash", "budgetTicketId", "costIntentId", "costPlanHash", "costRequestHash", "costPhase", "runId", "politicianId", "costBasis"];
const sha = value => createHash("sha256").update(value).digest("hex");
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const uuid = value => typeof value === "string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value);
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
// PRIVATE Entry stderr only. Existing await pairs cannot separate original
// read transport, Node validation/capture and native commit. This measures that
// gap only: edge1 means settled, never ACK/success. No clock here sets a deadline.
const OWN_TIMING_PHASES = ["performSettled", "readOwnAwait", "readWire", "writeOwnAwait", "nativeWriteHTTPawait"];
let ownTimingIndex = 0, ownTimingEvents = 0, ownTimingBytes = 0, ownTimingDisabled = false, ownTimingSink = null;
function disableOwnTiming() { ownTimingDisabled = true; }
function ownTimingWritten(error) { if (error) disableOwnTiming(); }
function ownTimingMark(timing, phase, edge) {
  try {
    if (!timing || ownTimingDisabled) return;
    if (ownTimingEvents >= 128) { disableOwnTiming(); return; }
    if (!OWN_TIMING_PHASES.includes(phase) || ![0, 1].includes(edge)
      || !["state", "usage"].includes(timing.mode) || !Number.isSafeInteger(timing.index)) { disableOwnTiming(); return; }
    if (!ownTimingSink) {
      const sink = process.stderr;
      if (!sink || typeof sink.write !== "function" || typeof sink.on !== "function"
        || typeof process.hrtime?.bigint !== "function") { disableOwnTiming(); return; }
      sink.on("error", disableOwnTiming); ownTimingSink = sink;
    }
    const ns = process.hrtime.bigint(), utc = new Date().toISOString();
    if (typeof ns !== "bigint" || ns < 0n || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(utc)) { disableOwnTiming(); return; }
    const row = "HELMUT_OWN_WRITE_TIMING_V1 " + JSON.stringify([timing.index, timing.mode, phase, edge, String(ns), utc]) + "\n";
    if (!/^[\x20-\x7e]+\n$/.test(row) || ownTimingBytes + row.length > 16384) { disableOwnTiming(); return; }
    ownTimingEvents++; ownTimingBytes += row.length;
    if (ownTimingSink.write(row, ownTimingWritten) === false) disableOwnTiming();
  } catch { disableOwnTiming(); }
}
function beginOwnTiming(mode) {
  if (ownTimingDisabled) return null;
  if (ownTimingIndex >= 128 || !["state", "usage"].includes(mode)) { disableOwnTiming(); return null; }
  const timing = { index: ownTimingIndex++, mode }; ownTimingMark(timing, "performSettled", 0); return timing;
}
function observeOwnReadWire(pending, timing) {
  if (!timing || ownTimingDisabled) return pending;
  const settled = () => ownTimingMark(timing, "readWire", 1);
  // Observe a native Promise without substituting the returned/awaited Promise
  // or assimilating arbitrary thenables. Logging failure changes no caller flow.
  try { Promise.prototype.then.call(pending, settled, settled); } catch { disableOwnTiming(); }
  return pending;
}
function need(ok, code) { if (!ok) throw Error("local-unit-original-writer-" + code); }
function ownKeys(selection) { return [A.GRANTS_KEY, ...Object.values(A.keys(selection.operationId))]; }
function checkedState(state, selection) {
  need(exact(state, ownKeys(selection)), "own-seven-keys");
  const canonical = P.kanonisch(state), digest = sha(canonical);
  need(Buffer.byteLength(canonical) <= 4 * 1024 * 1024 && digest === P.hash(state), "own-canonical");
  A.current(state, selection);
  return { state: JSON.parse(canonical), canonical, hash: digest }; // Only the seven-key projection, never FullAuth.
}
function checkedBefore(before, selection) {
  need(exact(before, ["state", "canonical", "hash", "revision"]) && typeof before.canonical === "string" && hash(before.hash)
    && Number.isSafeInteger(before.revision) && before.revision >= 0, "before-witness");
  const own = checkedState(before.state, selection);
  need(own.canonical === before.canonical && own.hash === before.hash, "before-canonical");
  return { ...own, revision: before.revision };
}
function target(selection, command) {
  let url; try { url = new URL(process.env.SUPABASE_URL); } catch { need(false, "target-origin"); }
  const database = "helmut_unit_diagnostic_" + selection.operationId.slice(-32);
  need(!process.env.VERCEL && process.env.HELMUT_STORAGE_BACKEND === "supabase"
    && process.env.HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE === database && command.target.database === database
    && url.protocol === "http:" && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/"
    && (/^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(url.hostname) || /^10\.\d+\.\d+\.\d+$/.test(url.hostname)
      || /^192\.168\.\d+\.\d+$/.test(url.hostname) || /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(url.hostname))
    && !Object.hasOwn(process.env, "HELMUT_SUPABASE_AUTH_STORE_ID") && !Object.hasOwn(process.env, "HELMUT_SUPABASE_STORE_ID"), "owned-target");
  need(U.enabled() === true && Parts.enabled() === true, "original-parts-required");
  return { database, target: url.origin + "|" + ROW, origin: url.origin };
}
function active(selection, claimOwner = null) {
  const scope = Scope.currentVerified();
  need(scope && same(scope.selection, selection) && P.hash(scope.command) === selection.commandHash
    && scope.command.mode === "D-R-1-local-fixture", "actual-scope-required");
  if (claimOwner) Scope.assertClaimOwner(claimOwner); else Scope.assertClock();
  return scope;
}
function terminalStop(before, next, selection) {
  const expected = JSON.parse(before.canonical);
  try { A.stop(expected, selection, before.state[A.keys(selection.operationId).journal].claimId, "unit-not-confirmed"); }
  catch { return false; }
  return P.kanonisch(expected) === next.canonical;
}
function operationFor(selection) {
  let value = operations.get(selection.operationId);
  if (!value) { value = { inFlight: false, stopped: false, attempted: new Set() }; operations.set(selection.operationId, value); }
  return value;
}
function sealUnknown(selection) {
  A.selection(selection); const operation = operations.get(selection.operationId);
  if (operation) operation.stopped = true; // Denial only; never opens a scope or retries a write.
}
function validateUsage(record, ticket, auth, selection, command) {
  Scope.assertTicket(ticket); Transport.assertTicket(ticket);
  A.bind(auth, selection, ticket.execution?.claimId, new Date().toISOString());
  const current = A.current(auth, selection), phase = ticket.admission?.phase, call = current.costs.calls[ticket.id];
  const intent = command.slot.plan.intents.find(item => item.phase === phase);
  need(["D", "R"].includes(phase) && intent && call?.status === "sent" && same(call.ticket, ticket)
    && current.journal.attempts[phase]?.status === "sent" && current.sends[phase]?.ticketId === ticket.id
    && ticket.execution.version === A.EXECUTION_VERSION && ticket.execution.operationId === selection.operationId
    && ticket.execution.commandHash === selection.commandHash && ticket.execution.claimId === current.journal.claimId
    && ticket.admission.intentId === intent.id && ticket.admission.planHash === command.slot.planHash
    && ticket.admission.runId === command.slot.plan.runId && ticket.maxOutputTokens === A.LIMITS.maxOutputTokens[phase], "actual-ticket");
  const input = record?.promptTokens, output = record?.completionTokens;
  need(exact(record, RECORD_FIELDS) && uuid(record.id) && typeof record.createdAt === "string"
    && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(record.createdAt)
    && Number.isFinite(Date.parse(record.createdAt)) && new Date(record.createdAt).toISOString() === record.createdAt
    && Date.parse(record.createdAt) >= Date.parse(current.journal.inFlight.enteredAtUTC) && Date.parse(record.createdAt) <= Date.now()
    && Number.isSafeInteger(input) && input >= 0 && input <= 272000 && Number.isSafeInteger(output) && output >= 0
    && output <= ticket.maxOutputTokens && record.totalTokens === input + output
    && record.estimatedCost === Math.ceil((275 * input + 2200 * output) / 1000) / 1000000 && typeof record.success === "boolean"
    && record.model === Transport.model() && record.scopeHash === selection.commandHash && record.budgetTicketId === ticket.id
    && record.costIntentId === ticket.admission.intentId && record.costPlanHash === ticket.admission.planHash
    && record.costRequestHash === ticket.admission.actualRequestHash && record.costPhase === phase
    && record.runId === command.slot.plan.runId && record.politicianId === command.units[0].subject
    && record.costBasis === "local-fixture-simulation-not-provider-charge", "simulation-record");
  need(!auth.llmUsage.some(old => old === record || old.id === record.id), "usage-already-present");
}
function validateOwnAck(ack, mode, selection, before, next, claimId, artifact) {
  need(ack && typeof ack === "object" && !Array.isArray(ack) && ack.scopeHash === selection.commandHash, "own-ack-scope");
  if (mode === "state") {
    const fields = ["version", "scopeHash", "hash", "revision", "claimHash"], journal = next.state[A.keys(selection.operationId).journal];
    if (Object.hasOwn(ack, "nonce")) fields.push("nonce");
    if (journal.state === "closed") {
      const verification = journal.verification;
      need(exact(verification, ["authorizationHash", "controlsHash", "controlCount"]) && hash(verification.authorizationHash)
        && hash(verification.controlsHash) && verification.controlCount === 16, "final-verification");
      fields.push("authorizationHash", "controlsHash", "controlCount");
      need(fields.slice(-3).every(key => ack[key] === verification[key]), "final-verification-ack");
    }
    need(exact(ack, fields) && ack.version === "helmut-local-unit-diagnostic-state-ack/1" && ack.hash === next.hash
      && ack.revision === before.revision + 1 && ack.claimHash === sha(claimId), "state-ack-unknown");
  } else {
    const fields = ["version", "scopeHash", "kind", "logicalId", "hash", "stateRevision"];
    if (Object.hasOwn(ack, "nonce")) fields.push("nonce");
    need(exact(ack, fields) && ack.version === "helmut-local-unit-diagnostic-artifact-ack/1" && ack.kind === artifact.kind
      && ack.logicalId === artifact.logicalId && ack.hash === artifact.sha256 && ack.stateRevision === before.revision, "usage-ack-unknown");
  }
  if (Object.hasOwn(ack, "nonce")) need(typeof ack.nonce === "string" && /^[a-f0-9]{64}$/.test(ack.nonce), "own-ack-nonce");
  return ack;
}
async function perform(args, mode, opaqueCapability = null) {
  const timing = beginOwnTiming(mode);
  try {
  need(exact(args, mode === "usage" ? ["selection", "before", "record", "ticket"] : ["selection", "before", "nextState"]), "closed-api");
  A.selection(args.selection); const selection = Object.freeze({ ...args.selection });
  const before = checkedBefore(args.before, selection), next = mode === "usage" ? before : checkedState(args.nextState, selection);
  need(mode === "usage" || next.hash !== before.hash, "unchanged-state");
  need(same(next.state[A.GRANTS_KEY], before.state[A.GRANTS_KEY]), "grant-map-changed");
  const stopping = mode === "state" && opaqueCapability === null && terminalStop(before, next, selection);
  const Store = require("./local-unit-diagnostic-store"); let claim = null, scope = null;
  if (opaqueCapability !== null) {
    need(mode === "state" && Scope.currentVerified() === null && typeof Store.consumeOriginalWriterClaimCapability === "function", "claim-capability-required");
    claim = Store.consumeOriginalWriterClaimCapability(opaqueCapability); // Real private Store WeakMap, consumed before any I/O.
    need(exact(claim, ["selection", "before", "ownNext", "command", "legacyRead"]) && same(claim.selection, selection)
      && exact(claim.before, ["hash", "revision"]) && claim.before.hash === before.hash && claim.before.revision === before.revision
      && exact(claim.ownNext, ["canonical", "hash"]) && claim.ownNext.canonical === next.canonical && claim.ownNext.hash === next.hash
      && P.hash(claim.command) === selection.commandHash && typeof claim.legacyRead === "function", "claim-capability-binding");
  } else {
    scope = active(selection, stopping ? before.state : null);
    if (mode === "usage") { Scope.assertTicket(args.ticket); Transport.assertTicket(args.ticket); }
    if (stopping) Scope.assertClaimOwner(before.state); else Scope.guard(before.state);
  }
  const command = claim ? claim.command : scope.command, t = target(selection, command);
  need(same(A.current(before.state, selection).record.command, command) && same(A.current(next.state, selection).record.command, command), "command-binding");
  const keys = A.keys(selection.operationId), claimId = next.state[keys.journal].claimId;
  need(uuid(claimId) && (claim || claimId === before.state[keys.journal].claimId), "claim-binding");
  if (claim) need(before.state[keys.journal].state === "installed" && before.state[keys.journal].claimId === null
    && next.state[keys.journal].state === "running" && next.state[keys.journal].inFlight?.index === 0, "first-claim-only");
  const operation = operationFor(selection);
  const key = [mode, before.revision, before.hash, mode === "usage" ? args.ticket.id : "state"].join(":");
  need(!operation.inFlight && !operation.stopped && !operation.attempted.has(key), "concurrent-or-repeated-attempt");
  operation.inFlight = true; operation.attempted.add(key); let sent = false, originalView = null;
  const recheck = () => {
    need(same(target(selection, command), t), "target-drift");
    if (!claim) {
      need(active(selection, stopping ? before.state : null) === scope, "scope-drift");
      if (mode === "usage") { Scope.assertTicket(args.ticket); Transport.assertTicket(args.ticket); }
    }
  };
  try {
    recheck(); const reader = claim ? claim.legacyRead : Store.legacyRead;
    need(typeof reader === "function", "original-reader-required");
    let auth;
    ownTimingMark(timing, "readOwnAwait", 0);
    try {
      auth = await U.readOwnForMutation({ request: (endpoint, options) => {
        recheck(); ownTimingMark(timing, "readWire", 0); let pending;
        try { pending = reader(endpoint, options); } catch (error) { ownTimingMark(timing, "readWire", 1); throw error; }
        return observeOwnReadWire(pending, timing);
      }, rowId: ROW, target: t.target, operationId: selection.operationId });
    } finally { ownTimingMark(timing, "readOwnAwait", 1); }
    originalView = auth;
    recheck(); need(U.hasOwnRead(auth) && !U.hasSnapshot(auth) && Array.isArray(auth.llmUsage), "original-snapshot-required");
    const projection = Object.fromEntries(ownKeys(selection).map(name => [name, auth[name]]));
    need(P.kanonisch(projection) === before.canonical && P.hash(projection) === before.hash && same(projection, before.state), "fresh-original-projection-drift");
    const oldHistory = auth.llmUsage;
    if (!claim) { if (stopping) Scope.assertClaimOwner(auth); else Scope.guard(auth); }
    let artifact = null;
    if (mode === "usage") {
      validateUsage(args.record, args.ticket, auth, selection, command);
      artifact = { kind: "usage-" + args.ticket.admission.phase, logicalId: args.ticket.id,
        canonical: P.kanonisch(args.record), sha256: P.hash(args.record), parentHash: null };
    }
    let ownAck = null, calls = 0;
    let accepted;
    ownTimingMark(timing, "writeOwnAwait", 0);
    try {
    accepted = await U.writeOwn(auth, mode === "usage" ? { record: args.record } : { state: next.state }, {
      rowId: ROW, target: t.target, request: async (endpoint, options) => {
      recheck(); need(++calls === 1 && endpoint === "/rest/v1/rpc/helmut_auth_state_cas_v1"
        && exact(options, ["method", "body"]) && options.method === "POST" && typeof options.body === "string", "original-write-abi");
      let originalCAS; try { originalCAS = JSON.parse(options.body); } catch { need(false, "original-cas-json"); }
      need(exact(originalCAS, CAS_FIELDS) && JSON.stringify(originalCAS) === options.body && originalCAS.id === ROW
        && uuid(originalCAS.expectedRevision) && uuid(originalCAS.revision) && hash(originalCAS.root) && Array.isArray(originalCAS.nodes)
        && exact(originalCAS.expectedProof, ["generation", "count", "head", "originalHash"])
        && exact(originalCAS.expectedState, ["version", "generation", "root", "originalHash"])
        && originalCAS.expectedState.version === Parts.VERSION && Array.isArray(originalCAS.additions)
        && (mode === "usage" ? originalCAS.additions.length === 1 && P.kanonisch(originalCAS.additions[0]) === artifact.canonical
          : originalCAS.additions.length === 0), "original-eight-field-cas");
      need(auth.llmUsage === oldHistory && Object.isFrozen(oldHistory)
        && oldHistory.every(record => Object.isFrozen(record)), "original-history-identity");
      const body = Buffer.from(JSON.stringify({ schema: "helmut-local-unit-original-write/1", mode, ...selection, claimId,
        originalCAS, ownBefore: { hash: before.hash, revision: before.revision }, ownNext: { canonical: next.canonical, hash: next.hash }, artifact }));
      need(body.length <= CAP, "request-cap"); sent = true;
      let response;
      ownTimingMark(timing, "nativeWriteHTTPawait", 0);
      try {
        response = await require("./local-unit-diagnostic-endpoint").request(selection, t.database, "POST",
          "/rest/v1/rpc/local_unit_diagnostic_original_write_v1", body);
      } finally { ownTimingMark(timing, "nativeWriteHTTPawait", 1); }
      recheck(); need(response?.status === 200 && Buffer.isBuffer(response.body) && response.body.length <= CAP
        && Buffer.from(response.body.toString("utf8"), "utf8").equals(response.body), "original-response-unknown");
      let result; try { result = JSON.parse(response.body.toString("utf8")); } catch { need(false, "original-response-json"); }
      need(exact(result, ["schema", "authAck", "ownAck"]) && result.schema === "helmut-local-unit-original-write-result/1", "original-response-shape");
      ownAck = result.ownAck; return result.authAck; // Same native CAS/ACK kernel, no replacement commit route.
    } });
    } finally { ownTimingMark(timing, "writeOwnAwait", 1); }
    recheck(); need(calls === 1 && U.ownWriteConfirmed(accepted), "original-write-unconfirmed");
    validateOwnAck(ownAck, mode, selection, before, next, claimId, artifact);
    if (mode === "usage") {
      const receipt = accepted.receipt;
      need(U.confirmed(receipt) === true && artifact.canonical === P.kanonisch(args.record), "original-usage-unconfirmed");
      return { ownAck, receipt };
    }
    return ownAck;
  } catch (error) { if (sent) operation.stopped = true; throw error; }
  finally { if (originalView) U.discardOwnRead(originalView); operation.inFlight = false; }
  } finally { ownTimingMark(timing, "performSettled", 1); }
}
async function appendArtifact(args) {
  need(exact(args, ["selection", "before", "kind", "logicalId", "body", "parentHash"]), "closed-artifact-api");
  A.selection(args.selection); const selection = Object.freeze({ ...args.selection }), before = checkedBefore(args.before, selection);
  const { kind, logicalId, body, parentHash } = args;
  need(["draft", "immutable-D", "review", "lage", "mandatsbriefing", "morgenbriefing", "evidence"].includes(kind)
    && typeof logicalId === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(logicalId) && body && typeof body === "object" && !Array.isArray(body)
    && (parentHash === null || hash(parentHash)), "artifact-identity");
  const canonical = P.kanonisch(body), digest = sha(canonical), failure = kind === "evidence" && body.failure === "unit-not-confirmed";
  need(Buffer.byteLength(canonical) <= 2 * 1024 * 1024 && P.hash(body) === digest
    && (!Object.hasOwn(body, "failure") || failure), "artifact-body");
  const scope = active(selection, failure ? before.state : null), command = scope.command, t = target(selection, command);
  const own = A.current(before.state, selection), claimId = own.journal.claimId;
  need(uuid(claimId) && same(own.record.command, command), "artifact-claim");
  if (failure) Scope.assertClaimOwner(before.state); else Scope.guard(before.state);
  const day = command.calendar.executionDayUTC, owner = command.units[0].subject, runId = command.slot.plan.runId;
  let rowId;
  if (kind === "evidence") {
    need(logicalId === "diagnostic-result" && parentHash === null && body.operationId === selection.operationId
      && body.commandHash === selection.commandHash, "artifact-evidence");
    rowId = "local-unit-diagnostic-" + selection.operationId + "-evidence-0";
  } else if (kind === "immutable-D") {
    need(logicalId === command.slot.plan.intents[0].id && hash(parentHash), "artifact-immutable-D");
    rowId = "local-unit-diagnostic-" + selection.operationId + "-immutable-D-" + logicalId;
  } else {
    const phase = kind === "draft" ? "entwurf" : "pruefung", draft = kind === "draft" || kind === "review";
    const slot = draft ? "lage-pruefentwurf" : kind === "morgenbriefing" ? "morgenlage" : kind;
    rowId = draft ? `bf-${owner}-${slot}-${day}-${runId}-${phase}` : `bf-${owner}-${slot}-${day}`;
    need(exact(body, ["id", "user_id", "slot", "generated_at", "payload"]) && logicalId === rowId && body.id === rowId
      && body.user_id === owner && body.slot === slot && (kind === "draft" ? parentHash === null : hash(parentHash)), "artifact-original-row");
  }
  const artifact = { kind, logicalId, canonical, sha256: digest, parentHash }, operation = operationFor(selection);
  const key = ["artifact", kind, logicalId].join(":");
  need(!operation.inFlight && !operation.stopped && !operation.attempted.has(key), "concurrent-or-repeated-attempt");
  const request = Buffer.from(JSON.stringify({ schema: "helmut-local-unit-original-write/1", mode: "artifact", ...selection, claimId,
    originalCAS: null, ownBefore: { hash: before.hash, revision: before.revision }, ownNext: { canonical: before.canonical, hash: before.hash }, artifact }));
  need(request.length <= CAP, "request-cap"); operation.inFlight = true; operation.attempted.add(key); let sent = false;
  const recheck = () => need(active(selection, failure ? before.state : null) === scope && same(target(selection, command), t), "artifact-scope-drift");
  try {
    recheck(); sent = true;
    const response = await require("./local-unit-diagnostic-endpoint").request(selection, t.database, "POST",
      "/rest/v1/rpc/local_unit_diagnostic_original_write_v1", request);
    recheck(); need(response?.status === 200 && Buffer.isBuffer(response.body) && response.body.length <= CAP
      && Buffer.from(response.body.toString("utf8")).equals(response.body), "artifact-response-unknown");
    const text = response.body.toString("utf8"); let result; try { result = JSON.parse(text); } catch { need(false, "artifact-response-json"); }
    need(exact(result, ["schema", "originalRowAck", "ownAck"]) && result.schema === "helmut-local-unit-original-write-result/1"
      && JSON.stringify(result) === text, "artifact-response-shape");
    const original = result.originalRowAck, ack = result.ownAck;
    need(exact(original, ["version", "scopeHash", "kind", "id", "hash", "stateRevision", "nonce"])
      && original.version === "helmut-local-unit-diagnostic-original-row-ack/1" && original.scopeHash === selection.commandHash
      && original.kind === kind && original.id === rowId && original.hash === digest && original.stateRevision === before.revision && hash(original.nonce), "original-row-ack-unknown");
    need(exact(ack, ["version", "scopeHash", "kind", "logicalId", "hash", "stateRevision", "nonce"])
      && ack.nonce === original.nonce, "artifact-ack-unknown");
    validateOwnAck(ack, "artifact", selection, before, before, claimId, artifact);
    return { originalRowAck: original, ownAck: ack };
  } catch (error) { if (sent) operation.stopped = true; throw error; }
  finally { operation.inFlight = false; }
}
module.exports = Object.freeze({
  mutateState: args => perform(args, "state"), appendUsage: args => perform(args, "usage"), appendArtifact, sealUnknown,
  claimState: (args, opaqueCapability) => { need(opaqueCapability && typeof opaqueCapability === "object", "claim-capability-required"); return perform(args, "state", opaqueCapability); }
});
