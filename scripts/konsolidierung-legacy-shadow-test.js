"use strict";

// Tests der Quellenplattform-KONSOLIDIERUNG · Legacy-Paket-Shadow-Vergleich (Phase 5 §9).
// REINE LOGIK, synthetische Fixtures, rein LESEND (Shadow — aendert nichts). Beweist, dass der
// LAUFZEIT-Versorgungsplan die INTENTION der gespeicherten Legacy-Pakete abdeckt, waehrend die
// Legacy-Pakettabellen als Kompatibilitaetsschicht bestehen bleiben:
//   - Legacy (profile-packages) und Laufzeitplan teilen dieselbe Mandatswahrheit (mandateId).
//   - Jedes abbildbare Legacy-Optionalpaket ist im Laufzeitplan dimensional getroffen.
//   - Nicht abbildbare Legacy-Pakete werden EHRLICH als solche ausgewiesen (nicht still verworfen).
//   - Determinismus + Mandat ohne Optionalpakete (nur universale Basis).

const K = require("../lib/helmut/quellenarchitektur/konsolidierung");
const legacyPackages = require("../lib/helmut/quellenarchitektur/profile-packages");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const RECORDS = [
  { id: "src-basis-bt", publisher_id: "publisher-bundestag.de", source_type: "parlament", political_level: "bund", universal: true, retrieval: { method: "rss", url: "https://www.bundestag.de/rss", expected_frequency: "daily" }, trust: "hoch", review_status: "active", license_status: "offen_erlaubt" },
  { id: "src-linke", publisher_id: "publisher-die-linke.de", source_type: "fraktion", political_level: "bund", party_id: "linke", group_id: "linke", retrieval: { method: "rss", url: "https://www.die-linke.de/feed" }, trust: "mittel", review_status: "active", license_status: "presse_erlaubt" },
  { id: "src-bmas", publisher_id: "publisher-bmas.de", source_type: "ministerium", political_level: "bund", committee_ids: ["arbeit-und-soziales"], topics: ["arbeit-und-soziales"], retrieval: { method: "rss", url: "https://www.bmas.de/rss" }, trust: "hoch", review_status: "active", license_status: "offen_erlaubt" }
];
const plat = K.buildPlatform(RECORDS);

// Mandat, das legacy-seitig die Optionalpakete die-linke-bund + arbeit-und-soziales traegt.
const mandat = { id: "m-linke", partei: "Die Linke", fraktion: "Die Linke", ausschuesse: ["Arbeit und Soziales"] };
const legacy = legacyPackages.resolveProfilePackages(mandat);
const shadow = plat.shadowVsLegacy(mandat);

check("S1 Legacy und Laufzeitplan teilen dieselbe Mandatswahrheit",
  shadow.mandateId === "m-linke");
check("S2 Legacy traegt die erwarteten Optionalpakete (Kompatibilitaetsschicht lebt)",
  legacy.optional.includes("die-linke-bund") && legacy.optional.includes("arbeit-und-soziales"));
check("S3 Laufzeitplan deckt die abbildbare Legacy-Intention vollstaendig ab",
  shadow.intentCovered === true, JSON.stringify(shadow.intentChecks));
check("S4 Legacy-Pflichtpaket 'bund-basis' <-> universale Basis im Laufzeitplan",
  legacy.required.includes("bund-basis") && shadow.runtimeSourceCount >= 1);
check("S5 nicht abbildbare Legacy-Pakete werden EHRLICH ausgewiesen (nicht still verworfen)",
  Array.isArray(shadow.unmappedLegacyPackages) && shadow.unmappedLegacyPackages.some((p) => p.startsWith("profil-")));

// Determinismus des Shadow-Vergleichs.
const shadow2 = K.buildPlatform(RECORDS).shadowVsLegacy(mandat);
check("S6 Shadow-Vergleich ist deterministisch",
  JSON.stringify(shadow.intentChecks) === JSON.stringify(shadow2.intentChecks));

// Mandat ohne Optionalpakete: nur universale Basis, Intent vacuously abgedeckt.
const schlicht = { id: "m-schlicht" };
const shadowSchlicht = plat.shadowVsLegacy(schlicht);
check("S7 Mandat ohne bekannte Optionalpakete: Intent (leer) gilt als abgedeckt",
  shadowSchlicht.intentCovered === true);
check("S8 auch ein schlichtes Mandat erhaelt die universale Grundversorgung",
  shadowSchlicht.runtimeSourceCount >= 1);

// Gegentest: fehlt die Partei-Quelle im Katalog, meldet der Shadow-Vergleich EHRLICH Nicht-Abdeckung.
const platOhneLinke = K.buildPlatform(RECORDS.filter((r) => r.id !== "src-linke"));
const shadowOhneLinke = platOhneLinke.shadowVsLegacy(mandat);
check("S9 fehlt die Partei-Quelle, meldet der Vergleich ehrlich Nicht-Abdeckung (kein Schoenfaerben)",
  shadowOhneLinke.intentCovered === false &&
  shadowOhneLinke.intentChecks.some((c) => c.value === "linke" && c.covered === false));

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Legacy-Shadow-Assertions`);
process.exit(failed > 0 ? 1 : 0);
