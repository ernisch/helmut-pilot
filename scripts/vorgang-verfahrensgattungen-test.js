"use strict";
// Ausschliesslich neue Gegenfaelle fuer den belegten Gattungs-/Ressortmix.
// Synthetische Originalquellen: keine privaten Daten, Modelle, DB oder Netze.
const A = require("node:assert/strict"), V = require("../lib/helmut/vorgang-identity"),
  Q = require("../lib/helmut/briefing-quellenqualitaet");
if (process.argv.length !== 2) throw Error("Unbekannte Testauswahl");
const doc = (id, title, summary, day = "2026-11-06") => ({ id, title, summary,
  url: "https://example.invalid/original/" + id, published_at: day + "T12:00:00Z" });
const pflege = doc("pflege", "Pflegeneuordnungsgesetz: Einnahmen der Pflegeversicherung und Pflegegrade",
  "Gesundheit/Interview Die Fraktion fordert eine Reform der Pflegeversicherung. Das Pflegeneuordnungsgesetz ordnet die Pflegegrade neu.", "2026-11-05");
const pflegeFolge = doc("pflege-folge", "Pflegeneuordnungsgesetz: Anhoerung zur Neuordnung der Pflegegrade",
  "Gesundheit/Antrag Eine Fraktion beantragt die Anhoerung zum Pflegeneuordnungsgesetz und den Pflegegraden.", "2026-11-13");
const sucht = doc("suchthilfe", "Reform des Suchthilfesystems",
  "Gesundheit/Antrag Eine Fraktion fordert in einem Antrag eine Reform des Suchthilfesystems.", "2026-11-13");
const wehr = doc("wehrdienst", "Umsetzung des Wehrdienst-Modernisierungsgesetzes",
  "Verteidigung/KleineAnfrage Eine Fraktion will mittels einer Kleinen Anfrage Details zur Umsetzung des Wehrdienst-Modernisierungsgesetzes erfahren.");
const transfusion = doc("transfusion", "Modernisierung des Transfusionsgesetzes",
  "Gesundheit/Antrag Eine Fraktion fordert in einem Antrag eine Modernisierung des Transfusionsgesetzes.");
const ausgaben = doc("gesundheitsausgaben", "Analyse der Gesundheitsausgaben",
  "Gesundheit/Antrag Eine Fraktion fordert in einem Antrag eine genauere Analyse der Gesundheitsausgaben nach Aufenthaltsstatus.");
const getrennt = (a,b) => {
  A.equal(V.docsShareEvent(a,b).gleich,false,a.id+" -> "+b.id);
  A.equal(V.docsShareEvent(b,a).gleich,false,b.id+" -> "+a.id);
};
const gruppen = docs => V.clusterRawDocuments(docs).map(c=>c.documents.map(d=>d.id).sort())
  .sort((a,b)=>a.join().localeCompare(b.join()));
let count=0;
function test(name,fn){fn();count++;console.log("PASS "+name);}
test("Fraktion Antrag Ressort und Reform tragen auch gemeinsam kein Ereignisgewicht",()=>{
  const a=doc("antrag-a","Fraktionen beantragen Reformen","Gesundheit Antrag Anfrage Modernisierungsgesetz"),
    b=doc("antrag-b","Fraktion beantragt Reform","Gesundheit Antrags Anfragen Modernisierungsgesetzes");
  const r=V.docsShareEvent(a,b);
  A.equal(r.gleich,false);A.equal(r.overlap.gewichtSpezifisch,0);
  A.equal(V.docsShareEvent(b,a).overlap.gewichtSpezifisch,0);
  A.ok(V.docAnchors(a).includes("gesundheit"),"Originalanker bleiben vorhanden");
  A.ok(V.docAnchors(b).includes("modernisierungsgesetzes"));
});
test("Gleiches Gesundheitsressort und Reform verbinden Pflege und Suchthilfe nicht",()=>{
  getrennt(pflege,sucht);getrennt(sucht,ausgaben);getrennt(transfusion,ausgaben);
  A.equal(Q.themenrein([pflege,sucht]),false);
});
test("Nackte Modernisierung traegt auch innerhalb fremder Gesetzeskomposita nicht",()=>{
  getrennt(wehr,transfusion);
  for(const gattung of ["Modernisierung","Modernisierungsgesetzes"]){
    const a=doc("nackte-gattung",gattung,"Eine Fraktion beantragt "+gattung),
      b=doc("qualifizierter-gegenstand","Wehrdienstmodernisierungsgesetzes","Eine Fraktion beantragt das Wehrdienstmodernisierungsgesetzes");
    getrennt(a,b);
  }
});
test("Konkretes Pflegegesetz und qualifiziertes Wehrdienstgesetz behalten ihre echten Fortsetzungen",()=>{
  for(const [a,b] of [[pflege,pflegeFolge],
    [doc("wehr-konkreter-1","Wehrdienstmodernisierungsgesetz: Wehrerfassung beginnt","Die Wehrerfassung folgt dem Wehrdienstmodernisierungsgesetz."),
      doc("wehr-konkreter-2","Wehrdienstmodernisierungsgesetz: Umsetzung der Wehrerfassung","Das Wehrdienstmodernisierungsgesetz regelt die Wehrerfassung.")]]){
    A.equal(V.docsShareEvent(a,b).gleich,true);A.equal(V.docsShareEvent(b,a).gleich,true);
    A.equal(Q.themenrein([a,b]),true);
  }
});
test("Der synthetische Fuenfermix sperrt Briefingbehauptung und Bestandsfortschreibung ohne Quelldaten zu aendern",()=>{
  const mix=[pflege,sucht,wehr,transfusion,ausgaben],before=JSON.stringify(mix);
  A.equal(gruppen(mix).length,5);A.equal(Q.themenrein(mix),false);
  A.equal(Q.quellengebunden({headline:pflege.title},mix),false);
  A.equal(V.sameVorgang({documents:[pflegeFolge]},{vorgangId:"vg-altmix",documents:mix}).gleich,false);
  A.equal(JSON.stringify(mix),before);
});
test("Jede Reihenfolge behaelt den echten Pflegezusammenhang und getrennte Sachgegenstaende ohne Dokumentverlust",()=>{
  const permutations=xs=>xs.length?xs.flatMap((x,i)=>permutations(xs.filter((_,j)=>i!==j)).map(p=>[x,...p])):[[]];
  for(const rows of permutations([pflege,pflegeFolge,sucht,wehr])){
    A.deepEqual(gruppen(rows),[["pflege","pflege-folge"],["suchthilfe"],["wehrdienst"]]);
    A.equal(V.clusterRawDocuments(rows).flatMap(c=>c.documents).length,4);
  }
});
async function main(){
  const U=require("../lib/helmut/understanding"),C=require("../lib/helmut/verstehen-vertrag");
  const mix=[pflege,sucht,wehr,transfusion,ausgaben],cluster={documents:[pflege]},effects=[];
  const verboten=()=>{effects.push("verboten");throw Error("Reserve Modell Budget und Writes verboten");};
  const vertrag=C.baueVertrag({besitzer:"synthetischer-reader",env:{HELMUT_VERSTEHEN_CAS:"true"},deps:{speicher:{
    verstehenReserviere:verboten,verstehenModellstart:verboten,verstehenFreigabe:verboten,verstehenSpeichere:verboten
  }}});
  for(const id of ["vg-fraktion-20261105-synthetisch",V.deriveVorgangId(cluster)]){
    const row={id:"ko-"+id,vorgang_id:id,status:"pending",understanding_status:"pending",updated_at:"2026-11-14"},reads=[],
      gesund={id:"ko-gesunde-pflege",vorgang_id:"vg-gesunde-pflege",status:"pending",updated_at:"2026-11-13"},
      unknown={vorgangId:id,eingabeHash:C.eingabeHash({vorgangId:id,dokumente:cluster.documents,modus:"erst"}),
        zustand:"unbekannt",fencing:2,ki_aufrufe:1},
      before=JSON.stringify({row,unknown,mix,cluster});
    A.equal(V.sameVorgang(cluster,{documents:[pflege,pflegeFolge]}).gleich,true,"Spaeterer Kandidat waere fachlich passend");
    const deps={findVorgangCandidates:async()=>{reads.push("kandidaten");return structuredClone([row,gesund]);},
      getExistingStreng:async key=>{reads.push("exakt:"+key);return key===id?structuredClone(row):null;},
      listVorgangDocuments:async key=>{reads.push("links:"+key);A.ok([row.id,gesund.id].includes(key));
        return structuredClone(key===row.id?mix:[pflege,pflegeFolge]);},
      canSpend:verboten,requestUnderstanding:verboten,saveSources:verboten,savePending:verboten,markFailed:verboten};
    // KEIN opts.vorgangId: normaler Artikelqueuepfad prueft den alten Mix.
    const result=await U.understandOneCluster(cluster,deps,{vertrag});
    A.equal(result.vorgangId,id);A.equal(result.status,"skipped-bestandslesefehler");
    A.equal(result.begruendung,"artikel-bestandszuordnung-konflikt");
    A.equal(reads.filter(x=>x.startsWith("links:")).length,1);A.deepEqual(effects,[]);
    A.ok(!reads.includes("links:"+gesund.id),"Bekannte Konfliktbindung stoppt auch vor anderem fachlich passendem Kandidaten");
    A.equal(JSON.stringify({row,unknown,mix,cluster}),before);
    const neu={documents:[doc("neuer-unverknuepfter-artikel","Saatgutkontrollen bei Einfuhren","Saatgutimporte werden im benannten Kontrollverfahren untersucht.")]};
    const assigned=await U.resolveVorgang(neu,deps);
    A.equal(assigned.resolution,"neu");A.equal(assigned.vorgangId,V.deriveVorgangId(neu));
    A.equal(assigned.existing,null);A.deepEqual(effects,[]);
  }
  count++;console.log("PASS Normaler Artikelpfad sperrt bereits zugeordneten UNKNOWN-Artikel vor neuem CAS-Schluessel und laesst unverknuepfte neue Sache zu");
  A.equal(count,7);
  console.log(`${count}/${count} neue Gattungsgruppen bestanden; keine alten Tests oder Production-Aktion.`);
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
