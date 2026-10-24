'use strict';
// UNAPPLIED PROPOSAL / PURE DIAGNOSTIC ONLY. No DB, HTTP, GO or budget writes.
// This does not validate an operational receipt or authorize initialization.
// Before any application: new explicit local GO, pin-bound full native source
// witness, fresh clone/state validation, original K validation of the exact final
// candidate and post-run monetary recheck. Never use incomplete reads as zero.
const assert=require('node:assert/strict');
function prepareMissingHistoricalZeroDays(auth,day,counterEvidence,K,EU){
 assert.equal(counterEvidence.scope,'ACTUAL_FROZEN_LOCAL_COUNTER_TABLE');
 assert.equal(counterEvidence.readSucceeded,true);assert(Array.isArray(counterEvidence.rows));
 assert(/^\d{4}-\d{2}-\d{2}$/.test(day)&&new Date(day).toISOString().slice(0,10)===day);
 const next=structuredClone(auth),before=JSON.stringify(auth),books=next[K.KEY],order=next[K.AUFTRAG_KEY];
 assert(K.euOrder(order));assert(day>=order.abTag&&day<=EU.CONTRACT.lastOrderUTCDate);
 const sums=new Map();for(const r of counterEvidence.rows){assert(/^\d{4}-\d{2}-\d{2}$/.test(r.day));assert(Number.isSafeInteger(r.used)&&r.used>=0);assert(!sums.has(r.day));sums.set(r.day,r.used);}
 const added=[],proof=[];
 for(let t=Date.parse(order.abTag),stop=Date.parse(day);t<stop;t+=86400000){
  const d=new Date(t).toISOString().slice(0,10);if(Object.hasOwn(books,d))continue;
  // SQL read covered the COMPLETE source counter table, so absent aggregate
  // is exact SUM0; accept it ONLY together with the original full usage check.
  const used=sums.get(d)||0,baseline=K.historie(auth,d,used);assert.equal(used,0);assert.equal(baseline,0);
  books[d]={version:EU.DAY_VERSION,day:d,tarif:EU.RATE_ID,limit:EU.DAY_MICRO_USD,serviceContractHash:EU.HASH,spent:0,baseline:0,baselineCalls:0,manualCalls:0,manualUntil:null,calls:{},frozen:null};
  added.push(d);proof.push({day:d,nativeCounter:used,originalHistoryMicroUSD:baseline});
 }
 order.bookCapacity=Object.keys(books).length;assert(order.bookCapacity<=EU.MAX_BOOKS);
 for(const[d,b]of Object.entries(auth[K.KEY]))assert.deepEqual(books[d],b);
 for(const[k,v]of Object.entries(auth[K.AUFTRAG_KEY]))if(k!=='bookCapacity')assert.deepEqual(order[k],v);
 assert.equal(JSON.stringify(auth),before);return{auth:next,addedHistoricalDays:added,proof};
}
module.exports={prepareMissingHistoricalZeroDays};
