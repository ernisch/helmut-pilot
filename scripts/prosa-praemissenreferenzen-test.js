"use strict";
const A = require("node:assert/strict"), P = require("../lib/helmut/prosa-praemissenpruefung");
const R = require("../lib/helmut/prosa-praemissenreferenzen"), Alt = require("./prosa-praemissen-versuch");
const Rest = require("./prosa-restfaelle-versuch"), original = require("./fixtures/praemissen-belegantwort.json");
const rows = Rest.paket().gruppen[0], v = P.binde(rows.map(r => r.eingabe));
const accepts = (schema, id, b) => schema.properties.faelle.items.anyOf
  .filter(f => f.properties.id.enum.includes(id)).some(f =>
    f.properties.praemissen.items.properties.belege.items.anyOf.some(x =>
      x.properties.referenz.enum.includes(b.referenz) && x.properties.zitat.enum.includes(b.zitat)));
let count = 0;
function test(name, fn) { fn(); count++; console.log("PASS " + name); }
test("Alte Pakete und Sollurteile bleiben trotz neuer Ausgabebindung bytegleich", () => {
  A.equal(Alt.paket().paketHash, "8f3b9b53f720fb76cfac6ad545928fbcad5e384bc31b183ffe8a1e892e429d74");
  A.equal(Rest.paket().paketHash, "d634a32fd9225ecb26fb7df8fb72681a40932f97402426d43b5c4e70a121e4f1");
  A.equal(P.SCHEMA.properties.faelle.items.anyOf, undefined);
});
test("Exakte echte Antwort bleibt unveraendert wegen ihrer Selbstbelege abgelehnt", () => {
  A.equal(original.eingabeHash, v.eingabeHash);
  A.throws(() => v.pruefe(original), /praemissenpruefung-beleg/);
  A(original.faelle.every(f => rows.find(r => r.eingabe.id === f.id).erwartet === f.urteil));
  // Richtige Gesamtlabels sind kein bestandener vollstaendiger Vertrag.
});
test("Anbieterschema schliesst beide beobachteten Selbstreferenzen aus", () => {
  const s = R.schema(v), self = original.faelle.flatMap(f => f.praemissen.flatMap(p =>
    p.belege.filter(b => b.referenz === f.id).map(b => ({ id: f.id, b }))));
  A.equal(self.length, 2); for (const { id, b } of self) A.equal(accepts(s, id, b), false);
});
test("Nur exakte ganze Stellen desselben Falls sind im Anbieterformat auswaehlbar", () => {
  const s = R.schema(v), fs = v.eingabe().faelle;
  for (const f of fs) for (const r of [...f.quellen, ...f.profil]) {
    A(accepts(s, f.id, { referenz: r.id, zitat: r.text }));
    A(!accepts(s, f.id, { referenz: r.id, zitat: r.text.slice(0, -1) }));
    A(!accepts(s, f.id, { referenz: r.id + "fremd", zitat: r.text }));
    A(!accepts(s, fs.find(x => x.id !== f.id).id, { referenz: r.id, zitat: r.text }));
  }
});
test("Version, Eingabehash, Fallkennung und Satznummer werden an dieselbe Eingabe gebunden", () => {
  const s = R.schema(v); A.deepEqual(s.properties.version.enum, [1]);
  A.deepEqual(s.properties.eingabeHash.enum, [v.eingabeHash]);
  for (const [i, f] of v.eingabe().faelle.entries()) {
    A.deepEqual(s.properties.faelle.items.anyOf[i].properties.id.enum, [f.id]);
    A.deepEqual(s.properties.faelle.items.anyOf[i].properties.praemissen.items.properties.satz.enum,
      f.saetze.map(x => x.index));
  }
});
test("Reiner Vorschlag darf ohne Eigenzitat bleiben; Serververtrag wird nicht gelockert", () => {
  const x = structuredClone(original), input = v.eingabe();
  // Nur technischer Gegenfall. Kein neues oder nachtraeglich gueltiges Modellurteil.
  for (const f of x.faelle) for (const p of f.praemissen) {
    const refs = input.faelle.find(y => y.id === f.id);
    p.belege = p.belege.filter(b => b.referenz !== f.id).map(b => ({ ...b,
      zitat: [...refs.quellen, ...refs.profil].find(r => r.id === b.referenz).text }));
  }
  A.equal(v.pruefe(x).produktabnahme, false);
  A.equal(v.pruefe(x).bedeutungUnabhaengigBewiesen, false);
  const positive = x.faelle.find(f => f.urteil === "tragfaehig");
  positive.praemissen.find(p => p.befund === "getragen").belege = [];
  A.throws(() => v.pruefe(x), /beleg-fehlt/);
});
test("Zu lange Originalstellen scheitern vor Versand statt abgeschnitten zu werden", () => {
  const inputs = rows.map(r => structuredClone(r.eingabe)); inputs[0].quellen[0].text = "A".repeat(1201);
  const tooLong = P.binde(inputs); A.throws(() => R.schema(tooLong), /stelle-zu-lang/);
  A.throws(() => R.prompt(tooLong), /stelle-zu-lang/);
});
test("Zusatzhinweis erklaert Beleggrenze ohne Sollurteile oder neue Eingabeinhalte", () => {
  const p = R.prompt(v); A(p.includes("Fallkennung und der zu pruefende Satz sind KEINE Belegreferenzen"));
  A.deepEqual(JSON.parse(p.split("PRUEFEINGABE: ")[1]), v.eingabe());
  for (const r of rows) A(!p.includes(r.begruendung));
});
test("Ausgabeschemata sind voneinander und vom historischen Schema unabhaengig", () => {
  const before = R.schema(v), edited = R.schema(v); edited.properties.version.enum[0] = 2;
  edited.properties.faelle.items.anyOf[0].properties.id.enum[0] = "fremd";
  A.deepEqual(R.schema(v), before); A.equal(P.SCHEMA.properties.version.enum, undefined);
});
console.log(`${count}/${count} Referenzgruppen bestanden; keine semantische Modellabnahme.`);
