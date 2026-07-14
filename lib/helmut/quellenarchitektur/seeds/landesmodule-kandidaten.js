"use strict";

// Helmut — Quellenarchitektur · Sprint 9: Quellenkandidaten Berlin & Brandenburg.
//
// REINE DATEN + REINE HELFER. Diese Datei legt die recherchierten Quellenkandidaten je
// Pflichtklasse NUR ALS „prepared" (vorbereitet) an — es wird NICHTS aktiviert, kein
// Abrufweg erzeugt, kein Crawl verdrahtet. Aktivierung ist ein spaeterer, ausdruecklich
// FREIGABEPFLICHTIGER Schritt.
//
// REIFEGRAD (Sprint-9-Korrektur 2): Kandidatenabdeckung ist NICHT Einsatzbereitschaft.
// Jeder Eintrag traegt einen Reifegrad (`readiness`) auf einer geordneten Skala:
//   unbesetzt   — keine Quelle vorgesehen (bewusst offen, bis ein echtes Profil feststeht)
//   kandidat    — recherchiert, aber NICHT byte-genau technisch verifiziert
//   verifiziert — URL/Feed byte-genau geprueft (Struktur, Datum, Original-URL)
//   bereit      — verifiziert UND zur Aktivierung freigegeben
//   aktiv       — laeuft in Production
// Heute ist JEDE besetzte Klasse hoechstens `kandidat` (der Egress-Proxy verhindert die
// byte-genaue Verifikation). Berlin/Brandenburg sind damit Kandidaten-abgedeckt, aber NICHT
// einsatzbereit.
//
// PILOT-KORREKTUR (Sprint-9-Korrektur 1): Ein fehlender ECHTER Pilot wird NICHT durch eine
// andere Partei/Person ersetzt. Brandenburg `fraktion_pilot` und `person_pilot` bleiben
// `unbesetzt`, bis ein echtes Pilotprofil feststeht. Das allgemeine Brandenburg-Paket darf die
// realen Landtagsfraktionen (SPD/AfD/BSW/CDU) enthalten; Die Linke Brandenburg darf als PARTEI
// (`partei_pilot`) beobachtet werden — nur die pilotbezogenen Fraktions-/Personenquellen bleiben leer.
//
// EHRLICHKEIT (Recherche-Vorbehalt): Die URLs sind per WebSearch belegt, aber in dieser
// Umgebung NICHT byte-genau abrufbar (Egress-Proxy blockt deutsche Gov-/Medien-Domains).
// Aus CMS-Mustern (TYPO3 `feed.rss`, WordPress `/feed/`, Brandenburg `bbo_rss`) abgeleitete
// Feed-Pfade sind mit `verifyBeforeActivation: true` markiert — vor Aktivierung byte-genau
// pruefen. Zusätzlich: parlament-berlin.de / landtag.brandenburg.de blocken generische Bots
// (403) -> realistischer User-Agent noetig (operatives Abrufrisiko).

// Die 15 Pflichtklassen je Landesmodul (Single Source: seeds/packages.js).
const { LANDESMODUL_PFLICHTKLASSEN } = require("./packages");

// Reifegrad-Skala (geordnet). Index = Fortschritt Richtung Aktivierung.
const READINESS_STUFEN = ["unbesetzt", "kandidat", "verifiziert", "bereit", "aktiv"];
const READINESS_RANG = Object.freeze(READINESS_STUFEN.reduce((m, s, i) => { m[s] = i; return m; }, {}));

// Zuordnung Landmodul -> geography_id im Katalog (fuer den Admin-Report-Rollup).
const LAND_GEOGRAPHY = Object.freeze({ berlin: "geo-land-berlin", brandenburg: "geo-land-brandenburg" });

// recommendation: "empfohlen" | "mit_einschraenkung" | "abgelehnt" | "offen" (nur unbesetzt)
// method: "rss" | "opendata_xml" | "api_xml" | "googlenews_search" | "html" | null (unbesetzt)
// readiness: siehe READINESS_STUFEN. Alle besetzten Eintraege sind aktuell "kandidat".
// evidenceRole: official_primary | direct_interest | journalistic | data_source | aggregator
// produktnutzen: "hoch" | "mittel" | "niedrig"  · stabileAdresse: true = kanonischer Deep-Link,
//   false = Landing/Hub, konkreter Feed-/Endpunkt-Pfad ist vor Aktivierung noch zu fixieren.
// URLs technisch geprueft (Sprint-9-Vertiefung, WebSearch) — vor Aktivierung byte-genau verifizieren.
const BERLIN_KANDIDATEN = [
  { klasse: "landesparlament", publisher: "Abgeordnetenhaus von Berlin", domain: "parlament-berlin.de", url: "https://www.parlament-berlin.de/service/rss-feeds", method: "rss", parserEffort: "niedrig", duplicateRisk: "niedrig", evidenceRole: "official_primary", produktnutzen: "hoch", stabileAdresse: false, cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "RSS-Feed-Hub; konkreten „Aktuelle Pressemitteilungen\"-Feed extrahieren. Bot-403 -> realistischer UA noetig." },
  { klasse: "plenum", publisher: "Abgeordnetenhaus von Berlin (PARDOK)", domain: "parlament-berlin.de", url: "https://www.parlament-berlin.de/opendata/pardok-wp19.xml", method: "opendata_xml", parserEffort: "mittel", duplicateRisk: "hoch", evidenceRole: "official_primary", produktnutzen: "hoch", stabileAdresse: true, cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "PARDOK-XML (eigene DTD, NICHT OParl), Typ Plenarprotokoll. EINE Rohquelle fuer Klassen 2/4/5/6. WP-Nummer (wp19) vor/nach LTW 2026 pruefen." },
  { klasse: "ausschuesse", publisher: "Abgeordnetenhaus von Berlin", domain: "parlament-berlin.de", url: "https://www.parlament-berlin.de/service/rss-feeds", method: "rss", parserEffort: "mittel", duplicateRisk: "mittel", evidenceRole: "official_primary", produktnutzen: "hoch", stabileAdresse: false, cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "Ausschuss-Material-RSS am Feed-Hub + Ausschussprotokolle aus PARDOK-XML. Konkrete Feed-URLs je Ausschuss fixieren." },
  { klasse: "drucksachen", publisher: "Abgeordnetenhaus von Berlin (PARDOK)", domain: "parlament-berlin.de", url: "https://www.parlament-berlin.de/opendata/pardok-wp19.xml", method: "opendata_xml", parserEffort: "mittel", duplicateRisk: "hoch", evidenceRole: "official_primary", produktnutzen: "hoch", stabileAdresse: true, cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "Taegliche PARDOK-XML (Download-Deep-Link, nicht Landingpage). Kern-Rohquelle; Klassen 4-6 typbasiert splitten." },
  { klasse: "schriftliche_anfragen", publisher: "Abgeordnetenhaus von Berlin (PARDOK)", domain: "parlament-berlin.de", url: "https://www.parlament-berlin.de/opendata/pardok-wp19.xml", method: "opendata_xml", parserEffort: "mittel", duplicateRisk: "hoch", evidenceRole: "official_primary", produktnutzen: "hoch", stabileAdresse: true, cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "Dokumenttyp „Schriftliche Anfrage\" als FILTER der EINEN PARDOK-XML — nicht als zweite Rohquelle crawlen (Doppelzaehlung)." },
  { klasse: "gesetzgebung", publisher: "Abgeordnetenhaus / Land Berlin (PARDOK)", domain: "parlament-berlin.de", url: "https://www.parlament-berlin.de/opendata/pardok-wp19.xml", method: "opendata_xml", parserEffort: "mittel", duplicateRisk: "hoch", evidenceRole: "official_primary", produktnutzen: "hoch", stabileAdresse: true, cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "Vorgangstyp Gesetz/Vorlage z. Beschluss als Filter der PARDOK-XML; Verkuendung (gesetze.berlin.de) nur ergaenzend." },
  { klasse: "landesregierung", publisher: "Land Berlin — Landespressedienst", domain: "berlin.de", url: "https://www.berlin.de/presse/pressemitteilungen/index/feed", method: "rss", parserEffort: "niedrig", duplicateRisk: "hoch", evidenceRole: "official_primary", produktnutzen: "hoch", stabileAdresse: true, cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "LPD-Gesamtfeed (index/feed) deckt Senatskanzlei + alle Senatsverwaltungen ab -> Oberklasse von 8/9. Institutionsfilter statt Mehrfach-Crawl." },
  { klasse: "staatskanzlei", publisher: "Senatskanzlei / Reg. Bürgermeister", domain: "berlin.de", url: "https://www.berlin.de/presse/pressemitteilungen/index/feed?institutions[]=Senatskanzlei", method: "rss", parserEffort: "niedrig", duplicateRisk: "hoch", evidenceRole: "official_primary", produktnutzen: "mittel", stabileAdresse: false, cost: "offen", recommendation: "mit_einschraenkung", readiness: "kandidat", verifyBeforeActivation: true, note: "Gefilterte Sicht (institutions[]) des LPD-Gesamtfeeds — Teilmenge von 7, nicht separat crawlen. Exakten Institutionsnamen verifizieren." },
  { klasse: "ministerien", publisher: "Senatsverwaltungen Berlin", domain: "berlin.de", url: "https://www.berlin.de/presse/pressemitteilungen/index/feed", method: "rss", parserEffort: "niedrig", duplicateRisk: "hoch", evidenceRole: "official_primary", produktnutzen: "hoch", stabileAdresse: false, cost: "offen", recommendation: "mit_einschraenkung", readiness: "kandidat", verifyBeforeActivation: true, note: "Je Senatsverwaltung als institutions[]-Filter des LPD-Feeds (NICHT berlin.de/sen/ — das ist ein Verzeichnis, kein Feed). Teilmenge von 7." },
  { klasse: "landesfraktionen", publisher: "Fraktionen im Abgeordnetenhaus (CDU/SPD/Grüne/Linke/AfD)", domain: "parlament-berlin.de", url: "https://www.parlament-berlin.de/das-parlament/fraktionen", method: "rss", parserEffort: "mittel", duplicateRisk: "mittel", evidenceRole: "direct_interest", produktnutzen: "mittel", stabileAdresse: false, cost: "offen", recommendation: "mit_einschraenkung", readiness: "kandidat", verifyBeforeActivation: true, note: "„/das-parlament/fraktionen\" ist Landing (KEIN RSS) -> Buendel der 5 Einzel-Fraktions-Feeds noetig; Linke-Anteil dubliert Klasse 14." },
  { klasse: "regionale_leitmedien", publisher: "Tagesspiegel", domain: "tagesspiegel.de", url: "https://www.tagesspiegel.de/contentexport/feed/berlin", method: "rss", parserEffort: "niedrig", duplicateRisk: "mittel", evidenceRole: "journalistic", produktnutzen: "mittel", stabileAdresse: true, cost: "paywall_volltext", recommendation: "mit_einschraenkung", readiness: "kandidat", verifyBeforeActivation: true, note: "RSS-Metadaten frei; „Tagesspiegel Plus\" (9,99€/Monat) -> nur Teaser fuer Plus-Artikel. Fuer Erkennung ausreichend, Volltext eingeschraenkt." },
  { klasse: "oer_landesberichterstattung", publisher: "rbb24 (Rundfunk Berlin-Brandenburg)", domain: "rbb24.de", url: "https://www.rbb24.de/politik/index.xml/feed=rss.xml", method: "rss", parserEffort: "niedrig", duplicateRisk: "hoch", evidenceRole: "journalistic", produktnutzen: "mittel", stabileAdresse: true, cost: "offen", recommendation: "mit_einschraenkung", readiness: "kandidat", verifyBeforeActivation: true, note: "/politik mischt Berlin UND Brandenburg (rbb = Zwei-Laender-Sender) -> IDENTISCH mit Brandenburg, cross-modul deduplizieren + ggf. geo-filtern." },
  { klasse: "partei_pilot", publisher: "Die Linke Berlin", domain: "dielinke.berlin", url: "https://www.dielinke.berlin/presse/feed.rss", method: "rss", parserEffort: "niedrig", duplicateRisk: "mittel", evidenceRole: "direct_interest", produktnutzen: "mittel", stabileAdresse: false, cost: "offen", recommendation: "mit_einschraenkung", readiness: "kandidat", verifyBeforeActivation: true, note: "Domain dielinke.berlin (ohne www). Presseseite aktiv (PM bis Jan 2026); /presse/feed.rss aus CMS-Muster abgeleitet, unbestaetigt." },
  { klasse: "fraktion_pilot", publisher: "Linksfraktion Berlin (Abgeordnetenhaus)", domain: "linksfraktion.berlin", url: "https://www.linksfraktion.berlin/aktuelles/presse/feed.rss", method: "rss", parserEffort: "niedrig", duplicateRisk: "mittel", evidenceRole: "direct_interest", produktnutzen: "hoch", stabileAdresse: true, cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "CMS unterstuetzt /feed.rss an Sektionspfaden (belegt) -> Deep-Link statt Landing. Aktiv (Maerz 2026)." },
  { klasse: "person_pilot", publisher: "Tobias Schulze (MdA, Die Linke, Fraktionsvors.)", domain: "tobiasschulze.berlin", url: "https://news.google.com/rss/search?q=%22Tobias%20Schulze%22%20Berlin", method: "googlenews_search", parserEffort: "niedrig", duplicateRisk: "hoch", evidenceRole: "aggregator", produktnutzen: "mittel", stabileAdresse: true, cost: "offen", recommendation: "mit_einschraenkung", readiness: "kandidat", verifyBeforeActivation: true, note: "Seit Juni 2024 Fraktionsvors. -> starke Ueberschneidung mit Klasse 14. googlenews fuer journalistische Breite; nativer Feed .../abgeordnete/tobias-schulze/news/feed.rss dubliert 14." }
];

// Platzhalter fuer eine bewusst UNBESETZTE Pilotklasse (kein Ersatz durch fremde Partei/Person).
function unbesetztePilotklasse(klasse, note) {
  return { klasse, publisher: null, domain: null, url: null, method: null, parserEffort: null, duplicateRisk: null, evidenceRole: null, produktnutzen: null, stabileAdresse: null, cost: null, recommendation: "offen", readiness: "unbesetzt", verifyBeforeActivation: false, note };
}

const BRANDENBURG_KANDIDATEN = [
  { klasse: "landesparlament", publisher: "Landtag Brandenburg", domain: "landtag.brandenburg.de", url: "https://www.landtag.brandenburg.de/de/rss-infodienste/12411", method: "rss", parserEffort: "niedrig", duplicateRisk: "niedrig", evidenceRole: "official_primary", produktnutzen: "hoch", stabileAdresse: false, cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "RSS-Infodienste-Hub (12411); konkreten „Aktuelles/Meldungen\"-Feed extrahieren. Bot-403 -> realistischer UA noetig." },
  { klasse: "plenum", publisher: "Landtag Brandenburg (parldok)", domain: "parlamentsdokumentation.brandenburg.de", url: "https://www.parlamentsdokumentation.brandenburg.de/opendata/exportWP8.xml", method: "opendata_xml", parserEffort: "mittel", duplicateRisk: "hoch", evidenceRole: "official_primary", produktnutzen: "hoch", stabileAdresse: true, cost: "offen", recommendation: "mit_einschraenkung", readiness: "kandidat", verifyBeforeActivation: true, note: "Plenarprotokolle als Typfilter der parldok-XML (Seite 25212 ist nur HTML-Uebersicht). EINE Rohquelle fuer 2/4/5/6." },
  { klasse: "ausschuesse", publisher: "Landtag Brandenburg", domain: "landtag.brandenburg.de", url: "https://www.landtag.brandenburg.de/de/ausschuesse", method: "rss", parserEffort: "mittel", duplicateRisk: "niedrig", evidenceRole: "official_primary", produktnutzen: "hoch", stabileAdresse: false, cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "Kein zentraler Sammelfeed — je Fachausschuss eigener Feed -> Aggregationsliste noetig." },
  { klasse: "drucksachen", publisher: "Landtag Brandenburg (parldok)", domain: "parlamentsdokumentation.brandenburg.de", url: "https://www.parlamentsdokumentation.brandenburg.de/opendata/exportWP8.xml", method: "opendata_xml", parserEffort: "mittel", duplicateRisk: "hoch", evidenceRole: "official_primary", produktnutzen: "hoch", stabileAdresse: true, cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "KORRIGIERT: exportWP8.xml = 8. WP (2024-2029). exportWP1.xml waere die 1. WP (1990-1994)! Kern-Rohquelle, taegliche Aktualisierung." },
  { klasse: "schriftliche_anfragen", publisher: "Landtag Brandenburg (parldok)", domain: "parlamentsdokumentation.brandenburg.de", url: "https://www.parlamentsdokumentation.brandenburg.de/opendata/exportWP8.xml", method: "opendata_xml", parserEffort: "mittel", duplicateRisk: "hoch", evidenceRole: "official_primary", produktnutzen: "hoch", stabileAdresse: true, cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "Kleine/Große Anfragen als Typfilter der EINEN exportWP8.xml — nicht doppelt crawlen." },
  { klasse: "gesetzgebung", publisher: "Landtag Brandenburg (parldok)", domain: "parlamentsdokumentation.brandenburg.de", url: "https://www.parlamentsdokumentation.brandenburg.de/opendata/exportWP8.xml", method: "opendata_xml", parserEffort: "mittel", duplicateRisk: "hoch", evidenceRole: "official_primary", produktnutzen: "hoch", stabileAdresse: true, cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "Gesetzentwuerfe als Vorgangstyp-Filter der exportWP8.xml; Verkuendung BRAVORS nur ergaenzend." },
  { klasse: "landesregierung", publisher: "Landesregierung Brandenburg", domain: "landesregierung-brandenburg.de", url: "https://www.landesregierung-brandenburg.de/", method: "rss", parserEffort: "niedrig", duplicateRisk: "mittel", evidenceRole: "official_primary", produktnutzen: "hoch", stabileAdresse: false, cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "bbo_rss-Aggregat-Feed (list.php?page=bb_rss-Muster) aller Ressort-PM -> Oberklasse von 8/9. Exakte Aggregat-URL verifizieren." },
  { klasse: "staatskanzlei", publisher: "Staatskanzlei Brandenburg", domain: "stk.brandenburg.de", url: "https://www.stk.brandenburg.de/", method: "rss", parserEffort: "mittel", duplicateRisk: "hoch", evidenceRole: "official_primary", produktnutzen: "mittel", stabileAdresse: false, cost: "offen", recommendation: "mit_einschraenkung", readiness: "kandidat", verifyBeforeActivation: true, note: "Kein eigenstaendiger stk-Feed nachgewiesen; STK-PM laufen ueber das Landesregierungs-Aggregat (bbo_rss-Knoten) -> Teilmenge von 7." },
  { klasse: "ministerien", publisher: "Ministerien Brandenburg (MIL/MWFK/MIK/…)", domain: "brandenburg.de", url: "https://mil.brandenburg.de/mil/de/rss/", method: "rss", parserEffort: "mittel", duplicateRisk: "mittel", evidenceRole: "official_primary", produktnutzen: "hoch", stabileAdresse: false, cost: "offen", recommendation: "mit_einschraenkung", readiness: "kandidat", verifyBeforeActivation: true, note: "bbo_rss je Haus (Content-ID pro Ministerium verschieden; MIL-Neu-CMS-Pfad weicht ab) -> konkrete Feed-Pfade einzeln fixieren." },
  { klasse: "landesfraktionen", publisher: "Landtagsfraktionen (SPD/AfD/CDU/BSW)", domain: "landtag.brandenburg.de", url: "https://www.landtag.brandenburg.de/de/fraktionen", method: "rss", parserEffort: "mittel", duplicateRisk: "niedrig", evidenceRole: "direct_interest", produktnutzen: "hoch", stabileAdresse: false, cost: "offen", recommendation: "mit_einschraenkung", readiness: "kandidat", verifyBeforeActivation: true, note: "8. WP: NUR SPD/AfD/CDU/BSW (Linke/Gruene/BVB ausgeschieden). Hub ist HTML; RSS je Fraktion nicht garantiert -> einzeln pruefen." },
  { klasse: "regionale_leitmedien", publisher: "Märkische Allgemeine (MAZ) / Lausitzer Rundschau", domain: "maz-online.de", url: "https://news.google.com/rss/search?q=site:maz-online.de", method: "googlenews_search", parserEffort: "mittel", duplicateRisk: "mittel", evidenceRole: "journalistic", produktnutzen: "mittel", stabileAdresse: true, cost: "paywall_kein_feed", recommendation: "mit_einschraenkung", readiness: "kandidat", verifyBeforeActivation: true, note: "MAZ+ Paywall + KEIN oeffentlicher RSS -> googlenews_search (nur Anrisse). Lausitzer Rundschau = lr-online.de (zweiten Query ergaenzen)." },
  { klasse: "oer_landesberichterstattung", publisher: "rbb24 (Rundfunk Berlin-Brandenburg)", domain: "rbb24.de", url: "https://www.rbb24.de/politik/index.xml/feed=rss.xml", method: "rss", parserEffort: "niedrig", duplicateRisk: "hoch", evidenceRole: "journalistic", produktnutzen: "mittel", stabileAdresse: true, cost: "offen", recommendation: "mit_einschraenkung", readiness: "kandidat", verifyBeforeActivation: true, note: "GLEICHER Feed wie Berlin (rbb = Zwei-Laender-Sender) -> cross-modul deduplizieren (eine Fundstelle, zwei Paketreferenzen)." },
  { klasse: "partei_pilot", publisher: "Die Linke Brandenburg", domain: "dielinke-brandenburg.de", url: "https://www.dielinke-brandenburg.de/nc/politik/aktuell/feed.rss", method: "rss", parserEffort: "niedrig", duplicateRisk: "niedrig", evidenceRole: "direct_interest", produktnutzen: "mittel", stabileAdresse: true, cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "feed.rss belegt; Partei-Pilot Die Linke (existiert als Partei, aber 8. WP unter 5% -> KEINE Landtagsfraktion)." },
  // KORREKTUR 1: KEIN SPD-Ausweich. Pilotbezogene Fraktions-/Personenquellen bleiben UNBESETZT,
  // bis ein echtes Pilotprofil (mit realer Landtagsfraktion) feststeht. Bestätigt: Die Linke bei
  // der LTW 22.09.2024 unter 5% -> 8. WP nur SPD/AfD/CDU/BSW.
  unbesetztePilotklasse("fraktion_pilot", "UNBESETZT: Die Linke hat in der 8. WP KEINE Landtagsfraktion in Brandenburg (LTW 22.09.2024 unter 5%). Ein fehlender echter Pilot wird NICHT durch eine andere Partei (z. B. SPD) ersetzt — bleibt offen, bis ein echtes Pilotprofil feststeht. Reale Fraktionen laufen ueber die allgemeine Klasse `landesfraktionen`."),
  unbesetztePilotklasse("person_pilot", "UNBESETZT: kein echter Die-Linke-Pilot (kein MdL der Linken in der 8. WP). Keine Ersatzperson aus einer anderen Partei — bleibt offen, bis ein echtes Pilotprofil feststeht.")
];

// Ausdrücklich abgelehnte Kandidaten (mit Grund) — für Transparenz im Admin/Doku.
const ABGELEHNTE_KANDIDATEN = [
  { land: "brandenburg", klasse: "regionale_leitmedien", kandidat: "MAZ maz-online.de als Direkt-RSS", grund: "Kein öffentlicher RSS-Feed + harte MAZ+-Paywall. Ersatz: googlenews_search site:maz-online.de." },
  { land: "brandenburg", klasse: "fraktion_pilot", kandidat: "SPD-Fraktion Brandenburg als Pilot-Ersatz", grund: "Ein fehlender echter Pilot (Die Linke, 8. WP nicht im Landtag) wird NICHT durch eine andere Partei ersetzt. fraktion_pilot bleibt unbesetzt bis echtes Pilotprofil." },
  { land: "brandenburg", klasse: "person_pilot", kandidat: "Björn Lüttmann (SPD) als Pilot-Personen-Ersatz", grund: "Keine Ersatzperson aus fremder Partei. person_pilot bleibt unbesetzt bis echtes Pilotprofil." },
  { land: "brandenburg", klasse: "fraktion_pilot", kandidat: "linksfraktion-brandenburg.de als aktive Fraktion", grund: "Die Linke ist in der 8. WP NICHT im Landtag — es gibt keine aktive Linksfraktion. Nur die Partei (partei_pilot) ist valide." },
  { land: "berlin", klasse: "gesetzgebung", kandidat: "gesetze.berlin.de / gvbl-berlin.de als eigener Feed", grund: "Kein RSS/Feed, nur HTML/PDF-Datenbank -> hoher Scrape-Aufwand. Gesetzgebung über Open-Data-Vorgangstyp abbilden." },
  { land: "brandenburg", klasse: "gesetzgebung", kandidat: "bravors.brandenburg.de als eigener Feed", grund: "Kein RSS/Feed (StarWeb/HTML). Gesetzgebung über parldok-Vorgangstyp; BRAVORS nur ergänzend." },
  { land: "beide", klasse: "schriftliche_anfragen", kandidat: "schriftliche Anfragen als zweite Rohquelle", grund: "Typgefilterte Teilmenge der Drucksachen-Open-Data-XML — separates Crawlen = Doppelzählung. Als Filter führen." },
  // Technische Prüfung (Sprint-9-Vertiefung):
  { land: "berlin", klasse: "ministerien", kandidat: "berlin.de/sen/ als RSS-Feed", grund: "berlin.de/sen/ ist ein Verzeichnis, KEIN Feed. Senatsverwaltungen über institutions[]-Filter des LPD-Feeds (berlin.de/presse/pressemitteilungen/index/feed)." },
  { land: "berlin", klasse: "landesfraktionen", kandidat: "parlament-berlin.de/das-parlament/fraktionen als RSS", grund: "Ist eine Kontakt-/Landingpage der 5 Fraktionen, KEIN RSS. Bündel der 5 Einzel-Fraktions-Feeds nötig." },
  { land: "berlin", klasse: "drucksachen", kandidat: "OParl-Schnittstelle (Berliner Open-Data-Portal)", grund: "OParl war nur angekündigt, Doku „noch nicht verfügbar\". Realer Weg = PARDOK-XML mit eigener DTD (pardok-wp19.xml). OParl bei Live-Gang später prüfen." },
  { land: "brandenburg", klasse: "drucksachen", kandidat: "exportWP1.xml als laufende Wahlperiode", grund: "exportWP[N].xml folgt der WP-Nummer: WP1 = 1990-1994. Die laufende 8. WP liegt unter exportWP8.xml (Sprint-9-Datenkorrektur)." }
];

// Dedup-/Überschneidungshinweise (für globale Referenzzählung, model.js).
const DEDUP_HINWEISE = [
  "rbb24-Politik-Feed ist IDENTISCH für Berlin und Brandenburg (rbb = Zwei-Länder-Sender) -> eine Fundstelle, zwei Paketreferenzen (nicht doppelt crawlen; ggf. nachgelagert geo-filtern).",
  "Innerhalb eines Landes speisen sich Klassen 2/4/5/6 (Plenum/Drucksachen/Anfragen/Gesetzgebung) aus EINER Open-Data-XML (Berlin pardok-wp19.xml, Brandenburg exportWP8.xml) -> eine Rohquelle, typbasierte Klassenzuordnung.",
  "landesregierung ⊃ staatskanzlei ⊃ ministerien laufen über EINEN Feed (Berlin: LPD-Gesamtfeed index/feed mit institutions[]-Filter; Brandenburg: bbo_rss-Aggregat) -> Institutionsfilter, Rohabruf einmalig.",
  "Berlin person_pilot (Tobias Schulze) ⊂ fraktion_pilot (Linksfraktion): Schulze ist Fraktionsvorsitzender -> starke Überschneidung; person_pilot als googlenews für journalistische Breite."
];

const LANDESMODUL_KANDIDATEN = { berlin: BERLIN_KANDIDATEN, brandenburg: BRANDENBURG_KANDIDATEN };

// --- Reine Helfer -----------------------------------------------------------

// Reifegrad-Zaehlung ueber eine Kandidatenliste. Ein unbekannter/fehlender readiness-Wert
// wird EHRLICH als `unknown` gezaehlt (Datenfehler sichtbar machen) — NICHT still nach
// `kandidat` absorbiert, das wuerde die Abdeckung schoenen.
function readinessRollup(kandidaten) {
  const r = { unbesetzt: 0, kandidat: 0, verifiziert: 0, bereit: 0, aktiv: 0, unknown: 0 };
  for (const k of kandidaten) { const s = (k && READINESS_RANG[k.readiness] != null) ? k.readiness : "unknown"; r[s] += 1; }
  return r;
}

// Zusammenfassung je Land: Klassenabdeckung (nur BESETZTE), Reifegrad, Empfehlungslage.
// „Kandidatenabdeckung" = Klassen mit besetztem Kandidaten; unbesetzte zaehlen NICHT als abgedeckt.
function summarizeLand(kandidaten) {
  const besetzt = kandidaten.filter((k) => k.readiness !== "unbesetzt");
  const unbesetzt = kandidaten.filter((k) => k.readiness === "unbesetzt");
  const besetzteKlassen = new Set(besetzt.map((k) => k.klasse));
  const covered = LANDESMODUL_PFLICHTKLASSEN.filter((c) => besetzteKlassen.has(c));
  const missing = LANDESMODUL_PFLICHTKLASSEN.filter((c) => !besetzteKlassen.has(c));
  const readiness = readinessRollup(kandidaten);
  return {
    total: kandidaten.length,
    besetzt: besetzt.length,
    unbesetzt: unbesetzt.length,
    unbesetzteKlassen: unbesetzt.map((k) => k.klasse),
    klassenGesamt: LANDESMODUL_PFLICHTKLASSEN.length,
    klassenAbgedeckt: covered.length, // Kandidatenabdeckung (nur besetzt)
    klassenFehlend: missing,          // enthaelt die bewusst unbesetzten Klassen
    readiness,
    // Reifegrad-Kurzform: heute ist NICHTS verifiziert/bereit/aktiv -> Einsatzbereitschaft = 0.
    einsatzbereit: readiness.bereit + readiness.aktiv,
    empfohlen: besetzt.filter((k) => k.recommendation === "empfohlen").length,
    mitEinschraenkung: besetzt.filter((k) => k.recommendation === "mit_einschraenkung").length,
    zuVerifizieren: besetzt.filter((k) => k.verifyBeforeActivation).length,
    methoden: besetzt.reduce((m, k) => { m[k.method] = (m[k.method] || 0) + 1; return m; }, {})
  };
}

function candidateSummary() {
  const berlin = summarizeLand(BERLIN_KANDIDATEN);
  const brandenburg = summarizeLand(BRANDENBURG_KANDIDATEN);
  return {
    pflichtklassen: LANDESMODUL_PFLICHTKLASSEN.length,
    berlin,
    brandenburg,
    abgelehnt: ABGELEHNTE_KANDIDATEN.length,
    // Alle Kandidaten sind Vorschläge; NICHTS ist verifiziert, bereit oder aktiv.
    verifiziert: berlin.readiness.verifiziert + brandenburg.readiness.verifiziert,
    einsatzbereit: berlin.einsatzbereit + brandenburg.einsatzbereit,
    aktiviert: 0,
    status: "prepared"
  };
}

// Reifegrad-Rollup je geography_id — Input fuer den Admin-Report (View „Länder und Pakete").
function readinessByGeography() {
  const out = {};
  out[LAND_GEOGRAPHY.berlin] = { land: "berlin", ...landReadiness(BERLIN_KANDIDATEN) };
  out[LAND_GEOGRAPHY.brandenburg] = { land: "brandenburg", ...landReadiness(BRANDENBURG_KANDIDATEN) };
  return out;
}

function landReadiness(kandidaten) {
  const s = summarizeLand(kandidaten);
  const besetzt = kandidaten.filter((k) => k.readiness !== "unbesetzt");
  return {
    klassenGesamt: s.klassenGesamt,
    // Abdeckungs-Zaehler: DISTINCT Pflichtklassen mit Kandidat (Set-basiert) — nicht die Zahl
    // der Eintraege. So kann eine kuenftige Mehrfachbelegung einer Klasse nicht „16/15" ergeben.
    klassenAbgedeckt: s.klassenAbgedeckt,
    besetzt: s.besetzt,
    unbesetzt: s.unbesetzt,
    unbesetzteKlassen: s.unbesetzteKlassen,
    kandidat: s.readiness.kandidat,
    verifiziert: s.readiness.verifiziert,
    bereit: s.readiness.bereit,
    aktiv: s.readiness.aktiv,
    unknown: s.readiness.unknown,
    einsatzbereit: s.einsatzbereit,
    // Hoechste erreichte Stufe UNTER DEN BESETZTEN Klassen. Ist nichts besetzt (leeres oder
    // komplett unbesetztes Land), ehrlich „unbesetzt" — NICHT faelschlich „kandidat".
    hoechsteStufe: besetzt.length
      ? besetzt.reduce((max, k) => ((READINESS_RANG[k.readiness] || 0) > (READINESS_RANG[max] || 0) ? k.readiness : max), besetzt[0].readiness)
      : "unbesetzt"
  };
}

module.exports = {
  LANDESMODUL_KANDIDATEN,
  BERLIN_KANDIDATEN,
  BRANDENBURG_KANDIDATEN,
  ABGELEHNTE_KANDIDATEN,
  DEDUP_HINWEISE,
  READINESS_STUFEN,
  READINESS_RANG,
  LAND_GEOGRAPHY,
  candidateSummary,
  summarizeLand,
  readinessRollup,
  readinessByGeography,
  landReadiness
};
