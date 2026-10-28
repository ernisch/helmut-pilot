"use strict";
// Allocation stress only. INERT end-state data; never enter a Unit or authorize a send.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { performance, PerformanceObserver, constants } = require("node:perf_hooks");
const BASE = "/tmp/w15-memory-atomic-20261028b", STATE = path.join(BASE, "state"), DB = "helmut_w15_memory_atomic_20261028b";
const Budget = require("./fixtures/w15-local-memory-budget.json"), AuthReport = require("./fixtures/w15-auth-measurement-report");
const Durable = require("./fixtures/w15-durable-observations");
const sha = x => crypto.createHash("sha256").update(x).digest("hex");
const file = n => path.join(STATE, n);
const read = n => JSON.parse(fs.readFileSync(file(n), "utf8"));
const save = (n,x) => fs.writeFileSync(file(n), JSON.stringify(x,null,2)+"\n", { flag:"wx",mode:0o600 });
function query(sql) {
  const r = spawnSync("psql",["-X","-w","-qAt","-v","ON_ERROR_STOP=1","-U","postgres","-d",DB,"-f","-"],{
    input:"begin read only;set local statement_timeout='10s';"+sql+"rollback;",encoding:"utf8",timeout:15000,maxBuffer:1024*1024,
    env:{PATH:"/usr/bin:/bin",LANG:"C.UTF-8"}});
  assert.equal(r.status,0,"w15-forward-readonly-sql");return JSON.parse(r.stdout.trim());
}
const databaseStatsSQL = Durable.databaseStatsSQL;
function databaseStats() { return query(databaseStatsSQL()); }
function setup() {
  const secret=crypto.randomBytes(48).toString("hex"),b64=x=>Buffer.from(JSON.stringify(x)).toString("base64url"),now=Math.floor(Date.now()/1000);
  const header=b64({alg:"HS256",typ:"JWT"})+"."+b64({role:"service_role",iat:now,exp:now+3600});
  const token=header+"."+crypto.createHmac("sha256",secret).update(header).digest("base64url");
  save("configuration.PRIVATE.json",{database:DB,token,executionAuthority:false});
  fs.writeFileSync(file("postgrest.PRIVATE.conf"),'db-uri = "postgresql://authenticator@localhost/'+DB+'?host=/var/run/postgresql"\n'
    +'db-schemas = "public"\nserver-host = "127.0.0.1"\nserver-port = 3218\ndb-pool = '+Budget.postgrestPool+'\njwt-secret = "'+secret+'"\n',{flag:"wx",mode:0o600});
}
async function gateway() {
  const config=read("configuration.PRIVATE.json"),http=require("node:http");let ready=false;
  for(let i=0;i<50;i++){
    ready=await new Promise(resolve=>{const req=http.get({host:"127.0.0.1",port:3218,path:"/helmut_store?id=eq.main-auth&select=id&limit=1",
      headers:{Authorization:"Bearer "+config.token},timeout:500},res=>{res.resume();res.on("end",()=>resolve(res.statusCode===200));});
      req.on("timeout",()=>req.destroy());req.on("error",()=>resolve(false));});
    if(ready)break;await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert(ready,"w15-forward-postgrest-schema-readiness");
  const g=await require("./fixtures/z3-plattform").starteDatenbankTor({postgrestPort:3218});
  fs.writeFileSync(file("gateway.pid"),String(process.pid),{flag:"wx",mode:0o600});
  process.once("SIGTERM",async()=>{await g.stoppe();process.exit(0);});
  save("gateway.PRIVATE.json",{url:g.url});
}
async function run() {
  const c=read("configuration.PRIVATE.json"),g=read("gateway.PRIVATE.json"),bound=read("END500_MEMORY_BOUND.SAFE.json");
  assert.equal(c.database,DB);assert.equal(c.executionAuthority,false);assert.equal(bound.executionAuthority,false);
  Object.assign(process.env,{SUPABASE_URL:g.url,SUPABASE_SERVICE_ROLE_KEY:c.token,HELMUT_STORAGE_BACKEND:"supabase",HELMUT_SUPABASE_AUTH_STORE_ID:"main-auth",HELMUT_LLM_USAGE_STORAGE:"relational-atomic-v1"});
  const P=require("../lib/helmut/synthetik-500-profile"),S=require("../lib/helmut/storage");
  const report={schema:"helmut-w15-memory-forward/1",status:"UNKNOWN",units:0,providerCalls:0,profileActivations:0,
    executionAuthority:false,originalDatabaseWrites:0,full500Acceptance:false,budget:Budget,startedAtUTC:new Date().toISOString(),cas:[],gc:[],samples:[],database:[]};
  const journal=Durable.open(STATE,"run");
  let index=-1,observed,casAtIndex=0,expectedRevision;
  const contentHash = store => P.hash(Object.fromEntries(Object.entries(store).filter(([k])=>!["_authStoreRevision","w15MemoryProbeSequence"].includes(k))));
  const sample=()=>{const row={atMs:performance.now(),...process.memoryUsage()};report.samples.push(row);journal.write("node-memory",row);};
  const dbSample=()=>{const row={index,atMs:performance.now(),...databaseStats()};report.database.push(row);journal.write("database-statistics",row);return row;};
  const gcObserver=new PerformanceObserver(list=>{for(const e of list.getEntries()){const row={atMs:e.startTime,durationMs:e.duration,kind:e.detail.kind,flags:e.detail.flags};report.gc.push(row);journal.write("node-gc",row);}});
  gcObserver.observe({entryTypes:["gc"]});sample();const timer=setInterval(sample,250);
  const removeAbort=AuthReport.retainOnTermination(()=>({...report,currentIndex:index,authTimings:observed?AuthReport.summarize(observed):null,
    authMutations:observed?.mutations,casWrites:observed?.casWrites}),value=>{journal.write("termination-received",value);save("FORWARD_ABORT.SAFE.json",value);});
  journal.ready();
  try {
    assert.equal(databaseStats().active,0);
    const encoded=fs.readFileSync(file("current-command.PRIVATE.json"));
    const commandBinding=read("CURRENT_COMMAND_BINDING.SAFE.json");assert.equal(commandBinding.executionAuthority,false);
    assert.equal(encoded.length,commandBinding.bytes);assert.equal(sha(encoded),commandBinding.sha256);
    const packet=require("../lib/helmut/synthetik-500-direct-codec").decode(JSON.parse(encoded));
    // A strong reference to actual immutable content, never authority/admission.
    const heldCommand=packet.command;
    assert(heldCommand&&heldCommand.drafts.length===500&&heldCommand.units.length===500);
    const seen=new WeakSet();let objects=0;
    function freeze(x){if(!x||typeof x!=="object"||seen.has(x))return;seen.add(x);objects++;for(const y of Object.values(x))freeze(y);Object.freeze(x);}
    freeze(heldCommand);report.retainedCommand={encodedSHA256:sha(encoded),objects,drafts:500,units:500,authorityUsed:false};
    // Same module baseline as actual HTTP runtime. No listener/route/job starts.
    assert.equal(typeof require("../server"),"function");
    let before=await S.readAuthStore({strict:true});assert.equal(before.llmUsage.length,6000);
    assert.equal(before.w15MemoryFixture.executionAuthority,false);
    report.contentHash=contentHash(before);report.authBytes=Buffer.byteLength(JSON.stringify(before));
    assert.equal(report.authBytes,bound.authJSONBytes);assert(report.authBytes<=Budget.maximumFixtureAuthBytes);
    assert(Budget.postgresWorkMemMiB*1024*1024>=2*report.authBytes);
    before=null;sample();dbSample();
    const Atomic=require("../lib/helmut/llm-usage-atomic"),native=Atomic.write;
    Atomic.write=async function(...args){assert.equal(casAtIndex,0,"w15-forward-no-second-native-write");casAtIndex++;
      const result=await native.apply(this,args);expectedRevision=result._authStoreRevision;return result;};
    observed=require("./synthetik-500-w15-full500-runtime").observeAuth(S,{currentIndex:()=>index});
    journal.observe(observed);
    for(index=0;index<Budget.diagnosticCASWrites;index++){
      assert(!fs.existsSync(file("STOP_REQUESTED.SAFE.json")),"w15-forward-stop-requested");
      casAtIndex=0;expectedRevision=null;const begin=performance.now();
      await S.mutateAuthStore(store=>{store.w15MemoryProbeSequence=index;});
      const fullCallMs=performance.now()-begin;assert(fullCallMs<30000,"w15-forward-auth30");
      assert.equal(casAtIndex,1);assert(expectedRevision);
      const after=await S.readAuthStore({strict:true});
      assert.equal(after._authStoreRevision,expectedRevision);assert.equal(after.w15MemoryProbeSequence,index);
      assert.equal(after.llmUsage.length,6000);assert.equal(contentHash(after),report.contentHash,"w15-forward-postimage");
      assert(observed.assessment().pass,"w15-forward-auth-coverage");
      const row={index,fullCallMs,authTimings:AuthReport.summarize(observed),revisionReadback:true,postimagePreserved:true};report.cas.push(row);
      console.log(JSON.stringify({name:"memory-cas-accepted",...row}));
      if(index%25===24||index===Budget.diagnosticCASWrites-1){const stats=dbSample();assert.equal(stats.active,0);}
    }
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
  } catch(e){report.status="FAIL_OR_UNKNOWN";report.error={...AuthReport.failureMetadata(e),reason:/^[a-z0-9-]{1,160}$/.test(e.message)?e.message:"details-retained-private"};process.exitCode=1;}
  finally {removeAbort();clearInterval(timer);
    // Preserve a genuine final native WAL/TEMP/table/checkpoint sample even
    // when failure occurs before the next25-CAS observation. Never replace
    // the original error or infer completion from a late database read.
    try { dbSample(); } catch (error) {
      report.finalDatabaseObservationFailure = AuthReport.failureMetadata(error);
      report.status = "FAIL_OR_UNKNOWN";process.exitCode = 1;
    }
    sample();gcObserver.disconnect();
    report.authTimings=observed?AuthReport.summarize(observed):null;report.authMutations=observed?.mutations;report.casWrites=observed?.casWrites;
    report.completedAtUTC=new Date().toISOString();save("FORWARD_RESULT.SAFE.json",report);console.log(JSON.stringify({name:"memory-forward-result",status:report.status,cas:report.cas.length}));}
}
async function main(action){assert(require.cache[require.resolve("./lokaler-netzschutz")]);assert.deepEqual(require("./lokaler-netzschutz").pruefe(process.env),[]);
  assert(["setup","gateway","run"].includes(action));assert(!fs.existsSync(file("STOP_REQUESTED.SAFE.json")),"w15-forward-stop-requested");return({setup,gateway,run})[action]();}
if(require.main===module)main(process.argv[2]).catch(()=>{console.error("w15-forward-first-failure");process.exitCode=1;});
module.exports = { databaseStatsSQL, database: DB, base: BASE };
