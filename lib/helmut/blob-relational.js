"use strict";

// P0-5 Stufe 2 (VORBEREITUNG) — Blob->Relational-Projektion fuer Crawl-Läufe.
// ============================================================================
// Reine, testbare Abbildung eines (verdichteten) Blob-crawlRun auf eine Zeile der
// relationalen Tabelle public.crawl_runs. Diese Projektion ist der Kern des
// Dual-Write-Übergangs (Phase 2): beim Schreiben eines Crawl-Laufs entsteht aus
// EINEM Blob-Objekt EINE relationale Zeile — der Vergleichstest belegt die
// Äquivalenz beider Repräsentationen.
//
// DSGVO: nur technische Skalare/Zähler + pseudonyme Mandatskennung. Der Fehler-
// ARRAY des Blobs wird bewusst NICHT übernommen — nur seine ANZAHL (error_count).
// Kein Dokumentinhalt, kein Roh-Fehlertext.

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v, max) => (v == null ? null : String(v).slice(0, max));

function crawlRunToRelationalRow(run = {}) {
  const gnr = run.googleUrlResolution && typeof run.googleUrlResolution === "object" ? run.googleUrlResolution : {};
  const u = run.understanding && typeof run.understanding === "object" ? run.understanding : {};
  return {
    run_id: str(run.runId, 80),
    created_at: str(run.createdAt, 40),
    mode: str(run.mode, 24),
    politician_id: str(run.politicianId, 80),
    duration_ms: num(run.durationMs),
    source_mode: str(run.sourceMode, 24),
    checked_sources: num(run.checkedSources),
    successful_sources: num(run.successfulSources),
    failed_sources: num(run.failedSources),
    new_candidate_items: num(run.newCandidateItems),
    saved_items: num(run.savedItems),
    loaded_items: num(run.loadedItems),
    discarded_items: num(run.discardedItems),
    duplicates: num(run.duplicates),
    google_url_attempted: num(gnr.attempted),
    google_url_resolved: num(gnr.resolved),
    understanding_processed: num(u.processed),
    understanding_deferred: num(u.deferred),
    understanding_reason: str(u.reason, 120),
    // NUR die Anzahl der Quellenfehler — nie der Fehler-Array/Rohtext.
    error_count: Array.isArray(run.errors) ? run.errors.length : num(run.error_count) || 0
  };
}

// Vergleich: stimmt die relationale Zeile mit dem Blob-Objekt in allen
// gemeinsamen Zähl-/Skalarfeldern überein? Liefert { equal, diffs } — Grundlage
// des Dual-Write-Vergleichstests (Phase 2). Prüft NUR technische Felder.
function compareCrawlRunProjection(blobRun = {}, relationalRow = {}) {
  const projected = crawlRunToRelationalRow(blobRun);
  const diffs = [];
  for (const key of Object.keys(projected)) {
    const a = projected[key];
    const b = relationalRow[key];
    // null == null; Zahlen/Strings exakt.
    if ((a == null && b == null)) continue;
    if (a !== b) diffs.push({ field: key, projected: a, relational: b });
  }
  return { equal: diffs.length === 0, diffs };
}

function crawlRunsRelationalEnabled(env = process.env) {
  const v = String((env && env.HELMUT_CRAWL_RUNS_RELATIONAL) || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

module.exports = {
  crawlRunToRelationalRow,
  compareCrawlRunProjection,
  crawlRunsRelationalEnabled
};
