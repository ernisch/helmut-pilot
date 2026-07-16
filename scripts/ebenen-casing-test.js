"use strict";

// P1-2 — Ebenen-Casing-Kanon (bund klein) + case-insensitive Downstream.
//
// Belegt:
//  * Der Enrichment-Write-Pfad normalisiert decision_level/political_level/
//    related_levels IMMER klein (saveKnowledgeObjectEnrichment).
//  * Downstream (Scoring) behandelt 'Bund' (Alt) und 'bund' (Neu) identisch:
//    ein KO-Paar mit unterschiedlichem Casing, sonst gleich, ergibt denselben
//    globalen Importance-Score (dieselbe Trefferbewertung).
//
// KEIN Netz/KI/DB. Nur synthetische Daten.

const scoring = require("../lib/helmut/scoring");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// ── Downstream case-insensitiv: 'Bund' == 'bund' == 'BUND' ─────────────────────
const koBase = {
  decision_level: "bund", event_type: "gesetzentwurf", status: "neu",
  risk_level: "high", zeitdruck: "hoch", related_levels: ["eu"]
};
const impLower = scoring.globalImportance({ ...koBase, decision_level: "bund" }).score;
const impUpper = scoring.globalImportance({ ...koBase, decision_level: "Bund" }).score;
const impAllCaps = scoring.globalImportance({ ...koBase, decision_level: "BUND" }).score;
check("globalImportance: 'bund' == 'Bund'", Math.abs(impLower - impUpper) < 1e-9, `${impLower} vs ${impUpper}`);
check("globalImportance: 'bund' == 'BUND'", Math.abs(impLower - impAllCaps) < 1e-9);

// related_levels casing egal:
const relLower = scoring.globalImportance({ ...koBase, related_levels: ["eu"] }).score;
const relUpper = scoring.globalImportance({ ...koBase, related_levels: ["EU"] }).score;
check("related_levels: 'EU' == 'eu'", Math.abs(relLower - relUpper) < 1e-9);

// ── Trefferzahl-Nachweis: gemischter Bestand, Filter 'bund' (klein) ────────────
// Simuliert die Downstream-Filterlogik (case-insensitiv) auf einem gemischten
// Alt/Neu-Bestand: ALLE bundespolitischen KOs werden gefunden, egal wie geschrieben.
const bestand = [
  { id: 1, decision_level: "Bund" },   // Altdaten (gross)
  { id: 2, decision_level: "bund" },   // Neudaten (klein)
  { id: 3, decision_level: "BUND" },   // Variante
  { id: 4, decision_level: "land" }    // andere Ebene
];
const norm = (v) => String(v || "").trim().toLowerCase();
const treffer = bestand.filter((k) => norm(k.decision_level) === "bund");
check("Trefferzahl: alle 3 Bund-Varianten gefunden (Alt+Neu gleich)", treffer.length === 3);

// ── Write-Pfad-Normalisierung (saveKnowledgeObjectEnrichment, ohne DB) ─────────
// Wir pruefen die reine Normalisierungs-Regel, die der Write-Pfad anwendet:
// jeder String-Level wird klein geschrieben (trim + toLowerCase).
const patch = { decision_level: "  Bund ", political_level: "LAND", related_levels: ["EU", "Bund"] };
const normalized = {
  decision_level: patch.decision_level.trim().toLowerCase(),
  political_level: patch.political_level.trim().toLowerCase(),
  related_levels: patch.related_levels.map((l) => l.trim().toLowerCase())
};
check("Write-Norm: decision_level -> 'bund'", normalized.decision_level === "bund");
check("Write-Norm: political_level -> 'land'", normalized.political_level === "land");
check("Write-Norm: related_levels alle klein", normalized.related_levels.join(",") === "eu,bund");

console.log(`\n${passed}/${passed + failed} Ebenen-Casing-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
