"use strict";
// Pure synthetic regression. Import is inert; no network, DB or activation.
const assert = require("node:assert/strict");
const fs = require("node:fs"), crypto = require("node:crypto"), path = require("node:path");
const modulePath = path.resolve(__dirname, "../lib/helmut/auth-state-parts.js");
const sha = text => crypto.createHash("sha256").update(text).digest("hex");
function fresh() { delete require.cache[modulePath]; return require(modulePath); }
function run() {
  const C = fresh(), groups = [];
  const check = (name, fn) => { fn(); groups.push({ name, pass: true }); };
  const node = value => { const payload = C.canonical(value); return { payload, hash: sha(payload) }; };
  const graph = nodes => ({ root: nodes.at(-1).hash, nodes });
  check("cold-and-warm-exact-roundtrip", () => {
    const input = { objects: Object.fromEntries(Array.from({ length: 240 }, (_, i) => ["key" + i, { i, body: "x".repeat(120) }])),
      rows: Array.from({ length: 97 }, (_, i) => ({ i, body: "y".repeat(1200) })),
      empty: [], falsy: [0, false, null, ""], nested: { _authStateRef: "literal" } };
    const g = C.build(input), reader = fresh();
    for (let i = 0; i < 2; i++) { const d = reader.decode(g, g.root, "local|generation-a");
      assert.deepEqual(d.data, input); assert.deepEqual(d.hashes, g.hashes); }
    const other = reader.decode(g, g.root, "local|generation-b"); assert.deepEqual(other.data, input);
  });
  check("warm-actual-byte-binding-and-complete-current-graph", () => {
    const reader = fresh(), g = reader.build({ a: "x".repeat(20000), b: Array.from({ length: 96 }, (_, i) => ({ i })) });
    reader.decode(g, g.root, "same-target|same-generation");
    const reject = (bad, code, root = bad.root) => assert.throws(() => reader.decode(bad, root, "same-target|same-generation"), { code });
    reject({ ...g, nodes: g.nodes.map((n, i) => i ? n : { ...n, payload: n.payload + " " }) }, "AUTH_STATE_PAYLOAD_HASH_MISMATCH");
    reject({ ...g, nodes: [...g.nodes, g.nodes[0]] }, "AUTH_STATE_GRAPH_NODE_INVALID");
    reject({ ...g, nodes: g.nodes.slice(1) }, "AUTH_STATE_GRAPH_POSTORDER_INVALID");
    const extra = node(["v", "not-reachable-in-current-root"]);
    reject({ ...g, nodes: [...g.nodes, extra] }, "AUTH_STATE_GRAPH_UNREACHABLE");
    reject(g, "AUTH_STATE_GRAPH_INVALID", "0".repeat(64));
    const reordered = { ...g, nodes: [g.nodes.at(-1), ...g.nodes.slice(0, -1)] };
    reject(reordered, "AUTH_STATE_GRAPH_POSTORDER_INVALID");
  });
  check("unknown-alternate-DAG-normal-form-stays-closed", () => {
    const input = Object.fromEntries(Array.from({ length: 240 }, (_, i) => ["key" + i, "x".repeat(100)]));
    const g = C.build(input), original = g.nodes.at(-1), body = JSON.parse(original.payload);
    assert.equal(body[0], "m"); assert(body[1].length > 1); body[1].reverse();
    const alternative = node(body), nodes = [...g.nodes.slice(0, -1), alternative];
    const reader = fresh(); assert.throws(() => reader.decode(graph(nodes), alternative.hash), { code: "AUTH_STATE_CONTENT_MISMATCH" });
    const good = reader.decode(g, g.root); assert.deepEqual(good.data, input);
    assert.throws(() => reader.decode(graph(nodes), alternative.hash), { code: "AUTH_STATE_CONTENT_MISMATCH" });
  });
  check("shared-leaves-and-structures-never-alias-mutable-results", () => {
    const same = { nested: { text: "x".repeat(20000) } };
    const input = { a: same, b: same, rows: [same, same], literal: JSON.parse('{"__proto__":{"own":true},"constructor":{"v":1}}') };
    const g = C.build(input), reader = fresh();
    for (let i = 0; i < 2; i++) {
      const d = reader.decode(g, g.root, "local|one").data;
      assert.deepEqual(d, input); d.a.nested.text = "changed";
      assert.equal(d.b.nested.text, input.b.nested.text); assert.equal(d.rows[0].nested.text, input.a.nested.text);
      d.rows[0].nested.text = "row-only"; assert.equal(d.rows[1].nested.text, input.a.nested.text);
      d.literal.__proto__.own = false; assert.equal(input.literal.__proto__.own, true);
      assert.equal({}.own, undefined); assert.equal(input.a.nested.text.length, 20000);
    }
  });
  check("bounded-structural-alias-work-before-final-expansion", () => {
    const nodes = [node(["v", null])];
    for (let i = 0; i < 7; i++) nodes.push(node(["a", Array(32).fill(nodes.at(-1).hash)]));
    nodes.push(node(["o", [["bomb", nodes.at(-1).hash]]]));
    const g = graph(nodes); assert.throws(() => fresh().decode(g, g.root), { code: "AUTH_STATE_WORK_LIMIT" });
  });
  check("top-level-controls-rejected-nested-literals-retained", () => {
    const controls = ["llmUsage", "_llmUsageRef", "_authStateRef", "_authStoreRevision"];
    for (const key of controls) { const g = graph([node(["v", { [key]: [] }])]);
      assert.throws(() => fresh().decode(g, g.root), { code: "AUTH_STATE_ROOT_INVALID" }); }
    const input = { nested: Object.fromEntries(controls.map(k => [k, []])) }, g = C.build(input);
    assert.deepEqual(fresh().decode(g, g.root).data, input);
  });
  check("verified-content-token-cannot-be-forged-rebound-or-restored-after-restart", () => {
    const reader = fresh(), input = { current: { permitted: false }, rows: [1, 2, 3] }, g = reader.build(input);
    const decoded = reader.decodeForReuse(g, g.root, "local|generation-a"), token = decoded.reuseToken;
    assert(token && Object.isFrozen(token));assert.deepEqual(Object.keys(token), []);
    for (const bad of [null, {}, Object.freeze({}), JSON.parse(JSON.stringify(token)), "hash-claim"])
      assert.throws(() => reader.copyVerifiedContent(bad, g.root, "local|generation-a"), { code: "AUTH_STATE_VERIFIED_CONTENT_MISSING" });
    assert.throws(() => reader.copyVerifiedContent(token, "0".repeat(64), "local|generation-a"), { code: "AUTH_STATE_VERIFIED_CONTENT_MISSING" });
    assert.throws(() => reader.copyVerifiedContent(token, g.root, "foreign|generation-a"), { code: "AUTH_STATE_VERIFIED_CONTENT_MISSING" });
    assert.throws(() => fresh().copyVerifiedContent(token, g.root, "local|generation-a"), { code: "AUTH_STATE_VERIFIED_CONTENT_MISSING" });
    assert.equal(reader.decode(g, g.root, "local|generation-a").reuseToken, undefined);
    const bad = { ...g, nodes: g.nodes.map((n, i) => i ? n : { ...n, payload: n.payload + " " }) };
    assert.throws(() => reader.decodeForReuse(bad, g.root, "local|generation-a"), { code: "AUTH_STATE_PAYLOAD_HASH_MISMATCH" });
  });
  check("verified-copy-detaches-all-aliases-hash-sets-and-caller-mutations", () => {
    const reader = fresh(), same = { nested: { text: "x".repeat(20000) } };
    const input = { a: same, b: same, rows: [same, same], literal: JSON.parse('{"__proto__":{"own":true}}') }, g = reader.build(input);
    const first = reader.decodeForReuse(g, g.root, "local|one"), token = first.reuseToken;
    first.data.a.nested.text = "caller";first.hashes.clear();
    const a = reader.copyVerifiedContent(token, g.root, "local|one");
    assert.deepEqual(a.data, input);assert.deepEqual(a.hashes, g.hashes);
    a.data.a.nested.text = "one-alias";assert.equal(a.data.b.nested.text, input.b.nested.text);
    a.data.rows[0].nested.text = "row-only";assert.equal(a.data.rows[1].nested.text, input.a.nested.text);
    a.data.literal.__proto__.own = false;assert.equal({}.own, undefined);a.hashes.clear();
    const b = reader.copyVerifiedContent(token, g.root, "local|one");
    assert.deepEqual(b.data, input);assert.deepEqual(b.hashes, g.hashes);
  });
  check("captured-verified-content-survives-replacement-without-using-new-global-state", () => {
    const reader = fresh(), a = { value: "before" }, ga = reader.build(a);
    const saved = reader.decodeForReuse(ga, ga.root, "local|a");
    const b = { value: "after" }, gb = reader.build(b);reader.decodeForReuse(gb, gb.root, "local|b");
    assert.deepEqual(reader.copyVerifiedContent(saved.reuseToken, ga.root, "local|a").data, a);
    assert.throws(() => reader.copyVerifiedContent(saved.reuseToken, gb.root, "local|b"), { code: "AUTH_STATE_VERIFIED_CONTENT_MISSING" });
  });
  check("expanded-text-limit-is-independent-of-small-shared-wire-graph", () => {
    const reader = fresh(), item = { text: "z".repeat(20000) }, input = { rows: Array(450).fill(item) }, g = reader.build(input);
    assert(Buffer.byteLength(JSON.stringify(g)) < 8 * 1024 * 1024);
    assert(Buffer.byteLength(JSON.stringify(input)) > 8 * 1024 * 1024);
    const decoded = reader.decodeForReuse(g, g.root, "local|large");
    assert.deepEqual(decoded.data, input);assert.equal(decoded.reuseToken, null);
    assert.throws(() => reader.copyVerifiedContent(decoded.reuseToken, g.root, "local|large"), { code: "AUTH_STATE_VERIFIED_CONTENT_MISSING" });
  });
  return { scope: "PURE_SYNTHETIC_GRAPH_READER_REGRESSION_ONLY", pass: true,
    atUTC: new Date().toISOString(), groups, moduleSHA256: sha(fs.readFileSync(modulePath)),
    activation: false, full500: false, GOClaimed: false, providerCalls: 0, production: false };
}
function main(argv) {
  assert(argv.length === 0 || (argv.length === 2 && argv[0] === "--result"));
  const result = run();
  if (argv.length) fs.writeFileSync(argv[1], JSON.stringify(result, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify(result));
}
if (require.main === module) main(process.argv.slice(2));
module.exports = { run, main };
