"use strict";

// Gezielter Schemafix-Nachweis. Kein Modellaufruf, keine historischen
// Versuchsergebnisse, keine semantische Abnahme. Der unveraenderte
// Serververtrag in prosa-praemissenpruefung.js bleibt Pflicht.
const A = require("node:assert/strict");
const P = require("../lib/helmut/prosa-praemissenpruefung");
const R = require("../lib/helmut/prosa-praemissenreferenzen");

const faelle = [
  { id: "fall-a",
    quellen: [{ id: "quelle-a1", text: "Der Ausschuss tagt am Montag." }],
    profil: [{ id: "profil-a1", text: "Mitglied im Ausschuss." }],
    mandatsbezug: "Abgeordnete A.",
    einordnung: "Der Ausschuss tagt am Montag. Die Abgeordnete ist Mitglied." },
  { id: "fall-b",
    quellen: [{ id: "quelle-b1", text: "Ein Antrag wurde gestellt." }],
    profil: [{ id: "profil-b1", text: "Federfuehrend im Verfahren." }],
    mandatsbezug: "Abgeordneter B.",
    einordnung: "Ein Antrag wurde gestellt. Der Abgeordnete ist federfuehrend." }
];
const v = P.binde(faelle);

let count = 0;
function test(name, fn) { fn(); count++; console.log("PASS " + name); }

test("freie Behauptungs- und Begruendungsfelder bleiben wirklich frei", () => {
  const s = R.schema(v);
  for (const f of s.properties.faelle.items.anyOf) {
    A.deepEqual(f.properties.praemissen.items.properties.behauptung, { type: "string" });
    A.deepEqual(f.properties.begruendung, { type: "string" });
  }
});

test("Fallkennung teilt ihren Knoten nicht mehr mit freien Feldern (kein Alias)", () => {
  const s = R.schema(v);
  for (const f of s.properties.faelle.items.anyOf) {
    A.notStrictEqual(f.properties.id, f.properties.begruendung);
    A.notStrictEqual(f.properties.id, f.properties.praemissen.items.properties.behauptung);
  }
});

test("gebundene Felder bleiben an dieselbe Eingabe gebunden", () => {
  const s = R.schema(v);
  A.deepEqual(s.properties.version.enum, [1]);
  A.deepEqual(s.properties.eingabeHash.enum, [v.eingabeHash]);
  for (const [i, f] of v.eingabe().faelle.entries()) {
    A.deepEqual(s.properties.faelle.items.anyOf[i].properties.id.enum, [f.id]);
    A.deepEqual(s.properties.faelle.items.anyOf[i].properties.praemissen.items.properties.satz.enum,
      f.saetze.map(x => x.index));
  }
});

test("Fallkennung ist keine erlaubte Belegreferenz", () => {
  const s = R.schema(v);
  for (const [i, f] of v.eingabe().faelle.entries()) {
    const refs = s.properties.faelle.items.anyOf[i]
      .properties.praemissen.items.properties.belege.items.anyOf;
    const erlaubt = new Set(refs.map(x => x.properties.referenz.enum[0]));
    A(!erlaubt.has(f.id));
    for (const r of [...f.quellen, ...f.profil]) A(erlaubt.has(r.id));
  }
});

test("nur die ganze Originalstelle ist auswaehlbar", () => {
  const s = R.schema(v);
  for (const [i, f] of v.eingabe().faelle.entries()) {
    const refs = s.properties.faelle.items.anyOf[i]
      .properties.praemissen.items.properties.belege.items.anyOf;
    for (const r of [...f.quellen, ...f.profil]) {
      const zitate = refs.filter(x => x.properties.referenz.enum[0] === r.id)
        .map(x => x.properties.zitat.enum);
      A.deepEqual(zitate, [[r.text]]);
    }
  }
});

test("zu lange Originalstellen scheitern vor Versand statt abgeschnitten zu werden", () => {
  const inputs = structuredClone(faelle); inputs[0].quellen[0].text = "A".repeat(1201);
  A.throws(() => R.schema(P.binde(inputs)), /stelle-zu-lang/);
});

test("Serververtrag bleibt unveraendert streng", () => {
  const before = R.schema(v);
  const edited = R.schema(v);
  edited.properties.version.enum[0] = 2;
  edited.properties.faelle.items.anyOf[0].properties.id.enum[0] = "fremd";
  A.deepEqual(R.schema(v), before);
  A.equal(P.SCHEMA.properties.version.enum, undefined);
  A.deepEqual(P.SCHEMA.properties.faelle.items.properties.begruendung, { type: "string" });
});

console.log(`${count}/${count} Schemafix-Tests bestanden; keine semantische Modellabnahme.`);
