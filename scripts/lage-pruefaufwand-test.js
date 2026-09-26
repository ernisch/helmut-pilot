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
    cache:async()=>s.cache,reviewPaket:async()=>input,artikelstand:async()=>({}),reserve:.224,
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
    A.equal(M.auswertung(input,antwort(),profile).fachlichGeprueftePaare,6);
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
  await test("Anschluss erhält die vollständige Bindung des verbrauchten Laufs a",async()=>{
    const alt=require("./fixtures/lage-pruefaufwand-transport-vorgaenger.json");
    T.pruefePruefaufwandTransportVorgaenger(alt);
    A.equal(M.QUITTUNG,"lage-pruefaufwand-20260926-c");
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
  await test("Offene Kosten verdecken erfolgreiche Profil-/Reserve-Nachlesung nicht",async()=>{
    const {d,cfg,s}=setup();
    d.reviewModell=async()=>{s.cost=.212;d.kosten=async()=>{throw Error("Start gesperrt");};throw Error("timeout");};
    d.kostenNachlauf=async()=>({offeneReservierungen:1,limitUsd:4});
    const r=await M.einmallauf(cfg,d);A.equal(r.ok,false);A.equal(r.profileUnveraendert,true);
    A.equal(r.offeneKosten,1);A.equal(r.laufkostenUsd,.212);A.equal(s.receipt.status,"gestoppt");
  });
  await test("Einzelne unlesbare Nachkontrolle ist unbekannt, übrige Ergebnisse bleiben",async()=>{
    for(const art of ["kosten","profile"]){const {d,cfg}=setup();
      d.reviewModell=async()=>{if(art==="kosten")d.kosten=async()=>{throw Error("offline");};
        else d.ruhe=async()=>{throw Error("offline");};return antwort();};
      const r=await M.einmallauf(cfg,d);A.equal(r.ok,false);
      A.equal(r.profileUnveraendert,art==="kosten"?true:null);
      A.equal(r.offeneKosten,art==="kosten"?null:0);A.equal(r.laufkostenUsd,0);
    }
  });
  await test("Anschluss c verlangt unveränderte Timeoutquittung und belegten Kostenabschluss",async()=>{
    const alt=require("./fixtures/lage-pruefaufwand-timeout-vorgaenger.json");
    const ticketId="2c43a041-7e52-496b-8759-546184e13a83";
    const receipt={id:"llm-1790440319637-9moa0o",runId:alt.runId,success:false,
      error:"request-error:ETIMEDOUT",model:"gpt-5-mini",promptTokens:4069,completionTokens:3000,totalTokens:7069,
      reconciliation:{sourceSha256:"4c4837dfe4ab33df5248a4875d0715727212c04bb4e2a994992bf304ce184fad",
        statusSha256:"15b3b7ff4c8de99172adc623e6aebd39c48692a6f381f9bafd8be8a22afcc1f8",responseRecovered:false}};
    const auth={llmUsage:[receipt],testKostenTage:{"2026-09-26":{calls:{[ticketId]:{
      status:"abgerechnet",cost:14035,reserved:212000,bezug:{runId:alt.runId,phase:"pruefung"}}}}}};
    T.pruefePruefaufwandTimeoutVorgaenger(alt,auth);
    for(const change of [{status:"laeuft"},{profileUnveraendert:true},{offeneKosten:0},{fachbeleg:{}},{quittungsschluessel:M.QUITTUNG}])
      A.throws(()=>T.pruefePruefaufwandTimeoutVorgaenger({...alt,...change},auth),/timeout-vorgaenger/);
    for(const mutation of [a=>a.llmUsage.push(receipt),a=>a.llmUsage.splice(0),
      a=>a.llmUsage[0].success=true,a=>a.llmUsage[0].completionTokens=2999,
      a=>a.llmUsage[0].reconciliation.sourceSha256="fremd",
      a=>a.llmUsage[0].reconciliation.responseRecovered=true,
      a=>a.testKostenTage["2026-09-26"].calls[ticketId].status="ungeklaert",
      a=>a.testKostenTage["2026-09-26"].calls[ticketId].cost=0]){
      const a=structuredClone(auth);mutation(a);
      A.throws(()=>T.pruefePruefaufwandTimeoutVorgaenger(alt,a),/timeout-vorgaenger/);
    }
    const K=require("../lib/helmut/testkosten-budget");
    A.equal(K.reservierungHoeheUsd(T.reviewOptionen({pruefaufwand:true}).maxOutputTokens),.224);
    A.deepEqual(T.reviewOptionen({}),{strict:true,reasoningEffort:"low",maxOutputTokens:3000});
    for(const quittung of ["lage-pruefaufwand-20260926-a","lage-pruefaufwand-20260926-b"]){
      const {d,cfg,trace}=setup();cfg.quittung=quittung;
      // Prüft den echten Startpfad, nicht nur die neue Kennung als Konstante.
      await A.rejects(M.einmallauf(cfg,d),/sollfall-auftrag/);A.deepEqual(trace,[]);
    }
  });
  await test("120s Antwort plus60s Abschluss bleiben innerhalb des240s-Auftrags",async()=>{
    const {d,cfg,trace}=setup();let n=0;d.now=()=>++n===1?start:start+60000;
    await A.rejects(M.einmallauf(cfg,d),/sollfall-restzeit/);A(!trace.includes("modell"));
    const workflow=require("fs").readFileSync(require("path").join(__dirname,"../.github/workflows/lage-vorstart.yml"),"utf8");
    A(workflow.includes("(inputs.auftrag == 'pruefaufwand' || inputs.auftrag == 'generatorpruefaufwand' || inputs.auftrag == 'fachkorrektur' || inputs.auftrag == 'generatorfachkorrektur') && '120000' || '20000'"));
    A.equal(M.MAX_MS,240000);A.equal(M.MAX_USD,.25);
  });
  await test("Fachkorrektur bindet echte zwei Absätze und beide negativen Kriterien",async()=>{
    A.equal(T.FACHKORREKTUR.quittung,"lage-fachkorrektur-20260926-b");
    A.throws(()=>T.pruefeTextartVorgaenger({ok:true}),/textart-vorgaenger/);
    const alt=setup();Object.assign(alt.cfg,{fachkorrektur:true,pruefaufwand:false,quittung:"lage-fachkorrektur-20260926-a"});
    await A.rejects(M.einmallauf(alt.cfg,alt.d),/sollfall-auftrag/);A.deepEqual(alt.trace,[]);
    const f=require("./fixtures/lage-fachkorrektur-zwei.json");
    const quellen=f.map(x=>({vorgang_id:x.paragraph.vorgang_ids[0],quellenbelege:[x.quelle]}));
    const p=M.paket(profile,quellen,f);
    A(!p.prompt.includes('"erwartet"'));A.equal(p.paragraphs.length,2);
    const a={pruefungen:f.map((x,absatz)=>({absatz,quelle_id:x.paragraph.quelle_id,
      belegfeld:absatz?"titel":"auszug",pruefbegruendung:absatz?"Der Titel benennt nur ein Thema.":"Belegte Annahme und Finanzbericht.",
      mandatsbegruendung:x.paragraph.mandatsbezug.wert+": "+(absatz?"Ort allein belegt keine Zustaendigkeit.":"Finanzierbarkeit ist Haushaltsaufgabe."),
      vollstaendig_belegt:true,themenrein:true,profilbezug:x.erwartet,textart:x.textart})),
      vergleiche:[{erster_absatz:0,zweiter_absatz:1,eigenstaendige_sachverhalte:true,pruefbegruendung:"Verschiedene Themen, keine Wiederholung."}]};
    A.equal(M.auswertung(p,a,profile,f).ok,true);
    A.equal(M.auswertung(p,a,profile,f).fachlichGeprueftePaare,0);
    const negativesPaar=structuredClone(a);negativesPaar.vergleiche[0].eigenstaendige_sachverhalte=false;
    A.equal(M.auswertung(p,negativesPaar,profile,f).ok,true);
    negativesPaar.vergleiche[0].eigenstaendige_sachverhalte=null;
    A.equal(M.auswertung(p,negativesPaar,profile,f).ok,false);
    for(const change of [{profilbezug:true},{textart:"konkreter_sachverhalt"},{vollstaendig_belegt:false},{belegfeld:"auszug"},{mandatsbegruendung:""}]){
      const bad=structuredClone(a);Object.assign(bad.pruefungen[1],change);
      A.equal(M.auswertung(p,bad,profile,f).ok,false);
    }
    const {d,cfg,s,trace}=setup();Object.assign(cfg,{quittung:T.FACHKORREKTUR.quittung,pruefaufwand:false,fachkorrektur:true});
    d.reviewPaket=async()=>p;d.reviewModell=async()=>{trace.push("modell");s.cost=.01;return a;};
    const result=await M.einmallauf(cfg,d);A.equal(result.ok,true);A.equal(result.sollFaelle,2);
    A.equal(trace.filter(x=>x==="modell").length,1);A.equal(s.cache,null);
    const receipt=s.receipt;receipt.idHash=T.ARTIKELSTAND.profilHash;
    T.pruefeGeneratorFachkorrekturVorgaenger(receipt,p,profile,cfg.commit);
    for(const change of [{ok:false},{runtimeCommit:"b".repeat(40)},{offeneKosten:1},{maxUsd:1},{sollFaelle:4},{laufkostenUsd:0},{quittungsschluessel:T.PRUEFAUFWAND.quittung}])
      A.throws(()=>T.pruefeGeneratorFachkorrekturVorgaenger({...receipt,...change},p,profile,cfg.commit),/vorgaenger/);
    const bad=structuredClone(receipt);bad.fachbeleg.antwort.pruefungen[1].profilbezug=true;
    bad.fachbeleg.antwortHash=hash(bad.fachbeleg.antwort);
    A.throws(()=>T.pruefeGeneratorFachkorrekturVorgaenger(bad,p,profile,cfg.commit),/urteil/);
    const env={HELMUT_VORSTART_AUFTRAG:"fachkorrektur",HELMUT_VORSTART_PROFIL:T.ARTIKELSTAND.profilHash,
      HELMUT_VORSTART_COMMIT:cfg.commit,GITHUB_SHA:cfg.commit,GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"ernisch/helmut-pilot",
      GITHUB_REF:"refs/heads/main",GITHUB_EVENT_NAME:"workflow_dispatch",GITHUB_RUN_ATTEMPT:"1",GITHUB_RUN_ID:"12345678901"};
    const c=T.konfiguration(env,cfg.commit,start);A.equal(c.quittung,T.FACHKORREKTUR.quittung);
    A.equal(T.reviewOptionen(c).reasoningEffort,"medium");
    const g=T.konfiguration({...env,HELMUT_VORSTART_AUFTRAG:"generatorfachkorrektur"},cfg.commit,start);
    A.equal(g.generatorfachkorrektur,true);A.equal(g.generatorpruefaufwand,true);A.equal(g.quittung,T.GENERATORFACHKORREKTUR.quittung);
    A.throws(()=>T.pruefeFachkorrekturVorgaenger({},{}),/vorgaenger/);
  });
  console.log(`${n}/${n} Prüfaufwand-Prüfgruppen bestanden; keine Modelle oder Production-Schreibzugriffe.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
