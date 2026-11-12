"use strict";
const assert = require("node:assert/strict");
const G = require("../lib/helmut/artikelkontext-gewinnung");
const A = require("../lib/helmut/artikelkontext");
const U = require("../lib/helmut/understanding");
const fs = require("node:fs"), path = require("node:path");
const doc = { id: "rd-synthetisch", title: "Neue Regeln zur Foerderung beraten",
  summary: "Der Bundestag hat einen neuen Entwurf beraten.",
  url: "https://www.bundestag.de/dokumente/textarchiv/2026/kw39-regeln-1234567",
  published_at: "2026-09-25T10:00:00.000Z", source_name: "Deutscher Bundestag" };
const lead = "Der Bundestag hat den Entwurf heute beraten. Zur weiteren Beratung wurde er dem Ausschuss fuer Arbeit und Soziales ueberwiesen.";
// Synthetischer langer Absatz; der echte 602-Zeichen-Fall wird separat am
// gesicherten Original-HTML geprueft, ohne den Nachrichtentext zu publizieren.
const longLead = lead.repeat(5) + " Der Innenausschuss legt einen Bericht vor. Ein weiterer Bericht des Haushaltsausschusses bleibt ebenfalls Teil dieses Absatzes.";
const block = (title = doc.title, body = `<p>${lead}</p>`) => `<article class="bt-artikel"><div><h1>${title}</h1></div><div class="bt-artikel__article"><div>${body}</div></div><aside><article><p>Fremde Rednertexte und Vorgangsdetails.</p></article></aside></article>`;
function responseFuer(d, body = block(d.title)) { return { finalUrl: d.url, gelesenAm: "2026-09-25T12:00:00.000Z",
  body: `<html><head><meta property="og:type" content="article"><meta name="date" content="25.09.2026"><meta property="og:url" content="${d.url}"><meta property="og:title" content="Deutscher Bundestag - ${d.title}"></head><body>${body}</body></html>` }; }
function response(body = block()) { return responseFuer(doc, body); }
let count = 0;
function test(name, fn) { fn(); console.log("PASS " + name); count++; }
const get = (r = response(), d = doc) => G.gewinneArtikelkontext(d, r);
const reject = (r, d = doc) => assert.equal(get(r, d).ok, false);
test("Eindeutiger amtlicher Leitabsatz ohne JSON-LD, keine erfundene Titelwortmenge", () => {
  const r = get(); assert.equal(r.ok, true); assert.equal(r.beleg.text, lead);
  assert.equal(r.beleg.gewinnung.verfahren, "bundestag-artikel-leitabsatz-v1");
  assert.equal(r.beleg.gewinnung.titelTreffer, 1); assert.equal(r.beleg.absatzPosition, 1);
  assert(U.buildUnderstandingPrompt({ documents: [doc] }, { artikelkontextVersuch: r.beleg }).includes(lead));
});
test("Fruehere Beratungen und verschachtelte Rednerartikel bleiben getrennt", () => {
  const r = get(response(block("Alte Beratung", "<p>VERALTETER_INHALT</p>") + block()));
  assert.equal(r.beleg.text, lead); assert(!JSON.stringify(r).includes("VERALTETER_INHALT"));
  reject(response(block() + block()));
  reject(response(block("Fremde Beratung")));
  reject(response(block().replace("</article>", "")));
});
test("Gleiches Dokumentziel, Ueberschrift und Datum sind Pflicht", () => {
  for (const change of [s => s.replace('property="og:url"', 'property="other"'),
    s => s.replace('content="article"', 'content="website"'),
    s => s.replace('content="25.09.2026"', 'content="24.09.2026"'),
    s => s.replace('Deutscher Bundestag - Neue', 'Fremdes Medium - Neue'),
    s => s.replace('</head>', '<link rel="canonical" href="https://www.bundestag.de/dokumente/textarchiv/2026/fremd-1234568"></head>'),
    s => s.replace('</head>', '<meta property="og:url" content="https://www.bundestag.de/fremd"></head>')]) {
    reject({ ...response(), body: change(response().body) });
  }
  reject({ ...response(), finalUrl: doc.url.replace("1234567", "1234568") });
  reject(response(), { ...doc, canonical_url: doc.url.replace("1234567", "1234568") });
  reject(response(), { ...doc, published_at: null });
});
test("Offizieller Sonderpfad gilt weder fuer fremde Hosts noch beliebige Bundestagsseiten", () => {
  for (const url of [doc.url.replace("www.bundestag.de", "evil.example"), doc.url.replace("/textarchiv/", "/other/")]) {
    const d = { ...doc, url }, r = response(); r.finalUrl = url; r.body = r.body.replaceAll(doc.url, url); reject(r, d);
  }
});
test("Versteckte Artikel, Vorfahren und Haupttexte ergeben keine nutzbare Meldung", () => {
  for (const body of [`<div hidden>${block()}</div>`, `<aside>${block()}</aside>`,
    block().replace('<article class=', '<article hidden class='),
    block().replace('<div class="bt-artikel__article">', '<div hidden class="bt-artikel__article">'),
    block().replace('<div class="bt-artikel__article">', '<div style="display:none"><div class="bt-artikel__article">'),
    block(doc.title, `<p hidden>${lead}</p>`), block(doc.title, `<p><span aria-hidden="true">${lead}</span></p>`)]) reject(response(body));
});
test("Kurze Hinweise, leere oder zu lange erste Absaetze werden nie uebersprungen", () => {
  for (const first of ["Abgesetzt.", "", "x".repeat(1201)]) reject(response(block(doc.title, `<p>${first}</p><p>${lead}</p>`)));
  assert.equal(get(response(block(doc.title, `<p>${"x".repeat(600)}</p>`))).beleg.text.length, 600);
  reject(response(block(doc.title, `<p>${doc.summary}</p><p>${lead}</p>`)));
});
test("Langer amtlicher Leitabsatz bleibt vollstaendig und behaelt beide Ausschussbelege", () => {
  assert(longLead.length > 600 && longLead.length <= 1200);
  const r = get(response(block(doc.title, `<p>${longLead}</p>`)));
  assert.equal(r.ok, true); assert.equal(r.beleg.text, longLead);
  assert(r.beleg.text.includes("Innenausschuss"));
  assert(r.beleg.text.includes("Haushaltsausschusses"));
  assert(U.buildUnderstandingPrompt({ documents: [doc] }, { artikelkontextVersuch: r.beleg }).includes(longLead));
});
test("1200 Zeichen gelten nur fuer den amtlichen Bundestags-Leitabsatz", () => {
  assert.equal(get(response(block(doc.title, `<p>${"x".repeat(1200)}</p><p>${lead}</p>`))).beleg.text.length, 1200);
  reject(response(block(doc.title, `<p>${"x".repeat(1201)}</p><p>${lead}</p>`)));
  const b = get().beleg;
  assert.equal(A.pruefeArtikelkontext([doc], { ...b, text: "x".repeat(601) }).text.length, 601);
  assert.throws(() => A.pruefeArtikelkontext([doc], { ...b, text: "x".repeat(1201) }), /artikelkontext-absatz-ungueltig/);
  assert.throws(() => A.pruefeArtikelkontext([doc], { ...b, text: "x".repeat(601),
    gewinnung: { ...b.gewinnung, verfahren: "artikel-absatz-titel-v1", titelTreffer: 2 } }),
  /artikelkontext-absatz-ungueltig/);
  assert.throws(() => A.pruefeArtikelkontext([doc], {
    version: 1, herkunft: "manueller-originalvergleich", dokumentId: doc.id,
    quellenHash: A.quellenstandHash(doc), artikelUrl: doc.url, artikelTitel: doc.title,
    gelesenAm: "2026-09-25T12:00:00.000Z", absatzPosition: 1, text: "x".repeat(601)
  }), /artikelkontext-absatz-ungueltig/);
});
test("Inline Woerter bleiben zusammen, nur exakter Bedienhinweis entfaellt", () => {
  const html = `<p>Der Bundestag hat neue <strong>Regeln</strong> beraten. Die Vorlage (<a><span class="a-link__label">21/123</span><span class="a-link__label --hidden">(Dokument, öffnet ein neues Fenster)</span></a>) wird weiter behandelt.</p>`;
  const text = get(response(block(doc.title, html))).beleg.text;
  assert(text.includes("neue Regeln beraten")); assert(text.includes("(21/123)")); assert(!text.includes("Fenster"));
  reject(response(block(doc.title, `<p>${lead}<br>Weitere Nachricht.</p>`)));
});
test("Titelkuerzung nur als exakter langer Metadatenpraefix bei vollstaendiger H1", () => {
  const title = "Ausfuehrliche Beratung ueber die langfristige Foerderung der gemeinsamen Einrichtungen";
  const d = { ...doc, title }, r = response(block(title));
  r.body = r.body.replace("Deutscher Bundestag - " + doc.title, "Deutscher Bundestag - " + title.slice(0, 55) + "...");
  assert.equal(get(r, d).ok, true);
  reject({ ...r, body: r.body.replace(title.slice(0, 55) + "...", "Fremder gekuerzter Titel...") }, d);
});
test("Herkunft kann keine spaetere Absatzwahl oder fremde Adresse verdecken", () => {
  const b = get().beleg;
  for (const change of [{ absatzPosition: 2 }, { gewinnung: { ...b.gewinnung, kandidatZahl: 2 } },
    { gewinnung: { ...b.gewinnung, artikelTextPosition: 1 } }, { gewinnung: { ...b.gewinnung, verfahren: "beliebig" } }])
    assert.throws(() => A.pruefeArtikelkontext([doc], { ...b, ...change }), /artikelkontext/);
  const d = { ...doc, url: doc.url.replace("www.bundestag.de", "other.example") };
  assert.throws(() => A.pruefeArtikelkontext([d], { ...b, artikelUrl: d.url, quellenHash: A.quellenstandHash(d) }), /artikelkontext/);
});
test("Datumsbindung verwendet Berliner Tag, aendert die Publikation nicht", () => {
  const d = { ...doc, published_at: "2026-09-24T22:30:00.000Z" };
  assert.equal(get(response(), d).ok, true); assert.equal(d.published_at, "2026-09-24T22:30:00.000Z");
});
const original = name => fs.readFileSync(path.join(__dirname, "fixtures", "artikelkontext-bundestag", name + ".html"), "utf8");
const hibDoc = { id: "rd-5ebb3904de4b580a6c5cfb25471fb26a0f3498f581fad4e1e31465e7577f26e4",
  title: 'AfD will BpB "perspektivisch" abwickeln', source_name: "Deutscher Bundestag",
  url: "https://www.bundestag.de/presse/hib/kurzmeldungen-1232952", published_at: "2026-11-11T17:08:00.000Z" };
const presseDoc = { id: "rd-58225d6ee7039a35026c741a65322d291feb73c9f8a6de988e5f48aa64a2c69f",
  title: "BILDTERMIN: Bundestagspräsidentin Julia Klöckner empfängt die stellvertretende Bundesvorsitzende des Zentralrates der Êzîden in Deutschland, Zemfira Dlovani",
  source_name: "Deutscher Bundestag", url: "https://www.bundestag.de/presse/pressemitteilungen/2026/pm-261104-bildtermin-511-1231160",
  published_at: "2026-11-04T12:56:22.000Z" };
const originalResponse = (d, body) => ({ finalUrl: d.url, body, gelesenAm: "2026-11-12T06:40:00.000Z" });
const full = (d, body) => G.gewinneArtikeltext(d, originalResponse(d, body), { abschnittsweise: true });
test("Echte hib-Meldung ohne Canonical/JSON-LD behaelt alle vier Absaetze und ihr Quelldatum", () => {
  const r = full(hibDoc, original("hib-20261111")); assert.equal(r.ok, true, r.reason);
  const b = r.beleg; assert.equal(b.gewinnung.verfahren, "artikeltext-v3");
  assert.equal(b.gewinnung.struktur, "bundestag"); assert.equal(b.gewinnung.originalDatum, "11.11.2026");
  assert.equal(b.gewinnung.absaetze.length, 4); assert.equal(b.gewinnung.artikelAbsatzZahl, 4);
  assert(b.text.includes("ersatzlos abwickeln")); assert(!b.text.includes("Dokument, öffnet"));
  assert.equal(A.pruefeArtikelkontext([hibDoc], b).text, b.text);
  assert.equal(hibDoc.published_at, "2026-11-11T17:08:00.000Z");
});
test("Echte Pressemitteilung behaelt Zeit, Ort und Zutrittshinweis vor und nach dem Meldungstext", () => {
  const r = full(presseDoc, original("presse-20261104")); assert.equal(r.ok, true, r.reason);
  assert(r.beleg.text.startsWith("Zeit: Donnerstag, 5. November 2026, 15.00 Uhr Ort: Reichstagsgebäude"));
  assert(r.beleg.text.includes("zu einem Gespräch.")); assert(r.beleg.text.endsWith("Zutritt zur Präsidialebene ab 14.50 Uhr"));
  assert.equal(r.beleg.gewinnung.absaetze.length, 3);
});
test("Amtliche Volltextbindung lehnt falsches Datum, Gegenziel, Titel, versteckte Texte und Sperrmetadaten ab", () => {
  const body = original("hib-20261111");
  for (const changed of [body.replace('content="11.11.2026"', 'content="12.11.2026"'),
    body.replace('property="og:url" content="' + hibDoc.url, 'property="og:url" content="https://evil.example/fremd'),
    body.replace('<h1 class="bt-artikel__title">', '<h1 class="bt-artikel__title">Fremder Titel'),
    body.replace('<div class="bt-artikel__article">', '<div hidden class="bt-artikel__article">'),
    body.replace('<p>Berlin:', '<p hidden>Berlin:'), body.replace('<head>', '<head><meta name="robots" content="nosnippet">'),
    body.replace('</head>', '<script type="application/ld+json">{"@type":"Article","headline":"Andere Meldung"}</script></head>'),
    body.replace('</head>', '<link rel="canonical" href="https://evil.example/fremd"></head>')])
    assert.equal(full(hibDoc, changed).ok, false);
  const fremd = { ...hibDoc, url: hibDoc.url.replace("www.bundestag.de", "evil.example") };
  assert.equal(full(fremd, body.replaceAll(hibDoc.url, fremd.url)).ok, false);
  const b = full(hibDoc, body).beleg;
  for (const change of [{ originalDatum: "12.11.2026" }, { datumsFeld: "datePublished" }])
    assert.throws(() => A.pruefeArtikelkontext([hibDoc], { ...b, gewinnung: { ...b.gewinnung, ...change } }), /artikelkontext/);
});
test("Amtlicher Volltext ueberspringt keine kurze Absage und kennzeichnet langen Text als Abschnitte", () => {
  const body = original("hib-20261111");
  const abgesagt = full(hibDoc, body.replace('<p></p><p>Berlin:', '<p>Abgesetzt.</p><p>Berlin:'));
  assert.equal(abgesagt.ok, true, abgesagt.reason); assert(abgesagt.beleg.text.startsWith("Abgesetzt. Berlin:"));
  const lang = full(hibDoc, body.replace('<p></p><p>Berlin:', '<p>' + lead.repeat(70) + '</p><p>Berlin:'));
  assert.equal(lang.ok, true, lang.reason); assert.equal(lang.beleg.gewinnung.verfahren, "artikelabschnitte-v4");
  assert(lang.beleg.text.startsWith(lead.repeat(70))); assert(lang.beleg.text.includes("ersatzlos abwickeln"));
});
console.log(`PASS ${count} Gruppen Bundestags-Artikelkontext`);
