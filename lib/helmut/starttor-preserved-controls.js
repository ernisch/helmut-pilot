"use strict";
// Observe reviewed, immutable history only. Never claim, settle or install it.
const C=require('./synthetik-500-production-command'),A=require('./synthetik-500-kosten-admission');
const J=require('./synthetik-500-dispatch-journal'),EU=require('./synthetik-500-eu-service-contract');
const VERSION='helmut-original-state-preserved-controls/1';
const SHA=/^[a-f0-9]{64}$/,OP=/^synthetik500-[a-zA-Z0-9_-]{8,100}$/;
const BASE=['operationId','commandHash','planHash','state','claimId','stopRequested','index','inFlight','units','attempts','outputs','terminalReason'];
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
const exact=(x,keys)=>object(x)&&Object.keys(x).sort().join('|')===keys.slice().sort().join('|');
const empty=x=>object(x)&&Object.keys(x).length===0;
const need=ok=>{if(!ok)throw Error('starttor-original-state-closed');};
const utc=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
function unit(u){
 need(exact(u,['kind','subject','intentIds',...(Object.hasOwn(u||{},'entered')?['entered']:[])])
  &&['U','DR'].includes(u.kind)&&typeof u.subject==='string'&&u.subject.length>0
  &&Array.isArray(u.intentIds)&&u.intentIds.length===(u.kind==='U'?1:2)
  &&u.intentIds.every(id=>typeof id==='string'&&SHA.test(id))&&new Set(u.intentIds).size===u.intentIds.length
  &&(!Object.hasOwn(u,'entered')||typeof u.entered==='boolean'));
}
function initial(c){
 need(exact(c,BASE)&&c.state==='installed'&&c.claimId===null&&!c.stopRequested&&c.index===0
  &&c.inFlight===null&&c.terminalReason===null&&empty(c.attempts)&&empty(c.outputs)
  &&c.units.length===1&&c.units[0].kind==='U'&&c.units[0].entered!==true);
}
function operation(c,id,now){
 need(exact(c,[...BASE,...(Object.hasOwn(c||{},'claimedAtUTC')?['claimedAtUTC']:[]),...(Object.hasOwn(c||{},'closedSlot')?['closedSlot']:[])])&&c.operationId===id&&OP.test(id)
  &&typeof c.commandHash==='string'&&SHA.test(c.commandHash)&&typeof c.planHash==='string'&&SHA.test(c.planHash)
  &&['installed','closed','stopped','unknown'].includes(c.state)&&typeof c.stopRequested==='boolean'
  &&(c.claimId===null||typeof c.claimId==='string'&&c.claimId.length>0)
  &&(c.terminalReason===null||typeof c.terminalReason==='string'&&c.terminalReason.length>0)
  &&Array.isArray(c.units)&&c.units.length>0&&c.units.length<=A.MAX_INTENTS
  &&Number.isSafeInteger(c.index)&&c.index>=0&&c.index<=c.units.length&&object(c.attempts)&&object(c.outputs));
 need(c.claimId===null?!Object.hasOwn(c,'claimedAtUTC'):utc(c.claimedAtUTC)&&Date.parse(c.claimedAtUTC)<=now);
 c.units.forEach(unit);
 const ids=new Set(c.units.flatMap(u=>u.intentIds));need(ids.size===c.units.reduce((n,u)=>n+u.intentIds.length,0));
 need(Object.keys(c.attempts).length<=ids.size&&Object.keys(c.outputs).length<=c.units.length);
 for(const [id,r] of Object.entries(c.attempts)){
  need(ids.has(id)&&exact(r,['ticketId','day','status','reservedAtUTC',...(Object.hasOwn(r||{},'sendClaimedAtUTC')?['sendClaimedAtUTC']:[])])
   &&typeof r.ticketId==='string'&&r.ticketId.length>0&&typeof r.day==='string'&&/^\d{4}-\d\d-\d\d$/.test(r.day)
   &&['reserved','sent','accounted','unknown','not-sent'].includes(r.status)&&utc(r.reservedAtUTC)
   &&r.day===r.reservedAtUTC.slice(0,10)&&Date.parse(r.reservedAtUTC)<=now
   &&(!Object.hasOwn(r,'sendClaimedAtUTC')||utc(r.sendClaimedAtUTC)&&Date.parse(r.sendClaimedAtUTC)>=Date.parse(r.reservedAtUTC)&&Date.parse(r.sendClaimedAtUTC)<=now));
 }
 for(const [index,o] of Object.entries(c.outputs))need(/^(0|[1-9]\d*)$/.test(index)&&Number(index)<c.index
  &&exact(o,['resultHash','positions'])&&typeof o.resultHash==='string'&&SHA.test(o.resultHash)&&Array.isArray(o.positions));
 if(c.inFlight!==null){
  const f=c.inFlight,eu=Object.hasOwn(f||{},'serviceContractHash');
  need(exact(f,['index','intentIds',...(eu?['serviceContractHash','deadlineAtUTC']:[])])
   &&Number.isSafeInteger(f.index)&&f.index===c.index&&f.index<c.units.length
   &&Array.isArray(f.intentIds)&&JSON.stringify(f.intentIds)===JSON.stringify(c.units[f.index].intentIds)&&c.units[f.index].entered===true);
  // The writer clips the deadline at plan end and records no entry timestamp.
  // Expiry permits observation only; the unknown result remains unresolved.
  if(eu)need(f.serviceContractHash===EU.HASH&&utc(f.deadlineAtUTC)
   &&utc(c.claimedAtUTC)&&Date.parse(f.deadlineAtUTC)>Date.parse(c.claimedAtUTC)&&Date.parse(f.deadlineAtUTC)<=now);
 }
 const unresolved=Object.values(c.attempts).some(r=>['reserved','sent','unknown'].includes(r.status));
 if(c.state==='installed')initial(c);
 else if(c.state==='closed')need(c.claimId!==null&&c.inFlight===null&&!c.stopRequested&&c.index===c.units.length
  &&ids.size===Object.keys(c.attempts).length&&Object.values(c.attempts).every(r=>r.status==='accounted'));
 else if(c.state==='stopped')need(c.stopRequested&&c.inFlight===null&&!unresolved);
 else need(c.claimId!==null&&c.stopRequested&&(c.inFlight!==null||unresolved)); // Unknown is retained, never interpreted as free.
 if(Object.hasOwn(c,'closedSlot')){
  need(c.state==='closed');A.pruefeSlot(c.closedSlot);
  need(c.closedSlot.plan.operationId===c.operationId&&c.closedSlot.planHash===c.planHash&&Date.parse(c.closedSlot.plan.endsAtUTC)<=now);
 }
}
function pruefe(auth,evidence,now){
 try{
  need(Number.isFinite(now)&&object(auth)&&exact(evidence,['version','controlHash','actualReviewPin'])
   &&evidence.version===VERSION&&typeof evidence.controlHash==='string'&&SHA.test(evidence.controlHash)
   &&exact(evidence.actualReviewPin,['sha256','bytes'])&&typeof evidence.actualReviewPin.sha256==='string'&&SHA.test(evidence.actualReviewPin.sha256)
   &&Number.isSafeInteger(evidence.actualReviewPin.bytes)&&evidence.actualReviewPin.bytes>0
   &&Object.hasOwn(auth,'synthetik500KostenAdmission')&&Object.hasOwn(auth,'synthetik500DispatchJournal'));
  const slot=auth.synthetik500KostenAdmission,j=auth.synthetik500DispatchJournal;
  need(object(slot)&&exact(j,['version','activeOperationId','operations'])&&j.version===J.VERSION
   &&typeof j.activeOperationId==='string'&&object(j.operations)&&Object.keys(j.operations).length>0
   &&Object.keys(j.operations).length<=64&&Object.hasOwn(j.operations,j.activeOperationId)
   &&C.controlHash(auth)===evidence.controlHash);
  const {p}=A.pruefeSlot(slot),active=j.operations[j.activeOperationId];
  for(const [id,c] of Object.entries(j.operations))operation(c,id,now);
  initial(active);
  need(p.operationId===active.operationId&&slot.planHash===active.planHash&&p.intents.length===1&&p.intents[0].phase==='U'
   &&Date.parse(p.endsAtUTC)<=now&&empty(slot.consumed)
   &&(!Object.hasOwn(slot,'draftCompletions')||empty(slot.draftCompletions))
   &&(!Object.hasOwn(slot,'reviewBindings')||empty(slot.reviewBindings))
   &&active.units[0].intentIds[0]===p.intents[0].id
   &&active.units[0].subject===JSON.stringify([p.intents[0].vorgangId,p.intents[0].contractInputHash]));
  return {controlHash:evidence.controlHash,observedOperations:Object.keys(j.operations).length};
 }catch(_){throw Error('starttor-original-state-closed');}
}
module.exports={VERSION,pruefe};
