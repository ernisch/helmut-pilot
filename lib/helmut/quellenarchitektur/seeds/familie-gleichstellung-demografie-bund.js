"use strict";

// Helmut — Quellenarchitektur · VORBEREITUNG (prepared, INAKTIV) des Bundes-Fachthemenpakets
// `familie-gleichstellung-demografie-bund`.
//
// REINE, DETERMINISTISCHE LOGIK. Kein Netz, keine KI, kein Storage-Write, KEIN Rendering.
// Formt die fachlich/amtlich geprüften Kandidaten in das relationale Modell
// (source_packages / publishers / retrieval_paths / package_paths / path_expected_*) —
// ausschliesslich als VORBEREITET / vollständig INAKTIV:
//   - source_packages: status "prepared", is_base false, KEINE Profilzuordnung, KEIN
//     required_classes-Zwang (Fachthema, kein Landesmodul).
//   - retrieval_paths: status "needs_review" (NICHT healthy/active), activation_mode "manual"
//     (NICHT auto/always_on) -> werden nie automatisch aktiviert/gecrawlt.
//   - computeGlobalActivation aktiviert weder das prepared-Paket noch die manual-Wege
//     (belegt im paketbezogenen Test).
// Das Anwenden auf Production (DB-Insert) bleibt ein eigener, ausdrücklich freigabepflichtiger
// Schritt. Dieses Modul erzeugt NUR das In-Memory-Abbild + eine anwendbare Seed-Struktur.
//
// WIEDERVERWENDUNG STATT DUBLETTE (Auftrag §10/§17/§18):
//   - Herausgeber Destatis (publisher-destatis.de) wird WIEDERVERWENDET (2 neue thematische
//     Abrufwege am bestehenden Herausgeber; KEINE zweite Destatis-Entität/Domain).
//   - Der DIP-Weg (rp-dip, always_on in pkg-bund-basis) wird als PARLAMENTARISCHER Weg
//     WIEDERVERWENDET (additive package_paths-Verknüpfung; KEIN paralleler DIP-/Ausschuss-/
//     Bundesrat-Weg). Bundestagsausschuss + Bundesrat sind über DIP + Bund-Basis abgedeckt.
//   - Die politische Entität ministry-bmfsfj (Bestand) wird WIEDERVERWENDET; es wird KEINE
//     zweite Ministeriums-Entität angelegt (keine BMBFSFJ/BMFSFJ-Dublette). Der neue
//     Herausgeber trägt den AKTUELLEN amtlichen Namen (bmbfsfj.bund.de).
//
// KEINE Person in stabiler ID: ADS/UBSKM sind INSTITUTIONEN (Ämter), keine Amtsinhaber.
// KEINE Publikation als Herausgeber: die vier Regierungsberichte werden über EINEN
// gebündelten BMBFSFJ-Weg ("Berichte der Bundesregierung") abgedeckt, nicht als je eigene
// Herausgeber/Entitäten.

const PACKAGE = Object.freeze({
  id: "pkg-familie-gleichstellung-demografie-bund",
  key: "familie-gleichstellung-demografie-bund",
  name: "Familie, Gleichstellung und Demografie Bund",
  purpose:
    "Fachthemenpaket Familien-, Gleichstellungs-, Senioren-, Jugend- und Demografiepolitik des Bundes " +
    "(Regierungsberichte gebündelt, amtliche Statistik, Antidiskriminierung, Kinderschutz). Fachthema, NICHT Region. " +
    "Struktur vorbereitet — vollständig INAKTIV; Quellen vor Aktivierung byte-genau zu prüfen.",
  status: "prepared",
  is_base: false,
  political_level: "bund",
  geography_id: "geo-bund",
  required_classes: []
});

// --- Neue politische Entitäten (nur solche, die NICHT bereits in seeds/entities.js stehen) ---
// Wiederverwendet (KEIN neuer Eintrag): ministry-bmfsfj, statoffice-destatis, parliament-bundestag.
// ADS und UBSKM sind eigenständige, gesetzlich verankerte Bundesinstitutionen (Ämter) — modelliert
// wird die INSTITUTION, nie der/die Amtsinhaber:in.
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
  }
];

// --- Herausgeber-Metadaten je Domain (Name kanonisch + Typ + verknüpfte Entität) ---
// `reused: true` => Bestandsherausgeber, wird NICHT neu angelegt (nur referenziert). Die
// canonical_domain ist DB-UNIQUE — ein zweiter Publisher auf eine Bestands-Domain würde den
// Insert brechen; deshalb werden Bestands-Domains ausschliesslich referenziert.
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
  // Bestandsherausgeber — WIEDERVERWENDET (kein neuer Publisher-Insert):
  "destatis.de": { id: "publisher-destatis.de", reused: true }
};

// --- Abrufweg-Spezifikation (alle NEUEN Wege; DIP wird separat als Bestand referenziert) ---
// tier: fachliche Priorisierung (1 = dauerhaft unverzichtbar, 2 = regelmäßiger Bericht/Statistik/
// Monitoring). method/parser sind DB-CHECK-konform. Alle Wege: status needs_review, mode manual.
const PATHS = [
  {
    id: "rp-fgd-bmbfsfj-vorhaben",
    legacy_source_id: "fgd-bmbfsfj-vorhaben",
    domain: "bmbfsfj.bund.de",
    name: "BMBFSFJ — Politische Vorhaben, Gesetzgebung & zentrale Veröffentlichungen",
    method: "googlenews_search",
    gnews: "site:bmbfsfj.bund.de (Gesetzentwurf OR Reform OR Kabinett OR Strategie OR Familie OR Gleichstellung OR Jugend OR Senioren)",
    priority: 88,
    max_items: 16,
    tier: 1,
    topics: ["familie", "gleichstellung", "jugend", "senioren", "gesetzgebung"]
  },
  {
    id: "rp-fgd-bmbfsfj-berichte",
    legacy_source_id: "fgd-bmbfsfj-berichte",
    domain: "bmbfsfj.bund.de",
    name: "BMBFSFJ — Berichte der Bundesregierung (Familien-, Kinder- und Jugend-, Gleichstellungs-, Altersbericht)",
    method: "html",
    url: "https://www.bmbfsfj.bund.de/bmbfsfj/ministerium/berichte-der-bundesregierung",
    parser: "html-scrape",
    priority: 82,
    max_items: 16,
    tier: 2,
    // EIN gebündelter Weg über die stabile Übersichtsseite deckt alle vier Sachverständigen-
    // berichte ab (Auftrag §8) — statt vier getrennter Jahres-PDF-Wege/Publisher.
    topics: ["familienbericht", "kinder-und-jugendbericht", "gleichstellungsbericht", "altersbericht", "berichte-der-bundesregierung"]
  },
  {
    id: "rp-fgd-destatis-bevoelkerung-demografie",
    legacy_source_id: "fgd-destatis-bevoelkerung-demografie",
    domain: "destatis.de",
    name: "Destatis — Bevölkerung, Familien & Demografie",
    method: "googlenews_search",
    gnews: "site:destatis.de (Geburten OR Bevölkerung OR Bevölkerungsvorausberechnung OR Haushalte OR Familien OR Eheschließungen OR Sterbefälle OR Altersstruktur)",
    priority: 84,
    max_items: 12,
    tier: 1,
    topics: ["bevoelkerung", "demografie", "familie", "geburten", "haushalte"]
  },
  {
    id: "rp-fgd-destatis-gleichstellung",
    legacy_source_id: "fgd-destatis-gleichstellung",
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
    id: "rp-fgd-ads-jahresbericht",
    legacy_source_id: "fgd-ads-jahresbericht",
    domain: "antidiskriminierungsstelle.de",
    name: "Antidiskriminierungsstelle des Bundes — Jahresbericht & Publikationen",
    method: "googlenews_search",
    gnews: "site:antidiskriminierungsstelle.de (Jahresbericht OR Diskriminierung OR Stellungnahme OR AGG)",
    priority: 74,
    max_items: 10,
    tier: 2,
    topics: ["antidiskriminierung", "gleichstellung", "agg", "jahresbericht"]
  },
  {
    id: "rp-fgd-ubskm-kinderschutz",
    legacy_source_id: "fgd-ubskm-kinderschutz",
    domain: "beauftragte-missbrauch.de",
    name: "UBSKM — Kinderschutz, Missbrauchsaufarbeitung & Monitoring",
    method: "googlenews_search",
    gnews: "site:beauftragte-missbrauch.de (Kinderschutz OR Missbrauch OR Bericht OR Studie OR Aufarbeitung OR Prävention)",
    priority: 76,
    max_items: 10,
    tier: 2,
    topics: ["kinderschutz", "missbrauch", "aufarbeitung", "praevention"]
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
      // technisch inaktiv: kein NEUER Abrufweg ist aktiv/auto/always_on/healthy
      aktiveNeueAbrufwege: retrievalPathsOut.filter(
        (p) => p.status === "healthy" || p.activation_mode === "auto" || p.activation_mode === "always_on"
      ).length
    }
  };
}

module.exports = { buildSeed, PACKAGE, NEUE_ENTITAETEN, PUBLISHER_META, PATHS, REUSED_PATH_IDS, gnewsUrl };
