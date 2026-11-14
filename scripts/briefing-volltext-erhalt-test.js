"use strict";
// Neue native Speichergegenfaelle; vorhandene synthetische Eingaben, keine
// Wiederholung alter Gruppen, Modelle, echte DB oder Production-Aenderungen.
const A=require("node:assert/strict"),B=require("../lib/helmut/briefing-speicher"),
  M=require("../lib/helmut/morgenversorgung"),D=require("../lib/helmut/tagespaket-auslieferung"),
  E=require("../lib/helmut/lage-quellenbeleg"),L=require("../lib/helmut/briefing-lauf"),
  P=require("../lib/helmut/publication-eligibility"),S=require("../lib/helmut/storage"),
  AI=require("../lib/helmut/ai"),F=require("./fixtures/profilhash-integration");
if(process.argv.length!==2)throw Error("Unbekannte Testauswahl");
const {profile,day,now}=F,clone=structuredClone,oldPolicy=process.env[P.ENV],oldBlock=process.env.HELMUT_SOURCE_BLOCKLIST;
const modules=[S,AI].map(m=>[m,{...m}]),native=modules[0][1],forbidden=[];
const fail=name=>()=>{forbidden.push(name);throw Error("Verboten: "+name);};
for(const [key,v] of Object.entries(S))if(typeof v==="function"&&key!=="assertTenant")S[key]=fail("storage."+key);
for(const [key,v] of Object.entries(AI))if(typeof v==="function"&&/^(generate|request|enrich|assess)/.test(key))AI[key]=fail("ai."+key);
process.env[P.ENV]=JSON.stringify({version:1,holds:[{publicationUrl:"https://example.invalid/held",reason:"unresolved-event-relation",
  review:{id:"synthetischer-volltexterhalt",receiptSHA256:"a".repeat(64),koSHA256:"b".repeat(64),sourceSHA256:"c".repeat(64)}}]});
const hadFixturePolicy=Object.hasOwn(F.briefing,"publicationEligibilityPolicy"),fixturePolicy=F.briefing.publicationEligibilityPolicy;
F.briefing.publicationEligibilityPolicy=P.publicInfo();
async function fixture(){
  const raw=F.fixture().text,rows=new Map([[raw.id,clone(raw)]]),writes=[],reads=[];
  const briefing=clone(F.briefing);briefing.currentHelmutState={status:"empty",profileId:profile.id,tenantId:null,
    primaryItem:null,primaryVorgangId:null,items:[],emptyState:{kind:"gap"},versorgung:{version:1,zustand:"offen"}};
  briefing.publicationEligibilityPolicy=P.publicInfo();
  briefing.tagespaketGrundlage=[1,2].map(i=>({id:"ko-synth-"+i,vorgang_id:"vg-synth-"+i}));
  briefing.currentRadarState={status:"stale",anzeige:{dynamics:[{vorgangId:"vg-synth-1",title:"Alter synthetischer Radarhinweis"}]}};
  const storage={assertTenant:S.assertTenant,getRenderedBriefingV3:async(id,slot,date)=>{
    reads.push([id,slot,date]);return clone(rows.get(`bf-${id}-${slot}-${date}`)||null);},
    insertRenderedBriefingV3:row=>native.insertRenderedBriefingV3(row,{bereit:true,request:async(path,opts)=>{
      A.equal(opts.method,"POST");const q=new URL(path,"https://local.invalid");A.equal(q.searchParams.get("user_id"),"eq."+profile.id);
      const saved=JSON.parse(opts.body);A.equal(saved.user_id,profile.id);writes.push("POST");rows.set(saved.id,saved);return [clone(saved)];}})};
  let casMode="saved";
  storage.ergaenzeUnvollstaendigesBriefing=(before,entry)=>native.ergaenzeUnvollstaendigesBriefing(before,entry,{bereit:true,request:async(path,opts)=>{
    writes.push("PATCH");A.equal(opts.method,"PATCH");const q=new URL(path,"https://local.invalid");
    A.equal(q.searchParams.get("id"),"eq."+entry.id);A.equal(q.searchParams.get("user_id"),"eq."+profile.id);
    A.equal(q.searchParams.get("generated_at"),"eq."+before.generated_at);
    A.equal(q.searchParams.get("payload->>inhaltHash"),"eq."+before.payload.inhaltHash);
    A.deepEqual(rows.get(before.id),before);const body=JSON.parse(opts.body);A.deepEqual(body.payload.vorherigerStand,before);
    if(casMode==="conflict")return [];if(casMode==="unknown")throw Error("transport-unklar");
    const saved={...entry,...body};rows.set(saved.id,clone(saved));return [clone(saved)];
  }});
  await B.materialisiere({profile,userId:profile.id,briefing,lageAnsicht:B.lageAusgabe(raw.payload),storage,now});
  const row=rows.get(`bf-${profile.id}-${B.SLOT}-${day}`);
  const payload=L.quittung({tenantId:profile.id,berlinTag:day,erzeugtAm:now,status:L.STATUS_ERFOLG,
    fensterStart:day+"T00:00:00Z",ausgabeBeleg:require("../lib/helmut/briefing-ausgabebeleg").ausPaket(row)});
  rows.set(L.laufId(profile.id,day),{id:L.laufId(profile.id,day),user_id:profile.id,slot:L.SLOT_ERFOLG,generated_at:now.toISOString(),payload});
  const next=clone(briefing);next.currentRadarState={status:"stale",anzeige:{dynamics:[]}};
  const args={profile,userId:profile.id,briefing:next,lageAnsicht:B.lageAusgabe(raw.payload),storage,tag:day,now:new Date(now.getTime()+1000)};
  writes.length=0;reads.length=0;
  return {rows,row,raw,writes,reads,storage,args,casMode:value=>{casMode=value;},run:extra=>M.speicherePaket({...args,...extra})};
}
let count=0;
async function test(name,fn){await fn();count++;console.log("PASS "+name);}
async function loss(f,extra){const before=clone(f.rows.get(f.row.id)),receipt=clone(f.rows.get(L.laufId(profile.id,day)));
  await A.rejects(f.run(extra),{code:"BRIEFING_VOLLTEXT_ERHALT"});
  A.deepEqual(f.rows.get(f.row.id),before);A.deepEqual(f.rows.get(L.laufId(profile.id,day)),receipt);A.deepEqual(f.writes,[]);}
async function main(){
  await test("Timeout null und fehlende neue Ansichtsfreigabe stoppen vor Paket CAS oder neuer Quittungsgrundlage",async()=>{
    for(const value of [null,undefined,{available:false,paragraphs:[],vorgaenge:[]}]){
      const f=await fixture();await loss(f,{lageAnsicht:value});
    }
    const f=await fixture(),read=f.storage.getRenderedBriefingV3,before=clone(f.row);
    f.storage.getRenderedBriefingV3=(id,slot,date)=>{if(slot==="lage")throw Error("Lage-lesung-unbekannt");return read(id,slot,date);};
    await A.rejects(f.run(),/Lage-lesung-unbekannt/);A.deepEqual(f.rows.get(f.row.id),before);A.deepEqual(f.writes,[]);
  });
  await test("Unguelter Text Pending und abweichende Quellenbindung duerfen Volltext nicht ins Archiv verdraengen",async()=>{
    for(const change of [f=>{f.rows.get(f.raw.id).payload.quellenHash="f".repeat(64);},
      f=>{f.args.lageAnsicht.pendingNarrative=true;},f=>{f.args.lageAnsicht.quellenBindung.koSetHash="f".repeat(32);},
      f=>{f.rows.get(f.raw.id).payload.qualitaet.teilstand=true;},f=>{f.args.lageAnsicht.qualitaet.teilstand=true;},
      f=>{f.args.lageAnsicht.paragraphs[0].sources=[];}]){
      const f=await fixture();change(f);await loss(f);
    }
  });
  await test("Auch ein echter gueltiger Einabsatzteilstand ersetzt keinen bereits bestaetigten Volltext",async()=>{
    const f=await fixture();
    const t=await require("./lage-teilstand-test").fixture({storageApi:native,fullText:f.raw,packageNow:false,
      change:({eingabe})=>{eingabe.koSetHash="e".repeat(32);}});
    A.equal(require("../lib/helmut/lage-teilstand").gueltig(t.part.payload,t.args),true);
    f.storage.getLageTeilstand=t.storage.getLageTeilstand;
    const view={...t.view,quellenBindung:{koSetHash:t.part.payload.koSetHash,quellenHash:t.part.payload.quellenHash}};
    await loss(f,{lageAnsicht:view});
  });
  await test("Korrekt gebundener Volltext ermoeglicht Radaraktualisierung ueber echten bedingten Adapter mit wortgleichem Text",async()=>{
    const f=await fixture(),before=clone(f.row),receipt=clone(f.rows.get(L.laufId(profile.id,day))),out=await f.run();
    A.equal(out.beleg.verifiziert,true);A.equal(out.beleg.vollstaendig,false);A.deepEqual(f.writes,["PATCH"]);
    const after=f.rows.get(f.row.id);A.deepEqual(after.payload.lage,before.payload.lage);
    A.deepEqual(after.payload.lageAnsicht.paragraphs,before.payload.lageAnsicht.paragraphs);
    A.deepEqual(after.payload.briefing.currentRadarState.anzeige.dynamics,[]);
    A.deepEqual(after.payload.vorherigerStand,before);A.deepEqual(f.rows.get(L.laufId(profile.id,day)),receipt);
    A.ok(E.gespeicherterTextGueltig(after.payload.lage));A.ok(B.lageAnsichtGebunden(after.payload.lage,after.payload.lageAnsicht));
  });
  await test("Echter CAS Konflikt und unklarer Schreibausgang bleiben Fehler ohne Retry oder erfundenen Paketerfolg",async()=>{
    for(const mode of ["conflict","unknown"]){const f=await fixture(),before=clone(f.row);f.casMode(mode);
      await A.rejects(f.run(),/konflikt-oder-unklar|transport-unklar/);A.deepEqual(f.writes,["PATCH"]);A.deepEqual(f.rows.get(f.row.id),before);}
  });
  await test("Mandat Profil Tag und Quellenschutz bleiben streng und ein gesperrter Altstand wird nicht neu ausgeliefert",async()=>{
    const foreign=await fixture();await A.rejects(foreign.run({userId:"fremd"}),/profil-abweichend/);A.deepEqual(foreign.writes,[]);
    const changed=await fixture();await A.rejects(changed.run({profile:{...profile,focusTopics:["anderes"]}}),/nachweis-abweichend/);A.deepEqual(changed.writes,[]);
    const old=await fixture();await A.rejects(old.run({now:new Date(day+"T23:30:00Z")}),/tag-abweichend/);A.deepEqual(old.writes,[]);
    const blocked=await fixture();process.env.HELMUT_SOURCE_BLOCKLIST="example.invalid";
    try{await loss(blocked,{lageAnsicht:null});const out=await D.lese({profile,userId:profile.id,storage:blocked.storage,now});
      A.equal(out.briefing.available,false);A.equal(out.briefing.reason,"tagespaket-quellenstand-nicht-bestaetigt");}
    finally{if(oldBlock===undefined)delete process.env.HELMUT_SOURCE_BLOCKLIST;else process.env.HELMUT_SOURCE_BLOCKLIST=oldBlock;}
  });
  A.equal(count,6);A.deepEqual(forbidden,[]);console.log(`${count}/${count} neue Volltexterhaltgruppen bestanden; keine Alttests Modelle oder Productionwrites.`);
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;}).finally(()=>{
  for(const [m,old] of modules)Object.assign(m,old);
  if(oldPolicy===undefined)delete process.env[P.ENV];else process.env[P.ENV]=oldPolicy;
  if(oldBlock===undefined)delete process.env.HELMUT_SOURCE_BLOCKLIST;else process.env.HELMUT_SOURCE_BLOCKLIST=oldBlock;
  if(hadFixturePolicy)F.briefing.publicationEligibilityPolicy=fixturePolicy;else delete F.briefing.publicationEligibilityPolicy;
});
