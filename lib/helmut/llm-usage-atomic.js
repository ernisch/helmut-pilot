"use strict";

// Explicit LOCAL experiment only. No activation, migration or automatic cutover.
const { randomUUID } = require("node:crypto");
const CAS = require("./auth-store-cas");
const EU = require("./synthetik-500-eu-service-contract");
const Parts = require("./auth-state-parts");
const VERSION = "relational-atomic-v1";
const MARKER = "_llmUsageRef";
const SNAPSHOT = Symbol("atomic-usage-snapshot");
const committed = new WeakMap();
const receipts = new WeakMap();
// Reachability belongs to the confirmed read, never to mutable caller data.
const stateSnapshots = new WeakMap();
function fail(code) { const e = Error(code); e.code = code; throw e; }
function enabled(env = process.env) {
  Parts.enabled(env); // Also rejects a state flag without its local usage mode.
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
function validState(s) {
  return s && Object.keys(s).sort().join("|") === "generation|originalHash|root|version"
    && s.version === Parts.VERSION && /^[a-f0-9-]{36}$/.test(s.generation)
    && /^[a-f0-9]{64}$/.test(s.root) && /^[a-f0-9]{64}$/.test(s.originalHash);
}
function attach(data, proof, target, state = null, knownTree = null) {
  if (!validProof(proof) || !Array.isArray(data?.llmUsage) || data.llmUsage.length !== proof.count
    || Object.hasOwn(data, MARKER)) fail("ATOMIC_USAGE_READ_INVALID");
  if (Object.hasOwn(data, Parts.MARKER)) fail("AUTH_STATE_READER_REQUIRED");
  let tree;
  if (state !== null) {
    if (!validState(state)) fail("AUTH_STATE_BINDING_INVALID");
    tree = knownTree || Parts.build(data);
    if (tree.root !== state.root) fail("AUTH_STATE_CONTENT_MISMATCH");
  }
  freeze(data.llmUsage);
  const snapshot = Object.freeze({ proof: Object.freeze({ ...proof }), history: data.llmUsage,
    revision: data[CAS.REVISION], target });
  Object.defineProperty(data, SNAPSHOT, { enumerable: true,
    value: snapshot });
  if (state !== null) stateSnapshots.set(snapshot, {
    binding: Object.freeze({ ...state }), hashes: new Set(tree.hashes)
  });
  return CAS.attachSnapshot(data, { exists: true, revision: data[CAS.REVISION], target });
}
async function read({ request, rowId, target }) {
  const parts = Parts.enabled();
  const r = await request("/rest/v1/rpc/" + (parts ? "helmut_auth_state_graph_read_v1" : "helmut_auth_usage_read_v1"), {
    method: "POST", body: JSON.stringify({ id: rowId })
  });
  if (!r || !r.data || !validProof(r.proof)) fail("ATOMIC_USAGE_READ_INVALID");
  if (parts && !validState(r.state)) fail("AUTH_STATE_BINDING_INVALID");
  if (!parts) return attach(r.data, r.proof, target);
  if (Object.keys(r.data).sort().join("|") !== "_authStoreRevision|llmUsage") fail("AUTH_STATE_GRAPH_DATA_INVALID");
  const tree = Parts.decode(r.graph, r.state.root, `${target}|${r.state.generation}`);
  if (tree.data.testKostenAuftrag?.version !== EU.ORDER_VERSION
    || tree.data.testKostenAuftrag?.serviceContractHash !== EU.HASH) fail("AUTH_STATE_GRAPH_ORDER_INVALID");
  return attach({ ...tree.data, ...r.data }, r.proof, target, r.state, tree);
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
  if (Object.hasOwn(store, MARKER) || Object.hasOwn(store, Parts.MARKER)) fail("AUTH_STATE_MARKER_IN_LOGICAL_DATA");
  if (store[CAS.REVISION] !== snapshot.revision) fail("AUTH_STORE_SNAPSHOT_REVISION_CHANGED");
  const parts = Parts.enabled(), state = stateSnapshots.get(snapshot);
  if (parts !== Boolean(state)) fail("AUTH_STATE_SNAPSHOT_MODE_CHANGED");
  if (store.testKostenAuftrag?.version !== EU.ORDER_VERSION || store.testKostenAuftrag?.serviceContractHash !== EU.HASH)
    fail("ATOMIC_USAGE_EU_ORDER_REQUIRED");
  const additions = prefix(store, snapshot), revision = randomUUID();
  const data = { ...store, [CAS.REVISION]: revision };
  delete data.llmUsage; delete data[MARKER]; delete data[SNAPSHOT];
  // Capture the exact transport contents before yielding. Caller-owned nested
  // objects (including new records) may change while the request is in flight.
  const sentData = JSON.parse(JSON.stringify(data));
  const sentAdditions = JSON.parse(JSON.stringify(additions));
  const recordContents = new Map(additions.map((record, i) => [record, {
    serialized: JSON.stringify(sentAdditions[i]), value: freeze(sentAdditions[i])
  }]));
  const sentHistory = Object.freeze([...sentAdditions, ...snapshot.history]);
  const tree = parts ? Parts.build(sentData, {
    namespace: `${target}|${state.binding.generation}`, root: state.binding.root
  }) : null;
  const body = parts ? {
    id: rowId, expectedRevision: snapshot.revision, expectedProof: snapshot.proof,
    expectedState: state.binding, revision, root: tree.root,
    nodes: tree.nodes.filter(n => !state.hashes.has(n.hash)), additions: sentAdditions
  } : { id: rowId, expectedRevision: snapshot.revision, expectedProof: snapshot.proof,
    data: sentData, additions: sentAdditions };
  const rows = await request("/rest/v1/rpc/" + (parts ? "helmut_auth_state_cas_v1" : "helmut_auth_usage_cas_v1"), {
    method: "POST", body: JSON.stringify(body)
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
  if (parts && (!validState(rows[0].state) || rows[0].state.root !== tree.root
    || rows[0].state.generation !== state.binding.generation
    || rows[0].state.originalHash !== state.binding.originalHash)) fail("AUTH_STATE_WRITE_UNCONFIRMED");
  // An ACK is tied to this private, immutable read snapshot and these objects.
  // Never brand unknown network outcomes or retry them automatically.
  const accepted = attach({ ...sentData, llmUsage: sentHistory }, rows[0].proof, target,
    parts ? rows[0].state : null, tree);
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
// AI only needs an in-process confirmed ACK; accounting ALSO checks a fresh DB
// snapshot and exact receipt content with persisted(). No truthy flag shortcut.
function confirmed(record) { return enabled() ? receipts.has(record) : record?._ablage?.blob === true; }
module.exports = { VERSION, MARKER, enabled, read, write, hasSnapshot, receipt, persisted, confirmed };
