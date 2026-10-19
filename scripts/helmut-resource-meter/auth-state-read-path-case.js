"use strict";
// Bounded local read-path attribution diagnostic only. No activation, no 500 run.
const fs=require("node:fs"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const {performance}=require("node:perf_hooks"),{execFileSync}=require("node:child_process");
const receipt=JSON.parse(fs.readFileSync("/bench/STARTED.SAFE.json"));
const [phase,mode,uid,gid]=process.argv.slice(2);
assert.equal(phase,"read-path");
assert.equal(mode,"parts");
assert.equal(receipt.testPhase,"read-path");
assert.equal(receipt.scope,"SMALL_DATABASE_OPERATIONS_NO_ACTIVATION_NO_500_RUN");
assert.equal(require("node:os").hostname(),receipt.cid.slice(0,12));
assert.equal(process.env.SUPABASE_URL,undefined);
Object.assign(process.env,{HELMUT_STORAGE_BACKEND:"supabase",SUPABASE_URL:"http://127.0.0.1:38419",SUPABASE_SERVICE_ROLE_KEY:"local-fixture-not-a-secret",HELMUT_AUTH_STORE_CAS_TRANSPORT:"scalar-jsonb-rpc",HELMUT_LLM_USAGE_STORAGE:"relational-atomic-v1",HELMUT_AUTH_STATE_STORAGE:"merkle-auth-v1"});
const DEADLINE_MS=120000,deadlineAt=Date.now()+DEADLINE_MS;
function tick(){if(Date.now()>deadlineAt){const e=Error("read-path deadline exceeded");e.code="READ_PATH_DEADLINE";throw e;}}
if(receipt.historyReuse)process.env.HELMUT_AUTH_HISTORY_READ_REUSE="verified-history-reuse-v1";
if(receipt.graphReuse)process.env.HELMUT_AUTH_GRAPH_READ_REUSE="verified-graph-reuse-v1";
if(receipt.singleWriteCapture)process.env.HELMUT_AUTH_SINGLE_WRITE_CAPTURE="single-write-capture-v1";
const rawFetch=global.fetch,wire=[];
global.fetch=async(url,options={})=>{
 const text=String(url);
 assert(text.startsWith("http://127.0.0.1:38419/rest/v1/"));
 const headers={...(options.headers||{})};
 for(const k of Object.keys(headers))if(/^(authorization|apikey)$/i.test(k))delete headers[k];
 const entry={method:options.method||"GET",path:new URL(url).pathname,status:null,requestBytes:Buffer.byteLength(options.body||""),responseBytes:0,bodyComplete:false};
 wire.push(entry);const begin=performance.now();
 try{
  const r=await rawFetch(text.replace("/rest/v1/","/"),{...options,headers});
  entry.status=r.status;
  if(!r.body){entry.bodyComplete=true;entry.ms=performance.now()-begin;return r;}
  const body=r.body.pipeThrough(new TransformStream({transform(chunk,controller){entry.responseBytes+=chunk.byteLength;controller.enqueue(chunk);},flush(){entry.bodyComplete=true;entry.ms=performance.now()-begin;}}));
  return new Response(body,{status:r.status,statusText:r.statusText,headers:r.headers});
 }catch(e){entry.error=e.name;entry.ms=performance.now()-begin;throw e;}
};
const storage=require("../../lib/helmut/storage"),U=require("../../lib/helmut/llm-usage-atomic"),State=require("../../lib/helmut/auth-state-parts");
assert.equal(U.VERSION,"relational-atomic-v1");
const sha=x=>crypto.createHash("sha256").update(x).digest("hex");
const copy=x=>JSON.parse(JSON.stringify(x));
const omitRevision=x=>Object.fromEntries(Object.entries(copy(x)).filter(([k])=>k!=="_authStoreRevision"));
function sql(q){return execFileSync("psql",["-U","postgres","-d","postgres","-X","-qAt","-v","ON_ERROR_STOP=1","-v","VERBOSITY=sqlstate"],{input:q,encoding:"utf8",maxBuffer:64*1024*1024,stdio:["pipe","pipe","pipe"]}).trim();}
function save(name,x){const p="/bench/"+name;fs.writeFileSync(p,JSON.stringify(x,null,2),{mode:0o600,flag:"wx"});fs.chownSync(p,+uid,+gid);}
function progress(completed,label){const p="/bench/PROGRESS.SAFE.json";fs.writeFileSync(p,JSON.stringify({phase:"read-path",completed,measuredCalls:completed,label,unixMS:Date.now()}),{mode:0o600});fs.chownSync(p,+uid,+gid);}
async function rpc(name,body){const r=await global.fetch("http://127.0.0.1:38419/rest/v1/rpc/"+name,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const b=await r.json();if(!r.ok){const e=Error("local-rpc-failed");e.statusCode=r.status;e.code=b.code;throw e;}return b;}
const dependencyFiles=["lib/helmut/storage.js","lib/helmut/auth-store-cas.js","lib/helmut/llm-usage-atomic.js","lib/helmut/auth-state-parts.js","scripts/helmut-resource-meter/atomic-usage-integration.js","scripts/helmut-resource-meter/auth-state-parts-small-fixture.py","scripts/helmut-resource-meter/auth-state-read-path-case.js"];
function pins(){const root=receipt.repository;return dependencyFiles.map(name=>{const p=root+"/"+name,b=fs.readFileSync(p);return{path:p,bytes:b.length,sha256:sha(b)};});}
function physicalHash(){return sql("SELECT encode(sha256(convert_to(data::text,'UTF8')),'hex')FROM public.helmut_store WHERE id='main-auth';");}
function verifyFixture(){const m=JSON.parse(fs.readFileSync("/bench-input-manifest.json")),b=fs.readFileSync("/bench-input.json");assert.equal(m.scope,"DIAGNOSTIC_FIXTURE_DATA_ONLY_NO_ACTIVATION");assert.equal(m.sourcePin.bytes,b.length);assert.equal(m.sourcePin.sha256,sha(b));assert.equal(m.counts.historicalUsageRows,5000);assert.equal(m.counts.retainedUnits,500);assert.equal(m.counts.retainedIntents,1000);return m;}
function databaseCounters(){return JSON.parse(sql("SELECT jsonb_build_object('tempBytes',temp_bytes,'tempFiles',temp_files)FROM pg_stat_database WHERE datname=current_database();"));}
const KEYWORDS=["SELECT","INSERT","UPDATE","DELETE","MERGE","WITH","CALL","DO","RETURNING","ON CONFLICT"];
function classifyQuery(q){
 const upper=String(q).toUpperCase(),statementKeywords=[],tableKeywords=[],functionKeywords=[];
 for(const k of KEYWORDS)if(new RegExp("\\b"+k.replace(/\s+/g,"\\s+")+"\\b").test(upper))statementKeywords.push(k);
 const tableRe=/\b(?:FROM|JOIN|INTO|UPDATE|DELETE\s+FROM)\s+(?:ONLY\s+)?(?:PUBLIC\.)?([A-Z][A-Z0-9_]*)/g;
 let m;while((m=tableRe.exec(upper)))tableKeywords.push(m[1]);
 const ignore=new Set(["SELECT","INSERT","UPDATE","DELETE","WITH","VALUES","COALESCE","JSONB_BUILD_OBJECT","JSON_AGG","ROW_TO_JSON","COUNT","SUM","MIN","MAX","ENCODE","CONVERT_TO","DECODE","GREATEST","LEAST","OBJECT_AGG","TO_JSONB","JSONB_OBJECT_AGG"]);
 const funcRe=/\b([A-Z][A-Z0-9_]*)\s*\(/g;while((m=funcRe.exec(upper)))if(!ignore.has(m[1]))functionKeywords.push(m[1]);
 return{statementKeywords:[...new Set(statementKeywords)],tableKeywords:[...new Set(tableKeywords)].slice(0,24),functionKeywords:[...new Set(functionKeywords)].slice(0,24)};
}
function pgStats(){const rows=JSON.parse(sql("SELECT COALESCE(json_agg(row_to_json(q)),'[]'::json) FROM (SELECT queryid::text AS queryid,toplevel,query AS normalizedquery,calls,total_exec_time,rows,temp_blks_read,temp_blks_written,wal_bytes::text AS wal_bytes,wal_fpi FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database())AND query NOT ILIKE '%pg_stat_statements%' ORDER BY queryid)q;"));return rows.map(r=>({queryid:r.queryid,toplevel:r.toplevel,normalizedquery:r.normalizedquery,calls:r.calls,total_exec_time:r.total_exec_time,rows:r.rows,temp_blks_read:r.temp_blks_read,temp_blks_written:r.temp_blks_written,wal_bytes:r.wal_bytes,wal_fpi:r.wal_fpi,querySHA256:sha(r.normalizedquery),classification:classifyQuery(r.normalizedquery),queryBytes:Buffer.byteLength(r.normalizedquery)}));}
function resetStats(){sql("SELECT pg_stat_statements_reset();");}
function assertServerStats(){assert.equal(sql("SELECT current_setting('shared_preload_libraries')LIKE '%pg_stat_statements%';"),"t");assert.equal(sql("SELECT current_setting('pg_stat_statements.track');"),"all");}
const measuredCalls=[],privateCalls=[];
const repeatWrites=receipt.readPathRepeatWrites||0;assert([0,32].includes(repeatWrites));
const expectedOperations=10+repeatWrites;
async function measured(label,kind,fn,expectedPath){
 tick();
 const rootBefore=physicalHash(),tempBefore=databaseCounters();
 resetStats();
 const wireStart=wire.length,cpuStart=process.cpuUsage(),start=performance.now();
 await fn();
 const wallMS=performance.now()-start,cpu=process.cpuUsage(cpuStart);
 const stats=pgStats(),tempAfter=databaseCounters(),rootAfter=physicalHash();
 const callWire=wire.slice(wireStart);
 assert(callWire.length>0,label+" produced no local REST request");
 if(expectedPath)assert(callWire.some(x=>x.path===expectedPath),label+" did not hit "+expectedPath);
 if(kind==="read")assert.equal(rootAfter,rootBefore,label+" changed physical root");
 const safeQueries=stats.map(s=>({queryid:s.queryid,toplevel:s.toplevel,querySHA256:s.querySHA256,queryBytes:s.queryBytes,calls:s.calls,totalExecTime:s.total_exec_time,rows:s.rows,tempBlksRead:s.temp_blks_read,tempBlksWritten:s.temp_blks_written,walBytes:s.wal_bytes,walFPI:s.wal_fpi,classification:s.classification}));
 const metric={index:measuredCalls.length+1,label,kind,wallMS,nodeCPUUserMicroseconds:cpu.user,nodeCPUSystemMicroseconds:cpu.system,nodeCPUTotalMicroseconds:cpu.user+cpu.system,nodeMaxRSSBytes:process.resourceUsage().maxRSS*1024,rootSHA256Before:rootBefore,rootSHA256After:rootAfter,rootUnchanged:rootBefore===rootAfter,pgStatementsReset:true,instrumentationFiltered:true,databaseTempBytesBefore:tempBefore.tempBytes,databaseTempBytesAfter:tempAfter.tempBytes,databaseTempBytesDelta:Number(tempAfter.tempBytes)-Number(tempBefore.tempBytes),databaseTempFilesBefore:tempBefore.tempFiles,databaseTempFilesAfter:tempAfter.tempFiles,databaseTempFilesDelta:Number(tempAfter.tempFiles)-Number(tempBefore.tempFiles),queryCount:stats.length,queries:safeQueries,wire:callWire};
 measuredCalls.push(metric);
 privateCalls.push({label,queries:stats});
 progress(measuredCalls.length,label);
 return metric;
}
async function readStorage(label,expected){return measured(label,"read",async()=>{const a=await storage.readAuthStore({strict:true});assert.deepEqual(omitRevision(a),expected);assert.equal(a.llmUsage.length,expected.llmUsage.length);return a;},"/rest/v1/rpc/helmut_auth_state_graph_read_v1");}
async function nativeStateRead(label,expected){return measured(label,"read",async()=>{const r=await rpc("helmut_auth_state_read_v1",{id:"main-auth"});assert.deepEqual(omitRevision(r.data),expected);assert.equal(r.proof.count,expected.llmUsage.length);assert.equal(State.build(r.data).root,r.state.root);return r;},"/rest/v1/rpc/helmut_auth_state_read_v1");}
async function usageRead(label,expected){return measured(label,"read",async()=>{const r=await rpc("helmut_auth_usage_read_v1",{id:"main-auth"});assert.deepEqual(Object.keys(r.data).sort(),["_authStateRef","_authStoreRevision","llmUsage"]);assert.equal(r.data[State.MARKER].version,State.VERSION);assert.equal(r.data[State.MARKER].root,State.build(expected).root);assert.deepEqual(r.data.llmUsage,expected.llmUsage);assert.equal(r.proof.count,expected.llmUsage.length);return r;},"/rest/v1/rpc/helmut_auth_usage_read_v1");}
async function noOpWrite(label,expected){
 tick();
 const fresh=await storage.readAuthStore({strict:true});
 assert.deepEqual(omitRevision(fresh),expected);
 const freshLogical=omitRevision(fresh);
 const metric=await measured(label,"write",async()=>{const ack=await storage.writeAuthStore(fresh);assert.deepEqual(omitRevision(ack),freshLogical);assert.notEqual(ack._authStoreRevision,fresh._authStoreRevision);assert.deepEqual(ack.llmUsage,fresh.llmUsage);assert.equal(ack.llmUsage.length,expected.llmUsage.length);return ack;},"/rest/v1/rpc/helmut_auth_state_cas_v1");
 const after=await storage.readAuthStore({strict:true});
 assert.deepEqual(omitRevision(after),expected);
 metric.postWriteFreshReadMatches=true;
 return metric;
}
(async()=>{
 tick();
 assertServerStats();
 const fixture=verifyFixture();
 const baseline=await storage.readAuthStore({strict:true}),expectedBaseline=omitRevision(baseline);
 assert.equal(expectedBaseline.llmUsage.length,5000);
 assert.equal(expectedBaseline.localDiagnosticState.retainedUnits.length,500);
 assert.equal(expectedBaseline.synthetik500KostenAdmission.plan.intents.length,1000);
 assert(Object.hasOwn(expectedBaseline,"users"));
 assert(Object.hasOwn(expectedBaseline,"testKostenTage"));
 await readStorage("original-graph-read-1",expectedBaseline);
 await readStorage("original-graph-read-2",expectedBaseline);
 await nativeStateRead("original-native-state-read",expectedBaseline);
 await usageRead("original-usage-read",expectedBaseline);
 await noOpWrite("original-noop-write",expectedBaseline);
 tick();
 const payload=Array.from({length:512},(_,i)=>sha("local-read-path-"+i).repeat(128));
 assert.equal(payload.length,512);
 assert(payload.every(x=>x.length===8192));
 const addBase=await storage.readAuthStore({strict:true});
 assert.deepEqual(omitRevision(addBase),expectedBaseline);
 assert(addBase.localDiagnosticState&&typeof addBase.localDiagnosticState==="object");
 assert(!Object.hasOwn(addBase.localDiagnosticState,"readPathSyntheticPayload"));
 addBase.localDiagnosticState.readPathSyntheticPayload=payload;
 const addAck=await storage.writeAuthStore(addBase);
 assert.deepEqual(addAck.localDiagnosticState.readPathSyntheticPayload,payload);
 const padded=await storage.readAuthStore({strict:true}),expectedPadded=omitRevision(padded);
 assert.deepEqual(expectedPadded.localDiagnosticState.readPathSyntheticPayload,payload);
 const paddedWithoutNew=copy(expectedPadded);
 delete paddedWithoutNew.localDiagnosticState.readPathSyntheticPayload;
 assert.deepEqual(paddedWithoutNew,expectedBaseline);
 await readStorage("padded-graph-read-1",expectedPadded);
 await readStorage("padded-graph-read-2",expectedPadded);
 await nativeStateRead("padded-native-state-read",expectedPadded);
 await usageRead("padded-usage-read",expectedPadded);
 await noOpWrite("padded-noop-write",expectedPadded);
 for(let i=0;i<repeatWrites;i++)await noOpWrite("padded-repeat-noop-"+i,expectedPadded);
 tick();
 const removeBase=await storage.readAuthStore({strict:true});
 assert.deepEqual(omitRevision(removeBase),expectedPadded);
 assert.equal(removeBase.localDiagnosticState.readPathSyntheticPayload.length,512);
 delete removeBase.localDiagnosticState.readPathSyntheticPayload;
 const removeAck=await storage.writeAuthStore(removeBase);
 assert(!Object.hasOwn(removeAck.localDiagnosticState,"readPathSyntheticPayload"));
 const restored=await storage.readAuthStore({strict:true}),restoredLogical=omitRevision(restored);
 assert.deepEqual(restoredLogical,expectedBaseline);
 assert(!Object.hasOwn(restored.localDiagnosticState,"readPathSyntheticPayload"));
 assert.deepEqual(restored.llmUsage,expectedBaseline.llmUsage);
 assert.equal(restored.llmUsage.length,5000);
 assert.equal(restored.localDiagnosticState.retainedUnits.length,500);
 assert.equal(restored.synthetik500KostenAdmission.plan.intents.length,1000);
 assert.deepEqual(restored.users,expectedBaseline.users);
 assert.deepEqual(restored.testKostenTage,expectedBaseline.testKostenTage);
 tick();
 const finalStorage=await storage.readAuthStore({strict:true});
 const finalNative=await rpc("helmut_auth_state_read_v1",{id:"main-auth"});
 const finalUsage=await rpc("helmut_auth_usage_read_v1",{id:"main-auth"});
 assert.deepEqual(omitRevision(finalStorage),expectedBaseline);
 assert.deepEqual(omitRevision(finalNative.data),expectedBaseline);
 assert.deepEqual(finalUsage.data.llmUsage,expectedBaseline.llmUsage);
 assert.equal(finalNative.proof.count,expectedBaseline.llmUsage.length);
 assert.equal(finalUsage.proof.count,expectedBaseline.llmUsage.length);
 assert.equal(State.build(finalStorage).root,finalNative.state.root);
 assert.equal(measuredCalls.length,expectedOperations);
 assert.equal(privateCalls.length,expectedOperations);
 assert(wire.every(x=>x.bodyComplete&&!x.error&&x.status<400));
 save("READ_PATH_SQL_STATS.PRIVATE.json",{scope:"PRIVATE_RAW_NORMALIZED_QUERY_METADATA_NO_PAYLOADS",phase,mode,calls:privateCalls});
 save("READ_PATH_RESULT.SAFE.json",{
  scope:"SMALL_READ_PATH_ATTRIBUTION_NOT_UNIT60_AUTH30_OR500",
  pass:true,
  phase,
  mode,
  operations:expectedOperations,
  measuredOperations:expectedOperations,
  repeatedPaddedWrites:repeatWrites,
  measuredCalls,
  wire,
  wireMetadataNoBody:true,
  sourcePins:pins(),
  fixtureManifest:fixture,
  baseline:{historyRows:expectedBaseline.llmUsage.length,retainedUnits:expectedBaseline.localDiagnosticState.retainedUnits.length,retainedIntents:expectedBaseline.synthetik500KostenAdmission.plan.intents.length,usersPresent:Object.hasOwn(expectedBaseline,"users"),costBooksPresent:Object.hasOwn(expectedBaseline,"testKostenTage")},
  restored:{historyRows:restored.llmUsage.length,retainedUnits:restored.localDiagnosticState.retainedUnits.length,retainedIntents:restored.synthetik500KostenAdmission.plan.intents.length,usersEqual:true,costBooksEqual:true},
  syntheticPayload:{field:"localDiagnosticState.readPathSyntheticPayload",entries:512,charsPerEntry:8192,approxBytes:4194304,generator:"sha256('local-read-path-'+i).hex.repeat(128)",artificial:true,paidAuthority:false,profiles:false,representativenessClaimed:false,note:"Artificial local diagnostic padding only; no paid authority, no profiles, no representativeness claim."},
  allFieldsRestored:true,
  nativeLogicalDataEqualsExpected:true,
  restoredMatchesBaseline:true,
  finalFreshReadMatches:true,
  noStaleCacheEvidence:true,
  noBindingException:true,
  serverPgStatStatements:{sharedPreload:true,track:"all"},
  databaseTempCountersObserved:true,
  exactFlushClaim:false,
  nestedStatementCountersAreInclusiveDoNotSumAcrossLevels:true,
  privateSqlStatsFile:"/bench/READ_PATH_SQL_STATS.PRIVATE.json",
  activation:false,
  production:false,
  full500:false,
  GOClaimed:false,
  paidProviderCalls:0,
  unit60Auth30Acceptance:false,
  checkpoint:false,
  deadlineMS:DEADLINE_MS,
  limits:["Node-side local read-path attribution only; not Unit60/Auth30/500 acceptance.","PG temp counters are observed counters, not an exact flush claim.","Root independently checks outcome and exact spill-statement attribution."]
 });
})().catch(e=>{console.error(JSON.stringify({error:e.name,code:e.code||null,message:String(e.message).slice(0,200)}));process.exitCode=1;});
