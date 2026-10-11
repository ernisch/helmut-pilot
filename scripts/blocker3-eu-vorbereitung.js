"use strict";

// Reine Offline-Vorbereitung; kein Import durch den Production-Sender.
// Keine Freigabe, kein Providerzähler, keine Geld-/Zeit-/ENV-Mutation.
const crypto = require("node:crypto");
const integer = (v, name) => {
  if (!Number.isSafeInteger(v) || v < 0) throw new Error("blocker3-" + name);
  return v;
};
const requireThat = (v, name) => { if (!v) throw new Error("blocker3-" + name); };
const safe = (n, name) => integer(Number(n), name);
const sha = value => crypto.createHash("sha256").update(value, "utf8").digest("hex");
const object = v => v !== null && typeof v === "object" && !Array.isArray(v);
const exact = (v, keys) => object(v) && Object.keys(v).sort().join("|") === [...keys].sort().join("|");
function tokenCost(input, output) {
  integer(input, "input-tokens"); integer(output, "output-tokens");
  return safe((275n * BigInt(input) + 2200n * BigInt(output) + 999n) / 1000n, "cost-overflow");
}
function financingEnvelope(costs, reserve = 212000) {
  integer(reserve, "reserve"); requireThat(Array.isArray(costs) && costs.length > 0, "cost-list");
  let prefix = 0n, peak = 0n;
  for (const cost of costs) {
    integer(cost, "cost"); requireThat(cost <= reserve, "cost-exceeds-preserved-reserve");
    const pending = prefix + BigInt(reserve);
    if (pending > peak) peak = pending;
    prefix += BigInt(cost);
  }
  if (prefix > peak) peak = prefix;
  return { fullMicroUSD: safe(prefix, "sum-overflow"), HMicroUSD: safe(peak, "envelope-overflow") };
}
function analyze(c) {
  requireThat(object(c), "contract");
  for (const key of ["protectedChangesApproved", "budgetApproved", "routeSwitchApproved",
    "runtimeEnforcement", "blocker3Complete"]) requireThat(c[key] === false, "inert-" + key);
  const r = c.targetRoute, p = c.pricing, n = c.calls, f = c.conditionalFinancialCalculation;
  requireThat(r?.provider === "azure" && r.deployment === "gpt-5-mini-eu"
    && r.modelFamily === "gpt-5-mini" && r.modelVersion === "2025-08-07"
    && r.sku === "DataZoneStandard" && r.region === "swedencentral"
    && r.versionUpgradeOption === "NoAutoUpgrade"
    && r.globalDeploymentAcceptedAsRunRoute === false && r.automaticGlobalFallbackAllowed === false
    && r.responsesURL === "https://helmut-resource.openai.azure.com/openai/v1/responses", "EU-route");
  requireThat(p?.accountBillingPriceProven === true && p.currency === "USD"
    && p.inputPerMillion === "0.275" && p.outputPerMillion === "2.20"
    && p.currentAccountPriceBinding?.periodStart === "2026-10-01"
    && p.currentAccountPriceBinding?.periodEnd === "2026-10-31"
    && p.currentAccountPriceBinding.proven === true, "October-price");
  requireThat(n?.D === 500 && n.R === 500 && n.U === 0 && n.otherProductionModelPaths === 0
    && n.total === 1000 && n.maxAttemptsPerIntent === 1 && n.modelConcurrency === 1
    && n.deployment === r.deployment && n.outputTokensIncludingReasoning?.D === 3000
    && n.outputTokensIncludingReasoning?.R === 3000 && n.reasoningEffort === "low"
    && n.qualityAndAcceptanceUnchanged === true, "unchanged-call-contract");
  requireThat(f?.providerInputCapsProven === false
    && c.inputBoundaryAnalysis?.DInputProviderCapProven === false
    && c.inputBoundaryAnalysis.RInputProviderCapProven === false, "no-fake-provider-proof");
  requireThat(f.caps?.D === 12288 && f.caps.R === 16384
    && f.minimumConditionalDayIntegerUSD === 12 && f.existingCumulativeOrderUSD === 20
    && c.budgetDecision?.twelvePerUTCdayAndExistingTwentyCumulativeProven === false
    && c.budgetDecision.leastNecessaryRunBudgetProven === false
    && c.budgetDecision.sharedNewVersionImplemented === false
    && c.budgetDecision.currentRuntimeDayUSD === 6 && c.budgetDecision.currentOrderCumulativeUSD === 20
    && c.budgetDecision.currentEndValidatorDayUSD === 6
    && c.budgetDecision.currentEndValidatorCumulativeUSD === 7, "conditional-not-final-money-contract");
  const D = tokenCost(f.caps.D, 3000), R = tokenCost(f.caps.R, 3000);
  requireThat(f.caps.output === 3000 && f.preservedStandardReserveMicroUSD === 212000, "preserved-output-reserve");
  const costs = Array.from({ length: 1000 }, (_, i) => i % 2 ? R : D);
  const money = financingEnvelope(costs);
  const base = c.preservedBaselineDefinition;
  requireThat(base?.nativeSpentMicroUSD === 1614061 && base.alreadyIncludedExternalMicroUSD === 5195303
    && base.privateUnresolvedMicroUSD === 636000 && base.conservativeTotalMicroUSD === 7445364
    && base.privateIncludedInTotal === true && base.privateMustNotBeAddedAgainToCumulativeTotal === true,
  "preserved-baseline-private-once");
  requireThat(f.preservedPrivateReserveMicroUSD === base.privateUnresolvedMicroUSD
    && f.preservedCumulativeBaselineMicroUSD === base.conservativeTotalMicroUSD, "finance-baseline");
  const dayZero = safe(BigInt(money.HMicroUSD) + BigInt(base.privateUnresolvedMicroUSD), "day-overflow");
  const cumulative = safe(BigInt(money.HMicroUSD) + BigInt(base.conservativeTotalMicroUSD), "order-overflow");
  for (const [key, value] of Object.entries({ DPerCallMicroUSD: D, RPerCallMicroUSD: R,
    fullCapConformantMicroUSD: money.fullMicroUSD, HMicroUSD: money.HMicroUSD,
    dayIncludingPrivateAtOldSpendZeroMicroUSD: dayZero, cumulativeIncludingPreservedBaselineMicroUSD: cumulative })) {
    requireThat(f[key] === value, "financial-projection-drift-" + key);
  }
  const counter = c.globalCounterUnchanged, t = c.timeContractUnchanged;
  requireThat(counter?.currentProductionProjectLimit === 2416 && counter.understandingReserve === 702
    && counter.realPriorityReserve === 200 && counter.budgetFailClosed === 1
    && counter.maximumStartUsedFor1000 === 714 && counter.requestedChange === null, "global-counter");
  requireThat(t?.proposedUnitSeconds === 60 && t.existingProviderFullResponseSeconds === 20
    && t.proposedSetupSeconds === 1200 && t.proposedActiveSlackSeconds === 1200
    && t.proposedActiveWindowSeconds === 32400 && t.proposedEndEvidenceSeconds === 1800
    && t.proposedCompleteDeadlineSeconds === 34200 && t.exportReadOnlyRequests === 501
    && t.exportConcurrency === 8 && t.exportFullRequestCapSeconds === 20
    && t.endReadbackSeconds === 60 && t.offlineFinalizationSeconds === 300
    && t.forecastTotalSeconds === 18000 && t.originalBerlinCaptureDay === "2026-10-11"
    && t.sameUtcExecutionDayRequiredByCurrentContract === true && t.calendarCannotShiftAutomatically === true,
  "time-proposal");
  const active = 500 * t.proposedUnitSeconds + t.proposedSetupSeconds + t.proposedActiveSlackSeconds;
  const exports = Math.ceil(t.exportReadOnlyRequests / t.exportConcurrency) * t.exportFullRequestCapSeconds;
  const end = exports + t.endReadbackSeconds + t.offlineFinalizationSeconds;
  requireThat(active === t.proposedActiveWindowSeconds && end <= t.proposedEndEvidenceSeconds, "time-arithmetic");
  return { version: "helmut-blocker3-EU-offline-preparation/1", preparationOnly: true,
    status: "blocked-on-Microsoft-input-evidence", runtimeEnforcement: false, executionAuthorized: false,
    providerInputBoundProven: false, conditionalCapsOnly: { D: f.caps.D, R: f.caps.R },
    money: { ...money, dayAtProvenPriorZeroScenarioMicroUSD: dayZero, cumulativeWithPreservedBaselineMicroUSD: cumulative,
      priorDayConsumptionProven: false, baselineIsFreshStartWitness: false,
      minimumConditionalWholeDollarDay: Math.ceil(dayZero / 1000000),
      existingCumulativeOrderMicroUSD: 20000000, dayPriorHeadroomAt12MicroUSD: 12000000 - dayZero },
    globalCounter: { rawLimit: 2416, protectedUnderstandingReserve: 702, maximumFreshStartUsed: 714,
      freshRuntimeCounterProven: false },
    time: { forecastTotalSeconds: t.forecastTotalSeconds, forecastIsNotMeasurement: true,
      activeProposalSeconds: active, endProposalSeconds: 1800, completeProposalSeconds: 34200,
      exportScenarioSeconds: exports, endWorkScenarioSeconds: end,
      unitDeadlinesImplemented: false, counterFeesAndLatencyKnown: false,
      originalBerlinCaptureDay: t.originalBerlinCaptureDay,
      latestStartUTCExclusive: "2026-10-11T13:00:00.000Z", calendarChangeAllowed: false } };
}
function prepareInputGuard(request) {
  requireThat(exact(request, ["phase", "body", "expectedBodySHA256", "expectedSchemaSHA256"]), "guard-keys");
  const { phase, body, expectedBodySHA256, expectedSchemaSHA256 } = request;
  requireThat(["D", "R"].includes(phase) && typeof body === "string", "guard-body");
  requireThat([expectedBodySHA256, expectedSchemaSHA256].every(v => typeof v === "string" && /^[a-f0-9]{64}$/.test(v)), "guard-pins");
  requireThat(sha(body) === expectedBodySHA256, "body-drift");
  let payload; try { payload = JSON.parse(body); } catch { throw new Error("blocker3-body-JSON"); }
  requireThat(exact(payload, ["model", "input", "max_output_tokens", "reasoning", "text"])
    && payload.model === "gpt-5-mini-eu" && typeof payload.input === "string"
    && payload.max_output_tokens === 3000 && exact(payload.reasoning, ["effort"])
    && payload.reasoning.effort === "low" && exact(payload.text, ["format"]), "guard-route-features");
  const format = payload.text.format;
  requireThat(exact(format, ["type", "name", "schema", "strict"]) && format.type === "json_schema"
    && typeof format.name === "string" && format.name.length > 0
    && object(format.schema) && format.strict === true, "guard-schema");
  requireThat(sha(JSON.stringify(format.schema)) === expectedSchemaSHA256, "schema-drift");
  return Object.freeze({ preparationOnly: true, runtimeEnforcement: false, phase,
    canReserve: false, canSend: false, reason: "MICROSOFT_FULL_INPUT_BOUND_REQUIRED",
    bodySHA256: expectedBodySHA256, schemaSHA256: expectedSchemaSHA256,
    utf8Bytes: Buffer.byteLength(body, "utf8"), providerInputTokens: null });
}
module.exports = { tokenCost, financingEnvelope, analyze, prepareInputGuard };
if (require.main === module) {
  const fs = require("node:fs"), path = require("node:path"), args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--contract") throw new Error("usage: --contract <JSON-path>");
  const file = path.resolve(args[1]), bytes = fs.readFileSync(file);
  const receipt = analyze(JSON.parse(bytes));
  console.log(JSON.stringify({ sourceContractSHA256: sha(bytes), ...receipt }, null, 2));
}
