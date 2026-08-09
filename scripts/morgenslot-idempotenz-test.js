"use strict";

// Helmut — KEINE DOPPELTE MORGENLAGE (Kapazitaetssprint 2026-08-09).
// =============================================================================================
// DIE FRAGE: drei morgendliche Slots und bis zu acht Worker greifen auf DIESELBE Warteschlange
// zu. Kann daraus zweimal dieselbe Morgenlage werden — zwei Modellaufrufe, zwei
// Veroeffentlichungen, doppelte Kosten?
//
// Geprueft werden die zwoelf Punkte des Sprintauftrags §7, und zwar dort, wo die Zusage
// wirklich faellt:
//   * an ECHTER PostgreSQL, wo die Reservierung atomar ist (`for update skip locked`),
//   * am ECHTEN Handler `HANDLER.tenant_narrative`,
//   * an der ECHTEN HTTP-Route `/api/cron/lage-briefing-nachlauf`.
// Isolierte Hilfsfunktionen genuegen hier ausdruecklich nicht (Auftrag §7, letzter Satz).
//
// Ohne lokalen PostgreSQL laufen die Abschnitte A und C nicht — sie werden dann als OFFEN
// gemeldet, nicht als bestanden. Abschnitt B (echte Route) laeuft immer.
//
// Offline: `psql` verbindet nur lokal, der Server laeuft in-process. Kein Netz, keine KI.

const { execFileSync, spawn } = require("child_process");
const http = require("http");
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
process.env.HELMUT_SOURCE_MODE = "off";
process.env.HELMUT_STORAGE_BACKEND = "local";
process.env.HELMUT_STORE_CACHE_MS = "0";
process.env.CRON_SECRET = "morgenslot-idempotenz-secret";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
for (const f of ["HELMUT_SCALABLE_PIPELINE", "HELMUT_NARRATIV_QUEUE", "HELMUT_LLM_FAIRNESS"]) delete process.env[f];

const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "",
  port: process.env.HELMUT_TEST_PG_PORT || "5433",
  user: process.env.HELMUT_TEST_PG_USER || "helmut",
  db: process.env.HELMUT_TEST_PG_DB_IDEMPOTENZ || "helmut_test_morgenslot"
};

let pass = 0;
let fail = 0;
let offen = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function nichtBewiesen(name, grund) { offen += 1; console.log(`  OFFEN ${name} — NICHT BEWIESEN: ${grund}`); }
function abschnitt(t) { console.log(`\n${"═".repeat(88)}\n  ${t}\n${"═".repeat(88)}`); }

function psql(sql, { datei = null, db = PG.db, erwarteFehler = false } = {}) {
  const args = ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", db, "-tA", "-v", "ON_ERROR_STOP=1"];
  if (datei) args.push("-f", datei); else args.push("-c", sql);
  try {
    return { ok: true, out: execFileSync("psql", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() };
  } catch (e) {
    if (!erwarteFehler) throw e;
    return { ok: false, out: String((e.stderr || e.stdout || e.message) || "").trim() };
  }
}
function psqlAsync(sql, db = PG.db) {
  return new Promise((resolve) => {
    const k = spawn("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", db, "-tA", "-c", sql],
      { stdio: ["ignore", "pipe", "pipe"] });
    let out = ""; let err = "";
    k.stdout.on("data", (d) => { out += d; });
    k.stderr.on("data", (d) => { err += d; });
    k.on("close", (code) => resolve({ code, out: out.trim(), err: err.trim() }));
  });
}
const M = (n) => path.join(ROOT, "supabase", "migrations", n);

// ── Attrappe des Modellaufrufs VOR dem Laden von server.js ──────────────────────────────────
const lage = require(path.join(ROOT, "lib/helmut/lage.js"));
const pipeline = require(path.join(ROOT, "lib/helmut/scalable-pipeline.js"));
const { erzeugeSpeicherWarteschlange } = require(path.join(ROOT, "scripts/fixtures/jobqueue-speicher-treiber.js"));

let modellaufrufe = [];
let veroeffentlichungen = [];
const tagescache = new Map();
lage.buildLageBriefing = async (profil, opts = {}) => {
  const mandat = String((opts && opts.politicianId) || (profil && profil.id) || "");
  const schluessel = `bf-${mandat}-lage-2026-08-10`;
  if (tagescache.has(schluessel)) return { ...tagescache.get(schluessel), fromCache: true };
  modellaufrufe.push(mandat);
  await new Promise((r) => setTimeout(r, 20));
  const e = { available: true, fromCache: false, paragraphs: [{ text: "x" }], vorgaenge: [], model: "attrappe" };
  tagescache.set(schluessel, e);
  veroeffentlichungen.push(mandat);
  return e;
};

const dataDir = path.join(ROOT, ".helmut-data");
const GESICHERT = ["store.json", "auth.json"];
const schnappschuss = new Map(GESICHERT.map((n) => [n,
  fs.existsSync(path.join(dataDir, n)) ? fs.readFileSync(path.join(dataDir, n)) : null]));
process.on("exit", () => {
  for (const [n, inhalt] of schnappschuss) {
    const f = path.join(dataDir, n);
    try { if (inhalt === null) { if (fs.existsSync(f)) fs.rmSync(f); } else fs.writeFileSync(f, inhalt); } catch (_) { /* ignore */ }
  }
  try { if (PG.host) psql(`drop database if exists ${PG.db}`, { db: "postgres" }); } catch (_) { /* ignore */ }
});

const handler = require(path.join(ROOT, "server.js"));

function anfrage(server, pfad) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port, method: "GET", path: pfad,
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, timeout: 30000 },
    (res) => { let b = ""; res.on("data", (c) => { b += c; }); res.on("end", () => resolve({ status: res.statusCode, body: b })); });
    r.on("timeout", () => r.destroy(new Error("timeout")));
    r.on("error", reject);
    r.end();
  });
}
const alsJson = (r) => { try { return JSON.parse(r.body); } catch { return {}; } };

const FENSTER = "2026-08-10T00Z";
const idKey = (mandat, fenster = FENSTER) => `tenant_narrative|${mandat}|${fenster}`;

async function main() {
  console.log("Helmut — Keine doppelte Morgenlage: Konkurrenz und Idempotenz (OP-30)");

  // ══════════════════════════════════════════════════════════════════════════════════════════
  abschnitt("A · An ECHTER PostgreSQL: die Reservierung ist atomar");
  if (!PG.host) {
    nichtBewiesen("A Atomare Reservierung, Wiederaufnahme, Teilmigration",
      "HELMUT_TEST_PG_HOST ist nicht gesetzt — ohne echten Server ist Atomaritaet nicht beweisbar. "
      + "Eine Attrappe zeigt hier nur ihre eigene Bauform.");
  } else {
    psql(`drop database if exists ${PG.db}`, { db: "postgres" });
    psql(`create database ${PG.db}`, { db: "postgres" });
    psql(null, { datei: M("20260808_scalable_job_queue.sql") });
    psql(null, { datei: M("20260808_jobqueue_abhaengigkeiten.sql") });

    // ── 11 · TEILWEISE ANGEWENDETE MIGRATION ────────────────────────────────────────────────
    // Basis da, Narrativerweiterung NICHT. Der Typ MUSS sichtbar abgelehnt werden — nicht
    // stillschweigend eingereiht und nicht als Erfolg gemeldet.
    const ohneNarrativ = psql(`select public.helmut_enqueue_job('tenant_narrative', ${sqlT(idKey("m1"))}, `
      + `${sqlT(FENSTER)}, '{"mandatsId":"m1"}'::jsonb, now(), 240::smallint, 5, 'm1')`, { erwarteFehler: true });
    check("A11 Teilweise angewendete Migration: der Narrativtyp wird SICHTBAR abgelehnt",
      ohneNarrativ.ok === false && /helmut_jobs_type_chk|check constraint|violates/i.test(ohneNarrativ.out),
      ohneNarrativ.out.split("\n")[0].slice(0, 120));

    psql(null, { datei: M("20260809_jobqueue_narrativ.sql") });
    const nachMigration = psql(`select (public.helmut_enqueue_job('tenant_narrative', ${sqlT(idKey("m1"))}, `
      + `${sqlT(FENSTER)}, '{"mandatsId":"m1"}'::jsonb, now(), 240::smallint, 5, 'm1')).*`);
    check("A11b Nach der Erweiterung wird derselbe Auftrag angenommen", nachMigration.ok && /t\|/.test(nachMigration.out + "|"));

    // ── 2/3 · FACHLICHE JOB-IDENTITAET UND IDEMPOTENZ ───────────────────────────────────────
    for (let i = 0; i < 4; i += 1) {
      psql(`select public.helmut_enqueue_job('tenant_narrative', ${sqlT(idKey("m1"))}, ${sqlT(FENSTER)}, `
        + `'{"mandatsId":"m1"}'::jsonb, now(), 240::smallint, 5, 'm1')`);
    }
    check("A2 Vier Einreihungen desselben Mandats/Fensters ergeben GENAU EINE Zeile",
      psql(`select count(*) from public.helmut_jobs where idempotency_key = ${sqlT(idKey("m1"))}`).out === "1");
    psql(`select public.helmut_enqueue_job('tenant_narrative', ${sqlT(idKey("m1", "2026-08-11T00Z"))}, `
      + `'2026-08-11T00Z', '{"mandatsId":"m1"}'::jsonb, now(), 240::smallint, 5, 'm1')`);
    check("A3 Ein ANDERES Fenster ist eine andere Absicht und wird angenommen",
      psql("select count(*) from public.helmut_jobs where job_type='tenant_narrative'").out === "2");

    // ── 1/5/6 · KONKURRENZ: VIELE WORKER, ZWEI SLOTS ────────────────────────────────────────
    psql("delete from public.helmut_jobs");
    for (let i = 0; i < 60; i += 1) {
      psql(`select public.helmut_enqueue_job('tenant_narrative', ${sqlT(idKey(`k${i}`))}, ${sqlT(FENSTER)}, `
        + `'{"mandatsId":"k${i}"}'::jsonb, now() - interval '1 minute', 240::smallint, 5, 'k${i}')`);
    }
    // 16 gleichzeitige Reservierer = zwei Slots mit je acht Workern, exakt gleichzeitig.
    const claims = await Promise.all(Array.from({ length: 16 }, (_, i) =>
      psqlAsync(`select id from public.helmut_claim_jobs('slot${i % 2}-w${i}', 10, 300000, `
        + `array['tenant_narrative']::text[])`)));
    const alleIds = claims.flatMap((c) => c.out.split("\n").filter(Boolean));
    const eindeutige = new Set(alleIds);
    check("A1 16 gleichzeitige Reservierer bekamen KEINEN Auftrag doppelt",
      alleIds.length === eindeutige.size, `${alleIds.length} reserviert, ${eindeutige.size} verschieden`);
    check("A5 Alle Reservierer liefen fehlerfrei", claims.every((c) => c.code === 0));
    check("A6 Beide Slots zusammen haben hoechstens die vorhandenen Auftraege reserviert",
      alleIds.length <= 60, `${alleIds.length} von 60`);
    check("A6b Kein Auftrag blieb gleichzeitig bei zwei Haltern",
      psql("select count(*) from (select id, count(distinct lease_owner) n from public.helmut_jobs "
        + "where status='laeuft' group by id) t where n > 1").out === "0");

    // ── 7/8 · ABGELAUFENE RESERVIERUNG UND WIEDERANLAUF ─────────────────────────────────────
    psql("delete from public.helmut_jobs");
    psql(`select public.helmut_enqueue_job('tenant_narrative', ${sqlT(idKey("crash"))}, ${sqlT(FENSTER)}, `
      + `'{"mandatsId":"crash"}'::jsonb, now() - interval '1 minute', 240::smallint, 5, 'crash')`);
    psql("select id from public.helmut_claim_jobs('slot0-w0', 5, 300000, array['tenant_narrative']::text[])");
    check("A7 Nach der Reservierung ist der Auftrag NICHT mehr faellig (kein zweiter Zugriff)",
      psql("select count(*) from public.helmut_claim_jobs('slot1-w0', 5, 300000, array['tenant_narrative']::text[])").out === "0");
    // Der Slot stirbt (Vercel-Ausfuehrung endet), die Lease laeuft aus.
    psql("update public.helmut_jobs set lease_expires_at = now() - interval '1 second' where status='laeuft'");
    const wieder = psql("select id, attempts from public.helmut_claim_jobs('slot1-w0', 5, 300000, array['tenant_narrative']::text[])");
    check("A8 Nach Ablauf der Reservierung nimmt der NAECHSTE Slot den Auftrag wieder auf",
      wieder.out.split("|").length === 2 && Number(wieder.out.split("|")[1]) === 2,
      `attempts=${wieder.out.split("|")[1]}`);
    check("A8b Er zaehlt dabei als zweiter Versuch — der Abbruch bleibt sichtbar",
      psql("select attempts from public.helmut_jobs").out === "2");

    // ── 9 · VERSPAETETER ERSTER SLOT ────────────────────────────────────────────────────────
    psql("delete from public.helmut_jobs");
    psql(`select public.helmut_enqueue_job('tenant_narrative', ${sqlT(idKey("spaet"))}, ${sqlT(FENSTER)}, `
      + `'{"mandatsId":"spaet"}'::jsonb, now() + interval '30 minutes', 240::smallint, 5, 'spaet')`);
    check("A9 Ein noch nicht faelliger Auftrag wird von KEINEM Slot vorgezogen",
      psql("select count(*) from public.helmut_claim_jobs('slot0-w0', 5, 300000, array['tenant_narrative']::text[])").out === "0");
    psql("update public.helmut_jobs set due_at = now() - interval '1 minute'");
    check("A9b Sobald er faellig ist, nimmt ihn der naechste Slot — nichts geht verloren",
      psql("select count(*) from public.helmut_claim_jobs('slot1-w0', 5, 300000, array['tenant_narrative']::text[])").out === "1");
    check("A9c Die URSPRUENGLICHE Faelligkeit bleibt erhalten (Rueckstand ist nicht loeschbar)",
      psql("select first_due_at = due_at from public.helmut_jobs").out === "f");
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════
  abschnitt("B · An der ECHTEN Route: die drei Morgenslots");
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    // ── 12 · TRENNUNG ALTPFAD / OP-30-PFAD ──────────────────────────────────────────────────
    for (const f of ["HELMUT_SCALABLE_PIPELINE", "HELMUT_NARRATIV_QUEUE"]) delete process.env[f];
    modellaufrufe = [];
    const aus = alsJson(await anfrage(server, "/api/cron/lage-briefing-nachlauf"));
    check("B12 Bei ausgeschalteten Flags startet der Nachlaufslot KEINE Verarbeitung",
      aus.uebersprungen === true && aus.pfad === "aus" && /flags-aus/.test(String(aus.grund)),
      JSON.stringify(aus).slice(0, 140));
    check("B12b Er ruft dabei KEIN Modell auf", modellaufrufe.length === 0);
    check("B12c Er schreibt KEINE Lauftelemetrie (kein Datenbankzugriff vor dem Riegel)",
      aus.lauftelemetrie === undefined, JSON.stringify(aus.lauftelemetrie));

    // Nur EIN Flag reicht nicht — fail closed in beide Richtungen.
    for (const kombination of [{ HELMUT_SCALABLE_PIPELINE: "on" }, { HELMUT_NARRATIV_QUEUE: "on" },
      { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_NARRATIV_QUEUE: "off" }]) {
      for (const f of ["HELMUT_SCALABLE_PIPELINE", "HELMUT_NARRATIV_QUEUE"]) delete process.env[f];
      Object.assign(process.env, kombination);
      const r = alsJson(await anfrage(server, "/api/cron/lage-briefing-nachlauf"));
      check(`B12d Teilkombination ${JSON.stringify(kombination)} startet nichts`,
        r.uebersprungen === true && r.pfad === "aus");
    }

    // ── 4/10 · GLEICHZEITIGER START BEIDER SLOTS, VERSCHIEDENE JOB-KENNUNGEN ────────────────
    // Der Altpfad bleibt aus; beide Slots laufen ueber die Warteschlange. Die Warteschlange
    // ist hier die In-Speicher-Fassung (der Server hat ohne Supabase keine echte) — die
    // ATOMARITAET ist in Abschnitt A an echter PostgreSQL bewiesen, hier geht es um die
    // fachliche Idempotenz des Handlers.
    process.env.HELMUT_SCALABLE_PIPELINE = "on";
    process.env.HELMUT_NARRATIV_QUEUE = "on";
    modellaufrufe = [];
    veroeffentlichungen = [];
    tagescache.clear();

    const uhr = () => Date.parse("2026-08-10T05:45:00.000Z");
    const q = erzeugeSpeicherWarteschlange({ now: uhr });
    // ZWEI VERSCHIEDENE technische Auftraege fuer DASSELBE Mandat und Fenster gibt es nicht —
    // das verhindert der Idempotenzschluessel. Deshalb wird hier der haertere Fall geprueft:
    // zwei Auftraege mit VERSCHIEDENEN Kennungen (anderes Fenster im Schluessel), die beide
    // dieselbe fachliche Morgenlage erzeugen wuerden.
    await q.enqueue({ jobType: "tenant_narrative", idempotencyKey: idKey("dop"), freshnessWindow: FENSTER,
      payload: { mandatsId: "dop" }, dueAt: new Date(uhr() - 1000).toISOString(), priority: 240, tenantId: "dop" });
    await q.enqueue({ jobType: "tenant_narrative", idempotencyKey: `technisch-anders|dop|${FENSTER}`, freshnessWindow: FENSTER,
      payload: { mandatsId: "dop" }, dueAt: new Date(uhr() - 1000).toISOString(), priority: 240, tenantId: "dop" });

    const deps = {
      now: uhr, env: { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_NARRATIV_QUEUE: "on", HELMUT_SOURCE_MODE: "off" },
      claim: q.claim, finish: q.finish, extendLease: q.extendLease, enqueue: q.enqueue,
      zurueckstellen: q.zurueckstellen,
      offeneVorbedingungen: async () => ({ verfuegbar: true, offen: 0, wartend: 0, laufend: 0 }),
      getActiveProfile: async (id) => ({ id, profileActive: true }),
      istDeaktiviert: () => false,
      lageNarrativ: lage.buildLageBriefing,
      budget: null
    };
    // BEIDE Slots exakt gleichzeitig, je acht Worker.
    const workerBetrieb = require(path.join(ROOT, "lib/helmut/worker-betrieb.js"));
    await Promise.all([0, 1].map((s) => workerBetrieb.durchlauf({
      env: deps.env, deps, kennung: `slot${s}`,
      grenzen: { budgetMs: 20000, leaseMs: 300000, stapel: 10, parallel: 8 },
      typen: ["tenant_narrative"]
    })));
    check("B4 Zwei technisch verschiedene Auftraege fuer dieselbe Morgenlage ergeben GENAU EINEN Modellaufruf",
      modellaufrufe.length === 1, `${modellaufrufe.length} Aufrufe`);
    check("B4b Und GENAU EINE Veroeffentlichung", veroeffentlichungen.length === 1, `${veroeffentlichungen.length}`);
    check("B10 Beide gleichzeitig gestarteten Slots schliessen beide Auftraege sauber ab",
      q.alle().filter((z) => z.status === "erledigt").length === 2,
      q.alle().map((z) => z.status).join(","));

    // ── 7 · WIEDERANLAUF NACH ABBRUCH ───────────────────────────────────────────────────────
    // Der erste Slot hat den Modellaufruf gemacht, ist aber vor dem Abschluss gestorben.
    // Der Wiederanlauf darf NICHT ein zweites Mal bezahlen.
    const vorher = modellaufrufe.length;
    const q2 = erzeugeSpeicherWarteschlange({ now: uhr });
    await q2.enqueue({ jobType: "tenant_narrative", idempotencyKey: idKey("dop"), freshnessWindow: FENSTER,
      payload: { mandatsId: "dop" }, dueAt: new Date(uhr() - 1000).toISOString(), priority: 240, tenantId: "dop" });
    await workerBetrieb.durchlauf({
      env: deps.env, deps: { ...deps, claim: q2.claim, finish: q2.finish, extendLease: q2.extendLease, zurueckstellen: q2.zurueckstellen },
      kennung: "wiederanlauf", grenzen: { budgetMs: 20000, leaseMs: 300000, stapel: 10, parallel: 2 },
      typen: ["tenant_narrative"]
    });
    check("B7 Der Wiederanlauf nach einem Abbruch loest KEINEN zweiten Modellaufruf aus",
      modellaufrufe.length === vorher, `vorher ${vorher}, nachher ${modellaufrufe.length}`);
    check("B7b Er meldet den Auftrag trotzdem als erledigt (kein Dauerläufer)",
      q2.alle().every((z) => z.status === "erledigt"), q2.alle().map((z) => z.status).join(","));

    // ── 12b · DER ALTPFAD BLEIBT DER ALTPFAD ────────────────────────────────────────────────
    for (const f of ["HELMUT_SCALABLE_PIPELINE", "HELMUT_NARRATIV_QUEUE"]) delete process.env[f];
    const altpfad = alsJson(await anfrage(server, "/api/cron/lage-briefing"));
    check("B12e Bei ausgeschalteten Flags laeuft `lage-briefing` unveraendert den Direktpfad",
      altpfad.pfad === undefined && Object.prototype.hasOwnProperty.call(altpfad, "prewarmed"),
      JSON.stringify(altpfad).slice(0, 120));
  } finally {
    await new Promise((r) => server.close(r));
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════
  abschnitt("C · Der Vertrag, den KEINE dieser Pruefungen ersetzt");
  nichtBewiesen("Doppelverarbeitung in Production",
    "beide Zusagen (atomare Reservierung, fachliche Idempotenz) sind hier lokal bewiesen. "
    + "Ob Production sich so verhaelt, zeigt erst der stufenweise Nachweis nach der Aktivierung.");

  console.log(`\n${"═".repeat(88)}`);
  console.log(`PASS ${pass}  FAIL ${fail}  OFFEN ${offen}  (gesamt ${pass + fail + offen})`);
  process.exit(fail === 0 ? 0 : 1);
}

function sqlT(v) { return `'${String(v).replace(/'/g, "''")}'`; }

main().catch((e) => { console.error("TESTLAUF-FEHLER:", e && e.stack ? e.stack : e); process.exit(1); });
