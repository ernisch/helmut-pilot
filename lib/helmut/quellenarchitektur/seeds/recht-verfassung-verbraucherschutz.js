"use strict";

// Helmut — Quellenarchitektur · PREPARED-Paket "recht-verfassung-und-verbraucherschutz-bund".
//
// REINE, DETERMINISTISCHE LOGIK. Kein Netz, keine KI, kein Storage-Write, KEIN Rendering.
// Formt die technisch/fachlich geprueften Quellen der rechts- und verbraucherpolitischen
// Bundesebene in das relationale Modell (political_entities / publishers / retrieval_paths /
// source_packages / package_paths / path_expected_*) — ausschliesslich als VORBEREITET:
//
//   - Paket status "prepared", is_base false -> computeGlobalActivation aktiviert es NICHT.
//   - NEUE retrieval_paths: status "needs_review", activation_mode "manual", is_critical false
//     -> werden nie automatisch aktiviert/gecrawlt (Auftrag §11).
//   - WIEDERVERWENDETE Wege (rp-dip, rp-bundesregierung) werden NUR ueber package_paths
//     verknuepft und NICHT veraendert/dupliziert (Auftrag §7/§11).
//
// FACHLICHE KORREKTUREN (verbindlich, Auftrag §3):
//   K1 BMJV-Historie: die aktuelle Institution ist "Bundesministerium der Justiz und fuer
//      Verbraucherschutz" (BMJV). Historische Namen (BMJ / Bundesministerium der Justiz)
//      stehen NUR als Alias zur Wiedererkennung — keine zweite Ministeriums-Entity.
//   K2 Institutionen statt Amtsinhaber: keine Personen (weder BfDI-Amtsinhaberin noch
//      Nachfolger, kein Personenwechsel als Strukturmerkmal).
//   K3 BfDI buendelt Datenschutz + Informationsfreiheit + PM + Stellungnahmen +
//      Taetigkeitsberichte + Gesetzgebungsbegleitung in EINEM Weg (kein IFG-Sonderpfad,
//      keine Berichtsjahre hardcoden).
//   K4 Bundesamt fuer Justiz: NICHT aufgenommen -> Future Target (operative Registerflut,
//      4-jaehrlicher Bericht -> kein enger, regelmaessig signalstarker Weg).
//   K5 EGMR (falls Future Target): Europarat, nicht EU.
//   K6 BVerfG buendelt Pressemitteilungen (+ Termine/muendliche Verhandlungen/Jahresberichte);
//      KEINE Volltext-Entscheidungsdatenbank, kein Urteils-Massenabruf.
//   K7 Keine aktuellen Vorhaben/Amtsinhaber/Drucksachennummern/Jahreszahlen in der Architektur.
//
// Ziel: kompakte Architektur mit 7 Retrieval Paths (5 neu + 2 wiederverwendet).

const PACKAGE = Object.freeze({
  id: "pkg-recht-verfassung-und-verbraucherschutz-bund",
  key: "recht-verfassung-und-verbraucherschutz-bund",
  name: "Recht, Verfassung und Verbraucherschutz (Bund)",
  purpose:
    "Rechts-, verfassungs- und verbraucherpolitische Bundesebene: BMJV (Recht/Justiz/Gesetzgebung " +
    "und Verbraucherpolitik), Bundesverfassungsgericht (Pressemitteilungen), BfDI (Datenschutz + " +
    "Informationsfreiheit), Ausschuss fuer Recht und Verbraucherschutz sowie die wiederverwendeten " +
    "Bundeswege DIP und Bundesregierung. Kompaktes Signal-Paket, kein Flaechenmonitoring. " +
    "Struktur vorbereitet — Aktivierung freigabepflichtig.",
  status: "prepared",
  is_base: false,
  political_level: "bund",
  geography_id: "geo-bund",
  required_classes: []
});

// --- NEUE politische Entitaeten (Institutionen, keine Personen — K1/K2) ------
// Vorhandene Entitaeten werden wiederverwendet und hier NICHT dupliziert:
//   committee-bt-recht (Ausschuss), parliament-bundestag (DIP/Bundestag),
//   government-bund (Bundesregierung).
const NEUE_ENTITAETEN = [
  {
    id: "ministry-bmjv",
    entity_type: "ministry",
    name: "Bundesministerium der Justiz und für Verbraucherschutz",
    canonical_key: null,
    level: "bund",
    geography_id: "geo-bund",
    // K1: aktuelle Institution; historische Namen NUR als Alias (BMJ / Bundesministerium der Justiz).
    aliases: ["BMJV", "Bundesministerium der Justiz", "BMJ"]
  },
  {
    id: "institution-bverfg",
    // entity_type-Enum kennt keinen "court" -> other_institution (Verfassungsorgan).
    entity_type: "other_institution",
    name: "Bundesverfassungsgericht",
    canonical_key: null,
    level: "bund",
    geography_id: "geo-bund",
    aliases: ["BVerfG"]
  },
  {
    id: "authority-bfdi",
    entity_type: "authority",
    // K2: Institution, KEINE Amtsinhaberin/kein Nachfolger.
    name: "Bundesbeauftragte für den Datenschutz und die Informationsfreiheit",
    canonical_key: null,
    level: "bund",
    geography_id: "geo-bund",
    aliases: ["BfDI"]
  }
];

// --- NEUE Herausgeber (je Domain genau einer — Auftrag §7.1) -----------------
// Wiederverwendete Herausgeber (NICHT neu angelegt): publisher-bundestag.de (Ausschuss),
// publisher-dip.bundestag.de (DIP), publisher-bundesregierung.de (Bundesregierung).
const NEUE_HERAUSGEBER = [
  {
    id: "publisher-bmjv.de", name: "Bundesministerium der Justiz und für Verbraucherschutz",
    canonical_domain: "bmjv.de", publisher_type: "ministry", evidence_role: "official_primary",
    trust: "hoch", lifecycle_status: "active", entity_id: "ministry-bmjv"
  },
  {
    id: "publisher-bundesverfassungsgericht.de", name: "Bundesverfassungsgericht",
    canonical_domain: "bundesverfassungsgericht.de", publisher_type: "authority",
    evidence_role: "official_primary", trust: "hoch", lifecycle_status: "active",
    entity_id: "institution-bverfg"
  },
  {
    id: "publisher-bfdi.bund.de", name: "Bundesbeauftragte für den Datenschutz und die Informationsfreiheit",
    canonical_domain: "bfdi.bund.de", publisher_type: "authority", evidence_role: "official_primary",
    trust: "hoch", lifecycle_status: "active", entity_id: "authority-bfdi"
  }
];

// --- NEUE Abrufwege (5) — alle needs_review + manual + is_critical false ------
// URLs sind gegen die offiziellen Einstiegsseiten verifiziert (siehe Doku §technische
// Verifikationspunkte). Keine erfundenen URLs/Feeds/APIs. BfDI hat einen verifizierten
// offiziellen RSS-Newsfeed; die uebrigen amtlichen Seiten sind stabile HTML-Listen.
const NEUE_ABRUFWEGE = [
  {
    id: "rp-bmjv-recht", publisher_id: "publisher-bmjv.de",
    name: "BMJV — Recht, Justiz und Gesetzgebung",
    method: "html", url: "https://www.bmjv.de/DE/service/gesetzgebung/gesetzgebungsverfahren/gesetzgebungsverfahren_node.html",
    query: null, parser: "html-scrape", priority: 90, max_items: 16,
    expected_entity_id: "ministry-bmjv"
  },
  {
    id: "rp-bmjv-verbraucher", publisher_id: "publisher-bmjv.de",
    name: "BMJV — Verbraucherpolitik",
    method: "html", url: "https://www.bmjv.de/DE/Ministerium/Abteilungen/Verbraucherpolitik/Verbraucherpolitik_node.html",
    query: null, parser: "html-scrape", priority: 88, max_items: 16,
    expected_entity_id: "ministry-bmjv"
  },
  {
    id: "rp-bverfg-presse", publisher_id: "publisher-bundesverfassungsgericht.de",
    name: "Bundesverfassungsgericht — Pressemitteilungen",
    // K6: Pressemitteilungen als selektive, signalstarke Quelle; KEINE Volltextdatenbank.
    method: "html", url: "https://www.bundesverfassungsgericht.de/DE/Presse/presse_node.html",
    query: null, parser: "html-scrape", priority: 90, max_items: 16,
    expected_entity_id: "institution-bverfg"
  },
  {
    id: "rp-bfdi", publisher_id: "publisher-bfdi.bund.de",
    name: "BfDI — Datenschutz und Informationsfreiheit",
    // K3: EIN gebuendelter Weg (PM/Kurzmeldungen/Stellungnahmen/Taetigkeitsberichte) ueber den
    // offiziellen RSS-Newsfeed; kein separater IFG-/Berichtspfad.
    method: "rss", url: "https://www.bfdi.bund.de/SiteGlobals/Functions/RSSFeed/Allgemein/rssnewsfeed.xml?nn=253102",
    query: null, parser: "rss-regex", priority: 88, max_items: 16,
    expected_entity_id: "authority-bfdi"
  },
  {
    id: "rp-ausschuss-recht-verbraucherschutz", publisher_id: "publisher-bundestag.de",
    name: "Ausschuss für Recht und Verbraucherschutz",
    // Eigener Weg fuer Anhoerungen/Tagesordnungen/Stellungnahmen (Auftrag §9); Drucksachen
    // deckt DIP ab -> kein paralleler Drucksachenweg. Offizielle Kurz-URL bundestag.de/recht.
    method: "html", url: "https://www.bundestag.de/recht",
    query: null, parser: "html-scrape", priority: 90, max_items: 16,
    expected_entity_id: "committee-bt-recht" // wiederverwendete Ausschuss-Entity
  }
];

// --- WIEDERVERWENDETE Wege (nur ueber package_paths verknuepfen, NICHT veraendern) ---
// rp-dip: DIP-API (Bundestag/Bundesrat, Drucksachen/Vorgaenge) — global always_on.
// rp-bundesregierung: Bundesregierung-RSS — global always_on.
// Der Google-News-Rechtsthemenweg rp-committee-recht liegt bereits global in bund-basis und
// wird bewusst NICHT zusaetzlich hier verknuepft (keine Dublette; er liefert Themen-Rauschen,
// nicht die amtlichen Ausschuss-Anhoerungen, fuer die rp-ausschuss-recht-verbraucherschutz steht).
const WIEDERVERWENDETE_WEGE = ["rp-dip", "rp-bundesregierung"];

function buildRechtVerfassungVerbraucherschutzSeed() {
  const packagePaths = [];
  const pathExpectedLevels = [];
  const pathExpectedGeographies = [];
  const pathExpectedEntities = [];

  for (const p of NEUE_ABRUFWEGE) {
    packagePaths.push({ package_id: PACKAGE.id, retrieval_path_id: p.id });
    pathExpectedLevels.push({ retrieval_path_id: p.id, level: "bund" });
    pathExpectedGeographies.push({ retrieval_path_id: p.id, geography_id: "geo-bund" });
    if (p.expected_entity_id) {
      pathExpectedEntities.push({ retrieval_path_id: p.id, entity_id: p.expected_entity_id });
    }
  }
  // Wiederverwendete Wege: NUR Paketverknuepfung (keine path_expected_*-Zeilen — die Wege
  // bleiben unveraendert global definiert).
  for (const rpId of WIEDERVERWENDETE_WEGE) {
    packagePaths.push({ package_id: PACKAGE.id, retrieval_path_id: rpId });
  }

  const retrievalPaths = NEUE_ABRUFWEGE.map((p) => ({
    id: p.id,
    publisher_id: p.publisher_id,
    legacy_source_id: null,
    name: p.name,
    method: p.method,
    url: p.url,
    query: p.query,
    parser: p.parser,
    priority: p.priority,
    status: "needs_review",     // VORBEREITET — nie healthy/active
    activation_mode: "manual",  // VORBEREITET — nie auto/always_on -> kein Auto-Crawl
    is_critical: false,         // Auftrag §11: alle neuen Wege is_critical=false
    max_items: p.max_items
  }));

  return {
    package: PACKAGE,
    entities: NEUE_ENTITAETEN,
    publishers: NEUE_HERAUSGEBER,
    retrievalPaths,
    reusedPaths: [...WIEDERVERWENDETE_WEGE],
    packagePaths,
    pathExpectedLevels,
    pathExpectedGeographies,
    pathExpectedEntities,
    summary: {
      status: "prepared",
      neueEntitaeten: NEUE_ENTITAETEN.length,
      neueHerausgeber: NEUE_HERAUSGEBER.length,
      neueAbrufwege: retrievalPaths.length,
      wiederverwendeteWege: WIEDERVERWENDETE_WEGE.length,
      retrievalPathsGesamt: retrievalPaths.length + WIEDERVERWENDETE_WEGE.length,
      paketzuordnungen: packagePaths.length,
      // technisch inaktiv: KEIN neuer Weg ist aktiv/auto/always_on/kritisch
      aktiveNeueAbrufwege: retrievalPaths.filter(
        (p) => p.status !== "needs_review" || p.activation_mode !== "manual"
      ).length,
      kritischeNeueAbrufwege: retrievalPaths.filter((p) => p.is_critical).length
    }
  };
}

module.exports = {
  buildRechtVerfassungVerbraucherschutzSeed,
  PACKAGE,
  NEUE_ENTITAETEN,
  NEUE_HERAUSGEBER,
  NEUE_ABRUFWEGE,
  WIEDERVERWENDETE_WEGE
};
