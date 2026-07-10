"use strict";

// =============================================================================
// Manueller, einmaliger Stabschef-Fields-Backfill fuer BESTEHENDE Vorgaenge.
// =============================================================================
// Fuellt fehlende Stabschef-Felder (risk_of_no_action, opportunity_summary,
// risk_level, opportunity_level, recommended_communication_struct, action_items_struct,
// recommended_communication, action_items) bei Alt-KOs ueber die BESTEHENDE Understanding
// Engine nach -> hebt den Helmut-Tab von "partial" auf "valid". Kein Cron/Scheduler.
//
// Nutzung:
//   node scripts/staff-backfill.js                          # DRY-RUN: Plan + Kostenschaetzung, KEINE KI-Calls
//   node scripts/staff-backfill.js --limit=50               # DRY-RUN mit Ladegrenze
//   node scripts/staff-backfill.js --execute --confirm      # echter Lauf (verursacht echte KI-Kosten)
//   node scripts/staff-backfill.js --execute --confirm --limit=10
//
// SICHER PER DEFAULT: OHNE **beide** Flags --execute UND --confirm passiert NICHTS ausser
// Anzeige des Plans (explizite Freigabe erforderlich). Idempotent: bereits vollstaendige
// KOs werden uebersprungen. Voraussetzungen (Env, wie beim Server):
//   HELMUT_V3_STORE=1, SUPABASE_URL + Service-Role-Key, Azure/OpenAI-Key.

const path = require("path");
try { const server = require(path.join("..", "server")); void server; } catch (_) { /* optional */ }

const { backfillStaffFields } = require("../lib/helmut/staff-backfill");

function fmtUsd(v) {
  if (typeof v === "number") return `$${v.toFixed(6)}`;
  return v == null ? "unbekannt" : String(v);
}
function fmtDur(ms) { return `${(Number(ms) / 1000).toFixed(1)}s`; }

(async () => {
  const args = process.argv.slice(2);
  // Explizite Doppel-Freigabe fuer einen echten, kostenverursachenden Lauf.
  const execute = args.includes("--execute") && args.includes("--confirm");
  const wantsExecute = args.includes("--execute");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;
  // Gezielter Modus: genau EIN KO ueber Knowledge-Object-ID ODER Vorgang-ID.
  const targetKoArg = args.find((a) => a.startsWith("--target-ko="));
  const targetVorgangArg = args.find((a) => a.startsWith("--target-vorgang="));
  const targetKoId = targetKoArg ? targetKoArg.split("=")[1] : undefined;
  const targetVorgangId = targetVorgangArg ? targetVorgangArg.split("=")[1] : undefined;

  const onPlan = (plan) => {
    console.log("\n── Stabschef-Backfill · Plan ────────────────────────────────");
    if (plan.targeted) console.log(`  Zielmodus:               genau 1 (ko=${plan.targetKoId || "-"} vorgang=${plan.targetVorgangId || "-"})`);
    console.log(`  Geladen:                 ${plan.loaded}${plan.loadCapReached ? ` (Ladegrenze ${plan.loadLimit} erreicht!)` : ""}`);
    console.log(`  Geprueft (complete):     ${plan.checked}`);
    console.log(`  Uebersprungen (kein Kd.):${plan.skippedNonCandidate}`);
    console.log(`  Zu verarbeiten:          ${plan.toProcess}`);
    console.log(`  Modell:                  ${plan.model}`);
    console.log(`  Gesch. Tokens/Call:      in ${plan.estTokensPerCall.input} / out ${plan.estTokensPerCall.output} (Code-Schaetzwerte)`);
    console.log(`  Gesch. Kosten/Call:      ${fmtUsd(plan.estCostPerCallUsd)}  (interne estimateLlmCost)`);
    console.log(`  Gesch. Gesamtkosten:     ${fmtUsd(plan.estTotalCostUsd)}  (Schaetzung)`);
    console.log(`  Budget-Gate verdrahtet:  ${plan.budgetGateWired ? "ja (canSpendLlm pro KO)" : "NEIN"}`);
    console.log(`  Fehlerquoten-Abbruch:    > ${Math.round(plan.failureRateAbort * 100)}%`);
    console.log(`  Fehlende Felder (Summe):`);
    for (const [f, n] of Object.entries(plan.missingFieldHistogram)) console.log(`      ${f.padEnd(34)} ${n}`);
    if (plan.warnings && plan.warnings.length) {
      console.log("  Warnungen:");
      for (const w of plan.warnings) console.log(`      ! ${w}`);
    }
    console.log("─────────────────────────────────────────────────────────────");
    if (execute) {
      console.log("AUSFUEHRUNG (--execute --confirm): starte Verarbeitung …\n");
    } else if (wantsExecute) {
      console.log("DRY-RUN: --execute allein reicht nicht. Fuer echten Lauf ZUSAETZLICH --confirm anhaengen.\n");
    } else {
      console.log("DRY-RUN: keine KI-Calls, keine Writes. Empfehlung: vor echtem Lauf Snapshot der 8 Zielspalten ziehen.\n");
    }
  };

  const result = await backfillStaffFields({ dryRun: !execute, limit, targetKoId, targetVorgangId }, { onPlan });

  if (result && result.skipped) {
    console.log(`Uebersprungen: ${result.reason}`);
    if (result.reason === "v3-store-not-ready") console.log("  -> HELMUT_V3_STORE=1 + SUPABASE_URL + Service-Role-Key setzen.");
    if (result.reason === "ai-disabled") console.log("  -> Azure/OpenAI-Key setzen (KI ist deaktiviert).");
    return;
  }
  if (result.dryRun) return; // Plan wurde via onPlan gedruckt; im Dry-Run wird nichts verarbeitet.

  console.log("── Stabschef-Backfill · Ergebnis ────────────────────────────");
  console.log(`  Erfolgreich verarbeitet:   ${result.processed}  (vollstaendig: ${result.fullyCompleted}, teilweise: ${result.partiallyFilled})`);
  console.log(`  Fehlgeschlagen:            ${result.failed}${result.abortedFailureRate ? "  (Abbruch: Fehlerquote)" : ""}`);
  console.log(`  Uebersprungen (o. Quellen):${result.skippedNoSources}`);
  console.log(`  Uebersprungen (Budget):    ${result.skippedBudget}`);
  console.log(`  Tatsaechliche Kosten:      ${fmtUsd(result.actualCostUsd)}  (aus LLM-Log)`);
  console.log(`  Gesamtdauer:               ${fmtDur(result.durationMs)}`);
  console.log("─────────────────────────────────────────────────────────────");
  if (result.errors && result.errors.length) {
    console.log(`\nFehler (${result.errors.length}, erste 20):`);
    for (const e of result.errors.slice(0, 20)) {
      console.log(`  - ${e.id}: ${e.reason}${e.detail ? " — " + JSON.stringify(e.detail) : ""}`);
    }
  }
})().catch((e) => { console.error("[staff-backfill] Fehler:", e && e.message); process.exit(1); });
