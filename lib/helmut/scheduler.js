const { crawlAllSources } = require("./crawler");
const {
  getProfile,
  getRawItemsSince,
  getSources,
  getTopicMemory,
  saveCrawlRun,
  saveLageCheck,
  saveRawItems,
  acquirePipelineLock,
  releasePipelineLock,
  saveRawDocument,
  persistRawDocumentsDeduped,
  v3StoreEnabled,
  listFullProfiles,
  listKnowledgeObjects,
  listCrawlRuns,
  recordProcessRun,
  insertSourceCrawlTelemetry,
  recordPipelineError,
  savePendingKnowledgeObjectsBulk
} = require("./storage");
const { persistSourceCrawlTelemetry, buildSourceTelemetryRows } = require("./source-telemetry");
// Google-News-Härtung (Sprint 2026-07): Gate/Cooldown je Lauf + ehrliche
// Lauf-Klassifikation. Kill-Switch HELMUT_GOOGLE_HARDENING=off -> Alt-Verhalten.
const { googleHardeningConfig, createGoogleNewsGate, evaluateCooldown, sharedFetchLedger } = require("./google-news-hardening");
const { classifyCrawlRunState, buildProviderBreakdown, summarizeErrorCodes } = require("./crawl-run-state");

// Breaker-Gedächtnis über Mandanten hinweg (Review-Fix): die Cron-Endpunkte
// durchlaufen alle aktiven Mandate SEQUENZIELL im selben Prozess. Öffnet der
// Circuit Breaker bei Mandat A, drosselt Google gerade die gemeinsame
// Egress-IP — der nächste Mandanten-Lauf startet dann direkt fail-fast, statt
// die Drosselung erneut mit vollen Timeouts/Retries zu „entdecken".
// Reiner Prozess-Zustand (kein Store-Write); Fenster: hardening.breakerMemoryMs.
let lastGoogleCircuitOpenAtMs = 0;
function googleBreakerMemoryActive(hardening) {
  return hardening.breakerMemoryMs > 0
    && lastGoogleCircuitOpenAtMs > 0
    && (Date.now() - lastGoogleCircuitOpenAtMs) < hardening.breakerMemoryMs;
}
function rememberGoogleBreakerState(gateState) {
  if (gateState && gateState.open) lastGoogleCircuitOpenAtMs = Date.now();
}

// P0-1: stabile, korrelierbare Laufkennung (technische Metadaten, keine PII).
// Format: <prefix>-<UTC-Kompaktzeit>-<kurzes Zufallssuffix>. Der Crawl-Lauf teilt
// seine runId mit der eager-Understanding-Telemetrie desselben Laufs (Korrelation).
function makeRunId(prefix = "run", atMs = Date.now()) {
  const stamp = new Date(atMs).toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${String(prefix).slice(0, 20)}-${stamp}-${suffix}`;
}

// P0-1: Ausfuehrungsort als technische Metadaten (Vercel-Region o. ae.), nie PII.
function executionLocation() {
  return String(process.env.VERCEL_REGION || process.env.HELMUT_EXEC_LOCATION || "local").slice(0, 40);
}
const { profileCompleteness, parliamentTypeOf } = require("./config");
const { requireTenantId, TenantContextError } = require("./tenant-context");

// KEIN Standardprofil: Analyse-/Filterfunktionen verlangen ein explizites
// Profilobjekt. Ein fehlendes Profil ist ein Programmierfehler und bricht
// sicher ab, statt still mit einem fremden oder leeren Mandat zu rechnen.
function requiredProfile(profile, context = "Analyse") {
  if (!profile || typeof profile !== "object") {
    throw new TenantContextError(`Profil fehlt (${context}) — es gibt kein Standardprofil.`);
  }
  return profile;
}
const sourceSafety = require("./sourceSafety");

// Account-Modus? Bewusst lokal (kein Import von auth.js -> kein Require-Zyklus),
// exakt dieselbe Regel wie auth.authMode().
function authModeOn() {
  return String(process.env.HELMUT_AUTH_MODE || "").trim().toLowerCase() === "accounts";
}
const { isDipEnabled, getRelevantParliamentaryItems } = require("./dip");
// Quellenmodus (off/shadow/on) + relationaler Crawl-Plan (Cutover-Vorbereitung, Default off).
const { sourceMode, buildRelationalCrawlPlan, mergeProfileAndPlanSources, dedupeSourcesById, buildShadowRunReport,
  planQuellenFuerProfil, laenderMitBerechtigtemMandat, freigegebeneLandesmodule, landesmodulQuelleGesperrt } = require("./quellenarchitektur/source-mode");
const { listSourceArchitectureRows: storageListSourceArchitectureRows, saveSourceModeShadowRun } = require("./storage");
const { planDedupWrites } = require("./quellenarchitektur/dedup-global");
const { toRawDocumentRow, dedupeRawDocuments } = require("./dedup");
const { runUnderstandingShadow, clusterRawDocuments, deriveVorgangId } = require("./understanding");
const { runLazyUnderstandingShadow } = require("./lazyUnderstanding");
const { runMatchingShadow } = require("./matching");
const { runDecisionShadow } = require("./decisions");

const decisionTriggerTerms = [
  "Anhörung",
  "Ausschuss",
  "beschließt",
  "Beschluss",
  "Bundeskabinett",
  "Debatte",
  "Entwurf",
  "Eckpunkte",
  "fordert",
  "Gesetzentwurf",
  "Gesetz",
  "Kabinett",
  "Kritik",
  "kündigt",
  "legt vor",
  "Paket",
  "Pflegereform",
  "plant",
  "Reform",
  "Sparvorschläge",
  "Stellungnahme",
  "Tagesordnung",
  "Verordnung",
  "Finanzierung",
  "kürzen",
  "streichen",
  "warnt"
];

const weakProtocolTerms = [
  "G7",
  "ILO",
  "Delegation",
  "besucht",
  "begrüßt",
  "eröffnet",
  "Karrierevideo",
  "Konferenz",
  "nimmt an Treffen",
  "reiste",
  "zu Gast"
];

const lageCheckSourceLimit = Number(process.env.HELMUT_LAGE_CHECK_SOURCE_LIMIT || 90);
const lageCheckRecentHours = Number(process.env.HELMUT_LAGE_CHECK_RECENT_HOURS || 8);
const lageCheckRegenerateThreshold = Number(process.env.HELMUT_LAGE_CHECK_REGENERATE_THRESHOLD || 65);
const topTopicCooldownHours = Number(process.env.HELMUT_TOP_TOPIC_COOLDOWN_HOURS || 36);

// V3-Vorbereitung (C3), Default AUS: Soll DIP als hochwertige PRIMAERQUELLE
// behandelt werden? Flag AUS = exakt bisheriges Verhalten (DIP als Zusatzquelle,
// ohne linkType/priority). Flag AN = amtlicher Direktlink + hohe Prioritaet, damit
// die Drucksache Kandidaten-Deckel/Retention ueberlebt und im Client nicht als
// "unpraeziser" Link ausgeblendet wird (die dokumentierte DIP-Falle).
function dipPrimaryEnabled() {
  return ["1", "true", "on", "yes"].includes(String(process.env.HELMUT_DIP_PRIMARY || "").trim().toLowerCase());
}

// Reine Abbildung einer DIP-Drucksache auf das Helmut-rawItem-Format (testbar,
// ohne Netzwerk). Bei primary=false identisch zum bisherigen Verhalten.
function dipDocToRawItem(doc = {}, { primary = false } = {}) {
  const base = {
    id: `dip-${doc.id}`,
    hash: `dip-${doc.id}`,
    title: doc.title,
    summary: [(doc.urheber || []).join(", "), (doc.ressort || []).join(", ")].filter(Boolean).join(" · "),
    url: doc.url,
    publishedAt: doc.date || new Date().toISOString(),
    retrievedAt: new Date().toISOString(),
    sourceName: "DIP Bundestag",
    sourceId: "dip",
    sourceType: "bundestag",
    confidence: "high",
    documentType: doc.type,
    wahlperiode: doc.wahlperiode
  };
  if (!primary) return base;
  const hasDirectUrl = /^https?:\/\//i.test(String(doc.url || ""));
  return {
    ...base,
    priority: 95,
    sourcePriority: 95,
    // linkType nur setzen, wenn wirklich ein Direktlink vorliegt — sonst wuerde der
    // Client eine leere/unaufloesbare Quelle faelschlich als "direct" behandeln.
    ...(hasDirectUrl ? { linkType: "direct" } : {})
  };
}

// Konvertiert DIP-Drucksachen in das Helmut-rawItem-Format fuer den gemeinsamen Scoring-Pfad.
async function fetchDipAsRawItems(profile) {
  try {
    const { items } = await getRelevantParliamentaryItems(profile);
    const primary = dipPrimaryEnabled();
    return items.map((doc) => dipDocToRawItem(doc, { primary }));
  } catch (error) {
    console.error("[fetchDipAsRawItems] Fehler:", error.message);
    return [];
  }
}

// V3-Schatten (C6): dedupliziert die Rohitems kanonisch und schreibt MINIMIERTE,
// DSGVO-datensparsame raw_documents (kein Volltext/PII). Nur wenn HELMUT_V3_STORE
// aktiv ist — sonst kompletter No-Op. FAIL-SAFE: Fehler hier duerfen den Crawl NIE
// beeinflussen (kein throw, kein Einfluss auf Blob, Briefing oder Crawl-Ergebnis).
async function persistRawDocumentsShadow(items, ctx = {}) {
  if (!v3StoreEnabled() || !Array.isArray(items) || !items.length) {
    return { skipped: true, persisted: 0 };
  }
  try {
    const rows = dedupeRawDocuments(items.map(toRawDocumentRow).filter((row) => row && row.id));
    // CUTOVER-Pfad (nur Quellenmodus 'on', freigabepflichtig): globale Dedup + Fundstellen —
    // 1 Artikel ueber n Wege -> 1 raw_document + n document_findings. off/shadow bleiben
    // byte-identisch beim bisherigen Einzel-Upsert.
    if (sourceMode() === "on") {
      const result = await persistRawDocumentsDeduped(rows);
      if (result && !result.skipped) return { ...result, deduped: rows.length, candidates: items.length };
      // Fallback (Store nicht bereit o. ae.): bisheriger Pfad unten.
    }
    let persisted = 0;
    for (const row of rows) {
      const result = await saveRawDocument(row);
      if (result && result.saved) persisted += 1;
    }
    return { persisted, deduped: rows.length, candidates: items.length };
  } catch (error) {
    console.error("[persistRawDocumentsShadow] Fehler (ignoriert):", error.message);
    // P0-3: bislang still verschluckt -> jetzt als technischer Systemfehler sichtbar.
    await recordPipelineError({ process: "persist-raw-documents", runId: ctx.runId, error }).catch(() => {});
    return { persisted: 0, error: error.message };
  }
}

async function runSourceCrawl(politicianId, options = {}) {
  // KEIN Standardmandant: ohne expliziten Mandantenkontext bricht der Lauf sicher ab.
  politicianId = requireTenantId(politicianId, "runSourceCrawl");
  const lockName = `crawl-${politicianId}`;
  const locked = await acquirePipelineLock(lockName, 15 * 60 * 1000);
  if (!locked) {
    console.warn(`[runSourceCrawl] Job läuft bereits für ${politicianId}, übersprungen.`);
    return { skipped: true, reason: "already running" };
  }
  // P0-1: echte Wall-Clock-Messung des GESAMTEN Crawl-/Pipeline-Laufs + stabile
  // Laufkennung + Quellenmodus dieses Laufs (technische Metadaten, keine PII).
  const runStartedMs = Date.now();
  const runId = makeRunId(options.mode === "lage-check" ? "lage" : "crawl", runStartedMs);
  const runSourceMode = sourceMode();
  const location = executionLocation();
  // GESAMT-ZEITBUDGET DES LAUFS (Betriebsbefund 2026-07-27). Vorher hatte jede
  // Phase ihr eigenes festes Budget (lazy 60s, eager 90s) — aber NICHTS begrenzte
  // die SUMME. Gemessen am 04:01-Lauf: Crawl 156s + lazy 17s + eager 90s = 263s,
  // bevor der (damals unbegrenzte) Vormerk-Loop ueberhaupt begann; das 300s-
  // Funktionslimit riss, die Telemetrie am Ende dieser Funktion wurde nie
  // geschrieben. Jetzt bekommt jede Phase `min(eigenes Budget, Restzeit)` — der
  // Lauf endet damit IMMER vor dem Funktionslimit und erreicht seinen Abschluss
  // (Telemetrie, Lauf-Persistenz). Default 240s = 80 % von maxDuration 300s.
  const runBudgetMs = Number(process.env.HELMUT_CRAWL_GESAMTBUDGET_MS || 240000);
  const verbleibendMs = () => Math.max(0, runBudgetMs - (Date.now() - runStartedMs));
  try {
    const profile = await getActiveProfile(politicianId);
    const allSources = await getSourcesForProfile(profile);
    const mode = options.mode || "full";
    const selectedSources = mode === "lage-check"
      ? selectLageCheckSources(allSources, Number(options.sourceLimit || lageCheckSourceLimit), profile)
      : allSources;
    // Google-News-Härtung: Gate (begrenzte Parallelität, Mindestabstand, Circuit
    // Breaker) + Cooldown-Prüfung gegen die letzten Läufe. Cooldown gilt nur für
    // VOLLcrawls (der Lage-Check ist bereits quellen-reduziert und läuft zeitlich
    // weit von den Crawl-Crons entfernt). options.force = bewusster Betreiber-
    // Override (deaktiviert Cooldown/Abstands-Schutz, NICHT das Gate).
    const hardening = googleHardeningConfig();
    let cooldown = { active: false, skipGoogle: false, reason: null };
    if (hardening.enabled && mode === "full") {
      // Volle Retention lesen (20): der sequenzielle Mehr-Mandanten-Cron-Loop
      // schreibt je Mandat einen Lauf — ein zu kleines Fenster würde den
      // eigenen Vor-Lauf des Mandats verdrängen (Review-Fix).
      const lastRuns = await listCrawlRuns(20).catch(() => []);
      cooldown = evaluateCooldown({ lastRuns, nowMs: Date.now(), config: hardening, force: Boolean(options.force), tenantId: politicianId });
      if (cooldown.active) {
        console.warn(`[runSourceCrawl] Google-Cooldown aktiv (${cooldown.reason}${cooldown.skipGoogle ? ", Google-Anteil übersprungen" : ", Google reduziert"}).`);
      }
    }
    const googleGate = hardening.enabled ? createGoogleNewsGate(hardening, { startOpen: googleBreakerMemoryActive(hardening) }) : null;
    // ROOT-CAUSE-SCHUTZ (Incident 2026-07-25): geteilte Google-Abrufwege werden je
    // Cron-Durchlauf nur EINMAL geholt (alle Mandate laufen sequenziell im selben
    // Prozess hinter derselben Egress-IP). options.force = Betreiber-Override, dann
    // wird das Gedächtnis bewusst ignoriert (kontrollierter Einzel-Beweislauf).
    const sharedLedger = hardening.enabled && hardening.sharedPathDedup && !options.force
      ? sharedFetchLedger(hardening.sharedPathWindowMs)
      : null;
    const crawl = await crawlAllSources(selectedSources, { googleGate, cooldown, hardeningConfig: hardening, sharedLedger });
    rememberGoogleBreakerState(crawl.googleGate);
    // QUELLENMODUS 'shadow' (freigegeben): relationalen Plan parallel MESSEN — rechnet die
    // REALEN Ergebnisse dieses Laufs dem relationalen Plan zu (gleiche Abruf-URLs via
    // legacy-Mapping): KEIN zusätzlicher Fetch, KEIN LLM, KEIN Write in den Nutzerpfad.
    // Bericht: Console-Log + kompakter Auth-Store-Eintrag (Admin-Anzeige). Komplett
    // fail-safe — ein Fehler hier beeinflusst den Crawl nie. off: Block wird übersprungen.
    if (sourceMode() === "shadow") {
      try {
        const shadowStarted = Date.now();
        const rows = await storageListSourceArchitectureRows();
        if (rows && Array.isArray(rows.retrievalPaths) && rows.retrievalPaths.length) {
          const [legacyAll, profiles] = await Promise.all([
            getSources().catch(() => []),
            listFullProfiles().catch(() => [])
          ]);
          const plan = buildRelationalCrawlPlan({
            retrievalPaths: rows.retrievalPaths, packages: rows.packages,
            packagePaths: rows.packagePaths, profiles: profiles || [], legacySources: legacyAll || []
          });
          const report = buildShadowRunReport({
            selectedSources, crawlResults: crawl.results || [], plan,
            dedupPlanner: (items) => planDedupWrites(items, [])
          });
          report.dauerMs = Date.now() - shadowStarted;
          report.crawlModus = mode;
          report.politicianId = politicianId;
          console.log(`[source-mode:shadow] ${JSON.stringify({ ...report, vergleich: { ...report.vergleich, nurAlt: report.vergleich.nurAlt.slice(0, 10), nurRelational: report.vergleich.nurRelational.slice(0, 10) } })}`);
          await saveSourceModeShadowRun(report).catch((e) => console.error("[source-mode:shadow] Bericht-Write fehlgeschlagen (ignoriert):", e.message));
        } else {
          console.warn("[source-mode:shadow] relationale Tabellen nicht erreichbar — kein Vergleich in diesem Lauf.");
        }
      } catch (error) {
        console.error("[source-mode:shadow] Fehler (ignoriert):", error.message);
        await recordPipelineError({ process: "source-mode-shadow", runId, error }).catch(() => {});
      }
    }
    // DIP: amtliche Bundestags-Drucksachen ergänzen (nur wenn DIP_API_KEY gesetzt;
    // als Primärquelle behandelt, wenn HELMUT_DIP_PRIMARY aktiv ist). Fail-safe:
    // ohne Key oder bei Fehlern kommt [] zurück, der Crawl läuft normal weiter.
    const dipRawItems = isDipEnabled() ? await fetchDipAsRawItems(profile) : [];
    const savedItems = await saveRawItems([...crawl.rawItems, ...dipRawItems]);
    // V3-Schatten (C6): parallel in raw_documents spiegeln (Default AUS = No-Op).
    // Beeinflusst weder Blob noch Briefing noch das zurueckgegebene Crawl-Ergebnis.
    // P1-5: das Ergebnis (persisted = ECHTE neue raw_documents) ist die ehrliche
    // Durchsatz-Grundlage — der Blob-savedItems-Zaehler ueberzeichnet ~15x (Cap-Artefakt).
    const persistResult = await persistRawDocumentsShadow(savedItems, { runId }).catch(() => null);
    // V3-Schatten (C7c): pro Cluster pruefen ob ein Nutzer interessiert ist;
    // bei Interesse status='pending' vormerken (kein KI-Call, idempotent).
    // Laeuft vor dem eager-Pfad (C8), damit vorgemerkte Cluster direkt aufgeloest werden.
    // Hinter HELMUT_V3_LAZY_UNDERSTANDING; fail-safe.
    await (async () => {
      if (!savedItems.length) return;
      try {
        const rows = dedupeRawDocuments(savedItems.map(toRawDocumentRow).filter((r) => r && r.id));
        const clusters = clusterRawDocuments(rows);
        const profiles = await listFullProfiles().catch(() => []);
        // ZEITBUDGET (Default 60s): auch dieser serielle Loop (pro Cluster ggf. ein
        // Supabase-Write) darf den Cron nicht über das Serverless-Limit treiben.
        const lazyBudgetMs = Math.min(Number(process.env.HELMUT_CRAWL_LAZY_BUDGET_MS || 60000), verbleibendMs());
        const lazyStart = Date.now();
        let lazyRan = 0;
        for (const cluster of clusters) {
          if (Date.now() - lazyStart > lazyBudgetMs) break;
          lazyRan += 1;
          const vorgangId = deriveVorgangId(cluster);
          await runLazyUnderstandingShadow({ cluster, vorgangId, profiles }).catch(async (error) => {
            await recordPipelineError({ process: "lazy-understanding", runId, error }).catch(() => {});
          });
        }
        console.log(`[runSourceCrawl] lazy-understanding ${Date.now() - lazyStart}ms clusters=${clusters.length} processed=${lazyRan} deferred=${clusters.length - lazyRan}`);
      } catch (error) {
        console.error("[runLazyUnderstandingShadow] Fehler (ignoriert):", error.message);
        await recordPipelineError({ process: "lazy-understanding", runId, error }).catch(() => {});
      }
    })();
    // V3-Schatten (C8 eager): globales, einmaliges Understanding pro NEUEM Vorgang (KI).
    // Nur mit HELMUT_V3_STORE + KI + Lock aktiv; sonst No-Op. Fail-safe wie oben.
    // ZEITBUDGET-BEGRENZT (Default 90s): der serielle KI-Loop (bis ~20s/Cluster) darf
    // den Crawl-Cron nicht über das Serverless-Limit (300s) treiben. Nicht verstandene,
    // interessierte Cluster bleiben pending -> dedizierter /api/cron/understanding-Lauf.
    const eagerStart = Date.now();
    // Beide Grenzen kommen aus der RESTZEIT des Laufs (siehe runBudgetMs oben).
    // Das Verstehen bekommt hoechstens sein Regelbudget, nie mehr als die Restzeit
    // abzueglich einer Reserve fuer den Vormerk-Loop danach.
    const eagerBudgetMs = Math.min(
      Number(process.env.HELMUT_CRAWL_UNDERSTAND_BUDGET_MS || 90000),
      Math.max(0, verbleibendMs() - 30000)
    );
    // ABSOLUTE Deadline statt Dauer: der Vormerk-Loop startet erst NACH dem
    // Verstehen — eine hier berechnete Dauer waere um dessen Laufzeit zu gross.
    const vormerkDeadlineMs = runStartedMs + runBudgetMs - 5000;
    const eagerResult = await runUnderstandingShadow(savedItems, {
      budgetMs: eagerBudgetMs,
      vormerkDeadlineMs,
      // Punkt 17: dieselbe Laufkennung, die recordProcessRun und
      // source_crawl_telemetry bereits tragen -> Kosten werden je Lauf messbar
      // statt ueber Zeitfenster rekonstruiert.
      runId
    }).catch((error) => ({ skipped: true, reason: "eager-error", error: error && error.message }));
    const eagerDurationMs = Date.now() - eagerStart;
    console.log(`[runSourceCrawl] eager-understanding ${eagerDurationMs}ms ${JSON.stringify({ processed: eagerResult && eagerResult.processed, deferred: eagerResult && eagerResult.deferred, reason: eagerResult && eagerResult.reason })}`);
    // P0-1: Understanding-Batch-Laufzeit persistieren (Auth-Store, scalar-only, korreliert ueber runId).
    // W-2: kein `.catch(() => {})` mehr — recordProcessRun wirft nicht, sondern
    // liefert ein Ergebnis; ein Telemetriefehler wird strukturiert geloggt
    // (intern) und hier zusaetzlich in der Lauf-Logzeile benannt.
    const eagerTelemetrie = await recordProcessRun({
      process: "understanding-eager", runId, mode, location,
      startedAt: new Date(eagerStart).toISOString(), finishedAt: new Date().toISOString(),
      durationMs: eagerDurationMs,
      processed: eagerResult && eagerResult.processed,
      deferred: eagerResult && eagerResult.deferred,
      skippedStore: eagerResult && eagerResult.counts && eagerResult.counts["skipped-store"],
      reason: eagerResult && eagerResult.reason,
      status: eagerResult && eagerResult.skipped ? "blocked" : "success",
      // Betriebsbefund B4: Ergebnis jedes Clusters mitschreiben. Ohne diese Zeile
      // bleibt der haeufigste Ausgang der Vorgangsbildung unsichtbar.
      telemetrie: eagerResult && eagerResult.telemetrie
    });
    if (!eagerTelemetrie.ok) {
      console.error(`[runSourceCrawl] LAUFTELEMETRIE NICHT GESPEICHERT (understanding-eager, runId ${runId})`);
    }
    // P0-3: Understanding-Fehler sichtbar machen — bisher still verschluckt.
    // Erfolgslaeufe (skipped=gated, oder saubere Verarbeitung) erzeugen KEINEN Eintrag.
    if (eagerResult && (eagerResult.reason === "eager-error" || (eagerResult.counts && eagerResult.counts["cluster-error"]))) {
      await recordPipelineError({ process: "understanding-eager", runId, errorType: eagerResult.error || "cluster-error" }).catch(() => {});
    }
    // V3-Schatten (C7a): Profil-Embedding aktualisieren + KOs matchen (kein KI-Call).
    // Hinter HELMUT_V3_MATCHING; fail-safe.
    // Review-Fix: recordPipelineError AWAITen — ein unawaited Read-modify-write des
    // Auth-Stores könnte NACH releasePipelineLock (im finally) landen und den gerade
    // freigegebenen Blob-Lock wieder auferstehen lassen (Crawl bis TTL blockiert).
    // Sprint 23B-1: runId/Ausloeser werden nur durchgereicht (Herkunft des
    // Laufs im Auditprotokoll). Ohne aktivierte Auditpersistenz sind beide
    // Felder wirkungslos — die Crawl-Logik selbst bleibt unveraendert.
    const matchingResult = await runMatchingShadow({
      profile,
      pipelineRunId: runId,
      ausloeser: options.mode === "lage-check" ? "lage-check" : "crawl"
    }).catch(async (error) => {
      await recordPipelineError({ process: "matching-shadow", runId, error }).catch(() => {});
      return null;
    });
    // V3 Decision Engine: pro Nutzer x Vorgang die deterministische Entscheidung
    // (score/decision/priority_type) erzeugen + speichern (kein KI-Call).
    // Gatet auf v3StoreReady; fail-safe.
    const decisionResult = await runDecisionShadow({ profile }).catch(async (error) => {
      await recordPipelineError({ process: "decision-shadow", runId, error }).catch(() => {});
      return null;
    });

    // --- Durchfluss-Zaehler + Quellen-Kategorien (additiv, fuer Admin-Datenstatus) ---
    const okById = new Map(crawl.results.map((r) => [r.sourceId, r.ok]));
    const sourcesByCategory = {};
    for (const s of selectedSources) {
      const cat = s.category || sourceSafety.categorizeSource(s);
      const b = sourcesByCategory[cat] || (sourcesByCategory[cat] = { checked: 0, ok: 0, failed: 0 });
      b.checked += 1;
      if (okById.get(s.id)) b.ok += 1; else b.failed += 1;
    }
    const loadedItems = crawl.results.reduce((sum, r) => sum + (r.itemCount || 0), 0) + dipRawItems.length;
    const newCandidateItems = crawl.newCandidateItems + dipRawItems.length;
    const newDocuments = savedItems.length;
    // P1-5: ehrlicher Durchsatz = ECHTE neue raw_documents (relationaler Delta),
    // NICHT der blob-cap-verzerrte savedItems-Zaehler. null = ehrlich UNBEKANNT, wenn
    // der relationale Pfad NICHT lief (v3-store aus -> skipped) ODER fehlschlug (error).
    // Review-Fix: skipped/error liefern persisted:0 — das wäre die Falschaussage "0 neu"
    // statt "unbekannt"; deshalb hier ausdrücklich auf null abbilden.
    const newRawDocuments = persistResult && !persistResult.skipped && !persistResult.error && Number.isFinite(persistResult.persisted)
      ? persistResult.persisted
      : null;
    const completeness = profileCompleteness(profile);

    // Phase 4 (Härtungs-Sprint): ehrliche Lauf-Klassifikation + Provider-Trennung.
    // Reine Zähler/Codes — keine Inhalte, keine URLs (Fehlerklassifikation wie
    // Quellen-Telemetrie). sourcesByIdMap wird unten auch für die Telemetrie genutzt.
    const sourcesByIdMap = {};
    for (const s of selectedSources) sourcesByIdMap[s.id] = s;
    const runState = classifyCrawlRunState({
      checkedSources: crawl.checkedSources,
      successfulSources: crawl.successfulSources,
      failedSources: crawl.failedSources,
      skippedSources: crawl.skippedSources || 0,
      // Zentraler Breaker-Abbruch getrennt von individuellen Quellenfehlern.
      circuitOpenSources: crawl.circuitOpenSources || 0,
      cooldownActive: cooldown.active
    });
    const providerBreakdown = buildProviderBreakdown(crawl.results, sourcesByIdMap);
    const errorCodes = summarizeErrorCodes(crawl.results);

    const run = await saveCrawlRun({
      mode,
      politicianId,
      // P0-1: echte Wall-Clock-Gesamtdauer + Laufkennung + Quellenmodus dieses Laufs.
      durationMs: Date.now() - runStartedMs,
      runId,
      sourceMode: runSourceMode,
      checkedSources: crawl.checkedSources,
      successfulSources: crawl.successfulSources,
      failedSources: crawl.failedSources,
      // Härtungs-Sprint: eindeutiger Lauf-Zustand + Provider-Trennung + Cooldown-
      // Status + Retry-Summe (technische Zähler, inhaltsfrei klassifizierte Codes).
      runState,
      providerBreakdown,
      errorCodes,
      skippedSources: crawl.skippedSources || 0,
      // Getrennte Zähler (Incident 2026-07-25): zentral abgebrochen vs. bewusst
      // übersprungen weil ein anderes Mandat denselben Weg schon geholt hat.
      circuitOpenSources: crawl.circuitOpenSources || 0,
      sharedSkippedSources: crawl.sharedSkippedSources || 0,
      retriesTotal: crawl.retriesTotal || 0,
      cooldown: { active: cooldown.active, skipGoogle: Boolean(cooldown.skipGoogle), reason: cooldown.reason || null },
      googleGate: crawl.googleGate || null,
      // Google-News-URL-Auflösung persistieren (Audit-Folgebranch): die Quote
      // stand bisher NUR im Console-Log; jetzt im Crawl-Lauf, damit Watchdog/
      // Admin eine stille Google-News-Degradation (Links kippen zu Proxy) sehen.
      googleUrlResolution: crawl.googleUrlResolution || null,
      newCandidateItems,
      savedItems: newDocuments,
      // P1-5: ehrlicher relationaler Durchsatz-Delta (kann null sein = unbekannt).
      newRawDocuments,
      // Neue, bereits berechnete Durchfluss-Zaehler (keine neue Analytics-Architektur):
      loadedItems,                                                  // roh eingesammelt
      discardedItems: Math.max(0, loadedItems - newCandidateItems), // Dedup-im-Lauf + 1000er-Cap
      duplicates: Math.max(0, newCandidateItems - newDocuments),    // ueber Laeufe bereits bekannt
      sourcesByCategory,                                            // Quellen nach Kategorie
      understanding: {
        processed: (eagerResult && eagerResult.processed) || 0,
        deferred: (eagerResult && eagerResult.deferred) || 0,
        reason: (eagerResult && eagerResult.reason) || null
      },
      matching: shadowSummary(matchingResult),
      decisions: shadowSummary(decisionResult),
      profileCompleteness: { level: completeness.level, restricted: completeness.restricted, missing: completeness.missing },
      errors: crawl.results.filter((result) => !result.ok).map((result) => ({ sourceName: result.sourceName, error: result.error }))
    });

    // P0-1: Pro-Quellenabruf-Telemetrie (16+ technische Felder je Quelle) in die
    // NEUE relationale Tabelle schreiben — FREIGABEPFLICHTIG + DEFAULT AUS
    // (HELMUT_SOURCE_TELEMETRY). Ohne Freigabe/Migration ein reiner No-Op. Fail-safe:
    // ein Telemetrie-Fehler beeinflusst den Crawl nie. Zuordnung neu/Duplikat/ignoriert
    // exakt ueber item.sourceId (keine Schaetzung), kein Dokumentinhalt.
    try {
      const newBySource = new Map();
      for (const it of savedItems) { const sid = it && it.sourceId; if (sid == null) continue; newBySource.set(sid, (newBySource.get(sid) || 0) + 1); }
      // Härtungs-Sprint: echte Retry-Zahl je Quelle (aus dem Crawler gemessen).
      const retryBySource = new Map();
      for (const r of crawl.results) { if (r && r.retryCount) retryBySource.set(r.sourceId, r.retryCount); }
      const telemetryRows = buildSourceTelemetryRows({
        runId,
        plannedProcess: options.plannedProcess || mode,
        followUpProcess: "understanding",
        sourceMode: runSourceMode,
        location,
        results: crawl.results,
        sourcesById: sourcesByIdMap,
        defaultLevel: profile && profile.politicalLevel,
        newBySource,
        retryBySource
      });
      await persistSourceCrawlTelemetry(telemetryRows, { insert: insertSourceCrawlTelemetry }).catch(() => {});
    } catch (error) {
      console.error("[runSourceCrawl] Quellen-Telemetrie fehlgeschlagen (ignoriert):", error && error.message);
    }
    return { ...run, savedItemsList: savedItems };
  } finally {
    await releasePipelineLock(lockName);
  }
}

// V3-Lage-Refresh: die frisch gecrawlten Lage-Items in V3-Daten falten
// (verstehen -> matchen -> neu bewerten). Ersetzt das V2-runMorningBriefing.
// Gleiche Funktionen + Reihenfolge wie runSourceCrawl (keine neue Architektur),
// zeitbudgetiert (Hänger-Schutz wie Step 1) und fail-safe (KEIN V2-Fallback).
async function foldLageItemsIntoV3(savedItems, profile, runId = null) {
  // 1. Roh-Dokumente in die V3-Tabellen spiegeln (gated, fail-safe).
  await persistRawDocumentsShadow(savedItems, { runId }).catch(() => {});
  // 2. Globales Understanding pro NEUEM Vorgang (KI), zeitbudgetiert — der serielle
  //    KI-Loop darf den lage-check-Cron nicht über das Serverless-Limit treiben.
  const understandStart = Date.now();
  const understanding = await runUnderstandingShadow(savedItems, {
    budgetMs: Number(process.env.HELMUT_LAGE_UNDERSTAND_BUDGET_MS || 60000),
    runId // Punkt 17: Laufkennung in den Kostenlog durchreichen
  }).catch((error) => ({ skipped: true, reason: "lage-understand-error", error: error && error.message }));
  const understandDurationMs = Date.now() - understandStart;
  console.log(`[runLageCheck] understanding ${understandDurationMs}ms ${JSON.stringify({ processed: understanding && understanding.processed, deferred: understanding && understanding.deferred, reason: understanding && understanding.reason })}`);
  // P0-1: Lage-Fold-Understanding-Laufzeit persistieren (Auth-Store, scalar-only).
  // W-2: kein `.catch(() => {})` mehr (siehe understanding-eager).
  const lageTelemetrie = await recordProcessRun({
    process: "understanding-lage", runId, mode: "lage-check", location: executionLocation(),
    startedAt: new Date(understandStart).toISOString(), finishedAt: new Date().toISOString(),
    durationMs: understandDurationMs,
    processed: understanding && understanding.processed,
    deferred: understanding && understanding.deferred,
    skippedStore: understanding && understanding.counts && understanding.counts["skipped-store"],
    reason: understanding && understanding.reason,
    status: understanding && understanding.skipped ? "blocked" : "success",
    telemetrie: understanding && understanding.telemetrie
  });
  if (!lageTelemetrie.ok) {
    console.error(`[runLageCheck] LAUFTELEMETRIE NICHT GESPEICHERT (understanding-lage, runId ${runId})`);
  }
  // P0-3: Lage-Understanding-Fehler sichtbar machen (bisher still verschluckt).
  if (understanding && (understanding.reason === "lage-understand-error" || (understanding.counts && understanding.counts["cluster-error"]))) {
    await recordPipelineError({ process: "understanding-lage", runId, errorType: understanding.error || "cluster-error" }).catch(() => {});
  }
  // 3. Matching + deterministische Entscheidungen neu erzeugen (0 KI).
  // Sprint 23B-1: siehe runSourceCrawl — nur Herkunftsangaben, keine
  // Aenderung der Lage-Logik. Der Auditpfad nimmt hier (und nur wenn er
  // aktiviert ist) dieselbe Sperre wie der Crawl-Pfad; das schliesst die in
  // Sprint 23A belegte Luecke, dass dieser Pfad bisher ungesperrt matcht.
  await runMatchingShadow({ profile, pipelineRunId: runId, ausloeser: "lage-check" }).catch((error) => {
    recordPipelineError({ process: "matching-lage", runId, error }).catch(() => {});
  });
  const decision = await runDecisionShadow({ profile }).catch((error) => ({ skipped: true, reason: "lage-decision-error", error: error && error.message }));
  if (decision && decision.reason === "lage-decision-error") {
    await recordPipelineError({ process: "decision-lage", runId, errorType: decision.error || "decision-error" }).catch(() => {});
  }
  return {
    understanding: { processed: Number(understanding?.processed || 0), deferred: Number(understanding?.deferred || 0), reason: understanding?.reason || null },
    decision: { saved: Number(decision?.saved || 0), reason: decision?.reason || null }
  };
}

async function runLageCheck(politicianId) {
  politicianId = requireTenantId(politicianId, "runLageCheck");
  // P0-1: echte Wall-Clock-Messung des GESAMTEN Lage-Checks + Laufkennung.
  const runStartedMs = Date.now();
  const runId = makeRunId("lage", runStartedMs);
  const runSourceMode = sourceMode();
  const location = executionLocation();
  const profile = await getActiveProfile(politicianId);
  // V3: Vorwissen kommt aus verstandenen Knowledge Objects, nicht aus dem V2-Blob.
  // Gleiche „verstanden"-Definition wie buildV3Briefing (status!==pending,
  // understanding_status=complete, mit Verständnis-Text) — kein V2-Fallback.
  const understoodBefore = (await listKnowledgeObjects({ limit: 200 }).catch(() => []))
    .filter((k) => k && k.status !== "pending" && k.understanding_status === "complete" && (k.was_ist_passiert || k.warum_wichtig));
  const hasV3PriorState = understoodBefore.length > 0;
  const allSources = await getSourcesForProfile(profile);
  const selectedSources = selectLageCheckSources(allSources, lageCheckSourceLimit, profile);
  // Google-News-Härtung: auch der Lage-Check läuft mit Gate (begrenzte Google-
  // Parallelität + Circuit Breaker + Breaker-Gedächtnis); Cooldown gilt hier
  // nicht (bereits quellen-reduziert).
  const lageHardening = googleHardeningConfig();
  // Auch der Lage-Check läuft je Mandat einmal (6 Mandate × 90 Wege um 10:00 UTC) und
  // traf dieselbe Egress-IP-Drosselung: 5 von 6 Läufen endeten mit 87/90 Fehlern
  // (Incident 2026-07-25). Geteilte Wege daher ebenfalls nur einmal pro Durchlauf
  // holen. Der Kandidaten-Pfad liest den GLOBALEN Rohbestand (getRawItemsSince) und
  // sieht die Dokumente des ersten Mandats deshalb weiterhin vollständig.
  const lageSharedLedger = lageHardening.enabled && lageHardening.sharedPathDedup
    ? sharedFetchLedger(lageHardening.sharedPathWindowMs)
    : null;
  const crawl = await crawlAllSources(selectedSources, {
    googleGate: lageHardening.enabled ? createGoogleNewsGate(lageHardening, { startOpen: googleBreakerMemoryActive(lageHardening) }) : null,
    hardeningConfig: lageHardening,
    sharedLedger: lageSharedLedger
  });
  rememberGoogleBreakerState(crawl.googleGate);
  const savedItems = await saveRawItems(crawl.rawItems);
  // P0-1: Pro-Quellenabruf-Telemetrie auch fuer den Lage-Check (freigabepflichtig, default aus, fail-safe).
  try {
    const newBySource = new Map();
    for (const it of savedItems) { const sid = it && it.sourceId; if (sid == null) continue; newBySource.set(sid, (newBySource.get(sid) || 0) + 1); }
    // Härtungs-Sprint: echte Retry-Zahl je Quelle auch im Lage-Check (Review-Fix).
    const retryBySource = new Map();
    for (const r of crawl.results) { if (r && r.retryCount) retryBySource.set(r.sourceId, r.retryCount); }
    const sourcesById = {};
    for (const s of selectedSources) sourcesById[s.id] = s;
    const telemetryRows = buildSourceTelemetryRows({
      runId, plannedProcess: "lage-check", followUpProcess: "understanding",
      sourceMode: runSourceMode, location, results: crawl.results, sourcesById,
      defaultLevel: profile && profile.politicalLevel, newBySource, retryBySource
    });
    await persistSourceCrawlTelemetry(telemetryRows, { insert: insertSourceCrawlTelemetry }).catch(() => {});
  } catch (error) {
    console.error("[runLageCheck] Quellen-Telemetrie fehlgeschlagen (ignoriert):", error && error.message);
  }
  const recentItems = await getRawItemsSince(new Date(Date.now() - lageCheckRecentHours * 60 * 60 * 1000));
  const memoryEntries = await getTopicMemory(profile.id);
  const relevantItems = filterRelevantItemsForProfile(recentItems, profile);
  const savedHashes = new Set(savedItems.map((item) => item.hash || item.id).filter(Boolean));
  const newRelevantItems = relevantItems.filter((item) => savedHashes.has(item.hash || item.id));
  const notPreviouslyFeatured = filterPreviouslyFeaturedItems(relevantItems, memoryEntries);
  const candidateBase = filterRecentlyFeaturedTopics(newRelevantItems.length ? newRelevantItems : notPreviouslyFeatured, memoryEntries, topTopicCooldownHours);
  const candidates = candidateBase
    .map((item) => ({ item, weight: itemPoliticalWeight(item, profile) }))
    .sort((a, b) => b.weight - a.weight);
  const topCandidate = candidates[0] || null;
  // „Refresh" heißt in V3: die neue Lage in die V3-Daten falten (kein V2-Briefing).
  // Ausgelöst, wenn es noch KEIN verstandenes V3-Vorwissen gibt ODER ein starker
  // neuer Kandidat auftaucht — identische Schwelle wie bisher.
  const shouldRefresh = !hasV3PriorState || Number(topCandidate?.weight || 0) >= lageCheckRegenerateThreshold;
  const status = shouldRefresh && topCandidate ? "changed" : "stable";
  const check = await saveLageCheck({
    politicianId: profile.id,
    mode: "lage-check",
    status,
    // P0-1: echte Gesamtdauer des Lage-Checks + Laufkennung (technische Metadaten).
    durationMs: Date.now() - runStartedMs,
    runId,
    checkedSources: crawl.checkedSources,
    successfulSources: crawl.successfulSources,
    failedSources: crawl.failedSources,
    newCandidateItems: crawl.newCandidateItems,
    savedItems: savedItems.length,
    relevantItems: relevantItems.length,
    newRelevantItems: newRelevantItems.length,
    // V3: Es wird NIE ein V2-Briefing regeneriert -> Legacy-Feld bleibt immer false.
    // Ob die neue Lage in V3 gefaltet wurde, sagt v3Refreshed (unten gesetzt).
    regeneratedBriefing: false,
    v3Refreshed: false,
    sourceLimit: selectedSources.length,
    topChange: topCandidate ? lageCheckTopChange(topCandidate.item, topCandidate.weight) : null,
    message: topCandidate && status === "changed"
      ? `Neue Lage erkannt: ${topCandidate.item.title}. Helmut priorisiert neu.`
      : stableLageCheckMessage()
  });

  if (!shouldRefresh) {
    return { ...check };
  }

  // V3 statt V2: neue Lage in Knowledge Objects + Decisions falten (kein V2-Briefing).
  const v3Refresh = await foldLageItemsIntoV3(savedItems, profile, runId);
  const updatedCheck = await saveLageCheck({
    ...check,
    // KEIN V2-Briefing regeneriert (bleibt false); der V3-Refresh ist gelaufen.
    regeneratedBriefing: false,
    v3Refreshed: true,
    message: topCandidate
      ? `Neue Lage erkannt: ${topCandidate.item.title}. Deine Priorität wurde geprüft.`
      : "Helmut hat die Lage neu bewertet."
  });
  return { ...updatedCheck, v3Refresh };
}

function selectLageCheckSources(sources = [], limit = lageCheckSourceLimit, profile = null) {
  const seen = new Set();
  const strategicTerms = lageCheckStrategicTerms(profile);
  return [...sources]
    .filter((source) => source && source.active !== false && !seen.has(source.id) && seen.add(source.id))
    .sort((a, b) => lageCheckSourceWeight(b, strategicTerms) - lageCheckSourceWeight(a, strategicTerms))
    .slice(0, Math.max(20, limit));
}

// Strategische Begriffe fuer den Lage-Check-Bonus: NEUTRALE Institutions-/
// Struktur-Begriffe fuer alle Mandate + PROFILGETRIEBENE Begriffe (Partei/
// Fraktion/relevante Ministerien des Mandats). Frueher stand hier die Partei-,
// Gewerkschafts- und Ministeriumsauswahl des Piloten hartkodiert im Regex.
function lageCheckStrategicTerms(profile = null) {
  const generic = ["bundesregierung", "bundestag", "ausschuss", "tagesschau", "deutschlandfunk", "person", "news-suche"];
  // Profilwerte zusaetzlich in Einzelworte (>= 4 Zeichen) zerlegen, damit z. B.
  // eine Partei "Die Beispielpartei" auch die Fraktions-/Kurzbenennungen ihrer
  // Quellen trifft ("beispielpartei" in "beispielpartei-fraktion").
  const personal = [];
  if (profile) {
    for (const raw of [profile.party, profile.faction, ...(profile.relevantMinistries || [])]) {
      const value = String(raw || "").trim().toLowerCase();
      if (value.length >= 3) personal.push(value);
      for (const word of value.split(/[^a-z0-9äöüß]+/)) {
        if (word.length >= 4) personal.push(word);
      }
    }
  }
  return [...new Set([...generic, ...personal])];
}

function lageCheckSourceWeight(source = {}, strategicTerms = lageCheckStrategicTerms()) {
  const type = String(source.type || "").toLowerCase();
  const name = `${source.name || ""} ${source.id || ""}`.toLowerCase();
  const base = Number(source.priority || 0);
  const typeWeight = type === "person" ? 1000
    : ["ministry", "bundestag", "committee", "government"].includes(type) ? 900
      : ["party", "faction"].includes(type) ? 850
        : type === "association" ? 720
          : type === "media" ? 650
            : type === "local" ? 600
              : type === "social" ? 250
                : 400;
  const strategicBonus = strategicTerms.some((term) => name.includes(term)) ? 120 : 0;
  return typeWeight + strategicBonus + base;
}

function lageCheckTopChange(item, weight) {
  const source = item.primarySource || item.sources?.[0] || item;
  return {
    title: item.title,
    sourceName: source.sourceName || item.sourceName || "",
    url: source.itemUrl || source.url || item.url || "",
    publishedAt: item.publishedAt,
    retrievedAt: item.retrievedAt,
    politicalWeight: weight
  };
}

// V3: Die stabile Lage-Meldung liest keinen V2-Briefing-Blob mehr. Der Fokus-Titel
// entsteht ohnehin frisch aus den Knowledge Objects (Lage-Ansicht), deshalb hier
// eine neutrale, ehrliche „nichts Neues"-Meldung ohne V2-Feldzugriff.
function stableLageCheckMessage() {
  return "Priorität unverändert. Helmut hat die Lage geprüft und hebt aktuell nichts Neues nach oben.";
}

function preciseSources(sources) {
  const byUrl = new Map();
  for (const source of sources || []) {
    const url = isPreciseArticleUrl(source?.itemUrl, source) ? source.itemUrl
      : isPreciseArticleUrl(source?.url, source) ? source.url
      : isPreciseArticleUrl(source?.originalUrl, {}) ? source.originalUrl
      : "";
    if (!url || byUrl.has(url)) continue;
    byUrl.set(url, {
      ...source,
      itemUrl: url,
      url,
      linkType: "direct",
      linkResolutionNote: "Direkter Artikellink gefunden."
    });
  }
  return Array.from(byUrl.values());
}

// Profilbasierte Ingestion: die Quellen eines Laufs entstehen aus dem
// Mandatsprofil (Person, Partei/Fraktion, Ministerien, Ausschuss, Themen,
// Ebene/Bundesland) — KEINE hartkodierten Personen-/Mandatsthemen. Jede Quelle traegt
// zusaetzlich Kategorie + Vertrauensstufe (fuer Source-Guard + Admin-Sichtbarkeit).
// Quellenmodus (HELMUT_SOURCE_MODE, Default off — siehe source-mode.js):
//   off/shadow -> alter Katalog bleibt AKTIVE Quellenwahrheit (byte-identisch; shadow
//                 vergleicht nur im Admin-Report/isolierten Läufen, NIE hier).
//   on         -> CUTOVER (freigabepflichtig, hier gebaut aber nicht aktiviert): der
//                 relationale Plan liefert die geteilten Quellen; der alte Katalog bleibt
//                 FALLBACK bei Ladefehler oder leerem Plan. Profilgenerierte Quellen
//                 (Personen-/Mandatssuche) bleiben erhalten; doppelte Abruf-URLs laufen
//                 genau einmal (mergeProfileAndPlanSources).
// V-2 (2026-07-26): Diese Funktion nahm KEINEN Profilparameter — sie baute einen globalen
// Plan und der Aufrufer mischte ihn unverändert in die Quellenliste JEDES Profils. Für
// Bundes-/neutrale Wege ist das gewollt (ein Weg läuft systemweit genau einmal, der Rohkorpus
// ist mandantenneutral). Für LANDESMODULE war es falsch: ein einziges Berliner Landtagsmandat
// hätte die Berliner Wege in den Abruf jedes Bundestagsmandats gelegt. Der Plan bleibt global,
// die Landesmodul-Wege werden auf die Länder des übergebenen Profils eingeschränkt
// (planQuellenFuerProfil, source-mode.js).
async function loadRelationalSharedSources(profile) {
  const rows = await storageListSourceArchitectureRows();
  if (!rows || !Array.isArray(rows.retrievalPaths) || rows.retrievalPaths.length === 0) return null;
  const [legacySources, profiles] = await Promise.all([
    getSources().catch(() => []),
    listFullProfiles().catch(() => [])
  ]);
  const plan = buildRelationalCrawlPlan({
    retrievalPaths: rows.retrievalPaths,
    packages: rows.packages,
    packagePaths: rows.packagePaths,
    profiles: Array.isArray(profiles) ? profiles : [],
    legacySources: Array.isArray(legacySources) ? legacySources : []
  });
  if (!plan.aktiv.length) return null; // leerer Plan -> Fallback alter Katalog
  // Bewusst KEIN Fallback bei leerer Profilmenge: eine leere profilbezogene Auswahl bei
  // nicht-leerem Plan wäre ein ehrliches Ergebnis, kein Ladefehler — der alte Katalog würde
  // das Landesmodul-Gate hier gerade umgehen.
  return planQuellenFuerProfil(plan, profile);
}

async function getSourcesForProfile(profile) {
  // CUTOVER-Pfad (nur Modus 'on'; Default off = unverändert alter Katalog).
  if (sourceMode() === "on") {
    try {
      const planSources = await loadRelationalSharedSources(profile);
      if (planSources) {
        const completeness = profileCompleteness(profile);
        const profileSources = completeness.empty
          ? []
          : [personNewsSource(profile), ...mandateNewsSources(profile)];
        return mergeProfileAndPlanSources(profileSources, planSources).map(withSafetyTags);
      }
      console.warn("[getSourcesForProfile] Quellenmodus on: relationaler Plan leer/nicht ladbar — Fallback alter Katalog.");
    } catch (error) {
      console.error("[getSourcesForProfile] Quellenmodus on fehlgeschlagen — Fallback alter Katalog:", error.message);
    }
  }
  const sharedRaw = (await getSources()).filter((source) => source.type !== "person");
  const completeness = profileCompleteness(profile);
  // SaaS-Entkopplung: den geteilten Katalog PROFILBASIERT filtern. Neutrale Basis
  // (Institutionen/alle Ausschüsse/alle Fraktionen/Leitmedien) gilt für jedes Mandat;
  // sozial-thematische, partei- oder regional-gebundene Quellen NUR bei passendem
  // Profil. Kein Sozialthema und keine Partei ist mehr allgemeiner Produktstandard.
  const ctx = sourceProfileContext(profile);
  // LANDESMODUL-RIEGEL AUCH IM FALLBACK (V-2, adversarialer Punkt 5): der alte Katalog kennt
  // das Gate aus buildRelationalCrawlPlan nicht. Heute enthält er nachweislich keine
  // Landesmodul-Quelle — das ist Datenlage, keine Sperre. Hier wird sie strukturell: eine
  // Katalogquelle mit Landespräfix läuft nur, wenn ihr Land für DIESES Profil wirksam ist.
  const erlaubteLaender = new Set(
    [...laenderMitBerechtigtemMandat([profile])].filter((land) => freigegebeneLandesmodule().has(land))
  );
  const sharedSources = sharedRaw.filter((s) => !landesmodulQuelleGesperrt(s, erlaubteLaender)
    && sourceAllowedForProfile(s, ctx));
  // Leeres Profil (weder Name noch Partei): NUR neutrale Basis, KEINE Personensuche
  // mit Platzhalter-id, keine profil-losen Themenquellen -> eingeschränkt statt Raten.
  const profileSources = completeness.empty
    ? []
    : [personNewsSource(profile), ...mandateNewsSources(profile)];
  // Dubletten-Schutz auch im Fallback-Pfad (alter Katalog): eine source_id läuft
  // genau einmal — Telemetrie/Zähler schlüsseln über source_id (siehe source-mode.js).
  return dedupeSourcesById([...profileSources, ...sharedSources]).map(withSafetyTags);
}

// Profil -> Match-Kontext (Themen/Partei/Region, kleingeschrieben) für die Auswahl
// der geteilten Quellen.
function sourceProfileContext(profile = {}) {
  const lc = (arr) => uniqueTerms(arr).map((t) => String(t).toLowerCase()).filter(Boolean);
  return {
    topics: lc([
      ...(profile.focusTopics || []),
      ...Object.keys(profile.topicPriorities || {}),
      profile.committee, ...(profile.committees || []),
      ...(profile.relevantMinistries || [])
    ]),
    parties: lc([profile.party, profile.faction]),
    regions: lc([
      profile.state, profile.constituency, profile.location,
      ...(profile.regionalInterests || []), ...(profile.localMedia || [])
    ]).filter((t) => t.length >= 3)
  };
}

// Wortgrenzen-Match für Themenbegriffe: ein Themenbegriff (term) gilt nur dann als
// Treffer in einem Profilthema (topic), wenn er dort als eigenes Wort ODER als
// Wortanfang eines Kompositums vorkommt (deutsche Präfix-Komposita:
// "pflege" -> "pflegeversicherung"). KEIN blindes Substring-Matching und KEINE
// Rückwärtsrichtung mehr. Dadurch:
//  - "pflege" trifft NICHT "Denkmalpflege"/"Landschaftspflege" (pflege dort Suffix),
//  - kurze Profilbegriffe wie "IT" triggern nichts über "Arbeitszeit",
//  - echte Pflegepolitik (Altenpflege/Krankenpflege sind eigene Begriffe) matcht weiter.
// Erwartet klein geschriebene Eingaben (ctx.topics + SOCIAL_THEME_TERMS sind lc).
function themeTermInTopic(term, topic) {
  if (!term || !topic) return false;
  let from = 0;
  for (;;) {
    const idx = topic.indexOf(term, from);
    if (idx < 0) return false;
    const before = idx === 0 ? "" : topic[idx - 1];
    if (idx === 0 || !/[a-z0-9äöüß]/.test(before)) return true; // Wortanfang erreicht
    from = idx + 1;
  }
}

// Darf eine geteilte Quelle für dieses Profil genutzt werden?
// neutral (default) -> immer; sonst nur bei Thema-/Partei-/Region-Treffer.
function sourceAllowedForProfile(source = {}, ctx) {
  // VORBEREITETE Quellen (active: false) laufen in KEINEM Pfad. Der relationale Plan schliesst
  // sie ueber status='paused' aus (source-mode Regel 4); dieser Riegel deckt den Fallback-Pfad
  // ab, der den Katalog direkt profilbasiert filtert. Ohne ihn waere die vorbereitete
  // Regionalbasis (Punkt 13) im Fallback gecrawlt worden — genau die Kosten, die vermieden
  // werden sollen. Heute betrifft das ausschliesslich die benannte Niedersachsen-Basis.
  if (source.active === false) return false;
  if (source.neutral !== false) return true;                       // neutrale Basis
  if (source.demoOnly || source.type === "person") return false;   // nie über geteilten Katalog
  const themeMatch = () => Array.isArray(source.themeTerms) && source.themeTerms.length
    && source.themeTerms.some((t) => ctx.topics.some((p) => themeTermInTopic(t, p)));
  if (source.regional) {
    const nameLc = String(source.name || "").toLowerCase();
    if (!ctx.regions.some((r) => nameLc.includes(r))) return false;
    if (Array.isArray(source.themeTerms) && source.themeTerms.length) return Boolean(themeMatch());
    return true;
  }
  if (source.party) {
    const partyLc = String(source.party).toLowerCase();
    return ctx.parties.some((p) => p.includes(partyLc) || partyLc.includes(p));
  }
  if (Array.isArray(source.themeTerms) && source.themeTerms.length) return Boolean(themeMatch());
  return false; // themenspezifisch ohne verwertbare Merkmale -> kein Standard
}

// Kleiner, sicherer Auszug eines Schatten-Runner-Ergebnisses (nur Skalare) fuer den
// Crawl-Run-Datensatz. Unbekannte/leere Formen -> null bzw. {ok:true}.
function shadowSummary(result) {
  if (!result || typeof result !== "object") return null;
  const out = {};
  if (result.skipped) out.skipped = true;
  if (result.reason) out.reason = String(result.reason);
  for (const k of ["candidates", "saved", "matched", "count", "processed", "updated"]) {
    if (typeof result[k] === "number") out[k] = result[k];
  }
  if (result.saved && typeof result.saved === "object" && typeof result.saved.saved === "number") out.saved = result.saved.saved;
  return Object.keys(out).length ? out : { ok: true };
}

// Kategorie + Vertrauensstufe an eine Quelle heften (respektiert bereits gesetzte
// Felder, leitet sonst regelbasiert aus Typ/Domain ab). Rein additiv.
function withSafetyTags(source) {
  return {
    ...source,
    category: sourceSafety.categorizeSource(source),
    trust: sourceSafety.trustForSource(source)
  };
}

function hasStr(v) { return String(v || "").trim().length > 0; }
function firstNonEmpty(list) { return (list || []).map((v) => String(v || "").trim()).find(Boolean) || ""; }
function quoteTerm(t) { const s = String(t || "").trim(); return /\s/.test(s) ? `"${s}"` : s; }

function personNewsSource(profile) {
  const fullName = String(profile.fullName || "").trim();
  const query = fullName ? `"${fullName}"` : `"${profile.id}"`;
  const archiveQuery = `${query} when:3m`;
  const encoded = encodeURIComponent(query);
  const encodedArchive = encodeURIComponent(archiveQuery);
  return {
    id: `${profile.id}-news`,
    name: `${fullName || profile.id} News-Suche`,
    type: "person",
    category: "profil",
    url: `https://news.google.com/search?q=${encoded}`,
    rssUrl: `https://news.google.com/rss/search?q=${encoded}&hl=de&gl=DE&ceid=DE:de`,
    rssUrls: [
      `https://news.google.com/rss/search?q=${encoded}&hl=de&gl=DE&ceid=DE:de`,
      `https://news.google.com/rss/search?q=${encodedArchive}&hl=de&gl=DE&ceid=DE:de`
    ],
    crawlMethod: "rss",
    priority: 100,
    // Betreiber-Knopf (frueher am Katalogeintrag der Personenquelle): begrenzt
    // die Personensuche JEDES Mandats; Default bleibt 30.
    maxItems: Number(process.env.HELMUT_PERSON_NEWS_MAX_ITEMS || 30),
    active: true,
    // Kennzeichnet, ob die Such-Query aus einem echten Vollnamen stammt (true)
    // oder mangels fullName nur aus dem Mandats-Slug abgeleitet wurde (false).
    // Bei source_id-Kollision im Crawl-Plan gewinnt dann der kuratierte
    // relationale Weg (dedupeSourcesById, source-mode.js).
    nameQueryComplete: Boolean(fullName),
    queryTerms: personSearchTerms(profile)
  };
}

// Profil-Quellen: jede Quelle wird NUR gebaut, wenn das Profil die noetigen
// Merkmale liefert. Fehlt ein Merkmal, entfaellt die Quelle (kein harter Fallback).
function mandateNewsSources(profile) {
  const topics = topProfileTopics(profile, 5);
  const topicQuery = topics.length ? topics.slice(0, 5).map(quoteTerm).join(" OR ") : "";
  const factionTerms = uniqueTerms([profile.party, profile.faction]);
  const ministries = (profile.relevantMinistries || [])
    .map((m) => String(m || "").trim())
    .filter((m) => m && !/^bundesregierung$/i.test(m));
  const govActors = uniqueTerms(["Bundesregierung", "Bundeskabinett", ...ministries]);
  const committee = firstNonEmpty([profile.committee, (profile.committees || [])[0]]);
  const level = parliamentTypeOf(profile);
  const state = String(profile.state || "").trim();
  const sources = [];

  // 1. Regierungs-/Ministeriums-Vorhaben zu den Profil-Themen (nur mit Themen).
  if (topicQuery) {
    sources.push(newsSearchSource({
      id: `${profile.id}-news-regierung-vorhaben`,
      name: "Regierungsvorhaben zu deinen Themen",
      query: `(${govActors.map(quoteTerm).join(" OR ")}) (${topicQuery}) (Gesetzentwurf OR Eckpunkte OR Reform OR Initiative OR Vorhaben OR Kabinett)`,
      priority: 94,
      category: "offiziell",
      queryTerms: [...govActors, "Gesetzentwurf", "Eckpunkte", "Reform", "Vorhaben", ...topics]
    }));
  }
  // 2. Fraktion/Partei-Lage (nur mit Partei/Fraktion im Profil).
  if (factionTerms.length) {
    const partyQuery = factionTerms.map(quoteTerm).join(" OR ");
    sources.push(newsSearchSource({
      id: `${profile.id}-news-fraktion-partei`,
      name: "Fraktion und Partei Lage",
      query: topicQuery ? `(${partyQuery}) (${topicQuery})` : partyQuery,
      priority: 90,
      category: "partei_fraktion",
      queryTerms: [...factionTerms, ...topics]
    }));
  }
  // 3. Ministeriums-Radar (nur mit Ministerien im Profil).
  if (ministries.length) {
    sources.push(newsSearchSource({
      id: `${profile.id}-news-ministerien`,
      name: "Ministeriums-Radar",
      query: `(${ministries.map(quoteTerm).join(" OR ")})${topics.length ? " " + topics.slice(0, 3).map(quoteTerm).join(" ") : ""}`,
      priority: 88,
      category: "offiziell",
      queryTerms: [...ministries, ...topics]
    }));
  }
  // 4. Ausschuss-Themenradar (nur mit Ausschuss im Profil).
  if (committee) {
    sources.push(newsSearchSource({
      id: `${profile.id}-news-ausschuss-themen`,
      name: `${committee} Themenradar`,
      query: topicQuery ? `"${committee}" (${topicQuery})` : `"${committee}"`,
      priority: 84,
      category: "offiziell",
      queryTerms: [committee, ...topics]
    }));
  }
  // 5. Themen-Medienlage (nur mit Themen).
  if (topicQuery) {
    sources.push(newsSearchSource({
      id: `${profile.id}-news-themen-medien`,
      name: "Themen-Medienlage",
      query: `(${topicQuery}) (Bundesregierung OR Gesetzentwurf OR Reform)`,
      priority: 78,
      category: "medien",
      queryTerms: ["Bundesregierung", "Gesetzentwurf", "Reform", ...topics]
    }));
  }
  // 6. Landtag/Landes-Ebene: bei Landtag + Bundesland Landes-/Regionalquellen.
  if (level === "Landtag" && state) {
    sources.push(newsSearchSource({
      id: `${profile.id}-news-landtag`,
      name: `Landtag ${state}`,
      query: `("Landtag ${state}" OR "Landesregierung ${state}" OR "${state}")${topics.length ? " (" + topicQuery + ")" : ""}`,
      priority: 92,
      category: "regional",
      queryTerms: [`Landtag ${state}`, `Landesregierung ${state}`, state, ...topics]
    }));
  }
  // 7. Regionale Lage: Wahlkreis / Bundesland / regionale Interessen (nur wenn vorhanden;
  //    kein Raten). Bringt constituency/state/regionalInterests in die Ingestion.
  const regionTerms = uniqueTerms([profile.constituency, profile.state, ...(profile.regionalInterests || [])])
    .filter((t) => String(t).trim().length >= 3);
  if (regionTerms.length) {
    sources.push(newsSearchSource({
      id: `${profile.id}-news-region`,
      name: "Regionale Lage",
      query: `(${regionTerms.slice(0, 6).map(quoteTerm).join(" OR ")})${topicQuery ? ` (${topicQuery})` : ""}`,
      priority: 82,
      category: "regional",
      queryTerms: [...regionTerms, ...topics]
    }));
  }
  return sources;
}

function newsSearchSource({ id, name, query, priority, queryTerms, category = "medien" }) {
  const encoded = encodeURIComponent(query);
  return {
    id,
    name,
    type: "media",
    category,
    url: `https://news.google.com/search?q=${encoded}`,
    rssUrl: `https://news.google.com/rss/search?q=${encoded}&hl=de&gl=DE&ceid=DE:de`,
    rssUrls: [`https://news.google.com/rss/search?q=${encoded}&hl=de&gl=DE&ceid=DE:de`],
    crawlMethod: "rss",
    priority,
    maxItems: Number(process.env.HELMUT_PROFILE_NEWS_MAX_ITEMS || 24),
    active: true,
    queryTerms
  };
}

// Profil-Themen aus topicPriorities + focusTopics. Es gibt KEINE Standardthemen
// mehr: jedes Mandat bekommt ausschliesslich die Themen seines eigenen Profils.
function topProfileTopics(profile, limit = 5) {
  const prioritized = Object.entries(profile.topicPriorities || {})
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
    .map(([topic]) => topic);
  return uniqueTerms([
    ...prioritized,
    ...(profile.focusTopics || [])
  ]).slice(0, limit);
}

function topicMemoryKey(value) {
  return String(value || "topic")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "topic";
}

function filterRelevantItemsForProfile(items, profile) {
  profile = requiredProfile(profile, "filterRelevantItemsForProfile");
  return analyzeItemsForProfile(items, profile)
    .filter((diagnostic) => diagnostic.decision === "accepted")
    .map((diagnostic) => diagnostic.item)
    .sort((a, b) => itemPoliticalWeight(b, profile) - itemPoliticalWeight(a, profile))
    .slice(0, 25);
}

function filterPreviouslyFeaturedItems(items, memoryEntries = []) {
  const featured = priorFeaturedSourceKeys(memoryEntries);
  if (!featured.urls.size && !featured.hashes.size) return items || [];
  return (items || []).filter((item) => {
    const keys = sourceKeysForFreshness(item);
    const repeatedUrl = keys.urls.some((url) => featured.urls.has(url));
    const repeatedHash = keys.hashes.some((hash) => featured.hashes.has(hash));
    return !repeatedUrl && !repeatedHash;
  });
}

function filterRecentlyFeaturedTopics(items, memoryEntries = [], cooldownHours = topTopicCooldownHours) {
  const blocked = recentFeaturedTopicKeys(memoryEntries, cooldownHours);
  if (!blocked.size) return items || [];
  return (items || []).filter((item) => {
    const keys = semanticTopicKeysForItem(item);
    return !keys.some((key) => blocked.has(key));
  });
}

function recentFeaturedTopicKeys(memoryEntries = [], cooldownHours = topTopicCooldownHours) {
  const cutoff = Date.now() - Math.max(1, Number(cooldownHours || 36)) * 60 * 60 * 1000;
  const keys = new Set();
  for (const entry of memoryEntries || []) {
    const lastSeenAt = new Date(entry.lastSeenAt || entry.updatedAt || entry.firstSeenAt || 0).getTime();
    if (!lastSeenAt || Number.isNaN(lastSeenAt) || lastSeenAt < cutoff) continue;
    semanticTopicKeysForText(`${entry.topicKey || ""} ${entry.title || ""} ${entry.lastAction || ""} ${entry.lastStatement || ""}`)
      .forEach((key) => keys.add(key));
  }
  return keys;
}

function semanticTopicKeysForItem(item = {}) {
  return semanticTopicKeysForText(`${item.title || ""} ${item.topic || ""} ${item.content || ""} ${item.summary || ""}`);
}

function semanticTopicKeysForText(value) {
  const text = String(value || "").toLowerCase();
  const keys = new Set();
  const rules = [
    ["rentenpaket", ["rentenpaket", "rentenreform", "rentenkommission", "rente", "frührente", "alterssicherung"]],
    ["buergergeld", ["bürgergeld", "buergergeld", "grundsicherung", "sanktion"]],
    ["pflege", ["pflege", "pflegeversicherung", "pflegereform", "krankenhausreform", "gesundheit"]],
    ["mindestlohn", ["mindestlohn", "lohnuntergrenze"]],
    ["tariftreue", ["tariftreue", "tarifbindung", "bundestariftreuegesetz", "tarifvertrag"]],
    ["arbeitszeit", ["arbeitszeit", "arbeitszeitgesetz", "arbeitsschutz"]],
    ["arbeitsmarkt", ["arbeitsmarkt", "beschäftigung", "beschaeftigung", "arbeitslosigkeit", "fachkräfte", "fachkraefte"]],
    ["armut-sozialstaat", ["armut", "sozialstaat", "wohngeld", "sozialversicherung"]]
  ];
  for (const [key, terms] of rules) {
    if (terms.some((term) => text.includes(term))) keys.add(key);
  }
  const normalized = topicMemoryKey(text);
  if (normalized) keys.add(normalized);
  return Array.from(keys);
}

function priorFeaturedSourceKeys(memoryEntries = []) {
  const urls = new Set();
  const hashes = new Set();
  for (const entry of memoryEntries || []) {
    for (const url of entry.sourceUrls || []) {
      const normalized = normalizeFreshnessUrl(url);
      if (normalized) urls.add(normalized);
    }
    for (const hash of entry.sourceHashes || []) {
      const normalized = String(hash || "").trim();
      if (normalized) hashes.add(normalized);
    }
  }
  return { urls, hashes };
}

function sourceKeysForFreshness(item = {}) {
  const urls = [
    item.itemUrl,
    item.url,
    item.originalUrl,
    item.sourceUrl,
    item.primarySource?.itemUrl,
    item.primarySource?.url,
    ...(item.sources || []).flatMap((source) => [source.itemUrl, source.url, source.originalUrl])
  ].map(normalizeFreshnessUrl).filter(Boolean);
  const hashes = [
    item.hash,
    item.id,
    item.rawItemId,
    item.signalId,
    item.primarySource?.id,
    ...(item.sources || []).flatMap((source) => [source.rawItemId, source.id, source.hash])
  ].map((value) => String(value || "").trim()).filter(Boolean);
  return {
    urls: Array.from(new Set(urls)),
    hashes: Array.from(new Set(hashes))
  };
}

function normalizeFreshnessUrl(value) {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((param) => url.searchParams.delete(param));
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function analyzeItemsForProfile(items, profile) {
  profile = requiredProfile(profile, "analyzeItemsForProfile");
  return (items || []).map((item) => analyzeItemForProfile(item, profile));
}

function analyzeItemForProfile(item, profile) {
  profile = requiredProfile(profile, "analyzeItemForProfile");
  const profileRelevantTerms = buildRelevantTerms(profile);
  const mandateTerms = buildMandateTerms(profile);
  const text = `${item.title || ""} ${item.content || ""} ${item.sourceName || ""}`.toLowerCase();
  const matchedRelevantTerms = profileRelevantTerms.filter((term) => hasTerm(text, term) || (String(term).length >= 6 && text.includes(String(term).toLowerCase())));
  const matchedMandateTerms = mandateTerms.filter((term) => hasTerm(text, term) || (String(term).length >= 6 && text.includes(String(term).toLowerCase())));
  const matchedTriggers = decisionTriggerTerms.filter((term) => hasTerm(text, term) || text.includes(String(term).toLowerCase()));
  const matchedWeakProtocol = weakProtocolTerms.filter((term) => hasTerm(text, term) || text.includes(String(term).toLowerCase()));
  const reasons = [];
  const rejectionReasons = [];

  if (isGenericSourcePage(item)) rejectionReasons.push("Generische Quellen- oder Startseite");
  if (isLowValuePublisher(item)) rejectionReasons.push("Niedrigwertiger Publisher/PR-Verteiler");
  const decisionRelevant = isDecisionRelevantForProfile(item, profile);
  if (!decisionRelevant) rejectionReasons.push(decisionRelevanceRejectionReason(item, profile));
  if (!matchedRelevantTerms.length) rejectionReasons.push("Kein Treffer im Mandatsprofil");

  if (matchedRelevantTerms.length) reasons.push(`Mandatsprofil: ${matchedRelevantTerms.slice(0, 4).join(", ")}`);
  if (matchedMandateTerms.length) reasons.push(`Ausschuss/Thema: ${matchedMandateTerms.slice(0, 4).join(", ")}`);
  if (matchedTriggers.length) reasons.push(`Handlungssignal: ${matchedTriggers.slice(0, 4).join(", ")}`);
  if (matchedWeakProtocol.length) reasons.push(`Protokollsignal: ${matchedWeakProtocol.slice(0, 3).join(", ")}`);

  const accepted = rejectionReasons.length === 0;
  return {
    item,
    rawItemId: item.id,
    title: item.title,
    sourceName: item.sourceName,
    sourceType: item.sourceType,
    url: item.url,
    sourceUrl: item.sourceUrl,
    originalUrl: item.originalUrl,
    linkType: item.linkType,
    linkResolutionNote: item.linkResolutionNote,
    publishedAt: item.publishedAt,
    retrievedAt: item.retrievedAt,
    confidence: item.confidence,
    politicalWeight: itemPoliticalWeight(item, profile),
    decision: accepted ? "accepted" : "rejected",
    reasons: accepted ? reasons : rejectionReasons,
    matchedRelevantTerms: matchedRelevantTerms.slice(0, 8),
    matchedMandateTerms: matchedMandateTerms.slice(0, 8),
    matchedTriggers: matchedTriggers.slice(0, 8)
  };
}

function decisionRelevanceRejectionReason(item, profile) {
  profile = requiredProfile(profile, "decisionRelevanceRejectionReason");
  const text = `${item.title || ""} ${item.content || ""} ${item.sourceName || ""}`.toLowerCase();
  const personTerms = personSearchTerms(profile);
  const hasPersonMention = hasAnyTerm(text, personTerms) || (item.sourceType === "person" && hasAnyTerm(text, personTerms));
  const hasMandate = hasAnyTerm(text, buildMandateTerms(profile));
  const hasTrigger = hasAnyTerm(text, decisionTriggerTerms);
  const isWeakProtocol = hasAnyTerm(text, weakProtocolTerms) && !hasAnyTerm(text, ["gesetzentwurf", "gesetz", "reform", "verordnung", "beschluss", "kritik", "fordert", "warnt"]);
  if (isWeakProtocol) return "Nur Protokolltermin ohne politische Entscheidung";
  if (hasPersonMention && !hasTrigger) return "Namentliche Erwähnung ohne Handlungssignal";
  if (!hasMandate) return "Kein belastbarer Ausschuss- oder Themenbezug";
  if (!hasTrigger) return "Kein politischer Entscheidungs- oder Konflikttrigger";
  return "Nicht stark genug für eine politische Entscheidung";
}

function isDecisionRelevantForProfile(item, profile) {
  profile = requiredProfile(profile, "isDecisionRelevantForProfile");
  const text = `${item.title} ${item.content} ${item.sourceName}`.toLowerCase();
  const personTerms = personSearchTerms(profile);
  const hasPersonMention = hasAnyTerm(text, personTerms) || (item.sourceType === "person" && hasAnyTerm(text, personTerms));
  const hasMandate = hasAnyTerm(text, buildMandateTerms(profile));
  const hasTrigger = hasAnyTerm(text, decisionTriggerTerms);
  const hasGovernmentWork = hasAnyTerm(text, ["bundesregierung", "bmas", "bundeskabinett", "bundestag", "ministerin", "minister"]) && hasMandate;
  const isWeakProtocol = hasAnyTerm(text, weakProtocolTerms) && !hasAnyTerm(text, ["gesetzentwurf", "gesetz", "reform", "verordnung", "beschluss", "kritik", "fordert", "warnt"]);

  if (isWeakProtocol) return false;
  if (hasPersonMention) return hasTrigger || hasAnyTerm(text, ["kritik", "vorwurf", "interview", "fordert", "äußert", "position"]);
  if (["ministry", "bundestag", "committee"].includes(item.sourceType)) return hasMandate && (hasTrigger || hasGovernmentWork);
  if (["party", "association"].includes(item.sourceType)) return hasMandate && hasTrigger;
  if (item.sourceType === "media") return hasMandate && hasTrigger;
  return hasMandate && hasTrigger;
}

function isPreciseArticleUrl(url, item = {}) {
  if (!url || isImageAssetUrl(url)) return false;
  if (item.linkType && item.linkType !== "direct") return false;
  try {
    const parsed = new URL(String(url));
    if (parsed.hostname.includes("google.")) return false;
    const path = parsed.pathname.replace(/\/+$/, "");
    if (!path || path === "/" || path.split("/").filter(Boolean).length === 0) return false;
    if (item.sourceUrl) {
      const source = new URL(String(item.sourceUrl));
      if (parsed.hostname === source.hostname && path === source.pathname.replace(/\/+$/, "")) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function isImageAssetUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    const hostname = parsed.hostname.toLowerCase();
    return hostname.includes("googleusercontent.com") || hostname.includes("gstatic.com") || /\.(png|jpe?g|webp|gif|svg|ico)(\?|$)/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

// Diagnose: Warum ueberlebt ein Item den Artikellink-Filter nicht? Repliziert pro
// Item die Klassifikation von isPreciseArticleUrl und benennt den Ablehnungsgrund.
// Reine Lesediagnose — aendert KEIN Pipeline-Verhalten, keinen Filter, keinen Prompt.
function diagnoseLinkPrecision(liveBriefing) {
  const classifyUrl = (rawUrl, source = {}) => {
    if (!rawUrl) return { url: null, precise: false, reason: "leer", isGoogle: false, isHomepage: false };
    if (isImageAssetUrl(rawUrl)) return { url: rawUrl, precise: false, reason: "bild-asset", isGoogle: false, isHomepage: false };
    if (source.linkType && source.linkType !== "direct") return { url: rawUrl, precise: false, reason: `linkType=${source.linkType}`, isGoogle: /google\./i.test(String(rawUrl)), isHomepage: false };
    let parsed;
    try { parsed = new URL(String(rawUrl)); } catch { return { url: rawUrl, precise: false, reason: "ungueltige-url", isGoogle: false, isHomepage: false }; }
    const isGoogle = parsed.hostname.includes("google.");
    const path = parsed.pathname.replace(/\/+$/, "");
    const isHomepage = !path || path === "/";
    let sameAsSource = false;
    if (source.sourceUrl) { try { const s = new URL(String(source.sourceUrl)); sameAsSource = parsed.hostname === s.hostname && path === s.pathname.replace(/\/+$/, ""); } catch { /* ignore */ } }
    if (isGoogle) return { url: rawUrl, precise: false, reason: "google-redirect", isGoogle: true, isHomepage, host: parsed.hostname };
    if (isHomepage) return { url: rawUrl, precise: false, reason: "homepage", isGoogle: false, isHomepage: true, host: parsed.hostname };
    if (sameAsSource) return { url: rawUrl, precise: false, reason: "nur-quellen-startseite", isGoogle: false, isHomepage: false, host: parsed.hostname };
    return { url: rawUrl, precise: true, reason: "praezise", isGoogle: false, isHomepage: false, host: parsed.hostname };
  };

  const items = liveBriefing?.items || [];
  const perItem = items.map((item) => {
    const sources = (item.sources && item.sources.length) ? item.sources : [item.primarySource].filter(Boolean);
    const src = sources[0] || {};
    const candidates = {
      itemUrl: classifyUrl(src.itemUrl, src),
      url: classifyUrl(src.url, src),
      originalUrl: classifyUrl(src.originalUrl, src)
    };
    const survives = preciseSources(sources).length > 0;
    const anyGoogle = Object.values(candidates).some((c) => c.isGoogle);
    const anyHomepage = Object.values(candidates).some((c) => c.isHomepage);
    // Aufloesbar: ein Google-Redirect verweist auf den echten Artikel, oder es
    // liegt bereits eine praezise Alternativ-URL vor.
    const resolvable = anyGoogle || candidates.originalUrl.precise || candidates.url.precise || candidates.itemUrl.precise;
    const firstReason = candidates.url.reason !== "leer" ? candidates.url.reason
      : candidates.itemUrl.reason !== "leer" ? candidates.itemUrl.reason
      : candidates.originalUrl.reason;
    const decision = item.decision || null;
    const finalScore = item.finalScore ?? null;
    const priority = item.priority ?? null;
    const passesDecisionCheck = decision !== "Ignorieren" && (finalScore >= 45 || priority >= 45);
    return {
      title: item.title || item.themeTitle || "(ohne Titel)",
      sourceName: item.sourceName || src.sourceName || src.title || null,
      linkType: src.linkType || null,
      url: src.url || src.itemUrl || null,
      originalUrl: src.originalUrl || null,
      decision,
      finalScore,
      priority,
      passesDecisionCheck,
      survivesFilter: survives,
      rejectReason: survives ? null : firstReason,
      isGoogleRedirect: anyGoogle,
      isHomepage: anyHomepage,
      technicallyResolvable: survives ? null : resolvable,
      candidates
    };
  });

  const failed = perItem.filter((i) => !i.survivesFilter);
  return {
    note: "TEMPORAER — Diagnose Artikellink-Filter, isPreciseArticleUrl-Logik pro Item.",
    itemsAnalyzed: perItem.length,
    liveTopics: liveBriefing?.topics?.length || 0,
    summary: {
      survive: perItem.filter((i) => i.survivesFilter).length,
      failGoogleRedirect: failed.filter((i) => i.isGoogleRedirect).length,
      failHomepage: failed.filter((i) => !i.isGoogleRedirect && i.isHomepage).length,
      failEmpty: failed.filter((i) => !i.isGoogleRedirect && !i.isHomepage && i.rejectReason === "leer").length,
      failOther: failed.filter((i) => !i.isGoogleRedirect && !i.isHomepage && i.rejectReason !== "leer").length,
      technicallyResolvable: failed.filter((i) => i.technicallyResolvable).length
    },
    perItem
  };
}

function hasTerm(text, term) {
  const normalizedTerm = String(term || "").toLowerCase().trim();
  if (!normalizedTerm) return false;
  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-zäöüß])${escaped}($|[^a-zäöüß])`, "i").test(text);
}

function isGenericSourcePage(item) {
  const title = item.title.toLowerCase();
  const content = String(item.content || "").toLowerCase();
  return (
    title.length < 8 ||
    title.startsWith("start -") ||
    title === item.sourceName.toLowerCase() ||
    title === "deutscher bundestag - ausschuss für arbeit und soziales" ||
    title === "deutscher gewerkschaftsbund | dgb" ||
    title === "bundesregierung" ||
    title === "bmas" ||
    title.includes("für solidarität und soziale gerechtigkeit") ||
    title.includes("start - fraktion die linke") ||
    title.includes("homepage") ||
    title.includes("startseite") ||
    title.includes("404") ||
    content.includes("hinter diesen worten verbergen sich") ||
    content.includes("stark in arbeit: als deutscher gewerkschaftsbund") ||
    content.includes("javascript aktivieren")
  );
}

function isLowValuePublisher(item) {
  const sourceName = String(item.sourceName || "").toLowerCase();
  const title = String(item.title || "").toLowerCase();
  const lowValueNames = [
    "ad hoc news",
    "börse express",
    "finanznachrichten",
    "wallstreet-online",
    "presseportal",
    "news aktuell",
    "openpr"
  ];
  if (lowValueNames.some((name) => sourceName.includes(name))) return true;
  return title.includes("ots:") || title.includes("pressemitteilung:");
}

function itemPoliticalWeight(item, profile) {
  profile = requiredProfile(profile, "itemPoliticalWeight");
  const text = `${item.title} ${item.content}`.toLowerCase();
  const mandateTerms = buildMandateTerms(profile);
  let weight = 0;
  if (["ministry", "bundestag", "committee"].includes(item.sourceType)) weight += 35;
  if (["party", "association"].includes(item.sourceType)) weight += 22;
  if (item.sourceName && String(item.sourceId || "").includes("-news")) weight += 8;
  if (hasAny(text, ["gesetzentwurf", "gesetz", "eckpunkte", "reform", "initiative", "bundesregierung", "bmas"])) weight += 35;
  if (hasAnyTerm(text, mandateTerms)) weight += 30;
  if (hasAny(text, ["kritik", "fordert", "warnt", "debatte", "beschluss", "ausschuss"])) weight += 18;
  weight += Math.max(0, 20 - Math.floor((Date.now() - new Date(item.publishedAt).getTime()) / (6 * 60 * 60 * 1000)));
  if (item.linkType === "direct" && item.url) weight += 15;
  return weight;
}

function hasAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function hasAnyTerm(text, terms) {
  return terms.some((term) => {
    const normalizedTerm = String(term || "").toLowerCase().trim();
    if (!normalizedTerm) return false;
    return hasTerm(text, normalizedTerm) || (normalizedTerm.length >= 6 && text.includes(normalizedTerm));
  });
}

function buildPipelineDebugReport({
  profile,
  latestCrawl,
  recentItems,
  situationalRecentItems,
  mentionItems,
  relevanceDiagnostics,
  relevantItems,
  suppressedRepeatedTopicItems = 0,
  situationalItems,
  suppressedRepeatedSituationalItems = 0,
  promotedSituationalItems,
  fallbackPromotedSituationalItems = [],
  briefingInputItems,
  liveBriefing,
  fallbackLiveBriefing = null,
  savedBriefing,
  usesLiveBriefing,
  aiBudget = null,
  aiUsed = null
}) {
  const accepted = relevanceDiagnostics.filter((entry) => entry.decision === "accepted");
  const rejected = relevanceDiagnostics.filter((entry) => entry.decision === "rejected");
  const inputIds = new Set((briefingInputItems || []).map((item) => item.id));
  const topicRawItemIds = new Set((savedBriefing?.topics || []).flatMap((topic) => topic.rawItemIds || []));

  return {
    id: `pipeline-debug-${profile.id}-${Date.now()}`,
    politicianId: profile.id,
    profile: {
      fullName: profile.fullName,
      party: profile.party,
      faction: profile.faction,
      committee: profile.committee || profile.committees?.[0] || "",
      focusTopics: (profile.focusTopics || []).slice(0, 12)
    },
    windows: {
      relevanceHours: 24,
      situationalHours: 72,
      mentionDays: 180
    },
    linkDiagnostics: (() => { try { return diagnoseLinkPrecision(liveBriefing); } catch (error) { return { error: String((error && error.message) || error) }; } })(),
    crawl: latestCrawl ? {
      checkedSources: latestCrawl.checkedSources || 0,
      successfulSources: latestCrawl.successfulSources || 0,
      failedSources: latestCrawl.failedSources || 0,
      savedItems: latestCrawl.savedItems || 0,
      newCandidateItems: latestCrawl.newCandidateItems || 0,
      createdAt: latestCrawl.createdAt || null,
      errors: (latestCrawl.errors || []).slice(0, 8)
    } : null,
    counts: {
      rawItemsLast24h: recentItems.length,
      acceptedRelevantItems: accepted.length,
      suppressedRepeatedTopicItems,
      rejectedItems: rejected.length,
      situationalItems72h: situationalRecentItems.length,
      situationalBriefingItems: situationalItems.length,
      suppressedRepeatedSituationalItems,
      promotedSituationalItems: promotedSituationalItems.length,
      fallbackPromotedSituationalItems: fallbackPromotedSituationalItems.length,
      briefingInputItems: briefingInputItems.length,
      liveTopicsGenerated: liveBriefing?.topics?.length || 0,
      fallbackLiveTopicsGenerated: fallbackLiveBriefing?.topics?.length || 0,
      finalBriefingItems: savedBriefing?.items?.length || 0,
      personalizedRecommendations: savedBriefing?.personalizedRecommendations?.length || 0,
      personMentionCandidates180d: mentionItems.length,
      finalPersonMentions: savedBriefing?.personMentions?.length || 0
    },
    outcome: {
      status: savedBriefing?.status || "Unbekannt",
      usedLiveBriefing: Boolean(usesLiveBriefing),
      fallbackReason: savedBriefing?.fallbackReason || "",
      quality: savedBriefing?.quality || null,
      executiveSummary: savedBriefing?.executiveSummary || "",
      topDecision: savedBriefing?.themeOfDay?.title || savedBriefing?.items?.[0]?.title || ""
    },
    // Datenmotor V2: Erklaerbarkeit der KI-Stufe. Welche Engine lief, mit welchem
    // Modell, ob das Budget griff, und die Begruendung fuer Rang 1.
    engine: {
      mode: savedBriefing?.ai?.engine || (aiUsed === false ? "rules-only" : "v1"),
      aiEnabled: savedBriefing?.ai?.enabled ?? null,
      model: savedBriefing?.ai?.model || null,
      degraded: savedBriefing?.ai?.degraded || false,
      v2Scored: savedBriefing?.v2?.scored ?? null,
      v2Candidates: savedBriefing?.v2?.candidates ?? null,
      v2UpgradeCandidates: savedBriefing?.v2?.upgradeCandidates ?? null,
      v2Ranked: savedBriefing?.v2?.ranked ?? null,
      top1Justification: savedBriefing?.v2?.top1Justification || "",
      v2UpgradedCount: savedBriefing?.v2?.v2UpgradedCount ?? null,
      v2UpgradedItems: savedBriefing?.v2?.v2UpgradedItems || [],
      v2NotUpgraded: savedBriefing?.v2?.v2NotUpgraded || [],
      budget: aiBudget ? {
        allowed: aiBudget.allowed,
        used: aiBudget.used ?? null,
        limit: aiBudget.limit ?? null,
        remaining: aiBudget.remaining ?? null,
        reason: aiBudget.reason || null
      } : null
    },
    sourceBreakdown: summarizeSources(relevanceDiagnostics),
    rejectionSummary: summarizeReasons(rejected),
    acceptedItems: accepted
      .sort((a, b) => b.politicalWeight - a.politicalWeight)
      .slice(0, 12)
      .map((entry) => ({
        ...serializeDiagnostic(entry),
        usedAsBriefingInput: inputIds.has(entry.rawItemId),
        reachedTopicClustering: topicRawItemIds.has(entry.rawItemId)
      })),
    rejectedItems: rejected
      .sort((a, b) => b.politicalWeight - a.politicalWeight)
      .slice(0, 30)
      .map(serializeDiagnostic),
    briefingInputItems: (briefingInputItems || []).slice(0, 12).map(serializeRawItemForDebug),
    finalItems: (savedBriefing?.items || []).slice(0, 8).map((item) => ({
      id: item.id,
      title: item.title,
      decision: item.decision,
      classification: item.classification,
      priority: item.priority,
      finalScore: item.finalScore,
      whyNow: item.whyNow,
      recommendedAction: item.recommendedAction,
      // V2-Erklaerbarkeit pro Item: Regel-Score (priority) vs. KI-Score, KI-Entscheid,
      // Mandatsbezug und finaler Rang samt Begruendung.
      ruleScore: item.priority,
      aiRelevanceScore: item.aiRelevanceScore ?? null,
      reactOrObserve: item.reactOrObserve || null,
      affectsMandate: item.affectsMandate ?? null,
      rank: item.rank ?? null,
      rankReason: item.rankReason || "",
      whyItMatters: item.whyItMatters || "",
      riskNote: item.riskNote || "",
      opportunityNote: item.opportunityNote || "",
      inactionConsequence: item.inactionConsequence || "",
      sources: (item.sources || []).slice(0, 5).map((source) => ({
        sourceName: source.sourceName,
        url: isPreciseArticleUrl(source.itemUrl, source) ? source.itemUrl : isPreciseArticleUrl(source.url, source) ? source.url : "",
        linkType: source.linkType || "",
        linkResolutionNote: source.linkResolutionNote || "",
        confidence: source.confidence
      }))
    }))
  };
}

function serializeDiagnostic(entry) {
  return {
    rawItemId: entry.rawItemId,
    title: entry.title,
    sourceName: entry.sourceName,
    sourceType: entry.sourceType,
    url: entry.url,
    sourceUrl: entry.sourceUrl,
    publishedAt: entry.publishedAt,
    retrievedAt: entry.retrievedAt,
    confidence: entry.confidence,
    politicalWeight: entry.politicalWeight,
    decision: entry.decision,
    reasons: entry.reasons,
    matchedRelevantTerms: entry.matchedRelevantTerms,
    matchedMandateTerms: entry.matchedMandateTerms,
    matchedTriggers: entry.matchedTriggers
  };
}

function serializeRawItemForDebug(item) {
  return {
    id: item.id,
    title: item.title,
    sourceName: item.sourceName,
    sourceType: item.sourceType,
    url: item.url,
    sourceUrl: item.sourceUrl,
    originalUrl: item.originalUrl,
    linkType: item.linkType,
    linkResolutionNote: item.linkResolutionNote,
    publishedAt: item.publishedAt,
    confidence: item.confidence,
    excerpt: item.excerpt || String(item.content || "").slice(0, 220)
  };
}

function summarizeReasons(diagnostics) {
  const counts = new Map();
  diagnostics.forEach((entry) => {
    (entry.reasons || ["Unbekannt"]).forEach((reason) => counts.set(reason, (counts.get(reason) || 0) + 1));
  });
  return Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}

function summarizeSources(diagnostics) {
  const bySource = new Map();
  diagnostics.forEach((entry) => {
    const key = entry.sourceName || entry.sourceType || "Unbekannt";
    const current = bySource.get(key) || {
      sourceName: entry.sourceName || "Unbekannt",
      sourceType: entry.sourceType || "",
      accepted: 0,
      rejected: 0,
      total: 0
    };
    current.total += 1;
    if (entry.decision === "accepted") current.accepted += 1;
    else current.rejected += 1;
    bySource.set(key, current);
  });
  return Array.from(bySource.values())
    .sort((a, b) => b.total - a.total || b.accepted - a.accepted)
    .slice(0, 20);
}

async function getActiveProfile(politicianId) {
  politicianId = requireTenantId(politicianId, "getActiveProfile");
  const stored = await getProfile(politicianId);
  if (stored) return mergeProfileDefaults(stored);
  // Unbekanntes/ungespeichertes Mandat: neutrale Defaults (KEIN Personen-Fallback —
  // auch nicht fuer den Piloten; dessen Profil ist ein normaler Datensatz im Store).
  // mergeProfileDefaults liefert das generische Geruest.
  const fullName = politicianId
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ") || "Neues Mandat";
  return mergeProfileDefaults({ id: politicianId, fullName, party: "", faction: "" });
}

// Neutrale Default-Werte fuer JEDES Mandat — ausnahmslos, auch fuer den Piloten.
// Verhindert, dass ein Mandat inhaltliche Defaults eines anderen erbt
// (Ausschuesse, Themen, Positionen, Termine, Gegner, Regionalbezug).
// Nur generisches, nicht-identifizierendes Geruest bleibt
// vorbelegt, damit der Briefing-Motor arbeiten kann. Spiegelt blankProfile()
// in server.js — echte Personalisierung kommt ausschliesslich aus dem Profil.
const neutralProfileDefaults = {
  function: "Bundestagsabgeordnete:r",
  role: "Bundestagsabgeordnete:r",
  accountType: "abgeordneter",
  parliamentType: "",
  politicalLevel: "Bund",
  constituency: "",
  state: "",
  location: "",
  committee: "",
  committees: [],
  focusTopics: [],
  topicPriorities: {},
  mainQuestion: "Was ist heute für mein Mandat wichtig und worauf sollte ich reagieren?",
  monitoringTargets: ["Meine Partei", "Meine Person", "Bundesregierung Vorhaben"],
  outputNeeds: [
    "Was ist heute wichtig?",
    "Was kann ignoriert werden?",
    "Worauf sollte ich reagieren?",
    "Welche Chance entsteht?",
    "Welches Risiko entsteht?",
    "Welche Formulierung kann ich nutzen?"
  ],
  regionalInterests: [],
  relevantMinistries: ["Bundesregierung"],
  opponents: [],
  localMedia: [],
  communicationStyle: "Sachlich",
  riskTopics: [],
  opportunityTopics: [],
  noGoTopics: [],
  preferredChannels: ["presse", "linkedin"],
  reportingTopics: [],
  currentCampaigns: [],
  publicPositions: [],
  keyAudiences: [],
  upcomingAppointments: []
};

function mergeProfileDefaults(profile = {}) {
  // JEDES Mandat bekommt dieselben neutralen Defaults — es gibt kein Demo-Profil
  // und keinen Personen-Fallback mehr. Eine fehlende id wird NIE erfunden:
  // sie bleibt leer und die Schreib-/Lesepfade brechen sicher ab (requireTenantId).
  const base = neutralProfileDefaults;
  return {
    ...base,
    ...profile,
    id: String(profile.id || "").trim(),
    function: profileValue(profile.function, base.function),
    constituency: profileValue(profile.constituency, base.constituency),
    state: profileValue(profile.state, base.state),
    location: profileValue(profile.location, base.location),
    mainQuestion: profileValue(profile.mainQuestion, base.mainQuestion),
    communicationStyle: profileValue(profile.communicationStyle, base.communicationStyle),
    committees: mergeArrayValue(profile.committees, profile.committee ? [profile.committee] : base.committees),
    focusTopics: mergeArrayValue(profile.focusTopics, base.focusTopics),
    topicPriorities: topicPriorityValue(profile.topicPriorities, base.topicPriorities),
    regionalInterests: mergeArrayValue(profile.regionalInterests, base.regionalInterests),
    relevantMinistries: mergeArrayValue(profile.relevantMinistries, base.relevantMinistries),
    monitoringTargets: mergeArrayValue(profile.monitoringTargets, base.monitoringTargets),
    outputNeeds: mergeArrayValue(profile.outputNeeds, base.outputNeeds),
    opponents: mergeArrayValue(profile.opponents, base.opponents),
    localMedia: mergeArrayValue(profile.localMedia, base.localMedia),
    noGoTopics: mergeArrayValue(profile.noGoTopics, base.noGoTopics),
    reportingTopics: mergeArrayValue(profile.reportingTopics, base.reportingTopics),
    currentCampaigns: mergeArrayValue(profile.currentCampaigns, base.currentCampaigns),
    publicPositions: mergeArrayValue(profile.publicPositions, base.publicPositions),
    keyAudiences: mergeArrayValue(profile.keyAudiences, base.keyAudiences),
    riskTopics: mergeArrayValue(profile.riskTopics, base.riskTopics),
    opportunityTopics: mergeArrayValue(profile.opportunityTopics, base.opportunityTopics),
    preferredChannels: mergeArrayValue(profile.preferredChannels, base.preferredChannels),
    upcomingAppointments: appointmentValue(profile.upcomingAppointments, base.upcomingAppointments)
  };
}

function buildRelevantTerms(profile) {
  return uniqueTerms([
    ...personSearchTerms(profile),
    profile.party,
    profile.faction,
    profile.committee,
    ...(profile.committees || []),
    ...(profile.focusTopics || []),
    ...Object.keys(profile.topicPriorities || {}),
    ...(profile.regionalInterests || []),
    ...(profile.relevantMinistries || []),
    ...(profile.monitoringTargets || []),
    "Bundesregierung",
    "Gesetzentwurf",
    "Eckpunkte",
    "Reform",
    "Initiative"
  ]);
}

function buildMandateTerms(profile) {
  return uniqueTerms([
    profile.committee,
    ...(profile.committees || []),
    ...(profile.focusTopics || []),
    ...Object.entries(profile.topicPriorities || {}).filter(([, priority]) => Number(priority) >= 3).map(([topic]) => topic),
    ...(profile.regionalInterests || []),
    ...(profile.relevantMinistries || []),
    profile.party,
    profile.faction
  ]);
}

function personSearchTerms(profile) {
  const fullName = String(profile.fullName || "").trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  return uniqueTerms([fullName, parts.at(-1), profile.id]);
}

function uniqueTerms(terms) {
  return Array.from(new Set(terms.map((term) => String(term || "").trim()).filter((term) => term.length >= 2)));
}

function arrayValue(value, fallback) {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/\n|,/).map((entry) => entry.trim()).filter(Boolean);
  return fallback || [];
}

function mergeArrayValue(value, fallback) {
  const primary = arrayValue(value, []);
  const defaults = arrayValue(fallback, []);
  const seen = new Set();
  return [...primary, ...defaults].filter((entry) => {
    const text = String(entry || "").trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function topicPriorityValue(value, fallback) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback || {};
  return { ...(fallback || {}), ...value };
}

function profileValue(value, fallback) {
  const text = String(value || "").trim();
  return text && !isPlaceholderValue(text) ? text : fallback;
}

function isPlaceholderValue(value) {
  return /^(noch offen|unbekannt|keine angabe|n\/a|none|null|-|—)$/i.test(String(value || "").trim());
}

function appointmentValue(value, fallback) {
  const appointments = arrayValue(value, []);
  const upcoming = appointments.filter((entry) => !isPastAppointment(entry));
  return upcoming.length ? upcoming : fallback || [];
}

function isPastAppointment(entry) {
  const parts = String(entry || "").split(/\s*[|;]\s*/).filter(Boolean);
  const date = new Date(parts[1] || "");
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < Date.now() - 12 * 60 * 60 * 1000;
}

// =============================================================================================
// OP-25 K1 — SCHATTENPFAD: globale Erfassung EINMAL, danach je Mandat nur die Projektion.
// =============================================================================================
// DEFAULT AUS (`HELMUT_CRON_GLOBALPHASE`). Ohne gesetztes Flag wird von hier NICHTS aufgerufen —
// `runSourceCrawl` oben bleibt unberuehrt und ist weiterhin der einzige Produktionspfad.
//
// Der Vertrag, die Begruendung und die Grenzen stehen in `cron-globalphase.js` und in
// docs/betrieb/cron-globalphase.md. Hier steht ausschliesslich die BINDUNG an die echten
// Produktionsfunktionen — dieselben, die `runSourceCrawl` benutzt, in derselben Reihenfolge,
// nur einmal statt n-mal.
//
// Warum kein Umbau von `runSourceCrawl`: der bestehende Pfad bedient heute Production. Jede
// Aenderung an ihm waere ein Risiko, das dieser Sprint ausdruecklich nicht eingehen darf
// (Anforderung 3: „Ohne gesetztes Flag bleibt das bestehende Verhalten unveraendert").
// Der Preis ist eine bewusste Doppelung der ORCHESTRIERUNG (nicht der Fachlogik: jeder
// fachliche Schritt ruft dieselbe Funktion auf). Der Rueckbau der Doppelung gehoert zu K2,
// nach dem Production-Nachweis.

const globalphase = require("./cron-globalphase");
// OP-25 K2.1 — Buendelungskontext. Rein, IO-frei, ohne Wirkung, solange `options.buendelung`
// nicht auf "kontext" steht (Default: "global" = K1-Verhalten).
const vorgangskontext = require("./vorgangskontext");

// Fasst die Understanding-Ergebnisse mehrerer Kontexte zu EINEM Telemetriewert zusammen.
// Ehrlich statt schoen: `skipped` gilt nur, wenn ALLE Stapel uebersprungen wurden; der Grund
// ist der erste echte Grund, damit „zeitbudget" nicht einen „eager-error" verdeckt.
function fasseEagerErgebnisseZusammen(ergebnisse = []) {
  const liste = (Array.isArray(ergebnisse) ? ergebnisse : []).filter(Boolean);
  if (!liste.length) return { skipped: true, reason: "no-input", processed: 0, deferred: 0 };
  const counts = {};
  let processed = 0;
  let deferred = 0;
  // OP-25 E3 (additiv): die Vormerkbilanz darf in der Buendelung nicht verloren gehen.
  // Vor diesem Fix verwarf die Zusammenfassung `vorgemerkt`/`nichtVorgemerkt` — damit war
  // aus der Ablage nicht beweisbar, ob zurueckgestellte Cluster dauerhaft (pending-KO)
  // oder stillschweigend unvorgemerkt zurueckblieben.
  let vorgemerkt = 0;
  let nichtVorgemerkt = 0;
  let uebersprungeneStapel = 0;
  let uebersprungeneDokumente = 0;
  for (const e of liste) {
    processed += Number(e.processed) || 0;
    deferred += Number(e.deferred) || 0;
    vorgemerkt += Number(e.vorgemerkt) || 0;
    nichtVorgemerkt += Number(e.nichtVorgemerkt) || 0;
    if (e.skipped === true && e.reason === "zeitbudget") {
      uebersprungeneStapel += 1;
      uebersprungeneDokumente += Number(e.dokumente) || 0;
    }
    for (const [k, v] of Object.entries(e.counts || {})) counts[k] = (counts[k] || 0) + (Number(v) || 0);
  }
  const fehlergrund = liste.find((e) => e.reason === "eager-error");
  const gruende = [...new Set(liste.map((e) => e.reason).filter(Boolean))];
  return {
    skipped: liste.every((e) => e.skipped === true),
    reason: fehlergrund ? "eager-error" : (gruende.length ? gruende.join(",").slice(0, 200) : null),
    error: fehlergrund ? fehlergrund.error : undefined,
    processed,
    deferred,
    vorgemerkt,
    nichtVorgemerkt,
    uebersprungeneStapel,
    uebersprungeneDokumente,
    counts: Object.keys(counts).length ? counts : undefined,
    stapel: liste.length
  };
}

// Sperre der globalen Phase. ZUSAETZLICH zur Mandatssperre `crawl-<mandat>`, die in der
// Mandatsphase unveraendert erworben wird — keine bestehende Sperre wird geschwaecht oder
// ersetzt. Gleiche TTL wie die Mandatssperre (15 min).
const GLOBALPHASE_LOCK = "crawl-globalphase";
const GLOBALPHASE_LOCK_TTL_MS = 15 * 60 * 1000;

// K8 (Ursachenanalyse §7.7.6, Befund 4): ABSCHLUSSRESERVE der globalen Phase — die Zeit
// NACH der letzten fachlichen Arbeit fuer Bilanz, Telemetrie und Versiegelung. Die alte
// 5-s-Reserve war zu knapp: die Abschlussschreiben brauchten in Production ~5,3 s, die
// Versiegelung lag 313 ms ueber dem Budget. Verarbeitungsdeadline und Abschlussreserve
// sind jetzt GETRENNT; die fachliche Schleife kann die Reserve nicht verbrauchen.
const ABSCHLUSS_RESERVE_MS = Math.max(1000, Number(process.env.HELMUT_CRAWL_ABSCHLUSS_RESERVE_MS) || 10000);

// K4 (E3): RESERVIERTE VORMERKZEIT — der Anteil des Phasenbudgets unmittelbar vor der
// Abschlussreserve, der ausschliesslich der dauerhaften Vormerkung des gesamten
// Rueckstands gehoert. Bemessung: die Bulk-Vormerkung braucht je 200er-Chunk wenige
// Anfragen (~0,5 s) plus die Clusterbildung uebersprungener Stapel (reine Rechenarbeit,
// in Production ~16 s fuer ~1 240 Cluster). 30 s decken damit auch den belegten
// Maximalrueckstand (~1 213 Cluster) mit deutlichem Abstand.
const VORMERK_RESERVE_MS = Math.max(5000, Number(process.env.HELMUT_CRAWL_VORMERK_RESERVE_MS) || 30000);

// Leere Abrufbilanz — dieselben Felder, die `crawlAllSources` liefert.
function leereCrawlBilanz() {
  return {
    results: [], rawItems: [],
    checkedSources: 0, successfulSources: 0, failedSources: 0,
    newCandidateItems: 0, skippedSources: 0, circuitOpenSources: 0,
    sharedSkippedSources: 0, retriesTotal: 0,
    googleGate: null, googleUrlResolution: null
  };
}

// Stufenergebnis in die Gesamtbilanz falten. Zaehler addieren, Listen anhaengen; der
// Gate-Zustand und die Google-Aufloesungsquote der ZULETZT gelaufenen Stufe gelten
// (sie tragen den aktuellen Stand des durchgereichten Gates).
function verschmelzeCrawlBilanz(ziel, stufe) {
  if (!stufe) return ziel;
  ziel.results.push(...(stufe.results || []));
  ziel.rawItems.push(...(stufe.rawItems || []));
  for (const feld of ["checkedSources", "successfulSources", "failedSources", "newCandidateItems",
    "skippedSources", "circuitOpenSources", "sharedSkippedSources", "retriesTotal"]) {
    ziel[feld] += Number(stufe[feld]) || 0;
  }
  if (stufe.googleGate) ziel.googleGate = stufe.googleGate;
  if (stufe.googleUrlResolution) ziel.googleUrlResolution = stufe.googleUrlResolution;
  return ziel;
}

function globalphaseDeps(overrides = {}) {
  return {
    now: () => Date.now(),
    listFullProfiles,
    quellenFuerProfil: getSourcesForProfile,
    crawlAllSources,
    fetchDipItems: fetchDipAsRawItems,
    dipAktiv: isDipEnabled,
    saveRawItems,
    persistRawDocuments: persistRawDocumentsShadow,
    lazyUnderstanding: runLazyUnderstandingShadow,
    eagerUnderstanding: runUnderstandingShadow,
    matching: runMatchingShadow,
    decisions: runDecisionShadow,
    getActiveProfile,
    saveCrawlRun,
    listCrawlRuns,
    recordProcessRun,
    recordPipelineError,
    acquireLock: acquirePipelineLock,
    releaseLock: releasePipelineLock,
    hardeningConfig: googleHardeningConfig,
    createGate: createGoogleNewsGate,
    evaluateCooldown,
    sharedLedger: sharedFetchLedger,
    persistSourceCrawlTelemetry,
    insertSourceCrawlTelemetry,
    // K4: gebuendelte Vormerkung (F-RT-Muster) fuer die Abschlussphase und den Eager-Pfad.
    savePendingBulk: savePendingKnowledgeObjectsBulk,
    ...overrides
  };
}

// GLOBALE PHASE — hoechstens einmal je regulaerem Lauf.
// Reihenfolge (identisch zu `runSourceCrawl`, nur mandantenneutral):
//   Profile -> Quellenplaene -> VEREINIGUNG -> Abruf -> DIP -> Rohitems -> Rohdokumente
//   -> Lazy-Understanding -> Eager-Understanding -> globale Lauftelemetrie -> VERSIEGELN.
// Ergebnis ist IMMER ein versiegelter Datenstand: auch ein Fehlschlag wird versiegelt, damit
// die Mandatsphase ihn eindeutig als nicht projizierbar erkennt.
async function runGlobaleErfassung(options = {}) {
  const deps = globalphaseDeps(options.deps || {});
  const now = deps.now;
  const startedMs = Number(options.startedMs) || now();
  const laufId = options.runId || makeRunId("global", startedMs);
  const tenantIds = [...new Set((Array.isArray(options.tenantIds) ? options.tenantIds : []).filter(Boolean).map(String))];
  const budgetMs = Math.max(0, Number(options.budgetMs) || 0);
  const verbleibendMs = () => Math.max(0, budgetMs - (now() - startedMs));
  const fehler = [];
  // PHASENMESSUNG (Befund F-RT/F-CL, 2026-08-03). Der gescheiterte Production-Lauf liess sich
  // nur ueber `source_crawl_telemetry`, `raw_documents.created_at` und `document_findings`
  // rekonstruieren — der Lauf selbst berichtete eine einzige Zahl (267 122 ms). Jede Phase
  // misst sich jetzt selbst; die Zerlegung steht im Log und im globalen Laufdatensatz.
  const phasen = {};
  let phasenMarke = startedMs;
  const phase = (name) => { const t = now(); phasen[name] = t - phasenMarke; phasenMarke = t; };
  let datenstand = globalphase.datenstandNeu({ laufId, startAt: startedMs, mandate: tenantIds.length });

  const locked = await deps.acquireLock(GLOBALPHASE_LOCK, GLOBALPHASE_LOCK_TTL_MS);
  if (!locked) {
    // KEIN Fehlschlag: ein anderer Lauf erfasst gerade. Der Aufrufer ueberspringt den Lauf,
    // damit nicht zwei Laeufe dieselben Quellen gleichzeitig ziehen.
    console.warn("[globalphase] laeuft bereits — Lauf uebersprungen.");
    return {
      uebersprungen: true,
      grund: "laeuft-bereits",
      datenstand: globalphase.datenstandVersiegeln(datenstand, {
        nowMs: now(),
        status: globalphase.DATENSTAND_FEHLGESCHLAGEN,
        fehler: [{ schritt: "sperre", grund: "laeuft-bereits", fatal: true }]
      })
    };
  }

  try {
    // 1. Aktive Profile — in der UEBERGEBENEN Reihenfolge (das ist die Fairnessreihenfolge
    //    aus `cron-fairness.planTenantOrder`). Nur so profitiert bei knapper Zeit das
    //    Mandat zuerst, das am laengsten wartet.
    const alleProfile = await deps.listFullProfiles().catch((error) => {
      fehler.push({ schritt: "profile", grund: String((error && error.message) || "unbekannt").slice(0, 200), fatal: true });
      return [];
    });
    const profilById = new Map((Array.isArray(alleProfile) ? alleProfile : []).map((p) => [String(p && p.id), p]));
    const profileInReihenfolge = tenantIds.map((id) => profilById.get(id)).filter(Boolean);
    if (!profileInReihenfolge.length) {
      if (!fehler.some((f) => f.fatal)) {
        fehler.push({ schritt: "profile", grund: "keine-aktiven-profile", fatal: true });
      }
      return {
        datenstand: globalphase.datenstandVersiegeln(datenstand, { nowMs: now(), fehler }),
        ergebnis: null
      };
    }

    // 2. Quellenplaene je Profil — die UNVERAENDERTE Produktionsfunktion. Ein fehlerhaftes
    //    Profil wird benannt und uebersprungen; die Versorgung der uebrigen faellt nicht aus.
    const profilQuellen = [];
    for (const profil of profileInReihenfolge) {
      try {
        profilQuellen.push({ politicianId: String(profil.id), quellen: await deps.quellenFuerProfil(profil) });
      } catch (error) {
        console.error(`[globalphase] Quellenplan fuer ein Profil fehlgeschlagen (isoliert): ${error && error.message}`);
        profilQuellen.push({ politicianId: String(profil.id), fehler: String((error && error.message) || "unbekannt") });
      }
    }

    // 3. VEREINIGUNGSMENGE.
    phase("vorlaufMs");
    const plan = globalphase.planGlobaleQuellen({ profilQuellen });
    console.log(`[globalphase] Quellen vereinigt: gesamt=${plan.gesamt} gemeinsam=${plan.gemeinsam}`
      + ` mandatseigen=${plan.mandatseigen} doppelteWege=${plan.doppelteAbrufwege.length}`
      + ` fehlerhafteProfile=${plan.fehlerhafteProfile.length}`);

    // 4. Abruf — Gate, Cooldown und das prozessweite Gedaechtnis geteilter Abrufwege wie
    //    heute. `tenantId: null` = der Abstandsschutz gilt gegen den juengsten Volllauf
    //    ueberhaupt; ein GLOBALER Lauf hat kein Mandat, gegen das er sich abgrenzen koennte.
    const hardening = deps.hardeningConfig();
    let cooldown = { active: false, skipGoogle: false, reason: null };
    if (hardening.enabled) {
      const lastRuns = await deps.listCrawlRuns(20).catch(() => []);
      cooldown = deps.evaluateCooldown({
        // Der globale Lauf schreibt `mode: "global"`, damit er den Alt-Pfad nicht beeinflusst
        // (dessen Cooldown wertet nur `mode === "full"`). Fuer die EIGENE Abstandspruefung
        // zaehlt der eigene Vorlauf trotzdem — deshalb hier zurueckgebildet.
        lastRuns: (Array.isArray(lastRuns) ? lastRuns : []).map((r) => (r && r.mode === "global" ? { ...r, mode: "full" } : r)),
        nowMs: now(),
        config: hardening,
        force: Boolean(options.force),
        tenantId: null
      });
      if (cooldown.active) {
        console.warn(`[globalphase] Google-Cooldown aktiv (${cooldown.reason}${cooldown.skipGoogle ? ", Google-Anteil uebersprungen" : ", Google reduziert"}).`);
      }
    }
    const googleGate = hardening.enabled ? deps.createGate(hardening, { startOpen: googleBreakerMemoryActive(hardening) }) : null;
    const ledger = hardening.enabled && hardening.sharedPathDedup && !options.force
      ? deps.sharedLedger(hardening.sharedPathWindowMs)
      : null;
    // ABRUF IN STUFEN — der einzige Weg, das globale Budget beim Abruf ueberhaupt wirksam
    // zu machen. BEFUND (offline gemessen, Bestandsverhalten): `crawlAllSources` kennt KEINE
    // Deadline und ruft jede aktive Quelle des Plans ab. Beim heutigen Pfad ist das die
    // Ursache dafuer, dass ein Lauf sein Zeitfenster ueberzieht (Betriebsbefund 2026-07-27,
    // 300-s-Limit). Hier wird deshalb zwischen den Stufen die Restzeit geprueft — der
    // Crawler selbst bleibt UNVERAENDERT (kein Eingriff in `crawler.js`, kein neuer
    // Parameter, kein Einfluss auf `runSourceCrawl`).
    // Gate und Gedaechtnis geteilter Wege werden ueber alle Stufen HINWEG durchgereicht:
    // Parallelitaetsgrenze, Mindestabstand, Circuit Breaker und Wegentdoppelung wirken
    // damit genau wie bei einem einzigen Aufruf.
    const stufenGroesse = Math.max(1, Number(process.env.HELMUT_GLOBALPHASE_ABRUF_STUFE || 20));
    const crawl = leereCrawlBilanz();
    let nichtAbgerufen = 0;
    for (let i = 0; i < plan.quellen.length; i += stufenGroesse) {
      if (verbleibendMs() <= 0) { nichtAbgerufen = plan.quellen.length - i; break; }
      const stufe = await deps.crawlAllSources(plan.quellen.slice(i, i + stufenGroesse), {
        googleGate, cooldown, hardeningConfig: hardening, sharedLedger: ledger
      });
      verschmelzeCrawlBilanz(crawl, stufe);
    }
    phase("abrufMs");
    if (nichtAbgerufen) {
      console.error(`[globalphase] Abrufbudget erschoepft — ${nichtAbgerufen} von ${plan.quellen.length} Wegen NICHT abgerufen.`);
      fehler.push({ schritt: "abruf", grund: `abrufbudget-erschoepft-${nichtAbgerufen}-wege` });
    }
    rememberGoogleBreakerState(crawl.googleGate);

    // 5. DIP — der Abruf ist global (prozessweit zwischengespeichert), der FILTER ist
    //    profilabhaengig. Der globale Rohkorpus braucht die Vereinigung ueber alle Profile,
    //    sonst gingen genau die amtlichen Vorgaenge der spaeteren Mandate verloren.
    //    K2.1: dabei wird MITGESCHRIEBEN, welche Profile ein amtliches Dokument geliefert
    //    haben. Alle DIP-Dokumente laufen unter der EINEN Quellenkennung `dip`; ihre
    //    Sichtbarkeit ist deshalb nur je DOKUMENT bestimmbar, nicht je Quelle. Ohne diese
    //    Buchfuehrung waere der Kontext eines amtlichen Vorgangs geraten — und Raten ist an
    //    dieser Stelle genau das, was K2.1 ausschliessen soll.
    const dipItems = [];
    const dipHerkunft = {};
    if (deps.dipAktiv()) {
      const gesehen = new Set();
      for (const profil of profileInReihenfolge) {
        const mandatsId = String(profil.id);
        const items = await deps.fetchDipItems(profil).catch(() => []);
        for (const item of items || []) {
          const key = String((item && (item.id || item.hash)) || "");
          if (!key) continue;
          for (const k of vorgangskontext.dokumentSchluessel(item)) {
            if (!dipHerkunft[k]) dipHerkunft[k] = [];
            if (!dipHerkunft[k].includes(mandatsId)) dipHerkunft[k].push(mandatsId);
          }
          if (gesehen.has(key)) continue;
          gesehen.add(key);
          dipItems.push(item);
        }
      }
    }

    phase("dipMs");
    const savedItems = await deps.saveRawItems([...crawl.rawItems, ...dipItems]);
    phase("rohitemsMs");
    const persistResult = await deps.persistRawDocuments(savedItems, { runId: laufId }).catch(() => null);
    phase("persistenzMs");
    if (persistResult && persistResult.schreibAnfragen != null) {
      console.log(`[globalphase/persistenz] ${phasen.persistenzMs}ms dokumente=${savedItems.length}`
        + ` neu=${persistResult.persisted} bestandstreffer=${persistResult.bestandsTreffer || 0}`
        + ` anfragen=${persistResult.schreibAnfragen} einzelnNachgezogen=${persistResult.einzelnNachgezogen || 0}`
        + ` zaehlerVerfehlt=${persistResult.zaehlerVerfehlt || 0}`);
    }
    // OP-25 E3 (kein falsches Gruen, CLAUDE.md §4.4): ein gescheiterter oder unbekannter
    // Persistenzausgang machte den Datenstand bisher NICHT `teilweise` — der Lauf konnte
    // trotz fehlender raw_documents als `abgeschlossen` versiegeln und sah damit aus wie
    // ein Lauf ohne Rueckstand. Jetzt wird er als Fehler benannt (nicht fatal: die
    // Rohitems des Laufs sind gespeichert, die Erfassung ist teilweise, nicht wertlos).
    const persistenzOk = Boolean(persistResult && !persistResult.skipped && !persistResult.error
      && Number.isFinite(Number(persistResult.persisted)));
    if (savedItems.length && !persistenzOk) {
      fehler.push({ schritt: "persistenz", grund: "persistenz-fehlgeschlagen-oder-unbekannt" });
    }

    // 5b. BUENDELUNGSKONTEXTE (K2.1) — die einzige Stelle, an der sich der neue Pfad vom
    //     K1-Pfad unterscheidet. Bis hierher ist beides identisch: derselbe Quellenplan,
    //     dieselbe Vereinigungsmenge, derselbe Abruf, dieselben mandantenneutralen
    //     Rohitems/Rohdokumente. AB HIER entscheidet `options.buendelung`:
    //
    //       "global"  (Default, K1) — EIN Stapel ueber alle Dokumente. Byte-gleich zum
    //                                 bisherigen Verhalten: eine Schleife ueber genau einen
    //                                 Stapel ist derselbe Aufruf wie vorher.
    //       "kontext" (K2.1)        — je SICHTBARKEITSMENGE ein Stapel. Das lose Clusterregime
    //                                 wirkt dadurch nie ueber die Sichtbarkeitsgrenze hinweg;
    //                                 das strenge Regime (`resolveVorgang`) bleibt global und
    //                                 unveraendert und fuehrt zusammen, was zusammengehoert.
    //
    //     Es entsteht KEINE zweite Fachlogik: Clustern, Kennung, Resolver und Understanding
    //     sind in beiden Faellen dieselben unveraenderten Produktionsfunktionen.
    const kontextgebunden = options.buendelung === "kontext";
    const herkuenfte = { herkunftJeQuelle: plan.herkunft, herkunftJeDokument: dipHerkunft };
    const kontextPlan = kontextgebunden
      ? vorgangskontext.planKontexte({ dokumente: savedItems, ...herkuenfte, reihenfolge: tenantIds })
      : null;
    const stapel = kontextgebunden
      ? kontextPlan.kontexte.map((k) => ({ schluessel: k.schluessel, mandate: k.mandate, dokumente: k.dokumente }))
      : [{ schluessel: "global", mandate: tenantIds, dokumente: savedItems }];

    // RIEGEL vor dem Verstehen: jedes Dokument genau einmal (Partition) UND jeder Kontext in
    // sich geschlossen (alle Dokumente derselben Sichtbarkeit). Wird der Riegel verletzt, ist
    // die Zusage „keine fremde Mandatsquelle veraendert die Vorgangsidentitaet" nicht mehr
    // gedeckt — dann wird die Erfassung als FEHLGESCHLAGEN versiegelt und es gibt in diesem
    // Lauf keine Projektion. Fail closed, kein stiller Weiterlauf.
    if (kontextgebunden) {
      const partition = vorgangskontext.pruefePartition({ dokumente: savedItems, kontexte: kontextPlan.kontexte });
      const grenzen = vorgangskontext.pruefeAlleKontextgrenzen(kontextPlan.kontexte, herkuenfte);
      console.log(`[globalphase/kontext] kontexte=${kontextPlan.gesamt} geteilt=${kontextPlan.geteilt}`
        + ` mandatseigen=${kontextPlan.mandatseigen} unbekannt=${kontextPlan.unbekannt}`
        + ` dokumente=${kontextPlan.dokumente} ohneSichtbarkeit=${kontextPlan.ohneSichtbarkeit.length}`);
      if (!partition.ok || !grenzen.ok) {
        console.error(`[globalphase/kontext] KONTEXTVERTRAG VERLETZT — partition=${JSON.stringify({ fehlend: partition.fehlend.length, mehrfach: partition.mehrfach.length })}`
          + ` grenzverletzungen=${grenzen.verletzungen.length}`);
        fehler.push({
          schritt: "kontextvertrag",
          grund: `partition-fehlend-${partition.fehlend.length}-mehrfach-${partition.mehrfach.length}-grenzen-${grenzen.verletzungen.length}`,
          fatal: true
        });
        return { datenstand: globalphase.datenstandVersiegeln(datenstand, { nowMs: now(), fehler }), ergebnis: null };
      }
    }
    phase("buendelungMs");

    // 6. Lazy-Understanding — je Stapel. Der Schritt selbst ist unveraendert und schon heute
    //    mandantenneutral (er prueft je Cluster ALLE Profile); kontextgebunden ist nur, WELCHE
    //    Dokumente gemeinsam geclustert werden. Das Zeitbudget gilt weiterhin je LAUF und wird
    //    ueber die Stapel AUFGETEILT, nicht je Stapel neu vergeben.
    let lazyRan = 0;
    let lazyCluster = 0;
    let lazyUebersprungeneStapel = 0;
    let lazyUebersprungeneDokumente = 0;
    // K4 (E3): der Lazy-Rueckstand wird EINGESAMMELT statt verworfen — gebaute, aber nicht
    // verarbeitete Cluster und die Dokumente uebersprungener Stapel gehen am Phasenende in
    // die Vormerk-Abschlussphase (fruehester Befund: „der Lazy-Pfad hat fuer zurueckgestellte
    // Cluster gar keinen Vormerkpfad", §7.7.6 Befund 5).
    const lazyRestClusterListe = [];
    const lazyUebersprungeneItems = [];
    try {
      if (savedItems.length) {
        const profiles = await deps.listFullProfiles().catch(() => []);
        const lazyBudgetMs = Math.min(Number(process.env.HELMUT_CRAWL_LAZY_BUDGET_MS || 60000), verbleibendMs());
        const lazyStart = now();
        const scheiben = vorgangskontext.verstehensScheiben({ gesamtMs: lazyBudgetMs, anzahl: stapel.length });
        for (const [index, teil] of stapel.entries()) {
          if (!teil.dokumente.length) continue;
          // RIEGEL VOR DER ARBEIT (Befund F-CL, Production 2026-08-03): die Clusterbildung ist
          // der TEURE Teil dieses Blocks, nicht die Verarbeitung. Bisher wurde sie fuer JEDEN
          // Stapel gemacht und erst danach das Restbudget geprueft — im gescheiterten Lauf
          // wurden so 1 242 Cluster gebildet und 0 davon verarbeitet: 15,9 s reine Doppelarbeit
          // aus einem Budget, das zu diesem Zeitpunkt bereits aufgebraucht war. Jetzt entscheidet
          // das Budget ZUERST. Ein uebersprungener Stapel wird gezaehlt, damit er den Datenstand
          // ehrlich als `teilweise` markiert (CLAUDE.md §4.4) — nicht als heimlich fertig.
          const teilStichtag = lazyStart + (scheiben[index] || 0);
          if (verbleibendMs() <= 0 || now() > teilStichtag) {
            lazyUebersprungeneStapel += 1;
            lazyUebersprungeneDokumente += teil.dokumente.length;
            lazyUebersprungeneItems.push(...teil.dokumente);
            continue;
          }
          const rows = dedupeRawDocuments(teil.dokumente.map(toRawDocumentRow).filter((r) => r && r.id));
          const clusters = clusterRawDocuments(rows);
          lazyCluster += clusters.length;
          for (const [clusterIndex, cluster] of clusters.entries()) {
            if (now() > teilStichtag) {
              lazyRestClusterListe.push(...clusters.slice(clusterIndex));
              break;
            }
            lazyRan += 1;
            await deps.lazyUnderstanding({ cluster, vorgangId: deriveVorgangId(cluster), profiles }).catch(async (error) => {
              await deps.recordPipelineError({ process: "lazy-understanding", runId: laufId, error }).catch(() => {});
            });
          }
        }
        console.log(`[globalphase] lazy-understanding ${now() - lazyStart}ms stapel=${stapel.length} clusters=${lazyCluster}`
          + ` processed=${lazyRan} deferred=${lazyCluster - lazyRan}`
          + ` uebersprungeneStapel=${lazyUebersprungeneStapel} uebersprungeneDokumente=${lazyUebersprungeneDokumente}`);
      }
    } catch (error) {
      fehler.push({ schritt: "lazy-understanding", grund: String((error && error.message) || "unbekannt").slice(0, 200) });
      await deps.recordPipelineError({ process: "lazy-understanding", runId: laufId, error }).catch(() => {});
    }
    phase("lazyMs");

    // 7. Eager-Understanding — UNVERAENDERTES Budget (`HELMUT_CRAWL_UNDERSTAND_BUDGET_MS`,
    //    Default 90 000 ms). Es wird NICHT erhoeht — auch nicht durch die Kontexte: das
    //    Gesamtbudget wird ueber `verstehensScheiben` in kumulative Stichtage AUFGETEILT.
    //    Damit bleibt die Zahl der KI-Aufrufe je Lauf exakt so gedeckelt wie heute; nicht
    //    verbrauchte Zeit eines frueheren Kontexts faellt dem naechsten zu, die Summe aber nie
    //    ueber das Budget hinaus.
    const eagerStart = now();
    // K4/K8: die FACHLICHE Arbeit endet vor der reservierten Vormerkzeit UND der
    // Abschlussreserve — beide sind der Schleife entzogen und koennen von ihr nicht
    // verbraucht werden (Trennung von Verarbeitungsdeadline und Abschlussreserve).
    const eagerBudgetMs = Math.min(
      Number(process.env.HELMUT_CRAWL_UNDERSTAND_BUDGET_MS || 90000),
      Math.max(0, verbleibendMs() - VORMERK_RESERVE_MS - ABSCHLUSS_RESERVE_MS)
    );
    // BEWUSSTER UNTERSCHIED ZUM ALTPFAD (Beobachtung K1-2, docs/betrieb/cron-globalphase.md
    // §11 R5): `runUnderstandingShadow` deutet `budgetMs = 0` als „KEIN Limit", nicht als
    // „keine Zeit". In `runSourceCrawl` fuehrt das dazu, dass ausgerechnet bei erschoepftem
    // Budget der teuerste Schritt UNBEGRENZT weiterlaeuft — offline gemessen die Ursache
    // dafuer, dass ein Lauf sein Zeitfenster um Minuten ueberzieht. Hier wird der Schritt
    // stattdessen ehrlich UEBERSPRUNGEN. Die Abweichung macht den neuen Pfad ausschliesslich
    // STRENGER, nie lockerer; die zurueckgestellten Vorgaenge holt der dedizierte
    // Understanding-Cron nach (unveraendert). `runSourceCrawl` bleibt unangetastet.
    const eagerErgebnisse = [];
    // K4: die Dokumente uebersprungener Eager-Stapel werden EINGESAMMELT — sie erreichen
    // die Verstehensschleife (und damit deren Vormerkung) nie und gehoeren deshalb in die
    // Vormerk-Abschlussphase.
    const eagerUebersprungeneItems = [];
    for (const [index, teil] of stapel.entries()) {
      const teilBudgetMs = eagerBudgetMs > 0
        ? vorgangskontext.budgetFuerKontext({
          gesamtMs: eagerBudgetMs, anzahl: stapel.length, index, startMs: eagerStart, jetztMs: now()
        })
        : 0;
      if (teilBudgetMs <= 0) {
        // OP-25 E3 (additiv): die Dokumentzahl des uebersprungenen Stapels wird MITGEZAEHLT.
        // Ohne sie waere ein ganzer Stapel zurueckgestellter Verstehensarbeit in der
        // Telemetrie unsichtbar (deferred=0) — ein stiller Rueckstand.
        eagerErgebnisse.push({ skipped: true, reason: "zeitbudget", processed: 0, deferred: 0, dokumente: teil.dokumente.length });
        eagerUebersprungeneItems.push(...teil.dokumente);
        continue;
      }
      const teilErgebnis = await deps.eagerUnderstanding(teil.dokumente, {
        budgetMs: teilBudgetMs,
        // K8: die Vormerkung der Verstehensphase endet VOR der Abschlussreserve (frueher
        // Budget − 5 s — zu knapp fuer die Abschlussschreiben, Befund +313 ms).
        vormerkDeadlineMs: startedMs + budgetMs - ABSCHLUSS_RESERVE_MS,
        // K4: die GEBUENDELTE Vormerkung der zurueckgestellten Cluster laeuft ueber
        // DIESELBE Bulk-Funktion wie die Abschlussphase (explizit durchgereicht — kein
        // Default in understanding, damit Aufrufer mit eigener Ablage konsistent bleiben).
        savePendingBulk: deps.savePendingBulk,
        runId: laufId
      }).catch((error) => ({ skipped: true, reason: "eager-error", error: error && error.message }));
      eagerErgebnisse.push(teilErgebnis);
    }
    // Zusammenfassung. Bei GENAU EINEM Stapel (K1 und der Altfall) ist sie feldgleich zum
    // Einzelergebnis — deshalb bleibt die Telemetrie dort byte-gleich.
    const eagerResult = eagerErgebnisse.length === 1
      ? eagerErgebnisse[0]
      : fasseEagerErgebnisseZusammen(eagerErgebnisse);
    const eagerDurationMs = now() - eagerStart;
    phase("eagerMs");
    console.log(`[globalphase] eager-understanding ${eagerDurationMs}ms ${JSON.stringify({ stapel: stapel.length, processed: eagerResult && eagerResult.processed, deferred: eagerResult && eagerResult.deferred, reason: eagerResult && eagerResult.reason })}`);
    const eagerTelemetrie = await deps.recordProcessRun({
      process: "understanding-eager", runId: laufId, mode: "global", location: executionLocation(),
      startedAt: new Date(eagerStart).toISOString(), finishedAt: new Date(now()).toISOString(),
      durationMs: eagerDurationMs,
      processed: eagerResult && eagerResult.processed,
      deferred: eagerResult && eagerResult.deferred,
      skippedStore: eagerResult && eagerResult.counts && eagerResult.counts["skipped-store"],
      reason: eagerResult && eagerResult.reason,
      status: eagerResult && eagerResult.skipped ? "blocked" : "success",
      telemetrie: eagerResult && eagerResult.telemetrie
    });
    if (eagerTelemetrie && !eagerTelemetrie.ok) {
      console.error(`[globalphase] LAUFTELEMETRIE NICHT GESPEICHERT (understanding-eager, runId ${laufId})`);
    }
    if (eagerResult && (eagerResult.reason === "eager-error" || (eagerResult.counts && eagerResult.counts["cluster-error"]))) {
      fehler.push({ schritt: "eager-understanding", grund: String(eagerResult.error || "cluster-error").slice(0, 200) });
      await deps.recordPipelineError({ process: "understanding-eager", runId: laufId, errorType: eagerResult.error || "cluster-error" }).catch(() => {});
    }

    // 7b. VORMERK-ABSCHLUSSPHASE (K4, E3 eingeloest). Sie laeuft in der RESERVIERTEN
    //     Vormerkzeit (die fachliche Schleife endet frueher, s. o.) und macht den GESAMTEN
    //     verbliebenen Rueckstand dauerhaft wiederauffindbar:
    //       (a) alle gebauten, aber nicht verarbeiteten Lazy-Cluster,
    //       (b) die Dokumente uebersprungener Lazy- UND Eager-Stapel — sie wurden nie
    //           geclustert und hatten bisher GAR KEINEN Vormerkpfad.
    //     Eager-zurueckgestellte Cluster vormerkt bereits die Verstehensphase (Bulk).
    //     Gebuendelt nach F-RT-Muster (wenige Chunk-Anfragen statt 2 Round-Trips je
    //     Cluster), idempotent (ignore-duplicates), Speicherfehler werden GEZAEHLT.
    const vormerkPhaseStart = now();
    const vormerkDeadlineMs = startedMs + budgetMs - ABSCHLUSS_RESERVE_MS;
    const uebersprungeneItems = [...lazyUebersprungeneItems, ...eagerUebersprungeneItems];
    // DEADLINE VOR DER ARBEIT (Review-Befund, gleiche Klasse wie F-CL): die Clusterbildung
    // der uebersprungenen Dokumente ist reine, aber teure Rechenarbeit (~16 s bei ~1 240
    // Clustern). In einem abnormal ueberzogenen Lauf wuerde sie NACH der Deadline nur noch
    // Ergebnisse produzieren, die verworfen werden — deshalb entscheidet die Deadline ZUERST.
    const vormerkZeitVorbei = now() > vormerkDeadlineMs;
    const uebersprungeneRows = (!vormerkZeitVorbei && uebersprungeneItems.length)
      ? dedupeRawDocuments(uebersprungeneItems.map(toRawDocumentRow).filter((r) => r && r.id))
      : [];
    const clusterAusUebersprungenen = uebersprungeneRows.length ? clusterRawDocuments(uebersprungeneRows) : [];
    const vormerkKandidaten = new Map();
    for (const cluster of [...lazyRestClusterListe, ...clusterAusUebersprungenen]) {
      const vorgangId = deriveVorgangId(cluster);
      if (vorgangId && !vormerkKandidaten.has(vorgangId)) vormerkKandidaten.set(vorgangId, cluster);
    }
    // Wie viele Kandidaten stammen NACH der vorgangId-Deduplizierung aus dem Lazy-Rest?
    // Zwei Rest-Cluster desselben Vorgangs sind EIN Kandidat — die rohe Clusterzahl darf
    // deshalb nicht gegen die Kandidatenzahl gefordert werden (Review-Befund: ehrliche
    // Laeufe wuerden blockiert). Gemessen wird die tatsaechliche Abdeckung in der Map.
    const lazyRestKandidaten = new Set(
      lazyRestClusterListe.map((c) => deriveVorgangId(c)).filter((id) => id && vormerkKandidaten.has(id))
    ).size;
    const vormerkBilanz = {
      lazyRestCluster: Math.max(0, lazyCluster - lazyRan),
      lazyRestKandidaten,
      // ROH = ungefilterte Item-Zaehlung (dieselbe Basis wie lazy./eager.uebersprungene-
      // Dokumente — nur so ist die Vertragsgleichung ein Vergleich von Gleichem mit Gleichem);
      // `uebersprungeneDokumente` ist die DEDUPLIZIERTE Zeilenzahl der Abschlussphase.
      uebersprungeneDokumenteRoh: uebersprungeneItems.length,
      uebersprungeneDokumente: uebersprungeneRows.length,
      clusterAusUebersprungenen: clusterAusUebersprungenen.length,
      kandidaten: vormerkKandidaten.size,
      vorgemerkt: 0,
      bereitsVorhanden: 0,
      fehlgeschlagen: 0,
      nichtVorgemerkt: 0,
      anfragen: 0,
      dauerMs: 0
    };
    if (vormerkZeitVorbei && (lazyRestClusterListe.length || uebersprungeneItems.length)) {
      // Abnormal: die Reserve war beim Phasenstart bereits verbraucht. EHRLICH zaehlen —
      // die nie geclusterten uebersprungenen Dokumente sind KEINE Kandidaten geworden und
      // fehlen damit sichtbar (kandidaten < zu erwartender Abdeckung, nichtVorgemerkt > 0).
      vormerkBilanz.nichtVorgemerkt = vormerkKandidaten.size;
    } else if (vormerkKandidaten.size) {
      if (typeof deps.savePendingBulk !== "function") {
        vormerkBilanz.nichtVorgemerkt = vormerkKandidaten.size;
      } else {
        const bulk = await deps.savePendingBulk([...vormerkKandidaten.entries()].map(([vorgangId, cluster]) => {
          const docs = (cluster && cluster.documents) || [];
          return {
            vorgangId,
            headline: (docs[0] && docs[0].title) || "",
            source_document_count: docs.length,
            dokumente: docs
          };
          // Die Deadline gilt auch ZWISCHEN den Chunks (Review-Befund: eine degradierte
          // Datenbank haette die Phase sonst minutenlang ueber die Reserve hinaus gehalten).
        }), { deadlineMs: vormerkDeadlineMs, now }).catch((error) => ({ skipped: true, reason: String((error && error.message) || "bulk-fehler").slice(0, 120) }));
        if (bulk && !bulk.skipped) {
          vormerkBilanz.vorgemerkt = Number(bulk.vorgemerkt) || 0;
          vormerkBilanz.bereitsVorhanden = Number(bulk.bereitsVorhanden) || 0;
          vormerkBilanz.fehlgeschlagen = Number(bulk.fehlgeschlagen) || 0;
          vormerkBilanz.anfragen = Number(bulk.anfragen) || 0;
          vormerkBilanz.nichtVorgemerkt = Math.max(0, vormerkKandidaten.size
            - vormerkBilanz.vorgemerkt - vormerkBilanz.bereitsVorhanden - vormerkBilanz.fehlgeschlagen);
        } else {
          vormerkBilanz.nichtVorgemerkt = vormerkKandidaten.size;
        }
      }
    }
    vormerkBilanz.dauerMs = now() - vormerkPhaseStart;
    phase("vormerkMs");
    if (vormerkBilanz.kandidaten) {
      console.log(`[globalphase] vormerk-abschluss ${vormerkBilanz.dauerMs}ms `
        + JSON.stringify({ ...vormerkBilanz, dauerMs: undefined }));
    }
    if (vormerkBilanz.fehlgeschlagen > 0 || vormerkBilanz.nichtVorgemerkt > 0) {
      console.error(`[globalphase] VORMERKLUECKE: ${vormerkBilanz.fehlgeschlagen} fehlgeschlagen,`
        + ` ${vormerkBilanz.nichtVorgemerkt} nicht vorgemerkt — Rueckstand NICHT vollstaendig dauerhaft.`);
    }

    // 8. Globale Lauftelemetrie — EIN Datensatz je Lauf, mandantenneutral (`politicianId: null`,
    //    `mode: "global"`). Er ersetzt keinen Mandatsdatensatz; die Mandatsphase schreibt ihren
    //    eigenen (siehe `runMandatsProjektion`).
    const okById = new Map(crawl.results.map((r) => [r.sourceId, r.ok]));
    const sourcesByCategory = {};
    for (const s of plan.quellen) {
      const cat = s.category || sourceSafety.categorizeSource(s);
      const b = sourcesByCategory[cat] || (sourcesByCategory[cat] = { checked: 0, ok: 0, failed: 0 });
      b.checked += 1;
      if (okById.get(s.id)) b.ok += 1; else b.failed += 1;
    }
    const loadedItems = crawl.results.reduce((sum, r) => sum + (r.itemCount || 0), 0) + dipItems.length;
    const newCandidateItems = crawl.newCandidateItems + dipItems.length;
    const newRawDocuments = persistResult && !persistResult.skipped && !persistResult.error && Number.isFinite(persistResult.persisted)
      ? persistResult.persisted
      : null;
    const sourcesByIdMap = {};
    for (const s of plan.quellen) sourcesByIdMap[s.id] = s;
    // OP-25 E3 (additiv, PII-frei): die Vormerkbilanz des Eager-Pfads ueber ALLE Stapel.
    // `nichtVorgemerkt > 0` oder ein uebersprungener Stapel heisst: es gibt zurueckgestellte
    // Cluster OHNE pending-Wissensobjekt — die sind spaeter nicht garantiert wiederauffindbar.
    // Genau diese Unterscheidung braucht der OP-25-Nachweisvertrag.
    const eagerZeitSkips = eagerErgebnisse.filter((e) => e && e.skipped === true && e.reason === "zeitbudget");
    const eagerBilanz = {
      stapel: eagerErgebnisse.length,
      verarbeitet: eagerErgebnisse.reduce((s, e) => s + (Number(e && e.processed) || 0), 0),
      zurueckgestellt: eagerErgebnisse.reduce((s, e) => s + (Number(e && e.deferred) || 0), 0),
      vorgemerkt: eagerErgebnisse.reduce((s, e) => s + (Number(e && e.vorgemerkt) || 0), 0),
      // K4: Bilanzfelder — "bereits vorhanden" ist Teil von `vorgemerkt` (dauerhaft),
      // ein SPEICHERFEHLER ist es ausdruecklich nicht (getrennt gezaehlt, nie Gruen).
      bereitsVorhanden: eagerErgebnisse.reduce((s, e) => s + (Number(e && e.bereitsVorhanden) || 0), 0),
      vormerkFehlgeschlagen: eagerErgebnisse.reduce((s, e) => s + (Number(e && e.vormerkFehlgeschlagen) || 0), 0),
      nichtVorgemerkt: eagerErgebnisse.reduce((s, e) => s + (Number(e && e.nichtVorgemerkt) || 0), 0),
      uebersprungeneStapel: eagerZeitSkips.length,
      uebersprungeneDokumente: eagerZeitSkips.reduce((s, e) => s + (Number(e.dokumente) || 0), 0),
      andereSkips: eagerErgebnisse.filter((e) => e && e.skipped === true && e.reason !== "zeitbudget").length
    };
    // K5 (Ursachenanalyse §7.7.6, Befund 6): die ERKLAERBARE Zusammensetzung der Kontextzahl.
    // `statisch` = Kontexte, deren Signatur eine statische Quellenplan-Signatur ist (die
    // Sichtbarkeitsmenge einer geplanten Quelle); alles andere mit bekannter Sichtbarkeit
    // entsteht DOKUMENTGETRIEBEN (Mehrfachherkunft eines Dokuments ueber mehrere Quellen,
    // DIP-je-Dokument-Sichtbarkeit). Damit ist eine Zahl wie 15 aus dem Lauf selbst
    // erklaerbar — statt an einer blinden `2n+1`-Formel zu scheitern.
    let kontextZusammensetzung = null;
    if (kontextgebunden) {
      const statischeSignaturen = new Set(
        Object.values(plan.herkunft || {})
          .map((mandate) => vorgangskontext.sichtbarkeitsSignatur(mandate))
          .filter(Boolean)
      );
      let statisch = 0;
      let dokumentgetrieben = 0;
      const groessen = {};
      for (const kontext of kontextPlan.kontexte) {
        const groessenSchluessel = String((kontext.mandate || []).length);
        groessen[groessenSchluessel] = (groessen[groessenSchluessel] || 0) + 1;
        if (kontext.unbekannt) continue;
        if (statischeSignaturen.has(kontext.schluessel)) statisch += 1;
        else dokumentgetrieben += 1;
      }
      kontextZusammensetzung = {
        statisch,
        dokumentgetrieben,
        unbekannt: kontextPlan.unbekannt,
        statischMoeglich: statischeSignaturen.size,
        dipDokumente: dipItems.length,
        mehrfachHerkunft: savedItems.filter((d) => Array.isArray(d && d.sourceIds) && d.sourceIds.length > 1).length,
        groessen
      };
    }
    // Strukturierte Ursachenzerlegung des Laufs — der Laufdatensatz war bisher die einzige
    // Ablage OHNE diese Trennung: `teilweise wegen Verstehensbudget` und `teilweise wegen
    // Quellen-/Persistenz-/Kontextfehler` sahen dort identisch aus. Nur Schrittnamen,
    // Zaehler und Mandats-Slugs — keine Fehlertexte, keine URLs, keine Inhalte.
    const datenstandDetail = {
      budgetMs,
      nichtAbgerufen,
      fehlerSchritte: fehler.map((f) => ({ schritt: String(f.schritt || "unbekannt").slice(0, 40), fatal: Boolean(f.fatal) })),
      fehlerhafteProfile: plan.fehlerhafteProfile.map((p) => String(p.politicianId).slice(0, 80)),
      persistenz: persistenzOk
        ? {
          ergebnis: "ok",
          anfragen: Number(persistResult.schreibAnfragen) || null,
          einzelnNachgezogen: Number(persistResult.einzelnNachgezogen) || 0,
          zaehlerVerfehlt: Number(persistResult.zaehlerVerfehlt) || 0,
          bestandsTreffer: Number(persistResult.bestandsTreffer) || 0
        }
        : { ergebnis: savedItems.length ? "fehlend" : "leer" },
      lazy: {
        cluster: lazyCluster,
        verarbeitet: lazyRan,
        uebersprungeneStapel: lazyUebersprungeneStapel,
        uebersprungeneDokumente: lazyUebersprungeneDokumente
      },
      eager: eagerBilanz,
      // K4: die GESAMT-Vormerkbilanz der Abschlussphase — der Beleg, dass der vollstaendige
      // Lazy-Rest und die uebersprungenen Stapel dauerhaft vorgemerkt sind (oder ehrlich nicht).
      vormerkung: vormerkBilanz,
      kontext: kontextgebunden
        ? {
          kontexte: kontextPlan.gesamt,
          geteilt: kontextPlan.geteilt,
          mandatseigen: kontextPlan.mandatseigen,
          unbekannt: kontextPlan.unbekannt,
          dokumente: kontextPlan.dokumente,
          ohneSichtbarkeit: kontextPlan.ohneSichtbarkeit.length,
          zusammensetzung: kontextZusammensetzung
        }
        : null,
      buendelung: kontextgebunden ? "kontext" : "global"
    };
    const globalerLauf = await deps.saveCrawlRun({
      mode: "global",
      // MANDANTENNEUTRAL: der globale Lauf gehoert keinem Mandat. `null` statt eines geratenen
      // oder bevorzugten Mandats (CLAUDE.md §4.2).
      politicianId: null,
      globalphase: true,
      durationMs: now() - startedMs,
      runId: laufId,
      sourceMode: sourceMode(),
      quellenVereinigung: {
        gesamt: plan.gesamt, gemeinsam: plan.gemeinsam, mandatseigen: plan.mandatseigen,
        doppelteAbrufwege: plan.doppelteAbrufwege.length,
        fehlerhafteProfile: plan.fehlerhafteProfile.map((p) => p.politicianId),
        mandate: tenantIds.length,
        // OP-25 E3 (additiv, 2026-08-04): die KENNUNGEN der Mandate, die dieser Lauf geplant hat
        // — nicht nur ihre Anzahl. Eine blosse Zahl kann einen AUSTAUSCH bei gleicher Anzahl
        // nicht ausschliessen (Mandat A raus, Mandat B rein bleibt `5`); der Nachweis muss die
        // eingefrorene Menge aber IDENTITAETSGENAU pruefen koennen. Nur technische Slugs,
        // dieselbe Datenklasse wie `politicianId` im Mandatslauf.
        mandateIds: [...tenantIds]
      },
      checkedSources: crawl.checkedSources,
      successfulSources: crawl.successfulSources,
      failedSources: crawl.failedSources,
      runState: classifyCrawlRunState({
        checkedSources: crawl.checkedSources,
        successfulSources: crawl.successfulSources,
        failedSources: crawl.failedSources,
        skippedSources: crawl.skippedSources || 0,
        circuitOpenSources: crawl.circuitOpenSources || 0,
        cooldownActive: cooldown.active
      }),
      providerBreakdown: buildProviderBreakdown(crawl.results, sourcesByIdMap),
      errorCodes: summarizeErrorCodes(crawl.results),
      skippedSources: crawl.skippedSources || 0,
      circuitOpenSources: crawl.circuitOpenSources || 0,
      sharedSkippedSources: crawl.sharedSkippedSources || 0,
      retriesTotal: crawl.retriesTotal || 0,
      cooldown: { active: cooldown.active, skipGoogle: Boolean(cooldown.skipGoogle), reason: cooldown.reason || null },
      googleGate: crawl.googleGate || null,
      googleUrlResolution: crawl.googleUrlResolution || null,
      newCandidateItems,
      savedItems: savedItems.length,
      newRawDocuments,
      loadedItems,
      discardedItems: Math.max(0, loadedItems - newCandidateItems),
      duplicates: Math.max(0, newCandidateItems - savedItems.length),
      sourcesByCategory,
      understanding: {
        processed: (eagerResult && eagerResult.processed) || 0,
        deferred: (eagerResult && eagerResult.deferred) || 0,
        reason: (eagerResult && eagerResult.reason) || null
      },
      datenstandDetail,
      errors: crawl.results.filter((result) => !result.ok).map((result) => ({ sourceName: result.sourceName, error: result.error }))
    }).catch((error) => {
      fehler.push({ schritt: "lauftelemetrie", grund: String((error && error.message) || "unbekannt").slice(0, 200) });
      return null;
    });

    try {
      const newBySource = new Map();
      for (const it of savedItems) { const sid = it && it.sourceId; if (sid == null) continue; newBySource.set(sid, (newBySource.get(sid) || 0) + 1); }
      const retryBySource = new Map();
      for (const r of crawl.results) { if (r && r.retryCount) retryBySource.set(r.sourceId, r.retryCount); }
      const telemetryRows = buildSourceTelemetryRows({
        runId: laufId,
        plannedProcess: "global",
        followUpProcess: "understanding",
        sourceMode: sourceMode(),
        location: executionLocation(),
        results: crawl.results,
        sourcesById: sourcesByIdMap,
        defaultLevel: null,
        newBySource,
        retryBySource
      });
      await deps.persistSourceCrawlTelemetry(telemetryRows, { insert: deps.insertSourceCrawlTelemetry }).catch(() => {});
    } catch (error) {
      console.error("[globalphase] Quellen-Telemetrie fehlgeschlagen (ignoriert):", error && error.message);
    }
    phase("telemetrieMs");
    // Die Zerlegung des Laufs in EINER Zeile — damit ein ueberzogener Lauf nicht mehr ueber
    // vier Tabellen rekonstruiert werden muss (das war der Aufwand nach dem 2026-08-03).
    console.log(`[globalphase/phasen] gesamt=${now() - startedMs}ms budget=${budgetMs}ms `
      + JSON.stringify(phasen));

    // 9. VERSIEGELN. Erst ab hier darf projiziert werden.
    datenstand = globalphase.datenstandVersiegeln(datenstand, {
      nowMs: now(),
      // OP-25 E3: das Budget gehoert IN den versiegelten Datenstand — die Budgetpruefung des
      // Nachweises vergleicht dann `dauerMs` gegen `budgetMs` aus DERSELBEN versiegelten Quelle.
      budgetMs,
      quellen: plan.gesamt,
      rohdokumente: savedItems.length,
      neueRohdokumente: newRawDocuments,
      verstanden: (eagerResult && eagerResult.processed) || 0,
      zurueckgestellt: ((eagerResult && eagerResult.deferred) || 0) + Math.max(0, lazyCluster - lazyRan),
      fehler,
      fehlerhafteProfile: plan.fehlerhafteProfile.map((p) => p.politicianId),
      // Ein uebersprungener Stapel zaehlt wie ein zurueckgestellter Cluster: der Lauf hat
      // NICHT alles verstanden und darf deshalb nie `abgeschlossen` heissen.
      budgetErschoepft: verbleibendMs() <= 0 || lazyRan < lazyCluster || lazyUebersprungeneStapel > 0,
      // K2.1: wie viele Buendelungskontexte dieser Lauf hatte. Im K1-Pfad bleibt der Wert
      // `null` — dort GIBT es keinen Kontextbegriff, und eine erfundene 1 waere eine
      // Behauptung ueber etwas, das dieser Pfad nicht leistet.
      kontexte: kontextgebunden ? kontextPlan.gesamt : null,
      buendelung: kontextgebunden ? "kontext" : "global",
      phasen,
      // Was das Verstehen NICHT geschafft hat, steht ausdruecklich da — ein uebersprungener
      // Stapel ist kein stiller Erfolg, sondern eine benannte Luecke (CLAUDE.md §4.4).
      lazy: {
        cluster: lazyCluster,
        verarbeitet: lazyRan,
        uebersprungeneStapel: lazyUebersprungeneStapel,
        uebersprungeneDokumente: lazyUebersprungeneDokumente
      }
    });
    console.log(`[globalphase/datenstand] ${JSON.stringify(globalphase.datenstandVermerk(datenstand))}`);
    // OP-25 E3 (additiv): EIN dauerhafter Laufbeleg je globaler Phase in der Prozess-
    // Lauftelemetrie. Der Blob-Laufdatensatz unterliegt Retention (20 Eintraege) und dem
    // Last-Write-Wins-Fenster des Gesamt-Blobs (Befund W-2) — diese Zeile uebersteht beides
    // und traegt den VERSIEGELTEN Status samt kompakter Ursachenzerlegung. Nur Zaehler und
    // Schrittnamen, keine Inhalte. Ein Telemetriefehler wird ausgewiesen, nie verschluckt.
    const datenstandTelemetrie = await deps.recordProcessRun({
      process: "globalphase",
      runId: laufId,
      mode: "global",
      location: executionLocation(),
      startedAt: new Date(startedMs).toISOString(),
      finishedAt: new Date(now()).toISOString(),
      durationMs: datenstand.dauerMs,
      status: datenstand.status === globalphase.DATENSTAND_ABGESCHLOSSEN
        ? "success"
        : (datenstand.status === globalphase.DATENSTAND_TEILWEISE ? "partial" : "failed"),
      reason: [
        `status=${datenstand.status}`,
        `budget=${datenstand.budgetErschoepft ? 1 : 0}`,
        `fehler=${fehler.length}`,
        `abruf=${nichtAbgerufen}`,
        `persistenz=${datenstandDetail.persistenz.ergebnis}`,
        `cas=${datenstandDetail.persistenz.zaehlerVerfehlt || 0}`,
        `lazyskip=${lazyUebersprungeneStapel}`,
        // K4: nv ist die GESAMTE Vormerkluecke des Laufs (Verstehensphase + Abschlussphase,
        // inkl. Speicherfehler) — vorher nur der Eager-Anteil.
        `nv=${eagerBilanz.nichtVorgemerkt + eagerBilanz.vormerkFehlgeschlagen
          + vormerkBilanz.nichtVorgemerkt + vormerkBilanz.fehlgeschlagen}`,
        `vk=${vormerkBilanz.kandidaten}`
      ].join(" ").slice(0, 120),
      zielmenge: savedItems.length,
      processed: datenstand.verstanden,
      deferred: datenstand.zurueckgestellt,
      gespeichert: newRawDocuments,
      uebersprungen: lazyUebersprungeneDokumente + eagerBilanz.uebersprungeneDokumente,
      fehlgeschlagen: fehler.length,
      cluster: lazyCluster,
      // NUR NEUE dauerhafte Vormerkungen dieses Laufs (beide Phasen). `bereitsVorhanden`
      // zaehlt hier NICHT mit — dieselben Vorgaenge koennen bereits von der Eager-Phase
      // dieses Laufs (oder frueheren Laeufen) stammen und wuerden doppelt gezaehlt.
      vorgemerkt: Math.max(0, eagerBilanz.vorgemerkt - eagerBilanz.bereitsVorhanden) + vormerkBilanz.vorgemerkt
    });
    if (datenstandTelemetrie && !datenstandTelemetrie.ok) {
      console.error(`[globalphase] LAUFTELEMETRIE NICHT GESPEICHERT (globalphase, runId ${laufId})`);
    }
    return { datenstand, plan, kontextPlan, crawlRun: globalerLauf, savedItems: savedItems.length };
  } catch (error) {
    console.error("[globalphase] Erfassung fehlgeschlagen:", error && error.message);
    fehler.push({ schritt: "erfassung", grund: String((error && error.message) || "unbekannt").slice(0, 200), fatal: true });
    return {
      datenstand: globalphase.datenstandVersiegeln(datenstand, { nowMs: now(), fehler }),
      ergebnis: null
    };
  } finally {
    await deps.releaseLock(GLOBALPHASE_LOCK);
  }
}

// MANDATSPHASE — Projektion EINES Mandats auf den versiegelten globalen Datenstand.
// Genau die Schritte aus `runSourceCrawl`, die mandatsbezogen sind: Profil, Matching,
// Entscheidungen, Mandatstelemetrie. Die Mandatssperre `crawl-<mandat>` bleibt unveraendert —
// gleicher Name, gleiche TTL, gleicher Rueckgabewert bei verweigerter Sperre, damit die
// Fairnessbuchfuehrung (§3a.1) unveraendert greift.
async function runMandatsProjektion(politicianId, datenstand, options = {}) {
  politicianId = requireTenantId(politicianId, "runMandatsProjektion");
  // HARTER RIEGEL: kein Matching vor Abschluss der globalen Phase. Wirft absichtlich.
  globalphase.mandatsphaseBereit(datenstand);
  const deps = globalphaseDeps(options.deps || {});
  const now = deps.now;
  const lockName = `crawl-${politicianId}`;
  const locked = await deps.acquireLock(lockName, GLOBALPHASE_LOCK_TTL_MS);
  if (!locked) {
    console.warn(`[mandatsprojektion] Job laeuft bereits fuer ${politicianId}, uebersprungen.`);
    return { skipped: true, reason: "already running" };
  }
  const startedMs = now();
  const runId = options.runId || makeRunId("projektion", startedMs);
  try {
    const profile = await deps.getActiveProfile(politicianId);
    const matchingResult = await deps.matching({
      profile,
      pipelineRunId: runId,
      ausloeser: options.ausloeser || "crawl"
    }).catch(async (error) => {
      await deps.recordPipelineError({ process: "matching-shadow", runId, error }).catch(() => {});
      return null;
    });
    const decisionResult = await deps.decisions({ profile }).catch(async (error) => {
      await deps.recordPipelineError({ process: "decision-shadow", runId, error }).catch(() => {});
      return null;
    });
    const completeness = profileCompleteness(profile);
    const vermerk = globalphase.datenstandVermerk(datenstand);
    // Mandatstelemetrie. Sie behauptet KEINE eigene Erfassung: Quellen-/Dokumentzaehler
    // bleiben aussen vor, stattdessen steht der Datenstand daneben, auf den projiziert wurde.
    // Ein `teilweise`/`fehlgeschlagen` markierter Datenstand kann damit nie als frisch gelesen
    // werden (CLAUDE.md §4.4).
    // K6 (Ursachenanalyse §7.7.6, Nebenbefund 7): ein fehlgeschlagener `saveCrawlRun` wurde
    // hier still verschluckt (`.catch(() => null)`) und die Projektion meldete trotzdem
    // Erfolg — Widerspruch zu CLAUDE.md §4.10 (wer Erfolg meldet, prueft ihn gegen die
    // Ablage). Jetzt gilt: ein NICHT gespeicherter Mandatslauf ist ein FEHLGESCHLAGENES
    // Ergebnis (`failed: true` — die Fairnessschicht zaehlt es als fehlgeschlagen, nie als
    // Erfolg). Es wird NICHT geworfen und NICHT wiederholt: Matching und Entscheidungen
    // sind bereits gelaufen, eine Wiederholung im selben Lauf haette doppelte Produkt-
    // wirkung; der naechste regulaere Lauf projiziert ohnehin neu. In die Meldung geht nur
    // eine gekappte technische Fehlermeldung — keine Nutzdaten, keine Secrets.
    let persistenzFehler = null;
    const run = await deps.saveCrawlRun({
      mode: "mandat",
      politicianId,
      durationMs: now() - startedMs,
      runId,
      sourceMode: sourceMode(),
      datenstand: vermerk,
      globalLaufId: vermerk.laufId,
      datenstandFrisch: vermerk.frisch,
      matching: shadowSummary(matchingResult),
      decisions: shadowSummary(decisionResult),
      profileCompleteness: { level: completeness.level, restricted: completeness.restricted, missing: completeness.missing }
    }).catch((error) => {
      persistenzFehler = String((error && error.message) || "unbekannt").slice(0, 200);
      return null;
    });
    if (!run) {
      console.error(`[mandatsprojektion] Mandatslaufdatensatz NICHT gespeichert (${politicianId}, runId ${runId}): ${persistenzFehler || "kein Rueckgabewert"}`);
      await deps.recordPipelineError({
        process: "mandatsprojektion", runId,
        errorType: "mandatslauf-nicht-gespeichert"
      }).catch(() => {});
      return {
        politicianId,
        projektion: true,
        failed: true,
        persistenz: "fehlgeschlagen",
        grund: "mandatslauf-nicht-gespeichert",
        datenstand: vermerk,
        matching: shadowSummary(matchingResult),
        decisions: shadowSummary(decisionResult)
      };
    }
    return {
      ...run,
      politicianId,
      projektion: true,
      datenstand: vermerk,
      matching: shadowSummary(matchingResult),
      decisions: shadowSummary(decisionResult)
    };
  } finally {
    await deps.releaseLock(lockName);
  }
}

module.exports = {
  runSourceCrawl,
  runLageCheck,
  filterRelevantItemsForProfile,
  getActiveProfile,
  mergeProfileDefaults,
  // Ingestion-Ableitung (exportiert fuer Tests der profilbasierten Quellenlogik):
  getSourcesForProfile,
  mandateNewsSources,
  // OP-30: additiv exportiert fuer den Source-Demand-Compiler und dessen Vertragstests.
  // Verhalten unveraendert — nur die Sichtbarkeit.
  personNewsSource,
  topProfileTopics,
  buildPipelineDebugReport,
  dipDocToRawItem,
  dipPrimaryEnabled,
  fetchDipAsRawItems,
  persistRawDocumentsShadow,
  // OP-25 K1 (Schattenpfad, Default AUS):
  runGlobaleErfassung,
  runMandatsProjektion,
  GLOBALPHASE_LOCK,
  // K4/K8: Zeitvertrag der globalen Phase (fuer Tests und den Nachweisvertrag lesbar).
  ABSCHLUSS_RESERVE_MS,
  VORMERK_RESERVE_MS
};
