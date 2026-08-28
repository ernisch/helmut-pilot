"use strict";

// Datenschutz — Aufbewahrung/Löschung: sicherer TROCKENLAUF (Retention).
// ============================================================================
// Plant die Löschung überalteter raw_documents/knowledge_objects nach der
// Datenklassen-Matrix (lib/helmut/retention.js) und meldet die betroffenen
// Datensätze. Der heutige REST-Abzug ist nicht transaktional und deshalb
// AUSSCHLIESSLICH als Trockenlauf zugelassen; auch --execute kann nichts löschen.
//
//   node scripts/retention-dryrun.js                  # TROCKENLAUF: Plan + Bericht
//   node scripts/retention-dryrun.js --raw-days=180 --ko-days=365
//   node scripts/retention-dryrun.js --execute        # belegt die harte Ausführungssperre
//
// Eine künftige echte Ausführung wäre FREIGABEPFLICHTIG (Gründer + Recht) und
// braucht zusätzlich einen DB-seitig transaktionalen/sperrenden Vertrag. Die
// heutige Planung prüft Referenzen nur innerhalb ihres gelesenen REST-Abzugs.

const storage = require("../lib/helmut/storage");
const { planRetention, retentionExecuteEnabled, DATA_CLASSES } = require("../lib/helmut/retention");

function argPositiveInteger(name, fallback, argv = process.argv) {
  const hits = argv.filter((a) => a.startsWith(`--${name}=`));
  if (hits.length === 0) return fallback;
  if (hits.length !== 1) throw new Error(`--${name} darf genau einmal vorkommen`);
  const raw = hits[0].slice(`--${name}=`.length);
  // Keine JS-Typkonvertierung: leer, Vorzeichen, Dezimalzahlen, Exponenten,
  // null/true/false und ungueltige Werte sind Fristfehler und blockieren.
  if (!/^[1-9][0-9]*$/.test(raw)) throw new Error(`--${name} muss eine positive ganze Zahl sein`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new Error(`--${name} liegt ausserhalb des sicheren Zahlenbereichs`);
  return value;
}

async function loadMetadata() {
  // NUR minimierte Metadaten laden (id/created_at + Links) — kein Volltext.
  if (typeof storage.loadRetentionMetadata !== "function") {
    return { available: false, reason: "keine-retention-leseschnittstelle" };
  }
  return storage.loadRetentionMetadata();
}

async function main(argv = process.argv) {
  const execute = argv.includes("--execute");
  const rawRetentionDays = argPositiveInteger("raw-days", DATA_CLASSES.raw_documents.retentionDays, argv);
  const koRetentionDays = argPositiveInteger("ko-days", DATA_CLASSES.knowledge_objects.retentionDays, argv);

  if (execute && !storage.v3StoreReady()) {
    console.error("ABBRUCH: --execute erfordert HELMUT_V3_STORE=1 + Supabase (v3StoreReady=false).");
    process.exit(2);
  }
  if (execute && !retentionExecuteEnabled()) {
    console.error("ABBRUCH: --execute erfordert zusätzlich HELMUT_RETENTION_EXECUTE=on (freigabepflichtig).");
    process.exit(2);
  }

  const meta = await loadMetadata().catch((e) => ({ available: false, reason: e && e.message }));
  if (!meta || meta.available !== true || meta.complete !== true || meta.metadataComplete !== true) {
    console.log(JSON.stringify({
      dryRun: !execute,
      available: false,
      metadataComplete: false,
      integrityOk: false,
      executable: false,
      reason: (meta && meta.reason) || "keine-daten",
      hinweis: "Trockenlauf benötigt einen vollständigen relationalen Metadatenabzug (v3StoreReady)."
    }, null, 2));
    process.exitCode = 2;
    return;
  }

  const plan = planRetention({
    nowMs: Date.now(),
    rawRetentionDays, koRetentionDays,
    metadataComplete: meta.metadataComplete,
    konsistenz: meta.konsistenz,
    metadataContract: meta.metadataContract,
    metadataCompleteness: meta.metadataCompleteness,
    rawDocuments: meta.rawDocuments,
    knowledgeObjects: meta.knowledgeObjects,
    koDocumentLinks: meta.koDocumentLinks
  });

  console.log(JSON.stringify({
    dryRun: !execute,
    rawRetentionDays, koRetentionDays,
    report: plan.report,
    metadataComplete: plan.metadataComplete,
    konsistenz: plan.konsistenz,
    integrityOk: plan.integrityOk,
    integrityScope: plan.integrityScope,
    executable: plan.executable,
    executionBlockReason: plan.executionBlockReason,
    errors: plan.errors
  }, null, 2));

  if (plan.metadataComplete !== true || plan.integrityOk !== true) {
    console.error("ABBRUCH: Metadaten oder interne Plausibilitätsprüfung sind unvollständig.");
    process.exitCode = 2;
    return;
  }

  if (!execute) {
    console.log("\n(TROCKENLAUF — keine Löschung. Der sequenzielle REST-Abzug ist nicht transaktional und daher bewusst nicht ausführbar. Eine künftige Ausführung braucht einen DB-seitig transaktionalen/sperrenden RPC oder belegten Schreibstopp plus atomare Referenzprüfung.)");
    return;
  }

  if (plan.executable !== true) {
    console.error(`ABBRUCH: Plan ist nur ein Trockenlauf (${plan.executionBlockReason || "kein-transaktionaler-ausfuehrungsbeleg"}).`);
    process.exitCode = 3;
    return;
  }

  // Defense in depth: Dieser Zweig ist mit dem heutigen Planner unerreichbar;
  // storage.deleteRetention verweigert zusätzlich jeden Plan konstruktiv.
  const result = await storage.deleteRetention(plan);
  if (!result || result.skipped === true) {
    console.error(`ABBRUCH: Retention-Executor hat nicht ausgeführt (${(result && result.reason) || "unbekannt"}).`);
    process.exitCode = 3;
    return;
  }
  console.log(JSON.stringify({ executed: true, ...result }, null, 2));
}

if (require.main === module) {
  main().catch((err) => { console.error("Fehler:", err && err.message); process.exitCode = 1; });
}

module.exports = { argPositiveInteger, loadMetadata, main };
