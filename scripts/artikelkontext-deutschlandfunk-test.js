"use strict";

// Ausschliesslich synthetische Deutschlandfunk-Seiten. Kein echter Artikeltext,
// kein Netz, kein Modell und keine Speicherung.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const A = require("../lib/helmut/artikelkontext");
const U = require("../lib/helmut/understanding");
const G = require("../lib/helmut/artikelkontext-gewinnung");
const hash = s => crypto.createHash("sha256").update(s).digest("hex");
const doc = { id: "rd-synthetisch-dlf", title: "Neustadt - Bahnkonferenz beschliesst neue Strecken",
  summary: "In Neustadt endet die Bahnkonferenz mit einem gemeinsamen Beschluss.",
  url: "https://www.deutschlandfunk.de/bahnkonferenz-neustadt-100.html",
  canonical_url: "https://deutschlandfunk.de/bahnkonferenz-neustadt-100.html",
  published_at: "2026-09-25T21:39:26.000Z", source_name: "Deutschlandfunk Politik" };
const kicker = "Neustadt";
const ueberschrift = "Bahnkonferenz beschliesst neue Strecken";
const lead = "Die Konferenz in Neustadt endete am Freitag mit einem gemeinsamen Beschluss. Neue Strecken sollen in den kommenden Jahren gemeinsam geplant werden.";
const sendehinweis = "Diese Nachricht wurde am 26.09.2026 im Programm Deutschlandfunk gesendet.";
const escape = s => s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
const absaetze = (leadText = lead, extra = "") =>
  `<div class="article-details-text u-space-bottom-xl">${leadText}</div>`
  + `<div class="article-details-text u-text-italic u-space-bottom-xl">${sendehinweis}</div>${extra}`;
function seite({ kopf = `<span class="b-headline article-header-kicker"><span class="headline-kicker">${kicker}</span></span>`
    + `<br /><span class="b-headline article-header-title"><span class="headline-title">${ueberschrift}</span></span>`,
  kopfExtra = "", meta = "", link = `<link id="page-url" rel="canonical" href="${doc.url}" />`,
  ogTitel = `${kicker} - ${ueberschrift}`, ogUrl = doc.url, ogTyp = "article",
  zeit = `<time dateTime="2026-09-25T23:39:26+02:00">25.09.2026</time>`, inhalt = absaetze() } = {}) {
  return `<html><head><meta property="og:type" content="${ogTyp}" />`
    + `<meta property="og:title" content="${escape(ogTitel)}" /><meta property="og:url" content="${escape(ogUrl)}" />`
    + link + meta + `</head><body><div class="site-wrapper"><main class="main">`
    + `<nav class="b-breadcrumbs"><ul><li class="breadcrumbs-item">Startseite</li></ul></nav>`
    + `<article class="b-article"><header class="b-article-header"><h1 class="b-article-header-main">${kopf}</h1>`
    + kopfExtra
    + `<p class="article-header-description">${escape(doc.summary)}</p>`
    + `<div class="article-header-meta"><span class="article-header-publication-date">${zeit}</span></div>`
    + `<div class="article-header-actions"><div style="display:none"><div class="b-podcast-actions">`
    + `<h1 class="podcast-actions-header">Podcast hoeren</h1><p>Podcast-Beschreibung.</p></div></div></div>`
    + `</header><div class="article-content"><section class="b-article-details">`
    + `<figure class="b-image-figure"><div class="image-wrapper"><img src="https://bilder.deutschlandfunk.de/x.jpg" /></div>`
    + `<figcaption class="caption-figure is-left">Bildbeschreibung ohne Artikelbezug.</figcaption></figure>`
    + inhalt + `</section></div></article>`
    + `<aside><article class="b-teaser"><div class="article-content"><section class="b-article-details">`
    + `<div class="article-details-text">Fremder Teasertext ohne Bezug zum Dokument.</div>`
    + `</section></div></article></aside>`
    + `</main></div></body></html>`;
}
// Antwort auf eine synthetische Seite. Kein Ueberladen von response mit einem
// String, damit nicht versehentlich die Standardseite geprueft wird.
const antwort = (over = {}) => ({ body: seite(over), finalUrl: doc.url, gelesenAm: "2026-09-26T00:30:00.000Z" });
const get = (r = antwort(), d = doc) => G.gewinneArtikelkontext(d, r);
function fail(r, reason = null, d = doc) {
  const got = get(r, d);
  assert.equal(got.ok, false, "unerwartet akzeptiert: " + got.reason);
  if (reason) assert.equal(got.reason, reason);
}
let count = 0;
function test(name, fn) { fn(); console.log("PASS " + name); count++; }

test("Eindeutiger DLF-Leitabsatz ohne JSON-LD, Herkunft ohne Titelwortevidenz", () => {
  const r = antwort(), before = structuredClone({ doc, r });
  const result = get(r); assert.equal(result.ok, true);
  const b = result.beleg;
  assert.equal(b.version, 2); assert.equal(b.herkunft, "strukturierter-originalartikel");
  assert.equal(b.text, lead); assert.equal(b.absatzPosition, 1);
  assert.equal(b.textHash, hash(lead)); assert.equal(b.artikelTitel, `${kicker} - ${ueberschrift}`);
  assert.equal(b.artikelUrl, doc.url); assert.equal(b.quellenHash, A.quellenstandHash(doc));
  assert.equal(b.gewinnung.verfahren, "deutschlandfunk-artikel-leitabsatz-v1");
  assert.equal(b.gewinnung.positionsbasis, "html-article-div");
  assert.equal(b.gewinnung.antwortHash, hash(r.body));
  assert.equal(b.gewinnung.artikelTextPosition, 0); assert.equal(b.gewinnung.kandidatZahl, 1);
  assert.equal(b.gewinnung.titelTreffer, 0); assert.equal(b.gewinnung.artikelAbsatzZahl, 2);
  assert.notEqual(b.text, sendehinweis);
  assert(U.buildUnderstandingPrompt({ documents: [doc] }, { artikelkontextVersuch: b }).includes(lead));
  assert.deepEqual(get(r), result); assert.deepEqual({ doc, r }, before);
});

test("Kanonische Adresse, og:url, og:title und vollstaendige H1 sind Pflicht", () => {
  for (const over of [
    { link: `<link rel="canonical" href="https://deutschlandfunk.de/fremder-bericht-100.html" />` },
    { ogUrl: "https://deutschlandfunk.de/fremder-bericht-100.html" },
    { ogTitel: "Neustadt - Fremde Ueberschrift" },
    { kopf: `<span class="b-headline article-header-kicker"><span class="headline-kicker">${kicker}</span></span>`
      + `<br /><span class="b-headline article-header-title"><span class="headline-title">Fremde Ueberschrift</span></span>` },
    { ogTyp: "website" }, { link: `<link rel="alternate" href="${doc.url}" />` }]) fail(antwort(over));
  fail({ ...antwort(), finalUrl: doc.url.replace("bahnkonferenz-neustadt", "anderer-bericht") });
  fail(antwort(), null, { ...doc, canonical_url: "https://deutschlandfunk.de/fremder-bericht-100.html" });
});

test("Nur die Deutschlandfunk-Adresse mit Ziffernendung erreicht den Sonderpfad", () => {
  for (const url of [doc.url.replace("www.deutschlandfunk.de", "evil.example"),
    doc.url.replace("-100.html", ".html"), doc.url.replace("-100.html", "-abc.html"),
    doc.url.replace("-100.html", "-100"), doc.url.replace("/bahnkonferenz", "/podcast/bahnkonferenz"),
    doc.url.replace("https://", "http://")]) {
    const d = { ...doc, url, canonical_url: url };
    const r = { ...antwort(), finalUrl: url, body: seite().replaceAll(doc.url, url) };
    assert.equal(get(r, d).ok, false, "akzeptiert: " + url);
  }
  const ohneWww = { ...doc, url: doc.canonical_url, canonical_url: doc.canonical_url };
  const r = { ...antwort(), finalUrl: ohneWww.url, body: seite().replaceAll(doc.url, ohneWww.url) };
  assert.equal(get(r, ohneWww).ok, true);
});

test("Sichtbarer Publikationszeitpunkt bindet an die Quelle, ohne sie umzuschreiben", () => {
  for (const over of [{ zeit: `<time dateTime="2026-09-25T22:39:26+02:00">25.09.2026</time>` },
    { zeit: `<time dateTime="2026-09-26T00:39:26+02:00">26.09.2026</time>` },
    { zeit: `<time>25.09.2026</time>` }, { zeit: `<span>25.09.2026</span>` },
    { zeit: `<time hidden dateTime="2026-09-25T23:39:26+02:00">25.09.2026</time>` },
    { zeit: `<time style="display:none" dateTime="2026-09-25T23:39:26+02:00">25.09.2026</time>` },
    { zeit: `<time dateTime="2026-09-25T23:39:26+02:00"></time>` },
    { zeit: `<time dateTime="2026-09-25T23:39:26+02:00">25.09.2026</time>`
      + `<time dateTime="2026-09-25T23:39:26+02:00">25.09.2026</time>` }]) fail(antwort(over));
  const d = structuredClone(doc);
  assert.equal(get(antwort(), d).ok, true);
  assert.equal(d.published_at, "2026-09-25T21:39:26.000Z");
  assert.equal(get(antwort(), { ...doc, published_at: null }).ok, false);
  assert.equal(get(antwort(), { ...doc, published_at: "2026-09-24T21:39:26.000Z" }).ok, false);
});

test("Mehrfache Hauptartikel, Ueberschriften, Metadaten oder Absatzbereiche sperren", () => {
  const kopfStandard = `<span class="b-headline article-header-kicker"><span class="headline-kicker">${kicker}</span></span>`
    + `<br /><span class="b-headline article-header-title"><span class="headline-title">${ueberschrift}</span></span>`;
  for (const over of [
    { kopfExtra: `<h1 class="b-article-header-main">${kopfStandard}</h1>` },
    { kopf: kopfStandard + `<span class="headline-title">${ueberschrift}</span>` },
    { kopf: kopfStandard + `<span class="headline-kicker">${kicker}</span>` },
    { meta: `<link rel="canonical" href="${doc.url}" />` },
    { meta: `<meta property="og:title" content="Neustadt - Bahnkonferenz beschliesst neue Strecken" />` },
    { meta: `<meta property="og:url" content="${doc.url}" />` },
    { inhalt: absaetze() + `<div class="article-content"><section class="b-article-details">`
      + `<div class="article-details-text">Weiterer Absatzbereich.</div></section></div>` }]) fail(antwort(over));
  const zweiterArtikel = seite().replace("</article>",
    `</article><article class="b-article"><div class="article-content"><section class="b-article-details">${absaetze()}</section></div></article>`);
  fail({ ...antwort(), body: zweiterArtikel });
  fail({ ...antwort(), body: seite().replace('<div class="article-content">',
    '<div class="article-content"><section class="b-article-details"><div class="article-details-text">Zweiter Bereich.</div></section>') });
});

test("Versteckte Vorfahren und versteckte Teiltexte werden nie zum Artikelbeleg", () => {
  for (const body of [
    seite().replace('<article class="b-article">', '<article hidden class="b-article">'),
    seite().replace('<article class="b-article">', '<div style="display:none"><article class="b-article">'),
    seite().replace('<section class="b-article-details">', '<section hidden class="b-article-details">'),
    seite().replace('<div class="article-content">', '<div style="display:none" class="article-content">'),
    seite().replace('<div class="article-content">', '<nav class="article-content">'),
    seite({ inhalt: absaetze(`<span aria-hidden="true">${lead}</span>`) }),
    seite({ inhalt: absaetze(`<span style="display:none">${lead}</span>`) }),
    seite({ inhalt: `<div hidden class="article-details-text">${lead}</div>${absaetze("", "")}` }),
    seite({ inhalt: `<aside><div class="article-details-text">${lead}</div></aside>${absaetze("", "")}` })]) {
    assert.equal(get({ ...antwort(), body }).ok, false);
  }
  fail({ ...antwort(), body: seite({ inhalt: absaetze(`${lead}<br />Weitere Zeile.`) }) });
  fail({ ...antwort(), body: seite({ inhalt: absaetze(`${lead}<p>Zweiter Block.</p>`) }) });
});

test("Kein spaeterer Rueckfall und keine Teilblock-Vereinigung beim ersten Absatz", () => {
  const kurz = "Von der Polizei gibt es bislang keine Zahlen.";
  const ersatz = `<div class="article-details-text">${lead}</div>`;
  for (const first of [kurz, "", doc.summary]) fail(antwort({ inhalt: absaetze(first, ersatz) }), "leitabsatz-nicht-nutzbar");
  fail(antwort({ inhalt: absaetze("x".repeat(601), ersatz) }), "absatz-zu-lang");
  assert.equal(get(antwort({ inhalt: absaetze("x".repeat(600)) })).beleg.text.length, 600);
  fail(antwort({ inhalt: `<div class="article-details-text u-text-italic">${sendehinweis}</div>${ersatz}` }),
    "leitabsatz-nicht-nutzbar");
});

test("Inline-Links und geschuetzte Leerzeichen bleiben Text, kein Zusammenziehen", () => {
  const mitLink = absaetze(lead.replace("gemeinsamen Beschluss.",
    `gemeinsamen Beschluss (<a href="https://www.deutschlandfunk.de/plan-108.html">21/123</a>).`)
    .replace("Neue Strecken", "<strong>Neue Strecken</strong>"));
  const b = get({ ...antwort(), body: seite({ inhalt: mitLink }) }).beleg;
  assert(!b.text.includes("<")); assert(b.text.includes("Neue Strecken")); assert(b.text.includes("(21/123)"));
  const geschuetzt = get(antwort({ inhalt: absaetze(lead.replace("Neue Strecken", "Neue Strecken&nbsp;und Wege")) })).beleg.text;
  assert(geschuetzt.includes("Neue Strecken und Wege"));
});

test("Herkunft bleibt streng versioniert und deckt keine fremde Adresse ab", () => {
  const b = get().beleg;
  for (const change of [{ absatzPosition: 2 }, { gewinnung: { ...b.gewinnung, kandidatZahl: 2 } },
    { gewinnung: { ...b.gewinnung, artikelTextPosition: 1 } },
    { gewinnung: { ...b.gewinnung, titelTreffer: 1 } },
    { gewinnung: { ...b.gewinnung, positionsbasis: "html-article-p" } },
    { gewinnung: { ...b.gewinnung, verfahren: "beliebig" } },
    { gewinnung: { ...b.gewinnung, verfahren: "bundestag-artikel-leitabsatz-v1" } },
    { gewinnung: { ...b.gewinnung, antwortHash: "falsch" } }]) {
    assert.throws(() => A.pruefeArtikelkontext([doc], { ...b, ...change }), /artikelkontext/);
  }
  const fremd = { ...doc, url: doc.url.replace("www.deutschlandfunk.de", "other.example"),
    canonical_url: doc.canonical_url.replace("deutschlandfunk.de", "other.example") };
  assert.throws(() => A.pruefeArtikelkontext([fremd], { ...b, artikelUrl: fremd.url,
    quellenHash: A.quellenstandHash(fremd) }), /artikelkontext/);
  const clean = A.pruefeArtikelkontext([doc], { ...b, html: "NICHT_UEBERNEHMEN",
    volltext: "NICHT_UEBERNEHMEN", gewinnung: { ...b.gewinnung, html: "NICHT_UEBERNEHMEN" } });
  assert(!JSON.stringify(clean).includes("NICHT_UEBERNEHMEN"));
});

test("Sichtbarer Kopf und Datum gehoeren zum selben Artikel und Inhaltsbereich", () => {
  const html = seite(), header = /<header class="b-article-header">[\s\S]*?<\/header>/.exec(html)[0];
  const cases = [
    ["versteckte H1", html.replace('<h1 class="b-article-header-main">', '<h1 hidden class="b-article-header-main">')],
    ["versteckter Titel", html.replace('<span class="headline-title">', '<span hidden class="headline-title">')],
    ["versteckter Titelvorfahr", html.replace('<span class="b-headline article-header-title">', '<span aria-hidden="TRUE" class="b-headline article-header-title">')],
    ["Kopf ausserhalb", html.replace(header, '').replace('<article class="b-article">', header + '<article class="b-article">')],
    ["Inhalt ausserhalb", html.replace('<div class="article-content"><section', '<div class="article-content"></div><section').replace('</section></div></article>', '</section></article>')],
    ["Widerspruch im Datum", html.replace('>25.09.2026</time>', '>24.09.2026, nicht 25.09.2026</time>')],
    ["verstecktes Datum", html.replace('>25.09.2026</time>', '><span hidden>25.09.2026</span></time>')],
    ["ARIA Datum", html.replace('<time dateTime=', '<time aria-hidden="TRUE" dateTime=')],
    ["Kopf im Fliesstext", seite({ inhalt: '<header>' + absaetze() + '</header>' })],
    ["verdeckter erster Absatz", seite({ inhalt: '<div hidden><div class="article-details-text">Abgesetzt.</div></div>' + absaetze() })]
  ];
  const akzeptiert = cases.filter(([, body]) => get({ ...antwort(), body }).ok).map(([name]) => name);
  assert.deepEqual(akzeptiert, []);
});

console.log(`PASS ${count} Gruppen zum Deutschlandfunk-Artikelkontext`);
