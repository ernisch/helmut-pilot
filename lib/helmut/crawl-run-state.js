"use strict";

// Ehrliche Zustände pro Crawl-Lauf (Sprint Google-News-Härtung, Phase 4).
// ============================================================================
// Jeder Crawl-Lauf wird eindeutig klassifiziert — statt des bisherigen impliziten
// "erfolgreich, solange kein Absturz". Die SCHWELLEN sind eine dokumentierte
// EMPFEHLUNG (Env-überschreibbar), keine endgültige Produktentscheidung
// (docs/betrieb/google_news_haertung.md):
//   gesund               : Fehlerquote <= 10 % (deckt sich mit dem bestehenden
//                          Watchdog-Default HELMUT_MAX_CRAWL_FAILURE_RATIO=0.1)
//   teilweise-degradiert : Fehlerquote > 10 % und <= 50 %
//   stark-degradiert     : Fehlerquote > 50 % (der B1-Lauf lag bei 89 %)
//   fehlgeschlagen       : 0 erfolgreiche Quellen bei > 0 geprüften, oder Absturz
//   cooldown-reduziert   : Lauf lief bewusst mit reduziertem/übersprungenem
//                          Google-Anteil (Cooldown/Crawl-Abstands-Schutz)
//   lock-uebersprungen   : Lauf wurde wegen gehaltenem Pipeline-Lock nicht gestartet
//   unbekannt            : Zähler fehlen/unbrauchbar (ehrlich statt geraten)
// Reihenfolge der Prüfung = Prioritätsordnung (ein Lauf hat genau EINEN Zustand).
// Reine Logik, offline testbar; die Fehlercode-Klassifikation nutzt denselben
// inhaltsfreien Klassifikator wie die Quellen-Telemetrie.

const { classifyCrawlError } = require("./source-telemetry");
const { isGoogleNewsSource } = require("./google-news-hardening");

const RUN_STATES = [
  "gesund",
  "teilweise-degradiert",
  "stark-degradiert",
  "fehlgeschlagen",
  "aggregator-gedrosselt",
  "cooldown-reduziert",
  "lock-uebersprungen",
  "unbekannt"
];

function runStateThresholds(env = process.env) {
  const ratio = (raw, fallback) => {
    const n = Number(String(raw ?? "").trim());
    return Number.isFinite(n) && n > 0 && n < 1 ? n : fallback;
  };
  const count = (raw, fallback) => {
    // Nicht gesetzt/leer -> Default. (Number("") === 0 wuerde den Default sonst
    // stillschweigend auf 0 kippen und die Schwelle unwirksam machen.)
    const s = String(raw ?? "").trim();
    if (s === "") return fallback;
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
  };
  return {
    teilweiseAb: ratio(env.HELMUT_RUNSTATE_PARTIAL_RATIO, 0.1),
    starkAb: ratio(env.HELMUT_RUNSTATE_HEAVY_RATIO, 0.5),
    // Mindestzahl tatsächlich VERSUCHTER Wege, ab der eine Fehlerquote als
    // aussagekräftig gilt. Greift NUR bei bewusst reduzierten Läufen (skipped > 0):
    // aus 2 von 144 versuchten Wegen darf keine Lauf-Bewertung extrapoliert werden
    // (Incident 2026-07-25 — der Restanteil eines reduzierten Laufs ist winzig).
    minAttempted: count(env.HELMUT_RUNSTATE_MIN_ATTEMPTED, 10)
  };
}

// Klassifiziert einen Lauf. Eingaben sind reine Zähler/Flags — keine Inhalte.
function classifyCrawlRunState({
  checkedSources = null,
  successfulSources = null,
  failedSources = null,
  skippedSources = 0,
  circuitOpenSources = 0,
  lockSkipped = false,
  crashed = false,
  cooldownActive = false,
  thresholds = null
} = {}) {
  const t = thresholds || runStateThresholds();
  if (lockSkipped) return "lock-uebersprungen";
  if (crashed) return "fehlgeschlagen";
  const checked = Number(checkedSources);
  const ok = Number(successfulSources);
  const failed = Number(failedSources);
  if (!Number.isFinite(checked) || !Number.isFinite(ok) || !Number.isFinite(failed) || checked <= 0) {
    return "unbekannt";
  }
  const skipped = Math.max(0, Number(skippedSources) || 0);
  const circuitOpen = Math.max(0, Number(circuitOpenSources) || 0);
  // Bezugsgröße: tatsächlich VERSUCHTE Abrufe. Übersprungene (Cooldown/geteilter
  // Weg) UND vom Circuit Breaker beendete Wege zählen nicht — beide fanden nie
  // statt. Ein zentraler Breaker-Abbruch ist EIN Ereignis, nicht N Quellenfehler
  // (Incident 2026-07-25: 130 'circuit-open' erzeugten die Meldung "141/144 Fehler").
  const attempted = Math.max(0, checked - skipped - circuitOpen);
  if (attempted > 0 && ok === 0 && circuitOpen === 0) return "fehlgeschlagen";
  const ratio = attempted > 0 ? failed / attempted : 0;
  // Zentrale Aggregator-Drosselung: der Breaker hat gegriffen (fail-fast statt
  // Hämmern). Eigener, klar benannter Zustand — sichtbar und alarmierend, aber
  // NICHT als Defekt von N Einzelquellen dargestellt.
  if (circuitOpen > 0) return "aggregator-gedrosselt";
  if (ratio > t.starkAb && !(skipped > 0 && attempted < t.minAttempted)) return "stark-degradiert";
  // Bewusst reduzierter Lauf: aus dem winzigen Restanteil darf keine
  // Lauf-Degradation extrapoliert werden.
  if (skipped > 0 && attempted < t.minAttempted) return "cooldown-reduziert";
  if (cooldownActive) return "cooldown-reduziert";
  if (ratio > t.teilweiseAb) return "teilweise-degradiert";
  return "gesund";
}

// Provider-Trennung der Lauf-Ergebnisse: Google-News vs. direkte Quellen, je mit
// Fehlercode-Aufschlüsselung und Retry-Summe. Nur Zähler, keine Inhalte/URLs.
function buildProviderBreakdown(results = [], sourcesById = {}) {
  const empty = () => ({ checked: 0, ok: 0, failed: 0, skipped: 0, http429: 0, timeout: 0, circuitOpen: 0, otherErrors: 0, retries: 0 });
  const out = { googleNews: empty(), direct: empty() };
  for (const r of Array.isArray(results) ? results : []) {
    if (!r) continue;
    const src = sourcesById[r.sourceId] || {};
    const bucket = isGoogleNewsSource(src) ? out.googleNews : out.direct;
    bucket.checked += 1;
    bucket.retries += Number(r.retryCount || 0);
    if (r.status === "skipped-cooldown" || r.status === "skipped-shared") { bucket.skipped += 1; continue; }
    // Vom Breaker beendet: nie abgerufen -> eigener Zähler, NICHT 'failed'
    // (sonst wird ein zentraler Abbruch als N Quellenfehler gemeldet).
    if (r.status === "circuit-open") { bucket.circuitOpen += 1; continue; }
    if (r.ok) { bucket.ok += 1; continue; }
    bucket.failed += 1;
    const code = classifyCrawlError(r.error);
    if (code === "http-429") bucket.http429 += 1;
    else if (code === "timeout") bucket.timeout += 1;
    else if (code === "circuit-open") bucket.circuitOpen += 1;
    else bucket.otherErrors += 1;
  }
  return out;
}

// Kompakte Fehlercode-Summen eines Laufs (für crawlRun-Persistenz/Reports).
function summarizeErrorCodes(results = []) {
  const codes = {};
  for (const r of Array.isArray(results) ? results : []) {
    if (!r || r.ok) continue;
    const code = classifyCrawlError(r.error) || "unknown";
    codes[code] = (codes[code] || 0) + 1;
  }
  return codes;
}

module.exports = { RUN_STATES, runStateThresholds, classifyCrawlRunState, buildProviderBreakdown, summarizeErrorCodes };
