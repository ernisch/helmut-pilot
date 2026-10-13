"use strict";
// Fictional offline history. No native calls, credentials, provider or writes.
const assert=require('node:assert/strict');
globalThis.fetch=async()=>{throw Error('offline-network-forbidden');};
const H=require('../lib/helmut/starttor-preserved-controls'),C=require('../lib/helmut/synthetik-500-production-command');
const A=require('../lib/helmut/synthetik-500-kosten-admission'),P=require('../lib/helmut/synthetik-500-profile'),J=require('../lib/helmut/synthetik-500-dispatch-journal');
const EU=require('../lib/helmut/synthetik-500-eu-service-contract');
const NOW=Date.parse('2026-10-01T10:00:00.000Z'),clone=structuredClone;
function fixture(){
 const runId='nachlauf500-1790845200000',d={phase:'U',vorgangId:'fixture-u-only',contractInputHash:'a'.repeat(40),actualRequestHash:'b'.repeat(64),model:'gpt-5-mini',maxOutputTokens:3000,attemptLimit:1};
 const x={id:A.intentHash(runId,d),...d},plan={version:A.PLAN_VERSION,operationId:'synthetik500-fixture-old-current',runId,productionCommit:'c'.repeat(40),runtimeManifestHash:'d'.repeat(64),startsAtUTC:'2026-10-01T09:00:00.000Z',endsAtUTC:'2026-10-01T09:30:00.000Z',intents:[x]};
 const slot={version:A.VERSION,plan,planHash:P.hash(plan),consumed:{}},unit={kind:'U',subject:JSON.stringify([x.vorgangId,x.contractInputHash]),intentIds:[x.id]};
 const initial=id=>({operationId:id,commandHash:'e'.repeat(64),planHash:slot.planHash,state:'installed',claimId:null,stopRequested:false,index:0,inFlight:null,units:[clone(unit)],attempts:{},outputs:{},terminalReason:null});
 const current=initial(plan.operationId),superseded=initial('synthetik500-fixture-superseded'),unknown={...initial('synthetik500-fixture-unknown'),state:'unknown',claimId:'fixture-claim',claimedAtUTC:'2026-10-01T09:10:00.000Z',stopRequested:true,inFlight:{index:0,intentIds:[x.id]},units:[{...clone(unit),entered:true}],terminalReason:'unit-not-confirmed'};
 const closedPlan={...clone(plan),operationId:'synthetik500-fixture-closed'},closedSlot={version:A.VERSION,plan:closedPlan,planHash:P.hash(closedPlan),consumed:{[x.id]:{ticketId:'fixture-ticket',day:'2026-10-01',consumedAtUTC:'2026-10-01T09:11:00.000Z',actualRequestHash:x.actualRequestHash,reserved:212000}}};
 const closed={...initial(closedPlan.operationId),planHash:closedSlot.planHash,state:'closed',claimId:'fixture-closed-claim',claimedAtUTC:'2026-10-01T09:10:00.000Z',index:1,units:[{...clone(unit),entered:true}],attempts:{[x.id]:{ticketId:'fixture-ticket',day:'2026-10-01',status:'accounted',reservedAtUTC:'2026-10-01T09:11:00.000Z',sendClaimedAtUTC:'2026-10-01T09:12:00.000Z'}},outputs:{0:{resultHash:'f'.repeat(64),positions:['fixture-position']}},closedSlot};
 const auth={synthetik500KostenAdmission:slot,synthetik500DispatchJournal:{version:J.VERSION,activeOperationId:current.operationId,operations:{[closed.operationId]:closed,[unknown.operationId]:unknown,[superseded.operationId]:superseded,[current.operationId]:current}}};
 return {auth,current,unknown,closed,superseded,slot,x};
}
const evidence=auth=>({version:H.VERSION,controlHash:C.controlHash(auth),actualReviewPin:{sha256:'a'.repeat(64),bytes:1}});
function writerEuHistory(f){
 // Writer-only fictional plan; this is not an EU plan admission or native proof.
 const writerAuth={synthetik500KostenAdmission:clone(f.slot),synthetik500DispatchJournal:{version:J.VERSION,activeOperationId:f.unknown.operationId,operations:{[f.unknown.operationId]:f.unknown}}};
 writerAuth.synthetik500KostenAdmission.plan.routeContract={version:EU.ROUTE_VERSION,serviceContractHash:EU.HASH};
 f.unknown.state='running';f.unknown.stopRequested=false;f.unknown.inFlight=null;f.unknown.units[0].entered=false;
 J.enter(writerAuth,f.unknown.commandHash,f.unknown.claimId,0,'2026-10-01T09:29:40.000Z');
 f.unknown.state='unknown';f.unknown.stopRequested=true;
 return f;
}
const closedError=e=>e.message==='starttor-original-state-closed';
let checks=0;
function test(name,fn){fn();checks++;console.log('PASS '+name);}
function freeze(x){if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;}
function reject(name,mutate){test(name,()=>{const f=fixture();mutate(f);assert.throws(()=>H.pruefe(f.auth,evidence(f.auth),NOW),closedError);});}
function main(){
 test('Reviewed expired current U and closed/unknown/unclaimed history remain byte-exact',()=>{const f=fixture(),before=JSON.stringify(f.auth),e=evidence(f.auth);freeze(f.auth);const r=H.pruefe(f.auth,e,NOW);assert.equal(r.observedOperations,4);assert.equal(r.controlHash,e.controlHash);assert.deepEqual(Object.keys(r).sort(),['controlHash','observedOperations']);assert.equal(JSON.stringify(f.auth),before);assert.equal(f.unknown.state,'unknown');assert(f.unknown.inFlight);});
 test('Review hash and pin are mandatory',()=>{for(const change of [e=>{e.controlHash='0'.repeat(64);},e=>{e.actualReviewPin.bytes=0;},e=>{delete e.actualReviewPin;},e=>{e.version='arbitrary';},e=>{e.quiet=true;}]){const f=fixture(),e=evidence(f.auth);change(e);assert.throws(()=>H.pruefe(f.auth,e,NOW),closedError);}});
 test('Actual EU writer shape with clipped past deadline remains unresolved and immutable',()=>{const f=writerEuHistory(fixture()),before=JSON.stringify(f.auth);assert.deepEqual(Object.keys(f.unknown.inFlight).sort(),['deadlineAtUTC','index','intentIds','serviceContractHash']);assert.equal(f.unknown.inFlight.deadlineAtUTC,'2026-10-01T09:30:00.000Z');freeze(f.auth);assert.equal(H.pruefe(f.auth,evidence(f.auth),NOW).observedOperations,4);assert.equal(JSON.stringify(f.auth),before);assert.equal(f.unknown.state,'unknown');});
 reject('Future historical EU deadline stays blocked',f=>{writerEuHistory(f);f.unknown.inFlight.deadlineAtUTC='2026-10-01T10:01:00.000Z';});
 reject('Historical EU deadline cannot precede its claim',f=>{writerEuHistory(f);f.unknown.inFlight.deadlineAtUTC='2026-10-01T09:09:59.000Z';});
 reject('Historical EU contract hash cannot drift',f=>{writerEuHistory(f);f.unknown.inFlight.serviceContractHash='0'.repeat(64);});
 reject('Invented historical EU entry timestamp is not a writer field',f=>{writerEuHistory(f);f.unknown.inFlight.enteredAtUTC='2026-10-01T09:29:40.000Z';});
 reject('Missing paired slot cannot default to empty',f=>{delete f.auth.synthetik500KostenAdmission;});
 reject('Null journal cannot default to empty',f=>{f.auth.synthetik500DispatchJournal=null;});
 reject('Unknown current id cannot select a prototype fallback',f=>{f.auth.synthetik500DispatchJournal.activeOperationId='__proto__';});
 reject('Claimed current operation stays blocked even with freshly recomputed control hash',f=>{f.current.claimId='fixture-claim';f.current.claimedAtUTC='2026-10-01T09:10:00.000Z';});
 reject('Entered current U stays blocked',f=>{f.current.units[0].entered=true;});
 reject('Current in-flight U stays blocked',f=>{f.current.inFlight={index:0,intentIds:[f.x.id]};f.current.units[0].entered=true;});
 reject('Current D/DR is not a dormant U exception',f=>{f.current.units[0].kind='DR';f.current.units[0].intentIds.push('1'.repeat(64));});
 reject('Current future window cannot be relabelled quiet',f=>{f.slot.plan.endsAtUTC='2026-10-01T10:30:00.000Z';f.slot.planHash=P.hash(f.slot.plan);f.current.planHash=f.slot.planHash;});
 reject('Current plan/unit binding cannot drift',f=>{f.current.units[0].subject='fixture-drift';});
 reject('Slot consumption is never released by the reader',f=>{f.slot.consumed=clone(f.closed.closedSlot.consumed);});
 reject('Running historical operation stays blocked',f=>{f.unknown.state='running';});
 reject('Continuing historical operation stays blocked',f=>{f.unknown.state='continuing';});
 reject('Null historical state stays blocked',f=>{f.unknown.state=null;});
 reject('Unstopped historical unknown is not an archive',f=>{f.unknown.stopRequested=false;});
 reject('Future historical claim observation is refused',f=>{f.unknown.claimedAtUTC='2026-10-01T10:01:00.000Z';});
 reject('Unknown history cannot become an accounted closed operation',f=>{f.unknown.state='closed';});
 reject('Historical current-index/intent mismatch is refused',f=>{f.unknown.inFlight.intentIds=['0'.repeat(64)];});
 reject('Malformed closed-slot hash is refused',f=>{f.closed.closedSlot.planHash='0'.repeat(64);});
 reject('Unresolved closed attempt is refused',f=>{f.closed.attempts[f.x.id].status='unknown';});
 reject('Unknown attempt status is refused',f=>{f.closed.attempts[f.x.id].status='invented';});
 reject('Unclaimed historical install cannot hide attempts',f=>{f.superseded.attempts=clone(f.closed.attempts);});
 reject('Non-finite cursor cannot be interpreted as a completed unit',f=>{f.current.index=NaN;});
 test('Non-finite review clock is refused',()=>{const f=fixture();assert.throws(()=>H.pruefe(f.auth,evidence(f.auth),NaN),closedError);});
 console.log('PASS starttor-preserved-controls '+checks+' cases; fictional only, no native admission or Production proof');
}
if(require.main===module){try{main();}catch(e){console.error(e.stack);process.exitCode=1;}}
module.exports={fixture,main};
