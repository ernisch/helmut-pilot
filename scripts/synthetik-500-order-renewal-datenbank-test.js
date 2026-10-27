"use strict";
// Only the NEW corrective DO is exercised. No old full/native/500 test replay.
const assert=require("node:assert/strict"),cp=require("node:child_process"),crypto=require("node:crypto");
const EU=require("../lib/helmut/synthetik-500-eu-service-contract"),K=require("../lib/helmut/testkosten-budget");
const sql=require("./synthetik-500-eu-renewal-sql").proposal();
const container=process.env.HELMUT_EU_DAY_INIT_PG_CONTAINER;
assert.match(container||"",/^(?:blocker3-eu-pg-[0-9]{8}|helmut-production-blockers-pg-[a-f0-9]{16})$/);
const db="helmut_order_renewal_"+crypto.randomBytes(8).toString("hex"),env={PATH:process.env.PATH};
const q=x=>"'"+String(x).replaceAll("'","''")+"'",j=x=>q(JSON.stringify(x))+"::jsonb";
const psql=(input,database=db)=>cp.execFileSync("docker",["--host=unix:///var/run/docker.sock","exec","-i",container,"psql","-X","-w","-qAt","-v","ON_ERROR_STOP=1","-U","postgres","-d",database,"-f","-"],{env,input,encoding:"utf8",timeout:20000,stdio:["pipe","pipe","pipe"]}).trim();
function fixture(){
  const books={};for(let n=Date.parse("2026-09-09");n<=Date.parse("2026-10-15");n+=86400000){
    const day=new Date(n).toISOString().slice(0,10);
    books[day]={version:2,day,tarif:"azure-gpt5-mini-obergrenze-20260909",limit:6000000,spent:0,baseline:0,baselineCalls:0,manualCalls:0,manualUntil:null,calls:{},frozen:null};
  }
  books["2026-10-06"].calls.oldUnknown={status:"ungeklaert",reserved:212000,maxOutputTokens:3000,manual:true,createdAt:"2026-10-06T11:00:00.000Z",bezug:{version:1,runId:"verstehen169-123456"}};
  books["2026-10-06"].manualCalls=1;books["2026-10-06"].frozen="test-usd-ausgang-unklar";
  for(const day of ["2026-10-14","2026-10-15"])Object.assign(books[day],{version:3,tarif:EU.RATE_ID,limit:EU.DAY_MICRO_USD,serviceContractHash:EU.HASH});
  return {testKostenTage:books,testKostenAuftrag:{version:5,id:EU.CONTRACT.orderId,abTag:EU.CONTRACT.orderSinceUTC,limit:EU.ORDER_MICRO_USD,externGebunden:0,serviceContractHash:EU.HASH,privateReserveMicroUSD:636000,bookCapacity:37,runDayUTC:"2026-10-14"},llmUsage:[],pipelineLocks:{},processRuns:[],_authStoreRevision:"11111111-1111-4111-8111-111111111111",sentinel:{kept:true},
    synthetik500KostenAdmission:{plan:{operationId:"synthetik500-old-unused",endsAtUTC:"2026-10-14T21:00:00.000Z"}},
    synthetik500DispatchJournal:{version:"helmut-synthetik500-dispatch-journal/1",activeOperationId:"synthetik500-old-unused",operations:{"synthetik500-old-unused":{operationId:"synthetik500-old-unused",state:"installed"},"synthetik500-old-unknown":{operationId:"synthetik500-old-unknown",state:"unknown",inFlight:{preserved:true}}}}};
}
function reset(auth=fixture()) {psql(`truncate helmut_store,llm_budget_counters,helmut_jobs,helmut_job_outbox,process_runs,pipeline_locks,helmut_end500_internal.bindings;
 update mandate_profiles set aktiv=false,geloescht_at=null;
 insert into helmut_store values('main','{"kept":true}'),('main-auth',${j(auth)}),('historical-command','{"kept":true}');`);}
const read=()=>JSON.parse(psql("select data::text from helmut_store where id='main-auth';"));
const hash=()=>psql("select md5(jsonb_agg(to_jsonb(s)order by id)::text)from helmut_store s;");
function request(day="2026-10-27") {return JSON.parse(psql(`select jsonb_build_object('day',${q(day)},'observedAtUTC',${q(day+"T12:00:00.000Z")},
 'authMD5',(select md5(data::text)from helmut_store where id='main-auth'),
 'mainMD5',(select md5(data::text)from helmut_store where id='main'),
 'profilesMD5',(select md5(jsonb_agg(to_jsonb(p)order by user_id collate "C")::text)from mandate_profiles p),
 'renewalHash',${q(EU.ORDER_RENEWAL_HASH)},'operatorGoSHA256',${q("a".repeat(64))},'quiescenceSHA256',${q("b".repeat(64))},'coverageSHA256',${q("c".repeat(64))});`));}
function run(r=request(),clock="2026-10-27T12:00:00.000Z",role=null) {
  let candidate=sql.replace("request constant jsonb := NULL;",()=>"request constant jsonb := "+j(r)+";")
    .replaceAll("clock_timestamp()",q(clock)+"::timestamptz");
  if(role) candidate="set role "+role+";\n"+candidate;
  return psql(candidate);
}
const groups=[];
function denied(name,edit,rEdit,expected){reset();edit?.();const r=request();rEdit?.(r);const before=hash();let error;
  try{run(r);}catch(e){error=String(e.stderr);}
  assert(error,name+" must close");if(expected)assert.match(error,expected);
  assert.equal(hash(),before,name+" preserves all store rows");groups.push(name);
}
let created=false;
try {
  const info=JSON.parse(cp.execFileSync("docker",["--host=unix:///var/run/docker.sock","inspect",container],{env,encoding:"utf8"}))[0];
  assert.equal(info.HostConfig.NetworkMode,"none");assert.equal(Object.keys(info.HostConfig.PortBindings||{}).length,0);
  assert(info.Config.Image.startsWith("postgres:17.6-bookworm"));
  psql(`create database ${db};`,"postgres");created=true;
  psql(`create schema helmut_end500_internal;
 create table helmut_store(id text primary key,data jsonb not null);
 create table mandate_profiles(user_id text primary key,aktiv boolean not null,geloescht_at timestamptz);
 insert into mandate_profiles select 'synthetic-'||n,false,null from generate_series(1,500)n;
 create table llm_budget_counters(day text,scope text,used integer,primary key(day,scope));
 create table helmut_jobs(id text primary key,status text,lease_expires_at timestamptz);
 create table helmut_job_outbox(id text primary key,status text);
 create table process_runs(id text primary key,status text,finished_at timestamptz);
 create table pipeline_locks(id text primary key,expires_at timestamptz);
 create table helmut_end500_internal.bindings(operation_id text primary key,stopped_am timestamptz);`);
  reset();const before=read();run();const after=read();
  assert.equal(after.testKostenAuftrag.version,6);assert.equal(after.testKostenAuftrag.bookCapacity,49);
  assert.equal(after.testKostenAuftrag.runDayUTC,"2026-10-14");assert.equal(after.testKostenAuftrag.orderRenewalHash,EU.ORDER_RENEWAL_HASH);
  for(const[d,b]of Object.entries(before.testKostenTage))assert.deepEqual(after.testKostenTage[d],b);
  const restored=structuredClone(after);for(const d of Object.keys(restored.testKostenTage))if(d>"2026-10-15")delete restored.testKostenTage[d];
  restored.testKostenAuftrag=before.testKostenAuftrag;restored._authStoreRevision=before._authStoreRevision;assert.deepEqual(restored,before);
  assert.notEqual(after._authStoreRevision,before._authStoreRevision);assert.equal(psql("select count(*)from llm_budget_counters;"),"0");
  assert.equal(K.pruefeStart(after,"2026-10-27",{ok:true,used:0}).startklar,true);groups.push("37to49-all-retained-and-real-JS-consumer");
  denied("null-counter",()=>psql("insert into llm_budget_counters values('2026-10-20','global',null);"),null,/counter-unknown/);
  denied("nonzero-missing-day",()=>psql("insert into llm_budget_counters values('2026-10-20','global',1);"),null,/not-proven-unused/);
  denied("missing-retained-book",()=>psql("update helmut_store set data=data#-'{testKostenTage,2026-10-01}'where id='main-auth';"),null,/exact-predecessor/);
  denied("stale-auth",null,r=>r.authMD5="0".repeat(32),/stale-native/);
  denied("old-observation",null,r=>r.observedAtUTC="2026-10-27T11:58:59.999Z",/fresh-observation/);
  denied("future-observation",null,r=>r.observedAtUTC="2026-10-27T12:00:00.001Z",/fresh-observation/);
  denied("missing-go",null,r=>delete r.operatorGoSHA256,/operator-bindings/);
  denied("wrong-renewal",null,r=>r.renewalHash="0".repeat(64),/operator-bindings/);
  denied("active-profile",()=>psql("update mandate_profiles set aktiv=true where user_id='synthetic-1';"),null,/not-quiescent/);
  denied("live-endguard",()=>psql("insert into helmut_end500_internal.bindings values('synthetic',null);"),null,/not-quiescent/);
  denied("budget-increase",()=>psql("update helmut_store set data=jsonb_set(data,'{testKostenAuftrag,limit}','88845365')where id='main-auth';"),null,/EU-order/);
  denied("live-journal",()=>psql("update helmut_store set data=jsonb_set(data,'{synthetik500DispatchJournal,operations,synthetik500-old-unused,state}','\"running\"')where id='main-auth';"),null,/live-journal/);
  denied("missing-blob-state",()=>psql("update helmut_store set data=data-'pipelineLocks'where id='main-auth';"),null,/blob-state-unbound/);
  denied("live-blob-lock",()=>psql("update helmut_store set data=jsonb_set(data,'{pipelineLocks}','{\"synthetic\":{\"expiresAt\":9999999999999}}')where id='main-auth';"),null,/blob-lock-live/);
  denied("unknown-blob-process",()=>psql("update helmut_store set data=jsonb_set(data,'{processRuns}','[{\"status\":\"unknown\",\"finishedAt\":null}]')where id='main-auth';"),null,/blob-process-not-terminal/);
  denied("relative-blob-finish",()=>psql("update helmut_store set data=jsonb_set(data,'{processRuns}','[{\"status\":\"ok\",\"finishedAt\":\"now\"}]')where id='main-auth';"),null,/blob-process-not-terminal/);
  reset();const endRequest=request("2026-10-31");run(endRequest,"2026-10-31T12:00:00.000Z");
  assert.equal(read().testKostenAuftrag.bookCapacity,53);groups.push("finite-last-day53-books");
  reset();let expired;try{run(request("2026-11-01"),"2026-11-01T12:00:00.000Z");}catch(e){expired=String(e.stderr);}assert.match(expired,/fresh-observation|daybook-request/);groups.push("november-closed");
  reset();let inert;try{psql(sql);}catch(e){inert=String(e.stderr);}assert.match(inert,/operator-bindings-required/);groups.push("unmaterialized-proposal-inert");
  console.log(JSON.stringify({ok:true,groups,groupCount:groups.length,scope:"new isolated PG17 renewal only",productionWrites:0,providerCalls:0}));
} finally {if(created)psql(`drop database ${db};`,"postgres");}
