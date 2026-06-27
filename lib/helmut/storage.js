const fs = require("fs");
const path = require("path");
const { v1Sources } = require("./sources");

const dataDir = path.join(__dirname, "..", "..", ".helmut-data");
const dataFile = path.join(dataDir, "store.json");
const supabaseStoreId = process.env.HELMUT_SUPABASE_STORE_ID || "main";

function defaultStore() {
  return {
    sources: v1Sources,
    profiles: {},
    rawItems: [],
    briefings: [],
    crawlRuns: [],
    tasks: [],
    interactions: [],
    topicMemory: [],
    mandateProfiles: {},
    politicalItems: [],
    personalizedRecommendations: [],
    dailyTasks: [],
    communicationDrafts: [],
    userNotes: [],
    priorityChanges: [],
    lageChecks: [],
    pushSubscriptions: [],
    pushEvents: [],
    pipelineDebugReports: [],
    // Auth-Schicht (MVP): bewusst im JSON-Store gekapselt, damit ein spaeterer
    // relationaler Umzug ein Drop-in-Swap bleibt. Identitaet/Rollen/Mandantentrennung
    // werden ausschliesslich serverseitig aus diesen Collections abgeleitet.
    users: [],
    sessions: [],
    assignments: [],
    dailyInputs: [],
    auditEvents: [],
    systemErrors: [],
    adminSettings: {}
  };
}

function useSupabase() {
  return (
    String(process.env.HELMUT_STORAGE_BACKEND || "").trim().toLowerCase() === "supabase" &&
    Boolean(process.env.SUPABASE_URL) &&
    Boolean(supabaseServiceRoleKey())
  );
}

function getStorageStatus() {
  const backend = useSupabase() ? "supabase" : "local";
  return {
    backend,
    supabaseConfigured: Boolean(process.env.SUPABASE_URL && supabaseServiceRoleKey()),
    storeId: supabaseStoreId
  };
}

async function getStoreSummary(politicianId) {
  const store = await readStore();
  const activeSources = (store.sources || []).filter((source) => source.active !== false);
  const rawItems = store.rawItems || [];
  const latestRawItem = sortByDate(rawItems, "retrievedAt", "publishedAt")[0] || null;
  const latestBriefing = (store.briefings || []).find((briefing) => !politicianId || briefing.politicianId === politicianId) || null;
  const recommendations = (store.personalizedRecommendations || []).filter((entry) => !politicianId || entry.user_id === politicianId);
  const tasks = (store.tasks || []).filter((task) => !politicianId || task.politicianId === politicianId);
  const notes = (store.userNotes || []).filter((note) => !politicianId || note.user_id === politicianId);
  const latestPushEvent = (store.pushEvents || []).find((event) => !politicianId || event.politicianId === politicianId) || null;
  const since24h = Date.now() - 24 * 60 * 60 * 1000;

  return {
    backend: getStorageStatus().backend,
    storeId: supabaseStoreId,
    sources: {
      total: (store.sources || []).length,
      active: activeSources.length
    },
    rawItems: {
      total: rawItems.length,
      last24h: rawItems.filter((item) => new Date(item.retrievedAt || item.publishedAt || 0).getTime() >= since24h).length,
      directLinks: rawItems.filter((item) => articleUrlQuality(item.url) === "direct").length,
      missingLinks: rawItems.filter((item) => articleUrlQuality(item.url) !== "direct").length,
      latestAt: latestRawItem?.retrievedAt || latestRawItem?.publishedAt || null
    },
    briefings: {
      total: (store.briefings || []).filter((briefing) => !politicianId || briefing.politicianId === politicianId).length,
      latestId: latestBriefing?.id || null,
      latestStatus: latestBriefing?.status || null,
      latestGeneratedAt: latestBriefing?.generatedAt || latestBriefing?.date || null
    },
    crawlRuns: {
      total: (store.crawlRuns || []).length,
      latestAt: store.crawlRuns?.[0]?.createdAt || null
    },
    lageChecks: {
      total: (store.lageChecks || []).filter((check) => !politicianId || check.politicianId === politicianId).length,
      latestAt: (store.lageChecks || []).find((check) => !politicianId || check.politicianId === politicianId)?.checkedAt || null,
      latestStatus: (store.lageChecks || []).find((check) => !politicianId || check.politicianId === politicianId)?.status || null
    },
    push: {
      subscriptions: (store.pushSubscriptions || []).filter((subscription) => !politicianId || subscription.politicianId === politicianId).length,
      latestEventAt: latestPushEvent?.createdAt || null,
      latestReason: latestPushEvent?.reason || "",
      latestDelivered: latestPushEvent?.delivered || 0
    },
    recommendations: {
      total: recommendations.length,
      active: recommendations.filter((entry) => !["done", "ignored"].includes(entry.status)).length
    },
    tasks: {
      total: tasks.length,
      open: tasks.filter((task) => task.status !== "done").length
    },
    notes: {
      total: notes.length
    },
    debugReports: {
      total: (store.pipelineDebugReports || []).filter((report) => !politicianId || report.politicianId === politicianId).length,
      latestAt: (store.pipelineDebugReports || []).find((report) => !politicianId || report.politicianId === politicianId)?.createdAt || null
    }
  };
}

// Kurzlebiger Lese-Cache fuer den grossen Content-Store. Eine einzelne Anfrage
// (z. B. /api/app/start) liest den mehrere MB grossen Blob sonst mehrfach von
// Supabase (~3,5s pro Lesevorgang) und laeuft ins Zeitlimit. writeStore haelt den
// Cache aktuell, sodass aufeinanderfolgende read-modify-write-Ablaeufe konsistent
// bleiben. Per HELMUT_STORE_CACHE_MS=0 deaktivierbar.
let storeCache = null;
let storeCacheAt = 0;
const storeCacheTtlMs = Number(process.env.HELMUT_STORE_CACHE_MS || 10000);

async function readStore() {
  if (storeCacheTtlMs > 0 && storeCache && Date.now() - storeCacheAt < storeCacheTtlMs) {
    return storeCache;
  }
  const store = useSupabase() ? await readSupabaseStore() : readLocalStore();
  storeCache = store;
  storeCacheAt = Date.now();
  return store;
}

async function writeStore(store) {
  const normalized = compactStore(normalizeStore(store));
  if (useSupabase()) await writeSupabaseStore(normalized);
  else writeLocalStore(normalized);
  storeCache = normalized;
  storeCacheAt = Date.now();
  return normalized;
}

function readLocalStore() {
  if (!fs.existsSync(dataFile)) return defaultStore();
  try {
    return normalizeStore(JSON.parse(fs.readFileSync(dataFile, "utf8")));
  } catch (error) {
    console.error("Helmut storage read failed", error);
    return defaultStore();
  }
}

function writeLocalStore(store) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(store, null, 2));
}

async function readSupabaseStore() {
  const rows = await supabaseRequest(`/rest/v1/helmut_store?id=eq.${encodeURIComponent(supabaseStoreId)}&select=data`);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (row?.data) return normalizeStore(row.data);
  const seeded = defaultStore();
  await writeSupabaseStore(seeded);
  return seeded;
}

async function writeSupabaseStore(store) {
  await supabaseRequest("/rest/v1/helmut_store", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({
      id: supabaseStoreId,
      data: store
    })
  });
  return store;
}

// --- Separater, KLEINER Auth-Store ---
// Performance-kritisch: Accounts/Sessions liegen in einem EIGENEN Dokument (eigene
// Store-Row bzw. eigene lokale Datei), getrennt vom grossen Content-Blob. Sonst
// muesste jeder Login den mehrere MB grossen Haupt-Store komplett lesen + schreiben
// (auf Serverless laeuft das ins Funktions-Zeitlimit). So bleibt Login schnell.
const authStoreId = process.env.HELMUT_SUPABASE_AUTH_STORE_ID || `${supabaseStoreId}-auth`;
const authDataFile = path.join(dataDir, "auth.json");

function defaultAuthStore() {
  return {
    users: [],
    sessions: [],
    assignments: [],
    dailyInputs: [],
    auditEvents: [],
    systemErrors: [],
    adminSettings: {}
  };
}

async function readAuthStore() {
  if (useSupabase()) {
    const rows = await supabaseRequest(`/rest/v1/helmut_store?id=eq.${encodeURIComponent(authStoreId)}&select=data`);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (row?.data) return { ...defaultAuthStore(), ...row.data };
    return defaultAuthStore();
  }
  if (!fs.existsSync(authDataFile)) return defaultAuthStore();
  try {
    return { ...defaultAuthStore(), ...JSON.parse(fs.readFileSync(authDataFile, "utf8")) };
  } catch (error) {
    console.error("Helmut auth store read failed", error);
    return defaultAuthStore();
  }
}

async function writeAuthStore(store) {
  const normalized = { ...defaultAuthStore(), ...store };
  normalized.sessions = (normalized.sessions || []).slice(0, 2000);
  normalized.auditEvents = (normalized.auditEvents || []).slice(0, 1000);
  normalized.systemErrors = (normalized.systemErrors || []).slice(0, 500);
  normalized.dailyInputs = (normalized.dailyInputs || []).slice(0, 2000);
  if (useSupabase()) {
    await supabaseRequest("/rest/v1/helmut_store", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: authStoreId, data: normalized })
    });
    return normalized;
  }
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(authDataFile, JSON.stringify(normalized, null, 2));
  return normalized;
}

async function supabaseRequest(endpoint, options = {}) {
  if (typeof fetch !== "function") {
    throw new Error("Supabase storage needs Node fetch. Use Node 18+ or Vercel runtime.");
  }
  const baseUrl = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceRoleKey = supabaseServiceRoleKey();
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Supabase storage failed (${response.status}): ${body || response.statusText}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function supabaseServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || "";
}

function normalizeStore(store = {}) {
  const parsed = { ...defaultStore(), ...store };
  return {
    ...parsed,
    sources: mergeSources(parsed.sources),
    profiles: parsed.profiles || {},
    rawItems: Array.isArray(parsed.rawItems) ? parsed.rawItems : [],
    briefings: Array.isArray(parsed.briefings) ? parsed.briefings : [],
    crawlRuns: Array.isArray(parsed.crawlRuns) ? parsed.crawlRuns : [],
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    interactions: Array.isArray(parsed.interactions) ? parsed.interactions : [],
    topicMemory: Array.isArray(parsed.topicMemory) ? parsed.topicMemory : [],
    mandateProfiles: parsed.mandateProfiles || {},
    politicalItems: Array.isArray(parsed.politicalItems) ? parsed.politicalItems : [],
    personalizedRecommendations: Array.isArray(parsed.personalizedRecommendations) ? parsed.personalizedRecommendations : [],
    dailyTasks: Array.isArray(parsed.dailyTasks) ? parsed.dailyTasks : [],
    communicationDrafts: Array.isArray(parsed.communicationDrafts) ? parsed.communicationDrafts : [],
    userNotes: Array.isArray(parsed.userNotes) ? parsed.userNotes : [],
    priorityChanges: Array.isArray(parsed.priorityChanges) ? parsed.priorityChanges : [],
    lageChecks: Array.isArray(parsed.lageChecks) ? parsed.lageChecks : [],
    pushSubscriptions: Array.isArray(parsed.pushSubscriptions) ? parsed.pushSubscriptions : [],
    pushEvents: Array.isArray(parsed.pushEvents) ? parsed.pushEvents : [],
    pipelineDebugReports: Array.isArray(parsed.pipelineDebugReports) ? parsed.pipelineDebugReports : [],
    users: Array.isArray(parsed.users) ? parsed.users : [],
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    assignments: Array.isArray(parsed.assignments) ? parsed.assignments : [],
    dailyInputs: Array.isArray(parsed.dailyInputs) ? parsed.dailyInputs : [],
    auditEvents: Array.isArray(parsed.auditEvents) ? parsed.auditEvents : [],
    systemErrors: Array.isArray(parsed.systemErrors) ? parsed.systemErrors : [],
    adminSettings: parsed.adminSettings && typeof parsed.adminSettings === "object" ? parsed.adminSettings : {}
  };
}

// Behaelt die neuesten Eintraege PRO MANDAT (politicianId bzw. user_id), statt
// global zu kappen. Verhindert, dass viele Mandate sich gegenseitig die Daten
// verdraengen. Ein Gesamtlimit deckelt zusaetzlich die Blob-Groesse.
function keepLatestPerOwner(items, primaryDate, fallbackDate, perOwnerLimit, totalLimit) {
  const sorted = sortByDate(items, primaryDate, fallbackDate);
  const counts = new Map();
  const kept = [];
  for (const item of sorted) {
    const owner = item?.politicianId ?? item?.user_id ?? "__shared__";
    const used = counts.get(owner) || 0;
    if (used >= perOwnerLimit) continue;
    counts.set(owner, used + 1);
    kept.push(item);
    if (totalLimit && kept.length >= totalLimit) break;
  }
  return kept;
}

function compactStore(store) {
  const rawItems = compactRawItems(store.rawItems || []);
  return {
    ...store,
    rawItems,
    briefings: keepLatestPerOwner(store.briefings, "generatedAt", "date", 5, 400),
    crawlRuns: sortByDate(store.crawlRuns, "createdAt").slice(0, 30).map((run) => ({
      mode: run.mode || "full",
      checkedSources: run.checkedSources || 0,
      successfulSources: run.successfulSources || 0,
      failedSources: run.failedSources || 0,
      newCandidateItems: run.newCandidateItems || 0,
      savedItems: run.savedItems || 0,
      errors: Array.isArray(run.errors) ? run.errors.slice(0, 20) : [],
      createdAt: run.createdAt
    })),
    interactions: keepLatestPerOwner(store.interactions, "createdAt", "createdAt", 80, 4000),
    topicMemory: keepLatestPerOwner(store.topicMemory, "updatedAt", "lastSeenAt", 120, 4000),
    politicalItems: keepLatestPerOwner(store.politicalItems, "created_at", "updated_at", 80, 4000),
    personalizedRecommendations: keepLatestPerOwner(store.personalizedRecommendations, "created_at", "updated_at", 80, 4000),
    dailyTasks: keepLatestPerOwner(store.dailyTasks, "createdAt", "dueDate", 60, 3000),
    communicationDrafts: keepLatestPerOwner(store.communicationDrafts, "createdAt", "createdAt", 40, 2000),
    userNotes: keepLatestPerOwner(store.userNotes, "createdAt", "createdAt", 80, 3000),
    priorityChanges: keepLatestPerOwner(store.priorityChanges, "created_at", "updated_at", 80, 3000),
    lageChecks: keepLatestPerOwner(store.lageChecks, "checkedAt", "createdAt", 10, 1000),
    pushSubscriptions: sortByDate(store.pushSubscriptions, "updatedAt", "createdAt").slice(0, 300),
    pushEvents: sortByDate(store.pushEvents, "createdAt").slice(0, 200),
    pipelineDebugReports: keepLatestPerOwner(store.pipelineDebugReports, "createdAt", "createdAt", 3, 300),
    sessions: sortByDate(store.sessions, "createdAt").slice(0, 500),
    auditEvents: sortByDate(store.auditEvents, "createdAt").slice(0, 1000),
    systemErrors: sortByDate(store.systemErrors, "createdAt").slice(0, 300),
    dailyInputs: sortByDate(store.dailyInputs, "createdAt").slice(0, 1000)
  };
}

function compactRawItems(rawItems) {
  const sanitized = rawItems.map(sanitizeStoredRawItem);
  const protectedPersonItems = sortByDate(
    sanitized.filter((item) => item.sourceType === "person" || isPersonNewsSourceId(item.sourceId)),
    "publishedAt",
    "retrievedAt"
  ).slice(0, 240);
  const protectedHashes = new Set(protectedPersonItems.map((item) => item.hash || item.id).filter(Boolean));
  const generalItems = sortByDate(
    sanitized.filter((item) => !protectedHashes.has(item.hash || item.id)),
    "publishedAt",
    "retrievedAt"
  ).slice(0, 1160);
  return sortByDate([...protectedPersonItems, ...generalItems], "publishedAt", "retrievedAt").slice(0, 1400);
}

function isPersonNewsSourceId(sourceId) {
  return /^[a-z0-9-]+-news$/i.test(String(sourceId || ""));
}

function sortByDate(items, primaryKey, fallbackKey = primaryKey) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const left = new Date(b?.[primaryKey] || b?.[fallbackKey] || 0).getTime();
    const right = new Date(a?.[primaryKey] || a?.[fallbackKey] || 0).getTime();
    return (Number.isNaN(left) ? 0 : left) - (Number.isNaN(right) ? 0 : right);
  });
}

function sanitizeStoredRawItem(item) {
  const quality = articleUrlQuality(item?.url);
  if (quality === "direct") {
    return {
      ...item,
      linkType: item.linkType || quality,
      linkResolutionNote: item.linkResolutionNote || linkResolutionNote(item.linkType || quality)
    };
  }
  return {
    ...item,
    url: "",
    originalUrl: item.originalUrl || item.url,
    linkType: "missing",
    linkResolutionNote: linkResolutionNote("missing")
  };
}

function isBlockedStoredArticleUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    return (
      hostname.includes("google.") ||
      hostname.includes("googleapis.com") ||
      hostname.includes("google-analytics.com") ||
      hostname.includes("googleadservices.com") ||
      hostname.includes("googlesyndication.com") ||
      hostname.includes("googletagmanager.com") ||
      hostname === "www.w3.org" ||
      hostname === "w3.org" ||
      hostname.includes("gstatic.com") ||
      hostname.includes("googleusercontent.com") ||
      /\.(js|css|png|jpe?g|webp|gif|svg|ico)(\?|$)/i.test(pathname)
    );
  } catch {
    return true;
  }
}

function mergeSources(storedSources = []) {
  const storedById = new Map(storedSources.map((source) => [source.id, source]));
  const mergedDefaults = v1Sources.map((source) => ({
    ...source,
    ...(storedById.get(source.id) || {}),
    url: source.url,
    rssUrl: source.rssUrl,
    rssUrls: source.rssUrls,
    crawlMethod: source.crawlMethod,
    priority: source.priority,
    maxItems: source.maxItems,
    active: storedById.get(source.id)?.active ?? source.active
  }));
  const customSources = storedSources.filter((source) => !v1Sources.some((defaultSource) => defaultSource.id === source.id));
  return [...mergedDefaults, ...customSources];
}

async function saveRawItems(items) {
  const store = await readStore();
  const knownHashes = new Set(store.rawItems.map((item) => item.hash));
  const newItems = items.filter((item) => item.hash && !knownHashes.has(item.hash));
  const incomingByHash = new Map(items.filter((item) => item.hash).map((item) => [item.hash, item]));
  store.rawItems = store.rawItems.map((item) => {
    const incoming = incomingByHash.get(item.hash);
    if (!incoming) return item;
    return {
      ...item,
      url: isBetterArticleUrl(item.url, incoming.url) ? incoming.url : item.url,
      originalUrl: item.originalUrl || incoming.originalUrl || "",
      linkType: betterLinkType(item, incoming),
      linkResolutionNote: incoming.linkResolutionNote || item.linkResolutionNote || linkResolutionNote(betterLinkType(item, incoming)),
      sourceName: isBetterSourceName(item.sourceName, incoming.sourceName) ? incoming.sourceName : item.sourceName,
      sourceUrl: isBetterSourceUrl(item.sourceUrl, incoming.sourceUrl) ? incoming.sourceUrl : item.sourceUrl,
      imageUrl: isBetterImageUrl(item.imageUrl, incoming.imageUrl) ? incoming.imageUrl : item.imageUrl || "",
      excerpt: item.excerpt || incoming.excerpt || ""
    };
  });
  store.rawItems = [...store.rawItems, ...newItems].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  await writeStore(store);
  return newItems;
}

function isBetterArticleUrl(currentUrl, incomingUrl) {
  if (!incomingUrl || incomingUrl === currentUrl) return false;
  return articleUrlRank(incomingUrl) > articleUrlRank(currentUrl);
}

function betterLinkType(currentItem, incomingItem) {
  const currentRank = articleUrlRank(currentItem.url);
  const incomingRank = articleUrlRank(incomingItem.url);
  if (incomingRank > currentRank) return incomingItem.linkType || articleUrlQuality(incomingItem.url);
  return currentItem.linkType || articleUrlQuality(currentItem.url);
}

function articleUrlRank(url) {
  const quality = articleUrlQuality(url);
  if (quality === "direct") return 4;
  if (quality === "publisher") return 3;
  if (quality === "google_proxy") return 2;
  if (quality === "asset") return 1;
  return 0;
}

function articleUrlQuality(url) {
  if (!url) return "missing";
  if (isImageAssetUrl(url)) return "asset";
  if (isGoogleLink(url)) return "google_proxy";
  if (isLikelyPublisherHomepage(url)) return "publisher";
  if (!isBlockedStoredArticleUrl(url)) return "direct";
  return "missing";
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

function linkResolutionNote(linkType) {
  if (linkType === "direct") return "Direkter Artikellink gefunden.";
  if (linkType === "publisher") return "Direkter Artikel nicht sicher auflösbar; Publisher-Quelle hinterlegt.";
  if (linkType === "google_proxy") return "Google-News-Link erkannt, direkter Artikel noch nicht auflösbar.";
  return "Kein belastbarer öffentlicher Link gefunden.";
}

function isGoogleLink(url) {
  try {
    const parsed = new URL(String(url || ""));
    return parsed.hostname.includes("google.");
  } catch {
    return false;
  }
}

function isBetterSourceName(currentName, incomingName) {
  if (!incomingName || incomingName === currentName) return false;
  return !currentName || String(currentName).includes("News-Suche");
}

function isBetterSourceUrl(currentUrl, incomingUrl) {
  if (!incomingUrl || incomingUrl === currentUrl) return false;
  return !currentUrl || isGoogleLink(currentUrl) || isImageAssetUrl(currentUrl);
}

function isBetterImageUrl(currentUrl, incomingUrl) {
  if (!incomingUrl || incomingUrl === currentUrl) return false;
  return !currentUrl || isImageAssetUrl(currentUrl);
}

function isImageAssetUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    const hostname = parsed.hostname.toLowerCase();
    return hostname.includes("googleusercontent.com") || hostname.includes("gstatic.com") || /\.(png|jpe?g|webp|gif|svg|ico)(\?|$)/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

async function getRawItemsSince(date) {
  const since = new Date(date);
  const store = await readStore();
  return store.rawItems.filter((item) => new Date(item.publishedAt) >= since);
}

async function getSources() {
  return (await readStore()).sources;
}

async function updateSourceLastCrawled(sourceId, value = new Date().toISOString()) {
  const store = await readStore();
  store.sources = store.sources.map((source) => (source.id === sourceId ? { ...source, lastCrawledAt: value } : source));
  await writeStore(store);
}

async function saveBriefing(briefing) {
  const store = await readStore();
  const briefingWithMeta = {
    ...briefing,
    generatedAt: new Date().toISOString()
  };
  store.briefings = [briefingWithMeta, ...store.briefings.filter((entry) => entry.id !== briefing.id)].slice(0, 2000);
  await writeStore(store);
  return briefingWithMeta;
}

async function getLatestBriefing(politicianId) {
  return (await readStore()).briefings.find((briefing) => briefing.politicianId === politicianId) || null;
}

async function getTopicMemory(politicianId) {
  const store = await readStore();
  const persisted = (store.topicMemory || []).filter((entry) => !politicianId || entry.politicianId === politicianId);
  const derived = buildTopicMemoryFromBriefings(store.briefings || [], politicianId);
  if (persisted.length) return mergeTopicMemoryEntries(persisted, derived);
  return derived;
}

async function updateTopicMemoryFromBriefing(briefing) {
  const store = await readStore();
  const existing = new Map((store.topicMemory || []).map((entry) => [`${entry.politicianId}:${entry.topicKey}`, entry]));
  const now = new Date().toISOString();

  (briefing.items || []).forEach((item) => {
    const topicKey = topicMemoryKey(item);
    const memoryKey = `${briefing.politicianId}:${topicKey}`;
    const previous = existing.get(memoryKey);
    existing.set(memoryKey, {
      id: previous?.id || `memory-${briefing.politicianId}-${topicKey}`,
      politicianId: briefing.politicianId,
      topicKey,
      title: item.title || previous?.title || "Politisches Thema",
      firstSeenAt: previous?.firstSeenAt || briefing.generatedAt || briefing.date || now,
      lastSeenAt: briefing.generatedAt || now,
      seenCount: (previous?.seenCount || 0) + 1,
      lastDecision: item.decision || previous?.lastDecision || "",
      lastAction: item.recommendedAction || previous?.lastAction || "",
      lastStatement: item.suggestedStatement || previous?.lastStatement || "",
      lastRisk: item.riskNote || previous?.lastRisk || "",
      lastOpportunity: item.opportunityNote || previous?.lastOpportunity || "",
      lastAssignee: item.taskTemplate?.assignee || previous?.lastAssignee || "",
      sourceCount: item.sourceCount || previous?.sourceCount || 0,
      sourceUrls: mergeUnique(previous?.sourceUrls, sourceUrlsForMemory(item)),
      sourceHashes: mergeUnique(previous?.sourceHashes, sourceHashesForMemory(item)),
      updatedAt: now
    });
  });

  store.topicMemory = Array.from(existing.values())
    .sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt))
    .slice(0, 200);
  await writeStore(store);
  return store.topicMemory.filter((entry) => entry.politicianId === briefing.politicianId);
}

function buildTopicMemoryFromBriefings(briefings, politicianId) {
  const memory = new Map();
  [...briefings].reverse().forEach((briefing) => {
    if (politicianId && briefing.politicianId !== politicianId) return;
    (briefing.items || []).forEach((item) => {
      const topicKey = topicMemoryKey(item);
      const memoryKey = `${briefing.politicianId}:${topicKey}`;
      const previous = memory.get(memoryKey);
      memory.set(memoryKey, {
        id: previous?.id || `memory-${briefing.politicianId}-${topicKey}`,
        politicianId: briefing.politicianId,
        topicKey,
        title: item.title || previous?.title || "Politisches Thema",
        firstSeenAt: previous?.firstSeenAt || briefing.generatedAt || briefing.date,
        lastSeenAt: briefing.generatedAt || briefing.date,
        seenCount: (previous?.seenCount || 0) + 1,
        lastDecision: item.decision || previous?.lastDecision || "",
        lastAction: item.recommendedAction || previous?.lastAction || "",
        lastStatement: item.suggestedStatement || previous?.lastStatement || "",
        lastRisk: item.riskNote || previous?.lastRisk || "",
        lastOpportunity: item.opportunityNote || previous?.lastOpportunity || "",
        lastAssignee: item.taskTemplate?.assignee || previous?.lastAssignee || "",
        sourceCount: item.sourceCount || previous?.sourceCount || 0,
        sourceUrls: mergeUnique(previous?.sourceUrls, sourceUrlsForMemory(item)),
        sourceHashes: mergeUnique(previous?.sourceHashes, sourceHashesForMemory(item)),
        updatedAt: briefing.generatedAt || briefing.date
      });
    });
  });
  return Array.from(memory.values()).sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt));
}

function mergeTopicMemoryEntries(persisted = [], derived = []) {
  const byKey = new Map((persisted || []).map((entry) => [`${entry.politicianId}:${entry.topicKey}`, entry]));
  for (const entry of derived || []) {
    const key = `${entry.politicianId}:${entry.topicKey}`;
    const previous = byKey.get(key);
    if (!previous) {
      byKey.set(key, entry);
      continue;
    }
    byKey.set(key, {
      ...entry,
      ...previous,
      sourceUrls: mergeUnique(previous.sourceUrls, entry.sourceUrls),
      sourceHashes: mergeUnique(previous.sourceHashes, entry.sourceHashes),
      sourceCount: Math.max(Number(previous.sourceCount || 0), Number(entry.sourceCount || 0)),
      firstSeenAt: previous.firstSeenAt || entry.firstSeenAt,
      lastSeenAt: previous.lastSeenAt || entry.lastSeenAt,
      updatedAt: previous.updatedAt || entry.updatedAt
    });
  }
  return Array.from(byKey.values()).sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt));
}

function topicMemoryKey(item) {
  return String(item.topic || item.title || item.signalId || "topic")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "topic";
}

function sourceUrlsForMemory(item = {}) {
  const direct = [item.itemUrl, item.url, item.originalUrl].filter(Boolean);
  const sourceUrls = (item.sources || [])
    .flatMap((source) => [source.itemUrl, source.url, source.originalUrl])
    .filter(Boolean);
  const primaryUrls = item.primarySource
    ? [item.primarySource.itemUrl, item.primarySource.url, item.primarySource.originalUrl].filter(Boolean)
    : [];
  return uniqueStrings([...direct, ...sourceUrls, ...primaryUrls].map(normalizeMemoryUrl).filter(Boolean)).slice(0, 40);
}

function sourceHashesForMemory(item = {}) {
  const direct = [item.hash, item.rawItemId, item.rawItemID, item.id].filter(Boolean);
  const sourceIds = (item.sources || [])
    .flatMap((source) => [source.rawItemId, source.id, source.hash])
    .filter(Boolean);
  return uniqueStrings([...direct, ...sourceIds].map((value) => String(value || "").trim()).filter(Boolean)).slice(0, 40);
}

function mergeUnique(previous = [], next = []) {
  return uniqueStrings([...(Array.isArray(previous) ? previous : []), ...(Array.isArray(next) ? next : [])]).slice(0, 80);
}

function uniqueStrings(values) {
  return Array.from(new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean)));
}

function normalizeMemoryUrl(value) {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    url.searchParams.delete("utm_source");
    url.searchParams.delete("utm_medium");
    url.searchParams.delete("utm_campaign");
    url.searchParams.delete("utm_term");
    url.searchParams.delete("utm_content");
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

async function saveCrawlRun(run) {
  const store = await readStore();
  store.crawlRuns = [{ ...run, createdAt: new Date().toISOString() }, ...store.crawlRuns].slice(0, 20);
  await writeStore(store);
  return store.crawlRuns[0];
}

async function getLatestCrawlRun() {
  return (await readStore()).crawlRuns[0] || null;
}

async function saveLageCheck(check) {
  const store = await readStore();
  const now = new Date().toISOString();
  const entry = {
    id: check.id || `lage-check-${check.politicianId || "unknown"}-${Date.now()}`,
    createdAt: check.createdAt || now,
    checkedAt: check.checkedAt || now,
    ...check
  };
  store.lageChecks = [entry, ...(store.lageChecks || []).filter((item) => item.id !== entry.id)].slice(0, 2000);
  await writeStore(store);
  return entry;
}

async function getLatestLageCheck(politicianId) {
  return (await readStore()).lageChecks.find((check) => !politicianId || check.politicianId === politicianId) || null;
}

async function getLageChecks(politicianId, limit = 12) {
  return (await readStore()).lageChecks
    .filter((check) => !politicianId || check.politicianId === politicianId)
    .slice(0, limit);
}

async function savePipelineDebugReport(report) {
  const store = await readStore();
  const entry = {
    id: report.id || `pipeline-debug-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...report
  };
  store.pipelineDebugReports = [entry, ...(store.pipelineDebugReports || []).filter((item) => item.id !== entry.id)].slice(0, 20);
  await writeStore(store);
  return entry;
}

async function getLatestPipelineDebugReport(politicianId) {
  return (await readStore()).pipelineDebugReports.find((report) => !politicianId || report.politicianId === politicianId) || null;
}

async function saveTask(task) {
  const store = await readStore();
  const taskWithMeta = {
    ...task,
    updatedAt: new Date().toISOString()
  };
  const existingIndex = store.tasks.findIndex((entry) => entry.id === taskWithMeta.id);
  if (existingIndex >= 0) store.tasks[existingIndex] = { ...store.tasks[existingIndex], ...taskWithMeta };
  else store.tasks.unshift(taskWithMeta);
  await writeStore(store);
  return taskWithMeta;
}

async function getTasks(politicianId) {
  return (await readStore()).tasks.filter((task) => !politicianId || task.politicianId === politicianId);
}

async function updateTaskStatus(taskId, status) {
  const store = await readStore();
  const task = store.tasks.find((entry) => entry.id === taskId);
  if (!task) return null;
  task.status = status;
  task.updatedAt = new Date().toISOString();
  await writeStore(store);
  return task;
}

async function saveInteraction(interaction) {
  const store = await readStore();
  const entry = {
    id: interaction.id || `interaction-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...interaction
  };
  store.interactions = [entry, ...store.interactions].slice(0, 4000);
  store.personalizedRecommendations = updateRecommendationFromInteraction(store.personalizedRecommendations || [], entry);
  await writeStore(store);
  return entry;
}

async function getInteractions(politicianId) {
  return (await readStore()).interactions.filter((entry) => !politicianId || entry.politicianId === politicianId);
}

async function getProfile(profileId) {
  return (await readStore()).profiles?.[profileId] || null;
}

async function listProfiles() {
  const store = await readStore();
  return Object.values(store.profiles || {}).map((profile) => ({
    id: profile.id,
    fullName: profile.fullName || profile.name || profile.id,
    party: profile.party || "",
    updatedAt: profile.updatedAt || null
  }));
}

async function saveProfile(profile) {
  const store = await readStore();
  store.profiles = store.profiles || {};
  store.mandateProfiles = store.mandateProfiles || {};
  const profileWithMeta = {
    ...profile,
    updatedAt: new Date().toISOString()
  };
  store.profiles[profile.id] = profileWithMeta;
  store.mandateProfiles[profile.id] = toMandateProfile(profileWithMeta);
  await writeStore(store);
  return profileWithMeta;
}

async function savePersonalizedRecommendations(politicianId, recommendations = []) {
  const store = await readStore();
  const others = (store.personalizedRecommendations || []).filter((entry) => entry.user_id !== politicianId);
  store.personalizedRecommendations = [...recommendations, ...others].slice(0, 4000);
  await writeStore(store);
  return recommendations;
}

async function savePoliticalItems(items = []) {
  const store = await readStore();
  const byId = new Map((store.politicalItems || []).map((item) => [item.id, item]));
  items.forEach((item) => byId.set(item.id, { ...(byId.get(item.id) || {}), ...item }));
  store.politicalItems = Array.from(byId.values()).sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0)).slice(0, 1000);
  await writeStore(store);
  return items;
}

async function savePriorityChanges(changes = []) {
  if (!changes.length) return [];
  const store = await readStore();
  store.priorityChanges = [...changes, ...(store.priorityChanges || [])].slice(0, 500);
  await writeStore(store);
  return changes;
}

async function getUserNotes(politicianId) {
  return (await readStore()).userNotes.filter((note) => !politicianId || note.user_id === politicianId);
}

async function saveUserNote(note) {
  const store = await readStore();
  const now = new Date().toISOString();
  const noteWithMeta = {
    id: note.id || `note-${Date.now()}`,
    user_id: note.user_id || note.politicianId || "cem-ince",
    recommendation_id: note.recommendation_id || note.recommendationId || "",
    political_item_id: note.political_item_id || note.politicalItemId || "",
    type: note.type || "note",
    text: String(note.text || "").trim(),
    status: note.status || "open",
    created_at: note.created_at || now,
    updated_at: now
  };
  const existingIndex = store.userNotes.findIndex((entry) => entry.id === noteWithMeta.id);
  if (existingIndex >= 0) store.userNotes[existingIndex] = { ...store.userNotes[existingIndex], ...noteWithMeta };
  else store.userNotes.unshift(noteWithMeta);
  await writeStore(store);
  return noteWithMeta;
}

async function savePushSubscription(politicianId, subscription, meta = {}) {
  const store = await readStore();
  const now = new Date().toISOString();
  const endpoint = String(subscription?.endpoint || "").trim();
  if (!endpoint) throw new Error("Push subscription endpoint missing");
  const entry = {
    id: `push-${politicianId}-${hashStable(endpoint).slice(0, 18)}`,
    politicianId,
    endpoint,
    subscription,
    userAgent: meta.userAgent || "",
    createdAt: meta.createdAt || now,
    updatedAt: now,
    active: true
  };
  store.pushSubscriptions = [
    entry,
    ...(store.pushSubscriptions || []).filter((item) => item.endpoint !== endpoint)
  ].slice(0, 300);
  await writeStore(store);
  return entry;
}

async function removePushSubscription(politicianId, endpoint) {
  const store = await readStore();
  const before = (store.pushSubscriptions || []).length;
  store.pushSubscriptions = (store.pushSubscriptions || []).filter((item) => {
    if (politicianId && item.politicianId !== politicianId) return true;
    return item.endpoint !== endpoint;
  });
  await writeStore(store);
  return { removed: before - store.pushSubscriptions.length };
}

async function getPushSubscriptions(politicianId) {
  return (await readStore()).pushSubscriptions.filter((item) => item.active !== false && (!politicianId || item.politicianId === politicianId));
}

async function savePushEvent(event) {
  const store = await readStore();
  const entry = {
    id: event.id || `push-event-${event.politicianId || "unknown"}-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...event
  };
  store.pushEvents = [entry, ...(store.pushEvents || []).filter((item) => item.id !== entry.id)].slice(0, 200);
  await writeStore(store);
  return entry;
}

async function getPushEventByDedupeKey(politicianId, dedupeKey) {
  if (!dedupeKey) return null;
  return (await readStore()).pushEvents.find((event) => event.politicianId === politicianId && event.dedupeKey === dedupeKey) || null;
}

async function exportProfileData(politicianId) {
  const store = await readStore();
  const profile = store.profiles?.[politicianId] || null;
  return {
    exportedAt: new Date().toISOString(),
    politicianId,
    profile,
    mandateProfile: store.mandateProfiles?.[politicianId] || null,
    briefings: profileRows(store.briefings, politicianId),
    tasks: profileRows(store.tasks, politicianId),
    interactions: profileRows(store.interactions, politicianId),
    topicMemory: profileRows(store.topicMemory, politicianId),
    politicalItems: userRows(store.politicalItems, politicianId),
    personalizedRecommendations: userRows(store.personalizedRecommendations, politicianId),
    dailyTasks: userRows(store.dailyTasks, politicianId),
    communicationDrafts: userRows(store.communicationDrafts, politicianId),
    userNotes: userRows(store.userNotes, politicianId),
    priorityChanges: userRows(store.priorityChanges, politicianId),
    lageChecks: profileRows(store.lageChecks, politicianId),
    pushSubscriptions: profileRows(store.pushSubscriptions, politicianId).map(redactPushSubscription),
    pushEvents: profileRows(store.pushEvents, politicianId),
    pipelineDebugReports: profileRows(store.pipelineDebugReports, politicianId),
    rawItems: profileRawItems(store.rawItems, profile, politicianId)
  };
}

async function deleteProfileData(politicianId) {
  const store = await readStore();
  const profile = store.profiles?.[politicianId] || null;
  const before = dataCounts(store, politicianId, profile);

  if (store.profiles) delete store.profiles[politicianId];
  if (store.mandateProfiles) delete store.mandateProfiles[politicianId];
  store.briefings = withoutProfileRows(store.briefings, politicianId);
  store.tasks = withoutProfileRows(store.tasks, politicianId);
  store.interactions = withoutProfileRows(store.interactions, politicianId);
  store.topicMemory = withoutProfileRows(store.topicMemory, politicianId);
  store.politicalItems = withoutUserRows(store.politicalItems, politicianId);
  store.personalizedRecommendations = withoutUserRows(store.personalizedRecommendations, politicianId);
  store.dailyTasks = withoutUserRows(store.dailyTasks, politicianId);
  store.communicationDrafts = withoutUserRows(store.communicationDrafts, politicianId);
  store.userNotes = withoutUserRows(store.userNotes, politicianId);
  store.priorityChanges = withoutUserRows(store.priorityChanges, politicianId);
  store.lageChecks = withoutProfileRows(store.lageChecks, politicianId);
  store.pushSubscriptions = withoutProfileRows(store.pushSubscriptions, politicianId);
  store.pushEvents = withoutProfileRows(store.pushEvents, politicianId);
  store.pipelineDebugReports = withoutProfileRows(store.pipelineDebugReports, politicianId);
  store.rawItems = (store.rawItems || []).filter((item) => !rawItemBelongsToProfile(item, profile, politicianId));

  await writeStore(store);
  const after = dataCounts(store, politicianId, profile);
  return {
    ok: true,
    deletedAt: new Date().toISOString(),
    politicianId,
    before,
    after
  };
}

function profileRows(rows = [], politicianId) {
  return (rows || []).filter((row) => row?.politicianId === politicianId || row?.profileId === politicianId);
}

function userRows(rows = [], politicianId) {
  return (rows || []).filter((row) => row?.user_id === politicianId || row?.userId === politicianId || row?.politicianId === politicianId);
}

function withoutProfileRows(rows = [], politicianId) {
  return (rows || []).filter((row) => row?.politicianId !== politicianId && row?.profileId !== politicianId);
}

function withoutUserRows(rows = [], politicianId) {
  return (rows || []).filter((row) => row?.user_id !== politicianId && row?.userId !== politicianId && row?.politicianId !== politicianId);
}

function profileRawItems(rawItems = [], profile, politicianId) {
  return (rawItems || []).filter((item) => rawItemBelongsToProfile(item, profile, politicianId));
}

function rawItemBelongsToProfile(item = {}, profile, politicianId) {
  if (!item || typeof item !== "object") return false;
  if (item.politicianId === politicianId || item.profileId === politicianId || item.user_id === politicianId) return true;
  if (item.sourceType === "person" || isPersonNewsSourceId(item.sourceId)) return true;
  const terms = profileTerms(profile, politicianId);
  const text = `${item.title || ""} ${item.content || ""} ${item.excerpt || ""} ${item.author || ""}`.toLowerCase();
  return terms.some((term) => term && text.includes(term));
}

function profileTerms(profile, politicianId) {
  const fullName = String(profile?.fullName || readableProfileName(politicianId)).trim().toLowerCase();
  const parts = fullName.split(/\s+/).filter(Boolean);
  return Array.from(new Set([
    fullName,
    parts.length > 1 ? parts.at(-1) : "",
    String(politicianId || "").replace(/-/g, " ").toLowerCase()
  ].filter((term) => term && term.length >= 3)));
}

function readableProfileName(politicianId) {
  return String(politicianId || "").split("-").filter(Boolean).join(" ");
}

function redactPushSubscription(entry) {
  return {
    ...entry,
    subscription: entry.subscription ? {
      endpoint: entry.subscription.endpoint,
      keys: entry.subscription.keys ? { p256dh: "[redacted]", auth: "[redacted]" } : undefined
    } : undefined
  };
}

function dataCounts(store, politicianId, profile) {
  return {
    profile: store.profiles?.[politicianId] ? 1 : 0,
    mandateProfile: store.mandateProfiles?.[politicianId] ? 1 : 0,
    briefings: profileRows(store.briefings, politicianId).length,
    tasks: profileRows(store.tasks, politicianId).length,
    interactions: profileRows(store.interactions, politicianId).length,
    topicMemory: profileRows(store.topicMemory, politicianId).length,
    politicalItems: userRows(store.politicalItems, politicianId).length,
    personalizedRecommendations: userRows(store.personalizedRecommendations, politicianId).length,
    dailyTasks: userRows(store.dailyTasks, politicianId).length,
    communicationDrafts: userRows(store.communicationDrafts, politicianId).length,
    userNotes: userRows(store.userNotes, politicianId).length,
    priorityChanges: userRows(store.priorityChanges, politicianId).length,
    lageChecks: profileRows(store.lageChecks, politicianId).length,
    pushSubscriptions: profileRows(store.pushSubscriptions, politicianId).length,
    pushEvents: profileRows(store.pushEvents, politicianId).length,
    pipelineDebugReports: profileRows(store.pipelineDebugReports, politicianId).length,
    rawItems: profileRawItems(store.rawItems, profile, politicianId).length
  };
}

function hashStable(value) {
  let hash = 5381;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash) + text.charCodeAt(index);
    hash &= 0xffffffff;
  }
  return Math.abs(hash).toString(36);
}

function toMandateProfile(profile) {
  return {
    user_id: profile.id,
    name: profile.fullName,
    partei: profile.party,
    fraktion: profile.faction,
    rolle: profile.function || profile.role,
    politische_ebene: profile.politicalLevel || "Bund",
    wahlkreis: profile.constituency,
    bundesland: profile.state,
    ausschuesse: profile.committees || [],
    berichterstatter_themen: profile.reportingTopics || [],
    fachpolitische_schwerpunkte: profile.focusTopics || [],
    aktuelle_kampagnen: profile.currentCampaigns || [],
    oeffentliche_positionen: profile.publicPositions || [],
    wichtige_zielgruppen: profile.keyAudiences || [],
    kommunikationsstil: profile.communicationStyle,
    risiko_themen: profile.riskTopics || [],
    chancen_themen: profile.opportunityTopics || [],
    no_go_themen: profile.noGoTopics || [],
    bevorzugte_kanaele: profile.preferredChannels || [],
    buero_uebergabe: profile.officeHandoffMethod || "share",
    naechste_termine: profile.upcomingAppointments || [],
    updated_at: profile.updatedAt
  };
}

function updateRecommendationFromInteraction(recommendations, interaction) {
  const recommendationId = interaction.recommendationId || interaction.recommendation_id;
  const signalId = interaction.signalId;
  const type = interaction.type;
  if (!recommendationId && !signalId) return recommendations;
  return recommendations.map((recommendation) => {
    const matches = recommendation.id === recommendationId || recommendation.signal_id === signalId || recommendation.signalId === signalId;
    if (!matches) return recommendation;
    const status = type === "ignored" ? "ignored"
      : type === "snoozed" ? "snoozed"
        : ["task_copied", "delegated"].includes(type) ? "in_progress"
          : type === "done" ? "done"
            : ["marked_important", "marked_relevant"].includes(type) ? "relevant"
              : recommendation.status === "ignored" ? "seen"
                : recommendation.status || "seen";
    return {
      ...recommendation,
      status,
      feedback: ["marked_important", "marked_relevant", "ignored", "snoozed", "done"].includes(type) ? type : recommendation.feedback,
      last_seen_by_user: interaction.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  });
}

module.exports = {
  deleteProfileData,
  exportProfileData,
  getStorageStatus,
  getStoreSummary,
  readStore,
  writeStore,
  readAuthStore,
  writeAuthStore,
  saveRawItems,
  getRawItemsSince,
  getSources,
  updateSourceLastCrawled,
  saveBriefing,
  getLatestBriefing,
  getTopicMemory,
  updateTopicMemoryFromBriefing,
  saveCrawlRun,
  getLatestCrawlRun,
  saveLageCheck,
  getLatestLageCheck,
  getLageChecks,
  savePipelineDebugReport,
  getLatestPipelineDebugReport,
  saveTask,
  getTasks,
  updateTaskStatus,
  saveInteraction,
  getInteractions,
  getProfile,
  listProfiles,
  saveProfile,
  savePersonalizedRecommendations,
  savePoliticalItems,
  savePriorityChanges,
  getUserNotes,
  saveUserNote,
  savePushSubscription,
  removePushSubscription,
  getPushSubscriptions,
  savePushEvent,
  getPushEventByDedupeKey
};
