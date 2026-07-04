const crypto = require("crypto");
const http = require("http");
const https = require("https");
const { getSources } = require("./storage");
const { contentHash: canonicalContentHash } = require("./dedup");
const fetchTimeoutMs = Number(process.env.CRAWLER_TIMEOUT_MS || 7000);
const crawlConcurrency = Number(process.env.CRAWLER_CONCURRENCY || 20);
const maxCrawlCandidates = Number(process.env.HELMUT_CRAWL_MAX_CANDIDATES || 1000);
const defaultGoogleNewsMaxItems = Number(process.env.HELMUT_GOOGLE_NEWS_MAX_ITEMS || 12);
const defaultRssMaxItems = Number(process.env.HELMUT_DIRECT_RSS_MAX_ITEMS || 16);

// Interne Diagnose der Google-News-URL-Auflösung (nur Console/Vercel-Logs,
// bewusst NICHT im Nutzer-UI). Pro Crawl zurückgesetzt.
const resolutionStats = { attempted: 0, resolved: 0, unresolved: 0 };

async function crawlAllSources(sources = null) {
  if (!sources) sources = await getSources();
  resolutionStats.attempted = 0;
  resolutionStats.resolved = 0;
  resolutionStats.unresolved = 0;
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

  const rawItems = limitRawCandidates(deduplicateRawItems(results.flatMap((result) => result.items)), maxCrawlCandidates);
  console.log(`[crawler] Google-News URL-Auflösung: ${resolutionStats.resolved}/${resolutionStats.attempted} aufgelöst, ${resolutionStats.unresolved} ungelöst`);
  return {
    checkedSources: activeSources.length,
    googleUrlResolution: { ...resolutionStats },
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
      const entries = await parseRssFeed(feedUrl, sourceMaxItems(source, feedUrl));
      if (entries.length) {
        const resolvedEntries = await resolveEntryUrls(entries);
        const normalized = resolvedEntries.map((entry) => normalizeRawItem(entry, source));
        collected.push(...await enrichPersonArticleImages(normalized, source));
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

function sourceMaxItems(source, feedUrl = "") {
  const configured = Number(source.maxItems || 0);
  if (Number.isFinite(configured) && configured > 0) return Math.floor(configured);
  return String(feedUrl).includes("news.google.") ? defaultGoogleNewsMaxItems : defaultRssMaxItems;
}

function limitRawCandidates(items, limit) {
  const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 1000;
  return [...items]
    .sort((a, b) => rawCandidateScore(b) - rawCandidateScore(a))
    .slice(0, max);
}

function rawCandidateScore(item) {
  const sourcePriority = Number(item?.sourcePriority || item?.priority || 0);
  const confidence = item?.confidence === "high" ? 30 : item?.confidence === "medium" ? 15 : 0;
  const link = item?.linkType === "direct" ? 20 : 0;
  const recency = Math.max(0, 14 - Math.floor((Date.now() - new Date(item?.publishedAt || item?.retrievedAt || 0).getTime()) / (24 * 60 * 60 * 1000)));
  return sourcePriority + confidence + link + recency;
}

async function resolveEntryUrls(entries) {
  return mapWithConcurrency(entries, 4, async (entry) => {
    if (!isGoogleNewsUrl(entry.url)) return entry;
    resolutionStats.attempted += 1;
    const articleUrl = await resolveArticleUrl(entry.url, entry.title);
    const resolved = Boolean(articleUrl && articleUrl !== entry.url && !isGoogleNewsUrl(articleUrl));
    if (resolved) resolutionStats.resolved += 1;
    else resolutionStats.unresolved += 1;
    return resolved
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
    const googleDecoded = await decodeGoogleNewsPageUrl(page.body, url, title);
    if (isUsableArticleUrl(googleDecoded) && !isLikelyPublisherHomepage(googleDecoded)) return googleDecoded;
    const decoded = extractPublisherUrl(page.body, title);
    return isUsableArticleUrl(decoded) ? decoded : url;
  } catch {
    return url;
  }
}

async function decodeGoogleNewsPageUrl(html, sourceUrl, title = "") {
  const params = googleNewsDecodingParams(html, sourceUrl);
  if (!params.base64 || !params.timestamp || !params.signature) return "";

  const payload = [
    "Fbv4je",
    `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${params.base64}",${params.timestamp},"${params.signature}"]`
  ];
  const body = `f.req=${encodeURIComponent(JSON.stringify([[payload]]))}`;
  // Zwei Versuche: Google drosselt Rechenzentrums-IPs sporadisch, ein zweiter
  // Anlauf holt einen Teil der transienten Fehlschläge zurück.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await postForm("https://news.google.com/_/DotsSplashUi/data/batchexecute", body);
      const decoded = extractGoogleNewsBatchUrl(response.body, title);
      if (decoded) return decoded;
    } catch {
      // nächster Versuch bzw. leeres Ergebnis unten
    }
  }
  return "";
}

function googleNewsDecodingParams(html, sourceUrl) {
  const text = String(html || "");
  const base64FromPage = text.match(/data-n-a-id=["']([^"']+)["']/i)?.[1];
  const timestamp = text.match(/data-n-a-ts=["']([^"']+)["']/i)?.[1];
  const signature = text.match(/data-n-a-sg=["']([^"']+)["']/i)?.[1];
  return {
    base64: base64FromPage || googleNewsToken(sourceUrl),
    timestamp,
    signature
  };
}

function extractGoogleNewsBatchUrl(body, title = "") {
  const text = String(body || "");
  const parts = text.split("\n\n").filter(Boolean);
  const candidates = [];

  for (const part of parts) {
    try {
      const parsed = JSON.parse(part);
      for (const row of parsed) {
        if (!Array.isArray(row) || row[1] !== "Fbv4je" || typeof row[2] !== "string") continue;
        const inner = JSON.parse(row[2]);
        if (typeof inner?.[1] === "string") candidates.push(inner[1]);
      }
    } catch {
      // Google occasionally changes the wrapper; URL extraction below is the fallback.
    }
  }

  candidates.push(
    ...Array.from(text.matchAll(/https?:\\\/\\\/[^"\\]+/gi)).map((match) => match[0].replace(/\\\//g, "/")),
    ...Array.from(text.matchAll(/https?:\/\/[^\s"'<>\\]+/gi)).map((match) => match[0])
  );

  return bestArticleCandidate(
    candidates
      .map((value) => decodeHtml(value).replace(/\\u003d/g, "=").replace(/\\u0026/g, "&").replace(/[),.;]+$/, ""))
      .filter(isUsableArticleUrl),
    title
  );
}

function decodeGoogleNewsArticleUrl(url, title = "") {
  try {
    const token = googleNewsToken(url);
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

function googleNewsToken(url) {
  try {
    const parsed = new URL(String(url || ""));
    return parsed.pathname
      .split("/")
      .filter(Boolean)
      .pop() || "";
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
    // Strukturmuster statt nur "die linke": erkennt den generischen CMS-Titel
    // fuer JEDE Fraktions-Startseite (Der Crawl laeuft quellen-, nicht
    // profilbezogen - ein Profilparameter waere hier ein Architekturwechsel).
    title.includes("start - fraktion ") ||
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
  // Cross-Run-Dedup bevorzugt die kanonische Artikel-URL (unempfindlich gegen
  // Tracking-Parameter UND gegen nachtraegliche Titeleditierungen), sonst
  // normalisierter Titel + Tag (unempfindlich gegen kleine Zeichensetzungs-
  // aenderungen) - dieselbe Logik wie dedup.js (V3), hier fuer den Live-Pfad
  // uebernommen statt eines eigenen, titel-sensiblen Hash-Schemas.
  const hash = canonicalContentHash({ url, publishedAt: data.publishedAt ? publishedAt : "", title })
    || crypto.createHash("sha256").update(`${title}|${hashUrl}|${hashDate}`).digest("hex");

  return {
    id: `raw-${hash.slice(0, 16)}`,
    sourceId: source.id,
    sourceName,
    sourceType: source.type,
    sourceUrl,
    sourcePriority: source.priority || 0,
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

async function postForm(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === "https:" ? https : http;
    const requestOptions = {
      method: "POST",
      hostname: parsed.hostname,
      path: `${parsed.pathname}${parsed.search}`,
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "content-length": Buffer.byteLength(body),
        "user-agent": browserUserAgent(),
        accept: "*/*",
        origin: "https://news.google.com",
        referer: "https://news.google.com/",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin"
      },
      timeout: fetchTimeoutMs
    };
    // TLS-Zertifikatsprüfung bleibt aktiv. Quellen mit defektem/ungültigem
    // Zertifikat schlagen sauber fehl (reject -> per-Source-Fehler im crawlRun
    // protokolliert), statt unsicher (MITM-anfällig) geladen zu werden.

    const request = client.request(requestOptions, (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        responseBody += chunk;
      });
      response.on("end", () => resolve({ body: responseBody, finalUrl: url }));
    });

    request.on("timeout", () => request.destroy(new Error(`Timeout for ${url}`)));
    request.on("error", reject);
    request.write(body);
    request.end();
  });
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
        "user-agent": isGoogleNewsUrl(url) ? browserUserAgent() : "HelmutBot/1.0 political-briefing",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7"
      },
      timeout: fetchTimeoutMs
    };
    // TLS-Zertifikatsprüfung bleibt aktiv (siehe postForm). Kein unsicherer Fetch.
    const request = client.get(
      url,
      requestOptions,
      (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
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

function browserUserAgent() {
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
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
