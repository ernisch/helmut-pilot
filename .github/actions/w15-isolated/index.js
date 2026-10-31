'use strict';
function closedPhaseObservation(value){
  if(value==='UNKNOWN')return value;
  const phases=new Set(['capacity-transport-complete','capacity-materialization','capacity-restore-ready','capacity-seed','capacity-seed-ready','capacity-auth-cas','capacity-native-audit','capacity-export','capacity-processing-stopped',"approval","arguments","backup","backup-authenticate","backup-collect","backup-export","backup-freeze","backup-postcheck","backup-recovery","backup-seal","backup-transport","binding","closure","connection-backup","connection-backup-authenticate","connection-backup-collect","connection-backup-export","connection-backup-freeze","connection-backup-postcheck","connection-backup-recovery","connection-backup-seal","connection-backup-transport","connection-binding","connection-cache","connection-closure","connection-container-start","connection-export-backup-after","connection-export-backup-before","connection-export-backup-dump","connection-export-backup-roles","connection-input-binding","connection-materialization","connection-native-restore","connection-prepare","connection-prepared-check","connection-readiness","connection-receive","connection-restore","connection-restore-apply","connection-restore-check","connection-restore-create","connection-restore-render","connection-restore-roles","end500","event","qualification","receive-prepare","receiver-agent-close","receiver-arguments","receiver-authenticated-reception","receiver-cipher-readback","receiver-disk-admission","receiver-download","receiver-encrypted-index","receiver-index","receiver-key-import","receiver-private-inputs","receiver-relocation","receiver-source-binding","resources","restore","synthetic"]);
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).sort().join(',')!=='meaning,name,sequence'||!phases.has(value.name)||
    !Number.isInteger(value.sequence)||value.sequence<1||value.sequence>128||
    value.meaning!=='ENTERED_NOT_COMPLETED')return null;
  return {name:value.name,sequence:value.sequence,meaning:'ENTERED_NOT_COMPLETED'};
}
function closedRunnerDetail(value){
  const reasons=new Set(['PARENT_READBACK_REJECTED','SUPERVISOR_DEADLINE','SUPERVISOR_INTERRUPTED','SUPERVISOR_REJECTED',
    'WORKER_START_REJECTED','WORKER_SETUP_REJECTED','WORKER_INTERRUPTED','WORKER_RESULT_REJECTED','WORKER_CLEANUP_UNCONFIRMED',
    'WORKER_IPC_EOF','WORKER_IPC_TIMEOUT','WORKER_IPC_REJECTED','WORKER_EXIT_WITHOUT_REPORT','WORKER_SIGNAL_EXIT',
    'WORKER_EXIT_REJECTED','WORKER_REPORTED_FAILURE','SERVICE_IPC_EOF','SERVICE_IPC_TIMEOUT','SERVICE_IPC_REJECTED',
    'SERVICE_EXIT_WITHOUT_REPORT','SERVICE_EXIT_REJECTED','PARENT_CLOSURE_REJECTED','CLEANUP_UNCONFIRMED','SIGNAL_DURING_CLEANUP']);
  if(!value||typeof value!=='object'||Array.isArray(value)||!reasons.has(value.reason)||
    !Object.keys(value).every(k=>['reason','secondaryReason','memory','memorySource','workerExitCode','serviceExitCode','lastObservedPhase'].includes(k)))return null;
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
  return out;
}
function closedCleanup(value){
  const keys=['workerExited','workerIPCClosed','parentStopRequested','parentEmpty','parentUnitRemoved',
    'serviceLauncherExited','launcherListenerClosed','launcherSignalsRestored'];
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==[...keys].sort().join(',')||
    !keys.every(k=>['PASS','FAIL','UNKNOWN'].includes(value[k])))return null;
  return Object.fromEntries(keys.map(k=>[k,value[k]]));
}
function closedCapacityMeasurement(v){
  const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===[...keys].sort().join(',');
  const integer=n=>Number.isSafeInteger(n)&&n>=0;
  const cats=['anon','file','kernel','shmem','file_dirty','file_writeback'];
  const amounts=o=>exact(o,cats)&&cats.every(k=>integer(o[k])||o[k]==='UNKNOWN');
  const keys=['schema','diagnosticOnly','legacyPeakLimitBytes','legacyPeakExceeded','legacyContractAccepted',
    'sampleCount','maximumObservedCurrentBytes','categoryMaxima','last','phaseObservations'];
  if(!exact(v,keys)||v.schema!=='helmut-w15-full-restore-capacity-measurement/1'||v.diagnosticOnly!==true||
    v.legacyPeakLimitBytes!==2048000000||typeof v.legacyPeakExceeded!=='boolean'||v.legacyContractAccepted!==false||
    !integer(v.sampleCount)||v.sampleCount<1||!integer(v.maximumObservedCurrentBytes)||!amounts(v.categoryMaxima))return null;
  const last=v.last;
  if(!exact(last,['hostAvailableBytes','memoryStat','memoryPressure','observedMonotonicNS','peakCompositionKnown'])||
    !(integer(last.hostAvailableBytes)||last.hostAvailableBytes==='UNKNOWN')||!amounts(last.memoryStat)||
    !integer(last.observedMonotonicNS)||last.peakCompositionKnown!==false)return null;
  if(last.memoryPressure!=='UNKNOWN'){
    if(!exact(last.memoryPressure,['some','full']))return null;
    for(const row of Object.values(last.memoryPressure))if(!exact(row,['avg10','avg60','avg300','total'])||
      !integer(row.total)||!['avg10','avg60','avg300'].every(k=>integer(row[k])&&row[k]<=10000))return null;
  }
  if(!Array.isArray(v.phaseObservations)||v.phaseObservations.length>128)return null;
  let previous=0;
  for(const row of v.phaseObservations){
    if(!exact(row,['name','sequence','meaning','observedKernelPeakBytes','observedCurrentBytes'])||
      !closedPhaseObservation({name:row.name,sequence:row.sequence,meaning:row.meaning})||row.sequence<=previous||
      !integer(row.observedKernelPeakBytes)||!integer(row.observedCurrentBytes))return null;
    previous=row.sequence;
  }
  if(JSON.stringify(v).length>32768)return null;
  return JSON.parse(JSON.stringify(v));
}
function closedFailureMemory(value){
  const keys=['configuredLimitBytes','kernelLifetimePeakBytes','currentBytes','swapMaximumBytes','swapCurrentBytes','lastReadbackValid','events'];
  const events=['max','oom','oom_kill','oom_group_kill'];
  if(!value||typeof value!=='object'||Array.isArray(value)||!keys.every(k=>Object.hasOwn(value,k))||
    !Object.keys(value).every(k=>keys.includes(k)||k==='postFailureMemoryStat'||k==='capacityMeasurement'||k==='end500CapacityTrace')||
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
  if(value.configuredLimitBytes===4999999488){
    const capacity=closedCapacityMeasurement(value.capacityMeasurement);
    if(capacity)out.capacityMeasurement=capacity;
    if(Object.hasOwn(value,'end500CapacityTrace')){
      const trace=require('./capacity-trace').closed(value.end500CapacityTrace);
      if(trace)out.end500CapacityTrace=trace;
    }
  }
  return out;
}
// Runtime artifact credentials exist in JavaScript actions. They travel only
// through private stdin, never shell expansion, arguments or public outputs.
const fs = require('node:fs');
const cp = require('node:child_process');
const KEYS = ['ACTIONS_RUNTIME_TOKEN','ACTIONS_RESULTS_URL','ACTIONS_RUNTIME_URL',
  'GITHUB_TOKEN','GITHUB_API_URL','GITHUB_SERVER_URL','GITHUB_REPOSITORY','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT'];
function main() {
  const mode = process.env.W15_MODE;
  const synthetic = mode === 'end500-restore-synthetic';
  const diagnostic = mode === 'end500-restore-export-diagnostic';
  const declared = JSON.parse(process.env.W15_REQUEST || '{}');
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const privatePayload = synthetic ? {} : {
    cipherIndex: process.env.HELMUT_W15_CIPHER_INDEX_GPG,
    keyB64: process.env.HELMUT_W15_RECEIVER_PROTECTED_KEY_B64,
    passphrase: process.env.HELMUT_W15_RECEIVER_PASSPHRASE,
    eventInputs: event.inputs,
    artifactCredentials: diagnostic ? {} : Object.fromEntries(KEYS.filter(k => process.env[k]).map(k => [k,process.env[k]]))
  };
  for (const key of ['HELMUT_W15_CIPHER_INDEX_GPG','HELMUT_W15_RECEIVER_PROTECTED_KEY_B64',
    'HELMUT_W15_RECEIVER_PASSPHRASE',...KEYS.filter(k => k.includes('TOKEN'))]) delete process.env[key];
  const request = {schema:'helmut-w15-runner-request/1', mode,
    exactCommit:process.env.EXPECTED_COMMIT, runId:process.env.GITHUB_RUN_ID,
    runAttempt:Number(process.env.GITHUB_RUN_ATTEMPT), branch:process.env.GITHUB_REF,
    nonce:declared.nonce, imageId:process.env.W15_IMAGE_ID,
    nodeSource:process.env.W15_NODE_SOURCE, postgrestSource:process.env.W15_POSTGREST_SOURCE,
    sourceQualification:declared.sourceQualification, approval:declared.approval,
    limits:declared.limits, maximumWallSeconds:declared.maximumWallSeconds};
  if (synthetic) {
    const inputs=event.inputs || {};
    let declarationMatches=false;
    try {
      const eventDeclared=JSON.parse(inputs.w15_request);
      declarationMatches=Object.keys(declared).length===Object.keys(eventDeclared).length
        && Object.keys(declared).every(k=>JSON.stringify(declared[k])===JSON.stringify(eventDeclared[k]));
    } catch (_) {}
    console.log(JSON.stringify({status:'PUBLIC_SYNTHETIC_EVENT_OBSERVATION',
      inputCount:Object.keys(inputs).length,
      exactInputSet:JSON.stringify(Object.keys(inputs).sort())===JSON.stringify(['expected_commit','w15_cipher_index','w15_mode','w15_request']),
      inputsAreStrings:Object.values(inputs).every(v=>typeof v==='string'),
      modeMatches:inputs.w15_mode===mode,commitMatches:inputs.expected_commit===request.exactCommit,
      declarationMatches,cipherEmpty:inputs.w15_cipher_index===''}));
  }
  const input = JSON.stringify({request,privatePayload});
  if (Buffer.byteLength(input) > 1024*1024) throw Error('bound');
  const result = cp.spawnSync('/usr/bin/python3', ['-B','scripts/w15-github/restore_workflow.py','--launch'],
    {input, encoding:'utf8', env:process.env, maxBuffer:1024*1024,
     timeout:(synthetic ? 420 : ['end500-full-gated','end500-full-phased-gated','end500-full-capacity-diagnostic'].includes(mode) ? 3720 : 1920)*1000});
  if (result.error || result.status !== 0) {
    const failed = JSON.parse(result.stdout);
    const phases = ['arguments','event','approval','qualification','binding','resources','synthetic',
      'receive-prepare','restore','end500','backup','closure','parent','service','staging','worker','ipc',
      'connection-binding','connection-receive','connection-input-binding','connection-cache',
      'connection-prepare','connection-restore','connection-closure','receiver-arguments',
      'connection-prepared-check','connection-materialization','connection-container-start',
      'connection-readiness','connection-native-restore','connection-backup',
      ...['backup-before','backup-dump','backup-roles','backup-after'].map(p=>'connection-export-'+p),
      ...['restore-create','restore-roles','restore-render','restore-apply','restore-check'].map(p=>'connection-'+p),
      ...['backup-export','backup-freeze','backup-collect','backup-seal','backup-transport',
        'backup-authenticate','backup-recovery','backup-postcheck'].flatMap(p=>[p,'connection-'+p]),
      'receiver-source-binding','receiver-private-inputs','receiver-index','receiver-disk-admission',
      'receiver-key-import','receiver-encrypted-index','receiver-download','receiver-cipher-readback',
      'receiver-authenticated-reception','receiver-relocation','receiver-agent-close'];
    if (failed.status !== 'FAIL_W15_ISOLATED_WORKFLOW' || !phases.includes(failed.phase)
      || failed.executionAuthority !== false || failed.retryAllowed !== false) throw Error('receipt');
    const safe = {status:failed.status,phase:failed.phase,executionAuthority:false,retryAllowed:false};
    if (failed.worker && Object.keys(failed.worker).every(k=>['phase','memory'].includes(k)) && phases.includes(failed.worker.phase)) {
      safe.worker={phase:failed.worker.phase};
      const memory=closedFailureMemory(failed.worker.memory);
      if(memory)safe.worker.memory=memory;
    }
    const runner=closedRunnerDetail(failed.runner);if(runner)safe.runner=runner;
    const cleanup=closedCleanup(failed.cleanup);if(cleanup)safe.cleanup=cleanup;
    console.log(JSON.stringify(safe)); process.exitCode=1; return;
  }
  // The Python boundary emits one strictly bounded public receipt.
  const receipt = JSON.parse(result.stdout);
  console.log(JSON.stringify(receipt));
}
try { main(); } catch (_) { console.log('{"status":"FAIL_OR_BLOCKED_W15_ISOLATED_JOB"}'); process.exitCode=1; }
