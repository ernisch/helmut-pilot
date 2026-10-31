'use strict';
// Execute only invented failed-action responses; no child, API, file or secret read.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const categories=['anon','file','kernel','shmem','file_dirty','file_writeback'];
const core={configuredLimitBytes:2560000000,kernelLifetimePeakBytes:2048073728,currentBytes:2047098880,
  swapMaximumBytes:0,swapCurrentBytes:0,lastReadbackValid:false,events:{max:0,oom:0,oom_kill:0,oom_group_kill:0}};
const detail={...Object.fromEntries(categories.map((k,i)=>[k,(i+1)*1000])),observedAfterFailure:true,peakCompositionKnown:false};
const cleanup=Object.fromEntries(['workerExited','workerIPCClosed','parentStopRequested','parentEmpty','parentUnitRemoved',
  'serviceLauncherExited','launcherListenerClosed','launcherSignalsRestored'].map(k=>[k,'UNKNOWN']));
function run(action,memory){
  const output=[],status=action==='w15-isolated'?'FAIL_W15_ISOLATED_WORKFLOW':'FAIL_OR_BLOCKED_MOCK500_WORKFLOW';
  const phase=action==='w15-isolated'?'connection-backup-collect':'backup';
  const failed={status,phase:'worker',worker:{phase,memory},
    runner:{reason:'PARENT_READBACK_REJECTED',memory,memorySource:'CURRENT_REJECTED_READBACK'},
    cleanup,executionAuthority:false,retryAllowed:false,message:'FICTIONAL_PRIVATE_CANARY'};
  const context={Buffer,console:{log:line=>output.push(JSON.parse(line))},process:{exitCode:0,
      env:{W15_MODE:action==='w15-isolated'?'end500-restore-gated':'mock500-full-gated',W15_REQUEST:'{}',GITHUB_EVENT_PATH:'/FICTIONAL/event'}},
    require:name=>{
      if(name==='node:fs')return{readFileSync:()=>' {"inputs":{"w15_request":"{}"}}'};
      if(name==='node:child_process')return{spawnSync:()=>({status:1,stdout:JSON.stringify(failed)})};
      throw Error('NO_OTHER_IMPORT');}};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../.github/actions',action,'index.js'),'utf8'),context,{timeout:1000});
  assert.equal(context.process.exitCode,1);assert.equal(output.length,1);
  const value=output[0];assert.equal(value.status,status);assert.equal(value.phase,'worker');
  assert.equal(value.worker.phase,phase);assert.deepEqual(value.cleanup,cleanup);
  assert.equal(value.executionAuthority,false);assert.equal(value.retryAllowed,false);
  assert(!JSON.stringify(value).includes('FICTIONAL_PRIVATE_CANARY'));
  return value;
}
let groups=0;
for(const action of ['w15-isolated','w15-mock500']){
  for(const memory of [core,{...core,postFailureMemoryStat:detail},
    {...core,postFailureMemoryStat:{...detail,...Object.fromEntries(categories.map(k=>[k,'UNKNOWN']))}}]){
    const result=run(action,memory);assert.deepEqual(result.worker.memory,memory);assert.deepEqual(result.runner.memory,memory);
  }
  groups++;
  for(const invalid of [null,[],false,'FICTIONAL_PRIVATE_CANARY',{...detail,anon:true},{...detail,file:-1},
    {...detail,kernel:2**53},{...detail,shmem:1.5},{...detail,file_dirty:'FICTIONAL_PRIVATE_CANARY'},
    {...detail,file_writeback:null},{...detail,privatePath:'FICTIONAL_PRIVATE_CANARY'},
    {...detail,observedAfterFailure:false},{...detail,peakCompositionKnown:true}]){
    const result=run(action,{...core,postFailureMemoryStat:invalid});
    assert.deepEqual(result.worker.memory,core);assert.deepEqual(result.runner.memory,core);
  }
  groups++;
  const validCore={...core,lastReadbackValid:true};
  const result=run(action,{...validCore,postFailureMemoryStat:detail});
  assert.deepEqual(result.worker.memory,validCore);assert.deepEqual(result.runner.memory,validCore);groups++;
  for(const invalidCore of [{...core,currentBytes:true},{...core,events:{...core.events,private:'FICTIONAL_PRIVATE_CANARY'}},
    {...core,privatePath:'FICTIONAL_PRIVATE_CANARY'}]){
    const result=run(action,{...invalidCore,postFailureMemoryStat:detail});
    assert.equal(result.worker.memory,undefined);assert.equal(result.runner,undefined);
  }
  groups++;
}
console.log(JSON.stringify({status:'PASS_CLOSED_POST_FAILURE_MEMORY_STAT_PROJECTION_ONLY',groups,
  originalDataRead:false,childProcessStarted:false,executionAuthority:false}));
