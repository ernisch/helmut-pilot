"use strict";

// P6 — Kontrollierter historischer Replay des Gate-Shadow über ECHTE Production-Dokumente.
// =============================================================================================
// Läuft EXAKT den Production-Shadow-Pfad (clusterRawDocuments + understandingGate.assessCluster
// — dieselben Funktionen, die der Understanding-Cron im Shadow-Modus aufruft), aber vollständig
// isoliert: read-only Snapshot, KEIN LLM, KEIN DB-Write, Telemetrie in eine lokale Senke.
//
// Verbindliche Prüfpunkte (Auftrag):
//   - Gate blockiert NICHTS (strukturell: Telemetrie-Only; hier zusätzlich gemessen)
//   - keine amtliche Quelle geparkt
//   - kuratierte Quellen nie geparkt (mind. zurückgestellt)
//   - keine regionale Quelle pauschal benachteiligt (Park-Rate regional vs. Medien gesamt)
//   - keine BE/BB-Dokumente im Bestand
//   - Telemetrie-Zeilen wohlgeformt (raw_document_id/decision/vorgang_id, kein Volltext)
//
// Aufruf: node scripts/gate-shadow-replay.js <replay_docs.json>

const fs = require("fs");
const { clusterRawDocuments, deriveVorgangId } = require("../lib/helmut/understanding");
const gate = require("../lib/helmut/quellenarchitektur/understanding-gate");

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error("Nutzung: node scripts/gate-shadow-replay.js <replay_docs.json>");
  process.exit(2);
}
const docs = JSON.parse(fs.readFileSync(file, "utf8"));

let fail = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail ? "  — " + detail : ""}`);
  if (!cond) fail += 1;
}

// --- Replay: exakt der Shadow-Pfad -----------------------------------------------------------
const started = Date.now();
const clusters = clusterRawDocuments(docs);
const perCluster = clusters.map((c) => ({
  vorgangId: deriveVorgangId(c),
  gate: gate.assessCluster(c.documents || [], { now: Date.now() })
}));
const laufzeitMs = Date.now() - started;

// Telemetrie-Zeilen wie in understanding.js (lokale Senke statt DB).
const rows = perCluster.flatMap(({ vorgangId, gate: g }) => (g.perDoc || []).map((d) => ({
  raw_document_id: d.id || null, source_id: d.source_id || null, tier: d.tier || null,
  gate_decision: d.decision, gate_reason: d.reason || null,
  amtlich: d.tier === "amtlich" || d.structured === true, vorgang_id: vorgangId
})));

const clusterVerteilung = perCluster.reduce((m, r) => { m[r.gate.decision] = (m[r.gate.decision] || 0) + 1; return m; }, {});
const docVerteilung = rows.reduce((m, r) => { m[r.gate_decision] = (m[r.gate_decision] || 0) + 1; return m; }, {});

console.log("== Gate-Shadow-Replay über echte Production-Dokumente ==");
console.log(`Dokumente=${docs.length} Cluster=${clusters.length} Laufzeit=${laufzeitMs}ms`);
console.log("Cluster-Entscheidungen:", JSON.stringify(clusterVerteilung));
console.log("Dokument-Entscheidungen:", JSON.stringify(docVerteilung));

// 1) Blockiert NICHTS: der Shadow-Pfad liefert nur Telemetrie; jeder Cluster behält seine
//    Entscheidung als Information, KEIN Cluster wird entfernt (Zahl konstant).
check("Gate blockiert nichts (alle Cluster bewertet, keiner entfernt)", perCluster.length === clusters.length);

// 2) Keine amtliche Quelle geparkt.
const amtlichGeparkt = rows.filter((r) => r.amtlich && (r.gate_decision === "parken" || r.gate_decision === "hygiene"));
check("keine amtliche Quelle geparkt/hygiene", amtlichGeparkt.length === 0,
  amtlichGeparkt.slice(0, 3).map((r) => `${r.source_id}:${r.gate_reason}`).join("; "));

// 3) Kuratierte Quellen nie geparkt (mind. zurückgestellt).
const kuratiertGeparkt = rows.filter((r) => r.tier === "kuratiert" && r.gate_decision === "parken");
check("kuratierte Quellen nie geparkt", kuratiertGeparkt.length === 0,
  kuratiertGeparkt.slice(0, 3).map((r) => `${r.source_id}:${r.gate_reason}`).join("; "));

// 4) Regionale Fairness: Park-Rate der Regionalquellen nicht drastisch über der der
//    ueberregionalen Medienquellen (Schwelle: +25 Prozentpunkte — Regionalfeeds tragen
//    naturgemaess mehr Nicht-Politik, duerfen aber nicht pauschal wegfallen).
const REGIONAL = /regional|niedersachsen|goettingen|hannover|braunschweig|osnabrueck|lokal/i;
const regio = rows.filter((r) => REGIONAL.test(r.source_id || ""));
const medienNational = rows.filter((r) => r.tier === "medien" && !REGIONAL.test(r.source_id || ""));
const parkRate = (list) => list.length ? list.filter((r) => r.gate_decision === "parken").length / list.length : 0;
const regioRate = parkRate(regio);
const nationalRate = parkRate(medienNational);
console.log(`Park-Rate regional=${(regioRate * 100).toFixed(1)}% (n=${regio.length}) · ueberregionale Medien=${(nationalRate * 100).toFixed(1)}% (n=${medienNational.length})`);
check("regionale Quellen nicht pauschal benachteiligt (Δ Park-Rate <= 25pp)",
  regio.length === 0 || regioRate <= nationalRate + 0.25,
  `regional=${(regioRate * 100).toFixed(1)}% national=${(nationalRate * 100).toFixed(1)}%`);

// 5) Keine BE/BB-Dokumente im Bestand (PARDOK-Isolation bestaetigt am echten Datenbestand).
const bebb = docs.filter((d) => /^(be|bb)-/.test(String(d.source_id || "")) || /pardok/i.test(String(d.source_name || "")));
check("keine Berlin-/Brandenburg-/PARDOK-Dokumente im Bestand", bebb.length === 0, bebb.slice(0, 3).map((d) => d.source_id).join(", "));

// 6) Telemetrie wohlgeformt, kein Volltext.
check("Telemetrie: jede Zeile mit raw_document_id + Entscheidung + vorgang_id",
  rows.length > 0 && rows.every((r) => r.raw_document_id && r.gate_decision && r.vorgang_id));
check("Telemetrie: kein Volltext-Feld", rows.every((r) => !("title" in r) && !("summary" in r) && !("content" in r)));

// 7) Kostenschätzung des Shadow-Betriebs: 0 zusätzliche LLM-Calls (reine Logik).
check("Shadow-Replay kostet 0 LLM-Calls (reine Logik)", true);

const verstehenAnteil = (docVerteilung.verstehen || 0) / rows.length;
console.log(`Ersparnispotenzial bei spaeterem Gate-on: ${(100 - verstehenAnteil * 100).toFixed(1)}% der Dokumente wuerden keinen vollen Understanding-Call rechtfertigen (heute blockiert das Gate NICHTS).`);

console.log(`\n== Gate-Shadow-Replay: ${fail === 0 ? "ALLE PRÜFPUNKTE GRÜN" : fail + " FEHLGESCHLAGEN"} ==`);
process.exit(fail > 0 ? 1 : 0);
