"use strict";

// Helmut — Quellenarchitektur · Paket "digitales-daten-staatsmodernisierung-bund"
// (technische Validierung + vollständig INAKTIVE Vorbereitung).
//
// REINE, DETERMINISTISCHE DATEN. Kein Netz, keine KI, kein Storage-Write, kein Rendering.
// Formt die für die deutsche Digital-, Daten- und Staatsmodernisierungspolitik des Bundes
// relevanten Herausgeber/Abrufwege in das relationale Modell (publishers / retrieval_paths /
// package_paths / path_expected_*) — ausschliesslich als VORBEREITET:
//   - neues Paket: status "prepared" (nie active) -> keine Referenzzählung -> aktiviert nichts.
//   - neue retrieval_paths: status "needs_review" (nie healthy/active), activation_mode "manual"
//     (nie auto/always_on) -> werden nie automatisch aktiviert/gecrawlt.
//   - verify_before_activation = true auf jedem neuen Weg: die konkrete Publikationsstruktur
//     (nativer Feed vs. Google-News-Ersatzweg, Bot-Schutz, Volltext) ist byte-genau NICHT
//     bestätigt (Egress in der Bau-Umgebung gesperrt) und MUSS vor Aktivierung geprüft werden.
//
// WIEDERVERWENDUNG STATT PARALLELMODELL (Auftrag §2/§7): Bestehende Herausgeber/Entitäten/Wege
// werden wiederverwendet, nicht dupliziert:
//   - parliament-bundestag / publisher-dip.bundestag.de / rp-dip (API) -> Gesetzgebung, Drucksachen,
//     Anträge, Anfragen, incl. Bundesrats-Materialien (DIP-Vorgänge). NUR Paketzuordnung.
//   - committee-bt-digitales / aggregator-google-news / rp-committee-digitales -> Bundestags-
//     Ausschuss für Digitales und Staatsmodernisierung. NUR Paketzuordnung.
//   - authority-bundesrechnungshof / publisher-bundesrechnungshof.de -> vorhandener Herausgeber,
//     NEUER digital-thematischer Abrufweg (der Bestandsweg ist Soziales-gefiltert).
//
// NICHT modelliert (Auftrag §3/§5/§6/§9/§10): Deutschland-Stack, Deutschland-Architektur, BundID,
// DeutschlandID, EUDI-Wallet, NOOTS, Deutsche Verwaltungscloud, OZG, Digitalcheck, Registermoderni-
// sierung, GovData, Bundesportal = Programme/Plattformen/Produkte/Gesetze, KEINE eigenen Herausgeber
// oder Entitäten. Sie werden inhaltlich über die Wege ihrer Herausgeber (BMDS, IT-Planungsrat, NKR)
// abgedeckt. FITKO wird NICHT als eigener Dauerweg angelegt (gemeinsamer Jahresbericht mit dem
// IT-Planungsrat -> Doppelerfassung vermieden). DigitalService/ITZBund/ZenDiS/Sovereign Tech Agency,
// GovData, Bundesportal, Bundesanzeiger sowie EU-Kommission/AI-Act-Primärrecht = Future Target bzw.
// anderen Paketen zugeordnet (siehe Paketdokumentation).

// --- Konstanten -------------------------------------------------------------
const PACKAGE_ID = "pkg-digitales-daten-staatsmodernisierung-bund";
const PACKAGE_KEY = "digitales-daten-staatsmodernisierung-bund";
const GEO_BUND = "geo-bund";

// Google-News-RSS-Such-URL aus einer Suchdefinition bauen (identisches Format wie der Basis-Seed:
// q=<encodeURIComponent>&hl=de&gl=DE&ceid=DE:de). KEIN erfundener Publisher-Feed — ein
// Aggregator-Suchweg über die site:-Domain des jeweiligen amtlichen Herausgebers.
function gnews(query) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=de&gl=DE&ceid=DE:de`;
}

// --- Das Paket (prepared, is_base=false, Bundesebene) -----------------------
const PACKAGE = Object.freeze({
  id: PACKAGE_ID,
  key: PACKAGE_KEY,
  name: "Digitales, Daten & Staatsmodernisierung Bund",
  purpose:
    "Bundespolitik zu Digitalisierung, Daten, KI-Regulierung, Verwaltungsdigitalisierung und " +
    "Staatsmodernisierung: BMDS (Ressort), IT-Planungsrat (Bund-Länder-Steuerung), Bundestag/DIP " +
    "(Gesetzgebung, Ausschuss Digitales u. Staatsmodernisierung) sowie die Kontroll-/Aufsichtsebene " +
    "(Bundesrechnungshof, Normenkontrollrat, BfDI). Kompakter, wiederverwendungs-first Kern.",
  status: "prepared", // NIE active
  is_base: false,
  political_level: "bund",
  geography_id: GEO_BUND,
  required_classes: []
});

// --- NEUE politische Entitäten (nur solche, die NICHT bereits in seeds/entities.js stehen) --
// Keine Personenabhängigkeit in stabilen IDs (Auftrag §1): weder der aktuelle BMDS-Minister
// (Wildberger) noch der Staatssekretär (Richter) noch die BfDI-Amtsinhaberin sind in IDs/Keys
// kodiert. Der historische "Bundes-CIO / Beauftragte der Bundesregierung für Informationstechnik"
// wird NICHT als eigene Entität modelliert: die Funktion wurde mit Gründung des BMDS (06.05.2025)
// aufgelöst und ist institutionell vollständig über ministry-bmds abgedeckt.
const NEUE_ENTITAETEN = [
  {
    id: "ministry-bmds", entity_type: "ministry",
    name: "Bundesministerium für Digitales und Staatsmodernisierung",
    canonical_key: "bmds", level: "bund", geography_id: GEO_BUND,
    aliases: ["BMDS", "Digitalministerium", "Bundesdigitalministerium"]
  },
  {
    id: "institution-it-planungsrat", entity_type: "other_institution",
    name: "IT-Planungsrat",
    canonical_key: "it-planungsrat", level: "bund", geography_id: GEO_BUND,
    aliases: ["IT-Planungsrat", "ITPLR"]
  },
  {
    id: "institution-nkr", entity_type: "other_institution",
    name: "Nationaler Normenkontrollrat",
    canonical_key: "normenkontrollrat", level: "bund", geography_id: GEO_BUND,
    aliases: ["NKR", "Normenkontrollrat", "Nationaler Normenkontrollrat"]
  },
  {
    id: "authority-bfdi", entity_type: "authority",
    name: "Bundesbeauftragte(r) für den Datenschutz und die Informationsfreiheit",
    canonical_key: "bfdi", level: "bund", geography_id: GEO_BUND,
    aliases: ["BfDI", "Bundesdatenschutzbeauftragte", "Bundesdatenschutzbeauftragter"]
  }
];

// --- NEUE Herausgeber (nur neue; Bundesrechnungshof/DIP/Google-News werden wiederverwendet) --
const NEUE_HERAUSGEBER = [
  {
    id: "publisher-bmds.bund.de", name: "Bundesministerium für Digitales und Staatsmodernisierung",
    canonical_domain: "bmds.bund.de", publisher_type: "ministry",
    evidence_role: "official_primary", trust: "unbekannt", lifecycle_status: "active",
    entity_id: "ministry-bmds"
  },
  {
    id: "publisher-it-planungsrat.de", name: "IT-Planungsrat",
    canonical_domain: "it-planungsrat.de", publisher_type: "other_institution",
    evidence_role: "official_primary", trust: "unbekannt", lifecycle_status: "active",
    entity_id: "institution-it-planungsrat"
  },
  {
    id: "publisher-normenkontrollrat.bund.de", name: "Nationaler Normenkontrollrat",
    canonical_domain: "normenkontrollrat.bund.de", publisher_type: "other_institution",
    evidence_role: "official_primary", trust: "unbekannt", lifecycle_status: "active",
    entity_id: "institution-nkr"
  },
  {
    id: "publisher-bfdi.bund.de", name: "Bundesbeauftragte(r) für den Datenschutz und die Informationsfreiheit",
    canonical_domain: "bfdi.bund.de", publisher_type: "authority",
    evidence_role: "official_primary", trust: "unbekannt", lifecycle_status: "active",
    entity_id: "authority-bfdi"
  }
];

// --- NEUE Abrufwege (alle needs_review + manual + verify_before_activation) -----------------
// tier: fachliche Priorisierung (Auftrag §12). is_critical folgt der Landesmodul-Konvention
// (nur official_primary-Primärquellen kritisch; Aggregator-/Suchwege nicht).
const NEUE_WEGE = [
  {
    id: "rp-bmds-presse", publisher_id: "publisher-bmds.bund.de", legacy_source_id: null,
    name: "BMDS — Presse & Aktuelles (Digital- und Staatsmodernisierungspolitik)",
    method: "googlenews_search",
    query: "site:bmds.bund.de",
    priority: 72, is_critical: true, max_items: 16, tier: 1,
    topics: ["digitalpolitik", "staatsmodernisierung", "verwaltungsdigitalisierung", "ki-regulierung",
             "digitale-souveraenitaet", "deutschland-stack", "registermodernisierung", "ozg"],
    hinweis: "Nativer BMDS-Presse-/Newsroom-Feed (RSS/HTML) vor Aktivierung prüfen; " +
             "der site:-Suchweg ist der robuste, nicht-erfundene Ersatz."
  },
  {
    id: "rp-it-planungsrat-beschluesse", publisher_id: "publisher-it-planungsrat.de", legacy_source_id: null,
    name: "IT-Planungsrat — Beschlüsse & Aktuelles (föderale Digitalsteuerung)",
    method: "googlenews_search",
    query: "site:it-planungsrat.de",
    priority: 70, is_critical: true, max_items: 16, tier: 1,
    topics: ["bund-laender-koordination", "foederale-digitalstrategie", "deutschland-architektur",
             "registermodernisierung", "noots", "verwaltungscloud", "ozg"],
    hinweis: "Deckt föderale Governance/Beschlüsse ab; FITKO wird NICHT separat erfasst " +
             "(gemeinsamer Jahresbericht mit dem IT-Planungsrat)."
  },
  {
    id: "rp-bundesrechnungshof-digital", publisher_id: "publisher-bundesrechnungshof.de", legacy_source_id: null,
    name: "Bundesrechnungshof — IT & Verwaltungsdigitalisierung (Prüfungen)",
    method: "googlenews_search",
    query: 'site:bundesrechnungshof.de (Digitalisierung OR IT OR "E-ID" OR Bundescloud OR ' +
           'Registermodernisierung OR "IT-Konsolidierung" OR Verwaltung OR OZG)',
    priority: 64, is_critical: false, max_items: 12, tier: 2,
    topics: ["haushalts-und-wirtschaftlichkeitskontrolle", "it-grossprojekte", "it-konsolidierung",
             "registermodernisierung", "verwaltungsdigitalisierung"],
    hinweis: "Vorhandener Herausgeber publisher-bundesrechnungshof.de wiederverwendet; NEUER " +
             "digital-thematischer Weg (der Bestandsweg rp-institution-bundesrechnungshof-soziales " +
             "ist Soziales-gefiltert und deckt Digitalthemen nicht ab)."
  },
  {
    id: "rp-nkr-veroeffentlichungen", publisher_id: "publisher-normenkontrollrat.bund.de", legacy_source_id: null,
    name: "Normenkontrollrat — Jahresberichte, Stellungnahmen, Digitalcheck",
    method: "googlenews_search",
    query: "site:normenkontrollrat.bund.de",
    priority: 62, is_critical: true, max_items: 12, tier: 2,
    topics: ["buerokratieabbau", "digitalcheck", "staatsmodernisierung", "gesetzesqualitaet"],
    hinweis: "Jahresbericht + Stellungnahmen + Digitalcheck-Monitoring (seit 2023)."
  },
  {
    id: "rp-bfdi-veroeffentlichungen", publisher_id: "publisher-bfdi.bund.de", legacy_source_id: null,
    name: "BfDI — Tätigkeitsberichte, Stellungnahmen, Aufsicht (Datenschutz/IFG)",
    method: "googlenews_search",
    query: "site:bfdi.bund.de",
    priority: 62, is_critical: true, max_items: 12, tier: 2,
    topics: ["datenschutz", "informationsfreiheit", "ki-regulierung", "data-act", "aufsicht"],
    hinweis: "Institution stabil modelliert (keine Amtsinhaber-Abhängigkeit)."
  }
];

// --- WIEDERVERWENDETE Abrufwege (nur additive Paketzuordnung; KEINE Änderung der Bestandszeilen) --
// Diese Wege existieren bereits (Basis-Seed, aktiv). Ein prepared-Paket zählt nicht in die
// Referenzzählung -> die Zuordnung aktiviert NICHTS und verändert die Wege nicht.
const WIEDERVERWENDETE_WEGE = [
  {
    id: "rp-dip", tier: 1,
    grund: "DIP-API (Bundestag): Gesetzentwürfe, Anträge, Drucksachen, Kleine Anfragen, incl. " +
           "Bundesrats-Materialien in den Vorgängen. Deckt die parlamentarische/legislative Ebene ab " +
           "— kein paralleler parlamentarischer Weg nötig."
  },
  {
    id: "rp-committee-digitales", tier: 1,
    grund: "Bundestags-Ausschuss für Digitales und Staatsmodernisierung (Google-News-Themenweg). " +
           "Bestehender Weg wiederverwendet statt paralleler Ausschussweg."
  }
];

// --- Aufbau des vorbereiteten Abbilds ---------------------------------------
function buildBundDigitalSeed() {
  const retrievalPaths = NEUE_WEGE.map((w) => ({
    id: w.id,
    publisher_id: w.publisher_id,
    legacy_source_id: w.legacy_source_id,
    name: w.name,
    method: w.method,
    url: gnews(w.query),
    query: w.query,
    parser: "googlenews-batchexecute",
    priority: w.priority,
    status: "needs_review",      // VORBEREITET
    activation_mode: "manual",   // VORBEREITET — nie auto/always_on -> kein Auto-Crawl
    is_critical: w.is_critical,
    max_items: w.max_items,
    verify_before_activation: true,
    tier: w.tier,
    hinweis: w.hinweis
  }));

  // package_paths: neue Wege + wiederverwendete Bestandswege (m:n, additiv)
  const packagePaths = [
    ...NEUE_WEGE.map((w) => ({ package_id: PACKAGE_ID, retrieval_path_id: w.id, reused: false })),
    ...WIEDERVERWENDETE_WEGE.map((w) => ({ package_id: PACKAGE_ID, retrieval_path_id: w.id, reused: true }))
  ];

  // Erwartete Dimensionen NUR für die neuen Wege (Bestandswege behalten ihre eigenen Dimensionen).
  const pathExpectedLevels = NEUE_WEGE.map((w) => ({ retrieval_path_id: w.id, level: "bund" }));
  const pathExpectedGeographies = NEUE_WEGE.map((w) => ({ retrieval_path_id: w.id, geography_id: GEO_BUND }));
  const pathExpectedTopics = [];
  for (const w of NEUE_WEGE) {
    for (const t of w.topics) pathExpectedTopics.push({ retrieval_path_id: w.id, topic: t });
  }

  return {
    package: PACKAGE,
    entities: NEUE_ENTITAETEN,
    publishers: NEUE_HERAUSGEBER,
    retrievalPaths,
    reusedPathIds: WIEDERVERWENDETE_WEGE.map((w) => w.id),
    packagePaths,
    pathExpectedLevels,
    pathExpectedGeographies,
    pathExpectedTopics,
    summary: {
      packageStatus: PACKAGE.status,
      neueEntitaeten: NEUE_ENTITAETEN.length,
      neueHerausgeber: NEUE_HERAUSGEBER.length,
      neueAbrufwege: retrievalPaths.length,
      wiederverwendeteWege: WIEDERVERWENDETE_WEGE.length,
      paketzuordnungen: packagePaths.length,
      // technisch inaktiv: kein NEUER Weg ist aktiv/auto/always_on
      aktiveNeueWege: retrievalPaths.filter(
        (p) => p.status === "healthy" || p.activation_mode === "auto" || p.activation_mode === "always_on"
      ).length,
      tier1: [...retrievalPaths, ...WIEDERVERWENDETE_WEGE].filter((p) => p.tier === 1).length,
      tier2: [...retrievalPaths, ...WIEDERVERWENDETE_WEGE].filter((p) => p.tier === 2).length,
      alleVerifyBeforeActivation: retrievalPaths.every((p) => p.verify_before_activation === true)
    }
  };
}

module.exports = {
  PACKAGE, PACKAGE_ID, PACKAGE_KEY,
  NEUE_ENTITAETEN, NEUE_HERAUSGEBER, NEUE_WEGE, WIEDERVERWENDETE_WEGE,
  buildBundDigitalSeed, gnews
};
