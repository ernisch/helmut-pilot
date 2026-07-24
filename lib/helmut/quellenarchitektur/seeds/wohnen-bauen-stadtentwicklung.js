"use strict";

// Helmut — Quellenarchitektur · Pilot "wohnen-bauen-stadtentwicklung-bund":
// VORBEREITETES (technisch INAKTIVES) Bundes-Fachthemenpaket als Herausgeber /
// Abrufwege / Paketzuordnungen.
//
// REINE, DETERMINISTISCHE DATEN. Kein Netz, keine KI, kein Storage-Write, kein Rendering.
// Formt den fachlich ausgewaehlten Pflichtkern (11 real per CI verifizierte offizielle
// Bund-Primaerquellen) in das relationale Modell:
//   - retrieval_paths: status "needs_review" (NIE healthy/active), activation_mode "manual"
//     (NIE auto/always_on) -> werden nie automatisch aktiviert/gecrawlt.
//   - Zuordnung ausschliesslich zum neuen Paket pkg-wohnen-bauen-stadtentwicklung-bund
//     (status "prepared" in seeds/packages.js) -> computeGlobalactivation aktiviert es NICHT.
// Damit ist das Paket strukturell vollstaendig vorbereitet, aber technisch INAKTIV. Die
// Freigabe/Aktivierung (DB-Insert) ist ein eigener, ausdruecklich freigabepflichtiger Schritt.
//
// VERIFIKATION: Jeder Weg traegt das ECHTE CI-Ergebnis (`verifikation`), erhoben am
// 2026-07-24 auf einem GitHub-Actions-Runner mit offenem Egress (Egress-Gate bestanden:
// Kontroll-URLs example.com/google.com = HTTP 200). Quelle: scripts/wohnen-bauen-
// stadtentwicklung-verify.js, Report-Artefakt wbsb-verifikation (Run 30079020728).
// Rohdaten/Kandidaten: seeds/wohnen-bauen-stadtentwicklung-kandidaten.js.
//
// DEDUP-BEWUSST: Herausgeber destatis.de und bundestag.de EXISTIEREN bereits im Modell
// (aus dem Alt-Katalog) — sie werden WIEDERVERWENDET (kein zweiter Herausgeber je Domain).
// Nur BMWSB/BBR/recht.bund.de/staedtebaufoerderung.info/foerderdatenbank.de sind neu.

const WBSB_PACKAGE_ID = "pkg-wohnen-bauen-stadtentwicklung-bund";

// Herausgeber-Metadaten je Domain. `reuse:true` = existiert bereits (nur referenzieren,
// NICHT ueberschreiben — die Injektion in catalog.js legt ihn nicht erneut an).
const PUBLISHER_META = {
  "bmwsb.bund.de": { name: "Bundesministerium für Wohnen, Stadtentwicklung und Bauwesen", type: "ministry", evidence_role: "official_primary", trust: "hoch", entity_id: "ministry-bmwsb" },
  "bbr.bund.de": { name: "Bundesamt für Bauwesen und Raumordnung", type: "authority", evidence_role: "official_primary", trust: "hoch", entity_id: "authority-bbr" },
  "recht.bund.de": { name: "Bundesamt für Justiz — Verkündungsplattform des Bundes", type: "authority", evidence_role: "official_primary", trust: "hoch", entity_id: "authority-bfj" },
  "staedtebaufoerderung.info": { name: "Städtebauförderung (Bund-Länder-Programm)", type: "government", evidence_role: "official_primary", trust: "hoch", entity_id: null },
  "foerderdatenbank.de": { name: "Förderdatenbank des Bundes", type: "authority", evidence_role: "data_source", trust: "hoch", entity_id: null },
  // Wiederverwendung bestehender Herausgeber (Dedup nach Domain):
  "destatis.de": { name: "Statistisches Bundesamt", type: "statistical_office", evidence_role: "data_source", trust: "hoch", entity_id: "statoffice-destatis", reuse: true },
  "bundestag.de": { name: "Deutscher Bundestag", type: "parliament", evidence_role: "official_primary", trust: "hoch", entity_id: "parliament-bundestag", reuse: true }
};

// Neue politische Entitaeten, die dieses Paket benoetigt (werden in seeds/entities.js
// ergaenzt und hier nur dokumentiert; statoffice-destatis/parliament-bundestag existieren).
const WBSB_NEUE_ENTITAETEN = ["ministry-bmwsb", "authority-bbr", "authority-bfj"];

// --- PFLICHTKERN: 11 real verifizierte Bund-Primaerquellen (alle HTTP 200) --------------
// `url` ist die FINALE URL nach Weiterleitungen (der real mit 200 erreichte Zielpunkt).
// `verifikation` haelt das ECHTE CI-Urteil + HTTP-Beleg fest.
const PFLICHTKERN = [
  {
    key: "bmwsb-presse", domain: "bmwsb.bund.de", priority: 74,
    name: "BMWSB — Pressemitteilungen (Wohnen/Bauen/Stadtentwicklung, Bundespolitik)",
    quellenrolle: "Pressemitteilungen-Liste des zuständigen Bundesministeriums",
    url: "https://www.bmwsb.bund.de/DE/tools-services/presse/pressemitteilungen/pressemitteilungen_node.html",
    retrieval_type: "html_liste", update_character: "laufend",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html;charset=utf-8", note: "erreichbar, inhaltsreich; HTML-Scrape (kein stabiler Feed)" }
  },
  {
    key: "bmwsb-foerderung-wohnen", domain: "bmwsb.bund.de", priority: 66,
    name: "BMWSB — Wohnraumförderung (sozialer Wohnungsbau, Förderprogramme Wohnen)",
    quellenrolle: "Förderprogramme Wohnen des Bundesbauministeriums",
    url: "https://www.bmwsb.bund.de/DE/wohnen/foerderprogramme-bmwsb/foerderprogramme-bmwsb_node.html",
    retrieval_type: "html_liste", update_character: "periodisch",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html;charset=utf-8", note: "erreichbar, inhaltsreich; HTML-Scrape" }
  },
  {
    key: "bbr-presse", domain: "bbr.bund.de", priority: 64,
    name: "BBR — Pressemitteilungen (Bundesbau, Raumordnung)",
    quellenrolle: "Pressemitteilungen-Suche/Liste des Bundesamtes für Bauwesen und Raumordnung",
    url: "https://www.bbr.bund.de/SiteGlobals/Forms/Suche/PressemitteilungenSuche_Formular.html?nn=1368394",
    retrieval_type: "html_suche", update_character: "laufend",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html;charset=utf-8", note: "erreichbar (1 Weiterleitung -> Suchformular); HTML-Scrape" }
  },
  {
    key: "destatis-bautaetigkeit", domain: "destatis.de", priority: 62,
    name: "Destatis — Bautätigkeit (Baugenehmigungen/-fertigstellungen/Bauüberhang)",
    quellenrolle: "Tabellen-Übersicht Bautätigkeit",
    url: "https://www.destatis.de/DE/Themen/Branchen-Unternehmen/Bauen/Tabellen/_tabellen-innen-bautaetigkeit.html",
    retrieval_type: "html_liste", update_character: "periodisch",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html;charset=utf-8", note: "erreichbar, inhaltsreich; HTML-Scrape" }
  },
  {
    key: "destatis-baupreisindex", domain: "destatis.de", priority: 62,
    name: "Destatis — Baupreisindex (Preisindizes für Bauwerke)",
    quellenrolle: "Konjunkturindikator Baupreise (Baukosten)",
    url: "https://www.destatis.de/DE/Themen/Wirtschaft/Konjunkturindikatoren/Preise/bpr110.html",
    retrieval_type: "html_liste", update_character: "periodisch",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html;charset=utf-8", note: "erreichbar, inhaltsreich; HTML-Scrape" }
  },
  {
    key: "destatis-wohnen-mieten", domain: "destatis.de", priority: 62,
    name: "Destatis — Wohnen (Mieten/Nettokaltmiete, Wohnkosten, Wohnsituation)",
    quellenrolle: "Tabellenliste Wohnungsmarkt/Mieten",
    url: "https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Wohnen/Tabellen/_tabellen.html",
    retrieval_type: "html_liste", update_character: "periodisch",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html;charset=utf-8", note: "erreichbar, inhaltsreich; HTML-Scrape" }
  },
  {
    key: "destatis-wohngeld", domain: "destatis.de", priority: 60,
    name: "Destatis — Wohngeld-Statistik",
    quellenrolle: "Tabellenliste Wohngeld (Wohnraumförderung/soziale Absicherung des Wohnens)",
    url: "https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Soziales/Wohngeld/Tabellen/_tabellen.html",
    retrieval_type: "html_liste", update_character: "periodisch",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html;charset=utf-8", note: "erreichbar, inhaltsreich; HTML-Scrape" }
  },
  {
    key: "bgbl-teil1-liste", domain: "recht.bund.de", priority: 72,
    name: "Bundesgesetzblatt Teil I — Verkündungsliste (recht.bund.de)",
    quellenrolle: "Amtliche Verkündung neuer Bundesgesetze/-verordnungen (Baugesetzgebung)",
    url: "https://www.recht.bund.de/de/bundesgesetzblatt/bgbl-1/bgbl-1_node.html",
    retrieval_type: "html_liste", update_character: "laufend",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html;charset=utf-8", note: "erreichbar, inhaltsreich; HTML-Scrape (RSS-Hub war HTML, kein Feed)" }
  },
  {
    key: "bundestag-bauausschuss", domain: "bundestag.de", priority: 70,
    name: "Bundestag — Ausschuss für Wohnen, Stadtentwicklung, Bauwesen und Kommunen",
    quellenrolle: "Parlamentarischer Fachausschuss (Sitzungen, Anhörungen, Tagesordnungen)",
    url: "https://www.bundestag.de/ausschuesse/a24_wohnen",
    retrieval_type: "html_liste", update_character: "laufend",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html;charset=UTF-8", note: "erreichbar (Kurzlink /bau -> /ausschuesse/a24_wohnen); HTML-Scrape" }
  },
  {
    key: "staedtebaufoerderung-start", domain: "staedtebaufoerderung.info", priority: 64,
    name: "Städtebauförderung — Bund-Länder-Portal (Aktuelles/Programme)",
    quellenrolle: "Offizielles Portal der Städtebauförderung (Stadtentwicklung/Städtebauförderung)",
    url: "https://www.staedtebaufoerderung.info/DE/Startseite/startseite_node.html",
    retrieval_type: "html_liste", update_character: "laufend",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html;charset=utf-8", note: "erreichbar, inhaltsreich; HTML-Scrape" }
  },
  {
    key: "foerderdatenbank-bmwsb", domain: "foerderdatenbank.de", priority: 60,
    name: "Förderdatenbank des Bundes — BMWSB-Förderprogramme",
    quellenrolle: "Amtliche Förderdatenbank, gefiltert auf Fördergeber BMWSB (Förderprogramme Bauen/Wohnen/Städtebau)",
    url: "https://www.foerderdatenbank.de/FDB/Content/DE/Foerdergeber/B/bmwsb-bundesministerium_wohnen_stadtentw_bau.html",
    retrieval_type: "html_liste", update_character: "periodisch",
    verifikation: { urteil: "geeignet mit Einschraenkung", http: 200, content_type: "text/html; charset=UTF-8", note: "erreichbar, inhaltsreich; HTML-Scrape" }
  }
];

function methodForRetrieval(_type) {
  // Der Pflichtkern besteht ausschliesslich aus HTML-Listen/-Suchen (kein sauberer Feed
  // real auffindbar). DB-method-Enum: rss|api|html|googlenews_search|structured_download.
  return "html";
}

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
    const method = methodForRetrieval(c.retrieval_type);
    const path = {
      id: `rp-wbsb-${c.key}`,
      publisher_id: publisherId,
      legacy_source_id: `wbsb-${c.key}`,
      name: c.name,
      method,
      url: c.url,
      query: null,
      parser: "html-scrape",
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
      // technisch inaktiv: kein Abrufweg healthy/auto/always_on
      aktiveAbrufwege: retrievalPaths.filter((p) => p.status === "healthy" || p.activation_mode === "auto" || p.activation_mode === "always_on").length
    }
  };
}

module.exports = { buildWohnenBauenStadtentwicklungSeed, WBSB_PACKAGE_ID, PUBLISHER_META, WBSB_NEUE_ENTITAETEN, PFLICHTKERN };
