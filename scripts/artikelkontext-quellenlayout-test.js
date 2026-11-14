"use strict";

// Nur neue Layout-/Folgecachefaelle. Synthetische Seitenstruktur, keine echten
// Originaltexte im Git, kein Netz, Modell oder Produktionsspeicher.
const T = require("node:assert/strict");
if (process.argv.length !== 2) throw Error("Unbekannte Testauswahl");
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
  const breg = kind === "breg", title = "Synthetische Beratung zur Tarifbindung";
  const url = breg ? "https://www.bundesregierung.de/breg-de/aktuelles/synthetische-beratung-1234567"
    : "https://www.deutschlandfunk.de/synthetische-beratung-zur-tarifbindung-100.html";
  return { id: "rd-synthetisches-layout-" + kind, title: breg ? title : "Synthetische Meldung - " + title + " - Deutschlandfunk",
    summary: null, url, canonical_url: url.replace("www.", ""), source_name: breg ? "Bundesregierung" : "Deutschlandfunk",
    published_at: "2026-11-13T08:00:00+00:00", retrieved_at: "2026-11-14T03:00:00+00:00", link_type: "direct" };
}
function response(kind, d = document(kind)) {
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
const opts = { versuch: true, kontext: "einstieg" };
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
let count = 0; async function test(name, fn) { await fn(); count++; console.log("PASS " + name); }
(async () => {
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
  await test("Nur bestaetigter Layoutnegativbeleg oeffnet genau eine globale Folgerevision am nativen CAS", async () => {
    for (const kind of ["breg", "dlf"]) {
      const f = environment(kind), before = clone(f.oldData), out = await f.run(), follow = S.bereiteQuellenlayoutFolge(f.old, before, opts);
      T.equal(out.ok, true); T.notEqual(follow.key, f.old.key); T.deepEqual(f.rows.get(f.rowId(f.old.key)), before);
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
    const lost = environment(), next = S.bereiteQuellenlayoutFolge(lost.old, lost.oldData, opts);
    lost.failRead((id, rows) => id === lost.rowId(next.key) && rows.has(id));
    T.equal((await lost.run()).reason, "reservierung-nicht-bestaetigt"); T.equal(lost.net.length, 0);
    lost.failRead(null); T.equal((await lost.run()).reason, "abruf-ausgang-offen"); T.equal(lost.net.length, 0);
    for (const mode of ["lostInsert", "lostFinish"]) { const a = environment(); a[mode](); T.equal((await a.run()).ok, true);
      T.equal((await a.run()).ok, true); T.equal(a.net.length, 1); }
  });
  await test("Originalquota Anbieter und Hostgrenzen bleiben vor dem Abruf und unveraenderte Altbelege erhalten", async () => {
    const quota = environment(); quota.quota(false); const follow = S.bereiteQuellenlayoutFolge(quota.old, quota.oldData, opts);
    T.equal((await quota.run()).reason, "original-tagesgrenze"); T.equal(quota.net.length, 0); T.equal(quota.rows.has(quota.rowId(follow.key)), false);
    T.deepEqual(quota.rows.get(quota.rowId(quota.old.key)), quota.oldData);
    const provider = environment(); T.equal((await provider.run({ env: { ...provider.deps.env, HELMUT_ANBIETER_STEUERUNG: "off" } })).reason, "anbietersteuerung-nicht-aktiv");
    T.equal(provider.net.length, 0); T.ok(provider.calls.every(c => c.method === "GET"));
    const host = environment(); T.equal((await host.run({ erlaubeNeuenAbruf: () => "herausgeber-nicht-freigegeben" })).reason, "herausgeber-nicht-freigegeben");
    T.equal(host.net.length, 0); T.ok(host.calls.every(c => c.method === "GET"));
  });
  T.equal(count, 9); T.deepEqual(forbidden, []);
  console.log("9/9 neue Quellenlayoutgruppen bestanden; keine alten Gruppen, Modelle oder Produktionszugriffe.");
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  for (const [name, value] of Object.entries(originals)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
});
