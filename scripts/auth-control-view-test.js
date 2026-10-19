"use strict";

// Pure mock-native protocol tests. Real Parts/Atomic code, no HTTP or SQL.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ROOT = path.resolve(__dirname, "..");
const PARTS_FILE = path.join(ROOT, "lib/helmut/auth-state-parts.js");
const ATOMIC_FILE = path.join(ROOT, "lib/helmut/llm-usage-atomic.js");
const EU = require("../lib/helmut/synthetik-500-eu-service-contract");
const CONTROL = "verified-control-view-v1", HISTORY = "verified-history-reuse-v1", GRAPH = "verified-graph-reuse-v1";
const KEYS = ["synthetik500DispatchJournal", "synthetik500KostenAdmission", "testKostenAuftrag", "testKostenTage"];
const CAP = 2 * 1024 * 1024;
const sha = text => crypto.createHash("sha256").update(text).digest("hex");
const copy = x => JSON.parse(JSON.stringify(x));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ENV = { SUPABASE_URL: "http://127.0.0.1", HELMUT_AUTH_STATE_STORAGE: "merkle-auth-v1",
  HELMUT_LLM_USAGE_STORAGE: "relational-atomic-v1", HELMUT_AUTH_HISTORY_READ_REUSE: HISTORY,
  HELMUT_AUTH_CONTROL_READ: CONTROL };

const PROBE = String.raw`
Object.defineProperty(module.exports, "__test", { enumerable: false, value: {
  control: () => {
    const c = controlCache;
    if (!c) return null;
    const parsed = JSON.parse(c.text);
    return { keys: Object.keys(c).sort(), controlKeys: Object.keys(parsed).sort(),
      bytes: c.bytes, actualBytes: Buffer.byteLength(c.text, "utf8"),
      target: c.target, rowId: c.rowId, root: c.state.root, nodeCount: c.nodeCount,
      nodeDigest: c.nodeDigest, token: Boolean(c.token), frozen: Object.isFrozen(c),
      retainedObjects: Object.entries(c).filter(([k,v]) => v !== null && typeof v === "object"
        && !["state", "token"].includes(k)).map(([k]) => k),
      stateKeys: Object.keys(c.state).sort(), graphCachePresent: graphCache !== null };
  }
} });
`;

function compile(source, filename, parts) {
  const m = new Module(filename, module); m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  if (parts) { const real = m.require.bind(m); m.require = name => name === "./auth-state-parts" ? parts : real(name); }
  m._compile(source, filename); return m.exports;
}
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
function expectedView(auth, revision) {
  return { ...Object.fromEntries(KEYS.filter(k => Object.hasOwn(auth, k)).map(k => [k, copy(auth[k])])), _authStoreRevision: revision };
}
function assertFrozen(value) {
  if (value && typeof value === "object") { assert(Object.isFrozen(value)); for (const v of Object.values(value)) assertFrozen(v); }
}
function fixture(label = "a") {
  return {
    synthetik500DispatchJournal: { version: "helmut-synthetik500-dispatch-journal/1", activeOperationId: "synthetik500-local-" + label,
      operations: { active: { state: "running", claimId: "claim-" + label, stopRequested: false, index: 0,
        inFlight: { index: 0, intentIds: ["local-intent"] }, units: [{ entered: true, kind: "DR" }], attempts: {}, outputs: {} } } },
    synthetik500KostenAdmission: { planHash: sha("plan-" + label), plan: { startsAtUTC: "2026-10-19T00:00:00.000Z",
      endsAtUTC: "2026-10-19T08:59:59.999Z", intents: [{ id: "local-intent", phase: "D" }] }, consumed: {}, reviewBindings: {}, draftCompletions: {} },
    testKostenAuftrag: { version: EU.ORDER_VERSION, serviceContractHash: EU.HASH, bookCapacity: 40, runDayUTC: "2026-10-19" },
    testKostenTage: { "2026-10-18": { calls: {}, spent: 0, baseline: 0 }, "2026-10-19": { calls: {}, spent: 0, baseline: 0, frozen: null } },
    llmUsage: [{ id: "historical-a", createdAt: "2026-10-18T10:00:00.000Z" }, { id: "historical-b", createdAt: "2026-10-18T11:00:00.000Z" }],
    unrelatedPrivateContent: { text: "not-control-".repeat(2200), nested: { unchanged: true } }
  };
}

// Construct the existing native response format, independently of Atomic's
// verification helpers. These are protocol mocks, not native SQL evidence.
function bindings(r, id, nonce) {
  const s = r.state, p = r.proof, revision = r.data._authStoreRevision;
  if (r.historyReuse) r.historyReuse.binding = sha([HISTORY, nonce, sha(id), revision,
    s.version, s.generation, s.root, s.originalHash, p.generation, p.count, p.head, p.originalHash,
    r.historyReuse.reused ? "1" : "0"].join("|"));
  if (r.graphReuse) r.graphReuse.binding = sha([GRAPH, nonce, sha(id), revision,
    s.version, s.generation, s.root, s.originalHash, p.generation, p.count, p.head, p.originalHash,
    r.graphReuse.nodeCount, r.graphReuse.nodeDigest, r.graphReuse.reused ? "1" : "0"].join("|"));
  return r;
}
function server(_clientParts, initial = fixture()) {
  // A separate decoder instance prevents mock construction from priming the
  // client's lastCanonicalRoot or its private decoded-graph cache.
  const Parts = compile(fs.readFileSync(PARTS_FILE, "utf8"), PARTS_FILE);
  const events = [], nodeMap = new Map(); let auth = copy(initial), revision = crypto.randomUUID();
  let state = { version: Parts.VERSION, generation: crypto.randomUUID(), root: "", originalHash: sha("original-state") };
  let proof = { generation: crypto.randomUUID(), count: auth.llmUsage.length, head: sha(JSON.stringify(auth.llmUsage)), originalHash: sha("original-history") };
  let g;
  function rebuild(input, preserve = false) {
    auth = copy(input); const built = Parts.build(auth); state = { ...state, root: built.root };
    if (!preserve) nodeMap.clear(); for (const n of built.nodes) nodeMap.set(n.hash, n);
    const hashes = built.hashes; g = { root: built.root, nodes: [...nodeMap.values()].filter(n => hashes.has(n.hash)) };
  }
  rebuild(auth);
  function response(body, { forceFullHistory = false } = {}) {
    const conditional = Object.hasOwn(body, "knownGraph"), h = !forceFullHistory && body.knownProof && equal(body.knownProof, proof);
    const digest = sha(g.nodes.map(n => n.hash).join("|")), known = body.knownGraph;
    const reused = Boolean(conditional && known && equal(known.state, state));
    if (reused) { assert.equal(known.nodeCount, g.nodes.length); assert.equal(known.nodeDigest, digest); }
    const r = { data: { _authStoreRevision: revision, ...(h ? {} : { llmUsage: copy(auth.llmUsage) }) },
      proof: copy(proof), state: copy(state), graph: reused ? null : copy(g),
      historyReuse: { version: HISTORY, nonce: body.readNonce, reused: Boolean(h), binding: "" } };
    if (conditional) r.graphReuse = { version: GRAPH, nonce: body.readNonce, reused, actualPayloadsChecked: reused,
      nodeCount: g.nodes.length, nodeDigest: digest, binding: "" };
    return bindings(r, body.id, body.readNonce);
  }
  async function request(endpoint, options) {
    assert.equal(options.method, "POST"); const body = JSON.parse(options.body);
    events.push({ endpoint, body });
    if (endpoint === "/rest/v1/rpc/helmut_auth_state_graph_read_v1") return response(body);
    assert.equal(endpoint, "/rest/v1/rpc/helmut_auth_state_cas_v1");
    assert.equal(body.expectedRevision, revision); assert.deepEqual(body.expectedState, state); assert.deepEqual(body.expectedProof, proof);
    for (const n of body.nodes) { assert.equal(sha(n.payload), n.hash); nodeMap.set(n.hash, n); }
    const reachable = new Set(), walk = h => {
      if (reachable.has(h)) return; reachable.add(h); const n = nodeMap.get(h); assert(n);
      const [tag, content] = JSON.parse(n.payload);
      if (tag !== "v") for (const x of content) walk(tag === "o" || tag === "m" ? x[1] : x);
    }; walk(body.root);
    const next = { root: body.root, nodes: [...nodeMap.values()].filter(n => reachable.has(n.hash)) };
    const decoded = Parts.decode(next, next.root, "mock-native-writer");
    auth = { ...decoded.data, llmUsage: [...copy(body.additions), ...auth.llmUsage] };
    revision = body.revision; state = { ...state, root: body.root }; g = next;
    if (body.additions.length) proof = { ...proof, count: auth.llmUsage.length, head: sha(JSON.stringify(auth.llmUsage)) };
    return [{ id: body.id, revision, state: copy(state), proof: copy(proof) }];
  }
  return { request, response, events, auth: () => copy(auth), state: () => copy(state), revision: () => revision,
    graph: () => copy(g), proof: () => copy(proof), bumpRevision: () => { revision = crypto.randomUUID(); },
    change: input => { rebuild(input, true); revision = crypto.randomUUID(); } };
}

async function run() {
  const sources = { parts: fs.readFileSync(PARTS_FILE, "utf8"), atomic: fs.readFileSync(ATOMIC_FILE, "utf8") };
  assert.equal(sha(sources.parts), "6b1236aec6858a03dc099e272bdcdd9f79df3efa8c8744d42c5e193e5d57b3d9", "original Parts decoder must remain unchanged");
  const envKeys = [...Object.keys(ENV), "HELMUT_AUTH_GRAPH_READ_REUSE", "HELMUT_AUTH_SINGLE_WRITE_CAPTURE", "HELMUT_AUTH_DECODE_RETENTION", "VERCEL"];
  const saved = envKeys.map(k => [k, process.env[k]]);
  for (const k of envKeys) delete process.env[k]; Object.assign(process.env, ENV);
  const results = []; let negativeCases = 0;
  function fresh() {
    const parts = compile(sources.parts, PARTS_FILE), count = { decode: 0 };
    const decode = parts.decode; parts.decode = (...args) => { count.decode++; return decode(...args); };
    const u = compile(sources.atomic + PROBE, ATOMIC_FILE, parts);
    assert.equal(typeof u.readControl, "function"); return { parts, u, count };
  }
  const opts = (s, extra = {}) => ({ request: s.request, rowId: "main-auth", target: "local-test|main-auth", ...extra });
  const check = async (name, fn) => { await fn(); results.push({ name, pass: true }); };
  function cache(u) {
    const p = u.__test.control(); assert(p); assert(p.bytes <= CAP); assert.equal(p.bytes, p.actualBytes);
    assert.deepEqual(p.controlKeys, [...KEYS].sort()); assert.deepEqual(p.retainedObjects, []);
    assert.deepEqual(p.keys, ["target", "rowId", "state", "nodeCount", "nodeDigest", "token", "text", "bytes"].sort());
    assert.deepEqual(p.stateKeys, ["version", "generation", "root", "originalHash"].sort());
    assert(p.token && p.frozen && !p.graphCachePresent); return p;
  }
  try {
    await check("strict-local-mode-prerequisites-and-independent-graph-mode-remains-off", async () => {
      const { u } = fresh(); assert(u.enabled({ ...ENV })); assert(u.controlReadEnabled({ ...ENV }));
      for (const extra of [{ HELMUT_AUTH_CONTROL_READ: "forged" }, { HELMUT_AUTH_STATE_STORAGE: "blob" },
        { HELMUT_LLM_USAGE_STORAGE: "blob" }, { HELMUT_AUTH_HISTORY_READ_REUSE: "off" },
        { HELMUT_AUTH_GRAPH_READ_REUSE: GRAPH }, { HELMUT_AUTH_SINGLE_WRITE_CAPTURE: "single-write-capture-v1" },
        { SUPABASE_URL: "https://127.0.0.1" }, { SUPABASE_URL: "http://example.invalid" }, { VERCEL: "1" }])
        assert.throws(() => u.enabled({ ...ENV, ...extra }));
      assert.equal(u.controlReadEnabled({ ...ENV, HELMUT_AUTH_CONTROL_READ: "off" }), false);
    });
    await check("full-original-read-seeds-private-four-field-text-before-caller-mutation", async () => {
      const { u, parts, count } = fresh(), s = server(parts), o = opts(s), full = await u.read(o);
      assert(u.hasSnapshot(full)); assert.equal(count.decode, 1); cache(u);
      full.testKostenTage["2026-10-19"].spent = 999; full.synthetik500KostenAdmission.plan.intents[0].phase = "forged";
      const view = await u.readControl(o); assert.deepEqual(view, expectedView(s.auth(), s.revision()));
      assert.equal(count.decode, 1, "warm control must not decode the full graph");
      assert(s.events.at(-1).body.knownGraph); assertFrozen(view);
      assert(!Object.hasOwn(view, "llmUsage") && !Object.hasOwn(view, "unrelatedPrivateContent"));
      assert.throws(() => { view.testKostenTage["2026-10-19"].spent = 1; }, TypeError);
      assert.throws(() => { view.synthetik500KostenAdmission.plan.intents.push({}); }, TypeError);
      const again = await u.readControl(o); assert.notStrictEqual(view, again); assert.notStrictEqual(view.testKostenTage, again.testKostenTage);
    });
    await check("projection-and-spread-copy-never-acquire-write-or-CAS-authority", async () => {
      const { u, parts } = fresh(), s = server(parts), o = opts(s), view = await u.readControl(o);
      assert(!u.hasSnapshot(view)); assert.equal(Object.getOwnPropertySymbols(view).length, 0);
      const before = s.events.length;
      for (const value of [view, { ...view }, copy(view)]) await assert.rejects(u.write(value, o), { code: "AUTH_STORE_SNAPSHOT_MISSING" });
      assert.equal(s.events.length, before, "projection rejection must precede the request boundary");
    });
    await check("same-root-new-revision-accepted-but-changed-root-full-decodes", async () => {
      const { u, parts, count } = fresh(), s = server(parts), o = opts(s);
      await u.readControl(o); s.bumpRevision(); const same = await u.readControl(o);
      assert.equal(same._authStoreRevision, s.revision()); assert.equal(count.decode, 1);
      const next = s.auth(); next.synthetik500DispatchJournal.operations.active.stopRequested = true; s.change(next);
      const changed = await u.readControl(o); assert.deepEqual(changed, expectedView(next, s.revision()));
      assert.equal(count.decode, 2); cache(u);
    });
    await check("foreign-target-row-and-process-restart-never-use-foreign-hints", async () => {
      const { u, parts, count } = fresh(), s = server(parts), o = opts(s);
      await u.readControl(o);
      await u.readControl(opts(s, { target: "other-target|main-auth" })); assert.equal(s.events.at(-1).body.knownGraph, null);
      await u.readControl(opts(s, { target: "other-target|other-row", rowId: "other-row" })); assert.equal(s.events.at(-1).body.knownGraph, null);
      assert.equal(count.decode, 3);
      const restarted = fresh(); await restarted.u.readControl(opts(s)); assert.equal(s.events.at(-1).body.knownGraph, null);
      assert.equal(restarted.count.decode, 1);
    });
    await check("full-writer-keeps-every-control-field-and-ACK-does-not-seed-control-cache", async () => {
      const { u, parts, count } = fresh(), s = server(parts), o = opts(s), full = await u.read(o);
      const previous = cache(u); full.testKostenTage["2026-10-19"].spent = 17;
      full.synthetik500KostenAdmission.consumed["local-intent"] = { ticket: "synthetic-only" };
      const expected = Object.fromEntries(KEYS.map(k => [k, copy(full[k])]));
      const written = await u.write(full, o); assert(u.hasSnapshot(written));
      for (const k of KEYS) assert.deepEqual(written[k], expected[k]);
      assert.equal(cache(u).root, previous.root, "ACK must not manufacture a native graph digest/cache");
      const before = count.decode, view = await u.readControl(o); assert.deepEqual(view, expectedView(s.auth(), s.revision()));
      assert.equal(count.decode, before + 1, "changed write root requires an actual full native graph response");
      assert.equal(cache(u).nodeDigest, sha(s.graph().nodes.map(n => n.hash).join("|")));
    });

    const tamper = [
      ["history-nonce", r => { r.historyReuse.nonce = crypto.randomUUID(); }],
      ["history-binding", r => { r.historyReuse.binding = "0".repeat(64); }],
      ["graph-nonce", r => { r.graphReuse.nonce = crypto.randomUUID(); }],
      ["graph-binding", r => { r.graphReuse.binding = "0".repeat(64); }],
      ["proof-missing", r => { delete r.proof; }],
      ["proof-count", r => { r.proof.count++; }],
      ["proof-original-hash", r => { r.proof.originalHash = "f".repeat(64); }],
      ["state-root", (r,b) => { r.state.root = "f".repeat(64); bindings(r,b.id,b.readNonce); }],
      ["state-generation", (r,b) => { r.state.generation = crypto.randomUUID(); bindings(r,b.id,b.readNonce); }],
      ["state-original-hash", (r,b) => { r.state.originalHash = "f".repeat(64); bindings(r,b.id,b.readNonce); }],
      ["graph-count", (r,b) => { r.graphReuse.nodeCount++; bindings(r,b.id,b.readNonce); }],
      ["graph-digest", (r,b) => { r.graphReuse.nodeDigest = "f".repeat(64); bindings(r,b.id,b.readNonce); }],
      ["actual-payloads-not-checked", r => { r.graphReuse.actualPayloadsChecked = false; }],
      ["missing-graph-header", r => { delete r.graphReuse; }],
      ["missing-history-header", r => { delete r.historyReuse; }],
      ["graph-extra-header", r => { r.graphReuse.authorized = true; }],
      ["missing-history-proof-field", r => { delete r.historyReuse.version; }],
      ["revision-missing", r => { delete r.data._authStoreRevision; }],
      ["revision-invalid", (r,b) => { r.data._authStoreRevision = "not-a-revision"; bindings(r,b.id,b.readNonce); }],
      ["extra-data-authority", r => { r.data.authorized = true; }],
      ["injected-history-on-reuse", r => { r.data.llmUsage = []; }],
      ["foreign-row-binding", (r,b) => { bindings(r,"foreign-row",b.readNonce); }],
      ["compact-with-nonnull-graph", (r,b,s) => { r.graph = s.graph(); }]
    ];
    await check("warm-negative-nonce-proof-state-digest-origin-and-header-protocol", async () => {
      for (const [name, mutate] of tamper) {
        const { u, parts } = fresh(), s = server(parts), o = opts(s); await u.readControl(o); let requests = 0;
        const request = async (endpoint, options) => {
          requests++; const b = JSON.parse(options.body), r = await s.request(endpoint, options); mutate(r,b,s); return r;
        };
        await assert.rejects(u.readControl({ ...o, request }), undefined, name); negativeCases++;
        assert.equal(requests, 1, "no retry: " + name); assert.equal(u.__test.control(), null, "captured cache cleared: " + name);
      }
    });
    await check("cold-forgery-full-graph-tamper-and-incomplete-history-reject", async () => {
      for (const name of ["no-private-hint", "full-payload-sha", "missing-node", "wrong-graph-root", "full-history-length"]) {
        const { u, parts } = fresh(), s = server(parts), o = opts(s); let requests = 0;
        const request = async (endpoint, options) => {
          requests++; const b = JSON.parse(options.body), r = await s.request(endpoint, options);
          if (name === "no-private-hint") { r.graph = null; r.graphReuse.reused = r.graphReuse.actualPayloadsChecked = true; }
          if (name === "full-payload-sha") r.graph.nodes[0].payload += " ";
          if (name === "missing-node") { r.graph.nodes.shift(); r.graphReuse.nodeCount--; r.graphReuse.nodeDigest = sha(r.graph.nodes.map(n => n.hash).join("|")); }
          if (name === "wrong-graph-root") r.graph.root = "f".repeat(64);
          if (name === "full-history-length") r.data.llmUsage = [];
          bindings(r,b.id,b.readNonce); return r;
        };
        await assert.rejects(u.readControl({ ...o, request }), undefined, name); negativeCases++;
        assert.equal(requests, 1); assert.equal(u.__test.control(), null);
      }
    });
    await check("warm-full-history-count-is-checked-independently-of-compact-graph", async () => {
      const { u, parts } = fresh(), s = server(parts), o = opts(s); await u.readControl(o);
      const request = async (_endpoint, options) => {
        const b = JSON.parse(options.body), r = s.response(b, { forceFullHistory: true });
        r.data.llmUsage = []; bindings(r,b.id,b.readNonce); return r;
      };
      await assert.rejects(u.readControl({ ...o, request })); negativeCases++;
    });
    await check("two-MiB-control-text-cap-and-large-unrelated-content-not-retained", async () => {
      const { u, parts } = fresh(), initial = fixture(); initial.unrelatedPrivateContent.text = "x".repeat(CAP + 1024);
      const s = server(parts, initial), o = opts(s); await u.readControl(o); assert(cache(u).bytes < 20000);
      const large = fixture(); large.synthetik500DispatchJournal.largeSyntheticMarker = "x".repeat(CAP + 128);
      const l = server(parts, large), isolated = fresh();
      const one = await isolated.u.readControl(opts(l)); assert.deepEqual(one, expectedView(large, l.revision()));
      assert.equal(isolated.u.__test.control(), null); await isolated.u.readControl(opts(l));
      assert.equal(l.events.at(-1).body.knownGraph, null); assert.equal(isolated.count.decode, 2);
    });
    await check("captured-private-hint-survives-concurrent-other-root-response", async () => {
      const { u, parts } = fresh(), a = server(parts, fixture("a")), b = server(parts, fixture("b")), gate = deferred();
      await u.readControl(opts(a)); let pendingResponse;
      const pending = u.readControl(opts(a, { request: async (endpoint, options) => {
        pendingResponse = await a.request(endpoint, options); await gate.promise; return pendingResponse;
      } }));
      await u.read(opts(b)); const rootB = cache(u).root; gate.resolve();
      assert.deepEqual(await pending, expectedView(a.auth(), a.revision())); assert.equal(cache(u).root, rootB);
      await u.readControl(opts(b)); assert(b.events.at(-1).body.knownGraph);
    });
    await check("late-invalid-old-hint-does-not-clear-new-concurrent-cache", async () => {
      const { u, parts } = fresh(), a = server(parts, fixture("old")), b = server(parts, fixture("new")), gate = deferred();
      await u.readControl(opts(a));
      const pending = u.readControl(opts(a, { request: async (endpoint, options) => {
        const r = await a.request(endpoint, options); await gate.promise; r.graphReuse.nonce = crypto.randomUUID(); return r;
      } }));
      const rejected = assert.rejects(pending); await u.read(opts(b)); const rootB = cache(u).root;
      gate.resolve(); await rejected; assert.equal(cache(u).root, rootB);
      const view = await u.readControl(opts(b)); assert.deepEqual(view, expectedView(b.auth(), b.revision()));
      assert(b.events.at(-1).body.knownGraph);
    });
    await check("request-failure-does-not-retry-and-disabled-mode-cannot-readControl", async () => {
      const { u, parts } = fresh(), s = server(parts); await u.readControl(opts(s)); let calls = 0;
      await assert.rejects(u.readControl(opts(s, { request: async () => { calls++; throw Error("synthetic IO failure"); } })));
      assert.equal(calls, 1); assert.equal(u.__test.control(), null);
      process.env.HELMUT_AUTH_CONTROL_READ = "off";
      try { await assert.rejects(u.readControl(opts(s)), { code: "AUTH_CONTROL_READ_MODE_REQUIRED" }); }
      finally { process.env.HELMUT_AUTH_CONTROL_READ = CONTROL; }
    });
    return { pass: true, groups: results, negativeCases,
      sourcePins: [{ path: PARTS_FILE, bytes: Buffer.byteLength(sources.parts), sha256: sha(sources.parts) },
        { path: ATOMIC_FILE, bytes: Buffer.byteLength(sources.atomic), sha256: sha(sources.atomic) }],
      protocolEvidence: "pure mock responses only; no native SQL or integration acceptance",
      production: false, databaseCalls: 0, containerCalls: 0, paidProviderCalls: 0, full500: false, memoryBenefitClaimed: false };
  } finally {
    for (const [key,value] of saved) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}
if (require.main === module) run().then(r => process.stdout.write(JSON.stringify(r, null, 2) + "\n"))
  .catch(e => { process.stderr.write((e.stack || String(e)) + "\n"); process.exitCode = 1; });
module.exports = { run };
