"use strict";
// Import is inert; fresh network-none small fixture only, no profiles or GO.
const assert = require("node:assert/strict");
async function run({ storage, sql, State, copy, omitRevision }) {
  assert.equal(process.env.HELMUT_AUTH_SINGLE_WRITE_CAPTURE, "single-write-capture-v1");
  assert.equal(sql("SELECT current_setting('helmut.local_auth_state_cas_projection')='off' AND to_regclass('public.mandate_profiles')IS NULL;"), "t");
  const checks = [], original = await storage.readAuthStore(), expected = omitRevision(original);
  assert(!Object.hasOwn(original, "localSingleCapture"));
  const source = await storage.readAuthStore();source.localSingleCapture = { value: "captured-before-await" };
  const fetchBefore = global.fetch;let hits = 0;
  try {
    global.fetch = async (url, options) => {
      if (String(url).endsWith("/rpc/helmut_auth_state_cas_v1")) {
        hits++;source.localSingleCapture.value = "caller-changed-inflight";
        return fetchBefore(url, options);
      }
      return fetchBefore(url, options);
    };
    const ack = await storage.writeAuthStore(source);
    assert.equal(ack.localSingleCapture.value, "captured-before-await");
    const fresh = await storage.readAuthStore();assert.equal(fresh.localSingleCapture.value, "captured-before-await");
    const native = JSON.parse(sql("SELECT public.helmut_auth_state_read_v1('{\"id\":\"main-auth\"}'::jsonb)::text;"));
    assert.equal(State.build(ack).root, native.state.root);assert.deepEqual(omitRevision(native.data), omitRevision(ack));
  } finally { global.fetch = fetchBefore; }
  assert.equal(hits, 1);checks.push({ name: "actual-native-CAS-original-caller-mutation-cannot-change-sent-state", pass: true, actualNativeReadMatched: true, requestCount: hits });
  await assert.rejects(storage.writeAuthStore(original), { code: "AUTH_STORE_CONFLICT" });
  checks.push({ name: "actual-stale-revision-rejected-without-replay-or-lost-state", pass: true });
  const rootBeforeFault = await storage.readAuthStore();rootBeforeFault.localSingleCapture.value = "unconfirmed-ACK-local-only";let faultHits = 0;
  try {
    global.fetch = async (url, options) => {
      const r = await fetchBefore(url, options);
      if (!String(url).endsWith("/rpc/helmut_auth_state_cas_v1")) return r;
      faultHits++;const body = await r.json();assert.equal(r.status, 200);assert.equal(body.length, 1);
      body[0].state.root = "0".repeat(64);return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    await assert.rejects(storage.writeAuthStore(rootBeforeFault), { code: "AUTH_STATE_WRITE_UNCONFIRMED" });
  } finally { global.fetch = fetchBefore; }
  assert.equal(faultHits, 1);const afterFault = await storage.readAuthStore();assert.equal(afterFault.localSingleCapture.value, "unconfirmed-ACK-local-only");
  checks.push({ name: "real-commit-followed-by-tampered-ACK-remains-unconfirmed-no-automatic-retry", pass: true, actualRequests: faultHits });
  await storage.mutateAuthStore(x => { delete x.localSingleCapture; });
  const restored = await storage.readAuthStore();assert.deepEqual(omitRevision(restored), expected);assert.deepEqual(restored.llmUsage, original.llmUsage);
  checks.push({ name: "all-original-logical-fields-and-entire-ledger-restored", pass: true });
  return checks;
}
module.exports = { run };
