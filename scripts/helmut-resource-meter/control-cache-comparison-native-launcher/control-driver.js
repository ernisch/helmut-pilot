'use strict';
// V8 prepared only. Real U: 5 reads, 4 confirmed CAS writes, 18 controls.
// Readonly canonical overlays select U; identical PartsNEW in BOTH variants.
const fs=require('node:fs'),crypto=require('node:crypto'),v8=require('node:v8');
const {PerformanceObserver}=require('node:perf_hooks'),dc=require('node:diagnostics_channel');
const root='/workspace/helmut-cpu-epoch-20261015',modulePath=root+'/lib/helmut/llm-usage-atomic.js';
const partsPath=root+'/lib/helmut/auth-state-parts.js';
const cfg=JSON.parse(fs.readFileSync('/bench/CLIENT_CONFIG.SAFE.json','utf8'));
const physical=JSON.parse(fs.readFileSync('/bench/SMALL_AUTH_BEFORE.stdout.PRIVATE.txt','utf8'));
const U=require(modulePath),P=require(root+'/lib/helmut/synthetik-500-profile.js');
const meter=require(root+'/scripts/helmut-resource-meter/http-meter.js').current();
const keys=['synthetik500DispatchJournal','synthetik500KostenAdmission','testKostenAuftrag','testKostenTage'];
const revision='_authStoreRevision',probe='localWorkingSetProbe';
const original=JSON.stringify,steps=[],requests=[],calls=[],sends=[],cycles=[];
const started=performance.now(),deadline=started+30000;
const gc={count:0,durationMilliseconds:0,kinds:{}};
const gcObserver=new PerformanceObserver(list=>{for(const e of list.getEntries()){
  gc.count++;gc.durationMilliseconds+=e.duration;const k=String(e.detail?.kind??'unknown');gc.kinds[k]=(gc.kinds[k]||0)+1;
}});
let phase='initial',observing=false,expectedMethod=null,baselineFields=null,baselineHistorySHA=null;
let baselineProof=null,baselineState=null,expectedRevision=physical.data[revision],lastState=null,sequence=0;
const seenRevisions=new Set([expectedRevision]);
const result={schema:'helmut-control-cache-comparison-27-rpc/1',pass:false,variant:cfg.variant,
  nodeVersion:process.version,uCalls:[],authRPCCount:0,rpcResponsesCompleted:0,nativeHTTPSendCount:0,
  steps,requests,nativeHTTPRequests:sends,controlTextStringifyObservations:calls,cycles,
  fullReadCount:0,writeCount:0,controlReadCount:0,mutations:0,restoreCount:0,
  controlCacheLimitBytes:2097152,forcedGC:false,providerCalls:0,full500:false,
  ramSavingClaimed:false,plateauClaimed:false,automaticRetry:false,
  noExtraFullAuthSerialization:true,observerPreservesOriginalArgumentsAndReturn:true,
  observerRetainsControlText:false,fieldHashObserverWorkIncluded:true,
  historyHashScope:'Each full read and confirmed ACK; every control additionally accepts fresh native identical 6000 proof.',
  codecOutputBytesObserved:false,freshNativeChecksAcceptedBySelectedU:false};
function requireThat(ok,reason){if(!ok)throw Error(reason);}
function uuid(x){return typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x);}
function hash(x){return crypto.createHash('sha256').update(x).digest('hex');}
function smallStable(value){
  // Equality for tiny proof/state/probe/ACK/hash metadata only, never Auth or
  // control contents. Native canonical decoders may order the probe keys.
  if(Array.isArray(value))return '['+value.map(smallStable).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort()
    .map(k=>original(k)+':'+smallStable(value[k])).join(',')+'}';
  return original(value);
}
function same(a,b){return smallStable(a)===smallStable(b);}
function proofOf(p){return Object.fromEntries(['generation','count','head','originalHash'].map(k=>[k,p[k]]));}
function stateOf(s){return Object.fromEntries(['version','generation','root','originalHash'].map(k=>[k,s[k]]));}
function memory(){return {process:process.memoryUsage(),heapSizeLimitBytes:v8.getHeapStatistics().heap_size_limit,
  processLifetimeMaxRSSKiB:process.resourceUsage().maxRSS,notWholeNativeGroup:true,
  naturalGC:{count:gc.count,durationMilliseconds:gc.durationMilliseconds,kinds:{...gc.kinds}}};}
const wireFields=['responseBodyReceivedBytes','responseTCPDeliveredBytes','responseHeaderBytes',
  'responseFramingBytes','responses','parseErrors','unparsedResponseBytes','incompleteResponses',
  'unfinishedActiveHTTPParsers','protocolErrors'];
function wire(){const w=meter.snapshot();return Object.fromEntries(wireFields.map(k=>[k,w[k]]));}
function delta(a,b){return Object.fromEntries(wireFields.map(k=>[k,b[k]-a[k]]));}
const sent=dc.channel('undici:client:sendHeaders');
function sentHeaders({request}){
  result.nativeHTTPSendCount++;
  requireThat(sends.length<28,'bounded real native sends');
  sends.push({phase,method:request.method,path:request.path,origin:String(request.origin)});
}
function installObserver(){
  JSON.stringify=function(...args){
    const text=Reflect.apply(original,this,args); // ONE unchanged original invocation/return.
    if(observing&&typeof text==='string'&&text.startsWith('{"synthetik500DispatchJournal":')){
      const value=args[0];
      if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).join('|')===keys.join('|')){
        const frames=(new Error().stack||'').split('\n');
        const prefix='at controlText ('+modulePath+':';
        if(frames.some(f=>f.trim().startsWith(prefix)&&/^\d+:\d+\)$/.test(f.trim().slice(prefix.length)))){
          requireThat(args.length===1&&calls.length<64,'bounded exact controlText invocation');
          calls.push({phase,utf8Bytes:Buffer.byteLength(text,'utf8'),originalInvocations:1,
            returnedOriginalString:true,origin:'controlText at authenticated canonical module frame'});
        }
      }
    }
    return text;
  };
}
async function boundary(round,edge){
  requireThat(performance.now()<deadline,'unchanged whole-client 30s budget');
  const item={schema:'helmut-control-cache-cycle-marker/1',sequence:++sequence,round,edge,nodePID:process.pid};
  const name='/bench/CYCLE_'+sequence+'.MARKER.SAFE.json';
  fs.writeFileSync(name+'.tmp',original(item)+'\n',{flag:'wx',mode:0o600});
  fs.renameSync(name+'.tmp',name); // Publish one complete bounded marker atomically.
  const ack='/bench/CYCLE_'+sequence+'.ACK.SAFE.json';
  while(!fs.existsSync(ack)){
    requireThat(performance.now()<deadline,'30s cycle observation deadline');
    await new Promise(resolve=>setTimeout(resolve,5));
  }
  requireThat(same(JSON.parse(fs.readFileSync(ack,'utf8')),item),'exact round/edge/PID metric ACK');
  return {marker:item,memory:memory(),wire:wire(),atMilliseconds:performance.now()-started};
}
function validateProof(p,s){
  const q=proofOf(p),t=stateOf(s);
  requireThat(q.count===6000,'exact native 6000 ledger proof');
  if(baselineProof===null){
    baselineProof=proofOf(physical.data._llmUsageRef);baselineState=stateOf(physical.data._authStateRef);
  }
  requireThat(same(q,baselineProof)&&t.version===baselineState.version&&t.generation===baselineState.generation
    &&t.originalHash===baselineState.originalHash,'fresh proof/state immutable lineage');
  lastState=t;return q;
}
async function request(path,options){
  requireThat(requests.length<27&&expectedMethod&&options?.method==='POST'&&typeof options.body==='string',
    'one bounded direct selected U invocation');
  const write=expectedMethod==='write',control=expectedMethod==='readControl';
  const route=write?'helmut_auth_state_cas_v1':'helmut_auth_state_graph_read_v1';
  requireThat(path==='/rest/v1/rpc/'+route,'exact selected U route');
  let input=JSON.parse(options.body);
  requireThat(input.id==='main-auth','exact local main-auth target');
  const row={phase,uMethod:expectedMethod,route:'/rpc/'+route,method:'POST',
    requestUTF8Bytes:Buffer.byteLength(options.body,'utf8'),responseReceived:false,selectedUAccepted:false};
  if(write){
    requireThat(Object.keys(input).sort().join('|')==='additions|expectedProof|expectedRevision|expectedState|id|nodes|revision|root'
      &&uuid(input.revision)&&input.expectedRevision===expectedRevision&&!seenRevisions.has(input.revision)
      &&Array.isArray(input.additions)&&input.additions.length===0&&Array.isArray(input.nodes)
      &&same(proofOf(input.expectedProof),baselineProof)&&same(stateOf(input.expectedState),lastState),
      'real fresh no-ledger-append CAS from full private snapshot only');
    row.expectedRevision=input.expectedRevision;row.revision=input.revision;row.additions=0;row.newNodeCount=input.nodes.length;
  }else{
    requireThat(Object.keys(input).join('|')===(control?'id|knownProof|readNonce|knownGraph':'id|knownProof|readNonce')
      &&uuid(input.readNonce)&&!requests.some(r=>r.readNonce===input.readNonce),'exact fresh native read nonce/request');
    row.readNonce=input.readNonce;row.knownProofPresent=input.knownProof!==null;
    row.knownGraph=control?(input.knownGraph===null?'null':'object'):'absent';
  }
  // Keep only tiny expected scalars across the real HTTP await. The symmetric
  // parsing observer must not additionally retain a complete CAS nodes tree.
  const expected={revision:input.revision,root:input.root,readNonce:input.readNonce};
  input=null;
  requests.push(row);result.authRPCCount=requests.length;
  const remaining=deadline-performance.now();requireThat(remaining>0,'whole-client deadline before fetch');
  const response=await fetch('http://127.0.0.1:38419/rpc/'+route,{method:'POST',headers:{'content-type':'application/json'},
    body:options.body,redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.floor(Math.min(20000,remaining))))});
  requireThat(response.status===200,'real local HTTP200');
  const value=await response.json(); // Same actual decoded object delivered unchanged to U.
  row.responseReceived=true;result.rpcResponsesCompleted++;
  const accepted=write?(Array.isArray(value)&&value.length===1?value[0]:null):value;
  requireThat(accepted&&accepted.proof&&accepted.state,'actual graph/CAS proof and state');
  row.proof=validateProof(accepted.proof,accepted.state);row.state=stateOf(accepted.state);
  if(write){
    requireThat(accepted.id==='main-auth'&&accepted.revision===expected.revision&&accepted.state.root===expected.root,
      'exact actual CAS ACK, no retry');
    expectedRevision=expected.revision;seenRevisions.add(expectedRevision);
  }else{
    requireThat(value.data?.[revision]===expectedRevision&&value.historyReuse?.nonce===expected.readNonce,
      'fresh actual revision/history nonce');
    row.historyReuse={nonce:value.historyReuse.nonce,reused:value.historyReuse.reused,binding:value.historyReuse.binding};
    row.graphPresent=value.graph!==null&&value.graph!==undefined;
    if(control){
      requireThat(value.graphReuse?.nonce===expected.readNonce,'fresh graph nonce');
      row.graphReuse={nonce:value.graphReuse.nonce,reused:value.graphReuse.reused,
        actualPayloadsChecked:value.graphReuse.actualPayloadsChecked,nodeCount:value.graphReuse.nodeCount,
        nodeDigest:value.graphReuse.nodeDigest,binding:value.graphReuse.binding};
    }
  }
  return value;
}
function verifyLogical(value,full){
  requireThat(value&&keys.every(k=>Object.hasOwn(value,k))&&value[revision]===expectedRevision,
    'four real controls and exact fresh revision');
  const fields=Object.fromEntries(keys.map(k=>[k,P.hash(value[k])]));
  if(baselineFields===null)baselineFields=fields;
  requireThat(same(fields,baselineFields),'four control-field logical hashes unchanged');
  let historySHA=null;
  if(full){
    requireThat(U.hasSnapshot(value)&&Array.isArray(value.llmUsage)&&value.llmUsage.length===6000,
      'full original private snapshot and logical history6000');
    historySHA=P.hash(value.llmUsage);if(baselineHistorySHA===null)baselineHistorySHA=historySHA;
    requireThat(historySHA===baselineHistorySHA,'full logical history SHA unchanged');
  }else requireThat(!U.hasSnapshot(value)&&Object.isFrozen(value)&&Object.getOwnPropertySymbols(value).length===0
    &&Object.keys(value).sort().join('|')===[...keys,revision].sort().join('|'),
    'exact detached read-only control view; no CAS/private snapshot');
  return {controlFieldSHA256:fields,historySHA256:historySHA,historyCount:6000,
    freshNativeHistoryProofUnchanged:true,fullLogicalHistoryHashed:full};
}
async function invoke(method,label,input=null){
  requireThat(expectedMethod===null&&performance.now()<deadline,'serial direct U call only');
  phase=label;expectedMethod=method;
  const n=requests.length,c=calls.length,t=performance.now(),beforeWire=wire(),beforeMemory=memory();
  let value=method==='write'?await U.write(input,{request,rowId:'main-auth',target:'http://127.0.0.1:38419|main-auth'}):
    await U[method]({request,rowId:'main-auth',target:'http://127.0.0.1:38419|main-auth'});
  requireThat(requests.length===n+1,'exactly one RPC, no automatic retries');
  requests[n].selectedUAccepted=true;expectedMethod=null;
  const logical=verifyLogical(value,method!=='readControl');
  const afterWire=wire(),change=delta(beforeWire,afterWire);
  requireThat(result.nativeHTTPSendCount===n+1&&sends[n]?.method==='POST'
    &&sends[n]?.path===requests[n].route&&sends[n]?.origin==='http://127.0.0.1:38419'
    &&change.responses===1&&afterWire.parseErrors===0&&afterWire.unparsedResponseBytes===0
    &&afterWire.incompleteResponses===0&&afterWire.unfinishedActiveHTTPParsers===0&&afterWire.protocolErrors===0,
    'one genuine send and complete passive framed response per U call');
  steps.push({phase,uMethod:method,wallMilliseconds:performance.now()-t,memoryBefore:beforeMemory,memoryAfter:memory(),
    wireDelta:change,controlTextStringifyCount:calls.length-c,selectedUAcceptance:true,...logical});
  result.uCalls.push(method);result[method==='read'?'fullReadCount':method==='write'?'writeCount':'controlReadCount']++;
  return value;
}
async function main(){
  try{
    requireThat(['OLD','NEW'].includes(cfg.variant)&&process.version==='v24.19.0'&&meter&&U.enabled()&&U.controlReadEnabled(),
      'selected real runtime/control flags');
    for(const [p,item] of [[modulePath,cfg.uOverlayPin],[partsPath,cfg.partsOverlayPin]]){
      const raw=fs.readFileSync(p);requireThat(raw.length===item.bytes&&hash(raw)===item.sha256,'actual canonical loaded bytes');
    }
    requireThat(process.env.HELMUT_AUTH_GRAPH_READ_REUSE==='off'&&process.env.HELMUT_AUTH_SINGLE_WRITE_CAPTURE==='off'
      &&!process.env.NODE_OPTIONS,'unchanged explicit heap/graph/capture flags');
    requireThat(physical.rows===1&&physical.physicalBytes===606&&physical.sha===
      '9b62ab352733025f1b752e637f6360d7813b10ea86f134168698e8f4f0d11bc9'
      &&uuid(expectedRevision)&&physical.data._llmUsageRef.count===6000,'independent original physical Auth606 proof');
    gcObserver.observe({entryTypes:['gc']});installObserver();observing=true;sent.subscribe(sentHeaders);
    result.baseline={memory:memory(),wire:wire()};
    for(let round=0;round<3;round++){
      const start=await boundary(round,'start');
      let auth=await invoke('read','round'+round+'.fullRead');
      requireThat(round===0?!Object.hasOwn(auth,probe):same(auth[probe],{scope:'LOCAL_CONTROL_CACHE_COMPARISON',round:round-1}),
        'fresh full read contains only expected prior local probe');
      if(round===0)requireThat(same(lastState,baselineState),'initial selected native root exactly original');
      auth[probe]={scope:'LOCAL_CONTROL_CACHE_COMPARISON',round};
      let accepted=await invoke('write','round'+round+'.mutation',auth);
      requireThat(same(accepted[probe],{scope:'LOCAL_CONTROL_CACHE_COMPARISON',round}),'real U accepted exact probe');
      result.mutations++;auth=null;accepted=null; // No driver full Auth across controls.
      for(let index=0;index<6;index++){
        let control=await invoke('readControl','round'+round+'.control'+index);control=null;
        if(index===0)requireThat(requests.at(-1).graphPresent&&requests.at(-1).graphReuse.reused===false,
          'first native control after each mutation must be cold');
      }
      const end=await boundary(round,'end');cycles.push({round,start,end});
    }
    let auth=await invoke('read','restore.fullRead');
    requireThat(same(auth[probe],{scope:'LOCAL_CONTROL_CACHE_COMPARISON',round:2}),'last probe confirmed by fresh full U');
    delete auth[probe];let accepted=await invoke('write','restore.write',auth);
    requireThat(!Object.hasOwn(accepted,probe)&&same(lastState,baselineState),'ACK restores original immutable root/proof');
    result.restoreCount++;auth=null;accepted=null;
    let final=await invoke('read','restore.finalRead');
    requireThat(!Object.hasOwn(final,probe)&&same(lastState,baselineState),'fresh final full read confirms original root restored');
    final=null;
    requireThat(result.authRPCCount===27&&result.fullReadCount===5&&result.writeCount===4&&result.controlReadCount===18
      &&result.mutations===3&&result.restoreCount===1&&cycles.length===3&&sequence===6
      &&requests.every(r=>r.responseReceived&&r.selectedUAccepted)&&result.nativeHTTPSendCount===27,
      'exact deterministic 27 genuine accepted RPC workload');
    requireThat(calls.length>0&&calls.every(c=>c.utf8Bytes===calls[0].utf8Bytes),'same actual control text byte size');
    result.actualControlTextUTF8Bytes=calls[0].utf8Bytes;
    result.initialControlFieldSHA256=baselineFields;result.unchangedLogicalHistorySHA256=baselineHistorySHA;
    result.originalStateRestored=baselineState;result.unchangedNativeProof=baselineProof;
    result.finalRevision=expectedRevision;result.freshNativeChecksAcceptedBySelectedU=true;result.pass=true;
  }catch(error){result.errorType=error.name;result.errorCode=error.code||null;result.errorMessage=String(error.message).slice(0,200);}
  finally{
    observing=false;JSON.stringify=original;sent.unsubscribe(sentHeaders);
    // Deliver pending natural GC observer entries without forcing a collection.
    for(const e of gcObserver.takeRecords()){
      gc.count++;gc.durationMilliseconds+=e.duration;const k=String(e.detail?.kind??'unknown');gc.kinds[k]=(gc.kinds[k]||0)+1;
    }
    gcObserver.disconnect();result.final={memory:memory(),wire:meter?wire():null,wallMilliseconds:performance.now()-started};
    fs.writeFileSync('/bench/CONTROL_CACHE.SAFE.json',original(result)+'\n',{flag:'wx',mode:0o600});
    process.stdout.write(original(result)+'\n');if(!result.pass)process.exitCode=1;
  }
}
main().catch(error=>{process.stderr.write(error.name+'\n');process.exitCode=1;});
