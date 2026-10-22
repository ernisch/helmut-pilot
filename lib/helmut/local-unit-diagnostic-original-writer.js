"use strict";

// Closed COPY bridge to the unchanged original Atomic writer. No generic
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
function need(ok, code) { if (!ok) throw Error("local-unit-original-writer-" + code); }
function ownKeys(selection) { return [A.GRANTS_KEY, ...Object.values(A.keys(selection.operationId))]; }
function checkedState(state, selection) {
  need(exact(state, ownKeys(selection)), "own-seven-keys");
  const canonical = P.kanonisch(state), digest = sha(canonical);
  need(Buffer.byteLength(canonical) <= 16 * 1024 * 1024 && digest === P.hash(state), "own-canonical");
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
function active(selection) {
  const scope = Scope.currentVerified();
  need(scope && same(scope.selection, selection) && P.hash(scope.command) === selection.commandHash
    && scope.command.mode === "D-R-1-local-fixture", "actual-scope-required");
  Scope.assertClock(); return scope;
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
  need(exact(args, mode === "usage" ? ["selection", "before", "record", "ticket"] : ["selection", "before", "nextState"]), "closed-api");
  A.selection(args.selection); const selection = Object.freeze({ ...args.selection });
  const before = checkedBefore(args.before, selection), next = mode === "usage" ? before : checkedState(args.nextState, selection);
  need(mode === "usage" || next.hash !== before.hash, "unchanged-state");
  need(same(next.state[A.GRANTS_KEY], before.state[A.GRANTS_KEY]), "grant-map-changed");
  const Store = require("./local-unit-diagnostic-store"); let claim = null, scope = null;
  if (opaqueCapability !== null) {
    need(mode === "state" && Scope.currentVerified() === null && typeof Store.consumeOriginalWriterClaimCapability === "function", "claim-capability-required");
    claim = Store.consumeOriginalWriterClaimCapability(opaqueCapability); // Real private Store WeakMap, consumed before any I/O.
    need(exact(claim, ["selection", "before", "ownNext", "command", "legacyRead"]) && same(claim.selection, selection)
      && exact(claim.before, ["hash", "revision"]) && claim.before.hash === before.hash && claim.before.revision === before.revision
      && exact(claim.ownNext, ["canonical", "hash"]) && claim.ownNext.canonical === next.canonical && claim.ownNext.hash === next.hash
      && P.hash(claim.command) === selection.commandHash && typeof claim.legacyRead === "function", "claim-capability-binding");
  } else {
    scope = active(selection);
    if (mode === "usage") { Scope.assertTicket(args.ticket); Transport.assertTicket(args.ticket); }
    Scope.guard(before.state);
  }
  const command = claim ? claim.command : scope.command, t = target(selection, command);
  need(same(A.current(before.state, selection).record.command, command) && same(A.current(next.state, selection).record.command, command), "command-binding");
  const keys = A.keys(selection.operationId), claimId = next.state[keys.journal].claimId;
  need(uuid(claimId) && (claim || claimId === before.state[keys.journal].claimId), "claim-binding");
  if (claim) need(before.state[keys.journal].state === "installed" && before.state[keys.journal].claimId === null
    && next.state[keys.journal].state === "running" && next.state[keys.journal].inFlight?.index === 0, "first-claim-only");
  let operation = operations.get(selection.operationId);
  if (!operation) { operation = { inFlight: false, stopped: false, attempted: new Set() }; operations.set(selection.operationId, operation); }
  const key = [mode, before.revision, before.hash, mode === "usage" ? args.ticket.id : "state"].join(":");
  need(!operation.inFlight && !operation.stopped && !operation.attempted.has(key), "concurrent-or-repeated-attempt");
  operation.inFlight = true; operation.attempted.add(key); let sent = false;
  const recheck = () => {
    need(same(target(selection, command), t), "target-drift");
    if (!claim) {
      need(active(selection) === scope, "scope-drift");
      if (mode === "usage") { Scope.assertTicket(args.ticket); Transport.assertTicket(args.ticket); }
    }
  };
  try {
    recheck(); const reader = claim ? claim.legacyRead : Store.legacyRead;
    need(typeof reader === "function", "original-reader-required");
    const auth = await U.read({ request: (endpoint, options) => { recheck(); return reader(endpoint, options); }, rowId: ROW, target: t.target });
    recheck(); need(U.hasSnapshot(auth) && Array.isArray(auth.llmUsage), "original-snapshot-required");
    const projection = Object.fromEntries(ownKeys(selection).map(name => [name, auth[name]]));
    need(P.kanonisch(projection) === before.canonical && P.hash(projection) === before.hash && same(projection, before.state), "fresh-original-projection-drift");
    const oldHistory = auth.llmUsage;
    if (!claim) Scope.guard(auth);
    let artifact = null;
    if (mode === "usage") {
      validateUsage(args.record, args.ticket, auth, selection, command);
      artifact = { kind: "usage-" + args.ticket.admission.phase, logicalId: args.ticket.id,
        canonical: P.kanonisch(args.record), sha256: P.hash(args.record), parentHash: null };
      auth.llmUsage = [args.record, ...oldHistory]; // Keep every old object and the genuine read snapshot.
    } else for (const name of ownKeys(selection)) auth[name] = next.state[name];
    let ownAck = null, calls = 0;
    const accepted = await U.write(auth, { rowId: ROW, target: t.target, request: async (endpoint, options) => {
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
      need(auth.llmUsage.length === oldHistory.length + (mode === "usage" ? 1 : 0)
        && (mode === "usage" ? auth.llmUsage[0] === args.record && oldHistory.every((record, index) => auth.llmUsage[index + 1] === record)
          : auth.llmUsage === oldHistory), "original-history-identity");
      const body = Buffer.from(JSON.stringify({ schema: "helmut-local-unit-original-write/1", mode, ...selection, claimId,
        originalCAS, ownBefore: { hash: before.hash, revision: before.revision }, ownNext: { canonical: next.canonical, hash: next.hash }, artifact }));
      need(body.length <= CAP, "request-cap"); sent = true;
      const response = await require("./local-unit-diagnostic-endpoint").request(selection, t.database, "POST",
        "/rest/v1/rpc/local_unit_diagnostic_original_write_v1", body);
      recheck(); need(response?.status === 200 && Buffer.isBuffer(response.body) && response.body.length <= CAP
        && Buffer.from(response.body.toString("utf8"), "utf8").equals(response.body), "original-response-unknown");
      let result; try { result = JSON.parse(response.body.toString("utf8")); } catch { need(false, "original-response-json"); }
      need(exact(result, ["schema", "authAck", "ownAck"]) && result.schema === "helmut-local-unit-original-write-result/1", "original-response-shape");
      ownAck = result.ownAck; return result.authAck; // Unchanged; only the original U.write can confirm it.
    } });
    recheck(); need(calls === 1 && U.hasSnapshot(accepted), "original-write-unconfirmed");
    validateOwnAck(ownAck, mode, selection, before, next, claimId, artifact);
    if (mode === "usage") {
      const receipt = U.receipt(args.record, auth);
      need(U.persisted(accepted, receipt) === true && artifact.canonical === P.kanonisch(args.record), "original-usage-unconfirmed");
      return { ownAck, receipt };
    }
    return ownAck;
  } catch (error) { if (sent) operation.stopped = true; throw error; }
  finally { operation.inFlight = false; }
}
module.exports = Object.freeze({
  mutateState: args => perform(args, "state"), appendUsage: args => perform(args, "usage"),
  claimState: (args, opaqueCapability) => { need(opaqueCapability && typeof opaqueCapability === "object", "claim-capability-required"); return perform(args, "state", opaqueCapability); }
});
