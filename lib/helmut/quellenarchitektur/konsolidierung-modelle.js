"use strict";

// Helmut — Quellenplattform-Konsolidierung · Verbindliche Einzelmodelle.
// =============================================================================================
// VERBINDLICHE ZIELARCHITEKTUR (Auftrag Phase 3, Punkte 7+8):
//   * Es darf nur EIN Gesundheitsmodell geben.
//   * Es darf nur EIN Qualitaetsmodell geben.
//
// Ausgangslage: die drei Sprints haben drei parallele Vokabulare gebaut:
//   Gesundheit  — main-FSM (6 Zustaende, Schwellen 3/6)  ·  Sprint 2 (8 Akutzustaende, Serie 5)
//                 ·  Sprint 3 (4 Aggregatzustaende, nutzt bereits die main-Schwellen).
//   Qualitaet   — main-Watchdog (kategoriales Urteil)     ·  Sprint 2 (Skalar 0..1 ueber 8 Achsen).
//
// KONSOLIDIERUNG (rein additiv, dormant, KEINE Live-Datei geaendert):
//   Gesundheit  -> verbindlich ist das LIVE-Modell quellenarchitektur/model.js
//                  (nextPathStatus, PATH_STATUS, DEGRADE_THRESHOLD=3 / BROKEN_THRESHOLD=6).
//                  Die Sprint-2/3-Vokabulare werden ueber TOTALE Abbildungen in das kanonische
//                  Vokabular ueberfuehrt; die EINE Eskalationswahrheit sind die main-Schwellen.
//   Qualitaet   -> verbindlich ist das LIVE-Modell quellenarchitektur/quality-watchdog.js
//                  (kategoriales Urteil: technicalHealth/productValue). Der Sprint-2-Skalar ist
//                  NUR eine UNTERGEORDNETE Ranking-Schicht und speist seine Stabilitaetsachse
//                  aus der EINEN kanonischen Gesundheit — er ist nie eigene Qualitaetswahrheit.
//
// Reine Logik. KEINE KI, kein Netz, kein Storage. Alle Zeit/Beobachtungen werden injiziert.

const model = require("./model");                            // kanonisches Gesundheitsmodell (LIVE)
const watchdog = require("./quality-watchdog");              // kanonisches Qualitaetsmodell (LIVE)
const s2health = require("../quellenbibliothek/health-engine");
const s2quality = require("../quellenbibliothek/quality");
const s3health = require("./master/health");

// ============================================================================================
// EIN GESUNDHEITSMODELL
// ============================================================================================

// Das EINE verbindliche Zustandsvokabular (aus dem Live-Modell, nicht neu deklariert).
const CANONICAL_HEALTH_STATES = Object.freeze([...model.PATH_STATUS]);
// Die EINE Eskalationswahrheit: die Schwellen des Live-Modells (nicht die Sprint-2-Schwelle 5).
const HEALTH_THRESHOLDS = Object.freeze({ degrade: model.DEGRADE_THRESHOLD, broken: model.BROKEN_THRESHOLD });
const HEALTH_MODEL_SOURCE = "quellenarchitektur/model.js";

// Die EINE verbindliche Zustandsuebergangsfunktion — reine Delegation, kein Parallelmodell.
function nextHealthStatus(current, event) {
  return model.nextPathStatus(current, event);
}

// Totale Abbildung des Sprint-2-Akutvokabulars (health-engine, 8 Zustaende) -> kanonisch.
// "slow" bleibt gesund (Latenz ist eine Qualitaetsachse, kein Defekt); administrative Zustaende
// (disabled) werden zu 'paused'; ein nie geprueter/Parser-Fehler-Zustand ist 'needs_review'.
const S2_ACUTE_TO_CANONICAL = Object.freeze({
  reachable: "healthy",
  slow: "healthy",
  rate_limited: "degraded",
  http_error: "degraded",
  parser_error: "needs_review",
  broken: "broken",
  disabled: "paused",
  never_checked: "needs_review"
});
function acuteToCanonicalHealth(acuteState) {
  return S2_ACUTE_TO_CANONICAL[String(acuteState || "")] || "needs_review";
}

// Totale Abbildung des Sprint-3-Aggregatvokabulars (health.healthFromStreak) -> kanonisch.
const S3_TO_CANONICAL = Object.freeze({
  unknown: "needs_review", healthy: "healthy", degraded: "degraded", broken: "broken"
});
function catalogHealthToCanonical(s3State) {
  return S3_TO_CANONICAL[String(s3State || "")] || "needs_review";
}

// Kern der Konsolidierung: ein akuter (bereits abgebildeter) Zustand + Erfolgs-Flag + Fehlerserie
// -> genau EIN kanonischer Status ueber die kanonischen Schwellen. Ergebnis liegt IMMER in
// CANONICAL_HEALTH_STATES.
function canonicalizeHealth({ acuteState, ok = false, errorStreak = 0 } = {}) {
  const mapped = acuteToCanonicalHealth(acuteState);
  if (mapped === "paused" || mapped === "archived") return mapped; // administrativ dominiert die Serie
  if (ok) return mapped;                                            // Erfolg: reachable/slow -> healthy
  const streak = Number(errorStreak) || 0;
  if (streak >= HEALTH_THRESHOLDS.broken) return "broken";
  if (streak >= HEALTH_THRESHOLDS.degrade) return "degraded";
  return mapped;                                                    // Einzelfehler unterhalb der Serie
}

// Die EINE konsolidierte Gesundheitsberechnung aus einer Beobachtungsserie:
//   1. Sprint-2-Klassifikator liefert Akutzustand + Fehlerserie (Wiederverwendung, kein Neubau).
//   2. Eskalation ausschliesslich ueber die kanonischen Schwellen (3/6).
// Rueckgabe ist ein kanonischer Status (nie das Sprint-2-Vokabular).
function healthFromObservations(observations = [], opts = {}) {
  const obs = Array.isArray(observations) ? observations : [];
  const folded = s2health.foldObservations(obs, opts);            // korrekte errorStreak-Fuehrung
  const last = obs.length ? s2health.classifyObservation(obs[obs.length - 1]) : { state: "never_checked", ok: false };
  return canonicalizeHealth({ acuteState: last.state, ok: last.ok, errorStreak: folded.errorStreak });
}

// Regressionsgarant: bestaetigt, dass das Sprint-3-Aggregat bereits die kanonischen Schwellen nutzt.
function catalogHealthUsesCanonicalThresholds() {
  return s3health.healthFromStreak(HEALTH_THRESHOLDS.broken, 0, 10) === "broken"
    && s3health.healthFromStreak(HEALTH_THRESHOLDS.degrade, 0, 10) === "degraded";
}

// ============================================================================================
// EIN QUALITAETSMODELL
// ============================================================================================

// Die verbindliche Qualitaetswahrheit ist KATEGORIAL und stammt aus dem Live-Watchdog.
const QUALITY_VERDICT_SOURCE = "quellenarchitektur/quality-watchdog.js";
// Der Sprint-2-Skalar bleibt als UNTERGEORDNETE Ranking-Schicht bestehen (nie autoritativ).
const RANKING_AXES = Object.freeze([...s2quality.AXES]);
const RANKING_WEIGHTS = Object.freeze({ ...s2quality.DEFAULT_WEIGHTS });

// Kanonisches, kategoriales Qualitaetsurteil je Abrufweg (technicalHealth/productValue) —
// reine Delegation an den Watchdog. Dies ist die EINE Qualitaetswahrheit.
function sourceQualityVerdict(input = {}) {
  const now = input.now != null ? input.now : 0;
  const sourceMetrics = watchdog.computeSourceMetrics({
    rawDocs: input.rawDocs || [], koSourceLinks: input.koSourceLinks || [],
    dedupDocuments: input.dedupDocuments || [], findings: input.findings || [], now
  });
  const verdicts = watchdog.assessRetrievalPaths({
    paths: input.paths || [], sourceMetrics, activePathIds: input.activePathIds || [],
    now, thresholds: input.thresholds || {}
  });
  return { source: QUALITY_VERDICT_SOURCE, sourceMetrics, verdicts };
}

// Kanonische Gesundheit -> Stabilitaets-Eingang, den der Sprint-2-Skalar versteht. Damit zieht der
// untergeordnete Ranking-Score seine Stabilitaetsachse aus der EINEN kanonischen Gesundheit.
const CANONICAL_TO_S2_STABILITY = Object.freeze({
  healthy: "reachable", degraded: "rate_limited", broken: "broken",
  needs_review: "parser_error", paused: "disabled", archived: "disabled"
});
function canonicalToStabilityState(canonicalState) {
  return CANONICAL_TO_S2_STABILITY[String(canonicalState || "")] || "never_checked";
}

// UNTERGEORDNETER Ranking-Score (0..1): der Sprint-2-Skalar. Wird ein kanonischer Gesundheitsstatus
// uebergeben, speist er verbindlich die Stabilitaetsachse — der Skalar hat KEINE eigene
// Gesundheits-/Qualitaetswahrheit, er ordnet nur Quellen relativ.
function rankingScore(descriptor, metrics = {}, opts = {}) {
  let desc = descriptor;
  if (opts.canonicalHealthState) {
    const prevHealth = (descriptor && descriptor.health) || {};
    desc = {
      ...descriptor,
      health: {
        state: canonicalToStabilityState(opts.canonicalHealthState),
        errorStreak: opts.errorStreak != null ? opts.errorStreak : (prevHealth.errorStreak || 0),
        lastLatencyMs: prevHealth.lastLatencyMs
      }
    };
  }
  const scored = s2quality.scoreSourceQuality(desc, metrics, opts);
  return { ...scored, subordinateTo: QUALITY_VERDICT_SOURCE, isAuthoritative: false };
}

module.exports = {
  // Gesundheit — EIN Modell
  HEALTH_MODEL_SOURCE, CANONICAL_HEALTH_STATES, HEALTH_THRESHOLDS,
  nextHealthStatus, acuteToCanonicalHealth, catalogHealthToCanonical,
  canonicalizeHealth, healthFromObservations, catalogHealthUsesCanonicalThresholds,
  S2_ACUTE_TO_CANONICAL, S3_TO_CANONICAL,
  // Qualitaet — EIN Modell
  QUALITY_VERDICT_SOURCE, RANKING_AXES, RANKING_WEIGHTS,
  sourceQualityVerdict, canonicalToStabilityState, rankingScore
};
