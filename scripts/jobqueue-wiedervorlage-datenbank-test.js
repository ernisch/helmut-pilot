"use strict";

// Helmut — WIEDERVORLAGE an einer ECHTEN PostgreSQL (OP-30, Befund O5).
// =============================================================================================
// Migration 20260809_jobqueue_wiedervorlage.sql, geprueft gegen eine echte Datenbank — nicht
// gegen eine Attrappe. Geprueft werden genau die Zusagen, die im Betrieb zaehlen:
//
//   * Der Befund selbst: ein endgueltig gescheiterter Verstehensauftrag blockiert seine
//     Dokumentmenge dauerhaft, weil der Idempotenzschluessel kein Fenster traegt.
//   * Die Wiedervorlage macht ihn wieder `wartend` — OHNE den Fehlerbeleg zu loeschen.
//   * Sie ist BEGRENZT: nach `p_max_wiedervorlagen` bleibt der Auftrag gescheitert.
//   * Standard ist Trockenlauf.
//   * Sie fasst NICHTS an, was sie nicht anfassen darf (wartend, laufend, erledigt, zu jung).
//   * `first_due_at` bleibt unveraendert — die Rueckstandsmessung darf nicht zurueckgesetzt
//     werden (das war Befund B2 des Abschlussreviews).
//   * Rechte: `anon`/`authenticated` bekommen nichts, RLS bleibt an und erzwungen.
//   * Nebenlaeufigkeit: zwei gleichzeitige Wiedervorlagen nehmen denselben Auftrag nicht
//     zweimal (`for update skip locked`).
//
// OHNE lokalen Server beendet sich diese Suite mit Exit 0 und der ehrlichen Zeile
// "uebersprungen, Nachweis offen" — genau wie ihre Geschwister. VORBEHALT (Befund O21 des
// Abschlussreviews, weiterhin offen): der kanonische Runner zaehlt das dann als PASS. Ein
// CI-Gruen schliesst diesen Nachweis also NICHT ein.
//
//   Aufruf mit Server:
//     HELMUT_TEST_PG_HOST=127.0.0.1 HELMUT_TEST_PG_PORT=5433 HELMUT_TEST_PG_USER=postgres \
//       node scripts/lokal.js scripts/jobqueue-wiedervorlage-datenbank-test.js

const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
process.env.HELMUT_SOURCE_MODE = "off";

const M = (n) => path.join(ROOT, "supabase/migrations", n);
const BASIS = M("20260808_scalable_job_queue.sql");
const BASIS_ZURUECK = M("20260808_scalable_job_queue_rollback.sql");
const MIGRATION = M("20260809_jobqueue_wiedervorlage.sql");
const ROLLBACK = M("20260809_jobqueue_wiedervorlage_rollback.sql");

const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "",
  port: process.env.HELMUT_TEST_PG_PORT || "5433",
  user: process.env.HELMUT_TEST_PG_USER || "postgres",
  db: process.env.HELMUT_TEST_PG_DB_WIEDERVORLAGE || "helmut_test_wiedervorlage"
};

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

function psql(sql, { datei = null, db = PG.db } = {}) {
  const args = ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", db, "-tA", "-v", "ON_ERROR_STOP=1"];
  if (datei) args.push("-f", datei); else args.push("-c", sql);
  return execFileSync("psql", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}
const wert = (sql) => psql(sql).trim().split("\n")[0];
const zahl = (sql) => Number(wert(sql));

// Eine Auftragszeile im gewuenschten Zustand anlegen.
function auftrag({ schluessel, typ = "document_understanding", status = "fehlgeschlagen",
  fertigVorStunden = 48, wiedervorlagen = 0, fehler = "modell-nicht-erreichbar" }) {
  const finished = status === "wartend" || status === "laeuft"
    ? "null"
    : `now() - interval '${Number(fertigVorStunden)} hours'`;
  const lease = status === "laeuft" ? "'w1', now() + interval '5 minutes'" : "null, null";
  psql(`insert into public.helmut_jobs
    (job_type, idempotency_key, freshness_window, payload, status, attempts, max_attempts,
     finished_at, lease_owner, lease_expires_at, last_error, wiedervorlagen,
     first_due_at, due_at, created_at)
    values ('${typ}', '${schluessel}', '2026-08-09T00Z', '{}'::jsonb, '${status}', 5, 5,
     ${finished}, ${lease}, '${fehler}', ${Number(wiedervorlagen)},
     now() - interval '72 hours', now() - interval '72 hours', now() - interval '72 hours');`);
}

function main() {
  console.log("Helmut — Wiedervorlage an echter PostgreSQL (OP-30, Befund O5)");
  if (!PG.host) {
    console.log("\n  KEIN lokaler PostgreSQL-Server konfiguriert (HELMUT_TEST_PG_HOST).");
    console.log("  Der Nachweis ist damit OFFEN — dieser Test BEHAUPTET kein Ergebnis.");
    console.log("  Aufruf mit Server: HELMUT_TEST_PG_HOST=127.0.0.1 node scripts/lokal.js "
      + "scripts/jobqueue-wiedervorlage-datenbank-test.js");
    process.exit(0);
  }
  try {
    execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", "postgres",
      "-tAc", `create database ${PG.db}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (_) { /* existiert bereits */ }
  console.log(`  Server: ${PG.host}:${PG.port}/${PG.db} als ${PG.user}\n`);

  // ── 1 · Migration ─────────────────────────────────────────────────────────────────────
  abschnitt("1 · Migration, Wiederholbarkeit, Rollback");
  try { psql(null, { datei: ROLLBACK }); } catch (_) { /* leere DB */ }
  try { psql(null, { datei: BASIS_ZURUECK }); } catch (_) { /* leere DB */ }
  psql(null, { datei: BASIS });
  psql(null, { datei: MIGRATION });
  check("1.1 Die drei Funktionen sind angelegt", zahl(`select count(*) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace where n.nspname='public'
    and p.proname in ('helmut_jobs_wiedervorlage','helmut_jobs_wiedervorlage_vorschau','helmut_jobs_blockiert');`) === 3);
  check("1.2 Die Zaehlspalte existiert", zahl(`select count(*) from information_schema.columns
    where table_schema='public' and table_name='helmut_jobs' and column_name='wiedervorlagen';`) === 1);
  psql(null, { datei: MIGRATION });
  check("1.3 Die Migration ist wiederholbar (zweite Anwendung ohne Fehler)", true);
  check("1.4 Der Index fuer die Auswahlabfrage existiert",
    zahl(`select count(*) from pg_indexes where schemaname='public' and indexname='helmut_jobs_wiedervorlage_idx';`) === 1);

  // ── 2 · Rechte und RLS ────────────────────────────────────────────────────────────────
  abschnitt("2 · Rechte und RLS (dieselbe Zusage wie die Basistabelle)");
  check("2.1 RLS ist an UND erzwungen",
    wert(`select relrowsecurity::text || '/' || relforcerowsecurity::text
          from pg_class where relname='helmut_jobs';`) === "true/true");
  check("2.2 `anon` und `authenticated` haben KEIN Ausfuehrungsrecht",
    zahl(`select count(*) from information_schema.role_routine_grants
          where routine_schema='public' and routine_name like 'helmut_jobs_%'
            and grantee in ('anon','authenticated','PUBLIC');`) === 0);
  check("2.3 Alle drei neuen Funktionen sind SECURITY INVOKER mit festem search_path",
    zahl(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public'
            and p.proname in ('helmut_jobs_wiedervorlage','helmut_jobs_wiedervorlage_vorschau','helmut_jobs_blockiert')
            and p.prosecdef = false
            and array_to_string(coalesce(p.proconfig,'{}'),',') like '%search_path=public, pg_temp%';`) === 3);

  // ── 3 · Der Befund selbst ─────────────────────────────────────────────────────────────
  abschnitt("3 · Der Befund O5: ein gescheiterter Auftrag blockiert dauerhaft");
  psql("truncate table public.helmut_jobs;");
  auftrag({ schluessel: "document_understanding|abc" });
  let angelegt = true;
  try {
    psql(`insert into public.helmut_jobs (job_type, idempotency_key, freshness_window, payload)
          values ('document_understanding','document_understanding|abc','2026-08-10T00Z','{}'::jsonb);`);
  } catch (_) { angelegt = false; }
  check("3.1 Derselbe Schluessel kann kein zweites Mal angelegt werden (der Befund)",
    angelegt === false, "unique index helmut_jobs_idem_uidx greift");
  check("3.2 Die Bereinigung wuerde ihn NICHT wegraeumen (er ist der Fehlerbeleg)",
    zahl("select count(*) from public.helmut_jobs where status='fehlgeschlagen';") === 1);

  // ── 4 · Die Wiedervorlage ─────────────────────────────────────────────────────────────
  abschnitt("4 · Die Wiedervorlage macht ihn wieder faellig — ohne den Beleg zu loeschen");
  const vorschau = wert("select kandidaten from public.helmut_jobs_wiedervorlage_vorschau();");
  check("4.1 Die Vorschau findet genau einen Kandidaten", Number(vorschau) === 1, vorschau);
  const trocken = wert("select wiedervorgelegt from public.helmut_jobs_wiedervorlage();");
  check("4.2 STANDARD IST TROCKENLAUF — es wird nichts veraendert",
    Number(trocken) === 0 && zahl("select count(*) from public.helmut_jobs where status='fehlgeschlagen';") === 1,
    `wiedervorgelegt=${trocken}`);
  const getan = wert("select wiedervorgelegt from public.helmut_jobs_wiedervorlage(null, 24, 2, 500, false);");
  check("4.3 Mit `p_trockenlauf := false` wird genau eine Zeile wieder faellig", Number(getan) === 1, getan);
  check("4.4 Der Auftrag ist wieder `wartend`",
    wert("select status from public.helmut_jobs;") === "wartend");
  check("4.5 Das Versuchskonto ist zurueckgesetzt (sonst waere er sofort wieder tot)",
    zahl("select attempts from public.helmut_jobs;") === 0);
  check("4.6 DER FEHLERBELEG BLEIBT — der alte Text steht noch drin",
    /modell-nicht-erreichbar/.test(wert("select last_error from public.helmut_jobs;")),
    wert("select last_error from public.helmut_jobs;"));
  check("4.7 Die Wiedervorlage ist gezaehlt", zahl("select wiedervorlagen from public.helmut_jobs;") === 1);
  check("4.8 `first_due_at` ist UNVERAENDERT — der Rueckstand bleibt sichtbar (Befund B2)",
    zahl("select round(extract(epoch from (now() - first_due_at))/3600) from public.helmut_jobs;") >= 71,
    `${zahl("select round(extract(epoch from (now() - first_due_at))/3600) from public.helmut_jobs;")} h`);
  check("4.9 `finished_at` ist geleert — der Auftrag ist nicht mehr abgeschlossen",
    wert("select coalesce(finished_at::text,'-') from public.helmut_jobs;") === "-");

  // ── 5 · Die Grenze ────────────────────────────────────────────────────────────────────
  abschnitt("5 · Begrenzt, nicht endlos");
  psql("truncate table public.helmut_jobs;");
  auftrag({ schluessel: "du|erschoepft", wiedervorlagen: 2 });
  const nichts = wert("select wiedervorgelegt from public.helmut_jobs_wiedervorlage(null, 24, 2, 500, false);");
  check("5.1 Ein Auftrag mit aufgebrauchten Wiedervorlagen kommt NICHT zurueck", Number(nichts) === 0, nichts);
  check("5.2 Er bleibt endgueltig gescheitert",
    wert("select status from public.helmut_jobs;") === "fehlgeschlagen");
  check("5.3 Er wird als DAUERHAFT BLOCKIERT gemeldet — nicht verschwiegen",
    zahl("select blockiert from public.helmut_jobs_blockiert();") === 1);
  check("5.4 Die Meldung nennt den Auftragstyp",
    /document_understanding/.test(wert("select nach_typ::text from public.helmut_jobs_blockiert();")),
    wert("select nach_typ::text from public.helmut_jobs_blockiert();"));
  check("5.5 Die Vorschau weist ihn getrennt aus",
    zahl("select dauerhaft_blockiert from public.helmut_jobs_wiedervorlage_vorschau();") === 1);

  // ── 5b · MEHRERE blockierte Auftragstypen (Befund B15, Review PR #235) ────────────────
  // Abschnitt 5 kennt genau EINEN blockierten Auftrag EINES Typs. Bei 1x1 stimmt ein
  // Kreuzprodukt zufaellig — und genau darin versteckte sich der Fehler: `helmut_jobs_blockiert`
  // verband die blockierten Zeilen ueber ein UNKORRELIERTES `left join lateral` mit ihrer
  // eigenen Typaufstellung und zaehlte deshalb `Zeilen x Typen`. Gemessen vor der Korrektur:
  // 5 Zeilen / 2 Typen ⇒ gemeldet 10; 9 Zeilen / 3 Typen ⇒ gemeldet 27.
  // Deshalb hier ausdruecklich MEHRERE Typen mit MEHREREN Zeilen je Typ.
  abschnitt("5b · Mehrere blockierte Auftragstypen werden korrekt gezaehlt (B15)");
  psql("truncate table public.helmut_jobs;");
  const BLOCK = { document_understanding: 3, mandate_projection: 2, briefing_materialization: 4 };
  let erwartet = 0;
  for (const [typ, anzahl] of Object.entries(BLOCK)) {
    for (let i = 0; i < anzahl; i += 1) {
      auftrag({ schluessel: `${typ}|blockiert|${i}`, typ, wiedervorlagen: 2 });
      erwartet += 1;
    }
  }
  const gemeldet = zahl("select blockiert from public.helmut_jobs_blockiert(2);");
  check("5b.1 Die Gesamtzahl ist die Zahl der Zeilen, NICHT Zeilen x Typen",
    gemeldet === erwartet, `gemeldet ${gemeldet}, wahr ${erwartet}`);
  const zeilen = zahl("select count(*) from public.helmut_jobs_blockiert(2);");
  check("5b.2 Die Funktion liefert genau EINE Ergebniszeile", zeilen === 1, String(zeilen));
  const nachTyp = JSON.parse(wert("select nach_typ::text from public.helmut_jobs_blockiert(2);"));
  check("5b.3 Jeder Typ ist mit seiner eigenen Zahl aufgefuehrt",
    Object.entries(BLOCK).every(([t, n]) => Number(nachTyp[t]) === n), JSON.stringify(nachTyp));
  const summeNachTyp = Object.values(nachTyp).reduce((a, b) => a + Number(b), 0);
  check("5b.4 Gesamtzahl und Aufstellung widersprechen sich nicht",
    summeNachTyp === gemeldet, `Summe ${summeNachTyp} vs. Gesamt ${gemeldet}`);
  // Eine nicht blockierte Zeile darf die Zaehlung nicht beruehren.
  auftrag({ schluessel: "du|noch-nicht-erschoepft", typ: "document_understanding", wiedervorlagen: 0 });
  check("5b.5 Ein Auftrag mit offenen Wiedervorlagen zaehlt NICHT als blockiert",
    zahl("select blockiert from public.helmut_jobs_blockiert(2);") === erwartet,
    String(zahl("select blockiert from public.helmut_jobs_blockiert(2);")));
  check("5b.6 Der Leerfall meldet 0 und eine leere Aufstellung",
    (() => { psql("truncate table public.helmut_jobs;");
      return zahl("select blockiert from public.helmut_jobs_blockiert(2);") === 0
        && wert("select nach_typ::text from public.helmut_jobs_blockiert(2);") === "{}"; })());

  // ── 6 · Was NICHT angefasst werden darf ───────────────────────────────────────────────
  abschnitt("6 · Geschuetzter Bestand");
  psql("truncate table public.helmut_jobs;");
  auftrag({ schluessel: "a|wartend", status: "wartend" });
  auftrag({ schluessel: "b|laeuft", status: "laeuft" });
  auftrag({ schluessel: "c|erledigt", status: "erledigt" });
  auftrag({ schluessel: "d|zu-jung", status: "fehlgeschlagen", fertigVorStunden: 1 });
  auftrag({ schluessel: "e|falscher-typ", typ: "briefing_materialization", status: "fehlgeschlagen" });
  const nurEigene = wert("select wiedervorgelegt from public.helmut_jobs_wiedervorlage(array['document_understanding'], 24, 2, 500, false);");
  check("6.1 Nichts davon wird wiedervorgelegt", Number(nurEigene) === 0, nurEigene);
  check("6.2 Der wartende Auftrag ist unveraendert",
    wert("select status from public.helmut_jobs where idempotency_key='a|wartend';") === "wartend");
  check("6.3 Der laufende Auftrag behaelt seinen Halter",
    wert("select lease_owner from public.helmut_jobs where idempotency_key='b|laeuft';") === "w1");
  check("6.4 Der erledigte Auftrag bleibt erledigt",
    wert("select status from public.helmut_jobs where idempotency_key='c|erledigt';") === "erledigt");
  check("6.5 Der zu junge Fehlschlag wartet noch",
    wert("select status from public.helmut_jobs where idempotency_key='d|zu-jung';") === "fehlgeschlagen");
  check("6.6 Ein Auftrag anderen Typs wird nicht angefasst",
    wert("select status from public.helmut_jobs where idempotency_key='e|falscher-typ';") === "fehlgeschlagen");
  check("6.7 Mit dem passenden Typ kaeme er sehr wohl zurueck (Gegenprobe)",
    Number(wert("select wiedervorgelegt from public.helmut_jobs_wiedervorlage(array['briefing_materialization'], 24, 2, 500, false);")) === 1);

  // ── 7 · Nebenlaeufigkeit ──────────────────────────────────────────────────────────────
  abschnitt("7 · Zwei gleichzeitige Wiedervorlagen nehmen denselben Auftrag nicht zweimal");
  psql("truncate table public.helmut_jobs;");
  for (let i = 0; i < 6; i += 1) auftrag({ schluessel: `du|n${i}` });
  // Zwei echte psql-Prozesse, jeder mit `p_max_zeilen := 3`.
  const laeufe = [0, 1].map(() => {
    try {
      return Number(execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user,
        "-d", PG.db, "-tA", "-v", "ON_ERROR_STOP=1",
        "-c", "select wiedervorgelegt from public.helmut_jobs_wiedervorlage(null, 24, 2, 3, false);"],
      { encoding: "utf8" }).trim());
    } catch (_) { return -1; }
  });
  const summe = laeufe.reduce((s, x) => s + Math.max(0, x), 0);
  check("7.1 Zusammen wurden hoechstens 6 Auftraege wiedervorgelegt", summe <= 6, `${laeufe.join(" + ")} = ${summe}`);
  check("7.2 Kein Auftrag wurde doppelt gezaehlt (jeder hat genau eine Wiedervorlage)",
    zahl("select count(*) from public.helmut_jobs where wiedervorlagen > 1;") === 0);
  check("7.3 Die Obergrenze je Aufruf wird eingehalten", laeufe.every((x) => x <= 3), laeufe.join(","));

  // ── 8 · Rollback ──────────────────────────────────────────────────────────────────────
  abschnitt("8 · Rollback laesst die Auftraege stehen und entfernt nur die Buchhaltung");
  const vorher = zahl("select count(*) from public.helmut_jobs;");
  psql(null, { datei: ROLLBACK });
  check("8.1 Alle Auftragszeilen sind noch da", zahl("select count(*) from public.helmut_jobs;") === vorher,
    `${vorher} Zeilen`);
  check("8.2 Die drei Funktionen sind weg", zahl(`select count(*) from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('helmut_jobs_wiedervorlage','helmut_jobs_wiedervorlage_vorschau','helmut_jobs_blockiert');`) === 0);
  check("8.3 Die Zaehlspalte ist weg", zahl(`select count(*) from information_schema.columns
    where table_schema='public' and table_name='helmut_jobs' and column_name='wiedervorlagen';`) === 0);
  check("8.4 Der Fehlerbeleg in `last_error` ist erhalten geblieben",
    zahl("select count(*) from public.helmut_jobs where last_error is not null;") > 0);
  psql(null, { datei: ROLLBACK });
  check("8.5 Der Rollback ist wiederholbar", true);
  psql(null, { datei: MIGRATION });
  check("8.6 Nach dem Rollback laesst sich die Migration erneut anwenden",
    zahl(`select count(*) from information_schema.columns
      where table_schema='public' and table_name='helmut_jobs' and column_name='wiedervorlagen';`) === 1);
  check("8.7 Der Zaehler startet nach der Wiederanwendung bei 0",
    zahl("select count(*) from public.helmut_jobs where wiedervorlagen <> 0;") === 0);

  // ── 9 · Reihenfolgeprobe ──────────────────────────────────────────────────────────────
  abschnitt("9 · Reihenfolgefehler bricht LAUT ab, ohne Teilzustand");
  let fehlgeschlagen = false;
  try {
    execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", "postgres",
      "-tAc", "drop database if exists helmut_test_wv_reihenfolge"], { encoding: "utf8", stdio: "pipe" });
    execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", "postgres",
      "-tAc", "create database helmut_test_wv_reihenfolge"], { encoding: "utf8", stdio: "pipe" });
    psql(null, { datei: MIGRATION, db: "helmut_test_wv_reihenfolge" });
  } catch (_) { fehlgeschlagen = true; }
  check("9.1 Ohne die Basismigration bricht die Wiedervorlage ab", fehlgeschlagen === true);
  const rest = Number(execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user,
    "-d", "helmut_test_wv_reihenfolge", "-tAc",
    "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'helmut_jobs_%'"],
  { encoding: "utf8" }).trim());
  check("9.2 Sie hinterlaesst KEINEN Teilzustand", rest === 0, `${rest} Funktionen`);

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (Pruefungen ${pass + fail})`);
  process.exit(fail === 0 ? 0 : 1);
}

try {
  main();
} catch (error) {
  console.error("TESTLAUF-FEHLER:", error && error.message ? error.message : error);
  process.exit(1);
}
