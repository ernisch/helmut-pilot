"use strict";

// Helmut — Quellenarchitektur · Paket "bevoelkerungsschutz-katastrophenschutz-bund"
// (ziviler Bevoelkerungs- & Katastrophenschutz des Bundes) · VORBEREITET / TECHNISCH INAKTIV.
//
// REINE, DETERMINISTISCHE DATEN + BUILD-LOGIK. Kein Netz, keine KI, kein Storage-Write, kein
// Rendering. Analog zu seeds/landesmodule-quellen.js, aber fuer ein THEMATISCHES Bundespaket.
// Formt die amtlich verifizierten Kandidaten in das relationale Modell (source_packages /
// political_entities / publishers / retrieval_paths / package_paths / path_expected_*).
//
// VOLLSTAENDIG SELBST-ENTHALTEND & ADDITIV: dieses Modul aendert NICHT den Haupt-Seed
// (20260713_source_architecture_seed.sql) und NICHT die Basis-Datenmodelle
// (seeds/entities.js, seeds/publishers.js, seeds/packages.js, catalog.js). Es fuegt ein
// neues Paket + fehlende Herausgeber/Entitaeten/Wege HINZU und verknuepft additiv bereits
// bestehende Wege (DIP, Innenausschuss). Der Haupt-Seed bleibt byte-identisch — dadurch
// bleiben die bestandszaehlenden Offline-Tests (source-architecture 144/145, admin-source
// 51 Herausgeber) unveraendert gruen.
//
// SICHERHEITSINVARIANTEN (im Generator hart gesetzt, hier vorbereitet):
//   - Paket:            status = "prepared"  (NIE active) · kein Profil-Mapping · kein Crawl-Plan.
//   - Neue Abrufwege:   status = "needs_review" (NIE healthy/active) +
//                       activation_mode = "manual" (NIE auto/always_on -> kein Auto-Crawl).
//   - Bestehende Wege:  werden NUR additiv einem Paket zugeordnet (package_paths), NIE geaendert.
//   Da computePathRefcounts (model.js) ausschliesslich AKTIVE Pakete zaehlt und dieses Paket
//   "prepared" ist, aktiviert es KEINEN Weg — auch nicht die wiederverwendeten.
//
// ABGRENZUNG (rein zivil): Innere Sicherheit / Polizei / Verfassungsschutz / Terrorismus
// gehoeren in das Paket `innere-sicherheit-bund` (hier NICHT enthalten). Allgemeine
// Cybersicherheit / BSI, DWD-Wetterwarnungen, RKI-, BNetzA-, BLE-, BfS-Regelkommunikation
// sind ausgeschlossen; nur der zivile Bevoelkerungsschutz-Anteil wird beruecksichtigt.
//
// AMTLICHE KORREKTUREN AN DER DEEPSEEK-RECHERCHE (WebSearch-verifiziert, Juli 2026):
//   - Zustaendiger BT-Ausschuss 21. WP = "Innenausschuss" (Bundestag nutzt diese Bezeichnung
//     in den Primaerdokumenten der 21. WP). "Ausschuss fuer Inneres und Heimat" = HISTORISCHER
//     ALIAS. Bestehende Repo-Daten (committee-bt-inneres / rp-committee-inneres) tragen noch
//     den Altnamen -> als BESTANDSDRIFT dokumentiert, NICHT still ausserhalb des Paket-Scope
//     geaendert.
//   - BMI = "Bundesministerium des Innern" (Rueckbenennung 06.05.2025). "Bundesministerium des
//     Innern und fuer Heimat" (BMIH) = HISTORISCHER ALIAS. Bestehende Entitaet ministry-bmi
//     traegt bereits den korrekten aktuellen Namen -> KEINE BMI/BMIH-Dublette angelegt.
//   - KEINE Personen (BBK-/THW-Praesidium, IMK-Vorsitz) in stabilen Quellen-IDs modelliert
//     (wechseln; z. B. BBK-Leitung 2026 gewechselt). Nur Institutionen.
//   - PiB-16 ("Praxis im Bevoelkerungsschutz" Bd. 16) ist eine METHODISCHE BBK-Publikation,
//     KEINE regelmaessig aktualisierte politische Kernquelle. Die parlamentarischen
//     Risikoanalyse-Berichte des Bundes (BMI -> Bundestag) sind BEREITS ueber DIP abgedeckt
//     -> KEIN paralleler Risikoanalyse-Weg angelegt.
//   - Pakt fuer den Bevoelkerungsschutz (Kabinettsbeschluss, ~10,2 Mrd. EUR bis 2029) +
//     "Fahrplan Zivile Verteidigungsfaehigkeit 2029" (IMK Hamburg, 19.06.2026) sind ein
//     politisches VORHABEN, KEINE Institution -> abgedeckt ueber BMI + IMK + DIP.
//   - Ein Fortschrittsbericht zur Resilienzstrategie ist NICHT als veroeffentlicht bestaetigt
//     (fuer Anfang 2026 angekuendigt/geplant, dann 3-Jahres-Rhythmus) -> nur als Erwartung
//     dokumentiert, nicht als bestaetigte Publikation modelliert.

const PACKAGE_ID = "pkg-bevoelkerungsschutz-katastrophenschutz-bund";
const PACKAGE_KEY = "bevoelkerungsschutz-katastrophenschutz-bund";

// --- Quellenpaket (NEU, status prepared, kein is_base, Bund) ------------------
const PACKAGE = Object.freeze({
  id: PACKAGE_ID,
  key: PACKAGE_KEY,
  name: "Bevölkerungsschutz & Katastrophenschutz (Bund)",
  purpose:
    "Ziviler Bevölkerungs- und Katastrophenschutz des Bundes: politische Steuerung " +
    "(BMI/Resilienzstrategie), fachliche Umsetzung & Risikoanalysen (BBK), " +
    "Warnsystem-Evaluierung & LÜKEX (BBK), operative Zivilschutzentwicklung (THW-Jahresbericht), " +
    "Bund-Länder-Steuerung (IMK-Beschlüsse), parlamentarische Kontrolle (DIP/Innenausschuss) " +
    "und Haushaltskontrolle (Bundesrechnungshof). Rein zivil — Innere Sicherheit/Polizei/" +
    "Verfassungsschutz ausgeschlossen (Paket innere-sicherheit-bund). Struktur vorbereitet, " +
    "technisch INAKTIV (prepared, ohne Profil-Mapping, ohne aktiven Crawl-Plan).",
  status: "prepared",          // NIE active
  is_base: false,              // thematisches Zusatzpaket, kein Pflicht-Basispaket
  political_level: "bund",
  geography_id: "geo-bund",
  required_classes: []
});

// --- Neue politische Entitaeten (nur solche, die NICHT bereits existieren) ----
// Bestehend genutzt (NICHT neu angelegt): ministry-bmi, authority-bundesrechnungshof,
// parliament-bundestag, parliament-bundesrat, government-bund, committee-bt-inneres.
// BBK/THW als Behoerde bzw. Bundesanstalt -> entity_type "authority" (naechstliegend im Enum).
// IMK als Bund-Laender-Koordinierungsgremium -> entity_type "other_institution" (KEINE Behoerde,
// kein Ministerium): der Enum-Typ traegt die praezise institutionelle Einordnung.
const NEUE_ENTITAETEN = [
  {
    id: "authority-bbk", entity_type: "authority",
    name: "Bundesamt für Bevölkerungsschutz und Katastrophenhilfe",
    canonical_key: null, level: "bund", geography_id: "geo-bund", aliases: ["BBK"]
  },
  {
    id: "authority-thw", entity_type: "authority",
    name: "Bundesanstalt Technisches Hilfswerk",
    canonical_key: null, level: "bund", geography_id: "geo-bund", aliases: ["THW"]
  },
  {
    id: "institution-imk", entity_type: "other_institution",
    name: "Ständige Konferenz der Innenminister und -senatoren der Länder",
    // Bund-Laender-Koordinierungsgremium: kein einzelnes geographisches Level (wie Verbaende/
    // Gewerkschaften in seeds/entities.js) -> level/geography null.
    canonical_key: null, level: null, geography_id: null, aliases: ["IMK", "Innenministerkonferenz"]
  }
];

// --- Herausgeber ------------------------------------------------------------
// 4 NEUE + 1 BESTEHENDER (bundesrechnungshof.de, wird via ON CONFLICT DO NOTHING NICHT
// ueberschrieben — identische Werte, nur zur FK-Absicherung des BRH-Weges gelistet).
// entity_id verknuepft mit der zentralen Entitaetsschicht.
//   - BMI: bestehende Entitaet ministry-bmi (Herausgeber bmi.bund.de fehlte bislang).
//   - BBK/THW: neue Entitaeten authority-bbk / authority-thw.
//   - IMK: neue Entitaet institution-imk. publisher_type "authority" ist nur ein grober
//     Herausgeber-Deskriptor (Admin-Anzeige); die praezise Typisierung liegt in entity_type
//     (other_institution).
//   - BRH: bestehende Entitaet authority-bundesrechnungshof (unveraendert).
const PUBLISHERS = [
  {
    id: "publisher-bmi.bund.de", name: "Bundesministerium des Innern",
    canonical_domain: "bmi.bund.de", publisher_type: "ministry",
    evidence_role: "official_primary", trust: "hoch", lifecycle_status: "active",
    entity_id: "ministry-bmi", neu: true
  },
  {
    id: "publisher-bbk.bund.de", name: "Bundesamt für Bevölkerungsschutz und Katastrophenhilfe",
    canonical_domain: "bbk.bund.de", publisher_type: "authority",
    evidence_role: "official_primary", trust: "hoch", lifecycle_status: "active",
    entity_id: "authority-bbk", neu: true
  },
  {
    id: "publisher-thw.de", name: "Bundesanstalt Technisches Hilfswerk",
    canonical_domain: "thw.de", publisher_type: "authority",
    evidence_role: "official_primary", trust: "hoch", lifecycle_status: "active",
    entity_id: "authority-thw", neu: true
  },
  {
    id: "publisher-innenministerkonferenz.de", name: "Innenministerkonferenz (IMK)",
    canonical_domain: "innenministerkonferenz.de", publisher_type: "authority",
    evidence_role: "official_primary", trust: "hoch", lifecycle_status: "active",
    entity_id: "institution-imk", neu: true
  },
  {
    // BESTEHEND — reine FK-Absicherung des BRH-Weges. ON CONFLICT DO NOTHING schuetzt den
    // vorhandenen Datensatz; Werte identisch zum Haupt-Seed.
    id: "publisher-bundesrechnungshof.de", name: "Bundesrechnungshof",
    canonical_domain: "bundesrechnungshof.de", publisher_type: "authority",
    evidence_role: "data_source", trust: "hoch", lifecycle_status: "active",
    entity_id: "authority-bundesrechnungshof", neu: false
  }
];

// --- Google-News-Suchweg bauen (site:-scoped, KEINE erfundenen Feed-Endpunkte) ---
// url = news.google.com-RSS-Suche; query = rohe Suchdefinition (Konvention wie Haupt-Seed).
function gnews(rawQuery) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(rawQuery)}&hl=de&gl=DE&ceid=DE:de`;
  return { url, query: rawQuery };
}

// --- Neue Abrufwege (7) — alle needs_review + manual + googlenews_search ------
// Tier: 1 = dauerhaft unverzichtbar, 2 = periodisch, 3 = ereignisbezogen.
// is_critical NUR fuer Tier-1-Primaerwege (sichtbarer Alarm statt stiller Tod) — beeinflusst
// die Aktivierung NICHT (Weg bleibt manual/needs_review/inaktiv).
const NEUE_WEGE = [
  {
    id: "rp-bevschutz-bmi-strategie", publisher_id: "publisher-bmi.bund.de",
    legacy_source_id: "bevschutz-bmi-strategie",
    name: "BMI — Bevölkerungsschutz & Resilienzstrategie",
    tier: 1, is_critical: true, priority: 86, max_items: 16,
    ...gnews("site:bmi.bund.de (Bevölkerungsschutz OR Resilienzstrategie OR Resilienz OR Zivilschutz OR Katastrophenschutz OR Verteidigungsfähigkeit)")
  },
  {
    id: "rp-bevschutz-bbk-strategie-risiko", publisher_id: "publisher-bbk.bund.de",
    legacy_source_id: "bevschutz-bbk-strategie-risiko",
    name: "BBK — Strategie, Risikoanalysen & Zivilschutz",
    tier: 1, is_critical: true, priority: 86, max_items: 16,
    ...gnews("site:bbk.bund.de (Risikoanalyse OR Resilienz OR Bevölkerungsschutz OR Zivilschutz OR Katastrophenschutz OR KRITIS)")
  },
  {
    id: "rp-bevschutz-imk-beschluesse", publisher_id: "publisher-innenministerkonferenz.de",
    legacy_source_id: "bevschutz-imk-beschluesse",
    name: "IMK — Beschlüsse Bevölkerungs-/Katastrophenschutz & zivile Verteidigung",
    tier: 1, is_critical: true, priority: 84, max_items: 16,
    ...gnews("site:innenministerkonferenz.de (Bevölkerungsschutz OR Katastrophenschutz OR Zivilschutz OR Verteidigungsfähigkeit OR Beschluss)")
  },
  {
    id: "rp-bevschutz-bbk-warnung", publisher_id: "publisher-bbk.bund.de",
    legacy_source_id: "bevschutz-bbk-warnung",
    name: "BBK — Warnsysteme & Warntag-Auswertung",
    tier: 2, is_critical: false, priority: 76, max_items: 16,
    ...gnews("site:bbk.bund.de (Warntag OR Warnung OR Warnsystem OR Warnmittel OR MoWaS OR NINA OR Sirenen)")
  },
  {
    id: "rp-bevschutz-thw-jahresbericht", publisher_id: "publisher-thw.de",
    legacy_source_id: "bevschutz-thw-jahresbericht",
    name: "THW — Jahresbericht & Zivilschutzentwicklung",
    tier: 2, is_critical: false, priority: 74, max_items: 16,
    ...gnews("site:thw.de (Jahresbericht OR Jahresrückblick OR Zivilschutz OR Bauprogramm OR Ausstattung OR Ehrenamt)")
  },
  {
    id: "rp-bevschutz-bbk-luekex", publisher_id: "publisher-bbk.bund.de",
    legacy_source_id: "bevschutz-bbk-luekex",
    name: "BBK — LÜKEX & strategisches Krisenmanagement",
    tier: 2, is_critical: false, priority: 72, max_items: 16,
    ...gnews("site:bbk.bund.de (LÜKEX OR Krisenmanagement OR Krisenübung OR Stabsrahmenübung)")
  },
  {
    id: "rp-bevschutz-brh-pruefungen", publisher_id: "publisher-bundesrechnungshof.de",
    legacy_source_id: "bevschutz-brh-pruefungen",
    name: "Bundesrechnungshof — Prüfungen Bevölkerungsschutz (BBK/THW/ZSKG/GeKoB)",
    tier: 3, is_critical: false, priority: 68, max_items: 16,
    ...gnews("site:bundesrechnungshof.de (Bevölkerungsschutz OR Katastrophenschutz OR Zivilschutz OR BBK OR THW OR ZSKG OR GeKoB)")
  }
];

// --- Wiederverwendete BESTEHENDE Abrufwege (NUR additive Paketzuordnung) ------
// Werden NICHT neu angelegt und NICHT geaendert. rp-committee-inneres traegt bereits
// "Bevoelkerungsschutz" in seiner Suchdefinition; rp-dip ist die DIP-API-Wirbelsaeule
// (deckt parlamentarische Risikoanalyse-Berichte, ZSKG-/KRITIS-Gesetzgebung, Pakt-Drucksachen,
// BBK/THW-Haushalt und BRH-Unterrichtungen ab -> keine parallelen Wege noetig).
const REUSED_PATHS = [
  { id: "rp-dip", tier: 1, why: "DIP-API: parlamentarische Kernquelle (Drucksachen, Anfragen, Gesetzgebung, Risikoanalyse-Berichte, ZSKG/KRITIS, Pakt-Antworten)" },
  { id: "rp-committee-inneres", tier: 1, why: "Innenausschuss (enthaelt bereits 'Bevoelkerungsschutz' in der Suchdefinition)" }
];

// Baut das vorbereitete Paket-Abbild (rein deterministisch, kein Netz/Storage).
function buildBevoelkerungsschutzSeed() {
  const retrievalPaths = NEUE_WEGE.map((w) => ({
    id: w.id,
    publisher_id: w.publisher_id,
    legacy_source_id: w.legacy_source_id,
    name: w.name,
    method: "googlenews_search",
    url: w.url,
    query: w.query,
    parser: "googlenews-batchexecute",
    priority: w.priority,
    status: "needs_review",       // VORBEREITET — nie healthy/active
    activation_mode: "manual",    // VORBEREITET — nie auto/always_on -> kein Auto-Crawl
    is_critical: w.is_critical,
    max_items: w.max_items,
    tier: w.tier
  }));

  // Paketzuordnungen: 7 neue Wege + 2 wiederverwendete = 9 (alle -> dieses Paket).
  const packagePaths = [
    ...retrievalPaths.map((p) => ({ package_id: PACKAGE_ID, retrieval_path_id: p.id })),
    ...REUSED_PATHS.map((r) => ({ package_id: PACKAGE_ID, retrieval_path_id: r.id }))
  ];

  // Erwartete Ebene/Geografie NUR fuer die neuen Wege (bund / geo-bund). Bestehende Wege
  // behalten ihre eigenen Dimensionen unveraendert.
  const pathExpectedLevels = retrievalPaths.map((p) => ({ retrieval_path_id: p.id, level: "bund" }));
  const pathExpectedGeographies = retrievalPaths.map((p) => ({ retrieval_path_id: p.id, geography_id: "geo-bund" }));

  const tierOf = (id) =>
    retrievalPaths.find((p) => p.id === id)?.tier ?? REUSED_PATHS.find((r) => r.id === id)?.tier ?? null;

  return {
    package: { ...PACKAGE },
    entities: NEUE_ENTITAETEN.map((e) => ({ ...e })),
    publishers: PUBLISHERS.map((p) => ({ ...p })),
    retrievalPaths,
    reusedPaths: REUSED_PATHS.map((r) => ({ ...r })),
    packagePaths,
    pathExpectedLevels,
    pathExpectedGeographies,
    summary: {
      status: "prepared",
      neuePublisher: PUBLISHERS.filter((p) => p.neu).length,             // 4
      publisherInsertRows: PUBLISHERS.length,                            // 5 (inkl. BRH DO NOTHING)
      neueEntitaeten: NEUE_ENTITAETEN.length,                            // 3
      neueWege: retrievalPaths.length,                                   // 7
      wiederverwendeteWege: REUSED_PATHS.length,                         // 2
      wegeGesamt: retrievalPaths.length + REUSED_PATHS.length,           // 9
      paketzuordnungen: packagePaths.length,                             // 9
      tier1: [...retrievalPaths, ...REUSED_PATHS].filter((p) => (p.tier ?? tierOf(p.id)) === 1).length,
      tier2: retrievalPaths.filter((p) => p.tier === 2).length,
      tier3: retrievalPaths.filter((p) => p.tier === 3).length,
      // technisch inaktiv: kein neuer Weg ist aktiv/auto/always_on/healthy
      aktiveNeueWege: retrievalPaths.filter(
        (p) => p.status === "healthy" || p.activation_mode === "auto" || p.activation_mode === "always_on"
      ).length
    }
  };
}

module.exports = {
  buildBevoelkerungsschutzSeed,
  PACKAGE, PACKAGE_ID, PACKAGE_KEY,
  NEUE_ENTITAETEN, PUBLISHERS, NEUE_WEGE, REUSED_PATHS
};
