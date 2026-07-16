"use strict";

// P1-3 — Understanding-Priorisierung bei ausgeschöpftem Budget (scharf-schaltbar).
//
// Belegt:
//  * clustersInPriorityOrder ordnet einen AMTLICHEN Cluster, der als LETZTER ankommt,
//    nach VORNE (Prioritätsreihenfolge statt Ankunft) — nutzt die reale Gate-Bewertung.
//  * Bei Budget N=1 überlebt genau der amtliche Vorgang (Priorisierung bei
//    ausgeschöpftem Budget) — der Grenzfall wird verdrängt.
//  * Der Batch (runUnderstandingShadow) verarbeitet mit HELMUT_UNDERSTANDING_PRIORITY
//    (bzw. deps.priorityEnabled) die höchstpriorisierten Vorgänge ZUERST; DEFAULT AUS
//    bleibt die Ankunftsreihenfolge byte-identisch.
//
// KEIN Netz/KI/DB — der KI-Aufruf ist ein injizierter Spy, der nur die Reihenfolge
// aufzeichnet. Nur synthetische Daten.

const priority = require("../lib/helmut/quellenarchitektur/understanding-priority");
const gate = require("../lib/helmut/quellenarchitektur/understanding-gate");
const understanding = require("../lib/helmut/understanding");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const NOW = Date.UTC(2026, 6, 16);
const assess = (c) => gate.assessCluster(c.documents || [], { now: NOW });

// Drei Cluster; der AMTLICHE kommt als LETZTER an (Ankunftsreihenfolge würde ihn verdrängen).
const clusterNormal1 = { documents: [{ id: "d1", content_hash: "h1", title: "Ampelkoalition Kohleausstieg Debatte", published_at: "2026-07-15T08:00:00Z", source_id: "medien-1" }] };
const clusterNormal2 = { documents: [{ id: "d2", content_hash: "h2", title: "Kommunalwahl Umfrage Ergebnisse", published_at: "2026-07-14T08:00:00Z", source_id: "medien-2" }] };
const clusterAmtlich = { documents: [{ id: "d3", content_hash: "h3", title: "Drucksache Rentenreformgesetz Bundestag", document_type: "Drucksache", published_at: "2026-07-16T08:00:00Z", source_id: "bundestag-drucksachen" }] };
const clusters = [clusterNormal1, clusterNormal2, clusterAmtlich];

// ── clustersInPriorityOrder: amtlich (letzte Ankunft) -> zuerst ────────────────
const ordered = priority.clustersInPriorityOrder(clusters, assess, NOW);
check("Priorität: amtlicher Cluster steht an erster Stelle", ordered[0] === clusterAmtlich);
check("Priorität: alle Cluster erhalten (nichts verloren)", ordered.length === 3);

// ── Budget N=1: nur der amtliche Vorgang überlebt ──────────────────────────────
const budget1 = ordered.slice(0, 1);
check("Budget=1: genau der amtliche Vorgang überlebt", budget1.length === 1 && budget1[0] === clusterAmtlich);

// ── clusterToCandidate erkennt amtlich über document_type ──────────────────────
const cand = priority.clusterToCandidate(clusterAmtlich, assess(clusterAmtlich));
check("clusterToCandidate: Drucksache -> amtlich", cand.amtlich === true);
check("priorityTier: amtlich = höchste Stufe", priority.priorityTier(cand) === priority.TIER.AMTLICH);

// ── Integration: runUnderstandingShadow verarbeitet amtlich ZUERST (Prio an) ────
function makeDeps(priorityEnabled, order) {
  return {
    enabled: () => true,
    aiEnabled: () => true,
    acquireLock: async () => ({ granted: true, active: false }),
    releaseLock: async () => {},
    getExisting: async () => null,
    canSpend: async () => ({ allowed: true }),
    modelName: () => "test-model",
    logSkip: () => {},
    markFailed: async () => {},
    gateMode: () => "off",
    priorityEnabled: () => priorityEnabled,
    budgetMs: 0,
    // Spy: erkennt den Cluster am Titel im Prompt, zeichnet die Reihenfolge auf und
    // bricht dann ab (cluster-error) — die REIHENFOLGE ist der Nachweis.
    requestUnderstanding: async (prompt) => {
      const p = String(prompt || "");
      if (p.includes("Drucksache Rentenreform")) order.push("amtlich");
      else if (p.includes("Ampelkoalition")) order.push("normal1");
      else if (p.includes("Kommunalwahl")) order.push("normal2");
      else order.push("unbekannt");
      throw new Error("stop-nach-aufzeichnung");
    }
  };
}

// Rohe Items (werden intern geclustert) — distinkte Titel -> distinkte Cluster.
const rawItems = [
  { sourceId: "medien-1", title: "Ampelkoalition Kohleausstieg Debatte", url: "https://a.example.invalid/1", publishedAt: "2026-07-15T08:00:00Z" },
  { sourceId: "medien-2", title: "Kommunalwahl Umfrage Ergebnisse", url: "https://b.example.invalid/2", publishedAt: "2026-07-14T08:00:00Z" },
  { sourceId: "bundestag-drucksachen", title: "Drucksache Rentenreformgesetz Bundestag", documentType: "Drucksache", url: "https://c.example.invalid/3", publishedAt: "2026-07-16T08:00:00Z" }
];

(async () => {
  const orderOn = [];
  await understanding.runUnderstandingShadow(rawItems, makeDeps(true, orderOn));
  check("Integration: mind. der amtliche Vorgang wurde verarbeitet", orderOn.includes("amtlich"));
  check("Integration (Prio AN): amtlicher Vorgang wird ZUERST verarbeitet", orderOn[0] === "amtlich", `Reihenfolge=${orderOn.join(",")}`);

  const orderOff = [];
  await understanding.runUnderstandingShadow(rawItems, makeDeps(false, orderOff));
  // Default aus: Ankunftsreihenfolge (amtlich kam zuletzt) -> NICHT zuerst.
  check("Integration (Prio AUS): Ankunftsreihenfolge, amtlich NICHT zuerst", orderOff.length > 0 && orderOff[0] !== "amtlich", `Reihenfolge=${orderOff.join(",")}`);

  // Flag-Gate: ohne Env-Flag ist die Priorisierung aus (Default byte-identisch).
  delete process.env.HELMUT_UNDERSTANDING_PRIORITY;
  const orderFlagDefault = [];
  const depsNoPriorityHook = makeDeps(false, orderFlagDefault);
  delete depsNoPriorityHook.priorityEnabled; // -> greift auf understandingPriorityEnabled() (Env) zurück
  await understanding.runUnderstandingShadow(rawItems, depsNoPriorityHook);
  check("Flag-Gate: ohne HELMUT_UNDERSTANDING_PRIORITY -> Ankunftsreihenfolge", orderFlagDefault.length > 0 && orderFlagDefault[0] !== "amtlich");

  console.log(`\n${passed}/${passed + failed} Understanding-Priorisierungs-Assertions erfolgreich.`);
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
})();
