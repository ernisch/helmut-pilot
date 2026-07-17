"use strict";

// ============================================================================
// Understanding-Recovery-TROCKENLAUF (rein lesend, Dry-Run ist der EINZIGE Modus).
// ============================================================================
// Prueft, ob zurueckgestellte/fehlgeschlagene Vorgaenge des Alt-Bestands aus noch
// vorhandenen raw_documents rekonstruierbar sind. Das Skript darf NUR:
//   1) Kandidaten lesen, 2) passende Rohdokumente suchen, 3) Rekonstruktions-
//   vorschlaege erzeugen, 4) Konflikte melden, 5) einen Bericht schreiben.
// Es speichert/veraendert NICHTS: kein Prod-Write, kein KI-Call, keine Env-/Flag-/
// Cron-/Migrations-Aenderung. Es gibt KEINEN --execute-Modus.
//
// Ausgabe: JSON-Bericht nach stdout (nur Slugs/Zahlen/Klassen — keine Rohtitel/PII).
// Aufruf (spaeter, mit Lese-Secrets): HELMUT_V3_STORE=1 SUPABASE_URL=... \
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/understanding-recovery-dryrun.js

const storage = require("../lib/helmut/storage");
const recovery = require("../lib/helmut/understanding-recovery");

// Breiteres Lesefenster als der 30d/500-Cron, um den Anfang-Juli-Bestand zu
// erreichen — rein lesend (paginierte Lesung auf raw_documents), kein Retention-Eingriff.
// WICHTIG: vollstaendige Pagination (listAllRawDocuments) statt eines einzelnen
// limit-Arguments — ein server-seitiger PostgREST-Cap (db-max-rows, Default 1000)
// wuerde sonst die aelteren Seed-Dokumente still abschneiden (Bugfix 2026-07-17).
const RAW_DAYS = Number(process.env.HELMUT_RECOVERY_RAW_DAYS || 120);

async function main() {
  // Harte Sperre: dieses Werkzeug hat definitionsgemaess keinen Schreibmodus.
  if (process.argv.includes("--execute")) {
    console.error("ABBRUCH: Der Recovery-Trockenlauf hat KEINEN --execute-Modus. Er schreibt niemals.");
    process.exit(2);
  }
  if (!storage.v3StoreReady || !storage.v3StoreReady()) {
    console.log(JSON.stringify({ dryRun: true, ok: false,
      reason: "V3-Store nicht bereit (SUPABASE_* fehlen). Trockenlauf braucht nur Lesezugriff." }));
    return;
  }

  // (1) Kandidaten lesen (read-only).
  const pending = await storage.listPendingKnowledgeObjects({ limit: 500 }).catch(() => []);
  const failed = await storage.listFailedKnowledgeObjects({ limit: 200 }).catch(() => []);
  const candidates = [...pending, ...failed];

  // (2) Passende Rohdokumente + complete-KOs lesen (read-only).
  // Vollstaendige Pagination: KEIN .catch(() => []) — ein Seitenfehler MUSS abbrechen,
  // sonst wuerde ein Teil-Pool wieder Faelle faelschlich als "keine-quelle" bewerten.
  const rawDocs = await storage.listAllRawDocuments({ days: RAW_DAYS });
  const completeKos = typeof storage.listKnowledgeObjects === "function"
    ? await storage.listKnowledgeObjects({ status: "neu", limit: 2000 }).catch(() => [])
    : [];
  const completeTopicSet = recovery.completeTopicSet(candidates, completeKos);

  // (3)/(4) Rekonstruktionsvorschlaege + Konfliktklassifikation (pure, read-only).
  const assessments = recovery.assessAll(candidates, rawDocs, { completeTopicSet });
  const summary = recovery.summarize(assessments);

  // (5) Bericht (redigiert: nur Slugs/Zahlen/Klassen).
  const report = {
    dryRun: true, ok: true,
    hinweis: "Rein lesend. Keine Daten gespeichert oder veraendert. Kein KI-Call.",
    gelesen: { kandidaten: candidates.length, pending: pending.length, failed: failed.length,
      rohdokumente: rawDocs.length, completeKosGeprueft: completeKos.length,
      completeTopicTreffer: completeTopicSet.size },
    zusammenfassung: summary,
    empfohlen: assessments.filter((a) => a.empfehlung === "recovery").map((a) => a.vorgangId),
    verwerfen: assessments.filter((a) => a.empfehlung === "verwerfen").map((a) => a.vorgangId),
    manuell: assessments.filter((a) => a.empfehlung === "manuell").map((a) => a.vorgangId),
    vorschlaege: assessments.map(recovery.redactAssessment)
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => { console.error("Trockenlauf-Fehler (kein Write erfolgt):", e && e.message); process.exit(1); });
