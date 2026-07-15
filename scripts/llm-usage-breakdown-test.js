"use strict";

// Tests fuer die Admin-Budget-Tagessicht getLlmUsageBreakdownToday (Phase 8).
// Prueft: UTC-Kalendertagsgrenze (identisch zum Budget-Gate), Berliner-Sommerzeit-
// Kante, Skips/Fehler getrennt, Aggregation pro Pfad und pro Mandant, leere Daten,
// >500 Eintraege (kein Anzeige-Cap), Limit/Rest-Felder. Alles offline via deps.

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

function entry(createdAt, callType, opts = {}) {
  return {
    createdAt,
    callType,
    politicianId: opts.politicianId || null,
    userId: opts.userId || opts.politicianId || null,
    model: opts.model || "gpt-5-mini",
    estimatedCost: opts.cost != null ? opts.cost : 0.001,
    success: opts.success !== false,
    error: opts.error || null
  };
}

(async () => {
  const storage = require("../lib/helmut/storage");
  const origLimit = process.env.HELMUT_MAX_LLM_CALLS_PER_DAY;
  const origReserve = process.env.HELMUT_LLM_RESERVE_UNDERSTANDING;
  const origFailClosed = process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED;
  const REF = "2026-07-16T12:00:00.000Z";
  const deps = (llmUsage) => ({ readAuth: async () => ({ llmUsage }) });

  console.log("== 1) UTC-Kalendertagsgrenze (identisch zum Gate) ==");
  process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "10";
  delete process.env.HELMUT_LLM_RESERVE_UNDERSTANDING;
  delete process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED;
  {
    const log = [
      entry("2026-07-16T00:00:01.000Z", "understanding"),           // heute (UTC)
      entry("2026-07-16T23:59:59.000Z", "understanding"),           // heute (UTC)
      entry("2026-07-15T23:59:59.000Z", "understanding"),           // gestern (UTC)
      entry("2026-07-17T00:00:01.000Z", "understanding")            // morgen (UTC)
    ];
    const b = await storage.getLlmUsageBreakdownToday(REF, deps(log));
    check("nur der UTC-Kalendertag zaehlt (2 von 4)", b.calls === 2, `calls=${b.calls}`);
    check("day-Feld korrekt", b.day === "2026-07-16");
    check("Zeitzone dokumentiert (UTC + Berliner Erklaerung)", /UTC/.test(b.timezone) && /Berlin/.test(b.timezone));
  }

  console.log("== 2) Berliner-Sommerzeit-Kante: 22:30Z = 00:30 Berlin am Folgetag -> zaehlt zum UTC-Tag ==");
  {
    // In Berlin ist es am 2026-07-16 um 22:30 UTC bereits der 17.7. — das Gate
    // rechnet aber in UTC. Die Anzeige MUSS dasselbe Fenster nutzen wie das Gate,
    // sonst luegt "verbleibend heute".
    const log = [entry("2026-07-16T22:30:00.000Z", "lageBriefing")];
    const b = await storage.getLlmUsageBreakdownToday(REF, deps(log));
    check("22:30Z-Eintrag zaehlt zum UTC-Tag 16.7. (Gate-Fenster)", b.calls === 1);
  }

  console.log("== 3) Skips und Fehler getrennt, nur echte Calls im Budget ==");
  {
    const log = [
      entry("2026-07-16T08:00:00.000Z", "communicationDraft"),
      entry("2026-07-16T08:01:00.000Z", "communicationDraft", { success: false, error: "OpenAI HTTP 500" }),
      entry("2026-07-16T08:02:00.000Z", "skipped-communicationDraft", { cost: 0, success: false, error: "daily-llm-budget-reached" }),
      entry("2026-07-16T08:03:00.000Z", "skipped-office-output", { cost: 0, success: false, error: "daily-llm-budget-reserved-for-understanding" })
    ];
    const b = await storage.getLlmUsageBreakdownToday(REF, deps(log));
    check("2 echte Calls (Skips zaehlen nicht)", b.calls === 2);
    check("1 Fehler getrennt ausgewiesen", b.errors === 1);
    check("2 Skips getrennt ausgewiesen", b.skips === 2);
    check("Skip-Gruende aggregiert", b.skipsByReason["daily-llm-budget-reached"] === 1 && b.skipsByReason["daily-llm-budget-reserved-for-understanding"] === 1);
    check("Fehler im Pfad sichtbar", b.byCallType.communicationDraft.calls === 2 && b.byCallType.communicationDraft.errors === 1);
  }

  console.log("== 4) Pro Pfad und pro Mandant aggregiert ==");
  {
    const log = [
      entry("2026-07-16T08:00:00.000Z", "understanding", { cost: 0.01 }),
      entry("2026-07-16T08:01:00.000Z", "understanding", { cost: 0.01 }),
      entry("2026-07-16T08:02:00.000Z", "office-output", { politicianId: "mdb-a", cost: 0.002 }),
      entry("2026-07-16T08:03:00.000Z", "lageBriefing", { politicianId: "mdb-b", cost: 0.003 })
    ];
    const b = await storage.getLlmUsageBreakdownToday(REF, deps(log));
    check("Calls pro Pfad", b.byCallType.understanding.calls === 2 && b.byCallType["office-output"].calls === 1);
    check("Kosten pro Pfad", Math.abs(b.byCallType.understanding.estimatedCostUsd - 0.02) < 1e-9);
    check("Calls pro Mandant (mandantenlos getrennt)", b.byTenant["(mandantenlos)"].calls === 2 && b.byTenant["mdb-a"].calls === 1 && b.byTenant["mdb-b"].calls === 1);
    check("Gesamtkosten korrekt", Math.abs(b.estimatedCostUsd - 0.025) < 1e-9);
  }

  console.log("== 5) Budget-Felder: Limit, Rest, Reserve, fail-closed ==");
  {
    process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "10";
    process.env.HELMUT_LLM_RESERVE_UNDERSTANDING = "3";
    process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED = "1";
    const log = [entry("2026-07-16T08:00:00.000Z", "understanding"), entry("2026-07-16T08:01:00.000Z", "understanding")];
    const b = await storage.getLlmUsageBreakdownToday(REF, deps(log));
    check("Limit + Rest", b.limit === 10 && b.remaining === 8);
    check("Reserve sichtbar", b.reserveUnderstanding === 3);
    check("fail-closed sichtbar", b.failClosed === true);
    delete process.env.HELMUT_LLM_RESERVE_UNDERSTANDING;
    delete process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED;
  }

  console.log("== 6) Kein Limit gesetzt -> Schutzlimit 50 wird ehrlich angezeigt (fail-closed) ==");
  // Seit dem Budget-Rollout faellt ein fehlender/ungueltiger Wert auf das
  // Schutzlimit 50 zurueck — die Admin-Anzeige muss GENAU das Gate-Verhalten
  // zeigen (nicht null), sonst luegt sie ueber den wirksamen Deckel.
  {
    delete process.env.HELMUT_MAX_LLM_CALLS_PER_DAY;
    const b = await storage.getLlmUsageBreakdownToday(REF, deps([entry("2026-07-16T08:00:00.000Z", "understanding")]));
    check("limit=50 (Schutzlimit), remaining=49", b.limit === 50 && b.remaining === 49);
    process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "10";
  }

  console.log("== 7) Leere Daten ==");
  {
    const b = await storage.getLlmUsageBreakdownToday(REF, deps([]));
    check("leer: 0 Calls/Skips/Fehler, keine Pfade", b.calls === 0 && b.skips === 0 && b.errors === 0 && Object.keys(b.byCallType).length === 0);
    const b2 = await storage.getLlmUsageBreakdownToday(REF, { readAuth: async () => ({}) });
    check("fehlendes llmUsage-Feld: robust", b2.calls === 0);
  }

  console.log("== 8) Mehr als 500 Eintraege am Tag: KEIN Anzeige-Cap ==");
  {
    const log = [];
    for (let i = 0; i < 600; i++) log.push(entry("2026-07-16T06:00:00.000Z", "understanding", { cost: 0.001 }));
    for (let i = 0; i < 50; i++) log.push(entry("2026-07-15T06:00:00.000Z", "understanding", { cost: 0.001 }));
    const b = await storage.getLlmUsageBreakdownToday(REF, deps(log));
    check("alle 600 heutigen Eintraege gezaehlt (frueher: nur letzte 500 ueber alle Tage)", b.calls === 600, `calls=${b.calls}`);
    check("gestrige 50 nicht enthalten", b.byCallType.understanding.calls === 600);
  }

  console.log("== 9) Berliner WINTERZEIT-Kante: 23:30Z im Januar = 00:30 Berlin (CET) des Folgetags -> zaehlt zum UTC-Tag ==");
  {
    // Winter-Pendant zu §2: Im Januar (CET, UTC+1) ist 23:30Z bereits der
    // Folgetag in Berlin — das Gate rechnet in UTC, die Anzeige MUSS mitziehen.
    const REF_WINTER = "2026-01-15T12:00:00.000Z";
    const log = [
      entry("2026-01-15T23:30:00.000Z", "understanding"), // 00:30 Berlin am 16.1., UTC noch 15.1.
      entry("2026-01-16T00:30:00.000Z", "understanding")  // UTC bereits 16.1. -> zaehlt NICHT
    ];
    const b = await storage.getLlmUsageBreakdownToday(REF_WINTER, deps(log));
    check("Winter: 23:30Z zaehlt zum UTC-Tag 15.1. (Gate-Fenster), 00:30Z-Folgetag nicht", b.calls === 1 && b.day === "2026-01-15", `calls=${b.calls} day=${b.day}`);
  }

  console.log("== 10) Unbekannter/leerer callType: eigener 'unbekannt'-Bucket statt Crash/Verschlucken ==");
  {
    const log = [
      entry("2026-07-16T08:00:00.000Z", ""),        // leerer callType (Legacy-Eintrag)
      entry("2026-07-16T08:01:00.000Z", undefined), // fehlender callType
      entry("2026-07-16T08:02:00.000Z", "understanding")
    ];
    const b = await storage.getLlmUsageBreakdownToday(REF, deps(log));
    check("leer/fehlend -> Bucket 'unbekannt' mit 2 Calls", b.byCallType["unbekannt"] && b.byCallType["unbekannt"].calls === 2, JSON.stringify(b.byCallType));
    check("alle 3 zaehlen als billable (kein Verschlucken)", b.calls === 3);
  }

  console.log("== 11) estimatedCost='unknown' (String) wird NICHT summiert ==");
  {
    // Entsteht bei fehlendem Preis/Token (buildLlmUsageRecord). Die Summierung
    // darf den String weder addieren noch zu NaN machen.
    const log = [
      entry("2026-07-16T08:00:00.000Z", "understanding", { cost: "unknown" }),
      entry("2026-07-16T08:01:00.000Z", "understanding", { cost: 0.01 })
    ];
    const b = await storage.getLlmUsageBreakdownToday(REF, deps(log));
    check("Gesamtkosten = 0.01 (String ignoriert, kein NaN)", Math.abs(b.estimatedCostUsd - 0.01) < 1e-9, `cost=${b.estimatedCostUsd}`);
    check("Pfad-Kosten = 0.01, aber beide Calls gezaehlt", Math.abs(b.byCallType.understanding.estimatedCostUsd - 0.01) < 1e-9 && b.byCallType.understanding.calls === 2);
    check("Mandanten-Kosten ebenfalls ohne NaN", Number.isFinite(b.byTenant["(mandantenlos)"].estimatedCostUsd));
  }

  // Env wiederherstellen
  if (origLimit === undefined) delete process.env.HELMUT_MAX_LLM_CALLS_PER_DAY; else process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = origLimit;
  if (origReserve === undefined) delete process.env.HELMUT_LLM_RESERVE_UNDERSTANDING; else process.env.HELMUT_LLM_RESERVE_UNDERSTANDING = origReserve;
  if (origFailClosed === undefined) delete process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED; else process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED = origFailClosed;

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((error) => {
  console.error("Testlauf abgebrochen:", error);
  process.exit(1);
});
