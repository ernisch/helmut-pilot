"use strict";
const A = require("node:assert/strict"), E = require("./quellenrelationen-eingang");
const D = require("./quellenrelationen-diagnose");
function basis() {
  return { quellen: E.block(1).faelle.map(f => {
    const span = s => {
      let index = -1, vorkommen = -1;
      do { index = f.quelle.text.indexOf(s.text, index + 1); vorkommen++; } while (index !== s.start);
      return { text: s.text, vorkommen };
    };
    return { id: f.id, knoten: f.referenz.knoten.map(n => ({ id: n.id, spanne: span(n.spanne) })),
      relationen: f.referenz.relationen.map(r => ({ ...r, signale: r.signale.map(span) })) };
  }) };
}
let passed = 0;
function test(name, fn) { fn(); passed++; console.log("PASS " + name); }
test("Auch exakte Referenzen erhalten niemals eine Fachfreigabe", () => {
  const r = D.diagnostiziere(1, basis()); A.equal(r.fehler.length, 0);
  A.equal(r.urspruenglicherVergleich.referenzgleich, true);
  A.equal(r.akzeptiert, false); A.equal(r.automatischeBedeutungsbewertung, false);
  A.equal(r.vollstaendigeFaktenpruefung, false); A.equal(r.produktpfadeGeprueft, 0);
});
test("Unbenutzte Knoten bleiben Fehler und verdecken spaetere Quellen nicht", () => {
  const a = basis(); a.quellen[0].knoten.push({ id: "extra", spanne: { text: "Stadtrat", vorkommen: null } });
  a.quellen[2].relationen[0].signale[0].text = "nicht im Original";
  const before = JSON.stringify(a), r = D.diagnostiziere(1, a);
  A(r.fehler.some(x => x.typ === "knoten-ohne-relation" && x.quelle === 1));
  A(r.fehler.some(x => x.typ === "spanne-ungebunden" && x.quelle === 3));
  A.equal(r.quellen.length, 3); A.equal(JSON.stringify(a), before);
  A.equal(r.quellen[0].vergleich, null);
  A.equal(r.urspruenglicherFehler, "RELATIONEN_QUELLBINDUNG");
});
test("Alle ungebundenen Spannen werden ohne Normalisierung gesammelt", () => {
  const a = basis(); a.quellen[0].knoten[0].spanne.text = "DER Stadtrat";
  a.quellen[0].relationen[0].signale[0].text = "dadurch ";
  a.quellen[0].relationen[1].signale[0].text = "unbekannt";
  const r = D.diagnostiziere(1, a); A.equal(r.fehler.filter(x => x.typ === "spanne-ungebunden").length, 2);
  A.equal(r.quellen[0].vergleich, null); A(r.quellen[1].vergleich.referenzgleich);
});
test("Andere Satzgrenze bleibt ungepruefte Variante statt Tatsachenfehler", () => {
  const a = basis(); a.quellen[0].knoten[0].spanne.text += ".";
  const r = D.diagnostiziere(1, a); A.equal(r.fehler.length, 0);
  A.equal(r.quellen[0].vergleich.referenzgleich, false);
  A.equal(r.quellen[0].bedeutungsabdeckung, "nicht-automatisch-beurteilt");
});
test("Wortgebundene falsche Relation wird nicht durch Struktur akzeptiert", () => {
  const a = basis(); a.quellen[0].relationen[0].typ = "ereigniszeit";
  const r = D.diagnostiziere(1, a); A.equal(r.fehler.length, 0);
  A.equal(r.quellen[0].vergleich.referenzgleich, false); A.equal(r.akzeptiert, false);
});
test("Doppelte oder fremde Kennungen reparieren keine fehlende Quelle", () => {
  const a = basis(); a.quellen[1] = structuredClone(a.quellen[0]); a.quellen[2].id = "q-f03";
  const r = D.diagnostiziere(1, a);
  for (const typ of ["kennung-doppelt", "kennung-fremd", "sollkennung-fehlt"]) A(r.fehler.some(x => x.typ === typ));
});
test("Kaputte Knotenschemata und Relationsschemata bleiben einzeln sichtbar", () => {
  const a = basis(); a.quellen[0].knoten[0] = null; a.quellen[0].relationen[0] = null;
  const r = D.diagnostiziere(1, a);
  A(r.fehler.some(x => x.typ === "knotenschema")); A(r.fehler.some(x => x.typ === "relationsschema"));
  A.equal(r.quellen[0].vergleich, null);
});
test("Fremde Endpunkte und Selbstverweise sind keine reparierbaren Referenzen", () => {
  const a = basis(); a.quellen[0].relationen[0].nach = "fremd";
  a.quellen[1].relationen[0].nach = a.quellen[1].relationen[0].von;
  const r = D.diagnostiziere(1, a); A.equal(r.fehler.filter(x => x.typ === "relation-schema").length, 2);
});
test("Ungueltige und uebergrosse Antworten werden begrenzt abgelehnt", () => {
  for (const a of [null, { quellen: null }, { quellen: Array(25).fill(null) }])
    A.deepEqual(D.diagnostiziere(1, a).fehler, [{ typ: "antwortschema" }]);
});
console.log(`${passed}/${passed} Diagnosegruppen bestanden; keine Fachfreigabe.`);
