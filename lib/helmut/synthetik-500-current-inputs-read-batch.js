"use strict";

// Transport only. The caller retains every original source/batch/version/hash
// check. No response, verdict, native permission or policy is reused.
const crypto = require("node:crypto");
const { isProxy } = require("node:util").types;
const VERSION = "helmut-synthetik500-current-input-batches/1";
const RPC_NAME = "helmut_synthetik500_current_inputs_v1";
const ENDPOINT = "/rest/v1/rpc/" + RPC_NAME;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_OBJECTS = 200000;
const arrayPrototype = Array.prototype, objectPrototype = Object.prototype;
const isArray = Array.isArray, getPrototype = Object.getPrototypeOf;
const getDescriptors = Object.getOwnPropertyDescriptors, getNames = Object.getOwnPropertyNames;
const getSymbols = Object.getOwnPropertySymbols, getKeys = Object.keys;
const frozen = Object.isFrozen, own = Object.hasOwn, apply = Reflect.apply;
const NativeWeakSet = WeakSet, weakHas = WeakSet.prototype.has, weakAdd = WeakSet.prototype.add;
const NativeWeakRef = WeakRef, weakDeref = WeakRef.prototype.deref;
const weakDelete = WeakSet.prototype.delete, stringify = JSON.stringify;
const finite = Number.isFinite, integer = Number.isInteger, safeInteger = Number.isSafeInteger;
const nativeArrayMap = Array.prototype.map, nativeArraySort = Array.prototype.sort;
const nativeArrayEvery = Array.prototype.every, nativeArraySome = Array.prototype.some;
const propertyDescriptor = Object.getOwnPropertyDescriptor;
const NativeSet = Set, setHas = Set.prototype.has, setAdd = Set.prototype.add;
const NativeBuffer = Buffer, nativeByteLength = Buffer.byteLength;
const nativeRandomBytes = crypto.randomBytes, nativeBufferToString = Buffer.prototype.toString;
const nativeHexSlice = Buffer.prototype.hexSlice, nativeDateParse = Date.parse;
const nativeBufferPrototype = Buffer.prototype;
const regExpPrototype = RegExp.prototype, nativeRegExpTest = RegExp.prototype.test;
const nativeRegExpExec = RegExp.prototype.exec;
const bufferGlobalDescriptor = propertyDescriptor(globalThis, "Buffer");
const arrayMethods = [["map", nativeArrayMap], ["sort", nativeArraySort],
  ["every", nativeArrayEvery], ["some", nativeArraySome]];
let lastPositiveExpected = null;
const fail = () => { throw Error("synthetik500-production-native-input-transport"); };
const validId = id => typeof id === "string" && id.length > 0 && id.length <= 200
  && !/[^A-Za-z0-9_ÄÖÜäöüß-]/u.test(id);

function ordinaryTransportHooks() {
  // No getter invocation: inherited serialization/RegExp hooks select the
  // original path before any extra validId/stringify call or network attempt.
  if (getPrototype(arrayPrototype) !== objectPrototype || getPrototype(objectPrototype) !== null
    || propertyDescriptor(objectPrototype, "toJSON") || propertyDescriptor(arrayPrototype, "toJSON")) return false;
  const test = propertyDescriptor(regExpPrototype, "test"), exec = propertyDescriptor(regExpPrototype, "exec");
  return !!test && own(test, "value") && test.value === nativeRegExpTest
    && !!exec && own(exec, "value") && exec.value === nativeRegExpExec;
}

// Eligibility only; false selects the complete original reader. Descriptor
// inspection cannot invoke an accessor or Proxy trap. Mutable/exotic graphs are
// never classified as the closed decoded V2 data domain.
function eligible(expected) {
  if (!ordinaryTransportHooks()) return false;
  const done = new NativeWeakSet(), active = new NativeWeakSet(); let count = 0;
  function data(value, depth) {
    if (depth > 80) return false;
    if (value === null || typeof value === "string" || typeof value === "boolean") return true;
    if (typeof value === "number") return finite(value) && (!integer(value) || safeInteger(value));
    if (!value || typeof value !== "object" || isProxy(value)) return false;
    if (apply(weakHas, done, [value])) return true;
    if (apply(weakHas, active, [value]) || ++count > MAX_OBJECTS) return false;
    const array = isArray(value), prototype = getPrototype(value);
    if (!(array ? prototype === arrayPrototype : prototype === objectPrototype || prototype === null)
      || !frozen(value) || getSymbols(value).length || own(value, "toJSON")) return false;
    const keys = getKeys(value), descriptors = getDescriptors(value);
    if (getNames(value).length !== keys.length + (array ? 1 : 0)
      || array && keys.length !== descriptors.length.value) return false;
    apply(weakAdd, active, [value]);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i], descriptor = descriptors[key];
      if (array && key !== "" + i || !own(descriptor, "value")
        || !data(descriptor.value, depth + 1)) return false;
    }
    apply(weakDelete, active, [value]); apply(weakAdd, done, [value]); return true;
  }
  // The extra probes must not call a replaced array method/getter. Such methods
  // keep the original reader, rather than silently altering their effects.
  for (let i = 0; i < arrayMethods.length; i++) {
    const pair = arrayMethods[i], descriptor = propertyDescriptor(arrayPrototype, pair[0]);
    if (!descriptor || !own(descriptor, "value") || descriptor.value !== pair[1]) return false;
  }
  const randomDescriptor = propertyDescriptor(crypto, "randomBytes");
  const prototypeDescriptor = propertyDescriptor(NativeBuffer, "prototype");
  if (!prototypeDescriptor || !own(prototypeDescriptor, "value")
    || prototypeDescriptor.value !== nativeBufferPrototype) return false;
  const stringDescriptor = propertyDescriptor(nativeBufferPrototype, "toString");
  const hexDescriptor = propertyDescriptor(nativeBufferPrototype, "hexSlice");
  if (!randomDescriptor || !own(randomDescriptor, "value") || randomDescriptor.value !== nativeRandomBytes
    || !stringDescriptor || !own(stringDescriptor, "value") || stringDescriptor.value !== nativeBufferToString
    || !hexDescriptor || !own(hexDescriptor, "value") || hexDescriptor.value !== nativeHexSlice) return false;
  const currentBufferDescriptor = propertyDescriptor(globalThis, "Buffer");
  if (!currentBufferDescriptor || !bufferGlobalDescriptor) return false;
  const descriptorFields = ["value", "get", "set", "writable", "enumerable", "configurable"];
  for (let i = 0; i < descriptorFields.length; i++) {
    const key = descriptorFields[i], present = own(bufferGlobalDescriptor, key);
    if (own(currentBufferDescriptor, key) !== present
      || present && currentBufferDescriptor[key] !== bufferGlobalDescriptor[key]) return false;
  }
  // Only this added transport-domain proof is reused. A successful graph has
  // frozen own data properties, frozen reachable objects and fixed ordinary
  // prototype identities; its values cannot later acquire a Proxy/accessor or
  // mutate. Global transport hooks/intrinsics above are still checked on every
  // call, as are the source shape/IDs below and every original caller guard.
  // One weak root cannot retain a large input beyond its caller's lifetime.
  // A collected proof simply performs the complete original data scan again.
  // Neither negative results nor database data is cached.
  const previous = lastPositiveExpected === null ? undefined : apply(weakDeref, lastPositiveExpected, []);
  if (previous === undefined || expected !== previous) {
    if (!data(expected, 0)) return false;
  }
  const descriptors = getDescriptors(expected);
  if (!own(descriptors, "documents") || !own(descriptors, "knowledgeObjects")) return false;
  const documents = descriptors.documents.value, kos = descriptors.knowledgeObjects.value;
  if (!isArray(documents) || documents.length !== 874 || !isArray(kos) || kos.length !== 500) return false;
  // Storage calls this helper only AFTER original C.validateSources(expected).
  // Still require own data IDs/uniqueness in the positive transport domain:
  // no inherited .id access or invalid-input-only new RPC is introduced.
  const lists = [documents, kos];
  for (let i = 0; i < lists.length; i++) {
    const rows = lists[i], seen = new NativeSet();
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      if (!row || typeof row !== "object") return false;
      const idDescriptor = propertyDescriptor(row, "id");
      if (!idDescriptor || !own(idDescriptor, "value") || !validId(idDescriptor.value)
        || apply(setHas, seen, [idDescriptor.value])) return false;
      apply(setAdd, seen, [idDescriptor.value]);
    }
  }
  lastPositiveExpected = new NativeWeakRef(expected);
  return true;
}

function selector(expected) {
  if (!eligible(expected)) return null;
  const documents = apply(nativeArrayMap, expected.documents, [row => propertyDescriptor(row, "id").value]);
  const knowledgeObjects = apply(nativeArrayMap, expected.knowledgeObjects, [row => propertyDescriptor(row, "id").value]);
  // Probe only in the immutable data domain. Invalid IDs fall back BEFORE any
  // RPC so the original documents-before-KO ID/read-error order is retained.
  if (!apply(nativeArrayEvery, documents, [validId])
    || !apply(nativeArrayEvery, knowledgeObjects, [validId])) return null;
  apply(nativeArraySort, documents, []); apply(nativeArraySort, knowledgeObjects, []);
  const bytes = apply(nativeRandomBytes, crypto, [16]);
  // No new Buffer.toString/hexSlice callback is executed. Native buffer indices
  // and primitive-string indices provide the fixed32hex nonce directly.
  const hex = "0123456789abcdef"; let nonce = "";
  for (let i = 0; i < 16; i++) nonce += hex[bytes[i] >> 4] + hex[bytes[i] & 15];
  return { nonce, documents, knowledgeObjects };
}

function exact(value, keys) {
  if (!value || typeof value !== "object" || isArray(value)) return false;
  const actual = getKeys(value);
  if (actual.length !== keys.length) return false;
  for (let i = 0; i < keys.length; i++) if (!own(value, keys[i])) return false;
  return true;
}
function validateEnvelope(envelope, nonce) {
  if (!ordinaryTransportHooks()) fail();
  if (!exact(envelope, ["version", "readNonce", "caller", "readOnly", "snapshot",
    "statementAtUTC", "codec", "documents", "knowledgeObjects"])
    || envelope.version !== VERSION || envelope.readNonce !== nonce
    || envelope.caller !== "service_role" || envelope.readOnly !== "on"
    || typeof envelope.snapshot !== "string" || !/^\d+:\d+:(?:\d+(?:,\d+)*)?$/.test(envelope.snapshot)
    || typeof envelope.statementAtUTC !== "string"
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(envelope.statementAtUTC)
    || !finite(nativeDateParse(envelope.statementAtUTC))
    || !exact(envelope.codec, ["serverVersionNum", "timeZone", "dateStyle", "extraFloatDigits", "clientEncoding", "serverEncoding"])
    || !isArray(envelope.documents) || envelope.documents.length > 9
    || !isArray(envelope.knowledgeObjects) || envelope.knowledgeObjects.length > 5) fail();
  const codecFields = ["serverVersionNum", "timeZone", "dateStyle", "extraFloatDigits", "clientEncoding", "serverEncoding"];
  for (let i = 0; i < codecFields.length; i++) {
    const value = envelope.codec[codecFields[i]];
    if (typeof value !== "string" || value.length === 0) fail();
  }
  // Native SQL caps the entire scalar JSONB::text response before return. This
  // is an additional parsed-value bound, NOT a replacement for the transport's
  // maxResponseBytes limit before JSON.parse. Missing batches remain for the
  // original batch guard to reject with its original first error.
  if (apply(nativeByteLength, NativeBuffer, [stringify(envelope), "utf8"]) > MAX_RESPONSE_BYTES) fail();
  return envelope;
}

async function readSelected(selected, request) {
  if (typeof request !== "function") fail();
  const envelope = await request(ENDPOINT, { method: "POST", headers: { "Cache-Control": "no-store" },
    body: stringify({ p_document_ids: selected.documents, p_knowledge_object_ids: selected.knowledgeObjects,
      p_read_nonce: selected.nonce }), maxResponseBytes: MAX_RESPONSE_BYTES });
  // No retry/fallback after an RPC attempt. All current native/shape/hash checks
  // still run on these rows at their original storage/adapter boundaries.
  return validateEnvelope(envelope, selected.nonce);
}

function readBatches(expected, request) {
  const selected = selector(expected);
  // Synchronous null is essential: the legacy reader must not gain an await
  // and allow a mutable input to change before its original ID snapshot.
  return selected ? readSelected(selected, request) : null;
}

module.exports = { VERSION, RPC_NAME, ENDPOINT, MAX_RESPONSE_BYTES, eligible, readBatches, validateEnvelope };
