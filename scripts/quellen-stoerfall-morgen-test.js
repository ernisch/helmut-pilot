"use strict";

// Neue kombinierte Fehlerkette, keine echte Azure-/DB-/Originalprobe:
// produktiver AI-Einstieg -> nativer Kosten-/CAS-Adapter -> Analysehandler ->
// nativer Quellen-/Pflichtanalyseleser -> gespeichertes, erneut gelesenes Paket.
// HTTPS-Antworten, CAS-Persistenz und Queue/Store sind explizite Speicherattrappen.
// Die Quellen-503 wird als fehlende Quittung ihres gespeicherten Auftrags dargestellt.
// Reale HTTPS-Deadline, echte PostgreSQL und Monatslast bleiben eigene bestehende Belege.
const A = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const https = require("node:https");
const S = require("../lib/helmut/storage"), AI = require("../lib/helmut/ai");
const P = require("../lib/helmut/scalable-pipeline"), U = require("../lib/helmut/understanding");
const V = require("../lib/helmut/quellen-versorgungsstand"), F = require("../lib/helmut/quellen-faelligkeit");
const B = require("../lib/helmut/betriebskosten-budget"), C = require("../lib/helmut/briefingContract");
const M = require("../lib/helmut/morgenversorgung"), K = require("../lib/helmut/verstehen-vertrag");
const R = require("../lib/helmut/roh-quellenstaende"), H = require("../lib/helmut/briefing-speicher");
const control = require("../lib/helmut/anbieter-steuerung");
const EchtDate = Date, originalEnv = {...process.env};
const original = { request:https.request,mutate:S.mutateAuthStore,profiles:S.listFullProfiles,
  reserve:S.reserveLlmCall,record:S.recordLlmUsage,canSpend:S.canSpendLlmForTenant,control:control.steuerungAktiv };
const tag="2026-11-26", profile={id:"synthetischer-stoerfall",focusTopics:["Arbeitsmarkt"]};
const analyseId="00000000-0000-0000-0000-000000000001";
const abrufId="00000000-0000-0000-0000-000000000002";
let clock=Date.parse(tag+"T05:35:00Z"), anzahl=0;
globalThis.Date=new Proxy(EchtDate,{
  get:(target,key,receiver)=>key==="now"?()=>clock:Reflect.get(target,key,receiver),
  construct:(target,args,cls)=>Reflect.construct(target,args.length?args:[clock],cls),
  apply:()=>new EchtDate(clock).toString()
});

function casSpeicher() {
  const r={zustand:"offen",fencing:0,ki:0};
  return {r,
    async verstehenReserviere({eingabeHash,besitzer}) {
      if(r.zustand==="unbekannt")return {verfuegbar:true,erlaubt:false,zustand:r.zustand,grund:"ausgang-unbekannt",fencing:r.fencing};
      A.equal(r.zustand,"offen");Object.assign(r,{zustand:"reserviert",eingabeHash,besitzer,fencing:r.fencing+1});
      return {verfuegbar:true,erlaubt:true,fencing:r.fencing,zustand:r.zustand};
    },
    async verstehenModellstart({besitzer,fencing}) {
      A.equal(r.besitzer,besitzer);A.equal(r.fencing,fencing);A.equal(r.zustand,"reserviert");
      r.zustand="modell-laeuft";r.ki++;return {verfuegbar:true,ok:true};
    },
    async verstehenAusgangUnbekannt({besitzer,fencing}) {
      A.equal(r.besitzer,besitzer);A.equal(r.fencing,fencing);A.equal(r.zustand,"modell-laeuft");
      r.zustand="unbekannt";return {verfuegbar:true,blockiert:true,ergebnis:"unbekannt"};
    },
    async verstehenFreigabe(){A.fail("Nach gesendetem Fehler keine allgemeine CAS-Freigabe");},
    async verstehenFreigabeOhneAufruf(){A.fail("Gesendeter Fehler ist kein Nicht-Aufruf");}
  };
}

async function fall(fehler) {
  clock=Date.parse(tag+"T05:35:00Z");
  const contract={version:1,profileId:profile.id,startsAt:tag+"T00:00:00.000Z",dailyLimitUsd:1,totalLimitUsd:30,
    route:{provider:"azure",responsesUrl:"https://offline.openai.azure.com/openai/v1/responses",model:"gpt-5-mini"}};
  Object.assign(process.env,{[B.ENV]:JSON.stringify(contract),AZURE_OPENAI_KEY:"synthetische-attrappe",
    AZURE_OPENAI_ENDPOINT:"https://offline.openai.azure.com",AZURE_OPENAI_DEPLOYMENT:"gpt-5-mini",
    AZURE_OPENAI_UNDERSTANDING_DEPLOYMENT:"gpt-5-mini",HELMUT_VERSTEHEN_CAS:"on"});
  let auth={llmUsage:[]}, sends=0, writes=0, packetWrites=0, dbAusfall=false, verlust=true;
  const cas=casSpeicher(), belege=new Map(), pakete=new Map(), transport=[];
  S.mutateAuthStore=async change=>{const copy=structuredClone(auth);const r=await change(copy);auth=copy;return r;};
  S.listFullProfiles=async()=>[profile];S.reserveLlmCall=async()=>({allowed:true});
  S.canSpendLlmForTenant=async()=>({allowed:true});control.steuerungAktiv=()=>false;
  S.recordLlmUsage=async info=>{
    const row=S.buildLlmUsageRecord(info);await S.mutateAuthStore(a=>a.llmUsage.push(row));
    return {...row,_ablage:{blob:true}};
  };
  https.request=(url,options,callback)=>{
    A.equal(new URL(url).hostname,"offline.openai.azure.com");
    const tickets=Object.values(auth[B.KEY].calls);A.equal(tickets.length,1);
    A.equal(tickets[0].status,"reserviert");sends++;
    const req=new EventEmitter();req.write=()=>{};req.destroy=()=>{};
    req.end=()=>setImmediate(()=>{
      if(fehler==="timeout"){transport.push({code:"ETIMEDOUT"});req.emit("error",Object.assign(Error("synthetischer Azure-Timeout"),{code:"ETIMEDOUT"}));return;}
      const res=new EventEmitter();res.statusCode=fehler==="invalid"?200:Number(fehler);res.setEncoding=()=>{};
      transport.push({status:res.statusCode});
      callback(res);res.emit("data",fehler==="invalid"?' {"status":"completed","output_text": kaputt':'synthetische Stoerung');res.emit("end");
    });return req;
  };
  const doc=require("../lib/helmut/dedup").toRawDocumentRow({title:"Synthetische Beratung zur Arbeitsmarktpolitik",
    summary:"Der Bundestag berät im isolierten Szenario einen Antrag zur Arbeitsmarktpolitik und eine parlamentarische Anhörung.",
    url:"https://www.bundesregierung.de/breg-de/aktuelles/synthetischer-stoerfall",sourceName:"Bundesregierung",
    sourceId:"bundesregierung",linkType:"direct",publishedAt:tag+"T05:00:00Z",retrievedAt:tag+"T05:30:00Z"});
  const job=P.einzelArtikelAuftrag({id:doc.id,stand:R.standHash(doc),fenster:tag+"T05Z"});
  const row={id:analyseId,job_type:job.jobType,idempotency_key:job.idempotencyKey,tenant_id:null,payload:job.payload,
    status:"laeuft",attempts:1,max_attempts:3,lease_owner:"kombiniert",lease_expires_at:tag+"T05:40:00Z",created_at:tag+"T05:30:00Z"};
  const understandingDeps={canSpend:async()=>({allowed:true}),modelName:()=>"gpt-5-mini",logSkip:()=>{},
    findVorgangCandidates:async()=>[],listVorgangDocuments:async()=>[],saveSources:async()=>({ok:true}),
    markFailed:async()=>{},save:async()=>A.fail("Fehlerantwort wird nie Wissensobjekt"),
    verstehenVertrag:()=>K.baueVertrag({besitzer:"kombiniert-cas",deps:{erzwingeAktiv:true,speicher:cas}}),
    requestUnderstanding:prompt=>AI.requestStructuredJson(prompt,{type:"object"},{callType:"understanding",pipelineStep:"understanding",
      politicianId:null,betriebskostenProfileId:profile.id,runId:analyseId})};
  const handlerDeps={env:{...process.env,HELMUT_SCALABLE_PIPELINE:"on",HELMUT_QUELLEN_ARBEITSFENSTER:"on"},
    now:()=>clock,handler:P.HANDLER,ladeRohdokumente:async()=>[doc],ladeRohdokumentStaende:async()=>[doc],
    listFullProfiles:async()=>[profile],verstehenKonkurrenz:()=>true,
    klassen:{belege:async()=>({erlaubt:true,slot:"synthetischer-verstehensslot"}),gebeFrei:async()=>{}},
    zurueckstellen:async()=>A.fail("Gesendeter unbekannter Modellausgang wird nicht automatisch vorgelegt"),
    eagerUnderstanding:async docs=>{
      const r=await U.understandOneCluster({documents:docs},understandingDeps);
      return {processed:1,counts:{[r.status]:1},results:[r]};
    },
    finish:async args=>{
      A.equal(args.owner,row.lease_owner);A.equal(args.id,row.id);A.equal(args.ok,false);writes++;
      row.status="fehlgeschlagen";row.last_error=args.error;row.finished_at=new Date().toISOString();
      row.lease_owner=null;row.lease_expires_at=null;
      return {verfuegbar:true,uebernommen:true,neuerStatus:row.status};
    }
  };
  const ausgang=await P.fuehreAuftragAus({auftrag:row,besitzer:"kombiniert",restzeitMs:120000,deps:handlerDeps});
  A.equal(ausgang.ausgang,"endgueltig-fehlgeschlagen");A.equal(writes,1);A.equal(cas.r.zustand,"unbekannt");A.equal(sends,1);
  A.deepEqual(transport,[fehler==="timeout"?{code:"ETIMEDOUT"}:{status:fehler==="invalid"?200:Number(fehler)}]);
  const geldVor=structuredClone(auth[B.KEY]);
  A.equal(Object.keys(geldVor.calls).length,1);A.equal(Object.values(geldVor.calls)[0].status,"ungeklaert");
  A.equal(geldVor.bound,Object.values(geldVor.calls)[0].reserved);

  // Gleichzeitig ausgefallener amtlicher Quellenweg hat noch keine Quittung.
  const quelle=structuredClone(require("../lib/helmut/sources").v1Sources.find(q=>q.id==="bundesregierung"));
  const planauftrag={jobType:"source_fetch",idempotencyKey:"kombinierte-pflicht-"+fehler,tenantId:null,
    dueAt:tag+"T05:30:00Z",priority:50,payload:{art:"geteilt",quelle}};
  const source={id:abrufId,job_type:"source_fetch",idempotency_key:planauftrag.idempotencyKey,tenant_id:null,
    first_due_at:planauftrag.dueAt,payload:planauftrag.payload,status:"wartend",last_error:"HTTP 503"};
  const env={HELMUT_SCALABLE_PIPELINE:"on",HELMUT_QUELLEN_ARBEITSFENSTER:"on"};
  const deps={planungsrest:{lesen:async()=>({zustand:"fertig",auftraege:[planauftrag]})},
    offeneVorbedingungen:async()=>({verfuegbar:true,offen:0,fehlgeschlagen:0}),request:async url=>{
      if(dbAusfall)throw Error("Supabase storage failed (521): synthetischer Leseausfall");
      const u=new URL(url,"http://offline.invalid");
      if(u.pathname.endsWith("helmut_jobs"))return u.searchParams.has("idempotency_key")?[structuredClone(source)]:[structuredClone(row)];
      return [...belege.values()].map(x=>structuredClone(x));
    }};
  const lese=()=>V.lese({mandat:profile.id,jetztMs:clock,quellenBis:require("../lib/helmut/quellen-tagesbetrieb").zeiten(clock).redaktionsschluss,env,deps});
  A.equal(source.status,"wartend");A.equal(source.last_error,"HTTP 503");A.equal(belege.size,0);
  // Deklarierte Quellenrueckkehr noch VOR Redaktionsschluss; UNKNOWN der Analyse
  // ist unabhaengig davon. Alle Zustandswechsel folgen derselben virtuellen Uhr.
  clock=Date.parse(tag+"T05:40:00Z");
  Object.assign(source,{status:"erledigt",finished_at:new Date().toISOString()});
  const basis={version:1,bindung:F.quellbindung({id:source.id,tenantId:null,firstDueAt:source.first_due_at,payload:source.payload}),
    bestaetigtAm:new Date().toISOString(),ergebnis:{art:"rohfassungen",rohIds:[doc.id],analyse:[{jobId:analyseId,rohId:doc.id,stand:R.standHash(doc)}]}};
  belege.set(abrufId,{id:"main-quellenfaelligkeit-"+abrufId,data:{...basis,belegHash:H.hash(basis)}});
  clock=Date.parse(tag+"T06:20:00Z");
  dbAusfall=true;const unbekannt=await lese();A.equal(unbekannt.zustand,"unbekannt");dbAusfall=false;
  const wiederDa=await lese();A.equal(wiederDa.pflichtAbrufabdeckung.bestaetigt,1);
  A.equal(wiederDa.zustand,"offen");A.equal(wiederDa.verarbeitungBeendet,true);

  const packetStorage={assertTenant:S.assertTenant,
    getRenderedBriefingV3:async(id,slot,day)=>structuredClone(pakete.get(`bf-${id}-${slot}-${day}`)||null),
    insertRenderedBriefingV3:entry=>S.insertRenderedBriefingV3(entry,{bereit:true,request:async(url,opts)=>{
      A(url.includes("user_id=eq."+profile.id));A.equal(opts.method,"POST");
      const stored=JSON.parse(opts.body);A(!pakete.has(stored.id));pakete.set(stored.id,stored);packetWrites++;
      if(verlust){verlust=false;throw Error("Supabase storage failed (521): Schreibantwort verloren");}
      return [structuredClone(stored)];
    }}),
    ergaenzeUnvollstaendigesBriefing:(before,entry)=>S.ergaenzeUnvollstaendigesBriefing(before,entry,{bereit:true,request:async(url,opts)=>{
      A(url.includes("payload->>inhaltHash=eq."+before.payload.inhaltHash));A.deepEqual(pakete.get(before.id),before);
      A.equal(opts.method,"PATCH");pakete.set(entry.id,structuredClone(entry));packetWrites++;return [structuredClone(entry)];
    }})};
  const briefing=C.toBriefingContractV3({profile,decisions:[],kosById:{},sourcesByVorgang:{},now:new Date(),versorgung:unbekannt});
  A.equal(briefing.currentHelmutState.emptyState.kind,"gap");
  const speichern=()=>M.speicherePaket({profile,userId:profile.id,briefing,storage:packetStorage,tag,now:new Date()});
  await A.rejects(speichern,/Schreibantwort verloren/);A.equal(packetWrites,1);
  const replay=await speichern();A.equal(replay.beleg.vollstaendig,false);A.equal(replay.beleg.verifiziert,true);
  A.equal(replay.briefing.currentHelmutState.emptyState.kind,"gap");A.equal(packetWrites,1,"Readback statt zweitem Paketwrite");
  // Derselbe fachliche Auftrag bleibt auch nach Quellen-/DB-Rueckkehr gesperrt.
  const erneut=await U.understandOneCluster({documents:[doc]},understandingDeps);
  A.equal(erneut.status,"skipped-ausgang-unbekannt");A.equal(sends,1);A.equal(cas.r.ki,1);
  A.deepEqual(auth[B.KEY],geldVor);B.pruefeBuch(auth[B.KEY],auth[B.KEY].contract);
  A(clock<Date.parse(tag+"T06:30:00Z"));
  anzahl++;console.log(`PASS kombinierter Morgen ${fehler}: Quelle503 + AnalyseUNKNOWN + DB521 + verlorene Paketantwort, kein Doppelaufruf`);
}

(async()=>{
  A.equal(process.env.HELMUT_LOKALER_SCHUTZ,"aktiv","Nur ueber scripts/lokal.js starten");
  for(const fehler of ["timeout","invalid","429","500","503","521"])await fall(fehler);
})().then(()=>console.log(`${anzahl}/6 neue kombinierte Morgen-Stoerfaelle bestanden; HTTPS/DB synthetisch, keine Anbieter-/Productionprobe.`))
  .catch(e=>{console.error(e.stack);process.exitCode=1;})
  .finally(()=>{
    https.request=original.request;S.mutateAuthStore=original.mutate;S.listFullProfiles=original.profiles;
    S.reserveLlmCall=original.reserve;S.recordLlmUsage=original.record;S.canSpendLlmForTenant=original.canSpend;
    control.steuerungAktiv=original.control;globalThis.Date=EchtDate;
    for(const key of Object.keys(process.env))if(!Object.hasOwn(originalEnv,key))delete process.env[key];
    Object.assign(process.env,originalEnv);
  });
