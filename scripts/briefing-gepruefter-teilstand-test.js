"use strict";
// Neue rein lesende Teilbriefingfaelle. Vorhandene erfundene Quellen und echte
// Paket-/Quittungs-/Policy-/Textpruefung; keine Modelle, DB oder Altsuiten.
const A=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),B=require("../lib/helmut/briefing-speicher"),
  D=require("../lib/helmut/tagespaket-auslieferung"),L=require("../lib/helmut/briefing-lauf"),
  P=require("../lib/helmut/publication-eligibility"),S=require("../lib/helmut/storage"),
  AI=require("../lib/helmut/ai"),F=require("./fixtures/profilhash-integration");
if(process.argv.length!==2)throw Error("Unbekannte Testauswahl");
const {profile,day,now}=F,clone=structuredClone,oldPolicy=process.env[P.ENV],oldBlock=process.env.HELMUT_SOURCE_BLOCKLIST;
const originals=[S,AI].map(m=>[m,{...m}]),forbidden=[];
const fail=name=>()=>{forbidden.push(name);throw Error("Verboten: "+name);};
for(const [key,value] of Object.entries(S))if(typeof value==="function"&&key!=="assertTenant")S[key]=fail("storage."+key);
for(const [key,value] of Object.entries(AI))if(typeof value==="function"&&/^(generate|request|enrich|assess)/.test(key))AI[key]=fail("ai."+key);
process.env[P.ENV]=JSON.stringify({version:1,holds:[{publicationUrl:"https://example.invalid/held",reason:"unresolved-event-relation",
  review:{id:"synthetischer-teilstand",receiptSHA256:"a".repeat(64),koSHA256:"b".repeat(64),sourceSHA256:"c".repeat(64)}}]});
const hadFixturePolicy=Object.hasOwn(F.briefing,"publicationEligibilityPolicy"),fixturePolicy=F.briefing.publicationEligibilityPolicy;
F.briefing.publicationEligibilityPolicy=P.publicInfo();
async function fixture(){
  const text=F.fixture().text,rows=new Map([[text.id,clone(text)]]),reads=[],requests=[];
  const briefing=clone(F.briefing);
  briefing.currentHelmutState={status:"empty",qualityStatus:"empty",tenantId:null,profileId:profile.id,
    primaryItem:null,primaryVorgangId:null,items:[],versorgung:{version:1,zustand:"offen"},
    emptyState:{kind:"gap",headline:"Quellenversorgung noch offen"}};
  briefing.publicationEligibilityPolicy=P.publicInfo();
  briefing.tagespaketGrundlage=[1,2].map(i=>({id:"ko-synth-"+i,vorgang_id:"vg-synth-"+i}));
  const identities=[1,2].map(i=>({knowledge_object_id:"ko-synth-"+i,raw_document_id:"rd-synth-"+i,
    raw_documents:{id:"rd-synth-"+i,url:"https://example.invalid/dokument/"+i,canonical_url:null}}));
  const storage={assertTenant:S.assertTenant,getRenderedBriefingV3:async(id,slot,date)=>{
    A.equal(id,profile.id);reads.push([slot,date]);return clone(rows.get(`bf-${id}-${slot}-${date}`)||null);},
    insertRenderedBriefingV3:async row=>{rows.set(row.id,clone(row));return {saved:true};},
    getPublicationSourceIdentities:deps=>originals[0][1].getPublicationSourceIdentities(deps,{request:async url=>{
      const q=new URL(url,"https://local.invalid");A.equal(q.pathname,"/rest/v1/ko_document_links");
      A.equal(q.searchParams.get("select"),"knowledge_object_id,raw_document_id,raw_documents(id,url,canonical_url)");
      requests.push(url);return clone(identities.slice(Number(q.searchParams.get("offset")),
        Number(q.searchParams.get("offset"))+Number(q.searchParams.get("limit"))));}})};
  await B.materialisiere({profile,userId:profile.id,now,briefing,lageAnsicht:B.lageAusgabe(text.payload),storage});
  const row=rows.get(`bf-${profile.id}-${B.SLOT}-${day}`);
  function rebind(){row.payload.quellenStand=D.quellenStand(row.payload);row.payload.inhaltHash=B.inhaltHash(row.payload);
    const payload=L.quittung({tenantId:profile.id,berlinTag:day,erzeugtAm:now,status:L.STATUS_ERFOLG,
      fensterStart:day+"T00:00:00Z",ausgabeBeleg:require("../lib/helmut/briefing-ausgabebeleg").ausPaket(row)});
    rows.set(L.laufId(profile.id,day),{id:L.laufId(profile.id,day),user_id:profile.id,slot:L.SLOT_ERFOLG,
      generated_at:now.toISOString(),payload});}
  rebind();reads.length=0;requests.length=0;storage.insertRenderedBriefingV3=fail("insert-nach-Fixture");
  return {row,rows,reads,requests,storage,rebind,read:args=>D.lese({userId:profile.id,profile,now,storage,...args})};
}
let count=0;
async function test(name,fn){await fn();count++;console.log("PASS "+name);}
async function main(){
  await test("Gebundener aktueller GAP erhaelt nur Referenzen auf vollstaendig gepruefte Absatzausgabe",async()=>{
    const f=await fixture(),before=JSON.stringify([...f.rows]),out=(await f.read()).briefing,m=out.vorlaeufigerBriefingstand;
    A.deepEqual(Object.keys(m).sort(),["absaetze","paketErzeugtAm","quellenversorgung","tag","tagesprioritaet","version","zustand"].sort());
    A.equal(m.tag,day);A.equal(m.paketErzeugtAm,f.row.generated_at);A.equal(m.quellenversorgung,"offen");
    A.equal(m.tagesprioritaet,"offen");A.equal(m.absaetze.length,2);
    for(const [i,p] of out.lageBriefing.paragraphs.entries())A.deepEqual(m.absaetze[i],
      {index:i,vorgangIds:p.vorgangIds,quellenIds:p.sources.map(q=>q.quelleId)});
    A.equal(f.reads.length,2);A.ok(f.requests.length>0);A.equal(JSON.stringify([...f.rows]),before);
  });
  await test("Teilbriefing aendert weder Primary Handlung Frische noch offenen Fenstercheckpoint",async()=>{
    const f=await fixture(),state=clone(f.row.payload.briefing.currentHelmutState),out=(await f.read()).briefing;
    A.deepEqual(out.currentHelmutState,state);A.equal(out.currentHelmutState.primaryItem,null);
    A.equal(out.paketStatus.zustand,"teilweise");A.equal(out.paketStatus.vollstaendig,false);
    A.equal(out.paketStatus.quittungGebunden,true);A.equal(out.paketStatus.fachlicheVollabnahme,false);
    const receipt=f.rows.get(L.laufId(profile.id,day)).payload;
    A.equal(L.qualifiziereFensterCheckpoint(receipt,{id:f.row.id,user_id:profile.id,slot:B.SLOT,
      generated_at:f.row.generated_at,briefing:f.row.payload.briefing},{profile,tag:day,jetzt:now}).zustand,"offen");
    A.equal(Object.hasOwn(f.row.payload.briefing,"vorlaeufigerBriefingstand"),false);
  });
  await test("Fehlende manipulierte oder unlesbare Quittung erzeugt keinen Teilbriefinghinweis",async()=>{
    for(const change of [f=>f.rows.delete(L.laufId(profile.id,day)),
      f=>{f.rows.get(L.laufId(profile.id,day)).payload.ausgabeBeleg.briefingHash="f".repeat(64);},
      f=>{const read=f.storage.getRenderedBriefingV3;f.storage.getRenderedBriefingV3=(id,slot,date)=>{
        if(slot===L.SLOT_ERFOLG)throw Error("Quittung unbekannt");return read(id,slot,date);};}]){
      const f=await fixture();change(f);A.equal((await f.read()).briefing.vorlaeufigerBriefingstand,null);
    }
  });
  await test("Voller Stand Ruhelage Fehler Altstatus und unbekannte Versorgung bekommen keine Ersatzkarte",async()=>{
    for(const change of [s=>{s.status="fresh";s.primaryItem={id:"vg-synth-1"};s.primaryVorgangId="vg-synth-1";},
      s=>{s.emptyState.kind="quiet";},s=>{s.errorState=true;},s=>{s.status="error";},
      s=>{s.staleState=true;},s=>{s.versorgung.zustand="unbekannt";},s=>{s.tenantId="fremd";}]){
      const f=await fixture();change(f.row.payload.briefing.currentHelmutState);f.rebind();
      A.equal((await f.read()).briefing.vorlaeufigerBriefingstand,null);
    }
  });
  await test("Profil Tag Quellen und aktive Publikationspolicy bleiben auch fuer den Teilstand verbindlich",async()=>{
    const foreign=await fixture();A.equal((await foreign.read({profile:{...profile,focusTopics:["anderes"]}})).briefing.vorlaeufigerBriefingstand,undefined);
    await A.rejects(foreign.read({userId:"fremd"}),/profil-abweichend/);
    A.equal((await foreign.read({now:new Date(day+"T23:30:00Z")})).briefing.vorlaeufigerBriefingstand,undefined);
    for(const value of [undefined,"ungueltig","2026-09-12T12:00:00Z",day+"T13:00:00Z"]){
      const f=await fixture();f.row.generated_at=value;
      A.equal((await f.read()).briefing.vorlaeufigerBriefingstand,undefined);
    }
    for(const value of [undefined,"ungueltig"]){
      const f=await fixture();f.row.payload.erzeugtAm=value;f.rebind();
      A.equal((await f.read()).briefing.vorlaeufigerBriefingstand,undefined);
    }
    for(const change of [f=>{f.row.payload.lage.paragraphs[0].quellen_ids=["nicht-belegt"];f.rebind();},
      f=>{f.storage.getPublicationSourceIdentities=async()=>({"ko-synth-1":[{url:"https://example.invalid/held"}],"ko-synth-2":[]});}]){
      const f=await fixture();change(f);A.ok(!(await f.read()).briefing.vorlaeufigerBriefingstand);
    }
    const blocked=await fixture();process.env.HELMUT_SOURCE_BLOCKLIST="example.invalid";
    try{A.equal((await blocked.read()).briefing.vorlaeufigerBriefingstand,undefined);}
    finally{if(oldBlock===undefined)delete process.env.HELMUT_SOURCE_BLOCKLIST;else process.env.HELMUT_SOURCE_BLOCKLIST=oldBlock;}
  });
  await test("Private Originale und gespeicherte Marker werden nie als Teilbriefingfreigabe uebernommen",async()=>{
    const f=await fixture();f.row.payload.lage.ergaenzungsBeleg={privaterText:"NICHT-OEFFENTLICHER-PRUEFTEXT"};
    f.row.payload.briefing.vorlaeufigerBriefingstand={privaterText:"NICHT-OEFFENTLICHER-MARKER"};f.rebind();
    const out=(await f.read()).briefing;A.ok(out.vorlaeufigerBriefingstand);
    A.ok(!JSON.stringify(out).includes("NICHT-OEFFENTLICHER"));
    f.row.payload.briefing.currentHelmutState.emptyState.kind="quiet";f.rebind();
    A.equal((await f.read()).briefing.vorlaeufigerBriefingstand,null);
  });
  await test("Bestehender geschuetzter Cronnachweis nutzt nur ohne Tag und Modus den normalen gespeicherten Appreader",async()=>{
    // Root integriert die kleine server.js-Naht separat vor erster Ausfuehrung.
    const source=fs.readFileSync(require.resolve("../server"),"utf8"),
      start=source.indexOf('      if (!url.searchParams.has("tag") && !url.searchParams.has("modus")) {'),
      end=source.indexOf("      const nachweisUrl",start);
    A.ok(start>0&&end>start);
    const script=new vm.Script("(async()=>{"+source.slice(start,end)+"return 'explizite-auswahl';})()");
    for(const suffix of ["","&tag="+day,"&tag=","&modus=eingabe","&modus=eingabe-500"]){
      const calls=[],response={},value={gespeicherterAppstand:true};
      const result=await script.runInNewContext({URL,url:new URL("https://local.invalid/api/cron/briefing-nachweis?mandat="+profile.id+suffix),
        userId:profile.id,profile,response,
        latestBriefingPayload:async args=>{calls.push(args);A.equal(args.politicianId,profile.id);A.equal(args.profile,profile);
          A.equal(args.compact,false);A.equal(args.url.pathname,"/api/briefing/latest");A.equal(args.url.search,"");return value;},
        sendJson:(r,data)=>{A.equal(r,response);return data;},buildV3Briefing:fail("build-vom-Lesezweig")});
      A.equal(calls.length,suffix?0:1);A.equal(result,suffix?"explizite-auswahl":value);
    }
  });
  A.equal(count,7);A.deepEqual(forbidden,[]);console.log(`${count}/${count} neue Teilbriefinggruppen bestanden; keine Alttests Modelle oder DBwrites.`);
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;}).finally(()=>{
  for(const [m,old] of originals)Object.assign(m,old);
  if(oldPolicy===undefined)delete process.env[P.ENV];else process.env[P.ENV]=oldPolicy;
  if(oldBlock===undefined)delete process.env.HELMUT_SOURCE_BLOCKLIST;else process.env.HELMUT_SOURCE_BLOCKLIST=oldBlock;
  if(hadFixturePolicy)F.briefing.publicationEligibilityPolicy=fixturePolicy;else delete F.briefing.publicationEligibilityPolicy;
});
