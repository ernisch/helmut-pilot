"use strict";
const assert = require("node:assert/strict");
const ai = require("../lib/helmut/ai");
const Q = require("../lib/helmut/lage-textqualitaet");

const profil = { committees: ["Ausschuss für Wohnen, Stadtentwicklung, Bauwesen und Kommunen"],
  focusTopics: ["Stadtentwicklung"] };
const vorgaenge = [{ vorgang_id: "vg-mischgruppe", quellenbelege: [
  { quelle_id: "q-wohnen", url: "https://example.org/wohnungsbau", titel: "Bund fördert kommunalen Wohnungsbau", auszug: "Das Programm unterstützt Städte beim Wohnungsbau." },
  { quelle_id: "q-kassen", url: "https://example.org/krankenkassen", titel: "Krankenkassen melden Verluste", auszug: "Die Kassen erwarten steigende Beiträge." }
] }];
const bezug = { feld: "ausschuss", wert: profil.committees[0] };
const basis = [
  { text: "Der Bund fördert den kommunalen Wohnungsbau.", vorgang_ids: ["vg-mischgruppe"], quelle_id: "q-wohnen", mandatsbezug: bezug },
  { text: "Das Programm unterstützt Städte beim Wohnungsbau.", vorgang_ids: ["vg-mischgruppe"], quelle_id: "q-wohnen", mandatsbezug: bezug }
];
const review = { pruefungen: basis.map((_, absatz) => ({ absatz, quelle_id: "q-wohnen", belegfeld: "titel",
  pruefbegruendung: "Wohnungsbau ist dem angegebenen Ausschuss direkt zugeordnet.", vollstaendig_belegt: true,
  themenrein: true, profilbezug: true, textart: "konkreter_sachverhalt" })),
  vergleiche: [{ erster_absatz: 0, zweiter_absatz: 1, eigenstaendige_sachverhalte: true,
    pruefbegruendung: "Ein Absatz nennt die Förderung, der andere die kommunale Unterstützung." }] };

assert.equal(ai.LAGE_BRIEFING_SCHEMA.properties.paragraphs.items.required.includes("quelle_id"), true);
assert.equal(ai.LAGE_BRIEFING_SCHEMA.properties.paragraphs.items.required.includes("mandatsbezug"), true);
assert.equal(ai.assembleLageParagraphs({ paragraphs: basis }, vorgaenge, profil).length, 2);
assert.deepEqual(ai.assembleLageParagraphs({ paragraphs: basis.map(p => ({ ...p, quelle_id: "q-fremd" })) },
  vorgaenge, profil), []);
assert.deepEqual(ai.assembleLageParagraphs({ paragraphs: basis.map(p => ({ ...p,
  mandatsbezug: { feld: "ausschuss", wert: "Gesundheit" } })) }, vorgaenge, profil), []);
assert.equal(Q.pruefe(basis, vorgaenge, review, profil).ok, true);
const fremdReview = structuredClone(review);
fremdReview.pruefungen[0].quelle_id = "q-kassen";
const fremd = Q.pruefe(basis, vorgaenge, fremdReview, profil);
assert.equal(fremd.ok, false);
assert(fremd.diagnose.fehler.includes("quellenbezug-abweichend"));
const prompt = Q.prompt(basis, vorgaenge, profil);
assert.match(prompt, /GENAU dieses Quelldokument/);
assert.match(prompt, /vertauschte Rollen, Orte und Akteure/);

// Gruppen 9-10: Der Generator fuehrt jedes Quelldokument als eigene abgeschlossene
// Dateneinheit. Mehrere Dokumente derselben Vorgangskennung bleiben vollstaendig
// erhalten und werden nicht in einem Absatz vermischt (echter Fehler vom 26.09.).
const generator = ai.buildLageBriefingPrompt(vorgaenge, profil, { briefingDatum: "2026-09-26" });
assert.match(generator, /Jede Zeile der Liste unten ist EIN abgeschlossenes Quelldokument/);
assert.match(generator, /sachgleiche Nachbardokumente mit derselben Vorgangskennung duerfen einen Absatz nicht ergaenzen/);
assert.match(generator, /genau EINE Vorgangskennung nennen und in quelle_id genau die quelle_id/);
assert(!/ids der Vorgaenge nennen/.test(generator), "widerspruechliche Mehrzahlregel bleibt entfernt");
const zeilen = generator.split("\n").filter(l => l.startsWith("[vg-mischgruppe] "))
  .map(l => JSON.parse(l.slice("[vg-mischgruppe] ".length)));
assert.equal(zeilen.length, 2);
assert(zeilen.every(z => Array.isArray(z.quellenbelege) && z.quellenbelege.length === 1),
  "jede Zeile enthaelt genau ein Quelldokument");
assert.deepEqual(zeilen.map(z => z.quelle_id).sort(), ["q-kassen", "q-wohnen"]);
for (const q of vorgaenge[0].quellenbelege) {
  const zeile = zeilen.find(z => z.quelle_id === q.quelle_id);
  assert(zeile, "Quelldokument fehlt im Generatorprompt");
  assert.deepEqual(zeile.quellenbelege[0], q, "Quelldaten bleiben unveraendert vollstaendig");
}

// Echter, oeffentlich belegter Fehler: zwei Berichte ueber denselben Vorgang.
// Das vorgegebene Review ist ein Offline-Vertragsbeleg, keine neue KI-Abnahme.
const fallProfil = { committees: ["Auswärtiger Ausschuss", "Haushaltsausschuss"] };
const fallQuellen = [
  { vorgang_id: "vg-sanktionen", quellenbelege: [
    { quelle_id: "q-dlf", url:"https://example.org/sanktionen-dlf", titel: "Verhandlungen über Verlängerung der Sanktionen gegen Russland fortgesetzt",
      auszug: "In Brüssel sind die Verhandlungen über die Verlängerung von Sanktionen gegen Russland fortgesetzt worden.", quelle: "Deutschlandfunk" },
    { quelle_id: "q-ts", url:"https://example.org/sanktionen-ts", titel: "EU-Staaten streiten über Russland-Sanktionen",
      auszug: "Einige Staaten wollen zwei milliardenschwere Oligarchen von der Liste streichen. Das sorgt für Diskussionen.", quelle: "Tagesschau" }
  ] },
  { vorgang_id: "vg-polizei", quellenbelege: [
    { quelle_id: "q-bt", url:"https://example.org/bundespolizei", titel: "Modernisierung des Bundespolizeigesetzes beschlossen",
      auszug: "Der Bundestag hat den Gesetzentwurf angenommen. Dazu liegt ein Bericht des Haushaltsausschusses zur Finanzierbarkeit vor.", quelle: "Deutscher Bundestag" }
  ] }
];
const mischEntwurf = [
  { text: "In Brüssel wurden Verhandlungen über Sanktionen gegen Russland fortgesetzt; einige Staaten wollen zwei milliardenschwere Oligarchen von der Liste streichen, berichten Deutschlandfunk und Tagesschau.",
    vorgang_ids: ["vg-sanktionen"], quelle_id: "q-dlf", mandatsbezug: { feld: "ausschuss", wert: fallProfil.committees[0] } },
  { text: "Der Bundestag hat den Gesetzentwurf angenommen; ein Bericht des Haushaltsausschusses zur Finanzierbarkeit liegt vor, berichtet der Deutsche Bundestag.",
    vorgang_ids: ["vg-polizei"], quelle_id: "q-bt", mandatsbezug: { feld: "ausschuss", wert: fallProfil.committees[1] } }
];
const mischReview = { pruefungen: mischEntwurf.map((p, absatz) => ({
  absatz, quelle_id: p.quelle_id, belegfeld: "auszug", themenrein: true, profilbezug: true,
  textart: "konkreter_sachverhalt", vollstaendig_belegt: absatz === 1,
  pruefbegruendung: absatz === 0 ? "Auszug belegt nur Fortsetzung; Oligarchen und Tagesschau fehlen." : "Auszug belegt Beschluss und Haushaltsbericht."
})), vergleiche: [{ erster_absatz: 0, zweiter_absatz: 1, eigenstaendige_sachverhalte: true,
  pruefbegruendung: "Sanktionen und Bundespolizeigesetz sind unterschiedliche Sachverhalte." }] };
const misch = Q.pruefe(mischEntwurf, fallQuellen, mischReview, fallProfil);
assert.equal(misch.ok, false);
assert(misch.diagnose.fehler.includes("aussage-unbelegt"));
const korrekt = structuredClone(mischEntwurf);
korrekt[0].text = "In Brüssel wurden die Verhandlungen über die Verlängerung der Sanktionen gegen Russland fortgesetzt, berichtet Deutschlandfunk.";
const korrektReview = structuredClone(mischReview);
korrektReview.pruefungen[0].vollstaendig_belegt = true;
korrektReview.pruefungen[0].pruefbegruendung = "Der Auszug belegt allein die Fortsetzung der Verhandlungen.";
assert.equal(Q.pruefe(korrekt, fallQuellen, korrektReview, fallProfil).ok, true);
console.log("11/11 Dokumentbindungsgruppen: Quelle, Vorgang, Mandatsfeld, Rollenpruefung und Dokumenttrennung.");
