"use strict";

// Helmut — Master Quellenkatalog · Sprint 3 · Beschaffungsstrategie (Phase 4).
//
// Reine Logik/Daten. Legt die verbindliche Rangfolge fuer die Aufnahme neuer Quellen fest.
// Die Prioritaet ist DATENGETRIEBEN aus (Abrufmethode, Quellentyp) abgeleitet — kein fest
// codierter Anbieter-Sonderfall. Suchanbieter sind IMMER die niedrigste Prioritaet (Rueckfall).

const taxonomy = require("./taxonomy");

// Die 5 Prioritaetsstufen (Auftrag Phase 4). tier 1 = hoechste.
const ACQUISITION_PRIORITIES = Object.freeze([
  { tier: 1, key: "official_structured_primary", name: "Offizielle strukturierte Primärquellen",
    detail: "Amtliche APIs/Datensätze/Register (DIP, Bundesrat, Destatis, offene Datenportale)." },
  { tier: 2, key: "official_feeds", name: "Offizielle RSS-Feeds, APIs, Sitemaps, Pressebereiche",
    detail: "Direkte Feeds/Pressebereiche amtlicher Herausgeber und Institutionen." },
  { tier: 3, key: "serious_secondary", name: "Seriöse Fach- und institutionelle Sekundärquellen",
    detail: "Fachverbände, Gewerkschaften, Arbeitgeber, Wissenschaft, Thinktanks, Fachmedien, NGOs." },
  { tier: 4, key: "media", name: "Regionale und überregionale Medien",
    detail: "Journalistische Leit- und Regionalmedien als Einordnung, nicht als Primärbeleg." },
  { tier: 5, key: "search_discovery", name: "Suchanbieter als ergänzende Discovery-Quelle",
    detail: "Nur Ergänzung/Rückfallebene — nie alleinige Versorgung (Abnahme §9)." }
]);

const TIER_BY_KEY = new Map(ACQUISITION_PRIORITIES.map((p) => [p.key, p]));

// Leitet die Beschaffungsprioritaet einer Quelle deterministisch ab. Die Abrufmethode dominiert
// (ein Suchanbieter-Weg ist immer tier 5), sonst zaehlt der Standard-Tier des Quellentyps.
function acquisitionTier(source = {}) {
  const method = String(source.method || (source.retrieval && source.retrieval.method) || "").toLowerCase();
  const type = String(source.source_type || "");
  const typeMeta = taxonomy.getSourceType(type);

  // Suchanbieter (googlenews_search / search) ODER der Aggregator-Typ -> immer tier 5.
  if (method === "googlenews_search" || method === "search" || taxonomy.isSearchProviderType(type)) return 5;

  // Amtlich + strukturiert (api/structured_download/sitemap) -> tier 1.
  if (typeMeta && typeMeta.is_official && ["api", "structured_download", "sitemap"].includes(method)) return 1;
  // Amtlich + Feed/HTML-Pressebereich -> tier 2.
  if (typeMeta && typeMeta.is_official) return 2;
  // Sonst der in der Taxonomie hinterlegte Standard-Tier (3 Fachquelle / 4 Medien / …).
  if (typeMeta && Number.isFinite(typeMeta.acquisition_tier)) return typeMeta.acquisition_tier;
  return 4;
}

function tierMeta(tier) {
  return ACQUISITION_PRIORITIES.find((p) => p.tier === tier) || null;
}

// Sortiert eine Quellenliste nach Aufnahme-Rangfolge (tier aufsteigend, dann amtlich vor nicht-amtlich).
function rankForAcquisition(sources = []) {
  return [...(Array.isArray(sources) ? sources : [])]
    .map((s) => ({ source: s, tier: acquisitionTier(s) }))
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      const ao = taxonomy.getSourceType(a.source.source_type);
      const bo = taxonomy.getSourceType(b.source.source_type);
      return (bo && bo.is_official ? 1 : 0) - (ao && ao.is_official ? 1 : 0);
    });
}

module.exports = {
  ACQUISITION_PRIORITIES, TIER_BY_KEY,
  acquisitionTier, tierMeta, rankForAcquisition
};
