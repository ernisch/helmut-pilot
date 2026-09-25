"use strict";
// Gelieferte oeffentliche RSS-Texte aus dem freigegebenen 30er Lauf, 25.09.2026.
const A = require("node:assert/strict"), V = require("../lib/helmut/vorgang-identity");
const F = require("./fixtures/vorgangs-frische30.json");
const bund = F.find(x => x.fall === "bundestag").documents;
const praes = F.find(x => x.fall === "praesident").documents;
const neu = praes.filter(x => x.published_at >= "2026-09-24");
const alt = praes.filter(x => x.published_at < "2026-09-24");
let n = 0;
function test(name, fn) { fn(); console.log("PASS " + name); n++; }
test("Fruehstartrente und Tankrabatt bleiben getrennt; beide Tankrabattquellen bleiben zusammen", () => {
  for (const reihenfolge of [bund, [...bund].reverse(), [bund[1],bund[0],bund[2]]]) {
    A.deepEqual(V.clusterRawDocuments(reihenfolge).map(c => c.documents.map(d => d.id).sort()).sort(),
      [[bund[0].id], [bund[1].id,bund[2].id].sort()].sort());
  }
  for (const d of bund.slice(1)) {
    A.equal(V.docsShareEvent(bund[0],d).gleich,false);
    A.equal(V.docsShareEvent(d,bund[0]).gleich,false);
    A.equal(V.sameVorgang({documents:[bund[0]]},{documents:[d]}).gleich,false);
  }
});
test("Trump-Xi-Besuch erbt nicht den thematisch gemischten Praesidentenbestand", () => {
  const r=V.sameVorgang({documents:neu},{documents:alt});
  A.equal(r.gleich,false); A.equal(r.grund,"schwacher-kern-ohne-ereignisbeleg");
  A.equal(r.spur.ueberdeckung.spezifischeFamilien,1);
  A.equal(V.clusterRawDocuments(neu).length,1);
});
test("Folgemeldung zum selben Staatsbesuch bleibt am belegten Besuch", () => {
  A.equal(V.sameVorgang({documents:[neu[2]]},{documents:neu.slice(0,2)}).gleich,true);
});
test("Institution allein ersetzt auch bei anderen Parlamenten kein Sachthema", () => {
  for(const institution of ["Bundestag","Bundesrat","Landtag","Parlament"]) {
    const a={title:institution+" berät Frühstartrente",summary:"Die Bundesregierung erläutert ihre Rentenpläne."};
    const b={title:institution+" berät Tankrabatt",summary:"Die Bundesregierung erläutert ihre Tankförderung."};
    A.equal(V.docsShareEvent(a,b).gleich,false,institution);
  }
});
console.log(n+"/4 Fallgruppen bestanden; keine Modelle oder Production-Verbindung.");
