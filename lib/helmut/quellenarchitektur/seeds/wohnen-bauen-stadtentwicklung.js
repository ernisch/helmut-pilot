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
// dem Erst-Pflichtkern des Piloten (PR #116/#117), getrieben von der ECHTEN Runner-Verifikation
// (Actions-Run 30097099429, offener Egress, Kontrolle example.com/google.com = 200):
//   + BBSR ergaenzt (Auditor-Luecke geschlossen): bbsr-presseinformationen — real HTTP 200
//     verifiziert. HINWEIS: die zuerst vermutete BBSR-Adresse /BBSR/DE/Aktuell/aktuell.html
//     lieferte real 404; die Presseinformationen-Seite ist die verifizierte Adresse.
//   - bundestag-bauausschuss ENTFERNT (Dedup): parlamentarische Vorgaenge sind bereits ueber
//     die amtliche DIP-API (rp-dip, always_on, bund-basis) + committee-bau-wohnen abgedeckt.
//   ~ Ziel-Retrievalmethode je Presse-/Verkuendungsquelle = RSS dokumentiert; die konkrete
//     Feed-URL ist aktivierungspflichtig aufzuloesen (s. u. "Strukturierte Ziele").
//
// STRUKTURIERTE ZIELE — NICHT im Pflichtkern (ehrlich: real NICHT verifizierbar), sondern
// als Aktivierungs-Upgrade dokumentiert (Fachreview §3/§10):
//   - GSB-RSS-Feeds (BMWSB/BBSR/BBR/Staedtebaufoerderung): die RSS-Hub-Seiten liefern real HTML
//     (kein Feed); der echte Feed liegt unter /SiteGlobals/Functions/RSSFeed/…?nn=<ID> — die
//     nn-ID muss aus dem Hub extrahiert werden (Produktions-Infra, nicht aus CI/Sandbox).
//   - recht.bund.de BGBl-Teil-I-RSS: dokumentiert (3 Feeds), Hub liefert HTML -> Deep-Link am
//     Runner/Prod aufloesen.
//   - Destatis GENESIS-REST-API: Basis-GET liefert 404; echte Nutzung = POST + Methode +
//     kostenfreier Token -> eigene Anbindung (analog DIP), Aktivierungs-Task.
//   - gesetze-im-internet.de (gii-toc.xml Normindex): Host laeuft aus GitHub-Runnern in Timeout
//     (alle gii-* Kandidaten) -> nur aus Produktions-Infra verifizierbar.
//
// VERIFIKATION — Ehrlichkeitsprinzip: Die Sandbox blockt Egress (curl/WebFetch 403). Jeder
// Pflichtkern-Weg traegt das ECHTE Runner-Urteil (Actions-Run 30097099429, 2026-07-24, alle
// HTTP 200 "geeignet mit Einschraenkung"). KEINE aus Namensmustern erfundenen URLs.
//
// DEDUP-BEWUSST: Herausgeber destatis.de/bundestag.de EXISTIEREN bereits (Alt-Katalog). destatis.de
// wird WIEDERVERWENDET (Statistik-Tabellen). bundestag.de wird NICHT mehr referenziert
// (Bauausschuss-Weg entfernt -> Parlament via bestehender rp-dip). Neu: BMWSB/BBSR/BBR/BfJ-
// Verkuendung/Staedtebaufoerderung/Foerderdatenbank.

const WBSB_PACKAGE_ID = "pkg-wohnen-bauen-stadtentwicklung-bund";

// Herausgeber-Metadaten je Domain. `reuse:true` = existiert bereits (nur referenzieren,
// NICHT ueberschreiben — die Injektion in catalog.js legt ihn nicht erneut an).
const PUBLISHER_META = {
  "bmwsb.bund.de": { name: "Bundesministerium für Wohnen, Stadtentwicklung und Bauwesen", type: "ministry", evidence_role: "official_primary", trust: "hoch", entity_id: "ministry-bmwsb" },
  "bbsr.bund.de": { name: "Bundesinstitut für Bau-, Stadt- und Raumforschung", type: "authority", evidence_role: "official_primary", trust: "hoch", entity_id: "authority-bbsr" },
  "bbr.bund.de": { name: "Bundesamt für Bauwesen und Raumordnung", type: "authority", evidence_role: "official_primary", trust: "hoch", entity_id: "authority-bbr" },
  "recht.bund.de": { name: "Bundesamt für Justiz — Verkündungsplattform des Bundes", type: "authority", evidence_role: "official_primary", trust: "hoch", entity_id: "authority-bfj" },
  "staedtebaufoerderung.info": { name: "Städtebauförderung (Bund-Länder-Programm)", type: "government", evidence_role: "official_primary", trust: "hoch", entity_id: null },
  "foerderdatenbank.de": { name: "Förderdatenbank des Bundes", type: "authority", evidence_role: "data_source", trust: "hoch", entity_id: null },
  // Wiederverwendung eines bestehenden Herausgebers (Dedup nach Domain):
  "destatis.de": { name: "Statistisches Bundesamt", type: "statistical_office", evidence_role: "data_source", trust: "hoch", entity_id: "statoffice-destatis", reuse: true }
};

// Neue politische Entitaeten, die dieses Paket benoetigt (werden in seeds/entities.js
// ergaenzt und hier nur dokumentiert; statoffice-destatis existiert bereits).
const WBSB_NEUE_ENTITAETEN = ["ministry-bmwsb", "authority-bbsr", "authority-bbr", "authority-bfj"];

// --- PFLICHTKERN: 11 real (HTTP 200) verifizierte Bund-Primaerquellen --------------------
// `url`          = die real erreichte Zieladresse (Run 30097099429, finale URL nach Redirect).
// `method`       = DB-Retrievalmethode. Alle real verifizierten Wege sind HTML-Listen/-Suchen
//                  ("geeignet mit Einschraenkung" = erreichbar + inhaltsreich, aber Scrape).
// `ziel_methode` = fachlich bevorzugte Zielmethode (RSS), falls ein Feed dokumentiert existiert;
//                  Aufloesung/Umstellung ist ein Aktivierungs-Task (s. Kopf "Strukturierte Ziele").
// `verifikation` = ECHTES Runner-Urteil (kein erfundenes Urteil, keine erfundene URL).
const RUN = "30097099429";
const PFLICHTKERN = [
  {
    key: "bmwsb-presse", domain: "bmwsb.bund.de", priority: 74,
    name: "BMWSB — Pressemitteilungen (Wohnen/Bauen/Stadtentwicklung, Bundespolitik)",
    quellenrolle: "Pressemitteilungen des zuständigen Bundesministeriums (politische Primärquelle)",
    url: "https://www.bmwsb.bund.de/DE/tools-services/presse/pressemitteilungen/pressemitteilungen_node.html",
    method: "html", parser: "html-scrape", retrieval_type: "html_liste", update_character: "laufend",
    ziel_methode: "rss", ziel_hinweis: "GSB-RSS-Feed vorhanden (Hub /DE/tools-services/rssfeed/rss.html liefert real HTML); echten Feed /SiteGlobals/Functions/RSSFeed/…?nn=<ID> aus dem Hub extrahieren (Aktivierung).",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html;charset=utf-8", note: `Runner ${RUN}: HTTP 200, inhaltsreich; HTML-Scrape (RSS-Hub liefert HTML -> Feed-Deep-Link offen)` }
  },
  {
    key: "bmwsb-foerderung-wohnen", domain: "bmwsb.bund.de", priority: 58,
    name: "BMWSB — Wohnraumförderung (sozialer Wohnungsbau, Förderprogramme Wohnen)",
    quellenrolle: "Förderprogramme Wohnen des Bundesbauministeriums (Ressortsicht)",
    url: "https://www.bmwsb.bund.de/DE/wohnen/foerderprogramme-bmwsb/foerderprogramme-bmwsb_node.html",
    method: "html", parser: "html-scrape", retrieval_type: "html_liste", update_character: "periodisch",
    ziel_methode: "html", ziel_hinweis: "Kein Feed; genuine HTML-Foerderprogrammliste. Ueberschneidung mit foerderdatenbank-bmwsb (neutrale Vollsicht) -> optional (C).",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html;charset=utf-8", note: `Runner ${RUN}: HTTP 200, inhaltsreich; HTML-Scrape` }
  },
  {
    key: "bbsr-presseinformationen", domain: "bbsr.bund.de", priority: 68,
    name: "BBSR — Presseinformationen (Wohnungsmarkt-, Stadt- und Raumforschung des Bundes)",
    quellenrolle: "Ressortforschung des Bundes (Wohnungs-/Immobilienmärkte, Stadtentwicklung, laufende Raumbeobachtung) — Frühindikator",
    url: "https://www.bbsr.bund.de/BBSR/DE/presse/presseinformationen/_node.html",
    method: "html", parser: "html-scrape", retrieval_type: "html_liste", update_character: "laufend",
    ziel_methode: "rss", ziel_hinweis: "GSB-RSS-Feed vorhanden (Hub /BBSR/DE/Service/RSS/rssnewsfeed_node.html lief real in 404 -> Feed-URL/Case am Runner klaeren) bzw. IDW-Feed (idw-online.de/de/institution957).",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html;charset=utf-8", note: `Runner ${RUN}: HTTP 200, inhaltsreich (Auditor-Luecke geschlossen). /Aktuell/aktuell.html lieferte real 404 -> hier die verifizierte Presse-Adresse.` }
  },
  {
    key: "bbr-presse", domain: "bbr.bund.de", priority: 60,
    name: "BBR — Pressemitteilungen (Bundesbau, Raumordnung)",
    quellenrolle: "Pressemitteilungen-Suche/Liste des Bundesamtes für Bauwesen und Raumordnung (Bundesbau/Raumordnung)",
    url: "https://www.bbr.bund.de/SiteGlobals/Forms/Suche/PressemitteilungenSuche_Formular.html?nn=1368394",
    method: "html", parser: "html-scrape", retrieval_type: "html_suche", update_character: "laufend",
    ziel_methode: "rss", ziel_hinweis: "GSB-RSS moeglich; finale URL ist ein Suchformular -> Ergebnis-Parsing bzw. Feed am Runner absichern. Behoerdenfamilie mit BBSR (Rollen getrennt: BBR=Bundesbau/Raumordnung, BBSR=Forschung).",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html;charset=utf-8", note: `Runner ${RUN}: HTTP 200 (1 Weiterleitung -> Suchformular); HTML-Scrape` }
  },
  {
    key: "destatis-bautaetigkeit", domain: "destatis.de", priority: 62,
    name: "Destatis — Bautätigkeit (Baugenehmigungen/-fertigstellungen/Bauüberhang)",
    quellenrolle: "Amtlicher Kernindikator der Wohnungsbau-Zielerreichung (Genehmigungen/Fertigstellungen)",
    url: "https://www.destatis.de/DE/Themen/Branchen-Unternehmen/Bauen/Tabellen/_tabellen-innen-bautaetigkeit.html",
    method: "html", parser: "html-scrape", retrieval_type: "html_liste", update_character: "periodisch",
    ziel_methode: "api", ziel_hinweis: "Als GENESIS-Zeitreihe strukturiert abrufbar (destatis-genesis-api, POST+Token). Daten-Grounding, KEINE Lagebericht-News (Freshness niedrig).",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html;charset=utf-8", note: `Runner ${RUN}: HTTP 200, inhaltsreich; HTML-Scrape` }
  },
  {
    key: "destatis-baupreisindex", domain: "destatis.de", priority: 60,
    name: "Destatis — Baupreisindex (Preisindizes für Bauwerke)",
    quellenrolle: "Amtlicher Baukosten-/Baupreis-Indikator (Auftrags-Bereich Baukosten)",
    url: "https://www.destatis.de/DE/Themen/Wirtschaft/Konjunkturindikatoren/Preise/bpr110.html",
    method: "html", parser: "html-scrape", retrieval_type: "html_liste", update_character: "periodisch",
    ziel_methode: "api", ziel_hinweis: "Als GENESIS-Zeitreihe strukturiert abrufbar. Daten-Grounding, KEINE Lagebericht-News (Freshness niedrig).",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html;charset=utf-8", note: `Runner ${RUN}: HTTP 200, inhaltsreich; HTML-Scrape` }
  },
  {
    key: "destatis-wohnen-mieten", domain: "destatis.de", priority: 62,
    name: "Destatis — Wohnen (Mieten/Nettokaltmiete, Wohnkosten, Wohnsituation)",
    quellenrolle: "Amtliche Wohnungsmarkt-/Mietdaten (Grundlage mietpolitischer Bewertung)",
    url: "https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Wohnen/Tabellen/_tabellen.html",
    method: "html", parser: "html-scrape", retrieval_type: "html_liste", update_character: "periodisch",
    ziel_methode: "api", ziel_hinweis: "Als GENESIS-Zeitreihe strukturiert abrufbar. Daten-Grounding, KEINE Lagebericht-News (Freshness niedrig).",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html;charset=utf-8", note: `Runner ${RUN}: HTTP 200, inhaltsreich; HTML-Scrape` }
  },
  {
    key: "destatis-wohngeld", domain: "destatis.de", priority: 58,
    name: "Destatis — Wohngeld-Statistik",
    quellenrolle: "Amtliche Wohngeld-Statistik (Auftrags-Bereich Wohnraumförderung/soziale Absicherung des Wohnens)",
    url: "https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Soziales/Wohngeld/Tabellen/_tabellen.html",
    method: "html", parser: "html-scrape", retrieval_type: "html_liste", update_character: "periodisch",
    ziel_methode: "api", ziel_hinweis: "Als GENESIS-Zeitreihe strukturiert abrufbar. Daten-Grounding, KEINE Lagebericht-News (Freshness niedrig).",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html;charset=utf-8", note: `Runner ${RUN}: HTTP 200, inhaltsreich; HTML-Scrape` }
  },
  {
    key: "bgbl-teil1-liste", domain: "recht.bund.de", priority: 72,
    name: "Bundesgesetzblatt Teil I — Verkündungsliste (recht.bund.de)",
    quellenrolle: "Amtliche Verkündung neuer Bundesgesetze/-verordnungen (Baugesetzgebung) — seit 2023 ausschließlich hier",
    url: "https://www.recht.bund.de/de/bundesgesetzblatt/bgbl-1/bgbl-1_node.html",
    method: "html", parser: "html-scrape", retrieval_type: "html_liste", update_character: "laufend",
    ziel_methode: "rss", ziel_hinweis: "recht.bund.de bietet dokumentiert 3 RSS-Feeds (Teil I / II / beide); der RSS-Hub liefert real HTML -> Teil-I-Feed-Deep-Link aufloesen (Aktivierung). ELI-URLs /eli/bund/BGBl-1/… systematisch.",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html;charset=utf-8", note: `Runner ${RUN}: HTTP 200, inhaltsreich; RSS-Feed als Ziel dokumentiert (Hub liefert HTML)` }
  },
  {
    key: "staedtebaufoerderung-start", domain: "staedtebaufoerderung.info", priority: 62,
    name: "Städtebauförderung — Bund-Länder-Portal (Aktuelles/Programme)",
    quellenrolle: "Offizielles Portal der Städtebauförderung (Stadtentwicklung, Verwaltungsvereinbarungen, Mittelverteilung)",
    url: "https://www.staedtebaufoerderung.info/DE/Startseite/startseite_node.html",
    method: "html", parser: "html-scrape", retrieval_type: "html_liste", update_character: "laufend",
    ziel_methode: "rss", ziel_hinweis: "GSB-Portal -> RSS-Feed am Runner pruefen. Sonst HTML (kein bestaetigter Feed).",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html;charset=utf-8", note: `Runner ${RUN}: HTTP 200, inhaltsreich; HTML-Scrape` }
  },
  {
    key: "foerderdatenbank-bmwsb", domain: "foerderdatenbank.de", priority: 56,
    name: "Förderdatenbank des Bundes — BMWSB-Förderprogramme",
    quellenrolle: "Amtliche Förderdatenbank, gefiltert auf Fördergeber BMWSB (neutrale Vollsicht der Bundes-Förderprogramme Bauen/Wohnen/Städtebau)",
    url: "https://www.foerderdatenbank.de/FDB/Content/DE/Foerdergeber/B/bmwsb-bundesministerium_wohnen_stadtentw_bau.html",
    method: "html", parser: "html-scrape", retrieval_type: "html_liste", update_character: "periodisch",
    ziel_methode: "html", ziel_hinweis: "Kein bestaetigter Feed; genuine HTML-Foerdergeber-Liste. Ueberschneidung mit bmwsb-foerderung-wohnen (neutrale Vollsicht bevorzugt).",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html; charset=UTF-8", note: `Runner ${RUN}: HTTP 200, inhaltsreich; HTML-Scrape` }
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
      methoden: retrievalPaths.reduce((a, p) => { a[p.method] = (a[p.method] || 0) + 1; return a; }, {}),
      // technisch inaktiv: kein Abrufweg healthy/auto/always_on
      aktiveAbrufwege: retrievalPaths.filter((p) => p.status === "healthy" || p.activation_mode === "auto" || p.activation_mode === "always_on").length
    }
  };
}

module.exports = { buildWohnenBauenStadtentwicklungSeed, WBSB_PACKAGE_ID, PUBLISHER_META, WBSB_NEUE_ENTITAETEN, PFLICHTKERN };
