"use strict";

// Gezielte echte SQL-Pruefung, kein Lasttest. Nur der ausdruecklich benannte,
// netzlose lokale Container; keine Production-Kennung und kein externer DB-Host.
const fs = require("node:fs"), path = require("node:path");
const assert = require("node:assert/strict");
const { execFileSync, spawn } = require("node:child_process");
const root = path.join(__dirname, ".."), migrations = path.join(root, "supabase/migrations");
const container = process.env.HELMUT_TEST_CORE_CONTAINER;
assert.equal(container, "helmut-core-pg", "Nur expliziter lokaler Testcontainer erlaubt");
const args = ["--host=unix:///var/run/docker.sock", "exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", "helmut_test_core", "-At", "-v", "ON_ERROR_STOP=1"];
const sql = text => execFileSync("docker", args, { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const file = name => fs.readFileSync(path.join(migrations, name), "utf8");
const migration = "20261113165614_frische_tagesarbeit.sql";
const rollback = "rollback_" + migration;
const artikelprioritaet = "20261126005158_morgenpflicht_artikelprioritaet.sql";
const functionSql = (name, source) => {
  const start = source.indexOf("create or replace function public." + name + "(");
  assert.ok(start >= 0); return source.slice(start, source.indexOf("$$;", start) + 3);
};
let passed = 0;
function check(name, fn) { fn(); passed++; console.log("PASS " + name); }
function job(key, window = "to_char(now() at time zone 'UTC','YYYY-MM-DD')||'T00Z'", priority = 100, type = "source_fetch") {
  return `insert into public.helmut_jobs(job_type,idempotency_key,freshness_window,priority,due_at,first_due_at)
    values('${type}','${key}',${window},${priority},now()-interval '1 minute',now()-interval '1 minute');`;
}
const oldDay = "to_char((now() at time zone 'UTC')-interval '7 day','YYYY-MM-DD')||'T00Z'";
const reset = () => sql("truncate public.helmut_jobs;");
const meta = () => sql("select json_agg(json_build_array(oid,proacl,prosecdef,proconfig) order by proname) from pg_proc where pronamespace='public'::regnamespace and proname in ('helmut_claim_jobs','helmut_claim_job_by_id');");
const asyncSql = text => new Promise((resolve, reject) => {
  const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
  let out = "", err = "";
  child.stdout.on("data", x => out += x); child.stderr.on("data", x => err += x);
  child.on("error", reject); child.on("close", code => code ? reject(Error(err)) : resolve(out.trim()));
  child.stdin.end(text);
});

async function main() {
  // Netzwerk ist Container-Eigenschaft und wird vor jeder Datenanlage kontrolliert.
  const network = execFileSync("docker", ["--host=unix:///var/run/docker.sock", "inspect", "--format", "{{.HostConfig.NetworkMode}}", container], { encoding: "utf8" }).trim();
  assert.equal(network, "none");
  if(process.argv.includes("--production-kommentarstand")){
    // Nur der neu entdeckte Live-Ausgangsstand, aus Repository-Code erzeugt.
    // Keine Production-Verbindung und keine alten Kompatibilitaetsfaelle.
    execFileSync("docker",["--host=unix:///var/run/docker.sock","exec",container,"psql","-X","-U","postgres","-v","ON_ERROR_STOP=1","-c","CREATE DATABASE helmut_test_core"],{stdio:"pipe"});
    sql("create role anon; create role authenticated; create role service_role bypassrls;");
    sql(file("20260808_scalable_job_queue.sql"));
    const original=functionSql("helmut_claim_job_by_id",file("20260814090000_queue_verbraucher.sql"));
    const live=original.replace(/^[\t ]*--[^\n]*(?:\n|$)/gm, "");
    sql(live);
    check("exakter Production-Kommentarstand ist reproduziert",()=>assert.equal(sql("select md5(prosrc) from pg_proc where oid='public.helmut_claim_job_by_id(uuid,text,bigint)'::regprocedure;"),"80e91814dd75c7c893caf047b39a2cff"));
    sql(live.replace("return query", "-- unbekannte weitere Drift\n    return query"));
    check("weitere Drift bleibt vor DDL gesperrt",()=>{
      assert.throws(()=>sql(file(migration)),/Command failed/);
      assert.equal(sql("select count(*) from information_schema.columns where table_schema='public' and table_name='helmut_jobs' and column_name='last_seen_window';"),"0");
    });
    sql(live);sql(file(migration));
    check("gepruefter Live-Ausgangsstand migriert bei erhaltener Driftwache",()=>assert.equal(sql("select count(*) from information_schema.columns where table_schema='public' and table_name='helmut_jobs' and column_name='last_seen_window';"),"1"));
    console.log("3/3 neue Production-Kommentarstand-Pruefungen bestanden; keine alten Faelle.");return;
  }
  if(process.argv.includes("--kompatibilitaet")){
    // Frischer lokaler Container, nur diese drei neuen Uebergangsfaelle.
    execFileSync("docker",["--host=unix:///var/run/docker.sock","exec",container,"psql","-X","-U","postgres","-v","ON_ERROR_STOP=1","-c","CREATE DATABASE helmut_test_core"],{stdio:"pipe"});
    sql("create role anon; create role authenticated; create role service_role bypassrls;");
    sql(file("20260808_scalable_job_queue.sql"));
    sql(functionSql("helmut_claim_job_by_id",file("20260814090000_queue_verbraucher.sql")));
    sql(file(migration));sql(job("altclient"));
    sql("update public.helmut_jobs set payload='{\"dokumentIds\":[\"synthetisch\"]}'::jsonb;");
    const claim=JSON.parse(sql("select row_to_json(c) from public.helmut_claim_job_by_id((select id from public.helmut_jobs),'alter-client',60000)c;"));
    check("alter Direktclaim liefert weiterhin exakt die gespeicherte Payload",()=>assert.deepEqual(claim.payload,JSON.parse(sql("select payload::text from public.helmut_jobs;"))));
    check("alter Fortschritts-CAS bleibt waehrend Umstellung moeglich",()=>{
      const before=JSON.stringify(claim.payload).replace(/'/g,"''");
      assert.equal(sql(`with geaendert as(update public.helmut_jobs set payload=payload||'{"fortschritt":true}'::jsonb where lease_owner='alter-client' and status='laeuft' and payload='${before}'::jsonb returning id)select count(*) from geaendert;`),"1");
    });
    reset();sql(job("neuclient"));
    const next=JSON.parse(sql("select row_to_json(c) from public.helmut_claim_tagesauftrag((select id from public.helmut_jobs),'neuer-client',60000)c;"));
    check("nur neuer Einsprung ergaenzt Fenster/Alter ohne gespeicherte Payloadmutation",()=>{
      assert.equal(next.uebernommen,true);assert.equal(next.payload.__helmutJobFenster,sql("select freshness_window from public.helmut_jobs;"));
      assert.ok(Number.isFinite(Date.parse(next.payload.__helmutJobEntstanden)));assert.ok(Number.isFinite(Date.parse(next.payload.__helmutJobFaellig)));
      assert.equal(sql("select payload::text from public.helmut_jobs;"),"{}");
    });
    sql(file(rollback));console.log("3/3 neue SQL-Uebergangsfaelle bestanden.");return;
  }
  if(process.argv.includes("--drift")){
    const original=functionSql("helmut_claim_jobs",file("20260808_scalable_job_queue.sql"));
    sql(original.replace("return query","-- abweichender Teststand\n  return query"));
    check("unbekannter SQL-Ausgangsstand stoppt vor Schemaaenderung",()=>{
      assert.throws(()=>sql(file(migration)),/Command failed/);
      assert.equal(sql("select count(*) from information_schema.columns where table_name='helmut_jobs' and column_name='last_seen_window';"),"0");
    });sql(original);sql(file(migration));
    check("gebundener Ausgangsstand nimmt die Migration an",()=>assert.equal(sql("select count(*) from pg_proc where proname='helmut_claim_tagesarbeit';"),"1"));
    sql(file(rollback));console.log("2/2 neue SQL-Driftpruefungen bestanden.");return;
  }
  if(process.argv.includes("--direkt-alter")){
    sql(file(migration));reset();sql(job("alter"));
    check("Direktclaim erhaelt unveraenderliche Altersbindung ohne Payloadmutation",()=>{
      assert.equal(sql("select ((c.payload->>'__helmutJobEntstanden')::timestamptz=j.created_at)::text||':'||((c.payload->>'__helmutJobFaellig')::timestamptz=j.first_due_at)::text from public.helmut_claim_tagesauftrag((select id from public.helmut_jobs),'alter',60000)c join public.helmut_jobs j on c.id=j.id;"),"true:true");
      assert.equal(sql("select payload::text from public.helmut_jobs;"),"{}");
    });sql(file(rollback));console.log("1/1 neue Direktclaim-Alterspruefung bestanden.");return;
  }
  if (process.argv.includes("--last-seen")) {
    sql(file(migration)); reset(); sql(job("wieder",oldDay,100,"document_understanding")+job("alt",oldDay,0));
    const original=sql("select freshness_window||':'||first_due_at||':'||status||':'||attempts from public.helmut_jobs where idempotency_key='wieder';");
    const enqueue=window=>sql(`select neu from public.helmut_enqueue_job('document_understanding','wieder',${window},'{}',now(),80::smallint,3,null);`);
    check("unbeobachteter Altrueckstand beeinflusst Tageszaehlung nicht",()=>assert.equal(sql("select offen from public.helmut_jobs_tagesstand(array[to_char(now() at time zone 'UTC','YYYY-MM-DD')||'T00Z'],null,'mandat-a');"),"0"));
    check("Wiederbeobachtung derselben Version behaelt Job und historischen Ursprung",()=>{
      assert.equal(enqueue("to_char(now() at time zone 'UTC','YYYY-MM-DD')||'T00Z'"),"f");
      assert.equal(sql("select freshness_window||':'||first_due_at||':'||status||':'||attempts from public.helmut_jobs where idempotency_key='wieder';"),original);
      assert.equal(sql("select count(*) from public.helmut_jobs where idempotency_key='wieder';"),"1");
    });
    check("erneut relevante offene Version zaehlt heute und erhaelt Claim-Vorrang",()=>{
      assert.equal(sql("select offen from public.helmut_jobs_tagesstand(array[to_char(now() at time zone 'UTC','YYYY-MM-DD')||'T00Z'],null,'mandat-a');"),"1");
      assert.equal(sql("select idempotency_key from public.helmut_claim_tagesarbeit('wieder',1,60000,null);"),"wieder");
    });
    check("historisches Wiederfinden setzt Aktualitaetsbezug nicht zurueck",()=>{
      enqueue(oldDay); assert.equal(sql("select last_seen_window from public.helmut_jobs where idempotency_key='wieder';"),sql("select to_char(now() at time zone 'UTC','YYYY-MM-DD')||'T00Z';"));
    });
    check("terminales Ergebnis wird durch Wiederbeobachtung nicht reaktiviert",()=>{
      sql("select * from public.helmut_finish_job((select id from public.helmut_jobs where idempotency_key='wieder'),'wieder',true,null,0);");
      enqueue("to_char((now() at time zone 'UTC')+interval '1 day','YYYY-MM-DD')||'T00Z'");
      assert.equal(sql("select status||':'||attempts from public.helmut_jobs where idempotency_key='wieder';"),"erledigt:1");
    });
    reset(); sql(job("global")+job("eigen",undefined,100,"mandate_projection")+job("fremd",undefined,100,"mandate_projection"));
    sql("update public.helmut_jobs set tenant_id='mandat-a' where idempotency_key='eigen'; update public.helmut_jobs set tenant_id='mandat-b' where idempotency_key='fremd';");
    check("Tagesstand trennt Mandate und bewahrt globale Quellen",()=>assert.equal(sql("select offen from public.helmut_jobs_tagesstand(array[to_char(now() at time zone 'UTC','YYYY-MM-DD')||'T00Z'],null,' mandat-a ');"),"2"));
    const state=sql("select md5(string_agg(id||':'||status||':'||attempts,',' order by id)) from public.helmut_jobs;");
    sql(file(rollback));
    check("Rueckweg entfernt nur neue Relevanzmetadaten und erhaelt Jobfortschritt",()=>{
      assert.equal(sql("select md5(string_agg(id||':'||status||':'||attempts,',' order by id)) from public.helmut_jobs;"),state);
      assert.equal(sql("select count(*) from information_schema.columns where table_name='helmut_jobs' and column_name='last_seen_window';"),"0");
    });
    console.log(`${passed}/${passed} neue Tagesbezugspruefungen bestanden; kein Lasttest.`); return;
  }
  if (process.argv.includes("--rpc-integration")) {
    sql(file(migration)); reset(); sql(job("direkt"));
    check("neue RPCs sind nur intern ausfuehrbar",()=>{
      assert.equal(sql("select has_function_privilege('service_role','public.helmut_claim_tagesarbeit(text,integer,bigint,text[])','execute') and not has_function_privilege('anon','public.helmut_claim_tagesarbeit(text,integer,bigint,text[])','execute') and not has_function_privilege('authenticated','public.helmut_claim_tagesauftrag(uuid,text,bigint)','execute');"),"t");
    });
    check("Direktclaim transportiert unveraenderliches Fenster ohne gespeicherte Payload zu veraendern",()=>{
      assert.equal(sql("select payload->>'__helmutJobFenster' from public.helmut_claim_tagesauftrag((select id from public.helmut_jobs),'direkt',60000);"),sql("select freshness_window from public.helmut_jobs;"));
      assert.equal(sql("select payload::text from public.helmut_jobs;"),"{}");
    });
    reset(); sql(job("frisch"));
    check("neuer Batch-Einsprung verwendet Tagesclaim",()=>assert.equal(sql("select idempotency_key from public.helmut_claim_tagesarbeit('batch',1,60000,null);"),"frisch"));
    sql(file(rollback));
    check("Rueckweg entfernt neue RPCs, kein alter Fallback moeglich",()=>assert.equal(sql("select count(*) from pg_proc where proname in ('helmut_claim_tagesarbeit','helmut_claim_tagesauftrag');"),"0"));
    console.log(`${passed}/${passed} neue RPC-Integrationspruefungen bestanden; bisherige 13 Pruefungen unveraendert erhalten.`);
    return;
  }
  execFileSync("docker", ["--host=unix:///var/run/docker.sock", "exec", container, "psql", "-X", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c", "CREATE DATABASE helmut_test_core"], { stdio: "pipe" });
  sql("create role anon; create role authenticated; create role service_role bypassrls;");
  sql(file("20260808_scalable_job_queue.sql"));
  sql(functionSql("helmut_claim_job_by_id", file("20260814090000_queue_verbraucher.sql"))
    + "revoke all on function public.helmut_claim_job_by_id(uuid,text,bigint) from public,anon,authenticated; grant execute on function public.helmut_claim_job_by_id(uuid,text,bigint) to service_role;");
  const before = meta(); sql(file(migration));
  check("OID, ACL, invoker und search_path erhalten", () => assert.equal(meta(), before));
  check("anon/authenticated bleiben ausgeschlossen", () => assert.equal(sql("select has_function_privilege('anon','public.helmut_claim_jobs(text,integer,bigint,text[])','execute') or has_function_privilege('authenticated','public.helmut_claim_job_by_id(uuid,text,bigint)','execute');"), "f"));
  check("heutiger Auftrag vor altem mit hoeherer Prioritaet", () => {
    sql(job("alt", oldDay, 0) + job("heute", undefined, 999));
    assert.equal(sql("select idempotency_key from public.helmut_claim_jobs('a',1,60000,null);"), "heute");
    assert.equal(sql("select status||':'||attempts from public.helmut_jobs where idempotency_key='alt';"), "wartend:0");
  });
  check("freie Kapazitaet bearbeitet historischen Auftrag", () => assert.equal(sql("select idempotency_key from public.helmut_claim_jobs('b',1,60000,null);"), "alt"));
  check("due_at-Verschiebung macht altes Fenster nicht aktuell", () => {
    reset(); sql(job("alt", oldDay, 0)+job("heute", undefined, 999));
    sql("update public.helmut_jobs set due_at=now() where idempotency_key='alt';");
    assert.equal(sql("select idempotency_key from public.helmut_claim_jobs('a',1,60000,null);"), "heute");
  });
  check("direktes Alt-Wecksignal wartet ohne Fehlversuch", () => {
    reset(); sql(job("alt", oldDay, 0)+job("heute"));
    assert.equal(sql("select grund from public.helmut_claim_job_by_id((select id from public.helmut_jobs where idempotency_key='alt'),'a',60000);"), "frische-tagesarbeit-vorrang");
    assert.equal(sql("select attempts from public.helmut_jobs where idempotency_key='alt';"), "0");
  });
  check("Typfilter und nicht faellige Tagesarbeit respektiert", () => {
    reset(); sql(job("alt", oldDay, 0,"document_understanding")+job("morgen"));
    sql("update public.helmut_jobs set due_at=now()+interval '1 hour' where idempotency_key='morgen';");
    assert.equal(sql("select idempotency_key from public.helmut_claim_jobs('a',1,60000,array['document_understanding']);"), "alt");
  });
  check("abgelaufene Lease kontrolliert wiederaufgenommen", () => {
    reset(); sql(job("heute")); sql("select id from public.helmut_claim_jobs('a',1,1000,null); update public.helmut_jobs set lease_expires_at=now()-interval '1 second';");
    assert.equal(sql("select lease_owner||':'||attempts from public.helmut_claim_jobs('b',1,60000,null);"), "b:2");
  });
  check("maximale Versuche auch beim Direktclaim eingehalten", () => {
    reset(); sql(job("ausgeschoepft")); sql("update public.helmut_jobs set attempts=max_attempts;");
    assert.equal(sql("select grund from public.helmut_claim_job_by_id((select id from public.helmut_jobs),'a',60000);"), "bereits-fehlgeschlagen");
    assert.equal(sql("select status||':'||attempts from public.helmut_jobs;"), "fehlgeschlagen:5");
  });
  check("bestaetigter Abschluss bleibt nach Neustart terminal", () => {
    reset(); sql(job("fertig")); sql("select id from public.helmut_claim_jobs('a',1,60000,null); select * from public.helmut_finish_job((select id from public.helmut_jobs),'a',true,null,0);");
    assert.equal(sql("select count(*) from public.helmut_claim_jobs('b',1,60000,null);"), "0");
    assert.equal(sql("select grund from public.helmut_claim_job_by_id((select id from public.helmut_jobs),'b',60000);"), "bereits-erledigt");
  });
  reset(); sql(job("parallel1")+job("parallel2"));
  const concurrent = await Promise.all([1,2].map(n => asyncSql(`begin; select idempotency_key from public.helmut_claim_jobs('parallel${n}',1,60000,null); select pg_sleep(0.2); commit;`)));
  check("zwei echte konkurrierende Verbindungen vergeben getrennte Jobs", () => {
    assert.ok(concurrent.every(s => /parallel[12]/.test(s)));
    assert.equal(sql("select count(distinct lease_owner)||':'||max(attempts) from public.helmut_jobs;"), "2:1");
  });
  check("Tagesindex ist partiell und enthaelt keine JSON-Spalte", () => {
    const index = sql("select indexdef from pg_indexes where indexname='helmut_jobs_tagesarbeit_idx';");
    assert.match(index,/COALESCE\(last_seen_window, freshness_window\)/); assert.match(index,/priority, due_at, created_at, id/); assert.match(index,/WHERE.*wartend/); assert.doesNotMatch(index,/payload/);
  });
  sql(file("20260808_jobqueue_abhaengigkeiten.sql"));
  sql(file("20260809_jobqueue_wiedervorlage.sql"));
  sql(file("20261119091317_quellenfaelligkeit_claim.sql"));
  sql(file("20261123110000_quellen_dlq.sql"));
  const aktuelleId = "(select id from public.helmut_jobs)";
  check("Abgelehnte Vertagung erhält Claim-Versuche bis zum terminalen DLQ-Beleg", () => {
    reset();
    sql(job("vertagung-abgelehnt"));
    for (let versuch = 1; versuch <= 3; versuch++) {
      const claim = versuch === 1
        ? "public.helmut_claim_quellenfaelligkeit('halter',60000,false)"
        : "public.helmut_claim_tagesarbeit('halter',1,60000,array['source_fetch'])";
      assert.equal(sql(`select attempts from ${claim};`), String(versuch));
      assert.equal(sql(`select uebernommen from public.helmut_defer_job(${aktuelleId},'fremd',60000);`), "f");
      assert.equal(sql("select status||':'||attempts||':'||max_attempts from public.helmut_jobs;"), `laeuft:${versuch}:3`);
      sql("update public.helmut_jobs set lease_expires_at=now()-interval '1 second';");
    }
    assert.equal(sql("select count(*) from public.helmut_claim_tagesarbeit('nachlauf',1,60000,array['source_fetch']);"), "0");
    assert.equal(sql(`select grund from public.helmut_claim_tagesauftrag(${aktuelleId},'signal',60000);`), "bereits-fehlgeschlagen");
    assert.equal(sql("select status||':'||attempts from public.helmut_jobs;"), "fehlgeschlagen:3");
    assert.equal(sql(`select attempts||':'||failure_kind from public.helmut_quellen_dlq where job_id=${aktuelleId};`),
      "3:lease-ausgang-offen");
  });
  check("Gespeicherte Vertagung sperrt erneuten Claim bis zur Fälligkeit", () => {
    reset();
    sql(job("vertagung-antwort-verloren"));
    assert.equal(sql(`select attempts from public.helmut_claim_tagesauftrag(${aktuelleId},'halter',60000);`), "1");
    // Die erste Antwort wird nicht ausgewertet. Der folgende Leser kennt nur den DB-Stand.
    sql(`select * from public.helmut_defer_job(${aktuelleId},'halter',60000);`);
    assert.equal(sql(`select grund from public.helmut_claim_tagesauftrag(${aktuelleId},'erneut',60000);`), "nicht-faellig");
    assert.equal(sql(`select uebernommen from public.helmut_defer_job(${aktuelleId},'halter',60000);`), "f");
    assert.equal(sql("select status||':'||attempts from public.helmut_jobs;"), "wartend:0");
    sql("update public.helmut_jobs set due_at=now()-interval '1 second';");
    assert.equal(sql(`select attempts from public.helmut_claim_tagesauftrag(${aktuelleId},'faellig',60000);`), "1");
    assert.equal(sql(`select grund from public.helmut_claim_tagesauftrag(${aktuelleId},'konkurrierend',60000);`), "lease-fremd");
  });
  reset();
  const enqueueSignatur = "'public.helmut_enqueue_job(text,text,text,jsonb,timestamptz,smallint,integer,text)'::regprocedure";
  const enqueueRechte = () => sql(`select json_build_array(oid,proacl,prosecdef,proconfig) from pg_proc where oid=${enqueueSignatur};`);
  const rechteVorher = enqueueRechte();
  sql(file(artikelprioritaet));
  const heute = "to_char(now() at time zone 'UTC','YYYY-MM-DD')||'T00Z'";
  const rohId = "rd-" + "a".repeat(64);
  const payload = JSON.stringify({ dokumentIds: [rohId], quellenstaende: { [rohId]: "b".repeat(64) } });
  const enqueueAnalyse = (key, window, priority, stand = payload) => sql(`select neu from public.helmut_enqueue_job(
    'document_understanding', '${key}', ${window}, '${stand}', now()-interval '1 hour', ${priority}::smallint, 3, null);`);
  const queueStand = key => sql(`select row(id, status, priority, attempts, due_at, first_due_at, freshness_window, payload)::text
    from public.helmut_jobs where idempotency_key='${key}';`);
  check("Heute benötigte identische Fassung erhält Vorrang vor Hintergrund und Altbestand", () => {
    assert.equal(enqueueAnalyse("pflicht", oldDay, 80), "t");
    enqueueAnalyse("hintergrund", heute, 80);
    sql(job("altbestand", oldDay, 35, "document_understanding"));
    const vorher = queueStand("pflicht");
    assert.equal(enqueueAnalyse("pflicht", heute, 50), "f");
    assert.equal(queueStand("pflicht"), vorher.replace(",wartend,80,", ",wartend,50,"));
    assert.equal(sql("select idempotency_key from public.helmut_claim_tagesarbeit('morgen',1,60000,array['document_understanding']);"), "pflicht");
  });
  check("Veraltete Beobachtung, fremde Fassung, Diagnosen und terminale Jobs werden nicht hochgestuft", () => {
    enqueueAnalyse("fremde-fassung", oldDay, 35);
    enqueueAnalyse("fremde-fassung", heute, 80, payload.replace("b".repeat(64), "c".repeat(64)));
    assert.equal(sql("select last_seen_window is null from public.helmut_jobs where idempotency_key='fremde-fassung';"), "t");
    const hintergrund = queueStand("hintergrund");
    enqueueAnalyse("hintergrund", oldDay, 35);
    enqueueAnalyse("hintergrund", heute, 35, payload.replace("b".repeat(64), "c".repeat(64)));
    assert.equal(queueStand("hintergrund"), hintergrund);
    const diagnose = JSON.stringify({ ...JSON.parse(payload), artikelFehler: "quellenstand-nicht-bestaetigt" });
    enqueueAnalyse("diagnose", oldDay, 80, diagnose);
    const vorher = queueStand("diagnose");
    enqueueAnalyse("diagnose", heute, 35);
    assert.equal(queueStand("diagnose"), vorher);
    sql("select * from public.helmut_finish_job((select id from public.helmut_jobs where idempotency_key='pflicht'),'morgen',true);");
    const abgeschlossen = queueStand("pflicht");
    enqueueAnalyse("pflicht", heute, 35);
    assert.equal(queueStand("pflicht"), abgeschlossen);
  });
  check("Optionale Beobachtung erbt frühere Morgenpflicht nicht und überschreibt keine heutige Pflicht", () => {
    const prioritaet = () => sql("select priority from public.helmut_jobs where idempotency_key='erneut';");
    const spaeter = "to_char(now() at time zone 'UTC','YYYY-MM-DD')||'T01Z'";
    enqueueAnalyse("erneut", oldDay, 35);
    enqueueAnalyse("erneut", spaeter, 80);
    assert.equal(prioritaet(), "80");
    enqueueAnalyse("erneut", heute, 50);
    enqueueAnalyse("erneut", spaeter, 80);
    assert.equal(prioritaet(), "50");
    assert.equal(sql("select right(last_seen_window,4) from public.helmut_jobs where idempotency_key='erneut';"), "T01Z");
  });
  check("Beobachtung am Folgetag korrigiert die Priorität auch unter unveränderter Lease", () => {
    enqueueAnalyse("laufender-altauftrag", oldDay, 35);
    sql("update public.helmut_jobs set status='laeuft', lease_owner='alter-halter', lease_expires_at=now()+interval '1 minute', attempts=1 where idempotency_key='laufender-altauftrag';");
    const leaseStand = () => sql("select row(id,status,attempts,lease_owner,lease_expires_at,due_at,first_due_at,payload)::text from public.helmut_jobs where idempotency_key='laufender-altauftrag';");
    const vorher = leaseStand();
    enqueueAnalyse("laufender-altauftrag", heute, 80);
    assert.equal(leaseStand(), vorher);
    assert.equal(sql("select priority from public.helmut_jobs where idempotency_key='laufender-altauftrag';"), "80");
  });
  check("Prioritätsmigration und Rückweg erhalten RPC-Rechte und Auftragsstand", () => {
    assert.equal(enqueueRechte(), rechteVorher);
    const nachher = queueStand("pflicht");
    sql(file("rollback_" + artikelprioritaet));
    assert.equal(enqueueRechte(), rechteVorher);
    assert.equal(queueStand("pflicht"), nachher);
  });
  sql(file("rollback_20261123110000_quellen_dlq.sql"));
  const jobbestand = "select md5(string_agg((to_jsonb(j) - 'last_seen_window')::text,',' order by id)) from public.helmut_jobs j;";
  const state = sql(jobbestand);
  sql(file(rollback));
  check("Rueckweg erhaelt Daten, OIDs und Rechte", () => {
    assert.equal(meta(),before); assert.equal(sql(jobbestand),state);
    assert.equal(sql("select count(*) from information_schema.columns where table_schema='public' and table_name='helmut_jobs' and column_name='last_seen_window';"),"0");
    assert.equal(sql("select count(*) from pg_indexes where indexname='helmut_jobs_tagesarbeit_idx';"),"0");
  });
  console.log(`${passed}/${passed} gezielte SQL-Pruefungen bestanden; kein Last-/Production-Test.`);
}
main().catch(error => { console.error(error.stack); process.exitCode=1; });
