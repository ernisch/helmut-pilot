"use strict";

// P1-6 — Health-Report-Achsen: KI-Budget, Leerlauf, Quellenfrische, Abdeckung.
//
// Belegt:
//  * Budget-Achse: Calls/Limit/Rest/Skips; erschöpft bei remaining<=0.
//  * Leerlauf-Achse: neue Dokumente + 0 verstanden + Budget-Skips -> idle;
//    ruhiger Tag (0 neue Dokumente) -> KEIN Fehlalarm.
//  * combine: Budget-Erschöpfung ODER Leerlauf kippen ok=false; Abdeckung/
//    Frische sind WARN-only (kippen ok NICHT).
//  * Abdeckungs-Achse: niedrige Abdeckung -> warn.
//
// KEIN Netz/DB. Nur synthetische Zähler.

const { budgetAxis, idleAxis, coverageAxis, sourceFreshnessAxis, combineHealthAxes } = require("../lib/helmut/health-axes");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// ── Budget-Achse ───────────────────────────────────────────────────────────
const bOk = budgetAxis({ limit: 100, calls: 40, skips: 5 });
check("Budget: Rest korrekt (100-40=60)", bOk.remaining === 60);
check("Budget: nicht erschöpft", bOk.exhausted === false && bOk.status === "ok");
const bExhausted = budgetAxis({ limit: 100, calls: 100, skips: 300 });
check("Budget: erschöpft bei remaining<=0", bExhausted.exhausted === true && bExhausted.remaining === 0);
check("Budget: skipRate berechnet", bExhausted.skipRate === Math.round((300 / 400) * 1000) / 1000);
const bTight = budgetAxis({ limit: 100, calls: 95, skips: 0 });
check("Budget: knapp (<=10% Rest)", bTight.status === "knapp");
const bNoLimit = budgetAxis({ limit: null, calls: 20, skips: 2 });
check("Budget: kein Limit -> remaining null, nicht erschöpft", bNoLimit.remaining === null && bNoLimit.exhausted === false);

// ── Leerlauf-Achse ──────────────────────────────────────────────────────────
const idleYes = idleAxis({ analyzed: 0, newRawDocuments: 12, skips: 40 });
check("Leerlauf: neue Docs + 0 verstanden + Skips -> idle", idleYes.idle === true);
const idleQuietDay = idleAxis({ analyzed: 0, newRawDocuments: 0, skips: 0 });
check("Leerlauf: ruhiger Tag (0 neue Docs) -> KEIN Fehlalarm", idleQuietDay.idle === false);
const idleWorking = idleAxis({ analyzed: 7, newRawDocuments: 12, skips: 5 });
check("Leerlauf: verstanden>0 -> kein idle", idleWorking.idle === false);
const idleNoBudgetPressure = idleAxis({ analyzed: 0, newRawDocuments: 12, skips: 0 });
check("Leerlauf: neue Docs, 0 verstanden, aber KEINE Skips -> kein Fehlalarm", idleNoBudgetPressure.idle === false);

// ── Abdeckungs-Achse ────────────────────────────────────────────────────────
const covLow = coverageAxis({ total: 314, withLevel: 67, levelCoverage: 0.213, embeddingCoverage: 0.213, missingLevel: 247 });
check("Abdeckung: 21% -> niedrig/warn", covLow.status === "niedrig" && covLow.warn === true);
const covOk = coverageAxis({ total: 314, withLevel: 300, levelCoverage: 0.955, missingLevel: 14 });
check("Abdeckung: 95% -> ok, kein warn", covOk.status === "ok" && covOk.warn === false);
const covNA = coverageAxis(null);
check("Abdeckung: unbekannt -> nicht available, kein warn", covNA.available === false && covNA.warn === false);

// ── Quellenfrische-Achse ────────────────────────────────────────────────────
const freshOk = sourceFreshnessAxis({ crawlAgeMs: 2 * 3600000, checked: 145, failed: 2 });
check("Frische: frisch + wenige Fehler -> ok", freshOk.warn === false);
const freshStale = sourceFreshnessAxis({ crawlAgeMs: 40 * 3600000, checked: 145, failed: 2 });
check("Frische: 40h alt -> warn", freshStale.warn === true);
const freshFailing = sourceFreshnessAxis({ crawlAgeMs: 2 * 3600000, checked: 145, failed: 100 });
check("Frische: hohe Fehlerquote -> warn", freshFailing.warn === true);

// ── combineHealthAxes: harte Blocker vs. WARN ──────────────────────────────
const cAllOk = combineHealthAxes({ budget: bOk, idle: idleQuietDay, coverage: covOk, freshness: freshOk });
check("combine: alles ok -> ok=true", cAllOk.ok === true && cAllOk.blockers.length === 0);
const cBudget = combineHealthAxes({ budget: bExhausted, idle: idleQuietDay, coverage: covOk, freshness: freshOk });
check("combine: Budget erschöpft -> ok=false", cBudget.ok === false && cBudget.blockers.includes("budget-erschoepft"));
const cIdle = combineHealthAxes({ budget: bOk, idle: idleYes, coverage: covOk, freshness: freshOk });
check("combine: Leerlauf -> ok=false", cIdle.ok === false && cIdle.blockers.includes("leerlauf"));
const cWarnOnly = combineHealthAxes({ budget: bOk, idle: idleQuietDay, coverage: covLow, freshness: freshStale });
check("combine: nur Abdeckung/Frische -> ok BLEIBT true (WARN-only)", cWarnOnly.ok === true);
check("combine: WARN-Signale gesammelt", cWarnOnly.warnings.includes("klassifikationsabdeckung-niedrig") && cWarnOnly.warnings.includes("quellenfrische"));

console.log(`\n${passed}/${passed + failed} Health-Achsen-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
