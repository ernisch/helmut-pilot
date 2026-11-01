'use strict';
// Pure output projection: fictional numbers only, no process/HTTP/database.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../../.github/actions/w15-isolated/index.js'),'utf8');
const capacity=require('../../.github/actions/w15-isolated/capacity-measurement');
const context={require:name=>{assert.equal(name,'./capacity-measurement');return capacity;}};vm.createContext(context);vm.runInContext(source.slice(0,source.indexOf('// Runtime artifact')),context,{timeout:1000});
const clone=x=>JSON.parse(JSON.stringify(x));
const cats={anon:123,file:3000000000,kernel:456,shmem:0,file_dirty:100,file_writeback:'UNKNOWN'};
const psi={some:{avg10:1,avg60:0,avg300:0,total:12},full:{avg10:0,avg60:0,avg300:0,total:4}};
const value={schema:'helmut-w15-full-restore-capacity-measurement/1',diagnosticOnly:true,
  legacyPeakLimitBytes:2048000000,legacyPeakExceeded:true,legacyContractAccepted:false,sampleCount:2,
  maximumObservedCurrentBytes:3100000000,categoryMaxima:cats,
  last:{hostAvailableBytes:8000000000,memoryStat:cats,memoryPressure:psi,observedMonotonicNS:1234,peakCompositionKnown:false},
  phaseObservations:[{name:'backup-seal',sequence:40,meaning:'ENTERED_NOT_COMPLETED',observedKernelPeakBytes:3200000000,observedCurrentBytes:3100000000}]};
const core={configuredLimitBytes:4999999488,kernelLifetimePeakBytes:3200000000,currentBytes:3100000000,
  swapMaximumBytes:0,swapCurrentBytes:0,lastReadbackValid:false,events:{max:0,oom:0,oom_kill:0,oom_group_kill:0}};
assert.deepEqual(clone(context.closedCapacityMeasurement(value)),value);
assert.deepEqual(clone(context.closedFailureMemory({...core,capacityMeasurement:value})),{...core,capacityMeasurement:value});
for(const mutate of [v=>{v.private='FICTIONAL_PRIVATE';},v=>{v.last.private='FICTIONAL_PRIVATE';},
  v=>{v.phaseObservations[0].name='FICTIONAL_PRIVATE';},v=>{v.legacyContractAccepted=true;},
  v=>{v.last.memoryPressure.some.total='FICTIONAL_PRIVATE';},v=>{v.phaseObservations=Array(129).fill(v.phaseObservations[0]);}]){
  const bad=clone(value);mutate(bad);assert.equal(context.closedCapacityMeasurement(bad),null);
  const projected=clone(context.closedFailureMemory({...core,capacityMeasurement:bad}));
  assert.deepEqual(projected,core);assert(!JSON.stringify(projected).includes('FICTIONAL_PRIVATE'));
}
assert(!Object.hasOwn(context.closedFailureMemory({...core,configuredLimitBytes:2560000000,capacityMeasurement:value}),'capacityMeasurement'));
// Exercise the actual action entry, including private stdin and its error exit.
for(const success of [true,false]){
  const output=[],env={W15_MODE:'end500-restore-capacity-diagnostic',W15_REQUEST:JSON.stringify({nonce:'FICTIONAL',limits:{}}),
    GITHUB_EVENT_PATH:'/FICTIONAL_EVENT',EXPECTED_COMMIT:'a'.repeat(40),GITHUB_RUN_ID:'123456789',GITHUB_RUN_ATTEMPT:'1',
    HELMUT_W15_CIPHER_INDEX_GPG:'FICTIONAL_PRIVATE_CIPHER',HELMUT_W15_RECEIVER_PROTECTED_KEY_B64:'FICTIONAL_PRIVATE_KEY',
    HELMUT_W15_RECEIVER_PASSPHRASE:'FICTIONAL_PRIVATE_PASSPHRASE',GITHUB_TOKEN:'FICTIONAL_PRIVATE_TOKEN'};
  const packet=success?{status:'COMPLETED_FULL_RESTORE_CAPACITY_DIAGNOSTIC_ONLY',legacyRestoreAccepted:false,capacityMeasurement:value}:
    {status:'FAIL_W15_ISOLATED_WORKFLOW',phase:'worker',executionAuthority:false,retryAllowed:false,
      runner:{reason:'PARENT_READBACK_REJECTED',memorySource:'CURRENT_REJECTED_READBACK',memory:{...core,capacityMeasurement:value}}};
  const child={spawnSync(cmd,args,options){
    assert.equal(cmd,'/usr/bin/python3');assert(args.includes('--launch'));
    const input=JSON.parse(options.input);assert.equal(input.request.mode,env.W15_MODE);
    assert.equal(input.privatePayload.passphrase,'FICTIONAL_PRIVATE_PASSPHRASE');
    return {status:success?0:1,stdout:JSON.stringify(packet)};
  }};
  const sandbox={Buffer,process:{env},console:{log:x=>output.push(x)},require:name=>{
    if(name==='node:fs')return {readFileSync:()=>JSON.stringify({inputs:{}})};
    if(name==='node:child_process')return child;
    if(name==='./capacity-measurement')return capacity;throw Error('UNEXPECTED_IMPORT');
  }};
  vm.runInNewContext(source,sandbox,{timeout:1000});
  assert.equal(sandbox.process.exitCode,success?undefined:1);
  assert.deepEqual(JSON.parse(output.at(-1)),packet);
  assert(!output.join('').includes('FICTIONAL_PRIVATE'));
}
console.log(JSON.stringify({status:'PASS_CAPACITY_CLOSED_PROJECTION_AND_ACTION_ENTRY_ONLY',groups:5,executionAuthority:false}));
