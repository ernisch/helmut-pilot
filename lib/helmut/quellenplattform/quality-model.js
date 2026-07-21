"use strict";

// Helmut — Quellenplattform (Konsolidierung) · EIN Qualitaetsmodell (Aufgabe 6).
//
// Reine, deterministische Logik. KEINE KI, kein Netz, kein Storage. Loest das parallele
// Qualitaetsmodell (S2 quellenbibliothek/quality.js) und den Watchdog (main quality-watchdog.js)
// als EINE nachvollziehbare Bewertung ueber ZEHN getrennte Achsen ab.
//
// KERNPRINZIP (Aufgabe 6): fehlende Daten sind UNBEKANNT, nicht NEGATIV. Jede Achse liefert
// { value (0..1|null), available (bool), why }. Der Gesamtscore ist das GEWICHTETE MITTEL der
// VERFUEGBAREN Achsen — eine nie gepruefte Quelle bekommt KEIN schlechtes Urteil, sondern ein
// ehrliches "zu wenig Datengrundlage". (Uebernommen aus der Ehrlichkeit von S2 quality.js.)
//
// Die ZEHN Achsen (Auftrag Aufgabe 6):
//   authority              Autoritaet                  (Belegfunktion des Quellentyps x Vertrauen)
//   freshness              Aktualitaet                 (Alter des juengsten Ertrags ggue. Erwartung)
//   mandateRelevance       direkte Mandatsrelevanz     (Partei/Fraktion-Treffer der Zuweisung)
//   thematicRelevance      thematische Relevanz        (Ausschuss/Politikfeld/Thema-Treffer)
//   regionalRelevance      regionale Relevanz          (Regions-Treffer)
//   stability              Stabilitaet                 (Gesundheitszustand + Fehlerserie)
//   uniqueness             Einzigartigkeit             (Anteil nicht-duplizierter Beitraege)
//   independence           Unabhaengigkeit             (kein Alleingang eines Suchanbieters)
//   legalStatus            rechtlicher Pruefstatus     (Lizenz/Datenschutz — unbewertet = unbekannt)
//   technicalAvailability  technische Verfuegbarkeit   (Erfolgsquote / Auslieferbarkeit)

const taxonomy = require("../quellenarchitektur/master/taxonomy");
const masterModel = require("../quellenarchitektur/master/model");
const health = require("./health-model");

const AXES = Object.freeze([
  "authority", "freshness", "mandateRelevance", "thematicRelevance", "regionalRelevance",
  "stability", "uniqueness", "independence", "legalStatus", "technicalAvailability"
]);

// Gewichte muessen NICHT 1 ergeben — es wird ueber die verfuegbaren Achsen normiert.
const DEFAULT_WEIGHTS = Object.freeze({
  authority: 0.15, freshness: 0.10, mandateRelevance: 0.15, thematicRelevance: 0.10,
  regionalRelevance: 0.05, stability: 0.10, uniqueness: 0.08, independence: 0.09,
  legalStatus: 0.08, technicalAvailability: 0.10
});

const AUTHORITY_BY_ROLE = Object.freeze({
  official_primary: 1.0, data_source: 0.9, journalistic: 0.7, direct_interest: 0.55, aggregator: 0.4
});
const TRUST_FACTOR = Object.freeze({ hoch: 1.0, mittel: 0.75, niedrig: 0.5, unbekannt: null, blockiert: 0.0 });
// Stabilitaet je vereinheitlichtem Gesundheitszustand (never_checked -> unbekannt).
const HEALTH_STABILITY = Object.freeze({
  healthy: 1.0, slow: 0.7, degraded: 0.5, rate_limited: 0.4, http_error: 0.3,
  parser_error: 0.3, broken: 0.0, disabled: 0.0, quarantined: 0.0, never_checked: null
});
// Lizenzstatus -> Wert. 'unbewertet'/'unklar' = UNBEKANNT (null), NICHT negativ.
const LICENSE_VALUE = Object.freeze({
  offen_erlaubt: 1.0, presse_erlaubt: 0.85, eingeschraenkt: 0.5, untersagt: 0.0,
  unbewertet: null, unklar: null
});
const PRIVACY_VALUE = Object.freeze({
  unbedenklich: 1.0, oeffentliche_mandatsdaten: 0.9, unzulaessig: 0.0,
  unbewertet: null, pruefung_noetig: null
});

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function round3(x) { return x == null ? null : Math.round(x * 1000) / 1000; }
function pct(x) { return `${Math.round(clamp01(x) * 100)}%`; }
function unavailable(why) { return { value: null, available: false, why }; }

// evidence_role/trust einer Quelle: Quelle > publisher > Taxonomie-Default.
function evidenceRoleOf(source) {
  if (source.evidence_role) return source.evidence_role;
  const t = taxonomy.getSourceType(source.source_type);
  return t ? t.evidence_role : "aggregator";
}
function trustOf(source) { return source.trust || (taxonomy.getSourceType(source.source_type) || {}).default_trust || "unbekannt"; }

// --- Achse 1: Autoritaet — immer verfuegbar (strukturell aus Typ + Vertrauen) ---------------
function axisAuthority(source) {
  const role = evidenceRoleOf(source);
  const base = AUTHORITY_BY_ROLE[role] != null ? AUTHORITY_BY_ROLE[role] : 0.5;
  const tf = TRUST_FACTOR[trustOf(source)];
  if (tf == null) {
    // Vertrauen unbekannt: Autoritaet ist allein aus der Belegfunktion nur grob -> als
    // verfuegbar mit Belegfunktions-Basiswert, aber ehrlich gekennzeichnet.
    return { value: round3(base * 0.6), available: true, why: `Belegfunktion ${role}, Vertrauen unbekannt -> grober Basiswert ${pct(base * 0.6)}` };
  }
  const v = clamp01(base * tf);
  return { value: round3(v), available: true, why: `Belegfunktion ${role} × Vertrauen ${trustOf(source)} = ${pct(v)}` };
}

// --- Achse 2: Aktualitaet -------------------------------------------------------------------
function axisFreshness(source, m) {
  if (m.latestAgeHours == null) return unavailable("Kein Ertrags-Zeitstempel — Aktualität unbekannt.");
  const expectedH = frequencyToHours((source.retrieval && source.retrieval.expected_frequency) || source.expected_frequency);
  const ratio = m.latestAgeHours / (expectedH || 24);
  const v = clamp01(ratio <= 1 ? 1 : (3 - ratio) / 2);
  return { value: round3(v), available: true, why: `Jüngster Ertrag vor ${round3(m.latestAgeHours)} h (Erwartung ~${expectedH} h) -> ${pct(v)}` };
}

// --- Achsen 3-5: Relevanz aus dem Zuweisungsurteil ------------------------------------------
// Ohne Zuweisungskontext (mandatsunabhaengige Bewertung) sind diese Achsen UNBEKANNT — nicht 0.
function relevanceFromAssignment(assignment, dims) {
  if (!assignment || !Array.isArray(assignment.reasons)) return null; // kein Kontext -> unbekannt
  let matched = 0, weight = 0;
  for (const r of assignment.reasons) {
    if (!dims.includes(r.dimension)) continue;
    matched += Array.isArray(r.matched) ? r.matched.length : 1;
    weight += r.weight || 1;
  }
  return { matched, weight };
}
function axisMandateRelevance(source, assignment) {
  const r = relevanceFromAssignment(assignment, ["parties", "factions"]);
  if (r == null) return unavailable("Ohne Mandatskontext — direkte Mandatsrelevanz unbekannt.");
  const v = clamp01(r.weight / 5); // Fraktion(5)/Partei(4) -> ein direkter Treffer ~ hoch
  return { value: round3(v), available: true, why: r.matched ? `${r.matched} direkter Partei/Fraktion-Treffer -> ${pct(v)}` : "kein direkter Partei/Fraktion-Treffer" };
}
function axisThematicRelevance(source, assignment) {
  const r = relevanceFromAssignment(assignment, ["policyFields", "ministries"]);
  if (r == null) return unavailable("Ohne Mandatskontext — thematische Relevanz unbekannt.");
  const v = clamp01(r.weight / 6);
  return { value: round3(v), available: true, why: r.matched ? `${r.matched} Ausschuss/Themen-Treffer -> ${pct(v)}` : "kein thematischer Treffer" };
}
function axisRegionalRelevance(source, assignment) {
  const r = relevanceFromAssignment(assignment, ["regions"]);
  if (r == null) return unavailable("Ohne Mandatskontext — regionale Relevanz unbekannt.");
  // Nur bewertbar, wenn die Quelle regional ist ODER regionale Anforderung matcht; eine
  // bundesweite Quelle ist regional "neutral" -> unbekannt statt 0.
  const isRegional = (source.region_ids && source.region_ids.length) || ["land", "kommune", "bezirk", "kreis"].includes(source.political_level);
  if (!isRegional && !r.matched) return unavailable("Bundesweite Quelle — regionale Relevanz nicht anwendbar.");
  const v = clamp01(r.weight / 2);
  return { value: round3(v), available: true, why: r.matched ? `${r.matched} Regions-Treffer -> ${pct(v)}` : "regionale Quelle ohne Regions-Treffer" };
}

// --- Achse 6: Stabilitaet -------------------------------------------------------------------
function axisStability(source, m) {
  const state = health.normalize((source.health && source.health.state) || source.health || "never_checked");
  const base = HEALTH_STABILITY[state];
  if (base == null) return unavailable("Nie geprüft — Stabilität unbekannt.");
  const streak = (source.health && source.health.errorStreak) || m.errorStreak || 0;
  const v = clamp01(base - Math.min(0.5, streak * 0.1));
  return { value: round3(v), available: true, why: `Gesundheit ${state}, Fehlerserie ${streak} -> ${pct(v)}` };
}

// --- Achse 7: Einzigartigkeit ---------------------------------------------------------------
function axisUniqueness(m) {
  if (!m.duplicatesAvailable || m.documentCount == null || m.documentCount === 0) {
    return unavailable("Keine Dedup-Daten — Einzigartigkeit unbekannt.");
  }
  const v = clamp01(1 - (m.duplicateCount || 0) / m.documentCount);
  return { value: round3(v), available: true, why: `${m.duplicateCount || 0}/${m.documentCount} Duplikate -> Einzigartigkeit ${pct(v)}` };
}

// --- Achse 8: Unabhaengigkeit ---------------------------------------------------------------
// Strukturell immer verfuegbar: ein Suchanbieter ist per se abhaengig (nie alleinige Versorgung);
// eine amtliche/primaerquellenfaehige Quelle ist unabhaengig. Ersatzwege erhoehen die Sicherheit.
function axisIndependence(source, m) {
  const isSearch = masterModel.isSearchProviderSource(source);
  const typeMeta = taxonomy.getSourceType(source.source_type) || {};
  let base;
  if (isSearch) base = 0.2;                       // Suchanbieter: strukturell abhaengig
  else if (typeMeta.primary_capable) base = 0.9;  // eigenstaendige Primaerquelle
  else base = 0.6;                                // journalistisch/sekundaer
  const alt = m.alternativesCount == null ? 0 : Math.min(0.1, m.alternativesCount * 0.05);
  const v = clamp01(base + alt);
  return { value: round3(v), available: true, why: isSearch ? "Suchanbieter — strukturell abhängig" : `${typeMeta.primary_capable ? "eigenständige Primärquelle" : "sekundär"} -> ${pct(v)}` };
}

// --- Achse 9: rechtlicher Pruefstatus -------------------------------------------------------
// 'unbewertet'/'unklar'/'pruefung_noetig' = UNBEKANNT (null), niemals als schlechte Qualitaet.
function axisLegalStatus(source) {
  const lic = LICENSE_VALUE[source.license_status];
  const priv = PRIVACY_VALUE[source.privacy_status];
  const parts = [lic, priv].filter((x) => x != null);
  if (!parts.length) return unavailable(`Rechtsstatus unbewertet (Lizenz ${source.license_status}, Datenschutz ${source.privacy_status}) — unbekannt, nicht negativ.`);
  const v = clamp01(parts.reduce((a, b) => a + b, 0) / parts.length);
  return { value: round3(v), available: true, why: `Lizenz ${source.license_status}/Datenschutz ${source.privacy_status} -> ${pct(v)}` };
}

// --- Achse 10: technische Verfuegbarkeit ----------------------------------------------------
function axisTechnicalAvailability(source, m) {
  if (m.attempts != null && m.attempts > 0) {
    const v = clamp01((m.successes || 0) / m.attempts);
    return { value: round3(v), available: true, why: `${m.successes || 0}/${m.attempts} Abrufe erfolgreich (${pct(v)})` };
  }
  const state = health.normalize((source.health && source.health.state) || source.health || "never_checked");
  if (state === "never_checked") return unavailable("Keine Abrufhistorie — technische Verfügbarkeit unbekannt.");
  const v = health.isServeable(state) ? 0.8 : 0.1;
  return { value: round3(v), available: true, why: `Ohne Historie aus Gesundheit ${state} abgeleitet -> ${pct(v)}` };
}

function frequencyToHours(freq) {
  switch (String(freq || "").toLowerCase()) {
    case "hourly": return 1;
    case "multiple_daily": return 6;
    case "daily": return 24;
    case "weekly": return 168;
    case "monthly": return 720;
    default: return 24;
  }
}

// --- Gesamtscore ----------------------------------------------------------------------------
// source: kanonisches Laufzeit-Quellobjekt (runtime-source). metrics: injizierte Betriebsdaten
// (alle optional). assignment: das Zuweisungsurteil (fuer die drei Relevanz-Achsen).
function scoreQuality(source = {}, opts = {}) {
  const m = opts.metrics || {};
  const assignment = opts.assignment || null;
  const weights = { ...DEFAULT_WEIGHTS, ...(opts.weights || {}) };

  const results = {
    authority: axisAuthority(source),
    freshness: axisFreshness(source, m),
    mandateRelevance: axisMandateRelevance(source, assignment),
    thematicRelevance: axisThematicRelevance(source, assignment),
    regionalRelevance: axisRegionalRelevance(source, assignment),
    stability: axisStability(source, m),
    uniqueness: axisUniqueness(m),
    independence: axisIndependence(source, m),
    legalStatus: axisLegalStatus(source),
    technicalAvailability: axisTechnicalAvailability(source, m)
  };

  const axes = {}; const usedWeights = {}; const explanation = []; const available = {};
  let weightedSum = 0, weightTotal = 0;
  for (const key of AXES) {
    const r = results[key];
    available[key] = r.available;
    explanation.push(`${key}: ${r.why}`);
    if (!r.available || r.value == null) continue;
    axes[key] = r.value;
    usedWeights[key] = weights[key];
    weightedSum += r.value * weights[key];
    weightTotal += weights[key];
  }
  const score = weightTotal > 0 ? round3(weightedSum / weightTotal) : null;
  return {
    sourceId: source.id || null,
    score,                                  // null = keine einzige Achse belegbar (ehrlich unbekannt)
    axes, weights: usedWeights,
    availableAxisCount: Object.keys(axes).length,
    totalAxisCount: AXES.length,
    unknownAxes: AXES.filter((k) => !available[k]),
    explanation, available
  };
}

module.exports = {
  AXES, DEFAULT_WEIGHTS, AUTHORITY_BY_ROLE, TRUST_FACTOR, HEALTH_STABILITY,
  LICENSE_VALUE, PRIVACY_VALUE, frequencyToHours, scoreQuality
};
