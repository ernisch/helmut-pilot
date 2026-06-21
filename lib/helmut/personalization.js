const actionTypes = [
  "ignore",
  "observe",
  "prepare_statement",
  "brief_team",
  "contact_office",
  "answer_press",
  "prepare_question",
  "post_social",
  "raise_in_committee",
  "schedule_follow_up"
];

const { buildLearningProfile, learningBiasForItem, learningReasonForItem } = require("./learning");

function personalizeBriefing(briefing, profile, memoryEntries = [], interactions = []) {
  const now = new Date().toISOString();
  const memoryByTopic = new Map((memoryEntries || []).map((entry) => [topicKey(entry.title || entry.topicKey), entry]));
  const seenBySignal = lastSeenMap(interactions);
  const learningProfile = buildLearningProfile(interactions);
  const recommendations = (briefing.items || [])
    .map((item) => personalizeItem(item, profile, memoryByTopic, seenBySignal, learningProfile, now))
    .filter((item) => item.relevance_score >= 35)
    .sort((a, b) => b.relevance_score - a.relevance_score);

  const referentEngine = auditReferentEngine(recommendations);
  const priorityChanges = recommendations
    .filter((recommendation) => recommendation.status_change !== "Unverändert")
    .map((recommendation) => ({
      id: `change-${recommendation.id}-${Date.now()}`,
      user_id: profile.id,
      recommendation_id: recommendation.id,
      political_item_id: recommendation.political_item_id,
      previous_priority: recommendation.previous_priority,
      current_priority: recommendation.current_priority,
      status_change: recommendation.status_change,
      change_reason: recommendation.change_reason,
      created_at: now
    }));

  const politicalItems = recommendations.map((recommendation) => ({
    id: recommendation.political_item_id,
    user_id: profile.id,
    title: recommendation.title,
    summary: recommendation.summary,
    topic: recommendation.topic,
    source_count: recommendation.source_count,
    confidence: recommendation.confidence,
    source_urls: recommendation.sources.map((source) => directRecommendationUrl(source)).filter(Boolean),
    created_at: recommendation.created_at,
    updated_at: now
  }));

  return {
    ...briefing,
    personalizedRecommendations: recommendations,
    politicalItems,
    priorityChanges,
    referentEngine,
    learningProfile,
    homeSections: buildHomeSections(recommendations, briefing),
    dayMode: dayMode(new Date()),
    executiveSummary: buildReferentSummary(recommendations, profile)
  };
}

function directRecommendationUrl(source = {}) {
  const candidates = [source.itemUrl, source.url].filter(Boolean);
  return candidates.find((url) => {
    if (source.linkType && source.linkType !== "direct") return false;
    try {
      const parsed = new URL(String(url));
      if (parsed.hostname.includes("google.")) return false;
      const path = parsed.pathname.replace(/\/+$/, "");
      if (!path || path === "/" || path.split("/").filter(Boolean).length === 0) return false;
      if (source.sourceUrl) {
        const sourceUrl = new URL(String(source.sourceUrl));
        if (parsed.hostname === sourceUrl.hostname && path === sourceUrl.pathname.replace(/\/+$/, "")) return false;
      }
      return true;
    } catch {
      return false;
    }
  }) || "";
}

function personalizeItem(item, profile, memoryByTopic, seenBySignal, learningProfile, now) {
  const text = `${item.title || ""} ${item.summary || ""} ${item.whyItMatters || ""} ${item.recommendedAction || ""}`.toLowerCase();
  const scores = scoreAgainstMandate(item, profile);
  const memory = memoryByTopic.get(topicKey(item.topic || item.title));
  const source = sourceTrustScore(item);
  const noGoPenalty = noGoPenaltyFor(item, profile);
  const interactionBias = learningBiasForItem(item, learningProfile);
  const relevanceScore = finalRelevanceScore(item, scores, source, noGoPenalty, interactionBias);
  const currentPriority = priorityFromScore(relevanceScore);
  const previousPriority = memory?.lastPriority || item.previousPriority || priorityFromDecision(memory?.lastDecision) || currentPriority;
  const statusChange = statusChangeFrom(previousPriority, currentPriority);
  const learningReason = learningReasonForItem(item, learningProfile, interactionBias);
  const changeReason = learningReason || changeReasonFor(item, scores, source, memory, statusChange);
  const deadline = item.taskTemplate?.dueDate || inferDeadline(item, currentPriority);
  const actionType = normalizeActionType(item.actionType || inferActionType(text, currentPriority));
  const recommendedChannel = recommendedChannelFor(item, profile, actionType, scores);
  const recommendedAction = directActionText(item.recommendedAction || recommendedActionFor(item, currentPriority));
  const consequence = directConsequenceText(item.inactionConsequence || consequenceFor(item, currentPriority));
  const communicationRecommendation = directCommunicationText(item.suggestedStatement || communicationFor(item, profile, recommendedChannel));

  const recommendation = {
    id: `rec-${item.signalId || item.id}`,
    user_id: profile.id,
    political_item_id: `pol-${topicKey(item.topic || item.title || item.id)}`,
    signal_id: item.signalId || item.id,
    title: item.title,
    topic: item.topic || item.title,
    summary: item.summary,
    relevance_score: relevanceScore,
    priority: priorityBucket(relevanceScore),
    politicalScore: scores.political,
    mandateScore: scores.mandate,
    finalScore: relevanceScore,
    sourceScore: source.score,
    sourceStrength: source.strength,
    sourceBasis: source.reason,
    noGoPenalty,
    interactionBias,
    learningReason,
    decision_readiness: decisionReadiness(relevanceScore, source, scores),
    ausschuss_bezug: scores.committee,
    wahlkreis_bezug: scores.constituency,
    partei_bezug: scores.party,
    fraktion_bezug: scores.faction,
    themen_bezug: scores.topic,
    termin_bezug: scores.appointment,
    medien_relevanz: scores.media,
    risiko_fuer_nutzer: scores.risk,
    chance_fuer_nutzer: scores.chance,
    zeitdruck: scores.urgency,
    personal_relevance_explanation: personalRelevanceExplanation(item, profile, scores, source),
    recommended_action: recommendedAction,
    action_type: actionType,
    recommended_channel: recommendedChannel,
    urgency: urgencyFromScore(scores.urgency, relevanceScore),
    deadline,
    estimated_effort_minutes: Number(item.estimatedTimeMinutes || item.taskTemplate?.estimatedEffortMinutes || effortForPriority(currentPriority)),
    consequence_if_ignored: consequence,
    possible_upside: item.opportunityNote || "Du bleibst fachlich sichtbar, ohne unnötig laut zu werden.",
    communication_recommendation: communicationRecommendation,
    previous_priority: previousPriority,
    current_priority: currentPriority,
    status_change: statusChange,
    change_reason: changeReason,
    last_seen_by_user: seenBySignal.get(item.signalId || item.id) || null,
    status: seenBySignal.has(item.signalId || item.id) ? "seen" : "new",
    source_count: source.count,
    confidence: item.confidence || "medium",
    sources: item.sources || [],
    primarySource: item.primarySource || item.sources?.[0] || null,
    taskTemplate: taskFromRecommendation({ ...item, suggestedStatement: communicationRecommendation }, profile, currentPriority, actionType, deadline),
    created_at: item.createdAt || now,
    updated_at: now
  };
  recommendation.referent_audit = auditRecommendation(recommendation, profile);
  return recommendation;
}

function auditReferentEngine(recommendations = []) {
  const visible = recommendations.filter((item) => item.relevance_score >= 40).slice(0, 5);
  if (!visible.length) {
    return {
      status: "Keine Entscheidung",
      score: 0,
      passed: 0,
      total: 1,
      issues: ["Keine relevante Empfehlung für den Referentenmodus vorhanden."],
      checkedAt: new Date().toISOString()
    };
  }
  const audits = visible.map((item) => item.referent_audit || auditRecommendation(item));
  const passed = audits.reduce((sum, audit) => sum + audit.passed, 0);
  const total = audits.reduce((sum, audit) => sum + audit.total, 0) || 1;
  const score = Math.round((passed / total) * 100);
  return {
    status: score >= 95 ? "Stabschefbereit" : score >= 85 ? "Pilotbereit" : "Nachschärfen",
    score,
    passed,
    total,
    recommendationCount: visible.length,
    issues: audits.flatMap((audit) => audit.issues).slice(0, 8),
    checkedAt: new Date().toISOString()
  };
}

function auditRecommendation(item, profile = {}) {
  const checks = [];
  const issues = [];
  const personalText = item.personal_relevance_explanation || item.whyItMatters;
  const actionText = item.recommended_action || item.recommendedAction;
  const consequenceText = item.consequence_if_ignored || item.inactionConsequence || item.riskNote;
  const communicationText = item.communication_recommendation || item.suggestedStatement;
  addAuditCheck(checks, issues, hasText(personalText) && usesDirectAddress(personalText) && !speaksAboutUser(personalText, profile), "Persönliche Begründung spricht den Nutzer nicht sauber direkt an.");
  addAuditCheck(checks, issues, hasText(actionText) && usesDirectAddress(actionText), "Handlungsempfehlung ist nicht konkret oder nicht direkt formuliert.");
  addAuditCheck(checks, issues, hasText(consequenceText) && usesDirectAddress(consequenceText), "Folge bei Nichtreaktion fehlt oder spricht nicht direkt an.");
  addAuditCheck(checks, issues, hasText(communicationText) && usesDirectAddress(communicationText), "Kommunikationsvorschlag fehlt oder ist zu generisch.");
  addAuditCheck(checks, issues, hasDirectSourceLink(item), "Präziser Artikellink fehlt.");
  addAuditCheck(checks, issues, Boolean(item.taskTemplate || item.task_template), "Aufgabe/Büroauftrag fehlt.");
  addAuditCheck(checks, issues, Number(item.mandateScore || 0) > 0 && Number(item.politicalScore || 0) > 0, "Score-Begründung fehlt.");
  const passed = checks.filter(Boolean).length;
  const total = checks.length || 1;
  const score = Math.round((passed / total) * 100);
  return {
    status: score >= 95 ? "stabschefbereit" : score >= 85 ? "pilotbereit" : "nachschaerfen",
    score,
    passed,
    total,
    issues
  };
}

function addAuditCheck(checks, issues, passed, issue) {
  checks.push(Boolean(passed));
  if (!passed) issues.push(issue);
}

function hasDirectSourceLink(item = {}) {
  const sources = item.sources?.length ? item.sources : [item.primarySource, item.primary_source].filter(Boolean);
  return sources.some((source) => Boolean(directRecommendationUrl(source)));
}

function buildHomeSections(recommendations, briefing) {
  const visible = recommendations.filter((item) => item.relevance_score >= 40);
  const tasks = visible
    .filter((item) => item.action_type !== "ignore")
    .slice(0, 3);
  const changed = visible
    .filter((item) => item.status_change !== "Unverändert" || item.status === "new")
    .slice(0, 3);
  const attention = visible
    .filter((item) => ["wichtig", "sofort handeln", "kritisch"].includes(item.priority))
    .slice(0, 3);
  const chances = visible
    .filter((item) => item.chance_fuer_nutzer >= item.risiko_fuer_nutzer && item.chance_fuer_nutzer >= 55)
    .slice(0, 3);
  const risks = visible
    .filter((item) => item.risiko_fuer_nutzer >= 55)
    .slice(0, 3);

  return {
    topTasks: tasks,
    changedSinceLastVisit: changed,
    needsAttention: attention,
    opportunities: chances,
    risks,
    situational: briefing.situationalBriefing || []
  };
}

function scoreAgainstMandate(item, profile) {
  const text = `${item.title || ""} ${item.summary || ""} ${item.whyItMatters || ""} ${item.recommendedAction || ""}`.toLowerCase();
  const profileTopics = profile.topicPriorities || {};
  const committees = [profile.committee, ...(profile.committees || [])].filter(Boolean);
  const topicHits = Object.entries(profileTopics).filter(([topic]) => hasTerm(text, topic));
  const maxTopicPriority = topicHits.reduce((max, [, priority]) => Math.max(max, Number(priority) || 1), 0);
  const committee = committees.some((committeeName) => hasTerm(text, committeeName)) || hasAnyTerm(text, ["arbeit", "soziales", "bmas", "pflege", "mindestlohn", "rente", "bürgergeld", "tarif", "arbeitszeit"]) ? 92 : 20;
  const party = hasTerm(text, profile.party) ? 80 : item.primarySource?.sourceType === "party" ? 72 : 20;
  const faction = hasTerm(text, profile.faction) ? 80 : party;
  const topic = maxTopicPriority ? 35 + maxTopicPriority * 13 : hasAnyTerm(text, profile.focusTopics || []) ? 72 : 25;
  const constituency = hasAnyTerm(text, [profile.constituency, profile.state, profile.location, ...(profile.regionalInterests || [])].filter((value) => value && !/^noch offen$/i.test(value))) ? 78 : 20;
  const appointment = hasAnyTerm(text, ["heute", "morgen", "ausschuss", "tagesordnung", "sitzung", "frist"]) ? 76 : 28;
  const media = clamp((item.sourceCount || 1) * 14 + sourceWeight(item.primarySource?.sourceType || item.sourceType || "media") * 0.7);
  const risk = clamp(Number(item.relevanceBreakdown?.conflictScore || item.riskScore || 0) || (hasAnyTerm(text, ["kritik", "angriff", "risiko", "warnt", "vorwurf"]) ? 82 : 32));
  const chance = clamp(Number(item.relevanceBreakdown?.governmentScore || item.opportunityScore || 0) || (hasAnyTerm(text, ["gesetz", "eckpunkte", "initiative", "chance", "fordert"]) ? 78 : 32));
  const urgency = clamp(Number(item.relevanceBreakdown?.timePressureScore || item.urgencyScore || 0) || (hasAnyTerm(text, ["heute", "morgen", "jetzt", "fragt", "legt vor"]) ? 82 : 35));
  const mandate = clamp(committee * 0.26 + topic * 0.28 + party * 0.1 + faction * 0.08 + constituency * 0.1 + appointment * 0.08 + risk * 0.05 + chance * 0.05);
  const political = clamp(media * 0.18 + risk * 0.18 + chance * 0.18 + urgency * 0.2 + committee * 0.16 + topic * 0.1);
  return { political, mandate, committee, constituency, party, faction, topic, appointment, media, risk, chance, urgency };
}

function finalRelevanceScore(item, scores, source, noGoPenalty, interactionBias) {
  const text = `${item.decision || ""} ${item.recommendedAction || ""} ${item.summary || ""}`.toLowerCase();
  if (
    item.decision === "Ignorieren" ||
    text.includes("ignoriere das thema") ||
    text.includes("keine aktion") ||
    text.includes("lass das thema") ||
    text.includes("außen vor") ||
    text.includes("aussen vor")
  ) {
    return clamp(Math.min(34, scores.mandate * 0.25 + source.score * 0.1));
  }
  let score = scores.political * 0.48 + scores.mandate * 0.37 + source.score * 0.15 + interactionBias - noGoPenalty;
  const sourceType = item.primarySource?.sourceType || item.sourceType || "media";
  const hasPersonMention = String(`${item.title || ""} ${item.summary || ""}`).toLowerCase().includes("cem ince");
  const strongSource = ["ministry", "bundestag", "committee", "party", "association", "official"].includes(sourceType);
  if (!strongSource && source.count <= 1 && !hasPersonMention) score = Math.min(score, 79);
  if (noGoPenalty >= 20) score = Math.min(score, 59);
  return clamp(score);
}

function sourceTrustScore(item) {
  const count = Math.max(1, Number(item.sourceCount || item.sources?.length || 1));
  const sourceType = item.primarySource?.sourceType || item.sourceType || "media";
  const confidence = item.confidence || item.primarySource?.confidence || "medium";
  const base = sourceWeight(sourceType);
  const confidenceBoost = confidence === "high" ? 12 : confidence === "low" ? -12 : 0;
  const confirmationBoost = count >= 3 ? 16 : count === 2 ? 9 : 0;
  const score = clamp(base + confidenceBoost + confirmationBoost);
  const strength = score >= 85 ? "hoch" : score >= 65 ? "mittel" : "niedrig";
  const reason = count >= 2
    ? `${count} bestätigende Quellen, Sicherheit ${strength}`
    : `Einzelquelle ${item.primarySource?.sourceName || item.sourceName || "Quelle"}, Sicherheit ${strength}`;
  return { score, strength, count, reason };
}

function noGoPenaltyFor(item, profile) {
  const text = `${item.title || ""} ${item.summary || ""} ${item.recommendedAction || ""}`.toLowerCase();
  const hits = (profile.noGoTopics || []).filter((topic) => hasTerm(text, topic));
  return Math.min(30, hits.length * 15);
}

function personalRelevanceExplanation(item, profile, scores, source) {
  const reasons = [];
  if (scores.committee >= 80) reasons.push(`dein Ausschuss ${profile.committee || profile.committees?.[0] || "fachlich"} betroffen ist`);
  if (scores.topic >= 70) reasons.push("das Thema in deinem Mandatsprofil hoch priorisiert ist");
  if (scores.party >= 70 || scores.faction >= 70) reasons.push(`deine Partei oder Fraktion (${profile.faction || profile.party}) berührt ist`);
  if (scores.constituency >= 70) reasons.push("ein Wahlkreis- oder Regionalbezug erkennbar ist");
  if (scores.appointment >= 70) reasons.push("der Vorgang zeitlich nah ansteht");
  if (source.score >= 80) reasons.push("die Quellenlage belastbar genug für eine politische Vorbereitung ist");
  if (!reasons.length) reasons.push("Helmut einen möglichen politischen Anschluss erkennt, aber noch keinen starken persönlichen Bezug sieht");
  return `Das betrifft dich, weil ${reasons.slice(0, 3).join(", ")}.`;
}

function taskFromRecommendation(item, profile, currentPriority, actionType, deadline) {
  return {
    id: `task-${item.signalId || item.id}`,
    title: taskTitleFor(item, actionType),
    description: `${item.recommendedAction || "Bitte fachlich vorbereiten."}\n\nPrüfe kurz: Warum betrifft dich das? Was ist die rote Linie? Welche Formulierung kann direkt genutzt werden?`,
    priority: ["Sofort handeln", "Kritisch"].includes(currentPriority) ? "high" : currentPriority === "Wichtig" ? "medium" : "low",
    dueDate: deadline,
    assignee: assigneeFor(actionType),
    status: "open",
    sourceSignalId: item.signalId || item.id,
    politicalBenefit: item.opportunityNote || "Du kannst früh sprechfähig werden.",
    riskIfIgnored: item.inactionConsequence || "Andere Akteure prägen die Debatte.",
    sources: item.sources || [],
    primarySource: item.primarySource || item.sources?.[0] || null,
    confidence: item.confidence || "medium",
    sourceNote: item.sourceNote || "",
    createdAt: new Date().toISOString()
  };
}

function buildReferentSummary(recommendations, profile) {
  const top = recommendations[0];
  const greeting = currentBerlinGreeting();
  if (!top) return `${greeting} Für ${profile.fullName} liegt gerade keine belastbare politische Entscheidung an.`;
  return `${greeting} Deine wichtigste Entscheidung ist heute: ${top.title}. ${top.recommended_action}`;
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

function lastSeenMap(interactions = []) {
  const map = new Map();
  interactions.forEach((interaction) => {
    if (interaction.signalId && ["detail_opened", "communication_copied", "task_copied"].includes(interaction.type)) {
      map.set(interaction.signalId, interaction.createdAt || interaction.created_at || new Date().toISOString());
    }
  });
  return map;
}

function buildInteractionBias(interactions = []) {
  const byTopic = new Map();
  interactions.forEach((interaction) => {
    const key = topicKey(interaction.topic || interaction.title || interaction.politicalItemId || interaction.recommendationId || interaction.signalId);
    const current = byTopic.get(key) || 0;
    const type = interaction.type || interaction.action || "";
    const delta = type === "ignored" ? -8
      : type === "marked_important" ? 8
        : type === "task_copied" || type === "delegated" ? 6
          : type === "communication_copied" ? 5
            : type === "detail_opened" ? 2
            : 0;
    byTopic.set(key, Math.max(-15, Math.min(15, current + delta)));
  });
  return byTopic;
}

function priorityFromScore(score) {
  if (score >= 90) return "Sofort handeln";
  if (score >= 80) return "Kritisch";
  if (score >= 60) return "Wichtig";
  if (score >= 40) return "Relevant";
  return "Beobachten";
}

function priorityBucket(score) {
  if (score >= 90) return "sofort handeln";
  if (score >= 80) return "kritisch";
  if (score >= 60) return "wichtig";
  if (score >= 40) return "relevant";
  return "ignorieren";
}

function priorityFromDecision(decision) {
  if (decision === "Sofort reagieren") return "Wichtig";
  if (decision === "Beobachten") return "Relevant";
  if (decision === "Ignorieren") return "Beobachten";
  return "";
}

function statusChangeFrom(previousPriority, currentPriority) {
  const order = ["Beobachten", "Relevant", "Wichtig", "Kritisch", "Sofort handeln"];
  const previous = order.indexOf(previousPriority);
  const current = order.indexOf(currentPriority);
  if (previous < 0 || current < 0 || previous === current) return "Unverändert";
  return current > previous ? `Von ${previousPriority} auf ${currentPriority} hochgestuft` : `Von ${previousPriority} auf ${currentPriority} heruntergestuft`;
}

function changeReasonFor(item, scores, source, memory, statusChange) {
  if (!memory) return "Neu in deiner politischen Lage.";
  if (statusChange === "Unverändert") return "Keine relevante Veränderung seit der letzten Einordnung.";
  if (source.count >= 2 || source.score >= 85) return "Die Quellenlage ist belastbarer geworden.";
  if (scores.media >= 75) return "Neue oder stärkere öffentliche Aufmerksamkeit.";
  if (scores.urgency >= 75) return "Der Zeitdruck ist gestiegen.";
  if (scores.risk >= 75) return "Das Risiko für deine Positionierung ist gestiegen.";
  if (scores.chance >= 75) return "Es entsteht eine verwertbare politische Chance.";
  return "Die Mandatsrelevanz hat sich verändert.";
}

function dayMode(date) {
  const hourPart = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    hour12: false
  }).formatToParts(date).find((part) => part.type === "hour");
  const hour = Number(hourPart?.value || 0);
  if (hour < 10) return { phase: "Morgen", focus: "Was heute wichtig wird" };
  if (hour < 12) return { phase: "Vormittag", focus: "Was vorbereitet werden muss" };
  if (hour < 15) return { phase: "Mittag", focus: "Was sich verändert hat" };
  if (hour < 19) return { phase: "Nachmittag", focus: "Worauf du reagieren solltest" };
  return { phase: "Abend", focus: "Was morgen vorbereitet werden sollte" };
}

function inferDeadline(item, priority) {
  const due = new Date();
  const berlinHour = Number(new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", hour12: false }).format(due));
  if (priority === "Sofort handeln") due.setHours(due.getHours() + 1, 0, 0, 0);
  else if (priority === "Kritisch") due.setHours(berlinHour >= 12 ? due.getHours() + 2 : 12, 0, 0, 0);
  else if (priority === "Wichtig") due.setHours(berlinHour >= 16 ? 18 : 16, 0, 0, 0);
  else due.setHours(18, 0, 0, 0);
  return due.toISOString();
}

function effortForPriority(priority) {
  if (priority === "Sofort handeln") return 15;
  if (priority === "Kritisch") return 12;
  if (priority === "Wichtig") return 10;
  return 5;
}

function normalizeActionType(value) {
  const normalized = String(value || "").toLowerCase().replace(/\s+/g, "_");
  if (actionTypes.includes(normalized)) return normalized;
  const map = {
    "keine_aktion": "ignore",
    "beobachten": "observe",
    "stellungnahme": "prepare_statement",
    "presse": "answer_press",
    "social_media": "post_social",
    "ausschussarbeit": "raise_in_committee",
    "wahlkreisarbeit": "contact_office",
    "delegieren": "brief_team"
  };
  return map[normalized] || "brief_team";
}

function inferActionType(text, priority) {
  if (priority === "Beobachten") return "observe";
  if (/presse|redaktion|interview/.test(text)) return "answer_press";
  if (/social|instagram|linkedin|x /.test(text)) return "post_social";
  if (/ausschuss|frage|sitzung/.test(text)) return "raise_in_committee";
  if (/termin|später|nachhalten/.test(text)) return "schedule_follow_up";
  return "prepare_statement";
}

function urgencyFromScore(score, relevanceScore) {
  if (score >= 80 || relevanceScore >= 90) return "hoch";
  if (score >= 55 || relevanceScore >= 60) return "mittel";
  return "niedrig";
}

function consequenceFor(item, priority) {
  if (["Sofort handeln", "Kritisch"].includes(priority)) return "Wenn du nicht reagierst, setzen andere Akteure den Frame, bevor du sprechfähig bist.";
  if (priority === "Wichtig") return "Wenn du nicht reagierst, verlierst du eine gute Gelegenheit, fachlich früh sichtbar zu werden.";
  return "Wenn du nicht reagierst, entsteht kein unmittelbarer Schaden; du solltest das Thema aber beobachtet halten.";
}

function recommendedActionFor(item, priority) {
  if (priority === "Sofort handeln") return "Du solltest jetzt eine kurze öffentliche Linie vorbereiten.";
  if (priority === "Kritisch") return "Du solltest dein Büro eine belastbare Linie vorbereiten lassen.";
  if (priority === "Wichtig") return "Du solltest das Thema prüfen und heute entscheiden, ob du öffentlich wirst.";
  return "Du solltest beobachten und nur bei neuer Dynamik reagieren.";
}

function recommendedChannelFor(item, profile, actionType, scores) {
  const preferred = profile.preferredChannels || [];
  if (actionType === "answer_press" && preferred.includes("presse")) return "presse";
  if (actionType === "raise_in_committee" && preferred.includes("ausschuss")) return "ausschuss";
  if (scores.chance >= 70 && preferred.includes("linkedin")) return "linkedin";
  if (scores.risk >= 70 && preferred.includes("presse")) return "presse";
  if (preferred.includes("x")) return "x";
  return preferred[0] || "presse";
}

function communicationFor(item, profile, channel) {
  const topic = item.topic || item.title || "das Thema";
  const style = String(profile.communicationStyle || "sachlich").toLowerCase();
  if (channel === "ausschuss") {
    return `Im Ausschuss solltest du bei ${topic} nach konkreter Umsetzung, Kontrolle und sozialer Wirkung fragen. Entscheidend ist, ob die Bundesregierung belastbare Antworten liefert.`;
  }
  if (style.includes("angriff")) {
    return `${topic} darf nicht bei Ankündigungen stehen bleiben. Du kannst jetzt deutlich machen, woran sich die Bundesregierung konkret messen lassen muss.`;
  }
  return `${topic} ist für deinen Ausschuss Arbeit und Soziales relevant. Du kannst sachlich einordnen, was jetzt geprüft werden muss und welche Folgen das für Beschäftigte und soziale Sicherheit hat.`;
}

function directActionText(text) {
  if (usesDirectAddress(text)) return text;
  return `Du solltest ${lowerFirst(String(text || "eine kurze Linie vorbereiten").replace(/\.$/, ""))}.`;
}

function directConsequenceText(text) {
  if (usesDirectAddress(text)) return text;
  return `Wenn du nicht reagierst, ${lowerFirst(String(text || "geht politischer Spielraum verloren").replace(/\.$/, ""))}.`;
}

function directCommunicationText(text) {
  if (usesDirectAddress(text)) return text;
  return `${String(text || "").trim()} Du kannst damit zeigen, welche soziale Wirkung jetzt entscheidend ist.`.trim();
}

function decisionReadiness(score, source, scores) {
  if (score >= 85 && source.score >= 75) return "entscheidungsreif";
  if (score >= 70 && source.score >= 75) return "vorbereiten";
  if (score >= 60 && (scores.urgency >= 70 || source.count >= 2)) return "vorbereiten";
  return "beobachten";
}

function taskTitleFor(item, actionType) {
  if (actionType === "raise_in_committee") return `Ausschusslinie vorbereiten: ${item.title}`;
  if (actionType === "answer_press") return `Presseantwort vorbereiten: ${item.title}`;
  if (actionType === "post_social") return `Social-Post vorbereiten: ${item.title}`;
  return `Linie vorbereiten: ${item.title}`;
}

function assigneeFor(actionType) {
  if (["answer_press", "post_social", "prepare_statement"].includes(actionType)) return "Pressesprecher";
  if (actionType === "raise_in_committee") return "Wissenschaftlicher Mitarbeiter";
  if (actionType === "schedule_follow_up") return "Büroleitung";
  return "Referent";
}

function sourceWeight(sourceType) {
  const weights = {
    bundestag: 100,
    ministry: 95,
    committee: 95,
    party: 90,
    person: 90,
    association: 75,
    media: 70,
    local: 60,
    social: 30
  };
  return weights[sourceType] || 50;
}

function topicKey(value) {
  return String(value || "topic")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "topic";
}

function hasAnyTerm(text, terms) {
  return (terms || []).some((term) => hasTerm(text, term));
}

function hasText(value) {
  return String(value || "").trim().length >= 8;
}

function usesDirectAddress(value) {
  return /\b(du|dich|dir|dein|deine|deinen|deinem|deiner|deines)\b/i.test(String(value || ""));
}

function speaksAboutUser(value, profile = {}) {
  const firstName = String(profile.fullName || "").split(/\s+/).filter(Boolean)[0] || "Cem";
  return new RegExp(`\\b${firstName}\\b\\s+(kann|sollte|muss|wird|hat)`, "i").test(String(value || ""));
}

function lowerFirst(value) {
  const text = String(value || "").trim();
  if (!text) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function hasTerm(text, term) {
  const normalized = String(term || "").toLowerCase().trim();
  if (!normalized) return false;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-zäöüß])${escaped}($|[^a-zäöüß])`, "i").test(text);
}

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

module.exports = { personalizeBriefing };
