'use strict';
// Diagnostic-only write phases. Same 5 reads,4 confirmed CAS writes,18 controls.
// Only final restore.write installs the synchronous scalar-only U callback.
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
const result={schema:'helmut-auth-write-phase-27-rpc/1',pass:false,variant:cfg.variant,
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
const phaseHook=Symbol.for('helmut.diagnostic.auth-write-phase.v1');
const phaseLabels=Object.freeze(['driver.restore.beforeU','U.beforeSnapshotCapture','U.afterSnapshotCapture',
  'U.afterPartsBuild','driver.request.afterSerializationBeforeHTTP','driver.request.afterBodyObserverBeforeHTTP',
  'driver.request.afterRPCJSONParsed','U.beforeAttach','U.afterAttach','U.beforeReturn',
  'driver.afterU.beforeVerifyLogical','driver.afterVerifyLogical','driver.beforeFinalRead','driver.afterFinalRead']);
const phaseMemoryKeys=Object.freeze(['anon','file','kernel','shmem','kernel_stack','pagetables','slab','sock','file_mapped']);
const phaseCPUKeys=Object.freeze(['usage_usec','user_usec','system_usec','nr_periods','nr_throttled','throttled_usec']);
const phaseV8Keys=Object.freeze(['total_heap_size','total_heap_size_executable','total_physical_size',
  'total_available_size','used_heap_size','heap_size_limit','malloced_memory','peak_malloced_memory',
  'external_memory','number_of_native_contexts','number_of_detached_contexts',
  'total_global_handles_size','used_global_handles_size']);
const phaseProcessKeys=Object.freeze(['rss','heapTotal','heapUsed','external','arrayBuffers']);
const phaseIOKeys=Object.freeze(['rbytes','wbytes','rios','wios','dbytes','dios']);
const phaseFrames=[];
let phaseFrameBytes=0;
const phaseProbe={schema:'helmut-auth-write-phase-frames/1',maximumFrames:14,maximumExtraJSONBytes:49152,
  maximumFrameJSONBytes:3072,maximumEnvelopeJSONBytes:4096,staticMaximumJSONBytes:47117,
  plannedLabels:phaseLabels,groupPath:'/owned-group',groupInode:cfg.phaseProbe?.groupInode,
  memoryStatSelectedKeys:phaseMemoryKeys,cpuStatSelectedKeys:phaseCPUKeys,v8SelectedKeys:phaseV8Keys,
  ioSelectedKeys:phaseIOKeys,maximumIODeviceRows:4,maximumRawCounterFileBytes:4096,
  snapshotsAtomic:false,fileIncludesShmem:true,externalIncludesArrayBuffers:true,maxRSSUnit:'KiB',
  peakIncreasesInsideFramesObserverAmbiguous:true,betweenFramesIncludeRecordingOverhead:true,
  metadataSerializationAfterFrameEnd:true,exactPeakOwnerClaimed:false,allocatorCauseClaimed:false,
  inputObjectsRetained:false,complete:false,extraMetadataBytes:0,frames:phaseFrames};
result.phaseProbe=phaseProbe;
function phaseNumber(value){
  requireThat(Number.isSafeInteger(value)&&value>=0,'phase scalar integer bound');return value;
}
function phaseClock(){
  const monotonicMilliseconds=performance.now(),utcISO=new Date().toISOString();
  requireThat(Number.isFinite(monotonicMilliseconds)&&monotonicMilliseconds>=0
    &&monotonicMilliseconds<=Number.MAX_SAFE_INTEGER&&utcISO.length<=32,'phase clock bound');
  return {monotonicMilliseconds,utcISO};
}
function phaseText(file){
  requireThat(['/proc/self/cgroup','/owned-group/memory.current','/owned-group/memory.peak',
    '/owned-group/memory.stat','/owned-group/cpu.stat','/owned-group/io.stat'].includes(file),'fixed phase read path');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW),raw=Buffer.alloc(4097);
  try{
    let used=0,count;
    while(used<raw.length&&(count=fs.readSync(fd,raw,used,raw.length-used,null))>0)used+=count;
    requireThat(used<=4096,'phase raw metadata cap');
    for(let i=0;i<used;i++)requireThat(raw[i]<=127,'phase metadata ASCII');
    return raw.toString('utf8',0,used);
  }finally{fs.closeSync(fd);}
}
function phaseUnsigned(value){
  requireThat(typeof value==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(value)
    &&BigInt(value)<=18446744073709551615n,'phase kernel unsigned64 counter');return value;
}
function phasePairs(file,keys){
  const rows=phaseText(file).trim().split('\n'),values=Object.create(null);
  requireThat(rows.length>0&&rows.length<=128,'bounded phase counter rows');
  for(const line of rows){
    const fields=line.trim().split(/\s+/);
    requireThat(fields.length===2&&/^[a-z][a-z0-9_]{0,63}$/.test(fields[0])
      &&!Object.hasOwn(values,fields[0]),'phase counter key shape');
    values[fields[0]]=phaseUnsigned(fields[1]);
  }
  return Object.fromEntries(keys.map(key=>{
    requireThat(Object.hasOwn(values,key),'missing selected phase counter');return [key,values[key]];
  }));
}
function phaseIO(){
  const raw=phaseText('/owned-group/io.stat').trim(),rows=raw?raw.split('\n'):[],devices=new Set();
  requireThat(rows.length<=4,'bounded phase IO devices');
  return rows.map(line=>{
    const fields=line.trim().split(/\s+/),device=fields.shift(),values=Object.create(null);
    requireThat(/^[0-9]{1,10}:[0-9]{1,10}$/.test(device)&&!devices.has(device)
      &&fields.length>=6&&fields.length<=16,'phase IO row');devices.add(device);
    for(const field of fields){
      const pair=field.split('=');
      requireThat(pair.length===2&&/^[a-z][a-z0-9_.]{0,31}$/.test(pair[0])
        &&!Object.hasOwn(values,pair[0]),'phase IO counter key');values[pair[0]]=phaseUnsigned(pair[1]);
    }
    return {device,...Object.fromEntries(phaseIOKeys.map(key=>{
      requireThat(Object.hasOwn(values,key),'missing phase IO counter');return [key,values[key]];
    }))};
  });
}
function phaseGroupIdentity(){
  const value=fs.lstatSync('/owned-group');
  requireThat(value.isDirectory()&&!value.isSymbolicLink()&&value.ino===cfg.phaseProbe.groupInode,
    'phase exact owned group inode');return phaseNumber(value.ino);
}
function capturePhase(label){
  requireThat(phaseFrames.length<14&&label===phaseLabels[phaseFrames.length],'exact bounded phase label order');
  if(label.startsWith('U.')||label.startsWith('driver.request.'))
    requireThat(phase==='restore.write'&&expectedMethod==='write','callback only in lexical final restore.write');
  const begin=phaseClock();
  const peakBefore=phaseUnsigned(phaseText('/owned-group/memory.peak').trim()); // FIRST counter read.
  const groupInode=phaseGroupIdentity(),ownMemory=process.memoryUsage();
  const processMemory=Object.fromEntries(phaseProcessKeys.map(key=>[key,phaseNumber(ownMemory[key])]));
  const processLifetimeMaxRSSKiB=phaseNumber(process.resourceUsage().maxRSS),heap=v8.getHeapStatistics();
  const heapValues=Object.fromEntries(phaseV8Keys.map(key=>[key,phaseNumber(heap[key])]));
  const group={memoryCurrentBytes:phaseUnsigned(phaseText('/owned-group/memory.current').trim()),
    memoryStat:phasePairs('/owned-group/memory.stat',phaseMemoryKeys),
    cpuStat:phasePairs('/owned-group/cpu.stat',phaseCPUKeys),ioStat:phaseIO()};
  requireThat(phaseGroupIdentity()===groupInode,'phase group changed during sequential reads');
  const peakAfter=phaseUnsigned(phaseText('/owned-group/memory.peak').trim()); // LAST counter read.
  const end=phaseClock();
  requireThat(end.monotonicMilliseconds>=begin.monotonicMilliseconds&&BigInt(peakAfter)>=BigInt(peakBefore)
    &&(!phaseFrames.length||(begin.monotonicMilliseconds>=phaseFrames.at(-1).end.monotonicMilliseconds
      &&BigInt(peakBefore)>=BigInt(phaseFrames.at(-1).peakAfter))),'phase clock or lifetime peak regressed');
  const frame={label,nodePID:process.pid,groupInode,begin,peakBefore,process:processMemory,
    processLifetimeMaxRSSKiB,v8:heapValues,group,peakAfter,end};
  // This bounded scalar serialization is observer overhead AFTER the end bracket.
  const bytes=Buffer.byteLength(original(frame),'utf8');
  requireThat(bytes<=3072&&4096+phaseFrameBytes+bytes+phaseFrames.length<=49152,'phase serialized metadata cap');
  phaseFrameBytes+=bytes;phaseFrames.push(frame);
}
function validatePhaseProbe(){
  const p=cfg.phaseProbe;
  requireThat(p&&Object.keys(p).sort().join('|')==='groupInode|maximumExtraJSONBytes|maximumFrames|plannedLabels|schema'
    &&p.schema==='helmut-auth-write-phase-probe-config/1'&&p.maximumFrames===14
    &&p.maximumExtraJSONBytes===49152&&same(p.plannedLabels,phaseLabels),'fixed phase probe configuration');
  phaseNumber(p.groupInode);requireThat(p.groupInode>0&&phaseText('/proc/self/cgroup')==='0::/\n',
    'phase exact private worker cgroup namespace');phaseGroupIdentity();
  requireThat(!Object.hasOwn(globalThis,phaseHook),'diagnostic callback slot must be absent');
  requireThat(Buffer.byteLength(original({phaseProbe:{...phaseProbe,extraMetadataBytes:49152}}),'utf8')<=4096,
    'phase empty envelope static budget');
}
function completePhaseProbe(){
  requireThat(phaseFrames.length===14&&phaseFrames.every((frame,index)=>frame.label===phaseLabels[index]),
    'all fourteen final-write/read phase frames required');phaseProbe.complete=true;
  const base=Buffer.byteLength(original({phaseProbe}),'utf8');
  let exact=base;for(let i=0;i<3;i++)exact=base-1+String(exact).length;
  phaseProbe.extraMetadataBytes=exact;
  requireThat(exact<=47117&&exact<=49152,'complete phase metadata exceeds unchanged48KiB cap');
}
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
  const item={schema:'helmut-auth-write-phase-cycle-marker/1',sequence:++sequence,round,edge,nodePID:process.pid};
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
  if(phase==='restore.write')capturePhase('driver.request.afterSerializationBeforeHTTP');
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
  if(phase==='restore.write')capturePhase('driver.request.afterBodyObserverBeforeHTTP');
  requests.push(row);result.authRPCCount=requests.length;
  const remaining=deadline-performance.now();requireThat(remaining>0,'whole-client deadline before fetch');
  const response=await fetch('http://127.0.0.1:38419/rpc/'+route,{method:'POST',headers:{'content-type':'application/json'},
    body:options.body,redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.floor(Math.min(20000,remaining))))});
  requireThat(response.status===200,'real local HTTP200');
  const value=await response.json(); // Same actual decoded object delivered unchanged to U.
  if(phase==='restore.write')capturePhase('driver.request.afterRPCJSONParsed');
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
  if(label==='restore.write'){
    capturePhase('driver.restore.beforeU');
    Object.defineProperty(globalThis,phaseHook,{value:capturePhase,configurable:true,enumerable:false,writable:false});
  }
  let value=method==='write'?await U.write(input,{request,rowId:'main-auth',target:'http://127.0.0.1:38419|main-auth'}):
    await U[method]({request,rowId:'main-auth',target:'http://127.0.0.1:38419|main-auth'});
  if(label==='restore.write')delete globalThis[phaseHook];
  requireThat(requests.length===n+1,'exactly one RPC, no automatic retries');
  requests[n].selectedUAccepted=true;expectedMethod=null;
  if(label==='restore.write')capturePhase('driver.afterU.beforeVerifyLogical');
  const logical=verifyLogical(value,method!=='readControl');
  if(label==='restore.write')capturePhase('driver.afterVerifyLogical');
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
    requireThat(cfg.variant==='CURRENT'&&process.version==='v24.19.0'&&meter&&U.enabled()&&U.controlReadEnabled(),
      'selected real runtime/control flags');
    validatePhaseProbe();
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
    capturePhase('driver.beforeFinalRead');
    let final=await invoke('read','restore.finalRead');
    capturePhase('driver.afterFinalRead');
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
    result.finalRevision=expectedRevision;result.freshNativeChecksAcceptedBySelectedU=true;completePhaseProbe();result.pass=true;
  }catch(error){result.errorType=error.name;result.errorCode=error.code||null;result.errorMessage=String(error.message).slice(0,200);}
  finally{
    if(Object.hasOwn(globalThis,phaseHook))delete globalThis[phaseHook];
    observing=false;JSON.stringify=original;sent.unsubscribe(sentHeaders);
    // Deliver pending natural GC observer entries without forcing a collection.
    for(const e of gcObserver.takeRecords()){
      gc.count++;gc.durationMilliseconds+=e.duration;const k=String(e.detail?.kind??'unknown');gc.kinds[k]=(gc.kinds[k]||0)+1;
    }
    gcObserver.disconnect();result.final={memory:memory(),wire:meter?wire():null,wallMilliseconds:performance.now()-started};
    fs.writeFileSync('/bench/AUTH_WRITE_PHASE.SAFE.json',original(result)+'\n',{flag:'wx',mode:0o600});
    process.stdout.write(original(result)+'\n');if(!result.pass)process.exitCode=1;
  }
}
main().catch(error=>{process.stderr.write(error.name+'\n');process.exitCode=1;});
