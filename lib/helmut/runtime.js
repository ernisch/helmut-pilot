const cemInceProfile = {
  id: "cem-ince",
  fullName: "Cem Ince",
  party: "Die Linke",
  faction: "Die Linke",
  function: "Bundestagsabgeordneter",
  role: "Bundestagsabgeordneter",
  politicalLevel: "Bund",
  constituency: "Noch offen",
  state: "Noch offen",
  location: "Noch offen",
  committee: "Arbeit und Soziales",
  committees: ["Arbeit und Soziales"],
  committeeUnknown: false,
  focusTopics: [
    "Arbeit",
    "Soziales",
    "Bürgergeld",
    "Rente",
    "Mindestlohn",
    "Tarifbindung",
    "Arbeitsmarkt",
    "Pflege",
    "Sozialstaat",
    "Armut",
    "Gewerkschaften",
    "Bundesregierung Vorhaben im Bereich Arbeit und Soziales"
  ],
  topicPriorities: {
    Arbeit: 5,
    Soziales: 5,
    Bürgergeld: 5,
    Mindestlohn: 5,
    Pflege: 4,
    Wohnen: 2,
    Migration: 2,
    Bildung: 2,
    Klima: 1,
    Energie: 2,
    Digitalisierung: 2,
    Außenpolitik: 1,
    Verteidigung: 1,
    Europa: 2,
    Familie: 3,
    Rente: 5,
    Gesundheit: 3,
    Tarifbindung: 5,
    Arbeitsmarkt: 5,
    Gewerkschaften: 5
  },
  mainQuestion: "Welche Pläne hat die Bundesregierung im Bereich Arbeit und Soziales und worauf sollte ich politisch reagieren?",
  monitoringTargets: ["Meine Partei", "Meine Person", "Mein Fachausschuss", "Bundesregierung Vorhaben", "Arbeit und Soziales"],
  outputNeeds: [
    "Was ist heute wichtig?",
    "Was kann ignoriert werden?",
    "Worauf sollte ich reagieren?",
    "Welche Chance entsteht?",
    "Welches Risiko entsteht?",
    "Welche Formulierung kann ich nutzen?"
  ],
  regionalInterests: ["lokale Beschäftigung", "Pflegeversorgung", "Armutsbekämpfung", "Tarifbindung vor Ort"],
  relevantMinistries: ["BMAS", "BMG", "BMF", "Bundesregierung"],
  opponents: ["CDU/CSU", "SPD-Regierungslinie", "FDP", "AfD"],
  localMedia: ["taz", "nd", "regionale Tageszeitung", "Lokalradio"],
  communicationStyle: "Lösungsorientiert",
  riskTopics: ["Bürgergeld-Sanktionsframe", "Angriffe auf soziale Sicherung", "fehlende Tarifkontrollen"],
  opportunityTopics: ["Tariftreue", "Mindestlohn", "gute Arbeit", "Pflegearbeitsbedingungen"],
  noGoTopics: ["unbelegte persönliche Angriffe", "verkürzte Kulturkampf-Frames", "unklare Forderungen ohne Handlungsvorschlag"],
  preferredChannels: ["presse", "linkedin", "x", "ausschuss", "buergerdialog"],
  reportingTopics: ["Arbeit", "Soziales", "Bürgergeld", "Mindestlohn", "Rente", "Pflege"],
  currentCampaigns: ["Gute Arbeit", "Armutsfester Sozialstaat", "Tarifbindung stärken"],
  publicPositions: [
    "Gute Arbeit braucht Tarifbindung und Kontrolle.",
    "Soziale Sicherung darf Menschen nicht unter Generalverdacht stellen.",
    "Pflege braucht verlässliche Arbeitsbedingungen."
  ],
  keyAudiences: ["Beschäftigte", "Gewerkschaften", "Sozialverbände", "Pflegekräfte", "Menschen mit niedrigen Einkommen"],
  upcomingAppointments: []
};

const demoSources = [
  { id: "source-party", name: "Die Linke Tageslage", type: "party", url: "https://die-linke.de", priority: 90, active: true },
  { id: "source-person", name: "Cem Ince Monitoring", type: "person", url: "https://www.tagesschau.de/inland/", priority: 100, active: true },
  { id: "source-committee", name: "Ausschuss Arbeit und Soziales", type: "committee", url: "https://bundestag.de", priority: 92, active: true },
  { id: "source-bundestag", name: "Bundestag Heute", type: "bundestag", url: "https://bundestag.de/heute", priority: 82, active: true },
  { id: "source-ministry", name: "BMAS Vorhabenradar", type: "ministry", url: "https://bmas.de", priority: 95, active: true },
  { id: "source-local", name: "Regionale Tageszeitung", type: "local", url: "https://www.nd-aktuell.de", priority: 74, active: true },
  { id: "source-association", name: "Gewerkschafts- und Sozialverbandslage", type: "association", url: "https://www.dgb.de", priority: 84, active: true },
  { id: "source-social", name: "Social Scan", type: "social", url: "https://www.bsky.app", priority: 60, active: true },
  { id: "source-media", name: "Politik Morgen", type: "media", url: "https://www.deutschlandfunk.de/politik-100.html", priority: 55, active: true }
];

const demoEvidenceMeta = {
  "raw-bmas-tariftreue": {
    sourceName: "BMAS Pressemitteilung",
    sourceType: "ministry",
    sourceUrl: "https://bmas.de",
    retrievedAt: "2026-06-17T06:12:00+02:00",
    excerpt: "Öffentliche Aufträge des Bundes sollen stärker an Tarifbindung geknüpft werden.",
    confidence: "high"
  },
  "raw-linke-buergergeld": {
    sourceName: "Die Linke Fraktion",
    sourceType: "party",
    sourceUrl: "https://die-linke.de",
    retrievedAt: "2026-06-17T06:22:00+02:00",
    excerpt: "Die Fraktion sucht Stimmen aus dem Ausschuss Arbeit und Soziales für eine klare soziale Gegenposition.",
    confidence: "high"
  },
  "raw-cem-ince-mindestlohn": {
    sourceName: "Tagesschau Anfrage und Social Media Signale",
    sourceType: "media",
    sourceUrl: "https://www.tagesschau.de/inland/",
    retrievedAt: "2026-06-17T06:36:00+02:00",
    excerpt: "Eine Redaktion fragt nach, ob du die Bundesregierung noch vor der Ausschusssitzung öffentlich adressieren willst.",
    confidence: "medium"
  },
  "raw-committee-pflege": {
    sourceName: "Bundestag Ausschusskalender",
    sourceType: "committee",
    sourceUrl: "https://bundestag.de",
    retrievedAt: "2026-06-17T06:50:00+02:00",
    excerpt: "Der Ausschuss Arbeit und Soziales behandelt heute Arbeitsbedingungen in der Pflege.",
    confidence: "high"
  },
  "raw-bundestag-rente": {
    sourceName: "Bundestag Tagesordnung",
    sourceType: "bundestag",
    sourceUrl: "https://bundestag.de",
    retrievedAt: "2026-06-17T07:05:00+02:00",
    excerpt: "Auf der Tagesordnung steht ein Rentenpaket der Bundesregierung.",
    confidence: "high"
  },
  "raw-ministry-arbeitsmarkt": {
    sourceName: "Bundesregierung",
    sourceType: "ministry",
    sourceUrl: "https://bundesregierung.de",
    retrievedAt: "2026-06-17T07:19:00+02:00",
    excerpt: "Vorgesehen sind schnellere Vermittlung, Qualifizierung und strengere Mitwirkungspflichten.",
    confidence: "high"
  },
  "raw-local-pflegeheim": {
    sourceName: "Lokale Zeitung",
    sourceType: "local",
    sourceUrl: "https://www.nd-aktuell.de",
    retrievedAt: "2026-06-17T07:30:00+02:00",
    excerpt: "Beschäftigte fordern bessere Arbeitsbedingungen und verlässliche Personalstandards.",
    confidence: "medium"
  },
  "raw-union-tarifbindung": {
    sourceName: "DGB Reaktion",
    sourceType: "association",
    sourceUrl: "https://dgb.de",
    retrievedAt: "2026-06-17T07:37:00+02:00",
    excerpt: "Gewerkschaften fordern wirksame Kontrollen und Sanktionen.",
    confidence: "high"
  },
  "raw-risk-sanktionsframe": {
    sourceName: "Reichweitenstarker Social Media Account",
    sourceType: "social",
    sourceUrl: "https://www.bsky.app",
    retrievedAt: "2026-06-17T07:44:00+02:00",
    excerpt: "Erste Kommentare greifen den Frame auf.",
    confidence: "low"
  },
  "raw-irrelevant-sport": {
    sourceName: "Lokale Zeitung",
    sourceType: "media",
    sourceUrl: "https://www.deutschlandfunk.de/politik-100.html",
    retrievedAt: "2026-06-17T08:07:00+02:00",
    excerpt: "Der lokale Sportverein präsentiert neue Farben und einen Sponsor.",
    confidence: "medium"
  }
};

const demoRawItems = [
  ["raw-bmas-tariftreue", "source-ministry", "BMAS legt Eckpunkte für Bundestariftreuegesetz vor", "Das Bundesarbeitsministerium kündigt Eckpunkte für ein Bundestariftreuegesetz an. Öffentliche Aufträge des Bundes sollen stärker an Tarifbindung geknüpft werden; Details zur Kontrolle bleiben offen.", "Bundesregierung Vorhaben im Bereich Arbeit und Soziales"],
  ["raw-linke-buergergeld", "source-party", "Die Linke fordert Gegenlinie zu geplanten Bürgergeld-Sanktionen", "Die Linke will die Bundesregierung wegen neuer Bürgergeld-Sanktionspläne angreifen. Die Fraktion sucht Stimmen aus dem Ausschuss Arbeit und Soziales für eine klare soziale Gegenposition.", "Berichterstattung über Die Linke"],
  ["raw-cem-ince-mindestlohn", "source-person", "Deine Mindestlohnforderung wird in der Morgenlage aufgegriffen", "Mehrere Accounts greifen deine Forderung nach einem höheren Mindestlohn auf. Eine Redaktion fragt nach, ob du die Bundesregierung noch vor der Ausschusssitzung öffentlich adressieren willst.", "Berichterstattung über deine Person"],
  ["raw-committee-pflege", "source-committee", "Ausschuss Arbeit und Soziales setzt Pflege-Arbeitsbedingungen auf Tagesordnung", "Der Ausschuss Arbeit und Soziales behandelt heute Arbeitsbedingungen in der Pflege. Erwartet werden Fragen zu Dienstplänen, Personalmangel, Tarifbindung und Finanzierung.", "Berichterstattung über seinen Fachausschuss"],
  ["raw-bundestag-rente", "source-bundestag", "Bundestag debattiert Rentenpaket der Bundesregierung", "Auf der Tagesordnung steht ein Rentenpaket der Bundesregierung. Kritisiert werden unklare Entlastungen für Menschen mit niedrigen Einkommen und offene Finanzierungsfragen.", "Bundestag Thema"],
  ["raw-ministry-arbeitsmarkt", "source-ministry", "Bundesregierung kündigt Initiative zur Arbeitsmarktintegration an", "Die Bundesregierung plant eine Initiative zur Arbeitsmarktintegration. Vorgesehen sind schnellere Vermittlung, Qualifizierung und strengere Mitwirkungspflichten.", "Ministerium Thema"],
  ["raw-local-pflegeheim", "source-local", "Lokales Pflegeheim warnt vor Dienstplan-Kollaps", "Ein Pflegeheim in der Region warnt vor kurzfristigen Dienstplan-Ausfällen. Beschäftigte fordern bessere Arbeitsbedingungen und verlässliche Personalstandards.", "Lokales Thema"],
  ["raw-union-tarifbindung", "source-association", "Gewerkschaften begrüßen Tariftreuepläne, warnen aber vor Schlupflöchern", "Gewerkschaften unterstützen das Vorhaben der Bundesregierung zur Tariftreue, fordern aber wirksame Kontrollen und Sanktionen. Jetzt suchen sie parlamentarische Verbündete.", "Verbandsreaktion"],
  ["raw-risk-sanktionsframe", "source-social", "Reichweitenstarker Account rahmt deine Bürgergeldposition als Schutz von Leistungsverweigerung", "Ein reichweitenstarker Account greift deine Bürgergeldposition persönlich an und verbindet sie mit dem Vorwurf, Leistungsverweigerung zu schützen. Erste Kommentare greifen den Frame auf.", "Kritisches Risiko"],
  ["raw-irrelevant-sport", "source-media", "Sportverein stellt neues Trikotdesign für die kommende Saison vor", "Der lokale Sportverein präsentiert neue Farben und einen Sponsor. Für deine heutigen fachpolitischen Fragen entsteht daraus kein politischer Handlungsbedarf.", "Irrelevantes Thema"]
].map(([id, sourceId, title, content, category], index) => ({
  id,
  sourceId,
  ...demoEvidenceMeta[id],
  title,
  url: demoEvidenceMeta[id].sourceUrl,
  content,
  publishedAt: [
    "2026-06-17T06:05:00+02:00",
    "2026-06-17T06:18:00+02:00",
    "2026-06-17T06:32:00+02:00",
    "2026-06-17T06:45:00+02:00",
    "2026-06-17T07:00:00+02:00",
    "2026-06-17T07:16:00+02:00",
    "2026-06-17T07:25:00+02:00",
    "2026-06-17T07:33:00+02:00",
    "2026-06-17T07:41:00+02:00",
    "2026-06-17T08:02:00+02:00"
  ][index],
  author: "Demo Redaktion",
  hash: `mock-${String(index + 1).padStart(3, "0")}`,
  category
}));

function generateBriefing(profile, rawItems, sources = demoSources) {
  const topics = clusterRawItems(rawItems, profile);
  const topicBySignalId = new Map();
  const signals = topics.map((topic) => {
    const signal = topicToSignal(topic, rawItems, sources);
    topicBySignalId.set(signal.id, topic);
    return signal;
  });
  const relevanceBySignalId = new Map(signals.map((signal) => [signal.id, scorePoliticalTopic(topicBySignalId.get(signal.id), rawItems, profile)]));
  const scores = signals.map((signal) => relevanceToScore(signal, profile, relevanceBySignalId.get(signal.id)));
  const briefingId = `briefing-${profile.id}-${new Date().toISOString().slice(0, 10)}`;
  const items = signals
    .map((signal) => toBriefingItem(briefingId, signal, scores.find((score) => score.signalId === signal.id), relevanceBySignalId.get(signal.id), topicBySignalId.get(signal.id), rawItems, sources, profile))
    .sort((a, b) => b.priority - a.priority);
  const curatedItems = curateBriefingItems(items);
  const decisionMetrics = buildDecisionMetrics(curatedItems);
  const themeOfDay = selectThemeOfDay(curatedItems);
  const chanceOfDay = selectChanceOfDay(curatedItems);
  const riskOfDay = selectRiskOfDay(curatedItems);
  const tasks = buildDemoTasks(curatedItems);
  const taskMetrics = buildTaskMetrics(tasks);
  const evidence = rawItems.map((item) => buildEvidence(item, profile));
  const userInteractions = [];

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
    signals,
    rawItems,
    sources
  };
}

function clusterRawItems(rawItems, profile) {
  const groups = new Map();
  rawItems.forEach((item) => {
    const key = topicClusterKey(item);
    groups.set(key, [...(groups.get(key) || []), item]);
  });

  return Array.from(groups.entries()).map(([key, items]) => {
    const sorted = uniqueTopicItems(items).sort((a, b) => sourceWeight(b.sourceType) - sourceWeight(a.sourceType));
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

function topicClusterKey(item) {
  const text = `${item.title} ${item.content}`.toLowerCase();
  if (hasAnyTerm(text, ["pflege", "pflegereform", "dienstplan", "dienstpläne", "pflegende angehörige", "angehörigenpflege"]) && !hasAnyTerm(text, ["tariftreuegesetz", "bundestariftreuegesetz"])) return "pflege-arbeitsbedingungen";
  if (hasAnyTerm(text, ["tariftreue", "tarifbindung", "gewerkschaft", "gewerkschaften", "dgb"])) return "bundestariftreuegesetz";
  if (hasAnyTerm(text, ["arbeitszeitgesetz", "arbeitszeitgesetzes", "acht-stunden-tag", "acht stunden tag", "arbeitszeit"])) return "arbeitszeitgesetz";
  if (hasAnyTerm(text, ["bürgergeld", "sanktion", "sanktionen", "leistungsverweigerung"])) return "buergergeld-sanktionen";
  if (hasAnyTerm(text, ["mindestlohn"])) return "mindestlohn";
  if (hasAnyTerm(text, ["rente", "renten", "rentenpaket", "rentenreform"])) return "rentenpaket";
  if (hasAnyTerm(text, ["arbeitsmarkt", "qualifizierung", "mitwirkungspflichten"])) return "arbeitsmarktintegration";
  if (hasAnyTerm(text, ["trikot", "sportverein"])) return "irrelevant-sport";
  return item.id;
}

function uniqueTopicItems(items) {
  const byKey = new Map();
  items.forEach((item) => {
    const key = normalizeItemUrl(item.url) || normalizeTopicText(item.title);
    const existing = byKey.get(key);
    if (!existing || itemQuality(item) > itemQuality(existing)) byKey.set(key, item);
  });
  return Array.from(byKey.values());
}

function itemQuality(item) {
  const publishedAt = new Date(item.publishedAt || item.retrievedAt || 0).getTime() || 0;
  return sourceWeight(item.sourceType) * 1_000_000_000_000 + publishedAt;
}

function normalizeItemUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "oc"].forEach((param) => parsed.searchParams.delete(param));
    return `${parsed.hostname}${parsed.pathname}`.replace(/\/$/, "").toLowerCase();
  } catch {
    return String(url).split("?")[0].replace(/\/$/, "").toLowerCase();
  }
}

function normalizeTopicText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function topicTitle(item) {
  const key = topicClusterKey(item);
  if (key === "bundestariftreuegesetz") return "Bundestariftreuegesetz";
  if (key === "arbeitszeitgesetz") return "Reform des Arbeitszeitgesetzes";
  if (key === "buergergeld-sanktionen") return "Bürgergeld-Sanktionen";
  if (key === "mindestlohn") return "Mindestlohn";
  if (key === "pflege-arbeitsbedingungen") return "Arbeitsbedingungen in der Pflege";
  if (key === "rentenpaket") return "Rentenpaket der Bundesregierung";
  if (key === "arbeitsmarktintegration") return "Arbeitsmarktintegration";
  return item.title;
}

function topicToSignal(topic, rawItems, sources) {
  const primaryRawItem = rawItems.find((item) => item.id === topic.rawItemIds[0]);
  const source = sources.find((entry) => entry.id === primaryRawItem.sourceId);
  const sourceType = primaryRawItem.sourceType || source?.type || "media";
  return {
    id: `signal-${topic.id}`,
    rawItemId: primaryRawItem.id,
    topic: topic.title,
    summary: topic.summary,
    entities: Array.from(new Set(topic.rawItemIds.flatMap((id) => inferEntities(rawItems.find((item) => item.id === id))))),
    politicalLevel: inferPoliticalLevel(primaryRawItem, sourceType),
    sourceType,
    evidenceIds: topic.evidenceIds,
    primarySource: topic.primarySource,
    sourceCount: topic.sourceCount,
    confidence: topic.confidence,
    isConfirmed: topic.isConfirmed
  };
}

function scorePoliticalTopic(topic, rawItems, profile) {
  const items = topic.rawItemIds.map((id) => rawItems.find((item) => item.id === id)).filter(Boolean);
  const text = `${topic.title} ${topic.summary}`.toLowerCase();
  const sourceWeightScore = Math.max(...items.map((item) => sourceWeight(item.sourceType)));
  const mandateFit = calculateMandateScore(text, items, profile);
  const mandateScore = mandateFit.score;
  const committeeTerms = uniqueTerms([profile.committee, ...(profile.committees || []), ...(profile.focusTopics || []), ...Object.keys(profile.topicPriorities || {})]);
  const partyTerms = uniqueTerms([profile.party, profile.faction]);
  const personTerms = uniqueTerms([profile.fullName, String(profile.fullName || "").split(/\s+/).filter(Boolean).at(-1)]);
  const committeeScore = hasAnyTerm(text, committeeTerms) ? 92 : 20;
  const partyScore = hasAnyTerm(text, partyTerms) ? 85 : 20;
  const personScore = hasAnyTerm(text, personTerms) || items.some((item) => item.sourceType === "person" && hasAnyTerm(text, personTerms)) ? 95 : 10;
  const governmentScore = hasAnyTerm(text, ["bundesregierung", "bmas", "bundesministerium", "bundesarbeitsministerium", "bundesarbeitsministeriums", "gesetzentwurf", "eckpunkte", "reform", "initiative", "paket"]) ? 92 : 20;
  const constituencyScore = hasAnyTerm(text, ["lokal", "region", "pflegeheim", "wahlkreis"]) ? 70 : 20;
  const timePressureScore = hasAnyTerm(text, ["heute", "morgen", "legt", "kündigt", "tagesordnung", "debatte", "fragt", "erste kommentare"]) ? 86 : 35;
  const mediaAttentionScore = clamp(sourceWeightScore * 0.75 + Math.min(topic.sourceCount, 5) * 6);
  const conflictScore = hasAnyTerm(text, ["kritik", "angriff", "warnung", "warnt", "risiko", "vorwurf", "sanktion", "sanktionen", "schlupflöcher", "unklar", "offen"]) ? 84 : 32;
  const actionNeedScore = Math.max(timePressureScore, governmentScore, personScore, conflictScore);
  const sourceConfirmationBoost = topic.sourceCount > 1 ? Math.min(topic.sourceCount, 5) * 4 : 0;
  const governmentCommitteeBoost = governmentScore >= 80 && committeeScore >= 80 ? 5 : 0;
  const politicalScore = clamp(
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
  const finalScore = clamp(politicalScore * 0.6 + mandateScore * 0.4);
  const level = relevanceLevelForTopic(finalScore, {
    sourceCount: topic.sourceCount,
    mandateScore,
    committeeScore,
    governmentScore
  });
  return {
    politicalScore,
    mandateScore,
    mandateReasons: mandateFit.reasons,
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
    totalScore: finalScore,
    finalScore,
    level
  };
}

function calculateMandateScore(text, items, profile) {
  const reasons = [];
  let score = 15;
  const committees = [profile.committee, ...(profile.committees || [])].filter(Boolean);
  const topicPriorities = profile.topicPriorities || {};
  const priorityHits = Object.entries(topicPriorities)
    .filter(([topic]) => hasTerm(text, topic))
    .map(([topic, priority]) => ({ topic, priority: Number(priority) || 1 }));
  const focusHit = topicMatches(text, profile.focusTopics || []);
  const committeeHit = committees.some((committee) => hasTerm(text, committee)) ||
    ((committees.includes("Arbeit und Soziales")) && hasAnyTerm(text, ["arbeit", "soziales", "bmas", "bundesarbeitsministerium", "bundesarbeitsministeriums", "bürgergeld", "rente", "mindestlohn", "tarif", "tarifbindung", "pflege", "arbeitsmarkt", "arbeitszeit", "arbeitszeitgesetz", "arbeitszeitgesetzes", "acht-stunden-tag", "arbeitsschutz", "beschäftigte", "beschäftigten", "beschäftigung", "sozialstaat"]));
  const partyHit = hasTerm(text, profile.party) || hasTerm(text, profile.faction) || items.some((item) => item.sourceType === "party");
  const personHit = hasTerm(text, profile.fullName) || items.some((item) => item.sourceType === "person" || item.sourceId === "source-person");
  const constituencyTerms = [profile.constituency, profile.state, profile.location, ...(profile.regionalInterests || [])].filter((term) => term && !/^noch offen$/i.test(term));
  const constituencyHit = constituencyTerms.some((term) => hasTerm(text, term)) || items.some((item) => item.sourceType === "local");

  if (personHit) {
    score += 35;
    reasons.push("du namentlich oder persönlich betroffen bist");
  }
  if (committeeHit) {
    score += 30;
    reasons.push(`dein Ausschuss ${committees[0] || "fachlich"} direkt berührt ist`);
  }
  if (priorityHits.length) {
    const topHit = priorityHits.sort((a, b) => b.priority - a.priority)[0];
    score += 10 + topHit.priority * 6;
    reasons.push(`${topHit.topic} in deinem Mandatsprofil Priorität ${topHit.priority} hat`);
  } else if (focusHit) {
    score += 18;
    reasons.push("eines deiner politischen Schwerpunktthemen betroffen ist");
  }
  if (partyHit) {
    score += 14;
    reasons.push(`deine Partei oder Fraktion (${profile.faction || profile.party}) berührt ist`);
  }
  if (constituencyHit) {
    score += 12;
    reasons.push("ein Wahlkreis- oder Regionalbezug erkennbar ist");
  }

  return {
    score: clamp(score),
    reasons: reasons.length ? reasons : ["kein starker persönlicher Mandatsbezug erkennbar ist"]
  };
}

function relevanceToScore(signal, profile, relevance) {
  const decision = relevance.level === "Kritisch" || relevance.level === "Hoch" ? "Sofort reagieren" : relevance.level === "Mittel" ? "Beobachten" : "Ignorieren";
  return {
    id: `score-${signal.id}`,
    signalId: signal.id,
    politicianId: profile.id,
    politicalScore: relevance.politicalScore,
    mandateScore: relevance.mandateScore,
    finalScore: relevance.finalScore,
    urgencyScore: relevance.timePressureScore,
    riskScore: relevance.conflictScore,
    opportunityScore: Math.max(relevance.governmentScore, relevance.mediaAttentionScore),
    mediaScore: relevance.mediaAttentionScore,
    totalScore: relevance.totalScore,
    decision,
    reason: `Relevanz ${relevance.level}: politisch ${relevance.politicalScore}, Mandat ${relevance.mandateScore}, final ${relevance.finalScore}.`
  };
}

function relevanceLevel(totalScore) {
  if (totalScore >= 88) return "Kritisch";
  if (totalScore >= 70) return "Hoch";
  if (totalScore >= 52) return "Mittel";
  if (totalScore >= 35) return "Niedrig";
  return "Ignorieren";
}

function relevanceLevelForTopic(totalScore, context) {
  const strongMandateSignal =
    context.sourceCount > 1 &&
    context.mandateScore >= 45 &&
    (context.committeeScore >= 80 || context.governmentScore >= 80);

  if (totalScore >= 45 && strongMandateSignal) return "Mittel";
  return relevanceLevel(totalScore);
}

function topicMatches(text, terms) {
  return hasAnyTerm(text, terms);
}

function hasAnyTerm(text, terms) {
  return terms.some((term) => hasTerm(text, term));
}

function uniqueTerms(terms) {
  return Array.from(new Set((terms || []).map((term) => String(term || "").trim()).filter((term) => term.length >= 2)));
}

function hasTerm(text, term) {
  const normalizedTerm = String(term || "").toLowerCase().trim();
  if (!normalizedTerm) return false;
  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-zäöüß])${escaped}($|[^a-zäöüß])`, "i").test(text);
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

function scoreSignal(signal, profile, sources) {
  const source = sources.find((entry) => entry.type === signal.sourceType);
  const text = `${signal.topic} ${signal.summary} ${signal.entities.join(" ")}`.toLowerCase();
  const terms = [
    profile.fullName,
    profile.party,
    profile.committee || "",
    profile.mainQuestion || "",
    ...profile.focusTopics,
    ...(profile.monitoringTargets || []),
    ...(profile.outputNeeds || []),
    ...profile.regionalInterests,
    ...profile.relevantMinistries
  ].filter(Boolean).map((term) => term.toLowerCase());
  const hasProfileHit = terms.some((term) => text.includes(term));
  const mentionsPerson = text.includes(profile.fullName.toLowerCase()) || signal.sourceType === "person" || signal.entities.includes(profile.fullName);
  const mentionsParty = text.includes(profile.party.toLowerCase()) || signal.sourceType === "party";
  const committeeFocusHit = /arbeit und soziales|bmas|bundesarbeitsministerium|bürgergeld|mindestlohn|tarifbindung|rente|pflege|arbeitsmarkt|sozialstaat|armut|gewerkschaft/i.test(text);
  const governmentPlanHit = /bundesregierung|gesetz|gesetzesvorhaben|vorhaben|initiative|ankündigt|eckpunkte|paket|pläne|plant/i.test(text);
  const localHit = signal.politicalLevel === "local" || signal.sourceType === "local";
  const committeeHit = signal.sourceType === "committee" || text.includes((profile.committee || "").toLowerCase());
  const riskHit = /kritik|angriff|warn|risiko|stigmatisierung|afd|unklar|offen|schlupflöcher|strengere|sanktion|vorwurf|fehlende/i.test(text);
  const opportunityHit = /chance|unterstütz|begrüß|fordert|initiative|arbeitsbedingungen|eckpunkte|tariftreue|mindestlohn|verbündete|qualifizierung/i.test(text);
  const urgentHit = /heute|fragt|erwartet|debatte|ausschusssitzung|tagesordnung|erste .*kommentare|greift|persönlich|reichweitenstark|ankündigt|legt .*vor|plant/i.test(text);
  const mandateScore = clamp((mentionsPerson && 95) || (signal.sourceType === "ministry" && governmentPlanHit && committeeFocusHit && 92) || (committeeHit && urgentHit && 88) || (mentionsParty && 82) || (committeeFocusHit && governmentPlanHit && 78) || (committeeHit && 76) || (hasProfileHit && 76) || (committeeFocusHit && 70) || (localHit && committeeFocusHit && 68) || 18);
  const urgencyScore = clamp((mentionsPerson && urgentHit && 88) || (signal.sourceType === "social" && riskHit && 88) || (signal.sourceType === "ministry" && governmentPlanHit && committeeFocusHit && 86) || (committeeHit && urgentHit && 76) || (urgentHit && 68) || (governmentPlanHit && committeeFocusHit && 62) || (signal.sourceType === "ministry" && 55) || 28);
  const riskScore = clamp(riskHit ? (mentionsPerson ? 92 : 78) : committeeHit ? 54 : mentionsParty ? 44 : 22);
  const opportunityScore = clamp(opportunityHit ? (localHit || mentionsPerson ? 84 : 70) : mentionsParty || committeeHit ? 48 : 20);
  const mediaScore = clamp(source ? source.priority : signal.sourceType === "social" ? 55 : 40);
  const totalScore = Math.round(mandateScore * 0.35 + urgencyScore * 0.25 + riskScore * 0.2 + opportunityScore * 0.15 + mediaScore * 0.05);
  const decision = totalScore >= 75 ? "Sofort reagieren" : totalScore >= 45 ? "Beobachten" : "Ignorieren";

  return {
    id: `score-${signal.id}`,
    signalId: signal.id,
    politicianId: profile.id,
    mandateScore,
    urgencyScore,
    riskScore,
    opportunityScore,
    mediaScore,
    totalScore,
    decision,
    reason:
      decision === "Ignorieren"
        ? "Heute kein ausreichender Bezug zu deinem Mandat oder deiner Zeitlage. Deine Aufmerksamkeit ist bei Vorgängen mit konkretem Handlungsbedarf besser eingesetzt."
        : decision === "Sofort reagieren"
          ? `Das liegt nah an deinem Ausschuss (${mandateScore}) und erzeugt akuten Handlungsdruck (${urgencyScore}); Risiko ${riskScore}, Chance ${opportunityScore}.`
          : `Relevant für Arbeit und Soziales, aber noch nicht zwingend für sofortige öffentliche Reaktion; Risiko ${riskScore}, Chance ${opportunityScore}.`
  };
}

function rawItemToSignal(item, sources) {
  const source = sources.find((entry) => entry.id === item.sourceId);
  const sourceType = item.sourceType || source?.type || "media";
  return {
    id: `signal-${item.id}`,
    rawItemId: item.id,
    topic: inferTopic(item),
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

function toBriefingItem(briefingId, signal, score, relevance, topic, rawItems, sources, profile) {
  const rawItem = rawItems.find((item) => item.id === signal.rawItemId);
  const context = buildContext(signal, rawItem, profile);
  context.whyItMatters = buildMandateExplanation(context.whyItMatters, relevance, profile);
  const decisionDetails = buildDecisionDetails(signal, rawItem, score, profile);
  const evidence = topic.rawItemIds.map((id) => buildEvidence(rawItems.find((item) => item.id === id), profile));
  const primarySource = evidence[0];

  const item = {
    id: `briefing-item-${topic.id}`,
    briefingId,
    signalId: signal.id,
    priority: score.totalScore,
    classification: score.decision === "Ignorieren" ? "ignore" : score.riskScore >= 75 ? "risk" : score.opportunityScore >= score.riskScore ? "opportunity" : "watch",
    ...context,
    ...decisionDetails,
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
    politicalScore: score.politicalScore,
    mandateScore: score.mandateScore,
    finalScore: score.finalScore,
    totalScore: score.totalScore,
    taskTemplate: null
  };
  item.taskTemplate = buildTaskTemplate(item, score);
  return item;
}

function buildMandateExplanation(baseText, relevance, profile) {
  const reasons = Array.isArray(relevance.mandateReasons) ? relevance.mandateReasons.slice(0, 2) : [];
  if (!reasons.length || relevance.level === "Ignorieren") return baseText;
  return `${baseText} Konkret betrifft es dich, weil ${reasons.join(" und ")}.`;
}

function summarizeTopic(topic, evidence) {
  const sourceText = topic.sourceCount > 1 ? `${topic.sourceCount} Quellen berichten dazu.` : `${topic.primarySource} berichtet dazu.`;
  return `${sourceText} ${evidence[0]?.excerpt || topic.summary}`;
}

function inferActionType(signal, score, relevance, rawItem) {
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

function buildTaskTemplate(item, score) {
  const priority = score.decision === "Sofort reagieren" ? "high" : score.decision === "Beobachten" ? "medium" : "low";
  return {
    id: `task-template-${item.signalId}`,
    title: buildTaskTitle(item),
    description: buildTaskDescription(item),
    priority,
    dueDate: buildDueDate(priority, item),
    assignee: inferAssignee(item),
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

function buildEvidence(item, profile) {
  return {
    id: `evidence-${item.id}`,
    sourceName: item.sourceName,
    sourceType: item.sourceType,
    sourceUrl: item.sourceUrl,
    url: item.url,
    itemUrl: item.url,
    publishedAt: item.publishedAt,
    retrievedAt: item.retrievedAt,
    author: item.author,
    excerpt: item.excerpt,
    confidence: item.confidence,
    relevanceReason: buildEvidenceRelevance(item, profile)
  };
}

function buildEvidenceRelevance(item, profile) {
  const text = `${item.title} ${item.content}`.toLowerCase();
  if (item.sourceId === "source-person") return `Direktes Signal zu deiner Person und deiner Mindestlohnposition im Ausschuss ${profile.committee || profile.committees.join(", ")}.`;
  if (item.sourceType === "ministry") return `Direktes Vorhaben der Bundesregierung im Ausschussbereich ${profile.committee || profile.committees.join(", ")}.`;
  if (item.sourceType === "bundestag" || item.sourceType === "committee") return `Offizielle parlamentarische Quelle mit unmittelbarem Bezug zu deinem Ausschuss ${profile.committee || profile.committees.join(", ")}.`;
  if (item.sourceType === "party") return "Fraktions- oder Parteisignal, das deine politische Linie heute anschlussfähig machen kann.";
  if (item.sourceType === "association") return "Verbandsreaktion aus dem sozialpolitischen Umfeld, relevant für Gewerkschaften und Tarifbindung.";
  if (item.sourceType === "social") return "Frühes öffentliches Signal mit möglichem Reputationsrisiko; noch nicht journalistisch bestätigt.";
  if (text.includes("pflege")) return `Fachlicher Bezug zu Pflege, sozialer Sicherung und damit zu deinem Ausschuss ${profile.committee || profile.committees.join(", ")}.`;
  return "Quelle wurde aufgenommen, weil sie für die heutige politische Priorisierung geprüft werden sollte.";
}

function buildSourceNote(confidence, sourceType, isConfirmed) {
  if (confidence === "high") return isConfirmed ? "Offizielle oder belastbare Quelle." : "Belastbare Quelle mit hoher Plausibilität.";
  if (confidence === "medium") return sourceType === "media" || sourceType === "local" ? "Etabliertes öffentliches Signal, politisch nutzbar." : "Bestätigtes öffentliches Signal mit mittlerer Sicherheit.";
  return "Frühes Signal, noch nicht journalistisch bestätigt.";
}

function buildDemoTasks(items) {
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

function curateBriefingItems(items) {
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

function buildTaskMetrics(tasks) {
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  return {
    openCount: tasks.filter((task) => task.status === "open").length,
    criticalCount: tasks.filter((task) => task.status !== "done" && task.priority === "high").length,
    dueByNoonCount: tasks.filter((task) => task.status !== "done" && new Date(task.dueDate) <= noon).length
  };
}

function buildTaskTitle(item) {
  const text = `${item.title} ${item.recommendedAction}`.toLowerCase();
  if (text.includes("tariftreue")) return "BMAS-Eckpunkte analysieren";
  if (text.includes("arbeitsmarkt")) return "Arbeitsmarktinitiative bewerten";
  if (text.includes("bürgergeld") || text.includes("sanktion")) return "Bürgergeld-Gegenlinie vorbereiten";
  if (text.includes("mindestlohn")) return "Mindestlohn-Positionierung freigeben";
  if (text.includes("pflege")) return "Ausschussfragen Pflege vorbereiten";
  if (text.includes("rente")) return "Rentenpaket fachlich prüfen";
  return `${item.topic} vorbereiten`;
}

function buildTaskDescription(item) {
  return `${item.recommendedAction}

${item.recommendedPreparation}

Liefere eine kurze Einschätzung, eine rote Linie und diese nutzbare Formulierung: "${item.suggestedStatement}"`;
}

function buildTaskBenefit(item) {
  if (item.politicalBenefit === "Hoch") return "Du kannst deine Position vor der öffentlichen Debatte setzen.";
  if (item.opportunityNote.includes("Profil")) return item.opportunityNote;
  return "Du hältst den Vorgang arbeitsfähig und kannst später gezielt reagieren.";
}

function inferAssignee(item) {
  const channel = item.recommendedChannel.toLowerCase();
  if (channel.includes("presse") || channel.includes("social")) return "Pressesprecher";
  if (item.classification === "risk") return "Büroleitung";
  if (item.decision === "Beobachten") return "Referent";
  return "Wissenschaftlicher Mitarbeiter";
}

function buildDueDate(priority, item) {
  const due = new Date();
  if (priority === "high" && item.riskLevel === "Hoch") due.setHours(10, 30, 0, 0);
  else if (priority === "high") due.setHours(11, 0, 0, 0);
  else if (priority === "medium") due.setHours(12, 0, 0, 0);
  else due.setHours(16, 0, 0, 0);
  return due.toISOString();
}

function buildDecisionDetails(signal, rawItem, score, profile) {
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
      politicalBenefit: "Niedrig",
      targetGroup: "Keine relevante Zielgruppe",
      recommendedChannel: "Keine Reaktion",
      riskLevel: "Niedrig",
      recommendedPreparation: "Nicht vorbereiten. Im Briefing bewusst ausblenden."
    };
  }

  if (isAttack) {
    return {
      whyNow: "Der Frame entsteht jetzt. In den nächsten Stunden entscheidet sich, ob du über Bürgergeld fachlich sprichst oder auf einen Vorwurf reagieren musst.",
      estimatedTimeMinutes: 15,
      politicalBenefit: "Hoch",
      targetGroup: "Presse, Social Media, sozialpolitisch interessierte Öffentlichkeit",
      recommendedChannel: "Kurzstatement und Social Media",
      riskLevel: "Hoch",
      recommendedPreparation: "Drei Kernargumente gegen den Sanktionsframe vorbereiten und den Vorwurf nicht wiederholen."
    };
  }

  if (text.includes("pflege") || text.includes("pflegereform")) {
    return {
      whyNow: "Der Artikel setzt heute eine sozialpolitische Frage auf die Agenda: Finanzierung, Entlastung und Absicherung in der Pflege. Das liegt direkt in deinem Ausschussbereich.",
      estimatedTimeMinutes: 10,
      politicalBenefit: "Mittel",
      targetGroup: "Pflegende Angehörige, Sozialverbände und Fachöffentlichkeit",
      recommendedChannel: "Kurzlinie für Presse und Social Media",
      riskLevel: "Mittel",
      recommendedPreparation: "Eine rote Linie formulieren: Keine Pflegereform auf Kosten pflegender Angehöriger."
    };
  }

  if (isGovernmentPlan) {
    return {
      whyNow: "Die Bundesregierung setzt heute den ersten Frame. Die mediale Aufmerksamkeit ist in den nächsten 24 Stunden am höchsten.",
      estimatedTimeMinutes: score.totalScore >= 80 ? 15 : 10,
      politicalBenefit: "Hoch",
      targetGroup: text.includes("tarif") ? "Arbeitnehmer, Gewerkschaften und Betriebsräte" : "Beschäftigte, Sozialverbände und Fachpresse",
      recommendedChannel: text.includes("tarif") ? "LinkedIn und Presse" : "Presse-Statement und Ausschussfragen",
      riskLevel: score.riskScore >= 75 ? "Hoch" : "Mittel",
      recommendedPreparation: "Positionierung mit einem Zustimmungspunkt, einer roten Linie und einer Frage an die Bundesregierung vorbereiten."
    };
  }

  if (isCommittee) {
    return {
      whyNow: "Das Thema liegt heute auf deiner Ausschussagenda. Deine Fragen müssen vor der Sitzung sitzen, nicht danach.",
      estimatedTimeMinutes: 12,
      politicalBenefit: "Hoch",
      targetGroup: "Ausschuss, Fachöffentlichkeit und Beschäftigte im betroffenen Bereich",
      recommendedChannel: "Ausschussfragen und anschließender Social-Media-Post",
      riskLevel: "Mittel",
      recommendedPreparation: "Zwei fachliche Fragen und eine zitierfähige Kernlinie vorbereiten."
    };
  }

  if (isParty) {
    return {
      whyNow: "Deine Fraktion sucht heute eine klare Stimme aus Arbeit und Soziales. Wenn du früh lieferst, wird deine Linie anschlussfähig.",
      estimatedTimeMinutes: 10,
      politicalBenefit: "Mittel",
      targetGroup: "Fraktion, Parteiumfeld und sozialpolitische Community",
      recommendedChannel: "Interne Linie und Social Media",
      riskLevel: "Mittel",
      recommendedPreparation: "Eine eigene Formulierung vorbereiten, die nicht nur Parteiposition wiederholt."
    };
  }

  return {
    whyNow: `Das Thema berührt deinen Ausschuss ${profile.committee || profile.committees.join(", ")} heute indirekt und sollte für Anschlussfähigkeit beobachtet werden.`,
    estimatedTimeMinutes: 8,
    politicalBenefit: "Mittel",
    targetGroup: "Fachöffentlichkeit und lokale Betroffene",
    recommendedChannel: "Beobachten, später gezielt aufgreifen",
    riskLevel: score.riskScore >= 75 ? "Hoch" : "Mittel",
    recommendedPreparation: "Kurz notieren, welche Bundesregierungslinie daraus entstehen könnte."
  };
}

function buildContext(signal, rawItem, profile) {
  const text = `${rawItem.title} ${rawItem.content}`.toLowerCase();
  const committeeLine = `Das betrifft dich direkt: Es gehört in deinen Ausschuss ${profile.committee || profile.committees.join(", ")}, weil dort Arbeit, soziale Sicherung, Tarifbindung, Rente und Pflege politisch entschieden werden.`;
  if (signal.sourceType === "person" || signal.entities.includes(profile.fullName)) return context("Das betrifft dich direkt: Deine Mindestlohnforderung wird aufgegriffen und liegt mitten in deinem Ausschuss Arbeit und Soziales. Du kannst daraus eine klare Frage an die Bundesregierung machen.", "Lege kurz öffentlich nach: Miss die Bundesregierung am höheren Mindestlohn und gib eine Social-Media-Formulierung frei.", "Wer Vollzeit arbeitet, muss von seinem Lohn leben können. Die Bundesregierung muss beim Mindestlohn liefern, nicht weiter vertrösten.", "Ohne deine Einordnung bleibt die Nachfrage bei einer Einzeläußerung und verliert den Ausschussbezug.", "Du kannst dein Profil als Stimme für Arbeit, Lohn und soziale Sicherheit schärfen.", "Wenn du nicht reagierst, besetzen andere die Mindestlohnfrage, obwohl sie direkt in deinen fachpolitischen Raum fällt.");
  if (text.includes("afd") || text.includes("persönlich") || text.includes("leistungsverweigerung")) return context("Das trifft deine Bürgergeldposition und damit ein Kernfeld deines Ausschusses Arbeit und Soziales. Der Angriff versucht, deine fachliche Linie in einen persönlichen Sanktionsframe zu ziehen.", "Reagiere sofort, aber wiederhole den Vorwurf nicht. Veröffentliche eine klare Gegenformulierung zu Würde, Beratung und armutsfester sozialer Sicherung.", "Bürgergeldpolitik darf Menschen nicht unter Generalverdacht stellen. Wer Armut bekämpfen will, braucht Beratung, gute Arbeit und Respekt statt populistischer Schuldzuweisungen.", "Eine falsche Antwort verstärkt den Angriff; Schweigen lässt den Sanktionsframe an deiner Position kleben.", "Mit einer ruhigen Antwort zeigst du fachliche Autorität im Ausschuss und grenzt soziale Politik klar gegen Hetze ab.", "Wenn du nicht reagierst, kann der Frame spätere Pressefragen zur Bürgergelddebatte vorprägen.");
  if (text.includes("bürgergeld") || text.includes("sanktion")) return context("Das betrifft dich, weil Bürgergeld direkt in deinen Ausschuss Arbeit und Soziales gehört. Die Bundesregierung plant Änderungen, auf die du politisch reagieren solltest.", "Bereite eine Gegenlinie vor: Steig nicht in Sanktionssprache ein, sondern stell Beratung, gute Arbeit und Armutsvermeidung in den Mittelpunkt.", "Wer Bürgergeld nur als Misstrauensdebatte führt, macht Menschen kleiner, aber löst keine Armut.", "Die Debatte kann dich in eine Verteidigungsecke ziehen, wenn du nur auf Vorwürfe antwortest.", "Du kannst die Kernfrage stellen: Welche Pläne der Bundesregierung helfen Menschen wirklich in gute Arbeit?", "Wenn du nicht reagierst, dominiert die Sanktionssprache den Tag.");
  if ((text.includes("ausschuss") || text.includes("pflege") || text.includes("pflegereform")) && !text.includes("tariftreuegesetz") && !text.includes("bundestariftreuegesetz")) return context(committeeLine, "Bereite eine kurze Linie zur Pflegereform vor: Keine Entlastung auf Kosten pflegender Angehöriger, Finanzierung offenlegen, soziale Absicherung sichern.", "Pflegereform darf nicht heißen, dass pflegende Angehörige am Ende die Rechnung zahlen. Die Bundesregierung muss Finanzierung, Entlastung und soziale Absicherung zusammen denken.", "Ohne Einordnung läuft die Debatte als reine Sparlogik, obwohl sie direkt deinen Ausschuss betrifft.", "Du kannst Pflege als soziale Frage sichtbar machen und dich an die Seite pflegender Angehöriger stellen.", "Wenn du nicht reagierst, prägen Regierung und Fachkommentare die Debatte ohne deine soziale Linie.");
  if (text.includes("tariftreue") || text.includes("tarifbindung") || text.includes("gewerkschaft")) return context("Das betrifft dich direkt: Tariftreue ist ein zentrales Thema in deinem Ausschuss Arbeit und Soziales. Du kannst die Bundesregierung heute an Kontrollen, Sanktionen und echter Tarifbindung messen.", "Bereite bis 11:00 Uhr eine zustimmend-kritische Linie vor: Unterstützung für Tariftreue, aber klare Bedingungen bei Kontrolle, Sanktionen und Schlupflöchern.", "Tariftreue darf kein schönes Wort bleiben. Wer öffentliche Aufträge bekommt, muss gute Arbeit und Tarifbindung garantieren.", "Wenn du nur zustimmst, übernimmt die Bundesregierung den Erfolg ohne Druck auf Schlupflöcher.", "Mit Gewerkschaften im Rücken kannst du eine konstruktive, aber klare linke Arbeitsmarktposition setzen.", "Wenn du nicht reagierst, prägt die Bundesregierung das Thema allein und deine Ausschusslinie bleibt unsichtbar.");
  if (text.includes("rente")) return context("Das betrifft dich, weil Rente ein Kernfeld deines Ausschusses Arbeit und Soziales ist. Das Rentenpaket der Bundesregierung trifft genau deine Frage nach politischen Vorhaben der Regierung.", "Prüfe das Paket auf niedrige Einkommen und bereite eine Presselinie vor, die Finanzierung und Armutsfestigkeit abfragt.", "Eine Rentenreform muss zuerst Menschen mit niedrigen Einkommen Sicherheit geben. Alles andere ist sozialpolitisch zu wenig.", "Ohne schnelle Einordnung wirkst du bei einem zentralen Ausschussthema nicht sprechfähig.", "Du kannst die Bundesregierung an sozialer Sicherheit im Alter messen.", "Wenn du nicht reagierst, bleibt die Rentendebatte ohne deine linke, ausschussbezogene Zuspitzung.");
  if (text.includes("arbeitszeit") || text.includes("acht-stunden-tag") || text.includes("arbeitszeitgesetz")) return context("Das betrifft dich direkt: Arbeitszeitrecht liegt im Kern deines Ausschusses Arbeit und Soziales. Wenn das BMAS oder Arbeitgeberverbände den Acht-Stunden-Tag zur Debatte stellen, geht es um Schutzrechte von Beschäftigten.", "Bereite eine kurze Linie vor: Flexibilität darf nicht bedeuten, dass Schutzrechte ausgehöhlt werden. Frage konkret nach Kontrolle, Gesundheitsschutz und Mitbestimmung.", "Arbeitszeit darf nicht allein aus Sicht der Unternehmen diskutiert werden. Wer am Acht-Stunden-Tag rüttelt, muss Beschäftigte, Gesundheitsschutz und Mitbestimmung zuerst schützen.", "Wenn du nicht reagierst, prägen Arbeitgeber und Bundesregierung die Reformdebatte ohne klare linke Schutzperspektive.", "Du kannst dich als Stimme für gute Arbeit, Gesundheitsschutz und Mitbestimmung positionieren.", "Wenn du nicht reagierst, kann die Debatte als reine Flexibilisierungsfrage laufen, obwohl sie direkt deinen Ausschuss betrifft.");
  if (text.includes("arbeitsmarkt") || text.includes("qualifizierung") || text.includes("mitwirkungspflichten")) return context("Das betrifft dich, weil die Arbeitsmarktinitiative ein Bundesregierungsvorhaben im Kernbereich Arbeit und Soziales ist. Darin stecken Chancen durch Qualifizierung, aber auch Risiken durch strengere Pflichten.", "Lehne nicht pauschal ab. Benenne die Chance bei Qualifizierung und formuliere zugleich rote Linien gegen Druck und Sanktionen.", "Qualifizierung ist richtig, Druck ersetzt aber keine gute Arbeit. Die Bundesregierung muss fördern statt Menschen nur schneller in schlechte Jobs zu schieben.", "Wenn du nur gegen Pflichten argumentierst, wird die Chance auf Qualifizierung übersehen.", "Du kannst zeigen, dass linke Arbeitsmarktpolitik konkrete Weiterbildung und gute Arbeit verbindet.", "Wenn du nicht reagierst, definiert die Bundesregierung allein, was Arbeitsmarktintegration bedeutet.");
  return context("Das betrifft dich heute nicht ausreichend: Es gibt keinen belastbaren Bezug zu deinem Ausschuss, deiner Partei, deiner Person oder einer anstehenden politischen Entscheidung.", "Ignoriere das Thema und halte es aus deinem Morgenbriefing heraus.", "Keine öffentliche Kommunikation empfohlen.", "Keine relevante politische Gefahr erkennbar.", "Keine politische Chance erkennbar.", "Wenn du nicht reagierst, entsteht kein Schaden; deine Zeit bleibt für relevante Vorgänge frei.");
}

function context(whyItMatters, recommendedAction, suggestedStatement, riskNote, opportunityNote, inactionConsequence) {
  return { whyItMatters, recommendedAction, suggestedStatement, riskNote, opportunityNote, inactionConsequence };
}

function buildDecisionMetrics(items) {
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

function selectThemeOfDay(items) {
  const theme = items
    .filter((item) => item.decision !== "Ignorieren")
    .sort((a, b) => themeRank(b) - themeRank(a))[0] || items[0];

  return {
    title: theme.title,
    whyToday: theme.whyNow,
    recommendedAction: theme.recommendedAction,
    estimatedTime: `${theme.estimatedTimeMinutes} Minuten`,
    politicalBenefit: theme.politicalBenefit,
    signalId: theme.signalId
  };
}

function themeRank(item) {
  const text = `${item.title} ${item.summary} ${item.recommendedAction}`.toLowerCase();
  const governmentBoost = /bmas|bundesregierung|bundesministerium|gesetzentwurf|eckpunkte|rentenpaket/.test(text) ? 10 : 0;
  const committeeBoost = /arbeit und soziales|tariftreue|mindestlohn|rente|bürgergeld/.test(text) ? 5 : 0;
  const sourceBoost = item.primarySource?.sourceType === "ministry" || item.primarySource?.sourceType === "bundestag" ? 6 : 0;
  return item.priority + item.estimatedTimeMinutes * 0.2 + governmentBoost + committeeBoost + sourceBoost;
}

function selectChanceOfDay(items) {
  const chance = items
    .filter((item) => item.decision !== "Ignorieren" && item.classification === "opportunity")
    .sort((a, b) => {
      const aBoost = a.classification === "opportunity" ? 25 : 0;
      const bBoost = b.classification === "opportunity" ? 25 : 0;
      return b.priority + bBoost - (a.priority + aBoost);
    })[0];

  if (!chance) return null;

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

function selectRiskOfDay(items) {
  const risk = items
    .filter((item) => item.decision !== "Ignorieren" && (item.classification === "risk" || item.riskLevel === "Hoch"))
    .sort((a, b) => {
      const riskWeight = { Niedrig: 0, Mittel: 12, Hoch: 25 };
      const aFrameRisk = /rahmt|angriff|vorwurf|sanktionsframe|verteidiger/i.test(`${a.title} ${a.riskNote}`) ? 35 : 0;
      const bFrameRisk = /rahmt|angriff|vorwurf|sanktionsframe|verteidiger/i.test(`${b.title} ${b.riskNote}`) ? 35 : 0;
      return b.priority + riskWeight[b.riskLevel] + bFrameRisk - (a.priority + riskWeight[a.riskLevel] + aFrameRisk);
    })[0];

  if (!risk) return null;

  return {
    topic: risk.topic,
    riskLevel: risk.riskLevel,
    whyDangerous: risk.riskNote,
    inactionConsequence: risk.inactionConsequence,
    recommendedPreparation: risk.recommendedPreparation,
    signalId: risk.signalId
  };
}

function buildExecutiveSummary(items, themeOfDay) {
  const react = items.filter((item) => item.decision === "Sofort reagieren").length;
  const watch = items.filter((item) => item.decision === "Beobachten").length;
  const ignore = items.filter((item) => item.decision === "Ignorieren").length;
  if (!themeOfDay) return `Guten Morgen. Heute solltest du auf ${react} Themen reagieren, ${watch} beobachten und ${ignore} ignorieren.`;
  return `Guten Morgen. Heute solltest du auf ${react} Themen reagieren, ${watch} beobachten und ${ignore} ignorieren. Dein wichtigstes Thema ist: ${themeOfDay.title}. ${themeOfDay.recommendedAction}`;
}

function inferTopic(item) {
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

function inferEntities(item) {
  const text = `${item.title} ${item.content}`;
  const entities = ["Cem Ince", "Die Linke", "Bundestag", "Bundesregierung", "BMAS", "Bundesarbeitsministerium", "Ausschuss Arbeit und Soziales", "Gewerkschaften", "AfD"].filter((entity) => text.includes(entity));
  if ((/\bInce\b/.test(text) || item.sourceId === "source-person" || /deine mindestlohnforderung/i.test(text)) && !entities.includes("Cem Ince")) entities.push("Cem Ince");
  return entities;
}

function inferPoliticalLevel(item, sourceType) {
  if (sourceType === "local") return "local";
  if (sourceType === "party") return "party";
  if (sourceType === "committee") return "committee";
  if (sourceType === "bundestag" || sourceType === "ministry") return "federal";
  return /lokal|kommun|region/i.test(`${item.title} ${item.content}`) ? "local" : "federal";
}

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

module.exports = { cemInceProfile, demoSources, demoRawItems, generateBriefing };
