"use strict";

// Helmut — Neue Quellenarchitektur · Sprint (Energie/Klima/Umwelt Bund):
// strukturierte, technisch INAKTIVE Vorbereitung des Quellenpakets
//   energie-klima-umwelt-bund
// als Herausgeber / politische Entitaeten / Abrufwege / Paketzuordnungen / erwartete Ebenen
// + Geografien.
//
// REINE, DETERMINISTISCHE DATEN + REINE HELFER. Kein Netz, keine KI, kein Storage-Write,
// KEIN Rendering. Formt die (fachlich recherchierten, technisch NICHT byte-verifizierten)
// Kandidaten in das relationale Modell — ausschliesslich als VORBEREITET:
//   - source_packages: EIN neues Paket `energie-klima-umwelt-bund`, status "prepared"
//     (NICHT active) -> computeGlobalActivation/Referenzzaehlung aktiviert nichts.
//   - retrieval_paths: status "needs_review" (NIE healthy/active), activation_mode "manual"
//     (NIE auto/always_on) -> werden nie automatisch aktiviert/gecrawlt.
//   - path_expected_levels = ["bund"], path_expected_geographies = geo-bund.
//
// GRENZEN DIESES SPRINTS (Auftrag): keine Aktivierung, kein Deployment, kein Merge, keine
// Produktionsaenderung, KEINE Aenderung an bestehenden AKTIVEN Quellen, kein Registry-/
// Generator-/Workflow-Refactoring. Das Anwenden auf Production (DB-Insert) bleibt ein eigener,
// ausdruecklich freigabepflichtiger Schritt (wie Bund-Migration/Landesmodule). Dieses Modul
// erzeugt NUR das In-Memory-Abbild + eine anwendbare Seed-Struktur; es schreibt nichts.
//
// EGRESS-EHRLICHKEIT: In dieser Umgebung ist ausgehender HTTP-Egress zu externen Behoerden-
// Hosts per Policy gesperrt (403 CONNECT). Es konnte daher KEINE byte-genaue technische
// Verifikation (HTTP-Status/Redirect/Content-Type/Feedstruktur/Paywall/Bot-Schutz) erfolgen.
// Jeder Weg traegt `verifyBeforeActivation: true` und `verified: false`. Die fachliche
// Grundierung (aktuelle Ressortnamen/Domains) stammt aus WebSearch (2026) — das ist KEIN
// Ersatz fuer byte-genaue Pruefung, die vor jeder Aktivierung zwingend bleibt.
//
// AKTUELLE RESSORTSTRUKTUR (2025, Kabinett Merz — WebSearch-belegt, siehe Doku 29):
//   - Wirtschaftsressort: BMWi -> BMWK (2021) -> BMWE (Bundesministerium fuer Wirtschaft und
//     Energie, Org-Erlass 06.05.2025). Klimaschutz aus dem Wirtschaftsressort HERAUS.
//     Kanonische, namensneutrale Domain: bundeswirtschaftsministerium.de.
//   - Umweltressort: BMU -> BMUV (2021) -> BMUKN (Bundesministerium fuer Umwelt, Klimaschutz,
//     Naturschutz und nukleare Sicherheit, 06.05.2025). Klimaschutz HIER hinein, Verbraucher-
//     schutz heraus. Kanonische, namensneutrale Domain: bundesumweltministerium.de.
//   Die Deep-Research-Vorlage hatte BMWK (statt BMWE) und BMUV/BMUKN VERTAUSCHT — hier korrigiert.
//   Historische Kuerzel (BMWK/BMWi bzw. BMUV/BMU) werden AUSSCHLIESSLICH als Aliase gefuehrt.
//
// DEDUP-BEWUSST — bewusst NICHT angelegt (durch bestehende AKTIVE Wege bereits abgedeckt):
//   * Bundestagsausschuesse Energie/Klima: rp-committee-wirtschaft ("Wirtschaft und Energie")
//     + rp-committee-klima-umwelt ("Klima und Umwelt") laufen bereits AKTIV in pkg-bund-basis.
//   * Parlamentarische Dokumente (Drucksachen/Antraege/Gesetzentwuerfe) aller Themen:
//     rp-dip (DIP-API) laeuft bereits AKTIV/always_on in pkg-bund-basis.
//   * Bundesregierung/Bundestag/Bundesrat-PM: rp-bundesregierung/rp-bundestag (Bestand).
//   -> Dieses Paket legt KEINE parallelen Ausschuss-/DIP-/Parlaments-Suchwege an.

// --- Das neue Paket (prepared, inaktiv, Fachthema Bund) ----------------------
const PACKAGE = Object.freeze({
  id: "pkg-energie-klima-umwelt-bund",
  key: "energie-klima-umwelt-bund",
  name: "Energie, Klima & Umwelt (Bund)",
  purpose:
    "Fachthemenpaket Energie-, Klima- und Umweltpolitik auf Bundesebene (Ressorts BMWE/BMUKN, " +
    "Regulierung BNetzA, wissenschaftliche Umweltbehoerde UBA, unabhaengige Pruef-/Beratungs-" +
    "gremien Expertenrat/SRU, gemeinsame ÜNB-Netzentwicklungsplanung, Energie-/Umweltstatistik " +
    "Destatis, Foerderabwicklung BAFA). Fachthema, NICHT Region. Vorbereitet — Wege folgen nach " +
    "byte-genauer Verifikation + Freigabe.",
  status: "prepared",
  is_base: false,
  political_level: "bund",
  geography_id: "geo-bund",
  required_classes: []
});

// --- Neue politische Entitaeten (typisiert, mit historischen Aliasen) --------
// canonical_key ist ein stabiler Slug (kein matching.js-Partei/Ausschuss-Schluessel noetig).
// geography_id/level = Bund. Destatis wird NICHT neu angelegt (statoffice-destatis existiert
// bereits im Basis-Seed und wird wiederverwendet).
const NEUE_ENTITAETEN = [
  {
    id: "ministry-bmwe", entity_type: "ministry",
    name: "Bundesministerium für Wirtschaft und Energie", canonical_key: "bmwe",
    level: "bund", geography_id: "geo-bund",
    aliases: [
      "BMWE", "BMWK", "BMWi", "Bundeswirtschaftsministerium",
      "Bundesministerium für Wirtschaft und Klimaschutz",
      "Bundesministerium für Wirtschaft und Technologie",
      "Bundesministerium für Wirtschaft und Energie"
    ]
  },
  {
    id: "ministry-bmukn", entity_type: "ministry",
    name: "Bundesministerium für Umwelt, Klimaschutz, Naturschutz und nukleare Sicherheit",
    canonical_key: "bmukn", level: "bund", geography_id: "geo-bund",
    aliases: [
      "BMUKN", "BMUV", "BMU", "Bundesumweltministerium",
      "Bundesministerium für Umwelt, Naturschutz, nukleare Sicherheit und Verbraucherschutz",
      "Bundesministerium für Umwelt, Naturschutz und nukleare Sicherheit",
      "Bundesministerium für Umwelt, Klimaschutz, Naturschutz und nukleare Sicherheit"
    ]
  },
  {
    id: "authority-bnetza", entity_type: "authority",
    name: "Bundesnetzagentur", canonical_key: "bundesnetzagentur",
    level: "bund", geography_id: "geo-bund",
    aliases: ["BNetzA", "Bundesnetzagentur", "Bundesnetzagentur für Elektrizität, Gas, Telekommunikation, Post und Eisenbahnen"]
  },
  {
    id: "authority-umweltbundesamt", entity_type: "authority",
    name: "Umweltbundesamt", canonical_key: "umweltbundesamt",
    level: "bund", geography_id: "geo-bund",
    aliases: ["UBA", "Umweltbundesamt"]
  },
  {
    id: "other_institution-expertenrat-klima", entity_type: "other_institution",
    name: "Expertenrat für Klimafragen", canonical_key: "expertenrat-klima",
    level: "bund", geography_id: "geo-bund",
    aliases: ["Expertenrat für Klimafragen", "ERK", "Expertenrat Klima"]
  },
  {
    id: "other_institution-sru", entity_type: "other_institution",
    name: "Sachverständigenrat für Umweltfragen", canonical_key: "sru",
    level: "bund", geography_id: "geo-bund",
    aliases: ["SRU", "Sachverständigenrat für Umweltfragen", "Umweltrat"]
  },
  {
    id: "other_institution-uenb-verbund", entity_type: "other_institution",
    name: "Übertragungsnetzbetreiber (50Hertz, Amprion, TenneT, TransnetBW)",
    canonical_key: "uenb", level: "bund", geography_id: "geo-bund",
    aliases: ["ÜNB", "Übertragungsnetzbetreiber", "50Hertz", "Amprion", "TenneT", "TransnetBW", "Netzentwicklungsplan Strom"]
  },
  {
    id: "authority-bafa", entity_type: "authority",
    name: "Bundesamt für Wirtschaft und Ausfuhrkontrolle", canonical_key: "bafa",
    level: "bund", geography_id: "geo-bund",
    aliases: ["BAFA", "Bundesamt für Wirtschaft und Ausfuhrkontrolle"]
  }
];

// --- Herausgeber-Metadaten je Domain ----------------------------------------
// reuse=true: Herausgeber existiert bereits im Basis-Seed (destatis.de) -> wird NICHT neu
// eingefuegt, nur referenziert (Voraussetzung: Basis-Seed angewendet). evidence_role DB-CHECK:
// official_primary | direct_interest | journalistic | data_source | aggregator.
const PUBLISHER_META = {
  "bundeswirtschaftsministerium.de": { name: "Bundesministerium für Wirtschaft und Energie", type: "ministry", entity_id: "ministry-bmwe", evidence_role: "official_primary" },
  "bundesumweltministerium.de": { name: "Bundesministerium für Umwelt, Klimaschutz, Naturschutz und nukleare Sicherheit", type: "ministry", entity_id: "ministry-bmukn", evidence_role: "official_primary" },
  "bundesnetzagentur.de": { name: "Bundesnetzagentur", type: "authority", entity_id: "authority-bnetza", evidence_role: "official_primary" },
  "umweltbundesamt.de": { name: "Umweltbundesamt", type: "authority", entity_id: "authority-umweltbundesamt", evidence_role: "official_primary" },
  "expertenrat-klima.de": { name: "Expertenrat für Klimafragen", type: "other_institution", entity_id: "other_institution-expertenrat-klima", evidence_role: "official_primary" },
  "umweltrat.de": { name: "Sachverständigenrat für Umweltfragen (SRU)", type: "other_institution", entity_id: "other_institution-sru", evidence_role: "official_primary" },
  "netzentwicklungsplan.de": { name: "Übertragungsnetzbetreiber — Netzentwicklungsplan (gemeinsame Plattform)", type: "other_institution", entity_id: "other_institution-uenb-verbund", evidence_role: "direct_interest" },
  "destatis.de": { name: "Statistisches Bundesamt", type: "statistical_office", entity_id: "statoffice-destatis", evidence_role: "data_source", reuse: true, publisher_id: "publisher-destatis.de" },
  "bafa.de": { name: "Bundesamt für Wirtschaft und Ausfuhrkontrolle", type: "authority", entity_id: "authority-bafa", evidence_role: "official_primary" }
};

// --- Kandidaten (fachlich recherchiert, technisch NICHT byte-verifiziert) ----
// Jeder Eintrag ist EIN empfohlener Abrufweg mit vollstaendiger Begruendung (Auftrag §6).
// frequenz: "ereignisnah" | "regelmaessig" | "periodisch".
// method: ausschliesslich googlenews_search (site-gescopte, thematisch DISTINKTE Primaerquellen-
//   Suche je Domain — KEINE erfundenen Ziel-Feeds/APIs; unter gesperrtem Egress der ehrliche,
//   nicht-erfindende Weg, konsistent mit dem Bestandsmuster fuer OECD/Destatis im Basis-Seed).
//   preferredMethodAtActivation dokumentiert die bei der Verifikation zu bevorzugende native
//   Methode (z. B. SiteGlobals-RSS der Bundesressorts), die byte-genau zu fixieren ist.
// tier: 1 (dauerhaft unverzichtbar) | 2 (fachlich wichtig, seltener/teilw. redundant) | 3 (ergaenzend).
function gnews(query) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=de&gl=DE&ceid=DE:de`;
}

const KANDIDATEN = [
  // ---- Tier 1 — dauerhaft unverzichtbar --------------------------------------
  {
    id: "rp-bmwe", tier: 1, domain: "bundeswirtschaftsministerium.de",
    name: "BMWE — Energie- und Wirtschaftspolitik",
    query: "site:bundeswirtschaftsministerium.de (Energiewende OR Energiepolitik OR Strommarkt OR Energiepreise OR Monitoring)",
    method: "googlenews_search", preferredMethodAtActivation: "rss (SiteGlobals-Newsfeed des Ressorts) — byte-genau fixieren",
    represents_type: "ministry", frequenz: "regelmaessig", produktnutzen: "hoch",
    publikationsort: "bundeswirtschaftsministerium.de — Pressemitteilungen/Publikationen; Monitoring der Energiewende; Energiedaten",
    zweck: "Zentrales Ressort fuer Energiewende/Strommarkt/Energiepreise; strategische Rahmensetzungen, Gesetzentwuerfe, Foerderpolitik.",
    ueberschneidung: "Gesetzesvorhaben zusaetzlich in DIP (aktiv, bund-basis) — dort dokumentenzentriert; hier Ressort-Kommunikation.",
    verifyBeforeActivation: true, verified: false
  },
  {
    id: "rp-bmukn", tier: 1, domain: "bundesumweltministerium.de",
    name: "BMUKN — Klima-, Natur- und Umweltschutz",
    query: "site:bundesumweltministerium.de (Klimaschutz OR Naturschutz OR Kreislaufwirtschaft OR Klimaanpassung OR Umwelt)",
    method: "googlenews_search", preferredMethodAtActivation: "rss (SiteGlobals-Newsfeed des Ressorts) — byte-genau fixieren",
    represents_type: "ministry", frequenz: "regelmaessig", produktnutzen: "hoch",
    publikationsort: "bundesumweltministerium.de — Pressemitteilungen/Meldungen; Klimaschutz, Kreislaufwirtschaft, Naturschutz, nukleare Sicherheit",
    zweck: "Zentrales Ressort fuer Umwelt-/Naturschutz, Klimaschutz (seit 2025 hier gebuendelt), Klimaanpassung, Kreislaufwirtschaft, nukleare Sicherheit.",
    ueberschneidung: "Klimaschutz teilweise mit BMWE (Energiewende) — Ressortgrenze fliessend; getrennte Wege bleiben fachlich begruendet.",
    verifyBeforeActivation: true, verified: false
  },
  {
    id: "rp-bnetza-monitoring", tier: 1, domain: "bundesnetzagentur.de",
    name: "Bundesnetzagentur — Monitoring, Netzausbau, Versorgungssicherheit",
    query: "site:bundesnetzagentur.de (Monitoringbericht OR Netzausbau OR Versorgungssicherheit OR Marktbeobachtung OR Netzentwicklung)",
    method: "googlenews_search", preferredMethodAtActivation: "rss/Pressefeed der BNetzA — byte-genau fixieren",
    represents_type: "authority", frequenz: "regelmaessig", produktnutzen: "hoch",
    publikationsort: "bundesnetzagentur.de — Monitoringberichte Strom/Gas (jaehrl., gemeinsam mit Bundeskartellamt), Marktbeobachtung, Netzausbau/Genehmigung",
    zweck: "Zentrale Regulierungs- und Markttransparenzbehoerde; gesetzliche Monitoringpflicht. Gebuendelt: Monitoring + Versorgungssicherheit + Netzausbau + Marktbeobachtung (identischer Publikationsort/Aktualisierungslogik).",
    ueberschneidung: "SMARD (Strommarktdaten) ist eine STRUKTURIERTE DATENPLATTFORM der BNetzA -> NICHT hier, sondern als Future Target/eigener Datentyp. Netzentwicklungsplan -> eigener ÜNB-Weg (rp-uenb-netzentwicklungsplan).",
    verifyBeforeActivation: true, verified: false
  },
  {
    id: "rp-umweltbundesamt", tier: 1, domain: "umweltbundesamt.de",
    name: "Umweltbundesamt — Emissionsdaten und Projektionen",
    query: "site:umweltbundesamt.de (Treibhausgas OR Emissionen OR Projektionsbericht OR Klimabilanz OR Luftqualität)",
    method: "googlenews_search", preferredMethodAtActivation: "rss/Pressefeed des UBA — byte-genau fixieren",
    represents_type: "authority", frequenz: "regelmaessig", produktnutzen: "hoch",
    publikationsort: "umweltbundesamt.de — THG-Emissionsdaten/-Projektionen, Klimabilanz, Luftreinhaltung, Umweltoekonomie",
    zweck: "Zentrale wissenschaftliche Umweltbehoerde; amtliche Emissionsdaten und Klimaszenarien als Datenbasis der Klimapolitik.",
    ueberschneidung: "Emissionsbewertung ueberschneidet sich thematisch mit Expertenrat (dieser PRUEFT die Daten) — Rollen verschieden: UBA erhebt, Expertenrat bewertet unabhaengig.",
    verifyBeforeActivation: true, verified: false
  },
  {
    id: "rp-expertenrat-klima", tier: 1, domain: "expertenrat-klima.de",
    name: "Expertenrat für Klimafragen — Prüfberichte und Gutachten",
    query: "site:expertenrat-klima.de (Prüfbericht OR Gutachten OR Emissionsdaten OR Klimaziele OR Stellungnahme)",
    method: "googlenews_search", preferredMethodAtActivation: "rss/Pressefeed (falls vorhanden) — sonst html-Publikationsliste — byte-genau fixieren",
    represents_type: "other_institution", frequenz: "periodisch", produktnutzen: "hoch",
    publikationsort: "expertenrat-klima.de — jaehrl. Pruefbericht Emissionsdaten, Zweijahresgutachten, Stellungnahmen zu Klimaschutzprogrammen (KSG-verankert)",
    zweck: "Unabhaengige gesetzliche Pruefinstanz der Klimazielerreichung (KSG). In vielen Architekturen fehlend — hoher, schwer ersetzbarer Signalwert.",
    ueberschneidung: "Bezieht sich auf UBA-Emissionsdaten, ist aber eigenstaendige BEWERTUNG (keine Dublette). SRU ist BREITER (gesamte Umweltpolitik), Expertenrat NUR Klima/KSG — fachlich getrennt.",
    verifyBeforeActivation: true, verified: false
  },
  // ---- Tier 2 — fachlich wichtig, seltener/teilweise redundant ---------------
  {
    id: "rp-sru-umweltgutachten", tier: 2, domain: "umweltrat.de",
    name: "Sachverständigenrat für Umweltfragen — Umweltgutachten",
    query: "site:umweltrat.de (Umweltgutachten OR Sondergutachten OR Stellungnahme OR Kommentar)",
    method: "googlenews_search", preferredMethodAtActivation: "rss/Pressefeed (falls vorhanden) — sonst html-Publikationsliste — byte-genau fixieren",
    represents_type: "other_institution", frequenz: "periodisch", produktnutzen: "mittel",
    publikationsort: "umweltrat.de — Umweltgutachten (alle 2 Jahre), Sondergutachten, Stellungnahmen",
    zweck: "Hoechstrangiges unabhaengiges Umweltberatungsgremium; breite Umweltpolitik-Bewertung (Biodiversitaet, Gewaesser, Luft, Ressourcen).",
    ueberschneidung: "KEINE funktionale Dublette zum Expertenrat: SRU breit (Umwelt gesamt), Expertenrat eng (Klima/KSG). Niedrigere Frequenz -> Tier 2.",
    verifyBeforeActivation: true, verified: false
  },
  {
    id: "rp-uenb-netzentwicklungsplan", tier: 2, domain: "netzentwicklungsplan.de",
    name: "Übertragungsnetzbetreiber — Netzentwicklungsplan (gebündelt)",
    query: "site:netzentwicklungsplan.de (Netzentwicklungsplan OR Szenariorahmen OR Netzausbau OR Übertragungsnetz)",
    method: "googlenews_search", preferredMethodAtActivation: "html/structured_download der gemeinsamen NEP-Plattform — byte-genau fixieren",
    represents_type: "other_institution", frequenz: "periodisch", produktnutzen: "mittel",
    publikationsort: "netzentwicklungsplan.de — gemeinsame Plattform der vier ÜNB (50Hertz/Amprion/TenneT/TransnetBW); NEP Strom + Szenariorahmen (turnusmaessig, ~2-jaehrig)",
    zweck: "Netztechnische Ausbau-/Planungsdaten des Uebertragungsnetzes fuer den bundespolitischen Informationsbedarf (Netzausbau, Systemtransformation).",
    ueberschneidung: "BEWUSST GEBUENDELT statt vier ÜNB-Einzelwege: der gemeinsame NEP deckt den bundespolitischen Bedarf (Netzausbau/Systemstabilitaet) besser und guenstiger ab. Einzelne Unternehmens-Newsrooms (regionale Projektkommunikation) -> Future Target, nur bei klarem regionalem Zusatznutzen.",
    verifyBeforeActivation: true, verified: false
  },
  {
    id: "rp-destatis-energie-umwelt", tier: 2, domain: "destatis.de",
    name: "Destatis — Energie-, Umwelt- und Abfallstatistik",
    query: 'site:destatis.de (Energie OR Umwelt OR Abfall OR Emissionen OR "Umweltökonomische Gesamtrechnungen")',
    method: "googlenews_search", preferredMethodAtActivation: "vorhandenes Destatis-Statistik-/Newsmuster — byte-genau fixieren",
    represents_type: "statistical_office", frequenz: "periodisch", produktnutzen: "mittel",
    publikationsort: "destatis.de — Energieverbrauch/-bilanzen, Umweltoekonomische Gesamtrechnungen, Abfallstatistik",
    zweck: "Amtliche Basis-Statistik fuer Energie/Umwelt/Abfall. Herausgeber+Entitaet WIEDERVERWENDET (publisher-destatis.de / statoffice-destatis).",
    ueberschneidung: "Reuse: der bestehende Destatis-Weg (rp-news-destatis-soziales) ist SOZIALPOLITISCH gescopt -> KEINE Ueberschneidung; hier eigener, energetisch/umweltbezogen gescopter Weg, thematisch gebuendelt (Energie+Umwelt+Abfall statt Einzelwege).",
    verifyBeforeActivation: true, verified: false
  },
  // ---- Tier 3 — ergaenzend / ereignisbezogen ---------------------------------
  {
    id: "rp-bafa-foerderung", tier: 3, domain: "bafa.de",
    name: "BAFA — Energie-Förderprogramme (BEG)",
    query: "site:bafa.de (Bundesförderung OR BEG OR Energieeffizienz OR Förderprogramm OR Heizungsförderung)",
    method: "googlenews_search", preferredMethodAtActivation: "rss/Newsmuster BAFA — byte-genau fixieren",
    represents_type: "authority", frequenz: "ereignisnah", produktnutzen: "mittel",
    publikationsort: "bafa.de — Bundesfoerderung fuer effiziente Gebaeude (BEG), Energieeffizienz-Programme, Programmaenderungen",
    zweck: "Zentrale Foerderabwicklungsbehoerde Energieeffizienz; Foerderprogrammaenderungen sind ereignisnah politisch relevant.",
    ueberschneidung: "EIN zentraler Foerderweg statt Einzelprogramme. KfW-Foerderinfos werden NICHT separat modelliert (Future Target) — BAFA deckt den ereignisnahen Foerder-Signalbedarf zunaechst ab.",
    verifyBeforeActivation: true, verified: false
  }
];

// --- Baustein: relationales, vorbereitetes Abbild ---------------------------
function buildEnergieKlimaUmweltSeed() {
  const publishers = new Map();      // publisher_id -> publisher (nur NEUE)
  const retrievalPaths = [];
  const packagePaths = [];
  const pathExpectedLevels = [];
  const pathExpectedGeographies = [];

  function publisherIdFor(domain) {
    const meta = PUBLISHER_META[domain];
    return meta && meta.publisher_id ? meta.publisher_id : `publisher-${domain}`;
  }
  function ensurePublisher(domain) {
    const meta = PUBLISHER_META[domain] || { name: domain, type: "other", entity_id: null, evidence_role: "official_primary" };
    const id = publisherIdFor(domain);
    if (meta.reuse) return id; // bestehenden Herausgeber (destatis.de) nur referenzieren, NICHT neu einfuegen
    if (!publishers.has(id)) {
      publishers.set(id, {
        id, name: meta.name, canonical_domain: domain, publisher_type: meta.type,
        evidence_role: meta.evidence_role, trust: "unbekannt", lifecycle_status: "active",
        entity_id: meta.entity_id || null, prepared: true
      });
    }
    return id;
  }

  for (const c of KANDIDATEN) {
    const meta = PUBLISHER_META[c.domain] || {};
    const publisherId = ensurePublisher(c.domain);
    retrievalPaths.push({
      id: c.id,
      publisher_id: publisherId,
      legacy_source_id: null,
      name: c.name,
      method: c.method,
      url: gnews(c.query),
      query: c.query,
      parser: c.method === "googlenews_search" ? "googlenews-batchexecute" : null,
      priority: 60,
      status: "needs_review",     // VORBEREITET — nie healthy/active
      activation_mode: "manual",  // VORBEREITET — nie auto/always_on -> kein Auto-Crawl
      is_critical: meta.evidence_role === "official_primary",
      max_items: 16,
      represents_type: c.represents_type || null,
      tier: c.tier,
      frequenz: c.frequenz,
      verifyBeforeActivation: c.verifyBeforeActivation === true,
      verified: c.verified === true,
      prepared: true
    });
    packagePaths.push({ package_id: PACKAGE.id, retrieval_path_id: c.id });
    pathExpectedLevels.push({ retrieval_path_id: c.id, level: "bund" });
    pathExpectedGeographies.push({ retrieval_path_id: c.id, geography_id: "geo-bund" });
  }

  const tierCount = KANDIDATEN.reduce((m, c) => { m[c.tier] = (m[c.tier] || 0) + 1; return m; }, {});
  const freqCount = KANDIDATEN.reduce((m, c) => { m[c.frequenz] = (m[c.frequenz] || 0) + 1; return m; }, {});

  return {
    package: PACKAGE,
    publishers: [...publishers.values()],
    entities: NEUE_ENTITAETEN,
    retrievalPaths,
    packagePaths,
    pathExpectedLevels,
    pathExpectedGeographies,
    summary: {
      status: "prepared",
      paket: PACKAGE.key,
      neuePublisher: publishers.size,
      wiederverwendetePublisher: KANDIDATEN.filter((c) => (PUBLISHER_META[c.domain] || {}).reuse).length,
      neueEntitaeten: NEUE_ENTITAETEN.length,
      wiederverwendeteEntitaeten: 1, // statoffice-destatis
      abrufwege: retrievalPaths.length,
      abrufwegeKritisch: retrievalPaths.filter((p) => p.is_critical).length,
      paketzuordnungen: packagePaths.length,
      tier: { tier1: tierCount[1] || 0, tier2: tierCount[2] || 0, tier3: tierCount[3] || 0 },
      frequenz: freqCount,
      // Technische Inaktivitaet: KEIN Weg ist aktiv/auto/always_on/healthy.
      aktiveAbrufwege: retrievalPaths.filter((p) => p.status === "healthy" || p.activation_mode === "auto" || p.activation_mode === "always_on").length,
      // Byte-genau verifiziert: 0 (Egress gesperrt).
      technischVerifiziert: retrievalPaths.filter((p) => p.verified).length
    }
  };
}

// Future Targets + ausgeschlossene Kandidaten (dokumentiert, NICHT als Weg angelegt).
const FUTURE_TARGETS = [
  { name: "SMARD (smard.de)", grund: "Strukturierte Strommarktdatenplattform der BNetzA — eigener Datentyp/Integrationsbedarf, KEINE redaktionelle Publikationsquelle." },
  { name: "Nationaler Wasserstoffrat", grund: "Zukunftsthema Wasserstoff; Publikationsdichte/Feedlage vor Aufnahme byte-genau zu pruefen." },
  { name: "BASE (base.bund.de)", grund: "Aufsicht/Regulierung nukleare Entsorgung — nischig, ereignisbezogen; Kern nur bei konkretem Profilbedarf." },
  { name: "BGE (bge.de)", grund: "Operative Endlagerung/Standortauswahl — von BASE (Aufsicht) getrennt; ereignisbezogen, kein Kern." },
  { name: "KfW-Förderinformationen", grund: "Foerderbank — ereignisnaher Foerder-Signalbedarf zunaechst durch BAFA gedeckt; separater Weg nur bei klarem Zusatznutzen." },
  { name: "BfN (Bundesamt für Naturschutz)", grund: "Biodiversitaet/Naturschutz — fachlich relevant, aber ergaenzend; Aufnahme erst bei konkretem Bedarf." },
  { name: "Agora Energiewende / dena / Fraunhofer ISE / UFZ", grund: "Think-Tanks/Forschung, KEINE hoheitlichen Primaerquellen. Google-News-Abhaengigkeit + Ueberschneidung mit BMWE/BNetzA/Expertenrat -> vermeidet Think-Tank-Vervielfachung; Aufnahme nur bei stabilem, klarem Mehrwert." },
  { name: "Einzelne ÜNB-Newsrooms (50hertz.com/amprion.net/tennet.eu/transnetbw.de)", grund: "Vier gleichrangige Einzelwege vermieden — gemeinsamer NEP deckt den bundespolitischen Bedarf ab. Einzelweg nur bei regionaler Ausbau-/Projektkommunikation mit klarem Zusatznutzen." }
];

const AUSGESCHLOSSEN = [
  { name: "Verteilnetzbetreiber (~900)", grund: "Zu viele Einzelquellen; ueber BNetzA/NEP konsolidiert." },
  { name: "Einzelne Förderprogramm-Seiten", grund: "BAFA (und ggf. KfW) buendeln Programme; keine Einzelprogramm-Wege." },
  { name: "Tagesaktuelle Medien / NGO-Berichte (ausser Kern)", grund: "Keine hoheitlichen Primaerquellen; bundespolitische Entscheidungen basieren auf Behoerden-/Expertendaten." },
  { name: "Parallele Energie-/Umwelt-Ausschusssuchen", grund: "rp-committee-wirtschaft + rp-committee-klima-umwelt (aktiv, bund-basis) decken die Ausschussebene ab; DIP deckt Drucksachen ab." }
];

module.exports = {
  PACKAGE, NEUE_ENTITAETEN, PUBLISHER_META, KANDIDATEN, FUTURE_TARGETS, AUSGESCHLOSSEN,
  buildEnergieKlimaUmweltSeed, gnews
};
