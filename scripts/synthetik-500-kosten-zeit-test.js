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
console.log(`synthetik-500-kosten-zeit: ${passed}/${passed} offline groups; no Production acceptance.`);
