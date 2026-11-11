"use strict";

// Synthetic shapes from briefingContract.toItem/toRecommendation and app/start.
// All identities deliberately differ; no backend imports or real profile data.
const fixtureTime = new Date().toISOString();
function payloadFor(scenario = "valid") {
  const now = fixtureTime;
  const source = { name: "Synthetische UI Quelle", sourceName: "Synthetische UI Quelle",
    url: "https://example.test/ui/beleg", linkType: "direct", publishedAt: now,
    excerpt: "Ein fiktiver parlamentarischer Bericht dokumentiert eine öffentliche Beratung. Alle Angaben sind synthetische UI-Testdaten." };
  const records = [
    { key: "a", score: 40, decision: "Beobachten" },
    { key: "b", score: 75, decision: "Sofort reagieren" },
    { key: "ignored", score: 10, decision: "Ignorieren" }
  ].map(({ key, score, decision }) => ({
    id: `rec-${key}`, knowledge_object_id: `ko-${key}`, vorgang_id: `vorgang-${key}`,
    title: `Synthetischer Vorgang ${key.toUpperCase()}`, summary: "Ein fiktiver Bericht dokumentiert eine öffentliche Beratung. Ausschließlich synthetische Testdaten.",
    relevance_score: score, decision, priorityType: decision === "Ignorieren" ? "ignore" : decision === "Sofort reagieren" ? "action" : "watch",
    current_priority: decision, recommended_action: "Den synthetischen Vorgang prüfen.",
    personal_relevance_explanation: "Synthetischer Profilbezug.", action_type: "observe",
    status: "new", primarySource: source, source_count: 1, sources: [source]
  }));
  let recommendations = records;
  if (scenario !== "valid" && scenario !== "missing-primary") recommendations = [records[0]];
  const a = records[0];
  if (["many", "after-thin"].includes(scenario)) {
    recommendations = [a, records[1], ...["c", "d", "e"].map((key, index) => ({
      ...a, id: `rec-${key}`, knowledge_object_id: `ko-${key}`, vorgang_id: `vorgang-${key}`,
      title: `Synthetischer Vorgang ${key.toUpperCase()}`, relevance_score: 70 - index * 5
    }))];
    if (scenario === "after-thin") {
      recommendations = recommendations.slice(0, 4);
      recommendations.slice(0, 3).forEach(r => { r.summary = "Kurz."; });
    }
  }
  if (scenario === "url-only") {
    const link = { ...source }; delete link.excerpt;
    a.sources = [link]; a.primarySource = link;
  }
  if (scenario === "missing-vorgang") delete a.vorgang_id;
  if (scenario === "missing-knowledge") delete a.knowledge_object_id;
  if (scenario === "missing-record") delete a.id;
  if (scenario === "missing-decision") delete a.decision;
  if (scenario === "ignored") { a.decision = "Ignorieren"; a.relevance_score = 10; a.priorityType = "ignore"; a.current_priority = "Ignorieren"; }
  if (scenario === "conflicting-id") a.vorgangId = "vorgang-other";
  if (scenario === "duplicate") recommendations.push({ ...a, id: "rec-duplicate", knowledge_object_id: "ko-duplicate" });
  if (scenario === "target-gone") recommendations = [records[1]];
  if (scenario === "missing-source") {
    delete source.url;
    source.linkType = "missing";
  }
  if (scenario === "thin-source") {
    a.summary = "";
    source.excerpt = "";
  }
  const items = recommendations.map(r => ({ id: r.id ? `item-${r.id}` : undefined,
    signalId: r.knowledge_object_id, knowledgeObjectId: r.knowledge_object_id,
    vorgangId: r.vorgangId ?? r.vorgang_id, vorgang_id: r.vorgang_id,
    title: r.title, summary: r.summary, decision: r.decision, finalScore: r.relevance_score,
    recommendedAction: r.recommended_action, primarySource: r.primarySource, sources: r.sources, sourceCount: 1 }));
  if (scenario === "many") items.push({ ...items[0], id: "item-f", signalId: "ko-f", knowledgeObjectId: "ko-f",
    vorgangId: "vorgang-f", vorgang_id: "vorgang-f", title: "Synthetischer Vorgang F", finalScore: 55 });
  return {
    profile: { id: "ui-binding-profile", fullName: "Synthetisches UI Profil", active: true,
      onboardedAt: now, party: "Testpartei", faction: "Testfraktion", constituency: "Testwahlkreis",
      parliamentType: scenario === "unknown-mandate" ? "" : scenario === "land-mandate" ? "landtag" : "bundestag",
      parliament: scenario === "unknown-mandate" ? "" : scenario === "land-mandate" ? "Abgeordnetenhaus von Berlin" : "Deutscher Bundestag",
      state: scenario === "land-mandate" ? "Berlin" : "",
      ...(scenario === "unknown-mandate" ? { politicalLevel: "Bund", function: "Bundestagsabgeordnete:r" } : {}),
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
      lageBriefing: { available: true, generatedAt: now, vorgaenge: scenario === "many" ? [{
        id: "vorgang-f", vorgangId: "vorgang-f", knowledgeObjectId: "ko-f", title: "Synthetischer Vorgang F",
        displayTitle: "Synthetischer Vorgang F", displaySummary: "Synthetischer, belegter Sachstand für den Übergang ins Büro.",
        sources: [source], summary: { wasIstPassiert: "Synthetischer Sachstand für den UI-Test." }
      }] : [] },
      currentRadarState: { status: "empty", anzeige: { status: "empty", mentions: [],
        environment: { party: [], constituency: [], committees: [] }, dynamics: [], articles: [] } }
    }, tasks: [], notes: [], aiStatus: { enabled: false, model: "" }, version: "ui-binding-fixture"
  };
}

module.exports = { payloadFor };
