"use strict";

// Explicit LOCAL experiment only. No activation, migration or automatic cutover.
// Reuses the usage-only protocol from #920 and the private revision/content ACK
// guards from #921. No state graph, history cache or changed business controls.
const { randomUUID } = require("node:crypto");
const CAS = require("./auth-store-cas");
const EU = require("./synthetik-500-eu-service-contract");
const VERSION = "relational-atomic-v1";
const MARKER = "_llmUsageRef";
const SNAPSHOT = Symbol("atomic-usage-snapshot");
const committed = new WeakMap();
const receipts = new WeakMap();
function fail(code) { const e = Error(code); e.code = code; throw e; }
function enabled(env = process.env) {
  const mode = env.HELMUT_LLM_USAGE_STORAGE;
  if (!mode || mode === "blob") return false;
  if (mode !== VERSION) fail("ATOMIC_USAGE_MODE_INVALID");
  let u; try { u = new URL(env.SUPABASE_URL); } catch { fail("ATOMIC_USAGE_LOCAL_ONLY"); }
  if (env.VERCEL || u.protocol !== "http:" || u.username || u.password
    || !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)) fail("ATOMIC_USAGE_LOCAL_ONLY");
  return true;
}
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const v of Object.values(value)) freeze(v);
    Object.freeze(value);
  }
  return value;
}
function validProof(p) {
  return p && /^[a-f0-9-]{36}$/.test(p.generation) && Number.isSafeInteger(p.count) && p.count >= 0
    && /^[a-f0-9]{64}$/.test(p.head) && /^[a-f0-9]{64}$/.test(p.originalHash);
}
function attach(data, proof, target) {
  if (!validProof(proof) || !data || typeof data !== "object" || Array.isArray(data)
    || !Array.isArray(data.llmUsage) || data.llmUsage.length !== proof.count
    || Object.hasOwn(data, MARKER) || Object.hasOwn(data, "_authStateRef")) fail("ATOMIC_USAGE_READ_INVALID");
  freeze(data.llmUsage);
  const snapshot = Object.freeze({ proof: Object.freeze({ ...proof }), history: data.llmUsage,
    revision: data[CAS.REVISION], target });
  Object.defineProperty(data, SNAPSHOT, { enumerable: true, value: snapshot });
  return CAS.attachSnapshot(data, { exists: true, revision: data[CAS.REVISION], target });
}
async function read({ request, rowId, target }) {
  const r = await request("/rest/v1/rpc/helmut_auth_usage_read_v1", {
    method: "POST", body: JSON.stringify({ id: rowId })
  });
  if (!r || !r.data || !validProof(r.proof)) fail("ATOMIC_USAGE_READ_INVALID");
  return attach(r.data, r.proof, target);
}
function hasSnapshot(store) { return Boolean(store?.[SNAPSHOT]); }
function prefix(store, snapshot) {
  const next = store.llmUsage, old = snapshot.history;
  if (next === old) return [];
  if (!Array.isArray(next) || next.length < old.length) fail("ATOMIC_USAGE_HISTORY_CHANGED");
  const n = next.length - old.length;
  for (let i = 0; i < old.length; i++) if (next[n + i] !== old[i]) fail("ATOMIC_USAGE_HISTORY_CHANGED");
  return next.slice(0, n);
}
async function write(store, { request, rowId, target }) {
  const snapshot = store?.[SNAPSHOT];
  if (!snapshot || snapshot.target !== target) fail("AUTH_STORE_SNAPSHOT_MISSING");
  if (Object.hasOwn(store, MARKER) || Object.hasOwn(store, "_authStateRef")) fail("ATOMIC_USAGE_MARKER_IN_LOGICAL_DATA");
  if (store[CAS.REVISION] !== snapshot.revision) fail("AUTH_STORE_SNAPSHOT_REVISION_CHANGED");
  const order = store.testKostenAuftrag;
  if (!(order?.version === EU.ORDER_VERSION && order.serviceContractHash === EU.HASH || EU.renewedOrder(order)))
    fail("ATOMIC_USAGE_EU_ORDER_REQUIRED");
  const additions = prefix(store, snapshot), revision = randomUUID();
  const data = { ...store, [CAS.REVISION]: revision };
  delete data.llmUsage; delete data[MARKER]; delete data[SNAPSHOT];
  // Capture exact transport values before yielding; caller-owned objects may
  // change while the HTTP request is in flight. ACKs never certify those edits.
  const sentData = JSON.parse(JSON.stringify(data));
  const sentAdditions = JSON.parse(JSON.stringify(additions));
  const recordContents = new Map(additions.map((record, i) => [record, {
    serialized: JSON.stringify(sentAdditions[i]), value: freeze(sentAdditions[i])
  }]));
  const sentHistory = Object.freeze([...sentAdditions, ...snapshot.history]);
  const rows = await request("/rest/v1/rpc/helmut_auth_usage_cas_v1", {
    method: "POST", body: JSON.stringify({ id: rowId, expectedRevision: snapshot.revision,
      expectedProof: snapshot.proof, data: sentData, additions: sentAdditions })
  });
  if (Array.isArray(rows) && rows.length === 0) {
    const e = Error("Kontenspeicher wurde parallel geaendert."); e.code = "AUTH_STORE_CONFLICT"; e.statusCode = 409; throw e;
  }
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0].id !== rowId || rows[0].revision !== revision
    || !validProof(rows[0].proof) || rows[0].proof.generation !== snapshot.proof.generation
    || rows[0].proof.count !== snapshot.proof.count + additions.length
    || (!additions.length && rows[0].proof.head !== snapshot.proof.head)
    || (additions.length > 0 && rows[0].proof.head === snapshot.proof.head)
    || rows[0].proof.originalHash !== snapshot.proof.originalHash) fail("ATOMIC_USAGE_WRITE_UNCONFIRMED");
  const accepted = attach({ ...sentData, llmUsage: sentHistory }, rows[0].proof, target);
  committed.set(snapshot, { records: recordContents, proof: rows[0].proof, target });
  return accepted;
}
function receipt(record, store) {
  const c = committed.get(store?.[SNAPSHOT]);
  if (!c?.records.has(record)) fail("ATOMIC_USAGE_RECEIPT_UNCONFIRMED");
  const actual = c.records.get(record);
  if (JSON.stringify(record) !== actual.serialized) fail("ATOMIC_USAGE_RECEIPT_CONTENT_CHANGED");
  const result = freeze({ ...actual.value, _ablage: { blob: false, relational: true, relationalAtomic: VERSION } });
  receipts.set(result, { target: c.target, generation: c.proof.generation });
  return result;
}
function persisted(auth, record) {
  if (!hasSnapshot(auth)) return record?._ablage?.blob === true; // Unchanged legacy contract.
  const p = auth?.[SNAPSHOT], r = receipts.get(record);
  return Boolean(p && r && p.target === r.target && p.proof.generation === r.generation
    && record?._ablage?.blob === false && record?._ablage?.relationalAtomic === VERSION
    && auth.llmUsage.some(x => x.id === record.id && require("./synthetik-500-profile").hash(x)
      === require("./synthetik-500-profile").hash(Object.fromEntries(Object.entries(record).filter(([k]) => k !== "_ablage")))));
}
// Accounting additionally requires a fresh complete DB read and persisted().
function confirmed(record) { return enabled() ? receipts.has(record) : record?._ablage?.blob === true; }
module.exports = { VERSION, MARKER, enabled, read, write, hasSnapshot, receipt, persisted, confirmed };
