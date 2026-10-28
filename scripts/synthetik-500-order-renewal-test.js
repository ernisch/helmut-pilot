"use strict";
// Corrective contract checks only; no model, HTTP, DB or Production action.
const assert = require("node:assert/strict");
const EU = require("../lib/helmut/synthetik-500-eu-service-contract");
const K = require("../lib/helmut/testkosten-budget");
const A = require("../lib/helmut/synthetik-500-kosten-admission");
const P = require("../lib/helmut/synthetik-500-profile");
const { fixture } = require("./synthetik-500-eu-service-contract-test");
const START = "2026-10-27T10:00:00.000Z", END = "2026-10-27T19:00:00.000Z", DAY = START.slice(0,10);
function renewed(auth, day = DAY) {
  for (let ms=Date.parse("2026-09-09"); ms<=Date.parse(day); ms+=86400000) {
    const d=new Date(ms).toISOString().slice(0,10);
    auth[K.KEY][d] ||= { version:3, day:d, tarif:EU.RATE_ID, limit:EU.DAY_MICRO_USD,
      serviceContractHash:EU.HASH, spent:0, baseline:0, baselineCalls:0,
      manualCalls:0, manualUntil:null, calls:{}, frozen:null };
  }
  Object.assign(auth[K.AUFTRAG_KEY], { version:6, orderRenewalHash:EU.ORDER_RENEWAL_HASH,
    bookCapacity:Object.keys(auth[K.KEY]).length });
  return auth;
}
function scenario() {
  const h=fixture();
  h.modify(auth=>{
    renewed(auth);
    auth[K.AUFTRAG_KEY].runDayUTC=DAY;
    const plan=auth[A.KEY].plan;
    plan.startsAtUTC=START; plan.endsAtUTC=END;
    Object.assign(plan.routeContract.management,{validFromUTC:START,validUntilUTC:END});
    plan.routeContract.orderRenewalHash=EU.ORDER_RENEWAL_HASH;
    auth[A.KEY].planHash=P.hash(plan);
  });
  h.deps.now=()=>new Date(START);
  h.deps.env.HELMUT_SYNTHETIK500_EU_ORDER_RENEWAL=EU.ORDER_RENEWAL_HASH;
  // fixture's request closure retains the original plan; bind actual candidate.
  const args=h.args(h.read()[A.KEY].plan.intents[0]);
  args.admission.planHash=h.read()[A.KEY].planHash;
  args.admission.routeContractHash=P.hash(h.read()[A.KEY].plan.routeContract);
  return {h,args};
}
async function main() {
  let groups=0;
  assert.equal(EU.HASH,"78833d91aea2ad9c795cbb9790df031c230c98efd27d581faa79522c5da8175f");
  assert.equal(EU.CONTRACT.lastOrderUTCDate,"2026-10-25");
  assert.equal(EU.MAX_BOOKS,47);
  assert.equal(EU.ORDER_RENEWAL.dayMicroUSD,82036000);
  assert.equal(EU.ORDER_RENEWAL.orderMicroUSD,88845364);
  assert.equal(EU.ORDER_RENEWAL.runMaxMicroUSD,81400000); groups++;
  const old=fixture().read();
  assert.throws(()=>K.auftragsStand(old,DAY));
  const candidate=renewed(structuredClone(old));
  assert.equal(K.auftragsStand(candidate,DAY).gebundenMicroUsd,7445364);
  assert.equal(K.pruefeStart(candidate,DAY,{ok:true,used:0}).tagesbuchVorhanden,true);
  assert.equal(candidate[K.AUFTRAG_KEY].runDayUTC,old[K.AUFTRAG_KEY].runDayUTC);
  for (const [d,b] of Object.entries(old[K.KEY])) assert.deepEqual(candidate[K.KEY][d],b);
  assert.equal(EU.retainUsage(Array(6000).fill(null),candidate[K.AUFTRAG_KEY],5000).length,6000); groups++;
  for (const change of [a=>a[K.AUFTRAG_KEY].version=5,
    a=>a[K.AUFTRAG_KEY].orderRenewalHash="f".repeat(64),
    a=>a[K.AUFTRAG_KEY].bookCapacity=54,
    a=>a[K.AUFTRAG_KEY].limit++, a=>a[K.AUFTRAG_KEY].privateReserveMicroUSD--,
    a=>delete a[K.KEY]["2026-10-17"]]) {
    const a=structuredClone(candidate);change(a);assert.throws(()=>K.auftragsStand(a,DAY));
  }
  assert.throws(()=>K.auftragsStand(renewed(structuredClone(old),"2026-11-01"),"2026-11-01")); groups++;
  const lastDay=renewed(structuredClone(old),"2026-10-31");
  lastDay[K.AUFTRAG_KEY].runDayUTC="2026-10-31";
  assert.equal(K.auftragsStand(lastDay,"2026-10-31").gebundenMicroUsd,7445364);
  assert.equal(Object.keys(lastDay[K.KEY]).length,53);
  const route=structuredClone(fixture().read()[A.KEY].plan.routeContract);
  assert.equal(EU.contractForRoute(route).lastOrderUTCDate,"2026-10-25");
  route.orderRenewalHash=EU.ORDER_RENEWAL_HASH;
  assert.equal(EU.contractForRoute(route).lastOrderUTCDate,"2026-10-31");
  route.orderRenewalHash="f".repeat(64);assert.equal(EU.isRoute(route),false); groups++;
  const {h,args}=scenario(); A.pruefeSlot(h.read()[A.KEY]);
  const noEnv=scenario(); delete noEnv.h.deps.env.HELMUT_SYNTHETIK500_EU_ORDER_RENEWAL;
  await assert.rejects(K.reserviere(noEnv.args,noEnv.h.deps),/renewal-runtime-plan-unbound/);
  const noPlan=scenario(); noPlan.h.modify(a=>{delete a[A.KEY].plan.routeContract.orderRenewalHash;a[A.KEY].planHash=P.hash(a[A.KEY].plan);});
  assert.throws(()=>A.pruefeSlot(noPlan.h.read()[A.KEY]));
  const ticket=await K.reserviere(args,h.deps); assert.equal(ticket.reserved,81400); groups++;
  // Reuse the prepared PR967 contract tests only; no SQL proposal/import.
  console.log("PASS "+groups+" renewal groups: old contract immutable, financial limits/history preserved, explicit route/order/runtime binding; no SQL/HTTP/model calls");
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={renewed,scenario};
