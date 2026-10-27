"use strict";
// Exactly one explicitly authorized isolated DR mock unit. Never next/retry/real provider.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const DIR='/tmp/w15-unit0b-20261027',STATE=path.join(DIR,'state');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const PUB='HELMUT_SYNTHETIK500_CONTENT_PUBLIC_KEY',PRIV='HELMUT_SYNTHETIK500_CONTENT_PRIVATE_KEY';
function file(n){return path.join(STATE,n);}
function read(n){const p=file(n),s=fs.lstatSync(p);assert(s.isFile()&&!s.isSymbolicLink()&&s.uid===process.getuid()&&(s.mode&511)===384);return JSON.parse(fs.readFileSync(p));}
function save(n,x){const b=Buffer.from(JSON.stringify(x,null,2)+'\n');fs.writeFileSync(file(n),b,{flag:'wx',mode:384});return {path:file(n),bytes:b.length,sha256:sha(b)};}
function memory(){const events=Object.fromEntries(fs.readFileSync('/sys/fs/cgroup/memory.events','utf8').trim().split('\n').map(x=>x.split(/\s+/)).map(([k,v])=>[k,Number(v)]));return {events,swapCurrentBytes:Number(fs.readFileSync('/sys/fs/cgroup/memory.swap.current','utf8')),currentBytes:Number(fs.readFileSync('/sys/fs/cgroup/memory.current','utf8')),kernelLifetimePeakBytes:Number(fs.readFileSync('/sys/fs/cgroup/memory.peak','utf8')),configuredLimit:fs.readFileSync('/sys/fs/cgroup/memory.max','utf8').trim(),comparisonBudgetBytes:2048000000,requiredReserveBytes:500000000};}
function setup(){
 const EU=require('../lib/helmut/synthetik-500-eu-service-contract'),key=crypto.generateKeyPairSync('ed25519');
 const secret=crypto.randomBytes(48).toString('hex'),now=Math.floor(Date.now()/1000);
 const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url'),unsigned=b64({alg:'HS256',typ:'JWT'})+'.'+b64({role:'service_role',iat:now,exp:now+7200});
 const token=unsigned+'.'+crypto.createHmac('sha256',secret).update(unsigned).digest('base64url');
 fs.writeFileSync(file('signing-key.PRIVATE.pem'),key.privateKey.export({type:'pkcs8',format:'pem'}),{flag:'wx',mode:384});
 const policy=fs.readFileSync(file('publication-policy.PRIVATE.json'),'utf8');
 assert.equal(sha(policy),'274033cdfdd5f1527d0e961a6c00482d61b7be317eeea03e736a6a5948aa6a04');
 save('configuration.PRIVATE.json',{database:'helmut_w15_unit0b_20261027',publicKey:key.publicKey.export({type:'spki',format:'pem'}),policy,
  serviceToken:token,adminSecret:crypto.randomBytes(32).toString('hex'),euHash:EU.HASH,renewalHash:EU.ORDER_RENEWAL_HASH,
  commit:'8fd37534eb077299b240d66d7ff8318fb6a65985',host:'helmut-w15-unit0-local.vercel.app',deploymentId:'dpl_W15Unit0LocalNotProduction'});
 fs.writeFileSync(file('postgrest.PRIVATE.conf'),'db-uri = "postgresql://authenticator@localhost/helmut_w15_unit0b_20261027?host=/var/run/postgresql"\ndb-schemas = "public"\nserver-host = "127.0.0.1"\nserver-port = 3210\ndb-pool = 3\njwt-secret = "'+secret+'"\n',{flag:'wx',mode:384});
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
 const primary=save('local-approval.PRIVATE.json',{scope:'USER_AUTHORIZED_EXACTLY_ONE_ISOLATED_DR_MOCK_UNIT_WITH_500_SYNTHETIC_TEMPORARILY_ACTIVE',selector:m.selector,full500DispatchAuthorized:false,profileActivationAuthorized:true,maximumUnits:1,paidModelsAllowed:false,sourceReceiptSHA256:m.sourceReceiptSHA256});
 const go=save('local-go.PRIVATE.json',{version:'helmut-synthetik500-test-go/1',operationId:m.selector.operationId,productionCommit:c.commit,deploymentId:c.deploymentId,
  planHash:m.planHash,paketHash:m.paketHash,startsAtUTC:m.startsAtUTC,endsAtUTC:m.endsAtUTC,authorizedAtUTC:new Date().toISOString(),
  authorizationReference:'EXPLICIT_USER_ISOLATED_ONE_UNIT_GO:'+primary.sha256,confirmation:'SEPARATES_GO_EXAKT500_SYNTHETIK_PRODUCTION_TEST'});
 const gates={},evidencePins={};
 for(const purpose of C.DIRECT_GATES){gates[purpose]=true;evidencePins[purpose]=save('gate-'+purpose+'.PRIVATE.json',{version:C.ACTUAL_GATE_VERSION,purpose,rootExecutor:'/root',operationId:m.selector.operationId,runId:m.runId,
  productionCommit:c.commit,planHash:m.planHash,commandHash:m.selector.commandHash,acceptedActualScope:true,primaryEvidencePins:[purpose==='testGo'?go:primary]});}
 const admission=save('admission.PRIVATE.json',{version:C.ADMISSION_VERSION,executor:'/root',purpose:'finite-D-R-500',commandHash:m.selector.commandHash,planHash:m.planHash,productionCommit:c.commit,
  admittedAtUTC:new Date().toISOString(),expiresAtUTC:m.endsAtUTC,controlHash:m.controlHash,booksHash:m.booksHash,gates,evidencePins});
 const bytes=fs.readFileSync(file('current-command.PRIVATE.json')),commandPin={path:file('current-command.PRIVATE.json'),bytes:bytes.length,sha256:sha(bytes)};
 await require('../lib/helmut/synthetik-500-production-adapter').install(commandPin,admission);delete process.env[PRIV];packet=null;
 assert(records.length>0&&records.every(x=>x.acknowledged&&x.wallMs<30000));
 save('PREPARE.SAFE.json',{status:'PASS',realClock:true,actualSource23AndKO60PostimagesMatchDerivedInputs:true,fullC:prepared.metrics,authMutations:records,memory:memory(),sharedScope:'existing PostgreSQL/PostgREST/gateway/actual Node including worker threads and file cache',providerCalls:0,profileActivations:500,unitEntries:0});
}
function sql(query){
 const r=require('node:child_process').spawnSync('psql',['-X','-w','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','helmut_w15_unit0b_20261027','-f','-'],{
  input:"begin read only;set local statement_timeout='15s';"+query+'rollback;',encoding:'utf8',timeout:20000,maxBuffer:24*1024*1024,env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'}});
 assert.equal(r.status,0,'w15-unit0-readonly-sql');return JSON.parse(r.stdout.trim());
}
const literal=x=>"'"+String(x).replaceAll("'","''")+"'";
async function run(){
 const c=read('configuration.PRIVATE.json');environment(c);assert(!process.env[PRIV]);
 const S=require('../lib/helmut/storage'),J=require('../lib/helmut/synthetik-500-dispatch-journal'),K=require('../lib/helmut/testkosten-budget'),P=require('../lib/helmut/synthetik-500-profile');
 const m=read('processing-materials.PRIVATE.json'),inputs=read('unit0-provider-input.PRIVATE.json');
 assert.equal(m.database,c.database);assert.equal(c.database,'helmut_w15_unit0b_20261027');
 assert.equal(inputs.row.profile.id,'test-kohorte-synthetik-bb-001');
 process.env.AZURE_OPENAI_ENDPOINT=new URL(inputs.responsesURL).origin;process.env.AZURE_OPENAI_KEY='LOCAL_MOCK_NOT_A_VALID_PROVIDER_KEY';process.env.AZURE_OPENAI_DEPLOYMENT='gpt-5-mini-eu';
 const H=require('./fixtures/w15-unit0-provider'),fixture=H.prepare(inputs);
 assert.equal(fixture.requestBodySHA256,inputs.requestBodySHA256);
 const providerPhases=[],authMutations=[],units=[],errors=[],scopes=[];let activeMutation=null;
 const originalMutate=S.mutateAuthStore;
 S.mutateAuthStore=async function(fn,...rest){const t=performance.now(),row={callbackRuns:0},previous=activeMutation;authMutations.push(row);activeMutation=row;
  try{const result=await originalMutate.call(this,async(...args)=>{row.callbackRuns++;const begin=performance.now();try{return await fn(...args);}finally{row.callbackMs=(row.callbackMs||0)+performance.now()-begin;}},...rest);
   row.acknowledged=true;row.ackMS=performance.now();if(row.finishIndex!==undefined){const u=units.find(u=>u.index===row.finishIndex);assert(u);u.finalACKMS=row.ackMS;}return result;
  }catch(e){row.failure=e.message;throw e;}finally{row.wallMs=performance.now()-t;activeMutation=previous;}
 };
 const enter=J.enter,finish=J.finish;
 J.enter=function(...args){const t=performance.now(),result=enter(...args);assert.equal(units.length,0,'Only one unit may enter');assert.equal(args[3],0);
  units.push({index:args[3],beginMS:t,enteredAtUTC:args[4],deadlineAtUTC:J.current(args[0]).inFlight.deadlineAtUTC,finalACKMS:null});return result;};
 J.finish=function(...args){const result=finish(...args);assert(activeMutation);activeMutation.finishIndex=args[3];return result;};
 const originalScope=S.withSynthetik500PreparedCommand;
 S.withSynthetik500PreparedCommand=async function(args,work){const row={beginMS:performance.now()};scopes.push(row);try{return await originalScope.call(this,args,async()=>{row.openedMS=performance.now();try{return await work();}finally{row.diagnostics=S.synthetik500PreparedDiagnostics();}});}catch(e){row.failure=e.message;throw e;}finally{row.wallMS=performance.now()-row.beginMS;}};
 for(const name of ['buildLageBriefing']){const L=require('../lib/helmut/lage'),original=L[name];L[name]=async function(...args){try{const x=await original.apply(this,args);if(!x?.available)errors.push({phase:name,result:x});return x;}catch(e){errors.push({phase:name,reason:e.message});throw e;}};}
 for(const name of ['readSynthetik500Runtime','readSynthetik500CurrentInputs','getProfileFromDb','synthetik500ReviewStorageContract','storeSynthetik500ImmutableDraft','getSynthetik500ImmutableDraft','insertLageEntwurfsbeleg','retainSynthetik500ProductionEvidence','reserveLlmCall','recordLlmUsage']){
  const original=S[name];S[name]=async function(...args){try{return await original.apply(this,args);}catch(e){errors.push({phase:name,reason:e.message});throw e;}};
 }
 const readSenderClaim=({phase,body})=>{
  const offset=phase==='D'?0:1;
  const row=sql("with a as(select data from helmut_store where id='main-auth'),o as(select data, data->'synthetik500DispatchJournal'->'operations'->"+literal(m.selector.operationId)+" op from a),t as(select *,op->'attempts'->(op->'units'->0->'intentIds'->>"+offset+") attempt from o),c as(select *,data->'testKostenTage'->(attempt->>'day')->'calls'->(attempt->>'ticketId') call from t) select jsonb_build_object('operationId',op->>'operationId','commandHash',op->>'commandHash','index',(op->'inFlight'->>'index')::int,'journalState',op->>'state','attemptStatus',attempt->>'status','reservationStatus',call->>'status','actualRequestHash',call->'admission'->>'actualRequestHash','planHash',call->'admission'->>'planHash','intentId',call->'admission'->>'intentId','expectedIntentId',op->'units'->0->'intentIds'->>"+offset+") from c;");
  assert.equal(row.planHash,m.planHash);assert.equal(row.intentId,row.expectedIntentId);
  assert.equal(row.actualRequestHash,require('../lib/helmut/synthetik-500-kosten-admission').requestHash(body));
  return row;
 };
 const before=sql("select jsonb_build_object('active',(select count(*)from mandate_profiles where aktiv),'auth',(select data from helmut_store where id='main-auth'));" );
 assert.equal(before.active,500);assert.equal(before.auth[J.KEY].operations[m.selector.operationId].state,'installed');
 // Deliberately local dummy, never a configured Production credential. All HTTPS is intercepted below.
 process.env.AZURE_OPENAI_ENDPOINT=new URL(inputs.responsesURL).origin;process.env.AZURE_OPENAI_KEY='LOCAL_MOCK_NOT_A_VALID_PROVIDER_KEY';process.env.AZURE_OPENAI_DEPLOYMENT='gpt-5-mini-eu';
 const provider=H.install({fixture,selector:m.selector,readSenderClaim,providerPhases});
 const http=require('node:http'),server=http.createServer(require('../server'));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const memoryBefore=memory();let response,status,body,httpWallMs;
 try{
  const t=performance.now();response=await fetch('http://127.0.0.1:'+server.address().port+'/api/ops/synthetik500-direkt',{
   method:'POST',headers:{Authorization:'Bearer '+c.adminSecret,'Content-Type':'application/json',Connection:'close'},
   body:JSON.stringify({action:'start',...m.selector}),signal:AbortSignal.timeout(120000)});
  status=response.status;body=await response.json();httpWallMs=performance.now()-t;
 }finally{provider.restore();delete process.env.AZURE_OPENAI_KEY;delete process.env.AZURE_OPENAI_ENDPOINT;delete process.env.AZURE_OPENAI_DEPLOYMENT;
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 const after=sql("select jsonb_build_object('active',(select count(*)from mandate_profiles where aktiv),'auth',(select data from helmut_store where id='main-auth'),"
  +"'evidence',(select data from helmut_store where id="+literal('synthetik500-evidence-'+m.selector.operationId+'-0')+"));");
 const op=after.auth[J.KEY].operations[m.selector.operationId],evidence=after.evidence;
 const positions=evidence?.positions?.map(x=>({mandatsId:x.mandatsId,bereich:x.bereich,status:x.status,ergebnisHash:x.ergebnisHash,fachstatus:x.fachstatus}))||[];
 for(const u of units)u.wallMS=u.finalACKMS===null?null:u.finalACKMS-u.beginMS;
 const mem=memory();mem.comparisonReserveBytes=2048000000-mem.kernelLifetimePeakBytes;
 const actualCalls=Object.values(op.attempts),checks={noObservedApplicationErrors:errors.length===0,httpSuccess:status===200&&body?.ok===true&&body.result?.completedUnits===1&&body.result?.dispatchedUnits===1,
  exactlyOneEntered:units.length===1&&op.units.filter(u=>u.entered).length===1&&op.units[0].entered===true,
  exactlyTwoMockCalls:provider.count()===2&&provider.pending()===0&&providerPhases.length===2,
  bothProviderDelaysAtLeast19900MS:providerPhases.length===2&&providerPhases.every(p=>p.actualDelayMS>=19900),
  unitBelow60000MS:units.length===1&&units[0].wallMS!==null&&units[0].wallMS<60000,
  everyAuthAcknowledgedBelow30000MS:authMutations.length>0&&authMutations.every(a=>a.acknowledged&&a.wallMs<30000&&a.callbackRuns===1),
  threeExpectedStoredPositions:positions.length===3&&positions.every(p=>p.mandatsId===inputs.row.profile.id&&p.status==='stored-unreviewed')&&new Set(positions.map(p=>p.bereich)).size===3,
  twoAttemptsAccounted:actualCalls.length===2&&actualCalls.every(x=>x.status==='accounted'),
  oneOutputNoInFlight:op.index===1&&op.inFlight===null&&Object.keys(op.outputs).length===1,
  nativeActive500AtEntryAndEndRead:after.active===500&&evidence?.activeRuntime?.aktiv===500,
  commonComparisonReserveAtLeast500MB:mem.comparisonReserveBytes>=500000000,
  memoryEventsUnchanged:JSON.stringify(memoryBefore.events)===JSON.stringify(mem.events)};
 const result={schema:'helmut-w15-unit0-function-proof/1',status:Object.values(checks).every(Boolean)?'PASS_BOUNDED_FUNCTION_AND_COMPARISON_BUDGET':'FAIL_OR_UNKNOWN',
  selector:m.selector,checks,http:{status,body,wallMs:httpWallMs},units,authMutations,providerPhases,positions,errors,scopes,
  memoryBefore,memoryAfter:mem,technicalMemoryLimitEnforced:mem.configuredLimit==='2048000000',
  commonMemoryScope:'whole existing PG container: PostgreSQL/PostgREST/gateway/Node/worker threads/charged cache; lifetime kernel peak not reset; host input assembler excluded',
  modelCalls:0,localSimulations:provider.count(),full500Run:false,productionActions:0,privateKeyPresent:false,
  noAutomaticRetry:true,remaining:['full500/1500 final proof','final fully grown ledger Auth30','technically enforced common memory limit','live sources and independent result quality before Production']};
 save('UNIT0_RESULT.SAFE.json',result);
 assert(Object.values(checks).every(Boolean),'w15-unit0-first-failure-or-unknown-stop');
}
const action=process.argv[2];assert(['setup','gateway','prepare','run'].includes(action));
Promise.resolve().then(()=>({setup,gateway,prepare,run})[action]()).catch(e=>{try{save(action+'-FIRST-FAILURE.SAFE.json',{status:'FAIL',reason:e.message,atUTC:new Date().toISOString(),memory:memory(),noAutomaticRetry:true});}catch{}console.error(e.message);process.exitCode=1;});
