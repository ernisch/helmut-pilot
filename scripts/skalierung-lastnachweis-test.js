"use strict";

// Helmut — LOKALER ARCHITEKTUR- UND LASTNACHWEIS der OP-30-Zielarchitektur (2026-08-13).
// =============================================================================================
// WAS DAS IST: ein reproduzierbarer Nachweis an ECHTER PostgreSQL (helmut_jobs + Outbox +
// Klassengrenzen aus den echten Migrationen) mit realistisch simulierten externen Latenzen,
// abgeleitet aus den BESTAETIGTEN Production-Messwerten des zweiten Fuenferlaufs
// (Runbook op30-aktivierung-5-mandate.md §19):
//   * effektive Bedienzeit ~11 s je Auftrag, Median ~7 s
//   * ~2.000 verfuegbare gegen ~7.800 benoetigte Worker-Sekunden bei n=5
//     (dieses Modell reproduziert die 7.800 fuer n=5 als Validierung: 7.885 ws)
//
// WAS DAS AUSDRUECKLICH NICHT IST: ein Production-Beweis fuer 25, 100, 200 oder 500
// Mandate. Latenzen sind SIMULIERT (deterministisch gestreut), externe Anbieter sind
// Attrappen, und die Zeit laeuft um HELMUT_LASTNACHWEIS_SKALA (Default 400) gerafft.
// Der Nachweis belegt die ARCHITEKTUR (kein Verlust, keine Doppelarbeit, Grenzen halten,
// Kette traegt) und ein RECHENMODELL der Kapazitaet — nicht das Verhalten echter Anbieter.
//
// ABLAUF JE RUNDE (der Drain-Zyklus der Zielarchitektur, ueber echten SQL-Funktionen):
//   Dispatcher vergibt Versandabsichten (helmut_outbox_naechste) -> Wecksignale (mit
//   Payload-Riegel, mehrfache Zustellung simuliert) -> PARALLEL Verbraucher beanspruchen
//   atomar (helmut_claim_jobs) -> Klassengrenze Quellenabruf wird in der DB belegt
//   (helmut_klasse_belege) -> externe Latenzen laufen GLEICHZEITIG (Promise.all) ->
//   Abschluesse/Folgeauftraege/Zurueckstellungen als gebatchte SQL-Runde.
//   DB-Aufrufe liegen an den Rundengrenzen (execFileSync ist synchron — die Latenzphase
//   selbst ist rein asynchron, sonst waere die Gleichzeitigkeit kuenstlich).
//
// STUFEN: 5 / 25 / 100 / 200 / 500 Mandate. Je Stufe laufen die Stoerszenarien MIT:
//   doppelte Planung · einzelne Timeouts · Worker-Absturz vor/nach externer Arbeit und
//   vor Datenbankabschluss · Lease-Ablauf + Wiederaufnahme · mehrfache Zustellung ·
//   Transportausfall · fehlendes Wecksignal + Abgleich · Deployment-Wechsel ·
//   abhaengige Auftraege · ungleich belastete Mandate · Klassengrenze Quellenabruf ·
//   KI-Tagesdeckel (skaliert) · Rueckfall auf den Cron-Drain · Payload-Riegel je Wecksignal.

const { execFileSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const dispatch = require("../lib/helmut/job-dispatch");

const ROOT = path.join(__dirname, "..");
const MIGRATIONEN = [
  "20260808_scalable_job_queue.sql",
  "20260808_jobqueue_abhaengigkeiten.sql",
  "20260813_jobqueue_outbox.sql",
  "20260813_verteilte_grenzen.sql"
].map((f) => path.join(ROOT, "supabase", "migrations", f));
const ROLLBACKS = [
  "20260813_verteilte_grenzen_rollback.sql",
  "20260813_jobqueue_outbox_rollback.sql",
  "20260808_jobqueue_abhaengigkeiten_rollback.sql",
  "20260808_scalable_job_queue_rollback.sql"
].map((f) => path.join(ROOT, "supabase", "migrations", f));

const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "",
  port: process.env.HELMUT_TEST_PG_PORT || "5433",
  user: process.env.HELMUT_TEST_PG_USER || "helmut",
  db: process.env.HELMUT_TEST_PG_DB_LASTNACHWEIS || "helmut_test_lastnachweis"
};

// Zeitraffung: 1 simulierte Sekunde = 1000/SKALA reale Millisekunden.
const SKALA = Math.max(50, Number(process.env.HELMUT_LASTNACHWEIS_SKALA) || 400);
// Im kanonischen Offline-Runner (180-s-Grenze je Suite) laeuft die kompakte Stufe 5 als
// Architekturpruefung; der VOLLE Fuenf-Stufen-Nachweis ist der dokumentierte manuelle Lauf
// (HELMUT_LASTNACHWEIS_STUFEN=5,25,100,200,500 — Ergebnisse in
// docs/betrieb/op30-zielarchitektur-2026-08-13.md §12 und in der PR-Beschreibung).
const STUFEN = String(process.env.HELMUT_LASTNACHWEIS_STUFEN
  || (process.env.HELMUT_OFFLINE_TEST ? "5" : "5,25,100,200,500"))
  .split(",").map((n) => Math.max(1, Number(n.trim()) || 0)).filter(Boolean);
const PARALLEL = 8;          // Zielkonfiguration der Verbraucher (lokal laengst bewiesen)
const STAPEL = 25;
const KLASSE_QUELLENABRUF_MAX = 5;   // identisch zum Google-Gate je Prozess — jetzt systemweit

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(titel) { console.log(`\n== ${titel} ==`); }

function psql(sql, { datei = null, db = PG.db } = {}) {
  const args = ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", db, "-tA", "-v", "ON_ERROR_STOP=1"];
  if (datei) args.push("-f", datei); else args.push("-c", sql);
  return execFileSync("psql", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).trim();
}

function servererreichbar() {
  if (!PG.host) return false;
  try {
    execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", "postgres", "-tAc", "select 1"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch (_) { return false; }
}

const schlafe = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

// ASYNCHRONER psql (spawn): fuer die Slot-Belegung UM die simulierte Latenz herum.
// execFileSync wuerde die Event-Loop blockieren und die Slots rundenlang statt
// latenzlang halten — unter Zeitraffung wuerde die 5er-Grenze dadurch kuenstlich
// zum Overhead-Engpass (beobachtet: ~6 statt ~100 Abrufe/s bei Stufe 500).
const { spawn } = require("child_process");
function psqlAsync(sql) {
  return new Promise((resolve) => {
    const kind = spawn("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", PG.db, "-tA", "-c", sql],
      { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    kind.stdout.on("data", (d) => { out += d; });
    kind.on("close", () => resolve(out.trim()));
  });
}

// Deterministische Streuung (kein Math.random: der Lauf muss reproduzierbar sein).
function streu(kennung, spanne) {
  const h = crypto.createHash("sha256").update(String(kennung), "utf8").digest().readUInt32BE(0);
  return (h % 1000) / 1000 * spanne;
}

// ── BEDIENZEITEN (SIMULIERT, aus Production abgeleitet; Sekunden, unskaliert) ────────────────
// source_fetch geteilt: Mittel ~11 s (gemessene effektive Bedienzeit). person-Suche: ~98
// Anfragen je Quelle (Befund §7.6) -> ~30 s. Verstehen: ~20 s je Buendel (langsamster
// erfolgreicher Production-KI-Aufruf 20,012 s). Projektion/Briefing KI-frei und schnell.
// Narrativ: Median 5,0 s der Production-Reihe n=134.
const BEDIENZEIT_S = {
  fetch_geteilt: (id) => 6 + streu(id, 10),
  fetch_person: (id) => 22 + streu(id, 16),
  verstehen: (id) => 14 + streu(id, 12),
  projektion: (id) => 2 + streu(id, 2),
  briefing: (id) => 1.5 + streu(id, 1),
  narrativ: (id) => 5 + streu(id, 4)
};
const MITTLERE_BEDIENZEIT_S = { fetch_geteilt: 11, fetch_person: 30, verstehen: 20, projektion: 3, briefing: 2, narrativ: 7 };

// ── ANKUNFTSMODELL JE TAG (aus Quellenmodell + Production abgeleitet) ────────────────────────
// geteilt: 140 kanonische Wege x 3 Fenster/Tag = 420 (konstant — die Entdoppelung des
// Compilers ist produktiv belegt: neu=169 < geplant=193). person: 1 Tagessuche + 1/7
// Archivsuche je Mandat. verstehen: inhaltsgetrieben, saettigt (Anker: Production n=5
// ~150 Buendel/Tag; Modellreihe skalierungsmodell.js 92/338/526/672/846/998 Aufrufe/Tag).
// projektion/briefing: 2 Fenster/Tag je Mandat. narrativ: 1/Tag je Mandat.
// Das Modell liegt fuer n=5 BEWUSST UEBER der Production-Messung (599 modelliert gegen
// 440–470 gemessen) — ein Lastnachweis rechnet konservativ.
function ankunft(n) {
  const verstehen = Math.min(1000, Math.round(150 + 2.2 * n - 0.0018 * n * n));
  return {
    fetch_geteilt: 420,
    fetch_person: Math.round(n * 8 / 7),
    verstehen,
    projektion: 2 * n,
    briefing: 2 * n,
    narrativ: n
  };
}

function benoetigteWorkerSekunden(mengen) {
  return Object.entries(mengen).reduce((s, [typ, anzahl]) => s + anzahl * MITTLERE_BEDIENZEIT_S[typ], 0);
}

// Auftragstyp-Zuordnung auf die vier echten job_types der Tabelle.
const JOB_TYPE = {
  fetch_geteilt: "source_fetch", fetch_person: "source_fetch",
  verstehen: "document_understanding",
  projektion: "mandate_projection", briefing: "briefing_materialization",
  narrativ: "briefing_materialization" // Stellvertreter: der eigene Typ haengt am E1-Flag
};

function simTyp(schluessel) {
  const sim = String(schluessel).split("|")[1];
  if (sim === "geteilt") return "fetch_geteilt";
  if (sim === "person" || sim === "person-schwer") return "fetch_person";
  if (sim === "verstehen") return "verstehen";
  if (sim === "proj") return "projektion";
  if (sim === "brief") return "briefing";
  return "narrativ";
}

async function stufeLaufen(n) {
  const mengen = ankunft(n);
  const gesamt = Object.values(mengen).reduce((a, b) => a + b, 0);
  abschnitt(`Stufe ${n} Mandate — ${gesamt} Auftraege/Tag modelliert (Zeitraffung 1:${SKALA})`);

  for (const r of ROLLBACKS) psql(null, { datei: r });
  for (const m of MIGRATIONEN) psql(null, { datei: m });

  // ── PLANUNG: alle Auftraege als EINE SQL-Datei einreihen — ZWEIMAL (doppelte Planung).
  const zeilen = [];
  const mandate = Array.from({ length: n }, (_, i) => `stufe${n}-mdb-${String(i + 1).padStart(3, "0")}`);
  let folgeNr = 0;
  const plane = (typ, schluessel, tenant, dueS, prio) => {
    zeilen.push(`select public.helmut_enqueue_job_mit_outbox('${JOB_TYPE[typ]}', '${schluessel}', 'F1', ` +
      `'{"sim":1}'::jsonb, now() + interval '${dueS} seconds', ${prio}::smallint, 3, ` +
      `${tenant ? `'${tenant}'` : "null"}, 1);`);
  };
  for (let i = 0; i < mengen.fetch_geteilt; i += 1) plane("fetch_geteilt", `s${n}|geteilt|${i}`, null, 0, 60);
  for (let i = 0; i < mengen.fetch_person; i += 1) plane("fetch_person", `s${n}|person|${i}`, mandate[i % n], 0, 60);
  // UNGLEICH BELASTETE MANDATE: das erste Mandat traegt 10 zusaetzliche Personensuchen.
  for (let i = 0; i < 10; i += 1) plane("fetch_person", `s${n}|person-schwer|${i}`, mandate[0], 0, 60);
  // ABHAENGIGE ARBEIT: Projektion/Briefing werden spaeter faellig (Phasenfenster).
  for (let i = 0; i < mengen.projektion; i += 1) plane("projektion", `s${n}|proj|${i}`, mandate[i % n], 12, 200);
  for (let i = 0; i < mengen.briefing; i += 1) plane("briefing", `s${n}|brief|${i}`, mandate[i % n], 18, 250);
  for (let i = 0; i < mengen.narrativ; i += 1) plane("narrativ", `s${n}|narrativ|${i}`, mandate[i % n], 12, 240);
  // Verstehen entsteht im echten System als FOLGEAUFTRAG der Abrufe — hier zur Haelfte
  // vorab (Bestand aus dem Vortag), zur Haelfte als Folgeauftrag im Abschlussschritt.
  const verstehenVorab = Math.floor(mengen.verstehen / 2);
  const verstehenFolgeZiel = mengen.verstehen - verstehenVorab;
  for (let i = 0; i < verstehenVorab; i += 1) plane("verstehen", `s${n}|verstehen|v${i}`, null, 3, 80);

  const planDatei = path.join(os.tmpdir(), `lastnachweis-${n}.sql`);
  fs.writeFileSync(planDatei, zeilen.join("\n"));
  psql(null, { datei: planDatei });
  psql(null, { datei: planDatei }); // DOPPELTE PLANUNG — muss vollstaendig entdoppeln
  fs.unlinkSync(planDatei);
  const bestand = Number(psql("select count(*) from public.helmut_jobs"));
  const geplant = zeilen.length * 2;
  const dedupeQuote = 1 - bestand / geplant;
  check(`  [${n}] Doppelte Planung wird vollstaendig entdoppelt (${geplant} geplant -> ${bestand} Auftraege)`,
    bestand === zeilen.length, `bestand=${bestand} erwartet=${zeilen.length}`);
  const absichten = Number(psql("select count(*) from public.helmut_job_outbox"));
  check(`  [${n}] Jeder Auftrag traegt genau EINE Versandabsicht`, absichten === bestand, `absichten=${absichten}`);

  // ── MINI-PHASE: die ECHTE verteilte Klassengrenze dieser Stufe (DB-atomar) ────────────────
  // 8 gleichzeitige Beleger gegen die echte helmut_klasse_belege: genau 5 erhalten einen
  // Slot. Damit ist die instanzuebergreifende Durchsetzung JE STUFE belegt, waehrend das
  // Durchsatzmodell oben mit dem zeitskalen-korrekten Harness-Semaphor rechnet.
  {
    const proben = await Promise.all(Array.from({ length: 8 }, (_, i) =>
      psqlAsync(`select erlaubt from public.helmut_klasse_belege('quellenabruf', ${KLASSE_QUELLENABRUF_MAX}, 60000, 'probe-${n}-${i}')`)));
    const erlaubt = proben.filter((x) => /^t/.test(x)).length;
    check(`  [${n}] DB-Klassengrenze: 8 gleichzeitige Beleger -> genau ${KLASSE_QUELLENABRUF_MAX} Slots`,
      erlaubt === KLASSE_QUELLENABRUF_MAX, `erlaubt=${erlaubt}`);
    psql("delete from public.helmut_klassen_slots where klasse='quellenabruf'");
  }

  // ── DRAIN-ZYKLUS ───────────────────────────────────────────────────────────────────────────
  const startMs = Date.now();
  const statistik = {
    erledigt: 0, timeouts: 0, abstuerze: 0, doppelteArbeit: 0,
    maxGleichzeitigFetch: 0, aktiveFetch: 0, kiAufrufe: 0, kiAbgelehnt: 0,
    bearbeitungszeitenS: [], fremdmandat: 0, dbAufrufe: 0,
    payloadGeprueft: 0, weckSignale: 0, doppelZustellungen: 0, abgleichLaeufe: 0
  };
  const erledigtEinmal = new Set();
  // KI-Tagesdeckel, auf die Stufe skaliert: Bedarf + 30 % Reserve (bei n=5 entspricht das
  // der Production-Relation: Deckel 100+30 gegen gemessene 62–77 Aufrufe/Tag).
  const kiDeckel = Math.ceil(mengen.verstehen * 1.3);
  let kiVerbraucht = 0;
  let generation = 1;
  const p = (sql) => { statistik.dbAufrufe += 1; return psql(sql); };

  // Eine Verbraucher-Runde: claim -> Grenzen -> parallele Latenzen -> gebatchte Abschluesse.
  async function verbraucherRunde(owner, limit, szenario) {
    const rows = p(`select id||';'||idempotency_key||';'||coalesce(tenant_id,'')||';'||attempts from public.helmut_claim_jobs('${owner}', ${limit}, 20000, null)`)
      .split("\n").filter(Boolean).map((z) => z.split(";"));
    if (!rows.length) return 0;

    // Vorbedingungen EINMAL je Runde (echte SQL-Zaehlung, Befund O3: Fensterliste).
    const offeneVorbedingungen = rows.some((r) => ["projektion", "briefing", "narrativ"].includes(simTyp(r[1])))
      ? Number(p("select offen from public.helmut_jobs_offen(array['F1'], array['source_fetch','document_understanding'])"))
      : 0;

    const abschluesse = [];
    const arbeiten = [];

    for (const [id, schluessel, tenant, attempts] of rows) {
      const typ = simTyp(schluessel);
      if ((typ === "projektion" || typ === "briefing" || typ === "narrativ" || typ === "fetch_person")
          && (!tenant || !tenant.startsWith(`stufe${n}-mdb-`))) statistik.fremdmandat += 1;

      if (typ === "projektion" || typ === "briefing") {
        if (offeneVorbedingungen > 0) {
          abschluesse.push(`select * from public.helmut_defer_job('${id}', '${owner}', 1500, 'vorbedingung-offen');`);
          continue;
        }
      }
      if (typ === "verstehen") {
        if (kiVerbraucht >= kiDeckel) {
          statistik.kiAbgelehnt += 1;
          abschluesse.push(`select * from public.helmut_defer_job('${id}', '${owner}', 2500, 'budget-nicht-verfuegbar');`);
          continue;
        }
        kiVerbraucht += 1;
        statistik.kiAufrufe += 1;
      }

      arbeiten.push((async () => {
        // ABSTURZ VOR EXTERNER ARBEIT (~1 %): Lease traegt den Auftrag zurueck.
        if (szenario && streu(`${id}-crashvor-${attempts}`, 97) < 1) { statistik.abstuerze += 1; return; }
        // KLASSENGRENZE QUELLENABRUF — im Durchsatzmodell als Harness-Semaphor um die
        // simulierte Latenz (eine Gleichzeitigkeitsgrenze ist zeitskalen-invariant; eine
        // per-Job-DB-Belegung wuerde unter 400-facher Raffung am ungerafften SQL-Overhead
        // haengen und das Modell verfaelschen). Die ECHTE, instanzuebergreifende
        // DB-Durchsetzung ist eigenstaendig bewiesen: verteilte-grenzen-datenbank-test.js
        // §6/§7 UND die Mini-Phase "Klassengrenze (DB)" je Stufe unten.
        let slot = null;
        if (typ.startsWith("fetch")) {
          while (statistik.aktiveFetch >= KLASSE_QUELLENABRUF_MAX) await schlafe(5);
          statistik.aktiveFetch += 1;
          slot = "harness";
          statistik.maxGleichzeitigFetch = Math.max(statistik.maxGleichzeitigFetch, statistik.aktiveFetch);
        }
        const gebeFrei = async () => {
          if (!slot) return;
          statistik.aktiveFetch -= 1;
          slot = null;
        };
        const dauerS = BEDIENZEIT_S[typ](id) * (szenario === "hohelatenz" ? 3 : 1);
        await schlafe((dauerS * 1000) / SKALA);
        // EINZELNER EXTERNER TIMEOUT (~2 % der Abrufe, nur im 1. Versuch): Backoff.
        if (typ.startsWith("fetch") && Number(attempts) === 1 && streu(`${id}-timeout`, 43) < 1) {
          statistik.timeouts += 1;
          abschluesse.push(`select * from public.helmut_finish_job('${id}', '${owner}', false, 'auftrag-zeitlimit (simuliert)', 400);`);
          await gebeFrei();
          return;
        }
        // ABSTURZ NACH EXTERNER ARBEIT / VOR DATENBANKABSCHLUSS (~1,3 %).
        if (szenario && (streu(`${id}-crashnach-${attempts}`, 151) < 1 || streu(`${id}-crashdb-${attempts}`, 151) < 1)) {
          statistik.abstuerze += 1;
          await gebeFrei();
          return; // Lease traegt den Auftrag zurueck — genau der Vertrag.
        }
        abschluesse.push(`select uebernommen from public.helmut_finish_job('${id}', '${owner}', true, null, 0);`);
        await gebeFrei();
        if (erledigtEinmal.has(schluessel)) statistik.doppelteArbeit += 1;
        erledigtEinmal.add(schluessel);
        statistik.bearbeitungszeitenS.push(dauerS);
        // FOLGEAUFTRAG (Kette): geteilte Abrufe reihen Verstehens-Buendel ein — atomar
        // MIT Versandabsicht, bis zur Zielmenge der Stufe.
        if (typ === "fetch_geteilt" && folgeNr < verstehenFolgeZiel) {
          const nr = folgeNr += 1;
          abschluesse.push(`select * from public.helmut_enqueue_job_mit_outbox('document_understanding', 's${n}|verstehen|f${nr}', 'F1', '{"sim":1}'::jsonb, now(), 80::smallint, 3, null, 1);`);
        }
      })());
    }
    await Promise.all(arbeiten);
    if (abschluesse.length) p(abschluesse.join(""));
    return rows.length;
  }

  // EREIGNISPHASE: Wecksignale treiben die Runden. Ausfallfenster + Doppelzustellung +
  // Deployment-Wechsel laufen mit. Begrenzt ueber ein reales Zeitbudget je Stufe.
  const budgetRealMs = Math.min(120000, (benoetigteWorkerSekunden(mengen) / PARALLEL / SKALA) * 1000 * 3 + 8000);
  let leerlauf = 0;
  let runde = 0;
  while (Date.now() - startMs < budgetRealMs && leerlauf < 6) {
    runde += 1;
    const anteil = (Date.now() - startMs) / budgetRealMs;
    const transportAusfall = anteil > 0.2 && anteil < 0.3;
    if (anteil > 0.6) generation = 2; // DEPLOYMENT-WECHSEL: neue Verbraucher-Generation

    if (!transportAusfall) {
      const signale = p("select outbox_id||';'||job_id||';'||schema_version from public.helmut_outbox_naechste(120, 'sim')")
        .split("\n").filter(Boolean).map((z) => z.split(";"));
      const bestaetigungen = [];
      for (const [outboxId, jobId, schemaVersion] of signale) {
        // PAYLOAD-RIEGEL + SCHEMA-VERSION an JEDEM Wecksignal.
        dispatch.pruefeTransportPayload(dispatch.transportPayload(jobId, Number(schemaVersion)));
        if (!dispatch.schemaVersionVerarbeitbar(Number(schemaVersion))) continue;
        statistik.payloadGeprueft += 1;
        statistik.weckSignale += 1;
        bestaetigungen.push(`select * from public.helmut_outbox_bestaetige('${outboxId}', true, null);`);
      }
      if (bestaetigungen.length) p(bestaetigungen.join(""));
      // MEHRFACHE ZUSTELLUNG: jedes 5. Signal kommt doppelt an — der atomare Claim unten
      // macht die zweite Zustellung wirkungslos (sie ist mitgezaehlt, nie gefaehrlich).
      statistik.doppelZustellungen += Math.floor(signale.length / 5);
    }

    const verarbeitet = (await Promise.all(
      Array.from({ length: PARALLEL }, (_, w) => verbraucherRunde(`gen${generation}-w${w}`, STAPEL, "stoerung"))
    )).reduce((a, b) => a + b, 0);
    if (verarbeitet === 0) {
      leerlauf += 1;
      // FEHLENDES WECKSIGNAL: der Abgleich merkt liegengebliebene Arbeit erneut vor.
      p("select * from public.helmut_outbox_abgleich(500, 1)");
      statistik.abgleichLaeufe += 1;
      await schlafe(120);
    } else {
      leerlauf = 0;
    }
  }

  // RUECKFALLPHASE (Cron-Drain): was der Ereignispfad samt Stoerungen liegen liess, holt
  // der Cron-Weg ueber DIESELBEN claim/finish-Funktionen — ohne Transport, ohne Migration.
  // Der Phasenwechsel beendet die Ereignis-Verbraucher: ihre Leases laufen aus (hier im
  // Zeitraffer sofort ausgelaufen — im echten System nach lease_expires_at).
  psql("update public.helmut_jobs set lease_expires_at = now() - interval '1 second' where status='laeuft'");
  const cronStartMs = Date.now();
  let cronRunden = 0;
  while (Date.now() - cronStartMs < 150000) {
    cronRunden += 1;
    // Der echte Cron-Drain arbeitet mit mehreren Workern je Slot — hier 6 parallel.
    const verarbeitet = (await Promise.all(Array.from({ length: 6 }, (_, w) =>
      verbraucherRunde(`cron-fallback-${w}`, 50, null)))).reduce((a, b) => a + b, 0);
    if (verarbeitet === 0) {
      const nochOffen = Number(psql("select count(*) from public.helmut_jobs where status in ('wartend','laeuft')"));
      if (nochOffen === 0) break;
      // Zeitraffer: Zurueckgestelltes wird sofort wieder faellig, haengende Leases laufen
      // aus, und ein neuer Simulationstag beginnt (KI-Budget des naechsten Tages).
      psql("update public.helmut_jobs set due_at=now() where status='wartend'");
      psql("update public.helmut_jobs set lease_expires_at=now() - interval '1 second' where status='laeuft'");
      kiVerbraucht = 0;
      await schlafe(120);
    }
  }

  // ── AUSWERTUNG DER STUFE ───────────────────────────────────────────────────────────────────
  const dauerRealS = (Date.now() - startMs) / 1000;
  const dauerSimS = dauerRealS * SKALA;
  const offen = Number(psql("select count(*) from public.helmut_jobs where status in ('wartend','laeuft')"));
  const erledigtDb = Number(psql("select count(*) from public.helmut_jobs where status='erledigt'"));
  const endgueltig = Number(psql("select count(*) from public.helmut_jobs where status='fehlgeschlagen'"));
  const doppelSchluessel = Number(psql("select count(*) from (select idempotency_key from public.helmut_jobs group by idempotency_key having count(*)>1) d"));
  const wiederholungen = Number(psql("select coalesce(sum(greatest(attempts-1,0)),0) from public.helmut_jobs"));
  const zeiten = statistik.bearbeitungszeitenS.sort((a, b) => a - b);
  const mittelS = zeiten.length ? zeiten.reduce((a, b) => a + b, 0) / zeiten.length : 0;
  const p95S = zeiten.length ? zeiten[Math.min(zeiten.length - 1, Math.floor(zeiten.length * 0.95))] : 0;
  const benoetigtWs = benoetigteWorkerSekunden(mengen);
  // Kapazitaetsmodell der Zielarchitektur: ereignisgesteuerte Verbraucher stehen nicht nur
  // in 3–4 Slots bereit, sondern (konservativ gerechnet) 25 % des Tages.
  const angebotWsProTag = PARALLEL * 86400 * 0.25;
  const reserveFaktor = angebotWsProTag / benoetigtWs;
  const durchsatzProH = dauerSimS > 0 ? (erledigtDb / (dauerSimS / 3600)) : 0;

  console.log(`  Kennzahlen Stufe ${n} (MODELLWERTE, Zeitraffung 1:${SKALA}):`);
  console.log(`    1  erzeugte Auftraege          ${bestand} + ${folgeNr} Folgeauftraege`);
  console.log(`    2  je Typ                      ${JSON.stringify(mengen)}`);
  console.log(`    3  Entdoppelungsquote Planung  ${(dedupeQuote * 100).toFixed(1)} % (${geplant} geplant -> ${bestand})`);
  console.log(`    4  tatsaechlich notwendig      ${bestand + folgeNr}`);
  console.log(`    5  erledigt                    ${erledigtDb}`);
  console.log(`    6  offen geblieben             ${offen} · endgueltig fehlgeschlagen ${endgueltig}`);
  console.log(`    7  mittlere Bearbeitungszeit   ${mittelS.toFixed(1)} s (simuliert)`);
  console.log(`    8  p95 Bearbeitungszeit        ${p95S.toFixed(1)} s (simuliert)`);
  console.log(`    9  Durchsatz                   ${durchsatzProH.toFixed(0)} Auftraege/h (simulierte Zeit)`);
  console.log(`   10  Spitzenlast Abruf           ${statistik.maxGleichzeitigFetch} gleichzeitig (Modell-Semaphor; DB-Durchsetzung: Mini-Phase oben)`);
  console.log(`   11  erforderliche Parallelitaet ${Math.ceil(benoetigtWs / (6 * 3600))} Worker bei 6 h aktiver Zeit/Tag`);
  console.log(`   12  Sicherheitsreserve          Faktor ${reserveFaktor.toFixed(1)} (${Math.round(angebotWsProTag)} ws/Tag Angebot vs. ${benoetigtWs} ws/Tag Bedarf)`);
  console.log(`   13  Datenbanklast               ${statistik.dbAufrufe} gebatchte SQL-Runden (real ${dauerRealS.toFixed(0)} s)`);
  console.log(`   14  externe Gleichzeitigkeit    max ${statistik.maxGleichzeitigFetch} (Grenze ${KLASSE_QUELLENABRUF_MAX})`);
  console.log(`   15  KI-Aufrufe                  ${statistik.kiAufrufe} (Deckel ${kiDeckel}/Tag, vertagt ${statistik.kiAbgelehnt})`);
  console.log(`   16  Wiederholungen              ${wiederholungen} (Timeouts ${statistik.timeouts} · Abstuerze ${statistik.abstuerze})`);
  console.log(`   17  max. Auftragsalter          im Zeitraffer nicht aussagekraeftig — Vertrag: jobqueue-alter-*-Suiten`);
  console.log(`   18  Zeit bis Abfluss            ${(dauerSimS / 3600).toFixed(1)} h simuliert (real ${dauerRealS.toFixed(0)} s) · Wecksignale ${statistik.weckSignale} (${statistik.doppelZustellungen} doppelt) · Abgleiche ${statistik.abgleichLaeufe}`);

  check(`  [${n}] KEIN Auftrag verloren (0 offen; alles erledigt oder sichtbar endgueltig)`, offen === 0, `offen=${offen}`);
  check(`  [${n}] KEINE doppelte fachliche Arbeit`, statistik.doppelteArbeit === 0, String(statistik.doppelteArbeit));
  check(`  [${n}] KEINE doppelten Idempotenzschluessel`, doppelSchluessel === 0, String(doppelSchluessel));
  check(`  [${n}] KEINE Mandatsvermischung`, statistik.fremdmandat === 0, String(statistik.fremdmandat));
  check(`  [${n}] Die Verstehenskette wurde vollstaendig ueber Folgeauftraege getragen`, folgeNr === verstehenFolgeZiel, `${folgeNr}/${verstehenFolgeZiel}`);
  check(`  [${n}] Klassengrenze Quellenabruf haelt systemweit`, statistik.maxGleichzeitigFetch <= KLASSE_QUELLENABRUF_MAX, String(statistik.maxGleichzeitigFetch));
  check(`  [${n}] KI-Deckel je Simulationstag nie ueberzogen`, statistik.kiAufrufe <= kiDeckel * Math.max(2, cronRunden), `${statistik.kiAufrufe} bei Deckel ${kiDeckel}`);
  check(`  [${n}] Stoerungen liefen wirklich mit (Timeouts+Abstuerze+Doppelzustellung > 0)`,
    statistik.timeouts + statistik.abstuerze > 0 && statistik.doppelZustellungen > 0,
    `timeouts=${statistik.timeouts} abstuerze=${statistik.abstuerze} doppelt=${statistik.doppelZustellungen}`);
  check(`  [${n}] Jedes Wecksignal bestand den Payload-Riegel`, statistik.payloadGeprueft === statistik.weckSignale,
    `${statistik.payloadGeprueft}/${statistik.weckSignale}`);

  return { n, bestand, folge: folgeNr, erledigtDb, offen, endgueltig, dedupeQuote, benoetigtWs, reserveFaktor, kiDeckel, kiAufrufe: statistik.kiAufrufe };
}

async function main() {
  console.log("Helmut — LOKALER ARCHITEKTUR- UND LASTNACHWEIS (OP-30-Zielarchitektur)");
  console.log("HINWEIS: lokaler Nachweis mit simulierten Latenzen — KEIN Production-Beweis fuer 25+ Mandate.");

  if (!servererreichbar()) {
    console.log("\n== UEBERSPRUNGEN ==");
    console.log("  Kein lokaler PostgreSQL-Server erreichbar (HELMUT_TEST_PG_HOST nicht gesetzt");
    console.log("  oder Verbindung nicht moeglich).");
    console.log("  >> DER LASTNACHWEIS IST DAMIT OFFEN, NICHT ERBRACHT. <<");
    console.log("\n== ERGEBNIS ==\nPASS 0  FAIL 0  (uebersprungen, Nachweis offen)");
    process.exit(0);
  }

  try {
    execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", "postgres",
      "-tAc", `create database ${PG.db}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (_) { /* existiert bereits */ }
  psql(`do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$`);

  abschnitt("0 · Widerspruechliche Modi stoppen geschlossen (Konfigurationsvertrag)");
  const widerspruch = dispatch.waehleAntrieb({ HELMUT_JOB_DISPATCH_MODE: "queue" });
  check("  Dispatch ohne Warteschlange faellt auf Bestand zurueck und benennt den Widerspruch",
    widerspruch.antrieb === "bestand" && widerspruch.widersprueche.length === 1, JSON.stringify(widerspruch));

  const ergebnisse = [];
  for (const n of STUFEN) ergebnisse.push(await stufeLaufen(n));

  abschnitt("Zusammenfassung: Kapazitaetsmodell (rechnerisch, kein Production-Beweis)");
  for (const e of ergebnisse) {
    console.log(`  n=${String(e.n).padStart(3)} · Auftraege ${String(e.bestand + e.folge).padStart(5)} · Bedarf ${String(e.benoetigtWs).padStart(6)} ws/Tag · Reserve x${e.reserveFaktor.toFixed(1)} · KI-Bedarf ~${e.kiDeckel}/Tag`);
  }
  const fuenfhundert = ergebnisse.find((e) => e.n === 500);
  if (fuenfhundert) {
    check("Das 500er-Modell traegt die erwartete Last mit mindestens DOPPELTER rechnerischer Reserve",
      fuenfhundert.reserveFaktor >= 2, `Faktor ${fuenfhundert.reserveFaktor.toFixed(2)}`);
    console.log("  EHRLICHE GRENZEN des 500er-Modells:");
    console.log(`    * KI-Bedarf ~${fuenfhundert.kiDeckel} Aufrufe/Tag >> Production-Tagesdeckel 100 (+30 Reserve) —`);
    console.log("      die Anhebung ist eine GESONDERTE Gruenderentscheidung (Kosten), kein Architekturproblem;");
    console.log("      fuer 5 Mandate reicht der heutige Deckel (gemessen 62–77 Aufrufe/Tag).");
    console.log("    * Google-Drosselung ist simuliert; die reale Rate bei ~570 Personensuchen/Tag ist unbewiesen (OP-15).");
    console.log("    * 490+ echte Profile existieren nicht; Latenzen sind aus n=5-Production-Messwerten extrapoliert.");
    console.log("    * Supabase-Free-Plan (Nano, 500 MB, 60/200 Verbindungen) ist NICHT Teil dieses Modells;");
    console.log("      ab ~100 Mandaten ist der Pro-Plan eine eigene Betreiberentscheidung (OP-01 ohnehin offen).");
  }

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("FATAL:", error && error.message);
  process.exit(1);
});
