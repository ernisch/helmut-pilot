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

function personalizeBriefing(briefing, profile, memoryEntries = [], interactions = []) {
  const now = new Date().toISOString();
  const memoryByTopic = new Map((memoryEntries || []).map((entry) => [topicKey(entry.title || entry.topicKey), entry]));
  const seenBySignal = lastSeenMap(interactions);
  const recommendations = (briefing.items || [])
    .map((item) => personalizeItem(item, profile, memoryByTopic, seenBySignal, now))
    .sort((a, b) => b.relevance_score - a.relevance_score);

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
    source_urls: recommendation.sources.map((source) => source.url || source.itemUrl || source.sourceUrl).filter(Boolean),
    created_at: recommendation.created_at,
    updated_at: now
  }));

  return {
    ...briefing,
    personalizedRecommendations: recommendations,
    politicalItems,
    priorityChanges,
    homeSections: buildHomeSections(recommendations, briefing),
    dayMode: dayMode(new Date()),
    executiveSummary: buildReferentSummary(recommendations, profile)
  };
}

function personalizeItem(item, profile, memoryByTopic, seenBySignal, now) {
  const text = `${item.title || ""} ${item.summary || ""} ${item.whyItMatters || ""} ${item.recommendedAction || ""}`.toLowerCase();
  const scores = scoreAgainstMandate(item, profile);
  const relevanceScore = clamp(scores.political * 0.6 + scores.mandate * 0.4);
  const currentPriority = priorityFromScore(relevanceScore);
  const memory = memoryByTopic.get(topicKey(item.topic || item.title));
  const previousPriority = memory?.lastPriority || item.previousPriority || priorityFromDecision(memory?.lastDecision) || currentPriority;
  const statusChange = statusChangeFrom(previousPriority, currentPriority);
  const changeReason = changeReasonFor(item, scores, memory, statusChange);
  const deadline = item.taskTemplate?.dueDate || inferDeadline(item, currentPriority);
  const actionType = normalizeActionType(item.actionType || inferActionType(text, currentPriority));

  return {
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
    personal_relevance_explanation: personalRelevanceExplanation(item, profile, scores),
    recommended_action: item.recommendedAction || recommendedActionFor(item, currentPriority),
    action_type: actionType,
    urgency: urgencyFromScore(scores.urgency, relevanceScore),
    deadline,
    estimated_effort_minutes: Number(item.estimatedTimeMinutes || item.taskTemplate?.estimatedEffortMinutes || effortForPriority(currentPriority)),
    consequence_if_ignored: item.inactionConsequence || consequenceFor(item, currentPriority),
    possible_upside: item.opportunityNote || "Du bleibst fachlich sichtbar, ohne unnötig laut zu werden.",
    communication_recommendation: item.suggestedStatement || "",
    previous_priority: previousPriority,
    current_priority: currentPriority,
    status_change: statusChange,
    change_reason: changeReason,
    last_seen_by_user: seenBySignal.get(item.signalId || item.id) || null,
    status: seenBySignal.has(item.signalId || item.id) ? "seen" : "new",
    source_count: item.sourceCount || item.sources?.length || 0,
    confidence: item.confidence || "medium",
    sources: item.sources || [],
    primarySource: item.primarySource || item.sources?.[0] || null,
    taskTemplate: taskFromRecommendation(item, profile, currentPriority, actionType, deadline),
    created_at: item.createdAt || now,
    updated_at: now
  };
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

function personalRelevanceExplanation(item, profile, scores) {
  const reasons = [];
  if (scores.committee >= 80) reasons.push(`dein Ausschuss ${profile.committee || profile.committees?.[0] || "fachlich"} betroffen ist`);
  if (scores.topic >= 70) reasons.push("das Thema in deinem Mandatsprofil hoch priorisiert ist");
  if (scores.party >= 70 || scores.faction >= 70) reasons.push(`deine Partei oder Fraktion (${profile.faction || profile.party}) berührt ist`);
  if (scores.constituency >= 70) reasons.push("ein Wahlkreis- oder Regionalbezug erkennbar ist");
  if (scores.appointment >= 70) reasons.push("der Vorgang zeitlich nah ansteht");
  if (!reasons.length) reasons.push("Helmut einen möglichen politischen Anschluss erkennt, aber noch keinen starken persönlichen Bezug sieht");
  return `Das betrifft dich, weil ${reasons.slice(0, 3).join(", ")}.`;
}

function taskFromRecommendation(item, profile, currentPriority, actionType, deadline) {
  return {
    id: `task-${item.signalId || item.id}`,
    title: taskTitleFor(item, actionType),
    description: `${item.recommendedAction || "Bitte fachlich vorbereiten."}\n\nPrüfe kurz: Warum betrifft es ${profile.fullName}? Was ist die rote Linie? Welche Formulierung kann direkt genutzt werden?`,
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
  if (!top) return `Guten Morgen. Für ${profile.fullName} liegt gerade keine belastbare politische Entscheidung an.`;
  return `Guten Morgen. Die wichtigste Entscheidung ist heute: ${top.title}. ${top.recommended_action}`;
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

function changeReasonFor(item, scores, memory, statusChange) {
  if (!memory) return "Neu in deiner politischen Lage.";
  if (statusChange === "Unverändert") return "Keine relevante Veränderung seit der letzten Einordnung.";
  if (scores.media >= 75) return "Neue oder stärkere öffentliche Aufmerksamkeit.";
  if (scores.urgency >= 75) return "Der Zeitdruck ist gestiegen.";
  if (scores.risk >= 75) return "Das Risiko für deine Positionierung ist gestiegen.";
  if (scores.chance >= 75) return "Es entsteht eine verwertbare politische Chance.";
  return "Die Mandatsrelevanz hat sich verändert.";
}

function dayMode(date) {
  const hour = Number(new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", hour12: false }).format(date));
  if (hour < 10) return { phase: "Morgen", focus: "Was heute wichtig wird" };
  if (hour < 12) return { phase: "Vormittag", focus: "Was vorbereitet werden muss" };
  if (hour < 15) return { phase: "Mittag", focus: "Was sich verändert hat" };
  if (hour < 19) return { phase: "Nachmittag", focus: "Worauf du reagieren solltest" };
  return { phase: "Abend", focus: "Was morgen vorbereitet werden sollte" };
}

function inferDeadline(item, priority) {
  const due = new Date();
  if (priority === "Sofort handeln") due.setHours(due.getHours() + 1, 0, 0, 0);
  else if (priority === "Kritisch") due.setHours(12, 0, 0, 0);
  else if (priority === "Wichtig") due.setHours(16, 0, 0, 0);
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
  if (["Sofort handeln", "Kritisch"].includes(priority)) return "Andere Akteure setzen den Frame, bevor du sprechfähig bist.";
  if (priority === "Wichtig") return "Du verlierst eine gute Gelegenheit, fachlich früh sichtbar zu werden.";
  return "Kein unmittelbarer Schaden, aber das Thema sollte beobachtet bleiben.";
}

function recommendedActionFor(item, priority) {
  if (priority === "Sofort handeln") return "Bereite jetzt eine kurze öffentliche Linie vor.";
  if (priority === "Kritisch") return "Lass das Büro eine belastbare Linie vorbereiten.";
  if (priority === "Wichtig") return "Prüfe das Thema und entscheide heute, ob du öffentlich wirst.";
  return "Beobachten und nur bei neuer Dynamik reagieren.";
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
