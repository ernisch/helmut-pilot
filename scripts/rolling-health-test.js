"use strict";

// Rollierender Health-Report (Sprint Google-News-Härtung, Phase 5).
// Belegt offline: transiente Störungen bleiben sichtbar, Erholung wird sichtbar,
// wiederholte Degradation eskaliert, unbekannte Datenlage wird ehrlich gemeldet.
// Das B1-Szenario (2026-07-16: 20:00-Lauf 129/145 ausgefallen, 04:00-Lauf wieder
// gesund, 06:00-Report sah nur den jüngsten Lauf) ist der Kern-Regressionsfall.

const { buildRollingCrawlHealth } = require("../lib/helmut/rolling-health");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const now = Date.UTC(2026, 6, 17, 6, 0, 0); // 06:00 UTC Report-Zeitpunkt
const h = (hrs) => new Date(now - hrs * 3600000).toISOString();
const run = (hoursAgo, ok, failedSources, extra = {}) => ({
  mode: "full", runId: `crawl-${hoursAgo}h`, createdAt: h(hoursAgo),
  checkedSources: 145, successfulSources: 145 - failedSources, failedSources, ...extra
});

// ── Kernfall B1: stark degradierter Lauf verschwindet NICHT mehr ────────────
{
  const runs = [run(2, true, 0), run(10, false, 129), run(12, true, 0)]; // 04:00 gesund, 20:00 degradiert, 18:24 gesund
  const rolling = buildRollingCrawlHealth({ runs, nowMs: now });
  check("B1: Status 'gesund-mit-stoerung-im-zeitraum' (nicht 'aktuell-gesund')", rolling.status === "gesund-mit-stoerung-im-zeitraum");
  check("B1: transiente Störung als Warnung (kippt ok nicht, aber sichtbar)", rolling.alertLevel === "warnung");
  check("B1: schlechtester Lauf im Fenster = der 129/145-Lauf", rolling.worstRun && rolling.worstRun.failedSources === 129 && rolling.worstRun.state === "stark-degradiert");
  check("B1: Erholung wird sichtbar (recovered=true)", rolling.recovered === true);
  check("B1: jüngster Zustand gesund", rolling.latestState === "gesund");
  check("B1: degradierte Läufe gezählt (1)", rolling.degradedRuns === 1 && rolling.stronglyDegradedRuns === 1);
}

// ── Alles gesund ────────────────────────────────────────────────────────────
{
  const rolling = buildRollingCrawlHealth({ runs: [run(2, true, 0), run(10, true, 3), run(18, true, 0)], nowMs: now });
  check("alle Läufe gesund -> 'aktuell-gesund', ok", rolling.status === "aktuell-gesund" && rolling.alertLevel === "ok" && rolling.degradedRuns === 0);
}

// ── Aktuell degradiert ──────────────────────────────────────────────────────
{
  const rolling = buildRollingCrawlHealth({ runs: [run(1, false, 129), run(10, true, 0), run(18, true, 0)], nowMs: now });
  check("jüngster Lauf degradiert -> 'aktuell-degradiert', Alarm", rolling.status === "aktuell-degradiert" && rolling.alertLevel === "alarm");
}

// ── Wiederholt degradiert (auch wenn aktuell gesund) ────────────────────────
{
  const rolling = buildRollingCrawlHealth({ runs: [run(1, true, 0), run(8, false, 129), run(16, false, 80)], nowMs: now });
  check("2 degradierte Läufe im Fenster -> 'wiederholt-degradiert', Alarm", rolling.status === "wiederholt-degradiert" && rolling.alertLevel === "alarm");
}
{
  const rolling = buildRollingCrawlHealth({ runs: [run(1, false, 129), run(8, false, 129), run(16, true, 0)], nowMs: now });
  check("aktuell degradiert + zweiter degradierter Lauf -> 'wiederholt-degradiert'", rolling.status === "wiederholt-degradiert");
}

// ── Teilweise Degradation zählt ebenfalls ──────────────────────────────────
{
  const rolling = buildRollingCrawlHealth({ runs: [run(2, true, 0), run(10, false, 30)], nowMs: now });
  check("teilweise degradierter Lauf (30/145=21%) bleibt sichtbar", rolling.status === "gesund-mit-stoerung-im-zeitraum" && rolling.worstRun.state === "teilweise-degradiert");
  check("teilweise (nicht stark) -> recovered=false (keine starke Störung)", rolling.recovered === false);
}

// ── Fenster: alte Störungen außerhalb 24h zählen nicht ─────────────────────
{
  const rolling = buildRollingCrawlHealth({ runs: [run(2, true, 0), run(6, true, 0), run(12, true, 0), run(30, false, 129)], nowMs: now });
  check("Störung älter als 24h (mit >=3 frischen Läufen) fällt aus dem Fenster", rolling.status === "aktuell-gesund");
}

// ── Störungen altern ehrlich: außerhalb des Fensters zählen sie nicht mehr ──
{
  const rolling = buildRollingCrawlHealth({ runs: [run(2, true, 0), run(30, false, 129)], nowMs: now });
  check("Störung >24h alt zählt nicht mehr (kein Dauer-Alarm nach Erholung)", rolling.status === "aktuell-gesund");
}
// ── Kein Lauf im Fenster (Cron steht): ehrlich 'unbekannt' ──────────────────
{
  const rolling = buildRollingCrawlHealth({ runs: [run(30, true, 0), run(40, false, 129)], nowMs: now });
  check("kein Lauf im 24h-Fenster -> 'unbekannt' (Überfälligkeit alarmiert der Cron-Check)", rolling.status === "unbekannt");
}

// ── Unbekannt ───────────────────────────────────────────────────────────────
{
  const rolling = buildRollingCrawlHealth({ runs: [], nowMs: now });
  check("keine Läufe -> 'unbekannt' + Warnung (ehrlich, kein stilles Grün)", rolling.status === "unbekannt" && rolling.alertLevel === "warnung");
}

// ── Persistiertes runState-Feld gewinnt über Ableitung ─────────────────────
{
  const rolling = buildRollingCrawlHealth({ runs: [run(2, true, 0, { runState: "cooldown-reduziert" }), run(10, true, 0)], nowMs: now });
  check("persistiertes runState wird respektiert (cooldown-reduziert != degradiert)", rolling.status === "aktuell-gesund" && rolling.latestState === "cooldown-reduziert");
}

// ── Alt-Läufe ohne neue Felder (Rückwärtskompatibilität) ───────────────────
{
  const legacy = [{ mode: "full", createdAt: h(3), checkedSources: 145, successfulSources: 16, failedSources: 129 }];
  const rolling = buildRollingCrawlHealth({ runs: legacy, nowMs: now });
  check("Alt-Lauf ohne runState wird aus Zählern klassifiziert", rolling.latestState === "stark-degradiert" && rolling.status === "aktuell-degradiert");
}

console.log(`\n${passed}/${passed + failed} Rolling-Health-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
