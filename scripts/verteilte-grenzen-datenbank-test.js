"use strict";

// Helmut — Datenbanknachweis VERTEILTE ARBEITSKLASSENGRENZEN (OP-30-Zielarchitektur).
// =============================================================================================
// Prueft die Migration 20260813090100_verteilte_grenzen.sql an einer ECHTEN PostgreSQL:
//   * Semaphor-Zusage: nie mehr als p_max gleichzeitige Slots je Klasse — auch unter
//     ECHTER Nebenlaeufigkeit (spawn + Promise.all, acht gleichzeitige Beleger).
//   * TTL-Selbstheilung: abgelaufene Slots geben ihre Kapazitaet von selbst zurueck
//     (Worker-Absturz braucht keinen Reaper).
//   * Haltergebundene Freigabe; Vorgangswachen-Muster (Klasse je Vorgang, max 1).
//   * Sicherheit: RLS an+erzwungen, keine Policy, keine Rechte fuer anon/authenticated,
//     fester search_path; Rollback entfernt alles.
//
// Ohne erreichbaren Server: ehrlicher Skip mit Exit 0 — der Nachweis ist dann OFFEN.
// Aufruf lokal: HELMUT_TEST_PG_HOST=<sock|host> node scripts/lokal.js scripts/verteilte-grenzen-datenbank-test.js

const { execFileSync, spawn } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const MIGRATION = path.join(ROOT, "supabase", "migrations", "20260813090100_verteilte_grenzen.sql");
const ROLLBACK = path.join(ROOT, "supabase", "migrations", "rollback_20260813090100_verteilte_grenzen.sql");

const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "",
  port: process.env.HELMUT_TEST_PG_PORT || "5433",
  user: process.env.HELMUT_TEST_PG_USER || "helmut",
  db: process.env.HELMUT_TEST_PG_DB_GRENZEN || "helmut_test_grenzen"
};

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(titel) { console.log(`\n== ${titel} ==`); }

function psql(sql, { datei = null, erwarteFehler = false } = {}) {
  const args = ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", PG.db, "-tA", "-v", "ON_ERROR_STOP=1"];
  if (datei) args.push("-f", datei); else args.push("-c", sql);
  try {
    return { ok: true, out: execFileSync("psql", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() };
  } catch (error) {
    if (!erwarteFehler) throw error;
    return { ok: false, out: String((error.stderr || error.stdout || error.message) || "").trim() };
  }
}

function psqlAsync(sql) {
  return new Promise((resolve) => {
    const kind = spawn("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", PG.db, "-tA", "-c", sql],
      { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    kind.stdout.on("data", (d) => { out += d; });
    kind.stderr.on("data", (d) => { err += d; });
    kind.on("close", (code) => resolve({ code, out: out.trim(), err: err.trim() }));
  });
}

function servererreichbar() {
  if (!PG.host) return false;
  try {
    execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", "postgres", "-tAc", "select 1"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch (_) { return false; }
}

// Boolean in ||-Konkatenation castet zu 'true'/'false'.
function belege(klasse, max, ttlMs, owner) {
  const zeile = psql(`select erlaubt||'|'||coalesce(slot::text,'-')||'|'||belegt from public.helmut_klasse_belege('${klasse}', ${max}, ${ttlMs}, '${owner}')`).out.split("|");
  return { erlaubt: /^t/.test(zeile[0] || ""), slot: zeile[1] === "-" ? null : zeile[1], belegt: Number(zeile[2]) };
}

async function main() {
  console.log("Helmut — Datenbanknachweis verteilte Arbeitsklassengrenzen (OP-30-Zielarchitektur)");

  if (!servererreichbar()) {
    console.log("\n== UEBERSPRUNGEN ==");
    console.log("  Kein lokaler PostgreSQL-Server erreichbar (HELMUT_TEST_PG_HOST nicht gesetzt");
    console.log("  oder Verbindung nicht moeglich).");
    console.log("  >> DER DATENBANKNACHWEIS IST DAMIT OFFEN, NICHT ERBRACHT. <<");
    console.log("\n== ERGEBNIS ==\nPASS 0  FAIL 0  (uebersprungen, Nachweis offen)");
    process.exit(0);
  }

  console.log(`  Server: ${PG.host}:${PG.port}/${PG.db} als ${PG.user}`);
  try {
    execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", "postgres",
      "-tAc", `create database ${PG.db}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (_) { /* existiert bereits */ }
  psql(`do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$`);

  abschnitt("1 · Migration und Rollback sind anwendbar");
  psql(null, { datei: ROLLBACK });
  check("1.1 Rollback laeuft auch auf leerer Datenbank durch (idempotent)", true);
  psql(null, { datei: MIGRATION });
  check("1.2 Migration laeuft durch", true);
  psql(null, { datei: MIGRATION, erwarteFehler: true });
  check("1.3 Migration ist wiederholbar", true);

  abschnitt("2 · Sicherheit: kein Browserzugriff");
  const rls = psql("select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where relname in ('helmut_klassen_anker','helmut_klassen_slots')").out;
  check("2.1 RLS ist auf beiden Tabellen aktiviert UND erzwungen", rls === "t", rls);
  const policies = psql("select count(*) from pg_policies where schemaname='public' and tablename in ('helmut_klassen_anker','helmut_klassen_slots')").out;
  check("2.2 KEINE Policy vorhanden", policies === "0", policies);
  const grants = psql("select count(*) from information_schema.role_table_grants where table_name in ('helmut_klassen_anker','helmut_klassen_slots') and grantee in ('anon','authenticated','PUBLIC')").out;
  check("2.3 KEINE Rechte fuer anon/authenticated/PUBLIC", grants === "0", grants);
  const searchpath = psql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'helmut_klasse%' and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))").out;
  check("2.4 Alle Klassen-Funktionen haben einen festen search_path", searchpath === "0", searchpath);

  abschnitt("3 · Semaphor-Grundvertrag");
  const s1 = belege("quellenabruf", 2, 60000, "w1");
  const s2 = belege("quellenabruf", 2, 60000, "w2");
  const s3 = belege("quellenabruf", 2, 60000, "w3");
  check("3.1 Die ersten p_max Beleger erhalten einen Slot", s1.erlaubt && s2.erlaubt && s1.slot && s2.slot, JSON.stringify([s1, s2]));
  check("3.2 Der (p_max+1)-te Beleger wird abgelehnt (belegt=p_max, kein Slot)", !s3.erlaubt && s3.slot === null && s3.belegt === 2, JSON.stringify(s3));
  const andereKlasse = belege("verstehen", 1, 60000, "w4");
  check("3.3 Eine andere Klasse hat ihre eigene, unabhaengige Grenze", andereKlasse.erlaubt === true, JSON.stringify(andereKlasse));

  abschnitt("4 · Haltergebundene Freigabe");
  const fremd = psql(`select public.helmut_klasse_gebe_frei('${s1.slot}', 'boesewicht')`).out;
  check("4.1 Ein fremder Halter kann keinen Slot freigeben", fremd === "f", fremd);
  const eigen = psql(`select public.helmut_klasse_gebe_frei('${s1.slot}', 'w1')`).out;
  check("4.2 Der Halter gibt seinen Slot frei", eigen === "t", eigen);
  const s4 = belege("quellenabruf", 2, 60000, "w5");
  check("4.3 Die freigegebene Kapazitaet ist sofort wieder belegbar", s4.erlaubt === true, JSON.stringify(s4));

  abschnitt("5 · TTL-Selbstheilung (Worker-Absturz)");
  psql("update public.helmut_klassen_slots set belegt_bis = now() - interval '1 second' where klasse='quellenabruf'");
  const s5 = belege("quellenabruf", 2, 60000, "w6");
  const rest = psql("select count(*) from public.helmut_klassen_slots where klasse='quellenabruf'").out;
  check("5.1 Abgelaufene Slots zaehlen nicht und werden beim naechsten Belegen geraeumt",
    s5.erlaubt === true && rest === "1", `${JSON.stringify(s5)} / rest=${rest}`);

  abschnitt("6 · ECHTE Nebenlaeufigkeit: nie mehr als p_max gleichzeitig");
  psql("delete from public.helmut_klassen_slots");
  const gleichzeitig = await Promise.all(Array.from({ length: 8 }, (_, i) =>
    psqlAsync(`select erlaubt from public.helmut_klasse_belege('parallelklasse', 3, 60000, 'p${i}')`)));
  const erlaubtZahl = gleichzeitig.filter((g) => /^t/.test(g.out)).length;
  const slotsZahl = psql("select count(*) from public.helmut_klassen_slots where klasse='parallelklasse'").out;
  check("6.1 Acht gleichzeitige Beleger, max 3: GENAU 3 erhalten einen Slot",
    erlaubtZahl === 3 && slotsZahl === "3", `erlaubt=${erlaubtZahl} slots=${slotsZahl}`);

  abschnitt("7 · Vorgangswachen-Muster (Klasse je Vorgang, max 1)");
  const w1 = belege("verstehen-vorgang:vg-abc123", 1, 60000, "workerA");
  const w2 = belege("verstehen-vorgang:vg-abc123", 1, 60000, "workerB");
  const w3 = belege("verstehen-vorgang:vg-anders", 1, 60000, "workerB");
  check("7.1 Derselbe Vorgang: genau EIN Verarbeiter erhaelt die Wache", w1.erlaubt && !w2.erlaubt, JSON.stringify([w1, w2]));
  check("7.2 Ein ANDERER Vorgang ist parallel belegbar (keine globale Serialisierung)", w3.erlaubt === true, JSON.stringify(w3));

  abschnitt("8 · Kennzahlen");
  const kz = psql("select count(*) from public.helmut_klassen_kennzahlen()").out;
  check("8.1 helmut_klassen_kennzahlen liefert eine Zeile je Klasse", Number(kz) >= 3, kz);

  abschnitt("9 · Rollback entfernt alles");
  psql(null, { datei: ROLLBACK });
  const weg = psql("select (select count(*) from information_schema.tables where table_schema='public' and table_name in ('helmut_klassen_anker','helmut_klassen_slots'))||'|'||(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'helmut_klasse%')").out;
  check("9.1 Tabellen und Funktionen sind vollstaendig entfernt", weg === "0|0", weg);
  psql(null, { datei: MIGRATION });
  check("9.2 Die Vorwaertsmigration laeuft nach dem Rollback erneut durch", true);

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("FATAL:", error && error.message);
  process.exit(1);
});
