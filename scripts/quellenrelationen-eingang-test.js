"use strict";
const A=require("node:assert/strict"),E=require("./quellenrelationen-eingang"),R=require("./quellenrelationen");
const Alt=require("./aussagenabdeckung-eingang");
const answer=p=>({quellen:E.block(p).faelle.map(f=>({id:f.id,knoten:structuredClone(f.referenz.knoten),relationen:structuredClone(f.referenz.relationen)}))});
let pass=0;function test(name,fn){fn();pass++;console.log("PASS "+name);}
for(let p=1;p<=6;p++)test("Block"+p+" vollstaendig gemessen ohne Referenzen im Prompt",()=>{
  const b=E.block(p),r=E.pruefe(p,answer(p));
  A.equal(r.referenzgleich,true);A.equal(r.bilanz.length,3);
  A.equal(r.fachlichBestanden,false);A.equal(r.produktpfadeGeprueft,0);
  for(const f of b.faelle){A(b.prompt.includes(f.quelle.text));
    for(const grund of f.begruendungen)A.equal(b.prompt.includes(grund),false);
    A.equal(r.diagnosen.find(d=>d.quelleId===f.id).referenzbedarfOffen.length,0);}
  A.equal(b.promptHash,R.sha(b.prompt));
});
test("Alte sieben Referenztreffer ueberstehen den bekannten Kausalverlust; neue Messung sieht ihn",()=>{
  const old={quellen:Alt.block(1).faelle.map(f=>({id:f.id,beleg:f.quelle.text,
    aussagen:f.referenz.map(r=>Object.fromEntries(Alt.FELDER.map(k=>[k,r[k][0]])))}))};
  old.quellen[0].aussagen[1].wirkung="um 20 Euro";
  A.equal(JSON.stringify(old.quellen[0].aussagen).includes("dadurch"),false);
  A.equal(Alt.pruefe(1,old).referenzgleich,true);
  const a=answer(1),q=a.quellen[0];q.relationen.shift();
  const used=new Set(q.relationen.flatMap(r=>[r.von,r.nach]));q.knoten=q.knoten.filter(n=>used.has(n.id));
  const r=E.pruefe(1,a);A.equal(r.referenzgleich,false);
  A.equal(r.diagnosen[0].fehlend[0].relation.typ,"ursache");
});
test("Fremde und doppelte Quellkennungen, fehlende Quellen und freie Labels stoppen",()=>{
  for(const mutate of [a=>{a.quellen[0].id="q-f01";},a=>{a.quellen[0].id=a.quellen[1].id;},
    a=>a.quellen.pop(),a=>{a.quellen[0].relationen[0].typ="bestanden";},
    a=>{a.quellen[0].knoten[0].spanne.text="Erfunden";},a=>{a.quellen[0].faktenFreigegeben=true;}]){
    const a=answer(1);mutate(a);A.throws(()=>E.pruefe(1,a));
  }
});
test("Ganze Zitate als alle Knoten koennen passende Beziehungen nicht ersetzen",()=>{
  const a=answer(1),b=E.block(1);
  for(let i=0;i<3;i++)for(const n of a.quellen[i].knoten)n.spanne=R.fundstelle(b.faelle[i].quelle.text,b.faelle[i].quelle.text);
  const r=E.pruefe(1,a);A.equal(r.referenzgleich,false);A(r.diagnosen.every(d=>d.fehlend.length>0));
});
test("Quellenreihenfolge und frei gewaehlte Kennungen innerhalb einer Quelle sind irrelevant",()=>{
  const a=answer(1);a.quellen.reverse();
  A.equal(E.pruefe(1,a).referenzgleich,true);
  const q=a.quellen[0],alt=q.knoten[0].id;q.knoten[0].id="unabhaengige-id";
  for(const r of q.relationen){if(r.von===alt)r.von="unabhaengige-id";if(r.nach===alt)r.nach="unabhaengige-id";}
  A.equal(E.pruefe(1,a).referenzgleich,true);
});
console.log(`${pass}/${pass} Eingangsgruppen bestanden; keine Fachfreigabe.`);
