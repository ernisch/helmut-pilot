import type { PoliticalSignal, PoliticianProfile, RelevanceDecision, RelevanceScore, Source } from "./types";

export const scoreWeights = {
  politicalScore: 0.6,
  mandateScore: 0.4,
  urgencyScore: 0.25,
  riskScore: 0.2,
  opportunityScore: 0.15,
  mediaScore: 0.05
} as const;

export function calculateTotalScore(score: Omit<RelevanceScore, "id" | "signalId" | "politicianId" | "totalScore" | "decision" | "reason">): number {
  return Math.round(
    score.politicalScore * scoreWeights.politicalScore +
      score.mandateScore * scoreWeights.mandateScore
  );
}

export function decideRelevance(totalScore: number): RelevanceDecision {
  if (totalScore >= 75) return "Sofort reagieren";
  if (totalScore >= 45) return "Beobachten";
  return "Ignorieren";
}

export function scoreSignal(signal: PoliticalSignal, profile: PoliticianProfile, sources: Source[]): RelevanceScore {
  const source = sources.find((entry) => entry.type === signal.sourceType);
  const text = `${signal.topic} ${signal.summary} ${signal.entities.join(" ")}`.toLowerCase();
  const profileTerms = [
    profile.fullName,
    profile.party,
    profile.committee ?? "",
    profile.mainQuestion ?? "",
    ...profile.focusTopics,
    ...(profile.monitoringTargets ?? []),
    ...(profile.outputNeeds ?? []),
    ...profile.regionalInterests,
    ...profile.relevantMinistries
  ]
    .filter(Boolean)
    .map((term) => term.toLowerCase());

  const hasProfileHit = profileTerms.some((term) => text.includes(term));
  const mentionsPerson = text.includes(profile.fullName.toLowerCase()) || signal.sourceType === "person";
  const mentionsParty = text.includes(profile.party.toLowerCase()) || signal.sourceType === "party";
  const committeeFocusHit = /arbeit und soziales|bmas|bundesarbeitsministerium|bürgergeld|mindestlohn|tarifbindung|rente|pflege|arbeitsmarkt|sozialstaat|armut|gewerkschaft/i.test(text);
  const governmentPlanHit = /bundesregierung|gesetz|gesetzesvorhaben|vorhaben|initiative|ankündigt|eckpunkte|paket|pläne|plant/i.test(text);
  const localHit = signal.politicalLevel === "local" || signal.sourceType === "local";
  const committeeHit = signal.sourceType === "committee" || text.includes((profile.committee ?? "").toLowerCase());
  const riskHit = /kritik|angriff|warn|risiko|stigmatisierung|afd|unklar|offen|schlupflöcher|strengere|sanktion|vorwurf|fehlende/i.test(text);
  const opportunityHit = /chance|unterstütz|begrüß|fordert|initiative|arbeitsbedingungen|eckpunkte|tariftreue|mindestlohn|verbündete|qualifizierung/i.test(text);
  const urgentHit = /heute|fragt|erwartet|debatte|ausschusssitzung|tagesordnung|erste .*kommentare|greift|persönlich|reichweitenstark|ankündigt|legt .*vor|plant/i.test(text);

  const mandateScore = calculateMandateScore(text, signal, profile);
  const politicalScore = clamp(
    (mentionsPerson ? 95 : 0) ||
      (signal.sourceType === "ministry" && governmentPlanHit && committeeFocusHit ? 92 : 0) ||
      (committeeHit && urgentHit ? 88 : 0) ||
      (mentionsParty ? 82 : 0) ||
      (committeeFocusHit && governmentPlanHit ? 78 : 0) ||
      (committeeHit ? 76 : 0) ||
      (hasProfileHit ? 76 : 0) ||
      (committeeFocusHit ? 70 : 0) ||
      (localHit && committeeFocusHit ? 68 : 18)
  );

  const urgencyScore = clamp(
    (mentionsPerson && urgentHit ? 88 : 0) ||
      (signal.sourceType === "social" && riskHit ? 88 : 0) ||
      (signal.sourceType === "ministry" && governmentPlanHit && committeeFocusHit ? 86 : 0) ||
      (committeeHit && urgentHit ? 76 : 0) ||
      (urgentHit ? 68 : 0) ||
      (governmentPlanHit && committeeFocusHit ? 62 : 0) ||
      (signal.sourceType === "ministry" ? 55 : 28)
  );

  const riskScore = clamp(
    riskHit ? (mentionsPerson ? 92 : 78) : committeeHit ? 54 : mentionsParty ? 44 : 22
  );

  const opportunityScore = clamp(
    opportunityHit ? (localHit || mentionsPerson ? 84 : 70) : mentionsParty || committeeHit ? 48 : 20
  );

  const mediaScore = clamp(source ? source.priority : signal.sourceType === "social" ? 55 : 40);
  const totalScore = calculateTotalScore({ politicalScore, mandateScore, finalScore: 0, urgencyScore, riskScore, opportunityScore, mediaScore });
  const decision = decideRelevance(totalScore);

  return {
    id: `score-${signal.id}`,
    signalId: signal.id,
    politicianId: profile.id,
    politicalScore,
    mandateScore,
    finalScore: totalScore,
    urgencyScore,
    riskScore,
    opportunityScore,
    mediaScore,
    totalScore,
    decision,
    reason: buildReason(decision, mandateScore, urgencyScore, riskScore, opportunityScore)
  };
}

function calculateMandateScore(text: string, signal: PoliticalSignal, profile: PoliticianProfile): number {
  let score = 15;
  const committees = [profile.committee, ...(profile.committees ?? [])].filter(Boolean);
  if (text.includes(profile.fullName.toLowerCase()) || signal.sourceType === "person") score += 35;
  if (committees.some((committee) => text.includes(String(committee).toLowerCase())) || signal.sourceType === "committee") score += 30;
  if (text.includes(profile.party.toLowerCase()) || text.includes(profile.faction.toLowerCase()) || signal.sourceType === "party") score += 14;
  Object.entries(profile.topicPriorities ?? {}).forEach(([topic, priority]) => {
    if (text.includes(topic.toLowerCase())) score += 8 + Math.max(1, Math.min(5, Number(priority))) * 5;
  });
  if (signal.politicalLevel === "local" || signal.sourceType === "local") score += 12;
  return clamp(score);
}

function buildReason(
  decision: RelevanceDecision,
  mandateScore: number,
  urgencyScore: number,
  riskScore: number,
  opportunityScore: number
): string {
  if (decision === "Sofort reagieren") {
    return `Das liegt nah an deinem Mandat (${mandateScore}) und erzeugt akuten Handlungsdruck (${urgencyScore}); Risiko ${riskScore}, Chance ${opportunityScore}.`;
  }
  if (decision === "Beobachten") {
    return `Relevant genug für die Lage, aber noch nicht zwingend für sofortige öffentliche Reaktion; Risiko ${riskScore}, Chance ${opportunityScore}.`;
  }
  return `Heute kein ausreichender Bezug zu deinem Mandat oder deiner Zeitlage. Deine Aufmerksamkeit ist bei Vorgängen mit konkretem Handlungsbedarf besser eingesetzt.`;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
