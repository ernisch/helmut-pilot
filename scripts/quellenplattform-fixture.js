"use strict";

// Test-Fixture fuer die konsolidierte Quellenplattform (Sprint 1-3). KEIN Test (endet nicht auf
// -test.js) und KEIN Produktionscode: liefert deterministische Beispiel-Mandate + Katalogquellen,
// damit die *-test.js-Suiten dieselbe Grundlage teilen. Kein Netz, keine KI, kein Storage.

const P = require("../lib/helmut/quellenplattform");

// Register-reifes Bundestagsmandat (SPD, Ausschuss Arbeit und Soziales, Wahlkreis Niedersachsen).
const PROFILE_BUND_SPD = Object.freeze({
  id: "mandate-spd-1", fullName: "Erika Mustermann", partei: "SPD", fraktion: "SPD",
  ausschuesse: ["Arbeit und Soziales"], bundesland: "Niedersachsen",
  constituency: "Hannover-Stadt", politische_ebene: "bundestag", bundestagId: "12345"
});

// Zweites Mandat, anderer Mandant, andere Partei/Region — fuer Tenant-/Namensvetter-/Regionstests.
const PROFILE_BUND_CDU = Object.freeze({
  id: "mandate-cdu-1", fullName: "Max Beispiel", partei: "CDU", fraktion: "CDU/CSU",
  ausschuesse: ["Verkehr"], bundesland: "Bayern",
  constituency: "München-Nord", politische_ebene: "bundestag", bundestagId: "67890"
});

function src(id, type, o = {}) {
  return {
    id, publisher_id: o.publisher_id || `pub-${id}`, source_type: type,
    political_level: o.political_level || "bund",
    party_id: o.party_id || null, group_id: o.group_id || null,
    institution_id: o.institution_id || null,
    committee_ids: o.committee_ids || [], topics: o.topics || [], region_ids: o.region_ids || [],
    trust: o.trust || "hoch",
    license_status: o.license_status || "presse_erlaubt",
    privacy_status: o.privacy_status || "unbedenklich",
    review_status: o.review_status || "active",
    discovery_origin: o.discovery_origin || "official_directory",
    evidence_url: o.evidence_url || null,
    discovered_at: o.discovered_at || "2026-07-01",
    health: o.health || "healthy",
    canonical_url: o.canonical_url || `https://${id}.example`,
    retrieval: o.retrieval || { method: "rss", url: `https://${id}.example/rss` }
  };
}

// Vollstaendiger Katalog: deckt alle BLOCKIERENDEN Pflichtebenen fuer PROFILE_BUND_SPD ab.
// entityIds = { party, fraction } aus dem aufgeloesten Mandat (Katalog referenziert per ID).
function buildCompleteCatalog(entityIds = {}) {
  const P_ENT = entityIds.party || "party-spd";
  const F_ENT = entityIds.fraction || "group-bt-spd";
  return [
    // institutionelle Grundversorgung (min 4 Quellen, 3 Herausgeber, trust hoch)
    src("parlament", "parlament", { publisher_id: "pub-bundestag" }),
    src("bundesregierung", "bundesregierung", { publisher_id: "pub-bundesregierung" }),
    src("bundesrat", "bundesrat", { publisher_id: "pub-bundesrat" }),
    src("datenportal", "datenportal", { publisher_id: "pub-dip", retrieval: { method: "api", url: "https://dip.example/api" } }),
    // Ausschuss + Ministerium
    src("ausschuss-as", "ausschuss", { publisher_id: "pub-ausschuss", committee_ids: ["arbeit-und-soziales"], topics: ["arbeit-und-soziales"] }),
    src("ministerium-bmas", "ministerium", { publisher_id: "pub-bmas", topics: ["arbeit-und-soziales"], institution_id: "inst-bmas" }),
    // Partei + Fraktion (des Mandats)
    src("partei-spd", "partei", { publisher_id: "pub-spd", party_id: P_ENT, trust: "mittel" }),
    src("fraktion-spd", "fraktion", { publisher_id: "pub-spdfraktion", group_id: F_ENT, trust: "mittel" }),
    // ueberregionale Medien (Grundversorgung, universal)
    src("medien-zeit", "medien_ueberregional", { publisher_id: "pub-zeit", trust: "mittel" }),
    src("medien-faz", "medien_ueberregional", { publisher_id: "pub-faz", trust: "mittel" }),
    // Fachmedien (Thema)
    src("fachmedien-as", "fachmedien", { publisher_id: "pub-fachmedien", topics: ["arbeit-und-soziales"], trust: "mittel" }),
    // Regionalquelle Niedersachsen (matcht Region des Mandats)
    src("regional-nds", "medien_regional", { publisher_id: "pub-haz", political_level: "land", region_ids: ["niedersachsen"], trust: "mittel", discovery_origin: "manual_curation", evidence_url: "https://haz.example" }),
    // Regionalquelle Bayern (matcht NICHT -> muss ausgeschlossen werden)
    src("regional-bayern", "medien_regional", { publisher_id: "pub-merkur", political_level: "land", region_ids: ["bayern"], trust: "mittel", discovery_origin: "manual_curation", evidence_url: "https://merkur.example" }),
    // Suchanbieter (nur Ergaenzung, nie alleinige Versorgung)
    src("suche", "suchanbieter", { publisher_id: "pub-googlenews", trust: "niedrig", topics: ["arbeit-und-soziales"], discovery_origin: "search_discovery", retrieval: { method: "googlenews_search", query: "arbeit soziales" } }),
    // hart ausgeschlossene Quelle (blockiert/untersagt/quarantaene)
    src("gesperrt", "medien_regional", { publisher_id: "pub-x", trust: "blockiert", license_status: "untersagt", review_status: "quarantined", health: "broken", discovery_origin: "manual_curation" })
  ];
}

// Private Tenant-Quellen (zwei verschiedene Mandanten) fuer Isolationstests.
function buildPrivateSources() {
  return [
    { id: "priv-a1", tenant_id: "tenant-A", source_type: "fachmedien", political_level: "bund", topics: ["arbeit-und-soziales"], trust: "mittel", license_status: "presse_erlaubt", privacy_status: "unbedenklich", review_status: "active", discovery_origin: "manual_curation", evidence_url: "https://priv-a1.example", discovered_at: "2026-07-01", health: "healthy", canonical_url: "https://priv-a1.example", retrieval: { method: "rss", url: "https://priv-a1.example/rss" } },
    { id: "priv-b1", tenant_id: "tenant-B", source_type: "fachmedien", political_level: "bund", topics: ["arbeit-und-soziales"], trust: "mittel", review_status: "active", discovery_origin: "manual_curation", discovered_at: "2026-07-01", health: "healthy", canonical_url: "https://priv-b1.example", retrieval: { method: "rss", url: "https://priv-b1.example/rss" } }
  ];
}

function resolveEntityIds(profile) {
  const m = P.resolveMandate(profile);
  return { party: m.party.entity_id, fraction: m.fraction.entity_id, mandate: m };
}

module.exports = { P, PROFILE_BUND_SPD, PROFILE_BUND_CDU, src, buildCompleteCatalog, buildPrivateSources, resolveEntityIds };
