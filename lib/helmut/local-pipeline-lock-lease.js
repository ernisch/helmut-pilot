"use strict";

// Local component only. Each confirmed SQL token belongs to one opaque handle,
// never to the latest invocation of a job name. No mutable Auth snapshot.
const Atomic = require("./llm-usage-atomic");
const MODE = "invocation-lease-v1", ENV = "HELMUT_LOCAL_PIPELINE_LOCK_MODE";
const leases = new WeakMap();
const uuid = x => typeof x === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x);
function fail(code) { const error = Error(code); error.code = code; throw error; }
function enabled(env = process.env) {
  const mode = env[ENV];
  if (!mode || mode === "off") return false;
  if (mode !== MODE || ["1", "true", "on", "yes"].includes(String(env.HELMUT_ATOMIC_LOCK || "").trim().toLowerCase())
    || !Atomic.enabled(env) || !Atomic.controlReadEnabled(env)) fail("LOCAL_PIPELINE_LEASE_MODE_INVALID");
  return true;
}
function requireMode() { if (!enabled()) fail("LOCAL_PIPELINE_LEASE_DISABLED"); }
function targetAt(getTarget) {
  if (typeof getTarget !== "function") fail("LOCAL_PIPELINE_LEASE_TARGET_INVALID");
  const target = getTarget();
  if (typeof target !== "string" || target.length < 1 || target.length > 2048)
    fail("LOCAL_PIPELINE_LEASE_TARGET_INVALID");
  return target;
}
function sameTarget(getTarget, expected) {
  requireMode();
  if (targetAt(getTarget) !== expected) fail("LOCAL_PIPELINE_LEASE_TARGET_DRIFT");
}
async function acquire({ jobName, ttlMs, request, getTarget }) {
  requireMode();
  if (typeof jobName !== "string" || !jobName.length || jobName.length > 256
    || !Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 600000 || typeof request !== "function")
    fail("LOCAL_PIPELINE_LEASE_INPUT_INVALID");
  const target = targetAt(getTarget);
  // Transport is invoked synchronously after the target check. Storage captures
  // its URL before yielding; a later drift invalidates even a received ACK.
  const rows = await request("/rest/v1/rpc/helmut_acquire_pipeline_lock", {
    method: "POST", maxResponseBytes: 4096,
    body: JSON.stringify({ p_job: jobName, p_ttl_ms: ttlMs })
  });
  sameTarget(getTarget, target);
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || typeof rows[0] !== "object"
    || Array.isArray(rows[0]) || Reflect.ownKeys(rows[0]).length !== 2
    || Object.keys(rows[0]).sort().join("|") !== "acquired|token") fail("LOCAL_PIPELINE_LEASE_UNCONFIRMED");
  const fields = Object.getOwnPropertyDescriptors(rows[0]);
  if (!Object.hasOwn(fields.acquired, "value") || !Object.hasOwn(fields.token, "value"))
    fail("LOCAL_PIPELINE_LEASE_UNCONFIRMED");
  const acquired = fields.acquired.value, token = fields.token.value;
  if (acquired === false && token === null) return null;
  if (acquired !== true || !uuid(token)) fail("LOCAL_PIPELINE_LEASE_UNCONFIRMED");
  const handle = Object.freeze(Object.create(null));
  leases.set(handle, { jobName, token, target, request, getTarget });
  return handle;
}
async function release(handle) {
  const lease = leases.get(handle);
  if (!lease) fail("LOCAL_PIPELINE_LEASE_HANDLE_INVALID");
  // Consume before mode/target validation and before the first await. Neither an
  // unknown network outcome nor a concurrent call can resend this release.
  leases.delete(handle);
  sameTarget(lease.getTarget, lease.target);
  const result = await lease.request("/rest/v1/rpc/helmut_release_pipeline_lock", {
    method: "POST", maxResponseBytes: 4096,
    body: JSON.stringify({ p_job: lease.jobName, p_token: lease.token })
  });
  sameTarget(lease.getTarget, lease.target);
  if (result !== true && result !== false) fail("LOCAL_PIPELINE_LEASE_RELEASE_UNCONFIRMED");
  return result;
}
module.exports = { MODE, ENV, enabled, acquire, release };
