"use strict";

// ═══════════════════════════════════════════════════════════════════════════
// Sprint 11 — Preview-DB-Validierung gegen eine ECHTE, wegwerfbare Postgres-16.
// Deckt Aufgabe 2 (GoTrue/Claims, DB-seitig reproduzierbarer Teil),
// Aufgabe 3 (Read-only-Rolle), Aufgabe 4 (RLS-Matrix) und Aufgabe 8
// (Adversarial Retest) ab. Nichts davon berührt Production.
//
// Modell: jeder queryAs()-Aufruf = ein PostgREST-Request (frische Verbindung,
// request.jwt.claims gesetzt, SET LOCAL ROLE <role>). Login-Rolle ist der
// NICHT-Superuser `authenticator`.
// ═══════════════════════════════════════════════════════════════════════════

const { queryAs, makeAsserter } = require("./lib-pg.js");
const { state, check } = makeAsserter();

// Claim-Helfer
const A = { role: "authenticated", user_id: "mdb-a" };
const B = { role: "authenticated", user_id: "mdb-b" };
const C = { role: "authenticated", user_id: "mdb-c" };
const RO_A = { role: "helmut_readonly", user_id: "mdb-a" };
const RO_B = { role: "helmut_readonly", user_id: "mdb-b" };
const SVC = { role: "service_role" };

function rows(role, claims, sql) {
  const r = queryAs(role, claims, sql);
  if (!r.ok) return { n: -1, r };
  return { n: r.rowCount, r };
}
function denied(r) {
  return !r.ok && r.code === "42501";
}
// „kein Zugriff": entweder 0 Zeilen (RLS) ODER Grant-Verweigerung (42501).
function noAccess(role, claims, sql) {
  const r = queryAs(role, claims, sql);
  return r.ok ? r.rowCount === 0 : r.code === "42501";
}

console.log("\n════ AUFGABE 2 — GoTrue / Claims (DB-seitig reproduzierbar) ════");

// Login → gültiger Tenant-Claim → eigene Daten sichtbar.
check("gültiger Tenant-Claim (A) → sieht eigene decisions (2)",
  rows("authenticated", A, "select id from decisions").n === 2);

// helmut_current_tenant() extrahiert den Claim korrekt.
{
  const r = queryAs("authenticated", A, "select public.helmut_current_tenant()");
  check("helmut_current_tenant() liefert 'mdb-a'", r.ok && r.rows[0][0] === "mdb-a");
}

// Ablauf OHNE Claim (authenticated, aber kein user_id) → fail-closed 0 Zeilen.
check("Claim ohne user_id → 0 Zeilen (fail-closed, kein Fehler)",
  rows("authenticated", { role: "authenticated" }, "select id from decisions").n === 0);

// Ablauf ganz OHNE Token (kein request.jwt.claims) → 0 Zeilen.
check("gar kein Token → 0 Zeilen",
  rows("authenticated", null, "select id from decisions").n === 0);

// Leerer Claim user_id="" → nullif-Schutz greift → 0 Zeilen.
check("leerer user_id-Claim → 0 Zeilen (nullif-Schutz)",
  rows("authenticated", { role: "authenticated", user_id: "" }, "select id from decisions").n === 0);

// Ungültiger/unbekannter Tenant → 0 Zeilen (kein Fehler, fail-closed).
check("unbekannter Tenant-Claim → 0 Zeilen",
  rows("authenticated", { role: "authenticated", user_id: "does-not-exist" }, "select id from decisions").n === 0);

// anon-Rolle (kein gültiges Login) → keine tenant-Policy greift → 0 Zeilen.
check("anon-Rolle → 0 Zeilen (keine anon-Policy)",
  rows("anon", { role: "anon", user_id: "mdb-a" }, "select id from decisions").n === 0);

console.log("\n════ AUFGABE 3 — Read-only-Rolle (nur SELECT) ════");

check("readonly SELECT eigene decisions (2)", rows("helmut_readonly", RO_A, "select id from decisions").n === 2);
check("readonly INSERT verweigert (42501)", denied(queryAs("helmut_readonly", RO_A, "insert into decisions(id,user_id) values('x','mdb-a')")));
check("readonly UPDATE verweigert (42501)", denied(queryAs("helmut_readonly", RO_A, "update decisions set payload='x' where user_id='mdb-a'")));
check("readonly DELETE verweigert (42501)", denied(queryAs("helmut_readonly", RO_A, "delete from decisions where user_id='mdb-a'")));
check("readonly TRUNCATE verweigert", !queryAs("helmut_readonly", RO_A, "truncate decisions").ok);
check("readonly RPC (SECURITY DEFINER) verweigert (42501)", denied(queryAs("helmut_readonly", RO_A, "select * from rpc_canary_all_office()")));
// BYPASSRLS-Attribut der Rolle (als service_role auslesbar).
{
  const r = queryAs("service_role", SVC, "select rolbypassrls, rolcanlogin, rolsuper from pg_roles where rolname='helmut_readonly'");
  check("readonly hat NOBYPASSRLS + NOLOGIN + NOSUPER", r.ok && r.rows[0].join("|") === "f|f|f");
}
// Keine Schreib-Grants in information_schema.
{
  const r = queryAs("service_role", SVC, "select count(*) from information_schema.role_table_grants where grantee='helmut_readonly' and privilege_type in ('INSERT','UPDATE','DELETE')");
  check("readonly: 0 INSERT/UPDATE/DELETE-Grants", r.ok && r.rows[0][0] === "0");
}
// Aktiver Missbrauchsversuch: readonly versucht RLS abzuschalten.
check("readonly kann RLS NICHT abschalten", !queryAs("helmut_readonly", RO_A, "alter table decisions disable row level security").ok);
// readonly liest fremden Tenant auch mit Read nicht (RLS trotz SELECT-Grant).
check("readonly sieht fremden Tenant NICHT (RLS greift trotz SELECT-Grant)",
  rows("helmut_readonly", RO_A, "select id from decisions where user_id='mdb-b'").n === 0);

console.log("\n════ AUFGABE 4 — RLS-Matrix (gleicher/falscher/fehlender/ungültiger/parallele Tenants) ════");

// gleicher Tenant (positiv) für alle drei parallelen Mandanten.
check("A sieht genau A (decisions=2)", rows("authenticated", A, "select id from decisions").n === 2);
check("B sieht genau B (decisions=1)", rows("authenticated", B, "select id from decisions").n === 1);
check("C sieht genau C (decisions=3)", rows("authenticated", C, "select id from decisions").n === 3);

// falscher Tenant — jede Kreuzung liefert 0.
check("A→B office_outputs = 0 (sensibel)", rows("authenticated", A, "select id from office_outputs where user_id='mdb-b'").n === 0);
check("C→A office_outputs = 0", rows("authenticated", C, "select id from office_outputs where user_id='mdb-a'").n === 0);
check("A sieht insgesamt nur EIGENE office_outputs (1)", rows("authenticated", A, "select id from office_outputs").n === 1);

// Cross-Tenant Update/Delete = 0 (kein Fremdschreiben, hier via authenticated der CRUD hat).
check("A UPDATE auf B-Zeile trifft 0 Zeilen", queryAs("authenticated", A, "update decisions set payload='hack' where id='dec-b-1'").ok && rows("authenticated", B, "select payload from decisions where id='dec-b-1'").r.rows[0][0] === "B1");
check("A INSERT mit fremdem user_id (with check) verweigert", !queryAs("authenticated", A, "insert into decisions(id,user_id) values('forge','mdb-b')").ok);

// helmut_store-Sonderfall: main / main-auth NIE sichtbar, nur eigenes main-p-.
check("A helmut_store: nur main-p-mdb-a (1 Zeile)", (() => { const r = rows("authenticated", A, "select id from helmut_store"); return r.n === 1 && r.r.rows[0][0] === "main-p-mdb-a"; })());
check("A helmut_store: 'main' unsichtbar", rows("authenticated", A, "select id from helmut_store where id='main'").n === 0);
check("A helmut_store: 'main-auth' (ALLE Logins) unsichtbar", rows("authenticated", A, "select id from helmut_store where id='main-auth'").n === 0);

// llm_usage-Sonderfall: user_id ODER politician_id.
check("A llm_usage: 2 Zeilen (user_id+politician_id)", rows("authenticated", A, "select id from llm_usage").n === 2);
check("C llm_usage: 1 Zeile (nur politician_id befüllt)", rows("authenticated", C, "select id from llm_usage").n === 1);
check("B llm_usage: sieht keine A/C-Zeile", rows("authenticated", B, "select id from llm_usage where user_id in ('mdb-a') or politician_id in ('mdb-a','mdb-c')").n === 0);

// profiles-Sonderfall: id IST der Mandant.
check("A profiles: nur eigene Zeile", (() => { const r = rows("authenticated", A, "select id from profiles"); return r.n === 1 && r.r.rows[0][0] === "mdb-a"; })());

// geteilte Daten: jeder authentifizierte Tenant liest denselben Korpus, anon nicht.
check("A knowledge_objects: 2 (geteilt)", rows("authenticated", A, "select id from knowledge_objects").n === 2);
check("B knowledge_objects: dieselben 2", rows("authenticated", B, "select id from knowledge_objects").n === 2);
check("anon knowledge_objects: 0", rows("anon", { role: "anon" }, "select id from knowledge_objects").n === 0);
check("authenticated darf geteilte Daten NICHT schreiben", !queryAs("authenticated", A, "insert into knowledge_objects(id,title) values('ko-x','x')").ok);

// pipeline_locks: keine Policy → authenticated 0, service_role alles.
check("pipeline_locks: authenticated 0 (impliziter Deny)", rows("authenticated", A, "select job_name from pipeline_locks").n === 0);
check("pipeline_locks: service_role sieht alles", rows("service_role", SVC, "select job_name from pipeline_locks").n === 1);

// service_role sieht ALLE Mandanten + main-auth (Backend/Cron intakt).
check("service_role sieht alle decisions (6)", rows("service_role", SVC, "select id from decisions").n === 6);
check("service_role sieht main-auth", rows("service_role", SVC, "select id from helmut_store where id='main-auth'").n === 1);

console.log("\n════ AUFGABE 8 — Adversarial Retest ════");

// JWT-/Claim-Manipulation: SQL-Injection im Claim-Wert bleibt Literal.
check("Claim-Injection user_id=\"mdb-a' OR '1'='1\" → 0 Zeilen (Literal, kein Bypass)",
  rows("authenticated", { role: "authenticated", user_id: "mdb-a' OR '1'='1" }, "select id from decisions").n === 0);
check("Claim-Injection user_id mit '; drop' → 0 Zeilen, keine Wirkung",
  rows("authenticated", { role: "authenticated", user_id: "x'; drop table decisions; --" }, "select id from decisions").n === 0);

// Claim-Manipulation: gefälschter role=service_role im Claim ändert NICHT die DB-Rolle.
check("gefälschter role=service_role-Claim (DB-Rolle bleibt authenticated) → nur eigener Tenant",
  rows("authenticated", { role: "service_role", user_id: "mdb-a" }, "select id from decisions").n === 2);
check("gefälschter role=service_role-Claim → main-auth bleibt unsichtbar",
  rows("authenticated", { role: "service_role", user_id: "mdb-a" }, "select id from helmut_store where id='main-auth'").n === 0);

// Tenant-Wechsel innerhalb eines Requests: Claims werden je Statement neu gelesen.
{
  const r = queryAs("authenticated", A,
    "select (select count(*) from decisions) as as_a, " +
    "(select set_config('request.jwt.claims', '{\"role\":\"authenticated\",\"user_id\":\"mdb-b\"}', true)) as switch, " +
    "(select count(*) from decisions) as as_b");
  check("Tenant-Wechsel mid-request: erst A(2) dann B(1) — kein Datenleck über den Wechsel",
    r.ok && r.rows[0][0] === "2" && r.rows[0][2] === "1");
}

// RLS-Bypass-Versuche.
check("authenticated kann pg_authid NICHT lesen (Passwort-Hashes)", !queryAs("authenticated", A, "select rolname from pg_authid").ok);
check("authenticated kann RLS auf fremder Tabelle NICHT abschalten", !queryAs("authenticated", A, "alter table office_outputs disable row level security").ok);
check("authenticated kann keine eigene Policy anlegen", !queryAs("authenticated", A, "create policy hack on decisions for all to authenticated using (true)").ok);

// Service-Role-Eskalation: gefälschter Claim verschafft KEINEN service_role-Zugriff
// (bereits oben). Zusätzlich: readonly kommt nicht an service_role-only Daten.
check("readonly kommt nicht an pipeline_locks (service_role-only)",
  noAccess("helmut_readonly", RO_A, "select job_name from pipeline_locks"));

// Replay/Timing sind PostgREST/GoTrue-Layer (exp-Prüfung); DB-seitig dokumentiert:
// abgelaufener exp-Claim wird von der DB NICHT geprüft (auth.jwt() liefert Claims
// unabhängig von exp) — bewusst als Grenze festgehalten.
{
  const r = queryAs("authenticated", { role: "authenticated", user_id: "mdb-a", exp: 1 }, "select id from decisions");
  check("GRENZE: abgelaufener exp-Claim wird DB-seitig NICHT geprüft (PostgREST-Aufgabe) — sieht noch Daten",
    r.ok && r.rowCount === 2);
}

console.log("");
const total = state.pass + state.fail;
if (state.fail === 0) {
  console.log(`${state.pass}/${total} Preview-DB-Assertionen erfolgreich (echte Postgres-16).`);
  process.exit(0);
} else {
  console.log(`${state.fail}/${total} FEHLGESCHLAGEN:`);
  state.failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
