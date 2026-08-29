"use strict";

// Helmut — DATENBANKNACHWEIS des Mandatsfilters der Vorbedingungszaehlung (Befund Z22).
// =============================================================================================
// Prueft `supabase/migrations/20260826190000_jobqueue_vorbedingung_mandatsfilter.sql` an einer
// ECHTEN PostgreSQL — nicht an der Attrappe. Die Anwendungsseite prueft
// `scripts/vorbedingung-mandatsfilter-test.js`.
//
//   §1  Z22 und die vorwaerts gerichtete Korrektur laufen jeweils mit eigenem Rueckweg
//   §2  Nach der Migration existiert GENAU EINE Fassung (kein mehrdeutiger Aufruf)
//   §3  Sicherheit: keine Rechte fuer anon/authenticated, fester search_path, nur lesend
//   §4  Ohne `p_mandat` zaehlt sie exakt wie die Vorfassung (Verhaltensgleichheit)
//   §5  Mit `p_mandat`: global + eigen, niemals fremd  — DAS GEGENBEISPIEL
//   §6  Altaufruf mit ZWEI Argumenten bleibt lauffaehig (Vorgabewert)
//   §7  Zaehlmenge unveraendert: wartend/laeuft zaehlen, fehlgeschlagen nicht
//   §8  Leere oder nur aus Leerzeichen bestehende Kennung zaehlt global (fail closed)
//   §8b GEGENPROBE: eine ZEILE mit leerer `tenant_id` zaehlt global — in SQL UND Attrappe
//   §9  Der vorhandene Index traegt die Abfrage weiterhin (kein neuer Index noetig)
//   §10 Attrappe und Datenbank liefern Zahl fuer Zahl dasselbe (Vertragsgleichheit)
//   §11 Der Rueckfall OHNE angewendete Migration — gegen echtes PostgREST, nicht behauptet
//
// Ohne erreichbaren Server: ehrlicher Skip mit Exit 0 — der Nachweis ist dann OFFEN.
// Aufruf lokal: HELMUT_TEST_PG_HOST=127.0.0.1 HELMUT_TEST_PG_PORT=5434 \
//                 node scripts/lokal.js scripts/vorbedingung-mandatsfilter-datenbank-test.js

const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BASIS = path.join(ROOT, "supabase", "migrations", "20260808_scalable_job_queue.sql");
const ABHAENGIG = path.join(ROOT, "supabase", "migrations", "20260808_jobqueue_abhaengigkeiten.sql");
const MIGRATION = path.join(ROOT, "supabase", "migrations",
  "20260826190000_jobqueue_vorbedingung_mandatsfilter.sql");
const RUECKWEG = path.join(ROOT, "supabase", "migrations",
  "rollback_20260826190000_jobqueue_vorbedingung_mandatsfilter.sql");
const KORREKTUR = path.join(ROOT, "supabase", "migrations",
  "20260829123132_z22_mandatsfilter_zeilenkennung_korrigieren.sql");
const KORREKTUR_RUECKWEG = path.join(ROOT, "supabase", "migrations",
  "rollback_20260829123132_z22_mandatsfilter_zeilenkennung_korrigieren.sql");

const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "",
  port: process.env.HELMUT_TEST_PG_PORT || "5433",
  user: process.env.HELMUT_TEST_PG_USER || "helmut",
  db: process.env.HELMUT_TEST_PG_DB_Z22 || "helmut_test_z22_mandatsfilter"
};

const FENSTER = "2026-08-26T00Z";
const MANDAT_A = "synth-mandat-krank";
const MANDAT_B = "synth-mandat-gesund";

let pass = 0;
let fail = 0;
// Abschnitte, die mangels Voraussetzung NICHT gelaufen sind. Sie erscheinen namentlich in
// der Schlusszeile, damit „FAIL 0" nie mit „vollstaendig nachgewiesen" verwechselt wird.
const uebersprungen = [];
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
  return ok;
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

function psql(sql, { datei = null, db = PG.db, erwarteFehler = false } = {}) {
  const args = ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", db,
    "-tA", "-v", "ON_ERROR_STOP=1"];
  if (datei) args.push("-f", datei); else args.push("-c", sql);
  try {
    return { ok: true, out: execFileSync("psql", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() };
  } catch (error) {
    if (!erwarteFehler) throw error;
    return { ok: false, out: String((error.stderr || error.stdout || error.message) || "").trim() };
  }
}

// Eine Zeile der Zaehlung als Zahlenfeld: offen|wartend|laufend|fehlgeschlagen|erledigt
function zaehle({ mandat = undefined, typen = "array['source_fetch','mandate_projection']",
  fenster = FENSTER } = {}) {
  const arg = mandat === undefined
    ? `array['${fenster}'], ${typen}`
    : `array['${fenster}'], ${typen}, ${mandat === null ? "null" : `'${mandat}'`}`;
  const zeile = psql(`select offen||'|'||wartend||'|'||laufend||'|'||fehlgeschlagen||'|'||erledigt
                        from public.helmut_jobs_offen(${arg})`).out;
  const [offen, wartend, laufend, fehlgeschlagen, erledigt] = zeile.split("|").map(Number);
  return { offen, wartend, laufend, fehlgeschlagen, erledigt };
}

function einreihen(typ, mandat, status = "wartend", schluessel = null, fenster = FENSTER) {
  const key = schluessel || `${typ}|${mandat || "global"}|${Math.random().toString(36).slice(2)}`;
  // `helmut_jobs_lease_chk`: `laeuft` verlangt Halter UND Ablaufzeit — die Tabelle laesst
  // einen halterlosen laufenden Auftrag gar nicht erst zu. Genau so soll es sein.
  const laeuft = status === "laeuft";
  psql(`insert into public.helmut_jobs
          (job_type, idempotency_key, freshness_window, tenant_id, status, priority,
           max_attempts, payload, lease_owner, lease_expires_at)
        values ('${typ}', '${key}', '${fenster}',
                ${mandat === null ? "null" : `'${mandat}'`}, '${status}', 100, 5, '{}'::jsonb,
                ${laeuft ? "'pruefstand-w1'" : "null"},
                ${laeuft ? "now() + interval '2 minutes'" : "null"})`);
  return key;
}

// FAIL-CLOSED, wortgleich zur Regel von `browser-smoke-test.js` (Audit-Folgebranch 2026-07).
// ---------------------------------------------------------------------------------------
// Der bisherige SKIP-Pfad war fail-open: ohne `HELMUT_TEST_PG_HOST` endete dieser Nachweis
// mit Exit 0, und `run-offline-tests.js` kennt nur `exit === 0` => PASS. Der Lauf meldete
// also GRUEN, obwohl gegen die Datenbank NICHTS geprueft wurde — genau das falsche Gruen,
// das `CLAUDE.md` §4.4 verbietet. Belegt am 2026-08-28: die Abweichung zwischen SQL und
// Attrappe bei leerer `tenant_id` (§8b) konnte nur deshalb unbemerkt bleiben.
// Wo der Nachweis PFLICHT ist — der eigene CI-Schritt mit kurzlebigem Postgres-Dienst
// (`HELMUT_REQUIRE_PG=1`) oder ein Lauf ausserhalb der Offline-Suite in CI — ist eine
// fehlende Voraussetzung ein FEHLSCHLAG. Lokal ohne Server bleibt ein ehrlicher Skip.
const PFLICHT = process.env.HELMUT_REQUIRE_PG === "1"
  || (process.env.CI === "true" && process.env.HELMUT_OFFLINE_TEST !== "1");

function voraussetzungFehlt(text) {
  console.log(`\n  ${PFLICHT ? "FEHLSCHLAG" : "UEBERSPRUNGEN"}: ${text}`);
  console.log("  >> DER DATENBANKNACHWEIS IST DAMIT OFFEN, NICHT ERBRACHT. <<");
  if (PFLICHT) {
    console.log("  Dieser Lauf ist ein PFLICHTLAUF (HELMUT_REQUIRE_PG=1 bzw. CI=true).");
    console.log("  Ein Skip waere hier fail-open: er meldete Gruen fuer einen Nachweis, den");
    console.log("  niemand erbracht hat. Erwartet wird ein erreichbarer PostgreSQL-Dienst");
    console.log("  (lokal oder kurzlebiger CI-Container) in HELMUT_TEST_PG_HOST/PORT/USER.");
    process.exit(1);
  }
  console.log("  (Lokal zulaessig. In CI erzwingt HELMUT_REQUIRE_PG=1 einen echten Lauf.)");
  process.exit(0);
}

function main() {
  console.log("Helmut — Datenbanknachweis des Mandatsfilters (Befund Z22)");
  if (!PG.host) voraussetzungFehlt("kein HELMUT_TEST_PG_HOST gesetzt.");
  try {
    psql("select 1", { db: "postgres" });
  } catch (error) {
    voraussetzungFehlt(`kein erreichbarer Server (${String(error.message).slice(0, 120)}).`);
  }
  const version = psql("show server_version", { db: "postgres" }).out;
  console.log(`  PostgreSQL ${version} auf ${PG.host}:${PG.port}, Datenbank ${PG.db}\n`);

  // Frische Datenbank — nie gegen eine bestehende arbeiten.
  psql(`select count(*) from (select pg_terminate_backend(pid) from pg_stat_activity
          where datname = '${PG.db}' and pid <> pg_backend_pid()) t`, { db: "postgres" });
  psql(`drop database if exists ${PG.db}`, { db: "postgres" });
  psql(`create database ${PG.db}`, { db: "postgres" });
  psql("create extension if not exists pgcrypto");
  // SUPABASE-ROLLEN (Korrektur 2026-08-28). `20260808_scalable_job_queue.sql` enthaelt
  // unbedingte `revoke … from public, anon, authenticated` (Z. 197/540/542 ff.). Auf einem
  // FRISCHEN Cluster gibt es diese Rollen nicht, und die Basismigration bricht mit
  // `role "anon" does not exist` ab. Bisher lief dieser Nachweis nur deshalb, weil auf der
  // Arbeitsmaschine ein frueherer Lauf einer ANDEREN Suite die Rollen bereits angelegt
  // hatte (Rollen sind clusterweit, die Testdatenbank wird jedes Mal neu erzeugt) — eine
  // stille Abhaengigkeit von der Laufreihenfolge. Derselbe Block steht wortgleich in den
  // uebrigen Datenbanksuiten (z. B. `verstehen-cas-datenbank-test.js`, `outbox-mutationsprobe.js`).
  // `authenticator` braucht §11 fuer PostgREST; die Rolle wird hier mit angelegt.
  psql(`do $$
        begin
          if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
          if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
          if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
          if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit; end if;
        end $$;`);
  psql("grant anon, service_role to authenticator");
  psql(null, { datei: BASIS });
  psql(null, { datei: ABHAENGIG });

  // ═══ §1 · Z22 und vorwaerts gerichtete Korrektur ══════════════════════════════════════════
  abschnitt("1 · Z22 und die vorwaerts gerichtete Korrektur haben getrennte Rueckwege");
  const stellen = () => psql(`select coalesce(string_agg(p.pronargs::text, ',' order by p.pronargs), '-')
                                from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                               where n.nspname = 'public' and p.proname = 'helmut_jobs_offen'`).out;
  const definition = () => psql(`select pg_get_functiondef(p.oid)
                                   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                  where n.nspname = 'public' and p.proname = 'helmut_jobs_offen'
                                    and p.pronargs = 3`).out;
  check("1.1 Vorher gibt es die zweistellige Fassung", stellen() === "2", `Stellen ${stellen()}`);
  const zuFrueh = psql(null, { datei: KORREKTUR, erwarteFehler: true });
  check("1.2 Die Korrektur stoppt, wenn Z22 noch nicht installiert ist",
    !zuFrueh.ok && /dreistellige Fassung|text\[\],text\[\],text|fehlt/.test(zuFrueh.out),
    zuFrueh.ok ? "unerwartet erfolgreich" : zuFrueh.out.slice(0, 140));
  check("1.3 Der Abbruch ist atomar und laesst nur die zweistellige Fassung stehen",
    stellen() === "2", `Stellen ${stellen()}`);
  psql(null, { datei: MIGRATION });
  check("1.4 Nach Z22 gibt es die dreistellige Fassung", stellen() === "3", `Stellen ${stellen()}`);
  psql(null, { datei: RUECKWEG });
  check("1.5 Der Z22-Rueckweg stellt die zweistellige Fassung wieder her", stellen() === "2", `Stellen ${stellen()}`);
  psql(null, { datei: MIGRATION });
  check("1.6 Z22 erneut vorwaerts: wieder dreistellig", stellen() === "3", `Stellen ${stellen()}`);
  psql(null, { datei: KORREKTUR_RUECKWEG });
  const alteDefinition = definition();
  check("1.7 Der Korrekturrueckweg behaelt die dreistellige Z22-Schnittstelle",
    stellen() === "3", `Stellen ${stellen()}`);
  check("1.8 Der Korrekturrueckweg stellt exakt die alte Zeilenregel wieder her",
    /nullif\(btrim\(p_mandat\), ''\) is null/.test(alteDefinition)
      && /or j\.tenant_id is null/.test(alteDefinition)
      && !/nullif\(btrim\(j\.tenant_id/.test(alteDefinition));
  psql(null, { datei: KORREKTUR });
  const neueDefinition = definition();
  check("1.9 Die Vorwaertskorrektur behaelt die dreistellige Z22-Schnittstelle",
    stellen() === "3", `Stellen ${stellen()}`);
  check("1.10 Die Vorwaertskorrektur trimmt Parameter und Zeilenkennung ausdruecklich",
    /nullif\(btrim\(p_mandat, E' \\t\\n\\r\\f\\v'/.test(neueDefinition)
      && /nullif\(btrim\(j\.tenant_id, E' \\t\\n\\r\\f\\v'/.test(neueDefinition)
      && !/or j\.tenant_id is null/.test(neueDefinition));
  psql(null, { datei: KORREKTUR });
  check("1.11 Die Vorwaertskorrektur ist erneut anwendbar und bleibt dreistellig",
    stellen() === "3", `Stellen ${stellen()}`);

  // ═══ §2 · Genau eine Fassung ══════════════════════════════════════════════════════════════
  abschnitt("2 · Genau EINE Fassung — kein mehrdeutiger Aufruf");
  const anzahl = Number(psql(`select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                               where n.nspname = 'public' and p.proname = 'helmut_jobs_offen'`).out);
  check("2.1 Es existiert genau eine Fassung von helmut_jobs_offen", anzahl === 1, `${anzahl} Fassungen`);
  const zweiArgumente = psql(`select offen from public.helmut_jobs_offen(array['${FENSTER}'], array['source_fetch'])`,
    { erwarteFehler: true });
  check("2.2 Der Aufruf mit zwei Argumenten ist eindeutig (kein „function is not unique\")",
    zweiArgumente.ok, zweiArgumente.ok ? "" : zweiArgumente.out.slice(0, 120));

  // ═══ §3 · Sicherheit ══════════════════════════════════════════════════════════════════════
  abschnitt("3 · Sicherheit der neuen Fassung");
  const rechte = psql(`select coalesce(string_agg(distinct grantee, ','), '-')
                         from information_schema.routine_privileges
                        where routine_schema = 'public' and routine_name = 'helmut_jobs_offen'
                          and grantee in ('anon','authenticated','PUBLIC')`).out;
  check("3.1 Weder anon noch authenticated noch PUBLIC duerfen sie ausfuehren",
    rechte === "-", `gefunden: ${rechte}`);
  const konfig = psql(`select coalesce(array_to_string(p.proconfig, ','), '-')
                         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.proname = 'helmut_jobs_offen'`).out;
  check("3.2 Fester search_path ist gesetzt", /search_path=public,\s*pg_temp/.test(konfig), konfig);
  const art = psql(`select p.provolatile::text||'|'||p.prosecdef::text
                      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = 'helmut_jobs_offen'`).out;
  check("3.3 Sie ist `stable` und `security invoker` (nur lesend, keine Rechteerhoehung)",
    art === "s|false", art);

  // ═══ Prüfstand befüllen ══════════════════════════════════════════════════════════════════
  // Ein Fenster, zwei Mandate, dazu geteilte Arbeit — dieselbe Aufstellung wie im
  // Anwendungstest, damit §10 Zahl fuer Zahl vergleichen kann.
  einreihen("source_fetch", null, "wartend", "geteilt-1");             // global
  einreihen("source_fetch", MANDAT_A, "wartend", "person-a-1");        // fremd fuer B
  einreihen("source_fetch", MANDAT_B, "wartend", "person-b-1");        // eigen fuer B
  einreihen("mandate_projection", MANDAT_A, "laeuft", "proj-a-1");     // fremd, laufend
  einreihen("mandate_projection", MANDAT_B, "wartend", "proj-b-1");    // eigen
  einreihen("source_fetch", MANDAT_A, "fehlgeschlagen", "person-a-tot");
  einreihen("source_fetch", MANDAT_B, "erledigt", "person-b-fertig");

  // ═══ §4 · Ohne p_mandat: Verhaltensgleichheit ════════════════════════════════════════════
  abschnitt("4 · Ohne `p_mandat` zaehlt sie exakt wie die Vorfassung");
  const global = zaehle();
  check("4.1 Global: 5 offen (1 geteilt + 2 fremd + 2 eigen)", global.offen === 5,
    `offen ${global.offen} · wartend ${global.wartend} · laufend ${global.laufend}`);
  const globalExplizit = zaehle({ mandat: null });
  check("4.2 `p_mandat := null` ist dasselbe wie das Weglassen",
    JSON.stringify(global) === JSON.stringify(globalExplizit),
    `${JSON.stringify(global)} gegen ${JSON.stringify(globalExplizit)}`);

  // ═══ §5 · DAS GEGENBEISPIEL ══════════════════════════════════════════════════════════════
  abschnitt("5 · Mit `p_mandat`: global + eigen, niemals fremd");
  const b = zaehle({ mandat: MANDAT_B });
  check("5.1 Mandat B sieht 3 offen (1 geteilt + 2 eigen), nicht 5",
    b.offen === 3, `offen ${b.offen} · wartend ${b.wartend} · laufend ${b.laufend}`);
  check("5.2 Die fremde LAUFENDE Projektion von A zaehlt fuer B nicht",
    b.laufend === 0, `laufend ${b.laufend}`);
  const a = zaehle({ mandat: MANDAT_A });
  check("5.3 Mandat A sieht 3 offen (1 geteilt + 2 eigen), nicht 5",
    a.offen === 3, `offen ${a.offen} · wartend ${a.wartend} · laufend ${a.laufend}`);
  check("5.4 Die fremde laufende Projektion zaehlt fuer ihr EIGENES Mandat sehr wohl",
    a.laufend === 1, `laufend ${a.laufend}`);
  const fremd = zaehle({ mandat: "synth-mandat-gibt-es-nicht" });
  check("5.5 Ein unbekanntes Mandat sieht nur die geteilte Arbeit (1)",
    fremd.offen === 1, `offen ${fremd.offen}`);

  // ═══ §6 · Altaufruf ══════════════════════════════════════════════════════════════════════
  abschnitt("6 · Altaufruf mit zwei Argumenten bleibt lauffaehig");
  const alt = psql(`select offen from public.helmut_jobs_offen(array['${FENSTER}'],
                      array['source_fetch','mandate_projection'])`).out;
  check("6.1 Zwei Argumente liefern das globale Ergebnis (Vorgabewert null)",
    Number(alt) === 5, `offen ${alt}`);
  const benannt = psql(`select offen from public.helmut_jobs_offen(
                          p_fenster := array['${FENSTER}'],
                          p_typen := array['source_fetch','mandate_projection'])`).out;
  check("6.2 Auch der benannte Aufruf ohne `p_mandat` funktioniert (PostgREST-Weg)",
    Number(benannt) === 5, `offen ${benannt}`);

  // ═══ §7 · Zaehlmenge unveraendert ════════════════════════════════════════════════════════
  abschnitt("7 · Die Zaehlmenge selbst ist unveraendert");
  check("7.1 Ein ENDGUELTIG gescheiterter eigener Auftrag zaehlt nicht als offen",
    a.fehlgeschlagen === 1 && a.offen === 3,
    `fehlgeschlagen ${a.fehlgeschlagen} · offen ${a.offen}`);
  check("7.2 Ein ERLEDIGTER eigener Auftrag zaehlt nicht als offen",
    b.erledigt === 1 && b.offen === 3, `erledigt ${b.erledigt} · offen ${b.offen}`);
  check("7.3 `offen` ist weiterhin genau `wartend + laeuft`",
    b.offen === b.wartend + b.laufend && a.offen === a.wartend + a.laufend);

  // ═══ §8 · Leere Kennung ══════════════════════════════════════════════════════════════════
  abschnitt("8 · Leere Kennungen zaehlen global — auch direkt an der SQL-Grenze");
  const leer = zaehle({ mandat: "" });
  check("8.1 `p_mandat := ''` zaehlt global und damit nie weniger Vorbedingungen",
    JSON.stringify(leer) === JSON.stringify(global),
    `${JSON.stringify(leer)} gegen global ${JSON.stringify(global)}`);
  const leerzeichen = zaehle({ mandat: "   " });
  check("8.2 Eine nur aus Leerzeichen bestehende Kennung zaehlt ebenfalls global",
    JSON.stringify(leerzeichen) === JSON.stringify(global),
    `${JSON.stringify(leerzeichen)} gegen global ${JSON.stringify(global)}`);

  // ═══ §8b · GEGENPROBE: leere `tenant_id` AUF DER ZEILE ═══════════════════════════════════
  // §8 prueft die leere Kennung als ARGUMENT. Hier geht es um den anderen, bisher ungeprueften
  // Fall: eine ZEILE, deren `tenant_id` leer oder nur Leerzeichen ist. `tenant_id` ist `text`
  // ohne NOT-NULL und ohne Pruefbedingung (`20260808_scalable_job_queue.sql` Z. 111) — eine
  // solche Zeile ist also moeglich.
  //
  // WARUM DAS EINE ECHTE GEGENPROBE IST — die Zahlen VOR der Korrektur vom 28.08.2026:
  //   Datenbank (alt: `j.tenant_id is null`)            -> 2   ('' und '   ' fielen heraus)
  //   Attrappe  (alt: `z.tenant_id !== ""`)             -> 3   ('   ' zaehlte, '' auch)
  //   erwartet (sicherer Vertrag, beide Seiten)         -> 4
  // Die Gleichheitspruefung 8b.4 war damit rot und ist es nur nach BEIDEN Korrekturen nicht
  // mehr. Eine Zeile ohne brauchbaren Mandatsbezug ist geteilte Arbeit: JEDES Mandat wartet
  // auf sie (fail closed = mehr warten, nie weniger).
  //
  // Eigenes Aktualitaetsfenster, damit die Zaehlungen der Abschnitte 4 bis 10 unberuehrt
  // bleiben und dieser Abschnitt unabhaengig von der Reihenfolge gilt.
  abschnitt("8b · GEGENPROBE — leere `tenant_id` auf der ZEILE zaehlt global");
  const FENSTER_LEER = "2026-08-26T12Z";
  einreihen("source_fetch", null, "wartend", "leer-global-null", FENSTER_LEER);
  einreihen("source_fetch", "", "wartend", "leer-global-leerstring", FENSTER_LEER);
  einreihen("source_fetch", "   ", "wartend", "leer-global-leerzeichen", FENSTER_LEER);
  einreihen("source_fetch", "\t", "wartend", "leer-global-tabulator", FENSTER_LEER);
  einreihen("source_fetch", MANDAT_A, "wartend", "leer-fremd-a", FENSTER_LEER);
  einreihen("source_fetch", MANDAT_B, "wartend", "leer-eigen-b", FENSTER_LEER);

  const leerGlobal = zaehle({ fenster: FENSTER_LEER, typen: "array['source_fetch']" });
  check("8b.1 Ohne Mandat zaehlen alle sechs Zeilen (unveraendert global)",
    leerGlobal.offen === 6, `offen ${leerGlobal.offen}, erwartet 6`);

  const leerB = zaehle({ mandat: MANDAT_B, fenster: FENSTER_LEER, typen: "array['source_fetch']" });
  check("8b.2 Mit Mandat B zaehlen null + '' + '   ' + Tabulator + eigen = 5, die fremde nicht",
    leerB.offen === 5, `offen ${leerB.offen}, erwartet 5 (vor der Korrektur: 2)`);
  check("8b.3 Der Mandatsfilter wirkt hier wirklich (6 global gegen 5 gefiltert)",
    leerGlobal.offen === 6 && leerB.offen === 5 && leerB.offen < leerGlobal.offen,
    `global ${leerGlobal.offen} · gefiltert ${leerB.offen}`);

  // Die Gleichheitspruefung gegen die Attrappe (8b.4/8b.5) steht im asynchronen Block von
  // §10 — die Attrappe hat nur asynchrone Zugaenge, und `abschluss()` laeuft erst dort.

  // ═══ §9 · Kein neuer Index noetig ════════════════════════════════════════════════════════
  // WAS HIER GEPRUEFT WIRD — und was ausdruecklich NICHT: nicht, WELCHEN Index der Planer
  // waehlt (das haengt an Datenverteilung und Statistik und ist ein bekannter, aelterer
  // Befund: `skalierung-25-50-100.md` §0.2 — „nicht der Index fehlt, sondern die Form der
  // Abfrage sperrt einen vorhandenen Index aus"). Geprueft wird die Frage, die zu DIESER
  // Aenderung gehoert: kostet der Mandatsfilter etwas? Verglichen wird deshalb Plan gegen
  // Plan — mit und ohne Filter, auf denselben Daten.
  //
  // Die Fuellzeilen liegen bewusst in JULI-Fenstern: sie duerfen die Zaehlungen der
  // Abschnitte 4-8 und 10 (Augustfenster) nicht beruehren.
  abschnitt("9 · Kein neuer Index noetig — der Mandatsfilter aendert den Plan nicht");
  psql(`insert into public.helmut_jobs (job_type, idempotency_key, freshness_window, tenant_id, status, priority, max_attempts, payload)
        select 'source_fetch', 'last-'||g, '2026-07-'||lpad((1 + g % 28)::text, 2, '0')||'T00Z',
               case when g % 3 = 0 then null else 'synth-mandat-'||(g % 100) end,
               case when g % 5 = 0 then 'erledigt' else 'wartend' end, 100, 5, '{}'::jsonb
          from generate_series(1, 20000) g`);
  psql("analyze public.helmut_jobs");
  const LASTFENSTER = "2026-07-14T00Z";
  // Die Mandatsklausel steht hier WORTGLEICH so, wie sie im Rumpf der Migration steht —
  // inklusive der ausgeschriebenen Weissraummenge. Vorher stand hier
  // `(null is null or j.tenant_id is null or …)`; `null is null` ist immer WAHR, die
  // Klausel war also eine Tautologie und wurde vom Planer weggekuerzt. Gemessen wurde
  // damit gar kein Filter (Befund 2026-08-28). Jetzt wird ein ECHTES Mandat eingesetzt.
  const WR = "E' \\t\\n\\r\\f\\v'";
  const mandatsKlausel = (m) => `and (nullif(btrim('${m}', ${WR}), '') is null
           or nullif(btrim(j.tenant_id, ${WR}), '') is null
           or btrim(j.tenant_id, ${WR}) = btrim('${m}', ${WR}))`;
  const planVon = (mitFilter) => psql(`explain (analyze, format text)
      select count(*) filter (where j.status in ('wartend','laeuft'))
        from public.helmut_jobs j
       where j.freshness_window = any(array['${LASTFENSTER}'])
         and j.job_type = any(array['source_fetch'])
         ${mitFilter ? mandatsKlausel(MANDAT_B) : ""}`).out;
  const knoten = (plan) => (plan.match(/(Seq Scan|Index Scan|Index Only Scan|Bitmap Index Scan) (on|using) [a-z_]+/g) || []).join(" | ");
  const dauer = (plan) => Number((plan.match(/Execution Time: ([\d.]+) ms/) || [])[1] || NaN);
  const ohne = planVon(false);
  const mit = planVon(true);
  check("9.1 Der Zugriffsweg ist mit und ohne Mandatsfilter derselbe",
    knoten(ohne) === knoten(mit) && knoten(mit) !== "", `${knoten(mit) || "kein Scanknoten erkannt"}`);
  // ZEITSCHRANKEN SIND GROSSZUEGIG — MIT ABSICHT. Die tragende Aussage von §9 ist 9.1
  // (gleicher Zugriffsweg). 9.2 und 9.3 sind nur Grobsicherungen gegen einen echten
  // Einbruch (etwa einen Seq Scan statt Indexzugriff). Seit dieser Nachweis im
  // Pflicht-Job laeuft, teilt er sich CPU und Netzweg mit einem Dienstcontainer; enge
  // Schwellen (frueher +50 % bzw. < 50 ms) waeren dort ein Merge-Blocker aus reinem
  // Maschinenrauschen — also rotes CI ohne fachlichen Befund. Ein solcher Fehlalarm
  // ist genauso schaedlich wie falsches Gruen: er kostet Vertrauen in das Gate.
  const CI_LAUF = PFLICHT || process.env.CI === "true";
  const ZEITFAKTOR = CI_LAUF ? 4 : 2;
  const JE_AUFRUF_MS = CI_LAUF ? 400 : 150;
  check(`9.2 Die Ausfuehrungszeit waechst durch den Filter nicht sprunghaft (Faktor < ${ZEITFAKTOR})`,
    Number.isFinite(dauer(ohne)) && Number.isFinite(dauer(mit))
      && dauer(mit) <= dauer(ohne) * ZEITFAKTOR + 5,
    `ohne ${dauer(ohne)} ms · mit ${dauer(mit)} ms · Schranke ${(dauer(ohne) * ZEITFAKTOR + 5).toFixed(1)} ms`);
  const t0 = Date.now();
  for (let i = 0; i < 20; i += 1) zaehle({ mandat: MANDAT_B, typen: "array['source_fetch']" });
  const jeAufruf = (Date.now() - t0) / 20;
  check(`9.3 20 Zaehlungen auf 20 000+ Zeilen bleiben zuegig (< ${JE_AUFRUF_MS} ms je Aufruf)`,
    jeAufruf < JE_AUFRUF_MS, `${jeAufruf.toFixed(1)} ms je Aufruf (inkl. psql-Prozessstart)`);
  console.log("      (Messwerte dieser Maschine, keine Production-Werte — Supabase bleibt ungemessen.)");
  console.log("      (Die Schranken sind Grobsicherungen; die Aussage von §9 traegt 9.1.)");

  // ═══ §10 · Vertragsgleichheit ════════════════════════════════════════════════════════════
  abschnitt("10 · Attrappe und Datenbank liefern Zahl fuer Zahl dasselbe");
  {
    const treiber = require(path.join(ROOT, "scripts/fixtures/jobqueue-speicher-treiber.js"));
    const q = treiber.erzeugeSpeicherWarteschlange({ now: () => Date.parse("2026-08-26T12:00:00.000Z") });
    // Dieselben sieben Zeilen wie oben, in derselben Reihenfolge.
    const zeilen = [
      ["source_fetch", null, "wartend"], ["source_fetch", MANDAT_A, "wartend"],
      ["source_fetch", MANDAT_B, "wartend"], ["mandate_projection", MANDAT_A, "laeuft"],
      ["mandate_projection", MANDAT_B, "wartend"], ["source_fetch", MANDAT_A, "fehlgeschlagen"],
      ["source_fetch", MANDAT_B, "erledigt"]
    ];
    (async () => {
      for (let i = 0; i < zeilen.length; i += 1) {
        const [typ, mandat, status] = zeilen[i];
        await q.enqueue({
          jobType: typ, idempotencyKey: `v-${i}`, freshnessWindow: FENSTER,
          tenantId: mandat, priority: 100, maxAttempts: 5, payload: {}
        });
        if (status !== "wartend") {
          const roh = q.__zeilen ? q.__zeilen() : null;
          if (!roh) continue;
        }
      }
      // Status setzen: die Attrappe kennt keinen Direktschreibweg, also ueber ihre eigenen
      // Wege — uebernehmen laesst `laeuft` entstehen, `finish` erledigt bzw. scheitert.
      const genommen = (await q.claim({ owner: "w1", limit: 10, types: ["mandate_projection"] })).auftraege;
      const projA = genommen.find((z) => z.tenant_id === MANDAT_A);
      const projB = genommen.find((z) => z.tenant_id === MANDAT_B);
      if (projB) await q.zurueckstellen({ id: projB.id, owner: "w1", delayMs: 1000 });
      const abrufe = (await q.claim({ owner: "w2", limit: 10, types: ["source_fetch"] })).auftraege;
      const totA = abrufe.find((z) => z.tenant_id === MANDAT_A && z.idempotency_key === "v-5");
      const fertigB = abrufe.find((z) => z.tenant_id === MANDAT_B && z.idempotency_key === "v-6");
      for (const z of abrufe) {
        if (z === totA || z === fertigB) continue;
        await q.zurueckstellen({ id: z.id, owner: "w2", delayMs: 1000 });
      }
      if (fertigB) await q.finish({ id: fertigB.id, owner: "w2", ok: true });
      if (totA) {
        let ziel = totA;
        for (let i = 0; i < 6 && ziel; i += 1) {
          await q.finish({ id: ziel.id, owner: ziel === totA && i === 0 ? "w2" : "w3", ok: false, error: "tot" });
          const w = (await q.claim({ owner: "w3", limit: 10, types: ["source_fetch"] })).auftraege;
          ziel = w.find((z) => z.idempotency_key === "v-5") || null;
          for (const z of w) {
            if (z !== ziel) await q.zurueckstellen({ id: z.id, owner: "w3", delayMs: 1000 });
          }
        }
      }
      const attrappeB = await q.offeneVorbedingungen({
        fenster: [FENSTER], typen: ["source_fetch", "mandate_projection"], mandat: MANDAT_B
      });
      const dbB = zaehle({ mandat: MANDAT_B });
      check("10.1 Attrappe und Datenbank melden fuer Mandat B dieselbe Zahl offener Vorbedingungen",
        attrappeB.offen === dbB.offen,
        `Attrappe ${attrappeB.offen} · Datenbank ${dbB.offen}`);
      check("10.2 Beide melden, dass der Mandatsfilter aktiv war",
        attrappeB.mandatsfilter === true, `mandatsfilter ${attrappeB.mandatsfilter}`);

      // ═══ Nachtrag zu §8b · dieselben fuenf leeren Kennungen in der Attrappe ═══════════════
      // Hier, weil die Attrappe nur asynchrone Zugaenge hat. `leerGlobal`/`leerB` stammen aus
      // §8b weiter oben (dieselbe Funktion, per Closure sichtbar). DAS ist die eigentliche
      // Gegenprobe: vor der Korrektur meldete die Datenbank 2, die Attrappe 3 — die Zahlen
      // gingen auseinander, und keine der beiden entsprach dem sicheren Vertrag (4).
      abschnitt("8b (Nachtrag) · Attrappe gegen Datenbank bei leeren Kennungen");
      const qLeer = treiber.erzeugeSpeicherWarteschlange({ now: () => Date.parse("2026-08-26T12:00:00.000Z") });
      const leerZeilen = [null, "", "   ", "\t", MANDAT_A, MANDAT_B];
      for (let i = 0; i < leerZeilen.length; i += 1) {
        await qLeer.enqueue({
          jobType: "source_fetch", idempotencyKey: `leer-${i}`, freshnessWindow: FENSTER_LEER,
          tenantId: leerZeilen[i], priority: 100, maxAttempts: 5, payload: {}
        });
      }
      const attrappeLeerGlobal = await qLeer.offeneVorbedingungen({
        fenster: [FENSTER_LEER], typen: ["source_fetch"]
      });
      const attrappeLeerB = await qLeer.offeneVorbedingungen({
        fenster: [FENSTER_LEER], typen: ["source_fetch"], mandat: MANDAT_B
      });
      check("8b.4 Attrappe und Datenbank melden fuer die leeren Kennungen DIESELBE Zahl",
        attrappeLeerB.offen === leerB.offen,
        `Attrappe ${attrappeLeerB.offen} · Datenbank ${leerB.offen} (vor der Korrektur: 3 gegen 2)`);
      check("8b.5 Und beide nennen genau die fuenf Zeilen des sicheren Vertrags",
        attrappeLeerB.offen === 5 && leerB.offen === 5,
        `Attrappe ${attrappeLeerB.offen} · Datenbank ${leerB.offen}`);
      check("8b.6 Auch ungefiltert sind beide gleich",
        attrappeLeerGlobal.offen === leerGlobal.offen,
        `Attrappe ${attrappeLeerGlobal.offen} · Datenbank ${leerGlobal.offen}`);

      await rueckfallGegenPostgrest();
      abschluss();
    })().catch((error) => {
      console.error(`\nLAUFFEHLER (§10): ${error && error.stack ? error.stack : error}`);
      process.exit(1);
    });
  }
}


// ═══ §11 · Der Rueckfall ohne angewendete Migration ═════════════════════════════════════════
// WARUM DAS EINEN ECHTEN SERVER BRAUCHT: die ganze Sicherung haengt an einer Annahme ueber
// einen FREMDEN Dienst — dass PostgREST einen Aufruf mit unbekanntem Argumentnamen mit
// `PGRST202` beantwortet. Diese Annahme laesst sich nicht durch Lesen pruefen, nur durch
// Fragen. Faellt sie, waere die Folge kein Fehler, sondern ein STILLES ABSCHALTEN der
// Reihenfolgezusage in Production: `verfuegbar:false` -> `vorbedingungOffen` gibt `null`
// zurueck -> es wird gar nicht mehr geprueft. Genau die Reihenfolge Code-erst-Migration-
// spaeter ist bei Helmut der Normalfall (Merge = Deployment, Migration freigabepflichtig).
async function rueckfallGegenPostgrest() {
  abschnitt("11 · Rueckfall ohne angewendete Migration — gegen echtes PostgREST");
  const POSTGREST = process.env.HELMUT_Z3_POSTGREST || "";
  if (!POSTGREST || !fs.existsSync(POSTGREST)) {
    // ZWEITE, UNABHAENGIGE VORAUSSETZUNG. `HELMUT_REQUIRE_PG=1` erzwingt §1-§10, nicht §11:
    // dieser Abschnitt braucht zusaetzlich ein PostgREST-Binary. Wer den Rueckfallnachweis
    // verbindlich haben will, setzt `HELMUT_REQUIRE_POSTGREST=1` — dann ist ein fehlendes
    // Binary ein FEHLSCHLAG statt eines Skips. Der CI-Schritt setzt das bewusst NICHT: das
    // Binary ist dort nicht vorhanden und muesste aus einer externen Quelle geladen werden.
    // Deshalb heisst der Schritt ausdruecklich nur "§1-§10" und behauptet §11 nicht mit.
    const pflichtRueckfall = process.env.HELMUT_REQUIRE_POSTGREST === "1";
    console.log(`  ${pflichtRueckfall ? "FEHLSCHLAG" : "UEBERSPRUNGEN"}: kein lokales PostgREST (HELMUT_Z3_POSTGREST).`);
    console.log("  >> DER RUECKFALLNACHWEIS IST DAMIT OFFEN, NICHT ERBRACHT. <<");
    if (pflichtRueckfall) {
      console.log("  HELMUT_REQUIRE_POSTGREST=1 verlangt diesen Abschnitt ausdruecklich.");
      check("11.0 PostgREST-Binary vorhanden (HELMUT_REQUIRE_POSTGREST=1)", false,
        "HELMUT_Z3_POSTGREST zeigt auf kein vorhandenes Binary");
      return;
    }
    uebersprungen.push("§11 Rueckfall gegen echtes PostgREST (kein HELMUT_Z3_POSTGREST)");
    return;
  }
  const arbeit = fs.mkdtempSync(path.join(os.tmpdir(), "z22-rueckfall-"));
  const geheim = crypto.randomBytes(32).toString("hex");
  const port = 3900 + (process.pid % 90);
  fs.writeFileSync(path.join(arbeit, "postgrest.conf"),
    `db-uri = "postgres://authenticator@${PG.host}:${PG.port}/${PG.db}"\n`
    + 'db-schemas = "public"\ndb-anon-role = "anon"\ndb-pool = 5\n'
    + `jwt-secret = "${geheim}"\nserver-host = "127.0.0.1"\nserver-port = ${port}\n`
    + 'log-level = "error"\n', "utf8");
  const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const kopf = b({ alg: "HS256", typ: "JWT" });
  const rumpf = b({ role: "service_role", iss: "helmut-z22-lokal", exp: Math.floor(Date.now() / 1000) + 3600 });
  const token = `${kopf}.${rumpf}.${crypto.createHmac("sha256", geheim).update(`${kopf}.${rumpf}`).digest("base64url")}`;

  const log = fs.openSync(path.join(arbeit, "postgrest.log"), "a");
  const kind = spawn(POSTGREST, [path.join(arbeit, "postgrest.conf")], { stdio: ["ignore", log, log] });
  let tor = null;
  const stoppe = () => { try { kind.kill("SIGTERM"); } catch (_) { /* egal */ } };
  try {
    let bereit = false;
    for (let i = 0; i < 60 && !bereit; i += 1) {
      try {
        const a = await fetch(`http://127.0.0.1:${port}/rpc/helmut_jobs_offen`, {
          method: "POST",
          headers: { apikey: token, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ p_fenster: null, p_typen: null })
        });
        bereit = a.ok;
      } catch (_) { /* noch nicht da */ }
      if (!bereit) await new Promise((r) => setTimeout(r, 500));
    }
    if (!check("11.1 PostgREST ist erreichbar", bereit)) return;

    // ZURUECK AUF DEN ALTEN STAND: nur die zweistellige Fassung, wie in Production heute.
    psql(null, { datei: RUECKWEG });
    // PostgREST muss sein Schema neu einlesen, sonst kennt es die alte Signatur nicht.
    try { kind.kill("SIGUSR1"); } catch (_) { /* egal */ }
    await new Promise((r) => setTimeout(r, 1500));

    const frage = async (koerper) => {
      const a = await fetch(`http://127.0.0.1:${port}/rpc/helmut_jobs_offen`, {
        method: "POST",
        headers: { apikey: token, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(koerper)
      });
      return { status: a.status, text: (await a.text()).slice(0, 300) };
    };
    const mitMandat = await frage({ p_fenster: null, p_typen: null, p_mandat: MANDAT_B });
    check("11.2 Die alte Fassung lehnt den Aufruf MIT `p_mandat` ab",
      mitMandat.status >= 400, `HTTP ${mitMandat.status}`);
    check("11.3 Sie tut es mit genau dem Code, auf den der Rueckfall hoert (PGRST202)",
      /PGRST202/.test(mitMandat.text), mitMandat.text.slice(0, 140));
    const ohneMandat = await frage({ p_fenster: null, p_typen: null });
    check("11.4 Der Aufruf OHNE `p_mandat` beantwortet die alte Fassung normal",
      ohneMandat.status === 200, `HTTP ${ohneMandat.status}`);

    // JETZT DER ECHTE PFAD: `storage.jobQueueOffeneVorbedingungen` gegen genau diesen Server.
    // WICHTIG — dieselbe Aufteilung wie Supabase: die Anwendung ruft `/rest/v1/rpc/...`,
    // PostgREST selbst kennt kein Praefix. Ohne das Tor davor bekaeme der Anwendungscode ein
    // schlichtes 404 auf den Pfad und der Rueckfall haette aus dem falschen Grund gegriffen.
    // (Genau daran ist die erste Fassung dieses Abschnitts gescheitert — der Test sprach
    // rohes PostgREST an, die Anwendung spricht das Tor.)
    const P = require(path.join(ROOT, "scripts/fixtures/z3-plattform.js"));
    tor = await P.starteDatenbankTor({ postgrestPort: port });
    process.env.SUPABASE_URL = tor.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = token;
    process.env.HELMUT_STORAGE_BACKEND = "supabase";
    delete require.cache[require.resolve(path.join(ROOT, "lib/helmut/storage.js"))];
    const storage = require(path.join(ROOT, "lib/helmut/storage.js"));
    const stand = await storage.jobQueueOffeneVorbedingungen({
      fenster: null, typen: ["source_fetch", "mandate_projection"], mandat: MANDAT_B
    });
    check("11.5 Der Anwendungscode faellt auf die globale Zaehlung zurueck statt auszufallen",
      stand.verfuegbar === true && stand.mandatsfilter === false,
      `verfuegbar ${stand.verfuegbar} · mandatsfilter ${stand.mandatsfilter} · offen ${stand.offen}`);
    check("11.6 Er benennt den Rueckfall ausdruecklich (kein stilles Abschalten)",
      stand.grund === "mandatsfilter-migration-fehlt", `grund ${stand.grund}`);
    // Verglichen wird mit DENSELBEN Argumenten wie der Rueckfallaufruf (alle Fenster,
    // dieselben zwei Typen) — nicht mit der Zaehlung der Abschnitte 4-8, die auf EIN Fenster
    // eingeschraenkt ist. (Daran ist die erste Fassung dieser Pruefung gescheitert: sie
    // verglich 16 005 gegen 5 und behauptete damit einen Fehler, der keiner war.)
    const globalGleicheArgumente = Number(psql(
      "select offen from public.helmut_jobs_offen(null::text[],"
      + " array['source_fetch','mandate_projection'])").out);
    check("11.7 Die zurueckgefallene Zahl ist die ALTE, globale Zahl",
      stand.offen === globalGleicheArgumente,
      `Rueckfall ${stand.offen} · global ${globalGleicheArgumente} (gleiche Argumente)`);
  } finally {
    if (tor) { try { await tor.stoppe(); } catch (_) { /* egal */ } }
    stoppe();
    psql(null, { datei: MIGRATION });   // Z22 wieder herstellen
    psql(null, { datei: KORREKTUR });   // kanonischen Konvergenzstand wieder herstellen
    try { fs.rmSync(arbeit, { recursive: true, force: true }); } catch (_) { /* egal */ }
  }
}

function abschluss() {
  psql(`select count(*) from (select pg_terminate_backend(pid) from pg_stat_activity
          where datname = '${PG.db}' and pid <> pg_backend_pid()) t`, { db: "postgres" });
  psql(`drop database if exists ${PG.db}`, { db: "postgres" });
  console.log("\n== ERGEBNIS ==");
  console.log(`PASS ${pass}  FAIL ${fail}`);
  // KEIN FALSCHES GRUEN (CLAUDE.md §4.4): ein uebersprungener Abschnitt darf in der
  // Schlusszeile nicht verschwinden. "PASS n / FAIL 0" laese sich sonst als vollstaendiger
  // Nachweis, obwohl ein Teil gar nicht gelaufen ist.
  if (uebersprungen.length) {
    console.log(`UEBERSPRUNGEN ${uebersprungen.length}: ${uebersprungen.join(" · ")}`);
    console.log("  >> Diese Abschnitte sind OFFEN, nicht erbracht. Das Gesamtergebnis ist");
    console.log("     insoweit KEIN vollstaendiger Nachweis. <<");
  } else if (fail === 0) {
    console.log("UEBERSPRUNGEN 0 — alle Abschnitte sind wirklich gelaufen.");
  } else {
    console.log("UEBERSPRUNGEN 0 — kein Abschnitt wurde ausgelassen; rote Kriterien siehe oben.");
  }
  process.exit(fail > 0 ? 1 : 0);
}

try {
  main();
} catch (error) {
  console.error(`\nLAUFFEHLER: ${error && error.stack ? error.stack : error}`);
  process.exit(1);
}
