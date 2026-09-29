"use strict";

// Helmut — gezielter Offline-Test der lokalen Kompositionskette der amtlichen
// Landtag-Brandenburg-Pressemitteilungen bis zur minimierten Stand-Rohzeile.
// =============================================================================================
// Vollstaendig injiziert: KEIN Netz, KEINE Datei-, DB-, Modell- oder Productionwirkung. Der
// einzige Abrufweg ist die injizierte Funktion; sie liefert synthetische Feed- und
// Artikelantworten. Geprueft werden: positiver Ein- und Mehrartikel-Fall, falsche Feedadresse,
// fremder Host/Redirect, defektes RSS, falscher Titel/Tag/Link, ein spaeter Artikelfehler
// (atomarer Abbruch ohne Teilresultat) sowie Rohzeilen-Drift.
//
// Aufruf: node scripts/brandenburg-landtag-presse-kette-test.js

const A = require("node:assert/strict");

const K = require("../lib/helmut/brandenburg-landtag-presse-kette");
const RSS = require("../lib/helmut/brandenburg-landtag-presse-rss");
const BB = require("../lib/helmut/brandenburg-landtag-presseartikelstand");

let bestanden = 0;
async function test(name, fn) { await fn(); bestanden += 1; console.log("OK " + name); }

const QUELLE = Object.freeze({ source_id: "bb-landtag-presse", source_name: "Landtag Brandenburg",
  source_type: "parliament" });

A.equal(K.VERSION, "brandenburg-landtag-presse-kette-v1");
A.deepEqual([...K.QUELLE_FELDER], ["source_id", "source_name", "source_type"]);

// ---------------------------------------------------------------------------------------------
// Synthetische amtliche Meldung (echte Leserstruktur) und synthetischer RSS-Feed.
// ---------------------------------------------------------------------------------------------
const ABSATZ_1 = "Die synthetische Landtagsmeldung beschreibt einen amtlich belegten Sachverhalt "
  + "der Brandenburger Landesversorgung und dient ausschliesslich der lokalen Offlinepruefung "
  + "dieser Kompositionskette ohne Netz, Datenbank oder Modellaufruf.";
const ABSATZ_2 = "Ein zweiter, ebenfalls vollstaendiger Sachabsatz derselben synthetischen Meldung.";
const MONATE = ["", "Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August",
  "September", "Oktober", "November", "Dezember"];

const STD_ITEMS = Object.freeze([
  Object.freeze({ nummer: "50117", slug: "synthetische_meldung",
    titel: "Synthetische Landtagsmeldung zum Beispielvorhaben", datum: "2026-09-23",
    pubDate: "Wed, 23 Sep 2026 12:42:00 +0200" }),
  Object.freeze({ nummer: "50000", slug: "zweite_meldung",
    titel: "Zweite synthetische Landtagsmeldung", datum: "2026-09-04",
    pubDate: "Fri, 04 Sep 2026 13:03:00 +0200" })
]);

const itemLink = item => `https://www.landtag.brandenburg.de/sixcms/detail.php?id=brandenburg_01.c.${item.nummer}.de`;
const kanonischUrl = (item, nummer = item.nummer, slug = item.slug) =>
  `https://www.landtag.brandenburg.de/de/meldungen/${slug}/${nummer}`;

function artikelHtml(item, optionen = {}) {
  const datum = optionen.datum || item.datum;
  const titel = optionen.titel === undefined ? item.titel : optionen.titel;
  const nummer = optionen.nummer || item.nummer;
  const slug = optionen.slug || item.slug;
  const [jahr, monat, tag] = datum.split("-");
  const kopfzeile = `Potsdam, ${Number(tag)}. ${MONATE[Number(monat)]} ${jahr} / 134`;
  const url = kanonischUrl(item, nummer, slug);
  const seitenTitel = `${titel} - Landtag Brandenburg`;
  const canonical = optionen.canonical === undefined ? url : optionen.canonical;
  return `<!doctype html><html lang="de"><head><meta charset="UTF-8">`
    + `<meta property="og:title" content="${seitenTitel}"><title>${seitenTitel}</title>`
    + `<link rel="canonical" href="${canonical}"></head>`
    + `<body><div class="wrapper container"><div class="row"><main class="col-lg">`
    + `<nav aria-label="Sie sind hier"><h6>Breadcrumb</h6><ol><li><a href="/de/startseite">Start</a></li></ol></nav>`
    + `<h1>${titel}</h1>\n<p><em>${kopfzeile}</em></p>\n<p>${ABSATZ_1}</p>\n<p>${ABSATZ_2}</p>\n`
    + `<p><ul class="list-links"><li><a class="download" target="_blank" `
    + `href="/media_fast/6/PM_${nummer}.pdf">Pressemitteilung ${nummer} <em>[PDF]</em></a></li></ul></p></main>`
    + `<aside class="col-lg-4"><section class="box accent"><h4>Kontakt</h4>`
    + `<p>Die <a href="/sixcms/detail.php/25215">Pressestelle</a> steht zur Verfuegung.</p></section></aside>`
    + `<footer><address class="vcard">Landtag Brandenburg</address></footer></div></div></body></html>`;
}

function itemXml(item) {
  const link = itemLink(item);
  return `<item><title><![CDATA[${item.titel}]]></title><link>${link}</link><guid>${link}</guid>`
    + `<pubDate>${item.pubDate}</pubDate><author>brandenburg_01.c.${item.nummer}.de (${item.nummer})</author>`
    + `<description><![CDATA[...]]></description></item>`;
}

function feedXml(items = STD_ITEMS, optionen = {}) {
  const kanalTitel = optionen.kanalTitel === undefined ? RSS.KANAL_TITEL : optionen.kanalTitel;
  return `<?xml version="1.0" encoding="utf-8"?>`
    + `<?xml-stylesheet type="text/css" href="/assets/css/feed.css"?>`
    + `<rss version="2.0"><channel><title>${kanalTitel}</title><link>${RSS.FINALE_URL}</link>`
    + `<description>Aktuelle Pressemitteilungen aus dem Landtag Brandenburg</description>`
    + `<lastBuildDate>Mon, 28 Sep 2026 16:26:47 +0200</lastBuildDate>`
    + items.map(itemXml).join("\n") + `</channel></rss>`;
}

// Vollstaendig injizierter Abruf. Kein Netzweg.
function abrufFabrik(optionen = {}) {
  const items = optionen.items || STD_ITEMS;
  const aufrufe = [];
  const feedAntwort = optionen.feedAntwort || { finalUrl: RSS.FINALE_URL, http: 200,
    body: optionen.feed === undefined ? feedXml(items, optionen) : optionen.feed };
  const artikelAntwort = optionen.artikelAntwort || (() => null);
  const abrufen = async function abrufen(url) {
    aufrufe.push(url);
    if (url === RSS.ANFRAGE_URL) return feedAntwort;
    const item = items.find(it => url === itemLink(it));
    if (!item) throw new Error("unerwarteter-abruf: " + url);
    const bestimmteAntwort = artikelAntwort(item, url);
    if (bestimmteAntwort) return bestimmteAntwort;
    return { finalUrl: kanonischUrl(item), http: 200, body: artikelHtml(item) };
  };
  return { abrufen, aufrufe, items };
}

const fehler = (out, grund) => {
  A.deepEqual(Object.keys(out).sort().join(","), "kennungen,ok,reason,rows");
  A.equal(out.ok, false, "kein Fehler: " + JSON.stringify(out));
  A.equal(out.reason, grund, "falscher Grund: " + out.reason);
  A.equal(out.kennungen, null);
  A.equal(out.rows, null);
};

(async () => {
  // 1) Positiv Einartikel: genau eine minimale Stand-Rohzeile, Artikel nur ueber den Item-Link.
  await test("Positiv Einartikel: minimale Stand-Rohzeile, keine Teilfreigabe", async () => {
    const { abrufen, aufrufe } = abrufFabrik({ items: [STD_ITEMS[0]] });
    const out = await K.ladeLandtagPresseKette(QUELLE, { abrufen });
    A.equal(out.ok, true, JSON.stringify(out));
    A.deepEqual(Object.keys(out).sort().join(","), "kennungen,ok,rows");
    A.equal(out.rows.length, 1);
    A.equal(Object.isFrozen(out.rows), true);
    A.equal(Object.isFrozen(out.kennungen), true);
    const row = out.rows[0];
    const stand = row.raw[BB.ROHFELD];
    A.equal(row.id, "rd-" + stand.standHash);
    A.equal(row.content_hash, stand.standHash);
    A.equal(out.kennungen[0], row.id);
    A.equal(row.published_at, null);
    A.equal(Object.hasOwn(row, "publishedAt"), false);
    A.equal(row.summary, ABSATZ_1);
    A.equal(row.title, STD_ITEMS[0].titel);
    A.equal(row.source_id, QUELLE.source_id);
    A.equal(row.source_name, QUELLE.source_name);
    A.equal(row.source_type, "parliament");
    A.equal(stand.publikationstag, "2026-09-23");
    // Kein HTML/Volltext/RSS-Rohtext irgendwo in der Zeile.
    A.equal(Object.hasOwn(row, "volltext") || Object.hasOwn(row, "html") || Object.hasOwn(row, "rohtext"), false);
    A.equal(Object.hasOwn(stand, "volltext") || Object.hasOwn(stand, "html"), false);
    A.equal(JSON.stringify(row).includes("<p>"), false);
    A.equal(JSON.stringify(row).includes("CDATA"), false);
    // Der Artikel wurde ausschliesslich ueber den gebundenen Item-Link abgerufen.
    A.deepEqual(aufrufe, [RSS.ANFRAGE_URL, itemLink(STD_ITEMS[0])]);
    A.equal(K.pruefeKettenrohzeile(QUELLE, stand, row).ok, true);
  });

  // 2) Positiv Mehrartikel: pro Item GENAU eine Rohzeile, eigene Kennung, gebundene Item-Links.
  await test("Positiv Mehrartikel: eine Rohzeile je Item ueber den gebundenen Link", async () => {
    const { abrufen, aufrufe } = abrufFabrik();
    const out = await K.ladeLandtagPresseKette(QUELLE, { abrufen });
    A.equal(out.ok, true, JSON.stringify(out));
    A.equal(out.rows.length, 2);
    A.equal(new Set(out.kennungen).size, 2);
    A.equal(out.rows[0].id, out.kennungen[0]);
    A.equal(out.rows[1].id, out.kennungen[1]);
    A.deepEqual(aufrufe, [RSS.ANFRAGE_URL, itemLink(STD_ITEMS[0]), itemLink(STD_ITEMS[1])]);
    for (const row of out.rows) {
      A.equal(row.published_at, null);
      A.equal(row.source_type, "parliament");
      A.equal(JSON.stringify(row).includes("<p>"), false);
      A.equal(K.pruefeKettenrohzeile(QUELLE, row.raw[BB.ROHFELD], row).ok, true);
    }
    A.equal(out.rows[0].summary, ABSATZ_1);
  });

  // 3) Falsche Feedadresse: falsche finale Feedadresse und fremder Host brechen atomar ab.
  await test("Negativ: falsche Feedadresse und fremder Feed-Host", async () => {
    const a = await K.ladeLandtagPresseKette(QUELLE,
      { abrufen: abrufFabrik({ feedAntwort: { finalUrl: RSS.ANFRAGE_URL, http: 200, body: feedXml() } }).abrufen });
    fehler(a, "feed-identitaet-abweichend");
    const b = await K.ladeLandtagPresseKette(QUELLE,
      { abrufen: abrufFabrik({ feedAntwort: { finalUrl: "https://fremd.example/cms/detail.php?template=ltbrb_rss_d", http: 200, body: feedXml() } }).abrufen });
    fehler(b, "feed-identitaet-abweichend");
    const c = await K.ladeLandtagPresseKette(QUELLE,
      { abrufen: abrufFabrik({ feedAntwort: { finalUrl: RSS.FINALE_URL, http: 404, body: feedXml() } }).abrufen });
    fehler(c, "feed-identitaet-abweichend");
  });

  // 4) Fremder Host/Redirect beim Artikel: nur der kanonische Item-Link derselben Nummer zaehlt.
  await test("Negativ: fremder Host/Redirect und fremde Nummer beim Artikel", async () => {
    const fremd = await K.ladeLandtagPresseKette(QUELLE, { abrufen: abrufFabrik({
      items: [STD_ITEMS[0]],
      artikelAntwort: item => ({ finalUrl: "https://fremd.example/de/meldungen/" + item.slug + "/" + item.nummer,
        http: 200, body: artikelHtml(item) }) }).abrufen });
    fehler(fremd, "artikelziel-ungueltig");
    const andereNummer = await K.ladeLandtagPresseKette(QUELLE, { abrufen: abrufFabrik({
      items: [STD_ITEMS[0]],
      artikelAntwort: item => ({ finalUrl: kanonischUrl(item, "50000"),
        http: 200, body: artikelHtml(item) }) }).abrufen });
    fehler(andereNummer, "artikelziel-ungueltig");
    const http = await K.ladeLandtagPresseKette(QUELLE, { abrufen: abrufFabrik({
      items: [STD_ITEMS[0]],
      artikelAntwort: item => ({ finalUrl: kanonischUrl(item), http: 500, body: artikelHtml(item) }) }).abrufen });
    fehler(http, "artikel-http-nicht-ok");
  });

  // 5) Defektes RSS: kein generischer Fallback, der bestehende strenge Leser entscheidet.
  await test("Negativ: defektes RSS bricht die ganze Kette ab", async () => {
    const gefaelscht = await K.ladeLandtagPresseKette(QUELLE,
      { abrufen: abrufFabrik({ feed: feedXml(STD_ITEMS, { kanalTitel: "Fremder Kanal" }) }).abrufen });
    fehler(gefaelscht, "kanal-titel-abweichend");
    const kaputt = await K.ladeLandtagPresseKette(QUELLE,
      { abrufen: abrufFabrik({ feed: "<rss version=\"2.0\"><channel><title>" }).abrufen });
    A.equal(kaputt.ok, false);
    A.equal(kaputt.kennungen, null);
    A.equal(kaputt.rows, null);
  });

  // 6) Falscher Titel/Tag: die bestehende Artikel-/Item-Bindung sperrt.
  await test("Negativ: falscher Titel und falscher Tag", async () => {
    const falscherTitel = await K.ladeLandtagPresseKette(QUELLE, { abrufen: abrufFabrik({
      items: [STD_ITEMS[0]],
      artikelAntwort: item => ({ finalUrl: kanonischUrl(item), http: 200,
        body: artikelHtml(item, { titel: "Ganz anderer Titel" }) }) }).abrufen });
    fehler(falscherTitel, "titel-widerspruch");
    const falscherTag = await K.ladeLandtagPresseKette(QUELLE, { abrufen: abrufFabrik({
      items: [STD_ITEMS[0]],
      artikelAntwort: item => ({ finalUrl: kanonischUrl(item), http: 200,
        body: artikelHtml(item, { datum: "2026-09-22" }) }) }).abrufen });
    fehler(falscherTag, "tag-widerspruch");
  });

  // 7) Spaeter Artikelfehler: der zweite Artikel sperrt die GANZE Kette (kein Teilresultat).
  await test("Negativ: spaeter Artikelfehler liefert atomar null Items", async () => {
    const out = await K.ladeLandtagPresseKette(QUELLE, { abrufen: abrufFabrik({
      items: STD_ITEMS,
      artikelAntwort: (item, url) => item.nummer === "50000"
        ? { finalUrl: kanonischUrl(item), http: 200, body: "<html></html>" }
        : null }).abrufen });
    A.equal(out.ok, false, JSON.stringify(out));
    A.equal(out.rows, null);
    A.equal(out.kennungen, null);
  });

  // 8) Rohzeilen-Drift: jede Abweichung der fertigen Rohzeile wird erkannt.
  await test("Negativ: Rohzeilen-Drift (Kennung, Zeit, Roh-Text, Quellenbindung)", async () => {
    const { abrufen } = abrufFabrik({ items: [STD_ITEMS[0]] });
    const out = await K.ladeLandtagPresseKette(QUELLE, { abrufen });
    const row = out.rows[0];
    const stand = row.raw[BB.ROHFELD];
    A.equal(K.pruefeKettenrohzeile(QUELLE, stand, row).ok, true);
    A.equal(K.pruefeKettenrohzeile(QUELLE, stand, { ...row, id: "rd-" + "0".repeat(64) }).ok, false);
    A.equal(K.pruefeKettenrohzeile(QUELLE, stand, { ...row, content_hash: "0".repeat(64) }).ok, false);
    A.equal(K.pruefeKettenrohzeile(QUELLE, stand, { ...row, published_at: "2026-09-23" }).ok, false);
    A.equal(K.pruefeKettenrohzeile(QUELLE, stand, { ...row, volltext: "heimlich" }).ok, false);
    A.equal(K.pruefeKettenrohzeile(QUELLE, stand, { ...row, source_type: "government" }).ok, false);
    const metaMitVolltext = { ...row, raw: { ...row.raw, [BB.ROHFELD]: { ...stand, volltext: "x" } } };
    A.equal(K.pruefeKettenrohzeile(QUELLE, stand, metaMitVolltext).ok, false);
    A.equal(K.pruefeKettenrohzeile(QUELLE, { ...stand, standHash: "0".repeat(64) }, row).ok, false);
  });

  // 9) Grenzen der Kette: nur injizierter Abruf, nur amtliches Parlament als Quelle.
  await test("Negativ: fehlende Injektion und unzulaessige Quelle", async () => {
    fehler(await K.ladeLandtagPresseKette(QUELLE, {}), "abruf-nicht-injiziert");
    fehler(await K.ladeLandtagPresseKette({ ...QUELLE, source_type: "government" },
      { abrufen: abrufFabrik().abrufen }), "quellentyp-ungueltig");
    fehler(await K.ladeLandtagPresseKette({ source_name: "Landtag Brandenburg", source_type: "parliament" },
      { abrufen: abrufFabrik().abrufen }), "quelle-ungueltig");
    fehler(await K.ladeLandtagPresseKette(QUELLE,
      { abrufen: abrufFabrik({ feedAntwort: { finalUrl: RSS.FINALE_URL, http: 200, body: feedXml(),
        status: 200 } }).abrufen }), "feed-identitaet-abweichend");
  });

  console.log("PASS brandenburg-landtag-presse-kette-test abgeschlossen: " + bestanden + " Gruppen");
})().catch(error => { console.error(error && error.stack || error); process.exit(1); });
