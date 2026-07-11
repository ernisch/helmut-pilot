"use strict";

// Tests fuer die Watchdog-Auswertung (scripts/watchdog-eval.js). KEIN Netz, KEINE KI.
// Prueft, dass ein erfolgreicher V3-Pipeline-Lauf OHNE briefing.generatedAt als Erfolg
// gilt, echte Fehler (Pipeline/Understanding/HTTP) aber weiterhin erkannt werden.

const { evaluatePipelineResponse } = require("./watchdog-eval");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// Echte Erfolgsform der Pipeline (runSourceCrawl -> saveCrawlRun): KEIN briefing.generatedAt.
const successResponse = {
  mode: "full", politicianId: "u-1",
  checkedSources: 42, successfulSources: 40, failedSources: 2,
  newCandidateItems: 12, savedItems: 8,
  understanding: { processed: 8, deferred: 3, reason: null },
  matching: { candidates: 15, saved: 15 },
  decisions: { candidates: 15, saved: 15 },
  errors: [{ sourceName: "X", error: "timeout" }],
  createdAt: "2026-07-11T05:05:00Z",
  savedItemsList: []
};

// 1) Pipeline-Erfolg OHNE briefing.generatedAt wird als Erfolg gewertet.
const r1 = evaluatePipelineResponse(successResponse);
check("1) Erfolgreicher Pipeline-Lauf ohne briefing.generatedAt -> OK", r1.ok === true, r1.reason);
check("1b) Erfolg auch wenn EINZELNE Quellen fehlschlugen (failedSources>0), solange erfolgreiche Quellen existieren",
  evaluatePipelineResponse({ ...successResponse, failedSources: 20, successfulSources: 22 }).ok === true);

// 2) Pipeline-Fehler wird weiterhin als Fehler gewertet.
check("2a) ok:false (Endpoint-Catch) -> Fehler",
  evaluatePipelineResponse({ ok: false, bounded: true, reason: "pipeline-timeout", error: "boom" }).ok === false);
check("2b) reason enthaelt 'timeout' -> Fehler",
  evaluatePipelineResponse({ reason: "pipeline-timeout" }).ok === false);
check("2c) error-Feld gesetzt -> Fehler",
  evaluatePipelineResponse({ error: "irgendwas kaputt", successfulSources: 5 }).ok === false);
check("2d) keine erfolgreiche Quelle (successfulSources=0) -> Fehler",
  evaluatePipelineResponse({ ...successResponse, successfulSources: 0, failedSources: 42 }).ok === false);

// 3) Understanding-Fehler werden weiterhin erkannt.
check("3a) understanding.reason='eager-error' -> Fehler",
  evaluatePipelineResponse({ ...successResponse, understanding: { processed: 0, deferred: 0, reason: "eager-error" } }).ok === false);
check("3b) benigne understanding.reason (z. B. 'budget') -> KEIN Fehler",
  evaluatePipelineResponse({ ...successResponse, understanding: { processed: 2, deferred: 5, reason: "budget" } }).ok === true);
check("3c) understanding.reason=null (sauberer Lauf) -> OK",
  evaluatePipelineResponse({ ...successResponse, understanding: { processed: 3, deferred: 0, reason: null } }).ok === true);

// 4) HTTP-/JSON-Fehler-Ebene: kein/kaputtes Objekt -> Fehler (der Workflow prueft HTTP 200
//    zusaetzlich davor; hier wird die Body-Ebene abgesichert).
check("4a) Nicht-Objekt (null) -> Fehler", evaluatePipelineResponse(null).ok === false);
check("4b) Array statt Objekt -> Fehler", evaluatePipelineResponse([1, 2, 3]).ok === false);
check("4c) String statt Objekt -> Fehler", evaluatePipelineResponse("nope").ok === false);

// 5) Lock 'already running' ist KEIN Fehler (paralleler Lauf arbeitet).
const rLock = evaluatePipelineResponse({ skipped: true, reason: "already running" });
check("5) skipped/already-running -> OK (kein Fehler), als note markiert", rLock.ok === true && rLock.note === true);

// 6) Bewusst NICHT geprueft: Briefing-Frische (separater Endpoint) — ein Lauf ohne
//    generatedAt ist kein Frische-Signal, darf aber auch kein Fehler sein.
check("6) minimaler Erfolgs-Body (nur Zaehler, kein Briefing-Feld) -> OK",
  evaluatePipelineResponse({ successfulSources: 1, understanding: {} }).ok === true);

console.log(`\n${passed}/${passed + failed} Watchdog-Eval-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
