'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const Native=require('../fixtures/w15-native-failure');
const canary='fictional-private-value-that-even-matches-the-old-regex';
const error=Object.assign(new Error('Supabase storage failed (403): '+canary),{code:'ECONNREFUSED'});
const first=Native.project(error,{stage:'auth-read',acknowledgedCAS:0});
assert(first);assert.equal(first.kind,'storage-http-error');assert.equal(first.httpStatus,403);
assert.equal(first.writeOutcome,'UNKNOWN');assert.equal(first.acknowledgedCASKind,'CONFIRMED_LOWER_BOUND');
assert(!JSON.stringify(first).includes(canary));
const privateError=Native.project(new Error(canary),{stage:canary,check:canary});
assert.equal(privateError.stage,'UNKNOWN');assert.equal(privateError.check,'UNKNOWN');
assert.equal(privateError.acknowledgedCAS,'UNKNOWN');assert(!JSON.stringify(privateError).includes(canary));
const exact=Native.project(Object.assign(new Error('w15-forward-auth-baseline-bytes'),{code:'ERR_ASSERTION'}),
  {stage:'auth-baseline',acknowledgedCAS:0});
assert.equal(exact.check,'w15-forward-auth-baseline-bytes');assert.equal(exact.kind,'assertion');
const missing=Native.project(Object.assign(new Error(canary),{code:'MODULE_NOT_FOUND'}),{stage:'server-import',acknowledgedCAS:0});
assert.equal(missing.kind,'module-load-error');assert.equal(missing.requiredAction,'INSPECT_STAGED_CODE_DEPENDENCIES');
for(const [key,value] of [['code',canary],['stage',canary],['check',canary],['httpStatus',true],['timeoutMs',20001],
  ['acknowledgedCAS',501],['requiredAction',canary],['private',canary]]) assert.equal(Native.closed({...first,[key]:value}),null);
for(const action of ['w15-isolated','w15-mock500']){
  const filename=path.resolve(__dirname,'../../.github/actions',action,'index.js');
  const source=fs.readFileSync(filename,'utf8'),context={require:createRequire(filename)};vm.createContext(context);
  vm.runInContext(source.slice(0,source.indexOf('function closedCleanup')),context,{timeout:1000});
  const base={reason:'WORKER_REPORTED_FAILURE',workerExitCode:1};
  const clone=x=>JSON.parse(JSON.stringify(x));
  assert.deepEqual(clone(context.closedRunnerDetail({...base,nativeFailure:first})),{...base,nativeFailure:first});
  assert.deepEqual(clone(context.closedRunnerDetail({...base,nativeFailure:{...first,check:canary}})),base);
}
console.log(JSON.stringify({status:'PASS_CLOSED_NATIVE_ERROR_AND_PUBLIC_ACTION_PROJECTION_ONLY',executionAuthority:false}));
