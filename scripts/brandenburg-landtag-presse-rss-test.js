"use strict";

// Helmut — gezielter Offline-Test des strengen Landtag-Brandenburg-RSS-Fundstellenlesers.
// =============================================================================================
// Prueft lib/helmut/brandenburg-landtag-presse-rss.js mit kleinen SYNTHETISCHEN Feeds
// (Positiv + Negativ) sowie — falls vorhanden — gegen das gesicherte amtliche Original
//   /private/tmp/helmut-bb-presse-rss.xml   (Feed, 15 Items)
//   /private/tmp/helmut-bb-presse-50117.html (direkter kanonischer Artikelabruf)
// Fehlt das Original, laeuft der Test vollstaendig weiter (CI-tauglich ohne /private/tmp);
// die Originalproben werden dann uebersprungen und ausdruecklich gemeldet.
//
// Erwartete Originalwerte (28.09.2026 beobachtet):
//   Feed-SHA256 4026f51c0470e45625e27400228814dbc535d6e3377ada744b75af609fa30e18
//   15 Items, Kanal "Landtag Brandenburg - Pressemitteilungen"
//   Item 50117 pubDate "Wed, 23 Sep 2026 12:42:00 +0200" -> lokal 2026-09-23,
//   UTC-ISO 2026-09-23T10:42:00.000Z (erst nach der Artikelbindung sichtbar)
//
// KEIN Netzwerk, KEINE DB, KEIN Modellaufruf.
// Aufruf: node scripts/brandenburg-landtag-presse-rss-test.js

const A = require("node:assert/strict");
const fs = require("fs");
const crypto = require("node:crypto");

const RSS = require("../lib/helmut/brandenburg-landtag-presse-rss");
const { pruefePresseartikel } = require("../lib/helmut/brandenburg-landtag-presseartikel");

const sha256 = value => crypto.createHash("sha256").update(value, "utf8").digest("hex");

const RSS_DATEI = "/private/tmp/helmut-bb-presse-rss.xml";
const LEGACY_ARTIKEL_DATEI = "/private/tmp/helmut-bb-presse-rss-50117.html";
const KANONISCH_ARTIKEL_DATEI = "/private/tmp/helmut-bb-presse-50117.html";
const ERWARTET_RSS_SHA = "4026f51c0470e45625e27400228814dbc535d6e3377ada744b75af609fa30e18";
const KANONISCH_ARTIKEL_SHA = "91913e5d26bb81f614631281423d716ae1fd0ede43ac2a0d4288e6f402292771";
const ARTIKEL_50117_URL = "https://www.landtag.brandenburg.de/de/meldungen/fuer_respekt_und_toleranz_im_schulalltag:_netzwerk_schule_ohne_rassismus__schule_mit_courage_trifft_sich_im_landtag/50117";
const TITEL_50117 = "Für Respekt und Toleranz im Schulalltag: Netzwerk „Schule ohne Rassismus – Schule mit Courage“ trifft sich im Landtag";
const HEX64 = "0".repeat(64);

A.equal(RSS.VERSION, "brandenburg-landtag-presse-rss-v1");
A.equal(RSS.ANFRAGE_URL, "https://www.landtag.brandenburg.de/cms/detail.php?template=lt_rss_presse_d");
A.equal(RSS.FINALE_URL, "https://www.landtag.brandenburg.de/cms/detail.php?template=ltbrb_rss_d");
A.equal(RSS.KANAL_TITEL, "Landtag Brandenburg - Pressemitteilungen");

// ---------------------------------------------------------------------------------------------
// Synthetischer Feed in der belegten Struktur.
// ---------------------------------------------------------------------------------------------
const STD_ITEMS = [
  { nummer: "50117", titel: TITEL_50117, pubDate: "Wed, 23 Sep 2026 12:42:00 +0200" },
  { nummer: "50000", titel: "Zweite Beispielmeldung des Landtages", pubDate: "Fri, 04 Sep 2026 13:03:00 +0200" }
];

function itemXml(it) {
  const link = it.link === undefined
    ? `https://www.landtag.brandenburg.de/sixcms/detail.php?id=brandenburg_01.c.${it.nummer}.de` : it.link;
  const guid = it.guid === undefined ? link : it.guid;
  const author = it.author === undefined ? `brandenburg_01.c.${it.nummer}.de (${it.nummer})` : it.author;
  const pubDate = it.pubDate === undefined ? "Wed, 23 Sep 2026 12:42:00 +0200" : it.pubDate;
  const titelRoh = it.titelRoh === undefined ? `<![CDATA[${it.titel}]]>` : it.titelRoh;
  const pubTag = pubDate === null ? "" : `<pubDate>${pubDate}</pubDate>`;
  const zusatz = it.zusatz || "";
  return `<item>${it.titelTag === undefined ? `<title>${titelRoh}</title>` : it.titelTag}`
    + `<link>${link}</link><guid>${guid}</guid>${pubTag}<author>${author}</author>${zusatz}`
    + `<description><![CDATA[...]]></description></item>`;
}

function feed(optionen = {}) {
  const kanalTitel = optionen.kanalTitel === undefined ? RSS.KANAL_TITEL : optionen.kanalTitel;
  const kanalLink = optionen.kanalLink === undefined ? RSS.FINALE_URL : optionen.kanalLink;
  const lastBuild = optionen.lastBuildDate === undefined
    ? "Mon, 28 Sep 2026 16:26:47 +0200" : optionen.lastBuildDate;
  const items = optionen.items === undefined ? STD_ITEMS : optionen.items;
  const beschreibung = optionen.beschreibung === undefined
    ? "<description>Aktuelle Pressemitteilungen aus dem Landtag Brandenburg</description>" : optionen.beschreibung;
  const version = optionen.version === undefined ? "2.0" : optionen.version;
  const extraKanal = optionen.extraKanal || "";
  const extraWurzel = optionen.extraWurzel || "";
  const kanalIntern = optionen.kanalIntern || "";
  const itemBloecke = items.map(itemXml).join("\n");
  const lastBuildTag = lastBuild === null ? "" : `<lastBuildDate>${lastBuild}</lastBuildDate>`;
  const inhalt = `<channel><title>${kanalTitel}</title><link>${kanalLink}</link>${beschreibung}`
    + `${lastBuildTag}${kanalIntern}${itemBloecke}</channel>${extraKanal}`;
  return `<?xml version="1.0" encoding="utf-8"?><?xml-stylesheet type="text/css" href="/assets/css/feed.css"?>`
    + `<rss version="${version}">${extraWurzel}${inhalt}</rss>`;
}

const eingang = rss => ({ url: RSS.ANFRAGE_URL, finalUrl: RSS.FINALE_URL, http: 200, rss });
const gueltig = (optionen = {}) => RSS.pruefePresseRss(eingang(feed(optionen)));

function artikelBeleg({ url, titel, publikationstag }) {
  return { url, titel, publikationstag, kopfzeile: "Potsdam, 23. September 2026 / 134",
    volltext: "Beispielvolltext.\n", volltextHash: HEX64, htmlHash: HEX64 };
}

// 1) Positiv: Kanal, saubere Item-Grenzen, eindeutige IDs, Felder, lokaler Tag.
{
  const ergebnis = gueltig();
  A.equal(ergebnis.version, RSS.VERSION);
  A.equal(ergebnis.kanal.titel, RSS.KANAL_TITEL);
  A.equal(ergebnis.kanal.link, RSS.FINALE_URL);
  A.equal(ergebnis.items.length, 2);
  const erstes = ergebnis.items[0];
  A.deepEqual(Object.keys(erstes).sort(), [...RSS.ITEM_FELDER].sort());
  A.equal(erstes.nummer, "50117");
  A.equal(erstes.titel, TITEL_50117);
  A.equal(erstes.link, "https://www.landtag.brandenburg.de/sixcms/detail.php?id=brandenburg_01.c.50117.de");
  A.equal(erstes.guid, erstes.link);
  A.equal(erstes.author, "brandenburg_01.c.50117.de (50117)");
  A.equal(erstes.pubDate, "Wed, 23 Sep 2026 12:42:00 +0200");
  A.equal(erstes.publikationstag, "2026-09-23");
  A.equal(new Set(ergebnis.items.map(i => i.nummer)).size, 2);
  // Der RSS-Leser erfindet noch KEINEN UTC-Zeitpunkt; der erscheint erst nach der Bindung.
  A.equal(/T\d{2}:\d{2}:\d{2}\.\d{3}Z/.test(JSON.stringify(ergebnis)), false, "kein UTC-ISO im Fundstellenleser");
  A.equal(Object.isFrozen(ergebnis), true);
  A.equal(Object.isFrozen(ergebnis.items[0]), true);
  console.log("PASS Fundstellenleser: Kanal, Item-Grenzen, IDs und Felder ohne erfundenen UTC-Zeitpunkt");
}

// 2) Bindung: Nummer am kanonischen Pfad, exakter Titel und lokaler Tag -> erst jetzt UTC ISO.
{
  const ergebnis = gueltig();
  const item = ergebnis.items[0];
  const bindung = RSS.bindeRssItemAnArtikel(item, artikelBeleg({ url: ARTIKEL_50117_URL,
    titel: TITEL_50117, publikationstag: "2026-09-23" }));
  A.deepEqual(Object.keys(bindung).sort(), [...RSS.BINDUNG_FELDER].sort());
  A.equal(bindung.nummer, "50117");
  A.equal(bindung.publikationstag, "2026-09-23");
  A.equal(bindung.publikationszeitpunktUtc, "2026-09-23T10:42:00.000Z");
  A.equal(bindung.url, ARTIKEL_50117_URL);
  A.equal(Object.isFrozen(bindung), true);
  // Widersprueche brechen ab: falscher Titel, falscher Tag, falsche Nummer am Pfad.
  A.throws(() => RSS.bindeRssItemAnArtikel(item, artikelBeleg({ url: ARTIKEL_50117_URL,
    titel: TITEL_50117 + " (anders)", publikationstag: "2026-09-23" })), /brandenburg-landtag-presse-rss-titel-widerspruch/);
  A.throws(() => RSS.bindeRssItemAnArtikel(item, artikelBeleg({ url: ARTIKEL_50117_URL,
    titel: TITEL_50117, publikationstag: "2026-09-24" })), /brandenburg-landtag-presse-rss-tag-widerspruch/);
  A.throws(() => RSS.bindeRssItemAnArtikel(item, artikelBeleg({
    url: ARTIKEL_50117_URL.replace(/\/50117$/, "/50000"), titel: TITEL_50117,
    publikationstag: "2026-09-23" })), /brandenburg-landtag-presse-rss-pfad-widerspruch/);
  A.throws(() => RSS.bindeRssItemAnArtikel({ ...item, extra: 1 },
    artikelBeleg({ url: ARTIKEL_50117_URL, titel: TITEL_50117, publikationstag: "2026-09-23" })),
  /brandenburg-landtag-presse-rss-item-ungueltig/);
  A.throws(() => RSS.bindeRssItemAnArtikel({ ...item, guid: item.link.replace("50117", "50000") },
    artikelBeleg({ url: ARTIKEL_50117_URL, titel: TITEL_50117, publikationstag: "2026-09-23" })),
  /brandenburg-landtag-presse-rss-item-identitaet-widerspruch/);
  A.throws(() => RSS.bindeRssItemAnArtikel({ ...item, author: "brandenburg_01.c.50000.de (50000)" },
    artikelBeleg({ url: ARTIKEL_50117_URL, titel: TITEL_50117, publikationstag: "2026-09-23" })),
  /brandenburg-landtag-presse-rss-item-identitaet-widerspruch/);
  console.log("PASS Bindung: Nummer/Titel/lokaler Tag exakt, erst danach UTC-Zeitpunkt");
}

// 3) Lokaler Tag vs UTC-Datum: 01:30 +0200 ist der Vortag in UTC.
{
  const item = { nummer: "50117", titel: TITEL_50117,
    link: "https://www.landtag.brandenburg.de/sixcms/detail.php?id=brandenburg_01.c.50117.de",
    guid: "https://www.landtag.brandenburg.de/sixcms/detail.php?id=brandenburg_01.c.50117.de",
    author: "brandenburg_01.c.50117.de (50117)", pubDate: "Thu, 24 Sep 2026 01:30:00 +0200",
    publikationstag: "2026-09-24" };
  const bindung = RSS.bindeRssItemAnArtikel(item,
    artikelBeleg({ url: ARTIKEL_50117_URL, titel: TITEL_50117, publikationstag: "2026-09-24" }));
  A.equal(bindung.publikationstag, "2026-09-24");
  A.equal(bindung.publikationszeitpunktUtc, "2026-09-23T23:30:00.000Z");
  // Der UTC-Kalendertag ist NICHT der Publikationstag: die Bindung ueber den UTC-Tag scheitert.
  A.throws(() => RSS.bindeRssItemAnArtikel(item,
    artikelBeleg({ url: ARTIKEL_50117_URL, titel: TITEL_50117, publikationstag: "2026-09-23" })),
  /brandenburg-landtag-presse-rss-tag-widerspruch/);
  console.log("PASS lokaler Tag vs UTC-Datum: verglichen wird der lokale Tag, nicht der UTC-Tag");
}

// 4) lastBuildDate ist NIE Artikelpublikation.
{
  const ergebnis = gueltig({ lastBuildDate: "Mon, 28 Sep 2026 16:26:47 +0200" });
  A.equal(ergebnis.items.some(i => i.publikationstag === "2026-09-28"), false);
  A.equal(ergebnis.items[0].publikationstag, "2026-09-23");
  // Fehlt dem Item der eigene pubDate, wird NICHT auf lastBuildDate ausgewichen (fail closed).
  A.throws(() => gueltig({ items: [{ nummer: "50117", titel: TITEL_50117, pubDate: null }] }),
    /brandenburg-landtag-presse-rss-item-pubdate-mehrdeutig-oder-fehlend/);
  console.log("PASS lastBuildDate wird nie als Artikelpublikation gelesen");
}

// 5) Negativfaelle: falsch, dupliziert, versteckt, fremd — alles fail closed.
{
  const fehler = (fn, muster) => A.throws(fn, muster);
  fehler(() => RSS.pruefePresseRss({ ...eingang(feed()), http: 304 }), /http-nicht-ok/);
  fehler(() => RSS.pruefePresseRss({ ...eingang(feed()), url: "https://www.landtag.brandenburg.de/cms/detail.php?template=lt_rss_xy" }), /url-ungueltig/);
  fehler(() => RSS.pruefePresseRss({ ...eingang(feed()), url: "https://example.com/cms/detail.php?template=lt_rss_presse_d" }), /url-ungueltig/);
  fehler(() => RSS.pruefePresseRss({ ...eingang(feed()), finalUrl: RSS.ANFRAGE_URL }), /finalurl-ungueltig/);
  fehler(() => RSS.pruefePresseRss({ ...eingang(feed()), rssHtml: feed() }), /eingabefelder-ungueltig/);
  fehler(() => gueltig({ version: "2.1" }), /rss-version-ungueltig/);
  fehler(() => gueltig({ kanalTitel: "Irgendwas anderes" }), /kanal-titel-abweichend/);
  fehler(() => gueltig({ kanalLink: RSS.ANFRAGE_URL }), /kanal-link-abweichend/);
  fehler(() => gueltig({ kanalIntern: "<language>de</language>" }), /kanal-fremdfeld/);
  fehler(() => gueltig({ extraKanal: `<channel><title>${RSS.KANAL_TITEL}</title><link>${RSS.FINALE_URL}</link>${itemXml(STD_ITEMS[0])}</channel>` }), /fremdinhalt-in-rss/);
  fehler(() => gueltig({ items: [] }), /item-fehlend/);
  fehler(() => gueltig({ items: [STD_ITEMS[0], { ...STD_ITEMS[1], nummer: "50117" }] }), /item-(guid|nummer)-doppelt/);
  fehler(() => gueltig({ items: [{ ...STD_ITEMS[0], guid: "https://www.landtag.brandenburg.de/sixcms/detail.php?id=brandenburg_01.c.50000.de" }] }), /item-guid-abweichend/);
  fehler(() => gueltig({ items: [{ ...STD_ITEMS[0], author: "brandenburg_01.c.50000.de (50000)" }] }), /item-author-abweichend/);
  fehler(() => gueltig({ items: [{ ...STD_ITEMS[0], pubDate: "Wed, 23 Sep 2026 12:42:00 GMT" }] }), /item-pubdate-ungueltig/);
  fehler(() => gueltig({ items: [{ ...STD_ITEMS[0], pubDate: "Thu, 23 Sep 2026 12:42:00 +0200" }] }), /item-pubdate-ungueltig/);
  fehler(() => gueltig({ items: [{ ...STD_ITEMS[0], pubDate: "Wed, 32 Sep 2026 12:42:00 +0200" }] }), /item-pubdate-ungueltig/);
  fehler(() => gueltig({ extraKanal: "<!--<item><title>versteckt</title></item>-->" }), /versteckter-doppler/);
  fehler(() => gueltig({ items: [{ ...STD_ITEMS[0], zusatz: "<enclosure url=\"/x.pdf\" length=\"0\" type=\"application/pdf\"/>" }] }), /item-fremdfeld/);
  fehler(() => gueltig({ items: [{ ...STD_ITEMS[0], titelTag: "<title>Text <b>fett</b></title>" }] }), /item-titel-verschachtelt/);
  fehler(() => gueltig({ items: [{ ...STD_ITEMS[0], titelRoh: "<![CDATA[<b>Markup</b>]]>" }] }), /item-titel-markup/);
  fehler(() => RSS.pruefePresseRss({ ...eingang(feed()), rss: "BOOM" + feed() }), /fremdinhalt-ausserhalb-rss/);
  console.log("PASS Negative: falsch, dupliziert, versteckt und fremd brechen fail closed ab");
}

// 6) Echte lokale Originalprobe (nur wenn vorhanden) — byteidentisch belegtes Original.
if (fs.existsSync(RSS_DATEI)) {
  const rss = fs.readFileSync(RSS_DATEI, "utf8");
  A.equal(sha256(rss), ERWARTET_RSS_SHA);
  const ergebnis = RSS.pruefePresseRss({ url: RSS.ANFRAGE_URL, finalUrl: RSS.FINALE_URL, http: 200, rss });
  A.equal(ergebnis.kanal.titel, RSS.KANAL_TITEL);
  A.equal(ergebnis.kanal.link, RSS.FINALE_URL);
  A.equal(ergebnis.items.length, 15);
  A.equal(new Set(ergebnis.items.map(i => i.nummer)).size, 15);
  const item = ergebnis.items.find(i => i.nummer === "50117");
  A.equal(item.titel, TITEL_50117);
  A.equal(item.link, "https://www.landtag.brandenburg.de/sixcms/detail.php?id=brandenburg_01.c.50117.de");
  A.equal(item.guid, item.link);
  A.equal(item.author, "brandenburg_01.c.50117.de (50117)");
  A.equal(item.pubDate, "Wed, 23 Sep 2026 12:42:00 +0200");
  A.equal(item.publikationstag, "2026-09-23");
  A.equal(ergebnis.items.some(i => i.publikationstag === "2026-09-28"), false, "lastBuildDate ist keine Itempublikation");
  A.equal(/T\d{2}:\d{2}:\d{2}\.\d{3}Z/.test(JSON.stringify(ergebnis)), false);

  if (fs.existsSync(KANONISCH_ARTIKEL_DATEI)) {
    const kanonischHtml = fs.readFileSync(KANONISCH_ARTIKEL_DATEI, "utf8");
    A.equal(sha256(kanonischHtml), KANONISCH_ARTIKEL_SHA);
    // Der optionale Legacy-Abruf ist nur eine Gegenprobe zur anderen Abrufadresse;
    // sein HTML wird niemals als direkt von der kanonischen URL abgerufen ausgegeben.
    if (fs.existsSync(LEGACY_ARTIKEL_DATEI)) {
      A.notEqual(sha256(fs.readFileSync(LEGACY_ARTIKEL_DATEI, "utf8")), KANONISCH_ARTIKEL_SHA);
    }
    const artikel = pruefePresseartikel({ url: ARTIKEL_50117_URL, finalUrl: ARTIKEL_50117_URL,
      http: 200, html: kanonischHtml });
    A.equal(artikel.titel, TITEL_50117);
    A.equal(artikel.publikationstag, "2026-09-23");
    const bindung = RSS.bindeRssItemAnArtikel(item, artikel);
    A.equal(bindung.publikationszeitpunktUtc, "2026-09-23T10:42:00.000Z");
    A.equal(bindung.url, ARTIKEL_50117_URL);
    console.log(`PASS echte Originale: 15 Feed-Items, kanonischer Artikel 50117, UTC ${bindung.publikationszeitpunktUtc}`);
  } else {
    console.log("SKIP echte Artikelbindung: direkter kanonischer Artikelabruf unter /private/tmp nicht vorhanden");
  }
} else {
  console.log("SKIP echte Originalprobe: /private/tmp/helmut-bb-presse-rss.xml nicht vorhanden (CI-tauglich)");
}

console.log("PASS brandenburg-landtag-presse-rss-test abgeschlossen");
