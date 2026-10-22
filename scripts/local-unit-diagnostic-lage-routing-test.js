"use strict";

// Routing-only fixtures: evaluate the actual Lage and opaque input modules in
// isolated VMs. The RAM scope is deliberately synthetic, never an admission or
// native proof. Stop before ranking/generation; no database/provider/child/I/O.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const P = require("../lib/helmut/synthetik-500-profile");
const root = path.resolve(__dirname, ".."), lagePath = path.join(root, "lib/helmut/lage.js");
const inputPath = path.join(root, "lib/helmut/synthetik-500-lage-input.js");
const lageSource = fs.readFileSync(lagePath, "utf8"), inputSource = fs.readFileSync(inputPath, "utf8");
const owner = "synthetic-owner", profile = { id: owner, fullName: "Synthetic owner" };
const binding = { version: 1, eingabe: {} }, reached = new Error("routing-test-existing-pipeline-reached");

function fixture({ active = true, ready = false, closed = false, expired = false } = {}) {
  const calls = { scope: 0, clock: 0, readiness: 0, tenants: 0, finite: 0, binding: 0, caches: 0, pipeline: 0 };
  const draft = { profile: structuredClone(profile), briefingDatum: "2026-10-21T12:00:00.000Z", briefingEingabe: binding };
  const command = { version: "helmut-local-unit-diagnostic-command/1", mode: "D-R-1-local-fixture",
    units: [{ subject: owner }], drafts: [draft], slot: { plan: {} } };
  let scopeValue = active ? { command, selection: { operationId: "synthetic-operation", commandHash: "a".repeat(64) } } : null;
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
  const storage = {
    v3StoreReady() { calls.readiness++; return ready; },
    assertTenant(userId) { calls.tenants++; assert.equal(userId, owner); return userId; },
    async getRenderedBriefingV3(userId) { calls.caches++; assert.equal(userId, owner); return null; }
  };
  const eligibility = {
    current: () => ({ hash: null }), assertRecorded() {},
    async filterCandidates() { calls.pipeline++; throw reached; }
  };
  const imports = { "./storage": storage, "./ai": {}, "./matching": {}, "./sourceSafety": {}, "./scoring": {},
    "./matching-erklaerung": {}, "./briefing-frische": {}, "./lage-quellenbeleg": {}, "./briefing-quellenqualitaet": {},
    "./publication-eligibility": eligibility, "./local-unit-diagnostic-scope": scope,
    "./synthetik-500-profile": P, "./synthetik-500-local-calendar": { outputDay: () => "2026-10-22" },
    "./synthetik-500-lage-input": { read(...args) { calls.finite++; return input.read(...args); } },
    "./briefing-lagebindung": { pruefe(_binding, actualProfile, userId, at, options) {
      calls.binding++; assert.equal(userId, owner); assert.equal(P.hash(actualProfile), P.hash(profile));
      assert.equal(at.toISOString(), draft.briefingDatum); assert.equal(options.acceptedSnapshot, true);
      return { ranked: [], sources: {} };
    } } };
  const module = { exports: {} };
  vm.runInNewContext(lageSource, { module, process: { env: {} }, structuredClone, Buffer, console: {
    log() { throw Error("routing-test-unexpected-log"); }, error() { throw Error("routing-test-unexpected-log"); }
  }, require(name) {
    if (name === "crypto") return require("node:crypto");
    if (Object.hasOwn(imports, name)) return imports[name];
    throw Error("routing-test-lage-import-" + name);
  } }, { filename: lagePath });
  return { api: module.exports, calls, profile: structuredClone(profile),
    options: { synthetik500Input: token, briefingEingabe: binding, missingOnly: true, beforeSave() {} },
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
  process.stdout.write("Lage diagnostic routing checks PASS: " + count + "; VM only; native/DB/provider/process/fileWrites=0.\n");
})().catch(error => { process.stderr.write("Lage diagnostic routing checks FAIL at " + current + ": " + error.name + " " + error.message + "\n"); process.exitCode = 1; });
