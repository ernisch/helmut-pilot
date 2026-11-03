'use strict';
// Actual Python terminal packet -> actual JS action. All data is fictional.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const vm=require('node:vm'),cp=require('node:child_process'),{createRequire}=require('node:module');
const fixtures=JSON.parse(cp.execFileSync('python3',['-I','-B',
  path.join(__dirname,'test_mock500_materials_terminal.py'),'--public-fixtures'],{encoding:'utf8',timeout:10000}));
const action=path.resolve(__dirname,'../../.github/actions/w15-mock500/index.js');
const realRequire=createRequire(action),CANARY='FICTIONAL_PRIVATE_TEXT_PATH_URL_DO_NOT_PRINT';
function run(receipt){
  const lines=[],proc={env:{W15_MODE:'mock500-full-host-functional-gated',EXPECTED_COMMIT:'a'.repeat(40),
    GITHUB_RUN_ID:'123456789',GITHUB_RUN_ATTEMPT:'1',GITHUB_REF:'refs/heads/FICTIONAL',GITHUB_EVENT_PATH:'/FICTIONAL',
    W15_IMAGE_ID:'sha256:'+'b'.repeat(64),W15_NODE_SOURCE:'/FICTIONAL/node',W15_POSTGREST_SOURCE:'/FICTIONAL/postgrest',
    HELMUT_W15_RECEIVER_PROTECTED_KEY_B64:CANARY,HELMUT_W15_RECEIVER_PASSPHRASE:CANARY,GITHUB_TOKEN:CANARY}};
  const declared={sourceQualification:{},approval:{},limits:{},maximumWallSeconds:12600,bindings:{}};
  const sandbox={process:proc,Buffer,console:{log:line=>lines.push(line)},require(name){
    if(name==='node:fs')return{readFileSync:()=>JSON.stringify({inputs:{w15_request:JSON.stringify(declared),w15_cipher_index:CANARY}})};
    if(name==='node:child_process')return{spawnSync:(_cmd,_args,options)=>{
      assert.equal(options.env.HELMUT_W15_RECEIVER_PROTECTED_KEY_B64,undefined);
      assert.equal(options.env.HELMUT_W15_RECEIVER_PASSPHRASE,undefined);
      assert.equal(options.env.GITHUB_TOKEN,undefined);
      return{status:1,stdout:JSON.stringify(receipt)};
    }};
    return realRequire(name);
  }};
  vm.runInNewContext(fs.readFileSync(action,'utf8'),sandbox,{filename:action,timeout:3000});
  assert.equal(proc.exitCode,1);assert(!lines.join('\n').includes(CANARY));return JSON.parse(lines.at(-1));
}
assert.equal(fixtures.length,5);
for(const receipt of fixtures){
  const out=run(receipt);
  assert.equal(out.worker.phase,receipt.worker.phase);
  assert.deepEqual(out.runner.materialsFailure,receipt.runner.materialsFailure);
  assert.equal(out.retryAllowed,false);assert.equal(out.executionAuthority,false);
}
for(const prefix of ['BUILDER','CONTRACTS','DRAFT','COMMAND','COST','ADMISSION','EXECUTOR','CALENDAR','RESULTPLAN']){
 for(const number of ['001','999','1024']){
  const detail={schema:'helmut-w15-materials-first-failure/1',category:'MATERIALS_'+prefix+'_CHECK_'+number,
   kind:'assertion',stage:'builder'};
  // The real Python validators, worker failure packet and OS Pipe feed the JS
  // action. No hand-copied public receipt can hide a rejecting inner consumer.
  const raw=cp.execFileSync('python3',['-I','-B','-c',
   "import importlib.util,json,sys;s=importlib.util.spec_from_file_location('inner_terminal',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(json.dumps(m.public_roundtrip(m.terminal('mock500-controller-materials-builder',json.load(sys.stdin)))))",
   path.join(__dirname,'test_mock500_materials_terminal.py')],{input:JSON.stringify(detail),encoding:'utf8',timeout:10000});
  const out=run(JSON.parse(raw));assert.deepEqual(out.runner.materialsFailure,detail);assert.equal(out.retryAllowed,false);
 }
}
for(const mutate of [v=>({...v,raw:CANARY}),v=>({...v,category:CANARY}),v=>({...v,kind:CANARY}),
  v=>({...v,stage:CANARY}),()=>CANARY,()=>null,()=>[],v=>({...v,category:'MATERIALS_MAIN_CHECK_1025'}),
  v=>({...v,category:'MATERIALS_MAIN_CHECK_001\n'})]){
  const receipt=structuredClone(fixtures[0]);receipt.runner.materialsFailure=mutate(receipt.runner.materialsFailure);
  const out=run(receipt);
  assert.equal(out.worker.phase,fixtures[0].worker.phase);
  assert.deepEqual(out.runner,{reason:'WORKER_REPORTED_FAILURE'});
}
const late=structuredClone(fixtures[0]);late.runner.secondaryReason='SIGNAL_DURING_CLEANUP';
late.cleanup=Object.fromEntries(['workerExited','workerIPCClosed','parentStopRequested','parentEmpty','parentUnitRemoved',
  'serviceLauncherExited','launcherListenerClosed','launcherSignalsRestored'].map(k=>[k,'UNKNOWN']));
const preserved=run(late);
assert.deepEqual(preserved.runner.materialsFailure,fixtures[0].runner.materialsFailure);
assert.equal(preserved.runner.secondaryReason,'SIGNAL_DURING_CLEANUP');
assert.equal(preserved.cleanup.parentEmpty,'UNKNOWN');
console.log('PASS 5 real terminal/public Materials phases, 27 inner-check Pipe/action roundtrips, 9 private/malformed rejections and late-cleanup preservation; no originals or DB');
