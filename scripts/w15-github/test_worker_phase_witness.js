'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
let groups=0;
for(const action of ['w15-isolated','w15-mock500']){
  const source=fs.readFileSync(path.resolve(__dirname,'../../.github/actions',action,'index.js'),'utf8');
  const end=source.indexOf('function closedCleanup');
  const context={};vm.createContext(context);
  vm.runInContext(source.slice(0,end),context,{timeout:1000});
  const core={reason:'PARENT_READBACK_REJECTED',memorySource:'CURRENT_REJECTED_READBACK',
    memory:{configuredLimitBytes:2560000000,kernelLifetimePeakBytes:2048000001,currentBytes:2048000001,
      swapMaximumBytes:0,swapCurrentBytes:0,lastReadbackValid:false,events:{max:0,oom:0,oom_kill:0,oom_group_kill:0},
      postFailureMemoryStat:{anon:1,file:2,kernel:3,shmem:4,file_dirty:5,file_writeback:'UNKNOWN',
        observedAfterFailure:true,peakCompositionKnown:false}}};
  // Also include the existing bounded memory sanitizer without executing main().
  const memoryStart=source.indexOf('function closedFailureMemory');
  const memoryEnd=source.indexOf('\n// Runtime artifact')>=0?source.indexOf('\n// Runtime artifact'):source.indexOf('\nconst fs=');
  vm.runInContext(source.slice(memoryStart,memoryEnd),context,{timeout:1000});
  const clone=x=>JSON.parse(JSON.stringify(x));
  for(const phase of ['backup-collect','backup-recovery','connection-restore-check','receiver-download',...['expired','http','timeout','integrity','guard','io','interrupted','unknown'].map(x=>'receiver-download-'+x)]){
    const checkpoint={name:phase,sequence:2,meaning:'ENTERED_NOT_COMPLETED'};
    assert.deepEqual(clone(context.closedRunnerDetail({...core,lastObservedPhase:checkpoint})),{...core,lastObservedPhase:checkpoint});
  }
  assert.equal(context.closedRunnerDetail({...core,lastObservedPhase:'UNKNOWN'}).lastObservedPhase,'UNKNOWN');groups++;
  for(const bad of [null,false,[],'FICTIONAL_PRIVATE',{name:'FICTIONAL_PRIVATE',sequence:1,meaning:'ENTERED_NOT_COMPLETED'},
    {name:'backup-collect',sequence:true,meaning:'ENTERED_NOT_COMPLETED'},
    {name:'backup-collect',sequence:129,meaning:'ENTERED_NOT_COMPLETED'},
    {name:'backup-collect',sequence:1,meaning:'COMPLETED'},
    {name:'backup-collect',sequence:1,meaning:'ENTERED_NOT_COMPLETED',private:'FICTIONAL_PRIVATE'}]){
    const value=clone(context.closedRunnerDetail({...core,lastObservedPhase:bad}));
    assert.deepEqual(value,core);assert(!JSON.stringify(value).includes('FICTIONAL_PRIVATE'));
  }
  groups++;
}
console.log(JSON.stringify({status:'PASS_CLOSED_PHASE_AND_KERNEL_PROJECTION_ONLY',groups,childProcesses:0,executionAuthority:false}));
