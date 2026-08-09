"use strict";

// Helmut — FUENFTER AUFTRAGSTYP an einer ECHTEN PostgreSQL (E1, Migration 20260809_jobqueue_narrativ).
// =============================================================================================
// Geprueft werden genau die Zusagen, die im Betrieb zaehlen:
//
//   * VOR der Migration lehnt `helmut_enqueue_job` den Typ `tenant_narrative` ab (CHECK).
//   * Die Migration ist idempotent (zweimal anwenden ist harmlos) und ADDITIV: bestehende
//     Auftraege aller vier Alttypen bleiben byte-gleich erhalten.
//   * Danach: Einreihen, Idempotenz, Claim (auch mit Typfilter), Fremdabschluss-Schutz,
//     Zurueckstellen und Vorbedingungszaehlung arbeiten mit dem neuen Typ unveraendert.
//   * Zwei konkurrierende Claims sehen disjunkte Mengen (`for update skip locked`).
//   * Tenant-Trennung: die Zeile traegt die Mandatskennung; ein Auftrag je Mandat/Fenster.
//   * Der Kappungs-Trigger (payload > 20 000) gilt auch fuer den neuen Typ.
//   * Die Wiedervorlage (O5) fasst `tenant_narrative` in ihrer Standardtypmenge NICHT an.
//   * RLS bleibt an und erzwungen, `anon`/`authenticated` haben KEINE Rechte.
//   * ROLLBACK: entfernt die Warteschlangenzeilen des Typs (Betriebszustand, ausdruecklich
//     KEINE fachlichen Bestandsdaten — die Narrative liegen im Briefing-Tagescache),
//     stellt die Vier-Typen-CHECK-Menge wieder her und laesst alle Altzeilen unberuehrt.
//     Danach ist erneutes Anwenden moeglich (Teilzustaende geprueft).
//   * REIHENFOLGE-UNABHAENGIGKEIT: in einer zweiten Datenbank wird `narrativ` VOR
//     `wiedervorlage` angewendet — beide 20260809-Migrationen haengen nur an der Basis.
//
// OHNE lokalen Server beendet sich diese Suite mit Exit 0 und der ehrlichen Zeile
// "uebersprungen, Nachweis offen" — genau wie ihre Geschwister. VORBEHALT (Befund O21):
// der kanonische Runner zaehlt das als PASS; ein CI-Gruen schliesst diesen Nachweis NICHT ein.
//
//   Aufruf mit Server:
//     HELMUT_TEST_PG_HOST=127.0.0.1 HELMUT_TEST_PG_PORT=5433 HELMUT_TEST_PG_USER=postgres \
//       node scripts/lokal.js scripts/jobqueue-narrativ-datenbank-test.js

const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
process.env.HELMUT_SOURCE_MODE = "off";

const M = (n) => path.join(ROOT, "supabase/migrations", n);
const BASIS = M("20260808_scalable_job_queue.sql");
const ABHAENGIGKEITEN = M("20260808_jobqueue_abhaengigkeiten.sql");
const WIEDERVORLAGE = M("20260809_jobqueue_wiedervorlage.sql");
const MIGRATION = M("20260809_jobqueue_narrativ.sql");
const ROLLBACK = M("20260809_jobqueue_narrativ_rollback.sql");

const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "",
  port: process.env.HELMUT_TEST_PG_PORT || "5433",
  user: process.env.HELMUT_TEST_PG_USER || "postgres",
  db: process.env.HELMUT_TEST_PG_DB_NARRATIV || "helmut_test_narrativ",
  db2: (process.env.HELMUT_TEST_PG_DB_NARRATIV || "helmut_test_narrativ") + "_reihenfolge"
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
const wert = (sql, o) => psql(sql, o).trim().split("\n")[0];
const zahl = (sql, o) => Number(wert(sql, o));
function schlaegtFehl(sql, o) {
  try { psql(sql, o); return null; } catch (error) {
    return String((error && error.stderr) || (error && error.message) || "fehler");
  }
}

function enqueue(typ, schluessel, { tenant = null, payload = "{}", db } = {}) {
  return wert(`select neu from public.helmut_enqueue_job('${typ}', '${schluessel}', '2026-08-09T00Z',
    '${payload}'::jsonb, now(), 240::smallint, 5, ${tenant ? `'${tenant}'` : "null"});`, { db });
}

function main() {
  if (!PG.host) {
    console.log("uebersprungen, Nachweis offen: kein lokaler PostgreSQL-Server konfiguriert");
    console.log("(HELMUT_TEST_PG_HOST setzen; siehe Kopf dieser Datei). Exit 0 — aber der");
    console.log("Datenbanknachweis der Migration 20260809_jobqueue_narrativ ist damit NICHT erbracht.");
    process.exit(0);
  }
  try { psql("select 1", { db: "postgres" }); } catch (_) {
    console.log("uebersprungen, Nachweis offen: PostgreSQL nicht erreichbar. Exit 0 — Nachweis NICHT erbracht.");
    process.exit(0);
  }

  // Frische Datenbanken — die Suite legt sie SELBST an (Lehre aus Befund B14).
  for (const db of [PG.db, PG.db2]) {
    psql(`drop database if exists ${db}`, { db: "postgres" });
    psql(`create database ${db}`, { db: "postgres" });
  }

  abschnitt("1 · Ausgangslage: Basis angewendet, fuenfter Typ noch UNBEKANNT");
  psql(null, { datei: BASIS });
  psql(null, { datei: ABHAENGIGKEITEN });
  psql(null, { datei: WIEDERVORLAGE });
  check("1.1 Basis + Abhaengigkeiten + Wiedervorlage angewendet",
    zahl("select count(*) from information_schema.tables where table_name='helmut_jobs'") === 1);
  const abgelehnt = schlaegtFehl(
    "select * from public.helmut_enqueue_job('tenant_narrative','tn|m-a|F','F','{}'::jsonb)");
  check("1.2 VOR der Migration wird tenant_narrative abgelehnt (CHECK)",
    /helmut_jobs_type_chk/.test(String(abgelehnt)), String(abgelehnt).split("\n")[0]);

  // Bestandsdaten VOR der Migration — sie muessen sie unveraendert ueberleben.
  enqueue("source_fetch", "sf|alt|F");
  enqueue("mandate_projection", "mp|m-a|F", { tenant: "m-a" });
  psql("update public.helmut_jobs set status='fehlgeschlagen', attempts=5, finished_at=now(), last_error='alt-fehler' where idempotency_key='mp|m-a|F'");
  const vorher = wert("select md5(string_agg(idempotency_key || status || coalesce(last_error,''), '|' order by idempotency_key)) from public.helmut_jobs");

  abschnitt("2 · Anwendung, Wiederholung, Additivitaet");
  psql(null, { datei: MIGRATION });
  psql(null, { datei: MIGRATION });
  check("2.1 Migration zweimal angewendet — idempotent, kein Fehler", true);
  check("2.2 Die CHECK-Menge enthaelt jetzt alle FUENF Typen",
    /tenant_narrative/.test(wert("select pg_get_constraintdef(oid) from pg_constraint where conname='helmut_jobs_type_chk'")));
  check("2.3 Bestandszeilen sind byte-gleich erhalten (additiv)",
    wert("select md5(string_agg(idempotency_key || status || coalesce(last_error,''), '|' order by idempotency_key)) from public.helmut_jobs") === vorher);

  abschnitt("3 · Der fuenfte Typ im Vertragsverhalten der Warteschlange");
  check("3.1 Einreihen mit Mandatsbindung", enqueue("tenant_narrative", "tn|m-a|F", { tenant: "m-a" }) === "t");
  check("3.2 Doppeltes Einreihen ist idempotent (neu=false)",
    enqueue("tenant_narrative", "tn|m-a|F", { tenant: "m-a" }) === "f");
  check("3.3 Ein zweites Mandat bekommt seinen EIGENEN Auftrag",
    enqueue("tenant_narrative", "tn|m-b|F", { tenant: "m-b" }) === "t");
  check("3.4 Ein unbekannter Typ bleibt abgelehnt",
    /helmut_jobs_type_chk/.test(String(schlaegtFehl(
      "select * from public.helmut_enqueue_job('quatsch','q|F','F','{}'::jsonb)"))));
  check("3.5 Die Zeile traegt die Mandatskennung (Tenant-Trennung in der Ablage)",
    wert("select tenant_id from public.helmut_jobs where idempotency_key='tn|m-a|F'") === "m-a");
  const zuGross = schlaegtFehl(`select * from public.helmut_enqueue_job('tenant_narrative','tn|gross|F','F',
    ('{"x":"' || repeat('a', 20001) || '"}')::jsonb)`);
  check("3.6 Der Kappungs-Trigger gilt auch fuer den neuen Typ (payload zu gross)",
    /payload zu gross/.test(String(zuGross)));

  // Claim mit Typfilter + disjunkte Nebenlaeufigkeit.
  const w1 = psql("select id from public.helmut_claim_jobs('w1', 1, 60000, array['tenant_narrative'])").trim();
  const w2 = psql("select id from public.helmut_claim_jobs('w2', 5, 60000, array['tenant_narrative'])").trim();
  check("3.7 Zwei konkurrierende Claims sehen DISJUNKTE Narrativmengen",
    w1 && w2 && !w2.split("\n").includes(w1), `w1=${w1.slice(0, 8)}… w2=${w2.split("\n").length} weitere`);
  check("3.8 Der Typfilter liefert AUSSCHLIESSLICH tenant_narrative",
    zahl("select count(*) from public.helmut_jobs where status='laeuft' and job_type <> 'tenant_narrative'") === 0);
  check("3.9 Ein Fremdabschluss wird abgelehnt (haltergebunden)",
    wert(`select uebernommen from public.helmut_finish_job('${w1}','fremd',true)`) === "f");
  check("3.10 Zurueckstellen nimmt den Versuch zurueck (Warten ist kein Fehlversuch)",
    wert(`select uebernommen from public.helmut_defer_job('${w1}','w1',60000,'vorbedingung-offen')`) === "t"
    && zahl(`select attempts from public.helmut_jobs where id='${w1}'`) === 0);

  abschnitt("4 · Vorbedingungen und Wiedervorlage");
  check("4.1 helmut_jobs_offen zaehlt den neuen Typ (Fensterliste, Befund O3)",
    zahl("select offen from public.helmut_jobs_offen(array['2026-08-09T00Z'], array['tenant_narrative'])") >= 1);
  // Ein endgueltig gescheitertes Narrativ: die Wiedervorlage-STANDARDMENGE fasst es nicht an.
  enqueue("tenant_narrative", "tn|m-tot|F", { tenant: "m-tot" });
  psql("update public.helmut_jobs set status='fehlgeschlagen', attempts=5, finished_at=now() - interval '48 hours', last_error='narrativ-voruebergehend: ai-unavailable' where idempotency_key='tn|m-tot|F'");
  psql("select * from public.helmut_jobs_wiedervorlage(null, 24, 2, 500, false)"); // p_typen null = alle? bewusst pruefen
  const nachAlle = wert("select status from public.helmut_jobs where idempotency_key='tn|m-tot|F'");
  psql("update public.helmut_jobs set status='fehlgeschlagen', attempts=5, finished_at=now() - interval '48 hours' where idempotency_key='tn|m-tot|F'");
  psql("select * from public.helmut_jobs_wiedervorlage(array['document_understanding','source_fetch'], 24, 2, 500, false)");
  check("4.2 Die Wiedervorlage mit App-Standardtypen (Verstehen/Abruf) laesst Narrative unberuehrt",
    wert("select status from public.helmut_jobs where idempotency_key='tn|m-tot|F'") === "fehlgeschlagen",
    `p_typen=null wuerde greifen (${nachAlle}) — die App uebergibt die Typmenge ausdruecklich`);

  abschnitt("5 · Rechte und RLS unveraendert");
  check("5.1 RLS ist an und erzwungen",
    wert("select relrowsecurity::text || '/' || relforcerowsecurity::text from pg_class where relname='helmut_jobs'") === "true/true");
  check("5.2 anon/authenticated haben KEINE Rechte an helmut_jobs",
    zahl(`select count(*) from information_schema.role_table_grants
      where table_name='helmut_jobs' and grantee in ('anon','authenticated')`) === 0);

  abschnitt("6 · Rollback, Teilzustaende, erneute Anwendung");
  const altVorRollback = zahl("select count(*) from public.helmut_jobs where job_type <> 'tenant_narrative'");
  psql(null, { datei: ROLLBACK });
  psql(null, { datei: ROLLBACK });
  check("6.1 Rollback zweimal angewendet — idempotent, kein Fehler", true);
  check("6.2 Alle tenant_narrative-Warteschlangenzeilen sind entfernt (Betriebszustand)",
    zahl("select count(*) from public.helmut_jobs where job_type = 'tenant_narrative'") === 0);
  check("6.3 KEINE Altzeile wurde angefasst",
    zahl("select count(*) from public.helmut_jobs where job_type <> 'tenant_narrative'") === altVorRollback);
  check("6.4 Die CHECK-Menge kennt wieder exakt die vier Alttypen",
    !/tenant_narrative/.test(wert("select pg_get_constraintdef(oid) from pg_constraint where conname='helmut_jobs_type_chk'")));
  check("6.5 Einreihen von tenant_narrative wird wieder abgelehnt (erkennbarer Rueckfall)",
    /helmut_jobs_type_chk/.test(String(schlaegtFehl(
      "select * from public.helmut_enqueue_job('tenant_narrative','tn|wieder|F','F','{}'::jsonb)"))));
  psql(null, { datei: MIGRATION });
  check("6.6 Erneute Anwendung nach Rollback funktioniert (Teilzustand -> voller Zustand)",
    enqueue("tenant_narrative", "tn|wieder|F", { tenant: "m-a" }) === "t");

  abschnitt("7 · Reihenfolge-Unabhaengigkeit der beiden 20260809-Migrationen");
  psql(null, { datei: BASIS, db: PG.db2 });
  psql(null, { datei: MIGRATION, db: PG.db2 });        // narrativ ZUERST
  psql(null, { datei: WIEDERVORLAGE, db: PG.db2 });    // wiedervorlage danach
  check("7.1 narrativ VOR wiedervorlage angewendet — beide erfolgreich",
    /tenant_narrative/.test(wert("select pg_get_constraintdef(oid) from pg_constraint where conname='helmut_jobs_type_chk'", { db: PG.db2 }))
    && zahl("select count(*) from pg_proc where proname='helmut_jobs_wiedervorlage'", { db: PG.db2 }) === 1);
  check("7.2 Auch dort: Einreihen des fuenften Typs funktioniert",
    enqueue("tenant_narrative", "tn|r|F", { tenant: "m-r", db: PG.db2 }) === "t");

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  process.exit(fail === 0 ? 0 : 1);
}

try { main(); } catch (error) {
  console.error("TESTLAUF-FEHLER:", String((error && error.stderr) || (error && error.message) || error).slice(0, 800));
  process.exit(1);
}
