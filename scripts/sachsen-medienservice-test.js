"use strict";

// Echte öffentliche JSON-Ausschnitte, ausschließlich Offline-/Fetch-Stubs.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const adapter = require("../lib/helmut/sachsen-medienservice");
const { crawlSource } = require("../lib/helmut/crawler");
const { toRawDocumentRow } = require("../lib/helmut/dedup");
const { mergeIntoDocuments } = require("../lib/helmut/quellenarchitektur/dedup-global");
const { LANDESQUELLEN } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-deutschland");
const { LANDESQUELLEN_PRUEFBELEGE } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-pruefbelege");

const pages = [1, 2].map((n) => fs.readFileSync(path.join(__dirname, "fixtures/landesmodule-20261106", `sachsen-medienservice-page${n}.json`), "utf8"));
const source = LANDESQUELLEN.find((s) => s.id === adapter.SOURCE_ID);
const receipt = LANDESQUELLEN_PRUEFBELEGE.find((r) => r.code === "SN" && r.key === "medienservice");
const first = JSON.parse(pages[0]);
const single = (html) => JSON.stringify({ teaser: [html], disable: true, up_to_date: true });
const sha = (body) => crypto.createHash("sha256").update(body).digest("hex");

async function main() {
  assert.equal(source.url, adapter.SOURCE_URL);
  assert.equal(source.active, false);
  assert.equal(source.preparedOnly, true);
  assert.equal(source.sourceVerification.dateVerified, false);
  assert.equal(source.sourceVerification.rights, "needs_review");
  assert.equal(sha(pages[0]), receipt.sha256);
  assert.equal(sha(pages[1]), receipt.pagination_sample.sha256);
  const parsed = adapter.parseSachsenPage(pages[0]);
  assert.equal(parsed.items.length, 6);
  assert.equal(parsed.items[2].author, "Sächsisches Staatsministerium des Innern");
  assert.equal(parsed.items[2].url, "https://www.medienservice.sachsen.de/medien/news/1100988");
  assert.deepEqual(parsed.items[2].sachsenMedienservice.publication,
    { original: "06.11.2026, 11:31 Uhr", day: "2026-11-06", localTime: "11:31", timeZone: null });
  assert.ok(parsed.items.every((item) => item.publishedAt === null && item.content === item.title));

  for (const badDate of ["31.02.2026, 12:33 Uhr", "29.02.2025, 12:33 Uhr", "06.13.2026, 12:33 Uhr", "06.11.2026, 24:33 Uhr", "06.11.2026, 12:60 Uhr", "11/06/2026, 12:33 Uhr"]) {
    assert.throws(() => adapter.parseSachsenPage(single(first.teaser[0].replace("06.11.2026, 12:33 Uhr", badDate))), /publikationsdatum/);
  }
  for (const localDate of ["29.02.2024, 12:33 Uhr", "29.03.2026, 02:30 Uhr", "25.10.2026, 02:30 Uhr"]) {
    const item = adapter.parseSachsenPage(single(first.teaser[0].replace("06.11.2026, 12:33 Uhr", localDate))).items[0];
    assert.equal(item.sachsenMedienservice.publication.original, localDate);
    assert.equal(item.publishedAt, null, "Auch mehrdeutige lokale Uhrzeiten werden nicht in UTC umgedeutet");
  }
  for (const badUrl of ["https://example.invalid/medien/news/1101011", "//www.medienservice.sachsen.de/medien/news/1101011", "http://www.medienservice.sachsen.de/medien/news/1101011", "https://user@www.medienservice.sachsen.de/medien/news/1101011", "/medien/news/1101011?download=1", "/medien/news/1101011#fragment", "/medien/news/1101011/../1101012", "/medien/news/999/../1101011", "/medien/account", "/medien/news/1101012"]) {
    assert.throws(() => adapter.parseSachsenPage(single(first.teaser[0].replace('href="/medien/news/1101011"', `href="${badUrl}"`))), /artikeladresse|teaseridentitaet/);
  }
  assert.throws(() => adapter.parseSachsenPage("<html>Login</html>"), /json/);
  assert.throws(() => adapter.parseSachsenPage(JSON.stringify({ teaser: "HTML", disable: false, up_to_date: true })), /antwortformat/);
  assert.throws(() => adapter.parseSachsenPage(single(first.teaser[0] + "<script>fremde Daten</script>")), /teaservorlage/);
  assert.throws(() => adapter.parseSachsenPage("x".repeat(256 * 1024 + 1)), /antwortgroesse/);

  const calls = [];
  const fetchStub = async (url, depth, opts) => {
    calls.push({ url, depth, opts });
    assert.equal(depth, 0);
    assert.equal(opts.allowedHost, adapter.HOST);
    assert.equal(opts.meldeStatus, true);
    assert.ok(opts.abbruchSignal instanceof AbortSignal);
    return { body: pages[calls.length - 1], status: 200, finalUrl: url };
  };
  // Tatsächlicher Crawler-Dispatch: structured_download darf nicht im PARDOK-Pfad verschwinden.
  const items = await crawlSource({ ...source, maxItems: 9999 }, { fetchUrl: fetchStub });
  assert.equal(items.length, 12);
  assert.deepEqual(calls.map((c) => c.url), [adapter.SOURCE_URL, adapter.SOURCE_URL + "&page=2"]);
  assert.equal(calls[0].opts.abbruchSignal, calls[1].opts.abbruchSignal, "Gemeinsames hartes Abrufbudget");
  assert.ok(items.every((item) => item.publishedAt === null && item.linkType === "direct"));
  assert.equal(items[2].sourceName, source.name);
  assert.equal(items[2].author, "Sächsisches Staatsministerium des Innern");

  let limitedCalls = 0;
  const repeat = async (url) => { limitedCalls++; return { body: pages[0], status: 200, finalUrl: url }; };
  assert.equal((await crawlSource({ ...source, maxItems: 1 }, { fetchUrl: repeat })).length, 1);
  assert.equal(limitedCalls, 1);
  limitedCalls = 0;
  assert.equal((await crawlSource(source, { fetchUrl: repeat })).length, 6, "Wiederholte Seite nicht doppelt liefern");
  assert.equal(limitedCalls, 2, "Keine unbegrenzte Pagination");
  for (const change of [{ id: "fremd" }, { url: adapter.SOURCE_URL + "&page=2" }, { type: "media" }, { crawlMethod: "rss" }]) {
    await assert.rejects(crawlSource({ ...source, ...change }, { fetchUrl: () => { throw new Error("Darf nicht abrufen"); } }), /quellenbindung/);
  }
  for (const response of [{ status: 302, finalUrl: adapter.SOURCE_URL }, { status: 200, finalUrl: "https://example.invalid/" }, { status: 200, finalUrl: "https://www.medienservice.sachsen.de/medien/account" }]) {
    await assert.rejects(crawlSource(source, { fetchUrl: async () => ({ body: pages[0], ...response }) }), /antwortbindung/);
  }
  let attempts = 0;
  await assert.rejects(crawlSource(source, { fetchUrl: async (url) => {
    if (++attempts === 2) throw new Error("Seite zwei fehlgeschlagen");
    return { body: pages[0], status: 200, finalUrl: url };
  } }), /Seite zwei fehlgeschlagen/, "Keinen Teilabruf als vollständig erfolgreichen Lauf ausgeben");
  let aborted;
  await assert.rejects(crawlSource(source, { sachsenTimeoutMs: 5, fetchUrl: (_url, _depth, opts) => {
    aborted = opts.abbruchSignal; return new Promise(() => {});
  } }), /zeitbudget/);
  assert.equal(aborted.aborted, true, "Zeitbudget bricht vorhandenen HTTP-Pfad ab");

  // Beide echten Speicherprojektionen erhalten nur die geschlossenen Belegfelder.
  const enriched = { ...items[2], raw: { foreign: "nicht speichern" },
    sachsenMedienservice: { ...items[2].sachsenMedienservice, arbitrary: "nicht speichern" } };
  const row = toRawDocumentRow(enriched);
  const global = mergeIntoDocuments([enriched])[0];
  for (const stored of [row, global]) {
    assert.equal(stored.published_at, null);
    assert.deepEqual(stored.raw.sachsenMedienservice, items[2].sachsenMedienservice);
    assert.equal(stored.raw.foreign, undefined);
    assert.equal(stored.raw.sachsenMedienservice.arbitrary, undefined);
    assert.equal(stored.author, undefined);
    assert.equal(stored.content, undefined);
    assert.equal(stored.raw.sachsenMedienservice.contentKind, "headline_only");
  }
  assert.deepEqual(adapter.readSachsenMetadata(row), items[2].sachsenMedienservice);
  assert.deepEqual(adapter.readSachsenMetadata(global), items[2].sachsenMedienservice);
  assert.throws(() => toRawDocumentRow({ ...enriched, sourceId: "fremd" }), /metadatenbindung/);
  assert.throws(() => toRawDocumentRow({ ...enriched, publishedAt: "2026-11-06T00:00:00Z" }), /metadatenbindung/);
  assert.equal(toRawDocumentRow({ ...items[2], sachsenMedienservice: undefined, raw: { foreign: true } }).raw.foreign, undefined);
  console.log("Sachsen Medienservice: Parser, Crawler-Dispatch, Grenzen und beide Speicherprojektionen bestanden.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
