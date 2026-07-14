"use strict";

// Helmut — Quellenarchitektur · Sprint 9/9B: Reparatur-/Ersatzwege für die 6 als DEFEKT
// markierten direkten Bundes-Abrufwege.
//
// REINE DATEN + REINE HELFER. WENDET NICHTS AN: kein Crawl, keine Statusänderung, keine
// Aktivierung. Die 4 KRITISCHEN Wege dürfen NICHT still archiviert werden (Auftrag §30).
//
// SPRINT 9B (2026-07-14): Der echte Abruf+Parser-Test wurde auf einem GitHub-Actions-Runner
// mit OFFENEM Egress durchgeführt (Run 29294900851, PR #71). Jeder Weg trägt jetzt das ECHTE
// Ergebnis (`liveVerdict`/`liveHttp`) und nur bei bestandenem Test `verifiziert: true`.
//
// bewertung (post-9B):
//   "repariert"            — echter Abruf+Parser bestanden (liveVerdict geeignet).
//   "reparatur_url_falsch" — echter Abruf widerlegt die URL (404/HTML-Fehlerseite).
//   "bot_gesperrt"         — 429/403: Pfad plausibel, Inhalt server-seitig nicht abrufbar.
//   "dauerhaft_defekt"     — kein Weg gefunden.
// Nur `repariert` heißt repariert. `verifyBeforeActivation` bleibt true (Re-Check vor Live-Gang).

const BUNDESWEG_REPARATUREN = [
  {
    legacy_source_id: "bundestag", kritisch: true, altUrl: "https://www.bundestag.de/rss", altMethod: "rss",
    diagnose: "URL-Struktur umgezogen: RSS-Übersicht jetzt /services/rss/, XML-Dateien unter /static/appdata/includes/rss/. Kurzpfad /rss liefert nur Landing/Redirect + Bot-403.",
    reparaturUrl: "https://www.bundestag.de/static/appdata/includes/rss/pressemitteilungen.rss", reparaturMethod: "rss",
    ergaenzung: "DIP-API (search.dip.bundestag.de/api/v1, bereits als eigener Abrufweg aktiv) + hib-Presse /presse/hib.",
    bewertung: "repariert", liveVerdict: "geeignet", liveHttp: 200, verifiziert: true, verifyBeforeActivation: true,
    note: "9B REAL: geeignet — HTTP 200 application/rss+xml, 15 Items, jüngstes 3 Tage alt. pressemitteilungen.rss byte-bestätigt -> repariert."
  },
  {
    legacy_source_id: "bundesregierung", kritisch: true, altUrl: "https://www.bundesregierung.de/breg-de/service/rss", altMethod: "rss",
    diagnose: "Pfad umgezogen zu /breg-de/service/newsletter-und-abos/rss-newsfeed; alter /service/rss vermutlich 404/Redirect + 403.",
    reparaturUrl: "https://news.google.com/rss/search?q=site:bundesregierung.de&hl=de&gl=DE&ceid=DE:de", reparaturMethod: "googlenews_search",
    ergaenzung: "service.bund.de RSS-Aggregator (BPA/Ministerien) als Ersatz/Ergänzung; Feed-URL über /breg-de/service/newsletter-und-abos/rss-newsfeed manuell entnehmen.",
    bewertung: "reparatur_url_falsch", liveVerdict: "ablehnen", liveHttp: 404, verifiziert: false, verifyBeforeActivation: true,
    note: "9B REAL: ablehnen — HTTP 404. Die WebSearch-'bestätigte' GSB-URL (…/RSS_Breg_aktuell/RSSNewsfeed.xml) ist FALSCH. Korrekte Feed-URL vom RSS-Hub manuell holen und erneut testen -> NICHT repariert."
  },
  {
    legacy_source_id: "die-linke", kritisch: true, altUrl: "https://www.die-linke.de/start/presse/rss.xml", altMethod: "rss",
    diagnose: "TYPO3-Relaunch: alter Pfad rss.xml existiert nicht mehr (404). Neuer Feed-Pfad heißt feed.rss.",
    reparaturUrl: "https://news.google.com/rss/search?q=site:die-linke.de&hl=de&gl=DE&ceid=DE:de", reparaturMethod: "googlenews_search",
    ergaenzung: "Alternativ realer Feed /themen/nachrichten/feed.rss (WebSearch-belegt) — bei fortbestehender Sperre gegen /start/presse/feed.rss prüfen.",
    bewertung: "bot_gesperrt", liveVerdict: "geeignet mit Einschränkung", liveHttp: 429, verifiziert: false, verifyBeforeActivation: true,
    note: "9B REAL: geeignet mit Einschränkung — HTTP 429 (Bot-Sperre). Pfad plausibel (kein 404), Inhalt nicht abrufbar; server-seitiger Abruf mit realistischem UA nötig — NICHT umgehen, daher (noch) NICHT repariert."
  },
  {
    legacy_source_id: "linksfraktion", kritisch: true, altUrl: "https://www.dielinkebt.de/presse/pressemitteilungen/rss.xml", altMethod: "rss",
    diagnose: "Domain dielinkebt.de korrekt und aktiv (Die Linke im Bundestag, seit 25.02.2025 wieder FRAKTION, 21. WP). Alter Pfad rss.xml -> 404 (gleiche CMS-Logik wie die-linke.de). Historische Domain linksfraktion.de ist veraltet — NICHT verwenden.",
    reparaturUrl: "https://www.dielinkebt.de/presse/pressemitteilungen/feed.rss", reparaturMethod: "rss",
    ergaenzung: null,
    bewertung: "repariert", liveVerdict: "geeignet", liveHttp: 200, verifiziert: true, verifyBeforeActivation: true,
    note: "9B REAL: geeignet — HTTP 200, 15 Items, jüngstes 0 Tage alt. dielinkebt.de/presse/pressemitteilungen/feed.rss byte-bestätigt (aktuell) -> repariert."
  },
  {
    legacy_source_id: "ausschuss-arbeit-soziales", kritisch: false, altUrl: "https://www.bundestag.de/ausschuesse/a11_arbeit_soziales", altMethod: "html",
    diagnose: "Seite lebt unter gleichem Pfad, aber HTML-Scrape gegen Bot-403 + Neukonstituierung des Ausschusses (21. WP) -> geänderte DOM/Selektoren gebrochen. Kein eigener stabiler Feed.",
    reparaturUrl: "https://news.google.com/rss/search?q=site:bundestag.de%20%22Ausschuss%20f%C3%BCr%20Arbeit%20und%20Soziales%22", reparaturMethod: "googlenews_search",
    ergaenzung: "Alternativ DIP-API (Aktivitäten/Vorgänge auf Ausschuss gefiltert) oder Bundestag-Pressemitteilungen-RSS gefiltert.",
    bewertung: "repariert", liveVerdict: "geeignet", liveHttp: 200, verifiziert: true, verifyBeforeActivation: true,
    note: "9B REAL: geeignet — HTTP 200, 20 Items, jüngstes 0 Tage alt. googlenews-Ersatzweg (kein direkter Ausschuss-Feed) byte-bestätigt -> repariert (Ersatzweg, sichtbarer Status statt stiller Deaktivierung)."
  },
  {
    legacy_source_id: "dgb", kritisch: false, altUrl: "https://www.dgb.de", altMethod: "html",
    diagnose: "Startseiten-Scrape unzuverlässig + CMS-Relaunch + 403. DGB bietet offizielle RSS-Feeds.",
    reparaturUrl: "https://news.google.com/rss/search?q=site:dgb.de&hl=de&gl=DE&ceid=DE:de", reparaturMethod: "googlenews_search",
    ergaenzung: "RSS-Übersicht dgb.de/unsere-rss-feeds/ + OPML dgb.de/fileadmin/.../DGB-RSS-Feeds.opml -> exakte Presse-XML-URL entnehmen.",
    bewertung: "reparatur_url_falsch", liveVerdict: "ablehnen", liveHttp: 200, verifiziert: false, verifyBeforeActivation: true,
    note: "9B REAL: ablehnen — HTTP 200 text/html (kein Feed). /presse/pressemitteilungen/ ist die HTML-Übersicht; exakte XML-URL aus dgb.de/unsere-rss-feeds/ (OPML) entnehmen und erneut testen -> NICHT repariert."
  }
];

function reparaturSummary() {
  const by = (b) => BUNDESWEG_REPARATUREN.filter((r) => r.bewertung === b).length;
  const total = BUNDESWEG_REPARATUREN.length;
  const repariert = by("repariert");
  const reparaturUrlFalsch = by("reparatur_url_falsch");
  const botGesperrt = by("bot_gesperrt");
  const dauerhaftDefekt = by("dauerhaft_defekt");
  const kritisch = BUNDESWEG_REPARATUREN.filter((r) => r.kritisch);
  const kritischGesamt = kritisch.length;
  const kritischRepariert = kritisch.filter((r) => r.verifiziert).length;
  const kritischOffen = kritischGesamt - kritischRepariert;
  return {
    total, repariert, reparaturUrlFalsch, botGesperrt, dauerhaftDefekt,
    verifiziert: BUNDESWEG_REPARATUREN.filter((r) => r.verifiziert).length,
    kritischGesamt, kritischRepariert, kritischOffen,
    // EHRLICH: nach echtem Test sind NICHT alle kritischen Wege gelöst (bundesregierung URL falsch,
    // die-linke bot-gesperrt) -> false. Kein Schönen der Reparaturlage.
    alleKritischGeloest: kritischOffen === 0,
    // NICHTS angewendet: reine Dokumentation.
    angewendet: 0
  };
}

module.exports = { BUNDESWEG_REPARATUREN, reparaturSummary };
