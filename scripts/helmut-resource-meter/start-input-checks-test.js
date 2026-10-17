'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const P=require('./start-input-checks'),I=require('./start-guard-inventory');
const crypto=require('node:crypto'),F=require('./local-financial-preflight'),EU=require('../../lib/helmut/synthetik-500-eu-service-contract');
test('missing/false-like preservation declaration and altered local authority are rejected',()=>{
  // Deliberately non-operational in-memory schema example, never saved as GO.
  const action={requiredGOConfirmation:'TEST_ONLY_NEVER_AN_OPERATIONAL_GO'};
  const now=Date.parse('2026-10-17T00:00:00.000Z');
  const owner={allowDispose:false,schema:'helmut-owner-local-fixture-go/1',confirmation:action.requiredGOConfirmation,
    targetDatabase:'TEST_ONLY',production:false,syntheticProfiles:500,paidProviderCallsAllowed:false,
    exactlyOneResourceAttempt:true,approvedAtUTC:'2026-10-16T00:00:00.000Z',ownerAuthorizationReference:'IN_MEMORY_TEST_ONLY_NOT_AUTHORITY'};
  P.ownerPolicy(owner,action,'TEST_ONLY',now);
  for(const value of [undefined,true,null,0,'false'])assert.throws(()=>P.ownerPolicy({...owner,allowDispose:value},action,'TEST_ONLY',now));
  for(const delta of [{production:true},{syntheticProfiles:499},{paidProviderCallsAllowed:true},
    {exactlyOneResourceAttempt:false},{approvedAtUTC:'2026-10-18T00:00:00.000Z'},
    {ownerAuthorizationReference:''},{targetDatabase:'OTHER'}])assert.throws(()=>P.ownerPolicy({...owner,...delta},action,'TEST_ONLY',now));
});
test('actual JS AST includes assertions/throws and does not execute a consumer',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'helmut-guard-test-'));
  try{
    const file=path.join(dir,'consumer.js'),sentinel=path.join(dir,'MUST_NOT_EXIST');
    fs.writeFileSync(file,`require('node:fs').writeFileSync(${JSON.stringify(sentinel)},'BAD'); function consume(owner){ assert.equal(owner.allowDispose,false); if(!owner.day)throw Error('day'); }`);
    const a=I.inventory(file);
    assert(a.guards.some(g=>g.callee==='assert.equal'));assert(a.guards.some(g=>g.kind==='throw'));
    assert(a.guards.some(g=>g.callee.includes('writeFileSync')));assert.equal(a.requires[0].literal,'node:fs');
    assert(!fs.existsSync(sentinel));
    fs.appendFileSync(file,'\n// Change outside the guard is also bound.');
    assert.notEqual(I.inventory(file).sha256,a.sha256);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('read-only input checks collect failures without executing any workflow',()=>{
  const result=P.assess({});
  assert.equal(result.checks.length,8);assert(result.checks.every(r=>r.status==='BLOCKED'));
  assert.equal(result.activation,false);assert.equal(result.providerCalls,0);
});
test('initial source identity mismatch is rejected and side-effect API guards restore',()=>{
  assert.throws(()=>P.initialSourceBinding({expectedInitialSourceBindingSHA256:'0'.repeat(64)}));
  const originalWrite=fs.writeFileSync,restore=P.installReadOnlyGuards();
  try {
    assert.throws(()=>require('node:http').get('http://127.0.0.1/'));
    assert.throws(()=>require('node:child_process').execSync('MUST_NEVER_EXECUTE'));
    assert.throws(()=>fs.writeFileSync('/tmp/MUST_NEVER_BE_CREATED_BY_PREFLIGHT','BAD'));
    assert.throws(()=>new(require('node:worker_threads').Worker)('MUST_NEVER_START'));
  }finally{restore();}
  assert.equal(fs.writeFileSync,originalWrite);
});
test('missing historical16 and unreadable/mismatched native finances fail before any runtime module load',()=>{
  const book=day=>({version:EU.DAY_VERSION,day,tarif:EU.RATE_ID,limit:EU.DAY_MICRO_USD,
    serviceContractHash:EU.HASH,spent:0,baseline:0,baselineCalls:0,manualCalls:0,manualUntil:null,calls:{},frozen:null});
  const auth={testKostenAuftrag:{version:EU.ORDER_VERSION,serviceContractHash:EU.HASH,abTag:'2026-10-15'},
    testKostenTage:{'2026-10-15':book('2026-10-15')},llmUsage:[]};
  const nativeAuthText=JSON.stringify(auth),authSHA=crypto.createHash('sha256').update(nativeAuthText).digest('hex');
  const s={auth,nativeAuthText,authSHA,counterReadOK:true,counter:0},before=JSON.stringify(s);
  const r=F.assess(s,null,'2026-10-17');
  assert.equal(r.pass,false);assert(r.missingDays.includes('2026-10-16'));assert.equal(r.reason,'test-usd-buch-unlesbar');
  for(const delta of [{counterReadOK:false},{counter:-1},{authSHA:'0'.repeat(64)},
    {auth:{...auth,llmUsage:[{changed:true}]}}])assert.equal(F.assess({...s,...delta},null,'2026-10-17').pass,false);
  assert.equal(JSON.stringify(s),before);
});

test('an unauthorized technical intent cannot pass the execution owner contract',()=>{
  const owner={schema:'helmut-owner-local-fixture-intent/1',authorized:false,allowDispose:false,
    requiredConfirmation:'TEST_ONLY_NEVER_A_GO',targetDatabase:'TEST_ONLY',production:false,
    syntheticProfiles:500,paidProviderCallsAllowed:false,exactlyOneResourceAttempt:true,resourceOnly:true,
    finalOwnerGOPath:'/tmp/NO_ACTUAL_GO_EXISTS_FOR_THIS_IN_MEMORY_TEST'};
  const action={authorized:false,requiredGOConfirmation:owner.requiredConfirmation};
  P.ownerIntentPolicy(owner,action,'TEST_ONLY');
  assert.throws(()=>P.ownerPolicy(owner,action,'TEST_ONLY',Date.now()));
  for(const value of [undefined,null,true,0,'false'])assert.throws(()=>P.ownerIntentPolicy({...owner,allowDispose:value},action,'TEST_ONLY'));
  for(const key of ['approvedAtUTC','confirmation','ownerAuthorizationReference'])
    assert.throws(()=>P.ownerIntentPolicy({...owner,[key]:'TEST_ONLY_NOT_AUTHORITY'},action,'TEST_ONLY'));
  assert.throws(()=>P.ownerIntentPolicy(owner,{...action,authorized:true},'TEST_ONLY'));
});
