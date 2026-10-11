"use strict";
// Lossless transport of the complete direct command/packet, never projection.
// Both encoded and decoded sizes are finite; hashes cover original UTF8 bytes.
const crypto = require("node:crypto"), zlib = require("node:zlib");
const VERSION = "helmut-synthetik500-direct-gzip/1";
const MAX_BYTES = 64 * 1024 * 1024, MAX_ENCODED = 16 * 1024 * 1024;
const DICTIONARY_VERSION = "helmut-synthetik500-direct-dictionary-gzip/2";
// The bound covers the measured 3,012,510,816-byte retained input lower bound.
// The final complete command must still fit this explicit, separate v2 bound.
const MAX_EXPANDED = 4 * 1024 * 1024 * 1024, MAX_NODES = 200000, MAX_DEPTH = 80;
const MAX_CACHE = 16 * 1024 * 1024, MAX_CACHE_NODE = 16384;
const direct = x => (x?.command ?? x)?.version === "helmut-synthetik500-production-command/2-direct"
  && (x?.command ?? x)?.mode === "D-R-500";
const directInput = x => x?.executorInputs?.version === "helmut-synthetik500-executor-eingaben/4-direct"
  && Object.keys(x).sort().join("|") === "drafts|executorInputs|package|predecessors";
const supported = x => direct(x) || directInput(x) || x?.version === "helmut-synthetik500-direct-result-export/1"
  && /^synthetik500-[a-z0-9-]{8,80}$/.test(x.operationId || "") && /^[a-f0-9]{64}$/.test(x.commandHash || "")
  && x.result && typeof x.result === "object";
const requireThat = ok => { if (!ok) throw Error("synthetik500-production-direct-codec-invalid"); };
function encode(value) {
  requireThat(supported(value));
  if (legacySize(value) > MAX_BYTES) return encodeDictionary(intern(value));
  require("./knowledge-object-version").jsonValue(value);
  const raw = Buffer.from(JSON.stringify(value)); requireThat(raw.length <= MAX_BYTES);
  const envelope = { version: VERSION, bytes: raw.length, sha256: crypto.createHash("sha256").update(raw).digest("hex"),
    data: zlib.gzipSync(raw).toString("base64") };
  requireThat(Buffer.byteLength(JSON.stringify(envelope)) <= MAX_ENCODED); return envelope;
}
// Stop counting at the original v1 cap. Small v1 values retain their existing
// validator and do not inherit dictionary node limits or immutable aliases.
function legacySize(value) {
  const visiting = new WeakSet();
  function count(x, depth) {
    requireThat(depth <= MAX_DEPTH);
    if (x === null || ["string", "boolean", "number"].includes(typeof x)) {
      requireThat(typeof x !== "number" || Number.isFinite(x) && (!Number.isInteger(x) || Number.isSafeInteger(x)));
      return Buffer.byteLength(JSON.stringify(x));
    }
    requireThat(x && (Array.isArray(x) || [Object.prototype, null].includes(Object.getPrototypeOf(x)))
      && !Object.hasOwn(x, "toJSON") && Object.getOwnPropertySymbols(x).length === 0 && !visiting.has(x));
    const keys = Object.keys(x), descriptors = Object.getOwnPropertyDescriptors(x);
    requireThat(keys.every(k => Object.hasOwn(descriptors[k], "value")));
    const array = Array.isArray(x);
    if (array) requireThat(keys.length === x.length && keys.every((k, i) => k === String(i)));
    let size = 2 + Math.max(0, keys.length - 1); visiting.add(x);
    for (const k of keys) {
      if (!array) size += Buffer.byteLength(JSON.stringify(k)) + 1;
      size += count(descriptors[k].value, depth + 1);
      if (size > MAX_BYTES) { visiting.delete(x); return MAX_BYTES + 1; }
    }
    visiting.delete(x); return size;
  }
  return count(value, 0);
}
function decode(value) {
  if (value?.version === DICTIONARY_VERSION) return decodeDictionary(value);
  if (value?.version !== VERSION) return value;
  requireThat(Object.keys(value).sort().join("|") === "bytes|data|sha256|version"
    && Number.isSafeInteger(value.bytes) && value.bytes > 0 && value.bytes <= MAX_BYTES
    && typeof value.data === "string" && Buffer.byteLength(JSON.stringify(value)) <= MAX_ENCODED
    && /^[a-f0-9]{64}$/.test(value.sha256 || ""));
  const gzip = Buffer.from(value.data, "base64"); requireThat(gzip.toString("base64") === value.data);
  const raw = zlib.gunzipSync(gzip, { maxOutputLength: value.bytes });
  requireThat(raw.length === value.bytes && crypto.createHash("sha256").update(raw).digest("hex") === value.sha256
    && Buffer.from(raw.toString("utf8"), "utf8").equals(raw));
  const result = JSON.parse(raw); requireThat(supported(result)); require("./knowledge-object-version").jsonValue(result);
  return result;
}
function intern(value) {
  const nodes = [], signatures = new Map(), completed = new WeakMap(), visiting = new WeakSet();
  let dictionaryBytes = 0;
  function visit(x, depth) {
    requireThat(depth <= MAX_DEPTH);
    let node;
    if (x === null) node = ["n"];
    else if (typeof x === "string" || typeof x === "boolean") node = [typeof x === "string" ? "s" : "b", x];
    else if (typeof x === "number") {
      requireThat(Number.isFinite(x) && (!Number.isInteger(x) || Number.isSafeInteger(x))); node = ["d", x];
    } else {
      requireThat(x && (Array.isArray(x) || [Object.prototype, null].includes(Object.getPrototypeOf(x)))
        && !Object.hasOwn(x, "toJSON") && Object.getOwnPropertySymbols(x).length === 0 && !visiting.has(x));
      if (completed.has(x)) return completed.get(x);
      const keys = Object.keys(x), descriptors = Object.getOwnPropertyDescriptors(x);
      requireThat(keys.every(k => Object.hasOwn(descriptors[k], "value")));
      if (Array.isArray(x)) requireThat(keys.length === x.length && keys.every((k, i) => k === String(i)));
      visiting.add(x);
      node = Array.isArray(x) ? ["a", keys.map(k => visit(descriptors[k].value, depth + 1))]
        : ["o", keys.map(k => [visit(k, depth + 1), visit(descriptors[k].value, depth + 1)])];
      visiting.delete(x);
    }
    const signature = JSON.stringify(node);
    let id = signatures.get(signature);
    if (id === undefined) {
      id = nodes.length; requireThat(id < MAX_NODES);
      dictionaryBytes += Buffer.byteLength(signature) + 1; requireThat(dictionaryBytes <= MAX_BYTES);
      nodes.push(node); signatures.set(signature, id);
    }
    if (x !== null && typeof x === "object") completed.set(x, id);
    return id;
  }
  const root = visit(value, 0), checked = checkDictionary({ nodes, root });
  return { nodes, root, expandedBytes: checked.sizes[root], checked };
}
function checkDictionary(payload) {
  requireThat(payload && Object.keys(payload).sort().join("|") === "nodes|root"
    && Array.isArray(payload.nodes) && payload.nodes.length > 0 && payload.nodes.length <= MAX_NODES
    && payload.root === payload.nodes.length - 1);
  const { nodes, root } = payload, sizes = [], depths = [], scalar = [], children = [];
  const reference = (r, i) => requireThat(Number.isSafeInteger(r) && r >= 0 && r < i);
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]; requireThat(Array.isArray(n)); let refs = [], size;
    if (n[0] === "n") { requireThat(n.length === 1); scalar[i] = "null"; }
    else if (["s", "b", "d"].includes(n[0])) {
      requireThat(n.length === 2 && (n[0] === "s" ? typeof n[1] === "string" : n[0] === "b" ? typeof n[1] === "boolean"
        : typeof n[1] === "number" && Number.isFinite(n[1]) && (!Number.isInteger(n[1]) || Number.isSafeInteger(n[1]))));
      scalar[i] = JSON.stringify(n[1]);
    } else if (n[0] === "a" || n[0] === "o") {
      requireThat(n.length === 2 && Array.isArray(n[1]));
      if (n[0] === "a") { refs = n[1]; for (const r of refs) reference(r, i); size = 2 + Math.max(0, refs.length - 1); }
      else {
        const keys = new Set(), keyOrder = [], probe = {};
        for (const pair of n[1]) {
          requireThat(Array.isArray(pair) && pair.length === 2); for (const r of pair) reference(r, i);
          requireThat(nodes[pair[0]][0] === "s"); const k = nodes[pair[0]][1]; requireThat(k !== "toJSON" && !keys.has(k)); keys.add(k); keyOrder.push(k);
          Object.defineProperty(probe, k, { value: null, enumerable: true }); refs.push(...pair);
        }
        requireThat(JSON.stringify(Object.keys(probe)) === JSON.stringify(keyOrder));
        size = 2 + Math.max(0, n[1].length - 1) + n[1].length;
      }
      for (const r of refs) { size += sizes[r]; requireThat(Number.isSafeInteger(size) && size <= MAX_EXPANDED); }
    } else requireThat(false);
    sizes[i] = size === undefined ? Buffer.byteLength(scalar[i]) : size;
    requireThat(sizes[i] <= MAX_EXPANDED);
    let depth = 0; for (const r of refs) depth = Math.max(depth, depths[r] + 1);
    // Object key strings do not add a value depth, matching the existing JSON contract.
    if (n[0] === "o") { depth = 0; for (const pair of n[1]) depth = Math.max(depth, depths[pair[1]] + 1); }
    requireThat(depth <= MAX_DEPTH); depths[i] = depth; children[i] = refs;
  }
  const seen = new Set(), todo = [root];
  while (todo.length) { const i = todo.pop(); if (seen.has(i)) continue; seen.add(i); for (const r of children[i]) todo.push(r); }
  requireThat(seen.size === nodes.length);
  return { sizes, scalar };
}
function expandedHash(nodes, root, checked) {
  const hash = crypto.createHash("sha256"), cache = new Map(); let cacheBytes = 0;
  function emit(id, write) {
    if (cache.has(id)) return write(cache.get(id));
    if (checked.sizes[id] <= MAX_CACHE_NODE && cacheBytes + checked.sizes[id] <= MAX_CACHE) {
      const chunks = []; body(id, x => chunks.push(Buffer.isBuffer(x) ? x : Buffer.from(x)));
      const b = Buffer.concat(chunks); requireThat(b.length === checked.sizes[id]);
      cache.set(id, b); cacheBytes += b.length; return write(b);
    }
    body(id, write);
  }
  function body(id, write) {
    const n = nodes[id];
    if (checked.scalar[id] !== undefined) return write(checked.scalar[id]);
    const object = n[0] === "o"; write(object ? "{" : "[");
    for (let i = 0; i < n[1].length; i++) {
      if (i) write(",");
      if (object) { emit(n[1][i][0], write); write(":"); emit(n[1][i][1], write); }
      else emit(n[1][i], write);
    }
    write(object ? "}" : "]");
  }
  emit(root, chunk => hash.update(chunk)); return hash.digest("hex");
}
function encodeDictionary(dictionary) {
  const { nodes, root, expandedBytes, checked } = dictionary;
  const raw = Buffer.from(JSON.stringify({ nodes, root })); requireThat(raw.length <= MAX_BYTES);
  const envelope = { version: DICTIONARY_VERSION, bytes: expandedBytes, sha256: expandedHash(nodes, root, checked),
    dictionaryBytes: raw.length, dictionarySha256: crypto.createHash("sha256").update(raw).digest("hex"),
    data: zlib.gzipSync(raw).toString("base64") };
  requireThat(Buffer.byteLength(JSON.stringify(envelope)) <= MAX_ENCODED); return envelope;
}
function decodeDictionary(value) {
  requireThat(Object.keys(value).sort().join("|") === "bytes|data|dictionaryBytes|dictionarySha256|sha256|version"
    && Number.isSafeInteger(value.bytes) && value.bytes > MAX_BYTES && value.bytes <= MAX_EXPANDED
    && Number.isSafeInteger(value.dictionaryBytes) && value.dictionaryBytes > 0 && value.dictionaryBytes <= MAX_BYTES
    && typeof value.data === "string" && Buffer.byteLength(JSON.stringify(value)) <= MAX_ENCODED
    && /^[a-f0-9]{64}$/.test(value.sha256 || "") && /^[a-f0-9]{64}$/.test(value.dictionarySha256 || ""));
  const gzip = Buffer.from(value.data, "base64"); requireThat(gzip.toString("base64") === value.data);
  const raw = zlib.gunzipSync(gzip, { maxOutputLength: value.dictionaryBytes });
  requireThat(raw.length === value.dictionaryBytes && crypto.createHash("sha256").update(raw).digest("hex") === value.dictionarySha256
    && Buffer.from(raw.toString("utf8"), "utf8").equals(raw));
  const payload = JSON.parse(raw), checked = checkDictionary(payload);
  requireThat(checked.sizes[payload.root] === value.bytes && expandedHash(payload.nodes, payload.root, checked) === value.sha256);
  const values = [];
  for (const n of payload.nodes) {
    if (n[0] === "n") values.push(null);
    else if (["s", "b", "d"].includes(n[0])) values.push(n[1]);
    else {
      let x;
      if (n[0] === "a") x = n[1].map(r => values[r]);
      else { x = {}; for (const [k, v] of n[1]) Object.defineProperty(x, values[k], { value: values[v], enumerable: true }); }
      values.push(Object.freeze(x));
    }
  }
  const result = values[payload.root]; requireThat(supported(result)); return result;
}
module.exports = { VERSION, DICTIONARY_VERSION, MAX_BYTES, MAX_ENCODED, MAX_EXPANDED, MAX_NODES, MAX_DEPTH, encode, decode };
