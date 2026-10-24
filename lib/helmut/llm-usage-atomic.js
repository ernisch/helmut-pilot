"use strict";

// Explicit LOCAL experiment only. No activation, migration or automatic cutover.
const { randomUUID, createHash } = require("node:crypto");
const { hrtime } = require("node:process");
const { deflateRawSync, inflateRawSync } = require("node:zlib");
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
const HISTORY_REUSE = "verified-history-reuse-v1", HISTORY_CACHE_BYTES = 8 * 1024 * 1024;
const GRAPH_REUSE = "verified-graph-reuse-v1", GRAPH_CACHE_BYTES = 8 * 1024 * 1024;
// One private immutable content array. Never a revision/permission snapshot.
let historyCache = null;
// One bounded private content capability, never an authorization decision or
// caller-owned logical object. Each read captures its own immutable witness.
let graphCache = null;
// A separate READ-ONLY view, never a complete Auth snapshot or write receipt.
// Its contents may be reused only after this request's complete native graph
// and history checks prove the same actual immutable state. No full root text.
const CONTROL_READ = "verified-control-view-v1", CONTROL_CACHE_BYTES = 2 * 1024 * 1024;
const CONTROL_TEXT_MAX_BYTES = Parts.MAX_EXPANDED_BYTES;
const CONTROL_KEYS = Object.freeze(["synthetik500DispatchJournal", "synthetik500KostenAdmission",
  "testKostenAuftrag", "testKostenTage"]);
let controlCache = null;
// Separate from full Auth snapshots: at most one expiring, one-use own writer.
let ownRead = null;
const ownCommits = new WeakSet(), OWN_READ_MS = 30000, OWN_HISTORY_BYTES = 32 * 1024 * 1024;
const sha = value => createHash("sha256").update(value, "utf8").digest("hex");
function fail(code) { const e = Error(code); e.code = code; throw e; }
function enabled(env = process.env) {
  const parts = Parts.enabled(env); // Also rejects a state flag without its local usage mode.
  controlReadEnabled(env);
  const capture = env.HELMUT_AUTH_SINGLE_WRITE_CAPTURE;
  if (capture && capture !== "off" && (capture !== "single-write-capture-v1" || !parts))
    fail("AUTH_SINGLE_CAPTURE_MODE_INVALID");
  const reuse = env.HELMUT_AUTH_HISTORY_READ_REUSE;
  if (reuse && reuse !== "off" && (reuse !== HISTORY_REUSE || !parts)) fail("AUTH_HISTORY_REUSE_MODE_INVALID");
  const graphReuse = env.HELMUT_AUTH_GRAPH_READ_REUSE;
  if (graphReuse && graphReuse !== "off"
    && (graphReuse !== GRAPH_REUSE || !parts || reuse !== HISTORY_REUSE)) fail("AUTH_GRAPH_REUSE_MODE_INVALID");
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
function controlReadEnabled(env = process.env) {
  const mode = env.HELMUT_AUTH_CONTROL_READ;
  if (!mode || mode === "off") { controlCache = null; return false; }
  if (mode !== CONTROL_READ || !Parts.enabled(env)
    || env.HELMUT_AUTH_HISTORY_READ_REUSE !== HISTORY_REUSE
    || (env.HELMUT_AUTH_GRAPH_READ_REUSE && env.HELMUT_AUTH_GRAPH_READ_REUSE !== "off")
    || (env.HELMUT_AUTH_SINGLE_WRITE_CAPTURE && env.HELMUT_AUTH_SINGLE_WRITE_CAPTURE !== "off"))
    fail("AUTH_CONTROL_READ_MODE_INVALID");
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
function reuseEnabled() {
  const value = process.env.HELMUT_AUTH_HISTORY_READ_REUSE;
  if (!value || value === "off") { historyCache = null; return false; }
  if (value !== HISTORY_REUSE || !Parts.enabled()) fail("AUTH_HISTORY_REUSE_MODE_INVALID");
  return true;
}
function proofKey(proof) {
  if (!validProof(proof) || Object.keys(proof).sort().join("|") !== "count|generation|head|originalHash")
    fail("AUTH_HISTORY_REUSE_PROOF_INVALID");
  return [proof.generation, proof.count, proof.head, proof.originalHash].join("|");
}
function graphReuseEnabled() {
  const value = process.env.HELMUT_AUTH_GRAPH_READ_REUSE;
  if (!value || value === "off") { graphCache = null; return false; }
  if (value !== GRAPH_REUSE || !Parts.enabled()
    || process.env.HELMUT_AUTH_HISTORY_READ_REUSE !== HISTORY_REUSE) fail("AUTH_GRAPH_REUSE_MODE_INVALID");
  return true;
}
function sameState(a, b) {
  return validState(a) && validState(b) && ["version", "generation", "root", "originalHash"].every(k => a[k] === b[k]);
}
function graphDigest(graph) { return sha(graph.nodes.map(node => node.hash).join("|")); }
function verifyGraphReuse(result, nonce, rowId, hint) {
  const r = result.graphReuse, state = result.state, proof = result.proof;
  if (!r || Object.keys(r).sort().join("|") !== "actualPayloadsChecked|binding|nodeCount|nodeDigest|nonce|reused|version"
    || r.version !== GRAPH_REUSE || r.nonce !== nonce || typeof r.reused !== "boolean"
    || r.actualPayloadsChecked !== r.reused || !Number.isSafeInteger(r.nodeCount) || r.nodeCount < 1 || r.nodeCount > 20000
    || typeof r.nodeDigest !== "string" || !/^[a-f0-9]{64}$/.test(r.nodeDigest)
    || typeof r.binding !== "string" || !/^[a-f0-9]{64}$/.test(r.binding)) fail("AUTH_GRAPH_REUSE_RESPONSE_INVALID");
  const digest = sha([GRAPH_REUSE, nonce, sha(rowId), result.data[CAS.REVISION],
    state.version, state.generation, state.root, state.originalHash,
    proof.generation, proof.count, proof.head, proof.originalHash,
    r.nodeCount, r.nodeDigest, r.reused ? "1" : "0"].join("|"));
  if (digest !== r.binding) fail("AUTH_GRAPH_REUSE_BINDING_INVALID");
  if (r.reused) {
    if (!hint || !sameState(hint.state, state) || hint.nodeCount !== r.nodeCount
      || hint.nodeDigest !== r.nodeDigest || !hint.token || result.graph !== null) fail("AUTH_GRAPH_REUSE_CONTENT_MISSING");
    return null;
  }
  if (!result.graph || Object.keys(result.graph).sort().join("|") !== "nodes|root"
    || !Array.isArray(result.graph.nodes) || result.graph.nodes.length !== r.nodeCount
    || graphDigest(result.graph) !== r.nodeDigest) fail("AUTH_GRAPH_REUSE_CONTENT_MISMATCH");
  return result.graph;
}
function rememberGraph(graph, tree, state, target, rowId) {
  if (!graphReuseEnabled()) return;
  if (graphCache?.token === tree.reuseToken && graphCache.target === target && graphCache.rowId === rowId
    && sameState(graphCache.state, state)) return;
  if (!tree.reuseToken) { graphCache = null; return; }
  // Count one node at a time; never serialize another complete graph merely
  // to enforce the bound. Payload strings are immutable and stay private.
  let bytes = Buffer.byteLength(JSON.stringify({ root: graph.root, nodes: [] }), "utf8");
  for (let i = 0; i < graph.nodes.length; i++) {
    bytes += Buffer.byteLength(JSON.stringify(graph.nodes[i]), "utf8") + (i ? 1 : 0);
    if (bytes > GRAPH_CACHE_BYTES) { graphCache = null; return; }
  }
  graphCache = Object.freeze({ target, rowId, state: Object.freeze({ ...state }),
    nodeCount: graph.nodes.length, nodeDigest: graphDigest(graph), token: tree.reuseToken, bytes });
}
function rememberHistory(store, proof, target, rowId) {
  if (!reuseEnabled()) return;
  const key = proofKey(proof), history = store.llmUsage;
  if (historyCache?.target === target && historyCache.rowId === rowId
    && historyCache.key === key && historyCache.history === history) return;
  let bytes = 2;
  for (let i = 0; i < history.length; i++) {
    // Count one record at a time; no second full-history serialization.
    bytes += Buffer.byteLength(JSON.stringify(history[i]), "utf8") + (i ? 1 : 0);
    if (bytes > HISTORY_CACHE_BYTES) { historyCache = null; return; }
  }
  if (!Object.isFrozen(history) || history.some(record => !Object.isFrozen(record)))
    fail("AUTH_HISTORY_REUSE_MUTABLE_CONTENT");
  historyCache = Object.freeze({ target, rowId, key, proof: Object.freeze({ ...proof }), history, bytes });
}
function controlText(store) {
  return JSON.stringify(Object.fromEntries(CONTROL_KEYS.filter(k => Object.hasOwn(store, k)).map(k => [k, store[k]])));
}
function rememberControl(graph, store, state, target, rowId, verifiedText = null) {
  if (!controlReadEnabled()) return;
  if (controlCache?.target === target && controlCache.rowId === rowId && sameState(controlCache.state, state)) return;
  // Called ONLY after the complete original decoder accepted the ACTUAL graph.
  // A writer ACK alone cannot establish the native historical node_seq digest.
  const text = verifiedText ?? controlText(store), bytes = Buffer.byteLength(text, "utf8");
  let content = { text, bytes };
  if (bytes > CONTROL_CACHE_BYTES) {
    controlCache = null;
    // The four-field projection is a subset of the root already accepted by
    // Parts.decode. Reuse its existing logical bound; no new Auth rejection.
    if (bytes > CONTROL_TEXT_MAX_BYTES) return text;
    let encoded;
    try { encoded = deflateRawSync(text, { maxOutputLength: CONTROL_CACHE_BYTES }); }
    catch { return text; } // Encoding/capacity failure is a cache miss, no retry.
    if (encoded.length > CONTROL_CACHE_BYTES) return text;
    // Own the bounded buffer; retain neither the original text nor Auth objects.
    content = { encoded: Buffer.from(encoded), bytes: encoded.length,
      textBytes: bytes, textSHA256: sha(text) };
  }
  controlCache = Object.freeze({ target, rowId, state: Object.freeze({ ...state }),
    nodeCount: graph.nodes.length, nodeDigest: graphDigest(graph),
    token: Object.freeze(Object.create(null)), ...content });
  return text; // Cold readControl can use the already verified text exactly once.
}
function cachedControlText(cache) {
  if (typeof cache.text === "string") return cache.text;
  if (!Buffer.isBuffer(cache.encoded) || cache.encoded.length !== cache.bytes
    || cache.bytes < 1 || cache.bytes > CONTROL_CACHE_BYTES
    || !Number.isSafeInteger(cache.textBytes) || cache.textBytes <= CONTROL_CACHE_BYTES
    || cache.textBytes > CONTROL_TEXT_MAX_BYTES || !/^[a-f0-9]{64}$/.test(cache.textSHA256))
    fail("AUTH_CONTROL_CACHE_INVALID");
  const inflated = inflateRawSync(cache.encoded, { maxOutputLength: cache.textBytes, info: true });
  if (inflated.buffer.length !== cache.textBytes || inflated.engine.bytesWritten !== cache.encoded.length
    || sha(inflated.buffer) !== cache.textSHA256) fail("AUTH_CONTROL_CACHE_INVALID");
  return new TextDecoder("utf-8", { fatal: true }).decode(inflated.buffer);
}
function controlView(text, revision) {
  // Fresh mutable-state checks run on a detached read-only view. It has neither
  // Atomic's private SNAPSHOT nor CAS's private snapshot, even after spreading.
  return freeze({ ...JSON.parse(text), [CAS.REVISION]: revision });
}
function verifyReuse(result, nonce, rowId, hint) {
  const reuse = result.historyReuse, state = result.state, proof = result.proof;
  if (!reuse || Object.keys(reuse).sort().join("|") !== "binding|nonce|reused|version"
    || reuse.version !== HISTORY_REUSE || reuse.nonce !== nonce || typeof reuse.reused !== "boolean"
    || typeof reuse.binding !== "string" || !/^[a-f0-9]{64}$/.test(reuse.binding)
    || typeof result.data[CAS.REVISION] !== "string" || !/^[a-f0-9-]{36}$/.test(result.data[CAS.REVISION]))
    fail("AUTH_HISTORY_REUSE_RESPONSE_INVALID");
  const key = proofKey(proof);
  const digest = sha([HISTORY_REUSE, nonce, sha(rowId), result.data[CAS.REVISION],
    state.version, state.generation, state.root, state.originalHash,
    proof.generation, proof.count, proof.head, proof.originalHash, reuse.reused ? "1" : "0"].join("|"));
  if (digest !== reuse.binding) fail("AUTH_HISTORY_REUSE_BINDING_INVALID");
  if (reuse.reused) {
    if (!hint || hint.rowId !== rowId || hint.key !== key || Object.hasOwn(result.data, "llmUsage"))
      fail("AUTH_HISTORY_REUSE_CONTENT_MISSING");
    return { ...result.data, llmUsage: hint.history };
  }
  if (!Array.isArray(result.data.llmUsage)) fail("AUTH_HISTORY_REUSE_CONTENT_MISSING");
  return result.data;
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
  const reuse = reuseEnabled();
  const graphReuse = graphReuseEnabled();
  const hint = reuse && historyCache?.target === target && historyCache.rowId === rowId ? historyCache : null;
  const graphHint = graphReuse && graphCache?.target === target && graphCache.rowId === rowId ? graphCache : null;
  const nonce = reuse ? randomUUID() : null;
  const body = reuse ? { id: rowId, knownProof: hint?.proof || null, readNonce: nonce } : { id: rowId };
  if (graphReuse) body.knownGraph = graphHint ? { state: graphHint.state,
    nodeCount: graphHint.nodeCount, nodeDigest: graphHint.nodeDigest } : null;
  let r;
  try { r = await request("/rest/v1/rpc/" + (parts ? "helmut_auth_state_graph_read_v1" : "helmut_auth_usage_read_v1"), {
    method: "POST", body: JSON.stringify(body)
  }); } catch (error) {
    if (reuse && historyCache === hint) historyCache = null;
    if (graphReuse && graphCache === graphHint) graphCache = null;
    throw error;
  }
  try {
    if (!r || !r.data || !validProof(r.proof)) fail("ATOMIC_USAGE_READ_INVALID");
    if (parts && !validState(r.state)) fail("AUTH_STATE_BINDING_INVALID");
    if (!parts) return attach(r.data, r.proof, target);
    const data = reuse ? verifyReuse(r, nonce, rowId, hint) : r.data;
    if (Object.keys(data).sort().join("|") !== "_authStoreRevision|llmUsage") fail("AUTH_STATE_GRAPH_DATA_INVALID");
    const graph = graphReuse ? verifyGraphReuse(r, nonce, rowId, graphHint) : r.graph;
    // Cold/changed content passes the complete original decoder. Reuse needs
    // this read's fresh native actual-payload SHA/bounds/state/digest proof and
    // a private token registered only by that complete decoder. Only immutable
    // content work is memoized; fresh logical/security guards remain unchanged.
    const namespace = `${target}|${r.state.generation}`;
    const tree = !graphReuse ? Parts.decode(graph, r.state.root, namespace)
      : graph === null ? Parts.copyVerifiedContent(graphHint.token, r.state.root, namespace)
        : Parts.decodeForReuse(graph, r.state.root, namespace);
    if (tree.data.testKostenAuftrag?.version !== EU.ORDER_VERSION
      || tree.data.testKostenAuftrag?.serviceContractHash !== EU.HASH) fail("AUTH_STATE_GRAPH_ORDER_INVALID");
    const accepted = attach({ ...tree.data, ...data }, r.proof, target, r.state, tree);
    if (reuse) rememberHistory(accepted, r.proof, target, rowId);
    if (graphReuse && graph !== null) rememberGraph(graph, tree, r.state, target, rowId);
    if (controlReadEnabled()) rememberControl(graph, accepted, r.state, target, rowId);
    return accepted;
  } catch (error) {
    if (reuse && historyCache === hint) historyCache = null;
    if (graphReuse && graphCache === graphHint) graphCache = null;
    throw error;
  }
}
async function readControl({ request, rowId, target }) {
  if (!controlReadEnabled()) fail("AUTH_CONTROL_READ_MODE_REQUIRED");
  const hint = controlCache?.target === target && controlCache.rowId === rowId ? controlCache : null;
  const history = historyCache?.target === target && historyCache.rowId === rowId ? historyCache : null;
  const nonce = randomUUID();
  try {
    const r = await request("/rest/v1/rpc/helmut_auth_state_graph_read_v1", {
      method: "POST", body: JSON.stringify({ id: rowId, knownProof: history?.proof || null, readNonce: nonce,
        knownGraph: hint ? { state: hint.state, nodeCount: hint.nodeCount, nodeDigest: hint.nodeDigest } : null })
    });
    if (!r || !r.data || !validProof(r.proof)) fail("ATOMIC_USAGE_READ_INVALID");
    if (!validState(r.state)) fail("AUTH_STATE_BINDING_INVALID");
    const data = verifyReuse(r, nonce, rowId, history);
    if (Object.keys(data).sort().join("|") !== "_authStoreRevision|llmUsage"
      || !Array.isArray(data.llmUsage) || data.llmUsage.length !== r.proof.count) fail("AUTH_STATE_GRAPH_DATA_INVALID");
    // Existing fresh native protocol: every reachable ACTUAL payload SHA,
    // postorder/type/depth/work bound, full usage chain, nonce and origin-bound
    // state/digest. The private token here covers ONLY the four control fields.
    const graph = verifyGraphReuse(r, nonce, rowId, hint);
    if (graph === null) {
      freeze(data.llmUsage);
      rememberHistory(data, r.proof, target, rowId);
      return controlView(cachedControlText(hint), data[CAS.REVISION]);
    }
    // Every cold/changed root passes complete actual graph validation. Unknown
    // roots also retain full original materialization/normal-form validation.
    const tree = Parts.projectControl(graph, r.state.root, `${target}|${r.state.generation}`);
    if (tree.order.version !== EU.ORDER_VERSION || tree.order.serviceContractHash !== EU.HASH) fail("AUTH_STATE_GRAPH_ORDER_INVALID");
    freeze(data.llmUsage); rememberHistory(data, r.proof, target, rowId);
    const text = rememberControl(graph, null, r.state, target, rowId, tree.text);
    // Reuse the verified cold text even when bounded encoding could not fit.
    const selected = text ?? (controlCache?.target === target && controlCache.rowId === rowId
      && sameState(controlCache.state, r.state) ? cachedControlText(controlCache) : tree.text);
    return controlView(selected, data[CAS.REVISION]);
  } catch (error) {
    if (controlCache === hint) controlCache = null;
    if (historyCache === history) historyCache = null;
    throw error;
  }
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
function assertWriteACK(rows, rowId, revision, snapshot, additions, state, tree, parts) {
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
}
function ownMode(rowId, target, operationId) {
  if (!enabled() || !Parts.enabled() || !controlReadEnabled() || rowId !== "main-auth"
    || typeof operationId !== "string" || !/^localUnitDiagnostic-[a-f0-9]{32}$/.test(operationId)
    || process.env.HELMUT_STORAGE_BACKEND !== "supabase"
    || process.env.HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE !== "helmut_unit_diagnostic_" + operationId.slice(-32)
    || target !== new URL(process.env.SUPABASE_URL).origin + "|main-auth") fail("AUTH_OWN_MODE_REQUIRED");
}
async function readOwn({ request, rowId, target, operationId }, writable) {
  ownMode(rowId, target, operationId);
  if (writable && ownRead) { Parts.discardOwnMutation(ownRead.token); ownRead = null; }
  const hint = historyCache?.target === target && historyCache.rowId === rowId ? historyCache : null;
  const nonce = randomUUID(), started = Date.now(), startedMono = hrtime.bigint(); let token = null;
  try {
    const r = await request("/rest/v1/rpc/helmut_auth_state_graph_read_v1", { method: "POST",
      body: JSON.stringify({ id: rowId, knownProof: hint?.proof || null, readNonce: nonce }) });
    ownMode(rowId, target, operationId);
    if (!r || !r.data || !validProof(r.proof) || !validState(r.state)) fail("ATOMIC_USAGE_READ_INVALID");
    const data = verifyReuse(r, nonce, rowId, hint);
    if (Object.keys(data).sort().join("|") !== "_authStoreRevision|llmUsage"
      || !Array.isArray(data.llmUsage) || data.llmUsage.length !== r.proof.count) fail("AUTH_STATE_GRAPH_DATA_INVALID");
    const namespace = `${target}|${r.state.generation}`;
    const tree = writable ? Parts.openOwnMutation(r.graph, r.state.root, namespace, operationId)
      : Parts.projectOwn(r.graph, r.state.root, namespace, operationId);
    token = tree.token;
    if (tree.order.version !== EU.ORDER_VERSION || tree.order.serviceContractHash !== EU.HASH) {
      Parts.discardOwnMutation(tree.token); fail("AUTH_STATE_GRAPH_ORDER_INVALID");
    }
    freeze(data.llmUsage);
    let bytes = 2;
    for (const record of data.llmUsage) {
      bytes += Buffer.byteLength(JSON.stringify(record), "utf8") + 1;
      if (bytes > OWN_HISTORY_BYTES) { Parts.discardOwnMutation(tree.token); fail("AUTH_OWN_HISTORY_LIMIT"); }
    }
    const view = freeze({ ...tree.data, llmUsage: data.llmUsage });
    rememberHistory(view, r.proof, target, rowId);
    if (writable) ownRead = { view, token: tree.token, target, rowId, operationId, startedMono, expiresAt: started + OWN_READ_MS,
      snapshot: Object.freeze({ proof: Object.freeze({ ...r.proof }), history: data.llmUsage,
        revision: data[CAS.REVISION], target }),
      state: { binding: Object.freeze({ ...r.state }) } };
    return view; // Read-only seven-key view, deliberately NO full Auth SNAPSHOT.
  } catch (error) {
    Parts.discardOwnMutation(token);
    if (historyCache === hint) historyCache = null;
    if (writable && ownRead) { Parts.discardOwnMutation(ownRead.token); ownRead = null; }
    throw error;
  }
}
function ownReadAlive(read) {
  const elapsed = hrtime.bigint() - read.startedMono;
  return Date.now() <= read.expiresAt && elapsed >= 0n && elapsed <= BigInt(OWN_READ_MS) * 1000000n;
}
function hasOwnRead(view) { return Boolean(ownRead && ownRead.view === view && ownReadAlive(ownRead)); }
function discardOwnRead(view) {
  if (ownRead?.view === view) { Parts.discardOwnMutation(ownRead.token); ownRead = null; }
}
async function writeOwn(view, mutation, { request, rowId, target }) {
  const read = ownRead; ownRead = null; // No retry, including capture/transport errors.
  if (!read || read.view !== view || read.target !== target || read.rowId !== rowId || !ownReadAlive(read)) {
    if (read) Parts.discardOwnMutation(read.token);
    fail("AUTH_OWN_WITNESS_MISSING");
  }
  try {
    ownMode(rowId, target, read.operationId);
    const keys = Object.keys(mutation || {});
    if (keys.length !== 1 || !["state", "record"].includes(keys[0])) fail("AUTH_OWN_MUTATION_INVALID");
    const originalRecord = keys[0] === "record" ? mutation.record : null;
    const additions = originalRecord === null ? [] : [JSON.parse(JSON.stringify(originalRecord))];
    if (originalRecord !== null && (!originalRecord || typeof originalRecord !== "object" || Array.isArray(originalRecord)
      || !additions[0] || typeof additions[0] !== "object" || Array.isArray(additions[0])
      || read.snapshot.history.some(old => old.id === additions[0].id))) fail("ATOMIC_USAGE_HISTORY_CHANGED");
    const tree = Parts.captureOwnMutation(read.token, originalRecord === null ? mutation.state : null);
    if (originalRecord === null && tree.root === read.state.binding.root) fail("AUTH_OWN_STATE_UNCHANGED");
    const revision = randomUUID(), serialized = originalRecord === null ? null : JSON.stringify(additions[0]);
    freeze(additions);
    const body = { id: rowId, expectedRevision: read.snapshot.revision, expectedProof: read.snapshot.proof,
      expectedState: read.state.binding, revision, root: tree.root,
      // The consumed private Parts witness already returns the exact delta.
      nodes: tree.nodes, additions };
    const rows = await request("/rest/v1/rpc/helmut_auth_state_cas_v1", { method: "POST", body: JSON.stringify(body) });
    ownMode(rowId, target, read.operationId);
    assertWriteACK(rows, rowId, revision, read.snapshot, additions, read.state, tree, true);
    let receipt = null;
    if (originalRecord !== null) {
      if (JSON.stringify(originalRecord) !== serialized) fail("ATOMIC_USAGE_RECEIPT_CONTENT_CHANGED");
      receipt = makeReceipt({ value: additions[0] }, rows[0].proof, target);
      try { rememberHistory({ llmUsage: Object.freeze([...additions, ...read.snapshot.history]) }, rows[0].proof, target, rowId); }
      catch { historyCache = null; }
    }
    const accepted = Object.freeze({ receipt }); ownCommits.add(accepted); return accepted;
  } finally { Parts.discardOwnMutation(read.token); }
}
function ownWriteConfirmed(result) { return ownCommits.has(result); }
async function write(store, { request, rowId, target }) {
  const reuseAtStart = reuseEnabled();
  const snapshot = store?.[SNAPSHOT];
  if (!snapshot || snapshot.target !== target) fail("AUTH_STORE_SNAPSHOT_MISSING");
  if (Object.hasOwn(store, MARKER) || Object.hasOwn(store, Parts.MARKER)) fail("AUTH_STATE_MARKER_IN_LOGICAL_DATA");
  if (store[CAS.REVISION] !== snapshot.revision) fail("AUTH_STORE_SNAPSHOT_REVISION_CHANGED");
  const parts = Parts.enabled(), state = stateSnapshots.get(snapshot);
  const captureMode = process.env.HELMUT_AUTH_SINGLE_WRITE_CAPTURE;
  if (captureMode && captureMode !== "off" && (captureMode !== "single-write-capture-v1" || !parts))
    fail("AUTH_SINGLE_CAPTURE_MODE_INVALID");
  if (parts !== Boolean(state)) fail("AUTH_STATE_SNAPSHOT_MODE_CHANGED");
  if (store.testKostenAuftrag?.version !== EU.ORDER_VERSION || store.testKostenAuftrag?.serviceContractHash !== EU.HASH)
    fail("ATOMIC_USAGE_EU_ORDER_REQUIRED");
  const additions = prefix(store, snapshot), revision = randomUUID();
  const data = { ...store, [CAS.REVISION]: revision };
  delete data.llmUsage; delete data[MARKER]; delete data[SNAPSHOT];
  // Capture the exact transport contents before yielding. Caller-owned nested
  // objects (including new records) may change while the request is in flight.
  const reuseState = parts ? { namespace: `${target}|${state.binding.generation}`, root: state.binding.root } : null;
  const captured = captureMode === "single-write-capture-v1" ? Parts.captureWrite(data, additions, reuseState) : null;
  const sentData = captured ? captured.data : JSON.parse(JSON.stringify(data));
  const sentAdditions = captured ? captured.additions : JSON.parse(JSON.stringify(additions));
  const recordContents = new Map(additions.map((record, i) => [record, {
    serialized: JSON.stringify(sentAdditions[i]), value: freeze(sentAdditions[i])
  }]));
  const sentHistory = Object.freeze([...sentAdditions, ...snapshot.history]);
  const tree = captured ? captured.tree : parts ? Parts.build(sentData, reuseState) : null;
  const body = parts ? {
    id: rowId, expectedRevision: snapshot.revision, expectedProof: snapshot.proof,
    expectedState: state.binding, revision, root: tree.root,
    nodes: tree.nodes.filter(n => !state.hashes.has(n.hash)), additions: sentAdditions
  } : { id: rowId, expectedRevision: snapshot.revision, expectedProof: snapshot.proof,
    data: sentData, additions: sentAdditions };
  const rows = await request("/rest/v1/rpc/" + (parts ? "helmut_auth_state_cas_v1" : "helmut_auth_usage_cas_v1"), {
    method: "POST", body: JSON.stringify(body)
  });
  assertWriteACK(rows, rowId, revision, snapshot, additions, state, tree, parts);
  // An ACK is tied to this private, immutable read snapshot and these objects.
  // Never brand unknown network outcomes or retry them automatically.
  const accepted = attach({ ...sentData, llmUsage: sentHistory }, rows[0].proof, target,
    parts ? rows[0].state : null, tree);
  committed.set(snapshot, { records: recordContents, proof: rows[0].proof, target });
  if (parts && reuseAtStart) {
    // Cache maintenance cannot turn an already confirmed accounting commit
    // into an apparent failed write. Any cache failure keeps the full reader.
    try { rememberHistory(accepted, rows[0].proof, target, rowId); }
    catch { historyCache = null; }
  }
  return accepted;
}
function receipt(record, store) {
  const c = committed.get(store?.[SNAPSHOT]);
  if (!c?.records.has(record)) fail("ATOMIC_USAGE_RECEIPT_UNCONFIRMED");
  const actual = c.records.get(record);
  if (JSON.stringify(record) !== actual.serialized) fail("ATOMIC_USAGE_RECEIPT_CONTENT_CHANGED");
  return makeReceipt(actual, c.proof, c.target);
}
function makeReceipt(actual, proof, target) {
  const result = freeze({ ...actual.value, _ablage: { blob: false, relational: true, relationalAtomic: VERSION } });
  receipts.set(result, { target, generation: proof.generation });
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
module.exports = { VERSION, MARKER, enabled, controlReadEnabled, read, readControl, write, hasSnapshot, receipt, persisted, confirmed,
  readOwnForMutation: options => readOwn(options, true), readBudgetView: options => readOwn(options, false),
  hasOwnRead, discardOwnRead, writeOwn, ownWriteConfirmed };
