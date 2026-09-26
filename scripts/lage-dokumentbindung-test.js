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
const review = { pruefungen: basis.map((p, absatz) => ({ absatz, quelle_id: "q-wohnen", belegfeld: "titel",
  pruefbegruendung: "Der Titel belegt den kommunalen Wohnungsbau.", vollstaendig_belegt: true,
  themenrein: true, profilbezug: true, textart: "konkreter_sachverhalt",
  mandatsbegruendung: `Wohnungsbau betrifft die fachliche Aufgabe des ${p.mandatsbezug.wert}.` })),
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
  pruefbegruendung: absatz === 0 ? "Auszug belegt nur Fortsetzung; Oligarchen und Tagesschau fehlen." : "Auszug belegt Beschluss und Haushaltsbericht.",
  mandatsbegruendung: `Der belegte Sachverhalt betrifft die fachliche Zustaendigkeit des ${p.mandatsbezug.wert}.`
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

// Gruppen 11-12: Zwei tatsaechlich vorhandene Ausschuesse bleiben ohne
// kuenstlichen ersten Schwerpunkt gleichwertig. Echter Promptwiderspruch vom
// 26.09.: der Generator erklaerte den ersten Ausschuss automatisch zum
// "Schwerpunkt des Mandats", obwohl das Profil Auswaertigen UND
// Haushaltsausschuss traegt. Alle Mandatsfelder bleiben unveraendert im Kontext.
const zweiProfil = { committees: ["Auswärtiger Ausschuss", "Haushaltsausschuss"] };
const zweiPrompt = ai.buildLageBriefingPrompt(fallQuellen, zweiProfil, { briefingDatum: "2026-09-26" });
assert(!/Schwerpunkt des Mandats/.test(zweiPrompt), "kein erfundener erster Schwerpunkt im Generatorprompt");
assert.match(zweiPrompt, /Reihenfolge je Absatz: zuerst genau EIN Quelldokument/);
assert.match(zweiPrompt, /kein Ausschuss und kein Schwerpunkt ist automatisch der erste/);
const zweiKontext = JSON.parse(zweiPrompt.split("\n")
  .find(l => l.startsWith("Fachlicher Mandatskontext: ")).slice("Fachlicher Mandatskontext: ".length));
assert.deepEqual(zweiKontext.ausschuesse, zweiProfil.committees, "beide Ausschuesse bleiben unveraendert im Kontext");
assert.equal(Q.mandatsbezugGueltig({ feld: "ausschuss", wert: zweiProfil.committees[1] }, zweiProfil), true,
  "der zweite Ausschuss ist kein geringerer Bezug als der erste");
assert.deepEqual(Object.keys(ai.LAGE_BRIEFING_SCHEMA.properties.paragraphs.items.properties),
  ["vorgang_ids", "quelle_id", "auswahlbegruendung", "mandatsbezug", "text"],
  "Absatzfelder in Quelle-vor-Auswahlbegruendung-vor-Mandatsbezug-vor-Text-Reihenfolge");
assert.deepEqual(ai.LAGE_BRIEFING_SCHEMA.properties.paragraphs.items.required,
  ["vorgang_ids", "quelle_id", "auswahlbegruendung", "mandatsbezug", "text"],
  "auswahlbegruendung ist vor mandatsbezug Pflichtfeld");
const beispielAbsatz = JSON.parse(zweiPrompt.split("\n").find(l => l.startsWith('{ "paragraphs":'))).paragraphs[0];
assert.deepEqual(Object.keys(beispielAbsatz), ["vorgang_ids", "quelle_id", "auswahlbegruendung", "mandatsbezug", "text"],
  "JSON-Promptbeispiel in derselben Reihenfolge");
assert.match(zweiPrompt, /Private Auswahlnotiz/i,
  "auswahlbegruendung ist im Prompt als private Auswahlnotiz erklaert");
assert.match(zweiPrompt, /auswahlbegruendung ist eine private Auswahlnotiz und KEIN Quellenbeleg/,
  "Der Prompt verbietet die Auswahlbegruendung im sichtbaren Text");

// Gruppe 13: Der belegte falsche Mandatsbezug vom 26.09. (Kraftstoffpreis-Absatz
// am Auswaertigen Ausschuss) bleibt vom unveraenderten strengen Review abgelehnt.
// Die Struktur allein akzeptiert ihn, weil der Wert ein echtes Profilfeld ist.
// Das vorgegebene Review ist ein Offline-Vertragsbeleg, keine Wirkgarantie.
const kraftstoffQuellen = [{ vorgang_id: "vg-kraftstoffpreise", quellenbelege: [
  { quelle_id: "q-dlf-kraftstoff", url: "https://example.org/kraftstoffpreise", quelle: "Deutschlandfunk Politik",
    titel: "Hohe Kraftstoffpreise - SPD-Fraktionsvize Zorn verteidigt vom Bundeskabinett beschlossenen Tankrabatt",
    auszug: "SPD-Fraktionsvize Zorn hat die vom Bundeskabinett beschlossene Senkung der Energiesteuer auf Benzin und Diesel verteidigt." },
  { quelle_id: "q-bt-haushalt", url: "https://example.org/haushaltsausschuss", quelle: "Deutscher Bundestag",
    titel: "Haushaltsausschuss berät über die Finanzierung der Entlastungen",
    auszug: "Der Haushaltsausschuss hat die Finanzierbarkeit der beschlossenen Entlastungen beraten." }
] }];
const kraftstoffAbsaetze = [
  { text: "SPD-Fraktionsvize Zorn hat die vom Bundeskabinett beschlossene Senkung der Energiesteuer auf Benzin und Diesel verteidigt, berichtet Deutschlandfunk Politik.",
    vorgang_ids: ["vg-kraftstoffpreise"], quelle_id: "q-dlf-kraftstoff",
    mandatsbezug: { feld: "ausschuss", wert: zweiProfil.committees[0] } },
  { text: "Der Haushaltsausschuss hat die Finanzierbarkeit der beschlossenen Entlastungen beraten, berichtet der Deutsche Bundestag.",
    vorgang_ids: ["vg-kraftstoffpreise"], quelle_id: "q-bt-haushalt",
    mandatsbezug: { feld: "ausschuss", wert: zweiProfil.committees[1] } }
];
const kraftstoffReview = { pruefungen: [
  { absatz: 0, quelle_id: "q-dlf-kraftstoff", belegfeld: "auszug", themenrein: true, profilbezug: false,
    textart: "konkreter_sachverhalt", vollstaendig_belegt: true,
    pruefbegruendung: "Der Auszug belegt den Tankrabatt, nicht die Zustaendigkeit des Auswaertigen Ausschusses.",
    mandatsbegruendung: `Der Auszug belegt Kraftstoffpreise, nicht den fachlichen Bezug zum Feld '${zweiProfil.committees[0]}'.` },
  { absatz: 1, quelle_id: "q-bt-haushalt", belegfeld: "auszug", themenrein: true, profilbezug: true,
    textart: "konkreter_sachverhalt", vollstaendig_belegt: true,
    pruefbegruendung: "Der Auszug belegt die Beratung im Haushaltsausschuss.",
    mandatsbegruendung: `Die Finanzierbarkeit der Entlastungen betrifft die fachliche Aufgabe des Felds '${zweiProfil.committees[1]}'.` }
], vergleiche: [{ erster_absatz: 0, zweiter_absatz: 1, eigenstaendige_sachverhalte: true,
  pruefbegruendung: "Tankrabatt-Verteidigung und Haushaltsberatung sind verschiedene Sachverhalte." }] };
assert.equal(ai.assembleLageParagraphs({ paragraphs: kraftstoffAbsaetze }, kraftstoffQuellen, zweiProfil).length, 2,
  "die Struktur allein entscheidet den fachlichen Bezug nicht");
const kraftstoff = Q.pruefe(kraftstoffAbsaetze, kraftstoffQuellen, kraftstoffReview, zweiProfil);
assert.equal(kraftstoff.ok, false);
assert(kraftstoff.diagnose.fehler.includes("profilbezug-fehlt"));
// Fachlicher Mandatsbezug ist keine Behauptung, dass der Ausschuss gehandelt hat.
const redaktion=Q.prompt(korrekt,fallQuellen,fallProfil);
assert.match(redaktion,/Ergaenze keine Nachrichtenfakten aus Vorwissen/);
assert(!redaktion.includes("Nutze kein Vorwissen."));
assert.match(redaktion,/muss der Ausschuss nicht im Artikel genannt sein/);
assert.match(redaktion,/genau diese Akteursrolle in Titel oder Auszug belegt/);
assert.equal(Q.pruefe(korrekt,fallQuellen,korrektReview,fallProfil).ok,true);
const unbelegteRolle=structuredClone(korrekt);
unbelegteRolle[0].text="Der Auswärtige Ausschuss hat die Sanktionen beschlossen.";
const rollenReview=structuredClone(korrektReview);
rollenReview.pruefungen[0].vollstaendig_belegt=false;
rollenReview.pruefungen[0].pruefbegruendung="Die Quelle nennt Verhandlungen in Brüssel, keinen Beschluss des Ausschusses.";
assert.equal(Q.pruefe(unbelegteRolle,fallQuellen,rollenReview,fallProfil).ok,false);

// Gruppen 14-16: Getrenntes Mandatsurteil. Das neue Pflichtfeld mandatsbegruendung
// nennt das gewaehlte Mandatsfeld mit seinem EXAKTEN Wert und steht vor profilbezug.
// Fehlend, leer oder fachfeldfremd wird fail closed abgelehnt; eine positive
// Bewertung wird nicht hartkodiert. Die Quellen- und Paarregeln bleiben unveraendert.
const reviewItem = Q.SCHEMA.properties.pruefungen.items;
assert(reviewItem.required.includes("mandatsbegruendung"), "mandatsbegruendung ist Pflichtfeld");
assert(reviewItem.required.indexOf("mandatsbegruendung") < reviewItem.required.indexOf("profilbezug"),
  "mandatsbegruendung steht vor profilbezug");
assert.equal(reviewItem.properties.mandatsbegruendung.type, "string");
assert.match(reviewItem.properties.pruefbegruendung.description, /nur zur Beleglage/);
assert.match(reviewItem.properties.mandatsbegruendung.description, /EXAKTEN Wert/);
assert.match(redaktion, /fachliche Aufgabe der Institution mit dem in der Quelle belegten Sachthema/);
assert.match(redaktion, /Namens- oder Wortgleichheit allein ist kein fachlicher Bezug/);
assert.match(redaktion, /privaten Haushalten/);
assert.match(redaktion, /mandatsbegruendung ist Pflicht/);
assert.match(zweiPrompt, /Namens- oder Wortgleichheit allein ist kein fachlicher Bezug/);
assert.match(zweiPrompt, /privaten Haushalten/);

for (const begruendung of [undefined, "", "Der Beleg betrifft einen anderen Ausschuss."]) {
  const ohneWert = structuredClone(korrektReview);
  ohneWert.pruefungen[0].mandatsbegruendung = begruendung;
  const out = Q.pruefe(korrekt, fallQuellen, ohneWert, fallProfil);
  assert.equal(out.ok, false);
  assert(out.diagnose.fehler.includes("mandatsbegruendung-fehlt"));
}
const fremdesFeld = structuredClone(korrektReview);
fremdesFeld.pruefungen[0].mandatsbegruendung = "Der Sachverhalt betrifft den Haushaltsausschuss.";
const fremdesFeldUrteil = Q.pruefe(korrekt, fallQuellen, fremdesFeld, fallProfil);
assert.equal(fremdesFeldUrteil.ok, false);
assert(fremdesFeldUrteil.diagnose.fehler.includes("mandatsbegruendung-fehlt"));

// Ein negatives Profilurteil bleibt trotz vollstaendiger Begruendung abgelehnt.
const negativesProfil = structuredClone(korrektReview);
negativesProfil.pruefungen[0].profilbezug = false;
const negativesProfilUrteil = Q.pruefe(korrekt, fallQuellen, negativesProfil, fallProfil);
assert.equal(negativesProfilUrteil.ok, false);
assert(negativesProfilUrteil.diagnose.fehler.includes("profilbezug-fehlt"));

// Paarregel unveraendert: ohne vollstaendige Paarurteile keine Freigabe.
const ohnePaar = structuredClone(korrektReview);
ohnePaar.vergleiche = [];
assert.equal(Q.pruefe(korrekt, fallQuellen, ohnePaar, fallProfil).grund, "ai-text-quality-incomplete");

// Reine historische Fixtures ohne Profil bleiben ohne das neue Feld gueltig.
const altParagraph = [{ text: "Der Bundestag beriet den Haushalt.", vorgang_ids: ["vg-alt"] }];
const altQuellen = [{ vorgang_id: "vg-alt", quellenbelege: [{ quelle_id: "q-alt",
  url: "https://example.org/alt", titel: "Der Bundestag beriet den Haushalt." }] }];
const altReview = { pruefungen: [{ absatz: 0, quelle_id: "q-alt", belegfeld: "titel",
  vollstaendig_belegt: true, themenrein: true, profilbezug: true, textart: "konkreter_sachverhalt",
  pruefbegruendung: "Der Titel belegt die Beratung." }], vergleiche: [] };
assert.equal(Q.pruefe(altParagraph, altQuellen, altReview).ok, true,
  "reiner Quellenfixture ohne Profil braucht keine mandatsbegruendung");
console.log("Dokumentbindungsgruppen: Einzelquelle, Mandatsauswahl, fachliche Zustaendigkeit, Akteursbeleg und getrenntes Mandatsurteil.");
