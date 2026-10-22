'use strict';
// Execute literal rendered observer/runtime sources with inert dependencies.
// This checks lexical hooks, schema and failure propagation, not engine/500 acceptance.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const input=JSON.parse(fs.readFileSync(0,'utf8'));
const R='/workspace/helmut-cpu-epoch-20261015',deadline='2099-01-01T00:00:00.000Z';
class FixedDate extends Date{constructor(...args){super(...(args.length?args:['2026-10-21T00:00:00.000Z']));}}
function fixture(source,{closeError=false,saveError=false,beforeError=false}={}){
  const observations=[],saved=[],stderr=[],exportsDone=[],returned={original:true};
  let serial=0;
  const proc={argv:['node','TEST_ONLY','TEST_ONLY_CONFIG'],execArgv:[],env:{},version:process.version,
    resourceUsage:()=>({maxRSS:123}),stderr:{write:s=>stderr.push(s)}};
  const countsCheck=c=>assert(Object.values(c).every(Number.isSafeInteger));
  const memory={event(name,index,c){countsCheck(c);observations.push({name,index,counts:{...c}});},
    beforeExport(c){countsCheck(c);observations.push({name:'beforeExport'});if(beforeError)throw Error('TEST_ONLY_OBSERVER_WRITE');},
    exportCompleted(){exportsDone.push(true);},close(c){countsCheck(c);observations.push({name:'close'});if(closeError)throw Error('TEST_ONLY_OBSERVER_CLOSE');}};
  const nativeBudget={observeRuntime(c){countsCheck(c);return memory;}};
  const storage={synthetik500PreparedDiagnostics:()=>({checkpoints:[]})};
  for(const name of ['mutateAuthStore','withSynthetik500PreparedCommand','withSynthetik500InstallationCommand',
    'readSynthetik500Runtime','readSynthetik500CurrentInputs','getProfileFromDb','synthetik500ReviewStorageContract',
    'storeSynthetik500ImmutableDraft','getSynthetik500ImmutableDraft','insertLageEntwurfsbeleg',
    'retainSynthetik500ProductionEvidence','recordLlmUsage','reserveLlmCall','loadSynthetik500ProductionCommand'])storage[name]=()=>{};
  const J={enter:()=>returned,finish:()=>{},expiredUnclaimedPredecessor:()=>false,
    current:()=>({inFlight:{deadlineAtUTC:deadline}})};
  const context={config:{mode:'TEST_ONLY',selector:'TEST_ONLY_SELECTOR',sourcePins:[],finalSourceBinding:'TEST_ONLY_SOURCE',
    inputs:{localProviderFixtures:'TEST_ONLY_FIXTURES'},originalPredecessor:{}},target:{database:'TEST_ONLY'},
    api:{readState:()=>({}),memoryAccounting:()=>({}),readAllFinalEvidence:async()=>[]}};
  const io={configure:()=>context,file:n=>n,environment:()=>({SUPABASE_URL:'http://127.0.0.1:7439'}),sha:()=>'',
    save(name,value){if(saveError&&serial++===0)throw Object.assign(Error('TEST_ONLY_SAVE'),{code:'TEST_ONLY_SAVE'});saved.push({name,value});}};
  // Trust the native memory helper only from the canonical checkout and the
  // current checkout selected by the CI launcher; both map to one inert stub.
  const modules={'node:fs':{appendFileSync(){}},'node:assert/strict':assert,
    'node:perf_hooks':{performance:{now:()=>1000}},'./local-io':io,
    'node:http':{request(){},globalAgent:{}},'node:https':{},
    [R+'/lib/helmut/synthetik-500-content-runner']:{sourceBinding:()=> 'TEST_ONLY_SOURCE'},
    [R+'/lib/helmut/storage']:storage,[R+'/lib/helmut/synthetik-500-production-command']:{validate(){}},
    [R+'/lib/helmut/synthetik-500-dispatch-journal']:J,[R+'/lib/helmut/synthetik-500-profile']:{hash:()=>''},
    [R+'/scripts/helmut-resource-meter/native-node-budget.js']:nativeBudget,
    [path.join(__dirname,'native-node-budget.js')]:nativeBudget};
  const sandbox={module:{exports:{}},process:proc,URL,Date:FixedDate,console:{log(){}},global:{fetch:async()=>{}},
    require(name){assert(Object.hasOwn(modules,name),'unexpected dependency '+name);return modules[name];}};
  vm.runInNewContext(source,sandbox,{timeout:1000});
  const obs=sandbox.module.exports.setup('RUNTIME');
  return{obs,proc,observations,saved,stderr,exportsDone,returned,io};
}
const legacy=fixture(input.original),staged=fixture(input.observed);
for(let index=0;index<500;index++)for(const f of [legacy,staged]){
  assert.equal(f.obs.J.enter({},null,null,index,deadline),f.returned,'original J result replaced');
  f.obs.event('local_unit_http_complete',{index,status:200});
}
// Actual J.enter calls the lexical event(); replacing obs.event alone misses it.
for(const name of ['actual_J_enter','local_unit_http_complete']){
  const frames=staged.observations.filter(x=>x.name===name);assert.equal(frames.length,500);
  assert.deepEqual(frames.map(x=>x.index),Array.from({length:500},(_,i)=>i));
}
const plain=JSON.parse(JSON.stringify(legacy.obs.metadata())),observed=JSON.parse(JSON.stringify(staged.obs.metadata()));
assert.deepEqual(observed,plain,'runtime observation changed public metadata/rows');
staged.obs.beforeRuntimeExport();staged.obs.runtimeMemoryExported();staged.obs.closeRuntimeMemory();
async function runtime({failure=false,closeError=false,saveError=false,beforeError=false}={}){
  const f=fixture(input.observed,{closeError,saveError,beforeError});let index=0;
  const primary=Object.assign(Error('TEST_ONLY_PRIMARY'),{code:'TEST_ONLY_PRIMARY'});
  const modules={'node:fs':{readFileSync:()=>'{"pass":true}'},'node:assert/strict':assert,
    './contracts':{json:()=>Array.from({length:500},(_,owner)=>({owner}))},
    './observe-app':{setup:()=>f.obs},
    './local-provider':{install:()=>({restore(){},count:()=>2,pending:()=>0})},
    './http-entry':{serve:async()=>({close:async()=>{},request:async()=>{
      if(failure)throw primary;
      f.obs.J.enter({},null,null,index,deadline);index++;
      return{status:200,body:{ok:true,result:{completedUnits:index}},wallMS:1};}})},
    './assess-runtime':{assess:metadata=>({...metadata,pass:true})}};
  const execution=vm.runInNewContext(input.measured,{process:f.proc,require:name=>{
    assert(Object.hasOwn(modules,name),'unexpected measured dependency '+name);return modules[name];}},{timeout:1000});
  if(beforeError){
    await assert.rejects(execution,/TEST_ONLY_OBSERVER_WRITE/);
    assert.equal(f.proc.exitCode,1);assert.equal(f.saved.length,0);assert.equal(f.exportsDone.length,0);
    assert(f.stderr.some(s=>JSON.parse(s).code==='TEST_ONLY_PRIMARY'),'observer error hid original failure');
    assert.equal(f.observations.at(-1).name,'close');return;
  }
  await execution;
  assert.equal(f.observations.at(-1).name,'close');
  assert.equal(f.exportsDone.length,1,'mark-export must follow only a completed save');
  if(failure||saveError){
    assert.equal(f.proc.exitCode,1);assert.equal(f.saved.at(-1).name,'RUNTIME_FAILURE.SAFE.json');
    assert.equal(f.saved.at(-1).value.failure.code,saveError?'TEST_ONLY_SAVE':'TEST_ONLY_PRIMARY');
    assert.equal(f.saved.at(-1).value.pass,false);
  }else{assert.equal(f.saved[0].name,'RUNTIME_RESULT.SAFE.json');assert.equal(f.saved[0].value.pass,true);}
  if(closeError){assert.equal(f.proc.exitCode,1);assert(f.stderr.includes('LOCAL_RUNTIME_MEMORY_CLOSE_FAILED\n'));}
}
(async()=>{
  await runtime();await runtime({failure:true});await runtime({failure:true,closeError:true});await runtime({saveError:true});
  await runtime({failure:true,beforeError:true});
  process.stdout.write(JSON.stringify({pass:true,literalSources:true,lexicalBeginHooks:500,externalEndHooks:500,
    publicMetadataIdentical:true,successAndFailureExports:true,originalFailurePreserved:true,
    engineCalls:0,databaseCalls:0,profileActivations:0,full500Runs:0})+'\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
