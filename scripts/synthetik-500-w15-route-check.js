"use strict";
// Local pure route check only. No authority admission, Unit, activation or sender.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..'),OLD='/workspace/shared/helmut-w15-unit0-20261027';
const OUT='/workspace/shared/helmut-w15-unit0b-preparation-20261027';
const DB='helmut_w15_unit0_20261027',NEW_DB='helmut_w15_unit0b_20261027',CONTAINER='synthetik500-runtime-pg-7e1c20261027';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),literal=x=>"'"+String(x).replaceAll("'","''")+"'";
function privateRead(p){const s=fs.lstatSync(p);assert(s.isFile()&&!s.isSymbolicLink()&&s.uid===process.getuid()&&(s.mode&511)===384);return fs.readFileSync(p);}
function readOnly(query){const r=spawnSync('docker',['--host=unix:///var/run/docker.sock','exec','-i',CONTAINER,'psql','-X','-w','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',DB,'-f','-'],{input:"begin read only;set local statement_timeout='15s';"+query+'rollback;',encoding:'utf8',timeout:20000,maxBuffer:1024*1024,env:{PATH:process.env.PATH,LANG:'C.UTF-8'}});assert.equal(r.status,0,'readonly local evidence query failed');return JSON.parse(r.stdout.trim());}
function save(name,value){fs.writeFileSync(path.join(OUT,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:384});}
assert(require.cache[require.resolve('./lokaler-netzschutz')]);assert.deepEqual(require('./lokaler-netzschutz').pruefe(process.env),[]);
assert(!fs.existsSync(OUT));fs.mkdirSync(OUT,{mode:448});
const metadata=JSON.parse(privateRead(OLD+'/processing-materials.PRIVATE.json'));
const encoded=privateRead(OLD+'/current-command.PRIVATE.json');assert.equal(encoded.length,metadata.commandPin.bytes);assert.equal(sha(encoded),metadata.commandPin.sha256);
const config=JSON.parse(privateRead(OLD+'/runtime-public.PRIVATE.json'));
const evidence=readOnly("select jsonb_build_object('active',(select count(*)from mandate_profiles where aktiv),'futureDatabaseExists',exists(select 1 from pg_database where datname="+literal(NEW_DB)+"),'certificate',(select data from helmut_store where data->'payload'->>0='helmut-s500-content-proof/1'and data->'payload'->>3="+literal(metadata.selector.commandHash)+"));");
assert.equal(evidence.active,0);assert.equal(evidence.futureDatabaseExists,false);
const cert=evidence.certificate;assert(cert&&cert.payload.length===13&&cert.payload[0]==='helmut-s500-content-proof/1');
const publicKey=crypto.createPublicKey(config.publicKey);assert.equal(publicKey.asymmetricKeyType,'ed25519');
assert.equal(sha(publicKey.export({type:'spki',format:'der'})),cert.payload[1]);
assert(crypto.verify(null,Buffer.from(JSON.stringify(cert.payload)),publicKey,Buffer.from(cert.signature,'base64')));
assert.equal(cert.payload[2],metadata.selector.operationId);assert.equal(cert.payload[3],metadata.selector.commandHash);
const P=require('../lib/helmut/synthetik-500-profile'),packet=require('../lib/helmut/synthetik-500-direct-codec').decode(JSON.parse(encoded));
assert.equal(P.hash(packet.command),metadata.selector.commandHash);const plan=packet.command.slot.plan;
assert.equal(P.hash(plan),metadata.planHash);
require('./synthetik-500-w15-signed-chain-test').localEnvironment(config);
// Execute exactly the two identical local configuration lines used by the
// real future harness, without importing/executing that harness's dispatcher.
const harnessPath=path.join(__dirname,'synthetik-500-w15-unit0-runtime.js'),source=fs.readFileSync(harnessPath,'utf8');
const lines=source.split('\n').filter(x=>x.trim().startsWith('process.env.AZURE_OPENAI_ENDPOINT=new URL(inputs.responsesURL).origin;'));
assert.equal(lines.length,2);assert.equal(lines[0].trim(),lines[1].trim());
assert(lines[0].includes("process.env.AZURE_OPENAI_DEPLOYMENT='gpt-5-mini-eu';"));
const inputs={responsesURL:plan.routeContract.route.responsesUrl};
vm.runInThisContext('(function(inputs){'+lines[0]+'})',{filename:'exact-local-azure-settings'})(inputs);
try{
 const ai=require('../lib/helmut/ai'),configuration=ai.runtimeProviderConfiguration(),resolved=configuration.resolved;
 assert.equal(resolved.sendEnabled,true);assert.equal(resolved.providerForSend,'azure');assert.equal(resolved.azureConfigurationUsable,true);
 assert.equal(resolved.activeModel.value,'gpt-5-mini-eu');assert.equal(resolved.understandingModel.value,'gpt-5-mini-eu');
 assert.equal(ai.understandingModelName(),'gpt-5-mini-eu');assert.equal(ai.aiProviderName(),'azure');
 const actual={provider:resolved.providerForSend,responsesUrl:resolved.responsesURL,model:ai.understandingModelName(),
  productionCommit:process.env.VERCEL_GIT_COMMIT_SHA,deploymentHost:process.env.VERCEL_URL,deploymentId:process.env.VERCEL_DEPLOYMENT_ID,authMode:'api-key'};
 // Remaining identity/auth fields are the exact env/azure branch used by ai.responsesRoute.
 assert.deepEqual(actual,plan.routeContract.route);
 const routeHash=require('../lib/helmut/synthetik-500-kosten-admission').pruefeRouteSnapshot(actual);
 assert.equal(routeHash,P.hash(plan.routeContract.route));
 const finalState=readOnly("select jsonb_build_object('active',(select count(*)from mandate_profiles where aktiv),'operationState',data->'synthetik500DispatchJournal'->'operations'->"+literal(metadata.selector.operationId)+"->>'state')from helmut_store where id='main-auth';");
 assert.equal(finalState.active,0);assert.equal(finalState.operationState,'unknown');
 save('ROUTE_CHECK.SAFE.json',{status:'PASS_LOCAL_ROUTE_MATCH_ONLY',checkedAtUTC:new Date().toISOString(),actual,expected:plan.routeContract.route,routeHash,
  signatureVerified:true,signedReferenceSelector:metadata.selector,planHash:metadata.planHash,signingPublicKeySHA256:cert.payload[1],
  signatureScope:'Historical signed content hash verified with Ed25519 and exact decoded command/plan hash; no execution admission/native-content freshness claim or old approval reused',
  originalSignedCertificateIssuedAtUTC:cert.payload[10],originalSignedCertificateExpiresAtUTC:cert.payload[11],historicalAuthorityReused:false,
  actualConfigurationResolver:'ai.runtimeProviderConfiguration + ai.understandingModelName',allSevenRouteFieldsEqual:true,
  modelValueSource:resolved.understandingModel.source,localHarnessSHA256:sha(source),certificateSHA256:sha(JSON.stringify(cert)),
  originalEncodedCommandSHA256:sha(encoded),activeProfilesBefore:evidence.active,activeProfilesAfter:finalState.active,
  newDatabaseName:NEW_DB,newDatabaseCreated:false,profileActivations:0,unitExecutions:0,providerCalls:0,databaseWrites:0,
  productionChanges:0,actualAzureAccountSkuOrTariffProven:false,executionAuthorized:false});
 console.log('PASS: exact local Azure selection and all7 fields match historical signed plan;0 DB writes/activations/Units/provider calls.');
}finally{delete process.env.AZURE_OPENAI_ENDPOINT;delete process.env.AZURE_OPENAI_KEY;delete process.env.AZURE_OPENAI_DEPLOYMENT;}
