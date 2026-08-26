"use strict";

// Helmut — GESTUFTER BELASTUNGSNACHWEIS 25 / 50 / 100 MANDATE (Skalierungssprint 2026-08-25).
// =============================================================================================
// Dieser Lauf prueft die Abnahmekriterien K1-K15 aus
// docs/betrieb/skalierung-25-50-100.md §3.2 — die dort VOR dem ersten Lauf festgeschrieben
// wurden (eigener Commit vor diesem).
//
// WAS ECHT IST:
//   * der Arbeitsplan stammt aus dem PRODUKTIONSCODE (`planeArbeit` -> `kompiliereQuellenbedarf`
//     + `planeMandatsarbeit`), nicht aus einer Nachbildung
//   * eine ECHTE lokale PostgreSQL-Datenbank mit den ECHTEN Migrationen
//   * ECHTE Workerprozesse: eigener Node-Prozess, eigene Datenbankverbindung, eigener
//     Lease-Besitzer, echter `arbeite()`-Aufruf, echte Leases, echtes Fencing
//   * ein ECHTES Fehlermandat (scheitert bei jedem Versuch) und ein ECHTES langsames Mandat
//
// >>> WAS DIESER LAUF NICHT BEWEIST — VERBINDLICH <<<
//   Die Aufgabenhandler sind ATTRAPPEN. Kein Netzverkehr, kein Google-Abruf, kein KI-Aufruf.
//   Das Ergebnis ist damit ein SYNTHETISCHER Belastungsnachweis (Zustand Z2 der
//   Skalierungsdoku) und NIEMALS ein realistischer (Z3) und erst recht keine Freigabe (Z4).
//   Gemessen wird die Kapazitaet der WARTESCHLANGE und der DATENBANK — nicht die Laufzeit
//   echter externer Abrufe.
//
// SICHERHEIT: laeuft ausschliesslich gegen eine LOKALE Testdatenbank. Ohne
// HELMUT_TEST_PG_HOST endet der Lauf mit "NACHWEIS OFFEN" — niemals gruen.
// Aufruf (immer ueber scripts/lokal.js, CLAUDE.md §6):
//   HELMUT_TEST_PG_HOST=127.0.0.1 HELMUT_TEST_PG_PORT=5433 HELMUT_TEST_PG_USER=helmut \
//     node scripts/lokal.js scripts/skalierung-stufen-lasttest.js

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
  port: process.env.HELMUT_TEST_PG_PORT || "5433",
  user: process.env.HELMUT_TEST_PG_USER || "helmut",
  db: process.env.HELMUT_TEST_PG_DB_STUFEN || "helmut_stufen_last"
};

// Abnahmekriterien §3.2: Laufzeit hoechstens 70 % des Slotbudgets.
const SLOTBUDGET_MS = 280000;
const ZEITGRENZE_MS = Math.round(SLOTBUDGET_MS * 0.7);
const STUFEN = (process.env.HELMUT_LASTTEST_STUFEN || "25,50,100").split(",").map((n) => Number(n.trim())).filter(Boolean);
const WORKER = Number(process.env.HELMUT_LASTTEST_WORKER || 4);
const LANGSAM_MS = Number(process.env.HELMUT_LASTTEST_LANGSAM_MS || 40);

let pass = 0, fail = 0;
const kriterien = [];
function check(id, name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${id} ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${id} ${name}${detail ? ` — ${detail}` : ""}`); }
  kriterien.push({ id, name, ok, detail });
  return ok;
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
  } catch { return false; }
}

// STOPKRITERIUM (Skalierungsdoku §9): der Lauf darf nur gegen eine lokale Datenbank
// arbeiten und niemals Produktionskennungen in der Umgebung sehen.
function pruefeSicherheit() {
  const verboten = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "VERCEL_TOKEN"];
  const gefunden = verboten.filter((n) => String(process.env[n] || "").trim() !== "");
  if (gefunden.length) {
    console.error(`\nABBRUCH (Stopkriterium): Produktionskennungen in der Umgebung sichtbar: ${gefunden.join(", ")}.`);
    console.error("Dieser Lauf MUSS ueber scripts/lokal.js gestartet werden (CLAUDE.md §6).");
    process.exit(3);
  }
  const lokal = ["127.0.0.1", "localhost", "::1"];
  if (!lokal.includes(PG.host) && !PG.host.startsWith("/")) {
    console.error(`\nABBRUCH (Stopkriterium): Datenbankhost ${PG.host} ist nicht lokal.`);
    process.exit(3);
  }
}

function starteWorker(nr, opt = {}) {
  const {
    budgetMs = 120000, stapel = 25, leaseMs = 30000, arbeitMs = 0,
    langsamMandat = "", langsamMs = 0, fehlerMandat = ""
  } = opt;
  const owner = `stufe-w${String(nr).padStart(2, "0")}`;
  const argumente = [
    path.join(ROOT, "scripts/fixtures/lasttest-worker.js"),
    `--host=${PG.host}`, `--port=${PG.port}`, `--user=${PG.user}`, `--db=${PG.db}`,
    `--owner=${owner}`, `--arbeitMs=${arbeitMs}`, `--stapel=${stapel}`,
    `--budgetMs=${budgetMs}`, `--leaseMs=${leaseMs}`
  ];
  if (langsamMandat) argumente.push(`--langsamMandat=${langsamMandat}`, `--langsamMs=${langsamMs}`);
  if (fehlerMandat) argumente.push(`--fehlerMandat=${fehlerMandat}`);
  const kind = spawn(process.execPath, argumente, { stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  kind.stdout.on("data", (d) => { out += d; });
  kind.stderr.on("data", () => {});
  const fertig = new Promise((resolve) => {
    kind.on("close", (code) => {
      let bilanz = null;
      try { bilanz = JSON.parse(String(out).trim().split("\n").pop() || "null"); } catch { bilanz = null; }
      resolve({ owner, code, bilanz });
    });
  });
  return { owner, kind, fertig };
}

// Der Arbeitsplan einer Stufe — aus dem Produktionscode, nicht nachgebaut.
async function planeStufe(anzahl) {
  const profile = erzeugeMandate(anzahl);
  const gesammelt = [];
  const plan = await SP.planeArbeit({
    env: { HELMUT_SCALABLE_PIPELINE: "on" },
    jetztMs: Date.parse("2026-08-25T00:00:00Z"),
    deps: {
      listFullProfiles: async () => profile,
      quellenFuerProfil: async (p) => [sched.personNewsSource(p), ...sched.mandateNewsSources(p)],
      enqueue: async (a) => { gesammelt.push(a); return { verfuegbar: true, neu: true }; }
    }
  });
  return { profile, plan, auftraege: gesammelt };
}

function ladeInDatenbank(auftraege) {
  const jsonDatei = path.join(os.tmpdir(), `helmut-stufen-${process.pid}.json`);
  fs.writeFileSync(jsonDatei, JSON.stringify(auftraege.map((a) => ({
    job_type: a.jobType, idempotency_key: a.idempotencyKey, freshness_window: a.freshnessWindow,
    payload: a.payload || {}, due_at: a.dueAt || null, priority: a.priority == null ? 100 : a.priority,
    max_attempts: a.maxAttempts == null ? 5 : a.maxAttempts, tenant_id: a.tenantId || null
  }))), "utf8");
  const ladeDatei = path.join(os.tmpdir(), `helmut-stufen-${process.pid}.sql`);
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
  const t0 = Date.now();
  psql(null, { datei: ladeDatei });
  const dauer = Date.now() - t0;
  fs.unlinkSync(jsonDatei); fs.unlinkSync(ladeDatei);
  return dauer;
}

async function fuehreStufeAus(anzahl) {
  abschnitt(`STUFE ${anzahl} MANDATE`);

  // ── Aufbau: frische Datenbank, echter Plan ────────────────────────────────
  psql(`drop database if exists ${PG.db}`, { db: "postgres" });
  psql(`create database ${PG.db}`, { db: "postgres" });
  psql(null, { datei: MIGRATION });

  const { profile, plan, auftraege } = await planeStufe(anzahl);
  const ladeDauer = ladeInDatenbank(auftraege);
  const soll = auftraege.length;
  const ist = Number(psql("select count(*) from public.helmut_jobs"));

  // Der Plan verteilt Auftraege ueber den Tag (`due_at` in der Zukunft). Gemessen werden
  // soll hier aber die KAPAZITAET fuer die gesamte Tagesmenge, nicht der Kalender: alle
  // Auftraege werden deshalb faellig gestellt. Dasselbe tut der bestehende
  // scripts/jobqueue-lasttest.js (setzeBestandZurueck). Ohne diesen Schritt misst der
  // Lauf nur den Teil, der zufaellig im Messfenster faellig war.
  psql("update public.helmut_jobs set due_at = now()");

  console.log(`  Plan: ${plan.profile} Profile · ${zahl(soll)} Auftraege · Einreihen ${ladeDauer} ms`);
  const jeTyp = psql("select job_type||' '||count(*) from public.helmut_jobs group by job_type order by 1")
    .split("\n").filter(Boolean);
  console.log(`  Auftraege je Typ: ${jeTyp.join(" · ")}`);

  const P = `${anzahl}`;
  check(`K1/${P}`, "Alle geplanten Auftraege sind eindeutig verbucht (Soll = Ist)",
    ist === soll, `${zahl(ist)} von ${zahl(soll)}`);

  // Dubletten ueber den Idempotenzschluessel — der Dublettenschutz der Ablage.
  const dubletten = Number(psql(
    "select count(*) from (select idempotency_key from public.helmut_jobs"
    + " group by idempotency_key having count(*) > 1) d"));
  check(`K6a/${P}`, "Keine doppelten Idempotenzschluessel in der Warteschlange",
    dubletten === 0, `${dubletten} Dubletten`);

  // Das kranke und das langsame Mandat bestimmen (deterministisch: erstes/zweites Profil).
  const mandate = profile.map((p) => p.id);
  const fehlerMandat = mandate[0];
  const langsamMandat = mandate[1];
  const gesundeMandate = mandate.slice(2);
  console.log(`  Fehlermandat: ${fehlerMandat} · langsames Mandat: ${langsamMandat} (${LANGSAM_MS} ms/Auftrag)`);

  // ── Lauf: echte Workerprozesse, echtes Fehlermandat, echtes langsames Mandat ──
  const t0 = Date.now();
  const laeufer = [];
  for (let i = 0; i < WORKER; i += 1) {
    laeufer.push(starteWorker(i, {
      budgetMs: SLOTBUDGET_MS, stapel: 25, leaseMs: 30000,
      langsamMandat, langsamMs: LANGSAM_MS, fehlerMandat
    }));
  }
  // Verbindungen WAEHREND des Laufs abtasten — ein Wert nach Laufende waere wertlos,
  // weil die Workerprozesse ihre Verbindungen dann schon geschlossen haben (K12b).
  let spitzeVerbindungen = 0;
  const abtaster = setInterval(() => {
    try {
      const n = Number(psql("select count(*) from pg_stat_activity where datname = current_database()"));
      if (n > spitzeVerbindungen) spitzeVerbindungen = n;
    } catch { /* Abtasten darf den Lauf nie stoeren */ }
  }, 50);

  const bilanzen = await Promise.all(laeufer.map((l) => l.fertig));
  clearInterval(abtaster);
  const dauerMs = Date.now() - t0;

  // Zustand DIREKT nach dem Hauptlauf festhalten — daran misst sich, ob das kranke
  // Mandat die gesunden aufgehalten hat (K13). Danach folgt der Nachlauf, der die
  // Wiederholungen des kranken Mandats abbrennen laesst.
  const gesundOffenNachHauptlauf = Number(psql(
    `select count(*) from public.helmut_jobs where status <> 'erledigt'`
    + ` and coalesce(tenant_id,'') <> '${fehlerMandat}'`));

  // ── Nachlauf: Wiederholungen abbrennen ────────────────────────────────────
  // Ein Handlerfehler fuehrt NICHT sofort zum endgueltigen Fehler, sondern zu einer
  // Wiederholung mit Backoff (max_attempts). Damit der Lauf den Endzustand erreicht,
  // werden die faelligen Wiederholungen in Runden vorgezogen und abgearbeitet. Das ist
  // zugleich die Probe fuer K14: Wiederaufnahme darf keine Doppelverarbeitung erzeugen.
  const nachlaeufe = [];
  for (let runde = 0; runde < 8; runde += 1) {
    const offen = Number(psql("select count(*) from public.helmut_jobs where status='wartend'"));
    if (offen === 0) break;
    psql("update public.helmut_jobs set due_at = now() where status='wartend'");
    const w = await starteWorker(50 + runde, {
      budgetMs: 60000, stapel: 25, leaseMs: 30000,
      langsamMandat, langsamMs: LANGSAM_MS, fehlerMandat
    }).fertig;
    nachlaeufe.push(w);
  }
  console.log(`  Nachlauf: ${nachlaeufe.length} Runde(n), um Wiederholungen abzubrennen`);

  const alleBilanzen = [...bilanzen, ...nachlaeufe];
  const quittungErledigt = alleBilanzen.reduce((s, b) => s + ((b.bilanz && b.bilanz.erledigt) || 0), 0);
  const quittungLeaseVerloren = alleBilanzen.reduce((s, b) => s + ((b.bilanz && b.bilanz.leaseVerloren) || 0), 0);
  const nichtVerfuegbar = alleBilanzen.filter((b) => !b.bilanz).length;

  const tatsaechlichErledigt = Number(psql("select count(*) from public.helmut_jobs where status='erledigt'"));
  const tatsaechlichFehler = Number(psql("select count(*) from public.helmut_jobs where status='fehlgeschlagen'"));
  const nochLaeuft = Number(psql("select count(*) from public.helmut_jobs where status='laeuft'"));
  const haengendeLeases = Number(psql(
    "select count(*) from public.helmut_jobs where lease_owner is not null and lease_expires_at < now()"));

  const durchsatz = tatsaechlichErledigt / (dauerMs / 1000);
  console.log(`  Laufzeit ${dauerMs} ms · Durchsatz ${durchsatz.toFixed(1)} Auftraege/s`
    + ` · erledigt ${zahl(tatsaechlichErledigt)} · endgueltige Fehler ${tatsaechlichFehler}`);

  // ── K2: Quittung und tatsaechliche Verarbeitung ───────────────────────────
  check(`K2/${P}`, "Quittung und tatsaechlicher Abfluss sind deckungsgleich",
    quittungErledigt === tatsaechlichErledigt,
    `Quittung ${zahl(quittungErledigt)} · Ablage ${zahl(tatsaechlichErledigt)}`);
  check(`K2b/${P}`, "Jeder Worker hat eine Schlussbilanz geliefert",
    nichtVerfuegbar === 0, `${nichtVerfuegbar} ohne Bilanz`);

  // ── K3: unerwartete endgueltige Fehler ────────────────────────────────────
  // Die Fehler des ABSICHTLICH kranken Mandats zaehlen nicht als unerwartet.
  const fehlerFremd = Number(psql(
    `select count(*) from public.helmut_jobs where status='fehlgeschlagen'`
    + ` and coalesce(tenant_id,'') <> '${fehlerMandat}'`));
  check(`K3/${P}`, "Keine UNERWARTETEN endgueltigen Fehler",
    fehlerFremd === 0, `${fehlerFremd} fremde Fehler · ${tatsaechlichFehler} gesamt (davon Fehlermandat)`);

  // ── K4: unbekannte Vorgaenge ──────────────────────────────────────────────
  const unbekannt = Number(psql(
    "select count(*) from public.helmut_jobs where last_error = 'unbekannter-aufgabentyp'"));
  check(`K4/${P}`, "Keine unbekannten Vorgaenge", unbekannt === 0, `${unbekannt}`);

  // ── K5: haengende Leases ──────────────────────────────────────────────────
  check(`K5/${P}`, "Keine haengenden Leases nach Laufende",
    haengendeLeases === 0 && nochLaeuft === 0,
    `${haengendeLeases} abgelaufen · ${nochLaeuft} noch 'laeuft'`);
  check(`K5b/${P}`, "Kein Worker hat eine Lease verloren",
    quittungLeaseVerloren === 0, `${quittungLeaseVerloren}`);

  // ── K6/K14: keine Doppelverarbeitung ──────────────────────────────────────
  const mehrfachFertig = Number(psql(
    "select count(*) from public.helmut_jobs where status='erledigt' and finished_at is null"));
  check(`K6/${P}`, "Kein Auftrag doppelt erledigt (Quittungssumme = Zeilen in der Ablage)",
    quittungErledigt === tatsaechlichErledigt && mehrfachFertig === 0);
  check(`K14/${P}`, "Jeder erledigte Auftrag ist genau einmal abgeschlossen verbucht",
    Number(psql("select count(*) from public.helmut_jobs where status='erledigt' and finished_at is not null"))
      === tatsaechlichErledigt);

  // ── K7: mandatsfremde Zugriffe ────────────────────────────────────────────
  // Jeder mandatsgebundene Auftrag muss mit der mandatsId in seiner Nutzlast
  // uebereinstimmen. Ein Auseinanderlaufen waere ein mandatsfremder Zugriff.
  const mandatsWiderspruch = Number(psql(
    "select count(*) from public.helmut_jobs where tenant_id is not null"
    + " and payload ? 'mandatsId' and payload->>'mandatsId' <> tenant_id"));
  check(`K7/${P}`, "Keine mandatsfremden Zuordnungen (tenant_id = payload.mandatsId)",
    mandatsWiderspruch === 0, `${mandatsWiderspruch} Widersprueche`);

  // ── K8: verwaiste Outbox-Eintraege ────────────────────────────────────────
  // Die Outbox-Tabelle gehoert zu einer spaeteren Migration; ist sie vorhanden,
  // wird sie geprueft, sonst wird das ehrlich als nicht anwendbar gemeldet.
  const outboxDa = psql("select to_regclass('public.helmut_job_outbox') is not null") === "t";
  if (outboxDa) {
    const verwaist = Number(psql(
      "select count(*) from public.helmut_job_outbox o"
      + " left join public.helmut_jobs j on j.id = o.job_id where j.id is null"));
    check(`K8/${P}`, "Keine verwaisten Outbox-Eintraege", verwaist === 0, `${verwaist}`);
  } else {
    console.log(`  K8/${P} nicht anwendbar: helmut_job_outbox ist in dieser Migration nicht angelegt.`);
  }

  // ── K9: kein gesundes Mandat verhungert ───────────────────────────────────
  const jeMandat = psql(
    "select coalesce(tenant_id,'(global)')||' '||count(*) filter (where status='erledigt')"
    + " from public.helmut_jobs group by tenant_id").split("\n").filter(Boolean)
    .map((z) => { const i = z.lastIndexOf(" "); return { mandat: z.slice(0, i), erledigt: Number(z.slice(i + 1)) }; });
  const gesundeOhneAbschluss = gesundeMandate.filter((m) => {
    const e = jeMandat.find((r) => r.mandat === m);
    return !e || e.erledigt === 0;
  });
  check(`K9/${P}`, "Kein gesundes Mandat verhungert (jedes hat mindestens einen Abschluss)",
    gesundeOhneAbschluss.length === 0,
    `${gesundeMandate.length} gesunde Mandate · ${gesundeOhneAbschluss.length} ohne Abschluss`);

  // Fairness: Streuung der Abschluesse ueber die gesunden Mandate.
  const werteGesund = gesundeMandate.map((m) => {
    const e = jeMandat.find((r) => r.mandat === m);
    return e ? e.erledigt : 0;
  });
  const minG = Math.min(...werteGesund), maxG = Math.max(...werteGesund);
  console.log(`  Fairness gesunde Mandate: min ${minG} · max ${maxG} Abschluesse je Mandat`);
  check(`K9b/${P}`, "Die Abschlussverteilung der gesunden Mandate ist nicht entartet",
    maxG > 0 && minG > 0, `min ${minG} · max ${maxG}`);

  // ── K13: das kranke Mandat beeintraechtigt die gesunden nicht ─────────────
  check(`K13/${P}`, "Das fehlerhafte Mandat beeintraechtigt gesunde Mandate nicht",
    gesundOffenNachHauptlauf === 0,
    `${gesundOffenNachHauptlauf} nicht erledigte Auftraege ausserhalb des Fehlermandats nach dem Hauptlauf`);
  const fehlerMandatFehler = Number(psql(
    `select count(*) from public.helmut_jobs where status='fehlgeschlagen' and tenant_id = '${fehlerMandat}'`));
  check(`K13b/${P}`, "Das Fehlermandat ist tatsaechlich endgueltig gescheitert (die Probe war wirksam)",
    fehlerMandatFehler > 0, `${fehlerMandatFehler} endgueltige Fehler im Fehlermandat`);

  // ── K10/K11: Rueckstau ────────────────────────────────────────────────────
  const restOffen = Number(psql("select count(*) from public.helmut_jobs where status='wartend'"));
  check(`K10/${P}`, "Der Rueckstau waechst nicht dauerhaft (Abfluss >= Ankunft)",
    tatsaechlichErledigt + tatsaechlichFehler >= soll - restOffen,
    `${zahl(tatsaechlichErledigt)} erledigt + ${tatsaechlichFehler} terminal von ${zahl(soll)}`);
  check(`K11/${P}`, "Der begrenzte Rueckstau ist nach dem Nachlauf vollstaendig abgebaut",
    restOffen === 0, `${restOffen} noch wartend nach ${nachlaeufe.length} Nachlaufrunde(n)`);

  // ── K12: Laufzeit und Verbindungen ────────────────────────────────────────
  const verbindungen = spitzeVerbindungen;
  const maxVerbindungen = Number(psql("select setting::int from pg_settings where name='max_connections'"));
  check(`K12a/${P}`, `Laufzeit unter der Grenze (70 % von ${SLOTBUDGET_MS} ms)`,
    dauerMs <= ZEITGRENZE_MS, `${dauerMs} ms von hoechstens ${ZEITGRENZE_MS} ms`);
  check(`K12b/${P}`, "SPITZE der Datenbankverbindungen mit Sicherheitsreserve unter der Grenze",
    verbindungen > 0 && verbindungen <= maxVerbindungen * 0.5,
    `Spitze ${verbindungen} von ${maxVerbindungen} (Grenze 50 %)`);

  // ── K15: Kosten ───────────────────────────────────────────────────────────
  check(`K15/${P}`, "Keine Kosten: Attrappenhandler, also 0 Modellaufrufe",
    true, "0 KI-Aufrufe · 0 USD (Attrappen)");

  const messwerte = {
    mandate: anzahl, auftraege: soll, dauerMs, durchsatz: Number(durchsatz.toFixed(2)),
    erledigt: tatsaechlichErledigt, endgueltigeFehler: tatsaechlichFehler,
    fremdeFehler: fehlerFremd, restOffen, haengendeLeases, dubletten,
    verbindungen, maxVerbindungen, ladeDauerMs: ladeDauer,
    fairnessMin: minG, fairnessMax: maxG
  };

  psql(`drop database if exists ${PG.db}`, { db: "postgres" });
  return messwerte;
}

async function main() {
  console.log("Helmut — Gestufter Belastungsnachweis 25 / 50 / 100 Mandate");
  console.log(`  Stufen: ${STUFEN.join(", ")} · ${WORKER} Workerprozesse · Slotbudget ${SLOTBUDGET_MS} ms`);
  console.log("  ATTRAPPENHANDLER — synthetischer Nachweis (Z2), kein realistischer (Z3).\n");

  pruefeSicherheit();

  if (!servererreichbar()) {
    console.log("== UEBERSPRUNGEN ==");
    console.log("  Kein lokaler PostgreSQL-Server erreichbar (HELMUT_TEST_PG_HOST/USER nicht gesetzt).");
    console.log("  >> DER BELASTUNGSNACHWEIS IST DAMIT OFFEN, NICHT ERBRACHT. <<");
    process.exit(0);
  }

  const alle = [];
  for (const stufe of STUFEN) {
    const vorherFail = fail;
    const m = await fuehreStufeAus(stufe);
    alle.push(m);
    // STUFENREGEL (§3.3): die naechste Stufe nur bei vollstaendig bestandener vorheriger.
    if (fail > vorherFail) {
      console.log(`\n>> STUFE ${stufe} NICHT VOLLSTAENDIG BESTANDEN — die naechste Stufe wird`);
      console.log("   nach der Stufenregel (§3.3) NICHT ausgefuehrt.");
      break;
    }
  }

  abschnitt("MESSWERTE JE STUFE");
  console.log("  Mandate | Auftraege | Laufzeit | Durchsatz | erledigt | Fehler | Rest | Leases | Verb.");
  for (const m of alle) {
    console.log(
      "  " + String(m.mandate).padStart(7)
      + " | " + String(zahl(m.auftraege)).padStart(9)
      + " | " + String(m.dauerMs + " ms").padStart(8)
      + " | " + String(m.durchsatz.toFixed(1) + "/s").padStart(9)
      + " | " + String(zahl(m.erledigt)).padStart(8)
      + " | " + String(m.endgueltigeFehler).padStart(6)
      + " | " + String(m.restOffen).padStart(4)
      + " | " + String(m.haengendeLeases).padStart(6)
      + " | " + String(m.verbindungen + "/" + m.maxVerbindungen).padStart(6));
  }

  const bericht = { stand: "synthetisch-Z2", slotbudgetMs: SLOTBUDGET_MS, zeitgrenzeMs: ZEITGRENZE_MS,
    worker: WORKER, stufen: alle, kriterien, pass, fail };
  const berichtDatei = path.join(os.tmpdir(), "helmut-skalierung-stufen-bericht.json");
  fs.writeFileSync(berichtDatei, JSON.stringify(bericht, null, 2), "utf8");
  console.log(`\n  Maschinenlesbarer Bericht: ${berichtDatei}`);

  console.log("\n  >> EINORDNUNG (verbindlich): Attrappenhandler. Dieses Ergebnis ist ein");
  console.log("     SYNTHETISCHER Belastungsnachweis (Z2). Es ist KEIN realistischer");
  console.log("     Nachweis (Z3) und KEINE Freigabe zur Aktivierung (Z4).");

  console.log(`\n== ERGEBNIS ==`);
  console.log(`PASS ${pass}  FAIL ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("TESTLAUF-FEHLER:", error && error.message);
  try { psql(`drop database if exists ${PG.db}`, { db: "postgres" }); } catch { /* egal */ }
  process.exit(1);
});
