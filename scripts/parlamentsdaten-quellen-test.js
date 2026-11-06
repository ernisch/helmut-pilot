"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const https = require("node:https");
const { EventEmitter } = require("node:events");
const { spawnSync } = require("node:child_process");
const C = require("../lib/helmut/crawler");
const D = require("../lib/helmut/dedup");
const G = require("../lib/helmut/quellenarchitektur/dedup-global");
const M = require("../lib/helmut/quellenarchitektur/model");
const S = require("../lib/helmut/sourceSafety");
const { buildCatalog } = require("../lib/helmut/quellenarchitektur/catalog");
const { toCrawlerSource } = require("../lib/helmut/quellenarchitektur/source-mode");
const { resolveProfilePackages } = require("../lib/helmut/quellenarchitektur/profile-packages");
const { v1Sources } = require("../lib/helmut/sources");
const { PARLAMENTSDATEN_QUELLEN: sources } = require("../lib/helmut/quellenarchitektur/seeds/parlamentsdaten-quellen");
const [eurlex, bundespuls] = sources;
const catalog = buildCatalog();
const read = name => fs.readFileSync(path.join(__dirname, "fixtures/parlamentsdaten-20261106", name), "utf8");
const feeds = [read("eurlex-amtsblatt-l.xml"), read("bundespuls-vorgaenge.xml")];
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }

// Echte Abrufkette, vollständig ersetzter Transport. Kein Netz, keine DB, kein Modell.
async function transport(body, status, fn) {
  const original = https.get, steering = process.env.HELMUT_ANBIETER_STEUERUNG, calls = [];
  process.env.HELMUT_ANBIETER_STEUERUNG = "off";
  https.get = (url, options, callback) => {
    calls.push(url);
    const request = new EventEmitter();
    request.destroy = error => request.emit("error", error || new Error("mock-aborted"));
    queueMicrotask(() => {
      const response = new EventEmitter();
      Object.assign(response, { statusCode: status, headers: {}, setEncoding() {}, resume() {}, destroy() {} });
      callback(response);
      response.emit("data", body); response.emit("end");
    });
    return request;
  };
  try { await fn(calls); } finally {
    https.get = original;
    if (steering === undefined) delete process.env.HELMUT_ANBIETER_STEUERUNG;
    else process.env.HELMUT_ANBIETER_STEUERUNG = steering;
  }
}

(async () => {
  await test("Zwei quellengebundene Originalproben vom 06.11.2026, jeweils drei RSS-Items", () => {
    const hashes = ["467680627d9d060d2afef4637a3a6e06a5ff525bf869f3ce9bc35d8ebb0f76b3", "75775dd246a1604e044136e1109e214593af4a7e3fbaef7aeff710be9e64e625"];
    feeds.forEach((xml, i) => {
      assert.equal(crypto.createHash("sha256").update(xml).digest("hex"), hashes[i]);
      assert.equal(C.parseRssItems(xml).length, 3);
    });
  });
  await test("EUR-Lex behält Feed-Publikationsdatum, CELEX-Link und Urheber", () => {
    for (const item of C.parseRssItems(feeds[0])) {
      const raw = C.normalizeRawItem(item, eurlex);
      assert.equal(raw.publishedAt, "2026-11-05T23:00:00.000Z");
      assert(raw.url.includes("uri=CELEX:")); assert(raw.author.includes("Kommission"));
    }
  });
  await test("Bundespuls-DIP-Aktualisierung wird vor Speicherung keine Publikation", () => {
    for (const item of C.parseRssItems(feeds[1])) {
      assert(item.publishedAt, "Originalfeed enthält ein irreführendes RSS-pubDate");
      const raw = C.normalizeRawItem(item, bundespuls);
      assert.equal(raw.publishedAt, null);
      assert.equal(D.toRawDocumentRow(raw).published_at, null);
      assert.equal(G.planDedupWrites([raw], []).persists[0].published_at, null);
      assert.equal(raw.sourceName, bundespuls.name);
    }
  });
  await test("Aktualisierte DIP-Zeit erzeugt keine neue Dokumentidentität oder Abrufdatum als Publikation", () => {
    const item = C.parseRssItems(feeds[1])[0];
    const first = C.normalizeRawItem(item, bundespuls);
    for (const publishedAt of ["Fri, 06 Nov 2026 14:20:27 +0000", undefined, "ungueltig"]) {
      const next = C.normalizeRawItem({ ...item, publishedAt }, bundespuls);
      assert.equal(next.publishedAt, null); assert.equal(next.hash, first.hash);
      assert(next.retrievedAt);
    }
  });
  await test("Datumssonderregel benötigt bekannte Quellen-ID UND alle exakten Feedadressen", () => {
    const item = C.parseRssItems(feeds[1])[0];
    for (const source of [
      { ...bundespuls, id: "anderer-feed" },
      { ...bundespuls, url: "https://bundespuls.de/feed/abstimmung" },
      { ...bundespuls, url: "https://example.org/feed/vorgang" },
      { ...bundespuls, rssUrl: "https://example.org/feed" },
      { ...bundespuls, rssUrls: [bundespuls.url, "https://example.org/feed"] }
    ]) assert.equal(C.normalizeRawItem(item, source).publishedAt, "2026-11-06T13:20:27.000Z");
  });
  await test("Relationaler Crawler-Adapter erhält Datum und Herausgebertyp mit und ohne Legacy-Objekt", () => {
    for (const [i, source] of sources.entries()) {
      const entry = catalog.retrievalPaths.find(p => p.legacy_source_id === source.id);
      const item = C.parseRssItems(feeds[i])[0];
      const expected = C.normalizeRawItem(item, source);
      for (const legacy of [new Map(), new Map([[source.id, source]])]) {
        const raw = C.normalizeRawItem(item, toCrawlerSource(entry, legacy));
        assert.equal(raw.publishedAt, expected.publishedAt);
        assert.equal(raw.sourceType, source.type);
        assert.equal(raw.confidence, expected.confidence);
        assert.equal(D.toRawDocumentRow(raw).source_type, source.type);
        assert.equal(G.planDedupWrites([raw], []).persists[0].source_type, source.type);
      }
    }
  });
  await test("Beide RSS laufen durch die echte Abrufkette ohne zusätzliche Artikelabrufe", async () => {
    for (const [i, source] of sources.entries()) await transport(feeds[i], 200, async calls => {
      const items = await C.crawlSource(source);
      assert.equal(items.length, 3); assert.deepEqual(calls, [source.url]);
      assert(items.every(item => i === 0 ? item.publishedAt !== null : item.publishedAt === null));
    });
  });
  await test("Leere oder fehlerhafte Metadatenfeeds wechseln nicht still auf HTML-Volltext", async () => {
    for (const source of sources) {
      await transport("<rss><channel></channel></rss>", 200, async calls => {
        assert.deepEqual(await C.crawlSource(source), []); assert.deepEqual(calls, [source.url]);
      });
      await transport("nicht erreichbar", 503, async calls => {
        await assert.rejects(C.crawlSource(source), /HTTP 503/); assert.deepEqual(calls, [source.url]);
      });
    }
  });
  await test("HTTP200 mit HTML oder abgeschnittenem RSS ist kein erfolgreicher Leerabruf", async () => {
    for (const source of sources) for (const body of [
      "<html><body>Bitte JavaScript aktivieren</body></html>",
      "<rss><channel>",
      "<rss><channel><item><title>Unvollständig</title></channel></rss>",
      "<rss><channel><item><title>Kein Link</title></item></channel></rss>"
    ]) await transport(body, 200, async calls => {
      await assert.rejects(C.crawlSource(source), /RSS/); assert.deepEqual(calls, [source.url]);
    });
  });
  await test("Neue lange Feedbeschreibungen erweitern die Titelmetadatenübernahme nicht", () => {
    for (const [i, source] of sources.entries()) {
      const item = { ...C.parseRssItems(feeds[i])[0], content: "Zusätzlicher Volltext. ".repeat(500) };
      const raw = C.normalizeRawItem(item, source);
      assert.equal(raw.content, raw.title); assert.equal(raw.excerpt, raw.title.slice(0, 240));
      const other = C.normalizeRawItem(item, { ...source, id: "anderer-feed" });
      assert(other.content.startsWith("Zusätzlicher Volltext."));
    }
  });
  await test("Nur zwei vorbereitete Wege, trotz passendem Profil und Basisbindung inaktiv", async () => {
    assert.equal(sources.length, 2);
    for (const source of sources) {
      assert.equal(source.active, false); assert.equal(source.preparedOnly, true);
      assert.equal(v1Sources.filter(s => s.id === source.id).length, 1);
      const entry = catalog.retrievalPaths.find(p => p.legacy_source_id === source.id);
      assert.equal(entry.status, "paused"); assert.equal(entry.activation_mode, "manual");
      assert.equal(entry.method, "rss"); assert.equal(M.isPathActive(entry, ["pkg-bund-basis"]), false);
      assert.equal(entry.usage_policy.scope, "metadata_only"); assert.equal(entry.usage_policy.fullTextAllowed, false);
    }
    await transport("", 200, async calls => {
      const result = await C.crawlAllSources(sources);
      assert.equal(result.checkedSources, 0); assert.deepEqual(result.rawItems, []);
      assert.deepEqual(result.results, []); assert.deepEqual(calls, []);
    });
  });
  await test("EUR-Lex gehört zur EU-Vertiefung, Bundespuls zur Bundesbasis", () => {
    for (const source of sources) {
      const bound = catalog.packagePaths.filter(p => p.retrieval_path_id === `rp-${source.id}`);
      assert.deepEqual(bound.map(p => p.package_id), source.packageKeys.map(key => `pkg-${key}`));
    }
    assert(resolveProfilePackages({ politische_ebene: "bundestag", ausschuesse: ["Europäische Union"] }).all.includes("fach-europaeische-union"));
    assert(!catalog.unmapped.includes(eurlex.id)); assert(!catalog.unmapped.includes(bundespuls.id));
  });
  await test("Herausgeberrollen trennen amtliches EUR-Lex vom privaten DIP-Aggregator", () => {
    const official = catalog.publishers.find(p => p.canonical_domain === "eur-lex.europa.eu");
    const aggregator = catalog.publishers.find(p => p.canonical_domain === "bundespuls.de");
    assert.equal(official.evidence_role, "official_primary"); assert.equal(official.trust, "hoch");
    assert.equal(aggregator.evidence_role, "aggregator"); assert.equal(aggregator.publisher_type, "aggregator");
    assert.equal(aggregator.trust, "unbekannt"); assert.equal(aggregator.entity_id, null);
    assert.equal(catalog.retrievalPaths.filter(p => p.id === "rp-dip").length, 1);
    assert.equal(catalog.retrievalPaths.find(p => p.id === "rp-dip").activation_mode, "always_on");
  });
  await test("Bundespuls ist weder amtlicher noch unabhängiger journalistischer Faktenbeleg", () => {
    const bp = S.assessDocument({ url: "https://bundespuls.de/vorgang/341273", sourceType: "aggregator" });
    const news = S.assessDocument({ url: "https://www.tagesschau.de/inland/meldung.html" });
    assert.equal(bp.trust, "unbekannt"); assert.equal(bp.category, "unbekannt");
    assert.equal(S.isCriticalClaimConfirmed([bp]), false);
    assert.equal(S.isCriticalClaimConfirmed([bp, news]), false);
    assert.equal(S.isCriticalClaimConfirmed([S.assessDocument({ url: "https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32026R2409" })]), true);
    assert.notEqual(S.assessLink("https://example.europa.eu/").trust, "hoch");
    assert.notEqual(S.assessLink("https://eur-lex.europa.eu.example.org/").trust, "hoch");
  });
  await test("Kurationslimit schneidet vorbereitete Ergänzungen nicht ab", () => {
    const child = spawnSync(process.execPath, ["-e", 'process.stdout.write(JSON.stringify(require("./lib/helmut/sources").v1Sources.map(s=>s.id)))'], {
      cwd: path.join(__dirname, ".."), env: { ...process.env, HELMUT_SOURCE_TARGET: "1" }, encoding: "utf8"
    });
    assert.equal(child.status, 0, child.stderr);
    const ids = JSON.parse(child.stdout);
    for (const source of sources) assert(ids.includes(source.id));
  });
  console.log(`\n${passed}/${passed} Prüfgruppen bestanden; kein Netz, keine DB, kein Modell.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
