"use strict";

// Betriebsmetadaten des aktiven Motors. Ausschliesslich GET, kein Blob,
// kein Modellaufruf und kein Ersatzlauf bei unbekanntem Datenbankzustand.
const PFAD = "/rest/v1/process_runs?select=run_id,process,status,started_at,finished_at,processed_count,failed_count,deferred_count,duration_ms"
  + "&process=in.(warteschlange-crawl,warteschlange-pipeline)&order=started_at.desc,run_id.desc&limit=1";

async function leseWarteschlangenStatus({ request = require("./storage").supabaseRequest } = {}) {
  try {
    const rows = await request(PFAD, { method: "GET" });
    if (!Array.isArray(rows) || rows.length > 1) throw new Error("ungueltige-laufantwort");
    const r = rows[0];
    if (rows.length && (!r || typeof r !== "object" || Array.isArray(r))) throw new Error("ungueltige-laufzeile");
    return { ok: true, quelle: "process_runs", latestRun: r ? {
      mode: "warteschlange", runId: r.run_id, process: r.process, status: r.status,
      startedAt: r.started_at, createdAt: r.finished_at,
      processedCount: r.processed_count, failedCount: r.failed_count,
      deferredCount: r.deferred_count, durationMs: r.duration_ms
    } : null };
  } catch {
    return { ok: false, quelle: "process_runs", reason: "laufstatus-nicht-lesbar", latestRun: null };
  }
}

// Nur bestaetigter Fortschritt ersetzt den schweren Watchdoglauf. Das ist
// keine Abnahme der gesamten Warteschlange oder der fachlichen Briefingqualitaet.
function pruefeWarteschlangenLauf(latest, { seitMs, jetztMs, toleranzMs = 0 }) {
  const start = Date.parse(latest?.startedAt);
  const ende = Date.parse(latest?.createdAt);
  const typ = latest?.process === "warteschlange-crawl" ? "crawl"
    : latest?.process === "warteschlange-pipeline" ? "pipeline" : null;
  if (latest?.mode !== "warteschlange" || !typ
    || !new RegExp(`^cron-${typ}-\\d{14}-[a-z0-9]{1,16}$`).test(latest.runId || "")
    || !Number.isFinite(start) || !Number.isFinite(ende) || ende < start || ende > jetztMs + toleranzMs
    || !Number.isSafeInteger(latest.processedCount) || latest.processedCount < 0
    || !Number.isSafeInteger(latest.failedCount) || latest.failedCount < 0
    || !["success", "partial", "error", "failed", "skipped", "running"].includes(latest.status)) {
    return { ausgang: "lesefehler", grund: "Warteschlangenlauf unvollstaendig oder widerspruechlich" };
  }
  if (start < seitMs - toleranzMs) return { ausgang: "veraltet", grund: "Warteschlangenlauf begann vor dem erwarteten Slot" };
  if (latest.status !== "success" || latest.processedCount === 0 || latest.failedCount !== 0) {
    return { ausgang: "unbrauchbar", grund: "Warteschlangenlauf ohne bestaetigten fehlerfreien Fortschritt" };
  }
  return { ausgang: "vorhanden", grund: `Warteschlangenlauf ${latest.runId}: ${latest.processedCount} verarbeitet, keine endgueltigen Fehler` };
}

module.exports = { leseWarteschlangenStatus, pruefeWarteschlangenLauf };
