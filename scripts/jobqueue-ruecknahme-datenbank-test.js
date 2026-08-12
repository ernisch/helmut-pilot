"use strict";

// Helmut — DATENBANKNACHWEIS des RÜCKNAHMEVERFAHRENS für offene Warteschlangenaufträge
// (OP-30, Sprint „Altersmessung" 2026-08-12).
// =============================================================================================
// WOFUER DIESE SUITE DA IST:
//
//   Vor dem zweiten OP-30-Aktivierungsversuch muessen die 180 offenen Auftraege aus dem ersten
//   Lauf neutralisiert werden (Begruendung: Runbook §17.7 — doppelte Verarbeitung,
//   48-h-Frist, echte Ueberalterung). Das ist eine PRODUCTION-DATENAENDERUNG und damit
//   freigabepflichtig (CLAUDE.md §5). Eine solche Aenderung darf nur ausgefuehrt werden, wenn
//   ihr Rueckweg NACHWEISLICH funktioniert — nicht, wenn er nur plausibel klingt.
//
//   Diese Suite fuehrt genau den Ablauf aus Runbook §17.8 gegen eine WEGWERFBARE lokale
//   PostgreSQL aus: Export -> Vollstaendigkeitspruefung -> geschuetzte Loeschung ->
//   Wiederherstellung -> Gleichheitspruefung, dazu die drei Abbruchfaelle.
//
//   PRODUCTION WIRD NICHT BERUEHRT. Die Suite legt ihre eigene Datenbank an
//   (`helmut_test_ruecknahme`), fuellt sie selbst und raeumt am Ende auf.
//
//   Ohne erreichbaren lokalen Server meldet sie den Nachweis ausdruecklich als OFFEN und endet
//   mit Exit 0 — kein vorgetaeuschtes Gruen (gleiche Regel wie `jobqueue-datenbank-test.js`).
//
// WAS DER NACHWEIS ZEIGEN MUSS (Abnahme des Sprints):
//   1. erwartete Anzahl VOR dem Export          5. identische Datensaetze nach der Wiederherstellung
//   2. vollstaendiger Export (alle Spalten)     6. keine zusaetzlichen/fehlenden Auftraege
//   3. exakte Loeschanzahl                      7. sicherer Abbruch bei falscher Anzahl
//   4. exakte Wiederherstellungsanzahl             oder bei Schluesselkonflikten
//
// EIN BEFUND, DER HIER SICHTBAR WIRD (und im Runbook benannt ist): der Trigger
// `helmut_jobs_kappen_trg` setzt bei JEDEM Insert `updated_at := now()`. Eine Wiederherstellung
// bei aktivem Trigger ist deshalb in ALLEN fachlich tragenden Feldern identisch, aber
// `updated_at` traegt den Zeitpunkt der Wiederherstellung. Wer Byte-Gleichheit braucht, muss den
// Trigger fuer die Dauer der Transaktion abschalten (Variante B). Beide Wege werden hier
// bewiesen — damit im Ernstfall niemand raten muss.
//
// KONFIGURATION (alles ueber Env, keine Geheimnisse):
//   HELMUT_TEST_PG_HOST  Socket-Verzeichnis oder Host (ohne Wert -> Suite uebersprungen)
//   HELMUT_TEST_PG_PORT  Default 5433 · HELMUT_TEST_PG_USER Default helmut
//   HELMUT_TEST_PG_DB_RUECKNAHME  Default helmut_test_ruecknahme (EIGENE Datenbank je Suite)
//
// OFFLINE: `psql` verbindet ausschliesslich lokal. Kein Netz, keine KI, keine Kosten.

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BASIS = path.join(ROOT, "supabase/migrations/20260808_scalable_job_queue.sql");
const BASIS_ROLLBACK = path.join(ROOT, "supabase/migrations/20260808_scalable_job_queue_rollback.sql");

const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "",
  port: process.env.HELMUT_TEST_PG_PORT || "5433",
  user: process.env.HELMUT_TEST_PG_USER || "helmut",
  db: process.env.HELMUT_TEST_PG_DB_RUECKNAHME || "helmut_test_ruecknahme"
};

// Die Grenze aus Runbook §17.8: nur der Bestand des ersten Laufs, nichts Neueres.
const GRENZE = "2026-08-12 00:00:00+00";
// Die Zahl, die der Betreiber vorher gemessen hat. Sie ist ABSICHTLICH eine Eingabe und kein
// `count(*)` zur Laufzeit: eine Erwartung, die sich selbst nachrechnet, prueft nichts.
const ERWARTET = 180;

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(titel) { console.log(`\n== ${titel} ==`); }

function psqlRoh(args, { erlaubeFehler = false } = {}) {
  try {
    return {
      ok: true,
      out: execFileSync("psql", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(),
      err: ""
    };
  } catch (error) {
    if (!erlaubeFehler) throw error;
    return { ok: false, out: String(error.stdout || "").trim(), err: String(error.stderr || "").trim() };
  }
}

function basisArgs(db = PG.db) {
  return ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", db, "-v", "ON_ERROR_STOP=1", "-tAq"];
}

function sql(text, opts = {}) {
  return psqlRoh([...basisArgs(), "-c", text], opts);
}
function datei(pfad, opts = {}) {
  return psqlRoh([...basisArgs(), "-f", pfad], opts);
}
// Ein Skript in EINER Sitzung, mit dem Export als psql-Variable. `:'export'` erzeugt ein
// korrekt maskiertes SQL-Stringliteral — genau der Weg, den das Runbook vorschreibt.
function skript(text, { exportJson = null, erlaubeFehler = false } = {}) {
  const tmp = path.join(os.tmpdir(), `helmut-ruecknahme-${process.pid}-${Math.abs(text.length)}.sql`);
  fs.writeFileSync(tmp, text, "utf8");
  const args = [...basisArgs()];
  if (exportJson != null) args.push("-v", `export=${exportJson}`);
  args.push("-f", tmp);
  try {
    return psqlRoh(args, { erlaubeFehler });
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) { /* egal */ }
  }
}

function servererreichbar() {
  if (!PG.host) return false;
  try {
    execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", "postgres",
      "-tAc", "select 1"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch (_) { return false; }
}

// ── Die Bausteine des Runbook-Verfahrens ─────────────────────────────────────────────────────
// Sie stehen hier WOERTLICH so, wie sie im Runbook §17.8 dokumentiert sind. Weicht das Runbook
// spaeter ab, faellt es hier auf: die Suite beweist genau diese Anweisungen, keine anderen.

const EXPORT_SQL = `select coalesce(jsonb_agg(to_jsonb(j) order by j.id), '[]'::jsonb)
  from public.helmut_jobs j
 where j.status in ('wartend','laeuft')
   and j.created_at < timestamptz '${GRENZE}';`;

// Schritt 2 aus §17.8: geschuetzte Loeschung. Die Erwartung steht IM Skript; weicht die
// tatsaechliche Zahl ab, bricht `raise exception` die Transaktion ab — es wird nichts geloescht.
const LOESCHEN_SQL = (erwartet) => `
begin;
do $ruecknahme$
declare v_geloescht bigint;
begin
  delete from public.helmut_jobs
   where status in ('wartend','laeuft')
     and created_at < timestamptz '${GRENZE}';
  get diagnostics v_geloescht = row_count;
  if v_geloescht <> ${erwartet} then
    raise exception 'ABBRUCH: % Zeilen geloescht, erwartet ${erwartet} — nichts veraendert', v_geloescht;
  end if;
end
$ruecknahme$;
commit;`;

// Schritt R aus §17.8: Wiederherstellung. ALLES in EINER Transaktion — Konfliktpruefung,
// Einfuegen, Anzahlpruefung und Inhaltspruefung. Erst wenn alle vier stimmen, wird committed.
// `p_exakt` schaltet Variante B (Trigger fuer die Dauer der Transaktion aus -> auch
// `updated_at` wird originalgetreu wiederhergestellt).
const WIEDERHERSTELLEN_SQL = (erwartet, exakt) => `
begin;
create temporary table wh_export (daten jsonb) on commit drop;
insert into wh_export values (:'export'::jsonb);
create temporary view wh_zeilen as
  select * from jsonb_populate_recordset(null::public.helmut_jobs, (select daten from wh_export));
${exakt ? "alter table public.helmut_jobs disable trigger helmut_jobs_kappen_trg;" : ""}
do $wh$
declare
  v_erwartet   bigint := ${erwartet};
  v_im_export  bigint;
  v_konflikte  bigint;
  v_eingefuegt bigint;
  v_abweichend bigint;
begin
  -- (1) Traegt der Export ueberhaupt die erwartete Menge?
  select count(*) into v_im_export from wh_zeilen;
  if v_im_export <> v_erwartet then
    raise exception 'ABBRUCH: Export enthaelt % Zeilen, erwartet % — nichts eingefuegt',
      v_im_export, v_erwartet;
  end if;

  -- (2) Konflikte VOR dem Schreiben erkennen: gleiche id ODER gleicher Idempotenzschluessel.
  --     Der Schluessel ist global eindeutig; ein zwischenzeitlich neu geplanter Auftrag mit
  --     demselben Schluessel macht die Wiederherstellung unzulaessig, nicht bloss unbequem.
  select count(*) into v_konflikte
    from wh_zeilen e
    join public.helmut_jobs j
      on j.id = e.id or j.idempotency_key = e.idempotency_key;
  if v_konflikte > 0 then
    raise exception 'ABBRUCH: % vorhandene Zeile(n) kollidieren mit dem Export — nichts eingefuegt',
      v_konflikte;
  end if;

  -- (3) Einfuegen und Anzahl gegenpruefen.
  insert into public.helmut_jobs select * from wh_zeilen;
  get diagnostics v_eingefuegt = row_count;
  if v_eingefuegt <> v_erwartet then
    raise exception 'ABBRUCH: % Zeilen eingefuegt, erwartet % — Transaktion zurueckgenommen',
      v_eingefuegt, v_erwartet;
  end if;

  -- (4) INHALT gegen den Export pruefen, noch VOR dem Commit. \`updated_at\` ist ausgenommen,
  --     solange der Kappungstrigger laeuft (er stempelt es neu) — in Variante B ist er aus,
  --     dann muss auch \`updated_at\` stimmen.
  select count(*) into v_abweichend
    from wh_zeilen e
    join public.helmut_jobs j on j.id = e.id
   where ${exakt ? "to_jsonb(j) is distinct from to_jsonb(e)"
                 : "(to_jsonb(j) - 'updated_at') is distinct from (to_jsonb(e) - 'updated_at')"};
  if v_abweichend > 0 then
    raise exception 'ABBRUCH: % wiederhergestellte Zeile(n) weichen vom Export ab', v_abweichend;
  end if;
end
$wh$;
${exakt ? "alter table public.helmut_jobs enable trigger helmut_jobs_kappen_trg;" : ""}
commit;`;

// ── Testdaten: die Form des Production-Bestands vom 2026-08-11 ───────────────────────────────
const BESTAND_SQL = `
delete from public.helmut_jobs;
-- 180 offene Auftraege in der Verteilung des ersten Laufs (126 geteilt, 39 Verstehen,
-- 5 Archiv, 5 Projektion, 5 Briefing), mit Nutzdaten, Versuchen und einem Fehlertext.
insert into public.helmut_jobs
  (job_type, idempotency_key, freshness_window, payload, due_at, first_due_at, created_at,
   tenant_id, priority, attempts, max_attempts, last_error)
select 'source_fetch', 'geteilt-' || g, '2026-08-11T16Z',
       jsonb_build_object('art','geteilt','angefordertVon', g % 5 + 1),
       timestamptz '2026-08-11 16:09:35+00' + (g * interval '2 minutes'),
       timestamptz '2026-08-11 16:09:35+00' + (g * interval '2 minutes'),
       timestamptz '2026-08-11 20:00:06+00', null, 100,
       case when g = 1 then 1 else 0 end, 5,
       case when g = 1 then 'HTTP 503' else null end
  from generate_series(1,126) g;
insert into public.helmut_jobs
  (job_type, idempotency_key, freshness_window, payload, due_at, first_due_at, created_at,
   tenant_id, priority, attempts, max_attempts)
select 'document_understanding', 'verstehen-' || g, '2026-08-11T16Z',
       jsonb_build_object('dokumentIds', jsonb_build_array('rd-' || g, 'rd-b' || g)),
       timestamptz '2026-08-11 20:00:26+00', timestamptz '2026-08-11 20:00:26+00',
       timestamptz '2026-08-11 20:00:55+00', null, 100, 0, 5
  from generate_series(1,39) g;
insert into public.helmut_jobs
  (job_type, idempotency_key, freshness_window, payload, due_at, first_due_at, created_at,
   tenant_id, priority)
select 'source_fetch', 'archiv-' || t.id, '2026-08-06T00Z',
       '{"art":"person-archiv"}'::jsonb,
       timestamptz '2026-08-06 00:00:00+00' + (t.rn * interval '30.25 hours'),
       timestamptz '2026-08-06 00:00:00+00' + (t.rn * interval '30.25 hours'),
       timestamptz '2026-08-11 20:00:06+00', t.id, 300
  from (values ('m-1',0),('m-2',1),('m-3',2),('m-4',3),('m-5',4)) as t(id, rn);
insert into public.helmut_jobs
  (job_type, idempotency_key, freshness_window, payload, due_at, first_due_at, created_at,
   tenant_id, priority)
select typ, typ || '|' || t.id || '|2026-08-11T00Z', '2026-08-11T00Z',
       jsonb_build_object('mandatsId', t.id),
       timestamptz '2026-08-11 12:00:00+00', timestamptz '2026-08-11 12:00:00+00',
       timestamptz '2026-08-11 20:00:17+00', t.id, 100
  from (values ('m-1'),('m-2'),('m-3'),('m-4'),('m-5')) as t(id),
       (values ('mandate_projection'),('briefing_materialization')) as x(typ);
-- 55 ERLEDIGTE Auftraege. Sie duerfen von der Loeschung NICHT beruehrt werden (Runbook §17.7:
-- sie sind der Beleg des ersten Laufs).
insert into public.helmut_jobs
  (job_type, idempotency_key, freshness_window, payload, due_at, first_due_at, created_at,
   status, finished_at, attempts, tenant_id)
select 'source_fetch', 'erledigt-' || g, '2026-08-11T16Z', '{}'::jsonb,
       timestamptz '2026-08-11 16:00:00+00', timestamptz '2026-08-11 16:00:00+00',
       timestamptz '2026-08-11 20:00:06+00', 'erledigt',
       timestamptz '2026-08-11 20:02:00+00', 1, null
  from generate_series(1,55) g;`;

function main() {
  console.log("Helmut — Datenbanknachweis des Ruecknahmeverfahrens (OP-30, 2026-08-12)");

  if (!servererreichbar()) {
    console.log("\n== UEBERSPRUNGEN ==");
    console.log("  Kein lokaler PostgreSQL-Server erreichbar (HELMUT_TEST_PG_HOST nicht gesetzt");
    console.log("  oder Verbindung nicht moeglich).");
    console.log("  >> DER NACHWEIS DES RUECKNAHMEVERFAHRENS IST DAMIT OFFEN, NICHT ERBRACHT. <<");
    console.log("  Ohne ihn darf Runbook §17.8 Schritt 2 NICHT ausgefuehrt werden.");
    console.log("\n== ERGEBNIS ==\nPASS 0  FAIL 0  (uebersprungen, Nachweis offen)");
    process.exit(0);
  }

  console.log(`  Server: ${PG.host}:${PG.port}/${PG.db} als ${PG.user}`);
  try {
    execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", "postgres",
      "-tAc", `create database ${PG.db}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (_) { /* existiert bereits */ }

  datei(BASIS_ROLLBACK);
  datei(BASIS);
  sql(BESTAND_SQL);

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("1 · Erwartete Anzahl VOR dem Export");
  const offenVorher = sql(`select count(*) from public.helmut_jobs
     where status in ('wartend','laeuft') and created_at < timestamptz '${GRENZE}';`).out;
  const gesamtVorher = sql("select count(*) from public.helmut_jobs;").out;
  check("1.1 Die Auswahl trifft genau die 180 offenen Auftraege",
    offenVorher === String(ERWARTET), offenVorher);
  check("1.2 Der Bestand enthaelt zusaetzlich die 55 erledigten (die bleiben stehen)",
    gesamtVorher === "235", gesamtVorher);

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("2 · Vollstaendiger Export");
  const exportJson = sql(EXPORT_SQL).out;
  const exportLaenge = sql(`select jsonb_array_length('${exportJson.replace(/'/g, "''")}'::jsonb);`).out;
  check("2.1 Der Export enthaelt genau 180 Elemente", exportLaenge === String(ERWARTET), exportLaenge);

  const spaltenTabelle = sql(`select count(*) from information_schema.columns
     where table_schema='public' and table_name='helmut_jobs';`).out;
  const unvollstaendig = skript(`
    select count(*) from jsonb_array_elements(:'export'::jsonb) e
     where (select count(*) from jsonb_object_keys(e.value)) <> ${spaltenTabelle};`,
  { exportJson }).out;
  check(`2.2 JEDES Element traegt ALLE ${spaltenTabelle} Spalten der Tabelle (auch die mit NULL)`,
    unvollstaendig === "0", `${unvollstaendig} unvollstaendige Elemente`);

  // Nutzdaten, Versuche, Fehlertexte und Zeitwerte muessen im Export wirklich drinstehen —
  // ein Export, der nur IDs traegt, waere kein Rueckweg.
  const inhaltsprobe = skript(`
    select count(*) from jsonb_array_elements(:'export'::jsonb) e
     where e.value->>'id' is not null
       and e.value->>'created_at' is not null
       and e.value->>'first_due_at' is not null
       and e.value->>'due_at' is not null
       and e.value->>'status' is not null
       and e.value->>'attempts' is not null
       and e.value->>'payload' is not null
       and e.value->>'idempotency_key' is not null;`, { exportJson }).out;
  check("2.3 Alle 180 Elemente tragen ID, Zeitwerte, Zustand, Versuche und Nutzdaten",
    inhaltsprobe === String(ERWARTET), inhaltsprobe);
  const fehlertext = skript(`
    select count(*) from jsonb_array_elements(:'export'::jsonb) e
     where e.value->>'last_error' = 'HTTP 503' and (e.value->>'attempts')::int = 1;`,
  { exportJson }).out;
  check("2.4 Auch Versuchszaehler und Fehlertext sind mit exportiert", fehlertext === "1", fehlertext);

  const pruefsumme = skript("select md5(:'export');", { exportJson }).out;
  check("2.5 Der Export traegt eine Pruefsumme (Belegbarkeit der Datei)",
    /^[0-9a-f]{32}$/.test(pruefsumme), pruefsumme);

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("3 · Sicherer ABBRUCH bei falscher Erwartung (vor jeder Loeschung)");
  const falsch = sql(LOESCHEN_SQL(179), { erlaubeFehler: true });
  check("3.1 Eine falsche Erwartung bricht mit klarer Meldung ab",
    falsch.ok === false && /ABBRUCH: 180 Zeilen geloescht, erwartet 179/.test(falsch.err),
    falsch.err.split("\n")[0]);
  const nachAbbruch = sql("select count(*) from public.helmut_jobs;").out;
  check("3.2 Nach dem Abbruch ist NICHTS geloescht (Transaktion zurueckgenommen)",
    nachAbbruch === "235", nachAbbruch);

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("4 · Exakte Loeschanzahl");
  const geloescht = sql(LOESCHEN_SQL(ERWARTET));
  check("4.1 Die Loeschung laeuft mit der richtigen Erwartung durch", geloescht.ok === true);
  const restOffen = sql("select count(*) from public.helmut_jobs where status in ('wartend','laeuft');").out;
  const restGesamt = sql("select count(*) from public.helmut_jobs;").out;
  check("4.2 Es sind exakt 180 Auftraege verschwunden", restOffen === "0", restOffen);
  check("4.3 Die 55 erledigten Auftraege stehen unveraendert", restGesamt === "55", restGesamt);

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("5 · Wiederherstellung (Variante A — Trigger aktiv, Regelfall)");
  const wieder = skript(WIEDERHERSTELLEN_SQL(ERWARTET, false), { exportJson, erlaubeFehler: true });
  check("5.1 Die Wiederherstellung laeuft durch", wieder.ok === true, wieder.err.split("\n")[0]);
  const nachWieder = sql("select count(*) from public.helmut_jobs where status in ('wartend','laeuft');").out;
  check("5.2 Exakt 180 Auftraege sind zurueck", nachWieder === String(ERWARTET), nachWieder);
  check("5.3 Keine zusaetzlichen Auftraege (235 gesamt, wie vorher)",
    sql("select count(*) from public.helmut_jobs;").out === "235");

  const abweichungOhneUpdated = skript(`
    select count(*) from jsonb_populate_recordset(null::public.helmut_jobs, :'export'::jsonb) e
      join public.helmut_jobs j on j.id = e.id
     where (to_jsonb(j) - 'updated_at') is distinct from (to_jsonb(e) - 'updated_at');`,
  { exportJson }).out;
  check("5.4 Alle 180 Zeilen sind in JEDEM Feld ausser `updated_at` identisch",
    abweichungOhneUpdated === "0", `${abweichungOhneUpdated} abweichende Zeilen`);
  const fehlend = skript(`
    select count(*) from jsonb_populate_recordset(null::public.helmut_jobs, :'export'::jsonb) e
     where not exists (select 1 from public.helmut_jobs j where j.id = e.id);`,
  { exportJson }).out;
  check("5.5 Kein Auftrag fehlt (Abgleich ueber die urspruenglichen IDs)", fehlend === "0", fehlend);
  const updatedNeu = skript(`
    select count(*) from jsonb_populate_recordset(null::public.helmut_jobs, :'export'::jsonb) e
      join public.helmut_jobs j on j.id = e.id
     where j.updated_at is distinct from e.updated_at;`, { exportJson }).out;
  check("5.6 BENANNTER BEFUND: `updated_at` wird vom Kappungstrigger neu gestempelt",
    updatedNeu === String(ERWARTET), `${updatedNeu} von ${ERWARTET} Zeilen`);

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("6 · Sicherer ABBRUCH bei Schluesselkonflikt");
  // Der realistische Fall: zwischen Loeschung und Wiederherstellung hat ein Planungslauf einen
  // Auftrag mit DEMSELBEN Idempotenzschluessel neu angelegt.
  sql(`delete from public.helmut_jobs where status in ('wartend','laeuft');
       insert into public.helmut_jobs (job_type, idempotency_key, freshness_window, payload)
       values ('source_fetch', 'archiv-m-1', '2026-08-06T00Z', '{}'::jsonb);`);
  const konflikt = skript(WIEDERHERSTELLEN_SQL(ERWARTET, false), { exportJson, erlaubeFehler: true });
  check("6.1 Ein kollidierender Idempotenzschluessel bricht die Wiederherstellung ab",
    konflikt.ok === false && /ABBRUCH: 1 vorhandene Zeile\(n\) kollidieren/.test(konflikt.err),
    konflikt.err.split("\n")[0]);
  check("6.2 Nach dem Abbruch ist NICHTS eingefuegt (nur die eine Konfliktzeile steht)",
    sql("select count(*) from public.helmut_jobs where status in ('wartend','laeuft');").out === "1");

  // Auch ein zu kleiner/grosser Export bricht ab, BEVOR geschrieben wird.
  sql("delete from public.helmut_jobs where status in ('wartend','laeuft');");
  const zuWenig = skript(WIEDERHERSTELLEN_SQL(ERWARTET, false),
    { exportJson: "[]", erlaubeFehler: true });
  check("6.3 Ein unvollstaendiger Export bricht ab, bevor irgendetwas geschrieben wird",
    zuWenig.ok === false && /ABBRUCH: Export enthaelt 0 Zeilen, erwartet 180/.test(zuWenig.err),
    zuWenig.err.split("\n")[0]);
  check("6.4 Auch danach ist nichts eingefuegt",
    sql("select count(*) from public.helmut_jobs where status in ('wartend','laeuft');").out === "0");

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("7 · Wiederherstellung (Variante B — byte-gleich, Trigger fuer die Transaktion aus)");
  const exakt = skript(WIEDERHERSTELLEN_SQL(ERWARTET, true), { exportJson, erlaubeFehler: true });
  check("7.1 Die exakte Wiederherstellung laeuft durch", exakt.ok === true, exakt.err.split("\n")[0]);
  const abweichungExakt = skript(`
    select count(*) from jsonb_populate_recordset(null::public.helmut_jobs, :'export'::jsonb) e
      join public.helmut_jobs j on j.id = e.id
     where to_jsonb(j) is distinct from to_jsonb(e);`, { exportJson }).out;
  check("7.2 Alle 180 Zeilen sind in JEDEM Feld identisch — auch `updated_at`",
    abweichungExakt === "0", `${abweichungExakt} abweichende Zeilen`);
  const triggerAn = sql(`select tgenabled from pg_trigger
     where tgname = 'helmut_jobs_kappen_trg' and not tgisinternal;`).out;
  check("7.3 Der Kappungstrigger ist danach wieder aktiv (kein dauerhaft offenes Tor)",
    triggerAn === "O", triggerAn);

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("8 · Kein unbeabsichtigtes Verarbeiten nach der Wiederherstellung");
  const zustaende = sql(`select coalesce(string_agg(distinct status, ','), 'keine')
     from public.helmut_jobs where status in ('wartend','laeuft');`).out;
  const leases = sql("select count(*) from public.helmut_jobs where lease_owner is not null;").out;
  check("8.1 Kein wiederhergestellter Auftrag ist beansprucht (0 Leases)", leases === "0", leases);
  check("8.2 Die Zustaende sind unveraendert `wartend` (kein `laeuft`)",
    zustaende === "wartend", zustaende);
  // Der einzige wirksame Riegel ist das Flag: mit `HELMUT_SCALABLE_PIPELINE=off` ruft niemand
  // `helmut_claim_jobs`. Das wird hier ausdruecklich als Voraussetzung festgehalten — die
  // Datenbank selbst kann es nicht erzwingen, und genau deshalb steht es im Runbook §17.8.
  const wuerdenBeansprucht = sql(`select count(*) from public.helmut_jobs
     where status = 'wartend' and due_at <= now();`).out;
  check("8.3 EHRLICH BENANNT: alle 180 waeren bei aktivem Flag sofort beanspruchbar — der "
    + "Riegel ist ausschliesslich `HELMUT_SCALABLE_PIPELINE=off`",
  wuerdenBeansprucht === String(ERWARTET), wuerdenBeansprucht);

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("9 · Gesamtbild nach dem vollstaendigen Durchlauf");
  check("9.1 235 Auftraege, genau wie vor der Loeschung",
    sql("select count(*) from public.helmut_jobs;").out === "235");
  check("9.2 180 offen / 55 erledigt, unveraendert",
    sql(`select count(*) filter (where status in ('wartend','laeuft')) || '/'
         || count(*) filter (where status='erledigt') from public.helmut_jobs;`).out === "180/55");
  const pruefsummeDanach = skript(`
    select md5(coalesce(jsonb_agg(to_jsonb(j) order by j.id), '[]'::jsonb)::text)
      from public.helmut_jobs j
     where j.status in ('wartend','laeuft') and j.created_at < timestamptz '${GRENZE}';`).out;
  const pruefsummeExport = sql(`select md5('${exportJson.replace(/'/g, "''")}'::jsonb::text);`).out;
  check("9.3 Der erneute Export ist byte-gleich zum urspruenglichen (Variante B)",
    pruefsummeDanach === pruefsummeExport, `${pruefsummeDanach} vs ${pruefsummeExport}`);

  // Aufraeumen: die Wegwerfdatenbank leer hinterlassen.
  datei(BASIS_ROLLBACK);

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}`);
  if (fail === 0) {
    console.log("Das Ruecknahmeverfahren aus Runbook §17.8 ist an echter PostgreSQL bewiesen:");
    console.log("Export vollstaendig, Loeschung exakt, Wiederherstellung identisch, Abbruch sicher.");
  }
  process.exit(fail === 0 ? 0 : 1);
}

try {
  main();
} catch (error) {
  console.error(String((error && error.stderr) || (error && error.message) || error));
  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail + 1}`);
  process.exit(1);
}
