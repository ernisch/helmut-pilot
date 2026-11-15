"use strict";
const assert = require("node:assert/strict");
const C = require("../lib/helmut/quellen-eurlex-cellar");
const now = new Date("2026-11-15T20:32:12.280Z");
const XSD = "http://www.w3.org/2001/XMLSchema#";
const uri = value => ({ type: "uri", value });
const literal = (value, datatype) => ({ type: "literal", value, ...(datatype ? { datatype } : {}) });
// Drei echte, oeffentliche OJ-L-Metadatensaetze aus dem begrenzten amtlichen
// SPARQL-GET15Nov20:32UTC, SHA625beaf8497aa200dda494c42dc6e42388bd2f679156e2d68629e83105012b95.
// Nur Titel/Identitaet/Publikationsdatum; kein Originalvolltextfixture.
const fixtures = [
  ["da8055db-df05-11f1-ba80-01aa75ed71a1", "32026D2505", "L_202602505",
    "Durchführungsbeschluss (EU) 2026/2505 der Kommission vom 12. November 2026 zur Berichtigung des Durchführungsbeschlusses (EU) 2026/1971 der Kommission zur Änderung des Durchführungsbeschlusses (EU) 2026/1279 der Kommission über die zur Unterstützung der Verordnung (EU) 2016/425 des Europäischen Parlaments und des Rates erstellten harmonisierten Normen für Schutzhandschuhe für Friseure, Schutzkleidung gegen Regen sowie Augen- und Gesichtsschutz für berufliche Anwendungen"],
  ["db53845c-df05-11f1-ba80-01aa75ed71a1", "32026D2510", "L_202602510",
    "Beschluss (EU) 2026/2510 der Kommission vom 12. November 2026 zur Bestätigung der Beteiligung Irlands an dem Beschluss (EU) 2023/1076 des Rates über den Abschluss — im Namen der Europäischen Union — des Übereinkommens des Europarats zur Verhütung und Bekämpfung von Gewalt gegen Frauen und häuslicher Gewalt in Bezug auf Aspekte, die die justizielle Zusammenarbeit in Strafsachen, Asyl und das Verbot der Zurückweisung betreffen"],
  ["3354fe23-df03-11f1-ba80-01aa75ed71a1", "32026D2521", "L_202602521",
    "Beschluss (EU) 2026/2521 der Kommission vom 23. Oktober 2026 zur Genehmigung — im Namen der Europäischen Atomgemeinschaft — des Abkommens zwischen der Europäischen Union und der Europäischen Atomgemeinschaft einerseits und der Regierung Kanadas andererseits über die Einrichtung sowie die Vorrechte und Immunitäten der Delegation der Europäischen Union in Kanada"]
];
function row([work, celex, oj, title] = fixtures[0]) {
  return {
    work: uri("http://publications.europa.eu/resource/cellar/" + work),
    celex: literal(celex, XSD + "string"), published: literal("2026-11-13", XSD + "date"),
    ojIdentity: uri("http://publications.europa.eu/resource/oj/" + oj),
    title: { ...literal(title), "xml:lang": "de" }
  };
}
function envelope(rows = fixtures.map(row)) {
  return { head: { link: [], vars: ["work", "celex", "published", "ojIdentity", "title"] },
    results: { distinct: false, ordered: true, bindings: rows } };
}
const body = rows => JSON.stringify(envelope(rows));
const parse = rows => C.parseResponse(body(rows), { now });
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }

(async () => {
  await test("Fester amtlicher OJ-L/DEU-Abfragevertrag mit echten Publikationsdaten und begrenztem UTC-Fenster", () => {
    const q = C.buildQuery(now);
    assert(q.includes("official-journal-act_date_publication ?published"));
    assert(q.includes("document-collection/OJ-L>")); assert(q.includes("language/DEU>"));
    assert(q.includes('"2026-11-02"^^xsd:date')); assert(q.includes('"2026-11-15"^^xsd:date'));
    assert(q.includes("ORDER BY DESC(?published) ASC(?celex)")); assert(q.endsWith("LIMIT 16"));
    assert(!q.includes("work_date_document")); assert(!q.includes("lastModificationDate"));
    assert(!q.includes("STR(?text)")); assert.equal(C.ENDPOINT, "https://publications.europa.eu/webapi/rdf/sparql");
    assert(C.buildQuery("2026-01-01T00:01:00Z", 1).includes('"2025-12-19"^^xsd:date'));
    for (const value of [0, 17, 2.5, "3", null, Infinity]) assert.throws(() => C.buildQuery(now, value), /limit/);
    assert.throws(() => C.buildQuery("kein Datum"), /zeitpunkt/);
  });
  await test("Drei echte aktuelle Metadatensaetze liefern nur Titel, CELEX-Link, Datum und geschlossene Herkunft", () => {
    const items = parse(); assert.equal(items.length, 3);
    for (const [index, item] of items.entries()) {
      assert.equal(item.title, fixtures[index][3]); assert.equal(item.publishedAt, "2026-11-13T00:00:00.000Z");
      assert.equal(item.url, "https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:" + fixtures[index][1]);
      assert.equal(item.cellar.publicationDate, "2026-11-13");
      assert.deepEqual(Object.keys(item), ["title", "url", "publishedAt", "cellar"]);
      assert.deepEqual(Object.keys(item.cellar), ["workUri", "officialJournalUri", "celex", "publicationDate"]);
      assert(C.validateMetadata(item)); assert(C.validiereHerkunft(item.cellar, item.url, item.publishedAt));
      for (const key of ["content", "author", "summary", "imageUrl", "html"]) assert(!Object.hasOwn(item, key));
    }
    assert(items[0].title.length > 300, "Kuerzung bleibt der bestehenden Ausgabeprojektion vorbehalten");
  });
  await test("OJ-L-Kollektion entscheidet den Umfang statt einer unvollstaendigen CELEX-Sektorliste", () => {
    assert(!C.buildQuery(now).includes("REGEX(STR(?celex)"));
    for (const celex of ["42026D2505", "E2026D0001", "32026R2505R(01)"]) {
      const x = row(); x.celex.value = celex;
      const [item] = parse([x]); assert.equal(item.cellar.celex, celex);
      assert(C.validiereHerkunft(item.cellar, item.url, item.publishedAt));
    }
    for (const celex of ["X".repeat(81), "32026D2505&x=1", "32026D2505#text", "32026D2505 "]) {
      const x = row(); x.celex.value = celex; assert.throws(() => parse([x]), /metadaten/);
    }
  });
  await test("Echte Leere bleibt leer, identische Dublette wird nicht vervielfacht", () => {
    assert.deepEqual(parse([]), []); assert.equal(parse([row(), row()]).length, 1);
    const shuffled = fixtures.map(row).reverse(); assert.equal(parse(shuffled)[0].cellar.celex, fixtures[0][1]);
  });
  await test("HTML, ungueltiges JSON, falsche Huellen und zu grosse Antworten sind Fehler", () => {
    for (const value of ["<html>JavaScript challenge</html>", "{", "null", "[]", '{}', body() + "!", null,
      " ".repeat(C.MAX_BYTES + 1), "ä".repeat(C.MAX_BYTES / 2 + 1)])
      assert.throws(() => C.parseResponse(value, { now }), /eurlex-cellar/);
    for (const alter of [x => { delete x.head; }, x => { x.head.vars = ["title"]; },
      x => { x.results.bindings = {}; }, x => { x.results.bindings = Array.from({ length: 17 }, () => row()); }]) {
      const x = envelope(); alter(x); assert.throws(() => C.parseResponse(JSON.stringify(x), { now }), /antwort/);
    }
  });
  await test("Fehlende, fremde oder erweiterte RDF-Bindungen werden nicht als amtliche Metadaten akzeptiert", () => {
    for (const alter of [x => { delete x.ojIdentity; }, x => { x.html = literal("Text"); },
      x => { x.title.type = "uri"; }, x => { x.title["xml:lang"] = "en"; },
      x => { x.title.datatype = XSD + "date"; }, x => { x.celex.datatype = XSD + "integer"; },
      x => { x.published.datatype = XSD + "string"; }, x => { x.work.datatype = ""; },
      x => { x.title.extra = "Text"; }]) {
      const x = row(); alter(x); assert.throws(() => parse([x]), /eurlex-cellar/);
    }
  });
  await test("Originalidentitaet, echtes Datum und Lesemetadaten sind strikt gebunden", () => {
    for (const alter of [x => { x.work.value = "https://example.org/werk"; },
      x => { x.work.value += "?q=1"; }, x => { x.ojIdentity.value = x.ojIdentity.value.replace("/L_", "/C_"); },
      x => { x.ojIdentity.value = x.ojIdentity.value.replace("2026", "2025"); },
      x => { x.celex.value = "fremde-Kennung"; }, x => { x.celex.value = "32026D2505&html=1"; },
      x => { x.published.value = "2026-11-16"; }, x => { x.published.value = "2026-11-01"; },
      x => { x.published.value = "2026-02-30"; }, x => { x.published.value = "2026-11-13T12:00:00Z"; },
      x => { x.title.value = "<p>Kein Titel</p>"; }, x => { x.title.value = ""; },
      x => { x.title.value = "x".repeat(4001); }, x => { x.title.value = "Titel\u0000"; }]) {
      const x = row(); alter(x); assert.throws(() => parse([x]), /eurlex-cellar/);
    }
  });
  await test("Widerspruechliche Titel, Daten und Originalzuordnungen brechen die Antwort ab", () => {
    for (const alter of [x => { x.title.value = "Anderer amtlicher Titel"; },
      x => { x.published.value = "2026-11-12"; }, x => { x.work.value = row(fixtures[1]).work.value; }]) {
      const conflict = row(); alter(conflict); assert.throws(() => parse([row(), conflict]), /widerspruch/);
    }
    const conflict = row(fixtures[1]); conflict.ojIdentity = row().ojIdentity;
    assert.throws(() => parse([row(), conflict]), /widerspruch/);
  });
  await test("Herkunftspruefer weist nachtraegliche URL-, Datums- und Umfangserweiterung zurueck", () => {
    const item = parse()[0];
    for (const url of [item.url.replace("eur-lex.europa.eu", "example.org"), item.url + "&x=1",
      item.url + "#text", item.url.replace("/DE/", "/EN/"), item.url.replace("32026D2505", "32026D2510")])
      assert(!C.validiereHerkunft(item.cellar, url, item.publishedAt));
    for (const publishedAt of [null, "2026-11-12T00:00:00Z", "2026-11-13T12:00:00Z", "2026-11-13"])
      assert(!C.validiereHerkunft(item.cellar, item.url, publishedAt));
    assert(C.validiereHerkunft(item.cellar, item.url, "2026-11-13T00:00:00+00:00"));
    assert(!C.validiereHerkunft({ ...item.cellar, text: "Volltext" }, item.url, item.publishedAt));
    assert(!C.validateMetadata({ ...item, author: "Erfundener Autor" }));
  });
  await test("Transport ist injiziert, einmalig, hostgebunden und fordert den echten HTTP-Status", async () => {
    let calls = 0;
    const items = await C.crawl({ now, fetchUrl: async (url, depth, options) => {
      calls++; assert.equal(depth, 0); assert.deepEqual(options, { allowedHost: "publications.europa.eu", meldeStatus: true });
      const target = new URL(url); assert.equal(target.origin + target.pathname, C.ENDPOINT);
      assert.equal(target.searchParams.get("format"), "application/sparql-results+json");
      assert.equal(target.searchParams.get("query"), C.buildQuery(now));
      return { status: 200, body: body(), finalUrl: url };
    } });
    assert.equal(calls, 1); assert.equal(items.length, 3);
    await assert.rejects(C.crawl({ now }), /transport/);
  });
  await test("Kein Retry bei fremder Antwort, Challenge-Status oder unbekanntem Transportausgang", async () => {
    for (const response of [{ status: 202, body: "<html>challenge</html>" },
      { status: 200, body: body(), finalUrl: "https://example.org" }, { body: body() }]) {
      let calls = 0;
      await assert.rejects(C.crawl({ now, fetchUrl: async () => { calls++; return response; } }), /eurlex-cellar|HTTP/);
      assert.equal(calls, 1);
    }
    const original = new Error("HTTP 503 technical"); original.statusCode = 503;
    let calls = 0;
    await assert.rejects(C.crawl({ now, fetchUrl: async () => { calls++; throw original; } }), error => error === original);
    assert.equal(calls, 1);
  });
  console.log(`\n${passed}/${passed} CELLAR-Pruefgruppen bestanden; kein Netz, keine DB, kein Modell.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
