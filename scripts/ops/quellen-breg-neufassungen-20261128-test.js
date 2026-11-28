"use strict";
// Nur neuer28er Operator. Keine Production-, Quellen- oder Modellaufrufe.
// node scripts/lokal.js scripts/ops/quellen-breg-neufassungen-20261128-test.js
// Optional --privat DIR: unveraenderte02/05-Originale, eigener PG17.6-Prozess im vorhandenen Netzwerk-none-Container.
// --nur-snapshot-race fuehrt ausschliesslich die neue Drei-Verbindungs-Gruppe aus.
const A=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {execFileSync,spawn}=require("node:child_process");
const O=require("./quellen-breg-neufassungen-20261128");
const B=require("../../lib/helmut/ko-quellenfassung"),R=require("../../lib/helmut/roh-quellenstaende");
const arg=k=>process.argv.includes(k)?process.argv[process.argv.indexOf(k)+1]:null;
const lit=x=>"'"+String(x).replaceAll("'","''")+"'";
const j=x=>lit(JSON.stringify(x))+"::jsonb";
const key="main-operator-breg-neufassungen-20261128";
let passed=0,nativeSeen=0;
const snapshotOnly=process.argv.includes("--nur-snapshot-race");
if(snapshotOnly)A(arg("--privat"),"Snapshot-Race verlangt die privaten Originaleingaben");
if(process.argv.includes("--nach-vorflug"))A(process.argv.includes("--nur-nativ"),"Fortsetzung verlangt --nur-nativ");
const test=async(name,fn)=>{if(snapshotOnly&&!name.includes("Snapshot-Race"))return;
 if(process.argv.includes("--nur-nativ")&&!name.startsWith("Privat/native:"))return;
 if(name.startsWith("Privat/native:")&&++nativeSeen<=2&&process.argv.includes("--nach-vorflug")&&!snapshotOnly)return;
 await fn();console.log("PASS "+(++passed)+" "+name);};
function synthetisch(){
 const roh=Array.from({length:110},(_,i)=>({id:"rd-"+B.digest(["synthetischer28er Bestand",i]),
  title:"Synthetische Bestandsquelle "+i,summary:"Synthetischer amtlicher Auszug "+i,
  url:"https://example.invalid/"+i,canonical_url:"https://example.invalid/"+i,
  source_id:"synthetisch",source_name:"Synthetisches Amt",source_type:"ministry",link_type:"direct",
  published_at:"2026-04-17T07:00:00+00:00",retrieved_at:"2026-08-20T04:01:43.145+00:00",
  created_at:"2026-07-27T16:01:57.064+00:00",content_fingerprint:"alte-synthetische-kennung",
  raw:{retrievalPathId:"rp-synthetisch"}})).sort((a,b)=>a.id<b.id?-1:1);
 for(let i=0;i<2;i++){
  roh[i].url="https://www.bundesregierung.de/breg-de/aktuelles/synthetisch-"+i;
  roh[i].canonical_url=roh[i].url.replace("www.","");
 }
 const archiv=d=>({id:B.pointer(d.id,R.standHash(d)),data:{version:1,quellenHash:R.standHash(d),dokument:structuredClone(d)}});
 const archive=roh.slice(0,7).map(archiv),ziele=[];
 for(let i=0;i<2;i++){
  const neu={...roh[i],title:"Synthetische neue amtliche Fassung "+i,summary:"Gespeicherter synthetischer neuer RSS-Auszug "+i,
   published_at:"2026-11-27T13:51:00.000Z",retrieved_at:"2026-11-28T00:01:25.903Z",
   source_id:"bundesregierung",source_name:"Bundesregierung",raw:{retrievalPathId:"rp-bundesregierung"}};
  archive.push(archiv(neu));ziele.push({raw:roh[i].id,alt:R.standHash(roh[i]),neu:R.standHash(neu),
   url:roh[i].url,canonical:roh[i].canonical_url,titel:neu.title,publikation:neu.published_at});
 }
 for(let i=7;i<17;i++)archive.push(archiv({...roh[i],title:"Synthetischer historischer Stand "+i}));
 const counts=[13,20,60,13,11,10,17,11],statuses=["complete","complete","failed","pending","pending","pending","complete","pending"];
 const kos=counts.map((n,i)=>({id:"ko-synthetisch-"+i,ko_version:i?1:5,understanding_status:statuses[i],
  verstehen_fencing:i===0?5:statuses[i]==="complete"?1:null,source_document_count:[1,6].includes(i)?1:n}));
 let offset=0;const kanten=[];
 for(const [i,n] of counts.entries())for(let z=0;z<n;z++)
  kanten.push({knowledge_object_id:kos[i].id,raw_document_id:roh[1+offset++%109].id,created_at:"2026-08-20T00:00:00+00:00"});
 const s={roh,kos,kanten,zielKanten:kanten.filter(l=>ziele.some(z=>z.raw===l.raw_document_id)),archive,findings:[],bindungen:[]};
 return {s,ziel:{ziele,kos:kos.map(k=>k.id),koStaende:kos.map((k,i)=>({id:k.id,version:k.ko_version,
  status:k.understanding_status,fencing:k.verstehen_fencing,kanten:counts[i]})),rawIds:roh.map(r=>r.id),maxNeueArchive:103,
  anker:{archive:archive.map(B.digest)},bestand:{findings:B.digest([])}}};
}
function original(file){
 const x=JSON.parse(fs.readFileSync(file,"utf8")),o=x.result||x,t=JSON.parse(o.content[0].text).result;
 const m=/<untrusted-data-[^>]+>\n([\s\S]*?)\n<\/untrusted-data-/.exec(t);A(m,"Unveraenderte private Originalhuelle");
 return JSON.parse(m[1])[0];
}
(async()=>{
 A.equal(process.env.HELMUT_LOKALER_SCHUTZ,"aktiv");
 await test("Synthetisch:110 Raw/8 erhaltene Versionen/155 Bindungen/103 Archive/2 Promotionen",()=>{
  const {s,ziel}=synthetisch(),vor=structuredClone(s),p=O.plane(s,ziel);
  A.deepEqual(s,vor);A.equal(p.neueArchive.length,103);A.equal(p.bindungen.length,155);A.equal(p.promotionen.length,2);
  A.equal(new Set(p.bindungen.map(l=>l.knowledge_object_id)).size,8);
  for(const k of s.kos)A(p.bindungen.filter(l=>l.knowledge_object_id===k.id).every(l=>l.ko_version===k.ko_version));
  for(const pr of p.promotionen){A.equal(pr.nach.created_at,pr.alt.created_at);A.equal(pr.nach.content_fingerprint,null);}
  A.equal(s.kos[1].source_document_count,1);A.equal(p.bindungen.filter(l=>l.knowledge_object_id===s.kos[1].id).length,20);
  A.equal(s.zielKanten.some(l=>l.raw_document_id===ziel.ziele[0].raw),false,"Standalone-Zuckerziel im Rawbestand");
 });
 await test("Synthetisch: Raw/KO/Version/Status/Kante/Vorbindung/Quellfassung-Drift stoppt",()=>{
  for(const mutate of [s=>s.roh[0].title="drift",s=>s.kos[0].ko_version++,s=>s.kos[2].understanding_status="complete",
   s=>s.kanten.pop(),s=>s.zielKanten.push({...s.kanten[0],knowledge_object_id:"fremd"}),
   s=>s.bindungen.push({knowledge_object_id:"vorbindung"}),s=>s.archive[7].data.dokument.source_id="fremd"]){
   const {s,ziel}=synthetisch();mutate(s);A.throws(()=>O.plane(s,ziel),/breg-neufassungen:/);
  }
 });
 await test("Synthetisch: Archiv-Superset erhaelt Anker; fehlende/veraenderte Archive und Findings STOP",()=>{
  const {s,ziel}=synthetisch(),d=s.roh[17],data={version:1,quellenHash:R.standHash(d),dokument:structuredClone(d)};
  s.archive.push({id:B.pointer(d.id,data.quellenHash),data});A.equal(O.plane(s,ziel).neueArchive.length,102);
  for(const mutate of [x=>x.archive.shift(),x=>x.archive.at(-1).data.dokument.source_id="fremd",
   x=>x.archive.at(-1).data.dokument.id="rd-"+"f".repeat(64),x=>x.findings.push({raw_document_id:d.id})]){
   const clone=structuredClone(s);mutate(clone);A.throws(()=>O.plane(clone,ziel),/breg-neufassungen:/);
  }
 });
 await test("Synthetisch: Produktwrapper lehnt erfundene konsistente Produktpins ab",()=>{
  const {s}=synthetisch(),inhalt=JSON.stringify(s),jetzt=new Date().toISOString();
  A.throws(()=>O.pruefe({version:1,modus:"vorschau",inhalt,digest:require("node:crypto").createHash("sha256").update(inhalt).digest("hex"),
   gelesenAm:jetzt,tag:jetzt.slice(0,10)}),/fester Originalbestand/);
 });
 if(!arg("--privat")){A(!snapshotOnly,"Snapshot-Race verlangt --privat mit unveraenderten Originalen");
  console.log(passed+" synthetische Gruppen PASS;11 private native Gruppen not_run.");return;}
 const dir=path.resolve(arg("--privat"));A(dir.startsWith("/workspace/helmut-reparatur-20261127-"));
 const a=original(path.join(dir,"02-breg-vorbestand-original.json"));
 const b=original(path.join(dir,"05-breg-vorbestand-ergaenzung-original.json"));
 const erwarteteNeueArchive=103,erwarteteArchiveDanach=122;
 const container="helmut-monat-pr1359-20261126";
 const inspect=JSON.parse(execFileSync("docker",["inspect",container],{encoding:"utf8"}))[0];
 A.equal(inspect.HostConfig.NetworkMode,"none");A.match(inspect.Config.Image,/^postgres:17\.6-/);
 A(inspect.Mounts.some(m=>m.Destination==="/var/lib/postgresql/data"&&m.Type==="volume"),"Vorhandener isolierter Datentraeger");
 const db="helmut_breg28_operator_"+process.pid,pgdir="/dev/shm/helmut-breg28-pg-"+process.pid,port="55438";
 const cleanExec=args=>execFileSync("docker",["exec","-u","postgres",container,"env","-i",
  "PATH=/usr/lib/postgresql/17/bin:/usr/bin:/bin","LANG=C.UTF-8",...args],{encoding:"utf8",stdio:["pipe","pipe","pipe"]});
 const psql=(input,database=db)=>{
  try{return execFileSync("docker",["exec","-i",container,"env","-i","PATH=/usr/lib/postgresql/17/bin:/usr/bin:/bin","LANG=C.UTF-8",
   "psql","-h",pgdir,"-p",port,"-X","-q","-At","-U","postgres","-d",database,"-v","ON_ERROR_STOP=1"],
   {input,encoding:"utf8",maxBuffer:24*1024*1024,stdio:["pipe","pipe","pipe"]}).trim();}
  catch(e){throw Error(String(e.stderr||e.message).slice(0,1800));}
 };
 let gestartet=false,letzteVorschau;
 try{
  cleanExec(["initdb","-D",pgdir,"--no-sync","--wal-segsize=1","-A","trust","--locale=C.UTF-8"]);
  cleanExec(["pg_ctl","-D",pgdir,"-l",pgdir+"/server.log","-o","-F -c listen_addresses='' -k "+pgdir+" -p "+port
   +" -c shared_buffers=8MB -c max_connections=8 -c min_wal_size=2MB -c max_wal_size=16MB -c wal_level=minimal -c max_wal_senders=0","-w","start"]);
  gestartet=true;A.match(psql("show server_version;","postgres"),/^17\.6/);
  const pgJetzt=Date.parse(psql("select clock_timestamp();","postgres")),hostJetzt=Date.now();
  A(Math.abs(pgJetzt-hostJetzt)<10000,"Unverfaelschte Host-/PostgreSQLuhr");
  A.equal(new Date(pgJetzt).toISOString().slice(0,10),new Date(hostJetzt).toISOString().slice(0,10));
  psql("create role anon;create role authenticated;create role service_role;create database "+db+";","postgres");
  const schema=(name,rows,extra={})=>{
   const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))];
   const type=k=>extra[k]||((k.endsWith("_at")||k==="lease_bis")?"timestamptz":
    rows.some(r=>r[k]!==null&&typeof r[k]==="object")?"jsonb":rows.some(r=>typeof r[k]==="number")?"numeric":
    rows.some(r=>typeof r[k]==="boolean")?"boolean":"text");
   psql("create table "+name+"("+keys.map(k=>'"'+k+'" '+type(k)).join(",")+");");
  };
  schema("raw_documents",a.roh);psql("alter table raw_documents add primary key(id);alter table raw_documents enable row level security;");
  schema("knowledge_objects",a.kos,{ko_version:"integer",source_document_count:"integer",verstehen_fencing:"bigint"});
  psql("alter table knowledge_objects add primary key(id);");
  schema("ko_document_links",a.kanten);psql("alter table ko_document_links add primary key(knowledge_object_id,raw_document_id);");
  schema("document_findings",b.findings);
  schema("helmut_verstehen_reservierungen",b.aktivecas,{fencing:"bigint",ergebnis_fencing:"bigint",ki_aufrufe:"integer",versuche:"integer"});
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
   rows("raw_documents",a.roh);rows("knowledge_objects",a.kos);rows("ko_document_links",a.kanten);rows("document_findings",b.findings);
   rows("helmut_verstehen_reservierungen",b.aktivecas);rows("helmut_jobs",a.ziel_jobs);
   // Isolierte synthetische Huellen/Quoten; volle private Geldbuchzeilen bleiben unveraendert.
   const tag=new Date().toISOString().slice(0,10);
   rows("llm_budget_counters",[{day:tag,scope:"global",used:0,updated_at:"2026-11-28T13:35:51Z"}]);
   rows("helmut_anbieter_fenster",[{schluessel:"quellenarbeit|originalabrufe",fensterart:"tag",fenster_start:tag+"T00:00:00Z",verbraucht:0}]);
   rows("helmut_store",[{id:"main-auth",data:{betriebskostenBudget:b.kostenbuch},updated_at:"2026-11-28T13:35:51Z"},
    ...b.archive.map(v=>({...v,updated_at:"2026-11-28T13:35:51Z"})),
    {id:"main-operator-breg-fassung-20261127",data:{hinweis:"Synthetische alte verbrauchte Einmalquittung"},updated_at:"2026-11-27T13:42:54Z"}]);
  };
  const sql=fs.readFileSync(path.join(__dirname,"quellen-breg-neufassungen-20261128.sql"),"utf8");
  const operatorInput=(modus,bindung={},go={},quelle=sql)=>Object.entries({modus,bindung:JSON.stringify(bindung),go:JSON.stringify(go)})
   .map(([k,v])=>"\\set "+k+" '"+v.replaceAll("\\","\\\\").replaceAll("'","\\'")+"'").join("\n")+"\n"+quelle;
  const run=(modus,bindung={},go={})=>JSON.parse(psql(operatorInput(modus,bindung,go)).split("\n").at(-1));
  const go=(aktion,digest)=>{const now=new Date().toISOString();return {approved:true,scope:"BREG-NEUFASSUNGEN-20261128",einmalKey:key,
   aktion,digest,tag:now.slice(0,10),approvedAt:now,codeCommit:"d".repeat(40),migrationSHA256:B.digest(["native lokale Migration"]),
   policyHash:O.ZIEL.policyHash,plattformen:["hetzner","vercel"].map(name=>({name,checkedAt:now,commit:"d".repeat(40),
    evidenceSHA256:B.digest(["synthetischer isolierter Plattformbeleg",name]),httpStatus:200,policyHash:O.ZIEL.policyHash,
    // Unterschiedliche Appwerte sind keine100/0-Workerfreigabe und kein Runtimebeleg.
    migration:true,migrationSHA256:B.digest(["native lokale Migration"]),dailyUsd:1,totalUsd:30,
    calls:name==="hetzner"?100:2416,reserve:name==="hetzner"?0:702,originals:16}))};};
  const rueck=r=>({version:1,id:r.id,receiptSHA256:B.digest(r)});
  const before=()=>{const v=run("vorschau");letzteVorschau=v;try{return O.pruefe(v);}catch(e){
   fs.writeFileSync(path.join(dir,"breg28-fehler-vorschau-private.json"),JSON.stringify(v),{mode:0o600});throw e;}};
  const assertKeineBindings=()=>A.equal(psql("select count(*) from helmut_ko_quellenfassungen;"),"0");
  const aktuelleRaw=()=>JSON.parse(psql("select jsonb_agg(to_jsonb(r) order by id) from raw_documents r;"));
  let prepared,receipt,vor;
  setup();
  await test("Privat/native: volle Originalpins110/8/155/19/130, sechs Alt-CAS und sieben Geldbindungen",()=>{
   prepared=before();A.match(prepared.planDigest,/^[a-f0-9]{64}$/);vor=JSON.parse(letzteVorschau.inhalt);
   A.equal(vor.sicherung.aktiveCas.length,6);A.equal(B.digest(vor.sicherung.aktiveCas),O.ZIEL.alteCasHash);
   A.equal(B.digest(vor.sicherung.kostenBuch),O.ZIEL.kostenBuchHash);
   A.equal(Object.values(b.kostenbuch.calls).filter(c=>["reserviert","ungeklaert"].includes(c.status)).length,7);
   A.equal(vor.roh.length,110);A.equal(vor.kos.length,8);A.equal(vor.kanten.length,155);
  });
  await test("Privat/native: neues konkretes GO, frische Uhr, Plattform/GIZ/Code/Einmalkey/1/30/100/16 zwingend",()=>{
   A.throws(()=>run("freigeben",prepared),/GO/);
   for(const mutate of [g=>g.scope="BREG-BESTANDSFASSUNG-20261127",g=>delete g.einmalKey,g=>g.einmalKey+="-alt",
    g=>g.tag="2026-01-01",g=>g.approvedAt="2026-01-01T00:00:00Z",g=>g.plattformen[0].originals=17,
    g=>g.plattformen[0].commit="a".repeat(40),g=>g.plattformen[0].policyHash="a".repeat(64),g=>g.plattformen[0].httpStatus=503,
    g=>g.plattformen[0].migration=false,g=>g.plattformen[0].dailyUsd=2,
    g=>g.plattformen[0].calls=101,g=>g.plattformen[0].reserve=1,g=>delete g.plattformen[0].reserve,
    g=>g.plattformen[0].name="vercel",g=>g.plattformen.pop()]){
    const g=go("freigeben",prepared.digest);mutate(g);A.throws(()=>run("freigeben",prepared,g),/breg-neufassungen:/);
   }
   A.throws(()=>run("freigeben",{...prepared,gelesenAm:"2026-01-01T00:00:00Z"},go("freigeben",prepared.digest)),/Vorwert/);
   A.throws(()=>run("freigeben",{...prepared,planDigest:"0".repeat(64)},go("freigeben",prepared.digest)),/Plan/);assertKeineBindings();
  });
  await test("Privat/native: Raw/KO/Version/Findings/Kanten-Vorwert und vorhandene Bindung STOP ohne Teilwrites",()=>{
   const finding=b.findings[0];
   for(const change of ["update raw_documents set title=title||' drift' where id="+lit(O.ZIEL.ziele[0].raw),
    "update knowledge_objects set source_document_count=999 where id="+lit(O.ZIEL.kos[0]),
    "update knowledge_objects set understanding_status='complete' where understanding_status='failed'",
    "delete from ko_document_links where to_jsonb(ko_document_links)="+j(a.kanten[0]),
    "update document_findings set source_id='fremd' where to_jsonb(document_findings)="+j(finding)]){
    setup();const p=before();psql(change);A.throws(()=>run("freigeben",p,go("freigeben",p.digest)),/breg-neufassungen:/);assertKeineBindings();
   }
   setup();before();const s=JSON.parse(letzteVorschau.inhalt),p=O.plane(s,{...O.ZIEL,rawIds:s.roh.map(r=>r.id).sort()});
   const bind=p.bindungen.find(l=>b.archive.some(a=>a.id===l.raw_source_version_id));A(bind,"Vorhandenes zu verlinkendes Archiv");
   rows("helmut_ko_quellenfassungen",[{...bind,created_at:new Date().toISOString()}]);A.throws(()=>before(),/ohne Vorbindung/);
   A.equal(psql("select count(*) from helmut_ko_quellenfassungen;"),"1");
  });
  await test("Privat/native: fehlende/veraenderte amtliche Originalarchive und fremde Quellen STOP",()=>{
   for(const z of O.ZIEL.ziele)for(const change of ["delete from helmut_store where id="+lit(B.pointer(z.raw,z.neu)),
    "update helmut_store set data=jsonb_set(data,'{dokument,source_id}',to_jsonb('fremd'::text)) where id="+lit(B.pointer(z.raw,z.neu)),
    "update helmut_store set data=jsonb_set(data,'{dokument,published_at}',to_jsonb('2026-10-14T07:00:00Z'::text)) where id="+lit(B.pointer(z.raw,z.neu))]){
    setup();psql(change);A.throws(()=>before(),/breg-neufassungen:|ko-quellenfassung-/);assertKeineBindings();
   }
  });
  await test("Privat/native: neuer aktiver CAS, fremder Besitzer, Joblease und Arbeitsslot STOP",()=>{
   for(const change of ["update helmut_verstehen_reservierungen set lease_bis=now()+interval '1 minute' where vorgang_id="+lit(b.aktivecas[0].vorgang_id),
    "update helmut_verstehen_reservierungen set besitzer='fremd' where vorgang_id="+lit(b.aktivecas[0].vorgang_id),
    "update helmut_jobs set status='laeuft',lease_owner='synthetischer-owner',lease_expires_at=now()+interval '1 minute' where id="+lit(a.ziel_jobs[0].id),
    "insert into helmut_klassen_slots values('00000000-0000-4000-8000-000000000001',now()+interval '1 minute')"]){
    setup();const p=before();psql(change);A.throws(()=>run("freigeben",p,go("freigeben",p.digest)),/breg-neufassungen:/);assertKeineBindings();
   }
  });
  await test("Privat/native: Finanzbuch-/Quoten-/Geldbindungsdrift bleibt STOP ohne Reset",()=>{
   const call=Object.values(b.kostenbuch.calls).find(c=>["reserviert","ungeklaert"].includes(c.status));A(call);
   for(const change of ["update helmut_store set data=jsonb_set(data,'{betriebskostenBudget,bound}','0'::jsonb) where id='main-auth'",
    "update helmut_store set data=jsonb_set(data,"+lit('{betriebskostenBudget,calls,'+call.id+',reserved}')+",'0'::jsonb) where id='main-auth'",
    "update llm_budget_counters set used=101 where scope='global'","update helmut_anbieter_fenster set verbraucht=17"]){
    setup();const p=before();psql(change);A.throws(()=>run("freigeben",p,go("freigeben",p.digest)),/breg-neufassungen:/);assertKeineBindings();
   }
  });
  await test("Privat/native: nur103 Archive+155 Bindungen+2 Rawpromotionen; alle8 historischen Vollrow-Leser unveraendert",()=>{
   setup();prepared=before();vor=JSON.parse(letzteVorschau.inhalt);
   const jsplan=O.plane(vor,{...O.ZIEL,rawIds:vor.roh.map(r=>r.id).sort()});
   receipt=run("freigeben",prepared,go("freigeben",prepared.digest));A.deepEqual(receipt.plan,jsplan);
   A.deepEqual(receipt.plan.anzahl,{vorarchive:19,neueArchive:103,findings:130,bindungen:155,promotionen:2});
   A.equal(receipt.bindungen.length,155);A.equal(receipt.plan.neueArchive.length,erwarteteNeueArchive);
   A.equal(psql("select count(*) from helmut_store where id like '%-rohstand-%';"),String(erwarteteArchiveDanach));
   A.equal(psql("select count(*) from helmut_ko_quellenmanifeste where vollstaendig;"),"8");
   const q=JSON.parse(psql("select jsonb_agg(jsonb_build_object('ko',q.knowledge_object_id,'ko_version',q.ko_version,'raw',to_jsonb(d)) order by q.knowledge_object_id,q.raw_document_id) from helmut_ko_quellen q cross join lateral public.raw_documents(q) d;"));
   A.equal(q.length,155);
   for(const row of q){A.deepEqual(row.raw,vor.roh.find(r=>r.id===row.raw.id));A.equal(row.ko_version,a.kos.find(k=>k.id===row.ko).ko_version);}
   A.deepEqual(JSON.parse(psql("select jsonb_agg(to_jsonb(k) order by id) from knowledge_objects k;")),a.kos);
   A.deepEqual(JSON.parse(psql("select jsonb_agg(to_jsonb(c) order by vorgang_id) from helmut_verstehen_reservierungen c;")),b.aktivecas);
   A.deepEqual(JSON.parse(psql("select data->'betriebskostenBudget' from helmut_store where id='main-auth';")),b.kostenbuch);
   for(const z of O.ZIEL.ziele)A.equal(R.standHash(aktuelleRaw().find(r=>r.id===z.raw)),z.neu);
   A.equal(psql("select data->>'hinweis' from helmut_store where id='main-operator-breg-fassung-20261127';"),"Synthetische alte verbrauchte Einmalquittung");
   for(const [name,value] of [["vorschau",letzteVorschau],["vorbereitet",prepared],["quittung",receipt]])
    fs.writeFileSync(path.join(dir,"breg28-native-"+name+"-private.json"),JSON.stringify(value),{mode:0o600});
  });
  await test("Privat/native: Replay gesperrt; Rueckweg vor Claim erhaelt alle Archive und verbrauchtes Einmalrecht",()=>{
   A.throws(()=>run("freigeben",prepared,go("freigeben",prepared.digest)),/breg-neufassungen:/);
   const r=run("rueckweg",rueck(receipt),go("rueckweg",receipt.nachDigest));A.equal(r.modus,"zurueckgenommen");
   assertKeineBindings();A.deepEqual(aktuelleRaw(),a.roh);
   A.equal(psql("select count(*) from helmut_store where id like '%-rohstand-%';"),String(erwarteteArchiveDanach));
   A.equal(psql("select count(*) from helmut_store where id like "+lit(key+"%")+";"),"2");
   A.throws(()=>run("rueckweg",rueck(receipt),go("rueckweg",receipt.nachDigest)),/breg-neufassungen:/);
   A.throws(()=>before(),/Einmalrecht/);
  });
  await test("Privat/native: nach Claim/Konsum/KO-/Archivdrift oder falscher Quittung kein Rueckweg",()=>{
   for(const change of ["update helmut_verstehen_reservierungen set versuche=versuche+1 where vorgang_id="+lit(b.aktivecas[0].vorgang_id),
    "insert into llm_usage(id,vorgang_id) values('native-neuer-konsum','vg-neu')",
    "update knowledge_objects set ko_version=ko_version+1 where id="+lit(O.ZIEL.kos[0]),
    "update helmut_store set data=jsonb_set(data,'{dokument,summary}',to_jsonb('drift'::text)) where id="+lit(b.archive[0].id)]){
    setup();const p=before(),r=run("freigeben",p,go("freigeben",p.digest));psql(change);
    A.throws(()=>run("rueckweg",rueck(r),go("rueckweg",r.nachDigest)),/breg-neufassungen:/);
    A.equal(psql("select count(*) from helmut_ko_quellenfassungen;"),"155");
   }
   setup();const p=before(),r=run("freigeben",p,go("freigeben",p.digest));
   A.throws(()=>run("rueckweg",{...rueck(r),receiptSHA256:"0".repeat(64)},go("rueckweg",r.nachDigest)),/Quittung/);
  });
  await test("Privat/native: Owner/RLS/append-only und JS-Fuenfminutengrenze bleiben zwingend",()=>{
   setup();const p=before();A.throws(()=>O.pruefe(letzteVorschau,{jetztMs:Date.parse(p.gelesenAm)+300001}),/Fuenfminuten/);
   for(const [change,restore] of [["alter table raw_documents owner to service_role","alter table raw_documents owner to postgres"],
    ["alter table helmut_store disable row level security","alter table helmut_store enable row level security"],
    ["grant update on helmut_ko_quellenfassungen to service_role","revoke update on helmut_ko_quellenfassungen from service_role"]]){
    psql(change);try{A.throws(()=>run("freigeben",p,go("freigeben",p.digest)),/Owner\/RLS/);}finally{psql(restore);}
   }
   assertKeineBindings();
  });
  await test("Privat/native: Snapshot-Race zeigt alten Blindspot und stoppt neuen Operator vor Datenkorrektur",async()=>{
   const altPfad=path.join(dir,"quellen-breg-neufassungen-20261128-vor-snapshotfix.sql");
   const altSql=fs.readFileSync(altPfad,"utf8"),sha=s=>require("node:crypto").createHash("sha256").update(s).digest("hex");
   A.equal(sha(altSql),"83b6fe0aa45dd08f2c71d9566a1382e2f2ca517bcbe67e68b7df5aba9535cb2d",
    "Bytegebundenes echtes Vorfixoriginal, keine nachgebaute alte Variante");
   A.match(altSql,/begin isolation level serializable;/);A(!altSql.includes("do $vorwertsperren$"));
   A.match(sql,/begin isolation level read committed;/);
   const begrenzt=async(promise,ms,grund)=>{
    let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{
     timer=setTimeout(()=>reject(Error(grund)),ms);
    })]);}finally{clearTimeout(timer);}
   };
   // Diese Verbindungen verwenden ausschliesslich den PID-gebundenen Unixsocket
   // dieses isolierten PG-Prozesses. Keine neuen Container, keine Netzverbindung.
   const verbindung=(app,input,offen=false)=>{
    const child=spawn("docker",["exec","-i",container,"env","-i","PATH=/usr/lib/postgresql/17/bin:/usr/bin:/bin","LANG=C.UTF-8",
     "psql","-h",pgdir,"-p",port,"-X","-q","-At","-U","postgres","-d",db,"-v","ON_ERROR_STOP=1"],
     {stdio:["pipe","pipe","pipe"]});
    const h={app,child,stdout:"",stderr:"",fertig:false,streamFehler:null};
    const sammle=feld=>chunk=>{
     if(Buffer.byteLength(h[feld])+Buffer.byteLength(chunk)>24*1024*1024){h.streamFehler="Lokale Ausgabegrenze";return;}
     h[feld]+=chunk;
    };
    child.stdout.setEncoding("utf8");child.stderr.setEncoding("utf8");
    child.stdout.on("data",sammle("stdout"));child.stderr.on("data",sammle("stderr"));
    child.stdin.on("error",()=>{}); // Ein psql-STOP darf kein unbehandeltes EPIPE ausloesen.
    h.ende=new Promise(resolve=>{
     child.once("error",error=>{h.fertig=true;resolve({code:null,fehler:error.message});});
     child.once("close",(code,signal)=>{h.fertig=true;resolve({code,signal});});
    });
    const prefix="set application_name="+lit(app)+";\n";
    if(offen)child.stdin.write(prefix+input);else child.stdin.end(prefix+input);
    return h;
   };
   const warteBis=async(pruefung,verbindung,grund)=>{
    const ende=Date.now()+5000;
    do{
     A(!verbindung.fertig,grund+": Verbindung vorzeitig beendet: "+verbindung.stderr.slice(0,1200));
     if(pruefung())return;
     await new Promise(resolve=>setTimeout(resolve,20));
    }while(Date.now()<ende);
    throw Error(grund+": kein bestaetigter Checkpoint innerhalb5s");
   };
   const aktuelleJobHash=()=>psql(`select encode(sha256(convert_to(coalesce(string_agg(h,'' order by h collate "C"),''),'UTF8')),'hex')
    from (select encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') h from public.helmut_jobs r) z;`);
   for(const [index,variante,quelle,marker] of [[0,"alt",altSql,"do $breg$"],[1,"neu",sql,"do $vorwertsperren$"]]){
    setup();const p=before(),basis=JSON.parse(letzteVorschau.inhalt),lockKey=731280000+process.pid*2+index;
    const appA="helmut-breg28-race-halter-"+process.pid+"-"+variante;
    const appB="helmut-breg28-race-operator-"+process.pid+"-"+variante;
    const lateId=index?"00000000-0000-4000-8000-000000000029":"00000000-0000-4000-8000-000000000028";
    const belegDatei=path.join(dir,"breg28-snapshot-race-"+process.pid+"-"+variante+"-private.json");
    const beleg={version:1,art:"Lokaler Drei-Verbindungs-Snapshotnachweis, keine Productionaktion",variante,
     sqlSHA256:sha(quelle),vorFixOriginalSHA256:sha(altSql),checkpoint:marker,
     isolation:index?"read committed":"serializable",vorbereiteterDigest:p.digest};
    let halter,operator,erstfehler;
    try{
     halter=verbindung(appA,"set statement_timeout='30s';set lock_timeout='3s';select pg_advisory_lock("+lockKey+");\n",true);
     await warteBis(()=>psql("select count(*) from pg_stat_activity a where a.datname=current_database() and a.application_name="+lit(appA)
      +" and exists(select 1 from pg_locks l where l.pid=a.pid and l.locktype='advisory' and l.granted);")==="1",halter,"Advisoryhalter A");
     A.equal(quelle.split(marker).length,2,"Genau ein Testcheckpoint vor globalem Lock-Erwerb");
     const hook="-- Nur lokale Testsynchronisation nach Tempdefinitionen.\nselect pg_advisory_xact_lock("+lockKey+");\n";
     const synchronisiert=quelle.replace(marker,hook+marker);
     A.equal(synchronisiert.replace(hook,""),quelle,"Operatorkern bytegleich ausserhalb des Testhooks");
     const raceGo=go("freigeben",p.digest);
     // Das bytegesicherte Altoriginal verlangte noch100 bei beiden Plattformen.
     // Nur sein deklarierter lokaler Altfall behaelt dieses alte Testszenario.
     if(!index)raceGo.plattformen[1].calls=100;
     operator=verbindung(appB,operatorInput("freigeben",p,raceGo,synchronisiert));
     await warteBis(()=>psql("select count(*) from pg_stat_activity where datname=current_database() and application_name="+lit(appB)
      +" and state='active' and wait_event_type='Lock' and wait_event='advisory';")==="1",operator,"Operator B vor globalen Locks");
     beleg.advisoryWaitBestaetigt=true;
     // C committet erst NACH Bs nachgewiesenem Advisory-Warten. Der valide lokale
     // Claim ist lediglich ein Statusbeleg; kein Handler, Fetch oder Modell startet.
     const late=JSON.parse(psql("begin;set local time zone 'UTC';insert into public.helmut_jobs"
      +"(id,job_type,idempotency_key,freshness_window,status,attempts,max_attempts,lease_owner,lease_expires_at,first_claimed_at,payload) values("
      +lit(lateId)+",'document_understanding',"+lit("synthetischer-snapshot-race|"+process.pid+"|"+variante)
      +",'synthetisches-lokales-Racefenster','laeuft',1,3,'synthetischer-spaeter-claimer',now()+interval '2 minutes',now(),"
      +j({synthetisch:"Snapshot-Race-Beleg, kein Modell-/Quellenauftrag"})+") returning to_jsonb(helmut_jobs);commit;").split("\n").at(-1));
     A.equal(late.status,"laeuft");A.equal(late.attempts,1);A( Date.parse(late.lease_expires_at)>Date.now());
     beleg.spaeterClaimCommitted=late;
     halter.child.stdin.end("select pg_advisory_unlock("+lockKey+");\n\\q\n");
     const endeA=await begrenzt(halter.ende,5000,"Advisoryhalter beendet sich nicht");A.equal(endeA.code,0);
     const endeB=await begrenzt(operator.ende,45000,"Operator B endet nicht innerhalb des begrenzten Testfensters");
     beleg.operatorEnde=endeB;beleg.operatorStderr=operator.stderr;
     A.equal(operator.streamFehler,null,"Vollstaendige begrenzte Operatorausgabe");
     const danachLate=JSON.parse(psql("set time zone 'UTC';select to_jsonb(j) from helmut_jobs j where id="+lit(lateId)+";"));
     A.deepEqual(danachLate,late,"Spaeter Claim bleibt unveraendert als aktiver Beleg erhalten");
     beleg.spaeterClaimDanach=danachLate;
     const nBind=Number(psql("select count(*) from helmut_ko_quellenfassungen;"));
     const nQuitt=Number(psql("select count(*) from helmut_store where id="+lit(key)+";"));
     beleg.bindungenDanach=nBind;beleg.quittungenDanach=nQuitt;
     if(!index){
      A.equal(endeB.code,0,"Alter SERIALIZABLE-Blindspot nicht reproduziert; keinen unerwarteten SSI-Abbruch als PASS werten: "+operator.stderr.slice(0,1200));
      const r=JSON.parse(operator.stdout.trim().split("\n").at(-1));
      A.equal(r.modus,"aktiviert");A.equal(nBind,155);A.equal(nQuitt,1);
      A.deepEqual(r.plan.anzahl,{vorarchive:19,neueArchive:103,findings:130,bindungen:155,promotionen:2});
      A.equal(r.vorDigest,p.digest,"Alter Operator bestaetigt trotz spaetem Claim den alten Vorwert");
      A.deepEqual(basis.sicherung.aktiveJobs,[]);A.equal(r.plan.promotionen.length,2);
      A.notEqual(aktuelleJobHash(),basis.sicherung.jobs,"Altsnapshot sieht den wirklich committeten Job nicht");
      for(const z of O.ZIEL.ziele)A.equal(R.standHash(aktuelleRaw().find(r=>r.id===z.raw)),z.neu);
      beleg.erwarteterBlindspotBestaetigt=true;beleg.lokaleAktivierungsquittung=r;
     }else{
      A.notEqual(endeB.code,0,"Neuer Operator muss am spaet committeten Claim stoppen");
      A.match(operator.stderr,/keine aktive Workerarbeit|frischer unveraenderter atomarer Vorwert/);
      A.equal(nBind,0);A.equal(nQuitt,0);A.deepEqual(aktuelleRaw(),a.roh);
      A.equal(psql("select count(*) from helmut_store where id like '%-rohstand-%';"),"19");
      beleg.neuerOperatorVorDatenkorrekturGestoppt=true;
     }
     A.deepEqual(JSON.parse(psql("select data->'betriebskostenBudget' from helmut_store where id='main-auth';")),b.kostenbuch);
     A.deepEqual(JSON.parse(psql("select jsonb_agg(to_jsonb(c) order by vorgang_id) from helmut_verstehen_reservierungen c;")),b.aktivecas);
     console.log("BELEG Snapshot-Race "+JSON.stringify({variante,sqlSHA256:beleg.sqlSHA256,advisoryWaitBestaetigt:true,
      spaeterClaim:lateId,operatorExit:endeB.code,bindungen:nBind,quittungen:nQuitt,
      resultat:index?"STOP vor Datenkorrektur":"Alter Blindspot lokal reproduziert",belegDatei}));
    }catch(error){erstfehler=error;beleg.fehler=error.stack||String(error);throw error;}
    finally{
     // Zuerst B beenden, dann A: ein frueher Testfehler darf durch Freigeben des
     // Halters keinen noch wartenden Operator versehentlich weiterlaufen lassen.
     const cleanup=[];
     for(const h of [operator,halter].filter(Boolean)){
      try{
       if(!h.fertig)psql("select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and application_name="+lit(h.app)+" and pid<>pg_backend_pid();");
       h.child.stdin.end();
       try{await begrenzt(h.ende,3000,"Testverbindung beendet sich nicht: "+h.app);}
       catch(error){h.child.kill("SIGKILL");await begrenzt(h.ende,3000,"Docker-Testkind bleibt offen: "+h.app);throw error;}
      }catch(error){cleanup.push(error.message);}
     }
     try{A.equal(psql("select count(*) from pg_stat_activity where datname=current_database() and application_name in("
      +lit(appA)+","+lit(appB)+");"),"0","Keine Race-Verbindungsorphans");}catch(error){cleanup.push(error.message);}
     beleg.cleanupFehler=cleanup;
     fs.writeFileSync(belegDatei,JSON.stringify(beleg,null,2)+"\n",{mode:0o600,flag:"wx"});
     if(cleanup.length){if(!erstfehler)throw Error("Race-Cleanup: "+cleanup.join("; "));
      console.error("Zusaetzlicher Race-Cleanupbefund: "+cleanup.join("; "));}
    }
   }
  });
 }finally{
  if(gestartet)cleanExec(["pg_ctl","-D",pgdir,"-m","fast","-w","stop"]);
  cleanExec(["rm","-rf","--",pgdir]);
 }
 A.equal(passed,snapshotOnly?1:process.argv.includes("--nur-nativ")?(process.argv.includes("--nach-vorflug")?9:11):15);
 console.log(passed+" Gruppen PASS; lokale synthetische Plattform-GOs sind KEIN Production-GO.");
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
