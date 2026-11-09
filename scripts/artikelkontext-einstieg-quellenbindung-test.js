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

// Additiver Volltextvertrag: die v2-Gegenproben oben bleiben unveraendert.
const sha256 = value => require("node:crypto").createHash("sha256").update(value).digest("hex");
const full = (doc, body) => G.gewinneArtikeltext(doc, { body, finalUrl: doc.url, gelesenAm });
function synthetischerArtikel(absaetze, headings = absaetze.slice(1).map(() => "")) {
  const doc = D.toRawDocumentRow({ title: "Kommunaler Beschluss zu Arbeitsbedingungen",
    sourceName: "Synthetische Quelle", url: "https://quelle.invalid/politik/beschluss",
    linkType: "direct", publishedAt: "2026-11-06T09:00:00Z" });
  const text = absaetze.map((p, i) => [i ? headings[i - 1] : "", p].filter(Boolean).join(" ")).join(" ");
  const data = { "@type": "NewsArticle", headline: doc.title, url: doc.url,
    datePublished: doc.published_at, articleBody: text };
  const html = `<head><link rel="canonical" href="${doc.url}"><meta property="og:title" content="${doc.title}">`
    + `<script type="application/ld+json">${JSON.stringify(data)}</script></head><body><article>`
    + absaetze.map((p, i) => `${i && headings[i - 1] ? `<h2>${headings[i - 1]}</h2>` : ""}<p>${p}</p>`).join("")
    + "</article></body>";
  return { doc, html, text };
}

test("v3 bindet den ganzen vorhandenen DGB-Artikel einschliesslich fuenftem Absatz und Radio unverkuerzt", () => {
  const before = structuredClone([dgb, radio]);
  const jsonld = JSON.parse(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i.exec(dgbHtml)[1]);
  const original = jsonld["@graph"].find(n => n["@type"] === "NewsArticle").articleBody;
  const d = full(dgb, dgbHtml), r = full(radio, radioHtml);
  assert.equal(d.ok, true, d.reason); assert.equal(r.ok, true, r.reason);
  assert.equal(d.beleg.text, original);
  assert.equal(d.beleg.gewinnung.absaetze.length, 5);
  assert.equal(d.beleg.gewinnung.artikelAbsatzZahl, 5);
  assert(d.beleg.text.endsWith(d.beleg.gewinnung.absaetze[4]));
  assert(!extract(dgb, dgbHtml).beleg.text.includes(d.beleg.gewinnung.absaetze[4]));
  assert.deepEqual(d.beleg.gewinnung.zwischenTexte.slice(0, 3),
    ["Arbeitgeber bieten kaum Plus", "IG BAU fordert zwei Euro mehr", "Beschäftigte sind streikbereit"]);
  assert.equal(r.beleg.text, extract(radio, radioHtml).beleg.text);
  assert.equal(r.beleg.text.length, 727); assert.equal(r.beleg.gewinnung.struktur, "microdata");
  assert.equal(d.beleg.gewinnung.struktur, "jsonld");
  for (const [doc, html, result] of [[dgb, dgbHtml, d], [radio, radioHtml, r]]) {
    assert.equal(result.beleg.gewinnung.verfahren, "artikeltext-v3");
    assert.equal(result.beleg.gewinnung.antwortHash, sha256(html));
    assert.equal(result.beleg.gewinnung.artikelTextHash, sha256(result.beleg.text));
    assert.equal(result.beleg.textHash, sha256(result.beleg.text));
    assert.equal(result.beleg.quellenHash, A.quellenstandHash(doc));
    assert.equal(Date.parse(result.beleg.gewinnung.originalDatum), Date.parse(doc.published_at));
    assert.deepEqual(A.pruefeArtikelkontext([doc], result.beleg), result.beleg);
  }
  assert.deepEqual([dgb, radio], before);
});

test("v3 hat kein Vier- oder Fuenfabsatzlimit und erhaelt alle Zwischenueberschriften", () => {
  const absaetze = Array.from({ length: 9 }, (_, i) => `Absatz ${i + 1} beschreibt einen eigenen Bestandteil des kommunalen Beschlusses.`);
  const headings = absaetze.slice(1).map((_, i) => `Teil ${i + 2}`);
  const f = synthetischerArtikel(absaetze, headings), result = full(f.doc, f.html);
  assert.equal(result.ok, true, result.reason); assert.equal(result.beleg.text, f.text);
  assert.deepEqual(result.beleg.gewinnung.absaetze, absaetze);
  assert.deepEqual(result.beleg.gewinnung.zwischenTexte, headings);
  assert.equal(result.beleg.gewinnung.artikelAbsatzZahl, 9);
});

test("v3 Zeichen- und UTF8-Deckel erhalten nutzbaren v2-Teilkontext ohne Volltextbehauptung", () => {
  for (const [text, ok] of [["a".repeat(7999) + ".", true], ["a".repeat(8000) + ".", false],
    ["界".repeat(3999) + "ab.", true], ["界".repeat(4000) + ".", false]]) {
    const f = synthetischerArtikel([text]), result = full(f.doc, f.html);
    assert.equal(result.ok, ok, `${text.length} Zeichen/${Buffer.byteLength(text)} Bytes: ${result.reason}`);
    if (ok) {
      assert.equal(result.beleg.text, text);
      assert.equal(result.beleg.gewinnung.verfahren, "artikeltext-v3");
    } else {
      // Ein bereits zu langer ERSTER Absatz war auch im Altvertrag unbrauchbar.
      assert.deepEqual(result, extract(f.doc, f.html));
      assert.equal(result.reason, "einstieg-zu-lang"); assert.equal(result.beleg, undefined);
    }
  }
  for (const absaetze of [
    ["Ein kurzer Anfang zum kommunalen Beschluss.", "a".repeat(8000) + "."],
    Array.from({ length: 20 }, (_, i) => `Absatz ${i + 1}: ${"a".repeat(420)}.`),
    Array.from({ length: 12 }, (_, i) => `Absatz ${i + 1}: ${"界".repeat(350)}.`)
  ]) {
    const f = synthetischerArtikel(absaetze), result = full(f.doc, f.html);
    assert(f.text.length > 8000 || Buffer.byteLength(f.text, "utf8") > 12000);
    assert.equal(result.ok, true, result.reason);
    assert.deepEqual(result, extract(f.doc, f.html), "Nutzbarer Altbeleg derselben Antwort bleibt bytegleich");
    assert.equal(result.beleg.gewinnung.verfahren, "artikel-einstieg-v2");
    assert.equal(result.beleg.gewinnung.artikelAbsatzZahl, absaetze.length);
    assert(result.beleg.gewinnung.absaetze.length < absaetze.length);
    assert(f.text.startsWith(result.beleg.text)); assert.notEqual(result.beleg.text, f.text);
    assert.equal(result.beleg.gewinnung.antwortHash, sha256(f.html));
    assert.equal(result.beleg.gewinnung.artikelTextHash, sha256(f.text));
    assert.notEqual(result.beleg.textHash, result.beleg.gewinnung.artikelTextHash);
  }
});

test("v3 behaelt QuellenDatum Titel Canonical Publisher und alternative Article-Bindung", () => {
  for (const [doc, original, changed] of [
    [dgb, dgbHtml, dgbHtml.replace('"datePublished":"2026-11-06T10:26:29+01:00"', '"datePublished":"2026-11-07T10:26:29+01:00"')],
    [dgb, dgbHtml, dgbHtml.replace('property="og:title" content="Dritte', 'property="og:title" content="Fremde')],
    [dgb, dgbHtml, dgbHtml.replace('rel="canonical" href="' + dgbUrl, 'rel="canonical" href="https://www.dgb.de/fremd')],
    [dgb, dgbHtml, dgbHtml.replace('<meta property="og:site_name" content="Deutscher Gewerkschaftsbund">', "")],
    [radio, radioHtml, radioHtml.replace('datetime="2026-11-06T12:11:24+01:00"', 'datetime="2026-11-06T12:11:25+01:00"')],
    [radio, radioHtml, radioHtml.replace('itemprop="articleBody"', 'hidden itemprop="articleBody"')],
    [radio, radioHtml, radioHtml.replace('</head>', '<script type="application/ld+json">{"@type":"NewsArticle","headline":"Fremde Meldung"}</script></head>')]
  ]) {
    assert.notEqual(changed, original); assert.equal(full(doc, changed).ok, false);
  }
  const d = full(dgb, dgbHtml).beleg;
  assert.throws(() => A.pruefeArtikelkontext([{ ...dgb, published_at: "2026-11-07T09:26:29Z" }], d), /quellenstand-abweichend/);
  assert.throws(() => A.pruefeArtikelkontext([dgb], { ...d,
    gewinnung: { ...d.gewinnung, originalDatum: "2026-11-07T09:26:29Z" } }), /einstieg-ungueltig/);
  const r = full(radio, radioHtml).beleg;
  assert.throws(() => A.pruefeArtikelkontext([radio], { ...r,
    gewinnung: { ...r.gewinnung, kanonischDeklariert: r.gewinnung.kanonischDeklariert + "?fremd=1" } }), /artikelziel-abweichend/);
});

test("v3 erfindet bei widersprechendem RSS-Auszug keine bereinigte Quelle", () => {
  const doc = { ...dgb, summary: "Die Tarifrunde wurde nach Angaben des RSS-Auszuges mit einer Einigung abgeschlossen." };
  const before = structuredClone(doc), result = full(doc, dgbHtml);
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.beleg.text, full(dgb, dgbHtml).beleg.text);
  assert.equal(result.beleg.quellenHash, A.quellenstandHash(doc));
  assert.notEqual(result.beleg.quellenHash, A.quellenstandHash(dgb));
  assert.deepEqual(doc, before);
  assert.throws(() => A.pruefeArtikelkontext([dgb], result.beleg), /quellenstand-abweichend/);
});

test("v3 verweigert fehlende oder uebersprungene Absaetze und Ueberschriften sowie Text-Hashdrift", () => {
  const f = synthetischerArtikel(["Erster Absatz mit dem Beschluss.", "Zweiter Absatz mit einer Einschraenkung.",
    "Dritter Absatz zur Finanzierung.", "Vierter Absatz zur Umsetzung.", "Fuenfter Absatz mit dem Vorbehalt.",
    "Sechster Absatz mit dem Schluss."], ["Bedingung", "Mittel", "Verfahren", "Vorbehalt", "Abschluss"]);
  const result = full(f.doc, f.html); assert.equal(result.ok, true, result.reason);
  for (const changed of [f.html.replace('<p>Zweiter Absatz mit einer Einschraenkung.</p>', ""),
    f.html.replace('<p>Sechster Absatz mit dem Schluss.</p>', ""), f.html.replace('<h2>Vorbehalt</h2>', "")]) {
    assert.notEqual(changed, f.html); assert.equal(full(f.doc, changed).ok, false);
  }
  for (const mutate of [b => { b.gewinnung.absaetze.splice(1, 1); },
    b => { b.gewinnung.zwischenTexte[3] = ""; },
    b => { b.gewinnung.artikelAbsatzZahl++; },
    b => { b.gewinnung.artikelTextHash = "0".repeat(64); },
    b => { b.gewinnung.antwortHash = "kein-hash"; },
    b => { b.gewinnung.absaetze.pop(); b.gewinnung.zwischenTexte.pop();
      b.text = A.einstiegText(b.gewinnung.absaetze, b.gewinnung.zwischenTexte); b.textHash = sha256(b.text); }]) {
    const b = structuredClone(result.beleg); mutate(b);
    assert.throws(() => A.pruefeArtikelkontext([f.doc], b), /artikelkontext-/);
  }
});

test("v3 behaelt native Robots- und Max-Snippet-Sperren", () => {
  for (const [doc, original] of [[dgb, dgbHtml], [radio, radioHtml]]) {
    for (const name of ["robots", "helmutbot"]) for (const content of ["noai", "noindex", "nosnippet", "max-snippet:0"]) {
      const result = full(doc, original.replace('</head>', `<meta name="${name}" content="${content}"></head>`));
      assert.equal(result.ok, false); assert.equal(result.beleg, undefined);
    }
  }
});

console.log(`${passed}/${passed} Artikel-Einstieg-Quellenbindungsgruppen bestanden`);
