"use strict";
// Isolated mathematical differential tests; no Production authority or runtime gate qualification.
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const P = require("../lib/helmut/synthetik-500-profile");
const filename = path.resolve(__dirname, "../lib/helmut/canonical-content-facts.js");
let lease = true, passed = 0;
const sandbox = { module: { exports: {} }, Object, Array, Map, Set, WeakMap, WeakSet, Uint32Array,
  Number, String, Boolean, JSON, Reflect, Symbol, Math, Buffer, process,
  require: name => name === "./synthetik-500-cpu-epoch" ? { isActive: () => lease }
    : name.startsWith(".") ? require(path.resolve(path.dirname(filename), name)) : require(name) };
const testedSource = fs.readFileSync(filename, "utf8");
const testedSourceSHA256 = crypto.createHash("sha256").update(testedSource).digest("hex");
vm.runInNewContext(testedSource, sandbox, { filename });
const F = sandbox.module.exports;
const expected = value => crypto.createHash("sha256").update(P.kanonisch(value)).digest("hex");
function fixture(value) {
  const nodes = [], scalar = [], sizes = [], completed = new WeakMap(), frozen = new WeakSet();
  function visit(v) {
    if (v && typeof v === "object" && completed.has(v)) return completed.get(v);
    let node;
    if (v === null) node = ["n"];
    else if (typeof v !== "object") node = [typeof v === "string" ? "s" : typeof v === "boolean" ? "b" : "d", v];
    else if (Array.isArray(v)) node = ["a", v.map(visit)];
    else node = ["o", Object.keys(v).map(key => [visit(key), visit(v[key])])];
    const id = nodes.length; nodes.push(node); sizes[id] = Buffer.byteLength(JSON.stringify(v));
    if (node[0] !== "a" && node[0] !== "o") scalar[id] = JSON.stringify(v);
    if (v && typeof v === "object") completed.set(v, id);
    return id;
  }
  const root = visit(value), payload = { nodes, root };
  const context = { payload, raw: Buffer.from(JSON.stringify(payload)), checked: { scalar, sizes } };
  function freeze(v) { if (!v || typeof v !== "object" || frozen.has(v)) return; frozen.add(v); for (const x of Object.values(v)) freeze(x); Object.freeze(v); }
  freeze(value); return { value, context };
}
function check(name, body) { body(); passed++; process.stdout.write("PASS " + name + "\n"); }
const special = {};
Object.defineProperty(special, "__proto__", { value: "own-data", enumerable: true });
Object.defineProperty(special, "constructor", { value: "also-own-data", enumerable: true });
const shared = { z: "ä😀\ud800", n: -0 };
const currentVersionRow = { id: "dup", n: 1 };
const versionSHA = expected(currentVersionRow);
const seed = fixture({ array: [shared, shared, true, null, 0, "0"], numbers: { 1: "one", 2: "two", 10: "ten" }, special,
  currentVersionRow,
  compatibleNumbers: { "1": "one", "2": "two", x: shared },
  incompatibleMixed: { "0a": "zero-a", "1": "one" },
  incompatibleNested: { a: { "2": "two", "10": "ten" } },
  versionRows: [{ id: "dup", versionHash: "wrong" }, { id: "other", versionHash: versionSHA },
    { id: "dup", versionHash: versionSHA }, { id: "dup", versionHash: "last" }],
  rawDoc: { id: "source", summary: "full excerpt", title: "title", quellenauszug_beleg: null, nested: shared, "10": "ten", "2": "two" } });
const prepared = F.prepare(seed.context);
assert(prepared); assert.equal(F.begin(seed.value, prepared), true);
check("frozen original and independent mutable copy have exact P SHA", () => {
  assert.equal(F.hash(seed.value), expected(seed.value));
  const before = F.snapshotStats();
  const copy = structuredClone(seed.value);
  assert.equal(F.hash(copy), expected(copy));
  assert.equal(F.snapshotStats().hashHits, before.hashHits + 1);
});
check("current mutable content is rechecked after mutation", () => {
  const x = { a: [1, 2] }; const first = F.hash(x); assert.equal(first, expected(x));
  x.a[1] = 3; assert.equal(F.hash(x), expected(x)); assert.notEqual(F.hash(x), first);
});
check("alias and copied children converge without shared identity", () => {
  const child = { a: "same" }, a = [child, child], b = [{ a: "same" }, { a: "same" }];
  assert.equal(F.hash(a), expected(a)); const before = F.snapshotStats().hashHits;
  assert.equal(F.hash(b), expected(b)); assert.equal(F.snapshotStats().hashHits, before + 1);
});
check("lexical P order includes numeric-looking object keys", () => {
  const a = { 2: "b", 10: "c", 1: "a", z: 0 }, b = { z: 0, 1: "a", 10: "c", 2: "b" };
  assert(P.kanonisch(a).indexOf('"10"') < P.kanonisch(a).indexOf('"2"'));
  assert.equal(F.hash(a), expected(a)); assert.equal(F.hash(b), expected(a));
});
check("scalar type, Unicode, zero and array ordering", () => {
  for (const x of [null, true, false, 0, -0, 1.25, "0", "ä😀\ud800", [], {}, [1, 2], [2, 1]]) assert.equal(F.hash(x), expected(x));
  assert.equal(F.hash(-0), F.hash(0)); assert.notEqual(F.hash(0), F.hash("0"));
  assert.notEqual(F.hash([1, 2]), F.hash([2, 1])); assert.notEqual(F.hash([1]), F.hash([1, 1]));
});
check("CRC collisions never establish string identity", () => {
  const a = "new-collision-\ud801", b = "new-collision-\ud802";
  assert.notEqual(a, b);
  assert.equal(require("node:zlib").crc32(a), require("node:zlib").crc32(b));
  assert.equal(F.hash(a), expected(a)); assert.equal(F.hash(b), expected(b));
  assert.notEqual(F.hash(a), F.hash(b));
  assert(F.snapshotStats().retainedExtraStringIndex.collisionEntries >= 1);
});
check("own __proto__ and constructor remain data", () => assert.equal(F.hash(special), expected(special)));
check("owned JSON facts preserve full depth boundary", () => {
  assert.equal(F.jsonValid(shared, 79), true); assert.equal(F.jsonValid(shared, 80), false);
  assert.equal(F.jsonValid({ ...shared }, 0), false);
});
check("accessors, Proxy and toJSON execute no foreign callbacks", () => {
  let effects = 0;
  const getter = Object.defineProperty({}, "x", { get() { effects++; return 1; }, enumerable: true });
  const proxy = new Proxy({}, { getPrototypeOf() { effects++; return Object.prototype; }, ownKeys() { effects++; return []; } });
  const json = { toJSON() { effects++; return 1; } };
  assert.equal(F.hash(getter), null); assert.equal(F.hash(proxy), null); assert.equal(F.hash(json), null); assert.equal(effects, 0);
});
check("unsupported values and cycles choose literal fallback", () => {
  const cycle = {}; cycle.self = cycle;
  for (const x of [undefined, Symbol("x"), NaN, Infinity, 1n, cycle]) assert.equal(F.hash(x), null);
});
check("public methods cannot poison a context without the private lease", () => {
  const before = F.snapshotStats(); lease = false;
  assert.equal(F.prepare({}), null); assert.equal(F.begin({}, {}), false); assert.equal(F.hash(seed.value), null);
  const after = F.snapshotStats(); assert.equal(after.keyBytes, before.keyBytes); assert.equal(after.contentRecords, before.contentRecords);
  lease = true; assert.equal(F.hash(seed.value), expected(seed.value));
});
check("owned subset is exact frozen data with unchanged canonical hash requests", () => {
  const keys = Object.freeze(["2", "10"]), before = F.snapshotStats();
  const value = F.projectedValue(seed.value.numbers, keys);
  assert(value); assert.equal(Object.isFrozen(value), true);
  assert.deepEqual(Object.keys(value).sort(), ["10", "2"]);
  assert.equal(F.snapshotStats().hashCalls, before.hashCalls);
  assert.equal(F.hash(value), expected(Object.fromEntries(keys.map(k => [k, seed.value.numbers[k]]))));
  assert.equal(F.projectedValue(seed.value.numbers, Object.freeze(["2", "10"])), value);
  const nested = F.projectedValue(seed.value, Object.freeze(["array", "numbers"]));
  assert.equal(nested.array, seed.value.array); assert.equal(F.hash(nested), expected(nested));
  const proto = F.projectedValue(seed.value.special, Object.freeze(["__proto__"]));
  assert.equal(Object.getPrototypeOf(proto), Object.getPrototypeOf(value)); assert.equal(Object.hasOwn(proto, "__proto__"), true);
  assert.equal(proto.__proto__, "own-data"); assert.equal(F.hash(proto), expected(proto));
});
check("projection rejects unowned, mutable, missing, duplicate and effectful data", () => {
  let effects = 0;
  const keys = Object.freeze(["1"]);
  assert.equal(F.projectedValue({ ...seed.value.numbers }, keys), null);
  assert.equal(F.projectedValue(Object.freeze({ ...seed.value.numbers }), keys), null);
  assert.equal(F.projectedValue(seed.value.numbers, ["1"]), null);
  assert.equal(F.projectedValue(seed.value.numbers, Object.freeze(["missing"])), null);
  assert.equal(F.projectedValue(seed.value.numbers, Object.freeze(["__proto__"])), null);
  assert.equal(F.projectedValue(seed.value.numbers, Object.freeze(["1", "1"])), null);
  const getter = []; Object.defineProperty(getter, "0", { enumerable: true, get() { effects++; return "1"; } }); Object.freeze(getter);
  assert.equal(F.projectedValue(seed.value.numbers, getter), null);
  const proxy = new Proxy(keys, { get() { effects++; return "1"; }, ownKeys() { effects++; return []; } });
  assert.equal(F.projectedValue(seed.value.numbers, proxy), null); assert.equal(effects, 0);
});
check("structural field index preserves duplicates and original positions", () => {
  const rows = seed.value.versionRows;
  const indices = F.fieldIndices(rows, "id", "dup");
  assert.deepEqual(Array.from(indices), [0, 2, 3]); assert.equal(Object.isFrozen(indices), true);
  assert.equal(F.fieldIndices(rows, "id", "dup"), indices);
  assert.deepEqual(Array.from(F.fieldIndices(rows, "id", "other")), [1]);
  assert.deepEqual(Array.from(F.fieldIndices(rows, "id", "absent")), []);
  assert.equal(F.fieldIndices(rows, "missing", "dup"), null);
  assert.equal(F.fieldIndices(structuredClone(rows), "id", "dup"), null);
  assert.equal(F.fieldIndices(Object.freeze(structuredClone(rows)), "id", "dup"), null);
  assert.throws(() => indices.push(4), { name: "TypeError" });
});
const commandFilename = path.resolve(__dirname, "../lib/helmut/synthetik-500-production-command.js");
const realRequire = require("node:module").createRequire(commandFilename);
let comparedHashes = 0;
const commandSandbox = { ...sandbox, module: { exports: {} },
  require: name => name === "./synthetik-500-cpu-epoch" ? { isActive: () => lease, bindFacts() {}, bindSelector() {}, bindCommand: fn => fn }
    : name === "./canonical-content-facts" ? F
      : name === "./synthetik-500-profile" ? { ...P, hash: value => { comparedHashes++; return expected(value); } }
        : realRequire(name) };
vm.runInNewContext(fs.readFileSync(commandFilename, "utf8")
  + "\nmodule.exports.testFindSourceVersion=findSourceVersion;module.exports.testProjectSourceValue=projectSourceValue;", commandSandbox, { filename: commandFilename });
const commandMath = commandSandbox.module.exports;
check("actual C index helper retains first matching row and original hash frequency", () => {
  const rows = seed.value.versionRows, current = seed.value.currentVersionRow;
  let originalCalls = 0;
  const original = rows.find(x => x.id === current.id && x.versionHash === (++originalCalls, expected(current)));
  comparedHashes = 0;
  assert.equal(commandMath.testFindSourceVersion(rows, "id", current, "id"), original);
  assert.equal(comparedHashes, originalCalls); assert.equal(originalCalls, 2);
  comparedHashes = 0; assert.equal(commandMath.testFindSourceVersion(rows, "id", { id: "absent" }, "id"), undefined);
  assert.equal(comparedHashes, 0);
});
check("actual C legacy index helper preserves accessor effect order", () => {
  const trace = [];
  const makeRows = () => [{ get id() { trace.push("first.id"); return "other"; } },
    { get id() { trace.push("second.id"); return "dup"; }, get versionHash() { trace.push("second.hash"); return versionSHA; } }];
  const current = seed.value.currentVersionRow;
  lease = false; let rows = makeRows(); rows.find(x => x.id === current.id && x.versionHash === expected(current));
  const original = trace.splice(0); rows = makeRows();
  commandMath.testFindSourceVersion(rows, "id", current, "id");
  assert.deepEqual(trace, original); lease = true;
});
check("an absent dictionary key is an exact empty index result", () => {
  const first = F.fieldIndices(seed.value.versionRows, "versionHash", "never-in-original-dictionary");
  assert(first); assert.equal(first.length, 0); assert.equal(Object.isFrozen(first), true);
  const before = F.snapshotStats();
  const second = F.fieldIndices(seed.value.versionRows, "versionHash", "another-absent-key");
  assert.equal(second, first);
  const after = F.snapshotStats();
  for (const field of ["activeOperationEntries", "activeOperationKeyBytes", "activeOperationHeapBytes"])
    assert.equal(after[field], before[field], field);
});
check("actual C source projection keeps transformed excerpt data", () => {
  const source = seed.value.rawDoc, keys = Object.freeze(["id", "summary", "nested", "2", "10"]);
  const current = realRequire("./quellen-auszug").geleseneQuelle(source);
  assert.notEqual(current, source); assert.equal(Object.isFrozen(current), false);
  const same = commandMath.testProjectSourceValue(current, keys, source);
  assert.equal(same, F.projectedValue(source, keys)); assert.equal(F.hash(same), expected(same));
  const changed = { ...current, summary: "changed excerpt" };
  const actual = commandMath.testProjectSourceValue(changed, keys, source);
  assert.equal(actual.summary, "changed excerpt"); assert.equal(Object.isFrozen(actual), false);
  assert.equal(F.hash(actual), expected(actual)); assert.equal(F.jsonValid(changed), false);
});
check("all operation caches and exact charges release once at C end", () => {
  const first = F.projectedValue(seed.value.numbers, Object.freeze(["1"]));
  assert(F.snapshotStats().activeOperationEntries > 0);
  F.end(); const after = F.snapshotStats(); F.end(); const twice = F.snapshotStats();
  for (const field of ["keyBytes", "parsedAndFactHeapBytes", "activeOperationEntries", "activeOperationKeyBytes", "activeOperationHeapBytes", "activeBindings", "activeBindingHeapBytes"]) assert.equal(twice[field], after[field], field);
  assert.equal(after.activeOperationEntries, 0); assert.equal(after.activeOperationKeyBytes, 0); assert.equal(after.activeOperationHeapBytes, 0);
  assert(after.keyBytes >= 0); assert(after.parsedAndFactHeapBytes >= 0);
  assert.equal(F.projectedValue(seed.value.numbers, Object.freeze(["1"])), null);
  assert.equal(F.fieldIndices(seed.value.versionRows, "id", "dup"), null);
  assert.equal(F.begin(seed.value, prepared), true);
  const fresh = F.projectedValue(seed.value.numbers, Object.freeze(["1"]));
  assert.notEqual(fresh, first); assert.equal(F.hash(fresh), expected(fresh));
});
const bFilename = path.resolve(__dirname, "../lib/helmut/briefing-speicher.js");
const bRequire = require("node:module").createRequire(bFilename);
let legacyFactCalls = 0;
function bModule(activeGate) {
  const state = { ...sandbox, module: { exports: {} },
    require: name => name === "./synthetik-500-cpu-epoch" ? { isActive: activeGate ? () => lease : () => false }
      : name === "./canonical-content-facts" ? activeGate ? F : { compatibleBHash() { legacyFactCalls++; throw Error("LEGACY_MUST_NOT_CALL_FACTS"); } }
        : bRequire(name) };
  vm.runInNewContext(fs.readFileSync(bFilename, "utf8"), state, { filename: bFilename });
  return state.module.exports;
}
const activeB = bModule(true), literalB = bModule(false);
check("B bridge uses only proven identical full byte preimages", () => {
  for (const value of [seed.value.versionRows, seed.value.compatibleNumbers, seed.value.array, seed.value.special]) {
    assert.equal(F.compatibleBHash(value), literalB.hash(value));
    assert.equal(activeB.hash(value), literalB.hash(value));
  }
  assert.equal(literalB.hash(seed.value.versionRows), crypto.createHash("sha256").update(JSON.stringify(seed.value.versionRows)).digest("hex"));
  assert.equal(legacyFactCalls, 0);
});
check("B bridge rejects numeric-key order differences and mutable data", () => {
  for (const value of [seed.value.numbers, seed.value.incompatibleMixed, seed.value.incompatibleNested]) {
    assert.notEqual(expected(value), literalB.hash(value));
    assert.equal(F.compatibleBHash(value), null);
    assert.equal(activeB.hash(value), literalB.hash(value));
  }
  assert.equal(F.compatibleBHash({ ...seed.value.compatibleNumbers }), null);
  assert.equal(F.compatibleBHash(Object.freeze({ ...seed.value.compatibleNumbers })), null);
  const make = () => { let reads = 0; return { value: { get a() { reads++; return "x"; } }, count: () => reads }; };
  const current = make(), original = make();
  assert.equal(activeB.hash(current.value), literalB.hash(original.value)); assert.equal(current.count(), original.count());
});
check("new fact API is readonly and legacy consumers call no helper", () => {
  assert.equal(Object.isFrozen(F), true); assert.equal(Reflect.set(F, "hash", () => "forged"), false);
  let effects = 0;
  for (const [file, invoke] of [
    ["streaming-canonical-hash.js", api => assert.equal(api.hash({ a: 1 }, P.kanonisch), expected({ a: 1 }))],
    ["knowledge-object-version.js", api => { api.jsonValue({ a: 1 }); assert.throws(() => api.jsonValue({ a: undefined })); }]
  ]) {
    const full = path.resolve(__dirname, "../lib/helmut/" + file), req = require("node:module").createRequire(full);
    const state = { ...sandbox, module: { exports: {} },
      require: name => name === "./synthetik-500-cpu-epoch" ? { isActive: () => false }
        : name === "./canonical-content-facts" ? { hash() { effects++; return "forged"; }, jsonValid() { effects++; return true; } }
          : req(name) };
    vm.runInNewContext(fs.readFileSync(full, "utf8"), state, { filename: full }); invoke(state.module.exports);
  }
  assert.equal(effects, 0); assert.equal(legacyFactCalls, 0);
});
check("private input copies retain native descriptors and split alias occurrences", () => {
  const state = { ...sandbox, module: { exports: {} } };
  vm.runInNewContext(testedSource, state, { filename }); const G = state.module.exports;
  const ctx = G.prepare(fixture(seed.value).context); assert(ctx); assert.equal(G.begin(seed.value, ctx), true);
  const originalSHA = G.hash(seed.value), before = G.snapshotStats();
  const copy = G.copyInputForHash(seed.value);
  assert.notEqual(copy, seed.value); assert.equal(Object.isFrozen(copy), false);
  assert.notEqual(copy.array[0], copy.array[1]); assert.equal(copy.array[0].n, 0);
  assert.equal(Object.is(copy.array[0].n, -0), false);
  assert.equal(Object.getOwnPropertyDescriptor(copy, "array").writable, true);
  assert.equal(Object.getOwnPropertyDescriptor(copy.special, "__proto__").value, "own-data");
  assert.equal(G.hash(copy), originalSHA); assert.equal(originalSHA, expected(copy));
  const after = G.snapshotStats(); assert.equal(after.inputCopyBindings, 1);
  assert.equal(after.activeBindings, before.activeBindings + 1);
  assert.equal(after.activeBindingHeapBytes, before.activeBindingHeapBytes + 64);
  // The two private consumers do not expose/mutate the actual copy until end.
  G.end(); copy.array[0].z = "changed after private consumption";
  assert.equal(copy.array[1].z, seed.value.array[1].z);
  assert.equal(G.hash(copy), null); assert.equal(G.begin(seed.value, ctx), true);
  assert.equal(G.hash(copy), expected(copy)); assert.notEqual(G.hash(copy), originalSHA);
  G.end();
});
check("unknown mutable input copies never obtain an identity content fact", () => {
  const state = { ...sandbox, module: { exports: {} } };
  vm.runInNewContext(testedSource, state, { filename }); const G = state.module.exports;
  const ctx = G.prepare(fixture(seed.value).context); assert.equal(G.begin(seed.value, ctx), true);
  const before = G.snapshotStats(), copy = G.copyInputForHash({ a: 1 });
  assert.equal(G.snapshotStats().activeBindings, before.activeBindings);
  copy.a = 2; assert.equal(G.hash(copy), expected(copy));
  assert.equal(G.snapshotStats().inputCopyBindings, 0); G.end();
});
check("inactive input copy preserves native getter calls and errors with no binding", () => {
  const before = F.snapshotStats(); lease = false; let effects = 0;
  const copy = F.copyInputForHash({ get a() { effects++; return 1; } });
  assert.equal(copy.a, 1); assert.equal(effects, 1);
  assert.throws(() => F.copyInputForHash({ toJSON() { effects++; throw Error("native-copy-error"); } }), /native-copy-error/);
  assert.equal(effects, 2); assert.equal(F.snapshotStats().activeBindings, before.activeBindings);
  lease = true;
});
check("B index boundary includes 4294967294 and excludes 4294967295", () => {
  const state = { ...sandbox, module: { exports: {} } };
  vm.runInNewContext(testedSource, state, { filename }); const G = state.module.exports;
  const data = fixture({ valid: { "4294967294": "last index", "4294967295": "ordinary", "01": "zero one" },
    invalid: { "0a": "first lexical", "4294967294": "index first in B" },
    last: { "4294967294": "last index", "4294967295": "ordinary", a: "a" },
    ordinary: { "-0": "minus", "01": "zero", "1.0": "decimal", "4294967295": "ordinary", a: "a" } });
  const ctx = G.prepare(data.context); assert.equal(G.begin(data.value, ctx), true);
  // The valid branch's "01" sorts before the real index in P: incompatible.
  assert.equal(G.compatibleBHash(data.value.valid), null);
  assert.equal(G.compatibleBHash(data.value.invalid), null);
  assert.equal(G.compatibleBHash(data.value.ordinary), literalB.hash(data.value.ordinary));
  assert.equal(G.compatibleBHash(data.value.last), literalB.hash(data.value.last)); G.end();
});
check("scoped K membership equals original predicate and preserves inactive effects", () => {
  const file = path.resolve(__dirname, "../lib/helmut/synthetik-500-kosten-plan.js");
  const req = require("node:module").createRequire(file); let accepted = true;
  const state = { ...sandbox, module: { exports: {} },
    require: name => name === "./synthetik-500-cpu-epoch" ? { isActive: () => accepted } : req(name) };
  const src = fs.readFileSync(file, "utf8") + "\nmodule.exports.mathTest={passiveKeyIndex,sourceKeysPresent};";
  vm.runInNewContext(src, state, { filename: file }); const K = state.module.exports.mathTest;
  const rows = [{ key: "a" }, { key: "b" }, { key: "a" }];
  const scoped = { rows, index: K.passiveKeyIndex(rows) };
  for (const keys of [[], ["a"], ["b", "a"], ["a", "a"], ["a", "missing"], ["missing", "b"]])
    assert.equal(K.sourceKeysPresent(keys, rows, scoped), keys.every(k => rows.some(row => row.key === k)));
  accepted = false; rows[0].key = "changed";
  assert.equal(K.sourceKeysPresent(["changed"], rows, scoped), true);
  const effectful = () => { const trace = []; return { trace, rows: [{ get key() { trace.push("read"); return "x"; } }] }; };
  const original = effectful(), actual = effectful();
  const expectedResult = ["x", "missing"].every(k => original.rows.some(row => row.key === k));
  assert.equal(K.sourceKeysPresent(["x", "missing"], actual.rows), expectedResult);
  assert.deepEqual(actual.trace, original.trace);
});
check("failed quota reservation does not consume unretained metadata", () => {
  let rejected = false;
  for (let i = 0; i < 100; i++) {
    const value = String(i).padStart(2, "0") + "x".repeat(400000);
    const before = F.snapshotStats(), result = F.hash(value), after = F.snapshotStats();
    if (result === null) {
      for (const field of ["extraIdentities", "keyBytes", "parsedAndFactHeapBytes", "contentRecords"]) assert.equal(after[field], before[field], field);
      assert.equal(after.firstBudgetFailure.firstFailCategory, "heap-cap");
      rejected = true; break;
    }
    assert.equal(result, expected(value));
  }
  assert.equal(rejected, true);
});
check("prefilled shared subtree bytes equal the complete original P preimage", () => {
  const isolated = { ...sandbox, module: { exports: {} } };
  vm.runInNewContext(testedSource, isolated, { filename });
  const G = isolated.module.exports;
  const common = { rows: Array.from({ length: 1024 }, (_, i) => ({ "2": i, "10": "ä😀\ud800" + "x".repeat(28), z: i % 17 })) };
  const large = fixture(Array(8).fill(common));
  const ctx = G.prepare(large.context); assert(ctx);
  const stats = G.snapshotStats();
  assert(stats.prefillChunks > 0); assert(stats.prefillChunks <= 64);
  assert(stats.prefillBytes >= 16384); assert(stats.chunkBytes <= 8 * 1024 * 1024);
  assert.equal(G.begin(large.value, ctx), true);
  assert.equal(G.hash(large.value), expected(large.value));
  assert.equal(G.hash(structuredClone(large.value)), expected(large.value));
  G.end();
});
check("end is idempotent and releases all active ownership bindings", () => { F.end(); F.end(); assert.equal(F.snapshotStats().activeBindings, 0); assert.equal(F.hash(seed.value), null); });
check("actual sealed gate rejects late bindings and grants no public lease", () => {
  const E = require("../lib/helmut/synthetik-500-cpu-epoch");
  E.seal(); assert.equal(Object.isFrozen(E), true);
  const original = () => E.isActive(); assert.equal(E.bindCommand(original), original); assert.equal(original(), false);
  let certificate;
  E.bindCodec(certify => { certificate = certify; return {}; });
  certificate(seed.value, seed.context); assert.equal(E.isActive(), false);
  E.bindFacts({ begin() { throw Error("must never enter"); }, end() {} });
  E.bindSelector(() => { throw Error("must never select"); });
  assert.equal(E.isActive(), false); assert.equal(E.bootstrap(), false);
});
process.stdout.write(JSON.stringify({ passed, failed: 0, testedSourceSHA256, scope: "ISOLATED_MATHEMATICAL_MODULE_ONLY", productionCalls: 0, databaseCalls: 0, full60or30Proof: false }) + "\n");
