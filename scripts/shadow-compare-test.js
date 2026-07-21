"use strict";

// Sprint-4-Shadow · Vergleich (Aufgabe 5). REINE LOGIK. Deckt ab: 18 Dimensionen, jede Differenz
// mit verstaendlicher Ursache (keine Black Box), ehrliche 'nicht_vergleichbar'-Faelle.

const shadow = require("../lib/helmut/quellenarchitektur/shadow");
const { compareMandate } = require("../lib/helmut/quellenarchitektur/shadow-compare");
const F = require("./shadow-fixtures");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const ctx = F.buildFixtureContext({ withHealth: true });
const res = shadow.runOne({ id: "m", partei: "Die Linke", fraktion: "Die Linke", mandatsebene: "Bundestag", bundesland: "Niedersachsen", ausschuesse: ["Arbeit und Soziales"] }, ctx, {});
const cmp = res.comparison;

const EXPECTED_DIMS = [
  "pflichtversorgung", "funktionierende-quellen", "unabhaengige-herausgeber", "primaerquellen",
  "sekundaerquellen", "partei-fraktion", "ausschuesse", "themen", "region", "personenbezug",
  "qualitaet", "gesundheit", "google-news-anteil", "redundanz", "kritische-luecken",
  "private-isolation", "laufzeit", "determinismus"
];
check("1 genau 18 Vergleichsdimensionen (Aufgabe 5)",
  cmp.dimensions.length === 18, String(cmp.dimensions.length));
check("2 alle 18 erwarteten Dimensionen vorhanden",
  EXPECTED_DIMS.every((d) => cmp.dimensions.some((r) => r.dimension === d)),
  cmp.dimensions.map((r) => r.dimension).join(","));
check("3 JEDE Differenz traegt eine verstaendliche Ursache (keine Black Box)",
  cmp.dimensions.every((r) => typeof r.grund === "string" && r.grund.trim().length > 0));
check("4 jeder verdict ist aus dem erlaubten Wertebereich",
  cmp.dimensions.every((r) => ["gleich", "besser", "schlechter", "nicht_vergleichbar"].includes(r.verdict)));
check("5 fehlende Legacy-Quellenebene ist EHRLICH 'nicht_vergleichbar' (nicht geschoengt)",
  cmp.dimensions.some((r) => r.dimension === "funktionierende-quellen" && r.verdict === "nicht_vergleichbar"));
check("6 private-isolation-Dimension spiegelt die Tenant-Wahrheit",
  cmp.dimensions.find((r) => r.dimension === "private-isolation").verdict === "gleich");
check("7 Determinismus-Dimension ist 'gleich' bei deterministischem Plan",
  cmp.dimensions.find((r) => r.dimension === "determinismus").verdict === "gleich");

// Fehler im neuen Pfad -> Vergleich meldet 'nicht_vergleichbar' mit Grund, Legacy sichtbar.
const brokenRun = { mandateId: "x", legacy: { visible: true, fullyActivated: false, packages: [], sourceLevelAvailable: false }, neu: null, neuError: { klasse: "Error", message: "boom" }, legacyIntact: true };
const cmpErr = compareMandate(brokenRun, {});
check("8 Fehler im neuen Pfad: Vergleich ist 'nicht_vergleichbar' mit benannter Ursache",
  cmpErr.dimensions[0].verdict === "nicht_vergleichbar" && /fehlgeschlagen/i.test(cmpErr.dimensions[0].grund));

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Shadow-Vergleich-Assertions`);
process.exit(failed > 0 ? 1 : 0);
