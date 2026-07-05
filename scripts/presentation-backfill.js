"use strict";

// =============================================================================
// Manueller, einmaliger Presentation-Fields-Backfill fuer BESTEHENDE Vorgaenge.
// =============================================================================
// Fuellt fehlende Anzeige-Felder (display_title, display_summary, why_relevant,
// recommendation, display_category) bei Alt-KOs ueber die BESTEHENDE Understanding
// Engine nach. Kein Cron, kein Scheduler, kein Automatismus -- nur dieser Befehl.
//
// Nutzung:
//   node scripts/presentation-backfill.js                  # DRY-RUN: Plan + Kostenschaetzung, KEINE KI-Calls
//   node scripts/presentation-backfill.js --execute        # fuehrt aus (verursacht echte KI-Kosten)
//   node scripts/presentation-backfill.js --execute --limit=500
//   npm run backfill:presentation -- --execute
//
// Voraussetzungen (Env, wie beim Server):
//   HELMUT_V3_STORE=1, SUPABASE_URL + Service-Role-Key, Azure/OpenAI-Key.
//
// Sicher per Default: OHNE --execute passiert nichts ausser Anzeige des Plans.
// Idempotent: bereits vollstaendige KOs werden uebersprungen -> beliebig oft ausfuehrbar.
// Empfehlung: Falls Alt-KOs keine verknuepften Quellen haben, zuerst den
//   Provenienz-Backfill laufen lassen: node scripts/lage-backfill.js

const path = require("path");

// .env laden (gleiche Konvention wie der Server; loadLocalEnv lief beim Require).
try { const server = require(path.join("..", "server")); void server; } catch (_) { /* optional */ }

const { backfillPresentationFields } = require("../lib/helmut/presentation-backfill");

function fmtUsd(v) {
  if (typeof v === "number") return `$${v.toFixed(6)}`;
  return v == null ? "unbekannt" : String(v);
}
function fmtDur(ms) {
  return `${(Number(ms) / 1000).toFixed(1)}s`;
}

(async () => {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute") || args.includes("--yes");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;

  // Plan VOR dem Start ausgeben (Anforderung 5).
  const onPlan = (plan) => {
    console.log("\n── Presentation-Backfill · Plan ─────────────────────────────");
    console.log(`  Geladen:               ${plan.loaded}${plan.loadCapReached ? ` (Ladegrenze ${plan.loadLimit} erreicht!)` : ""}`);
    console.log(`  Geprueft (complete):   ${plan.checked}`);
    console.log(`  Uebersprungen (voll):  ${plan.skippedComplete}`);
    console.log(`  Zu verarbeiten:        ${plan.toProcess}`);
    console.log(`  Modell:                ${plan.model}`);
    console.log(`  Gesch. Kosten/Call:    ${fmtUsd(plan.estCostPerCallUsd)}`);
    console.log(`  Gesch. Gesamtkosten:   ${fmtUsd(plan.estTotalCostUsd)}  (Schaetzung)`);
    if (plan.loadCapReached) {
      console.log("  !  Weitere KOs koennten jenseits der Ladegrenze liegen -- --limit erhoehen und erneut laufen.");
    }
    console.log("─────────────────────────────────────────────────────────────");
    console.log(execute ? "AUSFUEHRUNG (--execute): starte Verarbeitung …\n" : "DRY-RUN: keine KI-Calls. Zum Ausfuehren: --execute anhaengen.\n");
  };

  const result = await backfillPresentationFields({ dryRun: !execute, limit }, { onPlan });

  if (result && result.skipped) {
    console.log(`Uebersprungen: ${result.reason}`);
    if (result.reason === "v3-store-not-ready") console.log("  -> HELMUT_V3_STORE=1 + SUPABASE_URL + Service-Role-Key setzen.");
    if (result.reason === "ai-disabled") console.log("  -> Azure/OpenAI-Key setzen (KI ist deaktiviert).");
    return;
  }

  if (result.dryRun) {
    // Plan wurde bereits via onPlan gedruckt; im Dry-Run wird nichts verarbeitet.
    return;
  }

  // Abschlussbericht (Anforderung 6).
  console.log("── Presentation-Backfill · Ergebnis ─────────────────────────");
  console.log(`  Erfolgreich verarbeitet:   ${result.processed}  (vollstaendig: ${result.fullyCompleted}, teilweise: ${result.partiallyFilled})`);
  console.log(`  Fehlgeschlagen:            ${result.failed}`);
  console.log(`  Uebersprungen (voll):      ${result.plan.skippedComplete}`);
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
})().catch((e) => { console.error("[presentation-backfill] Fehler:", e && e.message); process.exit(1); });
