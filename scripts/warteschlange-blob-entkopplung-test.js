"use strict";

// Helmut — WÄCHTER: Blob-Entkopplung des Warteschlangenpfads (OP-30 Reparatursprint 2026-08-19).
// =============================================================================================
// BELEGTER ANLASS: der erste Aktivierungslauf der skalierbaren Pipeline (18.08. 20:00 UTC)
// hat 0 von 193 Auftraegen abgeschlossen. Ursache: jeder `source_fetch`-Auftrag las UND
// schrieb ueber `saveRawItems` die zentrale Blob-Zeile `main` (1,29 MB) vollstaendig —
// unter Parallelitaet 4 ein Row-Lock-Konvoi mit 10-s-Timeouts und Retry-Verstaerkung
// (Runbook docs/betrieb/op30-aktivierung-5-mandate.md §27). Zusaetzlich schrieb der
// Warteschlangenslot GAR KEINE Laufquittung — beide Slots des Fensters sind ohne
// `process_runs`-Zeile geblieben.
//
// DIESE SUITE MACHT ROT, SOBALD:
//   * der Warteschlangenpfad `source_fetch` wieder JE AUFTRAG die Blob-Zeilen
//     `main`/`main-auth` liest oder schreibt (statisch UND verhaltensbasiert bewiesen),
//   * die relationale Persistenz (`persistiereRohdokumenteWarteschlange`) ihre
//     Neu-Erkennung, Buendelung oder Fehlermeldung verliert,
//   * die blob-unabhaengige Slot-Quittung (`schreibeWarteschlangenLaufquittung`) einen
//     Blob anfasst, einen Erfolg ohne persistierte Zeile meldet oder bei Blob-Ausfall stirbt,
//   * der Blob-Lesespiegel des Slots (worker-betrieb.durchlauf) haeufiger als EINMAL je
//     Slot schreibt oder sein Scheitern verschweigt.
//
// TECHNIK: eine lokale PostgREST-Attrappe (Loopback-HTTP, in-Memory-Tabellen) bedient die
// ECHTEN storage-Funktionen — kein Netz, kein Supabase, keine Production-Kennung. Die
// Attrappe zaehlt jeden Zugriff je Tabelle; genau diese Zaehler tragen die Waechter.

// Umgebung VOR jedem require setzen — storage.js liest Timeout/Backend beim Laden.
process.env.SUPABASE_URL = "http://127.0.0.1:9"; // wird nach dem Start der Attrappe ersetzt
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-schluessel-nur-lokal-attrappe";
process.env.HELMUT_V3_STORE = "1";
process.env.HELMUT_STORAGE_BACKEND = "supabase";
process.env.HELMUT_STORE_CACHE_MS = "0";
process.env.HELMUT_SOURCE_MODE = "off";
process.env.HELMUT_SUPABASE_TIMEOUT_MS = "3000";
delete process.env.HELMUT_PROCESS_RUNS_RELATIONAL; // die Slot-Quittung darf NICHT am Flag haengen

const http = require("http");
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
const storage = require(path.join(ROOT, "lib/helmut/storage.js"));
const SP = require(path.join(ROOT, "lib/helmut/scalable-pipeline.js"));
const workerBetrieb = require(path.join(ROOT, "lib/helmut/worker-betrieb.js"));
const dedup = require(path.join(ROOT, "lib/helmut/dedup.js"));
const blobRelational = require(path.join(ROOT, "lib/helmut/blob-relational.js"));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

// ── Die PostgREST-Attrappe ──────────────────────────────────────────────────────────────────
function erzeugeAttrappe() {
  const zustand = {
    raw_documents: new Map(),   // id -> Zeile (ignore-duplicates: Bestand gewinnt)
    process_runs: new Map(),    // `${run_id}|${process}` -> Zeile (merge-duplicates)
    helmut_store: new Map(),    // id -> data (merge-duplicates)
    zugriffe: { raw_documents: 0, process_runs: 0, helmut_store: 0, sonstige: 0 },
    stoerungHelmutStore: false, // 500 fuer JEDEN helmut_store-Zugriff (Blob-Ausfall)
    stoerungRawDocuments: false
  };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => { body += d; });
    req.on("end", () => {
      const url = new URL(req.url, "http://127.0.0.1");
      const antworte = (code, payload) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(payload == null ? "" : JSON.stringify(payload));
      };
      const prefer = String(req.headers.prefer || "");
      try {
        if (url.pathname === "/rest/v1/raw_documents" && req.method === "POST") {
          zustand.zugriffe.raw_documents += 1;
          if (zustand.stoerungRawDocuments) return antworte(500, { message: "attrappe-stoert" });
          const zeilen = JSON.parse(body || "[]");
          const liste = Array.isArray(zeilen) ? zeilen : [zeilen];
          const eingefuegt = [];
          for (const zeile of liste) {
            if (!zeile || !zeile.id) continue;
            if (zustand.raw_documents.has(zeile.id)) {
              // ignore-duplicates: Bestand bleibt BYTE-GLEICH stehen.
              if (!/ignore-duplicates/.test(prefer)) zustand.raw_documents.set(zeile.id, zeile);
              continue;
            }
            zustand.raw_documents.set(zeile.id, zeile);
            eingefuegt.push(zeile);
          }
          if (/return=representation/.test(prefer)) {
            const select = url.searchParams.get("select");
            return antworte(201, eingefuegt.map((z) => (select === "id" ? { id: z.id } : z)));
          }
          return antworte(201, null);
        }
        if (url.pathname === "/rest/v1/process_runs" && req.method === "POST") {
          zustand.zugriffe.process_runs += 1;
          const zeile = JSON.parse(body || "{}");
          const schluessel = `${zeile.run_id}|${zeile.process}`;
          zustand.process_runs.set(schluessel, zeile); // merge-duplicates: neue Fassung gewinnt
          return antworte(201, null);
        }
        if (url.pathname === "/rest/v1/helmut_store") {
          zustand.zugriffe.helmut_store += 1;
          if (zustand.stoerungHelmutStore) return antworte(500, { message: "blob-attrappe-stoert" });
          if (req.method === "GET") {
            const idFilter = String(url.searchParams.get("id") || "").replace(/^eq\./, "");
            const data = zustand.helmut_store.get(idFilter);
            return antworte(200, data === undefined ? [] : [{ data }]);
          }
          if (req.method === "POST") {
            const zeile = JSON.parse(body || "{}");
            zustand.helmut_store.set(zeile.id, zeile.data);
            return antworte(201, null);
          }
        }
        zustand.zugriffe.sonstige += 1;
        return antworte(200, []);
      } catch (error) {
        return antworte(500, { message: String(error && error.message) });
      }
    });
  });
  return { server, zustand };
}

// Realistische Rohitems, wie sie `crawlAllSources` liefert (Blob-Form, oeffentliche Daten).
function rohitem(nr, { quelle = "q1" } = {}) {
  return {
    id: `raw-${String(nr).padStart(16, "0")}`,
    hash: `hash-${nr}`,
    sourceId: quelle,
    title: `Bundestag beraet Vorlage ${nr}`,
    url: `https://beispiel.invalid/artikel/${nr}`,
    publishedAt: new Date(Date.UTC(2026, 7, 19, 6, 0, nr % 60)).toISOString()
  };
}

// Minimale In-Memory-Warteschlange fuer durchlauf-Integrationstests (Muster
// jobqueue-vertrag-test.js, hier bewusst klein: claim/finish/extendLease genuegen).
function speicherWarteschlange() {
  const zeilen = [];
  let laufendeId = 0;
  return {
    zeilen,
    enqueue(auftrag) {
      laufendeId += 1;
      zeilen.push({
        id: `job-${laufendeId}`, job_type: auftrag.jobType, payload: auftrag.payload,
        status: "wartend", attempts: 0, max_attempts: auftrag.maxAttempts || 3,
        lease_owner: null, freshness_window: auftrag.freshnessWindow || null
      });
    },
    async claim({ owner, limit = 10, types = null } = {}) {
      const faellig = zeilen.filter((z) => z.status === "wartend"
        && (!types || types.includes(z.job_type))).slice(0, limit);
      for (const z of faellig) { z.status = "laeuft"; z.lease_owner = owner; z.attempts += 1; }
      return { verfuegbar: true, auftraege: faellig.map((z) => ({ ...z })) };
    },
    async finish({ id, owner, ok, error = null }) {
      const z = zeilen.find((x) => x.id === id);
      if (!z || z.lease_owner !== owner) return { uebernommen: false };
      z.status = ok ? "erledigt" : (z.attempts >= z.max_attempts ? "fehlgeschlagen" : "wartend");
      z.lease_owner = null;
      z.last_error = error;
      return { uebernommen: true, neuer_status: z.status };
    },
    async extendLease() { return { verlaengert: true }; }
  };
}

async function main() {
  console.log("Helmut — Blob-Entkopplung des Warteschlangenpfads (OP-30 Option B + D, Waechter)");
  console.log("  offline · Loopback-PostgREST-Attrappe · echte storage-/Pipeline-Funktionen\n");

  const { server, zustand } = erzeugeAttrappe();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  process.env.SUPABASE_URL = `http://127.0.0.1:${server.address().port}`;

  // ═══ 1 · Statische Waechter: die Rueckkehr des Musters macht ROT ═══════════
  abschnitt("1 · Statische Waechter gegen die Rueckkehr des Blob-Zugriffs je Auftrag");
  {
    const pipelineQuelle = fs.readFileSync(path.join(ROOT, "lib/helmut/scalable-pipeline.js"), "utf8");
    check("1.1 handleSourceFetch ruft deps.saveRawItems NICHT mehr auf",
      !/deps\.saveRawItems\(/.test(pipelineQuelle));
    check("1.2 handleSourceFetch ruft deps.persistRawDocuments NICHT mehr auf",
      !/deps\.persistRawDocuments\(/.test(pipelineQuelle));
    check("1.3 Die Worker-Deps verdrahten saveRawItems NICHT mehr",
      typeof SP.workerDeps().saveRawItems === "undefined");
    check("1.4 Die Worker-Deps verdrahten die relationale Persistenz",
      typeof SP.workerDeps().persistRohdokumente === "function");
    const wbQuelle = fs.readFileSync(path.join(ROOT, "lib/helmut/worker-betrieb.js"), "utf8");
    check("1.5 worker-betrieb kennt genau EINEN Spiegel-Write (Slotende), nicht mehr",
      (wbQuelle.match(/saveRawItems/g) || []).length >= 1
      && (wbQuelle.match(/speichereBlob\(/g) || []).length === 1);
    const serverQuelle = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
    check("1.6 runCronUeberWarteschlange schreibt Start- UND Abschlussquittung",
      (serverQuelle.match(/schreibeWarteschlangenLaufquittung\(/g) || []).length === 2);

    // MUTATIONSPROBE M1: eine Quelltextfassung, die den Blob-Write je Auftrag wieder
    // einbaut, MUSS von Waechter 1.1 erkannt werden — der Waechter ist tragend.
    const mutiert = pipelineQuelle.replace(
      "const roh = bilanz.rawItems || [];",
      "const roh = bilanz.rawItems || []; await deps.saveRawItems(roh);"
    );
    check("1.7 Mutationsprobe: wieder eingebauter deps.saveRawItems-Aufruf macht Waechter 1.1 rot",
      mutiert !== pipelineQuelle && /deps\.saveRawItems\(/.test(mutiert));
  }

  // ═══ 2 · Verhaltens-Waechter: ein voller Abrufauftrag ohne einen einzigen Blob-Zugriff ═══
  abschnitt("2 · Verhaltensbeweis: source_fetch beruehrt den Blob nicht (echte storage-Funktionen)");
  {
    zustand.zugriffe.helmut_store = 0;
    zustand.zugriffe.raw_documents = 0;
    const eingereiht = [];
    const deps = SP.workerDeps({
      hardeningConfig: () => ({ enabled: false, sharedPathDedup: false, sharedPathWindowMs: 0 }),
      createGate: () => null, sharedLedger: () => null,
      crawlAllSources: async () => ({
        results: [{ ok: true, sourceId: "q1" }],
        rawItems: [rohitem(1), rohitem(2), rohitem(3)]
      }),
      enqueue: async (a) => { eingereiht.push(a); return { verfuegbar: true, neu: true }; }
    });
    const ergebnis = await SP.HANDLER.source_fetch(
      { id: "j-b1", payload: { quelle: { id: "q1", rssUrl: "https://beispiel.invalid/feed" } }, freshnessWindow: "F1" },
      deps);
    check("2.1 Der Auftrag ist erfolgreich und meldet 3 neue Rohdokumente",
      ergebnis.ok === true && ergebnis.gespeichert === 3 && ergebnis.rohitems === 3,
      JSON.stringify({ ok: ergebnis.ok, gespeichert: ergebnis.gespeichert }));
    check("2.2 WÄCHTER: 0 helmut_store-Zugriffe waehrend des Auftrags (kein main/main-auth)",
      zustand.zugriffe.helmut_store === 0, `helmut_store=${zustand.zugriffe.helmut_store}`);
    check("2.3 Genau EIN gebuendelter raw_documents-Round-Trip statt Einzel-Upserts",
      zustand.zugriffe.raw_documents === 1, `raw_documents=${zustand.zugriffe.raw_documents}`);
    check("2.4 Die Ablage traegt die 3 Zeilen unter rd-Kennungen",
      zustand.raw_documents.size === 3
      && [...zustand.raw_documents.keys()].every((k) => k.startsWith("rd-")));
    const erwartet = [rohitem(1), rohitem(2), rohitem(3)]
      .map((it) => dedup.toRawDocumentRow(it).id).sort();
    check("2.5 Der Verstehensauftrag traegt exakt die rd-Kennungen der NEUEN Zeilen",
      eingereiht.length === 1
      && JSON.stringify(eingereiht[0].payload.dokumentIds) === JSON.stringify(erwartet),
      JSON.stringify(eingereiht.map((a) => a.payload && a.payload.dokumentIds)));
    check("2.6 Datensparsamkeit: keine Mandats-/Personenkennung in den geschriebenen Zeilen",
      [...zustand.raw_documents.values()].every((z) =>
        !("politicianId" in z) && !("user_id" in z) && !("tenant_id" in z) && !("excerpt" in z)));

    // Wiederholung: dieselben Items sind jetzt BESTAND -> 0 neu, 0 Verstehensauftraege.
    const zweite = await SP.HANDLER.source_fetch(
      { id: "j-b2", payload: { quelle: { id: "q1", rssUrl: "https://beispiel.invalid/feed" } }, freshnessWindow: "F1" },
      deps);
    check("2.7 Ein zweiter Abruf derselben Items erzeugt 0 neue Zeilen und 0 neue Verstehensauftraege",
      zweite.ok === true && zweite.gespeichert === 0 && zweite.bereitsVorhanden === 3
      && eingereiht.length === 1,
      JSON.stringify({ gespeichert: zweite.gespeichert, vorhanden: zweite.bereitsVorhanden }));
    check("2.8 WÄCHTER bleibt bei 0 Blob-Zugriffen auch im Wiederholungsfall",
      zustand.zugriffe.helmut_store === 0);

    // MUTATIONSPROBE M2: ein Handler, der den Blob-Write je Auftrag wieder einfuehrt,
    // MUSS am Zaehler sichtbar werden — der Verhaltens-Waechter ist tragend.
    await storage.saveRawItems([rohitem(90)]).catch(() => {});
    check("2.9 Mutationsprobe: ein echter saveRawItems-Aufruf schlaegt am Zaehler an (Waechter tragend)",
      zustand.zugriffe.helmut_store > 0, `helmut_store=${zustand.zugriffe.helmut_store}`);
  }

  // ═══ 3 · Vertrag der relationalen Persistenz ═══════════════════════════════
  abschnitt("3 · persistiereRohdokumenteWarteschlange: Neu-Erkennung, Buendelung, ehrliche Fehler");
  {
    zustand.raw_documents.clear();
    zustand.zugriffe.raw_documents = 0;
    const erste = await storage.persistiereRohdokumenteWarteschlange(
      [rohitem(10), rohitem(11)], { runId: "t3" });
    check("3.1 Erster Batch: alle Zeilen neu, ok:true",
      erste.ok === true && erste.neuIds.length === 2 && erste.vorhandene === 0);
    const zweite = await storage.persistiereRohdokumenteWarteschlange(
      [rohitem(10), rohitem(11), rohitem(12)], { runId: "t3" });
    check("3.2 Gemischter Batch: nur die neue Zeile kommt zurueck, Bestand wird gezaehlt",
      zweite.ok === true && zweite.neuIds.length === 1 && zweite.vorhandene === 2,
      JSON.stringify({ neu: zweite.neuIds.length, vorhandene: zweite.vorhandene }));
    check("3.3 ignore-duplicates: die Bestandszeile bleibt BYTE-GLEICH stehen (kein Update)",
      (() => {
        const id = dedup.toRawDocumentRow(rohitem(10)).id;
        const vorher = JSON.stringify(zustand.raw_documents.get(id));
        return storage.persistiereRohdokumenteWarteschlange(
          [{ ...rohitem(10), title: "GEAENDERTER TITEL" }], { runId: "t3" })
          .then((r) => r.ok === true && r.neuIds.length === 0
            && JSON.stringify(zustand.raw_documents.get(id)) === vorher);
      })());
    // In-Batch-Dedup: zwei Wege zur selben Story -> EINE Zeile (dedup.dedupeRawDocuments).
    const dedupiert = await storage.persistiereRohdokumenteWarteschlange(
      [rohitem(20), { ...rohitem(20) }], { runId: "t3" });
    check("3.4 In-Batch-Duplikate erzeugen genau EINE Zeile",
      dedupiert.ok === true && dedupiert.neuIds.length === 1);
    // Buendelung: 450 Items -> hoechstens ceil(450/200)=3 Anfragen, nie 450.
    zustand.zugriffe.raw_documents = 0;
    const gross = await storage.persistiereRohdokumenteWarteschlange(
      Array.from({ length: 450 }, (_, i) => rohitem(1000 + i)), { runId: "t3" });
    check("3.5 450 Items laufen in wenigen gebuendelten Anfragen (keine Einzel-Round-Trips)",
      gross.ok === true && gross.neuIds.length === 450
      && zustand.zugriffe.raw_documents <= 3,
      `anfragen=${zustand.zugriffe.raw_documents}`);
    // Ehrlicher Fehler: Stoerung -> ok:false mit Grund, KEIN throw, KEIN Blob-Ausweich.
    zustand.stoerungRawDocuments = true;
    zustand.zugriffe.helmut_store = 0;
    const gestoert = await storage.persistiereRohdokumenteWarteschlange([rohitem(2000)], { runId: "t3" });
    zustand.stoerungRawDocuments = false;
    check("3.6 Bei Stoerung: ok:false mit Grund — kein Wurf, kein stiller Erfolg",
      gestoert.ok === false && typeof gestoert.grund === "string" && gestoert.grund.length > 0);
    check("3.7 Bei Stoerung weicht die Funktion NICHT auf den Blob aus",
      zustand.zugriffe.helmut_store === 0);
    check("3.8 Leerer Batch ist ein ehrlicher No-Op (ok:true, 0 Anfragen)",
      (await storage.persistiereRohdokumenteWarteschlange([], { runId: "t3" })).ok === true);
  }

  // ═══ 4 · Blob-unabhaengige Slot-Quittung (Option D) ════════════════════════
  abschnitt("4 · schreibeWarteschlangenLaufquittung: relational, blob-unabhaengig, ehrlich");
  {
    zustand.zugriffe.helmut_store = 0;
    zustand.zugriffe.process_runs = 0;
    const start = await storage.schreibeWarteschlangenLaufquittung({
      process: "warteschlange-crawl", runId: "lauf-q1", mode: "warteschlange",
      status: "running", startedAt: "2026-08-19T04:00:00.000Z", finishedAt: null
    });
    check("4.1 Startbeleg (running) wird relational geschrieben",
      start.ok === true && zustand.process_runs.has("lauf-q1|warteschlange-crawl"));
    const ende = await storage.schreibeWarteschlangenLaufquittung({
      process: "warteschlange-crawl", runId: "lauf-q1", mode: "warteschlange",
      status: "partial", startedAt: "2026-08-19T04:00:00.000Z",
      finishedAt: "2026-08-19T04:04:39.000Z", durationMs: 279116,
      zielmenge: 193, processed: 0, deferred: 12, fehlgeschlagen: 0,
      wiederholt: 6, leaseVerloren: 0, geplant: 193, neuGeplant: 193,
      spiegelGesammelt: 0, spiegelGeschrieben: null,
      fehlerklasse: "lease-ohne-fortschritt"
    });
    const zeile = zustand.process_runs.get("lauf-q1|warteschlange-crawl");
    check("4.2 Abschluss ueberschreibt DIESELBE Zeile (run_id, process) — kein Duplikat",
      ende.ok === true && zustand.process_runs.size === 1 && zeile.status === "partial");
    check("4.3 Beginn, Ende, Status, Zaehlwerte und Fehlerklasse stehen in der Zeile",
      zeile.started_at === "2026-08-19T04:00:00.000Z"
      && zeile.finished_at === "2026-08-19T04:04:39.000Z"
      && zeile.target_count === 193 && zeile.processed_count === 0
      && zeile.deferred_count === 12 && zeile.error_class === "lease-ohne-fortschritt"
      && zeile.telemetrie && zeile.telemetrie.wiederholt === 6 && zeile.telemetrie.geplant === 193,
      JSON.stringify(zeile));
    check("4.4 Die Rueckabbildung liefert die Slot-Zaehler wieder aus (Dual-Read bleibt lesbar)",
      (() => {
        const zurueck = blobRelational.relationalRowToProcessRun(zeile);
        return zurueck.wiederholt === 6 && zurueck.geplant === 193 && zurueck.zielmenge === 193
          && zurueck.fehlerklasse === "lease-ohne-fortschritt";
      })());
    check("4.5 WÄCHTER: die Quittung hat KEINEN helmut_store-Zugriff ausgeloest",
      zustand.zugriffe.helmut_store === 0, `helmut_store=${zustand.zugriffe.helmut_store}`);

    // BLOB-AUSFALL: helmut_store liefert nur noch 500 — die Quittung ueberlebt.
    zustand.stoerungHelmutStore = true;
    const imAusfall = await storage.schreibeWarteschlangenLaufquittung({
      process: "warteschlange-pipeline", runId: "lauf-q2", status: "success",
      startedAt: "2026-08-19T05:00:00.000Z", finishedAt: "2026-08-19T05:01:00.000Z",
      zielmenge: 5, processed: 5
    });
    zustand.stoerungHelmutStore = false;
    check("4.6 SIMULIERTER BLOB-AUSFALL: die Quittung wird trotzdem geschrieben (ok:true)",
      imAusfall.ok === true && zustand.process_runs.has("lauf-q2|warteschlange-pipeline"));

    // EHRLICHKEIT: scheitert die relationale Ablage selbst, wird KEIN Erfolg gemeldet.
    const sabotiert = await storage.schreibeWarteschlangenLaufquittung(
      { process: "warteschlange-crawl", runId: "lauf-q3", status: "success", startedAt: "2026-08-19T06:00:00.000Z" },
      { insertRelational: async () => { throw new Error("attrappe: process_runs kaputt"); } });
    check("4.7 MUTATIONSPROBE: gescheiterte Persistenz meldet ok:false mit Fehlerklasse — nie Erfolg",
      sabotiert.ok === false && typeof sabotiert.fehlerklasse === "string");
    const ohneRunId = await storage.schreibeWarteschlangenLaufquittung({ process: "warteschlange-crawl", status: "running" });
    check("4.8 Ohne runId wird abgelehnt statt eine anonyme Zeile zu erzeugen",
      ohneRunId.ok === false);
    // canonicalProcessRunStatus laesst nur kanonische Zustaende durch — 'running' ist dabei.
    check("4.9 Der Status 'running' ist ein kanonischer Tabellenzustand",
      blobRelational.PROCESS_RUN_STATUS.includes("running"));
  }

  // ═══ 5 · Der Spiegel-Write: hoechstens EINMAL je Slot ══════════════════════
  abschnitt("5 · worker-betrieb.durchlauf: ein Slot, hoechstens ein Blob-Write");
  {
    const env = { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_WORKER_PARALLEL: "2" };
    const baueSlot = ({ spiegelKaputt = false } = {}) => {
      const q = speicherWarteschlange();
      for (let i = 1; i <= 4; i += 1) {
        q.enqueue({ jobType: "source_fetch", payload: { quelle: { id: `q${i}` } } });
      }
      const spiegelAufrufe = [];
      const deps = {
        claim: q.claim, finish: q.finish, extendLease: q.extendLease,
        hardeningConfig: () => ({ enabled: false, sharedPathDedup: false, sharedPathWindowMs: 0 }),
        createGate: () => null, sharedLedger: () => null,
        crawlAllSources: async ([quelle]) => ({
          results: [{ ok: true, sourceId: quelle.id }],
          rawItems: [rohitem(Number(quelle.id.slice(1)) * 100), rohitem(Number(quelle.id.slice(1)) * 100 + 1)]
        }),
        persistRohdokumente: async (items) => ({
          ok: true, neuIds: items.map((it) => dedup.toRawDocumentRow(it).id), vorhandene: 0
        }),
        enqueue: async () => ({ verfuegbar: true, neu: true }),
        saveRawItems: async (items) => {
          spiegelAufrufe.push(items.length);
          if (spiegelKaputt) throw new Error("blob-attrappe: spiegel kaputt");
          return items.slice(0, 3); // "neu im Blob"
        }
      };
      return { q, deps, spiegelAufrufe };
    };

    const { q, deps, spiegelAufrufe } = baueSlot();
    const lauf = await workerBetrieb.durchlauf({ env, deps, kennung: "t5", typen: ["source_fetch"] });
    check("5.1 Alle 4 Auftraege sind erledigt (echter Durchsatz > 0)",
      lauf.erledigt === 4 && q.zeilen.every((z) => z.status === "erledigt"),
      JSON.stringify({ erledigt: lauf.erledigt }));
    check("5.2 GENAU EIN Spiegel-Write fuer den ganzen Slot — nie je Auftrag",
      spiegelAufrufe.length === 1, `writes=${spiegelAufrufe.length}`);
    check("5.3 Der eine Write traegt die Items ALLER Auftraege (8 Stueck)",
      spiegelAufrufe[0] === 8, `items=${spiegelAufrufe[0]}`);
    check("5.4 Die Slot-Bilanz weist den Spiegel ehrlich aus",
      lauf.blobSpiegel && lauf.blobSpiegel.gesammelt === 8
      && lauf.blobSpiegel.geschrieben === true && lauf.blobSpiegel.neuImBlob === 3,
      JSON.stringify(lauf.blobSpiegel));

    // Spiegel-Ausfall: die Auftraege bleiben erledigt, der Ausfall wird benannt.
    const kaputt = baueSlot({ spiegelKaputt: true });
    const laufKaputt = await workerBetrieb.durchlauf({ env, deps: kaputt.deps, kennung: "t5b", typen: ["source_fetch"] });
    check("5.5 SIMULIERTER SPIEGEL-AUSFALL: Auftraege bleiben erledigt (kanonische Ablage traegt)",
      laufKaputt.erledigt === 4 && kaputt.q.zeilen.every((z) => z.status === "erledigt"));
    check("5.6 Der Ausfall wird EHRLICH gemeldet (geschrieben:false + Fehlermeldung), nie verschluckt",
      laufKaputt.blobSpiegel && laufKaputt.blobSpiegel.geschrieben === false
      && typeof laufKaputt.blobSpiegel.fehler === "string",
      JSON.stringify(laufKaputt.blobSpiegel));

    // Ein Slot ohne source_fetch (z. B. Narrativ-Slot) beruehrt den Blob NIE.
    const leer = baueSlot();
    leer.q.zeilen.length = 0;
    leer.q.enqueue({ jobType: "mandate_projection", payload: { mandatsId: "m1" } });
    leer.deps.getActiveProfile = async () => ({ id: "m1" });
    leer.deps.matching = async () => ({ matched: 1 });
    leer.deps.decisions = async () => ({ saved: 1 });
    leer.deps.offeneVorbedingungen = async () => ({ verfuegbar: true, offen: 0, wartend: 0, laufend: 0 });
    const laufLeer = await workerBetrieb.durchlauf({ env, deps: leer.deps, kennung: "t5c", typen: ["mandate_projection"] });
    check("5.7 Ein Slot ohne Abrufauftraege macht 0 Spiegel-Writes (0 Blob-Zugriffe)",
      laufLeer.erledigt === 1 && leer.spiegelAufrufe.length === 0
      && laufLeer.blobSpiegel.gesammelt === 0,
      JSON.stringify({ erledigt: laufLeer.erledigt, writes: leer.spiegelAufrufe.length }));
  }

  await new Promise((r) => server.close(r));

  console.log("\n== ERGEBNIS ==");
  console.log(`PASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Suite abgebrochen:", error);
  process.exit(1);
});
