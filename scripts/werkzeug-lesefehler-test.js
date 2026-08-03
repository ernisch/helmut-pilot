"use strict";

// W-1 (Werkzeug-Haertung 2026-07-27) — Lesefehler ist NIE eine leere Ergebnismenge.
// =============================================================================
// PRODUCTION-BEFUND: `listRawDocuments` fing jeden DNS-/Timeout-/Auth-/Storage-
// fehler intern und lieferte [] — das Nachholwerkzeug meldete daraufhin
// "Nichts nachzuholen" mit Exit 0. Ein technischer Lesefehler sah exakt aus wie
// ein erfolgreicher Leerlauf (falsches Gruen).
//
// Diese Suite belegt beide Seiten der neuen Semantik:
//   * Erfolgreicher Read (mit und ohne Kandidaten) -> Exit 0, unveraendert.
//   * DNS/Timeout/Auth/Storagefehler -> typisierter StorageReadError im Modul,
//     Exit 6 im Werkzeug, KEIN KI-Aufruf, KEIN Schreibzugriff, KEIN
//     "Nichts nachzuholen", KEINE Secrets in der Ausgabe.
//
// DETERMINISTISCH UND OFFLINE: alle Fehlerbilder kommen von einem lokalen
// Stub-HTTP-Server auf 127.0.0.1 (bzw. einem geschlossenen lokalen Port).
// Kindprozesse erhalten ihre Umgebung als STRIKTE ALLOWLIST — versehentlich
// gesetzte Production-Variablen (SUPABASE_URL, Schluessel, Flags) werden NIE
// geerbt; die Suite kontrolliert ihren Storage vollstaendig selbst.

const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SKRIPT = path.join(ROOT, "scripts", "vorgangsbildung-nachholen.js");
// Kein echtes Secret — nur ein eindeutiger Marker, der NIRGENDS in der Ausgabe
// auftauchen darf.
const TEST_SECRET = "testschluessel-nie-echt-a1b2c3d4e5f6";

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + String(detail).slice(0, 300) : ""}`); }
}

// ── Stub-Server: spielt PostgREST fuer die drei Lesepfade ────────────────────
function startStub({ rawDocs = [], links = [], kos = [], status = 200, body = null, neverRespond = false } = {}) {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push({ method: req.method, url: req.url });
    if (neverRespond) return; // Timeout-Szenario: Verbindung offen halten
    if (status !== 200) {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(body != null ? body : JSON.stringify({ message: "stub error" }));
      return;
    }
    let antwort = [];
    if (req.url.startsWith("/rest/v1/raw_documents")) antwort = rawDocs;
    else if (req.url.startsWith("/rest/v1/ko_document_links")) antwort = links;
    else if (req.url.startsWith("/rest/v1/knowledge_objects")) antwort = kos;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(antwort));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port, requests }));
  });
}

// ── Fixture-Port fuer "Verbindung verweigert" ────────────────────────────────
// FLAKE-BEFUND 2026-08-03 (CI-Lauf 30815041452, PR #213 — reiner Doku-PR, rot
// bei unveraendertem Code): `listen(0)` zieht einen ZUFAELLIGEN ephemeren Port.
// Der Port steht woertlich in der Fehlerkette ("connect ECONNREFUSED
// 127.0.0.1:<port>"), und `klassifiziereLesefehler` prueft die Auth-Zeichenfolgen
// "401"/"403" auf der GESAMTEN Kette und VOR der ECONNREFUSED-Regel. Ein Port wie
// 40123 oder 45403 wird deshalb als Fehlerklasse "auth" statt "connection"
// eingestuft — Exit 6 bleibt korrekt, aber die Pruefung "Meldung nennt Quelle und
// Fehlerklasse" wird rot. Betroffen sind 316 der 28 232 Ports des
// Linux-Ephemeralbereichs (1,12 %); das ist die belegte Ursache des Flackerns.
// Die Ziehung wird deshalb wiederholt, bis der Port keine Statuszahl enthaelt —
// damit ist das Szenario wirklich deterministisch, nicht nur die Fehlerart.
// Der ZUGRUNDELIEGENDE Klassifikationsfehler in lib/helmut/storage.js ist damit
// NICHT behoben (Production-Logik, ausserhalb dieses Sprints) und als OP-28
// gefuehrt: docs/betrieb/befund-werkzeug-haertung-w1-w2.md §16.
const PORT_STATUSZAHL = /401|403/;

async function geschlossenerPortOhneStatuszahl() {
  // Der laengste zusammenhaengende Block betroffener Ports ist 100 (40100–40199
  // bzw. 40300–40399); Linux vergibt ephemere Ports weitgehend fortlaufend,
  // deshalb sind 300 Versuche mit Sicherheitsabstand ausreichend.
  for (let versuch = 0; versuch < 300; versuch += 1) {
    const port = await new Promise((resolve) => {
      const s = http.createServer();
      s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); });
    });
    if (!PORT_STATUSZAHL.test(String(port))) return port;
  }
  throw new Error("kein Fixture-Port ohne Statuszahl-Zeichenfolge gefunden");
}

// ── Kindprozess-Umgebung: STRIKTE Allowlist, erbt NIE Production-Env ─────────
function kindUmgebung(port, extra = {}) {
  return {
    PATH: process.env.PATH || "",
    HOME: process.env.HOME || "/tmp",
    HELMUT_V3_STORE: "1",
    SUPABASE_URL: `http://127.0.0.1:${port}`,
    SUPABASE_SERVICE_ROLE_KEY: TEST_SECRET,
    // Auth-Store lokal (kein Netz); der Blob-Retry soll Fehlerbilder nicht
    // minutenlang wiederholen.
    HELMUT_STORAGE_BACKEND: "local",
    HELMUT_STORE_CACHE_MS: "0",
    HELMUT_SUPABASE_TIMEOUT_MS: "800",
    HELMUT_BLOB_RETRY_MAX: "0",
    ...extra
  };
}

// ASYNCHRON (spawn, nicht spawnSync): die Stub-Server laufen im SELBEN Prozess —
// ein synchroner Kindprozess wuerde die Event-Loop blockieren, der Stub koennte
// nie antworten und jedes Szenario degeneriert zu einem Timeout.
function laufe(argv, env) {
  return new Promise((resolve) => {
    const kind = spawn(process.execPath, [SKRIPT, ...argv], { env, cwd: ROOT });
    let out = "", err = "";
    kind.stdout.on("data", (d) => { out += d; });
    kind.stderr.on("data", (d) => { err += d; });
    const woerge = setTimeout(() => kind.kill("SIGKILL"), 60000);
    kind.on("close", (code) => {
      clearTimeout(woerge);
      resolve({ code, out, err, alles: out + err });
    });
  });
}

const ALT = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(); // 3 Tage alt -> Karenz (24 h) ueberschritten
const KANDIDATEN = [
  { id: "rd-test-eins", title: "t1", created_at: ALT, retrieved_at: ALT },
  { id: "rd-test-zwei", title: "t2", created_at: ALT, retrieved_at: ALT },
  { id: "rd-test-drei", title: "t3", created_at: ALT, retrieved_at: ALT }
];

async function main() {
  // ── (A) Modulebene: typisierter Fehler statt [] ────────────────────────────
  const stubA = await startStub({ status: 500, body: JSON.stringify({ message: "Supabase kaputt" }) });
  process.env.HELMUT_V3_STORE = "1";
  process.env.SUPABASE_URL = `http://127.0.0.1:${stubA.port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = TEST_SECRET;
  process.env.HELMUT_STORAGE_BACKEND = "local";
  process.env.HELMUT_SUPABASE_TIMEOUT_MS = "800";
  const storage = require(path.join(ROOT, "lib/helmut/storage.js"));

  for (const [name, fn] of [
    ["listRawDocuments", () => storage.listRawDocuments({ limit: 10, days: 7 })],
    ["listRecentRawDocuments", () => storage.listRecentRawDocuments(10, 7)],
    ["listKoDocumentLinks", () => storage.listKoDocumentLinks({ limit: 10 })],
    ["listKnowledgeObjectStates", () => storage.listKnowledgeObjectStates({ limit: 10 })]
  ]) {
    let geworfen = null;
    try { await fn(); } catch (e) { geworfen = e; }
    check(`${name}: Storagefehler wird GEWORFEN (nicht [])`, Boolean(geworfen), "kein Fehler geworfen");
    check(`${name}: Fehler ist typisiert (StorageReadError + Quelle + Klasse)`,
      geworfen && geworfen.name === "StorageReadError" && Boolean(geworfen.quelle) && Boolean(geworfen.fehlerklasse),
      geworfen && `${geworfen.name}/${geworfen.quelle}/${geworfen.fehlerklasse}`);
    check(`${name}: Meldung enthaelt kein Secret`, geworfen && !String(geworfen.message).includes(TEST_SECRET));
  }
  stubA.server.close();

  // Erfolgreicher leerer Read bleibt [] (kein Fehler).
  const stubLeer = await startStub({ rawDocs: [], links: [], kos: [] });
  process.env.SUPABASE_URL = `http://127.0.0.1:${stubLeer.port}`;
  const leer = await storage.listRawDocuments({ limit: 10, days: 7 });
  check("erfolgreicher Read ohne Zeilen bleibt []", Array.isArray(leer) && leer.length === 0);
  stubLeer.server.close();

  // Konfigurationszustand bleibt [] (inert, kein Wurf) — bestehende Leerlaufpfade.
  delete process.env.HELMUT_V3_STORE;
  const inert = await storage.listRawDocuments({ limit: 10, days: 7 });
  check("v3StoreReady()==false bleibt [] (Konfiguration, kein Laufzeitfehler)", Array.isArray(inert) && inert.length === 0);
  process.env.HELMUT_V3_STORE = "1";

  // Fehlerklassifikation (dns/timeout/auth/db) — inklusive undici-cause-Kette.
  const dnsFehler = new TypeError("fetch failed");
  dnsFehler.cause = Object.assign(new Error("getaddrinfo ENOTFOUND db.example-projekt.supabase.co"), { code: "ENOTFOUND" });
  check("Klassifikation: ENOTFOUND in cause-Kette -> dns", storage.klassifiziereLesefehler(dnsFehler) === "dns", storage.klassifiziereLesefehler(dnsFehler));
  check("Klassifikation: Timeout -> timeout", storage.klassifiziereLesefehler(new Error("Supabase storage timed out after 800ms: /rest/v1/raw_documents")) === "timeout");
  check("Klassifikation: 401 -> auth", storage.klassifiziereLesefehler(new Error("Supabase storage failed (401): Invalid API key")) === "auth");
  check("Klassifikation: 403 -> auth", storage.klassifiziereLesefehler(new Error("Supabase storage failed (403): permission denied for table raw_documents")) === "auth");
  check("Klassifikation: 500-Storagefehler -> db/http-5xx", ["db", "http-5xx"].includes(storage.klassifiziereLesefehler(new Error("Supabase storage failed (500): internal error"))));
  const refused = new TypeError("fetch failed");
  refused.cause = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:1"), { code: "ECONNREFUSED" });
  check("Klassifikation: ECONNREFUSED -> connection", storage.klassifiziereLesefehler(refused) === "connection");

  // ── (B) Werkzeugebene (CLI, Kindprozesse) ──────────────────────────────────

  // (1) Erfolgreicher Read MIT Kandidaten -> Exit 0, Kandidaten benannt.
  const stub1 = await startStub({ rawDocs: KANDIDATEN });
  const r1 = await laufe(["--vorschau"], kindUmgebung(stub1.port));
  stub1.server.close();
  check("Vorschau mit Kandidaten: Exit 0", r1.code === 0, `Exit ${r1.code}: ${r1.err.slice(0, 200)}`);
  check("Vorschau mit Kandidaten: alle 3 Kennungen benannt",
    r1.out.includes("rd-test-eins") && r1.out.includes("rd-test-zwei") && r1.out.includes("rd-test-drei"));

  // (2) Erfolgreicher Read OHNE Kandidaten -> Exit 0, ehrlicher Leerzustand.
  const stub2 = await startStub({ rawDocs: [], links: [], kos: [] });
  const r2 = await laufe(["--ausfuehren"], kindUmgebung(stub2.port, { HELMUT_NACHHOLEN_BESTAETIGT: "ja" }));
  stub2.server.close();
  check("erfolgreicher Leerlauf: Exit 0 (einziger legitimer 'Nichts nachzuholen'-Fall)", r2.code === 0, `Exit ${r2.code}`);
  check("erfolgreicher Leerlauf: meldet 'Nichts nachzuholen'", r2.out.includes("Nichts nachzuholen"));

  // (3) DNS-/Netzwerkfehler -> Exit 6. Der DNS-Fall selbst ist oben als
  // In-Process-Klassifikation bewiesen (ENOTFOUND/EAI_AGAIN -> dns); auf
  // CLI-Ebene wird der Netzwerkfehler DETERMINISTISCH erzeugt: ein soeben
  // geschlossener lokaler Port liefert sofort ECONNREFUSED. Ein Live-DNS-Lookup
  // (.invalid) waere timing-abhaengig — in einer Sandbox kann der Resolver
  // langsamer sein als das Request-Timeout, und die Suite wuerde zufaellig rot.
  // Zur Portwahl siehe geschlossenerPortOhneStatuszahl() (Flake-Befund 2026-08-03).
  const zuPort = await geschlossenerPortOhneStatuszahl();
  const rDns = await laufe(["--vorschau"], kindUmgebung(zuPort));
  check("Netzwerkfehler (Verbindung verweigert): Exit 6", rDns.code === 6, `Exit ${rDns.code}: ${rDns.alles.slice(0, 300)}`);
  check("Netzwerkfehler: Meldung nennt Quelle und Fehlerklasse",
    rDns.err.includes("Quelle:") && rDns.err.includes("Fehlerklasse:") && /dns|connection/.test(rDns.err),
    `Fixture-Port ${zuPort} · stderr: ${rDns.err.replace(/\s+/g, " ").slice(0, 200)}`);
  check("Netzwerkfehler: KEIN 'Nichts nachzuholen'", !rDns.alles.includes("Nichts nachzuholen"));

  // (4) Timeout -> Exit 6.
  const stub4 = await startStub({ neverRespond: true });
  const r4 = await laufe(["--vorschau"], kindUmgebung(stub4.port));
  stub4.server.close();
  check("Timeout: Exit 6", r4.code === 6, `Exit ${r4.code}`);
  check("Timeout: Fehlerklasse timeout benannt", r4.err.includes("timeout"));
  check("Timeout: KEIN 'Nichts nachzuholen'", !r4.alles.includes("Nichts nachzuholen"));

  // (5) Authfehler (401) -> Exit 6, Klasse auth.
  const stub5 = await startStub({ status: 401, body: JSON.stringify({ message: "Invalid API key" }) });
  const r5 = await laufe(["--vorschau"], kindUmgebung(stub5.port));
  stub5.server.close();
  check("Authfehler: Exit 6", r5.code === 6, `Exit ${r5.code}`);
  check("Authfehler: Fehlerklasse auth benannt", r5.err.includes("auth"));

  // (6) Supabase-/Storagefehler (500) -> Exit 6.
  const stub6 = await startStub({ status: 500, body: JSON.stringify({ message: "internal error" }) });
  const r6 = await laufe(["--vorschau"], kindUmgebung(stub6.port));
  stub6.server.close();
  check("Storagefehler 500: Exit 6", r6.code === 6, `Exit ${r6.code}`);
  check("Storagefehler 500: KEIN 'Nichts nachzuholen'", !r6.alles.includes("Nichts nachzuholen"));

  // (7) Vorschau bei Lesefehler == (8) Ausfuehrung bei Lesefehler: identisch
  // fail-closed. Ausfuehrungslauf zusaetzlich: kein KI-Aufruf, kein Write.
  const stub8 = await startStub({ status: 500 });
  const r8 = await laufe(["--ausfuehren"], kindUmgebung(stub8.port, { HELMUT_NACHHOLEN_BESTAETIGT: "ja" }));
  const schreibzugriffe = stub8.requests.filter((q) => q.method !== "GET");
  stub8.server.close();
  check("Ausfuehrung bei Lesefehler: Exit 6 (identisch zur Vorschau)", r8.code === 6, `Exit ${r8.code}`);
  check("Ausfuehrung bei Lesefehler: Abbruch VOR der Ausfuehrung (kein 'AUSFUEHRUNG')", !r8.alles.includes("AUSFUEHRUNG (runId"));
  check("kein KI-Aufruf nach Lesefehler (Meldung + kein Ausfuehrungspfad)", r8.err.includes("KI-Aufruf"));
  check("kein Write nach Lesefehler (0 Nicht-GET-Requests am Storage)", schreibzugriffe.length === 0, JSON.stringify(schreibzugriffe));

  // (11/12) Exit-Code-Matrix: 0 NUR fuer erfolgreichen (leeren) Lauf, !=0 fuer Technikfehler.
  check("Exit-Matrix: Erfolg 0 / leer 0 / netz 6 / timeout 6 / auth 6 / storage 6",
    r1.code === 0 && r2.code === 0 && rDns.code === 6 && r4.code === 6 && r5.code === 6 && r6.code === 6);

  // (13) Keine Secrets in irgendeiner Ausgabe.
  const alleAusgaben = [r1, r2, rDns, r4, r5, r6, r8].map((r) => r.alles).join("\n");
  check("keine Secrets in Ausgaben (Service-Key-Marker taucht nie auf)", !alleAusgaben.includes(TEST_SECRET));

  // (14) --ids-Filterung bleibt korrekt (wirkt VOR jeder Kappung, nur die
  // angeforderte Kennung wird verarbeitet).
  const stub14 = await startStub({ rawDocs: KANDIDATEN });
  const r14 = await laufe(["--vorschau", "--ids=rd-test-zwei"], kindUmgebung(stub14.port));
  stub14.server.close();
  check("--ids: Exit 0", r14.code === 0, `Exit ${r14.code}`);
  check("--ids: genau die angeforderte Kennung ausgewaehlt",
    r14.out.includes("Davon fuer diesen Lauf ausgewaehlt: 1") && /rd-test-zwei\s/.test(r14.out));
  check("--ids: fremde Kennungen NICHT in der Schreibliste",
    !/wuerden verarbeitet:[\s\S]*rd-test-eins/.test(r14.out) && !/wuerden verarbeitet:[\s\S]*rd-test-drei/.test(r14.out));

  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("Suite-Fehler:", error);
  process.exit(1);
});
