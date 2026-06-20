const crypto = require("crypto");
const http = require("http");
const https = require("https");
const { getSources, updateSourceLastCrawled } = require("./storage");
const fetchTimeoutMs = Number(process.env.CRAWLER_TIMEOUT_MS || 7000);

async function crawlAllSources(sources = null) {
  if (!sources) sources = await getSources();
  const activeSources = sources.filter((source) => source.active);
  const results = await Promise.all(activeSources.map(async (source) => {
    try {
      const items = await crawlSource(source);
      await updateSourceLastCrawled(source.id);
      return { sourceId: source.id, sourceName: source.name, ok: true, itemCount: items.length, items };
    } catch (error) {
      console.error(`Crawl failed for ${source.name}`, error);
      return { sourceId: source.id, sourceName: source.name, ok: false, itemCount: 0, items: [], error: error.message };
    }
  }));

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

  for (const feedUrl of candidates) {
    try {
      const entries = await parseRssFeed(feedUrl);
      if (entries.length) {
        const normalized = entries.map((entry) => normalizeRawItem(entry, source));
        return enrichPersonArticleImages(normalized, source);
      }
      errors.push(`${feedUrl}: empty feed`);
    } catch (error) {
      errors.push(`${feedUrl}: ${error.message}`);
    }
  }

  try {
    const page = await fetchHtmlPage(source.url);
    return page && !isGenericHtmlPage(page, source) ? [normalizeRawItem(page, source)] : [];
  } catch (error) {
    errors.push(`html: ${error.message}`);
    throw new Error(errors.join("; "));
  }
}

async function enrichPersonArticleImages(items, source) {
  if (source.type !== "person") return items;
  const terms = source.queryTerms || [source.name];
  const enriched = [];
  for (const item of items) {
    const articleUrl = await resolveArticleUrl(item.url);
    const itemWithResolvedUrl = articleUrl && articleUrl !== item.url ? { ...item, url: articleUrl, originalUrl: item.url } : item;
    if (itemWithResolvedUrl.imageUrl || !hasAnyLooseTerm(`${itemWithResolvedUrl.title} ${itemWithResolvedUrl.content}`, terms)) {
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

async function resolveArticleUrl(url) {
  if (!isGoogleNewsUrl(url)) return url;
  try {
    const page = await fetchUrl(url);
    if (page.finalUrl && !isGoogleNewsUrl(page.finalUrl) && !isGoogleSearchUrl(page.finalUrl)) return page.finalUrl;
    const decoded = extractPublisherUrl(page.body);
    return decoded || url;
  } catch {
    return url;
  }
}

function extractPublisherUrl(html) {
  const text = String(html || "");
  const metaRefresh = text.match(/http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"']+)["']/i);
  const candidates = [
    metaRefresh?.[1],
    ...Array.from(text.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)).map((match) => match[1]),
    ...Array.from(text.matchAll(/"(https?:\/\/[^"]+)"/gi)).map((match) => match[1])
  ].filter(Boolean).map((value) => decodeHtml(value).replace(/\\u003d/g, "=").replace(/\\u0026/g, "&"));
  return candidates.find((candidate) => /^https?:\/\//i.test(candidate) && !isGoogleNewsUrl(candidate) && !isGoogleSearchUrl(candidate) && !candidate.includes("gstatic.com")) || "";
}

function hasAnyLooseTerm(value, terms) {
  const text = String(value || "").toLowerCase();
  return (terms || []).some((term) => {
    const normalized = String(term || "").toLowerCase().trim();
    return normalized && text.includes(normalized);
  });
}

async function parseRssFeed(url) {
  const xml = await fetchText(url);
  if (!/<(rss|feed|item|entry)[\s>]/i.test(xml)) return [];
  const itemMatches = Array.from(xml.matchAll(/<item[\s\S]*?<\/item>/gi)).map((match) => match[0]);
  const entryMatches = Array.from(xml.matchAll(/<entry[\s\S]*?<\/entry>/gi)).map((match) => match[0]);
  const blocks = itemMatches.length ? itemMatches : entryMatches;

  return blocks.slice(0, 20).map((block) => ({
    title: readTag(block, "title"),
    url: readTag(block, "link") || readAttribute(block, "link", "href") || readTag(block, "guid"),
    content: readTag(block, "description") || readTag(block, "summary") || readTag(block, "content") || readTag(block, "content:encoded"),
    publishedAt: readTag(block, "pubDate") || readTag(block, "published") || readTag(block, "updated"),
    author: readTag(block, "author") || readTag(block, "dc:creator"),
    imageUrl: readRssImage(block)
  })).filter((item) => item.title && item.url);
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
  const url = data.url || source.url;
  const content = cleanText(stripHtml(data.content || title));
  const excerpt = content.slice(0, 240);
  const hashDate = data.publishedAt ? publishedAt : "undated";
  const hash = crypto.createHash("sha256").update(`${title}|${url}|${hashDate}`).digest("hex");

  return {
    id: `raw-${hash.slice(0, 16)}`,
    sourceId: source.id,
    sourceName: source.name,
    sourceType: source.type,
    sourceUrl: source.url,
    title,
    url,
    originalUrl: data.originalUrl || "",
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

async function fetchUrl(url) {
  return new Promise((resolve, reject) => {
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
          fetchUrl(nextUrl).then(resolve).catch(reject);
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
  fetchText
};
