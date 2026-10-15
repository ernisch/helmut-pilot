"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),cp=require("node:child_process");
const EU=require("../lib/helmut/synthetik-500-eu-service-contract");
const path=require("node:path");
const original=fs.readFileSync(path.join(__dirname,"../supabase/migrations/20261012190000_synthetik500_eu_daybook_init.sql"),"utf8");
const migration=fs.readFileSync(path.join(__dirname,"../supabase/migrations/20261015125137_synthetik500_eu_daybook_rollforward_20261015.sql"),"utf8");
const rpc="public.helmut_synthetik500_eu_daybook_rollforward_20261015",signature=rpc+"(text,text,text,text,integer,bigint)";
const sourceBody=original.match(/as \$fn\$\n([^]*?)\n\$fn\$;/)[1];
const newBody=migration.match(/as \$fn\$\n([^]*?)\n\$fn\$;/)[1];
function prepare(pins){return{sql:"select "+rpc+"(\'2026-10-15\',"+[pins.authMD5,pins.mainMD5,pins.profilesMD5].map(quote).join(",")+",0,0)::text;"};}
const container=process.env.HELMUT_EU_DAY_INIT_PG_CONTAINER,db="helmut_eu_rollforward_"+require("node:crypto").randomBytes(8).toString("hex");
const env={PATH:process.env.PATH},quote=x=>"'"+String(x).replaceAll("'","''")+"'",json=x=>quote(JSON.stringify(x))+"::jsonb";
const dockerArgs=database=>["--host=unix:///var/run/docker.sock","exec","-i",container,"psql","-X","-w","-qAt","-v","ON_ERROR_STOP=1","-U","postgres","-d",database,"-f","-"];
const psql=(s,database=db)=>cp.execFileSync("docker",dockerArgs(database),{input:s,encoding:"utf8",timeout:20000,env,stdio:["pipe","pipe","pipe"]}).trim();
const hash=()=>psql("select md5(jsonb_agg(to_jsonb(s)order by id)::text)from helmut_store s;");
function fixture(){const books={};for(let ms=Date.parse("2026-09-09");ms<Date.parse("2026-10-15");ms+=86400000){const day=new Date(ms).toISOString().slice(0,10);books[day]={version:2,day,tarif:"azure-gpt5-mini-obergrenze-20260909",limit:6000000,spent:0,baseline:0,baselineCalls:0,manualCalls:0,manualUntil:null,calls:{},frozen:null};}
 books["2026-10-06"].calls.preservedUnknownU={status:"ungeklaert",reserved:212000,maxOutputTokens:3000,manual:true,createdAt:"2026-10-06T11:00:00.000Z",bezug:{version:1,runId:"verstehen169-123456"},unknownMarker:"synthetic-kept"};books["2026-10-06"].manualCalls=1;books["2026-10-06"].frozen="test-usd-ausgang-unklar";
 return{testKostenTage:books,testKostenAuftrag:{version:5,id:EU.CONTRACT.orderId,abTag:EU.CONTRACT.orderSinceUTC,limit:EU.ORDER_MICRO_USD,externGebunden:0,serviceContractHash:EU.HASH,privateReserveMicroUSD:EU.PRIVATE_MICRO_USD,bookCapacity:36,runDayUTC:"2026-10-14"},llmUsage:[],_authStoreRevision:"11111111-1111-4111-8111-111111111111",secretSentinel:"synthetic-kept",sourceRoot:{kept:true},synthetik500KostenAdmission:{plan:{operationId:"synthetik500-expired-current",endsAtUTC:"2026-10-14T21:00:00.000Z"}},synthetik500DispatchJournal:{version:"helmut-synthetik500-dispatch-journal/1",activeOperationId:"synthetik500-expired-current",operations:{"synthetik500-expired-current":{operationId:"synthetik500-expired-current",state:"installed"},"synthetik500-old-unknown":{operationId:"synthetik500-old-unknown",state:"unknown",inFlight:{kept:true}}}}};}
function reset(a=fixture()){psql(`truncate helmut_store,llm_budget_counters,helmut_jobs,helmut_job_outbox,process_runs,pipeline_locks,helmut_end500_internal.bindings;
 update mandate_profiles set aktiv=false,geloescht_at=null;
 insert into helmut_store values('main','{"mainSentinel":"synthetic-kept"}'),('main-auth',${json(a)}),('opaque-command','{"keep":true}');`);}
const read=()=>JSON.parse(psql("select data::text from helmut_store where id='main-auth';"));
const stamps=()=>JSON.parse(psql(`select jsonb_build_object('authMD5',(select md5(data::text)from helmut_store where id='main-auth'),'mainMD5',(select md5(data::text)from helmut_store where id='main'),'profilesMD5',(select md5(jsonb_agg(to_jsonb(p)order by user_id collate "C")::text)from mandate_profiles p));`));
const run=pins=>psql("set statement_timeout='15s';set lock_timeout='3s';set role service_role;set request.jwt.claim.role='service_role';\n"+prepare(pins||stamps()).sql);
function refused(label,change,pins){reset();if(change)change();const before=hash();let error;try{run(pins);}catch(e){error=String(e.stderr);}assert(error,label+" must reject");assert.equal(hash(),before,label+" must preserve all store rows");return label;}
let created=false;
(async()=>{
 assert.match(container||"",/^(?:blocker3-eu-pg-[0-9]{8}|eu-daybook-init-pg-[a-f0-9]{16}|helmut-finance-pg-20261015)$/);
 const expected=sourceBody.replace("or (orders->'runDayUTC') is distinct from 'null'::jsonb","or (orders->'runDayUTC') is distinct from '\"2026-10-14\"'::jsonb").replace("  -- Exactly the existing K.historie", "  if native_day <> '2026-10-15' or not ((size=36 and cap=36 and changed and target_cap=37)\n    or (size=37 and cap=37 and not changed and target_cap=37)) then\n    raise exception 'eu-rollforward-exact-transition';\n  end if;\n  -- Exactly the existing K.historie").replace("'run_day_utc',null);","'run_day_utc',next_auth->'testKostenAuftrag'->'runDayUTC');");
 assert.equal(newBody,expected,"entire original native body retained except exact successor gates/receipt");
 const info=JSON.parse(cp.execFileSync("docker",["--host=unix:///var/run/docker.sock","inspect",container],{encoding:"utf8",env}))[0];
 assert.equal(info.HostConfig.NetworkMode,"none");assert.equal(info.Config.Image,"postgres:17.6-bookworm");assert.equal(Object.keys(info.HostConfig.PortBindings||{}).length,0);
 psql(`create database ${db};`,"postgres");created=true;
 psql(`do $$begin if not exists(select from pg_roles where rolname='anon')then create role anon;end if;
 if not exists(select from pg_roles where rolname='authenticated')then create role authenticated;end if;
 if not exists(select from pg_roles where rolname='service_role')then create role service_role;end if;end$$;
 create schema helmut_end500_internal;
 create table helmut_store(id text primary key,data jsonb not null);
 create table mandate_profiles(user_id text primary key,aktiv boolean not null,geloescht_at timestamptz);
 insert into mandate_profiles select 'fictional-'||n,false,null from generate_series(1,500)n;
 create table llm_budget_counters(day text,scope text,used integer,primary key(day,scope));
 create table helmut_jobs(id text primary key,status text,lease_expires_at timestamptz);
 create table helmut_job_outbox(id text primary key,status text);
 create table process_runs(id text primary key,status text,finished_at timestamptz);
 create table pipeline_locks(id text primary key,expires_at timestamptz);
 create table helmut_end500_internal.bindings(operation_id text primary key,stopped_am timestamptz);`);
 // ONLY isolated SQL copies have the native clock substituted. No runtime clock parameter.
 assert(!migration.includes("p_clock")&&!migration.includes("test.eu_daybook_clock"));
 const fixedClock="'2026-10-15T12:00:00Z'::timestamptz";
 psql(original.replaceAll("clock_timestamp()",fixedClock));
 psql(migration.replaceAll("clock_timestamp()",fixedClock));
 for(const role of ["anon","authenticated"])assert.equal(psql(`select has_function_privilege(${quote(role)},${quote(signature)},'EXECUTE');`),"f");
 assert.equal(psql(`select has_function_privilege('service_role',${quote(signature)},'EXECUTE');`),"t");
 assert.equal(psql(`select coalesce(bool_or(a.grantee=0 and a.privilege_type='EXECUTE'),false)from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a where p.oid=${quote(signature)}::regprocedure;`),"f");
 const functionSettings=psql(`select prosecdef::text||'|'||array_to_string(proconfig,',')from pg_proc where oid=${quote(signature)}::regprocedure;`);
 assert(functionSettings.startsWith("true|"));for(const setting of ["search_path=pg_catalog","statement_timeout=15s","lock_timeout=3s"])assert(functionSettings.includes(setting));
 const groups=["serviceOnlyACL+Definer+FixedSearchPath+Timeouts"];
 reset();let callerDenied;try{psql("set role authenticated;set request.jwt.claim.role='service_role';"+prepare(stamps()).sql);}catch(e){callerDenied=String(e.stderr);}assert.match(callerDenied,/permission denied/);groups.push("forgedClaimCannotBypassACL");
 reset();let oldRejected;try{psql("set statement_timeout='15s';set role service_role;set request.jwt.claim.role='service_role';select public.helmut_synthetik500_eu_daybook_init('2026-10-15',"+Object.values(stamps()).map(quote).join(",")+",0,0);");}catch(e){oldRejected=String(e.stderr);}assert.match(oldRejected,/eu-daybook-EU-order/);groups.push("originalNullInitializerUnchanged");
 reset();const before=read(),beforePins=stamps();run(beforePins);const after=read();
 assert.equal(after.testKostenAuftrag.runDayUTC,"2026-10-14");assert.equal(after.testKostenAuftrag.bookCapacity,37);assert.equal(after.testKostenTage["2026-10-15"].spent,0);assert.equal(after.testKostenTage["2026-10-15"].calls&&Object.keys(after.testKostenTage["2026-10-15"].calls).length,0);
 const restored=structuredClone(after);delete restored.testKostenTage["2026-10-15"];restored.testKostenAuftrag.bookCapacity=36;restored._authStoreRevision=before._authStoreRevision;assert.deepEqual(restored,before);assert.notEqual(after._authStoreRevision,before._authStoreRevision);assert.equal(stamps().mainMD5,beforePins.mainMD5);assert.equal(stamps().profilesMD5,beforePins.profilesMD5);assert.equal(psql("select count(*)from llm_budget_counters;"),"0");groups.push("exact37+unchangedRunDayAndWholeRemainder");
 const stable=hash();run();assert.equal(hash(),stable);groups.push("idempotentNoRevisionChange");
 groups.push(refused("staleNativePins",null,{...beforePins,authMD5:"0".repeat(32)}));
 groups.push(refused("runDayNullNotChanged",()=>psql("update helmut_store set data=jsonb_set(data,'{testKostenAuftrag,runDayUTC}','null')where id='main-auth';")));
 groups.push(refused("runDayTodayNoFunding",()=>psql("update helmut_store set data=jsonb_set(data,'{testKostenAuftrag,runDayUTC}','\"2026-10-15\"')where id='main-auth';")));
 groups.push(refused("counterHistoryMismatch",()=>psql("insert into llm_budget_counters values('2026-10-15','global',1);")));
 groups.push(refused("activeProfile",()=>psql("update mandate_profiles set aktiv=true where user_id='fictional-1';")));
 groups.push(refused("liveEndguard",()=>psql("insert into helmut_end500_internal.bindings values('synthetic',null);")));
 groups.push(refused("missingHistoricalOrderDay",()=>psql("update helmut_store set data=data#-'{testKostenTage,2026-10-01}'where id='main-auth';")));
 groups.push(refused("wrongCapacity",()=>psql("update helmut_store set data=jsonb_set(data,'{testKostenAuftrag,bookCapacity}','37')where id='main-auth';")));
 // Existing native lock contract must also hold in the anonymous block.
 for(const line of ["lock table public.mandate_profiles in share mode;","lock table public.llm_budget_counters in share mode;","lock table public.helmut_store in share row exclusive mode;"]){assert(sourceBody.includes(line));assert(newBody.includes(line));}
 reset();const pins=stamps();const held=cp.spawn("docker",dockerArgs(db),{env,stdio:["pipe","pipe","pipe"]});let stdout="";held.stdout.on("data",x=>{stdout+=x;});held.stdin.write("begin;update mandate_profiles set aktiv=true where user_id='fictional-1';select 'writer-held';\n");
 const until=Date.now()+5000;while(!stdout.includes("writer-held")){if(Date.now()>until)throw Error("fixture-writer-not-ready");await new Promise(r=>setTimeout(r,20));}
 const init=cp.spawn("docker",dockerArgs(db),{env,stdio:["pipe","pipe","pipe"]});let errors="";init.stderr.on("data",x=>{errors+=x;});const ended=new Promise(r=>init.on("close",r));init.stdin.end("set statement_timeout='15s';set application_name='rollforward_lock_probe';set role service_role;set request.jwt.claim.role='service_role';\n"+prepare(pins).sql);
 const waitUntil=Date.now()+4000;while(psql("select count(*)from pg_stat_activity where application_name='rollforward_lock_probe'and wait_event_type='Lock';")!=="1"){if(Date.now()>waitUntil)throw Error("actual-lock-wait-missing");await new Promise(r=>setTimeout(r,20));}
 held.stdin.end("commit;\n");assert.notEqual(await ended,0);assert.match(errors,/eu-daybook-stale-native/);groups.push("actualConcurrentProfileCommitInvalidatesPinsAfterLockWait");
 const afterBeforeRollback=hash();
 psql(fs.readFileSync(path.join(__dirname,"../supabase/migrations/rollback_20261015125137_synthetik500_eu_daybook_rollforward_20261015.sql"),"utf8"));
 assert.equal(psql(`select to_regprocedure(${quote(signature)})is null;`),"t");
 assert.equal(psql("select to_regprocedure('public.helmut_synthetik500_eu_daybook_init(text,text,text,text,integer,bigint)')is not null;"),"t");
 assert.equal(hash(),afterBeforeRollback);groups.push("rollbackDropsOnlyNewRPCPreservesOriginalAndAllData");
 const result={schema:"helmut-finance-rollforward-isolated-pg/1",ok:true,database:"isolated temporary PG17.6",network:"none",portBindings:0,clock:"fixed15Oct only in isolated SQL copies",groups,productionWrites:0,providerCalls:0,newRPC:"scoped successor only; production not applied",productionAuthorized:false,independentReview:"not performed",costCoverage:"HOLD"};
 console.log(JSON.stringify(result,null,2));
})().finally(()=>{if(created)psql(`drop database ${db} with(force);`,"postgres");}).catch(e=>{console.error(e.message);process.exitCode=1;});
