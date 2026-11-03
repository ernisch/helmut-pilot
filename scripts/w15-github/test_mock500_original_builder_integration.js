'use strict';
// Manual, offline integration of the pinned private Original program with 500
// invented inputs. Never loads qualified private inputs, SQL, units or models.
// The private ZIP is supplied explicitly; it is never copied into Git or CI.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const B=require('./mock500_bindings'),P=require('../../lib/helmut/synthetik-500-profile');
const Cal=require('../../lib/helmut/synthetik-500-mock-calendar'),Replay=require('../../lib/helmut/synthetik-500-mock-source-replay');
const Source=require('./mock500_source_replay'),EU=require('../../lib/helmut/synthetik-500-eu-service-contract');
const A=require('../../lib/helmut/briefing-aussagenbindung'),L=require('../../lib/helmut/briefing-lagebindung');
const Lage=require('../../lib/helmut/lage'),K=require('../../lib/helmut/synthetik-500-kosten-plan');
const KO=require('../../lib/helmut/knowledge-object-version'),W=require('../../lib/helmut/synthetik-500-w-inventar');
const C=require('../../lib/helmut/synthetik-500-production-command');
const sha=raw=>crypto.createHash('sha256').update(raw).digest('hex');
assert(require.cache[require.resolve('../lokaler-netzschutz')]);
assert.equal(process.argv.length,3,'Explicit existing pinned private builder ZIP required; no fallback builder');
const archivePath=path.resolve(process.argv[2]),archive=fs.readFileSync(archivePath);
assert.equal(archive.length,269598);assert.equal(sha(archive),'c979e18775f285ddf7af4328c8efc8f0642954eb6d0e52e50636d3b4ab902d15');
const archivePin={path:archivePath,bytes:archive.length,sha256:sha(archive)};
let network=0;const deny=()=>{network++;throw Error('ORIGINAL_BUILDER_TEST_NETWORK_FORBIDDEN');};
global.fetch=require('node:https').request=require('node:http').request=deny;
const now=Date.now(),executionISO=new Date(now).toISOString(),day=executionISO.slice(0,10);
assert(Cal.FIRST_DAY<=day&&day<=Cal.LAST_DAY,'Existing authorised simulation calendar required');
const r=require('../synthetik-500-mock-calendar-test').record(day);
const outerStart=Math.min(now-60000,Date.parse(day+'T22:59:59.999Z')-12600000);
r.selector=null;r.window={startsAtUTC:new Date(outerStart).toISOString(),endsAtUTC:new Date(outerStart+10800000-1).toISOString(),completionDeadlineUTC:new Date(outerStart+12600000-1).toISOString()};
Cal.validateRecord(r); // Enforces both actual calendar days, never changes Date.
const fixture=require('../fixtures/synthetik500-direct')();
const snapshot=structuredClone(fixture.executorInputs.snapshot);snapshot.beobachtetAm=executionISO;
const historicalISO='2026-10-28T12:00:00.000Z',published='2026-10-16T10:00:00.000Z';
const documents=Array.from({length:6},(_,i)=>({id:'fictional-original-builder-doc-'+i,scope:['BT','BE','BB'][i%3],version:{
 ...Object.fromEntries(W.SOURCE_VERSION_FIELDS.map(k=>[k,null])),id:'fictional-original-builder-doc-'+i,
 title:'Fiktive Haushaltsberatung '+i,summary:'Der fiktive Ausschuss prüft den Haushaltsplan '+i+'.',source_name:'Erfundene Offline-Vertragsquelle',
 url:'https://example.invalid/builder/'+i,canonical_url:'https://example.invalid/builder/'+i,published_at:published}}));
const kos=documents.map((doc,i)=>({...Object.fromEntries(KO.VERSION_FIELDS.map(k=>[k,null])),id:'fictional-builder-ko-'+i,vorgang_id:'fictional-builder-vg-'+i,ko_version:1,
 headline:doc.version.title,was_ist_passiert:doc.version.summary,understanding_status:'complete',status:'ready',updated_at:historicalISO}));
const sourcesByVorgang=Object.fromEntries(kos.map((ko,i)=>[ko.vorgang_id,[documents[i].version]]));
const briefing={available:true,items:kos.map(ko=>({vorgangId:ko.vorgang_id,title:ko.headline,summary:ko.was_ist_passiert}))};
const rows=fixture.drafts.map(d=>{
 const profile=d.profile,eingabe=A.baueEingabe({briefing,kos,sourcesByVorgang,profile,userId:profile.id,day:'2026-10-28'});
 const urteil={version:A.VERSION,eingabeHash:eingabe.eingabeHash,ursprungHash:eingabe.eingabeHash,ausgelasseneVorgaenge:[],
  aussagen:eingabe.aussagen.map(a=>({...a,sachlichGetragen:true,kontextGetragen:true,mandatsbezugGetragen:true,
   begruendung:'Erfundenes technisches Vertragsurteil; keine Originalqualifikation.',belege:[{vorgangId:a.vorgangId,documentId:sourcesByVorgang[a.vorgangId][0].id,feld:'auszug',text:sourcesByVorgang[a.vorgangId][0].summary}]}))};
 const input={briefing,eingabe,korrekturBasis:{kos,sourcesByVorgang}};urteil.gesamtpruefung=require('../fixtures/briefing-fachurteil')(input,urteil);
 return B.calendarRow({profile,briefingDatum:historicalISO,briefingEingabe:L.baue(input,urteil),sources:{documents:documents.map(d=>d.version),knowledgeObjects:kos}},executionISO).row;
});
const authorization=r.sourceAuthorization;
const record={schema:Replay.GRANT_SCHEMA,contract:Replay.CONTRACT,purpose:'PREPARATION',authorization,sourceAsOfISO:historicalISO,executionISO,
 window:r.window,qualificationPins:{...Replay.PINS},operationId:null,commandHash:null,bindings:rows.map((row,index)=>{const b=L.pruefe(row.briefingEingabe,row.profile,row.profile.id,new Date(executionISO),{acceptedSnapshot:true});return {index,owner:row.profile.id,profileHash:P.hash(row.profile),briefingEingabeHash:P.hash(row.briefingEingabe),briefingDatum:executionISO,sourceProjectionSHA256:P.hash({ranked:b.ranked,sources:b.sources}),requestBodySHA256:null,reviewRequestBodySHA256:null};})};
const issuer=Replay.createIssuer(()=>record),scope={issuer,grant:issuer.issue(),record};
const original={window:r.window,simulationCalendarAuthorization:r.authorization,calendar:{utcDay:day,berlinDay:require('../../lib/helmut/briefing-frische').berlinTagKey(new Date(executionISO)),sourceDatesRewritten:false,signaturesReused:false},assets:{originalBuilderArchive:archivePin}};
const builder=B.originalBuilder(original,path.resolve(__dirname,'../..'),scope);
const window={startsAtUTC:executionISO,endsAtUTC:r.window.endsAtUTC};
const config={selector:{operationId:'synthetik500-real-builder-offline-'+now},runId:'nachlauf500-'+now,constructedAtUTC:new Date(now-1).toISOString(),window};
const costs={tag:day,beobachtetAm:executionISO,tageslimitMikroUsd:EU.DAY_MICRO_USD,auftragslimitMikroUsd:EU.ORDER_MICRO_USD,
 tagVerbrauchtMikroUsd:0,tagReserviertMikroUsd:EU.PRIVATE_MICRO_USD,auftragVerbrauchtMikroUsd:EU.OPENING_MICRO_USD,auftragReserviertMikroUsd:0,
 restreserveMikroUsd:EU.RUN_MAX_MICRO_USD,laufreserveMikroUsd:EU.RUN_MAX_MICRO_USD};
const manifest=require('../../lib/helmut/synthetik-500-vertrag').vorbereiten({paketBytes:P.serialisiere(fixture.package),snapshot,operationId:config.selector.operationId,
 vorflugAm:executionISO,startBis:new Date(now+180000).toISOString(),endeAm:window.endsAtUTC,kosten:costs,serviceContractHash:EU.HASH});
const runtimeManifest={...fixture.executorInputs.runtimeManifest,profilvertrag:manifest,profilManifestHash:P.hash(manifest),startbelegeGrundlinie:{
 ...fixture.executorInputs.runtimeManifest.startbelegeGrundlinie,snapshotHash:P.hash(snapshot),productionCommit:r.authorization.exactCommit,deploymentId:Cal.DEPLOYMENT}};
const route={version:EU.ROUTE_VERSION,serviceContractHash:EU.HASH,orderRenewalHash:EU.MOCK_CALENDAR_HASH,mockSimulationCalendar:{...Cal.LABEL},runtimeManifestHash:P.hash(runtimeManifest),
 route:{provider:'azure',responsesUrl:EU.CONTRACT.responseURL,model:EU.CONTRACT.model,productionCommit:r.authorization.exactCommit,deploymentId:Cal.DEPLOYMENT,deploymentHost:Cal.HOST,authMode:'api-key'},
 management:{modelFamily:'gpt-5-mini',versionPolicy:'historical-october-simulation-only',contextTokens:400000,maxInputTokens:EU.INPUT_TOKENS,inputReserveTokens:EU.INPUT_TOKENS,
 maxOutputTokens:128000,reasoningIncludedInOutput:true,inputUsdPerMillion:0.275,outputUsdPerMillion:2.2,validFromUTC:r.window.startsAtUTC,validUntilUTC:r.window.endsAtUTC,
 modelVersion:EU.CONTRACT.modelVersion,sku:EU.CONTRACT.sku,region:EU.CONTRACT.region,versionUpgradeOption:'NoAutoUpgrade',
 evidencePins:Object.fromEntries(['rootAdmission','management','serviceContext','price'].map(k=>[k,{name:'fictional-'+k,bytes:1,sha256:P.hash(k)}]))}};
const native={documents,knowledgeObjects:kos.map(version=>({vorgangId:version.vorgang_id,koVersion:1,version})),clusters:[],curatedLocalFixture:true,nativeUnderstandingAcceptance:false,
 curatedWitnessReference:{reference:'fictional-offline-only',sha256:P.hash('fictional-manual-coverage')},routeId:'fictional-eu-route',costInputs:{...require('../synthetik-500-kosten-plan-test').emptyInputs(),paidRoutes:[]}};
const sources=K.sourceVersions(native.documents,native.knowledgeObjects,null,K.ROUTE_INPUT_VERSION,route,null);
native.clusters=kos.map((ko,i)=>{const documentKeys=[sources.documents.find(d=>d.id===documents[i].id).key];return{vorgangId:ko.vorgang_id,mode:'erst',koVersion:null,documentKeys,requiresUnderstanding:false,artikelkontextVersuch:null,
 coverage:{knowledgeObjectKey:sources.knowledgeObjects.find(k=>k.vorgangId===ko.vorgang_id).key,documentKeys,contractInputHash:require('../../lib/helmut/verstehen-vertrag').eingabeHash({vorgangId:ko.vorgang_id,modus:'erst',koVersion:null,dokumente:[{id:documents[i].id}]}),evidence:native.curatedWitnessReference}};});
native.costInputs.paidRoutes=[{id:native.routeId,provider:'azure-openai',api:'responses',deploymentId:'fictional-eu-deployment',model:EU.CONTRACT.model,disposition:'aufgenommen',admittedRequestIds:[],priceContract:EU.RATE_ID,exclusionEvidence:null}];
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'w15-real-builder-'));fs.chmodSync(temp,0o700);
const priorBytes=Buffer.from('FICTIONAL PREDECESSOR PIN ONLY'),priorPath=path.join(temp,'prior');fs.writeFileSync(priorPath,priorBytes,{mode:0o600});
const prior={predecessor:{operationId:'synthetik500-fictional-prior',commandHash:P.hash('prior-command'),planHash:P.hash('prior-plan'),journalHash:P.hash('prior-journal')},
 originalPacketPin:{path:priorPath,bytes:priorBytes.length,sha256:sha(priorBytes)},originalJournalHash:P.hash('prior-journal')};
const args={approval:{status:'ACCEPTED_ALL500_ORDINARY_V1_AND_ACTUAL_NATIVE_BINDING',actualNativeInputEquality:true,positiveBoundOrdinaryVerdicts:500},
 config,paket:fixture.package,rows,native,runtime:{runtimeManifest,snapshot,productionCommit:r.authorization.exactCommit,briefingFensterStart:day+'T00:00:00.000Z'},routeContract:route,prior,
 prepareDraft:row=>builder.prepareDraft(row,route,native.routeId)};
const grant=Cal.createIssuer(()=>r),calendarGrant=grant.issue();
process.env.HELMUT_UNDERSTANDING_MODEL=EU.CONTRACT.model;
let result,builtCommand;
(async()=>{try{
 // BEFORE: actual pinned Original rejects the old outer-start handoff, before
 // looking at any row. Neither its source nor its time guard is patched.
 assert.throws(()=>builder.build({...args,config:{...config,window:{...window,startsAtUTC:r.window.startsAtUTC}}}),e=>e.name==='AssertionError'&&/mock500-current-date-contracts:24:/.test(e.stack));
 Cal.run(calendarGrant,()=>{
  assert.deepEqual(B.commandWindow(original,executionISO),window);
  const unbound={...original};delete unbound.simulationCalendarAuthorization;
  assert.equal(B.commandWindow(unbound,executionISO).startsAtUTC,r.window.startsAtUTC);
  assert.throws(()=>B.commandWindow({...original,simulationCalendarAuthorization:{...r.authorization,nonce:'0'.repeat(36)}},executionISO));
  args.config.window=B.commandWindow(original,executionISO);
  assert.throws(()=>Cal.requirePlan({productionCommit:r.authorization.exactCommit,routeContract:route,startsAtUTC:new Date(Date.parse(r.window.startsAtUTC)-1).toISOString(),endsAtUTC:window.endsAtUTC}));
  const built=builder.build(args);builtCommand=built.command;const checked=C.validate(built.command);
  assert.equal(checked.commandHash,built.commandHash);assert.equal(built.command.drafts.length,500);assert.equal(built.command.units.length,500);assert.equal(built.command.slot.plan.intents.length,1000);
  assert.equal(built.command.executor.erwartetePositionen.length,1500);assert.equal(built.claims.executionAuthorized,false);
  assert.deepEqual(built.command.drafts.map(d=>d.profile.id),rows.map(d=>d.profile.id));
  const bad=structuredClone(built.command);bad.drafts[499].descriptor.owner='FICTIONAL_WRONG_LAST_OWNER';assert.throws(()=>C.validate(bad));
  const badEnd=structuredClone(built.command.slot.plan);badEnd.endsAtUTC=new Date(Date.parse(window.endsAtUTC)+1).toISOString();assert.throws(()=>Cal.requirePlan(badEnd));
  result={status:'PASS_PINNED_ORIGINAL_BUILDER_AND_REAL_COMMAND_VALIDATOR_SYNTHETIC_ONLY',archiveSHA256:archivePin.sha256,sourcePins:builder.sourcePins,
   profiles:500,preparedRequests:built.preparedRequests.length,commandUnits:500,intents:1000,expectedResultPositions:1500,originalInputsQualified:false,profileActivations:0,modelCalls:0,networkCalls:network,
   commandWindowStartAtActualPreflight:true,outerDeadlineUnchanged:true,executionAuthority:false,mock500Acceptance:false,productionAcceptance:false};
 });
 assert.throws(()=>B.commandWindow(original,executionISO),/authority-required/);
 const execRecord={...r,selector:{operationId:config.selector.operationId,commandHash:P.hash(builtCommand)}};
 const execIssuer=Cal.createIssuer(()=>execRecord),execGrant=execIssuer.issue();
 try{
  const checked=Cal.run(execGrant,()=>C.validate(builtCommand));
  assert.equal(checked.commandHash,execRecord.selector.commandHash);result.selectorBoundValidatorPassed=true;
 }finally{execIssuer.revoke(execGrant);}
 assert.equal(network,0);console.log(JSON.stringify(result));
}finally{issuer.revoke(scope.grant);grant.revoke(calendarGrant);fs.rmSync(temp,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
