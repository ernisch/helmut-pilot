"use strict";
// Executes the actual adapter in an isolated module context. Only surrounding
// preparation/business effects are stubbed; real journal selection/bind/enter
// reject stale/replayed state. No database, command installation or provider.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const path = require('node:path'), {createRequire} = require('node:module');
const R = path.resolve(__dirname, '../..'), J = require(R+'/lib/helmut/synthetik-500-dispatch-journal');
const crypto = require('node:crypto');
const noNet = () => { throw Error('focused offline test forbids network'); };
global.fetch=noNet; require('node:http').request=noNet; require('node:https').request=noNet;
const FIXED='2030-01-02T12:00:00.000Z', HASH='a'.repeat(64), OP='synthetik500-local-caller-fixture';
class Clock extends Date { constructor(...a){super(...(a.length?a:[FIXED]));} static now(){return Date.parse(FIXED);} }
const keys=['synthetik500DispatchJournal','synthetik500KostenAdmission','testKostenAuftrag','testKostenTage'];
const stop=Error('intentional boundary before business execution'); let checks=0;
function freeze(x){if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;}
function fixture(){
 const operation={operationId:OP,commandHash:HASH,planHash:HASH,claimId:'current-claim',state:'running',stopRequested:false,index:1,inFlight:null,
  units:[{kind:'DR',entered:true,intentIds:['old-D','old-R']},{kind:'DR',entered:false,intentIds:['next-D','next-R']}],
  attempts:{'old-D':{status:'accounted'},'old-R':{status:'accounted'}},outputs:{0:{positions:[]}}};
 return {[J.KEY]:{version:J.VERSION,activeOperationId:OP,operations:{[OP]:operation}},
  synthetik500KostenAdmission:{planHash:HASH,plan:{startsAtUTC:'2030-01-02T11:00:00.000Z',endsAtUTC:'2030-01-02T13:00:00.000Z'}},
  testKostenAuftrag:{},testKostenTage:{},llmUsage:[{id:'full-accounting-only'}],unselectedPrivateFixture:{kept:true}};
}
function frame(control,onRead){
 const full=fixture(),counts={full:0,control:0,mutation:0,guard:0,counter:0,executed:0};
 const storage={readAuthStore:async options=>{assert.equal(options.strict,true);counts.full++;if(onRead)onRead(full);return structuredClone(full);},
  readSynthetik500ControlStore:async()=>{counts.control++;if(onRead)onRead(full);return freeze(structuredClone(Object.fromEntries(keys.map(k=>[k,full[k]]))));},
  mutateAuthStore:async fn=>{counts.mutation++;assert(full.llmUsage&&full.unselectedPrivateFixture.kept);return fn(full);},
  leseLlmTageszaehler:async()=>{counts.counter++;return {};}};
 const file=R+'/lib/helmut/synthetik-500-production-adapter.js',source=fs.readFileSync(file,'utf8'),real=createRequire(file),module={exports:{}};
 const command={mode:'D-R-500'};
 const req=name=>name==='./storage'?storage:name==='./llm-usage-atomic'?{controlReadEnabled:()=>control}:name==='./testkosten-budget'?{...real(name),pruefeStart:()=>{}}:real(name);
 const append=`\nload=async()=>({command:injectedCommand}); environment=()=>{}; financial=()=>{};
 guard=async()=>{injectedCounts.guard++;throw injectedStop;};
 executeUnits=async()=>{injectedCounts.executed++;return 'executed';};
 module.exports.__onlyFixture={readFreshControl,nextState};`;
 vm.runInNewContext(source+append,{module,exports:module.exports,require:req,Date:Clock,process,Buffer,console,
  injectedCommand:command,injectedCounts:counts,injectedStop:stop},{filename:file});
 return {full,counts,api:module.exports};
}
async function check(name,fn){await fn();checks++;console.log('PASS '+name);}
(async()=>{
 for(const control of [false,true]){
  const mode=control?'control':'full';
  await check(mode+' beforeSend selects fresh state, then preserves genuine guard boundary',async()=>{
   const f=frame(control);await assert.rejects(f.api.beforeSend({execution:{operationId:OP,commandHash:HASH,claimId:'current-claim'}}),e=>e.message==='synthetik500-production-u-guard');
   assert.equal(f.counts[mode],1);assert.equal(f.counts[control?'full':'control'],0);assert.equal(f.counts.guard,1);assert.equal(f.counts.mutation,0);
  });
  await check(mode+' stale claim and expired window fail before guard or mutation',async()=>{
   for(const change of [a=>a[J.KEY].operations[OP].claimId='stale',a=>a.synthetik500KostenAdmission.plan.endsAtUTC=FIXED]){
    const f=frame(control,change);await assert.rejects(f.api.beforeSend({execution:{operationId:OP,commandHash:HASH,claimId:'current-claim'}}));
    assert.equal(f.counts[mode],1);assert.equal(f.counts.guard,0);assert.equal(f.counts.mutation,0);
   }
  });
  await check(mode+' next uses readonly selection and a distinct complete mutation state',async()=>{
   const f=frame(control);assert.equal(await f.api.productionNext({operationId:OP,commandHash:HASH}),'executed');
   assert.equal(f.counts[mode],1);assert.equal(f.counts.mutation,1);assert.equal(f.full[J.KEY].operations[OP].units[1].entered,true);
   assert.equal(f.full.llmUsage[0].id,'full-accounting-only');assert.equal(f.counts.executed,1);
  });
  await check(mode+' replay, wrong operation and unsettled attempts cannot enter next unit',async()=>{
   for(const change of [a=>a[J.KEY].operations[OP].units[1].entered=true,a=>a[J.KEY].operations[OP].attempts['old-R'].status='sent']){
    const f=frame(control,change);await assert.rejects(f.api.productionNext({operationId:OP,commandHash:HASH}));
    assert.equal(f.counts[mode],1);assert.equal(f.counts.mutation,0);assert.equal(f.counts.executed,0);
   }
   const f=frame(control);await assert.rejects(f.api.productionNext({operationId:'foreign-operation',commandHash:HASH}));assert.equal(f.counts.mutation,0);
  });
 }
 await check('control transport error is terminal with one read and no fallback',async()=>{
  const error=Error('unconfirmed native read'),f=frame(true,()=>{throw error;});
  await assert.rejects(f.api.productionNext({operationId:OP,commandHash:HASH}),e=>e===error);
  assert.equal(f.counts.control,1);assert.equal(f.counts.full,0);assert.equal(f.counts.mutation,0);
 });
 await check('storage adapter selector uses control, while its io.auth remains complete',async()=>{
  const file=R+'/lib/helmut/storage.js',real=createRequire(file),module={exports:{}},full=fixture();let selected=0,accounting=0;
  const source=fs.readFileSync(file,'utf8')+`\nreadSynthetik500ControlStore=async()=>fixtureControl();
 readAuthStore=async options=>fixtureFull(options); loadSynthetik500ProductionCommand=async()=>({command:{}});
 module.exports.__onlyFixture={synthetik500DraftAdapter};`;
  vm.runInNewContext(source,{module,exports:module.exports,require:real,__dirname:path.dirname(file),__filename:file,process,Buffer,console,setTimeout,clearTimeout,URL,
   fixtureControl:()=>{selected++;return freeze(structuredClone(Object.fromEntries(keys.map(k=>[k,full[k]]))));},
   fixtureFull:options=>{assert.equal(options.strict,true);accounting++;return full;}},{filename:file});
  const adapter=await module.exports.__onlyFixture.synthetik500DraftAdapter();assert.equal(selected,1);assert.equal(accounting,0);
  assert.equal(await adapter.io.auth(),full);assert.equal(accounting,1);
 });
 console.log(JSON.stringify({checks,production:false,full500:false,networkCalls:0,actualAdapterSHA256:crypto.createHash('sha256').update(fs.readFileSync(R+'/lib/helmut/synthetik-500-production-adapter.js')).digest('hex')}));
})().catch(e=>{console.error(e);process.exitCode=1;});
