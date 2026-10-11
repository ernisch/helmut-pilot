"use strict";
// Cross-module money/route/receipt checks with frozen fictional data only.
const assert = require("node:assert/strict");
const EU = require("../lib/helmut/synthetik-500-eu-service-contract");
const K = require("../lib/helmut/testkosten-budget");
const A = require("../lib/helmut/synthetik-500-kosten-admission");
const P = require("../lib/helmut/synthetik-500-profile");
const N = require("../lib/helmut/synthetik-500-nachweis");
const R = require("../lib/helmut/synthetik-500-review-receipt");
const S = require("../lib/helmut/storage");
const START = "2026-10-12T10:00:00.000Z", END = "2026-10-12T19:00:00.000Z", DAY = START.slice(0,10);
const COMMIT = "c".repeat(40), RUN = "nachlauf500-1791799200000", OP = "synthetik500-eu-offline-only-20261012";
const clone = structuredClone, paket = P.erzeuge();
const payload = { model: EU.CONTRACT.model, input: "Fiktiver vollständiger Text 😀", max_output_tokens:3000,
  reasoning:{effort:"low"}, text:{format:{type:"json_schema",name:"fixture",strict:false,schema:{type:"object"}}} };
const requestHash = A.requestHash(JSON.stringify(payload));
function fixture() {
  const route = { provider:"azure", responsesUrl:EU.CONTRACT.responseURL, model:EU.CONTRACT.model,
    productionCommit:COMMIT, deploymentHost:"helmut-offline.vercel.app",deploymentId:"dpl_Offline",authMode:"api-key" };
  const management = { modelFamily:"gpt-5-mini",versionPolicy:"fixed-eu-service-ceiling",contextTokens:400000,
    maxInputTokens:272000,inputReserveTokens:272000,maxOutputTokens:128000,reasoningIncludedInOutput:true,
    inputUsdPerMillion:0.275,outputUsdPerMillion:2.2,validFromUTC:START,validUntilUTC:END,
    modelVersion:EU.CONTRACT.modelVersion,sku:EU.CONTRACT.sku,region:EU.CONTRACT.region,versionUpgradeOption:"NoAutoUpgrade",
    evidencePins:Object.fromEntries(["rootAdmission","management","serviceContext","price"].map(k=>[k,{name:"fictional-"+k,sha256:P.hash(k),bytes:10}])) };
  const intent = d => ({id:A.intentHash(RUN,d),...d});
  const intents = paket.profile.flatMap(p => {
    const d = intent({phase:"D",owner:p.mandatsId,inputVersionHash:P.hash(p),actualRequestHash:requestHash,model:"gpt-5-mini",maxOutputTokens:3000,attemptLimit:1});
    return [d,intent({phase:"R",owner:p.mandatsId,inputVersionHash:null,actualRequestHash:null,dependsOn:d.id,contextVersionHash:d.inputVersionHash,
      model:"gpt-5-mini",maxOutputTokens:3000,attemptLimit:1,reviewRule:{version:R.RULE_VERSION,reasoningEffort:"low"}})];
  });
  const plan = { version:A.ROUTE_PLAN_VERSION,operationId:OP,runId:RUN,productionCommit:COMMIT,runtimeManifestHash:P.hash("fictional-runtime"),
    startsAtUTC:START,endsAtUTC:END,intents,sourceBinding:{inputVersion:A.ROUTE_INPUT_VERSION,inputHash:P.hash("fictional-sources"),
      projectionVersion:require("../lib/helmut/knowledge-object-version").VERSION,projectionFieldsetHash:require("../lib/helmut/knowledge-object-version").FIELDSET_HASH},
    routeContract:{version:EU.ROUTE_VERSION,serviceContractHash:EU.HASH,runtimeManifestHash:P.hash("fictional-runtime"),route,management} };
  const slot = {version:A.ROUTE_VERSION,plan,planHash:P.hash(plan),consumed:{},draftCompletions:{},reviewBindings:{},reviewBindingsHash:P.hash({})};
  const books = {};
  for(let d=Date.parse(EU.CONTRACT.orderSinceUTC);d<=Date.parse(DAY);d+=86400000){const day=new Date(d).toISOString().slice(0,10);
    books[day]={version:2,day,limit:6000000,tarif:"azure-gpt5-mini-obergrenze-20260909",spent:0,baseline:0,baselineCalls:0,manualCalls:0,calls:{},manualUntil:null,frozen:null};}
  books[EU.CONTRACT.orderSinceUTC].baseline=1614061;books[EU.CONTRACT.orderSinceUTC].spent=1614061;
  Object.assign(books[DAY],{version:EU.DAY_VERSION,limit:EU.DAY_MICRO_USD,tarif:EU.RATE_ID,serviceContractHash:EU.HASH});
  let state={llmUsage:[],[A.KEY]:slot,[K.KEY]:books,[K.AUFTRAG_KEY]:{version:5,id:EU.CONTRACT.orderId,abTag:EU.CONTRACT.orderSinceUTC,
    limit:EU.ORDER_MICRO_USD,externGebunden:5195303,serviceContractHash:EU.HASH,privateReserveMicroUSD:636000,bookCapacity:Object.keys(books).length,runDayUTC:DAY}};
  const h={counter:0,read:()=>clone(state),modify:fn=>fn(state)};let queue=Promise.resolve();
  h.storage={readAuthStore:async()=>h.read(),leseLlmTageszaehler:async()=>({ok:true,used:h.counter}),mutateAuthStore:fn=>{
    const result=queue.then(async()=>{const draft=h.read(),r=await fn(draft);state=draft;return r;});queue=result.catch(()=>{});return result;}};
  h.deps={storage:h.storage,env:{VERCEL_ENV:"production",HELMUT_TESTLAUF_KOMMUNIKATION:"gesperrt",AZURE_OPENAI_KEY:"fictional",VERCEL_GIT_COMMIT_SHA:COMMIT,
    HELMUT_SYNTHETIK500_EU_SERVICE_CONTRACT:EU.HASH},now:()=>new Date(START),id:()=>"ticket-"+Math.random().toString(36).slice(2)};
  h.args=d=>({model:EU.CONTRACT.model,maxOutputTokens:3000,runId:RUN,politicianId:d.owner,phase:"entwurf",inputVersionHash:d.inputVersionHash,
    actualRequestHash:d.actualRequestHash,runtimeRouteSnapshot:clone(route),admission:{operationId:OP,planHash:slot.planHash,routeContractHash:P.hash(plan.routeContract)}});
  return h;
}
function completedFixture() {
  const h=fixture(),before=h.read();
  h.modify(auth=>{
    const slot=auth[A.KEY],book=auth[K.KEY][DAY];
    for(const x of slot.plan.intents){const id="ticket-"+x.id,actual=x.phase==="D"?x.actualRequestHash:P.hash(x.id+"review"),usageId="usage-"+x.id;
      const admission={version:A.ROUTE_VERSION,planHash:slot.planHash,operationId:OP,runId:RUN,intentId:x.id,actualRequestHash:actual,
        startsAtUTC:START,endsAtUTC:END,productionCommit:COMMIT,phase:x.phase,routeContractHash:P.hash(slot.plan.routeContract),runtimeRouteSnapshot:slot.plan.routeContract.route};
      if(x.phase==="D"){
        const base={version:R.COMPLETION_VERSION,planHash:slot.planHash,operationId:OP,runId:RUN,dIntentId:x.id,dTicket:{id,day:DAY},owner:x.owner,
          contextHash:x.inputVersionHash,providerResponseHash:P.hash(x.id+"response"),providerTextHash:P.hash(x.id+"text"),outputHash:P.hash(x.id+"output"),
          sourceContext:{profileHash:P.hash(x.owner),sourcesHash:P.hash("fictional-sources")},usageReceipt:{id:usageId,recordHash:P.hash(usageId)},costMicroUsd:81400,completedAtUTC:START};
        slot.draftCompletions[x.id]={...base,completionHash:P.hash(base)};
      }else{
        const c=slot.draftCompletions[x.dependsOn],base={version:R.VERSION,dCompletionHash:c.completionHash,dIntentId:x.dependsOn,rule:x.reviewRule,
          promptHash:P.hash(x.id+"prompt"),actualRequestHash:actual,bodySha256:P.hash(x.id+"body"),storedD:{id:"stored-"+x.id,owner:x.owner,runId:RUN,
            versionHash:P.hash(x.id+"version"),outputHash:c.outputHash,contextHash:x.contextVersionHash,profileHash:c.sourceContext.profileHash,
            sourcesHash:c.sourceContext.sourcesHash,storageContractHash:P.hash("fictional-storage")}};
        slot.reviewBindings[x.id]={...base,bindingHash:P.hash(base)};admission.reviewBindingHash=P.hash(base);
      }
      slot.consumed[x.id]={ticketId:id,day:DAY,consumedAtUTC:START,actualRequestHash:actual,reserved:81400,routeContractHash:admission.routeContractHash,
        ...(x.phase==="R"?{reviewBindingHash:admission.reviewBindingHash}:{})};
      book.calls[id]={status:"abgerechnet",reserved:81400,maxOutputTokens:3000,manual:false,createdAt:START,contractHash:EU.HASH,tarif:EU.RATE_ID,
        admission,cost:81400,usageReceiptId:usageId};book.spent+=81400;
      auth.llmUsage.push({id:usageId,createdAt:START,success:true,model:EU.CONTRACT.model,serviceContractHash:EU.HASH,tariffId:EU.RATE_ID,
        budgetTicketId:id,costIntentId:x.id,costPlanHash:slot.planHash,costRequestHash:actual,costPhase:x.phase,
        runId:RUN,politicianId:x.owner,promptTokens:272000,completionTokens:3000,totalTokens:275000,estimatedCost:0.0814});
    }slot.reviewBindingsHash=P.hash(slot.reviewBindings);
  });
  const after=h.read(),plan={version:EU.SOLLPLAN_VERSION,serviceContractHash:EU.HASH,operationId:OP,productionCommit:COMMIT,runtimeManifestHash:P.hash("fictional-runtime"),deploymentId:"dpl_Offline",startsAt:START,endsAt:END,sollpositionen:paket.profile.map(p=>({mandatsId:p.mandatsId}))};
  const cost={serviceContractHash:EU.HASH,nativeBefore:before,nativeAfter:after,counterBefore:0,counterAfter:1000,
    auftragVerbrauchtUsd:K.auftragsStand(after,DAY).gebundenMicroUsd/1e6,auftragReserviertUsd:0,
    utcTage:[{tag:DAY,verbrauchtUsd:81.4,reserviertUsd:0.636}]};
  return {plan,cost};
}
async function main(){let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log("PASS "+name);};
  await test("Exact service ceiling/round-up and private reserve once",()=>{
    assert.equal(EU.tokenCost(272000,3000),81400);assert.equal(EU.tokenCost(1,0),1);assert.throws(()=>EU.tokenCost(272001,0));
    const h=fixture();assert.equal(K.auftragsStand(h.read(),DAY).gebundenMicroUsd,7445364);assert.equal(K.kontrolliere(h.read(),DAY).limitUsd,82.036);
    EU.assertPayload(payload);assert.throws(()=>EU.assertPayload({...payload,tools:[]}));assert.throws(()=>EU.assertPayload({...payload,max_output_tokens:2999}));
  });
  await test("EU admission binds 500D/500R, U0, exact tariff, SKU, region and nine hours",()=>{
    const h=fixture();A.pruefeSlot(h.read()[A.KEY]);
    for(const change of [s=>s.plan.intents.pop(),s=>s.plan.routeContract.management.sku="GlobalStandard",s=>s.plan.routeContract.management.inputUsdPerMillion=0.25,
      s=>s.plan.routeContract.serviceContractHash="0".repeat(64),s=>s.plan.endsAtUTC="2026-10-12T19:00:01.000Z"]){
      const slot=h.read()[A.KEY];change(slot);slot.planHash=P.hash(slot.plan);assert.throws(()=>A.pruefeSlot(slot));}
  });
  await test("Confirmed EU reservation, metadata cannot select tariff, native exact settlement",async()=>{
    const h=fixture(),d=h.read()[A.KEY].plan.intents[0],t=await K.reserviere(h.args(d),h.deps);assert.equal(t.reserved,81400);
    const entry={model:EU.CONTRACT.model,runId:RUN,politicianId:d.owner,success:true,usage:{input_tokens:272000,output_tokens:3000}};
    const receipt=S.buildLlmUsageRecord(entry,{serviceTicket:t,id:"receipt",createdAt:START});assert.equal(receipt.estimatedCost,0.0814);
    assert.notEqual(S.buildLlmUsageRecord({...entry,serviceContractHash:EU.HASH}).tariffId,EU.RATE_ID);
    h.modify(s=>s.llmUsage.push(receipt));await K.abschliessen(t,{...receipt,_ablage:{blob:true}},h.deps);
    assert.equal(h.read()[K.KEY][DAY].spent,81400);assert.equal(K.auftragsStand(h.read(),DAY).gebundenMicroUsd,7526764);
  });
  await test("Unsettled/unknown ticket blocks second request; production stays locked without TestGO",async()=>{
    const h=fixture(),ds=h.read()[A.KEY].plan.intents.filter(x=>x.phase==="D");await K.reserviere(h.args(ds[0]),h.deps);
    await assert.rejects(K.reserviere(h.args(ds[1]),h.deps));
    const locked=fixture();locked.modify(s=>s[K.AUFTRAG_KEY].runDayUTC=null);await assert.rejects(K.reserviere(locked.args(ds[0]),locked.deps));
    const higher=fixture();higher.modify(s=>s[K.AUFTRAG_KEY].externGebunden++);await assert.rejects(K.reserviere(higher.args(ds[0]),higher.deps));
  });
  await test("1000 native receipts exactly finance 81.4 plus preserved opening; end proof rejects drift",()=>{
    const {plan,cost}=completedFixture();assert.equal(K.auftragsStand(cost.nativeAfter,DAY).gebundenMicroUsd,88845364);
    assert.equal(N.pruefeEUKostenbeleg(cost,plan),true);
    for(const mutate of [c=>c.counterAfter++,c=>c.nativeAfter.llmUsage.pop(),c=>c.nativeAfter.llmUsage[0].costRequestHash="0".repeat(64),
      c=>c.nativeAfter.llmUsage[0].politicianId="foreign",c=>c.nativeAfter[K.KEY]["2026-09-25"].baseline++,
      c=>c.nativeAfter[K.KEY][DAY].calls[Object.keys(c.nativeAfter[K.KEY][DAY].calls)[0]].cost++]){
      const c=clone(cost);mutate(c);assert.equal(N.pruefeEUKostenbeleg(c,plan),false);}
  });
  await test("Version-bound book capacity cannot exceed47 or omit native books",()=>{
    const h=fixture();for(const cap of [0,48]){const s=h.read();s[K.AUFTRAG_KEY].bookCapacity=cap;assert.throws(()=>K.auftragsStand(s,DAY));}
    assert.equal(require("./run-offline-tests").STANDARD.has("synthetik-500-eu-service-contract-test.js"),true);
  });
  console.log(passed+"/"+passed+" EU groups; zero provider/Production calls.");return passed;
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={fixture,completedFixture,main};
