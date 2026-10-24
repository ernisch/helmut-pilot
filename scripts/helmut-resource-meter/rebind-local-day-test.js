'use strict';
// Synthetic guard boundary only. No actual engine import, rows, judgments,
// source files, DB, container, provider or accepted temporal transfer.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const file=path.join(__dirname,'rebind-local-day.js'),source=fs.readFileSync(file,'utf8');
const localNames=['briefing-aussagenbindung','briefing-fachurteil','briefing-speicher',
 'briefing-lagebindung','briefing-bereichsvertrag'];
let cases=0,engineCalls=0;
function check(work){work();cases++;}
function sandbox(root){
 const files=new Map(),required=[];
 const virtualFS={
  lstatSync(name){assert(files.has(name));return{isFile:()=>true,isSymbolicLink:()=>false};},
  readFileSync(name){assert(files.has(name));return files.get(name);}
 };
 const module={exports:{}};
 const context=vm.createContext({module,__dirname:path.join(root,'scripts/helmut-resource-meter'),structuredClone,Buffer,
  require(name){
   if(name==='node:fs')return virtualFS;
   if(['node:path','node:assert/strict','node:crypto'].includes(name))return require(name);
   assert(localNames.some(n=>name===root+'/lib/helmut/'+n),'Unexpected engine root/name');
   required.push(name);
   return new Proxy({}, {get(){engineCalls++;throw Error('SYNTHETIC_ENGINE_CALL_FORBIDDEN');}});
  }});
 vm.runInContext(source,context,{filename:file});
 function put(name,value){
  const location=root+'/SYNTHETIC_ONLY/'+name,raw=Buffer.from(JSON.stringify(value));files.set(location,raw);
  return{path:location,bytes:raw.length,sha256:crypto.createHash('sha256').update(raw).digest('hex')};
 }
 function adopt(args){
  // Input and parsed pin objects stay in the same VM realm as production's
  // own JSON.parse objects, preserving the actual strict deep-equality guards.
  context.syntheticAdoptArgs=JSON.stringify(args);
  return vm.runInContext('module.exports.adopt(JSON.parse(syntheticAdoptArgs))',context);
 }
 return{api:module.exports,required,put,adopt};
}
const root='/tmp/SYNTHETIC_RELOCATED_WORKTREE',s=sandbox(root);
check(()=>assert.deepEqual(s.required,localNames.map(n=>root+'/lib/helmut/'+n)));
check(()=>{
 const other=sandbox('/tmp/SYNTHETIC_SECOND_WORKTREE');
 assert(other.required.every(p=>p.startsWith('/tmp/SYNTHETIC_SECOND_WORKTREE/')));
 assert(other.required.every(p=>!p.includes('helmut-cpu-epoch-20261015')));
});
function options(day){return{oldDay:'2026-10-16',day,startsAtUTC:day+'T08:00:00.000Z',
 endsAtUTC:day+'T17:00:00.000Z',windowStartUTC:'2026-10-13T00:00:00.000Z'};}
// A supported date must reach the unchanged 500-row bound, without calling any
// engine. This does not supply or approve any actual 500-row transfer.
// berlinTagKey is needed before the row bound; provide only this calendar
// primitive from a separate isolated synthetic module, never actual engine code.
function proposalSandbox(){
 const files=new Map(),required=[],module={exports:{}};
 const fakeFS={lstatSync(name){assert(files.has(name));return{isFile:()=>true,isSymbolicLink:()=>false};},
  readFileSync(name){assert(files.has(name));return files.get(name);}};
 const requireClosed=name=>{
  if(name==='node:fs')return fakeFS;
  if(['node:path','node:assert/strict','node:crypto'].includes(name))return require(name);
  if(name===root+'/lib/helmut/briefing-frische')return{berlinTagKey:date=>date.toISOString().slice(0,10)};
  assert(localNames.some(n=>name===root+'/lib/helmut/'+n));required.push(name);
  return new Proxy({}, {get(){engineCalls++;throw Error('SYNTHETIC_ENGINE_CALL_FORBIDDEN');}});
 };
 vm.runInNewContext(source,{module,__dirname:root+'/scripts/helmut-resource-meter',require:requireClosed,structuredClone,Buffer},{filename:file});
 return module.exports;
}
const p=proposalSandbox();
for(const day of ['2026-10-17','2026-10-18','2026-10-19','2026-10-20','2026-10-21','2026-10-23']){
 check(()=>assert.throws(()=>p.propose([],options(day)),e=>e.actual===0&&e.expected===500));
}
for(const day of ['2026-10-22','2026-10-24','2026-11-23']){
 check(()=>assert.throws(()=>p.propose([],options(day)),e=>e.message.includes('Only explicitly prepared local days')));
}
check(()=>assert.throws(()=>p.propose([],{...options('2026-10-23'),oldDay:'2026-10-17'}),e=>e.actual==='2026-10-17'&&e.expected==='2026-10-16'));
check(()=>assert.throws(()=>p.propose([],{...options('2026-10-23'),windowStartUTC:'2026-10-14T00:00:00.000Z'}),e=>e.actual==='2026-10-14T00:00:00.000Z'&&e.expected==='2026-10-13T00:00:00.000Z'));
check(()=>assert.throws(()=>p.propose([],{...options('2026-10-23'),endsAtUTC:'2026-10-23T17:00:00.001Z'})));
check(()=>assert.throws(()=>p.propose([],{...options('2026-10-23'),endsAtUTC:'2026-10-24T01:00:00.000Z'})));
function adoption(day,change=()=>{},independent={model:'SYNTHETIC_REJECTED_MODEL',route:{effort:'high'},payload:{summary:{status:'ok'}}}){
 const oldRowsPin=s.put('OLD_ROWS.json',[]),proposalPin=s.put('PROPOSAL.json',{review:{day}});
 const independentReview=s.put('INDEPENDENT.json',independent);
 const acceptance={status:'ROOT_AND_INDEPENDENT_ACCEPTED_EXACT_CURRENT_DAY_TRANSFER',oldRowsPin,proposalPin,
  day,profiles:500,allPositionsReviewed:true,currentTemporalJudgmentAccepted:true,production:false,independentReview};
 change(acceptance);
 return()=>s.adopt({oldRowsPin,proposalPin,rootAcceptancePin:s.put('ACCEPTANCE.json',acceptance)});
}
check(()=>assert.throws(adoption('2026-10-23'),e=>e.actual==='SYNTHETIC_REJECTED_MODEL'&&e.expected==='deepseek-v4-pro'));
for(const day of ['2026-10-22','2026-10-24'])check(()=>assert.throws(adoption(day),e=>e.actual===false&&e.expected===true));
check(()=>assert.throws(adoption('2026-10-23',a=>a.currentTemporalJudgmentAccepted=false),e=>e.actual===false&&e.expected===true));
check(()=>assert.throws(adoption('2026-10-23',a=>a.allPositionsReviewed=false),e=>e.actual===false&&e.expected===true));
check(()=>assert.throws(adoption('2026-10-23',a=>a.profiles=499),e=>e.actual===499&&e.expected===500));
check(()=>assert.throws(adoption('2026-10-23',a=>a.status='SYNTHETIC_NOT_ACCEPTED'),e=>e.actual==='SYNTHETIC_NOT_ACCEPTED'));
check(()=>assert.throws(adoption('2026-10-23',()=>{}, {model:'deepseek-v4-pro',route:{effort:'low'},payload:{summary:{status:'ok'}}}),e=>e.actual==='low'&&e.expected==='high'));
check(()=>assert.throws(adoption('2026-10-23',()=>{}, {model:'deepseek-v4-pro',route:{effort:'high'},payload:{summary:{status:'SYNTHETIC_REJECTED'}}}),e=>e.actual==='SYNTHETIC_REJECTED'&&e.expected==='ok'));
check(()=>assert.equal(engineCalls,0));
process.stdout.write(JSON.stringify({syntheticGuardChecks:cases,pass:true,actualEngineImports:0,actualEngineCalls:engineCalls,
 actualRowsTransferred:0,acceptedJudgmentsCreated:0,DBCalls:0,containerCalls:0,providerCalls:0,GOOrClaimsCreated:false})+'\n');
