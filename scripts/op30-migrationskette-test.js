"use strict";

// Helmut — DIE SECHS OP-30-MIGRATIONSPAARE an echter PostgreSQL (Kapazitaetssprint 2026-08-09).
// =============================================================================================
// Der Sprintauftrag §9 verlangt zwoelf Belege je betroffener Migration: saubere Anwendung,
// wiederholte Anwendung, Rollback, erneute Anwendung nach Rollback, Verhalten bei Abbruch,
// teilweise angewendeter Zustand, Vertraeglichkeit mit Bestandsdaten, RLS, Mandantentrennung,
// Parallelitaet, Reservierung, Idempotenz.
//
// WARUM DAS EINE EIGENE SUITE IST: die bestehenden Datenbanksuiten pruefen je EINE Migration.
// Diese hier prueft die KETTE — und die Kette ist das, was der Betreiber anwenden wuerde.
// Insbesondere prueft sie den Fall, den ein Einzeltest nie sieht: was passiert, wenn eine
// Migration MITTEN in der Kette abbricht, und ob der Rollback der Kette rueckwaerts sauber ist.
//
// KEINE PRODUCTION-MIGRATION. Alles laeuft gegen eine lokale Wegwerf-Datenbank.
// Ohne lokalen Server meldet die Suite ausdruecklich OFFEN und beendet sich mit Exit 0.

const { execFileSync, spawn } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "",
  port: process.env.HELMUT_TEST_PG_PORT || "5433",
  user: process.env.HELMUT_TEST_PG_USER || "helmut",
  db: process.env.HELMUT_TEST_PG_DB_KETTE || "helmut_test_kette"
};

// Die Kette in Anwendungsreihenfolge. `voraus` sind Migrationen ausserhalb von OP-30, die
// vorausgesetzt werden — sie stehen in Production laengst.
const VORAUS = ["20260717_llm_budget_reservation.sql"];
const KETTE = [
  "20260808_scalable_job_queue.sql",
  "20260808_jobqueue_abhaengigkeiten.sql",
  "20260808_jobqueue_bereinigung.sql",
  "20260808_llm_budget_fairness.sql",
  "20260809_jobqueue_wiedervorlage.sql",
  "20260809_jobqueue_narrativ.sql"
];

let pass = 0;
let fail = 0;
let offen = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n${"═".repeat(88)}\n  ${t}\n${"═".repeat(88)}`); }

const datei = (n) => path.join(ROOT, "supabase", "migrations", n);
const rollbackDatei = (n) => datei(n.replace(/\.sql$/, "_rollback.sql"));

function psql(sql, { db = PG.db, dateipfad = null, erwarteFehler = false } = {}) {
  const args = ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", db, "-tA", "-v", "ON_ERROR_STOP=1"];
  if (dateipfad) args.push("-f", dateipfad); else args.push("-c", sql);
  try {
    return { ok: true, out: execFileSync("psql", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() };
  } catch (e) {
    if (!erwarteFehler) throw e;
    return { ok: false, out: String((e.stderr || e.stdout || e.message) || "").trim() };
  }
}
function psqlAsync(sql) {
  return new Promise((resolve) => {
    const k = spawn("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", PG.db, "-tA", "-c", sql],
      { stdio: ["ignore", "pipe", "pipe"] });
    let out = ""; let err = "";
    k.stdout.on("data", (d) => { out += d; });
    k.stderr.on("data", (d) => { err += d; });
    k.on("close", (code) => resolve({ code, out: out.trim(), err: err.trim() }));
  });
}
const zahl = (sql) => Number(psql(sql).out) || 0;
const frisch = () => {
  psql(`drop database if exists ${PG.db}`, { db: "postgres" });
  psql(`create database ${PG.db}`, { db: "postgres" });
};
const spieleEin = (liste) => { for (const m of liste) psql(null, { dateipfad: datei(m) }); };

async function main() {
  console.log("Helmut — Die sechs OP-30-Migrationspaare an echter PostgreSQL");

  if (!PG.host) {
    offen += 1;
    console.log("  OFFEN Migrationskette — HELMUT_TEST_PG_HOST ist nicht gesetzt. Kein lokaler Server, "
      + "kein Datenbanknachweis. Die Kette ist in DIESEM Lauf AUSDRUECKLICH NICHT geprueft.");
    console.log(`\nPASS ${pass}  FAIL ${fail}  OFFEN ${offen}`);
    process.exit(0);
  }
  console.log(`  Server: ${psql("select version()", { db: "postgres" }).out.split(",")[0]}`);
  console.log(`  Kette: ${VORAUS.length} Voraussetzung(en) + ${KETTE.length} OP-30-Paare\n`);

  try {
    // ══ 1 · SAUBERE ANWENDUNG DER GANZEN KETTE ══════════════════════════════════════════════
    abschnitt("1 · Saubere Anwendung, wiederholte Anwendung, Rollback rueckwaerts, erneute Anwendung");
    frisch();
    spieleEin([...VORAUS, ...KETTE]);
    check("1.1 Die vollstaendige Kette laeuft in einem Zug durch", true, `${VORAUS.length + KETTE.length} Dateien`);
    const tabellenNachher = zahl("select count(*) from information_schema.tables where table_schema='public'");
    const funktionenNachher = zahl("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
      + "where n.nspname='public' and p.proname like 'helmut\\_%'");
    check("1.2 Sie legt die erwarteten Objekte an",
      zahl("select count(*) from information_schema.tables where table_schema='public' "
        + "and table_name in ('helmut_jobs','llm_reservations','llm_budget_counters')") === 3,
      `${tabellenNachher} Tabellen, ${funktionenNachher} helmut_-Funktionen`);

    // WIEDERHOLTE ANWENDUNG — jede Datei ein zweites Mal, in derselben Reihenfolge.
    spieleEin([...VORAUS, ...KETTE]);
    check("1.3 Die WIEDERHOLTE Anwendung der ganzen Kette schadet nicht (idempotent)",
      zahl("select count(*) from information_schema.tables where table_schema='public'") === tabellenNachher
      && zahl("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
        + "where n.nspname='public' and p.proname like 'helmut\\_%'") === funktionenNachher);

    // ROLLBACK RUECKWAERTS — so, wie ein Betreiber es tun muesste.
    for (const m of [...KETTE].reverse()) psql(null, { dateipfad: rollbackDatei(m) });
    check("1.4 Das Rollback rueckwaerts entfernt die OP-30-Objekte vollstaendig",
      zahl("select count(*) from information_schema.tables where table_schema='public' "
        + "and table_name in ('helmut_jobs','llm_reservations')") === 0
      && zahl("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
        + "where n.nspname='public' and p.proname in ('helmut_enqueue_job','helmut_claim_jobs','helmut_reserve_llm_result')") === 0);
    check("1.5 Der BESTAND ausserhalb von OP-30 bleibt unberuehrt",
      zahl("select count(*) from information_schema.tables where table_schema='public' and table_name='llm_budget_counters'") === 1
      && zahl("select count(*) from pg_proc where proname='helmut_reserve_llm_call'") === 1);
    // WIEDERHOLTES ROLLBACK
    for (const m of [...KETTE].reverse()) psql(null, { dateipfad: rollbackDatei(m) });
    check("1.6 Ein ZWEITES Rollback ist ebenfalls harmlos",
      zahl("select count(*) from information_schema.tables where table_schema='public' and table_name='helmut_jobs'") === 0);
    // ERNEUTE ANWENDUNG NACH ROLLBACK
    spieleEin(KETTE);
    check("1.7 Nach dem Rollback laesst sich die Kette ERNEUT anwenden",
      zahl("select count(*) from information_schema.tables where table_schema='public' "
        + "and table_name in ('helmut_jobs','llm_reservations')") === 2
      && zahl("select count(*) from pg_proc where proname='helmut_reserve_llm_result'") === 1);

    // ══ 2 · ABBRUCH UND TEILWEISE ANGEWENDETER ZUSTAND ══════════════════════════════════════
    abschnitt("2 · Abbruch mitten in der Kette und teilweise angewendeter Zustand");
    frisch();
    spieleEin(VORAUS);
    // Die Fairness-Migration OHNE ihre Voraussetzung: sie MUSS scheitern, nicht halb wirken.
    psql("drop table if exists public.llm_budget_counters cascade");
    const ohneVoraus = psql(null, { dateipfad: datei("20260808_llm_budget_fairness.sql"), erwarteFehler: true });
    check("2.1 Eine Migration ohne ihre Voraussetzung SCHEITERT sichtbar",
      ohneVoraus.ok === false && /llm_budget_counters/.test(ohneVoraus.out),
      ohneVoraus.out.split("\n").find((z) => /ERROR/.test(z)) || "");
    check("2.2 Sie hinterlaesst dabei NICHTS (die Transaktion nimmt alles zurueck)",
      zahl("select count(*) from information_schema.tables where table_schema='public' and table_name='llm_reservations'") === 0
      && zahl("select count(*) from pg_proc where proname='helmut_reserve_llm_result'") === 0);

    // TEILWEISE ANGEWENDET: Basis ja, Narrativerweiterung nein.
    frisch();
    spieleEin([...VORAUS, "20260808_scalable_job_queue.sql", "20260808_jobqueue_abhaengigkeiten.sql"]);
    const teil = psql("select public.helmut_enqueue_job('tenant_narrative','k','f','{}'::jsonb,now(),240::smallint,5,'t')",
      { erwarteFehler: true });
    check("2.3 Teilzustand: der noch nicht erlaubte Auftragstyp wird ABGELEHNT, nicht angenommen",
      teil.ok === false && /helmut_jobs_type_chk/.test(teil.out));
    check("2.4 Die erlaubten Typen funktionieren im Teilzustand unveraendert",
      psql("select (public.helmut_enqueue_job('source_fetch','k2','f','{}'::jsonb,now(),100::smallint,5,'t')).neu").out === "t");
    spieleEin(["20260809_jobqueue_narrativ.sql"]);
    check("2.5 Die Erweiterung laesst sich auf den Teilzustand nachziehen",
      psql("select (public.helmut_enqueue_job('tenant_narrative','k3','f','{}'::jsonb,now(),240::smallint,5,'t')).neu").out === "t");
    check("2.6 Der vorher eingereihte Bestandsauftrag hat das UEBERLEBT",
      zahl("select count(*) from public.helmut_jobs where idempotency_key='k2'") === 1);

    // ══ 3 · VERTRAEGLICHKEIT MIT BESTEHENDEN DATEN ═════════════════════════════════════════
    abschnitt("3 · Vertraeglichkeit mit bestehenden Daten");
    frisch();
    spieleEin([...VORAUS, ...KETTE]);
    for (let i = 0; i < 20; i += 1) {
      psql(`select public.helmut_enqueue_job('tenant_narrative','b${i}','f','{}'::jsonb,now(),240::smallint,5,'t${i % 3}')`);
    }
    psql("select public.helmut_reserve_llm_result('bestand-1','2026-08-10','tenant:t0','notwendig',100,5,900000)");
    const vorher = { jobs: zahl("select count(*) from public.helmut_jobs"), res: zahl("select count(*) from public.llm_reservations") };
    spieleEin(KETTE);   // erneut ueber BESTEHENDE Daten
    check("3.1 Die erneute Anwendung ueber Bestandsdaten verliert KEINE Zeile",
      zahl("select count(*) from public.helmut_jobs") === vorher.jobs
      && zahl("select count(*) from public.llm_reservations") === vorher.res,
      `${vorher.jobs} Auftraege, ${vorher.res} Reservierungen`);
    check("3.2 Die Bestandsdaten sind danach unveraendert nutzbar",
      zahl("select count(*) from public.helmut_claim_jobs('w',5,300000,array['tenant_narrative']::text[])") === 5);

    // ══ 4 · RLS UND MANDANTENTRENNUNG ══════════════════════════════════════════════════════
    abschnitt("4 · RLS, Rechte und Mandantentrennung");
    for (const t of ["helmut_jobs", "llm_reservations"]) {
      const stand = psql(`select relrowsecurity||'/'||relforcerowsecurity from pg_class where relname='${t}'`).out;
      check(`4.1 ${t}: RLS ist aktiviert UND erzwungen`, stand === "true/true" || stand === "t/t", stand);
      check(`4.2 ${t}: anon/authenticated/PUBLIC haben KEINE Rechte`,
        zahl(`select count(*) from information_schema.role_table_grants where table_name='${t}' `
          + "and grantee in ('anon','authenticated','PUBLIC')") === 0);
      check(`4.3 ${t}: es gibt KEINE Policy (zweiter unabhaengiger Riegel)`,
        zahl(`select count(*) from pg_policies where tablename='${t}'`) === 0);
    }
    check("4.4 Keine SECURITY-DEFINER-Funktion in der Kette (kein Rechte-Umweg)",
      zahl("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
        + "where n.nspname='public' and p.proname like 'helmut\\_%' and p.prosecdef") === 0);
    check("4.5 Die Warteschlange traegt die Mandatskennung — Arbeit ist zuordenbar",
      zahl("select count(*) from information_schema.columns where table_name='helmut_jobs' and column_name='tenant_id'") === 1);
    check("4.6 Ein Bereichsdeckel trennt die Mandate wirklich",
      (() => {
        psql("delete from public.llm_reservations");
        let erlaubtT1 = 0;
        for (let i = 0; i < 5; i += 1) {
          if (psql(`select erlaubt from public.helmut_reserve_llm_result('t1-${i}','2026-08-10','tenant:t1','notwendig',100,2,900000)`).out === "t") erlaubtT1 += 1;
        }
        // Ein ANDERES Mandat darf davon unberuehrt seinen eigenen Anteil ziehen.
        const t2 = psql("select erlaubt from public.helmut_reserve_llm_result('t2-0','2026-08-10','tenant:t2','notwendig',100,2,900000)").out;
        return erlaubtT1 === 2 && t2 === "t";
      })());

    // ══ 5 · PARALLELITAET, RESERVIERUNG, IDEMPOTENZ ════════════════════════════════════════
    abschnitt("5 · Parallelitaet, Reservierung, Idempotenz an der fertigen Kette");
    psql("delete from public.helmut_jobs");
    for (let i = 0; i < 80; i += 1) {
      psql(`select public.helmut_enqueue_job('tenant_narrative','p${i}','f','{}'::jsonb,now() - interval '1 minute',240::smallint,5,'t')`);
    }
    const gleichzeitig = await Promise.all(Array.from({ length: 12 }, (_, i) =>
      psqlAsync(`select id from public.helmut_claim_jobs('w${i}',10,300000,array['tenant_narrative']::text[])`)));
    const ids = gleichzeitig.flatMap((r) => r.out.split("\n").filter(Boolean));
    check("5.1 Zwoelf gleichzeitige Reservierer bekamen keinen Auftrag doppelt",
      ids.length === new Set(ids).size, `${ids.length} reserviert, ${new Set(ids).size} verschieden`);
    check("5.2 Sie haben zusammen hoechstens den Bestand reserviert", ids.length <= 80, `${ids.length} von 80`);
    check("5.3 Der Idempotenzschluessel ist ueber ALLE Status eindeutig",
      psql("select public.helmut_enqueue_job('tenant_narrative','p0','f','{}'::jsonb,now(),240::smallint,5,'t')",
        { erwarteFehler: true }).ok === true
      && zahl("select count(*) from public.helmut_jobs where idempotency_key='p0'") === 1);
    const doppelt = await Promise.all(Array.from({ length: 8 }, () =>
      psqlAsync("select erlaubt from public.helmut_reserve_llm_result('gleich','2026-08-10','global','notwendig',100,null,900000)")));
    check("5.4 Acht gleichzeitige Reservierungen DESSELBEN Ergebnisses erzeugen genau EINE Zeile",
      zahl("select count(*) from public.llm_reservations where result_key='gleich'") === 1
      && doppelt.every((r) => r.code === 0));

    // ══ 6 · ROLLBACK VERLIERT KEINE FACHDATEN ══════════════════════════════════════════════
    abschnitt("6 · Was ein Rollback kostet — ausdruecklich beziffert");
    const vorRollback = {
      jobs: zahl("select count(*) from public.helmut_jobs"),
      res: zahl("select count(*) from public.llm_reservations"),
      zaehler: zahl("select coalesce(sum(used),0) from public.llm_budget_counters")
    };
    for (const m of [...KETTE].reverse()) psql(null, { dateipfad: rollbackDatei(m) });
    check("6.1 Das Rollback entfernt Betriebszustand (Warteschlange, Reservierungen) — bewusst",
      zahl("select count(*) from information_schema.tables where table_schema='public' "
        + "and table_name in ('helmut_jobs','llm_reservations')") === 0,
      `${vorRollback.jobs} Auftraege und ${vorRollback.res} Reservierungen entfallen`);
    check("6.2 Es laesst die KOSTENWAHRHEIT unangetastet (llm_budget_counters bleibt)",
      zahl("select coalesce(sum(used),0) from public.llm_budget_counters") === vorRollback.zaehler,
      `Zaehlerstand ${vorRollback.zaehler} unveraendert`);
    check("6.3 Der Altpfad ist nach dem Rollback sofort wieder vollstaendig",
      psql("select allowed from public.helmut_reserve_llm_call('2026-08-10','global',1000)").out === "t");
  } finally {
    try { psql(`drop database if exists ${PG.db}`, { db: "postgres" }); } catch (_) { /* egal */ }
  }

  console.log(`\n${"═".repeat(88)}`);
  console.log(`PASS ${pass}  FAIL ${fail}  OFFEN ${offen}  (gesamt ${pass + fail + offen})`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("TESTLAUF-FEHLER:", e && e.stack ? e.stack : e);
  try { psql(`drop database if exists ${PG.db}`, { db: "postgres" }); } catch (_) { /* egal */ }
  process.exit(1);
});
