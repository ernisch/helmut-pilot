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
console.log("8/8 Dokumentbindungsgruppen: Quelle, Vorgang, Mandatsfeld und Rollenpruefung.");
