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
const TEXT = new Set([...KEYS,...Object.values(FIXED).filter(v=>typeof v==='string'),
  'UNKNOWN','EXACT','CONFIRMED_LOWER_BOUND','COMPLETE','ENTERED_NOT_COMPLETED',
  'PASS_OBSERVED_CAPACITY_SAFETY_ONLY','FAIL_OR_UNKNOWN',
  'LAST_EXISTING_GUARD_SAMPLE_NOT_SIMULTANEOUS_MEASUREMENT','GUARD_SAMPLE_OBSERVED','CONFIRMED_PROGRESS_RECEIVED']);
const PHASES = new Set(('arguments event approval qualification binding resources synthetic receive-prepare restore end500 backup closure capacity-transport-complete capacity-materialization capacity-restore-ready capacity-seed capacity-seed-ready capacity-auth-cas capacity-native-audit capacity-export capacity-processing-stopped').split(' '));
for(const s of 'binding receive input-binding cache prepare restore closure prepared-check materialization container-start readiness native-restore backup restore-create restore-roles restore-render restore-apply restore-check export-backup-before export-backup-dump export-backup-roles export-backup-after'.split(' '))PHASES.add('connection-'+s);
for(const s of 'arguments source-binding private-inputs index disk-admission key-import encrypted-index download cipher-readback authenticated-reception relocation agent-close'.split(' '))PHASES.add('receiver-'+s);
for(const s of 'backup-export backup-freeze backup-collect backup-seal backup-transport backup-authenticate backup-recovery backup-postcheck'.split(' ')){PHASES.add(s);PHASES.add('connection-'+s);}
for(const s of PHASES)TEXT.add(s);
for(const k of ['authCAS','usageRows','nativePostimages'])for(const suffix of ['Value','Kind'])TEXT.add(k+suffix);
function closed(v){
  try{
    if(!v||typeof v!=='object'||Array.isArray(v)||JSON.stringify(v).length>20480)return null;
    if(Object.entries(FIXED).some(([k,val])=>v[k]!==val))return null;
    let count=0;
    function safe(x,depth){
      if(++count>20000||depth>12)return false;
      if(typeof x==='boolean')return true;
      if(typeof x==='number')return Number.isSafeInteger(x)&&x>=0;
      if(typeof x==='string')return TEXT.has(x);
      if(Array.isArray(x))return x.length<=151&&x.every(y=>safe(y,depth+1));
      return x&&typeof x==='object'&&Object.keys(x).length<=64&&Object.entries(x).every(([k,y])=>KEYS.has(k)&&safe(y,depth+1));
    }
    if(!safe(v,0))return null;
    return JSON.parse(JSON.stringify(v));
  }catch(_){return null;}
}
module.exports={closed};
