"use strict";

// Helmut — DATENBANKNACHWEIS der berichtigten Altersmessung (OP-30, 2026-08-12).
// =============================================================================================
// WAS DIESE SUITE IST:
//   Der Nachweis, dass `supabase/migrations/20260812_jobqueue_altersmessung.sql` gegen einen
//   ECHTEN PostgreSQL-Server das tut, was `jobqueue-alter-test.js` gegen die Attrappe zusagt —
//   inklusive des FEHLBEFUNDES vom 2026-08-11, der hier zuerst mit der ALTEN Fassung der
//   Funktion reproduziert und danach mit der NEUEN widerlegt wird.
//
//   Sie prueft ausserdem den Rollback und die Rechte (die Funktion wird gedroppt und neu
//   angelegt — dabei duerfen `anon`/`authenticated` kein Ausfuehrungsrecht zurueckbekommen).
//
//   Sie laeuft NUR, wenn ein lokaler PostgreSQL-Server erreichbar ist. Ist keiner da, meldet
//   sie den Datenbanknachweis ausdruecklich als OFFEN und endet mit Exit 0 — sie taeuscht kein
//   Gruen vor und behauptet keinen Fehlschlag, den es nicht gibt (gleiche Regel wie
//   `jobqueue-datenbank-test.js`).
//
// KONFIGURATION (alles ueber Env, keine Geheimnisse):
//   HELMUT_TEST_PG_HOST  Socket-Verzeichnis oder Host (ohne Wert -> Suite uebersprungen)
//   HELMUT_TEST_PG_PORT  Default 5433
//   HELMUT_TEST_PG_USER  Default helmut
//   HELMUT_TEST_PG_DB_ALTER  Default helmut_test_alter (EIGENE Datenbank je Suite — belegter
//                            Anlass 2026-08-08: geteilte Datenbanken reissen sich gegenseitig
//                            die Tabelle weg, weil beide Rollback + Migration neu einspielen)
//
// OFFLINE: `psql` verbindet ausschliesslich lokal. Kein externes Netz, keine KI, keine Kosten.

const { execFileSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const M = (name) => path.join(ROOT, "supabase", "migrations", name);
const BASIS = M("20260808_scalable_job_queue.sql");
const BASIS_ROLLBACK = M("20260808_scalable_job_queue_rollback.sql");
const ALTER = M("20260812_jobqueue_altersmessung.sql");
const ALTER_ROLLBACK = M("20260812_jobqueue_altersmessung_rollback.sql");

const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "",
  port: process.env.HELMUT_TEST_PG_PORT || "5433",
  user: process.env.HELMUT_TEST_PG_USER || "helmut",
  db: process.env.HELMUT_TEST_PG_DB_ALTER || "helmut_test_alter"
};

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(titel) { console.log(`\n== ${titel} ==`); }

function psql(sql, { datei = null, db = PG.db } = {}) {
  const args = ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", db,
    "-v", "ON_ERROR_STOP=1", "-tAq"];
  if (datei) args.push("-f", datei); else args.push("-c", sql);
  return execFileSync("psql", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function servererreichbar() {
  if (!PG.host) return false;
  try {
    execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", "postgres",
      "-tAc", "select 1"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch (_) { return false; }
}

// Der Production-Fall vom 2026-08-11 20:04 UTC, nachgestellt: fuenf `person-archiv`-Auftraege,
// heute erzeugt, mit der Faelligkeit des laufenden 7-Tage-Fensters (2026-08-06T00Z), plus ein
// frischer geteilter Auftrag. KEIN Auftrag ist wirklich alt.
const PRODUKTIONSFALL = `
  delete from public.helmut_jobs;
  insert into public.helmut_jobs
    (job_type, idempotency_key, freshness_window, payload, due_at, first_due_at, created_at, tenant_id, priority)
  select 'source_fetch', 'archiv-' || t.id, '2026-08-06T00Z', '{"art":"person-archiv"}'::jsonb,
         now() - (interval '5.84 days') + (t.rn * interval '30.25 hours'),
         now() - (interval '5.84 days') + (t.rn * interval '30.25 hours'),
         now(), t.id, 300
    from (values ('m-1',0),('m-2',1),('m-3',2),('m-4',3),('m-5',4)) as t(id, rn);
  insert into public.helmut_jobs
    (job_type, idempotency_key, freshness_window, payload, due_at, first_due_at, created_at, tenant_id)
  values ('source_fetch', 'geteilt-1', '2026-08-11T16Z', '{"art":"geteilt"}'::jsonb,
          now() - interval '10 minutes', now() - interval '10 minutes', now(), null);
`;

function messwerte(spalten) {
  const sql = `select ${spalten} from public.helmut_job_metrics(1440);`;
  return psql(sql).split("|").map((s) => s.trim());
}

function main() {
  console.log("Helmut — Datenbanknachweis der berichtigten Altersmessung (OP-30, 2026-08-12)");

  if (!servererreichbar()) {
    console.log("\n== UEBERSPRUNGEN ==");
    console.log("  Kein lokaler PostgreSQL-Server erreichbar (HELMUT_TEST_PG_HOST nicht gesetzt");
    console.log("  oder Verbindung nicht moeglich).");
    console.log("  >> DER DATENBANKNACHWEIS DER ALTERSMESSUNG IST DAMIT OFFEN, NICHT ERBRACHT. <<");
    console.log("  Er wird NICHT durch die Attrappen-Suite jobqueue-alter-test.js ersetzt.");
    console.log("\n== ERGEBNIS ==\nPASS 0  FAIL 0  (uebersprungen, Nachweis offen)");
    process.exit(0);
  }

  console.log(`  Server: ${PG.host}:${PG.port}/${PG.db} als ${PG.user}`);
  try {
    execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", "postgres",
      "-tAc", `create database ${PG.db}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (_) { /* existiert bereits */ }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("1 · Der Fehlbefund vom 2026-08-11, an echter PostgreSQL reproduziert");
  psql(null, { datei: BASIS_ROLLBACK });
  psql(null, { datei: BASIS });
  check("1.1 Basismigration 20260808 laeuft durch", true);
  psql(PRODUKTIONSFALL);

  const [altAelteste, altMandat, altUeberfaellig] =
    messwerte("round(aeltester_faelliger_s), round(max_mandatsalter_s), ueberfaellige_mandate");
  const altTage = Number(altMandat) / 86400;
  check("1.2 ALTE Fassung meldet fuer sechs frische Auftraege ~5,84 Tage Alter",
    altTage > 5.8 && altTage < 5.9, `${altTage.toFixed(2)} Tage (${altMandat} s)`);
  check("1.3 ALTE Fassung meldet auch `aeltester_faelliger_s` ueber 24 h",
    Number(altAelteste) > 24 * 3600, `${altAelteste} s`);
  check("1.4 ALTE Fassung meldet vier ueberfaellige Mandate",
    Number(altUeberfaellig) === 4, altUeberfaellig);

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("2 · Nach 20260812: dieselben Daten, ehrliches Ergebnis");
  psql(null, { datei: ALTER });
  check("2.1 Migration 20260812 laeuft durch", true);

  const [neuOffen, neuMandat, neuUeberfaellig, faellig, faelligUeberfaellig] = messwerte(
    "round(aeltester_offener_s), round(max_mandatswartezeit_s), ueberfaellige_mandate_wartezeit,"
    + " round(max_mandatsalter_s), ueberfaellige_mandate");
  check("2.2 Die tatsaechliche Wartezeit ist 0 s (Abnahmekriterium 2)",
    Number(neuOffen) === 0 && Number(neuMandat) === 0, `${neuOffen} / ${neuMandat}`);
  check("2.3 Kein Mandat wartet ueberfaellig", Number(neuUeberfaellig) === 0, neuUeberfaellig);
  check("2.4 Der FAELLIGKEITSRUECKSTAND bleibt unveraendert sichtbar (kein Vertuschen)",
    Number(faellig) === Number(altMandat) && Number(faelligUeberfaellig) === 4,
    `${faellig} s / ${faelligUeberfaellig} Mandate`);

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("3 · Echte Ueberalterung wird weiterhin erkannt (Abnahmekriterium 3)");
  psql(`insert into public.helmut_jobs
          (job_type, idempotency_key, freshness_window, payload, due_at, first_due_at, created_at, tenant_id)
        values ('mandate_projection', 'wirklich-alt', '2026-08-09T00Z', '{}'::jsonb,
                now() - interval '30 hours', now() - interval '30 hours',
                now() - interval '30 hours', 'm-alt');`);
  const [alt30, ueberfaellig30] =
    messwerte("round(aeltester_offener_s), ueberfaellige_mandate_wartezeit");
  check("3.1 Ein 30 h alter Auftrag wird mit 30 h gemessen",
    Math.abs(Number(alt30) - 30 * 3600) < 60, `${alt30} s`);
  check("3.2 Sein Mandat gilt als ueberfaellig", Number(ueberfaellig30) === 1, ueberfaellig30);

  // Zurueckstellen darf den Rueckstand NICHT loeschen (belegter Fehler 2026-08-08).
  psql(`update public.helmut_jobs set due_at = now() + interval '2 minutes'
         where idempotency_key = 'wirklich-alt';`);
  const [nachDefer, ueberfaelligNachDefer] =
    messwerte("round(aeltester_offener_s), ueberfaellige_mandate_wartezeit");
  check("3.3 Zurueckstellen (due_at nach vorn) loescht den Rueckstand NICHT",
    Math.abs(Number(nachDefer) - 30 * 3600) < 60, `${nachDefer} s`);
  check("3.4 Das Mandat bleibt ueberfaellig", Number(ueberfaelligNachDefer) === 1, ueberfaelligNachDefer);

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("4 · Zustaende, Leases und Grenzfaelle");
  psql(`update public.helmut_jobs set status='erledigt', finished_at=now()
         where idempotency_key='wirklich-alt';`);
  // Es bleiben die sechs frischen Auftraege aus Abschnitt 1 offen — ihre Wartezeit ist die
  // reine Laufzeit dieser Suite (Sekunden). Verglichen wird deshalb gegen „deutlich unter
  // einer Minute", nicht gegen exakt 0: eine Uhr, die waehrend des Tests laeuft, ist kein
  // Fehler, und ein Test, der davon abhaengt, waere flatterhaft.
  const nachErledigt = Number(messwerte("round(aeltester_offener_s)")[0]);
  check("4.1 Ein ERLEDIGTER Auftrag altert nicht mehr mit",
    nachErledigt < 60, `${nachErledigt} s`);

  psql(`update public.helmut_jobs
           set status='laeuft', finished_at=null, lease_owner='w',
               lease_expires_at=now() + interval '10 minutes'
         where idempotency_key='wirklich-alt';`);
  const [laufend, aktiveLeases] = messwerte("round(aeltester_offener_s), aktive_leases");
  check("4.2 Ein LAUFENDER Auftrag mit gueltiger Lease zaehlt weiter als offene Arbeit",
    Math.abs(Number(laufend) - 30 * 3600) < 60, `${laufend} s`);
  check("4.3 Die Lease wird getrennt ausgewiesen", Number(aktiveLeases) === 1, aktiveLeases);

  psql(`update public.helmut_jobs set status='fehlgeschlagen', attempts=5, max_attempts=5,
               lease_owner=null, lease_expires_at=null, finished_at=now()
         where idempotency_key='wirklich-alt';`);
  const [nachFehler, endgueltig] = messwerte("round(aeltester_offener_s), endgueltig_fehler");
  check("4.4 Ein endgueltig gescheiterter Auftrag faellt aus der Altersmessung …",
    Number(nachFehler) < 60, `${nachFehler} s`);
  check("4.5 … bleibt aber als endgueltiger Fehler sichtbar",
    Number(endgueltig) === 1, endgueltig);

  // Zukuenftige Bearbeitbarkeit: nie eine negative Wartezeit.
  psql(`delete from public.helmut_jobs;
        insert into public.helmut_jobs
          (job_type, idempotency_key, freshness_window, payload, due_at, first_due_at, created_at, tenant_id)
        values ('mandate_projection', 'zukunft', '2026-08-12T00Z', '{}'::jsonb,
                now() + interval '6 hours', now() + interval '6 hours', now(), 'm-z');`);
  const [zukunft, zukunftMandat] =
    messwerte("round(aeltester_offener_s), round(max_mandatswartezeit_s)");
  check("4.6 Ein erst spaeter bearbeitbarer Auftrag wartet 0 s, nie negativ",
    Number(zukunft) === 0 && Number(zukunftMandat) === 0, `${zukunft} / ${zukunftMandat}`);
  check("4.7 …und die uebrigen Auftraege sind vorher geloescht (der Fall ist rein)",
    psql("select count(*) from public.helmut_jobs;") === "1");

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("5 · Vertragstreue: alte Spalten, Rechte, Rollback");
  const spalten = psql(`select string_agg(a.attname, ',' order by a.attnum)
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     join unnest(p.proallargtypes, p.proargmodes, p.proargnames)
          with ordinality as a(atttypid, attmode, attname, attnum) on true
    where n.nspname='public' and p.proname='helmut_job_metrics' and a.attmode='t';`);
  const liste = spalten.split(",");
  const erwartetAlt = ["wartend", "laufend", "erledigt_im_zeitraum", "fehlgeschlagen_gesamt",
    "endgueltig_fehler", "wiederholungen", "aktive_leases", "aeltester_faelliger_s",
    "durchsatz_pro_stunde", "mittlere_dauer_s", "nach_typ", "nach_status",
    "ueberfaellige_mandate", "max_mandatsalter_s"];
  check("5.1 Die 14 bisherigen Spalten stehen unveraendert an ihrer Stelle",
    erwartetAlt.every((name, i) => liste[i] === name), liste.slice(0, 14).join(","));
  check("5.2 Die drei Wartezeit-Spalten sind ergaenzt",
    liste.slice(14).join(",") === "aeltester_offener_s,max_mandatswartezeit_s,ueberfaellige_mandate_wartezeit",
    liste.slice(14).join(","));

  const rechte = psql(`select count(*) from information_schema.role_routine_grants
     where routine_name='helmut_job_metrics' and grantee in ('anon','authenticated','PUBLIC');`);
  check("5.3 anon/authenticated/PUBLIC haben nach DROP+CREATE KEIN Ausfuehrungsrecht",
    rechte === "0", rechte);

  psql(null, { datei: ALTER });
  check("5.4 Die Migration ist wiederholbar (idempotent)", true);

  psql(null, { datei: ALTER_ROLLBACK });
  const nachRollback = psql(`select count(*)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     join unnest(p.proargmodes, p.proargnames) as a(attmode, attname) on true
    where n.nspname='public' and p.proname='helmut_job_metrics'
      and a.attname = 'aeltester_offener_s';`);
  check("5.5 Der Rollback entfernt die neuen Spalten wieder", nachRollback === "0", nachRollback);
  const nachRollbackSpalten = psql(`select count(*)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     join unnest(p.proargmodes, p.proargnames) as a(attmode, attname) on true
    where n.nspname='public' and p.proname='helmut_job_metrics'
      and a.attname = 'max_mandatsalter_s';`);
  check("5.6 …und stellt die alte Fassung vollstaendig wieder her", nachRollbackSpalten === "1",
    nachRollbackSpalten);
  psql(null, { datei: ALTER_ROLLBACK });
  check("5.7 Auch der Rollback ist wiederholbar", true);

  // Aufraeumen: Basiszustand wiederherstellen, damit ein zweiter Lauf sauber startet.
  psql(null, { datei: BASIS_ROLLBACK });

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

try {
  main();
} catch (error) {
  console.error(String((error && error.stderr) || (error && error.message) || error));
  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail + 1}`);
  process.exit(1);
}
