"use strict";

// Helmut — Quellenarchitektur · Sprint 9: Quellenkandidaten Berlin & Brandenburg.
//
// REINE DATEN + REINE HELFER. Diese Datei legt die recherchierten Quellenkandidaten je
// Pflichtklasse NUR ALS „prepared" (vorbereitet) an — es wird NICHTS aktiviert, kein
// Abrufweg erzeugt, kein Crawl verdrahtet. Aktivierung ist ein spaeterer, ausdruecklich
// FREIGABEPFLICHTIGER Schritt.
//
// EHRLICHKEIT (Recherche-Vorbehalt): Die URLs sind per WebSearch belegt, aber in dieser
// Umgebung NICHT byte-genau abrufbar (Egress-Proxy blockt deutsche Gov-/Medien-Domains).
// Aus CMS-Mustern (TYPO3 `feed.rss`, WordPress `/feed/`, Brandenburg `bbo_rss`) abgeleitete
// Feed-Pfade sind mit `verifyBeforeActivation: true` markiert — vor Aktivierung byte-genau
// pruefen. Zusätzlich: parlament-berlin.de / landtag.brandenburg.de blocken generische Bots
// (403) -> realistischer User-Agent noetig (operatives Abrufrisiko).

// Die 15 Pflichtklassen je Landesmodul (Single Source: seeds/packages.js).
const { LANDESMODUL_PFLICHTKLASSEN } = require("./packages");

// recommendation: "empfohlen" | "mit_einschraenkung" | "abgelehnt"
// method: "rss" | "opendata_xml" | "api_xml" | "googlenews_search" | "html"
// Alle Eintraege sind Kandidaten mit status "prepared".
const BERLIN_KANDIDATEN = [
  { klasse: "landesparlament", publisher: "Abgeordnetenhaus von Berlin", domain: "parlament-berlin.de", url: "https://www.parlament-berlin.de/service/rss-feeds", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "niedrig", duplicateRisk: "niedrig", cost: "offen", recommendation: "empfohlen", verifyBeforeActivation: true, note: "RSS-Feeds + Landespressedienst; Bot-403 -> realistischer UA noetig." },
  { klasse: "plenum", publisher: "Abgeordnetenhaus von Berlin", domain: "parlament-berlin.de", url: "https://www.parlament-berlin.de/dokumente/open-data", method: "opendata_xml", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "mittel", cost: "offen", recommendation: "empfohlen", verifyBeforeActivation: true, note: "Plenarprotokolle via Open-Data-XML; teilt Korpus mit Drucksachen." },
  { klasse: "ausschuesse", publisher: "Abgeordnetenhaus von Berlin", domain: "parlament-berlin.de", url: "https://www.parlament-berlin.de/dokumente/sitzungsuebersicht", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "mittel", cost: "offen", recommendation: "empfohlen", verifyBeforeActivation: true, note: "Je Ausschuss eigener RSS-Feed." },
  { klasse: "drucksachen", publisher: "Abgeordnetenhaus von Berlin (PARDOK)", domain: "parlament-berlin.de", url: "https://www.parlament-berlin.de/dokumente/open-data", method: "opendata_xml", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "hoch", cost: "offen", recommendation: "empfohlen", verifyBeforeActivation: true, note: "Tägliche Open-Data-XML; EINE Rohquelle, Klassen 4-6 typbasiert ableiten." },
  { klasse: "schriftliche_anfragen", publisher: "Abgeordnetenhaus von Berlin (PARDOK)", domain: "parlament-berlin.de", url: "https://www.parlament-berlin.de/dokumente/open-data", method: "api_xml", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "hoch", cost: "offen", recommendation: "mit_einschraenkung", verifyBeforeActivation: true, note: "Typgefilterte Teilmenge der Drucksachen-XML — als FILTER, nicht als zweite Rohquelle (sonst Doppelzählung)." },
  { klasse: "gesetzgebung", publisher: "Abgeordnetenhaus / Land Berlin", domain: "parlament-berlin.de", url: "https://www.parlament-berlin.de/dokumente/open-data", method: "opendata_xml", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "hoch", cost: "offen", recommendation: "empfohlen", verifyBeforeActivation: true, note: "Gesetzentwürfe als Vorgangstyp in der Open-Data-XML; Verkündung (gesetze.berlin.de) nur ergänzend." },
  { klasse: "landesregierung", publisher: "Land Berlin — Landespressedienst", domain: "berlin.de", url: "https://www.berlin.de/presse/", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "niedrig", duplicateRisk: "mittel", cost: "offen", recommendation: "empfohlen", verifyBeforeActivation: true, note: "Landespressedienst deckt gesamten Senat ab; Institutionsfilter fuer 7-9." },
  { klasse: "staatskanzlei", publisher: "Senatskanzlei / Reg. Bürgermeister", domain: "berlin.de", url: "https://www.berlin.de/rbmskzl/aktuelles/pressemitteilungen/", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "niedrig", duplicateRisk: "mittel", cost: "offen", recommendation: "empfohlen", verifyBeforeActivation: true, note: "Teilmenge des Landespressedienstes (Institutionsfilter)." },
  { klasse: "ministerien", publisher: "Senatsverwaltungen Berlin", domain: "berlin.de", url: "https://www.berlin.de/sen/", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "mittel", cost: "offen", recommendation: "empfohlen", verifyBeforeActivation: true, note: "Je Senatsverwaltung eigener Presse-RSS über berlin.de/presse-Institutionsfilter." },
  { klasse: "landesfraktionen", publisher: "Fraktionen im Abgeordnetenhaus", domain: "parlament-berlin.de", url: "https://www.parlament-berlin.de/das-parlament/fraktionen", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "mittel", cost: "offen", recommendation: "empfohlen", verifyBeforeActivation: true, note: "Je Fraktion eigener Feed (Grüne/Linke/SPD/CDU/AfD) — Feed-Pfade byte-genau verifizieren." },
  { klasse: "regionale_leitmedien", publisher: "Tagesspiegel / Berliner Morgenpost / Berliner Zeitung", domain: "tagesspiegel.de", url: "https://www.tagesspiegel.de/contentexport/feed/berlin", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "niedrig", duplicateRisk: "hoch", cost: "paywall_volltext", recommendation: "mit_einschraenkung", verifyBeforeActivation: true, note: "RSS-Metadaten (Titel/Teaser/Datum/Link) frei; Volltext hinter Paywall. googlenews als Fallback." },
  { klasse: "oer_landesberichterstattung", publisher: "rbb24 (Rundfunk Berlin-Brandenburg)", domain: "rbb24.de", url: "https://www.rbb24.de/politik/index.xml/feed=rss.xml", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "niedrig", duplicateRisk: "hoch", cost: "offen", recommendation: "empfohlen", verifyBeforeActivation: true, note: "GLEICHER Feed wie Brandenburg (rbb = Berlin-Brandenburg) -> global deduplizieren (eine Fundstelle, zwei Paketreferenzen)." },
  { klasse: "partei_pilot", publisher: "Die Linke Berlin", domain: "dielinke.berlin", url: "https://www.dielinke.berlin/presse/", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "niedrig", duplicateRisk: "niedrig", cost: "offen", recommendation: "empfohlen", verifyBeforeActivation: true, note: "Pilot-Linie Die Linke (konsistent zum Bundes-Piloten); TYPO3-Muster feed.rss verifizieren." },
  { klasse: "fraktion_pilot", publisher: "Linksfraktion Berlin (Abgeordnetenhaus)", domain: "linksfraktion.berlin", url: "https://www.linksfraktion.berlin/aktuelles/presse/", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "niedrig", duplicateRisk: "niedrig", cost: "offen", recommendation: "empfohlen", verifyBeforeActivation: true, note: "24 MdA; feed.rss-Pfad verifizieren." },
  { klasse: "person_pilot", publisher: "Tobias Schulze (MdA, Die Linke)", domain: "tobiasschulze.berlin", url: "https://www.tobiasschulze.berlin/", method: "googlenews_search", hasDate: true, hasOriginalUrl: true, parserEffort: "niedrig", duplicateRisk: "niedrig", cost: "offen", recommendation: "empfohlen", verifyBeforeActivation: true, note: "Person-Pilot via googlenews_search (\"Tobias Schulze\" Berlin); optional eigener /feed." }
];

const BRANDENBURG_KANDIDATEN = [
  { klasse: "landesparlament", publisher: "Landtag Brandenburg", domain: "landtag.brandenburg.de", url: "https://www.landtag.brandenburg.de/de/rss-infodienste/12411", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "niedrig", duplicateRisk: "niedrig", cost: "offen", recommendation: "empfohlen", verifyBeforeActivation: true, note: "RSS-Infodienste + Pressemitteilungen; Bot-403 -> realistischer UA noetig." },
  { klasse: "plenum", publisher: "Landtag Brandenburg", domain: "landtag.brandenburg.de", url: "https://www.landtag.brandenburg.de/de/parlament/plenum_und_gesetze/uebersicht_der_plenarsitzungen/25212", method: "opendata_xml", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "mittel", cost: "offen", recommendation: "empfohlen", verifyBeforeActivation: true, note: "Plenarprotokolle in parldok-Open-Data-XML." },
  { klasse: "ausschuesse", publisher: "Landtag Brandenburg", domain: "landtag.brandenburg.de", url: "https://www.landtag.brandenburg.de/de/ausschuesse", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "mittel", cost: "offen", recommendation: "empfohlen", verifyBeforeActivation: true, note: "Tagesordnungen je Ausschuss abonnierbar (RSS)." },
  { klasse: "drucksachen", publisher: "Landtag Brandenburg (parldok)", domain: "parlamentsdokumentation.brandenburg.de", url: "https://www.parlamentsdokumentation.brandenburg.de/opendata/exportWP1.xml", method: "opendata_xml", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "hoch", cost: "offen", recommendation: "empfohlen", verifyBeforeActivation: true, note: "Tägliche Open-Data-XML (laufende WP); EINE Rohquelle, Klassen 4-6 typbasiert." },
  { klasse: "schriftliche_anfragen", publisher: "Landtag Brandenburg (parldok)", domain: "parlamentsdokumentation.brandenburg.de", url: "https://www.parlamentsdokumentation.brandenburg.de/opendata/exportWP1.xml", method: "api_xml", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "hoch", cost: "offen", recommendation: "mit_einschraenkung", verifyBeforeActivation: true, note: "Kleine/Große Anfragen als Typfilter der Drucksachen-XML — nicht doppelt crawlen." },
  { klasse: "gesetzgebung", publisher: "Landtag Brandenburg (parldok)", domain: "parlamentsdokumentation.brandenburg.de", url: "https://www.parlamentsdokumentation.brandenburg.de/opendata/exportWP1.xml", method: "opendata_xml", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "hoch", cost: "offen", recommendation: "empfohlen", verifyBeforeActivation: true, note: "Gesetzentwürfe als Vorgangstyp; Verkündung BRAVORS nur ergänzend." },
  { klasse: "landesregierung", publisher: "Landesregierung Brandenburg", domain: "landesregierung-brandenburg.de", url: "https://www.landesregierung-brandenburg.de/", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "mittel", cost: "offen", recommendation: "empfohlen", verifyBeforeActivation: true, note: "Aggregiert Ministeriums-PM; zentraler bbo_rss-Feed." },
  { klasse: "staatskanzlei", publisher: "Staatskanzlei Brandenburg", domain: "stk.brandenburg.de", url: "https://www.stk.brandenburg.de/", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "mittel", cost: "offen", recommendation: "empfohlen", verifyBeforeActivation: true, note: "Presseinformationen der Staatskanzlei (bbo_rss-Muster)." },
  { klasse: "ministerien", publisher: "Ministerien Brandenburg (MIL/MWFK/MIK/…)", domain: "brandenburg.de", url: "https://mil.brandenburg.de/mil/de/rss/", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "niedrig", duplicateRisk: "mittel", cost: "offen", recommendation: "empfohlen", verifyBeforeActivation: true, note: "Einheitliches bbo_rss-Muster je Haus; konkrete Pfade je Ministerium verifizieren." },
  { klasse: "landesfraktionen", publisher: "Landtagsfraktionen (SPD/AfD/BSW/CDU)", domain: "landtag.brandenburg.de", url: "https://www.landtag.brandenburg.de/de/fraktionen", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "mittel", cost: "offen", recommendation: "empfohlen", verifyBeforeActivation: true, note: "8. WP: NUR SPD/AfD/BSW/CDU (Linke/Grüne/BVB ausgeschieden). Feeds (WordPress /feed/) verifizieren." },
  { klasse: "regionale_leitmedien", publisher: "Märkische Allgemeine (MAZ) / Lausitzer Rundschau", domain: "maz-online.de", url: "https://news.google.com/rss/search?q=site:maz-online.de", method: "googlenews_search", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "hoch", cost: "paywall_kein_feed", recommendation: "mit_einschraenkung", verifyBeforeActivation: true, note: "MAZ+ Paywall + KEIN öffentlicher RSS -> nur googlenews_search (Metadaten). Direkt-RSS ABGELEHNT." },
  { klasse: "oer_landesberichterstattung", publisher: "rbb24 (Rundfunk Berlin-Brandenburg)", domain: "rbb24.de", url: "https://www.rbb24.de/politik/index.xml/feed=rss.xml", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "niedrig", duplicateRisk: "hoch", cost: "offen", recommendation: "empfohlen", verifyBeforeActivation: true, note: "GLEICHER Feed wie Berlin -> global deduplizieren (eine Fundstelle, zwei Paketreferenzen)." },
  { klasse: "partei_pilot", publisher: "Die Linke Brandenburg", domain: "dielinke-brandenburg.de", url: "https://www.dielinke-brandenburg.de/nc/politik/aktuell/feed.rss", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "niedrig", duplicateRisk: "niedrig", cost: "offen", recommendation: "empfohlen", verifyBeforeActivation: true, note: "feed.rss real belegt; Partei-Pilot Die Linke (Partei existiert, auch ohne Landtagsfraktion)." },
  { klasse: "fraktion_pilot", publisher: "SPD-Fraktion Brandenburg (Landtag)", domain: "spd-fraktion-brandenburg.de", url: "https://www.spd-fraktion-brandenburg.de/presse/", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "niedrig", cost: "offen", recommendation: "mit_einschraenkung", verifyBeforeActivation: true, note: "AUSWEICH: Die Linke hat KEINE Landtagsfraktion (8. WP) -> Regierungsfraktion SPD als Pilot; WordPress /feed verifizieren." },
  { klasse: "person_pilot", publisher: "Björn Lüttmann (MdL, SPD-Fraktionsvors.)", domain: "bjoern-luettmann.de", url: "https://www.bjoern-luettmann.de/", method: "googlenews_search", hasDate: true, hasOriginalUrl: true, parserEffort: "niedrig", duplicateRisk: "niedrig", cost: "offen", recommendation: "mit_einschraenkung", verifyBeforeActivation: true, note: "AUSWEICH: kein Die-Linke-MdL verfügbar -> SPD-Fraktionsvors. als Person-Pilot; googlenews_search." }
];

// Ausdrücklich abgelehnte Kandidaten (mit Grund) — für Transparenz im Admin/Doku.
const ABGELEHNTE_KANDIDATEN = [
  { land: "brandenburg", klasse: "regionale_leitmedien", kandidat: "MAZ maz-online.de als Direkt-RSS", grund: "Kein öffentlicher RSS-Feed + harte MAZ+-Paywall. Ersatz: googlenews_search site:maz-online.de." },
  { land: "brandenburg", klasse: "fraktion_pilot", kandidat: "linksfraktion-brandenburg.de als aktiver Pilot", grund: "Die Linke ist in der 8. WP NICHT im Landtag — keine aktive Landtagsfraktion. Nur die Partei (partei_pilot) ist valide." },
  { land: "berlin", klasse: "gesetzgebung", kandidat: "gesetze.berlin.de / gvbl-berlin.de als eigener Feed", grund: "Kein RSS/Feed, nur HTML/PDF-Datenbank -> hoher Scrape-Aufwand. Gesetzgebung über Open-Data-Vorgangstyp abbilden." },
  { land: "brandenburg", klasse: "gesetzgebung", kandidat: "bravors.brandenburg.de als eigener Feed", grund: "Kein RSS/Feed (StarWeb/HTML). Gesetzgebung über parldok-Vorgangstyp; BRAVORS nur ergänzend." },
  { land: "beide", klasse: "schriftliche_anfragen", kandidat: "schriftliche Anfragen als zweite Rohquelle", grund: "Typgefilterte Teilmenge der Drucksachen-Open-Data-XML — separates Crawlen = Doppelzählung. Als Filter führen." }
];

// Dedup-/Überschneidungshinweise (für globale Referenzzählung, model.js).
const DEDUP_HINWEISE = [
  "rbb24-Politik-Feed ist IDENTISCH für Berlin und Brandenburg -> eine Fundstelle, zwei Paketreferenzen (nicht doppelt crawlen).",
  "Innerhalb eines Landes speisen sich Klassen 4-6 (Drucksachen/Anfragen/Gesetzgebung) aus EINER Open-Data-XML -> eine Rohquelle, typbasierte Klassenzuordnung.",
  "landesregierung ⊃ staatskanzlei ⊃ ministerien laufen über EINEN Landespressedienst (Berlin) bzw. bbo_rss-Aggregat (Brandenburg) -> Institutionsfilter, Rohabruf einmalig."
];

const LANDESMODUL_KANDIDATEN = { berlin: BERLIN_KANDIDATEN, brandenburg: BRANDENBURG_KANDIDATEN };

// --- Reine Helfer -----------------------------------------------------------
// Zusammenfassung je Land: Klassenabdeckung + Empfehlungslage. status ist IMMER "prepared".
function summarizeLand(kandidaten) {
  const byKlasse = new Set(kandidaten.map((k) => k.klasse));
  const covered = LANDESMODUL_PFLICHTKLASSEN.filter((c) => byKlasse.has(c));
  const missing = LANDESMODUL_PFLICHTKLASSEN.filter((c) => !byKlasse.has(c));
  return {
    total: kandidaten.length,
    klassenAbgedeckt: covered.length,
    klassenFehlend: missing,
    empfohlen: kandidaten.filter((k) => k.recommendation === "empfohlen").length,
    mitEinschraenkung: kandidaten.filter((k) => k.recommendation === "mit_einschraenkung").length,
    zuVerifizieren: kandidaten.filter((k) => k.verifyBeforeActivation).length,
    methoden: kandidaten.reduce((m, k) => { m[k.method] = (m[k.method] || 0) + 1; return m; }, {})
  };
}

function candidateSummary() {
  return {
    pflichtklassen: LANDESMODUL_PFLICHTKLASSEN.length,
    berlin: summarizeLand(BERLIN_KANDIDATEN),
    brandenburg: summarizeLand(BRANDENBURG_KANDIDATEN),
    abgelehnt: ABGELEHNTE_KANDIDATEN.length,
    // Alle Kandidaten sind Vorschläge; NICHTS ist aktiviert.
    aktiviert: 0,
    status: "prepared"
  };
}

module.exports = {
  LANDESMODUL_KANDIDATEN,
  BERLIN_KANDIDATEN,
  BRANDENBURG_KANDIDATEN,
  ABGELEHNTE_KANDIDATEN,
  DEDUP_HINWEISE,
  candidateSummary,
  summarizeLand
};
