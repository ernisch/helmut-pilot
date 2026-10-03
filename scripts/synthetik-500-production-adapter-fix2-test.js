"use strict";

// New FPA3 actual Journal-error boundary; no old passed suites or network.
const assert = require("node:assert/strict"), J = require("../lib/helmut/synthetik-500-dispatch-journal"),
  Guard = require("../lib/helmut/synthetik-500-u-guard");
const noNet = () => { throw Error("new FPA3 fixture forbids network"); };
global.fetch = noNet; require("node:https").request = noNet; require("node:http").request = noNet;
const start = "2030-01-02T12:00:00.000Z", end = "2030-01-02T13:00:00.000Z", operation = "fictional-only", hash = "a".repeat(64);
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
function fixture() {
  const auth = { synthetik500KostenAdmission: { planHash: hash, plan: { startsAtUTC: start, endsAtUTC: end } },
    [J.KEY]: { version: J.VERSION, activeOperationId: operation, operations: { [operation]: {
      operationId: operation, commandHash: hash, planHash: hash, claimId: "fictional-claim", state: "running",
      stopRequested: false, units: [], attempts: {} } } } };
  let writes = 0, cleanup = 0;
  const actualExpiredControl = () => J.bind(auth, hash, "fictional-claim", end);
  const effect = async () => { writes++; };
  const deps = { save: effect, saveSources: effect, savePending: effect, markFailed: effect, writeUpdateRetries: effect,
    recordGateParkung: effect, markGateGeparkt: effect, releaseGateGeparkt: effect, requestUnderstanding: effect,
    verstehenVertrag: () => ({ reserviere: effect, modellstart: effect, schreibrecht: effect, speichere: effect,
      vormerkungErhoehe: effect, vormerkungLoese: effect, freigabeOhneAufruf: async () => { cleanup++; },
      ausgangUnbekannt: async () => { cleanup++; } }) };
  Guard.attach(deps, actualExpiredControl, actualExpiredControl);
  return { deps, actualExpiredControl, counts: () => ({ writes, cleanup }) };
}
async function main() {
  await test("real expired J.bind marker is stripped at every mutation and native-effect guard", async () => {
    const f = fixture(); assert.throws(f.actualExpiredControl, e => e.kiNichtGesendet === true);
    for (const name of ["save", "saveSources", "savePending", "markFailed", "writeUpdateRetries", "recordGateParkung", "markGateGeparkt", "releaseGateGeparkt"])
      await assert.rejects(f.deps[name](), e => e.message === "synthetik500-production-u-mutation-guard" && e.kiNichtGesendet === undefined && e.code === undefined);
    const contract = f.deps.verstehenVertrag();
    for (const name of ["reserviere", "modellstart", "schreibrecht", "speichere", "vormerkungErhoehe", "vormerkungLoese"])
      await assert.rejects(contract[name](), e => e.kiNichtGesendet === undefined && e.code === undefined);
    assert.deepEqual(f.counts(), { writes: 0, cleanup: 0 });
  });
  await test("the same actual expired J.bind retains genuine proof only at pre-provider hooks", async () => {
    const f = fixture();
    for (const name of ["beforeUnderstandingMutation", "beforeUnderstandingReservation", "requestUnderstanding"])
      await assert.rejects(f.deps[name](), e => e.code === Guard.CODE && e.kiNichtGesendet === true);
    await assert.rejects(Guard.provedPreSend(f.actualExpiredControl), e => e.code === Guard.CODE && e.kiNichtGesendet === true);
    assert.deepEqual(f.counts(), { writes: 0, cleanup: 0 });
  });
  await test("expiry leaves honest native release and unknown recording available with no dispatch", async () => {
    const f = fixture(), contract = f.deps.verstehenVertrag();
    await contract.freigabeOhneAufruf(); await contract.ausgangUnbekannt();
    assert.deepEqual(f.counts(), { writes: 0, cleanup: 2 });
  });
  console.log(JSON.stringify({ newFixChecks: passed, production: false, native: false, modelCalls: 0 }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
