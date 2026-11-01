'use strict';
// The Python collector performs the full schema validation. This second closed
// public boundary permits only fixed technical labels and bounded numbers.
// No path, argv, credentials, SQL, process name or free text can pass it.
const KEYS = new Set(('schema mode scope profile diagnosticOnly executionAuthority legacyContractAccepted end500Acceptance productionAcceptance hardLimitBytes minimumHostReserveBytes legacyPeakScope legacyPeakLimitBytes legacyPeakExceeded sampleCount kernelLifetimePeakBytes kernelPeakOccurrenceTime kernelPeakFirstObserved maximumObservedCurrent first last categoryOrder categoryMaxima componentPSSMaxima phasePointColumns phaseObservations phaseCoverage seriesColumns history historyDecimated observedHistoryStride progress kernelPeakMonotonic observedTimeMonotonic phaseSequenceMonotonic anyCapacitySafetyFailureOrUnknown capacitySafetyFailureOrUnknownCount firstCapacitySafetyFailureOrUnknown peakCompositionKnown snapshotAtomic fileCacheAdditiveToPSS snapshots sampleNumber observedMonotonicNS phase currentBytes configuredLimitBytes swapMaximumBytes swapCurrentBytes events hostAvailableBytes memoryStat memoryPressure componentPSSBytes capacitySafetyObservation name sequence meaning max oom oom_kill oom_group_kill anon file kernel shmem file_dirty file_writeback some full avg10 avg60 avg300 total postgresql helmut-node postgrest controller-helpers backup unknown authCAS usageRows nativePostimages value kind phaseSequence sampleCount categoryMaxima observed included complete first last sampleNumber progressSampleReferenceMeaning timeBasis').split(' '));
const FIXED = {
  schema:'helmut-w15-end500-capacity-trace/1', mode:'end500-full-capacity-diagnostic',
  scope:'ISOLATED_GITHUB_END500_CAPACITY_DIAGNOSTIC_ONLY', profile:'helmut-w15-end500-capacity-diagnostic/1',
  diagnosticOnly:true, executionAuthority:false, legacyContractAccepted:false, end500Acceptance:false,
  productionAcceptance:false, hardLimitBytes:4999999488, minimumHostReserveBytes:2147483648,
  legacyPeakScope:'COMMON_PARENT_LIFETIME_ALL_PHASES', legacyPeakLimitBytes:2048000000,
  kernelPeakOccurrenceTime:'UNKNOWN', peakCompositionKnown:false, snapshotAtomic:false, fileCacheAdditiveToPSS:false
};
const HOST_PROFILE='helmut-w15-end500-host-capacity-diagnostic/1';
const HOST_BUDGET_SCHEMA='helmut-w15-host-capacity-budget/1';
const LEGACY_KEYS=new Set(KEYS);
const HOST_FIXED={...FIXED,schema:'helmut-w15-end500-capacity-trace/2',
  mode:'end500-full-host-capacity-diagnostic',scope:'ISOLATED_GITHUB_END500_HOST_CAPACITY_DIAGNOSTIC_ONLY',
  profile:HOST_PROFILE,mock500Acceptance:false,providerResourceAccepted:false};
delete HOST_FIXED.hardLimitBytes;
for(const key of ['hostCapacityBudget','mock500Acceptance','providerResourceAccepted'])KEYS.add(key);
for(const key of ['hostCapacityObservation','status','minimumAncestorHeadroomBytes','requiredAncestorHeadroomBytes','ancestorIdentitiesMatch'])KEYS.add(key);
const HOST_ONLY_TEXT=new Set([...KEYS].filter(k=>!LEGACY_KEYS.has(k)).concat([
  'helmut-w15-end500-capacity-trace/2','end500-full-host-capacity-diagnostic',
  'ISOLATED_GITHUB_END500_HOST_CAPACITY_DIAGNOSTIC_ONLY',HOST_PROFILE,HOST_BUDGET_SCHEMA,
  'helmut-w15-host-capacity-reserve-observation/1','PASS','FAIL_HOST_RESERVE','FAIL_ANCESTOR_HEADROOM','UNLIMITED']));
const TEXT = new Set([...KEYS,...Object.values(FIXED).filter(v=>typeof v==='string'),
  ...Object.values(HOST_FIXED).filter(v=>typeof v==='string'),HOST_BUDGET_SCHEMA,
  'helmut-w15-host-capacity-reserve-observation/1','PASS','FAIL_HOST_RESERVE','FAIL_ANCESTOR_HEADROOM','UNLIMITED',
  'UNKNOWN','EXACT','CONFIRMED_LOWER_BOUND','COMPLETE','ENTERED_NOT_COMPLETED',
  'PASS_OBSERVED_CAPACITY_SAFETY_ONLY','FAIL_OR_UNKNOWN',
  'LAST_EXISTING_GUARD_SAMPLE_NOT_SIMULTANEOUS_MEASUREMENT','GUARD_SAMPLE_OBSERVED','CONFIRMED_PROGRESS_RECEIVED']);
const PHASES = new Set(('arguments event approval qualification binding resources synthetic receive-prepare restore end500 backup closure capacity-transport-complete capacity-materialization capacity-restore-ready capacity-seed capacity-seed-ready capacity-auth-cas capacity-native-audit capacity-export capacity-processing-stopped').split(' '));
for(const s of 'binding receive input-binding cache prepare restore closure prepared-check materialization container-start readiness native-restore backup restore-create restore-roles restore-render restore-apply restore-check export-backup-before export-backup-dump export-backup-roles export-backup-after'.split(' '))PHASES.add('connection-'+s);
for(const s of 'arguments source-binding private-inputs index disk-admission key-import encrypted-index download download-expired download-http download-timeout download-integrity download-guard download-io download-interrupted download-unknown cipher-readback authenticated-reception relocation agent-close'.split(' '))PHASES.add('receiver-'+s);
for(const s of 'backup-export backup-freeze backup-collect backup-seal backup-transport backup-authenticate backup-recovery backup-postcheck'.split(' ')){PHASES.add(s);PHASES.add('connection-'+s);}
for(const s of PHASES)TEXT.add(s);
for(const k of ['authCAS','usageRows','nativePostimages'])for(const suffix of ['Value','Kind'])TEXT.add(k+suffix);
function closedHostBudget(v){
  const keys=['schema','profile','hardLimitBytes','minimumHostReserveBytes'];
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!==[...keys].sort().join(',')||
    v.schema!==HOST_BUDGET_SCHEMA||v.profile!==HOST_PROFILE||!Number.isSafeInteger(v.hardLimitBytes)||
    v.hardLimitBytes<=0||v.hardLimitBytes>Number.MAX_SAFE_INTEGER-2147483648||v.hardLimitBytes%4096!==0||
    v.minimumHostReserveBytes!==2147483648)return null;
  return Object.fromEntries(keys.map(k=>[k,v[k]]));
}
function closedHostObservation(v,budget){
  const keys=['schema','status','hostAvailableBytes','minimumAncestorHeadroomBytes',
    'requiredAncestorHeadroomBytes','minimumHostReserveBytes','observedMonotonicNS','ancestorIdentitiesMatch'];
  const number=v=>Number.isSafeInteger(v)&&v>=0;
  const host=closedHostBudget(budget);
  if(!host||!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!==[...keys].sort().join(',')||
    v.schema!=='helmut-w15-host-capacity-reserve-observation/1'||
    !['PASS','FAIL_HOST_RESERVE','FAIL_ANCESTOR_HEADROOM','UNKNOWN'].includes(v.status)||
    !(number(v.hostAvailableBytes)||v.hostAvailableBytes==='UNKNOWN')||
    !(number(v.minimumAncestorHeadroomBytes)||['UNLIMITED','UNKNOWN'].includes(v.minimumAncestorHeadroomBytes))||
    v.requiredAncestorHeadroomBytes!==host.hardLimitBytes+host.minimumHostReserveBytes||
    v.minimumHostReserveBytes!==host.minimumHostReserveBytes||!number(v.observedMonotonicNS)||
    typeof v.ancestorIdentitiesMatch!=='boolean')return null;
  if(v.status==='PASS'&&(!v.ancestorIdentitiesMatch||!number(v.hostAvailableBytes)||v.hostAvailableBytes<host.minimumHostReserveBytes||
    v.minimumAncestorHeadroomBytes!=='UNLIMITED'&&(!number(v.minimumAncestorHeadroomBytes)||
      v.minimumAncestorHeadroomBytes<v.requiredAncestorHeadroomBytes)))return null;
  return Object.fromEntries(keys.map(k=>[k,v[k]]));
}
function closedHostAdmission(v,budget){
  const keys=['schema','profile','kernelPageBytes','hostTotalBytes','hostAvailableBytes','effectiveAvailableBytes',
    'diagnosticHardLimitBytes','minimumUnallocatedHostReserveBytes','observedMonotonicNS','parentPlacement',
    'executionAuthority','hierarchyRootProven','originalCallerConstraintsRetained','ancestorLimits'];
  const host=closedHostBudget(budget),number=v=>Number.isSafeInteger(v)&&v>=0;
  if(!host||!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!==[...keys].sort().join(',')||
    v.schema!=='helmut-w15-dynamic-host-capacity-admission/1'||v.profile!==HOST_PROFILE||v.kernelPageBytes!==4096||
    v.diagnosticHardLimitBytes!==host.hardLimitBytes||v.minimumUnallocatedHostReserveBytes!==host.minimumHostReserveBytes||
    v.parentPlacement!=='DIRECT_HIERARCHY_ROOT'||v.executionAuthority!==false||v.hierarchyRootProven!==true||
    v.originalCallerConstraintsRetained!==true||!['hostTotalBytes','hostAvailableBytes','effectiveAvailableBytes','observedMonotonicNS'].every(k=>number(v[k]))||
    v.hostAvailableBytes>v.hostTotalBytes||!Array.isArray(v.ancestorLimits)||v.ancestorLimits.length<1||v.ancestorLimits.length>64)return null;
  const finite=[];let rootCount=0;
  for(const [index,row] of v.ancestorLimits.entries()){
    if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).sort().join(',')!=='currentBytes,headroomBytes,maximumBytes')return null;
    if(row.maximumBytes==='UNLIMITED_ROOT'){
      if(row.currentBytes!=='NOT_APPLICABLE'||row.headroomBytes!=='UNLIMITED_ROOT'||index!==v.ancestorLimits.length-1)return null;
      rootCount++;
    }else if(row.maximumBytes==='UNLIMITED'){
      if(!number(row.currentBytes)||row.headroomBytes!=='UNLIMITED')return null;
    }else{
      if(!number(row.maximumBytes)||!number(row.currentBytes)||row.maximumBytes<row.currentBytes||
        row.headroomBytes!==row.maximumBytes-row.currentBytes)return null;
      finite.push(row.headroomBytes);
    }
  }
  const effective=Math.min(v.hostAvailableBytes,...finite);
  if(rootCount!==1||v.effectiveAvailableBytes!==effective||
    v.diagnosticHardLimitBytes!==Math.floor((effective-host.minimumHostReserveBytes)/4096)*4096)return null;
  return JSON.parse(JSON.stringify(v));
}
function closed(v,expectedHostBudget){
  try{
    if(!v||typeof v!=='object'||Array.isArray(v)||JSON.stringify(v).length>20480)return null;
    let fixed=FIXED,activeBudget=null;
    if(v.schema===HOST_FIXED.schema){
      const budget=closedHostBudget(v.hostCapacityBudget);
      const expected=closedHostBudget(expectedHostBudget);
      if(!budget||!expected||v.hardLimitBytes!==budget.hardLimitBytes||JSON.stringify(expected)!==JSON.stringify(budget))return null;
      fixed=HOST_FIXED;
      activeBudget=budget;
    }else if(expectedHostBudget!==undefined||['hostCapacityBudget','mock500Acceptance','providerResourceAccepted'].some(k=>Object.hasOwn(v,k)))return null;
    if(Object.entries(fixed).some(([k,val])=>v[k]!==val))return null;
    if(activeBudget){
      if(!Array.isArray(v.snapshots))return null;
      for(const row of v.snapshots){
        if(!row||typeof row!=='object'||Array.isArray(row)||
          row.hostCapacityObservation!=='UNKNOWN'&&!closedHostObservation(row.hostCapacityObservation,activeBudget))return null;
        if(row.capacitySafetyObservation==='PASS_OBSERVED_CAPACITY_SAFETY_ONLY'&&
          (row.configuredLimitBytes!==activeBudget.hardLimitBytes||row.hostCapacityObservation?.status!=='PASS'))return null;
      }
    }
    const activeKeys=activeBudget?KEYS:LEGACY_KEYS;
    let count=0;
    function safe(x,depth){
      if(++count>20000||depth>12)return false;
      if(typeof x==='boolean')return true;
      if(typeof x==='number')return Number.isSafeInteger(x)&&x>=0;
      if(typeof x==='string')return TEXT.has(x)&&(activeBudget||!HOST_ONLY_TEXT.has(x));
      if(Array.isArray(x))return x.length<=151&&x.every(y=>safe(y,depth+1));
      return x&&typeof x==='object'&&Object.keys(x).length<=64&&Object.entries(x).every(([k,y])=>activeKeys.has(k)&&safe(y,depth+1));
    }
    if(!safe(v,0))return null;
    return JSON.parse(JSON.stringify(v));
  }catch(_){return null;}
}
module.exports={closed,closedHostBudget,closedHostObservation,closedHostAdmission};
