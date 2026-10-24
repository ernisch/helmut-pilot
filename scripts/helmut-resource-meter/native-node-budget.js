'use strict';
// LOCAL runtime observation. No Worker preload, GC, ref/unref, retry or terminate.
const fs=require('node:fs'),path=require('node:path'),v8=require('node:v8');
const {threadId}=require('node:worker_threads'),dc=require('node:diagnostics_channel');
let installed=false,installedDirectory=null,runtimeObserved=false;
function install(directory) {
  if(installed || process.version!=='v24.19.0' || process.env.VERCEL
    || process.env.HELMUT_NATIVE_NODE_OLD_SPACE_MIB!=='384'
    || !path.isAbsolute(directory) || !fs.statSync(directory).isDirectory())
    throw Error('LOCAL_NODE_HEAP_BUDGET_CONFIGURATION');
  const old=process.execArgv.filter(x=>/^--max[-_]old[-_]space[-_]size(?:=|$)/.test(x));
  const young=process.execArgv.filter(x=>/^--max[-_]semi[-_]space[-_]size(?:=|$)/.test(x));
  if(!old.length || old.some(x=>x!=='--max-old-space-size=384') || !young.length
    || young.some(x=>x!=='--max-semi-space-size=16') || process.env.NODE_OPTIONS)
    throw Error('LOCAL_NODE_HEAP_BUDGET_STARTUP_DRIFT');
  installed=true;installedDirectory=directory;
  const counts={discovered:0,measured:0,exited:0,failed:0};
  const validHeap=n=>Number.isSafeInteger(n)&&n>0&&n<=448*1024**2;
  function write(prefix,id,phase,row) {
    fs.writeFileSync(path.join(directory,`${prefix}_${process.pid}_${id}.${phase}.SAFE.json`),
      JSON.stringify(row)+'\n',{flag:'wx',mode:0o600});
  }
  function receipt(phase) {
    const heapSizeLimitBytes=v8.getHeapStatistics().heap_size_limit;
    if(!validHeap(heapSizeLimitBytes))throw Error('LOCAL_NODE_HEAP_LIMIT_NOT_EFFECTIVE');
    write('NODE_HEAP',threadId,phase,{schema:'helmut-local-node-heap-budget/1',phase,pid:process.pid,threadId,
      oldSpaceMiB:384,semiSpaceMiB:16,heapSizeLimitBytes,workerCounts:{...counts},heapLimitIsNotTotalRSS:true});
  }
  receipt('STARTED');
  const channel=dc.channel('worker_threads');
  channel.subscribe(({worker})=>{
    const id=worker.threadId,context={measured:false,failed:false};counts.discovered++;
    const base={schema:'helmut-local-node-worker-budget/1',pid:process.pid,threadId:id,observerThreadId:threadId};
    function failed(error) {
      if(!context.failed){context.failed=true;counts.failed++;}
      try{write('NODE_WORKER',id,'FAILED',{...base,phase:'FAILED',errorType:error?.name||'Error'});}catch{}
    }
    try {
      if(!Number.isSafeInteger(id)||id<1||typeof worker.getHeapStatistics!=='function')throw Error('LOCAL_WORKER_BUDGET_API');
      write('NODE_WORKER',id,'DISCOVERED',{...base,phase:'DISCOVERED'});
      worker.once('online',()=>{
        // Exactly one live request. Before online the native env may not exist.
        try {
          worker.getHeapStatistics().then(stats=>{
            try {
              if(!validHeap(stats.heap_size_limit))throw Error('LOCAL_WORKER_HEAP_LIMIT_NOT_EFFECTIVE');
              write('NODE_WORKER',id,'STARTED',{...base,phase:'STARTED',oldSpaceMiB:384,semiSpaceMiB:16,
                heapSizeLimitBytes:stats.heap_size_limit,measurement:'LIVE_GET_HEAP_STATISTICS'});
              context.measured=true;counts.measured++;
            }catch(error){failed(error);}
          },failed);
        }catch(error){failed(error);}
      });
      worker.once('exit',code=>{
        counts.exited++;
        try{write('NODE_WORKER',id,'EXITED',{...base,phase:'EXITED',exitCode:code,
          startupBudgetVerified:context.measured&&!context.failed,noPostExitHeapMeasurementClaimed:true});}
        catch(error){failed(error);}
      });
    }catch(error){failed(error);}
  });
  process.once('exit',()=>receipt('EXITED'));
}
// Fixed, sparse observations of the actual runtime main isolate. No polling,
// heap snapshots, forced collection, workload references or per-GC history.
// The existing native/HTTP installation authenticates this source and output.
function observeRuntime(initialCounts) {
  if(!installed || runtimeObserved || threadId!==0)throw Error('LOCAL_RUNTIME_MEMORY_CONFIGURATION');
  runtimeObserved=true;
  const {PerformanceObserver,performance,constants}=require('node:perf_hooks');
  const gcKinds=new Set(['MINOR','MINOR_MARK_SWEEP','MAJOR','INCREMENTAL','WEAKCB']
    .map(name=>constants['NODE_PERFORMANCE_GC_'+name]));
  const countKeys=['requests','mutations','scopes','validations','predecessors','units','events','errors'];
  const indices=new Set([0,24,49,74,99,124,149,174,199,224,249,274,299,324,349,374,399,424,449,474,499]);
  const identity={pid:process.pid,threadId,node:process.version,startTicks:null,nspid:null,pidNamespace:null,
    hostPIDMapping:'NOT_ESTABLISHED'};
  // These are local observations, never an invented namespace-to-host mapping.
  for(const [key,read]of [
    ['startTicks',()=>{const stat=fs.readFileSync('/proc/self/stat','utf8');return stat.slice(stat.lastIndexOf(')')+2).split(' ')[19];}],
    ['nspid',()=>fs.readFileSync('/proc/self/status','utf8').match(/^NSpid:\s+([\d\t ]+)$/m)?.[1].trim().split(/\s+/).map(Number)??null],
    ['pidNamespace',()=>fs.readlinkSync('/proc/self/ns/pid')]
  ]){try{identity[key]=read();}catch{identity[key]=null;}}
  const filename=path.join(installedDirectory,`RUNTIME_MEMORY_${process.pid}_${threadId}.SAFE.jsonl`);
  const fd=fs.openSync(filename,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
  let frames=0,bytes=0,closed=false,broken=false,exportComplete=false;
  const gc={count:0,durationMS:0,byKind:{}};
  const collect=entries=>{for(const entry of entries){
    const kind=entry.detail?.kind;
    if(!gcKinds.has(kind)||!Number.isFinite(entry.duration)||entry.duration<0)
      throw Error('LOCAL_RUNTIME_MEMORY_GC_RECORD');
    gc.count++;gc.durationMS+=entry.duration;
    const row=gc.byKind[kind]??={count:0,durationMS:0};row.count++;row.durationMS+=entry.duration;
  }};
  const observer=new PerformanceObserver(list=>collect(list.getEntries()));
  function sample(phase,index,counts){
    if(closed)throw Error('LOCAL_RUNTIME_MEMORY_CLOSED');
    if(broken)throw Error('LOCAL_RUNTIME_MEMORY_INCOMPLETE');
    try{
    if(Object.keys(counts).length!==countKeys.length||countKeys.some(key=>!Object.hasOwn(counts,key)
      ||!Number.isSafeInteger(counts[key])||counts[key]<0))throw Error('LOCAL_RUNTIME_MEMORY_COUNTS');
    collect(observer.takeRecords());
    const memory=process.memoryUsage(),heap=v8.getHeapStatistics(),spaces=v8.getHeapSpaceStatistics();
    const row={schema:'helmut-local-runtime-memory/1',sequence:frames,phase,index,
      utc:new Date().toISOString(),monotonicMS:performance.now(),identity,counts,memory,heap,spaces,
      naturalGC:gc,gcCallbacksMayLag:true,rssIncludesAllThreads:true,heapIsMainIsolateOnly:true,
      exportComplete,notCommonPeakOrSaving:true};
    const line=Buffer.from(JSON.stringify(row)+'\n');
    if(frames>=100||bytes+line.length>1024**2||line.length>16384)throw Error('LOCAL_RUNTIME_MEMORY_OUTPUT_LIMIT');
    // A short/error write is terminal. No retry or silently completed receipt.
    if(fs.writeSync(fd,line)!==line.length)throw Error('LOCAL_RUNTIME_MEMORY_SHORT_WRITE');
    frames++;bytes+=line.length;
    }catch(error){broken=true;throw error;}
  }
  function close(counts){
    if(closed)return;
    try{sample(exportComplete?'after-final-export':'final-export-incomplete',null,counts);fs.fsyncSync(fd);}
    finally{closed=true;observer.disconnect();fs.closeSync(fd);}
  }
  try{observer.observe({entryTypes:['gc']});sample('initial',null,initialCounts);}
  catch(error){closed=true;observer.disconnect();fs.closeSync(fd);throw error;}
  return Object.freeze({
    event(name,index,counts){
      if(!['actual_J_enter','local_unit_http_complete'].includes(name))return;
      if(!Number.isSafeInteger(index)||index<0||index>=500){broken=true;throw Error('LOCAL_RUNTIME_MEMORY_INDEX');}
      if(indices.has(index))sample(name,index,counts);
    },
    beforeExport(counts){exportComplete=false;sample('before-final-export',null,counts);},
    exportCompleted(){if(closed)throw Error('LOCAL_RUNTIME_MEMORY_CLOSED');exportComplete=true;},close
  });
}
module.exports={install,observeRuntime};
