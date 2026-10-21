'use strict';
// Short real LOCAL Node children only: no Docker, DB, business call or full500.
// The target runtime guard requires NODE_OPTIONS empty. The equivalent local
// network protection is passed explicitly on every child CLI instead.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict'),cp=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..'),GUARD=path.join(__dirname,'native-node-budget.js');
const HTTP=path.join(__dirname,'http-meter.js'),LOCAL=path.join(ROOT,'scripts/lokaler-netzschutz.js');
const NODE=fs.realpathSync('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'helmut-node-budget-test-'));
// The local preload has already patched network entrypoints when this runs.
// Its inherited NODE_OPTIONS propagation is deliberately moved to the explicit
// CLI on these controlled children; the runtime under test requires it empty.
const clearOptions=path.join(tmp,'keep-installed-local-guard-clear-options.js');
fs.writeFileSync(clearOptions,'delete process.env.NODE_OPTIONS;\n',{mode:0o600});
let cases=0,childCount=0;const failures=[];
function test(name,fn){cases++;try{fn();console.log('PASS '+name);}catch(e){failures.push({name,error:e.message});console.error('FAIL '+name+': '+e.message);}}
function run(name,{flags=['--max-old-space-size=384','--max-semi-space-size=16'],env={},source=null,preloadHTTP=false}={}){
 const directory=path.join(tmp,name);fs.mkdirSync(directory,{mode:0o700});
 const actual={...process.env,NODE_OPTIONS:'',HELMUT_SOURCE_MODE:'off',HELMUT_STORAGE_BACKEND:'local',
  HELMUT_NATIVE_NODE_OLD_SPACE_MIB:'384',HELMUT_NATIVE_NODE_SEMI_SPACE_MIB:'16',...env};
 delete actual.VERCEL;if(Object.hasOwn(env,'VERCEL'))actual.VERCEL=env.VERCEL;
 for(const key of Object.keys(actual))if(actual[key]===undefined)delete actual[key];
 actual.HELMUT_RESOURCE_METER_DIR=directory;
 const body=source||`require(${JSON.stringify(GUARD)}).install(process.argv[1]);process.stdout.write(JSON.stringify({pid:process.pid,heapLimit:require('node:v8').getHeapStatistics().heap_size_limit}));`;
 const args=['--require='+LOCAL,...(!Object.hasOwn(env,'NODE_OPTIONS')?['--require='+clearOptions]:[]),
  ...flags,...(preloadHTTP?['--require='+HTTP]:[]),'-e',body,directory];
 childCount++;const result=cp.spawnSync(NODE,args,{env:actual,encoding:'utf8',timeout:5000,maxBuffer:128*1024});
 if(result.error)throw result.error;
 return {directory,result,files:fs.readdirSync(directory)};
}
function rejected(name,options,pattern){
 const r=run(name,options);assert.notEqual(r.result.status,0,'guard accepted an invalid startup');
 assert.match(r.result.stderr,pattern);assert(!r.files.some(x=>x.endsWith('.STARTED.SAFE.json')),'invalid startup emitted a positive start receipt');
 return r;
}
function rows(r){return r.files.filter(n=>n.startsWith('NODE_HEAP_')).map(n=>JSON.parse(fs.readFileSync(path.join(r.directory,n),'utf8')));}
function validateNative(r,expected){
 assert(r.files.some(n=>/^HTTP_\d+_\d+\.STARTED\.SAFE\.json$/.test(n)),'independent HTTPidentity missing from fixture');
 const script='import importlib.util,sys;from pathlib import Path;s=importlib.util.spec_from_file_location("budget",sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);r=m.node_receipts(Path(sys.argv[2]));assert r["pass_"];print(r["isolates"])';
 const checked=cp.spawnSync('python3',['-c',script,path.join(__dirname,'native-memory-budget.py'),r.directory],{encoding:'utf8',timeout:5000});
 if(expected){assert.equal(checked.status,0,checked.stderr);return Number(checked.stdout.trim());}
 assert.notEqual(checked.status,0,'incomplete Worker proof produced a budget PASS');
 assert.match(checked.stderr,/private Worker/);return null;
}
try{
 test('real384MiB old-space plus16MiB semi-space yields bounded start and exit receipts',()=>{
  const r=run('positive');assert.equal(r.result.status,0,r.result.stderr);
  const observed=JSON.parse(r.result.stdout),receipts=rows(r);assert.equal(receipts.length,2);
  assert.deepEqual(receipts.map(x=>x.phase).sort(),['EXITED','STARTED']);
  for(const row of receipts){assert.equal(row.pid,observed.pid);assert.equal(row.threadId,0);assert.equal(row.oldSpaceMiB,384);
   assert.equal(row.heapSizeLimitBytes,observed.heapLimit);assert(row.heapSizeLimitBytes<=448*1024**2);
   assert.equal(fs.statSync(path.join(r.directory,`NODE_HEAP_${row.pid}_${row.threadId}.${row.phase}.SAFE.json`)).mode&0o777,0o600);}
 });
 test('larger1536MiB explicit old-space option fails before receipt',()=>rejected('old1536',{
  flags:['--max-old-space-size=1536','--max-semi-space-size=16']},/LOCAL_NODE_HEAP_BUDGET_STARTUP_DRIFT/));
 test('an overriding old-space option fails even when the last option would be384',()=>{
  for(const [name,flags]of [['override-large',['--max-old-space-size=384','--max-old-space-size=1536']],
                           ['override-small',['--max-old-space-size=1536','--max-old-space-size=384']]])
   rejected(name,{flags:[...flags,'--max-semi-space-size=16']},/LOCAL_NODE_HEAP_BUDGET_STARTUP_DRIFT/);
 });
 test('missing explicit old-space option is not accepted from defaults',()=>rejected('missing-old',{
  flags:['--max-semi-space-size=16']},/LOCAL_NODE_HEAP_BUDGET_STARTUP_DRIFT/));
 test('unknown spelling of the old-space policy is not an admitted option',()=>rejected('alternate-old',{
  flags:['--max_old_space_size=384','--max-semi-space-size=16']},/LOCAL_NODE_HEAP_BUDGET_STARTUP_DRIFT/));
 test('missing or wrong semi-space policy fails before receipt',()=>{
  for(const [name,flags]of [['missing-semi',['--max-old-space-size=384']],
                           ['semi8',['--max-old-space-size=384','--max-semi-space-size=8']],
                           ['semi64',['--max-old-space-size=384','--max-semi-space-size=64']]])
   rejected(name,{flags},/LOCAL_NODE_(?:HEAP_BUDGET_STARTUP_DRIFT|HEAP_LIMIT_NOT_EFFECTIVE)/);
 });
 test('NODE_OPTIONS cannot introduce hidden runtime flags',()=>rejected('node-options',{
  env:{NODE_OPTIONS:'--require='+LOCAL}},/LOCAL_NODE_HEAP_BUDGET_STARTUP_DRIFT/));
 test('missing or different local budget environment fails closed',()=>{
  for(const [name,value]of [['env-missing',undefined],['env-wrong','1536'],['env-format','0384']])
   rejected(name,{env:{HELMUT_NATIVE_NODE_OLD_SPACE_MIB:value}},/LOCAL_NODE_HEAP_BUDGET_CONFIGURATION/);
 });
 test('production marker rejects local budget installation',()=>rejected('production-marker',{
  env:{VERCEL:'1'}},/LOCAL_NODE_HEAP_BUDGET_CONFIGURATION/));
 test('effective V8 limit is checked independently of correct CLI flags',()=>rejected('v8-drift',{
  source:`require('node:v8').getHeapStatistics=()=>({heap_size_limit:4496293888});require(${JSON.stringify(GUARD)}).install(process.argv[1]);`
 },/LOCAL_NODE_HEAP_LIMIT_NOT_EFFECTIVE/));
 test('duplicate install rejects while preserving the first valid lifetime receipt',()=>{
  const r=run('duplicate',{source:`const g=require(${JSON.stringify(GUARD)});g.install(process.argv[1]);try{g.install(process.argv[1]);process.exitCode=2;}catch(e){if(e.message!=='LOCAL_NODE_HEAP_BUDGET_CONFIGURATION')throw e;}`});
  assert.equal(r.result.status,0,r.result.stderr);assert.equal(rows(r).length,2);
 });
 test('ordinary nonzero exit still writes the runtime exit proof',()=>{
  const r=run('nonzero',{source:`require(${JSON.stringify(GUARD)}).install(process.argv[1]);process.exitCode=7;`});
  assert.equal(r.result.status,7);assert.deepEqual(rows(r).map(x=>x.phase).sort(),['EXITED','STARTED']);
 });
 test('abrupt signal has no fabricated exit receipt',()=>{
  const r=run('signal',{source:`require(${JSON.stringify(GUARD)}).install(process.argv[1]);process.kill(process.pid,'SIGTERM');`});
  assert.equal(r.result.signal,'SIGTERM');assert.deepEqual(rows(r).map(x=>x.phase),['STARTED']);
 });
 test('HTTP integration retains the strict original counter schema',()=>{
  const r=run('http',{preloadHTTP:true,source:`process.stdout.write(String(require('node:v8').getHeapStatistics().heap_size_limit));`});
  assert.equal(r.result.status,0,r.result.stderr);assert.equal(rows(r).length,2);
  const done=r.files.filter(n=>/^HTTP_\d+_\d+\.SAFE\.json$/.test(n));assert.equal(done.length,1);
  const receipt=JSON.parse(fs.readFileSync(path.join(r.directory,done[0]),'utf8'));assert.equal(receipt.schema,'helmut-local-http-meter/2');
  assert(!Object.hasOwn(receipt,'heapSizeLimitBytes'));assert(!Object.hasOwn(receipt,'oldSpaceMiB'));
  const validated=cp.spawnSync('python3',['-c',
   'import sys;from pathlib import Path;from http_receipts import validate;rows,count=validate(Path(sys.argv[1]),True,True);assert count==1 and len(rows)==1',r.directory],
   {env:{...process.env,PYTHONPATH:__dirname},encoding:'utf8',timeout:5000});
  assert.equal(validated.status,0,validated.stderr);
 });
 test('HTTP mode without the explicit heap opt-in remains unchanged',()=>{
  const r=run('opt-out',{preloadHTTP:true,env:{HELMUT_NATIVE_NODE_OLD_SPACE_MIB:undefined},source:'process.stdout.write("local-http-only")'});
  assert.equal(r.result.status,0,r.result.stderr);assert.equal(rows(r).length,0);
  assert(r.files.some(n=>/^HTTP_\d+_\d+\.SAFE\.json$/.test(n)));
 });
 test('an ordinary Worker has distinct thread startup and exit receipts',()=>{
  const r=run('worker-inherited',{source:`
   require(${JSON.stringify(GUARD)}).install(process.argv[1]);
   const {Worker}=require('node:worker_threads');
   const worker=new Worker('require('+JSON.stringify(${JSON.stringify(GUARD)})+').install(require("node:worker_threads").workerData.directory)',{eval:true,workerData:{directory:process.argv[1]}});
   worker.on('error',e=>{throw e;});worker.on('exit',code=>{if(code)process.exitCode=code;});`});
  assert.equal(r.result.status,0,r.result.stderr);const receipts=rows(r);assert.equal(receipts.length,4);
  const ids=new Set(receipts.map(x=>x.pid+'_'+x.threadId));assert.equal(ids.size,2);assert(receipts.some(x=>x.threadId>0));
  assert(receipts.every(x=>x.heapSizeLimitBytes<=448*1024**2));
 });
 test('a Worker with scrubbed env and execArgv is measured externally before its real exit',()=>{
  const r=run('worker-private',{preloadHTTP:true,source:`
   const {Worker}=require('node:worker_threads');
   const worker=new Worker('require("node:worker_threads").parentPort.postMessage(require("node:v8").getHeapStatistics().heap_size_limit);setTimeout(()=>{},100)',
    {eval:true,env:{},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:1280,maxYoungGenerationSizeMb:64}});
   worker.once('message',heap=>process.stdout.write(JSON.stringify({heap,pid:process.pid,workerThreadId:worker.threadId})));
   worker.once('error',e=>{throw e;});worker.once('exit',code=>{if(code)process.exitCode=code;});`});
  assert.equal(r.result.status,0,r.result.stderr);const observed=JSON.parse(r.result.stdout);assert.equal(observed.heap,432*1024**2);
  assert.equal(rows(r).length,2,'private Worker must not pretend it loaded the HTTP/Node preload');
  const proofs=r.files.filter(n=>n.startsWith('NODE_WORKER_')).map(n=>JSON.parse(fs.readFileSync(path.join(r.directory,n),'utf8')));
  assert.deepEqual(proofs.map(x=>x.phase).sort(),['DISCOVERED','EXITED','STARTED']);
  for(const proof of proofs){assert.equal(proof.pid,observed.pid);assert.equal(proof.threadId,observed.workerThreadId);assert.equal(proof.observerThreadId,0);}
  const start=proofs.find(x=>x.phase==='STARTED');assert.equal(start.measurement,'LIVE_GET_HEAP_STATISTICS');assert.equal(start.heapSizeLimitBytes,observed.heap);
  const exit=proofs.find(x=>x.phase==='EXITED');assert.equal(exit.exitCode,0);assert.equal(exit.startupBudgetVerified,true);assert.equal(exit.noPostExitHeapMeasurementClaimed,true);
  const parentExit=rows(r).find(x=>x.phase==='EXITED');assert.deepEqual(parentExit.workerCounts,{discovered:1,measured:1,exited:1,failed:0});
  assert.equal(validateNative(r,true),2);
 });
 test('verified parent observation covers a regular Worker terminate exitCode1',()=>{
  const r=run('worker-terminate',{preloadHTTP:true,source:`
   const fs=require('node:fs'),path=require('node:path');
   const {Worker}=require('node:worker_threads');
   const worker=new Worker('require("node:worker_threads").parentPort.postMessage("ready");setInterval(()=>{},1000)',{eval:true,env:{},execArgv:[]});
   const id=worker.threadId,proof=path.join(process.argv[1],'NODE_WORKER_'+process.pid+'_'+id+'.STARTED.SAFE.json');
   worker.once('message',()=>{function close(){if(fs.existsSync(proof))worker.terminate().then(code=>{if(code!==1)process.exitCode=2;});else setTimeout(close,5);}close();});
   worker.once('error',e=>{throw e;});`});
  assert.equal(r.result.status,0,r.result.stderr);
  const proof=r.files.filter(n=>/^NODE_WORKER_.*\.EXITED\.SAFE\.json$/.test(n));assert.equal(proof.length,1);
  const exit=JSON.parse(fs.readFileSync(path.join(r.directory,proof[0]),'utf8'));assert.equal(exit.exitCode,1);assert.equal(exit.startupBudgetVerified,true);
  assert.deepEqual(rows(r).find(x=>x.phase==='EXITED').workerCounts,{discovered:1,measured:1,exited:1,failed:0});
  assert.equal(validateNative(r,true),2);
 });
 test('failed live Worker heap measurement remains a failed qualification without retry',()=>{
  const r=run('worker-measurement-reject',{preloadHTTP:true,source:`
   const {Worker}=require('node:worker_threads');let calls=0;
   Worker.prototype.getHeapStatistics=function(){calls++;return Promise.reject(Error('TEST_ONLY_LIVE_MEASUREMENT_REJECTED'));};
   const worker=new Worker('setTimeout(()=>{},100)',{eval:true,env:{},execArgv:[]});
   worker.once('error',e=>{throw e;});worker.once('exit',code=>{if(code)process.exitCode=code;process.stdout.write(String(calls));});`});
  assert.equal(r.result.status,0,r.result.stderr);assert.equal(r.result.stdout,'1','measurement must be attempted exactly once');
  assert(r.files.some(n=>/^NODE_WORKER_.*\.FAILED\.SAFE\.json$/.test(n)));
  assert(!r.files.some(n=>/^NODE_WORKER_.*\.STARTED\.SAFE\.json$/.test(n)));
  assert.equal(rows(r).find(x=>x.phase==='EXITED').workerCounts.failed,1);validateNative(r,false);
 });
 test('a Worker heap measurement above the budget cannot qualify',()=>{
  const r=run('worker-measurement-large',{preloadHTTP:true,source:`
   const {Worker}=require('node:worker_threads');
   Worker.prototype.getHeapStatistics=()=>Promise.resolve({heap_size_limit:4496293888});
   const worker=new Worker('setTimeout(()=>{},100)',{eval:true,env:{},execArgv:[]});
   worker.once('error',e=>{throw e;});worker.once('exit',code=>{if(code)process.exitCode=code;});`});
  assert.equal(r.result.status,0,r.result.stderr);
  assert(r.files.some(n=>/^NODE_WORKER_.*\.FAILED\.SAFE\.json$/.test(n)));
  assert(!r.files.some(n=>/^NODE_WORKER_.*\.STARTED\.SAFE\.json$/.test(n)));
  validateNative(r,false);
 });
 test('runtime observations use real main-isolate scalars at exactly45 fixed boundaries',()=>{
  const r=run('runtime-memory',{source:`
   const fs=require('node:fs'),g=require(${JSON.stringify(GUARD)});g.install(process.argv[1]);
   const counts=()=>Object.fromEntries(['requests','mutations','scopes','validations','predecessors','units','events','errors'].map(k=>[k,0]));
   const o=g.observeRuntime(counts());
   for(let i=0;i<500;i++){o.event('actual_J_enter',i,counts());o.event('unrelated',i,counts());o.event('local_unit_http_complete',i,counts());}
   o.beforeExport(counts());fs.writeFileSync(process.argv[1]+'/TEST_ONLY_EXPORT.json','{}');o.exportCompleted();o.close(counts());o.close(counts());`});
  assert.equal(r.result.status,0,r.result.stderr);
  const file=r.files.find(x=>x.startsWith('RUNTIME_MEMORY_')),p=path.join(r.directory,file);
  const frames=fs.readFileSync(p,'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(frames.length,45);assert(fs.statSync(p).size<=1024**2);assert.equal(fs.statSync(p).mode&0o777,0o600);
  const indices=[0,24,49,74,99,124,149,174,199,224,249,274,299,324,349,374,399,424,449,474,499];
  for(const phase of ['actual_J_enter','local_unit_http_complete'])assert.deepEqual(frames.filter(f=>f.phase===phase).map(f=>f.index),indices);
  assert.equal(frames.at(-1).phase,'after-final-export');assert.equal(frames.at(-1).exportComplete,true);
  for(const [i,f]of frames.entries()){
   assert.equal(f.sequence,i);assert.equal(f.identity.threadId,0);assert.equal(f.identity.hostPIDMapping,'NOT_ESTABLISHED');
   assert(f.heap.heap_size_limit<=448*1024**2);assert(f.heap.total_physical_size>0);assert(f.memory.rss>0);assert(f.spaces.length>0);
   assert.equal(f.rssIncludesAllThreads,true);assert.equal(f.heapIsMainIsolateOnly,true);assert.equal(f.notCommonPeakOrSaving,true);
   assert(Number.isSafeInteger(f.naturalGC.count));assert(!Object.hasOwn(f,'requests'),'collector retained or emitted workload rows');
  }
 });
 test('missing export and rejected counts/index never become a completed export',()=>{
  const r=run('runtime-invalid',{source:`
   const a=require('node:assert/strict'),g=require(${JSON.stringify(GUARD)});g.install(process.argv[1]);
   const c=Object.fromEntries(['requests','mutations','scopes','validations','predecessors','units','events','errors'].map(k=>[k,0]));
   const o=g.observeRuntime(c);a.throws(()=>g.observeRuntime(c),/CONFIGURATION/);
   a.throws(()=>o.beforeExport({...c,requests:{secret:'not retained'}}),/COUNTS/);a.throws(()=>o.event('actual_J_enter',500,c),/INDEX/);
   a.throws(()=>o.close(c),/INCOMPLETE/);a.throws(()=>o.beforeExport(c),/CLOSED/);`});
  assert.equal(r.result.status,0,r.result.stderr);
  const f=r.files.find(x=>x.startsWith('RUNTIME_MEMORY_'));
  const lines=fs.readFileSync(path.join(r.directory,f),'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(lines.length,1);assert.equal(lines.at(-1).phase,'initial');assert.equal(lines.at(-1).exportComplete,false);
 });
 test('preexisting runtime receipt is kept byte-identical instead of overwritten',()=>{
  const r=run('runtime-exclusive',{source:`
   const a=require('node:assert/strict'),fs=require('node:fs'),g=require(${JSON.stringify(GUARD)});g.install(process.argv[1]);
   const p=process.argv[1]+'/RUNTIME_MEMORY_'+process.pid+'_0.SAFE.jsonl';fs.writeFileSync(p,'TEST_ONLY_EXISTING_PROOF');
   a.throws(()=>g.observeRuntime({}),e=>e.code==='EEXIST');a.equal(fs.readFileSync(p,'utf8'),'TEST_ONLY_EXISTING_PROOF');`});
  assert.equal(r.result.status,0,r.result.stderr);
 });
 test('short runtime write is attempted once and closes its actual file descriptor',()=>{
  const r=run('runtime-short-write',{source:`
   const a=require('node:assert/strict'),fs=require('node:fs'),g=require(${JSON.stringify(GUARD)});g.install(process.argv[1]);
   const c=Object.fromEntries(['requests','mutations','scopes','validations','predecessors','units','events','errors'].map(k=>[k,0]));
   const write=fs.writeSync;let calls=0,fd;fs.writeSync=(f,b)=>{calls++;fd=f;return b.length-1;};
   try{a.throws(()=>g.observeRuntime(c),/SHORT_WRITE/);}finally{fs.writeSync=write;}
   a.equal(calls,1);a.throws(()=>fs.fstatSync(fd),e=>e.code==='EBADF');`});
  assert.equal(r.result.status,0,r.result.stderr);
 });
 test('runtime output cap stops beforewrite100plus and cleanup retains incomplete evidence',()=>{
  const r=run('runtime-cap',{source:`
   const a=require('node:assert/strict'),g=require(${JSON.stringify(GUARD)});g.install(process.argv[1]);
   const c=Object.fromEntries(['requests','mutations','scopes','validations','predecessors','units','events','errors'].map(k=>[k,0]));
   const o=g.observeRuntime(c);for(let i=0;i<99;i++)o.beforeExport(c);
   a.throws(()=>o.beforeExport(c),/OUTPUT_LIMIT/);a.throws(()=>o.close(c),/INCOMPLETE/);`});
  assert.equal(r.result.status,0,r.result.stderr);
  const f=r.files.find(x=>x.startsWith('RUNTIME_MEMORY_')),p=path.join(r.directory,f);
  assert.equal(fs.readFileSync(p,'utf8').trim().split('\n').length,100);assert(fs.statSync(p).size<=1024**2);
 });
 test('runtime GC codec accepts all five actual Node kinds including weak callbacks',()=>{
  const r=run('runtime-gc-kinds',{source:`
   const a=require('node:assert/strict'),fs=require('node:fs'),perf=require('node:perf_hooks'),g=require(${JSON.stringify(GUARD)});g.install(process.argv[1]);
   const kinds=['MINOR','MINOR_MARK_SWEEP','MAJOR','INCREMENTAL','WEAKCB'].map(n=>perf.constants['NODE_PERFORMANCE_GC_'+n]);
   a.deepEqual(kinds,[1,2,4,8,16]);let delivered=false,disconnected=0;const Original=perf.PerformanceObserver;
   // Synthetic delivered records test the codec only; no GC is requested.
   perf.PerformanceObserver=class{observe(){}disconnect(){disconnected++;}takeRecords(){if(delivered)return[];delivered=true;return kinds.map(kind=>({detail:{kind,flags:0},duration:1}));}};
   const c=Object.fromEntries(['requests','mutations','scopes','validations','predecessors','units','events','errors'].map(k=>[k,0]));
   try{const o=g.observeRuntime(c);o.beforeExport(c);o.exportCompleted();o.close(c);}finally{perf.PerformanceObserver=Original;}
   a.equal(disconnected,1);const p=process.argv[1]+'/RUNTIME_MEMORY_'+process.pid+'_0.SAFE.jsonl';
   const rows=fs.readFileSync(p,'utf8').trim().split('\\n').map(JSON.parse);a.equal(rows.length,3);
   for(const row of rows){a.equal(row.naturalGC.count,5);a.equal(row.naturalGC.durationMS,5);a.equal(row.naturalGC.byKind[16].count,1);}`});
  assert.equal(r.result.status,0,r.result.stderr);
 });
 console.log(JSON.stringify({scope:'LOCAL_NODE_HEAP_GUARD_ONLY',cases,realShortNodeChildren:childCount,failed:failures.length,
  pass:failures.length===0,DockerCalls:0,databaseCalls:0,full500Runs:0,providerCalls:0}));
 if(failures.length)process.exitCode=1;
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
