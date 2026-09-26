"use strict";
const A=require("node:assert/strict"), M=require("./lage-pruefaufwand"), T=require("./lage-vorstart");
const {hash}=require("../lib/helmut/briefing-speicher");
const profile={id:"lokaler-sollfall",committees:["Haushaltsausschuss","Auswärtiger Ausschuss"]};
const sources=M.FAELLE.map(f=>({vorgang_id:f.paragraph.vorgang_ids[0],quellenbelege:[f.quelle]}));
const input=M.paket(profile,sources), start=Date.parse("2026-09-26T14:00:00Z");
function antwort(){
  return {pruefungen:M.FAELLE.map((f,absatz)=>({absatz,quelle_id:f.paragraph.quelle_id,
    belegfeld:"auszug",pruefbegruendung:"Der Auszug enthält die benannte Handlung oder Prognose.",
    mandatsbegruendung:`${f.paragraph.mandatsbezug.wert}: ${f.erwartet?"passendes institutionelles Fachgebiet":"fachfremde Bindung"}.`,
    vollstaendig_belegt:true,themenrein:true,profilbezug:f.erwartet,textart:"konkreter_sachverhalt"})),
    vergleiche:M.FAELLE.flatMap((_,a)=>M.FAELLE.slice(a+1).map((_,i)=>({erster_absatz:a,zweiter_absatz:a+i+1,
      eigenstaendige_sachverhalte:true,pruefbegruendung:"Getrennte konkrete Handlungen oder Prognosen."})))};
}
function setup(){
  const trace=[],s={cost:0,cache:null,receipt:null};
  const cfg={quittung:M.QUITTUNG,pruefaufwand:true,profilHash:T.bindung(profile),commit:"a".repeat(40),runId:"nachlauf500-12345678901"};
  const d={execute:true,now:()=>start,ruhe:async()=>"gleich",bestand:async()=>"gleich",profile:async()=>profile,
    cache:async()=>s.cache,reviewPaket:async()=>input,artikelstand:async()=>({}),reserve:.212,
    kosten:async()=>({startklar:true,offeneReservierungen:0,limitUsd:4,gebundenUsd:s.cost}),laufkosten:async()=>s.cost,
    acquire:async()=>{trace.push("lock");return {granted:true,active:true};},release:async()=>trace.push("release"),
    claim:async()=>{trace.push("claim");return true;},finish:async r=>{trace.push("finish");s.receipt=structuredClone(r);},
    reviewQuittung:async()=>s.receipt,reviewModell:async()=>{trace.push("modell");s.cost=.012;return antwort();},
    build:async()=>{throw Error("Produktgenerierung verboten");}};
  return {s,d,cfg,trace};
}
(async()=>{
  let n=0;const test=async(name,fn)=>{await fn();n++;console.log("PASS "+name);};
  await test("Vier feste Quellen und unabhängige Sollwerte",()=>{
    A.deepEqual(M.FAELLE.map(f=>f.erwartet),[true,true,false,false]);
    A.equal(input.quellen.length,4);A(!input.prompt.includes('"erwartet"'));
    A.equal(M.auswertung(input,antwort(),profile).ok,true);
    const altered=structuredClone(sources);altered[0].quellenbelege[0].auszug+=" Geändert.";
    A.throws(()=>M.paket(profile,altered),/quellenbindung/);
    A.throws(()=>M.paket({...profile,committees:["Innenausschuss"]},sources),/quellenbindung/);
  });
  await test("Falsch positiv, falsch negativ und unvollständig bleiben Fehler",()=>{
    for(let i=0;i<4;i++){const a=antwort();a.pruefungen[i].profilbezug=!a.pruefungen[i].profilbezug;
      A.equal(M.auswertung(input,a,profile).ok,false);}
    for(const key of ["mandatsbegruendung","pruefbegruendung","quelle_id","belegfeld"]){const a=antwort();delete a.pruefungen[2][key];
      A.equal(M.auswertung(input,a,profile).ok,false);}
    const a=antwort();a.pruefungen.pop();A.throws(()=>M.auswertung(input,a,profile),/urteile/);
    const b=antwort();b.vergleiche.pop();A.equal(M.auswertung(input,b,profile).ok,false);
    const c=antwort();c.vergleiche[1]=c.vergleiche[0];A.equal(M.auswertung(input,c,profile).ok,false);
  });
  await test("Nurleseplan schreibt und ruft kein Modell",async()=>{
    const {d,cfg,trace}=setup();d.execute=false;const r=await M.einmallauf(cfg,d);
    A(r.ok);A.equal(r.maxAufrufe,1);A.equal(r.maxUsd,.25);A.deepEqual(trace,[]);
  });
  await test("Genau ein Review, kein Tagessatz, vollständige private Nachlesung",async()=>{
    const {d,cfg,trace,s}=setup();const r=await M.einmallauf(cfg,d);
    A(r.ok);A.equal(r.freigegebeneAufrufe,1);A.equal(s.cache,null);A.equal(s.receipt.status,"abgeschlossen");
    A.equal(hash(s.receipt.fachbeleg.antwort),s.receipt.fachbeleg.antwortHash);
    A.deepEqual(trace,["lock","claim","modell","release","finish"]);
    A(!JSON.stringify(r).includes("mandatsbegruendung"));
  });
  await test("Kosten, Quelländerung, fremdes Profil und Zeit stoppen vor Modell",async()=>{
    for(const art of ["kosten","quelle","profil","zeit","cache"]){
      const {d,cfg,trace,s}=setup();let reads=0;
      if(art==="kosten")d.reserve=.251;
      if(art==="quelle")d.reviewPaket=async()=>++reads>1?{...input,paketHash:"fremd"}:input;
      if(art==="profil")d.bestand=async()=>"fremd";
      if(art==="zeit")d.now=()=>++reads>1?start+180000:start;
      if(art==="cache")d.cache=async()=>++reads>1?{}:s.cache;
      await A.rejects(M.einmallauf(cfg,d));A(!trace.includes("modell"));
    }
  });
  await test("Verbrauchte Quittung und Sperre führen niemals zu einem Aufruf",async()=>{
    for(const key of ["claim","acquire"]){const {d,cfg,trace}=setup();d[key]=async()=>key==="claim"?false:{granted:false};
      if(key==="acquire")await A.rejects(M.einmallauf(cfg,d));else A.equal((await M.einmallauf(cfg,d)).ok,false);
      A(!trace.includes("modell"));A(!trace.includes("finish"));}
  });
  await test("Fachfehler, offener Kostenbeleg und Nachkontrollfehler bleiben terminal",async()=>{
    for(const art of ["fachlich","modell","kosten","profil","cache","release"]){const {d,cfg,trace,s}=setup();
      d.reviewModell=async()=>{trace.push("modell");s.cost=.012;
        if(art==="modell")throw Error("Vertrauliche Antwort");
        if(art==="kosten")d.kosten=async()=>({offeneReservierungen:1,limitUsd:4});
        if(art==="profil")d.ruhe=async()=>"fremd";
        if(art==="cache")s.cache={unerlaubt:true};
        if(art==="release")d.release=async()=>{throw Error("intern");};
        const a=antwort();if(art==="fachlich")a.pruefungen[2].profilbezug=true;return a;};
      const r=await M.einmallauf(cfg,d);A.equal(r.ok,false);A.equal(s.receipt.status,"gestoppt");
      A.equal(trace.filter(x=>x==="modell").length,1);A(!JSON.stringify(r).includes("Vertrauliche"));}
  });
  await test("Abweichende Quittungsnachlesung darf keinen Erfolg bestätigen",async()=>{
    const {d,cfg}=setup();d.reviewQuittung=async()=>({});await A.rejects(M.einmallauf(cfg,d),/quittung-nicht-bestaetigt/);
  });
  await test("Eigener Medium-Auftrag bindet ausschließlich den belegten falschen Review",()=>{
    const commit="a".repeat(40),env={HELMUT_VORSTART_COMMIT:commit,GITHUB_SHA:commit,GITHUB_ACTIONS:"true",
      GITHUB_REPOSITORY:"ernisch/helmut-pilot",GITHUB_REF:"refs/heads/main",GITHUB_EVENT_NAME:"workflow_dispatch",
      GITHUB_RUN_ATTEMPT:"1",HELMUT_VORSTART_PROFIL:T.ARTIKELSTAND.profilHash,GITHUB_RUN_ID:"12345678901",
      HELMUT_VORSTART_AUFTRAG:"pruefaufwand"};
    const cfg=T.konfiguration(env,commit,start);A.equal(cfg.pruefaufwand,true);A.equal(cfg.mandatsurteil,false);
    A.equal(cfg.quittung,M.QUITTUNG);A.notEqual(M.QUITTUNG,T.AUSWAHLBEGRUENDUNG.quittung);
    const alt={status:"gestoppt",ok:false,quittungsschluessel:T.AUSWAHLBEGRUENDUNG.quittung,
      runId:"nachlauf500-36252632130",runtimeCommit:"c4cd05f3ff94776ee4dd5be5810b54192795a00d",
      idHash:T.ARTIKELSTAND.profilHash,grund:"ai-text-source-support",gespeichert:false,
      freigegebeneAufrufe:2,offeneKosten:0,profileUnveraendert:true,
      lesebeweis:{absatzHash:T.ARTIKELSTAND.absatzHash}};
    T.pruefePruefaufwandVorgaenger(alt);
    for(const change of [{status:"laeuft"},{ok:true},{quittungsschluessel:M.QUITTUNG},{runId:"fremd"},
      {runtimeCommit:"fremd"},{idHash:"fremd"},{grund:"anderer"},{gespeichert:true},{freigegebeneAufrufe:1},
      {offeneKosten:1},{profileUnveraendert:false},{lesebeweis:null}])
      A.throws(()=>T.pruefePruefaufwandVorgaenger({...alt,...change}),/pruefaufwand-vorgaenger/);
  });
  await test("Transportnachweis b verlangt exakt den verbrauchten Lauf a und erhält dessen Antwort",async()=>{
    const alt=require("./fixtures/lage-pruefaufwand-transport-vorgaenger.json");
    T.pruefePruefaufwandTransportVorgaenger(alt);
    A.equal(M.QUITTUNG,"lage-pruefaufwand-20260926-b");
    A.equal(T.PRUEFAUFWAND.quittung,M.QUITTUNG);
    for(const change of [{status:"laeuft"},{ok:true},{quittungsschluessel:M.QUITTUNG},{runId:"fremd"},
      {runtimeCommit:"fremd"},{idHash:"fremd"},{grund:"anderer"},{gespeicherterLageText:true},
      {freigegebeneAufrufe:0},{offeneKosten:1},{profileUnveraendert:false},{paketHash:"fremd"},
      {fachbeleg:null}]) A.throws(()=>T.pruefePruefaufwandTransportVorgaenger({...alt,...change}),/transport-vorgaenger/);
    const falsch=structuredClone(alt);falsch.fachbeleg.antwort.pruefungen[2].profilbezug=false;
    A.throws(()=>T.pruefePruefaufwandTransportVorgaenger(falsch),/transport-vorgaenger/);
    const {d,cfg,trace}=setup();cfg.quittung=alt.quittungsschluessel;
    await A.rejects(M.einmallauf(cfg,d),/sollfall-auftrag/);A.deepEqual(trace,[]);
  });
  console.log(`${n}/${n} Prüfaufwand-Prüfgruppen bestanden; keine Modelle oder Production-Schreibzugriffe.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
