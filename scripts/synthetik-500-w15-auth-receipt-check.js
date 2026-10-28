"use strict";

// One reporting-only check. Existing observations are reused; no Auth API,
// application entry point, database, provider, Unit or controller is imported.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { fork } = require("node:child_process");
const Helper = require("./fixtures/w15-auth-measurement-report");
const ROOT = path.resolve(__dirname,"..");
const WITNESS = "/workspace/shared/helmut-w15-auth-observer-check-20261028/AUTH_MEASUREMENT_CHECK.SAFE.json";
const WITNESS_SHA = "ce9c17f64a647220fa26774588f92d5a87f912cd3d40ecfee8e62cd624f983d8";
const ORIGINAL_RUNTIME = "/workspace/shared/helmut-w15-full500-20261028c/stage/app/scripts/synthetik-500-w15-full500-runtime.js";
const PREFIX = "/workspace/shared/helmut-w15-auth-receipt-check-20261028-";
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const pin = p => { const b=fs.readFileSync(p);return {path:p,bytes:b.length,sha256:sha(b)}; };
function privateDirectory(dir) {
  assert(dir.startsWith(PREFIX) && path.dirname(dir)==="/workspace/shared");
  const s=fs.lstatSync(dir);assert(s.isDirectory() && !s.isSymbolicLink() && fs.realpathSync(dir)===dir);
  assert.equal(s.uid,process.getuid());assert.equal(s.mode&0o777,0o700);
}
function observedData() {
  const b=fs.readFileSync(WITNESS);assert.equal(sha(b),WITNESS_SHA);
  const w=JSON.parse(b);assert.equal(w.status,"PASS_GENUINE_ALL_AUTH_WRITES_TIMED");assert.equal(w.coverage.pass,true);
  return { witness:w, observations:structuredClone({mutations:w.mutations,usageSinks:w.usageSinks,casWrites:w.casWrites}) };
}
function withPending(observations) {
  const value=structuredClone(observations);
  value.mutations.push({id:999,kind:"public-mutation",api:"unfinished-fixture",beginMS:4000});
  value.casWrites.push({id:999,envelopeId:999,rowId:"main-auth",beginMS:4001});
  return value;
}
function signalChild(dir) {
  privateDirectory(dir);
  const {observations}=observedData(), pending=withPending(observations);
  const target=path.join(dir,"SIGNAL_OBSERVATIONS.SAFE.json");
  Helper.retainOnTermination(() => ({scope:"REPORT_HELPER_ONLY_REUSED_OBSERVATIONS_NOT_NEW_AUTH_CALLS",
    mutations:pending.mutations,usageSinks:pending.usageSinks,casWrites:pending.casWrites,
    authTimings:Helper.summarize(pending)}), value => {
      fs.writeFileSync(target,JSON.stringify(value)+"\n",{flag:"wx",mode:0o600});
    });
  assert(process.send);process.send({type:"ready",target});
  setInterval(()=>{},1000);
}
function unchangedCore(witness) {
  const original=fs.readFileSync(ORIGINAL_RUNTIME),current=fs.readFileSync(path.join(__dirname,"synthetik-500-w15-full500-runtime.js"));
  assert.equal(original.length,witness.runtimeSourcePin.bytes);assert.equal(sha(original),witness.runtimeSourcePin.sha256);
  const sections=[['authCoverageAssessment','function authCoverageAssessment(', 'function observeAuth('],
    ['observeAuth','function observeAuth(', 'async function setup(']];
  return sections.map(([name,begin,end]) => {
    const slice = bytes => { const text=bytes.toString("utf8"),a=text.indexOf(begin),b=text.indexOf(end,a+begin.length);
      assert(a>=0 && b>a);return Buffer.from(text.slice(a,b)); };
    const a=slice(original),b=slice(current);assert(a.equals(b),"w15-auth-receipt-original-core-drift");
    return {name,bytes:a.length,sha256:sha(a),byteIdentical:true};
  });
}
function waitReady(child) {
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>done(Error("w15-auth-receipt-child-ready-timeout")),5000);
    const message=value=>{if(value?.type==="ready")done(null,value);};
    const exit=()=>done(Error("w15-auth-receipt-child-exited-before-ready"));
    const error=e=>done(e);
    function done(e,value){clearTimeout(timer);child.off("message",message);child.off("exit",exit);child.off("error",error);e?reject(e):resolve(value);}
    child.on("message",message);child.once("exit",exit);child.once("error",error);
  });
}
async function main() {
  assert(require.cache[require.resolve("./lokaler-netzschutz")]);
  assert.deepEqual(require("./lokaler-netzschutz").pruefe(process.env),[]);
  const dir=fs.mkdtempSync(PREFIX);fs.chmodSync(dir,0o700);privateDirectory(dir);
  let child;const report={schema:"helmut-w15-auth-receipt-helper-check/1",status:"UNKNOWN",
    scope:"ONE_REPORTING_HELPER_CHECK_NO_AUTH_DB_UNITS_OR_MODELS",work:dir,
    actualAuthAPICalls:0,databaseQueries:0,databaseWrites:0,unitExecutions:0,providerCalls:0,
    reusedOriginalAuthPASS:true,reusedOriginalSourceQualification:true,retryAllowed:false};
  try {
    const {witness,observations}=observedData();
    report.coreBodies=unchangedCore(witness);
    const summary=Helper.summarize(observations);
    assert.equal(summary.maximumFullCallWallMs,859.089335);assert.equal(summary.maximumCASWallMs,663.495627);
    assert.equal(summary.observedFullCalls,4);assert.equal(summary.completedFullCalls,4);
    assert.equal(summary.completedCASWrites,4);assert.equal(summary.incompleteFullCalls,0);
    assert.equal(summary.incompleteCASWrites,0);assert.equal(summary.timingsUseWholeCallThroughACK,true);
    assert.equal(Object.keys(summary.perAPI).length,4);
    for(const value of Object.values(summary.perAPI))assert.equal(value.count,1);
    const empty=Helper.summarize({});assert.equal(empty.maximumFullCallWallMs,null);assert.equal(empty.maximumCASWallMs,null);
    const pending=withPending(observations),pendingSummary=Helper.summarize(pending);
    assert.equal(pendingSummary.incompleteFullCalls,1);assert.equal(pendingSummary.incompleteCASWrites,1);
    assert.equal(pendingSummary.maximumFullCallWallMs,summary.maximumFullCallWallMs);
    assert.equal(pendingSummary.maximumCASWallMs,summary.maximumCASWallMs);
    child=fork(__filename,["--signal-child",dir],{cwd:ROOT,
      env:{PATH:process.env.PATH,LANG:"C.UTF-8",HELMUT_SOURCE_MODE:"off",HELMUT_STORAGE_BACKEND:"local"},
      execArgv:["--require",require.resolve("./lokaler-netzschutz")],stdio:["ignore","ignore","pipe","ipc"]});
    let stderr="";child.stderr.on("data",b=>{stderr=(stderr+b.toString()).slice(0,8192);});
    const exit=new Promise(resolve=>child.once("exit",(code,signal)=>resolve({code,signal})));
    const ready=await waitReady(child);assert.equal(ready.target,path.join(dir,"SIGNAL_OBSERVATIONS.SAFE.json"));
    assert.equal(child.kill("SIGTERM"),true);
    let timer;const ended=await Promise.race([exit,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error("w15-auth-receipt-child-exit-timeout")),5000);})]);
    clearTimeout(timer);assert.deepEqual(ended,{code:143,signal:null});assert.equal(stderr,"");
    const output=path.join(dir,"SIGNAL_OBSERVATIONS.SAFE.json"),stat=fs.lstatSync(output);
    assert(stat.isFile()&&!stat.isSymbolicLink());assert.equal(stat.mode&0o777,0o600);assert.equal(stat.uid,process.getuid());
    const saved=JSON.parse(fs.readFileSync(output));assert.equal(saved.status,"FAIL_OR_UNKNOWN");
    assert.equal(saved.terminationSignal,"SIGTERM");assert.equal(saved.bestEffortOnly,true);assert.equal(saved.retryAllowed,false);
    assert.deepEqual(saved.mutations,pending.mutations);assert.deepEqual(saved.usageSinks,pending.usageSinks);
    assert.deepEqual(saved.casWrites,pending.casWrites);assert.deepEqual(saved.authTimings,pendingSummary);
    for(const row of [saved.mutations.at(-1),saved.casWrites.at(-1)])
      for(const key of ["wallMs","ackMS","endMS"])assert.equal(Object.hasOwn(row,key),false);
    assert.deepEqual(fs.readdirSync(dir),["SIGNAL_OBSERVATIONS.SAFE.json"]);
    report.status="PASS_AUTH_REPORTING_MAXIMA_AND_REAL_SIGTERM_RETENTION";
    report.originalObservationPin=pin(WITNESS);report.helperPin=pin(require.resolve("./fixtures/w15-auth-measurement-report"));
    report.testPin=pin(__filename);report.currentRuntimePin=pin(path.join(__dirname,"synthetik-500-w15-full500-runtime.js"));
    report.summary=summary;report.pendingSummary=pendingSummary;report.signalOutputPin=pin(output);
    report.childExit=ended;report.directoryMode="0700";report.retainedFileMode="0600";
    report.realSignalTestExecutions=1;report.coreAuthObservationOrAssessmentModified=false;
  } catch(error) {
    report.status="FAIL_NO_RETRY";report.reason=error.code||"w15-auth-receipt-check-failed";process.exitCode=1;
  } finally {
    if(child&&child.exitCode===null&&child.signalCode===null)child.kill("SIGKILL");
    const p=path.join(dir,"AUTH_RECEIPT_HELPER_CHECK.SAFE.json");
    fs.writeFileSync(p,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
    console.log(JSON.stringify({status:report.status,reportPin:pin(p)}));
  }
}
if(require.main===module){
  if(process.argv[2]==="--signal-child")signalChild(process.argv[3]);
  else main().catch(()=>{console.error("w15-auth-receipt-check-first-failure");process.exitCode=1;});
}
