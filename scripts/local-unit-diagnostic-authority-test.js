"use strict";
// SYNTHETIC CONTRACT TESTS ONLY. No original qualification, DB, engine,
// transport, authority issuance, runtime or Unit60 measurement.
const assert = require("node:assert/strict");
const crypto = require("node:crypto"), fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const A = require("../lib/helmut/local-unit-diagnostic-authority");
const Admission = require("../lib/helmut/synthetik-500-kosten-admission");
const R = require("../lib/helmut/synthetik-500-review-receipt");
const P = require("../lib/helmut/synthetik-500-profile");
const Scope = require("../lib/helmut/local-unit-diagnostic-scope");
const sha = x => crypto.createHash("sha256").update(x).digest("hex");
const hash = x => P.hash(x), copy = x => structuredClone(x);
const at = "2026-10-22T12:00:01.000Z", claimId = "11111111-1111-4111-8111-111111111111";
const dBytes = Buffer.from('{"model":"gpt-5-mini-eu","input":"SYNTHETIC-D","max_output_tokens":3000}');
const rBytes = Buffer.from('{"model":"gpt-5-mini-eu","input":"SYNTHETIC-R","max_output_tokens":6000}');
const bytesPin = b => ({ bytes: b.length, sha256: sha(b) });
const pin = name => ({ path: "/tmp/SYNTHETIC-" + name, bytes: 1, sha256: sha(name) });
function fixture(nonce = "a".repeat(32), grant = sha("SYNTHETIC-GRANT")) {
  const owner = P.erzeuge().profile[0].mandatsId, runId = "nachlauf500-20261022120000";
  const d = { phase: "D", owner, inputVersionHash: sha("SYNTHETIC-CONTEXT"), actualRequestHash: Admission.requestHash(dBytes.toString()),
    model: "gpt-5-mini", maxOutputTokens: 3000, attemptLimit: 1 }; d.id = Admission.intentHash(runId, d);
  const r = { phase: "R", owner, inputVersionHash: null, actualRequestHash: null, dependsOn: d.id,
    contextVersionHash: d.inputVersionHash, model: d.model, maxOutputTokens: 6000, attemptLimit: 1,
    reviewRule: { version: R.RULE_VERSION, reasoningEffort: "medium" } }; r.id = Admission.intentHash(runId, r);
  const calendar = { sourceDay: "2026-10-21", sourceViewAtUTC: "2026-10-21T12:00:00.000Z", executionDayUTC: "2026-10-22",
    startsAtUTC: "2026-10-22T12:00:00.000Z", endsAtUTC: "2026-10-22T12:05:00.000Z" };
  const plan = { version: A.PLAN_VERSION, operationId: "localUnitDiagnostic-" + nonce, runId, productionCommit: "b".repeat(40),
    runtimeManifestHash: sha("SYNTHETIC-CODE"), startsAtUTC: calendar.startsAtUTC, endsAtUTC: calendar.endsAtUTC, intents: [d, r] };
  const command = { version: A.VERSION, mode: "D-R-1-local-fixture", source: { sourceIndex: 499, diagnosticUnit: 0,
    sourceDay: calendar.sourceDay, sourceOperationId: "synthetik500-resources21-" + "c".repeat(12), packetPin: pin("PACKET"),
    installPin: pin("INSTALL"), terminalPin: pin("TERMINAL"), selectionBindingSHA256: sha("SYNTHETIC-SELECTION"),
    expandedSHA256: sha("SYNTHETIC-EXPANSION"), draftSHA256: sha("SYNTHETIC-DRAFT") }, calendar,
    target: { database: "helmut_unit_diagnostic_" + nonce, postrunPin: pin("POSTRUN"), ownerEvidencePin: pin("OWNER"),
      runtimeEvidencePin: pin("RUNTIME"), sourceRuntimePin: pin("SOURCE-RUNTIME") },
    gatePins: Object.fromEntries(A.GATES.map(k => [k, pin(k)])), requestPins: { D: bytesPin(dBytes), R: bytesPin(rBytes) },
    drafts: [{ profile: { id: owner }, intentId: d.id, briefingDatum: calendar.sourceViewAtUTC,
      sources: { documents: [], knowledgeObjects: [] }, briefingEingabe: { version: 1 } }],
    units: [{ kind: "DR", subject: owner, intentIds: [d.id, r.id] }],
    slot: { version: A.SLOT_VERSION, plan, planHash: hash(plan), consumed: {}, draftCompletions: {}, reviewBindings: {}, reviewBindingsHash: hash({}) },
    limits: copy(A.LIMITS) };
  const admission = { version: "helmut-local-unit-diagnostic-admission/1", grantId: grant, commandHash: hash(command),
    bindingHash: hash({ source: command.source, calendar, target: command.target, gatePins: command.gatePins, requestPins: command.requestPins,
      code: plan.productionCommit, runtime: plan.runtimeManifestHash, limits: command.limits }),
    authorizedAtUTC: calendar.startsAtUTC, expiresAtUTC: calendar.endsAtUTC, authorizationPin: pin("AUTHORIZATION") };
  const original = { synthetik500DispatchJournal: { state: "UNKNOWN-SYNTHETIC-POSTRUN", permanent: true },
    synthetik500KostenAdmission: { consumed: "KEEP-SYNTHETIC" }, testKostenTage: { "2026-10-21": { opaque: "KEEP" } },
    testKostenAuftrag: { opaque: "KEEP" }, llmUsage: [{ id: "KEEP-SYNTHETIC-HISTORY" }], arbitraryOriginal: [1, 2, 3] };
  const auth = copy(original), selection = A.install(auth, command, admission, at);
  return { auth, command, admission, original, selection, d, r, owner };
}
function start(f) { A.claim(f.auth, f.selection, claimId, at); return f; }
function completion(f, ticket) {
  const base = { version: R.COMPLETION_VERSION, planHash: f.command.slot.planHash, operationId: f.selection.operationId,
    runId: f.command.slot.plan.runId, dIntentId: f.d.id, dTicket: { id: ticket.id, day: ticket.day }, owner: f.owner,
    contextHash: f.d.inputVersionHash, providerResponseHash: sha("SYNTHETIC-PROVIDER"), providerTextHash: sha("SYNTHETIC-TEXT"),
    outputHash: sha("SYNTHETIC-OUTPUT"), sourceContext: { profileHash: sha("SYNTHETIC-PROFILE"), sourcesHash: sha("SYNTHETIC-SOURCES") },
    usageReceipt: { id: "SYNTHETIC-USAGE", recordHash: sha("SYNTHETIC-USAGE") }, costMicroUsd: 1, completedAtUTC: at };
  return { ...base, completionHash: hash(base) };
}
function review(f, c) {
  const base = { version: R.VERSION, dCompletionHash: c.completionHash, dIntentId: f.d.id,
    storedD: { id: "SYNTHETIC-STORED-D", owner: f.owner, runId: c.runId, versionHash: sha("SYNTHETIC-VERSION"),
      outputHash: c.outputHash, contextHash: c.contextHash, profileHash: c.sourceContext.profileHash,
      sourcesHash: c.sourceContext.sourcesHash, storageContractHash: sha("SYNTHETIC-STORAGE") },
    rule: f.r.reviewRule, promptHash: sha("SYNTHETIC-R-PROMPT"), actualRequestHash: Admission.requestHash(rBytes.toString()), bodySha256: sha(rBytes) };
  return { ...base, bindingHash: hash(base) };
}
const reserveD = f => A.reserve(f.auth, f.selection, claimId, "D", "SYNTHETIC-TICKET-D", f.d.actualRequestHash, at, null, dBytes);
function verification(f) {
  return { version: "helmut-local-unit-diagnostic-verification/1", authorization: { startedAtUTC: at, confirmedAtUTC: at,
    elapsedNs: "0", commandHash: f.selection.commandHash, claimId }, controls: A.CONTROL_STAGES.map((stage, index) => ({
    index, stage, startedAtUTC: at, completedAtUTC: at, startedElapsedNs: "0", completedElapsedNs: "0",
    commandHash: f.selection.commandHash, runtimeHash: sha("SYNTHETIC-RUNTIME"), inputsHash: sha("SYNTHETIC-INPUTS"),
    profileHash: sha("SYNTHETIC-PROFILE"), bindingHash: sha("SYNTHETIC-BINDING"), stateHash: sha("SYNTHETIC-STATE"),
    costsHash: sha("SYNTHETIC-COSTS"), artifactHash: stage.endsWith("-retained") ? sha("SYNTHETIC-ARTIFACT") : null })) };
}
let checks = 0;
const rejects = fn => { assert.throws(fn); checks++; };
async function main() {
  const f = fixture(); assert.deepEqual(A.validateCommand(f.command), f.selection); checks++;
  assert.deepEqual(f.command.limits.maxOutputTokens, { D: 3000, R: 6000 });
  assert.deepEqual(f.command.limits.reservePerPhaseMicroUsd, { D: 81400, R: 88000 });
  assert.equal(f.command.limits.maxMockCostMicroUsd, 169400); checks++;
  assert.equal(f.command.limits.authMs, 30000); assert.equal(f.command.limits.controlsPerUnit, 16); checks++;
  for (const mutate of [c => c.slot.plan.intents[0].maxOutputTokens = 6000,
    c => { c.slot.plan.intents[1].maxOutputTokens = 3000; c.slot.plan.intents[1].reviewRule.reasoningEffort = "low"; },
    c => c.slot.plan.intents[1].reviewRule.reasoningEffort = "low",
    c => c.limits.maxMockCostMicroUsd = 162800, c => c.limits.reservePerPhaseMicroUsd.R = 81400]) {
    const c = copy(f.command); mutate(c);
    // Fully rebind all changed intent hashes: a consistent fresh hash cannot
    // authorize a D/R token-limit or review-effort downgrade.
    const [d, r] = c.slot.plan.intents;
    d.id = Admission.intentHash(c.slot.plan.runId, d); r.dependsOn = d.id;
    r.id = Admission.intentHash(c.slot.plan.runId, r); c.units[0].intentIds = [d.id, r.id]; c.drafts[0].intentId = d.id;
    c.slot.planHash = hash(c.slot.plan); rejects(() => A.validateCommand(c));
  }
  // Only descriptor validation: no retained image is created, opened or read.
  const retained = { path: "/tmp/SYNTHETIC-POSTRUN-DESCRIPTOR", bytes: 2147483648,
    sha256: "54df2ecc0e4fdc22adf75f2ce3491d3c921e38296510543dcdadd48db3f37693" };
  const withPostrun = copy(f.command); withPostrun.target.postrunPin = retained;
  assert.doesNotThrow(() => A.validateCommand(withPostrun)); checks++;
  rejects(() => A.pin(retained)); // The ordinary exported validator stays capped.
  for (const change of [{ bytes: 2147483647 }, { bytes: 2147483649 }, { bytes: 16 * 1024 * 1024 + 1 },
    { bytes: Number.MAX_SAFE_INTEGER }, { sha256: "0".repeat(64) }, { sha256: retained.sha256.toUpperCase() },
    { path: "SYNTHETIC-relative" }, { path: "/tmp/../tmp/SYNTHETIC-POSTRUN" }]) {
    const c = copy(withPostrun); Object.assign(c.target.postrunPin, change); rejects(() => A.validateCommand(c));
  }
  for (const [group, name] of [
    ...["packetPin", "installPin", "terminalPin"].map(k => ["source", k]),
    ...["ownerEvidencePin", "runtimeEvidencePin", "sourceRuntimePin"].map(k => ["target", k]),
    ...A.GATES.map(k => ["gatePins", k])
  ]) {
    for (const bytes of [16 * 1024 * 1024 + 1, retained.bytes]) {
      const c = copy(f.command); c[group][name] = { ...retained, bytes }; rejects(() => A.validateCommand(c));
    }
  }
  for (const phase of ["D", "R"]) {
    const c = copy(f.command); c.requestPins[phase] = { bytes: retained.bytes, sha256: retained.sha256 };
    rejects(() => A.validateCommand(c));
  }
  const ordinaryLimit = { ...pin("NORMAL-LIMIT"), bytes: 16 * 1024 * 1024 };
  assert.doesNotThrow(() => A.pin(ordinaryLimit));
  const normalPostrun = copy(f.command); normalPostrun.target.postrunPin = ordinaryLimit;
  assert.doesNotThrow(() => A.validateCommand(normalPostrun)); checks++;
  for (const mutate of [c => c.mode = "D-R-500", c => c.units.push(copy(c.units[0])), c => c.slot.plan.intents.push(copy(c.slot.plan.intents[0])),
    c => c.source.sourceIndex = 498, c => c.source.diagnosticUnit = 499, c => c.target.database = "production",
    c => c.limits.operationAttempts = 2, c => c.limits.paidProviderCallsAllowed = true, c => c.calendar.executionDayUTC = "2026-10-21",
    c => c.requestPins.D.sha256 = "0".repeat(64), c => c.slot.plan.intents[1].dependsOn = "0".repeat(64)]) {
    const c = copy(f.command); mutate(c);
    // Body pin drift alone changes the bound command; the untouched admission rejects it.
    rejects(() => A.validateAdmission(c, f.admission, at));
  }
  rejects(() => A.install(f.auth, f.command, f.admission, at));
  const other = fixture("d".repeat(32)); rejects(() => A.install(f.auth, other.command, other.admission, at));
  start(f); rejects(() => A.claim(f.auth, f.selection, "22222222-2222-4222-8222-222222222222", at));
  assert.equal(A.current(f.auth, f.selection).journal.claimId, claimId); checks++;
  rejects(() => A.stop(f.auth, f.selection, "22222222-2222-4222-8222-222222222222", "loser"));
  rejects(() => A.reserve(f.auth, f.selection, claimId, "R", "SYNTHETIC-R", sha("SYNTHETIC"), at, null, rBytes));
  rejects(() => A.reserve(f.auth, f.selection, claimId, "D", "SYNTHETIC-D", f.d.actualRequestHash, at, null,
    Buffer.from(dBytes.toString().replace(",", ", "))));
  const dt = reserveD(f); assert.equal(dt.reserved, 81400); assert.equal(dt.maxOutputTokens, 3000); checks++;
  rejects(() => reserveD(f));
  A.send(f.auth, dt, at); rejects(() => A.send(f.auth, dt, at));
  rejects(() => A.account(f.auth, dt, "not-sent", 0, null));
  const dc = completion(f, dt); A.account(f.auth, dt, "accounted", 1, dc.usageReceipt.recordHash, dc);
  rejects(() => A.account(f.auth, dt, "accounted", 1, dc.usageReceipt.recordHash, dc));
  const binding = review(f, dc), drift = copy(binding); drift.storedD.outputHash = "0".repeat(64);
  rejects(() => A.reserve(f.auth, f.selection, claimId, "R", "SYNTHETIC-TICKET-R", binding.actualRequestHash, at, drift, rBytes));
  const byteDrift = copy(binding); byteDrift.bodySha256 = "0".repeat(64);
  const { bindingHash: _oldBindingHash, ...byteDriftBase } = byteDrift; byteDrift.bindingHash = hash(byteDriftBase);
  rejects(() => A.reserve(f.auth, f.selection, claimId, "R", "SYNTHETIC-TICKET-R", binding.actualRequestHash, at, byteDrift, rBytes));
  const rt = A.reserve(f.auth, f.selection, claimId, "R", "SYNTHETIC-TICKET-R", binding.actualRequestHash, at, binding, rBytes);
  assert.equal(rt.reserved, 88000); assert.equal(rt.maxOutputTokens, 6000); checks++;
  A.send(f.auth, rt, at); A.account(f.auth, rt, "accounted", 1, sha("SYNTHETIC-R-USAGE"));
  const positions = ["mandatsbriefing", "morgenbriefing", "lage"].map(bereich => ({ bereich, owner: f.owner, hash: sha(bereich) }));
  rejects(() => A.finish(f.auth, f.selection, claimId, sha("SYNTHETIC-EVIDENCE"), positions, at));
  A.retain(f.auth, f.selection, claimId, sha("SYNTHETIC-EVIDENCE"), positions);
  rejects(() => A.finish(f.auth, f.selection, claimId, sha("SYNTHETIC-EVIDENCE"), positions, at));
  for (const change of [v => v.controls.pop(), v => v.controls[1].stage = v.controls[0].stage,
    v => v.controls[0].completedElapsedNs = "60000000000", v => v.authorization.elapsedNs = "30000000000",
    v => v.controls[6].artifactHash = null]) {
    const v = verification(f); change(v);
    rejects(() => A.finish(f.auth, f.selection, claimId, sha("SYNTHETIC-EVIDENCE"), positions, at, v));
  }
  const result = A.finish(f.auth, f.selection, claimId, sha("SYNTHETIC-EVIDENCE"), positions, at, verification(f));
  assert.equal(result.controlCount, 16); assert.equal(result.controlsHash, hash(verification(f).controls)); checks++;
  assert.equal(result.full500Accepted, false); assert.equal(result.independentFinalAcceptance, false); checks++;
  rejects(() => A.finish(f.auth, f.selection, claimId, sha("SYNTHETIC-EVIDENCE"), positions, at));
  rejects(() => A.stop(f.auth, f.selection, claimId, "late-stop"));
  for (const key of Object.keys(f.original)) assert.deepEqual(f.auth[key], f.original[key]); checks++;
  for (const outcome of ["unknown", "not-sent"]) {
    const g = start(fixture()), t = reserveD(g); if (outcome === "unknown") A.send(g.auth, t, at);
    A.account(g.auth, t, outcome, null, null); rejects(() => reserveD(g));
    rejects(() => A.claim(g.auth, g.selection, claimId, at));
    assert.equal(A.current(g.auth, g.selection).costs.calls[t.id].status, outcome); checks++;
  }
  const late = start(fixture()); rejects(() => A.bind(late.auth, late.selection, claimId, "2026-10-22T12:01:01.000Z"));
  rejects(() => Scope.assertTicket({ trusted: true })); rejects(() => Scope.guard({})); assert.equal(Scope.currentVerified(), null); checks++;
  // Even schema-valid synthetic JSON cannot open a scope: fixed native proof
  // consumers are mandatory before the first mutation. Never load real storage.
  const sandbox = { module: { exports: {} }, require(name) {
    if (name === "./storage") return { readAuthStore() { throw Error("Unexpected synthetic read"); },
      mutateAuthStore() { throw Error("Unexpected synthetic mutation"); } };
    if (name === "./local-unit-diagnostic-authority") return A;
    if (name === "./synthetik-500-profile") return P;
    return require(name);
  }, structuredClone };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../lib/helmut/local-unit-diagnostic-scope.js"), "utf8"), sandbox);
  await assert.rejects(sandbox.module.exports.runClaimed(f.selection, () => { throw Error("Unexpected synthetic scope"); }), /native-consumer-missing/); checks++;
  // Labelled in-memory native-API stand-ins exercise the ACK boundary only.
  // They never qualify their synthetic source/owner/runtime as real originals.
  function simulatedScope(mode) {
    const g = fixture(), source = fs.readFileSync(path.resolve(__dirname, "../lib/helmut/local-unit-diagnostic-scope.js"), "utf8");
    let state = copy(g.auth), mutations = 0, callbacks = 0, worked = false, clock = Date.parse(at);
    const store = {
      readLocalUnitDiagnosticAuthority: async () => Object.freeze({}),
      consumeLocalUnitDiagnosticAuthority: () => ({ command: g.command, admission: g.admission, sourceHandle: Object.freeze({}) }),
      readLocalUnitDiagnosticRuntime: async () => Object.freeze({}),
      consumeLocalUnitDiagnosticRuntime: () => ({ ...g.selection, targetHash: hash(g.command.target), sourceHash: hash(g.command.source), observedAtUTC: new Date(clock).toISOString() }),
      readSynthetik500CurrentInputs: async () => copy(g.command.drafts[0].sources),
      getProfileFromDb: async () => copy(g.command.drafts[0].profile),
      getLageEntwurfsbeleg: async () => { throw Error("unexpected synthetic artifact"); },
      readLocalUnitDiagnosticArtifact: async () => { throw Error("unexpected synthetic artifact"); },
      readLocalUnitDiagnosticOriginalControl: async () => ({ synthetik500DispatchJournal: {}, synthetik500KostenAdmission: {}, testKostenAuftrag: {}, testKostenTage: {} }),
      readLocalUnitDiagnosticState: async () => {
        if (mode === "delayed-claim-readback" && mutations === 1) clock += 61000;
        if (mode === "delayed-final-readback" && A.current(state, g.selection).journal.state === "closed") clock += 61000;
        return mode === "stale-readback" && mutations ? copy(g.auth) : copy(state);
      },
      mutateLocalUnitDiagnosticState: async (_selection, change) => {
        mutations++; callbacks++; let next = copy(state), result = change(next);
        if (mode === "cas-retry" && mutations === 1) {
          const first = copy(result); clock += 15000; callbacks++; next = copy(state); result = change(next);
          assert.equal(first.enteredAtUTC, result.enteredAtUTC); assert.equal(first.deadlineAtUTC, result.deadlineAtUTC);
        }
        state = next;
        if (mode === "unknown-ack") throw Error("SYNTHETIC_UNKNOWN_ACK");
        if (mode === "unknown-reserve-ack" && mutations === 2) throw Error("SYNTHETIC_UNKNOWN_RESERVE_ACK");
        if (mode === "delayed-claim-ack" && mutations === 1) clock += 61000;
        return mode === "wrong-ack" ? { ...result, claimId: "WRONG_SYNTHETIC_CLAIM" } : result;
      }
    };
    store.readLocalUnitDiagnosticControlRuntime = (...args) => store.readLocalUnitDiagnosticRuntime(...args);
    store.readLocalUnitDiagnosticControlSnapshot = async selection => ({
      original: await store.readLocalUnitDiagnosticOriginalControl(selection), inputs: await store.readSynthetik500CurrentInputs(),
      profile: await store.getProfileFromDb(), state: await store.readLocalUnitDiagnosticState(selection)
    });
    class SyntheticDate extends Date { constructor(value) { super(arguments.length ? value : clock); } static now() { return clock; } }
    const transport = Object.freeze({});
    const box = { module: { exports: {} }, structuredClone, Date: SyntheticDate, require(name) {
      if (name === "./storage") return store;
      if (name === "./local-unit-diagnostic-authority") return A;
      if (name === "./synthetik-500-profile") return P;
      if (name === "./synthetik-500-production-command") return require("../lib/helmut/synthetik-500-production-command");
      if (name === "./synthetik-500-local-calendar") return { acceptsInput: () => true };
      if (name === "./briefing-lagebindung") return { pruefe: () => ({ eingabeHash: sha("SYNTHETIC-BINDING") }) };
      if (name === "./local-unit-diagnostic-source") return { verifyCommandSource(c) { assert.equal(hash(c), g.selection.commandHash); } };
      if (name === "./local-unit-diagnostic-transport") return {
        prepareOriginals: async () => transport, verifyHandle(h, c) { assert.equal(h, transport); assert.equal(hash(c), g.selection.commandHash); }
      };
      return require(name);
    } };
    vm.runInNewContext(source, box);
    return { g, scope: box.module.exports, state: () => state, mutations: () => mutations, callbacks: () => callbacks, worked: () => worked,
      makeFinal(advanceClock = false) {
        const a = A.current(state, g.selection); a.journal.state = "closed"; a.journal.index = 1;
        a.journal.inFlight = null; a.result.state = "retained-unreviewed"; if (advanceClock) clock += 61000;
        return { state: "closed", units: 1, completedUnits: 1, expectedPositions: 3, full500Accepted: false, independentFinalAcceptance: false, production: false };
      },
      run: (action = null) => box.module.exports.runClaimed(g.selection, async () => {
        worked = true; assert.equal(box.module.exports.currentVerified().selection.commandHash, g.selection.commandHash);
        box.module.exports.guard(await box.module.exports.readState());
        assert.equal(box.module.exports.costAdmission().operationId, g.selection.operationId);
        if (action) return action(box.module.exports);
        return "SYNTHETIC_SCOPE_CALLBACK";
      }) };
  }
  for (const mode of ["unknown-ack", "wrong-ack", "stale-readback"]) {
    const c = simulatedScope(mode); await assert.rejects(c.run()); assert.equal(c.worked(), false);
    assert.notEqual(A.current(c.state(), c.g.selection).journal.claimId, null);
    assert.equal(c.scope.currentVerified(), null); checks++;
    // A failed acknowledgement remains consumed; a restart cannot retry it.
    await assert.rejects(c.run()); assert.equal(c.worked(), false); checks++;
  }
  const live = simulatedScope("confirmed"); assert.equal(await live.run(), "SYNTHETIC_SCOPE_CALLBACK");
  assert.equal(live.mutations(), 1); assert.equal(live.scope.currentVerified(), null); checks++;
  await assert.rejects(live.run()); assert.equal(A.current(live.state(), live.g.selection).journal.stopRequested, false); checks++;
  for (const mode of ["delayed-claim-ack", "delayed-claim-readback"]) {
    const c = simulatedScope(mode); await assert.rejects(c.run()); assert.equal(c.worked(), false);
    assert.equal(A.current(c.state(), c.g.selection).journal.inFlight.enteredAtUTC, at);
    assert.equal(A.current(c.state(), c.g.selection).journal.inFlight.deadlineAtUTC, "2026-10-22T12:01:01.000Z"); checks++;
  }
  const retry = simulatedScope("cas-retry"); await retry.run(); assert.equal(retry.callbacks(), 2);
  assert.equal(A.current(retry.state(), retry.g.selection).journal.inFlight.enteredAtUTC, at);
  assert.equal(A.current(retry.state(), retry.g.selection).journal.inFlight.deadlineAtUTC, "2026-10-22T12:01:01.000Z"); checks++;
  for (const mode of ["delayed-final-ack", "delayed-final-readback"]) {
    const c = simulatedScope(mode);
    await assert.rejects(c.run(s => s.confirmFinalACK(c.makeFinal(mode === "delayed-final-ack"))));
    assert.equal(A.current(c.state(), c.g.selection).journal.state, "closed"); await assert.rejects(c.run()); checks++;
  }
  const uncheckedFinal = simulatedScope("confirmed");
  await assert.rejects(uncheckedFinal.run(s => s.confirmFinalACK(uncheckedFinal.makeFinal())), /sixteen-fresh-controls-required/); checks++;
  const reserved = simulatedScope("confirmed"); await reserved.run(async s => {
    await s.checkControl("unit-enter"); await s.checkControl("before-D");
    const ticket = await s.reserveTicket("D", reserved.g.d.actualRequestHash, dBytes);
    assert.equal(s.assertTicket(ticket), ticket); assert.equal(s.confirmTicket, undefined);
    rejects(() => s.assertTicket(JSON.parse(JSON.stringify(ticket))));
  }); checks++;
  const unknownReserve = simulatedScope("unknown-reserve-ack"); await unknownReserve.run(async s => {
    await s.checkControl("unit-enter"); await s.checkControl("before-D");
    await assert.rejects(s.reserveTicket("D", unknownReserve.g.d.actualRequestHash, dBytes), /UNKNOWN_RESERVE_ACK/);
    const state = await s.readState(), own = s.authority(state), plain = Object.values(own.costs.calls)[0].ticket;
    rejects(() => s.assertTicket(plain)); assert.equal(s.confirmTicket, undefined);
    await assert.rejects(s.reserveTicket("D", unknownReserve.g.d.actualRequestHash, dBytes));
  }); checks++;
  const closedContext = simulatedScope("confirmed"); let releaseLate, lateRead;
  const lateGate = new Promise(resolve => { releaseLate = resolve; });
  await closedContext.run(s => { lateRead = lateGate.then(() => s.currentVerified()); });
  releaseLate(); await assert.rejects(lateRead, /scope-closed/); checks++;
  console.log(JSON.stringify({ pass: true, scope: "SYNTHETIC_LOCAL_UNIT_AUTHORITY_ONLY", checks,
    nativeExecution: false, sourceOriginalQualification: false, unit60Qualified: false }));
}
module.exports = { fixture, start, completion, review, verification, dBytes, rBytes, claimId, at };
if (require.main === module) main().catch(e => { console.error(e.stack); process.exitCode = 1; });
