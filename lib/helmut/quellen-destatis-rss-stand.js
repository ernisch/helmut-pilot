"use strict";

// Eigener, unveraenderlicher Stand fuer den bereits freigegebenen RSS-Auszug.
// Keine Datumskorrektur an Google-Zeilen, kein HTML-Abruf und kein Schreibpfad.
const { isDeepStrictEqual: same } = require("node:util");
const SOURCE_ID = "fach-destatis-aktuell-rss";
const FEED_URL = "https://www.destatis.de/SiteGlobals/Functions/RSSFeed/DE/RSSNewsfeed/Aktuell.xml";
const LICENSE_URL = "https://www.destatis.de/DE/Service/Impressum/_inhalt.html";
const NAME = "Statistisches Bundesamt — Aktuelles", SCOPE = "licensed_rss_excerpt", MAX = 480;
const hash = value => require("./quellen-lektuerebeleg").hash(value);
const plain = value => require("./quellen-auszug").plain(value);
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join() === keys.slice().sort().join();
const fail = () => { throw Error("destatis-rss-stand-ungueltig"); };
function iso(value) {
  const d = require("./quellen-publikationszeit").publikationszeit(value);
  return d || null;
}
function articleUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname === "www.destatis.de" && !u.username && !u.password
      && !u.port && !u.search && !u.hash && /^\/DE\/Presse\/Pressemitteilungen\/.+\.html$/.test(u.pathname)
      ? u.href : null;
  } catch { return null; }
}
function policyActive() {
  const source = require("./quellenarchitektur/seeds/fach-parteiquellen").ZUSAETZLICHE_QUELLEN.find(s => s.id === SOURCE_ID);
  const p = source?.usagePolicy;
  return source?.url === FEED_URL && source.rightsReviewRequired === false
    && p?.status === "text_excerpts_only" && p.scope === "standard_rss_text_excerpts"
    && p.commercialUseApproved === true && p.fullTextAllowed === false
    && p.imagesAllowed === false && p.aiTrainingAllowed === false
    && p.evidenceUrls?.includes(LICENSE_URL);
}
function sourceApproved(source = {}) {
  const urls = [source.url, source.rssUrl, ...(Array.isArray(source.rssUrls) ? source.rssUrls : [])].filter(Boolean);
  return policyActive() && source.id === SOURCE_ID && urls.length > 0 && urls.every(u => u === FEED_URL)
    && (source.rssUrls == null || Array.isArray(source.rssUrls))
    && (source.crawlMethod == null || source.crawlMethod === "rss")
    && (source.retrievalPathId == null || source.retrievalPathId === "rp-" + SOURCE_ID);
}
function notices(rights) {
  if (!Array.isArray(rights) || rights.some(r => typeof r !== "string" || !(
    /^(?:©\s*)?Statistisches Bundesamt \(Destatis\),?\s*20[0-9]{2}\.?$/.test(plain(r))
    || plain(r) === "Statistisches Bundesamt, Wiesbaden 2019"))) return null;
  return [...new Set(rights.map(plain))].sort();
}
const restricted = text => /(?:CC[- ]BY[- ]NC|nur (?:fuer|für) (?:private|nichtkommerzielle)|nicht.{0,10}kommerziell|keine? (?:Weiterverwendung|Weiterverbreitung)|nur mit (?:schriftlicher )?Genehmigung|all rights reserved|nicht zur Weitergabe|Nutzung.{0,30}untersagt|creativecommons\.org\/licenses\/)/iu.test(text);
function selected(item = {}) {
  if (!articleUrl(item.url) || !iso(item.publishedAt || item.published_at) || !notices(item.rssRights ?? [])) return null;
  const text = plain(item.content), E = require("./quellen-auszug");
  if (restricted(text)) return null;
  const result = E.satzpraefix(text, Math.min(MAX, text.length));
  return result && result.length >= 60 && E.hatOriginalinhalt({ title: item.title, summary: result }) ? result : null;
}
function metadata(item, text, rights) {
  const title = item.title, date = iso(item.publishedAt || item.published_at);
  if (typeof title !== "string" || title !== plain(title) || !title || title.length > 300
    || !articleUrl(item.url) || !date || !text || text !== plain(text) || text.length > MAX
    || selected({ ...item, content: text, rssRights: rights }) !== text) return null;
  const base = { version: 1, sourceId: SOURCE_ID, feedUrl: FEED_URL, scope: SCOPE,
    articleUrl: item.url, title, publishedAt: date, excerptHash: hash(text), rights,
    publisher: "Statistisches Bundesamt (Destatis)", licenseUrl: LICENSE_URL };
  const standHash = hash(["destatis-rss-auszug-v1", base]);
  return { ...base, standHash, provenanceHash: hash({ ...base, standHash }) };
}
function build(source, item) {
  if (!sourceApproved(source)) return null;
  const rights = notices(item.rssRights ?? []), text = selected(item);
  return rights && metadata(item, text, rights);
}
function claimed(value = {}) {
  const proofs = [value.parlamentsdatenHerkunft, value.raw?.parlamentsdatenHerkunft].filter(m => m != null);
  return proofs.some(m => m.sourceId === SOURCE_ID || m.feedUrl === FEED_URL
    || Object.hasOwn(m, "standHash"))
    || proofs.length > 0 && [value.sourceId, value.source_id, value.primary_source_id].includes(SOURCE_ID);
}
function read(value = {}) {
  if (!claimed(value)) return null;
  const m = value.parlamentsdatenHerkunft || value.raw?.parlamentsdatenHerkunft;
  if (!policyActive() || !exact(m, ["version", "sourceId", "feedUrl", "scope", "articleUrl", "title", "publishedAt",
    "excerptHash", "rights", "publisher", "licenseUrl", "standHash", "provenanceHash"])
    || value.parlamentsdatenHerkunft && value.raw?.parlamentsdatenHerkunft
      && !same(value.parlamentsdatenHerkunft, value.raw.parlamentsdatenHerkunft)) return fail();
  const ids = [value.sourceId, value.source_id, value.primary_source_id].filter(v => v != null);
  const dates = [value.publishedAt, value.published_at].filter(v => v != null);
  const canonical = require("./dedup").canonicalizeUrl, urls = [value.url, value.canonical_url].filter(v => v != null);
  const text = value.summary != null ? value.summary : value.content;
  const expected = metadata({ title: m.title, url: m.articleUrl, publishedAt: m.publishedAt }, text, m.rights);
  if (!expected || !same(m, expected) || !ids.length || ids.some(id => id !== SOURCE_ID)
    || !dates.length || dates.some(d => iso(d) !== m.publishedAt) || value.title !== m.title
    || !urls.length || urls.some(u => u !== m.articleUrl && u !== canonical(m.articleUrl))
    || [value.sourceName, value.source_name].filter(v => v != null).some(n => n !== NAME)
    || [value.sourceType, value.source_type].filter(v => v != null).some(t => t !== "official")
    || [value.retrievalPathId, value.raw?.retrievalPathId].filter(v => v != null).some(id => id !== "rp-" + SOURCE_ID)
    || value.content_hash != null && value.content_hash !== m.standHash
    || /^rd-/.test(value.id || "") && value.id !== "rd-" + m.standHash) return fail();
  return m;
}
function text(value) { return read(value) ? (value.summary != null ? value.summary : value.content) : null; }
function contentHash(value) { return read(value)?.standHash || null; }
function notice(value) {
  const m = read(value); if (!m) return null;
  return { sourceId: SOURCE_ID, scope: SCOPE, articleUrl: m.articleUrl, articleTitle: m.title,
    publishedAt: m.publishedAt, text: `Statistisches Bundesamt (Destatis): ${m.title}. Veröffentlicht ${m.publishedAt}.`,
    originalUrl: m.articleUrl, originalLabel: "Original beim Statistischen Bundesamt", licenseUrl: LICENSE_URL,
    changes: "Unverändertes ganzes Satzpräfix des gelieferten RSS-Auszuges; weiterer Artikeltext und Bilder nicht übernommen." };
}
// Reiner Adapter, KEIN Apply: ein alter Archivhash allein ersetzt keinen
// artikelweisen Rechtebeleg. Ein bereits vorliegender amtlicher RSS-Eintrag muss
// denselben Text und dieselben Metadaten unter den aktuellen Grenzen bestaetigen.
function fromArchive(record, { source, finding, item } = {}) {
  try {
    const d = record?.data?.dokument, V = require("./roh-quellenstaende"), D = require("./dedup");
    const hashAlt = record?.data?.quellenHash;
    if (record?.data?.version !== 1 || !/^rd-[a-f0-9]{64}$/.test(d?.id || "")
      || V.standHash(d) !== hashAlt || record.id !== `main-rohstand-${d.id.slice(3)}-${hashAlt}`
      || d.source_id !== SOURCE_ID || d.source_name !== NAME || !sourceApproved(source)
      || finding?.raw_document_id !== d.id || finding.source_id !== SOURCE_ID
      // Weicher optionaler Verweis im bestehenden Finding-Modell. Nur NULL/
      // fehlend ist Altkompatibilitaet; ein widersprechender Wert bleibt gesperrt.
      || finding.retrieval_path_id != null && finding.retrieval_path_id !== "rp-" + SOURCE_ID
      || finding.original_url !== d.url
      || !Number.isFinite(Date.parse(finding.found_at)) || Date.parse(finding.found_at) < Date.parse(d.published_at)
      || d.url !== item?.url || d.title !== item.title || iso(d.published_at) !== iso(item.publishedAt)
      || d.summary !== selected(item) || D.canonicalizeUrl(d.url) !== d.canonical_url
      || d.id !== "rd-" + D.contentHash(d) || d.content_hash != null && d.content_hash !== D.contentHash(d)
      || d.raw?.retrievalPathId != null && d.raw.retrievalPathId !== "rp-" + SOURCE_ID
      || Object.keys(d.raw || {}).some(k => !["sourcePriority", "originalUrl", "retrievalPathId"].includes(k))) return null;
    const proof = build(source, item); if (!proof) return null;
    return { sourceId: SOURCE_ID, sourceName: NAME, sourceType: "official", title: d.title, url: d.url,
      publishedAt: proof.publishedAt, retrievedAt: d.retrieved_at, content: d.summary,
      confidence: d.confidence, linkType: d.link_type, parlamentsdatenHerkunft: proof,
      retrievalPathId: "rp-" + SOURCE_ID, imageUrl: null, author: "Statistisches Bundesamt (Destatis)" };
  } catch { return null; }
}
module.exports = { SOURCE_ID, FEED_URL, NAME, SCOPE, MAX, policyActive, sourceApproved, build, claimed, read,
  text, contentHash, notice, fromArchive };
