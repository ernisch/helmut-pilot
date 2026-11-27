"use strict";
// Nur synthetische Quellen, echte isolierte PG17/PostgREST12.2.3, kein Modell.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");
const net = require("node:net");
const { once } = require("node:events");
const { execFileSync, spawn } = require("node:child_process");
const R = require("../lib/helmut/roh-quellenstaende");
const B = require("../lib/helmut/ko-quellenfassung");
const literal = x => "'" + String(x).replace(/'/g, "''") + "'";
const json = x => literal(JSON.stringify(x)) + "::jsonb";
const pause = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  assert.equal(process.env.HELMUT_LOKALER_SCHUTZ, "aktiv");
  assert.equal(process.env.HELMUT_TEST_PG_HOST, "127.0.0.1");
  assert.match(process.env.HELMUT_TEST_PG_PORT || "", /^\d+$/);
  const user = process.env.HELMUT_TEST_PG_USER || "postgres";
  assert.match(user, /^[a-z_][a-z0-9_]*$/);
  const db = "helmut_quellenfassung_" + crypto.randomBytes(8).toString("hex");
  const port = process.env.HELMUT_TEST_PG_PORT;
  const password = process.env.PGPASSWORD || "helmut";
  const binary = process.env.HELMUT_TEST_POSTGREST_BIN || "/tmp/postgrest";
  assert.match(execFileSync(binary, ["--version"], { encoding: "utf8" }), /\b12\.2\.3\b/);
  const psql = (sql, name = db) => execFileSync("psql", ["-X", "-h", "127.0.0.1", "-p", port,
    "-U", user, "-d", name, "-tA", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8",
    env: { PATH: process.env.PATH, LANG: "C.UTF-8", PGPASSWORD: password, PGCONNECT_TIMEOUT: "3",
      PGOPTIONS: "-c statement_timeout=10000 -c lock_timeout=3000" }, timeout: 15000,
    stdio: ["pipe", "pipe", "pipe"] }).trim();
  assert.equal(Number(psql("show server_version;", "postgres").split(".")[0]), 17);
  const migration = fs.readFileSync("supabase/migrations/20261127131039_ko_quellenfassungen.sql", "utf8");
  const rollback = fs.readFileSync("supabase/migrations/rollback_20261127131039_ko_quellenfassungen.sql", "utf8");
  let api, gateway, created = false, passed = 0;
  const only=process.argv.find(a=>a.startsWith("--only="))?.slice(7);
  if(only && !["Nachholung","Schreibvertrag"].includes(only))throw Error("Unbekannte native Testauswahl");
  const test = async (name, fn) => { if(only && !name.includes(only))return; await fn(); console.log(`PASS ${++passed} ${name}`); };
  try {
    psql(`create database ${db}`, "postgres"); created = true;
    // Rollen werden im lokalen CI-Cluster bereits bereitgestellt; keine globalen Rollen anlegen.
    psql(`create table public.knowledge_objects(id text primary key, vorgang_id text,ko_version integer not null default 1,
      status text, understanding_status text, source_document_count integer, headline text);
      create table public.raw_documents(id text primary key, canonical_url text,content_hash text,cluster_id text,
        title text,summary text,url text,source_name text,source_id text,source_type text,confidence text,
        link_type text,published_at timestamptz,retrieved_at timestamptz,document_type text,wahlperiode text,
        raw jsonb,created_at timestamptz default now(),content_fingerprint text,publisher_id text,
        canonical_target_url text,finding_count integer);
      create table public.helmut_store(id text primary key,data jsonb not null,updated_at timestamptz default now());
      create table public.ko_document_links(knowledge_object_id text references public.knowledge_objects(id),
        raw_document_id text references public.raw_documents(id),created_at timestamptz default now(),
        primary key(knowledge_object_id,raw_document_id));
      alter table public.knowledge_objects enable row level security;
      alter table public.raw_documents enable row level security;
      alter table public.helmut_store enable row level security;
      alter table public.ko_document_links enable row level security;
      grant usage on schema public to service_role;
      grant select,insert,update on public.knowledge_objects,public.raw_documents,public.helmut_store,public.ko_document_links to service_role;`);
    const rights = () => psql(`select c.relname,c.relrowsecurity,coalesce(c.relacl::text,'')
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in ('raw_documents','ko_document_links','knowledge_objects','helmut_store') order by c.relname;`);
    const oldRights = rights();
    psql(migration);
    await test("Migration ist datenneutral; RLS/Altberechtigungen bleiben gleich und neue Schnittstellen sind service-only/invoker", async () => {
      assert.equal(rights(), oldRights);
      assert.equal(psql("select has_table_privilege('service_role','public.helmut_ko_quellenfassungen','UPDATE,DELETE');"),"f");
      assert.equal(psql("select count(*) from public.ko_document_links;"), "0");
      assert.equal(psql(`select bool_and(not p.prosecdef) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and (p.proname like 'helmut_%quellen%' or p.proname='raw_documents')`), "t");
      assert.equal(psql(`select bool_and(not has_table_privilege(r,'public.helmut_ko_quellen','select'))
        from unnest(array['anon','authenticated']) r;`), "t");
      assert.equal(psql(`select bool_and(not has_function_privilege(r,p.oid,'execute')) from pg_proc p
        join pg_namespace n on n.oid=p.pronamespace cross join unnest(array['anon','authenticated']) r
        where n.nspname='public' and (p.proname like 'helmut_%quellen%' or p.proname='raw_documents');`), "t");
    });
    await test("App-/Lagecaller reichen typisierte Quellenfassungsfehler durch; erfolgreiche Legacy-Leere behaelt Fallback", async () => {
      const vm = require("node:vm");
      const serverSource = fs.readFileSync("server.js","utf8");
      const a = serverSource.indexOf("async function loadSourcesByVorgang(kos)");
      const b = serverSource.indexOf("\nasync function loadPruefSourcesByVorgang",a);
      const failure = Object.assign(new Error("Quellenfassung UNKNOWN"),{code:"KO_QUELLENFASSUNG_UNAVAILABLE"});
      let single = 0;
      const load = vm.runInNewContext(serverSource.slice(a,b)+";loadSourcesByVorgang",{
        storageModul:{getPruefSourcesByVorgaenge:async()=>{throw failure;}},
        getSourcesForVorgang:async()=>{single++;return[];}
      });
      await assert.rejects(load([{vorgang_id:"alt1"}]),e=>e===failure); assert.equal(single,0);
      const lageSource = fs.readFileSync("lib/helmut/lage.js","utf8");
      const c=lageSource.indexOf("async function loadSourcesForVorgaenge(");
      const d=lageSource.indexOf("\nfunction ",c);
      const lageLoad=vm.runInNewContext(lageSource.slice(c,d)+"\n;loadSourcesForVorgaenge",{hostFromUrl:()=>"example.invalid"});
      const ko={id:"ko-alt1",vorgang_id:"alt1",best_source_url:"https://example.invalid/belegt"};
      await assert.rejects(lageLoad({getSourcesForVorgang:async()=>{throw failure;}},[ko]),e=>e===failure);
      const legacy = await lageLoad({getSourcesForVorgang:async()=>[]},[ko]);
      assert.equal(legacy.alt1[0].url,ko.best_source_url);
    });
    const listener = net.createServer(); listener.listen(0, "127.0.0.1"); await once(listener, "listening");
    const apiPort = listener.address().port; await new Promise(r => listener.close(r));
    const secret = crypto.randomBytes(32).toString("hex");
    const jwt = role => {
      const a = [{ alg: "HS256", typ: "JWT" }, { role, exp: Math.floor(Date.now()/1000)+600 }]
        .map(x => Buffer.from(JSON.stringify(x)).toString("base64url")).join(".");
      return a + "." + crypto.createHmac("sha256", secret).update(a).digest("base64url");
    };
    const token = jwt("service_role");
    api = spawn(binary, [], { env: { PATH: process.env.PATH,
      PGRST_DB_URI: `postgresql://${user}:${encodeURIComponent(password)}@127.0.0.1:${port}/${db}`,
      PGRST_DB_SCHEMAS: "public", PGRST_DB_ANON_ROLE: "anon", PGRST_JWT_SECRET: secret,
      PGRST_SERVER_HOST: "127.0.0.1", PGRST_SERVER_PORT: String(apiPort), PGRST_DB_POOL: "1", PGRST_LOG_LEVEL: "crit"
    }, stdio: ["ignore", "ignore", "ignore"] });
    const rest = async (path, options = {}, auth = token) => {
      const response = await fetch(`http://127.0.0.1:${apiPort}${path}`, { ...options,
        headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json", ...options.headers },
        signal: AbortSignal.timeout(5000), redirect: "error" });
      const text = await response.text();
      return { status: response.status, ok: response.ok, value: text ? JSON.parse(text) : null };
    };
    let ready = false;
    for (let i=0;i<100;i++) {
      try { if ((await rest("/helmut_ko_quellen?limit=0")).ok) { ready=true; break; } } catch {}
      await pause(100);
    }
    assert.ok(ready, "Lokaler PostgREST-Start");
    gateway = await require("./fixtures/z3-plattform").starteDatenbankTor({ postgrestPort: apiPort });
    process.env.SUPABASE_URL = gateway.url; process.env.SUPABASE_SERVICE_ROLE_KEY = token;
    process.env.HELMUT_V3_STORE = "1"; process.env.HELMUT_BRIEFING_RELEVANZ_TAGE = "14";
    const storage = require("../lib/helmut/storage");
    const id = "rd-" + "a".repeat(64);
    const old = { id, title: "Synthetischer Aprilstand", url: "https://example.invalid/quellenfassung",
      canonical_url: "https://example.invalid/quellenfassung", summary: "Synthetischer historischer Quelleninhalt.",
      published_at: "2026-04-17T07:00:00.000Z", source_id: "synthetischer-ursprung", source_name: "Beispielamt",
      source_type: "ministry", retrieved_at: "2026-08-20T04:01:43.145Z", raw: { sourcePriority: 95 } };
    const current = { ...old, title: "Synthetischer Novemberstand", summary: "Neuer synthetischer Quelleninhalt.",
      published_at: "2026-11-25T08:30:00.000Z", retrieved_at: "2026-11-26T00:01:28.560Z" };
    const archive = d => ({ version:1, quellenHash:R.standHash(d), dokument:d });
    const oldBound = B.bindeArchiv(old), currentBound = B.bindeArchiv(current);
    const archiveInsert = d => psql(`insert into public.helmut_store(id,data)
      values(${literal(B.bindeArchiv(d).helmutQuellenfassung.id)},${json(archive(d))});`);
    psql(`insert into public.raw_documents select (jsonb_populate_record(null::public.raw_documents,${json(old)})).*;
      insert into public.knowledge_objects(id,vorgang_id) values ('ko-alt1','alt1'),('ko-alt2','alt2'),('ko-neu','neu'),('ko-legacy','legacy');
      insert into public.ko_document_links(knowledge_object_id,raw_document_id) values ('ko-alt1',${literal(id)}),('ko-alt2',${literal(id)}),('ko-legacy',${literal(id)});`);
    await test("NULL-Bindung liefert exakt dieselbe sparsame PostgREST-Projektion wie der Alt-FK", async () => {
      const select = "knowledge_object_id,raw_documents(id,title,summary,url,published_at,source_id)";
      assert.deepEqual((await rest("/helmut_ko_quellen?knowledge_object_id=eq.ko-alt1&select="+select)).value,
        (await rest("/ko_document_links?knowledge_object_id=eq.ko-alt1&select="+select)).value);
      assert.equal(Object.hasOwn((await storage.listKoDocuments("ko-alt1"))[0], B.FELD), false);
    });
    archiveInsert(old); archiveInsert(current);
    const initialize = (ko,d) => {
      const row = B.link(ko,B.bindeArchiv(d)), manifest = B.manifest([row]);
      psql(`insert into public.helmut_ko_quellenfassungen(knowledge_object_id,ko_version,raw_document_id,
        raw_source_version_id,raw_source_version_sha256,quellen_count,manifest_sha256)
        values(${literal(ko)},1,${literal(d.id)},${literal(row.raw_source_version_id)},${literal(row.raw_source_version_sha256)},1,${literal(B.digest(manifest))});`);
    };
    // Entspricht nur dem separat GO-pflichtigen ersten Bestandssnapshot.
    initialize("ko-alt1",old); initialize("ko-alt2",old);
    psql(`update public.raw_documents set title=${literal(current.title)},summary=${literal(current.summary)},
      published_at=${literal(current.published_at)},retrieved_at=${literal(current.retrieved_at)} where id=${literal(id)};`);
    await test("Native Archivlesung; ungeschuetzter Link bleibt Legacy, Altlinks April und kanonischer Leser November", async () => {
      const loaded = await storage.ladeRohdokumentStaende([id], { [id]:R.standHash(current) });
      assert.deepEqual(loaded[0].helmutQuellenfassung, currentBound.helmutQuellenfassung);
      assert.equal((await storage.saveKoDocumentLinks("ko-neu", loaded)).saved, 1);
      assert.equal((await storage.getRawDocumentsByIds([id]))[0].title, current.title);
      for (const ko of ["ko-alt1","ko-alt2"]) {
        const d = (await storage.listKoDocuments(ko))[0]; assert.equal(d.title,old.title);
        assert.deepEqual(d.helmutQuellenfassung,oldBound.helmutQuellenfassung);
      }
      assert.equal((await storage.listKoDocuments("ko-neu"))[0].title,current.title);
      assert.equal(Object.hasOwn((await storage.listKoDocuments("ko-neu"))[0],B.FELD),false);
    });
    await test("Vorgang, Pruefquellen, gebundene Lage und Identitaetsleser verwenden denselben gebundenen Stand", async () => {
      const docs = await storage.getSourcesForVorgang("alt1"); assert.equal(docs[0].title,old.title);
      assert.equal((await storage.getSourcesForVorgang("alt1",{lageKoId:"ko-alt1",lageQuellen:docs}))[0].title,old.title);
      const review = await storage.getPruefSourcesByVorgaenge([{vorgang_id:"alt1"},{vorgang_id:"neu"}]);
      assert.equal(review.alt1[0].title,old.title); assert.equal(review.neu[0].title,current.title);
      const identities = await storage.getPublicationSourceIdentities([{id:"ko-alt1"}]);
      assert.equal(identities["ko-alt1"][0].url,old.url);
    });
    await test("Heutiges Lagefenster schliesst historische Aprilquellen aus; historisches Aprilfenster behaelt sie", async () => {
      const ids = ["ko-alt1","ko-alt2","ko-neu","ko-legacy"];
      const today = await storage.listAktuelleLageQuellen(ids,new Date("2026-11-27T12:00:00Z"));
      assert.deepEqual(today.map(r=>r.knowledge_object_id).sort(),["ko-legacy","ko-neu"]);
      const then = await storage.listAktuelleLageQuellen(ids,new Date("2026-04-18T12:00:00Z"));
      assert.deepEqual(then.map(r=>r.knowledge_object_id).sort(),["ko-alt1","ko-alt2"]);
    });
    await test("Schreibvertrag: Einzel- und Bulk-Linkwriter erfinden keine Lektuere und ersetzen keine bestehende Bindung", async () => {
      await storage.saveKoDocumentLinks("ko-alt1", [currentBound]);
      await storage.saveKoDocumentLinks("ko-alt2", [current]);
      assert.equal((await storage.listKoDocuments("ko-alt1"))[0].title,old.title);
      assert.equal((await storage.listKoDocuments("ko-alt2"))[0].title,old.title);
      const result = await storage.savePendingKnowledgeObjectsBulk([{vorgangId:"bulk",dokumente:[currentBound]}]);
      assert.equal(result.fehlgeschlagen,0);
      assert.equal((await storage.listKoDocuments("ko-bulk"))[0].title,current.title);
      const id2 = "rd-"+"b".repeat(64), other = {...current,id:id2,url:"https://example.invalid/zweite"};
      const mixed = await storage.saveKoDocumentLinks("ko-neu",[oldBound,other]);
      assert.equal(mixed.saved,2);
      assert.equal((await storage.listKoDocuments("ko-neu"))[0].title,current.title);
      assert.equal(psql("select to_regclass('public.helmut_quellen_lektuere') is null;"),"t");
    });
    await test("Schreibvertrag: Geschuetzte KO v1→v2: Vorlink unveraendert; fehlender Satz UNKNOWN; v2 November und historische v1 April", async () => {
      await storage.saveKoDocumentLinks("ko-alt1",[currentBound]);
      assert.equal((await storage.listKoDocuments("ko-alt1"))[0].title,old.title);
      psql("update public.knowledge_objects set ko_version=2,source_document_count=1 where id='ko-alt1';");
      await assert.rejects(storage.listKoDocuments("ko-alt1"));
      assert.equal((await storage.listKoDocuments("ko-alt1",40,{koVersion:1}))[0].title,old.title);
      const stale = await storage.saveKoDocumentLinks("ko-alt1",[currentBound],{koVersion:1});
      assert.equal(stale.skipped,true);
      assert.equal(psql("select count(*) from public.helmut_ko_quellenfassungen where knowledge_object_id='ko-alt1';"),"1");
      assert.equal((await storage.saveKoDocumentLinks("ko-alt1",[currentBound],{koVersion:2})).saved,1);
      assert.equal((await storage.listKoDocuments("ko-alt1"))[0].title,current.title);
      assert.equal((await storage.listKoDocuments("ko-alt1",40,{koVersion:1}))[0].title,old.title);
      assert.equal((await storage.saveKoDocumentLinks("ko-alt1",[currentBound],{koVersion:2})).saved,1);
      const conflict = await storage.saveKoDocumentLinks("ko-alt1",[oldBound],{koVersion:2});
      assert.equal(conflict.skipped,true);
      assert.equal((await storage.listKoDocuments("ko-alt1"))[0].title,current.title);
      const missingProof = await storage.saveKoDocumentLinks("ko-alt1",[current],{koVersion:2});
      assert.equal(missingProof.skipped,true);
      psql("update public.knowledge_objects set ko_version=1 where id='ko-alt1';");
    });
    await test("Schreibvertrag Nachholung: Vollsatzanzahl prueft KO-v2; positive Teilquittung und komplettes technisches Manifest bleiben getrennt",async()=>{
      const other={...current,id:"rd-"+"d".repeat(64),url:"https://example.invalid/vollsatz-zwei"};
      archiveInsert(other);
      psql(`insert into public.raw_documents select (jsonb_populate_record(null::public.raw_documents,${json(other)})).*;`);
      psql("update public.knowledge_objects set ko_version=3,source_document_count=2 where id='ko-alt1';");
      const partial=await storage.saveKoDocumentLinks("ko-alt1",[currentBound],{koVersion:3});
      assert.equal(partial.skipped,true);
      assert.equal(psql("select count(*) from public.helmut_ko_quellenfassungen where knowledge_object_id='ko-alt1' and ko_version=3;"),"0");
      await assert.rejects(storage.listKoDocuments("ko-alt1"),e=>e.code==="KO_QUELLENFASSUNG_UNAVAILABLE");
      const full=[currentBound,B.bindeArchiv(other)];
      assert.equal((await storage.saveKoDocumentLinks("ko-neu",[currentBound],{koVersion:1,quellenFassungDokumente:full})).saved,1);
      assert.equal((await storage.listKoDocuments("ko-neu")).length,only?1:2,"ungeschuetzter positiver Linkfilter bleibt unveraendert");
      const result=await storage.saveKoDocumentLinks("ko-alt1",[currentBound],{koVersion:3,quellenFassungDokumente:full});
      assert.equal(result.saved,1,"nur positive Teilmenge quittieren");
      assert.equal((await storage.listKoDocuments("ko-alt1")).length,2,"vollstaendige technische Fassung");
      assert.equal((await storage.saveKoDocumentLinks("ko-alt1",[currentBound],{koVersion:3})).saved,1);
      const conflict=await storage.saveKoDocumentLinks("ko-alt1",[oldBound],{koVersion:3});assert.equal(conflict.skipped,true);
      assert.equal(psql("select to_regclass('public.helmut_quellen_lektuere') is null;"),"t");
      psql("update public.knowledge_objects set ko_version=1 where id='ko-alt1';");
    });
    const linkSet = b => {
      const rows = [{raw_document_id:id,raw_source_version_id:b.id,raw_source_version_sha256:b.sha256}];
      psql(`update public.helmut_ko_quellenfassungen set raw_source_version_id=${literal(b.id)},
        raw_source_version_sha256=${literal(b.sha256)},manifest_sha256=${literal(B.digest(B.manifest(rows)))}
        where knowledge_object_id='ko-alt1' and ko_version=1;`);
    };
    const resetArchive = () => { psql(`update public.helmut_store set data=${json(archive(old))}
      where id=${literal(oldBound.helmutQuellenfassung.id)};`); linkSet(oldBound.helmutQuellenfassung); };
    const mustFail = async (message = /ko-quellenfassung/) => {
      const response = await rest("/helmut_ko_quellen?knowledge_object_id=eq.ko-alt1&select=raw_documents(id,title)");
      assert.equal(response.ok,false); assert.match(response.value.message,message);
      await assert.rejects(storage.getSourcesForVorgang("alt1"),e=>e.code==="KO_QUELLENFASSUNG_UNAVAILABLE");
      await assert.rejects(storage.listAktuelleLageQuellen(["ko-alt1"],new Date("2026-11-27T12:00:00Z")));
    };
    await test("Teilweiser oder manipulierter Versionssatz bleibt UNKNOWN und ist nicht nachtraeglich umbindbar", async () => {
      psql("update public.helmut_ko_quellenfassungen set quellen_count=2 where knowledge_object_id='ko-alt1' and ko_version=1;");
      await mustFail(/manifest-unvollstaendig/);
      psql("update public.helmut_ko_quellenfassungen set quellen_count=1 where knowledge_object_id='ko-alt1' and ko_version=1;");
      psql("update public.helmut_ko_quellenfassungen set manifest_sha256=repeat('0',64) where knowledge_object_id='ko-alt1' and ko_version=1;");
      await mustFail(/manifest-unvollstaendig/); resetArchive();
    });
    await test("Vollarchivdigest faengt source_id-Tamper ab, obwohl historischer Standhash gleich bleibt", async () => {
      const tampered = {...old,source_id:"fremder-ursprung"}; assert.equal(R.standHash(tampered),R.standHash(old));
      psql(`update public.helmut_store set data=${json(archive(tampered))} where id=${literal(oldBound.helmutQuellenfassung.id)};`);
      await mustFail(/archiv-abweichend/); resetArchive();
    });
    await test("Falsche Archiv-Raw-ID und falscher Standhash bleiben auch mit passendem Vollarchivdigest gesperrt", async () => {
      for (const d of [{...old,id:"rd-"+"c".repeat(64)},{...old,summary:"Manipulierter Text"}]) {
        const data = {...archive(old),dokument:d};
        psql(`update public.helmut_store set data=${json(data)} where id=${literal(oldBound.helmutQuellenfassung.id)};`);
        linkSet({...oldBound.helmutQuellenfassung,sha256:B.digest(data)}); await mustFail(); resetArchive();
      }
    });
    await test("Fehlendes Archiv, unpaarige Bindung und fremde Pointerkennung haben keinen kanonischen Fallback", async () => {
      psql(`alter table public.helmut_store disable trigger all;
        delete from public.helmut_store where id=${literal(oldBound.helmutQuellenfassung.id)};
        alter table public.helmut_store enable trigger all;`);
      await mustFail(); archiveInsert(old);
      assert.throws(()=>psql("update public.helmut_ko_quellenfassungen set raw_source_version_sha256=null where knowledge_object_id='ko-alt1';"));
      assert.throws(()=>linkSet({...oldBound.helmutQuellenfassung,id:currentBound.helmutQuellenfassung.id.replace('a'.repeat(64),'b'.repeat(64))}));
      const response = await rest("/helmut_ko_quellen?select=raw_documents(id)",{},jwt("authenticated"));
      assert.equal(response.ok,false);
    });
    await test("Fehlende Archiv-Leserechte liefern UNKNOWN/Lesefehler; bestehende Bindung verhindert Schema-Rollback", async () => {
      psql("revoke select on public.helmut_store from service_role;");
      await mustFail(/permission denied/); psql("grant select on public.helmut_store to service_role;");
      assert.throws(()=>psql(rollback),/Command failed/);
      assert.equal(psql("select count(*) from public.helmut_ko_quellen;"),"6");
    });
    await test("SQL-Snapshot bleibt beim konkurrierenden atomaren Raw/Pointerwechsel kohärent", async () => {
      // Nur synthetischer Claim-freier Wechsel im isolierten Test. Der Leser muss
      // immer den gebundenen Aprilstand sehen, nie Raw-November mit Altmetadaten.
      const commit = `begin; update public.knowledge_objects set ko_version=2,source_document_count=1 where id='ko-alt1';
        update public.raw_documents set title=${literal(current.title)},summary=${literal(current.summary)},published_at=${literal(current.published_at)} where id=${literal(id)}; commit;`;
      const requests = Array.from({length:5},()=>rest("/helmut_ko_quellen?knowledge_object_id=eq.ko-alt1&select=raw_documents(title,published_at)"));
      psql(commit);
      for(const response of await Promise.all(requests)) {
        assert.equal(response.ok,true); const d=response.value[0].raw_documents;
        assert.ok((d.title===old.title && d.published_at.startsWith("2026-04-17"))
          || (d.title===current.title && d.published_at.startsWith("2026-11-25")));
      }
    });
    await test("Schema-Rollback ohne gesetzte Pointer entfernt nur neue Schnittstellen und bewahrt Altbestand", async () => {
      psql("delete from public.helmut_ko_quellenfassungen;");
      const count = psql("select count(*) from public.ko_document_links;"); psql(rollback);
      assert.equal(psql("select count(*) from public.ko_document_links;"),count);
      assert.equal(psql("select to_regclass('public.helmut_ko_quellen') is null;"),"t");
    });
    console.log(`ERGEBNIS ${passed}/${passed} Quellenfassungsgruppen, keine Provider-/Productionaufrufe`);
  } finally {
    if (gateway) await gateway.stoppe();
    if (api && api.exitCode===null) { const done=once(api,"exit"); api.kill("SIGTERM"); await done; }
    if (created) psql(`drop database ${db} with (force);`,"postgres");
  }
}
main().catch(error=>{ console.error(error.stack); process.exitCode=1; });
