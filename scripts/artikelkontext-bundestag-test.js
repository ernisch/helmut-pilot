"use strict";
const assert = require("node:assert/strict");
const G = require("../lib/helmut/artikelkontext-gewinnung");
const A = require("../lib/helmut/artikelkontext");
const U = require("../lib/helmut/understanding");
const doc = { id: "rd-synthetisch", title: "Neue Regeln zur Foerderung beraten",
  summary: "Der Bundestag hat einen neuen Entwurf beraten.",
  url: "https://www.bundestag.de/dokumente/textarchiv/2026/kw39-regeln-1234567",
  published_at: "2026-09-25T10:00:00.000Z", source_name: "Deutscher Bundestag" };
const lead = "Der Bundestag hat den Entwurf heute beraten. Zur weiteren Beratung wurde er dem Ausschuss fuer Arbeit und Soziales ueberwiesen.";
const block = (title = doc.title, body = `<p>${lead}</p>`) => `<article class="bt-artikel"><div><h1>${title}</h1></div><div class="bt-artikel__article"><div>${body}</div></div><aside><article><p>Fremde Rednertexte und Vorgangsdetails.</p></article></aside></article>`;
function response(body = block()) { return { finalUrl: doc.url, gelesenAm: "2026-09-25T12:00:00.000Z",
  body: `<html><head><meta property="og:type" content="article"><meta name="date" content="25.09.2026"><meta property="og:url" content="${doc.url}"><meta property="og:title" content="Deutscher Bundestag - ${doc.title}"></head><body>${body}</body></html>` }; }
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
  for (const first of ["Abgesetzt.", "", "x".repeat(601)]) reject(response(block(doc.title, `<p>${first}</p><p>${lead}</p>`)));
  assert.equal(get(response(block(doc.title, `<p>${"x".repeat(600)}</p>`))).beleg.text.length, 600);
  reject(response(block(doc.title, `<p>${doc.summary}</p><p>${lead}</p>`)));
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
console.log(`PASS ${count} Gruppen Bundestags-Artikelkontext`);
