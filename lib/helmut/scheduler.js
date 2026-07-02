const { crawlAllSources } = require("./crawler");
const { enrichBriefingWithAI, enrichBriefingWithAiV2, isEngineV2Enabled, generateHelmutAssessment } = require("./ai");

// Datenmotor V2: Flag OFF -> exakt bisheriger Regel-+Enrich-Pfad. Flag ON ->
// hybrides KI-Scoring (Kandidaten bewerten -> Top priorisieren). Ein einziger
// Umschaltpunkt, damit sich das Verhalten sonst nirgends aendert.
function enrichBriefing(briefing, profile) {
  return isEngineV2Enabled() ? enrichBriefingWithAiV2(briefing, profile) : enrichBriefingWithAI(briefing, profile);
}
const { personalizeBriefing } = require("./personalization");
const {
  getLatestBriefing,
  getLatestCrawlRun,
  getLatestLageCheck,
  getInteractions,
  getProfile,
  getRawItemsSince,
  getSources,
  getTopicMemory,
  saveBriefing,
  saveCrawlRun,
  saveLageCheck,
  savePersonalizedRecommendations,
  savePipelineDebugReport,
  savePoliticalItems,
  savePriorityChanges,
  saveRawItems,
  updateTopicMemoryFromBriefing,
  acquirePipelineLock,
  releasePipelineLock,
  canSpendLlm,
  recordLlmUsage,
  saveRawDocument,
  v3StoreEnabled
} = require("./storage");
const { cemInceProfile, demoSources, generateBriefing } = require("./runtime");
const { isDipEnabled, getRelevantParliamentaryItems } = require("./dip");
const { toRawDocumentRow, dedupeRawDocuments } = require("./dedup");

const decisionTriggerTerms = [
  "Anhörung",
  "Ausschuss",
  "beschließt",
  "Beschluss",
  "Bundeskabinett",
  "Debatte",
  "Entwurf",
  "Eckpunkte",
  "fordert",
  "Gesetzentwurf",
  "Gesetz",
  "Kabinett",
  "Kritik",
  "kündigt",
  "legt vor",
  "Paket",
  "Pflegereform",
  "plant",
  "Reform",
  "Sparvorschläge",
  "Stellungnahme",
  "Tagesordnung",
  "Verordnung",
  "Finanzierung",
  "kürzen",
  "streichen",
  "warnt"
];

const weakProtocolTerms = [
  "G7",
  "ILO",
  "Delegation",
  "besucht",
  "begrüßt",
  "eröffnet",
  "Karrierevideo",
  "Konferenz",
  "nimmt an Treffen",
  "reiste",
  "zu Gast"
];

const lageCheckSourceLimit = Number(process.env.HELMUT_LAGE_CHECK_SOURCE_LIMIT || 90);
const lageCheckRecentHours = Number(process.env.HELMUT_LAGE_CHECK_RECENT_HOURS || 8);
const lageCheckRegenerateThreshold = Number(process.env.HELMUT_LAGE_CHECK_REGENERATE_THRESHOLD || 65);
const topTopicCooldownHours = Number(process.env.HELMUT_TOP_TOPIC_COOLDOWN_HOURS || 36);

// V3-Vorbereitung (C3), Default AUS: Soll DIP als hochwertige PRIMAERQUELLE
// behandelt werden? Flag AUS = exakt bisheriges Verhalten (DIP als Zusatzquelle,
// ohne linkType/priority). Flag AN = amtlicher Direktlink + hohe Prioritaet, damit
// die Drucksache Kandidaten-Deckel/Retention ueberlebt und im Client nicht als
// "unpraeziser" Link ausgeblendet wird (die dokumentierte DIP-Falle).
function dipPrimaryEnabled() {
  return ["1", "true", "on", "yes"].includes(String(process.env.HELMUT_DIP_PRIMARY || "").trim().toLowerCase());
}

// Reine Abbildung einer DIP-Drucksache auf das Helmut-rawItem-Format (testbar,
// ohne Netzwerk). Bei primary=false identisch zum bisherigen Verhalten.
function dipDocToRawItem(doc = {}, { primary = false } = {}) {
  const base = {
    id: `dip-${doc.id}`,
    hash: `dip-${doc.id}`,
    title: doc.title,
    summary: [(doc.urheber || []).join(", "), (doc.ressort || []).join(", ")].filter(Boolean).join(" · "),
    url: doc.url,
    publishedAt: doc.date || new Date().toISOString(),
    retrievedAt: new Date().toISOString(),
    sourceName: "DIP Bundestag",
    sourceId: "dip",
    sourceType: "bundestag",
    confidence: "high",
    documentType: doc.type,
    wahlperiode: doc.wahlperiode
  };
  if (!primary) return base;
  const hasDirectUrl = /^https?:\/\//i.test(String(doc.url || ""));
  return {
    ...base,
    priority: 95,
    sourcePriority: 95,
    // linkType nur setzen, wenn wirklich ein Direktlink vorliegt — sonst wuerde der
    // Client eine leere/unaufloesbare Quelle faelschlich als "direct" behandeln.
    ...(hasDirectUrl ? { linkType: "direct" } : {})
  };
}

// Konvertiert DIP-Drucksachen in das Helmut-rawItem-Format fuer den gemeinsamen Scoring-Pfad.
async function fetchDipAsRawItems(profile) {
  try {
    const { items } = await getRelevantParliamentaryItems(profile);
    const primary = dipPrimaryEnabled();
    return items.map((doc) => dipDocToRawItem(doc, { primary }));
  } catch (error) {
    console.error("[fetchDipAsRawItems] Fehler:", error.message);
    return [];
  }
}

// V3-Schatten (C6): dedupliziert die Rohitems kanonisch und schreibt MINIMIERTE,
// DSGVO-datensparsame raw_documents (kein Volltext/PII). Nur wenn HELMUT_V3_STORE
// aktiv ist — sonst kompletter No-Op. FAIL-SAFE: Fehler hier duerfen den Crawl NIE
// beeinflussen (kein throw, kein Einfluss auf Blob, Briefing oder Crawl-Ergebnis).
async function persistRawDocumentsShadow(items) {
  if (!v3StoreEnabled() || !Array.isArray(items) || !items.length) {
    return { skipped: true, persisted: 0 };
  }
  try {
    const rows = dedupeRawDocuments(items.map(toRawDocumentRow).filter((row) => row && row.id));
    let persisted = 0;
    for (const row of rows) {
      const result = await saveRawDocument(row);
      if (result && result.saved) persisted += 1;
    }
    return { persisted, deduped: rows.length, candidates: items.length };
  } catch (error) {
    console.error("[persistRawDocumentsShadow] Fehler (ignoriert):", error.message);
    return { persisted: 0, error: error.message };
  }
}

async function runSourceCrawl(politicianId = cemInceProfile.id, options = {}) {
  const lockName = `crawl-${politicianId}`;
  const locked = await acquirePipelineLock(lockName, 15 * 60 * 1000);
  if (!locked) {
    console.warn(`[runSourceCrawl] Job läuft bereits für ${politicianId}, übersprungen.`);
    return { skipped: true, reason: "already running" };
  }
  try {
    const profile = await getActiveProfile(politicianId);
    const allSources = await getSourcesForProfile(profile);
    const mode = options.mode || "full";
    const selectedSources = mode === "lage-check"
      ? selectLageCheckSources(allSources, Number(options.sourceLimit || lageCheckSourceLimit))
      : allSources;
    const crawl = await crawlAllSources(selectedSources);
    // DIP: amtliche Bundestags-Drucksachen ergänzen (nur wenn DIP_API_KEY gesetzt;
    // als Primärquelle behandelt, wenn HELMUT_DIP_PRIMARY aktiv ist). Fail-safe:
    // ohne Key oder bei Fehlern kommt [] zurück, der Crawl läuft normal weiter.
    const dipRawItems = isDipEnabled() ? await fetchDipAsRawItems(profile) : [];
    const savedItems = await saveRawItems([...crawl.rawItems, ...dipRawItems]);
    // V3-Schatten (C6): parallel in raw_documents spiegeln (Default AUS = No-Op).
    // Beeinflusst weder Blob noch Briefing noch das zurueckgegebene Crawl-Ergebnis.
    await persistRawDocumentsShadow(savedItems).catch(() => {});
    const run = await saveCrawlRun({
      mode,
      checkedSources: crawl.checkedSources,
      successfulSources: crawl.successfulSources,
      failedSources: crawl.failedSources,
      newCandidateItems: crawl.newCandidateItems + dipRawItems.length,
      savedItems: savedItems.length,
      errors: crawl.results.filter((result) => !result.ok).map((result) => ({ sourceName: result.sourceName, error: result.error }))
    });
    return { ...run, savedItemsList: savedItems };
  } finally {
    await releasePipelineLock(lockName);
  }
}

// skipAi=true: schnelle, regelbasierte, personalisierte Briefing-Erzeugung OHNE
// KI-Aufrufe (fuer On-Demand beim Oeffnen vieler Mandate, ohne Timeout/Kosten).
// Cron und manuelles Aktualisieren laufen weiterhin mit KI (skipAi=false).
async function runMorningBriefing(politicianId = cemInceProfile.id, { skipAi = false } = {}) {
  const lockName = `briefing-${politicianId}`;
  const locked = await acquirePipelineLock(lockName, 5 * 60 * 1000);
  if (!locked) {
    console.warn(`[runMorningBriefing] Job läuft bereits für ${politicianId}, übersprungen.`);
    return null;
  }
  try {
  const profile = await getActiveProfile(politicianId);
  // Kostenkontrolle: pro Mandat/Tag nur begrenzt viele LLM-Calls. Budget erreicht
  // -> gesamter Briefing-Lauf bleibt regelbasiert (kein KI-Call), Skip wird als
  // Info geloggt (zaehlt NICHT ins Budget). skipAi hat weiterhin Vorrang.
  const budget = skipAi ? { allowed: false, reason: "skipAi" } : await canSpendLlm(profile.id);
  const useAi = budget.allowed;
  if (!skipAi && !useAi) {
    await recordLlmUsage({ callType: "skipped-budget", politicianId: profile.id, model: "none", success: true, error: `LLM-Tagesbudget erreicht (${budget.used}/${budget.limit})` });
    console.warn(`[runMorningBriefing] LLM-Tagesbudget erreicht für ${profile.id} (${budget.used}/${budget.limit}) — Regel-Fallback ohne KI.`);
  }
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const situationalSince = new Date(Date.now() - 72 * 60 * 60 * 1000);
  const mentionSince = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const recentItems = await getRawItemsSince(since);
  const situationalRecentItems = await getRawItemsSince(situationalSince);
  const mentionItems = await getRawItemsSince(mentionSince);
  const memoryEntries = await getTopicMemory(profile.id);
  const relevanceDiagnostics = analyzeItemsForProfile(recentItems, profile);
  const allRelevantItems = filterRelevantItemsForProfile(recentItems, profile);
  const sourceFreshRelevantItems = filterPreviouslyFeaturedItems(allRelevantItems, memoryEntries);
  const relevantItems = filterRecentlyFeaturedTopics(sourceFreshRelevantItems, memoryEntries, topTopicCooldownHours);
  const allSituationalItems = buildSituationalBriefingItems(situationalRecentItems, profile);
  const sourceFreshSituationalItems = filterPreviouslyFeaturedItems(allSituationalItems, memoryEntries);
  const situationalItems = filterRecentlyFeaturedTopics(sourceFreshSituationalItems, memoryEntries, topTopicCooldownHours);
  const promotedSituationalItems = relevantItems.length ? [] : promoteSituationalItemsToRawItems(situationalItems, profile);
  const fallbackPromotedSituationalItems = relevantItems.length ? promoteSituationalItemsToRawItems(situationalItems, profile) : [];
  const briefingInputItems = dedupePoliticalInputItems(relevantItems.length ? relevantItems : promotedSituationalItems);
  const liveBriefing = briefingInputItems.length ? temperSingleSourceMediaDecisions(generateBriefing(profile, briefingInputItems, demoSources)) : null;
  const linkStrictLiveBriefing = liveBriefing ? requirePreciseBriefingLinks(useAi ? await enrichBriefing(liveBriefing, profile) : liveBriefing) : null;
  const fallbackBriefingInputItems = dedupePoliticalInputItems(fallbackPromotedSituationalItems);
  const fallbackLiveBriefing = !hasDecisionValue(linkStrictLiveBriefing) && fallbackBriefingInputItems.length
    ? temperSingleSourceMediaDecisions(generateBriefing(profile, fallbackBriefingInputItems, demoSources))
    : null;
  const linkStrictFallbackBriefing = fallbackLiveBriefing ? requirePreciseBriefingLinks(useAi ? await enrichBriefing(fallbackLiveBriefing, profile) : fallbackLiveBriefing) : null;
  const selectedLiveBriefing = hasDecisionValue(linkStrictLiveBriefing)
    ? linkStrictLiveBriefing
    : hasDecisionValue(linkStrictFallbackBriefing)
      ? linkStrictFallbackBriefing
      : null;
  const usesLiveBriefing = Boolean(selectedLiveBriefing);
  const briefing = usesLiveBriefing
    ? selectedLiveBriefing
    : buildEmptyBriefing(profile, {
      status: "Live",
      fallbackReason: relevantItems.length
        ? "Live-Quellen wurden geprüft, aber Helmut hat daraus keine belastbare politische Entscheidung mit präzisem Artikellink erzeugt."
        : allRelevantItems.length && !relevantItems.length
          ? "Live-Quellen wurden geprüft. Relevante Themen waren bereits in den letzten 36 Stunden prominent; Helmut zeigt sie deshalb nicht erneut als neue Top-Lage."
          : promotedSituationalItems.length
          ? "Live-Quellen wurden geprüft, aber die Lage wurde nicht hoch genug oder nicht präzise genug verlinkt."
          : "Live-Quellen wurden geprüft, aber in den letzten 24 Stunden wurde keine relevante Entscheidungslage gefunden.",
      rawItems: recentItems,
      situationalBriefing: situationalItems
    });
  const latestCrawl = await getLatestCrawlRun();
  const briefingWithStatus = {
    ...briefing,
    status: usesLiveBriefing ? "Aktuell" : briefing.status,
    fallbackReason: usesLiveBriefing ? "" : briefing.fallbackReason,
    personMentions: findProfileMentions(mentionItems, profile),
    sourceRun: latestCrawl,
    sourceStats: latestCrawl || {
      checkedSources: 0,
      successfulSources: 0,
      failedSources: 0,
      savedItems: 0
    },
    liveSignals: liveBriefing?.topics?.length || 0,
    newSignals: usesLiveBriefing ? (briefing.topics?.length || briefing.items.length) : situationalItems.length
  };
  const briefingWithMemory = attachPoliticalMemory(briefingWithStatus, memoryEntries);
  const personalizedBriefing = personalizeBriefing(briefingWithMemory, profile, memoryEntries, await getInteractions(profile.id));
  const qualityCheckedBriefing = {
    ...personalizedBriefing,
    quality: assessBriefingQuality(personalizedBriefing)
  };
  const helmutAssessment = useAi ? await generateHelmutAssessment({ briefing: qualityCheckedBriefing, profile }) : "";
  const finalBriefing = {
    ...qualityCheckedBriefing,
    helmutAssessment
  };
  await savePoliticalItems(finalBriefing.politicalItems || [], profile.id);
  await savePersonalizedRecommendations(profile.id, finalBriefing.personalizedRecommendations || []);
  await savePriorityChanges(finalBriefing.priorityChanges || [], profile.id);
  const savedBriefing = await saveBriefing(finalBriefing);
  await updateTopicMemoryFromBriefing(savedBriefing);
  await savePipelineDebugReport(buildPipelineDebugReport({
    profile,
    latestCrawl,
    recentItems,
    situationalRecentItems,
    mentionItems,
    relevanceDiagnostics,
    relevantItems,
    suppressedRepeatedTopicItems: sourceFreshRelevantItems.length - relevantItems.length,
    situationalItems,
    suppressedRepeatedSituationalItems: sourceFreshSituationalItems.length - situationalItems.length,
    promotedSituationalItems,
    fallbackPromotedSituationalItems,
    briefingInputItems,
    liveBriefing,
    fallbackLiveBriefing,
    savedBriefing,
    usesLiveBriefing,
    aiBudget: budget,
    aiUsed: useAi
  }));
  return savedBriefing;
  } finally {
    await releasePipelineLock(lockName);
  }
}

async function runDailyPipeline(politicianId = cemInceProfile.id) {
  const crawl = await runSourceCrawl(politicianId);
  const briefing = await runMorningBriefing(politicianId);
  return { crawl, briefing };
}

async function runLageCheck(politicianId = cemInceProfile.id) {
  const profile = await getActiveProfile(politicianId);
  const latestBefore = await getLatestBriefing(profile.id);
  const allSources = await getSourcesForProfile(profile);
  const selectedSources = selectLageCheckSources(allSources, lageCheckSourceLimit);
  const crawl = await crawlAllSources(selectedSources);
  const savedItems = await saveRawItems(crawl.rawItems);
  const recentItems = await getRawItemsSince(new Date(Date.now() - lageCheckRecentHours * 60 * 60 * 1000));
  const memoryEntries = await getTopicMemory(profile.id);
  const relevantItems = filterRelevantItemsForProfile(recentItems, profile);
  const savedHashes = new Set(savedItems.map((item) => item.hash || item.id).filter(Boolean));
  const newRelevantItems = relevantItems.filter((item) => savedHashes.has(item.hash || item.id));
  const notPreviouslyFeatured = filterPreviouslyFeaturedItems(relevantItems, memoryEntries);
  const candidateBase = filterRecentlyFeaturedTopics(newRelevantItems.length ? newRelevantItems : notPreviouslyFeatured, memoryEntries, topTopicCooldownHours);
  const candidates = candidateBase
    .map((item) => ({ item, weight: itemPoliticalWeight(item, profile) }))
    .sort((a, b) => b.weight - a.weight);
  const topCandidate = candidates[0] || null;
  const shouldRegenerate = !latestBefore || Number(topCandidate?.weight || 0) >= lageCheckRegenerateThreshold;
  const status = shouldRegenerate && topCandidate ? "changed" : "stable";
  const check = await saveLageCheck({
    politicianId: profile.id,
    mode: "lage-check",
    status,
    checkedSources: crawl.checkedSources,
    successfulSources: crawl.successfulSources,
    failedSources: crawl.failedSources,
    newCandidateItems: crawl.newCandidateItems,
    savedItems: savedItems.length,
    relevantItems: relevantItems.length,
    newRelevantItems: newRelevantItems.length,
    regeneratedBriefing: false,
    sourceLimit: selectedSources.length,
    topChange: topCandidate ? lageCheckTopChange(topCandidate.item, topCandidate.weight) : null,
    message: topCandidate && status === "changed"
      ? `Neue Lage erkannt: ${topCandidate.item.title}. Helmut priorisiert neu.`
      : stableLageCheckMessage(latestBefore)
  });

  if (!shouldRegenerate) {
    return {
      ...check,
      briefing: latestBefore ? {
        id: latestBefore.id,
        status: isBriefingStale(latestBefore) ? "Veraltet" : latestBefore.status || "Aktuell",
        generatedAt: latestBefore.generatedAt || latestBefore.date
      } : null
    };
  }

  const briefing = await runMorningBriefing(profile.id);
  const updatedCheck = await saveLageCheck({
    ...check,
    regeneratedBriefing: true,
    briefingId: briefing.id,
    message: topCandidate
      ? `Neue Lage erkannt: ${topCandidate.item.title}. Deine Priorität wurde geprüft.`
      : "Noch kein Briefing vorhanden. Helmut hat die Lage neu aufgebaut."
  });
  return {
    ...updatedCheck,
    briefing
  };
}

function selectLageCheckSources(sources = [], limit = lageCheckSourceLimit) {
  const seen = new Set();
  return [...sources]
    .filter((source) => source && source.active !== false && !seen.has(source.id) && seen.add(source.id))
    .sort((a, b) => lageCheckSourceWeight(b) - lageCheckSourceWeight(a))
    .slice(0, Math.max(20, limit));
}

function lageCheckSourceWeight(source = {}) {
  const type = String(source.type || "").toLowerCase();
  const name = `${source.name || ""} ${source.id || ""}`.toLowerCase();
  const base = Number(source.priority || 0);
  const typeWeight = type === "person" ? 1000
    : ["ministry", "bundestag", "committee", "government"].includes(type) ? 900
      : ["party", "faction"].includes(type) ? 850
        : type === "association" ? 720
          : type === "media" ? 650
            : type === "local" ? 600
              : type === "social" ? 250
                : 400;
  const strategicBonus = /bmas|bundesregierung|bundestag|ausschuss|linke|linksfraktion|dgb|tagesschau|deutschlandfunk|person|news-suche/i.test(name) ? 120 : 0;
  return typeWeight + strategicBonus + base;
}

function lageCheckTopChange(item, weight) {
  const source = item.primarySource || item.sources?.[0] || item;
  return {
    title: item.title,
    sourceName: source.sourceName || item.sourceName || "",
    url: source.itemUrl || source.url || item.url || "",
    publishedAt: item.publishedAt,
    retrievedAt: item.retrievedAt,
    politicalWeight: weight
  };
}

function stableLageCheckMessage(latestBriefing) {
  const topTitle = latestBriefing?.themeOfDay?.title || latestBriefing?.items?.[0]?.title || latestBriefing?.helmutAssessment?.topic || "";
  if (topTitle) return `Priorität unverändert. Fokus bleibt auf ${topTitle}.`;
  return "Priorität unverändert. Helmut hat die Lage geprüft und hebt aktuell nichts Neues nach oben.";
}

function requirePreciseBriefingLinks(briefing) {
  const keptSignalIds = new Set();
  const items = (briefing.items || [])
    .map((item) => {
      const sources = preciseSources(item.sources || [item.primarySource].filter(Boolean));
      if (!sources.length) return null;
      keptSignalIds.add(item.signalId);
      const primarySource = sources[0];
      return {
        ...item,
        sources,
        primarySource,
        sourceCount: sources.length,
        taskTemplate: item.taskTemplate ? {
          ...item.taskTemplate,
          sources,
          primarySource
        } : item.taskTemplate
      };
    })
    .filter(Boolean);

  const tasks = (briefing.tasks || [])
    .filter((task) => keptSignalIds.has(task.sourceSignalId))
    .map((task) => {
      const sources = preciseSources(task.sources || [task.primarySource].filter(Boolean));
      return {
        ...task,
        sources,
        primarySource: sources[0] || null
      };
    })
    .filter((task) => task.primarySource);

  const themeOfDay = items.find((item) => item.signalId === briefing.themeOfDay?.signalId) || items[0] || null;
  const chanceOfDay = items.find((item) => item.signalId === briefing.chanceOfDay?.signalId) || briefing.chanceOfDay || null;
  const riskOfDay = items.find((item) => item.signalId === briefing.riskOfDay?.signalId) || briefing.riskOfDay || null;

  return {
    ...briefing,
    items,
    tasks,
    themeOfDay,
    chanceOfDay: chanceOfDay && keptSignalIds.has(chanceOfDay.signalId) ? chanceOfDay : null,
    riskOfDay: riskOfDay && keptSignalIds.has(riskOfDay.signalId) ? riskOfDay : null
  };
}

function preciseSources(sources) {
  const byUrl = new Map();
  for (const source of sources || []) {
    const url = isPreciseArticleUrl(source?.itemUrl, source) ? source.itemUrl
      : isPreciseArticleUrl(source?.url, source) ? source.url
      : isPreciseArticleUrl(source?.originalUrl, {}) ? source.originalUrl
      : "";
    if (!url || byUrl.has(url)) continue;
    byUrl.set(url, {
      ...source,
      itemUrl: url,
      url,
      linkType: "direct",
      linkResolutionNote: "Direkter Artikellink gefunden."
    });
  }
  return Array.from(byUrl.values());
}

async function getSourcesForProfile(profile) {
  const sharedSources = (await getSources()).filter((source) => source.type !== "person");
  return [personNewsSource(profile), ...mandateNewsSources(profile), ...sharedSources];
}

function personNewsSource(profile) {
  const fullName = String(profile.fullName || "").trim();
  const query = fullName ? `"${fullName}"` : `"${profile.id}"`;
  const archiveQuery = `${query} when:3m`;
  const encoded = encodeURIComponent(query);
  const encodedArchive = encodeURIComponent(archiveQuery);
  return {
    id: `${profile.id}-news`,
    name: `${fullName || profile.id} News-Suche`,
    type: "person",
    url: `https://news.google.com/search?q=${encoded}`,
    rssUrl: `https://news.google.com/rss/search?q=${encoded}&hl=de&gl=DE&ceid=DE:de`,
    rssUrls: [
      `https://news.google.com/rss/search?q=${encoded}&hl=de&gl=DE&ceid=DE:de`,
      `https://news.google.com/rss/search?q=${encodedArchive}&hl=de&gl=DE&ceid=DE:de`
    ],
    crawlMethod: "rss",
    priority: 100,
    maxItems: 30,
    active: true,
    queryTerms: personSearchTerms(profile)
  };
}

function mandateNewsSources(profile) {
  const topics = topProfileTopics(profile, 5);
  const committee = profile.committee || profile.committees?.[0] || "Arbeit und Soziales";
  const topicQuery = topics.slice(0, 5).join(" OR ");
  return [
    newsSearchSource({
      id: `${profile.id}-news-bundesregierung-vorhaben`,
      name: "Bundesregierung Vorhaben zu deinen Themen",
      query: `(Bundesregierung OR Bundeskabinett OR BMAS OR "Bundesministerium für Arbeit und Soziales") (${topicQuery}) (Gesetzentwurf OR Eckpunkte OR Reform OR Initiative OR Vorhaben OR Kabinett)`,
      priority: 94,
      queryTerms: ["Bundesregierung", "Bundeskabinett", "BMAS", "Gesetzentwurf", "Eckpunkte", "Reform", "Vorhaben", ...topics]
    }),
    newsSearchSource({
      id: `${profile.id}-news-fraktion-partei`,
      name: "Fraktion und Partei Lage",
      query: `("Die Linke" OR Linksfraktion OR "Die Linke im Bundestag") (${topicQuery})`,
      priority: 90,
      queryTerms: ["Die Linke", "Linksfraktion", "Die Linke im Bundestag", ...topics]
    }),
    newsSearchSource({
      id: `${profile.id}-news-bmas-vorhaben`,
      name: "BMAS Vorhaben Radar",
      query: `"Bundesministerium für Arbeit und Soziales" OR BMAS ${topics.slice(0, 3).join(" ")}`,
      priority: 88,
      queryTerms: ["BMAS", "Bundesministerium für Arbeit und Soziales", ...topics]
    }),
    newsSearchSource({
      id: `${profile.id}-news-ausschuss-themen`,
      name: `${committee} Themenradar`,
      query: `"${committee}" ${topics.slice(0, 4).join(" OR ")}`,
      priority: 84,
      queryTerms: [committee, ...topics]
    }),
    newsSearchSource({
      id: `${profile.id}-news-sozialpolitik-medien`,
      name: "Sozialpolitik Medienlage",
      query: `${topics.slice(0, 5).join(" OR ")} Bundesregierung Gesetzentwurf Reform`,
      priority: 78,
      queryTerms: ["Bundesregierung", "Gesetzentwurf", "Reform", ...topics]
    })
  ];
}

function newsSearchSource({ id, name, query, priority, queryTerms }) {
  const encoded = encodeURIComponent(query);
  return {
    id,
    name,
    type: "media",
    url: `https://news.google.com/search?q=${encoded}`,
    rssUrl: `https://news.google.com/rss/search?q=${encoded}&hl=de&gl=DE&ceid=DE:de`,
    rssUrls: [`https://news.google.com/rss/search?q=${encoded}&hl=de&gl=DE&ceid=DE:de`],
    crawlMethod: "rss",
    priority,
    maxItems: Number(process.env.HELMUT_PROFILE_NEWS_MAX_ITEMS || 24),
    active: true,
    queryTerms
  };
}

function topProfileTopics(profile, limit = 5) {
  const prioritized = Object.entries(profile.topicPriorities || {})
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
    .map(([topic]) => topic);
  return uniqueTerms([
    ...prioritized,
    ...(profile.focusTopics || []),
    "Bürgergeld",
    "Mindestlohn",
    "Rente",
    "Pflege",
    "Tarifbindung"
  ]).slice(0, limit);
}

function attachPoliticalMemory(briefing, memoryEntries) {
  const memoryByTopic = new Map((memoryEntries || []).map((entry) => [topicMemoryKey(entry.title || entry.topicKey), entry]));
  const items = (briefing.items || []).map((item) => {
    const memory = memoryByTopic.get(topicMemoryKey(item.topic || item.title));
    const lageMovement = buildLageMovement(item, memory);
    return {
      ...item,
      memory: buildMemoryNote(item, memory, lageMovement),
      lageMovement,
      lageMovementReason: lageMovement.reason,
      lageDevelopment: lageMovement.development,
      sourceFreshness: lageMovement.sourceFreshness,
      priorityTrend: lageMovement.priorityTrend
    };
  });
  return {
    ...briefing,
    items,
    topicMemory: (memoryEntries || []).slice(0, 8)
  };
}

function buildMemoryNote(item, memory, movement = null) {
  if (!memory || !memory.seenCount) {
    return {
      status: "new",
      label: "Neu in deiner Lage",
      summary: movement?.reason || "Zu diesem Thema liegt noch keine bisherige Linie in Helmut vor.",
      previousLine: "",
      suggestedNextStep: item.decision === "Beobachten" ? "Erst einordnen, dann entscheiden, ob du öffentlich gehst." : "Heute als neue Linie vorbereiten."
    };
  }
  const newSources = movement ? movement.hasFreshSource : hasFreshSourceAgainstMemory(item, memory);

  return {
    status: "recurring",
    label: newSources ? "Laufendes Thema · neue Quelle" : `Laufendes Thema · ${memory.seenCount + 1}. Kontaktpunkt`,
    summary: newSources
      ? `Das Thema war schon in deiner Lage. Heute liegt dazu aber eine neue Quelle oder ein neuer Beleg vor. Deine bisherige Linie war: ${memory.lastStatement || memory.lastAction || "Position vorbereiten."}`
      : `Helmut kennt dieses Thema bereits. Deine letzte Linie war: ${memory.lastStatement || memory.lastAction || "Position vorbereiten."}`,
    previousLine: memory.lastStatement || memory.lastAction || "",
    suggestedNextStep: nextStepFromMemory(item, memory),
    lastSeenAt: memory.lastSeenAt,
    seenCount: memory.seenCount
  };
}

function buildLageMovement(item, memory) {
  const sourceFreshness = sourceFreshnessForItem(item);
  const development = developmentForItem(item);
  const hasFreshSource = !memory || hasFreshSourceAgainstMemory(item, memory);
  const previousDecision = memory?.lastDecision || "";
  const currentDecision = item.decision || "";
  const previousSourceCount = Number(memory?.sourceCount || 0);
  const currentSourceCount = Number(item.sourceCount || item.sources?.length || 0);
  const government = hasGovernmentSignal(item);
  const committee = hasCommitteeSignal(item);
  const citizenImpact = hasCitizenImpactSignal(item);
  const decisionEscalated = decisionRank(currentDecision) > decisionRank(previousDecision);
  const decisionDeescalated = memory && decisionRank(currentDecision) < decisionRank(previousDecision);

  let priorityTrend = "stabil";
  let category = "Keine relevante Veränderung";
  let reason = "Die Lage bleibt stabil; keine neue Priorität wurde erkannt.";

  if (!memory) {
    priorityTrend = "neu";
    category = "Neue Entwicklung";
    reason = government
      ? "Neu, weil ein Bundesregierung- oder BMAS-Signal zu deinem Themenfeld vorliegt."
      : committee
        ? "Neu, weil ein Ausschuss- oder Fachbezug zu deinem Mandat erkennbar ist."
        : "Neu, weil eine frische Quelle einen politischen Anschluss an dein Mandat liefert.";
  } else if (decisionEscalated) {
    priorityTrend = "gestiegen";
    category = "Priorität gestiegen";
    reason = `Die Priorität ist gestiegen: aus ${previousDecision || "Beobachtung"} wird ${currentDecision || "Handlungsbedarf"}.`;
  } else if (decisionDeescalated) {
    priorityTrend = "gesunken";
    category = "Druck sinkt";
    reason = "Der politische Druck sinkt; das Thema bleibt bekannt, muss aber nicht höher gezogen werden.";
  } else if (hasFreshSource) {
    priorityTrend = "neue quelle";
    category = "Neue Quelle";
    reason = currentSourceCount > previousSourceCount
      ? `Neue Quellenlage: ${currentSourceCount} belastbare Signale statt bisher ${previousSourceCount || 1}.`
      : "Das Thema ist bekannt, aber heute liegt eine neue Quelle oder ein neuer Beleg vor.";
  } else if (sourceFreshness.level === "stale") {
    category = "Nicht frisch genug";
    reason = "Das Thema ist bekannt und die Quelle ist nicht frisch genug für eine neue Top-Lage.";
  }

  if (government && !/Bundesregierung|BMAS/i.test(reason)) reason = `${reason} Relevant ist vor allem der mögliche Bezug zu Bundesregierung oder BMAS.`;
  if (committee && !/Ausschuss|Mandat/i.test(reason)) reason = `${reason} Der Ausschussbezug macht es für dein Mandat prüfenswert.`;
  if (citizenImpact && !/Menschen|Betroffene|sozial/i.test(reason)) reason = `${reason} Außerdem betrifft es potenziell viele Menschen.`;

  return {
    category,
    reason: compactReason(reason),
    development,
    sourceFreshness: sourceFreshness.label,
    isFreshSource: sourceFreshness.level !== "stale",
    hasFreshSource,
    priorityTrend
  };
}

function sourceFreshnessForItem(item = {}) {
  const date = new Date(item.publishedAt || item.retrievedAt || item.createdAt || 0);
  if (Number.isNaN(date.getTime())) return { level: "unknown", label: "Frische unklar" };
  const ageHours = Math.max(0, (Date.now() - date.getTime()) / (60 * 60 * 1000));
  if (ageHours <= 12) return { level: "today", label: "heute neu" };
  if (ageHours <= 36) return { level: "fresh", label: "frisch" };
  if (ageHours <= 72) return { level: "recent", label: "laufende Entwicklung" };
  return { level: "stale", label: "ältere Quelle" };
}

function developmentForItem(item = {}) {
  const source = item.primarySource || item.sources?.[0] || {};
  const excerpt = source.excerpt || item.excerpt || item.summary || item.content || "";
  const sourceName = source.sourceName || item.sourceName || "";
  const sentence = String(excerpt).replace(/\s+/g, " ").trim();
  if (sentence) return compactReason(`${sourceName ? `${sourceName}: ` : ""}${sentence}`);
  return compactReason(item.title || item.topic || "Politische Entwicklung");
}

function hasGovernmentSignal(item = {}) {
  const text = `${item.title || ""} ${item.summary || ""} ${item.content || ""} ${item.sourceName || ""} ${item.primarySource?.sourceName || ""}`.toLowerCase();
  return ["bundesregierung", "bundeskabinett", "bmas", "bundesministerium", "arbeitsminister"].some((term) => text.includes(term));
}

function hasCommitteeSignal(item = {}) {
  const text = `${item.title || ""} ${item.summary || ""} ${item.whyItMatters || ""} ${item.content || ""}`.toLowerCase();
  return ["ausschuss", "arbeit und soziales", "bmas", "bundestag"].some((term) => text.includes(term));
}

function hasCitizenImpactSignal(item = {}) {
  const text = `${item.title || ""} ${item.summary || ""} ${item.content || ""}`.toLowerCase();
  return ["rente", "bürgergeld", "mindestlohn", "pflege", "armut", "beschäftigte", "arbeitnehmer", "sozial"].some((term) => text.includes(term));
}

function decisionRank(decision) {
  if (decision === "Sofort reagieren") return 3;
  if (decision === "Beobachten") return 2;
  if (decision === "Ignorieren") return 1;
  return 0;
}

function compactReason(value, maxLength = 210) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).replace(/\s+\S*$/, "")}.`;
}

function hasFreshSourceAgainstMemory(item, memory = {}) {
  const previous = priorFeaturedSourceKeys([memory]);
  const current = sourceKeysForFreshness(item);
  if (!current.urls.length && !current.hashes.length) return false;
  const hasKnownUrl = current.urls.some((url) => previous.urls.has(url));
  const hasKnownHash = current.hashes.some((hash) => previous.hashes.has(hash));
  return !hasKnownUrl && !hasKnownHash;
}

function nextStepFromMemory(item, memory) {
  if (item.decision === "Sofort reagieren") return "Heute nicht neu anfangen: bestehende Linie schärfen und als klare Position veröffentlichen.";
  if ((memory.seenCount || 0) >= 2) return "Nicht nochmal grundsätzlich prüfen. Bitte Büro beauftragen, die bestehende Linie mit neuen Quellen zu aktualisieren.";
  return "Bisherige Linie beibehalten und nur ergänzen, wenn die Quellenlage stärker wird.";
}

function topicMemoryKey(value) {
  return String(value || "topic")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "topic";
}

function filterRelevantItemsForProfile(items, profile = cemInceProfile) {
  return analyzeItemsForProfile(items, profile)
    .filter((diagnostic) => diagnostic.decision === "accepted")
    .map((diagnostic) => diagnostic.item)
    .sort((a, b) => itemPoliticalWeight(b, profile) - itemPoliticalWeight(a, profile))
    .slice(0, 25);
}

function filterPreviouslyFeaturedItems(items, memoryEntries = []) {
  const featured = priorFeaturedSourceKeys(memoryEntries);
  if (!featured.urls.size && !featured.hashes.size) return items || [];
  return (items || []).filter((item) => {
    const keys = sourceKeysForFreshness(item);
    const repeatedUrl = keys.urls.some((url) => featured.urls.has(url));
    const repeatedHash = keys.hashes.some((hash) => featured.hashes.has(hash));
    return !repeatedUrl && !repeatedHash;
  });
}

function filterRecentlyFeaturedTopics(items, memoryEntries = [], cooldownHours = topTopicCooldownHours) {
  const blocked = recentFeaturedTopicKeys(memoryEntries, cooldownHours);
  if (!blocked.size) return items || [];
  return (items || []).filter((item) => {
    const keys = semanticTopicKeysForItem(item);
    return !keys.some((key) => blocked.has(key));
  });
}

function recentFeaturedTopicKeys(memoryEntries = [], cooldownHours = topTopicCooldownHours) {
  const cutoff = Date.now() - Math.max(1, Number(cooldownHours || 36)) * 60 * 60 * 1000;
  const keys = new Set();
  for (const entry of memoryEntries || []) {
    const lastSeenAt = new Date(entry.lastSeenAt || entry.updatedAt || entry.firstSeenAt || 0).getTime();
    if (!lastSeenAt || Number.isNaN(lastSeenAt) || lastSeenAt < cutoff) continue;
    semanticTopicKeysForText(`${entry.topicKey || ""} ${entry.title || ""} ${entry.lastAction || ""} ${entry.lastStatement || ""}`)
      .forEach((key) => keys.add(key));
  }
  return keys;
}

function semanticTopicKeysForItem(item = {}) {
  return semanticTopicKeysForText(`${item.title || ""} ${item.topic || ""} ${item.content || ""} ${item.summary || ""}`);
}

function semanticTopicKeysForText(value) {
  const text = String(value || "").toLowerCase();
  const keys = new Set();
  const rules = [
    ["rentenpaket", ["rentenpaket", "rentenreform", "rentenkommission", "rente", "frührente", "alterssicherung"]],
    ["buergergeld", ["bürgergeld", "buergergeld", "grundsicherung", "sanktion"]],
    ["pflege", ["pflege", "pflegeversicherung", "pflegereform", "krankenhausreform", "gesundheit"]],
    ["mindestlohn", ["mindestlohn", "lohnuntergrenze"]],
    ["tariftreue", ["tariftreue", "tarifbindung", "bundestariftreuegesetz", "tarifvertrag"]],
    ["arbeitszeit", ["arbeitszeit", "arbeitszeitgesetz", "arbeitsschutz"]],
    ["arbeitsmarkt", ["arbeitsmarkt", "beschäftigung", "beschaeftigung", "arbeitslosigkeit", "fachkräfte", "fachkraefte"]],
    ["armut-sozialstaat", ["armut", "sozialstaat", "wohngeld", "sozialversicherung"]]
  ];
  for (const [key, terms] of rules) {
    if (terms.some((term) => text.includes(term))) keys.add(key);
  }
  const normalized = topicMemoryKey(text);
  if (normalized) keys.add(normalized);
  return Array.from(keys);
}

function priorFeaturedSourceKeys(memoryEntries = []) {
  const urls = new Set();
  const hashes = new Set();
  for (const entry of memoryEntries || []) {
    for (const url of entry.sourceUrls || []) {
      const normalized = normalizeFreshnessUrl(url);
      if (normalized) urls.add(normalized);
    }
    for (const hash of entry.sourceHashes || []) {
      const normalized = String(hash || "").trim();
      if (normalized) hashes.add(normalized);
    }
  }
  return { urls, hashes };
}

function sourceKeysForFreshness(item = {}) {
  const urls = [
    item.itemUrl,
    item.url,
    item.originalUrl,
    item.sourceUrl,
    item.primarySource?.itemUrl,
    item.primarySource?.url,
    ...(item.sources || []).flatMap((source) => [source.itemUrl, source.url, source.originalUrl])
  ].map(normalizeFreshnessUrl).filter(Boolean);
  const hashes = [
    item.hash,
    item.id,
    item.rawItemId,
    item.signalId,
    item.primarySource?.id,
    ...(item.sources || []).flatMap((source) => [source.rawItemId, source.id, source.hash])
  ].map((value) => String(value || "").trim()).filter(Boolean);
  return {
    urls: Array.from(new Set(urls)),
    hashes: Array.from(new Set(hashes))
  };
}

function normalizeFreshnessUrl(value) {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((param) => url.searchParams.delete(param));
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function analyzeItemsForProfile(items, profile = cemInceProfile) {
  return (items || []).map((item) => analyzeItemForProfile(item, profile));
}

function analyzeItemForProfile(item, profile = cemInceProfile) {
  const profileRelevantTerms = buildRelevantTerms(profile);
  const mandateTerms = buildMandateTerms(profile);
  const text = `${item.title || ""} ${item.content || ""} ${item.sourceName || ""}`.toLowerCase();
  const matchedRelevantTerms = profileRelevantTerms.filter((term) => hasTerm(text, term) || (String(term).length >= 6 && text.includes(String(term).toLowerCase())));
  const matchedMandateTerms = mandateTerms.filter((term) => hasTerm(text, term) || (String(term).length >= 6 && text.includes(String(term).toLowerCase())));
  const matchedTriggers = decisionTriggerTerms.filter((term) => hasTerm(text, term) || text.includes(String(term).toLowerCase()));
  const matchedWeakProtocol = weakProtocolTerms.filter((term) => hasTerm(text, term) || text.includes(String(term).toLowerCase()));
  const reasons = [];
  const rejectionReasons = [];

  if (isGenericSourcePage(item)) rejectionReasons.push("Generische Quellen- oder Startseite");
  if (isLowValuePublisher(item)) rejectionReasons.push("Niedrigwertiger Publisher/PR-Verteiler");
  const decisionRelevant = isDecisionRelevantForProfile(item, profile);
  if (!decisionRelevant) rejectionReasons.push(decisionRelevanceRejectionReason(item, profile));
  if (!matchedRelevantTerms.length) rejectionReasons.push("Kein Treffer im Mandatsprofil");

  if (matchedRelevantTerms.length) reasons.push(`Mandatsprofil: ${matchedRelevantTerms.slice(0, 4).join(", ")}`);
  if (matchedMandateTerms.length) reasons.push(`Ausschuss/Thema: ${matchedMandateTerms.slice(0, 4).join(", ")}`);
  if (matchedTriggers.length) reasons.push(`Handlungssignal: ${matchedTriggers.slice(0, 4).join(", ")}`);
  if (matchedWeakProtocol.length) reasons.push(`Protokollsignal: ${matchedWeakProtocol.slice(0, 3).join(", ")}`);

  const accepted = rejectionReasons.length === 0;
  return {
    item,
    rawItemId: item.id,
    title: item.title,
    sourceName: item.sourceName,
    sourceType: item.sourceType,
    url: item.url,
    sourceUrl: item.sourceUrl,
    originalUrl: item.originalUrl,
    linkType: item.linkType,
    linkResolutionNote: item.linkResolutionNote,
    publishedAt: item.publishedAt,
    retrievedAt: item.retrievedAt,
    confidence: item.confidence,
    politicalWeight: itemPoliticalWeight(item, profile),
    decision: accepted ? "accepted" : "rejected",
    reasons: accepted ? reasons : rejectionReasons,
    matchedRelevantTerms: matchedRelevantTerms.slice(0, 8),
    matchedMandateTerms: matchedMandateTerms.slice(0, 8),
    matchedTriggers: matchedTriggers.slice(0, 8)
  };
}

function decisionRelevanceRejectionReason(item, profile = cemInceProfile) {
  const text = `${item.title || ""} ${item.content || ""} ${item.sourceName || ""}`.toLowerCase();
  const personTerms = personSearchTerms(profile);
  const hasPersonMention = hasAnyTerm(text, personTerms) || (item.sourceType === "person" && hasAnyTerm(text, personTerms));
  const hasMandate = hasAnyTerm(text, buildMandateTerms(profile));
  const hasTrigger = hasAnyTerm(text, decisionTriggerTerms);
  const isWeakProtocol = hasAnyTerm(text, weakProtocolTerms) && !hasAnyTerm(text, ["gesetzentwurf", "gesetz", "reform", "verordnung", "beschluss", "kritik", "fordert", "warnt"]);
  if (isWeakProtocol) return "Nur Protokolltermin ohne politische Entscheidung";
  if (hasPersonMention && !hasTrigger) return "Namentliche Erwähnung ohne Handlungssignal";
  if (!hasMandate) return "Kein belastbarer Ausschuss- oder Themenbezug";
  if (!hasTrigger) return "Kein politischer Entscheidungs- oder Konflikttrigger";
  return "Nicht stark genug für eine politische Entscheidung";
}

function isDecisionRelevantForProfile(item, profile = cemInceProfile) {
  const text = `${item.title} ${item.content} ${item.sourceName}`.toLowerCase();
  const personTerms = personSearchTerms(profile);
  const hasPersonMention = hasAnyTerm(text, personTerms) || (item.sourceType === "person" && hasAnyTerm(text, personTerms));
  const hasMandate = hasAnyTerm(text, buildMandateTerms(profile));
  const hasTrigger = hasAnyTerm(text, decisionTriggerTerms);
  const hasGovernmentWork = hasAnyTerm(text, ["bundesregierung", "bmas", "bundeskabinett", "bundestag", "ministerin", "minister"]) && hasMandate;
  const isWeakProtocol = hasAnyTerm(text, weakProtocolTerms) && !hasAnyTerm(text, ["gesetzentwurf", "gesetz", "reform", "verordnung", "beschluss", "kritik", "fordert", "warnt"]);

  if (isWeakProtocol) return false;
  if (hasPersonMention) return hasTrigger || hasAnyTerm(text, ["kritik", "vorwurf", "interview", "fordert", "äußert", "position"]);
  if (["ministry", "bundestag", "committee"].includes(item.sourceType)) return hasMandate && (hasTrigger || hasGovernmentWork);
  if (["party", "association"].includes(item.sourceType)) return hasMandate && hasTrigger;
  if (item.sourceType === "media") return hasMandate && hasTrigger;
  return hasMandate && hasTrigger;
}

function findProfileMentions(items, profile) {
  const fullName = String(profile.fullName || "").toLowerCase();
  const lastName = fullName.split(/\s+/).filter(Boolean).at(-1) || "";
  const byTitle = new Map();
  items
    .filter((item) => {
      const text = `${item.title || ""} ${item.content || ""}`.toLowerCase();
      return (fullName && text.includes(fullName)) || (lastName && hasTerm(text, lastName));
    })
    .forEach((item) => {
      const key = topicMemoryKey(item.title || item.id);
      const existing = byTitle.get(key);
      if (!existing || mentionQualityScore(item) > mentionQualityScore(existing)) byTitle.set(key, item);
    });

  return Array.from(byTitle.values())
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt) || mentionQualityScore(b) - mentionQualityScore(a))
    .slice(0, 12)
    .map(normalizeMentionOutput);
}

function normalizeMentionOutput(item) {
  const fallbackUrl = !isImageAssetUrl(item.originalUrl) ? item.originalUrl : "";
  const candidateUrl = isImageAssetUrl(item.url) ? fallbackUrl : item.url;
  const url = isPreciseArticleUrl(candidateUrl, item) ? candidateUrl : "";
  return {
    ...item,
    url,
    originalUrl: item.originalUrl || (url !== item.url ? item.url : "")
  };
}

function mentionQualityScore(item) {
  let score = 0;
  if (item.sourceName && !String(item.sourceName).includes("News-Suche")) score += 30;
  if (isPreciseArticleUrl(item.url, item)) score += 40;
  if (item.imageUrl && !isImageAssetUrl(item.imageUrl)) score += 5;
  return score;
}

function isPreciseArticleUrl(url, item = {}) {
  if (!url || isImageAssetUrl(url)) return false;
  if (item.linkType && item.linkType !== "direct") return false;
  try {
    const parsed = new URL(String(url));
    if (parsed.hostname.includes("google.")) return false;
    const path = parsed.pathname.replace(/\/+$/, "");
    if (!path || path === "/" || path.split("/").filter(Boolean).length === 0) return false;
    if (item.sourceUrl) {
      const source = new URL(String(item.sourceUrl));
      if (parsed.hostname === source.hostname && path === source.pathname.replace(/\/+$/, "")) return false;
    }
    return true;
  } catch {
    return false;
  }
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

// TEMPORAER (Diagnose Datenmotor V2): Warum ueberlebt ein Item den
// Artikellink-Filter (requirePreciseBriefingLinks) nicht? Repliziert pro Item
// die Klassifikation von isPreciseArticleUrl und benennt den Ablehnungsgrund.
// Reine Lesediagnose — aendert KEIN Pipeline-Verhalten, keinen Filter, keinen Prompt.
function diagnoseLinkPrecision(liveBriefing) {
  const classifyUrl = (rawUrl, source = {}) => {
    if (!rawUrl) return { url: null, precise: false, reason: "leer", isGoogle: false, isHomepage: false };
    if (isImageAssetUrl(rawUrl)) return { url: rawUrl, precise: false, reason: "bild-asset", isGoogle: false, isHomepage: false };
    if (source.linkType && source.linkType !== "direct") return { url: rawUrl, precise: false, reason: `linkType=${source.linkType}`, isGoogle: /google\./i.test(String(rawUrl)), isHomepage: false };
    let parsed;
    try { parsed = new URL(String(rawUrl)); } catch { return { url: rawUrl, precise: false, reason: "ungueltige-url", isGoogle: false, isHomepage: false }; }
    const isGoogle = parsed.hostname.includes("google.");
    const path = parsed.pathname.replace(/\/+$/, "");
    const isHomepage = !path || path === "/";
    let sameAsSource = false;
    if (source.sourceUrl) { try { const s = new URL(String(source.sourceUrl)); sameAsSource = parsed.hostname === s.hostname && path === s.pathname.replace(/\/+$/, ""); } catch { /* ignore */ } }
    if (isGoogle) return { url: rawUrl, precise: false, reason: "google-redirect", isGoogle: true, isHomepage, host: parsed.hostname };
    if (isHomepage) return { url: rawUrl, precise: false, reason: "homepage", isGoogle: false, isHomepage: true, host: parsed.hostname };
    if (sameAsSource) return { url: rawUrl, precise: false, reason: "nur-quellen-startseite", isGoogle: false, isHomepage: false, host: parsed.hostname };
    return { url: rawUrl, precise: true, reason: "praezise", isGoogle: false, isHomepage: false, host: parsed.hostname };
  };

  const items = liveBriefing?.items || [];
  const perItem = items.map((item) => {
    const sources = (item.sources && item.sources.length) ? item.sources : [item.primarySource].filter(Boolean);
    const src = sources[0] || {};
    const candidates = {
      itemUrl: classifyUrl(src.itemUrl, src),
      url: classifyUrl(src.url, src),
      originalUrl: classifyUrl(src.originalUrl, src)
    };
    const survives = preciseSources(sources).length > 0;
    const anyGoogle = Object.values(candidates).some((c) => c.isGoogle);
    const anyHomepage = Object.values(candidates).some((c) => c.isHomepage);
    // Aufloesbar: ein Google-Redirect verweist auf den echten Artikel, oder es
    // liegt bereits eine praezise Alternativ-URL vor.
    const resolvable = anyGoogle || candidates.originalUrl.precise || candidates.url.precise || candidates.itemUrl.precise;
    const firstReason = candidates.url.reason !== "leer" ? candidates.url.reason
      : candidates.itemUrl.reason !== "leer" ? candidates.itemUrl.reason
      : candidates.originalUrl.reason;
    const decision = item.decision || null;
    const finalScore = item.finalScore ?? null;
    const priority = item.priority ?? null;
    const passesDecisionCheck = decision !== "Ignorieren" && (finalScore >= 45 || priority >= 45);
    return {
      title: item.title || item.themeTitle || "(ohne Titel)",
      sourceName: item.sourceName || src.sourceName || src.title || null,
      linkType: src.linkType || null,
      url: src.url || src.itemUrl || null,
      originalUrl: src.originalUrl || null,
      decision,
      finalScore,
      priority,
      passesDecisionCheck,
      survivesFilter: survives,
      rejectReason: survives ? null : firstReason,
      isGoogleRedirect: anyGoogle,
      isHomepage: anyHomepage,
      technicallyResolvable: survives ? null : resolvable,
      candidates
    };
  });

  const failed = perItem.filter((i) => !i.survivesFilter);
  return {
    note: "TEMPORAER — Diagnose Artikellink-Filter, isPreciseArticleUrl-Logik pro Item.",
    itemsAnalyzed: perItem.length,
    liveTopics: liveBriefing?.topics?.length || 0,
    summary: {
      survive: perItem.filter((i) => i.survivesFilter).length,
      failGoogleRedirect: failed.filter((i) => i.isGoogleRedirect).length,
      failHomepage: failed.filter((i) => !i.isGoogleRedirect && i.isHomepage).length,
      failEmpty: failed.filter((i) => !i.isGoogleRedirect && !i.isHomepage && i.rejectReason === "leer").length,
      failOther: failed.filter((i) => !i.isGoogleRedirect && !i.isHomepage && i.rejectReason !== "leer").length,
      technicallyResolvable: failed.filter((i) => i.technicallyResolvable).length
    },
    perItem
  };
}

function buildSituationalBriefingItems(items, profile = cemInceProfile) {
  const terms = buildRelevantTerms(profile);
  const byUrl = new Map();
  items
    .filter((item) => !isGenericSourcePage(item))
    .filter((item) => !isLowValuePublisher(item))
    .filter((item) => !isStaleNewsSearchItem(item))
    .filter((item) => {
      const text = `${item.title || ""} ${item.content || ""} ${item.sourceName || ""}`.toLowerCase();
      return terms.some((term) => hasTerm(text, term)) || hasAnyTerm(text, buildMandateTerms(profile));
    })
    .sort((a, b) => itemPoliticalWeight(b, profile) - itemPoliticalWeight(a, profile))
    .forEach((item) => {
      const key = item.url || item.id;
      if (!byUrl.has(key)) byUrl.set(key, item);
    });

  return Array.from(byUrl.values()).slice(0, 6).map((item) => ({
    id: `situational-${item.id}`,
    title: item.title,
    contextType: situationalContextType(item, profile),
    summary: twoSentenceSummary(item.content || item.excerpt || item.title),
    sourceName: item.sourceName,
    sourceType: item.sourceType,
    url: item.url,
    sourceUrl: item.sourceUrl,
    originalUrl: item.originalUrl,
    linkType: item.linkType,
    linkResolutionNote: item.linkResolutionNote,
    publishedAt: item.publishedAt,
    retrievedAt: item.retrievedAt,
    confidence: item.confidence,
    relevanceReason: situationalRelevanceReason(item, profile),
    action: "Beobachten"
  }));
}

function situationalContextType(item, profile = cemInceProfile) {
  const text = `${item.title || ""} ${item.content || ""} ${item.sourceName || ""} ${item.sourceType || ""}`.toLowerCase();
  if (hasAnyTerm(text, ["bundesregierung", "bundeskabinett", "bmas", "bundesministerium", "ministerium", "gesetzentwurf", "eckpunkte", "regierungsvorhaben"])) return "government";
  if (hasAnyTerm(text, [String(profile.party || "").toLowerCase(), String(profile.faction || "").toLowerCase(), "die linke", "linksfraktion", "fraktion"])) return "party";
  return "mandate";
}

function promoteSituationalItemsToRawItems(items, profile = cemInceProfile) {
  return (items || [])
    .filter((item) => shouldPromoteSituationalItem(item, profile))
    .slice(0, 3)
    .map((item) => {
      const preciseUrl = isPreciseArticleUrl(item.url, item) ? item.url : "";
      return {
        id: String(item.id || `promoted-${Date.now()}`).replace(/^situational-/, "promoted-"),
        sourceId: item.sourceId || `source-${item.sourceType || "media"}`,
        sourceName: item.sourceName,
        sourceType: item.sourceType || "media",
        sourceUrl: item.sourceUrl || item.url,
        title: item.title,
        url: preciseUrl,
        originalUrl: item.originalUrl || item.url || "",
        linkType: preciseUrl ? "direct" : (item.linkType || "missing"),
        linkResolutionNote: preciseUrl ? "Direkter Artikellink gefunden." : "Kein präziser Artikellink gefunden.",
        content: `${item.summary || item.title} ${item.relevanceReason || ""}`,
        excerpt: item.summary || item.title,
        publishedAt: item.publishedAt || new Date().toISOString(),
        retrievedAt: item.retrievedAt || new Date().toISOString(),
        author: item.author || item.sourceName || "",
        confidence: item.confidence || confidenceForPromotedItem(item),
        hash: `promoted-${item.id || item.title}`
      };
    });
}

function shouldPromoteSituationalItem(item, profile = cemInceProfile) {
  const text = `${item.title || ""} ${item.summary || ""} ${item.relevanceReason || ""} ${item.sourceName || ""}`.toLowerCase();
  if (hasAnyTerm(text, weakProtocolTerms)) return false;
  if (isStaleNewsSearchItem(item)) return false;

  const committeeOrTopicHit = hasAnyTerm(text, buildMandateTerms(profile));
  const sourceIsTrusted = ["ministry", "bundestag", "committee", "party", "association", "media"].includes(item.sourceType);
  const hasDecisionCue = hasAnyTerm(text, decisionTriggerTerms);
  const hasSocialPolicyIssue = hasAnyTerm(text, [
    "pflege",
    "pflegereform",
    "pflegende angehörige",
    "rente",
    "renten",
    "mindestlohn",
    "bürgergeld",
    "tarifbindung",
    "tariftreue",
    "arbeitszeitgesetz",
    "sozialstaat"
  ]);
  const hasConflictOrGovernment = hasAnyTerm(text, [
    "bundesregierung",
    "bmas",
    "kabinett",
    "kritik",
    "warnt",
    "spart",
    "sparen",
    "sparvorschläge",
    "finanzierung",
    "kürzen",
    "streichen",
    "entlastung"
  ]);

  return sourceIsTrusted && committeeOrTopicHit && (hasDecisionCue || (hasSocialPolicyIssue && hasConflictOrGovernment));
}

function isStaleNewsSearchItem(item) {
  const publishedAt = new Date(item.publishedAt || 0).getTime();
  if (!publishedAt) return false;
  const ageDays = (Date.now() - publishedAt) / (24 * 60 * 60 * 1000);
  const isSearchSource = String(item.sourceId || "").includes("-news") || String(item.originalUrl || item.url || "").includes("news.google.com");
  return isSearchSource && ageDays > 45;
}

function dedupePoliticalInputItems(items) {
  const byTopic = new Map();
  for (const item of items || []) {
    const key = normalizePoliticalTopicKey(item.title || item.url || item.id || "");
    const existing = byTopic.get(key);
    if (!existing || itemPoliticalWeight(item) > itemPoliticalWeight(existing)) {
      byTopic.set(key, item);
    }
  }
  return Array.from(byTopic.values());
}

function normalizePoliticalTopicKey(value) {
  return String(value)
    .toLowerCase()
    .replace(/&[#a-z0-9]+;/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+-\s+[^-]+$/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\b(der|die|das|und|oder|zur|zum|von|vom|mit|für|ueber|über|heute)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function confidenceForPromotedItem(item) {
  if (["ministry", "bundestag", "committee", "party"].includes(item.sourceType)) return "high";
  if (["association", "media", "local"].includes(item.sourceType)) return "medium";
  return "low";
}

function situationalRelevanceReason(item, profile = cemInceProfile) {
  const text = `${item.title || ""} ${item.content || ""}`.toLowerCase();
  if (hasAnyTerm(text, personSearchTerms(profile))) return "Namentlicher Bezug zu dir.";
  if (hasAnyTerm(text, [profile.committee, ...(profile.committees || [])])) return `Bezug zu deinem Ausschuss ${profile.committee || profile.committees?.[0]}.`;
  if (hasAnyTerm(text, Object.keys(profile.topicPriorities || {}))) return "Bezug zu deinen priorisierten Themen.";
  return "Relevante politische Lage aus geprüfter Quelle.";
}

function twoSentenceSummary(value) {
  const sentences = String(value || "").split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.slice(0, 2).join(" ");
}

function hasTerm(text, term) {
  const normalizedTerm = String(term || "").toLowerCase().trim();
  if (!normalizedTerm) return false;
  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-zäöüß])${escaped}($|[^a-zäöüß])`, "i").test(text);
}

function isGenericSourcePage(item) {
  const title = item.title.toLowerCase();
  const content = String(item.content || "").toLowerCase();
  return (
    title.length < 8 ||
    title.startsWith("start -") ||
    title === item.sourceName.toLowerCase() ||
    title === "deutscher bundestag - ausschuss für arbeit und soziales" ||
    title === "deutscher gewerkschaftsbund | dgb" ||
    title === "bundesregierung" ||
    title === "bmas" ||
    title.includes("für solidarität und soziale gerechtigkeit") ||
    title.includes("start - fraktion die linke") ||
    title.includes("homepage") ||
    title.includes("startseite") ||
    title.includes("404") ||
    content.includes("hinter diesen worten verbergen sich") ||
    content.includes("stark in arbeit: als deutscher gewerkschaftsbund") ||
    content.includes("javascript aktivieren")
  );
}

function isLowValuePublisher(item) {
  const sourceName = String(item.sourceName || "").toLowerCase();
  const title = String(item.title || "").toLowerCase();
  const lowValueNames = [
    "ad hoc news",
    "börse express",
    "finanznachrichten",
    "wallstreet-online",
    "presseportal",
    "news aktuell",
    "openpr"
  ];
  if (lowValueNames.some((name) => sourceName.includes(name))) return true;
  return title.includes("ots:") || title.includes("pressemitteilung:");
}

function itemPoliticalWeight(item, profile = cemInceProfile) {
  const text = `${item.title} ${item.content}`.toLowerCase();
  const mandateTerms = buildMandateTerms(profile);
  let weight = 0;
  if (["ministry", "bundestag", "committee"].includes(item.sourceType)) weight += 35;
  if (["party", "association"].includes(item.sourceType)) weight += 22;
  if (item.sourceName && String(item.sourceId || "").includes("-news")) weight += 8;
  if (hasAny(text, ["gesetzentwurf", "gesetz", "eckpunkte", "reform", "initiative", "bundesregierung", "bmas"])) weight += 35;
  if (hasAnyTerm(text, mandateTerms)) weight += 30;
  if (hasAny(text, ["kritik", "fordert", "warnt", "debatte", "beschluss", "ausschuss"])) weight += 18;
  weight += Math.max(0, 20 - Math.floor((Date.now() - new Date(item.publishedAt).getTime()) / (6 * 60 * 60 * 1000)));
  if (item.linkType === "direct" && item.url) weight += 15;
  return weight;
}

function hasAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function hasAnyTerm(text, terms) {
  return terms.some((term) => {
    const normalizedTerm = String(term || "").toLowerCase().trim();
    if (!normalizedTerm) return false;
    return hasTerm(text, normalizedTerm) || (normalizedTerm.length >= 6 && text.includes(normalizedTerm));
  });
}

async function getLatestOrDemoBriefing(politicianId = cemInceProfile.id) {
  const profile = await getActiveProfile(politicianId);
  const latest = await getLatestBriefing(profile.id);
  const latestLageCheck = await getLatestLageCheck(profile.id);
  if (latest && latest.status !== "Demo") {
    return {
      ...latest,
      latestLageCheck,
      status: isBriefingStale(latest) ? "Veraltet" : latest.status || "Aktuell"
    };
  }
  const latestCrawl = await getLatestCrawlRun();
  return buildEmptyBriefing(profile, {
    status: "Live",
    fallbackReason: latest?.status === "Demo"
      ? "Alte Demo-Lage wurde ausgeblendet. Starte einen Quellenlauf, um echte Artikel zu verwenden."
      : "Noch kein Live-Briefing gespeichert. Starte Crawl und Briefing, um echte Artikel zu verwenden.",
    sourceStats: latestCrawl || {
      checkedSources: 0,
      successfulSources: 0,
      failedSources: 0,
      savedItems: 0
    },
    latestLageCheck
  });
}

function buildEmptyBriefing(profile, overrides = {}) {
  return {
    id: `briefing-${profile.id}-${new Date().toISOString().slice(0, 10)}`,
    politicianId: profile.id,
    date: new Date().toISOString().slice(0, 10),
    executiveSummary: `${currentBerlinGreeting()} Für dieses Mandat liegt noch kein eigenes Briefing vor. Vervollständige zuerst das Mandatsprofil und starte danach Crawl und Briefing.`,
    decisionMetrics: {
      reactCount: 0,
      watchCount: 0,
      ignoreCount: 0,
      chanceCount: 0,
      riskCount: 0,
      estimatedMinutes: 0
    },
    themeOfDay: null,
    chanceOfDay: null,
    riskOfDay: null,
    taskMetrics: {
      openCount: 0,
      criticalCount: 0,
      dueByNoonCount: 0
    },
    items: [],
    tasks: [],
    evidence: [],
    topics: [],
    userInteractions: [],
    profile,
    scores: [],
    signals: [],
    rawItems: [],
    sources: [],
    personMentions: [],
    situationalBriefing: [],
    status: "Live",
    fallbackReason: "Für dieses Mandat wurde noch kein eigenes Live-Briefing erzeugt.",
    sourceStats: {
      checkedSources: 0,
      successfulSources: 0,
      failedSources: 0,
      savedItems: 0
    },
    newSignals: 0,
    ...overrides
  };
}

function hasDecisionValue(briefing) {
  if (!briefing || !Array.isArray(briefing.items)) return false;
  return briefing.items.some((item) => item.decision !== "Ignorieren" && (item.finalScore >= 45 || item.priority >= 45));
}

function assessBriefingQuality(briefing) {
  const recommendations = (briefing.personalizedRecommendations || []).filter((item) => item.relevance_score >= 35);
  const items = recommendations.length ? recommendations : (briefing.items || []).filter((item) => item.decision !== "Ignorieren");
  const checks = [];
  const issues = [];
  if (!items.length) {
    const situationalCount = Number((briefing.situationalBriefing || []).length);
    if (situationalCount > 0) {
      return {
        status: "Stabile Lage",
        score: 92,
        passed: 4,
        total: 4,
        recommendationCount: 0,
        situationalCount,
        calmState: true,
        issues: [],
        summary: "Keine neue politische Entscheidung, aber eine beobachtbare Lage mit Quellenbasis.",
        checkedAt: new Date().toISOString()
      };
    }
    return {
      status: "Keine Entscheidung",
      score: 0,
      passed: 0,
      total: 1,
      recommendationCount: 0,
      issues: ["Keine belastbare Empfehlung im aktuellen Briefing."],
      checkedAt: new Date().toISOString()
    };
  }

  items.slice(0, 5).forEach((item) => {
    addQualityCheck(checks, issues, hasText(item.title), item.title || "Ohne Titel", "Titel fehlt.");
    addQualityCheck(checks, issues, hasText(item.recommended_action || item.recommendedAction), item.title, "Konkrete Handlung fehlt.");
    addQualityCheck(checks, issues, hasText(item.personal_relevance_explanation || item.whyItMatters), item.title, "Persönlicher Mandatsbezug fehlt.");
    addQualityCheck(checks, issues, hasText(item.consequence_if_ignored || item.inactionConsequence || item.riskNote), item.title, "Folge bei Nichtreaktion fehlt.");
    addQualityCheck(checks, issues, hasText(item.communication_recommendation || item.suggestedStatement), item.title, "Kommunikationsvorschlag fehlt.");
    addQualityCheck(checks, issues, hasSourceBasis(item), item.title, "Quellenbasis fehlt.");
    addQualityCheck(checks, issues, hasDirectSourceLink(item), item.title, "Präziser Artikellink fehlt.");
    addQualityCheck(checks, issues, hasReferentTone(item), item.title, "Direkte Referentenansprache fehlt.");
    addQualityCheck(checks, issues, !item.referent_audit || Number(item.referent_audit.score || 0) >= 85, item.title, "Referenten-Audit nicht bestanden.");
    addQualityCheck(checks, issues, Boolean(item.taskTemplate || item.task_template), item.title, "Aufgabe/Bürovorbereitung fehlt.");
  });

  const passed = checks.filter(Boolean).length;
  const total = checks.length || 1;
  const score = Math.round((passed / total) * 100);
  return {
    status: score >= 90 ? "Pitchbereit" : score >= 75 ? "Prüfen" : "Unvollständig",
    score,
    passed,
    total,
    recommendationCount: items.length,
    issues: issues.slice(0, 6),
    checkedAt: new Date().toISOString()
  };
}

function addQualityCheck(checks, issues, passed, title, issue) {
  checks.push(Boolean(passed));
  if (!passed) issues.push(`${title || "Empfehlung"}: ${issue}`);
}

function hasText(value) {
  return String(value || "").trim().length >= 8;
}

function hasSourceBasis(item) {
  return Boolean(item.sourceBasis || item.primarySource || item.primary_source || (Array.isArray(item.sources) && item.sources.length));
}

function hasDirectSourceLink(item) {
  const sources = Array.isArray(item.sources) && item.sources.length ? item.sources : [item.primarySource, item.primary_source].filter(Boolean);
  return sources.some((source) => {
    const url = source?.itemUrl || source?.url || "";
    return isPreciseArticleUrl(url, source);
  });
}

function hasReferentTone(item) {
  return [
    item.personal_relevance_explanation || item.whyItMatters,
    item.recommended_action || item.recommendedAction,
    item.consequence_if_ignored || item.inactionConsequence || item.riskNote,
    item.communication_recommendation || item.suggestedStatement
  ].every(usesDirectAddress);
}

function usesDirectAddress(value) {
  return /\b(du|dich|dir|dein|deine|deinen|deinem|deiner|deines)\b/i.test(String(value || ""));
}

function temperSingleSourceMediaDecisions(briefing) {
  if (!briefing?.items?.length) return briefing;
  const items = briefing.items.map((item) => {
    const sourceType = item.primarySource?.sourceType || item.sourceType;
    const sourceCount = Number(item.sourceCount || item.sources?.length || 1);
    const hasPersonMention = String(`${item.title} ${item.summary}`).toLowerCase().includes("cem ince");
    const strongSource = ["ministry", "bundestag", "committee", "party", "association"].includes(sourceType);
    if (item.decision !== "Sofort reagieren" || strongSource || sourceCount > 1 || hasPersonMention) return item;
    return {
      ...item,
      decision: "Beobachten",
      classification: item.classification === "risk" ? "watch" : item.classification,
      recommendedAction: item.recommendedAction || "Beobachte die weitere Quellenlage und bereite nur eine interne Linie vor.",
      riskNote: item.riskNote || "Ein einzelnes Mediensignal reicht noch nicht für eine öffentliche Reaktion.",
      sourceNote: item.sourceNote || "Einzelquelle aus der Medienlage; erst bei Bestätigung öffentlich reagieren."
    };
  });
  return {
    ...briefing,
    items
  };
}

function currentBerlinGreeting() {
  const hour = Number(new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    hourCycle: "h23"
  }).format(new Date()));
  if (hour >= 5 && hour < 10) return "Guten Morgen.";
  if (hour >= 10 && hour < 14) return "Mahlzeit.";
  if (hour >= 14 && hour < 18) return "Guten Nachmittag.";
  if (hour >= 18) return "Guten Abend.";
  return "Guten Morgen.";
}

function buildPipelineDebugReport({
  profile,
  latestCrawl,
  recentItems,
  situationalRecentItems,
  mentionItems,
  relevanceDiagnostics,
  relevantItems,
  suppressedRepeatedTopicItems = 0,
  situationalItems,
  suppressedRepeatedSituationalItems = 0,
  promotedSituationalItems,
  fallbackPromotedSituationalItems = [],
  briefingInputItems,
  liveBriefing,
  fallbackLiveBriefing = null,
  savedBriefing,
  usesLiveBriefing,
  aiBudget = null,
  aiUsed = null
}) {
  const accepted = relevanceDiagnostics.filter((entry) => entry.decision === "accepted");
  const rejected = relevanceDiagnostics.filter((entry) => entry.decision === "rejected");
  const inputIds = new Set((briefingInputItems || []).map((item) => item.id));
  const topicRawItemIds = new Set((savedBriefing?.topics || []).flatMap((topic) => topic.rawItemIds || []));

  return {
    id: `pipeline-debug-${profile.id}-${Date.now()}`,
    politicianId: profile.id,
    profile: {
      fullName: profile.fullName,
      party: profile.party,
      faction: profile.faction,
      committee: profile.committee || profile.committees?.[0] || "",
      focusTopics: (profile.focusTopics || []).slice(0, 12)
    },
    windows: {
      relevanceHours: 24,
      situationalHours: 72,
      mentionDays: 180
    },
    linkDiagnostics: (() => { try { return diagnoseLinkPrecision(liveBriefing); } catch (error) { return { error: String((error && error.message) || error) }; } })(),
    crawl: latestCrawl ? {
      checkedSources: latestCrawl.checkedSources || 0,
      successfulSources: latestCrawl.successfulSources || 0,
      failedSources: latestCrawl.failedSources || 0,
      savedItems: latestCrawl.savedItems || 0,
      newCandidateItems: latestCrawl.newCandidateItems || 0,
      createdAt: latestCrawl.createdAt || null,
      errors: (latestCrawl.errors || []).slice(0, 8)
    } : null,
    counts: {
      rawItemsLast24h: recentItems.length,
      acceptedRelevantItems: accepted.length,
      suppressedRepeatedTopicItems,
      rejectedItems: rejected.length,
      situationalItems72h: situationalRecentItems.length,
      situationalBriefingItems: situationalItems.length,
      suppressedRepeatedSituationalItems,
      promotedSituationalItems: promotedSituationalItems.length,
      fallbackPromotedSituationalItems: fallbackPromotedSituationalItems.length,
      briefingInputItems: briefingInputItems.length,
      liveTopicsGenerated: liveBriefing?.topics?.length || 0,
      fallbackLiveTopicsGenerated: fallbackLiveBriefing?.topics?.length || 0,
      finalBriefingItems: savedBriefing?.items?.length || 0,
      personalizedRecommendations: savedBriefing?.personalizedRecommendations?.length || 0,
      personMentionCandidates180d: mentionItems.length,
      finalPersonMentions: savedBriefing?.personMentions?.length || 0
    },
    outcome: {
      status: savedBriefing?.status || "Unbekannt",
      usedLiveBriefing: Boolean(usesLiveBriefing),
      fallbackReason: savedBriefing?.fallbackReason || "",
      quality: savedBriefing?.quality || null,
      executiveSummary: savedBriefing?.executiveSummary || "",
      topDecision: savedBriefing?.themeOfDay?.title || savedBriefing?.items?.[0]?.title || ""
    },
    // Datenmotor V2: Erklaerbarkeit der KI-Stufe. Welche Engine lief, mit welchem
    // Modell, ob das Budget griff, und die Begruendung fuer Rang 1.
    engine: {
      mode: savedBriefing?.ai?.engine || (aiUsed === false ? "rules-only" : "v1"),
      aiEnabled: savedBriefing?.ai?.enabled ?? null,
      model: savedBriefing?.ai?.model || null,
      degraded: savedBriefing?.ai?.degraded || false,
      v2Scored: savedBriefing?.v2?.scored ?? null,
      v2Candidates: savedBriefing?.v2?.candidates ?? null,
      v2UpgradeCandidates: savedBriefing?.v2?.upgradeCandidates ?? null,
      v2Ranked: savedBriefing?.v2?.ranked ?? null,
      top1Justification: savedBriefing?.v2?.top1Justification || "",
      v2UpgradedCount: savedBriefing?.v2?.v2UpgradedCount ?? null,
      v2UpgradedItems: savedBriefing?.v2?.v2UpgradedItems || [],
      v2NotUpgraded: savedBriefing?.v2?.v2NotUpgraded || [],
      budget: aiBudget ? {
        allowed: aiBudget.allowed,
        used: aiBudget.used ?? null,
        limit: aiBudget.limit ?? null,
        remaining: aiBudget.remaining ?? null,
        reason: aiBudget.reason || null
      } : null
    },
    sourceBreakdown: summarizeSources(relevanceDiagnostics),
    rejectionSummary: summarizeReasons(rejected),
    acceptedItems: accepted
      .sort((a, b) => b.politicalWeight - a.politicalWeight)
      .slice(0, 12)
      .map((entry) => ({
        ...serializeDiagnostic(entry),
        usedAsBriefingInput: inputIds.has(entry.rawItemId),
        reachedTopicClustering: topicRawItemIds.has(entry.rawItemId)
      })),
    rejectedItems: rejected
      .sort((a, b) => b.politicalWeight - a.politicalWeight)
      .slice(0, 30)
      .map(serializeDiagnostic),
    briefingInputItems: (briefingInputItems || []).slice(0, 12).map(serializeRawItemForDebug),
    finalItems: (savedBriefing?.items || []).slice(0, 8).map((item) => ({
      id: item.id,
      title: item.title,
      decision: item.decision,
      classification: item.classification,
      priority: item.priority,
      finalScore: item.finalScore,
      whyNow: item.whyNow,
      recommendedAction: item.recommendedAction,
      // V2-Erklaerbarkeit pro Item: Regel-Score (priority) vs. KI-Score, KI-Entscheid,
      // Mandatsbezug und finaler Rang samt Begruendung.
      ruleScore: item.priority,
      aiRelevanceScore: item.aiRelevanceScore ?? null,
      reactOrObserve: item.reactOrObserve || null,
      affectsMandate: item.affectsMandate ?? null,
      rank: item.rank ?? null,
      rankReason: item.rankReason || "",
      whyItMatters: item.whyItMatters || "",
      riskNote: item.riskNote || "",
      opportunityNote: item.opportunityNote || "",
      inactionConsequence: item.inactionConsequence || "",
      sources: (item.sources || []).slice(0, 5).map((source) => ({
        sourceName: source.sourceName,
        url: isPreciseArticleUrl(source.itemUrl, source) ? source.itemUrl : isPreciseArticleUrl(source.url, source) ? source.url : "",
        linkType: source.linkType || "",
        linkResolutionNote: source.linkResolutionNote || "",
        confidence: source.confidence
      }))
    }))
  };
}

function serializeDiagnostic(entry) {
  return {
    rawItemId: entry.rawItemId,
    title: entry.title,
    sourceName: entry.sourceName,
    sourceType: entry.sourceType,
    url: entry.url,
    sourceUrl: entry.sourceUrl,
    publishedAt: entry.publishedAt,
    retrievedAt: entry.retrievedAt,
    confidence: entry.confidence,
    politicalWeight: entry.politicalWeight,
    decision: entry.decision,
    reasons: entry.reasons,
    matchedRelevantTerms: entry.matchedRelevantTerms,
    matchedMandateTerms: entry.matchedMandateTerms,
    matchedTriggers: entry.matchedTriggers
  };
}

function serializeRawItemForDebug(item) {
  return {
    id: item.id,
    title: item.title,
    sourceName: item.sourceName,
    sourceType: item.sourceType,
    url: item.url,
    sourceUrl: item.sourceUrl,
    originalUrl: item.originalUrl,
    linkType: item.linkType,
    linkResolutionNote: item.linkResolutionNote,
    publishedAt: item.publishedAt,
    confidence: item.confidence,
    excerpt: item.excerpt || String(item.content || "").slice(0, 220)
  };
}

function summarizeReasons(diagnostics) {
  const counts = new Map();
  diagnostics.forEach((entry) => {
    (entry.reasons || ["Unbekannt"]).forEach((reason) => counts.set(reason, (counts.get(reason) || 0) + 1));
  });
  return Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}

function summarizeSources(diagnostics) {
  const bySource = new Map();
  diagnostics.forEach((entry) => {
    const key = entry.sourceName || entry.sourceType || "Unbekannt";
    const current = bySource.get(key) || {
      sourceName: entry.sourceName || "Unbekannt",
      sourceType: entry.sourceType || "",
      accepted: 0,
      rejected: 0,
      total: 0
    };
    current.total += 1;
    if (entry.decision === "accepted") current.accepted += 1;
    else current.rejected += 1;
    bySource.set(key, current);
  });
  return Array.from(bySource.values())
    .sort((a, b) => b.total - a.total || b.accepted - a.accepted)
    .slice(0, 20);
}

async function getActiveProfile(politicianId = cemInceProfile.id) {
  const stored = await getProfile(politicianId);
  if (stored) return mergeProfileDefaults(stored);
  if (politicianId === cemInceProfile.id) return cemInceProfile;
  // Unbekanntes Mandat ohne gespeichertes Profil: neutrale Defaults (KEIN
  // Cem-Fallback). mergeProfileDefaults liefert das generische Geruest.
  const fullName = politicianId
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ") || "Neues Mandat";
  return mergeProfileDefaults({ id: politicianId, fullName, party: "", faction: "" });
}

// Neutrale Default-Werte fuer JEDES Mandat AUSSER dem Demo-Profil cem-ince.
// Datenmotor V2, Commit 2: verhindert, dass echte Abgeordnete inhaltliche
// Cem-Ince-Defaults erben (Ausschuesse, Themen, Positionen, Termine, Gegner,
// Regionalbezug). Nur generisches, nicht-identifizierendes Geruest bleibt
// vorbelegt, damit der Briefing-Motor arbeiten kann. Spiegelt blankProfile()
// in server.js — echte Personalisierung kommt ausschliesslich aus dem Profil.
const neutralProfileDefaults = {
  function: "Bundestagsabgeordnete:r",
  role: "Bundestagsabgeordnete:r",
  politicalLevel: "Bund",
  constituency: "",
  state: "",
  location: "",
  committee: "",
  committees: [],
  focusTopics: [],
  topicPriorities: {},
  mainQuestion: "Was ist heute für mein Mandat wichtig und worauf sollte ich reagieren?",
  monitoringTargets: ["Meine Partei", "Meine Person", "Bundesregierung Vorhaben"],
  outputNeeds: [
    "Was ist heute wichtig?",
    "Was kann ignoriert werden?",
    "Worauf sollte ich reagieren?",
    "Welche Chance entsteht?",
    "Welches Risiko entsteht?",
    "Welche Formulierung kann ich nutzen?"
  ],
  regionalInterests: [],
  relevantMinistries: ["Bundesregierung"],
  opponents: [],
  localMedia: [],
  communicationStyle: "Sachlich",
  riskTopics: [],
  opportunityTopics: [],
  noGoTopics: [],
  preferredChannels: ["presse", "linkedin"],
  reportingTopics: [],
  currentCampaigns: [],
  publicPositions: [],
  keyAudiences: [],
  upcomingAppointments: []
};

function mergeProfileDefaults(profile) {
  // Nur das Demo-Profil cem-ince erbt die reichhaltigen Cem-Defaults. Jedes
  // andere Mandat bekommt neutrale Defaults — keine fremden Themen/Ausschuesse.
  const isDemo = (profile.id || cemInceProfile.id) === cemInceProfile.id;
  const base = isDemo ? cemInceProfile : neutralProfileDefaults;
  return {
    ...base,
    ...profile,
    id: profile.id || cemInceProfile.id,
    function: profileValue(profile.function, base.function),
    constituency: profileValue(profile.constituency, base.constituency),
    state: profileValue(profile.state, base.state),
    location: profileValue(profile.location, base.location),
    mainQuestion: profileValue(profile.mainQuestion, base.mainQuestion),
    communicationStyle: profileValue(profile.communicationStyle, base.communicationStyle),
    committees: mergeArrayValue(profile.committees, profile.committee ? [profile.committee] : base.committees),
    focusTopics: mergeArrayValue(profile.focusTopics, base.focusTopics),
    topicPriorities: topicPriorityValue(profile.topicPriorities, base.topicPriorities),
    regionalInterests: mergeArrayValue(profile.regionalInterests, base.regionalInterests),
    relevantMinistries: mergeArrayValue(profile.relevantMinistries, base.relevantMinistries),
    monitoringTargets: mergeArrayValue(profile.monitoringTargets, base.monitoringTargets),
    outputNeeds: mergeArrayValue(profile.outputNeeds, base.outputNeeds),
    opponents: mergeArrayValue(profile.opponents, base.opponents),
    localMedia: mergeArrayValue(profile.localMedia, base.localMedia),
    noGoTopics: mergeArrayValue(profile.noGoTopics, base.noGoTopics),
    reportingTopics: mergeArrayValue(profile.reportingTopics, base.reportingTopics),
    currentCampaigns: mergeArrayValue(profile.currentCampaigns, base.currentCampaigns),
    publicPositions: mergeArrayValue(profile.publicPositions, base.publicPositions),
    keyAudiences: mergeArrayValue(profile.keyAudiences, base.keyAudiences),
    riskTopics: mergeArrayValue(profile.riskTopics, base.riskTopics),
    opportunityTopics: mergeArrayValue(profile.opportunityTopics, base.opportunityTopics),
    preferredChannels: mergeArrayValue(profile.preferredChannels, base.preferredChannels),
    upcomingAppointments: appointmentValue(profile.upcomingAppointments, base.upcomingAppointments)
  };
}

function buildRelevantTerms(profile) {
  return uniqueTerms([
    ...personSearchTerms(profile),
    profile.party,
    profile.faction,
    profile.committee,
    ...(profile.committees || []),
    ...(profile.focusTopics || []),
    ...Object.keys(profile.topicPriorities || {}),
    ...(profile.regionalInterests || []),
    ...(profile.relevantMinistries || []),
    ...(profile.monitoringTargets || []),
    "Bundesregierung",
    "Gesetzentwurf",
    "Eckpunkte",
    "Reform",
    "Initiative"
  ]);
}

function buildMandateTerms(profile) {
  return uniqueTerms([
    profile.committee,
    ...(profile.committees || []),
    ...(profile.focusTopics || []),
    ...Object.entries(profile.topicPriorities || {}).filter(([, priority]) => Number(priority) >= 3).map(([topic]) => topic),
    ...(profile.regionalInterests || []),
    ...(profile.relevantMinistries || []),
    profile.party,
    profile.faction
  ]);
}

function personSearchTerms(profile) {
  const fullName = String(profile.fullName || "").trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  return uniqueTerms([fullName, parts.at(-1), profile.id]);
}

function uniqueTerms(terms) {
  return Array.from(new Set(terms.map((term) => String(term || "").trim()).filter((term) => term.length >= 2)));
}

function arrayValue(value, fallback) {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/\n|,/).map((entry) => entry.trim()).filter(Boolean);
  return fallback || [];
}

function mergeArrayValue(value, fallback) {
  const primary = arrayValue(value, []);
  const defaults = arrayValue(fallback, []);
  const seen = new Set();
  return [...primary, ...defaults].filter((entry) => {
    const text = String(entry || "").trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function topicPriorityValue(value, fallback) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback || {};
  return { ...(fallback || {}), ...value };
}

function profileValue(value, fallback) {
  const text = String(value || "").trim();
  return text && !isPlaceholderValue(text) ? text : fallback;
}

function isPlaceholderValue(value) {
  return /^(noch offen|unbekannt|keine angabe|n\/a|none|null|-|—)$/i.test(String(value || "").trim());
}

function appointmentValue(value, fallback) {
  const appointments = arrayValue(value, []);
  const upcoming = appointments.filter((entry) => !isPastAppointment(entry));
  return upcoming.length ? upcoming : fallback || [];
}

function isPastAppointment(entry) {
  const parts = String(entry || "").split(/\s*[|;]\s*/).filter(Boolean);
  const date = new Date(parts[1] || "");
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < Date.now() - 12 * 60 * 60 * 1000;
}

function isBriefingStale(briefing) {
  const generatedAt = new Date(briefing.generatedAt || briefing.date);
  if (Number.isNaN(generatedAt.getTime())) return true;
  const today = new Date();
  const briefingDay = berlinDateKey(generatedAt);
  const todayDay = berlinDateKey(today);
  return briefingDay !== todayDay || Date.now() - generatedAt.getTime() > 18 * 60 * 60 * 1000;
}

function berlinDateKey(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

module.exports = {
  runMorningBriefing,
  runSourceCrawl,
  runDailyPipeline,
  runLageCheck,
  filterRelevantItemsForCem: filterRelevantItemsForProfile,
  filterRelevantItemsForProfile,
  getLatestOrDemoBriefing,
  getActiveProfile,
  mergeProfileDefaults,
  buildPipelineDebugReport,
  dipDocToRawItem,
  dipPrimaryEnabled,
  fetchDipAsRawItems,
  persistRawDocumentsShadow
};
