"use strict";

// Helmut — Quellenplattform (Konsolidierung) · EIN Gesundheitsvokabular (Aufgabe 5).
//
// Reine, deterministische Logik. KEINE KI, kein Netz, kein Storage. Dies ist die EINE
// verbindliche technische Gesundheitswahrheit einer GLOBALEN Quelle. Sie loest die drei
// bisher parallelen Vokabulare ab:
//   - main  lib/helmut/quellenarchitektur/model.js:nextPathStatus (6 Zustaende)
//   - S2    lib/helmut/quellenbibliothek/health-engine.js         (8 Zustaende)
//   - S3    lib/helmut/quellenarchitektur/master/health.js        (4 Zustaende)
// Fuer jede dieser Quellen liefert dieses Modul einen expliziten Mapper (fromMain/fromS2/
// fromS3/fromIntake), damit Bestandsdaten verlustfrei uebersetzt werden koennen — ohne dass
// ein zweites Modell bestehen bleibt.
//
// TRENNUNG (Aufgabe 5): Gesundheit ist GLOBAL und rein TECHNISCH (erreichbar? Fehlerserie?
// Latenz?). Mandantenspezifische Relevanz gehoert NICHT hierher (die lebt in tenant-scope /
// im Versorgungsplan) und darf den Gesundheitsstatus nie beeinflussen.

// Die 10 verbindlichen Gesundheitszustaende (Aufgabe 5, Reihenfolge = Auftrag).
const HEALTH_STATES = Object.freeze([
  "never_checked",  // 1  nie geprueft
  "healthy",        // 2  gesund
  "slow",           // 3  langsam (erreichbar, aber ueber Latenzschwelle)
  "degraded",       // 4  beeintraechtigt (Fehler in Folge, noch nicht defekt)
  "rate_limited",   // 5  Rate Limit
  "http_error",     // 6  technischer Abruffehler
  "parser_error",   // 7  Parserfehler
  "broken",         // 8  defekt (Fehlerserie eskaliert)
  "disabled",       // 9  deaktiviert (administrativ)
  "quarantined"     // 10 Quarantaene (gesperrt, Review noetig)
]);

// severity: hoehere Zahl = schlechter. serveable: darf eine Quelle in diesem Zustand
// ueberhaupt ausgeliefert werden? attention: braucht sie menschliche/technische Aufmerksamkeit?
// category: ok | transient (voruebergehend) | error | administrative | unknown.
const HEALTH_META = Object.freeze({
  never_checked: { label: "Nie geprüft",            severity: 1, serveable: true,  attention: false, category: "unknown" },
  healthy:       { label: "Gesund",                 severity: 0, serveable: true,  attention: false, category: "ok" },
  slow:          { label: "Langsam",                severity: 2, serveable: true,  attention: false, category: "ok" },
  degraded:      { label: "Beeinträchtigt",         severity: 3, serveable: true,  attention: true,  category: "transient" },
  rate_limited:  { label: "Rate Limit",             severity: 4, serveable: false, attention: true,  category: "transient" },
  http_error:    { label: "Technischer Abruffehler", severity: 5, serveable: false, attention: true,  category: "error" },
  parser_error:  { label: "Parserfehler",           severity: 5, serveable: false, attention: true,  category: "error" },
  broken:        { label: "Defekt",                 severity: 6, serveable: false, attention: true,  category: "error" },
  disabled:      { label: "Deaktiviert",            severity: 7, serveable: false, attention: false, category: "administrative" },
  quarantined:   { label: "Quarantäne",             severity: 8, serveable: false, attention: true,  category: "administrative" }
});

// Schwellen (identisch mit dem Bestandsmodell main model.js: DEGRADE 3 / BROKEN 6), damit
// die Eskalation ueber alle Herkuenfte gleich bleibt.
const DEGRADE_STREAK = 3;
const BROKEN_STREAK = 6;
const SLOW_MS = 5000;

// Auf das gröbere Versorgungsstandard-Vokabular (Sprint 3: healthy|degraded|broken|unknown)
// abbilden — damit evaluateLevel/evaluateSupply die vereinheitlichte Gesundheit lesen koennen.
const TO_SUPPLY = Object.freeze({
  healthy: "healthy", slow: "healthy", degraded: "degraded", rate_limited: "degraded",
  http_error: "broken", parser_error: "broken", broken: "broken",
  disabled: "broken", quarantined: "broken", never_checked: "unknown"
});
function toSupplyHealth(state) { return TO_SUPPLY[normalize(state)] || "unknown"; }

function isHealthState(s) { return HEALTH_STATES.includes(String(s || "")); }
function metaOf(state) { return HEALTH_META[state] || HEALTH_META.never_checked; }
function isServeable(state) { return metaOf(state).serveable; }
function needsAttention(state) { return metaOf(state).attention; }
function severityOf(state) { return metaOf(state).severity; }

// Schlechtester (aussagekraeftigster) Zustand einer Menge — fuer Flottenaggregation.
function worstOf(states = []) {
  let worst = "healthy";
  for (const s of states) {
    const norm = normalize(s);
    if (severityOf(norm) > severityOf(worst)) worst = norm;
  }
  return states.length ? worst : "never_checked";
}

// --- Mapper aus den drei bisherigen Vokabularen (verlustfreie Uebersetzung) ------------------

// main lib/helmut/quellenarchitektur/model.js:nextPathStatus -> {healthy,degraded,broken,needs_review,paused,archived}
const FROM_MAIN = Object.freeze({
  healthy: "healthy", degraded: "degraded", broken: "broken",
  needs_review: "quarantined", paused: "disabled", archived: "disabled"
});
function fromMain(state) { return FROM_MAIN[String(state || "")] || "never_checked"; }

// S2 lib/helmut/quellenbibliothek/health-engine.js -> {never_checked,reachable,slow,rate_limited,http_error,parser_error,broken,disabled}
const FROM_S2 = Object.freeze({
  never_checked: "never_checked", reachable: "healthy", slow: "slow",
  rate_limited: "rate_limited", http_error: "http_error", parser_error: "parser_error",
  broken: "broken", disabled: "disabled"
});
function fromS2(state) { return FROM_S2[String(state || "")] || "never_checked"; }

// S3 lib/helmut/quellenarchitektur/master/health.js -> {unknown,healthy,degraded,broken}
const FROM_S3 = Object.freeze({
  unknown: "never_checked", healthy: "healthy", degraded: "degraded", broken: "broken"
});
function fromS3(state) { return FROM_S3[String(state || "")] || "never_checked"; }

// Aus einem Importzustand (INTAKE_STATE, S3 model.js): nur die operativ relevanten Sperrzustaende
// beeinflussen die Gesundheit; alle anderen sagen ueber die TECHNISCHE Gesundheit nichts aus.
function fromIntake(reviewStatus) {
  const s = String(reviewStatus || "");
  if (s === "quarantined") return "quarantined";
  if (s === "archived" || s === "superseded") return "disabled";
  return null; // keine Aussage -> Aufrufer nutzt die technische Gesundheit
}

// Nimmt einen beliebigen bekannten Zustand (aus main/S2/S3/unified) und liefert den
// vereinheitlichten Zustand. Bereits vereinheitlichte Werte bleiben unveraendert.
function normalize(state) {
  const s = String(state || "");
  if (isHealthState(s)) return s;
  if (s === "reachable") return "healthy";   // S2
  if (s === "unknown") return "never_checked"; // S3
  if (FROM_MAIN[s]) return FROM_MAIN[s];       // main-spezifische (needs_review/paused/archived)
  return "never_checked";
}

// --- Eine Beobachtung klassifizieren (loest S2 classifyObservation + main nextPathStatus ab) --
// obs: { ok?, httpStatus?, rateLimited?, parserOk?, latencyMs?, disabled?, error? }
function classifyObservation(obs = {}) {
  if (obs.disabled === true) return { state: "disabled", ok: false, error: obs.error || "administrativ deaktiviert" };
  if (obs.rateLimited === true || obs.httpStatus === 429) return { state: "rate_limited", ok: false, error: obs.error || "rate limit" };
  const status = obs.httpStatus;
  if (status != null && status >= 400) return { state: "http_error", ok: false, error: obs.error || `HTTP ${status}` };
  if (obs.parserOk === false) return { state: "parser_error", ok: false, error: obs.error || "parser error" };
  if (obs.ok === false && status == null) return { state: "http_error", ok: false, error: obs.error || "abruf fehlgeschlagen" };
  const latency = obs.latencyMs;
  if (latency != null && latency > SLOW_MS) return { state: "slow", ok: true, error: null };
  return { state: "healthy", ok: true, error: null };
}

function initialHealth() {
  return { state: "never_checked", errorStreak: 0, lastSuccessAt: null, lastCheckedAt: null, lastLatencyMs: null, lastError: null, needsAttention: false };
}

// Wendet eine Beobachtung an und eskaliert die Fehlerserie zu degraded -> broken (unveraenderlich).
function applyObservation(prev = null, obs = {}, opts = {}) {
  const now = obs.at != null ? obs.at : (opts.now != null ? opts.now : null);
  const h = { ...(prev || initialHealth()) };
  const cls = classifyObservation(obs);
  h.lastCheckedAt = now != null ? now : h.lastCheckedAt;
  if (obs.latencyMs != null) h.lastLatencyMs = obs.latencyMs;

  if (cls.ok) {
    h.errorStreak = 0;
    h.lastSuccessAt = now != null ? now : h.lastSuccessAt;
    h.lastError = null;
    h.state = cls.state; // healthy | slow
  } else if (cls.state === "disabled") {
    h.state = "disabled";
    h.lastError = cls.error;
  } else {
    h.errorStreak = (h.errorStreak || 0) + 1;
    h.lastError = cls.error;
    const broken = opts.brokenStreak || BROKEN_STREAK;
    const degrade = opts.degradeStreak || DEGRADE_STREAK;
    if (h.errorStreak >= broken) h.state = "broken";
    else if (h.errorStreak >= degrade) h.state = "degraded"; // beeintraechtigt vor defekt
    else h.state = cls.state; // akuter Fehlerzustand (rate_limited/http_error/parser_error) sichtbar
  }
  h.needsAttention = needsAttention(h.state) || (h.errorStreak || 0) >= degradeThreshold(opts);
  return h;
}
function degradeThreshold(opts) { return opts.degradeStreak || DEGRADE_STREAK; }

module.exports = {
  HEALTH_STATES, HEALTH_META, DEGRADE_STREAK, BROKEN_STREAK, SLOW_MS,
  isHealthState, metaOf, isServeable, needsAttention, severityOf, worstOf,
  fromMain, fromS2, fromS3, fromIntake, normalize, toSupplyHealth,
  classifyObservation, initialHealth, applyObservation
};
