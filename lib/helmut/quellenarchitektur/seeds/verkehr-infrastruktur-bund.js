"use strict";

// Helmut — Quellenarchitektur · Themenpaket "verkehr-infrastruktur-bund" (Bundesebene).
//
// REINE, DETERMINISTISCHE DATEN + REINE HELFER. Kein Netz, keine KI, kein Storage-Write,
// KEIN Rendering. Formt die fachliche Zielarchitektur (Deep Research "Verkehr & Infrastruktur,
// Bund") in das bestehende relationale Modell (publishers / political_entities / source_packages /
// retrieval_paths / package_paths / path_expected_*) — ausschliesslich als VORBEREITET / INAKTIV:
//
//   - source_package: status "prepared" (NICHT active) -> computeGlobalActivation aktiviert es NICHT.
//   - retrieval_paths: status "needs_review" (NICHT healthy), activation_mode "manual"
//     (NICHT auto/always_on) -> werden nie automatisch aktiviert oder gecrawlt.
//   - Das Anwenden auf Production (DB-Insert) bleibt ein eigener, ausdruecklich
//     freigabepflichtiger Schritt (wie Bund- und Landesmodul-Seeds). Dieses Modul erzeugt NUR
//     das In-Memory-Abbild; der Generator (scripts/generate-verkehr-infrastruktur-seed.js)
//     giesst es in idempotentes, NICHT-destruktives SQL (ON CONFLICT DO NOTHING).
//
// WIEDERVERWENDUNG STATT DUBLETTEN (Auftrag §1/§7): Bestehende Herausgeber/Entitaeten werden
// referenziert, NICHT neu angelegt:
//   - Herausgeber: aggregator-google-news, publisher-destatis.de, publisher-bdi.eu
//   - Entitaeten:  statoffice-destatis, association-bdi, committee-bt-verkehr,
//                  parliament-bundestag, parliament-bundesrat, government-bund
//   - Abrufweg:    rp-committee-verkehr (bestehender thematischer Verkehrs-Suchweg aus Bund Basis)
//     -> KEIN paralleler parlamentarischer Weg; das bestehende Paket-Link genuegt.
//
// EHRLICHKEIT (Verifikations-Vorbehalt): Der Egress ist in dieser Umgebung gesperrt (CONNECT 403
// auf bmv.de UND example.com). KEIN Abrufweg ist byte-genau live verifiziert. Jeder neue Weg ist
// `needs_review` und traegt `verifikation: "unverifiziert_egress_gesperrt"`. Es werden KEINE
// Feed-/API-URLs erfunden: die einzige benutzte Methode ist `googlenews_search` (deterministische
// site:/Themen-Suche ueber den bestehenden Aggregator-Weg) — exakt das Muster, das im Landesmodul
// (Sprint 9B) die unverifizierbaren Direktfeeds ersetzt hat. Konkrete Publikations-/Berichtsreihen
// sind je Weg als `publikationsreihe` + `note` dokumentiert (Publikationsort), NICHT als geratener
// Endpunkt modelliert.

// --- Paketdefinition (prepared, thematisch, Bundesebene) --------------------
const PACKAGE = Object.freeze({
  id: "pkg-verkehr-infrastruktur-bund",
  key: "verkehr-infrastruktur-bund",
  name: "Verkehr & Infrastruktur (Bund)",
  purpose:
    "Politikfeldpaket Verkehr & Infrastruktur auf Bundesebene (Ministerium, nachgeordnete " +
    "Behoerden, Bundesunternehmen, Sicherheits-/Aufsichts- und Forschungsstellen, Statistik, " +
    "Verbaende). Fachthema, NICHT Region. Struktur vorbereitet — Quellen folgen nach byte-genauer " +
    "Verifikation + Freigabe.",
  status: "prepared",
  is_base: false,
  political_level: "bund",
  geography_id: "geo-bund",
  required_classes: [
    "strategische_planung", "schieneninfrastruktur", "strasseninfrastruktur", "wasserstrassen",
    "luftverkehr_sicherheit", "verkehrssicherheit", "statistik", "klima_umwelt",
    "parlament", "wissenschaft", "verbaende"
  ]
});

// --- Bestehende Herausgeber/Entitaeten, die referenziert (NICHT dupliziert) werden ----------
const REUSE_PUBLISHERS = Object.freeze({
  "news.google.com": "aggregator-google-news",
  "destatis.de": "publisher-destatis.de",
  "bdi.eu": "publisher-bdi.eu"
});
const REUSE_ENTITIES = Object.freeze([
  "statoffice-destatis", "association-bdi", "committee-bt-verkehr",
  "parliament-bundestag", "parliament-bundesrat", "government-bund"
]);
// Bestehender Abrufweg, den das Paket wiederverwendet (kein paralleler Weg):
const REUSE_PATHS = Object.freeze(["rp-committee-verkehr"]);

// --- Neu benoetigte politische Entitaeten (nur solche, die NICHT bereits in entities.js stehen) ---
// entity_type strikt aus dem DB-CHECK: ministry/authority/statistical_office/association/
// other_institution/... (kein "company" im Enum -> Bundesunternehmen als other_institution).
const NEUE_ENTITAETEN = [
  { id: "ministry-bmv", entity_type: "ministry", name: "Bundesministerium für Verkehr", canonical_key: "verkehr", level: "bund", geography_id: "geo-bund", aliases: ["BMV", "BMDV", "BMVI", "Bundesministerium für Digitales und Verkehr", "Verkehrsministerium"] },
  { id: "company-db-infrago", entity_type: "other_institution", name: "DB InfraGO AG", canonical_key: "db-infrago", level: "bund", geography_id: "geo-bund", aliases: ["DB InfraGO", "InfraGO", "DB Netz", "DB Station&Service"] },
  { id: "company-autobahn-gmbh", entity_type: "other_institution", name: "Autobahn GmbH des Bundes", canonical_key: "autobahn-gmbh", level: "bund", geography_id: "geo-bund", aliases: ["Die Autobahn", "Autobahn GmbH"] },
  { id: "authority-eba", entity_type: "authority", name: "Eisenbahn-Bundesamt", canonical_key: "eba", level: "bund", geography_id: "geo-bund", aliases: ["EBA"] },
  { id: "authority-bast", entity_type: "authority", name: "Bundesanstalt für Straßenwesen", canonical_key: "bast", level: "bund", geography_id: "geo-bund", aliases: ["BASt"] },
  { id: "authority-baw", entity_type: "authority", name: "Bundesanstalt für Wasserbau", canonical_key: "baw", level: "bund", geography_id: "geo-bund", aliases: ["BAW"] },
  { id: "authority-gdws", entity_type: "authority", name: "Generaldirektion Wasserstraßen und Schifffahrt", canonical_key: "gdws", level: "bund", geography_id: "geo-bund", aliases: ["GDWS", "WSV", "Wasserstraßen- und Schifffahrtsverwaltung des Bundes"] },
  { id: "authority-bfu", entity_type: "authority", name: "Bundesstelle für Flugunfalluntersuchung", canonical_key: "bfu", level: "bund", geography_id: "geo-bund", aliases: ["BFU"] },
  { id: "authority-dzsf", entity_type: "authority", name: "Deutsches Zentrum für Schienenverkehrsforschung", canonical_key: "dzsf", level: "bund", geography_id: "geo-bund", aliases: ["DZSF"] },
  { id: "authority-kba", entity_type: "authority", name: "Kraftfahrt-Bundesamt", canonical_key: "kba", level: "bund", geography_id: "geo-bund", aliases: ["KBA"] },
  { id: "authority-uba", entity_type: "authority", name: "Umweltbundesamt", canonical_key: "uba", level: "bund", geography_id: "geo-bund", aliases: ["UBA"] },
  { id: "authority-balm", entity_type: "authority", name: "Bundesamt für Logistik und Mobilität", canonical_key: "balm", level: "bund", geography_id: "geo-bund", aliases: ["BALM", "BAG", "Bundesamt für Güterverkehr"] },
  { id: "institute-dlr-vf", entity_type: "other_institution", name: "DLR — Institut für Verkehrsforschung", canonical_key: "dlr-verkehrsforschung", level: "bund", geography_id: "geo-bund", aliases: ["DLR", "Deutsches Zentrum für Luft- und Raumfahrt"] },
  { id: "institute-diw", entity_type: "other_institution", name: "DIW Berlin", canonical_key: "diw", level: "bund", geography_id: "geo-bund", aliases: ["DIW", "Deutsches Institut für Wirtschaftsforschung"] },
  { id: "association-vdv", entity_type: "association", name: "Verband Deutscher Verkehrsunternehmen", canonical_key: "vdv", level: "bund", geography_id: "geo-bund", aliases: ["VDV"] },
  { id: "association-allianz-pro-schiene", entity_type: "association", name: "Allianz pro Schiene", canonical_key: "allianz-pro-schiene", level: "bund", geography_id: "geo-bund", aliases: ["Allianz pro Schiene"] },
  { id: "association-adac", entity_type: "association", name: "ADAC", canonical_key: "adac", level: "bund", geography_id: "geo-bund", aliases: ["ADAC", "Allgemeiner Deutscher Automobil-Club"] },
  { id: "association-staedtetag", entity_type: "association", name: "Deutscher Städtetag", canonical_key: "staedtetag", level: "bund", geography_id: "geo-bund", aliases: ["Deutscher Städtetag"] }
];

// --- Herausgeber-Metadaten je Domain (kanonischer Name + Typ + verknuepfte Entitaet) --------
// Nur NEUE Herausgeber; die drei REUSE_PUBLISHERS werden referenziert, nicht hier dupliziert.
const PUBLISHER_META = {
  "bmv.de": { name: "Bundesministerium für Verkehr", type: "ministry", entity_id: "ministry-bmv" },
  "mobilitaet-in-deutschland.de": { name: "Mobilität in Deutschland (BMV/DLR)", type: "ministry", entity_id: "ministry-bmv" },
  "deutschebahn.com": { name: "DB InfraGO AG", type: "company", entity_id: "company-db-infrago" },
  "autobahn.de": { name: "Autobahn GmbH des Bundes", type: "company", entity_id: "company-autobahn-gmbh" },
  "eba.bund.de": { name: "Eisenbahn-Bundesamt", type: "authority", entity_id: "authority-eba" },
  "bast.de": { name: "Bundesanstalt für Straßenwesen", type: "authority", entity_id: "authority-bast" },
  "baw.de": { name: "Bundesanstalt für Wasserbau", type: "authority", entity_id: "authority-baw" },
  "gdws.wsv.bund.de": { name: "Generaldirektion Wasserstraßen und Schifffahrt", type: "authority", entity_id: "authority-gdws" },
  "bfu-web.de": { name: "Bundesstelle für Flugunfalluntersuchung", type: "authority", entity_id: "authority-bfu" },
  "dzsf.bund.de": { name: "Deutsches Zentrum für Schienenverkehrsforschung", type: "authority", entity_id: "authority-dzsf" },
  "kba.de": { name: "Kraftfahrt-Bundesamt", type: "authority", entity_id: "authority-kba" },
  "umweltbundesamt.de": { name: "Umweltbundesamt", type: "authority", entity_id: "authority-uba" },
  "balm.bund.de": { name: "Bundesamt für Logistik und Mobilität", type: "authority", entity_id: "authority-balm" },
  "dlr.de": { name: "DLR — Institut für Verkehrsforschung", type: "research_institute", entity_id: "institute-dlr-vf" },
  "diw.de": { name: "DIW Berlin", type: "research_institute", entity_id: "institute-diw" },
  "vdv.de": { name: "Verband Deutscher Verkehrsunternehmen", type: "association", entity_id: "association-vdv" },
  "allianz-pro-schiene.de": { name: "Allianz pro Schiene", type: "association", entity_id: "association-allianz-pro-schiene" },
  "adac.de": { name: "ADAC", type: "association", entity_id: "association-adac" },
  "staedtetag.de": { name: "Deutscher Städtetag", type: "association", entity_id: "association-staedtetag" }
};

// --- Frequenzklassen (Auftrag §6) -------------------------------------------
// ereignisnah : laufende Presse-/Nachrichtenbeobachtung (kontinuierlich, kein festes Intervall)
// regelmaessig: wiederkehrende Berichte/Statistiken mit festem Takt (monatlich..jaehrlich)
// periodisch  : Langzyklus-Strategiedokumente (mehrjaehrig)
// expected_frequency mappt die Klasse auf den DB-Textwert (daily/monthly/yearly/multi_year).
const FREQ_TO_EXPECTED = Object.freeze({
  ereignisnah: "daily",
  regelmaessig: "monthly",
  periodisch: "multi_year"
});

// --- Kernkandidaten (fachliche Zielarchitektur -> technische Wege) ----------
// Felder je Kandidat:
//   slug           : stabiler eindeutiger Kurzschluessel (bildet rp-vib-<slug> / legacy vib-<slug>)
//   klasse         : abgedeckte Funktions-/Traegerklasse (Paket-required_class)
//   publisher      : Anzeigename Herausgeber (informativ)
//   domain         : kanonische Herausgeber-Domain (Dedup-Schluessel; steuert Publisher-Wahl)
//   entityId       : verknuepfte politische Entitaet (neu ODER wiederverwendet)
//   siteQuery      : Google-News-Suchdefinition (site:… ODER Themensuche). KEINE erfundenen Feeds.
//   evidenceRole   : official_primary | direct_interest | journalistic | data_source | aggregator
//   frequenz       : ereignisnah | regelmaessig | periodisch (Auftrag §6)
//   publikationsreihe: benannte Berichts-/Publikationsreihe (Publikationsort, informativ)
//   recommendation : empfohlen | mit_einschraenkung
//   note           : fachliche/technische Anmerkung, Dedup-/Einschraenkungs-/Korrekturhinweise
const KANDIDATEN = [
  // ---------------- Strategische Planung / Ministerium (BMV) ----------------
  { slug: "bmv-presse", klasse: "strategische_planung", publisher: "Bundesministerium für Verkehr", domain: "bmv.de", entityId: "ministry-bmv",
    siteQuery: "site:bmv.de", evidenceRole: "official_primary", frequenz: "ereignisnah",
    publikationsreihe: "Pressemitteilungen / Ministeriumsnachrichten (bmv.de)", recommendation: "empfohlen",
    note: "Aktuelle Ministeriumsstruktur (Auftrag §3 BMV): seit Regierungsbildung 2025 heisst das Verkehrsressort 'Bundesministerium für Verkehr' (BMV, Domain bmv.de); Digitales ist ins BMDS ausgegliedert. Aliase BMDV/BMVI bleiben verknuepft (bmdv.bund.de/bmvi.de leiten weiter). Bestehende Repository-Eintraege: bmdv.bund.de steht in sourceSafety-Trust-Liste; KEIN bestehender BMV-Herausgeber/-Entitaet im Katalog -> neu, keine Dublette." },
  { slug: "bvwp", klasse: "strategische_planung", publisher: "Bundesministerium für Verkehr", domain: "bmv.de", entityId: "ministry-bmv",
    siteQuery: "Bundesverkehrswegeplan", evidenceRole: "official_primary", frequenz: "periodisch",
    publikationsreihe: "Bundesverkehrswegeplan 2030 (Gesamtplan)", recommendation: "empfohlen",
    note: "Wichtigstes Planungsinstrument, Fortschreibung alle 10–15 Jahre (aktuell BVWP 2030, Stand 2016) -> periodisch. Projektinformationssystem PRINS (bvwp-projekte.de) ist eine HTML/PDF-Projektdatenbank OHNE Feed -> als Future Target gefuehrt, NICHT als geratener Endpunkt modelliert." },
  { slug: "irp", klasse: "strategische_planung", publisher: "Bundesministerium für Verkehr", domain: "bmv.de", entityId: "ministry-bmv",
    siteQuery: "Investitionsrahmenplan Verkehr", evidenceRole: "official_primary", frequenz: "periodisch",
    publikationsreihe: "Investitionsrahmenplan (IRP) für die Verkehrsinfrastruktur des Bundes", recommendation: "empfohlen",
    note: "Mittelfristige Investitionsplanung, ~fuenfjaehrige Fortschreibung -> periodisch." },
  { slug: "mid", klasse: "statistik", publisher: "Mobilität in Deutschland (BMV/DLR)", domain: "mobilitaet-in-deutschland.de", entityId: "ministry-bmv",
    siteQuery: "site:mobilitaet-in-deutschland.de", evidenceRole: "official_primary", frequenz: "periodisch",
    publikationsreihe: "Mobilität in Deutschland (MiD)", recommendation: "empfohlen",
    note: "Herausgeber BMV, Durchfuehrung DLR/infas; Erhebung im ~5-Jahres-Takt (MiD 2002/2008/2017/2023) -> periodisch. Eigener Herausgeber (Domain), Entitaet aber = ministry-bmv (BMV ist Herausgeber; Praezedenz: statistik.arbeitsagentur.de -> authority-bundesagentur-arbeit)." },

  // ---------------- Schieneninfrastruktur ----------------
  { slug: "db-infrago", klasse: "schieneninfrastruktur", publisher: "DB InfraGO AG", domain: "deutschebahn.com", entityId: "company-db-infrago",
    siteQuery: "DB InfraGO Infrastruktur Schienennetz", evidenceRole: "direct_interest", frequenz: "regelmaessig",
    publikationsreihe: "Infrastrukturzustands- und -entwicklungsbericht (IZB, jaehrlich, LuFV) · Integrierter Bericht/Geschaeftsbericht", recommendation: "empfohlen",
    note: "Kritische DB-InfraGO-Pruefung (Auftrag §3): DAUERHAFT OEFFENTLICH sind der LuFV-Infrastrukturzustands- und -entwicklungsbericht (jaehrlich) und der Integrierte/Geschaeftsbericht (jaehrlich) -> regelmaessig. NICHT dauerhaft/oeffentlich abrufbar sind interne Netzzustandsberichte, Aufsichtsrats- und Detail-Zustandsdaten -> als Future Target gefuehrt, NICHT modelliert (Auftrag: keine internen Dokumente). DB InfraGO AG entstand 01.01.2024 aus DB Netz + DB Station&Service (Aliase gepflegt)." },
  { slug: "eba", klasse: "verkehrssicherheit", publisher: "Eisenbahn-Bundesamt", domain: "eba.bund.de", entityId: "authority-eba",
    siteQuery: "site:eba.bund.de", evidenceRole: "official_primary", frequenz: "regelmaessig",
    publikationsreihe: "Jahresbericht · Sicherheitsbericht (EU-RL 2016/798)", recommendation: "empfohlen",
    note: "Zentrale Eisenbahn-Sicherheits-/Aufsichtsbehoerde; Jahres- und Sicherheitsbericht jaehrlich -> regelmaessig. Kritische Primaerquelle." },
  { slug: "dzsf", klasse: "wissenschaft", publisher: "Deutsches Zentrum für Schienenverkehrsforschung", domain: "dzsf.bund.de", entityId: "authority-dzsf",
    siteQuery: "site:dzsf.bund.de", evidenceRole: "data_source", frequenz: "regelmaessig",
    publikationsreihe: "Forschungsberichte des DZSF", recommendation: "empfohlen",
    note: "Ressortforschung Schiene beim EBA; junge Einrichtung (2020) -> Publikationsdichte noch zu beobachten (offene Unsicherheit). Forschungsberichte erscheinen laufend -> regelmaessig." },

  // ---------------- Strasseninfrastruktur ----------------
  { slug: "autobahn", klasse: "strasseninfrastruktur", publisher: "Autobahn GmbH des Bundes", domain: "autobahn.de", entityId: "company-autobahn-gmbh",
    siteQuery: "site:autobahn.de", evidenceRole: "direct_interest", frequenz: "ereignisnah",
    publikationsreihe: "Presse / Bau- und Investitionsprogramm (laufend); Nachhaltigkeitsbericht (jaehrlich, NEBENquelle)", recommendation: "empfohlen",
    note: "Kritische Autobahn-Pruefung (Auftrag §3): Fuer KONTINUIERLICHE politische Beobachtung eignet sich die laufende Presse-/Bauprogramm-Berichterstattung (ereignisnah), NICHT primaer der Nachhaltigkeitsbericht — dieser ist eine jaehrliche NEBENquelle (periodisch), bewusst NICHT als Hauptquelle uebernommen." },
  { slug: "bast", klasse: "verkehrssicherheit", publisher: "Bundesanstalt für Straßenwesen", domain: "bast.de", entityId: "authority-bast",
    siteQuery: "site:bast.de", evidenceRole: "data_source", frequenz: "regelmaessig",
    publikationsreihe: "Berichtsreihen A–V · Regelwerke · Unfall-/Verkehrsstatistik", recommendation: "empfohlen",
    note: "Technisch-wissenschaftliche Bundesoberbehoerde Strassenwesen; Berichte laufend, Unfallstatistik jaehrlich -> regelmaessig." },

  // ---------------- Wasserstrassen ----------------
  { slug: "gdws", klasse: "wasserstrassen", publisher: "Generaldirektion Wasserstraßen und Schifffahrt", domain: "gdws.wsv.bund.de", entityId: "authority-gdws",
    siteQuery: "site:gdws.wsv.bund.de", evidenceRole: "official_primary", frequenz: "regelmaessig",
    publikationsreihe: "Verkehrsbericht · Publikationen der WSV", recommendation: "empfohlen",
    note: "Oberste Verwaltungsbehoerde der Wasserstrassen-/Schifffahrtsverwaltung (WSV); Verkehrsbericht jaehrlich -> regelmaessig." },
  { slug: "baw", klasse: "wasserstrassen", publisher: "Bundesanstalt für Wasserbau", domain: "baw.de", entityId: "authority-baw",
    siteQuery: "site:baw.de", evidenceRole: "data_source", frequenz: "regelmaessig",
    publikationsreihe: "BAWMitteilungen · Geschaeftsbericht", recommendation: "mit_einschraenkung",
    note: "Ressortforschung Wasserbau; ergaenzend. BAWMitteilungen/Geschaeftsbericht jaehrlich -> regelmaessig." },

  // ---------------- Luftverkehr / Sicherheit ----------------
  { slug: "bfu", klasse: "luftverkehr_sicherheit", publisher: "Bundesstelle für Flugunfalluntersuchung", domain: "bfu-web.de", entityId: "authority-bfu",
    siteQuery: "site:bfu-web.de", evidenceRole: "official_primary", frequenz: "regelmaessig",
    publikationsreihe: "Bulletin (monatlich) · Untersuchungsberichte", recommendation: "empfohlen",
    note: "Unabhaengige Flugunfall-Untersuchungsstelle des Bundes; Bulletin monatlich, Untersuchungsberichte ereignisgetrieben -> regelmaessig (fester monatlicher Grundtakt). Kritische Primaerquelle." },

  // ---------------- Statistik ----------------
  { slug: "destatis-verkehr", klasse: "statistik", publisher: "Statistisches Bundesamt", domain: "destatis.de", entityId: "statoffice-destatis",
    siteQuery: "Statistisches Bundesamt Verkehr", evidenceRole: "data_source", frequenz: "regelmaessig",
    publikationsreihe: "Fachserie 8 Verkehr · Verkehrsinfrastruktur-Statistiken", recommendation: "empfohlen",
    note: "WIEDERVERWENDUNG (Auftrag §3 Destatis): Herausgeber publisher-destatis.de + Entitaet statoffice-destatis bestehen bereits -> KEINE neue Zeile, nur thematischer Weg + Paket-Link. Buendelt mehrere Verkehrs-Reihen ueber die bestehende Struktur. Monatlich/jaehrlich -> regelmaessig." },
  { slug: "kba", klasse: "statistik", publisher: "Kraftfahrt-Bundesamt", domain: "kba.de", entityId: "authority-kba",
    siteQuery: "site:kba.de", evidenceRole: "data_source", frequenz: "regelmaessig",
    publikationsreihe: "Fahrzeugzulassungen · Fahrzeugbestand · Neuzulassungen (KBA-eigen)", recommendation: "empfohlen",
    note: "Kritische KBA-Pruefung (Auftrag §3): modelliert werden NUR die KBA-EIGENEN Statistiken (Zulassungen/Bestand, monatlich -> regelmaessig). 'Verkehr in Zahlen' ist KEINE KBA-Herausgeberschaft: Herausgeber ist das BMV (Bearbeitung DLR); KBA war lediglich Vertrieb. Daher NICHT dem KBA zugeordnet -> keine falsche Zuordnung uebernommen." },

  // ---------------- Klima / Umwelt ----------------
  { slug: "uba", klasse: "klima_umwelt", publisher: "Umweltbundesamt", domain: "umweltbundesamt.de", entityId: "authority-uba",
    siteQuery: "Umweltbundesamt Verkehr", evidenceRole: "data_source", frequenz: "regelmaessig",
    publikationsreihe: "Verkehr & Klima-Studien · Emissionsdaten (TREMOD)", recommendation: "empfohlen",
    note: "Behoerde mit breiter Verkehr-&-Klima-Berichterstattung; laufend/jaehrlich -> regelmaessig." },

  // ---------------- Gueterverkehr / Logistik ----------------
  { slug: "balm", klasse: "strasseninfrastruktur", publisher: "Bundesamt für Logistik und Mobilität", domain: "balm.bund.de", entityId: "authority-balm",
    siteQuery: "site:balm.bund.de", evidenceRole: "data_source", frequenz: "regelmaessig",
    publikationsreihe: "Gueterverkehrsstatistik · Marktbeobachtung", recommendation: "mit_einschraenkung",
    note: "Kritische BAG/BALM-Pruefung (Auftrag §3): Das Bundesamt fuer Gueterverkehr (BAG) wurde am 01.01.2023 in Bundesamt fuer Logistik und Mobilitaet (BALM, balm.bund.de) umbenannt. Es wird NUR die AKTUELLE Behoerde modelliert; 'BAG'/'Bundesamt fuer Gueterverkehr' bleiben als Aliase erhalten -> KEINE doppelte Modellierung von historischer und aktueller Behoerde." },

  // ---------------- Wissenschaft ----------------
  { slug: "dlr-vf", klasse: "wissenschaft", publisher: "DLR — Institut für Verkehrsforschung", domain: "dlr.de", entityId: "institute-dlr-vf",
    siteQuery: "DLR Verkehrsforschung Mobilität", evidenceRole: "data_source", frequenz: "regelmaessig",
    publikationsreihe: "Wissenschaftliche Publikationen · MiD-Methodenbericht", recommendation: "mit_einschraenkung",
    note: "Forschungseinrichtung (keine Primaerquelle i.e.S., Bundesebene teilweise); laufende Publikationen -> regelmaessig." },
  { slug: "diw", klasse: "wissenschaft", publisher: "DIW Berlin", domain: "diw.de", entityId: "institute-diw",
    siteQuery: "DIW Berlin Verkehr Infrastruktur", evidenceRole: "data_source", frequenz: "regelmaessig",
    publikationsreihe: "Verkehrspolitik-Studien", recommendation: "mit_einschraenkung",
    note: "Wirtschaftsforschung, ergaenzend; Studien laufend -> regelmaessig." },

  // ---------------- Verbaende / Interessenvertretung ----------------
  { slug: "vdv", klasse: "verbaende", publisher: "Verband Deutscher Verkehrsunternehmen", domain: "vdv.de", entityId: "association-vdv",
    siteQuery: "site:vdv.de", evidenceRole: "direct_interest", frequenz: "ereignisnah",
    publikationsreihe: "Positionspapiere · Politikbrief", recommendation: "mit_einschraenkung",
    note: "OEPNV-/Schienen-Branchenverband; laufende Positionierung -> ereignisnah. Einschraenkung: einige Publikationen mitgliederexklusiv (offene Unsicherheit)." },
  { slug: "allianz-pro-schiene", klasse: "verbaende", publisher: "Allianz pro Schiene", domain: "allianz-pro-schiene.de", entityId: "association-allianz-pro-schiene",
    siteQuery: "site:allianz-pro-schiene.de", evidenceRole: "direct_interest", frequenz: "ereignisnah",
    publikationsreihe: "Positionspapiere · Studien", recommendation: "mit_einschraenkung",
    note: "Schienen-Buendnis; laufende Positionierung -> ereignisnah. Interessenvertretung (Eigeninteresse)." },
  { slug: "adac", klasse: "verbaende", publisher: "ADAC", domain: "adac.de", entityId: "association-adac",
    siteQuery: "ADAC Verkehrspolitik Mobilität", evidenceRole: "direct_interest", frequenz: "ereignisnah",
    publikationsreihe: "Mobilitätsindex · Positionspapiere", recommendation: "mit_einschraenkung",
    note: "Automobil-/Mobilitaetsverband; laufende Positionierung -> ereignisnah. Themenfilter noetig (adac.de traegt viel Nicht-Politisches)." },
  { slug: "staedtetag", klasse: "verbaende", publisher: "Deutscher Städtetag", domain: "staedtetag.de", entityId: "association-staedtetag",
    siteQuery: "Deutscher Städtetag Verkehr Mobilität", evidenceRole: "direct_interest", frequenz: "ereignisnah",
    publikationsreihe: "Positionspapiere Verkehrswende / urbane Mobilität", recommendation: "mit_einschraenkung",
    note: "Kommunaler Spitzenverband; laufende Positionierung -> ereignisnah." },
  { slug: "bdi", klasse: "verbaende", publisher: "Bundesverband der Deutschen Industrie", domain: "bdi.eu", entityId: "association-bdi",
    siteQuery: "BDI Verkehr Infrastruktur Mobilität", evidenceRole: "direct_interest", frequenz: "ereignisnah",
    publikationsreihe: "Strategiepapiere · Stellungnahmen (Verkehr/Infrastruktur)", recommendation: "mit_einschraenkung",
    note: "WIEDERVERWENDUNG: Herausgeber publisher-bdi.eu + Entitaet association-bdi bestehen bereits -> KEINE neue Zeile, nur thematischer Weg + Paket-Link." }
];

// --- Future Targets (bewusst NICHT als Abrufweg modelliert) -----------------
const FUTURE_TARGETS = [
  { name: "PRINS — Projektinformationssystem BVWP (bvwp-projekte.de)", grund: "HTML/PDF-Projektdatenbank ohne Feed/API -> kein Retrieval Path ohne erfundenen Endpunkt. Erschliessung erst nach Struktur-/Scrape-Pruefung." },
  { name: "DB InfraGO interne Netzzustandsberichte / Aufsichtsratsunterlagen", grund: "Nicht dauerhaft oeffentlich abrufbar; ggf. nur ueber parlamentarische Anfragen. Auftrag: keine internen Dokumente modellieren." },
  { name: "Bundesfachstelle Barrierefreiheit", grund: "Deep-Research Future Target; fachlich sinnvoll, aber nicht Teil des Kernbestands dieses Sprints." },
  { name: "Expertennetzwerk / Forschungsinformationssystem des BMV (FIS)", grund: "Ressortforschungs-Aggregatoren; Erschliessung nach eigener Struktur-Pruefung." },
  { name: "Publikationsplattform der Bundesregierung", grund: "Deep-Research Future Target; breite Plattform, Abgrenzung/Filter noch offen." }
];

// --- Ausdruecklich abgelehnte Kandidaten (Deep-Research-Ausschluss) ----------
const ABGELEHNTE_KANDIDATEN = [
  { kandidat: "Wikipedia (BVWP etc.)", grund: "Keine Primaerquelle; fuer politische Arbeit nicht belastbar." },
  { kandidat: "Allgemeine Nachrichtenportale (Tagesschau etc.) als eigener Verkehrs-Weg", grund: "Keine Primaerquellen; bereits durch Behoerdenpublikationen + Bund-Basis-Leitmedien abgedeckt." },
  { kandidat: "Kommerzielle Fachverlage (z. B. NW-Verlag)", grund: "Vertreiben BASt-Publikationen; Primaerquelle ist die BASt selbst." },
  { kandidat: "Soziale Medien (LinkedIn etc.)", grund: "Keine belastbaren Quellen fuer politische Entscheidungen." },
  { kandidat: "'Verkehr in Zahlen' als KBA-Herausgeberschaft", grund: "Herausgeber ist das BMV (Bearbeitung DLR); KBA war nur Vertrieb -> keine falsche Zuordnung." }
];

// --- Reine Helfer -----------------------------------------------------------

function slug(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, ""); }

// Google-News-RSS-Such-URL aus einer Suchdefinition (site:… oder Themensuche). Deterministisch.
function googleNewsUrl(query) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=de&gl=DE&ceid=DE:de`;
}

// Herausgeber-Id fuer eine Domain: bestehende wiederverwenden, sonst neu (publisher-<domain>).
function publisherIdForDomain(domain) {
  if (REUSE_PUBLISHERS[domain]) return REUSE_PUBLISHERS[domain];
  return `publisher-${slug(domain)}`;
}

// evidence_role -> is_critical: nur amtliche Primaerquellen sind kritisch (nie still archivieren).
function isCritical(evidenceRole) { return evidenceRole === "official_primary"; }

// Baut das vorbereitete In-Memory-Abbild des Pakets (dedup-/wiederverwendungsbewusst).
function buildVerkehrSeed() {
  const publishers = new Map();          // publisher_id -> publisher (NUR neue)
  const retrievalPaths = [];
  const packagePaths = [];
  const pathExpectedLevels = [];
  const pathExpectedGeographies = [];
  const pathExpectedEntities = [];
  const pathExpectedTopics = [];
  const seenPkgPath = new Set();
  const seenPathId = new Set();

  function ensurePublisher(domain) {
    const id = publisherIdForDomain(domain);
    if (REUSE_PUBLISHERS[domain]) return id;          // bestehend -> nicht neu anlegen
    if (!publishers.has(id)) {
      const meta = PUBLISHER_META[domain] || { name: domain, type: "other", entity_id: null };
      publishers.set(id, {
        id, name: meta.name, canonical_domain: domain, publisher_type: meta.type,
        evidence_role: null, // wird unten aus dem (staerksten) Weg gesetzt
        trust: "unbekannt", lifecycle_status: "active", entity_id: meta.entity_id || null,
        prepared: true
      });
    }
    return id;
  }

  function linkPackage(pathId) {
    const key = `${PACKAGE.id}|${pathId}`;
    if (!seenPkgPath.has(key)) { seenPkgPath.add(key); packagePaths.push({ package_id: PACKAGE.id, retrieval_path_id: pathId }); }
  }

  for (const c of KANDIDATEN) {
    const publisherId = ensurePublisher(c.domain);
    const legacy = `vib-${slug(c.slug)}`;
    const pathId = `rp-${legacy}`;
    if (seenPathId.has(pathId)) throw new Error(`Doppelter slug/pathId: ${pathId} (slugs muessen eindeutig sein)`);
    seenPathId.add(pathId);

    retrievalPaths.push({
      id: pathId,
      publisher_id: publisherId,
      legacy_source_id: legacy,
      name: `${c.publisher} — ${c.klasse}`,
      method: "googlenews_search",
      url: googleNewsUrl(c.siteQuery),
      query: c.siteQuery,
      parser: "googlenews-batchexecute",
      expected_frequency: FREQ_TO_EXPECTED[c.frequenz] || null,
      priority: 60,
      status: "needs_review",       // VORBEREITET — nie healthy
      activation_mode: "manual",    // VORBEREITET — nie auto/always_on -> kein Auto-Crawl
      is_critical: isCritical(c.evidenceRole),
      max_items: 16,
      represents_type: c.klasse,
      // informative (nicht-DB) Felder fuer Bericht/Klassifikation:
      klasse: c.klasse,
      evidenceRole: c.evidenceRole,
      frequenz: c.frequenz,
      publikationsreihe: c.publikationsreihe,
      recommendation: c.recommendation,
      verifikation: "unverifiziert_egress_gesperrt",
      note: c.note,
      reusePublisher: !!REUSE_PUBLISHERS[c.domain],
      reuseEntity: REUSE_ENTITIES.includes(c.entityId),
      prepared: true
    });

    // Herausgeber-evidence_role = staerkste Belegfunktion seiner Wege (official_primary > data_source > direct_interest).
    const pub = publishers.get(publisherId);
    if (pub) {
      const rank = { official_primary: 3, data_source: 2, journalistic: 1, direct_interest: 1, aggregator: 0 };
      if (pub.evidence_role == null || (rank[c.evidenceRole] || 0) > (rank[pub.evidence_role] || 0)) pub.evidence_role = c.evidenceRole;
    }

    linkPackage(pathId);
    pathExpectedLevels.push({ retrieval_path_id: pathId, level: "bund" });
    pathExpectedGeographies.push({ retrieval_path_id: pathId, geography_id: "geo-bund" });
    pathExpectedEntities.push({ retrieval_path_id: pathId, entity_id: c.entityId });
    pathExpectedTopics.push({ retrieval_path_id: pathId, topic: c.klasse });
  }

  // Wiederverwendete Bestandswege (kein neuer Weg; nur Paket-Link).
  for (const rid of REUSE_PATHS) linkPackage(rid);

  const retrievalPathsOut = retrievalPaths;
  const publishersOut = [...publishers.values()];
  return {
    package: PACKAGE,
    entities: NEUE_ENTITAETEN,
    publishers: publishersOut,
    retrievalPaths: retrievalPathsOut,
    packagePaths,
    pathExpectedLevels,
    pathExpectedGeographies,
    pathExpectedEntities,
    pathExpectedTopics,
    reuse: { publishers: REUSE_PUBLISHERS, entities: REUSE_ENTITIES, paths: REUSE_PATHS },
    futureTargets: FUTURE_TARGETS,
    abgelehnt: ABGELEHNTE_KANDIDATEN,
    summary: {
      status: "prepared",
      neuePublisher: publishersOut.length,
      neueEntitaeten: NEUE_ENTITAETEN.length,
      wiederverwendetePublisher: Object.keys(REUSE_PUBLISHERS).length,
      wiederverwendeteEntitaeten: REUSE_ENTITIES.length,
      wiederverwendeteWege: REUSE_PATHS.length,
      abrufwegeNeu: retrievalPathsOut.length,
      abrufwegeKritisch: retrievalPathsOut.filter((p) => p.is_critical).length,
      paketzuordnungen: packagePaths.length,
      futureTargets: FUTURE_TARGETS.length,
      frequenz: retrievalPathsOut.reduce((m, p) => { m[p.frequenz] = (m[p.frequenz] || 0) + 1; return m; }, {}),
      // technisch inaktiv: kein neuer Weg ist aktiv/auto/always_on und das Paket ist prepared.
      aktiveAbrufwege: retrievalPathsOut.filter((p) => p.status === "healthy" || p.activation_mode === "auto" || p.activation_mode === "always_on").length,
      paketAktiv: PACKAGE.status === "active"
    }
  };
}

module.exports = {
  PACKAGE, NEUE_ENTITAETEN, PUBLISHER_META, KANDIDATEN, FUTURE_TARGETS, ABGELEHNTE_KANDIDATEN,
  REUSE_PUBLISHERS, REUSE_ENTITIES, REUSE_PATHS, FREQ_TO_EXPECTED,
  googleNewsUrl, publisherIdForDomain, isCritical, buildVerkehrSeed
};
