"use strict";

// Synthetic transition tests only. No actual U, Scope, Store, endpoint, native
// proof, original file, database, provider or network implementation is loaded.
const assert = require("node:assert/strict"), crypto = require("node:crypto"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const filename = path.join(__dirname, "../lib/helmut/local-unit-diagnostic-original-writer.js"), source = fs.readFileSync(filename, "utf8");
const digest = value => crypto.createHash("sha256").update(value).digest("hex");
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  return JSON.stringify(value);
}
const P = { kanonisch: canonical, hash: value => digest(canonical(value)) }, copy = value => JSON.parse(canonical(value));
let checks = 0;
function setup(options = {}) {
  const operationId = "localUnitDiagnostic-" + "a".repeat(32), database = "helmut_unit_diagnostic_" + "a".repeat(32);
  const command = { mode: "D-R-1-local-fixture", target: { database }, calendar: { executionDayUTC: "2026-10-22" }, units: [{ subject: "synthetic-owner" }],
    slot: { planHash: digest("synthetic-plan"), plan: { runId: "nachlauf500-12345", intents: [{ phase: "D", id: "draft-intent" }, { phase: "R", id: "review-intent" }] } } };
  const selection = { operationId, commandHash: P.hash(command) }, keys = Object.fromEntries(["journal", "costs", "reservation", "sendClaim", "review", "result"].map(key => [key, "own:" + key]));
  const claimId = "11111111-1111-4111-8111-111111111111", revision = "22222222-2222-4222-8222-222222222222", phase = options.phase || "D";
  const enteredAtUTC = new Date(Date.now() - 1000).toISOString();
  const ticket = { id: "synthetic-ticket-" + phase, maxOutputTokens: phase === "D" ? 3000 : 6000,
    execution: { version: "synthetic-execution/1", operationId, commandHash: selection.commandHash, claimId },
    admission: { phase, intentId: phase === "D" ? "draft-intent" : "review-intent", planHash: command.slot.planHash,
      runId: command.slot.plan.runId, actualRequestHash: digest("synthetic-request-" + phase) } };
  const state = { grants: { own: { commandHash: selection.commandHash } },
    [keys.reservation]: { command }, [keys.journal]: { state: options.claim ? "installed" : "running", claimId: options.claim ? null : claimId,
      attempts: { [phase]: { status: "sent" } }, inFlight: options.claim ? null : { index: 0, enteredAtUTC } },
    [keys.costs]: { spent: 0, calls: { [ticket.id]: { status: "sent", ticket: copy(ticket) } } },
    [keys.sendClaim]: { [phase]: { ticketId: ticket.id } }, [keys.review]: {}, [keys.result]: { state: "pending" } };
  const before = { state, canonical: P.kanonisch(state), hash: P.hash(state), revision: 3 }, nextState = copy(state);
  if (options.claim) { nextState[keys.journal].state = "running"; nextState[keys.journal].claimId = claimId; nextState[keys.journal].inFlight = { index: 0, enteredAtUTC }; }
  else nextState[keys.costs].spent = 1;
  if (options.terminalStop) { nextState[keys.costs].spent = 0; nextState[keys.journal].state = "unknown";
    nextState[keys.journal].stopRequested = true; nextState[keys.journal].reason = "unit-not-confirmed"; }
  const record = { id: "33333333-3333-4333-8333-333333333333", createdAt: new Date().toISOString(), model: "gpt-5-mini", promptTokens: 10,
    completionTokens: 20, totalTokens: 30, estimatedCost: Math.ceil((275 * 10 + 2200 * 20) / 1000) / 1000000, success: true,
    scopeHash: selection.commandHash, budgetTicketId: ticket.id, costIntentId: ticket.admission.intentId, costPlanHash: ticket.admission.planHash,
    costRequestHash: ticket.admission.actualRequestHash, costPhase: phase, runId: command.slot.plan.runId,
    politicianId: command.units[0].subject, costBasis: "local-fixture-simulation-not-provider-charge" };
  const oldRecords = [Object.freeze({ id: "old-one", count: 1 }), Object.freeze({ id: "old-two", count: 2 })], history = Object.freeze(oldRecords);
  const snapshot = Symbol("synthetic-atomic-snapshot"), casSnapshot = Symbol("synthetic-cas-snapshot"), snapshotValue = Object.freeze({ history });
  const untouched = { nested: Object.freeze({ value: 7 }) }, auth = { ...copy(state), llmUsage: history, unrelated: untouched };
  Object.defineProperty(auth, snapshot, { value: snapshotValue, enumerable: true });
  Object.defineProperty(auth, casSnapshot, { value: Object.freeze({ revision }), enumerable: true });
  Object.defineProperty(auth, "toJSON", { value: () => { throw Error("synthetic-full-clone-forbidden"); } });
  if (options.drift) auth[keys.result].state = "changed";
  const genuineTickets = new WeakSet([ticket]), genuineTransportTickets = new WeakSet([ticket]), snapshots = new WeakSet([auth]);
  const commits = new WeakMap(), brandedReceipts = new WeakSet(), capabilities = new WeakMap();
  const stats = { reads: 0, writes: 0, requests: 0, receipts: 0, persisted: 0, consumes: 0, capReads: 0, clocks: 0 }, events = [];
  const scope = { selection, command }; let current = options.noScope || options.claim ? null : scope;
  function required(ok, code) { if (!ok) throw Error("synthetic-" + code); }
  const A = { GRANTS_KEY: "grants", EXECUTION_VERSION: "synthetic-execution/1", LIMITS: { maxOutputTokens: { D: 3000, R: 6000 } }, keys: () => keys,
    selection: selected => required(canonical(selected) === canonical(selection), "selection"),
    current: input => ({ record: input[keys.reservation], journal: input[keys.journal], costs: input[keys.costs], sends: input[keys.sendClaim] }),
    stop: (input, selected, id, reason) => { required(input[keys.journal].claimId === id && input[keys.journal].state !== "closed", "stop-owner");
      input[keys.journal].stopRequested = true; input[keys.journal].reason = reason; input[keys.journal].state = "unknown"; },
    bind: (input, selected, id) => required(input[keys.journal].state === "running" && input[keys.journal].claimId === id, "claim") };
  const Scope = { currentVerified: () => current, assertClock: () => { stats.clocks++; required(!options.expired && !options.failedControl, "clock"); },
    assertClaimOwner: input => required(current && !options.foreignClaim && input[keys.journal].claimId === claimId
      && ["running", "unknown", "stopped"].includes(input[keys.journal].state), "private-claim"),
    assertTicket: value => required(genuineTickets.has(value), "ticket-capability"),
    guard: input => required(current && input[keys.journal].state === "running" && input[keys.journal].claimId === claimId, "scope-guard") };
  const Transport = { assertTicket: value => required(genuineTransportTickets.has(value), "transport-ticket"), model: () => "gpt-5-mini" };
  const reader = async (endpoint, args) => {
    required(endpoint === "/rest/v1/rpc/helmut_auth_state_graph_read_v1" && args.method === "POST" && JSON.parse(args.body).id === "main-auth", "original-read-abi");
    events.push("original.read"); stats.reads++; return {};
  };
  const Store = { legacyRead: async (...args) => { required(current, "normal-reader-scope"); return reader(...args); },
    consumeOriginalWriterClaimCapability: capability => {
      stats.consumes++; const value = capabilities.get(capability); capabilities.delete(capability); required(value, "claim-capability"); events.push("claim.consume"); return value;
    } };
  const body = { id: "main-auth", expectedRevision: revision,
    expectedProof: { generation: revision, count: history.length, head: digest("old-head"), originalHash: digest("original") },
    expectedState: { version: "merkle-auth-v1", generation: revision, root: digest("old-root"), originalHash: digest("original-state") },
    revision: "44444444-4444-4444-8444-444444444444", root: digest("new-root"), nodes: [], additions: options.usage ? [copy(record)] : [] };
  let accepted = null, observedBody = null, observedAuthAck = null;
  const U = { enabled: () => true, hasSnapshot: value => snapshots.has(value),
    read: async args => {
      assert.equal(args.rowId, "main-auth"); assert.equal(args.target, "http://127.0.0.1:8000|main-auth");
      await args.request("/rest/v1/rpc/helmut_auth_state_graph_read_v1", { method: "POST", body: JSON.stringify({ id: "main-auth" }) });
      if (options.readHold) await options.readHold; return auth;
    },
    write: async (value, args) => {
      stats.writes++; events.push("original.write"); assert.equal(value, auth); assert.equal(value[snapshot], snapshotValue);
      assert.equal(value[casSnapshot], auth[casSnapshot]); assert.equal(value.unrelated, untouched);
      assert.equal(args.rowId, "main-auth"); assert.equal(args.target, "http://127.0.0.1:8000|main-auth");
      if (options.badHistory) value.llmUsage = value.llmUsage.map(item => ({ ...item }));
      const outgoing = copy(body); if (options.extraCAS) outgoing.extra = true;
      if (options.badAdditions) outgoing.additions = [copy(record), copy(record)];
      const ack = await args.request(options.badRPC ? "/rest/v1/rpc/unrelated_write" : "/rest/v1/rpc/helmut_auth_state_cas_v1", { method: "POST", body: JSON.stringify(outgoing) });
      observedAuthAck = ack;
      required(Array.isArray(ack) && ack.length === 1 && ack[0].id === "main-auth" && ack[0].revision === body.revision && !options.authUnknown, "original-ack-unconfirmed");
      accepted = { llmUsage: [...value.llmUsage] }; snapshots.add(accepted); commits.set(value, { record }); return accepted;
    },
    receipt: (value, original) => {
      stats.receipts++; required(!options.receiptFailure && commits.get(original)?.record === value, "receipt-unconfirmed");
      const result = { ...value, _ablage: { relationalAtomic: "synthetic-only" } }; brandedReceipts.add(result); return result;
    },
    persisted: (value, receipt) => { stats.persisted++; return !options.persistedFalse && value === accepted && snapshots.has(value) && brandedReceipts.has(receipt); }
  };
  const endpoint = { request: async (selected, db, method, endpointPath, bytes) => {
    stats.requests++; events.push("closed.request"); assert.equal(canonical(selected), canonical(selection)); assert.equal(db, database);
    assert.equal(method, "POST"); assert.equal(endpointPath, "/rest/v1/rpc/local_unit_diagnostic_original_write_v1");
    observedBody = JSON.parse(bytes); assert.equal(observedBody.schema, "helmut-local-unit-original-write/1");
    assert.equal(observedBody.mode, options.artifact ? "artifact" : options.usage ? "usage" : "state");
    assert.deepEqual(observedBody.originalCAS, options.artifact ? null : body);
    assert.deepEqual(observedBody.ownBefore, { hash: before.hash, revision: before.revision }); assert.equal(observedBody.claimId, claimId);
    if (options.endpointUnknown) throw Error("synthetic-endpoint-outcome-unknown");
    if (options.artifact) {
      assert.equal(Object.keys(observedBody).length, 9); assert.deepEqual(observedBody.ownNext, { canonical: before.canonical, hash: before.hash });
      const artifact = observedBody.artifact, nonce = "c".repeat(64), rowId = artifact.kind === "immutable-D"
        ? "local-unit-diagnostic-" + operationId + "-immutable-D-" + artifact.logicalId : artifact.kind === "evidence"
          ? "local-unit-diagnostic-" + operationId + "-evidence-0" : artifact.logicalId;
      const originalRowAck = { version: "helmut-local-unit-diagnostic-original-row-ack/1", scopeHash: selection.commandHash, kind: artifact.kind,
        id: options.badOriginalAck ? "foreign-row" : rowId, hash: artifact.sha256, stateRevision: before.revision, nonce };
      const ownAck = { version: "helmut-local-unit-diagnostic-artifact-ack/1", scopeHash: selection.commandHash, kind: artifact.kind,
        logicalId: artifact.logicalId, hash: options.badOwnAck ? digest("different") : artifact.sha256, stateRevision: before.revision,
        nonce: options.badNonce ? "d".repeat(64) : nonce };
      return { status: 200, body: Buffer.from(JSON.stringify({ schema: "helmut-local-unit-original-write-result/1", originalRowAck, ownAck })) };
    }
    const ownAck = options.usage ? { version: "helmut-local-unit-diagnostic-artifact-ack/1", scopeHash: selection.commandHash,
      kind: "usage-" + phase, logicalId: ticket.id, hash: P.hash(record), stateRevision: before.revision }
      : { version: "helmut-local-unit-diagnostic-state-ack/1", scopeHash: selection.commandHash,
        hash: P.hash(nextState), revision: before.revision + 1, claimHash: digest(claimId) };
    if (options.badOwnAck) ownAck.hash = digest("different");
    return { status: 200, body: Buffer.from(JSON.stringify({ schema: "helmut-local-unit-original-write-result/1",
      authAck: options.emptyAuthAck ? [] : [{ id: "main-auth", revision: body.revision }], ownAck })) };
  } };
  const module = { exports: {} }, stubs = { "./llm-usage-atomic": U, "./auth-state-parts": { enabled: () => true, VERSION: "merkle-auth-v1" },
    "./local-unit-diagnostic-authority": A, "./synthetik-500-profile": P, "./local-unit-diagnostic-scope": Scope,
    "./local-unit-diagnostic-transport": Transport, "./local-unit-diagnostic-store": Store, "./local-unit-diagnostic-endpoint": endpoint,
    "node:crypto": crypto, "node:util": { isDeepStrictEqual: (a, b) => canonical(a) === canonical(b) } };
  const env = { SUPABASE_URL: "http://127.0.0.1:8000/", HELMUT_STORAGE_BACKEND: "supabase", HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE: database, ...options.env };
  vm.runInNewContext(source, { require: name => { required(Object.hasOwn(stubs, name), "unexpected-import"); return stubs[name]; }, module,
    process: { env }, Buffer, URL, Date }, { filename });
  const capability = Object.freeze({});
  capabilities.set(capability, { selection, before: { hash: options.badCapability ? digest("different") : before.hash, revision: before.revision },
    ownNext: { canonical: P.kanonisch(nextState), hash: P.hash(nextState) }, command,
    legacyRead: async (...args) => { stats.capReads++; return reader(...args); } });
  function artifactArgs(kind = "draft", failure = false) {
    const parentHash = ["draft", "evidence"].includes(kind) ? null : digest("parent"), day = command.calendar.executionDayUTC;
    const draft = ["draft", "review"].includes(kind), slot = draft ? "lage-pruefentwurf" : kind === "morgenbriefing" ? "morgenlage" : kind;
    const logicalId = kind === "immutable-D" ? "draft-intent" : kind === "evidence" ? "diagnostic-result" : draft
      ? `bf-synthetic-owner-${slot}-${day}-${command.slot.plan.runId}-${kind === "draft" ? "entwurf" : "pruefung"}` : `bf-synthetic-owner-${slot}-${day}`;
    const artifactBody = kind === "immutable-D" ? { entry: {}, completion: {} } : kind === "evidence"
      ? { ...selection, ...(failure ? { failure: "unit-not-confirmed" } : {}) } : { id: logicalId, user_id: "synthetic-owner", slot, generated_at: enteredAtUTC, payload: {} };
    return { selection, before, kind, logicalId, body: artifactBody, parentHash };
  }
  return { writer: module.exports, selection, before, nextState, record, ticket, capability, stats, events, auth, history, snapshot, snapshotValue, artifactArgs,
    get body() { return observedBody; }, get authAck() { return observedAuthAck; }, revoke: () => { current = null; },
    args: () => options.usage ? { selection, before, record, ticket } : { selection, before, nextState } };
}
async function check(name, action) { await action(); checks++; process.stdout.write("PASS " + name + "\n"); }
const fails = async action => assert.rejects(async () => action());
(async () => {
  await check("state mode preserves original snapshot, unrelated data and every old history identity", async () => {
    const s = setup(), ack = await s.writer.mutateState(s.args()); assert.equal(ack.hash, P.hash(s.nextState));
    assert.equal(s.stats.reads, 1); assert.equal(s.stats.writes, 1); assert.equal(s.stats.requests, 1); assert.equal(s.stats.receipts, 0);
    assert.equal(s.auth.llmUsage, s.history); assert.equal(s.auth[s.snapshot], s.snapshotValue);
    assert.deepEqual(s.body.originalCAS.additions, []); assert.equal(s.body.artifact, null);
  });
  for (const phase of ["D", "R"]) await check("usage " + phase + " appends exactly one actual object and returns only a privately confirmed receipt", async () => {
    const s = setup({ usage: true, phase }), result = await s.writer.appendUsage(s.args());
    assert.equal(s.auth.llmUsage[0], s.record); s.history.forEach((old, index) => assert.equal(s.auth.llmUsage[index + 1], old));
    assert.equal(result.ownAck.kind, "usage-" + phase); assert.equal(s.stats.receipts, 1); assert.equal(s.stats.persisted, 1);
    assert.equal(s.body.ownNext.canonical, s.before.canonical); assert.equal(s.body.artifact.parentHash, null);
    assert.equal(s.body.artifact.sha256, P.hash(s.record)); assert.equal(s.authAck[0].id, "main-auth");
  });
  await check("first claim consumes a real synthetic private capability before its bound read", async () => {
    const s = setup({ claim: true }), ack = await s.writer.claimState(s.args(), s.capability);
    assert.equal(ack.revision, s.before.revision + 1); assert.equal(s.stats.capReads, 1);
    assert(s.events.indexOf("claim.consume") < s.events.indexOf("original.read"));
    await fails(() => s.writer.claimState(s.args(), s.capability)); assert.equal(s.stats.reads, 1); assert.equal(s.stats.requests, 1);
  });
  for (const [name, options] of [["missing scope", { noScope: true }], ["expired scope", { expired: true }],
    ["variable auth row", { env: { HELMUT_SUPABASE_AUTH_STORE_ID: "unrelated" } }],
    ["public origin", { env: { SUPABASE_URL: "https://example.org/" } }]]) await check(name + " stops before any I/O", async () => {
    const s = setup(options); await fails(() => s.writer.mutateState(s.args())); assert.equal(s.stats.reads, 0); assert.equal(s.stats.requests, 0);
  });
  await check("an extra namespace key cannot become a full Auth mutation", async () => {
    const s = setup(); s.nextState.unrelated = {}; await fails(() => s.writer.mutateState(s.args())); assert.equal(s.stats.reads, 0);
  });
  await check("a changed grant map stops before the original read", async () => {
    const s = setup(); s.nextState.grants.extra = {}; await fails(() => s.writer.mutateState(s.args())); assert.equal(s.stats.reads, 0);
  });
  await check("a forged or mismatched claim capability never opens a reader", async () => {
    for (const options of [{ claim: true }, { claim: true, badCapability: true }]) {
      const s = setup(options); await fails(() => s.writer.claimState(s.args(), options.badCapability ? s.capability : {})); assert.equal(s.stats.reads, 0);
    }
  });
  await check("a fresh original projection mismatch cannot reach U.write", async () => {
    const s = setup({ drift: true }); await fails(() => s.writer.mutateState(s.args())); assert.equal(s.stats.reads, 1); assert.equal(s.stats.writes, 0);
  });
  await check("a JSON ticket clone has no Scope capability", async () => {
    const s = setup({ usage: true }), args = s.args(); args.ticket = copy(args.ticket);
    await fails(() => s.writer.appendUsage(args)); assert.equal(s.stats.reads, 0);
  });
  await check("a provider-charge basis cannot enter the synthetic history", async () => {
    const s = setup({ usage: true }); s.record.costBasis = "unqualified";
    await fails(() => s.writer.appendUsage(s.args())); assert.equal(s.stats.requests, 0);
  });
  for (const [name, options] of [["a cloned old history", { usage: true, badHistory: true }], ["a different original RPC", { badRPC: true }],
    ["a ninth original field", { extraCAS: true }], ["multiple usage additions", { usage: true, badAdditions: true }]]) await check(name + " stops before the closed endpoint", async () => {
    const s = setup(options); await fails(() => options.usage ? s.writer.appendUsage(s.args()) : s.writer.mutateState(s.args())); assert.equal(s.stats.requests, 0);
  });
  for (const [name, options] of [["an empty original ACK", { emptyAuthAck: true }], ["an original ACK rejection", { authUnknown: true }],
    ["an unknown endpoint outcome", { endpointUnknown: true }], ["a mismatched own ACK", { badOwnAck: true }],
    ["a missing private receipt", { usage: true, receiptFailure: true }], ["an unpersisted private receipt", { usage: true, persistedFalse: true }]]) {
    await check(name + " remains failure and cannot retry the consumed write", async () => {
      const s = setup(options), invoke = () => options.usage ? s.writer.appendUsage(s.args()) : s.writer.mutateState(s.args());
      await fails(invoke); assert.equal(s.stats.requests, 1); const reads = s.stats.reads;
      await fails(invoke); assert.equal(s.stats.requests, 1); assert.equal(s.stats.reads, reads);
      if (!options.usage) assert.equal(s.stats.receipts, 0);
    });
  }
  await check("a concurrent second state writer cannot start another original read", async () => {
    let release; const readHold = new Promise(resolve => { release = resolve; }), s = setup({ readHold });
    const first = s.writer.mutateState(s.args()); await fails(() => s.writer.mutateState(s.args()));
    assert.equal(s.stats.reads, 1); release(); await first; assert.equal(s.stats.requests, 1);
  });
  for (const kind of ["draft", "immutable-D", "review", "lage", "mandatsbriefing", "morgenbriefing", "evidence"]) await check(kind + " writes exact original rows and own artifacts without auth mutation", async () => {
    const s = setup({ artifact: true }), args = s.artifactArgs(kind), result = await s.writer.appendArtifact(args);
    assert.equal(result.ownAck.hash, P.hash(args.body)); assert.equal(s.stats.reads, 0); assert.equal(s.stats.writes, 0); assert.equal(s.stats.requests, 1);
    assert.equal(s.body.originalCAS, null); assert.equal(s.auth.llmUsage, s.history); await fails(() => s.writer.appendArtifact(args)); assert.equal(s.stats.requests, 1);
  });
  for (const mode of ["expired", "failedControl"]) await check("exact terminal stop survives " + mode + " without altering finances or grants", async () => {
    const s = setup({ [mode]: true, terminalStop: true }); await s.writer.mutateState(s.args()); assert.equal(s.stats.clocks, 0); assert.equal(s.stats.requests, 1);
    assert.equal(s.nextState["own:costs"].spent, 0); assert.deepEqual(s.body.originalCAS.additions, []);
  });
  await check("terminal stop cannot smuggle any other own-field change or private claim", async () => {
    for (const changed of ["costs", "result", "sendClaim"]) {
      const s = setup({ expired: true, terminalStop: true }); s.nextState["own:" + changed].extra = true;
      await fails(() => s.writer.mutateState(s.args())); assert.equal(s.stats.reads, 0);
    }
    const s = setup({ expired: true, terminalStop: true, foreignClaim: true }); await fails(() => s.writer.mutateState(s.args())); assert.equal(s.stats.reads, 0);
  });
  await check("only failure evidence retains the postdeadline artifact path", async () => {
    const s = setup({ artifact: true, expired: true, failedControl: true }); await s.writer.appendArtifact(s.artifactArgs("evidence", true)); assert.equal(s.stats.clocks, 0);
    for (const kind of ["draft", "evidence"]) {
      const s = setup({ artifact: true, expired: true }); await fails(() => s.writer.appendArtifact(s.artifactArgs(kind))); assert.equal(s.stats.requests, 0);
    }
  });
  for (const option of ["badOriginalAck", "badOwnAck", "badNonce", "endpointUnknown"]) await check("artifact " + option + " seals every later writer mode", async () => {
    const s = setup({ artifact: true, [option]: true }); await fails(() => s.writer.appendArtifact(s.artifactArgs()));
    await fails(() => s.writer.appendArtifact(s.artifactArgs("evidence", true))); await fails(() => s.writer.mutateState(s.args())); assert.equal(s.stats.requests, 1);
  });
  await check("own-readback unknown sealing cannot be reopened by terminal failure evidence", async () => {
    const s = setup({ artifact: true }); s.writer.sealUnknown(s.selection); // No operation exists before any attempt.
    await s.writer.appendArtifact(s.artifactArgs()); s.writer.sealUnknown(s.selection);
    await fails(() => s.writer.appendArtifact(s.artifactArgs("evidence", true))); assert.equal(s.stats.requests, 1);
  });
  await check("unknown original state write blocks even exact stop and failure evidence", async () => {
    const s = setup({ endpointUnknown: true }); await fails(() => s.writer.mutateState(s.args())); const reads = s.stats.reads;
    const nextState = copy(s.before.state); nextState["own:journal"].stopRequested = true;
    nextState["own:journal"].reason = "unit-not-confirmed"; nextState["own:journal"].state = "unknown";
    await fails(() => s.writer.mutateState({ selection: s.selection, before: s.before, nextState }));
    await fails(() => s.writer.appendArtifact(s.artifactArgs("evidence", true)));
    assert.equal(s.stats.requests, 1); assert.equal(s.stats.reads, reads);
  });
  await check("artifact namespace, full row shape and cap are closed before I/O", async () => {
    for (const alter of [a => a.kind = "usage-D", a => a.logicalId = "foreign", a => a.body.extra = true,
      a => a.body.payload = { huge: "x".repeat(2 * 1024 * 1024) }, a => a.body.failure = "unit-not-confirmed"]) {
      const s = setup({ artifact: true }), args = s.artifactArgs(); alter(args); await fails(() => s.writer.appendArtifact(args)); assert.equal(s.stats.requests, 0);
    }
  });
  process.stdout.write("Original writer synthetic checks PASS: " + checks + "; no actual U/endpoint/database or native qualification.\n");
})().catch(() => { process.stderr.write("Original writer synthetic tests FAIL; no native execution occurred.\n"); process.exitCode = 1; });
