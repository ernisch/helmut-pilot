"use strict";
// Called only by the existing fresh network-none diagnostic. No profiles,
// command installation, activation, claim or paid provider calls.
const assert=require("node:assert/strict"),crypto=require("node:crypto"),{performance}=require("node:perf_hooks");
const FLAG="verified-control-view-v1",sha=x=>crypto.createHash("sha256").update(x).digest("hex");
const KEYS=["synthetik500DispatchJournal","synthetik500KostenAdmission","testKostenAuftrag","testKostenTage"];
const project=a=>Object.fromEntries(KEYS.filter(k=>Object.hasOwn(a,k)).map(k=>[k,a[k]]));
const lit=x=>"'"+String(x).replaceAll("'","''")+"'",json=x=>lit(JSON.stringify(x))+"::jsonb";
async function run({sql,rpc,storage,State,U,wire,copy,omitRevision}){
 assert.equal(process.env.HELMUT_AUTH_CONTROL_READ,FLAG);
 assert.equal(sql("SELECT current_setting('helmut.local_usage_experiment')='on' AND to_regclass('public.mandate_profiles')IS NULL;"),"t");
 const checks=[],measurements=[],witness=()=>sql("SELECT encode(sha256(convert_to(data::text,'UTF8')),'hex')FROM public.helmut_store WHERE id='main-auth';");
 const original=await storage.readAuthStore({strict:true}),expected=omitRevision(original);
 const baselineControl=copy(project(original));
 async function check(name,fn){const at=performance.now();try{const detail=await fn();checks.push({name,pass:true,wallMS:performance.now()-at,...detail});}catch(e){e.nativeCase=name;throw e;}}
 async function observe(fn,mutate){const previous=global.fetch,seen=[];global.fetch=async(url,o)=>{const r=await previous(url,o);if(!String(url).includes('/helmut_auth_state_graph_read_v1'))return r;const b=await r.json(),q=JSON.parse(o.body);seen.push({knownGraph:q.knownGraph!==null,nonce:q.readNonce,reused:b.graphReuse?.reused,actualPayloadsChecked:b.graphReuse?.actualPayloadsChecked,responseBytes:Buffer.byteLength(JSON.stringify(b))});if(mutate)mutate(b,q);return new Response(JSON.stringify(b),{status:r.status,headers:r.headers});};try{await fn(seen);}finally{global.fetch=previous;}return seen;}
 const read=()=>storage.readSynthetik500ControlStore();
 const clear=()=>U.controlReadEnabled({...process.env,HELMUT_AUTH_CONTROL_READ:"off"});
 await check("cold-full-original-validation-then-fresh-native-compact-read",async()=>{
  clear();let a,b;const seen=await observe(async()=>{a=await read();b=await read();});
  assert.equal(seen.length,2);assert.equal(seen[0].knownGraph,false);assert.equal(seen[0].reused,false);assert.equal(seen[1].reused,true);assert.equal(seen[1].actualPayloadsChecked,true);assert.notEqual(seen[0].nonce,seen[1].nonce);
  assert.deepEqual(omitRevision(a),baselineControl);assert.deepEqual(omitRevision(b),baselineControl);
  assert(Object.isFrozen(b));assert(Object.isFrozen(b.testKostenTage));assert(Object.isFrozen(b.synthetik500KostenAdmission));
  assert.equal(U.hasSnapshot(b),false);assert.equal(Object.getOwnPropertySymbols(b).length,0);
  return {coldBytes:seen[0].responseBytes,compactBytes:seen[1].responseBytes,allCostBooksAndAdmissionFieldsPreserved:true};
 });
 await check("read-only-view-and-spread-copy-have-no-write-authority",async()=>{
  const view=await read(),before=witness(),at=wire.length;
  await assert.rejects(storage.writeAuthStore(view),{code:"AUTH_STORE_SNAPSHOT_MISSING"});
  await assert.rejects(storage.writeAuthStore({...view}),{code:"AUTH_STORE_SNAPSHOT_MISSING"});
  assert.equal(wire.length,at);assert.equal(witness(),before);
 });
 await check("caller-full-read-mutation-cannot-poison-control-witness",async()=>{
  const a=await storage.readAuthStore({strict:true});a.testKostenAuftrag.id="caller-only-control-mutation";
  assert.deepEqual(omitRevision(await read()),baselineControl);
  assert.equal((await storage.readAuthStore({strict:true})).testKostenAuftrag.id,expected.testKostenAuftrag.id);
 });
 await check("changed-selected-state-cannot-reuse-old-view-and-original-order-restores",async()=>{
  const a=await storage.readAuthStore({strict:true});a.testKostenAuftrag.id="local-control-negative-only";
  await storage.writeAuthStore(a);let changed;const seen=await observe(async()=>{changed=await read();});
  assert.equal(seen[0].reused,false);assert.equal(changed.testKostenAuftrag.id,"local-control-negative-only");
  const actual=await storage.readAuthStore({strict:true});assert.deepEqual(omitRevision(changed),copy(project(actual)));
  actual.testKostenAuftrag.id=expected.testKostenAuftrag.id;await storage.writeAuthStore(actual);
  assert.deepEqual(omitRevision(await read()),baselineControl);
 });
 await check("changed-unselected-field-still-forces-complete-root-validation",async()=>{
  const a=await storage.readAuthStore({strict:true});assert(!Object.hasOwn(a.localDiagnosticState,"controlViewNonce"));a.localDiagnosticState.controlViewNonce="local-diagnostic";await storage.writeAuthStore(a);
  const seen=await observe(async()=>{assert.deepEqual(omitRevision(await read()),baselineControl);});assert.equal(seen[0].reused,false);
  const b=await storage.readAuthStore({strict:true});delete b.localDiagnosticState.controlViewNonce;await storage.writeAuthStore(b);
  assert.deepEqual(omitRevision(await read()),baselineControl);
 });
 await check("same-root-new-revision-is-fresh-read-only-state",async()=>{
  const old=await read(),a=await storage.readAuthStore({strict:true}),ack=await storage.writeAuthStore(a);let next;
  const seen=await observe(async()=>{next=await read();});assert.equal(seen[0].reused,true);assert.notEqual(old._authStoreRevision,next._authStoreRevision);assert.equal(next._authStoreRevision,ack._authStoreRevision);assert.deepEqual(omitRevision(next),baselineControl);
 });
 await check("forged-response-bindings-fail-once-and-invalidate-captured-hint",async()=>{
  const mutations=[r=>{r.graphReuse.nonce=crypto.randomUUID();},r=>{r.graphReuse.binding="0".repeat(64);},r=>{r.graphReuse.actualPayloadsChecked=false;},r=>{r.graphReuse.nodeDigest="0".repeat(64);},r=>{r.historyReuse.binding="0".repeat(64);},r=>{r.state.root="0".repeat(64);}];
  for(const mutate of mutations){await read();const before=witness();const seen=await observe(async()=>{await assert.rejects(read());},mutate);assert.equal(seen.length,1);assert.equal(witness(),before);const cold=await observe(async()=>{await read();});assert.equal(cold[0].knownGraph,false);}
  return {negativeResponseCases:mutations.length,automaticRetries:0};
 });
 await check("native-actual-payload-tamper-is-rejected-before-view-reuse",async()=>{
  const full=await rpc("helmut_auth_state_graph_read_v1",{id:"main-auth"}),before=witness();
  const knownGraph={state:full.state,nodeCount:full.graph.nodes.length,nodeDigest:sha(full.graph.nodes.map(n=>n.hash).join("|"))};
  sql("BEGIN;SET LOCAL statement_timeout='5s';ALTER TABLE public.helmut_auth_state_nodes_local ALTER COLUMN node_hash DROP EXPRESSION;ALTER TABLE public.helmut_auth_state_nodes_local DISABLE TRIGGER USER;UPDATE public.helmut_auth_state_nodes_local SET payload=payload||' ' WHERE store_id='main-auth'AND generation="+lit(full.state.generation)+"AND node_hash="+lit(full.state.root)+";DO $tamper$BEGIN BEGIN PERFORM public.helmut_auth_state_graph_read_v1("+json({id:"main-auth",knownProof:full.proof,readNonce:crypto.randomUUID(),knownGraph})+");RAISE EXCEPTION 'tampered-payload-not-rejected';EXCEPTION WHEN others THEN IF SQLERRM IS DISTINCT FROM 'auth-state-actual-payload-hash' THEN RAISE;END IF;END;END;$tamper$;ROLLBACK;");
  assert.equal(witness(),before);assert.equal(sql("SELECT attgenerated FROM pg_attribute WHERE attrelid='public.helmut_auth_state_nodes_local'::regclass AND attname='node_hash';"),"s");
  assert.deepEqual(omitRevision(await read()),baselineControl);
  return {faultInjectionOnlyInFreshFixture:true,fullRollback:true};
 });
 await check("foreign-target-and-denied-role-remain-inaccessible",async()=>{
  const before=witness();await assert.rejects(rpc("helmut_auth_state_graph_read_v1",{id:"foreign-auth-target"}));
  assert.throws(()=>sql("BEGIN;SET LOCAL ROLE bench_denied;SELECT public.helmut_auth_state_graph_read_v1('{\"id\":\"main-auth\"}'::jsonb);ROLLBACK;"));assert.equal(witness(),before);
 });
 await check("interleaved-full-reader-versus-control-reader-eight-pairs",async()=>{
  for(let i=0;i<8;i++)for(const mode of(i%2?["control","full"]:["full","control"])){
   const at=wire.length,cpu=process.cpuUsage(),start=performance.now();const value=await(mode==="full"?storage.readAuthStore({strict:true}):read());
   const wallMS=performance.now()-start,cost=process.cpuUsage(cpu);assert.deepEqual(copy(project(value)),baselineControl);
   const http=wire.slice(at);assert.equal(http.length,1);assert.equal(http[0].status,200);assert.equal(http[0].bodyComplete,true);
   measurements.push({pair:i,mode,wallMS,nodeCPUUsec:cost.user+cost.system,responseBytes:http[0].responseBytes,requestBytes:http[0].requestBytes,nodeMemoryAfter:process.memoryUsage(),nodeMaxRSSBytes:process.resourceUsage().maxRSS*1024});
  }
  return {pairs:8,requestCount:16,orderAlternated:true,commonMemorySavingsClaimed:false};
 });
 const final=await storage.readAuthStore({strict:true}),native=await rpc("helmut_auth_state_read_v1",{id:"main-auth"});
 assert.deepEqual(omitRevision(final),expected);assert.deepEqual(omitRevision(native.data),expected);assert.equal(final.llmUsage.length,5000);assert.equal(State.build(final).root,native.state.root);
 return {checks,measurements,allFieldsRestored:true,originalHistoryRows:5000,originalHistoryUnchanged:true,actualNativeLogicalDataEqualsOriginal:true,controlFields:KEYS,smallReadComparisonOnly:true,commonRAMComparison:false,noLoopFileCacheAcceptance:true};
}
module.exports={run};
