"use strict";

// Synthetic shapes from briefingContract.toItem/toRecommendation and app/start.
// All identities deliberately differ; no backend imports or real profile data.
function payloadFor(scenario = "valid") {
  const now = new Date().toISOString();
  const source = { name: "Synthetische UI Quelle", sourceName: "Synthetische UI Quelle",
    url: "https://example.test/ui/beleg", linkType: "direct", publishedAt: now };
  const records = [
    { key: "a", score: 40, decision: "Beobachten" },
    { key: "b", score: 75, decision: "Sofort reagieren" },
    { key: "ignored", score: 10, decision: "Ignorieren" }
  ].map(({ key, score, decision }) => ({
    id: `rec-${key}`, knowledge_object_id: `ko-${key}`, vorgang_id: `vorgang-${key}`,
    title: `Synthetischer Vorgang ${key.toUpperCase()}`, summary: "Synthetischer Sachstand.",
    relevance_score: score, decision, priorityType: decision === "Ignorieren" ? "ignore" : decision === "Sofort reagieren" ? "action" : "watch",
    current_priority: decision, recommended_action: "Den synthetischen Vorgang prüfen.",
    personal_relevance_explanation: "Synthetischer Profilbezug.", action_type: "observe",
    status: "new", primarySource: source, source_count: 1, sources: [source]
  }));
  let recommendations = records;
  if (scenario !== "valid" && scenario !== "missing-primary") recommendations = [records[0]];
  const a = records[0];
  if (scenario === "missing-vorgang") delete a.vorgang_id;
  if (scenario === "missing-knowledge") delete a.knowledge_object_id;
  if (scenario === "missing-record") delete a.id;
  if (scenario === "missing-decision") delete a.decision;
  if (scenario === "ignored") { a.decision = "Ignorieren"; a.relevance_score = 10; a.priorityType = "ignore"; a.current_priority = "Ignorieren"; }
  if (scenario === "conflicting-id") a.vorgangId = "vorgang-other";
  if (scenario === "duplicate") recommendations.push({ ...a, id: "rec-duplicate", knowledge_object_id: "ko-duplicate" });
  if (scenario === "target-gone") recommendations = [records[1]];
  const items = recommendations.map(r => ({ id: r.id ? `item-${r.id}` : undefined,
    signalId: r.knowledge_object_id, knowledgeObjectId: r.knowledge_object_id,
    vorgangId: r.vorgangId ?? r.vorgang_id, vorgang_id: r.vorgang_id,
    title: r.title, decision: r.decision, finalScore: r.relevance_score,
    recommendedAction: r.recommended_action, primarySource: source, sources: [source], sourceCount: 1 }));
  return {
    profile: { id: "ui-binding-profile", fullName: "Synthetisches UI Profil", active: true,
      onboardedAt: now, party: "Testpartei", faction: "Testfraktion", constituency: "Testwahlkreis",
      committee: "Testausschuss", communicationStyle: "Sachlich", officeFormats: ["presse", "linkedin"], focusTopics: [] },
    briefing: { engine: "v3", available: true, generatedAt: now, status: "Aktuell",
      items, personalizedRecommendations: recommendations, situationalBriefing: [], tasks: [],
      themeOfDay: { ...items[0], vorgangId: "vorgang-a", signalId: "ko-a" },
      currentHelmutState: { profileId: "ui-binding-profile", status: "fresh", generatedAt: now,
        primaryVorgangId: scenario === "missing-primary" ? null : "vorgang-a",
        primaryItem: { id: "vorgang-a", title: a.title, sourceUrl: source.url, sourceName: source.sourceName, sourceCount: 1 },
        recommendation: a.recommended_action, urgency: "medium", briefingType: "daily", items: [],
        sourcesSummary: { sourceCount: 1, qualityStatus: "valid", lastUpdated: now },
        frischeVertrag: { aktuell: true } },
      lageBriefing: { available: true, generatedAt: now, vorgaenge: [] },
      currentRadarState: { status: "empty", anzeige: { status: "empty", mentions: [],
        environment: { party: [], constituency: [], committees: [] }, dynamics: [], articles: [] } }
    }, tasks: [], notes: [], aiStatus: { enabled: false, model: "" }, version: "ui-binding-fixture"
  };
}

module.exports = { payloadFor };
