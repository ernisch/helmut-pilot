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
  const state = sql("select md5(string_agg(row_to_json(j)::text,',' order by id)) from public.helmut_jobs j;");
  sql(file(rollback));
  check("Rueckweg erhaelt Daten, OIDs und Rechte", () => {
    assert.equal(meta(),before); assert.equal(sql("select md5(string_agg(row_to_json(j)::text,',' order by id)) from public.helmut_jobs j;"),state);
    assert.equal(sql("select count(*) from pg_indexes where indexname='helmut_jobs_tagesarbeit_idx';"),"0");
  });
  console.log(`${passed}/${passed} gezielte SQL-Pruefungen bestanden; kein Last-/Production-Test.`);
}
main().catch(error => { console.error(error.stack); process.exitCode=1; });
