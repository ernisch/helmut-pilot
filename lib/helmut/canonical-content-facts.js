"use strict";

// Private, bounded mathematical facts for the positively qualified synchronous
// C epoch. A fact never represents a validator verdict or an admission. P is
// deliberately the only namespace: B and dictionary insertion order differ.
const crypto = require("node:crypto");
const { crc32 } = require("node:zlib");
const { isProxy } = require("node:util").types;
const epoch = require("./synthetik-500-cpu-epoch");
const byteWriter = require("./canonical-sha-byte-writer");
const MAX_IDENTITIES = 200000, MAX_DIGESTS = 131072;
const MAX_KEYS = 8 * 1024 * 1024, MAX_DIGEST_BYTES = 8 * 1024 * 1024;
const MAX_CHUNKS = 16 * 1024 * 1024, MAX_RETAINED_CHUNKS = 8 * 1024 * 1024, MAX_COMPACT = 16384;
const MAX_RAW = 64 * 1024 * 1024, MAX_HEAP = 128 * 1024 * 1024;
const DIAGNOSTIC_HEAP = 16 * 1024, MAX_CHECKPOINTS = 64;
const MAX_PREFILL_CHUNKS = 64;
const MAX_AGE = 60000, MAX_DEPTH = 80;
const mono = process.hrtime.bigint.bind(process.hrtime);
const fail = Symbol("canonical-content-fact-ineligible");
let retained = null, bindings = null, bindingCount = 0, bindingHeap = 0, active = false;
let operationState = null, operationOwner = null, operationIds = 0, operationKeys = 0, operationHeap = 0;
const stats = { prepares: 0, prepareHits: 0, prepareFailures: 0, begins: 0, beginFailures: 0,
  hashCalls: 0, hashHits: 0, hashMisses: 0, hashFallbacks: 0, jsonFacts: 0, lastFailure: null,
  actualDigestNs: 0, actualDigestPreimageBytes: 0, snapshotSamples: 0, snapshotSampleNs: 0,
  prefillChunks: 0, prefillBytes: 0, prefillNs: 0,
  projectionCalls: 0, projectionHits: 0, projectionCreates: 0, projectionFallbacks: 0,
  indexCalls: 0, indexHits: 0, indexCreates: 0, indexFallbacks: 0,
  compatibleBCalls: 0, compatibleBEligible: 0, compatibleBFallbacks: 0,
  inputCopyCalls: 0, inputCopyBindings: 0, inputCopyFallbacks: 0,
  expandedDigestHits: 0,
  firstBudgetFailure: null, fallbackCounters: Object.create(null), checkpoints: [] };

function fresh(c) { return Number(mono() - c.born) <= MAX_AGE * 1000000; }
function numericSnapshot(c, category) {
  return { ageMs: c ? Number(mono() - c.born) / 1000000 : null,
    calls: stats.hashCalls, hits: stats.hashHits, misses: stats.hashMisses, fallbacks: stats.hashFallbacks,
    keyBytes: c ? c.keyBytes : 0, heapBytes: c ? c.heapBytes + bindingHeap : 0,
    firstFailCategory: category };
}
function failure(category, c) {
  stats.lastFailure = category;
  if (stats.firstBudgetFailure === null && category.endsWith("-cap")) {
    stats.firstBudgetFailure = numericSnapshot(c || retained, category);
  }
}
function requireFact(ok, category = "eligibility", c = null) {
  if (!ok) { failure(category, c); throw fail; }
}
function fallback(category) {
  stats.hashFallbacks++; stats.fallbackCounters[category] = (stats.fallbackCounters[category] || 0) + 1;
  if (category.endsWith("-cap")) failure(category, retained);
}
function finishHash(value) {
  if ((stats.hashCalls & 65535) === 0 && stats.checkpoints.length < MAX_CHECKPOINTS) {
    stats.checkpoints.push(numericSnapshot(retained,
      stats.firstBudgetFailure ? stats.firstBudgetFailure.firstFailCategory : null));
  }
  return value;
}
function identities(c, temporary = 0) {
  requireFact(c.baseIdentities + c.extraIdentities + bindingCount + operationIds + temporary <= MAX_IDENTITIES, "identity-cap", c);
}
function keys(c, bytes) {
  requireFact(Number.isSafeInteger(bytes) && bytes >= 0 && c.keyBytes + bytes <= MAX_KEYS, "key-cap", c);
  c.keyBytes += bytes;
}
function heap(c, bytes) {
  requireFact(Number.isSafeInteger(bytes) && bytes >= 0 && c.heapBytes + bindingHeap + bytes <= MAX_HEAP, "heap-cap", c);
  c.heapBytes += bytes;
}
function reserveRecord(c, identityCount, keyBytes, heapBytes) {
  // Check every reservation before changing any ledger. A rejected record
  // cannot consume an identity, key byte or heap byte without being retained.
  requireFact(c.baseIdentities + c.extraIdentities + bindingCount + operationIds + identityCount
    + (identityCount ? MAX_DEPTH + 1 : 0) <= MAX_IDENTITIES, "identity-cap", c);
  requireFact(Number.isSafeInteger(keyBytes) && keyBytes >= 0
    && c.keyBytes + keyBytes <= MAX_KEYS, "key-cap", c);
  requireFact(Number.isSafeInteger(heapBytes) && heapBytes >= 0
    && c.heapBytes + bindingHeap + heapBytes <= MAX_HEAP, "heap-cap", c);
}
function commitRecord(c, identityCount, keyBytes, heapBytes) {
  c.extraIdentities += identityCount; c.keyBytes += keyBytes; c.heapBytes += heapBytes;
}
function bytesOfText(text) { return Buffer.byteLength(text, "utf8"); }
function scalarType(value) {
  return value === null ? 0 : typeof value === "boolean" ? 1
    : typeof value === "number" ? 2 : typeof value === "string" ? 3 : -1;
}
function scalarFromNode(n) { return n[0] === "n" ? null : n[1]; }
function cmpScalars(a, b) {
  const at = scalarType(a), bt = scalarType(b);
  if (at !== bt) return at - bt;
  return a === b ? 0 : a < b ? -1 : 1;
}
function scalarIndex(c, value) {
  let low = 0, high = c.scalarIndex.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1, id = c.scalarIndex[mid];
    const order = cmpScalars(value, c.records[id].value);
    if (order === 0) return id;
    if (order < 0) high = mid - 1; else low = mid + 1;
  }
  return 0;
}
function scalarRecord(c, value, text, seed, indexKeyBytes = 40) {
  // The scalar's existing dictionary text is reused, not another string pool.
  const size = bytesOfText(text), identityCount = seed ? 0 : 1;
  // New strings use numeric CRC buckets followed by exact value equality;
  // other primitives use their actual small value as the Map key. This charge
  // covers that real index, never an unretained duplicate string-key encoding.
  // Full string values AND JSON texts remain charged in the heap ledger.
  const keyBytes = seed ? 0 : indexKeyBytes;
  const heapBytes = 128 + 32 + text.length * 2
    + (typeof value === "string" ? 32 + value.length * 2 : 8) + (seed ? 0 : 64);
  reserveRecord(c, identityCount, keyBytes, heapBytes);
  const id = c.records.length;
  c.records.push({ type: "s", value, text, size, height: 0, tuple: null, compact: null });
  commitRecord(c, identityCount, keyBytes, heapBytes);
  if (!seed) {
    c.extraTypes[scalarType(value)]++; c.extraScalarKeyBytes += keyBytes;
  }
  return id;
}
function primitive(c, value, temporary) {
  const type = scalarType(value);
  requireFact(type >= 0 && (type !== 2 || Number.isFinite(value)));
  const known = scalarIndex(c, value);
  if (known) return known;
  // Bound a JSON.stringify temporary before constructing it. This is a
  // conservative eligibility limit, never a larger accepted input domain.
  // It also bounds native CRC32's possible UTF8 string-encoding temporary.
  requireFact(type !== 3 || value.length * 12 + 4 <= MAX_CHUNKS - c.chunkBytes - temporary, "temporary-cap", c);
  const index = c.extraScalars[type];
  let found, bucket, code;
  if (type === 3) {
    // CRC equality alone supplies no fact. Distinct UTF16 strings, including
    // lone-surrogate encoding collisions, always require strict equality here.
    code = crc32(value); bucket = index.get(code);
    if (bucket) for (const id of bucket) if (c.records[id].value === value) return id;
  } else {
    found = index.get(value); if (found !== undefined) return found;
  }
  const text = JSON.stringify(value);
  requireFact(typeof text === "string" && text.length * 2 <= MAX_CHUNKS - c.chunkBytes - temporary, "temporary-cap", c);
  // New bucket: numeric key, Map entry, array headers/capacity and first ID.
  // Collision append: charge two numeric slots for conservative growth room.
  // The referenced strings live solely in the fully charged content records.
  const indexKeyBytes = type === 3 ? (bucket ? 16 : 160) : 40;
  found = scalarRecord(c, value, text, false, indexKeyBytes);
  if (type === 3) { if (bucket) bucket.push(found); else index.set(code, [found]); }
  else index.set(value, found);
  return found;
}
function bucketHash(tuple, kind) {
  // This is only a bucket selector. Every candidate is compared word for word.
  let h = Math.imul(2166136261 ^ (kind === "a" ? 1 : 2), 16777619);
  for (let i = 0; i < tuple.length; i++) h = Math.imul(h ^ tuple[i], 16777619);
  return h >>> 0;
}
function equalTuple(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function tupleToken(c, tuple, kind, seed, temporary = 0) {
  requireFact(tuple.byteLength <= MAX_CHUNKS - c.chunkBytes - temporary, "temporary-cap", c);
  const code = bucketHash(tuple, kind), bucket = c.buckets.get(code);
  if (bucket) for (const id of bucket) {
    if (kind === c.records[id].type && equalTuple(tuple, c.records[id].tuple)) return id;
  }
  let size = 2 + Math.max(0, tuple.length / (kind === "a" ? 1 : 2) - 1), height = 0, samePB = true;
  if (kind === "a") {
    for (let i = 0; i < tuple.length; i++) {
      const child = c.records[tuple[i]]; size += child.size; height = Math.max(height, child.height + 1);
      if (child.type !== "s" && child.samePB !== true) samePB = false;
    }
  } else {
    let nonIndexSeen = false, previousIndex = -1;
    for (let i = 0; i < tuple.length; i += 2) {
      const key = c.records[tuple[i]], child = c.records[tuple[i + 1]];
      requireFact(key.type === "s" && typeof key.value === "string");
      size += key.size + 1 + child.size; height = Math.max(height, child.height + 1);
      if (child.type !== "s" && child.samePB !== true) samePB = false;
      const number = Number(key.value);
      const isIndex = Number.isSafeInteger(number) && number >= 0 && number < 4294967295
        && String(number) === key.value;
      // P writes every key lexically. B creates an object and JSON enumerates
      // canonical uint32 array indices first in numeric order, then the other
      // keys in their already lexical insertion order. Test the whole sequence.
      if (isIndex) {
        if (nonIndexSeen || number <= previousIndex) samePB = false;
        previousIndex = number;
      } else nonIndexSeen = true;
    }
  }
  requireFact(Number.isSafeInteger(size) && height <= MAX_DEPTH);
  const identityCount = seed ? 0 : 1, keyBytes = tuple.byteLength, heapBytes = 160 + 16 + (bucket ? 8 : 96);
  reserveRecord(c, identityCount, keyBytes, heapBytes);
  const id = c.records.length;
  c.records.push({ type: kind, tuple, size, height, compact: null, samePB });
  if (bucket) bucket.push(id); else c.buckets.set(code, [id]);
  commitRecord(c, identityCount, keyBytes, heapBytes);
  if (!seed) { c.extraTypes[kind === "a" ? 4 : 5]++; c.extraTupleKeyBytes += keyBytes; }
  return id;
}
function payloadHeap(payload, checked) {
  // Construction owns the already-checked private codec metadata. Charge it
  // while live, then consume each node as compact canonical records replace it.
  // The original decoded graph and the raw bytes are never modified.
  let bytes = 128 + payload.nodes.length * 24;
  const charges = new Uint32Array(payload.nodes.length);
  for (let i = 0; i < payload.nodes.length; i++) {
    const n = payload.nodes[i]; let charge = 64 + n.length * 8;
    if (n[0] === "s") charge += 32 + n[1].length * 2;
    if (n[0] === "a" || n[0] === "o") {
      charge += 64 + n[1].length * 8;
      if (n[0] === "o") charge += n[1].length * 80;
    }
    if (checked.scalar[i] !== undefined) charge += 32 + checked.scalar[i].length * 2;
    charges[i] = charge; bytes += charge;
    requireFact(bytes <= MAX_HEAP, "parsed-heap-cap");
  }
  requireFact(bytes + charges.byteLength <= MAX_HEAP, "parsed-heap-cap");
  return { bytes: bytes + charges.byteLength, charges };
}
function createContext(context) {
  const { payload, raw, checked } = context;
  requireFact(Buffer.isBuffer(raw) && raw.length > 0 && raw.length <= MAX_RAW
    && payload && Array.isArray(payload.nodes) && payload.nodes.length > 0
    && payload.nodes.length <= MAX_IDENTITIES && payload.root === payload.nodes.length - 1
    && checked && checked.scalar && checked.sizes);
  let { bytes: builderHeap, charges } = payloadHeap(payload, checked);
  const nodes = payload.nodes, count = nodes.length, root = payload.root;
  const originalExpanded = typeof context.expandedHash === "string" && /^[a-f0-9]{64}$/.test(context.expandedHash)
    ? context.expandedHash : null;
  const c = { born: mono(), raw, rootToken: 0, expandedHash: originalExpanded,
    baseIdentities: payload.nodes.length, extraIdentities: 0, keyBytes: 0,
    heapBytes: builderHeap, chunkBytes: 0, digestBytes: originalExpanded === null ? 0 : 160,
    records: [null], buckets: new Map(), digests: new Map(),
    scalarIndex: null,
    extraTypes: [0, 0, 0, 0, 0, 0], extraScalarKeyBytes: 0, extraTupleKeyBytes: 0,
    extraScalars: [new Map(), new Map(), new Map(), new Map()] };
  // Context object, empty collection headers, record-array header and the
  // scalar-index view header are retained even when no facts have been added.
  heap(c, 1024 + DIAGNOSTIC_HEAP);
  let nodeTokens = new Uint32Array(count);
  keys(c, nodeTokens.byteLength);
  function consume(id) {
    const n = nodes[id];
    if (n && (n[0] === "a" || n[0] === "o")) n[1].length = 0;
    if (n) n.length = 0;
    nodes[id] = null; checked.scalar[id] = undefined; checked.sizes[id] = undefined;
    c.heapBytes -= charges[id]; charges[id] = 0;
  }
  try {
    let scalarCount = 0;
    for (const n of nodes) if (n[0] !== "a" && n[0] !== "o") scalarCount++;
    c.scalarIndex = new Uint32Array(scalarCount); keys(c, c.scalarIndex.byteLength);
    let nextScalar = 0;
    for (let i = 0; i < count; i++) if (nodes[i][0] !== "a" && nodes[i][0] !== "o") c.scalarIndex[nextScalar++] = i;
    c.scalarIndex.sort((a, b) => cmpScalars(scalarFromNode(nodes[a]), scalarFromNode(nodes[b])));
    let previous, previousToken = 0;
    for (let i = 0; i < c.scalarIndex.length; i++) {
      const id = c.scalarIndex[i], value = scalarFromNode(nodes[id]), text = checked.scalar[id];
      // Preserve value/text by transfer to the fact record; their source node
      // arrays and checked slots are removed before any new retained record.
      consume(id);
      if (i === 0 || cmpScalars(previous, value) !== 0) previousToken = scalarRecord(c, value, text, true);
      nodeTokens[id] = previousToken; c.scalarIndex[i] = previousToken; previous = value;
    }
    for (let i = 0; i < count; i++) {
      const n = nodes[i]; if (n === null) continue;
      const kind = n[0], object = kind === "o", refs = n[1];
      requireFact(refs.length * (object ? 2 : 1) * 4 <= MAX_CHUNKS);
      let tuple;
      if (!object) {
        tuple = new Uint32Array(refs.length);
        for (let j = 0; j < refs.length; j++) tuple[j] = nodeTokens[refs[j]];
      } else {
        // Canonical P is lexical, independently of original JSON key order.
        const order = refs.slice().sort((a, b) => {
          const av = c.records[nodeTokens[a[0]]].value, bv = c.records[nodeTokens[b[0]]].value;
          return av === bv ? 0 : av < bv ? -1 : 1;
        });
        requireFact(order.length * 8 + refs.length * 2 * 4 <= MAX_CHUNKS);
        tuple = new Uint32Array(refs.length * 2);
        for (let j = 0; j < order.length; j++) {
          tuple[j * 2] = nodeTokens[order[j][0]];
          tuple[1 + j * 2] = nodeTokens[order[j][1]];
        }
        order.length = 0;
      }
      consume(i);
      nodeTokens[i] = tupleToken(c, tuple, kind, true);
    }
    c.rootToken = nodeTokens[root];
    heap(c, 128);
    c.commandRootToken = Number.isSafeInteger(context.commandRef) && context.commandRef >= 0 && context.commandRef < count
      ? nodeTokens[context.commandRef] : null;
    c.context = { raw, rootToken: c.rootToken, commandRootToken: c.commandRootToken };
    // No node-ID table, parsed dictionary or checked arrays survive creation.
    c.keyBytes -= nodeTokens.byteLength;
    c.heapBytes -= 128 + count * 24 + charges.byteLength;
    nodes.length = 0; checked.scalar.length = 0; checked.sizes.length = 0;
    nodeTokens = null; charges = null;
    requireFact(fresh(c));
    prefillOwnedChunks(c);
    requireFact(fresh(c)); return c;
  } finally {
    // These private arrays have no remaining codec consumer: prepare is called
    // only after the original checks and complete fresh-graph reconstruction.
    nodes.length = 0; checked.scalar.length = 0; checked.sizes.length = 0;
  }
}
function prepare(context) {
  if (!epoch.isActive()) return null;
  stats.prepares++;
  try {
    requireFact(context && Buffer.isBuffer(context.raw));
    if (retained && !fresh(retained)) retained = null;
    if (retained) { requireFact(retained.raw.equals(context.raw), "different-live-context"); stats.prepareHits++; }
    else retained = createContext(context);
    // All equal fresh decodes share one compact source-owned fact context.
    // Their independently reconstructed object graphs are never stored here.
    if (context !== retained.context && context.payload && context.checked) {
      context.payload.nodes.length = 0; context.checked.scalar.length = 0; context.checked.sizes.length = 0;
    }
    return retained.context;
  } catch (error) { if (error === fail) { stats.prepareFailures++; return null; } throw error; }
}
function begin(root, context) {
  // Public imports cannot seed forged facts: the guard's closed private lease
  // is established before this observer runs, with no foreign JS reentry.
  if (!epoch.isActive()) return false;
  stats.begins++;
  end();
  try {
    requireFact(root && typeof root === "object" && context && Buffer.isBuffer(context.raw));
    // Expiration evicts the complete old fact set. A new context has no digest
    // facts and must perform real SHA work again. Equal live decodes and hits
    // never refresh age, refill quotas, or create a second retained context.
    if (retained && !fresh(retained)) retained = null;
    requireFact(retained && retained.raw.equals(context.raw), "missing-live-compact-context");
    const c = retained, bound = new WeakMap(), visiting = new WeakSet();
    function bind(value, token, depth) {
      requireFact(depth <= MAX_DEPTH);
      const record = c.records[token];
      if (record.type === "s") {
        requireFact(scalarType(value) === scalarType(record.value) && value === record.value); return;
      }
      requireFact(value && typeof value === "object" && !isProxy(value) && Object.isFrozen(value));
      const existing = bound.get(value);
      if (existing !== undefined) { requireFact(existing === token); return; }
      requireFact(!visiting.has(value)); visiting.add(value);
      identities(c, 1); requireFact(c.heapBytes + bindingHeap + 64 <= MAX_HEAP);
      bound.set(value, token); bindingCount++; bindingHeap += 64;
      // Only the original codec calls the private owner certificate. The shape
      // mapping is still verified; no foreign object is branded as immutable.
      const desc = Object.getOwnPropertyDescriptors(value), ownKeys = Object.keys(value);
      requireFact(Object.getOwnPropertySymbols(value).length === 0 && !Object.hasOwn(value, "toJSON"));
      const tuple = record.tuple;
      if (record.type === "a") {
        requireFact(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype
          && value.length === tuple.length && ownKeys.length === tuple.length);
        for (let j = 0; j < tuple.length; j++) {
          requireFact(ownKeys[j] === String(j) && Object.hasOwn(desc[j], "value"));
          bind(desc[j].value, tuple[j], depth + 1);
        }
      } else {
        requireFact(!Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))
          && ownKeys.length === tuple.length / 2);
        ownKeys.sort();
        for (let j = 0; j < ownKeys.length; j++) {
          const key = c.records[tuple[j * 2]].value;
          requireFact(ownKeys[j] === key && Object.hasOwn(desc[key], "value"));
          bind(desc[key].value, tuple[1 + j * 2], depth + 1);
        }
      }
      visiting.delete(value);
    }
    requireFact(context.rootToken === c.rootToken || c.commandRootToken !== null && context.rootToken === c.commandRootToken);
    bind(root, context.rootToken, 0); requireFact(fresh(c));
    bindings = bound; active = true; return true;
  } catch (error) {
    bindings = null; bindingCount = 0; bindingHeap = 0;
    if (error === fail) { stats.beginFailures++; return false; }
    throw error;
  }
}
function end() {
  // Operation caches never survive the C invocation. Subtract their exact
  // charged reservations once; a repeated end has no owner and changes none.
  if (operationOwner !== null) {
    operationOwner.keyBytes -= operationKeys; operationOwner.heapBytes -= operationHeap;
  }
  operationState = null; operationOwner = null;
  operationIds = 0; operationKeys = 0; operationHeap = 0;
  active = false; bindings = null; bindingCount = 0; bindingHeap = 0;
}
function available() { return active && bindings !== null && retained !== null && epoch.isActive() && fresh(retained); }
function unavailableReason() {
  if (!active) return "facts-inactive";
  if (bindings === null) return "missing-bindings";
  if (retained === null) return "missing-context";
  if (!epoch.isActive()) return "epoch-inactive";
  return "age-cap";
}
function snapshot(c, value) {
  const visiting = new WeakSet();
  let temporary = 0;
  function walk(v, depth) {
    requireFact(depth <= MAX_DEPTH);
    requireFact(fresh(c), "age-cap", c);
    if (v === null || typeof v !== "object") return primitive(c, v, temporary);
    requireFact(!isProxy(v));
    const owned = bindings.get(v); if (owned !== undefined) return owned;
    requireFact(!visiting.has(v)); identities(c, depth + 1);
    const array = Array.isArray(v), proto = Object.getPrototypeOf(v);
    requireFact(array ? proto === Array.prototype : proto === Object.prototype || proto === null);
    requireFact(!Object.hasOwn(v, "toJSON") && Object.getOwnPropertySymbols(v).length === 0);
    const descriptors = Object.getOwnPropertyDescriptors(v), own = Object.keys(v);
    const descriptorCount = Reflect.ownKeys(descriptors).length;
    // Descendant results become content facts; mutable object identities are
    // never retained. Temporary descriptors/keys/tuple words share one cap.
    const charge = 128 + descriptorCount * 160 + own.length * 16 + own.length * (array ? 1 : 2) * 4;
    requireFact(charge + temporary <= MAX_CHUNKS - c.chunkBytes, "temporary-cap", c); temporary += charge;
    if (array) requireFact(own.length === v.length && own.every((key, i) => key === String(i)));
    else own.sort();
    const tuple = new Uint32Array(own.length * (array ? 1 : 2));
    visiting.add(v);
    for (let i = 0; i < own.length; i++) {
      const key = own[i], descriptor = descriptors[key]; requireFact(Object.hasOwn(descriptor, "value"));
      if (array) tuple[i] = walk(descriptor.value, depth + 1);
      else {
        tuple[i * 2] = primitive(c, key, temporary);
        tuple[1 + i * 2] = walk(descriptor.value, depth + 1);
      }
    }
    visiting.delete(v); temporary -= charge;
    return tupleToken(c, tuple, array ? "a" : "o", false, temporary);
  }
  return walk(value, 0);
}
function prefillOwnedChunks(c) {
  const started = mono();
  try {
    const count = c.records.length;
    if (!Number.isSafeInteger(count) || count <= 1 || count - 1 > MAX_IDENTITIES
      || !Number.isSafeInteger(c.rootToken) || c.rootToken <= 0 || c.rootToken >= count) return;
    // Exact scratch reservation: one Float64 occurrence count per record,
    // 64 candidate IDs and scores, typed-array/closure headers and at most
    // MAX_DEPTH+1 existing writer frames. No expanded graph or candidate list.
    const scratchBuffers = count * 8 + MAX_PREFILL_CHUNKS * 12;
    const scratchHeap = 1024 + (MAX_DEPTH + 1) * 256;
    const scratchBytes = scratchBuffers + scratchHeap;
    if (scratchBytes + c.chunkBytes > MAX_CHUNKS
      || c.heapBytes + bindingHeap + scratchHeap > MAX_HEAP) return;
    // Scalars are created first. Each canonical container is appended only
    // after all children exist; deduplication can only reuse an earlier token.
    // Verify this complete DAG property before changing ANY compact record.
    for (let id = 1; id < count; id++) {
      const record = c.records[id];
      if (!record || !Number.isSafeInteger(record.size) || record.size < 0) return;
      if (record.type === "s") continue;
      if ((record.type !== "a" && record.type !== "o") || !(record.tuple instanceof Uint32Array)) return;
      for (const child of record.tuple) if (!Number.isSafeInteger(child) || child <= 0 || child >= id) return;
    }
    const occurrences = new Float64Array(count), candidates = new Uint32Array(MAX_PREFILL_CHUNKS);
    const scores = new Float64Array(MAX_PREFILL_CHUNKS);
    occurrences[c.rootToken] = 1;
    for (let id = count - 1; id > 0; id--) {
      const weight = occurrences[id], record = c.records[id];
      if (weight === 0 || record.type === "s") continue;
      for (const child of record.tuple) {
        const total = occurrences[child] + weight;
        if (!Number.isSafeInteger(total)) return;
        occurrences[child] = total;
      }
    }
    let selected = 0;
    for (let id = 1; id < count; id++) {
      const record = c.records[id], weight = occurrences[id];
      if (record.type === "s" || record.size < MAX_COMPACT || record.size > MAX_RETAINED_CHUNKS || weight <= 1) continue;
      const score = (weight - 1) * record.size;
      if (!Number.isSafeInteger(score) || (selected === MAX_PREFILL_CHUNKS && score <= scores[selected - 1])) continue;
      let at = selected < MAX_PREFILL_CHUNKS ? selected++ : MAX_PREFILL_CHUNKS - 1;
      while (at > 0 && score > scores[at - 1]) {
        candidates[at] = candidates[at - 1]; scores[at] = scores[at - 1]; at--;
      }
      candidates[at] = id; scores[at] = score;
    }
    // A retained chunk is exactly the original canonical P preimage of that
    // token, filled by the same writer as a normal small chunk. Occurrences
    // affect selection only. SHA still consumes every complete preimage.
    for (let i = 0; i < selected && fresh(c); i++) {
      const id = candidates[i], size = c.records[id].size;
      if (c.records[id].compact || size + c.chunkBytes > MAX_RETAINED_CHUNKS) continue;
      const buffer = compact(c, id, true, scratchBytes, scratchHeap);
      if (buffer) { stats.prefillChunks++; stats.prefillBytes += buffer.length; }
    }
  } finally { stats.prefillNs += Number(mono() - started); }
}
function compact(c, id, forceLarge = false, temporaryBytes = 0, temporaryHeap = 0) {
  const record = c.records[id];
  if (record.compact) return record.compact;
  const bufferHeap = forceLarge ? 128 : 0;
  if ((!forceLarge && record.size > MAX_COMPACT) || record.size + c.chunkBytes > MAX_RETAINED_CHUNKS
    || record.size + c.chunkBytes + temporaryBytes > MAX_CHUNKS
    || c.heapBytes + bindingHeap + temporaryHeap + bufferHeap > MAX_HEAP) return null;
  // One exact-size buffer, filled in place: no second assembled chunk copy.
  const buffer = Buffer.allocUnsafe(record.size); let offset = 0;
  function fill(token) {
    const r = c.records[token];
    if (r.compact) { offset += r.compact.copy(buffer, offset); return; }
    if (r.type === "s") { offset += buffer.write(r.text, offset, "utf8"); return; }
    const object = r.type === "o", tuple = r.tuple;
    buffer[offset++] = object ? 123 : 91;
    for (let i = 0; i < tuple.length; i += object ? 2 : 1) {
      if (i > 0) buffer[offset++] = 44;
      fill(tuple[i]);
      if (object) { buffer[offset++] = 58; fill(tuple[i + 1]); }
    }
    buffer[offset++] = object ? 125 : 93;
  }
  fill(id); requireFact(offset === buffer.length);
  record.compact = buffer; c.chunkBytes += buffer.length; c.heapBytes += bufferHeap; return buffer;
}
function actualDigest(c, id) {
  const digest = crypto.createHash("sha256");
  // This temporary buffer exists only during a large synchronous digest. No
  // snapshot temporary remains live here, and it shares the unchanged16MiB cap.
  const buffered = c.records[id].size >= 65536 && c.chunkBytes + byteWriter.BLOCK_BYTES <= MAX_CHUNKS
    ? byteWriter.create(digest) : null;
  const write = buffered ? buffered.write : value => digest.update(value);
  function emit(token) {
    const r = c.records[token], small = compact(c, token);
    if (small) { write(small); return; }
    if (r.type === "s") { write(r.text); return; }
    const object = r.type === "o", tuple = r.tuple;
    write(object ? "{" : "[");
    for (let i = 0; i < tuple.length; i += object ? 2 : 1) {
      if (i > 0) write(","); emit(tuple[i]);
      if (object) { write(":"); emit(tuple[i + 1]); }
    }
    write(object ? "}" : "]");
  }
  emit(id); return buffered ? buffered.finish() : digest.digest("hex");
}
function hash(value, computeOriginal) {
  stats.hashCalls++;
  if (!available()) { fallback(unavailableReason()); return finishHash(null); }
  const c = retained; let token;
  try {
    if ((stats.hashCalls & 1023) === 0) {
      const start = mono();
      try { token = snapshot(c, value); }
      finally { stats.snapshotSamples++; stats.snapshotSampleNs += Number(mono() - start); }
    } else token = snapshot(c, value);
    const existing = c.digests.get(token);
    if (existing !== undefined) { stats.hashHits++; return finishHash(existing); }
    // Digest keys/values are actual UTF16 strings/numbers, charged separately.
    requireFact(c.digests.size + (c.expandedHash === null ? 0 : 1) < MAX_DIGESTS
      && c.digestBytes + 160 <= MAX_DIGEST_BYTES, "digest-cap");
    requireFact(fresh(c), "age-cap");
  } catch (error) { if (error === fail) { fallback(stats.lastFailure || "eligibility"); return finishHash(null); } throw error; }
  // Actual complete canonical P bytes, never SHA(child SHA...). No user
  // callback is executed. Failures from actual crypto propagate unchanged.
  const digestStarted = mono(), result = actualDigest(c, token);
  stats.actualDigestNs += Number(mono() - digestStarted);
  stats.actualDigestPreimageBytes += c.records[token].size;
  stats.hashMisses++;
  if (fresh(c)) { c.digests.set(token, result); c.digestBytes += 160; }
  return finishHash(result);
}
function compatibleBHash(value) {
  stats.compatibleBCalls++;
  if (!available()) { stats.compatibleBFallbacks++; return null; }
  const token = bindings.get(value), record = token === undefined ? null : retained.records[token];
  if (!record || record.type === "s" || record.samePB !== true) {
    stats.compatibleBFallbacks++; return null;
  }
  // The token proof establishes complete preimage byte identity, rather than
  // assuming interchangeable namespaces. Use the same genuine full SHA fact;
  // neither child digests nor insertion-order/envelope digests are consulted.
  stats.compatibleBEligible++;
  const result = hash(value);
  if (result === null) stats.compatibleBFallbacks++;
  return result;
}
// Only E's kern.eingaben and K's payload.inputs use this operation in the
// source-closed C graph. Both original eager JSON copies remain mutable and
// fresh; neither root is modified or exposed before C's finally ends the
// binding. This is a temporary content correspondence, never a general claim
// that an arbitrary mutable object has immutable contents.
function copyInputForHash(value) {
  stats.inputCopyCalls++;
  const token = available() && value && typeof value === "object" && !isProxy(value)
    && Object.isFrozen(value) ? bindings.get(value) : undefined;
  const result = JSON.parse(JSON.stringify(value));
  if (token === undefined || !available()) { stats.inputCopyFallbacks++; return result; }
  try {
    const c = retained;
    identities(c, 1);
    requireFact(c.heapBytes + bindingHeap + 64 <= MAX_HEAP, "heap-cap", c);
    requireFact(fresh(c), "age-cap", c);
    bindings.set(result, token); bindingCount++; bindingHeap += 64;
    stats.inputCopyBindings++;
  } catch (error) {
    if (error !== fail) throw error;
    stats.inputCopyFallbacks++;
  }
  return result;
}
function fieldPosition(c, record, name) {
  if (!record || record.type !== "o") return -1;
  let low = 0, high = record.tuple.length / 2 - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1, at = mid * 2, current = c.records[record.tuple[at]].value;
    if (current === name) return at;
    if (current < name) low = mid + 1; else high = mid - 1;
  }
  return -1;
}
function reserveOperation(c, ids, keyBytes, heapBytes, newBindings, temporaryBytes, temporaryIds) {
  requireFact(operationOwner === null || operationOwner === c);
  const initial = operationState === null;
  const plan = { ids: ids + (initial ? 5 : 0), keyBytes,
    heapBytes: heapBytes + (initial ? 768 : 0) };
  // Initial identities cover the state object, three WeakMaps and the frozen
  // empty index. Collection entries and index-vector slots are charged below.
  requireFact(c.baseIdentities + c.extraIdentities + bindingCount + operationIds
    + plan.ids + newBindings + temporaryIds <= MAX_IDENTITIES, "identity-cap", c);
  requireFact(Number.isSafeInteger(keyBytes) && keyBytes >= 0
    && c.keyBytes + keyBytes <= MAX_KEYS, "key-cap", c);
  requireFact(Number.isSafeInteger(plan.heapBytes) && plan.heapBytes >= 0
    && c.heapBytes + bindingHeap + plan.heapBytes + newBindings * 64 + temporaryBytes <= MAX_HEAP, "heap-cap", c);
  requireFact(temporaryBytes + c.chunkBytes <= MAX_CHUNKS, "temporary-cap", c);
  requireFact(fresh(c), "age-cap", c);
  return plan;
}
function commitOperation(c, plan) {
  if (operationState === null) {
    operationState = { projections: new WeakMap(), selectors: new WeakMap(), indices: new WeakMap(), empty: Object.freeze([]) };
    operationOwner = c;
  }
  operationIds += plan.ids; operationKeys += plan.keyBytes; operationHeap += plan.heapBytes;
  c.keyBytes += plan.keyBytes; c.heapBytes += plan.heapBytes;
}
function selectorToken(c, selectedKeys) {
  const cached = operationState?.selectors.get(selectedKeys);
  if (cached !== undefined) return cached;
  requireFact(selectedKeys && typeof selectedKeys === "object" && !isProxy(selectedKeys)
    && Array.isArray(selectedKeys) && Object.getPrototypeOf(selectedKeys) === Array.prototype
    && Object.isFrozen(selectedKeys) && selectedKeys.length <= 10000);
  const count = selectedKeys.length, temporaryBytes = 1536 + count * 768;
  requireFact(temporaryBytes + c.chunkBytes <= MAX_CHUNKS, "temporary-cap", c);
  requireFact(c.heapBytes + bindingHeap + temporaryBytes <= MAX_HEAP, "heap-cap", c);
  identities(c, count + 8);
  requireFact(!Object.hasOwn(selectedKeys, "toJSON") && Object.getOwnPropertySymbols(selectedKeys).length === 0);
  const descriptors = Object.getOwnPropertyDescriptors(selectedKeys), names = Object.keys(selectedKeys), seen = new Set();
  requireFact(names.length === count && Reflect.ownKeys(descriptors).length === count + 1);
  for (let i = 0; i < count; i++) {
    const descriptor = descriptors[i];
    requireFact(names[i] === String(i) && Object.hasOwn(descriptor, "value")
      && typeof descriptor.value === "string" && !seen.has(descriptor.value));
    seen.add(descriptor.value);
  }
  return snapshot(c, selectedKeys);
}
function memoSelector(c, selectedKeys, token) {
  if (operationState?.selectors.get(selectedKeys) !== undefined) return;
  try {
    const plan = reserveOperation(c, 1, 48, 96, 0, 128, 2);
    commitOperation(c, plan); operationState.selectors.set(selectedKeys, token);
  } catch (error) {
    // Memo allocation is optional: a fully verified selector can still use an
    // already existing projection without retaining any additional metadata.
    if (error !== fail) throw error;
  }
}
function projectedValue(current, selectedKeys) {
  stats.projectionCalls++;
  try {
    requireFact(available());
    const c = retained;
    requireFact(current && typeof current === "object" && !isProxy(current));
    const currentToken = bindings.get(current), source = currentToken === undefined ? null : c.records[currentToken];
    requireFact(source && source.type === "o");
    const keysToken = selectorToken(c, selectedKeys), keysRecord = c.records[keysToken];
    requireFact(keysRecord && keysRecord.type === "a");
    let cached = operationState?.projections.get(current);
    if (cached?.has(keysToken)) {
      memoSelector(c, selectedKeys, keysToken);
      requireFact(fresh(c), "age-cap", c); stats.projectionHits++; return cached.get(keysToken);
    }
    const count = keysRecord.tuple.length, temporaryBytes = 1024 + count * 384;
    requireFact(temporaryBytes + c.chunkBytes <= MAX_CHUNKS, "temporary-cap", c);
    requireFact(c.heapBytes + bindingHeap + temporaryBytes + 512 <= MAX_HEAP, "heap-cap", c);
    identities(c, count + 8);
    const positions = new Uint32Array(count), values = new Array(count), tuple = new Uint32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const nameRecord = c.records[keysRecord.tuple[i]];
      requireFact(nameRecord.type === "s" && typeof nameRecord.value === "string");
      const at = fieldPosition(c, source, nameRecord.value); requireFact(at >= 0);
      const childToken = source.tuple[at + 1], child = c.records[childToken];
      const descriptor = Object.getOwnPropertyDescriptor(current, nameRecord.value);
      requireFact(descriptor && Object.hasOwn(descriptor, "value"));
      requireFact(child.type === "s" ? descriptor.value === child.value
        : descriptor.value && typeof descriptor.value === "object" && bindings.get(descriptor.value) === childToken);
      positions[i] = at; values[i] = descriptor.value;
    }
    // Build the canonical subset in P's lexical key order, independently of
    // the original selector order used for the returned object's construction.
    positions.sort();
    for (let i = 0; i < count; i++) {
      tuple[i * 2] = source.tuple[positions[i]]; tuple[1 + i * 2] = source.tuple[positions[i] + 1];
    }
    const subsetToken = tupleToken(c, tuple, "o", false, temporaryBytes);
    const newSelector = operationState?.selectors.get(selectedKeys) === undefined;
    const newCurrent = cached === undefined;
    const plan = reserveOperation(c,
      1 + (newSelector ? 1 : 0) + (newCurrent ? 2 : 0),
      64 + (newSelector ? 48 : 0) + (newCurrent ? 80 : 0),
      128 + count * 64 + 128 + (newSelector ? 96 : 0) + (newCurrent ? 192 : 0),
      1, temporaryBytes, count + 8);
    const result = {};
    for (let i = 0; i < count; i++) Object.defineProperty(result, c.records[keysRecord.tuple[i]].value,
      { value: values[i], enumerable: true });
    Object.freeze(result);
    requireFact(fresh(c), "age-cap", c);
    if (cached === undefined) cached = new Map();
    commitOperation(c, plan);
    cached.set(keysToken, result); operationState.projections.set(current, cached);
    if (newSelector) operationState.selectors.set(selectedKeys, keysToken);
    bindings.set(result, subsetToken); bindingCount++; bindingHeap += 64;
    stats.projectionCreates++; return result;
  } catch (error) {
    if (error === fail) { stats.projectionFallbacks++; return null; }
    throw error;
  }
}
function fieldIndices(array, field, key) {
  stats.indexCalls++;
  try {
    requireFact(available());
    const c = retained;
    requireFact(array && typeof array === "object" && !isProxy(array)
      && typeof field === "string" && typeof key === "string");
    const arrayToken = bindings.get(array), source = arrayToken === undefined ? null : c.records[arrayToken];
    requireFact(source && source.type === "a" && source.tuple.length <= 10000);
    const fieldToken = scalarIndex(c, field); requireFact(fieldToken !== 0);
    // Resolve the query before reserving/committing the optional index. Zero
    // means the string is absent from the original dictionary, hence no row.
    const keyToken = scalarIndex(c, key);
    let fields = operationState?.indices.get(array), index = fields?.get(fieldToken);
    if (index !== undefined) {
      requireFact(fresh(c), "age-cap", c); stats.indexHits++;
      return index.get(keyToken) || operationState.empty;
    }
    const count = source.tuple.length, temporaryBytes = 1024 + count * 144;
    requireFact(temporaryBytes + c.chunkBytes <= MAX_CHUNKS, "temporary-cap", c);
    requireFact(c.heapBytes + bindingHeap + temporaryBytes <= MAX_HEAP, "heap-cap", c);
    identities(c, count * 2 + 8);
    const rowFields = new Uint32Array(count), counts = new Map();
    for (let i = 0; i < count; i++) {
      const rowToken = source.tuple[i], row = array[i], record = c.records[rowToken];
      requireFact(row && typeof row === "object" && bindings.get(row) === rowToken && record.type === "o");
      const at = fieldPosition(c, record, field); requireFact(at >= 0);
      const valueToken = record.tuple[at + 1], value = c.records[valueToken];
      requireFact(value.type === "s" && typeof value.value === "string");
      const descriptor = Object.getOwnPropertyDescriptor(row, field);
      requireFact(descriptor && Object.hasOwn(descriptor, "value") && descriptor.value === value.value);
      rowFields[i] = valueToken; counts.set(valueToken, (counts.get(valueToken) || 0) + 1);
    }
    const unique = counts.size, newArray = fields === undefined;
    const plan = reserveOperation(c,
      count + unique * 2 + 2 + (newArray ? 2 : 0),
      128 + unique * 128 + count * 16 + (newArray ? 80 : 0),
      256 + unique * 128 + count * 16 + (newArray ? 192 : 0),
      0, temporaryBytes, count + unique + 8);
    index = new Map();
    for (let i = 0; i < count; i++) {
      const token = rowFields[i]; let indices = index.get(token);
      if (indices === undefined) { indices = []; index.set(token, indices); }
      indices.push(i);
    }
    for (const indices of index.values()) Object.freeze(indices);
    requireFact(fresh(c), "age-cap", c);
    if (fields === undefined) fields = new Map();
    commitOperation(c, plan);
    fields.set(fieldToken, index); operationState.indices.set(array, fields);
    stats.indexCreates++; return index.get(keyToken) || operationState.empty;
  } catch (error) {
    if (error === fail) { stats.indexFallbacks++; return null; }
    throw error;
  }
}
function jsonValid(value, depth = 0) {
  if (!available() || !Number.isSafeInteger(depth) || depth < 0) return false;
  if (value === null || typeof value !== "object") return false;
  const token = bindings.get(value);
  const ok = token !== undefined && depth + retained.records[token].height <= MAX_DEPTH;
  if (ok) stats.jsonFacts++;
  return ok;
}
// A separate insertion-order digest, admitted only by the private codec after
// its actual complete expanded SHA check. It is never a canonical P token.
function expandedHash(raw) {
  if (!epoch.isActive() || retained === null || !fresh(retained) || retained.expandedHash === null
      || !Buffer.isBuffer(raw) || !retained.raw.equals(raw)) return null;
  stats.expandedDigestHits++;
  return retained.expandedHash;
}
function snapshotStats() {
  const c = retained;
  const { firstBudgetFailure, fallbackCounters, checkpoints, ...counts } = stats;
  return { ...counts,
    firstBudgetFailure: firstBudgetFailure ? { ...firstBudgetFailure } : null,
    fallbackCounters: { ...fallbackCounters }, checkpoints: checkpoints.map(item => ({ ...item })),
    contextPresent: c !== null, active: active && epoch.isActive(), activeBindings: bindingCount,
    activeOperationEntries: operationIds, activeOperationKeyBytes: operationKeys, activeOperationHeapBytes: operationHeap,
    contextAgeMs: c ? Number(mono() - c.born) / 1000000 : null,
    baseIdentities: c ? c.baseIdentities : 0, extraIdentities: c ? c.extraIdentities : 0,
    contentRecords: c ? c.records.length - 1 : 0, keyBytes: c ? c.keyBytes : 0,
    retainedExtraTypes: c ? { null: c.extraTypes[0], boolean: c.extraTypes[1], number: c.extraTypes[2],
      string: c.extraTypes[3], array: c.extraTypes[4], object: c.extraTypes[5] } : null,
    retainedExtraKeyBytes: c ? { scalarMapKeys: c.extraScalarKeyBytes, tupleWords: c.extraTupleKeyBytes } : null,
    retainedExtraStringIndex: c ? { numericBuckets: c.extraScalars[3].size,
      collisionEntries: c.extraTypes[3] - c.extraScalars[3].size } : null,
    parsedAndFactHeapBytes: c ? c.heapBytes : 0, activeBindingHeapBytes: bindingHeap,
    chunkBytes: c ? c.chunkBytes : 0, digestEntries: c ? c.digests.size + (c.expandedHash === null ? 0 : 1) : 0,
    digestBytes: c ? c.digestBytes : 0,
    caps: { identities: MAX_IDENTITIES, keyBytes: MAX_KEYS, digestEntries: MAX_DIGESTS,
      digestBytes: MAX_DIGEST_BYTES, chunkAndTemporaryBytes: MAX_CHUNKS,
      retainedChunkBytes: MAX_RETAINED_CHUNKS, rawBytes: MAX_RAW, parsedAndFactHeapBytes: MAX_HEAP,
      diagnosticHeapBytes: DIAGNOSTIC_HEAP, diagnosticCheckpoints: MAX_CHECKPOINTS, ageMs: MAX_AGE } };
}

module.exports = Object.freeze({ prepare, begin, end, hash, compatibleBHash, copyInputForHash, projectedValue, fieldIndices, jsonValid, expandedHash, snapshotStats });
