'use strict';
// Runs only as the FIRST stage of the globally claimed accepted local recipe.
// Imports frozen fixture input into OWNED empty PG, then runs the unchanged
// reviewed local preparation/activation implementation in its relocated copy.
const fs=require('node:fs'),assert=require('node:assert/strict'),cp=require('node:child_process'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function read(pin){const b=fs.readFileSync(pin.path);assert.equal(b.length,pin.bytes);assert.equal(sha(b),pin.sha256);return JSON.parse(b);}
function bytes(pin){const b=fs.readFileSync(pin.path);assert.equal(b.length,pin.bytes);assert.equal(sha(b),pin.sha256);return b;}
function main(){
 const recipe=JSON.parse(fs.readFileSync('/meter-output/RECIPE.PRIVATE.json'));
 assert.equal(recipe.scope,'owner-approved-local500-resources');assert.equal(recipe.full500Attempts,1);
 const plan=read(recipe.fixtureConnectionPin);assert.equal(plan.schema,'helmut-pinned-full500-connection/1');
 assert.equal(plan.production,false);assert.equal(plan.operationId,recipe.expectedFreshOperationId);
 assert.equal(process.argv[2],recipe.fixtureConnectionPin.path);
 const owner=read(recipe.freshOwnerGO);assert.equal(owner.production,false);assert.equal(owner.syntheticProfiles,500);assert.equal(owner.targetDatabase,plan.targetDatabase);
 const claim=JSON.parse(fs.readFileSync('/workspace/helmut-parallel-20261015/wave19-resource-meter/ONCE_ONLY_RESOURCES_GO_CLAIM.SAFE.json'));
 assert.equal(claim.recipeSHA256,sha(fs.readFileSync('/meter-output/RECIPE.PRIVATE.json')));
 const source=read(plan.sourceCapture),q=x=>"'"+x.replaceAll("'","''")+"'";
 assert.equal(source.source,plan.sourceDatabase);assert.equal(source.sourceWrites,0);assert.deepEqual(source.before,source.after);
 const argv=['--host=unix:///var/run/docker.sock','exec','-i',plan.containerName,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-f','-'];
 function psql(text){return cp.execFileSync('docker',argv,{input:text,encoding:'utf8',env:{PATH:process.env.PATH,LANG:'C.UTF-8'},timeout:30000,maxBuffer:8*1024*1024}).trim();}
 assert.equal(psql('begin read only;select count(*)from pg_database where datname in('+q(plan.sourceDatabase)+','+q(plan.targetDatabase)+');rollback;'),'0','Never reuse a source/target in this fresh owned server');
 // These exact role attributes/memberships came from the LOCAL frozen server;
 // no password or Production credential is read, transferred or synthesized.
 psql(bytes(source.localRolesSQL));psql('CREATE DATABASE "'+plan.sourceDatabase+'";');
 cp.execFileSync('docker',['--host=unix:///var/run/docker.sock','exec','-i',plan.containerName,'pg_restore','-U','postgres','--exit-on-error','-d',plan.sourceDatabase],
  {input:bytes(source.sourceDump),env:{PATH:process.env.PATH,LANG:'C.UTF-8'},timeout:120000,maxBuffer:32*1024*1024});
 const request=read(plan.runtimeRequest);assert.equal(request.targetDatabase,plan.targetDatabase);assert.deepEqual(request.expectedOwnerGoPin,recipe.freshOwnerGO);
 cp.execFileSync('node',[plan.workflowDirectory+'/prepare-current-local-runtime.js','--apply-owner-local-go',recipe.freshOwnerGO.path,'--reviewed-input',plan.runtimeRequest.path],
  {stdio:'inherit',env:{PATH:process.env.PATH,LANG:'C.UTF-8'},timeout:240000});
 const result=JSON.parse(fs.readFileSync(plan.workflowDirectory+'/LOCAL_ACTIVATION_RESULT.SAFE.json'));
 assert.equal(result.pass,true);assert.equal(result.target,plan.targetDatabase);assert.equal(result.operationId,plan.operationId);
 assert.equal(result.sourceProfileHashUnchanged,true);assert.equal(result.actualActiveAfter,500);assert.equal(result.sourceBefore.profileHash,source.before.profileHash);
 assert.equal(result.sourceBefore.identityHash,source.before.identityHash);assert.equal(result.sourceBefore.uSHA,source.before.uSHA);
 console.log(JSON.stringify({measuredOriginalPreparationComplete:true,onlyOwnedDatabase:true,sourceHashAndOriginalUBindingEqual:true,syntheticProfiles:500,production:false}));
}
if(require.main===module)main();
module.exports={read,bytes};
