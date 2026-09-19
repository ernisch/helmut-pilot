"use strict";
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const P = require("./quellenfrische-probe");
const now = new Date("2026-04-12T12:00:00Z");
const source = { id: "synthetisch-feed", name: "Synthetische Quelle", active: true,
  neutral: true, crawlMethod: "rss", rssUrl: "https://example.org/feed.xml", type: "media" };
function item({ title = "Ausschuss beraet Foerderprogramm", url = "https://example.org/nachricht/foerderung",
  date = "Sun, 12 Apr 2026 10:00:00 GMT", content = "Der Ausschuss beraet einen Antrag zur Foerderung kommunaler Projekte. Ein Beschluss liegt noch nicht vor." } = {}) {
  return `<item><title>${title}</title><link>${url}</link><pubDate>${date}</pubDate><description>${content}</description></item>`;
}
const feed = items => `<rss><channel>${items.join("")}</channel></rss>`;
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
(async () => {
  await test("Keine implizite Gesamtauswahl, Doppelkennung oder dritte Quelle", () => {
    for (const ids of [null, [], [source.id, source.id], ["a", "b", "c"], [42]])
      assert.throws(() => P.auswahl(ids, [source]));
    assert.throws(() => P.auswahl(["unbekannt"], [source]));
    assert.throws(() => P.auswahl([source.id], [source, source]));
  });
  await test("Pausierte, personenbezogene und indirekte Quellen bleiben gesperrt", () => {
    for (const change of [{ active: false }, { neutral: false }, { crawlMethod: "html" },
      { rssUrl: "http://example.org/feed" }, { rssUrl: "https://news.google.com/rss/search?q=probe" },
      { rssUrl: "https://name:pass@example.org/feed" }, { rssUrl: "https://example.org:8443/feed" }])
      assert.throws(() => P.auswahl([source.id], [{ ...source, ...change }]));
  });
  await test("Frischer positiver Fall traegt echte RSS Zeit und ganzen gelieferten Kontext", () => {
    const r = P.bewerte(feed([item()]), source, now);
    assert.equal(r.kandidaten.length, 1); assert.equal(r.verworfen.length, 0);
    assert.equal(r.kandidaten[0].published_at, "2026-04-12T10:00:00.000Z");
    assert.equal(r.kandidaten[0].retrieved_at, now.toISOString());
    assert.equal(r.kandidaten[0].summary, "Der Ausschuss beraet einen Antrag zur Foerderung kommunaler Projekte. Ein Beschluss liegt noch nicht vor.");
    assert.equal(r.kandidaten[0].raw.content, undefined);
  });
  await test("Unbekannte Zeit wird nicht zum heutigen Publikationsdatum erfunden", () => {
    const r = P.bewerte(feed([item({ date: "" }), item({ date: "unbekannt" })]), source, now);
    assert.equal(r.kandidaten.length, 0);
    assert.deepEqual(r.verworfen.map(x => x.grund), ["publikationszeit-fehlt", "publikationszeit-fehlt"]);
  });
  await test("Alte und zukuenftige Meldungen gelten nicht als frische Eingabe", () => {
    const r = P.bewerte(feed([item({ date: "Thu, 09 Apr 2026 10:00:00 GMT" }),
      item({ date: "Mon, 13 Apr 2026 10:00:00 GMT" })]), source, now);
    assert.equal(r.kandidaten.length, 0);
    assert.deepEqual(r.verworfen.map(x => x.grund), ["quelle-zu-alt", "publikationszeit-zukuenftig"]);
  });
  await test("Leerer Kontext, Fragment und fehlender Artikel bleiben abgelehnt", () => {
    const r = P.bewerte(feed([item({ content: "" }), item({ content: "Die Beratung beginnt. Der Ausschuss kann" }),
      item({ url: "https://example.org/" })]), source, now);
    assert.equal(r.kandidaten.length, 0); assert.equal(r.verworfen.length, 3);
  });
  await test("Parserdeckel und Dubletten gelten vor einer moeglichen Importentscheidung", () => {
    const r = P.bewerte(feed(Array.from({ length: 40 }, () => item())), source, now);
    assert.equal(r.parseAnzahl, 16); assert.equal(r.kandidaten.length, 1);
  });
  await test("Nicht XML oder leerer Feed wird nicht zur erfolgreichen Versorgung", () => {
    assert.equal(P.bewerte("<html>Keine Daten</html>", source, now).kandidaten.length, 0);
    assert.equal(P.bewerte(feed([]), source, now).kandidaten.length, 0);
  });
  await test("Groesser Body wird mit und ohne Laengenheader abgebrochen", async () => {
    const big = "x".repeat(P.MAX_BYTES + 1);
    await assert.rejects(P.leseBody(new Response(big)), /feed-zu-gross/);
    await assert.rejects(P.leseBody(new Response("klein", { headers: { "content-length": String(P.MAX_BYTES + 1) } })), /feed-zu-gross/);
    await assert.rejects(P.leseBody(new Response("gesperrt", { status: 403 })), /feed-http/);
  });
  await test("Genau zwei GETs, keine Redirects, Ersatzadressen, Artikelabrufe oder Wiederholungen", async () => {
    const second = { ...source, id: "synthetisch-zwei", rssUrl: "https://example.net/feed.xml" };
    const calls = [];
    const r = await P.probe({ ids: [source.id, second.id], katalog: [source, second], now: () => now,
      fetchFn: async (url, options) => {
        calls.push({ url, options });
        assert.equal(options.method, "GET"); assert.equal(options.redirect, "error");
        assert(options.signal instanceof AbortSignal);
        if (url === source.rssUrl) throw new Error("geheime Transportdetails");
        return new Response(feed([item()]));
      } });
    assert.equal(calls.length, 2); assert.equal(r.ok, false); assert.equal(r.kandidaten.length, 1);
    assert.equal(r.importiert, 0); assert.equal(r.modellaufrufe, 0); assert.equal(r.funktionsnachweis500, false);
    assert(!JSON.stringify(r).includes("geheime Transportdetails"));
  });
  await test("Vorhandener Production Zugang stoppt den CLI vor jedem Abruf", () => {
    const child = spawnSync(process.execPath, [require.resolve("./quellenfrische-probe"), "--out", "/dev/null"], {
      env: { PATH: process.env.PATH, SUPABASE_SERVICE_ROLE_KEY: "synthetisch-kein-secret",
        HELMUT_QUELLENFRISCHE_IDS: JSON.stringify([source.id]) }, encoding: "utf8" });
    assert.equal(child.status, 1); assert.match(child.stderr, /nur-ohne-production-zugang/);
  });
  console.log(`quellenfrische-probe: ${passed}/${passed} erfolgreich`);
})().catch(error => { console.error(error); process.exitCode = 1; });
