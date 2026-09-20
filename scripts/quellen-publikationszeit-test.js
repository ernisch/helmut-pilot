"use strict";
const assert = require("node:assert/strict");
const http = require("node:http");
const C = require("../lib/helmut/crawler");
const D = require("../lib/helmut/dedup");
const G = require("../lib/helmut/quellenarchitektur/dedup-global");
const DIP = require("../lib/helmut/dip");
const S = require("../lib/helmut/scheduler");
const Z = require("../lib/helmut/quellen-zeitvertrag");
const U = require("../lib/helmut/understanding");
const L = require("../lib/helmut/lage-quellenbeleg");
const P = require("./quellenfrische-probe");
const { publikationszeit } = require("../lib/helmut/quellen-publikationszeit");
const source = { id: "synthetisch-datum", name: "Testredaktion", type: "media", url: "https://example.org/feed" };
const item = { title: "Ausschuss legt Bericht vor", url: "https://example.org/nachrichten/bericht",
  content: "Der Bericht nennt Kosten von zehn Millionen Euro. Der Ausschuss hat noch keinen Beschluss gefasst." };
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
function row(publishedAt) { return D.toRawDocumentRow(C.normalizeRawItem({ ...item, publishedAt }, source)); }
function lage(doc) { return L.baueEingabe([{ vorgang_id: "vg-datum" }], { "vg-datum": [doc] }, new Date("2026-04-12T12:00:00Z")); }

(async () => {
  await test("Ganze gelieferte ISO und RSS Publikationsdaten bleiben verwendbar", () => {
    const cases = [
      ["2026-04-12", "2026-04-12T00:00:00.000Z"],
      ["2026-04-12T10:00:00Z", "2026-04-12T10:00:00.000Z"],
      ["2026-04-12T12:00+02:00", "2026-04-12T10:00:00.000Z"],
      ["Sun, 12 Apr 2026 12:00:00 +0200", "2026-04-12T10:00:00.000Z"],
      ["12 Apr 2026 10:00 GMT", "2026-04-12T10:00:00.000Z"],
      ["Thu, 29 Feb 2024 10:00:00 UTC", "2024-02-29T10:00:00.000Z"]
    ];
    for (const [input, expected] of cases) assert.equal(publikationszeit(input), expected, input);
  });
  await test("Unmoegliche oder uneindeutige Datumsangaben erzeugen keine Zeit", () => {
    for (const bad of [null, undefined, "", 12, "12", "04/12/26", "12 Apr 26 10:00 GMT",
      "2026-02-30T12:00:00Z", "2026-02-29", "Mon, 30 Feb 2026 12:00:00 GMT",
      "Mon, 12 Apr 2026 10:00:00 GMT", "12 Apr 2026 24:00 GMT", "12 Apr 2026 12:99 GMT",
      "12 Apr 2026 10:00 +0260", "12 Apr 2026 10:00", "2026-04-12T10:00:00",
      "ungueltiges Datum", "2026-04-12T10:00:00+24:00"])
      assert.equal(publikationszeit(bad), null, String(bad));
  });
  await test("Normalisierung und globale Neuanlage erfinden bei fehlendem Datum keine Publikation", () => {
    for (const date of [undefined, "", "ungueltiges Datum", "2026-02-30T12:00:00Z"]) {
      const normalized = C.normalizeRawItem({ ...item, publishedAt: date }, source);
      assert.equal(normalized.publishedAt, null);
      assert(Z.publikationsdatum(normalized.retrievedAt));
      const doc = D.toRawDocumentRow(normalized);
      assert.equal(doc.published_at, null);
      const plan = G.planDedupWrites([normalized], []);
      assert.equal(plan.persists[0].published_at, null);
      assert.equal(plan.persists[0].summary, item.content);
    }
  });
  await test("Fehlende und ungueltige Zeit bleibt bei wiederholtem Abruf dieselbe Dokumentidentitaet", () => {
    const without = C.normalizeRawItem(item, source);
    for (const publishedAt of ["", "ungueltig", "2026-02-30T12:00:00Z"]) {
      const next = C.normalizeRawItem({ ...item, publishedAt }, source);
      assert.equal(next.id, without.id); assert.equal(next.hash, without.hash);
    }
  });
  await test("Atom Aenderungszeit allein ist keine Erstpublikation", () => {
    const entry = extra => `<feed><entry><title>${item.title}</title><link href="${item.url}"/><summary>${item.content}</summary>${extra}</entry></feed>`;
    const update = "<updated>2026-04-12T11:00:00Z</updated>";
    assert.equal(C.normalizeRawItem(C.parseRssItems(entry(update))[0], source).publishedAt, null);
    const positive = C.parseRssItems(entry(update + "<published>2026-04-10T10:00:00Z</published>"))[0];
    assert.equal(C.normalizeRawItem(positive, source).publishedAt, "2026-04-10T10:00:00.000Z");
  });
  await test("HTML erhaelt ausdrueckliche Publikation, nicht Abruf oder Aenderung", async () => {
    const server = http.createServer((req, res) => {
      const meta = req.url === "/publiziert"
        ? '<meta property="article:published_time" content="2026-04-10T12:00:00+02:00">'
        : '<meta property="article:modified_time" content="2026-04-12T11:00:00Z">';
      res.end(`<html><head><title>${item.title}</title>${meta}<meta name="description" content="${item.content}"></head></html>`);
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const base = `http://127.0.0.1:${server.address().port}`;
      const unknown = C.normalizeRawItem(await C.fetchHtmlPage(base + "/unbekannt"), source);
      const positive = C.normalizeRawItem(await C.fetchHtmlPage(base + "/publiziert"), source);
      assert.equal(unknown.publishedAt, null);
      assert.equal(positive.publishedAt, "2026-04-10T10:00:00.000Z");
      assert.equal(unknown.content, item.content); assert.equal(positive.content, item.content);
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
  await test("DIP Schwesterpfad trennt Datum, Aktualisierung und Abruf", () => {
    const base = { id: "datum-test", titel: item.title, aktualisiert: "2026-04-12T11:00:00Z" };
    for (const datum of [undefined, "", "2026-02-30", "ungueltig"]) {
      const normalized = DIP.normalizeDrucksache({ ...base, datum });
      assert.equal(normalized.date, null);
      for (const primary of [false, true]) {
        const raw = S.dipDocToRawItem(normalized, { primary });
        assert.equal(raw.publishedAt, null); assert(Z.publikationsdatum(raw.retrievedAt));
        assert.equal(D.toRawDocumentRow(raw).published_at, null);
      }
    }
    const positive = DIP.normalizeDrucksache({ ...base, datum: "2026-04-10" });
    assert.equal(S.dipDocToRawItem(positive, { primary: true }).publishedAt, "2026-04-10");
    assert.equal(S.dipDocToRawItem({ ...positive, date: "2026-02-30" }).publishedAt, null);
  });
  await test("Understanding und Lage erhalten Kontext, echte Publikation und unbekannten Zeitanker", () => {
    for (const date of [null, "2026-04-12T10:00:00Z"]) {
      const doc = row(date);
      const prompt = U.buildUnderstandingPrompt({ documents: [doc] });
      const understanding = prompt.split("\n").filter(x => x.startsWith('{"quelle_id":')).map(x => JSON.parse(x))[0];
      const l = lage(doc);
      assert.equal(understanding.veroeffentlichtAm, doc.published_at);
      if (date) {
        assert.equal(l.length, 1);
        assert.equal(l[0].quellenbelege.length, 1);
        assert.equal(l[0].quellenbelege[0].veroeffentlichtAm, doc.published_at);
        assert.equal(l[0].quellenbelege[0].auszug, item.content);
      } else assert.deepEqual(l, [], "Ohne Publikationsdatum kein frischer Lagebeleg");
      assert.equal(understanding.titel, item.title);
      assert.equal(understanding.auszug, item.content);
      assert.equal(understanding.herausgeber, source.name);
      assert.equal(understanding.zeitbezug.publikationsjahr, date ? 2026 : null);
      assert.equal(understanding.zeitbezug.ereignisdatum, null);
      assert(understanding.abgerufenAm);
    }
  });
  await test("Abruf und zukuenftige Publikation geben keinen Frischebonus bei Kandidatenauswahl", () => {
    const fresh = { ...item, id: "belegt", publishedAt: new Date(Date.now() - 86400000).toISOString() };
    const unknown = { ...item, id: "unbekannt", retrievedAt: new Date().toISOString() };
    const future = { ...item, id: "zukuenftig", publishedAt: new Date(Date.now() + 86400000).toISOString() };
    assert.equal(C.limitRawCandidates([unknown, future, fresh], 1)[0].id, "belegt");
  });
  await test("Frischeprobe akzeptiert keine in einen gueltigen Tag verschobene Kalenderangabe", () => {
    const xml = `<rss><channel><item><title>${item.title}</title><link>${item.url}</link><pubDate>Mon, 30 Feb 2026 10:00:00 GMT</pubDate><description>${item.content}</description></item></channel></rss>`;
    const r = P.bewerte(xml, source, new Date("2026-03-02T12:00:00Z"));
    assert.equal(r.kandidaten.length, 0);
    assert.equal(r.verworfen[0].grund, "publikationszeit-fehlt");
  });
  console.log(`quellen-publikationszeit: ${passed}/${passed} erfolgreich`);
})().catch(error => { console.error(error); process.exitCode = 1; });
