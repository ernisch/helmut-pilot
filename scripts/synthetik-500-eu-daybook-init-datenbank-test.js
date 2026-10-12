"use strict";
// Synthetic fixtures in a verified network-none PG17 container only. No Supabase,
// HTTP, model clients, production credentials, or persistent fixture database.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {execFileSync,spawn}=require("node:child_process");
const EU=require("../lib/helmut/synthetik-500-eu-service-contract");
const container=process.env.HELMUT_EU_DAY_INIT_PG_CONTAINER;
const database="helmut_eu_day_init_"+crypto.randomBytes(8).toString("hex");
const day="2026-10-12",clock="2026-10-12T12:00:00Z";
const rpc="public.helmut_synthetik500_eu_daybook_init";
const signature=rpc+"(text,text,text,text,integer,bigint)";
const migrationPath=path.join(__dirname,"../supabase/migrations/20261012190000_synthetik500_eu_daybook_init.sql");
const dockerArgs=db=>["--host=unix:///var/run/docker.sock","exec","-i",container,"psql","-X","-w","-qAt","-v","ON_ERROR_STOP=1","-U","postgres","-d",db,"-f","-"];
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const json=x=>quote(JSON.stringify(x))+"::jsonb";
function psql(sql,db=database){assert([database,"postgres"].includes(db));return execFileSync("docker",dockerArgs(db),{
  input:sql,encoding:"utf8",timeout:20000,env:{PATH:process.env.PATH},stdio:["pipe","pipe","pipe"]}).trim();}
function session(){
  const child=spawn("docker",dockerArgs(database),{env:{PATH:process.env.PATH},stdio:["pipe","pipe","pipe"]});
  let stdout="",stderr="",settled=false; const readers=[];
  child.stdout.on("data",chunk=>{stdout+=chunk;for(const r of [...readers])if(stdout.includes(r.marker)){clearTimeout(r.timer);readers.splice(readers.indexOf(r),1);r.resolve();}});
  child.stderr.on("data",chunk=>{stderr+=chunk;});
  const done=new Promise((resolve,reject)=>{
    child.on("error",reject);child.on("close",code=>{settled=true;for(const r of readers){clearTimeout(r.timer);r.reject(new Error("session ended before "+r.marker+": "+stderr));}
      resolve({code,stdout:stdout.trim(),stderr});});
  });
  const timeout=setTimeout(()=>child.kill("SIGKILL"),20000);done.finally(()=>clearTimeout(timeout));
  return {send(sql){assert(!settled);child.stdin.write(sql+"\n");},end(sql=""){child.stdin.end(sql+"\n");},done,
    marker(marker){if(stdout.includes(marker))return Promise.resolve();return new Promise((resolve,reject)=>{const r={marker,resolve,reject};
      r.timer=setTimeout(()=>{readers.splice(readers.indexOf(r),1);reject(new Error("bounded marker timeout: "+marker));},5000);readers.push(r);});}};
}
async function blocked(name){
  const deadline=Date.now()+4000;
  do{
    if(psql(`select count(*) from pg_stat_activity where datname=${quote(database)} and application_name=${quote(name)} and wait_event_type='Lock';`)==="1")return;
    await new Promise(resolve=>setTimeout(resolve,25));
  }while(Date.now()<deadline);
  assert.fail("expected actual PG lock wait: "+name);
}
const legacyRate="azure-gpt5-mini-obergrenze-20260909";
function legacy(d){return {version:2,day:d,tarif:legacyRate,limit:6000000,spent:0,baseline:0,baselineCalls:0,
  manualCalls:0,manualUntil:null,calls:{},frozen:null};}
function fixture(){
  const books={};for(let ms=Date.parse("2026-09-25");ms<Date.parse(day);ms+=86400000){const d=new Date(ms).toISOString().slice(0,10);books[d]=legacy(d);}
  books["2026-09-26"].calls.preservedUnknownU={status:"ungeklaert",reserved:212000,maxOutputTokens:3000,manual:true,
    createdAt:"2026-09-26T11:00:00.000Z",bezug:{version:1,runId:"verstehen169-123456"},preservedUnknownMarker:{kind:"synthetic-old-U"}};
  books["2026-09-26"].manualCalls=1;books["2026-09-26"].frozen="test-usd-ausgang-unklar";
  return {testKostenAuftrag:{version:5,id:"autonom-bis500-20260926",abTag:"2026-09-25",limit:88845364,
    externGebunden:0,serviceContractHash:EU.HASH,privateReserveMicroUSD:636000,bookCapacity:Object.keys(books).length,runDayUTC:null},
    testKostenTage:books,llmUsage:[],_authStoreRevision:"11111111-1111-4111-8111-111111111111",
    sourceRoot:{preserved:true},otherPolicy:{preserved:true},privateKeySentinel:"synthetic-never-exported",
    synthetik500KostenAdmission:{plan:{operationId:"synthetik500-historical-current",endsAtUTC:"2026-10-11T12:00:00.000Z"}},
    synthetik500DispatchJournal:{version:"helmut-synthetik500-dispatch-journal/1",activeOperationId:"synthetik500-historical-current",operations:{
      "synthetik500-historical-current":{operationId:"synthetik500-historical-current",state:"installed"},
      "synthetik500-historical-earlier":{operationId:"synthetik500-historical-earlier",state:"installed"},
      "synthetik500-historical-unknown":{operationId:"synthetik500-historical-unknown",state:"unknown",inFlight:{preservedUnknownU:true}},
      "synthetik500-historical-stopped":{operationId:"synthetik500-historical-stopped",state:"stopped"}}}};
}
const mainFixture={sourceRoot:{preserved:true},journal:{preserved:true},mandate:["synthetic-only"]};
function reset(auth=fixture(),counter=null){
  psql(`truncate public.helmut_store,public.llm_budget_counters,helmut_end500_internal.bindings,
    public.helmut_jobs,public.helmut_job_outbox,public.process_runs,public.pipeline_locks;
    update public.mandate_profiles set aktiv=false,geloescht_at=null;
    insert into public.helmut_store values('main',${json(mainFixture)}),('main-auth',${json(auth)}),
      ('synthetik500-command-synthetik500-old-synthetic',${json({version:"synthetic-opaque-old-codec",preserved:true})}),
      ('synthetik500-runtime-synthetik500-old-synthetic',${json({version:"helmut-synthetik500-runtime/1",manifest:{preserved:true},snapshot:{preserved:true}})});
    insert into public.helmut_jobs values('failed-old','fehlgeschlagen',null),('done-old','erledigt',null);
    insert into public.helmut_job_outbox values('confirmed-old','bestaetigt'),('failed-old','aufgegeben'),('waived-old','verzichtet');
    insert into public.process_runs values('done-old','success','2026-10-11T12:00Z');
    insert into helmut_end500_internal.bindings values('old-stop','2026-10-11T12:00Z');
    ${counter===null?"":`insert into public.llm_budget_counters(day,scope,used)values(${quote(day)},'global',${counter});`}`);
}
function readAuth(){return JSON.parse(psql("select data::text from public.helmut_store where id='main-auth';"));}
function stamps(){return JSON.parse(psql(`select jsonb_build_object('auth', (select md5(data::text) from helmut_store where id='main-auth'),
    'main',(select md5(data::text) from helmut_store where id='main'),
    'profiles',(select md5(jsonb_agg(to_jsonb(p) order by user_id collate "C")::text)from mandate_profiles p),
    'counter',coalesce((select used from llm_budget_counters where scope='global' and day=${quote(day)}),0));`));}
function invoke(s=stamps(),{date=day,baseline=0,role="service_role"}={}){
  return `set statement_timeout='15s';set lock_timeout='3s';set request.jwt.claim.role=${quote(role)};
    select ${rpc}(${quote(date)},${quote(s.auth)},${quote(s.main)},${quote(s.profiles)},${s.counter},${baseline})::text;`;
}
function refused(reason,prepare,opts){reset();if(prepare)prepare();const before=psql("select jsonb_agg(to_jsonb(s)order by id)::text from helmut_store s;");
  let error;try{psql(invoke(stamps(),opts));}catch(e){error=String(e.stderr);}
  assert(error&&error.includes(reason),"expected "+reason+", received "+error);
  assert.equal(psql("select jsonb_agg(to_jsonb(s)order by id)::text from helmut_store s;"),before,"failed RPC must preserve ALL store rows");
}
function mutateAuth(fn){const auth=readAuth();fn(auth);psql(`update helmut_store set data=${json(auth)} where id='main-auth';`);}
async function raceBefore(kind){
  reset(fixture(),kind==="counter-update"?0:null);const expected=stamps(),before=readAuth();const writer=session(),name="eu_init_wait_"+kind;
  writer.send(`begin;set statement_timeout='15s';set application_name='eu_fixture_writer';
    ${kind==="counter-insert"?`insert into llm_budget_counters(day,scope,used) values('${day}','global',1);`:
    kind==="counter-update"?"update llm_budget_counters set used=1;":
      "update mandate_profiles set aktiv=true where user_id='fictional-1';"}
    select 'fixture-writer-held';`);
  await writer.marker("fixture-writer-held");const initializer=session();initializer.end(`set application_name=${quote(name)};`+invoke(expected));
  await blocked(name);writer.end("commit;");assert.equal((await writer.done).code,0);
  const failed=await initializer.done;assert.notEqual(failed.code,0);assert.match(failed.stderr,/eu-daybook-stale-native/);
  assert.deepEqual(readAuth(),before,"committed competing native writer must invalidate init without auth mutation");
}
async function raceAfter(kind){
  reset();const expected=stamps(),initializer=session(),writer=session(),name="eu_writer_after_"+kind;
  initializer.send("begin;"+invoke(expected)+"select 'initializer-held';");await initializer.marker("initializer-held");
  writer.end(`set statement_timeout='15s';set application_name=${quote(name)};
    ${kind==="counter"?`insert into llm_budget_counters(day,scope,used)values('${day}','global',1);`:
      "update mandate_profiles set aktiv=true where user_id='fictional-1';"}`);
  await blocked(name);initializer.end("commit;");const result=await initializer.done;assert.equal(result.code,0,result.stderr);
  const written=await writer.done;assert.equal(written.code,0,written.stderr);
  assert.equal(readAuth().testKostenTage[day].baselineCalls,0,"blocked writer cannot race inside initializer transaction");
}
async function main(){
  assert.match(container||"",/^(?:blocker3-eu-pg-[0-9]{8}|eu-daybook-init-pg-[a-f0-9]{16})$/);
  const info=JSON.parse(execFileSync("docker",["--host=unix:///var/run/docker.sock","inspect",container],{encoding:"utf8",env:{PATH:process.env.PATH}}))[0];
  assert.equal(info.HostConfig.NetworkMode,"none");assert.equal(info.Config.Image,"postgres:17.6-bookworm");
  assert.equal(Object.keys(info.HostConfig.PortBindings||{}).length,0);
  const original=fs.readFileSync(migrationPath,"utf8");
  assert(!original.includes("test.eu_daybook_clock"));assert(!original.includes("p_clock"));
  const clockOccurrences=(original.match(/clock_timestamp\(\)/g)||[]).length;assert(clockOccurrences>=4);
  // ONLY this isolated copy substitutes the native clock expression. The public
  // RPC has no clock argument or test setting. Fixed expiry remains production
  // behavior; a future CI date cannot reopen the actual contract window.
  const isolated=original.replaceAll("clock_timestamp()",quote(clock)+"::timestamptz");
  psql(`create database ${database} template template0 lc_collate 'C' lc_ctype 'C';`,"postgres");
  try{
    psql(`do $$begin if not exists(select from pg_roles where rolname='anon')then create role anon;end if;
      if not exists(select from pg_roles where rolname='authenticated')then create role authenticated;end if;
      if not exists(select from pg_roles where rolname='service_role')then create role service_role;end if;end$$;
      create schema helmut_end500_internal;
      create table helmut_store(id text primary key,data jsonb not null);
      create table mandate_profiles(user_id text primary key,aktiv boolean not null,geloescht_at timestamptz);
      insert into mandate_profiles select 'fictional-'||n,false,null from generate_series(1,500)n;
      create table llm_budget_counters(day text not null,scope text not null,used integer not null,updated_at timestamptz default now(),primary key(day,scope));
      create table helmut_jobs(id text primary key,status text not null,lease_expires_at timestamptz);
      create table helmut_job_outbox(id text primary key,status text not null);
      create table process_runs(id text primary key,status text not null,finished_at timestamptz);
      create table pipeline_locks(id text primary key,expires_at timestamptz);
      create table helmut_end500_internal.bindings(operation_id text primary key,stopped_am timestamptz);`);
    psql(isolated);
    for(const role of ["anon","authenticated"])
      assert.equal(psql(`select has_function_privilege(${quote(role)},${quote(signature)},'EXECUTE');`),"f");
    assert.equal(psql(`select has_function_privilege('service_role',${quote(signature)},'EXECUTE');`),"t");
    assert.equal(psql(`select coalesce(bool_or(a.grantee=0 and a.privilege_type='EXECUTE'),false)from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a where p.oid=${quote(signature)}::regprocedure;`),"f");
    reset();const before=readAuth(),beforeStamps=stamps();
    const initialized=JSON.parse(psql("set role service_role;"+invoke(beforeStamps)));assert.equal(initialized.status,"initialized");
    assert.equal(initialized.book_capacity,Object.keys(before.testKostenTage).length+1);
    assert.equal(initialized.baseline_micro_usd,0);assert.equal(initialized.counter_used,0);
    assert.equal(initialized.run_day_utc,null);assert.equal(initialized.production_ready,false);assert.equal(initialized.paid_test_go,false);
    const after=readAuth();assert.notEqual(after._authStoreRevision,before._authStoreRevision);
    assert.equal(after.testKostenAuftrag.runDayUTC,null);
    const permittedBefore=structuredClone(before),permittedAfter=structuredClone(after);
    delete permittedBefore._authStoreRevision;delete permittedAfter._authStoreRevision;
    delete permittedAfter.testKostenTage[day];permittedAfter.testKostenAuftrag.bookCapacity--;
    assert.deepEqual(permittedAfter,permittedBefore,"only book/capacity/auth CAS revision may change");
    assert.equal(stamps().main,beforeStamps.main);assert.equal(stamps().profiles,beforeStamps.profiles);
    assert.equal(psql(`with stale as(update helmut_store set data=${json(before)} where id='main-auth'
      and data->>'_authStoreRevision'=${quote(before._authStoreRevision)} returning id)select count(*)from stale;`),"0","old conditional auth writer must conflict");
    assert.equal(psql("select count(*) from llm_budget_counters;"),"0","absent counter stays absent");
    const noOpBefore=psql("select data::text from helmut_store where id='main-auth';");
    assert.equal(JSON.parse(psql(invoke())).status,"already-present");
    assert.equal(psql("select data::text from helmut_store where id='main-auth';"),noOpBefore,"pristine existing book must be byte-stable jsonb/no revision change");
    reset();const withSpare=readAuth();withSpare.testKostenAuftrag.bookCapacity++;reset(withSpare);
    assert.equal(JSON.parse(psql(invoke())).book_capacity,withSpare.testKostenAuftrag.bookCapacity,"already-minimal spare capacity not raised");
    reset();mutateAuth(a=>delete a._authStoreRevision);assert.equal(JSON.parse(psql(invoke())).status,"initialized");
    assert.match(readAuth()._authStoreRevision,/^[a-f0-9-]{36}$/);
    assert.equal(psql(`with stale as(update helmut_store set data='{}'::jsonb where id='main-auth'
      and data->>'_authStoreRevision'is null returning id)select count(*)from stale;`),"0","old revision-absent CAS must conflict too");
    refused("eu-daybook-caller",null,{role:"authenticated"});
    reset();assert.throws(()=>psql("set role anon;"+invoke(stamps())),/permission denied for function helmut_synthetik500_eu_daybook_init/);
    refused("eu-daybook-request",null,{date:"2026-10-13"});
    reset();assert.throws(()=>psql("begin isolation level repeatable read;"+invoke()+"commit;"),/eu-daybook-isolation/);
    reset();const stale=stamps();psql("update helmut_store set data=data||'{\"changed\":true}'::jsonb where id='main';");
    assert.throws(()=>psql(invoke(stale)),/eu-daybook-stale-native/);
    refused("eu-daybook-capacity",()=>mutateAuth(a=>a.testKostenAuftrag.bookCapacity+=2));
    refused("eu-daybook-EU-order",()=>mutateAuth(a=>a.testKostenAuftrag.runDayUTC=day));
    refused("eu-daybook-EU-order",()=>mutateAuth(a=>a.testKostenAuftrag.limit++));
    refused("eu-daybook-current-book",()=>mutateAuth(a=>{a.testKostenTage[day]=legacy(day);a.testKostenAuftrag.bookCapacity++;}));
    refused("eu-daybook-missing-order-day",()=>mutateAuth(a=>{delete a.testKostenTage["2026-10-01"];a.testKostenAuftrag.bookCapacity--;}));
    refused("eu-daybook-old-ledger",()=>mutateAuth(a=>a.testKostenTage["2026-10-01"].spent=1));
    refused("eu-daybook-unsettled-EU-or-cost",()=>mutateAuth(a=>{
      const b=a.testKostenTage["2026-10-01"];Object.assign(b,{version:3,tarif:EU.RATE_ID,limit:82036000,serviceContractHash:EU.HASH});
      b.calls.euUnknown={status:"ungeklaert",reserved:81400,maxOutputTokens:3000,manual:false,createdAt:"2026-10-01T12:00Z",contractHash:EU.HASH,tarif:EU.RATE_ID};}));
    refused("eu-daybook-opening",()=>mutateAuth(a=>{
      a.testKostenTage["2026-09-25"].baseline=a.testKostenTage["2026-09-25"].spent=6000000;
      a.testKostenTage["2026-09-27"].baseline=a.testKostenTage["2026-09-27"].spent=809365;}));
    refused("eu-daybook-not-quiescent",()=>psql("update mandate_profiles set aktiv=true where user_id='fictional-1';"));
    refused("eu-daybook-not-quiescent",()=>psql("insert into helmut_jobs values('live','wartend',null);"));
    refused("eu-daybook-not-quiescent",()=>psql("insert into helmut_job_outbox values('live','offen');"));
    refused("eu-daybook-not-quiescent",()=>psql("insert into process_runs values('live','running',null);"));
    refused("eu-daybook-not-quiescent",()=>psql("insert into pipeline_locks values('live','2026-10-12T13:00Z');"));
    refused("eu-daybook-not-quiescent",()=>psql("insert into helmut_end500_internal.bindings values('live',null);"));
    refused("eu-daybook-live-slot",()=>mutateAuth(a=>a.synthetik500KostenAdmission.plan.endsAtUTC="2026-10-12T13:00Z"));
    refused("eu-daybook-live-journal",()=>mutateAuth(a=>a.synthetik500DispatchJournal.operations["synthetik500-historical-current"].state="running"));
    const billable={createdAt:day+"T11:00:00.000Z",model:"gpt-5-mini-eu",estimatedCost:0,promptTokens:1,completionTokens:0,totalTokens:1};
    refused("eu-daybook-history-counter",()=>mutateAuth(a=>a.llmUsage=[{...billable,promptTokens:0}]));
    refused("eu-daybook-history",()=>mutateAuth(a=>a.llmUsage=[{createdAt:12345,model:"unknown"}]));
    reset(fixture(),-1);assert.throws(()=>psql(invoke()),/eu-daybook-request/);
    refused("eu-daybook-tokens",()=>{mutateAuth(a=>a.llmUsage=[{...billable,promptTokens:0.5}]);psql(`insert into llm_budget_counters(day,scope,used)values('${day}','global',1);`);});
    refused("eu-daybook-opening",()=>{mutateAuth(a=>a.llmUsage=[billable]);psql(`insert into llm_budget_counters(day,scope,used)values('${day}','global',1);`);},{baseline:1});
    refused("eu-daybook-no-call",()=>mutateAuth(a=>a.llmUsage=[{...billable,keinAufruf:true,success:false,callType:"skipped-fixture",model:"none",promptTokens:0,completionTokens:0,totalTokens:1}]));
    reset();mutateAuth(a=>a.llmUsage=[{createdAt:day+"T11:00:00.000Z",keinAufruf:true,success:false,callType:"skipped-fixture",model:"none",estimatedCost:0,promptTokens:0,completionTokens:0,totalTokens:0}]);
    assert.equal(JSON.parse(psql(invoke())).status,"initialized","genuine explicit no-call is preserved and not billed");
    for(const kind of ["counter-insert","counter-update","profile"])await raceBefore(kind);
    for(const kind of ["counter","profile"])await raceAfter(kind);
    reset();psql(invoke());
    const outsideWindow=original.replace("create function public.helmut_synthetik500_eu_daybook_init", "create or replace function public.helmut_synthetik500_eu_daybook_init")
      .replaceAll("clock_timestamp()",quote("2026-10-26T12:00:00Z")+"::timestamptz");
    psql(outsideWindow);assert.throws(()=>psql(invoke(stamps(),{date:"2026-10-26"})),/eu-daybook-request/);
    const preserved=psql("select jsonb_agg(to_jsonb(s)order by id)::text from helmut_store s;");
    psql(fs.readFileSync(path.join(__dirname,"../supabase/migrations/rollback_20261012190000_synthetik500_eu_daybook_init.sql"),"utf8"));
    assert.equal(psql("select jsonb_agg(to_jsonb(s)order by id)::text from helmut_store s;"),preserved);
    assert.equal(psql(`select to_regprocedure(${quote(signature)})is null;`),"t");
    console.log("PASS isolated PG17 atomic EU daybook: service-only, fresh six guards, actual lock-wait counter insert/update and profile writers, narrow preserved mutation/no-op, genuine history/opening refusal, rollback only RPC. Test-only fixed native clock="+clock);
  }finally{psql(`drop database ${database} with(force);`,"postgres");}
}
if(require.main===module)main().catch(e=>{console.error(String(e.stderr||e.stack));process.exitCode=1;});
module.exports={main};
