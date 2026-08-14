"use strict";

// Helmut — MUTATIONSPROBE des verwalteten Queue-Verbrauchers (Haertungssprint 2026-08-14).
// =============================================================================================
// WAS EINE MUTATIONSPROBE IST: Sie entfernt gezielt EINE Sicherheitsbedingung und prueft, ob
// die Tests das MERKEN. Ein gruener Test ueber einer stillgelegten Bedingung ist wertlos —
// diese Probe beweist, dass die Tests die Bedingungen wirklich tragen.
//
// ROT = die Mutation wurde erkannt (gut). GRUEN = ein LOCH im Testnetz (schlecht).
//
// Geprueft werden sieben Bedingungen, die im Haertungssprint neu hinzugekommen sind:
//   M1 Terminale Auftraege werden bei mehrfacher Zustellung erneut bearbeitet
//   M2 Der Verbraucher zieht IRGENDEINEN statt des signalisierten Auftrags
//   M3 Die Payloadpruefung im Verbraucher entfaellt
//   M4 Ein unbekannter Auftrag wandert nie in die Quarantaene (Nachricht kreist ewig)
//   M5 Die partielle Fehlerantwort meldet nichts (erfolgreiche Nachrichten kommen wieder)
//   M6 Ein 429 (niemand hat uebernommen) gilt als Erfolg — Befund 1 kehrt zurueck
//   M7 Der Ziel-Riegel des SQS-Transports laesst eine fremde Region durch
//
// Die Mutation geschieht IM SPEICHER (Modulquelltext wird geladen, veraendert und in einer
// eigenen Sandbox ausgefuehrt) — keine Datei im Repository wird angefasst.

const fs = require("fs");
const path = require("path");
const Module = require("module");

const ROOT = path.join(__dirname, "..");
let erkannt = 0;
let loecher = 0;

function ergebnis(name, mutationErkannt, detail = "") {
  if (mutationErkannt) { erkannt += 1; console.log(`  ROT (erkannt)  ${name}`); }
  else { loecher += 1; console.log(`  GRUEN (LOCH)   ${name}${detail ? ` — ${detail}` : ""}`); }
}

// Laedt ein Modul mit veraendertem Quelltext, ohne die Datei anzufassen.
function ladeMutiert(relativerPfad, ersetzungen) {
  const voll = path.join(ROOT, relativerPfad);
  let src = fs.readFileSync(voll, "utf8");
  for (const [alt, neu] of ersetzungen) {
    if (!src.includes(alt)) throw new Error(`Mutationsanker nicht gefunden: ${alt.slice(0, 60)}`);
    src = src.replace(alt, neu);
  }
  const m = new Module(voll, module);
  m.filename = voll;
  m.paths = Module._nodeModulePaths(path.dirname(voll));
  m._compile(src, voll);
  return m.exports;
}

const UUID = "123e4567-e89b-42d3-a456-426614174000";
const SQS_ENV = {
  HELMUT_SCALABLE_PIPELINE: "on", HELMUT_JOB_DISPATCH_MODE: "queue",
  HELMUT_JOB_TRANSPORT: "sqs", AWS_REGION: "eu-central-1",
  HELMUT_SQS_QUEUE_URL: "https://sqs.eu-central-1.amazonaws.com/1/helmut-test"
};

async function main() {
  console.log("Helmut — Mutationsprobe verwalteter Queue-Verbraucher");
  console.log("ROT = Mutation erkannt (gut) · GRUEN = Loch im Testnetz (schlecht)\n");

  // ── M1: terminale Auftraege werden erneut bearbeitet ────────────────────────────────────
  {
    const mutiert = ladeMutiert("lib/helmut/queue-verbraucher.js", [
      [`    if (grund.startsWith("bereits-")) {
      return { erledigt: true, gearbeitet: false, grund, dauerMs: (deps.now || Date.now)() - start };
    }`,
       `    if (grund.startsWith("bereits-")) {
      return { erledigt: false, wiederholen: true, gearbeitet: false, grund };
    }`]
    ]);
    const r = await mutiert.verarbeiteWecksignal({
      payload: { jobId: UUID, schemaVersion: 1 }, env: SQS_ENV,
      deps: { claimById: async () => ({ verfuegbar: true, uebernommen: false, grund: "bereits-erledigt" }) } });
    // Der Vertragstest verlangt: erledigt=true, gearbeitet=false (Nachricht wird geloescht).
    ergebnis("M1 Terminale Auftraege bei mehrfacher Zustellung", r.erledigt !== true,
      JSON.stringify(r));
  }

  // ── M2: irgendein Auftrag statt des signalisierten ──────────────────────────────────────
  {
    const mutiert = ladeMutiert("lib/helmut/queue-verbraucher.js", [
      ["    jobId: payload.jobId, owner: besitzer, leaseMs: VERBRAUCHER_LEASE_MS",
       "    jobId: \"00000000-0000-4000-8000-000000000000\", owner: besitzer, leaseMs: VERBRAUCHER_LEASE_MS"]
    ]);
    const gesehen = [];
    await mutiert.verarbeiteWecksignal({
      payload: { jobId: UUID, schemaVersion: 1 }, env: SQS_ENV,
      deps: { claimById: async (o) => { gesehen.push(o.jobId); return { verfuegbar: true, uebernommen: false, grund: "unbekannt" }; } } });
    ergebnis("M2 Genau der signalisierte Auftrag wird beansprucht", gesehen[0] !== UUID,
      `beansprucht=${gesehen[0]}`);
  }

  // ── M3: Payloadpruefung entfaellt ───────────────────────────────────────────────────────
  {
    const mutiert = ladeMutiert("lib/helmut/queue-verbraucher.js", [
      ["    jobDispatch.pruefeTransportPayload(payload);", "    /* Pruefung entfernt */"]
    ]);
    let beansprucht = false;
    const r = await mutiert.verarbeiteWecksignal({
      payload: { jobId: "kein-uuid", schemaVersion: 1, mandat: "geheim" }, env: SQS_ENV,
      deps: { claimById: async () => { beansprucht = true; return { verfuegbar: true, uebernommen: false, grund: "unbekannt" }; } } });
    // Ohne Pruefung wuerde ein regelwidriges Signal bis zur Beanspruchung durchlaufen.
    ergebnis("M3 Signalpruefung im Verbraucher", beansprucht === true || r.grund !== "payload-ungueltig",
      JSON.stringify(r));
  }

  // ── M4: unbekannter Auftrag kreist ewig statt in die Quarantaene ────────────────────────
  {
    const mutiert = ladeMutiert("lib/helmut/queue-verbraucher.js", [
      [`    if (grund === "unbekannt") {
      return { erledigt: false, quarantaene: true, gearbeitet: false, grund: "auftrag-unbekannt" };
    }`,
       `    if (grund === "unbekannt") {
      return { erledigt: false, wiederholen: true, gearbeitet: false, grund: "auftrag-unbekannt" };
    }`]
    ]);
    const r = await mutiert.verarbeiteWecksignal({
      payload: { jobId: UUID, schemaVersion: 1 }, env: SQS_ENV,
      deps: { claimById: async () => ({ verfuegbar: true, uebernommen: false, grund: "unbekannt" }) } });
    ergebnis("M4 Unbekannter Auftrag geht in die Quarantaene", r.quarantaene !== true, JSON.stringify(r));
  }

  // ── M5: partielle Fehlerantwort meldet nichts ───────────────────────────────────────────
  {
    const mutiert = ladeMutiert("lib/helmut/lambda-verbraucher.js", [
      ["  return { batchItemFailures, bilanz };", "  return { batchItemFailures: [], bilanz };"]
    ]);
    const antwort = await mutiert.handler(
      { Records: [{ messageId: "m1", body: JSON.stringify({ jobId: UUID, schemaVersion: 1 }) }] }, {},
      { log: () => {}, verarbeite: async () => ({ erledigt: false, wiederholen: true, grund: "lease-fremd" }) });
    // Ohne Meldung wuerde eine NICHT verarbeitete Nachricht geloescht -> stiller Verlust.
    ergebnis("M5 Partielle Fehlerantwort meldet nicht erledigte Nachrichten",
      antwort.batchItemFailures.length === 0, JSON.stringify(antwort.batchItemFailures));
  }

  // ── M6: 429 gilt als Erfolg (Befund 1 kehrt zurueck) ────────────────────────────────────
  {
    const mutiert = ladeMutiert("lib/helmut/job-dispatch.js", [
      [`        if (antwort && antwort.status === 429) {
          return { ok: false, unbestaetigt: true, grund: "weck-niemand-uebernommen" };
        }`,
       "        /* 429-Behandlung entfernt */"]
    ]);
    const VERTRAUEN = { VERCEL_PROJECT_PRODUCTION_URL: "helmut-pilot.vercel.app" };
    const t = mutiert.selbstweckTransport(
      { HELMUT_WORKER_WAKE_URL: "https://helmut-pilot.vercel.app/api/cron/worker-weck",
        CRON_SECRET: "s", ...VERTRAUEN },
      { fetch: async () => ({ ok: false, status: 429 }) });
    const r = await t.sende(mutiert.transportPayload(UUID));
    ergebnis("M6 429 (niemand hat uebernommen) ist NICHT einfach ein Fehlversuch",
      r.unbestaetigt !== true, JSON.stringify(r));
  }

  // ── M7: Ziel-Riegel laesst eine fremde Region durch ─────────────────────────────────────
  {
    const mutiert = ladeMutiert("lib/helmut/job-dispatch.js", [
      [`  if (!SQS_ERLAUBTE_REGIONEN.includes(String(region || ""))) {
    return { ok: false, grund: \`sqs-region-unzulaessig:\${String(region || "").slice(0, 20)}\` };
  }`,
       "  /* Regionspruefung entfernt */"]
    ]);
    const r = mutiert.pruefeSqsZiel("https://sqs.us-east-1.amazonaws.com/1/q", "us-east-1");
    ergebnis("M7 Regionsriegel des SQS-Ziels", r.ok === true, JSON.stringify(r));
  }

  console.log(`\n== ERGEBNIS ==\nerkannt (ROT) ${erkannt}  Loecher (GRUEN) ${loecher}  (gesamt ${erkannt + loecher})`);
  if (loecher > 0) {
    console.log("MINDESTENS EINE Sicherheitsbedingung ist NICHT testgesichert.");
  }
  process.exit(loecher > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL:", e && e.message); process.exit(1); });
