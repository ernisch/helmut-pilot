"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const https = require("node:https"), { EventEmitter } = require("node:events");
const C = require("../lib/helmut/crawler"), D = require("../lib/helmut/dedup");
const H = require("../lib/helmut/parlamentsdaten-herkunft");
const Q = require("../lib/helmut/quellen-eurlex-auszug"), F = require("./fixtures/eurlex-original");
const source = require("../lib/helmut/quellenarchitektur/seeds/parlamentsdaten-quellen").PARLAMENTSDATEN_QUELLEN[0];
const read = name => fs.readFileSync(path.join(__dirname, "fixtures/parlamentsdaten-20261106", name), "utf8");
const rss = read("eurlex-amtsblatt-l.xml"), nowMs = Date.parse("2026-11-16T07:10:00.000Z");
const metadata = JSON.parse(read("cellar-oj-l-metadaten.json")); metadata.results.bindings = metadata.results.bindings.slice(0, 1);
const metadataBody = JSON.stringify(metadata);
const approved = { ...source, active: true, retrievalPathId: "rp-" + source.id, eurlexExcerptApproved: true };
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
const healthyRoute = ({ url }) => {
  if (url === source.url) return { body: rss };
  if (url.startsWith("https://publications.europa.eu/webapi/rdf/sparql?"))
    return { mime: "application/sparql-results+json", body: metadataBody };
  if (url === F.manifestationUri.replace(/^http:/, "https:")) return { mime: "application/rdf+xml", body: F.rdf() };
  if (url === F.itemUrl) return { mime: "application/zip", body: F.zip() };
  throw Error("unexpected-mock-target:" + url);
};
function context() {
  const rows = new Map(), count = { callback: 0, quota: 0 }; let current = nowMs;
  const clone = x => structuredClone(x);
  const env = { HELMUT_QUELLEN_ARBEITSFENSTER: "on", HELMUT_QUELLEN_FENSTER_TAG: "8",
    HELMUT_QUELLEN_SEKUNDEN_TAG: "2400", HELMUT_ORIGINALABRUFE_TAG: "16", HELMUT_SUPABASE_TIMEOUT_MS: "10000" };
  const deps = { now: () => current, deadlineMs: current + 39000, env,
    speicher: {
      lesen: async key => { current += 5; return rows.has(key) ? clone(rows.get(key)) : null; },
      reservieren: async (key, row) => { current += 5; if (rows.has(key)) throw Error("held"); rows.set(key, clone(row)); },
      abschliessen: async (key, id, row) => { current += 5; if (rows.get(key)?.versuchId === id && rows.get(key)?.zustand === "reserviert") rows.set(key, clone(row)); },
      rueckgabeVorAbruf: async (key, row) => { current += 5; if (rows.get(key)?.versuchId === row.versuchId) rows.delete(key); }
    },
    originalReservierung: { reserviere: async args => {
      current += 5; count.quota++; assert.equal(args.menge, 1); assert.equal(args.grenzeTag, 16);
      return { verfuegbar: true, erlaubt: true };
    } }
  };
  return { deps, rows, count, callback: (items, actual, fetchUrl) => {
    count.callback++; assert.equal(actual.id, source.id); return Q.enrich(items, actual, { ...deps, fetchUrl });
  } };
}

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
  await test("Freigegebener nativer Auftrag liest CELLAR und exakt einen Originalabsatz auch bei gesundem RSS", async () => {
    const c = context();
    await transport(healthyRoute, async calls => {
      const result = await C.crawlAllSources([approved], { now: c.deps.now, deadlineMs: c.deps.deadlineMs,
        cellarExcerpt: c.callback });
      assert.equal(c.count.callback, 1); assert.equal(c.count.quota, 1);
      assert.equal(calls.filter(x => x.url === source.url).length, 0);
      assert.equal(calls.filter(x => x.url === F.itemUrl).length, 1);
      assert.equal(result.successfulSources, 1); assert.equal(result.rawItems.length, 1);
      const doc = D.toRawDocumentRow(result.rawItems[0]), proof = H.leseParlamentsdatenHerkunft(doc);
      assert(proof); assert.equal(proof.version, 3); assert.equal(doc.summary, F.excerpt);
      assert.equal(proof.originalTitle, metadata.results.bindings[0].title.value.replace(/\s+/g, " ").trim());
      assert.equal(proof.retrieval.publicationDate, "2026-11-13"); assert.equal(doc.published_at, "2026-11-13T00:00:00.000Z");
      assert.equal(proof.license, "EUR-Lex-legal-documents-reuse"); assert(H.parlamentsdatenQuellenhinweis(doc).text.includes("Europäische Kommission"));
      assert.equal(c.rows.size, 1); assert.equal([...c.rows.values()][0].zustand, "belegt");
    });
  });
  await test("Ohne native Freigabe oder Callback bleibt gesunder RSS exakt der erste und einzige Weg", async () => {
    for (const [actual, callback] of [[{ ...approved, eurlexExcerptApproved: false }, true],
      [{ ...approved, retrievalPathId: "rp-fremd" }, true], [approved, false]]) {
      let enriched = 0;
      await transport(healthyRoute, async calls => {
        const items = await C.crawlSource(actual, { now: () => nowMs,
          ...(callback ? { cellarExcerpt: async value => { enriched++; return value; } } : {}) });
        assert(items.length); assert.equal(enriched, 0); assert.deepEqual(calls.map(c => c.url), [source.url]);
        assert.equal(H.leseParlamentsdatenHerkunft(D.toRawDocumentRow(items[0])).version, 1);
      });
    }
  });
  await test("Inaktive Auszugspolicy schaltet keinen primaeren Originalweg frei", async () => {
    const old = source.usagePolicy.legalExcerptAllowed; source.usagePolicy.legalExcerptAllowed = false;
    try {
      await transport(healthyRoute, async calls => {
        const items = await C.crawlSource(approved, { cellarExcerpt: async () => { throw Error("nicht-aufgerufen"); } });
        assert(items.length); assert.deepEqual(calls.map(c => c.url), [source.url]);
      });
    } finally { source.usagePolicy.legalExcerptAllowed = old; }
  });
  await test("CELLAR-Fehler im nativen Primaerweg bleibt Fehler statt eines RSS-Metadatenerfolgs", async () => {
    let enriched = 0;
    await transport(() => ({ status: 503, mime: "text/plain", body: "temporarily unavailable" }), async calls => {
      await assert.rejects(C.crawlSource(approved, { now: () => nowMs,
        cellarExcerpt: async items => { enriched++; return items; } }), /HTTP 503/);
      assert.equal(enriched, 0); assert.equal(calls.length, 1);
      assert(calls[0].url.startsWith("https://publications.europa.eu/webapi/rdf/sparql?"));
    });
  });
  await test("Echte CELLAR-Leere bleibt leer, ohne alten RSS oder Originaltext ersatzweise einzulesen", async () => {
    const empty = structuredClone(metadata); empty.results.bindings = []; let enriched = 0;
    await transport(() => ({ mime: "application/sparql-results+json", body: JSON.stringify(empty) }), async calls => {
      const items = await C.crawlSource(approved, { now: () => nowMs,
        cellarExcerpt: async values => { enriched++; assert.deepEqual(values, []); return values; } });
      assert.deepEqual(items, []); assert.equal(enriched, 1); assert.equal(calls.length, 1);
    });
  });
  await test("Abbruch vor und nach Originalcallback verhindert weitere Verarbeitung des Primaerwegs", async () => {
    const during = new AbortController(), before = Error("abbruch-vor-original"); let enriched = 0;
    await transport(() => ({ mime: "application/sparql-results+json", body: metadataBody,
      beforeBody: () => during.abort(before) }), async calls => {
      await assert.rejects(C.crawlSource(approved, { now: () => nowMs, deadlineMs: nowMs + 39000,
        abbruchSignal: during.signal, cellarExcerpt: async values => { enriched++; return values; } }), e => e === before);
      assert.equal(enriched, 0); assert.equal(calls.length, 1);
    });
    const after = new AbortController(), reason = Error("abbruch-nach-original");
    await transport(healthyRoute, async calls => {
      await assert.rejects(C.crawlSource(approved, { now: () => nowMs, deadlineMs: nowMs + 39000,
        abbruchSignal: after.signal, cellarExcerpt: async values => { after.abort(reason); return values; } }), e => e === reason);
      assert.equal(calls.length, 1);
    });
  });
  console.log(`\n${passed}/${passed} gezielte EUR-Lex-Dispatchgruppen bestanden; kein Netz, keine DB, kein Modell.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
