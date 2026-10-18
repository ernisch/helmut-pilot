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
