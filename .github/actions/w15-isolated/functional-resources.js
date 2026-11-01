'use strict';
// Closed numeric observations only. Never provider, RAM-contract or run authority.
const TOP=('schema resourceContract memoryProfile sampleCount firstKernel lastKernel components componentPSSMaxima snapshotAtomic peakCompositionKnown fileCacheAdditiveToPSS differentTimeMaximaAdditive applicationWithTestDriverCombined providerResourceAccepted fullLifetimeClosureAccepted executionAuthority').split(' ');
const KEYS=new Set(('memory currentBytes kernelLifetimePeakBytes maximumBytes swapCurrentBytes swapMaximumBytes memoryEvents low high max oom oom_kill oom_group_kill memoryStat anon file kernel shmem file_dirty file_writeback cpuStat usage_usec user_usec system_usec nr_periods nr_throttled throttled_usec cpuMaximum quotaUsec periodUsec effectiveCpuset memoryPressure cpuPressure some full avg10 avg60 avg300 total status common configuredLimitBytes swapMaximumBytes roles postgresql helmut-node postgrest controller-helpers backup unknown observedPSSBytes completeComponentPSSBytes sameParentIdentityObserved pidInventoryStable allObservedProcessesBound allDeclaredProcessesObserved uniqueObservedPids roleBindingCollisions snapshotAtomic fileCacheAdditiveToPSS peakCompositionKnown hugetlbIncludedInPSS observerOverheadBytes vercelActualMemoryBytes resourceGuardAccepted executionAuthority observationElapsedNanoseconds').split(' '));
const TEXT=new Set(['UNKNOWN','UNLIMITED','NOT_GUARANTEED','UNKNOWN_OPTIONAL_MEMORY_DIAGNOSTIC','OBSERVED_OPTIONAL_MEMORY_DIAGNOSTIC','PARTIAL_OPTIONAL_MEMORY_DIAGNOSTIC']);
function closed(value,hostBudget){
  try{
    if(value==='UNKNOWN')return value;
    const hosted=hostBudget!==undefined;
    if(hosted){
      const checked=require('./capacity-trace').closedHostBudget(hostBudget);
      if(!checked||!value?.hostCapacityBudget||Object.keys(value.hostCapacityBudget).length!==Object.keys(checked).length||
         Object.entries(checked).some(([k,v])=>value.hostCapacityBudget[k]!==v))return null;
    }
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==[...TOP,...(hosted?['hostCapacityBudget']:[])].sort().join(',')||
       value.schema!==(hosted?'helmut-w15-mock500-host-resource-observation/1':'helmut-w15-functional-resource-observation/1')||
       value.resourceContract!==(hosted?'helmut-w15-mock500-host-functional/1':'helmut-w15-isolated-functional/1')||
       !(hosted?value.memoryProfile==='helmut-w15-mock500-host-functional/1':['helmut-w15-end500-functional/1','helmut-w15-mock500-functional/1'].includes(value.memoryProfile))||
       !Number.isSafeInteger(value.sampleCount)||value.sampleCount<0||
       ['snapshotAtomic','peakCompositionKnown','fileCacheAdditiveToPSS','differentTimeMaximaAdditive','providerResourceAccepted','fullLifetimeClosureAccepted','executionAuthority'].some(k=>value[k]!==false)||
       value.applicationWithTestDriverCombined!==true)return null;
    function safe(x,key='',depth=0){
      if(depth>10)return false;
      if(typeof x==='boolean')return true;
      if(typeof x==='number')return Number.isSafeInteger(x)&&x>=0 || hosted&&['avg10','avg60','avg300'].includes(key)&&Number.isFinite(x)&&x>=0&&x<=100;
      if(typeof x==='string')return TEXT.has(x)||(key==='effectiveCpuset'&&x.length<=256&&/^[0-9]+(?:-[0-9]+)?(?:,[0-9]+(?:-[0-9]+)?)*$/.test(x));
      return x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length<=64&&
        Object.entries(x).every(([k,y])=>KEYS.has(k)&&safe(y,k,depth+1));
    }
    if(!['firstKernel','lastKernel','components','componentPSSMaxima'].every(k=>safe(value[k])))return null;
    // These flags are observations, not an opportunity to manufacture acceptance.
    if(value.components!=='UNKNOWN'&&['resourceGuardAccepted','executionAuthority','snapshotAtomic','fileCacheAdditiveToPSS','peakCompositionKnown'].some(k=>value.components[k]!==false))return null;
    return JSON.parse(JSON.stringify(value));
  }catch(_){return null;}
}
module.exports={closed};
