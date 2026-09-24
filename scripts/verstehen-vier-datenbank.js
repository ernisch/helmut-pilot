"use strict";
// Echte PostgreSQL, feste isolierte Testdatenbank. Fehlende Infrastruktur ist ROT.
const { execFileSync, spawn } = require("node:child_process");
const A = require("node:assert/strict");
const path = require("node:path");
const root = path.join(__dirname, "..");
const db = "helmut_test_verstehen_vier";
const host = process.env.HELMUT_TEST_PG_HOST, port = process.env.HELMUT_TEST_PG_PORT || "5433";
A.ok(["127.0.0.1", "localhost", "::1"].includes(host), "nur isolierter Loopback-PostgreSQL erlaubt");
const base = ["-h", host, "-p", port, "-U", process.env.HELMUT_TEST_PG_USER || "helmut", "-tA", "-v", "ON_ERROR_STOP=1"];
const sql = (s, database = db) => execFileSync("psql", [...base, "-d", database, "-c", s], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const file = n => execFileSync("psql", [...base, "-d", db, "-f", path.join(root, "supabase/migrations", n)], { stdio: ["ignore", "pipe", "pipe"] });
const migration = "20260924140548_verstehen_vier_start.sql";
const id = "vg-gemeinsame-20260921-dcd0f5";
const nonce = "11111111-1111-4111-8111-111111111111";
const run = "verstehen4-12345";
const quote = v => "'" + String(v).replaceAll("'", "''") + "'";
let pass = 0;
async function test(n, f) { await f(); pass++; console.log("PASS " + n); }
function receipt() {
  const start = Date.now();
  return { status: "laeuft", runId: run, nonce, ids: [id],
    gestartetAm: new Date(start).toISOString(), deadlineMs: start + 1200000,
    freigaben: [{ id, fencing: 2, kiAufrufe: 2, versuche: 2, eingabeHash: "alt" }] };
}
function setup(q = receipt()) {
  sql("truncate public.helmut_verstehen_reservierungen,public.knowledge_objects,public.helmut_store cascade");
  sql("insert into public.helmut_verstehen_reservierungen(vorgang_id,zustand,fencing,versuche,ki_aufrufe,eingabe_hash)"
    + " values (" + quote(id) + ",'unbekannt',2,2,2,'alt')");
  sql("insert into public.helmut_store(id,data) values ('verstehen4-20260924-a'," + quote(JSON.stringify(q)) + "::jsonb)");
}
function start(owner = "arbeiter", input = "neu", vorgang = id, ticket = nonce) {
  return "select erlaubt||'|'||fencing from public.helmut_verstehen_vier_start("
    + [vorgang, input, owner, run, ticket].map(quote).join(",") + ")";
}
function parallel(s) {
  return new Promise(resolve => {
    const c = spawn("psql", [...base, "-d", db, "-c", s], { stdio: ["ignore", "pipe", "pipe"] });
    let out = ""; c.stdout.on("data", x => { out += x; }); c.stderr.resume();
    c.on("error", () => resolve({ code: -1 })); c.on("close", code => resolve({ code, out: out.trim() }));
  });
}
async function main() {
  sql("drop database if exists " + db, "postgres");
  sql("create database " + db, "postgres");
  sql(`do $$ begin
    if not exists(select from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists(select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  create table public.knowledge_objects(id text primary key,vorgang_id text,status text,understanding_status text,ko_version integer,updated_at timestamptz);
  create table public.ko_document_links(knowledge_object_id text,raw_document_id text);
  create table public.helmut_store(id text primary key,data jsonb);`);
  file("20260814180000_verstehen_cas.sql");
  file("20260823043633_verstehen_aufgeben_erneut_freigegeben.sql");
  await test("Vorwaerts, Rollback, erneut vorwaerts", async () => {
    file(migration); file("rollback_" + migration); file(migration);
  });
  await test("anon und authenticated besitzen kein Ausfuehrungsrecht", async () => {
    for (const role of ["anon", "authenticated"])
      A.equal(sql("select has_function_privilege(" + quote(role)
        + ",'public.helmut_verstehen_vier_start(text,text,text,text,text)','execute')"), "f");
    A.equal(sql("select has_function_privilege('service_role','public.helmut_verstehen_vier_start(text,text,text,text,text)','execute')"), "t");
  });
  await test("Atomare Freigabe startet genau einen Versuch, kein offenes Zwischenstadium", async () => {
    setup(); A.equal(sql(start()), "true|3");
    A.equal(sql("select zustand||'|'||versuche||'|'||ki_aufrufe from public.helmut_verstehen_reservierungen"), "modell-laeuft|3|3");
    A.throws(() => sql(start()));
  });
  await test("Fehler nach Freigabe rollt die komplette Transaktion zurueck", async () => {
    setup(); A.throws(() => sql(start("arbeiter", "")));
    A.equal(sql("select zustand||'|'||fencing from public.helmut_verstehen_reservierungen"), "unbekannt|2");
  });
  await test("20 parallele Starter erhalten genau eine Berechtigung", async () => {
    setup(); const results = await Promise.all(Array.from({ length: 20 }, (_, i) => parallel(start("arbeiter-" + i))));
    A.equal(results.filter(x => x.code === 0).length, 1);
    A.equal(sql("select ki_aufrufe from public.helmut_verstehen_reservierungen"), "3");
  });
  await test("Cron kann lebende und abgelaufene Startmarke nicht erneut starten", async () => {
    setup(); sql(start());
    const cron = "select erlaubt from public.helmut_verstehen_reserviere(" + quote(id) + ",'neu','cron',300000)";
    A.equal(sql(cron), "f");
    sql("update public.helmut_verstehen_reservierungen set lease_bis=now()-interval '1 second'");
    A.equal(sql(cron), "f");
    A.equal(sql("select zustand||'|'||ki_aufrufe from public.helmut_verstehen_reservierungen"), "unbekannt|3");
    A.throws(() => sql(start())); // alte Quittungsbindung erlaubt auch dann keinen Retry
  });
  await test("Fremde Kennung und fremde Quittungsnonce werden abgelehnt", async () => {
    setup(); A.throws(() => sql(start("a", "neu", "vg-fremd")));
    A.throws(() => sql(start("a", "neu", id, "22222222-2222-4222-8222-222222222222")));
    A.equal(sql("select ki_aufrufe from public.helmut_verstehen_reservierungen"), "2");
  });
  await test("Nicht ausgewaehlter erlaubter Vorgang darf nicht starten", async () => {
    setup(); A.throws(() => sql(start("a", "neu", "vg-linkenpolitiker-20260921-37cdeb")));
  });
  await test("Abgelaufener oder terminaler Auftrag bleibt geschlossen", async () => {
    setup({ ...receipt(), deadlineMs: Date.now() - 1 }); A.throws(() => sql(start()));
    setup({ ...receipt(), status: "gestoppt" }); A.throws(() => sql(start()));
  });
  await test("Geaenderter CAS-Stand entwertet die Freigabe", async () => {
    setup(); sql("update public.helmut_verstehen_reservierungen set fencing=3");
    A.throws(() => sql(start()));
  });
  await test("Schon vorhandenes Ergebnis wird nicht erneut verstanden", async () => {
    setup();
    sql("select * from public.helmut_verstehen_ausgang_aufloesen(" + quote(id) + ",'erneut')");
    sql("select * from public.helmut_verstehen_reserviere(" + quote(id) + ",'neu','vorher',300000)");
    sql("select public.helmut_verstehen_modellstart(" + quote(id) + ",'vorher',3,300000)");
    const ko = { id: "ko-" + id, vorgang_id: id, status: "neu", understanding_status: "complete", ko_version: 1 };
    sql("select public.helmut_verstehen_speichere(" + [id, "vorher"].map(quote).join(",")
      + ",3," + quote(JSON.stringify(ko)) + "::jsonb,'ergebnis')");
    sql("update public.helmut_verstehen_reservierungen set zustand='unbekannt',besitzer=null,lease_bis=null");
    const q = receipt(); q.freigaben[0] = { id, fencing: 3, kiAufrufe: 3, versuche: 3, eingabeHash: "neu" };
    sql("update public.helmut_store set data=" + quote(JSON.stringify(q)) + "::jsonb");
    A.throws(() => sql(start()));
    A.equal(sql("select zustand from public.helmut_verstehen_reservierungen"), "unbekannt");
  });
  console.log("Verstehen vier PostgreSQL: " + pass + "/" + pass + " bestanden");
}
main().catch(e => { console.error(e.stderr?.toString() || e); process.exitCode = 1; });
