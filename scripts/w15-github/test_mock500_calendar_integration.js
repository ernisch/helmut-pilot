"use strict";
// Tiny invented ledger and private GO fixtures; no Original, DB, model or unit.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const crypto = require("node:crypto");
const Cal = require("../../lib/helmut/synthetik-500-mock-calendar");
const EU = require("../../lib/helmut/synthetik-500-eu-service-contract");
const K = require("../../lib/helmut/testkosten-budget"), A = require("../../lib/helmut/synthetik-500-kosten-admission");
const P = require("../../lib/helmut/synthetik-500-profile");
const Harness = require("./mock500_calendar"), B = require("./mock500_bindings");
const { record } = require("../synthetik-500-mock-calendar-test");
const sha = raw => crypto.createHash("sha256").update(raw).digest("hex");
const now = new Date(), day = now.toISOString().slice(0, 10);
assert.equal(EU.HASH, "78833d91aea2ad9c795cbb9790df031c230c98efd27d581faa79522c5da8175f");
assert.equal(EU.ORDER_RENEWAL_HASH, "a649603fa8f18c6a3db65aab09b67e15d6bda80befa20e5394bce7eeda1d6415");
assert.equal(EU.CONTRACT.priceEndsUTC, "2026-10-31T23:59:59.999Z");
assert.equal(EU.MOCK_CALENDAR.maxBooks, EU.ORDER_RENEWAL.maxBooks + 7);
assert.equal(EU.MOCK_CALENDAR.maxOrderDays, 44);
for (const key of ["dayMicroUSD", "orderMicroUSD", "privateMicroUSD", "reserveMicroUSD", "runMaxMicroUSD"])
  assert.equal(EU.MOCK_CALENDAR[key], EU.ORDER_RENEWAL[key]);
assert.throws(() => Cal.run({}, () => true), /mock-calendar/);
assert.throws(() => Cal.createIssuer({ authorized: true }), /trusted-verifier/);
assert.equal(Cal.active(), null);
const futureOrder = { version: 7, serviceContractHash: EU.HASH, orderRenewalHash: EU.MOCK_CALENDAR_HASH, runDayUTC: day };
process.env.HELMUT_MOCK_SIMULATION_CALENDAR = Cal.VERSION;
assert.equal(EU.renewedOrder(futureOrder), false); delete process.env.HELMUT_MOCK_SIMULATION_CALENDAR;
console.log("PASS unchanged Production hashes/limits; JSON and ENV cannot authorize calendar");
if (day < Cal.FIRST_DAY || day > Cal.LAST_DAY) {
  console.log("SKIP live isolated calendar scope outside approved November dates"); process.exit(0);
}
let end = Date.parse(day + "T23:59:59.999Z");
while (require("../../lib/helmut/briefing-frische").berlinTagKey(new Date(end))
  !== require("../../lib/helmut/briefing-frische").berlinTagKey(now)) end -= 60000;
const start = Math.min(now.getTime() - 1000, end - 12600000), r = record(day);
r.window = { startsAtUTC: new Date(start).toISOString(), endsAtUTC: new Date(start + 10800000 - 1).toISOString(),
  completionDeadlineUTC: new Date(start + 12600000 - 1).toISOString() };
const root = fs.mkdtempSync(path.join(os.tmpdir(), "w15-calendar-fixture-")); fs.chmodSync(root, 0o700);
const stem = "w15-mock500-" + r.authorization.runId + "-" + r.authorization.nonce.replaceAll("-", "");
const runRoot = path.join(root, stem), work = path.join(runRoot, "work"); fs.mkdirSync(work, { recursive: true, mode: 0o700 });
const context = { schema: "helmut-w15-mock500-controller-context/1", scope: "ISOLATED_GITHUB_MOCK500_BINDING_ONLY",
  ...Object.fromEntries(["runId", "runAttempt", "nonce", "exactCommit"].map(k => [k, r.authorization[k]])), runnerTemp: root,
  hostPaths: { runRoot, work, prepare: runRoot + "/prepare", cache: runRoot + "/cache" } };
const safety = require("./separated_resources_contract.json").referenceLabProposal;
const bound = { context, window: r.window, calendar: { utcDay: day,
  berlinDay: require("../../lib/helmut/briefing-frische").berlinTagKey(now), sourceDatesRewritten: false, signaturesReused: false },
  simulationCalendarAuthorization: r.authorization, sourceReplayAuthorization: r.sourceAuthorization,
  functionalResourceContract: { contract: "helmut-w15-mock500-host-functional/1", mode: "mock500-full-host-functional-gated",
    memoryProfile: "helmut-w15-mock500-host-functional/1", hardMemoryBytes: safety.commonHostHardBytes,
    hostReserveBytes: safety.hostAvailableReserveBytes, legacyRegularMemoryAccepted: false, providerResourceAccepted: false,
    hostCapacityBudget: { schema: "helmut-w15-host-capacity-budget/1", profile: "helmut-w15-end500-host-capacity-diagnostic/1",
      hardLimitBytes: safety.commonHostHardBytes, minimumHostReserveBytes: safety.hostAvailableReserveBytes } } };
const owner = { confirmation: "GO_EXACTLY_ONE_ISOLATED_W15_FULL500_MOCK_RUN_AND_RETURN_TO_ZERO", targetDatabase: B.DB,
  maximumUnits: 500, temporarySyntheticProfiles: 500, paidModelsAllowed: false, productionAllowed: false, full500Allowed: true,
  authorizationBinding: { exactCommit: context.exactCommit, runId: context.runId,
    simulationCalendarAuthorization: r.authorization, sourceReplayAuthorization: r.sourceAuthorization } };
const write = (name, value) => fs.writeFileSync(path.join(work, name), JSON.stringify(value), { mode: 0o600 });
write("OWNER_GO.PRIVATE.json", owner);
write("runtime-public.PRIVATE.json", { database: B.DB, host: Cal.HOST, deploymentId: Cal.DEPLOYMENT,
  commit: context.exactCommit, url: "http://127.0.0.1:1" });
function ledger(version = 7) {
  const auth = { llmUsage: [], [K.KEY]: {}, [K.AUFTRAG_KEY]: { version, id: EU.CONTRACT.orderId, abTag: EU.CONTRACT.orderSinceUTC,
    limit: EU.ORDER_MICRO_USD, externGebunden: 0, serviceContractHash: EU.HASH, privateReserveMicroUSD: EU.PRIVATE_MICRO_USD,
    bookCapacity: EU.MOCK_CALENDAR.maxBooks, runDayUTC: day,
    orderRenewalHash: version === 7 ? EU.MOCK_CALENDAR_HASH : EU.ORDER_RENEWAL_HASH } };
  for (let ms = Date.parse("2026-09-09"); ms <= Date.parse(day); ms += 86400000) {
    const d = new Date(ms).toISOString().slice(0, 10);
    auth[K.KEY][d] = { version: EU.DAY_VERSION, day: d, tarif: EU.RATE_ID, limit: EU.DAY_MICRO_USD, serviceContractHash: EU.HASH,
      spent: 0, baseline: 0, baselineCalls: 0, manualCalls: 0, manualUntil: null, calls: {}, frozen: null };
  }
  return auth;
}
const auth = ledger(), historyBefore = P.hash(auth[K.KEY]);
const plan = { operationId: r.selector.operationId, productionCommit: context.exactCommit,
  runtimeManifestHash: "e".repeat(64), startsAtUTC: r.window.startsAtUTC, endsAtUTC: r.window.endsAtUTC };
const route = { version: EU.ROUTE_VERSION, serviceContractHash: EU.HASH, orderRenewalHash: EU.MOCK_CALENDAR_HASH,
  mockSimulationCalendar: { ...Cal.LABEL }, runtimeManifestHash: plan.runtimeManifestHash,
  route: { provider: "azure", responsesUrl: EU.CONTRACT.responseURL, model: EU.CONTRACT.model,
    productionCommit: context.exactCommit, deploymentHost: Cal.HOST, deploymentId: Cal.DEPLOYMENT, authMode: "api-key" },
  management: { modelFamily: "gpt-5-mini", versionPolicy: "historical-october-simulation-only", contextTokens: 400000,
    maxInputTokens: EU.INPUT_TOKENS, inputReserveTokens: EU.INPUT_TOKENS, maxOutputTokens: 128000,
    reasoningIncludedInOutput: true, inputUsdPerMillion: 0.275, outputUsdPerMillion: 2.2,
    validFromUTC: plan.startsAtUTC, validUntilUTC: plan.endsAtUTC,
    modelVersion: EU.CONTRACT.modelVersion, sku: EU.CONTRACT.sku, region: EU.CONTRACT.region, versionUpgradeOption: "NoAutoUpgrade",
    evidencePins: Object.fromEntries(["rootAdmission", "management", "serviceContext", "price"].map(name => [name,
      { name: "fictional-" + name, sha256: "f".repeat(64), bytes: 1 }])) } };
plan.routeContract = route;
(async () => {
  try {
    assert.throws(() => K.auftragsStand(auth, day)); assert.equal(EU.isRoute(route), false);
    await Harness.withBound(bound, null, async () => {
      assert.equal(EU.isRoute(route), true); assert.equal(A.pruefeRouteContract(route, plan), P.hash(route));
      const later={...plan,startsAtUTC:new Date(now.getTime()).toISOString()};
      Cal.requirePlan(later);assert.equal(A.pruefeRouteContract(route,later),P.hash(route));
      const partial=Object.fromEntries(['runtimeManifestHash','productionCommit','startsAtUTC','endsAtUTC'].map(k=>[k,later[k]]));
      assert.equal(A.pruefeRouteContract(route,partial),P.hash(route));
      assert.throws(()=>A.pruefeRouteContract(route,{...partial,productionCommit:'0'.repeat(40)}));
      for(const startsAtUTC of [new Date(start-1).toISOString(),plan.endsAtUTC])
        assert.throws(()=>Cal.requirePlan({...plan,startsAtUTC}),/plan-binding/);
      assert.equal(K.auftragsStand(auth, day).limitMicroUsd, EU.ORDER_MICRO_USD);
      K.pruefeStart(auth, day, { ok: true, used: 0 });
      assert.equal(P.hash(auth[K.KEY]), historyBefore);
      assert.equal(EU.contractForRoute(route).priceEndsUTC, EU.CONTRACT.priceEndsUTC, "B2 exception stays October");
      assert.throws(() => require("../../lib/helmut/synthetik-500-date-binding").bind({
        briefingDatum: "2026-10-11T00:00:00.000Z", briefingEingabe: { version: 2, eingabe: { tag: "2026-10-11" },
          acceptedSnapshot: { leaf: { capturedAtUTC: "2026-10-11T00:00:00.000Z" } } } }, plan), /end-after-price-window/);
      for (const change of [a => a[K.AUFTRAG_KEY].bookCapacity++, a => delete a[K.KEY][EU.CONTRACT.orderSinceUTC],
        a => a[K.KEY][day].limit++, a => a[K.AUFTRAG_KEY].limit++, a => a[K.AUFTRAG_KEY].orderRenewalHash = "0".repeat(64)]) {
        const bad = structuredClone(auth); change(bad); assert.throws(() => K.auftragsStand(bad, day));
      }
      for (const change of [p => p.routeContract.route.deploymentHost = "ordinary-production.vercel.app",
        p => p.routeContract.route.productionCommit = "0".repeat(40), p => p.endsAtUTC = new Date(Date.parse(p.endsAtUTC) + 1).toISOString(),
        p => p.routeContract.management.versionPolicy = "fixed-eu-service-ceiling"]) {
        const bad = structuredClone(plan); change(bad); assert.throws(() => A.pruefeRouteContract(bad.routeContract, bad));
      }
      const old = ledger(6); old[K.AUFTRAG_KEY].bookCapacity = EU.ORDER_RENEWAL.maxBooks;
      assert.throws(() => K.auftragsStand(old, day), "old contract is never renewed by ambient scope");
      await Promise.resolve(); assert(Cal.active());
    }, { host: true });
    assert.equal(Cal.active(), null); assert.throws(() => K.auftragsStand(auth, day));
    const bad = structuredClone(bound); bad.simulationCalendarAuthorization.nonce = "00000000-0000-4000-8000-000000000000";
    await assert.rejects(Harness.withBound(bad, null, () => { throw Error("must-not-enter"); }, { host: true }));
    console.log("PASS bound private GO, live November books/route, immutable history, money/capacity/manipulation and unchanged B2/default");
    const issuer = Cal.createIssuer(() => r), grant = issuer.issue();
    assert.throws(() => Cal.run(structuredClone(grant), () => true), /mock-calendar/);
    const workerInput = { dataText: "{}", storedSHA256: sha("{}"), operationId: r.selector.operationId,
      commandHash: r.selector.commandHash, mockCalendarScope: { injectedThroughData: true } };
    const Runner = require("../../lib/helmut/synthetik-500-content-runner");
    await assert.rejects(Runner.validateStoredContent(workerInput, 10000), e => {
      assert(!e.phases?.some(p => p.name === "boundMockCalendarScope")); assert(!e.message.includes("mock-calendar")); return true;
    });
    await Cal.run(grant, async () => {
      const partial={operationId:plan.operationId,runtimeManifestHash:plan.runtimeManifestHash,
        productionCommit:plan.productionCommit,startsAtUTC:plan.startsAtUTC,endsAtUTC:plan.endsAtUTC};
      assert.equal(A.pruefeRouteContract(route,partial),P.hash(route));
      assert.throws(()=>A.pruefeRouteContract(route,{...partial,operationId:'synthetik500-wrong-operation'}));
      assert(Cal.workerSnapshot(workerInput)); assert.equal(Cal.workerSnapshot({ ...workerInput, commandHash: "0".repeat(64) }), null);
      await assert.rejects(Runner.validateStoredContent(workerInput, 10000), e => {
        assert(e.phases?.some(p => p.name === "boundMockCalendarScope")); assert(!e.message.includes("mock-calendar")); return true;
      });
      const command = { slot: { plan }, drafts: Array.from({ length: 500 }, () => ({ briefingEingabe: { version: 1 } })) };
      Cal.requireWorkerCommand(workerInput, command); command.drafts[499].briefingEingabe.version = 2;
      assert.throws(() => Cal.requireWorkerCommand(workerInput, command), /worker-command/);
    });
    issuer.revoke(grant); assert.throws(() => Cal.run(grant, () => true), /grant/);
    assert.equal(Cal.active(), null);
    console.log("PASS actual closed Worker handoff only from genuine scope; input metadata ignored; selector/B2/revocation denied");
  } finally { fs.rmSync(root, { recursive: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
