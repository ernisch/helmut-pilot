"use strict";

// Helmut — MUTATIONSPROBE der Warteschlangen-Nachweise (OP-30).
// =============================================================================================
// WOZU DIESE SUITE DIENT — und warum sie ohne sie wertlos waere:
//
//   Ein gruener Test beweist nichts, solange niemand geprueft hat, ob er ueberhaupt rot
//   werden KANN. Genau dieser Fehler ist in diesem Sprint schon einmal passiert: Abschnitt 4
//   der Datenbanksuite behauptete "acht echte, gleichzeitige Verbindungen", benutzte aber
//   `spawnSync` (synchron) — der Test war gruen und hat nie geprueft, was er zu pruefen
//   vorgab. Diese Suite ist die Antwort darauf.
//
//   Sie VERAENDERT gezielt die Migration (jeweils genau eine Stelle), spielt die kaputte
//   Fassung in eine WEGWERF-Datenbank ein und prueft, ob die zugehoerige Zusage bricht.
//   Eine Mutation, die NICHT rot wird, ist ein Loch im Nachweis.
//
// SICHERHEIT:
//   * Es wird ausschliesslich in einer eigenen, bei jedem Lauf neu angelegten Datenbank
//     gearbeitet (Default `helmut_mutation`), NIE in der Nachweisdatenbank und NIE in
//     Production. Die Datei `supabase/migrations/20260808_scalable_job_queue.sql` wird
//     NICHT veraendert — die Mutationen entstehen nur im Speicher.
//   * Kein Netz, keine KI, keine Kosten.
//
// KONFIGURATION (wie jobqueue-datenbank-test.js):
//   HELMUT_TEST_PG_HOST / _PORT / _USER   — ohne Host wird die Suite ehrlich uebersprungen.

const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const MIGRATION = path.join(ROOT, "supabase", "migrations", "20260808_scalable_job_queue.sql");

const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "",
  port: process.env.HELMUT_TEST_PG_PORT || "5433",
  user: process.env.HELMUT_TEST_PG_USER || "helmut",
  db: "helmut_mutation"          // BEWUSST eine eigene Wegwerf-Datenbank
};

let rot = 0;
let gruen = 0;
function mutation(name, ok, detail = "") {
  if (ok) { rot += 1; console.log(`  ROT   ${name}`); }
  else { gruen += 1; console.log(`  GRUEN ${name}  <-- LOCH IM NACHWEIS${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

function psql(sql, { db = PG.db, datei = null, stillerFehler = false } = {}) {
  const args = ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", db, "-tA", "-v", "ON_ERROR_STOP=1"];
  if (datei) args.push("-f", datei); else args.push("-c", sql);
  try {
    return { ok: true, out: execFileSync("psql", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() };
  } catch (error) {
    if (!stillerFehler) throw error;
    return { ok: false, out: String((error.stderr || error.stdout || error.message) || "").trim() };
  }
}

function servererreichbar() {
  if (!PG.host) return false;
  try {
    execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", "postgres", "-tAc", "select 1"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch (_) { return false; }
}

// Migration mit genau EINER Ersetzung in eine frische Datenbank einspielen.
function spieleEin(ersetzung, vorbereitung = null) {
  const original = fs.readFileSync(MIGRATION, "utf8");
  let sql = original;
  if (ersetzung) {
    const [suchen, ersetzen] = ersetzung;
    if (!sql.includes(suchen)) {
      throw new Error(`Mutationsanker nicht gefunden: ${suchen.slice(0, 70)}`);
    }
    sql = sql.replace(suchen, ersetzen);
    if (sql === original) throw new Error("Mutation hat nichts veraendert");
  }
  psql(`drop database if exists ${PG.db}`, { db: "postgres" });
  psql(`create database ${PG.db}`, { db: "postgres" });
  if (vorbereitung) psql(vorbereitung);
  const tmp = path.join(require("os").tmpdir(), `helmut-mutation-${process.pid}.sql`);
  fs.writeFileSync(tmp, sql, "utf8");
  try { psql(null, { datei: tmp }); } finally { fs.unlinkSync(tmp); }
}

// Mehrere Ersetzungen in EINER Migration (fuer Mutationen, die zwei Guertel zugleich entfernen).
function spieleEinMehrfach(ersetzungen, vorbereitung = null) {
  const original = fs.readFileSync(MIGRATION, "utf8");
  let sql = original;
  for (const [suchen, ersetzen] of ersetzungen) {
    if (!sql.includes(suchen)) throw new Error(`Mutationsanker nicht gefunden: ${suchen.slice(0, 70)}`);
    sql = sql.replace(suchen, ersetzen);
  }
  psql(`drop database if exists ${PG.db}`, { db: "postgres" });
  psql(`create database ${PG.db}`, { db: "postgres" });
  if (vorbereitung) psql(vorbereitung);
  const tmp = path.join(require("os").tmpdir(), `helmut-mutation-m-${process.pid}.sql`);
  fs.writeFileSync(tmp, sql, "utf8");
  try { psql(null, { datei: tmp }); } finally { fs.unlinkSync(tmp); }
}

// Ein Auftragsstapel + n ECHT GLEICHZEITIGE Reservierungen; liefert die Doppelvergabezahl.
//
// BELEGTER FEHLER (2026-08-08, in dieser Datei gefunden und behoben): eine erste Fassung
// benutzte `spawnSync` und rief die Worker damit NACHEINANDER auf. Genau dann kann das
// Fehlen von `for update skip locked` gar keine Doppelvergabe erzeugen — jeder Aufruf sieht
// den bereits festgeschriebenen Stand des vorigen. Die Mutation M1 blieb deshalb faelschlich
// gruen. Die Probe braucht hier zwingend echte Gleichzeitigkeit.
function claimGleichzeitig(worker, jeWorker) {
  const auftraege = [];
  for (let i = 0; i < worker; i += 1) {
    auftraege.push(new Promise((resolve) => {
      const kind = spawn("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", PG.db, "-tA",
        "-c", `select id from public.helmut_claim_jobs('mw${i}', ${jeWorker}, 60000)`],
        { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      kind.stdout.on("data", (d) => { out += d; });
      kind.stderr.on("data", () => {});
      kind.on("close", () => resolve(String(out).split("\n").map((z) => z.trim()).filter(Boolean)));
    }));
  }
  return Promise.all(auftraege);
}

async function doppelvergaben(worker = 8, jeWorker = 40, runden = 3) {
  const gesamt = worker * jeWorker;
  let ids = [];
  for (let runde = 0; runde < runden; runde += 1) {
    psql("delete from public.helmut_jobs");
    psql(`select public.helmut_enqueue_job('source_fetch','m${runde}-'||g,'F','{}'::jsonb) from generate_series(1,${gesamt}) g`);
    const listen = await claimGleichzeitig(worker, jeWorker);
    // Je Runde eigene Schluessel, deshalb sind Ids ueber Runden hinweg ohnehin verschieden.
    const rundenIds = listen.flat();
    const doppeltInRunde = rundenIds.length - new Set(rundenIds).size;
    if (doppeltInRunde > 0) return { gesamt: rundenIds.length, eindeutig: new Set(rundenIds).size, doppelt: doppeltInRunde };
    ids = rundenIds;
  }
  return { gesamt: ids.length, eindeutig: new Set(ids).size, doppelt: 0 };
}

async function main() {
  console.log("Helmut — Mutationsprobe der Warteschlangen-Nachweise (OP-30)");

  if (!servererreichbar()) {
    console.log("\n== UEBERSPRUNGEN ==");
    console.log("  Kein lokaler PostgreSQL-Server erreichbar (HELMUT_TEST_PG_HOST nicht gesetzt).");
    console.log("  >> DIE MUTATIONSPROBE IST DAMIT OFFEN, NICHT ERBRACHT. <<");
    console.log("\n== ERGEBNIS ==\nROT 0  GRUEN 0  (uebersprungen)");
    process.exit(0);
  }
  console.log(`  Wegwerf-Datenbank: ${PG.host}:${PG.port}/${PG.db}`);

  // ── Vorprobe: der UNVERAENDERTE Stand muss sauber sein ─────────────────────
  abschnitt("0 · Vorprobe — der unveraenderte Stand ist gruen");
  spieleEin(null);
  const rein = await doppelvergaben();
  console.log(`  unveraendert: ${rein.gesamt} reserviert, ${rein.eindeutig} eindeutig, ${rein.doppelt} doppelt`);
  if (rein.doppelt !== 0) {
    console.error("  ABBRUCH: schon der unveraenderte Stand vergibt doppelt — die Probe waere aussagelos.");
    process.exit(1);
  }
  console.log("  OK — jede Rotfaerbung unten ist damit der Mutation zuzuschreiben.");

  // ── M1: Sperre entfernen ───────────────────────────────────────────────────
  abschnitt("1 · Der Sperrmechanismus");
  spieleEin(["     for update skip locked\n", "     -- for update skip locked ENTFERNT (Mutation M1)\n"]);
  const m1 = await doppelvergaben();
  mutation("M1 `for update skip locked` entfernt -> Doppelvergaben",
    m1.doppelt > 0, `${m1.doppelt} Doppelvergaben (erwartet > 0)`);
  console.log(`        ${m1.gesamt} reserviert, ${m1.eindeutig} eindeutig`);

  // ── M2: Idempotenzriegel entfernen ─────────────────────────────────────────
  abschnitt("2 · Der Idempotenzriegel");
  spieleEin(["create unique index if not exists helmut_jobs_idem_uidx",
             "create index if not exists helmut_jobs_idem_uidx"]);
  psql("delete from public.helmut_jobs");
  const e1 = psql("select public.helmut_enqueue_job('source_fetch','dup','F','{}'::jsonb)", { stillerFehler: true });
  const e2 = psql("select public.helmut_enqueue_job('source_fetch','dup','F','{}'::jsonb)", { stillerFehler: true });
  const zeilen = Number(psql("select count(*) from public.helmut_jobs where idempotency_key='dup'").out || 0);
  // Zwei moegliche Auswirkungen, beide zeigen dass der Riegel wirkt:
  //   (a) die Planung legt denselben Auftrag doppelt an, oder
  //   (b) `on conflict (idempotency_key)` findet keinen passenden Index und bricht LAUT ab.
  const lautGescheitert = !e1.ok || !e2.ok;
  mutation("M2 UNIQUE auf idempotency_key entfernt -> Doppelplanung oder lauter Bruch",
    zeilen > 1 || lautGescheitert,
    `${zeilen} Zeilen, enqueue-Fehler=${lautGescheitert}`);
  if (lautGescheitert) {
    console.log("        Auswirkung: `on conflict (idempotency_key)` bricht ohne UNIQUE-Index ab (kein stilles Weiterlaufen).");
  }

  // ── M3: Haltergebundenen Abschluss aufweichen ──────────────────────────────
  abschnitt("3 · Der haltergebundene Abschluss");
  spieleEin(["   where j.id = p_id and j.lease_owner = p_owner and j.status = 'laeuft'",
             "   where j.id = p_id and j.status = 'laeuft'"]);
  psql("delete from public.helmut_jobs");
  psql("select public.helmut_enqueue_job('source_fetch','f1','F','{}'::jsonb)");
  const id = psql("select id from public.helmut_claim_jobs('echt', 1, 60000)").out;
  const fremd = psql(`select uebernommen from public.helmut_finish_job('${id}','FREMDER',true)`).out;
  mutation("M3 Halterbindung im Abschluss entfernt -> Fremder kann abschliessen",
    fremd === "t", `uebernommen=${fremd} (erwartet t)`);

  // ── M4: Versuchsobergrenze aushebeln ───────────────────────────────────────
  //
  // BEFUND aus dem ersten Lauf (2026-08-08): das blosse Entfernen der Bedingung
  // `attempts < max_attempts` aus der Reservierung erzeugte KEINEN Fehler — Schritt (b)
  // des Claims setzt erschoepfte Auftraege schon vorher auf `fehlgeschlagen`. Die Grenze
  // ist also doppelt gesichert. Statt die Mutation zu beschoenigen wird sie hier
  // aufgeteilt: jeder Guertel wird EINZELN geprueft, und zusaetzlich beide gemeinsam.
  const ANKER_VERSUCHE = "       and j.attempts < j.max_attempts\n       and (p_types is null";
  const ANKER_ERSCHOEPFT = "   where j.status = 'wartend'\n     and j.attempts >= j.max_attempts;";
  function erschoepftenAuftragAnlegen() {
    psql("delete from public.helmut_jobs");
    psql("select public.helmut_enqueue_job('source_fetch','r1','F','{}'::jsonb,now(),100::smallint,2)");
    psql("update public.helmut_jobs set attempts = 99 where idempotency_key='r1'");
  }

  abschnitt("4 · Die Versuchsobergrenze (zwei Guertel)");

  // M4a — nur der Abschlussschritt faellt weg: der Auftrag darf dann nicht mehr
  //       endgueltig scheitern, sondern haengt fuer immer als `wartend` fest.
  spieleEin([ANKER_ERSCHOEPFT, "   where false;"]);
  erschoepftenAuftragAnlegen();
  psql("select count(*) from public.helmut_claim_jobs('x', 5, 60000)");
  const standA = psql("select status from public.helmut_jobs where idempotency_key='r1'").out;
  mutation("M4a Endabschluss erschoepfter Auftraege entfernt -> kein endgueltiges Scheitern",
    standA !== "fehlgeschlagen", `status=${standA} (erwartet: nicht 'fehlgeschlagen')`);

  // M4b — beide Guertel weg: der erschoepfte Auftrag wird tatsaechlich erneut ausgegeben.
  spieleEinMehrfach([[ANKER_ERSCHOEPFT, "   where false;"], [ANKER_VERSUCHE, "       and (p_types is null"]]);
  erschoepftenAuftragAnlegen();
  const trotzdem = Number(psql("select count(*) from public.helmut_claim_jobs('x', 5, 60000)").out);
  mutation("M4b beide Versuchsguertel entfernt -> erschoepfter Auftrag wird erneut ausgegeben",
    trotzdem > 0, `${trotzdem} ausgegeben (erwartet > 0)`);

  // ── M5: Lease-Ablauf ignorieren ────────────────────────────────────────────
  abschnitt("5 · Die Wiederaufnahme nach Absturz");
  spieleEin(["   where j.status = 'laeuft'\n     and j.lease_expires_at < v_now;",
             "   where j.status = 'laeuft'\n     and false;"]);
  psql("delete from public.helmut_jobs");
  psql("select public.helmut_enqueue_job('source_fetch','l1','F','{}'::jsonb)");
  psql("select id from public.helmut_claim_jobs('abgestuerzt', 1, 60000)");
  psql("update public.helmut_jobs set lease_expires_at = now() - interval '1 hour'");
  const wieder = Number(psql("select count(*) from public.helmut_claim_jobs('danach', 5, 60000)").out);
  mutation("M5 Ruecknahme abgelaufener Leases entfernt -> Auftrag bleibt dauerhaft verloren",
    wieder === 0, `${wieder} wieder vergeben (erwartet 0 = Verlust)`);

  // ── M6: Fehlertext-Kappung entfernen ───────────────────────────────────────
  abschnitt("6 · Die Kappung der Fehlertexte");
  spieleEin(["  if new.last_error is not null and length(new.last_error) > 500 then",
             "  if false then"]);
  psql("delete from public.helmut_jobs");
  psql("select public.helmut_enqueue_job('source_fetch','k1','F','{}'::jsonb)");
  psql("update public.helmut_jobs set last_error = repeat('x', 5000) where idempotency_key='k1'");
  const laenge = Number(psql("select length(last_error) from public.helmut_jobs where idempotency_key='k1'").out);
  mutation("M6 Kappung entfernt -> ungekappter Fremdtext bleibt in der Ablage",
    laenge > 500, `${laenge} Zeichen (erwartet > 500)`);

  // ── M7: Rechteentzug entfernen ─────────────────────────────────────────────
  //
  // BEFUND aus dem ersten Lauf (2026-08-08): in einer nackten lokalen Datenbank bekommen
  // `anon`/`authenticated` ohnehin keine Tabellenrechte — der `revoke` war dort ein
  // Leerlauf, und die Mutation blieb faelschlich gruen. In Supabase ist das anders: dort
  // vergibt eine Standardvergabe (`alter default privileges`) neue Tabellen automatisch an
  // `anon` und `authenticated`. Genau dagegen schuetzt die Zeile. Die Probe stellt diese
  // Standardvergabe deshalb nach — mit KONTROLLLAUF, damit der Nachweis nicht am Aufbau haengt.
  abschnitt("7 · Der Rechteentzug (kein Browserzugriff)");
  const SUPABASE_STANDARD =
    "alter default privileges in schema public grant all on tables to anon, authenticated;";
  const RECHTEZAEHLUNG =
    "select count(*) from information_schema.role_table_grants"
    + " where table_name='helmut_jobs' and grantee in ('anon','authenticated','PUBLIC')";

  // Kontrolle: mit Standardvergabe UND unveraendertem revoke muessen es 0 Rechte sein.
  spieleEin(null, SUPABASE_STANDARD);
  const rechteKontrolle = Number(psql(RECHTEZAEHLUNG).out);
  console.log(`  Kontrolle (Supabase-Standardvergabe nachgestellt, revoke vorhanden): ${rechteKontrolle} Rechte`);
  if (rechteKontrolle !== 0) {
    console.error("  ABBRUCH: schon der unveraenderte Stand laesst Rechte stehen — Probe waere aussagelos.");
    process.exit(1);
  }

  spieleEin(["revoke all on table public.helmut_jobs from public, anon, authenticated;",
             "-- revoke ENTFERNT (Mutation M7)"], SUPABASE_STANDARD);
  const rechte = Number(psql(RECHTEZAEHLUNG).out);
  mutation("M7 Rechteentzug entfernt -> anon/authenticated haben wieder Rechte",
    rechte > 0, `${rechte} Rechte (erwartet > 0)`);

  // ── M8: RLS abschalten ─────────────────────────────────────────────────────
  abschnitt("8 · Row Level Security");
  spieleEin(["alter table public.helmut_jobs enable row level security;",
             "-- RLS ENTFERNT (Mutation M8)"]);
  const rls = psql("select relrowsecurity from pg_class where oid='public.helmut_jobs'::regclass").out;
  mutation("M8 RLS-Aktivierung entfernt -> RLS ist aus", rls === "f", `relrowsecurity=${rls} (erwartet f)`);

  // ── M9: Faelligkeit ignorieren ─────────────────────────────────────────────
  abschnitt("9 · Die geplante Faelligkeit");
  spieleEin(["       and j.due_at <= v_now\n", "       and true\n"]);
  psql("delete from public.helmut_jobs");
  psql("select public.helmut_enqueue_job('source_fetch','z1','F','{}'::jsonb, now() + interval '10 hours')");
  const zufrueh = Number(psql("select count(*) from public.helmut_claim_jobs('x', 5, 60000)").out);
  mutation("M9 Faelligkeitspruefung entfernt -> nicht faelliger Auftrag wird ausgegeben",
    zufrueh > 0, `${zufrueh} ausgegeben (erwartet > 0)`);

  // ── Aufraeumen: Wegwerf-Datenbank entfernen ────────────────────────────────
  psql(`drop database if exists ${PG.db}`, { db: "postgres" });

  console.log(`\n== ERGEBNIS ==`);
  console.log(`ROT ${rot}  GRUEN ${gruen}  (gesamt ${rot + gruen})`);
  if (gruen === 0) {
    console.log("Alle Mutationen wurden erkannt — die Nachweise sind nicht trivial gruen.");
  } else {
    console.log(`${gruen} Mutation(en) blieben unentdeckt: dort fehlt ein Nachweis.`);
  }
  // Eine unentdeckte Mutation ist ein Fehlschlag der SUITE, nicht des Codes.
  process.exit(gruen === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("TESTLAUF-FEHLER:", error && error.message);
  try { psql(`drop database if exists ${PG.db}`, { db: "postgres" }); } catch (_) { /* egal */ }
  process.exit(1);
});
