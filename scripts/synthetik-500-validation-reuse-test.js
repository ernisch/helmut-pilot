"use strict";
// Focused offline mutation checks for invocation-local immutable reuse.
const assert = require("node:assert/strict");
const KO = require("../lib/helmut/knowledge-object-version");
const P = require("../lib/helmut/synthetik-500-profile");
const C = require("../lib/helmut/synthetik-500-production-command");
const E = require("../lib/helmut/synthetik-500-executor");
const Streaming = require("../lib/helmut/streaming-canonical-hash");
const crypto = require("node:crypto");
const B = require("../lib/helmut/briefing-speicher");
const noNetwork = () => { throw Error("offline-reuse-test-network-forbidden"); };
global.fetch = require("node:https").request = require("node:http").request = noNetwork;
function freeze(value, seen = new WeakSet()) {
  if (value && typeof value === "object" && !seen.has(value)) {
    seen.add(value); Object.values(value).forEach(x => freeze(x, seen)); Object.freeze(value);
  }
  return value;
}
let checks = 0;
const check = (name, test) => { test(); checks++; console.log("PASS " + name); };
check("every alias path retains the80-level depth ceiling", () => {
  const common = freeze({ child: { value: "same bytes" } });
  const nested = count => { let x = common; for (let i = 0; i < count; i++) x = freeze([x]); return x; };
  KO.jsonValue([common, nested(77)]);
  assert.throws(() => KO.jsonValue([common, nested(78)]), /json-tiefe/);
});
check("frozen parents do not cache mutable descendants", () => {
  const child = { value: 1 }, wrapper = Object.freeze({ child });
  const trigger = new Proxy({}, { ownKeys() { child.value = NaN; return []; } });
  assert.throws(() => KO.jsonValue([wrapper, trigger, wrapper]), /json-zahl/);
  child.value = 1; KO.jsonValue(wrapper); child.value = Infinity;
  assert.throws(() => KO.jsonValue(wrapper), /json-zahl/);
});
check("proxy metadata is read anew for each alias", () => {
  let reads = 0;
  const proxy = new Proxy(Object.freeze({ value: 1 }), {
    getOwnPropertyDescriptor(target, key) { reads++; return Reflect.getOwnPropertyDescriptor(target, key); }
  });
  KO.jsonValue([proxy, proxy]); assert(reads >= 4);
});
check("proxy fallback retains original metadata evaluation counts", () => {
  for (const [target, expectedKeys, expectedPrototypes] of [[{ value: 1 }, 3, 1], [[1], 4, 0]]) {
    let keys = 0, prototypes = 0;
    const proxy = new Proxy(target, {
      ownKeys(value) { keys++; return Reflect.ownKeys(value); },
      getPrototypeOf(value) { prototypes++; return Reflect.getPrototypeOf(value); }
    });
    KO.jsonValue(proxy); assert.equal(keys, expectedKeys); assert.equal(prototypes, expectedPrototypes);
  }
});
check("accessors sparse arrays cycles toJSON symbols and unsafe scalars reject", () => {
  let getterRuns = 0;
  const accessor = Object.freeze(Object.defineProperty({}, "value", { enumerable: true, get() { getterRuns++; return 1; } }));
  assert.throws(() => KO.jsonValue([accessor, accessor]), /json-accessor/); assert.equal(getterRuns, 0);
  const cycle = {}; cycle.self = cycle; Object.freeze(cycle);
  for (const value of [cycle, Array(1), { toJSON: null }, { [Symbol("hidden")]: 1 }, NaN, Infinity, 2 ** 53, new Date()])
    assert.throws(() => KO.jsonValue(value));
});
check("scoped preimages preserve the existing canonical domain and mutable fallback", () => {
  const oldHash = value => crypto.createHash("sha256").update(P.kanonisch(value)).digest("hex");
  Streaming.withImmutableInvocation(() => {
    for (const value of [freeze({ z: "ä😀", a: [null, true, 3.5] }), { missing: undefined },
      [undefined, , "x"], new Date("2026-10-11"), new Uint8Array([1, 2]), Infinity, 2 ** 53])
      assert.equal(P.hash(value), oldHash(value));
    const mutable = { value: 1 }; assert.equal(P.hash(mutable), oldHash(mutable));
    mutable.value = 2; assert.equal(P.hash(mutable), oldHash(mutable));
    const getter = () => { let reads = 0; return { get a() { return "x".repeat(70000) + ++reads; }, get b() { return reads; } }; };
    assert.equal(P.hash(getter()), oldHash(getter()));
  });
});
check("scope state restores on reentry exception and Promise return", () => {
  const sample = freeze({ shared: [{ text: "unchanged" }] });
  assert.equal(Streaming.immutableInvocationData(sample), false);
  Streaming.withImmutableInvocation(() => {
    P.hash(sample); assert.equal(Streaming.immutableInvocationData(sample), true);
    Streaming.withImmutableInvocation(() => {
      assert.equal(Streaming.immutableInvocationData(sample), false); P.hash(sample);
      assert.equal(Streaming.immutableInvocationData(sample), true);
    });
    assert.equal(Streaming.immutableInvocationData(sample), true);
    assert.throws(() => Streaming.withImmutableInvocation(() => { P.hash(sample); throw Error("scope-stop"); }), /scope-stop/);
    assert.equal(Streaming.immutableInvocationData(sample), true);
  });
  assert.equal(Streaming.immutableInvocationData(sample), false);
  const promise = Streaming.withImmutableInvocation(() => { P.hash(sample); return Promise.resolve(); });
  assert(promise instanceof Promise); assert.equal(Streaming.immutableInvocationData(sample), false);
});
check("accepted legacy prototypes keep uncached canonical semantics", () => {
  const array = Object.freeze(Object.setPrototypeOf(["same"], Object.prototype));
  const object = Object.freeze(Object.setPrototypeOf({ value: "same" }, Array.prototype));
  const original = Object.getOwnPropertyDescriptors;
  let arrayReads = 0, objectReads = 0;
  Object.getOwnPropertyDescriptors = value => {
    if (value === array) arrayReads++; if (value === object) objectReads++;
    return original(value);
  };
  try {
    KO.jsonValue([array, array]); assert(arrayReads >= 2);
    Streaming.withImmutableInvocation(() => {
      for (const value of [array, object]) {
        const expected = crypto.createHash("sha256").update(value === array ? '["same"]' : P.kanonisch(value)).digest("hex");
        assert.equal(P.hash(value), expected); assert.equal(P.hash(value), expected);
      }
    });
    assert(arrayReads >= 4); assert(objectReads >= 2);
  } finally { Object.getOwnPropertyDescriptors = original; }
});
check("legacy nonindex array keys remain accepted without alias memo", () => {
  const array = [1]; delete array[0]; array.other = 1; Object.freeze(array);
  const original = Object.getOwnPropertyDescriptors; let reads = 0;
  Object.getOwnPropertyDescriptors = value => { if (value === array) reads++; return original(value); };
  try { KO.jsonValue([array, array]); assert(reads >= 2); }
  finally { Object.getOwnPropertyDescriptors = original; }
});
const normalized = value => {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(k => [k, normalized(value[k])]));
  return value;
};
const oldB = value => crypto.createHash("sha256").update(JSON.stringify(normalized(value))).digest("hex");
check("B domain remains exact for numeric keys Unicode and shared full bytes", () => {
  const indexed = freeze({ "10": "ten", "2": "two", "01": "padded", "-0": "signed", "4294967294": "last-index",
    "4294967295": "nonindex", text: "ä😀\ud800" });
  const common = freeze({ text: "ä😀\ud800".repeat(1000), values: [null, true, -0, 3.5] });
  const large = freeze(Array.from({ length: 100 }, () => common));
  Streaming.withImmutableInvocation(() => {
    for (const value of [indexed, large, freeze(Object.assign(Object.create(null), { a: 1 }))]) {
      P.hash(value); assert.equal(Streaming.immutableInvocationData(value), true);
      assert.equal(B.hash(value), oldB(value)); assert.equal(B.hash(value), oldB(value));
    }
    assert.notEqual(B.hash(indexed), P.hash(indexed));
  });
});
check("B unsafe fallback preserves legacy values and proxy getter counts", () => {
  const outcome = operation => { try { return ["value", operation()]; } catch (error) { return ["error", error.name, error.message]; } };
  Streaming.withImmutableInvocation(() => {
    for (const value of [{ missing: undefined }, [undefined, , Symbol("s")], new Date(), new Uint8Array([1, 2]),
      NaN, Infinity, 2 ** 53, undefined, Symbol("root"), () => 1]) assert.deepEqual(outcome(() => B.hash(value)), outcome(() => oldB(value)));
    const run = hash => { let reads = 0; const proxy = new Proxy({ get a() { reads++; return "value"; } }, {
      ownKeys(target) { reads++; return Reflect.ownKeys(target); }
    }); return { hash: hash(proxy), reads }; };
    assert.deepEqual(run(B.hash), run(oldB));
  });
});
check("temporary proof and container overrides cannot mint immutable markers", () => {
  const mutable = { child: { value: 1 } }, beforeFrozen = Object.isFrozen, beforeHas = WeakSet.prototype.has;
  Streaming.withImmutableInvocation(() => {
    try { Object.isFrozen = () => true; P.hash(mutable); } finally { Object.isFrozen = beforeFrozen; }
    assert.equal(Streaming.immutableInvocationData(mutable), false);
    try { WeakSet.prototype.has = () => true; assert.equal(Streaming.immutableInvocationData(mutable), false); }
    finally { WeakSet.prototype.has = beforeHas; }
    assert.equal(B.hash(mutable), oldB(mutable)); mutable.child.value = 2;
    assert.equal(B.hash(mutable), oldB(mutable));
  });
  const child = { value: 1 }, wrapper = Object.freeze({ child });
  const trigger = new Proxy({}, { ownKeys() { child.value = NaN; return []; } });
  try { Object.isFrozen = () => true; assert.throws(() => KO.jsonValue([wrapper, trigger, wrapper]), /json-zahl/); }
  finally { Object.isFrozen = beforeFrozen; }
});
check("current JSON dependencies cannot contaminate P or B preimages", () => {
  const value = freeze({ a: ["same", { text: "😀" }] }), stringify = JSON.stringify;
  Streaming.withImmutableInvocation(() => {
    P.hash(value); const expectedP = P.hash(value), expectedB = B.hash(value);
    try {
      JSON.stringify = value => stringify(value) + " ";
      assert.equal(P.hash(value), crypto.createHash("sha256").update(P.kanonisch(value)).digest("hex"));
      assert.equal(B.hash(value), oldB(value));
    } finally { JSON.stringify = stringify; }
    assert.equal(P.hash(value), expectedP); assert.equal(B.hash(value), expectedB);
  });
});
check("B inherited toJSON and builtin getters use exact old fallback", () => {
  const sample = freeze({ a: ["same"] }), beforeMap = Object.getOwnPropertyDescriptor(Array.prototype, "map");
  Streaming.withImmutableInvocation(() => {
    P.hash(sample);
    let reads = 0;
    Object.defineProperty(Object.prototype, "toJSON", { configurable: true, get() { reads++; return undefined; } });
    try {
      const actual = B.hash(sample), actualReads = reads; reads = 0;
      assert.equal(actual, oldB(sample)); assert.equal(actualReads, reads);
    } finally { delete Object.prototype.toJSON; }
    Object.defineProperty(Array.prototype, "map", { configurable: true, get() { reads++; return beforeMap.value; } });
    try {
      reads = 0; const actual = B.hash(sample), actualReads = reads; reads = 0;
      assert.equal(actual, oldB(sample)); assert.equal(actualReads, reads);
    } finally { Object.defineProperty(Array.prototype, "map", beforeMap); }
  });
});
check("private proof containers and scope cannot be obtained through replacements", () => {
  const sample = freeze({ value: "safe" }), mutable = { value: "mutable" };
  const beforeFreeze = Object.freeze, beforeMap = WeakMap, beforeSet = WeakSet;
  const beforeMapHas = WeakMap.prototype.has, beforeMapGet = WeakMap.prototype.get;
  let captures = 0;
  try {
    Object.freeze = value => { captures++; return value; };
    globalThis.WeakMap = function() { throw Error("foreign-weak-map"); };
    globalThis.WeakSet = function() { throw Error("foreign-weak-set"); };
    Streaming.withImmutableInvocation(() => assert.equal(Streaming.immutableInvocationData(mutable), false));
    assert.equal(captures, 0);
  } finally { Object.freeze = beforeFreeze; globalThis.WeakMap = beforeMap; globalThis.WeakSet = beforeSet; }
  Streaming.withImmutableInvocation(() => {
    P.hash(sample); assert.equal(Streaming.immutableInvocationData(sample), true);
    try {
      WeakMap.prototype.has = () => true; WeakMap.prototype.get = () => "forged";
      assert.equal(B.hash(sample), oldB(sample)); assert.equal(Streaming.immutableInvocationData(mutable), false);
    } finally { WeakMap.prototype.has = beforeMapHas; WeakMap.prototype.get = beforeMapGet; }
  });
});
check("KO memo adds no mutable Math hook and retains depth after drift", () => {
  const before = Math.max; let calls = 0;
  try { Math.max = () => { calls++; return 0; }; KO.jsonValue(freeze({ a: { b: 1 } })); assert.equal(calls, 0); }
  finally { Math.max = before; }
  let deep = freeze({ value: 1 }); for (let i = 0; i < 80; i++) deep = freeze({ child: deep });
  assert.throws(() => KO.jsonValue(deep), /json-tiefe/);
});
check("hash callbacks never obtain scoped private Buffer preimages", () => {
  const sample = freeze({ text: "😀".repeat(1000) }), before = crypto.createHash;
  Streaming.withImmutableInvocation(() => {
    P.hash(sample); const pExpected = P.hash(sample), bExpected = B.hash(sample); let buffers = 0;
    crypto.createHash = function(...args) {
      const digest = before(...args), update = digest.update;
      digest.update = function(value, ...rest) { if (Buffer.isBuffer(value)) { buffers++; value.fill(0); } return update.call(this, value, ...rest); };
      return digest;
    };
    try { assert.equal(P.hash(sample), pExpected); assert.equal(B.hash(sample), bExpected); assert.equal(buffers, 0); }
    finally { crypto.createHash = before; }
    assert.equal(P.hash(sample), pExpected); assert.equal(B.hash(sample), bExpected);
  });
});
check("changed native Hash prototype link receives only original string fallback", () => {
  const sample = freeze({ text: "😀\ud800".repeat(1000) }), before = crypto.Hash.prototype;
  Streaming.withImmutableInvocation(() => {
    P.hash(sample); const pExpected = P.hash(sample), bExpected = B.hash(sample); let buffers = 0;
    const replacement = Object.create(before);
    replacement.update = function(value, ...rest) {
      if (Buffer.isBuffer(value)) { buffers++; value.fill(0); }
      return before.update.call(this, value, ...rest);
    };
    crypto.Hash.prototype = replacement;
    try { assert.equal(P.hash(sample), pExpected); assert.equal(B.hash(sample), bExpected); assert.equal(buffers, 0); }
    finally { crypto.Hash.prototype = before; }
    assert.equal(P.hash(sample), pExpected); assert.equal(B.hash(sample), bExpected);
  });
});
check("separate Buffer budgets retain every byte after many unique chunks", () => {
  const unique = freeze(Array.from({ length: 700 }, (_, i) => ({ i, text: ("😀" + i + "\ud800").repeat(3000) })));
  const values = freeze([...unique, ...unique]);
  const chunks = unique.map(value => Buffer.byteLength(JSON.stringify(normalized(value))));
  assert(chunks.every(bytes => bytes < 64 * 1024));
  assert(chunks.reduce((total, bytes) => total + bytes, 0) > 16 * 1024 * 1024);
  Streaming.withImmutableInvocation(() => {
    P.hash(values);
    assert.equal(B.hash(values), oldB(values)); assert.equal(B.hash(values), oldB(values));
    assert.equal(P.hash(values), crypto.createHash("sha256").update(P.kanonisch(values)).digest("hex"));
  });
});
check("large hot immutable parents retain exact UTF8 and separate numeric-key domains", () => {
  const shared = freeze({ "10": "ten", "2": "two", text: "😀\ud800ä".repeat(180000) });
  assert(Buffer.byteLength(JSON.stringify(shared)) > 64 * 1024);
  assert(Buffer.byteLength(JSON.stringify(shared)) < 4 * 1024 * 1024);
  const value = freeze({ first: shared, second: shared });
  Streaming.withImmutableInvocation(() => {
    assert.equal(Streaming.primeImmutableInvocation(value), true);
    assert.equal(P.hash(value), crypto.createHash("sha256").update(P.kanonisch(value)).digest("hex"));
    assert.equal(B.hash(value), oldB(value)); assert.equal(B.hash(shared), oldB(shared));
    assert.notEqual(P.hash(shared), B.hash(shared));
  });
});
check("priming proves data internally and cannot retain mutable or unsafe facts", () => {
  const mutable = { nested: { value: 1 } }, shared = freeze({ value: 1 });
  let traps = 0; const proxy = new Proxy({}, { ownKeys() { traps++; return []; } });
  assert.equal(Streaming.primeImmutableInvocation(shared), false);
  Streaming.withImmutableInvocation(() => {
    assert.equal(Streaming.primeImmutableInvocation({ shared, proxy }), false); assert.equal(traps, 0);
    assert.equal(Streaming.immutableInvocationData(shared), false);
    assert.equal(Streaming.primeImmutableInvocation(mutable), true); assert.equal(Streaming.immutableInvocationData(mutable), false);
    assert.equal(P.hash(mutable), crypto.createHash("sha256").update(P.kanonisch(mutable)).digest("hex"));
    mutable.nested.value = 2;
    assert.equal(P.hash(mutable), crypto.createHash("sha256").update(P.kanonisch(mutable)).digest("hex"));
    const before = Object.isFrozen; try {
      Object.isFrozen = () => true; assert.equal(Streaming.primeImmutableInvocation(mutable), false);
    } finally { Object.isFrozen = before; }
    assert.equal(Streaming.immutableInvocationData(mutable), false);
  });
});
check("oversized hot aliases stream full bytes without parent text reconstruction", () => {
  const shared = freeze({ text: "😀\ud800".repeat(600000) });
  assert(Buffer.byteLength(JSON.stringify(shared)) > 4 * 1024 * 1024);
  const value = freeze([shared, shared]);
  Streaming.withImmutableInvocation(() => {
    assert.equal(P.hash(value), crypto.createHash("sha256").update(P.kanonisch(value)).digest("hex"));
    assert.equal(B.hash(value), oldB(value)); assert.equal(B.hash(value), oldB(value));
  });
});
check("indexed prototype callbacks retain original fallback and cannot capture proof records", () => {
  const sample = freeze({ x: [1, 2], text: "unchanged" });
  for (const prototype of [Array.prototype, Object.prototype]) {
    let calls = 0, leaks = 0, actual, expected, actualCalls, expectedCalls;
    Object.defineProperty(prototype, "1", { configurable: true,
      get() { calls++; return "legacy-index"; }, set(value) {
        calls++; if (value && typeof value === "object") leaks++;
      } });
    try {
      Streaming.withImmutableInvocation(() => {
        assert.equal(Streaming.primeImmutableInvocation(sample), false);
        assert.equal(Streaming.immutableInvocationData(sample), false);
        actual = P.hash(sample); actualCalls = calls;
      });
      calls = 0; expected = P.hash(sample); expectedCalls = calls;
    } finally { delete prototype["1"]; }
    assert.equal(actual, expected); assert.equal(actualCalls, expectedCalls); assert.equal(leaks, 0);
  }
  const original = Object.getPrototypeOf(Array.prototype); let traps = 0;
  const proxy = new Proxy(original, { ownKeys() { traps++; return Reflect.ownKeys(original); } });
  Streaming.withImmutableInvocation(() => {
    Object.setPrototypeOf(Array.prototype, proxy);
    try { assert.equal(Streaming.primeImmutableInvocation(sample), false); assert.equal(traps, 0); }
    finally { Object.setPrototypeOf(Array.prototype, original); }
  });
});
check("named descriptor prototype getters cannot obtain owned graph state", () => {
  const shared = freeze({ value: "same" }), sample = freeze([shared, shared]);
  let calls = 0;
  Streaming.withImmutableInvocation(() => {
    for (const name of ["get", "set", "value", "writable"])
      Object.defineProperty(Object.prototype, name, { __proto__: null, configurable: true,
        get() { calls++; return undefined; } });
    let actual, expected;
    try { assert.equal(Streaming.primeImmutableInvocation(sample), true); actual = P.hash(sample); expected = oldB(sample); }
    finally { for (const name of ["get", "set", "value", "writable"]) delete Object.prototype[name]; }
    assert.equal(calls, 0); assert.equal(actual, expected);
  });
});
check("proof and scalar metadata capacities never leave partial immutable parents", () => {
  const tooMany = freeze(Array.from({ length: 200001 }, () => ({ value: 1 })));
  Streaming.withImmutableInvocation(() => {
    assert.equal(Streaming.primeImmutableInvocation(tooMany), false);
    assert.equal(Streaming.immutableInvocationData(tooMany[0]), false);
    assert.equal(P.hash(tooMany), crypto.createHash("sha256").update(P.kanonisch(tooMany)).digest("hex"));
  });
  const known = freeze(Array.from({ length: 100000 }, () => ({ value: 1 })));
  const newRows = freeze(Array.from({ length: 100001 }, () => ({ value: 2 })));
  const mixed = freeze([...known, ...newRows]);
  Streaming.withImmutableInvocation(() => {
    assert.equal(Streaming.primeImmutableInvocation(known), true);
    assert.equal(Streaming.primeImmutableInvocation(mixed), false);
    assert.equal(Streaming.immutableInvocationData(newRows[0]), false);
    assert.equal(P.hash(mixed), crypto.createHash("sha256").update(P.kanonisch(mixed)).digest("hex"));
  });
  const scalarFill = freeze(Array.from({ length: 200001 }, (_, i) => "scalar-cap-" + i));
  const later = freeze({ child: { value: 1 } });
  Streaming.withImmutableInvocation(() => {
    assert.equal(Streaming.primeImmutableInvocation(scalarFill), true);
    assert.equal(Streaming.immutableInvocationData(scalarFill), false);
    assert.equal(P.hash(later), crypto.createHash("sha256").update(P.kanonisch(later)).digest("hex"));
    assert.equal(Streaming.immutableInvocationData(later), false);
    assert.equal(Streaming.immutableInvocationData(later.child), false);
  });
});
const historicalPath = require.resolve("../lib/helmut/blocker2-d-historical-binding");
const historicalSource = require("node:fs").readFileSync(historicalPath, "utf8");
const Module = require("node:module"), historicalReview = new Module(historicalPath, module);
historicalReview.filename = historicalPath; historicalReview.paths = Module._nodeModulePaths(require("node:path").dirname(historicalPath));
historicalReview._compile(historicalSource + "\nmodule.exports.reviewSourcePairIndex = sourcePairIndex;\n", historicalPath);
const pairIndex = historicalReview.exports.reviewSourcePairIndex;
check("H private pair index keeps first match and exact unsafe fallback", () => {
  const sources = freeze({ "v|one": [{ id: "d" }], v: [{ id: "one|d" }] });
  const first = { vorgangId: "v|one", documentId: "d", url: "first" };
  const rows = [first, { ...first, url: "later" }, { vorgangId: "v", documentId: "one|d", url: "other" }];
  assert.equal(pairIndex(rows, sources, ["v|one", "v"]), null);
  Streaming.withImmutableInvocation(() => {
    P.hash(sources); const index = pairIndex(rows, sources, ["v|one", "v"]);
    assert.equal(index.get("v|one").get("d"), first); assert.equal(index.get("v").get("one|d"), rows[2]);
    let reads = 0; const unsafe = new Proxy(rows, { ownKeys(target) { reads++; return Reflect.ownKeys(target); } });
    assert.equal(pairIndex(unsafe, sources, ["v"]), null); assert.equal(reads, 0);
    const revoked = Proxy.revocable(rows, {}); revoked.revoke(); assert.equal(pairIndex(revoked.proxy, sources, ["v"]), null);
    const hidden = rows.slice(); Object.defineProperty(hidden, "find", { get() { reads++; return Array.prototype.find; } });
    assert.equal(pairIndex(hidden, sources, ["v"]), null); assert.equal(reads, 0);
    const coercion = { toString() { reads++; return "v"; } };
    assert.equal(pairIndex(rows, sources, [coercion]), null); assert.equal(reads, 0);
    const before = Object.getOwnPropertyDescriptor(Array.prototype, "find");
    Object.defineProperty(Array.prototype, "find", { configurable: true, get() { reads++; return before.value; } });
    try { assert.equal(pairIndex(rows, sources, ["v"]), null); assert.equal(reads, 0); }
    finally { Object.defineProperty(Array.prototype, "find", before); }
  });
});
const fixture = require("./fixtures/synthetik500-direct")();
const executor = E.vorbereite(fixture.package, fixture.executorInputs);
const command = { version: C.DIRECT_VERSION, mode: "D-R-500", package: fixture.package, executor,
  slot: fixture.executorInputs.kostenSlot, understanding: [], drafts: fixture.drafts,
  predecessors: fixture.predecessors, native: null, units: fixture.drafts.map(d => {
    const r = fixture.executorInputs.kostenSlot.plan.intents.find(x => x.phase === "R" && x.owner === d.profile.id);
    return { kind: "DR", subject: d.profile.id, intentIds: [d.intentId, r.id] };
  }) };
const frozenCommand = freeze(structuredClone(command));
check("full500 validation and canonical command hash remain exact", () => {
  assert.equal(command.drafts.length, 500); assert.equal(C.validate(command).commandHash, P.hash(command));
  assert.equal(C.validate(frozenCommand).commandHash, P.hash(command));
});
check("last owner and middle active-profile mutation are still checked", () => {
  for (const mutate of [x => { x.drafts[499].descriptor.owner = "different-owner"; },
    x => { x.drafts[249].profile.profileActive = false; }]) {
    const value = structuredClone(command); mutate(value); assert.throws(() => C.validate(freeze(value)));
  }
});
check("successful invocation cannot authorize later source or prototype drift", () => {
  const value = structuredClone(command); C.validate(value);
  value.drafts[0].sources.documents[0].title += " changed";
  assert.throws(() => C.validate(value), /context-drift/);
  const prototype = structuredClone(command); Object.setPrototypeOf(prototype.drafts[499].sources, Date.prototype);
  assert.throws(() => C.validate(prototype), /json-wert/);
});
check("hidden array callbacks cannot use a stale mutable-version index", () => {
  const value = structuredClone(command), rows = value.drafts[0].sources.documents;
  let calls = 0;
  Object.defineProperty(rows, "map", { get() {
    calls++;
    return function(callback) {
      value.executor.eingaben.kostenPlan.sourceVersions.documents[0].versionHash = "0".repeat(64);
      return Array.prototype.map.call(this, callback);
    };
  } });
  freeze(value.drafts[0].sources);
  assert.throws(() => C.validate(value), /context-drift/); assert(calls > 0);
  const symbol = structuredClone(command);
  Object.defineProperty(symbol.drafts[0].sources.documents, Symbol.iterator, { value: () => [][Symbol.iterator]() });
  assert.throws(() => C.validate(symbol), /json-symbol/);
});
check("unsafe metadata collections retain both original lazy lookups", () => {
  const value = structuredClone(command), versions = value.executor.eingaben.kostenPlan.sourceVersions;
  let calls = 0;
  versions.documents = new Proxy(versions.documents, { get(target, key, receiver) {
    if (key === "find") { calls++; versions.knowledgeObjects[0].versionHash = "0".repeat(64); }
    return Reflect.get(target, key, receiver);
  } });
  freeze(value.drafts[0].sources);
  assert.throws(() => C.validate(value), /direct-ko-context-drift/); assert(calls > 0);
});
check("publication-policy mutation is never covered by earlier validation", () => {
  const Eligibility = require("../lib/helmut/publication-eligibility"), before = process.env[Eligibility.ENV];
  try {
    process.env[Eligibility.ENV] = JSON.stringify({ version: 1, holds: [{
      publicationUrl: "https://example.org/fictional/0", reason: "unresolved-event-relation",
      review: { id: "offline-policy-change", receiptSHA256: "a".repeat(64), koSHA256: "b".repeat(64), sourceSHA256: "c".repeat(64) }
    }] });
    assert.throws(() => C.validate(frozenCommand), /stored-policy-stale/);
  } finally {
    if (before === undefined) delete process.env[Eligibility.ENV]; else process.env[Eligibility.ENV] = before;
  }
});
console.log(JSON.stringify({ status: "PASS", checks, helperSourceSHA256: crypto.createHash("sha256").update(historicalSource).digest("hex"), productionActions: 0, networkRequests: 0 }));
