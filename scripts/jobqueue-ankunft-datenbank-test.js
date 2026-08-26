"use strict";

// Helmut — DATENBANKNACHWEIS DER ANKUNFTSKENNZAHL (Skalierungssprint 2026-08-25).
// =============================================================================================
// Prueft die additive Funktion `helmut_job_ankunft` gegen eine ECHTE lokale PostgreSQL.
//
// WOZU DIE FUNKTION UEBERHAUPT: die verbindliche Freigabebedingung der Stufe 2 lautet
// „Abfluss >= Ankunft ueber 7 Tage" (op30-zielarchitektur-2026-08-13.md §14). Die
// bestehende `helmut_job_metrics` liefert nur den ABFLUSS. Ohne Ankunftszaehlung ist der
// siebentaegige Fuenfernachweis nicht messbar.
//
// Ohne lokalen PostgreSQL-Server wird die Suite sauber UEBERSPRUNGEN (kein falsches Gruen).
// Aufruf: HELMUT_TEST_PG_HOST=127.0.0.1 HELMUT_TEST_PG_PORT=5433 HELMUT_TEST_PG_USER=helmut \
//           node scripts/lokal.js scripts/jobqueue-ankunft-datenbank-test.js

const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const BASIS = path.join(ROOT, "supabase", "migrations", "20260808_scalable_job_queue.sql");
const MIGRATION = path.join(ROOT, "supabase", "migrations", "20260825101500_jobqueue_ankunftskennzahl.sql");
const ROLLBACK = path.join(ROOT, "supabase", "migrations", "rollback_20260825101500_jobqueue_ankunftskennzahl.sql");

const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "",
  port: process.env.HELMUT_TEST_PG_PORT || "5433",
  user: process.env.HELMUT_TEST_PG_USER || "helmut",
  db: process.env.HELMUT_TEST_PG_DB_ANKUNFT || "helmut_test_ankunft"
};

let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

function psql(sql, { db = PG.db, datei = null } = {}) {
  const args = ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", db, "-tA", "-v", "ON_ERROR_STOP=1"];
  if (datei) args.push("-f", datei); else args.push("-c", sql);
  return execFileSync("psql", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim();
}

function erreichbar() {
  if (!PG.host || !PG.user) return false;
  try {
    execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", "postgres", "-tAc", "select 1"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch { return false; }
}

function main() {
  console.log("Helmut — Datenbanknachweis der Ankunftskennzahl (Stufe-2-Messgroesse)");
  if (!erreichbar()) {
    console.log("\n== UEBERSPRUNGEN ==");
    console.log("  Kein lokaler PostgreSQL-Server erreichbar (HELMUT_TEST_PG_HOST/USER nicht gesetzt).");
    console.log("  >> Der Datenbanknachweis ist damit OFFEN, nicht erbracht. <<");
    process.exit(0);
  }

  // Die Supabase-Rollen sind clusterweit und in einer blanken lokalen PostgreSQL nicht
  // vorhanden. Ohne sie waere der Rechtenachweis (§6) wertlos — und die Basismigration
  // koennte ihre `revoke ... from anon, authenticated` gar nicht ausfuehren. Deshalb
  // werden sie hier angelegt, falls sie fehlen. NOLOGIN: sie dienen nur der Rechtepruefung.
  // WICHTIG fuer die Naturtreue: `service_role` traegt in Supabase BYPASSRLS.
  // `helmut_jobs` hat RLS eingeschaltet und KEINE Policy — ohne BYPASSRLS saehe die
  // Rolle zwar die Funktion ausfuehren duerfen, aber null Zeilen. Der Nachweis
  // "service_role kann die Kennzahl wirklich lesen" waere dann wertlos.
  for (const [rolle, zusatz] of [["anon", ""], ["authenticated", ""], ["service_role", " bypassrls"]]) {
    psql(`do $$ begin if not exists (select 1 from pg_roles where rolname='${rolle}')`
      + ` then create role ${rolle} nologin${zusatz}; end if; end $$;`, { db: "postgres" });
  }
  // Falls die Rolle aus einem frueheren Lauf ohne BYPASSRLS stammt, nachziehen.
  psql("alter role service_role bypassrls;", { db: "postgres" });

  psql(`drop database if exists ${PG.db}`, { db: "postgres" });
  psql(`create database ${PG.db}`, { db: "postgres" });
  psql(null, { datei: BASIS });

  abschnitt("1 · Die Migration ist anwendbar und additiv");
  const vorher = psql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace"
    + " where n.nspname='public' and p.proname='helmut_job_ankunft'");
  check("1.1 Vor der Migration existiert die Funktion NICHT", vorher === "0", vorher);
  psql(null, { datei: MIGRATION });
  check("1.2 Nach der Migration existiert sie",
    psql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace"
      + " where n.nspname='public' and p.proname='helmut_job_ankunft'") === "1");
  check("1.3 helmut_job_metrics ist UNVERAENDERT vorhanden (rein additiv)",
    psql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace"
      + " where n.nspname='public' and p.proname='helmut_job_metrics'") === "1");
  check("1.4 Die Migration ist wiederholbar (create or replace)",
    (() => { try { psql(null, { datei: MIGRATION }); return true; } catch { return false; } })());

  abschnitt("2 · Leere Warteschlange: unbestimmt statt falsch");
  const leer = JSON.parse(psql("select row_to_json(t) from public.helmut_job_ankunft(1440) t"));
  check("2.1 Ankunft 0", Number(leer.eingereiht_im_zeitraum) === 0);
  check("2.2 Abfluss 0", Number(leer.erledigt_im_zeitraum) === 0);
  check("2.3 Das Verhaeltnis ist NULL (unbestimmt), nicht 0 — kein falsches Rot",
    leer.abflussverhaeltnis === null, JSON.stringify(leer.abflussverhaeltnis));
  check("2.4 Das Fenster wird zurueckgemeldet", Number(leer.fenster_minuten) === 1440);

  abschnitt("3 · Ankunft wird gezaehlt");
  for (let i = 0; i < 7; i += 1) {
    psql("select public.helmut_enqueue_job('source_fetch','ank-" + i + "'::text,'tag'::text,"
      + "'{}'::jsonb, now(), 100::smallint, 5::integer, null::text)");
  }
  const nurAnkunft = JSON.parse(psql("select row_to_json(t) from public.helmut_job_ankunft(1440) t"));
  check("3.1 Sieben eingereihte Auftraege werden als Ankunft gezaehlt",
    Number(nurAnkunft.eingereiht_im_zeitraum) === 7, String(nurAnkunft.eingereiht_im_zeitraum));
  check("3.2 Der Abfluss ist noch 0", Number(nurAnkunft.erledigt_im_zeitraum) === 0);
  check("3.3 Das Verhaeltnis ist 0 — Ankunft ohne Abfluss ist der ECHTE Rueckstaufall",
    Number(nurAnkunft.abflussverhaeltnis) === 0, String(nurAnkunft.abflussverhaeltnis));

  abschnitt("4 · Abfluss wird gezaehlt und das Verhaeltnis stimmt");
  const ids = psql("select id from public.helmut_jobs order by created_at limit 4").split("\n").filter(Boolean);
  for (const id of ids) {
    psql(`select public.helmut_claim_jobs('t-owner',1,60000,null)`);
    psql(`update public.helmut_jobs set status='erledigt', finished_at=now(),`
      + ` lease_owner=null, lease_expires_at=null where id='${id}'`);
  }
  const gemischt = JSON.parse(psql("select row_to_json(t) from public.helmut_job_ankunft(1440) t"));
  check("4.1 Ankunft bleibt 7", Number(gemischt.eingereiht_im_zeitraum) === 7);
  check("4.2 Abfluss ist 4", Number(gemischt.erledigt_im_zeitraum) === 4, String(gemischt.erledigt_im_zeitraum));
  check("4.3 Verhaeltnis 4/7 = 0,5714", Math.abs(Number(gemischt.abflussverhaeltnis) - (4 / 7)) < 0.0001,
    String(gemischt.abflussverhaeltnis));
  check("4.4 Abfluss < Ankunft wird als Rueckstau sichtbar (Verhaeltnis < 1)",
    Number(gemischt.abflussverhaeltnis) < 1);

  abschnitt("5 · Das Zeitfenster wirkt");
  psql("update public.helmut_jobs set created_at = now() - interval '3 days' where idempotency_key in ('ank-5','ank-6')");
  const engesFenster = JSON.parse(psql("select row_to_json(t) from public.helmut_job_ankunft(1440) t"));
  check("5.1 Auftraege ausserhalb des Fensters zaehlen NICHT zur Ankunft",
    Number(engesFenster.eingereiht_im_zeitraum) === 5, String(engesFenster.eingereiht_im_zeitraum));
  const weitesFenster = JSON.parse(psql("select row_to_json(t) from public.helmut_job_ankunft(10080) t"));
  check("5.2 Im 7-Tage-Fenster zaehlen sie wieder mit",
    Number(weitesFenster.eingereiht_im_zeitraum) === 7, String(weitesFenster.eingereiht_im_zeitraum));
  check("5.3 Das 7-Tage-Fenster meldet 10080 Minuten", Number(weitesFenster.fenster_minuten) === 10080);

  abschnitt("6 · Rechte: service_role JA, alle anderen NEIN");
  // Review-Befund 1 (2026-08-25/2): der blosse Entzug genuegt nicht. PostgreSQL erteilt
  // `execute` bei der Anlage an PUBLIC; `revoke ... from public` nimmt das weg — und
  // service_role ist KEIN Superuser. Ohne ausdrueckliche Berechtigung koennte NIEMAND
  // die Funktion aufrufen, die Migration waere in Production wirkungslos. Dieser
  // Abschnitt prueft deshalb BEIDE Richtungen an einer ECHTEN Rolle.
  const rolleDa = psql("select count(*) from pg_roles where rolname='service_role'") === "1";
  check("6.0 Die Rolle service_role steht fuer den Nachweis zur Verfuegung", rolleDa,
    rolleDa ? "vorhanden" : "FEHLT — der Rechtenachweis waere sonst wertlos");

  const rechte = psql("select count(*) from information_schema.routine_privileges"
    + " where routine_name='helmut_job_ankunft' and grantee in ('anon','authenticated','PUBLIC')");
  check("6.1 Keine Rechte fuer anon/authenticated/PUBLIC", rechte === "0", rechte);

  const gewaehrt = psql("select count(*) from information_schema.routine_privileges"
    + " where routine_name='helmut_job_ankunft' and grantee='service_role' and privilege_type='EXECUTE'");
  check("6.2 service_role hat ausdruecklich EXECUTE", gewaehrt === "1", gewaehrt);

  // Der eigentliche Beweis: der echte Aufruf unter der echten Rolle.
  // Erwartungswert: nach Abschnitt 5 liegen 5 der 7 Auftraege im 1440-Minuten-Fenster.
  // Der Aufruf muss also nicht nur durchgehen, sondern GENAU DIESEN Wert liefern —
  // sonst waere z. B. ein RLS-bedingtes "0 Zeilen" faelschlich als Erfolg durchgegangen.
  const alsService = (() => {
    try {
      const roh = psql("set role service_role;"
        + " select eingereiht_im_zeitraum from public.helmut_job_ankunft(1440);");
      return { ok: true, wert: String(roh).trim().split("\n").pop().trim() };
    } catch (e) { return { ok: false, wert: String(e && e.message || e).slice(0, 160) }; }
  })();
  check("6.3 service_role kann die Funktion TATSAECHLICH ausfuehren UND liest den echten Wert",
    alsService.ok && alsService.wert === "5", `gelesen: ${alsService.wert} (erwartet 5)`);

  // Gegenprobe: die gesperrten Rollen duerfen es nicht — sonst waere der Entzug wertlos.
  for (const rolle of ["anon", "authenticated"]) {
    const versuch = (() => {
      try {
        psql(`set role ${rolle}; select 1 from public.helmut_job_ankunft(1440);`);
        return "DURCHGELASSEN";
      } catch (e) { return String(e && e.message || e); }
    })();
    check(`6.4 ${rolle} wird beim Aufruf abgewiesen`,
      /permission denied/i.test(versuch), versuch.slice(0, 90));
  }

  // Gleichbehandlung mit dem Vorbild: helmut_job_metrics traegt dasselbe Rechtemuster.
  const wieVorbild = psql("select count(*) from information_schema.routine_privileges"
    + " where routine_name='helmut_job_metrics' and grantee='service_role' and privilege_type='EXECUTE'");
  check("6.5 Dasselbe Rechtemuster wie das Vorbild helmut_job_metrics",
    wieVorbild === gewaehrt, `Vorbild ${wieVorbild} · neu ${gewaehrt}`);

  abschnitt("7 · Datensparsamkeit");
  const spalten = psql("select string_agg(a.attname, ',' order by a.attnum) from pg_proc p"
    + " join pg_namespace n on n.oid=p.pronamespace"
    + " join unnest(p.proallargtypes, p.proargnames) with ordinality as a(atttypid, attname, attnum) on true"
    + " where n.nspname='public' and p.proname='helmut_job_ankunft'");
  check("7.1 Die Funktion gibt ausschliesslich Zaehler und das Fenster zurueck — keine Nutzlast",
    !/payload|tenant|mandat|last_error|idempotency/i.test(String(spalten)), String(spalten));

  abschnitt("8 · Rollback stellt den Ausgangszustand her");
  psql(null, { datei: ROLLBACK });
  check("8.1 Die Funktion ist weg",
    psql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace"
      + " where n.nspname='public' and p.proname='helmut_job_ankunft'") === "0");
  check("8.2 helmut_job_metrics ist unberuehrt geblieben",
    psql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace"
      + " where n.nspname='public' and p.proname='helmut_job_metrics'") === "1");
  check("8.3 Die Auftragsdaten sind unveraendert (Rollback ohne Datenverlust)",
    psql("select count(*) from public.helmut_jobs") === "7");
  check("8.4 Der Rollback ist idempotent",
    (() => { try { psql(null, { datei: ROLLBACK }); return true; } catch { return false; } })());

  psql(`drop database if exists ${PG.db}`, { db: "postgres" });

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  if (fail === 0) console.log("Ankunftskennzahl belegt: echter PostgreSQL-Server, echte Migration, echter Rollback.");
  process.exit(fail === 0 ? 0 : 1);
}

try {
  main();
} catch (error) {
  console.error("TESTLAUF-FEHLER:", error && error.message);
  try { psql(`drop database if exists ${PG.db}`, { db: "postgres" }); } catch { /* egal */ }
  process.exit(1);
}
