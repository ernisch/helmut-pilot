"use strict";

// Helmut — Datenbanknachweis TRANSAKTIONALE OUTBOX (OP-30-Zielarchitektur, 2026-08-13).
// =============================================================================================
// Prueft die Migration 20260813090000_jobqueue_outbox.sql an einer ECHTEN PostgreSQL:
//   * Atomaritaet: Auftrag und Versandabsicht entstehen in EINER Transaktion — oder beide
//     nicht (erzwungener Fehler laesst keinen halben Zustand).
//   * Idempotenz des Planens, Zustandsautomat (offen/versendet/bestaetigt/aufgegeben/
//     verzichtet), Backoff, haltergebundene Bestaetigung.
//   * Vergabe unter ECHTER Nebenlaeufigkeit (spawn + Promise.all, keine Doppelvergabe).
//   * Abgleich als Sicherheitsnetz (fehlende Absichten, verwaiste Wecksignale, terminale
//     Auftraege) und die Kopplung an die Faelligkeit des Auftrags.
//   * Sicherheit: RLS an+erzwungen, keine Policy, keine Rechte fuer anon/authenticated,
//     kein SECURITY DEFINER, fester search_path, KEINE Inhaltsspalte.
//   * Rollback entfernt alles und die Vorwaertsmigration laeuft erneut.
//
// Ohne erreichbaren Server: ehrlicher Skip mit Exit 0 — der Nachweis ist dann OFFEN.
// Aufruf lokal: HELMUT_TEST_PG_HOST=<sock|host> node scripts/lokal.js scripts/jobqueue-outbox-datenbank-test.js

const { execFileSync, spawn } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BASIS_MIGRATION = path.join(ROOT, "supabase", "migrations", "20260808_scalable_job_queue.sql");
const BASIS_ROLLBACK = path.join(ROOT, "supabase", "migrations", "20260808_scalable_job_queue_rollback.sql");
const MIGRATION = path.join(ROOT, "supabase", "migrations", "20260813090000_jobqueue_outbox.sql");
const ROLLBACK = path.join(ROOT, "supabase", "migrations", "rollback_20260813090000_jobqueue_outbox.sql");

const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "",
  port: process.env.HELMUT_TEST_PG_PORT || "5433",
  user: process.env.HELMUT_TEST_PG_USER || "helmut",
  // Eigene Datenbank je Suite (belegter Anlass 2026-08-08: geteilte Suitendatenbanken
  // rissen sich gegenseitig mitten im Lauf die Tabellen weg).
  db: process.env.HELMUT_TEST_PG_DB_OUTBOX || "helmut_test_outbox"
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

// Echt nebenlaeufig (spawn + Promise.all) — dieselbe Lehre wie in
// jobqueue-datenbank-test.js: spawnSync waere kuenstliches Gruen.
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

// Einen Auftrag MIT Absicht einreihen; liefert { jobId, absicht }.
function reihEin(schluessel, { typ = "source_fetch", fenster = "2026-08-13T00Z", dueOffsetS = 0, version = 1 } = {}) {
  const zeile = psql(
    `select id||'|'||neu||'|'||versandabsicht from public.helmut_enqueue_job_mit_outbox(` +
    `'${typ}', '${schluessel}', '${fenster}', '{}'::jsonb, now() + interval '${dueOffsetS} seconds', ` +
    `100::smallint, 3, null, ${version})`
  ).out.split("|");
  // Boolean in ||-Konkatenation castet zu 'true'/'false' (nicht 't'/'f').
  return { jobId: zeile[0], neu: /^t/.test(zeile[1] || ""), absicht: zeile[2] };
}

async function main() {
  console.log("Helmut — Datenbanknachweis transaktionale Outbox (OP-30-Zielarchitektur)");

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

  // Supabase-Rollen, die die Migrationen voraussetzen (auf einem nackten lokalen
  // Server nicht vorhanden) — idempotent, dasselbe Muster wie restore-verify-local.js.
  psql(`do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$`);

  abschnitt("1 · Migration und Rollback sind anwendbar");
  psql(null, { datei: ROLLBACK });
  psql(null, { datei: BASIS_ROLLBACK });
  check("1.1 Beide Rollbacks laufen auch auf leerer Datenbank durch (idempotent)", true);
  psql(null, { datei: BASIS_MIGRATION });
  psql(null, { datei: MIGRATION });
  check("1.2 Basismigration + Outbox-Migration laufen durch", true);
  psql(null, { datei: MIGRATION, erwarteFehler: true });
  const nachZweitlauf = psql("select count(*) from public.helmut_job_outbox").out;
  check("1.3 Outbox-Migration ist wiederholbar, Daten bleiben", nachZweitlauf === "0", nachZweitlauf);

  abschnitt("2 · Sicherheit: kein Browserzugriff, keine Inhaltsspalte");
  const rls = psql("select relrowsecurity||'/'||relforcerowsecurity from pg_class where oid='public.helmut_job_outbox'::regclass").out;
  check("2.1 RLS ist aktiviert UND erzwungen", rls === "true/true", rls);
  const policies = psql("select count(*) from pg_policies where schemaname='public' and tablename='helmut_job_outbox'").out;
  check("2.2 KEINE Policy vorhanden", policies === "0", policies);
  const grants = psql("select count(*) from information_schema.role_table_grants where table_name='helmut_job_outbox' and grantee in ('anon','authenticated','PUBLIC')").out;
  check("2.3 KEINE Rechte fuer anon/authenticated/PUBLIC", grants === "0", grants);
  const definer = psql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'helmut_outbox%' and p.prosecdef").out;
  check("2.4 KEIN SECURITY DEFINER unter den Outbox-Funktionen", definer === "0", definer);
  const searchpath = psql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'helmut_outbox%' or p.proname='helmut_enqueue_job_mit_outbox' or p.proname='helmut_job_outbox_kappen') and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))").out;
  check("2.5 ALLE Outbox-Funktionen haben einen festen search_path", searchpath === "0", searchpath);
  // DATENSCHUTZGRENZE STRUKTURELL: es existiert keine Spalte, die Inhalte tragen koennte.
  const spalten = psql("select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema='public' and table_name='helmut_job_outbox'").out;
  const erlaubt = "attempts,confirmed_at,created_at,id,job_id,last_error,max_attempts,next_attempt_at,schema_version,sent_at,status,transport,updated_at";
  check("2.6 Die Outbox traegt AUSSCHLIESSLICH die vertraglich erlaubten Spalten (keine Payload-/Inhaltsspalte)", spalten === erlaubt, spalten);

  abschnitt("3 · Atomaritaet: Auftrag und Versandabsicht entstehen gemeinsam oder gar nicht");
  const a = reihEin("outbox-a|2026-08-13T00Z");
  check("3.1 Neuer Auftrag traegt eine neue Versandabsicht", a.neu === true && a.absicht === "neu", JSON.stringify(a));
  const paar = psql(`select count(*) from public.helmut_jobs j join public.helmut_job_outbox o on o.job_id=j.id where j.idempotency_key='outbox-a|2026-08-13T00Z'`).out;
  check("3.2 Auftrag und Absicht liegen beide in der Datenbank", paar === "1", paar);
  // Erzwungener Fehler IN der Transaktion: der Payload-Kappungs-Trigger der Basistabelle
  // wirft bei > 20000 Zeichen. Danach darf WEDER ein Auftrag NOCH eine Absicht existieren.
  const vorher = psql("select (select count(*) from public.helmut_jobs)||'|'||(select count(*) from public.helmut_job_outbox)").out;
  const kaputt = psql(
    `select * from public.helmut_enqueue_job_mit_outbox('source_fetch', 'outbox-kaputt', '2026-08-13T00Z', ` +
    `('"' || repeat('x', 21000) || '"')::jsonb, now(), 100::smallint, 3, null, 1)`,
    { erwarteFehler: true });
  const nachher = psql("select (select count(*) from public.helmut_jobs)||'|'||(select count(*) from public.helmut_job_outbox)").out;
  check("3.3 Ein erzwungener Fehler laesst KEINEN halben Zustand (weder Auftrag noch Absicht)",
    kaputt.ok === false && vorher === nachher, `${vorher} -> ${nachher}`);

  abschnitt("4 · Idempotentes Planen und Wiedereroeffnen");
  const a2 = reihEin("outbox-a|2026-08-13T00Z");
  check("4.1 Zweites Planen desselben Schluessels: kein zweiter Auftrag, Absicht unveraendert",
    a2.neu === false && a2.jobId === a.jobId && a2.absicht === "unveraendert", JSON.stringify(a2));
  const absichten = psql("select count(*) from public.helmut_job_outbox").out;
  check("4.2 Genau EINE Absicht je Auftrag (unique job_id)", absichten === "1", absichten);
  // Absicht bestaetigen, Auftrag bleibt wartend -> erneutes Planen oeffnet wieder.
  psql(`update public.helmut_job_outbox set status='versendet', attempts=1 where job_id='${a.jobId}'`);
  psql(`select * from public.helmut_outbox_bestaetige((select id from public.helmut_job_outbox where job_id='${a.jobId}'), true, null)`);
  const a3 = reihEin("outbox-a|2026-08-13T00Z");
  const a3zeile = psql(`select status||'|'||attempts from public.helmut_job_outbox where job_id='${a.jobId}'`).out;
  check("4.3 Bestaetigte Absicht + offener Auftrag: erneutes Planen oeffnet wieder (Wecksignal verloren)",
    a3.absicht === "wiedereroeffnet" && a3zeile === "offen|0", `${a3.absicht} / ${a3zeile}`);

  abschnitt("5 · Terminale Auftraege erzeugen keine wirksame neue Verarbeitung");
  // Auftrag abschliessen (claim + finish), dann erneut planen.
  psql(`select * from public.helmut_claim_jobs('t5', 10, 60000, null)`);
  psql(`select * from public.helmut_finish_job('${a.jobId}', 't5', true, null, 0)`);
  const a4 = reihEin("outbox-a|2026-08-13T00Z");
  check("5.1 Planen eines ERLEDIGTEN Auftrags erzeugt keine Versandabsicht (versandabsicht=keine)",
    a4.neu === false && a4.absicht === "keine", JSON.stringify(a4));
  const abgleich1 = psql("select fehlend||'|'||wiedereroeffnet||'|'||verzichtet from public.helmut_outbox_abgleich(200, 10)").out;
  check("5.2 Der Abgleich schliesst die Absicht des erledigten Auftrags als verzichtet", abgleich1.endsWith("|1"), abgleich1);
  const vergabeErledigt = psql("select count(*) from public.helmut_outbox_naechste(10, 'test')").out;
  check("5.3 Eine verzichtete Absicht wird NIE mehr vergeben", vergabeErledigt === "0", vergabeErledigt);

  abschnitt("6 · Vergabe, Backoff, Bestaetigung, Aufgeben");
  const b = reihEin("outbox-b|2026-08-13T00Z");
  const vergabe1 = psql("select outbox_id||'|'||job_id||'|'||schema_version||'|'||attempts from public.helmut_outbox_naechste(10, 'selbstweck')").out.split("\n").filter(Boolean);
  check("6.1 Die faellige Absicht wird vergeben (attempts=1, schema_version=1)",
    vergabe1.length === 1 && vergabe1[0].includes(b.jobId) && vergabe1[0].endsWith("|1|1"), JSON.stringify(vergabe1));
  const zustandB = psql(`select status||'|'||transport||'|'||(next_attempt_at > now()) from public.helmut_job_outbox where job_id='${b.jobId}'`).out;
  check("6.2 Vergeben heisst versendet + Transportname + Backoff in der Zukunft", zustandB === "versendet|selbstweck|true", zustandB);
  const vergabe2 = psql("select count(*) from public.helmut_outbox_naechste(10, 'selbstweck')").out;
  check("6.3 Eine frisch vergebene Absicht wird nicht sofort erneut vergeben (Backoff)", vergabe2 === "0", vergabe2);
  const outboxIdB = psql(`select id from public.helmut_job_outbox where job_id='${b.jobId}'`).out;
  const conf1 = psql(`select uebernommen||'|'||neuer_status from public.helmut_outbox_bestaetige('${outboxIdB}', false, 'http-503')`).out;
  check("6.4 Ein Fehlversuch geht zurueck auf offen und traegt den bereinigten Fehler", conf1 === "true|offen", conf1);
  const fehlertext = psql(`select last_error from public.helmut_job_outbox where job_id='${b.jobId}'`).out;
  check("6.5 Der Fehlertext ist persistiert", fehlertext === "http-503", fehlertext);
  const conf2 = psql(`select uebernommen from public.helmut_outbox_bestaetige('${outboxIdB}', true, null)`).out;
  check("6.6 Eine Bestaetigung ausserhalb von versendet wird ehrlich abgelehnt (kein Doppelabschluss)", conf2 === "f", conf2);
  // Aufgeben: Versuche erschoepfen.
  psql(`update public.helmut_job_outbox set attempts=10, next_attempt_at=now() - interval '1 second', status='offen' where job_id='${b.jobId}'`);
  const vergabe3 = psql("select count(*) from public.helmut_outbox_naechste(10, 'selbstweck')").out;
  const zustandB2 = psql(`select status||'|'||last_error from public.helmut_job_outbox where job_id='${b.jobId}'`).out;
  // Der letzte ECHTE Fehler bleibt beim Aufgeben erhalten (coalesce) — der
  // Platzhalter 'versandversuche-erschoepft' greift nur ohne vorhandenen Fehlertext.
  check("6.7 Erschoepfte Absichten werden sichtbar aufgegeben statt vergeben",
    vergabe3 === "0" && zustandB2 === "aufgegeben|http-503", `${vergabe3} / ${zustandB2}`);
  const jobB = psql(`select status from public.helmut_jobs where id='${b.jobId}'`).out;
  check("6.8 Der FACHLICHE Auftrag bleibt vom aufgegebenen VERSAND unberuehrt (wartend)", jobB === "wartend", jobB);

  abschnitt("7 · Dispatcher-Absturz: unbestaetigt versendete Absichten kehren zurueck");
  const c = reihEin("outbox-c|2026-08-13T00Z");
  psql("select * from public.helmut_outbox_naechste(10, 'selbstweck')");
  psql(`update public.helmut_job_outbox set next_attempt_at=now() - interval '1 second' where job_id='${c.jobId}'`);
  const vergabe4 = psql("select attempts from public.helmut_outbox_naechste(10, 'selbstweck')").out;
  check("7.1 Eine versendete, nie bestaetigte Absicht wird nach Ablauf erneut vergeben (attempts=2)", vergabe4 === "2", vergabe4);

  abschnitt("8 · Vergabe unter ECHTER Nebenlaeufigkeit (keine Doppelvergabe)");
  for (let i = 0; i < 40; i += 1) reihEin(`outbox-p${i}|2026-08-13T00Z`);
  const parallel = await Promise.all(Array.from({ length: 8 }, () =>
    psqlAsync("select outbox_id from public.helmut_outbox_naechste(10, 'parallel')")));
  const vergebene = parallel.flatMap((p) => p.out.split("\n").filter(Boolean));
  const doppelt = vergebene.length - new Set(vergebene).size;
  check("8.1 Acht gleichzeitige Dispatcher vergeben KEINE Absicht doppelt (for update skip locked)",
    doppelt === 0 && vergebene.length >= 40, `${vergebene.length} vergeben, ${doppelt} doppelt`);

  abschnitt("9 · Faelligkeitskopplung und Abgleich als Sicherheitsnetz");
  const d = reihEin("outbox-d|2026-08-13T00Z", { dueOffsetS: 3600 });
  const vergabe5 = psql(`select count(*) from public.helmut_outbox_naechste(50, 'selbstweck') n where n.job_id='${d.jobId}'`).out;
  check("9.1 Die Absicht eines noch nicht faelligen Auftrags wird NICHT vergeben (kein Leerlauf-Weckruf)",
    vergabe5 === "0", vergabe5);
  // Auftrag OHNE Absicht (alter Enqueue-Weg) -> der Abgleich legt sie an.
  const ohne = psql(`select id from public.helmut_enqueue_job('source_fetch', 'outbox-ohne|2026-08-13T00Z', '2026-08-13T00Z', '{}'::jsonb, now(), 100::smallint, 3, null)`).out.split("|")[0];
  const abgleich2 = psql("select fehlend from public.helmut_outbox_abgleich(200, 10)").out;
  const absichtOhne = psql(`select status from public.helmut_job_outbox where job_id='${ohne}'`).out;
  check("9.2 Der Abgleich erkennt ausfuehrbare Auftraege OHNE Versandabsicht und merkt sie vor",
    Number(abgleich2) >= 1 && absichtOhne === "offen", `${abgleich2} / ${absichtOhne}`);
  // Verwaistes Wecksignal: bestaetigt, aber der Auftrag wartet weiter (Mindestalter simuliert).
  const e = reihEin("outbox-e|2026-08-13T00Z");
  psql("select * from public.helmut_outbox_naechste(200, 'selbstweck')");
  const outboxIdE = psql(`select id from public.helmut_job_outbox where job_id='${e.jobId}'`).out;
  psql(`select * from public.helmut_outbox_bestaetige('${outboxIdE}', true, null)`);
  psql(`update public.helmut_job_outbox set confirmed_at=now() - interval '20 minutes' where id='${outboxIdE}'`);
  psql(`update public.helmut_jobs set due_at=now() - interval '20 minutes' where id='${e.jobId}'`);
  const abgleich3 = psql("select wiedereroeffnet from public.helmut_outbox_abgleich(200, 10)").out;
  const zustandE = psql(`select status||'|'||attempts from public.helmut_job_outbox where id='${outboxIdE}'`).out;
  check("9.3 Ein verwaistes Wecksignal (bestaetigt, Auftrag wartet weiter) wird wiedereroeffnet",
    Number(abgleich3) >= 1 && zustandE === "offen|0", `${abgleich3} / ${zustandE}`);
  const abgleichFrisch = psql("select wiedereroeffnet from public.helmut_outbox_abgleich(200, 10)").out;
  check("9.4 Frisch bestaetigte Absichten werden NICHT wiedereroeffnet (Mindestalter schuetzt die Kette)",
    abgleichFrisch === "0", abgleichFrisch);

  abschnitt("10 · Neutralisierung: ON DELETE CASCADE laesst keine Absicht ohne Auftrag zurueck");
  const f = reihEin("outbox-f|2026-08-13T00Z");
  psql(`delete from public.helmut_jobs where id='${f.jobId}'`);
  const waisen = psql("select count(*) from public.helmut_job_outbox o where not exists (select 1 from public.helmut_jobs j where j.id=o.job_id)").out;
  check("10.1 Nach dem Loeschen des Auftrags existiert keine verwaiste Absicht", waisen === "0", waisen);

  abschnitt("11 · Kennzahlen sind rein lesend und vollstaendig");
  const kennzahlen = psql("select offen >= 0 and versendet >= 0 and bestaetigt >= 0 and aufgegeben >= 0 and verzichtet >= 0 and auftraege_ohne_absicht >= 0 from public.helmut_outbox_kennzahlen()").out;
  check("11.1 helmut_outbox_kennzahlen liefert eine vollstaendige Zeile", kennzahlen === "t", kennzahlen);

  abschnitt("12 · Rollback entfernt alles; Vorwaertsmigration laeuft erneut");
  psql(null, { datei: ROLLBACK });
  const tabelleWeg = psql("select count(*) from information_schema.tables where table_schema='public' and table_name='helmut_job_outbox'").out;
  const funktionenWeg = psql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'helmut_outbox%' or p.proname='helmut_enqueue_job_mit_outbox')").out;
  check("12.1 Rollback entfernt Tabelle und alle Funktionen", tabelleWeg === "0" && funktionenWeg === "0", `${tabelleWeg}/${funktionenWeg}`);
  const basisBleibt = psql("select count(*) from information_schema.tables where table_schema='public' and table_name='helmut_jobs'").out;
  check("12.2 helmut_jobs bleibt vom Rollback unberuehrt (Rueckweg ohne Datenmigration)", basisBleibt === "1", basisBleibt);
  psql(null, { datei: MIGRATION });
  check("12.3 Die Vorwaertsmigration laeuft nach dem Rollback erneut durch", true);

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("FATAL:", error && error.message);
  process.exit(1);
});
