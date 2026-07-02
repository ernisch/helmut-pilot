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
  const [store, pStore] = await Promise.all([
    readStore("main"),
    politicianId ? readStore(pKey(politicianId)) : Promise.resolve(defaultPoliticianStore())
  ]);
  const activeSources = (store.sources || []).filter((source) => source.active !== false);
  const rawItems = store.rawItems || [];
  const latestRawItem = sortByDate(rawItems, "retrievedAt", "publishedAt")[0] || null;
  // Briefings: zuerst im Politiker-Store suchen, dann Main-Store als Fallback
  const allBriefings = [...(pStore.briefings || []), ...(store.briefings || [])];
  const latestBriefing = allBriefings.find((briefing) => !politicianId || briefing.politicianId === politicianId) || null;
  const allTasks = [...(pStore.tasks || []), ...(store.tasks || [])];
  const allLageChecks = [...(pStore.lageChecks || []), ...(store.lageChecks || [])];
  const allPushEvents = [...(pStore.pushEvents || []), ...(store.pushEvents || [])];
  const recommendations = [...(pStore.personalizedRecommendations || []), ...(store.personalizedRecommendations || [])].filter((entry) => !politicianId || entry.user_id === politicianId);
  const tasks = allTasks.filter((task) => !politicianId || task.politicianId === politicianId);
  const notes = [...(pStore.userNotes || []), ...(store.userNotes || [])].filter((note) => !politicianId || note.user_id === politicianId);
  const latestPushEvent = allPushEvents.find((event) => !politicianId || event.politicianId === politicianId) || null;
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
      total: allBriefings.filter((briefing) => !politicianId || briefing.politicianId === politicianId).length,
      latestId: latestBriefing?.id || null,
      latestStatus: latestBriefing?.status || null,
      latestGeneratedAt: latestBriefing?.generatedAt || latestBriefing?.date || null
    },
    crawlRuns: {
      total: (store.crawlRuns || []).length,
      latestAt: store.crawlRuns?.[0]?.createdAt || null
    },
    lageChecks: {
      total: allLageChecks.filter((check) => !politicianId || check.politicianId === politicianId).length,
      latestAt: allLageChecks.find((check) => !politicianId || check.politicianId === politicianId)?.checkedAt || null,
      latestStatus: allLageChecks.find((check) => !politicianId || check.politicianId === politicianId)?.status || null
    },
    push: {
      subscriptions: [...(pStore.pushSubscriptions || []), ...(store.pushSubscriptions || [])].filter((subscription) => !politicianId || subscription.politicianId === politicianId).length,
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
      total: [...(pStore.pipelineDebugReports || []), ...(store.pipelineDebugReports || [])].filter((report) => !politicianId || report.politicianId === politicianId).length,
      latestAt: [...(pStore.pipelineDebugReports || []), ...(store.pipelineDebugReports || [])].find((report) => !politicianId || report.politicianId === politicianId)?.createdAt || null
    }
  };
}

// Cache pro Store-Key. readStore/writeStore akzeptieren einen optionalen storeKey:
// - "main" (default): geteilte Daten (sources, rawItems, crawlRuns, profiles)
// - "p-{politicianId}": isolierter Politiker-Store (briefings, tasks, ...)
// Per HELMUT_STORE_CACHE_MS=0 deaktivierbar.
const storeCacheTtlMs = Number(process.env.HELMUT_STORE_CACHE_MS || 10000);
const storeCacheMap = new Map(); // storeKey → { data, at }

async function readStore(storeKey = "main") {
  const cached = storeCacheMap.get(storeKey);
  if (storeCacheTtlMs > 0 && cached && Date.now() - cached.at < storeCacheTtlMs) {
    return cached.data;
  }
  const store = useSupabase() ? await readSupabaseStore(storeKey) : readLocalStore(storeKey);
  storeCacheMap.set(storeKey, { data: store, at: Date.now() });
  return store;
}

async function writeStore(store, storeKey = "main") {
  const isMain = storeKey === "main";
  const normalized = isMain ? compactStore(normalizeStore(store)) : compactPoliticianStore(normalizePoliticianStore(store));
  if (useSupabase()) await writeSupabaseStore(normalized, storeKey);
  else writeLocalStore(normalized, storeKey);
  storeCacheMap.set(storeKey, { data: normalized, at: Date.now() });
  return normalized;
}

function readLocalStore(storeKey = "main") {
  const file = storeKey === "main" ? dataFile : path.join(dataDir, `${storeKey}.json`);
  if (!fs.existsSync(file)) return storeKey === "main" ? defaultStore() : defaultPoliticianStore();
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return storeKey === "main" ? normalizeStore(raw) : normalizePoliticianStore(raw);
  } catch (error) {
    console.error("Helmut storage read failed", storeKey, error);
    return storeKey === "main" ? defaultStore() : defaultPoliticianStore();
  }
}

function writeLocalStore(store, storeKey = "main") {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = storeKey === "main" ? dataFile : path.join(dataDir, `${storeKey}.json`);
  fs.writeFileSync(file, JSON.stringify(store, null, 2));
}

async function readSupabaseStore(storeKey = "main") {
  const rowId = storeKey === "main" ? supabaseStoreId : `${supabaseStoreId}-${storeKey}`;
  const rows = await supabaseRequest(`/rest/v1/helmut_store?id=eq.${encodeURIComponent(rowId)}&select=data`);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (row?.data) return storeKey === "main" ? normalizeStore(row.data) : normalizePoliticianStore(row.data);
  const seeded = storeKey === "main" ? defaultStore() : defaultPoliticianStore();
  await writeSupabaseStore(seeded, storeKey);
  return seeded;
}

async function writeSupabaseStore(store, storeKey = "main") {
  const rowId = storeKey === "main" ? supabaseStoreId : `${supabaseStoreId}-${storeKey}`;
  await supabaseRequest("/rest/v1/helmut_store", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: rowId, data: store })
  });
  return store;
}

// --- Politician-Store Infrastruktur ---
// Jeder Abgeordnete bekommt seinen eigenen Supabase-Row ("main-p-{id}").
// Geteilte Daten (sources, rawItems, crawlRuns, profiles) bleiben im "main"-Store.

function pKey(politicianId) {
  return politicianId ? `p-${politicianId}` : "main";
}

function defaultPoliticianStore() {
  return {
    briefings: [],
    tasks: [],
    interactions: [],
    topicMemory: [],
    politicalItems: [],
    personalizedRecommendations: [],
    dailyTasks: [],
    communicationDrafts: [],
    userNotes: [],
    priorityChanges: [],
    lageChecks: [],
    pushSubscriptions: [],
    pushEvents: [],
    pipelineDebugReports: []
  };
}

function normalizePoliticianStore(store = {}) {
  const parsed = { ...defaultPoliticianStore(), ...store };
  return {
    briefings: Array.isArray(parsed.briefings) ? parsed.briefings : [],
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    interactions: Array.isArray(parsed.interactions) ? parsed.interactions : [],
    topicMemory: Array.isArray(parsed.topicMemory) ? parsed.topicMemory : [],
    politicalItems: Array.isArray(parsed.politicalItems) ? parsed.politicalItems : [],
    personalizedRecommendations: Array.isArray(parsed.personalizedRecommendations) ? parsed.personalizedRecommendations : [],
    dailyTasks: Array.isArray(parsed.dailyTasks) ? parsed.dailyTasks : [],
    communicationDrafts: Array.isArray(parsed.communicationDrafts) ? parsed.communicationDrafts : [],
    userNotes: Array.isArray(parsed.userNotes) ? parsed.userNotes : [],
    priorityChanges: Array.isArray(parsed.priorityChanges) ? parsed.priorityChanges : [],
    lageChecks: Array.isArray(parsed.lageChecks) ? parsed.lageChecks : [],
    pushSubscriptions: Array.isArray(parsed.pushSubscriptions) ? parsed.pushSubscriptions : [],
    pushEvents: Array.isArray(parsed.pushEvents) ? parsed.pushEvents : [],
    pipelineDebugReports: Array.isArray(parsed.pipelineDebugReports) ? parsed.pipelineDebugReports : []
  };
}

function compactPoliticianStore(store) {
  return {
    ...store,
    briefings: keepLatestPerOwner(store.briefings, "generatedAt", "date", 4, 320).map(compactStoredBriefing),
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
    pipelineDebugReports: keepLatestPerOwner(store.pipelineDebugReports, "createdAt", "createdAt", 2, 200)
  };
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
    // LLM-Nutzung (Kosten/Token je Call). Bewusst im KLEINEN Auth-Store, damit
    // nicht bei jedem Log-Eintrag der mehrere MB grosse Haupt-Blob geschrieben wird.
    llmUsage: [],
    // Pipeline-Locks: verhindert parallele Crawl-/Briefing-Laeufe (key = jobName, value = { lockedAt, expiresAt }).
    pipelineLocks: {},
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
  normalized.llmUsage = (normalized.llmUsage || []).slice(0, 5000);
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

// --- LLM-Kosten-/Token-Logging -------------------------------------------
// Preise in USD pro 1 Mio. Token (Schaetzwerte, per HELMUT_LLM_PRICE_JSON
// ueberschreibbar). Unbekanntes Modell -> estimatedCost = "unknown".
function llmPriceTable() {
  const defaults = {
    "gpt-5-mini": { in: 0.25, out: 2.0 },
    "gpt-5.5": { in: 1.25, out: 10.0 },
    "gpt-4.1": { in: 2.0, out: 8.0 },
    "gpt-4o-mini": { in: 0.15, out: 0.6 }
  };
  try {
    const override = process.env.HELMUT_LLM_PRICE_JSON;
    if (override) return { ...defaults, ...JSON.parse(override) };
  } catch (_) { /* ungueltiges JSON ignorieren, Defaults nutzen */ }
  return defaults;
}

function numOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function estimateLlmCost(model, promptTokens, completionTokens) {
  const price = llmPriceTable()[model];
  if (!price || promptTokens == null || completionTokens == null) return null;
  const cost = (promptTokens / 1e6) * price.in + (completionTokens / 1e6) * price.out;
  return Math.round(cost * 1e6) / 1e6; // auf 6 Nachkommastellen (USD)
}

// Schreibt genau EINEN Log-Eintrag pro LLM-Call. Fehlt der usage-Block,
// werden Token/Kosten als "unknown" protokolliert (nie stiller Verlust).
// Loggen darf die App nie zum Absturz bringen -> alles in try/catch.
async function recordLlmUsage(entry = {}) {
  try {
    const usage = entry.usage || {};
    const promptTokens = numOrNull(usage.input_tokens ?? usage.prompt_tokens);
    const completionTokens = numOrNull(usage.output_tokens ?? usage.completion_tokens);
    const totalFromParts = promptTokens != null && completionTokens != null ? promptTokens + completionTokens : null;
    const totalTokens = numOrNull(usage.total_tokens) ?? totalFromParts;
    const model = entry.model || "unknown";
    const estimatedCost = estimateLlmCost(model, promptTokens, completionTokens);
    const record = {
      id: `llm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      politicianId: entry.politicianId || null,
      userId: entry.userId || entry.politicianId || null,
      model,
      callType: entry.callType || "unknown",
      promptTokens: promptTokens ?? "unknown",
      completionTokens: completionTokens ?? "unknown",
      totalTokens: totalTokens ?? "unknown",
      estimatedCost: estimatedCost ?? "unknown",
      durationMs: numOrNull(entry.durationMs) ?? "unknown",
      success: entry.success !== false,
      error: entry.error ? String(entry.error).slice(0, 300) : null
    };
    const store = await readAuthStore();
    store.llmUsage = [record, ...(store.llmUsage || [])];
    await writeAuthStore(store);
    return record;
  } catch (_) {
    return null; // Logging-Fehler duerfen den LLM-Pfad nicht beeintraechtigen
  }
}

async function getLlmUsage(politicianId = null, limit = 200) {
  const store = await readAuthStore();
  const all = Array.isArray(store.llmUsage) ? store.llmUsage : [];
  const filtered = politicianId ? all.filter((e) => e.politicianId === politicianId || e.userId === politicianId) : all;
  return filtered.slice(0, Math.max(0, limit));
}

// --- LLM-Budget / Kostenkontrolle -------------------------------------------
// Fundament fuer Datenmotor V2: leitet aus dem VORHANDENEN llmUsage-Log eine
// Tages-Aggregation ab und stellt ein Pre-Call-Gate bereit. Rein additiv —
// solange niemand canSpendLlm() aufruft, aendert sich am Verhalten nichts.

// Grenzwerte kommen aus Env-Variablen; 0/negativ/ungueltig -> "kein Limit".
function llmDailyCallLimit() {
  const raw = Number(process.env.HELMUT_MAX_LLM_CALLS_PER_DAY);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : Infinity;
}

function maxCandidatesPerBriefing() {
  const raw = Number(process.env.HELMUT_MAX_CANDIDATES_PER_BRIEFING);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 30; // V2-Ziel: Top 30
}

// Kalendertag (UTC) eines ISO-Zeitstempels, z. B. "2026-07-01".
function dayKey(iso) {
  const s = String(iso || "");
  return s.length >= 10 ? s.slice(0, 10) : "";
}

// Aggregiert die heutigen (bzw. fuer referenceIso angegebenen) LLM-Calls eines
// Mandats: Anzahl, davon erfolgreich, geschaetzte Kosten. referenceIso ist
// injizierbar, damit Tests deterministisch ohne Systemuhr laufen koennen.
async function getLlmUsageToday(politicianId = null, referenceIso = null) {
  const today = dayKey(referenceIso || new Date().toISOString());
  const store = await readAuthStore();
  const all = Array.isArray(store.llmUsage) ? store.llmUsage : [];
  const scoped = politicianId
    ? all.filter((e) => e.politicianId === politicianId || e.userId === politicianId)
    : all;
  const todays = scoped.filter((e) => dayKey(e.createdAt) === today);
  // "skipped-*"-Eintraege sind reine Info (kein echter LLM-Call) und zaehlen
  // NICHT gegen das Budget — sonst wuerde ein Skip das Budget weiter belasten.
  const billable = todays.filter((e) => !String(e.callType || "").startsWith("skipped"));
  const cost = billable.reduce((sum, e) => sum + (typeof e.estimatedCost === "number" ? e.estimatedCost : 0), 0);
  return {
    day: today,
    calls: billable.length,
    successfulCalls: billable.filter((e) => e.success !== false).length,
    estimatedCostUsd: Math.round(cost * 1e6) / 1e6
  };
}

// Kleiner Flag-Parser (1/true/on/yes = an). Lokal gehalten, damit storage.js
// keine zusaetzliche Abhaengigkeit bekommt.
function isFlagOn(value) {
  return ["1", "true", "on", "yes"].includes(String(value || "").trim().toLowerCase());
}

// V3-Vorbereitung (C1), Default AUS: Soll der Budget-Check im FEHLERFALL
// fail-CLOSED sein (KI-Call verweigern) statt fail-OPEN? Standard bleibt
// fail-open, damit ein Storage-Problem die bestehende App nicht lahmlegt. Erst
// wenn V3 die geteilten, teuren Understanding-Calls fahrt, wird per Flag scharf
// geschaltet (dann kostet ein Storage-Fehler lieber ein uebersprungenes Briefing
// als eine unkontrollierte KI-Rechnung).
function llmBudgetFailClosed() {
  return isFlagOn(process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED);
}

// Budget-Ergebnis, wenn die Nutzungsabfrage SELBST fehlschlaegt.
// Flag AUS -> allowed:true  (fail-open, bisheriges Verhalten, unveraendert).
// Flag AN  -> allowed:false (fail-closed).
function llmBudgetFailResult(limit) {
  const failClosed = llmBudgetFailClosed();
  return {
    allowed: !failClosed,
    used: null,
    limit: Number.isFinite(limit) ? limit : null,
    remaining: null,
    reason: failClosed ? "budget-check-failed-closed" : "budget-check-failed-open"
  };
}

// Pre-Call-Gate: Darf fuer dieses Mandat heute noch ein LLM-Call laufen?
// Gibt IMMER ein Objekt zurueck (nie throw) — der Aufrufer entscheidet, ob er
// bei allowed=false auf den Regelmotor zurueckfaellt. Fehlerfall: siehe
// llmBudgetFailResult (Default fail-OPEN, per Flag HELMUT_LLM_BUDGET_FAIL_CLOSED
// fail-CLOSED). Das Standardverhalten ist identisch zu vorher.
async function canSpendLlm(politicianId = null, referenceIso = null) {
  const limit = llmDailyCallLimit();
  try {
    const usage = await getLlmUsageToday(politicianId, referenceIso);
    const allowed = usage.calls < limit;
    return {
      allowed,
      used: usage.calls,
      limit: Number.isFinite(limit) ? limit : null,
      remaining: Number.isFinite(limit) ? Math.max(0, limit - usage.calls) : null,
      reason: allowed ? null : "daily-llm-budget-reached"
    };
  } catch (_) {
    return llmBudgetFailResult(limit);
  }
}

// --- Pipeline-Locking --------------------------------------------------------
// Verhindert, dass zwei parallele Vercel-Invocations denselben Crawl/Briefing-Job
// gleichzeitig ausfuehren und sich gegenseitig ueberschreiben.
// Fail-OPEN fuer Locks (return true bei Fehler): besser ein doppelter Run als
// ein dauerhaft blockierter Job. TTL als Sicherheitsnetz gegen abgebrochene Runs.
async function acquirePipelineLock(jobName, ttlMs = 10 * 60 * 1000) {
  try {
    const store = await readAuthStore();
    const locks = store.pipelineLocks || {};
    const existing = locks[jobName];
    if (existing && existing.expiresAt > Date.now()) {
      console.warn(`[pipelineLock] ${jobName} bereits gesperrt bis ${new Date(existing.expiresAt).toISOString()}`);
      return false;
    }
    locks[jobName] = { lockedAt: Date.now(), expiresAt: Date.now() + ttlMs };
    await writeAuthStore({ ...store, pipelineLocks: locks });
    return true;
  } catch (error) {
    console.error("[pipelineLock] acquire fehlgeschlagen, fail-open:", error.message);
    return true;
  }
}

async function releasePipelineLock(jobName) {
  try {
    const store = await readAuthStore();
    const locks = { ...(store.pipelineLocks || {}) };
    delete locks[jobName];
    await writeAuthStore({ ...store, pipelineLocks: locks });
  } catch (error) {
    console.error("[pipelineLock] release fehlgeschlagen:", error.message);
  }
}

// --- Globaler Understanding-Lock (V3-Vorbereitung, C1 — standardmaessig INAKTIV) ---
// Der spaetere globale KI-"Understanding"-Call (1x pro NEUEM Vorgang, mandantenlos)
// darf nicht von zwei ueberlappenden Cron-Laeufen doppelt ausgefuehrt werden — sonst
// verdoppeln sich die KI-Kosten. Anders als die bestehenden per-Mandat-Locks
// (runSourceCrawl/runMorningBriefing) ist dieser Lock GLOBAL: ein fixer,
// mandantenloser jobName.
//
// Aktivierung NUR ueber Flag HELMUT_UNDERSTANDING_LOCK (1/true/on/yes). Solange das
// Flag aus ist (Default), sind beide Helfer NO-OPs: acquire liefert immer ein
// "granted"-Token (active:false) und schreibt NICHTS, release tut nichts. Es wird
// heute noch NIRGENDS aufgerufen — dies verdrahtet nur die Naht fuer die spaetere
// Understanding Engine, ohne V3-Logik zu bauen oder bestehendes Verhalten zu aendern.
const GLOBAL_UNDERSTANDING_LOCK = "global-understanding";

function understandingLockEnabled() {
  return isFlagOn(process.env.HELMUT_UNDERSTANDING_LOCK);
}

async function acquireGlobalUnderstandingLock(ttlMs = 10 * 60 * 1000) {
  if (!understandingLockEnabled()) {
    return { granted: true, active: false, jobName: GLOBAL_UNDERSTANDING_LOCK };
  }
  const granted = await acquirePipelineLock(GLOBAL_UNDERSTANDING_LOCK, ttlMs);
  return { granted, active: true, jobName: GLOBAL_UNDERSTANDING_LOCK };
}

async function releaseGlobalUnderstandingLock() {
  if (!understandingLockEnabled()) return;
  await releasePipelineLock(GLOBAL_UNDERSTANDING_LOCK);
}

// --- Helmut Core V3 Store (C5) — hinter Flag HELMUT_V3_STORE, standardmaessig AUS ---
// Schreibt/liest die relationalen V3-Tabellen (raw_documents, knowledge_objects).
// Wird HEUTE von keinem bestehenden Pfad aufgerufen — reine additive Naht.
// Sicherheitsgarantien:
//   - Flag AUS -> alle Funktionen sind inert (no-op / null / []). Die App laeuft
//     exakt wie bisher; bestehende Storage-Signaturen bleiben unveraendert.
//   - Supabase nicht verfuegbar -> inert statt Crash (kein Netzwerk, kein throw).
function v3StoreEnabled() {
  return isFlagOn(process.env.HELMUT_V3_STORE);
}

// V3-Objekte liegen in relationalen Supabase-Tabellen. Ohne konfiguriertes Supabase
// sind die Funktionen inert (kein Crash), bis der Store bereitsteht.
function v3StoreReady() {
  return v3StoreEnabled() && Boolean(process.env.SUPABASE_URL) && Boolean(supabaseServiceRoleKey());
}

function v3SkipReason() {
  return v3StoreEnabled() ? "v3-store-unavailable" : "v3-store-disabled";
}

function pickColumns(obj = {}, columns) {
  const row = {};
  for (const col of columns) {
    if (obj[col] !== undefined) row[col] = obj[col];
  }
  return row;
}

const V3_RAW_DOCUMENT_COLUMNS = [
  "id", "canonical_url", "content_hash", "cluster_id", "title", "summary", "url",
  "source_name", "source_id", "source_type", "confidence", "link_type",
  "published_at", "retrieved_at", "document_type", "wahlperiode", "raw", "created_at"
];

const V3_KNOWLEDGE_OBJECT_COLUMNS = [
  "id", "vorgang_id", "ko_version", "headline",
  "was_ist_passiert", "warum_wichtig", "wer_ist_betroffen",
  "parteien", "ausschuesse", "ministerien", "risiken", "chancen",
  "zeitdruck", "handlungsempfehlung", "confidence_score", "source_document_count", "status",
  "understanding_status",
  "mentioned_people", "mentioned_mps", "mentioned_parties", "mentioned_committees",
  "mentioned_ministries", "mentioned_locations", "mentioned_organizations",
  "policy_field", "political_level", "instrument", "stage", "tags", "deadline",
  "best_source_url", "best_link_type", "source_trust",
  "understanding_model", "understanding_tokens", "created_at", "updated_at"
];

async function v3Upsert(table, row, onConflict) {
  const rows = await supabaseRequest(`/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(row)
  });
  return Array.isArray(rows) && rows.length ? rows[0] : row;
}

async function saveRawDocument(doc = {}) {
  if (!v3StoreReady()) return { skipped: true, reason: v3SkipReason() };
  if (!doc.id) return { skipped: true, reason: "missing-id" };
  try {
    const saved = await v3Upsert("raw_documents", pickColumns(doc, V3_RAW_DOCUMENT_COLUMNS), "id");
    return { saved: true, id: saved.id || doc.id };
  } catch (error) {
    console.error("[v3Store] saveRawDocument fehlgeschlagen:", error.message);
    return { skipped: true, reason: "v3-store-error", error: error.message };
  }
}

async function saveKnowledgeObject(ko = {}) {
  if (!v3StoreReady()) return { skipped: true, reason: v3SkipReason() };
  if (!ko.id || !ko.vorgang_id) return { skipped: true, reason: "missing-id-or-vorgang" };
  try {
    const saved = await v3Upsert("knowledge_objects", pickColumns(ko, V3_KNOWLEDGE_OBJECT_COLUMNS), "id");
    return { saved: true, id: saved.id || ko.id, vorgangId: saved.vorgang_id || ko.vorgang_id };
  } catch (error) {
    console.error("[v3Store] saveKnowledgeObject fehlgeschlagen:", error.message);
    return { skipped: true, reason: "v3-store-error", error: error.message };
  }
}

async function getKnowledgeObjectById(id) {
  if (!v3StoreReady() || !id) return null;
  try {
    const rows = await supabaseRequest(`/rest/v1/knowledge_objects?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch (error) {
    console.error("[v3Store] getKnowledgeObjectById fehlgeschlagen:", error.message);
    return null;
  }
}

async function getKnowledgeObjectByVorgang(vorgangId) {
  if (!v3StoreReady() || !vorgangId) return null;
  try {
    const rows = await supabaseRequest(`/rest/v1/knowledge_objects?vorgang_id=eq.${encodeURIComponent(vorgangId)}&select=*&order=updated_at.desc&limit=1`);
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch (error) {
    console.error("[v3Store] getKnowledgeObjectByVorgang fehlgeschlagen:", error.message);
    return null;
  }
}

async function listKnowledgeObjects({ limit = 50, status = null } = {}) {
  if (!v3StoreReady()) return [];
  try {
    const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : 50;
    let endpoint = `/rest/v1/knowledge_objects?select=*&order=updated_at.desc&limit=${safeLimit}`;
    if (status) endpoint += `&status=eq.${encodeURIComponent(status)}`;
    const rows = await supabaseRequest(endpoint);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.error("[v3Store] listKnowledgeObjects fehlgeschlagen:", error.message);
    return [];
  }
}

// --- Helmut Core V3 — C7a/C7b/C7c Storage-Naht (additiv, keine KI) -----------
// Eigene Flags pro Engine (Default AUS). Steuern das VERHALTEN der Engines
// (matching.js / briefing.js / lazyUnderstanding.js). Die Storage-Writes unten
// gaten wie C5 auf v3StoreReady() -> Flag aus/kein Supabase = inert, kein Crash.
function v3MatchingEnabled() {
  return isFlagOn(process.env.HELMUT_V3_MATCHING);
}
function v3BriefingEnabled() {
  return isFlagOn(process.env.HELMUT_V3_BRIEFING);
}
function v3LazyUnderstandingEnabled() {
  return isFlagOn(process.env.HELMUT_V3_LAZY_UNDERSTANDING);
}

// pgvector erwartet den Vektor als Literal '[a,b,c]' (nicht als JSON-Array).
function formatVector(arr) {
  return `[${(Array.isArray(arr) ? arr : []).map((n) => (Number.isFinite(Number(n)) ? Number(n) : 0)).join(",")}]`;
}

// C7a: Merkmalsvektor des Nutzerprofils EINMALIG speichern (bei Profiländerung neu).
async function saveProfileEmbedding(entry = {}) {
  if (!v3StoreReady()) return { skipped: true, reason: v3SkipReason() };
  if (!entry.user_id) return { skipped: true, reason: "missing-user" };
  if (!Array.isArray(entry.embedding) || !entry.embedding.length) return { skipped: true, reason: "missing-embedding" };
  try {
    const row = {
      user_id: entry.user_id,
      embedding: formatVector(entry.embedding),
      profile_hash: entry.profile_hash || null,
      dim: entry.dim || entry.embedding.length,
      updated_at: new Date().toISOString()
    };
    const saved = await v3Upsert("profile_embeddings", row, "user_id");
    return { saved: true, userId: saved.user_id || entry.user_id };
  } catch (error) {
    console.error("[v3Store] saveProfileEmbedding fehlgeschlagen:", error.message);
    return { skipped: true, reason: "v3-store-error", error: error.message };
  }
}

async function getProfileEmbedding(userId) {
  if (!v3StoreReady() || !userId) return null;
  try {
    const rows = await supabaseRequest(`/rest/v1/profile_embeddings?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`);
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch (error) {
    console.error("[v3Store] getProfileEmbedding fehlgeschlagen:", error.message);
    return null;
  }
}

// C7a: pgvector-Aehnlichkeitssuche via RPC (harte Filter Partei/Ausschuss/Wahlkreis
// laufen in SQL). Ohne Store/Supabase inert (kein Netzwerk).
async function matchKnowledgeObjectsByEmbedding(params = {}) {
  if (!v3StoreReady()) return { skipped: true, reason: v3SkipReason(), results: [] };
  const embedding = params.embedding;
  if (!Array.isArray(embedding) || !embedding.length) return { skipped: true, reason: "missing-embedding", results: [] };
  try {
    const body = {
      query_embedding: formatVector(embedding),
      match_count: Math.max(1, Math.floor(Number(params.matchCount) || 20)),
      filter_parties: params.filterParties && params.filterParties.length ? params.filterParties : null,
      filter_committees: params.filterCommittees && params.filterCommittees.length ? params.filterCommittees : null,
      filter_regions: params.filterRegions && params.filterRegions.length ? params.filterRegions : null
    };
    const rows = await supabaseRequest(`/rest/v1/rpc/match_knowledge_objects`, {
      method: "POST",
      body: JSON.stringify(body)
    });
    return { results: Array.isArray(rows) ? rows : [] };
  } catch (error) {
    console.error("[v3Store] matchKnowledgeObjectsByEmbedding fehlgeschlagen:", error.message);
    return { skipped: true, reason: "v3-store-error", error: error.message, results: [] };
  }
}

// C7a: erklaerbare Match-Ergebnisse pro Nutzer x Vorgang speichern (Bulk-Upsert).
async function saveMatchingResults(rows = []) {
  if (!v3StoreReady()) return { skipped: true, reason: v3SkipReason(), saved: 0 };
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r && r.id && r.user_id);
  if (!list.length) return { skipped: true, reason: "no-rows", saved: 0 };
  try {
    const payload = list.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      knowledge_object_id: r.knowledge_object_id || null,
      vorgang_id: r.vorgang_id || null,
      similarity: r.similarity != null ? r.similarity : null,
      rank: r.rank != null ? r.rank : null,
      matched_features: Array.isArray(r.matched_features) ? r.matched_features : [],
      filters: r.filters && typeof r.filters === "object" ? r.filters : {}
    }));
    await v3Upsert("matching_results", payload, "id");
    return { saved: payload.length };
  } catch (error) {
    console.error("[v3Store] saveMatchingResults fehlgeschlagen:", error.message);
    return { skipped: true, reason: "v3-store-error", error: error.message, saved: 0 };
  }
}

async function listMatchingResults({ userId = null, limit = 50 } = {}) {
  if (!v3StoreReady()) return [];
  try {
    const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : 50;
    let endpoint = `/rest/v1/matching_results?select=*&order=created_at.desc&limit=${safeLimit}`;
    if (userId) endpoint += `&user_id=eq.${encodeURIComponent(userId)}`;
    const rows = await supabaseRequest(endpoint);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.error("[v3Store] listMatchingResults fehlgeschlagen:", error.message);
    return [];
  }
}

// C7c: Vorgang als 'pending' vormerken (noch NICHT verstanden, KEIN KI-Call).
// Idempotent: ein bereits vorhandenes KO wird NIE ueberschrieben.
async function savePendingKnowledgeObject(vorgangId, meta = {}) {
  if (!v3StoreReady()) return { skipped: true, reason: v3SkipReason() };
  if (!vorgangId) return { skipped: true, reason: "missing-vorgang" };
  try {
    const existing = await getKnowledgeObjectByVorgang(vorgangId);
    if (existing) return { skipped: true, reason: "exists", id: existing.id, status: existing.status };
    const row = {
      id: `ko-${vorgangId}`,
      vorgang_id: vorgangId,
      status: "pending",
      understanding_status: "pending", // explizit (nicht nur DB-Default) -> C8 findet ihn
      source_document_count: Number(meta.source_document_count) || 0,
      headline: meta.headline ? String(meta.headline).slice(0, 300) : null
    };
    const saved = await v3Upsert("knowledge_objects", pickColumns(row, V3_KNOWLEDGE_OBJECT_COLUMNS), "id");
    return { saved: true, id: saved.id || row.id, status: "pending" };
  } catch (error) {
    console.error("[v3Store] savePendingKnowledgeObject fehlgeschlagen:", error.message);
    return { skipped: true, reason: "v3-store-error", error: error.message };
  }
}

// C8: die von C7c vorgemerkten Vorgaenge holen, die C8 noch verstehen soll.
// status='pending' = noch nicht verstanden; understanding_status='failed' wird
// bewusst NICHT erneut versucht (geparkt), sonst laeuft ein kaputter Vorgang
// jeden Lauf erneut ins KI-Budget. Inert wenn Flag/Supabase aus (kein Crash).
async function listPendingKnowledgeObjects({ limit = 50 } = {}) {
  const rows = await listKnowledgeObjects({ status: "pending", limit });
  return (Array.isArray(rows) ? rows : []).filter((ko) => ko && ko.understanding_status !== "failed");
}

// C8: minimierte raw_documents der letzten 30 Tage aus dem V3-Store holen.
// Liefert die Zeilen, die runPendingUnderstandingShadow als rawDocsOrItems benoetigt.
// Inert wenn v3StoreReady() false ist (kein Crash, leeres Array).
async function listRecentRawDocuments(limit = 500) {
  if (!v3StoreReady()) return [];
  try {
    const cutoffIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const rows = await supabaseRequest(
      `/rest/v1/raw_documents?select=id,content_hash,canonical_url,title,summary,url,source_name,source_id,published_at&created_at=gte.${encodeURIComponent(cutoffIso)}&order=created_at.desc&limit=${limit}`
    );
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.error("[v3Store] listRecentRawDocuments fehlgeschlagen:", error.message);
    return [];
  }
}

// C8: einen Vorgang als KI-Fehlschlag markieren, OHNE Analyse zu speichern.
// status bleibt 'pending' -> Matching (C7a) schliesst ihn weiter aus, er wird
// nie ausgeliefert. understanding_status='failed' parkt ihn (keine Endlos-Retries).
// Nur ein bereits existierendes (pending) KO wird so aktualisiert.
async function markUnderstandingFailed(vorgangId, meta = {}) {
  if (!v3StoreReady()) return { skipped: true, reason: v3SkipReason() };
  if (!vorgangId) return { skipped: true, reason: "missing-vorgang" };
  return saveKnowledgeObject({
    id: `ko-${vorgangId}`,
    vorgang_id: vorgangId,
    status: "pending",
    understanding_status: "failed",
    ...(meta.headline ? { headline: String(meta.headline).slice(0, 300) } : {}),
    ...(meta.understanding_model ? { understanding_model: String(meta.understanding_model).slice(0, 120) } : {})
  });
}

// C7b: gerendertes Briefing pro Nutzer/Slot in die V3-briefings-Tabelle schreiben.
async function saveRenderedBriefingV3(entry = {}) {
  if (!v3StoreReady()) return { skipped: true, reason: v3SkipReason() };
  if (!entry.id || !entry.user_id) return { skipped: true, reason: "missing-id-or-user" };
  try {
    const row = {
      id: entry.id,
      user_id: entry.user_id,
      slot: entry.slot || null,
      generated_at: entry.generated_at || new Date().toISOString(),
      payload: entry.payload && typeof entry.payload === "object" ? entry.payload : {}
    };
    const saved = await v3Upsert("briefings", row, "id");
    return { saved: true, id: saved.id || entry.id };
  } catch (error) {
    console.error("[v3Store] saveRenderedBriefingV3 fehlgeschlagen:", error.message);
    return { skipped: true, reason: "v3-store-error", error: error.message };
  }
}

// --- Helmut Core V3 — C9: Buero-Engine-Outputs (hinter HELMUT_V3_OFFICE) -------
// Speichert / liest generierte Kommunikations-Outputs (Rede, PM, Social usw.).
// Inert wenn v3StoreReady() false ist. Idempotent: PK = office-{userId}-{vorgangId}-{channel}.
// DSGVO: kein Freitext-Prompt, keine PII ausser user_id (RLS-geschuetzt).

const V3_OFFICE_OUTPUT_COLUMNS = ["id", "user_id", "knowledge_object_id", "decision_id", "channel", "content", "model"];

function officeOutputId(userId, vorgangId, channel) {
  return `office-${userId}-${vorgangId}-${channel}`.slice(0, 200);
}

function officeDailyLimit() {
  const raw = Number(process.env.HELMUT_OFFICE_DAILY_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 10;
}

async function saveOfficeOutput(entry = {}) {
  if (!v3StoreReady()) return { skipped: true, reason: v3SkipReason() };
  if (!entry.id || !entry.user_id || !entry.channel || !entry.content) {
    return { skipped: true, reason: "missing-fields" };
  }
  try {
    const saved = await v3Upsert("office_outputs", pickColumns(entry, V3_OFFICE_OUTPUT_COLUMNS), "id");
    return { saved: true, id: saved.id || entry.id };
  } catch (error) {
    console.error("[v3Store] saveOfficeOutput fehlgeschlagen:", error.message);
    return { skipped: true, reason: "v3-store-error" };
  }
}

async function getOfficeOutput(userId, vorgangId, channel) {
  if (!v3StoreReady() || !userId || !vorgangId || !channel) return null;
  const id = officeOutputId(userId, vorgangId, channel);
  try {
    const rows = await supabaseRequest(`/rest/v1/office_outputs?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch (error) {
    console.error("[v3Store] getOfficeOutput fehlgeschlagen:", error.message);
    return null;
  }
}

async function listOfficeOutputsByUser(userId, vorgangId = null) {
  if (!v3StoreReady() || !userId) return [];
  try {
    const koFilter = vorgangId ? `&knowledge_object_id=eq.${encodeURIComponent(`ko-${vorgangId}`)}` : "";
    const rows = await supabaseRequest(
      `/rest/v1/office_outputs?user_id=eq.${encodeURIComponent(userId)}${koFilter}&select=*&order=created_at.desc&limit=50`
    );
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.error("[v3Store] listOfficeOutputsByUser fehlgeschlagen:", error.message);
    return [];
  }
}

// Rate-Gate: Wie viele Office-Outputs hat dieser Nutzer heute generiert?
// Fail-OPEN: Bei Fehler oder fehlendem Store -> immer erlaubt (inert ohne DB).
async function canSpendOfficeOutput(userId, referenceIso = null) {
  const limit = officeDailyLimit();
  if (!v3StoreReady() || !userId) return { allowed: true, used: 0, limit, remaining: limit };
  try {
    const today = dayKey(referenceIso || new Date().toISOString());
    const todayNum = Number(today.slice(8, 10));
    const tomorrow = `${today.slice(0, 8)}${String(todayNum + 1).padStart(2, "0")}`;
    const rows = await supabaseRequest(
      `/rest/v1/office_outputs?select=id&user_id=eq.${encodeURIComponent(userId)}&created_at=gte.${today}T00:00:00Z&created_at=lt.${tomorrow}T00:00:00Z&limit=${limit + 1}`
    );
    const used = Array.isArray(rows) ? rows.length : 0;
    return { allowed: used < limit, used, limit, remaining: Math.max(0, limit - used) };
  } catch (_) {
    return { allowed: true, used: null, limit, remaining: null, reason: "check-failed-open" };
  }
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

// homeSections wird beim Lesen ohnehin auf <=3 Eintraege pro Sektion eingedampft
// (server.js compactHomeSections). Die volle, mehrere zehn KB grosse Variante zu
// persistieren ist reine Blob-Last ohne Output-Unterschied. Wir trimmen daher schon
// beim Speichern auf die ausgelieferte Groesse.
const HOME_SECTION_KEYS = [
  "topTasks", "changedSinceLastVisit", "needsAttention", "opportunities",
  "risks", "situational", "governmentPlans", "partyFaction"
];

function compactStoredBriefing(briefing) {
  if (!briefing || typeof briefing !== "object" || !briefing.homeSections) return briefing;
  const trimmed = {};
  for (const key of HOME_SECTION_KEYS) {
    if (Array.isArray(briefing.homeSections[key])) {
      trimmed[key] = briefing.homeSections[key].slice(0, 3);
    } else if (briefing.homeSections[key] !== undefined) {
      trimmed[key] = briefing.homeSections[key];
    }
  }
  return { ...briefing, homeSections: { ...briefing.homeSections, ...trimmed } };
}

function compactStore(store) {
  const rawItems = compactRawItems(store.rawItems || []);
  return {
    ...store,
    rawItems,
    briefings: keepLatestPerOwner(store.briefings, "generatedAt", "date", 4, 320).map(compactStoredBriefing),
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
    pipelineDebugReports: keepLatestPerOwner(store.pipelineDebugReports, "createdAt", "createdAt", 2, 200),
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
  ).slice(0, 160);
  const protectedHashes = new Set(protectedPersonItems.map((item) => item.hash || item.id).filter(Boolean));
  const generalItems = sortByDate(
    sanitized.filter((item) => !protectedHashes.has(item.hash || item.id)),
    "publishedAt",
    "retrievedAt"
  ).slice(0, 440);
  return sortByDate([...protectedPersonItems, ...generalItems], "publishedAt", "retrievedAt").slice(0, 600);
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
  // Nur explizit als custom markierte Quellen behalten. Verwaiste Eintraege (frueher
  // geseedet, jetzt nicht mehr in v1Sources) werden ignoriert -> Code ist die Wahrheit.
  // Damit greift die Quellen-Kuratierung auch bei bereits befuelltem Store (Supabase).
  const customSources = storedSources.filter(
    (source) => source.custom === true && !v1Sources.some((defaultSource) => defaultSource.id === source.id)
  );
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
  const key = pKey(briefing.politicianId);
  const store = await readStore(key);
  const briefingWithMeta = {
    ...briefing,
    generatedAt: new Date().toISOString()
  };
  store.briefings = [briefingWithMeta, ...store.briefings.filter((entry) => entry.id !== briefing.id)].slice(0, 2000);
  await writeStore(store, key);
  return briefingWithMeta;
}

async function getLatestBriefing(politicianId) {
  const pStore = await readStore(pKey(politicianId));
  const found = (pStore.briefings || []).find((briefing) => briefing.politicianId === politicianId) || null;
  if (found) return found;
  // Fallback: Bestandsdaten aus dem Main-Store waehrend der Migration
  const mainStore = await readStore("main");
  return (mainStore.briefings || []).find((briefing) => briefing.politicianId === politicianId) || null;
}

async function getTopicMemory(politicianId) {
  const pStore = await readStore(pKey(politicianId));
  const persisted = (pStore.topicMemory || []).filter((entry) => !politicianId || entry.politicianId === politicianId);
  let briefings = pStore.briefings || [];
  if (!briefings.length) {
    const mainStore = await readStore("main");
    briefings = mainStore.briefings || [];
  }
  const derived = buildTopicMemoryFromBriefings(briefings, politicianId);
  if (persisted.length) return mergeTopicMemoryEntries(persisted, derived);
  return derived;
}

async function updateTopicMemoryFromBriefing(briefing) {
  const key = pKey(briefing.politicianId);
  const store = await readStore(key);
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
  await writeStore(store, key);
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
  const key = pKey(check.politicianId);
  const store = await readStore(key);
  const now = new Date().toISOString();
  const entry = {
    id: check.id || `lage-check-${check.politicianId || "unknown"}-${Date.now()}`,
    createdAt: check.createdAt || now,
    checkedAt: check.checkedAt || now,
    ...check
  };
  store.lageChecks = [entry, ...(store.lageChecks || []).filter((item) => item.id !== entry.id)].slice(0, 2000);
  await writeStore(store, key);
  return entry;
}

async function getLatestLageCheck(politicianId) {
  const pStore = await readStore(pKey(politicianId));
  const found = (pStore.lageChecks || []).find((check) => !politicianId || check.politicianId === politicianId);
  if (found) return found;
  const mainStore = await readStore("main");
  return (mainStore.lageChecks || []).find((check) => !politicianId || check.politicianId === politicianId) || null;
}

async function getLageChecks(politicianId, limit = 12) {
  const pStore = await readStore(pKey(politicianId));
  const checks = (pStore.lageChecks || []).filter((check) => !politicianId || check.politicianId === politicianId);
  if (checks.length) return checks.slice(0, limit);
  const mainStore = await readStore("main");
  return (mainStore.lageChecks || []).filter((check) => !politicianId || check.politicianId === politicianId).slice(0, limit);
}

async function savePipelineDebugReport(report) {
  const key = pKey(report.politicianId);
  const store = await readStore(key);
  const entry = {
    id: report.id || `pipeline-debug-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...report
  };
  store.pipelineDebugReports = [entry, ...(store.pipelineDebugReports || []).filter((item) => item.id !== entry.id)].slice(0, 20);
  await writeStore(store, key);
  return entry;
}

async function getLatestPipelineDebugReport(politicianId) {
  const pStore = await readStore(pKey(politicianId));
  return (pStore.pipelineDebugReports || []).find((report) => !politicianId || report.politicianId === politicianId) || null;
}

async function saveTask(task) {
  const key = pKey(task.politicianId);
  const store = await readStore(key);
  const taskWithMeta = {
    ...task,
    updatedAt: new Date().toISOString()
  };
  const existingIndex = store.tasks.findIndex((entry) => entry.id === taskWithMeta.id);
  if (existingIndex >= 0) store.tasks[existingIndex] = { ...store.tasks[existingIndex], ...taskWithMeta };
  else store.tasks.unshift(taskWithMeta);
  await writeStore(store, key);
  return taskWithMeta;
}

async function getTasks(politicianId) {
  const pStore = await readStore(pKey(politicianId));
  const tasks = (pStore.tasks || []).filter((task) => !politicianId || task.politicianId === politicianId);
  if (tasks.length) return tasks;
  const mainStore = await readStore("main");
  return (mainStore.tasks || []).filter((task) => !politicianId || task.politicianId === politicianId);
}

async function updateTaskStatus(taskId, status, politicianId) {
  const key = pKey(politicianId);
  const store = await readStore(key);
  const task = store.tasks.find((entry) => entry.id === taskId);
  if (!task) {
    // Fallback: Task koennte noch im Main-Store liegen
    const mainStore = await readStore("main");
    const mainTask = mainStore.tasks.find((entry) => entry.id === taskId);
    if (!mainTask) return null;
    mainTask.status = status;
    mainTask.updatedAt = new Date().toISOString();
    await writeStore(mainStore, "main");
    return mainTask;
  }
  task.status = status;
  task.updatedAt = new Date().toISOString();
  await writeStore(store, key);
  return task;
}

async function saveInteraction(interaction) {
  const key = pKey(interaction.politicianId);
  const store = await readStore(key);
  const entry = {
    id: interaction.id || `interaction-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...interaction
  };
  store.interactions = [entry, ...store.interactions].slice(0, 4000);
  store.personalizedRecommendations = updateRecommendationFromInteraction(store.personalizedRecommendations || [], entry);
  await writeStore(store, key);
  return entry;
}

async function getInteractions(politicianId) {
  const pStore = await readStore(pKey(politicianId));
  const interactions = (pStore.interactions || []).filter((entry) => !politicianId || entry.politicianId === politicianId);
  if (interactions.length) return interactions;
  const mainStore = await readStore("main");
  return (mainStore.interactions || []).filter((entry) => !politicianId || entry.politicianId === politicianId);
}

// Feedback wird im Main-Store als flache Liste gehalten, damit der Admin alle
// Rueckmeldungen mandatsuebergreifend sehen kann. Additiv, kein bestehendes Feld.
async function saveFeedback(feedback = {}) {
  const store = await readStore("main");
  store.feedback = store.feedback || [];
  const entry = {
    id: `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    done: false,
    ...feedback
  };
  store.feedback = [entry, ...store.feedback].slice(0, 2000);
  await writeStore(store, "main");
  return entry;
}

async function listFeedback(limit = 100) {
  const store = await readStore("main");
  return (store.feedback || []).slice(0, Math.max(0, limit));
}

async function setFeedbackDone(id, done = true) {
  const store = await readStore("main");
  store.feedback = store.feedback || [];
  const entry = store.feedback.find((item) => item.id === id);
  if (!entry) return null;
  entry.done = !!done;
  entry.updatedAt = new Date().toISOString();
  await writeStore(store, "main");
  return entry;
}

async function getProfile(profileId) {
  return (await readStore()).profiles?.[profileId] || null;
}

// Vollstaendige Mandatsprofile (alle Felder) fuer die Admin-Ansicht. Read-only.
async function listFullProfiles() {
  const store = await readStore();
  return Object.values(store.profiles || {});
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
  const key = pKey(politicianId);
  const store = await readStore(key);
  const others = (store.personalizedRecommendations || []).filter((entry) => entry.user_id !== politicianId);
  store.personalizedRecommendations = [...recommendations, ...others].slice(0, 4000);
  await writeStore(store, key);
  return recommendations;
}

async function savePoliticalItems(items = [], politicianId) {
  const key = pKey(politicianId);
  const store = await readStore(key);
  const byId = new Map((store.politicalItems || []).map((item) => [item.id, item]));
  items.forEach((item) => byId.set(item.id, { ...(byId.get(item.id) || {}), ...item }));
  store.politicalItems = Array.from(byId.values()).sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0)).slice(0, 1000);
  await writeStore(store, key);
  return items;
}

async function savePriorityChanges(changes = [], politicianId) {
  if (!changes.length) return [];
  const key = pKey(politicianId);
  const store = await readStore(key);
  store.priorityChanges = [...changes, ...(store.priorityChanges || [])].slice(0, 500);
  await writeStore(store, key);
  return changes;
}

async function getUserNotes(politicianId) {
  const pStore = await readStore(pKey(politicianId));
  const notes = (pStore.userNotes || []).filter((note) => !politicianId || note.user_id === politicianId);
  if (notes.length) return notes;
  const mainStore = await readStore("main");
  return (mainStore.userNotes || []).filter((note) => !politicianId || note.user_id === politicianId);
}

async function saveUserNote(note) {
  const ownerPoliticianId = note.user_id || note.politicianId;
  const key = pKey(ownerPoliticianId);
  const store = await readStore(key);
  const now = new Date().toISOString();
  const noteWithMeta = {
    id: note.id || `note-${Date.now()}`,
    user_id: ownerPoliticianId || "unknown",
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
  await writeStore(store, key);
  return noteWithMeta;
}

async function savePushSubscription(politicianId, subscription, meta = {}) {
  const key = pKey(politicianId);
  const store = await readStore(key);
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
  await writeStore(store, key);
  return entry;
}

async function removePushSubscription(politicianId, endpoint) {
  const key = pKey(politicianId);
  const store = await readStore(key);
  const before = (store.pushSubscriptions || []).length;
  store.pushSubscriptions = (store.pushSubscriptions || []).filter((item) => {
    if (politicianId && item.politicianId !== politicianId) return true;
    return item.endpoint !== endpoint;
  });
  await writeStore(store, key);
  return { removed: before - store.pushSubscriptions.length };
}

async function getPushSubscriptions(politicianId) {
  const pStore = await readStore(pKey(politicianId));
  return (pStore.pushSubscriptions || []).filter((item) => item.active !== false && (!politicianId || item.politicianId === politicianId));
}

async function savePushEvent(event) {
  const key = pKey(event.politicianId);
  const store = await readStore(key);
  const entry = {
    id: event.id || `push-event-${event.politicianId || "unknown"}-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...event
  };
  store.pushEvents = [entry, ...(store.pushEvents || []).filter((item) => item.id !== entry.id)].slice(0, 200);
  await writeStore(store, key);
  return entry;
}

async function getPushEventByDedupeKey(politicianId, dedupeKey) {
  if (!dedupeKey) return null;
  const pStore = await readStore(pKey(politicianId));
  return (pStore.pushEvents || []).find((event) => event.politicianId === politicianId && event.dedupeKey === dedupeKey) || null;
}

async function listPushEvents(politicianId, limit = 200) {
  const pStore = await readStore(pKey(politicianId));
  const events = (pStore.pushEvents || []).filter((event) => !politicianId || event.politicianId === politicianId);
  return events.slice(0, Math.max(0, limit));
}

async function exportProfileData(politicianId) {
  const [store, pStore] = await Promise.all([readStore("main"), readStore(pKey(politicianId))]);
  const profile = store.profiles?.[politicianId] || null;
  return {
    exportedAt: new Date().toISOString(),
    politicianId,
    profile,
    mandateProfile: store.mandateProfiles?.[politicianId] || null,
    briefings: profileRows(pStore.briefings, politicianId),
    tasks: profileRows(pStore.tasks, politicianId),
    interactions: profileRows(pStore.interactions, politicianId),
    topicMemory: profileRows(pStore.topicMemory, politicianId),
    politicalItems: userRows(pStore.politicalItems, politicianId),
    personalizedRecommendations: userRows(pStore.personalizedRecommendations, politicianId),
    dailyTasks: userRows(pStore.dailyTasks, politicianId),
    communicationDrafts: userRows(pStore.communicationDrafts, politicianId),
    userNotes: userRows(pStore.userNotes, politicianId),
    priorityChanges: userRows(pStore.priorityChanges, politicianId),
    lageChecks: profileRows(pStore.lageChecks, politicianId),
    pushSubscriptions: profileRows(pStore.pushSubscriptions, politicianId).map(redactPushSubscription),
    pushEvents: profileRows(pStore.pushEvents, politicianId),
    pipelineDebugReports: profileRows(pStore.pipelineDebugReports, politicianId),
    rawItems: profileRawItems(store.rawItems, profile, politicianId)
  };
}

async function deleteProfileData(politicianId) {
  const [store, pStore] = await Promise.all([readStore("main"), readStore(pKey(politicianId))]);
  const profile = store.profiles?.[politicianId] || null;
  const before = dataCounts(store, pStore, politicianId, profile);

  if (store.profiles) delete store.profiles[politicianId];
  if (store.mandateProfiles) delete store.mandateProfiles[politicianId];
  store.rawItems = (store.rawItems || []).filter((item) => !rawItemBelongsToProfile(item, profile, politicianId));
  await writeStore(store, "main");
  // Politiker-Store vollstaendig leeren
  await writeStore(defaultPoliticianStore(), pKey(politicianId));

  const emptyPStore = defaultPoliticianStore();
  const after = dataCounts(store, emptyPStore, politicianId, null);
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

function dataCounts(mainStore, pStore, politicianId, profile) {
  return {
    profile: mainStore.profiles?.[politicianId] ? 1 : 0,
    mandateProfile: mainStore.mandateProfiles?.[politicianId] ? 1 : 0,
    briefings: profileRows(pStore.briefings, politicianId).length,
    tasks: profileRows(pStore.tasks, politicianId).length,
    interactions: profileRows(pStore.interactions, politicianId).length,
    topicMemory: profileRows(pStore.topicMemory, politicianId).length,
    politicalItems: userRows(pStore.politicalItems, politicianId).length,
    personalizedRecommendations: userRows(pStore.personalizedRecommendations, politicianId).length,
    dailyTasks: userRows(pStore.dailyTasks, politicianId).length,
    communicationDrafts: userRows(pStore.communicationDrafts, politicianId).length,
    userNotes: userRows(pStore.userNotes, politicianId).length,
    priorityChanges: userRows(pStore.priorityChanges, politicianId).length,
    lageChecks: profileRows(pStore.lageChecks, politicianId).length,
    pushSubscriptions: profileRows(pStore.pushSubscriptions, politicianId).length,
    pushEvents: profileRows(pStore.pushEvents, politicianId).length,
    pipelineDebugReports: profileRows(pStore.pipelineDebugReports, politicianId).length,
    rawItems: profileRawItems(mainStore.rawItems, profile, politicianId).length
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

// --- Admin Dashboard Stats (additiv, rein lesend) ---

// Ordnet einen LLM-callType einer Produktkategorie zu.
// intelligence: Vorgänge verstehen + KI-Scoring (V2/V3).
// briefing:     personalisierte Einschätzungen und Kommunikationsentwürfe.
// office:       Büro-Engine-Outputs (Reden, PM, Social).
function categorizeLlmCallType(callType) {
  const ct = String(callType || "").toLowerCase();
  if (ct === "understanding" || ct.includes("v2score") || ct.includes("parliament")) return "intelligence";
  if (ct.includes("briefing") || ct === "helmutassessment" || ct === "communicationdraft") return "briefing";
  if (ct.includes("office")) return "office";
  return "other";
}

// KI-Kostenauswertung über `days` Tage. Liest nur den Auth-Store (llmUsage).
async function getAdminStatsCosts({ days = 30, referenceIso = null } = {}) {
  const store = await readAuthStore();
  const allUsage = Array.isArray(store.llmUsage) ? store.llmUsage : [];
  const refMs = referenceIso ? new Date(referenceIso).getTime() : Date.now();
  const cutoffMs = refMs - days * 24 * 60 * 60 * 1000;
  const relevant = allUsage.filter((e) => {
    const ms = new Date(e.createdAt || 0).getTime();
    return ms >= cutoffMs && !String(e.callType || "").startsWith("skipped");
  });

  const totalCalls = relevant.length;
  const successfulCalls = relevant.filter((e) => e.success !== false).length;
  const totalCostUsd = Math.round(relevant.reduce((s, e) => s + (typeof e.estimatedCost === "number" ? e.estimatedCost : 0), 0) * 1e6) / 1e6;
  const totalTokens = relevant.reduce((s, e) => s + (typeof e.totalTokens === "number" ? e.totalTokens : 0), 0);

  const perModel = {};
  const perCategory = {};
  const byDay = {};

  for (const e of relevant) {
    const model = e.model || "unknown";
    if (!perModel[model]) perModel[model] = { calls: 0, successfulCalls: 0, estimatedCostUsd: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    perModel[model].calls++;
    if (e.success !== false) perModel[model].successfulCalls++;
    if (typeof e.estimatedCost === "number") perModel[model].estimatedCostUsd += e.estimatedCost;
    if (typeof e.promptTokens === "number") perModel[model].promptTokens += e.promptTokens;
    if (typeof e.completionTokens === "number") perModel[model].completionTokens += e.completionTokens;
    if (typeof e.totalTokens === "number") perModel[model].totalTokens += e.totalTokens;

    const cat = categorizeLlmCallType(e.callType);
    if (!perCategory[cat]) perCategory[cat] = { calls: 0, successfulCalls: 0, estimatedCostUsd: 0 };
    perCategory[cat].calls++;
    if (e.success !== false) perCategory[cat].successfulCalls++;
    if (typeof e.estimatedCost === "number") perCategory[cat].estimatedCostUsd += e.estimatedCost;

    const d = dayKey(e.createdAt);
    if (!byDay[d]) byDay[d] = { day: d, calls: 0, successfulCalls: 0, estimatedCostUsd: 0, totalTokens: 0 };
    byDay[d].calls++;
    if (e.success !== false) byDay[d].successfulCalls++;
    if (typeof e.estimatedCost === "number") byDay[d].estimatedCostUsd += e.estimatedCost;
    if (typeof e.totalTokens === "number") byDay[d].totalTokens += e.totalTokens;
  }

  for (const v of Object.values(perModel)) v.estimatedCostUsd = Math.round(v.estimatedCostUsd * 1e6) / 1e6;
  for (const v of Object.values(perCategory)) v.estimatedCostUsd = Math.round(v.estimatedCostUsd * 1e6) / 1e6;
  const byDayArr = Object.values(byDay)
    .map((d) => ({ ...d, estimatedCostUsd: Math.round(d.estimatedCostUsd * 1e6) / 1e6 }))
    .sort((a, b) => b.day.localeCompare(a.day));

  return {
    periodDays: days,
    totalCalls,
    successfulCalls,
    failedCalls: totalCalls - successfulCalls,
    totalCostUsd,
    totalTokens,
    perModel,
    perCategory,
    byDay: byDayArr,
    priceTableUsd: llmPriceTable()
  };
}

// Crawl-Statistik über `days` Tage. Liest Main-Store (crawlRuns, rawItems).
async function getAdminStatsCrawl({ days = 30, referenceIso = null } = {}) {
  const store = await readStore("main");
  const refMs = referenceIso ? new Date(referenceIso).getTime() : Date.now();
  const cutoffMs = refMs - days * 24 * 60 * 60 * 1000;

  const allRuns = store.crawlRuns || [];
  const allRawItems = store.rawItems || [];
  const recentRuns = allRuns.filter((r) => new Date(r.createdAt || 0).getTime() >= cutoffMs);
  const recentRawItems = allRawItems.filter((item) => new Date(item.retrievedAt || item.publishedAt || 0).getTime() >= cutoffMs);

  const crawlByDay = {};
  for (const run of recentRuns) {
    const d = dayKey(run.createdAt);
    if (!crawlByDay[d]) crawlByDay[d] = { day: d, runs: 0, checkedSources: 0, successfulSources: 0, failedSources: 0, newCandidateItems: 0, savedItems: 0 };
    const b = crawlByDay[d];
    b.runs++;
    b.checkedSources += run.checkedSources || 0;
    b.successfulSources += run.successfulSources || 0;
    b.failedSources += run.failedSources || 0;
    b.newCandidateItems += run.newCandidateItems || 0;
    b.savedItems += run.savedItems || 0;
  }

  const rawByDay = {};
  for (const item of recentRawItems) {
    const d = dayKey(item.retrievedAt || item.publishedAt || "");
    if (!d) continue;
    if (!rawByDay[d]) rawByDay[d] = { day: d, articles: 0 };
    rawByDay[d].articles++;
  }

  return {
    periodDays: days,
    totalCrawlRuns: recentRuns.length,
    totalCheckedSources: recentRuns.reduce((s, r) => s + (r.checkedSources || 0), 0),
    totalSuccessfulSources: recentRuns.reduce((s, r) => s + (r.successfulSources || 0), 0),
    totalFailedSources: recentRuns.reduce((s, r) => s + (r.failedSources || 0), 0),
    totalSavedArticles: recentRuns.reduce((s, r) => s + (r.savedItems || 0), 0),
    totalNewCandidateItems: recentRuns.reduce((s, r) => s + (r.newCandidateItems || 0), 0),
    recentRawItemCount: recentRawItems.length,
    totalRawItemCount: allRawItems.length,
    latestCrawlRun: allRuns[0] || null,
    crawlByDay: Object.values(crawlByDay).sort((a, b) => b.day.localeCompare(a.day)),
    rawByDay: Object.values(rawByDay).sort((a, b) => b.day.localeCompare(a.day))
  };
}

// Kombinierte Übersicht für tägliche/wöchentliche Stats. Inklusive V3-Daten (falls aktiv).
async function getAdminStatsOverview({ days = 1, referenceIso = null } = {}) {
  const [crawl, costs] = await Promise.all([
    getAdminStatsCrawl({ days, referenceIso }),
    getAdminStatsCosts({ days, referenceIso })
  ]);

  let v3 = null;
  if (v3StoreReady()) {
    try {
      const refMs = referenceIso ? new Date(referenceIso).getTime() : Date.now();
      const cutoffIso = new Date(refMs - days * 24 * 60 * 60 * 1000).toISOString();
      const [rawDocs, kos] = await Promise.all([
        supabaseRequest(`/rest/v1/raw_documents?select=id,created_at&created_at=gte.${cutoffIso}&limit=1000`).catch(() => []),
        supabaseRequest(`/rest/v1/knowledge_objects?select=id,status,understanding_status,created_at&created_at=gte.${cutoffIso}&limit=500`).catch(() => [])
      ]);
      const rawDocsArr = Array.isArray(rawDocs) ? rawDocs : [];
      const kosArr = Array.isArray(kos) ? kos : [];
      v3 = {
        newRawDocuments: rawDocsArr.length,
        newKnowledgeObjects: kosArr.length,
        kosByStatus: kosArr.reduce((acc, ko) => { acc[ko.status || "unknown"] = (acc[ko.status || "unknown"] || 0) + 1; return acc; }, {}),
        kosByUnderstandingStatus: kosArr.reduce((acc, ko) => { acc[ko.understanding_status || "unknown"] = (acc[ko.understanding_status || "unknown"] || 0) + 1; return acc; }, {})
      };
    } catch (error) {
      v3 = { error: error.message };
    }
  }

  return {
    period: days === 1 ? "daily" : days <= 7 ? "weekly" : "monthly",
    periodDays: days,
    generatedAt: new Date().toISOString(),
    crawl: {
      runs: crawl.totalCrawlRuns,
      checkedSources: crawl.totalCheckedSources,
      successfulSources: crawl.totalSuccessfulSources,
      failedSources: crawl.totalFailedSources,
      savedArticles: crawl.totalSavedArticles,
      newCandidateItems: crawl.totalNewCandidateItems,
      recentRawItems: crawl.recentRawItemCount,
      totalRawItemsInStore: crawl.totalRawItemCount,
      latestCrawlAt: crawl.latestCrawlRun?.createdAt || null
    },
    ai: {
      totalCalls: costs.totalCalls,
      successfulCalls: costs.successfulCalls,
      failedCalls: costs.failedCalls,
      totalCostUsd: costs.totalCostUsd,
      totalTokens: costs.totalTokens,
      perCategory: costs.perCategory,
      perModel: costs.perModel
    },
    v3: v3 || { note: "V3-Store nicht aktiv (HELMUT_V3_STORE nicht gesetzt)" }
  };
}

// Detaillierter Bericht für den letzten Crawl-Lauf.
// Kombiniert Store-Daten (Crawl-Metriken, Fehler) mit V3-Supabase-Abfragen
// (neue raw_documents, knowledge_objects). Kein KI-Call.
async function getAdminStatsCrawlReport() {
  const store = await readStore("main");
  const allRuns = store.crawlRuns || [];
  const latestRun = allRuns[0] || null;

  if (!latestRun) {
    return {
      generatedAt: new Date().toISOString(),
      lastCrawlAt: null,
      noData: true
    };
  }

  const scannedArticles = latestRun.newCandidateItems || 0;
  const deduplicatedArticles = latestRun.savedItems || 0;
  const errorCount = Array.isArray(latestRun.errors) ? latestRun.errors.length : 0;
  const errors = Array.isArray(latestRun.errors) ? latestRun.errors : [];

  let newRawDocuments = null;
  let newKnowledgeObjects = null;
  let newVorgaenge = null;
  let v3Note = null;

  if (v3StoreReady()) {
    try {
      const cutoffIso = latestRun.createdAt;
      const [rawDocs, kos] = await Promise.all([
        supabaseRequest(`/rest/v1/raw_documents?select=id,created_at&created_at=gte.${encodeURIComponent(cutoffIso)}&limit=2000`).catch(() => []),
        supabaseRequest(`/rest/v1/knowledge_objects?select=id,vorgang_id,created_at&created_at=gte.${encodeURIComponent(cutoffIso)}&limit=1000`).catch(() => [])
      ]);
      const rawDocsArr = Array.isArray(rawDocs) ? rawDocs : [];
      const kosArr = Array.isArray(kos) ? kos : [];
      newRawDocuments = rawDocsArr.length;
      newKnowledgeObjects = kosArr.length;
      const vorgangIds = new Set(kosArr.map((ko) => ko.vorgang_id).filter(Boolean));
      newVorgaenge = vorgangIds.size;
    } catch (error) {
      v3Note = error.message;
    }
  } else {
    v3Note = v3SkipReason();
  }

  return {
    generatedAt: new Date().toISOString(),
    lastCrawlAt: latestRun.createdAt,
    mode: latestRun.mode || "full",
    scannedArticles,
    deduplicatedArticles,
    checkedSources: latestRun.checkedSources || 0,
    successfulSources: latestRun.successfulSources || 0,
    failedSources: latestRun.failedSources || 0,
    newVorgaenge,
    newKnowledgeObjects,
    newRawDocuments,
    durationSec: null,
    errorCount,
    errors,
    ...(v3Note ? { v3Note } : {})
  };
}

// KI-Kosten aggregiert pro Nutzer (userId oder politicianId) über `days` Tage.
async function getAdminCostsPerUser({ days = 30 } = {}) {
  const store = await readAuthStore();
  const allUsage = Array.isArray(store.llmUsage) ? store.llmUsage : [];
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const relevant = allUsage.filter((e) => {
    const ms = new Date(e.createdAt || 0).getTime();
    return ms >= cutoffMs && !String(e.callType || "").startsWith("skipped");
  });

  const byUser = {};
  let totalCostUsd = 0;
  for (const e of relevant) {
    const uid = e.userId || e.politicianId || "unbekannt";
    if (!byUser[uid]) byUser[uid] = { userId: uid, totalCostUsd: 0, calls: 0 };
    const c = typeof e.estimatedCost === "number" ? e.estimatedCost : 0;
    byUser[uid].totalCostUsd += c;
    byUser[uid].calls++;
    totalCostUsd += c;
  }

  return {
    periodDays: days,
    totalCostUsd: Math.round(totalCostUsd * 1e6) / 1e6,
    perUser: Object.values(byUser)
      .map((u) => ({ ...u, totalCostUsd: Math.round(u.totalCostUsd * 1e6) / 1e6 }))
      .sort((a, b) => b.totalCostUsd - a.totalCostUsd)
  };
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
  acquirePipelineLock,
  releasePipelineLock,
  acquireGlobalUnderstandingLock,
  releaseGlobalUnderstandingLock,
  understandingLockEnabled,
  v3StoreEnabled,
  v3MatchingEnabled,
  v3BriefingEnabled,
  v3LazyUnderstandingEnabled,
  saveRawDocument,
  saveKnowledgeObject,
  getKnowledgeObjectById,
  getKnowledgeObjectByVorgang,
  listKnowledgeObjects,
  saveProfileEmbedding,
  getProfileEmbedding,
  matchKnowledgeObjectsByEmbedding,
  saveMatchingResults,
  listMatchingResults,
  savePendingKnowledgeObject,
  listPendingKnowledgeObjects,
  listRecentRawDocuments,
  markUnderstandingFailed,
  saveRenderedBriefingV3,
  saveOfficeOutput,
  getOfficeOutput,
  listOfficeOutputsByUser,
  canSpendOfficeOutput,
  officeOutputId,
  recordLlmUsage,
  getLlmUsage,
  getLlmUsageToday,
  canSpendLlm,
  llmBudgetFailResult,
  maxCandidatesPerBriefing,
  estimateLlmCost,
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
  listFullProfiles,
  saveProfile,
  saveFeedback,
  listFeedback,
  setFeedbackDone,
  savePersonalizedRecommendations,
  savePoliticalItems,
  savePriorityChanges,
  getUserNotes,
  saveUserNote,
  savePushSubscription,
  removePushSubscription,
  getPushSubscriptions,
  savePushEvent,
  getPushEventByDedupeKey,
  listPushEvents,
  getAdminStatsCosts,
  getAdminStatsCrawl,
  getAdminStatsOverview,
  getAdminStatsCrawlReport,
  getAdminCostsPerUser,
  getKnowledgeObjectCount,
  getAdminPeriodStats
};

// Kosten + V3-Counts (Artikel, KOs, Briefings) für einen bestimmten Zeitraum.
// Wird für "Heute" (days=1) und "30 Tage" (days=30) parallel aufgerufen;
// der Cache sorgt dafür, dass Store-Reads nicht doppelt stattfinden.
async function getAdminPeriodStats(days = 30) {
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString();

  const [perUserData, aiData] = await Promise.all([
    getAdminCostsPerUser({ days }),
    getAdminStatsCosts({ days })
  ]);

  let articles = null;
  let kos = null;
  if (v3StoreReady()) {
    try {
      const [rawDocsRes, kosRes] = await Promise.all([
        supabaseRequest(`/rest/v1/raw_documents?select=count&created_at=gte.${encodeURIComponent(cutoffIso)}`).catch(() => null),
        supabaseRequest(`/rest/v1/knowledge_objects?select=count&created_at=gte.${encodeURIComponent(cutoffIso)}`).catch(() => null)
      ]);
      articles = Array.isArray(rawDocsRes) && rawDocsRes[0] ? Number(rawDocsRes[0].count) : null;
      kos = Array.isArray(kosRes) && kosRes[0] ? Number(kosRes[0].count) : null;
    } catch {}
  }

  const store = await readStore("main");
  const briefings = (store.briefings || []).filter((b) => {
    return new Date(b.generatedAt || b.date || 0).getTime() >= cutoffMs;
  }).length;

  return {
    periodDays: days,
    totalCostUsd: perUserData.totalCostUsd,
    totalCalls: aiData.totalCalls,
    perUser: perUserData.perUser,
    perCategory: aiData.perCategory,
    articles,
    kos,
    briefings
  };
}

async function getKnowledgeObjectCount() {
  if (!v3StoreReady()) return null;
  try {
    const rows = await supabaseRequest("/rest/v1/knowledge_objects?select=count");
    return Array.isArray(rows) && rows[0] ? (Number(rows[0].count) || 0) : null;
  } catch {
    return null;
  }
}
