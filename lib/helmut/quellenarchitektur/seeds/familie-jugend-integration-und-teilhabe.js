"use strict";

// Helmut — Quellenarchitektur · VORBEREITUNG (prepared, INAKTIV) des Bundes-Fachthemenpakets
// `familie-jugend-integration-und-teilhabe` (kanonischer Paketname der verbindlichen
// Paketlandkarte des Projekts).
//
// Namenshistorie (Korrektur): Ein früherer Lauf hatte dieses Paket als
// `familie-gleichstellung-demografie-bund` angelegt und Integration/Teilhabe fälschlich aus dem
// Scope ausgeschlossen. Das Repository enthält KEINE Paketlandkarte-Datei und KEIN vorbestehendes
// kanonisches Paket zu diesem Thema (bestätigt: die 6 Bestandspakete sind bund-basis,
// arbeit-und-soziales, die-linke-bund, regional-niedersachsen, berlin-basis, brandenburg-basis).
// Der kanonische Name stammt daher aus der verbindlichen Projekt-Paketlandkarte (Projektleitung):
// `familie-jugend-integration-und-teilhabe`. Scope entsprechend: Familie, Jugend, Integration und
// Teilhabe — Gleichstellung bleibt sinnvoll berücksichtigt (sekundär), ersetzt aber NICHT Integration.
//
// REINE, DETERMINISTISCHE LOGIK. Kein Netz, keine KI, kein Storage-Write, KEIN Rendering.
// Alles VORBEREITET / vollständig INAKTIV:
//   - source_packages: status "prepared", is_base false, KEINE Profilzuordnung, kein required_classes-Zwang.
//   - retrieval_paths: status "needs_review", activation_mode "manual" -> nie automatisch aktiviert.
//   - computeGlobalActivation aktiviert weder das prepared-Paket noch die manual-Wege (Test belegt).
// Anwenden auf Production (DB-Insert) bleibt ein eigener, ausdrücklich freigabepflichtiger Schritt.
//
// WIEDERVERWENDUNG STATT DUBLETTE (Auftrag §10/§17/§18):
//   - Herausgeber Destatis (publisher-destatis.de) WIEDERVERWENDET (2 thematische Wege; keine 2. Destatis-Entität).
//   - DIP-Weg (rp-dip, always_on in pkg-bund-basis) als PARLAMENTARISCHER Weg WIEDERVERWENDET
//     (additive package_paths-Verknüpfung; kein paralleler DIP-/Ausschuss-/Bundesrat-Weg).
//   - Entität ministry-bmfsfj (Bestand) WIEDERVERWENDET (keine BMBFSFJ/BMFSFJ-Dublette).
//
// KEINE Person in stabiler ID: ADS/UBSKM/Integrationsbeauftragte/Behindertenbeauftragter sind
// INSTITUTIONEN (Ämter), nie Amtsinhaber:innen. KEINE Publikation als Herausgeber (vier
// Regierungsberichte über EINEN gebündelten BMBFSFJ-Weg).

const PACKAGE = Object.freeze({
  id: "pkg-familie-jugend-integration-und-teilhabe",
  key: "familie-jugend-integration-und-teilhabe",
  name: "Familie, Jugend, Integration und Teilhabe",
  purpose:
    "Fachthemenpaket Familien-, Jugend-, Integrations- und Teilhabepolitik des Bundes " +
    "(Regierungsberichte gebündelt, amtliche Statistik, Kinderschutz, Antidiskriminierung, " +
    "Integration/Antirassismus, Teilhabe/Inklusion; Gleichstellung sekundär). Fachthema, NICHT Region. " +
    "Struktur vorbereitet — vollständig INAKTIV; Quellen vor Aktivierung byte-genau zu prüfen.",
  status: "prepared",
  is_base: false,
  political_level: "bund",
  geography_id: "geo-bund",
  required_classes: []
});

// --- Neue politische Entitäten (nur solche, die NICHT bereits in seeds/entities.js stehen) ---
// Wiederverwendet (KEIN neuer Eintrag): ministry-bmfsfj, statoffice-destatis, parliament-bundestag.
// Alle vier sind eigenständige, gesetzlich/organisatorisch verankerte Bundesinstitutionen (Ämter);
// modelliert wird die INSTITUTION, nie der/die Amtsinhaber:in.
const NEUE_ENTITAETEN = [
  {
    id: "authority-antidiskriminierungsstelle",
    entity_type: "authority",
    name: "Antidiskriminierungsstelle des Bundes",
    canonical_key: "antidiskriminierungsstelle",
    level: "bund",
    geography_id: "geo-bund",
    aliases: ["ADS", "Antidiskriminierungsstelle"]
  },
  {
    id: "authority-ubskm",
    entity_type: "authority",
    name: "Unabhängige Bundesbeauftragte gegen sexuellen Missbrauch von Kindern und Jugendlichen",
    canonical_key: "ubskm",
    level: "bund",
    geography_id: "geo-bund",
    aliases: ["UBSKM", "Missbrauchsbeauftragte"]
  },
  {
    id: "authority-integrationsbeauftragte",
    entity_type: "authority",
    name: "Beauftragte der Bundesregierung für Migration, Flüchtlinge und Integration",
    canonical_key: "integrationsbeauftragte",
    level: "bund",
    geography_id: "geo-bund",
    aliases: ["Integrationsbeauftragte", "Beauftragte für Antirassismus"]
  },
  {
    id: "authority-behindertenbeauftragter",
    entity_type: "authority",
    name: "Beauftragter der Bundesregierung für die Belange von Menschen mit Behinderungen",
    canonical_key: "behindertenbeauftragter",
    level: "bund",
    geography_id: "geo-bund",
    aliases: ["Behindertenbeauftragter", "Beauftragter für die Belange von Menschen mit Behinderungen"]
  }
];

// --- Herausgeber-Metadaten je Domain (Name kanonisch + Typ + verknüpfte Entität) ---
// `reused: true` => Bestandsherausgeber, wird NICHT neu angelegt (nur referenziert). canonical_domain
// ist DB-UNIQUE — ein zweiter Publisher auf eine Bestands-Domain würde den Insert brechen.
const PUBLISHER_META = {
  "bmbfsfj.bund.de": {
    id: "publisher-bmbfsfj.bund.de",
    name: "Bundesministerium für Bildung, Familie, Senioren, Frauen und Jugend",
    type: "ministry",
    evidence_role: "official_primary",
    entity_id: "ministry-bmfsfj", // WIEDERVERWENDET (Bestandsentität; keine BMBFSFJ/BMFSFJ-Dublette)
    reused: false
  },
  "antidiskriminierungsstelle.de": {
    id: "publisher-antidiskriminierungsstelle.de",
    name: "Antidiskriminierungsstelle des Bundes",
    type: "authority",
    evidence_role: "official_primary",
    entity_id: "authority-antidiskriminierungsstelle",
    reused: false
  },
  "beauftragte-missbrauch.de": {
    id: "publisher-beauftragte-missbrauch.de",
    name: "Unabhängige Bundesbeauftragte gegen sexuellen Missbrauch von Kindern und Jugendlichen",
    type: "authority",
    evidence_role: "official_primary",
    entity_id: "authority-ubskm",
    reused: false
  },
  "integrationsbeauftragte.de": {
    id: "publisher-integrationsbeauftragte.de",
    name: "Beauftragte der Bundesregierung für Migration, Flüchtlinge und Integration",
    type: "authority",
    evidence_role: "official_primary",
    entity_id: "authority-integrationsbeauftragte",
    reused: false
  },
  "behindertenbeauftragter.de": {
    id: "publisher-behindertenbeauftragter.de",
    name: "Beauftragter der Bundesregierung für die Belange von Menschen mit Behinderungen",
    type: "authority",
    evidence_role: "official_primary",
    entity_id: "authority-behindertenbeauftragter",
    reused: false
  },
  // Bestandsherausgeber — WIEDERVERWENDET (kein neuer Publisher-Insert):
  "destatis.de": { id: "publisher-destatis.de", reused: true }
};

// --- Abrufweg-Spezifikation (alle NEUEN Wege; DIP wird separat als Bestand referenziert) ---
// tier: 1 = dauerhaft unverzichtbar, 2 = regelmäßiger Bericht/Statistik/Monitoring.
// Alle Wege: status needs_review, mode manual, is_critical false.
const PATHS = [
  {
    id: "rp-fjit-bmbfsfj-vorhaben",
    legacy_source_id: "fjit-bmbfsfj-vorhaben",
    domain: "bmbfsfj.bund.de",
    name: "BMBFSFJ — Politische Vorhaben, Gesetzgebung & zentrale Veröffentlichungen",
    method: "googlenews_search",
    gnews: "site:bmbfsfj.bund.de (Gesetzentwurf OR Reform OR Kabinett OR Strategie OR Familie OR Kinder OR Jugend OR Senioren OR Gleichstellung)",
    priority: 88,
    max_items: 16,
    tier: 1,
    topics: ["familie", "jugend", "kinder", "senioren", "gleichstellung", "gesetzgebung"]
  },
  {
    id: "rp-fjit-bmbfsfj-berichte",
    legacy_source_id: "fjit-bmbfsfj-berichte",
    domain: "bmbfsfj.bund.de",
    name: "BMBFSFJ — Berichte der Bundesregierung (Familien-, Kinder- und Jugend-, Gleichstellungs-, Altersbericht)",
    method: "html",
    url: "https://www.bmbfsfj.bund.de/bmbfsfj/ministerium/berichte-der-bundesregierung",
    parser: "html-scrape",
    priority: 82,
    max_items: 16,
    tier: 2,
    // EIN gebündelter Weg über die stabile Übersichtsseite deckt alle vier Sachverständigen-
    // berichte ab (Auftrag §8) — der Kinder- und Jugendbericht sichert die Jugend-Abdeckung.
    topics: ["familienbericht", "kinder-und-jugendbericht", "gleichstellungsbericht", "altersbericht", "berichte-der-bundesregierung"]
  },
  {
    id: "rp-fjit-destatis-bevoelkerung-familie",
    legacy_source_id: "fjit-destatis-bevoelkerung-familie",
    domain: "destatis.de",
    name: "Destatis — Bevölkerung, Familien & Migrationshintergrund",
    method: "googlenews_search",
    gnews: "site:destatis.de (Geburten OR Bevölkerung OR Bevölkerungsvorausberechnung OR Haushalte OR Familien OR Migrationshintergrund OR Altersstruktur)",
    priority: 84,
    max_items: 12,
    tier: 1,
    topics: ["bevoelkerung", "familie", "demografie", "migrationshintergrund", "haushalte"]
  },
  {
    id: "rp-fjit-destatis-gleichstellung",
    legacy_source_id: "fjit-destatis-gleichstellung",
    domain: "destatis.de",
    name: "Destatis — Gleichstellung & Erwerbsbeteiligung",
    method: "googlenews_search",
    gnews: "site:destatis.de (\"Gender Pay Gap\" OR Gleichstellung OR Verdienstunterschied OR \"Erwerbstätigkeit von Frauen\" OR \"Gender Care Gap\")",
    priority: 80,
    max_items: 12,
    tier: 2,
    topics: ["gleichstellung", "gender-pay-gap", "erwerbsbeteiligung"]
  },
  {
    id: "rp-fjit-ads-antidiskriminierung",
    legacy_source_id: "fjit-ads-antidiskriminierung",
    domain: "antidiskriminierungsstelle.de",
    name: "Antidiskriminierungsstelle des Bundes — Jahresbericht & Publikationen",
    method: "googlenews_search",
    gnews: "site:antidiskriminierungsstelle.de (Jahresbericht OR Diskriminierung OR Stellungnahme OR AGG OR Teilhabe)",
    priority: 74,
    max_items: 10,
    tier: 2,
    topics: ["antidiskriminierung", "integration", "teilhabe", "gleichstellung", "agg", "jahresbericht"]
  },
  {
    id: "rp-fjit-ubskm-kinderschutz",
    legacy_source_id: "fjit-ubskm-kinderschutz",
    domain: "beauftragte-missbrauch.de",
    name: "UBSKM — Kinderschutz, Missbrauchsaufarbeitung & Monitoring",
    method: "googlenews_search",
    gnews: "site:beauftragte-missbrauch.de (Kinderschutz OR Missbrauch OR Bericht OR Studie OR Aufarbeitung OR Prävention)",
    priority: 76,
    max_items: 10,
    tier: 2,
    topics: ["kinderschutz", "jugend", "missbrauch", "aufarbeitung", "praevention"]
  },
  {
    id: "rp-fjit-integration",
    legacy_source_id: "fjit-integration",
    domain: "integrationsbeauftragte.de",
    name: "Integrationsbeauftragte der Bundesregierung — Integration, Teilhabe & Antirassismus",
    method: "googlenews_search",
    gnews: "site:integrationsbeauftragte.de (Integration OR Teilhabe OR Antirassismus OR Einbürgerung OR Migration OR Bericht)",
    priority: 78,
    max_items: 12,
    tier: 2,
    topics: ["integration", "teilhabe", "antirassismus", "migration", "einbuergerung"]
  },
  {
    id: "rp-fjit-teilhabe",
    legacy_source_id: "fjit-teilhabe",
    domain: "behindertenbeauftragter.de",
    name: "Beauftragter der Bundesregierung für die Belange von Menschen mit Behinderungen — Teilhabe & Inklusion",
    method: "googlenews_search",
    gnews: "site:behindertenbeauftragter.de (Teilhabe OR Inklusion OR Barrierefreiheit OR Behinderung OR \"UN-BRK\" OR Bericht)",
    priority: 76,
    max_items: 12,
    tier: 2,
    topics: ["teilhabe", "inklusion", "barrierefreiheit", "behinderung", "un-brk"]
  }
];

// Bestehende Abrufwege, die dieses Paket WIEDERVERWENDET (nur additive package_paths-Verknüpfung,
// KEIN neuer retrieval_paths-Eintrag). rp-dip ist der always_on-DIP-Weg aus pkg-bund-basis und
// deckt Gesetzentwürfe/Anträge/Anfragen/Unterrichtungen/Ausschussdrucksachen/Bundesrat-Vorgänge
// sowie die vier Regierungsberichte als Drucksache ab.
const REUSED_PATH_IDS = ["rp-dip"];

function gnewsUrl(q) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=de&gl=DE&ceid=DE:de`;
}

function buildSeed() {
  const publishers = new Map(); // publisher_id -> publisher (nur NEUE)
  const reusedPublishers = new Set(); // Bestands-IDs, die referenziert werden
  const retrievalPaths = [];
  const packagePaths = [];
  const pathExpectedLevels = [];
  const pathExpectedTopics = [];
  const seenPkgPath = new Set();

  function ensurePublisher(domain) {
    const meta = PUBLISHER_META[domain];
    if (!meta) throw new Error(`Unbekannte Publisher-Domain (kein Meta): ${domain}`);
    if (meta.reused) { reusedPublishers.add(meta.id); return meta.id; }
    if (!publishers.has(meta.id)) {
      publishers.set(meta.id, {
        id: meta.id,
        name: meta.name,
        canonical_domain: domain,
        publisher_type: meta.type,
        evidence_role: meta.evidence_role,
        trust: "unbekannt",           // VORBEREITET — Vertrauensstufe erst nach Verifikation
        lifecycle_status: "active",
        entity_id: meta.entity_id || null
      });
    }
    return meta.id;
  }

  function linkPackage(pathId) {
    const key = `${PACKAGE.id}|${pathId}`;
    if (seenPkgPath.has(key)) return;
    seenPkgPath.add(key);
    packagePaths.push({ package_id: PACKAGE.id, retrieval_path_id: pathId });
  }

  for (const p of PATHS) {
    const publisherId = ensurePublisher(p.domain);
    const isGnews = p.method === "googlenews_search";
    const url = isGnews ? gnewsUrl(p.gnews) : p.url;
    retrievalPaths.push({
      id: p.id,
      publisher_id: publisherId,
      legacy_source_id: p.legacy_source_id,
      name: p.name,
      method: p.method,
      url,
      query: isGnews ? p.gnews : null,
      parser: isGnews ? "googlenews-batchexecute" : (p.parser || null),
      priority: p.priority,
      status: "needs_review",       // VORBEREITET — nie healthy/active
      activation_mode: "manual",    // VORBEREITET — nie auto/always_on -> kein Auto-Crawl
      is_critical: false,           // thematischer Weg, keine always_on-Systemquelle
      max_items: p.max_items,
      represents_type: null,        // hängt am echten Herausgeber (kein Aggregator-Zielhinweis)
      tier: p.tier
    });
    linkPackage(p.id);
    pathExpectedLevels.push({ retrieval_path_id: p.id, level: "bund" });
    for (const t of p.topics) pathExpectedTopics.push({ retrieval_path_id: p.id, topic: t });
  }

  // Bestehende Wege additiv verknüpfen (Wiederverwendung, kein neuer Weg).
  for (const rid of REUSED_PATH_IDS) linkPackage(rid);

  const retrievalPathsOut = retrievalPaths.map(({ tier, ...rest }) => rest); // tier ist nur Bericht-Metadatum
  return {
    package: PACKAGE,
    entities: NEUE_ENTITAETEN,
    publishers: [...publishers.values()],
    reusedPublishers: [...reusedPublishers],
    retrievalPaths: retrievalPathsOut,
    reusedPathIds: [...REUSED_PATH_IDS],
    packagePaths,
    pathExpectedLevels,
    pathExpectedTopics,
    // Tier-Zuordnung für Bericht/Test (neue Wege + wiederverwendeter DIP-Weg).
    tiers: {
      tier1: [...retrievalPaths.filter((p) => p.tier === 1).map((p) => p.id), ...REUSED_PATH_IDS], // DIP = Tier 1 (wiederverwendet)
      tier2: retrievalPaths.filter((p) => p.tier === 2).map((p) => p.id),
      tier3: []
    },
    // Ehrliche Kennzahlen der Vorbereitung.
    summary: {
      status: "prepared",
      is_base: false,
      neuePublisher: publishers.size,
      wiederverwendetePublisher: reusedPublishers.size,
      neueEntitaeten: NEUE_ENTITAETEN.length,
      neueAbrufwege: retrievalPathsOut.length,
      wiederverwendeteAbrufwege: REUSED_PATH_IDS.length,
      abrufwegeGesamtImPaket: packagePaths.length,
      paketzuordnungen: packagePaths.length,
      aktiveNeueAbrufwege: retrievalPathsOut.filter(
        (p) => p.status === "healthy" || p.activation_mode === "auto" || p.activation_mode === "always_on"
      ).length
    }
  };
}

module.exports = { buildSeed, PACKAGE, NEUE_ENTITAETEN, PUBLISHER_META, PATHS, REUSED_PATH_IDS, gnewsUrl };
