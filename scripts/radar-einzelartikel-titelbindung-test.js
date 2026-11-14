"use strict";
// Nur neue Artikelanzeigefaelle, vorhandene synthetische Paketquellen und echte
// Producer-/Appreaderlogik. Keine alten Gruppen, Modelle, DB oder Quellenabrufe.
const A=require("node:assert/strict"),V=require("../lib/helmut/briefing-bereichsvertrag"),
  B=require("../lib/helmut/briefing-speicher"),D=require("../lib/helmut/tagespaket-auslieferung"),
  L=require("../lib/helmut/briefing-lauf"),P=require("../lib/helmut/publication-eligibility"),
  R=require("../lib/helmut/radarState"),S=require("../lib/helmut/storage"),AI=require("../lib/helmut/ai"),
  F=require("./fixtures/profilhash-integration");
if(process.argv.length!==2)throw Error("Unbekannte Testauswahl");
const {profile,day,now}=F,clone=structuredClone,vid="vg-synthetische-koalition",
  actorOld="Alte Partei stimmt in Beispielstadt ueber den Vertrag ab",
  actorNew="Andere Koalitionsparteien stimmen ueber denselben Vertrag ab",
  url="https://example.invalid/koalition/abstimmung",at=day+"T05:00:00Z";
const docs=[{id:"rd-actor-alt",title:actorOld,summary:"Der gemeinsame Vertrag wird beraten.",
  url:"https://example.invalid/koalition/vorher",published_at:"2026-09-12T05:00:00Z"},
  {id:"rd-actor-neu",title:actorNew,summary:"Weitere Parteien beraten denselben gemeinsamen Vertrag.",
    url:"https://www.example.invalid/koalition/abstimmung",published_at:at,privateReview:"NICHT-IN-DER-ANZEIGE"}];
const item={vorgangId:vid,documentId:"rd-actor-neu",title:actorOld,sourceUrl:url,publishedAt:at,
  ursprungsBeleg:{documentId:"rd-actor-neu",url},relationTypes:["party"]};
function produce(rows=docs,i=item,dynamic=false){return V.radarAnzeige({mentions:[],environment:{party:dynamic?[]:[i]},
  dynamics:dynamic?[{...i,publishedAt:undefined,lastUpdatedAt:at}]:[]},{[vid]:rows},now);}
const oldPolicy=process.env[P.ENV],modules=[S,AI].map(m=>[m,{...m}]),native=modules[0][1],forbidden=[];
const fail=name=>()=>{forbidden.push(name);throw Error("Verboten: "+name);};
for(const [k,v] of Object.entries(S))if(typeof v==="function"&&k!=="assertTenant")S[k]=fail("storage."+k);
for(const [k,v] of Object.entries(AI))if(typeof v==="function"&&/^(generate|request|enrich|assess)/.test(k))AI[k]=fail("ai."+k);
process.env[P.ENV]=JSON.stringify({version:1,holds:[{publicationUrl:"https://example.invalid/held",reason:"unresolved-event-relation",
  review:{id:"synthetische-artikelbindung",receiptSHA256:"a".repeat(64),koSHA256:"b".repeat(64),sourceSHA256:"c".repeat(64)}}]});
const hadPolicy=Object.hasOwn(F.briefing,"publicationEligibilityPolicy"),fixturePolicy=F.briefing.publicationEligibilityPolicy;
F.briefing.publicationEligibilityPolicy=P.publicInfo();
async function fixture(){
  const full=F.fixture().text,rows=new Map([[full.id,clone(full)]]),reads=[],identityReads=[];
  const briefing=clone(F.briefing),lage=B.lageAusgabe(full.payload);
  briefing.currentHelmutState={status:"empty",qualityStatus:"empty",profileId:profile.id,tenantId:null,items:[],
    primaryItem:null,primaryVorgangId:null,emptyState:{kind:"gap"},versorgung:{version:1,zustand:"offen"}};
  briefing.items=briefing.items.map((i,n)=>({...i,sources:lage.paragraphs[n].sources}));
  const publicSources=docs.map(d=>({title:d.title,url:d.url,publishedAt:d.published_at,name:"Synthetische Quelle"}));
  briefing.items.push({vorgangId:vid,title:actorOld,sources:publicSources,primarySource:clone(publicSources[1])});
  briefing.tagespaketGrundlage=[1,2].map(i=>({id:"ko-synth-"+i,vorgang_id:"vg-synth-"+i}));
  briefing.tagespaketGrundlage.push({id:"ko-actor",vorgang_id:vid});briefing.publicationEligibilityPolicy=P.publicInfo();
  const dynamics=lage.paragraphs.map((p,n)=>({vorgangId:p.vorgangIds[0],title:"Alter aggregierter Vorgangstitel "+n,
    sourceUrl:p.sources[0].url,lastUpdatedAt:p.sources[0].publishedAt,summary:"",shortSummary:""}));
  const environment={party:[clone(item)],constituency:[],committees:[]};
  briefing.currentRadarState={profileId:profile.id,status:"fresh",dynamics:clone(dynamics),environment:clone(environment),
    anzeige:{status:"fresh",lastUpdated:at,mentions:[],articles:[],dynamics,environment,
      summary:R.buildSummary([],environment,dynamics,now,{nurAnzeige:true})}};
  const identities=briefing.items.flatMap((i,n)=>i.sources.map((q,k)=>({knowledge_object_id:n<2?"ko-synth-"+(n+1):"ko-actor",
    raw_document_id:`rd-identity-${n}-${k}`,raw_documents:{id:`rd-identity-${n}-${k}`,url:q.url,canonical_url:null}})));
  const storage={assertTenant:S.assertTenant,getRenderedBriefingV3:async(id,slot,date)=>{
    reads.push([id,slot,date]);return clone(rows.get(`bf-${id}-${slot}-${date}`)||null);},
    insertRenderedBriefingV3:async row=>{rows.set(row.id,clone(row));return {saved:true};},
    getPublicationSourceIdentities:deps=>native.getPublicationSourceIdentities(deps,{request:async path=>{
      const q=new URL(path,"https://local.invalid");A.equal(q.pathname,"/rest/v1/ko_document_links");identityReads.push(path);
      const offset=Number(q.searchParams.get("offset")),limit=Number(q.searchParams.get("limit"));return clone(identities.slice(offset,offset+limit));}})};
  await B.materialisiere({profile,userId:profile.id,briefing,lageAnsicht:lage,storage,now});
  const row=rows.get(`bf-${profile.id}-${B.SLOT}-${day}`);
  function rebind(){row.payload.quellenStand=D.quellenStand(row.payload);row.payload.inhaltHash=B.inhaltHash(row.payload);
    const payload=L.quittung({tenantId:profile.id,berlinTag:day,erzeugtAm:now,status:L.STATUS_ERFOLG,
      fensterStart:day+"T00:00:00Z",ausgabeBeleg:require("../lib/helmut/briefing-ausgabebeleg").ausPaket(row)});
    rows.set(L.laufId(profile.id,day),{id:L.laufId(profile.id,day),user_id:profile.id,slot:L.SLOT_ERFOLG,generated_at:now.toISOString(),payload});}
  rebind();reads.length=0;storage.insertRenderedBriefingV3=fail("Paketwrite");
  return {row,rows,reads,identityReads,storage,rebind,read:args=>D.lese({profile,userId:profile.id,now,storage,...args})};
}
let count=0;function test(name,fn){return Promise.resolve().then(fn).then(()=>{count++;console.log("PASS "+name);});}
async function main(){
  await test("Producerumfeld zeigt eigene neue Artikelueberschrift statt altem Akteurtitel bei gleichem Vorgang",()=>{
    const before=JSON.stringify({docs,item}),out=produce().environment.party[0];
    A.equal(out.title,actorNew);A.equal(out.sourceUrl,url);A.equal(out.publishedAt,at);
    A.equal(out.documentId,item.documentId);A.equal(out.summary,"");A.equal(out.shortSummary,"");
    A.ok(!JSON.stringify(out).includes("NICHT-IN-DER-ANZEIGE"));A.equal(JSON.stringify({docs,item}),before);
  });
  await test("Dynamiktitel ist ebenfalls artikelgebunden und bleibt bei anderer Quellenreihenfolge identisch",()=>{
    const a=produce(docs,item,true).dynamics[0],b=produce([...docs].reverse(),item,true).dynamics[0];
    A.deepEqual(a,b);A.equal(a.title,actorNew);A.equal(a.lastUpdatedAt,at);A.equal(a.beobachtungsBeleg.art,"weitere-berichte");
    A.ok(a.evidence.includes("kein politischer Trend"));
  });
  await test("Fehlende mehrdeutige fremde oder abweichend datierte Quellen erzeugen keine Artikelbehauptung",()=>{
    const changed=[[],[docs[0]],docs.map(d=>d.id==="rd-actor-neu"?{...d,published_at:null}:d),
      docs.map(d=>d.id==="rd-actor-neu"?{...d,published_at:day+"T05:00:00.001Z"}:d),
      [...docs,{...docs[1],title:"Abweichender Titel derselben Artikelversion"}],
      docs.map(d=>d.id==="rd-actor-neu"?{...d,id:"rd-fremd"}:d),
      docs.map(d=>d.id==="rd-actor-neu"?{...d,vorgangId:"vg-fremd"}:d)];
    for(const rows of changed)A.equal(produce(rows).environment.party.length,0);
  });
  await test("Echter gespeicherter Appreader korrigiert nur sichtbare Radartitel und behaelt beide Dynamiken Lage Marker Hash und Quittung",async()=>{
    const f=await fixture(),before=JSON.stringify([...f.rows]),out=(await f.read()).briefing,r=out.currentRadarState;
    A.equal(r.anzeige.environment.party[0].title,actorNew);A.equal(r.environment.party[0].title,actorOld);
    A.equal(r.anzeige.dynamics.length,2);A.deepEqual(r.dynamics,f.row.payload.briefing.currentRadarState.dynamics);
    A.deepEqual(out.lageBriefing.paragraphs,B.lageAusgabe(f.row.payload.lage).paragraphs);
    A.equal(out.vorlaeufigerBriefingstand.absaetze.length,2);A.equal(out.paketStatus.quittungGebunden,true);
    A.equal(out.gespeicherterNachweis.inhaltHash,f.row.payload.inhaltHash);A.equal(out.currentHelmutState.emptyState.kind,"gap");
    A.equal(f.reads.length,2);A.ok(f.identityReads.length>0);A.equal(JSON.stringify([...f.rows]),before);
    A.equal(r.anzeige.environment.party[0].documentId,"rd-actor-neu","Keine erfundene neue Dokumentkennung");
  });
  await test("Leser verbirgt unbekannte oder widerspruechliche Artikel und passt nur die sichtbare Belegbilanz an",async()=>{
    for(const change of [i=>{i.sources=[];delete i.primarySource;},i=>{i.sources.push({...i.sources[1],title:"Widersprechender Quellentitel"});},
      i=>{i.sources[1].publishedAt=null;i.primarySource.publishedAt=null;}]){
      const f=await fixture();change(f.row.payload.briefing.items[2]);f.rebind();
      const before=JSON.stringify([...f.rows]),out=(await f.read()).briefing;
      A.equal(out.currentRadarState.anzeige.environment.party.length,0);A.equal(out.currentRadarState.anzeige.dynamics.length,2);
      A.equal(out.currentRadarState.environment.party.length,1);A.equal(JSON.stringify([...f.rows]),before);
    }
  });
  await test("Canonical www Zeit Mandat Tag Policy und persoenliche Namensbindung werden nicht erweitert",async()=>{
    A.equal(V.radarArtikelbindung(item,[docs[1],{...docs[1],url:url}],now).title,actorNew);
    const f=await fixture();await A.rejects(f.read({userId:"fremd"}),/profil-abweichend/);
    A.equal((await f.read({profile:{...profile,focusTopics:["fremd"]}})).briefing.available,false);
    A.equal((await f.read({now:new Date(day+"T23:30:00Z")})).briefing.available,false);
    f.storage.getPublicationSourceIdentities=async()=>({"ko-actor":[{url:"https://example.invalid/held"}],"ko-synth-1":[],"ko-synth-2":[]});
    A.equal((await f.read()).briefing.reason,"tagespaket-quellenstand-nicht-bestaetigt");
    const named={...docs[1],title:"Erfundene Person spricht zum Vertrag",summary:"Erfundene Person wird in dieser Quelle namentlich genannt."};
    const personal=rows=>V.radarAnzeige({mentions:[{...item}],environment:{},dynamics:[]},{[vid]:rows},now,[],profile).mentions;
    A.equal(personal([named]).length,1);A.equal(personal(docs).length,0);
  });
  A.equal(count,6);A.deepEqual(forbidden,[]);console.log(`${count}/${count} neue Radar-Artikelgruppen bestanden; keine Alttests Modelle oder Productionwrites.`);
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;}).finally(()=>{
  for(const [m,old] of modules)Object.assign(m,old);if(oldPolicy===undefined)delete process.env[P.ENV];else process.env[P.ENV]=oldPolicy;
  if(hadPolicy)F.briefing.publicationEligibilityPolicy=fixturePolicy;else delete F.briefing.publicationEligibilityPolicy;
});
