'use strict';
function closedPhaseObservation(value){
  if(value==='UNKNOWN')return value;
  const phases=new Set(["approval","arguments","backup","backup-authenticate","backup-collect","backup-export","backup-freeze","backup-postcheck","backup-recovery","backup-seal","backup-transport","binding","closure","connection-backup","connection-backup-authenticate","connection-backup-collect","connection-backup-export","connection-backup-freeze","connection-backup-postcheck","connection-backup-recovery","connection-backup-seal","connection-backup-transport","connection-binding","connection-cache","connection-closure","connection-container-start","connection-export-backup-after","connection-export-backup-before","connection-export-backup-dump","connection-export-backup-roles","connection-input-binding","connection-materialization","connection-native-restore","connection-prepare","connection-prepared-check","connection-readiness","connection-receive","connection-restore","connection-restore-apply","connection-restore-check","connection-restore-create","connection-restore-render","connection-restore-roles","end500","event","qualification","receive-prepare","receiver-agent-close","receiver-arguments","receiver-authenticated-reception","receiver-cipher-readback","receiver-disk-admission","receiver-download","receiver-download-expired","receiver-download-http","receiver-download-timeout","receiver-download-integrity","receiver-download-guard","receiver-download-io","receiver-download-interrupted","receiver-download-unknown","receiver-encrypted-index","receiver-index","receiver-key-import","receiver-private-inputs","receiver-relocation","receiver-source-binding","resources","restore","synthetic"]);
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).sort().join(',')!=='meaning,name,sequence'||!phases.has(value.name)||
    !Number.isInteger(value.sequence)||value.sequence<1||value.sequence>128||
    value.meaning!=='ENTERED_NOT_COMPLETED')return null;
  return {name:value.name,sequence:value.sequence,meaning:'ENTERED_NOT_COMPLETED'};
}
function closedMaterialsFailure(value){
  const stages=['entry','baseline','config','originals','qualified','original-upacket','calendar',
    'native-inputs','snapshot','native-manifest','activation','builder','output','complete'];
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).sort().join(',')!=='category,kind,schema,stage'||
    value.schema!=='helmut-w15-materials-first-failure/1'||!stages.includes(value.stage)||
    !['assertion','filesystem','module','sql','type','timeout','unknown'].includes(value.kind)||
    typeof value.category!=='string'||
    !(['MATERIALS_ENTRY_REJECTED','MATERIALS_PROCESS_REJECTED','MATERIALS_PROCESS_TIMEOUT','MATERIALS_FAILURE_UNAVAILABLE'].includes(value.category)||
      /^MATERIALS_(?:MAIN|BINDING|BUILDER|CONTRACTS|DRAFT|COMMAND|COST|ADMISSION|EXECUTOR|CALENDAR|RESULTPLAN)_CHECK_(?:00[1-9]|0[1-9][0-9]|[1-9][0-9]{2}|10[01][0-9]|102[0-4])$/.exec(value.category)?.[0]===value.category))return null;
  return {schema:value.schema,category:value.category,kind:value.kind,stage:value.stage};
}
function closedRunnerDetail(value){
  const reasons=new Set(['PARENT_READBACK_REJECTED','SUPERVISOR_DEADLINE','SUPERVISOR_INTERRUPTED','SUPERVISOR_REJECTED',
    'WORKER_START_REJECTED','WORKER_SETUP_REJECTED','WORKER_INTERRUPTED','WORKER_RESULT_REJECTED','WORKER_CLEANUP_UNCONFIRMED',
    'WORKER_IPC_EOF','WORKER_IPC_TIMEOUT','WORKER_IPC_REJECTED','WORKER_EXIT_WITHOUT_REPORT','WORKER_SIGNAL_EXIT',
    'WORKER_EXIT_REJECTED','WORKER_REPORTED_FAILURE','SERVICE_IPC_EOF','SERVICE_IPC_TIMEOUT','SERVICE_IPC_REJECTED',
    'SERVICE_EXIT_WITHOUT_REPORT','SERVICE_EXIT_REJECTED','PARENT_CLOSURE_REJECTED','CLEANUP_UNCONFIRMED','SIGNAL_DURING_CLEANUP']);
  if(!value||typeof value!=='object'||Array.isArray(value)||!reasons.has(value.reason)||
    !Object.keys(value).every(k=>['reason','secondaryReason','memory','memorySource','workerExitCode','serviceExitCode','lastObservedPhase','nativeFailure','materialsFailure','prepareFailure'].includes(k)))return null;
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
  const phase=closedPhaseObservation(value.lastObservedPhase);
  if(phase!==null)out.lastObservedPhase=phase;
  if(Object.hasOwn(value,'nativeFailure')){
    const native=require('../../../scripts/fixtures/w15-native-failure').closed(value.nativeFailure);
    if(native)out.nativeFailure=native;
  }
  const materials=closedMaterialsFailure(value.materialsFailure);
  if(materials)out.materialsFailure=materials;
  if(Object.hasOwn(value,'prepareFailure')){
    const prepared=require('../../../scripts/w15-github/mock500_prepare_failure').closed(value.prepareFailure);
    if(prepared)out.prepareFailure=prepared;
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
function closedCapacityMeasurement(value){return require('../w15-isolated/capacity-measurement').closedCapacityMeasurement(value);}
function closedFailureMemory(value){
  const keys=['configuredLimitBytes','kernelLifetimePeakBytes','currentBytes','swapMaximumBytes','swapCurrentBytes','lastReadbackValid','events'];
  const events=['max','oom','oom_kill','oom_group_kill'];
  if(!value||typeof value!=='object'||Array.isArray(value)||!keys.every(k=>Object.hasOwn(value,k))||
    !Object.keys(value).every(k=>keys.includes(k)||k==='postFailureMemoryStat'||k==='capacityMeasurement'||k==='end500CapacityTrace'||k==='hostCapacityBudget'||k==='hostCapacitySafetyObserved'||k==='hostCapacityObservation')||
    typeof value.lastReadbackValid!=='boolean')return null;
  if(keys.filter(k=>!['lastReadbackValid','events'].includes(k)).some(k=>!Number.isSafeInteger(value[k])||value[k]<0))return null;
  if(!value.events||typeof value.events!=='object'||Array.isArray(value.events)||
    Object.keys(value.events).sort().join(',')!==[...events].sort().join(',')||
    events.some(k=>!Number.isSafeInteger(value.events[k])||value.events[k]<0))return null;
  const out=Object.fromEntries(keys.map(k=>[k,value[k]])),detail=value.postFailureMemoryStat;
  const hostBudget=Object.hasOwn(value,'hostCapacityBudget')?require('../w15-isolated/capacity-trace').closedHostBudget(value.hostCapacityBudget):null;
  const boundHost=hostBudget&&hostBudget.hardLimitBytes===value.configuredLimitBytes?hostBudget:null;
  if(boundHost){
    out.hostCapacityBudget=boundHost;
    const observation=require('../w15-isolated/capacity-trace').closedHostObservation(value.hostCapacityObservation,boundHost);
    if(observation)out.hostCapacityObservation=observation;
    if(value.hostCapacitySafetyObserved===false||value.hostCapacitySafetyObserved===true&&observation?.status==='PASS')
      out.hostCapacitySafetyObserved=value.hostCapacitySafetyObserved;
  }
  const categories=['anon','file','kernel','shmem','file_dirty','file_writeback'];
  if(value.lastReadbackValid===false&&detail&&typeof detail==='object'&&!Array.isArray(detail)&&
    Object.keys(detail).sort().join(',')===[...categories,'observedAfterFailure','peakCompositionKnown'].sort().join(',')&&
    detail.observedAfterFailure===true&&detail.peakCompositionKnown===false&&
    categories.every(k=>Number.isSafeInteger(detail[k])&&detail[k]>=0||detail[k]==='UNKNOWN'))
    out.postFailureMemoryStat=Object.fromEntries([...categories,'observedAfterFailure','peakCompositionKnown'].map(k=>[k,detail[k]]));
  if(boundHost||value.configuredLimitBytes===4999999488){
    const capacity=closedCapacityMeasurement(value.capacityMeasurement);
    if(capacity)out.capacityMeasurement=capacity;
    if(Object.hasOwn(value,'end500CapacityTrace')){
      const trace=require('../w15-isolated/capacity-trace').closed(value.end500CapacityTrace,boundHost||undefined);
      if(trace)out.end500CapacityTrace=trace;
    }
  }
  return out;
}
function closedMaterialsWorker(value){
  const keys=['status','mode','exactCommit','runId','runAttempt','nonce','contract','materialsCompleted','firstFailure',
    'activeProfiles','profiles','units','providerPhases','profileFieldsUnchanged','ownedContainerStopped','watchClosed',
    'evidence','executionAuthority','mock500Acceptance','end500Acceptance','productionAcceptance','backupRoundtripVerified','retryAllowed'];
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==[...keys].sort().join(',')||
     value.status!=='PASS_MATERIALS_DIAGNOSTIC_CLOSED_ONLY_NOT_MOCK500'||value.mode!=='mock500-materials-diagnostic-gated'||
     value.contract!=='helmut-w15-mock500-materials-diagnostic/1'||typeof value.materialsCompleted!=='boolean'||
     value.profiles!==500||value.activeProfiles!==0||value.units!==0||value.providerPhases!==0||
     !['profileFieldsUnchanged','ownedContainerStopped','watchClosed'].every(k=>value[k]===true)||
     !['executionAuthority','mock500Acceptance','end500Acceptance','productionAcceptance','backupRoundtripVerified','retryAllowed'].every(k=>value[k]===false))return null;
  const first=value.firstFailure;
  if(value.materialsCompleted){if(first!==null)return null;}
  else if(!closedMaterialsFailure(first))return null;
  const e=value.evidence,ek=['schema','status','scope','artifactId','cipherBytes','cipherSHA256','retentionDays','maximumStorageUSD',
    'remoteReadbackObserved','authenticatedReadbackObserved','acceptedAsCompleteBackup','mock500Acceptance','productionAcceptance','executionAuthority','retryAllowed'];
  if(!e||Object.keys(e).sort().join(',')!==[...ek].sort().join(',')||e.schema!=='helmut-w15-materials-diagnostic-evidence/1'||
    e.status!=='PASS_PRIVATE_MATERIALS_EVIDENCE_ONLY'||e.scope!=='ISOLATED_GITHUB_MOCK500_MATERIALS_DIAGNOSTIC_ONLY'||
    !Number.isSafeInteger(e.artifactId)||e.artifactId<1||!Number.isSafeInteger(e.cipherBytes)||e.cipherBytes<1||e.cipherBytes>1048576||
    typeof e.cipherSHA256!=='string'||!(/^[a-f0-9]{64}$/.test(e.cipherSHA256))||e.retentionDays!==1||e.maximumStorageUSD!=='0.05'||
    e.remoteReadbackObserved!==true||e.authenticatedReadbackObserved!==true||
    !['acceptedAsCompleteBackup','mock500Acceptance','productionAcceptance','executionAuthority','retryAllowed'].every(k=>e[k]===false))return null;
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
    {input,env:process.env,encoding:'utf8',maxBuffer:1024*1024,timeout:(synthetic?420:mode==='mock500-materials-diagnostic-gated'?1140:12720)*1000});
  const receipt=JSON.parse(result.stdout);
  if(result.error||result.status!==0){
    const phases=['arguments','event','approval','qualification','binding','resources','synthetic',
      'receive-prepare','restore','mock500','backup','closure','parent','service','staging','worker','ipc'];
    phases.push(...['binding','workspace','stage-sources','input-context','container-create',
      'container-start','supervisor-start','database-readiness','database-restore',
      'database-baseline','runtime-context','setup','gateway-start','materials',
      'materials-copy-processing','materials-copy-command','materials-copy-fixtures','materials-copy-audit',
      'atomic-bootstrap','prepare','run','zero-audit','services','result-readback',
      'backup','owned-close','supervisor-stop','gateway-client-close','gateway-log-close',
      'final-observation'].map(value=>'mock500-controller-'+value));
    phases.push(...['arguments','binding','private-inputs','key-import','outer-index','original-download',"original-download-expired","original-download-http","original-download-timeout","original-download-integrity","original-download-guard","original-download-io","original-download-interrupted","original-download-unknown",
      'original-reception','original-relocation','asset-download','asset-reception','asset-readback','agent-close',
       ...['arguments','cipher','recipient','destination','decrypt','gzip','archive','manifest','files','integrity','readback','cleanup'].map(p=>'archive-'+p)]
      .map(value=>'mock-receiver-'+value));
    phases.push(...['entry','baseline','config','originals','qualified','original-upacket','calendar','native-inputs','snapshot','native-manifest','activation','builder','output','complete'].map(value=>'mock500-controller-materials-'+value));
    if(receipt.status!=='FAIL_OR_BLOCKED_MOCK500_WORKFLOW'||!phases.includes(receipt.phase)
      ||receipt.executionAuthority!==false||receipt.retryAllowed!==false)throw Error('receipt');
    const safe={status:receipt.status,phase:receipt.phase,executionAuthority:false,retryAllowed:false};
    if(receipt.worker&&Object.keys(receipt.worker).every(k=>['phase','memory'].includes(k))&&phases.includes(receipt.worker.phase)){
      safe.worker={phase:receipt.worker.phase};
      const memory=closedFailureMemory(receipt.worker.memory);if(memory)safe.worker.memory=memory;
    }
    const runner=closedRunnerDetail(receipt.runner);
    if(runner){if(safe.worker?.phase!=='mock500-controller-prepare')delete runner.prepareFailure;safe.runner=runner;}
    const cleanup=closedCleanup(receipt.cleanup);if(cleanup)safe.cleanup=cleanup;
    console.log(JSON.stringify(safe));process.exitCode=1;return;
  }
  if(mode==='mock500-materials-diagnostic-gated'){
    const worker=closedMaterialsWorker(receipt.workerResult),cap=require('../w15-isolated/capacity-trace');
    const budget=cap.closedHostBudget(receipt.hostCapacityBudget);
    if(receipt.status!=='PASS_FRESH_MATERIALS_DIAGNOSTIC_OWNED_LIFETIME_ONLY'||receipt.mode!==mode||
       !budget||!cap.closedHostAdmission(receipt.hostCapacityAdmission,budget)||!worker||
       !closedCleanup(receipt.cleanup)||Object.values(receipt.cleanup).some(v=>v!=='PASS')||
       worker.exactCommit!==request.exactCommit||worker.runId!==request.runId||worker.nonce!==request.nonce||
       worker?.mode!==mode||worker.status!=='PASS_MATERIALS_DIAGNOSTIC_CLOSED_ONLY_NOT_MOCK500'||
       worker.activeProfiles!==0||worker.units!==0||worker.providerPhases!==0||
       worker.mock500Acceptance!==false||worker.backupRoundtripVerified!==false)throw Error('receipt');
    console.log(JSON.stringify(receipt));
    if(worker.materialsCompleted!==true)process.exitCode=1;return;
  }
  const expected=mode==='mock500-full-host-functional-gated'?'PASS_FRESH_MOCK500_HOST_FUNCTIONAL_RUNNER_OWNED_LIFETIME_ONLY':mode==='mock500-full-functional-gated'?'PASS_FRESH_MOCK500_FUNCTIONAL_RUNNER_OWNED_LIFETIME_ONLY':mode==='mock500-full-phased-gated'?'PASS_FRESH_MOCK500_PHASED_RUNNER_OWNED_LIFETIME_ONLY':'PASS_FRESH_MOCK500_RUNNER_OWNED_LIFETIME_ONLY';
  if(receipt.status!==expected)throw Error('receipt');
  if(mode==='mock500-full-host-functional-gated'){
    const cap=require('../w15-isolated/capacity-trace');
    const budget=cap.closedHostBudget(receipt.hostCapacityBudget);
    const admission=budget&&cap.closedHostAdmission(receipt.hostCapacityAdmission,budget);
    if(!budget||!admission||receipt.mode!==mode||receipt.functionalContract!=='helmut-w15-mock500-host-functional/1'||
       receipt.legacyRegularMemoryAccepted!==false||receipt.providerResourceAccepted!==false||
       !receipt.hostFunctionalObservation||receipt.hostFunctionalObservation.resourceContract!=='helmut-w15-mock500-host-functional/1')throw Error('receipt');
    receipt.hostCapacityBudget=budget;receipt.hostCapacityAdmission=admission;
    const observed=require('../w15-isolated/functional-resources').closed(receipt.workerResult?.functionalResourceObservation,budget);
    if(observed===null)throw Error('receipt');receipt.workerResult.functionalResourceObservation=observed;
  }
  if(mode==='mock500-full-functional-gated'){
    if(!receipt.workerResult||typeof receipt.workerResult!=='object')throw Error('receipt');
    const observed=require('../w15-isolated/functional-resources').closed(receipt.workerResult.functionalResourceObservation);
    receipt.workerResult.functionalResourceObservation=observed===null?'UNKNOWN':observed;
  }
  console.log(JSON.stringify(receipt));
}
try{main();}catch(_){console.log('{"status":"FAIL_OR_BLOCKED_MOCK500_ACTION","executionAuthority":false}');process.exitCode=1;}
