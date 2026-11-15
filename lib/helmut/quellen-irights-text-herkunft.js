"use strict";

// Nur die oeffentliche, ausdruecklich am RSS-Text erklaerte Attribution dieser
// einen Quelle. Kein allgemeiner Autoren-/Lizenzspeicher und kein Volltextabruf.
const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const SOURCE_ID = "fach-irights-rss", FEED_URL = "https://irights.info/feed";
const LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/deed.de";
const hash = text => crypto.createHash("sha256").update(String(text)).digest("hex");
const plain = value => require("./quellen-auszug").plain(value);
function date(value) {
  const n = value && Date.parse(value);
  return Number.isFinite(n) ? new Date(n).toISOString() : null;
}
function url(value, host, pattern) {
  if (typeof value !== "string" || value.length > 600) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname === host && !u.username && !u.password
      && !u.port && !u.search && !u.hash && pattern.test(u.pathname) ? u.href : null;
  } catch { return null; }
}
const articleUrl = value => url(value, "irights.info", /^\/artikel\/[a-z0-9-]+\/[1-9][0-9]*$/);
const originalUrl = value => url(value, "open-educational-resources.de", /^\/[a-z0-9-]+\/$/);
function istIrights(value = {}) {
  return [value.id, value.sourceId, value.source_id, value.primary_source_id,
    value.parlamentsdatenHerkunft?.sourceId, value.raw?.parlamentsdatenHerkunft?.sourceId].includes(SOURCE_ID);
}
function istFeed(source = {}) {
  if (source.rssUrls != null && !Array.isArray(source.rssUrls)) return false;
  const urls = [source.url, source.rssUrl, ...(source.rssUrls || [])].filter(Boolean);
  return source.id === SOURCE_ID && urls.length > 0 && urls.every(u => u === FEED_URL);
}
function name(value) {
  return typeof value === "string" && value === plain(value) && value.length <= 100
    && /^[\p{L}][\p{L} .'-]+$/u.test(value) && value.split(" ").length >= 2 ? value : null;
}

// Ausschliesslich ein ganzer Textlizenzabsatz mit der beobachteten Kooperation,
// exakter Autorenuebereinstimmung und zwei passenden, expliziten Lizenz-/Originlinks.
function rssBeleg(item, encoded) {
  if (!articleUrl(item.url) || !date(item.publishedAt) || !name(item.author)) return null;
  const candidates = String(encoded || "").match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || [];
  const grants = candidates.filter(p => /Der Text stammt von/.test(plain(p)));
  if (grants.length !== 1) return null;
  const paragraph = grants[0], text = plain(paragraph).replace(/\s+([,.])/g, "$1");
  const expected = `Hinweis: Dieser Beitrag ist Teil einer Kooperation von iRights.info, dem Deutschen Bildungsserver und OERinfo. Der Text stammt von ${item.author}, steht unter der Lizenz CC BY 4.0 und wurde zunächst bei OERinfo veröffentlicht.`;
  if (text !== expected) return null;
  const links = [...paragraph.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(m => ({ href: m[1], label: plain(m[2]) }));
  const licenses = links.filter(l => l.label === "CC BY 4.0");
  const originals = links.filter(l => l.label === "OERinfo" && originalUrl(l.href));
  if (licenses.length !== 1 || licenses[0].href !== LICENSE_URL || originals.length !== 1
    || !links.some(l => l.href === "https://irights.info/schlagwort/oerinfo" && l.label === "iRights.info")
    || !links.some(l => l.href === "https://www.bildungsserver.de/" && l.label === "Deutschen Bildungsserver")) return null;
  return { version: 1, articleUrl: item.url, titleHash: hash(plain(item.title)),
    publishedAt: date(item.publishedAt), author: item.author, originalUrl: originals[0].href,
    statement: expected, contentHash: hash(plain(item.content)) };
}

function baue(source, item, excerpt) {
  if (!istFeed(source) || !articleUrl(item.url) || !plain(item.title)) return null;
  const base = { version: 1, sourceId: SOURCE_ID, feedUrl: FEED_URL,
    articleUrl: item.url, titleHash: hash(plain(item.title)), publishedAt: date(item.publishedAt) };
  const proof = item.irightsTextBeleg;
  const author = name(proof?.author), origin = originalUrl(proof?.originalUrl);
  const statement = author && `Hinweis: Dieser Beitrag ist Teil einer Kooperation von iRights.info, dem Deutschen Bildungsserver und OERinfo. Der Text stammt von ${author}, steht unter der Lizenz CC BY 4.0 und wurde zunächst bei OERinfo veröffentlicht.`;
  const expected = { version: 1, articleUrl: item.url, titleHash: base.titleHash,
    publishedAt: base.publishedAt, author, originalUrl: origin, statement,
    contentHash: hash(plain(item.content)) };
  if (!base.publishedAt || !author || item.author !== author || !origin
    || !isDeepStrictEqual(proof, expected) || !excerpt)
    return { ...base, scope: "title_link_metadata", rightsReviewRequired: true };
  return { ...base, scope: "licensed_rss_excerpt", author, originalUrl: origin,
    licenseUrl: LICENSE_URL, excerptHash: hash(excerpt) };
}

function lese(value = {}) {
  if (value.parlamentsdatenHerkunft && value.raw?.parlamentsdatenHerkunft
    && !isDeepStrictEqual(value.parlamentsdatenHerkunft, value.raw.parlamentsdatenHerkunft)) return null;
  const m = value.parlamentsdatenHerkunft || value.raw?.parlamentsdatenHerkunft;
  if (!m || m.sourceId !== SOURCE_ID || !istIrights(value)) return null;
  const ids = [value.sourceId, value.source_id, value.primary_source_id].filter(Boolean);
  const urls = [value.url, value.canonical_url].filter(Boolean);
  const dates = [value.publishedAt, value.published_at].filter(v => v != null);
  if (!ids.length || ids.some(v => v !== SOURCE_ID) || !urls.length || urls.some(v => v !== m.articleUrl)
    || !articleUrl(m.articleUrl) || dates.some(v => date(v) !== m.publishedAt)) return null;
  const base = { version: 1, sourceId: SOURCE_ID, feedUrl: FEED_URL, articleUrl: m.articleUrl,
    titleHash: hash(plain(value.title)), publishedAt: dates.length ? date(dates[0]) : null };
  if (m.scope === "title_link_metadata") {
    const expected = { ...base, scope: "title_link_metadata", rightsReviewRequired: true };
    // Ein kopierter offener Hinweis legitimiert ebenfalls keinen Text.
    if (value.summary || (value.content && plain(value.content) !== plain(value.title))) return null;
    return isDeepStrictEqual(m, expected) ? expected : null;
  }
  const author = name(m.author), origin = originalUrl(m.originalUrl);
  const excerpt = value.summary != null ? value.summary : require("./dedup").sourceExcerpt(value);
  const expected = { ...base, scope: "licensed_rss_excerpt", author,
    originalUrl: origin, licenseUrl: LICENSE_URL, excerptHash: hash(excerpt) };
  return base.publishedAt && author && origin && excerpt && isDeepStrictEqual(m, expected) ? expected : null;
}

function hinweis(value) {
  const m = lese(value);
  if (!m) return null;
  const licensed = m.scope === "licensed_rss_excerpt";
  return { sourceId: SOURCE_ID, articleUrl: m.articleUrl, articleTitle: plain(value.title),
    publishedAt: m.publishedAt, scope: m.scope,
    text: licensed
      ? `${m.author}: ${plain(value.title)}. iRights.info; zuerst OERinfo (Kooperation mit Deutschem Bildungsserver). CC BY 4.0.`
      : "iRights.info: Textnutzungsbeleg für diesen Artikel offen.",
    originalUrl: licensed ? m.originalUrl : m.articleUrl,
    originalLabel: licensed ? "Erstveröffentlichung bei OERinfo" : "Originalartikel",
    licenseUrl: licensed ? LICENSE_URL : null,
    changes: licensed ? "Gekürzter RSS-Textauszug; Helmut-Ausgaben werden eigenständig zusammengefasst. Keine Bilder übernommen."
      : "Nur Titel-/Linkmetadaten übernommen; kein Artikeltext." };
}

module.exports = { SOURCE_ID, FEED_URL, LICENSE_URL, istIrights, istFeed, rssBeleg, baue, lese, hinweis };
