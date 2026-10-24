"use strict";

// Tests fuer das Per-Mandant-KI-Budget (Phase 10).
// Prueft die reine Entscheidungslogik (evaluateTenantBudget) UND die storage-
// Kombination (canSpendLlmForTenant) mit gefaelschtem Nutzungs-Log.

const { evaluateTenantBudget } = require("../lib/helmut/llm-budget");
const { isDeepStrictEqual } = require("node:util");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

console.log("== 1) Kein Budget gesetzt -> inert (erlaubt, nicht angewandt) ==");
const none = evaluateTenantBudget({ dailyBudgetCent: null, monthlyBudgetCent: null, spentTodayUsd: 5, spentMonthUsd: 50 });
check("kein Budget -> allowed", none.allowed === true);
check("kein Budget -> applied=false", none.applied === false);

console.log("== 2) Budget vorhanden, Verbrauch niedrig -> erlaubt, keine Warnung ==");
const ok = evaluateTenantBudget({ dailyBudgetCent: 200, monthlyBudgetCent: 4000, spentTodayUsd: 0.10, spentMonthUsd: 2.00 });
check("niedrig -> allowed", ok.allowed === true);
check("niedrig -> keine Warnung", ok.warn === false);
check("Tagesrest korrekt (200 - 10 = 190 Cent)", ok.dailyRemainingCent === 190);

console.log("== 3) Warnschwelle (>=80% Tag) ==");
const warn = evaluateTenantBudget({ dailyBudgetCent: 200, monthlyBudgetCent: 4000, spentTodayUsd: 1.70, spentMonthUsd: 2.00 });
check("80% erreicht -> allowed", warn.allowed === true);
check("80% erreicht -> warn=true", warn.warn === true);
check("Grund = warning", warn.reason === "tenant-budget-warning");

console.log("== 4) Harter Stopp Tagesbudget ==");
const dayStop = evaluateTenantBudget({ dailyBudgetCent: 200, monthlyBudgetCent: 4000, spentTodayUsd: 2.00, spentMonthUsd: 5.00 });
check("Tagesbudget erreicht -> allowed=false", dayStop.allowed === false);
check("Grund = tenant-daily-budget-reached", dayStop.reason === "tenant-daily-budget-reached");
const dayOver = evaluateTenantBudget({ dailyBudgetCent: 200, monthlyBudgetCent: 4000, spentTodayUsd: 2.50, spentMonthUsd: 5.00 });
check("Tagesbudget überschritten -> allowed=false", dayOver.allowed === false);

console.log("== 5) Harter Stopp Monatsbudget (Tag ok) ==");
const monthStop = evaluateTenantBudget({ dailyBudgetCent: 500, monthlyBudgetCent: 4000, spentTodayUsd: 0.50, spentMonthUsd: 40.00 });
check("Monatsbudget erreicht -> allowed=false", monthStop.allowed === false);
check("Grund = tenant-monthly-budget-reached", monthStop.reason === "tenant-monthly-budget-reached");

console.log("== 6) Fail-closed bei unbekanntem Status ==");
const unknown = evaluateTenantBudget({ dailyBudgetCent: 200, monthlyBudgetCent: null, spentTodayUsd: null, spentMonthUsd: null });
check("Budget gesetzt + Kosten unbekannt -> allowed=false (fail-closed)", unknown.allowed === false);
check("Grund = status-unknown-fail-closed", unknown.reason === "tenant-budget-status-unknown-fail-closed");
// Ohne Budget bleibt unbekannt harmlos:
const unknownNoBudget = evaluateTenantBudget({ dailyBudgetCent: null, monthlyBudgetCent: null, spentTodayUsd: null, spentMonthUsd: null });
check("kein Budget + Kosten unbekannt -> allowed (inert)", unknownNoBudget.allowed === true);

console.log("== 7) storage.canSpendLlmForTenant: kombiniert global + tenant (deps-injiziert) ==");
(async () => {
  const storage = require("../lib/helmut/storage");
  // Deterministische Nutzungszahlen injizieren (kein Netz, kein Store):
  // mdb-a hat heute $2.50, diesen Monat $30.00; mdb-b praktisch nichts.
  const usage = {
    "mdb-a": { today: 2.50, month: 30.00 },
    "mdb-b": { today: 0.05, month: 0.10 }
  };
  const countGateScopes = [];
  const depsFor = (pid) => ({
    // GESAMTDECKEL-Nachweis (Budget-Rollout 2026-07): der Count-Deckel muss
    // GLOBAL zaehlen — canSpend bekommt null, NICHT die Mandanten-ID. Sonst
    // teilen Buero/Lage und Understanding keinen gemeinsamen Topf.
    canSpend: async (scopeId) => { countGateScopes.push(scopeId); return { allowed: true, used: 0, limit: null, remaining: null, reason: null }; },
    usageToday: async () => ({ estimatedCostUsd: (usage[pid] || {}).today || 0 }),
    costSince: async () => ({ estimatedCostUsd: (usage[pid] || {}).month || 0 })
  });

  // mdb-a hat $2.50 heute; Tagesbudget 200 Cent -> erreicht -> Stopp.
  const aStop = await storage.canSpendLlmForTenant("mdb-a", { dailyBudgetCent: 200, monthlyBudgetCent: 10000 }, null, depsFor("mdb-a"));
  check("mdb-a Tagesbudget 200 erreicht -> allowed=false", aStop.allowed === false, JSON.stringify(aStop));

  // mdb-a Tagesbudget hoch (1000), Monat hoch -> erlaubt.
  const aOk = await storage.canSpendLlmForTenant("mdb-a", { dailyBudgetCent: 1000, monthlyBudgetCent: 10000 }, null, depsFor("mdb-a"));
  check("mdb-a Tagesbudget 1000 -> allowed=true", aOk.allowed === true, JSON.stringify(aOk));

  // mdb-a Monatsbudget 2500 Cent (=$25) erreicht bei $30 -> Stopp (Tag ok).
  const aMonthStop = await storage.canSpendLlmForTenant("mdb-a", { dailyBudgetCent: 100000, monthlyBudgetCent: 2500 }, null, depsFor("mdb-a"));
  check("mdb-a Monatsbudget 2500 erreicht -> allowed=false", aMonthStop.allowed === false, JSON.stringify(aMonthStop));

  // mdb-b hat nur $0.05 -> Budget 200 ok. Cross-Tenant: mdb-a's Kosten zaehlen NICHT fuer mdb-b.
  const bOk = await storage.canSpendLlmForTenant("mdb-b", { dailyBudgetCent: 200 }, null, depsFor("mdb-b"));
  check("mdb-b (fremd) unbeeinflusst von mdb-a Kosten -> allowed=true", bOk.allowed === true, JSON.stringify(bOk));

  // Kein Budget gesetzt -> nur globaler Deckel; tenant nicht angewandt.
  const noBudget = await storage.canSpendLlmForTenant("mdb-a", {}, null, depsFor("mdb-a"));
  check("kein Profil-Budget -> tenantBudget.applied=false", noBudget.tenantBudget && noBudget.tenantBudget.applied === false);

  // Globaler Deckel erschoepft -> allowed=false, egal welches Tenant-Budget.
  const globalStop = await storage.canSpendLlmForTenant("mdb-b", { dailyBudgetCent: 100000 }, null, {
    ...depsFor("mdb-b"),
    canSpend: async () => ({ allowed: false, reason: "daily-llm-budget-reached" })
  });
  check("globaler Deckel erschöpft -> allowed=false", globalStop.allowed === false && globalStop.reason === "daily-llm-budget-reached");

  // Gesamtdeckel-Scope: JEDER Count-Gate-Aufruf oben lief global (null), obwohl
  // eine Mandanten-ID uebergeben wurde — kein Tenant kann das globale Budget umgehen.
  check("Count-Gate zaehlt GLOBAL (canSpend erhaelt null, nie die Mandanten-ID)",
    countGateScopes.length >= 5 && countGateScopes.every((s) => s === null),
    JSON.stringify(countGateScopes));

  // Regression: explizit null wird vom bestehenden Storage-Vertrag zu 0
  // normalisiert. Die inaktive Tenant-Policy darf deshalb keine zwei ganzen
  // Auth-Stores laden; der frische globale Deckel gilt trotzdem bei JEDEM Aufruf.
  const reference = "2026-10-21T19:00:00.000Z";
  for (const budgets of [
    { dailyBudgetCent: null, monthlyBudgetCent: null },
    { dailyBudgetCent: 0, monthlyBudgetCent: 0 },
    { dailyBudgetCent: -1, monthlyBudgetCent: -2 },
    { dailyBudgetCent: "0", monthlyBudgetCent: "-2" },
    { dailyBudgetCent: null },
    { monthlyBudgetCent: 0 }
  ]) {
    for (const allowed of [true, false]) {
      let globalCalls = 0, costCalls = 0;
      const global = { allowed, used: 9, limit: 9, remaining: 0,
        reason: allowed ? null : "daily-llm-budget-reached" };
      const result = await storage.canSpendLlmForTenant("mdb-a", budgets, reference, {
        canSpend: async (scope, at) => {
          globalCalls += 1;
          check("inaktive Tenant-Policy: globaler Scope und Zeitbindung", scope === null && at === reference);
          return global;
        },
        usageToday: async () => { costCalls += 1; throw new Error("unexpected full Auth read"); },
        costSince: async () => { costCalls += 1; throw new Error("unexpected full Auth read"); }
      });
      check("inaktive Tenant-Policy: genau ein globaler Check, keine Kosten-Reads",
        globalCalls === 1 && costCalls === 0);
      check("inaktive Tenant-Policy: vollstaendige bisherige Rueckgabe erhalten",
        isDeepStrictEqual(result, { ...global, warn: false,
          tenantBudget: { allowed: true, warn: false, reason: null, applied: false,
            dailyRemainingCent: null, monthlyRemainingCent: null } }), JSON.stringify(result));
    }
  }

  // Sobald EIN Limit positiv ist, bleiben BEIDE Kostenfenster und das bisherige
  // Fail-closed-Verhalten erhalten, auch wenn das andere Fenster inaktiv ist.
  for (const budgets of [
    { dailyBudgetCent: 200, monthlyBudgetCent: 0 },
    { dailyBudgetCent: null, monthlyBudgetCent: "200" }
  ]) {
    let dayCalls = 0, monthCalls = 0;
    const result = await storage.canSpendLlmForTenant("mdb-a", budgets, reference, {
      canSpend: async () => ({ allowed: true }),
      usageToday: async (pid, at) => {
        dayCalls += 1;
        check("aktives Budget: Tageskosten fuer richtigen Mandanten und Zeitpunkt", pid === "mdb-a" && at === reference);
        return { estimatedCostUsd: 0.10 };
      },
      costSince: async (pid, start, at) => {
        monthCalls += 1;
        check("aktives Budget: Monatskosten mit bisheriger Zeitbindung", pid === "mdb-a" && start === "2026-10-01" && at === reference);
        throw new Error("cost read unavailable");
      }
    });
    check("aktives Budget: beide Kostenfenster weiter abgefragt", dayCalls === 1 && monthCalls === 1);
    check("aktives Budget: unbekannte Kosten bleiben fail-closed",
      result.allowed === false && result.reason === "tenant-budget-status-unknown-fail-closed");
  }

  console.log("");
  const total = pass + fail;
  if (fail === 0) { console.log(`${pass}/${total} KI-Budget-Assertions erfolgreich.`); process.exit(0); }
  console.log(`${pass}/${total} erfolgreich, ${fail} fehlgeschlagen.`);
  process.exit(1);
})();
