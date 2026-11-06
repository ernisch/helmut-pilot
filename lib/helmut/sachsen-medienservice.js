"use strict";

// Öffentlicher Suchweg des amtlichen Medienservice, ausschließlich Metadaten.
// Formular und eigenes Frontend belegen GET, press_releases und page=2.
// Keine Anmeldung, Artikel-/Bildnachladung, Rechtefreigabe oder Aktivierung.
const SOURCE_ID = "sn-regierung-medienservice";
const HOST = "medienservice.sachsen.de";
const ORIGIN = "https://www.medienservice.sachsen.de";
const SOURCE_URL = `${ORIGIN}/medien/news/search.json?search%5Bfilter%5D%5B%5D=press_releases`;
const PARSER = "sachsen-medienservice-json-v1";
const MAX_PAGES = 2;
const MAX_ITEMS = 12;
const MAX_PAGE_BYTES = 256 * 1024;
const MAX_DURATION_MS = 15000;

function isSachsenMedienservice(source = {}) {
  if (source.id === SOURCE_ID) return true;
  try {
    const u = new URL(source.url);
    return u.hostname.replace(/^www\./, "") === HOST && u.pathname === "/medien/news/search.json";
  } catch { return false; }
}

function validateSource(source = {}) {
  if (source.id !== SOURCE_ID || source.url !== SOURCE_URL
    || source.crawlMethod !== "structured_download" || source.type !== "government") {
    throw new Error("sachsen-medienservice-quellenbindung");
  }
}

function pageUrl(page) {
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGES) throw new Error("sachsen-medienservice-seitenlimit");
  return SOURCE_URL + (page === 1 ? "" : `&page=${page}`);
}

function articleUrl(value) {
  if (typeof value !== "string" || !/^(?:https:\/\/www\.medienservice\.sachsen\.de)?\/medien\/news\/[1-9]\d*$/.test(value)) {
    throw new Error("sachsen-medienservice-artikeladresse");
  }
  let u;
  try { u = new URL(value, ORIGIN); } catch { throw new Error("sachsen-medienservice-artikeladresse"); }
  if (u.origin !== ORIGIN || u.username || u.password || u.search || u.hash
    || !/^\/medien\/news\/[1-9]\d*$/.test(u.pathname)
    || !(value.startsWith("/medien/news/") || value.startsWith(ORIGIN + "/medien/news/"))) {
    throw new Error("sachsen-medienservice-artikeladresse");
  }
  return u.href;
}

function plainText(html) {
  // Diese belegten Felder enthalten nur Text; neue HTML-Vorlagen bleiben sichtbar fehlerhaft.
  if (/<[^>]*>/.test(html)) throw new Error("sachsen-medienservice-textvorlage");
  return html.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => {
    const code = n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n);
    if (code < 32 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) throw new Error("sachsen-medienservice-zeichen");
    return String.fromCodePoint(code);
  }).replace(/&(amp|quot|apos|lt|gt|nbsp);/g, (_, key) => ({ amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " })[key])
    .replace(/\s+/g, " ").trim();
}

function publicationDate(value) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4}), (\d{2}):(\d{2}) Uhr$/.exec(value);
  if (!m) throw new Error("sachsen-medienservice-publikationsdatum");
  const [day, month, year, hour, minute] = m.slice(1).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59) {
    throw new Error("sachsen-medienservice-publikationsdatum");
  }
  // Der Anbieter nennt keinen Offset. Kein Date.parse, kein Europe/Berlin erraten,
  // keine UTC-Mitternacht aus dem Kalendertag erzeugen, kein Abrufdatum einsetzen.
  return { original: value, day: `${m[3]}-${m[2]}-${m[1]}`, localTime: `${m[4]}:${m[5]}`, timeZone: null };
}

function exactlyOne(html, pattern) {
  const matches = [...html.matchAll(pattern)];
  if (matches.length !== 1) throw new Error("sachsen-medienservice-teaservorlage");
  return matches[0];
}

function parseSachsenPage(body) {
  if (typeof body !== "string" || Buffer.byteLength(body, "utf8") > MAX_PAGE_BYTES) throw new Error("sachsen-medienservice-antwortgroesse");
  let json;
  try { json = JSON.parse(body); } catch { throw new Error("sachsen-medienservice-json"); }
  if (!json || !Array.isArray(json.teaser) || json.teaser.length > MAX_ITEMS
    || typeof json.disable !== "boolean" || typeof json.up_to_date !== "boolean") {
    throw new Error("sachsen-medienservice-antwortformat");
  }
  const items = json.teaser.map((html) => {
    if (typeof html !== "string" || /<(?:script|style|iframe|object|embed|template)\b/i.test(html)
      || !/^<div class="col teaser-col teaser-media-information">/.test(html)) throw new Error("sachsen-medienservice-teaservorlage");
    const id = exactlyOne(html, /<div class="box teaser" id="box-(\d+)">/g)[1];
    const heading = exactlyOne(html, /<div class="teaser-text"><p class="time">([^<]+)<\/p>([^<]+)<\/div>/g);
    const publisher = plainText(exactlyOne(html, /<div class="box-media-overlay"><p>([^<]+)<\/p><\/div>/g)[1]);
    const url = articleUrl(exactlyOne(html, /<a\b[^>]*\bhref="([^"]+)"[^>]*>Beitrag anzeigen<\/a>/g)[1]);
    const title = plainText(heading[2]);
    if (!publisher || !title || !url.endsWith("/" + id)) throw new Error("sachsen-medienservice-teaseridentitaet");
    return {
      title, url, content: title, author: publisher, publishedAt: null,
      sachsenMedienservice: {
        parser: PARSER, publisherName: publisher, contentKind: "headline_only",
        sourceUrl: SOURCE_URL, articleUrl: url,
        publication: publicationDate(plainText(heading[1]))
      }
    };
  });
  return { items, disable: json.disable, upToDate: json.up_to_date };
}

// Ein einziger enger Speichervertrag für Warteschlange und relationale Erfassung.
// Nur öffentliche Herausgeberorganisation und Datumstext, kein author/Roh-HTML.
function readSachsenMetadata(item = {}) {
  const metadata = item.sachsenMedienservice || item.raw?.sachsenMedienservice;
  if (!metadata) return null;
  const sourceIds = [item.sourceId, item.source_id, item.primary_source_id].filter(Boolean);
  if (!sourceIds.length || sourceIds.some((id) => id !== SOURCE_ID)
    || metadata.parser !== PARSER || metadata.sourceUrl !== SOURCE_URL
    || metadata.contentKind !== "headline_only" || metadata.articleUrl !== articleUrl(item.url)
    || item.publishedAt != null || item.published_at != null
    || typeof metadata.publisherName !== "string" || !metadata.publisherName
    || metadata.publisherName.length > 200 || /[<>\u0000-\u001f]/.test(metadata.publisherName)) {
    throw new Error("sachsen-medienservice-metadatenbindung");
  }
  const publication = publicationDate(metadata.publication?.original);
  if (metadata.publication.day !== publication.day || metadata.publication.localTime !== publication.localTime
    || metadata.publication.timeZone !== null) throw new Error("sachsen-medienservice-metadatenbindung");
  return { parser: PARSER, sourceUrl: SOURCE_URL, articleUrl: metadata.articleUrl,
    publisherName: metadata.publisherName, contentKind: "headline_only", publication };
}

async function crawlSachsenMedienservice(source, { fetchPage, timeoutMs = MAX_DURATION_MS } = {}) {
  validateSource(source);
  if (typeof fetchPage !== "function") throw new Error("sachsen-medienservice-abruf-fehlt");
  const itemLimit = Number.isInteger(source.maxItems) && source.maxItems > 0 ? Math.min(source.maxItems, MAX_ITEMS) : MAX_ITEMS;
  const duration = Number.isFinite(timeoutMs) ? Math.max(1, Math.min(timeoutMs, MAX_DURATION_MS)) : MAX_DURATION_MS;
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error("sachsen-medienservice-zeitbudget")); }, duration);
  });
  try {
    return await Promise.race([deadline, (async () => {
      const items = [], seen = new Set();
      for (let page = 1; page <= MAX_PAGES && items.length < itemLimit; page++) {
        if (controller.signal.aborted) throw new Error("sachsen-medienservice-zeitbudget");
        const url = pageUrl(page);
        const response = await fetchPage(url, controller.signal);
        if (controller.signal.aborted) throw new Error("sachsen-medienservice-zeitbudget");
        if (response?.status !== 200 || response.finalUrl !== url) throw new Error("sachsen-medienservice-antwortbindung");
        const parsed = parseSachsenPage(response.body);
        let added = 0;
        for (const item of parsed.items) {
          if (seen.has(item.url)) continue;
          seen.add(item.url); items.push(item); added++;
          if (items.length >= itemLimit) break;
        }
        if (parsed.disable || !parsed.upToDate || !added) break;
      }
      return items;
    })()]);
  } finally { clearTimeout(timer); }
}

module.exports = { SOURCE_ID, SOURCE_URL, HOST, PARSER, MAX_PAGES, MAX_ITEMS, MAX_DURATION_MS,
  isSachsenMedienservice, parseSachsenPage, crawlSachsenMedienservice, readSachsenMetadata };
