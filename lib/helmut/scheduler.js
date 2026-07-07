const { crawlAllSources } = require("./crawler");
const {
  getProfile,
  getRawItemsSince,
  getSources,
  getTopicMemory,
  saveCrawlRun,
  saveLageCheck,
  saveRawItems,
  acquirePipelineLock,
  releasePipelineLock,
  saveRawDocument,
  v3StoreEnabled,
  listFullProfiles,
  listKnowledgeObjects
} = require("./storage");
const { cemInceProfile, profileCompleteness, parliamentTypeOf } = require("./config");
const sourceSafety = require("./sourceSafety");

// Account-Modus? Bewusst lokal (kein Import von auth.js -> kein Require-Zyklus),
// exakt dieselbe Regel wie auth.authMode(). Steuert das Demo-Gating im Schreibpfad:
// im Account-Modus NIE ein stiller Rueckfall auf das Demo-Profil cem-ince.
function authModeOn() {
  return String(process.env.HELMUT_AUTH_MODE || "").trim().toLowerCase() === "accounts";
}
const { isDipEnabled, getRelevantParliamentaryItems } = require("./dip");
const { toRawDocumentRow, dedupeRawDocuments } = require("./dedup");
const { runUnderstandingShadow, clusterRawDocuments, deriveVorgangId } = require("./understanding");
const { runLazyUnderstandingShadow } = require("./lazyUnderstanding");
const { runMatchingShadow } = require("./matching");
const { runDecisionShadow } = require("./decisions");

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
    // V3-Schatten (C7c): pro Cluster pruefen ob ein Nutzer interessiert ist;
    // bei Interesse status='pending' vormerken (kein KI-Call, idempotent).
    // Laeuft vor dem eager-Pfad (C8), damit vorgemerkte Cluster direkt aufgeloest werden.
    // Hinter HELMUT_V3_LAZY_UNDERSTANDING; fail-safe.
    await (async () => {
      if (!savedItems.length) return;
      try {
        const rows = dedupeRawDocuments(savedItems.map(toRawDocumentRow).filter((r) => r && r.id));
        const clusters = clusterRawDocuments(rows);
        const profiles = await listFullProfiles().catch(() => []);
        // ZEITBUDGET (Default 60s): auch dieser serielle Loop (pro Cluster ggf. ein
        // Supabase-Write) darf den Cron nicht über das Serverless-Limit treiben.
        const lazyBudgetMs = Number(process.env.HELMUT_CRAWL_LAZY_BUDGET_MS || 60000);
        const lazyStart = Date.now();
        let lazyRan = 0;
        for (const cluster of clusters) {
          if (Date.now() - lazyStart > lazyBudgetMs) break;
          lazyRan += 1;
          const vorgangId = deriveVorgangId(cluster);
          await runLazyUnderstandingShadow({ cluster, vorgangId, profiles }).catch(() => {});
        }
        console.log(`[runSourceCrawl] lazy-understanding ${Date.now() - lazyStart}ms clusters=${clusters.length} processed=${lazyRan} deferred=${clusters.length - lazyRan}`);
      } catch (error) {
        console.error("[runLazyUnderstandingShadow] Fehler (ignoriert):", error.message);
      }
    })();
    // V3-Schatten (C8 eager): globales, einmaliges Understanding pro NEUEM Vorgang (KI).
    // Nur mit HELMUT_V3_STORE + KI + Lock aktiv; sonst No-Op. Fail-safe wie oben.
    // ZEITBUDGET-BEGRENZT (Default 90s): der serielle KI-Loop (bis ~20s/Cluster) darf
    // den Crawl-Cron nicht über das Serverless-Limit (300s) treiben. Nicht verstandene,
    // interessierte Cluster bleiben pending -> dedizierter /api/cron/understanding-Lauf.
    const eagerStart = Date.now();
    const eagerResult = await runUnderstandingShadow(savedItems, {
      budgetMs: Number(process.env.HELMUT_CRAWL_UNDERSTAND_BUDGET_MS || 90000)
    }).catch((error) => ({ skipped: true, reason: "eager-error", error: error && error.message }));
    console.log(`[runSourceCrawl] eager-understanding ${Date.now() - eagerStart}ms ${JSON.stringify({ processed: eagerResult && eagerResult.processed, deferred: eagerResult && eagerResult.deferred, reason: eagerResult && eagerResult.reason })}`);
    // V3-Schatten (C7a): Profil-Embedding aktualisieren + KOs matchen (kein KI-Call).
    // Hinter HELMUT_V3_MATCHING; fail-safe.
    const matchingResult = await runMatchingShadow({ profile }).catch(() => null);
    // V3 Decision Engine: pro Nutzer x Vorgang die deterministische Entscheidung
    // (score/decision/priority_type) erzeugen + speichern (kein KI-Call).
    // Gatet auf v3StoreReady; fail-safe.
    const decisionResult = await runDecisionShadow({ profile }).catch(() => null);

    // --- Durchfluss-Zaehler + Quellen-Kategorien (additiv, fuer Admin-Datenstatus) ---
    const okById = new Map(crawl.results.map((r) => [r.sourceId, r.ok]));
    const sourcesByCategory = {};
    for (const s of selectedSources) {
      const cat = s.category || sourceSafety.categorizeSource(s);
      const b = sourcesByCategory[cat] || (sourcesByCategory[cat] = { checked: 0, ok: 0, failed: 0 });
      b.checked += 1;
      if (okById.get(s.id)) b.ok += 1; else b.failed += 1;
    }
    const loadedItems = crawl.results.reduce((sum, r) => sum + (r.itemCount || 0), 0) + dipRawItems.length;
    const newCandidateItems = crawl.newCandidateItems + dipRawItems.length;
    const newDocuments = savedItems.length;
    const completeness = profileCompleteness(profile);

    const run = await saveCrawlRun({
      mode,
      politicianId,
      checkedSources: crawl.checkedSources,
      successfulSources: crawl.successfulSources,
      failedSources: crawl.failedSources,
      newCandidateItems,
      savedItems: newDocuments,
      // Neue, bereits berechnete Durchfluss-Zaehler (keine neue Analytics-Architektur):
      loadedItems,                                                  // roh eingesammelt
      discardedItems: Math.max(0, loadedItems - newCandidateItems), // Dedup-im-Lauf + 1000er-Cap
      duplicates: Math.max(0, newCandidateItems - newDocuments),    // ueber Laeufe bereits bekannt
      sourcesByCategory,                                            // Quellen nach Kategorie
      understanding: {
        processed: (eagerResult && eagerResult.processed) || 0,
        deferred: (eagerResult && eagerResult.deferred) || 0,
        reason: (eagerResult && eagerResult.reason) || null
      },
      matching: shadowSummary(matchingResult),
      decisions: shadowSummary(decisionResult),
      profileCompleteness: { level: completeness.level, restricted: completeness.restricted, missing: completeness.missing },
      errors: crawl.results.filter((result) => !result.ok).map((result) => ({ sourceName: result.sourceName, error: result.error }))
    });
    return { ...run, savedItemsList: savedItems };
  } finally {
    await releasePipelineLock(lockName);
  }
}

// V3-Lage-Refresh: die frisch gecrawlten Lage-Items in V3-Daten falten
// (verstehen -> matchen -> neu bewerten). Ersetzt das V2-runMorningBriefing.
// Gleiche Funktionen + Reihenfolge wie runSourceCrawl (keine neue Architektur),
// zeitbudgetiert (Hänger-Schutz wie Step 1) und fail-safe (KEIN V2-Fallback).
async function foldLageItemsIntoV3(savedItems, profile) {
  // 1. Roh-Dokumente in die V3-Tabellen spiegeln (gated, fail-safe).
  await persistRawDocumentsShadow(savedItems).catch(() => {});
  // 2. Globales Understanding pro NEUEM Vorgang (KI), zeitbudgetiert — der serielle
  //    KI-Loop darf den lage-check-Cron nicht über das Serverless-Limit treiben.
  const understandStart = Date.now();
  const understanding = await runUnderstandingShadow(savedItems, {
    budgetMs: Number(process.env.HELMUT_LAGE_UNDERSTAND_BUDGET_MS || 60000)
  }).catch((error) => ({ skipped: true, reason: "lage-understand-error", error: error && error.message }));
  console.log(`[runLageCheck] understanding ${Date.now() - understandStart}ms ${JSON.stringify({ processed: understanding && understanding.processed, deferred: understanding && understanding.deferred, reason: understanding && understanding.reason })}`);
  // 3. Matching + deterministische Entscheidungen neu erzeugen (0 KI).
  await runMatchingShadow({ profile }).catch(() => {});
  const decision = await runDecisionShadow({ profile }).catch((error) => ({ skipped: true, reason: "lage-decision-error", error: error && error.message }));
  return {
    understanding: { processed: Number(understanding?.processed || 0), deferred: Number(understanding?.deferred || 0), reason: understanding?.reason || null },
    decision: { saved: Number(decision?.saved || 0), reason: decision?.reason || null }
  };
}

async function runLageCheck(politicianId = cemInceProfile.id) {
  const profile = await getActiveProfile(politicianId);
  // V3: Vorwissen kommt aus verstandenen Knowledge Objects, nicht aus dem V2-Blob.
  // Gleiche „verstanden"-Definition wie buildV3Briefing (status!==pending,
  // understanding_status=complete, mit Verständnis-Text) — kein V2-Fallback.
  const understoodBefore = (await listKnowledgeObjects({ limit: 200 }).catch(() => []))
    .filter((k) => k && k.status !== "pending" && k.understanding_status === "complete" && (k.was_ist_passiert || k.warum_wichtig));
  const hasV3PriorState = understoodBefore.length > 0;
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
  // „Refresh" heißt in V3: die neue Lage in die V3-Daten falten (kein V2-Briefing).
  // Ausgelöst, wenn es noch KEIN verstandenes V3-Vorwissen gibt ODER ein starker
  // neuer Kandidat auftaucht — identische Schwelle wie bisher.
  const shouldRefresh = !hasV3PriorState || Number(topCandidate?.weight || 0) >= lageCheckRegenerateThreshold;
  const status = shouldRefresh && topCandidate ? "changed" : "stable";
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
    // V3: Es wird NIE ein V2-Briefing regeneriert -> Legacy-Feld bleibt immer false.
    // Ob die neue Lage in V3 gefaltet wurde, sagt v3Refreshed (unten gesetzt).
    regeneratedBriefing: false,
    v3Refreshed: false,
    sourceLimit: selectedSources.length,
    topChange: topCandidate ? lageCheckTopChange(topCandidate.item, topCandidate.weight) : null,
    message: topCandidate && status === "changed"
      ? `Neue Lage erkannt: ${topCandidate.item.title}. Helmut priorisiert neu.`
      : stableLageCheckMessage()
  });

  if (!shouldRefresh) {
    return { ...check };
  }

  // V3 statt V2: neue Lage in Knowledge Objects + Decisions falten (kein V2-Briefing).
  const v3Refresh = await foldLageItemsIntoV3(savedItems, profile);
  const updatedCheck = await saveLageCheck({
    ...check,
    // KEIN V2-Briefing regeneriert (bleibt false); der V3-Refresh ist gelaufen.
    regeneratedBriefing: false,
    v3Refreshed: true,
    message: topCandidate
      ? `Neue Lage erkannt: ${topCandidate.item.title}. Deine Priorität wurde geprüft.`
      : "Helmut hat die Lage neu bewertet."
  });
  return { ...updatedCheck, v3Refresh };
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

// V3: Die stabile Lage-Meldung liest keinen V2-Briefing-Blob mehr. Der Fokus-Titel
// entsteht ohnehin frisch aus den Knowledge Objects (Lage-Ansicht), deshalb hier
// eine neutrale, ehrliche „nichts Neues"-Meldung ohne V2-Feldzugriff.
function stableLageCheckMessage() {
  return "Priorität unverändert. Helmut hat die Lage geprüft und hebt aktuell nichts Neues nach oben.";
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

// Profilbasierte Ingestion: die Quellen eines Laufs entstehen aus dem
// Mandatsprofil (Person, Partei/Fraktion, Ministerien, Ausschuss, Themen,
// Ebene/Bundesland) — KEINE harten Personen-/Cem-Themen mehr. Jede Quelle traegt
// zusaetzlich Kategorie + Vertrauensstufe (fuer Source-Guard + Admin-Sichtbarkeit).
async function getSourcesForProfile(profile) {
  const sharedSources = (await getSources()).filter((source) => source.type !== "person");
  const completeness = profileCompleteness(profile);
  // Leeres Profil (weder Name noch Partei): NUR neutrale Basis-Institutionsquellen,
  // KEINE Personensuche mit Platzhalter-id, keine profil-losen Themenquellen. So
  // laeuft ein unvollstaendiger Account eingeschraenkt statt mit fremdem Profil.
  const profileSources = completeness.empty
    ? []
    : [personNewsSource(profile), ...mandateNewsSources(profile)];
  return [...profileSources, ...sharedSources].map(withSafetyTags);
}

// Kleiner, sicherer Auszug eines Schatten-Runner-Ergebnisses (nur Skalare) fuer den
// Crawl-Run-Datensatz. Unbekannte/leere Formen -> null bzw. {ok:true}.
function shadowSummary(result) {
  if (!result || typeof result !== "object") return null;
  const out = {};
  if (result.skipped) out.skipped = true;
  if (result.reason) out.reason = String(result.reason);
  for (const k of ["candidates", "saved", "matched", "count", "processed", "updated"]) {
    if (typeof result[k] === "number") out[k] = result[k];
  }
  if (result.saved && typeof result.saved === "object" && typeof result.saved.saved === "number") out.saved = result.saved.saved;
  return Object.keys(out).length ? out : { ok: true };
}

// Kategorie + Vertrauensstufe an eine Quelle heften (respektiert bereits gesetzte
// Felder, leitet sonst regelbasiert aus Typ/Domain ab). Rein additiv.
function withSafetyTags(source) {
  return {
    ...source,
    category: sourceSafety.categorizeSource(source),
    trust: sourceSafety.trustForSource(source)
  };
}

function hasStr(v) { return String(v || "").trim().length > 0; }
function firstNonEmpty(list) { return (list || []).map((v) => String(v || "").trim()).find(Boolean) || ""; }
function quoteTerm(t) { const s = String(t || "").trim(); return /\s/.test(s) ? `"${s}"` : s; }

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
    category: "profil",
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

// Profil-Quellen: jede Quelle wird NUR gebaut, wenn das Profil die noetigen
// Merkmale liefert. Fehlt ein Merkmal, entfaellt die Quelle (kein harter Fallback).
function mandateNewsSources(profile) {
  const topics = topProfileTopics(profile, 5);
  const topicQuery = topics.length ? topics.slice(0, 5).map(quoteTerm).join(" OR ") : "";
  const factionTerms = uniqueTerms([profile.party, profile.faction]);
  const ministries = (profile.relevantMinistries || [])
    .map((m) => String(m || "").trim())
    .filter((m) => m && !/^bundesregierung$/i.test(m));
  const govActors = uniqueTerms(["Bundesregierung", "Bundeskabinett", ...ministries]);
  const committee = firstNonEmpty([profile.committee, (profile.committees || [])[0]]);
  const level = parliamentTypeOf(profile);
  const state = String(profile.state || "").trim();
  const sources = [];

  // 1. Regierungs-/Ministeriums-Vorhaben zu den Profil-Themen (nur mit Themen).
  if (topicQuery) {
    sources.push(newsSearchSource({
      id: `${profile.id}-news-regierung-vorhaben`,
      name: "Regierungsvorhaben zu deinen Themen",
      query: `(${govActors.map(quoteTerm).join(" OR ")}) (${topicQuery}) (Gesetzentwurf OR Eckpunkte OR Reform OR Initiative OR Vorhaben OR Kabinett)`,
      priority: 94,
      category: "offiziell",
      queryTerms: [...govActors, "Gesetzentwurf", "Eckpunkte", "Reform", "Vorhaben", ...topics]
    }));
  }
  // 2. Fraktion/Partei-Lage (nur mit Partei/Fraktion im Profil).
  if (factionTerms.length) {
    const partyQuery = factionTerms.map(quoteTerm).join(" OR ");
    sources.push(newsSearchSource({
      id: `${profile.id}-news-fraktion-partei`,
      name: "Fraktion und Partei Lage",
      query: topicQuery ? `(${partyQuery}) (${topicQuery})` : partyQuery,
      priority: 90,
      category: "partei_fraktion",
      queryTerms: [...factionTerms, ...topics]
    }));
  }
  // 3. Ministeriums-Radar (nur mit Ministerien im Profil).
  if (ministries.length) {
    sources.push(newsSearchSource({
      id: `${profile.id}-news-ministerien`,
      name: "Ministeriums-Radar",
      query: `(${ministries.map(quoteTerm).join(" OR ")})${topics.length ? " " + topics.slice(0, 3).map(quoteTerm).join(" ") : ""}`,
      priority: 88,
      category: "offiziell",
      queryTerms: [...ministries, ...topics]
    }));
  }
  // 4. Ausschuss-Themenradar (nur mit Ausschuss im Profil).
  if (committee) {
    sources.push(newsSearchSource({
      id: `${profile.id}-news-ausschuss-themen`,
      name: `${committee} Themenradar`,
      query: topicQuery ? `"${committee}" (${topicQuery})` : `"${committee}"`,
      priority: 84,
      category: "offiziell",
      queryTerms: [committee, ...topics]
    }));
  }
  // 5. Themen-Medienlage (nur mit Themen).
  if (topicQuery) {
    sources.push(newsSearchSource({
      id: `${profile.id}-news-themen-medien`,
      name: "Themen-Medienlage",
      query: `(${topicQuery}) (Bundesregierung OR Gesetzentwurf OR Reform)`,
      priority: 78,
      category: "medien",
      queryTerms: ["Bundesregierung", "Gesetzentwurf", "Reform", ...topics]
    }));
  }
  // 6. Landtag/Landes-Ebene: bei Landtag + Bundesland Landes-/Regionalquellen.
  if (level === "Landtag" && state) {
    sources.push(newsSearchSource({
      id: `${profile.id}-news-landtag`,
      name: `Landtag ${state}`,
      query: `("Landtag ${state}" OR "Landesregierung ${state}" OR "${state}")${topics.length ? " (" + topicQuery + ")" : ""}`,
      priority: 92,
      category: "regional",
      queryTerms: [`Landtag ${state}`, `Landesregierung ${state}`, state, ...topics]
    }));
  }
  return sources;
}

function newsSearchSource({ id, name, query, priority, queryTerms, category = "medien" }) {
  const encoded = encodeURIComponent(query);
  return {
    id,
    name,
    type: "media",
    category,
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

// Profil-Themen aus topicPriorities + focusTopics. Die Cem-typischen Standardthemen
// (Buergergeld/Mindestlohn/Rente/Pflege/Tarifbindung) sind KEIN Produktstandard mehr —
// sie gelten NUR fuer das Demo-Profil cem-ince (Pilot-Modus).
function topProfileTopics(profile, limit = 5) {
  const isDemo = !authModeOn() && String(profile.id || "").trim() === cemInceProfile.id;
  const prioritized = Object.entries(profile.topicPriorities || {})
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
    .map(([topic]) => topic);
  const demoFallback = isDemo ? ["Bürgergeld", "Mindestlohn", "Rente", "Pflege", "Tarifbindung"] : [];
  return uniqueTerms([
    ...prioritized,
    ...(profile.focusTopics || []),
    ...demoFallback
  ]).slice(0, limit);
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

// Diagnose: Warum ueberlebt ein Item den Artikellink-Filter nicht? Repliziert pro
// Item die Klassifikation von isPreciseArticleUrl und benennt den Ablehnungsgrund.
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
  // Reiche cem-ince-Seed-Defaults NUR im Pilot-Modus und nur fuer die echte
  // cem-ince-id. Im Account-Modus gibt es KEINEN stillen Personen-Fallback:
  // cem-ince wird dann wie jedes andere Mandat neutral behandelt.
  if (!authModeOn() && politicianId === cemInceProfile.id) return cemInceProfile;
  // Unbekanntes/ungespeichertes Mandat: neutrale Defaults (KEIN Cem-Fallback).
  // mergeProfileDefaults liefert das generische Geruest.
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
  accountType: "abgeordneter",
  parliamentType: "",
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

function mergeProfileDefaults(profile = {}) {
  // Nur das Demo-Profil cem-ince erbt die reichhaltigen Cem-Defaults — und das
  // NUR im Pilot-Modus. Ein id-loses oder unvollstaendiges Profil gilt NICHT als
  // Demo (kein stiller Personen-Fallback). Jedes andere Mandat bekommt neutrale
  // Defaults — keine fremden Themen/Ausschuesse/Personen.
  const isDemo = !authModeOn() && String(profile.id || "").trim() === cemInceProfile.id;
  const base = isDemo ? cemInceProfile : neutralProfileDefaults;
  return {
    ...base,
    ...profile,
    // Im Account-Modus NIE eine fremde (cem-ince) id erfinden; im Pilot bleibt
    // cem-ince der Single-Tenant-Standard, wenn keine id vorliegt.
    id: String(profile.id || "").trim() || (authModeOn() ? profile.id : cemInceProfile.id),
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

module.exports = {
  runSourceCrawl,
  runLageCheck,
  filterRelevantItemsForCem: filterRelevantItemsForProfile,
  filterRelevantItemsForProfile,
  getActiveProfile,
  mergeProfileDefaults,
  // Ingestion-Ableitung (exportiert fuer Tests der profilbasierten Quellenlogik):
  getSourcesForProfile,
  mandateNewsSources,
  topProfileTopics,
  buildPipelineDebugReport,
  dipDocToRawItem,
  dipPrimaryEnabled,
  fetchDipAsRawItems,
  persistRawDocumentsShadow
};
