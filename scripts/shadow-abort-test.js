"use strict";

// Sprint-4-Shadow · Abbruchregeln (Aufgabe 6). REINE LOGIK. Deckt ab: alle 11 Bedingungen sind
// EINZELN ausloesbar; die neue Plattform ist NIE automatisch aktivierbar; Legacy bleibt intakt.

const { evaluateAbortRules } = require("../lib/helmut/quellenarchitektur/shadow-compare");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}
function has(ab, regel) { return ab.blockers.some((b) => b.regel === regel); }

// Basis: ein sauberer Lauf ohne Blocker.
function baseRun(overrides = {}) {
  return {
    mandateId: "m", legacyIntact: true,
    legacy: { visible: true, fullyActivated: true, packages: [], sourceLevelAvailable: false },
    neu: {
      kind: "runtime_supply_plan", persisted: false, mandateId: "m", requirement: {},
      sources: [{ id: "s1", trust: "hoch", gesundheit: "healthy", auswahlgrund: [{ dimension: "parties", matched: ["linke"] }], versorgungsebene: "primaer_direkt", method: "rss" }],
      sourceCount: 1, alternativen: {}, ausgeschlossen: [], versorgungsluecken: [],
      suchanbieterAbhaengigkeit: { anzahl: 0, anteil: 0, alleinversorgungPflicht: [] },
      gesamtstatus: "vollstaendig", healthAvailable: true, qualityAvailable: true
    },
    neuError: null,
    ...overrides
  };
}

// Struktur-Invariante: NIE automatisch aktivierbar (unabhaengig vom Ergebnis).
const clean = evaluateAbortRules(baseRun(), null, { tenantIsolated: true, deterministic: true, identityUncertain: false });
check("0a autoActivateNewAllowed ist strukturell IMMER false", clean.autoActivateNewAllowed === false);
check("0b sauberer Lauf ist freigabefaehig (kein Blocker)", clean.freigabefaehig === true && clean.blockers.length === 0);
check("0c winner bleibt legacy", clean.winner === "legacy");

// 1) Pflichtversorgung schlechter als Legacy.
const r1 = baseRun(); r1.neu.gesamtstatus = "eingeschraenkt";
check("1 pflichtversorgung-schlechter", has(evaluateAbortRules(r1, null, { tenantIsolated: true, deterministic: true }), "pflichtversorgung-schlechter"));

// 2) Neue kritische Luecke.
const r2 = baseRun(); r2.neu.versorgungsluecken = [{ dimension: "parties", wert: "linke" }];
check("2 neue-kritische-luecke", has(evaluateAbortRules(r2, null, { tenantIsolated: true, deterministic: true }), "neue-kritische-luecke"));

// 3) Suchanbieter als alleinige Pflichtversorgung.
const r3 = baseRun(); r3.neu.suchanbieterAbhaengigkeit.alleinversorgungPflicht = [{ dimension: "parties", wert: "afd" }];
check("3 suchanbieter-alleinversorgung", has(evaluateAbortRules(r3, null, { tenantIsolated: true, deterministic: true }), "suchanbieter-alleinversorgung"));

// 4) Private Quelle ueberschreitet Tenant-Grenze.
check("4 private-tenant-grenze", has(evaluateAbortRules(baseRun(), null, { tenantIsolated: false, tenantLeaked: ["privB-1"], deterministic: true }), "private-tenant-grenze"));

// 5) Gesundheitsstatus unbekannt bei Pflichtquelle.
const r5 = baseRun(); r5.neu.sources[0].gesundheit = "unbekannt";
check("5 gesundheit-unbekannt-pflichtquelle", has(evaluateAbortRules(r5, null, { tenantIsolated: true, deterministic: true }), "gesundheit-unbekannt-pflichtquelle"));

// 6) Rechtlicher Pruefstatus fehlt bei aktiv vorgesehener Quelle.
const r6 = baseRun(); r6.neu.sources[0].trust = "unbekannt";
check("6 rechtlicher-pruefstatus-fehlt", has(evaluateAbortRules(r6, null, { tenantIsolated: true, deterministic: true }), "rechtlicher-pruefstatus-fehlt"));

// 7) Profilidentitaet unsicher.
check("7 profilidentitaet-unsicher", has(evaluateAbortRules(baseRun(), null, { tenantIsolated: true, deterministic: true, identityUncertain: true }), "profilidentitaet-unsicher"));

// 8) Ergebnis nicht deterministisch.
check("8 nicht-deterministisch", has(evaluateAbortRules(baseRun(), null, { tenantIsolated: true, deterministic: false }), "nicht-deterministisch"));

// 9) Fehler oder Timeout im neuen Pfad.
const r9 = baseRun({ neu: null, neuError: { klasse: "TimeoutError", message: "timeout" } });
const ab9 = evaluateAbortRules(r9, null, { tenantIsolated: true });
check("9 fehler-neuer-pfad + Legacy intakt", has(ab9, "fehler-neuer-pfad") && ab9.legacyIntact === true);

// 10) Messbare Verschlechterung der Laufzeit.
check("10 laufzeit-verschlechterung", has(evaluateAbortRules(baseRun(), null, { tenantIsolated: true, deterministic: true, runtimeLegacyMs: 10, runtimeNeuMs: 100 }), "laufzeit-verschlechterung"));

// 11) unbekannte/nicht erklaerbare Differenz.
const fakeCmp = { dimensions: [{ dimension: "x", verdict: "schlechter", grund: "" }], besser: [], gleich: [], schlechter: ["x"], nichtVergleichbar: [] };
check("11 unerklaerbare-differenz", has(evaluateAbortRules(baseRun(), fakeCmp, { tenantIsolated: true, deterministic: true }), "unerklaerbare-differenz"));

// Gesamt: selbst wenn Neu ueberall besser waere, bleibt autoActivate false.
const better = baseRun(); better.neu.gesamtstatus = "vollstaendig";
check("12 auch bei besserem Neu-Ergebnis: keine automatische Aktivierung",
  evaluateAbortRules(better, null, { tenantIsolated: true, deterministic: true }).autoActivateNewAllowed === false);

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Shadow-Abbruch-Assertions`);
process.exit(failed > 0 ? 1 : 0);
