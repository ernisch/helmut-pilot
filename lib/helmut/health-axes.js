"use strict";

// P1-6 — Health-Report-Achsen: KI-Budget, Leerlauf ("Erfolg ohne Arbeit"),
// Quellenfrische, Klassifikationsabdeckung.
// ============================================================================
// Reine, testbare Bewertungsfunktionen (kein I/O). buildHealthReport ruft sie mit
// bereits geladenen Kennzahlen auf. Nur technische Skalare — kein Inhalt/PII.
//
// Verbindlich (Audit §9-5/-7): Der Health-Report muss ALARMIEREN (ok=false), wenn
//   (a) das KI-Budget erschöpft ist (remaining <= 0), ODER
//   (b) ein Leerlauf vorliegt: es kamen neue Dokumente an, aber KEIN Vorgang wurde
//       verstanden UND das Budget hat Arbeit übersprungen (stiller Erfolg ohne Arbeit).
// Quellenfrische und Klassifikationsabdeckung sind WARN-Signale (informativ,
// kippen ok nicht — die Abdeckung steigt erst mit dem freigabepflichtigen Backfill).

// KI-Budget-Achse aus getLlmUsageBreakdownToday().
function budgetAxis(breakdown = {}) {
  const limit = Number.isFinite(breakdown.limit) ? breakdown.limit : null;
  const calls = Number(breakdown.calls || 0);
  const skips = Number(breakdown.skips || 0);
  const remaining = limit == null ? null : Math.max(0, limit - calls);
  const exhausted = limit != null && remaining <= 0;
  const skipRate = (calls + skips) > 0 ? Math.round((skips / (calls + skips)) * 1000) / 1000 : 0;
  return {
    limit, calls, skips, remaining, exhausted, skipRate,
    status: exhausted ? "erschoepft" : (limit != null && remaining <= Math.max(1, Math.floor(limit * 0.1)) ? "knapp" : "ok")
  };
}

// Leerlauf-Achse ("Erfolg ohne Arbeit"). analyzed = verstandene Vorgänge des
// jüngsten Crawls (eager). newRawDocuments = ECHTE neue relationale Dokumente.
function idleAxis({ analyzed = null, newRawDocuments = null, skips = 0 } = {}) {
  const a = Number(analyzed || 0);
  const fresh = newRawDocuments == null ? null : Number(newRawDocuments);
  // Nur alarmieren, wenn WIRKLICH Arbeit anlag (neue Dokumente) und trotzdem 0
  // verstanden wurde UND das Budget Arbeit übersprungen hat — sonst ist processed=0
  // ein legitimer ruhiger Tag (kein Fehlalarm).
  const idle = a === 0 && fresh != null && fresh > 0 && Number(skips || 0) > 0;
  return { analyzed: a, newRawDocuments: fresh, idle, status: idle ? "leerlauf" : "ok" };
}

// Klassifikationsabdeckung (WARN-only). getClassificationCoverage() -> Anteil KOs
// mit politischer Ebene. Schwelle default 0.6.
//
// SPRINT 19 — Massstab korrigiert: bewertet wird die ERMITTELTE Ebene
// (establishedLevelCoverage), nicht das blosse Vorhandensein einer Spalte.
// `decision_level` ist seit Sprint 2 nie null (im Zweifel 'unknown'), die alte
// Kennzahl war deshalb strukturell ~1.0 und konnte nie warnen — falsches Gruen.
// `levelCoverage` bleibt additiv erhalten (Rueckwaertskompatibilitaet); fehlt die
// neue Kennzahl (Alt-Aufrufer/Alt-Daten), wird wie bisher bewertet.
function coverageAxis(coverage = null, warnBelow = 0.6) {
  if (!coverage || coverage.levelCoverage == null) {
    return { available: false, levelCoverage: null, status: "unbekannt", warn: false };
  }
  const massgeblich = coverage.establishedLevelCoverage != null
    ? Number(coverage.establishedLevelCoverage)
    : Number(coverage.levelCoverage);
  return {
    available: true,
    total: coverage.total,
    withLevel: coverage.withLevel,
    withEstablishedLevel: coverage.withEstablishedLevel != null ? coverage.withEstablishedLevel : null,
    missingLevel: coverage.missingLevel,
    unknownLevel: coverage.unknownLevel != null ? coverage.unknownLevel : null,
    levelCoverage: Number(coverage.levelCoverage),
    establishedLevelCoverage: coverage.establishedLevelCoverage != null ? Number(coverage.establishedLevelCoverage) : null,
    embeddingCoverage: coverage.embeddingCoverage,
    status: massgeblich >= warnBelow ? "ok" : "niedrig",
    warn: massgeblich < warnBelow
  };
}

// Quellenfrische-Achse (WARN-only). Aggregat aus dem jüngsten Crawl; per-Quelle-
// Detail kommt mit aktivierter source_crawl_telemetry (P0-1).
function sourceFreshnessAxis({ crawlAgeMs = null, checked = 0, failed = 0, maxAgeMs = 28 * 3600000, maxFailureRatio = 0.5 } = {}) {
  const failureRatio = checked > 0 ? failed / checked : (checked === 0 ? 1 : 0);
  const stale = crawlAgeMs == null || crawlAgeMs > maxAgeMs;
  const highFailure = failureRatio > maxFailureRatio;
  return {
    crawlAgeMs, checked, failed, failureRatio: Math.round(failureRatio * 1000) / 1000,
    status: (stale || highFailure) ? "warn" : "ok",
    warn: stale || highFailure
  };
}

// Kombiniert die Achsen: liefert die HARTEN ok-Flip-Gründe (Budget/Leerlauf) und
// die WARN-Signale (Frische/Abdeckung).
function combineHealthAxes({ budget, idle, coverage, freshness }) {
  const blockers = [];
  if (budget && budget.exhausted) blockers.push("budget-erschoepft");
  if (idle && idle.idle) blockers.push("leerlauf");
  const warnings = [];
  if (coverage && coverage.warn) warnings.push("klassifikationsabdeckung-niedrig");
  if (freshness && freshness.warn) warnings.push("quellenfrische");
  return { ok: blockers.length === 0, blockers, warnings };
}

module.exports = { budgetAxis, idleAxis, coverageAxis, sourceFreshnessAxis, combineHealthAxes };
