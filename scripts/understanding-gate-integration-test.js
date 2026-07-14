"use strict";

// Integrationstest der Gate-Shadow-Verdrahtung in understanding.runUnderstandingShadow.
// Beweist: (off) Gate wird NIE aufgerufen, Verhalten byte-identisch; (shadow) Gate berechnet +
// protokolliert, blockiert NICHTS (gleiche Anzahl Understanding-Calls); (on) erkannt, aber nicht
// scharf (blockiert ebenfalls nichts). REINE LOGIK, injizierte Deps, kein echter KI-/DB-Call.

const { runUnderstandingShadow } = require("../lib/helmut/understanding");
const { normalizeRawItem } = require("../lib/helmut/crawler");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }

// Drei klar verschiedene Vorgaenge -> >= 3 Cluster.
const src = { id: "committee-x", name: "Quelle", type: "shadow", url: "https://e/x", priority: 0 };
const items = [
  normalizeRawItem({ title: "Bundestag beschliesst umfassendes Rentenpaket 2026", content: "Bundestag beschliesst Rentenpaket", url: "https://e/rente", publishedAt: "2026-07-13T09:00:00Z" }, src),
  normalizeRawItem({ title: "Landtag Brandenburg verabschiedet neues Schulgesetz", content: "Landtag Brandenburg Schulgesetz", url: "https://e/schule", publishedAt: "2026-07-13T08:00:00Z" }, src),
  normalizeRawItem({ title: "Wetterbericht fuer das sonnige Sommerwochenende", content: "Sonnig und warm", url: "https://e/wetter", publishedAt: "2026-07-13T07:00:00Z" }, src)
];

function runWith(mode, opts = {}) {
  let understandingCalls = 0, shadowCalls = 0, lastSummary = null;
  const rows = [];
  const deps = {
    enabled: () => true, aiEnabled: () => true,
    acquireLock: () => ({ granted: true }), releaseLock: () => {},
    getExisting: () => null, canSpend: () => ({ allowed: true }),
    modelName: () => "gpt-5-mini",
    requestUnderstanding: () => { understandingCalls += 1; return Promise.resolve({}); },
    save: () => ({ saved: false }), saveSources: () => {}, markFailed: () => {}, logSkip: () => {},
    gateMode: () => mode,
    recordGateShadow: (s) => { shadowCalls += 1; lastSummary = s; },
    // Je-Dokument-Telemetrie (gate_shadow_events): hier als Spion; optional werfend,
    // um die Fail-safe-Kapselung zu beweisen.
    recordGateShadowRows: opts.throwingRowsSink
      ? () => { throw new Error("telemetrie-kaputt"); }
      : (r) => { rows.push(...(r || [])); return Promise.resolve({ written: (r || []).length }); }
  };
  return runUnderstandingShadow(items, deps).then((res) => ({ res, understandingCalls, shadowCalls, lastSummary, rows }));
}

(async () => {
  const off = await runWith("off");
  const shadow = await runWith("shadow");
  const on = await runWith("on");

  // Byte-identisches Kernverhalten: gleiche Cluster-Anzahl + gleiche Understanding-Call-Anzahl.
  check("off: Cluster > 0 verarbeitet", off.res.clusters >= 3);
  check("off: Gate NIE aufgerufen (shadowCalls=0)", off.shadowCalls === 0);
  check("shadow: gleiche Understanding-Calls wie off (nichts blockiert)", shadow.understandingCalls === off.understandingCalls);
  check("on: gleiche Understanding-Calls wie off (nicht scharf, nichts blockiert)", on.understandingCalls === off.understandingCalls);
  check("shadow: Gate-Aggregat protokolliert (shadowCalls>=1)", shadow.shadowCalls >= 1 && shadow.lastSummary && shadow.lastSummary.cluster >= 3);
  check("shadow: blockiert=0 im Protokoll", shadow.lastSummary && shadow.lastSummary.blockiert === 0);
  check("on: Protokoll-Hinweis 'nicht scharf/freigabepflichtig'", /freigabepflichtig|nicht-scharf/.test((on.lastSummary && on.lastSummary.hinweis) || ""));
  check("on: Gate-Entscheidungen berechnet (aggregat vorhanden)", on.lastSummary && typeof on.lastSummary.entscheidungen === "object");

  // --- Je-Dokument-Telemetrie (gate_shadow_events-Zeilen) -------------------------------------
  check("off: KEINE Telemetrie-Zeilen", off.rows.length === 0);
  check("shadow: eine Zeile je Dokument", shadow.rows.length === items.length);
  check("shadow: Zeilen tragen raw_document_id + Entscheidung + vorgang_id",
    shadow.rows.every((r) => r.raw_document_id && typeof r.gate_decision === "string" && r.gate_decision && r.vorgang_id));
  check("shadow: Zeilen tragen Quelle + Tier", shadow.rows.every((r) => r.source_id === "committee-x" && typeof r.tier === "string"));
  check("shadow: kein Volltext in der Telemetrie (kein title/content/summary-Feld)",
    shadow.rows.every((r) => !("title" in r) && !("content" in r) && !("summary" in r)));
  const throwing = await runWith("shadow", { throwingRowsSink: true });
  check("shadow: werfende Telemetrie-Senke beeinflusst Understanding NICHT (fail-safe)",
    throwing.understandingCalls === off.understandingCalls && throwing.res.clusters === off.res.clusters);

  console.log(`\n== Gate-Shadow-Integration: ${fail === 0 ? "ALLE TESTS GRÜN" : fail + " FEHLGESCHLAGEN"} · off/shadow/on Understanding-Calls=${off.understandingCalls}/${shadow.understandingCalls}/${on.understandingCalls} ==`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("UNERWARTETER FEHLER", e); process.exit(1); });
