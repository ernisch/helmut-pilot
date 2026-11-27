"use strict";
const A=require("node:assert/strict"), Q=require("../lib/helmut/lage-textqualitaet");
const docs=[{vorgang_id:"vg-a",quellenbelege:[
  {quelle_id:"q-a",titel:"Ein Vorschlag",auszug:"Der Vorschlag ist noch nicht beschlossen.",
    quelle:"Amtliche Quelle",url:"https://example.org/a",veroeffentlichtAm:"2026-09-26T01:00:00Z",
    dokumentangaben:{drucksache:"21/1234"}},
  {quelle_id:"q-fremd",titel:"Ein anderer Vorgang",auszug:"Darf den ersten Absatz nicht heilen."}]},
  {vorgang_id:"vg-b",quellenbelege:[{quelle_id:"q-b",titel:"Zweiter Sachverhalt",auszug:"Eine andere Position."}]},
  {vorgang_id:"vg-c",quellenbelege:[{quelle_id:"q-c",titel:"Nicht gewaehlt"}]}];
const paragraphs=[{text:"Eine erste Aussage",quelle_id:"q-a",vorgang_ids:["vg-a"]},
  {text:"Eine zweite Aussage",quelle_id:"q-b",vorgang_ids:["vg-b"]},
  {text:"Weitere Aussage zur ersten Quelle",quelle_id:"q-a",vorgang_ids:["vg-a"]}];
const before=structuredClone({docs,paragraphs});
const result=Q.pruefQuellen(paragraphs,docs);
A.deepEqual(result,[{...docs[0],quellenbelege:[docs[0].quellenbelege[0]]},docs[1]]);
A.deepEqual({docs,paragraphs},before);
console.log("PASS ausgewaehlte Originalbelege vollstaendig, unbeteiligte entfernt, keine Mutation");
for(const [p,v] of [
  [[{...paragraphs[0],quelle_id:"q-fehlt"}],docs],
  [[{...paragraphs[0],vorgang_ids:["vg-b"]}],docs],
  [[{...paragraphs[0],vorgang_ids:["vg-a","vg-b"]}],docs],
  [[{...paragraphs[0],quelle_id:undefined}],docs],
  [[paragraphs[0]],[...docs,structuredClone(docs[0])]],
  [[paragraphs[0]],[...docs,{vorgang_id:"vg-falsch",quellenbelege:[docs[0].quellenbelege[0]]}]],
  [null,docs],[paragraphs,null]
]) A.throws(()=>Q.pruefQuellen(p,v),/nicht-eindeutig/);
console.log("PASS fremde, fehlende und mehrdeutige Referenzen stoppen vor dem Pruefmodell");
const profile={committees:["Gesundheit"],deputyCommittees:["Finanzen"],focusTopics:["Pflege"]};
const prompt=Q.prompt(paragraphs,docs,profile);
const fields=Object.fromEntries(prompt.split("\n").filter(x=>/^(MANDAT|QUELLEN|ABSAETZE): /.test(x))
  .map(x=>[x.slice(0,x.indexOf(":")),JSON.parse(x.slice(x.indexOf(":")+2))]));
A.deepEqual(fields.QUELLEN,result);A.deepEqual(fields.ABSAETZE,paragraphs);
A.deepEqual(fields.MANDAT,Q.modellProfilKontext(profile));
A(prompt.includes("genau ein Urteil fuer jedes Paar"));A(prompt.includes(Q.ZEITREGEL));
A.deepEqual(Q.pruefQuellen([],[]),[]);
console.log("PASS gesamtes Mandat, alle Absaetze und Paar-/Zeitpruefung bleiben erhalten");

// Vollsynthetischer Gegenfall zum Morgen27.11.: Der bestehende DIP-Eingang
// schreibt Metadatenlabels in summary; diese duerfen kein Dokumentauszug werden.
const L=require("../lib/helmut/lage-quellenbeleg"),DIP=require("../lib/helmut/dip-quellfelder");
const ai=require("../lib/helmut/ai"),C=require("../lib/helmut/lage-verarbeitungsbeleg");
const now=new Date("2026-11-27T05:45:00Z");
function dipDoc(urheber,ressort=null){
  const doc={id:"rd-"+"a".repeat(64),title:"Beratungsangebote in Gemeinden",summary:"",
    url:"https://dserver.bundestag.de/btd/21/099/2109900.pdf",source_id:"dip",
    source_name:"DIP Bundestag",published_at:"2026-11-25T00:00:00.000Z",document_type:"Kleine Anfrage"};
  doc.dip_quellfelder=DIP.neu({titel:doc.title,datum:"2026-11-25",drucksachetyp:"Kleine Anfrage",
    dokumentart:"Drucksache",urheber,ressort},{...doc,id:"990001"});
  A(doc.dip_quellfelder);
  doc.summary=[(urheber||[]).map(u=>u.titel||u.bezeichnung).join(", "),
    (ressort||[]).map(r=>r.titel).join(", ")].filter(Boolean).join(" · ");
  return doc;
}
const entry={id:"ko-metadaten",vorgang_id:"vg-metadaten"};
const eingabe=d=>L.baueEingabe([entry],{[entry.vorgang_id]:[d]},now);
for(const flag of [false,null,true]){
  const d=dipDoc([{titel:"Fraktion Beispiel",einbringer:flag,rolle:null}],
    [{titel:"Ministerium Beispiel",federfuehrend:false}]);
  const original=structuredClone(d),q=eingabe(d)[0].quellenbelege[0];
  A.equal(q.auszug,"");
  A.equal(q.dokumentangaben.urheberLautDIP[0].einbringer,flag);
  A.equal(q.dokumentangaben.ressortLautDIP[0].federfuehrend,false);
  A.equal(q.dokumentangaben.dokumenttyp,"Kleine Anfrage");
  A.deepEqual(d,original);
}
const d=dipDoc([{titel:"Fraktion Beispiel",einbringer:false,rolle:null}]);
const genuine="Die Anfrage behandelt die Finanzierung kommunaler Beratungsstellen.";
A.equal(eingabe({...d,summary:genuine})[0].quellenbelege[0].auszug,genuine);
// Andere Quellen und echte Aussagen verlieren keinen Text, auch bei gleichen Labels.
const medium={...d,source_id:"medium",dip_quellfelder:undefined};
A.equal(eingabe(medium)[0].quellenbelege[0].auszug,medium.summary);
console.log("PASS DIP-Metadaten bleiben typisiert; echte Auszuege und Fremdquellen bleiben erhalten");

(async()=>{
  const sources=eingabe(d);
  sources.push({vorgang_id:"vg-bau",quellenbelege:[{quelle_id:"q-bau",
    titel:"Verband fordert Ausbau kommunaler Beratungsstellen",auszug:"",quelle:"Beispielmedium",
    url:"https://example.org/beratungsstellen",veroeffentlichtAm:"2026-11-25T10:00:00Z"}]});
  const profile={id:"synthetisch-metadaten",focusTopics:["Beratung"]};
  const paragraphs=sources.map((v,i)=>({vorgang_ids:[v.vorgang_id],quelle_id:v.quellenbelege[0].quelle_id,
    mandatsbezug:{feld:"schwerpunkt",wert:"Beratung"},auswahlbegruendung:"Beratung: kommunale Beratungsangebote.",
    text:i===0?"Die Fraktion Beispiel legte eine Anfrage zu Beratungsangeboten vor.":
      "Beispielmedium berichtet, dass ein Verband den Ausbau kommunaler Beratungsstellen fordert."}));
  const review={pruefungen:paragraphs.map((p,absatz)=>({absatz,quelle_id:p.quelle_id,belegfeld:"titel",
    vollstaendig_belegt:false,themenrein:true,profilbezug:true,textart:"konkreter_sachverhalt",
    pruefbegruendung:absatz===0?"Metadatenlabel belegt kein Vorlegen.":"Auszug fehlt.",
    mandatsbegruendung:"Beratung: Thema der kommunalen Beratungsangebote."})),
    vergleiche:[{erster_absatz:0,zweiter_absatz:1,eigenstaendige_sachverhalte:true,
      pruefbegruendung:"Anfrage und Forderung sind verschiedene Sachverhalte."}]};
  const generator=ai.buildLageBriefingPrompt(sources,profile,{briefingDatum:now.toISOString()});
  const generatedSource=JSON.parse(generator.split("\n").find(l=>l.startsWith("[vg-metadaten] ")).slice("[vg-metadaten] ".length));
  const reviewer=JSON.parse(Q.prompt(paragraphs,sources,profile).split("\n").find(l=>l.startsWith("QUELLEN: ")).slice(9));
  A.deepEqual(generatedSource.quellenbelege[0],reviewer[0].quellenbelege[0]);
  A.equal(generatedSource.quellenbelege[0].auszug,"");
  A(generator.includes(Q.QUELLENFELD_REGEL));A(Q.prompt(paragraphs,sources,profile).includes(Q.QUELLENFELD_REGEL));

  // Reale Phasenverwaltung mit rein lokalem Speicher: ein bestaetigt negatives
  // Review wird beim Folgetermin wieder geprueft, niemals neu bezahlt oder geheilt.
  const rows=new Map(),args={userId:profile.id,tag:"2026-11-27",eingabe:{quellen:L.hashEingabe(sources)},now};
  let writes=0;
  const storage={assertTenant:()=>{},getLageVerarbeitungsbeleg:async(_,id)=>structuredClone(rows.get(id)||null),
    insertLageVerarbeitungsbeleg:async row=>{writes++;if(!rows.has(row.id))rows.set(row.id,structuredClone(row));}};
  const first=await C.begin(args,storage);
  await first.onDraft({paragraphs});await first.beforeReview();await first.onReview(review);
  const originalRows=structuredClone([...rows]);
  for(let i=0;i<2;i++){
    const receipt=await C.begin(args,storage);
    await A.rejects(ai.generateLageBriefing(sources,profile,{politicianId:profile.id,
      gespeicherterEntwurf:receipt.entwurf,gespeichertePruefung:receipt.pruefung}),
      e=>e.code==="LAGE_AI_FAILURE"&&e.diagnose.fehler.includes("aussage-unbelegt"));
  }
  A.equal(writes,4);A.deepEqual([...rows],originalRows);
  // Konkreter attribuierter Titel braucht weiterhin ein positives unabhaengiges
  // Review; dessen negative Antwort darf nicht automatisch umgewertet werden.
  const titleParagraph=paragraphs[1],titleSources=[sources[1]];
  const positive={pruefungen:[{...review.pruefungen[1],absatz:0,vollstaendig_belegt:true,
    pruefbegruendung:"Der konkrete Titel belegt die zugeschriebene Forderung."}],vergleiche:[]};
  A.equal(Q.pruefe([titleParagraph],titleSources,positive,profile).ok,true);
  A.equal(Q.pruefe([titleParagraph],titleSources,{...positive,
    pruefungen:[{...positive.pruefungen[0],vollstaendig_belegt:false}]},profile).ok,false);
  console.log("PASS gleiche belegte Generator-/Pruefquellen; negative Phasen bleiben unveraendert gesperrt; konkreter Titel bleibt mit positivem Review nutzbar");
})().catch(e=>{console.error(e);process.exitCode=1;});
