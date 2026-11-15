"use strict";

// Layout-, Provenienz- und Cachefaelle. Synthetische Seitenstruktur, keine echten
// Originaltexte im Git, kein Netz, Modell oder Produktionsspeicher.
const T = require("node:assert/strict");
const bmgOnly = process.argv.length === 3 && process.argv[2] === "--bmg";
const cacheOnly = process.argv.length === 3 && process.argv[2] === "--cache";
const bmasOnly = process.argv.length === 3 && process.argv[2] === "--bmas";
const zdfOnly = process.argv.length === 3 && process.argv[2] === "--zdf";
const presseOnly = process.argv.length === 3 && process.argv[2] === "--bmg-presse";
const adhocOnly = process.argv.length === 3 && process.argv[2] === "--adhoc";
if (process.argv.length !== 2 && !bmgOnly && !cacheOnly && !bmasOnly && !zdfOnly && !presseOnly && !adhocOnly) throw Error("Unbekannte Testauswahl");
const forbidden = [], fail = name => () => { forbidden.push(name); throw Error(name + " verboten"); };
global.fetch = fail("fetch"); require("node:https").request = fail("HTTPS"); require("node:http").request = fail("HTTP");
const G = require("../lib/helmut/artikelkontext-gewinnung"), A = require("../lib/helmut/artikelkontext"),
  B = require("../lib/helmut/artikelkontext-beschaffung"), S = require("../lib/helmut/artikelkontext-belegspeicher"),
  L = require("../lib/helmut/artikelkontext-quellenlayout");
const now = new Date("2026-11-14T12:00:00.000Z"), clone = structuredClone;
const originals = Object.fromEntries(["HELMUT_SOURCE_ALLOWLIST", "HELMUT_SOURCE_BLOCKLIST"].map(k => [k, process.env[k]]));
delete process.env.HELMUT_SOURCE_ALLOWLIST; delete process.env.HELMUT_SOURCE_BLOCKLIST;
const attribution = "Eine fiktive Pressestelle teilt zum synthetischen Beratungsvorhaben mit:",
  intro = "Der synthetische Bericht beschreibt eine Beratung zur Tarifbindung. Ein abschliessender Beschluss liegt noch nicht vor.",
  detail = "Die beteiligten Stellen beraten ueber moegliche Aenderungen. Der neue Vorschlag ist noch nicht beschlossen und ersetzt keine bestehende Regel.",
  correction = "Die fiktive Beratung wurde nicht abgesagt. Ueber den weiteren Zeitplan liegen in diesem Beispiel keine bestaetigten Angaben vor.";
function document(kind) {
  if (kind === "bmg-presse") return presseDocument();
  if (kind === "zdf") return zdfDocument();
  if (kind === "bmas") return bmasDocument();
  if (kind === "bmg") return bmgDocument();
  const breg = kind === "breg", title = "Synthetische Beratung zur Tarifbindung";
  const url = breg ? "https://www.bundesregierung.de/breg-de/aktuelles/synthetische-beratung-1234567"
    : "https://www.deutschlandfunk.de/synthetische-beratung-zur-tarifbindung-100.html";
  return { id: "rd-synthetisches-layout-" + kind, title: breg ? title : "Synthetische Meldung - " + title + " - Deutschlandfunk",
    summary: null, url, canonical_url: url.replace("www.", ""), source_name: breg ? "Bundesregierung" : "Deutschlandfunk",
    published_at: "2026-11-13T08:00:00+00:00", retrieved_at: "2026-11-14T03:00:00+00:00", link_type: "direct" };
}
function response(kind, d = document(kind)) {
  if (kind === "bmg-presse") return presseResponse(d);
  if (kind === "zdf") return zdfResponse(d);
  if (kind === "bmas") return bmasResponse(d);
  if (kind === "bmg") return bmgResponse(d);
  const breg = kind === "breg", title = "Synthetische Beratung zur Tarifbindung", og = breg ? title : "Synthetische Meldung - " + title;
  const head = `<head><link rel="canonical" href="${d.url}"><meta property="og:type" content="article">`
    + `<meta property="og:title" content="${og}"><meta property="og:url" content="${d.url}"></head>`;
  const body = breg ? `<div class="bpa-cookie-banner"><h1>Hinweis zum Datenschutz</h1><p>COOKIE NICHT LESEN</p></div>`
    + `<h1 class="bpa-accessibility">${title}</h1><main id="main"><div id="rs_reading_area_header">`
    + `<header class="bpa-article-header"><h2 class="bpa-topline-title-wrapper"><span>${title}</span></h2>`
    + `<div class="bpa-short-text"><p>${attribution}</p></div><div class="bpa-header-share"><p>TEILEN NICHT LESEN</p></div>`
    + `<ul class="bpa-collection-list"><li class="bpa-collection-item">Pressemitteilung 203</li><li class="bpa-collection-item">`
    + `<span class="bpa-time"><time datetime="2026-11-13T08:00:00Z">Freitag, 13. November 2026</time></span></li>`
    + `<li class="bpa-collection-item">Presse- und Informationsamt der Bundesregierung (BPA)</li></ul>`
    + `<div class="bpa-article-meta-infos"><p class="bpa-article-header-reading-time rs_skip">1 Min. Lesedauer</p>`
    + `<div class="bpa-readspeaker-wrapper"><p>VORLESEN NICHT LESEN</p></div></div></header></div>`
    + `<div id="rs_reading_area_content"><div class="bpa-article">`
    + `<div class="bpa-richtext"><div class="bpa-richtext"><p>${intro}<br/><br/>${detail}</p></div></div>`
    + `<div class="bpa-tools"><p>TEILEN NICHT LESEN</p></div></div></div></main>`
    : `<nav><article><p>NAVIGATION NICHT LESEN</p></article></nav><main class="main"><section><article class="b-article">`
    + `<header class="b-article-header"><h1 class="b-article-header-main"><span class="headline-kicker">Synthetische Meldung</span>`
    + `<br/><span class="headline-title">${title}</span></h1><p class="article-header-description">${intro}</p>`
    + `<span class="article-header-publication-date"><time datetime="2026-11-13T09:00:00+01:00">13.11.2026</time></span>`
    + `<div class="article-header-actions"><h1 class="podcast-actions-header">Podcast hoeren</h1><p>PODCAST NICHT LESEN</p></div></header>`
    + `<div class="article-content"><section class="b-article-details"><figure class="b-image-figure"><figcaption>BILDTEXT NICHT LESEN</figcaption></figure>`
    + `<div class="article-details-text">${detail}</div><h2 class="article-details-title">Noch kein Beschluss</h2>`
    + `<div class="article-details-text">${correction}</div><h2 class="article-details-title">Mehr zum Thema</h2>`
    + `<div class="article-details-text"><a href="https://www.deutschlandfunk.de/fremder-artikel-100.html">FREMDER ARTIKEL NICHT LESEN</a></div>`
    + `<div class="article-details-text u-text-italic">Diese Nachricht wurde am 13.11.2026 im Programm Deutschlandfunk gesendet.</div>`
    + `</section></div></article><article><p>TEASER NICHT LESEN</p></article></section></main>`;
  return { finalUrl: d.url, body: `<html>${head}<body>${body}<footer><p>FOOTER NICHT LESEN</p></footer></body></html>`, gelesenAm: now.toISOString() };
}
function bmgDocument() {
  const url = "https://www.bundesgesundheitsministerium.de/ministerium/meldungen/synthetische-beratung";
  return { id: "rd-synthetisches-layout-bmg", title: "Synthetische Beratung - Bundesministerium für Gesundheit (BMG)",
    source_name: "Bundesministerium für Gesundheit (BMG)", url, canonical_url: url.replace("www.", ""),
    published_at: "2026-11-13T08:00:00Z", summary: null, link_type: "direct" };
}
function bmgResponse(d = bmgDocument()) {
  return { finalUrl: d.url, gelesenAm: now.toISOString(), body: `<html><head>`
    + `<link rel="canonical" href="${d.url}"><meta property="og:type" content="article">`
    + `<meta property="og:title" content="Synthetische Beratung"><meta property="og:url" content="${d.url}"></head>`
    + `<body><nav><p>NAVIGATION NICHT LESEN</p></nav><main class="c-main" id="main">`
    + `<article class="c-article" id="article"><div class="article" itemscope="itemscope" itemtype="http://schema.org/Article">`
    + `<div class="c-page-title"><h1>Synthetische Beratung</h1><p>${intro}</p></div>`
    + `<div class="c-component c-component--page-date"><div><span>13. November 2026</span></div></div>`
    + `<figure><blockquote><p>ZITAT NICHT MITGEPRUEFT</p></blockquote><figcaption>Ungeprüfte Person</figcaption></figure>`
    + `<div class="c-text"><p>${correction}</p></div></div></article></main><footer><p>FOOTER NICHT LESEN</p></footer></body></html>` };
}
const opts = { versuch: true, kontext: "einstieg" };
function bmasDocument() {
  const url = "https://www.bmas.de/DE/Service/Presse/Pressemitteilungen/2026/synthetische-beratung.html";
  return { id: "rd-synthetisches-layout-bmas", title: "Synthetische Beratung", source_name: "BMAS",
    url, canonical_url: url.replace("www.", ""), published_at: "2026-11-03T10:07:00Z", summary: null, link_type: "direct" };
}
function bmasResponse(d = bmasDocument()) {
  return { finalUrl: d.url, gelesenAm: now.toISOString(), body: `<html><head>`
    + `<link rel="canonical" href="${d.url}"><meta property="og:type" content="website">`
    + `<meta property="og:title" content="BMAS - Synthetische Beratung"><meta property="og:url" content="${d.url}"></head>`
    + `<body><main class="relative"><article class="container"><time datetime="2026-11-03">03. November 2026</time>`
    + `<h1 data-slot="pp-headline">Synthetische Beratung</h1>`
    + `<div class="s-introduction"><div data-slot="pp-text"><p>${intro}</p></div></div>`
    + `<div class="body-text"><p>${correction}</p></div></article></main></body></html>` };
}
function zdfDocument() {
  const url = "https://www.zdfheute.de/politik/deutschland/synthetische-beratung-100.html";
  return { id: "rd-synthetisches-layout-zdf", title: "Synthetische Beratung - ZDFheute", source_name: "ZDFheute",
    url, canonical_url: url.replace("www.", ""), published_at: "2026-11-13T12:52:00Z", summary: null, link_type: "direct" };
}
function zdfResponse(d = zdfDocument()) {
  const declared = { "@type": "NewsArticle", mainEntityOfPage: d.url, headline: "Synthetische Beratung",
    description: intro, datePublished: "2026-11-13T13:52:45.131+01:00" };
  return { finalUrl: d.url, gelesenAm: now.toISOString(), body: `<html><head>`
    + `<link rel="canonical" href="${d.url}"><meta property="og:type" content="article">`
    + `<meta property="og:title" content="Synthetische Beratung"><meta property="og:url" content="${d.url}">`
    + `<script type="application/ld+json">${JSON.stringify(declared)}</script></head><body><div style="height:100%"><main>`
    + `<div class="c10o8fzf" style="--c10o8fzf-0:16px;--c10o8fzf-1:var(--vertical-content-padding) max(var(--horizontal-content-padding), env(safe-area-inset-left), env(safe-area-inset-right));--c10o8fzf-2:720px;--c10o8fzf-3:unset">`
    + `<div class="mz5q5zg" style="--mz5q5zg-0:space-between;--mz5q5zg-1:100%"><time datetime="2026-11-13T13:52:00.000+01:00">13.11.2026 | 13:52</time></div>`
    + `<p>${intro}</p></div><div><p>${correction}</p></div></main></div></body></html>` };
}
function adhocDocument() {
  const url = "https://www.ad-hoc-news.de/wirtschaft/synthetische-beratung/12345678";
  return { id: "rd-synthetisches-layout-adhoc", title: "Synthetische Beratung - ad-hoc-news.de", source_name: "ad-hoc-news.de",
    url, canonical_url: url.replace("www.", ""), published_at: "2026-11-13T12:52:23Z", summary: null, link_type: "direct" };
}
function adhocResponse(d = adhocDocument()) {
  const declared = { "@type": "NewsArticle", mainEntityOfPage: { "@type": "WebPage", "@id": d.url },
    headline: "Synthetische Beratung", description: intro, datePublished: "2026-11-13T13:52:23+01:00",
    dateModified: "2026-11-13T13:52:23+01:00", isAccessibleForFree: true,
    publisher: { "@type": "Organization", name: "ad-hoc-news.de", url: "https://www.ad-hoc-news.de" } };
  return { finalUrl: d.url, gelesenAm: now.toISOString(), body: `<html><head>`
    + `<link rel="canonical" href="${d.url}"><meta property="og:type" content="article">`
    + `<meta property="og:title" content="Synthetische Beratung"><meta property="og:url" content="${d.url}">`
    + `<meta name="robots" content="index, follow"><meta name="robots" content="max-image-preview:large">`
    + `<script type="application/ld+json">${JSON.stringify(declared)}</script></head><body><div style="position:absolute;top:0;width:100%;">`
    + `<div id="ip_page_wrapper"><div id="ip_content_wrapper"><div class="content_container" style="margin: 0;height:100%;">`
    + `<div id="wrapper"><div class="container" id="site_content"><div class="row news-section-container">`
    + `<div class="col-12 templateArticles_container bgWhite" id="article_container">`
    + `<div class="col-xs-12 col-sm-12 col-md-12 col-lg-12 templateArticles_content" id="article_content">`
    + `<div class="col-xs-12 col-sm-12 col-md-12 col-lg-12" id="left-box">`
    + `<article id="article" class="fulltext"><header><span class="keyword_box"><a href="/themen/Synthetisch">Synthetisch</a></span>`
    + `<h1 class="titel">Synthetische Beratung</h1><span class="date">Veröffentlicht am: 13.11.2026 um 13:52 Uhr | Redaktion boerse-global.de</span>`
    + `<div class="teaser">${intro}</div></header><div class="subtext"><p>${detail}</p><p>${correction}</p></div>`
    + `</article>${"</div>".repeat(10)}<footer><p>FOOTER NICHT MITGEPRUEFT</p></footer></body></html>` };
}
function presseDocument() {
  const d = bmgDocument(); d.id += "-presse";
  d.url = d.url.replace("ministerium/meldungen", "presse/pressemitteilungen"); d.canonical_url = d.url.replace("www.", "");
  return d;
}
function presseResponse(d = presseDocument()) {
  const r = bmgResponse(d);
  r.body = r.body.replace(`<p>${intro}</p>`, "").replace('<figure>',
    `<div class="c-download" data-module-identifier="download"><p>Faktenblatt als PDF herunterladen</p></div>`
    + `<div class="c-text-media__text"><p>${intro}</p></div><figure>`);
  return r;
}
const negative = key => ({ version: 1, schluessel: key, versuchId: "00000000-0000-4000-8000-000000000001",
  reserviertAm: "2026-11-14T04:15:00.000Z", zustand: "luecke", abgeschlossenAm: "2026-11-14T04:15:02.000Z", reason: L.NEGATIVGRUND });
function environment(kind = "breg") {
  const d = document(kind), old = S.bereiteArtikelkontextVor(d, opts), rows = new Map(), calls = [], net = [], limits = [],
    oldData = negative(old.key), rowId = key => "synthetisch-artikelkontext-" + key;
  rows.set(rowId(old.key), clone(oldData));
  let fault = null, loseInsert = false, loseFinish = false, quota = true;
  const speicher = S.erzeugeBelegspeicher({ storeId: "synthetisch", request: async (path, init = {}) => {
    const q = new URL(path, "https://local.invalid").searchParams, id = q.get("id")?.slice(3), method = init.method || "GET";
    calls.push({ method, id });
    if (method === "GET") { if (fault?.(id, rows)) throw Error("Lesung unklar"); return rows.has(id) ? [{ id, data: clone(rows.get(id)) }] : []; }
    if (method === "POST") {
      const row = JSON.parse(init.body); T.equal(rows.has(row.id), false); T.equal(init.headers.Prefer, "return=representation");
      rows.set(row.id, row.data); if (loseInsert) throw Error("POST Antwort verloren"); return [{ id: row.id }];
    }
    if (method === "DELETE") {
      T.deepEqual(rows.get(id), JSON.parse(q.get("data").slice(3))); rows.delete(id); return [{ id }];
    }
    T.equal(method, "PATCH"); T.equal(q.get("data->>zustand"), "eq.reserviert");
    T.equal(q.get("data->>versuchId"), "eq." + rows.get(id).versuchId);
    rows.set(id, JSON.parse(init.body).data); if (loseFinish) throw Error("PATCH Antwort verloren"); return [{ id }];
  } });
  const deps = { speicher, now: () => now, env: { HELMUT_ANBIETER_STEUERUNG: "on", HELMUT_QUELLEN_ARBEITSFENSTER: "on",
    HELMUT_QUELLEN_FENSTER_TAG: "8", HELMUT_QUELLEN_SEKUNDEN_TAG: "2400", HELMUT_ORIGINALABRUFE_TAG: "100" },
    erlaubeNeuenAbruf: () => null, originalReservierung: { reserviere: async arg => {
      limits.push(arg); return { verfuegbar: true, erlaubt: quota, grund: quota ? "reserviert" : "tagesgrenze" }; } },
    fetchUrl: async (url, retries, options) => { T.equal(url, d.url); T.equal(retries, 0); T.equal(options.artikelkontext, true);
      T.equal(options.allowedHost, new URL(d.url).hostname.replace(/^www\./, "")); net.push(url); return response(kind, d); } };
  return { d, old, rows, calls, net, limits, deps, rowId, oldData,
    run: extra => B.beschaffeArtikelkontext(d, opts, { ...deps, ...extra }),
    failRead: fn => { fault = fn; }, lostInsert: () => { loseInsert = true; }, lostFinish: () => { loseFinish = true; },
    quota: value => { quota = value; } };
}
let count = 0; async function test(name, fn) {
  if (bmgOnly && !name.startsWith("BMG ")) return;
  if (bmasOnly && !name.startsWith("BMAS ")) return;
  if (zdfOnly && !name.startsWith("ZDF ")) return;
  if (presseOnly && !name.startsWith("BMG-Presse ")) return;
  if (adhocOnly && !name.startsWith("Ad-hoc ")) return;
  if (cacheOnly && !/^(?:Frischer Basisstand|Reserviert kaputt|Alte positive|Unbekannte Folgelesung|Originalquota)/.test(name)) return;
  await fn(); count++; console.log("PASS " + name);
}
(async () => {
  await test("Ad-hoc bindet ausschliesslich den ganzen Headerteaser als Einstieg mit eigener Positionsbasis", () => {
    const d = adhocDocument(), r = adhocResponse(d), before = clone({ d, r });
    for (const read of [() => G.gewinneArtikelEinstieg(d, r), () => G.gewinneArtikeltext(d, r),
      () => G.gewinneArtikeltext(d, r, { abschnittsweise: true })]) {
      const out = read(); T.equal(out.ok, true, out.reason); T.equal(out.beleg.text, intro);
      T.equal(out.beleg.gewinnung.struktur, "adhoc"); T.equal(out.beleg.gewinnung.verfahren, "artikel-einstieg-v2");
      T.equal(out.beleg.gewinnung.positionsbasis, "html-article-header-teaser"); T.equal(out.beleg.gewinnung.artikelAbsatzZahl, 1);
      T.equal(out.beleg.gewinnung.redaktion, "boerse-global.de"); T.equal(out.beleg.gewinnung.originalDatum, "2026-11-13T13:52:23+01:00");
      T.equal(out.beleg.gewinnung.antwortHash, require("node:crypto").createHash("sha256").update(r.body).digest("hex"));
      T.deepEqual(out.beleg.gewinnung.absaetze, [intro]); T.deepEqual(A.pruefeArtikelkontext([d], out.beleg), out.beleg);
      T.equal(Object.hasOwn(out.beleg.gewinnung, "abschnitte"), false);
    }
    T.deepEqual({ d, r }, before);
  });
  await test("Ad-hoc bindet Ziel Titel und Originalsekunde ohne allgemeine URL oder Zeitlockerung", () => {
    for (const change of [r => { r.finalUrl += "?neu=1"; },
      r => { r.body = r.body.replace('rel="canonical"', 'rel="alternate"'); },
      r => { r.body = r.body.replace('property="og:url" content="' + r.finalUrl, 'property="og:url" content="https://evil.example/fremd'); },
      r => { r.body = r.body.replace('"@id":"' + r.finalUrl, '"@id":"https://evil.example/fremd'); },
      r => { r.body = r.body.replace('property="og:title" content="Synthetische Beratung"', 'property="og:title" content="Fremder Titel"'); },
      r => { r.body = r.body.replace('"headline":"Synthetische Beratung"', '"headline":"Fremder Titel"'); },
      r => { r.body = r.body.replace('<h1 class="titel">Synthetische Beratung', '<h1 class="titel">Fremder Titel'); },
      r => { r.body = r.body.replace('"datePublished":"2026-11-13T13:52:23+01:00"', '"datePublished":"2026-11-13T13:52:24+01:00"'); },
      r => { r.body = r.body.replace('"dateModified":"2026-11-13T13:52:23+01:00"', '"dateModified":"2026-11-14T13:52:23+01:00"'); },
      r => { r.body = r.body.replace('Veröffentlicht am: 13.11.', 'Veröffentlicht am: 14.11.'); },
      r => { r.body = r.body.replace(' um 13:52 ', ' um 13:53 '); }]) {
      const r = adhocResponse(); change(r); T.equal(G.gewinneArtikeltext(adhocDocument(), r).ok, false);
    }
    const d = adhocDocument(); d.published_at = "2026-11-13T12:52:24Z";
    T.equal(G.gewinneArtikeltext(d, adhocResponse()).ok, false);
    for (const url of [d.url.replace("ad-hoc-news.de", "evil.example"), d.url.replace("/wirtschaft/", "/politik/"),
      d.url + "?neu=1", d.url + "#teaser", d.url.replace("/12345678", "/123456789")]) T.equal(L.kennung(url), null);
  });
  await test("Ad-hoc versteckte gestylte abweichende und mehrdeutige Teaser oder Artikel bleiben gesperrt", () => {
    for (const change of [r => { r.body = r.body.replace('<article ', '<article hidden '); },
      r => { r.body = r.body.replace('position:absolute;top:0;width:100%;', 'position:absolute;top:0;width:100%;display:none;'); },
      r => { r.body = r.body.replace('class="content_container"', 'class="unbekannter_container"'); },
      r => { r.body = r.body.replace('margin: 0;height:100%;', 'margin: 0;height:100%;visibility:hidden;'); },
      r => { r.body = r.body.replace('margin: 0;height:100%;', 'margin: 0;height:100%;opacity:0;'); },
      r => { r.body = r.body.replace('margin: 0;height:100%;', 'margin: 0;height:100%;color:black;'); },
      r => { r.body = r.body.replace('id="ip_page_wrapper"', 'id="anderer_wrapper"'); },
      r => { r.body = r.body.replace('id="left-box"', 'id="left-box" style="margin: 0;height:100%;"'); },
      r => { r.body = r.body.replace('<header>', '<header aria-hidden="true">'); },
      r => { r.body = r.body.replace('id="left-box"', 'id="left-box" style="display:none"'); },
      r => { r.body = r.body.replace('class="teaser"', 'class="teaser" style="color:black"'); },
      r => { r.body = r.body.replace('class="teaser"', 'class="teaser" hidden'); },
      r => { r.body = r.body.replace('class="teaser"', 'class="teaser hidden-xs"'); },
      r => { r.body = r.body.replace('class="date"', 'class="date" hidden'); },
      r => { r.body = r.body.replace('class="titel"', 'class="titel" hidden'); },
      r => { r.body = r.body.replace('<div class="teaser">' + intro, '<div class="teaser"><span hidden>' + intro + '</span>'); },
      r => { r.body = r.body.replace('<div class="teaser">' + intro, '<div class="teaser">' + correction); },
      r => { r.body = r.body.replace('<div class="teaser">', '<div class="teaser"><p>'); },
      r => { r.body = r.body.replace('</header>', '<div class="teaser">' + intro + '</div></header>'); },
      r => { r.body = r.body.replace('</header>', '</header><header></header>'); },
      r => { r.body = r.body.replace('</article>', '</article><article id="article" class="fulltext"></article>'); },
      r => { r.body = r.body.replace('</h1>', '</h1><p>Frueher Gegenbeleg.</p>'); },
      r => { r.body = r.body.replace('<header>', '<p>Frueher Gegenbeleg.</p><header>'); },
      r => { r.body = r.body.replace('</head>', '<script type="application/ld+json">{"@type":"Article","headline":"Fremd"}</script></head>'); },
      r => { r.body = r.body.replace('<header>', '<header itemscope itemtype="https://schema.org/Article">'); },
      r => { r.body = r.body.replace('"description":', '"articleBody":"Fremder Artikeltext","description":'); }]) {
      const r = adhocResponse(); change(r); T.equal(G.gewinneArtikeltext(adhocDocument(), r).ok, false);
    }
  });
  await test("Ad-hoc Robots Sperren und abweichende Redaktion oder Herausgeber bleiben gesperrt", () => {
    for (const directive of ["noai", "nosnippet", "noindex", "max-snippet:0"]) {
      const r = adhocResponse(); r.body = r.body.replace('</head>', `<meta name="robots" content="${directive}"></head>`);
      T.equal(G.gewinneArtikeltext(adhocDocument(), r).ok, false);
    }
    for (const change of [r => { r.body = r.body.replace('Redaktion boerse-global.de', 'Redaktion Fremd'); },
      r => { r.body = r.body.replace('"name":"ad-hoc-news.de"', '"name":"Fremd"'); },
      r => { r.body = r.body.replace('"url":"https://www.ad-hoc-news.de"', '"url":"https://evil.example"'); },
      r => { r.body = r.body.replace('"isAccessibleForFree":true', '"isAccessibleForFree":false'); }]) {
      const r = adhocResponse(); change(r); T.equal(G.gewinneArtikeltext(adhocDocument(), r).ok, false);
    }
    const d = adhocDocument(); d.source_name = "Fremd"; T.equal(G.gewinneArtikeltext(d, adhocResponse()).ok, false);
  });
  await test("Ad-hoc Provenienz erlaubt keinen Volltext fremde Basis Zaehler Redaktion oder Datumsnachweis", () => {
    const d = adhocDocument(), good = G.gewinneArtikeltext(d, adhocResponse()).beleg;
    for (const change of [b => { b.gewinnung.verfahren = "artikeltext-v3"; },
      b => { b.gewinnung.verfahren = "artikelabschnitte-v4"; }, b => { b.gewinnung.positionsbasis = "html-article-p"; },
      b => { b.gewinnung.artikelAbsatzZahl = 3; }, b => { b.gewinnung.redaktion = "ad-hoc-news.de"; },
      b => { b.gewinnung.originalDatum = "2026-11-13T12:52:24Z"; }, b => { b.gewinnung.datumsFeld = "datetime"; },
      b => { b.gewinnung.layoutVersion = 2; }, b => { b.gewinnung.kanonischDeklariert += "?fremd=1"; },
      b => { b.gewinnung.artikelTextHash = "0".repeat(64); }]) {
      const b = clone(good); change(b); T.throws(() => A.pruefeArtikelkontext([d], b), /artikelkontext-/);
    }
  });
  await test("BMG-Presse bindet ersten Textabschnitt statt PDF-Widget oder ungeprueftem Zitat", () => {
    const d = presseDocument(), r = presseResponse(d), before = clone({ d, r }), out = G.gewinneArtikeltext(d, r, { abschnittsweise: true });
    T.equal(out.ok, true, out.reason); T.equal(out.beleg.text, intro); T.equal(out.beleg.gewinnung.struktur, "bmg-presse");
    T.equal(out.beleg.gewinnung.verfahren, "artikel-einstieg-v2"); T.equal(out.beleg.gewinnung.positionsbasis, "html-content-p");
    T.equal(out.beleg.gewinnung.artikelAbsatzZahl, 1); T.deepEqual(A.pruefeArtikelkontext([d], out.beleg), out.beleg);
    T.deepEqual({ d, r }, before);
  });
  await test("BMG-Presse ueberspringt keine fruehe Aussage und liest keine versteckten oder ungebundenen Abschnitte", () => {
    for (const change of [r => { r.body = r.body.replace('data-module-identifier="download"', 'data-module-identifier="anderes"'); },
      r => { r.body = r.body.replace('<div class="c-text-media__text">', '<p>Abgesagt.</p><div class="c-text-media__text">'); },
      r => { r.body = r.body.replace('class="c-text-media__text"', 'hidden class="c-text-media__text"'); },
      r => { r.body = r.body.replace('class="c-text-media__text"', 'class="c-text-media__text" style="display:none"'); },
      r => { r.body = r.body.replace('13. November', '14. November'); },
      r => { r.body = r.body.replace('rel="canonical"', 'rel="alternate"'); },
      r => { r.body = r.body.replace('<h1>Synthetische', '<h1>Fremde'); },
      r => { r.body = r.body.replace('<p>' + intro, '<p><span hidden>' + intro + '</span>'); }]) {
      const r = presseResponse(); change(r); T.equal(G.gewinneArtikeltext(presseDocument(), r).ok, false);
    }
  });
  await test("BMG-Presse Provenienz behauptet weder Volltext noch Artikelanfang oder fremdes Datum", () => {
    const d = presseDocument(), good = G.gewinneArtikeltext(d, presseResponse()).beleg;
    for (const change of [b => { b.gewinnung.verfahren = "artikeltext-v3"; },
      b => { b.gewinnung.originalDatum = "14. November 2026"; },
      b => { b.gewinnung.positionsbasis = "html-article-p"; }]) {
      const b = clone(good); change(b); T.throws(() => A.pruefeArtikelkontext([d], b), /artikelkontext-/);
    }
  });
  await test("BMG-Presse frischer Cache bestaetigt einmal und erhaelt vorhandene positive und negative Belege", async () => {
    const f = environment("bmg-presse"); f.rows.clear(); const out = await f.run(); T.equal(out.ok, true, out.reason);
    const before = clone([...f.rows]); T.deepEqual(await f.run(), out); T.deepEqual([...f.rows], before); T.equal(f.net.length, 1);
    const old = environment("bmg-presse"), snapshot = clone([...old.rows]); T.equal((await old.run()).ok, false);
    T.deepEqual([...old.rows], snapshot); T.equal(old.net.length, 0); T.equal(old.limits.length, 0);
  });
  await test("ZDF bindet sichtbare Minute und identischen ersten Originalabsatz ohne Volltextbehauptung", () => {
    const d = zdfDocument(), r = zdfResponse(d), before = clone({ d, r }), out = G.gewinneArtikeltext(d, r, { abschnittsweise: true });
    T.equal(out.ok, true, out.reason); T.equal(out.beleg.text, intro);
    T.equal(out.beleg.gewinnung.struktur, "zdf"); T.equal(out.beleg.gewinnung.verfahren, "artikel-einstieg-v2");
    T.equal(out.beleg.gewinnung.originalDatum, "2026-11-13T13:52:00.000+01:00");
    T.equal(out.beleg.gewinnung.antwortHash, require("node:crypto").createHash("sha256").update(r.body).digest("hex"));
    T.deepEqual(out.beleg.gewinnung.absaetze, [intro]); T.equal(out.beleg.gewinnung.artikelAbsatzZahl, 2);
    T.deepEqual(A.pruefeArtikelkontext([d], out.beleg), out.beleg); T.deepEqual({ d, r }, before);
  });
  await test("ZDF Fremdtitel Gegenziel andere Minute nichtdeklarierte Erstabschnitte und versteckte Stile sperren", () => {
    for (const change of [r => { r.body = r.body.replace('content="Synthetische Beratung"', 'content="Fremder Titel"'); },
      r => { r.body = r.body.replace('"headline":"Synthetische Beratung"', '"headline":"Fremder Titel"'); },
      r => { r.body = r.body.replace('rel="canonical"', 'rel="alternate"'); },
      r => { r.body = r.body.replace('"mainEntityOfPage":"' + r.finalUrl, '"mainEntityOfPage":"https://evil.example/fremd'); },
      r => { r.body = r.body.replace('13:52:45.131', '13:53:45.131'); },
      r => { r.body = r.body.replace('13:52:00.000', '13:53:00.000'); },
      r => { r.body = r.body.replace('>13.11.2026 | 13:52', '>14.11.2026 | 13:52'); },
      r => { r.body = r.body.replace('<main>', '<main hidden>'); },
      r => { r.body = r.body.replace('height:100%', 'height:0'); },
      r => { r.body = r.body.replace('--c10o8fzf-2:720px', '--c10o8fzf-2:0px'); },
      r => { r.body = r.body.replace('--mz5q5zg-1:100%', '--mz5q5zg-1:0%'); },
      r => { r.body = r.body.replace('<p>' + intro, '<p style="display:none">' + intro); },
      r => { r.body = r.body.replace('<p>' + intro, '<p>Abgesagt.</p><p>' + intro); },
      r => { r.body = r.body.replace('"description":', '"articleBody":"Gegenbeleg", "description":'); },
      r => { r.body = r.body.replace('</head>', '<meta name="robots" content="nosnippet"></head>'); }]) {
      const r = zdfResponse(); change(r); T.equal(G.gewinneArtikeltext(zdfDocument(), r).ok, false);
    }
    for (const url of [zdfDocument().url.replace("www.zdfheute.de", "evil.example"), zdfDocument().url + "?neu=1"])
      T.equal(L.kennung(url), null);
  });
  await test("ZDF Provenienz erlaubt keinen Volltext fremde Minute oder Artikelpositionsbasis", () => {
    const d = zdfDocument(), good = G.gewinneArtikeltext(d, zdfResponse()).beleg;
    for (const change of [b => { b.gewinnung.verfahren = "artikeltext-v3"; },
      b => { b.gewinnung.originalDatum = "2026-11-13T13:53:00.000+01:00"; },
      b => { b.gewinnung.positionsbasis = "html-article-p"; }]) {
      const b = clone(good); change(b); T.throws(() => A.pruefeArtikelkontext([d], b), /artikelkontext-/);
    }
  });
  await test("ZDF frischer Cache bestaetigt einmal und erhaelt vorhandene positive und negative Belege", async () => {
    const f = environment("zdf"); f.rows.clear(); const out = await f.run(); T.equal(out.ok, true, out.reason);
    const before = clone([...f.rows]); T.deepEqual(await f.run(), out); T.deepEqual([...f.rows], before); T.equal(f.net.length, 1);
    const old = environment("zdf"), snapshot = clone([...old.rows]); T.equal((await old.run()).ok, false);
    T.deepEqual([...old.rows], snapshot); T.equal(old.net.length, 0); T.equal(old.limits.length, 0);
  });
  await test("BMAS bindet nur amtlichen Einleitungsabsatz Titelpraefix und sichtbaren Tag", () => {
    const d = bmasDocument(), r = bmasResponse(d), before = clone({ d, r });
    const out = G.gewinneArtikeltext(d, r, { abschnittsweise: true });
    T.equal(out.ok, true, out.reason); T.equal(out.beleg.text, intro);
    T.equal(out.beleg.gewinnung.struktur, "bmas"); T.equal(out.beleg.gewinnung.verfahren, "artikel-einstieg-v2");
    T.equal(out.beleg.gewinnung.originalDatum, "03. November 2026");
    T.equal(out.beleg.gewinnung.artikelAbsatzZahl, 2); T.deepEqual(out.beleg.gewinnung.absaetze, [intro]);
    T.deepEqual(A.pruefeArtikelkontext([d], out.beleg), out.beleg); T.deepEqual({ d, r }, before);
    const bmg = bmgDocument(); bmg.published_at = d.published_at;
    const page = bmgResponse(bmg); page.body = page.body.replace("13. November", "03. November");
    T.equal(G.gewinneArtikeltext(bmg, page).ok, true);
    page.body = page.body.replace("03. November", "3. November");
    T.equal(G.gewinneArtikeltext(bmg, page).ok, true);
  });
  await test("BMAS fremde Identitaet versteckte oder uebersprungene Texte und abweichende Tage sperren", () => {
    for (const change of [r => { r.body = r.body.replace('BMAS - Synthetische Beratung', 'Fremd - Synthetische Beratung'); },
      r => { r.body = r.body.replace('<h1 data-slot="pp-headline">Synthetische', '<h1 data-slot="pp-headline">Fremde'); },
      r => { r.body = r.body.replace('rel="canonical"', 'rel="alternate"'); },
      r => { r.body = r.body.replace('property="og:url"', 'property="fremd"'); },
      r => { r.body = r.body.replace('datetime="2026-11-03"', 'datetime="2026-11-04"'); },
      r => { r.body = r.body.replace('03. November', '04. November'); },
      r => { r.body = r.body.replace('<time ', '<time hidden '); },
      r => { r.body = r.body.replace('<article ', '<article hidden '); },
      r => { r.body = r.body.replace('class="s-introduction"', 'class="s-introduction" style="display:none"'); },
      r => { r.body = r.body.replace(intro, '<span hidden>' + intro + '</span>'); },
      r => { r.body = r.body.replace('<h1 ', '<p>Abgesagt.</p><h1 '); },
      r => { r.body = r.body.replace('</time>', '</time><time datetime="2026-11-03">03. November 2026</time>'); },
      r => { r.body = r.body.replace('</head>', '<meta name="robots" content="noai"></head>'); },
      r => { r.body = r.body.replace('</head>', '<script type="application/ld+json">{"@type":"Article","headline":"Fremd"}</script></head>'); }]) {
      const r = bmasResponse(); change(r); T.equal(G.gewinneArtikeltext(bmasDocument(), r).ok, false);
    }
    for (const url of [bmasDocument().url.replace("www.bmas.de", "evil.example"), bmasDocument().url + "?neu=1"])
      T.equal(L.kennung(url), null);
  });
  await test("BMAS Provenienz erlaubt keinen Volltext fremden Tag oder Positionsbasis", () => {
    const d = bmasDocument(), good = G.gewinneArtikeltext(d, bmasResponse()).beleg;
    for (const change of [b => { b.gewinnung.verfahren = "artikeltext-v3"; },
      b => { b.gewinnung.originalDatum = "04. November 2026"; }, b => { b.gewinnung.layoutVersion = 2; },
      b => { b.gewinnung.positionsbasis = "html-main-p"; }]) {
      const b = clone(good); change(b); T.throws(() => A.pruefeArtikelkontext([d], b), /artikelkontext-/);
    }
  });
  await test("BMAS frischer Cache bestaetigt einmal und erhaelt vorhandene positive und negative Belege", async () => {
    const f = environment("bmas"); f.rows.clear(); const out = await f.run(); T.equal(out.ok, true, out.reason);
    const before = clone([...f.rows]); T.deepEqual(await f.run(), out); T.deepEqual([...f.rows], before); T.equal(f.net.length, 1);
    const old = environment("bmas"), snapshot = clone([...old.rows]); T.equal((await old.run()).ok, false);
    T.deepEqual([...old.rows], snapshot); T.equal(old.net.length, 0); T.equal(old.limits.length, 0);
  });
  await test("BMG ohne JSON-LD bestaetigt nur den ersten ganzen Absatz und den sichtbaren Tag", () => {
    const d = bmgDocument(), r = bmgResponse(d), before = clone({ d, r });
    for (const options of [{}, { abschnittsweise: true }]) {
      const out = G.gewinneArtikeltext(d, r, options);
      T.equal(out.ok, true, out.reason); T.equal(out.beleg.text, intro);
      T.equal(out.beleg.gewinnung.verfahren, "artikel-einstieg-v2");
      T.equal(out.beleg.gewinnung.struktur, "bmg"); T.equal(out.beleg.gewinnung.positionsbasis, "html-article-p");
      T.equal(out.beleg.gewinnung.originalDatum, "13. November 2026");
      T.equal(out.beleg.gewinnung.artikelAbsatzZahl, 3); T.deepEqual(out.beleg.gewinnung.absaetze, [intro]);
      T.equal(out.beleg.quellenHash, A.quellenstandHash(d)); T.deepEqual(A.pruefeArtikelkontext([d], out.beleg), out.beleg);
      T.equal(out.beleg.text.includes(correction), false); T.equal(out.beleg.text.includes("NICHT"), false);
    }
    T.deepEqual({ d, r }, before);
  });
  await test("BMG Gegenquellen doppelte Datumsfelder unsichtbare Einleitungen und Gegenbelege im Vorspann bleiben gesperrt", () => {
    const changes = [
      r => { r.finalUrl = r.finalUrl.replace("ministerium/meldungen", "ministerium/anderes"); },
      r => { r.body = r.body.replace('rel="canonical"', 'rel="alternate"'); },
      r => { r.body = r.body.replace('property="og:url"', 'property="other"'); },
      r => { r.body = r.body.replace('property="og:title" content="Synthetische Beratung"', 'property="og:title" content="Fremder Titel"'); },
      r => { r.body = r.body.replace('<h1>Synthetische Beratung', '<h1>Fremder Titel'); },
      r => { r.body = r.body.replace('13. November 2026', '14. November 2026'); },
      r => { r.body = r.body.replace('</span>', '</span><span>13. November 2026</span>'); },
      r => { r.body = r.body.replace('<main class=', '<main hidden class='); },
      r => { r.body = r.body.replace('<article class=', '<article hidden class='); },
      r => { r.body = r.body.replace('<div class="c-page-title">', '<div hidden class="c-page-title">'); },
      r => { r.body = r.body.replace('<span>13.', '<span hidden>13.'); },
      r => { r.body = r.body.replace('<p>' + intro, '<p style="display:none">' + intro); },
      r => { r.body = r.body.replace(intro, '<span hidden>' + intro + '</span>'); },
      r => { r.body = r.body.replace('</h1>', '</h1><p>Ein Gegenbeleg darf nicht uebergangen werden.</p>'); },
      r => { r.body = r.body.replace('<div class="c-page-title">', '<p>Frueher Gegenbeleg.</p><div class="c-page-title">'); },
      r => { r.body = r.body.replace('</article>', '</article><article class="c-article" id="article"></article>'); },
      r => { r.body = r.body.replace('</head>', '<meta name="robots" content="nosnippet"></head>'); },
      r => { r.body = r.body.replace('</head>', '<script type="application/ld+json">{"@type":"Article","headline":"Fremd"}</script></head>'); }
    ];
    for (const change of changes) {
      const r = bmgResponse(); change(r); T.equal(G.gewinneArtikeltext(bmgDocument(), r).ok, false);
    }
  });
  await test("BMG Provenienz erlaubt weder Volltextbehauptung noch fremden Tag Host oder Layoutversion", () => {
    const d = bmgDocument(), good = G.gewinneArtikeltext(d, bmgResponse()).beleg;
    for (const change of [b => { b.gewinnung.verfahren = "artikeltext-v3"; },
      b => { b.gewinnung.originalDatum = "14. November 2026"; },
      b => { b.gewinnung.layoutVersion = 2; }, b => { b.gewinnung.datumsFeld = "datetime"; },
      b => { b.gewinnung.positionsbasis = "html-article-div"; }]) {
      const b = clone(good); change(b); T.throws(() => A.pruefeArtikelkontext([d], b), /artikelkontext-/);
    }
    for (const url of [d.url.replace("www.bundesgesundheitsministerium.de", "evil.example"), d.url + "?fremd=1"]) {
      T.equal(L.kennung(url), null);
    }
  });
  await test("BMG frischer Stand wird einmal gebunden; positive Negative und UNKNOWN werden nicht neu abgerufen", async () => {
    const fresh = environment("bmg"); fresh.rows.clear();
    const out = await fresh.run(); T.equal(out.ok, true, out.reason);
    T.equal(out.beleg.gewinnung.verfahren, "artikel-einstieg-v2"); T.equal(fresh.net.length, 1);
    const before = clone([...fresh.rows]);
    T.deepEqual(await fresh.run(), out); T.deepEqual([...fresh.rows], before); T.equal(fresh.net.length, 1);
    const stored = await S.leseArtikelkontext(fresh.d, { speicher: fresh.deps.speicher });
    T.deepEqual(stored, out); T.deepEqual([...fresh.rows], before);
    for (const state of [null, "reserviert"]) {
      const old = environment("bmg"), row = clone(old.oldData);
      if (state) { delete row.reason; delete row.abgeschlossenAm; row.zustand = state; }
      old.rows.set(old.rowId(old.old.key), row);
      const original = clone([...old.rows]);
      T.equal((await old.run()).ok, false); T.deepEqual([...old.rows], original);
      T.equal(old.net.length, 0); T.equal(old.limits.length, 0); T.ok(old.calls.every(c => c.method === "GET"));
    }
    const quota = environment("bmg"); quota.rows.clear(); quota.quota(false);
    T.equal((await quota.run()).reason, "original-tagesgrenze"); T.equal(quota.net.length, 0); T.equal(quota.rows.size, 0);
  });
  await test("BReg bindet echte Mainstruktur Datum Titel und kompletten Inhalt ohne Cookie oder Bedienleisten", () => {
    const d = document("breg"), r = response("breg"), before = clone({ d, r }), out = G.gewinneArtikeltext(d, r, { abschnittsweise: true });
    T.equal(out.ok, true); T.equal(out.beleg.gewinnung.struktur, "breg"); T.equal(out.beleg.gewinnung.layoutVersion, 1);
    T.equal(out.beleg.gewinnung.positionsbasis, "html-main-p"); T.equal(out.beleg.text, [attribution, intro, detail].join(" "));
    T.equal(out.beleg.quellenHash, A.quellenstandHash(d)); T.deepEqual(A.pruefeArtikelkontext([d], out.beleg), out.beleg);
    T.deepEqual({ d, r }, before); T.equal(/NICHT LESEN/.test(out.beleg.text), false);
  });
  await test("DLF bindet Kicker und Feedtitel Originalsekunde Vorspann Gegenbeleg und Zwischenueberschrift statt Teaser", () => {
    const d = document("dlf"), out = G.gewinneArtikeltext(d, response("dlf"), { abschnittsweise: true });
    T.equal(out.ok, true); T.equal(out.beleg.gewinnung.struktur, "dlf"); T.equal(out.beleg.artikelTitel, d.title);
    T.equal(Date.parse(out.beleg.gewinnung.originalDatum), Date.parse(d.published_at));
    T.equal(out.beleg.text, [intro, detail, "Noch kein Beschluss", correction].join(" "));
    T.equal(/NICHT LESEN|Mehr zum Thema|Podcast|gesendet/.test(out.beleg.text), false);
    T.equal(out.beleg.gewinnung.verfahren, "artikeltext-v3"); T.deepEqual(A.pruefeArtikelkontext([d], out.beleg), out.beleg);
  });
  await test("Fremdes Ziel Originaldatum Titel doppelte Bereiche und unsichtbarer Haupttext bleiben gesperrt", () => {
    for (const kind of ["breg", "dlf"]) for (const change of [
      r => { r.finalUrl += "?fremd=1"; }, r => { r.body = r.body.replace('rel="canonical"', 'rel="alternate"'); },
      r => { r.body = r.body.replace('property="og:url"', 'property="fremd"'); },
      r => { r.body = r.body.replace('property="og:title" content="', 'property="og:title" content="FREMD '); },
      r => { r.body = r.body.replace(/datetime="[^"]+"/, 'datetime="2026-11-13T08:00:01Z"'); },
      r => { r.body = r.body.replace(/<main\b/, '<main hidden'); },
      r => { r.body = r.body.replace(/<time\b/, '<time hidden'); },
      r => { r.body = r.body.replace('</main>', '</main>' + (kind === "breg" ? '<main id="main"></main>' : '<main class="main"></main>')); },
      r => { r.body = r.body.replace(detail, '<span hidden>' + detail + '</span>'); },
      r => { r.body = r.body.replace(kind === "dlf" ? '<div class="article-details-text">' + correction : '<div class="bpa-richtext"><div',
        kind === "dlf" ? '<div hidden class="article-details-text">' + correction : '<div hidden class="bpa-richtext"><div'); },
      r => { r.body = r.body.replace(kind === "dlf" ? '<span class="article-header-publication-date">' : '<div class="bpa-header-share">',
        '<p>Dieser Gegenbeleg darf nicht verschwinden.</p>' + (kind === "dlf" ? '<span class="article-header-publication-date">' : '<div class="bpa-header-share">')); },
      r => { r.body = r.body.replace(kind === "dlf" ? '<time datetime=' : '<li class="bpa-collection-item">Pressemitteilung 203',
        (kind === "dlf" ? '<p>Dieser Gegenbeleg darf nicht verschwinden.</p><time datetime=' : '<li class="bpa-collection-item">Pressemitteilung 203 mit fremdem Gegenbeleg')); },
      r => { r.body = r.body.replace(kind === "dlf" ? '<section class="b-article-details">' : '<div class="bpa-article">',
        (kind === "dlf" ? '<section class="b-article-details">' : '<div class="bpa-article">') + '<p>Dieser Gegenbeleg darf nicht verschwinden.</p>'); },
      r => { r.body = r.body.replace(kind === "dlf" ? '<h2 class="article-details-title">Mehr zum Thema</h2>' : '<div class="bpa-tools">',
        '<p>Dieser Gegenbeleg darf nicht verschwinden.</p>' + (kind === "dlf" ? '<h2 class="article-details-title">Mehr zum Thema</h2>' : '<div class="bpa-tools">')); },
      r => { r.body = kind === "dlf" ? r.body.replace('<h2 class="article-details-title">Mehr zum Thema</h2>',
        '<h2 class="article-details-title">Mehr zum Thema</h2><p>Dieser Gegenbeleg darf nicht verschwinden.</p>')
        : r.body.replace('</div></div></main>', '</div><p>Dieser Gegenbeleg darf nicht verschwinden.</p></div></main>'); }
    ]) { const r = response(kind); change(r); T.equal(G.gewinneArtikeltext(document(kind), r).ok, false); }
    for (const before of [true, false]) {
      const r = response("dlf"), gegenbeleg = '<p>Dieser Gegenbeleg darf nicht verschwinden.</p>';
      r.body = before ? r.body.replace('<section class="b-article-details">', gegenbeleg + '<section class="b-article-details">')
        : r.body.replace('</section></div></article>', '</section>' + gegenbeleg + '</div></article>');
      T.equal(G.gewinneArtikeltext(document("dlf"), r).ok, false);
    }
    const zwischen = response("dlf");
    zwischen.body = zwischen.body.replace('<div class="article-content">', '<p>Dieser Gegenbeleg darf nicht verschwinden.</p><div class="article-content">');
    T.equal(G.gewinneArtikeltext(document("dlf"), zwischen).ok, false);
  });
  await test("Neue Provenienz akzeptiert weder beliebige Hosts Layoutversionen noch fremde Strukturdeklarationen", () => {
    const d = document("breg"), good = G.gewinneArtikeltext(d, response("breg")).beleg;
    for (const change of [b => { b.gewinnung.layoutVersion = 2; }, b => { b.gewinnung.originalDatum = "2026-11-13"; },
      b => { b.gewinnung.positionsbasis = "html-article-p"; }, b => { b.gewinnung.kanonischDeklariert += "/fremd"; }]) {
      const b = clone(good); change(b); T.throws(() => A.pruefeArtikelkontext([d], b), /artikelkontext-/);
    }
    for (const kind of ["breg", "dlf"]) {
      const r = response(kind); r.body = r.body.replace('</head>', '<script type="application/ld+json">{"@type":"Article","headline":"Fremd"}</script></head>');
      T.equal(G.gewinneArtikeltext(document(kind), r).ok, false);
      const robots = response(kind); robots.body = robots.body.replace('</head>', '<meta name="robots" content="noai"></head>');
      T.equal(G.gewinneArtikeltext(document(kind), robots).ok, false);
    }
  });
  await test("Frischer Basisstand wird einmal gespeichert; ein alter Layoutnegativbeleg bleibt ohne zweiten Abruf erhalten", async () => {
    for (const kind of ["breg", "dlf"]) {
      const old = environment(kind), before = clone([...old.rows]);
      T.equal((await old.run()).reason, "quellenlayout-folge-fehlt"); T.deepEqual([...old.rows], before);
      T.equal(old.net.length, 0); T.equal(old.limits.length, 0); T.ok(old.calls.every(c => c.method === "GET"));
      const f = environment(kind); f.rows.clear(); const out = await f.run();
      T.equal(out.ok, true, out.reason);
      T.equal(f.net.length, 1); T.equal(f.calls.filter(c => c.method === "POST").length, 1);
      T.equal(f.calls.filter(c => c.method === "PATCH").length, 1); T.equal(f.limits.length, 1);
      T.equal(f.limits[0].schluessel, "quellenarbeit|originalabrufe"); T.equal(f.limits[0].grenzeTag, 100);
      T.deepEqual(await f.run(), out); T.equal(f.net.length, 1);
      const reads = f.calls.length, output = await S.leseArtikelkontext(f.d, { speicher: f.deps.speicher });
      T.deepEqual(output, out); T.ok(f.calls.slice(reads).every(c => c.method === "GET"));
    }
  });
  await test("Reserviert kaputt abwesend anderer Grund oder Host erzeugen keinen Revisionsescape", async () => {
    for (const change of [s => { delete s.abgeschlossenAm; delete s.reason; s.zustand = "reserviert"; },
      s => { s.reason = "http-status"; }, s => { s.reserviertAm = "kaputt"; }, s => { s.extra = true; }]) {
      const f = environment(), state = clone(f.oldData); change(state); f.rows.set(f.rowId(f.old.key), state);
      T.equal(S.bereiteQuellenlayoutFolge(f.old, state, opts), null); T.equal((await f.run()).ok, false);
      T.equal(f.net.length, 0); T.ok(f.calls.every(c => c.method === "GET"));
    }
    const f = environment(); T.equal(S.bereiteQuellenlayoutFolge(f.old, null, opts), null);
    const fremd = { ...f.d, url: "https://example.org/synthetische-beratung", canonical_url: "https://example.org/synthetische-beratung" },
      p = S.bereiteArtikelkontextVor(fremd, opts); T.equal(S.bereiteQuellenlayoutFolge(p, negative(p.key), opts), null);
    T.equal(S.bereiteQuellenlayoutFolge(f.old, f.oldData, {}), null);
  });
  await test("Alte positive v2 Belege bleiben vorrangig und eine negative Folgerevision erlaubt keinen zweiten Versuch", async () => {
    const f = environment(), out = G.gewinneArtikeltext(f.d, response("breg")), positive = { ...f.oldData, zustand: "belegt",
      reserviertAm: now.toISOString(), abgeschlossenAm: now.toISOString(), beleg: out.beleg };
    delete positive.reason; f.rows.set(f.rowId(f.old.key), positive);
    T.equal((await f.run()).ok, true); T.equal(f.net.length, 0); T.ok(f.calls.every(c => c.method === "GET"));
    const bad = environment(), follow = S.bereiteQuellenlayoutFolge(bad.old, bad.oldData, opts);
    bad.rows.set(bad.rowId(follow.key), { ...negative(follow.key), reason: "artikelende-ungebunden" });
    T.equal((await bad.run()).reason, "artikelende-ungebunden"); T.equal((await bad.run()).ok, false); T.equal(bad.net.length, 0);
  });
  await test("Unbekannte Folgelesung oder Reservierung blockiert IO; verlorene bestaetigte Antworten werden nur nachgelesen", async () => {
    const f = environment(), follow = S.bereiteQuellenlayoutFolge(f.old, f.oldData, opts);
    f.failRead(id => id === f.rowId(follow.key)); T.equal((await f.run()).reason, "belegstand-nicht-lesbar"); T.equal(f.net.length, 0);
    const lost = environment(); lost.rows.clear();
    lost.failRead((id, rows) => id === lost.rowId(lost.old.key) && rows.has(id));
    T.equal((await lost.run()).reason, "reservierung-nicht-bestaetigt"); T.equal(lost.net.length, 0);
    lost.failRead(null); T.equal((await lost.run()).reason, "abruf-ausgang-offen"); T.equal(lost.net.length, 0);
    for (const mode of ["lostInsert", "lostFinish"]) { const a = environment(); a.rows.clear(); a[mode](); T.equal((await a.run()).ok, true);
      T.equal((await a.run()).ok, true); T.equal(a.net.length, 1); }
  });
  await test("Originalquota Anbieter und Hostgrenzen bleiben vor dem Abruf und unveraenderte Altbelege erhalten", async () => {
    const quota = environment(); quota.rows.clear(); quota.quota(false);
    T.equal((await quota.run()).reason, "original-tagesgrenze"); T.equal(quota.net.length, 0); T.equal(quota.rows.size, 0);
    const provider = environment(); provider.rows.clear(); T.equal((await provider.run({ env: { ...provider.deps.env, HELMUT_ANBIETER_STEUERUNG: "off" } })).reason, "anbietersteuerung-nicht-aktiv");
    T.equal(provider.net.length, 0); T.ok(provider.calls.every(c => c.method === "GET"));
    const host = environment(); host.rows.clear(); T.equal((await host.run({ erlaubeNeuenAbruf: () => "herausgeber-nicht-freigegeben" })).reason, "herausgeber-nicht-freigegeben");
    T.equal(host.net.length, 0); T.ok(host.calls.every(c => c.method === "GET"));
  });
  T.equal(count, adhocOnly ? 5 : bmgOnly || bmasOnly || zdfOnly || presseOnly ? 4 : cacheOnly ? 5 : 30); T.deepEqual(forbidden, []);
  console.log(`${count}/${count} ausgefuehrte Quellenlayoutgruppen bestanden; keine Modelle oder Produktionszugriffe.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  for (const [name, value] of Object.entries(originals)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
});
