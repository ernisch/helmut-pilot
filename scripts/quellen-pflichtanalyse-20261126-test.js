"use strict";
// Native Negativbelege; optional echte SQL-/Claim-/Rueckwegprobe ausschliesslich
// im ausdruecklich benannten netzlosen PostgreSQL-17.6-tmpfs-Testcontainer.
const A = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { pruefe, casKennungen } = require("./ops/quellen-pflichtanalyse-20261126");
const R = require("../lib/helmut/roh-quellenstaende");
const F = require("../lib/helmut/quellen-faelligkeit");
const L = require("../lib/helmut/quellen-lektuerebeleg");
const I = require("../lib/helmut/vorgang-identity");
const V = require("../lib/helmut/verstehen-vertrag");
const B = require("../lib/helmut/betriebskosten-budget");
const { einzelArtikelAuftrag } = require("../lib/helmut/scalable-pipeline");
const { hash: belegHash } = require("../lib/helmut/briefing-speicher");
const now = Date.now(), tag = new Date(now).toISOString().slice(0,10);
const jobId = "00000000-0000-0000-0000-000000000001", abrufId = "00000000-0000-0000-0000-000000000002";
const optionen = {tag,jobId,abrufId,jetztMs:now};
const digest = text => createHash("sha256").update(text).digest("hex");
const q = value => "'" + JSON.stringify(value).replaceAll("'","''") + "'::jsonb";
let anzahl=0;
async function test(name,fn) { await fn(); console.log("PASS "+name); anzahl++; }
function vorschau(s,klasse="metadaten-pflicht") {
  const inhalt=JSON.stringify(s);
  return {version:1,modus:"vorschau",klasse,tag,jobId,abrufId,gelesenAm:new Date(now).toISOString(),inhalt,digest:digest(inhalt)};
}
function bestand() {
  const contract=B.vertrag({[B.ENV]:JSON.stringify({version:1,profileId:"synthetischer-betrieb",
    startsAt:new Date(Date.parse(tag)-30*86400000).toISOString(),dailyLimitUsd:1,totalLimitUsd:30,
    route:{provider:"azure",responsesUrl:"https://offline.openai.azure.com/openai/v1/responses",model:"gpt-5-mini"}})});
  const original = require("../lib/helmut/dedup").toRawDocumentRow({
    title:"Synthetischer Kabinettsbeschluss zur Arbeitsmarktpolitik",
    summary:"Das Kabinett beriet im isolierten Test die Arbeitsmarktpolitik und vereinbarte eine parlamentarische Beratung.",
    url:"https://www.bundesregierung.de/breg-de/aktuelles/synthetischer-pruefartikel-20261126",
    sourceId:"bundesregierung",sourceName:"Bundesregierung",sourceType:"ministry",linkType:"direct",
    publishedAt:new Date(Date.parse(tag)-86400000).toISOString(),retrievedAt:tag+"T00:00:00.000Z"});
  const stand=R.standHash(original), job=einzelArtikelAuftrag({id:original.id,stand});
  const quelle=structuredClone(require("../lib/helmut/sources").v1Sources.find(s=>s.id==="bundesregierung"));
  const dueAt=tag+"T00:00:00.000Z";
  const planauftrag={jobType:"source_fetch",idempotencyKey:"amtliche-pflicht-test-"+tag,tenantId:null,dueAt,priority:50,
    payload:{art:"geteilt",quelle}};
  const auftraege=[planauftrag], tagesplan=null;
  const canonical = value => Array.isArray(value)?value.map(canonical):value&&typeof value==="object"
    ?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
  const data={version:1,tag,auftraege,tagesplan,cursor:1,zustand:"fertig",manifestHash:digest(JSON.stringify(canonical([tag,auftraege,tagesplan])))};
  const a={id:abrufId,job_type:"source_fetch",idempotency_key:planauftrag.idempotencyKey,tenant_id:null,
    first_due_at:dueAt,status:"erledigt",finished_at:dueAt,payload:planauftrag.payload,lease_owner:null,lease_expires_at:null};
  const b={version:1,bindung:F.quellbindung({id:a.id,tenantId:null,firstDueAt:dueAt,payload:a.payload}),bestaetigtAm:dueAt,
    ergebnis:{art:"rohfassungen",rohIds:[original.id],analyse:[{jobId,rohId:original.id,stand}]}};
  const s={job:{id:jobId,job_type:job.jobType,idempotency_key:job.idempotencyKey,tenant_id:null,status:"fehlgeschlagen",
    payload:job.payload,last_error:"quellenstand-metadatenabweichung",finished_at:new Date(Date.parse(tag)-3600000).toISOString(),
    attempts:3,max_attempts:3,wiedervorlagen:2,created_at:new Date(Date.parse(tag)-7*86400000).toISOString(),lease_owner:null,lease_expires_at:null},abruf:a,
    plan:{id:"main-quellenplan-"+tag,data},beleg:{id:"main-quellenfaelligkeit-"+abrufId,data:{...b,belegHash:belegHash(b)}},
    aktuell:{...original,published_at:new Date(Date.parse(tag)-2*86400000).toISOString()},
    archive:[{id:`main-rohstand-${original.id.slice(3)}-${stand}`,data:{version:1,quellenHash:stand,dokument:original}}],
    links:[],kos:[],cas:[],casIds:[],kostenDigest:null,
    kostenBuch:{version:1,contractHash:contract.contractHash,contract,calls:{},bound:0,frozen:null},
    jobBuchungen:[],jobNutzung:{modus:"legacy-objektbezug",spalten:["id","created_at","vorgang_id","knowledge_object_id"],zeilen:[]},blobJobNutzung:[]};
  s.casIds=casKennungen(vorschau(s));
  return s;
}
function mitAltabschluss(s) {
  const doc={...s.aktuell,summary:"Die bereits frueher gelesene Fassung nennt einen anderen Inhalt zur Arbeitsmarktpolitik."};
  s.aktuell=doc;
  const stand=R.standHash(doc);
  s.archive.push({id:`main-rohstand-${doc.id.slice(3)}-${stand}`,data:{version:1,quellenHash:stand,dokument:doc}});
  const vg=I.deriveVorgangId(I.clusterRawDocuments([doc])[0]);
  const quellen=[L.quellenLektuereBeleg(L.quelleFuerPrompt(doc,0,null,0))];
  const b={version:2,vorgangId:vg,koVersion:1,quellen,belegHash:L.hash([2,vg,1,quellen])};
  const ko={id:"ko-"+vg,vorgang_id:vg,ko_version:1,source_document_count:1,verstehen_fencing:1,
    understanding_status:"complete",classification_confidence:{helmut_quellen_lektuere:b}};
  s.links=[{raw_document_id:doc.id,knowledge_object_id:ko.id}];s.kos=[ko];
  s.cas=[{vorgang_id:vg,zustand:"fertig",besitzer:null,lease_bis:null,fencing:1,ergebnis_fencing:1,
    ergebnis_hash:V.ergebnisHash(ko),ki_aufrufe:1,versuche:1}];
  s.casIds=casKennungen(vorschau(s));return s;
}
function mitSlotrest(s) {
  s.aktuell={...s.archive[0].data.dokument};
  s.job={...s.job,last_error:"verstehen-uebersprungen-dauerhaft: verstehen-fortsetzung seit 141 h",
    finished_at:"2026-11-26T07:04:00.000Z",wiedervorlagen:1,quellen_prioritaet_tag:null};
  s.abruf.priority=100;s.plan.data.auftraege[0].priority=100;
  const p=s.plan.data;p.manifestHash=digest(JSON.stringify(L.kanonisch([tag,p.auftraege,p.tagesplan])));
  const vg=I.deriveVorgangId(I.clusterRawDocuments([s.aktuell])[0]);
  s.kos=[{id:"ko-"+vg,vorgang_id:vg,ko_version:1,source_document_count:1,understanding_status:"pending"}];
  s.links=[{raw_document_id:s.aktuell.id,knowledge_object_id:s.kos[0].id}];
  s.casIds=casKennungen(vorschau(s));return s;
}
function mitGoogleSlotrest(s) {
  const doc=s.archive[0].data.dokument, proxy="https://news.google.com/rss/articles/CBMiSynthetischerPruefartikel";
  doc.raw={...doc.raw,originalUrl:proxy};s.aktuell=structuredClone(doc);
  const stand=R.standHash(doc), j=einzelArtikelAuftrag({id:doc.id,stand});
  s.job.payload=j.payload;s.job.idempotency_key=j.idempotencyKey;
  s.archive=[{id:`main-rohstand-${doc.id.slice(3)}-${stand}`,data:{version:1,quellenHash:stand,dokument:doc}}];
  const quelle=s.abruf.payload.quelle;
  Object.assign(quelle,{id:"synthetische-google-route",retrievalPathId:"rp-synthetische-google-route",type:"media",
    url:"https://news.google.com/search?q=Bundespolitik",rssUrl:"https://news.google.com/rss/search?q=Bundespolitik",rssUrls:[]});
  s.plan.data.auftraege[0].payload.quelle=quelle;
  const p=s.plan.data;p.manifestHash=digest(JSON.stringify(L.kanonisch([tag,p.auftraege,p.tagesplan])));
  const b=s.beleg.data;delete b.belegHash;b.bindung=F.quellbindung({id:abrufId,tenantId:null,firstDueAt:s.abruf.first_due_at,payload:s.abruf.payload});
  b.ergebnis.analyse[0].stand=stand;s.beleg.data={...b,belegHash:belegHash(b)};
  s.fundstellen=[{raw_document_id:doc.id,source_id:quelle.id,retrieval_path_id:quelle.retrievalPathId,
    original_url:proxy,link_type:"direct",found_at:new Date(now-3600000).toISOString()}];
  s.casIds=casKennungen(vorschau(s));return s;
}
(async()=>{
  await test("exakte archivierte Pflichtversion ohne KO wird nur wartend freigegeben",async()=>{
    const b=await pruefe(vorschau(bestand()),optionen);A.equal(b.modus,"freigeben");A.equal(b.altabschluss,null);
  });
  await test("aelterer CAS-fertiger Abschluss beweist seine eigene Fassung, nicht die angeforderte",async()=>{
    const b=await pruefe(vorschau(mitAltabschluss(bestand())),optionen);
    A.equal(b.altabschluss.exakteVersionBereitsGelesen,false);A.notEqual(b.altabschluss.gelesenStand,b.altabschluss.angefordertStand);
  });
  await test("gueltige Teilquittung gibt nur ihre exakt referenzierte Pflichtanalyse frei",async()=>{
    const s=bestand(), b=s.beleg.data;delete b.belegHash;b.ergebnis.art="teilweise";
    b.ergebnis.rohIds.push("rd-"+"f".repeat(64));s.beleg.data={...b,belegHash:belegHash(b)};
    const freigabe=await pruefe(vorschau(s),optionen);A.equal(freigabe.abrufBleibtTeilweise,true);
    A.equal(freigabe.vor.beleg.data.ergebnis.art,"teilweise");
  });
  await test("nur belegter optionaler Slotrest des exakten Vorfalls ist freigebbar",async()=>{
    const b=await pruefe(vorschau(mitSlotrest(bestand()),"slotrest-20261126"),optionen);
    A.equal(b.klasse,"slotrest-20261126");A.equal(b.vor.job.quellen_prioritaet_tag,null);
  });
  await test("Google-Slotrest bindet aktuellen Fundweg trotz historisch anderem source_id",async()=>{
    const s=mitGoogleSlotrest(mitSlotrest(bestand()));A.notEqual(s.aktuell.source_id,s.abruf.payload.quelle.id);
    const b=await pruefe(vorschau(s,"slotrest-20261126"),optionen);A.equal(b.klasse,"slotrest-20261126");
  });
  await test("Google-Slotrest sperrt fremden Weg, alte Fundstelle und unsicheres Originalziel",async()=>{
    for(const mutate of [s=>{s.fundstellen[0].retrieval_path_id="rp-fremd";},s=>{s.fundstellen[0].source_id="fremd";},
      s=>{s.fundstellen[0].found_at=new Date(now-8*86400000).toISOString();},s=>{s.fundstellen=[];},
      s=>{s.fundstellen[0].link_type="google_proxy";},s=>{s.fundstellen[0].original_url="https://news.google.com/search?q=all";},
      s=>{s.archive[0].data.dokument.url="https://127.0.0.1/private";}]){
      const s=mitGoogleSlotrest(mitSlotrest(bestand()));mutate(s);
      await A.rejects(()=>pruefe(vorschau(s,"slotrest-20261126"),optionen));
    }
  });
  await test("Slotrest ausserhalb Vorfall, mit CAS, Modellbuchung oder Textdrift bleibt gesperrt",async()=>{
    for(const mutate of [s=>{s.job.finished_at="2026-11-26T07:04:13Z";},s=>{s.job.finished_at="2026-11-26T07:03:57Z";},
      s=>{s.job.wiedervorlagen=2;},s=>{s.job.last_error="verstehen-uebersprungen-dauerhaft: zeitbudget";},
      s=>{s.cas=[{vorgang_id:s.casIds[0],zustand:"unbekannt"}];},s=>{s.jobBuchungen=[{runId:jobId}];},
      s=>{s.jobNutzung.zeilen=[{vorgang_id:s.casIds[0]}];},s=>{s.aktuell.summary+=" anderer Text";},
      s=>{s.kos[0].understanding_status="complete";},s=>{s.job.quellen_prioritaet_tag=tag;},s=>{s.abruf.priority=50;}]){
      const s=mitSlotrest(bestand());mutate(s);await A.rejects(()=>pruefe(vorschau(s,"slotrest-20261126"),optionen));
    }
  });
  await test("Legacy-Schema belegt Kostenfreiheit nur mit vollstaendigem nativ gueltigem aktivem Buch",async()=>{
    for(const mutate of [s=>{delete s.kostenBuch;},s=>{s.kostenBuch.frozen="ungeklaert";},
      s=>{s.job.created_at="2000-01-01T00:00:00Z";},s=>{s.blobJobNutzung=[{runId:jobId}];},
      s=>{s.jobNutzung.modus="lauf-und-objektbezug";},s=>{s.jobNutzung.spalten=[];}]){
      const s=mitSlotrest(bestand());mutate(s);
      await A.rejects(()=>pruefe(vorschau(s,"slotrest-20261126"),optionen));
    }
    const s=mitSlotrest(bestand()),call={id:"synthetische-unzuordenbare-buchung",day:tag,
      reserved:B.kosten(400000,1000),maxOutputTokens:1000,model:"gpt-5-mini",requestHash:"a".repeat(64),
      createdAt:tag+"T00:00:00.000Z",runId:null,callType:"understanding",status:"reserviert"};
    s.kostenBuch.calls[call.id]=call;s.kostenBuch.bound=call.reserved;
    await A.rejects(()=>pruefe(vorschau(s,"slotrest-20261126"),optionen),/unzuordenbare Analysebuchung/);
  });
  await test("NULL-Originalauszug bleibt trotz exakter Fundstelle mit konkretem Grund gesperrt",async()=>{
    const s=mitSlotrest(bestand());s.aktuell.summary=null;s.casIds=casKennungen(vorschau(s));
    await A.rejects(()=>pruefe(vorschau(s,"slotrest-20261126"),optionen),/positiv belegter Originaltext fehlt/);
  });
  const negativ=[
    ["Titelabweichung",s=>{s.aktuell.title+=" anderer Titel";}],
    ["Archivmanipulation",s=>{s.archive[0].data.dokument.summary+=" manipuliert";}],
    ["Diagnoseauftrag",s=>{s.job.idempotency_key+="|eingangsfehler|versionskonflikt";}],
    ["alter Slotfehler",s=>{s.job.last_error="verstehen-uebersprungen-dauerhaft: verstehen-fortsetzung seit 141 h";}],
    ["abgelaufene Einmalbindung",s=>{s.job.payload.wiederaufnahme={bisMs:0};}],
    ["ungebundener Abruf",s=>{s.abruf.payload={...s.abruf.payload,quelle:{id:"fremd"}};}],
    ["fehlende CAS-Nachlesung",s=>{s.casIds=[];}],
    ["fremde Pflichtversion",s=>{s.beleg.data.ergebnis.analyse[0].stand="b".repeat(64);}],
    ["voller Versuchsdeckel",s=>{s.job.attempts=50;s.job.max_attempts=50;}]
  ];
  for(const [name,mutate] of negativ) await test(name+" bleibt gesperrt",async()=>{
    const s=bestand();mutate(s);await A.rejects(()=>pruefe(vorschau(s),optionen));
  });
  await test("UNKNOWN mit zwei Aufrufen und fehlende Altlektuere bleiben gesperrt",async()=>{
    for(const typ of ["unbekannt","ohne-beleg","falscher-textstand","falscher-cas-hash"]){
      const s=mitAltabschluss(bestand());
      if(typ==="unbekannt"){s.cas[0].zustand="unbekannt";s.cas[0].ki_aufrufe=2;}
      if(typ==="ohne-beleg")s.kos[0].classification_confidence={};
      if(typ==="falscher-textstand")s.kos[0].classification_confidence.helmut_quellen_lektuere.quellen[0].textstandHash="c".repeat(64);
      if(typ==="falscher-cas-hash")s.cas[0].ergebnis_hash="d".repeat(40);
      await A.rejects(()=>pruefe(vorschau(s),optionen));
    }
  });
  await test("Vorschaudigest und UTC-Tagesfrische sind bindend",async()=>{
    const v=vorschau(bestand());v.digest="0".repeat(64);await A.rejects(()=>pruefe(v,optionen));
    await A.rejects(()=>pruefe(vorschau(bestand()),{...optionen,jetztMs:now+86400000}));
    await A.rejects(()=>pruefe({...vorschau(bestand()),gelesenAm:new Date(now-16*60000).toISOString()},optionen));
  });
  const container=process.argv[process.argv.indexOf("--container")+1];
  if(!process.argv.includes("--container")){console.log("SQL-/Claim-Nachweis nicht gestartet (kein isolierter Container benannt)");return;}
  A.equal(process.env.HELMUT_LOKALER_SCHUTZ,"aktiv");
  A.equal(container,"helmut-pflichtanalyse-20261126");
  const inspect=JSON.parse(execFileSync("docker",["inspect",container],{encoding:"utf8"}))[0];
  A.equal(inspect.HostConfig.NetworkMode,"none");A.match(inspect.Config.Image,/^postgres:17\.6-/);
  A(inspect.HostConfig.Tmpfs?.["/var/lib/postgresql/data"]);
  const db="helmut_pflicht_"+process.pid;
  const psql=(input,datenbank=db)=>execFileSync("docker",["exec","-i",container,"psql","-X","-q","-At","-U","postgres","-d",datenbank,"-v","ON_ERROR_STOP=1"],
    {input,encoding:"utf8",stdio:["pipe","pipe","pipe"],maxBuffer:16*1024*1024}).trim();
  psql(`create database ${db};`,"postgres");
  try{
    psql("do $$ begin create role anon; exception when duplicate_object then null; end $$;do $$ begin create role authenticated; exception when duplicate_object then null; end $$;do $$ begin create role service_role; exception when duplicate_object then null; end $$;", "postgres");
    psql(readFileSync(path.join(__dirname,"../supabase/migrations/20260808_scalable_job_queue.sql"),"utf8"));
    psql(`alter table helmut_jobs add column quellen_prioritaet_tag date;alter table helmut_jobs add column wiedervorlagen int default 0;
      create table helmut_store(id text primary key,data jsonb);create table raw_documents(id text primary key,url text,canonical_url text,title text,summary text,source_name text,source_id text,source_type text,link_type text,published_at timestamptz,retrieved_at timestamptz,raw jsonb);
      create table knowledge_objects(id text primary key,vorgang_id text,ko_version int,source_document_count int,verstehen_fencing bigint,understanding_status text,classification_confidence jsonb);
      create table ko_document_links(knowledge_object_id text,raw_document_id text);
      create table helmut_verstehen_reservierungen(vorgang_id text,zustand text,besitzer text,lease_bis timestamptz,fencing bigint,ergebnis_fencing bigint,ergebnis_hash text,ki_aufrufe int,versuche int);
      create table llm_usage(id text primary key,politician_id text,user_id text,model text,call_type text,
        prompt_tokens integer,completion_tokens integer,total_tokens integer,estimated_cost numeric,duration_ms integer,
        success boolean,error text,created_at timestamptz,source_id text,package_id text,vorgang_id text,knowledge_object_id text);
      create table document_findings(raw_document_id text,source_id text,retrieval_path_id text,original_url text,link_type text,found_at timestamptz);`);
    const s=bestand(), j=s.job,a=s.abruf;
    psql(`insert into helmut_store values('main-auth',${q({betriebskostenBudget:s.kostenBuch,llmUsage:[]})}),
      (${q(s.plan.id)}#>>'{}',${q(s.plan.data)}),(${q(s.beleg.id)}#>>'{}',${q(s.beleg.data)}),(${q(s.archive[0].id)}#>>'{}',${q(s.archive[0].data)});
      insert into raw_documents select x.* from jsonb_populate_record(null::raw_documents,${q(s.aktuell)}) x;
      insert into helmut_jobs(id,job_type,idempotency_key,freshness_window,first_due_at,due_at,status,payload,attempts,max_attempts,last_error,finished_at,wiedervorlagen)
      values('${jobId}','document_understanding',${q(j.idempotency_key)}#>>'{}','alt',now()-interval '2 day',now()-interval '2 day','fehlgeschlagen',${q(j.payload)},3,3,'${j.last_error}','${j.finished_at}',2),
      ('${abrufId}','source_fetch',${q(a.idempotency_key)}#>>'{}','${tag}','${a.first_due_at}','${a.first_due_at}','erledigt',${q(a.payload)},1,3,null,'${a.finished_at}',0);`);
    const sql=readFileSync(path.join(__dirname,"ops/quellen-pflichtanalyse-20261126.sql"),"utf8");
    const ausfuehren=(modus,bindung,klasse="metadaten-pflicht",casIds=s.casIds)=>{
      const vars={modus,klasse,job_id:jobId,abruf_id:abrufId,tag,cas_ids:JSON.stringify(casIds),...(bindung?{bindung:JSON.stringify(bindung)}:{})};
      const text=Object.entries(vars).map(([k,v])=>`\\set ${k} '${v.replaceAll("'","\\'")}'`).join("\n")+"\n"+sql;
      return JSON.parse(psql(text).split("\n").at(-1));
    };
    let b=await pruefe(ausfuehren("vorschau"),{...optionen,jetztMs:Date.now()});
    await test("echtes Production-Legacyschema ohne run_id zeigt vorhandene Vorgangsnutzung",async()=>{
      const v=JSON.parse(ausfuehren("vorschau").inhalt);
      A.equal(v.jobNutzung.modus,"legacy-objektbezug");A(!v.jobNutzung.spalten.includes("run_id"));
      psql(`insert into llm_usage(id,vorgang_id,created_at,model,call_type)
        values('legacy-beleg',${q(s.casIds[0])}#>>'{}',now(),'gpt-5-mini','understanding');`);
      const belegt=JSON.parse(ausfuehren("vorschau").inhalt);
      A.equal(belegt.jobNutzung.zeilen.length,1);A.equal(belegt.jobNutzung.zeilen[0].id,"legacy-beleg");
      psql("delete from llm_usage where id='legacy-beleg';");
    });
    const original=JSON.parse(psql(`select to_jsonb(j) from helmut_jobs j where id='${jobId}'`));
    let receipt;
    await test("SQL stoppt bei nativer Vorwertdrift und abgelaufener Bindung",async()=>{
      psql(`update helmut_jobs set wiedervorlagen=wiedervorlagen+1 where id='${jobId}'`);
      A.throws(()=>ausfuehren("freigeben",b));
      psql(`update helmut_jobs set wiedervorlagen=wiedervorlagen-1 where id='${jobId}'`);
      b=await pruefe(ausfuehren("vorschau"),{...optionen,jetztMs:Date.now()});
      A.throws(()=>ausfuehren("freigeben",{...b,geprueftAm:new Date(now-16*60000).toISOString()}));
      A.throws(()=>ausfuehren("freigeben",{...b,tag:"2020-01-01"}));
    });
    await test("echte SQL-Freigabe erhoeht nur den gebundenen Versuchsdeckel um eins",async()=>{
      receipt=ausfuehren("freigeben",b);A.equal(receipt.nach.job.status,"wartend");
      A.equal(receipt.nach.job.attempts,original.attempts);A.equal(receipt.nach.job.max_attempts,original.max_attempts+1);
      A.equal(receipt.nach.job.last_error,original.last_error);A.deepEqual(receipt.nach.job.payload,original.payload);
      A.equal(receipt.nachDigest,ausfuehren("vorschau").digest);
    });
    await test("derselbe Freigabebeleg ist nicht wiederverwendbar",async()=>{A.throws(()=>ausfuehren("freigeben",b));});
    await test("Rollback vor Uebernahme erhaelt Historie und sperrt erneute alte Freigabe",async()=>{
      const r=ausfuehren("rueckweg",receipt);A.equal(r.nach.job.status,"fehlgeschlagen");
      A.equal(r.nach.job.max_attempts,original.max_attempts);A.equal(Date.parse(r.nach.job.finished_at),Date.parse(original.finished_at));
      A.throws(()=>ausfuehren("freigeben",b));A.throws(()=>ausfuehren("rueckweg",receipt));
    });
    b=await pruefe(ausfuehren("vorschau"),{...optionen,jetztMs:Date.now()});
    receipt=ausfuehren("freigeben",b);
    await test("Rueckweg stoppt auch bei unveraendert wartendem Job und zwischenzeitlicher Archivdrift",async()=>{
      psql(`update helmut_store set data=jsonb_set(data,'{dokument,title}','"Archivdrift"') where id=${q(s.archive[0].id)}#>>'{}'`);
      A.throws(()=>ausfuehren("rueckweg",receipt));
      psql(`update helmut_store set data=${q(s.archive[0].data)} where id=${q(s.archive[0].id)}#>>'{}'`);
    });
    await test("nativer Claim uebernimmt genau einen zusaetzlichen Versuch; Rueckweg danach gesperrt",async()=>{
      const claimed=JSON.parse(psql("select to_jsonb(j) from helmut_claim_jobs('isolierter-pruefer',1,60000,array['document_understanding']) j"));
      A.equal(claimed.id,jobId);A.equal(claimed.attempts,original.attempts+1);A.equal(claimed.status,"laeuft");
      A.throws(()=>ausfuehren("rueckweg",receipt));
    });
    await test("SQL-Slotrest-Freigabe erhaelt optionale Prioritaet und hat eigenen Rueckweg",async()=>{
      const slot=mitSlotrest(bestand()), ko=slot.kos[0];
      psql(`update helmut_jobs set status='fehlgeschlagen',attempts=3,max_attempts=3,wiedervorlagen=1,
        lease_owner=null,lease_expires_at=null,finished_at='${slot.job.finished_at}',
        last_error='${slot.job.last_error}',quellen_prioritaet_tag=null where id='${jobId}';
        update helmut_jobs set priority=100 where id='${abrufId}';
        update helmut_store set data=${q(slot.plan.data)} where id=${q(slot.plan.id)}#>>'{}';
        update raw_documents set published_at='${slot.aktuell.published_at}';
        insert into knowledge_objects select x.* from jsonb_populate_record(null::knowledge_objects,${q(ko)}) x;
        insert into ko_document_links values(${q(ko.id)}#>>'{}',${q(slot.aktuell.id)}#>>'{}');`);
      const rufe=(modus,bindung)=>ausfuehren(modus,bindung,"slotrest-20261126",slot.casIds);
      const b=await pruefe(rufe("vorschau"),{...optionen,jetztMs:Date.now()});
      const r=rufe("freigeben",b);A.equal(r.nach.job.status,"wartend");
      A.equal(r.nach.job.max_attempts,4);A.equal(r.nach.job.attempts,3);
      A.equal(r.nach.job.quellen_prioritaet_tag,null);A.deepEqual(r.nach.cas,[]);
      const rollback=rufe("rueckweg",r);A.equal(rollback.nach.job.status,"fehlgeschlagen");
      A.equal(rollback.nach.job.max_attempts,3);A.equal(rollback.nach.job.quellen_prioritaet_tag,null);
      const altbindung=await pruefe(rufe("vorschau"),{...optionen,jetztMs:Date.now()});
      psql(`insert into llm_usage(id,knowledge_object_id,created_at) values('legacy-ko-beleg',${q(ko.id)}#>>'{}',now());`);
      await A.rejects(()=>pruefe(rufe("vorschau"),{...optionen,jetztMs:Date.now()}),/ohne CAS-\/Modellbuchung/);
      psql("delete from llm_usage where id='legacy-ko-beleg';");
      psql(`alter table llm_usage add column run_id text;alter table llm_usage add column tenant_id text;
        alter table llm_usage add column profile_id text;alter table llm_usage add column pipeline_step text;
        alter table llm_usage add column kein_aufruf boolean not null default false;`);
      A.throws(()=>rufe("freigeben",altbindung),"Schemawechsel zwischen Bindung und Anwendung muss stoppen");
      const modern=await pruefe(rufe("vorschau"),{...optionen,jetztMs:Date.now()});
      A.equal(modern.vor.jobNutzung.modus,"lauf-und-objektbezug");A(modern.vor.jobNutzung.spalten.includes("run_id"));
      const modernQuittung=rufe("freigeben",modern);rufe("rueckweg",modernQuittung);
      psql(`insert into llm_usage(id,run_id,created_at) values('aktueller-laufbeleg','${jobId}',now());`);
      await A.rejects(()=>pruefe(rufe("vorschau"),{...optionen,jetztMs:Date.now()}),/ohne CAS-\/Modellbuchung/);
    });
  }finally{psql(`drop database ${db} with (force);`,"postgres");}
})().then(()=>console.log(`${anzahl} gezielte Pflichtanalyse-Pruefungen bestanden`)).catch(e=>{console.error(e.stack);if(e.stderr)console.error(String(e.stderr));process.exitCode=1;});
