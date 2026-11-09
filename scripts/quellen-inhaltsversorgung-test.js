"use strict";
// Originalproben aus dem vorigen Auftrag, sonst deklarierte Synthetik.
// Keine echten Anbieter-, Datenbank-, Profil- oder Modellaufrufe.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const I = require("../lib/helmut/quellen-inhaltsversorgung"), G = require("../lib/helmut/artikelkontext-gewinnung");
const A = require("../lib/helmut/artikelkontext"), D = require("../lib/helmut/dedup"), C = require("../lib/helmut/crawler");
const U = require("../lib/helmut/understanding"), S = require("../lib/helmut/artikelkontext-belegspeicher");
const root = path.join(__dirname, "fixtures/inhaltsversorgung-20261108"), read = name => fs.readFileSync(path.join(root, name), "utf8");
const date = "2026-11-08T08:00:00.000Z";
const dgbUrl = "https://www.dgb.de/service/weiterer-service/tarifmeldungen/tarifmeldung/dritte-tarifrunde-im-gebaeudereiniger-handwerk-endet-ohne-ergebnis/";
const radioUrl = "https://www.radio-hannover.de/hannover-news/sozialverband-warnt-vor-altersarmut-in-niedersachsen";
const feed = C.parseRssItems(fs.readFileSync(path.join(__dirname, "fixtures/quelleninhalt-20261107/dgb-google.xml"), "utf8"))[0];
// Gespeicherte native Quellenkennung: der volle Google-Herausgebersuffix ist
// kein Ersatz fuer den tatsaechlichen source_name der vorhandenen Rohzeile.
const dgb = { ...D.toRawDocumentRow(C.normalizeRawItem({ ...feed, url: dgbUrl, originalUrl: feed.url },
  { id: "dgb", name: "DGB", type: "association", url: "https://news.google.com/rss/search?q=site:dgb.de" })), source_name: "DGB" };
const radio = D.toRawDocumentRow({ title: "Sozialverband warnt vor Altersarmut in Niedersachsen - Radio Hannover",
  sourceName: "Radio Hannover", url: radioUrl, publishedAt: "2026-11-06T11:11:24Z", linkType: "direct", sourceType: "media" });
const profile = (id, extra = {}) => ({ id, fullName: "Fiktives Mandat " + id, party: "Fraktionslos", parliamentType: "Bundestag",
  profileActive: true, state: "Niedersachsen", committees: ["Arbeit und Soziales"], focusTopics: ["Mindestlohn"], ...extra });
const profiles = [profile("test-a"), profile("test-b"), profile("test-c", { committees: ["Finanzen"], focusTopics: ["Steuerrecht"], state: "Berlin" })];
const doc = (suffix, title = "Mitteilung") => D.toRawDocumentRow({ title, url: "https://www.dgb.de/" + suffix,
  sourceName: "Testquelle", publishedAt: "2026-11-06T09:26:29Z", linkType: "direct" });
const withFinding = d => ({ ...d, findings: [{ raw_document_id: d.id, retrieval_path_id: "rp-fachprobe" }] });
const html = (d, text = "Die Gewerkschaft fordert einen höheren Mindestlohn für alle Beschäftigten in der Branche.") => {
  const ld = { "@type": "NewsArticle", headline: d.title, url: d.url, datePublished: d.published_at, articleBody: text };
  return `<html><head><link rel="canonical" href="${d.url}"><meta property="og:title" content="${d.title}">`
    + `<script type="application/ld+json">${JSON.stringify(ld)}</script></head><body><article><p>${text}</p></article></body></html>`;
};
function environment(answers = new Map([[dgbUrl, read("dgb-artikel.html")], [radioUrl, read("radio-hannover.html")]])) {
  const rows = new Map(), requests = [];
  const speicher = S.erzeugeBelegspeicher({ storeId: "isoliert", request: async (endpoint, opts = {}) => {
    const q = new URL(endpoint, "https://local.invalid").searchParams, id = q.get("id")?.slice(3);
    if (!opts.method) return rows.has(id) ? [{ id, data: structuredClone(rows.get(id)) }] : [];
    const body = JSON.parse(opts.body);
    if (opts.method === "POST") {
      assert(!rows.has(body.id)); rows.set(body.id, structuredClone(body.data)); return [{ id: body.id }];
    }
    assert.equal(opts.method, "PATCH");
    assert.equal(rows.get(id).zustand, "reserviert");
    assert.equal(q.get("data->>versuchId"), "eq." + rows.get(id).versuchId);
    rows.set(id, structuredClone(body.data)); return [{ id }];
  } });
  const deps = { env: { HELMUT_ANBIETER_STEUERUNG: "on" }, now: () => new Date(date), speicher,
    fetchUrl: async (url, zero, options) => {
      assert.equal(zero, 0); assert.equal(options.artikelkontext, true);
      assert.equal(options.allowedHost, new URL(url).hostname.replace(/^www\./, ""));
      requests.push(url); const value = answers.get(url);
      if (value instanceof Error) throw value;
      return { body: value || "<html><head></head></html>", finalUrl: url };
    } };
  const factory = () => I.erzeugeInhaltsversorgung({ vorbereitet: true, laufId: "isolierter-test", hosts: ["www.dgb.de", "www.radio-hannover.de"],
    deadlineMs: Date.parse(date) + 300000 }, deps);
  return { rows, requests, deps, factory };
}
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
async function modelCheck(entry) {
  const prompts = [];
  const vertrag = {
    reserviere: async () => ({ erlaubt: true, fencing: 1 }), modellstart: async () => ({ erlaubt: true }), schreibrecht: async () => ({ erlaubt: true }),
    speichere: async () => ({ gespeichert: true, pruefbar: true }), freigabe: async () => {}, freigabeOhneAufruf: async () => {}, ausgangUnbekannt: async () => {},
    vormerkungLese: async () => ({ verfuegbar: true, vorhanden: false, fehlversuche: 0 }), vormerkungErhoehe: async () => {}, vormerkungLoese: async () => {}
  };
  const result = await U.understandOneCluster({ documents: [entry.document] }, {
    canSpend: async () => ({ allowed: true }), modelName: () => "isolierte-attrappe", logSkip: () => {},
    artikelkontextVersorgung: I.artikelVersorgung(entry),
    requestUnderstanding: async prompt => {
      prompts.push(prompt);
      const sources = prompt.split("\n").filter(l => l.startsWith('{"quelle_id":')).map(JSON.parse);
      assert.equal(sources[0].artikelkontext.text, entry.beleg.text);
      assert.equal(sources[0].artikelkontext.gewinnung.kanonischDeklariert, entry.beleg.gewinnung.kanonischDeklariert);
      return { headline: "Isolierter Test", was_ist_passiert: "Deklarierte Modellattrappe", warum_wichtig: "Isolierter Test", wer_ist_betroffen: "Isolierter Test",
        parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [], zeitdruck: "mittel", handlungsempfehlung: "Isolierter Test", confidence_score: 70,
        display_title: "Isolierter Test", display_summary: "Isolierter Test", why_relevant: "", recommendation: "", display_category: "" };
    },
    save: async () => { throw Error("Unbedingter Speicherweg verboten"); }, saveSources: async () => {}, markFailed: async () => {},
    findVorgangCandidates: async () => [], listVorgangDocuments: async () => []
  }, { vorgangId: "vg-isoliert-" + entry.document.id.slice(-8), existing: null, vertrag, deadlineMs: Date.now() + 300000 });
  assert.equal(result.status, "saved", JSON.stringify(result)); assert.equal(prompts.length, 1);
}
async function main() {
  await test("Originalproben und bereits vorhandene Vollantworten sind hashgebunden; kein neuer Abruf", () => {
    for (const item of JSON.parse(read("manifest.json"))) {
      assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(root, item.file))).digest("hex"), item.fixture_sha256);
      if (fs.existsSync(item.original_path)) {
        const bytes = fs.readFileSync(item.original_path);
        assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), item.source_sha256);
        const d = item.file === 'dgb-artikel.html' ? dgb : radio;
        const full = G.gewinneArtikelEinstieg(d, { body: bytes.toString(), finalUrl: d.url, gelesenAm: date });
        const reduced = G.gewinneArtikelEinstieg(d, { body: read(item.file), finalUrl: d.url, gelesenAm: date });
        assert.equal(full.ok, true, full.reason); assert.equal(full.beleg.text, reduced.beleg.text);
      } else console.log("SKIP Vollantwortvergleich fehlt lokal: " + item.file + "; Fixturehash bleibt geprüft");
    }
  });
  await test("Inerter Standard liest/schreibt/ruft nichts ab", async () => {
    const e = environment(); const r = await I.erzeugeInhaltsversorgung({}, e.deps).versorge([dgb], profiles);
    assert.equal(r.reason, "nicht-angefordert"); assert.equal(e.rows.size, 0); assert.equal(e.requests.length, 0);
  });
  await test("DGB: vier ganze Absätze erhalten Angebot, Forderung und Friedenspflicht", () => {
    const r = G.gewinneArtikelEinstieg(dgb, { body: read("dgb-artikel.html"), finalUrl: dgbUrl, gelesenAm: date });
    assert.equal(r.ok, true, r.reason); assert.equal(r.beleg.text.length, 1256); assert.equal(r.beleg.gewinnung.absaetze.length, 4);
    assert.deepEqual(r.beleg.gewinnung.zwischenTexte, ['Arbeitgeber bieten kaum Plus', 'IG BAU fordert zwei Euro mehr', 'Beschäftigte sind streikbereit']);
    assert(r.beleg.text.includes("von 15 auf 15,30 Euro")); assert(r.beleg.text.includes("von derzeit 15 auf 17 Euro"));
    assert(r.beleg.text.endsWith("Die Friedenspflicht endet am 31. Dezember dieses Jahres."));
    assert.equal(dgb.summary, null);
    assert.throws(() => A.pruefeArtikelkontext([dgb], { ...r.beleg, gewinnung: { ...r.beleg.gewinnung, verfahren: "artikel-absatz-titel-v1" } }), /absatz-ungueltig/);
  });
  await test("Radio: HTTPS-Ziel mit identischer HTTP-Deklaration, vollständigem Absatz und unverändertem Publikationsstand", () => {
    const r = G.gewinneArtikelEinstieg(radio, { body: read("radio-hannover.html"), finalUrl: radioUrl, gelesenAm: date });
    assert.equal(r.ok, true, r.reason); assert.equal(r.beleg.text.length, 727);
    assert(r.beleg.text.includes("Ab 2027 könnten die Leistungen deutlich gekürzt werden."));
    assert(r.beleg.text.endsWith("Außerdem müsse die Politik mehr für bezahlbaren Wohnraum und gegen steigende Mieten tun."));
    assert.equal(r.beleg.gewinnung.datumsFeld, "dateCreated"); assert.equal(radio.published_at, "2026-11-06T11:11:24Z");
  });
  await test("Radio-Gegenproben: keine fremden Ziele, Zeitdrift, versteckten oder bloßen Titeltexte", () => {
    const original = read("radio-hannover.html");
    for (const changed of [original.replace('http://www.radio-hannover.de/', 'http://fremd.invalid/'),
      original.replace('rel="canonical"', 'rel="canonical"><link rel="canonical" href="https://fremd.invalid/a"'),
      original.replace('datetime="2026-11-06', 'datetime="2026-11-07'),
      original.replace('itemprop="articleBody"', 'hidden itemprop="articleBody"'),
      original.replace('</head>', '<script type="application/ld+json">{"@type":"NewsArticle","headline":"Fremde Meldung","url":"https://fremd.invalid/a"}</script></head>'),
      original.replace(/<p>[\s\S]*?<\/p>/, '<p>Sozialverband warnt vor Altersarmut in Niedersachsen</p>')]) {
      assert.equal(G.gewinneArtikelEinstieg(radio, { body: changed, finalUrl: radioUrl, gelesenAm: date }).ok, false);
    }
    assert.equal(G.gewinneArtikelEinstieg(radio, { body: original, finalUrl: radioUrl + '-fremd', gelesenAm: date }).ok, false);
  });
  await test("Globale Beschaffung einmal für zwei Mandate; bestätigter Originaltext erreicht echten Modell-Callback", async () => {
    const e = environment(), service = e.factory();
    const r = await service.versorge([dgb, radio, dgb], profiles);
    assert.equal(r.bereit.length, 2); assert.equal(e.requests.length, 2);
    for (const entry of r.bereit) { assert.deepEqual(entry.mandatIds, ["test-a", "test-b", "test-c"]); await modelCheck(entry); }
    assert(!JSON.stringify([...e.rows.values()]).includes('test-a'));
    assert(!JSON.stringify([...e.rows.values()]).includes('test-b'));
    const repeat = await e.factory().versorge([dgb, radio], profiles);
    assert.equal(repeat.bereit.length, 2); assert.equal(e.requests.length, 2); assert.equal(repeat.grenzen.neueAbrufe, 0);
  });
  await test("Knappe Überschrift bleibt über bestehenden Paketbezug begrenzt prüfbar", async () => {
    const d = withFinding(doc("knapp"));
    const e = environment(new Map([[d.url, html(d)]]));
    const katalog = { packages: [{ id: "pkg-arbeit", key: "arbeit-und-soziales", status: "active" }],
      packagePaths: [{ package_id: "pkg-arbeit", retrieval_path_id: "rp-fachprobe" }] };
    const r = await e.factory().versorge([d], profiles, katalog);
    assert.equal(r.bereit.length, 1, JSON.stringify(r)); assert.equal(r.grenzen.unklare, 1);
    assert.deepEqual(r.bereit[0].mandatIds, ["test-a", "test-b", "test-c"]);
    const forged = { ...d, findings: [{ raw_document_id: 'fremd', retrieval_path_id: 'rp-fachprobe' }] };
    const noBinding = await e.factory().versorge([forged], profiles, katalog);
    assert.equal(noBinding.bereit.length, 0); assert.equal(noBinding.befund[0].status, 'nicht-ausgewaehlt');
    const legacy = { ...d, findings: [{ raw_document_id: d.id, source_id: 'fachprobe', retrieval_path_id: null }] };
    const legacyResult = await e.factory().versorge([legacy], profiles, { ...katalog, retrievalPaths: [{ id: 'rp-fachprobe', legacy_source_id: 'fachprobe' }] });
    assert.equal(legacyResult.bereit.length, 1);
  });
  await test("Begrenzter Einstieg beweist keinen fehlenden Fachbezug des Vollartikels", async () => {
    const d = doc("unpassend", "Mindestlohn: Neue Meldung");
    const e = environment(new Map([[d.url, html(d, "Die Vogelbeobachtung im Nationalpark beginnt im nächsten Frühjahr mit einer Ausstellung.")]]));
    const r = await e.factory().versorge([d], profiles); assert.equal(r.bereit.length, 1);
    assert.equal(r.befund[0].status, "belegt");
    assert(!r.befund.some(b => b.status === "unpassend"));
    const unrelated = await e.factory().versorge([doc("sport", "Fußball: Mannschaft gewinnt Pokal")], profiles);
    assert.equal(unrelated.bereit.length, 0); assert.equal(e.requests.length, 1);
  });
  await test("Fachbezug erst nach dem vierten Absatz erreicht den vollstaendigen Artikelkontext", async () => {
    const d = doc("spaeter-fachbezug", "Mindestlohn: Neue Meldung");
    const anfang = ["Die Ausstellung im alten Gebaeude beginnt am kommenden Montag und zeigt Bilder aus der Region.",
      "Besucherinnen und Besucher erhalten dort einen Einblick in die Entwicklung der Landschaft und ihrer Orte.",
      "Das Haus oeffnet seine Tueren am Vormittag und bietet anschliessend einen gemeinsamen Rundgang an.",
      "Weitere Termine und die Einzelheiten des Programms werden bei einer Veranstaltung vor Ort vorgestellt."];
    const ende = "Die anschliessenden Tarifverhandlungen betreffen den Mindestlohn und den Arbeitsschutz fuer zweihundert Beschaeftigte.";
    const body = [...anfang, ende].join(" ");
    const page = html(d, body).replace(`<p>${body}</p>`, [...anfang, ende].map(t => `<p>${t}</p>`).join(""));
    const e = environment(new Map([[d.url, page]]));
    const r = await e.factory().versorge([d], profiles);
    assert.equal(r.bereit.length, 1, JSON.stringify(r));
    assert(r.bereit[0].beleg.text.includes("Tarifverhandlungen"));
    assert.equal(r.bereit[0].beleg.text, body);
    assert.equal(r.bereit[0].beleg.gewinnung.verfahren, "artikeltext-v3");
    assert(!r.befund.some(b => b.status === "unpassend"));
  });
  await test("Unklare und neue Abrufe bleiben über mehrere Batches begrenzt; Vertagung ist kein irrelevanter Treffer", async () => {
    const ds = Array.from({ length: 5 }, (_, n) => withFinding(doc("unklar-" + n)));
    const e = environment(new Map(ds.map(d => [d.url, html(d)]))), service = e.factory();
    const k = { packages: [{ id: "pkg-arbeit", key: "arbeit-und-soziales", status: "active" }], packagePaths: [{ package_id: "pkg-arbeit", retrieval_path_id: "rp-fachprobe" }] };
    const a = await service.versorge(ds.slice(0, 2), profiles, k), b = await service.versorge(ds.slice(2), profiles, k);
    assert.equal(e.requests.length, 2); assert.equal(b.grenzen.unklare, 3);
    assert(b.befund.some(x => x.reason === "laufgrenze")); assert(b.befund.some(x => x.reason === "unklarkontingent"));
    assert.equal(a.bereit.length, 2);
  });
  await test("Nicht verfügbar bleibt dauerhaft erkennbare Lücke; kein wiederholter Abruf beim erneuten Lesen", async () => {
    const d = doc("nicht-verfuegbar", "Mindestlohn: Fachmeldung"); const err = Object.assign(new Error("gesperrt"), { statusCode: 403 });
    const e = environment(new Map([[d.url, err]]));
    for (let n = 0; n < 2; n++) {
      const r = await e.factory().versorge([d], profiles); assert.equal(r.bereit.length, 0); assert.equal(r.befund[0].reason, "http-status");
    }
    assert.equal(e.requests.length, 1);
  });
  await test("Gespeicherte negative Belege verbrauchen keine Kandidatenplaetze der naechsten Fortsetzung", async () => {
    const ds = Array.from({ length: 4 }, (_, i) => doc("cachefortsetzung-" + i, "Mindestlohn: Fachmeldung"));
    const e = environment(new Map(ds.map(d => [d.url, Object.assign(new Error("gesperrt"), { statusCode: 403 })])));
    const erste = await e.factory().versorge(ds, profiles);
    assert.equal(erste.grenzen.neueAbrufe, 2); assert.equal(e.requests.length, 2);
    const zweite = await e.factory().versorge(ds, profiles);
    assert.equal(zweite.grenzen.neueAbrufe, 2); assert.equal(e.requests.length, 4);
    const dritte = await e.factory().versorge(ds, profiles);
    assert.equal(dritte.grenzen.kandidaten, 0); assert.equal(dritte.grenzen.neueAbrufe, 0);
    assert.equal(new Set(e.requests).size, 4);
  });
  await test("CAS-Konkurrenz führt zu höchstens einem globalen Originalabruf", async () => {
    const e = environment(); await Promise.all([e.factory().versorge([dgb], profiles), e.factory().versorge([dgb], profiles)]);
    assert.equal(e.requests.length, 1);
  });
  await test("Zwischenkontext bleibt samt Rückzugshinweis bis zur Modelleingabe erhalten", async () => {
    const d = doc('zwischenkontext', 'Mindestlohn: Stand der Verhandlungen');
    const first = 'Die Gewerkschaft verlangt einen höheren Mindestlohn für alle Beschäftigten.';
    const last = 'Die Verhandlungen werden am Donnerstag fortgesetzt.';
    const warning = 'Diese Forderung wurde inzwischen zurückgezogen.';
    const full = first + ' ' + warning + ' ' + last;
    for (const tag of ['h3', 'div']) {
      const visible = `<p>${first}</p><${tag}>${warning}</${tag}><p>${last}</p>`;
      const original = html(d, full).replace(`<p>${full}</p>`, visible);
      const result = G.gewinneArtikelEinstieg(d, { body: original, finalUrl: d.url, gelesenAm: date });
      assert.equal(result.ok, true, result.reason); assert.equal(result.beleg.text, full);
      assert.deepEqual(result.beleg.gewinnung.absaetze, [first, last]);
      assert.deepEqual(result.beleg.gewinnung.zwischenTexte, [warning]);
      assert.throws(() => A.pruefeArtikelkontext([d], { ...result.beleg,
        gewinnung: { ...result.beleg.gewinnung, zwischenTexte: [''] } }), /einstieg-ungueltig/);
      const e = environment(new Map([[d.url, original]]));
      const supplied = await e.factory().versorge([d], profiles);
      assert.equal(supplied.bereit.length, 1); await modelCheck(supplied.bereit[0]);
      for (const mismatch of [original.replace(visible, `<p>${first}</p><p>${last}</p>`),
        original.replace(JSON.stringify(full), JSON.stringify(first + ' ' + last)),
        original.replace(`<${tag}>`, `<${tag} hidden>`)]) {
        assert.equal(G.gewinneArtikelEinstieg(d, { body: mismatch, finalUrl: d.url, gelesenAm: date }).ok, false);
      }
    }
  });
  await test("Einleitender Sachtext wird nicht als Metadatum oder späterer Artikelanfang übersprungen", () => {
    const d = doc('vorspann', 'Mindestlohn: Stand der Verhandlungen');
    const base = html(d), warning = 'Die folgende Meldung ist überholt und wurde zurückgezogen.';
    for (const before of [`<p>${warning}</p>`, `<div>${warning}</div>`,
      `<p>Datum <time datetime="2026-11-07">07. November 2026</time></p>`,
      `<p>Datum <time datetime="2026-11-06">${warning}</time></p>`]) {
      const result = G.gewinneArtikelEinstieg(d, { body: base.replace('<article>', '<article>' + before), finalUrl: d.url, gelesenAm: date });
      assert.equal(result.ok, false, before);
    }
    assert.equal(G.gewinneArtikelEinstieg(d, { body: base.replace('<article>', `<article><h1>${d.title}</h1>`), finalUrl: d.url, gelesenAm: date }).ok, true);
  });
  await test("Alle gelieferten Artikelidentitäten müssen zusammenpassen", () => {
    const d = doc('identitaet', 'Mindestlohn: Stand der Verhandlungen');
    const base = html(d);
    for (const mainEntityOfPage of ['https://www.dgb.de/fremd', { '@id': 'https://www.dgb.de/fremd' }]) {
      const changed = base.replace('"@type":"NewsArticle"', '"@type":"NewsArticle","mainEntityOfPage":' + JSON.stringify(mainEntityOfPage));
      assert.equal(G.gewinneArtikelEinstieg(d, { body: changed, finalUrl: d.url, gelesenAm: date }).ok, false);
    }
    const matching = base.replace('"@type":"NewsArticle"', '"@type":"NewsArticle","mainEntityOfPage":' + JSON.stringify({ '@id': d.url }));
    assert.equal(G.gewinneArtikelEinstieg(d, { body: matching, finalUrl: d.url, gelesenAm: date }).ok, true);
  });
  await test("Microdata übernimmt keinen widersprechenden JSON-LD-Erstellungsstand", () => {
    const original = read('radio-hannover.html');
    const text = G.gewinneArtikelEinstieg(radio, { body: original, finalUrl: radio.url, gelesenAm: date }).beleg.text;
    const data = { '@type': 'NewsArticle', headline: 'Sozialverband warnt vor Altersarmut in Niedersachsen',
      url: radio.url, mainEntityOfPage: { '@id': radio.url }, datePublished: radio.published_at,
      dateCreated: radio.published_at, articleBody: text };
    const add = value => original.replace('</head>', `<script type="application/ld+json">${JSON.stringify(value)}</script></head>`);
    assert.equal(G.gewinneArtikelEinstieg(radio, { body: add(data), finalUrl: radio.url, gelesenAm: date }).ok, true);
    assert.equal(G.gewinneArtikelEinstieg(radio, { body: add({ ...data, dateCreated: '2026-11-07T11:11:24Z' }), finalUrl: radio.url, gelesenAm: date }).ok, false);
  });
  await test("Zu langer erster Absatz, Publikationsdrift und Quellenstanddrift bleiben gesperrt", () => {
    const d = doc("lang", "Mindestlohn: Fachmeldung");
    const long = "Die Gewerkschaft fordert mehr Mindestlohn und bessere Arbeitsbedingungen ".repeat(30) + ".";
    assert.equal(G.gewinneArtikelEinstieg(d, { body: html(d, long), finalUrl: d.url, gelesenAm: date }).reason, "einstieg-zu-lang");
    const r = G.gewinneArtikelEinstieg(dgb, { body: read("dgb-artikel.html"), finalUrl: dgbUrl, gelesenAm: date });
    assert.throws(() => A.pruefeArtikelkontext([{ ...dgb, published_at: "2026-11-07T09:26:29Z" }], r.beleg), /quellenstand-abweichend/);
    assert.equal(G.gewinneArtikelEinstieg({ ...dgb, published_at: "2026-11-07T09:26:29Z" }, { body: read("dgb-artikel.html"), finalUrl: dgbUrl, gelesenAm: date }).ok, false);
    assert.equal(dgb.source_name, "DGB");
    assert.equal(G.gewinneArtikelEinstieg({ ...dgb, source_name: 'Andere Quelle' }, { body: read("dgb-artikel.html"), finalUrl: dgbUrl, gelesenAm: date }).ok, false);
  });
  await test("Exakte HTTP-Deklaration ist keine Freigabe fremder Pfade, Queries, Ports oder Zugangsdaten", () => {
    const original = read("radio-hannover.html"), canonical = radioUrl.replace("https:", "http:");
    for (const wrong of [canonical + '/fremd', canonical + '?neu=1', canonical + '#a',
      canonical.replace('www.radio-hannover.de', 'www.radio-hannover.de:80'),
      canonical.replace('www.radio-hannover.de', 'name:pass@www.radio-hannover.de')]) {
      assert.equal(G.gewinneArtikelEinstieg(radio, { body: original.replace(canonical, wrong), finalUrl: radioUrl, gelesenAm: date }).ok, false);
    }
    assert.equal(G.gewinneArtikelEinstieg(radio, { body: original, finalUrl: canonical, gelesenAm: date }).ok, false);
    assert.equal(require('../lib/helmut/quellen-auszug').fromHtml(radio, { body: original, finalUrl: radioUrl }).ok, false);
  });
  await test("Hostfreigabe, Anbietersteuerung und Deadline bleiben vor einem Originalabruf wirksam", async () => {
    for (const variant of ['host', 'anbieter', 'zeit']) {
      const e = environment();
      if (variant === 'anbieter') e.deps.env.HELMUT_ANBIETER_STEUERUNG = 'off';
      const auftrag = { vorbereitet: true, laufId: 'isoliert', hosts: variant === 'host' ? ['www.radio-hannover.de'] : ['www.dgb.de'], deadlineMs: Date.parse(date) + 300000 };
      const service = I.erzeugeInhaltsversorgung(auftrag, e.deps);
      if (variant === 'zeit') e.deps.now = () => new Date(Date.parse(date) + 400000);
      // Der Service bindet seine Uhr am Laufbeginn. Eine mutable Uhr macht die
      // spaetere Restzeitabsage sichtbar, ohne einen neuen Lauf zu starten.
      const r = variant === 'zeit' ? await I.erzeugeInhaltsversorgung({ ...auftrag, deadlineMs: Date.parse(date) + 1 },
        { ...e.deps, now: (() => { let n = 0; return () => new Date(Date.parse(date) + (n++ ? 2 : 0)); })() }).versorge([dgb], profiles)
        : await service.versorge([dgb], profiles);
      assert.equal(r.bereit.length, 0); assert.equal(e.requests.length, 0);
    }
    assert.equal(JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'))).git.deploymentEnabled['codex/quelleninhalt-20261107'], false);
  });
  console.log(`${passed}/${passed} Prüfgruppen bestanden; ausschließlich isolierte Original-Replays/Attrappen.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
