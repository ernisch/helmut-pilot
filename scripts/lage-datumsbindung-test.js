"use strict";
const A = require("node:assert/strict");
const { datumsangabenGebunden: gebunden } = require("../lib/helmut/lage-datumsbindung");
const Q = require("../lib/helmut/lage-textqualitaet");
const C = require("../lib/helmut/lage-quellenbeleg");
const { payload } = require("./fixtures/lage-beleg");
const quelle = { quelle_id: "q-aktion", titel: "Verband ruft zu Protesten auf",
  auszug: "Der Verband hat für heute zu einem bundesweiten Aktionstag aufgerufen.",
  veroeffentlichtAm: "2026-09-25T21:39:26Z", url: "https://example.org/2026/09/25",
  zeitbezug: { publikationsjahr: 2026, ereignisdatum: "2026-09-25" } };
for (const datum of ["25. September 2026", "25.09.2026", "2026-09-25", "25. Sep. 2026", "25. September", "25.09."])
  A.equal(gebunden(`Der Verband ruft für den ${datum} zu Protesten auf.`, quelle), false, datum);
A(gebunden("Der Verband hat zu einem bundesweiten Aktionstag aufgerufen.", quelle));
console.log("PASS Publication, URL und sonstige Metadaten legitimieren kein Kalenderdatum");

for (const monat of ["September", "Sep.", "Sept."])
  A(gebunden(`Die Beratung findet am 25. ${monat} 2026 statt.`, { titel: "Beratung am 25.09.2026" }));
A(gebunden("Die Beratung findet am 25. September statt.", { auszug: "Beratung am 2026-09-25" }));
A.equal(gebunden("Die Beratung findet am 25. September 2026 statt.", { auszug: "Beratung am 25. September" }), false);
A.equal(gebunden("Die Beratung findet am 25. September 2026 statt.", { auszug: "Beratung am 25. September 2025" }), false);
A.equal(gebunden("Die Beratung findet am 25. September 2026 statt.", { titel: "Termin am 25.", auszug: "September 2026" }), false);
console.log("PASS Formatwechsel und belegte Teilangabe erlaubt; erfundenes Jahr und Feldmontage abgelehnt");

for (const monat of ["März", "Maerz", "Mrz."])
  A(gebunden(`Am 2. ${monat} 2026 wird beraten.`, { auszug: "Beratung am 02.03.2026" }));
A(gebunden("Beratung am 29. Februar 2024", { titel: "Beratung am 29.02.2024" }));
for (const datum of ["31. September 2026", "29. Februar 2025", "00.12.2026", "2026-13-02"])
  A.equal(gebunden(datum, { titel: datum }), false);
A.equal(gebunden("Beratung am 25. September 2026 und 26. September 2026", { titel: "Beratung am 25.09.2026" }), false);
A(gebunden("Der Ausschuss behandelt Drucksache 21/7970 und Artikel 25.", quelle));
console.log("PASS Monatsformen, Schalttag, ungueltige Daten, mehrere Angaben und Drucksachen");

const p = { text: "Der Verband ruft für den 25. September 2026 zu Protesten auf.",
  vorgang_ids: ["vg-aktion"], quelle_id: "q-aktion", mandatsbezug: { feld: "schwerpunkt", wert: "Sozialstaat" } };
const vorgaenge = [{ vorgang_id: "vg-aktion", quellenbelege: [quelle] }];
const review = { pruefungen: [{ absatz: 0, quelle_id: "q-aktion", belegfeld: "auszug",
  vollstaendig_belegt: true, themenrein: true, profilbezug: true, textart: "konkreter_sachverhalt",
  pruefbegruendung: "Die Quelle nennt einen Aktionstag." }], vergleiche: [] };
A.equal(Q.pruefe([p], vorgaenge, review, { focusTopics: ["Sozialstaat"] }).ok, false);
const alt = payload();
Object.assign(alt.quellen[0].quellenbelege[0], { titel: quelle.titel, auszug: quelle.auszug, veroeffentlichtAm: quelle.veroeffentlichtAm });
alt.paragraphs[0].text = p.text;
alt.paragraphs[0].belegstellen[0].text = quelle.auszug;
alt.quellenHash = C.hashEingabe(alt.quellen);
A.equal(C.gespeicherterTextGueltig(alt), false);
A.equal(C.cacheGueltig(alt, alt.koSetHash, alt.quellenHash, alt.quellen), false);
console.log("PASS positives Modellurteil und gespeicherter Cache heilen kein unbelegtes Datum");
