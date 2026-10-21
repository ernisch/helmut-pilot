'use strict';
// Static consumer chain only. Every file lives in a disposable TEST_ONLY tree;
// target/case/owner sentinels cannot pass the canonical native admission.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const P=require('./start-input-checks');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function fixture(work){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'helmut-TEST_ONLY-static-backend-'));
  const pin=file=>{const b=fs.readFileSync(file);return {path:file,bytes:b.length,sha256:hash(b)};};
  const put=(name,data)=>{const file=path.join(dir,name);fs.writeFileSync(file,typeof data==='string'?data:JSON.stringify(data),{mode:0o600});return pin(file);};
  try{
    const config=put('postgrest.PRIVATE.conf','TEST_ONLY_NOT_A_SERVICE_CONFIG'),binary=put('NOT_EXECUTABLE','TEST_ONLY_NOT_A_BINARY');
    const source=put('NOT_PRODUCT_SOURCE.py','TEST_ONLY_NOT_A_SOURCE_ADOPTION'),upstream=put('NOT_UPSTREAM.hs','TEST_ONLY_NOT_UPSTREAM');
    const evidence=put('NOT_EVIDENCE','TEST_ONLY_NOT_ORIGINAL_EVIDENCE'),owner=put('NOT_AUTHORITY','TEST_ONLY_NOT_A_GO');
    const day=put('TEST_ONLY_DAY.json',{day:'2026-10-21',startsAtUTC:'2026-10-21T00:00:00Z',endsAtUTC:'2026-10-21T23:59:59Z'});
    const backend={schema:'helmut-local-supervised-postgrest-backend-plan/1',mode:'supervised-owner-v1',production:false,automaticRetry:false,
      caseDirectory:dir,targetDatabase:'TEST_ONLY_NOT_A_DATABASE',operationId:'TEST_ONLY_NOT_AN_OPERATION',resourceClaimPath:'/TEST_ONLY_NOT_A_CLAIM',
      ownerGoPin:owner,day:'2026-10-21',sourcePostgrestConfigPin:config,binaryPin:binary,sourcePins:[source],upstreamEvidencePin:evidence,upstreamSourcePins:[upstream],
      workEndsAtUTC:'2026-10-21T12:00:00Z',closeByUTC:'2026-10-21T12:01:00Z',maximumLifecycleSeconds:33000};
    const backendPin=put('TEST_ONLY_STATIC_DATA.json',backend),key='localPostgrestBackendPlanPin';
    const staged=put('TEST_ONLY_STAGED_DATA.json',{[key]:backendPin});
    const plan={...Object.fromEntries(['caseDirectory','targetDatabase','operationId','resourceClaimPath'].map(k=>[k,backend[k]])),
      [key]:backendPin,stagedHarness:staged,freshOwnerGO:owner,dayBindingAcceptance:day,
      applicationReadOnlyPins:[config,evidence,upstream],databaseReadOnlyPins:[binary]};
    const request={[key]:backendPin,sourcePins:[source]};
    work({plan,request,backend,put,pin,key,source,config});
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('static backend checks work with all launch and write APIs denied',()=>fixture(({plan,request})=>{
  const restore=P.installReadOnlyGuards();
  try{assert.equal(P.backendInputs(plan,request).mode,'supervised-owner-v1');
    assert.throws(()=>require('node:child_process').spawnSync('NEVER_EXECUTED'));}
  finally{restore();}
}));
test('absent default needs no backend files, presence/null/drift fails',()=>{
  assert.equal(P.backendInputs({},{}),null);
  for(const [a,b]of [[{localPostgrestBackendPlanPin:null},{}],[{}, {localPostgrestBackendPlanPin:null}],
    [{localPostgrestBackendPlanPin:null},{localPostgrestBackendPlanPin:null}]])assert.throws(()=>P.backendInputs(a,b));
  fixture(({plan,request,key})=>{
    assert.throws(()=>P.backendInputs(plan,{...request,[key]:{...request[key],sha256:'0'.repeat(64)}}));
  });
});
test('case owner claim materials and full source closure remain mandatory',()=>fixture(({plan,request,backend,put,key})=>{
  const changed=delta=>{
    const p=put('TEST_ONLY_STATIC_DATA.json',{...backend,...delta});
    return [{...plan,[key]:p,stagedHarness:put('TEST_ONLY_STAGED_DATA.json',{[key]:p})},{...request,[key]:p}];
  };
  for(const delta of [{production:true},{automaticRetry:true},{ownerGoPin:{...plan.freshOwnerGO,sha256:'0'.repeat(64)}},
    {caseDirectory:'/OTHER'},{resourceClaimPath:'/OTHER'}, {day:'2026-10-20'},
    {sourcePostgrestConfigPin:backend.binaryPin},{binaryPin:backend.sourcePostgrestConfigPin},
    {sourcePins:[backend.binaryPin]},{closeByUTC:backend.workEndsAtUTC},{closeByUTC:'2026-10-22T00:00:00Z'}, {maximumLifecycleSeconds:33001}]){
    const [p,r]=changed(delta);assert.throws(()=>P.backendInputs(p,r));
  }
}));
test('changed mounted upstream bytes or missing mount are rejected',()=>fixture(({plan,request,backend})=>{
  assert.throws(()=>P.backendInputs({...plan,applicationReadOnlyPins:plan.applicationReadOnlyPins.slice(0,-1)},request));
  fs.appendFileSync(backend.upstreamSourcePins[0].path,'DRIFT');
  assert.throws(()=>P.backendInputs(plan,request));
}));
