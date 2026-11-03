'use strict';
// One invented row through the real binding/context/provider constructors.
// No original file, database, provider installation or model call.
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const Bindings = require('./mock500_bindings');
const Provider = require('../fixtures/w15-full500-provider');
const A = require('../../lib/helmut/briefing-aussagenbindung');
const B = require('../../lib/helmut/briefing-lagebindung');
const L = require('../../lib/helmut/lage');
const ai = require('../../lib/helmut/ai');
const EU = require('../../lib/helmut/synthetik-500-eu-service-contract');
const sha = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
assert(require.cache[require.resolve('../lokaler-netzschutz')]);
for (const name of ['OPENAI_API_KEY', 'AZURE_OPENAI_KEY', 'AZURE_OPENAI_ENDPOINT'])
  assert(!process.env[name], 'This counterprobe requires the actual clean Materials provider environment');
const names = ['AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_KEY', 'AZURE_OPENAI_DEPLOYMENT'];
const snapshot = () => Object.fromEntries(names.map(name => [name, process.env[name]]));
const restore = values => names.forEach(name => values[name] === undefined ? delete process.env[name] : process.env[name] = values[name]);
const Replay = require('../../lib/helmut/synthetik-500-mock-source-replay');
const Source = require('./mock500_source_replay');
const P = require('../../lib/helmut/synthetik-500-profile');
const executionISO = new Date().toISOString(), originalISO = new Date(Date.now()-21*86400000).toISOString();
function invented(index) {
const profile = {id: 'fictional-replay-' + index, committees: ['Haushaltsausschuss']};
const kos = ['a', 'b'].map((id, index) => ({id: 'ko-' + id, vorgang_id: 'vg-' + id,
  headline: index ? 'Der Haushaltsausschuss vergleicht einen Investitionsplan.' : 'Der Haushaltsausschuss berät einen Haushaltsentwurf.',
  was_ist_passiert: index ? 'Ein Investitionsplan wird verglichen.' : 'Ein Haushaltsentwurf wird beraten.',
  understanding_status: 'complete', status: 'ready', updated_at: originalISO}));
const sourcesByVorgang = Object.fromEntries(kos.map(ko => [ko.vorgang_id, [{id: 'rd-' + ko.id,
  title: ko.headline, summary: ko.was_ist_passiert, source_name: 'Fiktive Vertragsquelle',
  url: 'https://example.invalid/calendar/' + ko.id, published_at: new Date(Date.parse(originalISO)-3600000).toISOString()}]]));
const briefing = {available: true, items: kos.map(ko => ({vorgangId: ko.vorgang_id, title: ko.headline, summary: ko.was_ist_passiert}))};
const eingabe = A.baueEingabe({briefing, kos, sourcesByVorgang, profile, userId: profile.id, day: require('../../lib/helmut/briefing-frische').berlinTagKey(new Date(originalISO))});
const urteil = {version: A.VERSION, eingabeHash: eingabe.eingabeHash, ursprungHash: eingabe.eingabeHash,
  ausgelasseneVorgaenge: [], aussagen: eingabe.aussagen.map(row => ({...row,
    sachlichGetragen: true, kontextGetragen: true, mandatsbezugGetragen: true,
    begruendung: 'Ausschließlich erfundene Daten für eine kleine technische Gegenprobe.',
    belege: [{vorgangId: row.vorgangId, documentId: sourcesByVorgang[row.vorgangId][0].id,
      feld: 'auszug', text: sourcesByVorgang[row.vorgangId][0].summary}]}))};
const input = {briefing, eingabe, korrekturBasis: {kos, sourcesByVorgang}};
urteil.gesamtpruefung = require('../fixtures/briefing-fachurteil')(input, urteil);
const historical = {profile, briefingDatum: originalISO, briefingEingabe: B.baue(input, urteil)};
const bound = B.pruefe(historical.briefingEingabe, profile, profile.id, new Date(originalISO), {acceptedSnapshot: true});
const {koLite} = L.prepareDContext(bound.ranked, bound.sources, new Date(originalISO), bound);
const paragraphs = koLite.map(ko => ({text: ko.quellenbelege[0].titel, vorgang_ids: [ko.vorgang_id],
  quelle_id: ko.quellenbelege[0].quelle_id,
  auswahlbegruendung: 'Der fiktive Vorgang betrifft die Haushaltskontrolle durch den Haushaltsausschuss.',
  mandatsbezug: {feld: 'ausschuss', wert: 'Haushaltsausschuss'}}));
const response = {pruefungen: paragraphs.map((p, absatz) => ({absatz, quelle_id: p.quelle_id, belegfeld: 'titel',
  pruefbegruendung: 'Der fiktive Titel trägt die jeweilige technische Testaussage.', vollstaendig_belegt: true,
  themenrein: true, profilbezug: true, textart: 'konkreter_sachverhalt',
  mandatsbegruendung: 'Der Haushaltsausschuss befasst sich mit Haushaltsentwurf und Investitionsplan.'})),
  vergleiche: [{erster_absatz: 0, zweiter_absatz: 1, eigenstaendige_sachverhalte: true,
    pruefbegruendung: 'Die erfundenen Vorgänge behandeln unterschiedliche Pläne.'}]};
return { historical, paragraphs, response };
}
const end = Date.parse(executionISO.slice(0,10)+'T22:30:00.000Z');
const starts = Math.min(Date.now()-1000,end-12600000);
const window = { startsAtUTC:new Date(starts).toISOString(),endsAtUTC:new Date(starts+10800000-1).toISOString(),
 completionDeadlineUTC:new Date(starts+12600000-1).toISOString() };
if(Date.now()>=Date.parse(window.endsAtUTC)){console.log('SKIP positive live-clock bindings after same-day processing window');process.exit(0);}
const samples=Array.from({length:500},(_,i)=>invented(i)), rows=samples.map(x=>Bindings.calendarRow(x.historical,executionISO).row);
const authorization={schema:Replay.AUTH_SCHEMA,contract:Replay.CONTRACT,
 branch:'refs/heads/codex/w15-github-end500-preparation-20261028',exactCommit:'a'.repeat(40),runId:'123456789',runAttempt:1,
 nonce:'12345678-1234-4123-8123-123456789abc',approvalSHA256:'b'.repeat(64),sourceQualificationSHA256:'c'.repeat(64),
 productionAllowed:false,paidModelsAllowed:false};
const record={schema:Replay.GRANT_SCHEMA,contract:Replay.CONTRACT,purpose:'PREPARATION',authorization,
 sourceAsOfISO:originalISO,executionISO,window,qualificationPins:{...Replay.PINS},operationId:null,commandHash:null,
 bindings:rows.map((row,index)=>{const b=B.pruefe(row.briefingEingabe,row.profile,row.profile.id,new Date(executionISO),{acceptedSnapshot:true});
 return {index,owner:row.profile.id,profileHash:P.hash(row.profile),briefingEingabeHash:P.hash(row.briefingEingabe),briefingDatum:executionISO,
 sourceProjectionSHA256:P.hash({ranked:b.ranked,sources:b.sources}),requestBodySHA256:null,reviewRequestBodySHA256:null};})};
const issuer=Replay.createIssuer(()=>record), scope={issuer,grant:issuer.issue(),record};
const previous=snapshot();let old;
try{
 Object.assign(process.env,{AZURE_OPENAI_ENDPOINT:new URL(EU.CONTRACT.responseURL).origin,
 AZURE_OPENAI_KEY:'LOCAL_MOCK_NOT_A_VALID_PROVIDER_KEY',AZURE_OPENAI_DEPLOYMENT:EU.CONTRACT.model});
 old=samples.map(({historical,paragraphs,response},index)=>Provider.prepare({index,row:historical,model:EU.CONTRACT.model,
 candidate:{draftCandidate:{paragraphs}},template:{response,binding:{responseJSONSHA256:sha(response)}}}));
}finally{restore(previous);}
assert.throws(()=>Bindings.calendarFixture(old[0],rows[0]),/empty-context/);
const fixtures=old.map((f,i)=>Bindings.calendarFixture(f,rows[i],scope));
assert.deepEqual(snapshot(),previous);
const requests=fixtures.map(f=>({owner:f.owner,requestBodySHA256:f.requestBodySHA256,contextSources:f.contextSources}));
assert.equal(Source.verifyActualBindings(fixtures,requests).profiles,500);
assert.throws(()=>Source.verifyActualBindings(fixtures.slice(0,499),requests));
const clone=structuredClone(fixtures);assert.throws(()=>Source.verifyActualBindings(clone,requests),/unverified-request-constructors/);
const last=fixtures[499].reviewRequestBodySHA256;fixtures[499].reviewRequestBodySHA256='0'.repeat(64);
assert.throws(()=>Source.verifyActualBindings(fixtures,requests),/prepared-binding-drift/);fixtures[499].reviewRequestBodySHA256=last;
const selector={operationId:'synthetik500-replay-binding-test',commandHash:'d'.repeat(64)};
const execution=Source.executionRecord(scope,fixtures,requests,selector);
assert.equal(execution.purpose,'EXECUTION');assert.equal(execution.bindings[499].reviewRequestBodySHA256,last);
assert.equal(execution.sourceAsOfISO,originalISO);assert.equal(execution.executionISO,executionISO);
for(let i=0;i<500;i++){
 assert.deepEqual(fixtures[i].draftOutput,old[i].draftOutput);assert.deepEqual(fixtures[i].reviewOutput,old[i].reviewOutput);
 assert.equal(fixtures[i].draftOutputSHA256,old[i].draftOutputSHA256);assert.equal(fixtures[i].reviewOutputSHA256,old[i].reviewOutputSHA256);
}
issuer.revoke(scope.grant);
assert.throws(()=>Source.tokenForRow(scope,rows[0]),/grant/);
const code=require('node:fs').readFileSync(require.resolve('../synthetik-500-w15-full500-materials'),'utf8');
assert(code.indexOf('SourceReplay.verifyActualBindings')<code.indexOf('sql(prepareSQL); sql(activateSQL)'));
console.log('PASS all500 genuine D/provider/review constructors before activation; unchanged outputs; final-index drift/forged fixtures denied');
