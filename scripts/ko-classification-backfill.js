"use strict";

// =============================================================================
// KO-Klassifikations-Backfill (Sprint 2) — deterministisch, KOSTENNEUTRAL (keine KI).
// =============================================================================
// Fuellt decision_level/political_level/related_levels/event_type/affected_geographies/
// mentioned_geographies/decision_entities/related_entities/classification_confidence +
// embedding bei bestehenden Knowledge Objects aus den bereits belegten Feldern.
//
// Nutzung:
//   node scripts/ko-classification-backfill.js                 # DRY-RUN: Plan + Vorschau, KEIN Schreiben
//   node scripts/ko-classification-backfill.js --limit=50      # DRY-RUN mit Ladegrenze
//   node scripts/ko-classification-backfill.js --execute       # echter Lauf: PATCH auf knowledge_objects
//
// SICHER PER DEFAULT: ohne --execute passiert NICHTS ausser Anzeige des Plans.
// Der echte Lauf schreibt in Production (nur Klassifikationsspalten) -> FREIGABEPFLICHTIG.
// KOSTENNEUTRAL: es faellt KEIN KI-Call an (rein deterministischer Deriver).
// Voraussetzungen fuer --execute: HELMUT_V3_STORE=1, SUPABASE_URL + Service-Role-Key.

const storage = require("../lib/helmut/storage");
const { runKoClassificationBackfill } = require("../lib/helmut/ko-classification-backfill");

function argValue(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : fallback;
}

async function main() {
  const execute = process.argv.includes("--execute");
  const limit = Number(argValue("limit", 500)) || 500;

  if (execute && !storage.v3StoreReady()) {
    console.error("ABBRUCH: --execute erfordert HELMUT_V3_STORE=1 + Supabase (v3StoreReady=false).");
    process.exit(2);
  }

  const result = await runKoClassificationBackfill({ execute, limit }, {
    listKnowledgeObjects: (o) => storage.listKnowledgeObjects(o),
    saveEnrichment: (id, patch) => storage.saveKnowledgeObjectEnrichment(id, patch),
    log: (m) => console.log(m)
  });

  console.log(JSON.stringify(result, null, 2));
  if (result.dryRun) {
    console.log("\n(DRY-RUN — keine Aenderung. Fuer den echten Lauf: --execute; das schreibt in Production und ist freigabepflichtig.)");
  }
}

main().catch((err) => { console.error("Fehler:", err && err.message); process.exit(1); });
