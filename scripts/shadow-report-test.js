"use strict";

// Sprint-4-Shadow · Interner Bericht (Aufgabe 8). REINE LOGIK. Deckt ab: reproduzierbares
// Read-Model mit allen 14 Punkten + Invarianten-Nachweis; PII-frei; deterministisch.

const shadow = require("../lib/helmut/quellenarchitektur/shadow");
const { buildInternalReport } = require("../lib/helmut/quellenarchitektur/shadow-report");
const F = require("./shadow-fixtures");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const ctx = F.buildFixtureContext({ withHealth: true });
const profiles = F.representativeMandates().map((m) => m.profile);
const batch = shadow.runShadowBatch(profiles, ctx, {});
const report = buildInternalReport(batch, { label: "test" });

const REQUIRED_KEYS = [
  "mandateGesamt", "besser", "gleichwertig", "schlechter", "blockiert",
  "groessteVersorgungsluecken", "parteienUnterversorgt", "ausschuesseUnterversorgt",
  "regionenUnterversorgt", "suchanbieterAbhaengigkeitDurchschnitt", "rechtlichUngepruefteQuellen",
  "technischeDefekte", "unterschiedeLegacyNeu", "empfehlung"
];
check("1 Bericht enthaelt alle 14 Pflichtpunkte",
  REQUIRED_KEYS.every((k) => k in report), REQUIRED_KEYS.filter((k) => !(k in report)).join(","));
check("2 Gesamtzahl getesteter Mandate stimmt",
  report.mandateGesamt === profiles.length);
check("3 Klassifikation summiert sich auf die Gesamtzahl",
  report.besser + report.gleichwertig + report.schlechter + report.blockiert === report.mandateGesamt);
check("4 groessste Versorgungsluecken sind nach Haeufigkeit sortiert",
  report.groessteVersorgungsluecken.every((g, i, a) => i === 0 || a[i - 1].count >= g.count));
check("5 neue Partei ohne Sonderlogik erscheint als unterversorgt (nicht verschwiegen)",
  report.parteienUnterversorgt.length > 0 || report.groessteVersorgungsluecken.some((g) => g.key.startsWith("parties:")));
check("6 Suchanbieter-Abhaengigkeit ist eine Zahl 0..1",
  typeof report.suchanbieterAbhaengigkeitDurchschnitt === "number" && report.suchanbieterAbhaengigkeitDurchschnitt >= 0 && report.suchanbieterAbhaengigkeitDurchschnitt <= 1);
check("7 Invarianten: Legacy immer sichtbar, Neu nie auto-aktiv, Telemetrie PII-frei, Blocker benannt",
  report.invarianten.legacyImmerSichtbar && report.invarianten.neuNieAutoAktiv && report.invarianten.telemetriePiiFrei && report.invarianten.alleBlockerBenannt);
check("8 klare Empfehlung fuer den naechsten Sprint (Schritte + Zaehlung)",
  Array.isArray(report.empfehlung.naechsterSprint) && report.empfehlung.naechsterSprint.length > 0 &&
  typeof report.empfehlung.blockierteMandate === "number");
check("9 Ehrlichkeit: Anteil nicht abschliessend vergleichbarer Dimensionen wird ausgewiesen",
  typeof report.nichtVergleichbarAnteil === "number" && report.nichtVergleichbarAnteil > 0);

// Reproduzierbarkeit: identischer Batch -> identischer Bericht.
const report2 = buildInternalReport(shadow.runShadowBatch(profiles, ctx, {}), { label: "test" });
check("10 Bericht ist reproduzierbar (deterministisch)",
  JSON.stringify(report) === JSON.stringify(report2));

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Shadow-Bericht-Assertions`);
process.exit(failed > 0 ? 1 : 0);
