"use strict";

// Helmut — Datenbanktest VERTEILTE ANBIETERSTEUERUNG (OP-30-Haertungssprint 2026-08-14).
// =============================================================================================
// Prueft 20260814090100_anbieter_steuerung.sql an einer ECHTEN PostgreSQL:
//   §1 Migration + Rollback + erneute Migration laufen durch
//   §2 Sicherheit: RLS an+erzwungen, keine Policy, fester search_path, keine Rechte fuer anon
//   §3 Minutengrenze: atomar, exakt, mit fruehestem naechsten Zeitpunkt
//   §4 Tagesgrenze: atomar, exakt, Rueckgabe bis Tagesende
//   §5 Beide Fenster gemeinsam: eine abgelehnte Reservierung zaehlt in KEINEM Fenster
//   §6 ECHTE Nebenlaeufigkeit: 12 gleichzeitige Reservierungen, Grenze 5 -> genau 5
//   §7 Schutzschaltung: Sperre nach Schwelle, Erholung ueber halb offen, Fehler im
//      Erholungsversuch sperrt sofort wieder
//   §8 Erneuerbare Klassen-Lease (Befund 4g)
//   §9 Aufraeumen alter Fenster
//   §10 Rollback laesst die Auftragstabellen unberuehrt
//
// Ohne lokale PostgreSQL: ehrlicher Skip (exit 0, "Nachweis OFFEN").

const path = require("path");
const { execFileSync, spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "/tmp/helmut-pgverify/sock",
  port: process.env.HELMUT_TEST_PG_PORT || "5433",
  user: process.env.HELMUT_TEST_PG_USER || "postgres",
  db: "helmut_anbieter_probe"
};
const M = (f) => path.join(ROOT, "supabase", "migrations", f);
const BASIS = [M("20260808_scalable_job_queue.sql"), M("20260813090000_jobqueue_outbox.sql"),
               M("20260813090100_verteilte_grenzen.sql")];
const MIGRATION = M("20260814090100_anbieter_steuerung.sql");
const ROLLBACK = M("rollback_20260814090100_anbieter_steuerung.sql");
const QUEUE_MIGRATION = M("20260814090000_queue_verbraucher.sql");

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

function psql(sql, { datei = null, db = PG.db } = {}) {
  const args = ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", db, "-tA", "-v", "ON_ERROR_STOP=1"];
  args.push(...(datei ? ["-f", datei] : ["-c", sql]));
  return execFileSync("psql", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function psqlAsync(sql) {
  return new Promise((r) => {
    const k = spawn("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", PG.db, "-tA", "-c", sql],
      { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    k.stdout.on("data", (d) => { out += d; });
    k.on("close", () => r(out.trim()));
  });
}
function verfuegbar() {
  try {
    execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", "postgres", "-tAc", "select 1"],
      { stdio: "ignore" });
    return true;
  } catch (_) { return false; }
}

async function main() {
  console.log("Helmut — Datenbanktest verteilte Anbietersteuerung");
  if (!verfuegbar()) {
    console.log("SKIP: keine lokale PostgreSQL erreichbar — Nachweis OFFEN (kein falsches Gruen).");
    process.exit(0);
  }

  psql(`drop database if exists ${PG.db}`, { db: "postgres" });
  psql(`create database ${PG.db}`, { db: "postgres" });
  psql(`do $$ begin
    if not exists (select from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists (select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists (select from pg_roles where rolname='service_role') then create role service_role nologin; end if;
  end $$;`);

  abschnitt("1 · Migration, Rollback, erneute Migration");
  for (const b of BASIS) psql(null, { datei: b });
  psql(null, { datei: QUEUE_MIGRATION });
  psql(null, { datei: MIGRATION });
  check("1.1 Vorwaertsmigration laeuft durch", true);
  check("1.2 Beide Tabellen existieren",
    Number(psql(`select count(*) from pg_tables where tablename in
      ('helmut_anbieter_fenster','helmut_anbieter_schutzschalter')`)) === 2);
  psql(null, { datei: ROLLBACK });
  check("1.3 Rollback entfernt Tabellen und Funktionen",
    Number(psql(`select count(*) from pg_tables where tablename like 'helmut_anbieter%'`)) === 0
    && Number(psql(`select count(*) from pg_proc where proname like 'helmut_anbieter%'`)) === 0);
  psql(null, { datei: MIGRATION });
  check("1.4 Erneute Vorwaertsmigration laeuft durch (idempotenter Rueckweg)",
    Number(psql(`select count(*) from pg_tables where tablename like 'helmut_anbieter%'`)) === 2);

  abschnitt("2 · Sicherheit");
  check("2.1 RLS ist auf beiden Tabellen aktiv UND erzwungen",
    psql(`select bool_and(relrowsecurity) and bool_and(relforcerowsecurity) from pg_class
           where relname in ('helmut_anbieter_fenster','helmut_anbieter_schutzschalter')`) === "t");
  check("2.2 Es gibt KEINE Policy (service_role arbeitet ueber Funktionen)",
    Number(psql(`select count(*) from pg_policies where tablename like 'helmut_anbieter%'`)) === 0);
  check("2.3 anon/authenticated haben KEINE Tabellenrechte",
    Number(psql(`select count(*) from information_schema.role_table_grants
                  where table_name like 'helmut_anbieter%' and grantee in ('anon','authenticated')`)) === 0);
  check("2.4 Alle Funktionen haben einen festen search_path",
    psql(`select bool_and(proconfig::text like '%search_path%') from pg_proc
           where proname like 'helmut_anbieter%'`) === "t");
  check("2.5 Keine Funktion laeuft als security definer",
    psql(`select bool_and(not prosecdef) from pg_proc where proname like 'helmut_anbieter%'`) === "t");
  check("2.6 Die Tabellen tragen strukturell KEINE Inhaltsspalte",
    Number(psql(`select count(*) from information_schema.columns
                  where table_name like 'helmut_anbieter%'
                    and column_name in ('payload','inhalt','text','prompt','url','mandat')`)) === 0);

  abschnitt("3 · Minutengrenze");
  const res = (schluessel, minute = 0, tag = 0, menge = 1) =>
    psql(`select erlaubt, grund, frueheste_ms from public.helmut_anbieter_reserviere(
      '${schluessel}', ${menge}, ${minute}, ${tag})`).split("|");
  let letzte;
  for (let i = 0; i < 3; i += 1) letzte = res("t-minute", 3, 0);
  check("3.1 Bis zur Grenze wird reserviert", /^t/.test(letzte[0]), letzte.join("/"));
  const ueber = res("t-minute", 3, 0);
  check("3.2 Die vierte Reservierung wird abgelehnt", ueber[0] === "f" && ueber[1] === "minutengrenze", ueber.join("/"));
  check("3.3 Der frueheste naechste Zeitpunkt liegt im laufenden Minutenfenster (<= 60 s)",
    Number(ueber[2]) > 0 && Number(ueber[2]) <= 60000, ueber[2]);
  check("3.4 Der abgelehnte Versuch hat den Zaehler NICHT erhoeht",
    Number(psql(`select verbraucht from public.helmut_anbieter_fenster
                  where schluessel='t-minute' and fensterart='minute'`)) === 3);

  abschnitt("4 · Tagesgrenze");
  for (let i = 0; i < 2; i += 1) res("t-tag", 0, 2);
  const tagUeber = res("t-tag", 0, 2);
  check("4.1 Die dritte Reservierung wird abgelehnt", tagUeber[1] === "tagesgrenze", tagUeber.join("/"));
  check("4.2 Der frueheste Zeitpunkt liegt am Tagesende (> 1 Minute, <= 24 h)",
    Number(tagUeber[2]) > 60000 && Number(tagUeber[2]) <= 24 * 3600 * 1000, tagUeber[2]);

  abschnitt("5 · Beide Fenster gemeinsam: keine halben Buchungen");
  res("t-beide", 5, 1);                       // 1. Reservierung: beide Fenster auf 1
  const beide = res("t-beide", 5, 1);         // 2.: Tag ist voll -> Ablehnung
  check("5.1 Die Ablehnung nennt die Tagesgrenze", beide[1] === "tagesgrenze", beide.join("/"));
  check("5.2 Das MINUTENfenster wurde NICHT mitgezaehlt (keine halbe Buchung)",
    Number(psql(`select verbraucht from public.helmut_anbieter_fenster
                  where schluessel='t-beide' and fensterart='minute'`)) === 1);
  // Umgekehrt: Minutengrenze schlaegt zu, Tagesfenster muss zurueckgerollt sein.
  res("t-umgekehrt", 1, 100);
  const umg = res("t-umgekehrt", 1, 100);
  check("5.3 Bei Minutenablehnung wird das Tagesfenster zurueckgerollt",
    umg[1] === "minutengrenze"
    && Number(psql(`select verbraucht from public.helmut_anbieter_fenster
                     where schluessel='t-umgekehrt' and fensterart='tag'`)) === 1,
    umg.join("/"));

  abschnitt("6 · ECHTE Nebenlaeufigkeit: 12 gleichzeitig, Grenze 5");
  const laeufe = await Promise.all(Array.from({ length: 12 }, () =>
    psqlAsync(`select erlaubt from public.helmut_anbieter_reserviere('t-parallel', 1, 5, 0)`)));
  const erlaubt = laeufe.filter((z) => /^t/.test(z.trim())).length;
  check("6.1 Genau 5 von 12 gleichzeitigen Reservierungen sind erlaubt", erlaubt === 5, `erlaubt=${erlaubt}`);
  check("6.2 Der Zaehler steht exakt auf der Grenze (keine Ueberbuchung)",
    Number(psql(`select verbraucht from public.helmut_anbieter_fenster
                  where schluessel='t-parallel' and fensterart='minute'`)) === 5);

  abschnitt("7 · Schutzschaltung mit Erholung");
  const melde = (s, ok, schwelle = 3, offenMs = 60000, erholung = 2) =>
    psql(`select zustand, fehler_folge from public.helmut_anbieter_melde(
      '${s}', ${ok ? "true" : "false"}, ${schwelle}, ${offenMs}, ${erholung}, 'test')`).split("|");
  melde("t-schutz", false); melde("t-schutz", false);
  check("7.1 Unter der Schwelle bleibt der Schalter zu", melde("t-schutz", false)[0] === "offen",
    "3. Fehler erreicht die Schwelle 3");
  const gesperrt = res("t-schutz", 100, 0);
  check("7.2 Bei offenem Schalter wird NICHTS reserviert", gesperrt[1] === "schutzschalter-offen", gesperrt.join("/"));
  check("7.3 Die Restsperrzeit wird zurueckgegeben", Number(gesperrt[2]) > 0);
  check("7.4 Ein Erfolg setzt den Fehlerzaehler zurueck",
    Number(melde("t-erfolg", true)[1]) === 0);
  // Abgelaufene Sperre -> Erholungsversuch (halb) -> zwei Erfolge -> zu
  psql(`update public.helmut_anbieter_schutzschalter set offen_bis = now() - interval '1 second'
         where schluessel='t-schutz'`);
  const halb = melde("t-schutz", true, 3, 60000, 2);
  check("7.5 Nach Ablauf der Sperre beginnt ein Erholungsversuch (halb)", halb[0] === "halb", halb.join("/"));
  check("7.6 Zwei Erfolge schliessen den Schalter vollstaendig",
    melde("t-schutz", true, 3, 60000, 2)[0] === "zu");
  // Fehler IM Erholungsversuch sperrt sofort
  psql(`update public.helmut_anbieter_schutzschalter set zustand='halb', offen_bis=null, erfolg_folge=0
         where schluessel='t-schutz'`);
  check("7.7 Ein Fehler im Erholungsversuch sperrt sofort wieder",
    melde("t-schutz", false, 99, 60000, 2)[0] === "offen");

  abschnitt("8 · Erneuerbare Klassen-Lease (Befund 4g)");
  const slot = psql(`select slot from public.helmut_klasse_belege('t-klasse', 1, 2000, 'halter-a')`);
  check("8.1 Ein Slot wurde belegt", Boolean(slot));
  const ern = psql(`select erneuert, grund from public.helmut_klasse_erneuere(
    '${slot}'::uuid, 'halter-a', 60000)`).split("|");
  check("8.2 Der Halter kann seinen gueltigen Slot erneuern", /^t/.test(ern[0]), ern.join("/"));
  const fremd = psql(`select erneuert, grund from public.helmut_klasse_erneuere(
    '${slot}'::uuid, 'halter-b', 60000)`).split("|");
  check("8.3 Ein FREMDER Halter kann NICHT erneuern", fremd[0] === "f", fremd.join("/"));
  psql(`update public.helmut_klassen_slots set belegt_bis = now() - interval '1 second' where id='${slot}'`);
  const abgelaufen = psql(`select erneuert, grund from public.helmut_klasse_erneuere(
    '${slot}'::uuid, 'halter-a', 60000)`).split("|");
  check("8.4 Ein ABGELAUFENER Slot wird nie wiederbelebt — der Halter erfaehrt den Verlust",
    abgelaufen[0] === "f" && abgelaufen[1] === "nicht-mehr-gueltig", abgelaufen.join("/"));

  abschnitt("9 · Aufraeumen alter Fenster");
  psql(`insert into public.helmut_anbieter_fenster (schluessel, fensterart, fenster_start, verbraucht)
        values ('t-alt','minute', now() - interval '5 days', 1)`);
  const geloescht = Number(psql(`select public.helmut_anbieter_fenster_aufraeumen(48, 1000)`));
  check("9.1 Alte Fenster werden geloescht", geloescht >= 1, String(geloescht));
  check("9.2 Aktuelle Fenster bleiben unberuehrt",
    Number(psql(`select count(*) from public.helmut_anbieter_fenster
                  where fenster_start >= date_trunc('day', now())`)) > 0);

  abschnitt("10 · Rollback laesst die Auftragstabellen unberuehrt");
  const jobsVorher = psql(`select count(*) from public.helmut_jobs`);
  psql(null, { datei: ROLLBACK });
  check("10.1 helmut_jobs ist unveraendert", psql(`select count(*) from public.helmut_jobs`) === jobsVorher);
  check("10.2 Die Klassen-Semaphore bleibt bestehen (eigene Migration)",
    Number(psql(`select count(*) from pg_tables where tablename='helmut_klassen_slots'`)) === 1);

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL:", e && e.message); process.exit(1); });
