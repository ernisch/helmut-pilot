"use strict";
// CI: synthetischer Fachkern und feste Wrapperabgrenzung. Optional --privat DIR:
// private volle Produktpin-Abnahme in eigener isolierter PG17.6, keine Daten in Git.
const A=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {execFileSync}=require("node:child_process");
const O=require("./quellen-breg-fassung-20261127");
const B=require("../../lib/helmut/ko-quellenfassung"),R=require("../../lib/helmut/roh-quellenstaende");
const arg=k=>process.argv.includes(k)?process.argv[process.argv.indexOf(k)+1]:null;
const lit=x=>"'"+String(x).replaceAll("'","''")+"'";
const j=x=>lit(JSON.stringify(x))+"::jsonb";
let passed=0;
const test=async(name,fn)=>{if(process.argv.includes("--nur-nativ")&&!name.startsWith("Privat/native:"))return;
 if(process.argv.includes("--nur-append")&&!name.includes("Append"))return;
 if(process.argv.includes("--nur-ergaenzung")&&!name.includes("Ergaenzung"))return;
 await fn();console.log("PASS "+(++passed)+" "+name);};
function synthetisch(){
 const roh=Array.from({length:60},(_,i)=>({id:"rd-"+B.digest(["synthetische Quelle",i]),
  title:"Synthetische Bestandsquelle "+i,summary:"Synthetischer amtlicher Auszug "+i,
  url:"https://example.invalid/"+i,canonical_url:"https://example.invalid/"+i,
  source_id:"synthetisch",source_name:"Synthetisches Amt",source_type:"ministry",
  published_at:"2026-04-17T07:00:00+00:00",retrieved_at:"2026-08-20T04:01:43.145+00:00",
  created_at:"2026-07-27T16:01:57.064+00:00",content_fingerprint:"alte-synthetische-kennung",
  raw:{retrievalPathId:"rp-synthetisch"}})).sort((a,b)=>a.id<b.id?-1:1);
 const raw=roh[0].id,kos=["ko-synthetisch-a","ko-synthetisch-b"];
 const neu={...roh[0],summary:"Gespeicherter neuer RSS-Auszug",published_at:"2026-11-25T08:30:00.000Z"};
 const archive=roh.slice(0,13).map(d=>({id:B.pointer(d.id,R.standHash(d)),data:{version:1,quellenHash:R.standHash(d),dokument:structuredClone(d)}}));
 archive.push({id:B.pointer(raw,R.standHash(neu)),data:{version:1,quellenHash:R.standHash(neu),dokument:neu}});
 for(let i=1;i<=3;i++){const d={...roh[i],title:"Synthetischer anderer historischer Stand "+i};
 archive.push({id:B.pointer(d.id,R.standHash(d)),data:{version:1,quellenHash:R.standHash(d),dokument:d}});}
 const kanten=roh.map(r=>({knowledge_object_id:kos[0],raw_document_id:r.id,created_at:"2026-08-20T00:00:00+00:00"}));
 kanten.push({...kanten[0],knowledge_object_id:kos[1]});
 return {s:{roh,kos:kos.map((id,i)=>({id,ko_version:1,understanding_status:"complete",verstehen_fencing:i?1:null})),
  kanten,zielKanten:kanten.filter(l=>l.raw_document_id===raw),archive,findings:[],bindungen:[]},
  ziel:{raw,kos,rawIds:roh.map(r=>r.id),alt:R.standHash(roh[0]),neu:R.standHash(neu),
    anker:{archive:archive.map(B.digest),findings:[]}}};
}
function original(file){
 const x=JSON.parse(fs.readFileSync(file,"utf8")),o=x.result||x;
 const t=JSON.parse(o.content[0].text).result;
 const m=/\n(\[.*\])\n<\/untrusted/s.exec(t);A(m,"Private Originalantwort mit unveraenderter Datenhuelle");
 return JSON.parse(m[1])[0];
}
(async()=>{
 A.equal(process.env.HELMUT_LOKALER_SCHUTZ,"aktiv");
 await test("Synthetischer Fachkern:60+1 Links/13 exakte Altarchive/47 neue Snapshots, Metadaten erhalten",()=>{
  const {s,ziel}=synthetisch(),p=O.plane(s,ziel);
  A.equal(p.neueArchive.length,47);A.equal(p.bindungen.length,61);
  A.equal(p.nach.created_at,p.alt.created_at);A.equal(p.nach.content_fingerprint,null);
  A.equal(new Set(p.bindungen.map(l=>l.knowledge_object_id)).size,2);
  A.equal(p.neueArchive[0].data.dokument.created_at,"2026-07-27T16:01:57.064+00:00");
 });
 await test("Synthetischer Fachkern: Kanten-/KO-/Archiv-/Fassungsdrift stoppt geschlossen",()=>{
  for(const mutate of [
   s=>s.kanten.pop(),s=>s.kos[0].ko_version++,s=>s.archive[0].data.dokument.source_id="fremd",
   s=>s.roh[0].title="drift",s=>s.zielKanten.push({...s.zielKanten[0],knowledge_object_id:"fremd"}),
   s=>s.bindungen.push({knowledge_object_id:"vorbindung"})
  ]){const {s,ziel}=synthetisch();mutate(s);A.throws(()=>O.plane(s,ziel),/breg-fassung:/);}
 });
 await test("Synthetischer Fachkern: Append bewahrt feste Anker, verwendet exakte Archive und erzeugt nur fehlende",()=>{
  const {s,ziel}=synthetisch(),d=s.roh[13],anders={...s.roh[14],title:"Anderer synthetischer Stand"};
  const archiv=d=>({id:B.pointer(d.id,R.standHash(d)),data:{version:1,quellenHash:R.standHash(d),dokument:structuredClone(d)}});
  s.archive.push(archiv(d),archiv(anders));const p=O.plane(s,ziel);
  A.equal(p.neueArchive.length,46);A.equal(p.anzahl.vorarchive,19);
  A(!p.neueArchive.some(a=>a.data.dokument.id===d.id));
  A(p.neueArchive.some(a=>a.data.dokument.id===anders.id));
  for(const mutate of [
   x=>x.archive.shift(),x=>x.archive[0].data.dokument.source_id="fremd",
   x=>x.archive.at(-1).data.dokument.source_id="fremd",
   x=>x.archive.at(-1).data.dokument.id="rd-"+"f".repeat(64)
  ]){const clone=structuredClone(s);mutate(clone);A.throws(()=>O.plane(clone,ziel),/breg-fassung:/);}
 });
 await test("Unveraenderter Produktwrapper weist selbst konsistente synthetische Bestands-/Fassungspins ab",()=>{
  const {s}=synthetisch(),inhalt=JSON.stringify(s);
  A.throws(()=>O.pruefe({version:1,modus:"vorschau",inhalt,digest:require("crypto").createHash("sha256").update(inhalt).digest("hex"),
    gelesenAm:new Date().toISOString(),tag:new Date().toISOString().slice(0,10)}),/fester Originalbestand/);
 });
 if(!arg("--privat")){console.log(passed+" synthetische Gruppen PASS; private native Produktpin-Abnahme nicht ausgefuehrt.");return;}
 const dir=path.resolve(arg("--privat"));A(dir.startsWith("/workspace/helmut-reparatur-20261127-"));
 const kontroll=process.argv.includes("--kontrolle")?"-kontrolle":"";
 const a=original(path.join(dir,"breg-ops-vorwerte-1"+kontroll+"-original.json"));
 const b=original(path.join(dir,"breg-ops-vorwerte-2"+kontroll+"-original.json"));
 const c=original(path.join(dir,"breg-ops-vorwerte-3-original.json"));
 const erwarteteNeueArchive=a.roh.filter(r=>!b.archive.some(v=>v.id===B.pointer(r.id,R.standHash(r)))).length;
 const erwarteteArchiveDanach=b.archive.length+erwarteteNeueArchive;
 const container="helmut-monat-pr1359-20261126";
 const inspect=JSON.parse(execFileSync("docker",["inspect",container],{encoding:"utf8"}))[0];
 A.equal(inspect.HostConfig.NetworkMode,"none");A.match(inspect.Config.Image,/^postgres:17\.6-/);
 A(inspect.Mounts.some(m=>m.Destination==="/var/lib/postgresql/data" && m.Type==="volume"),
  "Bestehender isolierter lokaler PG-Datentraeger; keine fremden Pfade einbinden");
 const db="helmut_breg_operator_"+process.pid;
 const pgdir="/dev/shm/helmut-breg-pg-"+process.pid,port="55437";
 const cleanExec=(args)=>execFileSync("docker",["exec","-u","postgres",container,"env","-i",
  "PATH=/usr/lib/postgresql/17/bin:/usr/bin:/bin","LANG=C.UTF-8",...args],
  {encoding:"utf8",stdio:["pipe","pipe","pipe"]});
 const psql=(input,database=db)=>{
  try{return execFileSync("docker",["exec","-i",container,"psql","-h",pgdir,"-p",port,"-X","-q","-At","-U","postgres","-d",database,"-v","ON_ERROR_STOP=1"],
   {input,encoding:"utf8",maxBuffer:24*1024*1024,stdio:["pipe","pipe","pipe"]}).trim();}
  catch(e){throw Error(String(e.stderr||e.message).slice(0,1800));}
 };
 // Eigener kleiner PG-Prozess mit vorhandenen Binaries und leerer Umgebung.
 // Die gemeinsame Monatsuhr, Serverdaten und bestehenden Datenbanken bleiben
 // unangetastet. Eigener Unixsocket, kein TCP, keine Downloads.
 let gestartet=false;
 let receipt,prepared;
 try{
  cleanExec(["initdb","-D",pgdir,"--no-sync","--wal-segsize=1","-A","trust","--locale=C.UTF-8"]);
  cleanExec(["pg_ctl","-D",pgdir,"-l",pgdir+"/server.log","-o",
   "-F -c listen_addresses='' -k "+pgdir+" -p "+port+" -c shared_buffers=8MB -c max_connections=8 -c min_wal_size=2MB -c max_wal_size=16MB -c wal_level=minimal -c max_wal_senders=0","-w","start"]);
  gestartet=true;
  A.match(psql("show server_version;","postgres"),/^17\.6/);
  const pgJetzt=Date.parse(psql("select clock_timestamp();","postgres")),hostJetzt=Date.now();
  A(Math.abs(pgJetzt-hostJetzt)<10000,"Unverfaelschte Host-/PostgreSQLuhr");
  A.equal(new Date(pgJetzt).toISOString().slice(0,10),new Date(hostJetzt).toISOString().slice(0,10));
  console.log("UHR Host="+new Date(hostJetzt).toISOString()+" PostgreSQL="+new Date(pgJetzt).toISOString());
  psql("create role anon;create role authenticated;create role service_role;create database "+db+";","postgres");
  // Volle Originalquellzeilen und Finanzmetadaten bleiben nur im privaten lokalen
  // DBprozess; keine realen Profile, keine Anbieteraufrufe, kein Testpinersatz.
  const schema=(name,rows,extra={})=>{
   const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))];
   const type=k=>extra[k]||((k.endsWith("_at")||k==="lease_bis")?"timestamptz":
    rows.some(r=>r[k]!==null&&typeof r[k]==="object")?"jsonb":
    rows.some(r=>typeof r[k]==="number")?"numeric":rows.some(r=>typeof r[k]==="boolean")?"boolean":"text");
   psql("create table "+name+"("+keys.map(k=>'"'+k+'" '+type(k)).join(",")+");");
  };
  schema("raw_documents",a.roh);psql("alter table raw_documents add primary key(id);alter table raw_documents enable row level security;");
  schema("knowledge_objects",a.kos,{ko_version:"integer",source_document_count:"integer",verstehen_fencing:"bigint"});
  psql("alter table knowledge_objects add primary key(id);");
  schema("ko_document_links",a.kanten);psql("alter table ko_document_links add primary key(knowledge_object_id,raw_document_id);");
  schema("document_findings",b.fundstellen);
  schema("helmut_verstehen_reservierungen",[...c.cas,...c.aktive_cas],
   {fencing:"bigint",ergebnis_fencing:"bigint",ki_aufrufe:"integer",versuche:"integer"});
  psql("create table helmut_store(id text primary key,data jsonb not null,updated_at timestamptz default now());alter table helmut_store enable row level security;");
  psql(fs.readFileSync(path.join(__dirname,"../../supabase/migrations/20260808_scalable_job_queue.sql"),"utf8"));
  psql("alter table helmut_jobs add column wiedervorlagen int;alter table helmut_jobs add column quellen_prioritaet_tag date;");
  psql(`create table helmut_verstehen_vormerkungen(vorgang_id text primary key);
   create table llm_usage(id text primary key,created_at timestamptz,vorgang_id text,knowledge_object_id text);
   create table helmut_klassen_slots(id uuid primary key,belegt_bis timestamptz);
   create table pipeline_locks(job_name text primary key,expires_at timestamptz);
   create table llm_reservations(result_key text primary key,day text,status text,expires_at timestamptz);
   create table llm_budget_counters(day text,scope text,used int,updated_at timestamptz);
   create table helmut_anbieter_fenster(schluessel text,fensterart text,fenster_start timestamptz,verbraucht bigint);`);
  psql(fs.readFileSync(path.join(__dirname,"../../supabase/migrations/20261127131039_ko_quellenfassungen.sql"),"utf8"));
  const rows=(table,rs)=>{if(rs?.length)psql("insert into "+table+" select * from jsonb_populate_recordset(null::"+table+","+j(rs)+");");};
  const setup=()=>{
   psql("truncate raw_documents,knowledge_objects,ko_document_links,document_findings,helmut_store,helmut_ko_quellenfassungen,helmut_verstehen_reservierungen,helmut_verstehen_vormerkungen,llm_usage,helmut_jobs,helmut_klassen_slots,pipeline_locks,llm_reservations,llm_budget_counters,helmut_anbieter_fenster cascade;");
   rows("raw_documents",a.roh);rows("knowledge_objects",a.kos);rows("ko_document_links",a.kanten);rows("document_findings",b.fundstellen);
   rows("helmut_verstehen_reservierungen",[...c.cas,...c.aktive_cas]);
   rows("helmut_jobs",[...new Map([...(c.ziel_jobs||[]),...(c.diagnose_job||[])].map(r=>[r.id,r])).values()]);
   rows("llm_budget_counters",c.aufrufzaehler);
   // Auth huelle ist vollsynthetisch; nur das private Finanzbuch ist echt.
   rows("helmut_store",[{id:"main-auth",data:{betriebskostenBudget:c.kostenbuch},updated_at:"2026-11-27T13:42:54Z"},
    ...b.archive.map(v=>({...v,updated_at:"2026-11-27T13:41:30Z"})),
    ...c.journale.map(v=>({...v,updated_at:"2026-11-27T13:42:54Z"}))]);
  };
  const sql=fs.readFileSync(path.join(__dirname,"quellen-breg-fassung-20261127.sql"),"utf8");
  const run=(modus,bindung={},go={})=>{
   const input=Object.entries({modus,bindung:JSON.stringify(bindung),go:JSON.stringify(go)})
     .map(([k,v])=>"\\set "+k+" '"+v.replaceAll("\\","\\\\").replaceAll("'","\\'")+"'").join("\n")+"\n"+sql;
   return JSON.parse(psql(input).split("\n").at(-1));
  };
  const go=(aktion,digest)=>{const now=new Date().toISOString();return {approved:true,scope:"BREG-BESTANDSFASSUNG-20261127",
   aktion,digest,tag:now.slice(0,10),approvedAt:now,codeCommit:"d".repeat(40),migrationSHA256:B.digest(["native lokale Migration"]),
   policyHash:O.ZIEL.policyHash,plattformen:["hetzner","vercel"].map(name=>({name,checkedAt:now,commit:"d".repeat(40),
    evidenceSHA256:B.digest(["synthetischer isolierter Plattformbeleg",name]),httpStatus:200,policyHash:O.ZIEL.policyHash,
    migration:true,migrationSHA256:B.digest(["native lokale Migration"]),dailyUsd:1,totalUsd:30,calls:100,originals:16}))};};
  let letzteVorschau;
  const rueck=r=>({version:1,id:r.id,receiptSHA256:B.digest(r)});
  const before=()=>{const v=run("vorschau");letzteVorschau=v;try{return O.pruefe(v);}catch(e){
   fs.writeFileSync(path.join(dir,"breg-ops-fehler-vorschau-private.json"),JSON.stringify(v),{mode:0o600});throw e;}};
  setup();
  if(kontroll)await test("Privat/native: Append18/106 mit unveraenderten Produktpins ergibt46+61+1 und behaelt Nachtraege im Rueckweg",()=>{
   A.equal(b.archive.length,18);A.equal(b.fundstellen.length,106);
   const p=before(),r=run("freigeben",p,go("freigeben",p.digest));
   A.equal(r.plan.neueArchive.length,46);A.equal(r.bindungen.length,61);
   A.deepEqual(r.plan.anzahl,{vorarchive:18,neueArchive:46,findings:106,bindungen:61,promotionen:1});
   A.equal(r.plan.neueArchive.some(a=>a.data.quellenHash==="14169d3ce9c7ead7fceec7200bd988391f4ea4cf390ff23c5caaf7a217d923fd"),false);
   A.equal(psql("select count(*) from helmut_store where id like '%-rohstand-%';"),"64");
   for(const [name,value] of [["vorschau",letzteVorschau],["vorbereitet",p],["quittung",r]])
    fs.writeFileSync(path.join(dir,"breg-ops-append-"+name+"-private.json"),JSON.stringify(value),{mode:0o600});
   run("rueckweg",rueck(r),go("rueckweg",r.nachDigest));
   A.equal(psql("select count(*) from helmut_store where id like '%-rohstand-%';"),"64");
   A.equal(psql("select count(*) from document_findings;"),"106");
  });
  if(kontroll)await test("Privat/native: Append weitere volle Nachtraege gebunden; andere Fassung unverlinkt;45+61+1 und alle65 Archive im Rueckweg",()=>{
   setup();const initial=before(),v=JSON.parse(letzteVorschau.inhalt);
   const missing=O.plane(v,{...O.ZIEL,rawIds:v.roh.map(r=>r.id).sort()}).neueArchive;
   const canon=missing[0],other={...missing[1].data.dokument,title:"Synthetischer weiterer amtlicher Archivstand"};
   const historical={id:B.pointer(other.id,R.standHash(other)),data:{version:1,quellenHash:R.standHash(other),dokument:other}};
   rows("helmut_store",[{...canon,updated_at:new Date().toISOString()},{...historical,updated_at:new Date().toISOString()}]);
   const finding={...b.fundstellen[0],raw_document_id:other.id,source_id:"synthetischer-regulaerer-nachtrag",
    original_url:other.url,retrieval_path_id:"rp-synthetischer-nachtrag",found_at:new Date().toISOString(),created_at:new Date().toISOString()};
   rows("document_findings",[finding]);
   A.throws(()=>run("freigeben",initial,go("freigeben",initial.digest)),/Vorwert/);
   const p=before(),r=run("freigeben",p,go("freigeben",p.digest));
   A.deepEqual(r.plan.anzahl,{vorarchive:20,neueArchive:45,findings:107,bindungen:61,promotionen:1});
   A(!r.plan.bindungen.some(l=>l.raw_source_version_id===historical.id));
   A(r.plan.neueArchive.some(a=>a.data.dokument.id===other.id));
   A.equal(psql("select count(*) from helmut_store where id like '%-rohstand-%';"),"65");
   run("rueckweg",rueck(r),go("rueckweg",r.nachDigest));
   A.equal(psql("select count(*) from helmut_store where id like '%-rohstand-%';"),"65");
   A.equal(psql("select count(*) from document_findings;"),"107");
  });
  if(kontroll)await test("Privat/native: Append Altanker Mutation/Loeschung, fremde Raw/Kante/Autoritaet und Nachlaufdrift STOP",()=>{
   const ankerArchiv=b.archive.find(a=>O.ZIEL.anker.archive.includes(B.digest(a)));
   const ankerFinding=b.fundstellen.find(f=>O.ZIEL.anker.findings.includes(B.digest(f)));
   for(const change of [
    "delete from helmut_store where id="+lit(ankerArchiv.id),
    "update helmut_store set data=jsonb_set(data,'{dokument,title}',to_jsonb('drift'::text)) where id="+lit(ankerArchiv.id),
    "delete from document_findings where to_jsonb(document_findings)="+j(ankerFinding),
    "update document_findings set source_id='fremd' where to_jsonb(document_findings)="+j(ankerFinding),
    "update raw_documents set source_id='fremd' where id="+lit(O.ZIEL.raw),
    "insert into ko_document_links(knowledge_object_id,raw_document_id) values("+lit(O.ZIEL.kos[1])+","+lit(a.roh.find(r=>r.id!==O.ZIEL.raw).id)+")"
   ]){setup();psql(change);A.throws(()=>before(),/breg-fassung:/);
    A.equal(psql("select count(*) from helmut_ko_quellenfassungen;"),"0");}
   for(const kind of ["authority","foreign-raw","schema"]){
    setup();before();const v=JSON.parse(letzteVorschau.inhalt);
    const source=structuredClone(O.plane(v,{...O.ZIEL,rawIds:v.roh.map(r=>r.id).sort()}).neueArchive[0]);
    if(kind==="authority")source.data.dokument.source_id="fremde-Autoritaet";
    if(kind==="foreign-raw")source.data.dokument.id="rd-"+"f".repeat(64);
    if(kind==="schema")source.data.fremdesFeld=true;
    rows("helmut_store",[{...source,updated_at:new Date().toISOString()}]);
    A.throws(()=>before(),/breg-fassung:|ko-quellenfassung-/);
   }
   setup();const p=before(),r=run("freigeben",p,go("freigeben",p.digest));
   psql("update document_findings set found_at=now() where to_jsonb(document_findings)="+j(ankerFinding));
   A.throws(()=>run("rueckweg",rueck(r),go("rueckweg",r.nachDigest)),/Quittung/);
   A.equal(psql("select count(*) from helmut_ko_quellenfassungen;"),"61");
  });
  await test("Privat/native: unveraenderte echte60IDs/add680/0968/2KOs/Archiv-/Finding-Anker und7 Alt-CAS bestehen",()=>{
   prepared=before();A.match(prepared.planDigest,/^[a-f0-9]{64}$/);
   A.equal(B.digest(JSON.parse(letzteVorschau.inhalt).sicherung.aktiveCas),O.ZIEL.alteCasHash);
  });
  await test("Privat/native: fehlendes/falsches GO, veralteter Vorwert und falscher Plattformtag stoppen atomar",()=>{
   const bound=psql("select data->'betriebskostenBudget'->>'bound' from helmut_store where id='main-auth';");
   A.throws(()=>run("freigeben",prepared),/GO/);
   const g=go("freigeben",prepared.digest);g.plattformen[0].originals=17;
   A.throws(()=>run("freigeben",prepared,g),/Plattformvorflug/);
   A.throws(()=>run("freigeben",{...prepared,gelesenAm:"2026-01-01T00:00:00Z"},go("freigeben",prepared.digest)),/Vorwert/);
   const wrong=go("freigeben",prepared.digest);wrong.tag="2026-01-01";
   A.throws(()=>run("freigeben",prepared,wrong),/GO/);
   A.equal(psql("select count(*) from helmut_ko_quellenfassungen;"),"0");
   A.equal(psql("select data->'betriebskostenBudget'->>'bound' from helmut_store where id='main-auth';"),bound);
  });
  await test("Privat/native: Raw-/Archiv-/CAS-Drift, aktive Lease und Finanzdrift stoppen ohne Teilwrites",()=>{
   const oldArchive=b.archive[0];
   for(const change of [
    "update raw_documents set title=title||' drift' where id="+lit(O.ZIEL.raw),
    "update helmut_store set data=jsonb_set(data,'{dokument,source_id}',to_jsonb('fremd'::text)) where id="+lit(oldArchive.id),
    "update helmut_verstehen_reservierungen set lease_bis=now()+interval '1 minute' where vorgang_id="+lit(c.aktive_cas[0].vorgang_id),
    "update helmut_verstehen_reservierungen set besitzer=null where vorgang_id="+lit(c.aktive_cas[0].vorgang_id),
    "update helmut_store set data=jsonb_set(data,'{betriebskostenBudget,bound}','0'::jsonb) where id='main-auth'"
   ]){setup();const p=before();psql(change);A.throws(()=>run("freigeben",p,go("freigeben",p.digest)),/breg-fassung:/);
    A.equal(psql("select count(*) from helmut_ko_quellenfassungen;"),"0");A.equal(psql("select count(*) from helmut_store where id like '%-rohstand-%';"),String(b.archive.length));}
  });
  setup();prepared=before();
  await test("Privat/native: nur fehlende Archive+61+1 atomar, bitgleiches Finanzbuch/Alt-CAS/Journale; Altleser bleiben exakt",()=>{
   const old=JSON.parse(letzteVorschau.inhalt);receipt=run("freigeben",prepared,go("freigeben",prepared.digest));
   A.equal(receipt.modus,"aktiviert");A.equal(receipt.bindungen.length,61);
   for(const [name,value] of [["vorschau",letzteVorschau],["vorbereitet",prepared],["quittung",receipt]])
    fs.writeFileSync(path.join(dir,"breg-ops-native-"+name+"-private.json"),JSON.stringify(value),{mode:0o600});
   console.log("PARAMETER "+JSON.stringify({vorschau:Buffer.byteLength(JSON.stringify(letzteVorschau)),
    aktivierung:Buffer.byteLength(JSON.stringify(prepared)),rueckweg:Buffer.byteLength(JSON.stringify(rueck(receipt))),
    go:Buffer.byteLength(JSON.stringify(go("freigeben",prepared.digest))),sql:Buffer.byteLength(sql),
    quittung:Buffer.byteLength(JSON.stringify(receipt))}));
   A.equal(psql("select count(*) from helmut_store where id like '%-rohstand-%';"),String(erwarteteArchiveDanach));
   A.equal(psql("select count(*) from helmut_ko_quellenfassungen;"),"61");
   A.equal(psql("select bool_and(vollstaendig) from helmut_ko_quellenmanifeste;"),"t");
   A.equal(psql("select count(*) from helmut_ko_quellen q where (select x.title from public.raw_documents(q) x)=(q.source_archive->'dokument'->>'title');"),"61");
   A.equal(B.digest(JSON.parse(psql("select data->'betriebskostenBudget' from helmut_store where id='main-auth'"))),B.digest(c.kostenbuch));
   A.equal(psql("select source_id from raw_documents where id="+lit(O.ZIEL.raw)),"bundesregierung");
   A.throws(()=>run("freigeben",prepared,go("freigeben",prepared.digest)),/breg-fassung:/);
   A.equal(old.archive.length,b.archive.length);
  });
  await test("Privat/native: Rueckweg vor Konsum,alle Archive und verbrauchtes Einmalrecht bleiben",()=>{
   const r=run("rueckweg",rueck(receipt),go("rueckweg",receipt.nachDigest));A.equal(r.modus,"zurueckgenommen");
   A.equal(psql("select count(*) from helmut_ko_quellenfassungen;"),"0");
   A.equal(psql("select count(*) from helmut_store where id like '%-rohstand-%';"),String(erwarteteArchiveDanach));
   A.equal(psql("select count(*) from helmut_store where id like 'main-operator-breg-fassung-20261127%';"),"2");
   A.equal(psql("select source_id from raw_documents where id="+lit(O.ZIEL.raw)),a.roh.find(r=>r.id===O.ZIEL.raw).source_id);
   A.throws(()=>run("rueckweg",rueck(receipt),go("rueckweg",receipt.nachDigest)),/breg-fassung:/);
   A.throws(()=>before(),/Einmalrecht/);
  });
  await test("Privat/native: nach Claim, neuer Usage, KO-Version, Archivdrift oder gefaelschter Quittung kein Rueckweg",()=>{
   for(const change of [
    "update helmut_verstehen_reservierungen set versuche=versuche+1 where vorgang_id="+lit(c.cas[0].vorgang_id),
    "insert into llm_usage(id,vorgang_id) values('native-neuer-konsum','vg-neu')",
    "update knowledge_objects set ko_version=2 where id="+lit(O.ZIEL.kos[0]),
    "update helmut_store set data=jsonb_set(data,'{dokument,summary}',to_jsonb('drift'::text)) where id="+lit(b.archive[0].id)
   ]){setup();const p=before(),r=run("freigeben",p,go("freigeben",p.digest));psql(change);
    A.throws(()=>run("rueckweg",rueck(r),go("rueckweg",r.nachDigest)),/breg-fassung:/);
    A.equal(psql("select count(*) from helmut_ko_quellenfassungen;"),"61");}
   setup();const p=before(),r=run("freigeben",p,go("freigeben",p.digest));
   A.throws(()=>run("rueckweg",{...rueck(r),receiptSHA256:"0".repeat(64)},go("rueckweg","0".repeat(64))),/Quittung/);
  });
  await test("Privat/native: Ergaenzung Owner/RLS, echte Quotenzaehler, aktive Joblease und JS-Fuenfminutengrenze",()=>{
   setup();let p=before();
   A.throws(()=>O.pruefe(letzteVorschau,{jetztMs:Date.parse(p.gelesenAm)+300001}),/Fuenfminuten/);
   psql("alter table raw_documents owner to service_role;");
   try{A.throws(()=>run("freigeben",p,go("freigeben",p.digest)),/Owner\/RLS/);}
   finally{psql("alter table raw_documents owner to postgres;");}
   for(const change of [
    "update llm_budget_counters set used=101 where scope='global'",
    "insert into helmut_anbieter_fenster values('quellenarbeit|originalabrufe','tag',current_date,17)",
    "update helmut_jobs set status='laeuft',lease_owner='synthetischer-neuer-owner',lease_expires_at=now()+interval '1 minute' where id="+lit(c.diagnose_job[0].id)
   ]){setup();p=before();psql(change);A.throws(()=>run("freigeben",p,go("freigeben",p.digest)),/breg-fassung:/);
    A.equal(psql("select count(*) from helmut_ko_quellenfassungen;"),"0");
    A.equal(psql("select count(*) from helmut_store where id like '%-rohstand-%';"),String(b.archive.length));}
  });
 }finally{
  if(gestartet)cleanExec(["pg_ctl","-D",pgdir,"-m","fast","-w","stop"]);
  // Ausschliesslich der hier erzeugte, PID-gebundene Clusterpfad.
  cleanExec(["rm","-rf","--",pgdir]);
 }
 console.log(passed+" Gruppen PASS; native Plattformbelege ausschliesslich synthetische lokale GO-Fixture, KEIN Production-GO.");
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

