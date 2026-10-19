"use strict";
// Small real-storage diagnostic only. No command installation or activation.
const fs=require("node:fs"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const {performance}=require("node:perf_hooks"),{execFileSync}=require("node:child_process");
const receipt=JSON.parse(fs.readFileSync("/bench/STARTED.SAFE.json"));
const [phase,mode,uid,gid]=process.argv.slice(2);
assert(["catalog","prepare","measure","security","native","native-leaf","history","graph","projection","single-capture","control"].includes(phase));assert(["baseline","parts","security"].includes(mode));
assert.equal(require("node:os").hostname(),receipt.cid.slice(0,12));
assert.equal(receipt.scope,"SMALL_DATABASE_OPERATIONS_NO_ACTIVATION_NO_500_RUN");
assert.equal(process.env.SUPABASE_URL,undefined);
Object.assign(process.env,{HELMUT_STORAGE_BACKEND:"supabase",SUPABASE_URL:"http://127.0.0.1:38419",SUPABASE_SERVICE_ROLE_KEY:"local-fixture-not-a-secret",HELMUT_AUTH_STORE_CAS_TRANSPORT:"scalar-jsonb-rpc",HELMUT_LLM_USAGE_STORAGE:"relational-atomic-v1"});
if(mode!=="baseline")process.env.HELMUT_AUTH_STATE_STORAGE="merkle-auth-v1";
else delete process.env.HELMUT_AUTH_STATE_STORAGE;
if(receipt.historyReuse)process.env.HELMUT_AUTH_HISTORY_READ_REUSE="verified-history-reuse-v1";
if(receipt.graphReuse)process.env.HELMUT_AUTH_GRAPH_READ_REUSE="verified-graph-reuse-v1";
if(receipt.singleWriteCapture)process.env.HELMUT_AUTH_SINGLE_WRITE_CAPTURE="single-write-capture-v1";
if(receipt.controlView)process.env.HELMUT_AUTH_CONTROL_READ="verified-control-view-v1";
const rawFetch=global.fetch,wire=[];
global.fetch=async(url,options={})=>{
 assert(String(url).startsWith("http://127.0.0.1:38419/rest/v1/"));
 const headers={...options.headers};delete headers.Authorization;delete headers.apikey;
 const entry={path:new URL(url).pathname,status:null,requestBytes:Buffer.byteLength(options.body||""),responseBytes:0,bodyComplete:false};wire.push(entry);const begin=performance.now();
 try{
  const r=await rawFetch(String(url).replace("/rest/v1/","/"),{...options,headers});entry.status=r.status;
  if(!r.body){entry.bodyComplete=true;entry.ms=performance.now()-begin;return r;}
  const body=r.body.pipeThrough(new TransformStream({transform(chunk,controller){entry.responseBytes+=chunk.byteLength;controller.enqueue(chunk);},flush(){entry.bodyComplete=true;entry.ms=performance.now()-begin;}}));
  return new Response(body,{status:r.status,statusText:r.statusText,headers:r.headers});
 }catch(e){entry.error=e.name;entry.ms=performance.now()-begin;throw e;}
};
const storage=require("../../lib/helmut/storage"),U=require("../../lib/helmut/llm-usage-atomic"),State=require("../../lib/helmut/auth-state-parts");
const sha=x=>crypto.createHash("sha256").update(x).digest("hex");
const copy=x=>JSON.parse(JSON.stringify(x));
const omitRevision=x=>Object.fromEntries(Object.entries(copy(x)).filter(([k])=>k!=="_authStoreRevision"));
const lit=x=>"'"+String(x).replaceAll("'","''")+"'";
function sql(q){return execFileSync("psql",["-U","postgres","-d",receipt.database||"postgres","-X","-qAt","-v","ON_ERROR_STOP=1","-v","VERBOSITY=sqlstate"],{input:q,encoding:"utf8",maxBuffer:64*1024*1024,stdio:["pipe","pipe","pipe"]}).trim();}
function save(name,x){const p="/bench/"+name;fs.writeFileSync(p,JSON.stringify(x,null,2),{mode:0o600,flag:"wx"});fs.chownSync(p,+uid,+gid);}
async function rpc(name,body){const r=await global.fetch("http://127.0.0.1:38419/rest/v1/rpc/"+name,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const b=await r.json();if(!r.ok){const e=Error("local-rpc-failed");e.statusCode=r.status;e.code=b.code;throw e;}return b;}
async function ready(){for(let i=0;i<60;i++){try{const r=await rawFetch("http://127.0.0.1:38419/helmut_store?select=id");await r.arrayBuffer();if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error("local REST unavailable");}
const dependencyFiles=["lib/helmut/storage.js","lib/helmut/auth-store-cas.js","lib/helmut/llm-usage-atomic.js","lib/helmut/auth-state-parts.js","supabase/proposals/auth_usage_atomic_local.sql","supabase/proposals/auth_state_parts_local.sql","scripts/helmut-resource-meter/auth-state-parts-check.js","scripts/helmut-resource-meter/auth-state-parts-small-fixture.py","scripts/helmut-resource-meter/kernel-meter.py","scripts/helmut-resource-meter/atomic-usage-integration.js","scripts/helmut-resource-meter/auth-state-parts-native-check.js","scripts/helmut-resource-meter/auth-state-cas-projection-check.js","scripts/helmut-resource-meter/auth-single-capture-native-check.js"];
function pins(){const root=receipt.repository;return dependencyFiles.map(name=>{const p=root+"/"+name,b=fs.readFileSync(p);return{path:p,bytes:b.length,sha256:sha(b)};});}
function physicalHash(){return sql("SELECT encode(sha256(convert_to(data::text,'UTF8')),'hex')FROM public.helmut_store WHERE id='main-auth';");}
function nativeReader(){return mode==="baseline"?"public.helmut_auth_usage_read_v1":"public.helmut_auth_state_read_v1";}
function nativeWitness(){return JSON.parse(sql("BEGIN READ ONLY;SELECT jsonb_build_object('logicalSHA256',encode(sha256(convert_to((x->'data')::text,'UTF8')),'hex'),'proof',x->'proof','state',x->'state','physicalSHA256',(SELECT encode(sha256(convert_to(data::text,'UTF8')),'hex')FROM public.helmut_store WHERE id='main-auth'))FROM(SELECT "+nativeReader()+"('{\"id\":\"main-auth\"}'::jsonb)x OFFSET 0)s;ROLLBACK;"));}
function verifyFixture(){const m=JSON.parse(fs.readFileSync("/bench-input-manifest.json")),b=fs.readFileSync("/bench-input.json");assert.equal(m.scope,"DIAGNOSTIC_FIXTURE_DATA_ONLY_NO_ACTIVATION");assert.equal(m.sourcePin.bytes,b.length);assert.equal(m.sourcePin.sha256,sha(b));assert.equal(m.counts.historicalUsageRows,5000);assert.equal(m.counts.retainedUnits,500);assert.equal(m.counts.retainedIntents,1000);return m;}
function captureStateCatalog(filename,requireStrict=false){
 const AU=require("./atomic-usage-integration"),actual=JSON.parse(sql(AU.stateCatalogSQL()));
 let strictAccepted=false,strictError=null;
 try{AU.assertStateCatalog(actual);strictAccepted=true;}catch(e){strictError={name:e.name,code:e.code||null,message:String(e.message).slice(0,1800)};}
 save(filename,{scope:"ACTUAL_READ_ONLY_NATIVE_CATALOG_CAPTURE_DIAGNOSTIC_ADDITIONAL_RESTRICTIVE_POLICY_EXPLICIT",actual,strictAccepted,strictError,diagnosticAdditionalPolicy:"local_auth_state_bench_scope restricts bench_writer to store_id main-auth; original service policy remains unchanged",normalizationApplied:false,rootAcceptanceRequired:!requireStrict});
 if(requireStrict&&!strictAccepted){const e=Error("auth-state-source-only-catalog-rejected");e.code="AUTH_STATE_SOURCE_CATALOG_REJECTED";throw e;}
}
async function prepare(){
 await ready();if(mode!=="baseline")captureStateCatalog("STATE_CATALOG_AFTER_INSTALL.SAFE.json");const fixture=verifyFixture(),before=JSON.parse(sql("SELECT data::text FROM public.helmut_store WHERE id='main-auth';")),begin=performance.now(),originalHash=physicalHash();
 assert.equal(before.llmUsage.length,5000);assert.equal(before.synthetik500KostenAdmission.plan.intents.length,1000);assert.equal(before.localDiagnosticState.retainedUnits.length,500);
 await rpc("helmut_auth_usage_bootstrap_v1",{id:"main-auth",expectedHash:originalHash});
 const usage=await rpc("helmut_auth_usage_read_v1",{id:"main-auth"});assert.deepEqual(omitRevision(usage.data),omitRevision(before));assert.equal(usage.proof.count,5000);assert.equal(usage.proof.originalHash,originalHash);
 const usageBootstrapMS=performance.now()-begin;let stateBootstrapMS=0,state=null,badBootstrapPreserved=null;
 if(mode!=="baseline"){
  const built=State.build(usage.data),expectedHash=physicalHash(),tick=performance.now();
  if(mode==="security"&&receipt.testPhase==="security"){
   await assert.rejects(rpc("helmut_auth_state_bootstrap_v1",{id:"main-auth",expectedHash:"0".repeat(64),root:built.root,nodes:built.nodes}));
   badBootstrapPreserved=physicalHash()===expectedHash;assert(badBootstrapPreserved);
  }
  const result=await rpc("helmut_auth_state_bootstrap_v1",{id:"main-auth",expectedHash,root:built.root,nodes:built.nodes});
  const actual=await rpc("helmut_auth_state_read_v1",{id:"main-auth"});
  assert.deepEqual(omitRevision(actual.data),omitRevision(before));assert.deepEqual(actual.proof,usage.proof);
  assert.equal(actual.state.root,built.root);assert.equal(State.build(actual.data).root,actual.state.root);
  assert.equal(actual.state.originalHash,expectedHash);assert.deepEqual(result.state,actual.state);state=actual.state;stateBootstrapMS=performance.now()-tick;
  captureStateCatalog("STATE_CATALOG_AFTER_BOOTSTRAP.SAFE.json");
 }
 const actual=await storage.readAuthStore({strict:true});assert.deepEqual(omitRevision(actual),omitRevision(before));
 save("BOOTSTRAP_ACCEPTANCE.SAFE.json",{pass:true,mode,wallMS:performance.now()-begin,usageBootstrapMS,stateBootstrapMS,badBootstrapPreserved,originalHistoryRows:before.llmUsage.length,allOriginalLogicalFieldsEqual:true,fixtureManifest:fixture,state,native:nativeWitness(),sourcePins:pins(),activation:false,full500:false,GOClaimed:false,providerCalls:0,wire});
}
function diagnosticMutation(auth,index){
 auth.localUsageMeasure=index+1;const d=auth.localDiagnosticState;
 assert.equal(d.scope,"DIAGNOSTIC_FIXTURE_DATA_ONLY_NO_ACTIVATION");assert.equal(d.paidAuthority,false);
 const keys=Object.keys(d.mutableLedgerCallsMap).sort(),call=d.mutableLedgerCallsMap[keys[index%keys.length]];
 assert.equal(keys.length,16);assert.equal(call.amount,0);assert.equal(call.paid,false);
 call.attempts+=1;call.status=index%2?"local-diagnostic-odd":"local-diagnostic-even";
}
function syntheticProcessEntry(index,token){
 return {process:"local-state-memory-diagnostic",runId:`local-state-process-${token}-${String(index).padStart(3,"0")}`,
  mode:"local-storage-diagnostic",location:"network-none-local-pg",startedAt:"2026-10-18T12:00:00.000Z",finishedAt:"2026-10-18T12:00:00.000Z",
  durationMs:0,processed:0,deferred:0,skippedStore:0,reason:"synthetic-storage-diagnostic-only-no-model-execution",status:"diagnostic-only",
  cluster:0,vorgemerkt:0,zielmenge:0,gespeichert:0,uebersprungen:0,fehlgeschlagen:0,wiederholt:0,leaseVerloren:0,geplant:0,neuGeplant:0,
  spiegelGesammelt:0,spiegelGeschrieben:0,fehlerklasse:"synthetic-diagnostic",backend:"local-pg-diagnostic",commit:"synthetic-local-fixture",
  telemetrie:{cluster:0,dokumente:0,dokumenteOhneEndzustand:0,vorgemerkt:0,grossereignisse:0,ergebnisse:{synthetic:0},gruppen:{synthetic:0},aufloesungen:{synthetic:0},auffaelligkeitenGesamt:0}};
}
async function measure(){
 await ready();verifyFixture();const workload=receipt.workload||"nested-state";
 assert(["nested-state","mixed-state-process-runs"].includes(workload));const mixed=workload==="mixed-state-process-runs";
 const before=await storage.readAuthStore({strict:true}),expected=omitRevision(before),additions=[],requests=[],processRuns=[],token=receipt.name.slice(-10);
 const invariant={users:JSON.stringify(before.users),costBooks:JSON.stringify(before.testKostenTage),slot:JSON.stringify(before.synthetik500KostenAdmission),units:JSON.stringify(before.localDiagnosticState.retainedUnits)};
 if(!mixed)invariant.processRuns=JSON.stringify(before.processRuns);
 const originalProcessRows=before.processRuns.length,originalProcessArrayBytes=Buffer.byteLength(JSON.stringify(before.processRuns));
 if(mixed)assert.equal(originalProcessRows,300,"Retention comparison requires a full300-entry array");
 let nestedCount=0,processCount=0,expectedCAS=0;const begin=performance.now();
 for(let i=0;i<96;i++){
  const start=performance.now(),cpu=process.cpuUsage();let addition,baseMS,usageAppendMS=0,telemetryEvidence=null;
  if(i%4===0)addition={id:`local-state-${token}-${String(i).padStart(3,"0")}`,createdAt:"2026-10-18T12:00:00.000Z",model:"none",callType:"skipped-local-state-diagnostic",promptTokens:0,completionTokens:0,totalTokens:0,estimatedCost:0,success:false,keinAufruf:true,durationMs:0,error:null,serviceContractHash:"synthetic-local-integrity-field",reconciliation:{localSynthetic:true,index:i}};
  const baseStart=performance.now();
  if(mixed&&i%3===2){
   let observed;
   // The actual storage API performs sanitation and the existing retention
   // mutation. This observer delegates to the unchanged real CAS queue.
   const result=await storage.recordProcessRun(syntheticProcessEntry(i,token),{relationalAktiv:false,
    mutateAuth:change=>storage.mutateAuthStore(async auth=>{
     const value=await change(auth);observed={arrayRows:auth.processRuns.length,arrayJSONBytes:Buffer.byteLength(JSON.stringify(auth.processRuns)),headJSONBytes:Buffer.byteLength(JSON.stringify(auth.processRuns[0])),headJSONSHA256:sha(JSON.stringify(auth.processRuns[0]))};return value;
    })});
   assert.equal(result.ok,true);assert.equal(result.vollstaendig,true);assert.equal(result.relationalAktiv,false);
   assert.deepEqual(result.gespeichert,{relational:false,blob:true});assert.deepEqual(result.fehler,[]);assert(observed);
   const clean=copy(result.eintrag);assert.equal(observed.headJSONSHA256,sha(JSON.stringify(clean)));
   expected.processRuns=[clean,...expected.processRuns.filter(r=>!(r&&r.runId===clean.runId&&r.process===clean.process))].slice(0,300);
   assert.equal(observed.arrayRows,expected.processRuns.length);assert.equal(observed.arrayJSONBytes,Buffer.byteLength(JSON.stringify(expected.processRuns)));
   telemetryEvidence={index:i,actualAPI:"storage.recordProcessRun",actualBackend:"LOCAL_AUTH_CAS_DIAGNOSTIC_RELATIONAL_DISABLED",relationalAktiv:false,sanitizedEntryBytes:observed.headJSONBytes,actualMutatorArrayBytes:observed.arrayJSONBytes,actualMutatorRows:observed.arrayRows,manualExpectedArrayMatchesActualMutator:true};
   processRuns.push(telemetryEvidence);processCount++;expectedCAS++;
  }else{
   await storage.mutateAuthStore(auth=>{diagnosticMutation(auth,i);if(!mixed&&addition)auth.llmUsage=[addition,...auth.llmUsage];});
   diagnosticMutation(expected,i);nestedCount++;expectedCAS++;
  }
  baseMS=performance.now()-baseStart;
  if(mixed&&addition){const tick=performance.now();await storage.mutateAuthStore(auth=>{auth.llmUsage=[addition,...auth.llmUsage];});usageAppendMS=performance.now()-tick;expectedCAS++;}
  if(addition)additions.unshift(addition);
  requests.push({index:i,kind:telemetryEvidence?"actual-process-run-retention":"diagnostic-nested-mutation",status:200,authCAS:1+(mixed&&addition?1:0),baseMS,usageAppendMS,wallMS:performance.now()-start,clientCPUUsec:process.cpuUsage(cpu)});
  fs.writeFileSync("/bench/PROGRESS.SAFE.json",JSON.stringify({completed:i+1,actualCASCompleted:expectedCAS,processRunsCompleted:processCount,unixMS:Date.now()}));
  if(i===47){fs.writeFileSync("/bench/CHECKPOINT_REQUEST.SAFE.json",JSON.stringify({completed:48,actualCASCompleted:expectedCAS}));const until=Date.now()+15000;while(!fs.existsSync("/bench/CHECKPOINT_DONE.SAFE.json")){if(Date.now()>until)throw Error("checkpoint timeout");await new Promise(r=>setTimeout(r,20));}}
 }
 expected.llmUsage=[...additions,...expected.llmUsage];const after=await storage.readAuthStore({strict:true});assert.deepEqual(omitRevision(after),expected);
 assert.equal(new Set(after.llmUsage.map(r=>r.id)).size,after.llmUsage.length);
 const observedFinal={users:JSON.stringify(after.users),costBooks:JSON.stringify(after.testKostenTage),slot:JSON.stringify(after.synthetik500KostenAdmission),units:JSON.stringify(after.localDiagnosticState.retainedUnits),processRuns:JSON.stringify(after.processRuns)};
 for(const[k,value]of Object.entries(invariant))assert.equal(observedFinal[k],value);
 if(mixed){assert.equal(nestedCount,64);assert.equal(processCount,32);assert.equal(after.processRuns.length,300);}
 const actualCAS=wire.filter(r=>/\/helmut_auth_(usage|state)_cas_v1$/.test(r.path));assert.equal(actualCAS.length,expectedCAS);assert.equal(expectedCAS,mixed?120:96);
 assert(actualCAS.every(r=>r.status===200&&r.bodyComplete));
 const nativeMatches=sql("BEGIN READ ONLY;SELECT (("+nativeReader()+"('{\"id\":\"main-auth\"}'::jsonb)->'data')-'_authStoreRevision')="+lit(JSON.stringify(expected))+"::jsonb;ROLLBACK;");assert.equal(nativeMatches,"t");
 const native=nativeWitness();if(mode!=="baseline")assert.equal(State.build(after).root,native.state.root);
 const sorted=requests.map(x=>x.wallMS).sort((a,b)=>a-b),sanitizedSizes=processRuns.map(r=>r.sanitizedEntryBytes).sort((a,b)=>a-b);
 save("HTTP_RESULT.SAFE.json",{scope:mixed?"96_LOGICAL_OPS_64_NESTED_32_ACTUAL_PROCESS_RUNS_24_EXTRA_USAGE_CAS_TOTAL120_NO_ACTIVATION":"96_REAL_STORAGE_CAS_24_ZERO_COST_USAGE_DIAGNOSTIC_NESTED_UPDATES_NO_ACTIVATION",mode,workload,pass:true,logicalOperations:96,actualCASRequests:actualCAS.length,nestedMutationCount:nestedCount,processRunCallCount:processCount,additionalUsageCAS:mixed?24:0,
  processRunsDiagnostic:mixed?{actualAPI:"storage.recordProcessRun",relationalAktiv:false,scope:"NETWORK_NONE_LOCAL_AUTH_CAS_ONLY_NOT_PRODUCTION_RELATIONAL_PROOF",initialRows:originalProcessRows,finalRows:after.processRuns.length,initialArrayJSONBytes:originalProcessArrayBytes,finalArrayJSONBytes:Buffer.byteLength(JSON.stringify(after.processRuns)),firstEntryBytes:processRuns[0].sanitizedEntryBytes,lastEntryBytes:processRuns.at(-1).sanitizedEntryBytes,minEntryBytes:sanitizedSizes[0],medianEntryBytes:(sanitizedSizes[15]+sanitizedSizes[16])/2,maxEntryBytes:sanitizedSizes.at(-1),trend:processRuns,existingRetentionManuallyReconciled:true}:null,
  smallMeasuredWallMS:performance.now()-begin,requests,wire,medianRequestMS:(sorted[47]+sorted[48])/2,maxRequestMS:sorted.at(-1),requestBytes:wire.reduce((n,x)=>n+x.requestBytes,0),responseBytes:wire.reduce((n,x)=>n+x.responseBytes,0),allBodiesComplete:wire.every(x=>x.bodyComplete),errors:wire.filter(x=>x.error||x.status>=400).length,originalFieldsAndHistoryUnchanged:!mixed,allUntargetedOriginalFieldsUnchanged:true,originalUsageHistoryPreserved:true,intentionallyChangedFields:mixed?["localDiagnosticState.mutableLedgerCallsMap","localUsageMeasure","processRuns via actual existing retention API","llmUsage append24 zero-cost records"]:["localDiagnosticState.mutableLedgerCallsMap","localUsageMeasure","llmUsage append24 zero-cost records"],nativeLogicalDataEqualsExpected:true,native,sourcePins:pins(),originalRecords:before.llmUsage.length,newRecords:additions.length,finalRecords:after.llmUsage.length,nodeMaxRSSBytes:process.resourceUsage().maxRSS*1024,serializedAuthJSONBytes:Buffer.byteLength(JSON.stringify(after)),paidProviderCalls:0,activation:false,production:false,full500:false,GOClaimed:false,unit60Auth30Acceptance:false});
}
async function security(){
 await ready();assert.equal(mode,"security");const checks=[];
 async function check(name,fn){await fn();checks.push({name,pass:true});}
 await check("legacy-usage-writer-blocked-after-state-cutover",async()=>{const a=await storage.readAuthStore();delete process.env.HELMUT_AUTH_STATE_STORAGE;try{await assert.rejects(storage.readAuthStore());await assert.rejects(storage.writeAuthStore(a));}finally{process.env.HELMUT_AUTH_STATE_STORAGE=State.VERSION;}});
 await check("private-snapshot-revision-tamper-rejected-before-HTTP",async()=>{
  const a=await storage.readAuthStore(),b=await storage.readAuthStore();
  const winner=await storage.writeAuthStore({...b,localPrivateRevisionWinner:"kept"});
  a._authStoreRevision=winner._authStoreRevision;const beforeHTTP=wire.length;
  await assert.rejects(storage.writeAuthStore({...a,localPrivateRevisionWinner:"forged-stale"}),{code:"AUTH_STORE_SNAPSHOT_REVISION_CHANGED"});
  assert.equal(wire.length,beforeHTTP);assert.equal((await storage.readAuthStore()).localPrivateRevisionWinner,"kept");
 });
 await check("caller-nested-mutation-during-await-cannot-change-ACK-or-DB",async()=>{
  const a=await storage.readAuthStore(),nested={status:"actually-sent",counter:0};
  a.localDiagnosticState.pendingObject=nested;const pending=storage.writeAuthStore(a);
  nested.status="mutated-after-send";nested.counter=99;
  const ack=await pending;assert.deepEqual(ack.localDiagnosticState.pendingObject,{status:"actually-sent",counter:0});
  const after=await storage.readAuthStore();assert.deepEqual(after.localDiagnosticState.pendingObject,{status:"actually-sent",counter:0});
  const witness=nativeWitness();assert.equal(State.build(ack).root,witness.state.root);assert.equal(State.build(after).root,witness.state.root);
 });
 await check("mutated-original-usage-record-cannot-receive-content-receipt",async()=>{
  const a=await storage.readAuthStore(),record={id:"local-pending-record-"+crypto.randomUUID(),createdAt:new Date().toISOString(),model:"before",estimatedCost:0,keinAufruf:true};
  a.llmUsage=[record,...a.llmUsage];const pending=storage.writeAuthStore(a);record.model="changed-during-await";
  const ack=await pending;assert.throws(()=>U.receipt(record,a),{code:"ATOMIC_USAGE_RECEIPT_CONTENT_CHANGED"});assert.equal(U.confirmed(record),false);
  const after=await storage.readAuthStore();assert.equal(ack.llmUsage[0].id,record.id);assert.equal(ack.llmUsage[0].model,"before");
  assert.equal(after.llmUsage.find(x=>x.id===record.id).model,"before");assert.deepEqual(ack.llmUsage[0],after.llmUsage.find(x=>x.id===record.id));
 });
 await check("stale-CAS-one-winner-preserves-complete-state",async()=>{const a=await storage.readAuthStore(),b=await storage.readAuthStore();await storage.writeAuthStore({...a,localStateSecurity:"winner"});await assert.rejects(storage.writeAuthStore({...b,localStateSecurity:"loser"}),{code:"AUTH_STORE_CONFLICT"});assert.equal((await storage.readAuthStore()).localStateSecurity,"winner");});
 await check("simultaneous-CAS-one-winner-no-lost-or-duplicate-usage",async()=>{const a=await storage.readAuthStore(),b=await storage.readAuthStore(),n=a.llmUsage.length;const row=i=>({id:"local-state-concurrent-"+crypto.randomUUID(),createdAt:new Date().toISOString(),model:"none",estimatedCost:0,localSynthetic:i});const outcomes=await Promise.allSettled([storage.writeAuthStore({...a,llmUsage:[row(1),...a.llmUsage]}),storage.writeAuthStore({...b,llmUsage:[row(2),...b.llmUsage]})]);assert.equal(outcomes.filter(x=>x.status==="fulfilled").length,1);assert.equal(outcomes.filter(x=>x.status==="rejected"&&x.reason.code==="AUTH_STORE_CONFLICT").length,1);assert.equal((await storage.readAuthStore()).llmUsage.length,n+1);});
 await check("historical-usage-change-delete-reorder-rejected",async()=>{const a=await storage.readAuthStore();assert.throws(()=>{a.llmUsage[0].model="forged";});await assert.rejects(storage.writeAuthStore({...a,llmUsage:a.llmUsage.slice(1)}));await assert.rejects(storage.writeAuthStore({...a,llmUsage:[a.llmUsage[1],a.llmUsage[0],...a.llmUsage.slice(2)]}));});
 await check("invalid-state-proof-and-node-payload-roll-back",async()=>{const a=await rpc("helmut_auth_state_read_v1",{id:"main-auth"}),before=physicalHash();const body={id:"main-auth",expectedRevision:a.data._authStoreRevision,expectedProof:a.proof,expectedState:{...a.state,root:"0".repeat(64)},revision:crypto.randomUUID(),root:a.state.root,nodes:[],additions:[]};try{assert.deepEqual(await rpc("helmut_auth_state_cas_v1",body),[]);}catch(e){assert(e.statusCode>=400);}assert.equal(physicalHash(),before);body.expectedState=a.state;body.nodes=[{hash:"0".repeat(64),payload:'["v",null]'}];await assert.rejects(rpc("helmut_auth_state_cas_v1",body));assert.equal(physicalHash(),before);});
 await check("customer-role-cannot-read-or-execute-state-rpcs",async()=>{assert.throws(()=>sql("SET ROLE bench_denied;SELECT public.helmut_auth_state_read_v1('{\"id\":\"main-auth\"}');"));await assert.rejects(rpc("helmut_auth_state_read_v1",{id:"other-auth-target"}));});
 await check("unknown-ACK-never-retried-or-branded-confirmed",async()=>{const a=await storage.readAuthStore(),fetchBefore=global.fetch;let calls=0;global.fetch=async(...args)=>{const r=await fetchBefore(...args);if(String(args[0]).includes("helmut_auth_state_cas_v1")){await r.arrayBuffer();calls++;throw Error("local-lost-state-ACK");}return r;};let result;try{result=await storage.recordLlmUsage({model:"none",callType:"skipped-local-lost-state-ack",keinAufruf:true,success:false});}finally{global.fetch=fetchBefore;}assert.equal(result,null);assert.equal(calls,1);assert.equal((await storage.readAuthStore()).llmUsage.length,a.llmUsage.length+1);});
 // Keep the original final restore assertion intact. Graph qualification must
 // precede it because that assertion deliberately leaves usage-only storage.
 const graphChecks=await require("./auth-state-parts-native-check").runGraph({sql,rpc,storage,State,U,wire,copy,omitRevision});
 assert(Array.isArray(graphChecks)&&graphChecks.length===6&&graphChecks.every(x=>x.pass===true));checks.push(...graphChecks);
 await check("state-restore-preserves-complete-logical-state-and-usage",async()=>{const a=await storage.readAuthStore(),native=await rpc("helmut_auth_state_read_v1",{id:"main-auth"});await assert.rejects(rpc("helmut_auth_state_restore_v1",{id:"main-auth",expectedRevision:crypto.randomUUID(),expectedState:native.state}));await rpc("helmut_auth_state_restore_v1",{id:"main-auth",expectedRevision:a._authStoreRevision,expectedState:native.state});await assert.rejects(storage.writeAuthStore({...a,localStateStaleRestore:true}));delete process.env.HELMUT_AUTH_STATE_STORAGE;const b=await storage.readAuthStore();assert.deepEqual(omitRevision(b),omitRevision(a));await storage.mutateAuthStore(x=>{x.localUsageAfterStateRestore=true;});assert((await storage.readAuthStore()).localUsageAfterStateRestore);});
 save("STATE_SECURITY_RESULT.SAFE.json",{pass:true,checks,wire,sourcePins:pins(),actualProfileTableAbsent:sql("SELECT to_regclass('public.mandate_profiles')IS NULL;")==="t",activation:false,full500:false,GOClaimed:false,providerCalls:0,limits:["Native stored-node ALWAYS-trigger, depth, duplicate-key, graph-bound and crash-recovery negatives require independent exact-schema qualification; this small harness does not claim full500 or Unit60/Auth30."]});
}
async function nativeSecurity(){
 await ready();assert.equal(mode,"security");assert.equal(receipt.testPhase,phase);
 const adapter=require("./auth-state-parts-native-check");
 const result=await (phase==="native-leaf"?adapter.runLeafInfo:adapter.run)({sql,rpc,storage,State,U,wire,copy,omitRevision});
 const checks=Array.isArray(result)?result:result?.checks;assert(Array.isArray(checks)&&checks.length>0);assert(checks.every(x=>x.pass===true));
 save(phase==="native-leaf"?"NATIVE_LEAF_INFO_SECURITY_RESULT.SAFE.json":"NATIVE_STATE_SECURITY_RESULT.SAFE.json",{pass:true,checks,adapterResult:Array.isArray(result)?null:result,wire,sourcePins:pins(),onlyPreviouslyMissingNativeGroups:true,actualProfileTableAbsent:sql("SELECT to_regclass('public.mandate_profiles')IS NULL;")==="t",activation:false,full500:false,GOClaimed:false,providerCalls:0,unit60Auth30Acceptance:false});
}
async function projectionSecurity(){
 await ready();assert.equal(mode,"security");assert.equal(receipt.testPhase,"projection");assert.equal(receipt.casProjection,true);
 assert.equal(sql("SELECT current_setting('helmut.local_auth_state_cas_projection');"),"on");
 const legacy=await require("./auth-state-parts-native-check").run({sql,rpc,storage,State,U,wire,copy,omitRevision});
 const checks=await require("./auth-state-cas-projection-check").run({sql,rpc,storage,State,U,wire,copy,omitRevision});
 assert(legacy.every(x=>x.pass)&&checks.every(x=>x.pass));
 save("CAS_PROJECTION_SECURITY_RESULT.SAFE.json",{pass:true,legacy,checks,wire,sourcePins:pins(),activation:false,full500:false,GOClaimed:false,paidProviderCalls:0,production:false,unit60Auth30Acceptance:false});
}
async function controlViewSecurity(){
 await ready();assert.equal(mode,"security");assert.equal(receipt.controlView,true);
 const result=await require("./auth-control-view-native-check").run({sql,rpc,storage,State,U,wire,copy,omitRevision});
 assert(result.checks.every(x=>x.pass));
 save("CONTROL_VIEW_NATIVE_SECURITY_RESULT.SAFE.json",{pass:true,...result,sourcePins:[...pins(),{path:receipt.repository+"/scripts/helmut-resource-meter/auth-control-view-native-check.js",bytes:fs.statSync(__dirname+"/auth-control-view-native-check.js").size,sha256:sha(fs.readFileSync(__dirname+"/auth-control-view-native-check.js"))}],wire,activation:false,full500:false,GOClaimed:false,paidProviderCalls:0,production:false,unit60Auth30Acceptance:false,commonMemoryBenefitAcceptance:false});
}
async function singleCaptureSecurity(){
 await ready();assert.equal(mode,"security");assert.equal(receipt.singleWriteCapture,true);
 const checks=await require("./auth-single-capture-native-check").run({sql,storage,State,copy,omitRevision});
 assert(checks.length===4&&checks.every(x=>x.pass));
 save("SINGLE_CAPTURE_NATIVE_SECURITY_RESULT.SAFE.json",{pass:true,checks,sourcePins:pins(),wire,activation:false,full500:false,GOClaimed:false,paidProviderCalls:0,production:false,unit60Auth30Acceptance:false});
}
async function historySecurity(){
 await ready();assert.equal(mode,"security");assert.equal(receipt.testPhase,"history");
 delete process.env.HELMUT_AUTH_HISTORY_READ_REUSE;
 const legacy=await require("./auth-state-parts-native-check").runGraph({sql,rpc,storage,State,U,wire,copy,omitRevision});
 process.env.HELMUT_AUTH_HISTORY_READ_REUSE="verified-history-reuse-v1";
 const result=await require("./auth-history-reuse-native-check").run({sql,rpc,storage,State,U,wire,copy,omitRevision});
 assert(legacy.length===6&&legacy.every(x=>x.pass)&&result.checks.length===8&&result.checks.every(x=>x.pass));
 save("HISTORY_REUSE_NATIVE_SECURITY_RESULT.SAFE.json",{pass:true,legacyGraphChecks:legacy,historyChecks:result,sourcePins:[...pins(),{path:receipt.repository+"/scripts/helmut-resource-meter/auth-history-reuse-native-check.js",bytes:fs.statSync(__dirname+"/auth-history-reuse-native-check.js").size,sha256:sha(fs.readFileSync(__dirname+"/auth-history-reuse-native-check.js"))}],activation:false,full500:false,GOClaimed:false,paidProviderCalls:0,production:false,unit60Auth30Acceptance:false});
}
async function graphSecurity(){
 await ready();assert.equal(mode,"security");assert.equal(receipt.testPhase,"graph");
 delete process.env.HELMUT_AUTH_GRAPH_READ_REUSE;delete process.env.HELMUT_AUTH_HISTORY_READ_REUSE;
 const legacy=await require("./auth-state-parts-native-check").runGraph({sql,rpc,storage,State,U,wire,copy,omitRevision});
 process.env.HELMUT_AUTH_HISTORY_READ_REUSE="verified-history-reuse-v1";
 const history=await require("./auth-history-reuse-native-check").run({sql,rpc,storage,State,U,wire,copy,omitRevision});
 process.env.HELMUT_AUTH_GRAPH_READ_REUSE="verified-graph-reuse-v1";
 const checks=await require("./auth-graph-reuse-native-check").run({sql,rpc,storage,State,U,wire,copy,omitRevision});
 const extraPins=["auth-graph-reuse-native-check.js","auth-history-reuse-native-check.js"].map(name=>{
  const path=receipt.repository+"/scripts/helmut-resource-meter/"+name;
  return{path,bytes:fs.statSync(path).size,sha256:sha(fs.readFileSync(path))};
 });
 save("GRAPH_REUSE_NATIVE_SECURITY_RESULT.SAFE.json",{pass:true,legacyGraphChecks:legacy,historyChecks:history,checks,sourcePins:[...pins(),...extraPins],activation:false,full500:false,GOClaimed:false,paidProviderCalls:0,production:false,unit60Auth30Acceptance:false});
}
(async()=>{if(phase==="catalog")captureStateCatalog("STATE_CATALOG_SOURCE_ONLY.SAFE.json",true);else if(phase==="prepare")await prepare();else if(phase==="measure")await measure();else if(phase==="native"||phase==="native-leaf")await nativeSecurity();else if(phase==="control")await controlViewSecurity();else if(phase==="single-capture")await singleCaptureSecurity();else if(phase==="projection")await projectionSecurity();else if(phase==="history")await historySecurity();else if(phase==="graph")await graphSecurity();else await security();})().catch(e=>{console.error(JSON.stringify({error:e.name,code:e.code||null,nativeCase:e.nativeCase||null,message:String(e.message).slice(0,200)}));process.exitCode=1;});
