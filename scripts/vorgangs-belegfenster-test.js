"use strict";
const A=require("node:assert/strict"),U=require("../lib/helmut/understanding");
// Production-Grenzfall26.09.: der achte Kandidat hatte zwei Altquellen;
// das frühere Fünfer-Lesefenster behandelte ihn trotzdem nur nach Überschrift.
const neu={id:"neu",title:"Offenbacher Verein Connection - Kriegsdienstverweigerer-Netzwerk mit neuem Friedenspreis geehrt",
  summary:"Das internationale Kriegsdienstverweigerer-Netzwerk Connection aus Offenbach hat den ersten Alternativen Westfälischen Friedenspreis erhalten.",published_at:"2026-09-26T14:43:52Z",url:"https://example.org/friedenspreis"};
const alt={id:"alt",title:"Zum Internationalen Tag der Pflegenden am 12. Mai 2024: Gute Pflege für alle sichern – ohne Pflegende geht es nicht! - Deutscher Verein",
  summary:null,published_at:"2024-05-08T07:00:00Z",url:"https://example.org/pflege"};
async function fall(art){
  const kandidaten=Array.from({length:7},(_,i)=>({id:"ko-fremd-"+i,vorgang_id:"vg-internationale-fremd-"+i,
    headline:"Neubau einer Sporthalle und eines Freibads",updated_at:"2026-09-25T00:00:00Z"}));
  kandidaten.push({id:"ko-alt",vorgang_id:"vg-internationalen-20240508-fe6948",
    headline:"Internationaler Tag der Pflegenden: Forderungen zur Sicherung guter Pflege",
    display_title:"Deutscher Verein fordert Maßnahmen zur Sicherung guter Pflege",updated_at:"2026-08-31T10:02:28Z"});
  const gelesen=[];
  const deps={findVorgangCandidates:async(_,limit)=>{A.equal(limit,8);return kandidaten;},getExisting:async()=>null,
    listVorgangDocuments:async id=>{gelesen.push(id);A(gelesen.length<=8);
      if(id!=="ko-alt")return [{id,url:"https://example.org/"+id,title:"Neubau Sporthalle Freibad",published_at:"2026-09-25T00:00:00Z"}];
      if(art==="lesefehler")throw Error("offline-lesefehler");
      return art==="gleich"?[{...neu,id:"vorher",published_at:"2026-09-25T14:43:52Z"}]:[alt,{...alt,id:"alt-zwei"}];}};
  const r=await U.resolveVorgang({documents:[neu]},deps);A.equal(gelesen.length,8);A.equal(gelesen[7],"ko-alt");
  return r;
}
(async()=>{
  const getrennt=await fall("anders");A.notEqual(getrennt.vorgangId,"vg-internationalen-20240508-fe6948");
  A.equal(getrennt.resolution,"neu");A(getrennt.spuren.some(s=>s.vorgangId==="vg-internationalen-20240508-fe6948"&&!s.gleich&&s.grund==="vorgang-zu-alt"));
  const gleich=await fall("gleich");A.equal(gleich.resolution,"bestand");A.equal(gleich.vorgangId,"vg-internationalen-20240508-fe6948");
  A.equal(gleich.bestandsDokumente.length,1);
  const fehler=await fall("lesefehler");A.equal(fehler.resolution,"bestand-lesefehler");A.equal(fehler.begruendung,"bestandslesefehler");
  console.log("PASS 3 Belegfensterfälle: fachfremd getrennt, gleicher Vorgang erhalten, Lesefehler gesperrt; maximal8 Leser,0 Modelle/Writes");
})().catch(e=>{console.error(e);process.exitCode=1});
