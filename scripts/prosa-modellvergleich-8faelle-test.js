"use strict";

// Gezielte Abnahme des 8-Fall-Modellvergleichs. Kein Modellaufruf, kein Netz,
// keine Productiondaten. Geprueft werden ausschliesslich die durch diesen Sprint
// eingefuehrten Aenderungen: 8-Fall-Grenze, 9-Fall-Ablehnung, strenge
// Referenzbindung, Trennung von Sollurteilen und Modellpayload sowie die
// Einmal-/Kostendeckelung des vorbereiteten Ausfuehrers.
const A = require("node:assert/strict");
const P = require("../lib/helmut/prosa-praemissenpruefung");
const R = require("../lib/helmut/prosa-praemissenreferenzen");
const F = require("./fixtures/prosa-modellvergleich-8faelle");
const V = require("./prosa-modellvergleich-8faelle-versuch");

let count = 0;
function test(name, fn) { fn(); count++; console.log("PASS " + name); }

test("acht neue Sollfaelle: sechs negativ und zwei positiv", () => {
  const c = F.corpus();
  A.equal(c.length, 8);
  A.equal(c.filter(r => r.art === "negativ" && r.erwartet === "widersprochen").length, 6);
  A.equal(c.filter(r => r.art === "positiv" && r.erwartet === "tragfaehig").length, 2);
});

test("Kennungen sind eindeutig und verwenden den neuen Namensraum (kein Altbestand)", () => {
  const c = F.corpus();
  A.equal(new Set(c.map(r => r.eingabe.id)).size, 8);
  for (const r of c) {
    A.equal(r.eingabe.id.startsWith("m"), true, "Kennung traegt nicht das neue Praefix m");
    A.ok(r.eingabe.id.length <= 60);
  }
  const refs = c.flatMap(r => [...r.eingabe.quellen, ...r.eingabe.profil].map(x => x.id));
  A.equal(new Set(refs).size, 16, "Quellen-/Profilkennungen sind nicht global eindeutig");
});

test("acht Faelle werden akzeptiert und gebunden", () => {
  const v = P.binde(F.eingaben());
  A.equal(v.eingabe().faelle.length, 8);
  A.equal(v.eingabeHash.length, 64);
});

test("neun Faelle werden weiterhin abgelehnt (fail closed)", () => {
  const neun = F.eingaben().concat([{ id: "extra-fall",
    quellen: [{ id: "extra-fall-q", text: "Zusaetzlicher Fall." }],
    profil: [{ id: "extra-fall-p", text: "Profil." }],
    mandatsbezug: "Zusatz", einordnung: "Ein weiterer Satz." }]);
  A.throws(() => P.binde(neun), /praemissenpruefung-eingabe/);
});

test("Referenzbindung bleibt streng: nur ganze eigene Originalstellen als Belege", () => {
  const v = P.binde(F.eingaben());
  const s = R.schema(v);
  A.equal(s.properties.faelle.items.anyOf.length, 8);
  for (const [i, f] of v.eingabe().faelle.entries()) {
    const fall = s.properties.faelle.items.anyOf[i];
    const refs = fall.properties.praemissen.items.properties.belege.items.anyOf;
    const erlaubt = new Set(refs.map(x => x.properties.referenz.enum[0]));
    A.equal(erlaubt.has(f.id), false, "Fallkennung ist eine Belegreferenz");
    for (const r of [...f.quellen, ...f.profil]) {
      A.equal(erlaubt.has(r.id), true);
      const zitate = refs.filter(x => x.properties.referenz.enum[0] === r.id)
        .map(x => x.properties.zitat.enum);
      A.deepEqual(zitate, [[r.text]]);
    }
  }
});

test("Sollurteile und Begruendungen sind vom Modellpayload getrennt", () => {
  const c = F.corpus();
  for (const r of c) {
    A.equal(Object.hasOwn(r.eingabe, "erwartet"), false);
    A.equal(Object.hasOwn(r.eingabe, "begruendung"), false);
    A.equal(Object.hasOwn(r.eingabe, "klasse"), false);
    A.equal(Object.hasOwn(r.eingabe, "art"), false);
  }
  const prompt = V.paket().prompt;
  for (const r of c) {
    A.equal(prompt.includes(r.begruendung), false, "Begruendung erscheint im Prompt");
  }
});

test("Ausfuehrer ist auf genau einen Aufruf und 0,212 USD gedeckelt", () => {
  A.equal(V.MAX_COST, 212000);
  A.equal(V.BRANCH, "codex/prosa-modellvergleich-8faelle-20260921");
  const p = V.paket();
  A.equal(p.faelle.length, 8);
  A.equal(V.paket().paketHash, p.paketHash, "paketHash ist nicht stabil (eingefroren)");
});

test("Auswertung verlangt exakt 8 von 8; ein falscher Fall macht nicht bestanden", () => {
  const c = F.corpus();
  const alleRichtig = c.map(r => ({ id: r.eingabe.id, urteil: r.erwartet }));
  const b1 = V.auswertung(c, { urteile: alleRichtig });
  A.equal(b1.length, 8);
  A.equal(b1.every(x => x.bestanden), true);
  const einFalsch = alleRichtig.map((x, i) => i === 0
    ? { ...x, urteil: c[0].erwartet === "widersprochen" ? "tragfaehig" : "widersprochen" } : x);
  const b2 = V.auswertung(c, { urteile: einFalsch });
  A.equal(b2.filter(x => !x.bestanden).length, 1);
  A.equal(b2.every(x => x.bestanden), false);
});

console.log(`${count}/${count} Modellvergleich-8-Faelle-Tests bestanden; keine Modellabnahme, keine Productionwirkung.`);
