"use strict";

// P0-1 — Pro-Quellenabruf-Telemetrie (Beobachtbarkeit fuer den ueberwachten Piloten).
// ============================================================================
// Baut je EINZELNEM Quellenabruf eine strenge ALLOWLIST technischer Metadaten und
// persistiert sie in eine NEUE relationale Tabelle (public.source_crawl_telemetry) —
// bewusst NICHT in den grossen 1,24-MB-Blob (Audit R1, Timeout-Quelle).
//
// DSGVO / Datensparsamkeit (verbindliches Abnahmekriterium):
//  - NIEMALS Dokumentinhalte, Titel, Volltext, Briefingtexte, Namen, E-Mail,
//    Telefon oder Prompts. Nur IDs, Zaehler, Zeitstempel, Statuscodes.
//  - Quellennamen sind oeffentliche Organisationsnamen (Ministerien, Medien,
//    Fraktionen) — keine personenbezogenen Kontaktdaten.
//  - Fehler werden zu einem KLASSIFIZIERTEN Code verdichtet; der rohe
//    Fehlertext (der eine aufgeloeste Publisher-URL enthalten koennte) wird
//    NICHT gespeichert.
//
// FREIGABEPFLICHTIG: Der Write ist DEFAULT AUS (HELMUT_SOURCE_TELEMETRY) und die
// Migration ist NICHT auf Production angewendet. Ohne beides ist persist ein
// reiner No-Op (kein Production-Daten-Write). Der Row-Builder ist rein und wird
// unabhaengig getestet.

// Klassifiziert einen rohen Crawl-/Fetch-Fehler zu einem stabilen, inhaltsfreien
// Code. Der rohe Text wird bewusst verworfen (koennte URLs/Fragmente enthalten).
function classifyCrawlError(message) {
  const m = String(message || "").toLowerCase();
  if (!m) return null;
  if (m.includes("timed out") || m.includes("timeout") || m.includes("aborterror") || m.includes("aborted")) return "timeout";
  if (m.includes("empty feed")) return "empty-feed";
  if (/\b(429)\b/.test(m)) return "http-429";
  if (/\b(4\d\d)\b/.test(m)) return "http-4xx";
  if (/\b(5\d\d)\b/.test(m)) return "http-5xx";
  if (m.includes("enotfound") || m.includes("dns") || m.includes("getaddrinfo")) return "dns";
  if (m.includes("econnrefused") || m.includes("econnreset") || m.includes("socket")) return "connection";
  if (m.includes("certificate") || m.includes("tls") || m.includes("ssl")) return "tls";
  if (m.includes("too large") || m.includes("response too")) return "response-too-large";
  if (m.includes("parse") || m.includes("json") || m.includes("xml")) return "parse";
  return "unknown";
}

// Normalisiert die politische Ebene klein (P1-2-Kanon: 'bund' statt 'Bund').
function normalizeLevel(value) {
  const v = String(value || "").trim().toLowerCase();
  return v || "unknown";
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const str = (v, max) => (v == null ? null : String(v).slice(0, max));

// Baut die Telemetrie-Zeilen (eine je Quellenabruf). Alle Ableitungen sind
// ECHT gemessen (keine Schaetzung): foundDocuments = crawlSource-Ergebnis;
// duplicate/ignored = in-Lauf-Dedup/Cap (ueber item.sourceId exakt zugeordnet);
// newDocuments = tatsaechlich neu persistierte savedItems dieser Quelle.
function buildSourceTelemetryRows(opts = {}) {
  const {
    runId = null,
    plannedProcess = null,
    followUpProcess = null,
    sourceMode = null,
    location = null,
    results = [],
    sourcesById = {},
    defaultLevel = "unknown",
    newBySource = {},
    retryBySource = {}
  } = opts;

  const nb = newBySource instanceof Map ? newBySource : new Map(Object.entries(newBySource || {}));
  const rb = retryBySource instanceof Map ? retryBySource : new Map(Object.entries(retryBySource || {}));

  return (Array.isArray(results) ? results : []).map((r) => {
    const src = (sourcesById && sourcesById[r.sourceId]) || {};
    const found = num(r.itemCount);
    const duplicates = num(r.duplicateItems);
    const ignored = num(r.ignoredItems);
    const fresh = num(nb.get(r.sourceId) || nb.get(String(r.sourceId)) || 0);
    return {
      run_id: str(runId, 80),
      source_id: str(r.sourceId, 120),
      source_name: str(r.sourceName || src.name, 200),
      source_category: str(src.category || null, 40),
      political_level: normalizeLevel(src.politicalLevel || src.level || defaultLevel),
      execution_location: str(location, 40),
      planned_process: str(plannedProcess, 40),
      started_at: str(r.startedAt, 40),
      finished_at: str(r.finishedAt, 40),
      duration_ms: num(r.durationMs),
      status: str(r.status || (r.ok ? "ok" : "error"), 24),
      found_documents: found,
      new_documents: fresh,
      duplicate_documents: duplicates,
      ignored_documents: ignored,
      error_code: r.ok ? null : classifyCrawlError(r.error),
      retry_count: num(rb.get(r.sourceId) || rb.get(String(r.sourceId)) || 0),
      follow_up_process: str(followUpProcess, 40),
      source_mode: str(sourceMode, 24)
    };
  });
}

function sourceTelemetryEnabled() {
  const v = String(process.env.HELMUT_SOURCE_TELEMETRY || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

// Persistiert die Telemetrie-Zeilen in die relationale Tabelle. FAIL-SAFE +
// FREIGABEPFLICHTIG: default AUS (HELMUT_SOURCE_TELEMETRY) -> No-Op; ein
// Write-Fehler (Tabelle fehlt, Migration nicht eingespielt) beeinflusst den
// Crawl NIE. Der eigentliche DB-Write wird als deps.insert(rows) injiziert
// (storage.insertSourceCrawlTelemetry) — so bleibt dieses Modul rein testbar.
async function persistSourceCrawlTelemetry(rows, deps = {}) {
  const enabled = deps.enabled || sourceTelemetryEnabled;
  if (!enabled()) return { skipped: true, reason: "disabled", persisted: 0 };
  if (!Array.isArray(rows) || !rows.length) return { skipped: true, reason: "no-rows", persisted: 0 };
  const insert = deps.insert;
  if (typeof insert !== "function") return { skipped: true, reason: "no-writer", persisted: 0 };
  try {
    await insert(rows);
    return { persisted: rows.length };
  } catch (error) {
    try { console.error("[source-telemetry] Write fehlgeschlagen (ignoriert):", error && error.message); } catch (_) { /* ignore */ }
    return { persisted: 0, error: error && error.message };
  }
}

module.exports = {
  classifyCrawlError,
  normalizeLevel,
  buildSourceTelemetryRows,
  sourceTelemetryEnabled,
  persistSourceCrawlTelemetry
};
