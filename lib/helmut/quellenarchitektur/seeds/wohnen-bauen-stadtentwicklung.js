"use strict";

// Helmut — Quellenarchitektur · Pilot "wohnen-bauen-stadtentwicklung-bund":
// VORBEREITETES (technisch INAKTIVES) Bundes-Fachthemenpaket als Herausgeber /
// Abrufwege / Paketzuordnungen.
//
// REINE, DETERMINISTISCHE DATEN. Kein Netz, keine KI, kein Storage-Write, kein Rendering.
// Formt den fachlich ausgewaehlten Pflichtkern (11 offizielle Bund-Primaerquellen) in das
// relationale Modell:
//   - retrieval_paths: status "needs_review" (NIE healthy/active), activation_mode "manual"
//     (NIE auto/always_on) -> werden nie automatisch aktiviert/gecrawlt.
//   - Zuordnung ausschliesslich zum neuen Paket pkg-wohnen-bauen-stadtentwicklung-bund
//     (status "prepared" in seeds/packages.js) -> computeGlobalactivation aktiviert es NICHT.
// Damit ist das Paket strukturell vollstaendig vorbereitet, aber technisch INAKTIV. Die
// Freigabe/Aktivierung (DB-Insert) ist ein eigener, ausdruecklich freigabepflichtiger Schritt.
//
// FACHREVIEW (2026-07-24, docs/quellenarchitektur/wbsb-fachreview.md) — Aenderungen ggue.
// dem Erst-Pflichtkern des Piloten (PR #116/#117):
//   + BBSR ergaenzt (Auditor-Luecke geschlossen): bbsr-aktuelles (Wohnungsmarkt-/Stadt-/
//     Raumforschung). Aeltere BBSR-URLs lieferten 404 (stale) -> aktuelle Adresse (WebSearch
//     2026-07-24 live) + Runner-Reverifikation als Aktivierungs-Gate.
//   + destatis-genesis-api ergaenzt: strukturierter GENESIS-REST-Superset ALLER Bau-/Wohn-
//     Statistiken (ersetzt zwei HTML-Einzeltabellen; API-Key = Aktivierungsschritt).
//   + gii-toc ergaenzt: maschinenlesbarer XML-Normindex (gesetze-im-internet.de) — ersetzt die
//     im Vorsprint verworfenen gesetze-im-internet-HTML-Kandidaten durch EINE strukturierte Quelle.
//   - bundestag-bauausschuss ENTFERNT (Dedup): parlamentarische Vorgaenge sind bereits ueber
//     die amtliche DIP-API (rp-dip, always_on, bund-basis) + committee-bau-wohnen abgedeckt.
//   - destatis-baupreisindex + destatis-wohngeld ENTFERNT (Konsolidierung): als GENESIS-Superset
//     abgedeckt; als News fuer politische Lageberichte nachrangig (niedrige Freshness).
//   ~ Ziel-Retrievalmethode fuer BMWSB-Presse / BBSR / recht.bund.de = RSS (GSB-/Verkuendungs-
//     Feeds sind dokumentiert vorhanden; die konkrete Feed-URL wird am offenen Runner aufgeloest).
//
// VERIFIKATION — Ehrlichkeitsprinzip: Die Sandbox blockt Egress (curl/WebFetch 403). Bestehende
// Wege tragen das ECHTE CI-Ergebnis des Vorlaufs (Run 30079020728, 2026-07-24, HTTP 200); NEUE
// Wege sind WebSearch-recherchiert und tragen `urteil: "recherchiert_unverifiziert"` — sie werden
// vor Aktivierung auf einem Runner mit offenem Egress (scripts/wohnen-bauen-stadtentwicklung-
// verify.js) real geprueft. KEINE aus Namensmustern erfundenen URLs.
//
// DEDUP-BEWUSST: Herausgeber destatis.de/bundestag.de EXISTIEREN bereits (Alt-Katalog). destatis.de
// wird WIEDERVERWENDET (GENESIS-API + Wohnen-Tabellen). bundestag.de wird NICHT mehr referenziert
// (Bauausschuss-Weg entfernt -> Parlament via bestehender rp-dip). Neu: BMWSB/BBSR/BBR/BfJ-
// Verkuendung/gesetze-im-internet/Staedtebaufoerderung/Foerderdatenbank.

const WBSB_PACKAGE_ID = "pkg-wohnen-bauen-stadtentwicklung-bund";

// Herausgeber-Metadaten je Domain. `reuse:true` = existiert bereits (nur referenzieren,
// NICHT ueberschreiben — die Injektion in catalog.js legt ihn nicht erneut an).
const PUBLISHER_META = {
  "bmwsb.bund.de": { name: "Bundesministerium für Wohnen, Stadtentwicklung und Bauwesen", type: "ministry", evidence_role: "official_primary", trust: "hoch", entity_id: "ministry-bmwsb" },
  "bbsr.bund.de": { name: "Bundesinstitut für Bau-, Stadt- und Raumforschung", type: "authority", evidence_role: "official_primary", trust: "hoch", entity_id: "authority-bbsr" },
  "bbr.bund.de": { name: "Bundesamt für Bauwesen und Raumordnung", type: "authority", evidence_role: "official_primary", trust: "hoch", entity_id: "authority-bbr" },
  "recht.bund.de": { name: "Bundesamt für Justiz — Verkündungsplattform des Bundes", type: "authority", evidence_role: "official_primary", trust: "hoch", entity_id: "authority-bfj" },
  "gesetze-im-internet.de": { name: "Bundesamt für Justiz — Gesetze im Internet", type: "authority", evidence_role: "official_primary", trust: "hoch", entity_id: "authority-bfj" },
  "staedtebaufoerderung.info": { name: "Städtebauförderung (Bund-Länder-Programm)", type: "government", evidence_role: "official_primary", trust: "hoch", entity_id: null },
  "foerderdatenbank.de": { name: "Förderdatenbank des Bundes", type: "authority", evidence_role: "data_source", trust: "hoch", entity_id: null },
  // Wiederverwendung eines bestehenden Herausgebers (Dedup nach Domain):
  "destatis.de": { name: "Statistisches Bundesamt", type: "statistical_office", evidence_role: "data_source", trust: "hoch", entity_id: "statoffice-destatis", reuse: true }
};

// Neue politische Entitaeten, die dieses Paket benoetigt (werden in seeds/entities.js
// ergaenzt und hier nur dokumentiert; statoffice-destatis existiert bereits).
const WBSB_NEUE_ENTITAETEN = ["ministry-bmwsb", "authority-bbsr", "authority-bbr", "authority-bfj"];

// --- PFLICHTKERN: 11 fachlich ausgewaehlte Bund-Primaerquellen --------------------------
// `url`     = die real erreichte Zieladresse (bestehende Wege: finale URL nach Weiterleitung
//             aus Run 30079020728; neue Wege: WebSearch-belegte Adresse, Runner-Reverifikation
//             als Aktivierungs-Gate).
// `method`  = DB-Retrievalmethode (rss|api|html|structured_download). `ziel_methode` = die
//             FACHLICH bevorzugte Zielmethode, falls ein strukturierter Feed dokumentiert
//             existiert, dessen konkrete URL aber erst am offenen Runner aufloesbar ist.
// `verifikation` = ehrlicher Pruefzustand (echtes CI-Urteil ODER recherchiert_unverifiziert).
const PFLICHTKERN = [
  {
    key: "bmwsb-presse", domain: "bmwsb.bund.de", priority: 74,
    name: "BMWSB — Pressemitteilungen (Wohnen/Bauen/Stadtentwicklung, Bundespolitik)",
    quellenrolle: "Pressemitteilungen des zuständigen Bundesministeriums (politische Primärquelle)",
    url: "https://www.bmwsb.bund.de/DE/tools-services/presse/pressemitteilungen/pressemitteilungen_node.html",
    method: "html", parser: "html-scrape", retrieval_type: "html_liste", update_character: "laufend",
    ziel_methode: "rss", ziel_hinweis: "GSB-RSS-Feed dokumentiert vorhanden (/SiteGlobals/Functions/RSSFeed/…); konkrete nn-ID am offenen Runner aufloesen, dann html->rss umstellen.",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html;charset=utf-8", note: "Bestand (Run 30079020728): erreichbar, inhaltsreich; HTML-Scrape bis RSS-Aufloesung" }
  },
  {
    key: "bmwsb-foerderung-wohnen", domain: "bmwsb.bund.de", priority: 58,
    name: "BMWSB — Wohnraumförderung (sozialer Wohnungsbau, Förderprogramme Wohnen)",
    quellenrolle: "Förderprogramme Wohnen des Bundesbauministeriums (Ressortsicht)",
    url: "https://www.bmwsb.bund.de/DE/wohnen/foerderprogramme-bmwsb/foerderprogramme-bmwsb_node.html",
    method: "html", parser: "html-scrape", retrieval_type: "html_liste", update_character: "periodisch",
    ziel_methode: "html", ziel_hinweis: "Kein Feed; genuine HTML-Foerderprogrammliste. Ueberschneidung mit foerderdatenbank-bmwsb (neutrale Vollsicht) -> optional (C).",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html;charset=utf-8", note: "Bestand (Run 30079020728): erreichbar, inhaltsreich; HTML-Scrape" }
  },
  {
    key: "bbsr-aktuelles", domain: "bbsr.bund.de", priority: 68,
    name: "BBSR — Aktuelles/Presseinformationen (Wohnungsmarkt-, Stadt- und Raumforschung des Bundes)",
    quellenrolle: "Ressortforschung des Bundes (Wohnungs-/Immobilienmärkte, Stadtentwicklung, laufende Raumbeobachtung) — Frühindikator",
    url: "https://www.bbsr.bund.de/BBSR/DE/Aktuell/aktuell.html",
    method: "html", parser: "html-scrape", retrieval_type: "html_liste", update_character: "laufend",
    ziel_methode: "rss", ziel_hinweis: "GSB-RSS-Feed vorhanden (RSS-Hub /BBSR/DE/Service/RSS/rssnewsfeed_node.html) + IDW-Feed (idw-online.de/de/institution957). Konkrete Feed-URL am Runner aufloesen.",
    verifikation: { urteil: "recherchiert_unverifiziert", http: null, content_type: null, note: "Auditor-Luecke geschlossen. WebSearch 2026-07-24: Seite live (Vorsprint-404 war stale/umgezogen). Runner-Reverifikation der finalen URL als Aktivierungs-Gate." }
  },
  {
    key: "bbr-presse", domain: "bbr.bund.de", priority: 60,
    name: "BBR — Pressemitteilungen (Bundesbau, Raumordnung)",
    quellenrolle: "Pressemitteilungen-Suche/Liste des Bundesamtes für Bauwesen und Raumordnung (Bundesbau/Raumordnung)",
    url: "https://www.bbr.bund.de/SiteGlobals/Forms/Suche/PressemitteilungenSuche_Formular.html?nn=1368394",
    method: "html", parser: "html-scrape", retrieval_type: "html_suche", update_character: "laufend",
    ziel_methode: "rss", ziel_hinweis: "GSB-RSS-Feed vorhanden; finale URL ist ein Suchformular -> Ergebnis-Parsing bzw. RSS-Feed am Runner absichern. Behoerdenfamilie mit BBSR (Rollen getrennt: BBR=Bundesbau/Raumordnung, BBSR=Forschung).",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html;charset=utf-8", note: "Bestand (Run 30079020728): erreichbar (1 Weiterleitung -> Suchformular); HTML-Scrape" }
  },
  {
    key: "destatis-genesis-api", domain: "destatis.de", priority: 64,
    name: "Destatis — GENESIS-Online REST-API (Bau-/Wohn-/Wohngeld-/Baupreis-Zeitreihen)",
    quellenrolle: "Maschinenlesbarer Superset ALLER amtlichen Bau-/Wohnungs-Statistiken (Bautätigkeit, Baupreisindex, Mieten/Wohnkosten, Wohngeld) via strukturierter API",
    url: "https://www-genesis.destatis.de/genesisWS/rest/2020/",
    method: "api", parser: "genesis-rest-json", retrieval_type: "api", update_character: "periodisch",
    ziel_methode: "api", ziel_hinweis: "Strukturierte Ziel-API (ersetzt die HTML-Einzeltabellen baupreisindex/wohngeld). POST mit Zugangsdaten im Header -> kostenfreier GENESIS-Account/API-Token ist ein Aktivierungsschritt. api-Methode wird vom generischen Crawl ausgeschlossen (eigene Anbindung analog DIP).",
    verifikation: { urteil: "recherchiert_unverifiziert", http: null, content_type: null, note: "Dokumentierte REST-Basis (GENESIS-Webservice-Doku v5.1). Endpunkt existiert, benoetigt Registrierung/Token; Runner prueft Adressierbarkeit (401/403 = Endpunkt vorhanden, Key noetig)." }
  },
  {
    key: "destatis-bautaetigkeit", domain: "destatis.de", priority: 60,
    name: "Destatis — Bautätigkeit (Baugenehmigungen/-fertigstellungen/Bauüberhang)",
    quellenrolle: "Amtlicher Kernindikator der Wohnungsbau-Zielerreichung (Genehmigungen/Fertigstellungen) — HTML-Faktenbeleg (keyfrei) neben GENESIS",
    url: "https://www.destatis.de/DE/Themen/Branchen-Unternehmen/Bauen/Tabellen/_tabellen-innen-bautaetigkeit.html",
    method: "html", parser: "html-scrape", retrieval_type: "html_liste", update_character: "periodisch",
    ziel_methode: "api", ziel_hinweis: "Als GENESIS-Zeitreihe (destatis-genesis-api) strukturiert abrufbar; HTML bleibt keyfreier Faktenbeleg. Daten-Grounding, KEINE Lagebericht-News (Freshness niedrig).",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html;charset=utf-8", note: "Bestand (Run 30079020728): erreichbar, inhaltsreich; HTML-Scrape" }
  },
  {
    key: "destatis-wohnen-mieten", domain: "destatis.de", priority: 60,
    name: "Destatis — Wohnen (Mieten/Nettokaltmiete, Wohnkosten, Wohnsituation)",
    quellenrolle: "Amtliche Wohnungsmarkt-/Mietdaten (Grundlage mietpolitischer Bewertung) — HTML-Faktenbeleg (keyfrei) neben GENESIS",
    url: "https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Wohnen/Tabellen/_tabellen.html",
    method: "html", parser: "html-scrape", retrieval_type: "html_liste", update_character: "periodisch",
    ziel_methode: "api", ziel_hinweis: "Als GENESIS-Zeitreihe strukturiert abrufbar; HTML bleibt keyfreier Faktenbeleg. Daten-Grounding, KEINE Lagebericht-News (Freshness niedrig).",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html;charset=utf-8", note: "Bestand (Run 30079020728): erreichbar, inhaltsreich; HTML-Scrape" }
  },
  {
    key: "bgbl-teil1-liste", domain: "recht.bund.de", priority: 72,
    name: "Bundesgesetzblatt Teil I — Verkündungsliste (recht.bund.de)",
    quellenrolle: "Amtliche Verkündung neuer Bundesgesetze/-verordnungen (Baugesetzgebung) — seit 2023 ausschließlich hier",
    url: "https://www.recht.bund.de/de/bundesgesetzblatt/bgbl-1/bgbl-1_node.html",
    method: "html", parser: "html-scrape", retrieval_type: "html_liste", update_character: "laufend",
    ziel_methode: "rss", ziel_hinweis: "recht.bund.de bietet dokumentiert 3 RSS-Feeds (Teil I / Teil II / beide) mit maschinenlesbaren Metadaten neuer Verkündungen. Konkrete Teil-I-Feed-URL am Runner aufloesen, dann html->rss. (XML/REST in LegalDocML.de geplant, noch nicht live.) ELI-URLs /eli/bund/BGBl-1/… systematisch.",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html;charset=utf-8", note: "Bestand (Run 30079020728): erreichbar, inhaltsreich; RSS-Feed als Ziel dokumentiert" }
  },
  {
    key: "gii-toc", domain: "gesetze-im-internet.de", priority: 56,
    name: "Gesetze im Internet — Norm-Inhaltsübersicht (gii-toc.xml, maschinenlesbar)",
    quellenrolle: "Strukturierter XML-Index aller geltenden Bundesnormen (u. a. BauGB/BauNVO/GEG/WoFG) — Änderungserkennung ohne Einzelgesetz-Polling",
    url: "https://www.gesetze-im-internet.de/gii-toc.xml",
    method: "structured_download", parser: "gii-toc-xml", retrieval_type: "structured_xml", update_character: "laufend",
    ziel_methode: "structured_download", ziel_hinweis: "Ersetzt die im Vorsprint (Timeout) verworfenen gesetze-im-internet-HTML-Kandidaten (aktuDienst/BauGB/BauNVO/GEG) durch EINE dokumentierte, maschinenlesbare XML-Quelle (DTD /dtd/1.0/gii-toc.dtd). Referenz/Norm-Index (Freshness niedrig).",
    verifikation: { urteil: "recherchiert_unverifiziert", http: null, content_type: null, note: "Dokumentierte, exakte XML-URL (maschinenlesbar, regelmaessig aktualisiert). Runner prueft Erreichbarkeit + XML-Wohlgeformtheit (grosser Normindex)." }
  },
  {
    key: "staedtebaufoerderung-start", domain: "staedtebaufoerderung.info", priority: 62,
    name: "Städtebauförderung — Bund-Länder-Portal (Aktuelles/Programme)",
    quellenrolle: "Offizielles Portal der Städtebauförderung (Stadtentwicklung, Verwaltungsvereinbarungen, Mittelverteilung)",
    url: "https://www.staedtebaufoerderung.info/DE/Startseite/startseite_node.html",
    method: "html", parser: "html-scrape", retrieval_type: "html_liste", update_character: "laufend",
    ziel_methode: "rss", ziel_hinweis: "GSB-Portal -> RSS-Feed moeglich; am Runner pruefen. Sonst HTML (kein bestaetigter Feed).",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html;charset=utf-8", note: "Bestand (Run 30079020728): erreichbar, inhaltsreich; HTML-Scrape" }
  },
  {
    key: "foerderdatenbank-bmwsb", domain: "foerderdatenbank.de", priority: 56,
    name: "Förderdatenbank des Bundes — BMWSB-Förderprogramme",
    quellenrolle: "Amtliche Förderdatenbank, gefiltert auf Fördergeber BMWSB (neutrale Vollsicht der Bundes-Förderprogramme Bauen/Wohnen/Städtebau)",
    url: "https://www.foerderdatenbank.de/FDB/Content/DE/Foerdergeber/B/bmwsb-bundesministerium_wohnen_stadtentw_bau.html",
    method: "html", parser: "html-scrape", retrieval_type: "html_liste", update_character: "periodisch",
    ziel_methode: "html", ziel_hinweis: "Kein bestaetigter Feed; genuine HTML-Foerdergeber-Liste. Ueberschneidung mit bmwsb-foerderung-wohnen (neutrale Vollsicht bevorzugt).",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html; charset=UTF-8", note: "Bestand (Run 30079020728): erreichbar, inhaltsreich; HTML-Scrape" }
  }
];

// Baut das vorbereitete WBSB-Abbild (Herausgeber/Abrufwege/Paketzuordnungen).
function buildWohnenBauenStadtentwicklungSeed() {
  const publishers = new Map();
  const retrievalPaths = [];
  const packagePaths = [];

  function slug(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, ""); }

  for (const c of PFLICHTKERN) {
    const meta = PUBLISHER_META[c.domain];
    const publisherId = `publisher-${slug(c.domain)}`;
    if (!publishers.has(publisherId)) {
      publishers.set(publisherId, {
        id: publisherId, name: meta.name, canonical_domain: c.domain,
        publisher_type: meta.type, evidence_role: meta.evidence_role, trust: meta.trust,
        lifecycle_status: "active", entity_id: meta.entity_id || null,
        reuse: !!meta.reuse
      });
    }
    const path = {
      id: `rp-wbsb-${c.key}`,
      publisher_id: publisherId,
      legacy_source_id: `wbsb-${c.key}`,
      name: c.name,
      method: c.method,
      url: c.url,
      query: null,
      parser: c.parser,
      priority: c.priority,
      status: "needs_review",       // INAKTIV — nie healthy/active
      activation_mode: "manual",    // INAKTIV — nie auto/always_on -> kein Auto-Crawl
      is_critical: false,
      max_items: 16,
      represents_type: null,
      // In-Memory-Annotationen (NICHT in der Seed-SQL serialisiert):
      module: "wohnen-bauen-stadtentwicklung-bund",
      quellenrolle: c.quellenrolle,
      retrieval_type: c.retrieval_type,
      update_character: c.update_character,
      ziel_methode: c.ziel_methode,
      ziel_hinweis: c.ziel_hinweis,
      verifikation: c.verifikation
    };
    retrievalPaths.push(path);
    packagePaths.push({ package_id: WBSB_PACKAGE_ID, retrieval_path_id: path.id });
  }

  const pubs = [...publishers.values()];
  return {
    publishers: pubs,
    newPublishers: pubs.filter((p) => !p.reuse),
    reusedPublishers: pubs.filter((p) => p.reuse),
    neueEntitaeten: WBSB_NEUE_ENTITAETEN,
    retrievalPaths,
    packagePaths,
    summary: {
      status: "prepared",
      pflichtkern: PFLICHTKERN.length,
      publishersGesamt: pubs.length,
      publishersNeu: pubs.filter((p) => !p.reuse).length,
      publishersWiederverwendet: pubs.filter((p) => p.reuse).length,
      abrufwege: retrievalPaths.length,
      // Methodenmix (Fachreview §3 — HTML reduziert, strukturierte Wege ergaenzt):
      methoden: retrievalPaths.reduce((a, p) => { a[p.method] = (a[p.method] || 0) + 1; return a; }, {}),
      // technisch inaktiv: kein Abrufweg healthy/auto/always_on
      aktiveAbrufwege: retrievalPaths.filter((p) => p.status === "healthy" || p.activation_mode === "auto" || p.activation_mode === "always_on").length
    }
  };
}

module.exports = { buildWohnenBauenStadtentwicklungSeed, WBSB_PACKAGE_ID, PUBLISHER_META, WBSB_NEUE_ENTITAETEN, PFLICHTKERN };
