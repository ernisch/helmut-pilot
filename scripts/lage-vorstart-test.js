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
  await test("Timeout mit ungeklärter Vollreserve schliesst terminal und gibt keine Kosten frei",async()=>{
    const {d,state,trace}=fixture();let kostenLese=0;
    d.kosten=async()=>({startklar:++kostenLese<4,offeneReservierungen:kostenLese<4?0:1,limitUsd:4,gebundenUsd:0.214976});
    d.build=async(p,o)=>{for(let i=0;i<2;i++){await o.beforeGenerate(p.id);trace.push("modell");}
      state.cost=0.214976;return {available:false,reason:"ai-provider-unavailable"};};
    await assert.rejects(T.einmallauf(cfg,d),/nachkosten/);
    assert.equal(state.finished.status,"gestoppt");assert.equal(state.finished.ok,false);
    assert.equal(state.finished.ergebnisGrund,"ai-provider-unavailable");
    assert.equal(state.finished.offeneKosten,1);assert.equal(state.finished.laufkostenUsd,0.214976);
    assert.equal(trace.filter(x=>x==="modell").length,2);assert.equal(trace.at(-1),"finish");
    assert.equal(state.cost,0.214976);assert.equal(state.cache,null);
  });
  await test("Fehler in Entsperren und Nachlesung hinterlassen keinen laufenden Erfolgsauftrag",async()=>{
    for(const art of ["release","lesen","profil","kosten"]){
      const {d,state}=fixture(),build=d.build;
      d.build=async(p,o)=>{const r=await build(p,o);
        if(art==="release")d.release=async()=>{throw new Error("interner Fehler mit vertraulichem Inhalt");};
        if(art==="lesen")d.kosten=async()=>{throw new Error("interner Lesefehler");};
        if(art==="profil")d.ruhe=async()=>"abweichend";
        if(art==="kosten")d.laufkosten=async()=>NaN;
        return r;};
      await assert.rejects(T.einmallauf(cfg,d));assert.equal(state.finished.status,"gestoppt");
      assert.equal(state.finished.ok,false);assert.equal(state.finished.grund,"nachkontrolle-fehlgeschlagen");
      assert(!JSON.stringify(state.finished).includes("interner"));
      if(art==="lesen"||art==="profil")assert.equal(state.finished.profileUnveraendert,false);
    }
  });
  await test("Zeitauftrag hat feste eigene Quittung, Profil- und Alttextbindung",()=>{
    const neu = T.konfiguration({...env,HELMUT_VORSTART_AUFTRAG:"zeitbezug",
      HELMUT_VORSTART_PROFIL:T.ZEITBEZUG.profilHash},commit,start);
    assert.equal(neu.quittung,T.ZEITBEZUG.quittung);assert.notEqual(neu.quittung,cfg.quittung);
    assert.equal(neu.altHash,T.ZEITBEZUG.altHash);assert.equal(neu.reparatur,true);
    assert.throws(()=>T.konfiguration({...env,HELMUT_VORSTART_AUFTRAG:"zeitbezug"},commit,start),/reparaturbindung/);
    assert.throws(()=>T.konfiguration({...env,HELMUT_VORSTART_AUFTRAG:"erneut"},commit,start),/auftrag/);
  });
  await test("Einzelquellenauftrag hat eigene Quittung und unveraenderte Artikel-/Profilbindung",()=>{
    const neu=T.konfiguration({...env,HELMUT_VORSTART_AUFTRAG:"einzelquelle",
      HELMUT_VORSTART_PROFIL:T.EINZELQUELLE.profilHash},commit,start);
    assert.equal(neu.quittung,T.EINZELQUELLE.quittung);assert.notEqual(neu.quittung,T.ARTIKELSTAND.quittung);
    assert.equal(neu.artikelstand,true);assert.equal(neu.reparatur,false);
    assert.throws(()=>T.konfiguration({...env,HELMUT_VORSTART_AUFTRAG:"einzelquelle"},commit,start),/artikelstandbindung/);
  });
  await test("Einzelquellenauftrag verlangt genau den abgeschlossenen gescheiterten Vorlauf",()=>{
    const vorher={status:"gestoppt",ok:false,runId:"nachlauf500-36243162049",idHash:T.ARTIKELSTAND.profilHash,
      runtimeCommit:"d826ad1ef3f64cb578821a5e0b60e98105a9f5ee",grund:"ai-text-source-support",gespeichert:false,
      freigegebeneAufrufe:2,offeneKosten:0,profileUnveraendert:true,lesebeweis:{absatzHash:T.ARTIKELSTAND.absatzHash}};
    T.pruefeEinzelquellenVorgaenger(vorher);
    for(const aenderung of [{status:"laeuft"},{ok:true},{runId:"fremd"},{idHash:"fremd"},{runtimeCommit:"fremd"},
      {grund:"ai-provider-unavailable"},{gespeichert:true},{freigegebeneAufrufe:1},{offeneKosten:1},
      {profileUnveraendert:false},{lesebeweis:null}])
      assert.throws(()=>T.pruefeEinzelquellenVorgaenger({...vorher,...aenderung}),/altquittung/);
  });
  await test("Mandatsauswahl bindet nur den neuen belegten Vorlauf und eine eigene Quittung",()=>{
    const neu=T.konfiguration({...env,HELMUT_VORSTART_AUFTRAG:"mandatsauswahl",
      HELMUT_VORSTART_PROFIL:T.MANDATSAUSWAHL.profilHash},commit,start);
    assert.equal(neu.quittung,T.MANDATSAUSWAHL.quittung);assert.notEqual(neu.quittung,T.EINZELQUELLE.quittung);
    assert.equal(neu.artikelstand,true);assert.equal(neu.reparatur,false);
    const vorher={status:"gestoppt",ok:false,runId:"nachlauf500-36244835548",idHash:T.ARTIKELSTAND.profilHash,
      runtimeCommit:"13a152e8bb880a97435cbc0a8b130248980c69a7",grund:"ai-text-source-support",gespeichert:false,
      freigegebeneAufrufe:2,offeneKosten:0,profileUnveraendert:true,lesebeweis:{absatzHash:T.ARTIKELSTAND.absatzHash}};
    T.pruefeEinzelquellenVorgaenger(vorher,neu.quittung);
    assert.throws(()=>T.pruefeEinzelquellenVorgaenger(vorher),/altquittung/);
    assert.throws(()=>T.pruefeEinzelquellenVorgaenger(vorher,"fremd"),/altquittung/);
    for(const aenderung of [{status:"laeuft"},{runId:"nachlauf500-36243162049"},{offeneKosten:1},
      {runtimeCommit:"d826ad1ef3f64cb578821a5e0b60e98105a9f5ee"},{gespeichert:true}])
      assert.throws(()=>T.pruefeEinzelquellenVorgaenger({...vorher,...aenderung},neu.quittung),/altquittung/);
  });
  await test("Zustaendigkeitsnachweis bindet den letzten Vorlauf ohne Aufweichen alter Auftraege",()=>{
    const neu=T.konfiguration({...env,HELMUT_VORSTART_AUFTRAG:"zustaendigkeit",
      HELMUT_VORSTART_PROFIL:T.ZUSTAENDIGKEIT.profilHash},commit,start);
    assert.equal(neu.quittung,T.ZUSTAENDIGKEIT.quittung);assert.equal(neu.artikelstand,true);
    assert.notEqual(neu.quittung,T.MANDATSAUSWAHL.quittung);assert.equal(neu.reparatur,false);
    const vorher={status:"gestoppt",ok:false,runId:"nachlauf500-36246123158",idHash:T.ARTIKELSTAND.profilHash,
      runtimeCommit:"7d398ee914f1b713e6beccb930789846f657dedd",grund:"ai-text-source-support",gespeichert:false,
      freigegebeneAufrufe:2,offeneKosten:0,profileUnveraendert:true,lesebeweis:{absatzHash:T.ARTIKELSTAND.absatzHash}};
    T.pruefeEinzelquellenVorgaenger(vorher,neu.quittung);
    assert.throws(()=>T.pruefeEinzelquellenVorgaenger(vorher,T.MANDATSAUSWAHL.quittung),/altquittung/);
    for(const aenderung of [{status:"laeuft"},{offeneKosten:1},{runId:"fremd"},{runtimeCommit:"fremd"},
      {gespeichert:true},{lesebeweis:null},{profileUnveraendert:false}])
      assert.throws(()=>T.pruefeEinzelquellenVorgaenger({...vorher,...aenderung},neu.quittung),/altquittung/);
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
  await test("Mandatspruefung behaelt dieselben Schutzgrenzen und eine eigene verbrauchbare Quittung",()=>{
    const neu = T.konfiguration({...env,HELMUT_VORSTART_AUFTRAG:"mandatspruefung",
      HELMUT_VORSTART_PROFIL:T.MANDATSPRUEFUNG.profilHash},commit,start);
    assert.equal(neu.quittung,T.MANDATSPRUEFUNG.quittung);
    assert(![cfg.quittung,T.ZEITBEZUG.quittung,T.DATUMSBINDUNG.quittung].includes(neu.quittung));
    assert.equal(neu.altHash,T.ZEITBEZUG.altHash);assert.equal(neu.reparatur,true);
    assert.throws(()=>T.konfiguration({...env,HELMUT_VORSTART_AUFTRAG:"mandatspruefung"},commit,start),/reparaturbindung/);
  });
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
  // --- Neue Grundlage: belegter Bundestags-Artikelstand (kein Reparaturauftrag) ---
  // Produktionspfad bleibt fest; hier nur eine synthetische Bindung als eingespielter
  // erwarteter Vertrag, damit der echte Leserweg ohne Production-Daten pruefbar ist.
  const crypto = require("node:crypto");
  const standModul = require("../lib/helmut/bundestag-artikelstand");
  const artikelText = "Der Bundestag hat am 25. September 2026 den Entwurf eines Gesetzes zur Aenderung des "
    + "Bundespolizeigesetzes in geaenderter Fassung beschlossen und an den Innenausschuss zurueckgewiesen.";
  const artikelUrl = "https://bundestag.de/dokumente/textarchiv/2026/kw39-bundespolizeigesetz-1087654";
  const artikelTitel = "Bundestag beschliesst Aenderung des Bundespolizeigesetzes";
  function artikelQuelle(text = artikelText) {
    const absatzHash = crypto.createHash("sha256").update(text).digest("hex");
    const standHash = standModul.standHashFuer({ url:artikelUrl, titel:artikelTitel,
      publikationstag:"2026-09-25", absatzHash });
    return { id:"rd-" + standHash, content_hash:standHash, published_at:null, url:artikelUrl,
      canonical_url:artikelUrl, title:artikelTitel, source_name:"Deutscher Bundestag", summary:text,
      bundestag_artikelstand:{ version:1, herkunft:"bundestag-textarchiv-leitabsatz", url:artikelUrl,
        titel:artikelTitel, publikationstag:"2026-09-25", absatzHash, standHash } };
  }
  // Drift = dieselbe Quellenkennung, aber der belegte Absatz weicht ab -> fail closed.
  const quelle = artikelQuelle(), drift = { ...quelle, summary:artikelText + " Nachtrag." };
  const absatzHash = crypto.createHash("sha256").update(artikelText).digest("hex");
  const erwartet = { ...T.ARTIKELSTAND, profilHash:T.bindung(profile), quelleId:quelle.id,
    vorgangId:"vg-test-artikelstand", standHash:quelle.content_hash, absatzHash,
    absatzZeichen:artikelText.length };
  const artikelCfg = { ...cfg, artikelstand:true, profilHash:T.bindung(profile), quittung:T.ARTIKELSTAND.quittung };
  function artikelFixture() {
    const { d, trace, state } = fixture();
    d.artikelstand = async () => T.artikelstandGrundlage([quelle], erwartet, start);
    d.vorschau = async () => ({ available:true, pendingNarrative:true, vorgaenge:[
      { vorgangId:erwartet.vorgangId, sources:[{ name:"Deutscher Bundestag", title:artikelTitel, url:artikelUrl }] },
      { vorgangId:"vg-zweit" }] });
    return { d, trace, state };
  }
  await test("Artikelstand hat eigene Quittung, feste Profilbindung und keine Reparatur",()=>{
    const neu = T.konfiguration({ ...env, HELMUT_VORSTART_AUFTRAG:"artikelstand",
      HELMUT_VORSTART_PROFIL:T.ARTIKELSTAND.profilHash }, commit, start);
    assert.equal(neu.quittung,T.ARTIKELSTAND.quittung);assert.equal(neu.artikelstand,true);
    assert.equal(neu.reparatur,false);assert.equal(neu.altHash,null);
    assert(![cfg.quittung,T.ZEITBEZUG.quittung,T.DATUMSBINDUNG.quittung,T.MANDATSPRUEFUNG.quittung]
      .includes(neu.quittung));
    assert.throws(()=>T.konfiguration({ ...env, HELMUT_VORSTART_AUFTRAG:"artikelstand" },commit,start),/artikelstandbindung/);
  });
  await test("Lagevorschau muss die Grundlage als Karte des richtigen Vorgangs zeigen",async()=>{
    const { d, trace } = artikelFixture();
    d.vorschau = async () => ({ available:true, pendingNarrative:true, vorgaenge:[
      { vorgangId:"vg-fremd", sources:[{ title:artikelTitel, url:artikelUrl }] }, { vorgangId:erwartet.vorgangId }] });
    await assert.rejects(T.einmallauf(artikelCfg,d),/artikelstand-karte/);assert.deepEqual(trace,[]);
    const nah = artikelFixture();
    nah.d.vorschau = async () => ({ available:true, pendingNarrative:true, vorgaenge:[
      { vorgangId:erwartet.vorgangId, sources:[{ title:artikelTitel, url:"https://example.org/andere" }] }, {}] });
    await assert.rejects(T.einmallauf(artikelCfg,nah.d),/artikelstand-karte/);assert.deepEqual(nah.trace,[]);
  });
  await test("Artikelstandplan liest nur und schreibt oder ruft nie",async()=>{
    const { d, trace } = artikelFixture();d.execute=false;
    const r = await T.einmallauf(artikelCfg,d);
    assert.equal(r.ok,true);assert.equal(r.lesebeweis.standHash,quelle.content_hash);
    assert.equal(r.lesebeweis.absatzZeichen,artikelText.length);assert.deepEqual(trace,[]);
  });
  await test("Artikelstand verlangt den fehlenden Tagessatz und laesst Altes unberuehrt",async()=>{
    const { d, trace } = artikelFixture();d.cache=async()=>({ payload:{ qualitaet:true } });
    await assert.rejects(T.einmallauf(artikelCfg,d),/bestehender-tagessatz/);assert.deepEqual(trace,[]);
  });
  await test("Artikelstanddrift stoppt vor dem ersten und vor dem zweiten bezahlten Aufruf",async()=>{
    for (const [stoppAb, erwarteteAufrufe] of [[3,0],[4,1]]) {
      const { d, trace, state } = artikelFixture();let grundlagen = 0;
      d.artikelstand = async () => { grundlagen += 1;
        return T.artikelstandGrundlage([grundlagen >= stoppAb ? drift : quelle],erwartet,start); };
      await assert.rejects(T.einmallauf(artikelCfg,d),/artikelstand-stand/);
      assert.equal(trace.filter(x=>x==="modell").length,erwarteteAufrufe);
      assert.equal(state.finished.status,"gestoppt");
    }
  });
  await test("Artikelstand laeuft einmalig erfolgreich mit Lesebeweis in der Quittung",async()=>{
    const { d, state, trace } = artikelFixture();
    const r = await T.einmallauf(artikelCfg,d);
    assert.equal(r.ok,true);assert.equal(r.freigegebeneAufrufe,2);
    assert.deepEqual(trace,["lock","claim","modell","modell","release","finish"]);
    assert.equal(state.finished.status,"abgeschlossen");
    assert.equal(state.finished.quittungsschluessel,T.ARTIKELSTAND.quittung);
    assert.equal(state.finished.idHash,T.bindung(profile));
    assert.equal(state.finished.lesebeweis.standHash,quelle.content_hash);
    assert.equal(state.finished.lesebeweis.publikationstag,"2026-09-25");
    assert.equal(state.finished.lesebeweis.absatzZeichen,artikelText.length);
    assert.equal(state.finished.funktionsnachweis500,false);
  });
  // --- Neuer Generatornachweis: eigene Quittung, unveraenderter Artikelstand und genau ---
  // --- eine Vorgaengerbindung an den neuen abgeschlossenen Vierfall-Nachweis (nur lesend). ---
  const generatorCfg = { ...artikelCfg, quittung:T.GENERATORNACHWEIS.quittung, generatornachweis:true };
  const vierfallPaare = () => [0,1,2,3].flatMap(a => [0,1,2,3].filter(b => b > a).map(b => ({
    erster_absatz:a,zweiter_absatz:b,eigenstaendige_sachverhalte:true,
    pruefbegruendung:"Getrennte konkrete Sachverhalte oder Prognosen." })));
  const vierfall = () => ({
    status:"abgeschlossen",ok:true,grund:null,quittungsschluessel:T.MANDATSURTEIL.quittung,
    runId:"nachlauf500-36249646222",runtimeCommit:"700001011b971cb0d1eb3dd552905fd66601e4c6",
    idHash:T.GENERATORNACHWEIS.profilHash,profile:1,sollFaelle:4,
    bilanz:[{ id:"polizei-haushalt",erwartet:true,erhalten:true,bestanden:true },
      { id:"sanktionen-auswaertiges",erwartet:true,erhalten:true,bestanden:true },
      { id:"private-heizkosten-haushalt",erwartet:false,erhalten:false,bestanden:true },
      { id:"energiesteuer-auswaertiges",erwartet:false,erhalten:false,bestanden:true }],
    fachbeleg:{antwort:{vergleiche:vierfallPaare()}},
    paarvergleich:true,paketHash:"5829cffed6370571424550153403b90f88cfe122ceb511d3a04d7bc8f8ba62bb",
    freigegebeneAufrufe:1,offeneKosten:0,profileUnveraendert:true,gespeicherterLageText:false,
    funktionsnachweis500:false,automatischeWiederholung:false });
  await test("Generatornachweis hat eigene Quittung und unveraenderte Artikel-/Profilbindung",()=>{
    const neu = T.konfiguration({ ...env, HELMUT_VORSTART_AUFTRAG:"generatornachweis",
      HELMUT_VORSTART_PROFIL:T.GENERATORNACHWEIS.profilHash }, commit, start);
    assert.equal(neu.quittung,T.GENERATORNACHWEIS.quittung);
    assert.notEqual(neu.quittung,T.ARTIKELSTAND.quittung);
    assert.notEqual(neu.quittung,T.MANDATSURTEIL.quittung);
    assert.equal(neu.artikelstand,true);assert.equal(neu.reparatur,false);assert.equal(neu.altHash,null);
    assert.equal(neu.generatornachweis,true);assert.equal(neu.mandatsurteil,false);
    assert.equal(neu.profilHash,T.ARTIKELSTAND.profilHash);
    assert.throws(()=>T.konfiguration({ ...env, HELMUT_VORSTART_AUFTRAG:"generatornachweis" },commit,start),/artikelstandbindung/);
  });
  await test("Generatornachweis bindet nur den neuen abgeschlossenen Vierfall-Nachweis",()=>{
    T.pruefeGeneratorVorgaenger(vierfall());
    assert.throws(()=>T.pruefeGeneratorVorgaenger(undefined),/generator-vorgaenger/);
    for(const aenderung of [{status:"laeuft"},{ok:false},{grund:"gestoppt"},{runId:"fremd"},
      {runtimeCommit:"fremd"},{idHash:"fremd"},{profile:2},{sollFaelle:5},
      {quittungsschluessel:"lage-artikelstand-20260926-a"},{paketHash:"fremd"},
      {freigegebeneAufrufe:2},{offeneKosten:1},{profileUnveraendert:false},
      {gespeicherterLageText:true},{bilanz:vierfall().bilanz.slice(0,3)},
      {bilanz:vierfall().bilanz.map((r,i)=>i===2?{ ...r,erhalten:true }:r)},
      {bilanz:vierfall().bilanz.map((r,i)=>i===0?{ ...r,bestanden:false }:r)},
      {paarvergleich:false,fachbeleg:null}])
      assert.throws(()=>T.pruefeGeneratorVorgaenger({ ...vierfall(),...aenderung }),/generator-vorgaenger/);
  });
  await test("Generatornachweis verlangt Paarbelege und positives Sammelurteil",()=>{
    const paare = [];
    for(let a=0;a<4;a++)for(let b=a+1;b<4;b++)paare.push({ erster_absatz:a,zweiter_absatz:b,
      eigenstaendige_sachverhalte:true,pruefbegruendung:"Getrennte konkrete Sachverhalte oder Prognosen." });
    const beleg = { ...vierfall(), paarvergleich:false, fachbeleg:{ antwort:{ vergleiche:paare } } };
    assert.throws(()=>T.pruefeGeneratorVorgaenger(beleg),/generator-vorgaenger/);
    T.pruefeGeneratorVorgaenger({...beleg,paarvergleich:true});
    assert.throws(()=>T.pruefeGeneratorVorgaenger({ ...beleg,paarvergleich:true,
      fachbeleg:{ antwort:{ vergleiche:paare.slice(0,5) } } }),/generator-vorgaenger/);
  });
  await test("Generatornachweis ist planfaehig und der Einmallauf speichert mit Lesebeweis",async()=>{
    const plan = artikelFixture();plan.d.execute=false;
    const r = await T.einmallauf(generatorCfg,plan.d);
    assert.equal(r.ok,true);assert.equal(r.maxAufrufe,2);assert.equal(r.maxUsd,0.50);assert.deepEqual(plan.trace,[]);
    const echt = artikelFixture();
    const s = await T.einmallauf(generatorCfg,echt.d);
    assert.equal(s.ok,true);assert.equal(s.freigegebeneAufrufe,2);
    assert.equal(echt.state.finished.status,"abgeschlossen");
    assert.equal(echt.state.finished.quittungsschluessel,T.GENERATORNACHWEIS.quittung);
    assert.equal(echt.state.finished.lesebeweis.standHash,quelle.content_hash);
  });
  await test("Auswahlbegruendung bindet eigenen Erstauftrag und exakt den gescheiterten Generator",()=>{
    const neu=T.konfiguration({...env,HELMUT_VORSTART_AUFTRAG:"auswahlbegruendung",
      HELMUT_VORSTART_PROFIL:T.ARTIKELSTAND.profilHash},commit,start);
    assert.equal(neu.quittung,T.AUSWAHLBEGRUENDUNG.quittung);
    assert.notEqual(neu.quittung,T.GENERATORNACHWEIS.quittung);
    assert.equal(neu.artikelstand,true);assert.equal(neu.generatornachweis,true);
    assert.equal(neu.reparatur,false);assert.equal(neu.mandatsurteil,false);
    const alt={status:"gestoppt",ok:false,quittungsschluessel:T.GENERATORNACHWEIS.quittung,
      runId:"nachlauf500-36250788961",runtimeCommit:"1d24245e2556d395bb73dd6d61aa9495a04c27f1",
      idHash:T.ARTIKELSTAND.profilHash,grund:"ai-text-source-support",gespeichert:false,
      freigegebeneAufrufe:2,offeneKosten:0,profileUnveraendert:true,
      lesebeweis:{absatzHash:T.ARTIKELSTAND.absatzHash}};
    T.pruefeAuswahlVorgaenger(alt);
    for(const change of [{status:"laeuft"},{ok:true},{quittungsschluessel:T.AUSWAHLBEGRUENDUNG.quittung},
      {runId:"fremd"},{runtimeCommit:"fremd"},{idHash:"fremd"},{grund:"anderer"},{gespeichert:true},
      {freigegebeneAufrufe:1},{offeneKosten:1},{profileUnveraendert:false},{lesebeweis:null}])
      assert.throws(()=>T.pruefeAuswahlVorgaenger({...alt,...change}),/auswahl-vorgaenger/);
  });
  console.log(count+" Gruppen erfolgreich");
})().catch(e=>{console.error(e);process.exitCode=1;});
