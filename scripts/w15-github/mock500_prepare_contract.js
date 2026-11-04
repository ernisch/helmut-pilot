"use strict";
// Private producer binding only. Validation returns data, never run authority.
const assert = require("node:assert/strict");
const CONTRACT = "helmut-w15-mock500-prepare-diagnostic/1";
const SCOPE = "ISOLATED_GITHUB_MOCK500_PREPARE_DIAGNOSTIC_ONLY";
const MODE = "mock500-materials-diagnostic-gated";
const CONFIRMATION = "GO_ONE_ISOLATED_PREPARE_DIAGNOSTIC_NO_ACTIVATION_UNITS_MODELS";
const AUTH_SCHEMA = "helmut-w15-mock500-prepare-diagnostic-authorization/1";
const AUTH_KEYS = ["schema", "contract", "scope", "runId", "runAttempt", "nonce", "exactCommit",
  "sourceQualificationSHA256", "approvalSHA256", "inputBindingSHA256", "diagnosticOfRunId"];
function descriptor(bound) {
  assert.equal(bound?.prepareDiagnosticOnly, true);
  assert.notEqual(bound.materialsDiagnosticOnly, true);
  assert.equal(bound.functionalResourceContract?.mode, MODE);
  const a = bound.prepareDiagnosticAuthorization;
  assert(a && typeof a === "object" && !Array.isArray(a));
  assert.deepEqual(Object.keys(a).sort(), [...AUTH_KEYS].sort());
  assert.equal(a.schema, AUTH_SCHEMA); assert.equal(a.contract, CONTRACT); assert.equal(a.scope, SCOPE);
  assert.equal(a.diagnosticOfRunId, "41818696152");
  for (const key of ["runId", "runAttempt", "nonce", "exactCommit"]) assert.equal(a[key], bound.context[key]);
  for (const key of ["sourceQualificationSHA256", "approvalSHA256", "inputBindingSHA256"])
    assert.match(a[key], /^[a-f0-9]{64}$/);
  assert.equal(a.inputBindingSHA256, bound.bindingSHA256);
  const calendar = require("../../lib/helmut/synthetik-500-mock-calendar");
  calendar.validateRecord({ schema: "helmut-w15-mock-calendar-scope/1", contract: calendar.VERSION,
    authorization: bound.simulationCalendarAuthorization, sourceAuthorization: bound.sourceReplayAuthorization,
    window: bound.window, selector: null });
  for (const auth of [bound.sourceReplayAuthorization, bound.simulationCalendarAuthorization])
    for (const key of ["runId", "runAttempt", "nonce", "exactCommit", "approvalSHA256", "sourceQualificationSHA256"])
      assert.equal(auth[key], a[key]);
  return structuredClone(a);
}
function validate(bound, owner) {
  const B = require("./mock500_bindings");
  B.namespace(bound.context); B.fixedWindow(bound); B.memoryLimits(bound);
  const a = descriptor(bound);
  assert.equal(owner.scope, SCOPE); assert.equal(owner.resourceContract, CONTRACT);
  assert.equal(owner.confirmation, CONFIRMATION); assert.equal(owner.targetDatabase, B.DB);
  assert.equal(owner.maximumUnits, 0); assert.equal(owner.temporarySyntheticProfiles, 0);
  for (const key of ["full500Allowed", "paidModelsAllowed", "productionAllowed"]) assert.equal(owner[key], false);
  assert.equal(owner.authorizationBinding.runId, bound.context.runId);
  assert.equal(owner.authorizationBinding.exactCommit, bound.context.exactCommit);
  assert.deepEqual(owner.authorizationBinding.prepareDiagnosticAuthorization, a);
  assert.deepEqual(owner.authorizationBinding.sourceReplayAuthorization, bound.sourceReplayAuthorization);
  assert.deepEqual(owner.authorizationBinding.simulationCalendarAuthorization, bound.simulationCalendarAuthorization);
  return a;
}
function materials(value) {
  assert.equal(value.full500DispatchAuthorized, false); assert.equal(value.activatedProfiles, 0);
  const b = value.preactivationBindings;
  assert.equal(b?.status, "PASS_ALL500_ACTUAL_D_PROVIDER_REVIEW_REQUEST_BINDINGS");
  for (const key of ["profiles", "actualDRequests", "providerRequests", "reviewRequests"]) assert.equal(b[key], 500);
  assert.equal(b.profileActivations, 0);
}
const WORKER_KEYS = ["status", "mode", "contract", "exactCommit", "runId", "runAttempt", "nonce",
  "materialsCompleted", "prepareCompleted", "firstFailurePhase", "prepareFailure", "materialsFailure", "profiles",
  "activeProfiles", "profileFieldsUnchanged", "nativeZeroState", "units", "providerPhases", "authorityInstalled",
  "ownedContainerStopped", "watchClosed", "evidence", "executionAuthority", "mock500Acceptance", "end500Acceptance",
  "productionAcceptance", "backupRoundtripVerified", "retryAllowed"];
const MATERIAL_PHASES = ["materials", ...["processing", "command", "fixtures", "audit"].map(name => "materials-copy-" + name),
  ...["entry", "baseline", "config", "originals", "qualified", "original-upacket", "calendar", "native-inputs",
    "snapshot", "native-manifest", "activation", "builder", "output", "complete"].map(name => "materials-" + name)]
  .map(name => "mock500-controller-" + name);
const PHASES = new Set([...MATERIAL_PHASES, ...["binding", "workspace", "stage-sources", "input-context", "container-create",
  "container-start", "supervisor-start", "database-readiness", "database-restore", "database-baseline", "runtime-context",
  "setup", "gateway-start", "atomic-bootstrap", "prepare", "run", "zero-audit", "services", "result-readback", "backup",
  "owned-close", "supervisor-stop", "gateway-client-close", "gateway-log-close", "final-observation"].map(name => "mock500-controller-" + name)]);
function closedWorker(value, { closedPrepareFailure, closedMaterialsFailure, closedEvidence } = {}) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).sort().join("|") !== [...WORKER_KEYS].sort().join("|")) return null;
    value = Object.fromEntries(WORKER_KEYS.map(key => [key, value[key]]));
    if (value.status !== "PASS_PREPARE_DIAGNOSTIC_CLOSED_ONLY_NOT_MOCK500" || value.mode !== MODE || value.contract !== CONTRACT
      || typeof value.exactCommit !== "string" || !/^[a-f0-9]{40}$/.test(value.exactCommit)
      || typeof value.runId !== "string" || !/^[1-9][0-9]{4,19}$/.test(value.runId) || value.runAttempt !== 1
      || typeof value.nonce !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.nonce)
      || typeof value.materialsCompleted !== "boolean" || typeof value.prepareCompleted !== "boolean"
      || value.profiles !== 500 || value.activeProfiles !== 0 || value.units !== 0 || value.providerPhases !== 0
      || !["profileFieldsUnchanged", "ownedContainerStopped", "watchClosed"].every(key => value[key] === true)
      || !["authorityInstalled", "executionAuthority", "mock500Acceptance", "end500Acceptance", "productionAcceptance",
        "backupRoundtripVerified", "retryAllowed"].every(key => value[key] === false)
      || !["BOUND_PREPARED_ZERO", "NO_OWNED_NATIVE_SLOT", "NO_NEW_NATIVE_SLOT_OBSERVED"].includes(value.nativeZeroState)) return null;
    let prepareFailure = null, materialsFailure = null;
    if (value.prepareCompleted) {
      if (!value.materialsCompleted || value.firstFailurePhase !== null || value.prepareFailure !== null || value.materialsFailure !== null
        || value.nativeZeroState !== "BOUND_PREPARED_ZERO") return null;
    } else {
      if (!PHASES.has(value.firstFailurePhase)) return null;
      if (value.prepareFailure !== null) {
        if (value.firstFailurePhase !== "mock500-controller-prepare" || typeof closedPrepareFailure !== "function"
          || !(prepareFailure = closedPrepareFailure(value.prepareFailure))) return null;
      }
      if (value.materialsFailure !== null) {
        if (!MATERIAL_PHASES.includes(value.firstFailurePhase) || typeof closedMaterialsFailure !== "function"
          || !(materialsFailure = closedMaterialsFailure(value.materialsFailure))) return null;
      }
    }
    if (typeof closedEvidence !== "function") return null;
    const evidence = closedEvidence(value.evidence);
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return null;
    return { ...Object.fromEntries(WORKER_KEYS.map(key => [key, value[key]])), evidence, prepareFailure, materialsFailure };
  } catch { return null; }
}
module.exports = { CONTRACT, SCOPE, MODE, CONFIRMATION, AUTH_SCHEMA, descriptor, validate, materials, closedWorker };
