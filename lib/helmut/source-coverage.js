"use strict";

// Helmut — Quellenabdeckung P2-5 · reine Schwellen-/Zähllogik (KEINE KI, kein Netz,
// kein Storage). Zentralisiert die "ist die Quellenbasis breit genug?"-Bewertung, damit
// Readiness/Release/Backend-Health/Watchdog dieselbe, testbare Wahrheit nutzen.
//
// HINTERGRUND (Ursachenanalyse 2026-07-15, Prod ddckuvvpcytqbyfmbvie):
//   Der Readiness-Check meldete die Quellenbasis als "zu dünn", weil er ~145 Quellen
//   gegen Schwellen von 495/450/405 stellte. Diese Defaults (server.js, 2026-07-11)
//   waren NIE erfüllbar: der profil-gebundene Crawl liefert seit jeher ~145–149 Quellen
//   (VOR dem QUELLEN-CUTOVER 2026-07-15 waren es 149, danach 145 — global-URL-Dedup).
//   Es fehlen KEINE Quellen; die Schwellen lagen ~3× zu hoch (vermutlich am rohen
//   Katalogumfang ~566 orientiert statt am profil-gefilterten, kuratierten, global
//   deduplizierten Ist-Crawl). Belege: 20 crawlRuns durchgehend 145–149 geprüft/
//   erfolgreich/0 Fehler; raw_documents tagesfrisch (915/24h) über alle Ausschüsse,
//   Fraktionen, Leitmedien, Ministerien + DIP.
//
// KALIBRIERUNG (belastbar, NICHT auf Grün getrimmt):
//   Gesunder Ist-Stand des relationalen Plans = ~145 geprüft/erfolgreich, 0 Fehler.
//   Strukturelle Neutralbasis (Paket "Bund Basis", jedes Bundestagsprofil) ≈ 54 Wege;
//   ohne aktivierendes Profil laufen nur ~2 always_on-Kernwege. Die Floors liegen bei
//   ~80 % des gesunden Stands: sie bestehen den Normalbetrieb samt Schwankung, schlagen
//   aber bei ECHTEM Einbruch an (Fachpaket-Deaktivierung → Neutralbasis, Plan-Ladefehler
//   → Fallback, Massenausfall von Wegen). Alle per ENV überschreibbar (Betriebs-Tuning).

// Defaults für die relationale Quellenarchitektur (nach Cutover). Bewusst als eine
// Konstante gebündelt, damit die Kalibrierungs-Wahrheit an genau einer Stelle lebt.
const SOURCE_COVERAGE_DEFAULTS = Object.freeze({
  minConfigured: 120, // aktive Quellenbasis (relational) — gesund ~145
  minChecked: 120,    // je Crawl geprüfte Quellen — gesund ~145
  minSuccessful: 110  // erfolgreich abgerufene Quellen — gesund ~145 (0 Fehler)
});

// Schwellen lesen (ENV > Default). Bleibt bewusst pro Aufruf frisch, damit Tests/Betrieb
// ohne Neustart übersteuern können (process.env kann injiziert werden).
function sourceCoverageThresholds(env = process.env) {
  const pick = (name, def) => {
    const raw = env[name];
    const n = Number(raw);
    return raw !== undefined && raw !== "" && Number.isFinite(n) ? n : def;
  };
  return {
    minConfigured: pick("HELMUT_MIN_CONFIGURED_SOURCES", SOURCE_COVERAGE_DEFAULTS.minConfigured),
    minChecked: pick("HELMUT_MIN_CHECKED_SOURCES", SOURCE_COVERAGE_DEFAULTS.minChecked),
    minSuccessful: pick("HELMUT_MIN_SUCCESSFUL_SOURCES", SOURCE_COVERAGE_DEFAULTS.minSuccessful)
  };
}

// Effektive aktive Quellenbasis (Zähl-Wahrheit für die "Quellenbasis"-Prüfung).
// Nach dem Cutover ist die relationale DB die aktive Quellenwahrheit; store.sources ist
// nur noch Fallback-Katalog (eingefrorener Blob). Die "Quellenbasis"-Prüfung zählte bisher
// diesen Blob (store.sources.active) — post-cutover eine tote Zahl, die weder wächst noch
// schrumpft, wenn Pakete/Wege sich ändern. Richtig ist: die relational AKTIV gecrawlten
// Wege. crawl.checkedSources ist der realisierte aktive Plan (der Crawl versucht den
// vollen aktiven Plan) und damit die ehrliche, selbst-aktualisierende Messgröße.
//   mode "on":  checkedSources (Fallback Blob, falls noch kein Crawl vorliegt)
//   sonst:      store.sources.active (alter Katalog ist die aktive Wahrheit)
function effectiveActiveSourceCount({ storeSourcesActive = 0, crawlCheckedSources = 0, mode = "off" } = {}) {
  const blob = Math.max(0, Number(storeSourcesActive) || 0);
  const checked = Math.max(0, Number(crawlCheckedSources) || 0);
  if (mode === "on") return checked > 0 ? checked : blob;
  return blob;
}

module.exports = { SOURCE_COVERAGE_DEFAULTS, sourceCoverageThresholds, effectiveActiveSourceCount };
