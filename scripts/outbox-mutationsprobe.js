"use strict";

// Helmut — MUTATIONSPROBE der Outbox-Schutzmechanismen (OP-30-Zielarchitektur).
// =============================================================================================
// Prinzip (wie scripts/jobqueue-mutationsprobe.js): ein gruener Test beweist nichts, solange
// niemand geprueft hat, ob er ueberhaupt rot werden KANN. Diese Probe entfernt gezielt je
// EINEN Schutzmechanismus aus einer IN-MEMORY-Kopie der Migration 20260813_jobqueue_outbox.sql
// (die Datei selbst wird NIE veraendert), spielt sie in eine Wegwerf-Datenbank ein und weist
// nach, dass der Schaden dann tatsaechlich eintritt.
//
// SEMANTIK INVERTIERT: ROT (= Mutation erkannt, Schaden tritt ein) ist der ERFOLG der Probe.
// GRUEN (= Schaden bleibt aus) waere ein LOCH IM NACHWEIS -> Exit 1.
//
// Laeuft NUR manuell (endet nicht auf -test.js; DB-lastig):
//   HELMUT_TEST_PG_HOST=<sock|host> node scripts/outbox-mutationsprobe.js

const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BASIS = path.join(ROOT, "supabase", "migrations", "20260808_scalable_job_queue.sql");
const MIGRATION = path.join(ROOT, "supabase", "migrations", "20260813_jobqueue_outbox.sql");

const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "",
  port: process.env.HELMUT_TEST_PG_PORT || "5433",
  user: process.env.HELMUT_TEST_PG_USER || "helmut",
  db: "helmut_outbox_mutation"
};

let erkannt = 0;
let loecher = 0;
function mutation(name, schadenEingetreten, detail = "") {
  if (schadenEingetreten) { erkannt += 1; console.log(`  ROT (erkannt)   ${name}`); }
  else { loecher += 1; console.log(`  GRUEN (LOCH!)   ${name}${detail ? ` — ${detail}` : ""}`); }
}

function psql(sql, { datei = null, erwarteFehler = false, db = PG.db } = {}) {
  const args = ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", db, "-tA", "-v", "ON_ERROR_STOP=1"];
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
    kind.stdout.on("data", (d) => { out += d; });
    kind.on("close", () => resolve(out.trim()));
  });
}

// Frische Wegwerf-DB + Basis + MUTIERTE Outbox-Migration. Genau EIN replace, harter
// Fehler bei fehlendem Anker (eine Mutation, die nichts trifft, waere aussagelos).
function spieleEin(suchen, ersetzen) {
  psql(`drop database if exists ${PG.db}`, { db: "postgres" });
  psql(`create database ${PG.db}`, { db: "postgres" });
  psql(`do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$`);
  psql(null, { datei: BASIS });
  const original = fs.readFileSync(MIGRATION, "utf8");
  if (suchen && !original.includes(suchen)) {
    throw new Error(`Mutationsanker nicht gefunden: ${suchen.slice(0, 60)}`);
  }
  const mutiert = suchen ? original.replace(suchen, ersetzen) : original;
  const tmp = path.join(os.tmpdir(), `outbox-mutation-${Date.now()}.sql`);
  fs.writeFileSync(tmp, mutiert);
  try { psql(null, { datei: tmp }); } finally { fs.unlinkSync(tmp); }
}

function reihEin(schluessel) {
  return psql(`select id from public.helmut_enqueue_job_mit_outbox('source_fetch', '${schluessel}', '2026-08-13T00Z', '{}'::jsonb, now(), 100::smallint, 3, null, 1)`).out.split("|")[0];
}

async function main() {
  console.log("Helmut — Mutationsprobe Outbox (ROT = Schutz nachweislich wirksam)");
  if (!PG.host) {
    console.log("\nUEBERSPRUNGEN: HELMUT_TEST_PG_HOST nicht gesetzt — Probe OFFEN, nicht erbracht.");
    process.exit(0);
  }

  console.log("\n== §0 Vorprobe: unveraenderter Stand ist sauber ==");
  spieleEin(null, null);
  reihEin("m0");
  const vor = await Promise.all(Array.from({ length: 8 }, () => psqlAsync("select outbox_id from public.helmut_outbox_naechste(10, 'probe')")));
  const vorIds = vor.flatMap((v) => v.split("\n").filter(Boolean));
  if (vorIds.length !== new Set(vorIds).size) {
    console.log("  ABBRUCH: schon der unveraenderte Stand vergibt doppelt — Probe waere aussagelos.");
    process.exit(1);
  }
  console.log("  ok: 0 Doppelvergaben im Original");

  console.log("\n== M1 · `for update skip locked` entfernt -> Doppelvergabe unter Konkurrenz ==");
  spieleEin("for update skip locked\n     limit greatest(coalesce(p_limit, 1), 0)",
    "limit greatest(coalesce(p_limit, 1), 0)");
  for (let i = 0; i < 150; i += 1) reihEin(`m1-${i}`);
  let doppelt = 0;
  // Mehr Runden und groessere Limits als in der Erstfassung: das Konkurrenzfenster der
  // mutierten Vergabe ist klein (Einzelstatement, autocommit) — erst ausreichend
  // Kontention macht die fehlende Sperre zuverlaessig sichtbar.
  for (let runde = 0; runde < 10 && doppelt === 0; runde += 1) {
    psql("update public.helmut_job_outbox set status='offen', attempts=0, next_attempt_at=now()");
    const m1 = await Promise.all(Array.from({ length: 8 }, () => psqlAsync("select outbox_id from public.helmut_outbox_naechste(80, 'probe')")));
    const ids = m1.flatMap((v) => v.split("\n").filter(Boolean));
    doppelt = ids.length - new Set(ids).size;
  }
  mutation("M1 Doppelvergabe tritt ohne skip locked ein", doppelt > 0, "keine Doppelvergabe beobachtet");

  console.log("\n== M2 · unique-Index auf job_id entfernt -> zweite Absicht je Auftrag ==");
  spieleEin("create unique index if not exists helmut_job_outbox_job_uidx",
    "create index if not exists helmut_job_outbox_job_uidx");
  const m2job = reihEin("m2");
  // Ohne unique-Riegel kann ein direkter Doppel-Insert (Race zweier Planer) bestehen bleiben.
  const m2 = psql(`insert into public.helmut_job_outbox (job_id) values ('${m2job}') returning id`, { erwarteFehler: true });
  const m2n = psql(`select count(*) from public.helmut_job_outbox where job_id='${m2job}'`).out;
  mutation("M2 Ohne unique-Index entstehen zwei Absichten fuer EINEN Auftrag", m2.ok === true && m2n === "2", `insert ok=${m2.ok} n=${m2n}`);

  console.log("\n== M3 · Terminal-Pruefung entfernt -> Absicht fuer erledigten Auftrag ==");
  spieleEin("if v_status in ('wartend', 'laeuft') then",
    "if v_status is not null then");
  const m3job = reihEin("m3");
  psql("select * from public.helmut_claim_jobs('m3', 10, 60000, null)");
  psql(`select * from public.helmut_finish_job('${m3job}', 'm3', true, null, 0)`);
  psql(`delete from public.helmut_job_outbox where job_id='${m3job}'`);
  const m3 = psql(`select versandabsicht from public.helmut_enqueue_job_mit_outbox('source_fetch', 'm3', '2026-08-13T00Z', '{}'::jsonb, now(), 100::smallint, 3, null, 1)`).out;
  mutation("M3 Ohne Terminal-Pruefung entsteht eine Absicht fuer einen ERLEDIGTEN Auftrag", m3 === "neu", `versandabsicht=${m3}`);

  console.log("\n== M4 · Backoff entfernt -> sofortige Wiedervergabe ==");
  spieleEin("next_attempt_at = v_now + least(interval '30 minutes',\n                             (30 * power(2, o.attempts))::numeric * interval '1 second')",
    "next_attempt_at = v_now");
  reihEin("m4");
  psql("select * from public.helmut_outbox_naechste(10, 'probe')");
  const m4 = psql("select count(*) from public.helmut_outbox_naechste(10, 'probe')").out;
  mutation("M4 Ohne Backoff wird eine unbestaetigt versendete Absicht SOFORT erneut vergeben", m4 !== "0", `zweite Vergabe=${m4}`);

  console.log("\n== M5 · Statusbindung der Bestaetigung entfernt -> Doppelabschluss moeglich ==");
  spieleEin("where o.id = p_outbox_id and o.status = 'versendet'\n    returning o.status into v_status;\n  else",
    "where o.id = p_outbox_id\n    returning o.status into v_status;\n  else");
  const m5job = reihEin("m5");
  psql("select * from public.helmut_outbox_naechste(10, 'probe')");
  const m5id = psql(`select id from public.helmut_job_outbox where job_id='${m5job}'`).out;
  psql(`select * from public.helmut_outbox_bestaetige('${m5id}', true, null)`);
  const m5 = psql(`select uebernommen from public.helmut_outbox_bestaetige('${m5id}', true, null)`).out;
  mutation("M5 Ohne Statusbindung wird eine zweite Bestaetigung faelschlich uebernommen", m5 === "t", `zweite Bestaetigung=${m5}`);

  console.log("\n== M6 · Faelligkeitsfilter des Abgleichs entfernt -> Weckrufe fuer nicht faellige Arbeit ==");
  spieleEin("and j.due_at <= v_now\n       and not exists (select 1 from public.helmut_job_outbox o where o.job_id = j.id)",
    "and not exists (select 1 from public.helmut_job_outbox o where o.job_id = j.id)");
  psql(`select id from public.helmut_enqueue_job('source_fetch', 'm6-zukunft', '2026-08-13T00Z', '{}'::jsonb, now() + interval '2 hours', 100::smallint, 3, null)`);
  const m6 = psql("select fehlend from public.helmut_outbox_abgleich(200, 10)").out;
  mutation("M6 Ohne Faelligkeitsfilter merkt der Abgleich NICHT faellige Auftraege vor", Number(m6) >= 1, `fehlend=${m6}`);

  psql(`drop database if exists ${PG.db}`, { db: "postgres" });

  console.log(`\n== ERGEBNIS ==\nerkannt (ROT) ${erkannt}  Loecher (GRUEN) ${loecher}`);
  if (loecher > 0) {
    console.log("MINDESTENS EIN SCHUTZ IST NICHT NACHWEISBAR WIRKSAM — das ist ein Fehlschlag der PROBE.");
    process.exit(1);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error("FATAL:", error && error.message);
  try { psql(`drop database if exists ${PG.db}`, { db: "postgres" }); } catch (_) { /* egal */ }
  process.exit(1);
});
