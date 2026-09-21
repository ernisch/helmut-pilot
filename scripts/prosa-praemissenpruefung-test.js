"use strict";
const A = require("node:assert/strict");
const P = require("../lib/helmut/prosa-praemissenpruefung");
const F = require("./fixtures/prosa-praemissen");
const V = require("./prosa-praemissen-versuch");
const { hash } = require("../lib/helmut/briefing-speicher");
let count = 0;
function test(name, fn) { fn(); count++; console.log("PASS " + name); }
function antwort(v, urteil = "tragfaehig") {
  const e = v.eingabe();
  return { version: 1, eingabeHash: e.eingabeHash, faelle: e.faelle.map(f => ({ id: f.id,
    praemissen: f.saetze.map(s => ({ satz: s.index, behauptung: "Technischer Testbeleg, kein semantisches Urteil.",
      art: "sachangabe", befund: urteil === "tragfaehig" ? "getragen" : urteil,
      belege: [{ referenz: f.quellen[0].id, zitat: f.quellen[0].text }] })),
    urteil, begruendung: "Injizierter technischer Test. Keine gemessene Modellleistung." })) };
}
const rows = () => F.gruppen()[0].map(r => r.eingabe);
test("Jede der sechs Fachklassen hat positiven, negativen und unklaren Sollfall", () => {
  const corpus = F.corpus(); A.equal(corpus.length, 18);
  A.equal(new Set(corpus.map(x => x.eingabe.id)).size, 18);
  for (const k of new Set(corpus.map(x => x.klasse)))
    A.deepEqual(corpus.filter(x => x.klasse === k).map(x => x.art), ["positiv", "negativ", "unklar"]);
  for (const g of F.gruppen()) {
    A.equal(g.length, 6);
    for (const art of ["positiv", "negativ", "unklar"]) A.equal(g.filter(x => x.art === art).length, 2);
  }
});
test("Zwei bekannte falsche Positivurteile bleiben als negative Referenz erhalten", () => {
  const rs = F.corpus().filter(x => x.begruendung.includes("Run35575743755"));
  A.equal(rs.length, 2); A(rs.every(x => x.erwartet === "offen"));
  A(rs.some(x => x.eingabe.einordnung.includes("prioritätlich verschoben")));
  A(rs.some(x => x.eingabe.einordnung.includes("Minderheitenvorschlag")));
});
test("Sollurteile und Fallklassen gelangen nicht in die Anbieterpayload", () => {
  for (const g of F.gruppen()) {
    const v = P.binde(g.map(x => x.eingabe)), prompt = P.prompt(v);
    const sent = JSON.parse(prompt.split("PRUEFEINGABE: ")[1]);
    A.equal(sent.faelle.length, 6);
    for (const f of sent.faelle) for (const k of ["erwartet", "klasse", "art", "begruendung", "gruppe"])
      A.equal(Object.hasOwn(f, k), false);
    for (const r of g) A.equal(prompt.includes(r.begruendung), false);
  }
});
test("Zusatzfelder mit Sollurteilen werden vor dem Anbieterauftrag abgelehnt", () => {
  const r = rows(); r[0].erwartet = "tragfaehig"; A.throws(() => P.binde(r), /fall/);
});
test("Bindung kopiert Quellen, Profil und Entwurf vor externen Aenderungen", () => {
  const r = rows(), v = P.binde(r), before = v.eingabe();
  r[0].quellen[0].text = "geaendert"; const copy = v.eingabe(); copy.faelle[0].profil[0].text = "anderes Profil";
  A.deepEqual(v.eingabe(), before);
  A.notEqual(P.binde(r).eingabeHash, v.eingabeHash);
});
test("Alle Urteile gebunden, aber keine unabhaengige Bedeutungsfreigabe", () => {
  const v = P.binde(rows()), a = antwort(v), out = v.pruefe(a);
  A.equal(out.urteile.length, 6); A.equal(out.antwortHash, hash(a));
  A.equal(out.bedeutungUnabhaengigBewiesen, false); A.equal(out.produktabnahme, false);
});
test("Fremder Hash oder Schemaumfang kann nicht als Review gelten", () => {
  for (const change of [a => a.eingabeHash = "a".repeat(64), a => a.version = 2,
    a => a.faelle.pop(), a => a.freigabe = true]) {
    const v = P.binde(rows()), a = antwort(v); change(a); A.throws(() => v.pruefe(a));
  }
});
test("Unbekannte, doppelte und ausgelassene Fallkennungen werden abgelehnt", () => {
  for (const duplicate of [true, false]) {
    const v = P.binde(rows()), a = antwort(v); a.faelle[1].id = duplicate ? a.faelle[0].id : "fremd";
    A.throws(() => v.pruefe(a));
  }
});
test("Belege aus fremdem Fall werden auch bei gleichem Wortlaut abgelehnt", () => {
  const v = P.binde(rows()), a = antwort(v);
  a.faelle[0].praemissen[0].belege = a.faelle[1].praemissen[0].belege;
  A.throws(() => v.pruefe(a), /beleg/);
});
test("Erfundene, veraenderte und bedeutungslose Kurzbelege sind kein Originalzitat", () => {
  for (const q of ["Nicht in dieser Quelle.", "D", ""]) {
    const v = P.binde(rows()), a = antwort(v); a.faelle[0].praemissen[0].belege[0].zitat = q;
    A.throws(() => v.pruefe(a), /beleg/);
  }
});
test("Fehlender Beleg kann eine angeblich getragene Sachpraemisse nicht stuetzen", () => {
  const v = P.binde(rows()), a = antwort(v); a.faelle[0].praemissen[0].belege = [];
  A.throws(() => v.pruefe(a), /beleg-fehlt/);
});
test("Selbst erkannte offene oder widerlegte Praemisse sperrt positives Gesamturteil", () => {
  for (const befund of ["offen", "widersprochen"]) {
    const v = P.binde(rows()), a = antwort(v); a.faelle[0].praemissen[0].befund = befund;
    A.throws(() => v.pruefe(a), /widerspruch/);
  }
});
test("Sachangabe, Befugnis und Fachbezug sind nicht pauschal reine Vorschlaege", () => {
  for (const art of ["sachangabe", "befugnis", "fachbezug"]) {
    const v = P.binde(rows()), a = antwort(v), p = a.faelle[0].praemissen[0];
    p.art = art; p.befund = "keineTatsachenbehauptung";
    A.throws(() => v.pruefe(a), /tatsache-als-vorschlag/);
  }
});
test("Unbelegter Fall darf ehrlich offen bleiben", () => {
  const v = P.binde(rows()), a = antwort(v, "offen");
  for (const f of a.faelle) for (const p of f.praemissen) p.belege = [];
  A(v.pruefe(a).urteile.every(x => x.urteil === "offen"));
});
test("Jeder ganze Satz verlangt eine Pruefzeile; ein guter erster Satz heilt den zweiten nicht", () => {
  const r = rows(); r[0].einordnung = "Die Verwaltung berichtet. Die Bewilligung ist sicher.";
  const v = P.binde(r), a = antwort(v); A.equal(a.faelle[0].praemissen.length, 2);
  a.faelle[0].praemissen.pop(); A.throws(() => v.pruefe(a), /satz-fehlt/);
});
test("Fremde Satznummer und leere Voraussetzung werden nicht akzeptiert", () => {
  for (const edit of [p => p.satz = 99, p => p.behauptung = "", p => p.art = "egal"]) {
    const v = P.binde(rows()), a = antwort(v); edit(a.faelle[0].praemissen[0]); A.throws(() => v.pruefe(a));
  }
});
test("Vergleich erkennt falsch positive und falsch negative Urteile getrennt", () => {
  const g = F.gruppen()[0];
  let out = V.auswertung(g, { urteile: g.map(x => ({ id: x.eingabe.id, urteil: "tragfaehig" })) });
  A.equal(out.filter(x => x.falschPositiv).length, 4); A.equal(out.filter(x => x.bestanden).length, 2);
  out = V.auswertung(g, { urteile: g.map(x => ({ id: x.eingabe.id, urteil: "offen" })) });
  A.equal(out.filter(x => x.falschNegativ).length, 2); A.equal(out.filter(x => x.bestanden).length, 2);
});
test("Aenderung eines eingefrorenen Sollurteils aendert die Paketbindung", () => {
  const p = V.paket(), copy = structuredClone(p.gruppen); copy[0][0].erwartet = "anderes";
  A.notEqual(hash(copy), hash(p.gruppen)); A.equal(V.MAX_COST, 3 * 212000);
  A.equal(p.prompts.length, 3); A.equal(F.corpus().length, 18);
});
console.log(`${count}/${count} technische Vertragsgruppen; keine semantische Modellabnahme.`);
