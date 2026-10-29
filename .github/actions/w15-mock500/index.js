'use strict';
function closedFailureMemory(value){
  const keys=['configuredLimitBytes','kernelLifetimePeakBytes','currentBytes','swapMaximumBytes','swapCurrentBytes','lastReadbackValid','events'];
  const events=['max','oom','oom_kill','oom_group_kill'];
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==[...keys].sort().join(',')||
    typeof value.lastReadbackValid!=='boolean')return null;
  if(keys.filter(k=>!['lastReadbackValid','events'].includes(k)).some(k=>!Number.isSafeInteger(value[k])||value[k]<0))return null;
  if(!value.events||typeof value.events!=='object'||Array.isArray(value.events)||
    Object.keys(value.events).sort().join(',')!==[...events].sort().join(',')||
    events.some(k=>!Number.isSafeInteger(value.events[k])||value.events[k]<0))return null;
  return value;
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
  if(result.error)throw Error('worker');
  const receipt=JSON.parse(result.stdout);
  if(result.status!==0){
    const phases=['arguments','event','approval','qualification','binding','resources','synthetic',
      'receive-prepare','restore','mock500','backup','closure','parent','service','staging','worker','ipc'];
    phases.push(...['arguments','binding','private-inputs','key-import','outer-index','original-download',
      'original-reception','original-relocation','asset-download','asset-reception','asset-readback','agent-close']
      .map(value=>'mock-receiver-'+value));
    if(receipt.status!=='FAIL_OR_BLOCKED_MOCK500_WORKFLOW'||!phases.includes(receipt.phase)
      ||receipt.executionAuthority!==false||receipt.retryAllowed!==false)throw Error('receipt');
    const safe={status:receipt.status,phase:receipt.phase,executionAuthority:false,retryAllowed:false};
    if(receipt.worker&&Object.keys(receipt.worker).every(k=>['phase','memory'].includes(k))&&phases.includes(receipt.worker.phase)){
      safe.worker={phase:receipt.worker.phase};
      const memory=closedFailureMemory(receipt.worker.memory);if(memory)safe.worker.memory=memory;
    }
    console.log(JSON.stringify(safe));process.exitCode=1;return;
  }
  if(receipt.status!=='PASS_FRESH_MOCK500_RUNNER_OWNED_LIFETIME_ONLY')throw Error('receipt');
  console.log(JSON.stringify(receipt));
}
try{main();}catch(_){console.log('{"status":"FAIL_OR_BLOCKED_MOCK500_ACTION","executionAuthority":false}');process.exitCode=1;}
