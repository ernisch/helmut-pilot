"use strict";

// Google-News-Härtung (Sprint 2026-07: Drosselung, Alarmierung, Betriebsreife).
// ============================================================================
// HINTERGRUND (Production-Beleg, Lauf crawl-20260716200114-v268f): 129/145 Quellen
// fielen aus — ALLE Ausfälle waren Google-News-Abrufe (47× HTTP 429, 81× Timeout,
// 1× http-4xx); die direkten RSS-/amtlichen Quellen liefen fehlerfrei. Auslöser
// sehr wahrscheinlich: 3 Vollcrawls in ~4 h (16:00 Cron, 18:24 manuell, 20:01 Cron)
// mit unbegrenzter Google-Parallelität (bis 20 Quellen × 4 URL-Auflösungen
// gleichzeitig) und ohne Retry-/429-/Retry-After-Behandlung.
//
// DIESES MODUL liefert die kleinste robuste Gegenmaßnahme, strikt NACH PROVIDER
// GETRENNT — direkte RSS-/HTML-/amtliche Quellen werden NIE gebremst:
//   1. Gate: begrenzte Parallelität NUR für Google-News-Quellen (Semaphor)
//   2. Mindestabstand zwischen Google-News-Quellenstarts (Spacing)
//   3. Retry mit exponentiellem Backoff + zufälliger Streuung (nur 429/5xx/
//      Verbindungsfehler; Timeouts werden bewusst NICHT wiederholt — sie haben
//      bereits das volle Timeout-Fenster gekostet, die Nachholung übernimmt der
//      nächste Lauf)
//   4. Berücksichtigung des Retry-After-Headers (gedeckelt)
//   5. Harte maximale Retry-Zahl (keine Endlosschleifen)
//   6. Circuit Breaker pro Lauf: bei massiver Drosselung werden die restlichen
//      Google-Abrufe SOFORT beendet (fail-fast statt 100+ × 7-s-Timeout) —
//      das schützt Google vor weiterem Hämmern und den Lauf vor dem
//      Serverless-Zeitlimit
//   7. Cooldown: nach einem stark degradierten Lauf fährt der nächste Lauf
//      Google-News mit reduzierter Last; eng aufeinanderfolgende Vollcrawls
//      überspringen den Google-Anteil ganz (amtliche/direkte Quellen laufen immer)
//
// ALLE Grenzwerte sind Env-überschreibbar (fail-closed geparst: gesetzte, aber
// ungültige Werte fallen auf den konservativen Default, nie auf "unbegrenzt").
// KILL-SWITCH: HELMUT_GOOGLE_HARDENING=off stellt byte-identisch das alte
// Verhalten her (Rollback ohne Deploy, via Env).
// Reine Logik + injizierbare Uhr/Sleep/Random — vollständig offline testbar.

const CIRCUIT_OPEN_MESSAGE = "google-news-circuit-open";

function posNum(raw, fallback) {
  const s = String(raw ?? "").trim();
  if (s === "") return fallback;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function nonNegNum(raw, fallback) {
  const s = String(raw ?? "").trim();
  if (s === "") return fallback;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function ratioNum(raw, fallback) {
  const n = posNum(raw, fallback);
  return n > 0 && n <= 1 ? n : fallback;
}

// Ist die Härtung aktiv? Default AN (die Aktivierung ist genau der freigegebene
// Deploy dieses Sprints); "off"/"0"/"false" = Kill-Switch ohne Deploy.
function googleHardeningEnabled(env = process.env) {
  const v = String(env.HELMUT_GOOGLE_HARDENING || "").trim().toLowerCase();
  return !(v === "off" || v === "0" || v === "false" || v === "aus");
}

// Zentrale, Env-überschreibbare Konfiguration (empfohlene Defaults, siehe
// docs/betrieb/google_news_haertung.md — Schwellen sind Empfehlung, keine
// endgültige Produktentscheidung).
function googleHardeningConfig(env = process.env) {
  return {
    enabled: googleHardeningEnabled(env),
    concurrency: Math.floor(posNum(env.HELMUT_GOOGLE_CONCURRENCY, 5)),
    minSpacingMs: Math.floor(nonNegNum(env.HELMUT_GOOGLE_MIN_SPACING_MS, 200)),
    retryMax: Math.floor(nonNegNum(env.HELMUT_GOOGLE_RETRY_MAX, 2)),
    retryBaseMs: Math.floor(posNum(env.HELMUT_GOOGLE_RETRY_BASE_MS, 1000)),
    retryCapMs: Math.floor(posNum(env.HELMUT_GOOGLE_RETRY_CAP_MS, 8000)),
    retryAfterCapMs: Math.floor(posNum(env.HELMUT_GOOGLE_RETRY_AFTER_CAP_MS, 15000)),
    breakerMinObservations: Math.floor(posNum(env.HELMUT_GOOGLE_BREAKER_MIN_OBSERVATIONS, 10)),
    breakerFailureRatio: ratioNum(env.HELMUT_GOOGLE_BREAKER_FAILURE_RATIO, 0.6),
    // Harte Obergrenze der Retries JE LAUF (Review-Fix): Backoff-Schlafzeiten
    // halten einen Gate-Slot — ohne Laufbudget könnte eine Teil-Drosselung
    // (unterhalb der Breaker-Schwelle) die Crawl-Phase über das Serverless-
    // Zeitlimit treiben. Budget erschöpft -> keine weiteren Retries, Quellen
    // scheitern schnell und der nächste Lauf holt nach.
    retryBudget: Math.floor(nonNegNum(env.HELMUT_GOOGLE_RETRY_BUDGET, 12)),
    // Breaker-Gedächtnis über Mandanten hinweg (Review-Fix): die Cron-Endpunkte
    // durchlaufen alle Mandate sequenziell im selben Prozess; hat der Breaker
    // gerade geöffnet, startet der nächste Mandanten-Lauf direkt offen, statt
    // die Drosselung erneut zu „entdecken" (Google drosselt pro Egress-IP).
    breakerMemoryMs: Math.floor(nonNegNum(env.HELMUT_GOOGLE_BREAKER_MEMORY_MS, 10 * 60 * 1000)),
    cooldownMs: Math.floor(posNum(env.HELMUT_GOOGLE_COOLDOWN_MS, 60 * 60 * 1000)),
    fullCrawlMinSpacingMs: Math.floor(posNum(env.HELMUT_FULL_CRAWL_MIN_SPACING_MS, 30 * 60 * 1000))
  };
}

// Provider-Klassifikation einer Crawler-Quelle: Google-News-basiert, sobald einer
// ihrer Abrufwege über news.google.* läuft. Alles andere gilt als "direkt"
// (direkte RSS-Feeds, HTML, amtliche Downloads) und wird NIE gebremst.
function isGoogleNewsSource(source = {}) {
  const urls = [source.rssUrl, source.url, ...(Array.isArray(source.rssUrls) ? source.rssUrls : [])];
  return urls.some((u) => String(u || "").includes("news.google."));
}

// Retry-After-Header (Sekunden ODER HTTP-Datum) -> Millisekunden. null = fehlt/
// unbrauchbar. Negativ wird auf 0 geklemmt; die Deckelung übernimmt der Aufrufer.
function parseRetryAfterMs(headerValue, nowMs = Date.now()) {
  const raw = String(headerValue ?? "").trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw) * 1000;
  const asDate = Date.parse(raw);
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - nowMs);
  return null;
}

// Wartezeit vor dem Retry-Versuch `attempt` (0-basiert): Retry-After hat Vorrang
// (gedeckelt), sonst exponentieller Backoff mit zufälliger Streuung (Half-Jitter:
// halbe Basis fest + halbe Basis zufällig — verhindert synchronisierte Wellen).
function computeRetryDelayMs(attempt, { retryAfterMs = null, baseMs = 1000, capMs = 8000, retryAfterCapMs = 15000, random = Math.random } = {}) {
  if (retryAfterMs != null && Number.isFinite(retryAfterMs)) {
    return Math.min(Math.max(0, retryAfterMs), retryAfterCapMs);
  }
  const exp = Math.min(capMs, baseMs * Math.pow(2, Math.max(0, attempt)));
  return Math.floor(exp / 2 + random() * (exp / 2));
}

// Ist ein Fehler retry-würdig? NUR explizite Drosselung (429), Serverfehler (5xx)
// und Verbindungsabbrüche. Timeouts NICHT (siehe Kopfkommentar), 4xx≠429 NICHT
// (dauerhaft), Parse-Fehler NICHT.
function isRetryableGoogleError(error) {
  if (!error) return false;
  const status = Number(error.statusCode);
  if (status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  const m = String(error.message || "").toLowerCase();
  if (/\b429\b/.test(m)) return true;
  if (/\b5\d\d\b/.test(m)) return true;
  if (m.includes("econnreset") || m.includes("econnrefused") || m.includes("socket hang up")) return true;
  return false;
}

// Zählt ein Fehlercode als Drosselungs-Signal für den Circuit Breaker?
function isBreakerRelevantError(error) {
  if (!error) return false;
  const status = Number(error.statusCode);
  if (status === 429 || (status >= 500 && status <= 599)) return true;
  const m = String(error.message || "").toLowerCase();
  return /\b429\b/.test(m) || /\b5\d\d\b/.test(m) || m.includes("timeout") || m.includes("timed out")
    || m.includes("econnreset") || m.includes("econnrefused");
}

// ── Das Gate: Semaphor + Mindestabstand + Circuit Breaker (pro Crawl-Lauf) ───
// createGoogleNewsGate(config, deps) -> { schedule(fn), report(error|null),
// isOpen(), state() }. schedule() wirft bei offenem Breaker SOFORT einen
// klassifizierbaren Fehler (message = CIRCUIT_OPEN_MESSAGE), ohne fn auszuführen.
function createGoogleNewsGate(config = {}, deps = {}) {
  const concurrency = Math.max(1, Math.floor(config.concurrency || 5));
  const minSpacingMs = Math.max(0, Math.floor(config.minSpacingMs || 0));
  const minObservations = Math.max(1, Math.floor(config.breakerMinObservations || 10));
  const failureRatio = config.breakerFailureRatio > 0 && config.breakerFailureRatio <= 1 ? config.breakerFailureRatio : 0.6;
  const now = deps.now || Date.now;
  const sleep = deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  let active = 0;
  const queue = [];
  let nextAllowedStart = 0;
  let spacingChain = Promise.resolve();

  let observed = 0;
  let breakerFailures = 0;
  // startOpen: Breaker-Gedächtnis — ein direkt zuvor (anderer Mandant, selber
  // Prozess) geöffneter Breaker lässt den neuen Lauf sofort fail-fast starten.
  let open = deps.startOpen === true;
  let openedAfter = open ? { reason: "breaker-memory" } : null;
  // Retry-Budget je Lauf: harte Obergrenze aller Backoff-Wiederholungen.
  let retryBudget = Number.isFinite(Number(config.retryBudget)) ? Math.max(0, Math.floor(config.retryBudget)) : 12;

  function acquire() {
    if (active < concurrency) { active += 1; return Promise.resolve(); }
    return new Promise((resolve) => queue.push(resolve)).then(() => { active += 1; });
  }
  function release() {
    active -= 1;
    const next = queue.shift();
    if (next) next();
  }

  // Serialisiert die Start-Reservierung: jeder Start liegt >= minSpacingMs nach
  // dem vorherigen (unabhängig von der Parallelität).
  function reserveStart() {
    const step = spacingChain.then(async () => {
      const waitMs = Math.max(0, nextAllowedStart - now());
      nextAllowedStart = now() + waitMs + minSpacingMs;
      if (waitMs > 0) await sleep(waitMs);
    });
    spacingChain = step.catch(() => {});
    return step;
  }

  function report(error) {
    observed += 1;
    if (error && isBreakerRelevantError(error)) breakerFailures += 1;
    if (!open && observed >= minObservations && breakerFailures / observed >= failureRatio) {
      open = true;
      openedAfter = { observed, breakerFailures };
    }
  }

  async function schedule(fn) {
    if (open) {
      const err = new Error(CIRCUIT_OPEN_MESSAGE);
      err.code = CIRCUIT_OPEN_MESSAGE;
      throw err;
    }
    await acquire();
    try {
      if (open) {
        // Breaker hat sich geöffnet, während dieser Task in der Warteschlange stand.
        const err = new Error(CIRCUIT_OPEN_MESSAGE);
        err.code = CIRCUIT_OPEN_MESSAGE;
        throw err;
      }
      if (minSpacingMs > 0) await reserveStart();
      return await fn();
    } finally {
      release();
    }
  }

  // Ein Retry aus dem Laufbudget entnehmen; false = Budget erschöpft.
  function consumeRetry() {
    if (retryBudget <= 0) return false;
    retryBudget -= 1;
    return true;
  }

  return {
    schedule,
    report,
    consumeRetry,
    isOpen: () => open,
    state: () => ({ open, observed, breakerFailures, openedAfter, retryBudgetLeft: retryBudget })
  };
}

// Retry-Hülle für einen Google-Abruf: bis zu retryMax Wiederholungen bei
// retry-würdigen Fehlern, mit Backoff/Jitter bzw. Retry-After. Bricht sofort ab,
// wenn der Breaker inzwischen offen ist. onRetry(attempt) meldet jeden echten
// Wiederholungsversuch (für die Telemetrie retry_count).
async function withGoogleRetry(fn, opts = {}) {
  const retryMax = Math.max(0, Math.floor(opts.retryMax ?? 2));
  const sleep = opts.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const isOpen = opts.isOpen || (() => false);
  const canRetry = opts.canRetry || (() => true);
  let lastError = null;
  for (let attempt = 0; attempt <= retryMax; attempt += 1) {
    // Breaker kann sich WÄHREND des Backoff-Schlafs geöffnet haben — dann den
    // nächsten Versuch gar nicht mehr starten (Review-Fix).
    if (attempt > 0 && isOpen()) throw lastError;
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      // Breaker-Fütterung auf VERSUCHS-Granularität (Review-Fix): jeder
      // fehlgeschlagene Google-Versuch wird sofort gemeldet, nicht erst das
      // Quellen-Endergebnis — der Breaker öffnet im Sturm in Sekunden statt
      // erst nach 10 vollständig ausgeretryten Quellen.
      if (typeof opts.onAttemptError === "function") opts.onAttemptError(error);
      if (attempt >= retryMax || !isRetryableGoogleError(error) || isOpen()) throw error;
      // Lauf-Retry-Budget (harte Obergrenze über alle Quellen) prüfen.
      if (!canRetry()) throw error;
      const delayMs = computeRetryDelayMs(attempt, {
        retryAfterMs: Number.isFinite(error && error.retryAfterMs) ? error.retryAfterMs : null,
        baseMs: opts.baseMs, capMs: opts.capMs, retryAfterCapMs: opts.retryAfterCapMs, random: opts.random
      });
      if (typeof opts.onRetry === "function") opts.onRetry(attempt + 1, delayMs);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

// ── Cooldown-Entscheidung vor einem Vollcrawl (rein, aus den letzten Läufen) ──
// Rückgabe: { active, skipGoogle, reason, sinceMs } —
//   * 'crawl-abstand'    : letzter Voll-Lauf DESSELBEN Mandats < fullCrawlMinSpacingMs
//                          her -> Google-Anteil KOMPLETT überspringen (Schutz vor
//                          eng aufeinanderfolgenden manuellen Vollcrawls; direkte/
//                          amtliche Quellen laufen normal weiter). Mandanten-bewusst,
//                          weil die Cron-Endpunkte seit der Mandantenneutralisierung
//                          ALLE aktiven Mandate sequenziell durchlaufen — ein
//                          globaler Abstands-Schutz würde dem zweiten Mandat sonst
//                          fälschlich dauerhaft den Google-Anteil streichen.
//   * 'nach-degradation' : letzter Voll-Lauf (MANDATSÜBERGREIFEND — die Google-
//                          Drosselung wirkt pro Egress-IP, nicht pro Mandat) stark
//                          degradiert/fehlgeschlagen und < cooldownMs her ->
//                          Google reduziert (nur Primär-Feed, keine URL-Auflösung).
// force=true (Betreiber-Override) deaktiviert beide Schutzmechanismen bewusst.
function evaluateCooldown({ lastRuns = [], nowMs = Date.now(), config = {}, force = false, tenantId = null } = {}) {
  if (force) return { active: false, skipGoogle: false, reason: "force-override" };
  const cfg = { cooldownMs: 60 * 60 * 1000, fullCrawlMinSpacingMs: 30 * 60 * 1000, ...config };
  const runs = (Array.isArray(lastRuns) ? lastRuns : []).filter((r) => r && r.createdAt && (r.mode === "full" || !r.mode));
  const ageOf = (r) => nowMs - new Date(r.createdAt).getTime();

  // Abstands-Schutz: nur Läufe desselben Mandats (Alt-Läufe ohne politicianId
  // stammen aus der Single-Tenant-Ära und zählen mit).
  const lastFullSameTenant = runs.find((r) => r.politicianId == null || tenantId == null || String(r.politicianId) === String(tenantId));
  if (lastFullSameTenant) {
    const age = ageOf(lastFullSameTenant);
    if (Number.isFinite(age) && age >= 0 && age < cfg.fullCrawlMinSpacingMs) {
      return { active: true, skipGoogle: true, reason: "crawl-abstand", sinceMs: age };
    }
  }

  // Degradations-Cooldown: jüngster Voll-Lauf egal welchen Mandats. Die
  // „stark"-Schwelle kommt aus DERSELBEN Quelle wie die Lauf-Klassifikation
  // (Review-Fix: kein zweiter, hart kodierter 0.5-Wert). Lazy-require, um den
  // Modulzyklus crawl-run-state -> google-news-hardening zu vermeiden.
  const heavyRatio = require("./crawl-run-state").runStateThresholds().starkAb;
  const lastFullAny = runs[0];
  if (lastFullAny) {
    const age = ageOf(lastFullAny);
    const checked = Number(lastFullAny.checkedSources || 0);
    const failed = Number(lastFullAny.failedSources || 0);
    const ratio = checked > 0 ? failed / checked : 0;
    const wasHeavilyDegraded = lastFullAny.runState === "stark-degradiert" || lastFullAny.runState === "fehlgeschlagen" || ratio > heavyRatio;
    if (wasHeavilyDegraded && Number.isFinite(age) && age >= 0 && age < cfg.cooldownMs) {
      return { active: true, skipGoogle: false, reason: "nach-degradation", sinceMs: age };
    }
  }
  return { active: false, skipGoogle: false, reason: null };
}

module.exports = {
  CIRCUIT_OPEN_MESSAGE,
  googleHardeningEnabled,
  googleHardeningConfig,
  isGoogleNewsSource,
  parseRetryAfterMs,
  computeRetryDelayMs,
  isRetryableGoogleError,
  isBreakerRelevantError,
  createGoogleNewsGate,
  withGoogleRetry,
  evaluateCooldown
};
