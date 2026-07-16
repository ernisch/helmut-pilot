"use strict";

// P0-5 Stufe 2 (VORBEREITUNG) — Vergleichstest der Blob->Relational-Projektion.
//
// Belegt den Kern des Dual-Write-Übergangs: die relationale crawl_runs-Zeile ist
// eine verlustfreie Projektion des (verdichteten) Blob-crawlRun in allen
// technischen Zähl-/Skalarfeldern; Datensparsamkeit bleibt gewahrt (nur error_count,
// kein Fehler-Array/Rohtext, kein Volltext). Der Dual-Write ist DEFAULT AUS.
//
// KEIN Netz/DB. Nur synthetische Daten.

const { crawlRunToRelationalRow, compareCrawlRunProjection, crawlRunsRelationalEnabled } = require("../lib/helmut/blob-relational");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const blobRun = {
  runId: "crawl-20260716T040300-abcde",
  createdAt: "2026-07-16T04:03:48.000Z",
  mode: "full",
  politicianId: "cem-ince",
  durationMs: 48231,
  sourceMode: "on",
  checkedSources: 145,
  successfulSources: 145,
  failedSources: 0,
  newCandidateItems: 1012,
  savedItems: 55,
  loadedItems: 2300,
  discardedItems: 1288,
  duplicates: 957,
  googleUrlResolution: { attempted: 40, resolved: 38 },
  understanding: { processed: 7, deferred: 3, reason: "budget" },
  // Fehler-ARRAY mit sourceName/error — darf NICHT in die relationale Zeile wandern.
  errors: [{ sourceName: "Quelle A", error: "503" }, { sourceName: "Quelle B", error: "timeout" }],
  // Fremdfeld, das die Projektion ignorieren muss:
  briefingText: "VERTRAULICH voller Text"
};

const row = crawlRunToRelationalRow(blobRun);
check("run_id projiziert", row.run_id === "crawl-20260716T040300-abcde");
check("durationMs projiziert", row.duration_ms === 48231);
check("sourceMode projiziert", row.source_mode === "on");
check("Durchfluss-Zähler projiziert", row.new_candidate_items === 1012 && row.saved_items === 55 && row.loaded_items === 2300);
check("google_url attempted/resolved projiziert", row.google_url_attempted === 40 && row.google_url_resolved === 38);
check("understanding-Zähler projiziert", row.understanding_processed === 7 && row.understanding_deferred === 3 && row.understanding_reason === "budget");
check("error_count = Länge des Fehler-Arrays", row.error_count === 2);

// ── Datensparsamkeit ───────────────────────────────────────────────────────
check("KEIN Fehler-Array in der relationalen Zeile", !("errors" in row));
check("KEIN Fremd-/Volltext-Feld projiziert", !("briefingText" in row));
check("Serialisat enthält keinen Volltext/keine sourceName-Rohdaten",
  !JSON.stringify(row).includes("VERTRAULICH") && !JSON.stringify(row).includes("Quelle A"));

// ── Vergleichsfunktion: identische Projektion -> equal ─────────────────────
const identical = compareCrawlRunProjection(blobRun, crawlRunToRelationalRow(blobRun));
check("Vergleich: identische Projektion ist gleich", identical.equal === true && identical.diffs.length === 0);

// ── Vergleichsfunktion: Abweichung wird erkannt ────────────────────────────
const tampered = { ...crawlRunToRelationalRow(blobRun), saved_items: 999 };
const cmp = compareCrawlRunProjection(blobRun, tampered);
check("Vergleich: Abweichung erkannt", cmp.equal === false && cmp.diffs.some((d) => d.field === "saved_items"));

// ── Dual-Write ist DEFAULT AUS ─────────────────────────────────────────────
delete process.env.HELMUT_CRAWL_RUNS_RELATIONAL;
check("Dual-Write default AUS", crawlRunsRelationalEnabled() === false);
check("Dual-Write mit Flag AN", crawlRunsRelationalEnabled({ HELMUT_CRAWL_RUNS_RELATIONAL: "on" }) === true);

console.log(`\n${passed}/${passed + failed} Crawl-Run-Projektions-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
