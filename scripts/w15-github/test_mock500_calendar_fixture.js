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
const originalISO = '2026-10-28T12:00:00.000Z', executionISO = '2026-11-02T12:00:00.000Z';
const profile = {id: 'fictional-calendar-only', committees: ['Haushaltsausschuss']};
const kos = ['a', 'b'].map((id, index) => ({id: 'ko-' + id, vorgang_id: 'vg-' + id,
  headline: index ? 'Der Haushaltsausschuss vergleicht einen Investitionsplan.' : 'Der Haushaltsausschuss berät einen Haushaltsentwurf.',
  was_ist_passiert: index ? 'Ein Investitionsplan wird verglichen.' : 'Ein Haushaltsentwurf wird beraten.',
  understanding_status: 'complete', status: 'ready', updated_at: originalISO}));
const sourcesByVorgang = Object.fromEntries(kos.map(ko => [ko.vorgang_id, [{id: 'rd-' + ko.id,
  title: ko.headline, summary: ko.was_ist_passiert, source_name: 'Fiktive Vertragsquelle',
  url: 'https://example.invalid/calendar/' + ko.id, published_at: '2026-10-28T11:00:00.000Z'}]]));
const briefing = {available: true, items: kos.map(ko => ({vorgangId: ko.vorgang_id, title: ko.headline, summary: ko.was_ist_passiert}))};
const eingabe = A.baueEingabe({briefing, kos, sourcesByVorgang, profile, userId: profile.id, day: '2026-10-28'});
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
const originalEnvironment = snapshot();
let fixture;
try {
  Object.assign(process.env, {AZURE_OPENAI_ENDPOINT: new URL(EU.CONTRACT.responseURL).origin,
    AZURE_OPENAI_KEY: 'LOCAL_MOCK_NOT_A_VALID_PROVIDER_KEY', AZURE_OPENAI_DEPLOYMENT: EU.CONTRACT.model});
  fixture = Provider.prepare({index: 0, row: historical, model: EU.CONTRACT.model,
    candidate: {draftCandidate: {paragraphs}}, template: {response, binding: {responseJSONSHA256: sha(response)}}});
} finally { restore(originalEnvironment); }
assert.equal(ai.aiProviderName(), 'none');
const before = structuredClone(fixture), historicalHash = sha(historical);
const derived = Bindings.calendarRow(historical, executionISO).row;
const result = Bindings.calendarFixture(fixture, derived);
assert.deepEqual(snapshot(), originalEnvironment);
assert.equal(ai.aiProviderName(), 'none');
assert.deepEqual(result.draftOutput, fixture.draftOutput);
assert.deepEqual(result.reviewOutput, fixture.reviewOutput);
assert.equal(result.draftOutputSHA256, fixture.draftOutputSHA256);
assert.equal(result.reviewOutputSHA256, fixture.reviewOutputSHA256);
assert.notEqual(result.requestBodySHA256, fixture.requestBodySHA256);
assert.deepEqual(fixture, before);
assert.equal(sha(historical), historicalHash);
const invalid = structuredClone(fixture); invalid.reviewOutputSHA256 = '0'.repeat(64);
assert.throws(() => Bindings.calendarFixture(invalid, derived));
assert.deepEqual(snapshot(), originalEnvironment);
assert.equal(ai.aiProviderName(), 'none');
console.log('PASS real calendar/provider constructors preserve reviewed outputs and restore clean environment on success/failure');
