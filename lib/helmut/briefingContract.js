"use strict";

// Helmut Core V3 — Contract-Adapter (Home / Briefing / Helmut, KEINE KI).
// "Einmal verstehen (global) -> mehrfach bewerten (pro Nutzer, 0 KI)".
//
// Baut aus V3-Daten (verstandene knowledge_objects + deterministische decisions
// aus decisions.js) die BESTEHENDE /api/app/start-Vertrags­form, die Home,
// Briefing und der Helmut-Tab (client.js) lesen. So kann V3 die Sekundär-Ober­
// flächen bedienen, ohne den Frontend-Vertrag zu brechen — und der V2-
// personalization.js/runtime.js-Pfad wird danach ersetzbar.
//
// Rein deterministisch, ohne KI, ohne Netzwerk: die einzige KI liegt (global,
// einmalig) in der Understanding-Engine; dieser Adapter formt nur um.
//
// Die "heilige" Schwellenregel (Server == Client, contract-snapshot-test):
//   score >= 60 -> "Sofort reagieren", >= 40 -> "Beobachten", sonst "Ignorieren".
// Jedes Objekt, das BEIDES trägt (relevance_score + decision), ist per Konstruktion
// konsistent (beide leiten sich aus demselben score ab).

const decisionsEngine = require("./decisions");

const HOME_SECTION_CAP = 3;

function firstSentence(text, maxLen = 160) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const cut = s.split(/(?<=[.!?])\s/)[0] || s;
  return cut.length > maxLen ? cut.slice(0, maxLen).replace(/\s+\S*$/, "") : cut;
}

function hostFromUrl(url) {
  try { return new URL(String(url)).hostname.replace(/^www\./, ""); }
  catch { return ""; }
}

// Prioritäts-Label aus Score — 1:1 wie der bisherige V2-Vertrag (personalization.js).
function priorityLabelFromScore(score) {
  const s = Number(score) || 0;
  if (s >= 90) return "Sofort handeln";
  if (s >= 80) return "Kritisch";
  if (s >= 60) return "Wichtig";
  if (s >= 40) return "Relevant";
  return "Beobachten";
}

function actionTypeFromDecision(decision) {
  if (decision === "Sofort reagieren") return "react";
  if (decision === "Beobachten") return "observe";
  return "ignore";
}

function buildSources(ko = {}, docs = []) {
  const list = (Array.isArray(docs) ? docs : [])
    .map((d) => ({
      name: d.source_name || d.name || hostFromUrl(d.url) || "Quelle",
      url: d.url || "",
      linkType: d.link_type || d.linkType || null,
      sourceType: d.source_type || d.sourceType || null,
      publishedAt: d.published_at || d.publishedAt || null
    }))
    .filter((s) => s.url);
  if (!list.length && ko.best_source_url) {
    list.push({
      name: hostFromUrl(ko.best_source_url) || "Quelle",
      url: ko.best_source_url,
      linkType: ko.best_link_type || null,
      sourceType: null,
      publishedAt: ko.updated_at || null
    });
  }
  return list;
}

// Ein Briefing-Item (ITEM_REQUIRED_KEYS: id,title,decision,priority,finalScore,
// recommendedAction,primarySource,sources).
function toItem(decision, ko, sources) {
  const score = decision.score;
  return {
    id: `item-${ko.vorgang_id}`,
    signalId: ko.id,
    knowledgeObjectId: ko.id,
    vorgangId: ko.vorgang_id,
    title: ko.display_title || ko.headline || firstSentence(ko.was_ist_passiert, 80) || ko.vorgang_id,
    decision: decision.decision,
    priority: priorityLabelFromScore(score),
    priorityType: decision.priority_type,
    finalScore: score,
    relevance_score: score,
    recommendedAction: ko.recommendation || ko.handlungsempfehlung || "",
    whyItMatters: ko.why_relevant || ko.warum_wichtig || "",
    summary: ko.display_summary || firstSentence(ko.was_ist_passiert, 200),
    riskNote: decision.risk || "",
    opportunityNote: decision.chance || "",
    matchedFeatures: Array.isArray(decision.matched_features) ? decision.matched_features : [],
    primarySource: sources[0] || null,
    sources,
    linkType: (sources[0] && sources[0].linkType) || ko.best_link_type || "missing",
    url: (sources[0] && sources[0].url) || ko.best_source_url || ""
  };
}

// Eine personalisierte Empfehlung (REC_REQUIRED_KEYS: id,relevance_score,
// current_priority,recommended_action,personal_relevance_explanation,action_type,status).
function toRecommendation(decision, ko, sources) {
  const score = decision.score;
  return {
    id: `rec-${ko.vorgang_id}`,
    knowledge_object_id: ko.id,
    vorgang_id: ko.vorgang_id,
    title: ko.display_title || ko.headline || "",
    relevance_score: score,
    decision: decision.decision,
    priorityType: decision.priority_type,
    current_priority: priorityLabelFromScore(score),
    previous_priority: null,
    recommended_action: ko.recommendation || ko.handlungsempfehlung || "",
    personal_relevance_explanation: ko.why_relevant || ko.warum_wichtig || "",
    consequence_if_ignored: decision.risk || "",
    possible_upside: decision.chance || "",
    action_type: actionTypeFromDecision(decision.decision),
    status: "new",
    sources
  };
}

// Home-Kachel (client compactHomeItem-Form). Trägt bewusst KEINEN `decision`-Key
// neben `relevanceScore` (camelCase) — der Konsistenz-Check greift nur bei
// `relevance_score` + `decision` zusammen.
function toHomeItem(item) {
  return {
    id: item.id,
    signalId: item.signalId,
    title: item.title,
    priority: item.priority,
    priorityLabel: item.priority,
    priorityType: item.priorityType,
    relevanceScore: item.finalScore,
    summary: item.summary,
    action: item.recommendedAction,
    whyItMatters: item.whyItMatters,
    contextType: null,
    sourceName: item.primarySource && item.primarySource.name,
    url: item.url,
    linkType: item.linkType,
    sources: item.sources.slice(0, 2)
  };
}

function cap(list, n = HOME_SECTION_CAP) {
  return list.slice(0, n).map(toHomeItem);
}

function buildHomeSections(items) {
  const active = items.filter((i) => i.decision !== "Ignorieren");
  return {
    topTasks: cap(active),
    needsAttention: cap(items.filter((i) => i.decision === "Sofort reagieren")),
    opportunities: cap(items.filter((i) => i.priorityType === "chance")),
    risks: cap(items.filter((i) => i.priorityType === "risk")),
    situational: cap(items.filter((i) => i.decision === "Beobachten")),
    governmentPlans: cap(items.filter((i) => i.matchedFeatures.some((f) => f.type === "ausschuss"))),
    partyFaction: cap(items.filter((i) => i.matchedFeatures.some((f) => f.type === "partei"))),
    changedSinceLastVisit: []
  };
}

function buildDecisionMetrics(items, generatedAt) {
  const count = (pred) => items.filter(pred).length;
  return {
    total: items.length,
    react: count((i) => i.decision === "Sofort reagieren"),
    observe: count((i) => i.decision === "Beobachten"),
    ignore: count((i) => i.decision === "Ignorieren"),
    risks: count((i) => i.priorityType === "risk"),
    chances: count((i) => i.priorityType === "chance"),
    generatedAt
  };
}

// Deterministische Tages-Einschätzung (KEIN KI-Call). priorityStatus ∈
// {stable,changed,risk,chance} — bewusst NICHT das decision-Enum (kein `decision`-Key).
function buildHelmutAssessment(profile, items, generatedAt) {
  const top = items[0] || null;
  const reactCount = items.filter((i) => i.decision === "Sofort reagieren").length;
  const riskTop = items.find((i) => i.priorityType === "risk");
  const chanceTop = items.find((i) => i.priorityType === "chance");
  const priorityStatus = riskTop ? "risk" : chanceTop ? "chance" : "stable";
  const first = profile && (profile.firstName || String(profile.fullName || "").split(" ")[0]);
  return {
    greeting: first ? `Guten Tag, ${first}.` : "Guten Tag.",
    priorityStatus,
    assessment: top
      ? `${reactCount} Vorgang/Vorgänge mit akutem Handlungsbedarf, ${items.length} insgesamt bewertet.`
      : "Heute keine Vorgänge mit ausreichendem Mandatsbezug.",
    recommendation: top ? top.recommendedAction : "",
    whyImportant: top ? top.whyItMatters : "",
    risk: riskTop ? riskTop.riskNote : "",
    chance: chanceTop ? chanceTop.opportunityNote : "",
    generatedAt,
    engine: "v3",
    source: "deterministic"
  };
}

function buildPersonMentions(kos) {
  const seen = new Map();
  for (const ko of kos) {
    for (const name of [].concat(ko.mentioned_mps || [], ko.mentioned_people || [])) {
      const key = String(name || "").trim();
      if (!key) continue;
      seen.set(key, (seen.get(key) || 0) + 1);
    }
  }
  return [...seen.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([name, mentions]) => ({ name, mentions }));
}

// --- Haupteinstieg: V3-Daten -> V2-Vertrag ----------------------------------
// decisions: Zeilen aus decisions.decideForUser / der decisions-Tabelle
//   (jede mit knowledge_object_id, score, decision, priority_type, chance, risk,
//    matched_features). kosById: id -> KO. sourcesByVorgang: vorgang_id -> docs[].
function toBriefingContractV3({ profile = {}, decisions = [], kosById = {}, sourcesByVorgang = {}, now = new Date() } = {}) {
  const generatedAt = (now instanceof Date ? now : new Date(now)).toISOString();
  const getKo = (id) => (kosById instanceof Map ? kosById.get(id) : kosById[id]);

  // Nach Score absteigend — höchste Relevanz zuerst (Position 1 = höchster Score).
  const ordered = [...(Array.isArray(decisions) ? decisions : [])]
    .filter((d) => d && d.knowledge_object_id && getKo(d.knowledge_object_id))
    .sort((a, b) => (b.score - a.score) || String(a.knowledge_object_id).localeCompare(String(b.knowledge_object_id)));

  const items = [];
  const recommendations = [];
  const usedKos = [];
  for (const d of ordered) {
    const ko = getKo(d.knowledge_object_id);
    const sources = buildSources(ko, sourcesByVorgang[ko.vorgang_id]);
    items.push(toItem(d, ko, sources));
    recommendations.push(toRecommendation(d, ko, sources));
    usedKos.push(ko);
  }

  return {
    items,
    personalizedRecommendations: recommendations,
    situationalBriefing: items.filter((i) => i.decision === "Beobachten"),
    homeSections: buildHomeSections(items),
    helmutAssessment: buildHelmutAssessment(profile, items, generatedAt),
    decisionMetrics: buildDecisionMetrics(items, generatedAt),
    personMentions: buildPersonMentions(usedKos),
    status: "Aktuell",
    generatedAt,
    engine: "v3"
  };
}

// Bequemer Read-Pfad-Einstieg: aus Profil + verstandenen KOs (+ Quellen) direkt
// den Vertrag bauen (Matching + Decision intern, deterministisch, 0 KI).
function buildContractFromKnowledgeObjects(profile = {}, knowledgeObjects = [], sourcesByVorgang = {}, opts = {}) {
  const userId = opts.userId || profile.id || profile.userId || profile.politicianId;
  const decisions = decisionsEngine.decideForUser(profile, knowledgeObjects, { userId, limit: opts.limit || 50 });
  const kosById = {};
  for (const ko of knowledgeObjects) if (ko && ko.id) kosById[ko.id] = ko;
  return toBriefingContractV3({ profile, decisions, kosById, sourcesByVorgang, now: opts.now || new Date() });
}

module.exports = {
  toBriefingContractV3,
  buildContractFromKnowledgeObjects,
  priorityLabelFromScore,
  actionTypeFromDecision,
  buildSources
};
