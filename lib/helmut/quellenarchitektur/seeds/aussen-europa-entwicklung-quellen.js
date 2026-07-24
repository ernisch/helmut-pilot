"use strict";

// Helmut — Quellenarchitektur · Fachthemenpaket-Vorbereitung (Bund):
// `aussen-europa-und-entwicklung-bund` — Außen-, Europa- und Entwicklungspolitik.
//
// REINE, DETERMINISTISCHE LOGIK. Kein Netz, keine KI, kein Storage-Write, KEIN Rendering.
// Formt die fachlich geprüften Kern-Institutionen in das relationale Modell
// (publishers / retrieval_paths / package_paths / path_expected_*) — ausschließlich als
// VORBEREITET (Auftrag: prepared/inaktiv, additiv, freigabepflichtig):
//   - source_package: status "prepared", is_base false  -> computeGlobalActivation aktiviert NICHT.
//   - retrieval_paths: status "needs_review" (NIE healthy/active), activation_mode "manual"
//     (NIE auto/always_on) -> werden nie automatisch aktiviert/gecrawlt. DB-Default von
//     activation_mode ist "auto" — deshalb wird "manual" IMMER explizit gesetzt.
//
// WIEDERVERWENDUNG statt Dubletten (Auftrag §9): DIP (rp-dip) und Bundesregierung
// (rp-bundesregierung) sind bereits vorhandene, aktive (always_on) Abrufwege der Basis.
// Sie werden NUR über zusätzliche package_paths-Verknüpfungen dem neuen Paket zugeordnet —
// KEINE Neu-Anlage, KEINE Statusänderung. Da beide bereits always_on aktiv sind, entsteht
// durch die Zuordnung KEIN neuer Crawl. Das Auswärtige-Amt-Entity (ministry-auswaertiges-amt)
// existiert bereits (seeds/entities.js) und wird wiederverwendet — keine zweite Entity.
//
// TECHNISCHE VERIFIKATION (Auftrag §10): Egress war in der Bau-Umgebung für die Zielhosts
// gesperrt (403 auf AA/BMZ/EU). Die Einstiegs-URLs sind FACHLICH bestätigt (offizielle
// Domains; AA/BMZ zusätzlich in sourceSafety.OFFICIAL_DOMAINS), aber NICHT bytegenau
// verifiziert. Deshalb: method "html" auf stabile amtliche Übersichtsseiten; amtlich
// dokumentierte RSS/API-Endpunkte sind NICHT technisch verdrahtet, sondern im Paketmanifest
// als Aktivierungs-Upgrade festgehalten (keine erfundene RSS/API-URL — Auftrag §10).

// --- Das Paket (neu, prepared, Fachthema Bund) ------------------------------
const PACKAGE = Object.freeze({
  id: "pkg-aussen-europa-und-entwicklung-bund",
  key: "aussen-europa-und-entwicklung-bund",
  name: "Außen, Europa und Entwicklung (Bund)",
  purpose:
    "Fachthemenpaket deutsche Außenpolitik, Europapolitik der Bundesregierung, europäische " +
    "Gesetzgebung mit deutschem Handlungsbedarf, internationale Beziehungen/Diplomatie, " +
    "Krisen/Konflikte, Sanktionen, internationale Abkommen, Entwicklungszusammenarbeit und " +
    "humanitäre Hilfe. Bündelt AA, BMZ, EU-Kommission, Rat/Europäischer Rat und das " +
    "Europäische Parlament (Legislative Observatory) und verwendet DIP + Bundesregierung wieder. " +
    "Struktur vorbereitet — Quellen technisch inaktiv, Aktivierung nach Verifikation + Freigabe.",
  status: "prepared",
  is_base: false,
  political_level: "bund",
  geography_id: "geo-bund",
  required_classes: []
});

// --- Neu benötigte politische Entitäten (nur solche, die NICHT in seeds/entities.js stehen).
// Wiederverwendet (referenziert, NICHT neu angelegt): ministry-auswaertiges-amt, parliament-bundestag,
// government-bund (Alias Bundeskanzleramt/Bundeskabinett), parliament-bundesrat,
// committee-bt-auswaertiges, committee-bt-europa, committee-bt-entwicklung, committee-bt-menschenrechte.
// EU-/supranationale Institutionen werden bewusst als entity_type "other_institution" (level "eu")
// typisiert — sie stehen außerhalb der deutschen typisierten Hierarchie; das vermeidet, dass
// deutsch-parlamentarische Matching-/Radar-Logik sie fälschlich als Bundes-Parlament behandelt.
const NEW_ENTITIES = [
  {
    id: "ministry-bmz", entity_type: "ministry",
    name: "Bundesministerium für wirtschaftliche Zusammenarbeit und Entwicklung",
    canonical_key: null, level: "bund", geography_id: "geo-bund",
    aliases: ["BMZ", "Entwicklungsministerium"]
  },
  {
    id: "eu-commission", entity_type: "other_institution", name: "Europäische Kommission",
    canonical_key: "eu-kommission", level: "eu", geography_id: null,
    aliases: ["EU-Kommission", "Europäische Kommission", "European Commission", "EC"]
  },
  {
    id: "eu-council-of-the-eu", entity_type: "other_institution", name: "Rat der Europäischen Union",
    canonical_key: "rat-der-eu", level: "eu", geography_id: null,
    aliases: ["Rat der EU", "Ministerrat", "EU-Rat", "Council of the European Union"]
  },
  {
    id: "eu-european-council", entity_type: "other_institution", name: "Europäischer Rat",
    canonical_key: "europaeischer-rat", level: "eu", geography_id: null,
    aliases: ["European Council", "EU-Gipfel", "Europäischer Rat"]
  },
  {
    id: "eu-parliament", entity_type: "other_institution", name: "Europäisches Parlament",
    canonical_key: "europaeisches-parlament", level: "eu", geography_id: null,
    aliases: ["Europaparlament", "EU-Parlament", "European Parliament", "EP"]
  }
];

// --- Neu benötigte Herausgeber (5). canonical_domain ist UNIQUE — alle hier sind neu
// (im Repository/Basis-Seed nicht vorhanden, read-only geprüft). AA/BMZ verweisen auf
// vorhandene bzw. neue Ministeriums-Entitäten; die drei EU-Herausgeber auf die neuen
// EU-Institutionen. evidence_role = official_primary (amtliche Primärquellen), trust = "hoch".
const NEW_PUBLISHERS = [
  {
    id: "publisher-auswaertiges-amt.de", name: "Auswärtiges Amt",
    canonical_domain: "auswaertiges-amt.de", publisher_type: "ministry",
    evidence_role: "official_primary", trust: "hoch", lifecycle_status: "active",
    entity_id: "ministry-auswaertiges-amt" // WIEDERVERWENDET (seeds/entities.js) — keine zweite Entity
  },
  {
    id: "publisher-bmz.de", name: "Bundesministerium für wirtschaftliche Zusammenarbeit und Entwicklung",
    canonical_domain: "bmz.de", publisher_type: "ministry",
    evidence_role: "official_primary", trust: "hoch", lifecycle_status: "active",
    entity_id: "ministry-bmz"
  },
  {
    id: "publisher-commission.europa.eu", name: "Europäische Kommission",
    canonical_domain: "commission.europa.eu", publisher_type: "government",
    evidence_role: "official_primary", trust: "hoch", lifecycle_status: "active",
    entity_id: "eu-commission"
  },
  {
    id: "publisher-consilium.europa.eu", name: "Rat der EU / Europäischer Rat",
    canonical_domain: "consilium.europa.eu", publisher_type: "government",
    evidence_role: "official_primary", trust: "hoch", lifecycle_status: "active",
    entity_id: "eu-council-of-the-eu" // Primär-Entity; Bündelung mit Europäischem Rat via path_expected_entities
  },
  {
    id: "publisher-europarl.europa.eu", name: "Europäisches Parlament",
    canonical_domain: "europarl.europa.eu", publisher_type: "parliament",
    evidence_role: "official_primary", trust: "hoch", lifecycle_status: "active",
    entity_id: "eu-parliament"
  }
];

// --- Neu benötigte Abrufwege (5) — ALLE needs_review + manual = technisch INAKTIV.
// url = stabile, fachlich bestätigte amtliche Übersichtsseite (method html). Der jeweils
// amtlich dokumentierte RSS/API-Endpunkt steht im Paketmanifest als Aktivierungs-Upgrade
// (rss_hint) — NICHT technisch verdrahtet, weil bytegenau unbestätigt (Auftrag §10).
const NEW_PATHS = [
  {
    id: "rp-aa-newsroom", publisher_id: "publisher-auswaertiges-amt.de", legacy_source_id: null,
    name: "Auswärtiges Amt — Newsroom / Presse", method: "html",
    url: "https://www.auswaertiges-amt.de/de/newsroom/presse", parser: "html-scrape",
    priority: 90, max_items: 16,
    levels: ["bund", "international"],
    topics: ["aussenpolitik", "diplomatie", "internationale-beziehungen", "krisen-und-konflikte", "sanktionen", "humanitaere-hilfe", "internationale-abkommen"],
    entities: ["ministry-auswaertiges-amt"],
    rss_hint: "https://www.auswaertiges-amt.de/de/newsroom/presse/newsletter (AA-RSS-Übersicht, amtlich; exakte Feed-URL vor Aktivierung verifizieren)"
  },
  {
    id: "rp-bmz-aktuelles", publisher_id: "publisher-bmz.de", legacy_source_id: null,
    name: "BMZ — Aktuelle Meldungen", method: "html",
    url: "https://www.bmz.de/de/aktuelles/aktuelle-meldungen", parser: "html-scrape",
    priority: 88, max_items: 16,
    levels: ["bund", "international"],
    topics: ["entwicklungspolitik", "entwicklungszusammenarbeit", "humanitaere-hilfe", "internationale-organisationen"],
    entities: ["ministry-bmz"],
    rss_hint: "https://www.bmz.de/de/service/nl/rss.html (BMZ-RSS-Übersicht, amtlich; exakte Feed-URL vor Aktivierung verifizieren)"
  },
  {
    id: "rp-eu-kommission", publisher_id: "publisher-commission.europa.eu", legacy_source_id: null,
    name: "Europäische Kommission — Press corner", method: "html",
    url: "https://ec.europa.eu/commission/presscorner/home/en", parser: "html-scrape",
    priority: 82, max_items: 16,
    levels: ["eu"],
    topics: ["europapolitik", "eu-gesetzgebung", "eu-aussenpolitik"],
    entities: ["eu-commission"],
    rss_hint: "https://ec.europa.eu/commission/presscorner/api/rss (amtliche Press-corner-RSS-API; Sprach-/Filterparameter vor Aktivierung verifizieren)"
  },
  {
    id: "rp-eu-rat", publisher_id: "publisher-consilium.europa.eu", legacy_source_id: null,
    name: "Rat der EU + Europäischer Rat — Pressemitteilungen (gebündelt)", method: "html",
    url: "https://www.consilium.europa.eu/en/press/press-releases/", parser: "html-scrape",
    priority: 82, max_items: 16,
    levels: ["eu"],
    topics: ["europapolitik", "eu-gesetzgebung", "sanktionen", "eu-aussenpolitik", "gipfel-und-ratsschlussfolgerungen"],
    entities: ["eu-council-of-the-eu", "eu-european-council"], // Bündelung (gemeinsame Domain/Presseraum)
    rss_hint: "https://www.consilium.europa.eu/en/about-site/rss/ (amtliche RSS-Übersicht Rat/Europäischer Rat; exakte Feed-URL vor Aktivierung verifizieren)"
  },
  {
    id: "rp-eu-parlament-oeil", publisher_id: "publisher-europarl.europa.eu", legacy_source_id: null,
    name: "Europäisches Parlament — Legislative Observatory (OEIL)", method: "html",
    url: "https://oeil.secure.europarl.europa.eu/", parser: "html-scrape",
    priority: 76, max_items: 16,
    levels: ["eu"],
    topics: ["europapolitik", "eu-gesetzgebung"],
    entities: ["eu-parliament"],
    rss_hint: "OEIL ist eine Verfahrensdatenbank (kein einfacher RSS-Feed); strukturierter Zugang/Export vor Aktivierung technisch bewerten."
  }
];

// --- Wiederverwendete Abrufwege (NICHT neu angelegt) — nur package_paths-Verknüpfung.
// rp-dip = DIP-API (always_on, healthy); rp-bundesregierung = Bundesregierung (always_on).
// Beide sind bereits global aktiv (bund-basis) -> die Zuordnung erzeugt KEINEN neuen Crawl.
const REUSED_PATH_IDS = Object.freeze(["rp-dip", "rp-bundesregierung"]);

// Referenzierte, aber NICHT neu angelegte Entitäten (nur zur Dokumentation/zum Test).
const REUSED_ENTITY_IDS = Object.freeze([
  "ministry-auswaertiges-amt", "parliament-bundestag", "government-bund", "parliament-bundesrat",
  "committee-bt-auswaertiges", "committee-bt-europa", "committee-bt-entwicklung", "committee-bt-menschenrechte"
]);

function buildAussenEuropaEntwicklungSeed() {
  const entities = NEW_ENTITIES.map((e) => ({ ...e, prepared: true }));
  const publishers = NEW_PUBLISHERS.map((p) => ({ ...p, prepared: true }));

  const retrievalPaths = NEW_PATHS.map((p) => ({
    id: p.id,
    publisher_id: p.publisher_id,
    legacy_source_id: p.legacy_source_id,
    name: p.name,
    method: p.method,
    url: p.url,
    query: null,                 // reine HTML-Übersichtsseiten, keine Suchdefinition
    parser: p.parser,
    priority: p.priority,
    status: "needs_review",      // VORBEREITET — nie healthy/broken
    activation_mode: "manual",   // VORBEREITET — nie auto/always_on -> kein Auto-Crawl
    is_critical: false,          // Kandidat vor Verifikation — nicht als kritische Systemquelle markiert
    max_items: p.max_items,
    prepared: true,
    rss_hint: p.rss_hint
  }));

  // package_paths: neue Wege + wiederverwendete Wege -> alle in das neue Paket.
  const packagePaths = [
    ...retrievalPaths.map((p) => ({ package_id: PACKAGE.id, retrieval_path_id: p.id, reused: false })),
    ...REUSED_PATH_IDS.map((id) => ({ package_id: PACKAGE.id, retrieval_path_id: id, reused: true }))
  ];

  // Erwartete Dimensionen NUR für die neuen Wege (die wiederverwendeten behalten ihre
  // bestehenden Satelliten-Daten unverändert — es werden keine fremden path_expected_* berührt).
  const pathExpectedLevels = [];
  const pathExpectedGeographies = [];
  const pathExpectedTopics = [];
  const pathExpectedEntities = [];
  for (const p of NEW_PATHS) {
    for (const lvl of p.levels) pathExpectedLevels.push({ retrieval_path_id: p.id, level: lvl });
    // Deutscher Handlungsbezug: geo-bund für alle Wege (Fachthema Bund).
    pathExpectedGeographies.push({ retrieval_path_id: p.id, geography_id: "geo-bund" });
    for (const t of p.topics) pathExpectedTopics.push({ retrieval_path_id: p.id, topic: t });
    for (const e of p.entities) pathExpectedEntities.push({ retrieval_path_id: p.id, entity_id: e });
  }

  const reusedPackagePaths = packagePaths.filter((pp) => pp.reused);
  return {
    package: PACKAGE,
    entities,
    publishers,
    retrievalPaths,
    packagePaths,
    reusedPathIds: [...REUSED_PATH_IDS],
    reusedEntityIds: [...REUSED_ENTITY_IDS],
    pathExpectedLevels,
    pathExpectedGeographies,
    pathExpectedTopics,
    pathExpectedEntities,
    summary: {
      status: "prepared",
      neuePublisher: publishers.length,
      neueEntitaeten: entities.length,
      neueAbrufwege: retrievalPaths.length,
      wiederverwendeteAbrufwege: REUSED_PATH_IDS.length,
      abrufwegeGesamtImPaket: retrievalPaths.length + REUSED_PATH_IDS.length,
      paketzuordnungen: packagePaths.length,
      reusedPaketzuordnungen: reusedPackagePaths.length,
      // technisch inaktiv: kein NEUER Weg ist aktiv/auto/always_on/healthy
      aktiveNeueAbrufwege: retrievalPaths.filter(
        (p) => p.status === "healthy" || p.activation_mode === "auto" || p.activation_mode === "always_on"
      ).length
    }
  };
}

module.exports = {
  buildAussenEuropaEntwicklungSeed,
  PACKAGE, NEW_ENTITIES, NEW_PUBLISHERS, NEW_PATHS, REUSED_PATH_IDS, REUSED_ENTITY_IDS
};
