"use strict";

// Datenschutz — Aufbewahrung/Löschung: sicherer TROCKENLAUF (Retention).
// ============================================================================
// Plant die Löschung überalteter raw_documents/knowledge_objects nach der
// Datenklassen-Matrix (lib/helmut/retention.js) und meldet die betroffenen
// Datensätze. SICHER PER DEFAULT: ohne --execute wird NICHTS gelöscht.
//
//   node scripts/retention-dryrun.js                  # TROCKENLAUF: Plan + Bericht
//   node scripts/retention-dryrun.js --raw-days=180 --ko-days=365
//   node scripts/retention-dryrun.js --execute        # ECHTE Löschung — FREIGABEPFLICHTIG
//
// Der echte Lauf löscht in Production (kaskadiert Links/Findings) und ist
// FREIGABEPFLICHTIG (Gründer + Rechtsfreigabe). Referenzielle Integrität wird in
// der Planung erzwungen (kein Löschen eines an ein BEHALTENES KO gebundenen Dokuments).

const storage = require("../lib/helmut/storage");
const { planRetention, retentionExecuteEnabled, DATA_CLASSES } = require("../lib/helmut/retention");

function argNum(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split("=")[1]) : fallback;
}

async function loadMetadata() {
  // NUR minimierte Metadaten laden (id/created_at + Links) — kein Volltext.
  if (typeof storage.loadRetentionMetadata !== "function") {
    return { available: false, reason: "keine-retention-leseschnittstelle" };
  }
  return storage.loadRetentionMetadata();
}

async function main() {
  const execute = process.argv.includes("--execute");
  const rawRetentionDays = argNum("raw-days", DATA_CLASSES.raw_documents.retentionDays);
  const koRetentionDays = argNum("ko-days", DATA_CLASSES.knowledge_objects.retentionDays);

  if (execute && !storage.v3StoreReady()) {
    console.error("ABBRUCH: --execute erfordert HELMUT_V3_STORE=1 + Supabase (v3StoreReady=false).");
    process.exit(2);
  }
  if (execute && !retentionExecuteEnabled()) {
    console.error("ABBRUCH: --execute erfordert zusätzlich HELMUT_RETENTION_EXECUTE=on (freigabepflichtig).");
    process.exit(2);
  }

  const meta = await loadMetadata().catch((e) => ({ available: false, reason: e && e.message }));
  if (!meta || meta.available === false) {
    console.log(JSON.stringify({ dryRun: !execute, available: false, reason: (meta && meta.reason) || "keine-daten", hinweis: "Trockenlauf benötigt die relationale Leseschnittstelle (v3StoreReady)." }, null, 2));
    return;
  }

  const plan = planRetention({
    now: new Date().toISOString(),
    nowMs: Date.now(),
    rawRetentionDays, koRetentionDays,
    rawDocuments: meta.rawDocuments, knowledgeObjects: meta.knowledgeObjects, koDocumentLinks: meta.koDocumentLinks
  });

  console.log(JSON.stringify({
    dryRun: !execute,
    rawRetentionDays, koRetentionDays,
    report: plan.report,
    integrityOk: plan.integrityOk
  }, null, 2));

  if (!execute) {
    console.log("\n(TROCKENLAUF — keine Löschung. Für den echten Lauf: --execute + HELMUT_RETENTION_EXECUTE=on; das löscht in Production und ist freigabepflichtig.)");
    return;
  }

  if (!plan.integrityOk) {
    console.error("ABBRUCH: Integritätsprüfung fehlgeschlagen — ein Löschkandidat ist an ein behaltenes KO gebunden.");
    process.exit(3);
  }
  // Echte Löschung würde hier storage.deleteRetention(plan) aufrufen (kaskadiert Links/Findings).
  const result = await storage.deleteRetention(plan);
  console.log(JSON.stringify({ executed: true, ...result }, null, 2));
}

main().catch((err) => { console.error("Fehler:", err && err.message); process.exit(1); });
