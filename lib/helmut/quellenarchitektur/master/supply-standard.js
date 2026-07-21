"use strict";

// Helmut — Master Quellenkatalog · Sprint 3 · Versorgungsstandard je Mandat (Phase 3).
//
// Reine Daten + reine Prueflogik. Definiert fuer jedes Mandat den benoetigten Quellenumfang als
// zwoelf Versorgungsebenen mit je zehn Attributen (Auftrag Phase 3). Der Standard ist DATEN und
// wird pro Mandatsprofil ausgewertet — kein fest codierter Pilot-Sonderfall (Test §22).
//
// Verbindliche Regel (Abnahme §9): Suchanbieter (Google News o. ae.) duerfen nur Ergaenzung und
// Rueckfallebene sein — NIE die alleinige Versorgung einer Partei, eines Ausschusses oder eines
// Mandanten. evaluateLevel erzwingt das: eine Ebene, deren funktionierende Quellen ausschliesslich
// Suchanbieter sind, gilt als NICHT versorgt (bei blockierenden Ebenen -> blockierender Mangel).

const taxonomy = require("./taxonomy");

// Die zwoelf Versorgungsebenen. Jede traegt die zehn Pflichtattribute (Auftrag Phase 3):
//  required, min_working_sources, min_independent_publishers, required_source_types,
//  allowed_substitutes, max_single_provider_share, recency, min_health, min_trust, blocking.
function level(id, name, o) {
  return {
    id, name,
    required: !!o.required,                                   // 1 Pflicht/optional
    min_working_sources: o.min_working_sources,               // 2 Mindestanzahl funktionierender Quellen
    min_independent_publishers: o.min_independent_publishers, // 3 Mindestanzahl unabhaengiger Herausgeber
    required_source_types: o.required_source_types || [],     // 4 notwendige Quellentypen
    allowed_substitutes: o.allowed_substitutes || [],         // 5 zulaessige Ersatzquellen(-typen)
    max_single_provider_share: o.max_single_provider_share,   // 6 max. Abhaengigkeit von einem Anbieter
    recency: o.recency,                                       // 7 Aktualitaetsanforderung
    min_health: o.min_health,                                 // 8 Gesundheitsanforderung
    min_trust: o.min_trust,                                   // 9 Qualitaetsanforderung
    blocking: !!o.blocking                                    // 10 blockierender/nicht blockierender Mangel
  };
}

const SUPPLY_LEVELS = [
  level("institutional_base", "Institutionelle Grundversorgung", {
    required: true, min_working_sources: 4, min_independent_publishers: 3,
    required_source_types: ["parlament", "bundesregierung", "ausschuss"],
    allowed_substitutes: ["bundesrat", "ministerium", "datenportal"],
    max_single_provider_share: 0.5, recency: "daily", min_health: "degraded", min_trust: "hoch", blocking: true
  }),
  level("party", "Partei-Versorgung", {
    required: true, min_working_sources: 1, min_independent_publishers: 1,
    required_source_types: ["partei"], allowed_substitutes: ["fraktion"],
    max_single_provider_share: 1.0, recency: "weekly", min_health: "degraded", min_trust: "mittel", blocking: true
  }),
  level("group", "Fraktionsversorgung", {
    required: true, min_working_sources: 1, min_independent_publishers: 1,
    required_source_types: ["fraktion"], allowed_substitutes: ["partei"],
    max_single_provider_share: 1.0, recency: "weekly", min_health: "degraded", min_trust: "mittel", blocking: true
  }),
  level("person", "Personenversorgung", {
    required: false, min_working_sources: 1, min_independent_publishers: 1,
    required_source_types: ["abgeordnete"], allowed_substitutes: ["suchanbieter"],
    max_single_provider_share: 1.0, recency: "weekly", min_health: "broken", min_trust: "niedrig", blocking: false
  }),
  level("committee", "Ausschussversorgung", {
    required: true, min_working_sources: 1, min_independent_publishers: 1,
    required_source_types: ["ausschuss"], allowed_substitutes: ["parlament", "ministerium"],
    max_single_provider_share: 1.0, recency: "weekly", min_health: "degraded", min_trust: "mittel", blocking: true
  }),
  level("topic", "Themenversorgung", {
    required: false, min_working_sources: 2, min_independent_publishers: 2,
    required_source_types: ["fachmedien", "wissenschaft", "fachverband"],
    allowed_substitutes: ["ministerium", "behoerde", "thinktank", "ngo"],
    max_single_provider_share: 0.6, recency: "weekly", min_health: "degraded", min_trust: "mittel", blocking: false
  }),
  level("ministry", "Ministeriumsversorgung", {
    required: true, min_working_sources: 1, min_independent_publishers: 1,
    required_source_types: ["ministerium"], allowed_substitutes: ["bundesregierung", "behoerde"],
    max_single_provider_share: 1.0, recency: "weekly", min_health: "degraded", min_trust: "hoch", blocking: true
  }),
  level("regional", "Regionalversorgung", {
    required: false, min_working_sources: 1, min_independent_publishers: 1,
    required_source_types: ["medien_regional"], allowed_substitutes: ["landtag", "landesregierung", "kommunal"],
    max_single_provider_share: 0.7, recency: "weekly", min_health: "degraded", min_trust: "mittel", blocking: false
  }),
  level("media", "Medienversorgung", {
    required: true, min_working_sources: 2, min_independent_publishers: 2,
    required_source_types: ["medien_ueberregional"], allowed_substitutes: ["medien_regional", "fachmedien"],
    max_single_provider_share: 0.5, recency: "daily", min_health: "degraded", min_trust: "mittel", blocking: false
  }),
  level("expert_public", "Fachöffentlichkeit", {
    required: false, min_working_sources: 2, min_independent_publishers: 2,
    required_source_types: ["fachverband", "gewerkschaft", "arbeitgeberverband", "wissenschaft", "thinktank", "ngo"],
    allowed_substitutes: [], max_single_provider_share: 0.6, recency: "monthly", min_health: "broken", min_trust: "mittel", blocking: false
  }),
  level("opposition", "Politische Opposition und Gegenpositionen", {
    // Gegenpositionen sind PFLICHT fuer Ausgewogenheit: mindestens zwei UNABHAENGIGE politische
    // Herausgeber (verschiedene Parteien/Fraktionen), damit keine Einseitigkeit entsteht.
    required: true, min_working_sources: 2, min_independent_publishers: 2,
    required_source_types: ["partei", "fraktion"], allowed_substitutes: ["thinktank", "ngo"],
    max_single_provider_share: 0.5, recency: "weekly", min_health: "broken", min_trust: "mittel", blocking: false
  }),
  level("agenda_process", "Termin- und Vorgangsversorgung", {
    required: true, min_working_sources: 1, min_independent_publishers: 1,
    required_source_types: ["parlament", "datenportal"], allowed_substitutes: ["bundesregierung", "ministerium"],
    max_single_provider_share: 1.0, recency: "daily", min_health: "degraded", min_trust: "hoch", blocking: true
  })
];

const LEVEL_BY_ID = new Map(SUPPLY_LEVELS.map((l) => [l.id, l]));

const HEALTH_ORDER = { healthy: 3, degraded: 2, broken: 1, unknown: 0 };
const TRUST_ORDER = { hoch: 3, mittel: 2, niedrig: 1, unbekannt: 0, blockiert: -1 };

function isSearchProviderSource(rec) {
  return taxonomy.isSearchProviderType(rec.source_type) ||
    String(rec.retrieval && rec.retrieval.method || "").toLowerCase().includes("googlenews");
}
function healthOf(rec) { return rec.health || (rec.legacy_path_status === "broken" ? "broken" : "healthy"); }

// Wertet EINE Versorgungsebene gegen die tatsaechlich zugewiesenen (funktionierenden) Quellen aus.
// Eine Quelle "funktioniert", wenn sie serveable ist (active/restricted) und die Gesundheits-/
// Qualitaetsschwelle der Ebene erfuellt. Suchanbieter zaehlen als Ergaenzung, NIE als alleinige
// Versorgung.
function evaluateLevel(levelDef, sources = []) {
  const usable = (Array.isArray(sources) ? sources : []).filter((s) => s && ["active", "restricted"].includes(s.review_status));
  const nonSearch = usable.filter((s) => !isSearchProviderSource(s));
  const searchOnly = usable.filter(isSearchProviderSource);

  const publishers = new Set(nonSearch.map((s) => s.publisher_id));
  const workingCount = nonSearch.length;

  // Anbieter-Abhaengigkeit inkl. Suchanbieter (fuer die 100%-Suchweg-Erkennung zaehlen ALLE).
  const providerCounts = new Map();
  for (const s of usable) providerCounts.set(s.publisher_id, (providerCounts.get(s.publisher_id) || 0) + 1);
  const maxProviderShare = usable.length ? Math.max(...providerCounts.values()) / usable.length : 0;

  const reasons = [];
  let met = true;

  // Regel Abnahme §9: keine alleinige Suchanbieter-Versorgung.
  if (usable.length > 0 && nonSearch.length === 0) {
    met = false; reasons.push("nur-suchanbieter-versorgung");
  }
  if (workingCount < levelDef.min_working_sources) { met = false; reasons.push(`zu-wenige-funktionierende-quellen:${workingCount}/${levelDef.min_working_sources}`); }
  if (publishers.size < levelDef.min_independent_publishers) { met = false; reasons.push(`zu-wenige-unabhaengige-herausgeber:${publishers.size}/${levelDef.min_independent_publishers}`); }
  if (levelDef.max_single_provider_share != null && maxProviderShare > levelDef.max_single_provider_share + 1e-9) {
    met = false; reasons.push(`anbieter-klumpen:${maxProviderShare.toFixed(2)}>${levelDef.max_single_provider_share}`);
  }
  // Notwendige Quellentypen: mindestens einer der geforderten Typen (oder erlaubter Ersatz) vorhanden.
  const presentTypes = new Set(nonSearch.map((s) => s.source_type));
  const acceptableTypes = new Set([...(levelDef.required_source_types || []), ...(levelDef.allowed_substitutes || [])]);
  const hasRequiredType = [...acceptableTypes].some((t) => presentTypes.has(t));
  if (acceptableTypes.size && !hasRequiredType) { met = false; reasons.push("kein-geforderter-quellentyp"); }
  // Qualitaets-/Gesundheitsschwelle: mindestens EINE funktionierende Quelle erfuellt beide.
  const meetsQuality = nonSearch.some((s) =>
    (TRUST_ORDER[s.trust] ?? 0) >= (TRUST_ORDER[levelDef.min_trust] ?? 0) &&
    (HEALTH_ORDER[healthOf(s)] ?? 0) >= (HEALTH_ORDER[levelDef.min_health] ?? 0));
  if (workingCount > 0 && !meetsQuality) { met = false; reasons.push("qualitaets-oder-gesundheitsschwelle-nicht-erreicht"); }

  const blockingDeficiency = !met && levelDef.required && levelDef.blocking;
  return {
    level: levelDef.id, name: levelDef.name, required: levelDef.required,
    met, blockingDeficiency,
    workingCount, independentPublishers: publishers.size,
    searchOnlyCount: searchOnly.length, maxProviderShare: Number(maxProviderShare.toFixed(3)),
    reasons
  };
}

// Wertet den GESAMTEN Versorgungsstandard fuer ein Mandat aus. sourcesByLevel: {levelId: [records]}.
function evaluateSupply(sourcesByLevel = {}, levels = SUPPLY_LEVELS) {
  const perLevel = levels.map((l) => evaluateLevel(l, sourcesByLevel[l.id] || []));
  const blocking = perLevel.filter((r) => r.blockingDeficiency);
  const unmetRequired = perLevel.filter((r) => r.required && !r.met);
  return {
    ok: blocking.length === 0,
    fullyMet: perLevel.every((r) => r.met),
    blockingDeficiencies: blocking.map((r) => r.level),
    unmetRequired: unmetRequired.map((r) => r.level),
    perLevel
  };
}

module.exports = { SUPPLY_LEVELS, LEVEL_BY_ID, evaluateLevel, evaluateSupply, isSearchProviderSource };
