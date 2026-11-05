'use strict';
// Real runtime failure/ACK seams and Python controller -> Pipe -> public Action.
// Fictional data only; no database, originals, providers, or network calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const vm=require('node:vm'),cp=require('node:child_process'),{createRequire}=require('node:module');
const R=require('./mock500_run_failure'),root=path.resolve(__dirname,'../..');
const CANARY='FICTIONAL_PRIVATE_SQL_URL_TOKEN_MUST_NOT_ESCAPE';
const source=fs.readFileSync(path.join(root,'scripts/synthetik-500-w15-full500-runtime.js'),'utf8');
const reporter=source.slice(source.indexOf('function retainRunFailure('),source.indexOf('const Bound ='));
const tailBegin=source.indexOf('  } catch (e) {\n    retainRunFailure(e);\n    try { save("FULL500_RUNTIME_FAILURE.SAFE.json"');
assert(tailBegin>0,'test must exercise the actual runtime catch/finally');
const tail=source.slice(tailBegin,source.indexOf('\nasync function main(action)'));
const fixed=(extra={})=>({schema:'helmut-w15-mock500-run-failure/1',stage:'run',category:'RUN_STORED_CHECK_123',kind:'assertion',...extra});
const clone=value=>JSON.parse(JSON.stringify(value));
function error(file='lib/helmut/synthetik-500-stored-command.js',line=123){
  const e=new assert.AssertionError({message:CANARY});
  e.stack='AssertionError [ERR_ASSERTION]: '+e.message+'\n    at need ('+path.join(root,file)+':2:1)\n    at validate ('+path.join(root,file)+':'+line+':5)';return e;
}
function runtime({primary=null,cleanup=null,saveFailure=false,frameFailure=false,projectionFailure=false}={}){
  const frames=[],order=[];
  const context={assert,Buffer,RunFailure:projectionFailure?{project(){throw Error(CANARY);},closed:R.closed}:R,
    fs:{writeSync(_fd,line){order.push('frame');if(frameFailure)throw Error(CANARY);frames.push(JSON.parse(line));}},
    work:async()=>{if(primary)throw primary;},safeError:()=>({PRIVATE:CANARY}),
    save(){order.push('private-save');if(saveFailure)throw Error(CANARY);},
    stopTelemetry(){order.push('cleanup');if(cleanup)throw cleanup;},removeAbortReceipt(){},clearInterval(){},
    poll:{},provider:{restore(){}},azure(){},Lage:{},actualLage(){},sourceReplayScope:null,
    server:{closeAllConnections(){},close(resolve){resolve();}},m:{selector:{}},index:7,
    responses:[],unitReports:[],scopeReports:[],providerPhases:[],errors:[],memoryViolation:null,
    observation:{mutations:[],usageSinks:[],casWrites:[],assessment:()=>({})},AuthReport:{summarize:()=>({})},memory:()=>({})};
  vm.createContext(context);
  vm.runInContext('let firstRunFailure=null,firstRunError=null;\n'+reporter+'\nasync function exercise(){ try { await work();\n'+tail,context);
  return{context,frames,order};
}
function publicAction(receipt,{bindingChanges={},declaredChanges={}}={}){
  const action=path.join(root,'.github/actions/w15-mock500/index.js'),realRequire=createRequire(action),lines=[];
  const process={env:{W15_MODE:'mock500-full-host-functional-gated',EXPECTED_COMMIT:'a'.repeat(40),GITHUB_RUN_ID:'123456789',
    GITHUB_RUN_ATTEMPT:'1',GITHUB_REF:'refs/heads/FICTIONAL',GITHUB_EVENT_PATH:'/FICTIONAL',W15_IMAGE_ID:'sha256:'+'b'.repeat(64),
    W15_NODE_SOURCE:'/FICTIONAL/node',W15_POSTGREST_SOURCE:'/FICTIONAL/postgrest',
    HELMUT_W15_RECEIVER_PROTECTED_KEY_B64:CANARY,HELMUT_W15_RECEIVER_PASSPHRASE:CANARY,GITHUB_TOKEN:CANARY}};
  const declared={nonce:'26d5a413-5ca7-415c-a412-62fc45b561c8',sourceQualification:{},approval:{},limits:{},
    maximumWallSeconds:12600,bindings:{inputBindingSHA256:'d'.repeat(64)},...declaredChanges};
  const changed=clone(receipt);
  if(changed.runner?.runEvidence)Object.assign(changed.runner.runEvidence.binding,bindingChanges);
  vm.runInNewContext(fs.readFileSync(action,'utf8'),{process,Buffer,console:{log:x=>lines.push(x)},require(name){
    if(name==='node:fs')return{readFileSync:()=>JSON.stringify({inputs:{w15_request:JSON.stringify(declared),w15_cipher_index:CANARY}})};
    if(name==='node:child_process')return{spawnSync:(_cmd,_args,opts)=>{
      for(const key of ['HELMUT_W15_RECEIVER_PROTECTED_KEY_B64','HELMUT_W15_RECEIVER_PASSPHRASE','GITHUB_TOKEN'])assert.equal(opts.env[key],undefined);
      return{status:1,stdout:JSON.stringify(changed)};
    }};
    return realRequire(name);
  }},{filename:action,timeout:3000});
  assert.equal(process.exitCode,1);assert(!lines.join('\n').includes(CANARY));
  const out=JSON.parse(lines.at(-1));assert.equal(out.executionAuthority,false);assert.equal(out.retryAllowed,false);return out;
}
async function checks(){
  const primary=error(),secondary=error('lib/helmut/storage.js',321);
  const r=runtime({primary,cleanup:secondary,saveFailure:true});
  await assert.rejects(r.context.exercise(),e=>e===primary);
  r.context.retainRunFailure(secondary);
  assert.deepEqual(r.frames,[{kind:'W15_MOCK500_RUN_FAILURE',failure:fixed()}]);
  assert.deepEqual(r.order,['frame','private-save','cleanup']);
  assert(Buffer.byteLength(JSON.stringify(r.frames[0])+'\n')<=512);assert(!JSON.stringify(r.frames).includes(CANARY));
  const broken=runtime({primary,cleanup:secondary,saveFailure:true,frameFailure:true});
  await assert.rejects(broken.context.exercise(),e=>e===primary);assert.equal(broken.frames.length,0);
  assert.equal(broken.order.filter(v=>v==='frame').length,1,'failed reporting must not retry or replace the cause');
  const projected=runtime({primary,projectionFailure:true});await assert.rejects(projected.context.exercise(),e=>e===primary);
  assert.equal(projected.frames[0].failure.category,'RUN_UNMAPPED');
  const cleanupOnly=runtime({cleanup:secondary});await assert.rejects(cleanupOnly.context.exercise(),e=>e===secondary);
  assert.equal(cleanupOnly.frames[0].failure.category,'RUN_STORAGE_CHECK_321');
  const ok=runtime();await ok.context.exercise();assert.equal(ok.frames.length,0);

  // Actual fetch/provider finally: a restore error must not hide the HTTP cause.
  const fetchBegin=source.indexOf('      let status, body;\n      try {',source.indexOf('async function run()'));
  const fetchEnd=source.indexOf('      const response = { index, action, status,',fetchBegin);
  assert(fetchBegin>0&&fetchEnd>fetchBegin);
  const fetchRun=runtime({saveFailure:true});
  Object.assign(fetchRun.context,{c:{adminSecret:CANARY},AbortSignal:{timeout:()=>({})},
    fetch:async()=>({status:200,json:async()=>{throw primary;}}),provider:{restore(){throw secondary;}}});
  fetchRun.context.server.address=()=>({port:1});
  vm.runInContext('async function unitFetch(){ const action="start";\n'+source.slice(fetchBegin,fetchEnd)+'\n}',fetchRun.context);
  fetchRun.context.work=fetchRun.context.unitFetch;
  await assert.rejects(fetchRun.context.exercise(),e=>e===primary);
  assert.equal(fetchRun.frames.length,1);assert.deepEqual(fetchRun.frames[0].failure,fixed());

  // Actual scope wrapper captures before diagnostics and scope cleanup can fail.
  const scopeBegin=source.indexOf('  const actualScope = S.withSynthetik500PreparedCommand;',source.indexOf('async function run()'));
  const scopeEnd=source.indexOf('  for (const name of ["readSynthetik500Runtime"',scopeBegin);
  assert(scopeBegin>0&&scopeEnd>scopeBegin);
  const scoped=runtime({saveFailure:true});
  scoped.context.performance=performance;
  scoped.context.S={withSynthetik500PreparedCommand:async(_args,work)=>{try{return await work();}finally{throw secondary;}},
    synthetik500PreparedDiagnostics(){throw Error('FICTIONAL_LATER_DIAGNOSTICS');}};
  vm.runInContext('let activeScope=null;\n'+source.slice(scopeBegin,scopeEnd),scoped.context);
  scoped.context.work=()=>scoped.context.S.withSynthetik500PreparedCommand({},async()=>{throw primary;});
  await assert.rejects(scoped.context.exercise(),e=>e===primary);
  assert.equal(scoped.frames.length,1);assert.deepEqual(scoped.frames[0].failure,fixed());

  // Preserve the qualified observer: a recovered conflict is not itself a new
  // terminal frame. Its failed CAS row still fails the unchanged unit contract.
  const observed=runtime(),conflict=error('lib/helmut/storage.js',333);conflict.code='AUTH_STORE_CONFLICT';
  conflict.stack='AssertionError [AUTH_STORE_CONFLICT]: '+conflict.message+'\n    at actual ('+path.join(root,'lib/helmut/storage.js')+':333:1)';
  let writes=0;const Cas={writeConditional:async()=>{if(++writes===1)throw conflict;return{};}};
  const Atomic={VERSION:'relational-atomic-v1',write:async()=>({}),confirmed:()=>true};
  observed.context.AsyncLocalStorage=require('node:async_hooks').AsyncLocalStorage;
  Object.assign(observed.context,{performance,sha:()=> 'd'.repeat(64),require:name=>{
    if(name==='../lib/helmut/auth-store-cas')return Cas;
    if(name==='../lib/helmut/llm-usage-atomic')return Atomic;
    throw Error('UNEXPECTED_FICTIONAL_REQUIRE');}});
  const native={mutateAuthStore:async callback=>{await callback({});
    try{await Cas.writeConditional({}, {rowId:'main-auth'});}catch(e){if(e!==conflict)throw e;await Cas.writeConditional({}, {rowId:'main-auth'});}return'RECOVERED';},
    recordLlmUsage:async()=>({}),acquirePipelineLock:async()=>true,releasePipelineLock:async()=>{}};
  const authBegin=source.indexOf('function authCoverageAssessment('),authEnd=source.indexOf('async function setup()',authBegin);
  vm.runInContext(source.slice(authBegin,authEnd),observed.context);
  const observation=observed.context.observeAuth(native);
  assert.equal(await native.mutateAuthStore(async()=>{}),'RECOVERED');
  assert.equal(observation.mutations[0].acknowledged,true);assert.equal(observation.assessment().allWritesAcknowledged,false);
  assert.equal(observation.assessment().pass,false);assert.equal(observed.frames.length,0);
  const coverageBegin=source.indexOf('      const authCheck = authCoverageAssessment(unitAuth);',source.indexOf('async function run()'));
  const coverageEnd=source.indexOf('      if (BOUND)',coverageBegin);assert(coverageBegin>0&&coverageEnd>coverageBegin);
  observed.context.unitAuth=observation;
  observed.context.work=()=>vm.runInContext(source.slice(coverageBegin,coverageEnd),observed.context);
  await assert.rejects(observed.context.exercise(),e=>e.code==='ERR_ASSERTION');
  assert.equal(observed.frames.length,1);assert.equal(observed.frames[0].failure.kind,'assertion');

  // Use the actual per-unit tail; an ACK must follow the statistics and guard checks.
  const ackBegin=source.indexOf('      unit.authTimings = AuthReport.summarize(unitAuth);');
  const ackEnd=source.indexOf('\n    }\n    const final = sql(',ackBegin);
  assert(ackBegin>0&&ackEnd>ackBegin);
  function unitTail({index=0,errors=[],memoryViolation=null,memoryOK=true,statsFailure=false}={}){
    const events=[],order=[];const context={assert,index,unit:{},unitAuth:{},observation:{},response:{},authCheck:{},errors,memoryViolation,
      AuthReport:{summarize:()=>({})},journal:{write(){order.push('stats');if(statsFailure)throw Error('FICTIONAL_STATS');}},
      sql:()=>({}),Durable:{databaseStatsSQL:()=>''},memory:()=>({}),memoryAccepted:()=>memoryOK,
      event(name,value){order.push('ack');events.push({name,value});}};
    return{run:()=>vm.runInNewContext(source.slice(ackBegin,ackEnd),context),events,order};
  }
  for(const change of [{errors:[{}]},{memoryViolation:{}},{memoryOK:false},{index:24,statsFailure:true}]){
    const t=unitTail(change);assert.throws(t.run);assert.equal(t.events.length,0);
  }
  const accepted=unitTail({index:24});accepted.run();assert.deepEqual(accepted.order,['stats','ack']);
  assert.equal(accepted.events[0].name,'unit-final-ack-accepted');assert.equal(accepted.events[0].value.index,24);

  // Message text and arbitrary paths cannot inject a source location.
  const forged=CANARY+'\n    at forged ('+path.join(root,'lib/helmut/storage.js')+':55:1)';
  const hidden={name:'Error',message:forged,stack:'Error: '+forged+'\n    at actual ('+path.join(root,'lib/helmut/synthetik-500-production-command.js')+':123:1)'};
  assert.equal(R.project(hidden).category,'RUN_COMMAND_CHECK_123');
  assert.equal(R.project({...hidden,stack:'UNVERIFIED\n    at forged ('+path.join(root,'lib/helmut/storage.js')+':55:1)'}).category,'RUN_UNMAPPED');
  assert.equal(R.project({...hidden,message:'x'.repeat(8193)}).category,'RUN_UNMAPPED');
  assert.equal(R.project({name:'Error',message:CANARY,stack:'Error: '+CANARY+'\n    at private (/PRIVATE/'+CANARY+':55:1)'}).category,'RUN_UNMAPPED');
  assert.equal(R.project({get stack(){throw Error(CANARY);}}).category,'RUN_UNMAPPED');
  for(const [code,kind]of [['MODULE_NOT_FOUND','module'],['EACCES','filesystem'],['ETIMEDOUT','timeout'],['ABORT_ERR','aborted']])
    assert.equal(R.project({code}).kind,kind);
  assert.equal(R.project(error('lib/helmut/storage.js',65535)).category,'RUN_STORAGE_CHECK_65535');
  assert.equal(R.project(error('lib/helmut/storage.js',65536)).category,'RUN_UNMAPPED');

  // Actual Controller -> exact Workflow error -> bounded OS Pipe -> real Action.
  const fixtures=JSON.parse(cp.execFileSync('python3',['-I','-B',path.join(__dirname,'test_mock500_run_failure.py'),'--public-fixtures'],
    {encoding:'utf8',timeout:10000}));
  assert.equal(fixtures[0].runner.runEvidence.completedProfiles,2);
  assert.equal(fixtures[0].runner.runEvidence.nativeCleanup.status,'UNKNOWN');
  for(const receipt of fixtures){
    const observed=publicAction(receipt);assert.equal(observed.worker.phase,'mock500-controller-run');
    assert.deepEqual(observed.runner?.runEvidence,receipt.runner?.runEvidence);
  }
  for(const [key,value]of [['exactCommit','f'.repeat(40)],['runId','987654321'],['runAttempt',2],
      ['nonce','36d5a413-5ca7-415c-a412-62fc45b561c8'],['inputBindingSHA256','e'.repeat(64)]]){
    const observed=publicAction(fixtures[0],{bindingChanges:{[key]:value}});
    assert.equal(observed.worker.phase,'mock500-controller-run');assert.equal(observed.runner?.runEvidence,undefined);
  }
  assert.equal(publicAction(fixtures[0],{declaredChanges:{bindings:{}}}).runner?.runEvidence,undefined);
  const stale=clone(fixtures[0]);stale.worker.phase='mock500-controller-prepare';
  assert.equal(publicAction(stale).runner?.runEvidence,undefined);
  for(const mutation of [v=>v.raw=CANARY,v=>v.nativeCleanup.raw=CANARY,v=>v.completedProfiles=false,
      v=>v.completedProfiles=501,v=>v.completionMeaning='UNKNOWN',v=>v.firstFailure.raw=CANARY,
      v=>v.nativeCleanup={status:'PASS',activeProfiles:0,confirmedZero:'UNKNOWN',nativeBoundZero:'UNKNOWN'},
      v=>v.firstFailure.category='RUN_STORAGE_CHECK_12\n',v=>v.binding.nonce+='\n',v=>v.raw='x'.repeat(65536)]){
    const bad=clone(fixtures[0]);mutation(bad.runner.runEvidence);
    const observed=publicAction(bad);assert.equal(observed.worker.phase,'mock500-controller-run');
    assert.equal(observed.runner?.runEvidence,undefined);
  }

  // Cross-language vocabulary parity includes exact keys and native UNKNOWN rules.
  const valid=fixtures[0].runner.runEvidence;
  const values=[valid,...fixtures.slice(1).map(v=>v.runner?.runEvidence??null)];
  for(const mutation of [v=>v.binding.runAttempt=true,v=>v.binding.runId='00001',v=>v.binding.exactCommit+='\n',
      v=>v.completedProfiles=0,v=>v.completedProfiles=500,v=>v.nativeCleanup.activeProfiles=false,
      v=>v.nativeCleanup={status:'PASS',activeProfiles:0,confirmedZero:true,nativeBoundZero:true},
      v=>v.nativeCleanup={status:'UNKNOWN',activeProfiles:0,confirmedZero:true,nativeBoundZero:'UNKNOWN'},
      v=>v.nativeCleanup={status:'FAIL',activeProfiles:1,confirmedZero:'UNKNOWN',nativeBoundZero:'UNKNOWN'},
      v=>v.nativeCleanup={status:'FAIL',activeProfiles:0,confirmedZero:false,nativeBoundZero:true}]){
    const v=clone(valid);mutation(v);values.push(v);
  }
  const py=`import importlib.util,json,sys\nfrom pathlib import Path\np=Path(sys.argv[1]);s=importlib.util.spec_from_file_location('fictional_run_parity',p/'runner_diagnostics.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nprint(json.dumps([m.run_evidence(v)for v in json.load(sys.stdin)]))`;
  const python=JSON.parse(cp.execFileSync('python3',['-I','-B','-c',py,__dirname],{input:JSON.stringify(values),encoding:'utf8',timeout:10000}));
  assert.deepEqual(values.map(R.closedEvidence),python);
  console.log('PASS run first-cause retention, post-check ACK, native UNKNOWN, Controller -> Workflow -> Pipe -> Action, binding/privacy rejection; 0 DB/original/model work');
}
checks().catch(error=>{console.error(error);process.exitCode=1;});
