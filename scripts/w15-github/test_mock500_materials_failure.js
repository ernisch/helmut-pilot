'use strict';
// Tiny first-error boundary cases. No original, DB, GPG, network or 500 run.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process');
const {create}=require('./mock500_materials_failure');
const main=path.resolve(__dirname,'../synthetik-500-w15-full500-materials.js');
const binding=path.resolve(__dirname,'mock500_bindings.js');
const CANARY='FICTIONAL_PRIVATE_MESSAGE_PATH_DO_NOT_PUBLISH';
const prior={flag:process.env.HELMUT_W15_MATERIALS_DIAGNOSTIC,context:process.env.HELMUT_W15_MOCK_CONTEXT};
const root=fs.mkdtempSync(path.join(os.tmpdir(),'w15-material-error-'));fs.chmodSync(root,0o700);
const originalMonitors=new Set(process.listeners('uncaughtExceptionMonitor'));
function fixture(name){
 for(const listener of process.listeners('uncaughtExceptionMonitor'))
  if(!originalMonitors.has(listener))process.removeListener('uncaughtExceptionMonitor',listener);
 const folder=path.join(root,name);fs.mkdirSync(folder,{mode:0o700});
 process.env.HELMUT_W15_MATERIALS_DIAGNOSTIC='1';process.env.HELMUT_W15_MOCK_CONTEXT=path.join(folder,'context.PRIVATE.json');
 return {folder,observer:create(main,binding)};
}
function safe(folder){
 const name=path.join(folder,'MATERIALS_DIAGNOSTIC_FAILURE.SAFE.json');
 assert.equal(fs.statSync(name).mode&0o777,0o600);
 const raw=fs.readFileSync(name,'utf8');assert(!raw.includes(CANARY));return JSON.parse(raw);
}
try{
 delete process.env.HELMUT_W15_MATERIALS_DIAGNOSTIC;
 create('/fictional','/fictional').record(new Error(CANARY));
 assert.deepEqual(fs.readdirSync(root),[]);
 {
  const {folder,observer}=fixture('assertion');observer.enter('qualified');
  const error=new assert.AssertionError({message:CANARY,actual:CANARY,expected:'FICTIONAL'});
  error.stack=CANARY+'\n    at main ('+main+':158:3)';observer.record(error);
  observer.enter('output');observer.record(new Error('SECOND_FICTIONAL_FAILURE'));
  assert.deepEqual(safe(folder),{schema:'helmut-w15-materials-first-failure/1',category:'MATERIALS_MAIN_CHECK_158',kind:'assertion',stage:'qualified'});
  const privateFile=path.join(folder,'MATERIALS_FIRST_FAILURE.SAFE.json');
  assert.equal(fs.statSync(privateFile).mode&0o777,0o600);
  assert(fs.readFileSync(privateFile,'utf8').includes(CANARY));
 }
 {
  const {folder,observer}=fixture('filesystem');observer.enter('originals');
  const error=Object.assign(new Error(CANARY),{code:'ENOENT',stack:CANARY+'\n    at Object.privateBytes ('+binding+':20:5)'});
  observer.record(error);assert.equal(safe(folder).category,'MATERIALS_BINDING_CHECK_020');assert.equal(safe(folder).kind,'filesystem');
 }
 {
  const {folder,observer}=fixture('bounded');
  observer.record({message:'𐀀'.repeat(50000),stack:'𐀀'.repeat(50000)+'\n    at main ('+main+':1025:1)'});
  assert(fs.statSync(path.join(folder,'MATERIALS_FIRST_FAILURE.SAFE.json')).size<=65536);
  assert.equal(safe(folder).category,'MATERIALS_ENTRY_REJECTED');
  assert.throws(()=>observer.enter(CANARY));
 }
 {
  // The actual CLI fails in readBound before main(), with a fictional descriptor.
  const {folder}=fixture('actual-entry');const context=path.join(folder,'context.PRIVATE.json');
  const raw=Buffer.from(JSON.stringify({schema:'FICTIONAL_WRONG_SCHEMA'}));fs.writeFileSync(context,raw,{mode:0o600,flag:'wx'});
  const result=cp.spawnSync(process.execPath,[main],{cwd:path.resolve(__dirname,'../..'),encoding:'utf8',timeout:10000,
   env:{PATH:process.env.PATH,LANG:'C.UTF-8',HELMUT_SOURCE_MODE:'off',HELMUT_STORAGE_BACKEND:'local',
    HELMUT_W15_MATERIALS_DIAGNOSTIC:'1',HELMUT_W15_MOCK_CONTEXT:context,
    HELMUT_W15_MOCK_CONTEXT_SHA256:crypto.createHash('sha256').update(raw).digest('hex')}});
  assert.equal(result.status,1);const first=safe(folder);
  assert.equal(first.stage,'entry');assert.equal(first.kind,'assertion');assert.match(first.category,/^MATERIALS_BINDING_CHECK_[0-9]{3}$/);
 }
 {
  // Real VM throws reproduce the archived adapter's exact virtual filenames.
  // They test error transport only, not the unavailable Original builder logic.
  const vm=require('node:vm');
  for(const [filename,prefix]of[['mock500-current-date-builder','BUILDER'],
    ['mock500-current-date-contracts','CONTRACTS'],['mock500-original-draft-request','DRAFT']]){
   const {folder,observer}=fixture(prefix);observer.enter('builder');
   const build=vm.runInThisContext('(function(assert,canary){return function build(){assert.equal(1,2,canary);};})',
    {filename})(assert,CANARY);
   const outer=vm.runInThisContext('(function invoke(build){return build();})',{filename:main,lineOffset:285});
   assert.throws(()=>outer(build),error=>{observer.record(error);return error.name==='AssertionError';});
   const first=safe(folder);assert.equal(first.category,'MATERIALS_'+prefix+'_CHECK_001');
   assert.equal(first.stage,'builder');
   observer.record(new Error('LATER_ERROR_MUST_NOT_REPLACE_FIRST'));assert.deepEqual(safe(folder),first);
  }
  const {folder,observer}=fixture('actual-command');observer.enter('builder');
  // Invoke the actual downstream validator, without fixtures granting validity.
  assert.throws(()=>require('../../lib/helmut/synthetik-500-production-command').validate({}),error=>{
   observer.record(error);return /^synthetik500-production-/.test(error.message);
  });
  const first=safe(folder);assert.match(first.category,/^MATERIALS_COMMAND_CHECK_[0-9]{3}$/);
  const admission=fixture('actual-admission');admission.observer.enter('builder');
  assert.throws(()=>require('../../lib/helmut/synthetik-500-kosten-admission').pruefeRouteContract({},{}),error=>{
   admission.observer.record(error);return /^synthetik500-admission-/.test(error.message);
  });
  const rejected=safe(admission.folder);assert.match(rejected.category,/^MATERIALS_ADMISSION_CHECK_[0-9]{3}$/);
  assert.notEqual(rejected.category,'MATERIALS_ADMISSION_CHECK_038');
  for(const [index,filename]of['private/mock500-current-date-builder','mock500-current-date-builder-extra',
    'mock500-current-date-builder\n'].entries()){
   const {folder,observer}=fixture('unrecognised-'+index);observer.enter('builder');
   observer.record({stack:CANARY+'\n    at build ('+filename+':123:2)\n    at main ('+main+':286:1)'});
   assert.equal(safe(folder).category,'MATERIALS_MAIN_CHECK_286');
  }
 }
 {
  const vm=require('node:vm'),{createRequire}=require('node:module');
  const fixtureData=JSON.parse(cp.execFileSync('python3',['-I','-B','-c',
   "import importlib.util,json,sys;s=importlib.util.spec_from_file_location('tiny_materials_public',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);q,v=m.MaterialsResultChecks('runTest').fixture();q['maximumWallSeconds']=1080;r=m.HOST.receipt(q);r.update(status=m.CONTRACT.OUTER_STATUS,workerResult=v,cleanup=dict.fromkeys(('workerExited','workerIPCClosed','parentStopRequested','parentEmpty','parentUnitRemoved','serviceLauncherExited','launcherListenerClosed','launcherSignalsRestored'),'PASS'));print(json.dumps({'request':q,'receipt':r}))",
   path.join(__dirname,'test_mock500_materials_diagnostic.py')],{encoding:'utf8',timeout:10000}));
  const q=fixtureData.request,action=path.resolve(__dirname,'../../.github/actions/w15-mock500/index.js');
  const realRequire=createRequire(action);
  function publicAction(receipt){
   const lines=[],proc={env:{W15_MODE:q.mode,EXPECTED_COMMIT:q.exactCommit,GITHUB_RUN_ID:q.runId,GITHUB_RUN_ATTEMPT:'1',
    GITHUB_REF:q.branch,GITHUB_EVENT_PATH:'/FICTIONAL',W15_IMAGE_ID:q.imageId,W15_NODE_SOURCE:q.nodeSource,W15_POSTGREST_SOURCE:q.postgrestSource,
    HELMUT_W15_RECEIVER_PROTECTED_KEY_B64:CANARY,HELMUT_W15_RECEIVER_PASSPHRASE:CANARY,GITHUB_TOKEN:CANARY}};
   const declaration=Object.fromEntries(['nonce','sourceQualification','approval','limits','maximumWallSeconds','bindings'].map(k=>[k,q[k]]));
   const sandbox={process:proc,Buffer,console:{log:line=>lines.push(line)},require(name){
    if(name==='node:fs')return{readFileSync:()=>JSON.stringify({inputs:{w15_request:JSON.stringify(declaration),w15_cipher_index:CANARY}})};
    if(name==='node:child_process')return{spawnSync:(_cmd,_args,options)=>{
      assert.equal(options.timeout,1140000);assert.equal(options.env.GITHUB_TOKEN,undefined);
      assert.equal(options.env.HELMUT_W15_RECEIVER_PASSPHRASE,undefined);
      return{status:0,stdout:JSON.stringify(receipt)};
    }};
    return realRequire(name);
   }};
   vm.runInNewContext(fs.readFileSync(action,'utf8'),sandbox,{filename:action,timeout:3000});
   assert(!lines.join('\n').includes(CANARY));return{code:proc.exitCode||0,value:JSON.parse(lines.at(-1))};
  }
  const failure=publicAction(fixtureData.receipt);assert.equal(failure.code,1);
  assert.equal(failure.value.workerResult.firstFailure.category,'MATERIALS_MAIN_CHECK_001');
  assert.equal(failure.value.workerResult.units,0);
  const success=structuredClone(fixtureData.receipt);success.workerResult.materialsCompleted=true;success.workerResult.firstFailure=null;
  assert.equal(publicAction(success).code,0);assert.equal(publicAction(success).value.mock500Acceptance,false);
  for(const mutate of [r=>{r.workerResult.evidence.privatePath=CANARY},r=>{r.workerResult.firstFailure.raw=CANARY},
    r=>{r.workerResult.units=500},r=>{r.workerResult.nonce='FICTIONAL_WRONG_NONCE'},r=>{r.cleanup.parentEmpty='UNKNOWN'}]){
    const bad=structuredClone(fixtureData.receipt);mutate(bad);const rejected=publicAction(bad);
    assert.equal(rejected.code,1);assert.equal(rejected.value.status,'FAIL_OR_BLOCKED_MOCK500_ACTION');
  }
 }
 console.log('PASS 7 bounded Materials first-error/public-action groups, including real VM and downstream-validator throws; no Original builder, originals or DB');
}finally{
 for(const listener of process.listeners('uncaughtExceptionMonitor'))
  if(!originalMonitors.has(listener))process.removeListener('uncaughtExceptionMonitor',listener);
 for(const [key,value]of[['HELMUT_W15_MATERIALS_DIAGNOSTIC',prior.flag],['HELMUT_W15_MOCK_CONTEXT',prior.context]])
  if(value===undefined)delete process.env[key];else process.env[key]=value;
 fs.rmSync(root,{recursive:true,force:true});
}
