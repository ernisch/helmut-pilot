"use strict";
const A = require("node:assert/strict"), F = require("node:fs"), P = require("node:path"), O = require("node:os");
const E = require("./aussagenabdeckung-eingang");
let pass = 0;
function test(name, fn) { fn(); pass++; console.log("PASS " + name); }
const answer = p => ({ quellen: E.block(p).faelle.map(f => ({ id: f.id, beleg: f.quelle.text,
  aussagen: f.referenz.map(r => Object.fromEntries(E.FELDER.map(k => [k, r[k][0]]))) })) });
test("18 unveraenderte Originale mit 39 vorab getrennten Teilbehauptungen", () => {
  const m = E.korpus(), alt = require("./fixtures/quellenfakten-korpus.json");
  A.equal(m.faelle.reduce((n, f) => n + f.referenz.length, 0), 39);
  for (const f of m.faelle) A.deepEqual(f.quelle, alt.faelle.find(a => a.id === f.id).quelle);
  for (let p = 1; p <= 6; p++) {
    const b = E.block(p); A(!b.prompt.includes("referenz")); A(!b.prompt.includes("nachweis"));
    const r = E.pruefe(p, answer(p)); A(r.referenzgleich); A.equal(r.produktpfadeGeprueft, 0);
    A.equal(r.unabhaengigFreigegeben, false); A.equal(r.vollstaendigeFaktenpruefung, false);
  }
});
test("Ein Tupel plus ganzer Originaltext verdeckt verlorene Nebenbehauptungen nicht", () => {
  const a = answer(1); a.quellen.forEach(q => { q.aussagen = q.aussagen.slice(0, 1); });
  const r = E.pruefe(1, a); A.equal(r.referenzgleich, false);
  A.equal(r.abweichungen.filter(x => x.typ === "aussage-fehlt").length, 4);
});
test("Artikelvariation ist vorab zulaessig, fehlende Berechtigte und Bedingung bleiben Fehler", () => {
  const a = answer(1); a.quellen[0].aussagen[0].akteur = "Der Stadtrat";
  A(E.pruefe(1, a).referenzgleich); A.equal(E.pruefe(1, a).varianten.length, 1);
  a.quellen[0].aussagen[1].adressat = null; a.quellen[0].aussagen[1].bedingung = null;
  const r = E.pruefe(1, a); A.equal(r.referenzgleich, false);
  A(r.abweichungen.some(x => x.feld === "adressat" && x.typ === "angabe-fehlt"));
  A(r.abweichungen.some(x => x.feld === "bedingung" && x.typ === "angabe-fehlt"));
});
test("Moegliches Entfallen und ausstehende Klaerung bleiben eigenstaendig erforderlich", () => {
  const a = answer(1); a.quellen[1].aussagen[0].handlung = null;
  a.quellen[2].aussagen.pop(); const r = E.pruefe(1, a);
  A(r.abweichungen.some(x => x.id === "f02" && x.feld === "handlung"));
  A(r.abweichungen.some(x => x.id === "f03" && x.typ === "aussage-fehlt"));
});
test("Negation muss an der bestrittenen Aussage bleiben, nicht irgendwo im Quelltext", () => {
  const a = answer(1); a.quellen[2].aussagen[1].verneinung = null;
  a.quellen[2].aussagen[0].verneinung = "bestreitet";
  const r = E.pruefe(1, a); A.equal(r.referenzgleich, false);
  A(r.abweichungen.filter(x => x.feld === "verneinung").length >= 2);
});
test("Reihenfolge beliebig, eine Aussage darf nie zwei Referenzen abdecken", () => {
  const a = answer(4); a.quellen.reverse(); a.quellen.forEach(q => q.aussagen.reverse());
  A(E.pruefe(4, a).referenzgleich);
  const b = answer(4); b.quellen[0].aussagen[2] = structuredClone(b.quellen[0].aussagen[1]);
  A.equal(E.pruefe(4, b).referenzgleich, false);
});
test("Zwei Termine duerfen Ort und Datum nicht tauschen; Publikationsdatum wird nicht Ereignisdatum", () => {
  const a = answer(4); a.quellen[0].aussagen[1].ort = "Kiel"; a.quellen[0].aussagen[2].ort = "Bonn";
  A.equal(E.pruefe(4, a).referenzgleich, false);
  const b = answer(4); b.quellen[1].aussagen[0].zeit = "20. September 2026";
  A.equal(E.pruefe(4, b).referenzgleich, false);
});
test("Sprecher und Adressat sind nicht durch gemeinsame Originalwoerter austauschbar", () => {
  const a = answer(3); a.quellen[0].aussagen[0].akteur = "Verbands B";
  a.quellen[0].aussagen[0].adressat = "Verband A";
  A.equal(E.pruefe(3, a).referenzgleich, false);
});
test("Bedingung, Modalitaet und eigene Frist bleiben gemeinsam gebunden", () => {
  for (const feld of ["bedingung", "aussagegrad", "zeit"]) {
    const a = answer(6); a.quellen[0].aussagen[0][feld] = null;
    A.equal(E.pruefe(6, a).referenzgleich, false);
  }
  const b = answer(6); b.quellen[1].aussagen[0].adressat = "Abgeordnete";
  A.equal(E.pruefe(6, b).referenzgleich, false);
});
test("Unbekannte Grundlagen und ausdruecklicher fehlender Vorsitz werden nicht positiv aufgefuellt", () => {
  const a = answer(5); a.quellen[0].aussagen[0].handlung = "Vorsitz";
  A.equal(E.pruefe(5, a).referenzgleich, false);
  const b = answer(5); b.quellen[2].aussagen[1].verneinung = null;
  A.equal(E.pruefe(5, b).referenzgleich, false);
});
test("Fremde Quelle, freier Text, selbst erteilte Freigabe und zu grosse Antwort scheitern", () => {
  for (const mutate of [a => { a.quellen[0].id = "fremd"; },
    a => { a.quellen[0].beleg += " erfunden"; },
    a => { a.quellen[0].aussagen[0].wirkung = "Neue Steuer"; },
    a => { a.trustedFreigaben = true; },
    a => { a.quellen[0].aussagen = Array(9).fill(a.quellen[0].aussagen[0]); }]) {
    const a = answer(1); mutate(a); A.throws(() => E.pruefe(1, a));
  }
});
test("Leere Ausgabe, fremde Zusatzbehauptung und nur Originalzitate sind kein positiver Nutzwert", () => {
  const a = answer(1); a.quellen[0].aussagen = []; A.equal(E.pruefe(1, a).referenzgleich, false);
  const b = answer(1); b.quellen[0].aussagen.push(structuredClone(b.quellen[0].aussagen[0]));
  A(E.pruefe(1, b).abweichungen.some(x => x.typ === "zusaetzliche-aussage"));
  const c = answer(1); for (const row of c.quellen[0].aussagen) for (const k of E.FELDER) row[k] = c.quellen[0].beleg;
  A.equal(E.pruefe(1, c).referenzgleich, false);
});
test("Dateiruecklesung erhaelt Einzelbehauptungen ohne produktive Freigabe", () => {
  const dir = F.mkdtempSync(P.join(O.tmpdir(), "helmut-abdeckung-"));
  try {
    const file = P.join(dir, "beleg.json"), a = answer(1);
    F.writeFileSync(file, JSON.stringify(a)); const r = E.pruefe(1, JSON.parse(F.readFileSync(file)));
    A(r.referenzgleich); A.equal(r.fachlichBestanden, false);
    A.equal(r.bilanz.reduce((s, r) => s + r.referenzgleich, 0), 7);
  } finally { F.rmSync(dir, { recursive: true, force: true }); }
});
console.log(`${pass}/${pass} Aussagenabdeckung Gruppen bestanden; keine Produktpfadabnahme.`);
