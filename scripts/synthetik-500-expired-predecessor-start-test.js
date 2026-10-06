"use strict";
// Isolated transport fixtures. Real C/A/J validators, no network or Production.
const assert=require('node:assert/strict'),P=require('../lib/helmut/synthetik-500-profile'),A=require('../lib/helmut/synthetik-500-kosten-admission'),K=require('../lib/helmut/testkosten-budget'),KO=require('../lib/helmut/knowledge-object-version'),C=require('../lib/helmut/synthetik-500-production-command'),J=require('../lib/helmut/synthetik-500-dispatch-journal'),Adapter=require('../lib/helmut/synthetik-500-production-adapter');
const START='2030-01-02T12:00:00.000Z',END='2030-01-02T13:00:00.000Z',DAY=START.slice(0,10),COMMIT='c'.repeat(40),OP='synthetik500-production-fake-only',RUN='nachlauf500-1893585600000',sha=P.hash,clone=structuredClone;
const noNet=()=>{throw Error('fixture forbids network');};global.fetch=noNet;require('node:https').request=noNet;require('node:http').request=noNet;
let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
function fixture(phase = "U") {
  const descriptor = phase === "U" ? { phase: "U", vorgangId: "fixture-only", contractInputHash: "d".repeat(40),
    actualRequestHash: sha("fake-U-body"), model: "gpt-5-mini", maxOutputTokens: 3000, attemptLimit: 1 }
    : { phase: "D", owner: "test-kohorte-synthetik-bt-001", inputVersionHash: sha("fake-context"),
      actualRequestHash: sha("fake-D-body"), model: "gpt-5-mini", maxOutputTokens: 3000, attemptLimit: 1 };
  const routeContract = { version: A.ROUTE_CONTRACT_VERSION, runtimeManifestHash: sha("fake-runtime"), route: {
    provider: "azure", responsesUrl: "https://helmut-resource.openai.azure.com/openai/v1/responses", model: "gpt-5-mini",
    productionCommit: COMMIT, deploymentHost: "helmut-fake-immutable.vercel.app", deploymentId: "dpl_FakeOnly", authMode: "api-key" }, management: {
    modelFamily: "gpt-5-mini", versionPolicy: "family-context-price-class-re-admit-on-contradiction", contextTokens: 400000,
    maxInputTokens: 272000, inputReserveTokens: 400000, maxOutputTokens: 128000, reasoningIncludedInOutput: true,
    inputUsdPerMillion: 0.5, outputUsdPerMillion: 4, validFromUTC: START, validUntilUTC: END,
    evidencePins: Object.fromEntries(["rootAdmission", "management", "serviceContext", "price"].map(name => [name,
      { name: "fake-" + name, sha256: sha(name), bytes: 1 }])) } };
  const intent = { id: A.intentHash(RUN, descriptor), ...descriptor };
  const plan = { version: A.ROUTE_PLAN_VERSION, operationId: OP, runId: RUN, productionCommit: COMMIT,
    runtimeManifestHash: sha("fake-runtime"), startsAtUTC: START, endsAtUTC: END, intents: [intent],
    sourceBinding: { inputVersion: A.ROUTE_INPUT_VERSION, inputHash: sha("fake-W-no-actual"), projectionVersion: KO.VERSION,
      projectionFieldsetHash: KO.FIELDSET_HASH }, routeContract };
  const slot = { version: A.ROUTE_VERSION, plan, planHash: sha(plan), consumed: {}, draftCompletions: {},
    reviewBindings: {}, reviewBindingsHash: sha({}) };
  const doc = Object.fromEntries(require("../lib/helmut/synthetik-500-w-inventar").SOURCE_VERSION_FIELDS.map(k => [k, null]));
  doc.id = "fake-document";
  const command = { version: C.VERSION, mode: "U-prestage", package: null, executor: null, slot,
    understanding: [{ intentId: intent.id, cluster: { documents: [require("../lib/helmut/quellen-auszug").geleseneQuelle(clone(doc))] },
      reads: { getExisting: { "fixture-only": null }, findVorgangCandidates: {}, listVorgangDocuments: {} },
      sources: { documents: [doc], knowledgeObjects: [] }, options: {} }], drafts: [], predecessors: [], native: null,
    units: [{ kind: "U", subject: JSON.stringify([descriptor.vorgangId, descriptor.contractInputHash]), intentIds: [intent.id] }] };
  const auth = { llmUsage: [], testKostenAuftrag: { version: 3, id: "fake-order", abTag: DAY, limit: 7000000, externGebunden: 0 } };
  const record = { version: C.ADMISSION_VERSION, executor: "/root", purpose: "finite-U-prestage-no-500", commandHash: sha(command),
    planHash: slot.planHash, productionCommit: COMMIT, admittedAtUTC: START, expiresAtUTC: END,
    controlHash: C.controlHash(auth), booksHash: C.booksHash(auth),
    gates: Object.fromEntries(C.GATES.filter(g => !["nativeD", "endGuard", "outputContract"].includes(g)).map(g => [g, true])), evidencePins: {} };
  record.evidencePins = Object.fromEntries(Object.keys(record.gates).map(g => [g, { path: "/tmp/fake-only-" + g,
    bytes: 1, sha256: sha("never-read-as-actual") }]));
  return { command, record, auth, intent };
}
function dated(f,op,run,start,end){
 const plan=f.command.slot.plan;Object.assign(plan,{operationId:op,runId:run,startsAtUTC:start,endsAtUTC:end});Object.assign(plan.routeContract.management,{validFromUTC:start,validUntilUTC:end});
 const {id,...desc}=plan.intents[0];plan.intents[0]={id:A.intentHash(run,desc),...desc};f.intent=plan.intents[0];f.command.understanding[0].intentId=f.intent.id;f.command.units[0].intentIds=[f.intent.id];f.command.slot.planHash=sha(plan);C.validate(f.command);return f;
}
function scenario(){
 const ms=Date.now(),iso=x=>new Date(x).toISOString(),old=dated(fixture(),'synthetik500-fixture-old-unclaimed','nachlauf500-'+(ms-7200000),iso(ms-7200000),iso(ms-3600000)),next=dated(fixture(),'synthetik500-fixture-new-only','nachlauf500-'+(ms-1000),iso(ms-1000),iso(ms+1200000));
 const auth={llmUsage:[],[K.AUFTRAG_KEY]:{version:4,id:'fictional-order',abTag:iso(ms).slice(0,10),limit:20000000,externGebunden:0}},day=iso(ms).slice(0,10);
 auth[K.KEY]={[day]:{version:K.VERSION,day,tarif:K.konfiguration({}).tarif,limit:K.LIMIT_MICRO_USD,spent:0,baseline:0,manualCalls:0,manualUntil:null,calls:{},frozen:null}};
 J.install(auth,old.command,sha(old.command),C.controlHash(auth));const original=clone(J.current(auth));next.command.predecessors=[{operationId:original.operationId,commandHash:original.commandHash,planHash:original.planHash,journalHash:sha(original)}];
 J.install(auth,next.command,sha(next.command),C.controlHash(auth));Object.assign(next.record,{commandHash:sha(next.command),planHash:next.command.slot.planHash,admittedAtUTC:next.command.slot.plan.startsAtUTC,expiresAtUTC:next.command.slot.plan.endsAtUTC,controlHash:C.controlHash(auth),booksHash:C.booksHash(auth)});
 return {old,next,auth,original};
}
async function startFixture(change){
 const f=scenario(),storagePath=require.resolve('../lib/helmut/storage'),oldCache=require.cache[storagePath],oldActive=K.aktiv,oldCommit=process.env.HELMUT_PRODUCTION_COMMIT;
 let auth=clone(f.auth),oldReads=0,claims=0,effects=0,claimed=null,missing=false,badPacket=null,drift=null;const realValidate=C.validate,realAdmission=C.admission;
 const config={f,setDRBoundary:()=>{
   // Transport-only already-admitted DR boundary, as in the existing 500-step
   // adapter fixture. This does not claim a full real DR schema/Native admission.
   const owners=P.erzeuge().profile.map(x=>x.mandatsId).sort(),command=f.next.command;
   command.mode='D-R-500';command.understanding=[];command.drafts=owners.map(id=>({profile:{id}}));command.units=owners.map(id=>({kind:'DR',subject:id,intentIds:[sha([id,'D']),sha([id,'R'])]}));
   const current=auth[J.KEY].operations[command.slot.plan.operationId];current.commandHash=sha(command);current.units=clone(command.units);
   C.admission=(c,...args)=>c===command?sha(command):realAdmission(c,...args);
   C.validate=c=>c===command?{commandHash:sha(command),plan:command.slot.plan}:realValidate(c);
 },setMissing:()=>{missing=true;},setBadPacket:x=>{badPacket=x;},setDrift:x=>{drift=x;},setAuth:x=>{auth=x;}};if(change)change(config);
 try{
  K.aktiv=()=>true;process.env.HELMUT_PRODUCTION_COMMIT=COMMIT;
  require.cache[storagePath]={id:storagePath,filename:storagePath,loaded:true,exports:{
   synthetik500ProductionBackend(){},
   loadSynthetik500ProductionCommand:async(op,h)=>{if(op===f.next.command.slot.plan.operationId){assert.equal(h,sha(f.next.command));return {command:f.next.command,admission:f.next.record};}oldReads++;if(missing)throw Error('fictional-prior-packet-missing');return {command:badPacket||f.old.command,admission:f.old.record};},
   readAuthStore:async()=>clone(auth),readSynthetik500CurrentInputs:async x=>{C.validateSources(x);},leseLlmTageszaehler:async()=>({ok:true,used:0}),
   mutateAuthStore:async fn=>{if(drift){drift(auth);drift=null;}const candidate=clone(auth),result=await fn(candidate);const prior=auth[J.KEY].operations[f.next.command.slot.plan.operationId],next=candidate[J.KEY].operations[f.next.command.slot.plan.operationId];
    if(next?.claimId!==null&&prior.claimId===null){claims++;claimed=clone(candidate);}
    if(next?.units[0]?.entered){effects++;throw Error('fixture stop before any unit execution');}auth=candidate;return result;},
   retainSynthetik500ProductionEvidence:async()=>{effects++;throw Error('fixture forbids evidence writes');}
  }};
  await assert.rejects(Adapter.productionStart({operationId:f.next.command.slot.plan.operationId,commandHash:sha(f.next.command)}));
  return {auth,oldReads,claims,effects,claimed,f};
 }finally{C.validate=realValidate;C.admission=realAdmission;K.aktiv=oldActive;if(oldCommit===undefined)delete process.env.HELMUT_PRODUCTION_COMMIT;else process.env.HELMUT_PRODUCTION_COMMIT=oldCommit;if(oldCache)require.cache[storagePath]=oldCache;else delete require.cache[storagePath];}
}
async function main(){
 await test('expired intact prior U passes real predicate and real productionStart claim',async()=>{const f=scenario();assert.equal(J.expiredUnclaimedPredecessor(f.original,f.old.command,f.next.command),true);const r=await startFixture();assert.equal(r.claims,1);assert.equal(r.oldReads,1);assert.deepEqual(r.claimed[J.KEY].operations[r.f.original.operationId],r.f.original);assert.equal(r.claimed[J.KEY].operations[r.f.next.command.slot.plan.operationId].state,'running');assert.equal(Object.keys(r.claimed[K.KEY][new Date().toISOString().slice(0,10)].calls).length,0);});
 for(const[name,change]of [['missing immutable prior packet',c=>c.setMissing()],['wrong immutable prior packet hash',c=>{const p=clone(c.f.old.command);p.understanding[0].reads.getExisting['fixture-only']={unexpected:true};c.setBadPacket(p);}],['prior journal changes during CAS',c=>c.setDrift(a=>{a[J.KEY].operations[c.f.original.operationId].stopRequested=true;})]])await test(name+' rejects before claim',async()=>{const r=await startFixture(change);assert.equal(r.claims,0);assert.equal(r.effects,0);});
 const unsafe=[['claimed',j=>{j.claimId='fake-prior-claim';}],['entered',j=>{j.units[0].entered=true;}],['running',j=>{j.state='running';}],['unknown',j=>{j.state='unknown';}],['stopped',j=>{j.state='stopped';}],['in flight',j=>{j.inFlight={index:0,intentIds:j.units[0].intentIds};}],['attempt',j=>{j.attempts[j.units[0].intentIds[0]]={status:'reserved'};}],['output',j=>{j.outputs[0]={resultHash:sha('fake')};}],['index',j=>{j.index=1;}],['subject',j=>{j.units[0].subject='changed';}],['intent',j=>{j.units[0].intentIds=['b'.repeat(64)];}],['hash',j=>{j.commandHash='b'.repeat(64);}],['plan hash',j=>{j.planHash='b'.repeat(64);}],['operation',j=>{j.operationId='synthetik500-fake-foreign';}],['extra key',j=>{j.extra=true;}],['extra unit',j=>{j.units.push(clone(j.units[0]));}]];
 for(const[name,change]of unsafe)await test('frozen '+name+' rejected',async()=>{const f=scenario(),j=clone(f.original);change(j);assert.equal(J.expiredUnclaimedPredecessor(j,f.old.command,f.next.command),false);});
 await test('original slot consumption and unexpired plan reject',async()=>{const f=scenario(),c=clone(f.old.command);c.slot.consumed.fake={};assert.equal(J.expiredUnclaimedPredecessor(f.original,c,f.next.command),false);const fresh=dated(fixture(),'synthetik500-fixture-old-unclaimed','nachlauf500-'+Date.now(),new Date(Date.now()-1000).toISOString(),new Date(Date.now()+60000).toISOString());const j=clone(f.original);j.commandHash=sha(fresh.command);j.planHash=fresh.command.slot.planHash;j.units=clone(fresh.command.units);assert.equal(J.expiredUnclaimedPredecessor(j,fresh.command,f.next.command),false);});
 await test('claim or entry drift in CAS cannot consume new operation',async()=>{for(const field of ['claim','enter']){const r=await startFixture(c=>c.setDrift(a=>{const j=a[J.KEY].operations[c.f.original.operationId];if(field==='claim')j.claimId='fake-claim';else j.units[0].entered=true;}));assert.equal(r.claims,0);assert.equal(r.effects,0);}});
 await test('malformed or invalid successor cannot bypass real command validation',()=>{const f=scenario();for(const args of [[],[null,f.old.command,f.next.command],[f.original,null,f.next.command],[f.original,f.old.command,null]])assert.equal(J.expiredUnclaimedPredecessor(...args),false);const invalid=clone(f.next.command);invalid.mode='D-R-500';assert.equal(J.expiredUnclaimedPredecessor(f.original,f.old.command,invalid),false);});
 await test('admitted DR transport boundary accepts historical frozen U only once before first entry',async()=>{const r=await startFixture(c=>c.setDRBoundary());assert.equal(r.claims,1);assert.deepEqual(r.claimed[J.KEY].operations[r.f.original.operationId],r.f.original);assert.equal(r.claimed[J.KEY].operations[r.f.next.command.slot.plan.operationId].units.length,500);assert.equal(r.effects,1);});
 await test('admitted DR transport still rejects prior entered and unknown state before claim',async()=>{for(const kind of ['entered','unknown']){const r=await startFixture(c=>{c.setDRBoundary();c.setDrift(a=>{const j=a[J.KEY].operations[c.f.original.operationId];if(kind==='entered')j.units[0].entered=true;else j.state='unknown';});});assert.equal(r.claims,0);assert.equal(r.effects,0);}});
 console.log(JSON.stringify({targetedChecks:passed,production:false,network:false,providerCalls:0,profilesActivated:false,DRTransportAdmissionIsMocked:true,actualFullDRSchemaOrNativeAdmissionProven:false}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
