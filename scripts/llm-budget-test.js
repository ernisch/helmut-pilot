"use strict";

// Tests fuer das Per-Mandant-KI-Budget (Phase 10).
// Prueft die reine Entscheidungslogik (evaluateTenantBudget) UND die storage-
// Kombination (canSpendLlmForTenant) mit gefaelschtem Nutzungs-Log.

const { evaluateTenantBudget } = require("../lib/helmut/llm-budget");

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
  const depsFor = (pid) => ({
    canSpend: async () => ({ allowed: true, used: 0, limit: null, remaining: null, reason: null }), // globaler Deckel: erlaubt
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

  console.log("");
  const total = pass + fail;
  if (fail === 0) { console.log(`${pass}/${total} KI-Budget-Assertions erfolgreich.`); process.exit(0); }
  console.log(`${pass}/${total} erfolgreich, ${fail} fehlgeschlagen.`);
  process.exit(1);
})();
