'use strict';
// Actual closed Python packet -> actual JS action; all data is fictional.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const vm=require('node:vm'),cp=require('node:child_process'),{createRequire}=require('node:module');
const fixture=JSON.parse(cp.execFileSync('python3',['-I','-B','-c',`
import importlib.util,json,sys
from pathlib import Path
p=Path(sys.argv[1])
def load(n):
 s=importlib.util.spec_from_file_location('closed_public_'+n,p/(n+'.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
R,W=load('mock500_runner'),load('mock500_workflow')
rows=[]
for phase in sorted(R.S.D.MOCK_CONTROLLER_PHASES):
 e=R.S._worker_failure(W.WorkflowRejected(phase),'WORKER_RESULT_REJECTED',error_type=R.MockRunnerError)
 rows.append(dict(status='FAIL_OR_BLOCKED_MOCK500_WORKFLOW',**W._safe_failure(R._failure(R.S._failure_packet(e))),executionAuthority=False,retryAllowed=False))
assert not (R.S.D.MOCK_CONTROLLER_PHASES & R.S.D.OBSERVED_PHASES)
print(json.dumps(rows))`,__dirname],{encoding:'utf8',timeout:10000}));
const action=path.resolve(__dirname,'../../.github/actions/w15-mock500/index.js');
const realRequire=createRequire(action),CANARY='FICTIONAL_PRIVATE_URL_SQL_TOKEN_DO_NOT_PRINT';
function run(receipt){
 const lines=[],proc={env:{W15_MODE:'mock500-full-host-functional-gated',EXPECTED_COMMIT:'a'.repeat(40),
  GITHUB_RUN_ID:'123456789',GITHUB_RUN_ATTEMPT:'1',GITHUB_REF:'refs/heads/FICTIONAL',GITHUB_EVENT_PATH:'/FICTIONAL',
  W15_IMAGE_ID:'sha256:'+'b'.repeat(64),W15_NODE_SOURCE:'/FICTIONAL/node',W15_POSTGREST_SOURCE:'/FICTIONAL/postgrest',
  HELMUT_W15_RECEIVER_PROTECTED_KEY_B64:CANARY,HELMUT_W15_RECEIVER_PASSPHRASE:CANARY,GITHUB_TOKEN:CANARY}};
 const declared={nonce:'26d5a413-5ca7-415c-a412-62fc45b561c8',sourceQualification:{},approval:{},limits:{},maximumWallSeconds:12600,bindings:{}};
 const sandbox={process:proc,Buffer,console:{log:x=>lines.push(x)},require(name){
  if(name==='node:fs')return{readFileSync:()=>JSON.stringify({inputs:{w15_request:JSON.stringify(declared),w15_cipher_index:CANARY}})};
  if(name==='node:child_process')return{spawnSync:(_cmd,_args,opts)=>{
   assert.equal(opts.env.HELMUT_W15_RECEIVER_PROTECTED_KEY_B64,undefined);
   assert.equal(opts.env.HELMUT_W15_RECEIVER_PASSPHRASE,undefined);
   assert.equal(opts.env.GITHUB_TOKEN,undefined);
   return{status:1,stdout:JSON.stringify(receipt)};
  }};
  return realRequire(name);
 }};
 vm.runInNewContext(fs.readFileSync(action,'utf8'),sandbox,{filename:action,timeout:3000});
 assert.equal(proc.exitCode,1);assert(!lines.join('\n').includes(CANARY));return JSON.parse(lines.at(-1));
}
assert.equal(fixture.length,26);
for(const receipt of fixture){
 const out=run(receipt);assert.equal(out.status,receipt.status);assert.equal(out.worker.phase,receipt.worker.phase);
 assert.equal(out.retryAllowed,false);assert.equal(out.executionAuthority,false);
}
const bad=structuredClone(fixture[0]);bad.worker.phase=CANARY;assert.equal(run(bad).worker,undefined);
bad.worker={...fixture[0].worker,privateSQL:CANARY};assert.equal(run(bad).worker,undefined);
bad.phase=CANARY;assert.equal(run(bad).status,'FAIL_OR_BLOCKED_MOCK500_ACTION');
console.log('PASS 26 fixed controller phases cross real terminal packet and JS action; forged/private phases rejected; 0 real work');
