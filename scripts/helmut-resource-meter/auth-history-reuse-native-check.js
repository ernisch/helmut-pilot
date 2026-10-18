"use strict";
// Real isolated PG/PostgREST checks only; no activation or provider execution.
const assert=require("node:assert/strict"),crypto=require("node:crypto");
const VERSION="verified-history-reuse-v1",sha=s=>crypto.createHash("sha256").update(s).digest("hex");
const lit=s=>"'"+String(s).replaceAll("'","''")+"'",json=x=>lit(JSON.stringify(x))+"::jsonb";
module.exports.run=async function({sql,rpc,storage,U,wire,copy,omitRevision}){
 const checks=[],nonHistory=x=>{const d=omitRevision(x);delete d.llmUsage;return d;};
 const original=await storage.readAuthStore({strict:true}),untouched=nonHistory(original),history=copy(original.llmUsage);
 async function check(name,fn){const tick=performance.now();try{await fn();checks.push({name,pass:true,wallMS:performance.now()-tick});}catch(error){error.nativeCase=name;throw error;}}
 async function cold(){delete process.env.HELMUT_AUTH_HISTORY_READ_REUSE;await storage.readAuthStore({strict:true});process.env.HELMUT_AUTH_HISTORY_READ_REUSE=VERSION;}
 const contextBody=options=>options?.body?JSON.parse(options.body):null;
 async function observe(fn){const before=global.fetch,seen=[];global.fetch=async(url,options)=>{const r=await before(url,options);if(String(url).includes("/helmut_auth_state_graph_read_v1")){const value=await r.json();seen.push({request:contextBody(options),value});return new Response(JSON.stringify(value),{status:r.status,headers:r.headers});}return r;};try{await fn(seen);}finally{global.fetch=before;}return seen;}
 async function corrupted(mutator){const before=global.fetch;let calls=0;global.fetch=async(url,options)=>{const r=await before(url,options);if(String(url).includes("/helmut_auth_state_graph_read_v1")){calls++;const value=await r.json();mutator(value,contextBody(options));return new Response(JSON.stringify(value),{status:r.status,headers:r.headers});}return r;};try{await assert.rejects(storage.readAuthStore({strict:true}));assert.equal(calls,1);}finally{global.fetch=before;}}
 function digest(r,nonce){const p=r.proof,s=r.state;return sha([VERSION,nonce,sha("main-auth"),r.data._authStoreRevision,s.version,s.generation,s.root,s.originalHash,p.generation,p.count,p.head,p.originalHash,r.historyReuse.reused?"1":"0"].join("|"));}
 await check("actual-cold-warm-history-omission-exact-content-and-fresh-revision",async()=>{
  await cold();const seen=await observe(async()=>{const a=await storage.readAuthStore({strict:true}),b=await storage.readAuthStore({strict:true});assert.deepEqual(omitRevision(a),omitRevision(b));assert(Object.isFrozen(b.llmUsage)&&b.llmUsage.every(Object.isFrozen));assert.throws(()=>{b.llmUsage[0].model="changed";});});
  assert.equal(seen.length,2);assert.equal(seen[0].request.knownProof,null);assert.equal(seen[0].value.historyReuse.reused,false);assert(Array.isArray(seen[0].value.data.llmUsage));assert(seen[1].request.knownProof);assert.equal(seen[1].value.historyReuse.reused,true);assert(!Object.hasOwn(seen[1].value.data,"llmUsage"));assert.notEqual(seen[0].request.readNonce,seen[1].request.readNonce);assert(seen.every(s=>Array.isArray(s.value.graph.nodes)&&s.value.graph.nodes.length>0));
 });
 await check("legacy-reader-shape-stale-proof-full-data-and-role-scope",async()=>{
  const full=await rpc("helmut_auth_state_graph_read_v1",{id:"main-auth"});assert.deepEqual(Object.keys(full).sort(),["data","graph","proof","state"]);
  const stale={...full.proof,head:"0".repeat(64)},r=await rpc("helmut_auth_state_graph_read_v1",{id:"main-auth",knownProof:stale,readNonce:crypto.randomUUID()});assert.equal(r.historyReuse.reused,false);assert.deepEqual(r.data.llmUsage,full.data.llmUsage);
  await assert.rejects(rpc("helmut_auth_state_graph_read_v1",{id:"foreign-auth",knownProof:full.proof,readNonce:crypto.randomUUID()}));
  assert.throws(()=>sql("BEGIN;SET LOCAL ROLE bench_denied;SELECT public.helmut_auth_state_graph_read_v1("+json({id:"main-auth",knownProof:full.proof,readNonce:crypto.randomUUID()})+");ROLLBACK;"));
  for(const args of [{id:"main-auth",knownProof:null},{id:"main-auth",knownProof:{},readNonce:crypto.randomUUID()},{id:"main-auth",knownProof:null,readNonce:"invalid"},{id:"main-auth",knownProof:null,readNonce:crypto.randomUUID(),unexpected:true}])await assert.rejects(rpc("helmut_auth_state_graph_read_v1",args));
 });
 await check("nonce-digest-and-no-private-cache-fail-closed-without-retry",async()=>{
  await corrupted(r=>{r.historyReuse.nonce=crypto.randomUUID();});
  let seen=await observe(()=>storage.readAuthStore({strict:true}));assert.equal(seen[0].request.knownProof,null);
  await corrupted(r=>{r.historyReuse.binding="0".repeat(64);});
  await cold();await corrupted((r,b)=>{r.historyReuse.reused=true;delete r.data.llmUsage;r.historyReuse.binding=digest(r,b.readNonce);});
  seen=await observe(()=>storage.readAuthStore({strict:true}));assert.equal(seen[0].request.knownProof,null);
 });
 await check("concurrent-CAS-one-winner-complete-history-no-double-booking",async()=>{
  const a=await storage.readAuthStore({strict:true}),b=await storage.readAuthStore({strict:true}),count=a.llmUsage.length;
  const row=i=>({id:"history-concurrent-"+crypto.randomUUID(),createdAt:new Date().toISOString(),model:"none",estimatedCost:0,keinAufruf:true,synthetic:i});
  const results=await Promise.allSettled([storage.writeAuthStore({...a,llmUsage:[row(1),...a.llmUsage]}),storage.writeAuthStore({...b,llmUsage:[row(2),...b.llmUsage]})]);assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(results.filter(r=>r.status==="rejected"&&r.reason.code==="AUTH_STORE_CONFLICT").length,1);
  const after=await storage.readAuthStore({strict:true});assert.equal(after.llmUsage.length,count+1);assert.deepEqual(nonHistory(after),untouched);
 });
 await check("unknown-ACK-never-caches-unconfirmed-state-or-retries",async()=>{
  const beforeData=await storage.readAuthStore({strict:true}),before=global.fetch;let calls=0;
  global.fetch=async(...args)=>{const r=await before(...args);if(String(args[0]).includes("/helmut_auth_state_cas_v1")){calls++;await r.arrayBuffer();throw Error("local-lost-history-ACK");}return r;};let result;
  try{result=await storage.recordLlmUsage({model:"none",callType:"skipped-local-history-ack",keinAufruf:true,success:false});}finally{global.fetch=before;}
  assert.equal(result,null);assert.equal(calls,1);assert.equal(U.confirmed(result),false);const seen=await observe(()=>storage.readAuthStore({strict:true}));assert.equal(seen[0].value.historyReuse.reused,false);assert.equal(seen[0].value.proof.count,beforeData.llmUsage.length+1);
 });
 await check("actual-persisted-record-and-NULL-drift-reject-in-rollback-only-native-snapshot",async()=>{
  const envelope=await rpc("helmut_auth_state_graph_read_v1",{id:"main-auth"}),before=sql("SELECT encode(sha256(convert_to(data::text,'UTF8')),'hex')FROM public.helmut_store WHERE id='main-auth';");
  for(const value of ["usage_record=null::jsonb","usage_record=jsonb_set(usage_record,'{model}','\"tampered\"'::jsonb)","usage_prev_hash=null"]){
   const request={id:"main-auth",knownProof:envelope.proof,readNonce:crypto.randomUUID()};
   assert.throws(()=>sql("BEGIN;ALTER TABLE public.llm_usage DISABLE TRIGGER helmut_usage_record_immutable_local;UPDATE public.llm_usage SET "+value+" WHERE usage_store_id='main-auth'AND usage_ordinal=2;SELECT public.helmut_auth_state_graph_read_v1("+json(request)+");ROLLBACK;"));
   assert.equal(sql("SELECT encode(sha256(convert_to(data::text,'UTF8')),'hex')FROM public.helmut_store WHERE id='main-auth';"),before);
   const after=await storage.readAuthStore({strict:true});assert.deepEqual(nonHistory(after),untouched);
  }
 });
 await check("process-restart-and-target-change-use-full-native-history",async()=>{
  const path=require.resolve("../../lib/helmut/llm-usage-atomic"),before=require.cache[path];delete require.cache[path];const fresh=require(path);let requests=[];
  async function request(route,options){requests.push(JSON.parse(options.body));return rpc("helmut_auth_state_graph_read_v1",JSON.parse(options.body));}
  try{const a=await fresh.read({request,rowId:"main-auth",target:"isolated-history-restart-A"});assert.equal(requests[0].knownProof,null);assert.deepEqual(nonHistory(a),untouched);await fresh.read({request,rowId:"main-auth",target:"isolated-history-restart-B"});assert.equal(requests[1].knownProof,null);}finally{require.cache[path]=before;}
 });
 await check("oversized-immutable-history-falls-back-without-changing-valid-data",async()=>{
  const a=await storage.readAuthStore({strict:true});const row={id:"history-bound-"+crypto.randomUUID(),createdAt:new Date().toISOString(),model:"none",estimatedCost:0,keinAufruf:true,syntheticPayload:"x".repeat(6*1024*1024)};
  await storage.writeAuthStore({...a,llmUsage:[row,...a.llmUsage]});
  const seen=await observe(async()=>{await storage.readAuthStore({strict:true});await storage.readAuthStore({strict:true});});assert.equal(seen.length,2);assert(seen.every(s=>s.request.knownProof===null&&s.value.historyReuse.reused===false&&Array.isArray(s.value.data.llmUsage)));
 });
 const after=await storage.readAuthStore({strict:true});assert.deepEqual(nonHistory(after),untouched);assert.deepEqual(after.llmUsage.slice(3),history);assert.equal(after.llmUsage.length,history.length+3);assert.equal(new Set(after.llmUsage.map(r=>r.id)).size,after.llmUsage.length);
 return {checks,originalHistoryRows:history.length,finalHistoryRows:after.llmUsage.length,intentionalSyntheticZeroCostRows:3,allOtherFieldsEqual:true,originalHistoryExact:true,actualProfileTableAbsent:sql("SELECT to_regclass('public.mandate_profiles')IS NULL;")==="t",activation:false,full500:false,GOClaimed:false,production:false,paidProviderCalls:0};
};
