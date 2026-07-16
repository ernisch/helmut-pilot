"use strict";

// P0-1 — Laufzeit/Telemetrie JEDES EINZELNEN Quellenabrufs.
//
// Belegt fuer den pro-Quelle-Telemetrie-Layer:
//  * buildSourceTelemetryRows erzeugt je Quelle die geforderten technischen Felder
//    (runId, sourceId, Name, Ebene, Ausfuehrungsort, geplanter/Folgeprozess, Start/
//    Ende/Dauer, Status, gefundene/neue/doppelte/ignorierte Dokumente, Fehlercode,
//    Wiederholung, Quellenmodus) mit ECHTEN Werten (keine Schaetzung).
//  * classifyCrawlError verdichtet rohe Fehler zu inhaltsfreien Codes (kein Rohtext).
//  * Datensparsamkeit: KEIN Dokumenttitel/-inhalt landet in der Telemetrie.
//  * persistSourceCrawlTelemetry ist DEFAULT AUS (freigabepflichtig) -> No-Op ohne
//    Flag; mit Flag ruft es den injizierten Writer genau einmal.
//
// KEIN Netz, KEINE KI. Nur synthetische Testdaten.

const {
  classifyCrawlError, normalizeLevel, buildSourceTelemetryRows,
  sourceTelemetryEnabled, persistSourceCrawlTelemetry
} = require("../lib/helmut/source-telemetry");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// ── classifyCrawlError: inhaltsfreie Codes ─────────────────────────────────────
check("Fehlercode timeout", classifyCrawlError("Supabase storage timed out after 7000ms") === "timeout");
check("Fehlercode empty-feed", classifyCrawlError("https://x/rss: empty feed") === "empty-feed");
check("Fehlercode http-5xx", classifyCrawlError("request failed 503 Service Unavailable") === "http-5xx");
check("Fehlercode http-429", classifyCrawlError("429 Too Many Requests") === "http-429");
check("Fehlercode http-4xx", classifyCrawlError("404 Not Found") === "http-4xx");
check("Fehlercode dns", classifyCrawlError("getaddrinfo ENOTFOUND example.org") === "dns");
check("Fehlercode unknown", classifyCrawlError("irgendein seltsamer zustand") === "unknown");
check("Fehlercode leer -> null", classifyCrawlError("") === null);
// Der ROHE Fehlertext (koennte URL enthalten) darf NICHT im Code auftauchen:
check("Fehlercode enthaelt keine URL/keinen Rohtext", !/example\.org|https?:/.test(classifyCrawlError("getaddrinfo ENOTFOUND https://example.org/secret")));

// ── normalizeLevel: Kanon klein (P1-2) ────────────────────────────────────────
check("normalizeLevel Bund -> bund", normalizeLevel("Bund") === "bund");
check("normalizeLevel leer -> unknown", normalizeLevel("") === "unknown");

// ── buildSourceTelemetryRows: alle Felder, echte Werte ─────────────────────────
const results = [
  { sourceId: "src-bmas", sourceName: "BMAS", ok: true, itemCount: 5, duplicateItems: 1, ignoredItems: 0,
    startedAt: "2026-07-16T04:03:00.000Z", finishedAt: "2026-07-16T04:03:01.200Z", durationMs: 1200, status: "ok",
    items: [{ title: "GEHEIM Schlagzeile die nie in Telemetrie darf" }] },
  { sourceId: "src-broken", sourceName: "Kaputt", ok: false, itemCount: 0, error: "503 Service Unavailable",
    startedAt: "2026-07-16T04:03:00.000Z", finishedAt: "2026-07-16T04:03:07.000Z", durationMs: 7000, status: "error", items: [] }
];
const sourcesById = {
  "src-bmas": { id: "src-bmas", name: "BMAS", category: "offiziell" },
  "src-broken": { id: "src-broken", name: "Kaputt", category: "medien" }
};
const rows = buildSourceTelemetryRows({
  runId: "crawl-20260716T040300-abcde",
  plannedProcess: "full",
  followUpProcess: "understanding",
  sourceMode: "on",
  location: "fra1",
  results,
  sourcesById,
  defaultLevel: "Bund",
  newBySource: new Map([["src-bmas", 4]])
});

check("Eine Zeile je Quellenabruf", rows.length === 2);
const r0 = rows[0];
const REQUIRED = ["run_id", "source_id", "source_name", "political_level", "execution_location", "planned_process",
  "started_at", "finished_at", "duration_ms", "status", "found_documents", "new_documents", "duplicate_documents",
  "ignored_documents", "error_code", "retry_count", "follow_up_process", "source_mode"];
check("Alle Pflichtfelder vorhanden", REQUIRED.every((k) => k in r0), REQUIRED.filter((k) => !(k in r0)).join(","));
check("runId korrekt", r0.run_id === "crawl-20260716T040300-abcde");
check("sourceId/Name korrekt", r0.source_id === "src-bmas" && r0.source_name === "BMAS");
check("politische Ebene klein (bund)", r0.political_level === "bund");
check("Ausfuehrungsort", r0.execution_location === "fra1");
check("geplanter Prozess/Folgeprozess", r0.planned_process === "full" && r0.follow_up_process === "understanding");
check("Quellenmodus", r0.source_mode === "on");
check("echte Dauer je Abruf", r0.duration_ms === 1200);
check("gefundene Dokumente", r0.found_documents === 5);
check("neue Dokumente (ueber sourceId zugeordnet)", r0.new_documents === 4);
check("doppelte Dokumente (in-Lauf)", r0.duplicate_documents === 1);
check("ignorierte Dokumente (Cap)", r0.ignored_documents === 0);
check("Status ok", r0.status === "ok");
check("Fehlercode bei ok -> null", r0.error_code === null);
check("Wiederholungsnummer default 0", r0.retry_count === 0);

const r1 = rows[1];
check("Fehlerzeile: Status error", r1.status === "error");
check("Fehlerzeile: klassifizierter Fehlercode http-5xx", r1.error_code === "http-5xx");
check("Fehlerzeile: neue Dokumente 0", r1.new_documents === 0);

// ── Datensparsamkeit: KEIN Dokumenttitel/-inhalt im Serialisat ─────────────────
const serialized = JSON.stringify(rows);
check("Kein Dokumenttitel/-inhalt in der Telemetrie", !serialized.includes("GEHEIM") && !serialized.includes("Schlagzeile"));
check("Kein 'items'-Feld in den Zeilen", !("items" in r0) && !("items" in r1));

// ── persistSourceCrawlTelemetry: Freigabe-Gate (default aus) ───────────────────
(async () => {
  // Default AUS: kein Writer-Aufruf.
  let writes = 0;
  const insert = async () => { writes += 1; };
  const offResult = await persistSourceCrawlTelemetry(rows, { enabled: () => false, insert });
  check("Default AUS: No-Op (skipped=disabled)", offResult.skipped === true && offResult.reason === "disabled" && writes === 0);

  // AN + Writer: genau ein Write, persisted = Zeilenzahl.
  const onResult = await persistSourceCrawlTelemetry(rows, { enabled: () => true, insert });
  check("AN: genau ein Writer-Aufruf", writes === 1);
  check("AN: persisted = Zeilenzahl", onResult.persisted === rows.length);

  // Leere Eingabe: No-Op.
  const emptyResult = await persistSourceCrawlTelemetry([], { enabled: () => true, insert });
  check("Leere Eingabe: No-Op", emptyResult.skipped === true && writes === 1);

  // sourceTelemetryEnabled respektiert Default (kein Flag gesetzt = aus).
  delete process.env.HELMUT_SOURCE_TELEMETRY;
  check("sourceTelemetryEnabled ohne Flag -> false", sourceTelemetryEnabled() === false);

  console.log(`\n${passed}/${passed + failed} Source-Telemetrie-Assertions erfolgreich.`);
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
})();
