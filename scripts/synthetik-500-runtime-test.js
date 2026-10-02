"use strict";
// Ausschliesslich Offlinefixturen. Keine Freigaben oder Productionbelege.
const A = require("node:assert/strict");
const P = require("../lib/helmut/synthetik-500-profile");
const V0 = require("../lib/helmut/synthetik-500-vertrag");
const I = require("../lib/helmut/synthetik-500-import");
const F = require("./realkohorte-500-runtime-test");
const G0 = require("./synthetik-500-start-sql");
const S0 = require("../lib/helmut/synthetik-500-startschutz");
const R0 = require("../lib/helmut/synthetik-500-end-runtime");
const W0 = require("./synthetik-500-endwaechter");
const COMMIT = "c".repeat(40), NOW = Date.parse("2026-10-01T10:01:00.000Z");
const clone = x => structuredClone(x);
function fixtureZeitfenster(now) {
  A.ok(Number.isSafeInteger(now));
  const tagStart=Date.parse(new Date(now).toISOString().slice(0,10)+"T00:00:00.000Z"),tagEnde=tagStart+86400000-1;
  // Kosten bleiben an den wirklichen UTC-Tag gebunden. Die SQL-Pruefung braucht
  // ihr unveraendertes frisches 1-Minuten-Fenster vor dem Tageswechsel.
  const warteMs=tagEnde-now<60000?tagEnde-now+1:0;
  return {warteMs,beobachtetAm:new Date(Math.max(now-1000,tagStart)).toISOString(),
    startBis:new Date(Math.min(now+180000,tagEnde-1)).toISOString(),
    endeAm:new Date(Math.min(now+600000,tagEnde)).toISOString()};
}
function fixture({variante="basis-v1",snapshot=null,operationId="synthetik500-runtime-offline-20261001",now=NOW}={}) {
  const paket=P.erzeuge({variante}),bytes=P.serialisiere(paket),V=V0.erzeugeVertrag(bytes),G=G0.erzeugeStartSql(bytes);
  const fenster=fixtureZeitfenster(now);A.equal(fenster.warteMs,0,"isolierte-fixture-utc-startfenster-fehlt");
  const rows=I.erzeugeZeilen(paket),am=fenster.beobachtetAm,day=am.slice(0,10);
  snapshot ||= {beobachtetAm:am,mandate_profiles:rows.mandateRows.map(p=>({...p,geloescht_at:null,updated_at:am})),
    profiles:[...rows.profileRows,{id:"synthetik500-fremdprofil",name:"Fiktive isolierte Fremdidentitaet"}]};
  const kosten={...F.fixture().manifest.kosten,tag:day,beobachtetAm:am};
  const manifest=V.vorbereiten({paketBytes:bytes,snapshot,operationId,vorflugAm:am,
    startBis:fenster.startBis,endeAm:fenster.endeAm,kosten});
  const full=F.belegFixture({manifest});
  full.technik={...full.phaseA,art:"synthetik-technische-zugriffssperren-kommunikation-snapshot-rueckweg"};delete full.phaseA;
  for(const key of ["technik","fach"]) {full[key].paketHash=V.PAKET_HASH;full[key].idsHash=V.IDS_HASH;full[key].entschiedenAm=am;}
  for(const key of ["production","ruhe","kosten","landesversorgung","endwaechter"])full[key].beobachtetAm=am;
  full.landesversorgung.nachrichtenfenster.bisTag=day;full.landesversorgung.berlin.publikationstag=day;
  const {endwaechter,...belege}=full;
  const runtimeManifest=G.baueRuntimeManifest({manifest,snapshot,belege},bytes,now);
  endwaechter.manifestHash=V.hash(runtimeManifest);
  const aktivierungsGo={version:"helmut-synthetik500-aktivierungs-go/1",operationId,manifestHash:V.hash(runtimeManifest),
    productionCommit:COMMIT,aktion:"EXAKT_500_SYNTHETISCHE_PROFILE_AKTIVIEREN_UND_TEST_STARTEN",freigegebenAm:am,
    aussteller:"Offlinefixture-keine-Betreiberfreigabe",primaerbeleg:{referenz:"fixture:go",sha256:"a".repeat(64)}};
  const prepare={runtimeManifest,snapshot,belege,schritt:"vorbereiten",aktivierungsGo:null};
  const activate={runtimeManifest,snapshot,belege:full,schritt:"aktivieren",aktivierungsGo};
  const auftrag={operationId,manifestHash:V.hash(runtimeManifest),productionCommit:COMMIT,grund:"notstopp"};
  const status={version:"helmut-synthetik500-status/1",...auftrag,profilManifestHash:V.hash(manifest),
    paketHash:V.PAKET_HASH,idsHash:V.IDS_HASH,beobachtetAm:am,zustand:"aktiv",gesamt:500,identitaeten:501,aktiv:500,
    fremdUnveraendert:true,fachfelderUnveraendert:true,quittungBindungBestaetigt:true,endeAm:manifest.endeAm};delete status.grund;
  return {paket,bytes,V,G,manifest,snapshot,belege,full,runtimeManifest,prepare,activate,auftrag,status};
}
function pruefeFixtureZeitfenster() {
  for(const am of ["2026-10-01T23:58:42.117Z","2026-10-01T23:58:59.999Z","2026-10-02T00:00:00.000Z","2026-10-02T00:00:00.001Z"]){
    const now=Date.parse(am),x=fixture({now});
    A.equal(x.manifest.vorflugAm.slice(0,10),am.slice(0,10));
    A.equal(x.manifest.kosten.tag,am.slice(0,10));A.equal(x.manifest.endeAm.slice(0,10),am.slice(0,10));
    A.ok(Date.parse(x.manifest.vorflugAm)<=now && now<Date.parse(x.manifest.startBis));
    A.ok(Date.parse(x.manifest.startBis)<Date.parse(x.manifest.endeAm));
    x.G.baueSql(x.prepare,x.bytes,now);x.G.baueSql(x.activate,x.bytes,now);
  }
  const x=fixture({now:Date.parse("2026-10-01T23:58:42.117Z")}),m=clone(x.manifest);
  m.endeAm="2026-10-02T00:08:42.117Z";
  A.throws(()=>x.V.pruefeManifest(m,x.bytes,x.snapshot),/kosten-zeit/);
  for(const [am,wait] of [["2026-10-01T23:59:00.000Z",60000],["2026-10-01T23:59:59.999Z",1]]){
    const now=Date.parse(am);A.equal(fixtureZeitfenster(now).warteMs,wait);
    A.throws(()=>fixture({now}),/isolierte-fixture-utc-startfenster-fehlt/);
    A.equal(fixtureZeitfenster(now+wait).warteMs,0);
  }
}
async function main(){
  let pass=0;const test=async(name,fn)=>{await fn();pass++;console.log("PASS "+name);};
  await test("UTC-Tagesgrenze bindet echte Testzeit; taguebergreifende Kosten bleiben gesperrt",pruefeFixtureZeitfenster);
  await test("Beide geschlossenen Varianten binden exakt500/1500, neueIDs, alle importierten Fachfelder",()=>{
    for(const variante of P.VARIANTEN){const x=fixture({variante});A.equal(x.manifest.ids.length,500);
      A.equal(x.manifest.erwartungenHash,x.paket.bindung.erwartungenHash);A.equal(x.manifest.profileHash,x.paket.bindung.profileHash);
      A.equal(x.V.pruefeManifest(x.manifest,x.bytes,x.snapshot),x.manifest);
      for(const mutate of [s=>s.mandate_profiles[0].fachpolitische_schwerpunkte.push("Drift"),s=>s.profiles[0].name="Drift",
        s=>s.mandate_profiles[0].aktiv=true,s=>s.profiles.push({id:"fremd-extra",name:"fremd"})]){
        const snapshot=clone(x.snapshot);mutate(snapshot);A.throws(()=>x.V.pruefeManifest(x.manifest,x.bytes,snapshot));}
    }
  });
  await test("Realpaket, Realoperation und Paket/Feld/Erwartungshashdrift bleiben gesperrt",()=>{
    const x=fixture();A.throws(()=>V0.pruefePaket(require("node:fs").readFileSync(require("node:path").join(__dirname,"../daten/mandatsprofile-bundestag-berlin-brandenburg-20260929.json"))));
    for(const key of ["paketHash","idsHash","profileHash","erwartungenHash"]){const m=clone(x.manifest);m[key]="0".repeat(64);A.throws(()=>x.V.pruefeManifest(m,x.bytes,x.snapshot));}
    const m=clone(x.manifest);m.operationId="real500-runtime-offline-20261001";A.throws(()=>x.V.pruefeManifest(m,x.bytes,x.snapshot));
  });
  await test("0aktivVorbereitung behauptet weder GO noch lebenden Waechter/Rechtsfreigabe",()=>{
    const x=fixture(),e=x.G.baueEnvelope(x.prepare,x.bytes,NOW),r=S0.pruefeVorbereitung({manifest:x.manifest,snapshot:x.snapshot,belege:x.belege},x.bytes,NOW);
    A.equal(e.quittung,null);A.equal(e.startbelege.aktivierungsGo,null);A.equal(e.startbelege.endwaechterBereit,null);
    A.equal(e.startbelege.qualifizierteRechtsfreigabe,undefined);A.ok(e.startbelege.technikvertrag);
    A.equal(r.aktivierungsrecht,false);A.equal(r.starttorFreigegeben,false);
    A.doesNotMatch(x.G.baueSql(x.prepare,x.bytes,NOW),/update public\.mandate_profiles/);
  });
  await test("Technische Zugriffssperren, Kommunikation, Landesausgaben, Ruhe und Kosten bleiben Pflicht",()=>{
    for(const mutate of [b=>delete b.technik,b=>b.technik=true,b=>b.production.laufzeit.kommunikationGesperrt=false,
      b=>b.ruhe.offeneJobs=1,b=>b.landesversorgung.wirksameFlags.berlin=false,b=>b.kosten.auth.testKostenAuftrag.limit=8000000]){
      const x=fixture();mutate(x.belege);A.throws(()=>x.G.baueRuntimeManifest({manifest:x.manifest,snapshot:x.snapshot,belege:x.belege},x.bytes,NOW));}
    const x=fixture();for(const mutate of [k=>k.tageslimitMikroUsd=4000000,k=>k.auftragslimitMikroUsd=8000000,k=>k.laufreserveMikroUsd=3000001]){
      const m=clone(x.manifest);mutate(m.kosten);A.throws(()=>x.V.pruefeManifest(m,x.bytes,x.snapshot));}
  });
  await test("Aktivplan braucht konkretes frisches aeusseresGO und lebenden Waechter",()=>{
    const x=fixture();for(const go of [null,true,{...x.activate.aktivierungsGo,version:"helmut-real500-aktivierungs-go/1"},
      {...x.activate.aktivierungsGo,manifestHash:x.V.hash(x.manifest)},{...x.activate.aktivierungsGo,productionCommit:"d".repeat(40)}]){
      A.throws(()=>x.G.baueSql({...x.activate,aktivierungsGo:go},x.bytes,NOW));}
    const bad=clone(x.activate);bad.belege.endwaechter.manifestHash=x.V.hash(x.manifest);A.throws(()=>x.G.baueSql(bad,x.bytes,NOW));
    const sql=x.G.baueSql(x.activate,x.bytes,NOW);A.match(sql,/helmut_synthetik500_internal\.pruefe/);
    A.match(sql,/where id='synthetik500-runtime-/);A.match(sql,/if n<>500/);A.match(sql,/share row exclusive mode/);
    A.doesNotMatch(sql,/helmut_real500_internal|realkohorte500-runtime-|qualifizierteRechtsfreigabe/);
  });
  await test("Endadapter DefaultAUS und Realauftrag erzeugen0Writes",async()=>{
    let calls=0;const x=fixture();A.deepEqual(await R0.beende({request:()=>{calls++;}}),{zustand:"inaktiv",schreibversuche:0});
    A.throws(()=>R0.pruefeAuftrag({...x.auftrag,operationId:"real500-runtime-offline-20261001"}));A.equal(calls,0);
  });
  await test("Unbekannter Endwrite wird exakt einmal gegengelesen und niemals blind wiederholt",async()=>{
    const x=fixture();let gets=0,posts=0;
    const r=await R0.beende({auftrag:x.auftrag,aktiviert:true,request:async a=>{if(a.methode==="GET"){gets++;return gets===1?x.status:{...x.status,zustand:"beendet",aktiv:0};}posts++;throw Error("lost");}});
    A.equal(r.zustand,"ausgang-unbekannt");A.equal(r.eigeneSchreibwirkung,"unbekannt");A.equal(posts,1);A.equal(gets,2);
  });
  await test("Eigener Endwrite bindet nur eigene RPC und bestaetigt0aktiv",async()=>{
    const x=fixture();let posts=0;const r=await R0.beende({auftrag:x.auftrag,aktiviert:true,request:async a=>{
      if(a.methode==="GET")return x.status;posts++;A.equal(a.pfad,"/rest/v1/rpc/helmut_synthetik500_ende");
      A.equal(a.body.p_bestaetigung,"GEBUNDENE_SYNTHETIK500_NUR_DEAKTIVIEREN");return {...x.status,zustand:"beendet",aktiv:0};}});
    A.equal(r.zustand,"beendet-bestaetigt");A.equal(posts,1);
  });
  await test("Externe Frist umfasst Antwortinhalt und bleibt maximal20Sekunden",async()=>{
    const x=fixture();A.throws(()=>W0.requestFactory({env:{SUPABASE_URL:"https://fremd.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"fixture"}}));
    await A.rejects(R0.lese({auftrag:x.auftrag,request:async()=>new Promise(()=>{}),timeoutMs:15}),/zeitlimit/);
    await A.rejects(R0.lese({auftrag:x.auftrag,request:async()=>x.status,timeoutMs:20001}),/zeitlimit/);
  });
  await test("Eigener manuellerWorkflow ist vor Aktivierung nur bereit-lesend und kein500Beleg",async()=>{
    const x=fixture(),env={GITHUB_REPOSITORY:"ernisch/helmut-pilot",GITHUB_REF:"refs/heads/main",GITHUB_EVENT_NAME:"workflow_dispatch",
      GITHUB_SHA:COMMIT,GITHUB_WORKFLOW_REF:"ernisch/helmut-pilot/.github/workflows/synthetik-500-endwaechter.yml@refs/heads/main",GITHUB_RUN_ATTEMPT:"1",GITHUB_RUN_ID:"1234"};
    let now=NOW,writes=0,meldung;const r=await W0.steuere({auftrag:x.auftrag,env,deps:{jetzt:()=>now,warte:async ms=>{now+=ms;},
      lese:async()=>({...x.status,zustand:"vorbereitet",aktiv:0}),leseRuntime:async()=>true,melde:r=>meldung=r,
      beende:async()=>{writes++;},leseKosten:async()=>{throw Error("nicht aktiv");}}});
    A.equal(r.ok,false);A.equal(writes,0);A.equal(meldung.zustand,"bereit-lesend");A.equal(meldung.aktiv,0);A.equal(meldung.aktivierungsrecht,false);
    await A.rejects(W0.steuere({auftrag:x.auftrag,env:{...env,GITHUB_WORKFLOW_REF:env.GITHUB_WORKFLOW_REF.replace("synthetik","realkohorte")},deps:{}}));
  });
  await test("Waechter-CLI waehlt exakt die gebundene Paketvariante; Kontrast und Negativfaelle",async()=>{
    const env={GITHUB_REPOSITORY:"ernisch/helmut-pilot",GITHUB_REF:"refs/heads/main",GITHUB_EVENT_NAME:"workflow_dispatch",
      GITHUB_SHA:COMMIT,GITHUB_WORKFLOW_REF:"ernisch/helmut-pilot/.github/workflows/synthetik-500-endwaechter.yml@refs/heads/main",GITHUB_RUN_ATTEMPT:"1",GITHUB_RUN_ID:"1234"};
    for(const variante of P.VARIANTEN){const x=fixture({variante});const r=await W0.ausfuehren({auftrag:x.auftrag,env:{...env,HELMUT_SYNTHETIK500_VARIANTE:variante},fetchFn:()=>{throw Error("keine-anfrage");}});
      A.equal(r.ok,true);A.equal(r.externeAnfragen,0);A.equal(r.variante,variante);A.equal(r.paketHash,x.paket.bindung.paketHash);
      const w=W0.erzeugeEndwaechter(x.bytes);w.pruefeKontext(x.auftrag,env);
      A.equal(R0.erzeugeEndRuntime(x.bytes).pruefeLesung(x.auftrag,x.status),x.status);
      if(variante==="kontrast-v1")A.throws(()=>R0.pruefeLesung(x.auftrag,x.status),/bindung/);
    }
    const x=fixture();const bad=await W0.ausfuehren({auftrag:x.auftrag,env:{...env,HELMUT_SYNTHETIK500_VARIANTE:"fremd"}});
    A.equal(bad.ok,false);A.equal(bad.externeAnfragen,0);A.equal(bad.bewaffnet,false);
  });
  console.log(`${pass}/${pass} Synthetik-Runtime-Offlinetests gruen; keine Production-/Startfreigabe.`);
}
if(require.main===module)main().catch(e=>{console.error("Synthetik-Runtime-Test fehlgeschlagen: "+e.message);process.exitCode=1;});
module.exports={fixture,fixtureZeitfenster,pruefeFixtureZeitfenster,main,COMMIT,NOW};
