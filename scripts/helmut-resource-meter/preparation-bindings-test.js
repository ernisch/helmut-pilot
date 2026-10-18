'use strict';
// Pure entry predicates and first-SQL sentinel only. No activation, DB or run.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const M=require('./measured-preparation'),AU=require('./atomic-usage-integration');
const plan={schema:'helmut-pinned-full500-connection/1',production:false,profiles:500,controlsPerUnit:16,
  originalUUnchangedAndRequired:true,targetDatabase:'helmut_resource_fixture_20261018_0123456789ab',
  containerName:'helmut-meter-db-w20-0123456789ab',
  sourceDatabase:'helmut_fresh_input_fixture_d2e98984',sourceInputDatabase:'helmut_resource_input_20261018_ab76c911dac8',
  resourceClaimPath:'/workspace/helmut-parallel-20261015/wave19-resource-meter/NEXT_RESOURCE18_V5_GO_CLAIM.SAFE.json'};
const source={source:plan.sourceInputDatabase,sourceWrites:0,production:false,
  before:{TEST_ONLY:'NO_REAL_SOURCE'},after:{TEST_ONLY:'NO_REAL_SOURCE'}};
assert.equal(M.assertInputBindings(plan,source),plan.resourceClaimPath);
for(const delta of [{production:true},{targetDatabase:'helmut_resource_fixture_20261017_0123456789ab'},
  {resourceClaimPath:'/workspace/helmut-parallel-20261015/wave19-resource-meter/NEXT_RESOURCE17_V4_GO_CLAIM.SAFE.json'},
  {resourceClaimPath:undefined},{sourceInputDatabase:plan.sourceDatabase},{sourceDatabase:'OTHER'}]) {
  assert.throws(()=>M.assertInputBindings({...plan,...delta},source));
}
for(const delta of [{source:plan.sourceDatabase},{sourceWrites:1},{production:true},
  {after:{TEST_ONLY:'CHANGED'}}])assert.throws(()=>M.assertInputBindings(plan,{...source,...delta}));
AU.assertLocalTarget(plan);
for(const delta of [{production:true},{profiles:499},{containerName:'FOREIGN'},
  {targetDatabase:'helmut_resource_fixture_20261017_0123456789ab'},
  {targetDatabase:plan.targetDatabase+'-foreign'}])assert.throws(()=>AU.assertLocalTarget({...plan,...delta}));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'helmut-preparation-entry-'));
try {
  const file=path.join(dir,'TEST_ONLY_DESCRIPTOR.json');fs.writeFileSync(file,JSON.stringify(AU.descriptor()),{mode:0o600});
  const candidatePin=AU.pin(file),sentinel=new Error('TEST_STOP_BEFORE_ANY_NATIVE_SQL');let calls=0;
  const targetSQL=()=>{calls++;throw sentinel;};
  // Invoke the ACTUAL installer. Exact sentinel equality proves the new target
  // passes its real entry guard; the first native access is replaced by a stop.
  assert.throws(()=>AU.installAfterActivation({plan,candidatePin,targetSQL}),e=>e===sentinel);
  assert.equal(calls,1);
  calls=0;
  assert.throws(()=>AU.installAfterActivation({plan:{...plan,targetDatabase:'helmut_resource_fixture_20261017_0123456789ab'},candidatePin,targetSQL}));
  assert.equal(calls,0);
} finally {fs.rmSync(dir,{recursive:true,force:true});}
console.log(JSON.stringify({scope:'PURE_SHARED_ENTRY_BINDINGS_AND_FIRST_SQL_SENTINEL_ONLY',pass:true,
  realDatabaseQueries:0,profileActivations:0,full500Runs:0,claimsCreated:0,providerCalls:0}));
