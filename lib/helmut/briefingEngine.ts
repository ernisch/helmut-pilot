import type {
  ActionType,
  Briefing,
  BriefingDecisionMetrics,
  BriefingFocus,
  BriefingClassification,
  BriefingItem,
  BriefingOpportunity,
  BriefingRisk,
  Confidence,
  Evidence,
  IntelligenceTopic,
  PoliticalRelevanceBreakdown,
  PoliticalRelevanceLevel,
  Task,
  TaskMetrics,
  UserInteraction,
  PoliticalLevel,
  PoliticalSignal,
  PoliticianProfile,
  RawItem,
  RelevanceScore,
  Source,
  SourceType
} from "./types";

export function generateBriefing(profile: PoliticianProfile, rawItems: RawItem[], sources: Source[] = []): Briefing {
  const topics = clusterRawItems(rawItems, profile);
  const topicBySignalId = new Map<string, IntelligenceTopic>();
  const signals = topics.map((topic) => {
    const signal = topicToSignal(topic, rawItems, sources);
    topicBySignalId.set(signal.id, topic);
    return signal;
  });
  const relevanceBySignalId = new Map(signals.map((signal) => [signal.id, scorePoliticalTopic(topicBySignalId.get(signal.id)!, rawItems, profile)]));
  const scores = signals.map((signal) => relevanceToScore(signal, profile, relevanceBySignalId.get(signal.id)!));
  const briefingId = `briefing-${profile.id}-${new Date().toISOString().slice(0, 10)}`;
  const items = signals
    .map((signal) =>
      toBriefingItem(
        briefingId,
        signal,
        scores.find((score) => score.signalId === signal.id)!,
        relevanceBySignalId.get(signal.id)!,
        topicBySignalId.get(signal.id)!,
        rawItems,
        sources,
        profile
      )
    )
    .sort((a, b) => b.priority - a.priority);
  const curatedItems = curateBriefingItems(items);
  const decisionMetrics = buildDecisionMetrics(curatedItems);
  const themeOfDay = selectThemeOfDay(curatedItems);
  const chanceOfDay = selectChanceOfDay(curatedItems);
  const riskOfDay = selectRiskOfDay(curatedItems);
  const tasks = buildDemoTasks(curatedItems);
  const taskMetrics = buildTaskMetrics(tasks);
  const evidence = rawItems.map((item) => buildEvidence(item, profile));
  const userInteractions: UserInteraction[] = [];

  return {
    id: briefingId,
    politicianId: profile.id,
    date: new Date().toISOString().slice(0, 10),
    executiveSummary: buildExecutiveSummary(curatedItems, themeOfDay),
    decisionMetrics,
    themeOfDay,
    chanceOfDay,
    riskOfDay,
    taskMetrics,
    items: curatedItems,
    tasks,
    evidence,
    topics,
    userInteractions,
    profile,
    scores,
    signals
  };
}

function rawItemToSignal(item: RawItem, sources: Source[]): PoliticalSignal {
  const source = sources.find((entry) => entry.id === item.sourceId);
  const sourceType = item.sourceType ?? source?.type ?? inferSourceType(item);
  const topic = inferTopic(item);

  return {
    id: `signal-${item.id}`,
    rawItemId: item.id,
    topic,
    summary: item.content,
    entities: inferEntities(item),
    politicalLevel: inferPoliticalLevel(item, sourceType),
    sourceType,
    evidenceIds: [`evidence-${item.id}`],
    primarySource: item.sourceName,
    sourceCount: 1,
    confidence: item.confidence,
    isConfirmed: item.confidence === "high"
  };
}

function clusterRawItems(rawItems: RawItem[], profile: PoliticianProfile): IntelligenceTopic[] {
  const groups = new Map<string, RawItem[]>();
  rawItems.forEach((item) => {
    const key = topicClusterKey(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  });

  return Array.from(groups.entries()).map(([key, items]) => {
    const sorted = [...items].sort((a, b) => sourceWeight(b.sourceType) - sourceWeight(a.sourceType));
    const primary = sorted[0];
    const evidence = sorted.map((item) => buildEvidence(item, profile));
    const highConfidenceCount = evidence.filter((entry) => entry.confidence === "high").length;
    const confidence = highConfidenceCount > 0 || evidence.length >= 3 ? "high" : evidence.some((entry) => entry.confidence === "medium") ? "medium" : "low";

    return {
      id: `topic-${key}`,
      title: topicTitle(primary),
      summary: sorted.map((item) => item.content).join(" "),
      rawItemIds: sorted.map((item) => item.id),
      evidenceIds: evidence.map((entry) => entry.id),
      sourceCount: evidence.length,
      primarySource: primary.sourceName,
      confidence,
      isConfirmed: confidence === "high" || evidence.length > 1
    };
  });
}

function topicClusterKey(item: RawItem): string {
  const text = `${item.title} ${item.content}`.toLowerCase();
  if (hasAnyTerm(text, ["pflege", "dienstplan", "dienstpläne"]) && !hasAnyTerm(text, ["tariftreuegesetz", "bundestariftreuegesetz"])) return "pflege-arbeitsbedingungen";
  if (hasAnyTerm(text, ["tariftreue", "tarifbindung", "gewerkschaft", "gewerkschaften", "dgb"])) return "bundestariftreuegesetz";
  if (hasAnyTerm(text, ["bürgergeld", "sanktion", "sanktionen", "leistungsverweigerung"])) return "buergergeld-sanktionen";
  if (hasAnyTerm(text, ["mindestlohn"])) return "mindestlohn";
  if (hasAnyTerm(text, ["rente", "renten", "rentenpaket", "rentenreform"])) return "rentenpaket";
  if (hasAnyTerm(text, ["arbeitsmarkt", "qualifizierung", "mitwirkungspflichten"])) return "arbeitsmarktintegration";
  if (hasAnyTerm(text, ["trikot", "sportverein"])) return "irrelevant-sport";
  return item.id;
}

function topicTitle(item: RawItem): string {
  const key = topicClusterKey(item);
  if (key === "bundestariftreuegesetz") return "Bundestariftreuegesetz";
  if (key === "buergergeld-sanktionen") return "Bürgergeld-Sanktionen";
  if (key === "mindestlohn") return "Mindestlohn";
  if (key === "pflege-arbeitsbedingungen") return "Arbeitsbedingungen in der Pflege";
  if (key === "rentenpaket") return "Rentenpaket der Bundesregierung";
  if (key === "arbeitsmarktintegration") return "Arbeitsmarktintegration";
  return item.title;
}

function topicToSignal(topic: IntelligenceTopic, rawItems: RawItem[], sources: Source[]): PoliticalSignal {
  const primaryRawItem = rawItems.find((item) => item.id === topic.rawItemIds[0])!;
  const source = sources.find((entry) => entry.id === primaryRawItem.sourceId);
  const sourceType = primaryRawItem.sourceType ?? source?.type ?? inferSourceType(primaryRawItem);

  return {
    id: `signal-${topic.id}`,
    rawItemId: primaryRawItem.id,
    topic: topic.title,
    summary: topic.summary,
    entities: Array.from(new Set(topic.rawItemIds.flatMap((id) => inferEntities(rawItems.find((item) => item.id === id)!)))),
    politicalLevel: inferPoliticalLevel(primaryRawItem, sourceType),
    sourceType,
    evidenceIds: topic.evidenceIds,
    primarySource: topic.primarySource,
    sourceCount: topic.sourceCount,
    confidence: topic.confidence,
    isConfirmed: topic.isConfirmed
  };
}

function scorePoliticalTopic(topic: IntelligenceTopic, rawItems: RawItem[], profile: PoliticianProfile): PoliticalRelevanceBreakdown {
  const items = topic.rawItemIds.map((id) => rawItems.find((item) => item.id === id)!).filter(Boolean);
  const text = `${topic.title} ${topic.summary}`.toLowerCase();
  const sourceWeightScore = Math.max(...items.map((item) => sourceWeight(item.sourceType)));
  const mandateScore = topicMatches(text, profile.focusTopics) ? 88 : hasAnyTerm(text, ["arbeit", "soziales", "bmas", "rente", "renten", "rentenpaket", "pflege", "lohn", "tarif", "bürgergeld"]) ? 78 : 18;
  const committeeScore = hasAnyTerm(text, ["arbeit und soziales", "bmas", "bürgergeld", "rente", "renten", "rentenpaket", "mindestlohn", "tarif", "tarifbindung", "pflege", "arbeitsmarkt", "sozialstaat"]) ? 92 : 20;
  const partyScore = hasAnyTerm(text, ["die linke", "linksfraktion"]) ? 85 : 20;
  const personScore = hasAnyTerm(text, ["cem ince", "deine mindestlohnforderung"]) || items.some((item) => item.sourceId === "source-person") ? 95 : 10;
  const governmentScore = hasAnyTerm(text, ["bundesregierung", "bmas", "bundesministerium", "gesetzentwurf", "eckpunkte", "reform", "initiative", "paket"]) ? 92 : 20;
  const constituencyScore = hasAnyTerm(text, ["lokal", "region", "pflegeheim", "wahlkreis"]) ? 70 : 20;
  const timePressureScore = hasAnyTerm(text, ["heute", "morgen", "legt", "kündigt", "tagesordnung", "debatte", "fragt", "erste kommentare"]) ? 86 : 35;
  const mediaAttentionScore = clamp(sourceWeightScore * 0.75 + Math.min(topic.sourceCount, 5) * 6);
  const conflictScore = hasAnyTerm(text, ["kritik", "angriff", "warnung", "warnt", "risiko", "vorwurf", "sanktion", "sanktionen", "schlupflöcher", "unklar", "offen"]) ? 84 : 32;
  const actionNeedScore = Math.max(timePressureScore, governmentScore, personScore, conflictScore);
  const sourceConfirmationBoost = topic.sourceCount > 1 ? Math.min(topic.sourceCount, 5) * 4 : 0;
  const governmentCommitteeBoost = governmentScore >= 80 && committeeScore >= 80 ? 5 : 0;
  const totalScore = clamp(
    mandateScore * 0.16 +
      committeeScore * 0.13 +
      partyScore * 0.07 +
      personScore * 0.11 +
      governmentScore * 0.13 +
      constituencyScore * 0.05 +
      timePressureScore * 0.13 +
      mediaAttentionScore * 0.08 +
      conflictScore * 0.07 +
      actionNeedScore * 0.07 +
      sourceConfirmationBoost +
      governmentCommitteeBoost
  );

  return {
    mandateScore,
    committeeScore,
    partyScore,
    personScore,
    governmentScore,
    constituencyScore,
    timePressureScore,
    mediaAttentionScore,
    conflictScore,
    actionNeedScore,
    sourceWeight: sourceWeightScore,
    totalScore,
    level: relevanceLevel(totalScore)
  };
}

function relevanceToScore(signal: PoliticalSignal, profile: PoliticianProfile, relevance: PoliticalRelevanceBreakdown): RelevanceScore {
  const decision: RelevanceDecision = relevance.level === "Kritisch" || relevance.level === "Hoch" ? "Sofort reagieren" : relevance.level === "Mittel" ? "Beobachten" : "Ignorieren";
  return {
    id: `score-${signal.id}`,
    signalId: signal.id,
    politicianId: profile.id,
    mandateScore: relevance.mandateScore,
    urgencyScore: relevance.timePressureScore,
    riskScore: relevance.conflictScore,
    opportunityScore: Math.max(relevance.governmentScore, relevance.mediaAttentionScore),
    mediaScore: relevance.mediaAttentionScore,
    totalScore: relevance.totalScore,
    decision,
    reason: `Relevanz ${relevance.level}: Mandat ${relevance.mandateScore}, Ausschuss ${relevance.committeeScore}, Regierung ${relevance.governmentScore}, Handlungsbedarf ${relevance.actionNeedScore}.`
  };
}

function relevanceLevel(totalScore: number): PoliticalRelevanceLevel {
  if (totalScore >= 88) return "Kritisch";
  if (totalScore >= 70) return "Hoch";
  if (totalScore >= 52) return "Mittel";
  if (totalScore >= 35) return "Niedrig";
  return "Ignorieren";
}

function topicMatches(text: string, terms: string[]): boolean {
  return hasAnyTerm(text, terms);
}

function hasAnyTerm(text: string, terms: string[]): boolean {
  return terms.some((term) => hasTerm(text, term));
}

function hasTerm(text: string, term: string): boolean {
  const normalizedTerm = String(term || "").toLowerCase().trim();
  if (!normalizedTerm) return false;
  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-zäöüß])${escaped}($|[^a-zäöüß])`, "i").test(text);
}

function sourceWeight(sourceType: SourceType): number {
  const weights: Record<SourceType, number> = {
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
  return weights[sourceType] ?? 50;
}

function toBriefingItem(
  briefingId: string,
  signal: PoliticalSignal,
  score: RelevanceScore,
  relevance: PoliticalRelevanceBreakdown,
  topic: IntelligenceTopic,
  rawItems: RawItem[],
  sources: Source[],
  profile: PoliticianProfile
): BriefingItem {
  const rawItem = rawItems.find((item) => item.id === signal.rawItemId)!;
  const classification = classify(score, signal);
  const context = buildContext(signal, rawItem, profile);
  const decisionDetails = buildDecisionDetails(signal, rawItem, score, profile);
  const evidence = topic.rawItemIds.map((id) => buildEvidence(rawItems.find((item) => item.id === id)!, profile));
  const primarySource = evidence[0];

  const item: BriefingItem = {
    id: `briefing-item-${topic.id}`,
    briefingId,
    signalId: signal.id,
    priority: score.totalScore,
    classification,
    whyItMatters: context.whyItMatters,
    whyNow: decisionDetails.whyNow,
    recommendedAction: context.recommendedAction,
    suggestedStatement: context.suggestedStatement,
    riskNote: context.riskNote,
    opportunityNote: context.opportunityNote,
    inactionConsequence: context.inactionConsequence,
    estimatedTimeMinutes: decisionDetails.estimatedTimeMinutes,
    politicalBenefit: decisionDetails.politicalBenefit,
    targetGroup: decisionDetails.targetGroup,
    recommendedChannel: decisionDetails.recommendedChannel,
    riskLevel: decisionDetails.riskLevel,
    recommendedPreparation: decisionDetails.recommendedPreparation,
    title: topic.title,
    summary: summarizeTopic(topic, evidence),
    topic: signal.topic,
    decision: score.decision,
    sources: evidence,
    primarySource,
    confidence: signal.confidence,
    sourceNote: buildSourceNote(signal.confidence, signal.sourceType, signal.isConfirmed),
    sourceCount: topic.sourceCount,
    relevanceLevel: relevance.level,
    relevanceBreakdown: relevance,
    actionType: inferActionType(signal, score, relevance, rawItem),
    totalScore: score.totalScore,
    taskTemplate: {} as Task
  };

  item.taskTemplate = buildTaskTemplate(item, score);
  return item;
}

function summarizeTopic(topic: IntelligenceTopic, evidence: Evidence[]): string {
  const sourceText = topic.sourceCount > 1 ? `${topic.sourceCount} Quellen berichten dazu.` : `${topic.primarySource} berichtet dazu.`;
  return `${sourceText} ${evidence[0]?.excerpt ?? topic.summary}`;
}

function inferActionType(signal: PoliticalSignal, score: RelevanceScore, relevance: PoliticalRelevanceBreakdown, rawItem: RawItem): ActionType {
  const text = `${signal.topic} ${signal.summary}`.toLowerCase();
  if (score.decision === "Ignorieren" || relevance.level === "Ignorieren") return "Keine Aktion";
  if (/angriff|vorwurf|frame|sanktion|kritik/.test(text)) return "Presse";
  if (/social|account|kommentare|mindestlohn/.test(text)) return "Social Media";
  if (/regierung|bmas|gesetz|eckpunkte|reform|initiative/.test(text)) return "Stellungnahme";
  if (/ausschuss|pflege|tagesordnung/.test(text)) return "Ausschussarbeit";
  if (/presse|tagesschau|redaktion|fragt/.test(text)) return "Presse";
  if (/lokal|region|pflegeheim/.test(text) || rawItem.sourceType === "local") return "Wahlkreisarbeit";
  if (relevance.actionNeedScore >= 85 && score.decision === "Sofort reagieren") return "Stellungnahme";
  return score.decision === "Beobachten" ? "Delegieren" : "Stellungnahme";
}

function buildTaskTemplate(item: Omit<BriefingItem, "taskTemplate">, score: RelevanceScore): Task {
  const priority = score.decision === "Sofort reagieren" ? "high" : score.decision === "Beobachten" ? "medium" : "low";
  const assignee = inferAssignee(item);
  const dueDate = buildDueDate(priority, item);

  return {
    id: `task-template-${item.signalId}`,
    title: buildTaskTitle(item),
    description: buildTaskDescription(item),
    priority,
    dueDate,
    assignee,
    status: "open",
    sourceSignalId: item.signalId,
    politicalBenefit: buildTaskBenefit(item),
    riskIfIgnored: item.inactionConsequence,
    sources: item.sources,
    primarySource: item.primarySource,
    confidence: item.confidence,
    sourceNote: item.sourceNote,
    createdAt: new Date().toISOString()
  };
}

function buildEvidence(item: RawItem, profile: PoliticianProfile): Evidence {
  return {
    id: `evidence-${item.id}`,
    sourceName: item.sourceName,
    sourceType: item.sourceType,
    sourceUrl: item.sourceUrl,
    url: item.url,
    itemUrl: item.url,
    originalUrl: item.originalUrl,
    linkType: item.linkType,
    linkResolutionNote: item.linkResolutionNote,
    publishedAt: item.publishedAt,
    retrievedAt: item.retrievedAt,
    author: item.author,
    excerpt: item.excerpt,
    confidence: item.confidence,
    relevanceReason: buildEvidenceRelevance(item, profile)
  };
}

function buildEvidenceRelevance(item: RawItem, profile: PoliticianProfile): string {
  const text = `${item.title} ${item.content}`.toLowerCase();
  if (item.sourceId === "source-person") return `Direktes Signal zu deiner Person und deiner Mindestlohnposition im Ausschuss ${profile.committee ?? profile.committees.join(", ")}.`;
  if (item.sourceType === "ministry") return `Direktes Vorhaben der Bundesregierung im Ausschussbereich ${profile.committee ?? profile.committees.join(", ")}.`;
  if (item.sourceType === "bundestag" || item.sourceType === "committee") return `Offizielle parlamentarische Quelle mit unmittelbarem Bezug zu deinem Ausschuss ${profile.committee ?? profile.committees.join(", ")}.`;
  if (item.sourceType === "party") return "Fraktions- oder Parteisignal, das deine politische Linie heute anschlussfähig machen kann.";
  if (item.sourceType === "association") return "Verbandsreaktion aus dem sozialpolitischen Umfeld, relevant für Gewerkschaften und Tarifbindung.";
  if (item.sourceType === "social") return "Frühes öffentliches Signal mit möglichem Reputationsrisiko; noch nicht journalistisch bestätigt.";
  if (text.includes("pflege")) return `Lokaler Bezug zu Arbeitsbedingungen und damit zu deinem Ausschuss ${profile.committee ?? profile.committees.join(", ")}.`;
  return "Quelle wurde aufgenommen, weil sie für die heutige politische Priorisierung geprüft werden sollte.";
}

function buildSourceNote(confidence: Confidence, sourceType: SourceType, isConfirmed: boolean): string {
  if (confidence === "high") return isConfirmed ? "Offizielle oder belastbare Quelle." : "Belastbare Quelle mit hoher Plausibilität.";
  if (confidence === "medium") return sourceType === "media" || sourceType === "local" ? "Etabliertes öffentliches Signal, politisch nutzbar." : "Bestätigtes öffentliches Signal mit mittlerer Sicherheit.";
  return "Frühes Signal, noch nicht journalistisch bestätigt.";
}

function buildDemoTasks(items: BriefingItem[]): Task[] {
  return items
    .filter((item) => item.decision !== "Ignorieren")
    .slice(0, 3)
    .map((item) => ({
      ...item.taskTemplate,
      id: `task-${item.signalId}`,
      status: "open",
      createdAt: new Date().toISOString()
    }));
}

function curateBriefingItems(items: BriefingItem[]): BriefingItem[] {
  const react = items
    .filter((item) => item.decision === "Sofort reagieren")
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5);
  const watch = items
    .filter((item) => item.decision === "Beobachten")
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5);
  const ignore = items
    .filter((item) => item.decision === "Ignorieren")
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3);

  return [...react, ...watch, ...ignore].sort((a, b) => b.priority - a.priority);
}

function buildTaskMetrics(tasks: Task[]): TaskMetrics {
  const today = new Date();
  const noon = new Date(today);
  noon.setHours(12, 0, 0, 0);

  return {
    openCount: tasks.filter((task) => task.status === "open").length,
    criticalCount: tasks.filter((task) => task.status !== "done" && task.priority === "high").length,
    dueByNoonCount: tasks.filter((task) => task.status !== "done" && new Date(task.dueDate) <= noon).length
  };
}

function buildTaskTitle(item: Pick<BriefingItem, "title" | "topic" | "recommendedAction">): string {
  const text = `${item.title} ${item.recommendedAction}`.toLowerCase();
  if (text.includes("tariftreue")) return "BMAS-Eckpunkte analysieren";
  if (text.includes("arbeitsmarkt")) return "Arbeitsmarktinitiative bewerten";
  if (text.includes("bürgergeld") || text.includes("sanktion")) return "Bürgergeld-Gegenlinie vorbereiten";
  if (text.includes("mindestlohn")) return "Mindestlohn-Positionierung freigeben";
  if (text.includes("pflege")) return "Ausschussfragen Pflege vorbereiten";
  if (text.includes("rente")) return "Rentenpaket fachlich prüfen";
  return `${item.topic} vorbereiten`;
}

function buildTaskDescription(item: Pick<BriefingItem, "topic" | "recommendedAction" | "recommendedPreparation" | "suggestedStatement">): string {
  return `${item.recommendedAction}

${item.recommendedPreparation}

Liefere eine kurze Einschätzung, eine rote Linie und diese nutzbare Formulierung: "${item.suggestedStatement}"`;
}

function buildTaskBenefit(item: Pick<BriefingItem, "politicalBenefit" | "opportunityNote">): string {
  if (item.politicalBenefit === "Hoch") return "Du kannst deine Position vor der öffentlichen Debatte setzen.";
  if (item.opportunityNote.includes("Profil")) return item.opportunityNote;
  return "Du hältst den Vorgang arbeitsfähig und kannst später gezielt reagieren.";
}

function inferAssignee(item: Pick<BriefingItem, "classification" | "decision" | "recommendedChannel">): string {
  if (item.recommendedChannel.toLowerCase().includes("presse") || item.recommendedChannel.toLowerCase().includes("social")) return "Pressesprecher";
  if (item.classification === "risk") return "Büroleitung";
  if (item.decision === "Beobachten") return "Referent";
  return "Wissenschaftlicher Mitarbeiter";
}

function buildDueDate(priority: Task["priority"], item: Pick<BriefingItem, "riskLevel" | "estimatedTimeMinutes">): string {
  const due = new Date();
  if (priority === "high" && item.riskLevel === "Hoch") due.setHours(10, 30, 0, 0);
  else if (priority === "high") due.setHours(11, 0, 0, 0);
  else if (priority === "medium") due.setHours(12, 0, 0, 0);
  else due.setHours(16, 0, 0, 0);
  return due.toISOString();
}

function buildDecisionDetails(signal: PoliticalSignal, rawItem: RawItem, score: RelevanceScore, profile: PoliticianProfile) {
  const text = `${rawItem.title} ${rawItem.content}`.toLowerCase();
  const isGovernmentPlan = /bundesregierung|bmas|bundesarbeitsministerium|gesetz|eckpunkte|initiative|paket|plant|kündigt/i.test(text);
  const isAttack = /angriff|persönlich|leistungsverweigerung|afd|vorwurf/i.test(text);
  const isCommittee = signal.sourceType === "committee" || text.includes("ausschuss arbeit und soziales");
  const isParty = signal.sourceType === "party";
  const isIgnore = score.decision === "Ignorieren";

  if (isIgnore) {
    return {
      whyNow: "Dieses Thema erzeugt heute keinen politischen Entscheidungsbedarf für deinen Ausschuss Arbeit und Soziales.",
      estimatedTimeMinutes: 0,
      politicalBenefit: "Niedrig" as const,
      targetGroup: "Keine relevante Zielgruppe",
      recommendedChannel: "Keine Reaktion",
      riskLevel: "Niedrig" as const,
      recommendedPreparation: "Nicht vorbereiten. Im Briefing bewusst ausblenden."
    };
  }

  if (isAttack) {
    return {
      whyNow: "Der Frame entsteht jetzt. In den nächsten Stunden entscheidet sich, ob du über Bürgergeld fachlich sprichst oder auf einen Vorwurf reagieren musst.",
      estimatedTimeMinutes: 15,
      politicalBenefit: "Hoch" as const,
      targetGroup: "Presse, Social Media, sozialpolitisch interessierte Öffentlichkeit",
      recommendedChannel: "Kurzstatement und Social Media",
      riskLevel: "Hoch" as const,
      recommendedPreparation: "Drei Kernargumente gegen den Sanktionsframe vorbereiten und den Vorwurf nicht wiederholen."
    };
  }

  if (isGovernmentPlan) {
    return {
      whyNow: "Die Bundesregierung setzt heute den ersten Frame. Die mediale Aufmerksamkeit ist in den nächsten 24 Stunden am höchsten.",
      estimatedTimeMinutes: score.totalScore >= 80 ? 15 : 10,
      politicalBenefit: "Hoch" as const,
      targetGroup: text.includes("tarif") ? "Arbeitnehmer, Gewerkschaften und Betriebsräte" : "Beschäftigte, Sozialverbände und Fachpresse",
      recommendedChannel: text.includes("tarif") ? "LinkedIn und Presse" : "Presse-Statement und Ausschussfragen",
      riskLevel: score.riskScore >= 75 ? "Hoch" as const : "Mittel" as const,
      recommendedPreparation: "Positionierung mit einem Zustimmungspunkt, einer roten Linie und einer Frage an die Bundesregierung vorbereiten."
    };
  }

  if (isCommittee) {
    return {
      whyNow: "Das Thema liegt heute auf deiner Ausschussagenda. Deine Fragen müssen vor der Sitzung sitzen, nicht danach.",
      estimatedTimeMinutes: 12,
      politicalBenefit: "Hoch" as const,
      targetGroup: "Ausschuss, Fachöffentlichkeit und Beschäftigte im betroffenen Bereich",
      recommendedChannel: "Ausschussfragen und anschließender Social-Media-Post",
      riskLevel: "Mittel" as const,
      recommendedPreparation: "Zwei fachliche Fragen und eine zitierfähige Kernlinie vorbereiten."
    };
  }

  if (isParty) {
    return {
      whyNow: "Deine Fraktion sucht heute eine klare Stimme aus Arbeit und Soziales. Wenn du früh lieferst, wird deine Linie anschlussfähig.",
      estimatedTimeMinutes: 10,
      politicalBenefit: "Mittel" as const,
      targetGroup: "Fraktion, Parteiumfeld und sozialpolitische Community",
      recommendedChannel: "Interne Linie und Social Media",
      riskLevel: "Mittel" as const,
      recommendedPreparation: "Eine eigene Formulierung vorbereiten, die nicht nur Parteiposition wiederholt."
    };
  }

  return {
    whyNow: `Das Thema berührt deinen Ausschuss ${profile.committee ?? profile.committees.join(", ")} heute indirekt und sollte für Anschlussfähigkeit beobachtet werden.`,
    estimatedTimeMinutes: 8,
    politicalBenefit: "Mittel" as const,
    targetGroup: "Fachöffentlichkeit und lokale Betroffene",
    recommendedChannel: "Beobachten, später gezielt aufgreifen",
    riskLevel: score.riskScore >= 75 ? "Hoch" as const : "Mittel" as const,
    recommendedPreparation: "Kurz notieren, welche Bundesregierungslinie daraus entstehen könnte."
  };
}

function buildContext(signal: PoliticalSignal, rawItem: RawItem, profile: PoliticianProfile) {
  const text = `${rawItem.title} ${rawItem.content}`.toLowerCase();
  const committeeLine = `Das betrifft dich direkt: Es gehört in deinen Ausschuss ${profile.committee ?? profile.committees.join(", ")}, weil dort Arbeit, soziale Sicherung, Tarifbindung, Rente und Pflege politisch entschieden werden.`;

  if (signal.sourceType === "person" || signal.entities.includes(profile.fullName)) {
    return {
      whyItMatters: "Das betrifft dich direkt: Deine Mindestlohnforderung wird aufgegriffen und liegt mitten in deinem Ausschuss Arbeit und Soziales. Du kannst daraus eine klare Frage an die Bundesregierung machen.",
      recommendedAction: "Lege kurz öffentlich nach: Miss die Bundesregierung am höheren Mindestlohn und gib eine Social-Media-Formulierung frei.",
      suggestedStatement:
        "Wer Vollzeit arbeitet, muss von seinem Lohn leben können. Die Bundesregierung muss beim Mindestlohn liefern, nicht weiter vertrösten.",
      riskNote: "Ohne deine Einordnung bleibt die Nachfrage bei einer Einzeläußerung und verliert den Ausschussbezug.",
      opportunityNote: "Du kannst dein Profil als Stimme für Arbeit, Lohn und soziale Sicherheit schärfen.",
      inactionConsequence: "Wenn du nicht reagierst, besetzen andere die Mindestlohnfrage, obwohl sie direkt in deinen fachpolitischen Raum fällt."
    };
  }

  if (text.includes("afd") || text.includes("persönlich") || text.includes("leistungsverweigerung")) {
    return {
      whyItMatters: "Das trifft deine Bürgergeldposition und damit ein Kernfeld deines Ausschusses Arbeit und Soziales. Der Angriff versucht, deine fachliche Linie in einen persönlichen Sanktionsframe zu ziehen.",
      recommendedAction: "Reagiere sofort, aber wiederhole den Vorwurf nicht. Veröffentliche eine klare Gegenformulierung zu Würde, Beratung und armutsfester sozialer Sicherung.",
      suggestedStatement:
        "Bürgergeldpolitik darf Menschen nicht unter Generalverdacht stellen. Wer Armut bekämpfen will, braucht Beratung, gute Arbeit und Respekt statt populistischer Schuldzuweisungen.",
      riskNote: "Eine falsche Antwort verstärkt den Angriff; Schweigen lässt den Sanktionsframe an deiner Position kleben.",
      opportunityNote: "Mit einer ruhigen Antwort zeigst du fachliche Autorität im Ausschuss und grenzt soziale Politik klar gegen Hetze ab.",
      inactionConsequence: "Wenn du nicht reagierst, kann der Frame spätere Pressefragen zur Bürgergelddebatte vorprägen."
    };
  }

  if (text.includes("bürgergeld") || text.includes("sanktion")) {
    return {
      whyItMatters: "Das betrifft dich, weil Bürgergeld direkt in deinen Ausschuss Arbeit und Soziales gehört. Die Bundesregierung plant Änderungen, auf die du politisch reagieren solltest.",
      recommendedAction: "Bereite eine Gegenlinie vor: Steig nicht in Sanktionssprache ein, sondern stell Beratung, gute Arbeit und Armutsvermeidung in den Mittelpunkt.",
      suggestedStatement:
        "Wer Bürgergeld nur als Misstrauensdebatte führt, macht Menschen kleiner, aber löst keine Armut.",
      riskNote: "Die Debatte kann dich in eine Verteidigungsecke ziehen, wenn du nur auf Vorwürfe antwortest.",
      opportunityNote: "Du kannst die Kernfrage stellen: Welche Pläne der Bundesregierung helfen Menschen wirklich in gute Arbeit?",
      inactionConsequence: "Wenn du nicht reagierst, dominiert die Sanktionssprache den Tag."
    };
  }

  if ((text.includes("ausschuss") || text.includes("pflege")) && !text.includes("tariftreuegesetz") && !text.includes("bundestariftreuegesetz")) {
    return {
      whyItMatters: committeeLine,
      recommendedAction: "Bereite für die Ausschusssitzung zwei Fragen vor: Was plant die Bundesregierung konkret, und wie werden Arbeitsbedingungen statt nur Abläufe verbessert?",
      suggestedStatement:
        "Gute Pflege braucht gute Arbeit: verlässliche Dienstpläne, genug Personal und Tarifbindung. Genau daran muss sich die Bundesregierung messen lassen.",
      riskNote: "Ohne Vorbereitung bleibst du im Ausschuss reaktiv und bekommst keine eigene Prüfspur gegenüber der Bundesregierung.",
      opportunityNote: "Das Thema verbindet Ausschussarbeit mit konkreter Lebensrealität von Beschäftigten.",
      inactionConsequence: "Wenn du nicht reagierst, läuft die Ausschusssitzung ohne deine sichtbare sozialpolitische Linie."
    };
  }

  if (text.includes("tariftreue") || text.includes("tarifbindung") || text.includes("gewerkschaft")) {
    return {
      whyItMatters: "Das betrifft dich direkt: Tariftreue ist ein zentrales Thema in deinem Ausschuss Arbeit und Soziales. Du kannst die Bundesregierung heute an Kontrollen, Sanktionen und echter Tarifbindung messen.",
      recommendedAction: "Bereite bis 11:00 Uhr eine zustimmend-kritische Linie vor: Unterstützung für Tariftreue, aber klare Bedingungen bei Kontrolle, Sanktionen und Schlupflöchern.",
      suggestedStatement:
        "Tariftreue darf kein schönes Wort bleiben. Wer öffentliche Aufträge bekommt, muss gute Arbeit und Tarifbindung garantieren.",
      riskNote: "Wenn du nur zustimmst, übernimmt die Bundesregierung den Erfolg ohne Druck auf Schlupflöcher.",
      opportunityNote: "Mit Gewerkschaften im Rücken kannst du eine konstruktive, aber klare linke Arbeitsmarktposition setzen.",
      inactionConsequence: "Wenn du nicht reagierst, prägt die Bundesregierung das Thema allein und deine Ausschusslinie bleibt unsichtbar."
    };
  }

  if (text.includes("rente")) {
    return {
      whyItMatters: "Das betrifft dich, weil Rente ein Kernfeld deines Ausschusses Arbeit und Soziales ist. Das Rentenpaket der Bundesregierung trifft genau deine Frage nach politischen Vorhaben der Regierung.",
      recommendedAction: "Prüfe das Paket auf niedrige Einkommen und bereite eine Presselinie vor, die Finanzierung und Armutsfestigkeit abfragt.",
      suggestedStatement:
        "Eine Rentenreform muss zuerst Menschen mit niedrigen Einkommen Sicherheit geben. Alles andere ist sozialpolitisch zu wenig.",
      riskNote: "Ohne schnelle Einordnung wirkst du bei einem zentralen Ausschussthema nicht sprechfähig.",
      opportunityNote: "Du kannst die Bundesregierung an sozialer Sicherheit im Alter messen.",
      inactionConsequence: "Wenn du nicht reagierst, bleibt die Rentendebatte ohne deine linke, ausschussbezogene Zuspitzung."
    };
  }

  if (text.includes("arbeitsmarkt") || text.includes("qualifizierung") || text.includes("mitwirkungspflichten")) {
    return {
      whyItMatters: "Das betrifft dich, weil die Arbeitsmarktinitiative ein Bundesregierungsvorhaben im Kernbereich Arbeit und Soziales ist. Darin stecken Chancen durch Qualifizierung, aber auch Risiken durch strengere Pflichten.",
      recommendedAction: "Lehne nicht pauschal ab. Benenne Chancen bei Qualifizierung und formuliere zugleich rote Linien gegen Druck und Sanktionen.",
      suggestedStatement:
        "Qualifizierung ist richtig, Druck ersetzt aber keine gute Arbeit. Die Bundesregierung muss fördern statt Menschen nur schneller in schlechte Jobs zu schieben.",
      riskNote: "Wenn du nur gegen Pflichten argumentierst, wird die Chance auf Qualifizierung übersehen.",
      opportunityNote: "Du kannst zeigen, dass linke Arbeitsmarktpolitik konkrete Weiterbildung und gute Arbeit verbindet.",
      inactionConsequence: "Wenn du nicht reagierst, definiert die Bundesregierung allein, was Arbeitsmarktintegration bedeutet."
    };
  }

  return {
    whyItMatters: "Das betrifft dich heute nicht ausreichend: Es gibt keinen belastbaren Bezug zu deinem Ausschuss, deiner Partei, deiner Person oder einer anstehenden politischen Entscheidung.",
    recommendedAction: "Ignoriere das Thema und zieh es nicht in deine politische Morgenarbeit.",
    suggestedStatement: "Keine öffentliche Kommunikation empfohlen.",
    riskNote: "Keine relevante politische Gefahr erkennbar.",
    opportunityNote: "Keine politische Chance erkennbar.",
    inactionConsequence: "Wenn du nicht reagierst, entsteht kein Schaden; deine Zeit bleibt für relevante Vorgänge frei."
  };
}

function buildDecisionMetrics(items: BriefingItem[]): BriefingDecisionMetrics {
  return {
    reactCount: items.filter((item) => item.decision === "Sofort reagieren").length,
    watchCount: items.filter((item) => item.decision === "Beobachten").length,
    ignoreCount: items.filter((item) => item.decision === "Ignorieren").length,
    chanceCount: items.filter((item) => item.classification === "opportunity").length,
    riskCount: items.filter((item) => item.classification === "risk").length,
    estimatedMinutes: items
      .filter((item) => item.decision !== "Ignorieren")
      .reduce((sum, item) => sum + item.estimatedTimeMinutes, 0)
  };
}

function selectThemeOfDay(items: BriefingItem[]): BriefingFocus {
  const theme = items
    .filter((item) => item.decision !== "Ignorieren")
    .sort((a, b) => themeRank(b) - themeRank(a))[0] ?? items[0];

  return {
    title: theme.title,
    whyToday: theme.whyNow,
    recommendedAction: theme.recommendedAction,
    estimatedTime: `${theme.estimatedTimeMinutes} Minuten`,
    politicalBenefit: theme.politicalBenefit,
    signalId: theme.signalId
  };
}

function themeRank(item: BriefingItem): number {
  const text = `${item.title} ${item.summary} ${item.recommendedAction}`.toLowerCase();
  const governmentBoost = /bmas|bundesregierung|bundesministerium|gesetzentwurf|eckpunkte|rentenpaket/.test(text) ? 10 : 0;
  const committeeBoost = /arbeit und soziales|tariftreue|mindestlohn|rente|bürgergeld/.test(text) ? 5 : 0;
  const sourceBoost = item.primarySource?.sourceType === "ministry" || item.primarySource?.sourceType === "bundestag" ? 6 : 0;
  return item.priority + item.estimatedTimeMinutes * 0.2 + governmentBoost + committeeBoost + sourceBoost;
}

function selectChanceOfDay(items: BriefingItem[]): BriefingOpportunity {
  const chance = items
    .filter((item) => item.decision !== "Ignorieren")
    .sort((a, b) => {
      const aBoost = a.classification === "opportunity" ? 25 : 0;
      const bBoost = b.classification === "opportunity" ? 25 : 0;
      return b.priority + bBoost - (a.priority + aBoost);
    })[0] ?? items[0];

  return {
    topic: chance.topic,
    whyChance: chance.opportunityNote,
    politicalGain: chance.politicalBenefit === "Hoch" ? "Du kannst Kompetenz zeigen und die Debatte früh mit deiner Linie prägen." : "Du baust Anschlussfähigkeit auf, ohne zu viel Zeit zu binden.",
    targetGroup: chance.targetGroup,
    recommendedMessage: chance.suggestedStatement,
    recommendedChannel: chance.recommendedChannel,
    signalId: chance.signalId
  };
}

function selectRiskOfDay(items: BriefingItem[]): BriefingRisk {
  const risk = items
    .filter((item) => item.decision !== "Ignorieren")
    .sort((a, b) => {
      const riskWeight = { Niedrig: 0, Mittel: 12, Hoch: 25 };
      const aFrameRisk = /rahmt|angriff|vorwurf|sanktionsframe|verteidiger/i.test(`${a.title} ${a.riskNote}`) ? 35 : 0;
      const bFrameRisk = /rahmt|angriff|vorwurf|sanktionsframe|verteidiger/i.test(`${b.title} ${b.riskNote}`) ? 35 : 0;
      return b.priority + riskWeight[b.riskLevel] + bFrameRisk - (a.priority + riskWeight[a.riskLevel] + aFrameRisk);
    })[0] ?? items[0];

  return {
    topic: risk.topic,
    riskLevel: risk.riskLevel,
    whyDangerous: risk.riskNote,
    inactionConsequence: risk.inactionConsequence,
    recommendedPreparation: risk.recommendedPreparation,
    signalId: risk.signalId
  };
}

function buildExecutiveSummary(items: BriefingItem[], themeOfDay: BriefingFocus): string {
  const react = items.filter((item) => item.decision === "Sofort reagieren");
  const watch = items.filter((item) => item.decision === "Beobachten");
  const ignore = items.filter((item) => item.decision === "Ignorieren");

  return `${currentBerlinGreeting()} Heute solltest du auf ${react.length} Themen reagieren, ${watch.length} beobachten und ${ignore.length} ignorieren. Dein wichtigstes Thema ist: ${themeOfDay.title}. ${themeOfDay.recommendedAction}`;
}

function currentBerlinGreeting(): string {
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

function classify(score: RelevanceScore, signal: PoliticalSignal): BriefingClassification {
  if (score.decision === "Ignorieren") return "ignore";
  if (score.riskScore >= 75) return "risk";
  if (score.opportunityScore >= score.riskScore) return "opportunity";
  return "watch";
}

function inferTopic(item: RawItem): string {
  const text = `${item.title} ${item.content}`.toLowerCase();
  if (text.includes("kein politischer handlungsbedarf") || text.includes("trikotdesign")) return "Nicht mandatsrelevant";
  if (text.includes("tariftreue") || text.includes("tarifbindung") || text.includes("gewerkschaft")) return "Tarifbindung und gute Arbeit";
  if (text.includes("bürgergeld") || text.includes("sozial")) return "Soziale Sicherung";
  if (text.includes("mindestlohn")) return "Mindestlohn";
  if (text.includes("rente")) return "Rente";
  if (text.includes("arbeitsmarkt") || text.includes("qualifizierung")) return "Arbeitsmarkt";
  if (text.includes("ausschuss")) return "Ausschuss Arbeit und Soziales";
  if (text.includes("pflege")) return "Arbeit und Pflege";
  if (text.includes("afd") || text.includes("angriff")) return "Politisches Risiko";
  return "Nicht mandatsrelevant";
}

function inferEntities(item: RawItem): string[] {
  const entities = new Set<string>();
  const text = `${item.title} ${item.content}`;
  [
    "Cem Ince",
    "Die Linke",
    "Bundestag",
    "Bundesregierung",
    "BMAS",
    "Bundesarbeitsministerium",
    "Ausschuss Arbeit und Soziales",
    "Gewerkschaften",
    "AfD"
  ].forEach((entity) => {
    if (text.includes(entity)) entities.add(entity);
  });
  if (/\bInce\b/.test(text) || item.sourceId === "source-person" || /deine mindestlohnforderung/i.test(text)) entities.add("Cem Ince");
  return Array.from(entities);
}

function inferPoliticalLevel(item: RawItem, sourceType: SourceType): PoliticalLevel {
  if (sourceType === "local") return "local";
  if (sourceType === "party") return "party";
  if (sourceType === "committee") return "committee";
  if (sourceType === "bundestag" || sourceType === "ministry") return "federal";
  if (/lokal|kommun|region/i.test(`${item.title} ${item.content}`)) return "local";
  return "federal";
}

function inferSourceType(item: RawItem): SourceType {
  if (item.sourceId.includes("party")) return "party";
  if (item.sourceId.includes("local")) return "local";
  if (item.sourceId.includes("social")) return "social";
  return "media";
}
