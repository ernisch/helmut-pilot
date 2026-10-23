"use strict";
// Real Parts/Atomic, synthetic in-memory native replies only. No HTTP/SQL/process payload.
const assert = require("node:assert/strict"), crypto = require("node:crypto"), fs = require("node:fs"), path = require("node:path"), Module = require("node:module");
const lib = path.resolve(__dirname, "../lib/helmut"), EU = require("../lib/helmut/synthetik-500-eu-service-contract");
const sha = x => crypto.createHash("sha256").update(x).digest("hex"), copy = x => JSON.parse(JSON.stringify(x));
const operationId = "localUnitDiagnostic-" + "a".repeat(32), prefix = "localUnitDiagnostic:" + "a".repeat(32) + ":";
const names = ["localUnitDiagnosticConsumedGrantsV1", ...["journal", "costs", "reservation", "sendClaim", "review", "result"].map(k => prefix + k)];
const origin = "http://127.0.0.1:32123", target = origin + "|main-auth", rowId = "main-auth";
const generation = "11111111-1111-4111-8111-111111111111", revision = "22222222-2222-4222-8222-222222222222";
const environment = { SUPABASE_URL: origin, HELMUT_STORAGE_BACKEND: "supabase", HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE: "helmut_unit_diagnostic_" + "a".repeat(32),
  HELMUT_LLM_USAGE_STORAGE: "relational-atomic-v1", HELMUT_AUTH_STATE_STORAGE: "merkle-auth-v1",
  HELMUT_AUTH_HISTORY_READ_REUSE: "verified-history-reuse-v1", HELMUT_AUTH_GRAPH_READ_REUSE: "off",
  HELMUT_AUTH_SINGLE_WRITE_CAPTURE: "off", HELMUT_AUTH_CONTROL_READ: "verified-control-view-v1" };
function load(name, imports = {}, probe = null, patches = []) {
  const file = path.join(lib, name + ".js"), module = new Module(file, require.main); module.filename = file; module.paths = require.main.paths;
  const original = module.require.bind(module); module.require = key => Object.hasOwn(imports, key) ? imports[key] : original(key);
  let source = fs.readFileSync(file, "utf8");
  for (const [from, to] of patches) { assert.equal(source.split(from).length, 2); source = source.replace(from, to); }
  if (probe) {
    module.__probe = probe;
    module.__json = { parse: JSON.parse, stringify(value, ...args) {
      if (value && typeof value === "object" && Object.hasOwn(value, "fullStateSentinel") && Object.hasOwn(value, "original")) probe.fullRootSerializations++;
      return JSON.stringify(value, ...args);
    } };
    source = "const JSON = module.__json;\n" + source.replace("function buildInternal(input, reuse, owned, retained = null) {",
      "function buildInternal(input, reuse, owned, retained = null) { module.__probe.builds++;")
      .replace("if (checked) {\n      const result", "if (checked) {\n      if (retained && value.ownRetainedSentinel) module.__probe.ownSubtreeReuses++;\n      const result")
      .replace("function reuseNode(hash) {", "function reuseNode(hash) { module.__probe.reused++;");
  }
  module._compile(source, file); return module.exports;
}
function fixture(alter = () => {}) {
  const data = { fullStateSentinel: true, original: { body: "original-".repeat(4000), nested: { keep: true } },
    synthetik500DispatchJournal: { unchanged: true }, synthetik500KostenAdmission: { unchanged: true }, testKostenTage: {},
    testKostenAuftrag: { version: EU.ORDER_VERSION, serviceContractHash: EU.HASH },
    ...Object.fromEntries(names.map((name, i) => [name, i ? { unchanged: "own-" + i, count: 0 } : { grant: "original" }])) };
  alter(data); return data;
}
function own(data) { return Object.fromEntries(names.map(k => [k, copy(data[k])])); }
function graphFrom(nodes, root) {
  const out = [], seen = new Set();
  function visit(hash) {
    if (seen.has(hash)) return; seen.add(hash);
    const node = nodes.get(hash); assert.ok(node, "every native child exists");
    const [tag, body] = JSON.parse(node.payload);
    if (["o", "m"].includes(tag)) body.forEach(x => visit(x[1]));
    else if (["a", "l"].includes(tag)) body.forEach(visit);
    out.push(copy(node));
  }
  visit(root); return { root, nodes: out };
}
function server(seed = fixture()) {
  const oracle = load("auth-state-parts"), built = oracle.build(seed);
  let nodes = new Map(built.nodes.map(n => [n.hash, n])), root = built.root, rev = revision, history = [{ id: "old-one", value: 1 }];
  let head = sha("initial-history"), reads = 0, writes = 0, last = null, fault = null, hook = null;
  const proof = () => ({ generation, count: history.length, head, originalHash: sha("original-history") });
  const state = () => ({ version: "merkle-auth-v1", generation, root, originalHash: sha("original-state") });
  const api = {
    async request(endpoint, options) {
      const body = JSON.parse(options.body); assert.equal(options.method, "POST"); assert.equal(body.id, rowId);
      if (endpoint.endsWith("graph_read_v1")) {
        reads++;
        const p = proof(), s = state(), reused = JSON.stringify(body.knownProof) === JSON.stringify(p);
        const r = { data: { _authStoreRevision: rev, ...(!reused ? { llmUsage: copy(history) } : {}) }, proof: p, state: s,
          graph: graphFrom(nodes, root), historyReuse: { version: "verified-history-reuse-v1", nonce: body.readNonce, reused,
            binding: sha(["verified-history-reuse-v1", body.readNonce, sha(rowId), rev, s.version, s.generation, s.root, s.originalHash,
              p.generation, p.count, p.head, p.originalHash, reused ? "1" : "0"].join("|")) } };
        if (Object.hasOwn(body, "knownGraph")) {
          const digest = sha(r.graph.nodes.map(n => n.hash).join("|")), count = r.graph.nodes.length;
          const graphReused = Boolean(body.knownGraph && JSON.stringify(body.knownGraph.state) === JSON.stringify(s));
          r.graphReuse = { version: "verified-graph-reuse-v1", nonce: body.readNonce, reused: graphReused,
            actualPayloadsChecked: graphReused, nodeCount: count, nodeDigest: digest,
            binding: sha(["verified-graph-reuse-v1", body.readNonce, sha(rowId), rev, s.version, s.generation, s.root, s.originalHash,
              p.generation, p.count, p.head, p.originalHash, count, digest, graphReused ? "1" : "0"].join("|")) };
          if (graphReused) r.graph = null;
        }
        if (fault === "payload") r.graph.nodes[0].payload += " ";
        if (fault === "nonce") r.historyReuse.nonce = crypto.randomUUID();
        if (fault === "duplicate") r.graph.nodes.push(copy(r.graph.nodes[0]));
        if (fault === "history") r.proof.head = sha("wrong-head");
        return r;
      }
      assert.equal(endpoint, "/rest/v1/rpc/helmut_auth_state_cas_v1"); writes++; last = body;
      assert.deepEqual(Object.keys(body).sort(), ["id", "expectedRevision", "expectedProof", "expectedState", "revision", "root", "nodes", "additions"].sort());
      if (body.expectedRevision !== rev || JSON.stringify(body.expectedProof) !== JSON.stringify(proof())
        || JSON.stringify(body.expectedState) !== JSON.stringify(state())) return [];
      for (const n of body.nodes) { assert.equal(sha(n.payload), n.hash); nodes.set(n.hash, copy(n)); }
      const graph = graphFrom(nodes, body.root), decoded = load("auth-state-parts").decode(graph, body.root, "oracle");
      assert.equal(load("auth-state-parts").build(decoded.data).root, body.root, "cold full-build oracle");
      root = body.root; rev = body.revision;
      if (body.additions.length) { history = [...copy(body.additions), ...history]; head = sha(head + JSON.stringify(body.additions)); }
      if (hook) await hook(body);
      if (fault === "lost") throw Error("synthetic-lost-ACK-after-commit");
      const ack = [{ id: rowId, revision: rev, proof: proof(), state: state() }];
      if (fault === "ack-root") ack[0].state.root = "0".repeat(64);
      if (fault === "ack-original") ack[0].proof.originalHash = "0".repeat(64);
      return ack;
    },
    graph: () => graphFrom(nodes, root), data: () => oracle.decode(graphFrom(nodes, root), root).data,
    external() { rev = crypto.randomUUID(); },
    externalRoot(preserveRevision = false) { const value = api.data(); value.original.external = true; const b = load("auth-state-parts").build(value);
      nodes = new Map(b.nodes.map(n => [n.hash, n])); root = b.root; if (!preserveRevision) rev = crypto.randomUUID(); },
    fault(value) { fault = value; }, hook(value) { hook = value; },
    stats: () => ({ reads, writes, last, root, rev, history })
  }; return api;
}
function subject(patches = [], atomicPatches = [], clock = null) {
  const imports = clock ? { "node:process": { hrtime: { bigint: () => clock.mono } } } : {};
  const probe = { builds: 0, fullRootSerializations: 0, ownSubtreeReuses: 0, reused: 0 }, parts = load("auth-state-parts", imports, probe, patches);
  const atomic = load("llm-usage-atomic", { ...imports, "./auth-state-parts": parts }, null, atomicPatches); return { U: atomic, C: parts, probe };
}
const opts = native => ({ request: native.request, rowId, target, operationId });
let checks = 0;
async function check(name, action) {
  if (process.argv.includes("--review-fixes-only") && !name.startsWith("reviewfix:")) return;
  await action(); checks++; console.log("PASS " + name);
}
(async () => {
  Object.assign(process.env, environment); delete process.env.VERCEL;
  await check("state patch equals old full Auth writer across small, bucket, array and literal-key layouts", async () => {
    for (const shape of [() => {}, x => { for (let i = 0; i < 90; i++) x["outside-" + i] = { body: "b".repeat(200) }; },
      x => { x.original = Array.from({ length: 150 }, (_, i) => ({ id: i, body: "a".repeat(400) })); },
      x => { x.original.literal = JSON.parse('{"__proto__":{"safe":true},"2":"two","10":"ten"}'); }]) {
      const initial = fixture(shape), a = server(initial), b = server(initial), old = subject(), small = subject();
      const before = await old.U.read(opts(a)), view = await small.U.readOwnForMutation(opts(b));
      const next = own(view); next[prefix + "costs"].count++;
      for (const k of names) before[k] = copy(next[k]);
      await old.U.write(before, opts(a)); const accepted = await small.U.writeOwn(view, { state: next }, opts(b));
      assert.equal(small.U.ownWriteConfirmed(accepted), true); assert.equal(small.U.hasSnapshot(accepted), false);
      assert.equal(a.stats().root, b.stats().root); assert.deepEqual(a.stats().last.nodes, b.stats().last.nodes);
      assert.deepEqual(a.data(), b.data()); assert.equal(small.U.hasOwnRead(view), false);
      await assert.rejects(small.U.writeOwn(view, { state: next }, opts(b)), { code: "AUTH_OWN_WITNESS_MISSING" });
    }
  });
  await check("known-root mutation and budget view avoid full-root serialization; defaults retain it", async () => {
    const native = server(fixture(x => { x[prefix + "reservation"] = { ownRetainedSentinel: true, body: "o".repeat(20000) }; })), { U, probe } = subject();
    const view = await U.readOwnForMutation(opts(native)); assert.ok(probe.fullRootSerializations > 0, "cold original fallback");
    const next = own(view); next[prefix + "journal"].count++;
    probe.fullRootSerializations = 0; await U.writeOwn(view, { state: next }, opts(native));
    assert.equal(probe.fullRootSerializations, 0, "only own values and immutable graph metadata");
    assert.ok(probe.ownSubtreeReuses > 0, "actual unchanged own subtree reuses private decoded values after content comparison");
    const builds = probe.builds; const budget = await U.readBudgetView(opts(native));
    assert.equal(probe.builds, builds); assert.equal(probe.fullRootSerializations, 0);
    assert.equal(U.hasSnapshot(budget), false); assert.equal(U.hasOwnRead(budget), false);
    assert.ok(Object.isFrozen(budget) && Object.isFrozen(budget.llmUsage)); assert.equal(Object.hasOwn(budget, "original"), false);
    await U.read(opts(native)); assert.ok(probe.fullRootSerializations > 0, "legacy read API still detaches full Auth");
  });
  await check("retained graph stays identical to full writer through root/leaf, bucket and array boundary growth and shrink", async () => {
    const seed = fixture(x => { x.original = { body: "small" }; }), a = server(seed), b = server(seed), old = subject(), small = subject();
    const layouts = [
      ...[0, 15800, 16400, 0].map(n => ({ body: "s".repeat(n) })),
      ...[16, 17, 33, 16].map(n => Object.fromEntries(Array.from({ length: n }, (_, i) => ["key-" + i, "s".repeat(1100)]))),
      ...[31, 32, 33, 1024, 1025, 0].map(n => Array.from({ length: n }, (_, i) => ({ i, body: "s".repeat(n < 40 ? 2100 : 90) })))
    ];
    for (const layout of layouts) {
      const full = await old.U.read(opts(a)), view = await small.U.readOwnForMutation(opts(b)), next = own(view);
      next[prefix + "review"] = layout;
      for (const key of names) full[key] = copy(next[key]);
      await old.U.write(full, opts(a)); await small.U.writeOwn(view, { state: next }, opts(b));
      assert.equal(a.stats().root, b.stats().root); assert.deepEqual(a.stats().last.nodes, b.stats().last.nodes);
      assert.deepEqual(a.data(), b.data());
    }
  });
  await check("usage append retains root, emits zero nodes, builds nothing and brands only actual ACK receipt", async () => {
    const native = server(), { U, probe } = subject(), view = await U.readOwnForMutation(opts(native));
    const before = native.stats(), builds = probe.builds, serialized = probe.fullRootSerializations;
    const record = { id: crypto.randomUUID(), value: 9 }, result = await U.writeOwn(view, { record }, opts(native));
    assert.equal(native.stats().root, before.root); assert.deepEqual(native.stats().last.nodes, []);
    assert.deepEqual(native.stats().last.additions, [record]); assert.equal(probe.builds, builds); assert.equal(probe.fullRootSerializations, serialized);
    assert.equal(U.confirmed(result.receipt), true); assert.equal(U.confirmed(copy(result.receipt)), false);
    const fresh = await U.read(opts(native)); assert.equal(U.persisted(fresh, result.receipt), true);
    assert.equal(U.hasSnapshot(view), false); assert.equal(view.llmUsage.length, 1);
  });
  await check("caller mutation during in-flight state capture cannot alter committed values or alias branches", async () => {
    const native = server(), { U } = subject(), view = await U.readOwnForMutation(opts(native)), next = own(view);
    const shared = { list: [1] }; next[prefix + "review"] = { a: shared, b: shared };
    let release, arrived; const ready = new Promise(r => { arrived = r; }), hold = new Promise(r => { release = r; });
    native.hook(async () => { arrived(); await hold; }); const pending = U.writeOwn(view, { state: next }, opts(native));
    await ready; shared.list.push(2); release(); await pending;
    const stored = native.data()[prefix + "review"]; assert.deepEqual(stored.a.list, [1]);
    assert.notEqual(stored.a, stored.b); assert.throws(() => { view[prefix + "costs"].count++; });
  });
  await check("mutated usage after send never acquires a receipt and cannot retry", async () => {
    const native = server(), { U } = subject(), view = await U.readOwnForMutation(opts(native)), record = { id: crypto.randomUUID(), value: 1 };
    native.hook(() => { record.value++; });
    await assert.rejects(U.writeOwn(view, { record }, opts(native)), { code: "ATOMIC_USAGE_RECEIPT_CONTENT_CHANGED" });
    await assert.rejects(U.writeOwn(view, { record }, opts(native))); assert.equal(native.stats().writes, 1);
  });
  await check("forged, copied, cross-target and budget views cannot write; invalid use consumes pending witness", async () => {
    for (const kind of ["copy", "target", "budget"]) {
      const native = server(), { U } = subject(), view = await U.readOwnForMutation(opts(native));
      const input = kind === "copy" ? copy(view) : kind === "budget" ? await U.readBudgetView(opts(native)) : view;
      await assert.rejects(U.writeOwn(input, { record: { id: "new" } }, { ...opts(native), ...(kind === "target" ? { target: "http://127.0.0.2|main-auth" } : {}) }));
      await assert.rejects(U.writeOwn(view, { record: { id: "new" } }, opts(native))); assert.equal(native.stats().writes, 0);
    }
  });
  await check("replacement read poisons prior handle; changed grants or malformed exact key set fail before any write", async () => {
    for (const kind of ["replaced", "grant", "extra", "joined-keys"]) {
      const native = server(), { U } = subject(), view = await U.readOwnForMutation(opts(native)), next = own(view);
      next[prefix + "costs"].count++;
      if (kind === "replaced") await U.readOwnForMutation(opts(native));
      if (kind === "grant") next[names[0]].other = true;
      if (kind === "extra") next.original = { injected: true };
      if (kind === "joined-keys") { const [a, b] = [...names].sort().slice(-2); next[a + "|" + b] = {}; delete next[a]; delete next[b]; }
      await assert.rejects(U.writeOwn(view, { state: next }, opts(native))); assert.equal(native.stats().writes, 0);
    }
  });
  await check("external revision conflict, lost ACK and wrong ACKs never confirm or retry", async () => {
    for (const fault of ["conflict", "root-conflict", "lost", "ack-root", "ack-original"]) {
      const native = server(), { U } = subject(), view = await U.readOwnForMutation(opts(native)), next = own(view);
      next[prefix + "journal"].count++;
      if (fault === "conflict") native.external(); else if (fault === "root-conflict") native.externalRoot(true); else native.fault(fault);
      await assert.rejects(U.writeOwn(view, { state: next }, opts(native)));
      await assert.rejects(U.writeOwn(view, { state: next }, opts(native))); assert.equal(native.stats().writes, 1);
    }
  });
  await check("every fresh reply still rejects actual payload, duplicate, nonce and history corruption", async () => {
    for (const fault of ["payload", "duplicate", "nonce", "history"]) {
      const native = server(), { U } = subject(); await U.readBudgetView(opts(native)); native.fault(fault);
      await assert.rejects(U.readOwnForMutation(opts(native))); assert.equal(native.stats().writes, 0);
    }
  });
  await check("external unknown root uses full original materialization again", async () => {
    const native = server(), { U, probe } = subject(); await U.readBudgetView(opts(native));
    const builds = probe.builds; probe.fullRootSerializations = 0; native.externalRoot();
    const view = await U.readBudgetView(opts(native)); assert.ok(probe.builds > builds); assert.ok(probe.fullRootSerializations > 0);
    assert.equal(Object.hasOwn(view, "original"), false); assert.equal(U.hasSnapshot(view), false);
  });
  await check("changed own root freshly validates controls without materializing unrelated full state", async () => {
    const native = server(), { U, probe } = subject(), original = await U.readControl(opts(native));
    const view = await U.readOwnForMutation(opts(native)), next = own(view); next[prefix + "journal"].count++;
    await U.writeOwn(view, { state: next }, opts(native)); probe.fullRootSerializations = 0;
    const control = await U.readControl(opts(native));
    assert.equal(probe.fullRootSerializations, 0); assert.notEqual(control._authStoreRevision, original._authStoreRevision);
    for (const key of ["synthetik500DispatchJournal", "synthetik500KostenAdmission", "testKostenAuftrag", "testKostenTage"])
      assert.deepEqual(control[key], original[key]);
    assert.equal(U.hasSnapshot(control), false); assert.equal(U.hasOwnRead(control), false);
  });
  await check("expiry, discard, oversized own state and duplicate usage fail without native write", async () => {
    for (const kind of ["expiry", "discard", "oversize", "duplicate"]) {
      const native = server(), { U } = subject(), view = await U.readOwnForMutation(opts(native)), next = own(view);
      next[prefix + "journal"].count++;
      if (kind === "discard") U.discardOwnRead(view);
      if (kind === "oversize") next[prefix + "review"].body = "x".repeat(4 * 1024 * 1024);
      const saved = Date.now; if (kind === "expiry") { const at = saved(); Date.now = () => at + 31000; }
      try { await assert.rejects(U.writeOwn(view, kind === "duplicate" ? { record: { id: "old-one" } } : { state: next }, opts(native))); }
      finally { Date.now = saved; }
      assert.equal(native.stats().writes, 0);
    }
  });
  await check("case/database or mode drift cannot reuse a previous unit's mutation handle", async () => {
    for (const key of ["HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE", "HELMUT_STORAGE_BACKEND", "HELMUT_AUTH_CONTROL_READ"]) {
      const native = server(), { U } = subject(), view = await U.readOwnForMutation(opts(native)), saved = process.env[key];
      process.env[key] = "synthetic-other-case";
      try { await assert.rejects(U.writeOwn(view, { record: { id: "new" } }, opts(native))); }
      finally { process.env[key] = saved; }
      await assert.rejects(U.writeOwn(view, { record: { id: "new" } }, opts(native))); assert.equal(native.stats().writes, 0);
    }
  });
  await check("retained original nodes still count toward work, node, payload and depth bounds", async () => {
    const seed = fixture(), baseline = server(seed).graph();
    const cases = [
      { patch: ["MAX_EXPANDED_BYTES = 256 * 1024 * 1024", "MAX_EXPANDED_BYTES = 256 * 1024"],
        value: { body: "w".repeat(100000) }, code: "AUTH_STATE_WORK_LIMIT" },
      { patch: ["MAX_NODES = 20000", "MAX_NODES = " + (baseline.nodes.length + 1)],
        value: { first: "a".repeat(20000), second: "b".repeat(20000) }, code: "AUTH_STATE_NODES_LIMIT" },
      { patch: ["MAX_UNIQUE_BYTES = 32 * 1024 * 1024", "MAX_UNIQUE_BYTES = " + (baseline.nodes.reduce((sum, n) => sum + Buffer.byteLength(n.payload), 0) + 1000)],
        value: { body: "p".repeat(20000) }, code: "AUTH_STATE_PAYLOAD_LIMIT" },
      { patch: ["MAX_DEPTH = 64", "MAX_DEPTH = 6"],
        value: { a: { b: { c: { d: { e: { f: { g: true } } } } } } }, code: "AUTH_STATE_DEPTH_LIMIT" }
    ];
    for (const item of cases) {
      const native = server(seed), { U, probe } = subject([item.patch]), view = await U.readOwnForMutation(opts(native)), next = own(view);
      next[prefix + "review"] = item.value; probe.reused = 0;
      const full = { ...copy(seed), [prefix + "review"]: item.value }, oracle = load("auth-state-parts", {}, null, [item.patch]);
      assert.throws(() => oracle.build(full), { code: item.code }, "cold writer rejects same bounded state");
      await assert.rejects(U.writeOwn(view, { state: next }, opts(native)), { code: item.code });
      if (item.code !== "AUTH_STATE_DEPTH_LIMIT") assert.ok(probe.reused > 0, "actual retained nodes count before rejection");
      assert.equal(native.stats().writes, 0);
    }
  });
  await check("one-use projected reads enforce separate bounded own and immutable history retention", async () => {
    for (const kind of ["own", "history"]) {
      const native = server(), { U } = kind === "own"
        ? subject([["OWN_TEXT_BYTES = 4 * 1024 * 1024", "OWN_TEXT_BYTES = 128"]])
        : subject([], [["OWN_HISTORY_BYTES = 32 * 1024 * 1024", "OWN_HISTORY_BYTES = 16"]]);
      await assert.rejects(U.readOwnForMutation(opts(native)), { code: kind === "own" ? "AUTH_STATE_OWN_LIMIT" : "AUTH_OWN_HISTORY_LIMIT" });
      await assert.rejects(U.writeOwn({}, { record: { id: "new" } }, opts(native)), { code: "AUTH_OWN_WITNESS_MISSING" });
      assert.equal(native.stats().writes, 0);
    }
  });
  await check("reviewfix: object-valued control order metadata never aliases the private validated graph", async () => {
    const { C, probe } = subject(), initial = fixture(x => { x.testKostenAuftrag = {
      version: { nested: { value: "before" } }, serviceContractHash: [{ value: "before" }] }; });
    const graph = C.build(initial), namespace = "review-alias|generation"; probe.fullRootSerializations = 0;
    const first = C.projectControl(graph, graph.root, namespace);
    const expected = copy(first);
    first.order.version.nested.value = "after!"; first.order.serviceContractHash[0].value = "after!";
    const fresh = C.projectControl(graph, graph.root, namespace);
    assert.deepEqual(fresh, expected, "fresh actual payload validation cannot inherit caller metadata mutation");
    assert.equal(probe.fullRootSerializations, 0, "both actual reads used known-root projection rather than a full-clone fallback");
    assert.deepEqual(C.decode(graph, graph.root, namespace).data, initial, "public full read remains original");
    assert.notEqual(first.order.version, fresh.order.version); assert.notEqual(first.order.serviceContractHash, fresh.order.serviceContractHash);
  });
  await check("reviewfix: Parts one-use witness enforces monotonic30 even after wallclock rollback", async () => {
    for (const kind of ["elapsed", "rollback", "wall-forward", "inside"]) {
      const clock = { mono: 0n }, { C } = subject([], [], clock), graph = C.build(fixture()), saved = Date.now;
      let wall = saved(); Date.now = () => wall;
      try {
        const opened = C.openOwnMutation(graph, graph.root, "review-clock|generation", operationId);
        clock.mono = kind === "inside" ? 29000000000n : kind === "wall-forward" ? 1000000000n : 31000000000n;
        if (kind === "rollback" || kind === "inside") wall -= 120000;
        if (kind === "wall-forward") wall += 31000;
        if (kind === "inside") assert.equal(C.captureOwnMutation(opened.token, null).root, graph.root);
        else assert.throws(() => C.captureOwnMutation(opened.token, null), { code: "AUTH_STATE_OWN_WITNESS_MISSING" });
        assert.throws(() => C.captureOwnMutation(opened.token, null), { code: "AUTH_STATE_OWN_WITNESS_MISSING" }, "failed/accepted capture stays consumed");
      } finally { Date.now = saved; }
    }
  });
  await check("reviewfix: Atomic monotonic30 includes read await and wall rollback never reopens the consumed witness", async () => {
    for (const kind of ["read-await", "after-read", "wall-forward", "inside"]) {
      const native = server(), clock = { mono: 0n }, { U } = subject([], [], clock), saved = Date.now;
      let wall = saved(), release, entered; const ready = new Promise(resolve => { entered = resolve; }), hold = new Promise(resolve => { release = resolve; });
      Date.now = () => wall;
      try {
        const pending = U.readOwnForMutation({ ...opts(native), request: async (...args) => {
          const reply = await native.request(...args); entered(); if (kind === "read-await") await hold; return reply;
        } });
        await ready;
        if (kind === "read-await") { clock.mono = 31000000000n; wall -= 120000; release(); }
        const view = await pending;
        if (kind === "after-read") { clock.mono = 31000000000n; wall -= 120000; }
        if (kind === "wall-forward") { clock.mono = 1000000000n; wall += 31000; }
        if (kind === "inside") { clock.mono = 29000000000n; wall -= 120000; }
        assert.equal(U.hasOwnRead(view), kind === "inside");
        if (kind === "inside") assert.equal(U.confirmed((await U.writeOwn(view, { record: { id: "review-clock" } }, opts(native))).receipt), true);
        else await assert.rejects(U.writeOwn(view, { record: { id: "review-clock" } }, opts(native)), { code: "AUTH_OWN_WITNESS_MISSING" });
        await assert.rejects(U.writeOwn(view, { record: { id: "review-clock" } }, opts(native)), { code: "AUTH_OWN_WITNESS_MISSING" });
        assert.equal(native.stats().writes, kind === "inside" ? 1 : 0);
      } finally { Date.now = saved; }
    }
  });
  console.log(JSON.stringify({ schema: "helmut-original-small-mutation-pure/1", pass: true, checks, nativeCalls: 0,
    providerCalls: 0, performanceAcceptance: false, full500: false }));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
