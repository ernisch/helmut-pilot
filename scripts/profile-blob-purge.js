"use strict";

// Einmaliger Blob-Profil-Purge fuer den Wechsel in den Exklusivmodus (Stufe E),
// docs/profil-storage-entkopplung-architekturbericht.md.
//
// Entfernt eingefrorene Profilkopien (profiles/mandateProfiles) aus dem main-Blob,
// nachdem der Backfill abgeschlossen ist und der Exklusivmodus aktiviert wird. Nur
// relational NACHWEISLICH vorhandene Profile werden entfernt (fail-safe, kein
// Datenverlust) — fehlt ein Blob-Profil relational, bleibt es stehen und wird
// gemeldet (zuerst Backfill fahren).
//
// DRY-RUN ist Default. Erst `--execute` schreibt.
// Voraussetzung: HELMUT_PROFILE_DB_MODE=1 + HELMUT_V3_STORE + Supabase.

const storage = require("../lib/helmut/storage");

async function main() {
  const execute = process.argv.slice(2).includes("--execute");
  console.log(`== Blob-Profil-Purge main-Blob (${execute ? "EXECUTE" : "DRY-RUN"}) ==`);
  if (!storage.profileDbModeEnabled()) {
    console.error("ABBRUCH: HELMUT_PROFILE_DB_MODE=1 + HELMUT_V3_STORE + Supabase erforderlich (relationale Praesenzpruefung).");
    return 2;
  }
  const rep = await storage.purgeBlobProfiles({ execute });
  if (rep.error) { console.error(`ABBRUCH: ${rep.error}`); return 2; }
  console.log(`Blob-Profilkopien gefunden: ${rep.candidates}`);
  console.log(`  relational belegt (entfernbar): ${rep.purgeable}`);
  console.log(`  ohne relationale Entsprechung (bleiben, zuerst Backfill): ${rep.skippedNoSql.length}`);
  if (rep.skippedNoSql.length) console.log(`    -> ${rep.skippedNoSql.join(", ")}`);
  if (execute) {
    console.log(`Entfernt: ${rep.purged} | main-Blob geschrieben: ${rep.written}`);
  } else {
    console.log("Dry-Run: nichts geschrieben. Mit --execute ausfuehren.");
  }
  return (rep.skippedNoSql.length && execute) ? 1 : 0;
}

module.exports = {};

if (require.main === module) {
  main().then((code) => process.exit(code || 0)).catch((error) => {
    console.error("Purge fehlgeschlagen:", error && error.message);
    process.exit(1);
  });
}
