"use strict";
// Pure exact-reference and in-flight isolation tests. No DB, activation or GO.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto");
const file = path.resolve(__dirname, "../lib/helmut/auth-state-parts.js");
const referenceSHA = '6d2e1b74a499bd035978099c8e0a7b59375f9e43be84dd1e988441f36ffdbcf2';
const sha = x => crypto.createHash("sha256").update(x).digest("hex");
const prior = require("node:child_process").execFileSync("git", ["show", "588a33d5ec595972f1ee0c13de62260237aef000:lib/helmut/auth-state-parts.js"], { cwd: path.resolve(__dirname, ".."), encoding: "utf8" });
assert.equal(sha(prior), referenceSHA);
const source = fs.readFileSync(file, "utf8"), copy = x => JSON.parse(JSON.stringify(x));
function load(text) {
  let parses = 0;const module = { exports: {} }, J = { ...JSON, stringify: JSON.stringify, parse: (...args) => { parses++;return JSON.parse(...args); } };
  vm.runInNewContext(text, { module, exports: module.exports, require, Buffer, process, JSON: J, Object, Array, Map, Set, WeakMap, Number, String, RegExp }, { filename: file });
  return { C: module.exports, count: () => parses };
}
const checks = [];
async function check(name, fn) { const evidence = await fn();checks.push({ name, pass: true, ...evidence }); }
function outcome(fn) { try { return { ok: true, value: fn() }; } catch (e) { return { ok: false, code: e.code || e.name }; } }
function paired(make, oldText = prior, newText = source) {
  const old = load(oldText), next = load(newText);let a, b;
  const oldInput = make(), newInput = make();
  a = outcome(() => { const data = JSON.parse(JSON.stringify(oldInput)), records = JSON.parse(JSON.stringify([]));return { data, additions: records, tree: old.C.build(data) }; });
  b = outcome(() => next.C.captureWrite(newInput, []));
  assert.equal(a.ok, b.ok);
  if (!a.ok) { assert.equal(a.code, b.code);return { rejected: true }; }
  assert.deepEqual(copy(b.value.data), copy(a.value.data));assert.deepEqual(copy(b.value.additions), copy(a.value.additions));
  assert.equal(b.value.tree.root, a.value.tree.root);assert.deepEqual(copy(b.value.tree.nodes), copy(a.value.tree.nodes));
  assert.deepEqual([...b.value.tree.hashes].sort(), [...a.value.tree.hashes].sort());
  for (const n of b.value.tree.nodes) assert.equal(sha(n.payload), n.hash);
  return { exactRootPayloadsHashSetAndCapturedData: true };
}
async function main() {
  await check("valid-JSON-types-literal-keys-and-exotic-input-normalization-match-reference", () => {
    const shared = { x: 1 };
    const cases = [() => ({ a: null, b: [true, false, -0, 1.25, "😀ä", {}, []] }),
      () => JSON.parse('{"__proto__":{"literal":true},"constructor":{"prototype":false},"2":"two","10":"ten"}'),
      () => ({ stable: "x".repeat(20000), a: shared, b: shared, rows: Array.from({ length: 96 }, (_, i) => ({ i, value: i % 3 })) }),
      () => ({ numeric: [NaN, Infinity, undefined, -Infinity], omitted: undefined, date: new Date("2026-10-19T00:00:00Z") }),
      () => ({ get nested() { return { captured: true }; }, toJSON() { return { nested: this.nested, _authStoreRevision: "fixed" }; } }),
      () => ({ llmUsage: [1, 2], _authStoreRevision: "fixed", _llmUsageRef: {}, _authStateRef: {}, retained: true })];
    for (const f of cases) paired(f);
    let seed = 7654321;const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0);
    for (let i = 0; i < 48; i++) { const val = { counter: i, rows: Array.from({ length: 1 + rand() % 64 }, () => ({ id: rand(), text: String(rand()), flag: !!(rand() % 2) })) };paired(() => copy(val)); }
    return { differentialVectors: cases.length + 48 };
  });
  await check("invalid-root-cycles-bigint-depth-and-same-boundary-rejections", () => {
    for (const f of [() => null, () => [], () => 5, () => ({ x: 1n }), () => { const x = {};x.loop = x;return x; }, () => { let x = {};for (let i = 0; i < 65; i++) x = { nested: x };return x; }]) assert(paired(f).rejected);
    for (const [a, b, f] of [
      ["MAX_NODES = 20000", "MAX_NODES = 2", () => ({ a: "x".repeat(20000), b: "y".repeat(20000), c: "z".repeat(20000) })],
      ["MAX_UNIQUE_BYTES = 32 * 1024 * 1024", "MAX_UNIQUE_BYTES = 1024", () => ({ x: "x".repeat(2048) })],
      ["MAX_EXPANDED_BYTES = 256 * 1024 * 1024", "MAX_EXPANDED_BYTES = 1024", () => ({ x: "x".repeat(2048) })]
    ]) { assert(prior.includes(a) && source.includes(a));assert(paired(f, prior.replace(a, b), source.replace(a, b)).rejected); }
    return { rejectedVectors: 9, limitsNotChangedInRuntime: true };
  });
  await check("one-full-state-parse-removed-without-skipping-hash-build-or-serialization-bounds", () => {
    const before = load(prior), after = load(source), data = { nested: { value: "x".repeat(20000) } };
    // Count the original external capture as well as the builder's own parse.
    const oldCaptured = JSON.parse(JSON.stringify(data));before.C.build(oldCaptured);
    const next = after.C.captureWrite(data, []);
    assert.equal(before.count() + 2, 3);assert.equal(after.count(), 2);
    assert.equal(next.tree.root, load(prior).C.build(data).root);
    data.nested.value = "changed";assert.equal(next.data.nested.value.length, 20000);
    return { stateAndRecordsParseCallsBefore: 3, stateAndRecordsParseCallsAfter: 2, noRAMGainClaim: true };
  });
  await check("public-builder-cannot-forge-private-owned-path-with-extra-argument", () => {
    const x = load(source), input = { nested: { value: 1 } };
    x.C.build(input, null, true);assert.equal(x.count(), 1);
    assert.equal(x.C.buildInternal, undefined);
    return { externallySuppliedOwnershipFlagIgnored: true, internalBuilderNotExported: true };
  });
  const keys = ["HELMUT_LLM_USAGE_STORAGE", "HELMUT_AUTH_STATE_STORAGE", "SUPABASE_URL", "VERCEL", "HELMUT_AUTH_SINGLE_WRITE_CAPTURE", "HELMUT_AUTH_HISTORY_READ_REUSE", "HELMUT_AUTH_GRAPH_READ_REUSE"];
  const env = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  try {
    for (const k of keys) delete process.env[k];
    Object.assign(process.env, { HELMUT_LLM_USAGE_STORAGE: "relational-atomic-v1", HELMUT_AUTH_STATE_STORAGE: "merkle-auth-v1", SUPABASE_URL: "http://127.0.0.1:12345" });
    const U = require("../lib/helmut/llm-usage-atomic"), C = require("../lib/helmut/auth-state-parts"), EU = require("../lib/helmut/synthetik-500-eu-service-contract");
    await check("candidate-default-off-invalid-mode-and-production-refused", () => {
      assert.equal(U.enabled(), true);process.env.HELMUT_AUTH_SINGLE_WRITE_CAPTURE = "bad";assert.throws(() => U.enabled(), { code: "AUTH_SINGLE_CAPTURE_MODE_INVALID" });
      process.env.HELMUT_AUTH_SINGLE_WRITE_CAPTURE = "single-write-capture-v1";assert.equal(U.enabled(), true);
      process.env.VERCEL = "1";assert.throws(() => U.enabled());delete process.env.VERCEL;
      return { defaultUnchanged: true, explicitLocalOnly: true };
    });
    for (const mode of ["off", "single-write-capture-v1"]) {
      for (const kind of ["success", "conflict", "unknown", "wrong-root"]) await check(mode + "-" + kind + "-actual-Atomic-writer-and-inflight-caller-mutation", async () => {
        process.env.HELMUT_AUTH_SINGLE_WRITE_CAPTURE = mode;
        const initial = { testKostenAuftrag: { version: EU.ORDER_VERSION, serviceContractHash: EU.HASH }, nested: { counter: 1 }, llmUsage: [], _authStoreRevision: crypto.randomUUID() };
        const tree = C.build(initial), state = { version: C.VERSION, root: tree.root, generation: crypto.randomUUID(), originalHash: "1".repeat(64) };
        const proof = { generation: crypto.randomUUID(), count: 0, head: "0".repeat(64), originalHash: "2".repeat(64) }, target = "pure-local-single-capture|" + crypto.randomUUID();
        const store = await U.read({ rowId: "main-auth", target, request: async () => ({ data: { _authStoreRevision: initial._authStoreRevision, llmUsage: [] }, proof, state, graph: { root: tree.root, nodes: tree.nodes } }) });
        const record = { id: "local-zero-cost", estimatedCost: 0, keinAufruf: true };store.llmUsage = [record];let sent;
        const writing = U.write(store, { rowId: "main-auth", target, request: async (url, opts) => {
          assert(url.endsWith("helmut_auth_state_cas_v1"));sent = JSON.parse(opts.body);
          store.nested.counter = 99;record.estimatedCost = 123;await Promise.resolve();
          if (kind === "conflict") return [];if (kind === "unknown") throw Error("unknown-network-outcome");
          return [{ id: "main-auth", revision: sent.revision, proof: { ...proof, count: 1, head: "3".repeat(64) }, state: { ...state, root: kind === "wrong-root" ? "4".repeat(64) : sent.root } }];
        } });
        if (kind === "success") {
          const accepted = await writing;assert.equal(accepted.nested.counter, 1);assert.equal(accepted.llmUsage[0].estimatedCost, 0);
          assert.equal(C.build(accepted).root, sent.root);assert.equal(sent.additions[0].estimatedCost, 0);assert.equal(accepted._authStoreRevision, sent.revision);
          assert.throws(() => U.receipt(record, store), { code: "ATOMIC_USAGE_RECEIPT_CONTENT_CHANGED" });
        } else {
          await assert.rejects(writing, kind === "conflict" ? { code: "AUTH_STORE_CONFLICT" } : kind === "wrong-root" ? { code: "AUTH_STATE_WRITE_UNCONFIRMED" } : /unknown-network/);
          assert.throws(() => U.receipt(record, store), { code: "ATOMIC_USAGE_RECEIPT_UNCONFIRMED" });
        }
        return { backend: "injected-mock-only", callerMutationsDoNotChangeSentData: true, noAutoRetry: true };
      });
    }
  } finally { for (const k of keys) { if (env[k] === undefined) delete process.env[k];else process.env[k] = env[k]; } }
  const result = { schema: "helmut-single-write-capture-pure-v1", pass: true, checks, codecSHA256: sha(source), referenceSHA256: referenceSHA, runtimeRAMProof: false, database: false, full500: false, activation: false, production: false, paidProviderCalls: 0 };
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ pass: true, groups: checks.length, runtimeRAMProof: false }));
}
main().catch(e => { console.error(e);process.exitCode = 1; });
