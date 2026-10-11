"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const C = require("./blocker3-eu-vorbereitung");
const file = path.join(__dirname, "../docs/betrieb/blocker3-eu-kostenvertrag-20261011.json");
const source = fs.readFileSync(file), contract = JSON.parse(source);
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
let groups = 0;
function group(name, run) { run(); groups++; console.log("PASS " + name); }
group("Oktober-EU-Rechnung, volle Reserve und private Altbindung genau einmal", () => {
  const preparation=JSON.parse(fs.readFileSync(path.join(__dirname,"../docs/betrieb/blocker3-eu-freigabevorbereitung-20261011.json")));
  const pinned=preparation.preparationSHA256;delete preparation.preparationSHA256;
  assert.equal(require("../lib/helmut/synthetik-500-profile").hash(preparation),pinned);
  assert.deepEqual(preparation.calls,contract.calls);
  assert.deepEqual(preparation.externalDependencies,contract.externalDependencies);
  assert.equal(preparation.externalDependencies.length,1);
  assert.equal(preparation.commonContractIntegration.implemented,false);
  assert.equal(preparation.inputProtection.finalProviderCaps,null);
  assert.equal(preparation.runtimeEnforcement,false);assert.equal(preparation.executionAuthorized,false);
  for(const approval of preparation.laterApprovalTemplates){assert.equal(approval.approved,false);assert.equal(approval.approvalOriginal,null);}
  const x = C.analyze(contract);
  assert.equal(preparation.conditionalMoney.serialFinancingPeakMicroUSD,x.money.HMicroUSD);
  assert.equal(preparation.conditionalMoney.newFullRunMaxMicroUSD,x.money.fullMicroUSD);
  assert.equal(preparation.conditionalMoney.orderIncludingPreservedBaselineMicroUSD,x.money.cumulativeWithPreservedBaselineMicroUSD);
  assert.deepEqual([x.money.fullMicroUSD, x.money.HMicroUSD, x.money.dayAtProvenPriorZeroScenarioMicroUSD,
    x.money.cumulativeWithPreservedBaselineMicroUSD], [10543000,10743894,11379894,18189258]);
  assert.equal(x.money.minimumConditionalWholeDollarDay, 12);
  assert.equal(x.money.dayPriorHeadroomAt12MicroUSD, 620106);
  assert.equal(x.money.cumulativeWithPreservedBaselineMicroUSD - x.money.HMicroUSD, 7445364);
  assert.equal(x.money.priorDayConsumptionProven, false);
  assert.equal(x.money.baselineIsFreshStartWitness, false);
});
group("Mikro-USD-Rundung und sichere Integer an der Geldgrenze", () => {
  assert.equal(C.tokenCost(0,0),0); assert.equal(C.tokenCost(1,0),1);
  assert.equal(C.tokenCost(4,0),2); assert.equal(C.tokenCost(0,1),3);
  assert.equal(C.tokenCost(12288,3000),9980); assert.equal(C.tokenCost(16384,3000),11106);
  for (const [i,o] of [[-1,0],[0,0.1],[Infinity,0],[0,NaN],[0,Number.MAX_SAFE_INTEGER]])
    assert.throws(() => C.tokenCost(i,o));
});
group("Unbekannter erster oder letzter Call behält volle Reserve; kein Bruttosummenfehler", () => {
  assert.deepEqual(C.financingEnvelope([10,20,30],100),{fullMicroUSD:60,HMicroUSD:130});
  assert.deepEqual(C.financingEnvelope([0,0],100),{fullMicroUSD:0,HMicroUSD:100});
  assert.throws(() => C.financingEnvelope([],100));
  assert.throws(() => C.financingEnvelope([101],100));
  assert.throws(() => C.financingEnvelope([Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER],Number.MAX_SAFE_INTEGER));
});
group("Freigabe-/Providerflags oder veränderte Vertragswerte können Vorbereitung nicht öffnen", () => {
  for (const key of ["protectedChangesApproved","budgetApproved","routeSwitchApproved","runtimeEnforcement","blocker3Complete"]) {
    const c=structuredClone(contract);c[key]=true;assert.throws(() => C.analyze(c));
  }
  for (const modify of [
    c=>c.targetRoute.deployment="gpt-5-mini",c=>c.pricing.accountBillingPriceProven=false,
    c=>c.targetRoute.automaticGlobalFallbackAllowed=true,
    c=>c.conditionalFinancialCalculation.existingCumulativeOrderUSD=27,
    c=>c.budgetDecision.twelvePerUTCdayAndExistingTwentyCumulativeProven=true,
    c=>c.budgetDecision.currentEndValidatorCumulativeUSD=20,
    c=>c.pricing.inputPerMillion="0.25",c=>c.calls.U=1,c=>c.calls.maxAttemptsPerIntent=2,
    c=>c.calls.outputTokensIncludingReasoning.R=2000,c=>c.conditionalFinancialCalculation.providerInputCapsProven=true,
    c=>c.inputBoundaryAnalysis.RInputProviderCapProven=true,
    c=>c.conditionalFinancialCalculation.cumulativeIncludingPreservedBaselineMicroUSD+=636000,
    c=>c.preservedBaselineDefinition.privateIncludedInTotal=false,
    c=>c.globalCounterUnchanged.understandingReserve=0,c=>c.timeContractUnchanged.proposedActiveWindowSeconds=14400
  ]) { const c=structuredClone(contract);modify(c);assert.throws(() => C.analyze(c)); }
  const x=C.analyze(contract);
  assert.equal(x.executionAuthorized,false);assert.equal(x.runtimeEnforcement,false);assert.equal(x.providerInputBoundProven,false);
});
group("Endliche Zeitplanung und vorhandener Aufrufdeckel sind keine Runtime-Belege", () => {
  const x=C.analyze(contract);
  assert.equal(x.globalCounter.maximumFreshStartUsed,714);
  assert.equal(x.globalCounter.freshRuntimeCounterProven,false);
  assert.equal(x.time.activeProposalSeconds,32400);assert.equal(x.time.completeProposalSeconds,34200);
  assert.equal(x.time.exportScenarioSeconds,1260);assert.equal(x.time.endWorkScenarioSeconds,1620);
  assert.equal(x.time.unitDeadlinesImplemented,false);assert.equal(x.time.counterFeesAndLatencyKnown,false);
  assert.equal(x.time.latestStartUTCExclusive,"2026-10-11T13:00:00.000Z");
});
const schema={type:"object",properties:{result:{type:"string"}},required:["result"],additionalProperties:false};
function body(input="vollständiger unveränderter Prüftext") {
  return JSON.stringify({model:"gpt-5-mini-eu",input,max_output_tokens:3000,reasoning:{effort:"low"},
    text:{format:{type:"json_schema",name:"knowledge_object",schema,strict:true}}});
}
function guard(b=body(),phase="D") {return {phase,body:b,expectedBodySHA256:sha(b),expectedSchemaSHA256:sha(JSON.stringify(schema))};}
group("Vollständige D/R-Sendebytes und Schema gebunden; niemals lokale Zählung als Freigabe", () => {
  for(const phase of ["D","R"]){
    const request=guard(body("Prüftext\nmit \"Schema\" und Unicode: ä €"),phase);
    const original=JSON.stringify(request),x=C.prepareInputGuard(request);
    assert.equal(x.canReserve,false);assert.equal(x.canSend,false);assert.equal(x.providerInputTokens,null);
    assert.equal(x.reason,"MICROSOFT_FULL_INPUT_BOUND_REQUIRED");assert.equal(JSON.stringify(request),original);
    assert.equal(x.utf8Bytes,Buffer.byteLength(request.body));assert.ok(Object.isFrozen(x));
  }
});
group("Body-/Schemadrift, falsche Route, kleinere Antwort und zusätzliche Modellpfade abgewiesen", () => {
  const pinned=guard();assert.throws(()=>C.prepareInputGuard({...pinned,body:body("anderer Text")}));
  assert.throws(()=>C.prepareInputGuard({...pinned,expectedSchemaSHA256:"0".repeat(64)}));
  assert.throws(()=>C.prepareInputGuard({...pinned,providerInputTokens:0,trusted:true}));
  for(const modify of [p=>p.model="gpt-5-mini",p=>p.max_output_tokens=2000,p=>p.reasoning.effort="minimal",
    p=>p.previous_response_id="resp_fake",p=>p.tools=[],p=>p.text.format.strict=false]){
    const p=JSON.parse(body());modify(p);assert.throws(()=>C.prepareInputGuard(guard(JSON.stringify(p))));
  }
});
group("Zukünftiger langer R-Text wird vollständig erhalten und bleibt gesperrt", () => {
  const b=body("a".repeat(120000)+"\n"+String.fromCodePoint(0x1F600).repeat(3000));
  const r=guard(b,"R"),before=r.body,x=C.prepareInputGuard(r);
  assert.equal(r.body,before);assert.equal(x.canSend,false);assert.equal(x.canReserve,false);
  assert.equal(x.bodySHA256,sha(before));assert.equal(x.providerInputTokens,null);
});
assert.equal(fs.readFileSync(file).equals(source),true);
console.log("PASS "+groups+" Gruppen; netzlos, keine Freigabe/Production-/Budget-/Reserveänderung.");
