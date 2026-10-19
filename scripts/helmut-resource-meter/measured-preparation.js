'use strict';
// Runs only as the FIRST stage of the globally claimed accepted local recipe.
// Imports frozen fixture input into OWNED empty PG, then runs the unchanged
// reviewed local preparation/activation implementation in its relocated copy.
const fs=require('node:fs'),assert=require('node:assert/strict'),cp=require('node:child_process'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const slot=require('./local-resource-authority-slot.json');
assert.deepEqual(Object.keys(slot).sort(),['day','schema','version']);
assert.equal(slot.schema,'helmut-local-resource-authority-slot/1');
assert.equal(slot.day,'2026-10-19');
assert.equal(slot.version,8);
const resourceClaimPath='/workspace/helmut-parallel-20261015/wave19-resource-meter/'
 +`NEXT_RESOURCE${slot.day.slice(-2)}_V${slot.version}_GO_CLAIM.SAFE.json`;
function read(pin){const b=fs.readFileSync(pin.path);assert.equal(b.length,pin.bytes);assert.equal(sha(b),pin.sha256);return JSON.parse(b);}
function bytes(pin){const b=fs.readFileSync(pin.path);assert.equal(b.length,pin.bytes);assert.equal(sha(b),pin.sha256);return b;}
function assertInputBindings(plan,source){
 assert.equal(plan.production,false);assert.equal(source.production,false);
 assert(/^helmut_resource_fixture_20261019_[a-f0-9]{12}$/.test(plan.targetDatabase));
 assert.equal(plan.resourceClaimPath,resourceClaimPath);
 assert.equal(plan.sourceInputDatabase,'helmut_resource_input_20261019_e400dff25393');
 assert.equal(source.source,plan.sourceInputDatabase);
 // Physical input provenance and the logical namespace in the NEW owned
 // server are distinct. The actual restored bytes are verified below.
 assert.equal(plan.sourceDatabase,'helmut_fresh_input_fixture_d2e98984');
 assert.equal(source.sourceWrites,0);assert(source.before&&typeof source.before==='object');
 assert.deepEqual(source.before,source.after);
 return plan.resourceClaimPath;
}
function main(){
 const recipe=JSON.parse(fs.readFileSync('/meter-output/RECIPE.PRIVATE.json'));
 assert.equal(recipe.scope,'owner-approved-local500-resources');assert.equal(recipe.full500Attempts,1);
 const plan=read(recipe.fixtureConnectionPin);assert.equal(plan.schema,'helmut-pinned-full500-connection/1');
 assert.equal(plan.production,false);assert.equal(plan.operationId,recipe.expectedFreshOperationId);
 assert.equal(process.argv[2],recipe.fixtureConnectionPin.path);
 const owner=read(recipe.freshOwnerGO);assert.equal(owner.production,false);assert.equal(owner.syntheticProfiles,500);assert.equal(owner.targetDatabase,plan.targetDatabase);
 const source=read(plan.sourceCapture);
 const claim=JSON.parse(fs.readFileSync(assertInputBindings(plan,source)));
 assert.equal(claim.recipeSHA256,sha(fs.readFileSync('/meter-output/RECIPE.PRIVATE.json')));
 const q=x=>"'"+x.replaceAll("'","''")+"'";
 const argv=['--host=unix:///var/run/docker.sock','exec','-i',plan.containerName,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-f','-'];
 function psql(text){return cp.execFileSync('docker',argv,{input:text,encoding:'utf8',env:{PATH:process.env.PATH,LANG:'C.UTF-8'},timeout:30000,maxBuffer:8*1024*1024}).trim();}
 assert.equal(psql('begin read only;select count(*)from pg_database where datname in('+q(plan.sourceDatabase)+','+q(plan.targetDatabase)+');rollback;'),'0','Never reuse a source/target in this fresh owned server');
 // These exact role attributes/memberships came from the LOCAL frozen server;
 // no password or Production credential is read, transferred or synthesized.
 psql(bytes(source.localRolesSQL));psql('CREATE DATABASE "'+plan.sourceDatabase+'";');
 cp.execFileSync('docker',['--host=unix:///var/run/docker.sock','exec','-i',plan.containerName,'pg_restore','-U','postgres','--exit-on-error','-d',plan.sourceDatabase],
  {input:bytes(source.sourceDump),env:{PATH:process.env.PATH,LANG:'C.UTF-8'},timeout:120000,maxBuffer:32*1024*1024});
 const corrected=read(source.correctedFinancialWitnessPin);
 const observed=JSON.parse(cp.execFileSync('docker',['--host=unix:///var/run/docker.sock','exec','-i',plan.containerName,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',plan.sourceDatabase,'-f','-'],{input:"BEGIN READ ONLY;SELECT jsonb_build_object('nativeAuthText',(select data::text from helmut_store where id='main-auth'),'nativeAuthSHA',(select encode(sha256(convert_to(data::text,'UTF8')),'hex')from helmut_store where id='main-auth'),'completeNativeCounterText',(select coalesce(jsonb_agg(to_jsonb(c)order by to_jsonb(c)::text),'[]'::jsonb)::text from llm_budget_counters c));ROLLBACK;",encoding:'utf8',env:{PATH:process.env.PATH,LANG:'C.UTF-8'},timeout:30000,maxBuffer:16*1024*1024}));
 for(const key of ['nativeAuthText','nativeAuthSHA','completeNativeCounterText'])assert.equal(observed[key],corrected[key],'Restored corrected input must equal actual bound native data');
 assert.equal(sha(observed.completeNativeCounterText),corrected.completeNativeCounterSHA);
 const request=read(plan.runtimeRequest);assert.equal(request.targetDatabase,plan.targetDatabase);assert.deepEqual(request.expectedOwnerGoPin,recipe.freshOwnerGO);
 cp.execFileSync('node',[plan.workflowDirectory+'/prepare-current-local-runtime.js','--apply-owner-local-go',recipe.freshOwnerGO.path,'--reviewed-input',plan.runtimeRequest.path],
  {stdio:'inherit',env:{PATH:process.env.PATH,LANG:'C.UTF-8'},timeout:240000});
 const result=JSON.parse(fs.readFileSync(plan.workflowDirectory+'/LOCAL_ACTIVATION_RESULT.SAFE.json'));
 assert.equal(result.pass,true);assert.equal(result.target,plan.targetDatabase);assert.equal(result.operationId,plan.operationId);
 assert.equal(result.sourceProfileHashUnchanged,true);assert.equal(result.actualActiveAfter,500);assert.equal(result.sourceBefore.profileHash,source.before.profileHash);
 assert.equal(result.sourceBefore.identityHash,source.before.identityHash);assert.equal(result.sourceBefore.uSHA,source.before.uSHA);
 if(plan.atomicUsageInput){
  const AU=require('./atomic-usage-integration');AU.readDescriptor(plan.atomicUsageInput);
  const output=plan.workflowDirectory+'/ATOMIC_USAGE_BOOTSTRAP.SAFE.json';assert(!fs.existsSync(output));
  const targetSQL=text=>cp.execFileSync('docker',['--host=unix:///var/run/docker.sock','exec','-i',plan.containerName,
   'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',plan.targetDatabase,'-f','-'],
   {input:text,encoding:'utf8',env:{PATH:process.env.PATH,LANG:'C.UTF-8'},timeout:30000,maxBuffer:16*1024*1024}).trim();
  const receipt=AU.installAfterActivation({plan,candidatePin:plan.atomicUsageInput,targetSQL});
  fs.writeFileSync(output,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
 }
 console.log(JSON.stringify({measuredOriginalPreparationComplete:true,onlyOwnedDatabase:true,sourceHashAndOriginalUBindingEqual:true,syntheticProfiles:500,production:false}));
}
if(require.main===module)main();
module.exports={read,bytes,assertInputBindings};
