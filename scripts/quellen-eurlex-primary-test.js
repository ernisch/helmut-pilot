"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const https = require("node:https"), { EventEmitter } = require("node:events");
const C = require("../lib/helmut/crawler"), D = require("../lib/helmut/dedup");
const H = require("../lib/helmut/parlamentsdaten-herkunft");
const source = require("../lib/helmut/quellenarchitektur/seeds/parlamentsdaten-quellen").PARLAMENTSDATEN_QUELLEN[0];
const read = name => fs.readFileSync(path.join(__dirname, "fixtures/parlamentsdaten-20261106", name), "utf8");
const rss = read("eurlex-amtsblatt-l.xml"), nowMs = Date.parse("2026-11-16T07:10:00.000Z");
const metadata = JSON.parse(read("cellar-oj-l-metadaten.json")); metadata.results.bindings = metadata.results.bindings.slice(0, 1);
const metadataBody = JSON.stringify(metadata);
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }

// Echte HTTP-Adapter mit vollstaendig ersetzten Antworten. Kein Socket, kein
// Modell und keine Production-Abhaengigkeit; auch Fehlerstroeme enden explizit.
async function transport(route, fn) {
  const original = https.get, steering = process.env.HELMUT_ANBIETER_STEUERUNG, calls = [];
  process.env.HELMUT_ANBIETER_STEUERUNG = "off";
  https.get = (url, options, callback) => {
    const entry = { url: String(url), options }; calls.push(entry);
    const request = new EventEmitter(); let destroyed = false;
    request.destroy = error => { destroyed = true; request.emit("error", error || Error("mock-aborted")); };
    queueMicrotask(() => {
      if (destroyed) return;
      const answer = route(entry), response = new EventEmitter();
      Object.assign(response, { statusCode: answer.status ?? 200, complete: true,
        headers: { "content-type": answer.mime || "application/xml" }, setEncoding() {}, resume() {},
        destroy() { this.emit("close"); } });
      callback(response); answer.beforeBody?.();
      response.emit("data", answer.body); response.emit("end");
    });
    return request;
  };
  try { await fn(calls); } finally {
    https.get = original;
    if (steering === undefined) delete process.env.HELMUT_ANBIETER_STEUERUNG;
    else process.env.HELMUT_ANBIETER_STEUERUNG = steering;
  }
}
const route = ({ url }) => url === source.url
  ? { status: 202, mime: "text/html", body: "<html>Javascript required</html>" }
  : { mime: "application/sparql-results+json", body: metadataBody };

(async () => {
  await test("Native Funktionsuhr wird am alten RSS-Fehlerweg als echtes CELLAR-Abfragedatum gebunden", async () => {
    await transport(route, async calls => {
      const items = await C.crawlSource(source, { now: () => nowMs, deadlineMs: nowMs + 39000 });
      assert.equal(calls.length, 2); assert.equal(calls[0].url, source.url);
      const query = new URL(calls[1].url).searchParams.get("query");
      assert(query.includes('"2026-11-03"^^xsd:date')); assert(query.includes('"2026-11-16"^^xsd:date'));
      assert.equal(items.length, 1); const doc = D.toRawDocumentRow(items[0]);
      assert.equal(doc.summary, null); assert.equal(H.leseParlamentsdatenHerkunft(doc).version, 2);
      assert.equal(doc.published_at, "2026-11-13T00:00:00.000Z");
      assert.equal(new URL(calls[1].url).origin, "https://publications.europa.eu");
    });
  });
  await test("Alte Aufrufe mit funktionierendem RSS bleiben ohne CELLAR- oder Originalabruf", async () => {
    await transport(() => ({ body: rss }), async calls => {
      const items = await C.crawlSource(source, { now: () => nowMs });
      assert(items.length > 0); assert.deepEqual(calls.map(c => c.url), [source.url]);
      assert.equal(H.leseParlamentsdatenHerkunft(D.toRawDocumentRow(items[0])).version, 1);
    });
  });
  await test("Bereits zugelassene Date-Werte bleiben im CELLAR-Fallback unveraendert gueltig", async () => {
    await transport(route, async calls => {
      const items = await C.crawlSource(source, { now: new Date(nowMs) });
      assert.equal(items.length, 1); assert.equal(calls.length, 2);
    });
  });
  await test("Vorabbruch stoppt vor HTTP, Abbruch im RSS-Fehlerweg verhindert CELLAR-Kindabruf", async () => {
    const before = new AbortController(), first = Error("abbruch-vor-start"); before.abort(first);
    await transport(route, async calls => {
      await assert.rejects(C.crawlSource(source, { abbruchSignal: before.signal }), error => error === first);
      assert.equal(calls.length, 0);
    });
    const during = new AbortController(), second = Error("abbruch-vor-cellar");
    await transport(entry => ({ ...route(entry), beforeBody: () => during.abort(second) }), async calls => {
      await assert.rejects(C.crawlSource(source, { now: () => nowMs, deadlineMs: nowMs + 39000,
        abbruchSignal: during.signal }), error => error === second);
      assert.deepEqual(calls.map(c => c.url), [source.url]);
    });
  });
  console.log(`\n${passed}/${passed} gezielte EUR-Lex-Dispatchgruppen bestanden; kein Netz, keine DB, kein Modell.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
