"use strict";

// Watchdog-Auswertung der /api/cron/pipeline-Antwort.
// =============================================================================
// Der Pipeline-Endpoint fuehrt den V3-Crawl aus (runSourceCrawl) — er ist BEWUSST
// KEIN V2-Briefing-Lauf mehr ("Kein V2-Briefing-Lauf mehr", server.js). Seine Antwort
// traegt daher das Crawl-Ergebnis: successfulSources / failedSources / checkedSources /
// understanding{processed,deferred,reason} / errors[] — und KEIN briefing.generatedAt.
//
// Der alte Watchdog pruefte auf briefing.generatedAt und wertete jeden erfolgreichen
// Lauf faelschlich als Fehler (fehlendes Feld). Diese Auswertung prueft stattdessen den
// TATSAECHLICHEN Erfolg der Pipeline:
//   Erfolg = HTTP 200 (im Workflow geprueft) + erfolgreiche Quellen + 0 Understanding-Fehler.
//   Fehler = harter Pipeline-Fehler (ok:false / error / timeout), Understanding-Fehler
//            oder keine einzige erfolgreiche Quelle.
//   Lock ("already running") = KEIN Fehler (ein paralleler Lauf arbeitet).
//
// Briefing-FRISCHE ist damit bewusst NICHT Teil dieser Pruefung — das waere ein SEPARATER
// Check gegen einen Briefing-Endpoint (anderer Endpunkt), nicht gegen die Pipeline.
// Rein deterministisch, KEIN Netzwerk, KEINE KI.

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Bewertet die geparste Pipeline-Antwort. Gibt { ok, reason, note? } zurueck.
function evaluatePipelineResponse(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, reason: "Antwort ist kein JSON-Objekt" };
  }
  // 1) Harte Pipeline-Fehler: Endpoint-Catch (ok:false, reason:pipeline-timeout) / error-Feld.
  if (data.ok === false) {
    return { ok: false, reason: `Pipeline-Fehler: ${data.reason || "ok=false"}${data.error ? ` (${data.error})` : ""}` };
  }
  if (data.error) {
    return { ok: false, reason: `Pipeline-Fehler: ${data.error}` };
  }
  if (typeof data.reason === "string" && /timeout|error|fail/i.test(data.reason)) {
    return { ok: false, reason: `Pipeline-Fehler: ${data.reason}` };
  }
  // 2) Lock: ein paralleler Lauf haelt den Pipeline-Lock -> KEIN Fehler.
  if (data.skipped === true) {
    return { ok: true, note: true, reason: `Pipeline uebersprungen (${data.reason || "skipped"}) — kein Fehler` };
  }
  // 3) Understanding-Fehler weiterhin als Fehler erkennen (reason enthaelt error/fail).
  const understanding = (data.understanding && typeof data.understanding === "object") ? data.understanding : {};
  if (typeof understanding.reason === "string" && /error|fail/i.test(understanding.reason)) {
    return { ok: false, reason: `Understanding-Fehler: ${understanding.reason}` };
  }
  // 4) Erfolgreiche Quellen: mindestens eine Quelle muss erfolgreich gecrawlt sein.
  //    (Fehlt der Zaehler ganz, wird NICHT hart abgelehnt — kein Fehl-Alarm auf einer
  //     ansonsten sauberen 200-Antwort.)
  const successful = num(data.successfulSources);
  if (successful !== null && successful <= 0) {
    const checked = num(data.checkedSources);
    return { ok: false, reason: `Keine erfolgreiche Quelle (successfulSources=${data.successfulSources}, checkedSources=${checked == null ? "?" : checked})` };
  }
  const processed = understanding.processed != null ? understanding.processed : "?";
  return {
    ok: true,
    reason: `Pipeline ok (successfulSources=${successful == null ? "?" : successful}, understanding.processed=${processed})`
  };
}

module.exports = { evaluatePipelineResponse };

// --- CLI: node scripts/watchdog-eval.js [response.json] ----------------------
if (require.main === module) {
  const fs = require("fs");
  const file = process.argv[2] || "response.json";
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`::error::Antwort ist kein gueltiges JSON (${file}): ${error && error.message}`);
    process.exit(2);
  }
  const res = evaluatePipelineResponse(data);
  if (res.ok) {
    console.log(`::notice::Watchdog OK — ${res.reason}`);
    process.exit(0);
  }
  console.error(`::error::Watchdog FEHLER — ${res.reason}`);
  process.exit(1);
}
