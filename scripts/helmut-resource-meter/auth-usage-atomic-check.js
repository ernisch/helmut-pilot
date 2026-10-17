"use strict";
// Real PostgreSQL/PostgREST, only in a new network-none local small fixture.
const fs = require("node:fs"), assert = require("node:assert/strict"), crypto = require("node:crypto");
const { performance } = require("node:perf_hooks"), { execFileSync } = require("node:child_process");
const receipt = JSON.parse(fs.readFileSync("/bench/STARTED.SAFE.json"));
assert.equal(require("node:os").hostname(), receipt.cid.slice(0, 12));
assert.equal(receipt.scope, "SMALL_DATABASE_OPERATIONS_NO_ACTIVATION_NO_500_RUN");
const [phase, mode, uid, gid] = process.argv.slice(2);
assert(["prepare", "measure", "security"].includes(phase));
assert(["baseline", "atomic", "security"].includes(mode));
assert.equal(process.env.SUPABASE_URL, undefined);
Object.assign(process.env, { HELMUT_STORAGE_BACKEND: "supabase", SUPABASE_URL: "http://127.0.0.1:38419",
  SUPABASE_SERVICE_ROLE_KEY: "local-fixture-not-a-secret", HELMUT_AUTH_STORE_CAS_TRANSPORT: "scalar-jsonb-rpc" });
if (mode !== "baseline") process.env.HELMUT_LLM_USAGE_STORAGE = "relational-atomic-v1";
const rawFetch = global.fetch; const wire = [];
global.fetch = async (url, options = {}) => {
  assert(String(url).startsWith("http://127.0.0.1:38419/rest/v1/"));
  const start = performance.now();
  // The established isolated PostgREST fixture uses its DB-local backend role,
  // not a Supabase JWT service. Only this network-none loopback bridge strips
  // the deliberately fake API credentials and /rest/v1 gateway prefix.
  const headers = { ...options.headers };delete headers.Authorization;delete headers.apikey;
  const response = await rawFetch(String(url).replace("/rest/v1/", "/"), { ...options, headers });
  wire.push({ path: new URL(url).pathname, status: response.status, ms: performance.now() - start,
    requestBytes: Buffer.byteLength(options.body || "") });
  return response;
};
const storage = require("../../lib/helmut/storage"), U = require("../../lib/helmut/llm-usage-atomic");
const copy = x => JSON.parse(JSON.stringify(x));
const omitRevision = x => Object.fromEntries(Object.entries(copy(x)).filter(([k]) => k !== "_authStoreRevision"));
function sql(q) { return execFileSync("psql", ["-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate"], { input: q, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim(); }
function save(name, x) { const p = "/bench/" + name; fs.writeFileSync(p, JSON.stringify(x, null, 2), { mode: 0o600, flag: "wx" }); fs.chownSync(p, +uid, +gid); }
async function rpc(name, body) {
  const r = await global.fetch("http://127.0.0.1:38419/rest/v1/rpc/" + name, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const b = await r.json(); if (!r.ok) { const e = Error("local-rpc-failed"); e.statusCode = r.status; e.code = b.code; throw e; } return b;
}
async function ready() {
  for (let i = 0; i < 60; i++) {
    try { const r = await rawFetch("http://127.0.0.1:38419/helmut_store?select=id"); if (r.ok) return; } catch {}
    await new Promise(r => setTimeout(r, 100));
  } throw Error("local REST unavailable");
}
async function prepare() {
  await ready();const before = JSON.parse(sql("select data::text from public.helmut_store where id='main-auth';"));
  const tick = performance.now(), cpu = process.cpuUsage();
  if (mode !== "baseline") {
    const expectedHash = sql("select encode(sha256(convert_to(data::text,'UTF8')),'hex')from public.helmut_store where id='main-auth';");
    if (mode === "security") {
      await assert.rejects(rpc("helmut_auth_usage_bootstrap_v1", { id: "main-auth", expectedHash: "0".repeat(64) }));
      sql("insert into public.llm_usage(id)select data#>>'{llmUsage,0,id}'from public.helmut_store where id='main-auth';");
      await assert.rejects(rpc("helmut_auth_usage_bootstrap_v1", { id: "main-auth", expectedHash }));
      assert.equal(sql("select count(*)from public.llm_usage;"),"1");
      assert.equal(sql("select data ? '_llmUsageRef'from public.helmut_store where id='main-auth';"),"f");
      assert.equal(sql("select encode(sha256(convert_to(data::text,'UTF8')),'hex')from public.helmut_store where id='main-auth';"),expectedHash);
      sql("delete from public.llm_usage where usage_store_id is null;");
    }
    await rpc("helmut_auth_usage_bootstrap_v1", { id: "main-auth", expectedHash });
    const raw = await rpc("helmut_auth_usage_read_v1", { id: "main-auth" });
    assert.deepEqual(omitRevision(raw.data), omitRevision(before));
    assert.equal(raw.proof.count, before.llmUsage.length);
    assert.equal(raw.proof.originalHash, expectedHash);
  }
  save("BOOTSTRAP_ACCEPTANCE.SAFE.json", { pass: true, mode, wallMS: performance.now() - tick,
    CPUUsec: process.cpuUsage(cpu), originalHistoryRows: before.llmUsage.length, allOriginalLogicalFieldsEqual: true,
    originalHistoryHash: crypto.createHash("sha256").update(JSON.stringify(before.llmUsage)).digest("hex"), wire,
    activation: false, full500: false, GOClaimed: false });
}
async function measure() {
  await ready();const before = await storage.readAuthStore({ strict: true }); const expected = omitRevision(before);
  const additions = [], requests = []; const token = receipt.name.slice(-10);
  for (let i = 0; i < 96; i++) {
    const start = performance.now(), cpu = process.cpuUsage();
    await storage.mutateAuthStore(auth => {
      auth.localUsageMeasure = i + 1;
      if (i % 4 === 0) {
        const row = { id: `local-usage-${token}-${String(i).padStart(3,"0")}`, createdAt: "2026-10-17T12:00:00.000Z",
          model: "none", callType: "skipped-local-storage-measure", promptTokens: 0, completionTokens: 0,
          totalTokens: 0, estimatedCost: 0, success: false, keinAufruf: true, durationMs: 0, error: null,
          serviceContractHash: "synthetic-local-integrity-field", reconciliation: { localSynthetic: true, index: i } };
        additions.unshift(row);auth.llmUsage = [row, ...auth.llmUsage];
      }
    });
    requests.push({ index: i, status: 200, wallMS: performance.now() - start, clientCPUUsec: process.cpuUsage(cpu) });
    fs.writeFileSync("/bench/PROGRESS.SAFE.json", JSON.stringify({ completed: i + 1, unixMS: Date.now() }));
    if (i === 47) {
      fs.writeFileSync("/bench/CHECKPOINT_REQUEST.SAFE.json", JSON.stringify({ completed: 48 }));
      const until = Date.now() + 15000;
      while (!fs.existsSync("/bench/CHECKPOINT_DONE.SAFE.json")) { if (Date.now() > until) throw Error("checkpoint timeout"); await new Promise(r => setTimeout(r, 20)); }
    }
  }
  const after = await storage.readAuthStore({ strict: true });
  expected.localUsageMeasure = 96;expected.llmUsage = [...additions, ...expected.llmUsage];
  assert.deepEqual(omitRevision(after), expected);
  assert.equal(new Set(after.llmUsage.map(r => r.id)).size, after.llmUsage.length);
  save("HTTP_RESULT.SAFE.json", { scope: "96_REAL_STORAGE_CAS_WITH_24_INDIVIDUAL_USAGE_RECORDS_NO_ACTIVATION",
    mode, requests, wire, pass: true, originalFieldsAndHistoryUnchanged: true, originalRecords: before.llmUsage.length,
    newRecords: additions.length, finalRecords: after.llmUsage.length, nodeMaxRSSBytes: process.resourceUsage().maxRSS * 1024,
    paidProviderCalls: 0, activation: false, production: false });
}
async function security() {
  await ready();const checks = [];
  async function check(name, fn) { await fn();checks.push({ name, pass: true }); }
  await check("native-generated-hashes-bind-exact-UTF8-records",async()=>{
    assert.equal(sql("select count(*)from public.llm_usage where usage_store_id='main-auth'and usage_record_hash<>encode(sha256(convert_to(usage_record::text,'UTF8')),'hex');"),"0");
    assert.equal(sql("select count(*)from pg_attribute where attrelid='public.llm_usage'::regclass and attname in('usage_record_hash','usage_chain_hash')and attgenerated='s';"),"2");
    assert.throws(()=>sql("begin;alter table public.llm_usage disable trigger helmut_usage_record_immutable_local;update public.llm_usage set usage_record_hash=repeat('0',64)where usage_store_id='main-auth'and usage_ordinal=1;commit;"),e=>String(e.stderr).includes("428C9"));
    assert.throws(()=>sql("begin read only;set local client_encoding='LATIN1';select public.helmut_auth_usage_read_v1('{\"id\":\"main-auth\"}');rollback;"));
  });
  await check("atomic-mode-with-missing-database-never-writes-local-file",async()=>{
    const a=await storage.readAuthStore();process.env.HELMUT_STORAGE_BACKEND="local";
    try{await assert.rejects(storage.readAuthStore());await assert.rejects(storage.writeAuthStore(a));}
    finally{process.env.HELMUT_STORAGE_BACKEND="supabase";}
  });
  await check("real-record-single-atomic-write-and-truthful-receipt", async () => {
    const before = await storage.readAuthStore();
    const r = await storage.recordLlmUsage({ model: "none", callType: "skipped-local-security", keinAufruf: true,
      success: false, usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, durationMs: 0 });
    assert(r);assert.equal(r._ablage.blob, false);assert(U.confirmed(r));
    const after = await storage.readAuthStore();assert.equal(after.llmUsage.length, before.llmUsage.length + 1);
    assert(U.persisted(after,r));assert(!U.persisted(after,copy(r)));assert(!U.persisted(after,{...r,_ablage:{blob:true}}));
    assert(!U.confirmed({ ...r }));
  });
  await check("legacy-reader-and-writer-blocked-after-cutover", async () => {
    const a = await storage.readAuthStore();process.env.HELMUT_LLM_USAGE_STORAGE = "blob";
    await assert.rejects(storage.readAuthStore());await assert.rejects(storage.writeAuthStore(a));
    process.env.HELMUT_LLM_USAGE_STORAGE = U.VERSION;
    assert.throws(()=>sql("update public.helmut_store set data=data-'_llmUsageRef'where id='main-auth';"));
  });
  await check("stale-CAS-cannot-overwrite-books-or-history", async () => {
    const a = await storage.readAuthStore(), b = await storage.readAuthStore();
    await storage.writeAuthStore({ ...a, localUsageSecurity: "winner" });
    await assert.rejects(storage.writeAuthStore({ ...b, localUsageSecurity: "loser" }), { code: "AUTH_STORE_CONFLICT" });
    assert.equal((await storage.readAuthStore()).localUsageSecurity,"winner");
  });
  await check("simultaneous-native-CAS-one-winner-no-lost-or-double-entry",async()=>{
    const a=await storage.readAuthStore(),b=await storage.readAuthStore(),n=a.llmUsage.length;
    const row=i=>({id:"local-concurrent-"+crypto.randomUUID(),createdAt:new Date().toISOString(),model:"none",estimatedCost:0,localSynthetic:i});
    const outcomes=await Promise.allSettled([storage.writeAuthStore({...a,llmUsage:[row(1),...a.llmUsage]}),storage.writeAuthStore({...b,llmUsage:[row(2),...b.llmUsage]})]);
    assert.equal(outcomes.filter(x=>x.status==="fulfilled").length,1);
    assert.equal(outcomes.filter(x=>x.status==="rejected"&&x.reason.code==="AUTH_STORE_CONFLICT").length,1);
    assert.equal((await storage.readAuthStore()).llmUsage.length,n+1);
  });
  await check("historical-mutation-delete-and-reorder-rejected", async () => {
    const a = await storage.readAuthStore();assert.throws(()=>{a.llmUsage[0].model="forged";});
    await assert.rejects(storage.writeAuthStore({ ...a, llmUsage:a.llmUsage.slice(1) }));
    await assert.rejects(storage.writeAuthStore({ ...a, llmUsage:[a.llmUsage[1],a.llmUsage[0],...a.llmUsage.slice(2)] }));
    assert.throws(()=>sql("update public.llm_usage set usage_record='{}'where usage_store_id='main-auth';"));
    assert.throws(()=>sql("set session_replication_role=replica;delete from public.llm_usage where usage_store_id='main-auth';"));
    assert.throws(()=>sql("truncate public.llm_usage;"));
    assert.throws(()=>sql("truncate public.helmut_store;"));
  });
  await check("duplicate-id-rolls-back-auth-and-all-records", async () => {
    const a=await storage.readAuthStore();const before=omitRevision(a);
    const newRow={id:"local-rollback-"+crypto.randomUUID(),createdAt:new Date().toISOString(),model:"none"};
    await assert.rejects(storage.writeAuthStore({...a,localUsageSecurity:"must-not-commit",llmUsage:[{...a.llmUsage[0]},newRow,...a.llmUsage]}));
    assert.deepEqual(omitRevision(await storage.readAuthStore()),before);
  });
  await check("read-only-native-projection-and-content-chain", async () => {
    const x=sql("begin read only;select public.helmut_auth_usage_read_v1('{\"id\":\"main-auth\"}'::jsonb)->'proof'->>'count';rollback;");
    assert.equal(+x,(await storage.readAuthStore()).llmUsage.length);
    assert.throws(()=>sql("begin;alter table public.llm_usage disable trigger helmut_usage_record_immutable_local;update public.llm_usage set usage_record=jsonb_set(usage_record,'{model}','\"forged\"')where usage_store_id='main-auth'and usage_ordinal=1;select public.helmut_auth_usage_read_v1('{\"id\":\"main-auth\"}');commit;"));
  });
  await check("customer-role-cannot-read-or-execute", async()=>{
    assert.throws(()=>sql("set role bench_denied;select public.helmut_auth_usage_read_v1('{\"id\":\"main-auth\"}');"));
    assert.throws(()=>sql("set role bench_denied;select usage_record from public.llm_usage;"));
    await assert.rejects(rpc("helmut_auth_usage_read_v1",{id:"another-auth-target"}));
  });
  await check("no-replay-after-unknown-ACK-and-no-forged-receipt",async()=>{
    const a=await storage.readAuthStore();let calls=0;
    await assert.rejects(U.write({...a,localUsageUnknownOutcome:true},{rowId:"main-auth",target:"wrong-target",request:()=>{calls++;throw Error("not-called");}}));assert.equal(calls,0);
    const fetchBefore=global.fetch;
    global.fetch=async(...args)=>{const r=await fetchBefore(...args);if(String(args[0]).includes("helmut_auth_usage_cas_v1")){calls++;throw Error("local-lost-ACK");}return r;};
    const r=await storage.recordLlmUsage({model:"none",callType:"skipped-local-lost-ack",keinAufruf:true,success:false});
    global.fetch=fetchBefore;assert.equal(r,null);assert.equal(calls,1);
    const after=await storage.readAuthStore();assert.equal(after.llmUsage.length,a.llmUsage.length+1);
  });
  await check("rollback-restores-complete-legacy-state-with-archive", async()=>{
    const a=await storage.readAuthStore();await assert.rejects(rpc("helmut_auth_usage_restore_v1",{id:"main-auth",expectedRevision:crypto.randomUUID()}));
    await rpc("helmut_auth_usage_restore_v1",{id:"main-auth",expectedRevision:a._authStoreRevision});
    process.env.HELMUT_LLM_USAGE_STORAGE="blob";const b=await storage.readAuthStore();assert.deepEqual(omitRevision(b),omitRevision(a));
    assert(+sql("select count(*)from public.llm_usage where usage_store_id='main-auth';")>=5000);
    await storage.mutateAuthStore(x=>{x.localLegacyAfterRestore=true;});assert((await storage.readAuthStore()).localLegacyAfterRestore);
  });
  save("ATOMIC_SECURITY_RESULT.SAFE.json",{pass:true,checks,wire,activation:false,full500:false,GOClaimed:false,providerCalls:0});
}
(async()=>{if(phase==="prepare")await prepare();else if(phase==="measure")await measure();else await security();})().catch(e=>{console.error(JSON.stringify({error:e.name,code:e.code||null,message:String(e.message).slice(0,160)}));process.exitCode=1;});
