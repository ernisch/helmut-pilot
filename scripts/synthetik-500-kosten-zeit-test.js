"use strict";
// Offline regression for the cost/time calculation; no provider or database.
const A = require("node:assert/strict"), C = require("./synthetik-500-kosten-zeit");
let passed = 0;
function test(name, fn) { fn(); passed++; console.log("ok " + name); }
test("scopes retain private reserve and count external binding once", () => {
  const r = C.analyze(), m = r.money;
  A.equal(m.orderBoundIncludingPrivateMicroUsd, 7445364);
  A.equal(m.orderHeadroomAt7MicroUsd, -445364); A.equal(m.orderHeadroomAt20MicroUsd, 12554636);
  A.equal(m.globalBoundMicroUsd, 16718966); A.equal(m.conservativeGlobalIncludingPrivateMicroUsd, 17354966);
  A.equal(m.datedDayHeadroomMicroUsd, 5984894); A.equal(m.firstCallFundedAt7, false);
  A.equal(m.datedMaxConcurrentAt7, 0); A.equal(m.datedMaxConcurrentAt20, 28);
  A.equal(m.conservativeDatedDayHeadroomMicroUsd, 5348894);
  A.equal(m.conservativeDatedMaxConcurrentAt20, 25);
  A.equal(m.datedConcurrencyAssumesPrivateReserveOutsideObservedDay, true);
});
test("even proven private overlap cannot fund next full reserve at7", () => {
  const r = C.analyze({ observation: { ...C.HISTORICAL_OBSERVATION, privateAdditionalMicroUsd: 0 } });
  A.equal(r.money.orderHeadroomAt7MicroUsd, 190636); A.equal(r.money.firstCallFundedAt7, false);
});
test("reserve sum differs from sequential peak and output caps are not minimum spend", () => {
  const m = C.analyze({ understandingCalls: 0, otherPaidCalls: 0 }).money;
  A.equal(m.sumDRIndividualReservesMicroUsd, 212000000); A.equal(m.sequentialKnownPeakReserveMicroUsd, 212000);
  A.equal(m.sumAllIndividualReservesMicroUsd, 212000000); A.equal(m.outputCapsOnlyDRMicroUsd, 12000000);
  A.equal(m.outputCapsAreNotMinimumCost, true); A.equal(m.wholeRunMaximumCostMicroUsd, null);
  const r = C.analyze({ reviewMaxOutputTokens: 6000 }).money;
  A.equal(r.sumDRIndividualReservesMicroUsd, 218000000); A.equal(r.reviewReserveMicroUsd, 224000);
  A.equal(r.datedMaxConcurrentAt20, 26); A.equal(r.outputCapsOnlyDRMicroUsd, 18000000);
});
test("unknown counts and other paid tariffs never become zero or text charges", () => {
  A.equal(C.analyze().calls.totalCalls, null); A.equal(C.analyze().money.sumAllIndividualReservesMicroUsd, null);
  const r = C.analyze({ understandingCalls: 2, otherPaidCalls: 0 });
  A.equal(r.calls.totalCalls, 1002); A.equal(r.money.sumAllIndividualReservesMicroUsd, 212424000);
  const other = C.analyze({ understandingCalls: 0, otherPaidCalls: 1 });
  A.equal(other.calls.totalCalls, null); A.equal(other.money.sumAllIndividualReservesMicroUsd, null);
});
test("token ceiling and time scenarios never claim measured sizes or a guaranteed four-hour run", () => {
  const r = C.analyze(); A.equal(r.inputs.expectedInputTokens, null);
  A.equal(r.time.drProviderTimeoutEnvelopeMs, 20000000); A.equal(r.time.windowMaxMs, 14400000);
  A.equal(r.time.averageAvailableMsPerDRCallIgnoringUAndOverhead, 14400);
  A.equal(r.time.observedRuntimeMs, null); A.equal(r.time.providerWindowGuaranteed, false);
  A.deepEqual(r.time.scenarios.map(x => x.drProviderMsIgnoringOverhead), [5000000, 10000000, 15000000, 20000000]);
});
test("malformed values, overflow and inconsistent scopes fail closed", () => {
  for (const x of [-1, 1.2, "0", NaN, Infinity, 4001]) A.throws(() => C.analyze({ understandingCalls: x }));
  for (const x of [null, "0", -1, 0.1, NaN]) A.throws(() => C.analyze({ observation: { ...C.HISTORICAL_OBSERVATION, orderOpenMicroUsd: x } }));
  A.throws(() => C.analyze({ observation: { ...C.HISTORICAL_OBSERVATION, orderOpenMicroUsd: Number.MAX_SAFE_INTEGER } }));
  A.throws(() => C.analyze({ observation: { ...C.HISTORICAL_OBSERVATION, observedAtUTC: "2026-02-31T23:05:51.000Z" } }));
  A.throws(() => C.analyze({ observation: { ...C.HISTORICAL_OBSERVATION, externalAlreadyIncludedMicroUsd: 7000000 } }));
  A.throws(() => C.analyze({ reviewMaxOutputTokens: 1000 }));
});
test("no mutation, readiness or budget change follows a calculation", () => {
  const observation = { ...C.HISTORICAL_OBSERVATION }, before = JSON.stringify(observation);
  const r = C.analyze({ observation, understandingCalls: 0, otherPaidCalls: 0 });
  A.equal(JSON.stringify(observation), before); A.equal(Object.isFrozen(C.HISTORICAL_OBSERVATION), true);
  for (const key of ["productionReady", "executionReady", "blockersComplete", "observationIsFreshStartWitness"]) A.equal(r[key], false);
  A.equal(r.limits.budgetsChanged, false); A.equal(r.limits.dailyMicroUsd, 6000000);
  A.equal(r.limits.existing500ProofMicroUsd, 7000000); A.equal(r.limits.storedV4OrderMicroUsd, 20000000);
});
test("CI cost area includes this calculation and its regression", () => {
  const B = require("./bereichsauswahl"), suite = "synthetik-500-kosten-zeit-test.js";
  const r = B.bereichsSuiten(["scripts/synthetik-500-kosten-zeit.js"], [suite], new Set());
  A.deepEqual(r.bereiche, ["500-nachweis"]); A.deepEqual(r.suiten, [suite]); A.equal(r.konservativ, false);
});
const sheet = (U = null) => ({ version: C.SHEET_VERSION, observation: { ...C.HISTORICAL_OBSERVATION },
  understandingCalls: U, otherPaidCalls: 0, reviewMaxOutputTokens: 3000, tokenRows: null, callCounter: null });
const tokenRows = () => Array.from({ length: 1000 }, (_, i) => ({ phase: i % 2 ? "R" : "D",
  positionKey: "offline-position-" + i, inputBytes: 120, expectedInputTokens: 1001,
  expectedOutputTokens: 100, upperInputTokens: 1001 }));
test("worksheet preserves unknowns and never converts scenarios into approval", () => {
  const s = sheet(), before = JSON.stringify(s), r = C.worksheet(s);
  A.equal(r.tokens, null); A.equal(r.counter, null); A.equal(r.timeScenarios, null);
  A.equal(r.affordability.reserveAndUpperCostFitProposed20, null);
  for (const k of ["budgetsChanged", "executionReady", "productionReady", "blocker3Complete"]) A.equal(r[k], false);
  A.equal(JSON.stringify(s), before);
});
test("per-call rounding, conditional maximum and next reserve differ from estimates", () => {
  const s = { ...sheet(0), tokenRows: tokenRows() }, r = C.worksheet(s), t = r.tokens;
  A.equal(t.expectedCostMicroUsd, 901000); A.equal(t.conditionalCostUpperBoundMicroUsd, 12501000);
  A.equal(t.requiredIncrementalHeadroomForEveryReserveMicroUsd, 12700499);
  A.equal(t.expectedInputTokens.sum, 1001000); A.equal(t.expectedInputTokens.median, 1001);
  A.equal(t.byPhase.D.calls, 500); A.equal(t.byPhase.R.calls, 500);
  A.equal(r.affordability.reserveAndUpperCostFitProposed20, false); // day6 still binds
  A.equal(t.actualUsageProven, false); A.equal(r.executionReady, false);
});
test("full existing output caps already exceed day6 even at zero input", () => {
  const rows = tokenRows().map(r => ({ ...r, expectedInputTokens: 0, upperInputTokens: 0 }));
  A.equal(C.worksheet({ ...sheet(0), tokenRows: rows }).tokens.conditionalCostUpperBoundMicroUsd, 12000000);
  A.equal(C.worksheet({ ...sheet(0), reviewMaxOutputTokens: 6000, tokenRows: rows })
    .tokens.conditionalCostUpperBoundMicroUsd, 18000000);
});
test("missing, duplicate and out-of-bound token positions fail without partial whole budget", () => {
  const s = { ...sheet(0), tokenRows: tokenRows() };
  for (const change of [rows => rows.pop(), rows => rows[1].positionKey = rows[0].positionKey,
    rows => rows[0].phase = "R", rows => rows[0].expectedOutputTokens = 3001,
    rows => rows[0].upperInputTokens = 400001]) {
    const rows = structuredClone(s.tokenRows); change(rows);
    A.throws(() => C.worksheet({ ...s, tokenRows: rows }), /synthetik500-kostenzeit-/);
  }
  A.throws(() => C.worksheet({ ...s, otherPaidCalls: 1 }), /cardinality/);
});
test("noU phase and protectedU floor do not invent a higher required raw limit", () => {
  const c = { dailyLimit: 4000, used: 900, understandingReserve: 702, sharedReserve: 10000 };
  A.equal(C.worksheet({ ...sheet(0), callCounter: c }).counter.countFits, true);
  const r = C.worksheet({ ...sheet(48), callCounter: { ...c, used: 0 } });
  A.equal(r.counter.countFits, true); A.equal(r.counter.requiredDailyLimitIgnoringOtherTraffic, 1750);
});
test("actual20 start reader and actual7 end guard accept different scopes", () => {
  const K = require("../lib/helmut/testkosten-budget"), N = require("../lib/helmut/synthetik-500-nachweis");
  const day = "2026-10-07", auth = { llmUsage: [], [K.KEY]: { [day]: { version: K.VERSION, day,
    tarif: K.konfiguration().tarif, limit: K.LIMIT_MICRO_USD, spent: 0, baseline: 0,
    baselineCalls: 0, manualCalls: 0, manualUntil: null, calls: {}, frozen: null } },
  [K.AUFTRAG_KEY]: { version: 4, id: "offline-order", abTag: day, limit: 20000000, externGebunden: 6809364 } };
  A.equal(K.pruefeStart(auth, day, { ok: true, used: 0 }).startklar, true);
  const plan = { startsAt: day + "T09:00:00.000Z", endsAt: day + "T10:00:00.000Z", sollpositionen: [], paketBindung: {} };
  const costErrors = (spent, reserved = 0, daySpent = 0) => N.belegePruefen(plan, { kosten: {
    gelesenAm: day + "T10:01:00.000Z", utcTage: [{ tag: day, verbrauchtUsd: daySpent, reserviertUsd: 0 }],
    auftragVerbrauchtUsd: spent, auftragReserviertUsd: reserved, primaerbeleg: "offline-only-cost-projection" } })
    .filter(x => x === "kostenbeleg-fehlt-oder-grenze-verletzt");
  A.deepEqual(costErrors(7), []); A.equal(costErrors(7.000001).length, 1);
  A.equal(costErrors(6.809364, 0.636).length, 1); A.equal(costErrors(6, 0, 6.000001).length, 1);
  // Only the cost predicate was tested: these incomplete fixtures never prove a500 run.
});
async function capacityCases() {
  const S = require("../lib/helmut/storage"), vars = ["HELMUT_MAX_LLM_CALLS_PER_DAY", "HELMUT_LLM_RESERVE_UNDERSTANDING",
    "HELMUT_TESTLAUF_VORRANG_REAL", "HELMUT_TENANT_LLM_CAP", "HELMUT_LLM_BUDGET_FAIL_CLOSED"];
  const saved = Object.fromEntries(vars.map(k => [k, process.env[k]]));
  try {
    delete process.env.HELMUT_MAX_LLM_CALLS_PER_DAY;
    test("code fallback50 is not a measured current production limit", () => A.equal(S.llmDailyCallLimit(), 50));
    Object.assign(process.env, { HELMUT_MAX_LLM_CALLS_PER_DAY: "2416", HELMUT_LLM_RESERVE_UNDERSTANDING: "702",
      HELMUT_TESTLAUF_VORRANG_REAL: "200", HELMUT_TENANT_LLM_CAP: "0", HELMUT_LLM_BUDGET_FAIL_CLOSED: "1" });
    const params = [], rpc = async p => { params.push(p); return { allowed: true, used: 1 }; };
    await S.reserveLlmCall({ politicianId: "test-kohorte-synthetik-bt-001", callType: "lageBriefing", deps: { rpc } });
    await S.reserveLlmCall({ callType: "understanding", deps: { rpc } });
    test("actual reservation path uses1714 forDR and2216 forU in historical scenario", () => {
      A.deepEqual(params.map(p => [p.p_scope, p.p_max]), [["global", 1714], ["global", 2216]]);
      const r = C.worksheet({ ...sheet(48), callCounter: { dailyLimit: 2416, used: 0, understandingReserve: 702, sharedReserve: 200 } });
      A.equal(r.counter.requiredDailyLimitIgnoringOtherTraffic, 1750); A.equal(r.counter.countFits, true);
      A.equal(r.counter.providedValuesAreNotProductionProof, true); A.equal(r.executionReady, false);
    });
    test("infrastructure failclosed flag is separate from missing-value fallback", () => {
      A.equal(S.llmBudgetFailResult(2416).allowed, false);
      process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED = "0";
      A.equal(S.llmBudgetFailResult(2416).allowed, true);
    });
  } finally { for (const k of vars) saved[k] === undefined ? delete process.env[k] : process.env[k] = saved[k]; }
  console.log(`synthetik-500-kosten-zeit: ${passed}/${passed} offline groups; no Production acceptance.`);
}
capacityCases().catch(error => { console.error(error); process.exitCode = 1; });
