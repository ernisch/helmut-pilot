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

// BELEGTER ANLASS (Production 2026-08-30): `Number(null) === 0`. Die alte Fassung
// `Number.isFinite(Number(v)) ? Number(v) : null` machte deshalb aus einem NICHT
// uebergebenen Zaehler eine harte 0 in der relationalen Zeile — `saved_count`,
// `skipped_count` und `failed_count` standen an jedem Lauf des 30.08. auf 0, obwohl
// kein Lauf diese Aussage je gemacht hatte. Eine unbekannte Menge ist keine gemessene
// Null (CLAUDE.md §4.4). `motor-health.js` fuehrt diese Unterscheidung bereits richtig
// (dort haengt `zaehlbar` daran, ob ein Wert null IST); beide Helfer sind jetzt gleich.
const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
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

// --- W-2 (Werkzeug-Haertung 2026-07-27) — Prozess-Lauftelemetrie ------------
// Projektion eines sanitisierten processRuns-Eintrags (Auth-Blob) auf eine
// Zeile der relationalen Tabelle public.process_runs — und zurueck. Gleiches
// Muster wie crawl_runs oben; ausschliesslich technische Skalare/Zaehler.

// Kanonische Zustaende (CHECK-Constraint der Tabelle). Die historischen
// Blob-Werte werden abgebildet: "ok" -> success, "skipped" -> blocked (ein
// uebersprungener Lauf ist ein durch Budget/Lock/Flag BLOCKIERTER Lauf).
// Unbekannte Werte werden NICHT stillschweigend umgedeutet — sie laufen in den
// CHECK-Constraint und werden damit als sichtbarer Telemetriefehler abgewiesen.
const PROCESS_RUN_STATUS = ["running", "success", "partial", "failed", "blocked", "rolled_back"];

function canonicalProcessRunStatus(status) {
  const s = String(status == null ? "" : status).trim().toLowerCase();
  if (PROCESS_RUN_STATUS.includes(s)) return s;
  if (s === "ok") return "success";
  if (s === "skipped") return "blocked";
  // Historische Sonderwerte des Morgenbriefing-Crons (vor der Werkzeug-Haertung):
  if (s === "error") return "failed";
  if (s === "empty") return "success"; // erfolgreicher Leerlauf — reason traegt den Grund
  return s; // bewusst unveraendert -> CHECK-Constraint weist ab (sichtbar)
}

function processRunToRelationalRow(run = {}) {
  // Telemetrie-Zaehler als EIN jsonb-Feld (nur die bereits sanitisierten
  // Skalare/Zaehlerkarten aus sanitizeProcessRun — kein Text, keine PII).
  const telemetrie = {};
  for (const k of ["cluster", "dokumente", "dokumenteOhneEndzustand", "vorgemerkt", "grossereignisse", "ergebnisse", "gruppen", "aufloesungen", "auffaelligkeitenGesamt",
    // OP-30 Warteschlangenslot-Quittung (Option D, 2026-08-19): Slot-Zaehler.
    "wiederholt", "leaseVerloren", "geplant", "neuGeplant", "spiegelGesammelt", "spiegelGeschrieben",
    // Rueckstandsschleife (Kapazitätssprint 2026-08-31): Waechterwerte + Wieder-
    // vorlage-Zaehler — von sanitizeProcessRun bereits auf Zahlen begrenzt. Ohne
    // diesen Schluessel verwarf die Projektion den Block still (belegt am ersten
    // natuerlichen Lauf 31.08. 11:30 UTC).
    "rueckstand"]) {
    if (run[k] != null) telemetrie[k] = run[k];
  }
  return {
    run_id: str(run.runId, 80),
    process: str(run.process, 40) || "unknown",
    status: str(canonicalProcessRunStatus(run.status), 40),
    mode: str(run.mode, 24),
    location: str(run.location, 40),
    started_at: str(run.startedAt, 40),
    finished_at: str(run.finishedAt, 40),
    created_at: str(run.createdAt, 40),
    duration_ms: num(run.durationMs),
    target_count: num(run.zielmenge),
    processed_count: num(run.processed),
    saved_count: num(run.gespeichert),
    skipped_count: num(run.uebersprungen),
    failed_count: num(run.fehlgeschlagen),
    deferred_count: num(run.deferred),
    skipped_store_count: num(run.skippedStore),
    reason: str(run.reason, 120),
    error_class: str(run.fehlerklasse, 40),
    backend: str(run.backend, 24),
    commit_ref: str(run.commit, 40),
    run_id_derived: Boolean(run.runIdAbgeleitet),
    telemetrie: Object.keys(telemetrie).length ? telemetrie : null
  };
}

// Rueckabbildung fuer den Dual-Read: eine relationale Zeile in der Form, die
// bestehende Leser (Admin-API, Kostenreport, Vorgangsbildungs-Kennzahlen)
// vom Blob kennen. Der Status bleibt kanonisch (success statt ok) — das ist
// eine dokumentierte, rein darstellende Abweichung.
function relationalRowToProcessRun(row = {}) {
  const t = row.telemetrie && typeof row.telemetrie === "object" ? row.telemetrie : {};
  return {
    process: row.process || "unknown",
    runId: row.run_id || null,
    mode: row.mode ?? null,
    location: row.location ?? null,
    startedAt: row.started_at ?? null,
    finishedAt: row.finished_at ?? null,
    durationMs: num(row.duration_ms),
    processed: num(row.processed_count),
    deferred: num(row.deferred_count),
    skippedStore: num(row.skipped_store_count),
    reason: row.reason ?? null,
    status: row.status || "success",
    cluster: num(t.cluster),
    dokumente: num(t.dokumente),
    dokumenteOhneEndzustand: num(t.dokumenteOhneEndzustand),
    vorgemerkt: num(t.vorgemerkt),
    grossereignisse: num(t.grossereignisse),
    ergebnisse: t.ergebnisse || null,
    gruppen: t.gruppen || null,
    aufloesungen: t.aufloesungen || null,
    auffaelligkeitenGesamt: num(t.auffaelligkeitenGesamt),
    // OP-30 Warteschlangenslot-Quittung (Option D, 2026-08-19): Slot-Zaehler zurueckbilden.
    wiederholt: num(t.wiederholt),
    leaseVerloren: num(t.leaseVerloren),
    geplant: num(t.geplant),
    neuGeplant: num(t.neuGeplant),
    spiegelGesammelt: num(t.spiegelGesammelt),
    spiegelGeschrieben: num(t.spiegelGeschrieben),
    // Rueckstandsschleife (2026-08-31): Waechterblock zurueckbilden (Dual-Read-Paritaet).
    ...(t.rueckstand && typeof t.rueckstand === "object" ? { rueckstand: t.rueckstand } : {}),
    zielmenge: num(row.target_count),
    gespeichert: num(row.saved_count),
    uebersprungen: num(row.skipped_count),
    fehlgeschlagen: num(row.failed_count),
    fehlerklasse: row.error_class ?? null,
    backend: row.backend ?? null,
    commit: row.commit_ref ?? null,
    ...(row.run_id_derived ? { runIdAbgeleitet: true } : {}),
    createdAt: row.created_at ?? null,
    quelle: "relational"
  };
}

// Vergleich beider Repraesentationen (Grundlage des Dual-Write-Vergleichstests,
// Muster compareCrawlRunProjection): Projektion -> Rueckabbildung muss in allen
// technischen Feldern mit dem sanitisierten Original uebereinstimmen.
function compareProcessRunProjection(blobRun = {}, relationalRow = {}) {
  const projected = processRunToRelationalRow(blobRun);
  const diffs = [];
  for (const key of Object.keys(projected)) {
    const a = projected[key];
    const b = relationalRow[key];
    if (a == null && b == null) continue;
    if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push({ field: key, projected: a, relational: b });
  }
  return { equal: diffs.length === 0, diffs };
}

function processRunsRelationalEnabled(env = process.env) {
  const v = String((env && env.HELMUT_PROCESS_RUNS_RELATIONAL) || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

module.exports = {
  crawlRunToRelationalRow,
  compareCrawlRunProjection,
  crawlRunsRelationalEnabled,
  PROCESS_RUN_STATUS,
  canonicalProcessRunStatus,
  processRunToRelationalRow,
  relationalRowToProcessRun,
  compareProcessRunProjection,
  processRunsRelationalEnabled
};
