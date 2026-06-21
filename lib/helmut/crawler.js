const crypto = require("crypto");
const http = require("http");
const https = require("https");
const { getSources } = require("./storage");
const fetchTimeoutMs = Number(process.env.CRAWLER_TIMEOUT_MS || 7000);
const crawlConcurrency = Number(process.env.CRAWLER_CONCURRENCY || 20);

async function crawlAllSources(sources = null) {
  if (!sources) sources = await getSources();
  const activeSources = sources.filter((source) => source.active);
  const results = await mapWithConcurrency(activeSources, crawlConcurrency, async (source) => {
    try {
      const items = await crawlSource(source);
      return { sourceId: source.id, sourceName: source.name, ok: true, itemCount: items.length, items };
    } catch (error) {
      console.error(`Crawl failed for ${source.name}`, error);
      return { sourceId: source.id, sourceName: source.name, ok: false, itemCount: 0, items: [], error: error.message };
    }
  });

  const rawItems = deduplicateRawItems(results.flatMap((result) => result.items));
  return {
    checkedSources: activeSources.length,
    successfulSources: results.filter((result) => result.ok).length,
    failedSources: results.filter((result) => !result.ok).length,
    newCandidateItems: rawItems.length,
    rawItems,
    results
  };
}

async function crawlSource(source) {
  if (source.crawlMethod === "manual") return [];
  if (source.crawlMethod === "html") {
    const page = await fetchHtmlPage(source.url);
    return page && !isGenericHtmlPage(page, source) ? [normalizeRawItem(page, source)] : [];
  }

  const feedUrls = [...(source.rssUrls || []), source.rssUrl].filter(Boolean);
  const candidates = feedUrls.length ? Array.from(new Set(feedUrls)) : [source.url];
  const errors = [];
  const collected = [];

  for (const feedUrl of candidates) {
    try {
      const entries = await parseRssFeed(feedUrl, source.maxItems || (String(feedUrl).includes("news.google.") ? 6 : 12));
      if (entries.length) {
        const resolvedEntries = await resolveEntryUrls(entries);
        const normalized = resolvedEntries.map((entry) => normalizeRawItem(entry, source));
        collected.push(...enrichPersonArticleImages(normalized, source));
        continue;
      }
      errors.push(`${feedUrl}: empty feed`);
    } catch (error) {
      errors.push(`${feedUrl}: ${error.message}`);
    }
  }

  if (collected.length) return deduplicateRawItems(collected);

  try {
    const page = await fetchHtmlPage(source.url);
    return page && !isGenericHtmlPage(page, source) ? [normalizeRawItem(page, source)] : [];
  } catch (error) {
    errors.push(`html: ${error.message}`);
    throw new Error(errors.join("; "));
  }
}

async function resolveEntryUrls(entries) {
  return mapWithConcurrency(entries, 4, async (entry) => {
    if (!isGoogleNewsUrl(entry.url)) return entry;
    const articleUrl = await resolveArticleUrl(entry.url, entry.title);
    return articleUrl && articleUrl !== entry.url
      ? { ...entry, url: articleUrl, originalUrl: entry.url }
      : entry;
  });
}

async function enrichPersonArticleImages(items, source) {
  if (source.type !== "person") return items;
  const terms = source.queryTerms || [source.name];
  const enriched = [];
  for (const item of items) {
    const articleUrl = await resolveArticleUrl(item.url, item.title);
    const itemWithResolvedUrl = articleUrl && articleUrl !== item.url ? { ...item, url: articleUrl, originalUrl: item.url || item.originalUrl } : item;
    if (!hasAnyLooseTerm(`${itemWithResolvedUrl.title} ${itemWithResolvedUrl.content}`, terms)) {
      continue;
    }
    if (itemWithResolvedUrl.imageUrl) {
      enriched.push(itemWithResolvedUrl);
      continue;
    }
    try {
      const html = await fetchText(itemWithResolvedUrl.url);
      const imageUrl = normalizeImageUrl(readMeta(html, "og:image") || readMeta(html, "twitter:image"));
      enriched.push(imageUrl ? { ...itemWithResolvedUrl, imageUrl } : itemWithResolvedUrl);
    } catch {
      enriched.push(itemWithResolvedUrl);
    }
  }
  return enriched;
}

async function resolveArticleUrl(url, title = "") {
  if (!isGoogleNewsUrl(url)) return url;
  const decodedFromUrl = decodeGoogleNewsArticleUrl(url, title);
  if (isUsableArticleUrl(decodedFromUrl) && !isLikelyPublisherHomepage(decodedFromUrl)) return decodedFromUrl;
  try {
    const page = await fetchUrl(url);
    if (isUsableArticleUrl(page.finalUrl) && !isLikelyPublisherHomepage(page.finalUrl)) return page.finalUrl;
    const decoded = extractPublisherUrl(page.body, title);
    return isUsableArticleUrl(decoded) ? decoded : url;
  } catch {
    return url;
  }
}

function decodeGoogleNewsArticleUrl(url, title = "") {
  try {
    const parsed = new URL(String(url || ""));
    const token = parsed.pathname
      .split("/")
      .filter(Boolean)
      .pop();
    if (!token || token.length < 20) return "";
    const padded = token.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(token.length / 4) * 4, "=");
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    const urls = Array.from(decoded.matchAll(/https?:\/\/[^\s"'<>\\\u0000-\u001F]+/gi))
      .map((match) => decodeHtml(match[0]).replace(/[),.;]+$/, ""))
      .filter(isUsableArticleUrl);
    return bestArticleCandidate(urls, title);
  } catch {
    return "";
  }
}

function extractPublisherUrl(html, title = "") {
  const text = String(html || "");
  const metaRefresh = text.match(/http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"']+)["']/i);
  const candidates = [
    metaRefresh?.[1],
    ...Array.from(text.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)).map((match) => match[1]),
    ...Array.from(text.matchAll(/"(https?:\/\/[^"]+)"/gi)).map((match) => match[1])
  ]
    .filter(Boolean)
    .map((value) => decodeHtml(value).replace(/\\u003d/g, "=").replace(/\\u0026/g, "&"))
    .filter(isUsableArticleUrl);
  return bestArticleCandidate(candidates, title);
}

function isUsableArticleUrl(candidate) {
  if (!/^https?:\/\//i.test(String(candidate || ""))) return false;
  try {
    const parsed = new URL(candidate);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    if (isGoogleNewsUrl(candidate) || isGoogleSearchUrl(candidate)) return false;
    if (hostname === "google.com" || hostname.endsWith(".google.com") || hostname.includes("google.")) return false;
    if (hostname.includes("googleapis.com") || hostname.includes("googleadservices.com") || hostname.includes("googlesyndication.com")) return false;
    if (hostname === "www.w3.org" || hostname === "w3.org") return false;
    if (hostname.includes("gstatic.com") || hostname.includes("googleusercontent.com")) return false;
    if (hostname.includes("google-analytics.com") || hostname.includes("googletagmanager.com")) return false;
    if (/\.(js|css|png|jpe?g|webp|gif|svg|ico)(\?|$)/i.test(pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

function bestArticleCandidate(candidates, title = "") {
  const unique = Array.from(new Set(candidates || []));
  if (!unique.length) return "";
  const scored = unique
    .map((url) => ({ url, score: articleCandidateScore(url, title) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.url || "";
}

function articleCandidateScore(url, title = "") {
  if (!isUsableArticleUrl(url)) return 0;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    if (isLikelyPublisherHomepage(url)) return 5;
    let score = 20;
    const segments = pathname.split("/").filter(Boolean);
    score += Math.min(segments.length, 6) * 8;
    if (/\d{4}/.test(pathname)) score += 8;
    if (/article|artikel|news|politik|wirtschaft|presse|meldung|nachricht|deutschland|arbeit|soziales|rente|mindestlohn|tarif/.test(pathname)) score += 10;
    const titleTokens = slugTokens(title);
    const pathText = `${hostname} ${pathname}`.replace(/[-_/]+/g, " ");
    score += titleTokens.filter((token) => pathText.includes(token)).slice(0, 6).length * 8;
    return score;
  } catch {
    return 0;
  }
}

function slugTokens(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9äöüß]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !["eine", "einer", "einen", "oder", "dass", "nicht", "ueber", "über", "wird", "werden", "the"].includes(token))
    .slice(0, 12);
}

function isLikelyPublisherHomepage(value) {
  try {
    const parsed = new URL(String(value || ""));
    const path = parsed.pathname.replace(/\/+$/, "");
    return !path || path === "/" || path.split("/").filter(Boolean).length === 0;
  } catch {
    return false;
  }
}

function hasAnyLooseTerm(value, terms) {
  const text = String(value || "").toLowerCase();
  return (terms || []).some((term) => {
    const normalized = String(term || "").toLowerCase().trim();
    return normalized && text.includes(normalized);
  });
}

async function parseRssFeed(url, maxItems = 20) {
  const xml = await fetchText(url);
  if (!/<(rss|feed|item|entry)[\s>]/i.test(xml)) return [];
  const itemMatches = Array.from(xml.matchAll(/<item[\s\S]*?<\/item>/gi)).map((match) => match[0]);
  const entryMatches = Array.from(xml.matchAll(/<entry[\s\S]*?<\/entry>/gi)).map((match) => match[0]);
  const blocks = itemMatches.length ? itemMatches : entryMatches;

  return blocks.slice(0, maxItems).map((block) => ({
    title: readTag(block, "title"),
    url: readTag(block, "link") || readAttribute(block, "link", "href") || readTag(block, "guid"),
    content: readTag(block, "description") || readTag(block, "summary") || readTag(block, "content") || readTag(block, "content:encoded"),
    publishedAt: readTag(block, "pubDate") || readTag(block, "published") || readTag(block, "updated"),
    author: readTag(block, "author") || readTag(block, "dc:creator"),
    publisherName: readTag(block, "source"),
    publisherUrl: readAttribute(block, "source", "url"),
    imageUrl: readRssImage(block)
  })).filter((item) => item.title && item.url);
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = [];
  const workers = Array.from({ length: Math.max(1, Math.min(limit || 1, items.length || 1)) }, async (_, workerIndex) => {
    for (let index = workerIndex; index < items.length; index += Math.max(1, limit || 1)) {
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchHtmlPage(url) {
  const html = await fetchText(url);
  const title = stripHtml(readTag(html, "title")) || url;
  const description =
    readMeta(html, "description") ||
    stripHtml(html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "")).slice(0, 500);

  return {
    title,
    url,
    content: description,
    publishedAt: new Date().toISOString(),
    author: title,
    imageUrl: readMeta(html, "og:image") || readMeta(html, "twitter:image")
  };
}

function isGenericHtmlPage(page, source) {
  const title = cleanText(page.title).toLowerCase();
  const content = cleanText(page.content).toLowerCase();
  return (
    title === cleanText(source.name).toLowerCase() ||
    title.includes("startseite") ||
    title.includes("homepage") ||
    title.includes("für solidarität und soziale gerechtigkeit") ||
    title.includes("start - fraktion die linke") ||
    title.includes("deutscher gewerkschaftsbund | dgb") ||
    title.includes("ausschuss für arbeit und soziales") ||
    content.includes("hinter diesen worten verbergen sich") ||
    content.includes("stark in arbeit: als deutscher gewerkschaftsbund")
  );
}

function normalizeRawItem(data, source) {
  const publishedAt = toIsoDate(data.publishedAt) || new Date().toISOString();
  const retrievedAt = new Date().toISOString();
  const title = cleanText(data.title);
  const content = cleanText(stripHtml(data.content || title));
  const excerpt = content.slice(0, 240);
  const publisherName = cleanText(data.publisherName);
  const publisherUrl = normalizeSourceUrl(data.publisherUrl);
  const isNewsSearchSource = String(source.url || source.rssUrl || "").includes("news.google.");
  const sourceName = isNewsSearchSource && publisherName ? publisherName : source.name;
  const sourceUrl = isNewsSearchSource && publisherUrl ? publisherUrl : source.url;
  const normalizedUrl = normalizeSourceUrl(data.url);
  const articleUrl = normalizedUrl && isUsableArticleUrl(normalizedUrl) && !isGoogleNewsUrl(normalizedUrl) ? normalizedUrl : "";
  const linkType = classifyLinkType(articleUrl, sourceUrl, normalizedUrl);
  const url = linkType === "direct" ? articleUrl : "";
  const hashDate = data.publishedAt ? publishedAt : "undated";
  const hashUrl = url || normalizedUrl || sourceUrl || source.url;
  const hash = crypto.createHash("sha256").update(`${title}|${hashUrl}|${hashDate}`).digest("hex");

  return {
    id: `raw-${hash.slice(0, 16)}`,
    sourceId: source.id,
    sourceName,
    sourceType: source.type,
    sourceUrl,
    title,
    url,
    originalUrl: data.originalUrl || (normalizedUrl && normalizedUrl !== url ? normalizedUrl : ""),
    linkType,
    linkResolutionNote: linkResolutionNote(linkType),
    content,
    publishedAt,
    retrievedAt,
    author: cleanText(data.author || source.name),
    imageUrl: normalizeImageUrl(data.imageUrl),
    excerpt,
    confidence: confidenceForSource(source),
    hash,
    category: "Crawled Source"
  };
}

function classifyLinkType(articleUrl, sourceUrl, originalUrl) {
  if (articleUrl && !isLikelyPublisherHomepage(articleUrl)) return "direct";
  if (articleUrl) return "publisher";
  if (sourceUrl && !isGoogleNewsUrl(sourceUrl)) return "publisher";
  if (originalUrl && isGoogleNewsUrl(originalUrl)) return "google_proxy";
  return "missing";
}

function linkResolutionNote(linkType) {
  if (linkType === "direct") return "Direkter Artikellink gefunden.";
  if (linkType === "publisher") return "Direkter Artikel nicht sicher auflösbar; Publisher-Quelle hinterlegt.";
  if (linkType === "google_proxy") return "Google-News-Link erkannt, direkter Artikel noch nicht auflösbar.";
  return "Kein belastbarer öffentlicher Link gefunden.";
}

function isGoogleNewsUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    return parsed.hostname.includes("news.google.") || parsed.hostname === "news.google.com";
  } catch {
    return false;
  }
}

function isGoogleSearchUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    return parsed.hostname.includes("google.") && parsed.pathname.includes("/search");
  } catch {
    return false;
  }
}

function readRssImage(block) {
  return (
    readAttribute(block, "media:thumbnail", "url") ||
    readAttribute(block, "media:content", "url") ||
    readAttribute(block, "enclosure", "url") ||
    readFirstImage(block)
  );
}

function readFirstImage(block) {
  const match = block.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? decodeHtml(match[1]) : "";
}

function normalizeImageUrl(value) {
  const url = String(value || "").trim();
  if (!/^https?:\/\//i.test(url)) return "";
  if (/\.(mp3|mp4|m4a|pdf)(\?|$)/i.test(url)) return "";
  return url;
}

function normalizeSourceUrl(value) {
  const url = String(value || "").trim();
  return /^https?:\/\//i.test(url) ? url : "";
}

function deduplicateRawItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.hash)) return false;
    seen.add(item.hash);
    return true;
  });
}

async function fetchText(url) {
  const result = await fetchUrl(url);
  return result.body;
}

async function fetchUrl(url, redirectDepth = 0) {
  return new Promise((resolve, reject) => {
    if (redirectDepth > 6) {
      reject(new Error(`Too many redirects for ${url}`));
      return;
    }
    const client = url.startsWith("https:") ? https : http;
    const requestOptions = {
      headers: {
        "user-agent": "HelmutBot/1.0 political-briefing"
      },
      timeout: fetchTimeoutMs
    };
    if (url.startsWith("https:")) requestOptions.rejectUnauthorized = false;
    const request = client.get(
      url,
      requestOptions,
      (response) => {
        if ([301, 302, 307, 308].includes(response.statusCode) && response.headers.location) {
          response.resume();
          const nextUrl = new URL(response.headers.location, url).toString();
          fetchUrl(nextUrl, redirectDepth + 1).then(resolve).catch(reject);
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          response.resume();
          reject(new Error(`HTTP ${response.statusCode} for ${url}`));
          return;
        }
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => resolve({ body, finalUrl: url }));
      }
    );
    request.on("timeout", () => request.destroy(new Error(`Timeout for ${url}`)));
    request.on("error", reject);
  });
}

function readTag(block, tagName) {
  const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = block.match(pattern);
  return match ? cleanText(stripCdata(match[1])) : "";
}

function readAttribute(block, tagName, attr) {
  const pattern = new RegExp(`<${tagName}[^>]*${attr}=["']([^"']+)["'][^>]*>`, "i");
  const match = block.match(pattern);
  return match ? decodeHtml(match[1]) : "";
}

function readMeta(html, name) {
  const pattern = new RegExp(`<meta[^>]*(?:name|property)=["']${name}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i");
  const match = html.match(pattern);
  return match ? cleanText(match[1]) : "";
}

function stripCdata(value) {
  return value.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "");
}

function stripHtml(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " "));
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function cleanText(value) {
  return decodeHtml(String(value || "")).replace(/\s+/g, " ").trim();
}

function toIsoDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function confidenceForSource(source) {
  if (["ministry", "bundestag", "committee", "party"].includes(source.type)) return "high";
  if (["association", "media", "local"].includes(source.type)) return "medium";
  return "low";
}

module.exports = {
  crawlAllSources,
  crawlSource,
  parseRssFeed,
  fetchHtmlPage,
  normalizeRawItem,
  deduplicateRawItems,
  fetchText,
  resolveArticleUrl
};
