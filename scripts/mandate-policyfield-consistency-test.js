"use strict";

// Konsolidierung · Drift-Guard: EINE Wahrheit fuer Politikfeld-Labels (Komponente Mandatsaufloesung).
// REINE LOGIK, additiv, beruehrt KEINE Live-Datei. Hintergrund: die Politikfeld-Labels existieren
// doppelt — als Datenheimat in seeds/mandate-registry.js:COMMITTEE_RELATIONS[key].policyField (Sprint 1,
// Obermenge mit Ministerium/Themen) UND als eingefrorene LIVE-Kopie in matching.js:POLICY_FIELD_LABELS
// (gespeist den KO-Klassifikations-/Embedding-Pfad ueber derivePolicyFields).
//
// Diese Doppelung wird BEWUSST NICHT entfernt: die beiden Karten werden von VERSCHIEDENEN
// Nachschlagefunktionen adressiert (matching.normalizeCommittee mit der akzeptierten
// menschenrechte->recht-Kollision auf dem Live-Ranking-Pfad vs. matching.committeeMatchKey,
// kollisionssicher, im Mandatsregister). Ein Zusammenlegen der Nachschlagepfade wuerde das
// Live-Ranking verschieben. Deshalb ist die richtige Konsolidierung: die Aequivalenz der DATEN
// festnageln, damit kuenftige Aenderungen an EINER Tabelle nicht still von der anderen abdriften.

const { POLICY_FIELD_LABELS } = require("../lib/helmut/matching");
const { COMMITTEE_RELATIONS } = require("../lib/helmut/quellenarchitektur/seeds/mandate-registry");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// 1) Jedes LIVE-Label hat im Mandatsregister denselben policyField-Wert (byte-identisch).
const mismatches = [];
const missing = [];
for (const [key, label] of Object.entries(POLICY_FIELD_LABELS)) {
  const rel = COMMITTEE_RELATIONS[key];
  if (!rel) { missing.push(key); continue; }
  if (rel.policyField !== label) mismatches.push(`${key}: registry='${rel.policyField}' vs live='${label}'`);
}
check("1 kein Label-Mismatch zwischen Mandatsregister und LIVE POLICY_FIELD_LABELS",
  mismatches.length === 0, mismatches.join(" | "));
check("2 Mandatsregister enthaelt JEDEN LIVE-Politikfeld-Schluessel (Obermenge)",
  missing.length === 0, missing.join(", "));

// 2) Umgekehrt: jeder Register-Eintrag MIT policyField != null hat exakt das LIVE-Label
// (so kann auch das Register nicht einen Wert einfuehren, den die LIVE-Karte nicht kennt).
const registryExtra = [];
for (const [key, rel] of Object.entries(COMMITTEE_RELATIONS)) {
  if (rel.policyField == null) continue; // Verfahrensgremien (z. B. petitionen) tragen bewusst kein Politikfeld
  if (POLICY_FIELD_LABELS[key] !== rel.policyField) registryExtra.push(`${key}='${rel.policyField}'`);
}
check("3 kein Register-Politikfeld ohne deckungsgleiches LIVE-Label (beidseitig gesperrt)",
  registryExtra.length === 0, registryExtra.join(", "));

// 3) Verfahrensgremium ohne Politikfeld bleibt ehrlich null (kein erfundenes Label).
check("4 Verfahrensgremium 'petitionen' traegt bewusst policyField=null",
  COMMITTEE_RELATIONS.petitionen && COMMITTEE_RELATIONS.petitionen.policyField === null);

// 4) Deckungsgrad-Nachweis (Doku): exakt 22 gemeinsame Politikfelder, Register ist echte Obermenge.
const liveCount = Object.keys(POLICY_FIELD_LABELS).length;
const relPolicyCount = Object.values(COMMITTEE_RELATIONS).filter((r) => r.policyField != null).length;
check("5 identischer Deckungsgrad der Politikfelder (Register ist echte Obermenge)",
  relPolicyCount === liveCount && Object.keys(COMMITTEE_RELATIONS).length > liveCount,
  `live=${liveCount} registry-policy=${relPolicyCount} registry-total=${Object.keys(COMMITTEE_RELATIONS).length}`);

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Politikfeld-Konsistenz-Assertions`);
process.exit(failed > 0 ? 1 : 0);
