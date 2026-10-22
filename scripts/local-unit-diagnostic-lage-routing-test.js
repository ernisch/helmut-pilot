"use strict";

// Routing-only fixtures: evaluate the actual Lage and opaque input modules in
// isolated VMs. The RAM scope is deliberately synthetic, never an admission or
// native proof. Pure context stand-ins reach the denied-budget/failure branches;
// no generation, database/provider/child or external I/O is performed.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const P = require("../lib/helmut/synthetik-500-profile");
const root = path.resolve(__dirname, ".."), lagePath = path.join(root, "lib/helmut/lage.js");
const inputPath = path.join(root, "lib/helmut/synthetik-500-lage-input.js");
const adapterPath = path.join(root, "lib/helmut/local-unit-diagnostic-adapter.js");
const lageSource = fs.readFileSync(lagePath, "utf8"), inputSource = fs.readFileSync(inputPath, "utf8");
const adapterSource = fs.readFileSync(adapterPath, "utf8");
const owner = "synthetic-owner", profile = { id: owner, fullName: "Synthetic owner" };
const binding = { version: 1, eingabe: {} }, reached = new Error("routing-test-existing-pipeline-reached");

function fixture({ active = true, ready = false, closed = false, expired = false, budgetDeny = false } = {}) {
  const calls = { scope: 0, clock: 0, readiness: 0, tenants: 0, finite: 0, binding: 0, caches: 0, pipeline: 0,
    budget: 0, usage: 0, generation: 0, acquire: 0, release: 0, controls: [], failureEvidence: 0, stop: 0, usageEntries: [] };
  const draft = { profile: structuredClone(profile), briefingDatum: "2026-10-21T12:00:00.000Z", briefingEingabe: binding };
  const command = { version: "helmut-local-unit-diagnostic-command/1", mode: "D-R-1-local-fixture",
    units: [{ subject: owner, intentIds: ["synthetic-D", "synthetic-R"] }], drafts: [draft],
    slot: { plan: { runId: "nachlauf500-123456", intents: [{ inputVersionHash: "c".repeat(64) }, { maxOutputTokens: 6000 }] } } };
  const selection = { operationId: "localUnitDiagnostic-" + "a".repeat(32), commandHash: "a".repeat(64) };
  let scopeValue = active ? { command, selection } : null;
  let scopeClosed = false;
  const scope = {
    currentVerified() { calls.scope++; if (scopeClosed) throw Error("synthetic-closed-scope"); return scopeValue; },
    assertClock() { calls.clock++; if (expired) throw Error("synthetic-scope-clock"); }
  };
  const inputModule = { exports: {} };
  vm.runInNewContext(inputSource, { module: inputModule, structuredClone, require(name) {
    if (name === "./synthetik-500-profile") return P;
    if (name === "./local-unit-diagnostic-scope") return scope;
    if (name === "./synthetik-500-local-calendar") return { acceptsInput: () => true };
    if (name === "./synthetik-500-date-binding") return { isHistorical: () => false };
    if (name === "./synthetik-500-eu-service-contract") return { isPlan: () => false };
    throw Error("routing-test-input-import-" + name);
  } }, { filename: inputPath });
  const input = inputModule.exports;
  // Actual WeakMap-backed token construction/read, with only synthetic data.
  const token = input.create(draft, command.slot.plan);
  scopeClosed = closed;
  const lease = Object.freeze({ synthetic: "RAM-only lease handle" });
  const storage = {
    v3StoreReady() { calls.readiness++; return ready; },
    assertTenant(userId) { calls.tenants++; assert.equal(userId, owner); return userId; },
    async getRenderedBriefingV3(userId) { calls.caches++; assert.equal(userId, owner); return null; },
    pipelineLockLeaseEnabled: () => true,
    async acquirePipelineLockLease(job) { calls.acquire++; assert.equal(job, "lage-briefing-" + owner); return lease; },
    async releasePipelineLockLease(handle) { calls.release++; assert.equal(handle, lease); return true; },
    async canSpendLlmForTenant(userId) { calls.budget++; assert.equal(userId, owner); return { allowed: false, reason: "synthetic-budget-denied" }; },
    recordLlmUsage(entry) {
      calls.usage++; calls.usageEntries.push(entry);
      const result = active ? Promise.reject(Error("synthetic-ticket-required")) : Promise.resolve(null);
      // A regression is counted without crashing the test runner itself.
      result.catch(() => {}); return result;
    },
    async synthetik500ReviewStorageContract() {},
    async readSynthetik500CurrentInputs() { throw Error("routing-test-unexpected-source-read"); },
    async getProfileFromDb() { throw Error("routing-test-unexpected-profile-read"); },
    async retainLocalUnitDiagnosticEvidence(_selection, value) {
      assert.equal(P.hash(_selection), P.hash(selection)); assert.equal(value.failure, "unit-not-confirmed"); calls.failureEvidence++;
    },
    async readLocalUnitDiagnosticEvidence() { throw Error("routing-test-unexpected-success-read"); }
  };
  const eligibility = {
    current: () => ({ hash: null }), assertRecorded() {}, assertSame() {}, bindCache: value => value,
    async filterCandidates() { calls.pipeline++; if (!budgetDeny) throw reached; return [{ vorgang_id: "synthetic-vorgang" }]; }
  };
  const imports = { "./storage": storage, "./ai": { async generateLageBriefing() { calls.generation++; throw Error("routing-test-unexpected-generation"); } },
    "./matching": {}, "./sourceSafety": { guardKnowledgeObject: () => ({ status: "safe" }) }, "./scoring": {},
    "./matching-erklaerung": {}, "./briefing-frische": {}, "./lage-quellenbeleg": {}, "./briefing-quellenqualitaet": {},
    "./publication-eligibility": eligibility, "./local-unit-diagnostic-scope": scope,
    "./synthetik-500-profile": P, "./synthetik-500-local-calendar": { outputDay: () => "2026-10-22" },
    "./synthetik-500-lage-input": { read(...args) { calls.finite++; return input.read(...args); } },
    "./briefing-lagebindung": { pruefe(_binding, actualProfile, userId, at, options) {
      calls.binding++; assert.equal(userId, owner); assert.equal(P.hash(actualProfile), P.hash(profile));
      assert.equal(at.toISOString(), draft.briefingDatum); assert.equal(options.acceptedSnapshot, true);
      return { ranked: [], sources: {} };
    } } };
  if (budgetDeny) {
    imports["./briefing-quellenqualitaet"].themenrein = () => true;
    imports["./lage-quellenbeleg"] = { baueEingabe: () => [{ vorgang_id: "synthetic-vorgang" }], hashEingabe: () => "d".repeat(64) };
    imports["./briefing-speicher"] = { hash: P.hash };
    imports["./briefing-ereignisteilmitglieder"] = { lageKarte: card => card };
  }
  const module = { exports: {} };
  const pureContext = budgetDeny ? "\nkoToVorgangCard=ko=>({vorgangId:ko.vorgang_id,sources:[]});selectLageVorgaenge=cards=>cards;mapAbsatzQuellen=()=>({});" : "";
  vm.runInNewContext(lageSource + pureContext, { module, process: { env: {} }, structuredClone, Buffer, console: {
    log() { throw Error("routing-test-unexpected-log"); }, error() { throw Error("routing-test-unexpected-log"); }
  }, require(name) {
    if (name === "crypto") return require("node:crypto");
    if (Object.hasOwn(imports, name)) return imports[name];
    throw Error("routing-test-lage-import-" + name);
  } }, { filename: lagePath });
  return { api: module.exports, calls, profile: structuredClone(profile),
    options: { synthetik500Input: token, briefingEingabe: binding, missingOnly: true, beforeSave() {}, beforeGenerate() {} },
    async adapterFailure() {
      // Exercise the actual adapter catch/stop with only RAM scope/storage
      // boundaries, not a native claim, authority, ACK or execution proof.
      const at = new Date(), entered = { index: 0, enteredAtUTC: at.toISOString(), deadlineAtUTC: new Date(at.getTime() + 60000).toISOString() };
      Object.assign(scope, { runClaimed: async (_selection, work) => work(),
        readState: async () => ({}), authority: () => ({ journal: { inFlight: entered } }),
        mutateState: async change => change({}), costAdmission: () => ({}), confirmFinalACK() { throw Error("routing-test-unexpected-final-ack"); },
        async checkControl(stage) { calls.controls.push(stage); }, verification() {},
        stop(_state, reason) { assert.equal(reason, "unit-not-confirmed"); calls.stop++; } });
      const adapter = { exports: {} };
      vm.runInNewContext(adapterSource, { module: adapter, structuredClone, require(name) {
        if (name === "./synthetik-500-profile") return P;
        if (name === "./synthetik-500-production-command") return require("../lib/helmut/synthetik-500-production-command");
        if (name === "./synthetik-500-local-calendar") return imports[name];
        if (name === "./synthetik-500-lage-input") return input;
        if (name === "./local-unit-diagnostic-scope") return scope;
        if (name === "./storage") return storage;
        if (name === "./lage") return module.exports;
        throw Error("routing-test-adapter-import-" + name);
      } }, { filename: adapterPath });
      return adapter.exports.execute(selection);
    },
    changeSelection() { scopeValue = { ...scopeValue, selection: { ...scopeValue.selection, commandHash: "b".repeat(64) } }; } };
}

let count = 0, current = "initialization";
async function check(name, fn) { current = name; await fn(); count++; }
function noPipeline(s) { assert.equal(s.calls.pipeline + s.calls.caches, 0); }
(async () => {
  await check("active own scope reaches existing binding and pipeline without elevating V3 readiness", async () => {
    const s = fixture(); await assert.rejects(s.api.buildLageBriefing(s.profile, s.options), e => e === reached);
    assert.equal(s.calls.clock, 1); assert.equal(s.calls.tenants, 1); assert.equal(s.calls.readiness, 0);
    assert.equal(s.calls.finite, 1); assert.equal(s.calls.binding, 1); assert.equal(s.calls.pipeline, 1);
  });
  await check("inactive V3-disabled production remains unavailable before input reads", async () => {
    const s = fixture({ active: false }); const result = await s.api.buildLageBriefing(s.profile, s.options);
    assert.equal(result.available, false); assert.equal(result.reason, "v3-disabled");
    assert.equal(s.calls.readiness, 1); assert.equal(s.calls.clock + s.calls.finite + s.calls.binding, 0); noPipeline(s);
  });
  await check("inactive ready production retains its existing bound-input path", async () => {
    const s = fixture({ active: false, ready: true }); await assert.rejects(s.api.buildLageBriefing(s.profile, s.options), e => e === reached);
    assert.equal(s.calls.readiness, 1); assert.equal(s.calls.clock, 0); assert.equal(s.calls.finite, 1); assert.equal(s.calls.binding, 1);
  });
  await check("foreign subject cannot use an active scope", async () => {
    const s = fixture(); await assert.rejects(s.api.buildLageBriefing({ ...s.profile, id: "foreign-owner" }, s.options));
    assert.equal(s.calls.finite, 0); noPipeline(s);
  });
  await check("same subject with changed profile fails actual opaque-input verification", async () => {
    const s = fixture(); await assert.rejects(s.api.buildLageBriefing({ ...s.profile, fullName: "Changed synthetic name" }, s.options), /profile-drift$/);
    assert.equal(s.calls.binding, 0); noPipeline(s);
  });
  await check("missing finite input or noninsert mode cannot borrow scope readiness", async () => {
    for (const patch of [{ synthetik500Input: null }, { missingOnly: false }]) {
      const s = fixture(); await assert.rejects(s.api.buildLageBriefing(s.profile, { ...s.options, ...patch }), /lage-scope-input$/);
      assert.equal(s.calls.finite, 0); noPipeline(s);
    }
  });
  await check("caller JSON is not an opaque finite input", async () => {
    const s = fixture(); await assert.rejects(s.api.buildLageBriefing(s.profile, { ...s.options, synthetik500Input: {} }), /profile-drift$/);
    assert.equal(s.calls.binding, 0); noPipeline(s);
  });
  await check("opaque input cannot move between selections", async () => {
    const s = fixture(); s.changeSelection(); await assert.rejects(s.api.buildLageBriefing(s.profile, s.options), /lage-input-scope$/);
    assert.equal(s.calls.binding, 0); noPipeline(s);
  });
  await check("closed or expired scope cannot fall through to ready production", async () => {
    for (const settings of [{ closed: true, ready: true }, { expired: true, ready: true }]) {
      const s = fixture(settings); await assert.rejects(s.api.buildLageBriefing(s.profile, s.options), /synthetic-(closed-scope|scope-clock)$/);
      assert.equal(s.calls.readiness + s.calls.finite, 0); noPipeline(s);
    }
  });
  await check("existing binding, repair and generation-option checks remain before reads/writes", async () => {
    for (const patch of [{ beforeSave: null }, { repairIncomplete: true, missingOnly: false }, { force: true },
      { cacheOnly: true }, { countOnly: true }, { pruefaufwandNachweis: true, beforeGenerate: null }]) {
      const s = fixture(); await assert.rejects(s.api.buildLageBriefing(s.profile, { ...s.options, ...patch })); noPipeline(s);
    }
  });
  await check("native budget denial creates no ticketless usage and releases the lease exactly once", async () => {
    const s = fixture({ budgetDeny: true }), result = await s.api.buildLageBriefing(s.profile, s.options);
    assert.equal(result.available, false); assert.equal(result.reason, "budget");
    assert.equal(s.calls.budget, 1); assert.equal(s.calls.usage, 0); assert.equal(s.calls.generation, 0);
    assert.equal(s.calls.acquire, 1); assert.equal(s.calls.release, 1);
  });
  await check("inactive budget denial preserves the single original Legacy skip-telemetry call", async () => {
    const s = fixture({ active: false, ready: true, budgetDeny: true }), result = await s.api.buildLageBriefing(s.profile, s.options);
    assert.equal(result.available, false); assert.equal(result.reason, "budget");
    assert.equal(s.calls.usage, 1); assert.equal(s.calls.generation, 0); assert.equal(s.calls.release, 1);
    assert.equal(JSON.stringify(s.calls.usageEntries[0]), JSON.stringify({ callType: "skipped-lage-narrativ", politicianId: owner,
      keinAufruf: true, success: false, error: "synthetic-budget-denied" }));
  });
  await check("native budget denial reaches the actual adapter failure-evidence and stop branches", async () => {
    const s = fixture({ budgetDeny: true });
    await assert.rejects(s.adapterFailure(), error => error.message === "local-unit-diagnostic-stopped-or-unknown"
      && error.cause?.message === "local-unit-diagnostic-motor-fresh-lage-not-confirmed");
    assert.equal(s.calls.budget, 1); assert.equal(s.calls.usage, 0); assert.equal(s.calls.generation, 0);
    assert.equal(s.calls.acquire, 1); assert.equal(s.calls.release, 1);
    assert.equal(s.calls.failureEvidence, 1); assert.equal(s.calls.stop, 1);
    assert.equal(JSON.stringify(s.calls.controls), JSON.stringify(["unit-enter", "before-D"]));
  });
  process.stdout.write("Lage diagnostic routing checks PASS: " + count + "; VM only; native/DB/provider/process/fileWrites=0.\n");
})().catch(error => { process.stderr.write("Lage diagnostic routing checks FAIL at " + current + ": " + error.name + " " + error.message + "\n"); process.exitCode = 1; });
