"use strict";

// Helmut — Master Quellenkatalog · Sprint 3 · Abdeckungs-/Ausgewogenheitsmatrix (Phase 9).
//
// Reine Zaehl-/Schwellenlogik (keine KI, kein Netz, kein Storage). DATENGETRIEBEN: die Matrix
// iteriert ueber die uebergebenen Entitaeten (Parteien/Fraktionen/Ausschuesse/Bundeslaender) —
// eine neue Partei/ein neuer Ausschuss/ein neues Bundesland erscheint automatisch, sobald die
// Entitaet + Quellen vorhanden sind (Abnahme §7/§8, Tests §23/§24/§25).
//
// Gewichtung (Auftrag): Faktenquellen zaehlen staerker als Meinungsbeitraege; politische
// Positionen werden als Positionen ausgewiesen, nie als neutrale Fakten. Suchanbieter-
// Abhaengigkeit wird je Dimension sichtbar gemacht (Abnahme §9/§10).

const taxonomy = require("./taxonomy");
const model = require("./model");

const DEFAULT_THRESHOLDS = Object.freeze({
  underSupply: 1,          // < diese Zahl funktionierender Quellen -> Unterversorgung
  overSupply: 12,          // > diese Zahl -> Ueberversorgung (Pruefhinweis, kein Fehler)
  maxProviderShare: 0.6,   // > Anteil eines Anbieters -> Klumpenrisiko
  minCounterParties: 2,    // < so viele Parteien mit Positionsquellen -> fehlende Gegenpositionen
  monocultureMax: 1        // Thema/Ausschuss von <= so vielen Herausgebern -> Monokultur
});

function isSearch(rec) { return model.isSearchProviderSource(rec); }
function serveable(rec) { return ["active", "restricted"].includes(rec.review_status); }
function stanceOf(rec) {
  const t = taxonomy.getSourceType(rec.source_type);
  return rec.content_stance || (t ? t.content_stance : "journalistic");
}
// Gewicht: Fakt 3, Analyse 2, Journalismus 1.5, Position 1 (Positionen sind Positionen, kein Fakt).
function weightOf(rec) {
  switch (stanceOf(rec)) {
    case "fact": return 3;
    case "analysis": return 2;
    case "journalistic": return 1.5;
    case "position": return 1;
    default: return 1;
  }
}

function bucketStats(records) {
  const working = records.filter(serveable);
  const nonSearch = working.filter((r) => !isSearch(r));
  const publishers = new Set(nonSearch.map((r) => r.publisher_id));
  const providerCounts = new Map();
  for (const r of working) providerCounts.set(r.publisher_id, (providerCounts.get(r.publisher_id) || 0) + 1);
  const maxShare = working.length ? Math.max(...providerCounts.values()) / working.length : 0;
  const searchShare = working.length ? working.filter(isSearch).length / working.length : 0;
  const weight = nonSearch.reduce((s, r) => s + weightOf(r), 0);
  return {
    total: records.length, working: working.length, nonSearch: nonSearch.length,
    publishers: publishers.size, maxProviderShare: Number(maxShare.toFixed(3)),
    searchShare: Number(searchShare.toFixed(3)), searchOnly: working.length > 0 && nonSearch.length === 0,
    factWeight: Number(weight.toFixed(1))
  };
}

function classifyBucket(stats, th) {
  const flags = [];
  if (stats.working < th.underSupply) flags.push("unterversorgung");
  if (stats.working > th.overSupply) flags.push("ueberversorgung");
  if (stats.maxProviderShare > th.maxProviderShare + 1e-9 && stats.working > 1) flags.push("anbieter-klumpen");
  if (stats.searchOnly) flags.push("nur-suchanbieter");
  return flags;
}

// records: kanonische Quellenrecords. entities: {parties, groups, committees}. geographies: [land...].
function buildCoverageMatrix(input = {}) {
  const records = Array.isArray(input.records) ? input.records : [];
  const th = { ...DEFAULT_THRESHOLDS, ...(input.thresholds || {}) };
  const parties = input.parties || [];
  const groups = input.groups || [];
  const committees = input.committees || [];
  const laender = input.laender || [];

  const byParty = parties.map((p) => {
    const recs = records.filter((r) => r.party_id === p.id);
    const stats = bucketStats(recs);
    return { id: p.id, name: p.name, ...stats, flags: classifyBucket(stats, th) };
  });
  const byGroup = groups.map((g) => {
    const recs = records.filter((r) => r.group_id === g.id);
    const stats = bucketStats(recs);
    return { id: g.id, name: g.name, ...stats, flags: classifyBucket(stats, th) };
  });
  const byCommittee = committees.map((c) => {
    const recs = records.filter((r) => (r.committee_ids || []).includes(c.id));
    const stats = bucketStats(recs);
    const flags = classifyBucket(stats, th);
    if (stats.working > 0 && stats.publishers <= th.monocultureMax) flags.push("monokultur");
    return { id: c.id, name: c.name, ...stats, flags };
  });
  const byBundesland = laender.map((l) => {
    // Exakt das Land ODER ein Kind (Bezirk/Kreis/Kommune) dieses Landes — NICHT ein anderes Land,
    // dessen Slug ein Praefix ist (fruher: 'geo-land-sachsen' schluckte 'geo-land-sachsen-anhalt').
    const recs = records.filter((r) => (r.region_ids || []).some((rid) => rid === l.id || childOfLand(rid, l.id)));
    const stats = bucketStats(recs);
    const flags = classifyBucket(stats, th);
    return { id: l.id, name: l.name, ...stats, flags };
  });
  const bySourceType = taxonomy.SOURCE_TYPES.map((t) => {
    const recs = records.filter((r) => r.source_type === t.id);
    return { id: t.id, name: t.name, total: recs.length, working: recs.filter(serveable).length, is_official: t.is_official };
  });
  // Perspektive: Fakt vs. Position vs. Journalismus vs. Analyse.
  const byStance = {};
  for (const st of taxonomy.CONTENT_STANCES) byStance[st] = 0;
  for (const r of records.filter(serveable)) byStance[stanceOf(r)] = (byStance[stanceOf(r)] || 0) + 1;

  // Aggregierte Befunde (Auftrag Phase 9).
  const partiesWithPositions = byParty.filter((b) => records.some((r) => r.party_id === b.id && stanceOf(r) === "position" && serveable(r))).length;
  const groupsWithPositions = byGroup.filter((b) => b.working > 0).length;
  const workingRecs = records.filter(serveable);
  const overallSearchShare = workingRecs.length ? Number((workingRecs.filter(isSearch).length / workingRecs.length).toFixed(3)) : 0;

  const findings = {
    ueberversorgung: [...byParty, ...byGroup, ...byCommittee, ...byBundesland].filter((b) => b.flags.includes("ueberversorgung")).map((b) => b.id),
    unterversorgung: [...byParty, ...byGroup, ...byCommittee, ...byBundesland].filter((b) => b.flags.includes("unterversorgung")).map((b) => b.id),
    anbieterKlumpen: [...byParty, ...byGroup, ...byCommittee, ...byBundesland].filter((b) => b.flags.includes("anbieter-klumpen")).map((b) => b.id),
    // fehlende Gegenpositionen: zu wenige Parteien/Fraktionen mit eigenen Positionsquellen.
    fehlendeGegenpositionen: (partiesWithPositions + groupsWithPositions) < th.minCounterParties,
    thematischeMonokulturen: byCommittee.filter((b) => b.flags.includes("monokultur")).map((b) => b.id),
    regionaleLuecken: byBundesland.filter((b) => b.working === 0).map((b) => b.id),
    // Quellen ohne funktionierenden Abrufweg.
    quellenOhneWeg: records.filter((r) => !serveable(r) || r.health === "broken" || r.legacy_path_status === "broken").map((r) => r.id),
    // Quellen ohne rechtliche Bewertung (Lizenz ODER Datenschutz unbewertet).
    quellenOhneRechtsbewertung: records.filter((r) => r.license_status === "unbewertet" || r.privacy_status === "unbewertet").map((r) => r.id),
    // Abhaengigkeit von einem einzigen Suchanbieter (Buckets, die nur ueber Suchanbieter versorgt sind).
    nurSuchanbieterBuckets: [...byParty, ...byGroup, ...byCommittee].filter((b) => b.flags.includes("nur-suchanbieter")).map((b) => b.id)
  };

  return {
    thresholds: th,
    byParty, byGroup, byCommittee, byBundesland, bySourceType, byStance,
    overallSearchShare,
    findings,
    summary:
      `Parteien:${byParty.length} (unterversorgt ${byParty.filter((b) => b.flags.includes("unterversorgung")).length}) · ` +
      `Fraktionen:${byGroup.length} · Ausschuesse:${byCommittee.length} (Monokultur ${findings.thematischeMonokulturen.length}) · ` +
      `Bundeslaender:${byBundesland.length} (Luecken ${findings.regionaleLuecken.length}) · ` +
      `Suchanbieter-Anteil gesamt ${(overallSearchShare * 100).toFixed(0)}% · ` +
      `ohne Rechtsbewertung ${findings.quellenOhneRechtsbewertung.length} · ` +
      `Gegenpositionen ${findings.fehlendeGegenpositionen ? "FEHLEN" : "vorhanden"}`
  };
}

function childOfLand(regionId, landId) {
  const rid = String(regionId);
  // Nur echte Unterebenen (Bezirk/Kreis/Kommune) zaehlen als Kind — ein anderes Land
  // (geo-land-*) ist NIE ein Kind, auch wenn sein Slug ein Praefix ist.
  if (!/^geo-(bezirk|kreis|kommune)-/.test(rid)) return false;
  const landSlug = String(landId).replace(/^geo-land-/, "");
  return new RegExp(`^geo-(bezirk|kreis|kommune)-${landSlug}(-|$)`).test(rid);
}

module.exports = { DEFAULT_THRESHOLDS, buildCoverageMatrix, bucketStats, weightOf };
