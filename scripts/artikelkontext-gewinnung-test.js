"use strict";

// Synthetische Herausgeberantworten; kein Netz, Modell oder Production Speicher.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const A = require("../lib/helmut/artikelkontext");
const U = require("../lib/helmut/understanding");
const G = require("../lib/helmut/artikelkontext-gewinnung");
const hash = s => crypto.createHash("sha256").update(s).digest("hex");
const doc = { id: "rd-synthetisch", title: "Bahnkonferenz: Neue Strecken nach Neustadt",
  summary: "Die Bahnkonferenz sollte neue Verbindungen ermoeglichen.",
  url: "https://example.org/politik/bahnkonferenz", canonical_url: "https://example.org/politik/bahnkonferenz",
  published_at: "2026-09-14T12:00:00Z", source_name: "Beispielmedium" };
const first = "Die Teilnehmenden sprechen ueber den Verkehr in den kommenden Jahren. Auch der Gueterverkehr ist ein Thema.";
const chosen = "Die Bahnkonferenz endete mit einer Erklaerung. Neue Strecken nach Neustadt sollen gemeinsam geplant werden.";
const escape = s => s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
function response({ paragraphs = [first, chosen], article = {}, extra = "", htmlChange = s => s } = {}) {
  const data = { "@type": "NewsArticle", headline: doc.title, mainEntityOfPage: doc.url,
    articleBody: [doc.summary, ...paragraphs].join(" "), ...article };
  const body = htmlChange(`<html><head><link rel="canonical" href="${doc.url}">
    <meta property="og:title" content="${escape(doc.title)}">
    <script type="application/ld+json">${JSON.stringify(data)}</script></head><body>
    <article><p>${doc.summary}</p>${paragraphs.map(p => `<p>${escape(p)}</p>`).join("")}${extra}</article></body></html>`);
  return { body, finalUrl: doc.url, gelesenAm: "2026-09-17T15:00:00Z" };
}
const get = (r = response(), d = doc) => G.gewinneArtikelkontext(d, r);
let count = 0;
function test(name, fn) { fn(); count++; console.log("PASS " + name); }
const fail = (r, reason) => { const got = get(r); assert.equal(got.ok, false); assert.equal(got.reason, reason); };

test("Automatische Auswahl liefert einen ganzen Originalabsatz samt reproduzierbarer Herkunft", () => {
  const r = response(), before = structuredClone({ doc, r });
  const result = get(r); assert.equal(result.ok, true);
  const b = result.beleg;
  assert.equal(b.version, 2); assert.equal(b.herkunft, "strukturierter-originalartikel");
  assert.equal(b.text, chosen); assert.equal(b.absatzPosition, 3);
  assert.equal(b.quellenHash, A.quellenstandHash(doc));
  assert.equal(b.gewinnung.antwortHash, hash(r.body));
  assert.equal(b.gewinnung.verfahren, "artikel-absatz-titel-v1");
  assert.equal(b.gewinnung.positionsbasis, "html-article-p");
  assert.equal(b.gewinnung.titelTreffer, 4);
  assert.deepEqual(get(r), result); assert.deepEqual({ doc, r }, before);
});

test("Automatischer Beleg erreicht die vorhandene Option als dieselbe Quelle", () => {
  const b = get().beleg, c = { documents: [doc] };
  const rows = p => p.split("\n").filter(l => l.startsWith('{"quelle_id":')).map(JSON.parse);
  const base = rows(U.buildUnderstandingPrompt(c));
  const prompt = U.buildUnderstandingPrompt(c, { artikelkontextVersuch: b });
  assert(prompt.includes("automatischen Auswahl aus einem strukturierten Originalartikel"));
  assert(!prompt.includes("Der Zusatz stammt aus einem manuellen Originalvergleich"));
  const withContext = rows(prompt);
  const { artikelkontext, ...q } = withContext[0];
  assert.deepEqual(q, base[0]); assert.equal(withContext.length, 1);
  assert.equal(artikelkontext.text, chosen); assert.deepEqual(artikelkontext.gewinnung, b.gewinnung);
  assert.equal(q.zeitbezug.ereignisdatum, null);
  assert.equal(U.buildUnderstandingPrompt({ documents: [{ ...doc, artikelkontext: b }] }), U.buildUnderstandingPrompt(c));
});

test("Fremde, widerspruechliche oder fehlende Artikelidentitaet wird abgewiesen", () => {
  fail({ ...response(), finalUrl: "https://other.example/bericht" }, "artikelziel-abweichend");
  for (const article of [{ mainEntityOfPage: "https://example.org/anders" }, { headline: "Fremde Nachricht" },
    { "@type": "WebPage" }, { articleBody: null }]) assert.equal(get(response({ article })).ok, false);
  for (const htmlChange of [s => s.replace('rel="canonical"', 'rel="alternate"'),
    s => s.replace('property="og:title"', 'property="other"'),
    s => s.replace('<link rel="canonical"', '<link rel="canonical" href="https://example.org/fremd"><link rel="canonical"'),
    s => s.replace('</head>', '<meta property="og:title" content="Fremder Titel"></head>')]) {
    assert.equal(get(response({ htmlChange })).ok, false);
  }
  assert.equal(get(response(), { ...doc, canonical_url: "https://example.org/anders" }).ok, false);
});

test("Ohne nachgewiesenen Artikelabsatz bleibt eine benannte Luecke", () => {
  fail(response({ article: { articleBody: first } }), "kein-eindeutiger-titelbezug");
  fail(response({ paragraphs: [first] }), "kein-eindeutiger-titelbezug");
  fail(response({ htmlChange: s => s.replaceAll("<p>", "<div>").replaceAll("</p>", "</div>") }), "keine-artikelabsaetze");
  fail(response({ htmlChange: s => s.replace("<article>", "<main>").replace("</article>", "</main>") }), "artikelbereich-mehrdeutig-oder-fehlend");
});

test("Vorschauen, Kommentare, Skripte und versteckte Texte werden nicht zu Artikelbelegen", () => {
  const lure = "Bahnkonferenz Neue Strecken Neustadt. Diese andere Nachricht gehoert nicht zum Artikel und darf nicht ausgewaehlt werden.";
  const r = response({ extra: `<p>${lure}</p><!--<p>${lure}</p>--><script>const t='<p>${lure}</p>';</script>` });
  assert.equal(get(r).beleg.text, chosen);
  fail(response({ htmlChange: s => s.replace(`<p>${chosen}</p>`, `<p hidden>${chosen}</p>`) }), "kein-eindeutiger-titelbezug");
  fail(response({ htmlChange: s => s.replace(`<p>${chosen}</p>`, `<p><span aria-hidden="true">${chosen}</span></p>`) }), "kein-eindeutiger-titelbezug");
  for (const [open, close] of [['<div hidden>', '</div>'], ['<nav>', '</nav>'], ['<figure>', '</figure>'],
    ['<div style="display:none">', '</div>']]) {
    fail(response({ htmlChange: s => s.replace(`<p>${chosen}</p>`, `${open}<p>${chosen}</p>${close}`) }), "kein-eindeutiger-titelbezug");
  }
  fail(response({ htmlChange: s => s.replace('<article>', '<article hidden>') }), "kein-eindeutiger-titelbezug");
  fail(response({ htmlChange: s => s.replace(`<p>${chosen}</p>`, `<p>${chosen}<br>Weitere Zeile.</p>`) }), "kein-eindeutiger-titelbezug");
});

test("Mehrdeutige Artikel und gleich starke Absatzauswahl werden nicht willkuerlich aufgeloest", () => {
  fail(response({ paragraphs: [chosen, chosen.replace("endete", "beginnt")] }), "absatzauswahl-mehrdeutig");
  fail(response({ paragraphs: [chosen, chosen] }), "kein-eindeutiger-titelbezug");
  fail(response({ htmlChange: s => s.replace('</body>', '<article><p>Weiterer Artikel</p></article></body>') }), "artikelbereich-mehrdeutig-oder-fehlend");
  fail(response({ htmlChange: s => s.replace('</head>', '<script type="application/ld+json">{"@type":"NewsArticle"}</script></head>') }), "strukturierter-artikel-mehrdeutig-oder-fehlend");
});

test("600 Zeichen Grenze kuerzt weder Absatz noch die Auswahl auf einen schwaecheren Treffer", () => {
  const exact = chosen + "x".repeat(600 - chosen.length);
  assert.equal(get(response({ paragraphs: [exact] })).beleg.text.length, 600);
  fail(response({ paragraphs: [chosen + "x".repeat(601 - chosen.length)] }), "absatz-zu-lang");
  fail(response({ paragraphs: ["Bahnkonferenz in Neustadt. " + first, chosen + "x".repeat(700)] }), "absatz-zu-lang");
});

test("Antwort, Metadaten und Arbeitsmenge sind hart begrenzt", () => {
  fail({ ...response(), body: "x".repeat(G.MAX_ANTWORT_BYTES + 1) }, "antwort-ungueltig");
  fail({ ...response(), body: "ä".repeat(G.MAX_ANTWORT_BYTES / 2 + 1) }, "antwort-ungueltig");
  fail({ ...response(), gelesenAm: "2026-09-17" }, "lesezeit-ungueltig");
  fail(response({ extra: "<p>Zusatz</p>".repeat(257) }), "zu-viele-absaetze");
  fail(response({ htmlChange: s => s.replace('</head>', '<script type="application/ld+json">kaputt</script></head>') }), "strukturierte-daten-ungueltig");
});

test("Nur belegte Inline Darstellung wird normalisiert, keine Umformulierung", () => {
  const p = chosen.replace("Neue Strecken", 'Neue Strecken & "Wege"');
  const r = response({ paragraphs: [p], htmlChange: s => s.replace('Neue Strecken &amp;', '<strong>Neue Strecken</strong> &amp;') });
  assert.equal(get(r).beleg.text, p);
  const graph = response({ htmlChange: s => s.replace('>{"@type":"NewsArticle"', '>{"@graph":[{"@type":"NewsArticle"').replace('</script></head>', ']}</script></head>') });
  assert.equal(get(graph).ok, true);
});

test("Automatische Herkunft bleibt streng versioniert und auf freigegebene Felder begrenzt", () => {
  const b = get().beleg;
  for (const change of [{ version: 1 }, { herkunft: "manueller-originalvergleich" }, { gewinnung: null },
    { gewinnung: { ...b.gewinnung, antwortHash: "falsch" } },
    { gewinnung: { ...b.gewinnung, antwortHash: { toString: () => "a".repeat(64), fremd: "Zusatz" } } },
    { gewinnung: { ...b.gewinnung, titelTreffer: 1 } },
    { gewinnung: { ...b.gewinnung, positionsbasis: "vermutet" } }]) {
    assert.throws(() => A.pruefeArtikelkontext([doc], { ...b, ...change }), /artikelkontext/);
  }
  const clean = A.pruefeArtikelkontext([doc], { ...b, html: "NICHT_UEBERNEHMEN",
    gewinnung: { ...b.gewinnung, html: "NICHT_UEBERNEHMEN" } });
  assert(!JSON.stringify(clean).includes("NICHT_UEBERNEHMEN"));
  assert.equal(clean.gewinnung.antwortHash, b.gewinnung.antwortHash);
});

test("Geaenderte Antwort bleibt im Herkunftsbeleg sichtbar, Quellenstand wird nicht umgeschrieben", () => {
  const a = get(), b = get(response({ htmlChange: s => s.replace('</body>', '<div>Anderer Seitenstand</div></body>') }));
  assert.equal(a.beleg.text, b.beleg.text);
  assert.equal(a.beleg.quellenHash, b.beleg.quellenHash);
  assert.notEqual(a.beleg.gewinnung.antwortHash, b.beleg.gewinnung.antwortHash);
  assert.equal(a.beleg.gewinnung.artikelTextHash, b.beleg.gewinnung.artikelTextHash);
});

console.log(`PASS ${count} Gruppen zur automatischen Artikelkontextgewinnung`);
