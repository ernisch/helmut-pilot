"use strict";

// Inert local experiment: immutable content nodes, never a permission cache.
const { createHash } = require("node:crypto");
const VERSION = "merkle-auth-v1", MARKER = "_authStateRef";
const OMIT = new Set(["llmUsage", "_llmUsageRef", MARKER, "_authStoreRevision"]);
const MAX_DEPTH = 64, MAX_NODES = 20000, MAX_NODE_BYTES = 4 * 1024 * 1024;
const MAX_UNIQUE_BYTES = 32 * 1024 * 1024, MAX_EXPANDED_BYTES = 256 * 1024 * 1024;
const LEAF_BYTES = 16384;
const ARRAY_LEAF_BYTES = 64 * 1024, MAX_LEAF_VISITS = 20000;
// One bounded mathematical fact, not a cached authorization or mutable value.
// Only a successful canonical build can set this private root. Every read still
// hashes all actual payloads and obtains a fresh DB revision/state/usage proof.
let lastCanonicalRoot = null;
// At most ONE reachable immutable graph, never caller-owned auth objects.
// Its byte/node/work bounds are rechecked on every fresh read. Namespace
// changes replace it; it is lost on restart and is never an authority source.
let lastDecodedGraph = null;
// Opaque capabilities for content that already passed the complete decoder.
// Neither hashes nor caller-owned objects can manufacture one. Permission,
// revision and current database state are deliberately absent from this cache.
const verifiedContent = new WeakMap(), MAX_VERIFIED_TEXT_BYTES = 8 * 1024 * 1024;
// One short-lived, one-use mutation witness, never a caller's logical object.
let ownMutation = null;
const OWN_LIFETIME_MS = 30000, OWN_TEXT_BYTES = 4 * 1024 * 1024;
const sha = text => createHash("sha256").update(text, "utf8").digest("hex");
function fail(code) { const e = Error(code); e.code = code; throw e; }
const size = text => Buffer.byteLength(text, "utf8");
function enabled(env = process.env) {
  const mode = env.HELMUT_AUTH_STATE_STORAGE;
  if (!mode || mode === "blob") return false;
  if (mode !== VERSION) fail("AUTH_STATE_MODE_INVALID");
  let u; try { u = new URL(env.SUPABASE_URL); } catch { fail("AUTH_STATE_LOCAL_ONLY"); }
  if (env.HELMUT_LLM_USAGE_STORAGE !== "relational-atomic-v1" || env.VERCEL || u.protocol !== "http:"
    || !(/^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(u.hostname)
      || /^10\.\d+\.\d+\.\d+$/.test(u.hostname) || /^192\.168\.\d+\.\d+$/.test(u.hostname)
      || /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(u.hostname))) fail("AUTH_STATE_LOCAL_ONLY");
  return true;
}
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") return "{" + Object.keys(value).sort()
    .map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  return JSON.stringify(value);
}
function build(input, reuse = null) {
  return buildInternal(input, reuse, false);
}
// The owned paths are lexical/private, never a caller-supplied "already checked"
// flag: captureWrite takes a full snapshot; captureOwnMutation captures own fields.
function buildInternal(input, reuse, owned, retained = null) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) fail("AUTH_STATE_ROOT_INVALID");
  // Remove separately stored controls before transport normalization, so the
  // append-only history is neither serialized nor cloned for state writes.
  const state = Object.fromEntries(Object.keys(input).filter(k => !OMIT.has(k)).map(k => [k, input[k]]));
  let text, data;
  if (retained) data = state; // Private decoded values + separately captured own fields only.
  else {
    try { text = JSON.stringify(state); } catch { fail("AUTH_STATE_JSON_INVALID"); }
    if (typeof text !== "string") fail("AUTH_STATE_ROOT_INVALID");
    if (size(text) > MAX_EXPANDED_BYTES) fail("AUTH_STATE_EXPANDED_LIMIT");
    try { data = owned ? state : JSON.parse(text); } catch { fail("AUTH_STATE_JSON_INVALID"); }
  }
  text = null;
  if (!data || typeof data !== "object" || Array.isArray(data)) fail("AUTH_STATE_ROOT_INVALID");
  for (const key of OMIT) delete data[key];
  const previous = retained ? retained.graph : reuse && lastDecodedGraph?.namespace === reuse.namespace
    && lastDecodedGraph.root === reuse.root ? lastDecodedGraph : null;
  const memo = new WeakMap(), nodes = new Map(), keyHashes = new Map();
  let totalBytes = 0, expandedWork = 0;
  const keyHash = k => { if (!keyHashes.has(k)) keyHashes.set(k, sha(k)); return keyHashes.get(k); };
  function objectInfo(entries) {
    let bytes = 2, depth = 1, visits = 1;
    for (let i = 0; i < entries.length; i++) {
      const [key, value] = entries[i], child = info(value);
      bytes += (i ? 1 : 0) + size(JSON.stringify(key)) + 1 + child.bytes;
      depth = Math.max(depth, 1 + child.depth);visits += child.visits;
      if (bytes > MAX_EXPANDED_BYTES) fail("AUTH_STATE_EXPANDED_LIMIT");
    }
    return { bytes, depth, visits };
  }
  function info(value, depth = 0) {
    if (depth > MAX_DEPTH) fail("AUTH_STATE_DEPTH_LIMIT");
    if (value === null || typeof value !== "object") {
      const compact = JSON.stringify(value), bytes = size(compact);
      if (bytes + 6 > MAX_NODE_BYTES) fail("AUTH_STATE_NODE_LIMIT");
      return { bytes, depth: 0, visits: 1, compact };
    }
    if (memo.has(value)) return memo.get(value);
    const arr = Array.isArray(value), keys = arr ? null : Object.keys(value).sort();
    const count = arr ? value.length : keys.length;
    // Full writes compare actual normalized values. The own path sees only
    // private decoded objects or newly captured own fields, never caller aliases.
    const checked = retained ? retained.byObject.get(value) : previous?.byText.get(JSON.stringify(value));
    if (checked) {
      const result = { bytes: checked.bytes, depth: checked.depth, visits: checked.visits, reuseHash: checked.hash };
      if (arr) result.count = count;
      if (checked.tag === "v" && checked.bytes + 6 <= LEAF_BYTES && checked.visits <= MAX_LEAF_VISITS)
        result.compact = checked.payload.slice(5, -1);
      memo.set(value, result); return result;
    }
    let bytes = 2, logicalDepth = 1, visits = 1, compact = arr ? "[" : "{";
    for (let i = 0; i < count; i++) {
      const child = info(arr ? value[i] : value[keys[i]], depth + 1);
      const prefix = (i ? "," : "") + (arr ? "" : JSON.stringify(keys[i]) + ":");
      bytes += size(prefix) + child.bytes;
      logicalDepth = Math.max(logicalDepth, child.depth + 1);visits += child.visits;
      if (bytes > MAX_EXPANDED_BYTES) fail("AUTH_STATE_EXPANDED_LIMIT");
      if (compact !== null && bytes + 6 <= LEAF_BYTES && child.compact !== undefined)
        compact += prefix + child.compact;
      else compact = null;
    }
    if (logicalDepth > MAX_DEPTH) fail("AUTH_STATE_DEPTH_LIMIT");
    const result = { bytes, depth: logicalDepth, visits };
    // Identical array payloads can first appear as an ordinary compact value
    // and later as a concatenated chunk. Their deduplicated metadata must agree.
    if (arr) result.count = count;
    if (compact !== null && visits <= MAX_LEAF_VISITS) result.compact = compact + (arr ? "]" : "}");
    memo.set(value, result); return result;
  }
  info(data);
  function emit(payload, logical, children = []) {
    if (![logical.bytes, logical.depth].every(n => Number.isSafeInteger(n) && n >= 0)
      || (logical.count !== undefined && (!Number.isSafeInteger(logical.count) || logical.count < 0)))
      fail("AUTH_STATE_METADATA_INVALID");
    const bytes = size(payload);
    if (bytes > MAX_NODE_BYTES) fail("AUTH_STATE_NODE_LIMIT");
    const hash = sha(payload), prior = nodes.get(hash);
    if (prior) {
      if (prior.payload !== payload) fail("AUTH_STATE_HASH_COLLISION");
      return prior;
    }
    const graphDepth = children.reduce((d, child) => Math.max(d, child.graphDepth + 1), 1);
    if (graphDepth > MAX_DEPTH || logical.depth > MAX_DEPTH) fail("AUTH_STATE_DEPTH_LIMIT");
    if (nodes.size + 1 > MAX_NODES) fail("AUTH_STATE_NODES_LIMIT");
    if (totalBytes + bytes > MAX_UNIQUE_BYTES) fail("AUTH_STATE_PAYLOAD_LIMIT");
    if (expandedWork + logical.bytes > MAX_EXPANDED_BYTES) fail("AUTH_STATE_WORK_LIMIT");
    totalBytes += bytes; expandedWork += logical.bytes;
    const result = { hash, payload, graphDepth, ...logical };
    nodes.set(hash, result); return result;
  }
  function valueNode(value) {
    const meta = info(value);
    if (meta.reuseHash) return reuseNode(meta.reuseHash);
    if (meta.compact !== undefined) return emit('["v",' + meta.compact + ']', meta);
    if (Array.isArray(value)) return arrayNode(value);
    return objectNode(Object.keys(value).sort().map(k => [k, value[k]]), 0);
  }
  function reuseNode(hash) {
    if (nodes.has(hash)) return nodes.get(hash);
    const checked = previous.nodes.get(hash);
    if (!checked) fail("AUTH_STATE_REUSE_NODE_MISSING");
    const children = checked.children.map(reuseNode);
    const logical = { bytes: checked.bytes, depth: checked.depth, visits: checked.visits };
    if (Array.isArray(checked.value)) logical.count = checked.value.length;
    // Re-run the same actual-payload SHA, unique-byte, work and graph-depth
    // accounting as a freshly built node. Reuse never removes a global bound.
    return emit(checked.payload, logical, children);
  }
  function objectNode(entries, offset) {
    const meta = objectInfo(entries);
    if (meta.bytes + 6 <= LEAF_BYTES && meta.visits <= MAX_LEAF_VISITS) {
      const compact = "{" + entries.map(([k, value]) => JSON.stringify(k) + ":" + info(value).compact).join(",") + "}";
      return emit('["v",' + compact + ']', meta);
    }
    if (entries.length <= 16) {
      const children = entries.map(([, value]) => valueNode(value));
      return emit(canonical(["o", entries.map(([k], i) => [k, children[i].hash])]), meta, children);
    }
    if (offset >= 64) fail("AUTH_STATE_KEY_HASH_COLLISION");
    const buckets = new Map();
    for (const entry of entries) {
      const bucket = keyHash(entry[0])[offset];
      if (!buckets.has(bucket)) buckets.set(bucket, []);
      buckets.get(bucket).push(entry);
    }
    const names = [...buckets.keys()].sort(), children = names.map(k => objectNode(buckets.get(k), offset + 1));
    return emit(canonical(["m", names.map((k, i) => [k, children[i].hash])]), meta, children);
  }
  function groupFromEnd(items) {
    const groups = [];
    for (let end = items.length; end > 0; end -= 32) groups.push(items.slice(Math.max(0, end - 32), end));
    return groups.reverse();
  }
  function arrayMeta(children, concat) {
    if (!concat) return { bytes: 2 + children.reduce((s, c) => s + c.bytes, 0) + Math.max(0, children.length - 1),
      depth: 1 + children.reduce((d, c) => Math.max(d, c.depth), 0), count: children.length };
    if (children.some(c => !Number.isSafeInteger(c.count) || c.count < 0)) fail("AUTH_STATE_METADATA_INVALID");
    const count = children.reduce((s, c) => s + c.count, 0);
    return { bytes: 2 + children.reduce((s, c) => s + c.bytes - 2 - Math.max(0, c.count - 1), 0)
      + Math.max(0, count - 1), depth: children.reduce((d, c) => Math.max(d, c.depth), 1), count };
  }
  function arrayNode(values) {
    // Choose raw chunks before visiting/emitting item nodes. Stable chunks are
    // stored once, instead of thousands of separately decoded tiny leaves.
    const chunk = group => {
      const meta = info(group);
      if (meta.reuseHash) return reuseNode(meta.reuseHash);
      if (meta.bytes + 6 <= ARRAY_LEAF_BYTES && meta.visits <= MAX_LEAF_VISITS)
        return emit('["v",' + canonical(group) + ']', { ...meta, count: group.length });
      const children = group.map(valueNode);
      return emit(canonical(["a", children.map(c => c.hash)]), arrayMeta(children, false), children);
    };
    if (values.length <= 32) return chunk(values);
    let level = groupFromEnd(values).map(chunk);
    while (level.length > 32) level = groupFromEnd(level).map(group =>
      emit(canonical(["l", group.map(c => c.hash)]), arrayMeta(group, true), group));
    return emit(canonical(["l", level.map(c => c.hash)]), arrayMeta(level, true), level);
  }
  const root = valueNode(data).hash;
  lastCanonicalRoot = root;
  return { root, nodes: [...nodes.values()].map(({ hash, payload }) => ({ hash, payload })), hashes: new Set(nodes.keys()) };
}
function captureWrite(input, additions, reuse = null) {
  // Match Atomic's original capture order before any yield. The resulting
  // values contain only JSON data: no caller aliases, getters or toJSON hooks.
  const data = JSON.parse(JSON.stringify(input));
  const records = JSON.parse(JSON.stringify(additions));
  const tree = buildInternal(data, reuse, true);
  return { data, additions: records, tree };
}
// Read the committed, immutable graph directly. This never accepts a claimed
// hash as evidence: every hash is recalculated from its actual payload bytes.
// All state/permission data is freshly fetched; no mutable value is cached.
function decodeInternal(graph, expectedRoot, namespace, projectionOnly = false) {
  if (!graph || graph.root !== expectedRoot || !/^[a-f0-9]{64}$/.test(expectedRoot)
    || !Array.isArray(graph.nodes) || graph.nodes.length < 1 || graph.nodes.length > MAX_NODES)
    fail("AUTH_STATE_GRAPH_INVALID");
  const map = new Map(), reusable = lastDecodedGraph?.namespace === namespace ? lastDecodedGraph.nodes : null;
  let totalBytes = 0, work = 0;
  const object = x => x !== null && typeof x === "object" && !Array.isArray(x);
  const set = (out, key, value) => Object.defineProperty(out, key, {
    value, enumerable: true, writable: true, configurable: true
  });
  function leafInfo(value, depth = 0) {
    if (depth > MAX_DEPTH) fail("AUTH_STATE_DEPTH_LIMIT");
    let visits = 1, logicalDepth = 0;
    if (value !== null && typeof value === "object") {
      logicalDepth = 1;
      for (const child of Object.values(value)) {
        const next = leafInfo(child, depth + 1);
        visits += next.visits; logicalDepth = Math.max(logicalDepth, next.depth + 1);
        if (visits > MAX_LEAF_VISITS) fail("AUTH_STATE_LEAF_LIMIT");
      }
    }
    return { visits, depth: logicalDepth };
  }
  for (const node of graph.nodes) {
    if (!node || Object.keys(node).sort().join("|") !== "hash|payload"
      || typeof node.payload !== "string" || !/^[a-f0-9]{64}$/.test(node.hash)
      || map.has(node.hash)) fail("AUTH_STATE_GRAPH_NODE_INVALID");
    const bytes = size(node.payload); totalBytes += bytes;
    if (bytes > MAX_NODE_BYTES || totalBytes > MAX_UNIQUE_BYTES) fail("AUTH_STATE_PAYLOAD_LIMIT");
    if (sha(node.payload) !== node.hash) fail("AUTH_STATE_PAYLOAD_HASH_MISMATCH");
    const checked = reusable?.get(node.hash);
    if (checked && checked.payload === node.payload) {
      // A cached parent is usable only with ALL its actual children present in
      // this read, already checked in postorder. No stale/unfetched subtree.
      if (checked.children.some(hash => !map.has(hash))) fail("AUTH_STATE_GRAPH_POSTORDER_INVALID");
      if (work + checked.bytes > MAX_EXPANDED_BYTES) fail("AUTH_STATE_WORK_LIMIT");
      work += checked.bytes; map.set(node.hash, checked); continue;
    }
    let b; try { b = JSON.parse(node.payload); } catch { fail("AUTH_STATE_JSON_INVALID"); }
    if (!Array.isArray(b) || b.length !== 2 || !["v", "o", "m", "a", "l"].includes(b[0]))
      fail("AUTH_STATE_GRAPH_NODE_INVALID");
    const [tag, body] = b;
    let value, meta, graphDepth = 1, children = [];
    if (tag === "v") {
      meta = { ...leafInfo(body), bytes: bytes - 6 };
      if (body !== null && typeof body === "object"
        && bytes > (Array.isArray(body) ? ARRAY_LEAF_BYTES : LEAF_BYTES)) fail("AUTH_STATE_LEAF_LIMIT");
      value = body;
    } else {
      if (!Array.isArray(body) || body.length > (["o", "m"].includes(tag) ? 16 : 32))
        fail("AUTH_STATE_GRAPH_NODE_INVALID");
      const labels = new Set();
      children = body.map(item => {
        let hash = item;
        if (tag === "o" || tag === "m") {
          if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== "string"
            || labels.has(item[0]) || (tag === "m" && !/^[0-9a-f]$/.test(item[0])))
            fail("AUTH_STATE_GRAPH_NODE_INVALID");
          labels.add(item[0]); hash = item[1];
        }
        if (typeof hash !== "string" || !map.has(hash)) fail("AUTH_STATE_GRAPH_POSTORDER_INVALID");
        const child = map.get(hash); graphDepth = Math.max(graphDepth, child.graphDepth + 1);
        return child;
      });
      const flatten = tag === "m" || tag === "l";
      let projected = 2, count = 0, visits = 1, depth = 1;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (flatten) {
          if (tag === "m" ? !object(child.value) : !Array.isArray(child.value))
            fail("AUTH_STATE_GRAPH_CHILD_TYPE");
          const childCount = tag === "m" ? Object.keys(child.value).length : child.value.length;
          projected += child.bytes - 2 - Math.max(0, childCount - 1);
          count += childCount; visits += child.visits - 1;
          depth = Math.max(depth, child.depth);
        } else {
          projected += child.bytes + (tag === "o" ? size(JSON.stringify(body[i][0])) + 1 : 0);
          count++; visits += child.visits; depth = Math.max(depth, child.depth + 1);
        }
      }
      projected += Math.max(0, count - 1);
      meta = { bytes: projected, depth, visits };
      if (![projected, visits, depth].every(Number.isSafeInteger) || projected > MAX_EXPANDED_BYTES
        || depth > MAX_DEPTH || graphDepth > MAX_DEPTH || work + projected > MAX_EXPANDED_BYTES)
        fail("AUTH_STATE_WORK_LIMIT");
      value = tag === "o" || tag === "m" ? {} : [];
      for (let i = 0; i < children.length; i++) {
        if (tag === "o") set(value, body[i][0], children[i].value);
        else if (tag === "m") for (const key of Object.keys(children[i].value)) {
          if (Object.hasOwn(value, key)) fail("AUTH_STATE_GRAPH_DUPLICATE_KEY");
          set(value, key, children[i].value[key]);
        }
        else if (tag === "a") value.push(children[i].value);
        else for (const item of children[i].value) value.push(item);
      }
    }
    if (meta.depth > MAX_DEPTH || graphDepth > MAX_DEPTH || work + meta.bytes > MAX_EXPANDED_BYTES)
      fail("AUTH_STATE_WORK_LIMIT");
    if (canonical(b) !== node.payload) fail("AUTH_STATE_CONTENT_MISMATCH");
    work += meta.bytes;
    map.set(node.hash, { value, ...meta, graphDepth, tag, payload: node.payload,
      children: children.map(c => c.hash), hash: node.hash });
  }
  const root = map.get(expectedRoot);
  if (!root || !object(root.value) || [...OMIT].some(k => Object.hasOwn(root.value, k)))
    fail("AUTH_STATE_ROOT_INVALID");
  const reachable = new Set(), todo = [expectedRoot];
  while (todo.length) {
    const hash = todo.pop(); if (reachable.has(hash)) continue;
    reachable.add(hash); for (const child of map.get(hash).children) todo.push(child);
  }
  if (reachable.size !== map.size) fail("AUTH_STATE_GRAPH_UNREACHABLE");
  // Detach aliases and all internal node objects before exposing mutable auth.
  // Bounds were checked BEFORE constructing this final transport-normal copy.
  // Only a root established by our canonical builder may omit materialization.
  // Cold/external roots retain the entire original decoder/normal-form path.
  const projected = projectionOnly && lastCanonicalRoot === expectedRoot;
  let data;
  if (!projected) {
    const text = JSON.stringify(root.value);
    if (size(text) !== root.bytes) fail("AUTH_STATE_GRAPH_SIZE_MISMATCH");
    data = JSON.parse(text);
  }
  // Unknown roots (including external writes and process restart) retain the
  // former exact build(data).root check. A known root binds the same actual
  // immutable bytes; knowing its normal form conveys no permission or freshness.
  if (lastCanonicalRoot !== expectedRoot && build(data).root !== expectedRoot)
    fail("AUTH_STATE_CONTENT_MISMATCH");
  // Only ordinary value positions (root and o/a children), plus compact leaves,
  // prove a standalone canonical encoding. m/l children may instead be virtual
  // hash buckets/concatenation groups; their layout can depend on that context.
  const eligible = new Set([expectedRoot]), byText = new Map(), byObject = new WeakMap();
  for (const checked of map.values()) {
    if (checked.tag === "v") eligible.add(checked.hash);
    if (checked.tag === "o" || checked.tag === "a") for (const hash of checked.children) eligible.add(hash);
  }
  for (const hash of eligible) {
    const checked = map.get(hash);
    if (checked.value !== null && typeof checked.value === "object") byObject.set(checked.value, checked);
    if (projected && checked.comparisonText === undefined) continue;
    if (checked.comparisonText === undefined) checked.comparisonText = JSON.stringify(checked.value);
    if (size(checked.comparisonText) !== checked.bytes) fail("AUTH_STATE_GRAPH_SIZE_MISMATCH");
    const prior = byText.get(checked.comparisonText);
    if (prior && prior.hash !== hash) fail("AUTH_STATE_CANONICAL_INDEX_MISMATCH");
    byText.set(checked.comparisonText, checked);
  }
  lastDecodedGraph = { namespace, root: expectedRoot, nodes: map, byText, byObject };
  if (projectionOnly) return lastDecodedGraph;
  return { data, root: expectedRoot, hashes: reachable };
}
function decode(graph, expectedRoot, namespace = "") {
  return decodeInternal(graph, expectedRoot, namespace);
}
function projectControl(graph, expectedRoot, namespace) {
  const checked = decodeInternal(graph, expectedRoot, namespace, true), value = checked.nodes.get(expectedRoot).value;
  const keys = ["synthetik500DispatchJournal", "synthetik500KostenAdmission", "testKostenAuftrag", "testKostenTage"];
  // Exactly one selected serialization. No full Auth clone or mutable cache.
  return { text: JSON.stringify(Object.fromEntries(keys.filter(k => Object.hasOwn(value, k)).map(k => [k, value[k]]))),
    order: { version: value.testKostenAuftrag?.version, serviceContractHash: value.testKostenAuftrag?.serviceContractHash } };
}
function ownKeys(operationId) {
  if (typeof operationId !== "string" || !/^localUnitDiagnostic-[a-f0-9]{32}$/.test(operationId))
    fail("AUTH_STATE_OWN_OPERATION_INVALID");
  const prefix = "localUnitDiagnostic:" + operationId.slice(-32) + ":";
  return ["localUnitDiagnosticConsumedGrantsV1", ...["journal", "costs", "reservation", "sendClaim", "review", "result"].map(k => prefix + k)];
}
function ownView(graph, expectedRoot, namespace, operationId, writable) {
  const keys = ownKeys(operationId), checked = decodeInternal(graph, expectedRoot, namespace, true);
  const value = checked.nodes.get(expectedRoot).value;
  if (keys.some(k => !Object.hasOwn(value, k))) fail("AUTH_STATE_OWN_KEYS_MISSING");
  const text = JSON.stringify(Object.fromEntries(keys.map(k => [k, value[k]])));
  if (size(text) > OWN_TEXT_BYTES) fail("AUTH_STATE_OWN_LIMIT");
  const data = JSON.parse(text);
  const order = JSON.parse(JSON.stringify({ version: value.testKostenAuftrag?.version,
    serviceContractHash: value.testKostenAuftrag?.serviceContractHash }));
  let token = null;
  if (writable) {
    token = Object.freeze(Object.create(null));
    ownMutation = { token, graph: checked, keys, expiresAt: Date.now() + OWN_LIFETIME_MS };
  }
  return { data, order, token };
}
function projectOwn(graph, expectedRoot, namespace, operationId) {
  return ownView(graph, expectedRoot, namespace, operationId, false);
}
function openOwnMutation(graph, expectedRoot, namespace, operationId) {
  return ownView(graph, expectedRoot, namespace, operationId, true);
}
function discardOwnMutation(token) { if (ownMutation?.token === token) ownMutation = null; }
function captureOwnMutation(token, next) {
  const witness = ownMutation; ownMutation = null; // Consume before any caller evaluation.
  if (!witness || witness.token !== token || Date.now() > witness.expiresAt) fail("AUTH_STATE_OWN_WITNESS_MISSING");
  const old = witness.graph.nodes.get(witness.graph.root).value;
  if (next === null) return { root: witness.graph.root, nodes: [], hashes: new Set(witness.graph.nodes.keys()) };
  let captured;
  try {
    const text = JSON.stringify(next);
    if (typeof text !== "string") fail("AUTH_STATE_JSON_INVALID");
    if (size(text) > OWN_TEXT_BYTES) fail("AUTH_STATE_OWN_LIMIT");
    captured = JSON.parse(text);
  } catch (error) { if (error?.code) throw error; fail("AUTH_STATE_JSON_INVALID"); }
  if (!captured || Array.isArray(captured) || Object.keys(captured).length !== witness.keys.length
    || witness.keys.some(key => !Object.hasOwn(captured, key)))
    fail("AUTH_STATE_OWN_KEYS_INVALID");
  for (const key of witness.keys) {
    // Actual captured content equality, never a caller identity/hash claim.
    // Unchanged own fields can retain the same private canonical subtree too.
    if (canonical(captured[key]) === canonical(old[key])) captured[key] = old[key];
    else if (key === witness.keys[0]) fail("AUTH_STATE_OWN_GRANTS_CHANGED");
  }
  const state = Object.fromEntries(Object.keys(old).map(k => [k, Object.hasOwn(captured, k) ? captured[k] : old[k]]));
  return buildInternal(state, null, true, { graph: witness.graph, byObject: witness.graph.byObject });
}
function decodeForReuse(graph, expectedRoot, namespace = "") {
  const tree = decode(graph, expectedRoot, namespace);
  // Synchronous capture before another read can replace lastDecodedGraph.
  // This text was checked by decode, including canonical root, exact logical
  // size, all actual payload hashes, reachability and every structural bound.
  if (lastDecodedGraph?.root !== expectedRoot || lastDecodedGraph.namespace !== namespace)
    fail("AUTH_STATE_VERIFIED_CONTENT_MISSING");
  const text = lastDecodedGraph.nodes.get(expectedRoot)?.comparisonText;
  if (typeof text !== "string") fail("AUTH_STATE_VERIFIED_CONTENT_MISSING");
  // The expanded text itself must fit: a small shared DAG can expand greatly.
  if (size(text) > MAX_VERIFIED_TEXT_BYTES) return { ...tree, reuseToken: null };
  const token = Object.freeze(Object.create(null));
  verifiedContent.set(token, { root: expectedRoot, namespace, text, hashes: new Set(tree.hashes) });
  return { ...tree, reuseToken: token };
}
function copyVerifiedContent(token, expectedRoot, namespace = "") {
  const witness = verifiedContent.get(token);
  if (!witness || witness.root !== expectedRoot || witness.namespace !== namespace)
    fail("AUTH_STATE_VERIFIED_CONTENT_MISSING");
  // Only Atomic's freshly native-bound read may choose this path. JSON.parse
  // detaches EVERY logical occurrence, including shared DAG leaves; structured
  // clone would retain aliases. Never expose private text, objects or hash sets.
  return { data: JSON.parse(witness.text), root: expectedRoot,
    hashes: new Set(witness.hashes), reuseToken: token };
}
module.exports = { VERSION, MARKER, MAX_EXPANDED_BYTES, build, captureWrite, decode, decodeForReuse, copyVerifiedContent, enabled, canonical,
  projectOwn, projectControl, openOwnMutation, captureOwnMutation, discardOwnMutation };
