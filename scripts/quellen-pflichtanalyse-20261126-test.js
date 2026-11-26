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
const { einzelArtikelAuftrag } = require("../lib/helmut/scalable-pipeline");
const { hash: belegHash } = require("../lib/helmut/briefing-speicher");
const now = Date.now(), tag = new Date(now).toISOString().slice(0,10);
const jobId = "00000000-0000-0000-0000-000000000001", abrufId = "00000000-0000-0000-0000-000000000002";
const optionen = {tag,jobId,abrufId,jetztMs:now};
const digest = text => createHash("sha256").update(text).digest("hex");
const q = value => "'" + JSON.stringify(value).replaceAll("'","''") + "'::jsonb";
let anzahl=0;
async function test(name,fn) { await fn(); console.log("PASS "+name); anzahl++; }
function vorschau(s) {
  const inhalt=JSON.stringify(s);
  return {version:1,modus:"vorschau",tag,jobId,abrufId,gelesenAm:new Date(now).toISOString(),inhalt,digest:digest(inhalt)};
}
function bestand() {
  const original = require("../lib/helmut/dedup").toRawDocumentRow({
    title:"Synthetischer Kabinettsbeschluss zur Arbeitsmarktpolitik",
    summary:"Das Kabinett beriet im isolierten Test die Arbeitsmarktpolitik und vereinbarte eine parlamentarische Beratung.",
    url:"https://www.bundesregierung.de/breg-de/aktuelles/synthetischer-pruefartikel-20261126",
    sourceId:"bundesregierung",sourceName:"Bundesregierung",sourceType:"ministry",linkType:"direct",
    publishedAt:new Date(Date.parse(tag)-86400000).toISOString(),retrievedAt:tag+"T00:00:00.000Z"});
  const stand=R.standHash(original), job=einzelArtikelAuftrag({id:original.id,stand});
  const quelle=require("../lib/helmut/sources").v1Sources.find(s=>s.id==="bundesregierung");
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
    attempts:3,max_attempts:3,wiedervorlagen:2,lease_owner:null,lease_expires_at:null},abruf:a,
    plan:{id:"main-quellenplan-"+tag,data},beleg:{id:"main-quellenfaelligkeit-"+abrufId,data:{...b,belegHash:belegHash(b)}},
    aktuell:{...original,published_at:new Date(Date.parse(tag)-2*86400000).toISOString()},
    archive:[{id:`main-rohstand-${original.id.slice(3)}-${stand}`,data:{version:1,quellenHash:stand,dokument:original}}],
    links:[],kos:[],cas:[],casIds:[],kostenDigest:null};
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
(async()=>{
  await test("exakte archivierte Pflichtversion ohne KO wird nur wartend freigegeben",async()=>{
    const b=await pruefe(vorschau(bestand()),optionen);A.equal(b.modus,"freigeben");A.equal(b.altabschluss,null);
  });
  await test("aelterer CAS-fertiger Abschluss beweist seine eigene Fassung, nicht die angeforderte",async()=>{
    const b=await pruefe(vorschau(mitAltabschluss(bestand())),optionen);
    A.equal(b.altabschluss.exakteVersionBereitsGelesen,false);A.notEqual(b.altabschluss.gelesenStand,b.altabschluss.angefordertStand);
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
      create table helmut_verstehen_reservierungen(vorgang_id text,zustand text,besitzer text,lease_bis timestamptz,fencing bigint,ergebnis_fencing bigint,ergebnis_hash text,ki_aufrufe int,versuche int);`);
    const s=bestand(), j=s.job,a=s.abruf;
    psql(`insert into helmut_store values(${q(s.plan.id)}#>>'{}',${q(s.plan.data)}),(${q(s.beleg.id)}#>>'{}',${q(s.beleg.data)}),(${q(s.archive[0].id)}#>>'{}',${q(s.archive[0].data)});
      insert into raw_documents select x.* from jsonb_populate_record(null::raw_documents,${q(s.aktuell)}) x;
      insert into helmut_jobs(id,job_type,idempotency_key,freshness_window,first_due_at,due_at,status,payload,attempts,max_attempts,last_error,finished_at,wiedervorlagen)
      values('${jobId}','document_understanding',${q(j.idempotency_key)}#>>'{}','alt',now()-interval '2 day',now()-interval '2 day','fehlgeschlagen',${q(j.payload)},3,3,'${j.last_error}','${j.finished_at}',2),
      ('${abrufId}','source_fetch',${q(a.idempotency_key)}#>>'{}','${tag}','${a.first_due_at}','${a.first_due_at}','erledigt',${q(a.payload)},1,3,null,'${a.finished_at}',0);`);
    const sql=readFileSync(path.join(__dirname,"ops/quellen-pflichtanalyse-20261126.sql"),"utf8");
    const ausfuehren=(modus,bindung)=>{
      const vars={modus,job_id:jobId,abruf_id:abrufId,tag,cas_ids:JSON.stringify(s.casIds),...(bindung?{bindung:JSON.stringify(bindung)}:{})};
      const text=Object.entries(vars).map(([k,v])=>`\\set ${k} '${v.replaceAll("'","\\'")}'`).join("\n")+"\n"+sql;
      return JSON.parse(psql(text).split("\n").at(-1));
    };
    let b=await pruefe(ausfuehren("vorschau"),{...optionen,jetztMs:Date.now()});
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
  }finally{psql(`drop database ${db} with (force);`,"postgres");}
})().then(()=>console.log(`${anzahl} gezielte Pflichtanalyse-Pruefungen bestanden`)).catch(e=>{console.error(e.stack);if(e.stderr)console.error(String(e.stderr));process.exitCode=1;});
