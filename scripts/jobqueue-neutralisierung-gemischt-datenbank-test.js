"use strict";

// Helmut — DATENBANKNACHWEIS der NEUTRALISIERUNG der GEMISCHTEN Zielmenge (OP-30,
// Sprint 2026-08-19): 301 `wartend` + 82 `laeuft` mit abgelaufener Lease aus dem ersten
// Stufe-1-Aktivierungslauf.
// =============================================================================================
// WOFUER DIESE SUITE DA IST:
//
//   Das §26-Verfahren (524 Altauftraege) unterstuetzt die gemischte Zielmenge NACHWEISLICH
//   NICHT: sein R2 bricht bei jeder nicht erledigten Zeile mit `lease_owner` ab (eine
//   `laeuft`-Zeile traegt ihn per CHECK-Constraint zwingend), seine Zielmenge trifft nur
//   `wartend`, sein R9 verlangt 0 `laeuft` im Nachzustand. Abschnitt 1 BEWEIST diesen
//   Blocker am echten SQL. Das gemischte Verfahren (§28, `neutralisierungGemischtSql`)
//   behebt genau das — mit zusaetzlichem Outbox-Riegel R12 (die `on delete cascade`-
//   Kopplung der Versandabsichten wird in der Transaktion bewiesen, nicht angenommen).
//
//   Diese Suite fuehrt exakt das SQL aus, das `lib/helmut/jobqueue-neutralisierung.js`
//   erzeugt — dieselbe Quelle wie Betreiber-CLI (scripts/jobqueue-neutralisierung-383.js)
//   und Runbook §28 — gegen eine WEGWERFBARE lokale PostgreSQL mit dem Bestandsbild der
//   Production in verkleinerter, strukturgleicher Form (wartend + laeuft-abgelaufen +
//   erledigt + Outbox-Absichten). PRODUCTION WIRD NICHT BERUEHRT.
//
//   Ohne erreichbaren lokalen Server meldet sie den Nachweis ausdruecklich als OFFEN und
//   endet mit Exit 0 — kein vorgetaeuschtes Gruen.
//
// KONFIGURATION (alles ueber Env, keine Geheimnisse):
//   HELMUT_TEST_PG_HOST  Socket-Verzeichnis oder Host (ohne Wert -> Suite uebersprungen)
//   HELMUT_TEST_PG_PORT  Default 5433 · HELMUT_TEST_PG_USER Default helmut
//   HELMUT_TEST_PG_DB_NEUTRALISIERUNG_GEMISCHT  Default helmut_test_neutralisierung_gemischt
//
// OFFLINE: `psql` verbindet ausschliesslich lokal. Kein Netz, keine KI, keine Kosten.

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BASIS = path.join(ROOT, "supabase/migrations/20260808_scalable_job_queue.sql");
const BASIS_ROLLBACK = path.join(ROOT, "supabase/migrations/20260808_scalable_job_queue_rollback.sql");
const OUTBOX = path.join(ROOT, "supabase/migrations/20260813090000_jobqueue_outbox.sql");
const OUTBOX_ROLLBACK = path.join(ROOT, "supabase/migrations/rollback_20260813090000_jobqueue_outbox.sql");
const N = require(path.join(ROOT, "lib/helmut/jobqueue-neutralisierung.js"));

const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "",
  port: process.env.HELMUT_TEST_PG_PORT || "5433",
  user: process.env.HELMUT_TEST_PG_USER || "helmut",
  db: process.env.HELMUT_TEST_PG_DB_NEUTRALISIERUNG_GEMISCHT || "helmut_test_neutralisierung_gemischt"
};

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(titel) { console.log(`\n== ${titel} ==`); }

// JEDE psql-Ausgabe wird fuer den Kanarien-Beweis in §7 gesammelt.
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
  const tmp = path.join(os.tmpdir(), `helmut-neutralisierung-gemischt-${process.pid}-${skriptNr}.sql`);
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

// ── Testdaten: das Production-Bild vom 2026-08-19 in verkleinerter, strukturgleicher Form ────
// Zielmenge 13 = 9 wartend (6 source_fetch, je 1 verstehen/projektion/briefing) + 4 laeuft
// mit ABGELAUFENER Lease (source_fetch, attempts 1, lease_owner gesetzt — wie die 82 echten
// Zeilen, deren Slot vor dem Abschluss starb). 5 erledigt mit Lease-Spuren. Je Zielzeile
// EINE Outbox-Absicht (Mix offen/bestaetigt, wie in Production 220/163) — PLUS eine Absicht
// auf einer ERLEDIGTEN Zeile, die die Loeschung ueberleben MUSS (Beweis der Selektivitaet;
// in Production existiert so eine Zeile derzeit nicht, die Kaskade darf sie trotzdem nie
// treffen). Alle Zielzeilen liegen VOR der Grenze 2026-08-19 07:00:00+00.
const GRENZE = "2026-08-19 07:00:00+00";
const BESTAND_SQL = `
delete from public.helmut_job_outbox;
delete from public.helmut_jobs;
-- 6 wartende geteilte Abrufe aus dem Aktivierungsfenster (18.08. 20:00 – 19.08. 06:00 UTC).
insert into public.helmut_jobs
  (job_type, idempotency_key, freshness_window, payload, due_at, first_due_at, created_at,
   tenant_id, priority, attempts, max_attempts, last_error)
select 'source_fetch', 'sf-w-' || g, '2026-08-19T04Z', jsonb_build_object('art','geteilt'),
       timestamptz '2026-08-19 04:00:00+00', timestamptz '2026-08-19 04:00:00+00',
       timestamptz '2026-08-18 20:00:25+00' + (g * interval '61 minutes'),
       null, 100, case when g <= 2 then 1 else 0 end, 5,
       case when g = 1 then 'zurueckgestellt: zeitbudget-deckel' else null end
  from generate_series(1,6) g;
-- Je 1 wartendes Verstehen/Projektion/Briefing.
insert into public.helmut_jobs
  (job_type, idempotency_key, freshness_window, payload, due_at, first_due_at, created_at, tenant_id, priority)
values
  ('document_understanding', 'verstehen-1', '2026-08-19T04Z', '{"dokumentIds":["rd-1"]}'::jsonb,
   timestamptz '2026-08-19 05:31:10+00', timestamptz '2026-08-19 05:31:10+00',
   timestamptz '2026-08-19 05:31:10+00', null, 80),
  ('mandate_projection', 'projektion-m-1', '2026-08-19T04Z', '{"mandatsId":"m-1"}'::jsonb,
   timestamptz '2026-08-19 05:40:00+00', timestamptz '2026-08-19 05:40:00+00',
   timestamptz '2026-08-19 04:00:41+00', 'm-1', 200),
  ('briefing_materialization', 'briefing-m-1', '2026-08-19T04Z', '{"mandatsId":"m-1"}'::jsonb,
   timestamptz '2026-08-19 05:45:00+00', timestamptz '2026-08-19 05:45:00+00',
   timestamptz '2026-08-19 04:00:42+00', 'm-1', 250);
-- 4 laeuft-Zeilen mit ABGELAUFENER Lease: der Slot starb vor dem Abschluss (das Bild der
-- 82 echten Zeilen). CHECK-Constraint verlangt lease_owner + lease_expires_at.
insert into public.helmut_jobs
  (job_type, idempotency_key, freshness_window, payload, due_at, first_due_at, created_at,
   status, attempts, max_attempts, lease_owner, lease_expires_at, tenant_id)
select 'source_fetch', 'sf-l-' || g, '2026-08-19T04Z', jsonb_build_object('art','geteilt'),
       timestamptz '2026-08-19 04:00:00+00', timestamptz '2026-08-19 04:00:00+00',
       timestamptz '2026-08-19 04:00:10+00' + (g * interval '1 second'),
       'laeuft', 1, 5, 'wk-verstorben-' || g, timestamptz '2026-08-19 06:04:00+00', null
  from generate_series(1,4) g;
-- 5 ERLEDIGTE mit Lease-Spuren — von der Neutralisierung NIE zu beruehren.
insert into public.helmut_jobs
  (job_type, idempotency_key, freshness_window, payload, due_at, first_due_at, created_at,
   status, finished_at, attempts, lease_owner, tenant_id)
select 'source_fetch', 'erledigt-' || g, '2026-08-13T16Z', '{}'::jsonb,
       timestamptz '2026-08-13 16:00:00+00', timestamptz '2026-08-13 16:00:00+00',
       timestamptz '2026-08-13 16:00:20+00', 'erledigt',
       timestamptz '2026-08-13 16:03:00+00', 1, 'wk-alt', null
  from generate_series(1,5) g;
-- Outbox: EINE Absicht je Zielzeile (offen fuer wartend, bestaetigt fuer laeuft — Mix wie in
-- Production 220 offen / 163 bestaetigt) + EINE Absicht auf einer erledigten Zeile.
insert into public.helmut_job_outbox (job_id, status, transport, sent_at, confirmed_at)
select j.id,
       case when j.status = 'wartend' then 'offen' else 'bestaetigt' end,
       case when j.status = 'wartend' then null else 'schatten' end,
       case when j.status = 'wartend' then null else j.created_at end,
       case when j.status = 'wartend' then null else j.created_at end
  from public.helmut_jobs j where j.status in ('wartend','laeuft');
insert into public.helmut_job_outbox (job_id, status, transport, sent_at, confirmed_at)
select j.id, 'bestaetigt', 'schatten', j.finished_at, j.finished_at
  from public.helmut_jobs j where j.idempotency_key = 'erledigt-1';
-- KANARIEN (Datenschutzvertrag §7): eindeutige Werte in ALLEN vier sensiblen Spalten der
-- Jobtabelle UND im Outbox-Fehlertext. Erscheint einer davon in irgendeiner Ausgabe des
-- Betreiberwegs, wird die Suite rot.
update public.helmut_jobs
   set payload = payload || '{"kanarie":"KANARIE-NUTZDATEN-g19"}'::jsonb,
       last_error = 'KANARIE-FEHLERTEXT-g19'
 where idempotency_key = 'sf-w-2';
update public.helmut_jobs set tenant_id = 'KANARIE-MANDAT-g19' where idempotency_key = 'projektion-m-1';
update public.helmut_jobs set idempotency_key = 'KANARIE-SCHLUESSEL-g19' where idempotency_key = 'sf-w-3';
update public.helmut_job_outbox set last_error = 'KANARIE-OUTBOXTEXT-g19'
 where job_id = (select id from public.helmut_jobs where idempotency_key = 'sf-w-4');`;

// Die lokalen Anker werden EINMAL nach dem Seeding erhoben und danach wie in Production als
// EINGABE behandelt (eine Erwartung, die sich selbst nachrechnet, prueft nichts).
function erhebeGemischtVertrag() {
  const basis = { ...N.PRODUCTION_VERTRAG_GEMISCHT, grenze: GRENZE };
  const zeile = sql(`select
      count(*) filter (where status='wartend') || '|' ||
      count(*) filter (where status='erledigt') || '|' ||
      count(*) filter (where status='laeuft') || '|' ||
      count(*) filter (where status='fehlgeschlagen') || '|' ||
      count(*) || '|' ||
      (select count(*) from public.helmut_jobs where ${N.zielmengeGemischtWhere(basis)}) || '|' ||
      ${N.signaturAusdruck()} || '|' ||
      (select coalesce(md5(string_agg(id::text, ',' order by id)), 'leer')
         from public.helmut_jobs where ${N.zielmengeGemischtWhere(basis)}) || '|' ||
      ${N.signaturAusdruck("status = 'erledigt'")} || '|' ||
      (select count(*) from public.helmut_job_outbox o
        where exists (select 1 from public.helmut_jobs j
                       where j.id = o.job_id and ${N.zielmengeGemischtWhere(basis, "j")}))
    from public.helmut_jobs;`).out.split("|");
  const typen = {};
  for (const paar of sql(`select job_type || '=' || count(*) from public.helmut_jobs
      where ${N.zielmengeGemischtWhere(basis)} group by job_type order by job_type;`).out.split("\n")) {
    const [typ, n] = paar.split("=");
    if (typ) typen[typ] = Number(n);
  }
  return {
    ...basis,
    wartend: Number(zeile[0]), erledigt: Number(zeile[1]), laeuft: Number(zeile[2]),
    fehlgeschlagen: Number(zeile[3]), gesamt: Number(zeile[4]), zielmenge: Number(zeile[5]),
    signaturGesamt: zeile[6], idKettenMd5Zielmenge: zeile[7], signaturErledigt: zeile[8],
    outboxZielmenge: Number(zeile[9]),
    nachTyp: typen
  };
}

const ERLEDIGT_MD5_SQL = `select md5(coalesce(jsonb_agg(to_jsonb(j) order by j.id), '[]'::jsonb)::text)
  from public.helmut_jobs j where j.status = 'erledigt';`;
const VERTEILUNG_SQL = `select count(*) filter (where status='wartend') || '/'
  || count(*) filter (where status='erledigt') || '/'
  || count(*) filter (where status='laeuft') || '/'
  || count(*) filter (where status='fehlgeschlagen') from public.helmut_jobs;`;
const OUTBOX_SQL = `select count(*) || '/' || count(*) filter (where status='offen') from public.helmut_job_outbox;`;

function main() {
  console.log("Helmut — Datenbanknachweis der Neutralisierung der GEMISCHTEN Zielmenge (OP-30, 2026-08-19)");

  if (!servererreichbar()) {
    console.log("\n== UEBERSPRUNGEN ==");
    console.log("  Kein lokaler PostgreSQL-Server erreichbar (HELMUT_TEST_PG_HOST nicht gesetzt");
    console.log("  oder Verbindung nicht moeglich).");
    console.log("  >> DER NACHWEIS DER GEMISCHTEN NEUTRALISIERUNG IST DAMIT OFFEN, NICHT ERBRACHT. <<");
    console.log("  Ohne ihn darf Runbook §28 Schritt 2 (scharf) NICHT ausgefuehrt werden.");
    console.log("\n== ERGEBNIS ==\nPASS 0  FAIL 0  (uebersprungen, Nachweis offen)");
    process.exit(0);
  }

  console.log(`  Server: ${PG.host}:${PG.port}/${PG.db} als ${PG.user}`);
  try {
    execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", "postgres",
      "-tAc", `create database ${PG.db}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (_) { /* existiert bereits */ }

  datei(OUTBOX_ROLLBACK);
  datei(BASIS_ROLLBACK);
  datei(BASIS);
  datei(OUTBOX);
  sql(BESTAND_SQL);
  let vertrag = erhebeGemischtVertrag();

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("0 · Vertragspruefung ist fail closed (kein SQL aus halben Erwartungen)");
  {
    const kaputt = [
      [{ ...vertrag, zielmenge: 0, wartend: 0, laeuft: 0 }, "Zielmenge 0"],
      [{ ...vertrag, gesamt: vertrag.gesamt + 1 }, "widerspruechliche Verteilung"],
      [{ ...vertrag, zielmenge: vertrag.zielmenge - 1 }, "zielmenge != wartend + laeuft"],
      [{ ...vertrag, signaturGesamt: "keine-md5" }, "verformte Signatur"],
      [{ ...vertrag, grenze: "morgen frueh" }, "verformte Grenze"],
      [{ ...vertrag, nachTyp: { source_fetch: 1 } }, "Typverteilung != zielmenge"],
      [{ ...vertrag, outboxZielmenge: -1 }, "negative Outbox-Erwartung"]
    ];
    for (const [v, name] of kaputt) {
      let geworfen = false;
      try { N.neutralisierungGemischtSql(v); } catch (_) { geworfen = true; }
      check(`0.x ${name} wird beim SQL-Bau abgelehnt`, geworfen);
    }
    let standard = null;
    try { standard = N.neutralisierungGemischtSql(vertrag); } catch (_) { standard = null; }
    check("0.8 Der vollstaendige Vertrag baut SQL — und der Standardmodus ist der Trockenlauf",
      typeof standard === "string" && /TROCKENLAUF \(Standard/.test(standard));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("1 · BELEGTER BLOCKER: das §26-Verfahren unterstuetzt die gemischte Zielmenge NICHT");
  {
    // Ein §26-Vertrag in der Form dieses Bestands (wartend-only-Zielmenge, laeuft als
    // Bestandszahl). Sein R2 muss an den 4 laeuft-Leases abbrechen — genau der Grund,
    // warum das gemischte Verfahren gebaut wurde (Auftrag Teil C Punkt 6/7).
    const wartendKette = sql(`select coalesce(md5(string_agg(id::text, ',' order by id)), 'leer')
      from public.helmut_jobs where status = 'wartend' and created_at < timestamptz '${GRENZE}';`).out;
    const altTypen = {};
    for (const paar of sql(`select job_type || '=' || count(*) from public.helmut_jobs
        where status = 'wartend' group by job_type order by job_type;`).out.split("\n")) {
      const [typ, n] = paar.split("=");
      if (typ) altTypen[typ] = Number(n);
    }
    const altVertrag = {
      ...N.PRODUCTION_VERTRAG,
      grenze: GRENZE,
      wartend: vertrag.wartend, erledigt: vertrag.erledigt, laeuft: vertrag.laeuft,
      fehlgeschlagen: 0, gesamt: vertrag.gesamt,
      signaturGesamt: vertrag.signaturGesamt,
      idKettenMd5Wartend: wartendKette,
      signaturErledigt: vertrag.signaturErledigt,
      nachTyp: altTypen
    };
    const alt = skript(N.neutralisierungSql(altVertrag, { modus: "scharf" }), { erlaubeFehler: true });
    check("1.1 Das §26-Verfahren bricht an den abgelaufenen laeuft-Leases ab (R2) — Blocker belegt",
      alt.ok === false && /ABBRUCH R2: 4 offene Lease\(s\)/.test(alt.err), alt.err.split("\n")[0]);
    check("1.2 Der Abbruch ist folgenlos (nichts veraendert)",
      sql(VERTEILUNG_SQL).out === "9/5/4/0" && sql(OUTBOX_SQL).out === "14/9");
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("2 · Vorpruefung (Schritt 0) und Trockenlauf (Schritt 2, Standard)");
  {
    const vor = skript(N.vorpruefungGemischtSql(vertrag)).out.split("|");
    check("2.1 Vorpruefung: Verteilung 9/5/4/0, gesamt 18, Zielmenge 13",
      vor[0] === "9" && vor[1] === "5" && vor[2] === "4" && vor[3] === "0"
      && vor[4] === "18" && vor[6] === "13", vor.slice(0, 7).join("/"));
    check("2.2 Vorpruefung: 0 AKTIVE Leases (abgelaufene laeuft-Leases zaehlen NICHT als aktiv)",
      vor[5] === "0", vor[5]);
    check("2.3 Vorpruefung: alle drei Anker getroffen (Gesamt, ID-Kette der Zielmenge, Erledigt)",
      vor[7] === vertrag.signaturGesamt && vor[8] === vertrag.idKettenMd5Zielmenge
      && vor[9] === vertrag.signaturErledigt, vor.slice(7, 10).join(" "));
    check("2.4 Vorpruefung: keine offene Zeile ausserhalb der Grenze", vor[10] === "0", vor[10]);
    check("2.5 Vorpruefung: 13 Outbox-Absichten gehoeren zur Zielmenge", vor[11] === "13", vor[11]);

    const trocken = skript(N.neutralisierungGemischtSql(vertrag), { erlaubeFehler: true });
    check("2.6 Der Trockenlauf durchlaeuft ALLE Riegel und endet bauartbedingt im Abbruch",
      trocken.ok === false && /TROCKENLAUF-OK: alle Riegel bestanden, 13 Zeilen WAEREN geloescht/.test(trocken.err),
      trocken.err.split("\n")[0]);
    check("2.7 Der Trockenlauf traegt die Laufquittung inkl. Outbox-Zaehlern",
      /"verfahren": "op30-neutralisierung-383-gemischt"/.test(trocken.err)
      && /"modus": "trockenlauf"/.test(trocken.err)
      && /"outbox_zielmenge_vorher": 13/.test(trocken.err)
      && /"outbox_zielmenge_nachher": 0/.test(trocken.err), trocken.err.split("\n")[0]);
    check("2.8 Nach dem Trockenlauf ist NICHTS veraendert (9/5/4/0, Outbox 14 mit 9 offen)",
      sql(VERTEILUNG_SQL).out === "9/5/4/0" && sql(OUTBOX_SQL).out === "14/9");
    check("2.9 Auch die Gesamtsignatur ist unveraendert",
      sql(`select ${N.signaturAusdruck()};`).out === vertrag.signaturGesamt);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("3 · Jede Abweichung blockiert (scharfer Modus gegen manipulierte Zustaende)");
  const scharfSql = N.neutralisierungGemischtSql(vertrag, { modus: "scharf" });
  {
    // (a) eine laeuft-Zeile bekommt eine AKTIVE Lease (dort arbeitet wieder jemand).
    sql(`update public.helmut_jobs set lease_expires_at = now() + interval '5 minutes'
          where idempotency_key = 'sf-l-1';`);
    const aktiv = skript(scharfSql, { erlaubeFehler: true });
    check("3.1 Eine AKTIVE Lease auf einer laeuft-Zeile blockiert (R2a)",
      aktiv.ok === false && /ABBRUCH R2a: 1 aktive Lease/.test(aktiv.err), aktiv.err.split("\n")[0]);
    check("3.2 Nichts veraendert", sql(VERTEILUNG_SQL).out === "9/5/4/0");
    sql(`update public.helmut_jobs set lease_expires_at = timestamptz '2026-08-19 06:04:00+00'
          where idempotency_key = 'sf-l-1';`);

    // (b) abweichende Signatur: ein Versuchszaehler einer Zielzeile aendert sich.
    sql("update public.helmut_jobs set attempts = attempts + 1 where idempotency_key = 'sf-w-1';");
    const sig = skript(scharfSql, { erlaubeFehler: true });
    check("3.3 Eine abweichende Gesamtsignatur blockiert (R3)",
      sig.ok === false && /ABBRUCH R3: Gesamtsignatur/.test(sig.err), sig.err.split("\n")[0]);
    sql("update public.helmut_jobs set attempts = attempts - 1 where idempotency_key = 'sf-w-1';");

    // (c) zusaetzliche neue Zeile nach der Grenze (wie von einem versehentlich aktiven Planer).
    sql(`insert into public.helmut_jobs (job_type, idempotency_key, freshness_window, payload, created_at)
         values ('source_fetch', 'neu-nach-grenze', '2026-08-19T16Z', '{}'::jsonb, timestamptz '2026-08-19 10:00:00+00');`);
    const neu = skript(scharfSql, { erlaubeFehler: true });
    check("3.4 Eine zusaetzliche neue Zeile blockiert (R1)",
      neu.ok === false && /ABBRUCH R1: Statusverteilung/.test(neu.err), neu.err.split("\n")[0]);
    sql("delete from public.helmut_jobs where idempotency_key = 'neu-nach-grenze';");

    // (d) zaehlungsneutraler Zeilentausch -> R6 greift VOR jeder Signatur.
    sql(`delete from public.helmut_jobs where idempotency_key = 'sf-w-5';
         insert into public.helmut_jobs (job_type, idempotency_key, freshness_window, payload, created_at)
         values ('source_fetch', 'tausch-nach-grenze', '2026-08-19T16Z', '{}'::jsonb, timestamptz '2026-08-19 10:00:00+00');`);
    const tausch = skript(scharfSql, { erlaubeFehler: true });
    check("3.5 Ein zaehlungsneutraler Zeilentausch blockiert trotzdem (R6)",
      tausch.ok === false && /ABBRUCH R6: 1 offene Zeile\(n\) neuer als die Grenze/.test(tausch.err),
      tausch.err.split("\n")[0]);
    // Fixture vollstaendig neu (IDs und Outbox-Zuordnung haben sich durch den Tausch geaendert).
    sql(BESTAND_SQL);
    vertrag = erhebeGemischtVertrag();
  }
  let scharf2 = N.neutralisierungGemischtSql(vertrag, { modus: "scharf" });
  let erledigtMd5 = sql(ERLEDIGT_MD5_SQL).out;
  {
    // (e) ein fehlgeschlagener Auftrag blockiert.
    sql("update public.helmut_jobs set status = 'fehlgeschlagen', lease_owner = null, lease_expires_at = null where idempotency_key = 'sf-l-4';");
    const fehl = skript(scharf2, { erlaubeFehler: true });
    check("3.6 Ein fehlgeschlagener Auftrag blockiert (R1)",
      fehl.ok === false && /ABBRUCH R1: Statusverteilung/.test(fehl.err), fehl.err.split("\n")[0]);
    sql(`update public.helmut_jobs set status = 'laeuft', lease_owner = 'wk-verstorben-4',
          lease_expires_at = timestamptz '2026-08-19 06:04:00+00' where idempotency_key = 'sf-l-4';`);

    // (f) eine fehlende Outbox-Absicht der Zielmenge blockiert (R12 vorher).
    sql(`delete from public.helmut_job_outbox
          where job_id = (select id from public.helmut_jobs where idempotency_key = 'sf-w-6');`);
    const outboxWeg = skript(scharf2, { erlaubeFehler: true });
    check("3.7 Eine fehlende Outbox-Absicht der Zielmenge blockiert (R12)",
      outboxWeg.ok === false && /ABBRUCH R12: 12 Outbox-Absichten der Zielmenge statt 13/.test(outboxWeg.err),
      outboxWeg.err.split("\n")[0]);
    sql(`insert into public.helmut_job_outbox (job_id, status)
         select id, 'offen' from public.helmut_jobs where idempotency_key = 'sf-w-6';`);
    check("3.8 Nach Ruecknahme aller Manipulationen stimmt der Ankerzustand wieder",
      sql(`select ${N.signaturAusdruck()};`).out === vertrag.signaturGesamt
      && sql(OUTBOX_SQL).out === "14/9");
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("4 · MUTATIONSPROBEN — Riegel sind nachweislich tragend, R9 traegt die Tiefe");
  {
    // P1a (FAIL CLOSED SCHON BEIM BAU): wird der Vertrag erhoben, WAEHREND eine Lease aktiv
    // ist, faellt die aktive Zeile aus der Zielmenge (12 statt 13) — und der SQL-Bau lehnt
    // den widerspruechlichen Vertrag ab (zielmenge != wartend + laeuft). Ein Betreiber kann
    // aus dem inkonsistenten Zustand gar kein Loesch-SQL erzeugen.
    sql(`update public.helmut_jobs set lease_expires_at = now() + interval '5 minutes'
          where idempotency_key = 'sf-l-1';`);
    let bauAbgelehnt = false;
    try { N.neutralisierungGemischtSql(erhebeGemischtVertrag(), { modus: "scharf" }); }
    catch (_) { bauAbgelehnt = true; }
    check("4.1 FAIL CLOSED: ein bei aktiver Lease erhobener Vertrag wird beim SQL-Bau abgelehnt",
      bauAbgelehnt);

    // P1b (TIEFENSTAFFELUNG): der SAUBERE Vertrag (Zielmenge 13), aber R2a, R2b, R4, R7 und
    // R12 entfernt — und eine Lease wird aktiv. Die WHERE-Klausel schliesst die aktive Zeile
    // aus; die Loeschung der 12 uebrigen laeuft bis zum Delete durch. R8 (Loeschanzahl)
    // nimmt ALLES zurueck. Beweis: selbst mit FUENF entfernten Riegeln entsteht kein Commit.
    const ohneFuenf = scharf2
      .replace(/  -- R2a: [\s\S]*?end if;\n/, "")
      .replace(/  -- R2b: [\s\S]*?end if;\n/, "")
      .replace(/  select coalesce\(md5\(string_agg\(id::text[\s\S]*?ABBRUCH R4[\s\S]*?end if;\n/, "")
      .replace(/  -- R7: exakte Typverteilung der Zielmenge\.[\s\S]*?(?=\n  -- R12)/, "\n")
      .replace(/  -- R12 \(vorher\): [\s\S]*?end if;\n/, "");
    check("4.2 (Aufbau) R2a/R2b/R4/R7/R12 sind aus der mutierten Fassung entfernt",
      !/ABBRUCH R2a/.test(ohneFuenf) && !/ABBRUCH R2b/.test(ohneFuenf)
      && !/ABBRUCH R4/.test(ohneFuenf) && !/ABBRUCH R7/.test(ohneFuenf)
      // Der R12-NACHHER-Block bleibt absichtlich stehen (er liegt hinter dem Delete und
      // prueft die Kaskade) — entfernt ist nur die VORHER-Pruefung gegen den Anker.
      && !/Outbox-Absichten der Zielmenge statt/.test(ohneFuenf)
      && /ABBRUCH R8/.test(ohneFuenf));
    const mut1 = skript(ohneFuenf, { erlaubeFehler: true });
    check("4.3 TIEFENSTAFFELUNG: selbst mit fuenf entfernten Riegeln nimmt R8 die Loeschung "
      + "VOLLSTAENDIG zurueck (12 statt 13 geloescht)",
      mut1.ok === false && /ABBRUCH R8: 12 Zeilen geloescht, erwartet 13/.test(mut1.err),
      mut1.err.split("\n")[0]);
    check("4.3b Nichts geloescht (9/5/4/0, Outbox unveraendert)",
      sql(VERTEILUNG_SQL).out === "9/5/4/0" && sql(OUTBOX_SQL).out === "14/9");
    sql(`update public.helmut_jobs set lease_expires_at = timestamptz '2026-08-19 06:04:00+00'
          where idempotency_key = 'sf-l-1';`);

    // P2: R3 entfernt + Feldmutation an einer Zielzeile -> die Loeschung liefe DURCH
    // (R4 prueft nur IDs). Beleg, dass NUR R3 Feldmutationen sieht.
    sql("update public.helmut_jobs set attempts = attempts + 1 where idempotency_key = 'sf-w-1';");
    const ohneR3 = scharf2.replace(/  v_signatur := [\s\S]*?end if;\n/, "");
    check("4.4 (Aufbau) Die R3-Pruefung ist aus der mutierten Fassung entfernt",
      !/ABBRUCH R3/.test(ohneR3) && /ABBRUCH R4/.test(ohneR3));
    const mut2 = skript(ohneR3, { erlaubeFehler: true });
    check("4.5 MUTATION ERKANNT: ohne R3 wuerde die Feldmutation nicht bemerkt (Riegel ist tragend)",
      mut2.ok === true && sql(VERTEILUNG_SQL).out === "0/5/0/0",
      `${mut2.ok} ${sql(VERTEILUNG_SQL).out}`);
    sql(BESTAND_SQL);
    vertrag = erhebeGemischtVertrag();
    scharf2 = N.neutralisierungGemischtSql(vertrag, { modus: "scharf" });
    erledigtMd5 = sql(ERLEDIGT_MD5_SQL).out;

    // P3: R12 (vorher) entfernt + fehlende Outbox-Absicht -> die Loeschung liefe DURCH,
    // die Inkonsistenz (fremde Outbox-Aktivitaet) bliebe unbemerkt. Beleg: R12 ist tragend.
    sql(`delete from public.helmut_job_outbox
          where job_id = (select id from public.helmut_jobs where idempotency_key = 'sf-w-6');`);
    const ohneR12 = scharf2.replace(/  -- R12 \(vorher\): [\s\S]*?end if;\n/, "");
    check("4.6 (Aufbau) Die R12-Vorher-Pruefung ist aus der mutierten Fassung entfernt",
      !/ABBRUCH R12: % Outbox-Absichten der Zielmenge statt/.test(ohneR12.replace(/'/g, "")));
    const mut3 = skript(ohneR12, { erlaubeFehler: true });
    check("4.7 MUTATION ERKANNT: ohne R12 bliebe fremde Outbox-Aktivitaet unbemerkt (Riegel ist tragend)",
      mut3.ok === true && sql(VERTEILUNG_SQL).out === "0/5/0/0",
      `${mut3.ok} ${sql(VERTEILUNG_SQL).out}`);
    sql(BESTAND_SQL);
    vertrag = erhebeGemischtVertrag();
    scharf2 = N.neutralisierungGemischtSql(vertrag, { modus: "scharf" });
    erledigtMd5 = sql(ERLEDIGT_MD5_SQL).out;

    // P4: R8 verfaelscht (erwartet 12 statt 13) -> die Loeschung wird NACH dem Delete,
    // noch in der Transaktion, vollstaendig zurueckgenommen.
    const falscheZahl = scharf2.replace(/v_geloescht <> 13/, "v_geloescht <> 12")
      .replace(/erwartet 13 — Transaktion zurueckgenommen/, "erwartet 12 — Transaktion zurueckgenommen");
    const mut4 = skript(falscheZahl, { erlaubeFehler: true });
    check("4.8 R8 nimmt eine Loeschung mit falscher Erwartung VOLLSTAENDIG zurueck",
      mut4.ok === false && /ABBRUCH R8: 13 Zeilen geloescht, erwartet 12/.test(mut4.err),
      mut4.err.split("\n")[0]);
    check("4.9 Nach dem R8-Abbruch ist nichts geloescht (9/5/4/0, Outbox 14/9)",
      sql(VERTEILUNG_SQL).out === "9/5/4/0" && sql(OUTBOX_SQL).out === "14/9");
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("5 · Scharfe Ausfuehrung: Zielmenge weg, Erledigte + fremde Outbox unversehrt");
  const kanarienVorher = sql(`select
      (select count(*) from public.helmut_jobs where payload ? 'kanarie') || '/' ||
      (select count(*) from public.helmut_jobs where last_error like 'KANARIE-%') || '/' ||
      (select count(*) from public.helmut_jobs where tenant_id like 'KANARIE-%') || '/' ||
      (select count(*) from public.helmut_jobs where idempotency_key like 'KANARIE-%') || '/' ||
      (select count(*) from public.helmut_job_outbox where last_error like 'KANARIE-%');`).out;
  {
    const scharfLauf = skript(scharf2, { erlaubeFehler: true });
    check("5.1 Die scharfe Ausfuehrung laeuft mit korrektem Zustand durch",
      scharfLauf.ok === true, scharfLauf.err.split("\n")[0]);
    check("5.2 Die Quittung nennt Verfahren, Modus scharf, 13 geloescht, Outbox 13 -> 0",
      /"verfahren": "op30-neutralisierung-383-gemischt"/.test(scharfLauf.out + scharfLauf.err)
      && /"modus": "scharf"/.test(scharfLauf.out + scharfLauf.err)
      && /"geloescht": 13/.test(scharfLauf.out + scharfLauf.err)
      && /"outbox_zielmenge_nachher": 0/.test(scharfLauf.out + scharfLauf.err)
      && /"ergebnis": "neutralisiert"/.test(scharfLauf.out + scharfLauf.err));
    check("5.3 Verteilung nach der Neutralisierung: 0/5/0/0",
      sql(VERTEILUNG_SQL).out === "0/5/0/0");
    check("5.4 DIE 5 ERLEDIGTEN SIND BYTE-IDENTISCH UNVERAENDERT (jede Spalte)",
      sql(ERLEDIGT_MD5_SQL).out === erledigtMd5);
    check("5.5 KEINE Outbox-Restarbeit der Zielmenge; die Absicht der ERLEDIGTEN Zeile ueberlebt",
      sql(OUTBOX_SQL).out === "1/0"
      && sql(`select count(*) from public.helmut_job_outbox o
               join public.helmut_jobs j on j.id = o.job_id
              where j.status = 'erledigt';`).out === "1");
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("6 · Wiederholung nach Erfolg ist sicher; FUNKTIONALER Rueckweg (Neuerzeugung)");
  {
    const wiederholung = skript(scharf2, { erlaubeFehler: true });
    check("6.1 Ein zweiter scharfer Lauf erkennt den neutralisierten Zustand und aendert NICHTS",
      wiederholung.ok === false && /ABBRUCH-BEREITS-NEUTRALISIERT/.test(wiederholung.err),
      wiederholung.err.split("\n")[0]);
    check("6.2 Verteilung unveraendert 0/5/0/0", sql(VERTEILUNG_SQL).out === "0/5/0/0");
    const neuErzeugt = sql(`select neu from public.helmut_enqueue_job(
      'source_fetch', 'sf-w-1', '2026-08-19T16Z', '{}'::jsonb);`).out;
    check("6.3 FUNKTIONALER RUECKWEG (a): ein neutralisierter Schluessel ist wieder frei",
      neuErzeugt === "t" && sql(VERTEILUNG_SQL).out === "1/5/0/0", `neu=${neuErzeugt}`);
    const dedupe = sql(`select neu from public.helmut_enqueue_job(
      'source_fetch', 'erledigt-1', '2026-08-13T16Z', '{}'::jsonb);`).out;
    check("6.4 FUNKTIONALER RUECKWEG (b): ein erledigter Schluessel dedupliziert weiter",
      dedupe === "f" && sql(VERTEILUNG_SQL).out === "1/5/0/0", `neu=${dedupe}`);
    sql("delete from public.helmut_jobs where status = 'wartend';");
    check("6.5 Nach dem Aufraeumen der Probe: 0/5/0/0 und Erledigte weiter byte-identisch",
      sql(VERTEILUNG_SQL).out === "0/5/0/0" && sql(ERLEDIGT_MD5_SQL).out === erledigtMd5);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("7 · DATENSCHUTZVERTRAG — keine Nutzdaten verlassen die Datenbank");
  {
    const texte = [
      ["Vorpruefung", N.vorpruefungGemischtSql(vertrag)],
      ["Trockenlauf", N.neutralisierungGemischtSql(vertrag)],
      ["Scharf", N.neutralisierungGemischtSql(vertrag, { modus: "scharf" })]
    ];
    for (const [name, text] of texte) {
      const t = text.toLowerCase();
      const verstoesse = [...N.SENSIBLE_SPALTEN, ...N.VOLLZEILEN_MUSTER].filter((m) => t.includes(m));
      check(`7.1 ${name}s-SQL liest keine sensible Spalte und kein Vollzeilenkonstrukt`,
        verstoesse.length === 0, verstoesse.join(","));
    }
    const gesamt = ALLE_AUSGABEN.join("\n");
    check("7.2 KEINE der gesammelten Ausgaben traegt einen Kanarienwert aus den sensiblen Spalten",
      !/KANARIE/.test(gesamt), (gesamt.match(/KANARIE[^\s"']*/g) || []).slice(0, 3).join(","));
    check("7.3 Die Kanarien standen VOR der Loeschung wirklich in allen fuenf Traegern "
      + "(payload/last_error/tenant_id/idempotency_key/outbox.last_error)",
    kanarienVorher === "1/1/1/1/1", kanarienVorher);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("8 · Der gemischte Production-Vertrag im Modul stimmt mit dem Runbook ueberein");
  {
    const runbook = fs.readFileSync(path.join(ROOT, "docs/betrieb/op30-aktivierung-5-mandate.md"), "utf8");
    const P = N.PRODUCTION_VERTRAG_GEMISCHT;
    check("8.1 Gesamtsignatur des Moduls steht im Runbook", runbook.includes(P.signaturGesamt));
    check("8.2 ID-Ketten-md5 der Zielmenge steht im Runbook", runbook.includes(P.idKettenMd5Zielmenge));
    check("8.3 Erledigt-Signatur steht im Runbook", runbook.includes(P.signaturErledigt));
    check("8.4 Zeitgrenze steht im Runbook", runbook.includes(P.grenze));
    check("8.5 Die Verteilung 301/235/82/0 und die Zielmenge 383 stehen im Runbook",
      /301 ?\/ ?235 ?\/ ?82 ?\/ ?0/.test(runbook) && runbook.includes("383"));
    check("8.6 Der Vertrag traegt die Production-Werte (301+82=383, Outbox 383)",
      P.wartend === 301 && P.laeuft === 82 && P.zielmenge === 383
      && P.outboxZielmenge === 383 && P.erledigt === 235 && P.gesamt === 618);
  }

  // Aufraeumen: die Wegwerfdatenbank leer hinterlassen.
  datei(OUTBOX_ROLLBACK);
  datei(BASIS_ROLLBACK);

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}`);
  if (fail === 0) {
    console.log("Die gemischte Neutralisierung (wartend + laeuft mit abgelaufener Lease) ist an");
    console.log("echter PostgreSQL bewiesen: der §26-Blocker ist belegt, Trockenlauf folgenlos,");
    console.log("jede Abweichung blockiert, Erledigte und fremde Outbox unversehrt, Outbox-Kaskade");
    console.log("bewiesen (R12), Wiederholung sicher, Rueckweg = funktionale Neuerzeugung,");
    console.log("Riegel nachweislich tragend, keine Nutzdaten in irgendeiner Ausgabe.");
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
