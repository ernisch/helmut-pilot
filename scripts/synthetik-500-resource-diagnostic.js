"use strict";
// Separate synthetic resource diagnostic. Never an original/W15/full500 gate.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {execFileSync}=require("node:child_process");
const Fixture=require("./fixtures/resource500-diagnostic");
const SCHEMA="helmut-synthetic500-resource-diagnostic/1";
const PHASES=new Set(["configuration","prepare-database","services","dataset","provision","activate","understanding","work","readback","deactivate","closed"]);
const ASSERTIONS=new Set(["diagnostic-fresh-database-required","diagnostic-ca-required-before-node-start","diagnostic-stop-or-deadline","diagnostic-exact-active-cohort-required","diagnostic-initial-zero-required","diagnostic-provision-refused","diagnostic-positive-native-understanding-required","diagnostic-native-matches-required","diagnostic-native-decisions-required","diagnostic-positive-current-briefing-required","diagnostic-cleanup-only-newly-owned-profiles","diagnostic-local-preload-required"]);
ASSERTIONS.add("diagnostic-synthetic-profile-selector-required");
ASSERTIONS.add("diagnostic-required-schema-migration-missing");ASSERTIONS.add("diagnostic-schema-migration-list-unique");
// Only the current application seams used below: profiles/RLS, sources/KO,
// budgets/locks, matching audit, Understanding leases/CAS and usage recording.
// Historical cohort gates/timers/daybooks are separate operator installations.
const DIAGNOSTIC_MIGRATIONS=Object.freeze([
  "20260711_presale_hardening.sql","20260712_mandate_profile_completeness.sql","20260712_mandate_profile_fields.sql",
  "20260712_tenant_rls_policies.sql","20260713_source_architecture.sql","20260714_ko_classification.sql",
  "20260715_dedup_findings.sql","20260716_gate_shadow_telemetry.sql","20260716_llm_usage_source_attribution.sql",
  "20260717_llm_budget_reservation.sql","20260718_source_crawl_telemetry.sql","20260719_pipeline_lock_atomic.sql",
  "20260720_crawl_runs_relational.sql","20260721_security_advisor_hardening.sql","20260727_process_runs_relational.sql",
  "20260728_matching_audit.sql","20260808_llm_budget_fairness.sql","20260813090100_verteilte_grenzen.sql",
  "20260814180000_verstehen_cas.sql","20260823043633_verstehen_aufgeben_erneut_freigegeben.sql","20260902121500_llm_usage_relational.sql"]);
function diagnosticMigrations(files){
  assert(Array.isArray(files));const available=new Map();for(const file of files){assert(path.isAbsolute(file));
    const name=path.basename(file);assert(!available.has(name),"diagnostic-schema-migration-list-unique");available.set(name,file);}
  return DIAGNOSTIC_MIGRATIONS.map(name=>{assert(available.has(name),"diagnostic-required-schema-migration-missing");return available.get(name);});
}
const CODES=new Set(["ERR_ASSERTION","MODULE_NOT_FOUND","ERR_MODULE_NOT_FOUND","EACCES","EPERM","ENOENT","EEXIST","ECONNREFUSED","ETIMEDOUT","EPIPE","ENOTFOUND","ECONNRESET"]);
const SQLSTATES=new Set(["42P01","42703","42883","42501","23505","23503","3D000","28P01","57014","22023","42601","XX000","08006"]);
function nativeStatus(value){return["saved","skipped","failed","disabled"].includes(value)?value:"unknown";}
function closedFailure(error,status="unknown"){
  const assertion=typeof error?.message==="string"?error.message.split("\n",1)[0]:null;
  return{assertion:ASSERTIONS.has(assertion)?assertion:"UNKNOWN",code:CODES.has(error?.code)?error.code:"UNKNOWN",
    sqlstate:SQLSTATES.has(error?.diagnosticSQLSTATE)?error.diagnosticSQLSTATE:"UNKNOWN",nativeStatus:nativeStatus(status)};
}
function databaseFailure(error){
  const line=String(error.stderr||"").match(/(?:^|\n)(?:psql:[^\r\n]*: )?(?:ERROR|FATAL):\s+([0-9A-Z]{5})\s*(?:\n|$)/);
  error.diagnosticSQLSTATE=line&&SQLSTATES.has(line[1])?line[1]:"UNKNOWN";return error;
}
function failureReceipt(c,error,phase){const detail=error.safeResult?.firstFailureDetail;
  return{schema:SCHEMA,nonce:c.nonce,phase:PHASES.has(phase)?phase:"configuration",
    failureDetail:detail?closedFailure({message:detail.assertion,code:detail.code,diagnosticSQLSTATE:detail.sqlstate},detail.nativeStatus):closedFailure(error),retryAllowed:false};}
function exact(v,keys){assert(v&&typeof v==="object"&&!Array.isArray(v));assert.deepEqual(Object.keys(v).sort(),keys.slice().sort());}
function directory(filename){
  assert(path.isAbsolute(filename)&&path.normalize(filename)===filename);
  for(let p=filename;;p=path.dirname(p)){const s=fs.lstatSync(p);assert(s.isDirectory()&&!s.isSymbolicLink());if(p===path.dirname(p))break;}
  const s=fs.lstatSync(filename);assert.equal(s.uid,process.getuid());assert.equal(s.mode&511,448);return filename;
}
function privateJSON(filename){
  directory(path.dirname(filename));const fd=fs.openSync(filename,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try{const s=fs.fstatSync(fd);assert(s.isFile()&&s.uid===process.getuid()&&(s.mode&511)===384&&s.nlink===1&&s.size>0&&s.size<=65536);
    const raw=fs.readFileSync(fd);assert.equal(raw.length,s.size);return JSON.parse(raw);}finally{fs.closeSync(fd);}
}
function write(root,name,value){
  directory(root);assert(/^[A-Z_]+\.(?:SAFE|PRIVATE)\.json$/.test(name));
  const fd=fs.openSync(path.join(root,name),"wx",0o600);
  try{fs.writeFileSync(fd,JSON.stringify(value)+"\n");fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
function configuration(value){
  exact(value,["schema","mode","count","nonce","database","postgrestURL","serviceToken","resultRoot","maxWallSeconds","datasetEpochUTC"]);
  assert.equal(value.schema,SCHEMA);assert(["synthetic500","preflight"].includes(value.mode));
  assert(value.mode==="synthetic500"?value.count===500:[2,3].includes(value.count));
  assert(/^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/.test(value.nonce));
  exact(value.database,["host","port","name","user","password"]);
  assert.equal(value.database.host,"127.0.0.1");assert.equal(value.database.port,5432);
  assert.equal(value.database.name,value.mode==="synthetic500"?"resource_diag500":"resource_diag_preflight");
  assert.equal(value.database.user,"postgres");assert(typeof value.database.password==="string"&&value.database.password.length<=256);
  assert.equal(value.postgrestURL,"http://127.0.0.1:3000");
  assert(typeof value.serviceToken==="string"&&/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.serviceToken));
  assert(value.serviceToken.length<=8192);
  const claims=JSON.parse(Buffer.from(value.serviceToken.split(".")[1],"base64url"));
  assert.equal(claims.role,"service_role");assert.equal(claims.resourceDiagnosticNonce,value.nonce);
  assert(Number.isInteger(claims.exp)&&claims.exp>Math.floor(Date.now()/1000)&&claims.exp<=Math.floor(Date.now()/1000)+3600);
  assert(Number.isInteger(value.maxWallSeconds)&&value.maxWallSeconds>=60&&value.maxWallSeconds<=3600);
  assert.equal(new Date(value.datasetEpochUTC).toISOString(),value.datasetEpochUTC);
  assert(Math.abs(Date.now()-Date.parse(value.datasetEpochUTC))<=3600000);
  directory(value.resultRoot);return value;
}
function args(argv){
  assert.equal(argv.length,3);assert(["--services","--prepare-database","--app","--preflight-klein"].includes(argv[0]));
  assert.equal(argv[1],"--config");return{action:argv[0],configPath:argv[2]};
}
function psql(c,sql){
  try{return execFileSync("psql",["-X","-w","-qAt","-v","ON_ERROR_STOP=1","-v","VERBOSITY=sqlstate","-h","127.0.0.1","-p","5432","-U",c.database.user,"-d",c.database.name,"-f","-"],
    {input:sql,encoding:"utf8",timeout:30000,maxBuffer:32*1024*1024,stdio:["pipe","pipe","pipe"],
      env:{PATH:process.env.PATH,LANG:"C.UTF-8",PGPASSWORD:c.database.password,PGCONNECT_TIMEOUT:"5",PGOPTIONS:"-c statement_timeout=25000 -c lock_timeout=3000"}}).trim();
  }catch(error){throw databaseFailure(error);}
}
async function prepareDatabase(c,bootstrap=null){
  assert.equal(psql(c,"select current_database();"),c.database.name);
  assert.equal(psql(c,"select count(*) from pg_tables where schemaname='public';"),"0","diagnostic-fresh-database-required");
  const Z=bootstrap||require("./skalierung-z3-realistiklauf");
  assert.equal(typeof Z.baueLokalesSchema,"function");assert.equal(typeof Z.VORBEREITUNG_SQL,"string");assert.equal(typeof Z.NACHBEREITUNG_SQL,"string");
  const root=path.join(c.resultRoot,"schema");fs.mkdirSync(root,{mode:0o700});const files=Z.baueLokalesSchema(root);
  psql(c,Z.VORBEREITUNG_SQL);psql(c,fs.readFileSync(files.schemaDatei,"utf8"));
  for(const file of diagnosticMigrations(files.migrationen))psql(c,fs.readFileSync(file,"utf8"));
  psql(c,Z.NACHBEREITUNG_SQL);
  psql(c,"insert into public.helmut_store(id,data)values('main-auth','{\"users\":[],\"llmUsage\":[]}'::jsonb)on conflict(id)do nothing;");
  assert.equal(psql(c,"select count(*)from public.mandate_profiles;"),"0");
  assert.equal(psql(c,"select count(*)from public.knowledge_objects;"),"0");
  assert.equal(psql(c,"select count(*)from public.raw_documents;"),"0");
  psql(c,"notify pgrst,'reload schema';");
  write(c.resultRoot,"PREPARED_DATABASE.SAFE.json",{schema:SCHEMA,nonce:c.nonce,database:c.database.name,
    status:"PREPARED_EMPTY_SYNTHETIC_DATABASE_ONLY",profiles:0,executionAuthority:false});
}
function loopback(url,protocol){const u=new URL(url);assert.equal(u.hostname,"127.0.0.1");assert.equal(u.protocol,protocol);assert(!u.username&&!u.password);assert(Number(u.port)>0);return u.href.replace(/\/$/,"");}
function bindings(c,value){
  exact(value,["schema","nonce","databaseURL","rssURL","kiURL","caPath"]);assert.equal(value.schema,SCHEMA);assert.equal(value.nonce,c.nonce);
  loopback(value.databaseURL,"http:");loopback(value.rssURL,"http:");loopback(value.kiURL,"https:");
  assert(path.isAbsolute(value.caPath)&&value.caPath.startsWith(c.resultRoot+path.sep));
  const s=fs.lstatSync(value.caPath);assert(s.isFile()&&!s.isSymbolicLink()&&s.uid===process.getuid()&&(s.mode&511)===384);
  return value;
}
function localAIReport(service){
  try{const r=service?.bericht();if(!r)return"UNKNOWN";const n=value=>typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER?value:"UNKNOWN";
    return{aufrufe:n(r.aufrufe),erfolgreich:n(r.erfolgreich),fehler:n(r.fehler),abgewiesenWegenObergrenze:n(r.abgewiesenWegenObergrenze),
      eingabeBytes:n(r.eingabeZeichen),ausgabeBytes:n(r.ausgabeZeichen),eingabeTokenGeschaetzt:n(r.eingabeTokenGeschaetzt),ausgabeTokenGeschaetzt:n(r.ausgabeTokenGeschaetzt),
      bytesJeGeschaetztemToken:n(r.zeichenJeToken),gleichzeitigSpitze:n(r.gleichzeitigSpitze),
      dauerMs:Object.fromEntries(["n","min","p50","p95","max","mittel"].map(key=>[key,n(r.dauerMs?.[key])]))};
  }catch(_){return"UNKNOWN";}
}
async function services(c){
  const Z=require("./fixtures/z3-plattform"),data=Fixture.cases(c.datasetEpochUTC);
  const started=[];let first=null;
  try{
    started.push(await Z.starteDatenbankTor({postgrestPort:3000}));
    started.push(await Z.starteAnbieterUrsprung({latenzMs:0,ausfallAnteil:0,drosselAnteil:0}));
    started.push(await Z.starteKiEndpunkt({verzeichnis:path.join(c.resultRoot,"tls"),latenzMs:5,latenzStreuungMs:0,fehlerAnteil:0,
      hoechstzahlAufrufe:128,responseForRequest:(request,schema)=>Fixture.response(request,schema,c.datasetEpochUTC,data)}));
    const [database,rss,ki]=started;
    write(c.resultRoot,"SERVICE_BINDINGS.PRIVATE.json",{schema:SCHEMA,nonce:c.nonce,databaseURL:database.url,rssURL:rss.url,kiURL:ki.url,caPath:ki.caPfad});
    write(c.resultRoot,"SERVICES_READY.SAFE.json",{schema:SCHEMA,nonce:c.nonce,ready:true,pid:process.pid,
      databasePort:new URL(database.url).port*1,rssPort:rss.port,kiPort:ki.port});
    await new Promise(resolve=>{process.once("SIGTERM",resolve);process.once("SIGINT",resolve);});
  }catch(error){first=error;}
  finally{
    const outcomes=await Promise.allSettled(started.map(s=>s.stoppe()));
    write(c.resultRoot,"SERVICES_CLOSED.SAFE.json",{schema:SCHEMA,nonce:c.nonce,
      closed:outcomes.every(r=>r.status==="fulfilled"),failed:first!==null,localSimulatedAI:localAIReport(started[2]),executionAuthority:false});
  }
  if(first)throw first;
}
function environment(c,b){
  Object.assign(process.env,{HELMUT_SOURCE_MODE:"off",HELMUT_STORAGE_BACKEND:"supabase",HELMUT_SUPABASE_AUTH_STORE_ID:"main-auth",
    HELMUT_V3_STORE:"1",HELMUT_PROFILE_DB_MODE:"1",HELMUT_PROFILE_DB_EXCLUSIVE:"1",HELMUT_V3_MATCHING:"1",
    HELMUT_KI_LOOPBACK_ERLAUBT:"1",SUPABASE_URL:b.databaseURL,SUPABASE_SERVICE_ROLE_KEY:c.serviceToken,
    AZURE_OPENAI_ENDPOINT:b.kiURL,AZURE_OPENAI_KEY:"LOCAL_SYNTHETIC_DIAGNOSTIC_NOT_A_PROVIDER_CREDENTIAL"});
  assert.equal(process.env.NODE_EXTRA_CA_CERTS,b.caPath,"diagnostic-ca-required-before-node-start");
}
function native(c){
  return {activeIDs:()=>JSON.parse(psql(c,"select coalesce(json_agg(user_id order by user_id),'[]')from public.mandate_profiles where aktiv;")),
    count:table=>{assert(["knowledge_objects","raw_documents","ko_document_links","matching_results","briefings"].includes(table));return Number(psql(c,"select count(*)from public."+table+";"));}};
}
function production(c){
  const S=require("../lib/helmut/storage"),P=require("../lib/helmut/provisioning"),U=require("../lib/helmut/understanding");
  return {profile:id=>S.getProfile(id),provision:spec=>P.provisionTenant(spec,{}, {neuAktiv:false,kontoBeiFehlerBehalten:true}),
    participate:(id,active)=>P.setTestProfileParticipation(id,active),saveSource:d=>S.saveRawDocument(d),
    understand:cluster=>U.understandOneCluster(cluster,U.defaultDeps({runId:"resource-diagnostic-"+c.nonce})),
    match:profile=>require("../lib/helmut/matching").runMatchingShadow({profile}),
    decide:profile=>require("../lib/helmut/decisions").runDecisionShadow({profile}),
    build:profile=>require("../server").__buildV3Briefing(profile,profile.id),
    storeResult:async(profile,result)=>{const day=require("../lib/helmut/briefing-frische").berlinTagKey(new Date());
      const id="resource-diagnostic-"+profile.id;
      const entry={id,user_id:profile.id,slot:"mandatsbriefing",generated_at:new Date().toISOString(),
        payload:{schema:SCHEMA,diagnosticOnly:true,formalBriefingAcceptance:false,nonce:c.nonce,profileId:profile.id,day,briefing:result}};
      assert.equal((await S.insertRenderedBriefingV3(entry)).saved,true);
      // Strict native readback is additionally required below, never a Map result.
      const read=JSON.parse(psql(c,"select payload::text from public.briefings where id='"+id+"';"));
      assert.deepEqual(read,JSON.parse(JSON.stringify(entry.payload)));return true;},...native(c)};
}
async function workload(c,b,deps=null){
  let phase="dataset",failure=null,firstFailureDetail=null,cleanupFailureDetail=null,status="unknown",zero="UNKNOWN",activeObservations=0,positive=0,understood=0,provisioned=0;
  let stop=false;const deadline=Date.now()+c.maxWallSeconds*1000;
  const onStop=()=>{stop=true;};process.once("SIGTERM",onStop);process.once("SIGINT",onStop);
  const check=()=>assert(!stop&&Date.now()<deadline,"diagnostic-stop-or-deadline");
  const all=Fixture.selectedSpecs(c.count),ids=all.map(p=>p.id).sort(),created=new Set();
  const allCases=Fixture.cases(c.datasetEpochUTC),data=c.mode==="preflight"?Fixture.selectedCases(allCases,all):allCases;
  write(c.resultRoot,"APP_ATTEMPT.PRIVATE.json",{schema:SCHEMA,nonce:c.nonce,count:c.count});
  write(c.resultRoot,"DATASET.SAFE.json",{...Fixture.manifest(c.datasetEpochUTC),executedCaseCount:data.length,executedSourceCount:data.length*4,executedProfileCount:c.count});
  if(!deps){environment(c,b);deps=production(c);}
  const assertActive=async()=>{check();assert.deepEqual(await deps.activeIDs(),ids,"diagnostic-exact-active-cohort-required");activeObservations++;};
  try{
    assert.deepEqual(await deps.activeIDs(),[],"diagnostic-initial-zero-required");
    phase="provision";
    for(const spec of all){check();assert.equal(await deps.profile(spec.id),null);
      const made=await deps.provision({...spec,password:crypto.randomBytes(24).toString("hex")});assert.equal(made.ok,true,"diagnostic-provision-refused");provisioned++;
      const actual=await deps.profile(spec.id);assert(actual&&actual.profileActive===false&&actual.provisionedBy==="helmut-provisioning");created.add(spec.id);}
    phase="activate";
    for(const id of ids){check();assert.equal((await deps.participate(id,true)).ok,true);}
    await assertActive();
    phase="understanding";
    for(const item of data){status="unknown";await assertActive();
      for(const doc of item.documents)assert.equal((await deps.saveSource(doc)).saved,true);
      const result=await deps.understand({documents:item.documents});status=nativeStatus(result?.status);assert.equal(result?.status,"saved","diagnostic-positive-native-understanding-required");understood++;
    }
    phase="work";
    for(const id of ids){await assertActive();const profile=await deps.profile(id);assert(profile&&profile.profileActive===true&&profile.id===id);
      const matching=await deps.match(profile);assert(!matching.skipped&&matching.saved>0,"diagnostic-native-matches-required");
      const decisions=await deps.decide(profile);assert(!decisions.skipped&&decisions.saved>0,"diagnostic-native-decisions-required");
      const result=await deps.build(profile);assert(result&&result.available===true&&Array.isArray(result.items)&&result.items.length>0,"diagnostic-positive-current-briefing-required");
      assert.equal(await deps.storeResult(profile,result),true);positive++;
    }
    phase="readback";await assertActive();
    assert.equal(positive,c.count);assert.equal(await deps.count("knowledge_objects"),data.length);
    assert.equal(await deps.count("raw_documents"),data.length*4);assert.equal(await deps.count("ko_document_links"),data.length*4);
    assert.equal(await deps.count("briefings"),c.count);assert(await deps.count("matching_results")>=c.count);
  }catch(error){failure=PHASES.has(phase)?phase:"configuration";firstFailureDetail=closedFailure(error,phase==="understanding"?status:"unknown");}
  finally{
    const primary=failure;phase="deactivate";
    try{const active=await deps.activeIDs();assert(active.every(id=>created.has(id)),"diagnostic-cleanup-only-newly-owned-profiles");
      for(const id of active)assert.equal((await deps.participate(id,false)).ok,true);
      const after=await deps.activeIDs();assert.deepEqual(after,[]);zero=0;
    }catch(error){cleanupFailureDetail=closedFailure(error);failure=primary||"deactivate";if(!primary)firstFailureDetail=cleanupFailureDetail;}
    process.removeListener("SIGTERM",onStop);process.removeListener("SIGINT",onStop);
  }
  const result={schema:SCHEMA,nonce:c.nonce,status:failure?"FAIL_OR_UNKNOWN_DIAGNOSTIC":"PASS_SYNTHETIC_DIAGNOSTIC_WORKLOAD_ONLY",
    firstFailurePhase:failure,firstFailureDetail,cleanupFailureDetail,requestedProfiles:c.count,provisionedProfiles:provisioned,positiveProfileResults:positive,
    activeCohortReadbacks:activeObservations,understoodCases:understood,finalActiveProfiles:zero,
    simulatedProviderOnly:true,originalDataUsed:false,formal1500Acceptance:false,end500Acceptance:false,mock500Acceptance:false,
    productionProof:false,executionAuthority:false,retryAllowed:false};
  write(c.resultRoot,"APP_RESULT.SAFE.json",result);if(failure)throw Object.assign(Error("RESOURCE_DIAGNOSTIC_FAILED"),{safeResult:result});return result;
}
async function main(argv=process.argv.slice(2)){
  const parsed=args(argv);assert(require.cache[require.resolve("./lokaler-netzschutz")],"diagnostic-local-preload-required");
  osGuard();process.umask(0o077);const c=configuration(privateJSON(parsed.configPath));
  const phase=parsed.action==="--services"?"services":parsed.action==="--prepare-database"?"prepare-database":"work";
  try{
    if(parsed.action==="--services")return await services(c);
    if(parsed.action==="--prepare-database")return await prepareDatabase(c);
    assert.equal(parsed.action,c.mode==="preflight"?"--preflight-klein":"--app");
    const b=bindings(c,privateJSON(path.join(c.resultRoot,"SERVICE_BINDINGS.PRIVATE.json")));
    return await workload(c,b);
  }catch(error){const receipt=failureReceipt(c,error,error.safeResult?.firstFailurePhase||phase);
    try{write(c.resultRoot,"WORKLOAD_FAILURE.SAFE.json",receipt);}catch(_){}
    throw Object.assign(error,{diagnosticReceipt:receipt});}
}
function osGuard(){const guard=require("./lokaler-netzschutz");assert.deepEqual(guard.pruefe(process.env),[]);}
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({schema:SCHEMA,status:"FAIL_OR_UNKNOWN_DIAGNOSTIC",
  ...(error.diagnosticReceipt||{phase:"configuration",failureDetail:closedFailure(error),retryAllowed:false})}));process.exitCode=1;});
module.exports={SCHEMA,args,configuration,bindings,privateJSON,write,workload,prepareDatabase,services,main,closedFailure,databaseFailure,failureReceipt,localAIReport,diagnosticMigrations};
