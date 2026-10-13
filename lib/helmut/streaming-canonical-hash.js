"use strict";

// The existing synthetik canonical preimage, written in finite chunks. Large
// repeated original contexts never require a single expanded JSON string.
const crypto = require("node:crypto");
const MAX_MEMO_VALUE = 64 * 1024, MAX_MEMO_BYTES = 16 * 1024 * 1024;
const MAX_SCOPE_OBJECTS = 200000, MAX_SCOPE_VALUE = 4 * 1024 * 1024;
const { isProxy } = require("node:util").types;
const JSON_INTRINSICS = { Object, Array, JSON, Number, String, Buffer, WeakMap, WeakSet };
const GLOBAL_OBJECT = globalThis;
const freezePrivate = Object.freeze, intrinsicApply = Reflect.apply;
const WeakMapOwned = WeakMap, WeakSetOwned = WeakSet, MapOwned = Map;
const MP = { get: Map.prototype.get, has: Map.prototype.has, set: Map.prototype.set };
const WM = { get: WeakMap.prototype.get, has: WeakMap.prototype.has, set: WeakMap.prototype.set };
const WS = { has: WeakSet.prototype.has, add: WeakSet.prototype.add, delete: WeakSet.prototype.delete };
function ownedWeakMap() {
  const data = new WeakMapOwned(); return freezePrivate({
    get: key => intrinsicApply(WM.get, data, [key]), has: key => intrinsicApply(WM.has, data, [key]),
    set: (key, value) => { intrinsicApply(WM.set, data, [key, value]); }
  });
}
function ownedWeakSet() {
  const data = new WeakSetOwned(); return freezePrivate({
    has: key => intrinsicApply(WS.has, data, [key]), add: key => { intrinsicApply(WS.add, data, [key]); },
    delete: key => intrinsicApply(WS.delete, data, [key])
  });
}
function ownedMap() {
  const data = new MapOwned(); return freezePrivate({
    get: key => intrinsicApply(MP.get, data, [key]), has: key => intrinsicApply(MP.has, data, [key]),
    set: (key, value) => { intrinsicApply(MP.set, data, [key, value]); }
  });
}
const ownDescriptor = Object.getOwnPropertyDescriptor, ownDataProperty = Object.defineProperty, intrinsicOwn = Object.hasOwn;
const ownSlot = (object, key) => intrinsicOwn(object, key) ? object[key] : undefined;
const appendPrivate = (array, value) => ownDataProperty(array, "" + array.length,
  { __proto__: null, value, enumerable: true, configurable: true, writable: true });
const GLOBAL_DESCRIPTORS = {};
for (const key of Object.keys(JSON_INTRINSICS)) GLOBAL_DESCRIPTORS[key] = ownDescriptor(GLOBAL_OBJECT, key);
const intrinsicPrototype = Object.getPrototypeOf;
const PROOF = { frozen: Object.isFrozen, prototype: Object.getPrototypeOf, descriptors: Object.getOwnPropertyDescriptors,
  keys: Object.keys, names: Object.getOwnPropertyNames, symbols: Object.getOwnPropertySymbols,
  own: Object.hasOwn, array: Array.isArray, finite: Number.isFinite, objectPrototype: Object.prototype, arrayPrototype: Array.prototype };
const utf8Bytes = Buffer.byteLength, scalarJSON = JSON.stringify, keySort = Array.prototype.sort;
const copyBytes = Uint8Array.prototype.set;
const allocateBytes = Buffer.allocUnsafeSlow, utf8Write = Buffer.prototype.utf8Write, utf8Slice = Buffer.prototype.utf8Slice;
const typedByteLength = ownDescriptor(intrinsicPrototype(Uint8Array.prototype), "byteLength").get;
const cryptoPrototype = crypto.Hash.prototype;
const BUFFER_DEPENDENCIES = [[Buffer, "allocUnsafeSlow"], [Buffer, "byteLength"],
  [intrinsicPrototype(Uint8Array.prototype), "set"], [Buffer.prototype, "utf8Write"], [Buffer.prototype, "utf8Slice"], [Buffer.prototype, "toString"],
  [crypto, "createHash"], [crypto, "Hash"], [crypto.Hash, "prototype"], [cryptoPrototype, "update"], [cryptoPrototype, "digest"]]
  .map(([object, key]) => ({ object, key, descriptor: ownDescriptor(object, key) }));
const bufferText = value => intrinsicApply(utf8Slice, value, [0, intrinsicApply(typedByteLength, value, [])]);
function privateUtf8(text, size) {
  const value = allocateBytes(size);
  if (intrinsicApply(utf8Write, value, [text, 0, size]) !== size || bufferText(value) !== text) return null;
  return value;
}
const iteratorPrototype = Object.getPrototypeOf([][Symbol.iterator]());
const JSON_DEPENDENCIES = [[Object, "keys"], [Object, "fromEntries"], [Array, "isArray"],
  [Array.prototype, "map"], [Array.prototype, "sort"], [Array.prototype, "constructor"],
  [Array, Symbol.species], [Array.prototype, Symbol.iterator], [iteratorPrototype, "next"], [JSON, "stringify"]]
  .map(([object, key]) => ({ object, key, descriptor: ownDescriptor(object, key) }));
const P_DEPENDENCIES = JSON_DEPENDENCIES.concat(BUFFER_DEPENDENCIES, [[Object, "defineProperty"], [Object, "getPrototypeOf"], [Object, "getOwnPropertyDescriptors"],
  [Object, "getOwnPropertySymbols"], [Object, "getOwnPropertyNames"], [Object, "hasOwn"], [Object, "isFrozen"],
  [Array.prototype, "every"], [Array.prototype, "some"], [Array.prototype, "push"], [Array.prototype, "join"],
  [Array.prototype, "includes"], [Number, "isFinite"], [Buffer, "byteLength"],
  [WeakMap.prototype, "has"], [WeakMap.prototype, "get"], [WeakMap.prototype, "set"],
  [WeakSet.prototype, "has"], [WeakSet.prototype, "add"], [WeakSet.prototype, "delete"]]
  .map(([object, key]) => ({ object, key, descriptor: ownDescriptor(object, key) })));
function indexedPrototypesCurrent() {
  if (intrinsicPrototype(PROOF.arrayPrototype) !== PROOF.objectPrototype
    || intrinsicPrototype(PROOF.objectPrototype) !== null) return false;
  const prototypes = [PROOF.arrayPrototype, PROOF.objectPrototype];
  for (let p = 0; p < prototypes.length; p++) {
    const names = PROOF.names(prototypes[p]);
    for (let i = 0; i < names.length; i++) {
      const key = names[i], number = +key;
      if (number >= 0 && number < 4294967295 && number % 1 === 0 && "" + number === key) return false;
    }
  }
  return true;
}
function dependenciesCurrent(dependencies) {
  if (!indexedPrototypesCurrent()) return false;
  const names = dependencies === P_DEPENDENCIES ? ["Object", "Array", "JSON", "Number", "String", "Buffer", "WeakMap", "WeakSet"]
    : ["Object", "Array", "JSON", "Buffer"];
  for (let i = 0; i < names.length; i++) {
    const key = names[i], current = ownDescriptor(GLOBAL_OBJECT, key), descriptor = GLOBAL_DESCRIPTORS[key];
    if (!current || ownSlot(current, "value") !== ownSlot(descriptor, "value") || ownSlot(current, "get") !== ownSlot(descriptor, "get") || ownSlot(current, "set") !== ownSlot(descriptor, "set")
      || ownSlot(current, "enumerable") !== ownSlot(descriptor, "enumerable") || ownSlot(current, "configurable") !== ownSlot(descriptor, "configurable")
      || ownSlot(current, "writable") !== ownSlot(descriptor, "writable")) return false;
    // Node exposes Buffer through a builtin accessor. Invoke only that captured
    // unchanged getter; replacement accessors/proxy bindings are never queried.
    if (ownSlot(descriptor, "get") && intrinsicApply(ownSlot(descriptor, "get"), GLOBAL_OBJECT, []) !== JSON_INTRINSICS[key]) return false;
  }
  for (let i = 0; i < dependencies.length; i++) {
    const { object, key, descriptor } = dependencies[i], current = ownDescriptor(object, key);
    if (!current || ownSlot(current, "value") !== ownSlot(descriptor, "value") || ownSlot(current, "get") !== ownSlot(descriptor, "get") || ownSlot(current, "set") !== ownSlot(descriptor, "set")
      || ownSlot(current, "writable") !== ownSlot(descriptor, "writable") || ownSlot(current, "enumerable") !== ownSlot(descriptor, "enumerable")
      || ownSlot(current, "configurable") !== ownSlot(descriptor, "configurable")) return false;
  }
  return true;
}
function jsonDependenciesCurrent() {
  if (!dependenciesCurrent(JSON_DEPENDENCIES) || !dependenciesCurrent(BUFFER_DEPENDENCIES)) return false;
  if (intrinsicPrototype(JSON_INTRINSICS.Array.prototype) !== JSON_INTRINSICS.Object.prototype
    || ownDescriptor(JSON_INTRINSICS.Object.prototype, "toJSON")
    || ownDescriptor(JSON_INTRINSICS.Array.prototype, "toJSON")) return false;
  return true;
}
let activeInvocation = null;
function immutableInvocationData(value) { return activeInvocation?.known(value) === true; }
function primeImmutableInvocation(value) {
  // No caller-supplied proof, memo or policy. Unsafe graphs never gain a marker.
  return !!(activeInvocation && dependenciesCurrent(P_DEPENDENCIES) && activeInvocation.plan(value));
}
function withImmutableInvocation(operation) {
  const previous = activeInvocation, metadata = ownedWeakMap(), scalarSizes = ownedMap();
  const chunks = ownedWeakMap(), jsonChunks = ownedWeakMap();
  let proofs = 0, scalarEntries = 0, entries = 0, bytes = 0, jsonEntries = 0, jsonBytes = 0;
  const capped = size => size > MAX_SCOPE_VALUE ? MAX_SCOPE_VALUE + 1 : size;
  const scalarSize = value => {
    if (scalarSizes.has(value)) return scalarSizes.get(value);
    const size = capped(utf8Bytes(scalarJSON(value)));
    if (proofs + scalarEntries < MAX_SCOPE_OBJECTS) { scalarSizes.set(value, size); scalarEntries++; }
    return size;
  };
  const scope = freezePrivate({
    known: value => metadata.has(value),
    plan: value => {
      const complete = ownedWeakMap(), visiting = ownedWeakSet(), pending = []; let count = 0;
      const visit = value => {
        if (value === null || typeof value === "string" || typeof value === "boolean") return { size: scalarSize(value), frozen: true };
        if (typeof value === "number") return PROOF.finite(value) ? { size: scalarSize(value), frozen: true } : null;
        if (!value || typeof value !== "object" || isProxy(value)) return null;
        const prior = complete.get(value);
        if (prior) { prior.references++; return prior; }
        if (++count > MAX_SCOPE_OBJECTS || visiting.has(value)) return null;
        const remembered = metadata.get(value);
        if (remembered) { complete.set(value, remembered); return remembered; }
        const array = PROOF.array(value), prototype = PROOF.prototype(value);
        if ((array ? prototype !== PROOF.arrayPrototype : prototype !== PROOF.objectPrototype && prototype !== null)
          || PROOF.own(value, "toJSON") || PROOF.symbols(value).length) return null;
        const keys = PROOF.keys(value), descriptors = PROOF.descriptors(value);
        if (PROOF.names(value).length !== keys.length + (array ? 1 : 0) || array && keys.length !== value.length) return null;
        const record = { array, keys: null, size: 2, frozen: PROOF.frozen(value), references: 1, rootUses: 0 };
        visiting.add(value);
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          if (array && key !== "" + i || !PROOF.own(descriptors[key], "value")) { visiting.delete(value); return null; }
          const child = visit(descriptors[key].value);
          if (!child) { visiting.delete(value); return null; }
          record.frozen = record.frozen && child.frozen;
          record.size = capped(record.size + (i ? 1 : 0) + (array ? 0 : scalarSize(key) + 1) + child.size);
        }
        visiting.delete(value);
        if (!array) { intrinsicApply(keySort, keys, []); record.keys = keys; }
        complete.set(value, record);
        if (record.frozen && proofs + scalarEntries < MAX_SCOPE_OBJECTS) {
          appendPrivate(pending, [value, record]); proofs++;
        }
        return record;
      };
      const root = visit(value);
      if (!root) { proofs -= pending.length; return null; }
      for (let i = 0; i < pending.length; i++) metadata.set(pending[i][0], pending[i][1]);
      return { root, get: object => complete.get(object) || metadata.get(object) };
    },
    chunk: (value, json) => (json ? jsonChunks : chunks).get(value),
    hasChunk: (value, json) => (json ? jsonChunks : chunks).has(value),
    reserve: (value, record, json) => {
      const store = json ? jsonChunks : chunks;
      if (store.has(value) || !record.frozen || record.references < 2 && record.rootUses < 2) return false;
      if ((json ? jsonEntries : entries) >= MAX_SCOPE_OBJECTS) return false;
      if (json) jsonEntries++; else entries++;
      if (record.size > MAX_SCOPE_VALUE || (json ? jsonBytes : bytes) + record.size > MAX_MEMO_BYTES) {
        store.set(value, null); return false;
      }
      // Reserve the complete parent target BEFORE allocating or descending.
      if (json) jsonBytes += record.size; else bytes += record.size;
      return true;
    },
    remember: (value, buffer, json) => { (json ? jsonChunks : chunks).set(value, buffer); }
  });
  activeInvocation = scope;
  try { return operation(); } finally { activeInvocation = previous; }
}
function scopedHash(value, scope, plan, json) {
  const digest = crypto.createHash("sha256"), temporary = ownedWeakMap();
  let temporaryBytes = 0, temporaryEntries = 0;
  if (value && typeof value === "object") plan.root.rootUses++;
  const keysFor = record => {
    if (!json) return record.keys;
    const indices = [], other = [], keys = record.keys;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i], number = +key;
      if (number >= 0 && number < 4294967295 && number % 1 === 0 && "" + number === key) appendPrivate(indices, key);
      else appendPrivate(other, key);
    }
    intrinsicApply(keySort, indices, [(a, b) => +a - +b]);
    const result = []; for (let i = 0; i < indices.length; i++) appendPrivate(result, indices[i]);
    for (let i = 0; i < other.length; i++) appendPrivate(result, other[i]); return result;
  };
  const body = (object, write, build) => {
    const record = plan.get(object), array = record.array, keys = array ? null : keysFor(record);
    write(array ? "[" : "{"); const count = array ? object.length : keys.length;
    for (let i = 0; i < count; i++) {
      if (i) write(","); if (!array) { write(scalarJSON(keys[i])); write(":"); }
      emit(array ? object[i] : object[keys[i]], write, build);
    }
    write(array ? "]" : "}");
  };
  const emit = (value, write, build) => {
    if (value === null || typeof value !== "object") { write(scalarJSON(value)); return; }
    const record = plan.get(value), cached = record.frozen ? scope.chunk(value, json) : null;
    if (cached) { write(cached); return; }
    const local = temporary.get(value);
    if (local) { write(local); return; }
    const retained = build && scope.reserve(value, record, json);
    let compact = false;
    if (build && !retained && record.size <= MAX_MEMO_VALUE && !temporary.has(value)
      && temporaryEntries < MAX_SCOPE_OBJECTS) {
      temporaryEntries++;
      if (temporaryBytes + record.size <= MAX_MEMO_BYTES) {
        // This snapshot belongs to this one synchronous hash only. Reserve the
        // complete small target first; filling it creates no child targets.
        temporaryBytes += record.size; compact = true;
      } else temporary.set(value, null);
    }
    if (retained || compact) {
      const buffer = allocateBytes(record.size); let offset = 0;
      body(value, chunk => {
        if (typeof chunk === "string") offset += intrinsicApply(utf8Write, buffer, [chunk, offset, record.size - offset]);
        else { intrinsicApply(copyBytes, buffer, [chunk, offset]); offset += intrinsicApply(typedByteLength, chunk, []); }
      }, false);
      if (offset !== record.size) throw Error("canonical-hash-preimage-size");
      if (retained) scope.remember(value, buffer, json); else temporary.set(value, buffer);
      write(buffer); return;
    }
    // Oversized and budget-miss parents stream children. Never decode a cached
    // Buffer or build oversized parent text. Every byte still reaches SHA.
    body(value, write, build);
  };
  emit(value, chunk => digest.update(chunk), true); return digest.digest("hex");
}
function isData(value, scope) {
  const complete = new WeakSet(), visiting = new WeakSet();
  function valid(v) {
    if (v === null || ["string", "boolean"].includes(typeof v)) return true;
    if (typeof v === "number") return Number.isFinite(v);
    if (!v || typeof v !== "object" || ![Object.prototype, null, Array.prototype].includes(Object.getPrototypeOf(v))
      || Object.hasOwn(v, "toJSON") || Object.getOwnPropertySymbols(v).length || visiting.has(v)) return false;
    if (scope?.known(v)) return true;
    if (complete.has(v)) return true;
    const keys = Object.keys(v), descriptors = Object.getOwnPropertyDescriptors(v);
    if (Array.isArray(v) && (keys.length !== v.length || keys.some((k, i) => k !== String(i)))) return false;
    visiting.add(v);
    const ok = keys.every(k => Object.hasOwn(descriptors[k], "value") && valid(descriptors[k].value));
    visiting.delete(v);
    if (ok) {
      complete.add(v);
      if (scope) scope.rememberData(v);
    }
    return ok;
  }
  return valid(value);
}
function hash(value, legacy) {
  const scope = value && typeof value === "object" && activeInvocation && dependenciesCurrent(P_DEPENDENCIES) ? activeInvocation : null;
  const plan = scope?.plan(value);
  // One captured full-domain proof replaces the redundant public isData walk
  // only on callback-free scoped data; the original unsafe path is unchanged.
  if (plan) return scopedHash(value, scope, plan, false);
  return originalHash(value, legacy);
}
function originalHash(value, legacy) {
  const scope = null;
  // Accessors and non-JSON inputs keep the exact original evaluation semantics.
  if (!isData(value, scope)) return crypto.createHash("sha256").update(legacy(value)).digest("hex");
  const digest = crypto.createHash("sha256"), memo = new WeakMap(), active = new WeakSet();
  let memoBytes = 0;
  function small(v) {
    if (!v || typeof v !== "object") return JSON.stringify(v);
    const shared = scope?.known(v) ? scope.chunk(v) : null;
    if (shared !== null && shared !== undefined) return shared.value === null ? null : bufferText(shared.value);
    if (memo.has(v)) return memo.get(v);
    if (active.has(v)) throw new TypeError("canonical-hash-cycle");
    active.add(v);
    const array = Array.isArray(v), parts = [array ? "[" : "{"], keys = array ? null : Object.keys(v).sort();
    let length = 1, fits = true;
    const count = array ? v.length : keys.length;
    for (let i = 0; i < count; i++) {
      const child = small(array ? v[i] : v[keys[i]]);
      if (child === null && (array ? v[i] : v[keys[i]]) !== null) { fits = false; break; }
      // Preserve the original canonicalizer's treatment of undefined values.
      const text = (i ? "," : "") + (array ? "" : JSON.stringify(keys[i]) + ":")
        + (child === undefined ? (array ? "" : "undefined") : child);
      length += text.length;
      if (length + 1 > MAX_MEMO_VALUE) { fits = false; break; }
      parts.push(text);
    }
    active.delete(v);
    let result = null;
    if (fits) {
      parts.push(array ? "]" : "}"); result = parts.join("");
      const bytes = scope ? utf8Bytes(result) : Buffer.byteLength(result);
      if (scope?.known(v)) scope.rememberChunk(v, result);
      if (!scope?.chunk(v) && memoBytes + bytes <= MAX_MEMO_BYTES) { memoBytes += bytes; memo.set(v, result); }
    } else memo.set(v, null);
    if (scope?.known(v) && !fits) scope.rememberChunk(v, result);
    return result;
  }
  const writing = new WeakSet();
  function write(v) {
    const shared = v && typeof v === "object" && scope?.known(v) ? scope.chunk(v) : null;
    if (shared && shared.value !== null) { digest.update(shared.value); return; }
    const compact = small(v);
    if (compact !== null) {
      const encoded = v && typeof v === "object" && scope?.known(v) ? scope.chunk(v) : null;
      digest.update(encoded?.value ?? compact); return;
    }
    if (writing.has(v)) throw new TypeError("canonical-hash-cycle");
    writing.add(v);
    const array = Array.isArray(v), keys = array ? null : Object.keys(v).sort();
    digest.update(array ? "[" : "{");
    const count = array ? v.length : keys.length;
    for (let i = 0; i < count; i++) {
      if (i) digest.update(",");
      if (!array) digest.update(JSON.stringify(keys[i]) + ":");
      const child = array ? v[i] : v[keys[i]];
      if ((!child || typeof child !== "object") && JSON.stringify(child) === undefined) {
        if (!array) digest.update("undefined");
      } else write(child);
    }
    digest.update(array ? "]" : "}");
    writing.delete(v);
  }
  write(value); return digest.digest("hex");
}
function hashJson(value, legacyHash) {
  const scope = activeInvocation;
  if (!scope?.known(value) || !jsonDependenciesCurrent()) return legacyHash(value);
  const plan = scope.plan(value);
  return plan ? scopedHash(value, scope, plan, true) : legacyHash(value);
}
module.exports = { hash, withImmutableInvocation, immutableInvocationData, primeImmutableInvocation, hashJson };
