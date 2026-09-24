"use strict";
const assert = require("node:assert/strict");
const B = require("../lib/helmut/briefing-bereichsvertrag");
const R = require("../lib/helmut/radarState");
const C = require("../lib/helmut/briefingContract");
const L = require("../lib/helmut/lage");
const F = require("../lib/helmut/briefing-fachurteil");
const now = new Date("2026-09-24T10:00:00Z");
const profile = { id: "abgrenzung-synthetisch", fullName: "Alex Beispiel", party: "Testpartei", committees: [], topics: ["Verkehr"] };
const doc = (id, day, extra = {}) => ({ id, url: `https://example.org/bericht/${id}`, title: "Alex Beispiel spricht über Verkehr",
  summary: "Alex Beispiel spricht über den Vorschlag zum Verkehr.", published_at: `${day}T08:00:00Z`, source_type: "media", ...extra });
const ko = (id = "a") => ({ id: `ko-${id}`, vorgang_id: `vg-${id}`, status: "neu", understanding_status: "complete",
  display_title: "Vorschlag zum Verkehr", display_summary: "Ein neuer Vorschlag zum Verkehr liegt vor.",
  was_ist_passiert: "Ein neuer Vorschlag zum Verkehr liegt vor.", why_relevant: "Der Vorschlag betrifft den Verkehr im Wahlkreis.",
  warum_wichtig: "Für den Wahlkreis relevant.", recommendation: "Die Auswirkungen für den Wahlkreis prüfen.",
  handlungsempfehlung: "Die Auswirkungen für den Wahlkreis prüfen.", mentioned_people: [profile.fullName],
  created_at: "2026-09-20T08:00:00Z", updated_at: now.toISOString(), source_document_count: 200, confidence_score: 90 });
const decision = k => ({ knowledge_object_id: k.id, vorgang_id: k.vorgang_id, score: 70, decision: "Sofort reagieren", matched_features: [] });
const input = (ks, sources) => ({ profile, now, decisions: ks.map(decision), kosById: Object.fromEntries(ks.map(k => [k.id, k])),
  knowledgeObjects: ks, sourcesByVorgang: sources });
let count = 0;
const test = (name, fn) => { fn(); count++; console.log(`PASS ${name}`); };
test("Lage behält Sachstand; Briefing kopiert auch umformulierte Einordnung nicht", () => {
  const k = ko(), ds = [doc("a", "2026-09-24")];
  const card = L.koToVorgangCard(k, ds, now);
  const b = C.toBriefingContractV3(input([k], { "vg-a": ds }));
  assert.equal(card.displaySummary, k.display_summary);
  assert.equal(b.currentHelmutState.primaryVorgangId, "vg-a");
  assert.equal(b.currentHelmutState.recommendation, k.recommendation);
  assert.notEqual(b.currentHelmutState.whyItMatters, k.why_relevant);
  assert.match(b.currentHelmutState.whyItMatters, /heutigen Arbeitstag/);
  assert.deepEqual(b.currentHelmutState.tagesAnlass.documentIds, ["a"]);
});
test("Reprocessing und hoher Score machen alte Quellen nicht zur Tagespriorität", () => {
  const b = C.toBriefingContractV3(input([ko()], { "vg-a": [doc("alt", "2026-09-01")] }));
  assert.equal(b.currentHelmutState.status, "empty");
  assert.equal(b.currentHelmutState.primaryVorgangId, null);
});
test("Vorabend ist im heutigen Standardfenster zulässig", () => {
  assert.ok(B.tagesAnlass([doc("abend", "2026-09-23", { published_at: "2026-09-23T20:00:00Z" })], now));
});
test("Undatierte und zukünftige Quellen sind kein Tagesbeleg", () => {
  assert.equal(B.tagesAnlass([doc("zukunft", "2026-09-25"), doc("ohne", "2026-09-24", { published_at: null })], now), null);
});
test("Identischer Vorgang und identischer Artikel erscheinen im Briefing nur einmal", () => {
  const a = ko(), b = ko("b"), c = { ...ko("c"), vorgang_id: "vg-a" };
  const ds = [doc("geteilt", "2026-09-24")];
  const state = C.toBriefingContractV3(input([a,b,c], { "vg-a": ds, "vg-b": ds })).currentHelmutState;
  assert.equal(state.items.length, 0);
});
test("Radar braucht zeitlichen Beleg; bloße Zähler und Umfelddimensionen reichen nicht", () => {
  const k = { ...ko(), mentioned_people: [] };
  const r = R.buildCurrentRadarState(input([k], { "vg-a": [doc("a", "2026-09-24")] }));
  assert.equal(r.anzeige.status, "empty");
  assert.equal(r.anzeige.articles.length, 0);
});
test("Persönliche Resonanz berührt denselben Vorgang mit anderer Funktion", () => {
  const k = ko(), args = input([k], { "vg-a": [doc("a", "2026-09-24")] });
  const before = JSON.stringify(args);
  const r = R.buildCurrentRadarState(args);
  assert.equal(r.anzeige.mentions.length, 1);
  assert.match(r.anzeige.mentions[0].evidence, /persönlicher Erwähnung/);
  assert.equal(r.anzeige.mentions[0].summary, "");
  assert.ok(!JSON.stringify(r.anzeige).includes(k.display_summary));
  assert.ok(!JSON.stringify(r.anzeige).includes(k.why_relevant));
  assert.equal(JSON.stringify(args), before);
});
test("Verschiedene Tage und Artikel tragen begrenzte Beobachtung, keine Prognose", () => {
  const s = B.beobachtung([doc("alt", "2026-09-22"), doc("neu", "2026-09-24")], now);
  assert.equal(s.sourceCount, 2);
  assert.match(s.text, /1 weitere Artikel zu 1 zuvor/);
  assert.match(s.text, /noch kein politischer Trend/);
});
test("Zeitgleiche Bestandsquellen sind keine neue Dynamik", () => {
  assert.equal(B.beobachtung([doc("a", "2026-09-24"), doc("b", "2026-09-24")], now), null);
});
test("URL Varianten und gleiche Dokumentkennungen erzeugen kein Wachstum", () => {
  const a = doc("a", "2026-09-22");
  assert.equal(B.beobachtung([a, doc("b", "2026-09-24", { url: a.url + "?utm_source=test" })], now), null);
  assert.equal(B.beobachtung([a, doc("a", "2026-09-24", { url: "https://example.org/anderer-slug" })], now), null);
});
test("Alte oder zukünftige Resonanz bleibt aus dem Radar", () => {
  assert.equal(B.beobachtung([doc("a", "2026-09-01"), doc("b", "2026-09-02")], now), null);
  assert.equal(B.beobachtung([doc("a", "2026-09-24"), doc("b", "2026-09-25")], now), null);
  const r = R.buildCurrentRadarState(input([ko()], { "vg-a": [doc("a", "2026-09-01")] }));
  assert.equal(r.anzeige.mentions.length, 0);
});
test("Fremde Mandate erhalten kein persönliches Signal", () => {
  const args = input([ko()], { "vg-a": [doc("a", "2026-09-24")] });
  args.profile = { id: "anderes-mandat", fullName: "Robin Muster" };
  assert.equal(R.buildCurrentRadarState(args).anzeige.mentions.length, 0);
});
test("Semantische Bereichstrennung ist verpflichtendes Fachkriterium", () => {
  assert.ok(F.KRITERIEN.includes("bereichstrennung"));
});
test("Widersprüchliche Datumsvarianten sperren unabhängig von der Reihenfolge", () => {
  const a = doc("a", "2026-09-22"), b = doc("b", "2026-09-24", { url: a.url + "?utm_source=x" });
  for (const ds of [[a,b], [b,a], [b,{ ...a, published_at:null }]]) {
    assert.equal(B.tagesAnlass(ds, now), null);
    assert.equal(B.beobachtung(ds, now), null);
  }
});
test("Zukünftige Frist ist Radar; heutige Frist trägt Briefing auch mit älterer Quelle", () => {
  const k = { ...ko(), deadline:"2026-09-25" };
  const ds = [doc("frist", "2026-09-20", { summary:"Die Einreichungsfrist endet am 25.09.2026." })];
  assert.equal(B.tagesAnlass(ds, now, null, k), null);
  const r = R.buildCurrentRadarState(input([k], { "vg-a":ds }));
  assert.equal(r.anzeige.mentions[0].beobachtungsBeleg.art, "kommende-frist");
  k.deadline = "2026-09-24"; ds[0].summary = "Die Einreichungsfrist endet am 24.09.2026.";
  const b = C.toBriefingContractV3(input([k], { "vg-a":ds }));
  assert.equal(b.currentHelmutState.tagesAnlass.art, "heutige-frist");
});
test("Erfundene, abgesagte und bloße Datumsangaben sind kein Fristbeleg", () => {
  const k = { ...ko(), deadline:"2026-09-24" };
  for (const summary of ["Am 24.09.2026 wurde ein Bericht veröffentlicht.",
    "Die Frist am 24.09.2026 wurde aufgehoben.", "Die Frist endet nicht am 24.09.2026.",
    "Heute findet eine Beratung statt.", "Die Frist endet am 25.09.2026."]) {
    assert.equal(B.tagesAnlass([doc("frist", "2026-09-20", { summary })], now, null, k), null, summary);
  }
});
test("Verschieden formulierte Lage-Einordnungen werden nie zum Briefinggrund oder Radartext", () => {
  for (const why of ["Kommunen müssen mehr Geld für den Verkehr aufbringen.",
    "Für Städte erhöhen sich die Ausgaben im Verkehrsbereich."]) {
    const k = { ...ko(), why_relevant:why, warum_wichtig:why };
    const b = C.toBriefingContractV3(input([k], { "vg-a":[doc("neu", "2026-09-24")] }));
    assert.ok(!b.currentHelmutState.whyItMatters.includes(why));
    assert.ok(!JSON.stringify(b.currentRadarState.anzeige).includes(why));
  }
});
test("Rollenhinweise brauchen gebundene Ausgabeurteile, Handlung bleibt Quellen-Fachaussage", () => {
  const Q = require("../lib/helmut/briefing-aussagenbindung");
  const k = ko(), ds = [doc("a", "2026-09-24")], args = input([k], { "vg-a":ds });
  const briefing = C.toBriefingContractV3(args);
  const e = Q.baueEingabe({ briefing, sourcesByVorgang:args.sourcesByVorgang, profile,
    userId:profile.id, day:"2026-09-24", kos:[k] });
  assert.equal(e.aussagen.find(a => a.pfad === "/currentHelmutState/whyItMatters").art, "ausgabe");
  assert.equal(e.aussagen.find(a => a.pfad === "/currentHelmutState/recommendation").art, "fachaussage");
  assert.equal(e.aussagen.find(a => a.pfad.endsWith("mentions/0/evidence")).art, "ausgabe");
  assert.equal(Q.pruefe(e, null).bereit, false);
});
test("Hoch priorisierte heutige Frist wird nicht von bloßer Artikelfrische verdrängt", () => {
  const a = { ...ko(), deadline:"2026-09-24" }, b = ko("b");
  const args = input([a,b], { "vg-a":[doc("frist", "2026-09-20", { summary:"Die Abgabefrist endet am 24.09.2026." })],
    "vg-b":[doc("aktuell", "2026-09-24")] });
  args.decisions[0].score = 95;
  const state = C.toBriefingContractV3(args).currentHelmutState;
  assert.equal(state.primaryVorgangId, "vg-a");
  assert.equal(state.tagesAnlass.art, "heutige-frist");
  const debug = C.buildPrimarySelectionDebug({ ...args, decisionsAfter:args.decisions, state });
  assert.equal(debug.selectedPrimary.vorgang_id, state.primaryVorgangId);
});
test("Production-Zeitstempel und Berliner Tagesgrenze tragen denselben Fristvertrag", () => {
  const ds = [doc("frist", "2026-09-20", { summary:"Die Einreichungsfrist endet am 24.09.2026." })];
  for (const deadline of ["2026-09-24T00:00:00+00:00", "2026-09-23T22:30:00Z"]) {
    assert.equal(B.tagesAnlass(ds, now, null, { deadline }).art, "heutige-frist");
  }
  for (const deadline of ["2026-09-24T00:00:00", "2026-02-30", "2026-09-24T99:00:00Z"]) {
    assert.equal(B.tagesAnlass(ds, now, null, { deadline }), null);
  }
});
console.log(`${count}/${count} Bereichsvertragsfälle bestanden; offline, ohne Modellaufruf.`);
