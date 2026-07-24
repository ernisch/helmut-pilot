"use strict";

// Helmut — Quellenarchitektur · Fachthemenpaket "Wissenschaft und Forschung (Bund)".
//
// Strukturierte, VOLLSTÄNDIG INAKTIVE Vorbereitung des Bund-Fachpakets
// `wissenschaft-forschung-bund` als Paket + Herausgeber + Abrufwege + Paketzuordnungen +
// erwartete Ebenen/Geografien. Analog zum Landesmodul-Vorbild (seeds/landesmodule-quellen.js).
//
// REINE, DETERMINISTISCHE LOGIK. Kein Netz, keine KI, kein Storage-Write, KEIN Rendering.
// Erzeugt NUR ein In-Memory-Abbild; das Anwenden auf Production (DB-Insert via generiertem
// Seed) bleibt ein eigener, ausdrücklich FREIGABEPFLICHTIGER Schritt.
//
// SICHERHEITSINVARIANTEN (in jedem Abrufweg hart):
//   status          = "needs_review"  (nie healthy/active)
//   activation_mode = "manual"        (nie auto/always_on -> kein Auto-Crawl)
//   Paketstatus     = "prepared"      (computeGlobalActivation aktiviert NICHT)
// -> die Wege sind technisch INAKTIV und doppelt gesperrt (Paket + Weg).
//
// ABGRENZUNG / KEINE DUBLETTEN:
//   - Parlamentarische Abdeckung (Bundestag/Forschungsausschuss/DIP) läuft über das
//     Basispaket `bund-basis` (rp-committee-bildung u. a., aktiv). Hier KEINE parallelen
//     parlamentarischen Suchwege.
//   - Destatis (statistisches Bundesamt) und OECD existieren bereits als Herausgeber
//     (Basis-Seed). Sie werden WIEDERVERWENDET; nur je ein wissenschaftsspezifischer
//     Abrufweg wird ergänzt. Es wird KEIN Herausgeber dupliziert.
//   - BuFI (Bundesbericht Forschung und Innovation) ist KEINE eigene Institution, sondern
//     ein Abrufweg unter dem BMFTR-Herausgeber.
//   - Raumfahrt wird als strategische BMFTR-Bundespolitik modelliert (ein BMFTR-Weg), NICHT
//     als DLR/Deutsche Raumfahrtagentur/ESA-Dauerweg oder Missions-Newsfeed.
//   - Das frühere BMBF wird NICHT als zusätzliche aktuelle Institution angelegt: es ist ein
//     historischer Alias des BMFTR (aliases).

// Der Aggregator-Weg nutzt die Google-News-Suchmethode (etabliertes Repo-Muster für
// Institutions-Wege ohne erfundenen Direkt-Feed, vgl. rp-institution-oecd-arbeit im Basis-Seed).
function gnUrl(query) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=de&gl=DE&ceid=DE:de`;
}

// --- Paketdefinition (neu; wird vom Seed als source_packages-Zeile eingefügt) ----------------
const PACKAGE = Object.freeze({
  id: "pkg-wissenschaft-forschung-bund",
  key: "wissenschaft-forschung-bund",
  name: "Wissenschaft und Forschung (Bund)",
  purpose:
    "Fachthemenpaket Wissenschafts-, Forschungs- und Technologiepolitik des Bundes " +
    "(Bundesforschungsstrategie, Forschungsförderung, Bund-Länder-Steuerung, Wissenschaftssystem, " +
    "Hochschul-/Wissenschaftsfinanzierung, Exzellenzstrategie, wissenschaftlicher Nachwuchs, " +
    "Raumfahrtpolitik, EU-Forschungsförderung, internationale Vergleiche). Fachthema, NICHT Region. " +
    "Parlamentarische Abdeckung (Bundestag/Forschungsausschuss/DIP) läuft über bund-basis.",
  status: "prepared", is_base: false, political_level: "bund", geography_id: "geo-bund",
  required_classes: []
});

// --- Neue politische Entitäten (nur solche, die NICHT bereits in seeds/entities.js stehen) ----
// BMBFSFJ wird bewusst NICHT angelegt (Bildungs-/Familienressort -> bildung-bund/familie-bund).
const NEUE_ENTITAETEN = [
  { id: "ministry-bmftr", entity_type: "ministry", name: "Bundesministerium für Forschung, Technologie und Raumfahrt",
    canonical_key: "bmftr", level: "bund", geography_id: "geo-bund",
    aliases: ["BMFTR", "BMBF", "Bundesministerium für Bildung und Forschung"] },
  { id: "institution-gwk", entity_type: "other_institution", name: "Gemeinsame Wissenschaftskonferenz",
    canonical_key: "gwk", level: "bund", geography_id: "geo-bund", aliases: ["GWK"] },
  { id: "institution-wissenschaftsrat", entity_type: "other_institution", name: "Wissenschaftsrat",
    canonical_key: "wissenschaftsrat", level: "bund", geography_id: "geo-bund", aliases: ["WR", "Wissenschaftsrat"] },
  { id: "institution-dfg", entity_type: "other_institution", name: "Deutsche Forschungsgemeinschaft",
    canonical_key: "dfg", level: "bund", geography_id: "geo-bund", aliases: ["DFG"] },
  { id: "institution-efi", entity_type: "other_institution", name: "Expertenkommission Forschung und Innovation",
    canonical_key: "efi", level: "bund", geography_id: "geo-bund", aliases: ["EFI"] },
  { id: "institution-dzhw", entity_type: "other_institution", name: "Deutsches Zentrum für Hochschul- und Wissenschaftsforschung",
    canonical_key: "dzhw", level: "bund", geography_id: "geo-bund", aliases: ["DZHW"] },
  { id: "institution-eu-kommission-rtd", entity_type: "other_institution", name: "Europäische Kommission — GD Forschung und Innovation",
    canonical_key: "eu-kommission-rtd", level: "eu", geography_id: null, aliases: ["DG RTD", "GD RTD", "Horizon Europe"] },
  { id: "association-hrk", entity_type: "association", name: "Hochschulrektorenkonferenz",
    canonical_key: "hrk", level: "bund", geography_id: "geo-bund", aliases: ["HRK"] }
];

// --- Neue Herausgeber (existieren noch nicht). Destatis + OECD werden WIEDERVERWENDET. -------
const NEUE_PUBLISHER = [
  { id: "publisher-bmftr.bund.de", name: "Bundesministerium für Forschung, Technologie und Raumfahrt",
    canonical_domain: "bmftr.bund.de", publisher_type: "ministry", evidence_role: "official_primary", entity_id: "ministry-bmftr" },
  { id: "publisher-gwk-bonn.de", name: "Gemeinsame Wissenschaftskonferenz",
    canonical_domain: "gwk-bonn.de", publisher_type: "other_institution", evidence_role: "official_primary", entity_id: "institution-gwk" },
  { id: "publisher-wissenschaftsrat.de", name: "Wissenschaftsrat",
    canonical_domain: "wissenschaftsrat.de", publisher_type: "other_institution", evidence_role: "official_primary", entity_id: "institution-wissenschaftsrat" },
  { id: "publisher-dfg.de", name: "Deutsche Forschungsgemeinschaft",
    canonical_domain: "dfg.de", publisher_type: "other_institution", evidence_role: "data_source", entity_id: "institution-dfg" },
  { id: "publisher-e-fi.de", name: "Expertenkommission Forschung und Innovation",
    canonical_domain: "e-fi.de", publisher_type: "other_institution", evidence_role: "data_source", entity_id: "institution-efi" },
  { id: "publisher-dzhw.eu", name: "Deutsches Zentrum für Hochschul- und Wissenschaftsforschung",
    canonical_domain: "dzhw.eu", publisher_type: "other_institution", evidence_role: "data_source", entity_id: "institution-dzhw" },
  { id: "publisher-research-and-innovation.ec.europa.eu", name: "Europäische Kommission — GD Forschung und Innovation",
    canonical_domain: "research-and-innovation.ec.europa.eu", publisher_type: "government", evidence_role: "official_primary", entity_id: "institution-eu-kommission-rtd" },
  { id: "publisher-hrk.de", name: "Hochschulrektorenkonferenz",
    canonical_domain: "hrk.de", publisher_type: "association", evidence_role: "direct_interest", entity_id: "association-hrk" }
];

// Bereits vorhandene Herausgeber, die dieses Paket referenziert (NICHT neu einfügen).
const REUSED_PUBLISHER_IDS = ["publisher-destatis.de", "publisher-oecd.org"];

// --- Abrufwege (12), alle INAKTIV (needs_review + manual). ------------------------------------
// tier: 1 = dauerhaft unverzichtbar, 2 = wichtig/periodisch, 3 = ergänzend/ereignisbezogen.
// level/geo: bund -> geo-bund; eu/international -> keine Geografie (kein geo-eu/geo-welt im Modell).
const PFADE = [
  // ---- Tier 1: dauerhaft unverzichtbar -------------------------------------------------------
  { id: "rp-wf-bmftr-politik", publisher_id: "publisher-bmftr.bund.de", legacy_source_id: "wf-bmftr-politik",
    name: "BMFTR — Forschungs- und Technologiepolitik",
    query: "site:bmftr.bund.de (Forschung OR Technologie OR \"Hightech Agenda\" OR Förderung OR Strategie OR Innovation)",
    tier: 1, is_critical: true, level: "bund" },
  { id: "rp-wf-bmftr-bufi", publisher_id: "publisher-bmftr.bund.de", legacy_source_id: "wf-bmftr-bufi",
    name: "BMFTR — Bundesbericht Forschung und Innovation (BuFI)",
    query: "site:bmftr.bund.de (\"Bundesbericht Forschung und Innovation\" OR BuFI)",
    tier: 1, is_critical: true, level: "bund" },
  { id: "rp-wf-gwk-beschluesse", publisher_id: "publisher-gwk-bonn.de", legacy_source_id: "wf-gwk-beschluesse",
    name: "GWK — Beschlüsse und Bund-Länder-Vereinbarungen",
    query: "site:gwk-bonn.de (Beschluss OR Vereinbarung OR Exzellenzstrategie OR \"Pakt für Forschung und Innovation\" OR Zukunftsvertrag OR Forschungsinfrastruktur)",
    tier: 1, is_critical: true, level: "bund" },
  { id: "rp-wf-wissenschaftsrat", publisher_id: "publisher-wissenschaftsrat.de", legacy_source_id: "wf-wissenschaftsrat",
    name: "Wissenschaftsrat — Empfehlungen und Stellungnahmen",
    query: "site:wissenschaftsrat.de (Empfehlung OR Stellungnahme OR Evaluation OR Akkreditierung)",
    tier: 1, is_critical: true, level: "bund" },
  { id: "rp-wf-dfg-strategie", publisher_id: "publisher-dfg.de", legacy_source_id: "wf-dfg-strategie",
    name: "DFG — Förderatlas, Jahresbericht, Stellungnahmen",
    query: "site:dfg.de (Förderatlas OR Jahresbericht OR Stellungnahme OR Exzellenzstrategie OR Wissenschaftsfreiheit)",
    tier: 1, is_critical: true, level: "bund" },

  // ---- Tier 2: wichtig, periodisch -----------------------------------------------------------
  { id: "rp-wf-efi-gutachten", publisher_id: "publisher-e-fi.de", legacy_source_id: "wf-efi-gutachten",
    name: "EFI — Jahresgutachten Forschung, Innovation und technologische Leistungsfähigkeit",
    query: "site:e-fi.de (Gutachten OR Forschung OR Innovation)",
    tier: 2, is_critical: false, level: "bund" },
  { id: "rp-wf-destatis-hochschulforschung", publisher_id: "publisher-destatis.de", legacy_source_id: "wf-destatis-hochschulforschung",
    name: "Destatis — Hochschul- und FuE-Statistik",
    query: "site:destatis.de (Hochschule OR Studierende OR Promotionen OR \"Personal an Hochschulen\" OR \"Forschung und Entwicklung\" OR FuE)",
    tier: 2, is_critical: false, level: "bund" },
  { id: "rp-wf-dzhw", publisher_id: "publisher-dzhw.eu", legacy_source_id: "wf-dzhw",
    name: "DZHW — Hochschul- und Wissenschaftsforschung",
    query: "site:dzhw.eu (Studie OR Wissenschaftssystem OR Promovierende OR Wissenschaftspersonal OR Studienabbruch)",
    tier: 2, is_critical: false, level: "bund" },
  { id: "rp-wf-eu-forschung", publisher_id: "publisher-research-and-innovation.ec.europa.eu", legacy_source_id: "wf-eu-forschung",
    name: "Europäische Kommission (GD RTD) — Horizon Europe",
    query: "site:research-and-innovation.ec.europa.eu (\"Horizon Europe\" OR funding OR \"work programme\" OR \"research and innovation\")",
    tier: 2, is_critical: false, level: "eu" },
  { id: "rp-wf-oecd-sti", publisher_id: "publisher-oecd.org", legacy_source_id: "wf-oecd-sti",
    name: "OECD — Science, Technology and Innovation",
    query: "site:oecd.org Germany (science OR research OR innovation OR \"R&D\")",
    tier: 2, is_critical: false, level: "international" },

  // ---- Tier 3: ergänzend, ereignisbezogen ----------------------------------------------------
  { id: "rp-wf-bmftr-raumfahrt", publisher_id: "publisher-bmftr.bund.de", legacy_source_id: "wf-bmftr-raumfahrt",
    name: "BMFTR — Raumfahrtpolitik und Raumfahrtstrategie",
    query: "site:bmftr.bund.de (Raumfahrt OR Raumfahrtstrategie OR Weltraum OR Raumfahrtagentur)",
    tier: 3, is_critical: false, level: "bund" },
  { id: "rp-wf-hrk", publisher_id: "publisher-hrk.de", legacy_source_id: "wf-hrk",
    name: "HRK — Hochschulrektorenkonferenz (ereignisbezogen)",
    query: "site:hrk.de (Wissenschaftszeitvertragsgesetz OR Hochschulfinanzierung OR Forschung OR Stellungnahme)",
    tier: 3, is_critical: false, level: "bund" }
];

// Baut das vollständige, inaktive In-Memory-Abbild des Pakets.
function buildWissenschaftForschungBundSeed() {
  const retrievalPaths = PFADE.map((p) => ({
    id: p.id,
    publisher_id: p.publisher_id,
    legacy_source_id: p.legacy_source_id,
    name: p.name,
    method: "googlenews_search",
    url: gnUrl(p.query),
    query: p.query,
    parser: "googlenews-batchexecute",
    priority: 60,
    status: "needs_review",     // VORBEREITET — nie healthy/active
    activation_mode: "manual",  // VORBEREITET — nie auto/always_on -> kein Auto-Crawl
    is_critical: p.is_critical,
    max_items: 16,
    tier: p.tier,
    level: p.level
  }));

  const packagePaths = retrievalPaths.map((p) => ({ package_id: PACKAGE.id, retrieval_path_id: p.id }));
  const pathExpectedLevels = retrievalPaths.map((p) => ({ retrieval_path_id: p.id, level: p.level }));
  // Geografie nur für Bund-Ebene (kein geo-eu/geo-international im Geo-Modell -> bewusst leer).
  const pathExpectedGeographies = retrievalPaths
    .filter((p) => p.level === "bund")
    .map((p) => ({ retrieval_path_id: p.id, geography_id: "geo-bund" }));

  return {
    package: PACKAGE,
    entities: NEUE_ENTITAETEN,
    publishers: NEUE_PUBLISHER,
    reusedPublisherIds: REUSED_PUBLISHER_IDS,
    retrievalPaths,
    packagePaths,
    pathExpectedLevels,
    pathExpectedGeographies,
    summary: {
      status: PACKAGE.status,
      neueEntitaeten: NEUE_ENTITAETEN.length,
      neuePublisher: NEUE_PUBLISHER.length,
      wiederverwendetePublisher: REUSED_PUBLISHER_IDS.length,
      abrufwege: retrievalPaths.length,
      tier1: retrievalPaths.filter((p) => p.tier === 1).length,
      tier2: retrievalPaths.filter((p) => p.tier === 2).length,
      tier3: retrievalPaths.filter((p) => p.tier === 3).length,
      paketzuordnungen: packagePaths.length,
      // technisch inaktiv: kein Abrufweg ist aktiv/auto/always_on
      aktiveAbrufwege: retrievalPaths.filter(
        (p) => p.status === "healthy" || p.activation_mode === "auto" || p.activation_mode === "always_on"
      ).length
    }
  };
}

module.exports = {
  buildWissenschaftForschungBundSeed,
  PACKAGE, NEUE_ENTITAETEN, NEUE_PUBLISHER, REUSED_PUBLISHER_IDS, PFADE
};
