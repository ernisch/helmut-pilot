"use strict";

// Helmut — gezielter Offline-Test des schmalen, zunaechst INAKTIVEN Code-Dispatches fuer den
// EINEN amtlichen Brandenburg-Landtagspresse-Abrufweg (Landesversorgung Brandenburg).
// =============================================================================================
// Kein Netz, keine DB, keine KI, keine Production-Daten, keine Speicherung. Der EINZIGE Abrufweg
// ist die injizierte Funktion fetchUrl; sie liefert synthetische Feed- und Artikelantworten.
// Geprueft wird:
//   * die Kopplung source-mode/crawler: die Dispatch-Kennung des Crawlers ist exakt die
//     source-mode-Kennung, und genau der aus source-mode entstandene Quellentyp ruft die
//     geschlossene Kette lib/helmut/brandenburg-landtag-presse-kette.js auf;
//   * der Dispatch in lib/helmut/crawler.js: NUR die exakte Identitaet (id bb-landesparlament,
//     name Landtag Brandenburg, type parliament, feste Feedadresse, Spezial-Methode) wird
//     dispatcht. Jede Abweichung bricht VOR jedem Abruf ab (kein generischer RSS-Rueckfall);
//   * die minimierten Stand-Rohzeilen tragen ueber den bestehenden toRawDocumentRow-Vertrag die
//     echte source_id/source_name/source_type, ohne HTML/Volltext und ohne erfundene
//     Publikationsuhrzeit;
//   * ein spaeter Artikelfehler liefert atomar KEINE Teilresultate (sichtbarer Quellenfehler).
//
// Aufruf: node scripts/brandenburg-landtag-crawl-dispatch-test.js

const assert = require("node:assert/strict");

const SM = require("../lib/helmut/quellenarchitektur/source-mode");
const C = require("../lib/helmut/crawler");
const D = require("../lib/helmut/dedup");
const BB = require("../lib/helmut/brandenburg-landtag-presseartikelstand");
const RSS = require("../lib/helmut/brandenburg-landtag-presse-rss");

let bestanden = 0;
function check(name, bedingung) {
  assert.ok(bedingung, name);
  bestanden += 1;
  console.log("OK " + name);
}

const KETTE = SM.BRANDENBURG_LANDTAG_PRESSE.crawlMethod;
const ANFRAGE_URL = RSS.ANFRAGE_URL;
const HOST = "landtag.brandenburg.de";

// ---------------------------------------------------------------------------------------------
// Synthetische amtliche Meldung (echte Leserstruktur) und synthetischer RSS-Feed.
// ---------------------------------------------------------------------------------------------
const ABSATZ_1 = "Die synthetische Landtagsmeldung beschreibt einen amtlich belegten Sachverhalt "
  + "der Brandenburger Landesversorgung und dient ausschliesslich der lokalen Offlinepruefung "
  + "dieses Dispatchtests ohne Netz, Datenbank oder Modellaufruf.";
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

// Vollstaendig injizierter Abruf in der Antwortform der bestehenden Anbieter-Engstelle
// (fetchUrl -> { body, finalUrl, status }). Kein Netzweg; jede Adresse wird protokolliert.
function abrufFabrik(optionen = {}) {
  const items = optionen.items || STD_ITEMS;
  const calls = [];
  const feedAntwort = optionen.feedAntwort || { finalUrl: RSS.FINALE_URL, status: 200,
    body: optionen.feed === undefined ? feedXml(items, optionen) : optionen.feed };
  const artikelAntwort = optionen.artikelAntwort || (() => null);
  const fetchUrl = async function fetchUrl(url, depth, deps) {
    calls.push({ url, depth, deps });
    if (url === ANFRAGE_URL) return feedAntwort;
    const item = items.find(it => url === itemLink(it));
    if (!item) throw new Error("unerwarteter-abruf: " + url);
    const bestimmteAntwort = artikelAntwort(item, url);
    if (bestimmteAntwort) return bestimmteAntwort;
    return { body: artikelHtml(item), finalUrl: kanonischUrl(item), status: 200 };
  };
  return { fetchUrl, calls, items };
}

// Die ECHTE, aus dem exakten Plan-Typ entstandene Quelle (Kennung + Feedadresse + Typ + Methode).
const landtagQuelle = (over = {}) => ({ id: "bb-landesparlament", name: "Landtag Brandenburg",
  type: "parliament", url: ANFRAGE_URL, priority: 60, active: true, crawlMethod: KETTE, ...over });

// Kein HTML/Volltext und keine erfundene Publikationsuhrzeit in Items. Die gebundene UTC-Angabe
// steht ausschliesslich in den geschlossenen Stand-Metadaten; der Zeitpfad bleibt tagesgenau.
function ohneRohinhalte(items) {
  const s = JSON.stringify(items);
  return !/<[a-z/]/i.test(s) && !/"volltext"/.test(s) && !/"html"/.test(s)
    && items.every((it) => !it.volltext && !it.html
      && it.published_at == null && it.publishedAt == null);
}

// Erwartet einen Dispatch-Abbruch VOR jedem Abruf (rein lokal).
async function erwarteDispatchAbbruch(quelle, fetchUrl) {
  let fehler = null;
  try { await C.crawlSource(quelle, { fetchUrl }); } catch (error) { fehler = error; }
  return fehler && /brandenburg-landtag-presse-kette-dispatch-ungueltig/.test(fehler.message);
}

async function dispatchPruefungen() {
  // --- Positiv: Kette ueber den injizierten fetchUrl-Adapter (kein Netz) -----------------------
  {
    const { fetchUrl, calls } = abrufFabrik();
    const items = await C.crawlSource(landtagQuelle(), { fetchUrl });

    check("Crawler: genau zwei minimierte Rohitems, kein generischer RSS-Rueckfall",
      items.length === 2 && calls.length === 3);
    check("Crawler: Feed GENAU an der festen Anfrageadresse, mit Hostbindung und Statuswunsch",
      calls[0].url === ANFRAGE_URL && calls[0].depth === 0
        && calls[0].deps.allowedHost === HOST && calls[0].deps.meldeStatus === true);
    check("Crawler: jeder Artikel ausschliesslich ueber den gebundenen Item-Link",
      calls[1].url === itemLink(STD_ITEMS[0]) && calls[2].url === itemLink(STD_ITEMS[1]));
    check("Crawler: jede Zeile traegt die ECHTE, gebundene Quellenkennung",
      items.every((it) => it.sourceId === "bb-landesparlament"
        && it.sourceName === "Landtag Brandenburg" && it.sourceType === "parliament"));
    check("Crawler: kein HTML/Volltext und keine erfundene Uhrzeit",
      ohneRohinhalte(items) && !JSON.stringify(items).includes(ABSATZ_2));

    // Bestandsprojektion: exakt der bestehende toRawDocumentRow-Vertrag + Dedup.
    const zeilen = items.map(D.toRawDocumentRow).filter((r) => r && r.id);
    const rows = D.dedupeRawDocuments(zeilen);
    check("Storage-Projektion: zwei eindeutige Stand-Rohzeilen, ID/Standhash unveraendert",
      rows.length === 2 && rows.every((row, i) => {
        const stand = BB.pruefeArtikelstand(items[i].raw[BB.ROHFELD]);
        return row.id === "rd-" + stand.standHash && row.content_hash === stand.standHash
          && BB.leseArtikelstand(row)?.standHash === stand.standHash;
      }));
    check("Storage-Projektion: echte, nicht leere source_id/source_name/source_type",
      rows.every((row) => row.source_id === "bb-landesparlament"
        && row.source_name === "Landtag Brandenburg" && row.source_type === "parliament"));
    check("Storage-Projektion: Tag ohne Uhrzeit (published_at null), Kalendertag gebunden",
      rows.every((row) => row.published_at === null
        && /^\d{4}-\d{2}-\d{2}$/.test(row.raw[BB.ROHFELD].publikationstag)));
    check("Storage-Projektion: Summary bleibt der gebundene erste Sachabsatz",
      rows.every((row) => row.summary === ABSATZ_1
        && row.summary === BB.standZusammenfassung(row.summary, BB.pruefeArtikelstand(row.raw[BB.ROHFELD]))));
  }

  // --- Negativ: jede Identitaetsabweichung bricht VOR jedem Abruf ab ---------------------------
  {
    const abweichungen = [
      ["id", { id: "rp-bb-landesparlament" }],
      ["name", { name: "Landesregierung Brandenburg" }],
      ["type", { type: "government" }],
      ["URL", { url: RSS.FINALE_URL }],
      ["Methode", { crawlMethod: "rss" }]
    ];
    for (const [feld, over] of abweichungen) {
      const { fetchUrl, calls } = abrufFabrik();
      const abgebrochen = await erwarteDispatchAbbruch(landtagQuelle(over), fetchUrl);
      check(`Dispatch: Abweichung ${feld} wird gesperrt, ohne jeden Abruf`,
        abgebrochen && calls.length === 0);
    }
    // Eine voellig fremde Quelle ohne Spezial-Kennung UND ohne feste Feedadresse bleibt unveraendert.
    const { fetchUrl, calls } = abrufFabrik();
    const fremd = await C.crawlSource(
      landtagQuelle({ crawlMethod: "manual", url: "https://bb.example/rss" }), { fetchUrl });
    check("Dispatch: unveraendert fremder Weg ohne Spezial-Kennung/Feedadresse bleibt beim Altverhalten",
      Array.isArray(fremd) && fremd.length === 0 && calls.length === 0);
  }

  // --- Negativ: ein spaeter Artikelfehler liefert atomar KEINE Teilresultate -------------------
  {
    const { fetchUrl, calls } = abrufFabrik({
      items: STD_ITEMS,
      artikelAntwort: (item) => item.nummer === "50000"
        ? { body: "<html></html>", finalUrl: kanonischUrl(item), status: 200 } : null
    });
    let geworfen = null;
    try { await C.crawlSource(landtagQuelle(), { fetchUrl }); } catch (error) { geworfen = error; }
    check("Spaeter Artikelfehler: crawlSource bricht fail closed ab (keine Teilitems)",
      Boolean(geworfen) && /^brandenburg-landtag-presse-kette-/.test(String(geworfen.message))
        && !/dispatch-ungueltig/.test(String(geworfen.message))
        && calls.some((c) => c.url === itemLink(STD_ITEMS[1])));
    const lauf = await C.crawlAllSources([landtagQuelle()], { fetchUrl });
    check("Spaeter Artikelfehler: crawlAllSources liefert 0 Items und zaehlt den Quellenfehler sichtbar",
      lauf.rawItems.length === 0 && lauf.newCandidateItems === 0
        && lauf.failedSources === 1 && lauf.successfulSources === 0
        && lauf.results[0].ok === false && lauf.results[0].status === "error");
  }
}

(async () => {
  // --- Kopplung source-mode/crawler -----------------------------------------------------------
  check("Kopplung: Dispatch-Kennung ist exakt die source-mode-Kennung",
    KETTE === "brandenburg_landtag_presse_kette"
      && SM.BRANDENBURG_LANDTAG_PRESSE.crawlMethod === KETTE);
  check("Kopplung: feste Identitaet stimmt (Kennung, Name, Feedadresse)",
    SM.BRANDENBURG_LANDTAG_PRESSE.legacySourceId === "bb-landesparlament"
      && SM.BRANDENBURG_LANDTAG_PRESSE.publisherName === "Landtag Brandenburg"
      && SM.BRANDENBURG_LANDTAG_PRESSE.url === ANFRAGE_URL);

  await dispatchPruefungen();

  // --- Kopplung in der Praxis: der aus source-mode entstandene Typ wird dispatcht --------------
  {
    const { fetchUrl, calls } = abrufFabrik({ items: [STD_ITEMS[0]] });
    // Genau die kuenftige Pfadkonfiguration, aus der source-mode den speziellen Quellentyp baut.
    const typ = SM.toCrawlerSource({ id: "rp-bb-landesparlament", legacy_source_id: "bb-landesparlament",
      publisher_id: "publisher-landtag.brandenburg.de", represents_type: "parliament",
      name: "Landtag Brandenburg — landesparlament", method: "rss", url: ANFRAGE_URL });
    const items = await C.crawlSource(typ, { fetchUrl });
    check("Kopplung: der echte source-mode-Quellentyp ruft genau die geschlossene Kette auf",
      typ.crawlMethod === KETTE && typ.type === "parliament"
        && items.length === 1 && calls.length === 2
        && items[0].raw[BB.ROHFELD] && items[0].sourceId === "bb-landesparlament");
  }

  console.log(`PASS brandenburg-landtag-crawl-dispatch-test: ${bestanden} Pruefungen erfolgreich`);
})().catch((error) => { console.error("FAIL " + ((error && error.stack) || error)); process.exitCode = 1; });
