"use strict";

// Explicit LOCAL experiment only. No activation, migration or automatic cutover.
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
  const h = u.hostname;
  if (env.VERCEL || u.protocol !== "http:" || !(/^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(h)
    || /^10\.\d+\.\d+\.\d+$/.test(h) || /^192\.168\.\d+\.\d+$/.test(h)
    || /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(h))) fail("ATOMIC_USAGE_LOCAL_ONLY");
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
  if (!validProof(proof) || !Array.isArray(data?.llmUsage) || data.llmUsage.length !== proof.count
    || Object.hasOwn(data, MARKER)) fail("ATOMIC_USAGE_READ_INVALID");
  freeze(data.llmUsage);
  Object.defineProperty(data, SNAPSHOT, { enumerable: true,
    value: Object.freeze({ proof: Object.freeze({ ...proof }), history: data.llmUsage, target }) });
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
  if (store.testKostenAuftrag?.version !== EU.ORDER_VERSION || store.testKostenAuftrag?.serviceContractHash !== EU.HASH)
    fail("ATOMIC_USAGE_EU_ORDER_REQUIRED");
  const additions = prefix(store, snapshot), revision = randomUUID();
  const data = { ...store, [CAS.REVISION]: revision };
  delete data.llmUsage; delete data[MARKER]; delete data[SNAPSHOT];
  const rows = await request("/rest/v1/rpc/helmut_auth_usage_cas_v1", {
    method: "POST", body: JSON.stringify({ id: rowId, expectedRevision: store[CAS.REVISION],
      expectedProof: snapshot.proof, data, additions })
  });
  if (Array.isArray(rows) && rows.length === 0) {
    const e = Error("Kontenspeicher wurde parallel geaendert."); e.code = "AUTH_STORE_CONFLICT"; e.statusCode = 409; throw e;
  }
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0].id !== rowId || rows[0].revision !== revision
    || !validProof(rows[0].proof) || rows[0].proof.generation !== snapshot.proof.generation
    || rows[0].proof.count !== snapshot.proof.count + additions.length
    || (!additions.length && rows[0].proof.head !== snapshot.proof.head)
    || rows[0].proof.originalHash !== snapshot.proof.originalHash) fail("ATOMIC_USAGE_WRITE_UNCONFIRMED");
  // An ACK is tied to this private, immutable read snapshot and these objects.
  // Never brand unknown network outcomes or retry them automatically.
  committed.set(snapshot, { records: new Set(additions), proof: rows[0].proof, target });
  return attach({ ...data, llmUsage: store.llmUsage }, rows[0].proof, target);
}
function receipt(record, store) {
  const c = committed.get(store?.[SNAPSHOT]);
  if (!c?.records.has(record)) fail("ATOMIC_USAGE_RECEIPT_UNCONFIRMED");
  const result = freeze({ ...record, _ablage: { blob: false, relational: true, relationalAtomic: VERSION } });
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
// AI only needs an in-process confirmed ACK; accounting ALSO checks a fresh DB
// snapshot and exact receipt content with persisted(). No truthy flag shortcut.
function confirmed(record) { return enabled() ? receipts.has(record) : record?._ablage?.blob === true; }
module.exports = { VERSION, MARKER, enabled, read, write, hasSnapshot, receipt, persisted, confirmed };
