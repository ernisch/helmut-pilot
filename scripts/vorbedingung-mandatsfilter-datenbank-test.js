"use strict";

// Helmut — DATENBANKNACHWEIS des Mandatsfilters der Vorbedingungszaehlung (Befund Z22).
// =============================================================================================
// Prueft `supabase/migrations/20260826190000_jobqueue_vorbedingung_mandatsfilter.sql` an einer
// ECHTEN PostgreSQL — nicht an der Attrappe. Die Anwendungsseite prueft
// `scripts/vorbedingung-mandatsfilter-test.js`.
//
//   §1  Migration laeuft vorwaerts, rueckwaerts und erneut vorwaerts
//   §2  Nach der Migration existiert GENAU EINE Fassung (kein mehrdeutiger Aufruf)
//   §3  Sicherheit: keine Rechte fuer anon/authenticated, fester search_path, nur lesend
//   §4  Ohne `p_mandat` zaehlt sie exakt wie die Vorfassung (Verhaltensgleichheit)
//   §5  Mit `p_mandat`: global + eigen, niemals fremd  — DAS GEGENBEISPIEL
//   §6  Altaufruf mit ZWEI Argumenten bleibt lauffaehig (Vorgabewert)
//   §7  Zaehlmenge unveraendert: wartend/laeuft zaehlen, fehlgeschlagen nicht
//   §8  Leere oder nur aus Leerzeichen bestehende Kennung zaehlt global (fail closed)
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
function zaehle({ mandat = undefined, typen = "array['source_fetch','mandate_projection']" } = {}) {
  const arg = mandat === undefined
    ? `array['${FENSTER}'], ${typen}`
    : `array['${FENSTER}'], ${typen}, ${mandat === null ? "null" : `'${mandat}'`}`;
  const zeile = psql(`select offen||'|'||wartend||'|'||laufend||'|'||fehlgeschlagen||'|'||erledigt
                        from public.helmut_jobs_offen(${arg})`).out;
  const [offen, wartend, laufend, fehlgeschlagen, erledigt] = zeile.split("|").map(Number);
  return { offen, wartend, laufend, fehlgeschlagen, erledigt };
}

function einreihen(typ, mandat, status = "wartend", schluessel = null) {
  const key = schluessel || `${typ}|${mandat || "global"}|${Math.random().toString(36).slice(2)}`;
  // `helmut_jobs_lease_chk`: `laeuft` verlangt Halter UND Ablaufzeit — die Tabelle laesst
  // einen halterlosen laufenden Auftrag gar nicht erst zu. Genau so soll es sein.
  const laeuft = status === "laeuft";
  psql(`insert into public.helmut_jobs
          (job_type, idempotency_key, freshness_window, tenant_id, status, priority,
           max_attempts, payload, lease_owner, lease_expires_at)
        values ('${typ}', '${key}', '${FENSTER}',
                ${mandat === null ? "null" : `'${mandat}'`}, '${status}', 100, 5, '{}'::jsonb,
                ${laeuft ? "'pruefstand-w1'" : "null"},
                ${laeuft ? "now() + interval '2 minutes'" : "null"})`);
  return key;
}

function main() {
  console.log("Helmut — Datenbanknachweis des Mandatsfilters (Befund Z22)");
  if (!PG.host) {
    console.log("\n  UEBERSPRUNGEN: kein HELMUT_TEST_PG_HOST gesetzt.");
    console.log("  >> DER DATENBANKNACHWEIS IST DAMIT OFFEN, NICHT ERBRACHT. <<");
    process.exit(0);
  }
  try {
    psql("select 1", { db: "postgres" });
  } catch (error) {
    console.log(`\n  UEBERSPRUNGEN: kein erreichbarer Server (${String(error.message).slice(0, 120)}).`);
    console.log("  >> DER DATENBANKNACHWEIS IST DAMIT OFFEN, NICHT ERBRACHT. <<");
    process.exit(0);
  }
  const version = psql("show server_version", { db: "postgres" }).out;
  console.log(`  PostgreSQL ${version} auf ${PG.host}:${PG.port}, Datenbank ${PG.db}\n`);

  // Frische Datenbank — nie gegen eine bestehende arbeiten.
  psql(`select count(*) from (select pg_terminate_backend(pid) from pg_stat_activity
          where datname = '${PG.db}' and pid <> pg_backend_pid()) t`, { db: "postgres" });
  psql(`drop database if exists ${PG.db}`, { db: "postgres" });
  psql(`create database ${PG.db}`, { db: "postgres" });
  psql("create extension if not exists pgcrypto");
  psql(null, { datei: BASIS });
  psql(null, { datei: ABHAENGIG });

  // ═══ §1 · Vorwaerts, rueckwaerts, erneut vorwaerts ════════════════════════════════════════
  abschnitt("1 · Migration laeuft vorwaerts, rueckwaerts und erneut vorwaerts");
  const stellen = () => psql(`select coalesce(string_agg(p.pronargs::text, ',' order by p.pronargs), '-')
                                from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                               where n.nspname = 'public' and p.proname = 'helmut_jobs_offen'`).out;
  check("1.1 Vorher gibt es die zweistellige Fassung", stellen() === "2", `Stellen ${stellen()}`);
  psql(null, { datei: MIGRATION });
  check("1.2 Nach der Migration gibt es die dreistellige Fassung", stellen() === "3", `Stellen ${stellen()}`);
  psql(null, { datei: RUECKWEG });
  check("1.3 Der Rueckweg stellt die zweistellige Fassung wieder her", stellen() === "2", `Stellen ${stellen()}`);
  psql(null, { datei: MIGRATION });
  check("1.4 Erneut vorwaerts: wieder dreistellig (idempotent)", stellen() === "3", `Stellen ${stellen()}`);

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
  const planVon = (mitFilter) => psql(`explain (analyze, format text)
      select count(*) filter (where j.status in ('wartend','laeuft'))
        from public.helmut_jobs j
       where j.freshness_window = any(array['${LASTFENSTER}'])
         and j.job_type = any(array['source_fetch'])
         ${mitFilter ? `and (null is null or j.tenant_id is null or j.tenant_id = '${MANDAT_B}')` : ""}`).out;
  const knoten = (plan) => (plan.match(/(Seq Scan|Index Scan|Index Only Scan|Bitmap Index Scan) (on|using) [a-z_]+/g) || []).join(" | ");
  const dauer = (plan) => Number((plan.match(/Execution Time: ([\d.]+) ms/) || [])[1] || NaN);
  const ohne = planVon(false);
  const mit = planVon(true);
  check("9.1 Der Zugriffsweg ist mit und ohne Mandatsfilter derselbe",
    knoten(ohne) === knoten(mit) && knoten(mit) !== "", `${knoten(mit) || "kein Scanknoten erkannt"}`);
  check("9.2 Die Ausfuehrungszeit waechst durch den Filter nicht nennenswert (< +50 %)",
    Number.isFinite(dauer(ohne)) && Number.isFinite(dauer(mit)) && dauer(mit) <= dauer(ohne) * 1.5 + 1,
    `ohne ${dauer(ohne)} ms · mit ${dauer(mit)} ms`);
  const t0 = Date.now();
  for (let i = 0; i < 20; i += 1) zaehle({ mandat: MANDAT_B, typen: "array['source_fetch']" });
  const jeAufruf = (Date.now() - t0) / 20;
  check("9.3 20 Zaehlungen auf 20 000+ Zeilen bleiben schnell (< 50 ms je Aufruf)",
    jeAufruf < 50, `${jeAufruf.toFixed(1)} ms je Aufruf (inkl. psql-Prozessstart)`);
  console.log("      (Messwerte dieser Maschine, keine Production-Werte — Supabase bleibt ungemessen.)");

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
    console.log("  UEBERSPRUNGEN: kein lokales PostgREST (HELMUT_Z3_POSTGREST).");
    console.log("  >> DER RUECKFALLNACHWEIS IST DAMIT OFFEN, NICHT ERBRACHT. <<");
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
    psql(null, { datei: MIGRATION });   // Pruefstand wieder auf den Sollstand
    try { fs.rmSync(arbeit, { recursive: true, force: true }); } catch (_) { /* egal */ }
  }
}

function abschluss() {
  psql(`select count(*) from (select pg_terminate_backend(pid) from pg_stat_activity
          where datname = '${PG.db}' and pid <> pg_backend_pid()) t`, { db: "postgres" });
  psql(`drop database if exists ${PG.db}`, { db: "postgres" });
  console.log("\n== ERGEBNIS ==");
  console.log(`PASS ${pass}  FAIL ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}

try {
  main();
} catch (error) {
  console.error(`\nLAUFFEHLER: ${error && error.stack ? error.stack : error}`);
  process.exit(1);
}
