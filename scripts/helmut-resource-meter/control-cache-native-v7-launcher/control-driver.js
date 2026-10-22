'use strict';
// Prepared diagnostic only. Exactly one read and two readControl calls.
// Observe the ORIGINAL returned controlText string; never stringify Auth again.
const fs=require('node:fs'),v8=require('node:v8');
const dc=require('node:diagnostics_channel');
const root='/workspace/helmut-cpu-epoch-20261015';
const modulePath=root+'/lib/helmut/llm-usage-atomic.js';
const U=require(modulePath);
const meter=require(root+'/scripts/helmut-resource-meter/http-meter.js').current();
const keys=['synthetik500DispatchJournal','synthetik500KostenAdmission','testKostenAuftrag','testKostenTage'];
const phases=['read','readControl1','readControl2'];
const original=JSON.stringify;
const calls=[],requests=[],steps=[],nativeHTTPRequests=[];
let phase='initial',observing=false;
const result={schema:'helmut-control-cache-three-rpc/1',pass:false,nodeVersion:process.version,
  uCalls:[],authRPCCount:0,rpcResponsesCompleted:0,nativeHTTPSendCount:0,steps,requests,nativeHTTPRequests,controlTextStringifyObservations:calls,
  controlCacheLimitBytes:2*1024*1024,noExtraAuthSerialization:true,
  observerPreservesOriginalArgumentsAndReturn:true,observerRetainsControlText:false,
  freshNativeChecksAcceptedByOriginalU:false,forcedGC:false,ramSavingClaimed:false,
  threeRPCPlateauClaimed:false,providerCalls:0,mutations:0,full500:false};
function requireThat(ok,reason){if(!ok)throw Error(reason);}
function memory(){return {process:process.memoryUsage(),heapSizeLimitBytes:v8.getHeapStatistics().heap_size_limit,
  processLifetimeMaxRSSKiB:process.resourceUsage().maxRSS,notWholeNativeGroup:true};}
const wireFields=['responseBodyReceivedBytes','responseTCPDeliveredBytes','responseHeaderBytes',
  'responseFramingBytes','responses','parseErrors','unparsedResponseBytes','incompleteResponses',
  'unfinishedActiveHTTPParsers','protocolErrors'];
function wire(){const value=meter.snapshot();return Object.fromEntries(wireFields.map(k=>[k,value[k]]));}
function delta(before,after){return Object.fromEntries(wireFields.map(k=>[k,after[k]-before[k]]));}
const sent=dc.channel('undici:client:sendHeaders');
function sentHeaders({request}){
  // Metadata only, immediately before the real client sends request headers.
  // Keep the counter even for an unexpected fourth send; never retain bodies.
  const row={method:request.method,path:request.path,origin:String(request.origin)};
  result.nativeHTTPSendCount++;
  if(nativeHTTPRequests.length<4)nativeHTTPRequests.push(row);
}
function installObserver(){
  JSON.stringify=function(...args){
    const text=Reflect.apply(original,this,args); // Exactly ONE original invocation.
    if(observing && typeof text==='string' && text.startsWith('{"synthetik500DispatchJournal":')){
      const value=args[0];
      if(value && typeof value==='object' && !Array.isArray(value)
          && Object.keys(value).join('|')===keys.join('|')){
        const stack=new Error().stack || '';
        if(stack.includes('at controlText ('+modulePath+':153:')){
          requireThat(args.length===1 && calls.length<16,'bounded exact original controlText invocation');
          calls.push({phase,utf8Bytes:Buffer.byteLength(text,'utf8'),ownKeys:[...keys],
            origin:'original controlText at pinned llm-usage-atomic.js:153',
            originalInvocations:1,returnedOriginalString:true});
        }
      }
    }
    return text;
  };
}
async function request(path,options){
  requireThat(requests.length<3 && path==='/rest/v1/rpc/helmut_auth_state_graph_read_v1'
    && options && options.method==='POST' && typeof options.body==='string','exact RPC route/method/count');
  const input=JSON.parse(options.body),index=requests.length;
  requireThat(Object.keys(input).join('|')===(index===0?'id|knownProof|readNonce':'id|knownProof|readNonce|knownGraph')
    && input.id==='main-auth' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.readNonce)
    && !requests.some(x=>x.readNonce===input.readNonce),'original request shape and fresh UUIDv4');
  const row={phase,method:'POST',route:'/rpc/helmut_auth_state_graph_read_v1',
    requestKeys:Object.keys(input),requestUTF8Bytes:Buffer.byteLength(options.body,'utf8'),
    readNonce:input.readNonce,knownProofPresent:input.knownProof!==null,
    knownGraph:index===0?'absent':input.knownGraph===null?'null':'object',
    responseReceived:false,originalUAccepted:false};
  requests.push(row);result.authRPCCount=requests.length;
  const response=await fetch('http://127.0.0.1:38419/rpc/helmut_auth_state_graph_read_v1',{
    method:'POST',headers:{'content-type':'application/json'},
    body:options.body,redirect:'error',signal:AbortSignal.timeout(20000)});
  requireThat(response.status===200,'actual RPC HTTP200 required');
  const value=await response.json(); // Original real JSON decode, no body clone/text/extra stringify.
  row.responseReceived=true;result.rpcResponsesCompleted++;
  requireThat(value && value.proof?.count===6000 && value.historyReuse?.nonce===input.readNonce,
    'actual 6000 proof and nonce echo');
  row.historyReuse={nonce:value.historyReuse.nonce,reused:value.historyReuse.reused,binding:value.historyReuse.binding};
  row.graphPresent=value.graph!==null && value.graph!==undefined;
  if(index>0){
    requireThat(value.graphReuse?.nonce===input.readNonce,'fresh control graph nonce echo');
    row.graphReuse={nonce:value.graphReuse.nonce,reused:value.graphReuse.reused,
      actualPayloadsChecked:value.graphReuse.actualPayloadsChecked,
      nodeCount:value.graphReuse.nodeCount,nodeDigest:value.graphReuse.nodeDigest,binding:value.graphReuse.binding};
  }
  // The original U code receives this SAME object and validates its real
  // history, complete graph or private token, state, revision and bindings.
  return value;
}
async function main(){
  try{
    requireThat(process.version==='v24.19.0' && meter && U.enabled() && U.controlReadEnabled(),
      'original runtime and exact verified control/history flags');
    requireThat(process.env.HELMUT_AUTH_GRAPH_READ_REUSE==='off'
      && process.env.HELMUT_AUTH_SINGLE_WRITE_CAPTURE==='off' && !process.env.NODE_OPTIONS,
      'graph and single capture off; explicit heap argv');
    result.baseline={memory:memory(),wire:wire()};
    installObserver();observing=true;sent.subscribe(sentHeaders);
    for(let index=0;index<3;index++){
      phase=phases[index];
      const start=performance.now(),beforeWire=wire(),beforeMemory=memory(),count=calls.length;
      let value=await U[index===0?'read':'readControl']({request,rowId:'main-auth',
        target:'http://127.0.0.1:38419|main-auth'});
      requireThat(requests.length===index+1,'one actual RPC per direct U invocation');
      requireThat(keys.every(k=>Object.hasOwn(value,k)),'all four actual control keys present');
      if(index===0)requireThat(U.hasSnapshot(value),'original full read snapshot');
      else requireThat(!U.hasSnapshot(value) && Object.isFrozen(value)
        && Object.keys(value).sort().join('|')===[...keys,'_authStoreRevision'].sort().join('|'),
        'exact detached read-only four-field control view plus revision');
      requests[index].originalUAccepted=true;
      const afterWire=wire(),change=delta(beforeWire,afterWire);
      requireThat(result.nativeHTTPSendCount===index+1 && nativeHTTPRequests.every(r=>r.method==='POST'
        && r.path==='/rpc/helmut_auth_state_graph_read_v1' && r.origin==='http://127.0.0.1:38419')
        && change.responses===1 && afterWire.parseErrors===0 && afterWire.unparsedResponseBytes===0
        && afterWire.incompleteResponses===0 && afterWire.unfinishedActiveHTTPParsers===0
        && afterWire.protocolErrors===0,'one complete passively framed native response');
      steps.push({phase,uMethod:index===0?'read':'readControl',wallMilliseconds:performance.now()-start,
        memoryBefore:beforeMemory,memoryAfter:memory(),wireBefore:beforeWire,wireAfter:afterWire,wireDelta:change,
        controlTextStringifyCount:calls.length-count,originalUAcceptance:true,
        returnedFullAuthSnapshot:index===0,returnedControlView:index>0});
      result.uCalls.push(index===0?'read':'readControl');
      value=null; // No driver retention of the prior full Auth/control result.
    }
    requireThat(calls.length>=1 && calls.every(x=>Number.isSafeInteger(x.utf8Bytes) && x.utf8Bytes>0)
      && calls.every(x=>x.utf8Bytes===calls[0].utf8Bytes),'actual identical four-control text byte observations');
    result.actualControlTextUTF8Bytes=calls[0].utf8Bytes;
    result.exceedsControlCacheLimit=calls[0].utf8Bytes>result.controlCacheLimitBytes;
    // Conditional expectations derive from the pinned existing implementation.
    // Both branches still require fresh real RPCs accepted by original U.
    const expected=result.exceedsControlCacheLimit?[1,2,2]:[1,0,0];
    requireThat(steps.every((s,i)=>s.controlTextStringifyCount===expected[i]),'original cache-path stringify counts');
    requireThat(requests.slice(1).every(r=>r.knownGraph===(result.exceedsControlCacheLimit?'null':'object')
      && r.graphReuse.reused===!result.exceedsControlCacheLimit
      && r.graphPresent===result.exceedsControlCacheLimit),'actual native knownGraph/cache outcome');
    requireThat(requests.length===3 && requests.every(x=>x.responseReceived && x.originalUAccepted),
      'exact three fresh native checks accepted');
    result.freshNativeChecksAcceptedByOriginalU=true;result.pass=true;
  }catch(error){result.errorType=error.name;result.errorCode=error.code||null;result.errorMessage=String(error.message).slice(0,200);}
  finally{
    observing=false;JSON.stringify=original;sent.unsubscribe(sentHeaders);
    result.final={memory:memory(),wire:meter?wire():null};
    fs.writeFileSync('/bench/CONTROL_CACHE.SAFE.json',original(result)+'\n',{flag:'wx',mode:0o600});
    process.stdout.write(original(result)+'\n');
    if(!result.pass)process.exitCode=1;
  }
}
main().catch(error=>{process.stderr.write(error.name+'\n');process.exitCode=1;});
