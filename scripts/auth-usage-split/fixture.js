"use strict";

// Explicit component data. No profiles, provider output or execution authority.
const { createHash } = require("node:crypto");
const EU = require("../../lib/helmut/synthetik-500-eu-service-contract");
const json = value => JSON.stringify(value);
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}
const hash = value => createHash("sha256").update(typeof value === "string" ? value : json(canonical(value))).digest("hex");
function entropy(length, seed) {
  let value = "", i = 0;
  while (value.length < length) value += createHash("sha256").update(`${seed}:${i++}`).digest("base64");
  return value.slice(0, length);
}
function record(id, paddingBytes = 0) {
  return { id, createdAt: "2026-10-28T00:00:00.000Z", tenantId: "component-owner",
    profileId: "component-owner", userId: "component-owner", politicianId: "component-owner",
    runId: "INERT-COMPONENT-NOT-A-RUN", pipelineStep: "component", model: "INERT-NOT-A-MODEL",
    callType: "skipped-component", promptTokens: 0, completionTokens: 0, totalTokens: 0,
    estimatedCost: 0, durationMs: 0, success: false, keinAufruf: true,
    sourceId: "component-source", packageId: "component-package", vorgangId: "component-case",
    knowledgeObjectId: "component-ko", error: "INERT_COMPONENT_NOT_EXECUTION_EVIDENCE",
    futureTechnicalField: { retainedExactly: true, padding: entropy(paddingBytes, id) } };
}
function fixture({ historyCount = 32, paddingBytes = 96, orderVersion = 6 } = {}) {
  return { _authStoreRevision: "11111111-1111-4111-8111-111111111111",
    users: [], sessions: [], assignments: [], dailyInputs: [], auditEvents: [], systemErrors: [],
    processRuns: [], pipelineLocks: {}, understandingRetries: {},
    adminSettings: { componentOnly: true, nested: { unchanged: "preserve", value: 1 } },
    testKostenAuftrag: { version: orderVersion, serviceContractHash: EU.HASH,
      ...(orderVersion === 6 ? { orderRenewalHash: EU.ORDER_RENEWAL_HASH } : {}),
      id: "INERT-COMPONENT-NOT-A-COST-ORDER", cap: EU.ORDER_MICRO_USD / 1e6 },
    testKostenTage: { "2026-10-27": { fixtureOnly: true, spent: 0, calls: {} } },
    synthetik500KostenAdmission: { fixtureOnly: true, executionAuthority: false, untouched: ["a", "b"] },
    synthetik500DispatchJournal: { fixtureOnly: true, executionAuthority: false, operations: {} },
    unknownFutureField: { preserved: [null, false, 0, "ä😀", { quote: "'\\\"" }] },
    llmUsage: Array.from({ length: historyCount }, (_, i) => record(`component-history-${String(historyCount - i).padStart(5, "0")}`, paddingBytes)) };
}
function withoutRevision(data) { const { _authStoreRevision, ...rest } = JSON.parse(json(data)); return rest; }
module.exports = { json, hash, entropy, record, fixture, withoutRevision };
