'use strict';
function closedPhaseObservation(value){
  if(value==='UNKNOWN')return value;
  const phases=new Set(['capacity-transport-complete','capacity-materialization','capacity-restore-ready','capacity-seed','capacity-seed-ready','capacity-auth-cas','capacity-native-audit','capacity-export','capacity-processing-stopped',"approval","arguments","backup","backup-authenticate","backup-collect","backup-export","backup-freeze","backup-postcheck","backup-recovery","backup-seal","backup-transport","binding","closure","connection-backup","connection-backup-authenticate","connection-backup-collect","connection-backup-export","connection-backup-freeze","connection-backup-postcheck","connection-backup-recovery","connection-backup-seal","connection-backup-transport","connection-binding","connection-cache","connection-closure","connection-container-start","connection-export-backup-after","connection-export-backup-before","connection-export-backup-dump","connection-export-backup-roles","connection-input-binding","connection-materialization","connection-native-restore","connection-prepare","connection-prepared-check","connection-readiness","connection-receive","connection-restore","connection-restore-apply","connection-restore-check","connection-restore-create","connection-restore-render","connection-restore-roles","end500","event","qualification","receive-prepare","receiver-agent-close","receiver-arguments","receiver-authenticated-reception","receiver-cipher-readback","receiver-disk-admission","receiver-download","receiver-download-expired","receiver-download-http","receiver-download-timeout","receiver-download-integrity","receiver-download-guard","receiver-download-io","receiver-download-interrupted","receiver-download-unknown","receiver-encrypted-index","receiver-index","receiver-key-import","receiver-private-inputs","receiver-relocation","receiver-source-binding","resources","restore","synthetic"]);
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).sort().join(',')!=='meaning,name,sequence'||!phases.has(value.name)||
    !Number.isInteger(value.sequence)||value.sequence<1||value.sequence>128||
    value.meaning!=='ENTERED_NOT_COMPLETED')return null;
  return {name:value.name,sequence:value.sequence,meaning:'ENTERED_NOT_COMPLETED'};
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
module.exports={closedCapacityMeasurement};
