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

const {
  planRetention,
  DATA_CLASSES,
  RETENTION_METADATA_CONTRACT,
  RETENTION_PAGINATION_PROOF,
  RETENTION_REST_CONSISTENCY,
  ageDays,
  retentionExecuteEnabled
} = require("../lib/helmut/retention");
const { argPositiveInteger } = require("./retention-dryrun");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const NOW = Date.UTC(2026, 6, 16);
const daysAgo = (d) => new Date(NOW - d * 86400000).toISOString();

function completeMetadata({ rawDocuments = [], knowledgeObjects = [], koDocumentLinks = [] } = {}) {
  const proof = (rows) => ({
    complete: true,
    terminalPage: true,
    truncated: false,
    pagination: RETENTION_PAGINATION_PROOF,
    rows: rows.length,
    pages: 1,
    pageSize: Math.max(1, rows.length + 1),
    terminalPageRows: rows.length
  });
  return {
    metadataComplete: true,
    konsistenz: RETENTION_REST_CONSISTENCY,
    metadataContract: RETENTION_METADATA_CONTRACT,
    metadataCompleteness: {
      rawDocuments: proof(rawDocuments),
      knowledgeObjects: proof(knowledgeObjects),
      koDocumentLinks: proof(koDocumentLinks)
    },
    rawDocuments,
    knowledgeObjects,
    koDocumentLinks
  };
}

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

const plan = planRetention({
  nowMs: NOW,
  rawRetentionDays: 180,
  koRetentionDays: 365,
  ...completeMetadata({ rawDocuments, knowledgeObjects, koDocumentLinks })
});

// ── Trockenlauf: Bericht über betroffene Datensätze ─────────────────────────
check("Bericht: Gesamtzahlen korrekt", plan.report.rawDocumentsTotal === 4 && plan.report.knowledgeObjectsTotal === 2);
check("KO-Löschung: nur überaltertes KO", plan.koToDelete.length === 1 && plan.koToDelete[0] === "ko-old");

// ── Referenzielle Integrität ────────────────────────────────────────────────
check("Integrität: rd-old-keptko NICHT gelöscht (an behaltenes KO gebunden)", !plan.rawToDelete.includes("rd-old-keptko"));
check("Integrität: als blockiert gemeldet", plan.rawBlockedByKeepReference.includes("rd-old-keptko"));
check("Löschbar: rd-old-free (ungebunden)", plan.rawToDelete.includes("rd-old-free"));
check("Löschbar: rd-old-delko (nur an zu löschendes KO)", plan.rawToDelete.includes("rd-old-delko"));
check("Behalten: rd-fresh (nicht überaltert)", !plan.rawToDelete.includes("rd-fresh"));
check("Interne Plausibilitätsprüfung integrityOk=true", plan.integrityOk === true);
check("Formal vollständiger REST-Plan bleibt wegen Page-Shift/TOCTOU nur Trockenlauf",
  plan.konsistenz === "sequenziell-rest-nicht-transaktional"
  && plan.integrityOk === true
  && plan.integrityScope.includes("interne-plausibilitaet")
  && plan.executable === false
  && plan.dryRunOnly === true
  && plan.executionBlockReason.includes("page-shift"));
check("Zusicherung: KEIN Löschkandidat an behaltenes KO gebunden",
  plan.rawToDelete.every((rid) => {
    const linkedKept = koDocumentLinks.filter((l) => l.raw_document_id === rid).some((l) => !plan.koToDelete.includes(l.knowledge_object_id));
    return !linkedKept;
  }));

// ── Idempotenz: nach simulierter Löschung -> zweiter Lauf 0 ──────────────────
const rawAfter = rawDocuments.filter((d) => !plan.rawToDelete.includes(d.id));
const koAfter = knowledgeObjects.filter((k) => !plan.koToDelete.includes(k.id));
const linksAfter = koDocumentLinks.filter((l) => !plan.koToDelete.includes(l.knowledge_object_id) && !plan.rawToDelete.includes(l.raw_document_id));
const plan2 = planRetention({
  nowMs: NOW,
  rawRetentionDays: 180,
  koRetentionDays: 365,
  ...completeMetadata({ rawDocuments: rawAfter, knowledgeObjects: koAfter, koDocumentLinks: linksAfter })
});
check("Idempotenz: zweiter Lauf 0 KO-Löschungen", plan2.koToDelete.length === 0);
// rd-old-keptko bleibt (an behaltenes ko-fresh gebunden) -> weiterhin blockiert, NICHT gelöscht.
check("Idempotenz: zweiter Lauf löscht kein behaltenes-referenziertes Dokument", !plan2.rawToDelete.includes("rd-old-keptko"));
check("Idempotenz: keine bereits gelöschten Kandidaten erneut", !plan2.rawToDelete.includes("rd-old-free") && !plan2.rawToDelete.includes("rd-old-delko"));

// ── Datenklassen-Matrix ─────────────────────────────────────────────────────
check("Matrix: knowledge_objects als Art. 9 (politische Analyse)", DATA_CLASSES.knowledge_objects.art9 === true);
check("Matrix: raw_documents Retention 180 Tage", DATA_CLASSES.raw_documents.retentionDays === 180);
check("Matrix: technische Telemetrie 90 Tage", DATA_CLASSES.source_crawl_telemetry.retentionDays === 90);
check("Matrix: Provenienz kaskadiert (keine eigene Retention)", DATA_CLASSES.ko_document_links.retentionDays === null);
check("Matrix: neue Auftrags-/Outboxklassen dokumentiert, aber nicht im Retention-Executor aktiviert",
  DATA_CLASSES.helmut_jobs.loeschung.includes("getrennter-pfad")
  && DATA_CLASSES.helmut_job_outbox.loeschung.includes("getrennter-pfad"));
check("Matrix: neue Lease-/CAS-/Anbieterklassen ohne blinden Alterspurge dokumentiert",
  DATA_CLASSES.helmut_klassen_slots.retentionDays === null
  && DATA_CLASSES.helmut_verstehen_reservierungen.retentionDays === null
  && DATA_CLASSES.helmut_anbieter_schutzschalter.retentionDays === null);

// ── Adversarial: Fristen und unvollständige Metadaten fail closed ───────────
const validMetadata = completeMetadata({ rawDocuments, knowledgeObjects, koDocumentLinks });
const invalidDeadlines = [-1, 0, null, true, false, "180", NaN, Infinity, 1.5, undefined];
for (const value of invalidDeadlines) {
  const adverse = planRetention({ nowMs: NOW, rawRetentionDays: value, koRetentionDays: 365, ...validMetadata });
  check(`Frist fail closed: rawRetentionDays=${String(value)}`,
    adverse.integrityOk === false && adverse.executable === false
    && adverse.rawToDelete.length === 0 && adverse.koToDelete.length === 0);
}
for (const value of [null, true, "365", -1]) {
  const adverse = planRetention({ nowMs: NOW, rawRetentionDays: 180, koRetentionDays: value, ...validMetadata });
  check(`Frist fail closed: koRetentionDays=${String(value)}`,
    adverse.integrityOk === false && adverse.executable === false
    && adverse.rawToDelete.length === 0 && adverse.koToDelete.length === 0);
}

const defaultsOnlyWhenAbsent = planRetention({ nowMs: NOW, ...validMetadata });
check("Fristdefaults gelten nur bei abwesenden Feldern",
  defaultsOnlyWhenAbsent.integrityOk === true
  && defaultsOnlyWhenAbsent.rawRetentionDays === 180
  && defaultsOnlyWhenAbsent.koRetentionDays === 365);

const forgedExecutionBooleans = planRetention({
  nowMs: NOW,
  ...validMetadata,
  integrityOk: true,
  executable: true,
  dryRunOnly: false
});
check("Selbst gesetzte Ausführungs-Booleans öffnen den REST-Plan nicht",
  forgedExecutionBooleans.integrityOk === true
  && forgedExecutionBooleans.executable === false
  && forgedExecutionBooleans.dryRunOnly === true);

const missingConsistency = { ...validMetadata };
delete missingConsistency.konsistenz;
const missingConsistencyPlan = planRetention({ nowMs: NOW, ...missingConsistency });
check("Fehlender Konsistenzbeleg blockiert fail closed",
  missingConsistencyPlan.integrityOk === false
  && missingConsistencyPlan.executable === false
  && missingConsistencyPlan.rawToDelete.length === 0);

const metadataWithoutLinks = { ...validMetadata };
delete metadataWithoutLinks.koDocumentLinks;
const missingLinksPlan = planRetention({ nowMs: NOW, ...metadataWithoutLinks });
check("Fehlende Linkmenge wird nicht als leer interpretiert",
  missingLinksPlan.integrityOk === false && missingLinksPlan.executable === false
  && missingLinksPlan.rawToDelete.length === 0 && missingLinksPlan.koToDelete.length === 0);

const incompleteMarker = planRetention({ nowMs: NOW, ...validMetadata, metadataComplete: false });
check("Unvollständigkeitsmarker blockiert den gesamten Löschplan",
  incompleteMarker.metadataComplete === false && incompleteMarker.integrityOk === false
  && incompleteMarker.executable === false && incompleteMarker.rawToDelete.length === 0);

const limitedProofInput = completeMetadata({ rawDocuments, knowledgeObjects, koDocumentLinks });
limitedProofInput.metadataCompleteness = {
  ...limitedProofInput.metadataCompleteness,
  rawDocuments: {
    ...limitedProofInput.metadataCompleteness.rawDocuments,
    terminalPage: false,
    truncated: true
  }
};
const limitedProofPlan = planRetention({ nowMs: NOW, ...limitedProofInput });
check("Hart begrenzter Abzug ohne terminale Seite gibt keinen Löschplan frei",
  limitedProofPlan.integrityOk === false && limitedProofPlan.executable === false
  && limitedProofPlan.rawToDelete.length === 0 && limitedProofPlan.koToDelete.length === 0);

const malformedLinkMetadata = completeMetadata({
  rawDocuments,
  knowledgeObjects,
  koDocumentLinks: [{ raw_document_id: "rd-old-free" }]
});
const malformedLinkPlan = planRetention({ nowMs: NOW, ...malformedLinkMetadata });
check("Unvollständige Linkzeile blockiert fail closed",
  malformedLinkPlan.integrityOk === false && malformedLinkPlan.executable === false
  && malformedLinkPlan.rawToDelete.length === 0);

const unknownLinkMetadata = completeMetadata({
  rawDocuments,
  knowledgeObjects,
  koDocumentLinks: [{ raw_document_id: "rd-old-free", knowledge_object_id: "ko-nicht-geladen" }]
});
const unknownLinkPlan = planRetention({ nowMs: NOW, ...unknownLinkMetadata });
check("Link auf nicht geladenes KO entlarvt unvollständigen Abzug",
  unknownLinkPlan.integrityOk === false && unknownLinkPlan.executable === false);

const invalidTimestampMetadata = completeMetadata({
  rawDocuments: [{ id: "rd-kaputt", created_at: null }],
  knowledgeObjects: [],
  koDocumentLinks: []
});
const invalidTimestampPlan = planRetention({ nowMs: NOW, ...invalidTimestampMetadata });
check("Ungültiger Metadaten-Zeitstempel blockiert fail closed",
  invalidTimestampPlan.integrityOk === false && invalidTimestampPlan.executable === false);

for (const raw of ["null", "true", "false", "-1", "0", "1.5", "1e2", "", " 180"] ) {
  let rejected = false;
  try { argPositiveInteger("raw-days", 180, ["node", "script", `--raw-days=${raw}`]); }
  catch (_) { rejected = true; }
  check(`CLI-Frist ohne Typkonvertierung abgelehnt: ${JSON.stringify(raw)}`, rejected);
}

// ── Ausführung default AUS ──────────────────────────────────────────────────
delete process.env.HELMUT_RETENTION_EXECUTE;
check("Löschung default AUS (freigabepflichtig)", retentionExecuteEnabled() === false);
check("ageDays korrekt", Math.round(ageDays(daysAgo(30), NOW)) === 30);

console.log(`\n${passed}/${passed + failed} Retention-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
