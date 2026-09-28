"use strict";

// Helmut — gezielter Offline-Test des geschlossenen Landtag-Brandenburg-Presseartikelstands.
// =============================================================================================
// Zwei Ebenen, beide ohne Netz, DB, Modell oder Production-Daten:
//   * Synthetische Proben belegen den Vertrag (Erstellung, Identitaets-, Zeit-, Drift- und
//     Rohtext-Negativfaelle) — CI-tauglich ohne jede private Datei.
//   * Die lokalen amtlichen Originale werden — falls vorhanden — durch die ECHTEN Leser gefuehrt
//     /private/tmp/helmut-bb-presse-50117.html (direkter kanonischer HTTP200-Abruf)
//     /private/tmp/helmut-bb-presse-rss.xml     (amtlicher RSS-Feed)
//     Fehlen sie, laeuft der Test vollstaendig weiter und meldet die Originalproben als SKIP.
//
// Erwartete Originalwerte (28.09.2026 beobachtet):
//   Artikel HTML-SHA256 91913e5d…2771, Volltext-SHA256 137e2697…5497, 2750 Zeichen, 1. Sachabsatz 497
//   RSS    SHA256 4026f51c…0e18, Item 50117 pubDate "Wed, 23 Sep 2026 12:42:00 +0200"
//   Bindung: Tag 2026-09-23 (lokal), UTC 2026-09-23T10:42:00.000Z
//   Stand:   Standhash ee50113b…81e9, erster Sachabsatz b5781123…9e8d
//
// KEIN Netzwerk, KEINE DB, KEIN Modellaufruf.
// Aufruf: node scripts/brandenburg-landtag-presseartikelstand-test.js

const A = require("node:assert/strict");
const fs = require("fs");
const crypto = require("node:crypto");

const B = require("../lib/helmut/brandenburg-landtag-presseartikelstand");
const P = require("../lib/helmut/brandenburg-landtag-presseartikel");
const R = require("../lib/helmut/brandenburg-landtag-presse-rss");
const ST = require("../lib/helmut/artikelstand");
const D = require("../lib/helmut/dedup");

const sha256 = value => crypto.createHash("sha256").update(value, "utf8").digest("hex");
let bestanden = 0;
function test(name, fn) { fn(); bestanden += 1; console.log("OK " + name); }
function wirft(fn, grund) {
  const muster = new RegExp(grund.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  try { fn(); } catch (error) { A.match(String(error && error.message), muster); return; }
  A.fail("erwarteter Fehler fehlt: " + grund);
}
const fehler = (out, grund) => {
  A.deepEqual(Object.keys(out).sort(), ["ok", "reason"]);
  A.equal(out.ok, false, "kein Fehler: " + JSON.stringify(out));
  A.equal(out.reason, grund, "falscher Grund: " + out.reason);
};

const ARTIKEL_DATEI = "/private/tmp/helmut-bb-presse-50117.html";
const RSS_DATEI = "/private/tmp/helmut-bb-presse-rss.xml";
const ERWARTET_ARTIKEL_SHA = "91913e5d26bb81f614631281423d716ae1fd0ede43ac2a0d4288e6f402292771";
const ERWARTET_RSS_SHA = "4026f51c0470e45625e27400228814dbc535d6e3377ada744b75af609fa30e18";
const ORIGINAL_URL = "https://www.landtag.brandenburg.de/de/meldungen/fuer_respekt_und_toleranz_im_schulalltag:_netzwerk_schule_ohne_rassismus__schule_mit_courage_trifft_sich_im_landtag/50117";
const ORIGINAL_TITEL = "Für Respekt und Toleranz im Schulalltag: Netzwerk „Schule ohne Rassismus – Schule mit Courage“ trifft sich im Landtag";
const ORIGINAL_TAG = "2026-09-23";
const ORIGINAL_UTC = "2026-09-23T10:42:00.000Z";
const ORIGINAL_VOLLTEXT_SHA = "137e26975c6a7765a8de5bf5bb5fc8ca311d9f0be90b39100b6681a2bec05497";
const ORIGINAL_ABSATZ_SHA = "b578112323c3fb6fe262788bd01d0eba65921433ce92f7d7582c5c941ba99e8d";
const ORIGINAL_STANDHASH = "ee50113bb2b98b1ed4f3455b87b185c819358edf8c4f51072e481e4c629081e9";
const HEX64 = "0".repeat(64);

A.equal(B.VERSION, 1);
A.equal(B.HERKUNFT, "brandenburg-landtag-pressemitteilung");
A.equal(B.NAMESPACE, "helmut-brandenburg-landtag-presseartikelstand-v1");
A.deepEqual([...B.STAND_FELDER], ["version", "herkunft", "url", "titel", "publikationstag",
  "publikationszeitpunktUtc", "absatzHash", "volltextHash", "standHash"]);

// ---------------------------------------------------------------------------------------------
// Synthetische amtliche Landtag-Meldung (echte Leserstruktur) und synthetischer RSS-Feed.
// ---------------------------------------------------------------------------------------------
const STD_ABSATZ_1 = "Die synthetische Landtagsmeldung beschreibt einen amtlich belegten Sachverhalt "
  + "der Brandenburger Landesversorgung und dient ausschliesslich der lokalen Offlinepruefung dieses "
  + "geschlossenen Standes ohne Netz, Datenbank oder Modellaufruf.";
const STD_ABSATZ_2 = "Ein zweiter, ebenfalls vollstaendiger Sachabsatz derselben synthetischen Meldung "
  + "fuer die gebundene Absatzgrenze des Standes.";
const MONATSNAMEN = ["", "Januar", "Februar", "März", "April", "Mai", "Juni", "Juli",
  "August", "September", "Oktober", "November", "Dezember"];

function seite(optionen = {}) {
  const datum = optionen.datum || "2026-09-23";
  const [jahr, monat, tag] = datum.split("-");
  const slug = optionen.slug || "beispiel_meldung";
  const id = optionen.id || "50117";
  const host = optionen.host || "www.landtag.brandenburg.de";
  const url = optionen.url || `https://${host}/de/meldungen/${slug}/${id}`;
  const titel = optionen.titel === undefined ? "Synthetische Landtagsmeldung zum Beispielvorhaben" : optionen.titel;
  const nummer = optionen.nummer || "134";
  const kopfzeile = optionen.kopfzeile === undefined
    ? `Potsdam, ${Number(tag)}. ${MONATSNAMEN[Number(monat)]} ${jahr} / ${nummer}` : optionen.kopfzeile;
  const absaetze = optionen.absaetze || [STD_ABSATZ_1, STD_ABSATZ_2];
  const seitenTitel = `${titel} - Landtag Brandenburg`;
  const canonical = optionen.canonical === undefined ? url : optionen.canonical;
  const sachBloecke = absaetze.map(absatz => `<p>${absatz}</p>`).join("\n");
  const pdfAbsatz = `<p><ul class="list-links"><li><a class="download" target="_blank" `
    + `href="/media_fast/6/PM_${nummer}.pdf">Pressemitteilung ${nummer} <em>[PDF]</em></a></li></ul></p>`;
  const nav = `<nav aria-label="Sie sind hier"><h6>Breadcrumb</h6><ol><li><a href="/de/startseite">Start</a></li></ol></nav>`;
  const html = `<!doctype html><html lang="de"><head><meta charset="UTF-8">`
    + `<meta property="og:title" content="${seitenTitel}"><title>${seitenTitel}</title>`
    + `<link rel="canonical" href="${canonical}"></head>`
    + `<body><div class="wrapper container"><div class="row"><main class="col-lg">`
    + `${nav}\n<h1>${titel}</h1>\n<p><em>${kopfzeile}</em></p>\n${sachBloecke}\n${pdfAbsatz}</main>`
    + `<aside class="col-lg-4"><section class="box accent"><h4>Kontakt</h4>`
    + `<p>Die <a href="/sixcms/detail.php/25215">Pressestelle</a> steht zur Verfuegung.</p></section></aside>`
    + `<footer><address class="vcard">Landtag Brandenburg</address></footer></div></div></body></html>`;
  return { eingabe: { url: optionen.url || canonical, finalUrl: optionen.finalUrl || canonical,
    http: optionen.http === undefined ? 200 : optionen.http, html }, url, datum, titel, id, kopfzeile };
}

function rssItem(optionen = {}) {
  return { nummer: optionen.nummer || "50117", titel: optionen.titel || "Synthetische Landtagsmeldung zum Beispielvorhaben",
    link: optionen.link || "https://www.landtag.brandenburg.de/sixcms/detail.php?id=brandenburg_01.c.50117.de",
    guid: optionen.guid, author: optionen.author,
    pubDate: optionen.pubDate || "Wed, 23 Sep 2026 12:42:00 +0200",
    publikationstag: optionen.publikationstag || "2026-09-23" };
}

const SYN_SEITE = seite();
const ARTIKEL = P.pruefePresseartikel(SYN_SEITE.eingabe);
const ITEM = Object.freeze({ ...rssItem({ guid: "https://www.landtag.brandenburg.de/sixcms/detail.php?id=brandenburg_01.c.50117.de",
  author: "brandenburg_01.c.50117.de (50117)" }) });
const BINDUNG = R.bindeRssItemAnArtikel(ITEM, ARTIKEL);
function dokument(patch = {}) {
  return { id: "local-synthetischer-landtagbeleg", title: ARTIKEL.titel, url: ARTIKEL.url,
    canonical_url: ARTIKEL.url, published_at: null, summary: "", source_name: "Landtag Brandenburg", ...patch };
}
const ERZEUGT = B.erzeugeArtikelstand(dokument(), ARTIKEL, BINDUNG);
A.equal(ERZEUGT.ok, true, JSON.stringify(ERZEUGT));
const STAND = ERZEUGT.stand;
const ROW = ERZEUGT.row;

// 1) Positiv: getrennte Identitaet, erster ganzer Sachabsatz, gebundene UTC nur aus dem Item.
test("Positivprobe: Stand, Rohzeile, summary und gebundene UTC-Zeit", () => {
  A.deepEqual(Object.keys(STAND), [...B.STAND_FELDER]);
  A.equal(Object.isFrozen(STAND), true);
  A.equal(STAND.herkunft, B.HERKUNFT);
  A.equal(STAND.url, D.canonicalizeUrl(SYN_SEITE.url));
  A.equal(STAND.titel, ARTIKEL.titel);
  A.equal(STAND.publikationstag, "2026-09-23");
  A.equal(STAND.publikationszeitpunktUtc, "2026-09-23T10:42:00.000Z");
  A.equal(STAND.absatzHash, sha256(STD_ABSATZ_1));
  A.equal(STAND.volltextHash, sha256(ARTIKEL.volltext));
  A.equal(STAND.standHash, B.standHashFuer(STAND));
  A.equal(ERZEUGT.absatz, STD_ABSATZ_1);
  // Rohzeile: eigene Kennung, kein Volltext, kein HTML, published_at bleibt leer.
  A.equal(ROW.id, "rd-" + STAND.standHash);
  A.equal(ROW.content_hash, STAND.standHash);
  A.equal(ROW.summary, STD_ABSATZ_1);
  A.equal(ROW.published_at, null);
  A.equal(ROW.title, ARTIKEL.titel);
  A.equal(Object.keys(ROW.raw.helmutBrandenburgLandtagPresseArtikelstand).length, B.STAND_FELDER.length);
  const meta = ROW.raw.helmutBrandenburgLandtagPresseArtikelstand;
  A.equal(Object.hasOwn(ROW, "volltext") || Object.hasOwn(ROW, "content") || Object.hasOwn(ROW, "html"), false);
  A.equal(Object.hasOwn(meta, "volltext") || Object.hasOwn(meta, "html") || Object.hasOwn(meta, "content"), false);
  A.equal(JSON.stringify(ROW).includes("<p>"), false);
  // Eigene Leseprojektion bestaetigt dieselbe Kennung.
  A.equal(B.leseArtikelstand(ROW)?.standHash, STAND.standHash);
  A.equal(B.kennungFuerStand(STAND), ROW.id);
});

// 2) Bindung: die UTC-Zeit entsteht ausschliesslich aus dem gebundenen RSS-Item.
test("UTC-Provenienz: Item-Identitaet, exakter Titel und lokaler Tag erneut geprueft", () => {
  A.equal(BINDUNG.publikationstag, ARTIKEL.publikationstag);
  A.equal(BINDUNG.publikationszeitpunktUtc, "2026-09-23T10:42:00.000Z");
  // Ein anderer Item-pubDate ergibt eine andere gebundene Uhrzeit (kein Artikelkopf, kein Feed-Datum).
  const spaeter = R.bindeRssItemAnArtikel({ ...ITEM, pubDate: "Wed, 23 Sep 2026 18:00:00 +0200" }, ARTIKEL);
  A.equal(spaeter.publikationszeitpunktUtc, "2026-09-23T16:00:00.000Z");
  A.equal(B.erzeugeArtikelstand(dokument(), ARTIKEL, spaeter).stand.publikationszeitpunktUtc,
    "2026-09-23T16:00:00.000Z");
  // lastBuildDate ist keine Artikelpublikation: ein Item ohne pubDate wird gar nicht erst gebunden.
  A.throws(() => R.bindeRssItemAnArtikel({ ...ITEM, pubDate: "Mon, 28 Sep 2026 16:26:47 +0200" }, ARTIKEL),
    /brandenburg-landtag-presse-rss-pubdate-ungueltig|tag-widerspruch/);
});

// 3) Fremder RSS-Eintrag: falsche Nummer/ID/Link/Autor brechen ab.
test("Negativ: fremder RSS-Eintrag (Nummer, Link, Autor, ID)", () => {
  fehler(B.standAusRssItem(dokument(), rssItem({ nummer: "50000", link: "https://www.landtag.brandenburg.de/sixcms/detail.php?id=brandenburg_01.c.50000.de",
    guid: "https://www.landtag.brandenburg.de/sixcms/detail.php?id=brandenburg_01.c.50000.de",
    author: "brandenburg_01.c.50000.de (50000)", titel: ARTIKEL.titel }), SYN_SEITE.eingabe), "pfad-widerspruch");
  // Gleiche Nummer am Pfad, aber fremder guid/link -> Identitaetswiderspruch.
  A.throws(() => R.bindeRssItemAnArtikel({ ...ITEM, link: ITEM.link.replace("50117", "50000"),
    guid: ITEM.link.replace("50117", "50000") }, ARTIKEL),
  /brandenburg-landtag-presse-rss-item-identitaet-widerspruch/);
  A.throws(() => R.bindeRssItemAnArtikel({ ...ITEM, guid: ITEM.link.replace("50117", "50000") }, ARTIKEL),
    /brandenburg-landtag-presse-rss-item-identitaet-widerspruch/);
});

// 4) Falsches Datum/Titel/ID.
test("Negativ: falsches Datum, falscher Titel, falsche ID", () => {
  const artikelFalscherTag = { ...ARTIKEL, publikationstag: "2026-09-24" };
  fehler(B.erzeugeArtikelstand(dokument(), Object.freeze(artikelFalscherTag), BINDUNG), "tag-widerspruch");
  const titelDrift = Object.freeze({ ...ARTIKEL, titel: ARTIKEL.titel + " (anders)" });
  fehler(B.erzeugeArtikelstand(dokument(), titelDrift, BINDUNG), "titel-widerspruch");
  fehler(B.erzeugeArtikelstand(dokument({ title: "Ganz anderer Titel" }), ARTIKEL, BINDUNG), "titel-abweichend");
  const idDrift = seite({ id: "50000" });
  fehler(B.standAusRssItem(dokument(), ITEM, idDrift.eingabe), "pfad-widerspruch");
});

// 5) Fehlender RSS-Zeitbeleg und unzulaessige Stand-Zeit.
test("Negativ: fehlender RSS-Zeitbeleg, manipulierte oder fehlende Zeitangabe", () => {
  const ohneUtc = { ...BINDUNG };
  delete ohneUtc.publikationszeitpunktUtc;
  fehler(B.erzeugeArtikelstand(dokument(), ARTIKEL, Object.freeze(ohneUtc)), "bindung-felder-ungueltig");
  const falscheUtc = Object.freeze({ ...BINDUNG, publikationszeitpunktUtc: "2026-09-23T12:42:00.000Z" });
  fehler(B.erzeugeArtikelstand(dokument(), ARTIKEL, falscheUtc), "rss-bindung-abweichend");
  const nurLokaleZeit = Object.freeze({ ...BINDUNG, publikationszeitpunktUtc: "2026-09-23T12:42:00+02:00" });
  fehler(B.erzeugeArtikelstand(dokument(), ARTIKEL, nurLokaleZeit), "rss-bindung-abweichend");
  fehler(B.standAusRssItem(dokument(), { ...ITEM, pubDate: null }, SYN_SEITE.eingabe),
    "pubdate-ungueltig");
  fehler(B.erzeugeArtikelstand(dokument({ published_at: "2026-09-23",
    publishedAt: "2026-09-24" }), ARTIKEL, BINDUNG), "dokumentzeit-widerspruch");
});

// 6) Drift der Stand-Metadaten (URL, Titel, Tag, Zeit, Hashes, Standhash).
test("Negativ: Drift der geschlossenen Stand-Metadaten", () => {
  const faelle = [
    { url: STAND.url.replace("landtag.brandenburg.de", "landtag.brandenburg.example"), grund: "url-ungueltig" },
    { url: D.canonicalizeUrl(STAND.url) + "/x", grund: "url-ungueltig" },
    { titel: STAND.titel + " (anders)", grund: "standhash-abweichend" },
    { publikationstag: "2026-09-24", grund: "standhash-abweichend" },
    { publikationszeitpunktUtc: "2026-09-23T10:43:00.000Z", grund: "standhash-abweichend" },
    { publikationszeitpunktUtc: "2026-09-23T10:42:00Z", grund: "zeit-ungueltig" },
    { absatzHash: HEX64, grund: "standhash-abweichend" },
    { volltextHash: HEX64, grund: "standhash-abweichend" },
    { standHash: HEX64, grund: "standhash-abweichend" }
  ];
  for (const { grund, ...patch } of faelle) {
    wirft(() => B.pruefeArtikelstand({ ...STAND, ...patch }), "brandenburg-landtag-presseartikelstand-" + grund);
  }
  const urlDrift = Object.freeze({ ...STAND, url: "https://www.landtag.brandenburg.de/de/meldungen/anders/50117" });
  wirft(() => B.pruefeArtikelstand(urlDrift), "url-ungueltig");
});

// 7) URL-/Summary-Drift in der Rohzeile und Rohtextbeigaben.
test("Negativ: URL-/summary-Drift, Rohtextbeigaben, gesetzte published_at", () => {
  const andereUrl = Object.freeze({ ...ROW, canonical_url: "https://landtag.brandenburg.de/de/meldungen/anders/50117",
    url: "https://www.landtag.brandenburg.de/de/meldungen/anders/50117" });
  wirft(() => B.leseArtikelstand(andereUrl), "url-abweichend");
  wirft(() => B.leseArtikelstand({ ...ROW, summary: ROW.summary + " Zusatz" }), "summary-abweichend");
  wirft(() => B.leseArtikelstand({ ...ROW, summary: "x".repeat(B.MAX_ZEICHEN_ERSTER_SACHABSATZ + 1) }), "summary-zu-lang");
  // Ein gesetzter Zeitstempel in der Spalte widerspricht dem tagesgenauen Standvertrag.
  wirft(() => B.leseArtikelstand({ ...ROW, published_at: "2026-09-23T10:42:00.000Z" }),
    "veroeffentlichtzeit-widerspricht-stand");
  // Rohtextbeigaben in den geschlossenen Metadaten sind kein zulaessiges Zusatzfeld.
  const rohtext = Object.freeze({ ...STAND, volltext: ARTIKEL.volltext });
  wirft(() => B.pruefeArtikelstand(rohtext), "metadaten-ungueltig");
  const htmlBeigabe = Object.freeze({ ...STAND, html: SYN_SEITE.eingabe.html });
  wirft(() => B.pruefeArtikelstand(htmlBeigabe), "metadaten-ungueltig");
  const rohtextRoh = { ...ROW, raw: { ...ROW.raw, helmutBrandenburgLandtagPresseArtikelstand: { ...STAND, volltext: ARTIKEL.volltext } } };
  wirft(() => B.leseArtikelstand(rohtextRoh), "metadaten-ungueltig");
});

// 8) Artikelbeleg selbst: falscher Volltexthash, unzulaessige Absatzstruktur, nicht geschlossen.
test("Negativ: Artikelbeleg und Absatzstruktur", () => {
  fehler(B.erzeugeArtikelstand(dokument(), Object.freeze({ ...ARTIKEL, volltextHash: HEX64 }), BINDUNG),
    "volltexthash-abweichend");
  fehler(B.erzeugeArtikelstand(dokument(), { ...ARTIKEL }, BINDUNG), "artikel-nicht-geschlossen");
  fehler(B.erzeugeArtikelstand(dokument(), ARTIKEL, { ...BINDUNG }), "bindung-nicht-geschlossen");
  wirft(() => B.ersterSachabsatz("Ohne Umbruch"), "volltext-ungueltig");
  wirft(() => B.ersterSachabsatz("Absatz.\n\n\nEnde.\n"), "absatzstruktur-ungueltig");
  wirft(() => B.ersterSachabsatz("x".repeat(B.MAX_ZEICHEN_ERSTER_SACHABSATZ + 1) + "\n"), "erster-sachabsatz-zu-lang");
  wirft(() => B.pruefeArtikelstand({ ...STAND, version: 2 }), "version-ungueltig");
  wirft(() => B.pruefeArtikelstand({ ...STAND, herkunft: "fremd" }), "herkunft-ungueltig");
});

// 9) BEFUND (aktueller Sprint): der Stand ist BEWUSST nicht am generischen Dispatcher verdrahtet.
// Der generische Import-/Storage-/Lage-Weg ist tagesgenau (published_at is null, berlinTagVollImFenster)
// und wuerde die gebundene Uhrzeit still verlieren. Deshalb kein stiller Rueckfall und keine
// generische Lockerung: der Folge-Sprint muss den Uhrzeitpfad selbst erweitern. Diese Erwartungen
// sind beim Verdrahten des Standes anzupassen.
test("BEFUND: getrennter Stand ohne stillen Rueckfall ueber den generischen Dispatcher", () => {
  A.equal(ST.leseStand(ROW), null, "in diesem Sprint nicht verdrahtet");
  // Ohne Verdrahtung faellt dedup auf die URL-Identitaet zurueck — genau der stille Verlust, den
  // der Stand vermeidet. Deshalb gilt: kein Import ohne eigene, freigegebene Anbindung.
  A.equal(D.toRawDocumentRow(ROW).content_hash, sha256("url:" + STAND.url));
  A.notEqual(D.toRawDocumentRow(ROW).content_hash, STAND.standHash);
});

// 10) Echte lokale Originale (nur wenn vorhanden) — die bekannten Hashes.
if (fs.existsSync(ARTIKEL_DATEI) && fs.existsSync(RSS_DATEI)) {
  const html = fs.readFileSync(ARTIKEL_DATEI, "utf8");
  const rss = fs.readFileSync(RSS_DATEI, "utf8");
  A.equal(sha256(html), ERWARTET_ARTIKEL_SHA);
  A.equal(sha256(rss), ERWARTET_RSS_SHA);
  const artikel = P.pruefePresseartikel({ url: ORIGINAL_URL, finalUrl: ORIGINAL_URL, http: 200, html });
  A.equal(artikel.titel, ORIGINAL_TITEL);
  A.equal(artikel.publikationstag, ORIGINAL_TAG);
  A.equal(artikel.volltext.length, 2750);
  A.equal(artikel.volltextHash, ORIGINAL_VOLLTEXT_SHA);
  const feed = R.pruefePresseRss({ url: R.ANFRAGE_URL, finalUrl: R.FINALE_URL, http: 200, rss });
  const item = feed.items.find(i => i.nummer === "50117");
  const bindung = R.bindeRssItemAnArtikel(item, artikel);
  A.equal(bindung.publikationszeitpunktUtc, ORIGINAL_UTC);
  const erzeugt = B.standAusRssItem({ id: "local-original", title: artikel.titel, url: artikel.url,
    canonical_url: artikel.url, published_at: null, summary: "", source_name: "Landtag Brandenburg" },
    item, { url: ORIGINAL_URL, finalUrl: ORIGINAL_URL, http: 200, html });
  A.equal(erzeugt.ok, true, JSON.stringify(erzeugt));
  A.equal(erzeugt.stand.standHash, ORIGINAL_STANDHASH);
  A.equal(erzeugt.stand.absatzHash, ORIGINAL_ABSATZ_SHA);
  A.equal(erzeugt.stand.publikationszeitpunktUtc, ORIGINAL_UTC);
  A.equal(erzeugt.stand.publikationstag, ORIGINAL_TAG);
  A.equal(erzeugt.absatz.length, 497);
  A.equal(erzeugt.row.id, "rd-" + ORIGINAL_STANDHASH);
  A.equal(erzeugt.row.published_at, null);
  A.equal(B.leseArtikelstand(erzeugt.row)?.standHash, ORIGINAL_STANDHASH);
  console.log(`PASS echte Originale: Stand ${ORIGINAL_STANDHASH.slice(0, 12)}…, 497 Zeichen, UTC ${ORIGINAL_UTC}`);
} else {
  console.log("SKIP echte Originalprobe: lokale /private/tmp-Originale fehlen (CI-tauglich)");
}

console.log(`PASS brandenburg-landtag-presseartikelstand-test abgeschlossen (${bestanden} Pruefgruppen)`);
