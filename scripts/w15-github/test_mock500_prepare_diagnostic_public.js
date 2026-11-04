"use strict";
// Real public Action and Python controller fixtures; all transport/native work is fake.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const cp=require("node:child_process"),{createRequire}=require("node:module");
const target=path.resolve(process.argv[2]||path.join(__dirname,"../.."));
const scripts=path.join(target,"scripts/w15-github"),action=path.join(target,".github/actions/w15-mock500/index.js");
const CANARY="FICTIONAL_PRIVATE_PREPARE_PUBLIC_CANARY_MUST_NOT_ESCAPE";
const python=`import contextlib,copy,importlib.util,io,json,sys
def load(path,name):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
p=load(sys.argv[1],'public_prepare_fixture');h=load(sys.argv[2],'public_host_fixture')
def pipeline(fail=False):
 t=p.PrepareDiagnosticChecks('runTest')
 try:
  with contextlib.redirect_stdout(io.StringIO()):value,events=t.pipeline(fail=fail)
  return value,events
 finally:t.doCleanups()
worker,events=pipeline();failed,failed_events=pipeline(True)
q=h.request();q.update(mode=p.P.MODE,maximumWallSeconds=p.P.WALL_SECONDS)
for key in ('exactCommit','runId','runAttempt','nonce'):q[key]=worker[key]
q['approval'].update(scope=p.P.SCOPE,resourceContract=p.P.CONTRACT,mode=p.P.MODE,
 **{key:q[key]for key in ('exactCommit','runAttempt','nonce')},processingSeconds=p.P.PROCESSING_SECONDS,
 completionSeconds=p.P.WALL_SECONDS,expectedUnits=0,expectedPositions=0,expectedControls=0,
 sourceContract=p.T.HOST.load('mock500_start').SOURCE_REPLAY,
 simulationCalendar=p.T.HOST.load('mock500_start').SIMULATION_CALENDAR,
 diagnosticOfRunId=p.P.DIAGNOSTIC_OF,inputBindingSHA256=q['bindings']['inputBindingSHA256'])
r=h.receipt(q);r.update(status=p.P.OUTER_STATUS,workerResult=worker,
 cleanup=dict.fromkeys(('workerExited','workerIPCClosed','parentStopRequested','parentEmpty','parentUnitRemoved',
  'serviceLauncherExited','launcherListenerClosed','launcherSignalsRestored'),'PASS'))
f=copy.deepcopy(r);f['workerResult']=failed
print(json.dumps(dict(request=q,receipt=r,failed=f,inputs=h.inputs(q),events=events,failedEvents=failed_events)))
`;
const fixture=JSON.parse(cp.execFileSync("python3",["-I","-B","-c",python,
 path.join(scripts,"test_mock500_prepare_diagnostic.py"),path.join(scripts,"test_mock500_host_contract.py")],
 {encoding:"utf8",timeout:30000,maxBuffer:1024*1024}));
const q=fixture.request,actualRequire=createRequire(action),source=fs.readFileSync(action,"utf8");
function actionResult(receipt,{inputs=fixture.inputs,environment={}}={}){
 const lines=[],proc={env:{W15_MODE:q.mode,EXPECTED_COMMIT:q.exactCommit,GITHUB_RUN_ID:q.runId,GITHUB_RUN_ATTEMPT:String(q.runAttempt),
  GITHUB_REF:q.branch,GITHUB_EVENT_PATH:"/FICTIONAL/EVENT",W15_IMAGE_ID:q.imageId,W15_NODE_SOURCE:q.nodeSource,
  W15_POSTGREST_SOURCE:q.postgrestSource,HELMUT_W15_RECEIVER_PROTECTED_KEY_B64:CANARY,
  HELMUT_W15_RECEIVER_PASSPHRASE:CANARY,GITHUB_TOKEN:CANARY,ACTIONS_RUNTIME_TOKEN:CANARY,...environment}};
 let calls=0;
 vm.runInNewContext(source,{process:proc,Buffer,console:{log:line=>lines.push(line)},require(name){
  if(name==="node:fs")return{readFileSync:()=>JSON.stringify({inputs:{...inputs,w15_cipher_index:CANARY}})};
  if(name==="node:child_process")return{spawnSync:(command,args,options)=>{
   calls++;assert.equal(command,"/usr/bin/python3");assert(args.includes("--launch"));
   for(const key of ["HELMUT_W15_RECEIVER_PROTECTED_KEY_B64","HELMUT_W15_RECEIVER_PASSPHRASE","GITHUB_TOKEN","ACTIONS_RUNTIME_TOKEN"])
    assert.equal(options.env[key],undefined);
   const frame=JSON.parse(options.input);assert.equal(frame.request.mode,q.mode);
   assert.equal(frame.privatePayload.passphrase,CANARY);
   return{status:0,stdout:JSON.stringify(receipt)};
  }};
  return actualRequire(name);
 }},{filename:action,timeout:3000});
 assert.equal(calls,1);assert.equal(lines.length,1);assert(!lines.join("\n").includes(CANARY));
 return{result:JSON.parse(lines[0]),exitCode:proc.exitCode||0};
}
function denied(change){
 const bad=structuredClone(fixture.receipt);change(bad);
 const observed=actionResult(bad);assert.equal(observed.exitCode,1);
 assert.deepEqual(observed.result,{status:"FAIL_OR_BLOCKED_MOCK500_ACTION",executionAuthority:false});
}
assert(fixture.events.includes("prepare"));
for(const name of ["run","audit","backup","atomic-check"])assert(!fixture.events.includes(name));
const accepted=actionResult(fixture.receipt);
assert.equal(accepted.exitCode,0);
assert.deepEqual(Object.keys(accepted.result).sort(),["status","mode","contract","exactCommit","runId","runAttempt","nonce",
 "workerResult","cleanup","hostCapacityBudget","hostCapacityAdmission","memory","executionAuthority","mock500Acceptance",
 "end500Acceptance","retryAllowed"].sort());
assert.equal(accepted.result.status,"PASS_FRESH_PREPARE_DIAGNOSTIC_OWNED_LIFETIME_ONLY");
assert.equal(accepted.result.contract,"helmut-w15-mock500-prepare-diagnostic/1");
assert.deepEqual(accepted.result.workerResult,fixture.receipt.workerResult);
for(const key of ["executionAuthority","mock500Acceptance","end500Acceptance","retryAllowed"])assert.equal(accepted.result[key],false);
assert.equal(accepted.result.workerResult.authorityInstalled,false);assert.equal(accepted.result.workerResult.activeProfiles,0);
assert.equal(accepted.result.workerResult.units,0);assert.equal(accepted.result.workerResult.providerPhases,0);
assert.equal(accepted.result.memory.hostCapacitySafetyObserved,true);
console.log("PASS real Action accepts Python Prepare closure with exact minimal public projection");

const failed=actionResult(fixture.failed);assert.equal(failed.exitCode,1);
assert.equal(failed.result.workerResult.prepareCompleted,false);
assert.equal(failed.result.workerResult.firstFailurePhase,"mock500-controller-prepare");
assert.equal(failed.result.workerResult.prepareFailure.category,"PREPARE_STORED_CHECK_123");
assert.equal(failed.result.workerResult.prepareFailure.schema,"helmut-w15-mock500-prepare-failure/1");
assert.equal(failed.result.mock500Acceptance,false);console.log("PASS failed Prepare exits one and retains only fixed failure category");

for(const key of ["exactCommit","runId","runAttempt","nonce"]){
 const value=key==="exactCommit"?"f".repeat(40):key==="runId"?"987654321":key==="runAttempt"?2:"22222222-2222-4333-8444-555555555555";
 denied(r=>{r[key]=value;});denied(r=>{r.workerResult[key]=value;});
}
denied(r=>{r.mode="mock500-full-host-functional-gated";});
const wrongInput=structuredClone(fixture.inputs),declared=JSON.parse(wrongInput.w15_request);
declared.approval.scope="ISOLATED_GITHUB_MOCK500_MATERIALS_DIAGNOSTIC_ONLY";wrongInput.w15_request=JSON.stringify(declared);
assert.equal(actionResult(fixture.receipt,{inputs:wrongInput}).exitCode,1);
console.log("PASS receipt/worker context, nonce, attempt and owner scope mismatches rejected");

for(const key of Object.keys(fixture.receipt.cleanup))for(const state of ["FAIL","UNKNOWN"])denied(r=>{r.cleanup[key]=state;});
denied(r=>{r.cleanup.raw=CANARY;});denied(r=>{r.ownedChildrenExited=false;});denied(r=>{r.sameKernelParentIdentity=false;});
denied(r=>{r.hostCapacityAdmission.diagnosticHardLimitBytes-=4096;});
console.log("PASS unconfirmed cleanup, lifetime identity and budget admission rejected");

for(const change of [s=>{s.configuredLimit=String(Number(s.configuredLimit)-4096);},s=>{s.configuredLimit=CANARY;},
 s=>{s.kernelLifetimePeakBytes=Number(s.configuredLimit)+1;},s=>{s.currentBytes=Number(s.configuredLimit)+1;},
 s=>{s.swapMaximum="1";},s=>{s.swapCurrentBytes=1;},s=>{s.hostCapacitySafetyObserved=false;}])
 denied(r=>change(r.finalCommonParentAfterOwnedExits));
for(const key of ["max","oom","oom_kill","oom_group_kill"])denied(r=>{r.finalCommonParentAfterOwnedExits.events[key]=1;});
console.log("PASS invalid memory, peak/current overflow, SWAP and kernel violation rejected");

denied(r=>{r.workerResult.raw=CANARY;});denied(r=>{r.workerResult.evidence.raw=CANARY;});
denied(r=>{r.workerResult.authorityInstalled=true;});denied(r=>{r.workerResult.providerPhases=1;});
denied(r=>{r.workerResult.prepareCompleted=false;r.workerResult.firstFailurePhase=CANARY;});
const rawFailure=structuredClone(fixture.failed);rawFailure.workerResult.prepareFailure.raw=CANARY;
assert.equal(actionResult(rawFailure).exitCode,1);
const privateOuter=structuredClone(fixture.receipt);privateOuter.raw=CANARY;
assert.equal(actionResult(privateOuter).exitCode,0);assert(!JSON.stringify(actionResult(privateOuter).result).includes(CANARY));
console.log("PASS extra worker/raw failure/evidence fields rejected; private outer extras omitted without CANARY");
console.log("PASS 6 synthetic real Action Prepare groups; 0 Original/native/crypto/network operations");
