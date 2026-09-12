'use strict';
// Reiner Vertragsnachweis: widersprüchliche Sortierung, Tageswechsel und fehlende
// Belege. Synthetische Daten, kein Production Profil und keine externen Aufrufe.
process.env.HELMUT_SCORING_MODE = 'off';
const assert = require('node:assert/strict');
const C = require('../lib/helmut/briefingContract');
const A = require('../lib/helmut/briefing-aussagenbindung');
const now = new Date('2026-09-12T13:12:47Z');
const profile = { id: 'test-schwerpunkt', committees: ['Haushaltsausschuss'] };
let checks = 0;
function eq(actual, expected) { assert.deepEqual(actual, expected); checks++; }
function make(id, timestamp, score = 42, extra = {}) {
  const vg = 'vg-' + id;
  return {
    ko: { id: 'ko-' + id, vorgang_id: vg, understanding_status: 'complete', status: 'neu',
      display_title: 'Meldung ' + id, was_ist_passiert: 'Gespeicherter Sachverhalt ' + id,
      why_relevant: 'Haushaltsbezug ' + id, recommendation: 'Prüfpunkt ' + id,
      created_at: timestamp, updated_at: timestamp, ...extra },
    decision: { knowledge_object_id: 'ko-' + id, vorgang_id: vg, score,
      decision: score >= 60 ? 'Sofort reagieren' : score >= 40 ? 'Beobachten' : 'Ignorieren',
      priority_type: 'watch', matched_features: [{ type: 'ausschuss', value: 'Haushaltsausschuss' }] },
    docs: [{ id: 'rd-' + id, title: 'Quelle ' + id, url: 'https://example.org/meldung/' + id,
      source_name: 'Synthetische Quelle', published_at: timestamp, summary: 'Gespeicherter Sachverhalt ' + id }]
  };
}
function build(rows, options = {}) {
  const input = { profile, now, decisions: rows.map(r => r.decision),
    kosById: Object.fromEntries(rows.map(r => [r.ko.id, r.ko])),
    sourcesByVorgang: Object.fromEntries(rows.map(r => [r.ko.vorgang_id, r.docs])), ...options };
  const before = JSON.stringify(input);
  const direct = C.buildCurrentHelmutState(input);
  const result = C.toBriefingContractV3(input);
  eq(JSON.stringify(input), before); // keine Mutation der Quellen, Gewichte oder Profile
  eq(result.currentHelmutState, direct); // vorhandene Hauptauswahl bleibt maßgeblich
  return result;
}
function aligned(b, vg) {
  eq(b.currentHelmutState.primaryVorgangId, vg);
  eq(b.items[0].vorgangId, vg);
  eq(b.themeOfDay.vorgangId, vg);
  eq(b.helmutAssessment.recommendation, b.themeOfDay.recommendedAction);
  eq(b.helmutAssessment.whyImportant, b.themeOfDay.whyItMatters);
  eq(b.helmutAssessment.recommendation, b.currentHelmutState.recommendation);
  eq(b.homeSections.topTasks[0].id, b.items[0].id);
  eq(b.personalizedRecommendations[0].recommended_action, b.items[0].recommendedAction);
}
// B055 Fehlerklasse: gleiche Punkte, alphabetisch ältere Karte zuerst,
// aber bestehender Helmut Hauptvorgang aus neuerem Datensatz.
const older = make('a-alt', '2026-09-09T10:00:00Z');
const recent = make('z-neuer', '2026-09-11T10:00:00Z');
let b = build([older, recent]);
aligned(b, 'vg-z-neuer');
eq(b.status, 'Veraltet');
eq(b.currentHelmutState.datenstandTag, '2026-09-11');
eq(b.items.map(i => i.finalScore), [42, 42]);
// Kein Quellenbonus oder Scoreboost: heutiger relevanter Vorgang wird durch
// die bestehende Frischeauswahl vor den älteren hoch bewerteten gesetzt.
const high = make('a-hoch', '2026-09-11T08:00:00Z', 90);
const fresh = make('z-heute', '2026-09-12T08:00:00Z', 42);
b = build([high, fresh]); aligned(b, 'vg-z-heute');
eq(b.status, 'Aktuell');
eq(b.items.map(i => i.finalScore), [42, 90]);
eq(b.currentHelmutState.relatedVorgangIds.includes('vg-a-hoch'), true);
const input = A.baueEingabe({ briefing: b, profile, userId: profile.id, day: '2026-09-12',
  kos: [high.ko, fresh.ko], sourcesByVorgang: { [high.ko.vorgang_id]: high.docs, [fresh.ko.vorgang_id]: fresh.docs } });
eq(input.aussagen.find(a => a.pfad === '/helmutAssessment/recommendation').vorgangId, 'vg-z-heute');
eq(input.aussagen.find(a => a.pfad === '/themeOfDay/title').vorgangId, 'vg-z-heute');
// Ein heutiger irrelevanter Vorgang verdrängt den bisherigen Hauptvorgang nicht.
const ignored = make('z-ignoriert', '2026-09-12T08:00:00Z', 20);
b = build([high, ignored]); aligned(b, 'vg-a-hoch'); eq(b.status, 'Veraltet');
// Ohne öffnende Quelle keine hervorgehobene Empfehlung aus ungeprüften Karten.
const noSource = make('ohne-quelle', '2026-09-12T08:00:00Z'); noSource.docs = [];
b = build([noSource]); eq(b.themeOfDay, null); eq(b.helmutAssessment.recommendation, '');
eq(b.status, 'Keine aktuellen Vorgänge');
eq(b.helmutAssessment.assessment, 'Kein belegter Hauptvorgang verfügbar.');
// Ein datierter quellengestützter Kandidat verdrängt die höhere Karte ohne URL.
b = build([noSource, fresh]); aligned(b, 'vg-z-heute');
// Erzeugungszeit ist kein Ersatz für einen unbekannten Datenstand.
const undated = make('ohne-datum', null);
b = build([undated]); eq(b.status, 'Datenstand unbekannt');
eq(b.currentHelmutState.status, 'stale'); eq(b.currentHelmutState.datenstandTag, null);
eq(b.generatedAt, now.toISOString());
// Ungültige Datumswerte werden ebenfalls nicht positiv ausgegeben.
const invalid = make('kaputtes-datum', 'kein-datum');
b = build([invalid]); eq(b.status, 'Datenstand unbekannt'); eq(b.currentHelmutState.status, 'stale');
// Bereits vorhandenes Briefingfenster bleibt wirksam: Vorabend seit letztem
// Briefing darf frisch sein und behält sein tatsächliches Datum.
const evening = make('vorabend', '2026-09-11T20:00:00Z');
b = build([evening], { frischeFenster: { start: '2026-09-11T05:00:00Z' } });
eq(b.status, 'Aktuell'); eq(b.currentHelmutState.datenstandTag, '2026-09-11');
eq(b.currentHelmutState.datenstandVonHeute, false);
// Leer und Fehler sind keine grünen Zustände.
b = build([]); eq(b.status, 'Keine aktuellen Vorgänge'); eq(b.themeOfDay, null);
eq(b.helmutAssessment.recommendation, '');
b = build([make('fehlgeschlagen', '2026-09-12T08:00:00Z', 42, { understanding_status: 'failed' })]);
eq(b.status, 'Stand nicht verfügbar');
console.log(`${checks}/${checks} Prüfungen bestanden: gemeinsamer Schwerpunkt und belegter Datenstatus.`);
