"use strict";

// Eigener verpflichtender CI Schritt, keine stille Offline-Simulation.
// Ausschliesslich zufaellige lokale Testdatenbank; nie Production Kennungen.
const A = require("node:assert/strict");
const crypto = require("node:crypto");
const { execFileSync, spawn } = require("node:child_process");
const N = require("../lib/helmut/testfenster-null500");
const F = require("./fixtures/null500");
const host = process.env.HELMUT_TEST_PG_HOST;
A.ok(["127.0.0.1", "localhost"].includes(host), "Expliziter lokaler PostgreSQL ist Pflicht");
const port = process.env.HELMUT_TEST_PG_PORT || "5433";
A.match(port, /^\d+$/);
const user = process.env.HELMUT_TEST_PG_USER || "helmut";
const db = "helmut_test_null500_" + crypto.randomBytes(6).toString("hex");
const args = database => ["-h", host, "-p", port, "-U", user, "-d", database, "-qAt", "-v", "ON_ERROR_STOP=1", "-f", "-"];
const psql = (sql, database = db) => execFileSync("psql", args(database), {
  input: sql, encoding: "utf8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"]
}).trim();
function parallel(sql) {
  return new Promise(resolve => {
    const c = spawn("psql", args(db), { stdio: ["pipe", "pipe", "pipe"] });
    c.stdout.resume(); c.stderr.resume();
    c.on("error", () => resolve(-1)); c.on("exit", code => resolve(code)); c.stdin.end(sql);
  });
}
const lit = s => "'" + s.replace(/'/g, "''") + "'";
const hash = s => `encode(sha256(convert_to((${s})::text,'UTF8')),'hex')`;
let pass = 0;
function ok(name) { pass++; console.log("PASS " + name); }
function grundlinie() {
  return JSON.parse(psql(`select jsonb_build_object(
    'profile',${hash("(select jsonb_agg(to_jsonb(p) order by user_id) from mandate_profiles p)")},
    'identitaeten',${hash("(select jsonb_agg(to_jsonb(p) order by id) from profiles p)")},
    'auth',${hash("(select data from helmut_store where id='main-auth')")},
    'main',${hash("(select data from helmut_store where id='main')")});`));
}
const s = F.snapshot();
function reset() {
  psql("truncate mandate_profiles, profiles, helmut_store, pipeline_locks, helmut_jobs, process_runs;");
  const today = new Date().toISOString().slice(0, 10);
  const auth = { ...s.auth, sessions: [{ id: "offline-session", tokenHash: "offline-hash" }],
    testKostenTage: { [today]: F.kostentag(today) } };
  s.auth.testKostenTage = auth.testKostenTage;
  psql(`insert into profiles select x->>'id',x from jsonb_array_elements(${lit(JSON.stringify(s.identitaeten))}::jsonb) x;
    insert into mandate_profiles select x->>'user_id',false,null,now(),x from jsonb_array_elements(${lit(JSON.stringify(s.mandate))}::jsonb) x;
    insert into helmut_store(id,data) values ('main',${lit(JSON.stringify(s.main))}::jsonb),('main-auth',${lit(JSON.stringify(auth))}::jsonb);`);
  const v = F.vertrag(new Date(Date.now() - 1000));
  v.grundlinie = grundlinie();
  return N.plane(s, F.auswahl, v);
}
function lese(m) {
  const query = N.baueSql(m, "lesen").split("\n").slice(1).join("\n").trim().replace(/;$/, "");
  return JSON.parse(psql("select row_to_json(r) from (" + query + ") r;"));
}
function state(m) { return N.bewerteLesung(m, lese(m)).zustand; }
function abweisen(m, sql = N.baueSql(m, "aktivierung")) {
  const vorher = grundlinie(); A.throws(() => psql(sql));
  A.deepEqual(grundlinie(), vorher); A.equal(state(m), "nicht-aktiviert");
}
async function main() {
  A.ok(Number(psql("show server_version", "postgres").split(".")[0]) >= 17);
  psql("create database " + db, "postgres");
  try {
    psql(`create table profiles(id text primary key, inhalt jsonb not null);
      create table mandate_profiles(user_id text primary key references profiles(id), aktiv boolean not null,
        geloescht_at timestamptz, updated_at timestamptz not null, inhalt jsonb not null);
      create table helmut_store(id text primary key, data jsonb not null, updated_at timestamptz default now());
      create function helmut_set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
      create trigger helmut_store_set_updated_at before update on helmut_store for each row execute function helmut_set_updated_at();
      create table pipeline_locks(expires_at timestamptz);
      create table helmut_jobs(status text, lease_expires_at timestamptz);
      create table process_runs(started_at timestamptz,finished_at timestamptz);`);
    let m = reset(), before = grundlinie();
    psql(N.baueSql(m, "aktivierung")); A.equal(state(m), "500-bestaetigt");
    A.equal(lese(m).ausserhalbaktiv, 0);
    for (const k of ["identitaeten", "auth", "main"]) A.equal(grundlinie()[k], before[k]);
    ok("Echte atomare Aktivierung genau500; Konten, Sessions, Identitaeten und Main unveraendert");
    A.throws(() => psql(N.baueSql(m, "aktivierung")));
    A.throws(() => psql(N.baueSql({ ...m, laufId: crypto.randomUUID() }, "aktivierung")));
    A.equal(state(m), "500-bestaetigt"); ok("Doppelter Auftrag und zweiter Lauf bei aktiver Kohorte verweigert");
    psql(N.baueSql(m, "ende")); A.equal(state(m), "0-bestaetigt");
    for (const k of ["identitaeten", "auth", "main"]) A.equal(grundlinie()[k], before[k]);
    const ende = psql("select jsonb_agg(to_jsonb(h) order by id) from helmut_store h");
    psql(N.baueSql(m, "ende")); A.equal(psql("select jsonb_agg(to_jsonb(h) order by id) from helmut_store h"), ende);
    A.throws(() => psql(N.baueSql(m, "aktivierung"))); A.equal(state(m), "0-bestaetigt");
    ok("Echter Rueckweg0, wiederholtes Ende ohne Write und keine Wiederverwendung nach Abschluss");

    m = reset();
    psql(`create function test_abbruch() returns trigger language plpgsql as $$ begin
      if new.user_id='test-kohorte-c-200' then raise exception 'fixture-mitten-im-stapel'; end if; return new; end $$;
      create trigger test_abbruch before update on mandate_profiles for each row execute function test_abbruch();`);
    abweisen(m); psql("drop trigger test_abbruch on mandate_profiles; drop function test_abbruch();");
    ok("Fehler mitten im echten500er Update rollt alle Profile und Quittung zurueck");

    m = reset(); psql("update helmut_store set data=data||'{\"fremd\":true}'::jsonb where id='main-auth'");
    abweisen(m); ok("Frisch abweichender Authstand verweigert jede Aktivierung");
    m = reset(); psql("insert into pipeline_locks values(now()+interval '1 minute')");
    abweisen(m); ok("Lebende Sperre verhindert den Start");
    m = reset(); psql("insert into helmut_jobs values('wartend',null)");
    abweisen(m); ok("Wartender Auftrag verhindert den Start auch ohne Lease");
    m = reset(); psql("insert into process_runs values(now(),null)");
    abweisen(m); ok("Junge unvollstaendige Prozessquittung verhindert den Start");
    m = reset(); psql("insert into helmut_jobs values('erledigt',now()+interval '1 minute')");
    abweisen(m); ok("Lebende Lease verhindert Start unabhaengig vom Jobstatus");
    for (const kostenPatch of [{ spent: 4000000 }, { frozen: "ungeklaert" },
      { calls: { offen: { status: "ungeklaert", reserved: 212000 } } }]) {
      m = reset();
      const day = m.vorflugAm.slice(0, 10);
      psql(`update helmut_store set data=jsonb_set(data,array['testKostenTage',${lit(day)}],
        (data->'testKostenTage'->${lit(day)})||${lit(JSON.stringify(kostenPatch))}::jsonb) where id='main-auth';`);
      m.grundlinie = grundlinie(); abweisen(m);
    }
    ok("Ausgeschoepftes Budget, Kostensperre und unbekannte Reserve verhindern Start bei passender Grundlinie");
    m = reset(); m.vorflugAm = new Date(Date.now()-120000).toISOString(); m.startBis = new Date(Date.now()-60000).toISOString();
    abweisen(m); ok("Abgelaufenes fuenfminuetiges Startfenster verweigert spaetes Ausfuehren");

    m = reset();
    const concurrent = await Promise.all([parallel(N.baueSql(m, "aktivierung")), parallel(N.baueSql(m, "aktivierung"))]);
    A.equal(concurrent.filter(c => c === 0).length, 1); A.equal(state(m), "500-bestaetigt");
    A.equal(psql("select count(*) from helmut_store where id like 'testfenster-null500-%'"), "1");
    ok("Zwei echte konkurrierende Verbindungen aktivieren genau einmal");
    // Rueckgabewert absichtlich ignoriert: nur unabhaengiges Lesen entscheidet.
    A.equal(N.bewerteLesung(m, lese(m)).automatischeWiederholung, false);
    ok("Verlorene Aktivierungsantwort wird durch gebundene Gegenlesung erkannt, ohne Retry");
    psql("update mandate_profiles set aktiv=false where user_id='bestand-0'; delete from helmut_store where id='main-auth'; insert into pipeline_locks values(now()+interval '1 hour');");
    psql(N.baueSql(m, "ende")); A.equal(state(m), "0-bestaetigt");
    ok("Ende funktioniert bei Teildeaktivierung, fehlendem Kostenbuch und laufender Arbeit");

    m = reset(); psql(N.baueSql(m, "aktivierung"));
    psql("update mandate_profiles set aktiv=true where user_id='bestand-8'");
    psql(N.baueSql(m, "ende"));
    A.equal(lese(m).zielaktiv, 0); A.equal(lese(m).ausserhalbaktiv, 1); A.equal(state(m), "unklar");
    ok("Unerwartete fremde Aktivierung wird nicht angefasst und nicht als globaler Nullzustand ausgegeben");

    m = reset();
    psql(`create function test_fremdwrite() returns trigger language plpgsql as $$ begin
      update profiles set inhalt=inhalt||'{"fremd":true}'::jsonb where id='bestand-8'; return new; end $$;
      create trigger test_fremdwrite before update on mandate_profiles for each row execute function test_fremdwrite();`);
    abweisen(m); psql("drop trigger test_fremdwrite on mandate_profiles; drop function test_fremdwrite();");
    ok("Postcondition rollt auch einen unerwarteten Seiteneffekt auf Identitaeten zurueck");
    await require("./testfenster-null500-ende-datenbank").pruefe({ psql, reset, grundlinie, state, lese, parallel, host, port, user, db, ok });
    console.log(`${pass} PASS, 0 FAIL gegen echte lokale PostgreSQL und PostgREST; keine Production Verbindung.`);
  } finally { psql("drop database " + db + " with (force)", "postgres"); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
