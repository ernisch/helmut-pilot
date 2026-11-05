"use strict";
// Existing isolated diagnostic extended for Mock100. Never a production or W15 proof.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {execFileSync}=require("node:child_process");
const Fixture=require("./fixtures/resource500-diagnostic");
const SCHEMA="helmut-synthetic100-mock/1";
const PHASES=new Set(["configuration","prepare-database","services","dataset","provision","activate","understanding","work","readback","deactivate","closed"]);
const ASSERTIONS=new Set(["diagnostic-fresh-database-required","diagnostic-ca-required-before-node-start","diagnostic-stop-or-deadline","diagnostic-exact-active-cohort-required","diagnostic-initial-zero-required","diagnostic-provision-refused","diagnostic-positive-native-understanding-required","diagnostic-native-matches-required","diagnostic-native-decisions-required","diagnostic-positive-current-briefing-required","diagnostic-cleanup-only-newly-owned-profiles","diagnostic-local-preload-required"]);
ASSERTIONS.add("diagnostic-synthetic-profile-selector-required");
ASSERTIONS.add("diagnostic-required-schema-migration-missing");ASSERTIONS.add("diagnostic-schema-migration-list-unique");
for(const label of["diagnostic-native-vector-bootstrap-required","diagnostic-native-vector-version-required","diagnostic-native-postgres-version-required"])ASSERTIONS.add(label);
for(const label of["diagnostic-mock-schema-required","diagnostic-one-explicit-case","diagnostic-mock-case-binding","diagnostic-mock-current-understanding-schema"])ASSERTIONS.add(label);
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
for(const label of["diagnostic-mock-profile-binding","diagnostic-positive-native-lage-required","diagnostic-five-output-categories-required","diagnostic-three-native-slots-required","diagnostic-native-output-binding","diagnostic-native-source-binding","diagnostic-native-receipt-binding","diagnostic-complete-app-package-required","diagnostic-exact-model-phases-required"])ASSERTIONS.add(label);
const CODES=new Set(["ERR_ASSERTION","MODULE_NOT_FOUND","ERR_MODULE_NOT_FOUND","EACCES","EPERM","ENOENT","EEXIST","ECONNREFUSED","ETIMEDOUT","EPIPE","ENOTFOUND","ECONNRESET"]);
const AI_MESSAGES=new Map([["KI Kostenbeleg nicht bestaetigt","LLM_USAGE_NOT_CONFIRMED"],
  ["AI request timeout","AI_REQUEST_TIMEOUT"],["AI request send error","AI_REQUEST_SEND_ERROR"],
  ["AI response too large","AI_RESPONSE_TOO_LARGE"],["AI response aborted","AI_RESPONSE_ABORTED"],
  ["AI response stream error","AI_RESPONSE_STREAM_ERROR"],["KI-Antwort war kein gueltiges JSON","AI_RESPONSE_INVALID_JSON"],
  ["KI-Antwort wurde nicht vollstaendig abgeschlossen","AI_RESPONSE_NOT_COMPLETED"]]);
const AI_HTTP_STATUS=new Set([400,401,403,404,408,422,429,500,502,503,504]);
const AI_TLS_MESSAGES=new Set(["self-signed certificate","self-signed certificate in certificate chain",
  "unable to verify the first certificate","unable to get local issuer certificate","certificate has expired","certificate is not yet valid",
  "Client network socket disconnected before secure TLS connection was established"]);
const AI_BUILD_CODES=new Set(["ERR_INVALID_URL","ERR_INVALID_CHAR","ERR_HTTP_INVALID_HEADER_VALUE","ERR_INVALID_ARG_TYPE","ERR_INVALID_ARG_VALUE","ERR_OUT_OF_RANGE"]);
for(const code of [...AI_MESSAGES.values(),...Array.from(AI_HTTP_STATUS,status=>"AI_PROVIDER_HTTP_"+status),
  "AI_PROVIDER_HTTP_4XX","AI_PROVIDER_HTTP_5XX","AI_REQUEST_BUILD_FAILED","AI_TLS_ERROR"])CODES.add(code);
function understandingErrorCode(value){
  if(typeof value!=="string")return"UNKNOWN";if(AI_MESSAGES.has(value))return AI_MESSAGES.get(value);
  const http=/^(?:Azure|OpenAI) HTTP ([45][0-9]{2})$/.exec(value);
  if(http)return"AI_PROVIDER_HTTP_"+(AI_HTTP_STATUS.has(Number(http[1]))?http[1]:http[1][0]+"XX");
  const build=/^KI-Anfrage konnte nicht aufgebaut werden \(([A-Z_]+)\)$/.exec(value);
  if(build&&AI_BUILD_CODES.has(build[1]))return"AI_REQUEST_BUILD_FAILED";
  return AI_TLS_MESSAGES.has(value)?"AI_TLS_ERROR":"UNKNOWN";
}
const LAGE_REASONS=new Set(["ai-text-paragraph-count","ai-text-empty-or-type","ai-text-source-reference","ai-text-profile-reference","ai-text-auswahlbegruendung","ai-text-visible-id","ai-text-word-limit","ai-cost-receipt-missing","ai-response-incomplete","ai-response-invalid-json","ai-provider-unavailable",...Array.from(AI_HTTP_STATUS,n=>"ai-provider-http-"+n),"budget","store-error","no-vorgaenge","no-sources","no-ai","ai-error","existing-result",
  "no-current-sources","generating","ai-unavailable","ai-text-source-support","ai-text-quality-incomplete","ai-text-evidence-quote","ai-text-repetition","ai-empty","ai-invalid","lock-busy"]);
function lageErrorCode(reason){const code=LAGE_REASONS.has(reason)?"LAGE_"+reason.toUpperCase().replace(/-/g,"_"):"UNKNOWN";return code;}
for(const reason of LAGE_REASONS)CODES.add(lageErrorCode(reason));
const SQLSTATES=new Set(["42P01","42703","42883","42501","23505","23503","3D000","28P01","57014","22023","42601","XX000","08006"]);
function nativeStatus(value){return["saved", "skipped", "failed", "disabled", "unknown", "duplicate", "merged", "skipped-artikelkontext", "skipped-ausgang-unbekannt", "skipped-bestandslesefehler", "skipped-budget", "skipped-cluster-belegt", "skipped-error", "skipped-failed", "skipped-gate-geparkt", "skipped-invalid", "skipped-modellstart-unklar", "skipped-no-cluster", "skipped-no-vorgang", "skipped-production-admission", "skipped-store", "skipped-terminal", "skipped-update-final", "skipped-veraltet", "skipped-zeitbudget"].includes(value)?value:"unknown";}
const CODEPOINT_MODULES=new Set(["scripts/synthetik-500-resource-diagnostic.js","scripts/fixtures/resource500-diagnostic.js",
  "lib/helmut/lage.js","lib/helmut/ai.js","lib/helmut/storage.js","lib/helmut/briefing-speicher.js",
  "lib/helmut/morgenversorgung.js","lib/helmut/briefing-lauf.js","lib/helmut/understanding.js"]);
const CODEPOINT_SYMBOLS=new Set(["workload","verifyProfileRows","configuration","services","production","check","observed",
  "Object.workload","Object.configuration","Object.verifyProfileRows","Object.response","Object.storeResult","Object.audit","Object.generateLage","response","lageResponse","requestContext",
  "buildLageBriefing","generateLageBriefing","materialisiere","pruefeZeile","speicherePaket","schreibeQuittung"]);
function safeCodepoint(error){
  if(typeof error?.stack!=="string"||typeof error?.message!=="string"||error.stack.length>65536)return null;
  const header=String(error.name||"Error")+(error.name==="AssertionError"&&error.code==="ERR_ASSERTION"?" [ERR_ASSERTION]":"")+": "+error.message;
  if(!error.stack.startsWith(header+"\n"))return null;
  const root=path.resolve(__dirname,"..")+path.sep;
  for(const frame of error.stack.slice(header.length+1).split("\n").slice(0,30)){
    const match=/^    at (?:async )?([A-Za-z0-9_.]+) \(([^()]+):([0-9]{1,5}):[0-9]{1,5}\)$/.exec(frame);
    if(!match||!match[2].startsWith(root))continue;const module=match[2].slice(root.length).split(path.sep).join("/");
    if(CODEPOINT_MODULES.has(module)&&CODEPOINT_SYMBOLS.has(match[1])&&Number(match[3])>0)
      return{module,function:match[1],line:Number(match[3])};
  }return null;
}
function closedCodepoint(value){return value&&Object.keys(value).sort().join(",")==="function,line,module"&&CODEPOINT_MODULES.has(value.module)&&CODEPOINT_SYMBOLS.has(value.function)&&Number.isInteger(value.line)&&value.line>0&&value.line<=99999?{module:value.module,function:value.function,line:value.line}:null;}
function closedFailure(error,status="unknown"){
  const assertion=typeof error?.message==="string"?error.message.split("\n",1)[0]:null;
  return{assertion:ASSERTIONS.has(assertion)?assertion:"UNKNOWN",code:CODES.has(error?.code)?error.code:"UNKNOWN",
    sqlstate:SQLSTATES.has(error?.diagnosticSQLSTATE)?error.diagnosticSQLSTATE:"UNKNOWN",nativeStatus:nativeStatus(status),codepoint:safeCodepoint(error)};
}
function databaseFailure(error){
  const line=String(error.stderr||"").match(/(?:^|\n)(?:psql:[^\r\n]*: )?(?:ERROR|FATAL):\s+([0-9A-Z]{5})\s*(?:\n|$)/);
  error.diagnosticSQLSTATE=line&&SQLSTATES.has(line[1])?line[1]:"UNKNOWN";return error;
}
function failureReceipt(c,error,phase){const detail=error.safeResult?.firstFailureDetail;
  return{schema:SCHEMA,nonce:c.nonce,phase:PHASES.has(phase)?phase:"configuration",
    failureDetail:detail?{...closedFailure({message:detail.assertion,code:detail.code,diagnosticSQLSTATE:detail.sqlstate},detail.nativeStatus),codepoint:closedCodepoint(detail.codepoint)}:closedFailure(error),retryAllowed:false};}
function exact(v,keys){assert(v&&typeof v==="object"&&!Array.isArray(v));assert.deepEqual(Object.keys(v).sort(),keys.slice().sort());}
function directory(filename){
  assert(path.isAbsolute(filename)&&path.normalize(filename)===filename);
  for(let p=filename;;p=path.dirname(p)){const s=fs.lstatSync(p);assert(s.isDirectory()&&!s.isSymbolicLink());if(p===path.dirname(p))break;}
  const s=fs.lstatSync(filename);assert.equal(s.uid,process.getuid());assert.equal(s.mode&511,448);return filename;
}
function privateJSON(filename,maxBytes=65536){
  directory(path.dirname(filename));const fd=fs.openSync(filename,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try{const s=fs.fstatSync(fd);assert(s.isFile()&&s.uid===process.getuid()&&(s.mode&511)===384&&s.nlink===1&&s.size>0&&s.size<=maxBytes);
    const raw=fs.readFileSync(fd);assert.equal(raw.length,s.size);return JSON.parse(raw);}finally{fs.closeSync(fd);}
}
function write(root,name,value){
  directory(root);assert(/^[A-Z_]+\.(?:SAFE|PRIVATE)\.json$/.test(name));
  const fd=fs.openSync(path.join(root,name),"wx",0o600);
  try{fs.writeFileSync(fd,JSON.stringify(value)+"\n");fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
const PROGRESS_OPERATIONS=new Set(["idle","profile-provision","profile-activation","active-cohort-readback","source-save","understand","match","decide","lage-generate","briefing-build","briefing-store","full-readback","profile-deactivation","closed"]);
function appProgress(c){
  directory(c.resultRoot);assert([2,3,100].includes(c.count)&&/^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/.test(c.nonce));let frozen=false,identity=null;
  const value={schema:SCHEMA,nonce:c.nonce,requestedProfiles:c.count,sequence:0,phase:"dataset",operation:"idle",
    provisionedProfiles:0,activatedProfiles:0,activeCohortReadbacks:0,sourceDocumentsSaved:0,understoodCases:0,
    matchingProfiles:0,decisionProfiles:0,positiveProfileResults:0,deactivatedProfiles:0,finalActiveProfiles:"UNKNOWN"};
  const counters=new Set(Object.keys(value).filter(key=>typeof value[key]==="number"&&!['requestedProfiles','sequence'].includes(key)));
  const target=path.join(c.resultRoot,"APP_PROGRESS.SAFE.json");
  function persist(){
    directory(c.resultRoot);assert(value.sequence<10000);
    try{const s=fs.lstatSync(target);assert(identity&&s.isFile()&&!s.isSymbolicLink()&&s.uid===process.getuid()&&(s.mode&511)===384&&s.nlink===1&&s.size<=8192&&s.dev===identity.dev&&s.ino===identity.ino);}
    catch(error){if(error.code!=="ENOENT"||identity)throw error;}
    const next={...value,sequence:value.sequence+1},raw=Buffer.from(JSON.stringify(next)+"\n");assert(raw.length<=8192);
    const temp=path.join(c.resultRoot,".APP_PROGRESS_"+crypto.randomBytes(12).toString("hex")+".tmp");let fd=null,owned=false;
    try{fd=fs.openSync(temp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);owned=true;
      fs.writeFileSync(fd,raw);fs.fsyncSync(fd);const s=fs.fstatSync(fd);assert(s.isFile()&&s.uid===process.getuid()&&(s.mode&511)===384&&s.nlink===1&&s.size===raw.length);fs.closeSync(fd);fd=null;
      fs.renameSync(temp,target);owned=false;identity={dev:s.dev,ino:s.ino};value.sequence=next.sequence;
      const dir=fs.openSync(c.resultRoot,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
      try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
    }finally{if(fd!==null)fs.closeSync(fd);if(owned)try{fs.unlinkSync(temp);}catch(_){}}
  }
  return{before(phase,operation){if(frozen)return;assert(PHASES.has(phase)&&PROGRESS_OPERATIONS.has(operation));value.phase=phase;value.operation=operation;persist();},
    confirmed(key){if(frozen)return;const limit=key==="activeCohortReadbacks"?10000:key==="sourceDocumentsSaved"?(c.count===100?384:c.count*4):key==="understoodCases"?(c.count===100?96:c.count):c.count;assert(counters.has(key)&&value[key]<limit);value[key]++;},
    zero(){if(!frozen){assert(value.phase==="deactivate"&&value.operation==="active-cohort-readback");value.finalActiveProfiles=0;}},
    freeze(){if(frozen)return;try{persist();}catch(_){}finally{frozen=true;}}};
}
function configuration(value){
  exact(value,["schema","mode","count","nonce","database","postgrestURL","serviceToken","resultRoot","maxWallSeconds","datasetEpochUTC"]);
  assert.equal(value.schema,SCHEMA);assert(["mock100","preflight"].includes(value.mode));
  assert(value.mode==="mock100"?value.count===100:[2,3].includes(value.count));
  assert(/^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/.test(value.nonce));
  exact(value.database,["host","port","name","user","password"]);
  assert.equal(value.database.host,"127.0.0.1");assert([[5432,"postgres"],[5433,"helmut"]].some(([port,user])=>value.database.port===port&&value.database.user===user));
  assert.equal(value.database.name,(value.mode==="mock100"?"helmut_mock100_":"helmut_mock100_preflight_")+value.nonce.replace(/-/g,""));
  assert(typeof value.database.password==="string"&&value.database.password.length<=256);
  loopback(value.postgrestURL,"http:");
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
  try{return execFileSync("psql",["-X","-w","-qAt","-v","ON_ERROR_STOP=1","-v","VERBOSITY=sqlstate","-h","127.0.0.1","-p",String(c.database.port),"-U",c.database.user,"-d",c.database.name,"-f","-"],
    {input:sql,encoding:"utf8",timeout:30000,maxBuffer:32*1024*1024,stdio:["pipe","pipe","pipe"],
      env:{PATH:process.env.PATH,LANG:"C.UTF-8",PGPASSWORD:c.database.password,PGCONNECT_TIMEOUT:"5",PGOPTIONS:"-c statement_timeout=25000 -c lock_timeout=3000"}}).trim();
  }catch(error){throw databaseFailure(error);}
}
function nativeSchemaBootstrap(root,Z){
  assert(typeof Z?.baueLokalesSchema==="function"&&typeof Z.VORBEREITUNG_NATIVE_SQL==="string"&&Z.VORBEREITUNG_NATIVE_SQL.length>0
    &&typeof Z.NACHBEREITUNG_SQL==="string"&&!/match_knowledge_objects|where\s+false/i.test(Z.VORBEREITUNG_NATIVE_SQL),"diagnostic-native-vector-bootstrap-required");
  return{files:Z.baueLokalesSchema(root,{nativeVector:true}),prefix:Z.VORBEREITUNG_NATIVE_SQL,suffix:Z.NACHBEREITUNG_SQL};
}
async function prepareDatabase(c,bootstrap=null){
  assert.equal(psql(c,"select current_database();"),c.database.name);
  assert.equal(psql(c,"select current_setting('server_version_num');"),"170006","diagnostic-native-postgres-version-required");
  assert.equal(psql(c,"select count(*) from pg_tables where schemaname='public';"),"0","diagnostic-fresh-database-required");
  const Z=bootstrap||require("./skalierung-z3-realistiklauf");
  const root=path.join(c.resultRoot,"schema");fs.mkdirSync(root,{mode:0o700});const native=nativeSchemaBootstrap(root,Z),files=native.files;
  psql(c,native.prefix);psql(c,fs.readFileSync(files.schemaDatei,"utf8"));
  assert.equal(psql(c,"select extversion from pg_extension where extname='vector';"),"0.8.7","diagnostic-native-vector-version-required");
  for(const file of diagnosticMigrations(files.migrationen))psql(c,fs.readFileSync(file,"utf8"));
  psql(c,native.suffix);
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
function simulatedCallLimit(c){const data=Fixture.cases(c.datasetEpochUTC);return(c.mode==="preflight"?Fixture.selectedCases(data,Fixture.selectedSpecs(c.count)).length:data.length)+2*c.count;}
function mockResponseFactory(c,data){let first=false;const phases=[];return(request,schema)=>{
  try{const value=Fixture.response(request,schema,c.datasetEpochUTC,data),phase=Fixture.requestPhase(schema);
    let ownerHash=null,profileContextSHA256=null;if(phase!=="understanding"){
      const context=Fixture.requestContext(request,schema),owners=Fixture.selectedSpecs(c.count).filter(p=>p.constituency===context.wahlkreis);
      assert.equal(owners.length,1,"diagnostic-mock-profile-binding");ownerHash=Fixture.sha(owners[0].id);profileContextSHA256=require("../lib/helmut/briefing-speicher").hash(context);
      assert(!phases.some(p=>p.ownerHash===ownerHash&&p.phase===phase),"diagnostic-exact-model-phases-required");}
    assert(phases.length<simulatedCallLimit(c),"diagnostic-exact-model-phases-required");
    phases.push({phase,ownerHash,profileContextSHA256,requestSHA256:Fixture.sha(request)});
    const target=path.join(c.resultRoot,"MODEL_PHASES.SAFE.json"),temp=target+".tmp";
    const fd=fs.openSync(temp,"wx",0o600);try{fs.writeFileSync(fd,JSON.stringify({schema:SCHEMA,nonce:c.nonce,phases})+"\n");fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    fs.renameSync(temp,target);return value;}
  catch(error){if(!first){first=true;try{write(c.resultRoot,"MOCK_RESPONSE_FAILURE.SAFE.json",{schema:SCHEMA,nonce:c.nonce,phase:"services",failureDetail:closedFailure(error),retryAllowed:false});}catch(_){}}
    throw error;}
};}
async function services(c){
  const Z=require("./fixtures/z3-plattform"),data=Fixture.cases(c.datasetEpochUTC);
  const started=[];let first=null;
  try{
    started.push(await Z.starteDatenbankTor({postgrestPort:Number(new URL(c.postgrestURL).port)}));
    started.push(await Z.starteAnbieterUrsprung({latenzMs:0,ausfallAnteil:0,drosselAnteil:0}));
    started.push(await Z.starteKiEndpunkt({verzeichnis:path.join(c.resultRoot,"tls"),latenzMs:5,latenzStreuungMs:0,fehlerAnteil:0,
      hoechstzahlAufrufe:simulatedCallLimit(c),responseForRequest:mockResponseFactory(c,data)}));
    const [database,rss,ki]=started;
    write(c.resultRoot,"SERVICE_BINDINGS.PRIVATE.json",{schema:SCHEMA,nonce:c.nonce,databaseURL:database.url,rssURL:rss.url,kiURL:ki.url,caPath:ki.caPfad});
    write(c.resultRoot,"SERVICES_READY.SAFE.json",{schema:SCHEMA,nonce:c.nonce,ready:true,pid:process.pid,
      databasePort:new URL(database.url).port*1,rssPort:rss.port,kiPort:ki.port});
    await new Promise(resolve=>{process.once("SIGTERM",resolve);process.once("SIGINT",resolve);});
  }catch(error){first=error;}
  finally{
    const outcomes=await Promise.allSettled(started.map(s=>Promise.resolve().then(()=>s.stoppe())));
    if(!first&&outcomes.some(r=>r.status==="rejected"))first=outcomes.find(r=>r.status==="rejected").reason;
    try{write(c.resultRoot,"SERVICES_CLOSED.SAFE.json",{schema:SCHEMA,nonce:c.nonce,
      closed:outcomes.every(r=>r.status==="fulfilled"),failed:first!==null,localSimulatedAI:localAIReport(started[2]),executionAuthority:false});}catch(error){if(!first)first=error;}
  }
  if(first)throw first;
}
function environment(c,b){
  Object.assign(process.env,{HELMUT_SOURCE_MODE:"off",HELMUT_STORAGE_BACKEND:"supabase",HELMUT_SUPABASE_AUTH_STORE_ID:"main-auth",
    HELMUT_V3_STORE:"1",HELMUT_PROFILE_DB_MODE:"1",HELMUT_PROFILE_DB_EXCLUSIVE:"1",HELMUT_V3_MATCHING:"1",
    HELMUT_KI_LOOPBACK_ERLAUBT:"1",SUPABASE_URL:b.databaseURL,SUPABASE_SERVICE_ROLE_KEY:c.serviceToken,
    // This isolated loopback only: one Understanding call per case and two per profile.
    HELMUT_MAX_LLM_CALLS_PER_DAY:String(simulatedCallLimit(c)),
    AZURE_OPENAI_ENDPOINT:b.kiURL,AZURE_OPENAI_KEY:"LOCAL_SYNTHETIC_DIAGNOSTIC_NOT_A_PROVIDER_CREDENTIAL"});
  assert.equal(process.env.NODE_EXTRA_CA_CERTS,b.caPath,"diagnostic-ca-required-before-node-start");
}
const sqlString=value=>"'"+String(value).replace(/'/g,"''")+"'";
function native(c){
  return {rows:(id=null)=>JSON.parse(psql(c,"select coalesce(json_agg(t order by t.user_id,t.slot),'[]') from (select id,user_id,slot,generated_at,payload from public.briefings"+(id===null?"":" where user_id="+sqlString(id))+")t;")),
    usage:()=>JSON.parse(psql(c,"select coalesce(data->'llmUsage','[]'::jsonb) from public.helmut_store where id='main-auth';")),
    activeIDs:()=>JSON.parse(psql(c,"select coalesce(json_agg(user_id order by user_id),'[]')from public.mandate_profiles where aktiv;")),
    count:table=>{assert(["knowledge_objects","raw_documents","ko_document_links","matching_results","briefings"].includes(table));return Number(psql(c,"select count(*)from public."+table+";"));}};
}
function closedOutputErrors(value){const keys=["duplicate","empty","missing","technicallyInvalid","unusable"];
  return value&&Object.keys(value).sort().join(",")===keys.join(",")&&keys.every(k=>Number.isSafeInteger(value[k])&&value[k]>=0&&value[k]<=300)
    ?Object.fromEntries(keys.map(k=>[k,value[k]])):null;
}
function assessProfileRows(profile,rows,{day,startedAt,expectedSources}){
  const B=require("../lib/helmut/briefing-speicher"),Q=require("../lib/helmut/lage-quellenbeleg"),L=require("../lib/helmut/briefing-lauf"),A=require("../lib/helmut/briefing-ausgabebeleg");
  const errors={missing:0,empty:0,duplicate:0,technicallyInvalid:0,unusable:0},slots=["lage","mandatsbriefing","morgenlage"];
  if(!Array.isArray(rows))return{...errors,missing:3};
  const sources=new Map((expectedSources||[]).map(d=>[d.url,d]));
  const packet=rows.find(r=>r?.slot==="mandatsbriefing"),lage=rows.find(r=>r?.slot==="lage");
  for(const slot of slots){const count=rows.filter(r=>r?.slot===slot).length;errors.missing+=count===0?1:0;errors.duplicate+=Math.max(0,count-1);}
  for(const row of rows){
    if(!row||!slots.includes(row.slot)||row.user_id!==profile.id||row.id!==`bf-${profile.id}-${row.slot}-${day}`
      ||!(Date.parse(row.generated_at)>=Date.parse(startedAt)&&Date.parse(row.generated_at)<=Date.now())){errors.technicallyInvalid++;continue;}
    if(!row.payload||typeof row.payload!=="object"||Array.isArray(row.payload)||!Object.keys(row.payload).length){errors.empty++;continue;}
    try{
      if(row.slot==="mandatsbriefing"){
        B.pruefeZeile(row,{userId:profile.id,day,profile});
        if(lage)assert.deepEqual(row.payload.lage,lage.payload);
        if(!row.payload.briefing?.items?.length){errors.empty++;continue;}
        if(!B.pruefeInhalt(row.payload.briefing,row.payload.lage).strukturellVollstaendig||!row.payload.pruefung?.strukturellVollstaendig)errors.unusable++;
      }else if(row.slot==="lage"){
        if(!row.payload.paragraphs?.length||row.payload.paragraphs.some(p=>!String(p.text||"").trim())){errors.empty++;continue;}
        if(!Q.gespeicherterTextGueltig(row.payload)){errors.unusable++;continue;}
        assert(row.payload.quellen?.length>0);
        for(const group of row.payload.quellen){assert(group.quellenbelege?.length>0);
          for(const q of group.quellenbelege){const doc=sources.get(q.url);
            assert(doc&&doc.title===q.titel&&q.quelle_id===Q.quelleIdFuer(group.vorgang_id,doc.url)
              &&Date.parse(q.veroeffentlichtAm)===Date.parse(doc.published_at)&&typeof q.auszug==="string"&&q.auszug.trim().length>0
              &&doc.summary.replace(/\s+/g," ").trim().includes(q.auszug.replace(/\s+/g," ").trim()));}}
      }else{
        const receipt=L.ausZeile(row,{tenantId:profile.id,tagKey:day});
        assert(receipt&&receipt.status===L.STATUS_ERFOLG&&receipt.tenantId===profile.id&&receipt.berlinTag===day
          &&packet&&receipt.signatur===L.inhaltsSignatur(packet.payload?.briefing)&&A.passt(receipt.ausgabeBeleg,packet));
      }
    }catch(_){errors.technicallyInvalid++;}
  }return errors;
}
function verifyProfileRows(profile,rows,{day,startedAt,expectedSources}){
  const B=require("../lib/helmut/briefing-speicher"),Q=require("../lib/helmut/lage-quellenbeleg"),L=require("../lib/helmut/briefing-lauf"),A=require("../lib/helmut/briefing-ausgabebeleg"),S=require("../lib/helmut/storage");
  const outputErrors=assessProfileRows(profile,rows,{day,startedAt,expectedSources});
  try{assert(Object.values(outputErrors).every(n=>n===0),"diagnostic-five-output-categories-required");}
  catch(error){error.diagnosticOutputErrors=outputErrors;throw error;}
  assert(Array.isArray(rows)&&rows.length===3,"diagnostic-three-native-slots-required");
  assert.deepEqual(rows.map(r=>r.slot).sort(),["lage","mandatsbriefing","morgenlage"],"diagnostic-three-native-slots-required");
  for(const row of rows){assert(row.user_id===profile.id&&row.id===`bf-${profile.id}-${row.slot}-${day}`
    &&Date.parse(row.generated_at)>=Date.parse(startedAt)&&Date.parse(row.generated_at)<=Date.now(),"diagnostic-native-output-binding");}
  S.assertTenantRows(rows,"mock100NativeReadback",profile.id);
  const packet=rows.find(r=>r.slot==="mandatsbriefing"),lage=rows.find(r=>r.slot==="lage"),morning=rows.find(r=>r.slot==="morgenlage");
  B.pruefeZeile(packet,{userId:profile.id,day,profile});
  assert.deepEqual(packet.payload.lage,lage.payload,"diagnostic-native-output-binding");
  assert(B.pruefeInhalt(packet.payload.briefing,lage.payload).strukturellVollstaendig
    &&packet.payload.pruefung.strukturellVollstaendig&&Q.gespeicherterTextGueltig(lage.payload),"diagnostic-complete-app-package-required");
  const sources=new Map(expectedSources.map(d=>[d.url,d]));
  for(const group of lage.payload.quellen||[])for(const q of group.quellenbelege||[]){
    const doc=sources.get(q.url);assert(doc&&doc.title===q.titel&&typeof q.auszug==="string"
      &&doc.summary.replace(/\s+/g," ").includes(q.auszug.replace(/\s+/g," ")),"diagnostic-native-source-binding");}
  const receipt=L.ausZeile(morning,{tenantId:profile.id,tagKey:day});
  assert(receipt&&receipt.status===L.STATUS_ERFOLG&&receipt.tenantId===profile.id&&receipt.berlinTag===day
    &&receipt.signatur===L.inhaltsSignatur(packet.payload.briefing)&&A.passt(receipt.ausgabeBeleg,packet),"diagnostic-native-receipt-binding");
  // Exercise the existing application guards without ever writing a foreign row.
  const foreign="synthetic-foreign-tenant";
  assert.throws(()=>S.assertTenantRows([{...lage,user_id:foreign}],"mock100NegativeGuard",profile.id));
  assert.throws(()=>B.pruefeZeile({...packet,user_id:foreign},{userId:profile.id,day,profile}));
  assert.equal(A.passt({...receipt.ausgabeBeleg,mandat:foreign},packet),false);
  const tampered=structuredClone(lage.payload);tampered.paragraphs[0].quellen_ids=["q-"+"0".repeat(20)];
  assert.equal(Q.gespeicherterTextGueltig(tampered),false);
  return{verified:true,positions:3,rowsSHA256:B.hash(rows),tenantChecks:4,outputErrors};
}
function production(c){
  const S=require("../lib/helmut/storage"),P=require("../lib/helmut/provisioning"),U=require("../lib/helmut/understanding"),N=native(c);
  const day=require("../lib/helmut/briefing-frische").berlinTagKey(new Date()),startedAt=new Date().toISOString();
  const expectedSources=Fixture.cases(c.datasetEpochUTC).flatMap(x=>x.documents),accepted=new Map();
  function phases(profile){const entries=privateJSON(path.join(c.resultRoot,"MODEL_PHASES.SAFE.json"),262144);
    assert.equal(entries.nonce,c.nonce);const own=entries.phases.filter(p=>p.ownerHash===Fixture.sha(profile.id));
    assert.deepEqual(own.map(p=>p.phase),["entwurf","pruefung"],"diagnostic-exact-model-phases-required");
    assert(own.every(p=>p.profileContextSHA256===require("../lib/helmut/briefing-speicher").profilHash(profile)),"diagnostic-mock-profile-binding");
    const used=N.usage().filter(r=>r.politicianId===profile.id||r.profileId===profile.id);
    assert.equal(used.length,2,"diagnostic-exact-model-phases-required");
    assert(used.every(r=>r.callType==="lageBriefing"&&r.success===true&&!r.keinAufruf),"diagnostic-exact-model-phases-required");
    return{draftPhases:1,reviewPhases:1};}
  return {profile:id=>S.getProfile(id),provision:spec=>P.provisionTenant(spec,{}, {neuAktiv:false,kontoBeiFehlerBehalten:true}),
    participate:(id,active)=>active?P.activateTenant(id):P.deactivateTenant(id),saveSource:d=>S.saveRawDocument(d),
    understand:cluster=>U.understandOneCluster(cluster,U.defaultDeps({runId:"mock100-"+c.nonce})),
    match:profile=>require("../lib/helmut/matching").runMatchingShadow({profile}),
    decide:profile=>require("../lib/helmut/decisions").runDecisionShadow({profile}),
    generateLage:(profile,check)=>require("../lib/helmut/lage").buildLageBriefing(profile,{missingOnly:true,beforeGenerate:check,beforeSave:check}),
    build:profile=>require("../server").__buildV3Briefing(profile,profile.id),
    storeResult:async(profile,briefing)=>{
      const V=require("../lib/helmut/morgenversorgung"),L=require("../lib/helmut/briefing-lauf"),now=new Date();
      assert.equal(require("../lib/helmut/briefing-frische").berlinTagKey(now),day,"diagnostic-native-output-binding");
      const packet=await V.speicherePaket({profile,userId:profile.id,briefing,storage:S,tag:day,now});
      assert(packet.beleg.gespeichert&&packet.beleg.verifiziert&&packet.beleg.vollstaendig,"diagnostic-complete-app-package-required");
      const q=L.quittung({tenantId:profile.id,berlinTag:day,status:L.STATUS_ERFOLG,ausloeser:L.AUSLOESER_NACHLAUF,
        erzeugtAm:now,fensterStart:startedAt,signatur:L.inhaltsSignatur(packet.briefing),ausgabeBeleg:packet.ausgabeBeleg});
      const saved=await L.schreibeQuittung(S,q);assert(saved.gespeichert&&saved.verifiziert,"diagnostic-native-receipt-binding");
      const receipt={...verifyProfileRows(profile,N.rows(profile.id),{day,startedAt,expectedSources}),...phases(profile)};
      accepted.set(profile.id,receipt.rowsSHA256);return receipt;},
    audit:async profiles=>{
      const rows=N.rows(),outputErrors=profiles.reduce((total,p)=>{const e=assessProfileRows(p,rows.filter(r=>r.user_id===p.id),{day,startedAt,expectedSources});
        for(const k of Object.keys(e))total[k]+=e[k];return total;},{missing:0,empty:0,duplicate:0,technicallyInvalid:rows.filter(r=>!profiles.some(p=>p.id===r.user_id)).length,unusable:0});
      try{assert(rows.length===profiles.length*3&&Object.values(outputErrors).every(n=>n===0),"diagnostic-five-output-categories-required");}
      catch(error){error.diagnosticOutputErrors=outputErrors;throw error;}
      for(const profile of profiles){const receipt=verifyProfileRows(profile,rows.filter(r=>r.user_id===profile.id),{day,startedAt,expectedSources});
        assert.equal(receipt.rowsSHA256,accepted.get(profile.id),"diagnostic-native-output-binding");phases(profile);}
      const ledger=privateJSON(path.join(c.resultRoot,"MODEL_PHASES.SAFE.json"),262144),usage=N.usage();
      const understanding=ledger.phases.filter(p=>p.phase==="understanding").length;
      assert.equal(ledger.phases.length,understanding+2*profiles.length,"diagnostic-exact-model-phases-required");
      assert.equal(usage.length,ledger.phases.length,"diagnostic-exact-model-phases-required");
      assert(usage.every(r=>r.success===true&&!r.keinAufruf),"diagnostic-exact-model-phases-required");
      return{rowsSHA256:require("../lib/helmut/briefing-speicher").hash(rows),understanding,draftPhases:profiles.length,reviewPhases:profiles.length,
        outputErrors};},
    snapshot:()=>{const ledger=privateJSON(path.join(c.resultRoot,"MODEL_PHASES.SAFE.json"),262144);return{positions:N.rows().length,usage:N.usage().length,
      ...Object.fromEntries(["understanding","entwurf","pruefung"].map(phase=>[phase,ledger.phases.filter(p=>p.phase===phase).length]))};},...N};
}
async function workload(c,b,deps=null){
  let phase="dataset",failure=null,firstFailureDetail=null,cleanupFailureDetail=null,status="unknown",zero="UNKNOWN",activeObservations=0,positive=0,understood=0,provisioned=0;
  let stop=false,progress=null;const deadline=Date.now()+c.maxWallSeconds*1000;
  const onStop=()=>{stop=true;progress?.freeze();};process.once("SIGTERM",onStop);process.once("SIGINT",onStop);
  const check=()=>assert(!stop&&Date.now()<deadline,"diagnostic-stop-or-deadline");
  const all=Fixture.selectedSpecs(c.count),ids=all.map(p=>p.id).sort(),created=new Set(),profiles=[];
  const allCases=Fixture.cases(c.datasetEpochUTC),data=c.mode==="preflight"?Fixture.selectedCases(allCases,all):allCases;
  const acknowledgements=[];let nativeAudit=null,nativeObserved=null,firstOutputErrors=null;
  const remember=(error,where=phase)=>{if(!failure){failure=PHASES.has(where)?where:"configuration";firstFailureDetail=closedFailure(error,where==="understanding"?status:"unknown");firstOutputErrors=closedOutputErrors(error?.diagnosticOutputErrors);}progress?.freeze();};
  const observed=async(operation,run)=>{check();progress.before(phase,operation);const result=await run();check();return result;};
  const assertActive=async()=>{assert.deepEqual(await observed("active-cohort-readback",()=>deps.activeIDs()),ids,"diagnostic-exact-active-cohort-required");activeObservations++;progress.confirmed("activeCohortReadbacks");};
  try{
    write(c.resultRoot,"APP_ATTEMPT.PRIVATE.json",{schema:SCHEMA,nonce:c.nonce,count:c.count});
    progress=appProgress(c);progress.before(phase,"idle");
    write(c.resultRoot,"DATASET.SAFE.json",{...Fixture.manifest(c.datasetEpochUTC,c.count),executedCaseCount:data.length,executedSourceCount:data.length*4,executedProfileCount:c.count});
    if(!deps){environment(c,b);deps=production(c);}
    assert.deepEqual(await observed("active-cohort-readback",()=>deps.activeIDs()),[],"diagnostic-initial-zero-required");
    phase="provision";
    for(const spec of all){assert.equal(await observed("profile-provision",()=>deps.profile(spec.id)),null);
      const made=await observed("profile-provision",()=>deps.provision({...spec,password:crypto.randomBytes(24).toString("hex")}));assert.equal(made.ok,true,"diagnostic-provision-refused");provisioned++;
      const actual=await observed("profile-provision",()=>deps.profile(spec.id));assert(actual&&actual.profileActive===false&&actual.provisionedBy==="helmut-provisioning");created.add(spec.id);progress.confirmed("provisionedProfiles");}
    phase="activate";
    for(const id of ids){assert.equal((await observed("profile-activation",()=>deps.participate(id,true))).ok,true);progress.confirmed("activatedProfiles");}
    await assertActive();phase="understanding";
    for(const item of data){status="unknown";await assertActive();
      for(const doc of item.documents){assert.equal((await observed("source-save",()=>deps.saveSource(doc))).saved,true);progress.confirmed("sourceDocumentsSaved");}
      const result=await observed("understand",()=>deps.understand({documents:item.documents}));status=nativeStatus(result?.status);
      try{assert.equal(result?.status,"saved","diagnostic-positive-native-understanding-required");}
      catch(error){if(typeof result?.errorCode==="string")error.code=understandingErrorCode(result.errorCode);throw error;}understood++;progress.confirmed("understoodCases");
    }
    phase="work";
    for(const id of ids){await assertActive();const profile=await observed("match",()=>deps.profile(id));assert(profile&&profile.profileActive===true&&profile.id===id);profiles.push(profile);
      const matching=await observed("match",()=>deps.match(profile));assert(!matching.skipped&&matching.saved>0,"diagnostic-native-matches-required");progress.confirmed("matchingProfiles");
      const decisions=await observed("decide",()=>deps.decide(profile));assert(!decisions.skipped&&decisions.saved>0,"diagnostic-native-decisions-required");progress.confirmed("decisionProfiles");
      const generated=await observed("lage-generate",()=>deps.generateLage(profile,check));
      if(generated?.available!==true){const error=Error("diagnostic-positive-native-lage-required");error.code=lageErrorCode(generated?.reason);throw error;}
      const result=await observed("briefing-build",()=>deps.build(profile));assert(result&&result.available===true&&Array.isArray(result.items)&&result.items.length>0,"diagnostic-positive-current-briefing-required");
      const receipt=await observed("briefing-store",()=>deps.storeResult(profile,result));
      assert(receipt?.verified===true&&receipt.positions===3&&receipt.draftPhases===1&&receipt.reviewPhases===1
        &&receipt.tenantChecks===4&&/^[a-f0-9]{64}$/.test(receipt.rowsSHA256),"diagnostic-three-native-slots-required");
      await assertActive();
      acknowledgements.push({profileSHA256:Fixture.sha(id),rowsSHA256:receipt.rowsSHA256});positive++;progress.confirmed("positiveProfileResults");
    }
    phase="readback";await assertActive();
    if(deps.audit){nativeAudit=await observed("full-readback",()=>deps.audit(profiles));assert.equal(nativeAudit.understanding,understood,"diagnostic-exact-model-phases-required");}
    assert.equal(positive,c.count);assert.equal(await observed("full-readback",()=>deps.count("knowledge_objects")),data.length);
    assert.equal(await observed("full-readback",()=>deps.count("raw_documents")),data.length*4);assert.equal(await observed("full-readback",()=>deps.count("ko_document_links")),data.length*4);
    assert.equal(await observed("full-readback",()=>deps.count("briefings")),c.count*3);assert(await observed("full-readback",()=>deps.count("matching_results"))>=c.count);
  }catch(error){remember(error);}
  finally{
    phase="deactivate";
    const cleanupError=error=>{if(!cleanupFailureDetail)cleanupFailureDetail=closedFailure(error);remember(error,"deactivate");};
    const cleanupObserved=async(operation,run)=>{try{progress?.before(phase,operation);}catch(error){cleanupError(error);}return await run();};
    // Ownership was confirmed while inactive. Even an unreadable cohort must not
    // prevent independently attempting deactivation of every proven-owned ID.
    try{const active=await cleanupObserved("active-cohort-readback",()=>deps.activeIDs());
      assert(active.every(id=>created.has(id)),"diagnostic-cleanup-only-newly-owned-profiles");}catch(error){cleanupError(error);}
    for(const id of created){try{assert.equal((await cleanupObserved("profile-deactivation",()=>deps.participate(id,false))).ok,true);progress?.confirmed("deactivatedProfiles");}catch(error){cleanupError(error);}}
    try{const after=await cleanupObserved("active-cohort-readback",()=>deps.activeIDs());assert.deepEqual(after,[]);zero=0;progress?.zero();}catch(error){cleanupError(error);}
    if(deps?.snapshot)try{nativeObserved=await deps.snapshot();}catch(error){cleanupError(error);}
    if(!failure)try{progress?.before("closed","closed");}catch(error){cleanupError(error);}
    process.removeListener("SIGTERM",onStop);process.removeListener("SIGINT",onStop);
  }
  const result={schema:SCHEMA,nonce:c.nonce,status:failure?"FAIL_OR_UNKNOWN_DIAGNOSTIC":c.mode==="mock100"?"PASS_MOCK100_RUNTIME":"PASS_MOCK100_PREFLIGHT",
    firstFailurePhase:failure,firstFailureDetail,cleanupFailureDetail,requestedProfiles:c.count,provisionedProfiles:provisioned,positiveProfileResults:positive,
    activeCohortReadbacks:activeObservations,understoodCases:understood,finalActiveProfiles:zero,
    confirmedCountsOnly:true,nativeObserved,outputErrors:closedOutputErrors(nativeAudit?.outputErrors)||firstOutputErrors,
    outputPositions:positive*3,outputKinds:{mandatsbriefing:positive,lage:positive,morgenlageReceipt:positive},
    modelPhases:{understanding:understood,entwurf:positive,pruefung:positive},nativeAuditSHA256:nativeAudit?.rowsSHA256||null,
    acknowledgedResultsSHA256:Fixture.sha(acknowledgements),tenantGuardChecks:positive*4,
    simulatedProviderOnly:true,originalDataUsed:false,formal1500Acceptance:false,end500Acceptance:false,mock500Acceptance:false,
    productionProof:false,professionalAcceptance:false,executionAuthority:false,retryAllowed:false};
  const failed=()=>Object.assign(Error("RESOURCE_DIAGNOSTIC_FAILED"),{safeResult:result});
  try{write(c.resultRoot,"APP_RESULT.SAFE.json",result);}catch(error){if(failure)throw failed();
    result.status="FAIL_OR_UNKNOWN_DIAGNOSTIC";result.firstFailurePhase="closed";result.firstFailureDetail=closedFailure(error);throw failed();}
  if(failure)throw failed();return result;
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
module.exports={assessProfileRows,verifyProfileRows,SCHEMA,args,configuration,bindings,privateJSON,write,workload,prepareDatabase,services,main,closedFailure,databaseFailure,failureReceipt,localAIReport,diagnosticMigrations,understandingErrorCode,mockResponseFactory,nativeSchemaBootstrap,appProgress};
