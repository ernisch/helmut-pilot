"use strict";
// Synthetische Quellen, kein Abruf. Neue Gegenprobe fuer abgeschnittene
// Bedingungen/Verneinungen und die abweichende globale Speicherprojektion.
const A = require("node:assert/strict");
const D = require("../lib/helmut/dedup");
const G = require("../lib/helmut/quellenarchitektur/dedup-global");
const item = title => ({ title, url:"https://example.org/synthetischer-titel",
  summary:"Der Ausschuss hat die Vorlage noch nicht abschliessend beraten." });
let n = 0;
function test(name,fn) { fn(); n++; console.log("PASS " + name); }
test("Verneinung und Voraussetzung hinter der Speichergrenze werden nicht abgeschnitten", () => {
  for (const ending of [" wurde nicht beschlossen."," gilt nur, falls die Finanzierung gesichert ist."]) {
    const d = item("Beratungsangebote ".repeat(18) + ending);
    const r = D.toRawDocumentRow(d);
    A.equal(r.title,null); A.equal(r.summary,d.summary);
    for (const input of [d,r]) {
      const g = G.planDedupWrites([input]).persists[0];
      A.equal(g.title,null); A.equal(g.summary,d.summary);
    }
    A.equal(d.title.endsWith(ending),true);
  }
});
test("Ein ganzer Titel genau an der Grenze sowie kurze Negationen bleiben erhalten", () => {
  for (const title of ["Der Zuschuss wurde nicht beschlossen.","x".repeat(300)]) {
    const d = item(title),r = D.toRawDocumentRow(d);
    A.equal(r.title,title);
    A.equal(G.planDedupWrites([d]).persists[0].title,title);
    A.equal(G.planDedupWrites([r]).persists[0].title,title);
  }
});
test("Fehlende oder untypisierte Titel werden nicht in neue Textbehauptungen verwandelt", () => {
  for (const title of [undefined,null,"", "   ",{text:"Falsches Format"}]) {
    A.equal(D.toRawDocumentRow(item(title)).title,null);
    A.equal(G.planDedupWrites([item(title)]).persists[0].title,null);
  }
});
console.log(`${n}/${n} Gruppen erfolgreich; historische Titel werden nicht rekonstruiert.`);
