"use strict";

// Helmut — Quellenarchitektur · PREPARED-Datenmodell für das Bundes-Fachpaket
//   "landwirtschaft-ernaehrung-und-laendliche-raeume-bund"
//
// REINE DATEN (kein DB-Zugriff, kein Netz). Grundlage für den generierten,
// idempotenten PREPARED-Seed (scripts/generate-agrar-bund-seed.js). Analog zum
// Landesmodul-Muster (seeds/landesmodule-quellen.js): additiv, technisch INAKTIV,
// FREIGABEPFLICHTIG.
//
// SICHERHEITSINVARIANTEN (im Generator hart gesetzt):
//   - alle NEUEN Abrufwege: status='needs_review', activation_mode='manual' -> INAKTIV.
//   - Paket: status='prepared', is_base=false -> kein Auto-Crawl, kein Profil-Mapping.
//   - Bestehende Herausgeber/Entitäten/Wege werden WIEDERVERWENDET, nie dupliziert:
//       * Destatis  -> publisher 'publisher-destatis.de' + Entität 'statoffice-destatis' (Bestand)
//       * DIP       -> Abrufweg 'rp-dip' (Bestand, bund-basis) nur additiv verknüpft
//       * Ausschuss -> Abrufweg 'rp-committee-landwirtschaft' (Bestand, bund-basis) nur additiv verknüpft
//   - BZL / BZfE / DVS sind Organisationseinheiten der BLE (amtlich bestätigt) und
//     erhalten KEINEN eigenen Herausgeber/Weg.
//   - Historische Ministeriumsbezeichnung (BMEL) nur als Alias, keine zweite Entität.
//
// Methodenwahl: googlenews_search mit site:-Filter — das im Repo etablierte, bot-sichere
// Hausmuster für deutsche Behördenquellen (134 von 144 Bestandswegen nutzen es; direkter
// HTML/RSS-Abruf der Behördenseiten ist real bot-gesperrt, siehe Paketdoku §technische Prüfung).

const PACKAGE = {
  id: "pkg-landwirtschaft-ernaehrung-und-laendliche-raeume-bund",
  key: "landwirtschaft-ernaehrung-und-laendliche-raeume-bund",
  name: "Landwirtschaft, Ernährung und ländliche Räume (Bund)",
  purpose:
    "Fachthemenpaket Bundes-Agrar-, Ernährungs- und Ländliche-Räume-Politik (BMLEH-Ressort): " +
    "Gesetzgebung/Verordnungen, politische Veröffentlichungen, GAP-Agrarförderung, GAK und ländliche Räume, " +
    "Agrarstatistik (Destatis), BLE-Publikationen, BVL-Monitoring, parlamentarische Vorgänge (DIP/Ausschuss). " +
    "Fachthema Bund, NICHT Region. Struktur vorbereitet — Quellen technisch inaktiv bis Prüfung + Freigabe.",
  status: "prepared",
  is_base: false,
  political_level: "bund",
  geography_id: "geo-bund",
  required_classes: []
};

// --- NEUE politische Entitäten (3) — Ministerium + zwei Bundesoberbehörden -----
// canonical_key = null (konsistent mit den Bestands-Ministerien/-Behörden in seeds/entities.js).
// Aktueller Name im name-Feld; historische/kurze Formen ausschließlich als Alias (Auftrag §7).
const ENTITIES = [
  {
    id: "ministry-bmleh",
    entity_type: "ministry",
    name: "Bundesministerium für Landwirtschaft, Ernährung und Heimat",
    canonical_key: null,
    level: "bund",
    geography_id: "geo-bund",
    aliases: ["BMLEH", "BMEL", "Bundesministerium für Ernährung und Landwirtschaft"]
  },
  {
    id: "authority-ble",
    entity_type: "authority",
    name: "Bundesanstalt für Landwirtschaft und Ernährung",
    canonical_key: null,
    level: "bund",
    geography_id: "geo-bund",
    aliases: ["BLE"]
  },
  {
    id: "authority-bvl",
    entity_type: "authority",
    name: "Bundesamt für Verbraucherschutz und Lebensmittelsicherheit",
    canonical_key: null,
    level: "bund",
    geography_id: "geo-bund",
    aliases: ["BVL"]
  }
];

// --- NEUE Herausgeber (3) — je eindeutige Domain (Dedup-Schlüssel) --------------
const PUBLISHERS = [
  {
    id: "publisher-bmleh.de",
    name: "Bundesministerium für Landwirtschaft, Ernährung und Heimat",
    canonical_domain: "bmleh.de",
    publisher_type: "ministry",
    evidence_role: "official_primary",
    trust: "hoch",
    lifecycle_status: "active",
    entity_id: "ministry-bmleh"
  },
  {
    id: "publisher-ble.de",
    name: "Bundesanstalt für Landwirtschaft und Ernährung",
    canonical_domain: "ble.de",
    publisher_type: "authority",
    evidence_role: "official_primary",
    trust: "hoch",
    lifecycle_status: "active",
    entity_id: "authority-ble"
  },
  {
    id: "publisher-bvl.bund.de",
    name: "Bundesamt für Verbraucherschutz und Lebensmittelsicherheit",
    canonical_domain: "bvl.bund.de",
    publisher_type: "authority",
    evidence_role: "official_primary",
    trust: "hoch",
    lifecycle_status: "active",
    entity_id: "authority-bvl"
  }
];

// Bestehende Herausgeber, die wiederverwendet werden (NICHT neu anlegen).
// publisher-destatis.de wird vom neuen Agrarstatistik-Weg referenziert.
const REUSED_PUBLISHER_IDS = ["publisher-destatis.de"];

// --- NEUE Abrufwege (7) — alle googlenews_search, needs_review + manual ---------
// tier dient nur der Doku/Priorisierung; DB-seitig zählt Status+Aktivierungsmodus.
const NEW_PATHS = [
  {
    id: "rp-agrar-bmleh-gesetzgebung",
    publisher_id: "publisher-bmleh.de",
    legacy_source_id: "agrar-bmleh-gesetzgebung",
    name: "BMLEH — Gesetzgebung und politische Vorhaben",
    query: 'site:bmleh.de (Gesetzentwurf OR Referentenentwurf OR Verordnung OR Kabinett OR Eckpunkte OR Gesetz)',
    represents_type: "ministry",
    priority: 70,
    tier: 1,
    topics: ["agrarpolitik", "gesetzgebung", "tierhaltung", "ernaehrungspolitik"]
  },
  {
    id: "rp-agrar-bmleh-veroeffentlichungen",
    publisher_id: "publisher-bmleh.de",
    legacy_source_id: "agrar-bmleh-veroeffentlichungen",
    name: "BMLEH — zentrale Veröffentlichungen und politische Entscheidungen",
    query: 'site:bmleh.de (Pressemitteilung OR Strategie OR Bericht OR Tierschutz OR Tierhaltung OR Ernährung OR Waldzustand)',
    represents_type: "ministry",
    priority: 70,
    tier: 1,
    topics: ["agrarpolitik", "tierschutz", "ernaehrungspolitik", "wald", "strategie"]
  },
  {
    id: "rp-agrar-bmleh-gap",
    publisher_id: "publisher-bmleh.de",
    legacy_source_id: "agrar-bmleh-gap",
    name: "BMLEH — GAP und Agrarförderung",
    query: 'site:bmleh.de (GAP OR "Gemeinsame Agrarpolitik" OR GAP-Strategieplan OR Agrarförderung OR Direktzahlungen OR "Öko-Regelungen")',
    represents_type: "ministry",
    priority: 70,
    tier: 1,
    topics: ["gap", "agrarfoerderung", "eu-agrarpolitik", "direktzahlungen"]
  },
  {
    id: "rp-agrar-bmleh-gak-laendliche-raeume",
    publisher_id: "publisher-bmleh.de",
    legacy_source_id: "agrar-bmleh-gak-laendliche-raeume",
    name: "BMLEH — GAK und ländliche Räume",
    query: 'site:bmleh.de (GAK OR "ländliche Räume" OR Agrarstruktur OR Küstenschutz OR Dorfentwicklung OR Regionalförderung)',
    represents_type: "ministry",
    priority: 70,
    tier: 1,
    topics: ["gak", "laendliche_raeume", "agrarstruktur", "kuestenschutz"]
  },
  {
    // Destatis: HERAUSGEBER + ENTITÄT werden wiederverwendet, nur dieser Agrar-Weg ist neu.
    id: "rp-agrar-destatis-agrarstatistik",
    publisher_id: "publisher-destatis.de",
    legacy_source_id: "agrar-destatis-agrarstatistik",
    name: "Destatis — Agrarstatistiken (Betriebe, Flächen, Tierbestände, Ökolandbau, Forst, Fischerei)",
    query: 'site:destatis.de (Landwirtschaft OR Agrarstruktur OR "landwirtschaftliche Betriebe" OR Tierbestände OR Flächennutzung OR Ernte OR "ökologischer Landbau" OR Forstwirtschaft OR Fischerei)',
    represents_type: null,
    priority: 70,
    tier: 1,
    topics: ["agrarstatistik", "landwirtschaft", "tierbestaende", "flaechennutzung", "oekolandbau"]
  },
  {
    id: "rp-agrar-ble-publikationen",
    publisher_id: "publisher-ble.de",
    legacy_source_id: "agrar-ble-publikationen",
    name: "BLE — Publikationen (Statistisches Jahrbuch, Versorgung, Ernte, Ökolandbau)",
    query: 'site:ble.de (Publikation OR Jahrbuch OR Versorgungsbilanz OR Ernte OR Ökolandbau OR Marktbericht OR Förderung)',
    represents_type: "authority",
    priority: 60,
    tier: 2,
    topics: ["agrarmarkt", "ernaehrung", "oekolandbau", "laendliche_raeume"]
  },
  {
    id: "rp-agrar-bvl-monitoring",
    publisher_id: "publisher-bvl.bund.de",
    legacy_source_id: "agrar-bvl-monitoring",
    name: "BVL — Monitoring (Lebensmittel, Zoonosen, Antibiotika, Rückstände)",
    query: 'site:bvl.bund.de (Monitoring OR Zoonosen OR Antibiotika OR Rückstände OR Berichterstattung OR Lebensmittel)',
    represents_type: "authority",
    priority: 60,
    tier: 2,
    topics: ["lebensmittelsicherheit", "monitoring", "zoonosen", "antibiotika"]
  }
];

// --- WIEDERVERWENDETE Bestands-Abrufwege (nur additive Paketverknüpfung) --------
// Werden NICHT in retrieval_paths eingefügt (existieren im Basis-Seed / bund-basis),
// sondern ausschließlich via package_paths dem neuen Paket zugeordnet.
const REUSED_PATHS = [
  { id: "rp-dip", tier: 1, note: "DIP-API (Bundestag+Bundesrat): Gesetzentwürfe, Anträge, Anfragen, Unterrichtungen, Berichte, Ausschussvorgänge." },
  { id: "rp-committee-landwirtschaft", tier: 1, note: "Ausschuss-/Agrar-Politiksignal (Bestand bund-basis)." }
];

// Zukünftige Ziele (bewusst NICHT im Paket) — für die Doku, nie geseedet.
const FUTURE_TARGETS = [
  { name: "Thünen-Institut (thuenen.de)", grund: "Bundesforschungsinstitut ländliche Räume/Wald/Fischerei; Waldzustandserhebung 2025 wird über den BMLEH-Veröffentlichungsweg mit erfasst. Top-Kandidat für spätere Promotion (Tier 2)." },
  { name: "BfR (bfr.bund.de)", grund: "Risikobewertung/Stellungnahmen; für ein kleines Paket zunächst Future Target (Auftrag §14)." },
  { name: "JKI / FLI / MRI", grund: "Überwiegend wissenschaftlich-operativ; kein ausreichender eigenständiger politischer Signalwert (Auftrag §15)." }
];

function build() {
  const packagePaths = [
    ...NEW_PATHS.map((p) => ({ package_id: PACKAGE.id, retrieval_path_id: p.id })),
    ...REUSED_PATHS.map((p) => ({ package_id: PACKAGE.id, retrieval_path_id: p.id }))
  ];
  const pathExpectedLevels = NEW_PATHS.map((p) => ({ retrieval_path_id: p.id, level: "bund" }));
  const pathExpectedGeographies = NEW_PATHS.map((p) => ({ retrieval_path_id: p.id, geography_id: "geo-bund" }));
  const pathExpectedTopics = NEW_PATHS.flatMap((p) => p.topics.map((t) => ({ retrieval_path_id: p.id, topic: t })));
  return {
    package: PACKAGE,
    entities: ENTITIES,
    publishers: PUBLISHERS,
    reusedPublisherIds: REUSED_PUBLISHER_IDS,
    newPaths: NEW_PATHS,
    reusedPaths: REUSED_PATHS,
    packagePaths,
    pathExpectedLevels,
    pathExpectedGeographies,
    pathExpectedTopics,
    futureTargets: FUTURE_TARGETS
  };
}

module.exports = {
  build,
  PACKAGE, ENTITIES, PUBLISHERS, NEW_PATHS, REUSED_PATHS, REUSED_PUBLISHER_IDS, FUTURE_TARGETS
};
