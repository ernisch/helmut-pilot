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
  "cooldown-reduziert",
  "lock-uebersprungen",
  "unbekannt"
];

function runStateThresholds(env = process.env) {
  const ratio = (raw, fallback) => {
    const n = Number(String(raw ?? "").trim());
    return Number.isFinite(n) && n > 0 && n < 1 ? n : fallback;
  };
  return {
    teilweiseAb: ratio(env.HELMUT_RUNSTATE_PARTIAL_RATIO, 0.1),
    starkAb: ratio(env.HELMUT_RUNSTATE_HEAVY_RATIO, 0.5)
  };
}

// Klassifiziert einen Lauf. Eingaben sind reine Zähler/Flags — keine Inhalte.
function classifyCrawlRunState({
  checkedSources = null,
  successfulSources = null,
  failedSources = null,
  skippedSources = 0,
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
  // Bezugsgröße: tatsächlich VERSUCHTE Abrufe (übersprungene zählen weder als
  // Erfolg noch als Fehler — sonst würde ein Cooldown-Lauf "gesünder" wirken).
  const attempted = Math.max(0, checked - Math.max(0, Number(skippedSources) || 0));
  if (attempted > 0 && ok === 0) return "fehlgeschlagen";
  const ratio = attempted > 0 ? failed / attempted : 0;
  if (ratio > t.starkAb) return "stark-degradiert";
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
    if (r.status === "skipped-cooldown") { bucket.skipped += 1; continue; }
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
