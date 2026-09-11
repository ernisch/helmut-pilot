"use strict";
const assert = require("node:assert/strict");
const Q = require("../lib/helmut/lage-textqualitaet");
const ai = require("../lib/helmut/ai");
const profile = { committees: ["Innenausschuss", "Testausschuss 4"],
  focusTopics: ["Testthema 11", "Datenschutz"], constituency: "Testwahlkreis 081",
  state: "Thueringen", party: "Beispielpartei" };
const sources = [{ vorgang_id: "vg-ausweis", quellenbelege: [{ quelle_id: "q-ausweis", url: "https://example.org/elektronischer-ausweis",
  titel: "Das Ministerium stellt den elektronischen Ausweis vor.", auszug: "Die Anwendung prueft die digitale Identitaet." }] }];
const paragraph = { text: sources[0].quellenbelege[0].titel, vorgang_ids: ["vg-ausweis"],
  quelle_id: "q-ausweis", mandatsbezug: { feld: "schwerpunkt", wert: "Testthema 11" } };
const review = { pruefungen: [{ absatz: 0, quelle_id: "q-ausweis", belegfeld: "titel",
  vollstaendig_belegt: true, themenrein: true, profilbezug: true, textart: "konkreter_sachverhalt",
  pruefbegruendung: "Der elektronische Ausweis betrifft den Innenausschuss." }], vergleiche: [] };
for (const [feld, wert] of [["schwerpunkt", "Testthema 11"], ["ausschuss", "Testausschuss 4"],
  ["wahlkreis", "Testwahlkreis 081"]]) {
  assert.equal(Q.mandatsbezugGueltig({ feld, wert }, profile), false,
    "Die Existenz eines Platzhalters belegt keine fachliche Zustaendigkeit");
}
assert.equal(Q.mandatsbezugGueltig({ feld: "wahlkreis", wert: "Testregion 40" },
  { wahlkreis: "Testregion 40" }), false);
assert.equal(Q.mandatsbezugGueltig({ feld: "ausschuss", wert: "Innenausschuss" }, profile), true);
assert.equal(Q.mandatsbezugGueltig({ feld: "schwerpunkt", wert: "Datenschutz" }, profile), true);
assert.equal(Q.mandatsbezugGueltig({ feld: "bundesland", wert: "Thueringen" }, profile), true);
assert.equal(Q.mandatsbezugGueltig({ feld: "schwerpunkt", wert: "Testverfahren in der Medizin" },
  { focusTopics: ["Testverfahren in der Medizin"] }), true, "Echte Fachbegriffe bleiben erlaubt");
const out = Q.pruefe([paragraph], sources, review, profile);
assert.equal(out.ok, false);
assert(out.diagnose.fehler.includes("mandatsbindung-ungueltig"),
  "Ein positives Modellurteil ersetzt den konkreten Feldbezug nicht");
assert.equal(Q.pruefe([{ ...paragraph, mandatsbezug: { feld: "ausschuss", wert: "Innenausschuss" } }],
  sources, review, profile).ok, true);
assert.deepEqual(ai.assembleLageParagraphs({ paragraphs: [paragraph, paragraph] }, sources, profile), []);
console.log("12/12 Bindungspruefungen: Platzhalter abgelehnt, konkrete Mandatsfelder erhalten.");
