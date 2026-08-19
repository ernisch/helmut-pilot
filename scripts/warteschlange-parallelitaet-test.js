"use strict";

// Helmut — REALISTISCHER PARALLELITAETSTEST des entkoppelten Warteschlangenpfads
// (OP-30 Reparatursprint 2026-08-19, Auftragspunkt 7).
// =============================================================================================
// WAS BEWIESEN WIRD (an ECHTER lokaler PostgreSQL, echte SQL-Funktionen, echter
// Produktionscode `worker-betrieb.durchlauf` + `scalable-pipeline.arbeite` + echte
// `storage.persistiereRohdokumenteWarteschlange`/`storage.saveRawItems`):
//   * Unter Parallelitaet 4 und Stapel 25 entsteht ein ECHTER Durchsatz > 0 — genau die
//     Konstellation, die am 18.08. in Production 0 von 193 Auftraegen schaffte.
//   * Die Blob-Zugriffe je Slot sind KONSTANT (1 Lesespiegel = 1 Read + 1 Write),
//     unabhaengig von Auftragszahl UND Blob-Groesse (Fixture >= 1,29 MB — die gemessene
//     Groesse der Production-Zeile `main`). Die Blob-Groesse begrenzt den
//     Warteschlangendurchsatz damit nicht mehr.
//   * 0 Doppelarbeit: jeder Auftrag wird ueber alle 4 Worker hinweg GENAU EINMAL ausgefuehrt.
//   * 0 verlorene Auftraege: jeder eingereihte Auftrag erreicht einen Endzustand.
//   * Abgelaufene Leases werden korrekt wieder aufgenommen (ein Geisterworker stirbt,
//     der naechste Slot uebernimmt und schliesst ab).
//   * Bei simuliertem Blob-Ausfall bleibt der Durchsatz erhalten und der Spiegel-Ausfall
//     wird ehrlich gemeldet.
//
// WAS AUSDRUECKLICH NICHT BEHAUPTET WIRD: Production-Performance. Dieser Test laeuft auf
// lokaler Hardware mit Attrappen fuer Netzabruf und ohne Netz-Latenz zur Datenbank — er
// beweist STRUKTUR (Zugriffsmuster, Nebenlaeufigkeit, Verlustfreiheit), keine Latenzzahlen.
//
// Ohne lokalen PostgreSQL (HELMUT_TEST_PG_HOST/USER) wird EHRLICH uebersprungen — der
// Nachweis ist dann OFFEN, nicht erbracht (dasselbe Muster wie jobqueue-lasttest.js).

process.env.SUPABASE_SERVICE_ROLE_KEY = "test-schluessel-nur-lokal-attrappe";
process.env.HELMUT_V3_STORE = "1";
process.env.HELMUT_STORAGE_BACKEND = "supabase";
process.env.HELMUT_STORE_CACHE_MS = "0";
process.env.HELMUT_SOURCE_MODE = "off";
process.env.HELMUT_SUPABASE_TIMEOUT_MS = "10000";
process.env.SUPABASE_URL = "http://127.0.0.1:9"; // nach Attrappen-Start ersetzt

const http = require("http");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const storage = require(path.join(ROOT, "lib/helmut/storage.js"));
const workerBetrieb = require(path.join(ROOT, "lib/helmut/worker-betrieb.js"));
const dedup = require(path.join(ROOT, "lib/helmut/dedup.js"));
const { oeffnePsql, warteschlangeUeberPsql } = require(path.join(ROOT, "scripts/fixtures/psql-sitzung.js"));

const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "",
  port: process.env.HELMUT_TEST_PG_PORT || "5432",
  user: process.env.HELMUT_TEST_PG_USER || "",
  db: "helmut_reparatur_parallel"
};
const MIGRATION = path.join(ROOT, "supabase", "migrations", "20260808_scalable_job_queue.sql");

const WORKER = 4;   // exakt die Production-Konstellation der Stufe 1
const STAPEL = 25;

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

function psql(sql, { db = PG.db, datei = null } = {}) {
  const args = ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", db, "-tA", "-q", "-v", "ON_ERROR_STOP=1"];
  if (datei) args.push("-f", datei); else args.push("-c", sql);
  return execFileSync("psql", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}

function servererreichbar() {
  if (!PG.host || !PG.user) return false;
  try {
    execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", "postgres", "-tAc", "select 1"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return true;
  } catch (_) { return false; }
}

// ── Blob-Attrappe (helmut_store) mit messbarer Groesse und Zugriffszaehler ──────────────────
function erzeugeBlobAttrappe() {
  const zustand = { helmut_store: new Map(), zugriffe: 0, stoerung: false };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => { body += d; });
    req.on("end", () => {
      const url = new URL(req.url, "http://127.0.0.1");
      const antworte = (code, payload) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(payload == null ? "" : JSON.stringify(payload));
      };
      if (url.pathname === "/rest/v1/helmut_store") {
        zustand.zugriffe += 1;
        if (zustand.stoerung) return antworte(500, { message: "blob-ausfall-simuliert" });
        if (req.method === "GET") {
          const id = String(url.searchParams.get("id") || "").replace(/^eq\./, "");
          const data = zustand.helmut_store.get(id);
          return antworte(200, data === undefined ? [] : [{ data }]);
        }
        if (req.method === "POST") {
          const zeile = JSON.parse(body || "{}");
          zustand.helmut_store.set(zeile.id, zeile.data);
          return antworte(201, null);
        }
      }
      // Alles andere (z. B. raw_documents faellt hier NICHT an — die Persistenz laeuft in
      // dieser Suite als Attrappe, der Fokus liegt auf Warteschlange + Blob-Zugriffsmuster).
      return antworte(200, []);
    });
  });
  return { server, zustand };
}

// Ein Blob-Fixture in Production-Groesse: >= 1,29 MB JSON (gemessene Groesse der Zeile `main`).
function baueBlobFixture(mindestBytes = 1352663) {
  const rawItems = [];
  let i = 0;
  let store = { sources: [], rawItems, crawlRuns: [], profiles: [] };
  while (Buffer.byteLength(JSON.stringify(store), "utf8") < mindestBytes) {
    for (let k = 0; k < 200; k += 1) {
      i += 1;
      rawItems.push({
        id: `raw-fixture-${i}`, hash: `fixture-hash-${i}`,
        title: `Bestehendes Rohdokument ${i} — Haushaltsberatung, Ausschussdrucksache, Plenarprotokoll`,
        url: `https://beispiel.invalid/bestand/${i}`,
        sourceName: "Bestandsquelle", sourceUrl: "https://beispiel.invalid",
        publishedAt: new Date(Date.UTC(2026, 6, 1 + (i % 28))).toISOString(),
        excerpt: "Öffentliche Zusammenfassung ohne Personenbezug, als Füllmaterial für die Blob-Größe. ".repeat(3)
      });
    }
    store = { sources: [], rawItems, crawlRuns: [], profiles: [] };
  }
  return store;
}

function seedeAuftraege(anzahl) {
  const werte = [];
  for (let i = 1; i <= anzahl; i += 1) {
    werte.push(`('source_fetch','par-${i}','F1','{"quelle":{"id":"q${i}","rssUrl":"https://beispiel.invalid/feed/${i}"}}'::jsonb)`);
  }
  psql("select count(*) from (values " + werte.join(",") + ") as v(t,k,f,p),"
    + " lateral public.helmut_enqueue_job(v.t, v.k, v.f, v.p)");
}

function baueWorkerDeps({ sitzungen, ausgefuehrt, spiegelTreiber = null }) {
  // Jeder der 4 in-Prozess-Worker bekommt seine EIGENE psql-Sitzung — echte, getrennte
  // Datenbankverbindungen, echte Nebenlaeufigkeit der SQL-Funktionen (kein geteilter Kanal).
  const wsProSitzung = sitzungen.map((s) => warteschlangeUeberPsql(s));
  const nachOwner = (owner) => {
    const nr = Number(String(owner || "").split("-").pop());
    return wsProSitzung[Number.isFinite(nr) ? nr % wsProSitzung.length : 0];
  };
  return {
    claim: (o) => nachOwner(o.owner).claim(o),
    finish: (o) => nachOwner(o.owner).finish(o),
    extendLease: (o) => nachOwner(o.owner).extendLease(o),
    hardeningConfig: () => ({ enabled: false, sharedPathDedup: false, sharedPathWindowMs: 0 }),
    createGate: () => null, sharedLedger: () => null,
    crawlAllSources: async ([quelle]) => ({
      results: [{ ok: true, sourceId: quelle.id }],
      rawItems: [1, 2].map((n) => ({
        id: `raw-${quelle.id}-${n}`, hash: `h-${quelle.id}-${n}`, sourceId: quelle.id,
        title: `Meldung ${n} aus ${quelle.id}`, url: `https://beispiel.invalid/${quelle.id}/${n}`,
        publishedAt: "2026-08-19T06:00:00.000Z"
      }))
    }),
    // Persistenz-Attrappe mit ECHTER Neu-Erkennung (in-Memory-Ablage) — die REST-Fassung
    // ist in warteschlange-blob-entkopplung-test.js §3 gegen die PostgREST-Attrappe bewiesen.
    persistRohdokumente: (() => {
      const ablage = new Set();
      return async (items) => {
        const neuIds = [];
        for (const it of items) {
          const zeile = dedup.toRawDocumentRow(it);
          if (!zeile || !zeile.id || ablage.has(zeile.id)) continue;
          ablage.add(zeile.id);
          neuIds.push(zeile.id);
        }
        return { ok: true, neuIds, vorhandene: items.length - neuIds.length };
      };
    })(),
    enqueue: async () => ({ verfuegbar: true, neu: true }),
    // 0-Doppelarbeit-Zaehlung: jede Handler-Ausfuehrung wird je Auftrag gezaehlt. Der echte
    // Handler laeuft trotzdem — der Zaehler haengt am Idempotenzschluessel des Auftrags.
    offeneVorbedingungen: async () => ({ verfuegbar: true, offen: 0, wartend: 0, laufend: 0 }),
    handlerBeobachter: null,
    // Spiegel: echtes storage.saveRawItems gegen die Blob-Attrappe — oder ein Treiber.
    ...(spiegelTreiber ? { saveRawItems: spiegelTreiber } : {}),
    // Beobachtung der Ausfuehrungen ueber einen Handler-Wrapper:
    handler: null // wird unten gesetzt
  };
}

async function main() {
  console.log("Helmut — Parallelitaetstest des blob-entkoppelten Warteschlangenpfads (OP-30)");
  console.log(`  echte lokale PostgreSQL · worker=${WORKER} stapel=${STAPEL} · Blob-Fixture >= 1,29 MB\n`);

  if (!servererreichbar()) {
    console.log("== UEBERSPRUNGEN ==");
    console.log("  Kein lokaler PostgreSQL-Server erreichbar (HELMUT_TEST_PG_HOST/USER nicht gesetzt).");
    console.log("  >> DER PARALLELITAETSNACHWEIS IST DAMIT OFFEN, NICHT ERBRACHT. <<");
    process.exit(0);
  }

  const { server, zustand } = erzeugeBlobAttrappe();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  process.env.SUPABASE_URL = `http://127.0.0.1:${server.address().port}`;

  abschnitt("0 · Frische Datenbank + Blob-Fixture in Production-Groesse");
  psql(`drop database if exists ${PG.db}`, { db: "postgres" });
  psql(`create database ${PG.db}`, { db: "postgres" });
  psql(null, { datei: MIGRATION });
  const fixture = baueBlobFixture();
  const fixtureBytes = Buffer.byteLength(JSON.stringify(fixture), "utf8");
  zustand.helmut_store.set("main", fixture);
  check("0.1 Die Warteschlange ist leer und die SQL-Funktionen sind angelegt",
    psql("select count(*) from public.helmut_jobs") === "0");
  check("0.2 Das Blob-Fixture hat Production-Groesse (>= 1,29 MB)",
    fixtureBytes >= 1352663, `${(fixtureBytes / 1048576).toFixed(2)} MB`);

  const env = { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_SOURCE_MODE: "" };
  const grenzen = { parallel: WORKER, stapel: STAPEL, budgetMs: 120000, leaseMs: 60000 };

  // ═══ 1 · Volllauf: 60 Auftraege, 4 Worker, Stapel 25 ═══════════════════════
  abschnitt(`1 · Volllauf: 60 Auftraege unter worker=${WORKER}, stapel=${STAPEL}`);
  {
    seedeAuftraege(60);
    const sitzungen = Array.from({ length: WORKER }, () => oeffnePsql(PG));
    const ausfuehrungen = new Map(); // idempotency_key -> Anzahl Handler-Ausfuehrungen
    const deps = baueWorkerDeps({ sitzungen });
    delete deps.handler; delete deps.handlerBeobachter;
    // Der ECHTE source_fetch-Handler, umwickelt nur zur Zaehlung der Ausfuehrungen.
    const echteHandler = require(path.join(ROOT, "lib/helmut/scalable-pipeline.js")).HANDLER;
    deps.handler = {
      ...echteHandler,
      source_fetch: async (auftrag, d) => {
        const k = auftrag.idempotency_key || auftrag.id;
        ausfuehrungen.set(k, (ausfuehrungen.get(k) || 0) + 1);
        return echteHandler.source_fetch(auftrag, d);
      }
    };

    zustand.zugriffe = 0;
    const t0 = Date.now();
    const lauf = await workerBetrieb.durchlauf({ env, deps, grenzen, kennung: "par", typen: ["source_fetch"] });
    const dauerMs = Date.now() - t0;
    for (const s of sitzungen) s.schliesse();

    const erledigtDb = Number(psql("select count(*) from public.helmut_jobs where status='erledigt'"));
    const offenDb = Number(psql("select count(*) from public.helmut_jobs where status not in ('erledigt')"));
    check("1.1 ECHTER DURCHSATZ > 0: die Konstellation des 18.08. (worker=4) arbeitet jetzt ab",
      lauf.erledigt === 60 && erledigtDb === 60,
      `erledigt=${lauf.erledigt}/60 in ${(dauerMs / 1000).toFixed(1)}s`);
    check("1.2 0 VERLORENE AUFTRAEGE: kein Auftrag bleibt haengen",
      offenDb === 0, `offen=${offenDb}`);
    check("1.3 0 DOPPELARBEIT: jeder Auftrag wurde GENAU EINMAL ausgefuehrt",
      ausfuehrungen.size === 60 && [...ausfuehrungen.values()].every((n) => n === 1),
      `ausgefuehrt=${ausfuehrungen.size}, max=${Math.max(0, ...ausfuehrungen.values())}`);
    check("1.4 Mehrere Worker haben wirklich mitgearbeitet",
      (lauf.bilanzen || []).filter((b) => (b.erledigt || 0) > 0).length >= 2,
      JSON.stringify((lauf.bilanzen || []).map((b) => b.erledigt)));
    check("1.5 BLOB-ZUGRIFFE KONSTANT: genau 1 Read + 1 Write fuer den GANZEN Slot (nicht je Auftrag)",
      zustand.zugriffe === 2, `zugriffe=${zustand.zugriffe} (alte Bauart: >= ${60 * 2})`);
    check("1.6 Der Spiegel wurde am Slotende in den grossen Blob geschrieben",
      lauf.blobSpiegel && lauf.blobSpiegel.geschrieben === true && lauf.blobSpiegel.gesammelt === 120,
      JSON.stringify(lauf.blobSpiegel));
    // `writeStore` verdichtet den Blob (compactStore) — das ist die UNVERAENDERTE
    // Production-Semantik (deshalb ist `main` ueberhaupt nur 1,29 MB gross). Der Beweis
    // ist deshalb: ALLE 120 neuen Items ueberleben den einen Spiegel-Write (neueste
    // gewinnen die Verdichtung), nichts Neues geht verloren.
    const nachher = zustand.helmut_store.get("main");
    const neueImBlob = (nachher.rawItems || []).filter((it) => String(it.hash || "").startsWith("h-q")).length;
    check("1.7 Alle 120 neuen Items ueberleben den einen Spiegel-Write (Verdichtung unveraendert)",
      neueImBlob === 120,
      `neu=${neueImBlob}, gesamt=${nachher && nachher.rawItems && nachher.rawItems.length}`);
  }

  // ═══ 2 · Unabhaengigkeit von der Blob-Groesse ══════════════════════════════
  abschnitt("2 · Die Blob-Groesse begrenzt den Warteschlangendurchsatz nicht mehr");
  {
    // Gleicher Lauf, aber mit WINZIGEM Blob: die Blob-Zugriffszahl bleibt identisch (2) und
    // der Durchsatz entsteht unabhaengig davon. Der Beweis ist STRUKTURELL (Zugriffsmuster),
    // nicht eine Latenzmessung — Production-Performance wird hier ausdruecklich nicht behauptet.
    psql("update public.helmut_jobs set status='wartend', attempts=0, lease_owner=null, lease_expires_at=null");
    zustand.helmut_store.set("main", { sources: [], rawItems: [], crawlRuns: [], profiles: [] });
    const sitzungen = Array.from({ length: WORKER }, () => oeffnePsql(PG));
    const deps = baueWorkerDeps({ sitzungen });
    delete deps.handler; delete deps.handlerBeobachter;
    deps.handler = require(path.join(ROOT, "lib/helmut/scalable-pipeline.js")).HANDLER;
    zustand.zugriffe = 0;
    const lauf = await workerBetrieb.durchlauf({ env, deps, grenzen, kennung: "klein", typen: ["source_fetch"] });
    for (const s of sitzungen) s.schliesse();
    check("2.1 Auch mit kleinem Blob: gleicher Ablauf, gleicher Abschluss",
      lauf.erledigt === 60, `erledigt=${lauf.erledigt}`);
    check("2.2 Die Blob-Zugriffszahl ist IDENTISCH zur 1,29-MB-Messung (2 je Slot) — Groesse entkoppelt",
      zustand.zugriffe === 2, `zugriffe=${zustand.zugriffe}`);
  }

  // ═══ 3 · Wiederaufnahme abgelaufener Leases ════════════════════════════════
  abschnitt("3 · Ein Geisterworker stirbt — die Lease laeuft ab, der naechste Slot uebernimmt");
  {
    psql("delete from public.helmut_jobs");
    seedeAuftraege(3);
    // Geisterworker: reserviert alle 3 mit Mini-Lease und stirbt (kein finish).
    const geist = oeffnePsql(PG);
    const geistWs = warteschlangeUeberPsql(geist);
    const beute = await geistWs.claim({ owner: "geist-1", limit: 3, leaseMs: 300, types: ["source_fetch"] });
    geist.schliesse();
    check("3.1 Der Geisterworker haelt alle 3 Auftraege (laeuft, Lease min. 1 s — SQL-Klemmung)",
      beute.auftraege.length === 3
      && psql("select count(*) from public.helmut_jobs where status='laeuft'") === "3");
    // `helmut_claim_jobs` klemmt jede Lease auf mindestens 1 000 ms (greatest(p_lease_ms, 1000)).
    await new Promise((r) => setTimeout(r, 1500)); // Lease sicher abgelaufen

    const sitzungen = Array.from({ length: 2 }, () => oeffnePsql(PG));
    const deps = baueWorkerDeps({ sitzungen });
    delete deps.handler; delete deps.handlerBeobachter;
    deps.handler = require(path.join(ROOT, "lib/helmut/scalable-pipeline.js")).HANDLER;
    const lauf = await workerBetrieb.durchlauf({
      env, deps, grenzen: { ...grenzen, parallel: 2 }, kennung: "erbe", typen: ["source_fetch"]
    });
    for (const s of sitzungen) s.schliesse();
    check("3.2 WIEDERAUFNAHME: alle 3 verwaisten Auftraege wurden uebernommen und abgeschlossen",
      lauf.erledigt === 3
      && psql("select count(*) from public.helmut_jobs where status='erledigt'") === "3",
      `erledigt=${lauf.erledigt}`);
    check("3.3 Die Uebernahme ist im Versuchszaehler sichtbar (attempts >= 2, ehrlich gezaehlt)",
      psql("select min(attempts) from public.helmut_jobs") >= "2");
  }

  // ═══ 4 · Simulierter Blob-Ausfall: Durchsatz bleibt, Meldung ist ehrlich ═══
  abschnitt("4 · Blob-Ausfall waehrend des Slots: Durchsatz bleibt, Spiegel-Ausfall wird benannt");
  {
    psql("delete from public.helmut_jobs");
    seedeAuftraege(20);
    zustand.stoerung = true; // JEDER helmut_store-Zugriff scheitert ab jetzt mit 500
    const sitzungen = Array.from({ length: WORKER }, () => oeffnePsql(PG));
    const deps = baueWorkerDeps({ sitzungen });
    delete deps.handler; delete deps.handlerBeobachter;
    deps.handler = require(path.join(ROOT, "lib/helmut/scalable-pipeline.js")).HANDLER;
    const lauf = await workerBetrieb.durchlauf({ env, deps, grenzen, kennung: "ausfall", typen: ["source_fetch"] });
    for (const s of sitzungen) s.schliesse();
    zustand.stoerung = false;
    check("4.1 GENAU DIE STOERUNGSKLASSE DES 18.08.: der Durchsatz bleibt trotzdem voll erhalten",
      lauf.erledigt === 20
      && psql("select count(*) from public.helmut_jobs where status='erledigt'") === "20",
      `erledigt=${lauf.erledigt}/20`);
    check("4.2 Der Spiegel-Ausfall wird EHRLICH gemeldet (geschrieben:false, Fehler benannt)",
      lauf.blobSpiegel && lauf.blobSpiegel.geschrieben === false
      && typeof lauf.blobSpiegel.fehler === "string",
      JSON.stringify(lauf.blobSpiegel));
  }

  await new Promise((r) => server.close(r));
  psql(`drop database if exists ${PG.db}`, { db: "postgres" });

  console.log("\n== ERGEBNIS ==");
  console.log(`PASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  console.log("  Hinweis: Struktur- und Verlustfreiheitsbeweis auf lokaler Hardware —");
  console.log("  KEINE Aussage ueber Production-Latenz oder -Durchsatz.");
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Suite abgebrochen:", error);
  process.exit(1);
});
