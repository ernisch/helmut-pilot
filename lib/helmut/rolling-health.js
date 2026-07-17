"use strict";

// Rollierende Crawl-Gesundheit (Sprint Google-News-Härtung, Phase 5).
// ============================================================================
// PROBLEM (Production-Beleg B1): Der Health-Report bewertete NUR den jüngsten
// Crawl (getLatestCrawlRun). Der stark degradierte 20:00-Lauf vom 2026-07-16
// (129/145 Quellen ausgefallen) blieb im 06:00-Report unsichtbar, weil der
// 04:00-Lauf davor wieder gesund war — eine schwere, selbst-erholte Störung
// zwischen zwei Reports verschwand aus dem Alarmpfad.
//
// LÖSUNG: Rollierende Betrachtung über die letzten Läufe (Standard: 24-h-Fenster,
// mindestens die letzten 3 Läufe) mit fünf ehrlichen Report-Zuständen:
//   aktuell-gesund                     : jüngster Lauf gesund, keine Störung im Fenster
//   gesund-mit-stoerung-im-zeitraum    : jüngster Lauf gesund, aber >=1 degradierter
//                                        Lauf im Fenster (transient, bleibt SICHTBAR)
//   aktuell-degradiert                 : jüngster Lauf degradiert (einmalig im Fenster)
//   wiederholt-degradiert              : >=2 degradierte Läufe im Fenster
//   unbekannt                          : keine (bewertbaren) Läufe
//
// ALARM-EMPFEHLUNG (dokumentiert, keine endgültige Produktentscheidung):
//   - aktuell-degradiert / wiederholt-degradiert -> 'alarm' (kippt report.ok)
//   - gesund-mit-stoerung-im-zeitraum            -> 'warnung' (sichtbar in Text +
//     Webhook-Payload, kippt ok NICHT — kein Fehlalarm für selbst-erholte Ausreißer)
// Reine Logik über bereits persistierte Lauf-Zähler; offline testbar.

const { classifyCrawlRunState, runStateThresholds } = require("./crawl-run-state");

const DEGRADED_STATES = new Set(["teilweise-degradiert", "stark-degradiert", "fehlgeschlagen"]);
const SEVERITY = {
  "gesund": 0,
  "cooldown-reduziert": 1,
  "unbekannt": 1,
  "teilweise-degradiert": 2,
  "stark-degradiert": 3,
  "fehlgeschlagen": 4
};

// Zustand eines (ggf. alten, vor der Härtung persistierten) Laufs bestimmen:
// vorhandenes runState-Feld gewinnt, sonst Ableitung aus den Zählern.
function stateOfRun(run, thresholds) {
  if (run && typeof run.runState === "string" && run.runState) return run.runState;
  return classifyCrawlRunState({
    checkedSources: run && run.checkedSources,
    successfulSources: run && run.successfulSources,
    failedSources: run && run.failedSources,
    skippedSources: run && run.skippedSources,
    cooldownActive: Boolean(run && run.cooldown && run.cooldown.active),
    thresholds
  });
}

function compactRun(run, state) {
  return {
    runId: run.runId || null,
    createdAt: run.createdAt || null,
    mode: run.mode || "full",
    state,
    checkedSources: Number(run.checkedSources || 0),
    failedSources: Number(run.failedSources || 0),
    successfulSources: Number(run.successfulSources || 0)
  };
}

function buildRollingCrawlHealth({ runs = [], nowMs = Date.now(), windowMs = 24 * 60 * 60 * 1000, lastN = 3, thresholds = null } = {}) {
  const t = thresholds || runStateThresholds();
  const ordered = (Array.isArray(runs) ? runs : [])
    .filter((r) => r && r.createdAt)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Betrachtungsmenge: NUR Läufe im Zeitfenster (Review-Fix). Ein Fallback auf
  // „letzte N Läufe" würde >24h-alte Störungen wieder hereinziehen und als
  // „im 24h-Fenster" etikettieren — Störungen dürfen nach Ablauf des Fensters
  // ehrlich altern (forensisch bleiben sie in crawlRuns/Telemetrie sichtbar).
  // Leeres Fenster (kein Crawl seit 24h) => 'unbekannt'; die Überfälligkeit
  // alarmiert parallel der Cron-Check (overdueCrons).
  const scope = ordered.filter((r) => {
    const age = nowMs - new Date(r.createdAt).getTime();
    return Number.isFinite(age) && age >= 0 && age <= windowMs;
  });

  if (!scope.length) {
    return {
      status: "unbekannt", alertLevel: "warnung", latestState: "unbekannt",
      windowRuns: 0, degradedRuns: 0, stronglyDegradedRuns: 0,
      worstRun: null, recovered: false, runs: []
    };
  }

  const evaluated = scope.map((r) => compactRun(r, stateOfRun(r, t)));
  const latest = evaluated[0];
  const degraded = evaluated.filter((r) => DEGRADED_STATES.has(r.state));
  const stronglyDegraded = evaluated.filter((r) => r.state === "stark-degradiert" || r.state === "fehlgeschlagen");
  const worstRun = evaluated.reduce((worst, r) =>
    (!worst || (SEVERITY[r.state] || 0) > (SEVERITY[worst.state] || 0) ? r : worst), null);

  let status;
  const latestDegraded = DEGRADED_STATES.has(latest.state);
  if (latestDegraded) {
    status = degraded.length >= 2 ? "wiederholt-degradiert" : "aktuell-degradiert";
  } else if (degraded.length >= 2) {
    status = "wiederholt-degradiert";
  } else if (degraded.length === 1) {
    status = "gesund-mit-stoerung-im-zeitraum";
  } else {
    status = "aktuell-gesund";
  }

  const alertLevel = (status === "aktuell-degradiert" || status === "wiederholt-degradiert")
    ? "alarm"
    : (status === "gesund-mit-stoerung-im-zeitraum" ? "warnung" : "ok");

  return {
    status,
    alertLevel,
    latestState: latest.state,
    windowRuns: evaluated.length,
    degradedRuns: degraded.length,
    stronglyDegradedRuns: stronglyDegraded.length,
    worstRun,
    // Erholung sichtbar machen: schwerste Störung im Fenster + jüngster Lauf gesund.
    recovered: Boolean(worstRun && stronglyDegraded.length > 0 && latest.state === "gesund"),
    runs: evaluated.slice(0, Math.max(lastN, 3))
  };
}

module.exports = { buildRollingCrawlHealth, stateOfRun, DEGRADED_STATES };
