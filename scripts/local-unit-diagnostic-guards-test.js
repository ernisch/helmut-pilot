"use strict";

// Offline protocol stand-ins only: no original, database, motor or provider is
// opened. Synthetic wall/monotonic clocks test actual consumer boundaries.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const crypto = require("node:crypto");
const A = require("../lib/helmut/local-unit-diagnostic-authority");
const P = require("../lib/helmut/synthetik-500-profile");
const H = require("./local-unit-diagnostic-authority-test");
const sha = value => crypto.createHash("sha256").update(value).digest("hex"), clone = structuredClone;
const source = fs.readFileSync(path.resolve(__dirname, "../lib/helmut/local-unit-diagnostic-scope.js"), "utf8");
let checks = 0;
function harness(mode = "normal") {
  const f = H.fixture(); let state = clone(f.auth), wall = Date.parse(H.at), monotonic = 0n, changes = 0;
  const calls = { authority: 0, runtime: 0, originalControls: 0, inputs: 0, profiles: 0, states: 0, artifacts: 0 }, artifacts = new Map();
  const advance = (wallMs = 1, monoMs = wallMs) => { wall += wallMs; monotonic += BigInt(monoMs) * 1000000n; };
  class Clock extends Date { constructor(value) { super(arguments.length ? value : wall); } static now() { return wall; } }
  const store = {
    async readLocalUnitDiagnosticAuthority() {
      calls.authority++; advance();
      if (mode === "auth-proof-wall") advance(30000, 0);
      if (mode === "auth-proof-monotonic") advance(0, 30000);
      if (mode === "auth-proof-unknown") throw Error("SYNTHETIC_PROOF_UNKNOWN");
      return Object.freeze({});
    },
    consumeLocalUnitDiagnosticAuthority() { return { command: f.command, admission: f.admission, sourceHandle: Object.freeze({}) }; },
    async readLocalUnitDiagnosticRuntime() { calls.runtime++; advance(); return Object.freeze({}); },
    consumeLocalUnitDiagnosticRuntime() { return { ...f.selection, sourceHash: P.hash(f.command.source), targetHash: P.hash(f.command.target), observedAtUTC: new Clock().toISOString() }; },
    async readLocalUnitDiagnosticOriginalControl() {
      calls.originalControls++; advance(); if (mode === "original-control-drift") throw Error("SYNTHETIC_ORIGINAL_CONTROL_DRIFT");
      return { synthetik500DispatchJournal: {}, synthetik500KostenAdmission: {}, testKostenAuftrag: {}, testKostenTage: {},
        ...(mode === "original-control-own-view" ? { ownStateMustNeverAppear: {} } : {}) };
    },
    async readLocalUnitDiagnosticState() {
      calls.states++; advance();
      if (mode === "auth-readback-delayed" && changes === 1) advance(30000);
      if (mode === "final-readback-delayed" && A.current(state, f.selection).journal.state === "closed") advance(60000);
      return clone(state);
    },
    async mutateLocalUnitDiagnosticState(_selection, change) {
      changes++; advance(); const next = clone(state), result = change(next); state = next;
      if (mode === "auth-claim-ack-delayed" && changes === 1) advance(30000);
      if (mode === "auth-claim-ack-unknown" && changes === 1) throw Error("SYNTHETIC_CLAIM_ACK_UNKNOWN");
      if (mode === "reserve-ack-unknown" && changes === 2) throw Error("SYNTHETIC_RESERVE_ACK_UNKNOWN");
      return result;
    },
    async readSynthetik500CurrentInputs() {
      calls.inputs++; advance();
      return mode === "source-drift" ? { documents: [{ id: "different" }], knowledgeObjects: [] } : clone(f.command.drafts[0].sources);
    },
    async getProfileFromDb() { calls.profiles++; advance(); return mode === "profile-drift" ? { id: "different" } : clone(f.command.drafts[0].profile); },
    async getLageEntwurfsbeleg(_owner, id) { calls.artifacts++; advance(); return clone(artifacts.get(id) || null); },
    async readLocalUnitDiagnosticArtifact(_selection, _kind, id) { calls.artifacts++; advance(); return clone(artifacts.get(id) || null); }
  };
  const transport = Object.freeze({}), box = { module: { exports: {} }, structuredClone, Date: Clock, require(name) {
    if (name === "node:process") return { hrtime: { bigint: () => monotonic } };
    if (name === "./storage") return store;
    if (name === "./local-unit-diagnostic-authority") return { ...A,
      // Preserve the real plain-object guards across this labelled VM boundary.
      validateVerification(...args) { args[3] = clone(args[3]); return A.validateVerification(...args); },
      finish(...args) { args[6] = clone(args[6]); return A.finish(...args); }
    };
    if (name === "./synthetik-500-profile") return P;
    if (name === "./synthetik-500-production-command") return require("../lib/helmut/synthetik-500-production-command");
    if (name === "./local-unit-diagnostic-source") return { verifyCommandSource(command) { assert.equal(P.hash(command), f.selection.commandHash); } };
    if (name === "./local-unit-diagnostic-transport") return { prepareOriginals: async () => { advance(); return transport; }, verifyHandle: handle => assert.equal(handle, transport) };
    if (name === "./synthetik-500-local-calendar") return { acceptsInput: () => mode !== "calendar-drift" };
    if (name === "./briefing-lagebindung") return { pruefe: () => ({ eingabeHash: sha("SYNTHETIC-BINDING") }) };
    return require(name);
  } };
  vm.runInNewContext(source, box); const scope = box.module.exports;
  return { f, scope, calls, artifacts, advance, mode, state: () => state, changes: () => changes,
    run: action => scope.runClaimed(f.selection, () => action(scope)),
    stamp: () => new Clock().toISOString() };
}
async function fullControls(h, finish = true) {
  const { f, artifacts } = h, positions = ["mandatsbriefing", "morgenbriefing", "lage"].map(bereich => ({ bereich, owner: f.owner, hash: sha(bereich) }));
  return h.run(async s => {
    await s.checkControl("unit-enter"); await s.checkControl("before-D");
    const dt = await s.reserveTicket("D", f.d.actualRequestHash, H.dBytes);
    await s.beforeSend(dt);
    const dc = H.completion(f, dt);
    await s.mutateState(state => A.account(state, dt, "accounted", 1, dc.usageReceipt.recordHash, dc));
    await s.checkControl("D-accounted"); await s.checkControl("before-R");
    const id = phase => `bf-${f.owner}-lage-pruefentwurf-${f.command.calendar.executionDayUTC}-${f.command.slot.plan.runId}-${phase}`;
    const entry = phase => ({ id: id(phase), user_id: f.owner, payload: { phase, runId: f.command.slot.plan.runId, tag: f.command.calendar.executionDayUTC } });
    const draft = entry("entwurf"); artifacts.set(draft.id, draft);
    if (h.mode !== "missing-immutable-D") artifacts.set(f.d.id, { entry: draft, completion: dc });
    const rb = H.review(f, dc), rt = await s.reserveTicket("R", rb.actualRequestHash, H.rBytes, rb);
    await s.beforeSend(rt);
    await s.mutateState(state => A.account(state, rt, "accounted", 1, sha("SYNTHETIC-R-USAGE")));
    if (h.mode !== "missing-review") artifacts.set(id("pruefung"), entry("pruefung"));
    for (const stage of A.CONTROL_STAGES.slice(9)) await s.checkControl(stage);
    const verification = s.verification();
    assert.equal(verification.controls.length, 16);
    assert(Object.isFrozen(verification) && Object.isFrozen(verification.controls[0]));
    if (!finish) return verification;
    const evidenceHash = sha("SYNTHETIC-EVIDENCE");
    const ack = await s.mutateState(state => {
      s.retain(state, evidenceHash, positions);
      return s.finish(state, evidenceHash, positions, h.stamp());
    });
    await s.confirmFinalACK(ack);
    assert.equal(ack.controlsHash, P.hash(verification.controls));
    assert.equal(ack.authorizationHash, P.hash(verification.authorization));
    return { ack, verification };
  });
}
async function test(name, fn) { await fn(); checks++; console.log("PASS " + name); }
async function main() {
  await test("limits bind Auth30 and exactly16 groups; no larger/reduced contract", () => {
    const f = H.fixture();
    for (const limits of [{ authMs: 30001 }, { authMs: 29999 }, { controlsPerUnit: 15 }, { controlsPerUnit: 17 }]) {
      const c = clone(f.command); Object.assign(c.limits, limits); assert.throws(() => A.validateCommand(c));
    }
  });
  for (const mode of ["auth-proof-wall", "auth-proof-monotonic", "auth-proof-unknown", "auth-readback-delayed", "auth-claim-ack-delayed", "auth-claim-ack-unknown"]) {
    await test(mode + " blocks work and cannot restart", async () => {
      const h = harness(mode); let worked = false;
      await assert.rejects(h.run(() => { worked = true; })); assert.equal(worked, false);
      const reads = h.calls.authority; await assert.rejects(h.run(() => {}), /invocation-already-attempted/);
      assert.equal(h.calls.authority, reads);
      if (mode.startsWith("auth-claim") || mode === "auth-readback-delayed") assert.equal(A.current(h.state(), h.f.selection).journal.state, "running");
    });
  }
  await test("independent monotonic and UTC Unit60 cannot extend one another", async () => {
    for (const [wall, mono] of [[0, 60000], [60000, 0], [-1, 1]]) {
      const h = harness(); await assert.rejects(h.run(s => { h.advance(wall, mono); s.assertClock(); }));
    }
  });
  await test("a complete sixteen-group consumer trace is required before final ACK", async () => {
    const h = harness(), { ack, verification } = await fullControls(h);
    assert.equal(ack.controlCount, 16); assert.equal(ack.full500Accepted, false);
    assert.equal(h.calls.inputs, 16); assert.equal(h.calls.profiles, 16); assert.equal(h.calls.runtime, 17);
    assert.equal(h.calls.originalControls, 16);
    assert.equal(h.calls.artifacts, 3);
    assert.deepEqual(Array.from(verification.controls, x => x.stage), [...A.CONTROL_STAGES]);
    assert.deepEqual(A.current(h.state(), h.f.selection).journal.verification,
      { authorizationHash: ack.authorizationHash, controlsHash: ack.controlsHash, controlCount: 16 });
    await assert.rejects(h.run(() => {}), /invocation-already-attempted/);
  });
  await test("order errors are terminal and cannot be corrected by retry", async () => {
    const h = harness(); await h.run(async s => {
      await assert.rejects(s.checkControl("before-D"), /control-order-or-replay/);
      await assert.rejects(s.checkControl("unit-enter"), /control-order-or-replay/);
      assert.throws(() => s.verification());
    }); assert.equal(h.calls.inputs, 0);
  });
  for (const mode of ["source-drift", "profile-drift", "calendar-drift", "original-control-drift", "original-control-own-view"]) {
    await test(mode + " cannot produce a control receipt", async () => {
      const h = harness(mode); await h.run(async s => {
        await assert.rejects(s.checkControl("unit-enter"));
        await assert.rejects(s.checkControl("unit-enter"), /control-order-or-replay/);
        assert.throws(() => s.verification());
      });
    });
  }
  await test("expired or failed controls retain only private claim ownership for terminal stop", async () => {
    for (const mode of ["normal", "original-control-drift"]) {
      const h = harness(mode); await h.run(async s => {
        if (mode === "normal") h.advance(60000); else await assert.rejects(s.checkControl("unit-enter"));
        assert.throws(() => s.assertClock()); const before = clone(h.state()), own = A.current(before, h.f.selection);
        assert.equal(s.assertClaimOwner(before).claimId, own.journal.claimId);
        const foreign = clone(before); foreign[A.keys(h.f.selection.operationId).journal].claimId = "22222222-2222-4222-8222-222222222222";
        assert.throws(() => s.assertClaimOwner(foreign)); assert.throws(() => s.stop(clone(before), "different-reason"));
        await s.mutateState(state => s.stop(state, "unit-not-confirmed"));
        const after = A.current(h.state(), h.f.selection); assert.equal(after.journal.stopRequested, true); assert.equal(after.journal.reason, "unit-not-confirmed");
        assert.equal(P.hash(after.costs), P.hash(own.costs)); assert.equal(P.hash(after.sends), P.hash(own.sends));
      });
    }
  });
  await test("missing accounted D cannot advance to before-R", async () => {
    const h = harness(); await h.run(async s => {
      await s.checkControl("unit-enter"); await s.checkControl("before-D");
      const t = await s.reserveTicket("D", h.f.d.actualRequestHash, H.dBytes); await s.beforeSend(t);
      await assert.rejects(s.checkControl("D-accounted"), /control-D-accounting/);
      await assert.rejects(s.checkControl("before-R"));
    });
  });
  await test("lost reservation ACK cannot acquire a ticket or retry", async () => {
    const h = harness("reserve-ack-unknown"); await h.run(async s => {
      await s.checkControl("unit-enter"); await s.checkControl("before-D");
      await assert.rejects(s.reserveTicket("D", h.f.d.actualRequestHash, H.dBytes));
      await assert.rejects(s.reserveTicket("D", h.f.d.actualRequestHash, H.dBytes));
      assert.throws(() => s.verification());
    }); assert.equal(h.changes(), 2);
  });
  for (const mode of ["missing-immutable-D", "missing-review"]) {
    await test(mode + " cannot complete all sixteen controls", async () => {
      const h = harness(mode); await assert.rejects(fullControls(h));
      assert.notEqual(A.current(h.state(), h.f.selection).journal.state, "closed");
      await assert.rejects(h.run(() => {}), /invocation-already-attempted/);
    });
  }
  await test("delayed final readback stays closed but never succeeds or retries", async () => {
    const h = harness("final-readback-delayed"); await assert.rejects(fullControls(h));
    assert.equal(A.current(h.state(), h.f.selection).journal.state, "closed");
    await assert.rejects(h.run(() => {}), /invocation-already-attempted/);
  });
  await test("serialized flags, missing groups and changed clocks cannot replace verification", () => {
    const f = H.fixture(), valid = H.verification(f);
    for (const change of [v => v.controls = Array(16).fill({ qualified: true }), v => v.controls.splice(3, 1),
      v => v.authorization.elapsedNs = "30000000000", v => v.controls[15].completedElapsedNs = "60000000000",
      v => v.authorization.commandHash = "0".repeat(64), v => v.controls[3].stage = "reserve-D"]) {
      const v = clone(valid); change(v); assert.throws(() => A.validateVerification(f.command, H.claimId, H.at, v, H.at));
    }
  });
  console.log(JSON.stringify({ pass: true, checks, scope: "SYNTHETIC_OFFLINE_GUARD_CONSUMERS_ONLY", nativeQualification: false,
    databaseCalls: 0, motorCalls: 0, providerCalls: 0, unit60Qualified: false }));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
