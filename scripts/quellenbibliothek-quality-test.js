"use strict";

// Tests des Qualitätsmodells (Auftrag §4) + Gewichtung. REINE LOGIK. Deckt ab:
//   - acht Achsen (Autorität/Aktualität/Relevanz/Stabilität/Ausfallhäufigkeit/
//     Einzigartigkeit/Geschwindigkeit/Redundanz)
//   - Nachvollziehbarkeit (Begründung + verwendete Gewichte je Achse)
//   - Ehrlichkeit: fehlende Datengrundlage -> Achse NICHT VERFÜGBAR (nicht 0 erfunden),
//     Gesamtscore normiert über die verfügbaren Achsen
//   - Monotonie: bessere Eingaben -> nie schlechterer Score

const { scoreSourceQuality, AXES, DEFAULT_WEIGHTS, frequencyToHours } = require("../lib/helmut/quellenbibliothek/quality");
const { normalizeDescriptor } = require("../lib/helmut/quellenbibliothek/descriptor");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const strong = normalizeDescriptor({
  publisher: "Bundestag", name: "Bundestag", access: { method: "rss", url: "https://bundestag.de/rss", parser: "generic_rss" },
  evidenceRole: "official_primary", trust: "hoch", level: "bund", expectedFrequency: "daily", universal: true, license: "open", status: "active"
});
strong.health = { state: "reachable", errorStreak: 0, lastLatencyMs: 400, needsAttention: false };

const fullMetrics = {
  latestAgeHours: 3, documentCount: 20, koCount: 12, duplicateCount: 1,
  documentsAvailable: true, koAvailable: true, duplicatesAvailable: true,
  attempts: 20, successes: 20, latencyMs: 400, alternativesCount: 2
};

// --- 1) Vollständige Bewertung ----------------------------------------------
const q = scoreSourceQuality(strong, fullMetrics);
check("1a Gesamtscore zwischen 0 und 1", q.score > 0 && q.score <= 1);
check("1b alle 8 Achsen verfügbar", q.availableAxisCount === 8 && q.totalAxisCount === 8);
check("1c Autorität official_primary+hoch = 1.0", q.axes.authority === 1);
check("1d Relevanz = KO/Dokumente = 0.6", q.axes.relevance === 0.6);
check("1e Ausfallhäufigkeit (reliability) = 20/20 = 1.0", q.axes.reliability === 1);
check("1f Einzigartigkeit 1 - 1/20 = 0.95", q.axes.uniqueness === 0.95);
check("1g Begründung je Achse vorhanden (nachvollziehbar)", q.explanation.length === 8 && q.explanation.every((e) => typeof e === "string" && e.includes(":")));
check("1h verwendete Gewichte ausgewiesen", Object.keys(q.weights).length === 8);

// --- 2) Ehrlichkeit: fehlende Datengrundlage --------------------------------
const q2 = scoreSourceQuality(strong, { /* keine Metriken */ });
check("2a ohne Metriken: nur datenunabhängige Achsen verfügbar (authority, ggf. stability/speed)", q2.available.authority === true && q2.available.relevance === false && q2.available.freshness === false);
check("2b Relevanz ohne Daten NICHT 0 erfunden (available=false, kein axes-Eintrag)", q2.axes.relevance === undefined);
check("2c Score normiert über verfügbare Achsen (nicht null trotz fehlender Daten)", q2.score !== null && q2.score > 0);
const q3 = scoreSourceQuality(normalizeDescriptor({ publisher: "X", access: { method: "rss", url: "https://x.de/f" }, topics: ["t"] }), {});
check("2d nie geprüfte Quelle ohne jede Metrik: authority trägt trotzdem (Deskriptor-Achse)", q3.available.authority === true);

// --- 3) Stabilität aus Health -----------------------------------------------
const brokenDesc = { ...strong, health: { state: "broken", errorStreak: 6, lastLatencyMs: 400 } };
const qb = scoreSourceQuality(brokenDesc, fullMetrics);
check("3a defekte Quelle: Stabilität niedrig", qb.axes.stability != null && qb.axes.stability < 0.2);
check("3b defekte Quelle: Gesamtscore < gesunde Quelle", qb.score < q.score);
const neverChecked = { ...strong, health: { state: "never_checked", errorStreak: 0 } };
check("3c nie geprüft: Stabilität NICHT VERFÜGBAR", scoreSourceQuality(neverChecked, fullMetrics).available.stability === false);

// --- 4) Monotonie -----------------------------------------------------------
const worse = scoreSourceQuality(strong, { ...fullMetrics, koCount: 2, successes: 10, duplicateCount: 15 });
check("4a schlechtere Ausbeute/Ausfälle/Duplikate -> niedrigerer Score", worse.score < q.score);
const fresher = scoreSourceQuality(strong, { ...fullMetrics, latestAgeHours: 1 });
const staler = scoreSourceQuality(strong, { ...fullMetrics, latestAgeHours: 90 });
check("4b frischer nie schlechter als veraltet", fresher.score >= staler.score);

// --- 5) Gewichtung / Frequenz-Helfer ----------------------------------------
check("5a Standardgewichte decken alle Achsen ab", AXES.every((ax) => DEFAULT_WEIGHTS[ax] != null));
check("5b eigene Gewichte überschreibbar", (() => {
  const custom = scoreSourceQuality(strong, fullMetrics, { weights: { authority: 1, freshness: 0, relevance: 0, stability: 0, reliability: 0, uniqueness: 0, speed: 0, redundancy: 0 } });
  return Math.abs(custom.score - q.axes.authority) < 0.001; // nur Autorität zählt
})());
check("5c Frequenz->Stunden plausibel", frequencyToHours("daily") === 24 && frequencyToHours("weekly") === 168 && frequencyToHours("hourly") === 1);

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Qualitäts-Assertions`);
process.exit(failed > 0 ? 1 : 0);
