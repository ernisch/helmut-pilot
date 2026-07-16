"use strict";

// Datenschutz — Aufbewahrung/Löschung (Retention): Trockenlauf, Idempotenz,
// referenzielle Integrität. Test-Kategorien #11/#12/#13.
//
// Belegt für den reinen Retention-Planer (lib/helmut/retention.js):
//  * TROCKENLAUF: die Planung ändert nichts, meldet aber die betroffenen Datensätze.
//  * REFERENZIELLE INTEGRITÄT: ein raw_document, das noch an ein BEHALTENES KO
//    gebunden ist, wird NIE zur Löschung geplant (kein Provenienz-Verwaisen trotz
//    ON DELETE CASCADE).
//  * IDEMPOTENZ: nach simulierter Löschung liefert eine zweite Planung 0.
//  * Datenklassen-Matrix: politische Analyse als Art. 9 markiert.
//
// KEIN Netz/DB. Nur synthetische Daten.

const { planRetention, DATA_CLASSES, ageDays, retentionExecuteEnabled } = require("../lib/helmut/retention");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const NOW = Date.UTC(2026, 6, 16);
const daysAgo = (d) => new Date(NOW - d * 86400000).toISOString();

// Bestand:
//  rd-old-free   : 400 Tage alt, an KEIN KO gebunden        -> löschbar
//  rd-old-keptko : 400 Tage alt, an BEHALTENES KO gebunden  -> BLOCKIERT (Integrität)
//  rd-old-delko  : 400 Tage alt, nur an zu löschendes KO    -> löschbar
//  rd-fresh      : 10 Tage alt                              -> behalten
//  ko-old        : 400 Tage alt                             -> löschbar
//  ko-fresh      : 10 Tage alt (an rd-old-keptko gebunden)  -> behalten
const rawDocuments = [
  { id: "rd-old-free", created_at: daysAgo(400) },
  { id: "rd-old-keptko", created_at: daysAgo(400) },
  { id: "rd-old-delko", created_at: daysAgo(400) },
  { id: "rd-fresh", created_at: daysAgo(10) }
];
const knowledgeObjects = [
  { id: "ko-old", created_at: daysAgo(400) },
  { id: "ko-fresh", created_at: daysAgo(10) }
];
const koDocumentLinks = [
  { knowledge_object_id: "ko-fresh", raw_document_id: "rd-old-keptko" }, // behaltenes KO bindet altes Dok
  { knowledge_object_id: "ko-old", raw_document_id: "rd-old-delko" }     // zu löschendes KO
];

const plan = planRetention({ nowMs: NOW, rawRetentionDays: 180, koRetentionDays: 365, rawDocuments, knowledgeObjects, koDocumentLinks });

// ── Trockenlauf: Bericht über betroffene Datensätze ─────────────────────────
check("Bericht: Gesamtzahlen korrekt", plan.report.rawDocumentsTotal === 4 && plan.report.knowledgeObjectsTotal === 2);
check("KO-Löschung: nur überaltertes KO", plan.koToDelete.length === 1 && plan.koToDelete[0] === "ko-old");

// ── Referenzielle Integrität ────────────────────────────────────────────────
check("Integrität: rd-old-keptko NICHT gelöscht (an behaltenes KO gebunden)", !plan.rawToDelete.includes("rd-old-keptko"));
check("Integrität: als blockiert gemeldet", plan.rawBlockedByKeepReference.includes("rd-old-keptko"));
check("Löschbar: rd-old-free (ungebunden)", plan.rawToDelete.includes("rd-old-free"));
check("Löschbar: rd-old-delko (nur an zu löschendes KO)", plan.rawToDelete.includes("rd-old-delko"));
check("Behalten: rd-fresh (nicht überaltert)", !plan.rawToDelete.includes("rd-fresh"));
check("Integritätszusicherung integrityOk=true", plan.integrityOk === true);
check("Zusicherung: KEIN Löschkandidat an behaltenes KO gebunden",
  plan.rawToDelete.every((rid) => {
    const linkedKept = koDocumentLinks.filter((l) => l.raw_document_id === rid).some((l) => !plan.koToDelete.includes(l.knowledge_object_id));
    return !linkedKept;
  }));

// ── Idempotenz: nach simulierter Löschung -> zweiter Lauf 0 ──────────────────
const rawAfter = rawDocuments.filter((d) => !plan.rawToDelete.includes(d.id));
const koAfter = knowledgeObjects.filter((k) => !plan.koToDelete.includes(k.id));
const linksAfter = koDocumentLinks.filter((l) => !plan.koToDelete.includes(l.knowledge_object_id) && !plan.rawToDelete.includes(l.raw_document_id));
const plan2 = planRetention({ nowMs: NOW, rawRetentionDays: 180, koRetentionDays: 365, rawDocuments: rawAfter, knowledgeObjects: koAfter, koDocumentLinks: linksAfter });
check("Idempotenz: zweiter Lauf 0 KO-Löschungen", plan2.koToDelete.length === 0);
// rd-old-keptko bleibt (an behaltenes ko-fresh gebunden) -> weiterhin blockiert, NICHT gelöscht.
check("Idempotenz: zweiter Lauf löscht kein behaltenes-referenziertes Dokument", !plan2.rawToDelete.includes("rd-old-keptko"));
check("Idempotenz: keine bereits gelöschten Kandidaten erneut", !plan2.rawToDelete.includes("rd-old-free") && !plan2.rawToDelete.includes("rd-old-delko"));

// ── Datenklassen-Matrix ─────────────────────────────────────────────────────
check("Matrix: knowledge_objects als Art. 9 (politische Analyse)", DATA_CLASSES.knowledge_objects.art9 === true);
check("Matrix: raw_documents Retention 180 Tage", DATA_CLASSES.raw_documents.retentionDays === 180);
check("Matrix: technische Telemetrie 90 Tage", DATA_CLASSES.source_crawl_telemetry.retentionDays === 90);
check("Matrix: Provenienz kaskadiert (keine eigene Retention)", DATA_CLASSES.ko_document_links.retentionDays === null);

// ── Ausführung default AUS ──────────────────────────────────────────────────
delete process.env.HELMUT_RETENTION_EXECUTE;
check("Löschung default AUS (freigabepflichtig)", retentionExecuteEnabled() === false);
check("ageDays korrekt", Math.round(ageDays(daysAgo(30), NOW)) === 30);

console.log(`\n${passed}/${passed + failed} Retention-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
