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
const BERLIN_KANDIDATEN = [
  { klasse: "landesparlament", publisher: "Abgeordnetenhaus von Berlin", domain: "parlament-berlin.de", url: "https://www.parlament-berlin.de/service/rss-feeds", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "niedrig", duplicateRisk: "niedrig", cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "RSS-Feeds + Landespressedienst; Bot-403 -> realistischer UA noetig." },
  { klasse: "plenum", publisher: "Abgeordnetenhaus von Berlin", domain: "parlament-berlin.de", url: "https://www.parlament-berlin.de/dokumente/open-data", method: "opendata_xml", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "mittel", cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "Plenarprotokolle via Open-Data-XML; teilt Korpus mit Drucksachen." },
  { klasse: "ausschuesse", publisher: "Abgeordnetenhaus von Berlin", domain: "parlament-berlin.de", url: "https://www.parlament-berlin.de/dokumente/sitzungsuebersicht", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "mittel", cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "Je Ausschuss eigener RSS-Feed." },
  { klasse: "drucksachen", publisher: "Abgeordnetenhaus von Berlin (PARDOK)", domain: "parlament-berlin.de", url: "https://www.parlament-berlin.de/dokumente/open-data", method: "opendata_xml", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "hoch", cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "Tägliche Open-Data-XML; EINE Rohquelle, Klassen 4-6 typbasiert ableiten." },
  { klasse: "schriftliche_anfragen", publisher: "Abgeordnetenhaus von Berlin (PARDOK)", domain: "parlament-berlin.de", url: "https://www.parlament-berlin.de/dokumente/open-data", method: "api_xml", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "hoch", cost: "offen", recommendation: "mit_einschraenkung", readiness: "kandidat", verifyBeforeActivation: true, note: "Typgefilterte Teilmenge der Drucksachen-XML — als FILTER, nicht als zweite Rohquelle (sonst Doppelzählung)." },
  { klasse: "gesetzgebung", publisher: "Abgeordnetenhaus / Land Berlin", domain: "parlament-berlin.de", url: "https://www.parlament-berlin.de/dokumente/open-data", method: "opendata_xml", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "hoch", cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "Gesetzentwürfe als Vorgangstyp in der Open-Data-XML; Verkündung (gesetze.berlin.de) nur ergänzend." },
  { klasse: "landesregierung", publisher: "Land Berlin — Landespressedienst", domain: "berlin.de", url: "https://www.berlin.de/presse/", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "niedrig", duplicateRisk: "mittel", cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "Landespressedienst deckt gesamten Senat ab; Institutionsfilter fuer 7-9." },
  { klasse: "staatskanzlei", publisher: "Senatskanzlei / Reg. Bürgermeister", domain: "berlin.de", url: "https://www.berlin.de/rbmskzl/aktuelles/pressemitteilungen/", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "niedrig", duplicateRisk: "mittel", cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "Teilmenge des Landespressedienstes (Institutionsfilter)." },
  { klasse: "ministerien", publisher: "Senatsverwaltungen Berlin", domain: "berlin.de", url: "https://www.berlin.de/sen/", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "mittel", cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "Je Senatsverwaltung eigener Presse-RSS über berlin.de/presse-Institutionsfilter." },
  { klasse: "landesfraktionen", publisher: "Fraktionen im Abgeordnetenhaus", domain: "parlament-berlin.de", url: "https://www.parlament-berlin.de/das-parlament/fraktionen", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "mittel", cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "Je Fraktion eigener Feed (Grüne/Linke/SPD/CDU/AfD) — Feed-Pfade byte-genau verifizieren." },
  { klasse: "regionale_leitmedien", publisher: "Tagesspiegel / Berliner Morgenpost / Berliner Zeitung", domain: "tagesspiegel.de", url: "https://www.tagesspiegel.de/contentexport/feed/berlin", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "niedrig", duplicateRisk: "hoch", cost: "paywall_volltext", recommendation: "mit_einschraenkung", readiness: "kandidat", verifyBeforeActivation: true, note: "RSS-Metadaten (Titel/Teaser/Datum/Link) frei; Volltext hinter Paywall. googlenews als Fallback." },
  { klasse: "oer_landesberichterstattung", publisher: "rbb24 (Rundfunk Berlin-Brandenburg)", domain: "rbb24.de", url: "https://www.rbb24.de/politik/index.xml/feed=rss.xml", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "niedrig", duplicateRisk: "hoch", cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "GLEICHER Feed wie Brandenburg (rbb = Berlin-Brandenburg) -> global deduplizieren (eine Fundstelle, zwei Paketreferenzen)." },
  { klasse: "partei_pilot", publisher: "Die Linke Berlin", domain: "dielinke.berlin", url: "https://www.dielinke.berlin/presse/", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "niedrig", duplicateRisk: "niedrig", cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "Pilot-Linie Die Linke (konsistent zum Bundes-Piloten); TYPO3-Muster feed.rss verifizieren." },
  { klasse: "fraktion_pilot", publisher: "Linksfraktion Berlin (Abgeordnetenhaus)", domain: "linksfraktion.berlin", url: "https://www.linksfraktion.berlin/aktuelles/presse/", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "niedrig", duplicateRisk: "niedrig", cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "24 MdA; feed.rss-Pfad verifizieren." },
  { klasse: "person_pilot", publisher: "Tobias Schulze (MdA, Die Linke)", domain: "tobiasschulze.berlin", url: "https://www.tobiasschulze.berlin/", method: "googlenews_search", hasDate: true, hasOriginalUrl: true, parserEffort: "niedrig", duplicateRisk: "niedrig", cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "Person-Pilot via googlenews_search (\"Tobias Schulze\" Berlin); optional eigener /feed." }
];

// Platzhalter fuer eine bewusst UNBESETZTE Pilotklasse (kein Ersatz durch fremde Partei/Person).
function unbesetztePilotklasse(klasse, note) {
  return { klasse, publisher: null, domain: null, url: null, method: null, hasDate: null, hasOriginalUrl: null, parserEffort: null, duplicateRisk: null, cost: null, recommendation: "offen", readiness: "unbesetzt", verifyBeforeActivation: false, note };
}

const BRANDENBURG_KANDIDATEN = [
  { klasse: "landesparlament", publisher: "Landtag Brandenburg", domain: "landtag.brandenburg.de", url: "https://www.landtag.brandenburg.de/de/rss-infodienste/12411", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "niedrig", duplicateRisk: "niedrig", cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "RSS-Infodienste + Pressemitteilungen; Bot-403 -> realistischer UA noetig." },
  { klasse: "plenum", publisher: "Landtag Brandenburg", domain: "landtag.brandenburg.de", url: "https://www.landtag.brandenburg.de/de/parlament/plenum_und_gesetze/uebersicht_der_plenarsitzungen/25212", method: "opendata_xml", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "mittel", cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "Plenarprotokolle in parldok-Open-Data-XML." },
  { klasse: "ausschuesse", publisher: "Landtag Brandenburg", domain: "landtag.brandenburg.de", url: "https://www.landtag.brandenburg.de/de/ausschuesse", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "mittel", cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "Tagesordnungen je Ausschuss abonnierbar (RSS)." },
  { klasse: "drucksachen", publisher: "Landtag Brandenburg (parldok)", domain: "parlamentsdokumentation.brandenburg.de", url: "https://www.parlamentsdokumentation.brandenburg.de/opendata/exportWP1.xml", method: "opendata_xml", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "hoch", cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "Tägliche Open-Data-XML (laufende WP); EINE Rohquelle, Klassen 4-6 typbasiert." },
  { klasse: "schriftliche_anfragen", publisher: "Landtag Brandenburg (parldok)", domain: "parlamentsdokumentation.brandenburg.de", url: "https://www.parlamentsdokumentation.brandenburg.de/opendata/exportWP1.xml", method: "api_xml", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "hoch", cost: "offen", recommendation: "mit_einschraenkung", readiness: "kandidat", verifyBeforeActivation: true, note: "Kleine/Große Anfragen als Typfilter der Drucksachen-XML — nicht doppelt crawlen." },
  { klasse: "gesetzgebung", publisher: "Landtag Brandenburg (parldok)", domain: "parlamentsdokumentation.brandenburg.de", url: "https://www.parlamentsdokumentation.brandenburg.de/opendata/exportWP1.xml", method: "opendata_xml", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "hoch", cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "Gesetzentwürfe als Vorgangstyp; Verkündung BRAVORS nur ergänzend." },
  { klasse: "landesregierung", publisher: "Landesregierung Brandenburg", domain: "landesregierung-brandenburg.de", url: "https://www.landesregierung-brandenburg.de/", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "mittel", cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "Aggregiert Ministeriums-PM; zentraler bbo_rss-Feed." },
  { klasse: "staatskanzlei", publisher: "Staatskanzlei Brandenburg", domain: "stk.brandenburg.de", url: "https://www.stk.brandenburg.de/", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "mittel", cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "Presseinformationen der Staatskanzlei (bbo_rss-Muster)." },
  { klasse: "ministerien", publisher: "Ministerien Brandenburg (MIL/MWFK/MIK/…)", domain: "brandenburg.de", url: "https://mil.brandenburg.de/mil/de/rss/", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "niedrig", duplicateRisk: "mittel", cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "Einheitliches bbo_rss-Muster je Haus; konkrete Pfade je Ministerium verifizieren." },
  { klasse: "landesfraktionen", publisher: "Landtagsfraktionen (SPD/AfD/BSW/CDU)", domain: "landtag.brandenburg.de", url: "https://www.landtag.brandenburg.de/de/fraktionen", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "mittel", cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "8. WP: reale Landtagsfraktionen SPD/AfD/BSW/CDU (Linke/Grüne/BVB ausgeschieden). Feeds (WordPress /feed/) verifizieren." },
  { klasse: "regionale_leitmedien", publisher: "Märkische Allgemeine (MAZ) / Lausitzer Rundschau", domain: "maz-online.de", url: "https://news.google.com/rss/search?q=site:maz-online.de", method: "googlenews_search", hasDate: true, hasOriginalUrl: true, parserEffort: "mittel", duplicateRisk: "hoch", cost: "paywall_kein_feed", recommendation: "mit_einschraenkung", readiness: "kandidat", verifyBeforeActivation: true, note: "MAZ+ Paywall + KEIN öffentlicher RSS -> nur googlenews_search (Metadaten). Direkt-RSS ABGELEHNT." },
  { klasse: "oer_landesberichterstattung", publisher: "rbb24 (Rundfunk Berlin-Brandenburg)", domain: "rbb24.de", url: "https://www.rbb24.de/politik/index.xml/feed=rss.xml", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "niedrig", duplicateRisk: "hoch", cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "GLEICHER Feed wie Berlin -> global deduplizieren (eine Fundstelle, zwei Paketreferenzen)." },
  { klasse: "partei_pilot", publisher: "Die Linke Brandenburg", domain: "dielinke-brandenburg.de", url: "https://www.dielinke-brandenburg.de/nc/politik/aktuell/feed.rss", method: "rss", hasDate: true, hasOriginalUrl: true, parserEffort: "niedrig", duplicateRisk: "niedrig", cost: "offen", recommendation: "empfohlen", readiness: "kandidat", verifyBeforeActivation: true, note: "feed.rss real belegt; Partei-Pilot Die Linke darf als PARTEI beobachtet werden (existiert, auch ohne Landtagsfraktion 8. WP)." },
  // KORREKTUR 1: KEIN SPD-Ausweich. Pilotbezogene Fraktions-/Personenquellen bleiben UNBESETZT,
  // bis ein echtes Pilotprofil (mit realer Landtagsfraktion) feststeht.
  unbesetztePilotklasse("fraktion_pilot", "UNBESETZT: Die Linke hat in der 8. WP KEINE Landtagsfraktion in Brandenburg. Ein fehlender echter Pilot wird NICHT durch eine andere Partei (z. B. SPD) ersetzt — die pilotbezogene Fraktionsquelle bleibt offen, bis ein echtes Pilotprofil feststeht. Reale Fraktionen laufen ueber die allgemeine Klasse `landesfraktionen`."),
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
