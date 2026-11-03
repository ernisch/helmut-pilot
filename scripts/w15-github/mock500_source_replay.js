'use strict';
// Trusted private Mock producer only. Importing this module issues no authority.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const P=require('../../lib/helmut/synthetik-500-profile');
const Source=require('../../lib/helmut/synthetik-500-mock-source-replay');
const CONTRACT='helmut-w15-mock-historical-qualified-source-replay/1';
const PINS=Object.freeze({reportSHA256:'d2603d926508a1655b415b18734fe37bc1a660dccb6f139ae43b1859a11bed3d',
 rowsSHA256:'22d4f73337178ec260c6d963f5539044f15e07d952aafc83e258cfdc4d267359',
 fixturesSHA256:'548a5bd3e268be76a85ba8088c6993c0860b4f90659b47da1c76526cf486d9d1',
 policySHA256:'274033cdfdd5f1527d0e961a6c00482d61b7be317eeea03e736a6a5948aa6a04'});
const B=()=>require('./mock500_bindings');
function privateJSON(filename){
 const s=fs.lstatSync(filename);assert(s.isFile()&&!s.isSymbolicLink()&&s.uid===process.getuid()&&(s.mode&511)===384);
 assert(s.size>0&&s.size<=1024*1024);return JSON.parse(B().privateBytes({path:filename,bytes:s.size,
  sha256:require('node:crypto').createHash('sha256').update(fs.readFileSync(filename)).digest('hex')},1024*1024));
}
function authority(bound,ownerPath){
 B().namespace(bound.context);B().fixedWindow(bound);B().memoryLimits(bound);
 assert(require.cache[require.resolve('../lokaler-netzschutz')]);
 assert.equal(process.env.HELMUT_SOURCE_MODE,'off');
 assert.equal(new URL(process.env.SUPABASE_URL).hostname,'127.0.0.1');
 assert.equal(process.env.VERCEL_URL,'helmut-w15-full500-local.vercel.app');
 assert.equal(process.env.VERCEL_DEPLOYMENT_ID,'dpl_W15Full500LocalNotProduction');
 assert.equal(bound.functionalResourceContract.mode,'mock500-full-host-functional-gated');
 assert.notEqual(bound.materialsDiagnosticOnly,true);
 const allowed=[path.join(bound.context.hostPaths.work,'OWNER_GO.PRIVATE.json'),path.join(B().BASE,'state/OWNER_GO.PRIVATE.json')];
 assert(allowed.includes(ownerPath));
 const owner=privateJSON(ownerPath),a=bound.sourceReplayAuthorization;
 assert(a&&a.contract===CONTRACT);assert.deepEqual(owner.authorizationBinding.sourceReplayAuthorization,a);
 assert.equal(owner.authorizationBinding.runId,bound.context.runId);assert.equal(owner.authorizationBinding.exactCommit,bound.context.exactCommit);
 assert.equal(owner.confirmation,'GO_EXACTLY_ONE_ISOLATED_W15_FULL500_MOCK_RUN_AND_RETURN_TO_ZERO');
 assert.equal(owner.targetDatabase,B().DB);assert.equal(owner.maximumUnits,500);assert.equal(owner.temporarySyntheticProfiles,500);
 assert.equal(owner.productionAllowed,false);assert.equal(owner.paidModelsAllowed,false);assert.equal(owner.full500Allowed,true);
 for(const k of ['runId','runAttempt','nonce','exactCommit'])assert.equal(a[k],bound.context[k]);
 return structuredClone(a);
}
function rowBinding(row,index){
 const input=require('../../lib/helmut/briefing-lagebindung').pruefe(row.briefingEingabe,row.profile,row.profile.id,
  new Date(row.briefingDatum),{acceptedSnapshot:true});
 return {index,owner:row.profile.id,profileHash:P.hash(row.profile),briefingEingabeHash:P.hash(row.briefingEingabe),
  briefingDatum:row.briefingDatum,sourceProjectionSHA256:P.hash({ranked:input.ranked,sources:input.sources}),
  requestBodySHA256:null,reviewRequestBodySHA256:null};
}
function preparation(bound,qualified,rows){
 if(bound?.sourceReplayAuthorization===undefined)return null;
 let record;
 const issuer=Source.createIssuer(()=>{
  const authorization=authority(bound,path.join(bound.context.hostPaths.work,'OWNER_GO.PRIVATE.json'));
  assert.equal(qualified.reportPin.sha256,PINS.reportSHA256);
  assert.deepEqual(JSON.parse(B().privateBytes(bound.assets.qualificationReport,16*1024**2)),qualified.report);
  for(const [asset,key]of [['qualifiedRows','rowsSHA256'],['qualifiedFixtures','fixturesSHA256'],['publicationPolicy','policySHA256']])
   assert.equal(bound.assets[asset].sha256,PINS[key]);
  assert.equal(qualified.historicalExecutionISO,qualified.report.executionISO);
  assert.equal(qualified.report.completedOwners,500);assert.equal(qualified.report.qualifiedOwners,500);assert.equal(qualified.report.failedOwners,0);
  assert.equal(rows.length,500);assert.equal(qualified.fixtures.length,500);
  const byOwner=new Map(rows.map(r=>[r.profile.id,r]));assert.equal(byOwner.size,500);
  const original=new Map(qualified.rows.map(r=>[r.profile.id,r]));
  const bindings=qualified.fixtures.map((f,i)=>{
   assert.equal(f.index,i);const row=byOwner.get(f.owner);assert(row&&original.has(f.owner));
   assert.deepEqual(row.profile,original.get(f.owner).profile);assert.equal(row.briefingDatum,qualified.executionISO);
   return rowBinding(row,i);
  });
  record={schema:'helmut-w15-mock-source-replay-grant/1',contract:CONTRACT,purpose:'PREPARATION',authorization,
   sourceAsOfISO:qualified.report.executionISO,executionISO:qualified.executionISO,window:structuredClone(bound.window),
   qualificationPins:{...PINS},operationId:null,commandHash:null,bindings};return record;
 });
 const grant=issuer.issue();return {issuer,grant,record:structuredClone(record)};
}
function bind(scope,token,index){
 const r=scope.record;
 require('../../lib/helmut/synthetik-500-lage-input').bindMockSourceReplay(token,scope.grant,{index,
  ...Object.fromEntries(['runId','runAttempt','nonce','exactCommit'].map(k=>[k,r.authorization[k]])),
  operationId:r.operationId,commandHash:r.commandHash});return token;
}
function tokenForRow(scope,row){
 const index=scope.record.bindings.findIndex(r=>r.owner===row.profile.id);assert(index>=0);
 return bind(scope,require('../../lib/helmut/synthetik-500-lage-input').create(row),index);
}
function verifyActualBindings(fixtures,requests,{prepared=true}={}){
 assert.equal(fixtures.length,500);assert.equal(requests.length,500);const owners=new Set();
 for(let i=0;i<500;i++){
  const f=fixtures[i],r=requests[i];
  if(prepared)require("../fixtures/w15-full500-provider").assertPreparedRequests(f);
  assert.equal(f.index,i);assert.equal(f.owner,r.owner);assert(!owners.has(r.owner));owners.add(r.owner);
  assert(Number.isInteger(r.contextSources)&&r.contextSources>0);assert.equal(f.contextSources,r.contextSources);
  assert.match(f.requestBodySHA256,/^[a-f0-9]{64}$/);assert.equal(r.requestBodySHA256,f.requestBodySHA256);
  assert.match(f.reviewRequestBodySHA256,/^[a-f0-9]{64}$/);
 }
 return {status:'PASS_ALL500_ACTUAL_D_PROVIDER_REVIEW_REQUEST_BINDINGS',profiles:500,actualDRequests:500,
  providerRequests:500,reviewRequests:500,profileActivations:0};
}
function executionRecord(scope,fixtures,requests,selector){
 verifyActualBindings(fixtures,requests);
 return {...structuredClone(scope.record),purpose:'EXECUTION',operationId:selector.operationId,commandHash:selector.commandHash,
  bindings:scope.record.bindings.map((r,i)=>({...r,requestBodySHA256:fixtures[i].requestBodySHA256,
   reviewRequestBodySHA256:fixtures[i].reviewRequestBodySHA256}))};
}
function execution(bound,materials,fixtures){
 if(bound?.sourceReplayAuthorization===undefined){assert.equal(materials.sourceReplay,undefined);return null;}
 let record;
 const issuer=Source.createIssuer(()=>{
  const authorization=authority(bound,path.join(B().BASE,'state/OWNER_GO.PRIVATE.json'));
  record=structuredClone(materials.sourceReplay);assert(record);assert.equal(record.purpose,'EXECUTION');
  assert.deepEqual(record.authorization,authorization);assert.deepEqual(record.window,bound.window);
  assert.equal(record.operationId,materials.selector.operationId);assert.equal(record.commandHash,materials.selector.commandHash);
  assert.equal(materials.preactivationBindings?.status,'PASS_ALL500_ACTUAL_D_PROVIDER_REVIEW_REQUEST_BINDINGS');
  assert.equal(materials.preactivationBindings.profileActivations,0);assert.equal(fixtures.length,500);
  for(let i=0;i<500;i++){
   const f=fixtures[i],r=record.bindings[i];assert.equal(f.index,i);assert.equal(f.owner,r.owner);
   assert.equal(f.requestBodySHA256,r.requestBodySHA256);assert.equal(f.reviewRequestBodySHA256,r.reviewRequestBodySHA256);
  }
  return record;
 });
 const grant=issuer.issue();return {issuer,grant,record};
}
module.exports={CONTRACT,PINS,preparation,bind,tokenForRow,verifyActualBindings,executionRecord,execution};
