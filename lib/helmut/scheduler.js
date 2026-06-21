const { crawlAllSources } = require("./crawler");
const { enrichBriefingWithAI } = require("./ai");
const { personalizeBriefing } = require("./personalization");
const {
  getLatestBriefing,
  getLatestCrawlRun,
  getInteractions,
  getProfile,
  getRawItemsSince,
  getSources,
  getTopicMemory,
  saveBriefing,
  saveCrawlRun,
  savePersonalizedRecommendations,
  savePipelineDebugReport,
  savePoliticalItems,
  savePriorityChanges,
  saveRawItems,
  updateTopicMemoryFromBriefing
} = require("./storage");
const { cemInceProfile, demoSources, generateBriefing } = require("./runtime");

const cemRelevantTerms = [
  "Cem Ince",
  "Die Linke",
  "Linksfraktion",
  "Arbeit und Soziales",
  "BMAS",
  "Bundesministerium für Arbeit und Soziales",
  "Bürgergeld",
  "Rente",
  "Renten",
  "Rentenpaket",
  "Rentenreform",
  "Mindestlohn",
  "Tarifbindung",
  "Tariftreue",
  "Arbeitszeitgesetz",
  "Arbeitsschutz",
  "Arbeitsmarkt",
  "Beschäftigung",
  "Eingliederungshilfe",
  "Pflege",
  "Sozialstaat",
  "Sozialversicherung",
  "Armut",
  "Gewerkschaften",
  "Ausbeutung",
  "Zwangsarbeit",
  "Bundesregierung",
  "Gesetzentwurf",
  "Eckpunkte",
  "Reform",
  "Initiative"
];

const cemMandateTerms = [
  "Cem Ince",
  "Arbeit und Soziales",
  "BMAS",
  "Bundesministerium für Arbeit und Soziales",
  "Arbeitszeitgesetz",
  "Arbeitsschutz",
  "Arbeitsmarkt",
  "Beschäftigung",
  "Bürgergeld",
  "Eingliederungshilfe",
  "Gewerkschaften",
  "Mindestlohn",
  "Pflege",
  "Rente",
  "Renten",
  "Sozialstaat",
  "Sozialversicherung",
  "Tarifbindung",
  "Tariftreue",
  "Zwangsarbeit",
  "Ausbeutung",
  "Armut"
];

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

async function runSourceCrawl(politicianId = cemInceProfile.id) {
  const profile = await getActiveProfile(politicianId);
  const crawl = await crawlAllSources(await getSourcesForProfile(profile));
  const savedItems = await saveRawItems(crawl.rawItems);
  const run = await saveCrawlRun({
    checkedSources: crawl.checkedSources,
    successfulSources: crawl.successfulSources,
    failedSources: crawl.failedSources,
    newCandidateItems: crawl.newCandidateItems,
    savedItems: savedItems.length,
    errors: crawl.results.filter((result) => !result.ok).map((result) => ({ sourceName: result.sourceName, error: result.error }))
  });
  return { ...run, savedItemsList: savedItems };
}

async function runMorningBriefing(politicianId = cemInceProfile.id) {
  const profile = await getActiveProfile(politicianId);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const situationalSince = new Date(Date.now() - 72 * 60 * 60 * 1000);
  const mentionSince = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const recentItems = await getRawItemsSince(since);
  const situationalRecentItems = await getRawItemsSince(situationalSince);
  const mentionItems = await getRawItemsSince(mentionSince);
  const relevanceDiagnostics = analyzeItemsForProfile(recentItems, profile);
  const relevantItems = filterRelevantItemsForProfile(recentItems, profile);
  const situationalItems = buildSituationalBriefingItems(situationalRecentItems, profile);
  const promotedSituationalItems = relevantItems.length ? [] : promoteSituationalItemsToRawItems(situationalItems, profile);
  const briefingInputItems = dedupePoliticalInputItems(relevantItems.length ? relevantItems : promotedSituationalItems);
  const liveBriefing = briefingInputItems.length ? temperSingleSourceMediaDecisions(generateBriefing(profile, briefingInputItems, demoSources)) : null;
  const linkStrictLiveBriefing = liveBriefing ? requirePreciseBriefingLinks(await enrichBriefingWithAI(liveBriefing, profile)) : null;
  const usesLiveBriefing = linkStrictLiveBriefing ? hasDecisionValue(linkStrictLiveBriefing) : false;
  const briefing = usesLiveBriefing
    ? linkStrictLiveBriefing
    : buildEmptyBriefing(profile, {
      status: "Live",
      fallbackReason: relevantItems.length
        ? "Live-Quellen wurden geprüft, aber Helmut hat daraus keine belastbare politische Entscheidung mit präzisem Artikellink erzeugt."
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
  const memoryEntries = await getTopicMemory(profile.id);
  const briefingWithMemory = attachPoliticalMemory(briefingWithStatus, memoryEntries);
  const personalizedBriefing = personalizeBriefing(briefingWithMemory, profile, memoryEntries, await getInteractions(profile.id));
  const qualityCheckedBriefing = {
    ...personalizedBriefing,
    quality: assessBriefingQuality(personalizedBriefing)
  };
  await savePoliticalItems(qualityCheckedBriefing.politicalItems || []);
  await savePersonalizedRecommendations(profile.id, qualityCheckedBriefing.personalizedRecommendations || []);
  await savePriorityChanges(qualityCheckedBriefing.priorityChanges || []);
  const savedBriefing = await saveBriefing(qualityCheckedBriefing);
  await updateTopicMemoryFromBriefing(savedBriefing);
  await savePipelineDebugReport(buildPipelineDebugReport({
    profile,
    latestCrawl,
    recentItems,
    situationalRecentItems,
    mentionItems,
    relevanceDiagnostics,
    relevantItems,
    situationalItems,
    promotedSituationalItems,
    briefingInputItems,
    liveBriefing,
    savedBriefing,
    usesLiveBriefing
  }));
  return savedBriefing;
}

async function runDailyPipeline(politicianId = cemInceProfile.id) {
  const crawl = await runSourceCrawl(politicianId);
  const briefing = await runMorningBriefing(politicianId);
  return { crawl, briefing };
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
    const url = isPreciseArticleUrl(source?.itemUrl, source) ? source.itemUrl : isPreciseArticleUrl(source?.url, source) ? source.url : "";
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
  const encoded = encodeURIComponent(query);
  return {
    id: `${profile.id}-news`,
    name: `${fullName || profile.id} News-Suche`,
    type: "person",
    url: `https://news.google.com/search?q=${encoded}`,
    rssUrl: `https://news.google.com/rss/search?q=${encoded}&hl=de&gl=DE&ceid=DE:de`,
    rssUrls: [`https://news.google.com/rss/search?q=${encoded}&hl=de&gl=DE&ceid=DE:de`],
    crawlMethod: "rss",
    priority: 100,
    active: true,
    queryTerms: personSearchTerms(profile)
  };
}

function mandateNewsSources(profile) {
  const topics = topProfileTopics(profile, 5);
  const committee = profile.committee || profile.committees?.[0] || "Arbeit und Soziales";
  return [
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
    return {
      ...item,
      memory: buildMemoryNote(item, memory)
    };
  });
  return {
    ...briefing,
    items,
    topicMemory: (memoryEntries || []).slice(0, 8)
  };
}

function buildMemoryNote(item, memory) {
  if (!memory || !memory.seenCount) {
    return {
      status: "new",
      label: "Neu in deiner Lage",
      summary: "Zu diesem Thema liegt noch keine bisherige Linie in Helmut vor.",
      previousLine: "",
      suggestedNextStep: item.decision === "Beobachten" ? "Erst einordnen, dann entscheiden, ob du öffentlich gehst." : "Heute als neue Linie vorbereiten."
    };
  }

  return {
    status: "recurring",
    label: `Laufendes Thema · ${memory.seenCount + 1}. Kontaktpunkt`,
    summary: `Helmut kennt dieses Thema bereits. Deine letzte Linie war: ${memory.lastStatement || memory.lastAction || "Position vorbereiten."}`,
    previousLine: memory.lastStatement || memory.lastAction || "",
    suggestedNextStep: nextStepFromMemory(item, memory),
    lastSeenAt: memory.lastSeenAt,
    seenCount: memory.seenCount
  };
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

  return Array.from(byUrl.values()).slice(0, 4).map((item) => ({
    id: `situational-${item.id}`,
    title: item.title,
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
  if (latest && latest.status !== "Demo") {
    return {
      ...latest,
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
    }
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
  return briefing.items.some((item) => item.decision !== "Ignorieren" && (item.finalScore >= 45 || item.priority >= 45));
}

function assessBriefingQuality(briefing) {
  const recommendations = (briefing.personalizedRecommendations || []).filter((item) => item.relevance_score >= 35);
  const items = recommendations.length ? recommendations : (briefing.items || []).filter((item) => item.decision !== "Ignorieren");
  const checks = [];
  const issues = [];
  if (!items.length) {
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
  return "Guten Abend.";
}

function buildPipelineDebugReport({
  profile,
  latestCrawl,
  recentItems,
  situationalRecentItems,
  mentionItems,
  relevanceDiagnostics,
  relevantItems,
  situationalItems,
  promotedSituationalItems,
  briefingInputItems,
  liveBriefing,
  savedBriefing,
  usesLiveBriefing
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
      rejectedItems: rejected.length,
      situationalItems72h: situationalRecentItems.length,
      situationalBriefingItems: situationalItems.length,
      promotedSituationalItems: promotedSituationalItems.length,
      briefingInputItems: briefingInputItems.length,
      liveTopicsGenerated: liveBriefing?.topics?.length || 0,
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
  return {
    ...cemInceProfile,
    id: politicianId,
    fullName: politicianId
      .split("-")
      .filter(Boolean)
      .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
      .join(" ") || "Neues Mandat",
    party: "",
    faction: "",
    committee: "",
    committees: [],
    focusTopics: [],
    topicPriorities: {},
    monitoringTargets: [],
    regionalInterests: [],
    relevantMinistries: ["Bundesregierung"],
    noGoTopics: []
  };
}

function mergeProfileDefaults(profile) {
  return {
    ...cemInceProfile,
    ...profile,
    id: profile.id || cemInceProfile.id,
    committees: arrayValue(profile.committees, profile.committee ? [profile.committee] : cemInceProfile.committees),
    focusTopics: arrayValue(profile.focusTopics, cemInceProfile.focusTopics),
    topicPriorities: profile.topicPriorities || cemInceProfile.topicPriorities || {},
    regionalInterests: arrayValue(profile.regionalInterests, cemInceProfile.regionalInterests),
    relevantMinistries: arrayValue(profile.relevantMinistries, cemInceProfile.relevantMinistries),
    monitoringTargets: arrayValue(profile.monitoringTargets, cemInceProfile.monitoringTargets),
    outputNeeds: arrayValue(profile.outputNeeds, cemInceProfile.outputNeeds),
    opponents: arrayValue(profile.opponents, cemInceProfile.opponents),
    localMedia: arrayValue(profile.localMedia, cemInceProfile.localMedia),
    noGoTopics: arrayValue(profile.noGoTopics, cemInceProfile.noGoTopics)
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
  filterRelevantItemsForCem: filterRelevantItemsForProfile,
  filterRelevantItemsForProfile,
  getLatestOrDemoBriefing
};
