"use strict";
const A = require("node:assert/strict"), M = require("./quellenfakten-eingang");
let pass = 0;
function test(n, f) { f(); pass++; console.log("PASS " + n); }
const answer = p => ({ kandidaten: M.block(p).faelle.map(f => ({ id: f.id, beleg: f.quelle.text, ...f.soll })) });
for (let p = 1; p <= 6; p++) test(`Klasse ${p}: drei Originalquellen mit eigener Annotation, keine Produktfreigabe`, () => {
  const b = M.block(p), a = answer(p), r = M.pruefe(p, a);
  A.equal(r.annotationsgleich, true); A.equal(r.fachlichBestanden, false);
  A.equal(r.unabhaengigFreigegeben, false); A.equal(r.produktpfadeGeprueft, 0);
  A.equal(r.vollstaendigeFaktenpruefung, false);
  const input = JSON.parse(b.prompt.split("\n").at(-1));
  A.equal(input.length, 3); A(input.every(f => !Object.hasOwn(f, "soll") && !Object.hasOwn(f, "klasse")));
  A(!b.prompt.includes('"soll"')); A(!b.prompt.includes('trustedFreigaben'));
  for (const c of a.kandidaten) {
    const bad = structuredClone(a); bad.kandidaten.find(x => x.id === c.id).modus = c.modus === "offen" ? "beschlossen" : "offen";
    A.equal(M.pruefe(p, bad).annotationsgleich, false);
  }
});
test("Erfundene Werte, Freigaben, fehlende Kandidaten und entfernte Vorbehalte scheitern", () => {
  for (const mutate of [a => a.kandidaten.pop(), a => a.kandidaten.push(a.kandidaten[0]),
    a => { a.kandidaten[1] = a.kandidaten[0]; }, a => { a.kandidaten[0].beleg = a.kandidaten[0].beleg.split(".")[0]; },
    a => { a.kandidaten[0].akteur = "Erfundene Redaktion"; }, a => { a.kandidaten[0].trustedFreigaben = true; },
    a => { a.kandidaten[0].id = "fremd"; }]) {
    const a = answer(1); mutate(a); A.throws(() => M.pruefe(1, a));
  }
});
test("Echte Wortstelle bei vertauschter Rolle wird als Annotationsabweichung sichtbar", () => {
  const a = answer(3); a.kandidaten[0].akteur = "Redaktion";
  const r = M.pruefe(3, a); A.equal(r.quellenGebunden, true); A.equal(r.annotationsgleich, false);
  A(r.abweichungen.some(r => r.id === "f07" && r.feld === "akteur"));
});
test("Pauschal unbekannte Rollen verlieren die positiven Faelle", () => {
  for (let p = 1; p <= 6; p++) {
    const a = answer(p); for (const c of a.kandidaten) for (const k of M.FELDER) c[k] = null;
    A.equal(M.pruefe(p, a).annotationsgleich, false);
  }
});
test("Getrennte Kopien und unbesetzte Plaetze werden nicht beglaubigt", () => {
  const a = answer(1); delete a.kandidaten[1]; A.throws(() => M.pruefe(1, a));
  const b = M.block(1); b.faelle[0].soll.akteur = "geaendert";
  A.equal(M.pruefe(1, answer(1)).annotationsgleich, true);
});
console.log(`${pass}/${pass} Quellenkorpus Schutzgruppen bestanden; 0/36 Produktpfadfaelle geprueft.`);
