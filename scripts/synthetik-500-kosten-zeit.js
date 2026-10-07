"use strict";
// Offline calculation only. No runtime admission, provider, store or budget write.
const K = require("../lib/helmut/testkosten-budget");
const HISTORICAL_OBSERVATION = Object.freeze({
  observedAtUTC: "2026-10-06T23:05:51.000Z", day: "2026-10-06",
  source: "docs/betrieb/pre500-client-sicherung-20261007.md",
  orderSpentIncludingExternalMicroUsd: 6809364, orderOpenMicroUsd: 0,
  externalAlreadyIncludedMicroUsd: 5195303, privateAdditionalMicroUsd: 636000,
  globalSpentMicroUsd: 13542966, globalOpenMicroUsd: 3176000,
  historicalDaySpentMicroUsd: 15106, historicalDayOpenMicroUsd: 0
});
const fail = code => { throw new Error("synthetik500-kostenzeit-" + code); };
function integer(x) {
  if (!Number.isSafeInteger(x) || x < 0) fail("integer-required");
  return x;
}
function sum(...xs) { return integer(xs.reduce((n, x) => n + integer(x), 0)); }
function count(x) { if (x === null) return null; integer(x); if (x > 4000) fail("count-bound"); return x; }
function analyze({ observation = HISTORICAL_OBSERVATION, understandingCalls = null,
  reviewMaxOutputTokens = 3000, otherPaidCalls = null } = {}) {
  if (!observation || typeof observation !== "object" || Array.isArray(observation)) fail("observation-required");
  const o = observation;
  for (const key of Object.keys(HISTORICAL_OBSERVATION).filter(k => k.endsWith("MicroUsd"))) integer(o[key]);
  if (typeof o.observedAtUTC !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(o.observedAtUTC)
    || !Number.isFinite(Date.parse(o.observedAtUTC)) || new Date(o.observedAtUTC).toISOString() !== o.observedAtUTC
    || o.day !== o.observedAtUTC.slice(0, 10) || typeof o.source !== "string" || !o.source.trim()) fail("observation-binding");
  if (o.externalAlreadyIncludedMicroUsd > o.orderSpentIncludingExternalMicroUsd
    || o.globalSpentMicroUsd < o.orderSpentIncludingExternalMicroUsd - o.externalAlreadyIncludedMicroUsd) fail("scope-inconsistent");
  const U = count(understandingCalls), other = count(otherPaidCalls);
  if (![3000, 6000].includes(reviewMaxOutputTokens)) fail("review-limit");
  const dReserve = Math.round(K.reservierungHoeheUsd(3000) * 1e6);
  const rReserve = Math.round(K.reservierungHoeheUsd(reviewMaxOutputTokens) * 1e6);
  const peak = Math.max(dReserve, rReserve);
  const drGross = integer(500 * sum(dReserve, rReserve));
  const order = sum(o.orderSpentIncludingExternalMicroUsd, o.orderOpenMicroUsd, o.privateAdditionalMicroUsd);
  const day = sum(o.historicalDaySpentMicroUsd, o.historicalDayOpenMicroUsd);
  const dayRest = K.LIMIT_MICRO_USD - day;
  const conservativeDayRest = dayRest - o.privateAdditionalMicroUsd;
  const rest7 = K.AUFTRAG_V3_LIMIT_MICRO_USD - order, rest20 = K.AUFTRAG_V4_LIMIT_MICRO_USD - order;
  const totalCalls = U !== null && other === 0 ? sum(1000, U) : null;
  return {
    version: "helmut-synthetik500-offline-kostenzeit/1", mode: "dated-offline-calculation",
    observation: { ...o }, observationIsFreshStartWitness: false,
    productionReady: false, executionReady: false, blockersComplete: false,
    limits: { dailyMicroUsd: K.LIMIT_MICRO_USD, storedV4OrderMicroUsd: K.AUFTRAG_V4_LIMIT_MICRO_USD,
      existing500ProofMicroUsd: K.AUFTRAG_V3_LIMIT_MICRO_USD, budgetsChanged: false },
    calls: { model: "gpt-5-mini", D: 500, R: 500, U, other, totalCalls,
      expectedOutputs: 1500, maxAttemptsPerIntent: 1, concurrency: 1, finalizedMotor: false },
    inputs: { expectedInputTokens: null, reserveContextCeilingTokens: 400000,
      actualPayloadInventoryComplete: false, pendingReviewPayloads: 500 },
    money: {
      orderBoundIncludingPrivateMicroUsd: order,
      globalBoundMicroUsd: sum(o.globalSpentMicroUsd, o.globalOpenMicroUsd),
      conservativeGlobalIncludingPrivateMicroUsd: sum(o.globalSpentMicroUsd, o.globalOpenMicroUsd, o.privateAdditionalMicroUsd),
      orderHeadroomAt7MicroUsd: rest7, orderHeadroomAt20MicroUsd: rest20,
      datedDayHeadroomMicroUsd: dayRest, firstDReserveMicroUsd: dReserve, reviewReserveMicroUsd: rReserve,
      datedDayHeadroomExcludesUnassignedPrivateReserve: true,
      conservativeDatedDayHeadroomMicroUsd: conservativeDayRest,
      firstCallFundedAt7: rest7 >= dReserve && dayRest >= dReserve,
      datedMaxConcurrentAt7: Math.floor(Math.max(0, Math.min(dayRest, rest7)) / peak),
      datedMaxConcurrentAt20: Math.floor(Math.max(0, Math.min(dayRest, rest20)) / peak),
      datedConcurrencyAssumesPrivateReserveOutsideObservedDay: true,
      conservativeDatedMaxConcurrentAt20: Math.floor(Math.max(0, Math.min(conservativeDayRest, rest20)) / peak),
      sumDRIndividualReservesMicroUsd: drGross,
      sumAllIndividualReservesMicroUsd: totalCalls === null ? null : sum(drGross, integer(U * dReserve)),
      sequentialKnownPeakReserveMicroUsd: peak, peakRequiresConfirmedSettlements: true,
      outputCapsOnlyDRMicroUsd: integer(500 * (3000 + reviewMaxOutputTokens) * 4),
      outputCapsAreNotMinimumCost: true, wholeRunExpectedCostMicroUsd: null, wholeRunMaximumCostMicroUsd: null
    },
    time: {
      windowMaxMs: 4 * 3600000, singleProviderTimeoutMs: 20000,
      drProviderTimeoutEnvelopeMs: 1000 * 20000,
      averageAvailableMsPerDRCallIgnoringUAndOverhead: 4 * 3600000 / 1000,
      averageAvailableMsPerCallIgnoringOverhead: totalCalls === null ? null : 4 * 3600000 / totalCalls,
      observedRuntimeMs: null, providerWindowGuaranteed: false,
      scenarios: [5, 10, 15, 20].map(seconds => ({ sourceAssumption: "scenario-not-measurement",
        secondsPerProviderCall: seconds, drProviderMsIgnoringOverhead: 1000 * seconds * 1000 }))
    },
    open: ["Blocker 1: final motor and operator timing", "Blocker 2: complete payload sizes and finite U/other paid inventory",
      "Fresh complete financial witness", "Private reserve identity and overlap proof", "Common approved 7/20 USD scope in controls and proof validator"]
  };
}
const SHEET_VERSION = "helmut-synthetik500-offline-kostenblatt/1";
function stats(xs) {
  if (!xs.length) return { count: 0, min: null, median: null, max: null, sum: 0 };
  const s = [...xs].sort((a, b) => a - b), n = s.length;
  return { count: n, min: s[0], median: n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2,
    max: s[n - 1], sum: sum(...s) };
}
// An inert worksheet, never an admission. Token estimates do not become usage.
function worksheet(s) {
  if (!s || s.version !== SHEET_VERSION) fail("sheet-version");
  const base = analyze({ observation: s.observation, understandingCalls: s.understandingCalls,
    otherPaidCalls: s.otherPaidCalls, reviewMaxOutputTokens: s.reviewMaxOutputTokens });
  const U = base.calls.U, total = base.calls.totalCalls;
  let tokens = null;
  if (s.tokenRows !== null) {
    if (total === null || !Array.isArray(s.tokenRows) || s.tokenRows.length !== total) fail("sheet-cardinality");
    const keys = new Set(), rows = s.tokenRows.map((r, i) => {
      const phase = i < U ? "U" : (i - U) % 2 === 0 ? "D" : "R";
      if (!r || r.phase !== phase || typeof r.positionKey !== "string" || !r.positionKey.trim()
        || r.positionKey.length > 200 || keys.has(r.positionKey)) fail("sheet-order-or-duplicate");
      keys.add(r.positionKey);
      const cap = phase === "R" ? s.reviewMaxOutputTokens : 3000;
      for (const key of ["expectedInputTokens", "expectedOutputTokens", "upperInputTokens"]) integer(r[key]);
      if (r.upperInputTokens > 400000 || r.expectedInputTokens > r.upperInputTokens
        || r.expectedOutputTokens > cap) fail("sheet-token-bound");
      if (r.inputBytes !== null) integer(r.inputBytes);
      return { phase, inputBytes: r.inputBytes, expectedInputTokens: r.expectedInputTokens,
        expectedOutputTokens: r.expectedOutputTokens, upperInputTokens: r.upperInputTokens,
        expectedCost: integer(K.tokenKosten(r.expectedInputTokens, r.expectedOutputTokens)),
        upperCost: integer(K.tokenKosten(r.upperInputTokens, cap)),
        reserve: Math.round(K.reservierungHoeheUsd(cap) * 1e6) };
    });
    let prefix = 0, required = 0;
    for (const row of rows) {
      required = Math.max(required, sum(prefix, row.reserve));
      prefix = sum(prefix, row.upperCost);
    }
    tokens = { expectedCostMicroUsd: sum(...rows.map(r => r.expectedCost)),
      conditionalCostUpperBoundMicroUsd: prefix,
      requiredIncrementalHeadroomForEveryReserveMicroUsd: Math.max(required, prefix),
      inputBytes: rows.every(r => r.inputBytes !== null) ? stats(rows.map(r => r.inputBytes)) : null,
      expectedInputTokens: stats(rows.map(r => r.expectedInputTokens)),
      expectedOutputTokens: stats(rows.map(r => r.expectedOutputTokens)),
      upperInputTokens: stats(rows.map(r => r.upperInputTokens)),
      byPhase: Object.fromEntries(["U", "D", "R"].map(phase => {
        const xs = rows.filter(r => r.phase === phase);
        return [phase, { calls: xs.length, expectedCostMicroUsd: sum(...xs.map(r => r.expectedCost)),
          conditionalCostUpperBoundMicroUsd: sum(...xs.map(r => r.upperCost)) }];
      })), actualUsageProven: false, upperBoundRequiresAcceptedInputAndTariffProof: true };
  }
  let counter = null;
  if (s.callCounter !== null) {
    const c = s.callCounter;
    if (!c || c.dailyLimit === 0) fail("sheet-counter");
    for (const k of ["dailyLimit", "used", "understandingReserve", "sharedReserve"]) integer(c[k]);
    const drMax = Math.max(0, c.dailyLimit - c.understandingReserve);
    const uMax = Math.max(Math.min(c.dailyLimit, c.understandingReserve), c.dailyLimit - c.sharedReserve);
    counter = { providedValuesAreNotProductionProof: true, assumesAllNewUBeforeDRInSameUtcDay: true,
      drEffectiveMax: drMax, understandingEffectiveMax: uMax,
      requiredDailyLimitIgnoringOtherTraffic: U === null ? null : Math.max(sum(c.used, U, 1000, c.understandingReserve),
        U === 0 ? 0 : sum(c.used, U) <= c.understandingReserve ? sum(c.used, U) : sum(c.used, U, c.sharedReserve)),
      countFits: U === null ? null : sum(c.used, U, 1000) <= drMax && (U === 0 || sum(c.used, U) <= uMax) };
  }
  const required = tokens?.requiredIncrementalHeadroomForEveryReserveMicroUsd ?? null;
  return { version: SHEET_VERSION, mode: "inert-unapproved-worksheet", budgetsChanged: false,
    executionReady: false, productionReady: false, blocker3Complete: false, base, tokens, counter,
    affordability: { reserveAndUpperCostFitExisting7: required === null ? null
      : required <= Math.min(base.money.orderHeadroomAt7MicroUsd, base.money.conservativeDatedDayHeadroomMicroUsd),
    reserveAndUpperCostFitProposed20: required === null ? null
      : required <= Math.min(base.money.orderHeadroomAt20MicroUsd, base.money.conservativeDatedDayHeadroomMicroUsd),
    proposed20IsApprovedFor500: false },
    timeScenarios: total === null ? null : [5, 10, 15, 20].map(seconds => ({ secondsPerCallAssumption: seconds,
      providerMsIgnoringControlStorageAndClosure: integer(total * seconds * 1000), measured: false })) };
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    let r;
    if (!args.length) r = analyze();
    else if (args.length === 2 && args[0] === "--sheet") {
      const bytes = require("node:fs").readFileSync(args[1]);
      if (bytes.length > 16 * 1024 * 1024 || !Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes)) fail("sheet-bytes");
      r = worksheet(JSON.parse(bytes));
    } else fail("arguments");
    console.log(JSON.stringify(r, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { HISTORICAL_OBSERVATION, SHEET_VERSION, analyze, worksheet };
