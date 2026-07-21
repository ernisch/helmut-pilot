"use strict";

// Helmut — Quellenplattform · Sprint 4 (Shadow) · Parallele Berechnung (Aufgabe 3).
// =============================================================================================
// Fuer JEDES getestete Mandat wird UNABHAENGIG berechnet:
//   (1) die LEGACY-Quellenversorgung (Kompatibilitaetsschicht, bleibt allein sichtbar) und
//   (2) der NEUE dynamische Laufzeit-Versorgungsplan (konsolidierte Architektur).
// Beide laufen getrennt; ein Fehler im NEUEN Pfad beschaedigt Legacy NIE (harte Trennung).
//
// Reine, deterministische Logik. KEIN Netz/KI/Storage-Write. Legacy ist und bleibt das allein
// sichtbare Ergebnis; der neue Plan ist rein intern.

const { deriveRequirement, scoreSource } = require("../quellenbibliothek/assignment");
const versorgungsplan = require("./konsolidierung-versorgungsplan");

// Belegfunktion/Methode -> Versorgungsebene (Feld 2). Suchanbieter/Aggregator sind eine eigene Ebene.
function supplyLevel(evidenceRole, method) {
  if (method === "search" || evidenceRole === "aggregator") return "aggregator_suchanbieter";
  switch (evidenceRole) {
    case "official_primary": return "primaer_amtlich";
    case "data_source": return "primaer_daten";
    case "direct_interest": return "primaer_direkt";      // Primaerquelle fuer die EIGENE Position
    case "journalistic": return "sekundaer_journalistisch";
    default: return "unbekannt";
  }
}
function isSearchProvider(source) {
  return source.method === "search" || source.evidenceRole === "aggregator";
}

// Legacy-Versorgung (Kompatibilitaetsschicht) — bleibt das allein sichtbare Ergebnis.
function computeLegacySupply(profile, legacyAdapter, opts = {}) {
  const resolved = legacyAdapter.resolveFor(profile);
  const status = legacyAdapter.supplyStatusFor(profile);
  return {
    visible: true,                          // Legacy ist IMMER das sichtbare Ergebnis
    packages: resolved.all,
    requiredPackages: resolved.required,
    requiredMissing: resolved.requiredMissing,
    optionalPackages: resolved.optional,
    fullyActivated: status.fullyActivated,
    missingBasePackages: status.missingBasePackages,
    sourceLevelAvailable: legacyAdapter.sourceLevelAvailable,
    reason: status.reason
  };
}

// Der NEUE dynamische Laufzeit-Versorgungsplan mit allen 11 Pflichtfeldern (Aufgabe 3).
function computeNewPlan(profile, registry, opts = {}) {
  const health = opts.healthAdapter || null;
  const quality = opts.qualityAdapter || null;
  const requirement = deriveRequirement(profile);
  const plan = versorgungsplan.buildSupplyPlan(profile, registry, { requirement });

  // Feld 1-6 je Quelle anreichern.
  const sources = plan.sources.map((s) => {
    const level = supplyLevel(s.evidenceRole, s.method);
    const healthState = health ? health.healthOf(s.id) : "unbekannt";
    const rankScore = (quality && quality.available)
      ? safeRankingScore(s, quality, healthState)
      : null;
    return {
      id: s.id, name: s.name, publisher: s.publisher,
      versorgungsebene: level,                                  // Feld 2
      auswahlgrund: s.reasons,                                  // Feld 3
      relevanz: s.score,                                        // Feld 4
      qualitaet: rankScore != null ? rankScore : "unbekannt",  // Feld 5 (ehrlich unbekannt ohne Daten)
      gesundheit: healthState,                                  // Feld 6
      evidenceRole: s.evidenceRole, trust: s.trust, method: s.method,
      suchanbieter: isSearchProvider(s)
    };
  });

  // Feld 8: ausgeschlossene Quellen MIT Grund (in-scope-Kandidaten, die verworfen wurden).
  const selectedIds = new Set(sources.map((s) => s.id));
  const excluded = computeExcluded(registry, requirement, selectedIds);

  // Feld 9: verbleibende Versorgungsluecken (Anforderungswerte ohne deckende Quelle).
  const gaps = computeGaps(requirement, plan.sources);

  // Feld 7: Alternativen je Dimension (Redundanz).
  const alternatives = computeAlternatives(plan.sources);

  // Feld 10: Abhaengigkeit von Suchanbietern.
  const searchProviderSources = sources.filter((s) => s.suchanbieter);
  const searchProviderShare = sources.length ? round3(searchProviderSources.length / sources.length) : 0;
  // Pflichtbedarf (Partei/Fraktion/Ausschuss) NUR ueber einen Suchanbieter gedeckt?
  const soleSearchMandatory = computeSoleSearchMandatory(requirement, plan.sources);

  // Feld 11: Gesamtstatus.
  const gesamtstatus = computeStatus({ requirement, sourceCount: sources.length, gaps, soleSearchMandatory, planReason: plan.reason });

  return {
    kind: "runtime_supply_plan",
    persisted: false,
    mandateId: plan.mandateId,
    requirement,
    sources,                                                   // Feld 1
    sourceCount: sources.length,
    alternativen: alternatives,                                // Feld 7
    ausgeschlossen: excluded,                                  // Feld 8
    versorgungsluecken: gaps,                                  // Feld 9
    suchanbieterAbhaengigkeit: {                               // Feld 10
      anzahl: searchProviderSources.length,
      anteil: searchProviderShare,
      alleinversorgungPflicht: soleSearchMandatory
    },
    gesamtstatus,                                              // Feld 11
    healthAvailable: !!(health && health.available),
    qualityAvailable: !!(quality && quality.available)
  };
}

function safeRankingScore(source, quality, healthState) {
  try {
    const desc = { id: source.id, evidenceRole: source.evidenceRole, trust: source.trust };
    const metricsBySource = (quality.sourceMetrics && quality.sourceMetrics.bySource) || {};
    const m = metricsBySource[source.id] || {};
    const modelle = require("./konsolidierung-modelle");
    const r = modelle.rankingScore(desc, {
      attempts: m.attempts, successes: m.successes, documentCount: m.documentCount, koCount: m.koCount
    }, { canonicalHealthState: healthState });
    return r.score;
  } catch { return null; }
}

// Kandidaten-Dimensionen — spiegeln die MATCH_DIMENSIONS der Zuweisung (assignment.js): der
// Politikfeld-Bedarf liest quellenseitig committees UND topics (Ausschuss<->Thema-Bruecke).
const CANDIDATE_DIMS = [
  { want: "factions", have: ["factions"] },
  { want: "parties", have: ["parties"] },
  { want: "policyFields", have: ["committees", "topics"] },
  { want: "ministries", have: ["ministries"] },
  { want: "regions", have: ["regions"] }
];

// In-scope-Kandidaten (matchen mind. eine Dimension) minus Auswahl = ausgeschlossen MIT Grund.
function computeExcluded(registry, requirement, selectedIds) {
  const candidateIds = new Set(registry.universalSources().map((d) => d.id));
  for (const dim of CANDIDATE_DIMS) {
    for (const v of requirement[dim.want] || []) {
      for (const field of dim.have) {
        for (const id of registry.idsFor(field, v)) candidateIds.add(id);
      }
    }
  }
  const out = [];
  for (const id of candidateIds) {
    if (selectedIds.has(id)) continue;
    const d = registry.get(id);
    if (!d) continue;
    if (!registry.isEligible(d)) {
      out.push({ id, grund: eligibilityReason(d) });
      continue;
    }
    const verdict = scoreSource(d, requirement);
    if (!verdict.relevant) out.push({ id, grund: "keine-relevante-ueberschneidung" });
  }
  return out.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}
function eligibilityReason(d) {
  if (d.status === "archived") return "status-archiviert";
  if (d.status === "paused") return "status-pausiert";
  if (d.trust === "blockiert") return "vertrauen-blockiert";
  if (d.license === "prohibited") return "lizenz-untersagt";
  return "nicht-abrufbar";
}

// Anforderungswerte je Dimension, die KEINE gewaehlte Quelle deckt (universale Basis zaehlt separat).
function computeGaps(requirement, selectedSources) {
  const matchedByDim = {};
  for (const s of selectedSources) {
    for (const r of s.reasons || []) {
      if (r.dimension === "universal") continue;
      for (const v of r.matched || []) {
        (matchedByDim[r.dimension] || (matchedByDim[r.dimension] = new Set())).add(v);
      }
    }
  }
  // policyFields deckt committees∪topics; regions/parties/factions/ministries direkt.
  const checks = [
    { need: "parties", dims: ["parties"] },
    { need: "factions", dims: ["factions"] },
    { need: "committees", dims: ["policyFields"] },
    { need: "topics", dims: ["policyFields"] },
    { need: "regions", dims: ["regions"] },
    { need: "ministries", dims: ["ministries"] }
  ];
  const gaps = [];
  for (const c of checks) {
    for (const v of requirement[c.need] || []) {
      const covered = c.dims.some((d) => matchedByDim[d] && matchedByDim[d].has(v));
      if (!covered) gaps.push({ dimension: c.need, wert: v });
    }
  }
  return gaps;
}

function computeAlternatives(selectedSources) {
  const byDim = {};
  for (const s of selectedSources) {
    for (const r of s.reasons || []) {
      if (r.dimension === "universal") continue;
      for (const v of r.matched || []) {
        const key = `${r.dimension}:${v}`;
        (byDim[key] || (byDim[key] = [])).push(s.id);
      }
    }
  }
  // Nur Dimensionen mit mehr als einer Quelle sind echte Alternativen/Redundanz.
  const out = {};
  for (const [key, ids] of Object.entries(byDim)) if (ids.length > 1) out[key] = ids.sort();
  return out;
}

// Pflichtbedarf (Partei/Fraktion/Ausschuss), der NUR ueber einen Suchanbieter gedeckt ist.
function computeSoleSearchMandatory(requirement, selectedSources) {
  const mandatory = [
    { need: "parties", dim: "parties" },
    { need: "factions", dim: "factions" },
    { need: "committees", dim: "policyFields" }
  ];
  const out = [];
  for (const m of mandatory) {
    for (const v of requirement[m.need] || []) {
      const covering = selectedSources.filter((s) =>
        (s.reasons || []).some((r) => r.dimension === m.dim && (r.matched || []).includes(v)));
      if (covering.length && covering.every((s) => s.method === "search" || s.evidenceRole === "aggregator")) {
        out.push({ dimension: m.need, wert: v });
      }
    }
  }
  return out;
}

function computeStatus({ requirement, sourceCount, gaps, soleSearchMandatory, planReason }) {
  if (requirement.usable === false || planReason === "mandat-nicht-aktivierbar") return "blockiert";
  if (sourceCount === 0) return "blockiert";
  if (gaps.length > 0 || soleSearchMandatory.length > 0) return "eingeschraenkt";
  return "vollstaendig";
}

// Ein Mandat im Shadow-Betrieb: Legacy (sichtbar) + Neu (intern) UNABHAENGIG. Ein Fehler im
// neuen Pfad wird gefangen und beschaedigt das Legacy-Ergebnis nicht (Aufgabe 6, Regel 9).
function runShadowMandate(profile, ctx = {}) {
  const legacy = computeLegacySupply(profile, ctx.legacyAdapter);
  let neu = null; let neuError = null;
  try {
    neu = computeNewPlan(profile, ctx.registry, { healthAdapter: ctx.healthAdapter, qualityAdapter: ctx.qualityAdapter });
  } catch (e) {
    neuError = { klasse: e && e.name ? e.name : "Error", message: e && e.message ? e.message : String(e) };
    neu = null;
  }
  return {
    mandateId: legacyId(profile),
    legacy,
    neu,
    neuError,
    legacyIntact: legacy && legacy.visible === true    // Legacy bleibt unabhaengig vom neuen Pfad
  };
}
function legacyId(profile) {
  return String((profile && (profile.id || profile.user_id || profile.politicianId)) || "").trim() || null;
}

function round3(x) { return Math.round(x * 1000) / 1000; }

module.exports = {
  supplyLevel, isSearchProvider,
  computeLegacySupply, computeNewPlan, runShadowMandate,
  computeExcluded, computeGaps, computeAlternatives, computeSoleSearchMandatory, computeStatus
};
