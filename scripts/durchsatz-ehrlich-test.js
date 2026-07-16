"use strict";

// P1-5 — Ehrlicher Durchsatz: echte relationale raw_documents-Deltas.
//
// Belegt:
//  * compactStore erhält newRawDocuments (relationaler Delta) + die Durchfluss-
//    Zähler (loadedItems/discardedItems/duplicates/sourcesByCategory) — vorher
//    gestrippt; ohne Persistenz keine ehrliche Reporting-Grundlage.
//  * Der ehrliche Durchsatz (newRawDocuments) ist unabhängig vom cap-verzerrten
//    Blob-Zähler savedItems (Audit R8: ~15x Überzeichnung).
//  * Datensparsamkeit bleibt gewahrt (nur Skalare/Kategorie-Zähler).
//
// KEIN Netz/DB. Nur synthetische Daten.

const { compactCrawlRunForStore } = require("../lib/helmut/storage");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// Realistischer Lauf: 145 Quellen, blob-savedItems 900 (überzeichnet), aber nur
// 55 ECHTE neue raw_documents (relationaler Delta) — genau die Audit-Diskrepanz.
const run = compactCrawlRunForStore({
  mode: "full", createdAt: "2026-07-16T04:03:00.000Z",
  checkedSources: 145, successfulSources: 145, failedSources: 0,
  newCandidateItems: 1012,
  savedItems: 900,            // blob-cap-verzerrt
  newRawDocuments: 55,        // ehrlicher relationaler Delta
  loadedItems: 2300, discardedItems: 1288, duplicates: 957,
  sourcesByCategory: { offiziell: { checked: 40, ok: 40, failed: 0 }, medien: { checked: 60, ok: 58, failed: 2 } }
});

check("newRawDocuments erhalten (ehrlicher Delta)", run.newRawDocuments === 55);
check("savedItems erhalten (blob, transparent)", run.savedItems === 900);
check("ehrlicher Delta != blob-Zähler (Überzeichnung sichtbar)", run.newRawDocuments !== run.savedItems && run.newRawDocuments < run.savedItems);
check("loadedItems erhalten", run.loadedItems === 2300);
check("discardedItems erhalten", run.discardedItems === 1288);
check("duplicates erhalten", run.duplicates === 957);
check("sourcesByCategory erhalten", run.sourcesByCategory && run.sourcesByCategory.medien.failed === 2);

// null-Delta (relationaler Pfad lief nicht) -> ehrlich null (nicht 0, nicht savedItems)
const runNoRel = compactCrawlRunForStore({ createdAt: "2026-07-16T04:03:00.000Z", savedItems: 900, newRawDocuments: null });
check("unbekannter Delta -> null (nicht still auf savedItems ausweichen)", runNoRel.newRawDocuments === null);

// Datensparsamkeit: keine Inhalte/Fremdfelder
const dirty = compactCrawlRunForStore({ createdAt: "x", newRawDocuments: 5, briefingText: "GEHEIM", sourcesByCategory: "kaputt" });
check("kein Fremd-/Volltext-Feld", !("briefingText" in dirty));
check("sourcesByCategory nicht-Objekt -> null", dirty.sourcesByCategory === null);
check("kein Volltext im Serialisat", !JSON.stringify(dirty).includes("GEHEIM"));

console.log(`\n${passed}/${passed + failed} Durchsatz-Ehrlich-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
