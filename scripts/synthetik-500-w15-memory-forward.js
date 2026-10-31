"use strict";
// Allocation stress only. INERT end-state data; never enter a Unit or authorize a send.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { performance, PerformanceObserver, constants } = require("node:perf_hooks");
const BASE = "/tmp/w15-memory-atomic-20261028d", STATE = path.join(BASE, "state"), DB = "helmut_w15_memory_atomic_20261028d";
const Budget = require("./fixtures/w15-local-memory-budget.json"), AuthReport = require("./fixtures/w15-auth-measurement-report");
const Durable = require("./fixtures/w15-durable-observations");
const NativeFailure = require("./fixtures/w15-native-failure");
let nativeStage="setup",nativeAcknowledgedCAS="UNKNOWN";
function firstFailureReporter(send) {
  let first=null;
  return (error,context)=>{if(first===null){first=NativeFailure.project(error,context);
    if(first!==null){try{send({name:"memory-forward-first-failure",failure:first});}catch{}}}return first;};
}
const reportFirstNativeFailure=firstFailureReporter(value=>console.log(JSON.stringify(value)));
function emitNativeFailure(error){let check;try{check=error?.nativeCheck;}catch{}
  return reportFirstNativeFailure(error,{stage:nativeStage,check,acknowledgedCAS:nativeAcknowledgedCAS});}
function checked(label,work){try{return work();}catch(error){
  if(error?.code==="ERR_ASSERTION"){try{error.nativeCheck=label;}catch{}}throw error;}}
const sha = x => crypto.createHash("sha256").update(x).digest("hex");
const file = n => path.join(STATE, n);
const read = n => JSON.parse(fs.readFileSync(file(n), "utf8"));
const save = (n,x) => { const fd=fs.openSync(file(n),"wx",0o600);
  try {fs.writeFileSync(fd,JSON.stringify(x,null,2)+"\n");fs.fdatasyncSync(fd);}finally{fs.closeSync(fd);} };
// Local observation ownership only. No Auth implementation, retry or authority.
function observationLifetime({journal,snapshot,stopObservers,persistAbort,externalStop=()=>false}) {
  let stopped=false,terminating=false,inFlight=null,sealing=null,observersStopped=false,observerStopFailure;
  const copy=value=>JSON.parse(JSON.stringify(value));
  const ensureRunning=()=>{assert(!stopped&&!externalStop(),"w15-forward-stop-requested");
    const state=journal.snapshot();if(state.failureCode){const error=Error(state.failureCode);error.code=state.failureCode;throw error;}};
  function stop(){stopped=true;}
  function stopOnce(){if(!observersStopped){observersStopped=true;try{stopObservers();}catch(e){observerStopFailure=e;}}}
  async function operation(fn){ensureRunning();assert.equal(inFlight,null,"w15-forward-concurrent-operation");
    const pending=Promise.resolve(fn());inFlight=pending;
    try{const result=await pending;ensureRunning();return result;}finally{if(inFlight===pending)inFlight=null;}}
  function signalSnapshot(){stop();terminating=true;stopOnce();return copy({...snapshot(),
    unfinishedOperationOutcome:"UNKNOWN",observerStopFailure:observerStopFailure?AuthReport.failureMetadata(observerStopFailure):null,
    journal:journal.snapshot()});}
  function seal(){
    if(sealing)return sealing;
    stop();stopOnce();
    sealing=(async()=>{const deadline=performance.now()+15000;let timer;
      try{if(inFlight)await Promise.race([inFlight.catch(()=>{}),new Promise((_,reject)=>{
        timer=setTimeout(()=>reject(Error("w15-forward-pending-operation-at-close")),15000);})]);}
      finally{clearTimeout(timer);}
      const remaining=deadline-performance.now();assert(remaining>0,"w15-forward-close-deadline");
      await journal.flush(remaining);let closeTimer;
      const closeRemaining=deadline-performance.now();assert(closeRemaining>0,"w15-forward-close-deadline");
      let result;try{result=await Promise.race([journal.close(),new Promise((_,reject)=>{
        closeTimer=setTimeout(()=>reject(Error("w15-forward-close-deadline")),closeRemaining);})]);}finally{clearTimeout(closeTimer);}
      assert(performance.now()<=deadline,"w15-forward-close-deadline");
      if(observerStopFailure)throw observerStopFailure;return result;})();
    sealing.catch(()=>{});return sealing;
  }
  async function abort(value){
    // The initial immutable UNKNOWN is durable before waiting on an old request.
    persistAbort("initial",value);let error;
    try{if(!sealing)journal.write("termination-received",{currentIndex:value.currentIndex,
      authTimings:value.authTimings,unfinishedOperationOutcome:"UNKNOWN",terminationSignal:value.terminationSignal});
      await seal();}catch(e){error=e;}
    persistAbort("final",{...value,afterStopObservation:copy(snapshot()),journal:journal.snapshot(),
      durableDrainFailure:error?AuthReport.failureMetadata(error):null});
    if(error)throw error;
  }
  return {ensureRunning,operation,stop,signalSnapshot,seal,abort,isTerminating:()=>terminating};
}
function query(sql) {
  const r = spawnSync("psql",["-X","-w","-qAt","-v","ON_ERROR_STOP=1","-U","postgres","-d",DB,"-f","-"],{
    input:"begin read only;set local statement_timeout='10s';"+sql+"rollback;",encoding:"utf8",timeout:15000,maxBuffer:1024*1024,
    env:{PATH:"/usr/bin:/bin",LANG:"C.UTF-8"}});
  checked("w15-forward-readonly-sql",()=>assert.equal(r.status,0,"w15-forward-readonly-sql"));return JSON.parse(r.stdout.trim());
}
const databaseStatsSQL = Durable.databaseStatsSQL;
function databaseStats() { return query(databaseStatsSQL()); }
function setup() {
  const secret=crypto.randomBytes(48).toString("hex"),b64=x=>Buffer.from(JSON.stringify(x)).toString("base64url"),now=Math.floor(Date.now()/1000);
  const header=b64({alg:"HS256",typ:"JWT"})+"."+b64({role:"service_role",iat:now,exp:now+3600});
  const token=header+"."+crypto.createHmac("sha256",secret).update(header).digest("base64url");
  save("configuration.PRIVATE.json",{base:BASE,database:DB,token,nonce:crypto.randomUUID(),maximumMutations:500,
    mode:"INERT_END500_MEMORY_NO_UNITS",executionAuthority:false});
  fs.writeFileSync(file("postgrest.PRIVATE.conf"),'db-uri = "postgresql://authenticator@localhost/'+DB+'?host=/var/run/postgresql"\n'
    +'db-schemas = "public"\nserver-host = "127.0.0.1"\nserver-port = 3218\ndb-pool = '+Budget.postgrestPool+'\njwt-secret = "'+secret+'"\n',{flag:"wx",mode:0o600});
}
async function run() {
  nativeStage="auth-fixture";
  const c=read("configuration.PRIVATE.json"),g=read("gateway.PRIVATE.json"),bound=read("END500_MEMORY_BOUND.SAFE.json");
  checked("w15-forward-common-input-binding",()=>{assert.equal(c.database,DB);assert.equal(c.executionAuthority,false);assert.equal(bound.executionAuthority,false);});
  Object.assign(process.env,{SUPABASE_URL:g.url,SUPABASE_SERVICE_ROLE_KEY:c.token,HELMUT_STORAGE_BACKEND:"supabase",HELMUT_SUPABASE_AUTH_STORE_ID:"main-auth",HELMUT_LLM_USAGE_STORAGE:"relational-atomic-v1"});
  const P=require("../lib/helmut/synthetik-500-profile"),S=require("../lib/helmut/storage");
  const report={schema:"helmut-w15-memory-forward/1",status:"UNKNOWN",units:0,providerCalls:0,profileActivations:0,
    executionAuthority:false,originalDatabaseWrites:0,full500Acceptance:false,budget:Budget,startedAtUTC:new Date().toISOString(),cas:[],gc:[],samples:[],database:[],maximumAuthThroughDurableObservationWallMs:0};
  const journal=Durable.openAsync(STATE,"run");
  let index=-1,observed,casAtIndex=0,expectedRevision,timer,gcObserver,abortScheduled=false;
  const contentHash = store => P.hash(Object.fromEntries(Object.entries(store).filter(([k])=>!["_authStoreRevision","w15MemoryProbeSequence"].includes(k))));
  const sample=()=>{const row={atMs:performance.now(),...process.memoryUsage(),journal:journal.snapshot()};report.samples.push(row);journal.write("node-memory",row);};
  const dbSample=()=>{const row={index,atMs:performance.now(),...databaseStats()};report.database.push(row);journal.write("database-statistics",row);return row;};
  const snapshot=()=>({...report,currentIndex:index,authTimings:observed?AuthReport.summarize(observed):null,
    authMutations:observed?.mutations,casWrites:observed?.casWrites});
  const persistGC=entries=>{const rows=entries.map(e=>({atMs:e.startTime,durationMs:e.duration,kind:e.detail.kind,flags:e.detail.flags}));
    report.gc.push(...rows);for(const row of rows)journal.write("node-gc",row);};
  const lifetime=observationLifetime({journal,snapshot,externalStop:()=>{
    const disk=fs.statfsSync(STATE);assert(disk.bavail*disk.bsize>=224*1024*1024,"w15-forward-disk-closure-reserve");
    return fs.existsSync(file("STOP_REQUESTED.SAFE.json"))||fs.existsSync(file("SERVICE_FAILURE.SAFE.json"));},
    stopObservers:()=>{clearInterval(timer);if(gcObserver){const pending=gcObserver.takeRecords();gcObserver.disconnect();persistGC(pending);}},
    persistAbort:(phase,value)=>save(phase==="initial"?"FORWARD_ABORT_INITIAL.SAFE.json":"FORWARD_ABORT.SAFE.json",value)});
  const removeAbort=AuthReport.retainOnTermination(lifetime.signalSnapshot,lifetime.abort);
  const telemetryFailure=error=>{if(abortScheduled||lifetime.isTerminating())return;abortScheduled=true;lifetime.stop();
    report.status="FAIL_OR_UNKNOWN";report.error||=AuthReport.failureMetadata(error);process.kill(process.pid,"SIGTERM");};
  gcObserver=new PerformanceObserver(list=>{try{persistGC(list.getEntries());}catch(e){telemetryFailure(e);}});
  gcObserver.observe({entryTypes:["gc"]});
  timer=setInterval(()=>{try{const s=journal.snapshot();if(s.failureCode){const error=Error(s.failureCode);error.code=s.failureCode;throw error;}sample();}catch(e){telemetryFailure(e);}},250);
  try {
    nativeStage="journal-ready";
    await journal.ready();lifetime.ensureRunning();sample();
    nativeStage="database-preflight";
    checked("w15-forward-common-input-binding",()=>assert.equal(databaseStats().active,0));
    nativeStage="command-read";
    const encoded=fs.readFileSync(file("current-command.PRIVATE.json"));
    const commandBinding=read("CURRENT_COMMAND_BINDING.SAFE.json");
    checked("w15-forward-command-binding",()=>{assert.equal(commandBinding.executionAuthority,false);
      assert.equal(encoded.length,commandBinding.bytes);assert.equal(sha(encoded),commandBinding.sha256);});
    nativeStage="command-decode";
    const packet=require("../lib/helmut/synthetik-500-direct-codec").decode(JSON.parse(encoded));
    // A strong reference to actual immutable content, never authority/admission.
    const heldCommand=packet.command;
    checked("w15-forward-command-shape",()=>assert(heldCommand&&heldCommand.drafts.length===500&&heldCommand.units.length===500));
    nativeStage="command-freeze";
    const seen=new WeakSet();let objects=0;
    function freeze(x){if(!x||typeof x!=="object"||seen.has(x))return;seen.add(x);objects++;for(const y of Object.values(x))freeze(y);Object.freeze(x);}
    freeze(heldCommand);report.retainedCommand={encodedSHA256:sha(encoded),objects,drafts:500,units:500,authorityUsed:false};
    // Same module baseline as actual HTTP runtime. No listener/route/job starts.
    nativeStage="server-import";
    checked("w15-forward-common-input-binding",()=>assert.equal(typeof require("../server"),"function"));
    nativeStage="auth-read";
    let before=await lifetime.operation(()=>S.readAuthStore({strict:true}));
    nativeStage="auth-fixture";
    checked("w15-forward-auth-usage-count",()=>assert.equal(before.llmUsage.length,6000));
    checked("w15-forward-auth-fixture",()=>assert.equal(before.w15MemoryFixture.executionAuthority,false));
    nativeStage="auth-baseline";
    report.contentHash=contentHash(before);report.authBytes=Buffer.byteLength(JSON.stringify(before));
    checked("w15-forward-auth-baseline-bytes",()=>assert.equal(report.authBytes,bound.authJSONBytes));
    checked("w15-forward-auth-baseline-budget",()=>assert(report.authBytes<=Budget.maximumFixtureAuthBytes));
    checked("w15-forward-auth-workmem",()=>assert(Budget.postgresWorkMemMiB*1024*1024>=2*report.authBytes));
    before=null;sample();dbSample();
    nativeStage="observer-install";
    const Atomic=require("../lib/helmut/llm-usage-atomic"),native=Atomic.write;
    Atomic.write=async function(...args){lifetime.ensureRunning();assert.equal(casAtIndex,0,"w15-forward-no-second-native-write");casAtIndex++;
      const result=await native.apply(this,args);expectedRevision=result._authStoreRevision;return result;};
    observed=require("./synthetik-500-w15-full500-runtime").observeAuth(S,{currentIndex:()=>index});
    journal.observe(observed);
    nativeAcknowledgedCAS=0;
    for(index=0;index<Budget.diagnosticCASWrites;index++){
      lifetime.ensureRunning();
      casAtIndex=0;expectedRevision=null;const begin=performance.now();
      nativeStage="auth-mutate";
      await lifetime.operation(()=>S.mutateAuthStore(store=>{lifetime.ensureRunning();store.w15MemoryProbeSequence=index;}));
      nativeStage="auth-durable-ack";
      const apiThroughACKWallMs=performance.now()-begin;await journal.flush();lifetime.ensureRunning();
      const fullCallMs=performance.now()-begin;assert(fullCallMs<30000,"w15-forward-auth30-including-durable-observation");
      report.maximumAuthThroughDurableObservationWallMs=Math.max(report.maximumAuthThroughDurableObservationWallMs,fullCallMs);
      checked("w15-forward-auth-coverage",()=>{assert.equal(casAtIndex,1);assert(expectedRevision);});
      nativeStage="auth-readback";
      const after=await lifetime.operation(()=>S.readAuthStore({strict:true}));
      nativeStage="auth-postimage";
      checked("w15-forward-auth-revision",()=>assert.equal(after._authStoreRevision,expectedRevision));
      checked("w15-forward-auth-sequence",()=>assert.equal(after.w15MemoryProbeSequence,index));
      checked("w15-forward-auth-usage-count",()=>assert.equal(after.llmUsage.length,6000));
      checked("w15-forward-postimage",()=>assert.equal(contentHash(after),report.contentHash,"w15-forward-postimage"));
      checked("w15-forward-auth-coverage",()=>assert(observed.assessment().pass,"w15-forward-auth-coverage"));
      const row={index,fullCallMs,apiThroughACKWallMs,maximumAuthThroughDurableObservationWallMs:report.maximumAuthThroughDurableObservationWallMs,
        authTimings:AuthReport.summarize(observed),revisionReadback:true,postimagePreserved:true};
      await journal.write("accepted-postimage",row);lifetime.ensureRunning();report.cas.push(row);
      nativeAcknowledgedCAS=report.cas.length;
      console.log(JSON.stringify({name:"memory-cas-accepted",...row}));
      if(index%25===24||index===Budget.diagnosticCASWrites-1){const stats=dbSample();assert.equal(stats.active,0);}
    }
    nativeStage="processing-contract";
    assert(heldCommand.drafts.length===500&&Object.isFrozen(heldCommand)&&heldCommand.units.length===500);
    report.authTimings=AuthReport.summarize(observed);report.authCoverage=observed.assessment();
    report.naturalMajorGCs=report.gc.filter(x=>x.kind===constants.NODE_PERFORMANCE_GC_MAJOR).length;
    assert(report.naturalMajorGCs>=Budget.minimumNaturalMajorGCs,"w15-forward-natural-major-gc");
    const first=report.database[0],last=report.database.at(-1);
    report.completedNaturalCheckpoints=last.checkpoints-first.checkpoints;
    assert(report.completedNaturalCheckpoints>=Budget.minimumCompletedNaturalCheckpoints,"w15-forward-checkpoint-cycles");
    assert(last.autovacuums>first.autovacuums,"w15-forward-natural-autovacuum");
    const mid=report.database.filter(x=>x.index>=199&&x.index<350),late=report.database.filter(x=>x.index>=349);
    const maximum=(rows,k)=>Math.max(...rows.map(x=>Number(x[k])));
    report.plateau={middleWalMax:maximum(mid,"walPhysicalBytes"),lateWalMax:maximum(late,"walPhysicalBytes"),
      middleStoreMax:maximum(mid,"storeBytes"),lateStoreMax:maximum(late,"storeBytes"),
      middleToastMax:maximum(mid,"toastBytes"),lateToastMax:maximum(late,"toastBytes"),
      middleUsageMax:maximum(mid,"usageBytes"),lateUsageMax:maximum(late,"usageBytes"),
      initialTempBytes:first.tempBytes,finalTempBytes:last.tempBytes};
    assert(report.plateau.lateWalMax<=Budget.maximumRetainedWalBytes,"w15-forward-wal-footprint");
    assert(last.walOldest>first.walOldest&&last.walNewest>first.walNewest,"w15-forward-wal-segments-not-recycled");
    assert.equal(last.replicationSlots,0);assert.equal(last.settings.archive_mode,"off");assert.equal(last.settings.wal_keep_size,"0");
    // Positive late growth is NOT called a plateau. Project it conservatively
    // across all remaining writes, with a factor2 and an allocation-page margin.
    const observedGrowth=Math.max(0,report.plateau.lateStoreMax-report.plateau.middleStoreMax)
      +Math.max(0,report.plateau.lateWalMax-report.plateau.middleWalMax)
      +Math.max(0,report.plateau.lateUsageMax-report.plateau.middleUsageMax)+8192;
    report.projectedAdditionalPhysicalBytes=Math.ceil(2*observedGrowth*(Budget.conservativeTotalAuthCASWrites-Budget.diagnosticCASWrites)/150);
    report.remainingGrowthGate="Host must ADD projectedAdditionalPhysicalBytes and64MiB margin to the common measured kernel lifetime peak; no subtraction.";
    assert.equal(last.tempBytes,first.tempBytes,"w15-forward-native-auth-spill");
    assert.equal(last.settings.fsync,"on");assert.equal(last.settings.full_page_writes,"on");assert.equal(last.settings.synchronous_commit,"on");
    assert.equal(Number(last.settings.work_mem),Budget.postgresWorkMemMiB*1024);
    assert.equal(Number(last.settings.max_wal_size),Budget.postgresMaxWalMiB);
    assert.equal(Number(last.settings.autovacuum_naptime),Budget.postgresAutovacuumNaptimeSeconds);
    report.status="PASS_FORWARD_COMPONENTS_COMMON_KERNEL_REVIEW_PENDING";
  } catch(e){report.status="FAIL_OR_UNKNOWN";report.failedAtUTC||=new Date().toISOString();
    report.nativeFailure=emitNativeFailure(e);
    report.error||={...AuthReport.failureMetadata(e),reason:/^[a-z0-9-]{1,160}$/.test(e.message)?e.message:"details-retained-private"};
    try{journal.write("forward-first-failure",{index,error:report.error,failedAtUTC:report.failedAtUTC,
      authTimings:observed?AuthReport.summarize(observed):null});}catch{}
    process.exitCode=1;}
  finally {if(abortScheduled||lifetime.isTerminating())return;
    // Preserve a genuine final native WAL/TEMP/table/checkpoint sample even
    // when failure occurs before the next25-CAS observation. Never replace
    // the original error or infer completion from a late database read.
    nativeStage="final-native-sample";
    try { dbSample(); } catch (error) {
      report.nativeFailure||=emitNativeFailure(error);
      report.finalDatabaseObservationFailure = AuthReport.failureMetadata(error);
      report.status = "FAIL_OR_UNKNOWN";process.exitCode = 1;
    }
    nativeStage="final-node-sample";
    try{sample();}catch(error){report.nativeFailure||=emitNativeFailure(error);report.finalNodeObservationFailure=AuthReport.failureMetadata(error);report.status="FAIL_OR_UNKNOWN";process.exitCode=1;}
    report.authTimings=observed?AuthReport.summarize(observed):null;report.authMutations=observed?.mutations;report.casWrites=observed?.casWrites;
    nativeStage="journal-close";
    try{await lifetime.seal();}catch(error){report.nativeFailure||=emitNativeFailure(error);report.durableJournalFailure=AuthReport.failureMetadata(error);report.status="FAIL_OR_UNKNOWN";process.exitCode=1;}
    if(lifetime.isTerminating())return;
    nativeStage="report-write";
    report.journal=journal.snapshot();report.completedAtUTC=new Date().toISOString();save("FORWARD_RESULT.SAFE.json",report);
    removeAbort();console.log(JSON.stringify({name:"memory-forward-result",status:report.status,cas:report.cas.length}));}
}
async function main(action){assert(require.cache[require.resolve("./lokaler-netzschutz")]);assert.deepEqual(require("./lokaler-netzschutz").pruefe(process.env),[]);
  assert(["setup","run"].includes(action));assert(!fs.existsSync(file("STOP_REQUESTED.SAFE.json")),"w15-forward-stop-requested");return({setup,run})[action]();}
if(require.main===module)main(process.argv[2]).catch(error=>{emitNativeFailure(error);console.error("w15-forward-first-failure");process.exitCode=1;});
module.exports = { databaseStatsSQL, database: DB, base: BASE, observationLifetime, firstFailureReporter };
