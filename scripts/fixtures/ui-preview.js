"use strict";
// Reused synthetic UI fixtures from PR771 eaf0d5d; no motor or real profiles.
const now = new Date().toISOString();
const item = {
  id: "ui-vorgang", title: "Synthetischer UI Testvorgang", displayTitle: "Synthetischer UI Testvorgang",
  summary: "Dieser Inhalt dient ausschließlich der lokalen Darstellungsprüfung.",
  whyRelevant: "Eine synthetische Begründung für den UI Test.", urgency: "high",
  primarySource: { sourceName: "UI Testquelle", url: "https://example.test/ui", itemUrl: "https://example.test/ui" },
  sources: [{ sourceName: "UI Testquelle", url: "https://example.test/ui", itemUrl: "https://example.test/ui" }],
  sourceUrl: "https://example.test/ui", sourceName: "UI Testquelle", sourceCount: 1,
  lastUpdated: now,
};
const vorgang = { ...item, id: "ui-lage", vorgangId: "ui-lage", status: "neu",
  displayCategory: "UI Prüfung", category: "UI Prüfung", scope: "Bundestag",
  summary: { text: "Synthetische Zusammenfassung für die mobile Darstellung. ".repeat(8),
    wasIstPassiert: "Synthetische Zusammenfassung für die UI Prüfung.", warumWichtig: "Synthetische Begründung." },
  sources: [{ sourceName: "Synthetische UI Testquelle mit langem Namen", url: "https://example.test/ui", publishedAt: now }],
  chronologie: [{ dateLabel: "UI Testdatum", text: "Synthetischer Chronologieeintrag." }],
};
const payload = {
  profile: { id: "ui-profile", fullName: "UI Testprofil", firstName: "UI", active: true,
    onboardedAt: now, party: "Testpartei", faction: "Testfraktion", committee: "Testausschuss",
    communicationStyle: "Sachlich & klar", officeFormats: ["presse", "linkedin"], focusTopics: [] },
  briefing: { engine: "v3", generatedAt: now, lageBriefing: { generatedAt: now, vorgaenge: [vorgang, { ...vorgang, id: "ui-lage-2", vorgangId: "ui-vorgang-2", displayTitle: "Zweiter synthetischer UI Testvorgang" }] }, items: [], tasks: [], currentHelmutState: {
    generatedAt: now, profileId: "ui-profile", status: "fresh", briefingType: "daily", primaryItem: item,
    recommendation: "Den synthetischen UI Zustand prüfen.", whyItMatters: "Nur zur lokalen Darstellung.",
    urgency: "high", riskOfNoAction: "Synthetischer Risikotext für den UI Test.",
    opportunitySummary: "Synthetischer Chancentext für den UI Test.", items: [], contextChips: [],
    recommendedCommunication: { recommendedFormat: "pressRelease", communicationLine: "Synthetischer UI Test." },
    actionItems: [{ title: "UI Darstellung prüfen", priority: "high" }],
    sourcesSummary: { sourceCount: 1, lastUpdated: now, qualityStatus: "complete" },
  }, currentRadarState: {
    generatedAt: now, lastUpdated: now, status: "fresh", profileId: "ui-profile",
    summary: { line1: "Synthetische Radarübersicht für die UI Prüfung." }, mentions: [{
      id: "ui-mention", title: "Synthetische Erwähnung zur UI Prüfung", sourceName: "Synthetische UI Testquelle mit langem Namen",
      sourceUrl: "https://example.test/ui/erwaehnung", publishedAt: now, mentionLabel: "Synthetische Kennzeichnung", evidence: "Synthetischer langer Quellenhinweis. ".repeat(8),
    }],
    environment: {
      party: [{ ...item, title: "Synthetisches Parteiumfeld", sourceUrl: "https://example.test/ui/partei" }],
      constituency: [{ ...item, title: "Synthetisches Wahlkreisumfeld", sourceUrl: "https://example.test/ui/wahlkreis" }],
      committees: [{ ...item, title: "Synthetisches Ausschussumfeld", sourceUrl: "https://example.test/ui/ausschuss" }],
    },
    dynamics: [{ ...item, title: "Synthetischer Dynamikhinweis", evidence: "Synthetischer Quellenbeleg.", sourceUrl: "https://example.test/ui/dynamik" }], articles: [],
    quality: { status: "fresh", sourcesLoaded: true },
  } }, tasks: [], notes: [],
};


module.exports = { payload, item, vorgang };
