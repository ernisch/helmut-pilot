'use strict';
function closedRunnerDetail(value){
  const reasons=new Set(['PARENT_READBACK_REJECTED','SUPERVISOR_DEADLINE','SUPERVISOR_INTERRUPTED','SUPERVISOR_REJECTED',
    'WORKER_START_REJECTED','WORKER_SETUP_REJECTED','WORKER_INTERRUPTED','WORKER_RESULT_REJECTED','WORKER_CLEANUP_UNCONFIRMED',
    'WORKER_IPC_EOF','WORKER_IPC_TIMEOUT','WORKER_IPC_REJECTED','WORKER_EXIT_WITHOUT_REPORT','WORKER_SIGNAL_EXIT',
    'WORKER_EXIT_REJECTED','WORKER_REPORTED_FAILURE','SERVICE_IPC_EOF','SERVICE_IPC_TIMEOUT','SERVICE_IPC_REJECTED',
    'SERVICE_EXIT_WITHOUT_REPORT','SERVICE_EXIT_REJECTED','PARENT_CLOSURE_REJECTED','CLEANUP_UNCONFIRMED','SIGNAL_DURING_CLEANUP']);
  if(!value||typeof value!=='object'||Array.isArray(value)||!reasons.has(value.reason)||
    !Object.keys(value).every(k=>['reason','secondaryReason','memory','memorySource','workerExitCode','serviceExitCode'].includes(k)))return null;
  const out={reason:value.reason};
  if(Object.hasOwn(value,'secondaryReason')){
    if(!reasons.has(value.secondaryReason))return null;out.secondaryReason=value.secondaryReason;
  }
  if(Object.hasOwn(value,'memory')||Object.hasOwn(value,'memorySource')){
    const memory=closedFailureMemory(value.memory);
    if(!memory||!['CURRENT_REJECTED_READBACK','CACHED_READBACK','POST_FAILURE_READBACK'].includes(value.memorySource))return null;
    out.memory=memory;out.memorySource=value.memorySource;
  }
  for(const key of ['workerExitCode','serviceExitCode'])if(Object.hasOwn(value,key)){
    if(!Number.isInteger(value[key])||value[key]<-255||value[key]>255)return null;out[key]=value[key];
  }
  return out;
}
function closedCleanup(value){
  const keys=['workerExited','workerIPCClosed','parentStopRequested','parentEmpty','parentUnitRemoved',
    'serviceLauncherExited','launcherListenerClosed','launcherSignalsRestored'];
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==[...keys].sort().join(',')||
    !keys.every(k=>['PASS','FAIL','UNKNOWN'].includes(value[k])))return null;
  return Object.fromEntries(keys.map(k=>[k,value[k]]));
}
function closedFailureMemory(value){
  const keys=['configuredLimitBytes','kernelLifetimePeakBytes','currentBytes','swapMaximumBytes','swapCurrentBytes','lastReadbackValid','events'];
  const events=['max','oom','oom_kill','oom_group_kill'];
  if(!value||typeof value!=='object'||Array.isArray(value)||!keys.every(k=>Object.hasOwn(value,k))||
    !Object.keys(value).every(k=>keys.includes(k)||k==='postFailureMemoryStat')||
    typeof value.lastReadbackValid!=='boolean')return null;
  if(keys.filter(k=>!['lastReadbackValid','events'].includes(k)).some(k=>!Number.isSafeInteger(value[k])||value[k]<0))return null;
  if(!value.events||typeof value.events!=='object'||Array.isArray(value.events)||
    Object.keys(value.events).sort().join(',')!==[...events].sort().join(',')||
    events.some(k=>!Number.isSafeInteger(value.events[k])||value.events[k]<0))return null;
  const out=Object.fromEntries(keys.map(k=>[k,value[k]])),detail=value.postFailureMemoryStat;
  const categories=['anon','file','kernel','shmem','file_dirty','file_writeback'];
  if(value.lastReadbackValid===false&&detail&&typeof detail==='object'&&!Array.isArray(detail)&&
    Object.keys(detail).sort().join(',')===[...categories,'observedAfterFailure','peakCompositionKnown'].sort().join(',')&&
    detail.observedAfterFailure===true&&detail.peakCompositionKnown===false&&
    categories.every(k=>Number.isSafeInteger(detail[k])&&detail[k]>=0||detail[k]==='UNKNOWN'))
    out.postFailureMemoryStat=Object.fromEntries([...categories,'observedAfterFailure','peakCompositionKnown'].map(k=>[k,detail[k]]));
  return out;
}
const fs=require('node:fs'),cp=require('node:child_process');
const credentialKeys=['ACTIONS_RUNTIME_TOKEN','ACTIONS_RESULTS_URL','ACTIONS_RUNTIME_URL','GITHUB_TOKEN',
  'GITHUB_API_URL','GITHUB_SERVER_URL','GITHUB_REPOSITORY','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT'];
function main(){
  const mode=process.env.W15_MODE,synthetic=mode==='mock500-runner-synthetic';
  const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  const declared=JSON.parse(event.inputs.w15_request);
  const request={schema:'helmut-w15-runner-request/1',mode,exactCommit:process.env.EXPECTED_COMMIT,
    runId:process.env.GITHUB_RUN_ID,runAttempt:Number(process.env.GITHUB_RUN_ATTEMPT),branch:process.env.GITHUB_REF,
    nonce:declared.nonce,imageId:process.env.W15_IMAGE_ID,nodeSource:process.env.W15_NODE_SOURCE,
    postgrestSource:process.env.W15_POSTGREST_SOURCE,sourceQualification:declared.sourceQualification,
    approval:declared.approval,limits:declared.limits,maximumWallSeconds:declared.maximumWallSeconds,
    bindings:declared.bindings};
  const privatePayload=synthetic?{}:{cipherIndex:event.inputs.w15_cipher_index,
    keyB64:process.env.HELMUT_W15_RECEIVER_PROTECTED_KEY_B64,
    passphrase:process.env.HELMUT_W15_RECEIVER_PASSPHRASE,eventInputs:event.inputs,
    artifactCredentials:Object.fromEntries(credentialKeys.filter(k=>process.env[k]).map(k=>[k,process.env[k]]))};
  for(const key of ['HELMUT_W15_RECEIVER_PROTECTED_KEY_B64','HELMUT_W15_RECEIVER_PASSPHRASE',
    ...credentialKeys.filter(k=>k.includes('TOKEN'))])delete process.env[key];
  const input=JSON.stringify({request,privatePayload});
  if(Buffer.byteLength(input)>1024*1024)throw Error('bound');
  const result=cp.spawnSync('/usr/bin/python3',['-B','scripts/w15-github/mock500_workflow.py','--launch'],
    {input,env:process.env,encoding:'utf8',maxBuffer:1024*1024,timeout:(synthetic?420:12720)*1000});
  const receipt=JSON.parse(result.stdout);
  if(result.error||result.status!==0){
    const phases=['arguments','event','approval','qualification','binding','resources','synthetic',
      'receive-prepare','restore','mock500','backup','closure','parent','service','staging','worker','ipc'];
    phases.push(...['arguments','binding','private-inputs','key-import','outer-index','original-download',
      'original-reception','original-relocation','asset-download','asset-reception','asset-readback','agent-close',
       ...['arguments','cipher','recipient','destination','decrypt','gzip','archive','manifest','files','integrity','readback','cleanup'].map(p=>'archive-'+p)]
      .map(value=>'mock-receiver-'+value));
    if(receipt.status!=='FAIL_OR_BLOCKED_MOCK500_WORKFLOW'||!phases.includes(receipt.phase)
      ||receipt.executionAuthority!==false||receipt.retryAllowed!==false)throw Error('receipt');
    const safe={status:receipt.status,phase:receipt.phase,executionAuthority:false,retryAllowed:false};
    if(receipt.worker&&Object.keys(receipt.worker).every(k=>['phase','memory'].includes(k))&&phases.includes(receipt.worker.phase)){
      safe.worker={phase:receipt.worker.phase};
      const memory=closedFailureMemory(receipt.worker.memory);if(memory)safe.worker.memory=memory;
    }
    const runner=closedRunnerDetail(receipt.runner);if(runner)safe.runner=runner;
    const cleanup=closedCleanup(receipt.cleanup);if(cleanup)safe.cleanup=cleanup;
    console.log(JSON.stringify(safe));process.exitCode=1;return;
  }
  if(receipt.status!=='PASS_FRESH_MOCK500_RUNNER_OWNED_LIFETIME_ONLY')throw Error('receipt');
  console.log(JSON.stringify(receipt));
}
try{main();}catch(_){console.log('{"status":"FAIL_OR_BLOCKED_MOCK500_ACTION","executionAuthority":false}');process.exitCode=1;}
