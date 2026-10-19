"use strict";
// Only called by the existing network-none diagnostic fixture. No activation,
// command installation, run authority or production/provider access.
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { performance } = require("node:perf_hooks");
const VERSION = "verified-graph-reuse-v1";
const sha = x => crypto.createHash("sha256").update(x).digest("hex");
const lit = x => "'" + String(x).replaceAll("'", "''") + "'";
const json = x => lit(JSON.stringify(x)) + "::jsonb";

async function run({ sql, rpc, storage, U, copy, omitRevision }) {
  assert.equal(process.env.HELMUT_AUTH_GRAPH_READ_REUSE, VERSION);
  assert.equal(sql("SELECT current_setting('helmut.local_usage_experiment',true)='on' AND to_regclass('public.mandate_profiles')IS NULL;"), "t");
  const checks = [], before = omitRevision(await storage.readAuthStore({ strict: true }));
  async function check(name, fn) {
    const start = performance.now();
    try { const evidence = await fn();checks.push({ name, pass: true, wallMS: performance.now() - start, ...(evidence || {}) }); }
    catch (e) { e.nativeCase = name;throw e; }
  }
  function physical() { return sql("SELECT encode(sha256(convert_to(data::text,'UTF8')),'hex')FROM public.helmut_store WHERE id='main-auth';"); }
  async function cold() {
    delete process.env.HELMUT_AUTH_GRAPH_READ_REUSE;
    try { await storage.readAuthStore({ strict: true }); }
    finally { process.env.HELMUT_AUTH_GRAPH_READ_REUSE = VERSION; }
  }
  async function observe(fn) {
    const previous = global.fetch, seen = [];
    global.fetch = async (url, options) => {
      const r = await previous(url, options);
      if (!String(url).includes("/helmut_auth_state_graph_read_v1")) return r;
      const value = await r.json();seen.push({ request: JSON.parse(options.body), value });
      return new Response(JSON.stringify(value), { status: r.status, headers: r.headers });
    };
    try { await fn(seen); } finally { global.fetch = previous; }
    return seen;
  }
  function digest(r, nonce) {
    const s = r.state, p = r.proof, g = r.graphReuse;
    return sha([VERSION, nonce, sha("main-auth"), r.data._authStoreRevision, s.version, s.generation,
      s.root, s.originalHash, p.generation, p.count, p.head, p.originalHash,
      g.nodeCount, g.nodeDigest, g.reused ? "1" : "0"].join("|"));
  }
  async function corrupted(mutate) {
    const previous = global.fetch;let calls = 0;
    global.fetch = async (url, options) => {
      const r = await previous(url, options);
      if (!String(url).includes("/helmut_auth_state_graph_read_v1")) return r;
      calls++;const value = await r.json();mutate(value, JSON.parse(options.body));
      return new Response(JSON.stringify(value), { status: r.status, headers: r.headers });
    };
    try { await assert.rejects(storage.readAuthStore({ strict: true }));assert.equal(calls, 1); }
    finally { global.fetch = previous; }
  }
  await check("native-cold-warm-same-content-new-nonce-and-alias-free-guards", async () => {
    await cold();let a, b;
    const seen = await observe(async () => { a = await storage.readAuthStore({ strict: true });b = await storage.readAuthStore({ strict: true }); });
    assert.equal(seen[0].request.knownGraph, null);assert.equal(seen[0].value.graphReuse.reused, false);
    assert.equal(seen[1].value.graphReuse.reused, true);assert.equal(seen[1].value.graphReuse.actualPayloadsChecked, true);
    assert.equal(seen[1].value.graph, null);assert.notEqual(seen[0].request.readNonce, seen[1].request.readNonce);
    assert.deepEqual(omitRevision(a), omitRevision(b));
    a.localDiagnosticState.graphCallerOnly = true;
    assert.equal(b.localDiagnosticState.graphCallerOnly, undefined);
    assert.equal((await storage.readAuthStore({ strict: true })).localDiagnosticState.graphCallerOnly, undefined);
    return { fullResponseBytes: Buffer.byteLength(JSON.stringify(seen[0].value)), omittedResponseBytes: Buffer.byteLength(JSON.stringify(seen[1].value)), freshNativePayloadChecks: true };
  });
  await check("same-root-noop-CAS-fresh-revision-and-unchanged-accounting", async () => {
    const a = await storage.readAuthStore({ strict: true });const ack = await storage.writeAuthStore(a);
    const seen = await observe(async () => {
      const b = await storage.readAuthStore({ strict: true });assert.notEqual(a._authStoreRevision, b._authStoreRevision);
      assert.equal(b._authStoreRevision, ack._authStoreRevision);assert.deepEqual(omitRevision(a), omitRevision(b));
    });
    assert.equal(seen[0].value.graphReuse.reused, true);
    return { actualCAS: true, freshRevision: true, noHistoryAppend: true };
  });
  await check("changed-root-full-transport-no-write-ACK-cache-authority", async () => {
    const a = await storage.readAuthStore({ strict: true });a.localDiagnosticState.graphFreshState = "fresh-root";
    const ack = await storage.writeAuthStore(a);
    const seen = await observe(async () => {
      const b = await storage.readAuthStore({ strict: true });assert.equal(b.localDiagnosticState.graphFreshState, "fresh-root");
      assert.equal(b._authStoreRevision, ack._authStoreRevision);await storage.readAuthStore({ strict: true });
    });
    assert.equal(seen[0].value.graphReuse.reused, false);assert.equal(seen[1].value.graphReuse.reused, true);
  });
  await check("response-binding-form-and-private-cache-forgeries-rejected-once", async () => {
    const mutations = [r => { r.graphReuse.nonce = crypto.randomUUID(); }, r => { r.graphReuse.binding = "0".repeat(64); },
      r => { r.graphReuse.actualPayloadsChecked = false; }, r => { r.graphReuse.extra = true; },
      (r, b) => { r.graphReuse.nodeDigest = "0".repeat(64);r.graphReuse.binding = digest(r, b.readNonce); },
      (r, b) => { r.graphReuse.nodeCount++;r.graphReuse.binding = digest(r, b.readNonce); },
      r => { r.graph = { root: r.state.root, nodes: [] }; }];
    for (const mutate of mutations) { await storage.readAuthStore({ strict: true });await corrupted(mutate); }
    await cold();await corrupted((r, b) => {
      r.graphReuse.reused = true;r.graphReuse.actualPayloadsChecked = true;r.graph = null;r.graphReuse.binding = digest(r, b.readNonce);
    });
    const seen = await observe(() => storage.readAuthStore({ strict: true }));assert.equal(seen[0].request.knownGraph, null);
    return { adversarialResponses: mutations.length + 1, automaticRetries: 0 };
  });
  await check("concurrent-older-response-uses-captured-hint-and-stale-CAS-rejects", async () => {
    const base = await storage.readAuthStore({ strict: true });const previous = global.fetch;
    let release, ready;const held = new Promise(r => { release = r; }), entered = new Promise(r => { ready = r; });let first = true;
    global.fetch = async (url, options) => {
      const r = await previous(url, options);
      if (!String(url).includes("/helmut_auth_state_graph_read_v1") || !first) return r;
      first = false;const value = await r.json();assert.equal(value.graphReuse.reused, true);ready();await held;
      return new Response(JSON.stringify(value), { status: r.status, headers: r.headers });
    };
    let pending;
    try {
      pending = storage.readAuthStore({ strict: true });await entered;
      base.localDiagnosticState.graphConcurrentState = "newer";await storage.writeAuthStore(base);
      const newer = await storage.readAuthStore({ strict: true });assert.equal(newer.localDiagnosticState.graphConcurrentState, "newer");
      release();const older = await pending;assert.equal(older.localDiagnosticState.graphConcurrentState, undefined);
      await assert.rejects(storage.writeAuthStore(older), { code: "AUTH_STORE_CONFLICT" });
      assert.equal((await storage.readAuthStore({ strict: true })).localDiagnosticState.graphConcurrentState, "newer");
    } finally { release();global.fetch = previous;if (pending) await pending.catch(() => {}); }
    return { freshNewerStateRetained: true, oldConsistentSnapshotNotWriteAuthority: true };
  });
  await check("native-invalid-hints-roles-and-omit-mode-reject-without-mutation", async () => {
    const full = await rpc("helmut_auth_state_graph_read_v1", { id: "main-auth" }), nativeBefore = physical();
    const knownGraph = { state: full.state, nodeCount: full.graph.nodes.length, nodeDigest: sha(full.graph.nodes.map(n => n.hash).join("|")) };
    const body = { id: "main-auth", knownProof: full.proof, readNonce: crypto.randomUUID(), knownGraph };
    for (const known of [false, {}, { ...knownGraph, nodeCount: 0 }, { ...knownGraph, nodeDigest: "0".repeat(64) },
      { ...knownGraph, state: { ...full.state, unexpected: true } }])
      await assert.rejects(rpc("helmut_auth_state_graph_read_v1", { ...body, knownGraph: known }));
    await assert.rejects(rpc("helmut_auth_state_graph_read_v1", { ...body, id: "foreign-auth" }));
    assert.throws(() => sql("BEGIN;SET LOCAL ROLE bench_denied;SELECT public.helmut_auth_state_graph_read_v1(" + json(body) + ");ROLLBACK;"));
    const args = lit("main-auth") + "," + lit(full.state.generation) + "," + lit(full.state.root);
    for (const suffix of [",false,true", ",true,NULL"])
      assert.throws(() => sql("BEGIN;SELECT public.helmut_auth_state_expand_local_v1(" + args + suffix + ");ROLLBACK;"));
    assert.equal(sql("SELECT count(*)FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='helmut_auth_state_expand_local_v1';"), "1");
    assert.equal(physical(), nativeBefore);
  });
  await check("native-actual-persisted-payload-tamper-rejected-before-reuse", async () => {
    const full = await rpc("helmut_auth_state_graph_read_v1", { id: "main-auth" }), nativeBefore = physical();
    const knownGraph = { state: full.state, nodeCount: full.graph.nodes.length, nodeDigest: sha(full.graph.nodes.map(n => n.hash).join("|")) };
    sql("BEGIN;SET LOCAL statement_timeout='5s';ALTER TABLE public.helmut_auth_state_nodes_local ALTER COLUMN node_hash DROP EXPRESSION;"
        + "ALTER TABLE public.helmut_auth_state_nodes_local DISABLE TRIGGER USER;"
        + "UPDATE public.helmut_auth_state_nodes_local SET payload=payload||' ' WHERE store_id='main-auth'AND generation="
        + lit(full.state.generation) + "AND node_hash=" + lit(full.state.root) + ";DO $tamper$BEGIN BEGIN PERFORM public.helmut_auth_state_graph_read_v1("
        + json({ id: "main-auth", knownProof: full.proof, readNonce: crypto.randomUUID(), knownGraph })
        + ");RAISE EXCEPTION 'tampered-payload-not-rejected';EXCEPTION WHEN others THEN IF SQLERRM IS DISTINCT FROM 'auth-state-actual-payload-hash' THEN RAISE;END IF;END;END;$tamper$;ROLLBACK;");
    assert.equal(physical(), nativeBefore);
    assert.equal(sql("SELECT attgenerated FROM pg_attribute WHERE attrelid='public.helmut_auth_state_nodes_local'::regclass AND attname='node_hash';"), "s");
    await storage.readAuthStore({ strict: true });
    return { actualRowBytesChangedOnlyInsideRolledBackTransaction: true, generatedHashCouldNotStandInForActualSHA: true };
  });
  await check("actual-process-restart-needs-full-native-graph", async () => {
    const code = `const assert=require('node:assert/strict');const U=require(${JSON.stringify(require.resolve("../../lib/helmut/llm-usage-atomic"))});let seen;U.read({rowId:'main-auth',target:'http://127.0.0.1:38419|main-auth',request:async(path,o)=>{seen=JSON.parse(o.body);const r=await fetch('http://127.0.0.1:38419'+path.replace('/rest/v1',''),{...o,headers:{'Content-Type':'application/json'}});assert(r.ok,'local restart HTTP '+r.status);const a=await r.json();assert.equal(a.graphReuse.reused,false);return a;}}).then(()=>{assert.equal(seen.knownGraph,null);console.log(JSON.stringify({pass:true,coldGraph:true}));}).catch(e=>{console.error(JSON.stringify({name:e.name,code:e.code||null,message:String(e.message).slice(0,160)}));process.exitCode=1;});`;
    const result = JSON.parse(execFileSync(process.execPath, ["-e", code], { encoding: "utf8", timeout: 15000 }));
    assert.deepEqual(result, { pass: true, coldGraph: true });
  });
  await check("unknown-mode-public-target-and-incomplete-local-modes-rejected", async () => {
    const env = { SUPABASE_URL: "http://127.0.0.1:38419", HELMUT_LLM_USAGE_STORAGE: "relational-atomic-v1",
      HELMUT_AUTH_STATE_STORAGE: "merkle-auth-v1", HELMUT_AUTH_HISTORY_READ_REUSE: "verified-history-reuse-v1",
      HELMUT_AUTH_GRAPH_READ_REUSE: VERSION };
    assert.equal(U.enabled(env), true);
    for (const delta of [{ HELMUT_AUTH_GRAPH_READ_REUSE: "unknown" }, { HELMUT_AUTH_HISTORY_READ_REUSE: "off" },
      { HELMUT_AUTH_STATE_STORAGE: "blob" }, { SUPABASE_URL: "https://example.supabase.co" }, { VERCEL: "1" }])
      assert.throws(() => U.enabled({ ...env, ...delta }));
  });
  await check("oversize-content-uses-full-transport-and-protected-fields-preserved", async () => {
    const a = await storage.readAuthStore({ strict: true });
    a.localDiagnosticState.graphOversize = Array.from({ length: 4 }, (_, i) => sha("oversize-graph-" + i).repeat(40000));
    await storage.writeAuthStore(a);
    const seen = await observe(async () => { await storage.readAuthStore({ strict: true });await storage.readAuthStore({ strict: true }); });
    assert.equal(seen[0].value.graphReuse.reused, false);assert.equal(seen[1].request.knownGraph, null);
    assert.equal(seen[1].value.graphReuse.reused, false);
    const restore = await storage.readAuthStore({ strict: true });delete restore.localDiagnosticState.graphOversize;
    await storage.writeAuthStore(restore);const after = await storage.readAuthStore({ strict: true });
    for (const key of ["users", "testKostenTage", "testKostenAuftrag", "synthetik500KostenAdmission", "llmUsage"])
      assert.deepEqual(copy(after[key]), copy(before[key]));
    return { cacheLimitBytes: 8 * 1024 * 1024, oversizedWireCacheNotRetained: true,
      actualProfileTableAbsent: sql("SELECT to_regclass('public.mandate_profiles')IS NULL;") === "t" };
  });
  return checks;
}
module.exports = { run };
