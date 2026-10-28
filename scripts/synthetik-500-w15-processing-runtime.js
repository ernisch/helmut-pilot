"use strict";
// Private isolated benchmark. No activation, unit dispatch, source fetch or paid provider call.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const DIR='/tmp/w15-processing-20261027',STATE=path.join(DIR,'state');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const PUB='HELMUT_SYNTHETIK500_CONTENT_PUBLIC_KEY',PRIV='HELMUT_SYNTHETIK500_CONTENT_PRIVATE_KEY';
function file(n){return path.join(STATE,n);}
function read(n){const p=file(n),s=fs.lstatSync(p);assert(s.isFile()&&!s.isSymbolicLink()&&s.uid===process.getuid()&&(s.mode&511)===384);return JSON.parse(fs.readFileSync(p));}
function save(n,x){const b=Buffer.from(JSON.stringify(x,null,2)+'\n');fs.writeFileSync(file(n),b,{flag:'wx',mode:384});return {path:file(n),bytes:b.length,sha256:sha(b)};}
function memory(){return {currentBytes:Number(fs.readFileSync('/sys/fs/cgroup/memory.current','utf8')),kernelLifetimePeakBytes:Number(fs.readFileSync('/sys/fs/cgroup/memory.peak','utf8')),configuredLimit:fs.readFileSync('/sys/fs/cgroup/memory.max','utf8').trim(),comparisonBudgetBytes:2048000000,requiredReserveBytes:500000000};}
function setup(){
 const EU=require('../lib/helmut/synthetik-500-eu-service-contract'),key=crypto.generateKeyPairSync('ed25519');
 const secret=crypto.randomBytes(48).toString('hex'),now=Math.floor(Date.now()/1000);
 const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url'),unsigned=b64({alg:'HS256',typ:'JWT'})+'.'+b64({role:'service_role',iat:now,exp:now+7200});
 const token=unsigned+'.'+crypto.createHmac('sha256',secret).update(unsigned).digest('base64url');
 fs.writeFileSync(file('signing-key.PRIVATE.pem'),key.privateKey.export({type:'pkcs8',format:'pem'}),{flag:'wx',mode:384});
 const policy=fs.readFileSync(file('publication-policy.PRIVATE.json'),'utf8');
 assert.equal(sha(policy),'274033cdfdd5f1527d0e961a6c00482d61b7be317eeea03e736a6a5948aa6a04');
 save('configuration.PRIVATE.json',{database:'helmut_w15_processing_20261027',publicKey:key.publicKey.export({type:'spki',format:'pem'}),policy,
  serviceToken:token,adminSecret:crypto.randomBytes(32).toString('hex'),euHash:EU.HASH,renewalHash:EU.ORDER_RENEWAL_HASH,
  commit:'3d4fd0da1d1c72cdd4f49d0cffcf4f591c6cfd9b',host:'helmut-w15-processing-local.vercel.app',deploymentId:'dpl_W15ProcessingLocalNotProduction'});
 fs.writeFileSync(file('postgrest.PRIVATE.conf'),'db-uri = "postgresql://authenticator@localhost/helmut_w15_processing_20261027?host=/var/run/postgresql"\ndb-schemas = "public"\nserver-host = "127.0.0.1"\nserver-port = 3210\ndb-pool = 3\njwt-secret = "'+secret+'"\n',{flag:'wx',mode:384});
 save('SETUP.SAFE.json',{status:'READY',publicKeySHA256:sha(key.publicKey.export({type:'spki',format:'der'})),memory:memory(),privateKeyExported:false});
}
async function gateway(){
 const g=await require('./fixtures/z3-plattform').starteDatenbankTor({postgrestPort:3210}),c=read('configuration.PRIVATE.json');c.url=g.url;
 fs.writeFileSync(file('configuration.PRIVATE.json'),JSON.stringify(c),{mode:384});
 save('runtime-public.PRIVATE.json',{...c,serviceToken:'LOCAL_INPUT_ASSEMBLER_NO_SERVICE_ACCESS',adminSecret:'UNUSED_INPUT_ASSEMBLER'});
 fs.writeFileSync(file('gateway.pid'),String(process.pid),{mode:384});
 process.on('SIGTERM',async()=>{await g.stoppe();process.exit(0);});
}
function environment(c){require('./synthetik-500-w15-signed-chain-test').localEnvironment(c);assert(!process.env[PRIV]);}
function observeAuth(S,records){const original=S.mutateAuthStore;S.mutateAuthStore=async function(fn,...rest){
 const start=performance.now(),row={callbackRuns:0};records.push(row);
 try{const result=await original.call(this,async(...args)=>{row.callbackRuns++;const t=performance.now();try{return await fn(...args);}finally{row.callbackMs=(row.callbackMs||0)+performance.now()-t;}},...rest);row.acknowledged=true;return result;}
 finally{row.wallMs=performance.now()-start;}
 };}
async function prepare(){
 const c=read('configuration.PRIVATE.json');environment(c);process.env[PRIV]=fs.readFileSync(file('signing-key.PRIVATE.pem'),'utf8');
 const S=require('../lib/helmut/storage'),C=require('../lib/helmut/synthetik-500-production-command'),P=require('../lib/helmut/synthetik-500-profile');
 const m=read('processing-materials.PRIVATE.json'),records=[];observeAuth(S,records);
 const prepared=await S.prepareSynthetik500StoredCommand(m.selector);assert.equal(prepared.executionAuthorized,false);
 let packet;await S.withSynthetik500InstallationCommand(m.selector,async()=>{
  packet=await S.loadSynthetik500ProductionCommand(m.selector.operationId,m.selector.commandHash);
  await S.readSynthetik500CurrentInputs(packet.command.drafts[0].sources);
 });
 const auth=await S.readAuthStore({strict:true});assert.equal(C.controlHash(auth),m.controlHash);assert.equal(C.booksHash(auth),m.booksHash);
 const primary=save('local-approval.PRIVATE.json',{scope:'SYNTHETIC_PERFORMANCE_INPUT_AUTH_RAM_ONLY_NO_UNIT_ACTIVATION_OR_PRODUCTION',selector:m.selector,full500DispatchAuthorized:false,profileActivationAuthorized:false,sourceReceiptSHA256:m.sourceReceiptSHA256});
 const go=save('local-go.PRIVATE.json',{version:'helmut-synthetik500-test-go/1',operationId:m.selector.operationId,productionCommit:c.commit,deploymentId:c.deploymentId,
  planHash:m.planHash,paketHash:m.paketHash,startsAtUTC:m.startsAtUTC,endsAtUTC:m.endsAtUTC,authorizedAtUTC:new Date().toISOString(),
  authorizationReference:'LOCAL_PREPARED0_FIXTURE_NO_UNIT_ACTIVATION:'+primary.sha256,confirmation:'SEPARATES_GO_EXAKT500_SYNTHETIK_PRODUCTION_TEST'});
 const gates={},evidencePins={};
 for(const purpose of C.DIRECT_GATES){gates[purpose]=true;evidencePins[purpose]=save('gate-'+purpose+'.PRIVATE.json',{version:C.ACTUAL_GATE_VERSION,purpose,rootExecutor:'/root',operationId:m.selector.operationId,runId:m.runId,
  productionCommit:c.commit,planHash:m.planHash,commandHash:m.selector.commandHash,acceptedActualScope:true,primaryEvidencePins:[purpose==='testGo'?go:primary]});}
 const admission=save('admission.PRIVATE.json',{version:C.ADMISSION_VERSION,executor:'/root',purpose:'finite-D-R-500',commandHash:m.selector.commandHash,planHash:m.planHash,productionCommit:c.commit,
  admittedAtUTC:new Date().toISOString(),expiresAtUTC:m.endsAtUTC,controlHash:m.controlHash,booksHash:m.booksHash,gates,evidencePins});
 const bytes=fs.readFileSync(file('current-command.PRIVATE.json')),commandPin={path:file('current-command.PRIVATE.json'),bytes:bytes.length,sha256:sha(bytes)};
 await require('../lib/helmut/synthetik-500-production-adapter').install(commandPin,admission);delete process.env[PRIV];packet=null;
 assert(records.length>0&&records.every(x=>x.acknowledged&&x.wallMs<30000));
 save('PREPARE.SAFE.json',{status:'PASS',realClock:true,actualSource23AndKO60PostimagesMatchDerivedInputs:true,fullC:prepared.metrics,authMutations:records,memory:memory(),sharedScope:'existing PostgreSQL/PostgREST/gateway/actual Node including worker threads and file cache',providerCalls:0,profileActivations:0,unitEntries:0});
}
async function check(){
 const c=read('configuration.PRIVATE.json');environment(c);
 const S=require('../lib/helmut/storage'),C=require('../lib/helmut/synthetik-500-production-command'),J=require('../lib/helmut/synthetik-500-dispatch-journal'),K=require('../lib/helmut/testkosten-budget');
 const m=read('processing-materials.PRIVATE.json'),records=[];observeAuth(S,records);
 const http=require('node:http'),server=http.createServer(require('../server'));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
 const openStart=performance.now();let runtime,diagnostics,guardReason;
 await S.withSynthetik500PreparedCommand(m.selector,async()=>{
  const packet=await S.loadSynthetik500ProductionCommand(m.selector.operationId,m.selector.commandHash);await C.validateStored(packet);await C.admitStored(packet);
  runtime=await S.readSynthetik500Runtime(packet.command);diagnostics=S.synthetik500PreparedDiagnostics();
  try{await require('../lib/helmut/synthetik-500-production-adapter').directRuntime(packet.command);}catch(e){guardReason=e.message;}
 });
 assert.equal(runtime.zustand,'vorbereitet');assert.equal(runtime.aktiv,0);assert.equal(runtime.gesamt,500);assert.equal(runtime.identitaeten,501);
 assert.equal(guardReason,'synthetik500-production-direct-exact500-active-runtime-required');
 const url='http://127.0.0.1:'+server.address().port+'/api/ops/synthetik500-direkt';
 const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+c.adminSecret,'Content-Type':'application/json',Connection:'close'},body:JSON.stringify({action:'status',...m.selector})});
 assert.equal(response.status,200);assert.equal((await response.json()).result.positions.length,1500);
 const before=await S.readAuthStore({strict:true}),claimId=crypto.randomUUID();
 await S.withSynthetik500PreparedCommand(m.selector,async()=>{
  const packet=await S.loadSynthetik500ProductionCommand(m.selector.operationId,m.selector.commandHash);await C.validateStored(packet);await C.admitStored(packet);
  await S.mutateAuthStore(auth=>J.claim(auth,m.selector.commandHash,claimId,new Date().toISOString()));
  await S.mutateAuthStore(auth=>J.stop(auth,m.selector.commandHash,'local-processing-benchmark-ended-without-unit'));
 });
 const after=await S.readAuthStore({strict:true}),op=after[J.KEY].operations[m.selector.operationId];
 assert.equal(op.claimId,claimId);assert.equal(Object.keys(op.attempts).length,0);assert(op.units.every(u=>!u.entered));assert.deepEqual(before[K.KEY],after[K.KEY]);assert.deepEqual(before.llmUsage,after.llmUsage);
 assert.equal(records.length,2);assert(records.every(x=>x.acknowledged&&x.wallMs<30000));assert(!process.env[PRIV]);
 const mem=memory();mem.comparisonReserveBytes=mem.comparisonBudgetBytes-mem.kernelLifetimePeakBytes;mem.reserveAtLeast500MB=mem.comparisonReserveBytes>=500000000;
 save('RUNTIME_AUTH_RAM.SAFE.json',{status:'PASS_PREPARED0_AUTH_CASES',realClock:true,privateKeyPresent:false,runtime,diagnostics,wholeCheckWallMs:performance.now()-openStart,
  exactActivityGuard:guardReason,authMutations:records,authStateScope:'actual500-unit/1000-intent input ledger with preserved5000 usage; not final500-unit ledger',memory:mem,
  memoryAcceptanceScope:'covered preparation and prepared0/Auth only; no active Unit60/common Production acceptance',full500Dispatch:false,unitEntries:0,providerCalls:0,profileActivations:0,
  remaining:['separate isolated activation permission for actual native active500 and one DR mock unit','active Unit60 including two19.9s provider delays','final-ledger Auth30 and active common RAM reserve','live source provision separately before Production']});
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
const action=process.argv[2];assert(['setup','gateway','prepare','check'].includes(action));
Promise.resolve().then(()=>({setup,gateway,prepare,check})[action]()).catch(e=>{try{save(action+'-FIRST-FAILURE.SAFE.json',{status:'FAIL',reason:e.message,atUTC:new Date().toISOString(),memory:memory(),unitEntries:0,profileActivations:0});}catch{}console.error(e.message);process.exitCode=1;});
