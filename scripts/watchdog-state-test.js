"use strict";

// Tests für das Watchdog-Zustandsmodell (lib/helmut/watchdog-state.js). KEIN Netz,
// KEINE KI, rein funktional. Prüft die zwei Audit-Kernfixes (P1-4/P1-5) und alle
// sechs Zustände inkl. Recovery-Hysterese.

const {
  STATES,
  classifyOperationalState,
  describeState,
  _ingestAxis,
  _outputAxis,
  _lageAxis
} = require("../lib/helmut/watchdog-state");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const H = 3600e3;
// Gesunde Basissignale: Crawl frisch, genug Quellen, Output frisch, react>0.
const healthy = {
  storageOk: true,
  ingest: { crawlAgeMs: 2 * H, checkedSources: 500, successfulSources: 480, failureRatio: 0.04, rawItems24h: 120 },
  output: { available: true, newestCompleteKoAgeMs: 3 * H, reactCount: 2, situationalCount: 4 },
  lageAgeMs: 1 * H,
  errors24: 0,
  previousState: STATES.GESUND
};
const clone = (over = {}) => ({ ...healthy, ...over, ingest: { ...healthy.ingest, ...(over.ingest || {}) }, output: { ...healthy.output, ...(over.output || {}) } });

// ── Achsen-Bewertung ───────────────────────────────────────────────────────
const T = require("../lib/helmut/watchdog-state").DEFAULT_THRESHOLDS;
check("Axis INGEST: frischer Crawl+Qualität -> fresh", _ingestAxis(healthy.ingest, T) === "fresh");
check("Axis INGEST: 20h alt -> warn", _ingestAxis({ ...healthy.ingest, crawlAgeMs: 20 * H }, T) === "warn");
check("Axis INGEST: 30h alt -> dead", _ingestAxis({ ...healthy.ingest, crawlAgeMs: 30 * H }, T) === "dead");
check("Axis INGEST: kein Crawl -> dead", _ingestAxis({ crawlAgeMs: null }, T) === "dead");
check("Axis INGEST: frisch aber zu wenige Quellen -> warn", _ingestAxis({ ...healthy.ingest, checkedSources: 100 }, T) === "warn");
// P2-5: relationaler Ist-Crawl (~145/145, 0 Fehler) MUSS fresh sein — unter den alten
// Schwellen (450/405) galt er fälschlich als "zu dünn"/warn (Kern des Fehlbefunds).
check("Axis INGEST: relationaler Ist-Crawl 145/145 -> fresh", _ingestAxis({ crawlAgeMs: 2 * H, checkedSources: 145, successfulSources: 145, failureRatio: 0 }, T) === "fresh");
// Echter Einbruch (Plan-Ladefehler/Massenausfall → ~40 Quellen) bleibt warn — die
// Kalibrierung senkt NICHT blind, sie schlägt bei echter Dünne weiter an.
check("Axis INGEST: echter Einbruch 40 Quellen -> warn", _ingestAxis({ crawlAgeMs: 2 * H, checkedSources: 40, successfulSources: 40, failureRatio: 0 }, T) === "warn");
check("Axis OUTPUT: available + 3h -> fresh", _outputAxis(healthy.output, T) === "fresh");
check("Axis OUTPUT: available + 30h -> warn", _outputAxis({ available: true, newestCompleteKoAgeMs: 30 * H }, T) === "warn");
check("Axis OUTPUT: available + 40h -> dead", _outputAxis({ available: true, newestCompleteKoAgeMs: 40 * H }, T) === "dead");
check("Axis OUTPUT: nicht available -> dead (false-green geschlossen)", _outputAxis({ available: false, newestCompleteKoAgeMs: 1 * H }, T) === "dead");
check("Axis OUTPUT: kein KO-Timestamp -> dead", _outputAxis({ available: true, newestCompleteKoAgeMs: null }, T) === "dead");
check("Axis LAGE: 1h -> fresh", _lageAxis(1 * H, T) === "fresh");
check("Axis LAGE: 10h -> warn", _lageAxis(10 * H, T) === "warn");
check("Axis LAGE: 40h -> dead", _lageAxis(40 * H, T) === "dead");

// ── Zustand GESUND / RUHELAGE ──────────────────────────────────────────────
check("GESUND: beide Achsen frisch + react>0", classifyOperationalState(healthy).state === STATES.GESUND);
check("GESUND: ok=true, severity=ok", (() => { const r = classifyOperationalState(healthy); return r.ok === true && r.severity === "ok"; })());
const ruhe = classifyOperationalState(clone({ output: { reactCount: 0, situationalCount: 2 } }));
check("RUHELAGE: frisch aber react=0", ruhe.state === STATES.RUHELAGE);
check("RUHELAGE: ok=true (kein Alarm)", ruhe.ok === true);

// ── Zustand VERALTET (der zentrale false-green-Fix P1-5) ───────────────────
// INGEST frisch (crawlt weiter!) ABER OUTPUT tot -> muss VERALTET sein, nicht grün.
const veraltet = classifyOperationalState(clone({
  output: { available: true, newestCompleteKoAgeMs: 50 * H, reactCount: 0 },
  previousState: STATES.GESUND
}));
check("VERALTET: Crawl frisch, aber Understanding >36h steht", veraltet.state === STATES.VERALTET);
check("VERALTET: ok=false (Alarm), severity=alarm", veraltet.ok === false && veraltet.severity === "alarm");
check("VERALTET: betrifft ALLE Nutzer", /Alle/.test(veraltet.affectedUsers));
const veraltet2 = classifyOperationalState(clone({ output: { available: false }, previousState: STATES.GESUND }));
check("VERALTET: Crawl frisch, Briefing nicht available -> VERALTET (nicht grün)", veraltet2.state === STATES.VERALTET);

// ── Zustand KRITISCH ───────────────────────────────────────────────────────
check("KRITISCH: Speicher nicht supabase", classifyOperationalState(clone({ storageOk: false })).state === STATES.KRITISCH);
const critNoCrawl = classifyOperationalState(clone({ ingest: { crawlAgeMs: 40 * H }, output: { available: false }, previousState: STATES.GESUND }));
check("KRITISCH: kein frischer Crawl >28h UND Output tot", critNoCrawl.state === STATES.KRITISCH);
check("KRITISCH: kein Crawl >28h allein -> KRITISCH", classifyOperationalState(clone({ ingest: { crawlAgeMs: 40 * H } })).state === STATES.KRITISCH);
check("KRITISCH: ok=false", critNoCrawl.ok === false);

// ── Zustand TEILWEISE GESTÖRT (genau eine Achse degradiert) ────────────────
check("TEILWEISE: Crawl 20h (warn), Output frisch", classifyOperationalState(clone({ ingest: { crawlAgeMs: 20 * H } })).state === STATES.TEILWEISE);
check("TEILWEISE: Output 30h (warn), Crawl frisch", classifyOperationalState(clone({ output: { newestCompleteKoAgeMs: 30 * H } })).state === STATES.TEILWEISE);
check("TEILWEISE: Lage-Check veraltet, sonst frisch", classifyOperationalState(clone({ lageAgeMs: 40 * H })).state === STATES.TEILWEISE);
check("TEILWEISE: severity=watch, ok=true (App nutzbar)", (() => { const r = classifyOperationalState(clone({ ingest: { crawlAgeMs: 20 * H } })); return r.severity === "watch" && r.ok === true; })());

// ── Recovery-Hysterese: ERHOLT ─────────────────────────────────────────────
const erholt = classifyOperationalState(clone({ previousState: STATES.VERALTET }));
check("ERHOLT: vorher VERALTET, jetzt gesund -> ERHOLT (nicht sofort GESUND)", erholt.state === STATES.ERHOLT);
check("ERHOLT: ok=true (Alarm aufgelöst)", erholt.ok === true);
const erholtNachKritisch = classifyOperationalState(clone({ previousState: STATES.KRITISCH }));
check("ERHOLT: vorher KRITISCH, jetzt gesund -> ERHOLT", erholtNachKritisch.state === STATES.ERHOLT);
const stabil = classifyOperationalState(clone({ previousState: STATES.ERHOLT }));
check("STABIL: vorher ERHOLT, jetzt gesund -> GESUND (Hysterese abgeschlossen)", stabil.state === STATES.GESUND);
const bleibtVeraltet = classifyOperationalState(clone({ output: { available: false }, previousState: STATES.ERHOLT }));
check("Abwärts sofort: vorher ERHOLT, jetzt Output tot -> VERALTET (kein Flackerschutz nach unten)", bleibtVeraltet.state === STATES.VERALTET);

// ── P1-4: toter pipelineDebugReports-Marker spielt KEINE Rolle mehr ────────
// Das Modell nimmt gar keinen pipelineDebug-Input; ein gesunder Crawl + Output
// ergibt GESUND, egal wie alt irgendein Debug-Marker wäre.
check("P1-4: kein pipelineDebug-Input -> gesunder Betrieb bleibt GESUND", classifyOperationalState(healthy).state === STATES.GESUND);

// ── describeState: erklärt IMMER Was/Wer/Handlung ──────────────────────────
const desc = describeState(veraltet);
check("describeState: enthält Zustand", desc.includes("Veraltet"));
check("describeState: enthält 'Funktioniert:'", desc.includes("Funktioniert:"));
check("describeState: enthält 'Gestört:'", desc.includes("Gestört:"));
check("describeState: enthält 'Betroffen:'", desc.includes("Betroffen:"));
check("describeState: enthält 'Zu tun:'", desc.includes("Zu tun:"));
const descHealthy = describeState(classifyOperationalState(healthy));
check("describeState (gesund): nennt aktive Datenzufuhr", /Datenzufuhr läuft/.test(descHealthy));

// ── Fehler-Spike ist Warnung, kein alleiniges Rot ──────────────────────────
const spike = classifyOperationalState(clone({ errors24: 40 }));
check("Fehler-Spike: bleibt GESUND (Spike ist Warnung, kein Rot allein)", spike.state === STATES.GESUND);
check("Fehler-Spike: taucht in 'Gestört' auf", describeState(spike).includes("Fehler-Spike"));

console.log(`\n${passed}/${passed + failed} Watchdog-State-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
