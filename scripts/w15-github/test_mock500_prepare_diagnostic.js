"use strict";
// Invented bound owner/inputs and actual reader bodies; no key, DB, Original or network.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const vm=require("node:vm"),{createRequire}=require("node:module");
const {mock}=require("node:test");
// Keep invented fixtures inside the existing simulation calendar, regardless of CI wall time.
const fixtureTime=Date.parse("2026-11-04T12:00:00.000Z");
mock.timers.enable({apis:["Date"],now:fixtureTime});
const Prepare=require("./mock500_prepare_contract"),B=require("./mock500_bindings");
const Calendar=require("../../lib/helmut/synthetik-500-mock-calendar"),EU=require("../../lib/helmut/synthetik-500-eu-service-contract");
const Failure=require("./mock500_prepare_failure");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"w15-prepare-synthetic-"));fs.chmodSync(root,0o700);
const now=new Date(),day=now.toISOString().slice(0,10),berlin=require("../../lib/helmut/briefing-frische").berlinTagKey;
const start=now.getTime()-1000,window={startsAtUTC:new Date(start).toISOString(),endsAtUTC:new Date(start+10800000-1).toISOString(),
 completionDeadlineUTC:new Date(start+12600000-1).toISOString()};
const source={schema:"helmut-w15-isolated-mock-source-authorization/1",contract:"helmut-w15-mock-historical-qualified-source-replay/1",
 branch:"refs/heads/codex/w15-github-end500-preparation-20261028",exactCommit:"a".repeat(40),runId:"123456789",runAttempt:1,
 nonce:"12345678-1234-4123-8123-123456789abc",approvalSHA256:"b".repeat(64),sourceQualificationSHA256:"c".repeat(64),
 productionAllowed:false,paidModelsAllowed:false};
const stem="w15-mock500-"+source.runId+"-"+source.nonce.replaceAll("-","");
const runRoot=path.join(root,stem),work=path.join(runRoot,"work"),state=path.join(root,"state");
fs.mkdirSync(work,{recursive:true,mode:0o700});fs.mkdirSync(state,{mode:0o700});
const context={schema:"helmut-w15-mock500-controller-context/1",scope:"ISOLATED_GITHUB_MOCK500_BINDING_ONLY",
 ...Object.fromEntries(["runId","runAttempt","nonce","exactCommit"].map(k=>[k,source[k]])),runnerTemp:root,
 hostPaths:{runRoot,work,prepare:runRoot+"/prepare",cache:runRoot+"/cache"}};
const safety=require("./separated_resources_contract.json").referenceLabProposal;
const authorization={schema:Prepare.AUTH_SCHEMA,contract:Prepare.CONTRACT,scope:Prepare.SCOPE,
 ...Object.fromEntries(["runId","runAttempt","nonce","exactCommit","sourceQualificationSHA256","approvalSHA256"].map(k=>[k,source[k]])),
 inputBindingSHA256:"d".repeat(64),diagnosticOfRunId:"41818696152"};
const bound={schema:"helmut-w15-mock500-private-runtime/1",context,bindingSHA256:authorization.inputBindingSHA256,prepareDiagnosticOnly:true,
 prepareDiagnosticAuthorization:authorization,sourceReplayAuthorization:source,
 simulationCalendarAuthorization:{...source,schema:"helmut-w15-isolated-mock-calendar-authorization/1",contract:Calendar.VERSION,historicalPricesOnly:true},
 window,calendar:{utcDay:day,berlinDay:berlin(now),sourceDatesRewritten:false,signaturesReused:false},
 functionalResourceContract:{contract:"helmut-w15-mock500-host-functional/1",mode:Prepare.MODE,memoryProfile:"helmut-w15-mock500-host-functional/1",
 hardMemoryBytes:safety.commonHostHardBytes,hostReserveBytes:safety.hostAvailableReserveBytes,legacyRegularMemoryAccepted:false,
 providerResourceAccepted:false,hostCapacityBudget:{schema:"helmut-w15-host-capacity-budget/1",profile:"helmut-w15-end500-host-capacity-diagnostic/1",
 hardLimitBytes:safety.commonHostHardBytes,minimumHostReserveBytes:safety.hostAvailableReserveBytes}}};
const owner={scope:Prepare.SCOPE,resourceContract:Prepare.CONTRACT,confirmation:Prepare.CONFIRMATION,targetDatabase:B.DB,
 maximumUnits:0,temporarySyntheticProfiles:0,full500Allowed:false,paidModelsAllowed:false,productionAllowed:false,
 authorizationBinding:{runId:context.runId,exactCommit:context.exactCommit,prepareDiagnosticAuthorization:authorization,
 sourceReplayAuthorization:source,simulationCalendarAuthorization:bound.simulationCalendarAuthorization}};
const config={database:B.DB,host:Calendar.HOST,deploymentId:Calendar.DEPLOYMENT,commit:context.exactCommit,url:"http://127.0.0.1:1"};
function writeOwner(value=owner){
 for(const dir of [work,state])fs.writeFileSync(path.join(dir,"OWNER_GO.PRIVATE.json"),JSON.stringify(value),{mode:0o600});
}
writeOwner();
fs.writeFileSync(path.join(work,"runtime-public.PRIVATE.json"),JSON.stringify(config),{mode:0o600});
fs.writeFileSync(path.join(state,"configuration.PRIVATE.json"),JSON.stringify(config),{mode:0o600});
function probe(filename,overrides={},tail="",fakeProcess=process,testing={}){
 const real=createRequire(filename),mod={exports:{}};
 function req(name){return Object.hasOwn(overrides,name)?overrides[name]:real(name);}
 req.resolve=real.resolve;req.cache=real.cache;req.main=real.main;
 vm.runInThisContext("(function(require,module,exports,__filename,__dirname,process,testing){"+fs.readFileSync(filename,"utf8")+"\n"+tail+"\n})",{filename})
  (req,mod,mod.exports,filename,path.dirname(filename),fakeProcess,testing);
 return mod.exports;
}
const localB={...B,BASE:root};
const Source=probe(require.resolve("./mock500_source_replay"),{"./mock500_bindings":localB},"module.exports.authorityProbe=authority;");
const Harness=probe(require.resolve("./mock500_calendar"),{"./mock500_bindings":localB,"./mock500_source_replay":Source},
 "module.exports.authenticateProbe=authenticate;");
const materials={database:B.DB,productionCommit:config.commit,selector:{operationId:"synthetik500-prepare-synthetic",commandHash:"e".repeat(64)},
 controlHash:"CONTROL",booksHash:"BOOKS",full500DispatchAuthorized:false,activatedProfiles:0,
 preactivationBindings:{status:"PASS_ALL500_ACTUAL_D_PROVIDER_REVIEW_REQUEST_BINDINGS",profiles:500,actualDRequests:500,
 providerRequests:500,reviewRequests:500,profileActivations:0},sourceReplay:{purpose:"EXECUTION",authorization:source},simulationCalendar:Harness.evidence()};
const runtimeFile=path.resolve(__dirname,"../synthetik-500-w15-full500-runtime.js");
function runtime({descriptor=bound,go=owner,input=materials,fail=null}={}){
 const calls=[],saved=[],frames=[],fakeProcess={env:{},argv:["node",runtimeFile],getuid:()=>1000};
 const observation={assessment:()=>({pass:true,usageEnvelopes:0}),mutations:[],usageSinks:[],casWrites:[]};
 const S={prepareSynthetik500StoredCommand:async()=>{calls.push("stored");if(fail)throw fail;return{executionAuthorized:false,metrics:{wallMs:1}};},
  withSynthetik500InstallationCommand:async(_selector,body)=>{calls.push("installation-content-open");return body();},
  loadSynthetik500ProductionCommand:async()=>{calls.push("command-read");return{command:{drafts:Array.from({length:500},()=>({sources:{}}))}};},
  readSynthetik500CurrentInputs:async()=>calls.push("current-inputs"),readAuthStore:async()=>{calls.push("auth-read");return{};}};
 const C={controlHash:()=>{calls.push("control-hash");return input.controlHash;},booksHash:()=>{calls.push("books-hash");return input.booksHash;},
  get DIRECT_GATES(){throw Error("GATES_MUST_NOT_BE_READ");}};
 const files={"OWNER_GO.PRIVATE.json":go,"configuration.PRIVATE.json":config,"processing-materials.PRIVATE.json":input};
 const overrides={"node:fs":{lstatSync:()=>({isFile:()=>true,isSymbolicLink:()=>false,uid:1000,mode:0o100600}),
  readFileSync:file=>path.basename(file)==="signing-key.PRIVATE.pem"?Buffer.from("FICTIONAL_PRIVATE_KEY_NO_CRYPTO"):
   Buffer.from(JSON.stringify(files[path.basename(file)])),existsSync:()=>false,
  writeFileSync:(file,raw,options)=>{saved.push({name:path.basename(file),value:JSON.parse(raw),options});},
  writeSync:(_fd,line)=>frames.push(JSON.parse(line))},
  "./w15-github/mock500_bindings":{...B,readBound:()=>descriptor},"./w15-github/mock500_calendar":Harness,
  "./fixtures/w15-durable-observations":{open:()=>({observe(){},ready(){},write(){}}),monitor:()=>()=>calls.push("telemetry-stopped")},
  "./fixtures/w15-auth-measurement-report":{retainOnTermination:()=>()=>calls.push("termination-handler-removed"),summarize:()=>({})},
  "../lib/helmut/storage":S,"../lib/helmut/synthetik-500-production-command":C,
  "../lib/helmut/synthetik-500-production-adapter":{install:async()=>{throw Error("INSTALL_MUST_NOT_RUN");}}};
 const mod=probe(runtimeFile,overrides,
  "environment=()=>testing.calls.push('environment');guard=()=>testing.calls.push('guard');observeAuth=()=>testing.observation;"+
  "module.exports.probe={ownerGo,prepare,main,run,atomicPrepared0Check};",fakeProcess,{calls,observation});
 return{...mod.probe,calls,saved,frames,fakeProcess};
}
function materialProbe({prepared0=true,descriptor=bound,go=owner}={}){
 const filename=path.resolve(__dirname,"../synthetik-500-w15-full500-materials.js"),calls={sql:0,reads:0,writes:[]};
 const mod=probe(filename,{"node:fs":{lstatSync:()=>({isFile:()=>true,isSymbolicLink:()=>false,uid:1000,mode:0o100600}),
  readFileSync:()=>{calls.reads++;return Buffer.from(JSON.stringify(go));},writeFileSync:(file,raw,options)=>calls.writes.push({file,raw,options})},
  "node:child_process":{spawnSync(){calls.sql++;throw Error("SQL_MUST_NOT_RUN");}},
  "./synthetik-500-w15-signed-chain-test":{},"./w15-github/mock500_materials_failure":{create:()=>({enter(){},record(){}})},
  "./w15-github/mock500_bindings":{...B,readBound:()=>descriptor}},
  "module.exports.probe={checkDiagnosticScope,main,retain,unit0:UNIT0};",
  {argv:["node",filename,...(prepared0?["--atomic-prepared0"]:[])],getuid:()=>1000,env:{},memoryUsage:()=>({rss:0})});
 return{...mod.probe,calls};
}
function worker(extra={}){
 return{status:"PASS_PREPARE_DIAGNOSTIC_CLOSED_ONLY_NOT_MOCK500",mode:Prepare.MODE,contract:Prepare.CONTRACT,
 ...Object.fromEntries(["exactCommit","runId","runAttempt","nonce"].map(k=>[k,context[k]])),
 materialsCompleted:true,prepareCompleted:true,firstFailurePhase:null,prepareFailure:null,materialsFailure:null,
 profiles:500,activeProfiles:0,profileFieldsUnchanged:true,nativeZeroState:"BOUND_PREPARED_ZERO",units:0,providerPhases:0,
 authorityInstalled:false,ownedContainerStopped:true,watchClosed:true,evidence:{closed:true},executionAuthority:false,
 mock500Acceptance:false,end500Acceptance:false,productionAcceptance:false,backupRoundtripVerified:false,retryAllowed:false,...extra};
}
async function checks(){
 const envKeys=["SUPABASE_URL","VERCEL_URL","VERCEL_DEPLOYMENT_ID"],previous=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
 try{
  Object.assign(process.env,{SUPABASE_URL:"http://127.0.0.1:1",VERCEL_URL:Calendar.HOST,VERCEL_DEPLOYMENT_ID:Calendar.DEPLOYMENT});
  assert.deepEqual(Prepare.validate(bound,owner),authorization);
  const actual=runtime();await actual.main("prepare");
  assert.deepEqual(actual.calls,["guard","environment","stored","installation-content-open","command-read","current-inputs", "auth-read",
   "control-hash","books-hash","telemetry-stopped","termination-handler-removed"]);
  assert.deepEqual(actual.saved.map(v=>v.name),["PREPARE_DIAGNOSTIC_CHECKS.SAFE.json"]);
  assert.deepEqual(actual.saved[0].value,{schema:"helmut-w15-mock500-prepare-checks/1",status:"PASS_PREPARE_CHECKS_BEFORE_ADMISSION_INSTALL",
   contract:Prepare.CONTRACT,...Object.fromEntries(["exactCommit","runId","runAttempt","nonce"].map(k=>[k,context[k]])),
   validatedProfiles:500,profileActivations:0,unitEntries:0,providerCalls:0,authorityInstalled:false,fullCValidated:true,preactivationBindingsVerified:true});
  assert.equal(actual.saved[0].options.flag,"wx");assert.equal(actual.fakeProcess.env.HELMUT_SYNTHETIK500_CONTENT_PRIVATE_KEY,undefined);
  assert.equal(Calendar.active(),null);
  console.log("PASS actual prepare/content/current-input/auth/hash readers return before GO/gates/admission/install");

  for(const change of [{scope:"PRODUCTION"},{resourceContract:"helmut-w15-mock500-host-functional/1"},{confirmation:"FORGED"},
   {maximumUnits:500},{temporarySyntheticProfiles:500},{full500Allowed:true},{paidModelsAllowed:true},{productionAllowed:true},
   {authorizationBinding:{...owner.authorizationBinding,prepareDiagnosticAuthorization:{authorized:true}}}])
   assert.throws(()=>Prepare.validate(bound,{...owner,...change}));
  for(const change of [{scope:"PRODUCTION"},{nonce:"00000000-0000-4000-8000-000000000000"},{inputBindingSHA256:"f".repeat(64)},
   {approvalSHA256:"f".repeat(64)},{sourceQualificationSHA256:"f".repeat(64)},{diagnosticOfRunId:"12345"},{raw:"PRIVATE"}])
   assert.throws(()=>Prepare.validate({...bound,prepareDiagnosticAuthorization:{...authorization,...change}},owner));
  const expired=structuredClone(bound);for(const k of Object.keys(expired.window))expired.window[k]=new Date(Date.parse(expired.window[k])-14400000).toISOString();
  assert.throws(()=>Prepare.validate(expired,owner));
  // A fixed fixture clock must not weaken either real same-day guard.
  try{
   for(const iso of ["2026-11-04T20:00:00.000Z","2026-11-04T22:08:30.000Z"]){
    const at=Date.parse(iso),overnight=structuredClone(bound);mock.timers.setTime(at);
    overnight.calendar.utcDay=iso.slice(0,10);overnight.calendar.berlinDay=berlin(new Date(at));
    for(const key of Object.keys(overnight.window))overnight.window[key]=new Date(Date.parse(bound.window[key])+at-fixtureTime).toISOString();
    assert.throws(()=>Prepare.validate(overnight,owner),{code:"ERR_ASSERTION",actual:"2026-11-05",expected:"2026-11-04"});
   }
  }finally{mock.timers.setTime(fixtureTime);}
  const ambient=runtime({descriptor:null});ambient.fakeProcess.env.HELMUT_PREPARE_DIAGNOSTIC_ONLY="true";
  assert.throws(()=>ambient.ownerGo());assert.throws(()=>Prepare.validate({...bound,prepareDiagnosticOnly:false},owner));
  assert.throws(()=>Prepare.validate({...bound,materialsDiagnosticOnly:true},owner));
  console.log("PASS forged/mixed owner scope, context, source/input hashes, expired/UTC-/Berlin-crossing windows and ENV-only requests denied");

  for(const action of ["run","atomic-check","unit","provider"]){
   const r=runtime();await assert.rejects(r.main(action),/w15-prepare-diagnostic-runtime-action/);assert.deepEqual(r.calls,[]);
  }
  await assert.rejects(runtime().run(),/w15-prepare-diagnostic-runtime-action/);
  await assert.rejects(runtime().atomicPrepared0Check(),/w15-prepare-diagnostic-runtime-action/);
  const invalid=runtime({input:{...materials,activatedProfiles:500}});await assert.rejects(invalid.prepare());assert(!invalid.calls.includes("stored"));
  console.log("PASS runtime action and material count gates deny all activation/unit/provider paths");

  const mp=materialProbe();mp.checkDiagnosticScope();assert.equal(mp.unit0,false);assert.equal(mp.calls.sql,0);
  const missing=materialProbe({prepared0:false});await assert.rejects(missing.main(),/w15-prepare-diagnostic-prepared0-required/);
  assert.equal(missing.calls.reads,0);assert.equal(missing.calls.sql,0);
  const code=fs.readFileSync(path.resolve(__dirname,"../synthetik-500-w15-full500-materials.js"),"utf8");
  const section=code.slice(code.indexOf("    const prepare = { runtimeManifest"),code.indexOf("    const route = structuredClone"));
  const ordering=[];
  vm.runInNewContext(section,{runtimeManifest:{},snapshot:{},belege:{},BOUND:bound,UNIT0:false,operationId:"synthetic",config,
   DB:B.DB,P:{hash:()=>"f".repeat(64)},bytes:Buffer.from("{}"),Date,
   retain:(name,value)=>{ordering.push(name);mp.retain(name,value);},stage:()=>{},pass:()=>{},sql:()=>ordering.push("SQL"),
   G:{baueSql:()=>{ordering.push("construct-prepare-SQL");return"synthetic";}}});
  assert.deepEqual(ordering,["cleanup-context.PRIVATE.json","construct-prepare-SQL","SQL"]);
  assert.equal(mp.calls.writes[0].options.flag,"wx");assert.equal(mp.calls.writes[0].options.mode,0o600);
  assert(code.indexOf("C.validate(built.command)")<code.indexOf("sql(prepareSQL); sql(activateSQL)"));
  console.log("PASS prepared0 forced before native work; exclusive cleanup context precedes prepare SQL; full C retained");

  assert.deepEqual(Source.authorityProbe(bound,path.join(work,"OWNER_GO.PRIVATE.json")),source);
  assert.equal(Harness.authenticateProbe(bound,null,true).authorization.contract,Calendar.VERSION);
  const fullBound=structuredClone(bound);delete fullBound.prepareDiagnosticOnly;delete fullBound.prepareDiagnosticAuthorization;
  fullBound.functionalResourceContract.mode="mock500-full-host-functional-gated";
  const fullOwner={...owner,confirmation:"GO_EXACTLY_ONE_ISOLATED_W15_FULL500_MOCK_RUN_AND_RETURN_TO_ZERO",maximumUnits:500,
   temporarySyntheticProfiles:500,full500Allowed:true};writeOwner(fullOwner);
  assert.deepEqual(Source.authorityProbe(fullBound,path.join(work,"OWNER_GO.PRIVATE.json")),source);
  assert.equal(Harness.authenticateProbe(fullBound,null,true).authorization.contract,Calendar.VERSION);
  assert.equal(runtime({descriptor:fullBound,go:fullOwner}).ownerGo().maximumUnits,500);
  assert.throws(()=>runtime({descriptor:fullBound}).ownerGo());
  const oldOwner={...owner,confirmation:"GO_ONE_ISOLATED_MATERIALS_DIAGNOSTIC_AND_RETURN_TO_ZERO"};
  const oldBound={...bound,prepareDiagnosticOnly:undefined,materialsDiagnosticOnly:true};
  assert.equal(runtime({descriptor:oldBound,go:oldOwner}).ownerGo({materialsDiagnostic:true}).maximumUnits,0);
  materialProbe({descriptor:oldBound,go:oldOwner}).checkDiagnosticScope();
  assert.throws(()=>Source.authorityProbe(oldBound,path.join(work,"OWNER_GO.PRIVATE.json")));
  assert.equal(Calendar.active(),null);assert.equal(EU.renewedOrder({version:7,orderRenewalHash:EU.MOCK_CALENDAR_HASH,runDayUTC:day}),false);
  writeOwner();console.log("PASS Prepare source/calendar capability; Full500/old Materials and Production defaults unchanged");

  const cb={closedPrepareFailure:Failure.closed,closedMaterialsFailure:v=>v?.category==="MATERIALS_ENTRY_REJECTED"?v:null,
   closedEvidence:v=>Object.keys(v||{}).join(",")==="closed"&&v.closed===true?{closed:true}:null};
  assert.deepEqual(Prepare.closedWorker(worker(),cb),worker());
  const failure={schema:"helmut-w15-mock500-prepare-failure/1",stage:"stored-command",category:"PREPARE_UNMAPPED",kind:"unknown"};
  assert(Prepare.closedWorker(worker({prepareCompleted:false,firstFailurePhase:"mock500-controller-prepare",prepareFailure:failure}),cb));
  assert(Prepare.closedWorker(worker({materialsCompleted:false,prepareCompleted:false,firstFailurePhase:"mock500-controller-materials",
   materialsFailure:{category:"MATERIALS_ENTRY_REJECTED"}}),cb));
  console.log("PASS closed worker success and fixed-stage diagnostic failures preserve zero authority");

  for(const change of [{extra:"PRIVATE"},{units:1},{profiles:true},{activeProfiles:1},{authorityInstalled:true},{mock500Acceptance:true},
   {nativeZeroState:"MISSING_FILE_PROVES_ZERO"},{materialsCompleted:false},{firstFailurePhase:"private raw text"},{evidence:{raw:"PRIVATE"}},
   {prepareFailure:failure},{prepareCompleted:false,firstFailurePhase:"mock500-controller-materials",prepareFailure:failure},
   {prepareCompleted:false,firstFailurePhase:"mock500-controller-prepare",materialsFailure:{category:"MATERIALS_ENTRY_REJECTED"}}])
   assert.equal(Prepare.closedWorker(worker(change),cb),null);
  assert.equal(Prepare.closedWorker(worker()),null);
  assert.equal(Prepare.closedWorker(worker(),{...cb,closedEvidence:()=>true}),null);
  const malicious=worker();Object.defineProperty(malicious,"nonce",{get(){throw Error("PRIVATE");}});
  assert.equal(Prepare.closedWorker(malicious,cb),null);console.log("PASS closed worker rejects raw fields, false success, wrong failure channel and authority inflation");

  const original=new assert.AssertionError({message:"PRIVATE_CANARY_MUST_NOT_ESCAPE"});
  const failed=runtime({fail:original});await assert.rejects(failed.prepare(),e=>e===original);
  assert.equal(failed.frames.length,1);assert(Failure.closed(failed.frames[0].failure));assert(!JSON.stringify(failed.frames).includes("PRIVATE_CANARY"));
  assert.deepEqual(failed.saved,[]);console.log("PASS existing safe first Prepare error retained; no GO or installation on failure");
 }finally{
  for(const k of envKeys)if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];
  fs.rmSync(root,{recursive:true,force:true});
 }
 console.log("PASS 8 synthetic Prepare diagnostic groups; no Original/database/model/key execution");
}
checks().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>mock.timers.reset());
