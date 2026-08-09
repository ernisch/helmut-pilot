"use strict";

// Helmut — BEREINIGUNG DER ARBEITSWARTESCHLANGE UNTER LAST (OP-30, Abnahmesprint, Phase 6).
// =============================================================================================
// WAS HIER BEWIESEN WIRD, an einer ECHTEN PostgreSQL-Datenbank mit 66 000 Zeilen:
//   1. Der Trockenlauf ist der STANDARD und loescht nichts.
//   2. Die Vorschau ist rein lesend.
//   3. Die Schutzliste haelt: wartende, laufende, zurueckgestellte und endgueltig
//      fehlgeschlagene Auftraege ueberleben JEDE Bereinigung.
//   4. Die Obergrenze je Aufruf wird eingehalten — kein Aufruf sperrt die Tabelle mit
//      zehntausenden Zeilen in EINER Transaktion.
//   5. Die Bereinigung laeuft, WAEHREND Worker arbeiten — ohne dass ein Auftrag verloren
//      geht oder doppelt erledigt wird.
//   6. Ein ABBRUCH mitten in der Bereinigung hinterlaesst keinen halben Zustand.
//   7. Wiederholung ist gefahrlos (idempotent bis zum Leerstand).
//   8. Die Laufzeit wird gemessen, nicht behauptet.
//
// >>> WAS DIESER TEST NICHT BEWEIST <<<
//   Er misst eine LOKALE Datenbank ohne Netzlatenz, mit `fsync=off`. Die Laufzeiten sind
//   eine Untergrenze und keine Production-Zusage. Er sagt NICHTS darueber, ob die
//   Bereinigung in Production scharfgeschaltet werden soll — das ist eine Betreiberentscheidung.
//
// OHNE NETZ, OHNE KI, OHNE KOSTEN. Ohne lokalen Server meldet der Test den Nachweis
// ausdruecklich als OFFEN und faellt NICHT gruen durch.

const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
process.env.HELMUT_SOURCE_MODE = "off";

const MIGRATION_BASIS = path.join(ROOT, "supabase/migrations/20260808_scalable_job_queue.sql");
const MIGRATION = path.join(ROOT, "supabase/migrations/20260808_jobqueue_bereinigung.sql");
const ROLLBACK = path.join(ROOT, "supabase/migrations/20260808_jobqueue_bereinigung_rollback.sql");
const ROLLBACK_BASIS = path.join(ROOT, "supabase/migrations/20260808_scalable_job_queue_rollback.sql");

const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "",
  port: process.env.HELMUT_TEST_PG_PORT || "5433",
  user: process.env.HELMUT_TEST_PG_USER || "helmut",
  db: process.env.HELMUT_TEST_PG_DB || "helmut_test"
};

const ZEILEN = Number(process.env.HELMUT_BEREINIGUNG_ZEILEN || 66000);

let pass = 0;
let fail = 0;
const offen = [];
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function offenerPunkt(t) { offen.push(t); console.log(`  OFFEN ${t}`); }
function abschnitt(t) { console.log(`\n== ${t} ==`); }
const z = (n) => Number(n).toLocaleString("de-DE");

function psql(sql, { datei = null } = {}) {
  const args = ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", PG.db, "-tA", "-v", "ON_ERROR_STOP=1"];
  if (datei) args.push("-f", datei); else args.push("-c", sql);
  return execFileSync("psql", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}
const wert = (sql) => psql(sql).trim().split("\n")[0];
const zahl = (sql) => Number(wert(sql));

function main() {
  console.log("Helmut — Bereinigung der Arbeitswarteschlange unter Last (OP-30, Phase 6)");
  if (!PG.host) {
    console.log("\n  KEIN lokaler PostgreSQL-Server konfiguriert (HELMUT_TEST_PG_HOST).");
    console.log("  Der Nachweis ist damit OFFEN — dieser Test BEHAUPTET kein Ergebnis.");
    console.log("  Aufruf mit Server: HELMUT_TEST_PG_HOST=<socket|host> node scripts/jobqueue-bereinigung-test.js");
    // Exitcode 0 wie scripts/jobqueue-datenbank-test.js: ein fehlender lokaler Server ist
    // KEIN Testfehler, sondern eine fehlende Voraussetzung. Die Offline-Suite darf daran
    // nicht rot werden — der fehlende Nachweis steht ausdruecklich im Text.
    process.exit(0);
  }
  console.log(`  Server: ${PG.host}:${PG.port}/${PG.db} als ${PG.user}`);
  console.log(`  Zeilen im Test: ${z(ZEILEN)}\n`);

  // ── Ausgangszustand ───────────────────────────────────────────────────────────────────
  abschnitt("1 · Migration und Rollback");
  try { psql(null, { datei: ROLLBACK }); } catch (_) { /* darf auf leerer DB laufen */ }
  try { psql(null, { datei: ROLLBACK_BASIS }); } catch (_) { /* egal */ }
  psql(null, { datei: MIGRATION_BASIS });
  psql(null, { datei: MIGRATION });
  const funktionen = zahl(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('helmut_jobs_bereinigung_vorschau','helmut_jobs_bereinigen');`);
  check("1.1 Beide Bereinigungsfunktionen sind angelegt", funktionen === 2, `${funktionen}/2`);
  // Zweimal anwenden muss gefahrlos sein.
  psql(null, { datei: MIGRATION });
  check("1.2 Die Migration ist wiederholbar (zweite Anwendung ohne Fehler)", true);
  const idx = zahl(`select count(*) from pg_indexes where schemaname='public' and indexname='helmut_jobs_bereinigung_idx';`);
  check("1.3 Der Index fuer die Bereinigungsabfrage existiert", idx === 1);

  // ── Daten ─────────────────────────────────────────────────────────────────────────────
  abschnitt(`2 · ${z(ZEILEN)} Zeilen aufbauen`);
  psql("truncate table public.helmut_jobs;");
  const t0 = Date.now();
  // Verteilung bewusst gemischt: alt-erledigt (loeschbar), jung-erledigt, wartend,
  // laufend, endgueltig fehlgeschlagen. Nur die erste Gruppe darf verschwinden.
  psql(`
    insert into public.helmut_jobs
      (job_type, idempotency_key, freshness_window, payload, status, attempts,
       created_at, finished_at, due_at, lease_owner, lease_expires_at, max_attempts)
    select
      case (i % 4) when 0 then 'source_fetch' when 1 then 'document_understanding'
                   when 2 then 'mandate_projection' else 'briefing_materialization' end,
      'bereinigung-test-' || i,
      to_char(now() - interval '40 days', 'YYYY-MM-DD'),
      jsonb_build_object('n', i),
      case
        when i % 100 < 70 then 'erledigt'          -- 70 % alt und erledigt -> loeschbar
        when i % 100 < 80 then 'erledigt'          -- 10 % erledigt, aber ZU JUNG
        when i % 100 < 90 then 'wartend'           -- 10 % offene Arbeit
        when i % 100 < 95 then 'laeuft'            --  5 % in fremder Hand
        else 'fehlgeschlagen'                      --  5 % Fehlerbeleg
      end,
      case when i % 100 >= 95 then 5 else 0 end,
      now() - interval '40 days',
      case
        when i % 100 < 70 then now() - interval '30 days'
        when i % 100 < 80 then now() - interval '1 day'
        else null
      end,
      now(),
      case when i % 100 >= 90 and i % 100 < 95 then 'lease-halter-' || (i % 7) else null end,
      case when i % 100 >= 90 and i % 100 < 95 then now() + interval '10 minutes' else null end,
      5
    from generate_series(1, ${ZEILEN}) i;
  `);
  const aufbauMs = Date.now() - t0;
  const gesamt = zahl("select count(*) from public.helmut_jobs;");
  console.log(`    Aufbau: ${z(gesamt)} Zeilen in ${z(aufbauMs)} ms`);
  check("2.1 Alle Zeilen sind angelegt", gesamt === ZEILEN, `${z(gesamt)}/${z(ZEILEN)}`);
  const verteilung = psql(`select status, count(*) from public.helmut_jobs group by 1 order by 1;`).trim();
  console.log("    Verteilung:");
  for (const zeile of verteilung.split("\n")) console.log(`      ${zeile.replace("|", " ".repeat(4))}`);

  const sollLoeschbar = zahl(`select count(*) from public.helmut_jobs
    where status='erledigt' and finished_at < now() - interval '14 days';`);
  const sollGeschuetzt = gesamt - sollLoeschbar;
  console.log(`    loeschbar (Soll) ... ${z(sollLoeschbar)} · geschuetzt (Soll) ... ${z(sollGeschuetzt)}`);

  // ── Vorschau ──────────────────────────────────────────────────────────────────────────
  abschnitt("3 · Die Vorschau ist rein lesend");
  const tv = Date.now();
  const v = psql(`select loeschbar, geschuetzt_wartend, geschuetzt_laufend, geschuetzt_fehler, zu_jung, gesamt
    from public.helmut_jobs_bereinigung_vorschau(14);`).trim().split("|").map(Number);
  const vorschauMs = Date.now() - tv;
  console.log(`    Vorschau in ${z(vorschauMs)} ms: loeschbar=${z(v[0])} wartend=${z(v[1])} laufend=${z(v[2])} fehler=${z(v[3])} zuJung=${z(v[4])} gesamt=${z(v[5])}`);
  check("3.1 Die Vorschau nennt exakt die loeschbare Menge", v[0] === sollLoeschbar, `${z(v[0])} = ${z(sollLoeschbar)}`);
  check("3.2 Die Vorschau zaehlt alle Zeilen", v[5] === gesamt);
  check("3.3 Die Summe der Gruppen ergibt das Ganze",
    v[0] + v[1] + v[2] + v[3] + v[4] === gesamt, `${z(v[0] + v[1] + v[2] + v[3] + v[4])} = ${z(gesamt)}`);
  const nachVorschau = zahl("select count(*) from public.helmut_jobs;");
  check("3.4 Die Vorschau hat NICHTS geloescht", nachVorschau === gesamt, `${z(nachVorschau)}`);

  // ── Trockenlauf ───────────────────────────────────────────────────────────────────────
  abschnitt("4 · Der Trockenlauf ist der Standard");
  const t1 = psql(`select trockenlauf, betroffen, geloescht from public.helmut_jobs_bereinigen(14);`).trim().split("|");
  console.log(`    Aufruf ohne weitere Argumente -> trockenlauf=${t1[0]} betroffen=${z(t1[1])} geloescht=${z(t1[2])}`);
  check("4.1 Ohne ausdrueckliche Angabe ist es ein Trockenlauf", t1[0] === "t");
  check("4.2 Der Trockenlauf loescht nichts", Number(t1[2]) === 0);
  check("4.3 Der Trockenlauf nennt trotzdem die betroffene Menge", Number(t1[1]) === sollLoeschbar);
  check("4.4 Der Bestand ist unveraendert", zahl("select count(*) from public.helmut_jobs;") === gesamt);

  // ── Obergrenze ────────────────────────────────────────────────────────────────────────
  abschnitt("5 · Die Obergrenze je Aufruf haelt");
  const e1 = psql(`select geloescht from public.helmut_jobs_bereinigen(14, false, 1000);`).trim();
  console.log(`    ein Aufruf mit max_zeilen=1000 -> geloescht ${z(e1)}`);
  check("5.1 Ein Aufruf loescht NIE mehr als die Obergrenze", Number(e1) <= 1000, `${z(e1)} <= 1000`);
  check("5.2 Ein Aufruf loescht auch tatsaechlich etwas", Number(e1) > 0);

  // ── Stapelweise bis leer, mit Zeitmessung ─────────────────────────────────────────────
  abschnitt("6 · Stapelweise bis leer — gemessen");
  const STAPEL = 5000;
  let runden = 1;
  let geloeschtGesamt = Number(e1);
  const tb = Date.now();
  const rundenzeiten = [];
  for (;;) {
    const tr = Date.now();
    const g = Number(psql(`select geloescht from public.helmut_jobs_bereinigen(14, false, ${STAPEL});`).trim());
    rundenzeiten.push(Date.now() - tr);
    geloeschtGesamt += g;
    runden += 1;
    if (g < STAPEL) break;
    if (runden > 100) break;   // Reissleine, damit ein Fehler nicht endlos laeuft
  }
  const bereinigungMs = Date.now() - tb;
  const proSekunde = Math.round(geloeschtGesamt / Math.max(1, bereinigungMs / 1000));
  console.log(`    ${z(geloeschtGesamt)} Zeilen in ${runden} Aufrufen · ${z(bereinigungMs)} ms · ~${z(proSekunde)} Zeilen/s`);
  console.log(`    langsamster Aufruf ... ${z(Math.max(...rundenzeiten))} ms · schnellster ... ${z(Math.min(...rundenzeiten))} ms`);
  check("6.1 Genau die loeschbare Menge wurde entfernt",
    geloeschtGesamt === sollLoeschbar, `${z(geloeschtGesamt)} = ${z(sollLoeschbar)}`);
  const rest = zahl("select count(*) from public.helmut_jobs;");
  check("6.2 Der geschuetzte Bestand ist vollstaendig da", rest === sollGeschuetzt, `${z(rest)} = ${z(sollGeschuetzt)}`);
  check("6.3 Kein einzelner Aufruf haelt die Tabelle laenger als 5 s",
    Math.max(...rundenzeiten) < 5000, `max ${z(Math.max(...rundenzeiten))} ms`);

  // ── Schutzliste ───────────────────────────────────────────────────────────────────────
  abschnitt("7 · Die Schutzliste haelt");
  const nachStatus = {};
  for (const zeile of psql("select status, count(*) from public.helmut_jobs group by 1;").trim().split("\n")) {
    const [s, n] = zeile.split("|"); nachStatus[s] = Number(n);
  }
  console.log(`    ${JSON.stringify(nachStatus)}`);
  check("7.1 Wartende Auftraege sind unangetastet", (nachStatus.wartend || 0) > 0);
  check("7.2 Laufende Auftraege sind unangetastet", (nachStatus.laeuft || 0) > 0);
  check("7.3 Endgueltig fehlgeschlagene sind unangetastet — der Fehlerbeleg ueberlebt",
    (nachStatus.fehlgeschlagen || 0) > 0, `${z(nachStatus.fehlgeschlagen || 0)} Zeilen`);
  check("7.4 Junge erledigte Auftraege sind unangetastet",
    zahl(`select count(*) from public.helmut_jobs where status='erledigt';`) > 0);
  check("7.5 KEINE erledigte Zeile jenseits der Frist ist uebrig",
    zahl(`select count(*) from public.helmut_jobs where status='erledigt' and finished_at < now() - interval '14 days';`) === 0);

  // ── Wiederholung ──────────────────────────────────────────────────────────────────────
  abschnitt("8 · Wiederholung ist gefahrlos");
  const vorher = zahl("select count(*) from public.helmut_jobs;");
  const w1 = Number(psql(`select geloescht from public.helmut_jobs_bereinigen(14, false, 5000);`).trim());
  const w2 = Number(psql(`select geloescht from public.helmut_jobs_bereinigen(14, false, 5000);`).trim());
  const nachher = zahl("select count(*) from public.helmut_jobs;");
  check("8.1 Ein weiterer Lauf loescht nichts mehr", w1 === 0 && w2 === 0, `${w1} / ${w2}`);
  check("8.2 Der Bestand ist unveraendert", nachher === vorher, `${z(nachher)} = ${z(vorher)}`);

  // ── Nebenlauf: Bereinigung waehrend Arbeit ────────────────────────────────────────────
  abschnitt("9 · Bereinigung WAEHREND ein Worker arbeitet");
  psql("truncate table public.helmut_jobs;");
  psql(`
    insert into public.helmut_jobs
      (job_type, idempotency_key, freshness_window, payload, status, attempts, created_at, finished_at, due_at)
    select 'source_fetch', 'neben-alt-' || i, to_char(now() - interval '40 days', 'YYYY-MM-DD'),
           jsonb_build_object('n', i), 'erledigt', 0,
           now() - interval '40 days', now() - interval '30 days', now()
    from generate_series(1, 20000) i;
  `);
  psql(`
    insert into public.helmut_jobs
      (job_type, idempotency_key, freshness_window, payload, status, attempts, created_at, due_at)
    select 'source_fetch', 'neben-offen-' || i, to_char(now(), 'YYYY-MM-DD'),
           jsonb_build_object('offen', i), 'wartend', 0, now(), now() - interval '1 minute'
    from generate_series(1, 2000) i;
  `);
  const offeneVorher = zahl("select count(*) from public.helmut_jobs where status='wartend';");
  // Ein echter, gleichzeitiger Reservierungsvorgang in einer ZWEITEN Verbindung, waehrend
  // die Bereinigung laeuft. Beide muessen durchkommen.
  const { spawn } = require("child_process");
  const arbeiter = spawn("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", PG.db, "-tA", "-q"], { stdio: ["pipe", "pipe", "pipe"] });
  let arbeiterAus = "";
  arbeiter.stdout.on("data", (d) => { arbeiterAus += d; });
  for (let i = 0; i < 20; i += 1) {
    arbeiter.stdin.write(`select count(*) from public.helmut_claim_jobs('nebenlauf-${i}', 50, 60000, null);\n`);
  }
  const tn = Date.now();
  let nebenGeloescht = 0;
  for (let i = 0; i < 6; i += 1) {
    nebenGeloescht += Number(psql(`select geloescht from public.helmut_jobs_bereinigen(14, false, 4000);`).trim());
  }
  arbeiter.stdin.end();
  execFileSync("sh", ["-c", "sleep 1"]);
  const nebenMs = Date.now() - tn;
  console.log(`    Bereinigung ${z(nebenGeloescht)} Zeilen in ${z(nebenMs)} ms, waehrend ein zweiter Prozess reserviert`);
  const reserviert = zahl("select count(*) from public.helmut_jobs where status='laeuft';");
  const nochOffen = zahl("select count(*) from public.helmut_jobs where status='wartend';");
  console.log(`    reserviert ${z(reserviert)} · noch wartend ${z(nochOffen)} · Summe ${z(reserviert + nochOffen)} (vorher ${z(offeneVorher)})`);
  check("9.1 KEIN offener Auftrag ist durch die Bereinigung verschwunden",
    reserviert + nochOffen === offeneVorher, `${z(reserviert + nochOffen)} = ${z(offeneVorher)}`);
  check("9.2 Der gleichzeitige Worker hat wirklich gearbeitet", reserviert > 0, `${z(reserviert)} reserviert`);
  check("9.3 Die Bereinigung kam trotz gleichzeitiger Arbeit durch", nebenGeloescht > 0, `${z(nebenGeloescht)}`);
  check("9.4 Keine erledigte Altzeile blieb wegen des Nebenlaufs unbemerkt liegen",
    zahl(`select count(*) from public.helmut_jobs where status='erledigt' and finished_at < now() - interval '14 days';`) === 0);

  // ── Abbruch ───────────────────────────────────────────────────────────────────────────
  abschnitt("10 · Abbruch mitten in der Bereinigung");
  psql("truncate table public.helmut_jobs;");
  psql(`
    insert into public.helmut_jobs
      (job_type, idempotency_key, freshness_window, payload, status, attempts, created_at, finished_at, due_at)
    select 'source_fetch', 'abbruch-' || i, to_char(now() - interval '40 days', 'YYYY-MM-DD'),
           jsonb_build_object('n', i), 'erledigt', 0,
           now() - interval '40 days', now() - interval '30 days', now()
    from generate_series(1, 10000) i;
  `);
  const vorAbbruch = zahl("select count(*) from public.helmut_jobs;");
  // Abbruch innerhalb der Transaktion: die Bereinigung laeuft, wird zurueckgerollt.
  psql(`begin; select geloescht from public.helmut_jobs_bereinigen(14, false, 5000); rollback;`);
  const nachAbbruch = zahl("select count(*) from public.helmut_jobs;");
  check("10.1 Ein Abbruch hinterlaesst KEINEN halben Zustand",
    nachAbbruch === vorAbbruch, `${z(nachAbbruch)} = ${z(vorAbbruch)}`);
  // Und danach laeuft die Bereinigung normal weiter.
  const nachher2 = Number(psql(`select geloescht from public.helmut_jobs_bereinigen(14, false, 5000);`).trim());
  check("10.2 Nach dem Abbruch arbeitet die Bereinigung normal weiter", nachher2 === 5000, `${z(nachher2)}`);

  // ── Rechte ────────────────────────────────────────────────────────────────────────────
  abschnitt("11 · Rechte");
  const rechte = psql(`select has_function_privilege('anon', 'public.helmut_jobs_bereinigen(integer,boolean,integer)', 'execute'),
    has_function_privilege('authenticated', 'public.helmut_jobs_bereinigen(integer,boolean,integer)', 'execute'),
    has_function_privilege('service_role', 'public.helmut_jobs_bereinigen(integer,boolean,integer)', 'execute');`).trim().split("|");
  console.log(`    anon=${rechte[0]} authenticated=${rechte[1]} service_role=${rechte[2]}`);
  check("11.1 anon darf NICHT bereinigen", rechte[0] === "f");
  check("11.2 authenticated darf NICHT bereinigen", rechte[1] === "f");
  check("11.3 service_role darf bereinigen", rechte[2] === "t");
  const sp = wert(`select p.proconfig::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='helmut_jobs_bereinigen';`);
  check("11.4 Der Suchpfad ist festgenagelt", /search_path=public/.test(String(sp)), String(sp));

  // ── Rollback ──────────────────────────────────────────────────────────────────────────
  abschnitt("12 · Rollback");
  psql(null, { datei: ROLLBACK });
  const nachRollback = zahl(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('helmut_jobs_bereinigung_vorschau','helmut_jobs_bereinigen');`);
  check("12.1 Beide Funktionen sind entfernt", nachRollback === 0, `${nachRollback}`);
  const tabelleDa = zahl(`select count(*) from pg_tables where schemaname='public' and tablename='helmut_jobs';`);
  check("12.2 Der Rollback laesst die Warteschlange selbst UNBERUEHRT", tabelleDa === 1);
  const alteFunktion = zahl(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='helmut_prune_jobs';`);
  check("12.3 Die bestehende helmut_prune_jobs bleibt unangetastet", alteFunktion === 1);
  psql(null, { datei: ROLLBACK });
  check("12.4 Der Rollback ist wiederholbar", true);

  // ── Zusammenfassung ───────────────────────────────────────────────────────────────────
  abschnitt("13 · Gemessene Kennzahlen");
  console.log(`    Zeilen im Test ................. ${z(ZEILEN)}`);
  console.log(`    Aufbau ......................... ${z(aufbauMs)} ms`);
  console.log(`    Vorschau (rein lesend) ......... ${z(vorschauMs)} ms`);
  console.log(`    Bereinigung ${z(sollLoeschbar).padStart(6)} Zeilen ..... ${z(bereinigungMs)} ms in ${runden} Aufrufen (~${z(proSekunde)} Zeilen/s)`);
  console.log(`    langsamster Einzelaufruf ....... ${z(Math.max(...rundenzeiten))} ms`);
  console.log("\n    EINORDNUNG: lokale Datenbank, fsync=off, kein Netz. Die Zeiten sind eine");
  console.log("    UNTERGRENZE und keine Production-Zusage.");
  offenerPunkt("Die Bereinigung ist NICHT scharfgeschaltet. Ob und wann sie in Production "
    + "laufen soll, ist eine Betreiberentscheidung — dieser Test trifft sie nicht.");

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  OFFEN ${offen.length}  (Pruefungen ${pass + fail})`);
  process.exit(fail === 0 ? 0 : 1);
}

try { main(); }
catch (e) { console.error("TESTLAUF-FEHLER:", e && e.message); process.exit(1); }
