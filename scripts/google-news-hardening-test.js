"use strict";

// Google-News-Härtung — Unit-Suite (Sprint 2026-07, Phase 3/4).
// Belegt offline (kein Netz, injizierte Uhr/Sleep/Random):
//   Backoff/Jitter, Retry-After, maximale Retry-Zahl, 429-/Timeout-Verhalten,
//   Circuit Breaker, Parallelitätsgrenze + Mindestabstand des Gates,
//   Cooldown-Entscheidung (nach Degradation + Crawl-Abstands-Schutz),
//   Lauf-Klassifikation (7 Zustände) und Provider-Trennung der Zähler.

const {
  CIRCUIT_OPEN_MESSAGE,
  googleHardeningEnabled,
  googleHardeningConfig,
  isGoogleNewsSource,
  parseRetryAfterMs,
  computeRetryDelayMs,
  isRetryableGoogleError,
  createGoogleNewsGate,
  withGoogleRetry,
  evaluateCooldown
} = require("../lib/helmut/google-news-hardening");
const { classifyCrawlRunState, buildProviderBreakdown, summarizeErrorCodes, RUN_STATES } = require("../lib/helmut/crawl-run-state");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

(async () => {
  // ── Kill-Switch + Config-Parsing (fail-closed) ─────────────────────────────
  check("Härtung default AN", googleHardeningEnabled({}) === true);
  check("Kill-Switch off/0/false/aus", ["off", "0", "false", "aus"].every((v) => googleHardeningEnabled({ HELMUT_GOOGLE_HARDENING: v }) === false));
  const cfgBad = googleHardeningConfig({ HELMUT_GOOGLE_CONCURRENCY: "kaputt", HELMUT_GOOGLE_RETRY_MAX: "-3" });
  check("ungültige Env-Werte fallen auf konservative Defaults", cfgBad.concurrency === 5 && cfgBad.retryMax === 2);
  const cfgSet = googleHardeningConfig({ HELMUT_GOOGLE_CONCURRENCY: "3", HELMUT_GOOGLE_MIN_SPACING_MS: "0" });
  check("gültige Env-Werte greifen", cfgSet.concurrency === 3 && cfgSet.minSpacingMs === 0);

  // ── Provider-Klassifikation ────────────────────────────────────────────────
  check("news.google-Quelle erkannt (rssUrl/rssUrls/url)",
    isGoogleNewsSource({ rssUrl: "https://news.google.com/rss/search?q=x" }) &&
    isGoogleNewsSource({ rssUrls: ["https://news.google.com/rss/search?q=y"] }) &&
    isGoogleNewsSource({ url: "https://news.google.com/search?q=z" }));
  check("direkte RSS-/HTML-Quelle ist NICHT google", !isGoogleNewsSource({ rssUrl: "https://www.bmas.de/rss.xml" }));

  // ── Retry-After-Parsing ────────────────────────────────────────────────────
  check("Retry-After Sekunden", parseRetryAfterMs("7") === 7000);
  const now = Date.UTC(2026, 6, 17, 12, 0, 0);
  check("Retry-After HTTP-Datum", parseRetryAfterMs(new Date(now + 5000).toUTCString(), now) === 5000);
  check("Retry-After Vergangenheit -> 0", parseRetryAfterMs(new Date(now - 5000).toUTCString(), now) === 0);
  check("Retry-After leer/Müll -> null", parseRetryAfterMs("") === null && parseRetryAfterMs("bald") === null);

  // ── Backoff mit Jitter + Retry-After-Vorrang ──────────────────────────────
  const d0 = computeRetryDelayMs(0, { baseMs: 1000, capMs: 8000, random: () => 0 });
  const d0max = computeRetryDelayMs(0, { baseMs: 1000, capMs: 8000, random: () => 0.999 });
  const d2 = computeRetryDelayMs(2, { baseMs: 1000, capMs: 8000, random: () => 0 });
  check("Backoff exponentiell (Attempt 0: >=500, Attempt 2: >=2000)", d0 === 500 && d2 === 2000);
  check("Jitter streut nach oben (max ~doppelte Untergrenze)", d0max > d0 && d0max <= 1000);
  check("Backoff gedeckelt (capMs)", computeRetryDelayMs(10, { baseMs: 1000, capMs: 8000, random: () => 0 }) === 4000);
  check("Retry-After hat Vorrang und wird gedeckelt",
    computeRetryDelayMs(0, { retryAfterMs: 3000, baseMs: 1000 }) === 3000 &&
    computeRetryDelayMs(0, { retryAfterMs: 60000, retryAfterCapMs: 15000 }) === 15000);

  // ── Retry-Würdigkeit: 429/5xx ja, Timeout/404 nein ────────────────────────
  const e429 = new Error("HTTP 429 for https://news.google.com/x"); e429.statusCode = 429;
  const e503 = new Error("HTTP 503 for x"); e503.statusCode = 503;
  const eTimeout = new Error("Timeout for https://news.google.com/x");
  const e404 = new Error("HTTP 404 for x"); e404.statusCode = 404;
  check("429 + 5xx sind retry-würdig", isRetryableGoogleError(e429) && isRetryableGoogleError(e503));
  check("Timeout wird NICHT wiederholt (bewusst: kostet sonst doppelte Laufzeit)", !isRetryableGoogleError(eTimeout));
  check("404 wird NICHT wiederholt (dauerhaft)", !isRetryableGoogleError(e404));

  // ── withGoogleRetry: maximale Retry-Zahl, keine Endlosschleife ────────────
  const sleeps = [];
  const fastSleep = async (ms) => { sleeps.push(ms); };
  let calls = 0;
  try {
    await withGoogleRetry(async () => { calls += 1; throw e429; }, { retryMax: 2, baseMs: 10, capMs: 50, sleep: fastSleep, random: () => 0 });
    check("withGoogleRetry wirft nach Erschöpfung", false);
  } catch (err) {
    check("withGoogleRetry wirft nach Erschöpfung", err === e429);
  }
  check("maximale Retry-Zahl eingehalten (1 Versuch + 2 Retries)", calls === 3 && sleeps.length === 2);

  // Retry-After steuert die Wartezeit
  sleeps.length = 0; calls = 0;
  const eRa = new Error("HTTP 429 for x"); eRa.statusCode = 429; eRa.retryAfterMs = 1234;
  try { await withGoogleRetry(async () => { calls += 1; throw eRa; }, { retryMax: 1, sleep: fastSleep, retryAfterCapMs: 15000 }); } catch { /* erwartet */ }
  check("Retry-After bestimmt die Wartezeit", sleeps.length === 1 && sleeps[0] === 1234);

  // Erfolg nach einem 429 -> Ergebnis kommt durch, genau 1 Retry
  calls = 0;
  const value = await withGoogleRetry(async () => { calls += 1; if (calls === 1) throw e429; return "ok"; }, { retryMax: 2, baseMs: 1, sleep: fastSleep, random: () => 0 });
  check("Retry nach 429 führt zum Erfolg", value === "ok" && calls === 2);

  // Timeout -> sofortiger Abbruch ohne Retry
  calls = 0;
  try { await withGoogleRetry(async () => { calls += 1; throw eTimeout; }, { retryMax: 2, sleep: fastSleep }); } catch { /* erwartet */ }
  check("Timeout: kein Retry-Versuch", calls === 1);

  // Breaker offen -> kein weiterer Retry
  calls = 0;
  try { await withGoogleRetry(async () => { calls += 1; throw e429; }, { retryMax: 5, sleep: fastSleep, isOpen: () => true }); } catch { /* erwartet */ }
  check("offener Breaker stoppt Retries sofort", calls === 1);

  // Lauf-Retry-Budget (canRetry): erschöpft -> keine weiteren Wiederholungen
  calls = 0;
  let budget = 1;
  try {
    await withGoogleRetry(async () => { calls += 1; throw e429; }, {
      retryMax: 5, sleep: fastSleep, random: () => 0, baseMs: 1,
      canRetry: () => { if (budget <= 0) return false; budget -= 1; return true; }
    });
  } catch { /* erwartet */ }
  check("Lauf-Retry-Budget deckelt Wiederholungen hart (1 Budget -> 2 Versuche)", calls === 2);

  // Versuchs-Granularität: jeder Fehlversuch wird sofort gemeldet (Breaker-Speed)
  calls = 0;
  const attemptErrors = [];
  try {
    await withGoogleRetry(async () => { calls += 1; throw e429; }, {
      retryMax: 2, sleep: fastSleep, random: () => 0, baseMs: 1,
      onAttemptError: (e) => attemptErrors.push(e)
    });
  } catch { /* erwartet */ }
  check("jeder Fehlversuch speist den Breaker (3 Versuche -> 3 Meldungen)", attemptErrors.length === 3);

  // Breaker öffnet WÄHREND des Backoff-Schlafs -> nächster Versuch unterbleibt
  calls = 0;
  let openNow = false;
  try {
    await withGoogleRetry(async () => { calls += 1; throw e429; }, {
      retryMax: 3, baseMs: 1, random: () => 0,
      sleep: async () => { openNow = true; },
      isOpen: () => openNow
    });
  } catch { /* erwartet */ }
  check("Breaker-Öffnung während des Schlafs bricht die Retry-Kette ab", calls === 1);

  // ── Gate: Parallelitätsgrenze + Mindestabstand ────────────────────────────
  const gate = createGoogleNewsGate({ concurrency: 2, minSpacingMs: 0, breakerMinObservations: 999 });
  let active = 0, maxActive = 0;
  await Promise.all(Array.from({ length: 8 }, () => gate.schedule(async () => {
    active += 1; maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 5));
    active -= 1;
  })));
  check("Gate: Parallelität nie über der Grenze (2)", maxActive === 2, `maxActive=${maxActive}`);

  const starts = [];
  const spacingGate = createGoogleNewsGate({ concurrency: 4, minSpacingMs: 25, breakerMinObservations: 999 });
  await Promise.all(Array.from({ length: 4 }, () => spacingGate.schedule(async () => { starts.push(Date.now()); })));
  starts.sort((a, b) => a - b);
  const gaps = starts.slice(1).map((t, i) => t - starts[i]);
  check("Gate: Mindestabstand zwischen Starts eingehalten (>=15ms bei 25ms Soll)", gaps.every((g) => g >= 15), `gaps=${gaps.join(",")}`);

  // ── Circuit Breaker: öffnet bei Drosselung, fail-fast danach ──────────────
  const breaker = createGoogleNewsGate({ concurrency: 2, minSpacingMs: 0, breakerMinObservations: 4, breakerFailureRatio: 0.5 });
  for (let i = 0; i < 4; i += 1) breaker.report(e429);
  check("Breaker öffnet nach Schwelle (4 Beobachtungen, 100% 429)", breaker.isOpen() === true);
  let circuitError = null;
  try { await breaker.schedule(async () => "läuft"); } catch (err) { circuitError = err; }
  check("offener Breaker: schedule wirft SOFORT klassifizierbaren Fehler",
    circuitError && circuitError.message === CIRCUIT_OPEN_MESSAGE);

  const healthyGate = createGoogleNewsGate({ concurrency: 2, minSpacingMs: 0, breakerMinObservations: 4, breakerFailureRatio: 0.5 });
  healthyGate.report(null); healthyGate.report(null); healthyGate.report(null); healthyGate.report(e429);
  check("Breaker bleibt bei überwiegend Erfolg geschlossen", healthyGate.isOpen() === false);
  const timeoutGate = createGoogleNewsGate({ concurrency: 2, minSpacingMs: 0, breakerMinObservations: 3, breakerFailureRatio: 0.6 });
  timeoutGate.report(eTimeout); timeoutGate.report(eTimeout); timeoutGate.report(eTimeout);
  check("Timeouts zählen als Drosselungs-Signal für den Breaker", timeoutGate.isOpen() === true);

  // Breaker-Gedächtnis: ein vor-geöffnetes Gate startet fail-fast
  const memGate = createGoogleNewsGate({ concurrency: 2, minSpacingMs: 0 }, { startOpen: true });
  let memErr = null;
  try { await memGate.schedule(async () => "x"); } catch (e) { memErr = e; }
  check("startOpen (Breaker-Gedächtnis): Gate startet offen, fail-fast", memGate.isOpen() && memErr && memErr.message === CIRCUIT_OPEN_MESSAGE);

  // Gate-Retry-Budget: consumeRetry gibt genau budget-viele Wiederholungen frei
  const budgetGate = createGoogleNewsGate({ concurrency: 1, minSpacingMs: 0, retryBudget: 2 });
  const grants = [budgetGate.consumeRetry(), budgetGate.consumeRetry(), budgetGate.consumeRetry()];
  check("Gate-Retry-Budget: 2 Freigaben, dann Schluss", grants[0] === true && grants[1] === true && grants[2] === false && budgetGate.state().retryBudgetLeft === 0);

  // ── Cooldown-Entscheidung ─────────────────────────────────────────────────
  const nowMs = Date.UTC(2026, 6, 17, 12, 0, 0);
  const cfg = { cooldownMs: 60 * 60 * 1000, fullCrawlMinSpacingMs: 30 * 60 * 1000 };
  const degradedRun = { mode: "full", createdAt: new Date(nowMs - 40 * 60 * 1000).toISOString(), checkedSources: 145, successfulSources: 16, failedSources: 129 };
  const cd1 = evaluateCooldown({ lastRuns: [degradedRun], nowMs, config: cfg });
  check("Cooldown nach stark degradiertem Lauf (<60min)", cd1.active === true && cd1.reason === "nach-degradation" && cd1.skipGoogle === false);

  const freshRun = { mode: "full", createdAt: new Date(nowMs - 10 * 60 * 1000).toISOString(), checkedSources: 145, successfulSources: 145, failedSources: 0 };
  const cd2 = evaluateCooldown({ lastRuns: [freshRun], nowMs, config: cfg });
  check("Schutz vor zu frühem Vollcrawl (<30min): Google übersprungen", cd2.active === true && cd2.reason === "crawl-abstand" && cd2.skipGoogle === true);

  const oldHealthy = { mode: "full", createdAt: new Date(nowMs - 5 * 60 * 60 * 1000).toISOString(), checkedSources: 145, successfulSources: 145, failedSources: 0 };
  const cd3 = evaluateCooldown({ lastRuns: [oldHealthy], nowMs, config: cfg });
  check("normaler Cron-Abstand (>Spacing, gesund): kein Cooldown", cd3.active === false);

  const cd4 = evaluateCooldown({ lastRuns: [freshRun], nowMs, config: cfg, force: true });
  check("force-Override deaktiviert die Schutzmechanismen bewusst", cd4.active === false && cd4.reason === "force-override");

  const cdOldDegraded = evaluateCooldown({ lastRuns: [{ ...degradedRun, createdAt: new Date(nowMs - 2 * 60 * 60 * 1000).toISOString() }], nowMs, config: cfg });
  check("Degradation älter als Cooldown-Fenster: kein Cooldown mehr", cdOldDegraded.active === false);

  const cdRunState = evaluateCooldown({ lastRuns: [{ mode: "full", createdAt: new Date(nowMs - 40 * 60 * 1000).toISOString(), runState: "stark-degradiert", checkedSources: 145, successfulSources: 140, failedSources: 5 }], nowMs, config: cfg });
  check("persistiertes runState-Feld wird respektiert", cdRunState.active === true && cdRunState.reason === "nach-degradation");

  // Multi-Tenant: der Abstands-Schutz ist mandanten-bewusst — der frische Lauf
  // eines ANDEREN Mandats (sequenzieller Cron-Loop) streicht Mandat B nicht den
  // Google-Anteil; die Degradations-Bremse wirkt dagegen mandantsübergreifend
  // (Google drosselt pro Egress-IP, nicht pro Mandat).
  const freshOtherTenant = { ...freshRun, politicianId: "mandat-a" };
  const cdOther = evaluateCooldown({ lastRuns: [freshOtherTenant], nowMs, config: cfg, tenantId: "mandat-b" });
  check("frischer Lauf eines ANDEREN Mandats löst KEINEN Abstands-Skip aus", cdOther.active === false);
  const cdSame = evaluateCooldown({ lastRuns: [freshOtherTenant], nowMs, config: cfg, tenantId: "mandat-a" });
  check("frischer Lauf DESSELBEN Mandats löst den Abstands-Skip aus", cdSame.active === true && cdSame.skipGoogle === true);
  const cdLegacyRun = evaluateCooldown({ lastRuns: [freshRun], nowMs, config: cfg, tenantId: "mandat-b" });
  check("Alt-Lauf ohne politicianId zählt konservativ als eigener (Schutz greift)", cdLegacyRun.active === true);
  const degradedOther = { ...degradedRun, politicianId: "mandat-a" };
  const cdDegOther = evaluateCooldown({ lastRuns: [degradedOther], nowMs, config: cfg, tenantId: "mandat-b" });
  check("Degradations-Cooldown wirkt mandantsübergreifend", cdDegOther.active === true && cdDegOther.reason === "nach-degradation");

  // ── Lauf-Klassifikation (8 Zustände) ──────────────────────────────────────
  // 8 statt 7: 'aggregator-gedrosselt' (zentrale Provider-Drosselung) ist seit
  // Incident 2026-07-25 ein eigener Zustand — ein zentraler Breaker-Abbruch ist
  // NICHT dasselbe wie N defekte Einzelquellen.
  check("Zustandskatalog vollständig (8)", RUN_STATES.length === 8);
  check("gesund (<=10% Fehler)", classifyCrawlRunState({ checkedSources: 145, successfulSources: 140, failedSources: 5 }) === "gesund");
  check("teilweise-degradiert (>10%, <=50%)", classifyCrawlRunState({ checkedSources: 100, successfulSources: 70, failedSources: 30 }) === "teilweise-degradiert");
  check("stark-degradiert (>50%) — der B1-Lauf (129/145)", classifyCrawlRunState({ checkedSources: 145, successfulSources: 16, failedSources: 129 }) === "stark-degradiert");
  check("fehlgeschlagen (0 erfolgreiche)", classifyCrawlRunState({ checkedSources: 145, successfulSources: 0, failedSources: 145 }) === "fehlgeschlagen");
  check("fehlgeschlagen (Absturz)", classifyCrawlRunState({ crashed: true }) === "fehlgeschlagen");
  check("cooldown-reduziert (gesunder Lauf im Cooldown)", classifyCrawlRunState({ checkedSources: 145, successfulSources: 140, failedSources: 5, cooldownActive: true }) === "cooldown-reduziert");
  check("stark-degradiert schlägt cooldown-reduziert", classifyCrawlRunState({ checkedSources: 100, successfulSources: 30, failedSources: 70, cooldownActive: true }) === "stark-degradiert");
  check("lock-uebersprungen", classifyCrawlRunState({ lockSkipped: true }) === "lock-uebersprungen");
  check("unbekannt bei fehlenden Zählern", classifyCrawlRunState({}) === "unbekannt");
  check("übersprungene Quellen verzerren die Quote nicht",
    classifyCrawlRunState({ checkedSources: 145, successfulSources: 3, failedSources: 0, skippedSources: 142, cooldownActive: true }) === "cooldown-reduziert");

  // ── Provider-Trennung der Zähler + Fehlercode-Summen ──────────────────────
  const sourcesById = {
    g1: { id: "g1", rssUrl: "https://news.google.com/rss/search?q=a" },
    g2: { id: "g2", rssUrl: "https://news.google.com/rss/search?q=b" },
    d1: { id: "d1", rssUrl: "https://www.bmas.de/rss.xml" }
  };
  const results = [
    { sourceId: "g1", ok: false, error: "https://…: HTTP 429 for https://news.google.com/x", retryCount: 2 },
    { sourceId: "g2", ok: false, error: "google-news-circuit-open", retryCount: 0 },
    { sourceId: "d1", ok: true, retryCount: 0 }
  ];
  const breakdown = buildProviderBreakdown(results, sourcesById);
  check("Provider-Trennung: google failed=2 (429+circuit), direct ok=1",
    breakdown.googleNews.failed === 2 && breakdown.googleNews.http429 === 1 && breakdown.googleNews.circuitOpen === 1 &&
    breakdown.direct.ok === 1 && breakdown.direct.failed === 0);
  check("Retry-Summe je Provider", breakdown.googleNews.retries === 2 && breakdown.direct.retries === 0);
  const codes = summarizeErrorCodes(results);
  check("Fehlercode-Summen inhaltsfrei klassifiziert", codes["http-429"] === 1 && codes["circuit-open"] === 1 && !JSON.stringify(codes).includes("news.google.com/x"));

  console.log(`\n${passed}/${passed + failed} Google-News-Härtung-Assertions erfolgreich.`);
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
})().catch((err) => { console.error("Suite-Fehler:", err); process.exit(1); });
