"use strict";

// Helmut — Universelle Quellenbibliothek · Gesundheitsmotor (Auftrag §5).
//
// Reine, deterministische Zustandsmaschine. KEINE KI, kein Netz, kein Storage; die
// Uhr (`now`) und jede Beobachtung werden INJIZIERT. Ersetzt die statischen CSV-/
// Katalog-Zustände durch einen laufend fortgeschriebenen Health-Record je Quelle.
//
// Zustände (Auftrag §5): reachable(erreichbar) / broken(defekt) / slow(langsam) /
//   never_checked(nie geprüft) / disabled(deaktiviert) / parser_error(Parserfehler) /
//   rate_limited(Rate Limit) / http_error(HTTP Fehler). Zusätzlich geführt: letzter
//   Erfolg (lastSuccessAt) und Fehlerserie (errorStreak).
//
// Bewusste Trennung von Momentaufnahme und Serie: eine EINZELNE Beobachtung liefert
// den akuten Zustand; die FEHLERSERIE (errorStreak) + last_success erzeugen die
// Eskalation nach `broken`. So ist ein transienter 429 nicht sofort "defekt", aber
// eine Serie schon.

const SLOW_MS = 5000;             // > 5 s = langsam (aber erreichbar)
const BROKEN_STREAK = 5;          // >= 5 Fehler in Folge -> defekt
const STALE_SUCCESS_MS = 72 * 3600 * 1000; // 72 h ohne Erfolg -> Aufmerksamkeit

function initialHealth() {
  return {
    state: "never_checked",
    errorStreak: 0,
    lastSuccessAt: null,
    lastCheckedAt: null,
    lastLatencyMs: null,
    lastError: null,
    needsAttention: false
  };
}

// Klassifiziert eine EINZELNE Beobachtung in einen akuten Zustand (ohne Serie).
// Reihenfolge = Priorität: deaktiviert > Rate Limit > HTTP-Fehler > Parserfehler >
// (Erfolg: langsam|erreichbar).
function classifyObservation(obs = {}) {
  if (obs.disabled === true) return { state: "disabled", ok: false, error: obs.error || "administrativ deaktiviert" };
  if (obs.rateLimited === true || obs.httpStatus === 429) return { state: "rate_limited", ok: false, error: obs.error || "rate limit" };
  const status = obs.httpStatus;
  if (status != null && status >= 400) return { state: "http_error", ok: false, error: obs.error || `HTTP ${status}` };
  if (obs.parserOk === false) return { state: "parser_error", ok: false, error: obs.error || "parser error" };
  // Kein expliziter Fehler, aber ok===false ohne Klassifikation -> generischer HTTP/Netzfehler.
  if (obs.ok === false && status == null) return { state: "http_error", ok: false, error: obs.error || "abruf fehlgeschlagen" };
  // Erfolg.
  const latency = obs.latencyMs;
  if (latency != null && latency > SLOW_MS) return { state: "slow", ok: true, error: null };
  return { state: "reachable", ok: true, error: null };
}

// Wendet eine Beobachtung auf einen Health-Record an und liefert den NEUEN Record
// (unveränderlich — der Eingabe-Record wird nicht mutiert).
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
    h.state = cls.state; // reachable | slow
  } else if (cls.state === "disabled") {
    // Deaktivierung setzt die Serie NICHT zurück und eskaliert auch nicht — es ist ein
    // administrativer Zustand, kein Fehler.
    h.state = "disabled";
    h.lastError = cls.error;
  } else {
    h.errorStreak = (h.errorStreak || 0) + 1;
    h.lastError = cls.error;
    // Fehlerserie eskaliert zum harten Defekt; sonst bleibt der akute Fehlerzustand sichtbar.
    h.state = h.errorStreak >= (opts.brokenStreak || BROKEN_STREAK) ? "broken" : cls.state;
  }

  h.needsAttention = computeNeedsAttention(h, now, opts);
  return h;
}

function computeNeedsAttention(h, now, opts = {}) {
  if (h.state === "broken" || h.state === "parser_error") return true;
  if ((h.errorStreak || 0) >= (opts.attentionStreak || 3)) return true;
  // Lange kein Erfolg mehr, obwohl geprüft -> Aufmerksamkeit (ruht/versiegt).
  if (now != null && h.lastSuccessAt != null) {
    if (now - h.lastSuccessAt > (opts.staleSuccessMs || STALE_SUCCESS_MS)) return true;
  }
  return false;
}

// Bequeme Faltung einer chronologischen Beobachtungsserie zu EINEM Endzustand.
function foldObservations(observations = [], opts = {}) {
  let h = opts.initial || initialHealth();
  for (const obs of observations) h = applyObservation(h, obs, opts);
  return h;
}

// Aggregierter Flottenbericht über viele Health-Records (für den Admin/Discovery).
function summarizeHealth(records = []) {
  const byState = {};
  let attention = 0;
  for (const r of records) {
    const s = (r && r.state) || "never_checked";
    byState[s] = (byState[s] || 0) + 1;
    if (r && r.needsAttention) attention += 1;
  }
  return { total: records.length, byState, needsAttention: attention };
}

module.exports = {
  SLOW_MS, BROKEN_STREAK, STALE_SUCCESS_MS,
  initialHealth, classifyObservation, applyObservation, foldObservations, summarizeHealth
};
