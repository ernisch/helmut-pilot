"use strict";

// Per-Mandant-KI-Budget (Mehrmandantenfaehigkeit Phase 10).
//
// Reine Entscheidungslogik (keine DB, kein Netz) — die Nutzungszahlen kommen vom
// Aufrufer (storage). Beurteilt, ob ein Mandant heute/diesen Monat noch einen
// KI-Call machen darf, mit Warnschwelle, hartem Stopp und fail-closed bei
// unbekanntem Status.
//
// Einfach erklaert: jeder Kunde bekommt ein eigenes KI-Budget (Tag + Monat). Ein
// Kunde darf nicht das gesamte Helmut-Budget verbrauchen. Ist sein Budget fast
// erreicht -> Warnung; ist es ueberschritten -> Stopp. Ist der Kostenstatus nicht
// ermittelbar -> lieber stoppen (fail-closed), damit keine unkontrollierten Kosten
// entstehen.
//
// WICHTIG (Waehrung): das Nutzungs-Log schaetzt Kosten in USD, das Profil-Budget
// ist in EUR-Cent. Fuer diesen SICHERHEITSDECKEL (Ziel: Runaway-Kosten verhindern,
// keine centgenaue Abrechnung) werden USD und EUR bewusst als gleichwertig
// behandelt — die ~10% Wechselkurs-Differenz ist fuer einen Schutzdeckel
// irrelevant und bewusst konservativ (der Deckel greift eher etwas frueher).

const DEFAULT_WARN_RATIO = 0.8;

// USD-Kosten (aus dem Log) -> Cent (fuer den Vergleich mit dem Cent-Budget).
function usdToCent(usd) {
  const n = Number(usd);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

// Kernentscheidung. opts:
//   dailyBudgetCent   : number|null  (null = kein Tagesdeckel fuer diesen Mandant)
//   monthlyBudgetCent : number|null
//   spentTodayUsd     : number|null  (null = unbekannt -> fail-closed, wenn ein Budget gesetzt ist)
//   spentMonthUsd     : number|null
//   warnRatio         : number       (Default 0.8)
// Rueckgabe: { allowed, warn, reason, ... } — nie throw.
function evaluateTenantBudget(opts = {}) {
  const {
    dailyBudgetCent = null,
    monthlyBudgetCent = null,
    spentTodayUsd = null,
    spentMonthUsd = null,
    warnRatio = DEFAULT_WARN_RATIO
  } = opts;

  const hasDaily = Number.isFinite(dailyBudgetCent) && dailyBudgetCent > 0;
  const hasMonthly = Number.isFinite(monthlyBudgetCent) && monthlyBudgetCent > 0;

  // Kein per-Mandant-Budget gesetzt -> dieser Deckel ist inert (der globale
  // Call-Count-Deckel greift weiterhin, unabhaengig davon).
  if (!hasDaily && !hasMonthly) {
    return { allowed: true, warn: false, applied: false, reason: null, dailyRemainingCent: null, monthlyRemainingCent: null };
  }

  // Kostenstatus unbekannt, obwohl ein Budget gesetzt ist -> FAIL-CLOSED.
  const dailyUnknown = hasDaily && !(Number.isFinite(spentTodayUsd));
  const monthlyUnknown = hasMonthly && !(Number.isFinite(spentMonthUsd));
  if (dailyUnknown || monthlyUnknown) {
    return { allowed: false, warn: true, applied: true, reason: "tenant-budget-status-unknown-fail-closed", dailyRemainingCent: null, monthlyRemainingCent: null };
  }

  const spentTodayCent = usdToCent(spentTodayUsd);
  const spentMonthCent = usdToCent(spentMonthUsd);

  const dailyRemainingCent = hasDaily ? Math.max(0, dailyBudgetCent - spentTodayCent) : null;
  const monthlyRemainingCent = hasMonthly ? Math.max(0, monthlyBudgetCent - spentMonthCent) : null;

  // Harter Stopp: Tages- ODER Monatsdeckel erreicht/ueberschritten.
  if (hasDaily && spentTodayCent >= dailyBudgetCent) {
    return { allowed: false, warn: true, applied: true, reason: "tenant-daily-budget-reached", dailyRemainingCent: 0, monthlyRemainingCent };
  }
  if (hasMonthly && spentMonthCent >= monthlyBudgetCent) {
    return { allowed: false, warn: true, applied: true, reason: "tenant-monthly-budget-reached", dailyRemainingCent, monthlyRemainingCent: 0 };
  }

  // Warnschwelle (Default 80%): erlaubt, aber warn=true.
  const dailyWarn = hasDaily && spentTodayCent >= Math.floor(dailyBudgetCent * warnRatio);
  const monthlyWarn = hasMonthly && spentMonthCent >= Math.floor(monthlyBudgetCent * warnRatio);

  return {
    allowed: true,
    warn: Boolean(dailyWarn || monthlyWarn),
    applied: true,
    reason: (dailyWarn || monthlyWarn) ? "tenant-budget-warning" : null,
    dailyRemainingCent,
    monthlyRemainingCent
  };
}

module.exports = { evaluateTenantBudget, usdToCent, DEFAULT_WARN_RATIO };
