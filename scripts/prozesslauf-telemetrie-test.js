"use strict";

// W-2 (Werkzeug-Haertung 2026-07-27) — Production-Laeufe duerfen nicht unsichtbar werden.
// =============================================================================
// PRODUCTION-BEFUND: `processRuns` lebt im Auth-Store-Blob; recordProcessRun und
// JEDER andere Auth-Store-Writer (LLM-Log je KI-Call, Sessions, systemErrors,
// Locks …) machen Lese-Aendere-Schreibe-Zyklen ueber den GESAMTEN Blob. Ein
// parallel geschriebener Lauf ging dabei ohne jeden Fehler verloren
// (Last-Write-Wins); `.catch(() => {})` verschluckte zusaetzlich echte
// Schreibfehler. Mindestens zwei echte Production-Nachweislaeufe fehlten.
//
// Diese Suite belegt:
//   * die DETERMINISTISCHE Reproduktion des alten Verlusts auf dem Blob-Pfad
//     (kontrolliertes Interleaving, kein Timing-Zufall),
//   * dass der relationale Pfad (Option B, public.process_runs) denselben
//     Parallelfall verlustfrei uebersteht (2 und 10 parallele Writer),
//   * Idempotenz je (runId, process), Start->Abschluss-Lebenszyklus,
//   * Sichtbarkeit aller Zustaende (running/success/partial/failed/blocked/
//     rolled_back) und jedes Telemetriefehlers (kein stilles Verschlucken),
//   * Kappung, Altbestand-Lesbarkeit und definiertes Uebergangsverhalten,
//   * den Werkzeug-Abschluss (Exit 7), wenn die fachliche Arbeit lief, ihre
//     Telemetrie aber nicht gespeichert werden konnte.
//
// KEIN Netz, KEINE KI, KEINE Supabase: Blob und relationale Tabelle sind
// injizierte In-Memory-Attrappen; die CLI-Szenarien laufen gegen einen lokalen
// Stub auf 127.0.0.1 mit STRIKT allowlisteter Kindumgebung (Production-Env wird
// nie geerbt — die Suite kontrolliert ihren Storage vollstaendig selbst).

const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");

process.env.HELMUT_STORAGE_BACKEND = "local";
delete process.env.SUPABASE_URL;
delete process.env.HELMUT_PROCESS_RUNS_RELATIONAL;

const storage = require(path.join(ROOT, "lib/helmut/storage.js"));
const { recordProcessRun, recordProcessRunStart, listProcessRuns } = storage;
const {
  canonicalProcessRunStatus, PROCESS_RUN_STATUS,
  processRunToRelationalRow, relationalRowToProcessRun, compareProcessRunProjection
} = require(path.join(ROOT, "lib/helmut/blob-relational.js"));
const nachholen = require(path.join(ROOT, "scripts/vorgangsbildung-nachholen.js"));

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + String(detail).slice(0, 300) : ""}`); }
}

const klon = (v) => JSON.parse(JSON.stringify(v));

// In-Memory-Blob mit steuerbaren Lese-Toren: JEDER read wartet, bis das Tor
// explizit geoeffnet wird — damit ist das Interleaving DETERMINISTISCH, nicht
// timing-abhaengig.
function blobAttrappe(initial = { processRuns: [] }) {
  let store = klon(initial);
  const tore = [];
  return {
    leseTore: tore,
    aktuell: () => store,
    readAuthOffen: async () => klon(store),
    readAuthMitTor: () => new Promise((resolve) => tore.push(() => resolve(klon(store)))),
    writeAuth: async (s) => { store = klon(s); return store; }
  };
}

// In-Memory-Attrappe der relationalen Tabelle: Upsert-Semantik auf dem
// Primaerschluessel (run_id, process) — exakt die Garantie der Migration.
function tabellenAttrappe() {
  const zeilen = new Map();
  return {
    zeilen,
    insert: async (row) => {
      if (!PROCESS_RUN_STATUS.includes(String(row.status))) {
        throw new Error(`new row for relation "process_runs" violates check constraint "process_runs_status_check": ${row.status}`);
      }
      const k = `${row.run_id}|${row.process}`;
      zeilen.set(k, { ...(zeilen.get(k) || {}), ...row });
    },
    list: async () => [...zeilen.values()].map(relationalRowToProcessRun)
  };
}

async function main() {
  // ── (1) Ein normaler Lauf wird gespeichert (Blob-Pfad, Uebergangsphase 1) ──
  const b1 = blobAttrappe();
  const e1 = await recordProcessRun(
    { process: "understanding-nachhol", runId: "w2-normal", status: "success", processed: 3, zielmenge: 3, gespeichert: 3, uebersprungen: 0, fehlgeschlagen: 0 },
    { readAuth: b1.readAuthOffen, writeAuth: b1.writeAuth, relationalAktiv: false }
  );
  check("(1) normaler Lauf gespeichert (ok=true)", e1.ok === true && e1.gespeichert.blob === true);
  check("(1) Pflichtfelder persistiert (RunId/Typ/Status/Zielmenge/Zaehler/Backend)",
    (() => { const r = b1.aktuell().processRuns[0]; return r.runId === "w2-normal" && r.process === "understanding-nachhol" && r.status === "success" && r.zielmenge === 3 && r.gespeichert === 3 && typeof r.backend === "string"; })(),
    JSON.stringify(b1.aktuell().processRuns[0]));

  // ── DETERMINISTISCHE REPRODUKTION DES ALTEN VERLUSTS (Blob, Last-Write-Wins)
  // Beide Writer lesen DENSELBEN Ausgangszustand, dann schreibt erst B, dann A:
  // A ueberschreibt B — B ist weg, obwohl beide Schreibvorgaenge "erfolgreich" waren.
  const b2 = blobAttrappe();
  const pA = recordProcessRun({ process: "understanding-eager", runId: "lww-A", status: "success" },
    { readAuth: b2.readAuthMitTor, writeAuth: b2.writeAuth, relationalAktiv: false });
  const pB = recordProcessRun({ process: "understanding-nachhol", runId: "lww-B", status: "success" },
    { readAuth: b2.readAuthMitTor, writeAuth: b2.writeAuth, relationalAktiv: false });
  while (b2.leseTore.length < 2) await new Promise((r) => setImmediate(r)); // beide Reads anstehend
  // BEIDE Tore im SELBEN Tick oeffnen: beide Writer lesen denselben (leeren)
  // Ausgangszustand, ihre Writes serialisieren sich danach — der zweite Write
  // ueberschreibt den ersten mit seinem veralteten Lesestand. Kein Timing-Zufall.
  b2.leseTore[0](); b2.leseTore[1]();
  await Promise.all([pA, pB]);
  const nachLww = b2.aktuell().processRuns.map((r) => r.runId);
  check("(Reproduktion) Blob-Pfad verliert unter Parallelitaet einen Lauf (Last-Write-Wins)",
    nachLww.length === 1, JSON.stringify(nachLww));

  // ── (2) Dieselbe Verschraenkung, relationaler Pfad: BEIDE Laeufe erhalten ──
  const b3 = blobAttrappe();
  const t3 = tabellenAttrappe();
  const qA = recordProcessRun({ process: "understanding-eager", runId: "lww-A", status: "success" },
    { readAuth: b3.readAuthMitTor, writeAuth: b3.writeAuth, relationalAktiv: true, insertRelational: t3.insert });
  const qB = recordProcessRun({ process: "understanding-nachhol", runId: "lww-B", status: "success" },
    { readAuth: b3.readAuthMitTor, writeAuth: b3.writeAuth, relationalAktiv: true, insertRelational: t3.insert });
  while (b3.leseTore.length < 2) await new Promise((r) => setImmediate(r));
  b3.leseTore[0](); b3.leseTore[1](); // exakt dieselbe Verschraenkung wie in der Reproduktion
  const [rqA, rqB] = await Promise.all([qA, qB]);
  check("(2) zwei parallele Laeufe: beide relational erhalten", t3.zeilen.size === 2 && rqA.ok && rqB.ok, `Zeilen: ${t3.zeilen.size}`);
  const gelesen3 = await listProcessRuns({ limit: 10 }, { readAuth: b3.readAuthOffen, relationalAktiv: true, listRelational: t3.list });
  check("(2) Dual-Read liefert beide Laeufe (relational vor Blob)",
    gelesen3.filter((r) => ["lww-A", "lww-B"].includes(r.runId)).length === 2, JSON.stringify(gelesen3.map((r) => r.runId)));

  // ── (3) Zehn parallele Writes verlieren keinen Lauf ────────────────────────
  const b4 = blobAttrappe();
  const t4 = tabellenAttrappe();
  const zehn = Array.from({ length: 10 }, (_, i) => recordProcessRun(
    { process: "understanding-cron", runId: `zehn-${i}`, status: "success" },
    { readAuth: b4.readAuthMitTor, writeAuth: b4.writeAuth, relationalAktiv: true, insertRelational: t4.insert }
  ));
  while (b4.leseTore.length < 10) await new Promise((r) => setImmediate(r));
  // Alle lesen denselben (leeren) Ausgangszustand — haerteste Verschraenkung.
  for (let i = 9; i >= 0; i -= 1) b4.leseTore[i]();
  const zehnErg = await Promise.all(zehn);
  check("(3) zehn parallele Writes: alle 10 relational erhalten", t4.zeilen.size === 10 && zehnErg.every((r) => r.ok), `Zeilen: ${t4.zeilen.size}`);
  check("(3) Gegenprobe: der Blob allein haette 9 von 10 verloren", b4.aktuell().processRuns.length === 1, `Blob: ${b4.aktuell().processRuns.length}`);

  // ── (4) Identische Run-ID erzeugt kein Duplikat (relational UND Blob) ──────
  const b5 = blobAttrappe();
  const t5 = tabellenAttrappe();
  const deps5 = { readAuth: b5.readAuthOffen, writeAuth: b5.writeAuth, relationalAktiv: true, insertRelational: t5.insert };
  await recordProcessRun({ process: "understanding-nachhol", runId: "idem-1", status: "success", processed: 5 }, deps5);
  await recordProcessRun({ process: "understanding-nachhol", runId: "idem-1", status: "success", processed: 5 }, deps5);
  check("(4) relational: 1 Zeile trotz zweifachem Schreiben", t5.zeilen.size === 1);
  check("(4) Blob: 1 Eintrag trotz zweifachem Schreiben", b5.aktuell().processRuns.length === 1, `Blob: ${b5.aktuell().processRuns.length}`);

  // ── (5) Startstatus wird korrekt abgeschlossen (running -> success) ────────
  const t6 = tabellenAttrappe();
  const b6 = blobAttrappe();
  const s6 = await recordProcessRunStart({ process: "understanding-nachhol", runId: "leben-1", zielmenge: 4 },
    { relationalAktiv: true, insertRelational: t6.insert });
  const running = t6.zeilen.get("leben-1|understanding-nachhol");
  check("(5) Startbeleg: status=running, zielmenge gesetzt", s6.ok && running && running.status === "running" && running.target_count === 4, JSON.stringify(running));
  await recordProcessRun({ process: "understanding-nachhol", runId: "leben-1", status: "success", processed: 4, zielmenge: 4, finishedAt: new Date().toISOString() },
    { readAuth: b6.readAuthOffen, writeAuth: b6.writeAuth, relationalAktiv: true, insertRelational: t6.insert });
  const fertig = t6.zeilen.get("leben-1|understanding-nachhol");
  check("(5) Abschluss ersetzt Startbeleg (1 Zeile, status=success, finished_at gesetzt)",
    t6.zeilen.size === 1 && fertig.status === "success" && Boolean(fertig.finished_at), JSON.stringify(fertig));

  // ── (6/7/8) failed / partial / rolled_back bleiben sichtbar ────────────────
  const t7 = tabellenAttrappe();
  const b7 = blobAttrappe();
  const deps7 = { readAuth: b7.readAuthOffen, writeAuth: b7.writeAuth, relationalAktiv: true, insertRelational: t7.insert };
  for (const st of ["failed", "partial", "rolled_back", "blocked", "running"]) {
    await recordProcessRun({ process: "understanding-nachhol", runId: `zustand-${st}`, status: st }, deps7);
  }
  const gelesen7 = await listProcessRuns({ limit: 20 }, { readAuth: b7.readAuthOffen, relationalAktiv: true, listRelational: t7.list });
  for (const st of ["failed", "partial", "rolled_back", "blocked", "running"]) {
    check(`(6-8) Zustand '${st}' bleibt sichtbar (relational + Dual-Read)`,
      t7.zeilen.get(`zustand-${st}|understanding-nachhol`).status === st
      && gelesen7.some((r) => r.runId === `zustand-${st}` && r.status === st));
  }
  check("Status-Kanonisierung: ok->success, skipped->blocked, error->failed, empty->success",
    canonicalProcessRunStatus("ok") === "success" && canonicalProcessRunStatus("skipped") === "blocked"
    && canonicalProcessRunStatus("error") === "failed" && canonicalProcessRunStatus("empty") === "success");
  check("Status-Kanonisierung: Unbekanntes wird NICHT still umgedeutet (CHECK weist ab)",
    canonicalProcessRunStatus("total-kaputt") === "total-kaputt");
  let checkGeworfen = null;
  try { await tabellenAttrappe().insert(processRunToRelationalRow({ process: "x", runId: "x", status: "total-kaputt" })); }
  catch (e) { checkGeworfen = e; }
  check("Unbekannter Status scheitert SICHTBAR am Constraint (kein stilles Gruen)", Boolean(checkGeworfen));

  // ── (9) Telemetrie-Schreibfehler wird nicht verschluckt ────────────────────
  const fehlerLogs = [];
  const echteConsoleError = console.error;
  console.error = (...a) => { fehlerLogs.push(a.join(" ")); };
  let r9;
  try {
    r9 = await recordProcessRun(
      { process: "understanding-nachhol", runId: "kaputt-1", status: "success" },
      {
        readAuth: async () => { throw new Error("Supabase storage failed (503): blob down"); },
        writeAuth: async () => { throw new Error("unreachable"); },
        relationalAktiv: true,
        insertRelational: async () => { throw new Error("Supabase storage failed (500): relation down"); }
      }
    );
  } finally { console.error = echteConsoleError; }
  check("(9) beide Pfade kaputt: ok=false, beide Fehler benannt",
    r9.ok === false && r9.fehler.length === 2 && r9.fehler.some((f) => f.backend === "relational") && r9.fehler.some((f) => f.backend === "blob"),
    JSON.stringify(r9.fehler));
  check("(9) strukturierte TELEMETRIEFEHLER-Logzeile mit runId", fehlerLogs.some((l) => l.includes("TELEMETRIEFEHLER") && l.includes("kaputt-1")));
  check("(9) Fehlerklassen klassifiziert, keine Rohtexte verloren", r9.fehler.every((f) => typeof f.fehlerklasse === "string" && f.fehlerklasse.length > 0));

  // ── (13) Uebergangsverhalten ist DEFINIERT ─────────────────────────────────
  // Flag AUS: nur Blob, ok haengt am Blob.
  const b10 = blobAttrappe();
  const r10 = await recordProcessRun({ process: "understanding-cron", runId: "phase1-1", status: "success" },
    { readAuth: b10.readAuthOffen, writeAuth: b10.writeAuth, relationalAktiv: false });
  check("(13) Flag AUS: Blob kanonisch (ok=true, relational nicht versucht)",
    r10.ok && r10.gespeichert.blob && !r10.gespeichert.relational && r10.relationalAktiv === false);
  // Flag AN, Migration fehlt (relation does not exist): fachlich faellt nichts um,
  // der Blob-Spiegel haelt den Lauf, aber ok=false macht die Fehlkonfiguration sichtbar.
  const b11 = blobAttrappe();
  const still = console.error; console.error = () => {};
  let r11;
  try {
    r11 = await recordProcessRun({ process: "understanding-cron", runId: "phase2-fehlt", status: "success" },
      {
        readAuth: b11.readAuthOffen, writeAuth: b11.writeAuth, relationalAktiv: true,
        insertRelational: async () => { throw new Error('Supabase storage failed (404): relation "public.process_runs" does not exist'); }
      });
  } finally { console.error = still; }
  check("(13) Flag AN ohne Migration: Blob-Fallback haelt den Lauf, Fehler SICHTBAR (ok=false)",
    r11.ok === false && r11.gespeichert.blob === true && r11.fehler.length === 1 && r11.fehler[0].backend === "relational",
    JSON.stringify(r11));

  // ── (11) Kappung loescht keinen gerade geschriebenen Lauf ──────────────────
  const viele = Array.from({ length: 320 }, (_, i) => ({ process: "understanding-cron", runId: `alt-${i}`, status: "success", createdAt: new Date(Date.now() - i * 1000).toISOString() }));
  const b8 = blobAttrappe({ processRuns: viele });
  const r8 = await recordProcessRun({ process: "understanding-nachhol", runId: "frisch-1", status: "success" },
    { readAuth: b8.readAuthOffen, writeAuth: b8.writeAuth, relationalAktiv: false });
  const runs8 = b8.aktuell().processRuns;
  check("(11) Ring bleibt gedeckelt (<=300)", runs8.length <= 300, `Laenge ${runs8.length}`);
  check("(11) der gerade geschriebene Lauf ueberlebt die Kappung", r8.ok && runs8[0].runId === "frisch-1");

  // ── (12) Historische Blob-Eintraege bleiben lesbar (Dual-Read, Altformat) ──
  const legacy = { processRuns: [{ process: "understanding-eager", runId: "alt-lauf", status: "ok", durationMs: 1234, createdAt: "2026-07-20T04:00:00.000Z" }] };
  const b9 = blobAttrappe(legacy);
  const t9 = tabellenAttrappe();
  await recordProcessRun({ process: "understanding-nachhol", runId: "neu-lauf", status: "success" },
    { readAuth: b9.readAuthOffen, writeAuth: b9.writeAuth, relationalAktiv: true, insertRelational: t9.insert });
  const gelesen9 = await listProcessRuns({ limit: 10 }, { readAuth: b9.readAuthOffen, relationalAktiv: true, listRelational: t9.list });
  check("(12) Altbestand (status 'ok', altes Schema) bleibt im Dual-Read lesbar",
    gelesen9.some((r) => r.runId === "alt-lauf" && r.status === "ok") && gelesen9.some((r) => r.runId === "neu-lauf"),
    JSON.stringify(gelesen9.map((r) => `${r.runId}:${r.status}`)));
  // Projektion und Rueckabbildung sind verlustfrei (technische Felder).
  const beispiel = { process: "understanding-nachhol", runId: "proj-1", status: "success", durationMs: 42, processed: 2, zielmenge: 2, gespeichert: 2, uebersprungen: 0, fehlgeschlagen: 0, backend: "supabase", createdAt: "2026-07-27T12:00:00.000Z" };
  const projektion = processRunToRelationalRow(beispiel);
  const vergleich = compareProcessRunProjection(beispiel, projektion);
  check("(12) Projektion Blob->relational ist selbstkonsistent", vergleich.equal, JSON.stringify(vergleich.diffs));

  // ── (10) Werkzeug-Abschluss: fachlich gelaufen, Telemetrie kaputt -> Exit 7 ─
  // Stub: Reads liefern 1 Kandidaten; der Auth-Store liegt im Kind auf
  // Supabase (Backend-Gate!) und JEDER helmut_store-POST scheitert mit 500 —
  // exakt "Fachpfad ok, Telemetriepfad kaputt". KI ist aus (kein AZURE-Key) ->
  // die fachliche Verarbeitung ist ein ehrlicher 'blocked'-Skip ohne Netz/KI.
  const ALT = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  const anfragen = [];
  const stub = http.createServer((req, res) => {
    anfragen.push({ method: req.method, url: req.url });
    if (req.url.startsWith("/rest/v1/raw_documents")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify([{ id: "rd-exit7", title: "t", created_at: ALT, retrieved_at: ALT }]));
    }
    if (req.url.startsWith("/rest/v1/ko_document_links") || req.url.startsWith("/rest/v1/knowledge_objects")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end("[]");
    }
    if (req.url.startsWith("/rest/v1/helmut_store")) {
      if (req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify([{ data: { processRuns: [] } }]));
      }
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ message: "telemetrie kaputt" }));
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end("[]");
  });
  await new Promise((r) => stub.listen(0, "127.0.0.1", r));
  const port = stub.address().port;
  const kind = spawn(process.execPath, [path.join(ROOT, "scripts/vorgangsbildung-nachholen.js"), "--ausfuehren", "--karenz=0"], {
    cwd: ROOT,
    env: {
      PATH: process.env.PATH || "", HOME: process.env.HOME || "/tmp",
      HELMUT_V3_STORE: "1",
      SUPABASE_URL: `http://127.0.0.1:${port}`,
      SUPABASE_SERVICE_ROLE_KEY: "testschluessel-nie-echt-w2",
      HELMUT_STORAGE_BACKEND: "supabase",
      HELMUT_NACHHOLEN_BESTAETIGT: "ja",
      HELMUT_STORE_CACHE_MS: "0", HELMUT_SUPABASE_TIMEOUT_MS: "1500", HELMUT_BLOB_RETRY_MAX: "0"
    }
  });
  let kOut = "", kErr = "";
  kind.stdout.on("data", (d) => { kOut += d; });
  kind.stderr.on("data", (d) => { kErr += d; });
  const kCode = await new Promise((resolve) => {
    const t = setTimeout(() => kind.kill("SIGKILL"), 60000);
    kind.on("close", (c) => { clearTimeout(t); resolve(c); });
  });
  stub.close();
  check("(10) fachlich gelaufen + Telemetrie kaputt: Exit 7", kCode === 7, `Exit ${kCode}: ${(kOut + kErr).slice(-400)}`);
  check("(10) Abschlussbericht benennt den TELEMETRIEFEHLER samt runId", kErr.includes("TELEMETRIEFEHLER") && /runId nachhol-/.test(kErr));
  check("(10) JSON-Abschluss traegt lauftelemetrie.gespeichert=false", /"gespeichert":\s*false/.test(kOut), kOut.slice(-400));

  // Abschlussbewertung (pure Logik des Werkzeugs).
  check("Statusableitung: skip -> blocked", nachholen.leiteLaufstatusAb({ skipped: true }, null) === "blocked");
  check("Statusableitung: Fehler+Erfolg -> partial", nachholen.leiteLaufstatusAb({}, { gespeichert: 2, fehlgeschlagen: 1, uebersprungen: 0 }) === "partial");
  check("Statusableitung: nur Fehler -> failed", nachholen.leiteLaufstatusAb({}, { gespeichert: 0, fehlgeschlagen: 3, uebersprungen: 0 }) === "failed");
  check("Statusableitung: sauber -> success", nachholen.leiteLaufstatusAb({}, { gespeichert: 4, fehlgeschlagen: 0, uebersprungen: 1 }) === "success");
  const z = nachholen.zaehleErgebnisse({ saved: 2, updated: 1, merged: 1, duplicate: 3, "skipped-error": 2, "voellig-neu": 1 });
  check("Ergebniszaehlung: gespeichert=4, fehlgeschlagen=2, Unbekanntes zaehlt als uebersprungen (nie als Erfolg)",
    z.gespeichert === 4 && z.fehlgeschlagen === 2 && z.uebersprungen === 4, JSON.stringify(z));

  // Abgeleitete Run-ID: eindeutig UND stabil (deterministisch aus Typ+Startzeit).
  const bStabil = blobAttrappe();
  const ohneId = await recordProcessRun({ process: "briefing-morning", startedAt: "2026-07-27T04:00:00.000Z", status: "success" },
    { readAuth: bStabil.readAuthOffen, writeAuth: bStabil.writeAuth, relationalAktiv: false });
  const nochmal = await recordProcessRun({ process: "briefing-morning", startedAt: "2026-07-27T04:00:00.000Z", status: "success" },
    { readAuth: bStabil.readAuthOffen, writeAuth: bStabil.writeAuth, relationalAktiv: false });
  check("Run-ID-Ableitung: deterministisch + idempotent (kein Duplikat)",
    ohneId.eintrag.runId === nochmal.eintrag.runId && bStabil.aktuell().processRuns.length === 1,
    `${ohneId.eintrag.runId} / ${bStabil.aktuell().processRuns.length}`);

  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("Suite-Fehler:", error);
  process.exit(1);
});
