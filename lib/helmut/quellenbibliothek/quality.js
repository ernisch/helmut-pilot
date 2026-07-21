"use strict";

// Helmut — Universelle Quellenbibliothek · Qualitätsmodell (Auftrag §4).
//
// Reine, deterministische Logik. KEINE KI, kein Netz, kein Storage. Bewertet JEDE
// Quelle NACHVOLLZIEHBAR über acht getrennte Achsen; jede Achse liefert einen
// Teilscore 0..1 + eine Begründung + ein Verfügbarkeits-Flag (lag echte Datengrundlage
// vor?). Der Gesamtscore ist das GEWICHTETE MITTEL der VERFÜGBAREN Achsen — fehlende
// Datengrundlagen werden weggelassen, NICHT als 0 erfunden (Ehrlichkeitsprinzip aus
// dem bestehenden quality-watchdog).
//
// Die acht Achsen (Auftrag §4):
//   authority    Autorität     — Belegfunktion + Vertrauensniveau des Herausgebers.
//   freshness    Aktualität    — wie frisch ist der letzte Ertrag ggü. Erwartung?
//   relevance    Relevanz      — Anteil produktiv genutzter Dokumente (KO-Ausbeute).
//   stability    Stabilität    — Health-Zustand + Fehlerserie.
//   reliability  Ausfallhäufigkeit — Erfolgsquote über beobachtete Abrufe.
//   uniqueness   Einzigartigkeit — Anteil NICHT-duplizierter Beiträge.
//   speed        Geschwindigkeit — Latenz ggü. Schwellen.
//   redundancy   Redundanz     — existiert ein gleichwertiger Ersatz? (Ausfallsicherheit)

const AXES = ["authority", "freshness", "relevance", "stability", "reliability", "uniqueness", "speed", "redundancy"];

// Gewichte (Summe muss NICHT 1 sein — es wird über die verfügbaren Achsen normiert).
const DEFAULT_WEIGHTS = {
  authority: 0.20,
  freshness: 0.15,
  relevance: 0.20,
  stability: 0.15,
  reliability: 0.10,
  uniqueness: 0.10,
  speed: 0.05,
  redundancy: 0.05
};

const AUTHORITY_BY_ROLE = {
  official_primary: 1.0, data_source: 0.9, journalistic: 0.7, direct_interest: 0.55, aggregator: 0.4
};
const TRUST_FACTOR = { hoch: 1.0, mittel: 0.75, niedrig: 0.5, unbekannt: 0.6, blockiert: 0.0 };

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function round3(x) { return x == null ? null : Math.round(x * 1000) / 1000; }
function pct(x) { return `${Math.round(clamp01(x) * 100)}%`; }

// --- Einzelachsen -----------------------------------------------------------

// Autorität: Belegfunktion × Vertrauensfaktor. Immer verfügbar (aus dem Deskriptor).
function axisAuthority(desc) {
  const base = AUTHORITY_BY_ROLE[desc.evidenceRole] != null ? AUTHORITY_BY_ROLE[desc.evidenceRole] : 0.6;
  const trust = TRUST_FACTOR[desc.trust] != null ? TRUST_FACTOR[desc.trust] : 0.6;
  const v = clamp01(base * trust);
  return { value: v, available: true, why: `Belegfunktion ${desc.evidenceRole} × Vertrauen ${desc.trust} = ${pct(v)}` };
}

// Aktualität: Alter des jüngsten Dokuments ggü. der erwarteten Frequenz.
function axisFreshness(desc, m) {
  if (m.latestAgeHours == null) return { value: null, available: false, why: "Kein Ertrags-Zeitstempel — Aktualität unbekannt." };
  const expectedH = frequencyToHours(desc.expectedFrequency);
  // Innerhalb der Erwartung -> 1.0; linear abfallend bis 3× Erwartung -> 0.
  const ratio = m.latestAgeHours / (expectedH || 24);
  const v = clamp01(ratio <= 1 ? 1 : (3 - ratio) / 2);
  return { value: v, available: true, why: `Jüngster Ertrag vor ${round3(m.latestAgeHours)} h (Erwartung ~${expectedH} h) -> ${pct(v)}` };
}

// Relevanz: Anteil der Dokumente, die zu Knowledge Objects führten (Produktnutzen).
function axisRelevance(m) {
  if (!m.documentsAvailable || m.documentCount == null) return { value: null, available: false, why: "Keine Dokumentdaten — Relevanz unbekannt." };
  if (!m.koAvailable) return { value: null, available: false, why: "Keine KO-Daten — Relevanz nicht belegbar." };
  if (m.documentCount === 0) return { value: 0, available: true, why: "Keine Dokumente geliefert." };
  const v = clamp01((m.koCount || 0) / m.documentCount);
  return { value: v, available: true, why: `${m.koCount || 0}/${m.documentCount} Dokumente wurden zu Knowledge Objects (${pct(v)})` };
}

// Stabilität: aus dem Health-Zustand + Fehlerserie.
const HEALTH_STABILITY = {
  reachable: 1.0, slow: 0.7, rate_limited: 0.5, http_error: 0.35, parser_error: 0.3,
  broken: 0.0, never_checked: null, disabled: 0.0
};
function axisStability(desc) {
  const h = desc.health;
  if (!h || h.state === "never_checked") return { value: null, available: false, why: "Nie geprüft — Stabilität unbekannt." };
  const base = HEALTH_STABILITY[h.state];
  if (base == null) return { value: null, available: false, why: `Health-Zustand ${h.state} ohne Stabilitätswert.` };
  const penalty = Math.min(0.5, (h.errorStreak || 0) * 0.1);
  const v = clamp01(base - penalty);
  return { value: v, available: true, why: `Health ${h.state}, Fehlerserie ${h.errorStreak || 0} -> ${pct(v)}` };
}

// Ausfallhäufigkeit: beobachtete Erfolgsquote (Erfolge / Versuche).
function axisReliability(m) {
  const attempts = m.attempts;
  if (attempts == null || attempts === 0) return { value: null, available: false, why: "Keine Abrufhistorie — Ausfallhäufigkeit unbekannt." };
  const v = clamp01((m.successes || 0) / attempts);
  return { value: v, available: true, why: `${m.successes || 0}/${attempts} Abrufe erfolgreich (${pct(v)})` };
}

// Einzigartigkeit: Anteil NICHT-duplizierter Beiträge.
function axisUniqueness(m) {
  if (!m.duplicatesAvailable || m.documentCount == null || m.documentCount === 0) {
    return { value: null, available: false, why: "Keine Dedup-Daten — Einzigartigkeit unbekannt." };
  }
  const v = clamp01(1 - (m.duplicateCount || 0) / m.documentCount);
  return { value: v, available: true, why: `${m.duplicateCount || 0}/${m.documentCount} Beiträge waren Duplikate -> Einzigartigkeit ${pct(v)}` };
}

// Geschwindigkeit: Latenz ggü. Schwellen (schnell < 1 s -> 1.0; > 8 s -> 0).
function axisSpeed(desc, m) {
  const latency = (desc.health && desc.health.lastLatencyMs != null) ? desc.health.lastLatencyMs : m.latencyMs;
  if (latency == null) return { value: null, available: false, why: "Keine Latenzmessung — Geschwindigkeit unbekannt." };
  const v = clamp01((8000 - latency) / 7000);
  return { value: v, available: true, why: `Letzte Latenz ${latency} ms -> ${pct(v)}` };
}

// Redundanz: existiert ein gleichwertiger Ersatz (Ausfallsicherheit)? Mehr Ersatz = höher.
function axisRedundancy(m) {
  if (m.alternativesCount == null) return { value: null, available: false, why: "Keine Ersatzweg-Info — Redundanz unbekannt." };
  const v = clamp01(m.alternativesCount / 2); // 0 Ersatz -> 0; >=2 gleichwertige -> 1
  return { value: v, available: true, why: `${m.alternativesCount} gleichwertige Ersatzquelle(n) -> Ausfallsicherheit ${pct(v)}` };
}

function frequencyToHours(freq) {
  switch (String(freq || "").toLowerCase()) {
    case "hourly": return 1;
    case "multiple_daily": return 6;
    case "daily": return 24;
    case "weekly": return 168;
    case "monthly": return 720;
    default: return 24; // sichere Standarderwartung
  }
}

// --- Gesamtscore ------------------------------------------------------------
// metrics (injiziert, alle optional): {
//   latestAgeHours, documentCount, koCount, duplicateCount, documentsAvailable,
//   koAvailable, duplicatesAvailable, attempts, successes, latencyMs, alternativesCount
// }
function scoreSourceQuality(descriptor, metrics = {}, opts = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...(opts.weights || {}) };
  const m = metrics || {};
  const axisResults = {
    authority: axisAuthority(descriptor),
    freshness: axisFreshness(descriptor, m),
    relevance: axisRelevance(m),
    stability: axisStability(descriptor),
    reliability: axisReliability(m),
    uniqueness: axisUniqueness(m),
    speed: axisSpeed(descriptor, m),
    redundancy: axisRedundancy(m)
  };

  const axes = {}; const usedWeights = {}; const explanation = []; const available = {};
  let weightedSum = 0, weightTotal = 0;
  for (const key of AXES) {
    const r = axisResults[key];
    available[key] = r.available;
    explanation.push(`${key}: ${r.why}`);
    if (!r.available || r.value == null) continue;
    axes[key] = round3(r.value);
    usedWeights[key] = weights[key];
    weightedSum += r.value * weights[key];
    weightTotal += weights[key];
  }

  const score = weightTotal > 0 ? round3(weightedSum / weightTotal) : null;
  return {
    sourceId: descriptor.id,
    score,                          // null = keine einzige Achse belegbar (ehrlich)
    axes,                           // nur die belegbaren Achsen
    weights: usedWeights,           // die tatsächlich verwendeten (normierten Basis-)Gewichte
    availableAxisCount: Object.keys(axes).length,
    totalAxisCount: AXES.length,
    explanation,                    // je Achse eine Zeile — vollständig nachvollziehbar
    available
  };
}

module.exports = {
  AXES, DEFAULT_WEIGHTS, AUTHORITY_BY_ROLE, TRUST_FACTOR,
  frequencyToHours, scoreSourceQuality
};
