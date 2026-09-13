"use strict";

// Synthetischer Kontextvertrag, kein Modellurteil oder historischer Textnachbau.
const assert = require("node:assert/strict");
const storage = require("../lib/helmut/storage");
const ai = require("../lib/helmut/ai");
const Q = require("../lib/helmut/lage-textqualitaet");
let bestanden = 0;
const pruefung = (name, fn) => { fn(); bestanden++; console.log("PASS " + name); };
const profil = storage.fromMandateProfileRow({ id: "synthetisch-profilbezug" }, {
  politische_ebene: "bundestag", ausschuesse: ["Petitionsausschuss"],
  stellvertretende_ausschuesse: ["Haushaltsausschuss", "Ausschuss für Wohnen, Stadtentwicklung, Bauwesen und Kommunen"],
  fachpolitische_schwerpunkte: ["Pflege"]
});
const original = structuredClone(profil);
const vorgaenge = [
  { vorgang_id: "vg-haushalt", quellenbelege: [{ quelle_id: "q-haushalt",
    titel: "Der Haushaltsausschuss berät den Entwurf.", auszug: "", url: "https://example.invalid/haushalt" }] },
  { vorgang_id: "vg-wohnen", quellenbelege: [{ quelle_id: "q-wohnen",
    titel: "Der Bund fördert kommunalen Wohnungsbau.", auszug: "", url: "https://example.invalid/wohnen" }] }
];
const paragraphs = vorgaenge.map((v, i) => ({ text: v.quellenbelege[0].titel,
  vorgang_ids: [v.vorgang_id], quelle_id: v.quellenbelege[0].quelle_id,
  mandatsbezug: { feld: "ausschuss", wert: profil.deputyCommittees[i] } }));
const urteil = { pruefungen: paragraphs.map((p, absatz) => ({ absatz, quelle_id: p.quelle_id,
  belegfeld: "titel", pruefbegruendung: "Synthetischer Vertragsfall mit stellvertretender Zuständigkeit.",
  vollstaendig_belegt: true, themenrein: true, profilbezug: true, textart: "konkreter_sachverhalt" })),
  vergleiche: [{ erster_absatz: 0, zweiter_absatz: 1, eigenstaendige_sachverhalte: true,
    pruefbegruendung: "Haushaltsberatung und Wohnungsbauförderung sind verschiedene Handlungen." }] };

pruefung("SQL Mapper erhält beide Arten getrennt", () => {
  assert.deepEqual(profil.committees, ["Petitionsausschuss"]);
  assert.equal(profil.deputyCommittees.length, 2);
});
pruefung("Generator und Review erhalten getrennte stellvertretende Ausschüsse", () => {
  const kontext = Q.profilKontext(profil);
  assert.deepEqual(kontext.ausschuesse, ["Petitionsausschuss"]);
  assert.deepEqual(kontext.stellvertretende_ausschuesse, profil.deputyCommittees);
  const generator = ai.buildLageBriefingPrompt(vorgaenge, profil, { briefingDatum: "2026-09-13" });
  const review = Q.prompt(paragraphs, vorgaenge, profil);
  assert.deepEqual(JSON.parse(generator.split("\n").find(l => l.startsWith("Fachlicher Mandatskontext: ")).slice(26)), kontext);
  assert.deepEqual(JSON.parse(review.split("\n").find(l => l.startsWith("MANDAT: ")).slice(8)), kontext);
});
pruefung("Exakte stellvertretende Bindungen passieren Struktur und positives synthetisches Review", () => {
  assert.equal(ai.assembleLageParagraphs({ paragraphs }, vorgaenge, profil).length, 2);
  assert.equal(Q.pruefe(paragraphs, vorgaenge, urteil, profil).ok, true);
});
pruefung("Relationaler Kontext und Profil nur mit Stellvertretung", () => {
  const relational = { ausschuesse: [], stellvertretende_ausschuesse: ["Haushaltsausschuss"] };
  assert.deepEqual(Q.profilKontext(relational).ausschuesse, []);
  assert.deepEqual(Q.profilKontext(relational).stellvertretende_ausschuesse, ["Haushaltsausschuss"]);
  assert.equal(Q.mandatsbezugGueltig({ feld: "ausschuss", wert: "Haushaltsausschuss" }, relational), true);
  assert.equal(Q.mandatsbezugGueltig({ feld: "ausschuss", wert: "Haushaltsausschuss" },
    { committees: [], deputyCommittees: ["Haushaltsausschuss"] }), true);
});
pruefung("Fremder Ausschuss und nummerierter Platzhalter bleiben ungültig", () => {
  for (const wert of ["Finanzausschuss", "Testausschuss 17"]) {
    const p = { ...profil, deputyCommittees: [...profil.deputyCommittees, "Testausschuss 17"] };
    const falsch = paragraphs.map(a => ({ ...a, mandatsbezug: { feld: "ausschuss", wert } }));
    assert.equal(ai.assembleLageParagraphs({ paragraphs: falsch }, vorgaenge, p).length, 0);
    assert(Q.pruefe(falsch, vorgaenge, urteil, p).diagnose.fehler.includes("mandatsbindung-ungueltig"));
  }
});
pruefung("Negative fachliche Urteile bleiben für Absatz 0 und 1 wirksam", () => {
  for (const absatz of [0, 1]) {
    const negativ = structuredClone(urteil); negativ.pruefungen[absatz].profilbezug = false;
    const result = Q.pruefe(paragraphs, vorgaenge, negativ, profil);
    assert.equal(result.ok, false);
    assert.deepEqual(result.diagnose, { absatz, fehler: ["profilbezug-fehlt"] });
  }
});
pruefung("Quellenbindung und Aussagenprüfung bleiben streng", () => {
  const fremd = structuredClone(urteil); fremd.pruefungen[0].quelle_id = "q-wohnen";
  assert.equal(Q.pruefe(paragraphs, vorgaenge, fremd, profil).ok, false);
  const unbelegt = structuredClone(urteil); unbelegt.pruefungen[0].vollstaendig_belegt = false;
  assert(Q.pruefe(paragraphs, vorgaenge, unbelegt, profil).diagnose.fehler.includes("aussage-unbelegt"));
});
pruefung("Ordentliche Bindungen und Profilinhalt erhalten", () => {
  assert.equal(Q.mandatsbezugGueltig({ feld: "ausschuss", wert: "Petitionsausschuss" }, profil), true);
  assert.deepEqual(profil, original);
  assert.equal("stellvertretende_ausschuesse" in Q.profilKontext({}), false);
});
pruefung("Profilhash bindet Stellvertretungen und erhält Profile ohne diese", () => {
  const B = require("../lib/helmut/briefing-speicher");
  const ohne = { ...profil }; delete ohne.deputyCommittees;
  const alterKontext = Q.profilKontext(ohne);
  assert.equal(B.profilHash(ohne), B.hash(alterKontext));
  assert.equal(B.profilHash({ ...ohne, deputyCommittees: [] }), B.hash(alterKontext));
  assert.notEqual(B.profilHash(profil), B.hash(alterKontext));
  assert.notEqual(B.profilHash(profil), B.profilHash({ ...profil, deputyCommittees: ["Finanzausschuss"] }));
});
// Sichtbare Kompatibilitaetsgrenze, keine gruene Veroeffentlichungsabnahme:
// Der bestehende Leser weist ein unter dem alten Kontext gebundenes Paket ab.
(async () => {
  const B = require("../lib/helmut/briefing-speicher");
  const alterKontext = { ...Q.profilKontext(profil) }; delete alterKontext.stellvertretende_ausschuesse;
  const day = "2026-09-13", userId = profil.id;
  const briefing = { available: true, items: [] }, lage = {};
  const alt = { id: `bf-${userId}-mandatsbriefing-${day}`, user_id: userId, slot: "mandatsbriefing",
    payload: { version: 1, mandat: userId, tag: day, briefing, lage,
      inhaltHash: B.hash({ briefing, lage }), profilHash: B.hash(alterKontext) } };
  const vorher = structuredClone(alt);
  const mock = { assertTenant: id => assert.equal(id, userId),
    getRenderedBriefingV3: async () => structuredClone(alt) };
  await assert.rejects(B.lese({ userId, day, profile: profil, storage: mock }), /briefing-nachweis-abweichend/);
  assert.deepEqual(alt, vorher);
  bestanden++;
  console.log("BELEGT Kompatibilitaetsgrenze: alter Profilhash wird abgewiesen, gespeicherter Beleg bleibt erhalten.");
  console.log(`${bestanden}/10 synthetische Diagnosegruppen erfolgreich. Keine fachliche oder Veroeffentlichungsabnahme.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
