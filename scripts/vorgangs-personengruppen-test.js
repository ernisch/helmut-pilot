"use strict";

// Regression fuer die am 20.09. gelesene Vermischung zweier Arbeitskonflikte.
// Nur synthetische Kennungen und oeffentliche Titel; kein Netz, Modell oder Store.
const assert = require("node:assert/strict");
const V = require("../lib/helmut/vorgang-identity");
let count = 0;
let failed = 0;
function test(name, fn) {
  count += 1;
  try { fn(); console.log(`PASS ${name}`); }
  catch (e) { failed += 1; console.error(`FAIL ${name}: ${e.message}`); }
}
const doc = (id, title, published_at = "2026-09-09T14:00:00Z") =>
  ({ id, title, summary: null, published_at });
const industrie = [
  doc("industrie-1", "Beschäftigte: Geschäftsbereich TI muss bei Siemens Energy bleiben! - IG Metall Berlin-Brandenburg-Sachsen", "2026-09-09T14:19:07Z"),
  doc("industrie-2", "Beschäftigte von Siemens Energy protestieren: Zukunft für Geschäftsbereich TI! - IG Metall", "2026-09-09T07:00:00Z")
];
const hafen = doc("hafen-1", "Tarifrunde Seehäfen: Arbeitgeber legen marginal verbessertes Angebot vor - ver.di geht wieder in Rückkopplungsgespräche mit den Hafenbeschäftigten - ver.di - Vereinte Dienstleistungsgewerkschaft", "2026-09-10T09:52:17Z");

test("zwei verschiedene Arbeitskonflikte bleiben in beiden Vergleichsrichtungen getrennt", () => {
  for (const d of industrie) {
    assert.equal(V.docsShareEvent(d, hafen).gleich, false);
    assert.equal(V.docsShareEvent(hafen, d).gleich, false);
  }
});
test("positive Folgemeldungen zum selben Unternehmen bleiben zusammen", () => {
  assert.equal(V.docsShareEvent(...industrie).gleich, true);
  assert.equal(V.sameVorgang({ documents: [industrie[1]] }, { documents: [industrie[0]] }).gleich, true);
});
test("alle sechs Eingabereihenfolgen erhalten genau die beiden richtigen Gruppen", () => {
  for (const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]) {
    const docs = [...industrie, hafen];
    const groups = V.clusterRawDocuments(order.map(i => docs[i]));
    assert.deepEqual(groups.map(g => g.documents.map(d => d.id).sort().join(",")).sort(),
      ["hafen-1", "industrie-1,industrie-2"]);
  }
});
test("keine fremde Tarifrunde an einen vorhandenen Industrievorgang anhaengen", () => {
  assert.equal(V.sameVorgang({ documents: [hafen] }, { documents: industrie }).gleich, false);
});
test("Personengruppen und ihre Flexionsformen tragen allein keine Ereignisidentitaet", () => {
  for (const word of ["Beschäftigte", "Beschäftigten", "Beschäftigter", "Beschäftigtem", "Beschaeftigte", "Beschaeftigten"]) {
    const a = doc("a", `${word} bei Nordlicht Turbinen: Standort bedroht`);
    const b = doc("b", `${word} in Stadtbibliotheken: Eröffnung verschoben`);
    assert.equal(V.docsShareEvent(a, b).gleich, false, word);
    assert.equal(V.docsShareEvent(b, a).gleich, false, word);
  }
});
test("generische Teilwoerter werden auch auf der Kompositumseite kein Sachbeleg", () => {
  const general = ["bundesstaat", "gesellschaft"];
  const specific = ["bundesstaatsanwaltschaft", "gesellschaftsrecht"];
  assert.equal(V.anchorOverlap(general, specific).gewichtSpezifisch, 0);
  assert.equal(V.anchorOverlap(specific, general).gewichtSpezifisch, 0);
});
test("spezifische Komposita und identische Gruppen mit Fachbezug bleiben nutzbar", () => {
  assert.equal(V.matchStaerke("tariftreue", "tariftreuegesetz"), 2);
  assert.equal(V.matchStaerke("bundesstaatsanwaltschaft", "bundesstaatsanwaltschaft"), 2);
  assert.equal(V.docsShareEvent(
    doc("h1", "Hafenbeschäftigte beraten Angebot in Tarifrunde Seehäfen"),
    doc("h2", "Tarifrunde Seehäfen: Hafenbeschäftigte stimmen über Angebot ab")
  ).gleich, true);
});
console.log(`${count - failed}/${count} Gruppen erfolgreich`);
process.exitCode = failed ? 1 : 0;
