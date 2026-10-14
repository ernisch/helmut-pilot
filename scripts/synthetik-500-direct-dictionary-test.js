"use strict";
const A = require("node:assert/strict"), C = require("node:crypto"), Z = require("node:zlib");
const T = require("../lib/helmut/synthetik-500-direct-codec");
const hash = b => C.createHash("sha256").update(b).digest("hex");
const input = drafts => ({ package: null, executorInputs: { version: "helmut-synthetik500-executor-eingaben/4-direct" }, drafts, predecessors: [] });
let checks = 0;
function check(name, test) { test(); checks++; }
const small = input([{ value: "ä😀\ud800", n: -0, yes: true, none: null }]);
check("v1 unchanged bytes and envelope", () => {
  const e = T.encode(small), raw = Buffer.from(JSON.stringify(small));
  A.deepEqual(e, { version: T.VERSION, bytes: raw.length, sha256: hash(raw), data: Z.gzipSync(raw).toString("base64") });
  A.deepEqual(T.decode(e), JSON.parse(raw)); A.equal(T.decode(small), small);
});
check("v1 does not inherit dictionary node cap", () => {
  const many = input(Array.from({ length: T.MAX_NODES + 1 }, (_, i) => i));
  const e = T.encode(many); A.equal(e.version, T.VERSION); A.deepEqual(T.decode(e), many);
});
const shared = { title: "ä".repeat(8192), count: 7 }, drafts = Array(4200).fill(shared), large = input(drafts);
let envelope;
check("v2 exact expanded UTF8 hash without full JSON", () => {
  envelope = T.encode(large); A.equal(envelope.version, T.DICTIONARY_VERSION);
  const h = C.createHash("sha256"), prefix = '{"package":null,"executorInputs":{"version":"helmut-synthetik500-executor-eingaben/4-direct"},"drafts":[', suffix = '],"predecessors":[]}';
  const row = JSON.stringify(shared); let expected = Buffer.byteLength(prefix) + Buffer.byteLength(suffix);
  h.update(prefix); for (let i = 0; i < drafts.length; i++) { if (i) { h.update(","); expected++; } h.update(row); expected += Buffer.byteLength(row); } h.update(suffix);
  A.equal(envelope.bytes, expected); A.equal(envelope.sha256, h.digest("hex"));
});
check("v2 immutable shared objects and arrays", () => {
  const d = T.decode(envelope); A.equal(d.drafts.length, drafts.length); A.deepEqual(d.drafts[0], shared);
  A.equal(d.drafts[0], d.drafts[4199]); A(Object.isFrozen(d) && Object.isFrozen(d.drafts) && Object.isFrozen(d.drafts[0]));
  A.throws(() => { d.drafts[0].title = "drift"; }, TypeError);
});
function altered(edit) {
  const payload = JSON.parse(Z.gunzipSync(Buffer.from(envelope.data, "base64")));
  edit(payload); const raw = Buffer.from(JSON.stringify(payload));
  return { ...envelope, dictionaryBytes: raw.length, dictionarySha256: hash(raw), data: Z.gzipSync(raw).toString("base64") };
}
check("tampered raw and expanded seals rejected", () => {
  for (const key of ["sha256", "dictionarySha256"]) A.throws(() => T.decode({ ...envelope, [key]: "0".repeat(64) }));
  A.throws(() => T.decode({ ...envelope, bytes: envelope.bytes + 1 }));
  A.throws(() => T.decode({ ...envelope, unknown: 1 }));
});
check("self forward and negative refs rejected", () => {
  for (const ref of [-1, 0.5, 9999999]) A.throws(() => T.decode(altered(p => { p.nodes[p.root] = ["a", [ref]]; })));
  A.throws(() => T.decode(altered(p => { p.nodes[p.root] = ["a", [p.root]]; })));
});
check("orphan nodes duplicate object keys invalid scalar rejected", () => {
  A.throws(() => T.decode(altered(p => { p.nodes.push(["n"]); p.root++; })));
  A.throws(() => T.decode(altered(p => { p.nodes[p.root][1].push(p.nodes[p.root][1][0]); })));
  A.throws(() => T.decode(altered(p => { p.nodes[0] = ["d", "not-a-number"]; })));
});
check("expansion node dictionary encoded caps rejected", () => {
  A.throws(() => T.decode({ ...envelope, bytes: T.MAX_EXPANDED + 1 }));
  A.throws(() => T.decode({ ...envelope, dictionaryBytes: T.MAX_BYTES + 1 }));
  A.throws(() => T.decode({ ...envelope, data: "A".repeat(T.MAX_ENCODED) }));
  A.throws(() => T.decode(altered(p => { p.nodes = Array(T.MAX_NODES + 1).fill(["n"]); p.root = T.MAX_NODES; })));
  // A tiny DAG can claim several GiB; reject the computed expansion itself,
  // before checking the caller's declared size or hashing expanded bytes.
  A.throws(() => T.decode(altered(p => { const oldRoot = p.root; p.nodes.push(["a", Array(100).fill(oldRoot)]); p.root++; })));
});
check("depth cycles accessors sparse arrays unsafe numbers rejected", () => {
  const cycle = input([]); cycle.package = cycle; A.throws(() => T.encode(cycle));
  const getter = input([]); Object.defineProperty(getter, "package", { enumerable: true, get() { throw Error("must-not-run"); } });
  A.throws(() => T.encode(getter), /codec-invalid/);
  A.throws(() => T.encode(input(Array(1)))); A.throws(() => T.encode(input([NaN])));
  let deep = null; for (let i = 0; i < 81; i++) deep = [deep]; A.throws(() => T.encode(input([deep])));
  A.throws(() => T.decode(altered(p => { for (let i = 0; i < 81; i++) p.nodes.push(["a", [p.nodes.length - 1]]); p.root = p.nodes.length - 1; })));
});
check("dangerous property names stay ordinary own JSON properties", () => {
  const special = JSON.parse('{"__proto__":{"polluted":true},"constructor":false}');
  const e = T.encode(input(Array(4200).fill({ special, title: shared.title }))), d = T.decode(e);
  A.equal({}.polluted, undefined); A.equal(Object.getPrototypeOf(d.drafts[0].special), Object.prototype);
  A.equal(Object.hasOwn(d.drafts[0].special, "__proto__"), true);
});
check("nested large preimages keep exact bytes and the reserved cache bound", () => {
  // Observe the private cache only in this isolated test module. Production
  // exports and the wire envelope gain no inspection or cache-control fields.
  const filename = require.resolve("../lib/helmut/synthetik-500-direct-codec");
  const source = require("node:fs").readFileSync(filename, "utf8");
  const marker = "cache.set(id, b); return write(b);";
  A.equal(source.split(marker).length, 2);
  const Module = require("node:module"), probe = new Module(filename, module);
  probe.filename = filename; probe.paths = module.paths;
  let peakReserved = 0, peakRetained = 0, observations = 0;
  probe.cacheProbe = (cache, reserved) => {
    const retained = [...cache.values()].reduce((sum, b) => sum + b.length, 0);
    A(retained <= reserved && reserved <= 16 * 1024 * 1024);
    peakReserved = Math.max(peakReserved, reserved); peakRetained = Math.max(peakRetained, retained); observations++;
  };
  probe._compile(source.replace(marker, "cache.set(id, b); module.cacheProbe(cache, cacheBytes); return write(b);"), filename);
  // Each box has two direct DAG references. Unique wrappers need no retained
  // preimage under the frequency gate, even inside an indirectly repeated row.
  const rows = Array.from({ length: 4 }, (_, i) => {
    const box = { text: String(i).repeat(3 * 1024 * 1024) }; return { left: box, right: box };
  });
  const nested = input(Array(8).fill(rows)), e = probe.exports.encode(nested);
  const h = C.createHash("sha256"), prefix = '{"package":null,"executorInputs":{"version":"helmut-synthetik500-executor-eingaben/4-direct"},"drafts":[', suffix = '],"predecessors":[]}';
  const row = JSON.stringify(rows); let expected = Buffer.byteLength(prefix) + Buffer.byteLength(suffix);
  h.update(prefix); for (let i = 0; i < 8; i++) { if (i) { h.update(","); expected++; } h.update(row); expected += Buffer.byteLength(row); } h.update(suffix);
  A.equal(e.bytes, expected); A.equal(e.sha256, h.digest("hex"));
  const d = probe.exports.decode(e);
  A.deepEqual(d.drafts[0], rows); A.equal(d.drafts[0], d.drafts[7]);
  A(observations > 0 && peakReserved > 12 * 1024 * 1024 && peakRetained > 12 * 1024 * 1024);
});
check("single-use prefix cannot evict a later repeated UTF8 preimage", () => {
  // Inspect only this separately compiled test module; keep Production exports
  // and envelopes unchanged. No timing measurement or Production input is used.
  const filename = require.resolve("../lib/helmut/synthetik-500-direct-codec");
  const source = require("node:fs").readFileSync(filename, "utf8");
  const marker = "cache.set(id, b); return write(b);", sink = "emit(root, chunk => hash.update(chunk));";
  A.equal(source.split(marker).length, 2); A.equal(source.split(sink).length, 2);
  const Module = require("node:module"), probe = new Module(filename, module);
  probe.filename = filename; probe.paths = module.paths;
  const hot = { text: "ä".repeat(1024 * 1024) + "😀\ud800", n: -0, yes: true, none: null };
  const hotBytes = Buffer.from(JSON.stringify(hot)), seen = [];
  let hotPreimages = 0, hotSinkChunks = 0, peakReserved = 0;
  probe.cacheProbe = (id, cache, reserved, checked) => {
    const retained = [...cache.values()].reduce((sum, b) => sum + b.length, 0), b = cache.get(id);
    A(checked.incoming[id] > 1); A(b.length <= 4 * 1024 * 1024);
    A(retained <= reserved && reserved <= 16 * 1024 * 1024);
    peakReserved = Math.max(peakReserved, reserved); seen.push(id);
    if (b.equals(hotBytes)) hotPreimages++;
  };
  probe.sinkProbe = chunk => { if (Buffer.isBuffer(chunk) && chunk.equals(hotBytes)) hotSinkChunks++; };
  probe._compile(source.replace(marker,
    "cache.set(id, b); module.cacheProbe(id, cache, cacheBytes, checked); return write(b);")
    .replace(sink, "emit(root, chunk => { module.sinkProbe(chunk); hash.update(chunk); });"), filename);
  const value = input(Array(40).fill(hot));
  value.package = [{ box: { text: "a".repeat(3 * 1024 * 1024) } }, { box: { text: "b".repeat(3 * 1024 * 1024) } }];
  const e = probe.exports.encode(value), h = C.createHash("sha256");
  const prefix = '{"package":' + JSON.stringify(value.package)
    + ',"executorInputs":{"version":"helmut-synthetik500-executor-eingaben/4-direct"},"drafts":[', suffix = '],"predecessors":[]}';
  let expected = Buffer.byteLength(prefix) + Buffer.byteLength(suffix);
  h.update(prefix); for (let i = 0; i < 40; i++) { if (i) { h.update(","); expected++; } h.update(hotBytes); expected += hotBytes.length; } h.update(suffix);
  A.equal(e.version, T.DICTIONARY_VERSION); A.equal(e.bytes, expected); A.equal(e.sha256, h.digest("hex"));
  A.equal(hotPreimages, 1); A.equal(hotSinkChunks, 40); A(seen.length > 0 && peakReserved < 4 * 1024 * 1024);
  const d = probe.exports.decode(e); A.deepEqual(d.package, value.package);
  A.deepEqual(d.drafts[0], { ...hot, n: 0 }); A.equal(d.drafts[0], d.drafts[39]);
  A.equal(hotPreimages, 2); A.equal(hotSinkChunks, 80);
  A.deepEqual(Object.keys(probe.exports).sort(), Object.keys(T).sort());
});
console.log(JSON.stringify({ passed: checks, v2ExpandedBytes: envelope.bytes, dictionaryBytes: envelope.dictionaryBytes, encodedBytes: Buffer.byteLength(JSON.stringify(envelope)) }));
