"use strict";
const A=require("node:assert/strict"),E=require("./quellenrelationen-eingang"),R=require("./quellenrelationen");
const Alt=require("./aussagenabdeckung-eingang");
function ausgabe(f) {
  const span=s=>{
    const starts=[];let i=-1;while((i=f.quelle.text.indexOf(s.text,i+1))!==-1)starts.push(i);
    return {text:s.text,vorkommen:starts.length===1?null:starts.indexOf(s.start)};
  };
  return {id:f.id,knoten:f.referenz.knoten.map(n=>({id:n.id,spanne:span(n.spanne)})),
    relationen:f.referenz.relationen.map(r=>({...r,signale:r.signale.map(span)}))};
}
const answer=p=>({quellen:E.block(p).faelle.map(ausgabe)});
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
  for(let i=0;i<3;i++)for(const n of a.quellen[i].knoten)n.spanne={text:b.faelle[i].quelle.text,vorkommen:null};
  const r=E.pruefe(1,a);A.equal(r.referenzgleich,false);A(r.diagnosen.every(d=>d.fehlend.length>0));
});
test("Quellenreihenfolge und frei gewaehlte Kennungen innerhalb einer Quelle sind irrelevant",()=>{
  const a=answer(1);a.quellen.reverse();
  A.equal(E.pruefe(1,a).referenzgleich,true);
  const q=a.quellen[0],alt=q.knoten[0].id;q.knoten[0].id="unabhaengige-id";
  for(const r of q.relationen){if(r.von===alt)r.von="unabhaengige-id";if(r.nach===alt)r.nach="unabhaengige-id";}
  A.equal(E.pruefe(1,a).referenzgleich,true);
});
test("Eindeutige Originalspanne wird serverseitig auch nach Emoji korrekt positioniert",()=>{
  const t="🚌 Der Preis könnte sinken.";
  A.deepEqual(E.positioniere(t,{text:"könnte",vorkommen:null}),R.fundstelle(t,"könnte"));
  A.throws(()=>E.positioniere(t,{text:"konnte",vorkommen:null}));
  A.throws(()=>E.positioniere(t,{text:"könnte",vorkommen:null,start:0}));
});
test("Mehrdeutige Spannen erfordern explizite Auswahl und werden nicht automatisch repariert",()=>{
  const t=E.block(4).faelle.find(f=>f.id==="f11").quelle.text;
  A.throws(()=>E.positioniere(t,{text:"keine",vorkommen:null}));
  A.equal(E.positioniere(t,{text:"keine",vorkommen:1}).start,t.indexOf("und keine")+4);
  for(const vorkommen of [-1,2,1.5,"1"])A.throws(()=>E.positioniere(t,{text:"keine",vorkommen}));
  const a=answer(4),q=a.quellen.find(q=>q.id==="f11");
  const n=q.knoten.find(n=>n.spanne.text==="keine");n.spanne.vorkommen=0;
  A.equal(E.pruefe(4,a).referenzgleich,false);
});
console.log(`${pass}/${pass} Eingangsgruppen bestanden; keine Fachfreigabe.`);
