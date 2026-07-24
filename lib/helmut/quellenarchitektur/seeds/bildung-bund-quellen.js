"use strict";

// Helmut — Quellenarchitektur · Quellenpaket "bildung-bund" (Bildungspolitik Bund).
// STRUKTURIERTE, INAKTIVE VORBEREITUNG — analog zu seeds/landesmodule-quellen.js.
//
// REINE, DETERMINISTISCHE LOGIK. Kein Netz, keine KI, kein Storage-Write, KEIN Rendering.
// Formt die fachlich geprueften Bildungsquellen (Bund) in das relationale Modell
// (publishers / political_entities / retrieval_paths / package_paths / path_expected_*),
// ausschliesslich als VORBEREITET:
//   - Paket pkg-bildung-bund: status "prepared" (NICHT active) -> aktiviert KEINE Wege.
//   - retrieval_paths: status "needs_review" (NICHT healthy), activation_mode "manual"
//     (NICHT auto/always_on) -> werden nie automatisch aktiviert/gecrawlt.
// Das Anwenden auf Production (DB-Insert) bleibt ein eigener, ausdruecklich
// freigabepflichtiger Schritt. Dieses Modul erzeugt NUR das In-Memory-Abbild; es schreibt nichts.
//
// WIEDERVERWENDUNG STATT DUBLETTE (Auftrag §1/§7.1/§7.2): Bestehende Herausgeber,
// Entitaeten und Abrufwege werden NICHT neu angelegt, sondern referenziert. Insbesondere:
//   - rp-committee-bildung  (bestehender, aktiver parlamentarischer Bildungsweg in Bund Basis)
//     wird NUR zusaetzlich dem neuen Paket zugeordnet — KEIN paralleler Bundestagsweg.
//   - publisher-destatis.de / publisher-arbeitsagentur.de / publisher-bundesrat.de /
//     publisher-oecd.org werden fuer NEUE, bildungsspezifisch gefilterte Wege wiederverwendet.
//   - Entitaeten committee-bt-bildung / statoffice-destatis / authority-bundesagentur-arbeit /
//     parliament-bundesrat bleiben unveraendert und werden referenziert.
//
// RESSORTSTRUKTUR 2026 (WebSearch-verifiziert, siehe docs/quellenarchitektur/29-*):
//   - BMBFSFJ = Bundesministerium fuer Bildung, Familie, Senioren, Frauen und Jugend
//     (bmbfsfj.bund.de). Traegt seit 2025 die Bundes-Bildungspolitik (BAfoeG, Ganztag,
//     fruehkindliche + berufliche Bildung). NEUE Entitaet ministry-bmbfsfj — bewusst NICHT
//     identisch mit dem historischen ministry-bmfsfj (Familienministerium, bmfsfj.de);
//     die alte ID bleibt UNVERAENDERT (kein Rename, kein Bruch).
//   - BMFTR = Bundesministerium fuer Forschung, Technologie und Raumfahrt (frueher BMBF).
//     Forschung/Technologie/Raumfahrt -> gehoert ins spaetere Paket wissenschaft-forschung-bund,
//     NICHT hierher (kein eigenstaendiger bildungspolitischer Mehrwert nach dem Ressortschnitt).
//   - KMK-Reform 2025: Die Kultusministerkonferenz hat die Bildungsministerkonferenz
//     (Bildungs-MK) als eigenstaendige Fach-MK ausgegruendet; Dach + Domain bleiben kmk.org.
//     Laenderkoordination — KEINE Bundesbehoerde.

// ---------------------------------------------------------------------------
// 1) NEUE politische Entitaeten (nur solche, die NICHT bereits in seeds/entities.js stehen)
// ---------------------------------------------------------------------------
const NEUE_ENTITAETEN = [
  {
    id: "ministry-bmbfsfj", entity_type: "ministry",
    name: "Bundesministerium für Bildung, Familie, Senioren, Frauen und Jugend",
    canonical_key: "bmbfsfj", level: "bund", geography_id: "geo-bund",
    aliases: ["BMBFSFJ", "Bildungsministerium des Bundes"]
  },
  {
    id: "institution-kmk", entity_type: "other_institution",
    name: "Kultusministerkonferenz (KMK) / Bildungsministerkonferenz",
    canonical_key: "kmk", level: "land", geography_id: null,
    aliases: ["KMK", "Kultusministerkonferenz", "Bildungsministerkonferenz", "Bildungs-MK",
      "Ständige Konferenz der Kultusminister der Länder"]
  },
  {
    id: "authority-bibb", entity_type: "authority",
    name: "Bundesinstitut für Berufsbildung",
    canonical_key: "bibb", level: "bund", geography_id: "geo-bund",
    aliases: ["BIBB"]
  },
  {
    id: "institution-dipf", entity_type: "other_institution",
    name: "DIPF | Leibniz-Institut für Bildungsforschung und Bildungsinformation",
    canonical_key: "dipf", level: null, geography_id: null,
    aliases: ["DIPF", "Autorengruppe Bildungsberichterstattung"]
  },
  {
    id: "institution-swk", entity_type: "other_institution",
    name: "Ständige Wissenschaftliche Kommission der KMK (SWK)",
    canonical_key: "swk", level: "land", geography_id: null,
    aliases: ["SWK"]
  },
  {
    id: "institution-iqb", entity_type: "other_institution",
    name: "Institut zur Qualitätsentwicklung im Bildungswesen (IQB)",
    canonical_key: "iqb", level: "land", geography_id: null,
    aliases: ["IQB"]
  },
  {
    id: "institution-dzhw", entity_type: "other_institution",
    name: "Deutsches Zentrum für Hochschul- und Wissenschaftsforschung (DZHW)",
    canonical_key: "dzhw", level: null, geography_id: null,
    aliases: ["DZHW"]
  }
];

// ---------------------------------------------------------------------------
// 2) Herausgeber — NEUE (angelegt) + WIEDERVERWENDETE (nur referenziert, NICHT angelegt)
// ---------------------------------------------------------------------------
// Neue Herausgeber (id = publisher-<domain>). evidence_role DB-CHECK-konform.
const NEUE_PUBLISHER = [
  { id: "publisher-bmbfsfj.bund.de", name: "Bundesministerium für Bildung, Familie, Senioren, Frauen und Jugend", canonical_domain: "bmbfsfj.bund.de", publisher_type: "ministry", evidence_role: "official_primary", entity_id: "ministry-bmbfsfj" },
  { id: "publisher-kmk.org", name: "Kultusministerkonferenz (KMK)", canonical_domain: "kmk.org", publisher_type: "other_institution", evidence_role: "official_primary", entity_id: "institution-kmk" },
  { id: "publisher-bibb.de", name: "Bundesinstitut für Berufsbildung", canonical_domain: "bibb.de", publisher_type: "authority", evidence_role: "data_source", entity_id: "authority-bibb" },
  { id: "publisher-bildungsbericht.de", name: "Nationaler Bildungsbericht (Autorengruppe Bildungsberichterstattung / DIPF)", canonical_domain: "bildungsbericht.de", publisher_type: "other_institution", evidence_role: "data_source", entity_id: "institution-dipf" },
  { id: "publisher-swk-bildung.org", name: "Ständige Wissenschaftliche Kommission der KMK (SWK)", canonical_domain: "swk-bildung.org", publisher_type: "other_institution", evidence_role: "official_primary", entity_id: "institution-swk" },
  { id: "publisher-iqb.hu-berlin.de", name: "Institut zur Qualitätsentwicklung im Bildungswesen (IQB)", canonical_domain: "iqb.hu-berlin.de", publisher_type: "other_institution", evidence_role: "data_source", entity_id: "institution-iqb" },
  { id: "publisher-dzhw.eu", name: "Deutsches Zentrum für Hochschul- und Wissenschaftsforschung (DZHW)", canonical_domain: "dzhw.eu", publisher_type: "other_institution", evidence_role: "data_source", entity_id: "institution-dzhw" }
];

// Wiederverwendete Herausgeber (existieren bereits im Basis-Seed 20260713 — NIE neu anlegen).
const REUSED_PUBLISHER_IDS = [
  "publisher-destatis.de",        // statoffice-destatis
  "publisher-arbeitsagentur.de",  // authority-bundesagentur-arbeit
  "publisher-bundesrat.de",       // parliament-bundesrat
  "publisher-oecd.org",           // OECD (ohne eigene Entitaet)
  "aggregator-google-news"        // fuer den wiederverwendeten rp-committee-bildung
];

// Wiederverwendete Entitaeten (existieren bereits — NIE neu anlegen).
const REUSED_ENTITY_IDS = [
  "committee-bt-bildung",            // Ausschuss fuer Bildung und Forschung (Bundestag)
  "statoffice-destatis",             // Statistisches Bundesamt
  "authority-bundesagentur-arbeit",  // Bundesagentur fuer Arbeit
  "parliament-bundesrat"             // Bundesrat
];

// ---------------------------------------------------------------------------
// 3) Abrufwege — NEUE (angelegt) + WIEDERVERWENDETE (nur zugeordnet)
// ---------------------------------------------------------------------------
// Methode durchgaengig googlenews_search mit site:-Filter — der im Repo kanonische,
// robuste, bot-resistente Weg (Direktfeeds amtlicher Stellen sind ueberwiegend 403/429;
// vgl. seeds/landesmodule-verifikation.js). KEINE erfundenen RSS/API-Endpunkte.
//
// Felder je Weg:
//   tier               1|2|3            — Bedeutungsrang (Doku/Bericht, NICHT in DB)
//   competence         Bund|Bund-Länder|Länderkoordination|wiss_Monitoring|international
//   frequency          ereignisnah|regelmaessig|periodisch  (Doku/Bericht, NICHT in DB)
//   levels             DB path_expected_levels
//   topics             DB path_expected_topics (speist die Abdeckungsmatrix)
//   is_critical        Pflicht-Primaerquelle nie still archivieren
function gnews(query) {
  // Deterministische Google-News-Such-URL aus einer Suchdefinition (kein erfundener Feed).
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=de&gl=DE&ceid=DE:de`;
}

const NEUE_WEGE = [
  // --- Tier 1: dauerhaft unverzichtbar --------------------------------------
  {
    id: "rp-bildung-bmbfsfj", publisher_id: "publisher-bmbfsfj.bund.de", legacy_source_id: "bildung-bmbfsfj",
    name: "BMBFSFJ — Bildungspolitik, Förderbekanntmachungen, BAföG, Ganztag, frühkindliche & berufliche Bildung",
    query: "site:bmbfsfj.bund.de (Bildung OR BAföG OR Ganztag OR Kita OR frühkindliche OR Berufsbildung OR Ausbildung OR Startchancen OR Weiterbildung OR Förderrichtlinie)",
    tier: 1, competence: "Bund", frequency: "ereignisnah", is_critical: true,
    levels: ["bund"], topics: ["bundesgesetzgebung", "bundesprogramme", "bafoeg", "ganztag", "fruehkindliche_bildung", "berufliche_bildung", "bildungsfoerderung", "weiterbildung"]
  },
  {
    id: "rp-bildung-kmk", publisher_id: "publisher-kmk.org", legacy_source_id: "bildung-kmk",
    name: "KMK / Bildungsministerkonferenz — Beschlüsse, Bildungsstandards, Länderkoordination",
    query: "site:kmk.org (Beschluss OR Bildungsstandards OR Bildungsministerkonferenz OR Schule OR Lehrkräfte OR Anerkennung)",
    tier: 1, competence: "Länderkoordination", frequency: "ereignisnah", is_critical: true,
    levels: ["land"], topics: ["laenderkoordination", "bildungsstandards", "schulqualitaet", "anerkennung"]
  },
  {
    id: "rp-bildung-bibb", publisher_id: "publisher-bibb.de", legacy_source_id: "bildung-bibb",
    name: "BIBB — Berufsbildungsbericht, Datenreport, Ausbildungsmarktanalysen",
    query: "site:bibb.de (Berufsbildungsbericht OR Datenreport OR Ausbildung OR Berufsbildung OR Ausbildungsmarkt)",
    tier: 1, competence: "Bund", frequency: "regelmaessig", is_critical: true,
    levels: ["bund"], topics: ["berufliche_bildung", "ausbildungsmarkt", "berufsbildungsbericht"]
  },
  {
    id: "rp-bildung-destatis", publisher_id: "publisher-destatis.de", legacy_source_id: "bildung-destatis",
    name: "Destatis — Bildungsstatistik (Schule, Hochschule, Berufsbildung, Bildungsfinanzierung, Kita)",
    query: "site:destatis.de (Schulstatistik OR Hochschulstatistik OR Berufsbildung OR Bildungsfinanzierung OR Bildungsausgaben OR Kindertagesbetreuung)",
    tier: 1, competence: "Bund", frequency: "regelmaessig", is_critical: false,
    levels: ["bund"], topics: ["bildungsstatistik", "schulstatistik", "hochschulstatistik", "bildungsfinanzierung", "kindertagesbetreuung"]
  },
  {
    id: "rp-bildung-bildungsbericht", publisher_id: "publisher-bildungsbericht.de", legacy_source_id: "bildung-bildungsbericht",
    name: "Nationaler Bildungsbericht „Bildung in Deutschland“ (periodische Synthese, DIPF-koordiniert)",
    query: "\"Bildung in Deutschland\" (Bildungsbericht OR Bildungsberichterstattung OR bildungsbericht.de)",
    tier: 1, competence: "wiss_Monitoring", frequency: "periodisch", is_critical: false,
    levels: ["bund", "land"], topics: ["bildungsmonitoring", "bildungsgerechtigkeit"]
  },
  // --- Tier 2: wichtig, aber periodisch / teils redundant --------------------
  {
    id: "rp-bildung-swk", publisher_id: "publisher-swk-bildung.org", legacy_source_id: "bildung-swk",
    name: "SWK — wissenschaftliche Beratung der KMK (Gutachten, Stellungnahmen, Empfehlungen)",
    query: "(\"Ständige Wissenschaftliche Kommission\" OR SWK OR swk-bildung.org) (Gutachten OR Stellungnahme OR Empfehlung)",
    tier: 2, competence: "Länderkoordination", frequency: "periodisch", is_critical: false,
    levels: ["land"], topics: ["wissenschaftliche_beratung", "bildungsstandards"]
  },
  {
    id: "rp-bildung-iqb", publisher_id: "publisher-iqb.hu-berlin.de", legacy_source_id: "bildung-iqb",
    name: "IQB — Überprüfung der Bildungsstandards, IQB-Bildungstrend",
    query: "(IQB OR \"Institut zur Qualitätsentwicklung im Bildungswesen\") (Bildungstrend OR Bildungsstandards OR Ländervergleich)",
    tier: 2, competence: "Länderkoordination", frequency: "periodisch", is_critical: false,
    levels: ["land"], topics: ["bildungsstandards", "schulqualitaet", "bildungsmonitoring"]
  },
  {
    id: "rp-bildung-oecd", publisher_id: "publisher-oecd.org", legacy_source_id: "bildung-oecd",
    name: "OECD — internationale Bildungsvergleiche (PISA, Education at a Glance)",
    query: "site:oecd.org Germany (PISA OR education OR \"Education at a Glance\")",
    tier: 2, competence: "international", frequency: "periodisch", is_critical: false,
    levels: ["international"], topics: ["internationale_vergleiche"]
  },
  {
    id: "rp-bildung-dzhw", publisher_id: "publisher-dzhw.eu", legacy_source_id: "bildung-dzhw",
    name: "DZHW — Studienzugang, Studienverlauf, Studienabbruch, soziale Lage Studierender",
    query: "site:dzhw.eu (Studienabbruch OR Studierende OR Studienzugang OR \"soziale Lage\" OR Studienverlauf)",
    tier: 2, competence: "wiss_Monitoring", frequency: "periodisch", is_critical: false,
    levels: ["bund"], topics: ["hochschulzugang", "studienverlauf", "studienabbruch", "studienfinanzierung"]
  },
  // --- Tier 3: ergaenzend / ereignisbezogen ----------------------------------
  {
    id: "rp-bildung-ba-ausbildungsmarkt", publisher_id: "publisher-arbeitsagentur.de", legacy_source_id: "bildung-ba-ausbildungsmarkt",
    name: "Bundesagentur für Arbeit — Ausbildungsmarkt, Übergang Schule–Beruf, Weiterbildungsförderung",
    query: "site:arbeitsagentur.de (Ausbildungsmarkt OR \"Übergang Schule\" OR Berufsberatung OR Weiterbildungsförderung OR Fachkräfte)",
    tier: 3, competence: "Bund", frequency: "regelmaessig", is_critical: false,
    levels: ["bund"], topics: ["ausbildungsmarkt", "uebergang_schule_beruf", "weiterbildung"]
  },
  {
    id: "rp-bildung-bundesrat", publisher_id: "publisher-bundesrat.de", legacy_source_id: "bildung-bundesrat",
    name: "Bundesrat — zustimmungspflichtige Bildungsgesetze & Bund-Länder-Programme",
    query: "site:bundesrat.de (Bildung OR BAföG OR Ganztag OR Startchancen OR Digitalpakt OR Kita OR Ausbildung)",
    tier: 3, competence: "Bund-Länder", frequency: "ereignisnah", is_critical: false,
    levels: ["bund"], topics: ["bundesgesetzgebung", "bund_laender_koordination"]
  }
];

// Wiederverwendete Abrufwege (existieren bereits — NUR dem Paket zusaetzlich zuordnen,
// NIE neu anlegen, NIE veraendern). rp-committee-bildung deckt die parlamentarische
// Bundestags-Bildungsfunktion ab (Gesetzentwuerfe/Ausschuss/Anhoerungen) — deshalb KEIN
// paralleler Bundestagsweg (Auftrag §4 · "keine parallelen parlamentarischen Wege").
const REUSED_PATHS = [
  {
    id: "rp-committee-bildung", tier: 1, competence: "Bund",
    frequency: "ereignisnah", funktion: "Parlamentarischer Bildungsweg (Ausschuss Bildung/Forschung, Bundestag) — bestehend & aktiv in Bund Basis"
  }
];

const PACKAGE = Object.freeze({
  id: "pkg-bildung-bund", key: "bildung-bund",
  name: "Bildung Bund",
  purpose: "Fachthemenpaket Bildungspolitik des Bundes (Bundesgesetzgebung, Bund-Länder-Koordination, berufliche Bildung, Ausbildungsmarkt, BAföG, frühkindliche Bildung, Ganztag, Bildungsmonitoring, Bildungsstandards, Hochschulzugang, internationale Vergleiche). Bund-fokussiert; Länderkompetenz wird als solche gekennzeichnet, nicht als Bundeskompetenz suggeriert. Struktur vorbereitet — INAKTIV bis Verifikation + Freigabe.",
  status: "prepared", is_base: false, political_level: "bund", geography_id: "geo-bund",
  required_classes: []
});

// ---------------------------------------------------------------------------
// Abbild bauen (dedup-bewusst, deterministisch)
// ---------------------------------------------------------------------------
function buildBildungBundSeed() {
  const packagePaths = [];
  const pathExpectedLevels = [];
  const pathExpectedGeographies = [];
  const pathExpectedTopics = [];

  // Neue Wege -> Paketzuordnung + erwartete Dimensionen.
  for (const w of NEUE_WEGE) {
    packagePaths.push({ package_id: PACKAGE.id, retrieval_path_id: w.id });
    for (const lvl of w.levels) pathExpectedLevels.push({ retrieval_path_id: w.id, level: lvl });
    pathExpectedGeographies.push({ retrieval_path_id: w.id, geography_id: "geo-bund" });
    for (const t of w.topics) pathExpectedTopics.push({ retrieval_path_id: w.id, topic: t });
  }
  // Wiederverwendete Wege -> NUR Paketzuordnung (Dimensionen NICHT anfassen).
  for (const r of REUSED_PATHS) packagePaths.push({ package_id: PACKAGE.id, retrieval_path_id: r.id });

  const retrievalPaths = NEUE_WEGE.map((w) => ({
    id: w.id,
    publisher_id: w.publisher_id,
    legacy_source_id: w.legacy_source_id,
    name: w.name,
    method: "googlenews_search",
    url: gnews(w.query),
    query: w.query,
    parser: "googlenews-batchexecute",
    priority: 60,
    status: "needs_review",       // VORBEREITET — nie healthy/active
    activation_mode: "manual",    // VORBEREITET — nie auto/always_on -> kein Auto-Crawl
    is_critical: !!w.is_critical,
    max_items: 16,
    // reine Report-Metadaten (nicht in DB):
    tier: w.tier, competence: w.competence, frequency: w.frequency, topics: w.topics
  }));

  const aktiveWege = retrievalPaths.filter(
    (p) => p.status === "healthy" || p.activation_mode === "auto" || p.activation_mode === "always_on"
  ).length;

  return {
    package: { ...PACKAGE },
    entities: NEUE_ENTITAETEN,
    publishers: NEUE_PUBLISHER,
    retrievalPaths,               // NUR neue Wege (werden angelegt)
    reusedPathIds: REUSED_PATHS.map((r) => r.id),
    reusedPublisherIds: [...REUSED_PUBLISHER_IDS],
    reusedEntityIds: [...REUSED_ENTITY_IDS],
    packagePaths,                 // neue + wiederverwendete Wege
    pathExpectedLevels,
    pathExpectedGeographies,
    pathExpectedTopics,
    summary: {
      status: "prepared",
      neueEntitaeten: NEUE_ENTITAETEN.length,
      neuePublisher: NEUE_PUBLISHER.length,
      wiederverwendetePublisher: REUSED_PUBLISHER_IDS.length,
      wiederverwendeteEntitaeten: REUSED_ENTITY_IDS.length,
      neueWege: retrievalPaths.length,
      wiederverwendeteWege: REUSED_PATHS.length,
      wegeGesamt: retrievalPaths.length + REUSED_PATHS.length,
      wegeKritisch: retrievalPaths.filter((p) => p.is_critical).length,
      paketzuordnungen: packagePaths.length,
      tier1: NEUE_WEGE.filter((w) => w.tier === 1).length + REUSED_PATHS.filter((r) => r.tier === 1).length,
      tier2: NEUE_WEGE.filter((w) => w.tier === 2).length,
      tier3: NEUE_WEGE.filter((w) => w.tier === 3).length,
      // Inaktivitaets-Invariante: kein neuer Weg ist aktiv/auto/always_on.
      aktiveWege
    }
  };
}

module.exports = {
  buildBildungBundSeed,
  NEUE_ENTITAETEN, NEUE_PUBLISHER, NEUE_WEGE, REUSED_PATHS,
  REUSED_PUBLISHER_IDS, REUSED_ENTITY_IDS, PACKAGE
};
