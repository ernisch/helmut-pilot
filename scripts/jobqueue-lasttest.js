"use strict";

// Helmut — WIEDERHOLBARER BELASTUNGSTEST UND KAPAZITAETSMESSUNG (OP-30, Sprintauftrag §4 + §10).
// =============================================================================================
// Was hier passiert:
//   1. Aus 1 000 synthetischen Mandatsprofilen wird mit dem PRODUKTIONSCODE ein echter
//      Arbeitsplan erzeugt (`planeArbeit` -> `kompiliereQuellenbedarf` + `planeMandatsarbeit`).
//   2. Dieser Plan wird in eine FRISCHE lokale PostgreSQL-Datenbank eingereiht.
//   3. Mehrere ECHTE Workerprozesse (eigener Node-Prozess, eigene Verbindung, eigener
//      Lease-Besitzer) arbeiten die Warteschlange ab — mit `arbeite()` aus dem Produktionscode.
//   4. Ein Worker wird MITTEN IM LAUF hart getoetet (SIGKILL). Danach wird geprueft, dass kein
//      Auftrag verloren geht und keiner doppelt erledigt wird.
//   5. Der Volllauf wird ein zweites Mal wiederholt — der Test ist wiederholbar, nicht einmalig.
//   6. Am Ende stehen die Kapazitaetskennzahlen a-i des Sprintauftrags.
//
// >>> WAS DIESER TEST NICHT BEWEIST <<<
//   Die Aufgabenhandler sind ATTRAPPEN. Es gibt keinen Netzverkehr, keinen Google-Abruf und
//   keinen KI-Aufruf. Gemessen wird die KAPAZITAET DER WARTESCHLANGE (Reservieren, Lease,
//   Abschluss, Nebenlaeufigkeit) — NICHT die Laufzeit echter externer Abrufe. Jede daraus
//   abgeleitete Workerzahl ist eine UNTERGRENZE fuer die Warteschlange und KEINE Aussage
//   ueber die Gesamtlaufzeit in Production.
//
// Voraussetzung: ein lokaler PostgreSQL-Server. Ohne Server bricht der Test NICHT gruen ab,
// sondern meldet ausdruecklich, dass der Nachweis OFFEN ist.

const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync, spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const MIGRATION = path.join(ROOT, "supabase", "migrations", "20260808_scalable_job_queue.sql");

process.env.HELMUT_SOURCE_MODE = "off";

const { erzeugeMandate } = require(path.join(ROOT, "scripts/fixtures/synthetische-mandate-1000.js"));
const SP = require(path.join(ROOT, "lib/helmut/scalable-pipeline.js"));
const sched = require(path.join(ROOT, "lib/helmut/scheduler.js"));

const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "",
  port: process.env.HELMUT_TEST_PG_PORT || "5432",
  user: process.env.HELMUT_TEST_PG_USER || "",
  db: "helmut_last"
};

const ANZAHL_MANDATE = Number(process.env.HELMUT_LASTTEST_MANDATE || 1000);
const WORKER = Number(process.env.HELMUT_LASTTEST_WORKER || 8);

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }
function zahl(n) { return Number(n).toLocaleString("de-DE"); }

function psql(sql, { db = PG.db, datei = null } = {}) {
  const args = ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", db, "-tA", "-v", "ON_ERROR_STOP=1"];
  if (datei) args.push("-f", datei); else args.push("-c", sql);
  return execFileSync("psql", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}

function servererreichbar() {
  if (!PG.host || !PG.user) return false;
  try {
    execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", "postgres", "-tAc", "select 1"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch (_) { return false; }
}

// Alles zurueck auf Anfang — ohne die Auftraege neu zu planen. So misst jede Phase
// denselben Bestand, und die Zahlen sind untereinander vergleichbar.
function setzeBestandZurueck() {
  psql("update public.helmut_jobs set status='wartend', attempts=0, lease_owner=null,"
    + " lease_expires_at=null, finished_at=null, first_claimed_at=null, last_error=null,"
    + " due_at=now(), updated_at=now()");
}

function starteWorker(nr, { budgetMs, stapel = 20, leaseMs = 30000, arbeitMs = 0 }) {
  const owner = `last-w${String(nr).padStart(2, "0")}`;
  const kind = spawn(process.execPath, [
    path.join(ROOT, "scripts/fixtures/lasttest-worker.js"),
    `--host=${PG.host}`, `--port=${PG.port}`, `--user=${PG.user}`, `--db=${PG.db}`,
    `--owner=${owner}`, `--arbeitMs=${arbeitMs}`, `--stapel=${stapel}`,
    `--budgetMs=${budgetMs}`, `--leaseMs=${leaseMs}`
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  kind.stdout.on("data", (d) => { out += d; });
  kind.stderr.on("data", () => {});
  const fertig = new Promise((resolve) => {
    kind.on("close", (code) => {
      let bilanz = null;
      try { bilanz = JSON.parse(String(out).trim().split("\n").pop() || "null"); } catch (_) { bilanz = null; }
      resolve({ owner, code, bilanz });
    });
  });
  return { owner, kind, fertig };
}

// Ein vollstaendiger Durchlauf mit n Workern: Bestand zuruecksetzen, alle Worker starten,
// warten, messen. Rueckgabe: Wanduhrzeit, Erledigungen je Worker, Summe.
async function volllauf(anzahl, { budgetMs = 90000, arbeitMs = 0, nummerAb = 1 } = {}) {
  setzeBestandZurueck();
  const t0 = Date.now();
  const laeufer = [];
  for (let i = 0; i < anzahl; i += 1) laeufer.push(starteWorker(nummerAb + i, { budgetMs, arbeitMs }));
  const bilanzen = await Promise.all(laeufer.map((l) => l.fertig));
  const dauerMs = Date.now() - t0;
  const erledigt = bilanzen.reduce((s, b) => s + ((b.bilanz && b.bilanz.erledigt) || 0), 0);
  return { dauerMs, erledigt, bilanzen, durchsatz: erledigt / (dauerMs / 1000) };
}

async function main() {
  console.log("Helmut — Belastungstest und Kapazitaetsmessung der Arbeitswarteschlange (OP-30)");
  console.log(`  ${ANZAHL_MANDATE} synthetische Mandate · bis zu ${WORKER} Workerprozesse\n`);

  if (!servererreichbar()) {
    console.log("== UEBERSPRUNGEN ==");
    console.log("  Kein lokaler PostgreSQL-Server erreichbar (HELMUT_TEST_PG_HOST/USER nicht gesetzt).");
    console.log("  >> DER BELASTUNGSNACHWEIS IST DAMIT OFFEN, NICHT ERBRACHT. <<");
    process.exit(0);
  }

  // ── 1 · Frische Datenbank, echter Plan ─────────────────────────────────────
  abschnitt("1 · Frische Datenbank und echter Arbeitsplan");
  psql(`drop database if exists ${PG.db}`, { db: "postgres" });
  psql(`create database ${PG.db}`, { db: "postgres" });
  psql(null, { datei: MIGRATION });
  check("1.1 Migration in frische Datenbank eingespielt",
    psql("select count(*) from public.helmut_jobs") === "0");

  const profile = erzeugeMandate(ANZAHL_MANDATE);
  const gesammelt = [];
  const plan = await SP.planeArbeit({
    env: { HELMUT_SCALABLE_PIPELINE: "on" },
    jetztMs: Date.parse("2026-08-08T00:00:00Z"),
    deps: {
      listFullProfiles: async () => profile,
      quellenFuerProfil: async (p) => [sched.personNewsSource(p), ...sched.mandateNewsSources(p)],
      enqueue: async (a) => { gesammelt.push(a); return { verfuegbar: true, neu: true }; }
    }
  });
  check("1.2 Der Plan stammt aus dem Produktionscode und enthaelt alle Profile",
    plan.profile === ANZAHL_MANDATE, `${plan.profile} Profile, ${zahl(plan.geplant)} Auftraege`);

  const jsonDatei = path.join(os.tmpdir(), `helmut-last-${process.pid}.json`);
  fs.writeFileSync(jsonDatei, JSON.stringify(gesammelt.map((a) => ({
    job_type: a.jobType, idempotency_key: a.idempotencyKey, freshness_window: a.freshnessWindow,
    payload: a.payload || {}, due_at: a.dueAt || null, priority: a.priority == null ? 100 : a.priority,
    max_attempts: a.maxAttempts == null ? 5 : a.maxAttempts, tenant_id: a.tenantId || null
  }))), "utf8");
  const ladeDatei = path.join(os.tmpdir(), `helmut-last-${process.pid}.sql`);
  fs.writeFileSync(ladeDatei,
    "create temporary table lade_json (d jsonb);\n"
    + `\\set inhalt \`cat ${jsonDatei}\`\n`
    + "insert into lade_json values (:'inhalt'::jsonb);\n"
    + "select count(*) from (\n"
    + "  select public.helmut_enqueue_job(x.job_type, x.idempotency_key, x.freshness_window, x.payload,\n"
    + "         coalesce(x.due_at, now()), x.priority::smallint, x.max_attempts, x.tenant_id)\n"
    + "    from lade_json l, jsonb_to_recordset(l.d) as x(job_type text, idempotency_key text,\n"
    + "         freshness_window text, payload jsonb, due_at timestamptz, priority int,\n"
    + "         max_attempts int, tenant_id text)\n"
    + ") t;\n", "utf8");
  const t0Laden = Date.now();
  psql(null, { datei: ladeDatei });
  const ladeDauer = Date.now() - t0Laden;
  fs.unlinkSync(jsonDatei); fs.unlinkSync(ladeDatei);

  const gesamtJobs = Number(psql("select count(*) from public.helmut_jobs"));
  check("1.3 Alle geplanten Auftraege stehen in der Datenbank",
    gesamtJobs === gesammelt.length, `${zahl(gesamtJobs)} von ${zahl(gesammelt.length)} · Einreihen ${ladeDauer} ms`);

  const jeTyp = psql("select job_type||' '||count(*) from public.helmut_jobs group by job_type order by 1")
    .split("\n").filter(Boolean).map((z) => { const [t, n] = z.split(" "); return { typ: t, n: Number(n) }; });
  console.log("\n  Auftraege je Typ:");
  for (const r of jeTyp) console.log(`    ${r.typ.padEnd(26)} ${String(zahl(r.n)).padStart(7)}`);

  // ── 2 · Ein Worker ─────────────────────────────────────────────────────────
  abschnitt("2 · Volllauf mit EINEM Worker (Referenzwert)");
  const einzel = await volllauf(1, { budgetMs: 120000, nummerAb: 0 });
  const restEinzel = Number(psql("select count(*) from public.helmut_jobs where status<>'erledigt'"));
  check("2.1 Ein einzelner Worker arbeitet den GESAMTEN Bestand ab",
    einzel.erledigt === gesamtJobs && restEinzel === 0,
    `${zahl(einzel.erledigt)} von ${zahl(gesamtJobs)} in ${einzel.dauerMs} ms`);
  console.log(`  Durchsatz 1 Worker: ${einzel.durchsatz.toFixed(1)} Auftraege/s`);

  // ── 3 · Mehrere Worker ─────────────────────────────────────────────────────
  abschnitt(`3 · Volllauf mit ${WORKER} gleichzeitigen Workern`);
  const mehr = await volllauf(WORKER, { budgetMs: 120000, nummerAb: 1 });
  const restMehr = Number(psql("select count(*) from public.helmut_jobs where status<>'erledigt'"));
  const beteiligt = mehr.bilanzen.filter((b) => b.bilanz && b.bilanz.erledigt > 0).length;
  check("3.1 Der gesamte Bestand wurde abgearbeitet",
    mehr.erledigt === gesamtJobs && restMehr === 0,
    `${zahl(mehr.erledigt)} von ${zahl(gesamtJobs)} in ${mehr.dauerMs} ms`);
  check("3.2 Mehrere Worker haben tatsaechlich mitgearbeitet", beteiligt >= Math.min(4, WORKER),
    mehr.bilanzen.map((b) => `${b.owner}:${(b.bilanz && b.bilanz.erledigt) || 0}`).join(" "));
  check("3.3 KEIN Auftrag wurde doppelt erledigt (Summe der Worker = Zeilen in der Ablage)",
    mehr.erledigt === Number(psql("select count(*) from public.helmut_jobs where status='erledigt'")),
    `${zahl(mehr.erledigt)}`);
  console.log(`  Durchsatz ${WORKER} Worker: ${mehr.durchsatz.toFixed(1)} Auftraege/s`);
  check("3.4 Mehrere Worker sind schneller als einer",
    mehr.durchsatz > einzel.durchsatz,
    `${mehr.durchsatz.toFixed(1)} vs ${einzel.durchsatz.toFixed(1)} Auftraege/s`);

  // ── 4 · Absturz mitten im Lauf ─────────────────────────────────────────────
  // Damit der Absturz ein echtes Zeitfenster hat, bekommt jeder Auftrag hier eine
  // simulierte Arbeitszeit. Ohne sie waere der Bestand schneller leer als der Absturz.
  abschnitt("4 · Absturz mitten im Lauf: kein Verlust, kein Doppelabschluss");
  setzeBestandZurueck();
  const ARBEIT_MS = 20;
  const LEASE_MS = 5000;
  const t0Absturz = Date.now();
  const crashLaeufer = [];
  for (let i = 0; i < WORKER; i += 1) {
    crashLaeufer.push(starteWorker(20 + i, { budgetMs: 120000, arbeitMs: ARBEIT_MS, leaseMs: LEASE_MS, stapel: 10 }));
  }
  const opfer = crashLaeufer[crashLaeufer.length - 1];
  let getoetet = false;
  let offenBeimTod = null;
  await new Promise((r) => setTimeout(r, 1500));
  offenBeimTod = Number(psql("select count(*) from public.helmut_jobs where status<>'erledigt'"));
  // Genau die Auftraege festhalten, die der Sterbende IN DER HAND hatte. Nur an ihnen laesst
  // sich spaeter beweisen, dass ein Absturz nichts verliert — eine blosse Gesamtzahl koennte
  // auch dann stimmen, wenn diese Auftraege liegen geblieben waeren.
  const beimTodGehalten = psql(
    `select id from public.helmut_jobs where status='laeuft' and lease_owner='${opfer.owner}'`)
    .split("\n").map((z) => z.trim()).filter(Boolean);
  try { opfer.kind.kill("SIGKILL"); getoetet = true; } catch (_) { /* egal */ }
  const crashBilanzen = await Promise.all(crashLaeufer.map((l) => l.fertig));
  const crashDauer = Date.now() - t0Absturz;

  check("4.1 Der Worker wurde MITTEN IM LAUF hart getoetet (SIGKILL)",
    getoetet && offenBeimTod > 0,
    `${zahl(offenBeimTod)} Auftraege offen · ${beimTodGehalten.length} davon hielt der Sterbende`);
  check("4.1b Der Sterbende hatte tatsaechlich Auftraege reserviert (sonst waere die Probe leer)",
    beimTodGehalten.length > 0, `${beimTodGehalten.length} reserviert`);
  check("4.2 Der getoetete Worker hat KEINE Schlussbilanz geliefert (echter Absturz)",
    crashBilanzen[crashBilanzen.length - 1].bilanz === null,
    `Exitcode ${crashBilanzen[crashBilanzen.length - 1].code}`);

  // Die Auftraege des Toten haengen jetzt auf 'laeuft' bis die Lease ablaeuft.
  const haengend = Number(psql("select count(*) from public.helmut_jobs where status='laeuft'"));
  console.log(`  Beim Absturz reservierte Auftraege (Lease laeuft noch): ${haengend}`);
  if (haengend > 0) {
    // Lease ablaufen lassen (in Production geschieht das nach `lease_ms` von selbst).
    psql("update public.helmut_jobs set lease_expires_at = now() - interval '1 second' where status='laeuft'");
  }
  const nachzuegler = await starteWorker(90, { budgetMs: 60000 }).fertig;
  const rest = Number(psql("select count(*) from public.helmut_jobs where status<>'erledigt'"));
  const verwaisteErledigt = beimTodGehalten.length === 0 ? 0 : Number(psql(
    "select count(*) from public.helmut_jobs where status='erledigt' and id in ("
    + beimTodGehalten.map((i) => `'${i}'`).join(",") + ")"));
  check("4.3 GENAU die Auftraege des Abgestuerzten wurden wieder vergeben und erledigt",
    verwaisteErledigt === beimTodGehalten.length,
    `${verwaisteErledigt} von ${beimTodGehalten.length} · ${zahl((nachzuegler.bilanz && nachzuegler.bilanz.erledigt) || 0)} durch den Aufraeumworker · ${rest} offen`);
  check("4.3b Der Gesamtbestand ist vollstaendig erledigt", rest === 0, `${rest} offen`);
  const summe = Number(psql("select count(*) from public.helmut_jobs"));
  check("4.4 Kein Auftrag ist verschwunden", summe === gesamtJobs, `${zahl(summe)} von ${zahl(gesamtJobs)}`);
  const mehrfach = Number(psql("select count(*) from public.helmut_jobs where attempts > 1"));
  console.log(`  Auftraege mit mehr als einem Versuch (Erbe des Absturzes): ${zahl(mehrfach)}`);
  check("4.5 Jeder Auftrag ist genau EINMAL als erledigt verbucht",
    Number(psql("select count(*) from public.helmut_jobs where status='erledigt' and finished_at is not null")) === gesamtJobs);
  console.log(`  Absturzlauf gesamt: ${crashDauer} ms (mit ${ARBEIT_MS} ms simulierter Arbeit je Auftrag)`);

  // ── 5 · Wiederholbarkeit ───────────────────────────────────────────────────
  abschnitt("5 · Wiederholbarkeit: derselbe Volllauf ein zweites Mal");
  const wieder = await volllauf(WORKER, { budgetMs: 120000, nummerAb: 40 });
  const restWieder = Number(psql("select count(*) from public.helmut_jobs where status<>'erledigt'"));
  check("5.1 Der zweite Volllauf arbeitet denselben Bestand vollstaendig ab",
    wieder.erledigt === gesamtJobs && restWieder === 0,
    `${zahl(wieder.erledigt)} in ${wieder.dauerMs} ms`);
  const abweichung = Math.abs(wieder.durchsatz - mehr.durchsatz) / Math.max(1, mehr.durchsatz);
  check("5.2 Der Durchsatz ist reproduzierbar (Abweichung unter 50 %)",
    abweichung < 0.5, `${mehr.durchsatz.toFixed(1)} vs ${wieder.durchsatz.toFixed(1)} Auftraege/s (${(abweichung * 100).toFixed(0)} %)`);

  // ── 6 · Kapazitaetskennzahlen ──────────────────────────────────────────────
  abschnitt("6 · Kapazitaetskennzahlen (Sprintauftrag §10 a-i)");
  const bearbeitung = Number(psql(
    "select coalesce(round(avg(extract(epoch from (finished_at - first_claimed_at)) * 1000)::numeric, 2), 0)"
    + " from public.helmut_jobs where finished_at is not null and first_claimed_at is not null"));
  const maxRueckstand = Number(psql(
    "select coalesce(round(max(extract(epoch from (now() - created_at)))::numeric, 0), 0)"
    + " from public.helmut_jobs"));
  const gesamtDauerMs = ladeDauer + einzel.dauerMs + mehr.dauerMs + crashDauer + wieder.dauerMs;

  // Rechnerisch, NICHT gemessen: wie viele Worker braeuchte ein 24-Stunden-Tag?
  // Grundlage: ein voller Planungslauf je Aktualitaetsfenster, drei Fenster am Tag.
  const FENSTER_JE_TAG = 3;
  const tagesbedarf = gesamtJobs * FENSTER_JE_TAG;
  const proWorkerProTag = einzel.durchsatz * 86400;
  const workerFuerTag = Math.max(1, Math.ceil(tagesbedarf / proWorkerProTag));
  const workerFaktorZwei = Math.max(1, Math.ceil((tagesbedarf * 2) / proWorkerProTag));
  const auslastung = tagesbedarf / proWorkerProTag;

  console.log(`  a) Auftraege gesamt ............................ ${zahl(gesamtJobs)}`);
  console.log(`  b) Auftraege je Typ ........................... ${jeTyp.map((r) => `${r.typ}=${zahl(r.n)}`).join(" · ")}`);
  console.log(`  c) Durchsatz EIN Worker ....................... ${einzel.durchsatz.toFixed(1)} Auftraege/s`);
  console.log(`  d) Durchsatz ${String(WORKER).padStart(2)} Worker ...................... ${mehr.durchsatz.toFixed(1)} Auftraege/s (zweiter Lauf ${wieder.durchsatz.toFixed(1)})`);
  console.log(`  e) Durchschnittliche Bearbeitungszeit ......... ${bearbeitung} ms je Auftrag`);
  console.log(`  f) Gesamtdauer aller Testlaeufe ............... ${(gesamtDauerMs / 1000).toFixed(1)} s`);
  console.log(`  g) Maximales Rueckstandsalter ................. ${maxRueckstand} s`);
  console.log(`  h) Rechnerisch noetige Worker fuer 24 h ....... ${workerFuerTag}  (Bedarf ${zahl(tagesbedarf)} Auftraege/Tag bei ${FENSTER_JE_TAG} Fenstern)`);
  console.log(`  i) Kapazitaetsreserve bei Faktor zwei ......... ${workerFaktorZwei} Worker · Auslastung eines Workers heute ${(auslastung * 100).toFixed(3)} %`);

  console.log("\n  >> EINORDNUNG (verbindlich): diese Zahlen messen die WARTESCHLANGE mit");
  console.log("     Attrappenhandlern. Sie beweisen KEINE echte Google- oder KI-Laufzeit.");
  console.log("     Die tatsaechliche Tagesdauer in Production wird von den externen Abrufen");
  console.log("     bestimmt, nicht von der Warteschlange. Die Zeilen h) und i) sind deshalb");
  console.log("     RECHNERISCH PLAUSIBEL, nicht bewiesen. Bewiesen ist nur: die Warteschlange");
  console.log("     ist NICHT der Engpass.");

  check("6.1 Die Warteschlange ist rechnerisch nicht der Engpass (< 1 Worker Dauerlast)",
    auslastung < 1, `Auslastung ${(auslastung * 100).toFixed(3)} %`);
  check("6.2 Auch bei Faktor zwei bleibt die Workerzahl klein", workerFaktorZwei <= 4,
    `${workerFaktorZwei} Worker rechnerisch`);

  psql(`drop database if exists ${PG.db}`, { db: "postgres" });

  console.log(`\n== ERGEBNIS ==`);
  console.log(`PASS ${pass}  FAIL ${fail}`);
  if (fail === 0) {
    console.log("Belastungstest bestanden: echte Prozesse, echte Datenbank, echter Absturz, kein Verlust.");
  }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("TESTLAUF-FEHLER:", error && error.message);
  try { psql(`drop database if exists ${PG.db}`, { db: "postgres" }); } catch (_) { /* egal */ }
  process.exit(1);
});
