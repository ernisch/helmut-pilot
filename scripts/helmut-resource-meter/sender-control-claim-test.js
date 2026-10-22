"use strict";
// Labelled synthetic fixtures. No native DB, resource run or historical claim.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const Claim=require('./sender-control-claim'),AU=require('./atomic-usage-integration');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'helmut-synthetic-claim-'));
const day=new Date().toISOString().slice(0,10),selector={operationId:'SYNTHETIC',commandHash:'SYNTHETIC_HASH'};
const options={stateStorage:'merkle-auth-v1',historyReadReuse:'verified-history-reuse-v1',controlRead:'verified-control-view-v1',boundedRead:'bounded-native-read-v1',senderClaimRead:Claim.MODE};
function pin(p){const b=fs.readFileSync(p);return {path:p,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};}
function descriptor(d){const p=path.join(dir,'descriptor.json');fs.writeFileSync(p,JSON.stringify(d),{mode:0o600});return pin(p);}
function fixture(){
 const op={...selector,state:'running',units:[],attempts:{},inFlight:{index:0}};
 const c={synthetik500DispatchJournal:{operations:{SYNTHETIC:op}},synthetik500KostenAdmission:{consumed:{}},testKostenTage:{[day]:{calls:{}}}};
 for(let i=0;i<500;i++){
  op.units[i]={intentIds:['SYNTHETIC_D'+i,'SYNTHETIC_R'+i]};
  for(const id of op.units[i].intentIds){op.attempts[id]={status:'sent'};c.synthetik500KostenAdmission.consumed[id]={ticketId:id};c.testKostenTage[day].calls[id]={status:'reserviert',admission:{actualRequestHash:'SYNTHETIC_REQUEST_'+id}};}
 }return c;
}
function original(c,index,phase){
 const value={journal:c.synthetik500DispatchJournal,slot:c.synthetik500KostenAdmission,book:c.testKostenTage[day]};
 assert(['D','R'].includes(phase));assert(Number.isInteger(index)&&index>=0&&index<500);
 const operation=value.journal.operations[selector.operationId],unit=operation?.units?.[index];
 assert(unit);const id=unit.intentIds[phase==='D'?0:1],consumed=value.slot.consumed[id],attempt=operation.attempts[id];
 assert(consumed);const call=value.book.calls[consumed.ticketId];assert.equal(operation.inFlight.index,index);
 return {operationId:operation.operationId,commandHash:operation.commandHash,index:operation.inFlight.index,
  journalState:operation.state,attemptStatus:attempt.status,reservationStatus:call.status,actualRequestHash:call.admission.actualRequestHash};
}
const keys=['SUPABASE_URL','VERCEL','HELMUT_LLM_USAGE_STORAGE','HELMUT_AUTH_STATE_STORAGE','HELMUT_AUTH_HISTORY_READ_REUSE','HELMUT_AUTH_CONTROL_READ','HELMUT_AUTH_GRAPH_READ_REUSE','HELMUT_AUTH_SINGLE_WRITE_CAPTURE'];
const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
function reset(){for(const k of keys)delete process.env[k];Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:1',HELMUT_LLM_USAGE_STORAGE:'relational-atomic-v1',HELMUT_AUTH_STATE_STORAGE:'merkle-auth-v1',HELMUT_AUTH_HISTORY_READ_REUSE:'verified-history-reuse-v1',HELMUT_AUTH_CONTROL_READ:'verified-control-view-v1'});}
async function main(){
 let groups=0,selections=0;const c=fixture(),op=c.synthetik500DispatchJournal.operations.SYNTHETIC;
 for(let i=0;i<500;i++)for(const phase of ['D','R']){
  op.inFlight.index=i;const before=JSON.stringify(c);
  assert.deepEqual(Claim.claimFromControl(c,selector,i,phase,day),original(c,i,phase));assert.equal(JSON.stringify(c),before);selections++;
 }groups++;
 for(const [i,p]of [[-1,'D'],[500,'D'],[.5,'R'],[0,'x']])assert.throws(()=>Claim.claimFromControl(c,selector,i,p,day));groups++;
 const removals=[x=>delete x.synthetik500DispatchJournal.operations.SYNTHETIC,x=>delete x.synthetik500DispatchJournal.operations.SYNTHETIC.units[0],
  x=>delete x.synthetik500DispatchJournal.operations.SYNTHETIC.units[0].intentIds,x=>delete x.synthetik500KostenAdmission.consumed.SYNTHETIC_D0,
  x=>delete x.synthetik500DispatchJournal.operations.SYNTHETIC.attempts.SYNTHETIC_D0,x=>delete x.testKostenTage[day],
  x=>delete x.testKostenTage[day].calls.SYNTHETIC_D0,x=>delete x.synthetik500DispatchJournal.operations.SYNTHETIC.inFlight,
  x=>x.synthetik500DispatchJournal.operations.SYNTHETIC.inFlight.index=1];
 for(const mutate of removals){const x=fixture();mutate(x);assert.throws(()=>Claim.claimFromControl(x,selector,0,'D',day));}groups++;
 const d=AU.descriptor(options);let reads=0;
 // No environment is needed merely to construct the callable interface.
 for(const k of keys)delete process.env[k];
 let current=fixture();const f=Claim.create({descriptorPin:descriptor(d),readControl:async()=>{reads++;return current;}});
 assert.equal(reads,0);reset();
 const a=await f(selector,0,'D','');assert.equal(reads,1);current=fixture();
 current.synthetik500DispatchJournal.operations.SYNTHETIC.state='stopped';current.synthetik500KostenAdmission.consumed.SYNTHETIC_D0.ticketId='SYNTHETIC_OTHER';
 current.testKostenTage[day].calls.SYNTHETIC_OTHER={status:'abgerechnet',admission:{actualRequestHash:'SYNTHETIC_CHANGED'}};
 const b=await f(selector,0,'D','');assert.equal(reads,2);assert.notDeepEqual(a,b);assert.equal(b.journalState,'stopped');assert.equal(b.reservationStatus,'abgerechnet');assert.equal(b.actualRequestHash,'SYNTHETIC_CHANGED');groups++;
 const error=Error('SYNTHETIC_ORIGINAL');const failure=Claim.create({descriptorPin:descriptor(d),readControl:async()=>{throw error;}});
 await assert.rejects(failure(selector,0,'D',''),e=>e===error);groups++;
 for(const delta of [{HELMUT_AUTH_CONTROL_READ:'off'},{HELMUT_AUTH_CONTROL_READ:'unknown'},{HELMUT_LLM_USAGE_STORAGE:'blob'},
  {HELMUT_AUTH_STATE_STORAGE:'off'},{HELMUT_AUTH_HISTORY_READ_REUSE:'off'},{SUPABASE_URL:'https://example.invalid'},{VERCEL:'1'},
  {HELMUT_AUTH_GRAPH_READ_REUSE:'off'},{HELMUT_AUTH_SINGLE_WRITE_CAPTURE:'off'}]){
  reset();Object.assign(process.env,delta);const old=reads;await assert.rejects(f(selector,0,'D',''));assert.equal(reads,old);
 }reset();groups++;
 for(const opts of [{senderClaimRead:null},{senderClaimRead:'unknown'},{boundedRead:null},{controlRead:null},{stateStorage:null},{historyReadReuse:null}]){
  assert.throws(()=>Claim.create({descriptorPin:descriptor({...d,...opts}),readControl:()=>{throw Error('MUST_NOT_READ');}}));
 }groups++;
 const changed=structuredClone(d);changed.sourcePins.find(p=>p.path.endsWith('/sender-control-claim.js')).sha256='0'.repeat(64);
 assert.throws(()=>Claim.create({descriptorPin:descriptor(changed),readControl:()=>{}}));
 const p=descriptor(d);fs.appendFileSync(p.path,' ');assert.throws(()=>Claim.create({descriptorPin:p,readControl:()=>{}}));groups++;
 console.log(JSON.stringify({pass:true,syntheticGroups:groups,syntheticSelections:selections,nativeDatabaseProof:false,full500Runs:0}));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{
 for(const k of keys){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}
 fs.rmSync(dir,{recursive:true});
});
