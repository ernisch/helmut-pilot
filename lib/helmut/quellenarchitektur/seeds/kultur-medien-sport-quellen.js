"use strict";

// Helmut — Quellenarchitektur · PREPARED-Vorbereitung des Bund-Fachpakets
// "Kultur, Medien und Sport (Bund)" (kanonisch: kultur-medien-und-sport-bund).
//
// REINE, DETERMINISTISCHE LOGIK. Kein Netz, keine KI, kein Storage-Write, KEIN Rendering.
// Formt eine kleine, hochwertige Quellenarchitektur mit maximalem politischem Signalwert in
// das relationale Modell (source_packages / publishers / retrieval_paths / package_paths /
// path_expected_*) — ausschliesslich als VORBEREITET:
//   - source_packages: status "prepared", is_base=false  -> computeGlobalActivation aktiviert NICHTS.
//   - retrieval_paths (neu): status "needs_review" (NICHT healthy/active), activation_mode "manual"
//     (NICHT auto/always_on) -> werden nie automatisch aktiviert/gecrawlt.
//   - is_critical=false fuer ALLE neuen Wege: es sind vorbereitete Manuell-Wege, keine kritischen
//     always_on-Systemquellen.
// Das Anwenden auf Production (DB-Insert) bleibt ein eigener, ausdruecklich freigabepflichtiger
// Schritt (wie die Bund-Migration / das BE/BB-Landesmodul). Dieses Modul erzeugt NUR das
// In-Memory-Abbild + eine anwendbare Seed-Struktur; es schreibt nichts.
//
// WIEDERVERWENDUNG STATT DUBLETTE (Auftrag §7). Bestehende Komponenten werden bevorzugt:
//   - REUSED PATHS (nur zusaetzliche package_paths-Referenz, KEIN neuer Weg):
//       rp-dip                     (DIP-API, always_on) — parlamentarische Vorgaenge, Drucksachen,
//                                  Unterrichtungen (u. a. 15. Sportbericht der Bundesregierung,
//                                  Filmfoerdergesetz) — Korrektur 4: kein separater PDF-Weg.
//       rp-committee-kultur-medien (Bund-Basis) — Ausschuss fuer Kultur und Medien.
//       rp-committee-sport         (Bund-Basis) — Ausschuss fuer Sport (und Ehrenamt).
//     Diese Wege bleiben GLOBAL UNVERAENDERT; das prepared-Paket erhoeht ihre Referenzzaehlung
//     NICHT (Paket ist prepared, nicht active) und aktiviert damit nichts.
//   - REUSED PUBLISHERS (referenziert, NICHT neu angelegt):
//       publisher-bundesregierung.de (Korrektur 2: deckt Sport/Ehrenamt beim Bundeskanzler ab —
//                                    KEIN neuer bundeskanzleramt.de-Publisher).
//       publisher-destatis.de        (Korrektur 3: Kulturfinanzbericht, Destatis, 2-Jahres-Rhythmus).
//   - REUSED ENTITY: statoffice-destatis (fuer den Kulturfinanzbericht-Weg).
//
// KORREKTUR 1 (organisatorische Trennung Sport <-> BKM sauber modelliert): Der Sport-/Ehrenamt-Weg
// haengt NICHT am BKM-Publisher/-Entity, sondern am bestehenden Bundesregierung-Publisher, und seine
// erwartete Entitaet ist die eigenstaendige "Staatsministerin fuer Sport und Ehrenamt beim
// Bundeskanzler" (government-sport-ehrenamt-bk) — nicht der BKM.
// KORREKTUR 8 (BKM fachlich getrennt): zwei Retrieval Paths auf EINEM neuen BKM-Publisher —
//   1) Kultur/Erinnerung/Kulturgutschutz, 2) Medien/Filmfoerderung/Mediengesetzgebung.
// KORREKTUR 6 (BISp): NICHT aufgenommen — Future Target (kein nachweisbar regelmaessiger
//   politischer Signalwert). Siehe FUTURE_TARGETS.
// KORREKTUR 7 (NADA): eigenstaendiger Weg mit Fokus Jahresberichte / WADA-Code-Umsetzung /
//   nationale Regelaenderungen — KEINE operativen Dopingmeldungen (Query meidet Einzelfaelle).

// --- Neue politische Entitaeten (nur solche, die NICHT bereits in seeds/entities.js stehen) ----
// Bestehend & wiederverwendet: statoffice-destatis, government-bund, parliament-bundestag,
// committee-bt-kultur-medien, committee-bt-sport (nicht hier dupliziert).
const NEUE_ENTITAETEN = [
  {
    id: "ministry-bkm", entity_type: "ministry",
    name: "Beauftragte der Bundesregierung für Kultur und Medien",
    canonical_key: null, level: "bund", geography_id: "geo-bund",
    aliases: [
      "BKM", "Kulturstaatsminister", "Kulturstaatsministerin",
      "Staatsminister für Kultur und Medien", "Staatsministerin für Kultur und Medien",
      "Beauftragter der Bundesregierung für Kultur und Medien"
    ]
  },
  {
    // Korrektur 1: Sport ist NICHT Teil des BKM. Eigene Staatsministerin beim Bundeskanzler.
    id: "government-sport-ehrenamt-bk", entity_type: "government",
    name: "Staatsministerin für Sport und Ehrenamt beim Bundeskanzler",
    canonical_key: null, level: "bund", geography_id: "geo-bund",
    aliases: [
      "Sport und Ehrenamt", "Staatsministerin für Sport und Ehrenamt",
      "Staatsminister für Sport und Ehrenamt", "Beauftragte für Sport und Ehrenamt",
      "Beauftragter für Sport und Ehrenamt"
    ]
  },
  {
    // NADA ist eine Stiftung buergerlichen Rechts mit offiziellem nationalen Anti-Doping-Mandat
    // -> typisierte Schicht: other_institution (kein Behoerden-/Ministeriums-Etikett behaupten).
    id: "institution-nada", entity_type: "other_institution",
    name: "Nationale Anti-Doping-Agentur Deutschland",
    canonical_key: null, level: "bund", geography_id: "geo-bund",
    aliases: ["NADA", "NADA Deutschland", "Nationale Anti Doping Agentur", "Nationale Anti-Doping-Agentur"]
  }
];

// --- Neue Herausgeber (nur BKM + NADA; alles Uebrige wird wiederverwendet) ---------------------
const NEUE_PUBLISHERS = [
  {
    id: "publisher-kulturstaatsminister.de", name: "Beauftragte der Bundesregierung für Kultur und Medien",
    canonical_domain: "kulturstaatsminister.de", publisher_type: "ministry",
    evidence_role: "official_primary", trust: "hoch", lifecycle_status: "active", entity_id: "ministry-bkm"
  },
  {
    id: "publisher-nada.de", name: "Nationale Anti-Doping-Agentur Deutschland",
    canonical_domain: "nada.de", publisher_type: "other_institution",
    evidence_role: "official_primary", trust: "mittel", lifecycle_status: "active", entity_id: "institution-nada"
  }
];

// Herausgeber, die referenziert, aber NICHT neu angelegt werden (Wiederverwendung, Auftrag §7).
const REUSED_PUBLISHER_IDS = ["publisher-bundesregierung.de", "publisher-destatis.de"];
// Entitaeten, die referenziert (path_expected_entities), aber NICHT neu angelegt werden.
const REUSED_ENTITY_IDS = ["statoffice-destatis"];

// --- Das neue Fachpaket (prepared, is_base=false, Bund) -----------------------------------------
const PACKAGE = {
  id: "pkg-kultur-medien-und-sport-bund", key: "kultur-medien-und-sport-bund",
  name: "Kultur, Medien und Sport (Bund)",
  purpose: "Bund-Fachpaket mit maximalem politischem Signalwert: BKM (Kultur/Erinnerung/Kulturgutschutz " +
    "und Medien/Film getrennt), Sport und Ehrenamt beim Bundeskanzler (bestehender Bundesregierung-Publisher), " +
    "Ausschuss fuer Kultur und Medien + Ausschuss fuer Sport (wiederverwendet), DIP (wiederverwendet), NADA " +
    "(Anti-Doping-Berichte/WADA-Code) und Kulturfinanzbericht (Destatis, wiederverwendet). Struktur vorbereitet — " +
    "Aktivierung ist ein eigener, freigabepflichtiger Schritt.",
  status: "prepared", is_base: false, political_level: "bund", geography_id: "geo-bund",
  required_classes: []
};

// --- Neue Abrufwege (alle googlenews_search auf den ECHTEN Herausgeber via site:-Filter) --------
// Bewusst KEIN erfundenes RSS/keine erfundene API/keine erfundene Deep-URL: der news.google.com/
// rss/search-Endpunkt ist der im Katalog etablierte, stabile Suchweg; die site:-Domain bindet den
// realen Herausgeber (Zielarchitektur "Wie Google News korrekt behandelt wird"). Alle Wege sind
// method-CHECK-konform (googlenews_search), needs_review + manual, is_critical=false.
// Korrektur 4: KEIN structured_download/PDF-Weg fuer den 15. Sportbericht — DIP deckt ihn ab.
const NEUE_WEGE = [
  {
    id: "rp-bkm-kultur", publisher_id: "publisher-kulturstaatsminister.de",
    name: "BKM — Kultur / Erinnerung / Kulturgutschutz",
    query: 'site:kulturstaatsminister.de (Kultur OR Kulturförderung OR Erinnerungskultur OR Kulturgutschutz OR Denkmalschutz OR Provenienz OR Gedenken)',
    priority: 72, expected_entity: "ministry-bkm",
    topics: ["kulturpolitik", "kulturfoerderung", "erinnerungskultur", "kulturgutschutz", "denkmalschutz", "provenienz"]
  },
  {
    id: "rp-bkm-medien-film", publisher_id: "publisher-kulturstaatsminister.de",
    name: "BKM — Medien / Filmförderung / Mediengesetzgebung",
    query: 'site:kulturstaatsminister.de (Film OR Filmförderung OR Filmfördergesetz OR Medien OR Medienpolitik OR Medieninvestitionsgesetz OR "Deutsche Welle")',
    priority: 72, expected_entity: "ministry-bkm",
    topics: ["medienpolitik", "filmfoerderung", "filmfoerdergesetz", "medieninvestitionsgesetz", "deutsche-welle", "mediengesetzgebung"]
  },
  {
    // Korrektur 1 + 2: bestehender Bundesregierung-Publisher, eigenstaendige Sport-Entitaet.
    id: "rp-sport-ehrenamt-bund", publisher_id: "publisher-bundesregierung.de",
    name: "Sport und Ehrenamt beim Bundeskanzler (Bundesregierung)",
    query: 'site:bundesregierung.de (Sportförderung OR Spitzensport OR "Sport und Ehrenamt" OR Ehrenamt OR Sportfördergesetz OR Anti-Doping)',
    priority: 70, expected_entity: "government-sport-ehrenamt-bk",
    topics: ["sportfoerderung", "spitzensport", "ehrenamt", "sportpolitik", "anti-doping"]
  },
  {
    // Korrektur 7: Berichte/WADA-Code/Regeln — KEINE operativen Dopingmeldungen/Einzelfaelle.
    id: "rp-nada-antidoping", publisher_id: "publisher-nada.de",
    name: "NADA — Jahresberichte / WADA-Code / nationale Regeländerungen",
    query: 'site:nada.de (Jahresbericht OR WADA-Code OR "NADA-Code" OR Regeländerung OR Anti-Doping-Code)',
    priority: 60, expected_entity: "institution-nada",
    topics: ["anti-doping", "wada-code", "nada-jahresbericht", "dopingbekaempfung"]
  },
  {
    // Korrektur 3: Kulturfinanzbericht, Destatis, 2-Jahres-Rhythmus — bestehender Destatis-Publisher.
    id: "rp-destatis-kulturfinanzbericht", publisher_id: "publisher-destatis.de",
    name: "Destatis — Kulturfinanzbericht",
    query: 'site:destatis.de (Kulturfinanzbericht OR Kulturausgaben OR Kulturfinanzen)',
    priority: 55, expected_entity: "statoffice-destatis",
    topics: ["kulturfinanzbericht", "kulturfinanzen", "kulturausgaben"]
  }
];

// Wiederverwendete Wege: NUR zusaetzliche package_paths-Referenz. KEIN neuer retrieval_path.
const REUSED_WEGE = [
  { id: "rp-dip", reason: "DIP-API (always_on) — parlamentarische Vorgaenge/Drucksachen/Unterrichtungen inkl. 15. Sportbericht + Filmfoerdergesetz. Korrektur 4." },
  { id: "rp-committee-kultur-medien", reason: "Ausschuss fuer Kultur und Medien — bestehender Bund-Basis-Weg." },
  { id: "rp-committee-sport", reason: "Ausschuss fuer Sport (und Ehrenamt) — bestehender Bund-Basis-Weg. Korrektur 5: kein erfundener bundestag.de/ausschuesse/sport-Weg." }
];

// Bewusst NICHT aufgenommen (Future Targets / Paketgrenzen) — dokumentiert, nicht geseedet.
const FUTURE_TARGETS = [
  { id: "bisp", grund: "BISp: kein nachweisbar regelmaessiger politischer Signalwert (Korrektur 6) -> Future Target." },
  { id: "dosb", grund: "DOSB: Verband, keine amtliche Primaerquelle." },
  { id: "kulturstiftung-bund", grund: "operative Foerderentscheidungen -> ueber BKM/Ausschuss abgedeckt." },
  { id: "deutsche-welle", grund: "DW-Gesetz/Berichte -> ueber BKM (Medien/Film) + Ausschuss/DIP abgedeckt." },
  { id: "spk-bundesarchiv-dnb-kulturgutverluste", grund: "Berichte/Restitution -> ueber BKM/Ausschuss/DIP abgedeckt; bei Zunahme spaeter eigener Weg." },
  { id: "wada-emfa", grund: "internationale/EU-Quelle -> nur bei systematischem Monitoring, kein deutscher Primaerweg." }
];

function gnUrl(query) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=de&gl=DE&ceid=DE:de`;
}

function buildKulturMedienSportSeed() {
  const retrievalPaths = NEUE_WEGE.map((w) => ({
    id: w.id,
    publisher_id: w.publisher_id,
    legacy_source_id: null,               // brandneu, kein v1Sources-Ursprung -> ehrlich null
    name: w.name,
    method: "googlenews_search",
    url: gnUrl(w.query),
    query: w.query,
    parser: "googlenews-batchexecute",
    priority: w.priority,
    status: "needs_review",               // VORBEREITET — nie healthy/active
    activation_mode: "manual",            // VORBEREITET — nie auto/always_on -> kein Auto-Crawl
    is_critical: false,                   // vorbereiteter Manuell-Weg, keine always_on-Systemquelle
    max_items: 16
  }));

  // package_paths: 5 neue Wege + 3 wiederverwendete (bestehende) Wege = 8. Alle zeigen auf das
  // prepared-Paket; die wiederverwendeten Wege behalten ihren Status/ihre Aktivierung global.
  const packagePaths = [
    ...NEUE_WEGE.map((w) => ({ package_id: PACKAGE.id, retrieval_path_id: w.id, reused: false })),
    ...REUSED_WEGE.map((w) => ({ package_id: PACKAGE.id, retrieval_path_id: w.id, reused: true }))
  ];

  // Erwartete Dimensionen NUR fuer die 5 neuen Wege (bestehende Wege bleiben unveraendert).
  const pathExpectedLevels = NEUE_WEGE.map((w) => ({ retrieval_path_id: w.id, level: "bund" }));
  const pathExpectedGeographies = NEUE_WEGE.map((w) => ({ retrieval_path_id: w.id, geography_id: "geo-bund" }));
  const pathExpectedEntities = NEUE_WEGE.map((w) => ({ retrieval_path_id: w.id, entity_id: w.expected_entity }));
  const pathExpectedTopics = [];
  for (const w of NEUE_WEGE) for (const t of w.topics) pathExpectedTopics.push({ retrieval_path_id: w.id, topic: t });

  return {
    package: PACKAGE,
    entities: NEUE_ENTITAETEN,
    publishers: NEUE_PUBLISHERS,
    retrievalPaths,
    reusedPaths: REUSED_WEGE,
    reusedPublishers: REUSED_PUBLISHER_IDS,
    reusedEntities: REUSED_ENTITY_IDS,
    packagePaths,
    pathExpectedLevels,
    pathExpectedGeographies,
    pathExpectedTopics,
    pathExpectedEntities,
    futureTargets: FUTURE_TARGETS,
    summary: {
      status: "prepared",
      package: PACKAGE.key,
      neueEntitaeten: NEUE_ENTITAETEN.length,
      neuePublishers: NEUE_PUBLISHERS.length,
      neueWege: retrievalPaths.length,
      wiederverwendeteWege: REUSED_WEGE.length,
      wiederverwendetePublishers: REUSED_PUBLISHER_IDS.length,
      wiederverwendeteEntitaeten: REUSED_ENTITY_IDS.length,
      paketzuordnungen: packagePaths.length,
      pathExpectedTopics: pathExpectedTopics.length,
      // technisch inaktiv: kein neuer Weg ist aktiv/auto/always_on
      aktiveNeueWege: retrievalPaths.filter((p) => p.status === "healthy" || p.activation_mode === "auto" || p.activation_mode === "always_on").length,
      bispAufgenommen: false
    }
  };
}

module.exports = {
  buildKulturMedienSportSeed,
  NEUE_ENTITAETEN, NEUE_PUBLISHERS, PACKAGE, NEUE_WEGE, REUSED_WEGE,
  REUSED_PUBLISHER_IDS, REUSED_ENTITY_IDS, FUTURE_TARGETS, gnUrl
};
