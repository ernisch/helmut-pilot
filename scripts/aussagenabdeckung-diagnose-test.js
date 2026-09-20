"use strict";
const A = require("node:assert/strict"), E = require("./aussagenabdeckung-eingang");
const D = require("./aussagenabdeckung-diagnose");
const basis = () => ({quellen:E.block(1).faelle.map(f => ({id:f.id,beleg:f.quelle.text,
  aussagen:f.referenz.map(r => Object.fromEntries(Object.entries(r).filter(([k])=>k!=="nachweis").map(([k,v])=>[k,v[0]])))}))});
let passed=0;
function test(name,fn) {fn();passed++;console.log("PASS "+name);}
test("Kennungsfehler verdeckt weitere ungebundene Werte nicht",()=>{
  const a=basis(); for(const q of a.quellen) {q.id="q-"+q.id;for(const s of q.aussagen)s.aussagegrad="kein Originalwort";}
  const vorher=JSON.stringify(a),r=D.diagnostiziere(1,a);
  A.equal(r.fehler.filter(e=>e.typ==="kennung-fremd").length,3);
  A.equal(r.fehler.filter(e=>e.typ==="keine-originalspanne").length,7);
  A.equal(r.fehler.filter(e=>e.typ==="sollkennung-fehlt").length,3);
  A.equal(r.quellen.every(q=>q.zuordnungNurDiagnose&&q.originalExakt),true);
  A.equal(r.urspruenglicherFehler,"ABDECKUNG_QUELLBINDUNG");A.equal(JSON.stringify(a),vorher);
});
test("Passender Text ersetzt weder Kennung noch fachliche Abnahme",()=>{
  const r=D.diagnostiziere(1,basis());A.equal(r.fehler.length,0);
  A.equal(r.akzeptiert,false);A.equal(r.vollstaendigeFaktenpruefung,false);
  A.equal(r.automatischeBedeutungsbewertung,false);
  A.equal(r.quellen.every(q=>q.bedeutungsabdeckung==="nicht-automatisch-beurteilt"),true);
});
test("Widersprechender Originalzusatz bleibt sichtbar und wird nicht normalisiert",()=>{
  const a=basis();a.quellen[0].beleg+=" Diese Darstellung wird bestritten.";
  const r=D.diagnostiziere(1,a);A.equal(r.quellen[0].originalExakt,false);
  A(r.fehler.some(e=>e.typ==="original-abweichend"));A(r.fehler.some(e=>e.typ==="original-fehlt"));
});
test("Doppelte Quellen koennen fehlenden dritten Originaltext nicht ersetzen",()=>{
  const a=basis();a.quellen[2]=structuredClone(a.quellen[0]);const r=D.diagnostiziere(1,a);
  A(r.fehler.some(e=>e.typ==="kennung-doppelt"));A(r.fehler.some(e=>e.typ==="original-fehlt"&&e.id==="f03"));
});
test("Fehlende Aussage wird nicht aus gleicher Satzanzahl oder ganzen Zitaten freigegeben",()=>{
  const a=basis();a.quellen[0].aussagen.pop();const r=D.diagnostiziere(1,a);
  A.equal(r.quellen[0].sollAussagen,2);A.equal(r.quellen[0].gelieferteAussagen,1);
  A.equal(r.urspruenglicherVergleich.referenzgleich,false);A.equal(r.akzeptiert,false);
});
test("Unbekannte Struktur und nichttextuelle Werte werden diagnostiziert",()=>{
  A.deepEqual(D.diagnostiziere(1,{quellen:null}).fehler,[{typ:"antwortschema"}]);
  const a=basis();a.quellen[0].aussagen[0].handlung={text:"beschließt"};
  A(D.diagnostiziere(1,a).fehler.some(e=>e.feld==="handlung"&&e.typ==="keine-originalspanne"));
});
test("Fixer Referenztreffer kann die Beziehung dadurch verlieren und bleibt ohne Fachfreigabe",()=>{
  const a=basis();a.quellen[0].aussagen[1].wirkung="um 20 Euro";
  A.equal(JSON.stringify(a.quellen[0].aussagen).includes("dadurch"),false);
  const r=D.diagnostiziere(1,a);
  A.equal(r.urspruenglicherVergleich.referenzgleich,true);
  A.equal(r.akzeptiert,false);A.equal(r.vollstaendigeFaktenpruefung,false);
});
console.log(`${passed}/${passed} Diagnosegruppen bestanden; keine Fachfreigabe.`);
