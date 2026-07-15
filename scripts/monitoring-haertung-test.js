"use strict";

// Monitoring-Haertung (2026-07): Budget-Ehrlichkeit + Waechter-Haertung.
// KEIN Netz — der OpenAI-Transport (https.request) wird prozesslokal gefakt
// (Muster: budget-rollout-test.js), alles andere (Gate, Reservierung, Usage-Log,
// Health-Report, Debug-Route) laeuft ECHT ueber den lokalen Datei-Store. Beweist:
//   A) parliamentAssessment: Pre-Gate + ehrlicher Budget-Fallback (statt
//      "aiEnabled:true"-Maskierung) — beide Ablehnungswege (Pre-Gate und
//      Choke-Point-Reservierung).
//   B) extractKnowledgeObjectTags reicht LLM_BUDGET_EXHAUSTED durch (kein null).
//   C) KO-Backfill stoppt bei erschoepftem GLOBALEN Tagesbudget kontrolliert
//      (stop="daily-llm-budget", nicht failed) — auch mit bypassBudget.
//   D) buildHealthReport: Budget-Zeile, Crawl-Laufzeit-Zeile, Fehler-Spike-Gate,
//      Zu-tun-Empfehlung bei ueberfaelligen Crons, dryRun ohne State-Write.
//   E) /api/debug/reset-llm-budget: setzt lokal auch den In-Prozess-
//      Reservierungszaehler zurueck, antwortet ehrlich, schreibt Audit.
//   F) Struktur: scheduler persistiert durationMs; health-watch.yml (Waechter-
//      Waechter) korrekt verdrahtet; Config-Diagnose nennt Schutzlimit 50.

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { EventEmitter } = require("events");
const root = path.join(__dirname, "..");

// Sauberer, lokaler Ausgangszustand (kein Supabase, kein Account-Gate, Fake-KI).
delete process.env.HELMUT_STORAGE_BACKEND;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED;
delete process.env.HELMUT_LLM_RESERVE_UNDERSTANDING;
delete process.env.AZURE_OPENAI_KEY;
delete process.env.AZURE_OPENAI_ENDPOINT;
delete process.env.HELMUT_AUTH_MODE;
process.env.OPENAI_API_KEY = "test-only-key-niemals-echt";
process.env.HELMUT_ADMIN_SECRET = "test-debug-secret-niemals-echt";
process.env.HELMUT_STORE_CACHE_MS = "0";

// Hermetik: ALLE beruehrten Store-Dateien sichern; neue Dateien wieder loeschen.
const dataDir = path.join(root, ".helmut-data");
const snapshots = new Map();
if (fs.existsSync(dataDir)) {
  for (const name of fs.readdirSync(dataDir).filter((f) => f.endsWith(".json"))) {
    snapshots.set(name, fs.readFileSync(path.join(dataDir, name)));
  }
}
const envSnapshot = { limit: process.env.HELMUT_MAX_LLM_CALLS_PER_DAY };
process.on("exit", () => {
  try {
    if (fs.existsSync(dataDir)) {
      for (const name of fs.readdirSync(dataDir).filter((f) => f.endsWith(".json"))) {
        if (!snapshots.has(name)) fs.rmSync(path.join(dataDir, name), { force: true });
      }
    }
    for (const [name, content] of snapshots.entries()) fs.writeFileSync(path.join(dataDir, name), content);
  } catch (_) { /* Hygiene */ }
});

// ── Fake-OpenAI-Transport: NUR api.openai.com wird gefakt, alles andere echt ──
const realHttpsRequest = https.request.bind(https);
let fakeAiCalls = 0;
https.request = function fakeRequest(url, options, callback) {
  const target = String(url || "");
  if (!target.includes("api.openai.com")) return realHttpsRequest(url, options, callback);
  fakeAiCalls += 1;
  const req = new EventEmitter();
  req.write = () => {};
  req.destroy = () => {};
  req.end = () => {
    const res = new EventEmitter();
    res.statusCode = 200;
    res.setEncoding = () => {};
    setImmediate(() => {
      callback(res);
      res.emit("data", JSON.stringify({
        output_text: JSON.stringify({
          whyRelevant: "Betrifft dein Fachgebiet Arbeit direkt.",
          recommendedAction: "Kleine Anfrage vorbereiten.",
          tags: ["Mindestlohn"]
        }),
        usage: { input_tokens: 10, output_tokens: 12 }
      }));
      res.emit("end");
    });
  };
  return req;
};

const storage = require("../lib/helmut/storage");
const ai = require("../lib/helmut/ai");
const accounts = require("../lib/helmut/accounts");
const { runKoEnrichmentBackfill } = require("../lib/helmut/ko-enrichment");
const serverHandler = require("../server");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}
const settle = (ms = 120) => new Promise((r) => setTimeout(r, ms));

async function resetUsage() {
  const store = await storage.readAuthStore();
  store.llmUsage = [];
  await storage.writeAuthStore(store);
  // Reservierungszaehler = eigene konservative Wahrheitsquelle; Testphasen-
  // Wechsel simuliert einen Prozessneustart (wie budget-rollout-test.js).
  storage.__resetLlmReservationForTests();
}
// Nur das Log leeren, den In-Prozess-Reservierungszaehler BEWUSST stehen lassen —
// simuliert den Zustand "Pre-Gate offen, Choke-Point-Reservierung erschoepft".
async function clearLogKeepReservation() {
  const store = await storage.readAuthStore();
  store.llmUsage = [];
  await storage.writeAuthStore(store);
}

const profile = { id: "mon-test", fullName: "Monitoring Test" };
const item = { type: "Kleine Anfrage", title: "Testdrucksache Mindestlohn", urheber: ["Fraktion X"], date: "2026-07-01" };
const assess = () => ai.assessParliamentaryItem({ item, profile });

function httpRequest(server, { method = "GET", pathname, headers = {} }) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: pathname, headers, timeout: 20000 }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    req.on("error", reject);
    req.end();
  });
}

(async () => {
  // ── A) parliamentAssessment: Budget-Ehrlichkeit ─────────────────────────────
  console.log("== A) parliamentAssessment: Pre-Gate + ehrlicher Budget-Fallback ==");
  process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "2";
  await resetUsage();

  const a1 = await assess(); await settle();
  check("A1 vor Limit: echte KI-Einordnung (aiEnabled=true)", a1.aiEnabled === true && /Fachgebiet/.test(a1.whyRelevant), JSON.stringify(a1).slice(0, 160));

  // Limit ausschoepfen (2. Call), dann greift das Pre-Gate.
  await assess(); await settle();
  const a2 = await assess(); await settle();
  check("A2 Pre-Gate: Budget erschoepft -> ehrlicher Regel-Fallback (aiEnabled=false, budget-erschoepft)",
    a2.aiEnabled === false && a2.degraded === true && a2.fallbackReason === "budget-erschoepft"
    && typeof a2.whyRelevant === "string" && typeof a2.recommendedAction === "string", JSON.stringify(a2).slice(0, 220));
  const skipsA = (await storage.getLlmUsage(null, 50)).filter((e) => e.callType === "skipped-parliamentAssessment");
  check("A3 Skip-Log: skipped-parliamentAssessment protokolliert (zaehlt nicht als billable)", skipsA.length >= 1, `skips=${skipsA.length}`);
  check("A4 kein KI-Call ueber dem Limit (Transportzaehler)", fakeAiCalls === 2, `fakeAiCalls=${fakeAiCalls}`);

  // Choke-Point-Pfad: Pre-Gate offen (Log geleert), Reservierung erschoepft.
  await clearLogKeepReservation();
  const a5 = await assess(); await settle();
  check("A5 Choke-Point: LLM_BUDGET_EXHAUSTED wird NICHT als KI-Erfolg maskiert (vorher aiEnabled:true)",
    a5.aiEnabled === false && a5.fallbackReason === "budget-erschoepft" && a5.degraded === true, JSON.stringify(a5).slice(0, 220));

  // ── B) extractKnowledgeObjectTags reicht den Budget-Stopp durch ─────────────
  console.log("== B) extractKnowledgeObjectTags: Budget-Stopp wird durchgereicht ==");
  const ko = { id: "ko-1", headline: "Reform des Mindestlohns", was_ist_passiert: "Die Kommission empfiehlt eine Erhoehung.", warum_wichtig: "Betrifft Millionen." };
  let thrown = null;
  try { await ai.extractKnowledgeObjectTags(ko); } catch (e) { thrown = e; }
  check("B1 wirft LLM_BUDGET_EXHAUSTED statt null (Backfill kann kontrolliert stoppen)",
    Boolean(thrown) && thrown.code === "LLM_BUDGET_EXHAUSTED", thrown ? thrown.code : "kein Fehler");

  // ── C) KO-Backfill: kontrollierter Stopp statt failed-Zaehlung ──────────────
  console.log("== C) KO-Backfill: stop=daily-llm-budget statt failed ==");
  const koComplete = (id) => ({ id, understanding_status: "complete", headline: "Mindestlohn", was_ist_passiert: "x", warum_wichtig: "y", tags: [] });
  const budgetErr = () => { const e = new Error("llm-budget-erschoepft"); e.code = "LLM_BUDGET_EXHAUSTED"; return e; };
  {
    const saved = [];
    const r = await runKoEnrichmentBackfill({ execute: true }, {
      listKnowledgeObjects: async () => [koComplete("a"), koComplete("b"), koComplete("c")],
      canSpend: async () => ({ allowed: true }),
      extractTags: async () => { throw budgetErr(); },
      derivePolicyFields: () => [],
      saveEnrichment: async (id, patch) => { saved.push({ id, patch }); }
    });
    check("C1 Budget-Stopp: stop='daily-llm-budget', KEIN failed, KEIN Write",
      r.stop === "daily-llm-budget" && r.failed === 0 && r.processed === 0 && saved.length === 0, JSON.stringify(r));
  }
  {
    const r = await runKoEnrichmentBackfill({ execute: true, bypassBudget: true }, {
      listKnowledgeObjects: async () => [koComplete("a")],
      canSpend: async () => { throw new Error("darf nicht aufgerufen werden"); },
      extractTags: async () => { throw budgetErr(); },
      derivePolicyFields: () => [],
      saveEnrichment: async () => {}
    });
    check("C2 bypassBudget umgeht den GLOBALEN Deckel NICHT (Stopp bleibt)", r.stop === "daily-llm-budget" && r.failed === 0, JSON.stringify(r));
  }
  {
    // Regression: gewoehnlicher KI-Fehler zaehlt weiter als failed (kein Stopp).
    const r = await runKoEnrichmentBackfill({ execute: true }, {
      listKnowledgeObjects: async () => [koComplete("a"), koComplete("b")],
      canSpend: async () => ({ allowed: true }),
      extractTags: async () => { throw new Error("Azure HTTP 500"); },
      derivePolicyFields: () => [],
      saveEnrichment: async () => {}
    });
    check("C3 gewoehnlicher KI-Fehler: failed je Kandidat, KEIN Stopp", r.stop === null && r.failed === 2, JSON.stringify(r));
  }

  // ── D) buildHealthReport: Budget-Zeile, Laufzeit, Fehler-Spike, Zu-tun, dryRun ──
  console.log("== D) buildHealthReport (Test-Hook, lokaler Store) ==");
  process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "10";
  await resetUsage();
  const buildHealthReport = serverHandler.__buildHealthReport;
  check("D0 Test-Hook vorhanden", typeof buildHealthReport === "function");
  const wdPid = "mon-wd-test";

  // Crawl-Lauf mit Laufzeit seeden. BEWUSST direkt in die Store-Datei: die
  // Write-Kompaktierung (storage.compactStore) whitelistet crawlRun-Felder und
  // wuerde durationMs beim Persistieren strippen (vorbestehender Zustand, trifft
  // z. B. auch googleUrlResolution; storage.js gehoert nicht zu diesem Paket).
  // Der Read-Pfad (normalizeStore) reicht vorhandene Felder unveraendert durch —
  // genau den Vertrag "Zeile erscheint, WENN das Feld da ist" testet D2.
  {
    const storeFile = path.join(dataDir, "store.json");
    const mainStore = fs.existsSync(storeFile) ? JSON.parse(fs.readFileSync(storeFile, "utf8")) : {};
    mainStore.crawlRuns = [
      { mode: "full", durationMs: 123456, checkedSources: 5, successfulSources: 5, failedSources: 0, errors: [], createdAt: new Date().toISOString() },
      ...(mainStore.crawlRuns || [])
    ];
    fs.writeFileSync(storeFile, JSON.stringify(mainStore, null, 2));
  }
  const rep1 = await buildHealthReport(wdPid, { persistState: false });
  check("D1 Budget-Zeile: Calls/Limit/Rest/Kosten/Skips im Report-Text",
    /💰 KI-Budget: 0\/10 Calls · Rest 10 · \$0\.00 heute · \d+ Skips/.test(rep1.text), rep1.text.split("\n").find((l) => l.includes("KI-Budget")));
  check("D2 Laufzeit-Zeile aus persistiertem durationMs (123s)", rep1.text.includes("⏱ Crawl-Laufzeit: 123s"), rep1.text);
  check("D3 ueberfaellige Crons: Zu-tun-Zeile traegt konkrete Empfehlung (Vercel-Cron pruefen)",
    rep1.overdueCrons.length >= 1 && /Zu tun.*Vercel-Cron prüfen/.test(rep1.text.replace(/\n/g, " ")), rep1.text);
  check("D4 severity mindestens 'watch' bei ueberfaelligen Crons", rep1.severity === "watch" || rep1.severity === "alarm", rep1.severity);
  check("D5 llmBudget strukturiert im Report-Ergebnis", rep1.llmBudget && rep1.llmBudget.limit === 10 && rep1.llmBudget.remaining === 10, JSON.stringify(rep1.llmBudget));

  // Fehler-Spike: >=10 frische Systemfehler -> ok=false + klare Zeile mit Zahl.
  for (let i = 0; i < 12; i++) await accounts.recordSystemError({ scope: "test", message: `Spike ${i}` });
  const rep2 = await buildHealthReport(wdPid, { persistState: false });
  check("D6 Fehler-Spike: ok=false + errorSpike=true", rep2.ok === false && rep2.errorSpike === true && rep2.errors24 >= 10, JSON.stringify({ ok: rep2.ok, errorSpike: rep2.errorSpike, errors24: rep2.errors24 }));
  check("D7 Fehler-Spike: klare Report-Zeile mit echter Zahl und Schwelle",
    new RegExp(`🚨 Fehler-Spike: ${rep2.errors24} Systemfehler in 24h \\(Schwelle 10\\)`).test(rep2.text), rep2.text);
  check("D8 Fehler-Spike: Zu-tun nennt /api/debug/system-errors", rep2.text.includes("/api/debug/system-errors"));

  // dryRun-Nebenwirkungsfreiheit: persistState=false laesst saveWatchdogState aus.
  // HINWEIS: funktional ueber den Store ist das lokal NICHT beobachtbar, weil
  // normalizePoliticianStore watchdogStates beim Schreiben UND Lesen wegfiltert
  // (vorbestehender storage.js-Defekt — die Recovery-Hysterese ist dadurch
  // ohnehin inert; storage.js gehoert nicht zu diesem Paket). Deshalb wird hier
  // der Gate-Code selbst gepinnt + dass der dryRun-Pfad fehlerfrei durchlaeuft.
  const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");
  check("D9 buildHealthReport: saveWatchdogState ist hinter persistState gegatet",
    /if \(persistState\) await saveWatchdogState\(politicianId, classification\.state\);/.test(serverSource));
  const repDry = await buildHealthReport(wdPid, { persistState: false });
  check("D10 dryRun-Pfad (persistState=false) liefert vollstaendigen Report ohne Fehler",
    Boolean(repDry) && typeof repDry.text === "string" && typeof repDry.ok === "boolean");
  // Route-Verdrahtung: der Cron-Pfad reicht dryRun als persistState=false durch.
  check("D11 Route: /api/cron/health-report?dryRun=1 -> buildHealthReport(..., { persistState: !isDryRun })",
    /buildHealthReport\(politicianId, \{ persistState: !isDryRun \}\)/.test(serverSource));

  // ── E) /api/debug/reset-llm-budget: ehrlich + lokaler Zaehler-Reset + Audit ──
  console.log("== E) /api/debug/reset-llm-budget (lokaler Modus) ==");
  process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "1";
  await resetUsage();
  await assess(); await settle(); // verbraucht Limit 1 (Log + Reservierungszaehler)
  const blocked = await storage.reserveLlmCall({ callType: "understanding" });
  check("E1 Vorzustand: Reservierung lehnt ab (Budget verbraucht)", blocked.allowed === false, JSON.stringify(blocked));

  const server = http.createServer(serverHandler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    // POST-Pflicht (Review-Fix aus dem Rest-Fixes-PR): GET liefert nur noch den
    // 405-Hinweis; der eigentliche Reset verlangt POST (CSRF-geschuetzt).
    const resGet = await httpRequest(server, { pathname: "/api/debug/reset-llm-budget", headers: { Authorization: "Bearer test-debug-secret-niemals-echt" } });
    check("E0 GET wird mit 405 abgelehnt (POST-Pflicht)", resGet.status === 405, `status=${resGet.status}`);
    const res = await httpRequest(server, { method: "POST", pathname: "/api/debug/reset-llm-budget", headers: { Authorization: "Bearer test-debug-secret-niemals-echt" } });
    const body = JSON.parse(res.body);
    check("E2 Endpoint antwortet 200 mit reservationCounterReset=true (lokaler Modus)",
      res.status === 200 && body.reservationCounterReset === true, res.body.slice(0, 200));
    check("E3 ehrliche Meldung nennt BEIDE Resets (Log + In-Prozess-Zaehler)",
      /Reservierungszaehler zurueckgesetzt/.test(body.message), body.message);
    const freed = await storage.reserveLlmCall({ callType: "understanding" });
    check("E4 nach Reset: Reservierung gibt wieder frei", freed.allowed === true, JSON.stringify(freed));
    const audit = await accounts.listAuditEvents(10);
    const auditEntry = audit.find((e) => e.action === "debug.reset-llm-budget");
    check("E5 Audit-Eintrag debug.reset-llm-budget (Actor debug-secret, nur Metadaten)",
      Boolean(auditEntry) && auditEntry.actorEmail === "debug-secret" && /removed=\d+/.test(String(auditEntry.detail)), JSON.stringify(auditEntry));
  } finally {
    server.close();
  }

  // Supabase-Hinweis (Struktur, ohne echte DB): die Antwort unterscheidet die Modi.
  check("E6 Supabase-Modus wird in der Antwort ehrlich behandelt (llm_budget_counters bleibt unangetastet)",
    /llm_budget_counters-Zeile[^)]*\) bleibt unveraendert/.test(serverSource));
  check("E7 Diagnose-Fix-Hinweis luegt nicht mehr (reset leert NUR das Kosten-Log)",
    /reset-llm-budget leert NUR das Kosten-Log, nicht den atomaren Reservierungszaehler/.test(serverSource));

  // ── F) Struktur-Checks: scheduler-durationMs, health-watch.yml, Config-Diagnose ──
  console.log("== F) Struktur: durationMs, Waechter-Waechter-Workflow, Config-Diagnose ==");
  const schedulerSource = fs.readFileSync(path.join(root, "lib/helmut/scheduler.js"), "utf8");
  check("F1 scheduler: saveCrawlRun persistiert durationMs (aus startedAtMs)",
    /durationMs: Date\.now\(\) - startedAtMs/.test(schedulerSource) && /const startedAtMs = Date\.now\(\)/.test(schedulerSource));

  const wfPath = path.join(root, ".github", "workflows", "health-watch.yml");
  check("F2 health-watch.yml existiert", fs.existsSync(wfPath));
  const wf = fs.existsSync(wfPath) ? fs.readFileSync(wfPath, "utf8") : "";
  check("F3 Workflow: taeglicher Cron 06:30 UTC + workflow_dispatch", /cron: "30 6 \* \* \*"/.test(wf) && /workflow_dispatch/.test(wf));
  check("F4 Workflow: ruft dryRun=1 mit Bearer-Secret (kein Query-Secret)",
    wf.includes("/api/cron/health-report?dryRun=1") && wf.includes('Authorization: Bearer ${CRON_SECRET}') && !/secret=\$\{/.test(wf));
  check("F5 Workflow: Fallback-URL wie briefing-watchdog", wf.includes("vars.HELMUT_PROD_URL || 'https://helmut-pilot.vercel.app'"));
  check("F6 Workflow: schlaegt bei non-200 UND bei ok!==true fehl", /HTTP_CODE.*!=.*200/.test(wf.replace(/\n/g, " ")) && wf.includes("body.ok !== true"));
  check("F7 Workflow: unterscheidet Timeout / HTTP-Fehler / ok=false ehrlich",
    wf.includes("TIMEOUT:") && wf.includes("HTTP-FEHLER:") && wf.includes("REPORT NICHT GRUEN:"));
  check("F8 Workflow: dokumentiert 'dryRun versendet NICHTS' + echten Versand beim Vercel-Cron 06:00",
    /dryRun versendet NICHTS/.test(wf) && /06:00/.test(wf));
  check("F9 Workflow: --max-time 120 gesetzt", wf.includes("--max-time 120"));

  const diagnose = serverHandler.__buildHelmutConfigDiagnose({});
  const limitRow = diagnose.find((r) => r.name === "HELMUT_MAX_LLM_CALLS_PER_DAY");
  check("F10 Config-Diagnose: codeDefault = 'Schutzlimit 50 (fail-closed)' (kein Infinity mehr)",
    Boolean(limitRow) && limitRow.codeDefault === "Schutzlimit 50 (fail-closed)", JSON.stringify(limitRow));

  // ── G) Persistenz-Roundtrips: Telemetrie ueberlebt die Store-Whitelists ────
  // Zwei vorbestehende Defekte (durch diese Suite gepinnt): compactStore
  // strippte googleUrlResolution/durationMs aus crawlRuns, und
  // normalizePoliticianStore verwarf watchdogStates komplett — Health-Report-
  // Telemetrie und die P1-4-"Erholt"-Hysterese waren damit live wirkungslos.
  {
    const savedRun = await storage.saveCrawlRun({
      mode: "full", checkedSources: 5, successfulSources: 4, failedSources: 1,
      newCandidateItems: 2, savedItems: 2, errors: [],
      googleUrlResolution: { attempted: 12, resolved: 9 },
      durationMs: 187000
    });
    check("G1 saveCrawlRun liefert Telemetrie-Felder zurueck", Boolean(savedRun && savedRun.createdAt));
    const latestRun = await storage.getLatestCrawlRun();
    check("G2 Roundtrip: googleUrlResolution ueberlebt die compactStore-Whitelist",
      latestRun && latestRun.googleUrlResolution && latestRun.googleUrlResolution.attempted === 12 && latestRun.googleUrlResolution.resolved === 9,
      JSON.stringify(latestRun && latestRun.googleUrlResolution));
    check("G3 Roundtrip: durationMs ueberlebt die compactStore-Whitelist",
      latestRun && latestRun.durationMs === 187000, JSON.stringify(latestRun && latestRun.durationMs));

    const wdEntry = await storage.saveWatchdogState("cem-test-monitoring", { state: "GESUND", severity: "ok" });
    check("G4 saveWatchdogState schreibt Eintrag", Boolean(wdEntry && wdEntry.createdAt));
    const wdLatest = await storage.getLatestWatchdogState("cem-test-monitoring");
    check("G5 Roundtrip: watchdogStates ueberlebt normalizePoliticianStore (Hysterese lebt)",
      Boolean(wdLatest && wdLatest.state && wdLatest.state.state === "GESUND"), JSON.stringify(wdLatest));
  }

  // Env wiederherstellen
  if (envSnapshot.limit === undefined) delete process.env.HELMUT_MAX_LLM_CALLS_PER_DAY;
  else process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = envSnapshot.limit;

  console.log(`\n${passed} PASS, ${failed} FAIL  (Fake-KI-Transportaufrufe: ${fakeAiCalls})`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("TESTFEHLER", e); process.exit(1); });
