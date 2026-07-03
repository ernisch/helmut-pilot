"use strict";

// Einmaliger Provenienz-Backfill fuer BESTEHENDE Vorgaenge (kein KI-Call).
// Nutzung:
//   node scripts/lage-backfill.js [--dry-run] [--days=45] [--limit=800]
// Benoetigt in der Umgebung: HELMUT_V3_STORE=1, SUPABASE_URL + Service-Role-Key.

const path = require("path");

// .env laden, falls server.js-Loader vorhanden (gleiche Konvention wie der Server).
try {
  const server = require(path.join("..", "server"));
  void server; // loadLocalEnv() lief beim Require
} catch (_) { /* optional */ }

const { backfillProvenance } = require("../lib/helmut/backfill");

(async () => {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const daysArg = args.find((a) => a.startsWith("--days="));
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const days = daysArg ? Number(daysArg.split("=")[1]) : undefined;
  const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;

  console.log(`[lage-backfill] Start${dryRun ? " (dry-run)" : ""} days=${days || 45} limit=${limit || 800}`);
  const result = await backfillProvenance({ days, limit, dryRun });
  console.log(JSON.stringify(result, null, 2));
  if (result.skipped) {
    console.log(`[lage-backfill] uebersprungen: ${result.reason}`);
    if (result.reason === "v3-store-not-ready") {
      console.log("  -> HELMUT_V3_STORE=1 + SUPABASE_URL + Service-Role-Key setzen.");
    }
  }
})().catch((e) => { console.error("[lage-backfill] Fehler:", e && e.message); process.exit(1); });
