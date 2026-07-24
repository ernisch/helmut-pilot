"use strict";

// Helmut — Quellenarchitektur · Quellenpaket "verteidigung-bund" (PREPARED / INAKTIV).
//
// REINE, DETERMINISTISCHE DATEN + REINER BUILDER. Kein Netz, keine KI, kein Storage-Write,
// KEIN Rendering, KEINE SQL-Ausfuehrung. Formt eine kleine, hochwertige Verteidigungs-
// Quellenarchitektur (Bundesebene) in das relationale Modell (source_packages / publishers /
// political_entities / retrieval_paths / package_paths / path_expected_*) — ausschliesslich
// als VORBEREITET:
//   - source_packages: status "prepared", is_base=false  -> computeGlobalActivation aktiviert NICHTS.
//   - retrieval_paths (neu): status "needs_review", activation_mode "manual" -> nie Auto-Crawl.
//   - Wiederverwendung bestehender Komponenten hat IMMER Vorrang (Auftrag §7): bestehende
//     Herausgeber (Bundestag, Bundesregierung), bestehende Entitaeten (parliament-bundestag,
//     government-bund, committee-bt-verteidigung) und der bestehende DIP-Abrufweg (rp-dip)
//     werden NUR referenziert, NICHT dupliziert und NICHT veraendert.
//
// SIGNAL STATT VOLLSTAENDIGKEIT: nicht moeglichst viele Quellen, sondern die richtigen. Ziel
// sind 6 Abrufwege (5 neue + 1 wiederverwendeter DIP-Weg). Ein dritter BMVg-Weg (Personal/
// Einsatzbereitschaft) entsteht NICHT — er waere ohne verifizierbar getrennte URL-Struktur eine
// kuenstliche Aufspaltung (Auftrag Korrektur 1); Personal/Einsatzbereitschaft/Reserve/Wehrdienst
// laufen im BMVg-Politik-Weg mit.
//
// KEINE ERFUNDENEN URLS/RSS/APIS (Auftrag §9): fuer amtliche Seiten ohne in dieser Umgebung
// byte-genau pruefbaren Direkt-Feed wird der stabile, real existierende Suchweg
// `googlenews_search` mit `site:`-Filter modelliert (identische Vorgehensweise wie bei den
// vorbereiteten Landesmodulen). `verifyBeforeActivation: true` markiert jeden Weg, dessen
// direkter Feed/Uebersichtsseite vor einer spaeteren Aktivierung noch byte-genau zu pruefen ist.
//
// KEINE HART CODIERTEN REFORM-/PERSONEN-/BERICHTSDETAILS (Auftrag Korrektur 5/6): keine
// Berichtsnummern, keine Jahreszahlen, keine aktuellen Minister/Staatssekretaere, keine
// konkreten Beschaffungsprogramme/Auslandseinsaetze, keine Haushaltszahlen. Nur stabile
// Uebersichts-/Themensemantik.

const PACKAGE = Object.freeze({
  id: "pkg-verteidigung-bund",
  key: "verteidigung-bund",
  name: "Verteidigung Bund",
  purpose:
    "Verteidigungs- und sicherheitspolitisches Fachpaket (Bundesebene): BMVg (Politik/Strategie/" +
    "Bundeswehr sowie Beschaffung/Ruestung), Wehrbeauftragte, oeffentliche Arbeit des " +
    "Verteidigungsausschusses, DIP (wiederverwendet) und ergaenzend die Bundesregierung. " +
    "Fachthema, NICHT Region. Auslandseinsaetze laufen ueber BMVg + DIP (kein eigener Weg).",
  status: "prepared",
  is_base: false,
  political_level: "bund",
  geography_id: "geo-bund",
  required_classes: []
});

// --- Wiederverwendete bestehende Komponenten (NUR referenziert, nie dupliziert/veraendert) ---
// Herausgeber (aus dem Bund-Basis-Seed, catalog.js/seeds/publishers.js):
//   publisher-bundestag.de       -> Entitaet parliament-bundestag  (Wehrbeauftragte + Ausschuss)
//   publisher-bundesregierung.de -> Entitaet government-bund        (Bundesregierung, Tier 2)
// Entitaeten (seeds/entities.js): parliament-bundestag, government-bund, committee-bt-verteidigung
// Abrufweg: rp-dip (DIP-API des Bundestags, bereits aktiv/always_on) -> nur Paket-Verknuepfung.
const REUSED = Object.freeze({
  publishers: ["publisher-bundestag.de", "publisher-bundesregierung.de"],
  entities: ["parliament-bundestag", "government-bund", "committee-bt-verteidigung"],
  retrievalPaths: ["rp-dip"]
});

// --- Neue Entitaeten (nur solche, die NICHT bereits in seeds/entities.js stehen) -------------
// Bundeswehr/Wehrbeauftragte sind als typisierte Institutionen "other_institution" (weder
// Ministerium noch klassische Behoerde noch Parlament). Sie tragen KEINE aktuellen Personen.
const NEUE_ENTITAETEN = [
  { id: "ministry-bmvg", entity_type: "ministry", name: "Bundesministerium der Verteidigung", canonical_key: "bmvg", level: "bund", geography_id: "geo-bund", aliases: ["BMVg", "Verteidigungsministerium"] },
  { id: "institution-bundeswehr", entity_type: "other_institution", name: "Bundeswehr", canonical_key: "bundeswehr", level: "bund", geography_id: "geo-bund", aliases: ["Streitkraefte", "Bundeswehr"] },
  { id: "institution-wehrbeauftragter", entity_type: "other_institution", name: "Wehrbeauftragte des Deutschen Bundestages", canonical_key: "wehrbeauftragter", level: "bund", geography_id: "geo-bund", aliases: ["Wehrbeauftragter", "Wehrbeauftragte"] }
];

// --- Neue Herausgeber (nur BMVg; alle uebrigen Wege haengen an bestehenden Herausgebern) -----
const NEUE_HERAUSGEBER = [
  { id: "publisher-bmvg.de", name: "Bundesministerium der Verteidigung", canonical_domain: "bmvg.de", publisher_type: "ministry", evidence_role: "official_primary", trust: "unbekannt", lifecycle_status: "active", entity_id: "ministry-bmvg" }
];

// --- Abrufweg-Kandidaten (alle NEU, alle vorbereitet/inaktiv) --------------------------------
// method: googlenews_search (stabiler realer Suchweg; keine erfundenen Feeds). Der amtliche
// Charakter bleibt ueber `site:`-Filter + erwartete Entitaeten/Themen erhalten. is_critical =
// amtliche Pflicht-Primaerquelle (nie still archivieren); Tier-2-Bundesregierung ist NICHT kritisch.
const GN = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=de&gl=DE&ceid=DE:de`;

const ABRUFWEG_KANDIDATEN = [
  {
    id: "rp-vtdg-bmvg-politik-strategie-bundeswehr",
    publisher_id: "publisher-bmvg.de",
    name: "BMVg — Politik, Strategie und Bundeswehr",
    tier: 1,
    // Politik/Strategie/Bundeswehr inkl. Personal/Einsatzbereitschaft/Reserve/Wehrdienst (kein 3. Weg).
    query: "site:bmvg.de (Verteidigungspolitik OR Sicherheitspolitik OR Strategie OR Bundeswehr OR Einsatzbereitschaft OR Personal OR Reserve OR Wehrdienst OR Einsatz)",
    evidenceRole: "official_primary",
    is_critical: true,
    topics: ["verteidigungspolitik", "sicherheitspolitik", "bundeswehr", "einsatzbereitschaft", "personal", "reserve", "wehrdienst", "auslandseinsaetze"],
    entities: ["ministry-bmvg", "institution-bundeswehr"],
    verifyBeforeActivation: true,
    note: "Kern-Politikweg des BMVg. Vor Aktivierung ist ein direkter Themen-/Newsroom-Feed von bmvg.de byte-genau zu pruefen; die BMVg-Organisationsreform beruehrt die Domain, nicht diese Themensemantik."
  },
  {
    id: "rp-vtdg-bmvg-beschaffung-ruestung",
    publisher_id: "publisher-bmvg.de",
    name: "BMVg — Beschaffung und Ruestung",
    tier: 1,
    query: "site:bmvg.de (Beschaffung OR Ruestung OR Ausruestung OR Ruestungsprojekt OR Vergabe OR Innovation)",
    evidenceRole: "official_primary",
    is_critical: true,
    topics: ["beschaffung", "ruestung", "ausruestung", "innovation"],
    entities: ["ministry-bmvg"],
    verifyBeforeActivation: true,
    note: "Zweiter BMVg-Weg — eigenstaendiger Beschaffungs-/Ruestungs-Signalwert (Ruestungsbericht, Grossprojekte, Vergaben). Keine konkreten Programme hart codiert."
  },
  {
    id: "rp-vtdg-wehrbeauftragter",
    publisher_id: "publisher-bundestag.de",
    name: "Wehrbeauftragte des Deutschen Bundestages",
    tier: 1,
    // Buendelt Jahres-/Sonderberichte, Pressemitteilungen, strukturelle/parlamentsrelevante
    // Stellungnahmen. KEINE Truppenbesuche/repraesentative Termine, KEINE Einzel-PDFs, KEINE
    // Berichtsnummern/Jahre. Nur die stabile Uebersichtssemantik.
    query: "site:bundestag.de Wehrbeauftragter (Jahresbericht OR Bericht OR Stellungnahme OR Bundeswehr OR Soldaten)",
    evidenceRole: "official_primary",
    is_critical: true,
    topics: ["wehrbeauftragte", "parlamentarische-kontrolle", "bundeswehr", "innere-fuehrung"],
    entities: ["institution-wehrbeauftragter", "institution-bundeswehr"],
    verifyBeforeActivation: true,
    note: "Gebuendelter Weg (kein Einzel-PDF, keine Berichtsnummer/Jahr). Haengt am bestehenden Herausgeber publisher-bundestag.de; erwartete Entitaet ist der neue Wehrbeauftragte."
  },
  {
    id: "rp-vtdg-verteidigungsausschuss",
    publisher_id: "publisher-bundestag.de",
    name: "Verteidigungsausschuss (oeffentliche Inhalte)",
    tier: 1,
    // Der Ausschuss tagt ueberwiegend NICHT-oeffentlich (Auftrag Korrektur 3): nur oeffentliche
    // Inhalte modellieren — Anhoerungen, veroeffentlichte Tagesordnungen, Ausschussmitteilungen,
    // oeffentliche Stellungnahmen, veroeffentlichte Berichte. KEINE Vollbeobachtung.
    query: "site:bundestag.de Verteidigungsausschuss (Anhoerung OR Tagesordnung OR Sitzung OR Stellungnahme OR Bericht OR oeffentlich)",
    evidenceRole: "official_primary",
    is_critical: true,
    topics: ["verteidigungsausschuss", "parlamentarische-kontrolle", "anhoerung", "verteidigungspolitik"],
    entities: ["committee-bt-verteidigung"],
    verifyBeforeActivation: true,
    note: "Realistisch modelliert: NUR oeffentliche Ausschuss-Inhalte. Haengt am bestehenden Herausgeber publisher-bundestag.de; erwartete Entitaet ist der bestehende committee-bt-verteidigung."
  },
  {
    id: "rp-vtdg-bundesregierung-sicherheit",
    publisher_id: "publisher-bundesregierung.de",
    name: "Bundesregierung — Sicherheits-/Verteidigungspolitik (ergaenzend)",
    tier: 2,
    // Tier 2, nur ergaenzend (Auftrag Korrektur 2): ressortuebergreifende Sicherheitspolitik mit
    // Bundeswehrbezug. Verteidigungs-gefiltert -> KEINE Dublette zum BMVg.
    query: "site:bundesregierung.de (Verteidigung OR Sicherheitspolitik OR Bundeswehr OR Streitkraefte)",
    evidenceRole: "official_primary",
    is_critical: false,
    topics: ["sicherheitspolitik", "verteidigung", "bundeswehr"],
    entities: ["government-bund", "ministry-bmvg"],
    verifyBeforeActivation: true,
    note: "Tier 2, ergaenzend. Neuer Abrufweg an bestehendem Herausgeber publisher-bundesregierung.de; verteidigungsgefiltert, damit keine BMVg-Dublette entsteht."
  }
];

// Verworfene Quellen / Future Targets (Transparenz fuer Doku + Test; erzeugen KEINE Zeilen).
const VERWORFEN = [
  { kandidat: "BAAINBw (eigener Abrufweg)", entscheidung: "future_target", grund: "Politischer Signalwert nicht regelmaessig hoch; operative Vergaben nicht zuverlaessig filterbar; starke Ueberschneidung mit BMVg-Beschaffung. Erst aufnehmen, wenn Grossprojekte (> Schwellenwert) verlaesslich filterbar (Auftrag Korrektur 7)." },
  { kandidat: "MAD (Militaerischer Abschirmdienst)", entscheidung: "future_target", grund: "Kein etablierter regelmaessiger oeffentlicher Bericht; Kernquelle unbegruendet; Ueberschneidung mit innere-sicherheit-bund vermeiden (Auftrag Korrektur 9)." },
  { kandidat: "NATO", entscheidung: "future_target", grund: "Kein stabil filterbarer deutscher Signalwert; Struktur/Feed nicht als deutschsprachig-filterbar verifiziert (Auftrag Korrektur 8)." },
  { kandidat: "EU-Verteidigung (EDA/PESCO)", entscheidung: "future_target", grund: "Eigenstaendiger deutscher Signalwert nicht nachweisbar; Dublette zu bestehenden EU-Paketen vermeiden (Auftrag Korrektur 8)." },
  { kandidat: "BMVg — Personal/Einsatzbereitschaft als 3. Weg", entscheidung: "verworfen", grund: "Ohne verifizierbar getrennte URL-Struktur eine kuenstliche Aufspaltung; laeuft im BMVg-Politik-Weg mit (Auftrag Korrektur 1)." },
  { kandidat: "Eigener Auslandseinsatz-Abrufweg", entscheidung: "verworfen", grund: "Auslandseinsaetze bleiben Bestandteil von BMVg + DIP (Auftrag §8). Kein eigener Weg." },
  { kandidat: "Bundeswehr (bundeswehr.de) als eigener Abrufweg", entscheidung: "verworfen", grund: "Truppenalltag/Standortmeldungen/Rekrutierungswerbung sind ausserhalb des Scopes; bundespolitischer Bundeswehr-Signalwert ist ueber den BMVg-Politik-Weg abgedeckt. Bundeswehr bleibt als erwartete Entitaet erhalten, nicht als eigener Herausgeber-Weg." },
  { kandidat: "Berichte als Einzel-Retrieval-Paths (Ruestungsbericht/Einsatzbereitschaft/Personal)", entscheidung: "verworfen", grund: "Keine Berichtsnummern/Jahre/Rhythmen hart codieren (Auftrag Korrektur 5); die Berichtsreihen laufen ueber die stabilen BMVg-/Wehrbeauftragten-Wege." }
];

function methodToParser(method) {
  return method === "googlenews_search" ? "googlenews-batchexecute"
    : method === "rss" ? "rss-regex"
    : method === "structured_download" ? "pardok-xml"
    : method === "api" ? "dip-json"
    : method === "html" ? "html-scrape" : null;
}

// Baut das vorbereitete In-Memory-Abbild. Deterministisch, idempotent (stabile Reihenfolge/IDs).
function buildVerteidigungBundSeed() {
  const retrievalPaths = [];
  const packagePaths = [];
  const pathExpectedLevels = [];
  const pathExpectedGeographies = [];
  const pathExpectedTopics = [];
  const pathExpectedEntities = [];

  for (const c of ABRUFWEG_KANDIDATEN) {
    const url = GN(c.query);
    retrievalPaths.push({
      id: c.id,
      publisher_id: c.publisher_id,
      legacy_source_id: null,      // brandneue vorbereitete Quelle -> keine Legacy-Bruecke
      name: c.name,
      method: "googlenews_search",
      url,
      query: url,
      parser: methodToParser("googlenews_search"),
      priority: 60,
      status: "needs_review",      // VORBEREITET — nie healthy/broken
      activation_mode: "manual",   // VORBEREITET — nie auto/always_on -> kein Auto-Crawl
      is_critical: !!c.is_critical,
      max_items: 16,
      tier: c.tier,
      verifyBeforeActivation: !!c.verifyBeforeActivation,
      note: c.note,
      prepared: true
    });
    packagePaths.push({ package_id: PACKAGE.id, retrieval_path_id: c.id });
    pathExpectedLevels.push({ retrieval_path_id: c.id, level: "bund" });
    pathExpectedGeographies.push({ retrieval_path_id: c.id, geography_id: "geo-bund" });
    for (const t of c.topics) pathExpectedTopics.push({ retrieval_path_id: c.id, topic: t });
    for (const e of c.entities) pathExpectedEntities.push({ retrieval_path_id: c.id, entity_id: e });
  }

  // Wiederverwendeter DIP-Abrufweg: NUR Paket-Verknuepfung (rp-dip bleibt unveraendert; keine
  // eigenen path_expected_*-Zeilen, um den geteilten Weg nicht umzuprofilieren).
  packagePaths.push({ package_id: PACKAGE.id, retrieval_path_id: "rp-dip" });

  return {
    package: { ...PACKAGE },
    entities: NEUE_ENTITAETEN,
    publishers: NEUE_HERAUSGEBER,
    retrievalPaths,
    packagePaths,
    pathExpectedLevels,
    pathExpectedGeographies,
    pathExpectedTopics,
    pathExpectedEntities,
    reused: { ...REUSED },
    rejected: VERWORFEN,
    summary: {
      status: "prepared",
      is_base: false,
      neuePakete: 1,
      neueEntitaeten: NEUE_ENTITAETEN.length,
      neueHerausgeber: NEUE_HERAUSGEBER.length,
      neueAbrufwege: retrievalPaths.length,
      wiederverwendeteAbrufwege: REUSED.retrievalPaths.length,
      abrufwegeGesamtImPaket: retrievalPaths.length + REUSED.retrievalPaths.length,
      bmvgWege: retrievalPaths.filter((p) => p.publisher_id === "publisher-bmvg.de").length,
      abrufwegeKritisch: retrievalPaths.filter((p) => p.is_critical).length,
      paketzuordnungen: packagePaths.length,
      // technisch INAKTIV: kein neuer Weg ist aktiv/auto/always_on, das Paket ist prepared.
      aktiveAbrufwege: retrievalPaths.filter((p) => p.status === "healthy" || p.activation_mode === "auto" || p.activation_mode === "always_on").length,
      futureTargets: VERWORFEN.filter((v) => v.entscheidung === "future_target").map((v) => v.kandidat)
    }
  };
}

module.exports = {
  buildVerteidigungBundSeed,
  PACKAGE,
  REUSED,
  NEUE_ENTITAETEN,
  NEUE_HERAUSGEBER,
  ABRUFWEG_KANDIDATEN,
  VERWORFEN
};
