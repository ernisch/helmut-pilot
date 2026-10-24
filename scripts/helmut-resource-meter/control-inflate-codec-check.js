"use strict";

// Focused, synthetic codec differential test. No HTTP, SQL, Auth fixtures or RSS claim.
// Root runs this separately; VM evaluation appends a test-only private-function export.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const zlib = require("node:zlib");

const ROOT = path.resolve(__dirname, "../..");
const BASELINE = path.join(ROOT, "scripts/helmut-resource-meter/control-inflate-native-launcher/BEFORE_U.js");
const CANDIDATE = path.join(ROOT, "scripts/helmut-resource-meter/control-inflate-native-launcher/AFTER_U.js");
const PINS = {
  baseline: "93917a57bf8714baea2a21a7ed06fbc6aeb2cd8081f54093b70b7134d0a31c3b",
  candidate: "40d7e584e7856ea893a491d0598ca55b071fc9a07d2dfeb72d55cd10b14b9d1a"
};
const CAP = 2 * 1024 * 1024, SINGLE_LIMIT = 8 * 1024 * 1024;
const LOGICAL_LIMIT = 256 * 1024 * 1024;
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const own = (value, key) => Object.hasOwn(value, key);
const append = '\nObject.defineProperty(module.exports,"__codecTestOnly",' +
  '{enumerable:false,value:cachedControlText});\n';

// Stubs only provide constants read by this private codec. No other U path is invoked.
// Read the actual declaration to bind the stub to the unchanged Parts logical limit.
const partsSource = fs.readFileSync(path.join(ROOT, "lib/helmut/auth-state-parts.js"), "utf8");
assert.match(partsSource, /const MAX_UNIQUE_BYTES = 32 \* 1024 \* 1024, MAX_EXPANDED_BYTES = 256 \* 1024 \* 1024;/);
assert.equal(process.version, "v24.19.0", "concat stack proof is bound to the reviewed actual Node runtime");

function loadCodec(label, filename) {
  const source = fs.readFileSync(filename, "utf8");
  assert.equal(sha(source), PINS[label], label + " exact source pin");
  const exports = {}, module = { exports }, optionsSeen = [];
  const allowed = name => {
    if (name === "node:crypto") return crypto;
    if (name === "node:zlib") return {
      deflateRawSync: zlib.deflateRawSync,
      inflateRawSync(input, options) {
        // Scalar observations only: never retain the encoded input, result or options object.
        optionsSeen.push({ maxOutputLength: options.maxOutputLength, info: options.info,
          hasChunkSize: own(options, "chunkSize"), chunkSize: options.chunkSize });
        return zlib.inflateRawSync(input, options);
      }
    };
    if (name === "./auth-store-cas") return Object.freeze({ REVISION: "_authStoreRevision" });
    if (name === "./synthetik-500-eu-service-contract") return Object.freeze({});
    if (name === "./auth-state-parts") return Object.freeze({ MAX_EXPANDED_BYTES: LOGICAL_LIMIT });
    throw new Error("unexpected sandbox dependency: " + name);
  };
  const context = vm.createContext({ module, exports, require: allowed, Buffer, TextDecoder },
    { name: "isolated-" + label + "-control-codec", codeGeneration: { strings: false, wasm: false } });
  new vm.Script(source + append, { filename: path.join(ROOT, "lib/helmut/llm-usage-atomic.js") }).runInContext(context, { timeout: 1000 });
  assert.equal(typeof module.exports.__codecTestOnly, "function");
  return { label, decode: module.exports.__codecTestOnly, optionsSeen };
}

const baseline = loadCodec("baseline", BASELINE), candidate = loadCodec("candidate", CANDIDATE);
const originalConcat = Buffer.concat;
let active = null;
function observeConcat(...args) {
  const observation = active;
  // Line500 is the exact final output concat in the pinned actual embedded zlib source.
  const nativeOutput = observation !== null && /^\s*at processChunkSync \(node:zlib:500:\d+\)$/m.test(new Error().stack || "");
  if (nativeOutput) observation.matchedCalls++;
  // Exactly one original call, unchanged arguments, receiver and return value.
  const value = Reflect.apply(originalConcat, this, args);
  if (nativeOutput) {
    observation.originalInvocations++;
    observation.outputBytes += value.byteLength;
  }
  return value;
}

function textFixture(bytes) {
  const base = JSON.stringify({
    synthetik500DispatchJournal: { unicode: "Grüße 漢字 🚦", escaped: "quote\" slash\\ newline\n", values: [true, false, null, -17, 3.25] },
    synthetik500KostenAdmission: { count: 19, nested: { ready: true, names: ["ä", "Ω", "😀"] } },
    testKostenAuftrag: { scope: "SYNTHETIC_CODEC_ONLY", versions: [1, 2, 3] },
    testKostenTage: { mixed: [0, "text", { absent: null }], padding: "" }
  });
  const suffix = '"}}';
  assert(base.endsWith(suffix));
  const prefix = base.slice(0, -suffix.length), remaining = bytes - Buffer.byteLength(prefix + suffix);
  assert(remaining > 0);
  const pattern = "synthetic0123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ-abcdefghijklmnopqrstuvwxyz_";
  const padding = pattern.repeat(Math.ceil(remaining / pattern.length)).slice(0, remaining);
  const text = prefix + padding + suffix;
  assert.equal(Buffer.byteLength(text), bytes);
  assert.equal(JSON.parse(text).testKostenTage.padding.length, remaining);
  return text;
}
function cacheFromRaw(raw) {
  const encoded = zlib.deflateRawSync(raw);
  assert(encoded.length > 0 && encoded.length <= CAP, "synthetic fixture fits the unchanged encoded cap");
  return Object.freeze({ encoded, bytes: encoded.length, textBytes: raw.length, textSHA256: sha(raw) });
}
function change(cache, delta) { return Object.freeze({ ...cache, ...delta }); }
function capture(codec, cache) {
  assert.equal(active, null);
  const observation = { matchedCalls: 0, originalInvocations: 0, outputBytes: 0 };
  const initial = codec.optionsSeen.length;
  active = observation;
  try {
    return { ok: true, text: codec.decode(cache), observation,
      options: codec.optionsSeen.slice(initial) };
  } catch (error) {
    return { ok: false, error: { name: String(error.name), code: error.code === undefined ? null : String(error.code) },
      observation, options: codec.optionsSeen.slice(initial) };
  } finally { active = null; }
}
function assertOptions(result, arm, cache, beforeInflate) {
  assert.equal(result.options.length, beforeInflate ? 0 : 1, arm + " no retry or unexpected inflate");
  assert.equal(result.observation.originalInvocations, result.observation.matchedCalls);
  if (beforeInflate) {
    assert.equal(result.observation.matchedCalls, 0);
    return;
  }
  const options = result.options[0], single = arm === "candidate" && cache.textBytes <= SINGLE_LIMIT;
  assert.equal(options.maxOutputLength, cache.textBytes, arm + " unchanged output cap");
  assert.equal(options.info, true, arm + " consumed-input guard retains info:true");
  assert.equal(options.hasChunkSize, single, arm + " exact bounded selection");
  assert.equal(options.chunkSize, single ? cache.textBytes + 1 : undefined);
}
const rows = [];
function valid(bytes) {
  const expected = textFixture(bytes), cache = cacheFromRaw(Buffer.from(expected, "utf8"));
  const old = capture(baseline, cache), next = capture(candidate, cache);
  assertOptions(old, "baseline", cache, false); assertOptions(next, "candidate", cache, false);
  assert.equal(old.ok, true, "baseline valid fixture"); assert.equal(next.ok, true, "candidate valid fixture");
  assert.equal(old.text, expected); assert.equal(next.text, expected); assert.equal(sha(old.text), sha(next.text));
  assert.equal(old.observation.matchedCalls, 1, "baseline exact processChunkSync output concat");
  assert.equal(old.observation.outputBytes, bytes);
  const optimized = bytes <= SINGLE_LIMIT;
  assert.equal(next.observation.matchedCalls, optimized ? 0 : 1,
    optimized ? "single output buffer avoids full output concat" : "larger view retains legacy concat");
  assert.equal(next.observation.outputBytes, optimized ? 0 : bytes);
  rows.push({ case: "valid-" + bytes, utf8Bytes: bytes, outputHashEqual: true,
    baselineOutputConcat: old.observation.matchedCalls, candidateOutputConcat: next.observation.matchedCalls,
    explicitExtraOutputCopyAvoided: optimized });
}
function rejected(label, cache, beforeInflate = false, expectedCode = null) {
  const old = capture(baseline, cache), next = capture(candidate, cache);
  assertOptions(old, "baseline", cache, beforeInflate); assertOptions(next, "candidate", cache, beforeInflate);
  assert.equal(old.ok, false, label + " baseline must reject");
  assert.equal(next.ok, false, label + " candidate must reject");
  // Malformed compressed streams can encounter native zlib errors in a different order
  // with a larger output chunk. Require fail-closed, not identical native error codes.
  // The existing explicit Auth guards and fatal UTF-8 rejection remain exact.
  if (expectedCode !== null) {
    assert.equal(old.error.code, expectedCode); assert.equal(next.error.code, expectedCode);
    assert.deepEqual(next.error, old.error, label + " same explicit guard rejection");
  }
  rows.push({ case: label, rejectedByBoth: true, beforeInflate,
    exactGuardErrorRequired: expectedCode !== null, baselineError: old.error, candidateError: next.error });
}

try {
  assert.equal(Buffer.concat, originalConcat);
  Buffer.concat = observeConcat;
  for (const bytes of [CAP + 1, 4856607, SINGLE_LIMIT, SINGLE_LIMIT + 1]) valid(bytes);

  const text = textFixture(CAP + 1), raw = Buffer.from(text, "utf8"), cache = cacheFromRaw(raw);
  const trailing = originalConcat([cache.encoded, Buffer.from([0x61, 0x62, 0x63])]);
  rejected("trailing-junk", change(cache, { encoded: trailing, bytes: trailing.length }), false, "AUTH_CONTROL_CACHE_INVALID");
  const truncated = cache.encoded.subarray(0, Math.floor(cache.encoded.length / 2));
  rejected("truncated-deflate", change(cache, { encoded: truncated, bytes: truncated.length }));
  const invalidUTF8 = Buffer.from(raw); invalidUTF8[0] = 0xff;
  rejected("invalid-utf8-with-matching-sha", cacheFromRaw(invalidUTF8), false, "ERR_ENCODING_INVALID_ENCODED_DATA");
  // Keep both +/-1 length corruptions away from the optimized band's lower boundary.
  const longer = cacheFromRaw(Buffer.from(textFixture(4856607), "utf8"));
  rejected("wrong-declared-length-short", change(longer, { textBytes: longer.textBytes - 1 }));
  rejected("wrong-declared-length-long", change(longer, { textBytes: longer.textBytes + 1 }), false, "AUTH_CONTROL_CACHE_INVALID");
  rejected("wrong-content-digest", change(cache, { textSHA256: "0".repeat(64) }), false, "AUTH_CONTROL_CACHE_INVALID");
  const oversized = Buffer.alloc(CAP + 1);
  rejected("encoded-cap-overflow", change(cache, { encoded: oversized, bytes: oversized.length }), true, "AUTH_CONTROL_CACHE_INVALID");
  rejected("encoded-length-mismatch", change(cache, { bytes: cache.bytes + 1 }), true, "AUTH_CONTROL_CACHE_INVALID");
  rejected("compressed-logical-lower-bound", change(cache, { textBytes: CAP }), true, "AUTH_CONTROL_CACHE_INVALID");
  rejected("logical-upper-bound", change(cache, { textBytes: LOGICAL_LIMIT + 1 }), true, "AUTH_CONTROL_CACHE_INVALID");
} finally {
  active = null;
  Buffer.concat = originalConcat;
}
assert.equal(Buffer.concat, originalConcat, "observer always restored");
assert.equal(rows.length, 14);
process.stdout.write(JSON.stringify({ schema: "helmut-control-inflate-codec-differential/1", pass: true,
  nodeVersion: process.version, baselineSourceSHA256: PINS.baseline, candidateSourceSHA256: PINS.candidate,
  cases: rows, syntheticOnly: true, noRPC: true, noDatabase: true,
  observer: "passive exact node:zlib:500 processChunkSync Buffer.concat; one unchanged original call",
  proofScope: "Extra whole-output concat avoided only for the selected bounded band; no RSS/shared-RAM saving or leak-cause claim." }) + "\n");
