"use strict";

// Tests für die Quellenabdeckung-Schwellen/Zähllogik (lib/helmut/source-coverage.js).
// KEIN Netz, KEINE KI, rein funktional. Sichert die P2-5-Ursachenbehebung ab:
//   1. Der gesunde relationale Ist-Crawl (~145) MUSS die Schwellen bestehen.
//   2. Ein echter Einbruch MUSS weiter durchfallen (nicht blind auf Grün gesenkt).
//   3. Die "Quellenbasis" zählt post-cutover den relationalen Plan (checkedSources),
//      NICHT den eingefrorenen store.sources-Blob.
//   4. ENV übersteuert die Defaults (Betriebs-Tuning ohne Redeploy).

const {
  SOURCE_COVERAGE_DEFAULTS,
  sourceCoverageThresholds,
  effectiveActiveSourceCount
} = require("../lib/helmut/source-coverage");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// ── 1. Defaults sind auf die relationale Architektur kalibriert (nicht 450/495/405) ──
const d = SOURCE_COVERAGE_DEFAULTS;
check("Defaults: minChecked < 200 (nicht mehr 450)", d.minChecked < 200 && d.minChecked === 120);
check("Defaults: minConfigured < 200 (nicht mehr 495)", d.minConfigured < 200 && d.minConfigured === 120);
check("Defaults: minSuccessful < 200 (nicht mehr 405)", d.minSuccessful < 200 && d.minSuccessful === 110);
check("Defaults: Leiter erfolgreich <= geprüft", d.minSuccessful <= d.minChecked);

// ── 2. Schwellen bestehen den gesunden Ist-Crawl, schlagen bei echter Dünne an ──
const t = sourceCoverageThresholds({}); // leeres ENV -> Defaults
const HEALTHY = 145; // realer Prod-Ist-Stand (145 geprüft/145 erfolgreich/0 Fehler)
check("Gesund 145 geprüft besteht minChecked", HEALTHY >= t.minChecked);
check("Gesund 145 erfolgreich besteht minSuccessful", HEALTHY >= t.minSuccessful);
check("Gesund 145 Basis besteht minConfigured", HEALTHY >= t.minConfigured);
// Pre-cutover-Stand (149) besteht ebenfalls — die Schwelle war schon immer erfüllbar zu setzen.
check("Pre-cutover 149 besteht", 149 >= t.minChecked);
// Echter Einbruch (Neutralbasis ~54, Plan-Ladefehler, Massenausfall) fällt durch.
check("Einbruch 54 (nur Neutralbasis) fällt durch minChecked", !(54 >= t.minChecked));
check("Einbruch 2 (nur always_on) fällt durch", !(2 >= t.minChecked));
// Aber die Schwelle ist nicht künstlich knapp: gesunder Stand hat Luft nach unten.
check("Headroom: gesund 145 liegt >= 20% über minChecked", HEALTHY >= t.minChecked * 1.2);

// ── 3. effectiveActiveSourceCount: relationaler Plan statt Blob ──
// mode "on": zählt checkedSources (realisierter aktiver Plan), NICHT den Blob.
check("mode on: nimmt checkedSources (145), nicht Blob (144)",
  effectiveActiveSourceCount({ storeSourcesActive: 144, crawlCheckedSources: 145, mode: "on" }) === 145);
// mode on ohne Crawl (Kaltstart): fällt sauber auf Blob zurück.
check("mode on ohne Crawl: Fallback auf Blob",
  effectiveActiveSourceCount({ storeSourcesActive: 144, crawlCheckedSources: 0, mode: "on" }) === 144);
// Blob eingefroren/leer, relationaler Crawl gesund: Basis bleibt gesund (der Bug-Fix).
check("mode on: leerer Blob, gesunder Crawl -> gesunde Basis (Zähl-Bug behoben)",
  effectiveActiveSourceCount({ storeSourcesActive: 0, crawlCheckedSources: 145, mode: "on" }) === 145);
// mode off/shadow: alter Katalog (Blob) bleibt die aktive Wahrheit.
check("mode off: nimmt Blob (alter Katalog aktiv)",
  effectiveActiveSourceCount({ storeSourcesActive: 144, crawlCheckedSources: 999, mode: "off" }) === 144);
check("mode shadow: nimmt Blob (Katalog aktiv, relational nur Messbetrieb)",
  effectiveActiveSourceCount({ storeSourcesActive: 144, crawlCheckedSources: 999, mode: "shadow" }) === 144);
// Robust gegen fehlende/ungültige Eingaben.
check("robust: fehlende Eingaben -> 0", effectiveActiveSourceCount({}) === 0);

// ── 4. ENV übersteuert Defaults ──
const tEnv = sourceCoverageThresholds({ HELMUT_MIN_CHECKED_SOURCES: "200", HELMUT_MIN_SUCCESSFUL_SOURCES: "180", HELMUT_MIN_CONFIGURED_SOURCES: "210" });
check("ENV übersteuert minChecked", tEnv.minChecked === 200);
check("ENV übersteuert minSuccessful", tEnv.minSuccessful === 180);
check("ENV übersteuert minConfigured", tEnv.minConfigured === 210);
check("ENV leer/ungültig -> Default", sourceCoverageThresholds({ HELMUT_MIN_CHECKED_SOURCES: "" }).minChecked === d.minChecked
  && sourceCoverageThresholds({ HELMUT_MIN_CHECKED_SOURCES: "abc" }).minChecked === d.minChecked);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
