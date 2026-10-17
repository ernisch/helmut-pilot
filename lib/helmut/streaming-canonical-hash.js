"use strict";

// The existing synthetik canonical preimage, written in finite chunks. Large
// repeated original contexts never require a single expanded JSON string.
const crypto = require("node:crypto");
const { hash: contentHash } = require("./canonical-content-facts");
const { isActive: contentEpochActive } = require("./synthetik-500-cpu-epoch");
const MAX_MEMO_VALUE = 64 * 1024, MAX_MEMO_BYTES = 16 * 1024 * 1024;
function isData(value) {
  const complete = new WeakSet(), visiting = new WeakSet();
  function valid(v) {
    if (v === null || ["string", "boolean"].includes(typeof v)) return true;
    if (typeof v === "number") return Number.isFinite(v);
    if (!v || typeof v !== "object" || ![Object.prototype, null, Array.prototype].includes(Object.getPrototypeOf(v))
      || Object.hasOwn(v, "toJSON") || Object.getOwnPropertySymbols(v).length || visiting.has(v)) return false;
    if (complete.has(v)) return true;
    const keys = Object.keys(v), descriptors = Object.getOwnPropertyDescriptors(v);
    if (Array.isArray(v) && (keys.length !== v.length || keys.some((k, i) => k !== String(i)))) return false;
    visiting.add(v);
    const ok = keys.every(k => Object.hasOwn(descriptors[k], "value") && valid(descriptors[k].value));
    visiting.delete(v); if (ok) complete.add(v); return ok;
  }
  return valid(value);
}
function hash(value, legacy) {
  if (contentEpochActive()) {
    const known = contentHash(value);
    if (known !== null) return known;
  }
  // Accessors and non-JSON inputs keep the exact original evaluation semantics.
  if (!isData(value)) return crypto.createHash("sha256").update(legacy(value)).digest("hex");
  const digest = crypto.createHash("sha256"), memo = new WeakMap(), active = new WeakSet();
  let memoBytes = 0;
  function small(v) {
    if (!v || typeof v !== "object") return JSON.stringify(v);
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
      const bytes = Buffer.byteLength(result);
      if (memoBytes + bytes <= MAX_MEMO_BYTES) { memoBytes += bytes; memo.set(v, result); }
    } else memo.set(v, null);
    return result;
  }
  const writing = new WeakSet();
  function write(v) {
    const compact = small(v);
    if (compact !== null) { digest.update(compact); return; }
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
module.exports = { hash };
