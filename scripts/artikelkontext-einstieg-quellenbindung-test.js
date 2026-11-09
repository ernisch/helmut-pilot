"use strict";
// Gespeicherte Quellenmetadaten und vorhandene Originalproben; alle Mutationen
// sind deklarierte Gegenproben. Keine Abrufe, Modelle oder Produktionsdaten.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const G = require("../lib/helmut/artikelkontext-gewinnung");
const A = require("../lib/helmut/artikelkontext");
const C = require("../lib/helmut/crawler"), D = require("../lib/helmut/dedup");
const fixture = name => fs.readFileSync(path.join(__dirname, "fixtures/inhaltsversorgung-20261108", name), "utf8");
const dgbHtml = fixture("dgb-artikel.html"), radioHtml = fixture("radio-hannover.html");
const gelesenAm = "2026-11-08T08:00:00Z";
const dgbUrl = "https://www.dgb.de/service/weiterer-service/tarifmeldungen/tarifmeldung/dritte-tarifrunde-im-gebaeudereiniger-handwerk-endet-ohne-ergebnis/";
const radioUrl = "https://www.radio-hannover.de/hannover-news/sozialverband-warnt-vor-altersarmut-in-niedersachsen";
const feed = C.parseRssItems(fs.readFileSync(path.join(__dirname, "fixtures/quelleninhalt-20261107/dgb-google.xml"), "utf8"))[0];
const dgbFeed = D.toRawDocumentRow(C.normalizeRawItem({ ...feed, url: dgbUrl, originalUrl: feed.url },
  { id: "dgb", name: "DGB", type: "association", url: "https://news.google.com/rss/search?q=site:dgb.de" }));
// Ueberlieferter gespeicherter Titel/Quellenname aus dem Auftrag; die neuere
// Original-RSS-Probe hat dieselbe Artikelueberschrift, aber einen anderen Suffix.
const dgb = { ...dgbFeed, title: "Dritte Tarifrunde im Gebäudereiniger-Handwerk endet ohne Ergebnis - DGB - Deutscher Gewerkschaftsbund", source_name: "DGB" };
const radio = D.toRawDocumentRow({ title: "Sozialverband warnt vor Altersarmut in Niedersachsen - Radio Hannover",
  sourceName: "Radio Hannover", sourceType: "media", linkType: "direct", url: radioUrl, publishedAt: "2026-11-06T11:11:24Z" });
const extract = (doc, body) => G.gewinneArtikelEinstieg(doc, { body, finalUrl: doc.url, gelesenAm });
let passed = 0;
function test(name, run) { run(); passed++; console.log("PASS " + name); }
function rejected(doc, original, changed, label) {
  assert.notEqual(changed, original, "Gegenprobe muss Original aendern: " + label);
  const result = extract(doc, changed);
  assert.equal(result.ok, false, label + ": " + JSON.stringify(result));
}

test("Ueberlieferte DGB-Metadatenvariante behaelt vier volle Absaetze und Zwischenueberschriften", () => {
  const before = structuredClone(dgb), result = extract(dgb, dgbHtml);
  assert.equal(dgb.source_name, "DGB"); assert(dgb.title.endsWith(" - DGB - Deutscher Gewerkschaftsbund"));
  assert.equal(result.ok, true, result.reason); assert.equal(result.beleg.text.length, 1256);
  assert.equal(result.beleg.gewinnung.absaetze.length, 4);
  assert.deepEqual(result.beleg.gewinnung.zwischenTexte,
    ["Arbeitgeber bieten kaum Plus", "IG BAU fordert zwei Euro mehr", "Beschäftigte sind streikbereit"]);
  assert(result.beleg.text.endsWith("Die Friedenspflicht endet am 31. Dezember dieses Jahres."));
  assert.deepEqual(dgb, before); assert.equal(result.beleg.artikelTitel, dgb.title);
  assert.equal(result.beleg.quellenHash, A.quellenstandHash(dgb));
});

test("DGB-Publisherbindung braucht den exakten eindeutigen nativen Seitennamen", () => {
  const site = '<meta property="og:site_name" content="Deutscher Gewerkschaftsbund">';
  for (const [label, changed] of [
    ["fehlender Seitenname", dgbHtml.replace(site, "")],
    ["fremder Seitenname", dgbHtml.replace(site, '<meta property="og:site_name" content="Anderer Gewerkschaftsbund">')],
    ["doppelter Seitenname", dgbHtml.replace(site, site + site)],
    ["mehrdeutiger Seitenname", dgbHtml.replace(site, site + '<meta property="og:site_name" content="Fremde Quelle">')]
  ]) rejected(dgb, dgbHtml, changed, label);
  assert.equal(extract({ ...dgb, source_name: "Andere Quelle" }, dgbHtml).ok, false);
  const fremd = { ...dgb, url: dgb.url.replace("www.dgb.de", "www.fremd.de"), canonical_url: dgb.canonical_url.replace("dgb.de", "fremd.de") };
  assert.equal(extract(fremd, dgbHtml.replaceAll("www.dgb.de", "www.fremd.de")).ok, false);
  const geliefert = extract(dgbFeed, dgbHtml);
  assert.equal(geliefert.ok, true, geliefert.reason);
  assert.equal(geliefert.beleg.text, extract(dgb, dgbHtml).beleg.text);
  const kurzquelle = extract({ ...dgbFeed, source_name: "DGB" }, dgbHtml);
  assert.equal(kurzquelle.ok, true, kurzquelle.reason);
  assert.equal(kurzquelle.beleg.text, geliefert.beleg.text);
});

test("Herausgebersuffix ist allgemein gebunden, ohne Artikel- oder Mandatsausnahme", () => {
  const doc = D.toRawDocumentRow({ title: "Beschluss zu Arbeitsbedingungen - SVG - Sozialverband Beispiel",
    sourceName: "SVG", url: "https://www.svg.invalid/erklaerungen/anderer-beschluss", linkType: "direct", publishedAt: "2026-11-06T09:00:00Z" });
  const text = "Der Verband fordert bessere Arbeitsbedingungen und kuendigt weitere Gespraeche mit den Beteiligten an.";
  const data = { "@type": "NewsArticle", headline: "Beschluss zu Arbeitsbedingungen", url: doc.url,
    datePublished: doc.published_at, articleBody: text };
  const html = `<head><link rel="canonical" href="${doc.url}"><meta property="og:title" content="${data.headline}">`
    + `<meta property="og:site_name" content="Sozialverband Beispiel"><script type="application/ld+json">${JSON.stringify(data)}</script></head>`
    + `<body><article><p>${text}</p></article></body>`;
  assert.equal(extract(doc, html).ok, true);
  assert.equal(extract({ ...doc, source_name: "SV" }, html).ok, false);
});

test("Native DGB-Metadaten: fremde Titel, Ziele, Daten und Textfassungen bleiben gesperrt", () => {
  const nativeTitle = "Dritte Tarifrunde im Gebäudereiniger-Handwerk endet ohne Ergebnis";
  for (const [label, changed] of [
    ["Open-Graph-Titel", dgbHtml.replace('property="og:title" content="' + nativeTitle, 'property="og:title" content="Fremde Meldung')],
    ["JSON-LD-Titel", dgbHtml.replace('"headline":"' + nativeTitle, '"headline":"Fremde Meldung')],
    ["Open-Graph-Ziel", dgbHtml.replace('property="og:url" content="' + dgbUrl, 'property="og:url" content="https://www.dgb.de/fremd')],
    ["Canonical-Ziel", dgbHtml.replace('rel="canonical" href="' + dgbUrl, 'rel="canonical" href="https://www.dgb.de/fremd')],
    ["JSON-LD-Ziel", dgbHtml.replace('"url":"' + dgbUrl, '"url":"https://www.dgb.de/fremd')],
    ["Publikationsdatum", dgbHtml.replace('"datePublished":"2026-11-06T10:26:29+01:00"', '"datePublished":"2026-11-07T10:26:29+01:00"')],
    ["sichtbares Datum", dgbHtml.replace('datetime="2026-11-06"', 'datetime="2026-11-07"')],
    ["HTML-Textkonflikt", dgbHtml.replace('<p>Die dritte Tarifverhandlungsrunde', '<p>Die abgesagte dritte Tarifverhandlungsrunde')],
    ["zweiter Artikel", dgbHtml.replace('</head>', '<script type="application/ld+json">{"@type":"Article","headline":"Andere Meldung"}</script></head>')]
  ]) rejected(dgb, dgbHtml, changed, label);
});

test("Radio-Original bleibt voller 727-Zeichen-Absatz mit gleichem Publikationszeitpunkt", () => {
  const before = structuredClone(radio), result = extract(radio, radioHtml);
  assert.equal(result.ok, true, result.reason); assert.equal(result.beleg.text.length, 727);
  assert.equal(result.beleg.gewinnung.absaetze.length, 1); assert.equal(result.beleg.gewinnung.datumsFeld, "dateCreated");
  assert.equal(result.beleg.gewinnung.originalDatum, "2026-11-06T12:11:24+01:00");
  assert.equal(Date.parse(result.beleg.gewinnung.originalDatum), Date.parse(radio.published_at));
  assert.equal(result.beleg.gewinnung.kanonischDeklariert, radioUrl.replace("https:", "http:"));
  assert(result.beleg.text.includes("Ab 2027 könnten die Leistungen deutlich gekürzt werden."));
  assert(result.beleg.text.endsWith("Außerdem müsse die Politik mehr für bezahlbaren Wohnraum und gegen steigende Mieten tun."));
  assert.deepEqual(radio, before);
  assert.throws(() => A.pruefeArtikelkontext([radio], { ...result.beleg, version: 1, herkunft: "manueller-originalvergleich" }), /absatz-ungueltig/);
  assert.equal(extract(radio, radioHtml.replace('datetime="2026-11-06T12:11:24+01:00"', 'datetime="2026-11-06T11:11:24Z"')).ok, true);
});

test("HTTP-Deklaration braucht denselben gebundenen Publisher, Host, Pfad und Query", () => {
  const canonical = radioUrl.replace("https:", "http:"), result = extract(radio, radioHtml);
  for (const wrong of [canonical + "/", canonical + "?neu=1", canonical + "?utm_source=test", canonical + "#fremd",
    canonical.replace("www.radio-hannover.de", "radio-hannover.de"), canonical.replace("www.radio-hannover.de", "fremd.invalid"),
    canonical.replace("www.radio-hannover.de", "www.radio-hannover.de:80"), canonical.replace("www.radio-hannover.de", "www.radio-hannover.de:443"),
    canonical.replace("www.radio-hannover.de", "name:pass@www.radio-hannover.de")]) {
    rejected(radio, radioHtml, radioHtml.replace(canonical, wrong), wrong);
    assert.throws(() => A.pruefeArtikelkontext([radio], { ...result.beleg,
      gewinnung: { ...result.beleg.gewinnung, kanonischDeklariert: wrong } }), /artikelziel-abweichend/);
  }
  for (const doc of [{ ...radio, source_name: "Fremder Sender" },
    { ...radio, title: "Sozialverband warnt vor Altersarmut in Niedersachsen" }]) {
    assert.equal(extract(doc, radioHtml).ok, false);
  }
  assert.equal(G.gewinneArtikelEinstieg(radio, { body: radioHtml, finalUrl: canonical, gelesenAm }).ok, false);
  assert.equal(require("../lib/helmut/quellen-auszug").fromHtml(radio, { body: radioHtml, finalUrl: radioUrl }).ok, false);
});

test("Radio-Microdata: Titel, Zeitpunkt, Sichtbarkeit und eindeutiger Artikel bleiben Pflicht", () => {
  for (const [label, changed] of [
    ["native Ueberschrift", radioHtml.replace('itemprop="name">', 'itemprop="name">Fremde Meldung ')],
    ["Sekundendrift", radioHtml.replace('datetime="2026-11-06T12:11:24+01:00"', 'datetime="2026-11-06T12:11:25+01:00"')],
    ["falsches Datumsfeld", radioHtml.replace('itemprop="dateCreated"', 'itemprop="dateModified"')],
    ["versteckter Artikeltext", radioHtml.replace('itemprop="articleBody"', 'hidden itemprop="articleBody"')],
    ["zweiter Inhaltsbereich", radioHtml.replace('</article>', '<div itemprop="articleBody"><p>Fremder Inhalt.</p></div></article>')],
    ["zweiter Artikel", radioHtml.replace('</body>', '<article><p>Fremder Inhalt.</p></article></body>')]
  ]) rejected(radio, radioHtml, changed, label);
});

test("Radio uebernimmt keine widersprechenden alternativen Article-Metadaten", () => {
  const result = extract(radio, radioHtml), data = { "@type": "NewsArticle", headline: "Sozialverband warnt vor Altersarmut in Niedersachsen",
    url: radio.url, mainEntityOfPage: { "@id": radio.url }, datePublished: radio.published_at,
    dateCreated: radio.published_at, articleBody: result.beleg.text };
  const withData = value => radioHtml.replace('</head>', '<script type="application/ld+json">' + JSON.stringify(value) + '</script></head>');
  assert.equal(extract(radio, withData(data)).ok, true);
  for (const changed of [{ ...data, headline: "Fremde Meldung" }, { ...data, url: radio.url + "-fremd" },
    { ...data, mainEntityOfPage: { "@id": radio.url + "-fremd" } }, { ...data, datePublished: "2026-11-07T11:11:24Z" },
    { ...data, dateCreated: "2026-11-07T11:11:24Z" }, { ...data, articleBody: "Der urspruengliche Text wurde zurueckgezogen." }]) {
    rejected(radio, radioHtml, withData(changed), "widersprechende Article-Metadaten");
  }
});

test("Native Originale behalten Robots- und Max-Snippet-Sperren", () => {
  for (const [doc, original] of [[dgb, dgbHtml], [radio, radioHtml]]) {
    for (const name of ["robots", "helmutbot"]) for (const content of ["noai", "noindex", "nosnippet", "max-snippet:0"]) {
      rejected(doc, original, original.replace('</head>', `<meta name="${name}" content="${content}"></head>`), name + ":" + content);
    }
  }
});

console.log(`${passed}/${passed} Artikel-Einstieg-Quellenbindungsgruppen bestanden`);
