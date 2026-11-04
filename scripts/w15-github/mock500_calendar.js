"use strict";
// Trusted existing private Mock harness only. These files never enter an API.
const assert = require("node:assert/strict"), path = require("node:path");
const B = require("./mock500_bindings"), Source = require("./mock500_source_replay");
const Calendar = require("../../lib/helmut/synthetik-500-mock-calendar");
const EU = require("../../lib/helmut/synthetik-500-eu-service-contract");
function authenticate(bound, materials, host) {
  B.namespace(bound.context); B.currentCalendar(bound); B.memoryLimits(bound);
  assert(require.cache[require.resolve("../lokaler-netzschutz")]);
  assert.equal(process.env.HELMUT_SOURCE_MODE, "off");
  const prepareOnly = bound.prepareDiagnosticOnly === true;
  if (!prepareOnly) assert.equal(bound.functionalResourceContract.mode, "mock500-full-host-functional-gated");
  assert.notEqual(bound.materialsDiagnosticOnly, true);
  const root = host ? bound.context.hostPaths.work : path.join(B.BASE, "state");
  const owner = Source.privateJSON(path.join(root, "OWNER_GO.PRIVATE.json"));
  const config = Source.privateJSON(path.join(root, host ? "runtime-public.PRIVATE.json" : "configuration.PRIVATE.json"));
  assert.equal(config.database, Calendar.DATABASE); assert.equal(config.host, Calendar.HOST);
  assert.equal(config.deploymentId, Calendar.DEPLOYMENT); assert.equal(config.commit, bound.context.exactCommit);
  assert.equal(new URL(config.url).hostname, "127.0.0.1");
  if (prepareOnly) require("./mock500_prepare_contract").validate(bound, owner);
  else {
    assert.equal(owner.confirmation, "GO_EXACTLY_ONE_ISOLATED_W15_FULL500_MOCK_RUN_AND_RETURN_TO_ZERO");
    assert.equal(owner.targetDatabase, Calendar.DATABASE); assert.equal(owner.maximumUnits, 500);
    assert.equal(owner.temporarySyntheticProfiles, 500); assert.equal(owner.paidModelsAllowed, false);
    assert.equal(owner.productionAllowed, false); assert.equal(owner.full500Allowed, true);
  }
  const authorization = bound.simulationCalendarAuthorization, sourceAuthorization = bound.sourceReplayAuthorization;
  assert.deepEqual(owner.authorizationBinding.simulationCalendarAuthorization, authorization);
  assert.deepEqual(owner.authorizationBinding.sourceReplayAuthorization, sourceAuthorization);
  assert.equal(owner.authorizationBinding.exactCommit, bound.context.exactCommit);
  assert.equal(owner.authorizationBinding.runId, bound.context.runId);
  for (const key of ["exactCommit", "runId", "runAttempt", "nonce"])
    assert.equal(authorization[key], bound.context[key]);
  if (!host) {
    assert.equal(materials.sourceReplay?.purpose, "EXECUTION");
    assert.deepEqual(materials.sourceReplay.authorization, sourceAuthorization);
    assert.deepEqual(materials.simulationCalendar, evidence());
    assert.equal(materials.preactivationBindings?.status, "PASS_ALL500_ACTUAL_D_PROVIDER_REVIEW_REQUEST_BINDINGS");
    assert.equal(materials.preactivationBindings.profileActivations, 0);
  }
  return { schema: "helmut-w15-mock-calendar-scope/1", contract: Calendar.VERSION,
    authorization, sourceAuthorization, window: bound.window, selector: host ? null : materials.selector };
}
function evidence() {
  return { ...Calendar.LABEL, orderVersion: EU.MOCK_CALENDAR.orderVersion,
    orderRenewalHash: EU.MOCK_CALENDAR_HASH, referencePriceContractHash: EU.HASH,
    firstDay: Calendar.FIRST_DAY, lastDay: Calendar.LAST_DAY,
    maximumOrderDays: EU.MOCK_CALENDAR.maxOrderDays, maximumBooks: EU.MOCK_CALENDAR.maxBooks };
}
async function withBound(bound, materials, body, { host = false, audit = false } = {}) {
  if (bound?.simulationCalendarAuthorization === undefined) return body();
  const issuer = Calendar.createIssuer(() => authenticate(bound, materials, host)), grant = issuer.issue();
  const key = "HELMUT_SYNTHETIK500_EU_ORDER_RENEWAL", previous = process.env[key];
  try { return await Calendar.run(grant, async () => {
    // The existing runtime binding is necessary but never sufficient authority.
    // The read-only audit keeps its credential-free network guard unchanged.
    if (!audit) process.env[key] = EU.MOCK_CALENDAR_HASH;
    return body();
  }); } finally {
    issuer.revoke(grant);
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
  }
}
module.exports = { withBound, evidence };
