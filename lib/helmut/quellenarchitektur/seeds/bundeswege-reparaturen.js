"use strict";

// Helmut — Quellenarchitektur · Sprint 9 (Vertiefung): Reparatur-/Ersatzwege für die 6 als
// DEFEKT (broken) markierten direkten Bundes-Abrufwege.
//
// REINE DATEN + REINE HELFER. Dokumentiert je defektem Weg die per WebSearch recherchierte
// reparierte Original-URL bzw. einen stabilen Ersatzweg. WENDET NICHTS AN: kein Crawl, keine
// Statusänderung, keine Aktivierung. Die 4 KRITISCHEN Wege dürfen NICHT still archiviert werden
// (Auftrag §30) — sie behalten sichtbaren Status und bekommen einen konkreten Ersatzabrufweg.
//
// EHRLICHKEIT: URLs sind WebSearch-belegt, in dieser Umgebung NICHT byte-genau abrufbar
// (403). Jede reparierte URL ist mit `verifyBeforeActivation: true` markiert (Live-200 +
// valides RSS/XML statt HTML-Fehlerseite vor Aktivierung prüfen).
//
// bewertung: "reparierbar" (konkrete neue Original-URL) | "ersatzweg_noetig" (kein direkter
//   Feed -> Fallback googlenews_search/api) | "dauerhaft_defekt" (keiner gefunden).

const BUNDESWEG_REPARATUREN = [
  {
    legacy_source_id: "bundestag", kritisch: true, altUrl: "https://www.bundestag.de/rss", altMethod: "rss",
    diagnose: "URL-Struktur umgezogen: RSS-Übersicht jetzt /services/rss/, XML-Dateien unter /static/appdata/includes/rss/. Kurzpfad /rss liefert nur Landing/Redirect + Bot-403.",
    reparaturUrl: "https://www.bundestag.de/static/appdata/includes/rss/pressemitteilungen.rss", reparaturMethod: "rss",
    ergaenzung: "DIP-API (search.dip.bundestag.de/api/v1, bereits als eigener Abrufweg aktiv) + hib-Presse /presse/hib.",
    bewertung: "reparierbar", verifyBeforeActivation: true,
    note: "Exakten Feed-Dateinamen (pressemitteilungen.rss vs. presse.rss) + hib-Feed byte-genau bestätigen."
  },
  {
    legacy_source_id: "bundesregierung", kritisch: true, altUrl: "https://www.bundesregierung.de/breg-de/service/rss", altMethod: "rss",
    diagnose: "Pfad umgezogen zu /breg-de/service/newsletter-und-abos/rss-newsfeed; alter /service/rss vermutlich 404/Redirect + 403.",
    reparaturUrl: "https://www.bundesregierung.de/SiteGlobals/Functions/RSSFeed/DE/RSSNewsfeed/RSS_Breg_aktuell/RSSNewsfeed.xml", reparaturMethod: "rss",
    ergaenzung: "service.bund.de RSS-Aggregator (BPA/Ministerien) als Ersatz/Ergänzung.",
    bewertung: "reparierbar", verifyBeforeActivation: true,
    note: "GSB-Feed-Pfad variiert je Rubrik — RSS_Breg_aktuell-Pfad bzw. separaten Pressemitteilungen-Feed verifizieren."
  },
  {
    legacy_source_id: "die-linke", kritisch: true, altUrl: "https://www.die-linke.de/start/presse/rss.xml", altMethod: "rss",
    diagnose: "TYPO3-Relaunch: alter Pfad rss.xml existiert nicht mehr (404). Neuer Feed-Pfad heißt feed.rss.",
    reparaturUrl: "https://www.die-linke.de/start/presse/feed.rss", reparaturMethod: "rss",
    ergaenzung: "Presse-Landing /start/presse/ + /start/presse/aus-dem-bundestag/.",
    bewertung: "reparierbar", verifyBeforeActivation: true,
    note: "feed.rss-Muster durch Relaunch bestätigt; Item-Aktualität prüfen."
  },
  {
    legacy_source_id: "linksfraktion", kritisch: true, altUrl: "https://www.dielinkebt.de/presse/pressemitteilungen/rss.xml", altMethod: "rss",
    diagnose: "Domain dielinkebt.de korrekt und aktiv (Die Linke im Bundestag, seit 25.02.2025 wieder FRAKTION, 21. WP). Alter Pfad rss.xml -> 404 (gleiche CMS-Logik wie die-linke.de). Historische Domain linksfraktion.de ist veraltet — NICHT verwenden.",
    reparaturUrl: "https://www.dielinkebt.de/presse/pressemitteilungen/feed.rss", reparaturMethod: "rss",
    ergaenzung: null,
    bewertung: "reparierbar", verifyBeforeActivation: true,
    note: "Feed-Titel im Index zeigte noch Gruppe (statt Fraktion) — Inhalt/Aktualität nach Fraktions-Rückkehr prüfen."
  },
  {
    legacy_source_id: "ausschuss-arbeit-soziales", kritisch: false, altUrl: "https://www.bundestag.de/ausschuesse/a11_arbeit_soziales", altMethod: "html",
    diagnose: "Seite lebt unter gleichem Pfad, aber HTML-Scrape gegen Bot-403 + Neukonstituierung des Ausschusses (21. WP) -> geänderte DOM/Selektoren gebrochen. Kein eigener stabiler Feed.",
    reparaturUrl: "https://news.google.com/rss/search?q=site:bundestag.de%20%22Ausschuss%20f%C3%BCr%20Arbeit%20und%20Soziales%22", reparaturMethod: "googlenews_search",
    ergaenzung: "Alternativ DIP-API (Aktivitäten/Vorgänge auf Ausschuss gefiltert) oder Bundestag-Pressemitteilungen-RSS gefiltert.",
    bewertung: "ersatzweg_noetig", verifyBeforeActivation: true,
    note: "Kein direkter Ausschuss-Feed; sichtbarer Status statt stiller Deaktivierung (Klasse wird weiter überwacht)."
  },
  {
    legacy_source_id: "dgb", kritisch: false, altUrl: "https://www.dgb.de", altMethod: "html",
    diagnose: "Startseiten-Scrape unzuverlässig + CMS-Relaunch + 403. DGB bietet offizielle RSS-Feeds.",
    reparaturUrl: "https://www.dgb.de/presse/pressemitteilungen/", reparaturMethod: "rss",
    ergaenzung: "RSS-Übersicht dgb.de/unsere-rss-feeds/ + OPML dgb.de/fileadmin/.../DGB-RSS-Feeds.opml -> exakte Presse-XML-URL entnehmen.",
    bewertung: "reparierbar", verifyBeforeActivation: true,
    note: "Umstellung Startseite -> Presse-RSS; konkrete XML-URL aus OPML ziehen und byte-genau verifizieren."
  }
];

function reparaturSummary() {
  const total = BUNDESWEG_REPARATUREN.length;
  const reparierbar = BUNDESWEG_REPARATUREN.filter((r) => r.bewertung === "reparierbar").length;
  const ersatzweg = BUNDESWEG_REPARATUREN.filter((r) => r.bewertung === "ersatzweg_noetig").length;
  const dauerhaftDefekt = BUNDESWEG_REPARATUREN.filter((r) => r.bewertung === "dauerhaft_defekt").length;
  const kritischGesamt = BUNDESWEG_REPARATUREN.filter((r) => r.kritisch).length;
  const kritischMitLoesung = BUNDESWEG_REPARATUREN.filter((r) => r.kritisch && r.bewertung !== "dauerhaft_defekt").length;
  return {
    total, reparierbar, ersatzweg, dauerhaftDefekt,
    kritischGesamt, kritischMitLoesung,
    // Auftrag §30: kein kritischer Weg wird still archiviert -> jeder hat eine Lösung.
    alleKritischGeloest: kritischMitLoesung === kritischGesamt,
    // NICHTS angewendet: reine Dokumentation.
    angewendet: 0
  };
}

module.exports = { BUNDESWEG_REPARATUREN, reparaturSummary };
