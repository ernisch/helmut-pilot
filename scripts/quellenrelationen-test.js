"use strict";
const A=require("node:assert/strict"),F=require("node:fs"),P=require("node:path"),O=require("node:os");
const R=require("./quellenrelationen");
const m=JSON.parse(F.readFileSync(P.join(__dirname,"fixtures/quellenrelationen-korpus.json"),"utf8"));
const clone=x=>structuredClone(x);
let passed=0;
function test(name,fn){fn();passed++;console.log("PASS "+name);}
test("Neue Referenz ist getrennt und erhaelt alle18 unveraenderten Originale",()=>{
  const raw=F.readFileSync(P.join(__dirname,"fixtures/aussagenabdeckung-korpus.json"));
  A.equal(R.sha(raw),m.altmanifestSha256);
  const alt=JSON.parse(raw);A.equal(m.version,1);A.equal(m.faelle.length,18);
  for(const f of m.faelle){A.equal(f.quelle.text,alt.faelle.find(x=>x.id===f.id).quelle.text);
    A.equal(f.begruendungen.length,f.referenz.relationen.length);
    A(f.begruendungen.every(s=>s.length>30));}
  A.equal(m.faelle.reduce((n,f)=>n+f.referenz.relationen.length,0),67);
});
for(const f of m.faelle){
  test(f.id+" positive Relationsreferenz, Umbenennung und Reihenfolge",()=>{
    A.deepEqual(R.graphFehler(f.quelle,f.referenz),[]);
    const g=clone(f.referenz),names=new Map(g.knoten.map((n,i)=>[n.id,"frei"+i]));
    g.knoten.forEach(n=>n.id=names.get(n.id));
    g.relationen.forEach(r=>{r.von=names.get(r.von);r.nach=names.get(r.nach);r.signale.reverse();});
    g.knoten.reverse();g.relationen.reverse();
    const r=R.vergleiche(f.quelle,g,f.referenz);
    A.equal(r.referenzgleich,true);A.equal(r.fachlichBestanden,false);
    A.equal(r.vollstaendigeFaktenpruefung,false);A.equal(r.produktpfadeGeprueft,0);
  });
  test(f.id+" jede einzelne Relation fehlt sichtbar auch bei ganzen Quellenzitaten",()=>{
    for(let i=0;i<f.referenz.relationen.length;i++){
      const g=clone(f.referenz);g.relationen.splice(i,1);
      const benutzt=new Set(g.relationen.flatMap(r=>[r.von,r.nach]));
      g.knoten=g.knoten.filter(n=>benutzt.has(n.id));
      const r=R.vergleiche(f.quelle,g,f.referenz);
      A.equal(r.schemaFehler.length,0);A.equal(r.referenzgleich,false);A.equal(r.fehlend.length,1);
    }
  });
  test(f.id+" vertauschte Endpunkte und falscher Typ bestehen nicht",()=>{
    for(const modus of ["richtung","typ"]){
      const g=clone(f.referenz),r=g.relationen[0];
      if(modus==="richtung")[r.von,r.nach]=[r.nach,r.von];
      else r.typ=r.typ==="ursache"?"zeitfolge":"ursache";
      const d=R.vergleiche(f.quelle,g,f.referenz);
      A.equal(d.referenzgleich,false);A.equal(d.fehlend.length,1);A.equal(d.zusaetzlich.length,1);
      A.equal(d.vergleichsurteil,"ungeklaerte-relationsabweichung");
    }
  });
}
test("Neue Quelle und gleicher Wortlaut an falscher Position sind nicht gebunden",()=>{
  const f=m.faelle[0],g=clone(f.referenz);
  g.quellenHash="0".repeat(64);A(R.vergleiche(f.quelle,g,f.referenz).schemaFehler.some(x=>x.typ==="quellbindung"));
  const q={id:"gleich",text:"20 Euro sind geplant. 20 Euro sind bestritten."};
  const s=R.fundstelle(q.text,"20 Euro",1);A.equal(s.start,22);
  const ref={quelleId:q.id,quellenHash:R.sha(q.text),knoten:[{id:"a",spanne:R.fundstelle(q.text,"bestritten")},{id:"b",spanne:s}],
    relationen:[{typ:"negation",von:"a",nach:"b",signale:[R.fundstelle(q.text,"bestritten")]}]};
  const k=clone(ref);k.knoten[1].spanne=R.fundstelle(q.text,"20 Euro",0);
  A.equal(R.vergleiche(q,k,ref).referenzgleich,false);
});
test("Vollstaendige Originale und Hash ohne verknuepfte Ursache genuegen nicht",()=>{
  const f=m.faelle[0],g=clone(f.referenz);
  g.relationen[0].typ="zeitfolge";
  const r=R.vergleiche(f.quelle,g,f.referenz);
  A.equal(r.referenzgleich,false);A.equal(r.fehlend[0].relation.typ,"ursache");
  A.equal(r.kandidatenbedarfOffen.some(s=>s.text==="dadurch"),false);
  // Sogar das Vorhandensein des korrekten Signals beweist die Relation nicht.
  A.equal(r.fachlichBestanden,false);
});
test("Pruefbedarf entsteht aus unbekannter Quelle ohne Sollsatz oder Modellantwort",()=>{
  const q={id:"neu",text:"Der Rat plant einen Beitrag. Dadurch könnte der Preis sinken, falls die Kammer zustimmt."};
  const r=R.pruefbedarf(q);
  A(r.fundstellen.some(s=>s.klasse==="kausal"&&s.text==="Dadurch"));
  A(r.fundstellen.some(s=>s.klasse==="modal"&&s.text==="könnte"));
  A(r.fundstellen.some(s=>s.klasse==="bedingt"&&s.text==="falls"));
  A.equal(r.vollstaendigeErkennung,false);A.equal(r.fachlichBestanden,false);
});
test("Referenzluecke wird neben einem perfekten Referenztreffer sichtbar",()=>{
  const f=m.faelle[0],g=clone(f.referenz);g.relationen.shift();
  const gebraucht=new Set(g.relationen.flatMap(r=>[r.von,r.nach]));g.knoten=g.knoten.filter(n=>gebraucht.has(n.id));
  const r=R.vergleiche(f.quelle,g,g);
  A.equal(r.referenzgleich,true);A(r.referenzbedarfOffen.some(s=>s.text==="dadurch"));
  A.equal(r.fachlichBestanden,false);
});
test("Ein Signal im Zitat ist Pruefbedarf und kein automatisches Kausalurteil",()=>{
  const r=R.pruefbedarf({id:"zitat",text:"Das Wort dadurch kommt im Entwurf vor. Ein Zusammenhang ist nicht belegt."});
  A(r.fundstellen.some(s=>s.text==="dadurch"));A.equal(r.fachlichBestanden,false);
});
test("Nicht erkannte implizite Beziehung wird nie als vollstaendig geprueft gemeldet",()=>{
  const r=R.pruefbedarf({id:"implizit",text:"Die Förderung entfällt. Der Fahrpreis steigt."});
  A.equal(r.fundstellen.length,0);A.equal(r.vollstaendigeErkennung,false);
});
test("Wortgrenzen und das zweite keine werden unabhaengig erkannt",()=>{
  const f=m.faelle.find(f=>f.id==="f11"),r=R.vergleiche(f.quelle,f.referenz,f.referenz);
  A.equal(r.referenzbedarfOffen.length,0);
  const neg=f.referenz.relationen.find(e=>e.typ==="negation"&&f.referenz.knoten.find(n=>n.id===e.nach).spanne.text==="Handlungsfrist");
  A(neg.signale[0].start>f.quelle.text.indexOf("keinen"));
  const q={id:"wortgrenze",text:"Es besteht aus zwei Teilen. Die gemeinsame Klärung steht aus."};
  const offen=R.pruefbedarf(q).fundstellen.filter(s=>s.klasse==="offen");
  A.equal(offen.length,1);A.equal(offen[0].start,q.text.lastIndexOf("steht aus"));
});
test("Mehrdeutige sprachliche Variante bleibt ungeklaert, nicht automatisch falsch",()=>{
  const f=m.faelle[0],g=clone(f.referenz),id=g.relationen[0].von;
  g.knoten.find(n=>n.id===id).spanne=R.fundstelle(f.quelle.text,"Stadtrat beschließt einen Zuschuss von 20 Euro für Busfahrkarten");
  const r=R.vergleiche(f.quelle,g,f.referenz);
  A.equal(r.vergleichsurteil,"ungeklaerte-relationsabweichung");
  A.equal(r.fachlichBestanden,false);A.equal(Object.hasOwn(r,"falscheTatsache"),false);
});
test("Defekte Schemata, leere und unbesetzte Arrays, doppelte IDs und fremde Endpunkte",()=>{
  const f=m.faelle[0];
  for(const mut of [g=>{g.knoten=new Array(1);},g=>{g.relationen=new Array(1);},
    g=>{g.relationen[0].signale=new Array(1);},g=>{g.knoten[0].spanne.start=-1;},
    g=>{g.knoten[1].id=g.knoten[0].id;},g=>{g.relationen[0].von="fremd";},
    g=>{g.relationen[0].nach=g.relationen[0].von;},g=>{g.relationen.push(clone(g.relationen[0]));},
    g=>{g.freigegeben=true;},g=>{g.relationen[0].signale=[];},
    g=>{g.relationen[0].signale.push(clone(g.relationen[0].signale[0]));}]){
    const g=clone(f.referenz);mut(g);A(R.vergleiche(f.quelle,g,f.referenz).schemaFehler.length>0);
  }
  const g={quelleId:f.id,quellenHash:R.sha(f.quelle.text),knoten:[],relationen:[]};
  A.equal(R.vergleiche(f.quelle,g,f.referenz).fehlend.length,2);
});
test("Zusaetzliche Relation ist sichtbar und liefert keine Selbstfreigabe",()=>{
  const f=m.faelle[0],g=clone(f.referenz);g.relationen.push({...clone(g.relationen[0]),typ:"zuschreibung"});
  const r=R.vergleiche(f.quelle,g,f.referenz);A.equal(r.zusaetzlich.length,1);A.equal(r.referenzgleich,false);
});
test("UTF16 Positionen und woertlicher Quelltext bleiben unveraendert",()=>{
  const q={id:"unicode",text:"🚌 Dadurch könnte der Fahrpreis sinken."};
  A.equal(R.fundstelle(q.text,"Dadurch").start,3);
  const r=R.pruefbedarf(q);A.equal(r.fundstellen.find(s=>s.text==="Dadurch").start,3);
});
test("Echte lokale Speicherung und Ruecklesung aendern den Vergleich nicht",()=>{
  const f=m.faelle[15],vorher=JSON.stringify(f),dir=F.mkdtempSync(P.join(O.tmpdir(),"helmut-relationen-"));
  try{const path=P.join(dir,"graph.json");F.writeFileSync(path,JSON.stringify(f.referenz));
    const g=JSON.parse(F.readFileSync(path));A.equal(R.vergleiche(f.quelle,g,f.referenz).referenzgleich,true);
    const r=R.vergleiche(f.quelle,g,f.referenz);r.referenzbedarfOffen.push({text:"fremd"});
    A.equal(JSON.stringify(f),vorher);
  }finally{F.rmSync(dir,{recursive:true,force:true});}
});
console.log(`${passed}/${passed} Relationsgruppen bestanden; keine Produktpfadabnahme.`);
