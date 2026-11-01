'use strict';
// Small fictional boundary fixtures only. No Originals, DB, Docker or GitHub.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const cp=require('node:child_process'),{createRequire}=require('node:module');
const B=require('./mock500_bindings'),closed=require('../../.github/actions/w15-isolated/functional-resources').closed;
const file=path.join(__dirname,'test_mock500_host_contract.py');
const fixture=JSON.parse(cp.execFileSync('python3',['-I','-B','-c',
  "import importlib.util,json,sys; s=importlib.util.spec_from_file_location('fixture',sys.argv[1]); m=importlib.util.module_from_spec(s);s.loader.exec_module(m);q=m.request();r=m.receipt(q);r['hostFunctionalObservation']=m.H.observe_receipt(r,q);print(json.dumps({'request':q,'receipt':r,'inputs':m.inputs(q)}))",file],{encoding:'utf8'}));
const q=fixture.request,r=fixture.receipt,budget=r.hostCapacityBudget;
const nonce=q.nonce,root='/FICTIONAL/w15-mock500-'+q.runId+'-'+nonce.replaceAll('-','');
const context={schema:'helmut-w15-mock500-controller-context/1',scope:'ISOLATED_GITHUB_MOCK500_BINDING_ONLY',
  nonce,runId:q.runId,runAttempt:1,exactCommit:q.exactCommit,runnerTemp:'/FICTIONAL',
  hostPaths:{runRoot:root,work:root+'/work',prepare:root+'/prepare',cache:root+'/cache'}};
const bound={context,functionalResourceContract:{contract:'helmut-w15-mock500-host-functional/1',mode:q.mode,
  memoryProfile:'helmut-w15-mock500-host-functional/1',hardMemoryBytes:budget.hardLimitBytes,
  hostReserveBytes:2147483648,hostCapacityBudget:budget,legacyRegularMemoryAccepted:false,providerResourceAccepted:false}};
assert.equal(B.memoryLimits(bound).comparisonBudgetBytes,budget.hardLimitBytes);
assert.equal(B.memoryAssessment(bound,5102718976).reserveMeetsContract,true);
assert.equal(B.memoryAssessment(bound,budget.hardLimitBytes+1).reserveMeetsContract,false);
for(const change of [{hardMemoryBytes:4999999488},{hostCapacityBudget:{...budget,minimumHostReserveBytes:0}},
  {hostCapacityBudget:{...budget,hardLimitBytes:budget.hardLimitBytes+1}},{mode:'mock500-full-functional-gated'},
  {contract:'helmut-w15-isolated-functional/1'},{hostCapacityBudget:{...budget,PRIVATE_PATH:'/FICTIONAL'}}])
  assert.throws(()=>B.memoryLimits({...bound,functionalResourceContract:{...bound.functionalResourceContract,...change}}));
const previous=process.env.HELMUT_W15_MOCK_CONTEXT;delete process.env.HELMUT_W15_MOCK_CONTEXT;
const Runtime=require('../synthetik-500-w15-full500-runtime');
if(previous!==undefined)process.env.HELMUT_W15_MOCK_CONTEXT=previous;
const sample={configuredLimit:String(budget.hardLimitBytes),swapMaximum:'0',swapCurrentBytes:0,
  events:{max:0,oom:0,oom_kill:0,oom_group_kill:0},...B.memoryAssessment(bound,5102718976)};
assert.equal(Runtime.memoryAccepted(sample,bound),true);
for(const key of Object.keys(sample.events))assert.equal(Runtime.memoryAccepted({...sample,events:{...sample.events,[key]:1}},bound),false);
assert.equal(Runtime.memoryAccepted({...sample,configuredLimit:'4999999488'},bound),false);
assert.equal(Runtime.memoryAccepted({...sample,swapCurrentBytes:1},bound),false);
const obs=r.workerResult.functionalResourceObservation;
assert.deepEqual(closed(obs,budget),obs);assert.equal(closed(obs),null);
assert.equal(closed(obs,{...budget,hardLimitBytes:budget.hardLimitBytes-4096}),null);
assert.equal(closed({...obs,PRIVATE_PATH:'/FICTIONAL'},budget),null);
assert.equal(closed({...obs,providerResourceAccepted:true},budget),null);
const fractional={...obs,lastKernel:{memoryPressure:{some:{avg10:0.5,avg60:0.1,avg300:0,total:2}}}};
assert.deepEqual(closed(fractional,budget),fractional);
const action=path.resolve(__dirname,'../../.github/actions/w15-mock500/index.js'),realRequire=createRequire(action);
function actionResult(receipt){
  const lines=[],proc={env:{W15_MODE:q.mode,EXPECTED_COMMIT:q.exactCommit,GITHUB_RUN_ID:q.runId,GITHUB_RUN_ATTEMPT:'1',
    GITHUB_REF:q.branch,GITHUB_EVENT_PATH:'/FICTIONAL',W15_IMAGE_ID:q.imageId,W15_NODE_SOURCE:q.nodeSource,W15_POSTGREST_SOURCE:q.postgrestSource}};
  const sandbox={process:proc,Buffer,console:{log:s=>lines.push(s)},require(name){
    if(name==='node:fs')return{readFileSync:()=>JSON.stringify({inputs:fixture.inputs})};
    if(name==='node:child_process')return{spawnSync:()=>({status:0,stdout:JSON.stringify(receipt)})};
    return realRequire(name);
  }};
  vm.runInNewContext(fs.readFileSync(action,'utf8'),sandbox,{filename:action,timeout:3000});
  return{result:JSON.parse(lines.at(-1)),exitCode:proc.exitCode||0};
}
const accepted=actionResult(r);assert.equal(accepted.exitCode,0);assert.equal(accepted.result.hostCapacityBudget.hardLimitBytes,budget.hardLimitBytes);
assert.deepEqual(accepted.result.workerResult.functionalResourceObservation,obs);
const unsafe=structuredClone(r);unsafe.workerResult.functionalResourceObservation.PRIVATE_PATH='/FICTIONAL';
assert.equal(actionResult(unsafe).exitCode,1);
const wrong=structuredClone(r);wrong.hostCapacityAdmission.diagnosticHardLimitBytes-=4096;assert.equal(actionResult(wrong).exitCode,1);
console.log('PASS 5 fictional host driver, runtime guard, closed observation, real action success and rejection groups; 0 real runs');
