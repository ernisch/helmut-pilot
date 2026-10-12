"use strict";

// One explicitly approved contract; no ENV-controlled limits or provider calls.
// Legacy contracts retain their own ceilings, tariff and reservation policy.
const P = require("./synthetik-500-profile");
const VERSION = "helmut-synthetik500-eu-service-contract/1";
const ROUTE_VERSION = "helmut-synthetik500-route-contract/2-eu-service";
const MANIFEST_VERSION = "helmut-synthetik-500/2-eu-service";
const SOLLPLAN_VERSION = "helmut-synthetik500-sollplan/2-eu-service";
const RATE_ID = "azure-gpt5-mini-eu-MCA-202610-service-ceiling";
const DAY_VERSION = 3, ORDER_VERSION = 5, POLICY_VERSION = 4;
const INPUT_TOKENS = 272000, OUTPUT_TOKENS = 3000;
const RESERVE_MICRO_USD = 81400, RUN_MAX_MICRO_USD = 81400000;
const DAY_MICRO_USD = 82036000, ORDER_MICRO_USD = 88845364;
const PRIVATE_MICRO_USD = 636000, OPENING_MICRO_USD = 7445364;
const ACTIVE_MS = 9 * 3600000, END_MS = 30 * 60000, UNIT_MS = 60000;
const MAX_BOOKS = 47;
const CONTRACT = Object.freeze({ version: VERSION,
  approvedProposalSHA256: "b4b9982a07ac7b0c300cbd91e5a618b0a84026e04420b92ce5d473d5bfbb5392",
  model: "gpt-5-mini-eu", modelVersion: "2025-08-07", sku: "DataZoneStandard", region: "swedencentral",
  responseURL: "https://helmut-resource.openai.azure.com/openai/v1/responses",
  rateId: RATE_ID, inputUsdPerMillion: 0.275, outputUsdPerMillion: 2.2,
  priceStartsUTC: "2026-10-01T00:00:00.000Z", priceEndsUTC: "2026-10-31T23:59:59.999Z",
  orderId: "autonom-bis500-20260926", orderSinceUTC: "2026-09-25", lastOrderUTCDate: "2026-10-25",
  D: 500, R: 500, U: 0, calls: 1000, attempts: 1, parallelism: 1,
  inputTokens: INPUT_TOKENS, outputTokens: OUTPUT_TOKENS, reasoningEffort: "low",
  reserveMicroUSD: RESERVE_MICRO_USD, runMaxMicroUSD: RUN_MAX_MICRO_USD,
  dayMicroUSD: DAY_MICRO_USD, orderMicroUSD: ORDER_MICRO_USD,
  privateMicroUSD: PRIVATE_MICRO_USD, maximumOpeningMicroUSD: OPENING_MICRO_USD,
  activeMs: ACTIVE_MS, endEvidenceMs: END_MS, unitMs: UNIT_MS, providerMs: 20000, maxBooks: MAX_BOOKS });
const HASH = P.hash(CONTRACT);
const isRoute = c => c?.version === ROUTE_VERSION && c.serviceContractHash === HASH;
const isPlan = p => isRoute(p?.routeContract);
const isManifest = m => m?.version === MANIFEST_VERSION && m.serviceContractHash === HASH;
const isSollplan = p => p?.version === SOLLPLAN_VERSION && p.serviceContractHash === HASH;
// This finite, separately approved operation must not evict historical receipts.
// The legacy writer keeps its established ring when no EU order is bound.
const retainUsage = (records, order, legacyMaximum) => order?.version === ORDER_VERSION
  && order.serviceContractHash === HASH ? records : records.slice(0, legacyMaximum);
const fail = code => { const e = Error("synthetik500-eu-" + code); e.code = "LLM_BUDGET_EXHAUSTED";
  e.reason = e.message; e.kiNichtGesendet = true; throw e; };
const requireThat = (ok, code) => { if (!ok) fail(code); };
function tokenCost(input, output) {
  requireThat(Number.isSafeInteger(input) && input >= 0 && input <= INPUT_TOKENS
    && Number.isSafeInteger(output) && output >= 0 && output <= OUTPUT_TOKENS, "usage-outside-service-ceiling");
  return Number((275n * BigInt(input) + 2200n * BigInt(output) + 999n) / 1000n);
}
function assertPayload(payload) {
  requireThat(payload?.model === CONTRACT.model && payload.max_output_tokens === OUTPUT_TOKENS
    && payload.reasoning?.effort === "low" && typeof payload.input === "string"
    && Object.keys(payload).every(k => ["model", "input", "instructions", "max_output_tokens", "reasoning", "text"].includes(k)),
  "closed-text-payload-required");
}
function assertOpening({ dayOtherMicroUSD, cumulativeMicroUSD }) {
  requireThat(dayOtherMicroUSD === 0 && Number.isSafeInteger(cumulativeMicroUSD)
    && cumulativeMicroUSD >= PRIVATE_MICRO_USD && cumulativeMicroUSD <= OPENING_MICRO_USD,
  "fresh-opening-not-financed");
}
// This is an in-process brand, not client metadata or an ENV price override.
// Only confirmed budget tickets from the atomic reserve path are branded.
const tickets = new WeakSet();
function confirmTicket(ticket) {
  requireThat(ticket && ticket.contractHash === HASH && ticket.tarif === RATE_ID
    && ticket.reserved === RESERVE_MICRO_USD && ticket.maxOutputTokens === OUTPUT_TOKENS
    && ["D", "R"].includes(ticket.admission?.phase), "confirmed-ticket-required");
  tickets.add(ticket); return ticket;
}
const rateForTicket = ticket => tickets.has(ticket) ? CONTRACT : null;
module.exports = { VERSION, ROUTE_VERSION, MANIFEST_VERSION, SOLLPLAN_VERSION, RATE_ID,
  DAY_VERSION, ORDER_VERSION, POLICY_VERSION, INPUT_TOKENS, OUTPUT_TOKENS,
  RESERVE_MICRO_USD, RUN_MAX_MICRO_USD, DAY_MICRO_USD, ORDER_MICRO_USD,
  PRIVATE_MICRO_USD, OPENING_MICRO_USD, ACTIVE_MS, END_MS, UNIT_MS, MAX_BOOKS,
  CONTRACT, HASH, isRoute, isPlan, isManifest, isSollplan, requireThat, tokenCost,
  assertPayload, assertOpening, confirmTicket, rateForTicket, retainUsage };
