'use strict';
// LOCAL runtime observation. No Worker preload, GC, ref/unref, retry or terminate.
const fs=require('node:fs'),path=require('node:path'),v8=require('node:v8');
const {threadId}=require('node:worker_threads'),dc=require('node:diagnostics_channel');
let installed=false;
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
  installed=true;
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
module.exports={install};
