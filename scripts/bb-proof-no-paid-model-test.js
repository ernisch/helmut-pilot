"use strict";

// Helmut — gezielter Offline-Test: NO-PAID-MODELL-GRENZE im Crawl.
// =============================================================================================
// AUFTRAG: genau EINE fail-closed Operator-Grenze, die Lazy- UND Eager-Understanding
// (jeder ggf. kostenpflichtige Modellaufruf) komplett ueberspringt, ohne Quelle/Crawl/
// Raw-Speicherung, deterministisches Matching und Decisions anzufassen.
//
// BEWIESENE VERTRAEGE (drei):
//   V1 Standardlauf ohne noPaidModel: unveraendert (Lazy + Eager laufen wie bisher,
//      Rueckgabeform des Normalpfads bleibt unangetastet).
//   V2 No-Paid-Lauf (options.noPaidModel === true): kann NIE eager/lazy Understanding
//      ausfuehren (Spione bleiben bei 0) und meldet paidModelCalls: 0.
//   V3 Oeffentliche regulaere Pfade (/api/crawl/run, /api/pipeline/run, Cron) leiten
//      noPaidModel NICHT weiter — nur der bereits secret-geschuetzte /api/debug/crawl
//      kennt den strikten Schalter (exakt "1").
//
// Deterministisch und offline: kein Netz, keine KI, keine DB, keine Production-Daten.
// Alle I/O-Randmodule (Crawler, Storage, Understanding-Einstiegspunkte) sind SICHERE
// FAKES; der gepruefte Code ist der ECHTE `runSourceCrawl` aus lib/helmut/scheduler.js.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LIB = path.join(ROOT, "lib", "helmut");

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

// ---------------------------------------------------------------------------------------------
// Abschnitt 1 — Quelltext-Vertraege (statisch): Trennung der Pfade.
// ---------------------------------------------------------------------------------------------
console.log("\nAbschnitt 1: Quelltext-Vertraege (statisch)");
{
  const serverSrc = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");

  // V3a: der strikte Schalter lebt genau im /api/debug/crawl-Handler.
  const handlerStart = serverSrc.indexOf('if (url.pathname === "/api/debug/crawl")');
  const handlerEnde = serverSrc.indexOf('if (url.pathname ===', handlerStart + 10);
  const handlerBlock = handlerStart >= 0 && handlerEnde > handlerStart
    ? serverSrc.slice(handlerStart, handlerEnde)
    : "";
  check("1.1 der /api/debug/crawl-Handler ist auffindbar", handlerStart >= 0 && handlerEnde > handlerStart);
  check("1.2 der Handler liest den strikten Query-Schalter exakt `=== \"1\"`",
    /url\.searchParams\.get\("noPaidModel"\)\s*===\s*"1"/.test(handlerBlock));
  check("1.3 der Handler reicht `{ noPaidModel: true }` NUR im no-paid-Zweig weiter",
    /runSourceCrawl\(politicianId, \{ noPaidModel: true \}\)/.test(handlerBlock)
    && /runSourceCrawl\(politicianId\)/.test(handlerBlock));

  // V3b: jede Erwaehnung von noPaidModel in server.js liegt im Debug-Handler.
  const idx = [];
  for (let i = serverSrc.indexOf("noPaidModel"); i >= 0; i = serverSrc.indexOf("noPaidModel", i + 1)) idx.push(i);
  const ausserhalb = idx.filter((i) => i < handlerStart || i >= handlerEnde);
  check("1.4 keine noPaidModel-Erwaehnung ausserhalb des Debug-Handlers", idx.length > 0 && ausserhalb.length === 0,
    `Erwaehnungen: ${idx.length}, ausserhalb: ${ausserhalb.length}`);

  // V3c: die regulaeren Pfade sind unveraendert und tragen den Schalter nicht.
  check("1.5 /api/crawl/run unveraendert (nur force, kein noPaidModel)",
    /return runSourceCrawl\(politicianId, \{ force: forced \}\)/.test(serverSrc));
  check("1.6 /api/pipeline/run unveraendert (nur force, kein noPaidModel)",
    /runSourceCrawl\(politicianId, \{ force: forcedPipeline \}\)/.test(serverSrc));
  check("1.7 Cron-Pfad unveraendert (runSourceCrawl(tenantId, { deadlineMs }) ohne noPaidModel)",
    /runCronForTenants\(cronName, \(tenantId\) => runSourceCrawl\(tenantId, \{ deadlineMs: startedMs \+ deadlineMs \}\), \{ deadlineMs, runId \}\)/.test(serverSrc)
    && !/runSourceCrawl\(tenantId, \{[^}]*noPaidModel/.test(serverSrc));

  // V1/V2: die Grenze in runSourceCrawl ist strikt und die Rueckgabe rueckwaertskompatibel.
  const schedSrc = fs.readFileSync(path.join(LIB, "scheduler.js"), "utf8");
  check("1.8 die Grenze ist strikt: `options.noPaidModel === true`",
    /const noPaidModel = options\.noPaidModel === true;/.test(schedSrc));
  check("1.9 der no-paid-Rueckgabe-Zusatz ist an noPaidModel gebunden (Normalpfad unveraendert)",
    /\.\.\.\(noPaidModel[\s\S]{0,200}?paidModelCalls: 0[\s\S]{0,200}?skippedPaidModelPhases: \["lazy-understanding", "eager-understanding"\][\s\S]{0,40}?: \{\}\)/.test(schedSrc));
}

// ---------------------------------------------------------------------------------------------
// Abschnitt 2 — Laufzeit-Spike mit sicheren Fakes.
// ---------------------------------------------------------------------------------------------
console.log("\nAbschnitt 2: Laufzeit-Spike (sichere Fakes, echter runSourceCrawl)");

// Spione + Fake-Module MUESSEN vor dem Laden von scheduler.js im require-Cache stehen.
const spy = { lazy: 0, eager: 0, crawl: 0, saveRaw: 0, matching: 0, decisions: 0 };

function stub(relPath, exports) {
  const abs = require.resolve(path.join(LIB, relPath));
  require.cache[abs] = { id: abs, filename: abs, loaded: true, exports };
}

stub("crawler", {
  crawlAllSources: async () => {
    spy.crawl += 1;
    return {
      results: [],
      rawItems: [{ id: "raw-1", url: "https://example.invalid/a", title: "Test", sourceId: "s1" }],
      newCandidateItems: 0,
      checkedSources: 0, successfulSources: 0, failedSources: 0,
      skippedSources: 0, circuitOpenSources: 0, sharedSkippedSources: 0, retriesTotal: 0,
      googleGate: null, googleUrlResolution: null
    };
  },
  deduplicateRawItems: (x) => x,
  limitRawCandidates: (x) => x,
  maxCrawlCandidates: () => 0
});

stub("storage", {
  getProfile: async () => null,
  getRawItemsSince: async () => [],
  getSources: async () => [],
  getTopicMemory: async () => null,
  saveCrawlRun: async (run) => ({ ok: true, ...run }),
  saveLageCheck: async () => ({}),
  saveRawItems: async (items) => { spy.saveRaw += 1; return items; },
  acquirePipelineLock: async () => true,
  releasePipelineLock: async () => {},
  saveRawDocument: async () => ({ saved: true }),
  persistRawDocumentsDeduped: async () => ({ skipped: true }),
  v3StoreEnabled: () => false,
  listFullProfiles: async () => [],
  listKnowledgeObjects: async () => [],
  listCrawlRuns: async () => [],
  recordProcessRun: async () => ({ ok: true }),
  insertSourceCrawlTelemetry: async () => ({}),
  recordPipelineError: async () => ({}),
  savePendingKnowledgeObjectsBulk: async () => ({}),
  listSourceArchitectureRows: async () => ({ retrievalPaths: [] }),
  saveSourceModeShadowRun: async () => ({})
});

stub("dip", { isDipEnabled: () => false, getRelevantParliamentaryItems: async () => [] });
stub("crawl-run-state", { classifyCrawlRunState: () => ({}), buildProviderBreakdown: () => ({}), summarizeErrorCodes: () => [] });
stub("google-news-hardening", {
  googleHardeningConfig: () => ({ enabled: false }),
  createGoogleNewsGate: () => null,
  evaluateCooldown: () => ({ active: false, skipGoogle: false, reason: null }),
  sharedFetchLedger: () => null
});
stub("source-telemetry", { persistSourceCrawlTelemetry: async () => ({}), buildSourceTelemetryRows: () => [] });
stub("quellenarchitektur/source-mode", {
  sourceMode: () => "off",
  buildRelationalCrawlPlan: () => ({}),
  mergeProfileAndPlanSources: (a) => a,
  dedupeSourcesById: (a) => a,
  buildShadowRunReport: () => ({}),
  planQuellenFuerProfil: () => ({}),
  laenderMitBerechtigtemMandat: () => [],
  freigegebeneLandesmodule: () => new Set(),
  landesmodulQuelleGesperrt: () => false
});
stub("quellenarchitektur/dedup-global", { planDedupWrites: (items) => items });
stub("dedup", { toRawDocumentRow: (x) => ({ id: x.id }), dedupeRawDocuments: (rows) => rows });
stub("understanding", {
  clusterRawDocuments: (rows) => rows.map((r) => ({ id: `cluster-${r.id}` })),
  deriveVorgangId: (cluster) => `vorgang-${cluster.id}`,
  buildOutcomeTelemetry: () => ({})
});
stub("artikelkontext-lauf", { runUnderstandingShadow: async () => { spy.eager += 1; return { processed: 1, deferred: 0 }; } });
stub("lazyUnderstanding", { runLazyUnderstandingShadow: async () => { spy.lazy += 1; return { ok: true }; } });
stub("matching", { runMatchingShadow: async () => { spy.matching += 1; return { ok: true }; } });
stub("decisions", { runDecisionShadow: async () => { spy.decisions += 1; return { ok: true }; } });

const schedulerPath = require.resolve(path.join(LIB, "scheduler"));
delete require.cache[schedulerPath];
const scheduler = require(schedulerPath);

function resetSpy() { for (const k of Object.keys(spy)) spy[k] = 0; }

(async () => {
  const TENANT = "mdb-notest";

  // V1 — Standardlauf ohne noPaidModel: Lazy + Eager laufen (Verhalten unveraendert).
  resetSpy();
  const normal = await scheduler.runSourceCrawl(TENANT);
  check("2.1 Standardlauf ruft Lazy-Understanding auf", spy.lazy === 1, `lazy=${spy.lazy}`);
  check("2.2 Standardlauf ruft Eager-Understanding auf", spy.eager === 1, `eager=${spy.eager}`);
  check("2.3 Standardlauf laeuft Quelle/Crawl + deterministische Phasen unveraendert",
    spy.crawl === 1 && spy.saveRaw === 1 && spy.matching === 1 && spy.decisions === 1,
    JSON.stringify(spy));
  check("2.4 Normalpfad traegt KEINE no-paid-Felder",
    normal.noPaidModel === undefined && normal.paidModelCalls === undefined && normal.skippedPaidModelPhases === undefined);

  // V2 — No-Paid-Lauf: Lazy + Eager werden NIE erreicht, Quelle/Crawl/Matching bleiben.
  resetSpy();
  const noPaid = await scheduler.runSourceCrawl(TENANT, { noPaidModel: true });
  check("2.5 No-Paid-Lauf ruft Lazy-Understanding NIE auf", spy.lazy === 0, `lazy=${spy.lazy}`);
  check("2.6 No-Paid-Lauf ruft Eager-Understanding NIE auf", spy.eager === 0, `eager=${spy.eager}`);
  check("2.7 No-Paid-Lauf laesst Quelle/Crawl + deterministische Phasen unveraendert",
    spy.crawl === 1 && spy.saveRaw === 1 && spy.matching === 1 && spy.decisions === 1,
    JSON.stringify(spy));
  check("2.8 No-Paid-Lauf meldet noPaidModel:true, paidModelCalls:0 und die uebersprungenen Phasen",
    noPaid.noPaidModel === true
    && noPaid.paidModelCalls === 0
    && Array.isArray(noPaid.skippedPaidModelPhases)
    && noPaid.skippedPaidModelPhases.includes("lazy-understanding")
    && noPaid.skippedPaidModelPhases.includes("eager-understanding"));

  // Fail-closed — ungenaue/truthy Werte aktivieren die Grenze NICHT (nur exakt `true`).
  for (const wert of [1, "1", "true"]) {
    resetSpy();
    const r = await scheduler.runSourceCrawl(TENANT, { noPaidModel: wert });
    check(`2.9 noPaidModel=${JSON.stringify(wert)} ist NICHT strikt true -> Normalpfad (Eager laeuft)`,
      spy.eager === 1 && spy.lazy === 1 && r.noPaidModel === undefined);
  }

  console.log(`\nErgebnis: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error("HARNESS-FEHLER:", e && e.stack ? e.stack : e);
  process.exit(1);
});
