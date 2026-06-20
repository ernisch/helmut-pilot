export type SourceType =
  | "party"
  | "person"
  | "committee"
  | "bundestag"
  | "ministry"
  | "local"
  | "association"
  | "social"
  | "media";

export type PoliticalLevel = "local" | "state" | "federal" | "party" | "committee";

export type RelevanceDecision = "Sofort reagieren" | "Beobachten" | "Ignorieren";

export type BriefingClassification = "risk" | "opportunity" | "watch" | "ignore";

export type Confidence = "high" | "medium" | "low";

export type PoliticalRelevanceLevel = "Kritisch" | "Hoch" | "Mittel" | "Niedrig" | "Ignorieren";

export type ActionType =
  | "Stellungnahme"
  | "Presse"
  | "Social Media"
  | "Ausschussarbeit"
  | "Wahlkreisarbeit"
  | "Delegieren"
  | "Keine Aktion";

export type UserInteractionType = "ignored" | "delegated" | "done" | "communication_copied";

export type TaskPriority = "high" | "medium" | "low";

export type TaskStatus = "open" | "in_progress" | "done";

export type OfficeRole = "MdB" | "Büroleitung" | "Pressesprecher" | "Wissenschaftlicher Mitarbeiter" | "Referent";

export type MandateFunction =
  | "Bundestagsabgeordneter"
  | "Landtagsabgeordneter"
  | "Fraktionsmitglied"
  | "Ausschusssprecher"
  | "Ministerium"
  | "Referent";

export type CommunicationStyle =
  | "Sachlich"
  | "Lösungsorientiert"
  | "Angriffslustig"
  | "Vermittelnd"
  | "Aktivistisch";

export interface PoliticianProfile {
  id: string;
  fullName: string;
  party: string;
  faction: string;
  function?: MandateFunction | string;
  constituency: string;
  state: string;
  location?: string;
  committee?: string;
  committees: string[];
  committeeUnknown?: boolean;
  focusTopics: string[];
  topicPriorities?: Record<string, number>;
  mainQuestion?: string;
  monitoringTargets?: string[];
  outputNeeds?: string[];
  regionalInterests: string[];
  relevantMinistries: string[];
  opponents: string[];
  localMedia: string[];
  communicationStyle: CommunicationStyle | string;
  voicePreference?: "male" | "female" | string;
  noGoTopics: string[];
}

export interface Source {
  id: string;
  name: string;
  type: SourceType;
  url: string;
  priority: number;
  active: boolean;
}

export interface RawItem {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceType: SourceType;
  sourceUrl: string;
  title: string;
  url: string;
  content: string;
  publishedAt: string;
  retrievedAt: string;
  author: string;
  excerpt: string;
  confidence: Confidence;
  hash: string;
  category?: string;
}

export interface PoliticalSignal {
  id: string;
  rawItemId: string;
  topic: string;
  summary: string;
  entities: string[];
  politicalLevel: PoliticalLevel;
  sourceType: SourceType;
  evidenceIds: string[];
  primarySource: string;
  sourceCount: number;
  confidence: Confidence;
  isConfirmed: boolean;
}

export interface RelevanceScore {
  id: string;
  signalId: string;
  politicianId: string;
  politicalScore: number;
  mandateScore: number;
  finalScore: number;
  urgencyScore: number;
  riskScore: number;
  opportunityScore: number;
  mediaScore: number;
  totalScore: number;
  decision: RelevanceDecision;
  reason: string;
}

export interface Briefing {
  id: string;
  politicianId: string;
  date: string;
  executiveSummary: string;
  decisionMetrics: BriefingDecisionMetrics;
  themeOfDay: BriefingFocus;
  chanceOfDay: BriefingOpportunity;
  riskOfDay: BriefingRisk;
  taskMetrics: TaskMetrics;
  items: BriefingItem[];
  tasks: Task[];
  evidence: Evidence[];
  topics: IntelligenceTopic[];
  userInteractions: UserInteraction[];
  profile: PoliticianProfile;
  scores: RelevanceScore[];
  signals: PoliticalSignal[];
}

export interface BriefingDecisionMetrics {
  reactCount: number;
  watchCount: number;
  ignoreCount: number;
  chanceCount: number;
  riskCount: number;
  estimatedMinutes: number;
}

export interface BriefingFocus {
  title: string;
  whyToday: string;
  recommendedAction: string;
  estimatedTime: string;
  politicalBenefit: "Niedrig" | "Mittel" | "Hoch";
  signalId: string;
}

export interface BriefingOpportunity {
  topic: string;
  whyChance: string;
  politicalGain: string;
  targetGroup: string;
  recommendedMessage: string;
  recommendedChannel: string;
  signalId: string;
}

export interface BriefingRisk {
  topic: string;
  riskLevel: "Niedrig" | "Mittel" | "Hoch";
  whyDangerous: string;
  inactionConsequence: string;
  recommendedPreparation: string;
  signalId: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: string;
  assignee: OfficeRole | string;
  status: TaskStatus;
  sourceSignalId: string;
  politicalBenefit: string;
  riskIfIgnored: string;
  sources: Evidence[];
  primarySource: Evidence;
  confidence: Confidence;
  sourceNote: string;
  createdAt: string;
}

export interface TaskMetrics {
  openCount: number;
  criticalCount: number;
  dueByNoonCount: number;
}

export interface Evidence {
  id: string;
  sourceName: string;
  sourceType: SourceType;
  sourceUrl: string;
  publishedAt: string;
  retrievedAt: string;
  author: string;
  excerpt: string;
  confidence: Confidence;
  relevanceReason: string;
}

export interface IntelligenceTopic {
  id: string;
  title: string;
  summary: string;
  rawItemIds: string[];
  evidenceIds: string[];
  sourceCount: number;
  primarySource: string;
  confidence: Confidence;
  isConfirmed: boolean;
}

export interface PoliticalRelevanceBreakdown {
  mandateScore: number;
  committeeScore: number;
  partyScore: number;
  personScore: number;
  governmentScore: number;
  constituencyScore: number;
  timePressureScore: number;
  mediaAttentionScore: number;
  conflictScore: number;
  actionNeedScore: number;
  sourceWeight: number;
  totalScore: number;
  level: PoliticalRelevanceLevel;
}

export interface UserInteraction {
  id: string;
  politicianId: string;
  targetType: "topic" | "briefingItem" | "task" | "communication";
  targetId: string;
  interactionType: UserInteractionType;
  createdAt: string;
}

export interface BriefingItem {
  id: string;
  briefingId: string;
  signalId: string;
  priority: number;
  classification: BriefingClassification;
  whyItMatters: string;
  whyNow: string;
  recommendedAction: string;
  suggestedStatement: string;
  riskNote: string;
  opportunityNote: string;
  inactionConsequence: string;
  estimatedTimeMinutes: number;
  politicalBenefit: "Niedrig" | "Mittel" | "Hoch";
  targetGroup: string;
  recommendedChannel: string;
  riskLevel: "Niedrig" | "Mittel" | "Hoch";
  recommendedPreparation: string;
  title: string;
  summary: string;
  topic: string;
  decision: RelevanceDecision;
  sources: Evidence[];
  primarySource: Evidence;
  confidence: Confidence;
  sourceNote: string;
  sourceCount: number;
  relevanceLevel: PoliticalRelevanceLevel;
  relevanceBreakdown: PoliticalRelevanceBreakdown;
  actionType: ActionType;
  politicalScore: number;
  mandateScore: number;
  finalScore: number;
  totalScore: number;
  taskTemplate: Task;
}
