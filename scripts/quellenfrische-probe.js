"use strict";

// Isolierte Eingabeprobe. Keine Storage Funktion, kein Modell, kein Import.
// URLs kommen nur aus dem vorhandenen Katalog; ausdruecklich maximal zwei
// direkte neutrale RSS Quellen. Keine Ersatzadresse, Weiterleitung oder Retry.
const crypto = require("node:crypto");
const { parseRssItems, normalizeRawItem } = require("../lib/helmut/crawler");
const D = require("../lib/helmut/dedup");
const E = require("../lib/helmut/quellen-auszug");
const Q = require("../lib/helmut/lage-quellenbeleg");
const MAX_BYTES = 1024 * 1024;
const MAX_ITEMS = 16;
const MAX_AGE_MS = 48 * 60 * 60 * 1000;
const TIMEOUT_MS = 15000;
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
function fordere(value, reason) { if (!value) throw new Error(reason); }

function auswahl(ids, katalog = require("../lib/helmut/sources").v1Sources) {
  fordere(Array.isArray(ids) && ids.length > 0 && ids.length <= 2
    && new Set(ids).size === ids.length && ids.every(id => typeof id === "string"), "auswahl-ungueltig");
  return ids.map(id => {
    const found = katalog.filter(s => s.id === id);
    fordere(found.length === 1, "quelle-nicht-eindeutig");
    const s = found[0];
    fordere(s.active === true && s.neutral === true && s.crawlMethod === "rss", "quelle-nicht-freigegeben");
    let u;
    try { u = new URL(s.rssUrl); } catch { throw new Error("feed-url-ungueltig"); }
    fordere(u.protocol === "https:" && !u.username && !u.password && !u.port
      && !/(?:^|\.)google\./i.test(u.hostname) && !/(?:^|\.)news\.google\./i.test(u.hostname), "kein-direkter-feed");
    return { ...s, rssUrl: u.href };
  });
}

async function leseBody(response) {
  fordere(response.status === 200 && response.body?.getReader, "feed-http-nicht-bestaetigt");
  const length = response.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) {
    await response.body.cancel(); throw new Error("feed-zu-gross");
  }
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      fordere(bytes <= MAX_BYTES, "feed-zu-gross");
      chunks.push(Buffer.from(next.value));
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}

function bewerte(xml, source, now) {
  const parsed = parseRssItems(xml, MAX_ITEMS);
  const rows = [], rejected = [];
  for (let index = 0; index < parsed.length; index++) {
    const item = parsed[index];
    const published = Date.parse(item.publishedAt || "");
    let grund = !Number.isFinite(published) ? "publikationszeit-fehlt"
      : published > now.getTime() ? "publikationszeit-zukuenftig"
      : now.getTime() - published > MAX_AGE_MS ? "quelle-zu-alt" : null;
    if (grund) { rejected.push({ index, grund }); continue; }
    const normalized = normalizeRawItem(item, source);
    normalized.retrievedAt = now.toISOString();
    const row = E.geleseneQuelle({ ...D.toRawDocumentRow(normalized), quellenauszug_beleg: null });
    if (row.link_type !== "direct" || !Q.artikelUrl(row.url)) grund = "artikeladresse-fehlt";
    else if (!row.summary || E.satzpraefix(row.summary) !== row.summary) grund = "ganzer-auszug-fehlt";
    if (grund) rejected.push({ index, grund });
    else rows.push(row);
  }
  return { parseAnzahl: parsed.length, verworfen: rejected, kandidaten: D.dedupeRawDocuments(rows) };
}

async function probe({ ids, katalog, fetchFn = global.fetch, now = () => new Date() }) {
  const sources = auswahl(ids, katalog);
  const start = now();
  fordere(Number.isFinite(start.getTime()), "zeit-ungueltig");
  const feeds = [];
  for (const source of sources) {
    try {
      const response = await fetchFn(source.rssUrl, { method: "GET", redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: "application/rss+xml,application/xml,text/xml" } });
      const xml = await leseBody(response);
      const result = bewerte(xml, source, start);
      feeds.push({ sourceId: source.id, url: source.rssUrl, http: 200, bodyHash: hash(xml),
        ok: result.kandidaten.length > 0, ...result });
    } catch (error) {
      // Transportfehler enthalten moeglicherweise fremde URL Fragmente.
      const bekannt = new Set(["feed-http-nicht-bestaetigt", "feed-zu-gross"]);
      feeds.push({ sourceId: source.id, url: source.rssUrl, ok: false,
        grund: bekannt.has(error.message) ? error.message : "feed-abruf-fehlgeschlagen", kandidaten: [] });
    }
  }
  const kandidaten = D.dedupeRawDocuments(feeds.flatMap(f => f.kandidaten));
  return { version: 1, startedAt: start.toISOString(), finishedAt: now().toISOString(),
    reinLesend: true, productionZugang: false, modellaufrufe: 0, importiert: 0,
    maxAbrufe: sources.length, maxItemsJeFeed: MAX_ITEMS, frischeStunden: 48,
    keineArtikelabrufe: true, keineRetries: true, funktionsnachweis500: false,
    ok: feeds.every(f => f.ok), feeds, kandidaten,
    kandidatenHash: hash(JSON.stringify(kandidaten)) };
}

if (require.main === module) {
  (async () => {
    fordere(!process.env.SUPABASE_URL && !process.env.SUPABASE_SERVICE_ROLE_KEY
      && !process.env.HELMUT_CRON_SECRET && !process.env.VERCEL_TOKEN, "nur-ohne-production-zugang");
    const args = process.argv.slice(2);
    fordere(args.length === 2 && args[0] === "--out" && args[1], "ausgabedatei-fehlt");
    const ids = JSON.parse(process.env.HELMUT_QUELLENFRISCHE_IDS || "null");
    const report = await probe({ ids });
    require("node:fs").writeFileSync(args[1], JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ok: report.ok, feeds: report.feeds.map(f => ({ sourceId: f.sourceId,
      ok: f.ok, grund: f.grund, parseAnzahl: f.parseAnzahl, verworfen: f.verworfen,
      kandidaten: f.kandidaten.length })), kandidaten: report.kandidaten.length,
      kandidatenHash: report.kandidatenHash, importiert: 0, modellaufrufe: 0, funktionsnachweis500: false }));
    if (!report.ok) process.exitCode = 1;
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { auswahl, leseBody, bewerte, probe, MAX_BYTES, MAX_ITEMS };
