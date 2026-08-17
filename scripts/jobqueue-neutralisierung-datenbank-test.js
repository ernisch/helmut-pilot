"use strict";

// Helmut — DATENBANKNACHWEIS der NEUTRALISIERUNG der 524 inerten Altauftraege (OP-30,
// Sprint „Neutralisierung + Warteschlangenwache" 2026-08-17).
// =============================================================================================
// WOFUER DIESE SUITE DA IST:
//
//   Vor dem dritten OP-30-Aktivierungsversuch muessen die 524 wartenden Auftraege aus dem
//   zweiten Versuch neutralisiert werden (Runbook §19.6). Das ist eine PRODUCTION-
//   DATENAENDERUNG und freigabepflichtig (CLAUDE.md §5). Sie darf nur ausgefuehrt werden,
//   wenn JEDER Sicherheitsriegel und der Rueckweg NACHWEISLICH funktionieren.
//
//   Diese Suite fuehrt exakt das SQL aus, das `lib/helmut/jobqueue-neutralisierung.js`
//   erzeugt — dieselbe Quelle, die auch das Betreiber-CLI und Runbook §26 benutzen —
//   gegen eine WEGWERFBARE lokale PostgreSQL mit dem Bestandsbild der Production
//   (524 wartend / 235 erledigt / 0 laufend / 0 fehlgeschlagen, gleiche Typ-, Mandats-
//   und Versuchsverteilung). PRODUCTION WIRD NICHT BERUEHRT.
//
//   Ohne erreichbaren lokalen Server meldet sie den Nachweis ausdruecklich als OFFEN und
//   endet mit Exit 0 — kein vorgetaeuschtes Gruen (Regel wie jobqueue-datenbank-test.js).
//
// WAS DER NACHWEIS ZEIGEN MUSS (Pflichttests des Sprints):
//   1. Trockenlauf trifft exakt die Zielmenge und aendert NICHTS       (Standardmodus)
//   2. die 235 erledigten Zeilen bleiben byte-identisch                (vor/nach allem)
//   3. eine abweichende Signatur blockiert                             (R3)
//   4. eine zusaetzliche neue Zeile blockiert                          (R1/R6)
//   5. eine offene Lease blockiert                                     (R2)
//   6. ein laufender oder fehlgeschlagener Auftrag blockiert           (R1)
//   7. eine Aenderung zwischen Vorpruefung und Transaktion blockiert   (R3/R10)
//   8. Wiederholung nach erfolgreicher Neutralisierung ist sicher      (BEREITS-NEUTRALISIERT)
//   +  FUNKTIONALER RUECKWEG (deterministische Neuerzeugung durch den Planer — AUSDRUECKLICH
//      kein byte-identischer Restore, Modulkopf + Runbook §26.2), MUTATIONSPROBEN
//      (entfernte Riegel machen die Suite nachweislich rot) und der DATENSCHUTZVERTRAG:
//      kein erzeugtes SQL liest payload/tenant_id/idempotency_key/last_error, keine
//      Ausgabe traegt Werte aus diesen Spalten (Kanarien-Beweis), und eine erneute
//      Vollzeilenausgabe wird zuverlaessig rot.
//
// KONFIGURATION (alles ueber Env, keine Geheimnisse):
//   HELMUT_TEST_PG_HOST  Socket-Verzeichnis oder Host (ohne Wert -> Suite uebersprungen)
//   HELMUT_TEST_PG_PORT  Default 5433 · HELMUT_TEST_PG_USER Default helmut
//   HELMUT_TEST_PG_DB_NEUTRALISIERUNG  Default helmut_test_neutralisierung
//
// OFFLINE: `psql` verbindet ausschliesslich lokal. Kein Netz, keine KI, keine Kosten.

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BASIS = path.join(ROOT, "supabase/migrations/20260808_scalable_job_queue.sql");
const BASIS_ROLLBACK = path.join(ROOT, "supabase/migrations/20260808_scalable_job_queue_rollback.sql");
const N = require(path.join(ROOT, "lib/helmut/jobqueue-neutralisierung.js"));

const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "",
  port: process.env.HELMUT_TEST_PG_PORT || "5433",
  user: process.env.HELMUT_TEST_PG_USER || "helmut",
  db: process.env.HELMUT_TEST_PG_DB_NEUTRALISIERUNG || "helmut_test_neutralisierung"
};

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(titel) { console.log(`\n== ${titel} ==`); }

// JEDE psql-Ausgabe (stdout UND stderr, aller Laeufe) wird fuer den Kanarien-Beweis in §6
// gesammelt: keine einzige Ausgabe des Betreiberwegs darf Werte aus payload, tenant_id,
// idempotency_key oder last_error tragen.
const ALLE_AUSGABEN = [];
function psqlRoh(args, { erlaubeFehler = false } = {}) {
  try {
    const out = execFileSync("psql", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    ALLE_AUSGABEN.push(out);
    return { ok: true, out, err: "" };
  } catch (error) {
    if (!erlaubeFehler) throw error;
    const out = String(error.stdout || "").trim();
    const err = String(error.stderr || "").trim();
    ALLE_AUSGABEN.push(out, err);
    return { ok: false, out, err };
  }
}
function basisArgs(db = PG.db) {
  return ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", db, "-v", "ON_ERROR_STOP=1", "-tAq"];
}
function sql(text, opts = {}) { return psqlRoh([...basisArgs(), "-c", text], opts); }
function datei(pfad, opts = {}) { return psqlRoh([...basisArgs(), "-f", pfad], opts); }
let skriptNr = 0;
function skript(text, { erlaubeFehler = false } = {}) {
  skriptNr += 1;
  const tmp = path.join(os.tmpdir(), `helmut-neutralisierung-${process.pid}-${skriptNr}.sql`);
  fs.writeFileSync(tmp, text, "utf8");
  try {
    return psqlRoh([...basisArgs(), "-f", tmp], { erlaubeFehler });
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

// ── Testdaten: die Form des Production-Bestands vom 2026-08-17 (Teil-A-Befund) ───────────────
// 524 wartend: 365 source_fetch (354 geteilt / 10 person-archiv / 1 person-aktuell),
// 139 document_understanding, 10 mandate_projection, 10 briefing_materialization;
// 493 global / 31 mandatsgebunden (5 Mandate); Versuche 515x0 / 7x1 / 2x2; 140 Fehlertexte.
// 235 erledigt: 55 aus dem Erstlauf (11.08.) + 180 aus dem Zweitlauf (12./13.08.), mit
// lease_owner/finished_at — verarbeitete Zeilen tragen ihre Lease-Spuren, R2 darf NUR auf
// nicht erledigte Zeilen schauen.
const BESTAND_SQL = `
delete from public.helmut_jobs;
-- 354 geteilte Abrufe (global), darunter 7 mit attempts=1 und 2 mit attempts=2; 129 mit
-- dokumentiertem Zurueckstellgrund (verstehen-uebersprungen/zeitbudget), 11 Slotende-Texte.
insert into public.helmut_jobs
  (job_type, idempotency_key, freshness_window, payload, due_at, first_due_at, created_at,
   tenant_id, priority, attempts, max_attempts, last_error)
select 'source_fetch', 'geteilt-' || g, '2026-08-13T16Z',
       jsonb_build_object('art','geteilt'),
       timestamptz '2026-08-13 16:00:00+00' + (g * interval '3 seconds'),
       timestamptz '2026-08-13 16:00:00+00' + (g * interval '3 seconds'),
       timestamptz '2026-08-12 20:00:15+00' + (g * interval '3 minutes'),
       null, 100,
       case when g <= 7 then 1 when g <= 9 then 2 else 0 end, 5,
       case when g <= 11 then 'zurueckgestellt: zeitbudget-deckel'
            when g <= 15 then 'auftrag-zeitlimit (source_fetch)' else null end
  from generate_series(1,354) g;
insert into public.helmut_jobs
  (job_type, idempotency_key, freshness_window, payload, due_at, first_due_at, created_at,
   tenant_id, priority, attempts, max_attempts, last_error)
select 'document_understanding', 'verstehen-' || g, '2026-08-13T04Z',
       jsonb_build_object('dokumentIds', jsonb_build_array('rd-' || g)),
       timestamptz '2026-08-13 16:05:00+00', timestamptz '2026-08-13 16:05:00+00',
       timestamptz '2026-08-13 06:00:00+00' + (g * interval '2 minutes'),
       null, 100, 0, 5,
       case when g <= 124 then 'zurueckgestellt: verstehen-uebersprungen (understanding-locked)' else null end
  from generate_series(1,139) g;
insert into public.helmut_jobs
  (job_type, idempotency_key, freshness_window, payload, due_at, first_due_at, created_at,
   tenant_id, priority)
select 'source_fetch', 'archiv-' || t.id || '-' || f.nr, '2026-08-' || f.tag || 'T00Z',
       '{"art":"person-archiv"}'::jsonb,
       timestamptz '2026-08-13 00:00:00+00', timestamptz '2026-08-13 00:00:00+00',
       timestamptz '2026-08-13 04:00:30+00', t.id, 300
  from (values ('m-1'),('m-2'),('m-3'),('m-4'),('m-5')) as t(id),
       (values (1,'06'),(2,'13')) as f(nr, tag);
insert into public.helmut_jobs
  (job_type, idempotency_key, freshness_window, payload, due_at, first_due_at, created_at,
   tenant_id, priority)
values ('source_fetch', 'person-aktuell-m-1', '2026-08-13T16Z', '{"art":"person-aktuell"}'::jsonb,
        timestamptz '2026-08-13 16:02:00+00', timestamptz '2026-08-13 16:02:00+00',
        timestamptz '2026-08-13 16:02:11+00', 'm-1', 200);
insert into public.helmut_jobs
  (job_type, idempotency_key, freshness_window, payload, due_at, first_due_at, created_at,
   tenant_id, priority)
select typ, typ || '|' || t.id || '|2026-08-' || f.tag || 'T00Z', '2026-08-' || f.tag || 'T00Z',
       jsonb_build_object('mandatsId', t.id),
       timestamptz '2026-08-13 12:00:00+00', timestamptz '2026-08-13 12:00:00+00',
       timestamptz '2026-08-13 04:00:40+00', t.id, 100
  from (values ('m-1'),('m-2'),('m-3'),('m-4'),('m-5')) as t(id),
       (values ('mandate_projection'),('briefing_materialization')) as x(typ),
       (values ('12'),('13')) as f(tag);
-- 235 ERLEDIGTE: 55 Erstlauf + 180 Zweitlauf; sie tragen lease_owner/finished_at wie echte
-- verarbeitete Zeilen und duerfen von der Neutralisierung NICHT beruehrt werden.
insert into public.helmut_jobs
  (job_type, idempotency_key, freshness_window, payload, due_at, first_due_at, created_at,
   status, finished_at, attempts, lease_owner, tenant_id)
select 'source_fetch', 'erledigt-erstlauf-' || g, '2026-08-11T16Z', '{}'::jsonb,
       timestamptz '2026-08-11 16:00:00+00', timestamptz '2026-08-11 16:00:00+00',
       timestamptz '2026-08-11 20:00:06+00', 'erledigt',
       timestamptz '2026-08-11 20:02:00+00', 1, 'wk-erstlauf', null
  from generate_series(1,55) g;
insert into public.helmut_jobs
  (job_type, idempotency_key, freshness_window, payload, due_at, first_due_at, created_at,
   status, finished_at, attempts, lease_owner, tenant_id)
select 'source_fetch', 'erledigt-zweitlauf-' || g, '2026-08-12T16Z', '{}'::jsonb,
       timestamptz '2026-08-12 20:00:00+00', timestamptz '2026-08-12 20:00:00+00',
       timestamptz '2026-08-12 20:00:20+00', 'erledigt',
       timestamptz '2026-08-13 04:03:00+00', 1, 'wk-zweitlauf', null
  from generate_series(1,180) g;
-- KANARIEN (Datenschutzvertrag §6): eindeutige Werte in ALLEN vier sensiblen Spalten.
-- Erscheint auch nur einer davon in irgendeiner Ausgabe des Betreiberwegs, wird die
-- Suite rot — der Beweis, dass keine Nutzdaten die Datenbank verlassen.
update public.helmut_jobs
   set payload = payload || '{"kanarie":"KANARIE-NUTZDATEN-x7q9"}'::jsonb,
       last_error = 'KANARIE-FEHLERTEXT-x7q9'
 where idempotency_key = 'geteilt-20';
update public.helmut_jobs set tenant_id = 'KANARIE-MANDAT-x7q9' where tenant_id = 'm-5';
update public.helmut_jobs set idempotency_key = 'KANARIE-SCHLUESSEL-x7q9'
 where idempotency_key = 'geteilt-21';`;

// Die lokalen Anker werden EINMAL nach dem Seeding erhoben und danach wie in Production als
// EINGABE behandelt (Runbook-Regel: eine Erwartung, die sich selbst nachrechnet, prueft nichts).
function erhebeVertrag() {
  const zeile = sql(`select
      ${N.signaturAusdruck()} || '|' ||
      (select coalesce(md5(string_agg(id::text, ',' order by id)), 'leer')
         from public.helmut_jobs where status = 'wartend') || '|' ||
      ${N.signaturAusdruck("status = 'erledigt'")};`).out;
  const [signaturGesamt, idKettenMd5Wartend, signaturErledigt] = zeile.split("|");
  return {
    ...N.PRODUCTION_VERTRAG,
    // Die lokale Grenze entspricht der Production-Grenze; die Fixture liegt vollstaendig davor.
    signaturGesamt, idKettenMd5Wartend, signaturErledigt
  };
}

const ERLEDIGT_MD5_SQL = `select md5(coalesce(jsonb_agg(to_jsonb(j) order by j.id), '[]'::jsonb)::text)
  from public.helmut_jobs j where j.status = 'erledigt';`;
const VERTEILUNG_SQL = `select count(*) filter (where status='wartend') || '/'
  || count(*) filter (where status='erledigt') || '/'
  || count(*) filter (where status='laeuft') || '/'
  || count(*) filter (where status='fehlgeschlagen') from public.helmut_jobs;`;

function main() {
  console.log("Helmut — Datenbanknachweis der Neutralisierung der 524 Altauftraege (OP-30, 2026-08-17)");

  if (!servererreichbar()) {
    console.log("\n== UEBERSPRUNGEN ==");
    console.log("  Kein lokaler PostgreSQL-Server erreichbar (HELMUT_TEST_PG_HOST nicht gesetzt");
    console.log("  oder Verbindung nicht moeglich).");
    console.log("  >> DER NACHWEIS DER NEUTRALISIERUNG IST DAMIT OFFEN, NICHT ERBRACHT. <<");
    console.log("  Ohne ihn darf Runbook §26 Schritt 2 (scharf) NICHT ausgefuehrt werden.");
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
  const vertrag = erhebeVertrag();

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("0 · Vertragspruefung ist fail closed (kein SQL aus halben Erwartungen)");
  {
    const kaputt = [
      [{ ...vertrag, wartend: 0 }, "Zielmenge 0"],
      [{ ...vertrag, gesamt: 758 }, "widerspruechliche Verteilung"],
      [{ ...vertrag, signaturGesamt: "keine-md5" }, "verformte Signatur"],
      [{ ...vertrag, grenze: "morgen frueh" }, "verformte Grenze"],
      [{ ...vertrag, nachTyp: { source_fetch: 1 } }, "Typverteilung != wartend"]
    ];
    for (const [v, name] of kaputt) {
      let geworfen = false;
      try { N.neutralisierungSql(v); } catch (_) { geworfen = true; }
      check(`0.x ${name} wird beim SQL-Bau abgelehnt`, geworfen);
    }
    let standard = null;
    try { standard = N.neutralisierungSql(vertrag); } catch (e) { standard = null; }
    check("0.6 Der vollstaendige Vertrag baut SQL — und der Standardmodus ist der Trockenlauf",
      typeof standard === "string" && /TROCKENLAUF \(Standard/.test(standard));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("1 · Vorpruefung (Schritt 0) und Trockenlauf (Schritt 2, Standard)");
  {
    const vor = skript(N.vorpruefungSql(vertrag)).out.split("|");
    check("1.1 Vorpruefung: Verteilung 524/235/0/0, gesamt 759",
      vor[0] === "524" && vor[1] === "235" && vor[2] === "0" && vor[3] === "0" && vor[4] === "759",
      vor.slice(0, 5).join("/"));
    check("1.2 Vorpruefung: 0 offene Leases (erledigte Lease-Spuren zaehlen NICHT)",
      vor[5] === "0", vor[5]);
    check("1.3 Vorpruefung: alle drei Anker getroffen (Gesamt, ID-Kette, Erledigt)",
      vor[6] === vertrag.signaturGesamt && vor[7] === vertrag.idKettenMd5Wartend
      && vor[8] === vertrag.signaturErledigt, vor.slice(6, 9).join(" "));
    check("1.4 Vorpruefung: keine wartende Zeile ausserhalb der Grenze", vor[9] === "0", vor[9]);

    const trocken = skript(N.neutralisierungSql(vertrag), { erlaubeFehler: true });
    check("1.5 Der Trockenlauf durchlaeuft ALLE Riegel und endet bauartbedingt im Abbruch",
      trocken.ok === false && /TROCKENLAUF-OK: alle Riegel bestanden, 524 Zeilen WAEREN geloescht/.test(trocken.err),
      trocken.err.split("\n")[0]);
    check("1.6 Der Trockenlauf traegt die Laufquittung (Verfahren, Modus, Zaehlwerte, Pruefsummen)",
      /"verfahren": "op30-neutralisierung-524"/.test(trocken.err)
      && /"modus": "trockenlauf"/.test(trocken.err)
      && new RegExp(vertrag.idKettenMd5Wartend).test(trocken.err), trocken.err.split("\n")[0]);
    check("1.7 Nach dem Trockenlauf ist NICHTS veraendert (524/235/0/0)",
      sql(VERTEILUNG_SQL).out === "524/235/0/0");
    check("1.8 Auch die Gesamtsignatur ist unveraendert",
      sql(`select ${N.signaturAusdruck()};`).out === vertrag.signaturGesamt);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("2 · Jede Abweichung blockiert (scharfer Modus gegen manipulierte Zustaende)");
  const scharfSql = N.neutralisierungSql(vertrag, { modus: "scharf" });
  {
    // (a) abweichende Signatur: ein Versuchszaehler einer Zielzeile aendert sich.
    sql("update public.helmut_jobs set attempts = attempts + 1 where idempotency_key = 'geteilt-200';");
    const sig = skript(scharfSql, { erlaubeFehler: true });
    check("2.1 Eine abweichende Gesamtsignatur blockiert (R3)",
      sig.ok === false && /ABBRUCH R3: Gesamtsignatur/.test(sig.err), sig.err.split("\n")[0]);
    check("2.2 Nichts veraendert", sql(VERTEILUNG_SQL).out === "524/235/0/0");
    sql("update public.helmut_jobs set attempts = attempts - 1 where idempotency_key = 'geteilt-200';");

    // (b) zusaetzliche neue Zeile (wie sie ein versehentlich aktiver Planer erzeugen wuerde).
    sql(`insert into public.helmut_jobs (job_type, idempotency_key, freshness_window, payload, created_at)
         values ('source_fetch', 'neu-nach-grenze', '2026-08-17T16Z', '{}'::jsonb, timestamptz '2026-08-17 10:00:00+00');`);
    const neu = skript(scharfSql, { erlaubeFehler: true });
    check("2.3 Eine zusaetzliche neue Zeile blockiert (R1)",
      neu.ok === false && /ABBRUCH R1: Statusverteilung/.test(neu.err), neu.err.split("\n")[0]);
    sql("delete from public.helmut_jobs where idempotency_key = 'neu-nach-grenze';");

    // (b2) Tiefenstaffelung R6: Zeilentausch, der die Zaehlung (R1) exakt erhaelt.
    sql(`delete from public.helmut_jobs where idempotency_key = 'geteilt-1';
         insert into public.helmut_jobs (job_type, idempotency_key, freshness_window, payload, created_at)
         values ('source_fetch', 'tausch-nach-grenze', '2026-08-17T16Z', '{}'::jsonb, timestamptz '2026-08-17 10:00:00+00');`);
    const tausch = skript(scharfSql, { erlaubeFehler: true });
    check("2.4 Ein zaehlungsneutraler Zeilentausch blockiert trotzdem (R6, vor jeder Signatur)",
      tausch.ok === false && /ABBRUCH R6: 1 wartende Zeile\(n\) neuer als die Grenze/.test(tausch.err),
      tausch.err.split("\n")[0]);
    sql("delete from public.helmut_jobs where idempotency_key = 'tausch-nach-grenze';");
    sql(BESTAND_SQL); // Fixture vollstaendig neu (IDs aendern sich durch den Tausch)
  }
  // Anker nach dem Neuaufbau neu erheben — ab hier gilt der neue Vertrag.
  let vertrag2 = erhebeVertrag();
  let scharf2 = N.neutralisierungSql(vertrag2, { modus: "scharf" });
  let erledigtMd5Neu = sql(ERLEDIGT_MD5_SQL).out;
  {
    // (c) offene Lease auf einer Zielzeile.
    sql(`update public.helmut_jobs set lease_owner = 'wk-test', lease_expires_at = now() + interval '5 minutes'
          where idempotency_key = 'geteilt-2';`);
    const lease = skript(scharf2, { erlaubeFehler: true });
    check("2.5 Eine offene Lease blockiert (R2)",
      lease.ok === false && /ABBRUCH R2: 1 offene Lease/.test(lease.err), lease.err.split("\n")[0]);
    sql("update public.helmut_jobs set lease_owner = null, lease_expires_at = null where idempotency_key = 'geteilt-2';");

    // (d) laufender Auftrag (der Check-Constraint verlangt zu `laeuft` eine Lease; R1 greift
    // VOR R2, deshalb ist der belegte Abbruchgrund hier die Statusverteilung).
    sql(`update public.helmut_jobs set status = 'laeuft', lease_owner = 'wk-x',
          lease_expires_at = now() + interval '5 minutes' where idempotency_key = 'geteilt-3';`);
    const laeuft = skript(scharf2, { erlaubeFehler: true });
    check("2.6 Ein laufender Auftrag blockiert (R1)",
      laeuft.ok === false && /ABBRUCH R1: Statusverteilung 523\/235\/1\/0/.test(laeuft.err),
      laeuft.err.split("\n")[0]);
    sql(`update public.helmut_jobs set status = 'wartend', lease_owner = null,
          lease_expires_at = null where idempotency_key = 'geteilt-3';`);

    // (e) fehlgeschlagener Auftrag.
    sql("update public.helmut_jobs set status = 'fehlgeschlagen' where idempotency_key = 'geteilt-4';");
    const fehl = skript(scharf2, { erlaubeFehler: true });
    check("2.7 Ein fehlgeschlagener Auftrag blockiert (R1)",
      fehl.ok === false && /ABBRUCH R1: Statusverteilung 523\/235\/0\/1/.test(fehl.err),
      fehl.err.split("\n")[0]);
    sql("update public.helmut_jobs set status = 'wartend' where idempotency_key = 'geteilt-4';");

    // (f) KONKURRENZFALL: Vorpruefung bestanden — DANACH aendert ein anderer Prozess einen
    // Status. Die erneute Pruefung IN der Transaktion (R1/R3, unmittelbar vor der Loeschung)
    // faengt genau das ab; die Vorpruefung allein haette es nicht.
    const vorOk = skript(N.vorpruefungSql(vertrag2)).out.split("|");
    check("2.8 Vorpruefung VOR der konkurrierenden Aenderung: alles gruen",
      vorOk[0] === "524" && vorOk[6] === vertrag2.signaturGesamt, vorOk.slice(0, 7).join("/"));
    sql("update public.helmut_jobs set status = 'erledigt', finished_at = now() where idempotency_key = 'geteilt-5';");
    const konkurrenz = skript(scharf2, { erlaubeFehler: true });
    check("2.9 Die konkurrierende Statusaenderung zwischen Vorpruefung und Transaktion blockiert (R1)",
      konkurrenz.ok === false && /ABBRUCH R1: Statusverteilung 523\/236\/0\/0/.test(konkurrenz.err),
      konkurrenz.err.split("\n")[0]);
    check("2.10 Nichts geloescht, nichts veraendert (ausser der fremden Aenderung selbst)",
      sql(VERTEILUNG_SQL).out === "523/236/0/0");
    sql(`update public.helmut_jobs set status = 'wartend', finished_at = null where idempotency_key = 'geteilt-5';`);
    check("2.11 Nach Ruecknahme der fremden Aenderung stimmt der Ankerzustand wieder",
      sql(`select ${N.signaturAusdruck()};`).out === vertrag2.signaturGesamt);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("3 · MUTATIONSPROBEN — entfernte Riegel sind nachweislich tragend");
  {
    // P1: R2 entfernt + offene Lease -> die Loeschung liefe DURCH (alle anderen Riegel
    // sehen die Lease nicht). Beleg, dass R2 die einzige Wache gegen laufende Arbeit ist.
    sql(`update public.helmut_jobs set lease_owner = 'wk-mut', lease_expires_at = now() + interval '5 minutes'
          where idempotency_key = 'geteilt-6';`);
    const ohneR2 = scharf2.replace(/-- R2: [\s\S]*?end if;\n/, "");
    check("3.1 (Aufbau) Die R2-Pruefung ist aus der mutierten Fassung entfernt",
      !/ABBRUCH R2/.test(ohneR2) && /ABBRUCH R3/.test(ohneR2));
    const mut1 = skript(ohneR2, { erlaubeFehler: true });
    check("3.2 MUTATION ERKANNT: ohne R2 wuerde trotz offener Lease geloescht (Riegel ist tragend)",
      mut1.ok === true && sql(VERTEILUNG_SQL).out === "0/235/0/0",
      `${mut1.ok} ${sql(VERTEILUNG_SQL).out}`);
    sql(BESTAND_SQL);
    vertrag2 = erhebeVertrag();
    scharf2 = N.neutralisierungSql(vertrag2, { modus: "scharf" });

    // P2: R3 entfernt + Versuchszaehler-Mutation an einer Zielzeile -> die Loeschung liefe
    // durch (R4 prueft nur IDs, R5 nur Erledigte). Beleg, dass NUR R3 Feldmutationen sieht.
    sql("update public.helmut_jobs set attempts = attempts + 1 where idempotency_key = 'geteilt-7';");
    const ohneR3 = scharf2.replace(/  v_signatur := [\s\S]*?end if;\n/, "");
    check("3.3 (Aufbau) Die R3-Pruefung ist aus der mutierten Fassung entfernt",
      !/ABBRUCH R3/.test(ohneR3) && /ABBRUCH R4/.test(ohneR3));
    const mut2 = skript(ohneR3, { erlaubeFehler: true });
    check("3.4 MUTATION ERKANNT: ohne R3 wuerde die Feldmutation nicht bemerkt (Riegel ist tragend)",
      mut2.ok === true && sql(VERTEILUNG_SQL).out === "0/235/0/0",
      `${mut2.ok} ${sql(VERTEILUNG_SQL).out}`);
    sql(BESTAND_SQL);
    vertrag2 = erhebeVertrag();
    scharf2 = N.neutralisierungSql(vertrag2, { modus: "scharf" });
    erledigtMd5Neu = sql(ERLEDIGT_MD5_SQL).out;

    // P3: R8 verfaelscht (erwartet 523 statt 524) -> die Loeschung wird NACH dem Delete, noch
    // in der Transaktion, zurueckgenommen. Beleg: selbst wenn alles davor versagt, verhindert
    // die Loeschanzahl-Pruefung einen falschen Commit.
    const falscheZahl = scharf2.replace(/v_geloescht <> 524/, "v_geloescht <> 523")
      .replace(/erwartet 524 — Transaktion zurueckgenommen/, "erwartet 523 — Transaktion zurueckgenommen");
    const mut3 = skript(falscheZahl, { erlaubeFehler: true });
    check("3.5 R8 nimmt eine Loeschung mit falscher Erwartung VOLLSTAENDIG zurueck",
      mut3.ok === false && /ABBRUCH R8: 524 Zeilen geloescht, erwartet 523/.test(mut3.err),
      mut3.err.split("\n")[0]);
    check("3.6 Nach dem R8-Abbruch ist nichts geloescht (524/235/0/0)",
      sql(VERTEILUNG_SQL).out === "524/235/0/0");
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("4 · Scharfe Ausfuehrung, Erledigt-Unversehrtheit, Quittung");
  // Existenzbeweis der Kanarien VOR der Loeschung (fuer §6): alle vier sensiblen Spalten
  // tragen zu diesem Zeitpunkt eindeutige Werte in der Zielmenge.
  const kanarienVorher = sql(`select
      (count(*) filter (where payload ? 'kanarie')) || '/' ||
      (count(*) filter (where last_error like 'KANARIE-%')) || '/' ||
      (count(*) filter (where tenant_id like 'KANARIE-%')) || '/' ||
      (count(*) filter (where idempotency_key like 'KANARIE-%'))
    from public.helmut_jobs where status = 'wartend';`).out;
  {
    const scharfLauf = skript(scharf2, { erlaubeFehler: true });
    check("4.1 Die scharfe Ausfuehrung laeuft mit korrektem Zustand durch",
      scharfLauf.ok === true, scharfLauf.err.split("\n")[0]);
    check("4.2 Die Quittung nennt Verfahren, Modus scharf, 524 geloescht und das Ergebnis",
      /"verfahren": "op30-neutralisierung-524"/.test(scharfLauf.out + scharfLauf.err)
      && /"modus": "scharf"/.test(scharfLauf.out + scharfLauf.err)
      && /"geloescht": 524/.test(scharfLauf.out + scharfLauf.err)
      && /"ergebnis": "neutralisiert"/.test(scharfLauf.out + scharfLauf.err));
    check("4.3 Die Gegenprobe nach dem Commit steht in der Ausgabe (0 offen, 235 gesamt, Erledigt-Anker)",
      new RegExp(`0\\|235\\|${vertrag2.signaturErledigt}`).test(scharfLauf.out), scharfLauf.out.split("\n").slice(-1)[0]);
    check("4.4 Verteilung nach der Neutralisierung: 0/235/0/0",
      sql(VERTEILUNG_SQL).out === "0/235/0/0");
    check("4.5 DIE 235 ERLEDIGTEN SIND BYTE-IDENTISCH UNVERAENDERT (jede Spalte, auch updated_at)",
      sql(ERLEDIGT_MD5_SQL).out === erledigtMd5Neu,
      `${sql(ERLEDIGT_MD5_SQL).out} vs ${erledigtMd5Neu}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("5 · Wiederholung nach Erfolg ist sicher; FUNKTIONALER Rueckweg (Neuerzeugung)");
  {
    const wiederholung = skript(scharf2, { erlaubeFehler: true });
    check("5.1 Ein zweiter scharfer Lauf erkennt den neutralisierten Zustand und aendert NICHTS",
      wiederholung.ok === false && /ABBRUCH-BEREITS-NEUTRALISIERT/.test(wiederholung.err),
      wiederholung.err.split("\n")[0]);
    check("5.2 Verteilung unveraendert 0/235/0/0", sql(VERTEILUNG_SQL).out === "0/235/0/0");
    const trockenNachher = skript(N.neutralisierungSql(vertrag2), { erlaubeFehler: true });
    check("5.3 Auch der Trockenlauf meldet den neutralisierten Zustand eindeutig",
      trockenNachher.ok === false && /ABBRUCH-BEREITS-NEUTRALISIERT/.test(trockenNachher.err),
      trockenNachher.err.split("\n")[0]);

    // DER RUECKWEG IST DIE DETERMINISTISCHE NEUERZEUGUNG — ausdruecklich KEIN byte-identischer
    // Restore (Modulkopf, Runbook §26.2). Bewiesen wird genau das, was er leisten muss:
    // (a) ein geloeschter Schluessel ist wieder frei — der Planer kann dieselbe Arbeit
    //     fensterfrisch NEU erzeugen (nichts blockiert die Neuerzeugung);
    // (b) ein ERLEDIGTER Schluessel bleibt belegt — abgeschlossene Arbeit entsteht nicht
    //     neu (die Idempotenzsperre der 235 wirkt weiter).
    const neuErzeugt = sql(`select neu from public.helmut_enqueue_job(
      'source_fetch', 'geteilt-1', '2026-08-17T16Z', '{}'::jsonb);`).out;
    check("5.4 FUNKTIONALER RUECKWEG (a): ein neutralisierter Schluessel ist wieder frei — "
      + "die Neuerzeugung legt eine NEUE wartende Zeile an",
    neuErzeugt === "t" && sql(VERTEILUNG_SQL).out === "1/235/0/0",
    `neu=${neuErzeugt} ${sql(VERTEILUNG_SQL).out}`);
    const dedupe = sql(`select neu from public.helmut_enqueue_job(
      'source_fetch', 'erledigt-erstlauf-1', '2026-08-11T16Z', '{}'::jsonb);`).out;
    check("5.5 FUNKTIONALER RUECKWEG (b): ein erledigter Schluessel dedupliziert weiter — "
      + "abgeschlossene Arbeit entsteht NICHT neu",
    dedupe === "f" && sql(VERTEILUNG_SQL).out === "1/235/0/0",
    `neu=${dedupe} ${sql(VERTEILUNG_SQL).out}`);
    check("5.6 EHRLICH BENANNT: die neue Zeile ist fensterfrisch (heutiges Fenster, attempts 0) — "
      + "KEIN byte-identischer Restore der alten Zeile, und genau das ist der Vertrag",
    sql(`select freshness_window || '/' || attempts from public.helmut_jobs
          where status = 'wartend';`).out === "2026-08-17T16Z/0");
    sql("delete from public.helmut_jobs where status = 'wartend';");
    check("5.7 Nach dem Aufraeumen der Probe: 0/235/0/0 und Erledigte weiter byte-identisch",
      sql(VERTEILUNG_SQL).out === "0/235/0/0" && sql(ERLEDIGT_MD5_SQL).out === erledigtMd5Neu);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("6 · DATENSCHUTZVERTRAG — keine Nutzdaten verlassen die Datenbank");
  {
    check("6.1 Es gibt KEINEN Exportweg mehr im Modul (exportSql/wiederherstellungSql entfernt)",
      N.exportSql === undefined && N.wiederherstellungSql === undefined);
    const texte = [
      ["Vorpruefung", N.vorpruefungSql(vertrag2)],
      ["Trockenlauf", N.neutralisierungSql(vertrag2)],
      ["Scharf", N.neutralisierungSql(vertrag2, { modus: "scharf" })]
    ];
    for (const [name, text] of texte) {
      const t = text.toLowerCase();
      const verstoesse = [...N.SENSIBLE_SPALTEN, ...N.VOLLZEILEN_MUSTER].filter((m) => t.includes(m));
      check(`6.2 ${name}s-SQL liest keine sensible Spalte und kein Vollzeilenkonstrukt`,
        verstoesse.length === 0, verstoesse.join(","));
    }
    let geworfen = 0;
    for (const boese of [
      "select coalesce(jsonb_agg(to_jsonb(j)), '[]') from public.helmut_jobs j",
      "select payload from public.helmut_jobs",
      "select last_error from public.helmut_jobs where status='wartend'",
      "select tenant_id, idempotency_key from public.helmut_jobs",
      "select * from public.helmut_jobs"
    ]) {
      try { N.pruefeDatensparsamkeit(boese); } catch (_) { geworfen += 1; }
    }
    check("6.3 Eine erneute Vollzeilen-/Spaltenausgabe wird ZUVERLAESSIG rot (5/5 Muster abgelehnt)",
      geworfen === 5, `${geworfen}/5`);

    // KANARIEN-BEWEIS: die Fixture traegt eindeutige Werte in ALLEN vier sensiblen Spalten
    // (payload, last_error, tenant_id, idempotency_key). Ueber ALLE bisherigen psql-Ausgaben
    // dieser Suite hinweg — Vorpruefungen, Trockenlaeufe, Abbrueche, Quittungen, Gegenproben —
    // darf keiner dieser Werte auftauchen.
    const gesamt = ALLE_AUSGABEN.join("\n");
    check("6.4 KEINE der gesammelten Ausgaben traegt einen Kanarienwert aus den sensiblen Spalten",
      !/KANARIE/.test(gesamt), (gesamt.match(/KANARIE[^\s"']*/g) || []).slice(0, 3).join(","));
    check("6.5 Die Kanarien standen VOR der Loeschung wirklich in allen vier sensiblen "
      + "Spalten (der Beweis ist nicht leer): payload/last_error/tenant_id/idempotency_key",
    kanarienVorher === "1/1/6/1", kanarienVorher);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("7 · Der Production-Vertrag im Modul stimmt mit dem Runbook ueberein");
  {
    const runbook = fs.readFileSync(path.join(ROOT, "docs/betrieb/op30-aktivierung-5-mandate.md"), "utf8");
    const P = N.PRODUCTION_VERTRAG;
    check("7.1 Gesamtsignatur des Moduls steht im Runbook", runbook.includes(P.signaturGesamt));
    check("7.2 ID-Ketten-md5 der Zielmenge steht im Runbook", runbook.includes(P.idKettenMd5Wartend));
    check("7.3 Erledigt-Signatur steht im Runbook", runbook.includes(P.signaturErledigt));
    check("7.4 Zeitgrenze steht im Runbook", runbook.includes(P.grenze));
    check("7.5 Die Verteilung 524/235/0/0 steht im Runbook", /524 ?\/ ?235 ?\/ ?0 ?\/ ?0/.test(runbook));
  }

  // Aufraeumen: die Wegwerfdatenbank leer hinterlassen.
  datei(BASIS_ROLLBACK);

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}`);
  if (fail === 0) {
    console.log("Die Neutralisierung der 524 Altauftraege ist an echter PostgreSQL bewiesen:");
    console.log("Trockenlauf standard und folgenlos, jede Abweichung blockiert, Erledigte unversehrt,");
    console.log("Wiederholung sicher, Rueckweg = funktionale Neuerzeugung (kein Export, keine");
    console.log("Nutzdaten in irgendeiner Ausgabe — Kanarien-belegt), Riegel nachweislich tragend.");
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
