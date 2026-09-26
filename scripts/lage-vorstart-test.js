"use strict";
const assert = require("node:assert/strict"), T = require("./lage-vorstart");
const { hash } = require("../lib/helmut/briefing-speicher");
const profile = {id:"synthetisches-mandat",fullName:"Testperson",partei:"Testpartei",ausschuesse:["Testausschuss"]};
const start = Date.parse("2026-09-26T02:00:00Z"), commit = "a".repeat(40);
const env = {HELMUT_VORSTART_COMMIT:commit,GITHUB_SHA:commit,GITHUB_ACTIONS:"true",
  GITHUB_REPOSITORY:"ernisch/helmut-pilot",GITHUB_REF:"refs/heads/main",GITHUB_EVENT_NAME:"workflow_dispatch",
  GITHUB_RUN_ATTEMPT:"1",HELMUT_VORSTART_PROFIL:T.bindung(profile),GITHUB_RUN_ID:"1234567"};
const cfg = T.konfiguration(env,commit,start);
let count = 0;
async function test(name, fn) { await fn(); count++; console.log("PASS "+name); }
function fixture() {
  const trace=[],state={cost:0,cache:null,finished:null};
  const d={execute:true,now:()=>start,ruhe:async()=>"grundlinie",bestand:async()=>"grundlinie",profile:async()=>profile,
    cache:async()=>state.cache,vorschau:async()=>({available:true,pendingNarrative:true,vorgaenge:[{},{}]}),
    kosten:async()=>({startklar:true,offeneReservierungen:0,limitUsd:4,gebundenUsd:state.cost}),
    laufkosten:async()=>state.cost,reserve:0.212,acquire:async()=>{trace.push("lock");return {granted:true,active:true};},
    release:async()=>trace.push("release"),claim:async()=>{trace.push("claim");return true;},
    finish:async r=>{trace.push("finish");state.finished=r;},gueltig:p=>p?.qualitaet===true,
    build:async(p,o)=>{for(let i=0;i<2;i++){await o.beforeGenerate(p.id);trace.push("modell");state.cost+=0.01;}
      state.cache={payload:{qualitaet:true}};return {available:true,fromCache:false,paragraphs:[{},{}]};}};
  return {d,trace,state};
}
(async()=>{
  await test("Runtime, erstes manuelles main-Dispatch und fester Tag",()=>{
    for(const change of [{GITHUB_SHA:"b".repeat(40)},{GITHUB_REF:"refs/heads/fremd"},{GITHUB_RUN_ATTEMPT:"2"},
      {GITHUB_EVENT_NAME:"push"},{HELMUT_VORSTART_PROFIL:""},{GITHUB_RUN_ID:"fremd"}])
      assert.throws(()=>T.konfiguration({...env,...change},commit,start));
    assert.throws(()=>T.konfiguration(env,commit,Date.parse("2026-09-27T02:00:00Z")));
    assert.throws(()=>T.konfiguration(env,commit,Date.parse("2026-09-26T23:58:00Z")));
  });
  await test("Nurleseplan hat keine Schreib- oder Modellwirkung",async()=>{
    const {d,trace}=fixture();d.execute=false;const r=await T.einmallauf(cfg,d);assert.equal(r.ok,true);assert.deepEqual(trace,[]);
  });
  await test("echter Auftragsweg bindet beide Aufrufe und liest den Tagessatz nach",async()=>{
    const {d,trace,state}=fixture();const r=await T.einmallauf(cfg,d);assert.equal(r.ok,true);assert.equal(r.freigegebeneAufrufe,2);
    assert.equal(state.finished.status,"abgeschlossen");assert.deepEqual(trace,["lock","claim","modell","modell","release","finish"]);
  });
  await test("vorhandener Tagessatz und falsches Profil bleiben unangetastet",async()=>{
    for(const key of ["cache","profile"]){const {d,trace}=fixture();d[key]=async()=>key==="cache"?{payload:{}}:{...profile,id:"fremd"};
      await assert.rejects(T.einmallauf(cfg,d));assert.deepEqual(trace,[]);}
  });
  await test("fehlende aktuelle Quellen stoppen auch den Nurleseplan",async()=>{
    const {d,trace}=fixture();d.execute=false;d.vorschau=async()=>({available:false,reason:"no-current-sources"});
    await assert.rejects(T.einmallauf(cfg,d),/quellen-vorpruefung/);assert.deepEqual(trace,[]);
  });
  await test("verbraucht oder konkurrierend erzeugt keinen Modellaufruf",async()=>{
    for(const key of ["claim","acquire"]){const {d,trace}=fixture();d[key]=async()=>key==="claim"?false:{granted:false,active:true};
      await assert.rejects(T.einmallauf(cfg,d));assert(!trace.includes("modell"));}
  });
  await test("dritter Aufruf stoppt und schliesst den Auftrag erfolglos",async()=>{
    const {d,state,trace}=fixture();d.build=async(p,o)=>{for(let i=0;i<3;i++){await o.beforeGenerate(p.id);trace.push("modell");}};
    await assert.rejects(T.einmallauf(cfg,d),/aufrufgrenze/);assert.equal(trace.filter(x=>x==="modell").length,2);
    assert.equal(state.finished.status,"gestoppt");assert(trace.includes("release"));
  });
  await test("Kosten, Profilabweichung und Restzeit stoppen vor dem zweiten Aufruf",async()=>{
    for(const art of ["reserve","tag","zeit","profil","kosten"]){const {d,trace}=fixture();d.build=async(p,o)=>{
      await o.beforeGenerate(p.id);trace.push("modell");
      if(art==="reserve")d.laufkosten=async()=>0.4;
      if(art==="tag")d.now=()=>start+86400000;
      if(art==="zeit")d.now=()=>start+180000;
      if(art==="profil")d.bestand=async()=>"veraendert";
      if(art==="kosten")d.kosten=async()=>({startklar:false,offeneReservierungen:1,limitUsd:4,gebundenUsd:1});
      await o.beforeGenerate(p.id);trace.push("modell");};
      await assert.rejects(T.einmallauf(cfg,d));assert.equal(trace.filter(x=>x==="modell").length,1);assert(trace.includes("release"));}
  });
  await test("Modellablehnung und fehlender gespeicherter Beleg werden niemals Erfolg",async()=>{
    for(const art of ["modell","speicher"]){const {d,state}=fixture();
      if(art==="modell")d.build=async(p,o)=>{await o.beforeGenerate(p.id);return {available:false,reason:"lage-qualitaet"};};
      else d.gueltig=()=>false;
      const r=await T.einmallauf(cfg,d);assert.equal(r.ok,false);assert.equal(state.finished.status,"gestoppt");}
  });
  await test("Zeitauftrag hat feste eigene Quittung, Profil- und Alttextbindung",()=>{
    const neu = T.konfiguration({...env,HELMUT_VORSTART_AUFTRAG:"zeitbezug",
      HELMUT_VORSTART_PROFIL:T.ZEITBEZUG.profilHash},commit,start);
    assert.equal(neu.quittung,T.ZEITBEZUG.quittung);assert.notEqual(neu.quittung,cfg.quittung);
    assert.equal(neu.altHash,T.ZEITBEZUG.altHash);assert.equal(neu.reparatur,true);
    assert.throws(()=>T.konfiguration({...env,HELMUT_VORSTART_AUFTRAG:"zeitbezug"},commit,start),/reparaturbindung/);
    assert.throws(()=>T.konfiguration({...env,HELMUT_VORSTART_AUFTRAG:"erneut"},commit,start),/auftrag/);
  });
  const alt = {id:"bf-test",generated_at:"2026-09-26T01:00:00Z",payload:{qualitaet:false,text:"Unbelegter Tagesbezug"}};
  await test("Datumsbindung hat eine dritte feste Quittung bei gleicher Schutzbindung",()=>{
    const neu = T.konfiguration({...env,HELMUT_VORSTART_AUFTRAG:"datumsbindung",
      HELMUT_VORSTART_PROFIL:T.DATUMSBINDUNG.profilHash},commit,start);
    assert.equal(neu.quittung,T.DATUMSBINDUNG.quittung);
    assert.notEqual(neu.quittung,T.ZEITBEZUG.quittung);assert.notEqual(neu.quittung,cfg.quittung);
    assert.equal(neu.altHash,T.ZEITBEZUG.altHash);assert.equal(neu.reparatur,true);
    assert.throws(()=>T.konfiguration({...env,HELMUT_VORSTART_AUFTRAG:"datumsbindung"},commit,start),/reparaturbindung/);
  });
  const reparatur = {...cfg,reparatur:true,altHash:hash(alt.payload),quittung:T.ZEITBEZUG.quittung};
  await test("Reparatur verlangt genau den fachlich ungueltigen Altstand",async()=>{
    for(const variante of [null,{...alt,payload:{fremd:true}},alt]){
      const {d,state,trace}=fixture();state.cache=variante;
      if(variante===alt)d.gueltig=()=>true;
      await assert.rejects(T.einmallauf(reparatur,d),/reparatur-altstand/);assert.deepEqual(trace,[]);
    }
  });
  await test("Reparaturplan schreibt nichts; Erfolg erfordert vollstaendige Altsicherung",async()=>{
    for(const mode of ["plan","korrekt","ohne-historie","teilhistorie"]){
      const {d,state,trace}=fixture();state.cache=structuredClone(alt);d.execute=mode!=="plan";
      const build=d.build;d.build=async(p,o)=>{
        assert.equal(o.repairIncomplete,true);const r=await build(p,o);
        if(mode==="korrekt")state.cache.payload.vorherigerStand=structuredClone(alt);
        if(mode==="teilhistorie")state.cache.payload.vorherigerStand={payload:alt.payload};return r;
      };
      const r=await T.einmallauf(reparatur,d);assert.equal(r.ok,["plan","korrekt"].includes(mode));
      if(mode==="plan")assert.deepEqual(trace,[]);
      else assert.equal(state.finished.quittungsschluessel,T.ZEITBEZUG.quittung);
    }
  });
  await test("Abweichender Altstand stoppt vor dem zweiten Modellaufruf",async()=>{
    const {d,state,trace}=fixture();state.cache=structuredClone(alt);
    d.build=async(p,o)=>{await o.beforeGenerate(p.id);trace.push("modell");
      state.cache.generated_at="2026-09-26T03:00:00Z";await o.beforeGenerate(p.id);};
    await assert.rejects(T.einmallauf(reparatur,d),/reparatur-konkurrenz/);
    assert.equal(trace.filter(x=>x==="modell").length,1);assert.equal(state.finished.status,"gestoppt");
  });
  console.log(count+" Gruppen erfolgreich");
})().catch(e=>{console.error(e);process.exitCode=1;});
