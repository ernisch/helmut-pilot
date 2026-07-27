"use strict";

// Helmut — Herausgebererkennung (Betriebsbefund B4-4).
// =============================================================================
// REINE LOGIK: kein Netz, keine KI, keine Datenbank, kein Zufall, keine Uhr.
// Jede Entscheidung ist reproduzierbar und einzeln offline pruefbar.
//
// DER PRODUCTION-FEHLER, DEN DIESES MODUL SCHLIESST (2026-07-27)
// -----------------------------------------------------------------------------
// Das Dokument "Kai Wegner zu queeren Rechten … - Tagesspiegel" wurde einem
// fachfremden Vorgang zugeschlagen. Ursache: der Herausgebername stand als
// TITELSUFFIX im Text, wurde daher zu einem ganz normalen Anker — und weil
// "tagesspiegel" 13 Zeichen hat, galt er ueber STRONG_ANCHOR_LEN sogar als
// STARKER Beleg (Gewicht 2). Da der Zielvorgang bereits mehrere
// Tagesspiegel-Artikel enthielt, war MIN_BEWEISGEWICHT=2 allein durch den
// gemeinsamen HERAUSGEBER erfuellt. Zwei Texte, die nichts miteinander zu tun
// haben, wurden zu einem Vorgang, weil sie in derselben Zeitung standen.
//
// Das ist keine Tagesspiegel-Eigenheit. Read-only in Production gemessen
// (1 000 Rohdokumente, 14 Tage): 613 Titel tragen ein " - <Suffix>", 220
// Dokumente tragen mindestens einen Mediennamen unter ihren Ankern, und 18
// Vorgaenge tragen einen Herausgebernamen als THEMENWURZEL ihrer Kennung
// (`vg-tagesspiegel-…`, `vg-zeitung-…`, `vg-tagesschau-…`).
//
// ZWEITER, WENIGER OFFENSICHTLICHER WEG: die Abkuerzungsregel. "DIE ZEIT",
// "WELT", "BILD", "FAZ" werden von isAcronym() als Abkuerzung erkannt (>= 2
// Grossbuchstaben, 3-6 Zeichen) und zaehlen bei exakter Uebereinstimmung als
// STARKER Beleg. Zwei Artikel derselben Zeitung erfuellten damit das geforderte
// Gewicht allein ueber den Zeitungsnamen — selbst wenn das Wort kuerzer ist als
// die normale Ankerschwelle.
//
// LEITGEDANKE DER LOESUNG
// -----------------------------------------------------------------------------
// Ein Herausgebername in HERAUSGEBERPOSITION traegt keine thematische
// Information. Er beschreibt die HERKUNFT eines Dokuments, nicht das Ereignis.
// Jedes Dokument desselben Feeds traegt ihn — er kann deshalb strukturell nichts
// unterscheiden und darf nie Identitaet stiften.
//
// Daraus folgen zwei UNABHAENGIGE Riegel:
//
//   RIEGEL 1 (strukturell, ohne jede Wortliste): der bestaetigte Titelsuffix
//   wird vor der Ankerbildung abgeschnitten. "Bestaetigt" heisst: der Suffix
//   deckt sich mit den Herausgeberangaben DESSELBEN Dokuments (Quellenname,
//   Host der Artikeladresse) oder ist strukturell als Herausgeberbezeichnung
//   erkennbar (Domainform, Gattungswort). Dieser Riegel wirkt auch fuer
//   Herausgeber, die in keiner Liste stehen ("Vietnam.vn", "Hasepost",
//   "Sozialverband VdK Nord e.V.").
//
//   RIEGEL 2 (aufgezaehlt): bekannte Medien-, Agentur- und Plattformnamen
//   gelten UEBERALL als nicht-spezifisch — auch mitten im Text, auch in einer
//   KI-formulierten Ueberschrift. Sie duerfen als Zusatzbeleg mitlaufen, aber
//   nie eine Zusammenfuehrung allein tragen (dieselbe Mechanik wie die
//   generischen Ereignisfamilien aus B4-3).
//
// VERWORFENE ALTERNATIVEN (damit sie nicht erneut probiert werden)
// -----------------------------------------------------------------------------
//   * "Letztes Segment nach ' - ' immer abschneiden." GEMESSEN FALSCH: 613 von
//     1 000 Production-Titeln haben so ein Segment, aber viele davon sind der
//     ECHTE Schlagzeilenrumpf hinter einem Dachzeilen-Trenner — etwa
//     "Nach Angriff auf CSD in Berlin - Neukoellns Integrationsbeauftragte
//     fordert entschlosseneres Vorgehen". Blindes Abschneiden haette hier den
//     gesamten Sachgehalt geloescht. Der Suffix wird deshalb nur entfernt, wenn
//     er BELEGT ist.
//   * "Alle Tokens des Quellennamens aus den Ankern des Dokuments entfernen."
//     Waere ueberschiessend: die Quelle "Deutscher Bundestag" wuerde jedem ihrer
//     Dokumente den Anker "bundestag" nehmen, auch wenn er in der Schlagzeile
//     inhaltlich steht ("Bundestag beschliesst Rentenpaket"). Dokumente
//     derselben Sache haetten dann je nach Herkunft verschiedene Ankermengen —
//     echte Zusammenfuehrungen wuerden zerfallen. Entfernt wird nur, was in
//     HERAUSGEBERPOSITION steht.
//   * "Herausgeber ueber eine Sperrliste von Domains erkennen." Deckt nur die
//     bekannten Haeuser ab und veraltet still. Die strukturelle Bestaetigung
//     ueber die Metadaten des Dokuments selbst braucht keine Pflege.
//
// BEWUSSTE GRENZE, ehrlich benannt: ein Artikel, der TATSAECHLICH von einem
// Medienhaus handelt ("Tagesspiegel-Redaktion streikt"), verliert diesen Namen
// als Identitaetsbeleg. Das ist die richtige Richtung des Fehlers: der Vorgang
// entsteht dann ueber die uebrigen Sachanker oder eben getrennt — er entsteht
// nie FALSCH VEREINIGT.

// --- Trennzeichen zwischen Schlagzeile und Herausgeber ----------------------
// Google-News-RSS liefert "<Schlagzeile> - <Herausgeber>", HTML-Titel oft
// "<Schlagzeile> | <Herausgeber>". Gesucht wird immer das LETZTE Vorkommen:
// Dachzeilen und Untertitel benutzen dieselben Zeichen weiter vorne.
// Als Fabrik, damit `lastIndex` eines globalen Regex nie zwischen Aufrufen
// stehenbleibt (stille, schwer auffindbare Fehlerquelle).
const SUFFIX_TRENNER = () => /\s[-–—|·]\s+/g;

// Ein Herausgebername ist kurz. Alles darueber ist mit hoher Wahrscheinlichkeit
// der eigentliche Schlagzeilenrumpf hinter einer Dachzeile.
const SUFFIX_MAX_ZEICHEN = 46;
const SUFFIX_MAX_WOERTER = 6;
// Fuer den schwaechsten Beleg (einzelnes Gattungswort) gilt eine engere Grenze.
const SUFFIX_GATTUNG_MAX_WOERTER = 3;

// Wie oft hintereinander ein bestaetigter Suffix entfernt wird
// ("… - SZ.de - SZ.de" kommt in Feeds vor). Endliche, kleine Schranke.
const SUFFIX_MAX_RUNDEN = 3;

// Domainform im Suffix ("SZ.de", "tagesschau.de", "Vietnam.vn", "DiePresse.com").
// Ein Punkt vor einer bekannten Endung ist ein sehr starkes Herausgebersignal —
// eine deutsche Schlagzeile endet nicht auf einer Domain.
const DOMAINFORM = /\b[a-z0-9][a-z0-9-]{1,}\.(de|com|net|org|at|ch|eu|info|news|tv|io|fr|it|nl|pl|cz|uk|us|vn|ru)\b/i;

// --- Riegel 2: aufgezaehlte Namen -------------------------------------------
// MEDIEN- UND AGENTURNAMEN, die UEBERALL nicht-spezifisch sind.
// Aufnahmekriterium: in politischer Berichterstattung dominiert die Lesart
// "Herausgeber" so deutlich, dass der Verlust der Sachlesart hinnehmbar ist.
// Wer das nicht erfuellt (siehe SUFFIX_NAMEN unten), wirkt nur in
// Herausgeberposition.
const HERAUSGEBER_NAMEN = new Set([
  // Deutsche ueberregionale Medien
  "tagesspiegel", "spiegel", "sueddeutsche", "süddeutsche", "handelsblatt",
  "tagesschau", "tagesthemen", "taz", "faz", "sz", "zeitonline", "zeitde",
  "wiwo", "wirtschaftswoche", "cicero", "capital", "focus", "stern", "merkur",
  "zdfheute", "ntv", "ntvde", "rnd", "dlf", "deutschlandfunk", "deutschlandradio",
  "phoenix", "arte", "tonline", "web", "gmx", "watson", "buzzfeed", "vice",
  "netzpolitik", "correctiv", "uebermedien", "meedia", "horizont", "kress",
  "nachdenkseiten", "telepolis", "heise", "golem", "chip", "computerbild",
  "futurezone", "table", "briefings", "politico", "euractiv", "euronews",
  "nzz", "standardat", "diepresse", "salzburg24", "unsertirol24", "tag24",
  "hasepost", "fuldainfo", "audimax", "openpetition", "vorwaerts", "vorwärts",
  // Regionale Titel, deren Name ohne Gattungswort auskommt
  "volksstimme", "suedkurier", "südkurier", "morgenpost", "abendblatt",
  "abendzeitung", "hasetal", "wochenspiegel", "moz", "lvz", "waz", "nwz", "shz",
  // Abkuerzungen von Sendern, Agenturen und Titeln.
  // WICHTIG: diese standen bisher teils nur in HAEUFIGE_ABKUERZUNGEN — das
  // senkte ihr Gewicht von 2 auf 1, liess sie aber SPEZIFISCH. Zwei Dokumente
  // derselben Agentur plus ein beliebiger zweiter Treffer erreichten damit das
  // geforderte Gewicht. Hier zaehlen sie 0.
  "ard", "zdf", "dpa", "afp", "epd", "kna", "ots", "reuters", "bloomberg",
  "guardian", "bbc", "cnn", "nytimes", "washingtonpost", "afpde", "apnews",
  "rbb", "rbb24", "mdr", "wdr", "ndr", "swr", "br24", "hr", "sr", "orf", "srf",
  "ansa", "tass", "xinhua", "sputnik",
  // Zeitungsnamen, die als Wort kuerzer sind als die Ankerschwelle und deshalb
  // AUSSCHLIESSLICH ueber die Abkuerzungsschreibweise ("DIE ZEIT", "WELT",
  // "BILD") zu Ankern werden. In Kleinschreibung koennen sie strukturell nie
  // Anker sein — die Aufnahme kostet also nichts und schliesst den zweiten
  // Fehlerweg (starke Abkuerzung) sicher.
  "zeit", "welt", "bild", "bams",
  // Plattformen und Aggregatoren
  "google", "googlenews", "msn", "yahoo", "flipboard", "newsbreak", "upday",
  "youtube", "facebook", "instagram", "twitter", "tiktok", "telegram",
  "whatsapp", "linkedin", "threads", "mastodon", "bluesky", "reddit", "twitch",
  "substack", "wordpress", "blogspot", "podcast", "spotify"
]);

// GATTUNGSWOERTER des Verlagswesens. Sie bezeichnen die ART eines Herausgebers,
// nie ein Ereignis — auch nicht mitten im Text. "Zeitung", "Rundschau",
// "Redaktion" beschreiben keinen politischen Vorgang.
const HERAUSGEBER_GATTUNG = new Set([
  "zeitung", "zeitungen", "tageszeitung", "wochenzeitung", "zeitschrift",
  "rundschau", "anzeiger", "morgenpost", "abendblatt", "tagblatt", "tagesblatt",
  "wochenblatt", "allgemeine", "allgemeinen", "journal", "magazin", "magazine",
  "redaktion", "redaktionen", "verlag", "verlage", "medienhaus", "medien",
  "presse", "pressemitteilung", "pressemitteilungen", "presseportal",
  "pressestelle", "rundfunk", "mediathek", "livestream", "newsletter",
  "newsroom", "briefing", "leitartikel", "kolumne", "portal", "nachrichtenagentur",
  "korrespondentenbuero", "onlineausgabe", "printausgabe"
]);

// NUR IN HERAUSGEBERPOSITION wirksam. Das sind Woerter, die als Titelname
// vorkommen, aber im Deutschen ganz normale Begriffe sind. Sie duerfen einen
// Suffix BESTAETIGEN, aber nicht mitten im Text ihren Sachgehalt verlieren:
// "Blick", "Krone", "Standard", "Post", "Bote" und "Echo" wuerden sonst in
// Sachtexten still entwertet.
const SUFFIX_NAMEN = new Set([
  "post", "bote", "echo", "kurier", "blick", "krone", "express", "standard",
  "heute", "morgen", "news", "online", "aktuell", "kompakt", "info", "report",
  "blog", "live", "digital", "plus", "tv", "radio", "fernsehen", "nachrichten",
  "rundbrief", "bulletin", "dossier", "agentur", "gruppe", "verband", "stiftung",
  "fraktion", "bundestag", "landtag", "ministerium", "bundesministerium",
  "bundesregierung", "gewerkschaft", "partei", "verein"
]);

// Artikel und Rechtsformzusaetze, die vor dem Vergleich wegfallen.
const NAMENSFUELLER = new Set(["der", "die", "das", "den", "dem", "des", "ev", "gmbh", "ag", "kg", "mbh", "co"]);

// --- Normalisierung ---------------------------------------------------------

// Vergleichsschluessel: Kleinschreibung, nur Buchstaben/Ziffern, ohne Artikel
// und Rechtsformzusaetze. "Der Tagesspiegel" -> "tagesspiegel",
// "SZ.de" -> "szde", "Sozialverband VdK Nord e.V." -> "sozialverbandvdknord".
function namensSchluessel(text) {
  return woerter(text)
    .filter((w) => !NAMENSFUELLER.has(w))
    .join("");
}

// Wortfolge eines Textes in Kleinschreibung (Umlaute bleiben erhalten, weil die
// Ankerbildung in vorgang-identity.js ebenfalls nur kleinschreibt).
function woerter(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9äöüß]+/)
    .filter(Boolean);
}

// Registrierbarer Name eines Hosts: "https://www.tagesspiegel.de/berlin/…"
// -> "tagesspiegel". Bewusst einfach gehalten (kein Public-Suffix-Verzeichnis):
// gebraucht wird nur ein Vergleichsschluessel, keine DNS-Wahrheit.
function domainName(url) {
  const roh = String(url || "").trim();
  if (!roh) return "";
  let host = "";
  try {
    host = new URL(roh.includes("://") ? roh : `https://${roh}`).hostname;
  } catch (_) {
    return "";
  }
  const teile = host.toLowerCase().replace(/^www\d*\./, "").replace(/^(m|amp|mobile|news)\./, "").split(".").filter(Boolean);
  if (!teile.length) return "";
  if (teile.length === 1) return teile[0];
  // "example.co.uk" -> "example"; sonst das Label vor der Endung.
  const vorletzte = teile[teile.length - 2];
  if (teile.length >= 3 && ["co", "com", "org", "net", "gov", "ac"].includes(vorletzte)) return teile[teile.length - 3];
  return vorletzte;
}

// --- Riegel 2: gilt dieser Anker ueberall als Herausgeberwort? --------------
// Wird von vorgang-identity.js in istGenerisch() mitgefuehrt. Ein Anker, fuer
// den das gilt, kann keine Zusammenfuehrung tragen und keine Themenwurzel einer
// Vorgangskennung werden.
function istHerausgeberAnker(anchor) {
  const a = String(anchor || "").toLowerCase();
  if (!a) return false;
  return HERAUSGEBER_NAMEN.has(a) || HERAUSGEBER_GATTUNG.has(a);
}

// --- Riegel 1: Herausgeberposition ------------------------------------------

// Metadaten eines Rohdokuments, egal ob relational (source_name, canonical_url)
// oder aus dem Crawler-Zwischenformat (sourceName, originalUrl).
function herausgeberMetadaten(doc = {}) {
  const d = doc || {};
  return {
    quellenname: String(d.source_name || d.sourceName || d.publisher || d.publisherName || ""),
    adressen: [
      d.url, d.canonical_url, d.canonical_target_url, d.canonicalUrl,
      d.source_url, d.sourceUrl, d.original_url, d.originalUrl
    ].map((x) => String(x || "")).filter(Boolean)
  };
}

// Ist `kandidat` fuer DIESES Dokument als Herausgeberbezeichnung belegt?
// Rueckgabe: null (nicht belegt) oder der Belegtyp — der Belegtyp landet in der
// Entscheidungsspur, damit jede Kuerzung nachvollziehbar bleibt.
function suffixBeleg(kandidat, meta = {}) {
  const text = String(kandidat || "").trim();
  if (!text) return null;
  if (text.length > SUFFIX_MAX_ZEICHEN) return null;
  const teile = woerter(text);
  if (!teile.length || teile.length > SUFFIX_MAX_WOERTER) return null;

  const schluessel = namensSchluessel(text);
  if (!schluessel) return null;

  // (a) Deckungsgleich mit dem Quellennamen DESSELBEN Dokuments — der staerkste
  //     Beleg, weil er aus den Metadaten der Lieferung stammt und keine Liste
  //     braucht.
  const quelle = namensSchluessel(meta.quellenname);
  if (quelle && schluessel === quelle) return "quellenname";
  // (b) Teil des Quellennamens ("Tagesschau" in "Tagesschau Politik") oder
  //     umgekehrt. BEIDE Seiten brauchen mindestens 4 Zeichen: ein zweistelliges
  //     Quellenkuerzel ("FR") steckt sonst zufaellig in fast jedem Suffix
  //     ("Frankfurter Rundschau" enthaelt "fr") und wuerde jede Kuerzung
  //     scheinbar belegen. Beim Testschreiben aufgefallen.
  if (quelle.length >= 4 && schluessel.length >= 4 && (quelle.includes(schluessel) || schluessel.includes(quelle))) return "quellenname-teil";

  // (c) Domainform im Suffix: "SZ.de", "tagesschau.de", "Vietnam.vn".
  if (DOMAINFORM.test(text)) return "domainform";

  // (d) Deckungsgleich mit dem Host der Artikeladresse.
  for (const adresse of meta.adressen || []) {
    const host = domainName(adresse);
    if (host && host.length >= 4 && (host === schluessel || schluessel === host.replace(/[^a-z0-9]/g, ""))) return "host";
  }

  // (e) Aufgezaehlter Medienname — inklusive der nur hier wirksamen
  //     mehrdeutigen Titelnamen.
  if (teile.every((w) => HERAUSGEBER_NAMEN.has(w) || HERAUSGEBER_GATTUNG.has(w) || SUFFIX_NAMEN.has(w) || NAMENSFUELLER.has(w))) return "medienname";

  // (f) Gattungswort im Suffix: "Frankfurter Rundschau", "Berliner Morgenpost",
  //     "Mitteldeutsche Zeitung", "Stuttgarter Nachrichten", "RP Online".
  //     ENGER als (e): hoechstens drei Woerter. Ein einzelnes Gattungswort in
  //     einem laengeren Segment ist kein Beleg — sonst faellt eine echte
  //     Schlagzeile ("… - Das ist die Post von morgen") dem Riegel zum Opfer.
  if (teile.length <= SUFFIX_GATTUNG_MAX_WOERTER && teile.some((w) => HERAUSGEBER_GATTUNG.has(w) || SUFFIX_NAMEN.has(w))) return "gattung";

  return null;
}

// Zerlegt einen Titel in Rumpf und bestaetigten Herausgebersuffix.
// Rueckgabe: { rumpf, herausgeber: [..], belege: [..] }
// `rumpf` ist der Text, aus dem Anker gebildet werden duerfen.
function herausgeberSuffix(title, meta = {}) {
  let rest = String(title || "").trim();
  const herausgeber = [];
  const belege = [];
  for (let runde = 0; runde < SUFFIX_MAX_RUNDEN; runde += 1) {
    const trenner = SUFFIX_TRENNER();
    const positionen = [];
    let m;
    while ((m = trenner.exec(rest)) !== null) positionen.push({ index: m.index, laenge: m[0].length });
    if (!positionen.length) break;
    const letzte = positionen[positionen.length - 1];
    const kandidat = rest.slice(letzte.index + letzte.laenge).trim();
    const beleg = suffixBeleg(kandidat, meta);
    if (!beleg) break;
    herausgeber.push(kandidat);
    belege.push(beleg);
    rest = rest.slice(0, letzte.index).trim();
    if (!rest) break;
  }
  // Bleibt am Ende NUR der Herausgebername stehen — der Crawler liefert solche
  // Titel bei Uebersichts- und Startseiten ("CDU/CSU-Fraktion im Deutschen
  // Bundestag - CDU/CSU-Fraktion im Deutschen Bundestag", in Production belegt) —
  // dann traegt das Dokument keinen Sachgehalt. Es bekommt keine Anker und kann
  // sich damit an keinen fremden Vorgang anhaengen. Fail closed, bewusst.
  const quelle = namensSchluessel(meta.quellenname);
  if (quelle && quelle.length >= 4 && namensSchluessel(rest) === quelle) {
    herausgeber.push(rest);
    belege.push("titel-ist-herausgeber");
    rest = "";
  }
  return { rumpf: rest, herausgeber, belege };
}

// Der fuer die Ankerbildung verwertbare Titel: ohne bestaetigten Herausgeber.
// EHRLICHE FOLGE: besteht ein Titel nur aus Herausgeberangaben ("IG Metall -
// IG Metall"), bleibt ein leerer Rumpf. Das Dokument bekommt dann keine Anker
// und bildet einen eigenen Vorgang — richtig so: ein Titel ohne Sachgehalt darf
// sich nicht an fremde Vorgaenge anhaengen.
function titelRumpf(doc = {}) {
  const meta = herausgeberMetadaten(doc);
  return herausgeberSuffix((doc && doc.title) || "", meta).rumpf;
}

// Diagnose fuer Analysewerkzeuge und Tests: welche Woerter dieses Dokuments
// stehen in Herausgeberposition?
function herausgeberWoerter(doc = {}) {
  const meta = herausgeberMetadaten(doc);
  const { herausgeber } = herausgeberSuffix((doc && doc.title) || "", meta);
  return [...new Set(herausgeber.flatMap((h) => woerter(h)))];
}

module.exports = {
  SUFFIX_TRENNER, SUFFIX_MAX_ZEICHEN, SUFFIX_MAX_WOERTER, SUFFIX_GATTUNG_MAX_WOERTER,
  SUFFIX_MAX_RUNDEN, DOMAINFORM,
  HERAUSGEBER_NAMEN, HERAUSGEBER_GATTUNG, SUFFIX_NAMEN, NAMENSFUELLER,
  woerter, namensSchluessel, domainName,
  istHerausgeberAnker, herausgeberMetadaten, suffixBeleg, herausgeberSuffix,
  titelRumpf, herausgeberWoerter
};
