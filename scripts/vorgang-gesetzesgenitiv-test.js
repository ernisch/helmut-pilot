"use strict";

const assert = require("node:assert/strict");
const I = require("../lib/helmut/vorgang-identity");
const Q = require("../lib/helmut/briefing-quellenqualitaet");

// Synthetische Meldungen; weder Originalabsatz noch Profilbevorzugung.
const basis = { id: "quelle-a", title: "Bundestag beschliesst Bundespolizeigesetz",
  summary: "", published_at: "2026-09-25T08:00:00Z" };
const amtlich = { id: "quelle-b", title: "Modernisierung des Bundespolizeigesetzes beschlossen",
  summary: "", published_at: null };
for (const gesetz of ["bundespolizeigesetz", "medizinproduktegesetz", "gendiagnostikgesetz"]) {
  for (const ende of ["s", "es"]) {
    assert.equal(I.matchStaerke(gesetz, gesetz + ende), 2);
    assert.equal(I.matchStaerke(gesetz + ende, gesetz), 2);
  }
}
assert.equal(I.matchStaerke("gesetz", "gesetzes"), 1);
assert.equal(I.matchStaerke("haushaltsplan", "haushaltsplanung"), 1);
assert.equal(I.matchStaerke("arbeitsversicherung", "arbeitsversicherungen"), 1);
assert.equal(I.matchStaerke("bundespolizeigesetz", "bundesverfassungsschutzgesetz"), 0);
for (const docs of [[basis, amtlich], [amtlich, basis]]) {
  assert.equal(I.clusterRawDocuments(docs).length, 1);
  assert.equal(Q.themenrein(docs), true);
}
const konflikt = { ...amtlich, title: "Modernisierung des Bundespolizeigesetzes 2020" };
const aktuell = { ...basis, title: "Bundespolizeigesetz 2026 beschlossen" };
assert.equal(I.docsShareEvent(aktuell, konflikt).grund, "jahreskonflikt");
assert.equal(I.clusterRawDocuments([aktuell, konflikt]).length, 2);
assert.equal(Q.themenrein([aktuell, konflikt]), false);
assert.equal(I.docsShareEvent({ ...basis, title: "Bundespolizeigesetz am 25.09.2026 beschlossen" },
  { ...amtlich, title: "Beratung des Bundespolizeigesetzes am 20.09.2026" }).grund, "datumskonflikt");
// Eine Familie bleibt ein Beleg; entfernter Nachrichtenzyklus braucht weiter
// das vorhandene hoehere Gewicht und darf nicht durch s/es mehrfach zaehlen.
assert.equal(I.anchorOverlap(["bundespolizeigesetz", "bundespolizeigesetzes"],
  ["bundespolizeigesetz", "bundespolizeigesetzes"]).spezifischeFamilien, 1);
const fern = { ...amtlich, published_at: "2026-09-01T08:00:00Z" };
assert.equal(I.docsShareEvent(basis, fern).gleich, false);
assert.equal(Q.themenrein([basis, { ...amtlich, title: "Bundestag beschliesst Medizinproduktegesetz" }]), false);
console.log("Gesetzesgenitiv: gleiche Identitaet, eine Familie, harte Zeit-/Thementrennung bestanden.");
