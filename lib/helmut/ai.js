const https = require("https");

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.5";
const FALLBACK_MODEL = "gpt-4.1";

function isAiEnabled() {
  return Boolean(process.env.OPENAI_API_KEY);
}

async function enrichBriefingWithAI(briefing, profile) {
  if (!isAiEnabled()) return { ...briefing, ai: { enabled: false, reason: "OPENAI_API_KEY missing" } };

  const items = [];
  for (const item of briefing.items) {
    if (item.decision === "Ignorieren") {
      items.push(item);
      continue;
    }
    try {
      const refined = await refineBriefingItem(item, profile);
      items.push({ ...item, ...pickBriefingFields(refined), aiEnhanced: true });
    } catch (error) {
      console.warn(`AI refinement failed for ${item.title}`, error.message);
      items.push(item);
    }
  }

  const nextBriefing = { ...briefing, items, ai: { enabled: true, model: modelName(), enhancedAt: new Date().toISOString() } };
  return {
    ...nextBriefing,
    executiveSummary: buildAiAwareSummary(nextBriefing)
  };
}

async function refineBriefingItem(item, profile) {
  const payload = publicItemPayload(item, profile);
  const prompt = `
Du bist Helmut, ein digitaler politischer Stabschef.
Du veredelst eine bereits regelbasiert priorisierte politische Empfehlung.

Regeln:
- Sprich den Nutzer direkt mit "du" an.
- Keine dritte Person über den Nutzer.
- Keine Fakten erfinden.
- Nur die mitgelieferte Quellenbasis verwenden.
- Wenn die Quelle schwach ist, vorsichtig formulieren.
- Maximal konkret, nicht nachrichtenhaft.
- Schreibe wie ein erfahrener Oppositions-Referent: Was plant die Regierung, wo ist die politische Lücke, was sollte der Nutzer tun?
- Vermeide generische Wörter wie "relevant", "wichtig" oder "beobachten", wenn du nicht konkret erklärst warum.
- Jede Empfehlung muss Ausschuss, Mandatsprofil, Quelle oder Bundesregierungsvorhaben konkret verbinden.
- Gib ausschließlich valides JSON zurück.

JSON Felder:
{
  "whyItMatters": "Warum betrifft dich das?",
  "whyNow": "Warum heute?",
  "recommendedAction": "Was solltest du konkret tun?",
  "inactionConsequence": "Was passiert, wenn du nichts tust?",
  "riskNote": "Risiko in einem Satz",
  "opportunityNote": "Chance in einem Satz",
  "recommendedPreparation": "Konkrete Vorbereitung",
  "suggestedStatement": "2 kurze Sätze, direkt nutzbar"
}

Kontext:
${JSON.stringify(payload, null, 2)}
`;
  return requestJson(prompt);
}

const communicationChannels = {
  press: {
    label: "Presse-Statement",
    length: "90 bis 130 Woerter, 2 kurze Absaetze",
    tone: "zitierfaehig, ruhig, politisch klar",
    format: "Ein pressetaugliches Statement ohne Hashtags."
  },
  linkedin: {
    label: "LinkedIn",
    length: "650 bis 900 Zeichen, 2 Absaetze",
    tone: "fachlich, zugänglich, kompetent",
    format: "Ein Beitrag mit klarer Haltung und einem konkreten Schlusssatz."
  },
  x: {
    label: "X",
    length: "maximal 240 Zeichen",
    tone: "pointiert, sachlich, teilbar",
    format: "Ein einzelner kurzer Post. Keine Thread-Markierung."
  },
  instagram: {
    label: "Instagram",
    length: "450 bis 700 Zeichen",
    tone: "menschlich, direkt, weniger technisch",
    format: "Eine Caption mit verständlicher politischer Botschaft, maximal 3 Hashtags."
  },
  committee_question: {
    label: "Ausschussfrage",
    length: "2 bis 3 praezise Fragen",
    tone: "fachlich, kontrollierend, parlamentarisch",
    format: "Nur Fragen, keine Einleitung."
  },
  citizen_dialogue: {
    label: "Bürgerdialog",
    length: "80 bis 120 Woerter",
    tone: "verständlich, nahbar, respektvoll",
    format: "Antwort an Bürgerinnen und Bürger ohne Fachjargon."
  },
  internal_line: {
    label: "Interne Linie",
    length: "5 kurze Bulletpoints",
    tone: "knapp, operativ, buerotauglich",
    format: "Nur interne Stichpunkte fuer das Team."
  }
};

async function generateCommunicationDraft({ prompt, decision, profile, channel }) {
  const channelSpec = communicationChannel(channel);
  if (!isAiEnabled()) {
    return {
      aiEnabled: false,
      channel: channelSpec.id,
      channelLabel: channelSpec.label,
      text: fallbackStatement(decision, channelSpec),
      sourceNote: "Regelbasiert erzeugt, weil kein OPENAI_API_KEY gesetzt ist."
    };
  }

  const payload = {
    prompt: String(prompt || "").slice(0, 1200),
    channel: channelSpec,
    profile: publicProfile(profile),
    decision: publicDecision(decision)
  };
  const aiPrompt = `
Du bist Helmut, der persönliche politische Stabschef des Nutzers.
Erzeuge einen Kommunikationsvorschlag fuer den Kanal: ${channelSpec.label}.

Regeln:
- Der Text muss exakt zum Kanal passen.
- Laenge: ${channelSpec.length}.
- Ton: ${channelSpec.tone}.
- Format: ${channelSpec.format}.
- Der veröffentlichbare Text selbst darf ohne "du" formuliert sein.
- Keine unbelegten Behauptungen.
- Keine Fakten außerhalb der Quellenbasis.
- Beziehe dich auf Ausschuss, Partei oder Thema nur, wenn es aus dem Kontext ableitbar ist.
- Keine Floskeln wie "Wir muessen reden".
- Kein KI-Ton, kein generischer Pressesprech.
- Oppositionslogik mitdenken: Bundesregierung konkret messen, Lücke benennen, Forderung oder Frage präzise formulieren.
- Der Text muss nach einem Menschen klingen: klare Sätze, kein Abstract, keine Phrasen.
- Gib ausschließlich valides JSON zurück.

JSON:
{
  "text": "veröffentlichbarer Text",
  "rationale": "kurz, warum diese Linie und Laenge zum Kanal passt"
}

Kontext:
${JSON.stringify(payload, null, 2)}
`;
  const result = await requestJson(aiPrompt);
  return {
    aiEnabled: true,
    model: modelName(),
    channel: channelSpec.id,
    channelLabel: channelSpec.label,
    text: String(result.text || fallbackStatement(decision, channelSpec)).trim(),
    rationale: String(result.rationale || "").trim(),
    sourceNote: "Basiert auf Briefing, Mandatsprofil und Quellenbasis."
  };
}

async function generateHelmutAssessment({ briefing, profile }) {
  const fallback = fallbackHelmutAssessment(briefing, profile);
  if (!isAiEnabled()) {
    return {
      ...fallback,
      aiEnabled: false,
      sourceNote: "Regelbasiert erzeugt, weil kein OPENAI_API_KEY gesetzt ist."
    };
  }

  const payload = publicHelmutAssessmentPayload(briefing, profile);
  const prompt = `
Du bist Helmut, der persoenliche politische Stabschef des Nutzers.
Du formulierst eine kurze persoenliche Einschätzung auf Basis eines bereits priorisierten Briefings.

Produktregel:
- Lage zeigt Fakten. Helmut trifft eine Entscheidung.
- Wiederhole keine Nachrichtenliste.
- Beantworte die Frage: "Hat sich meine Priorität geändert?"
- Wenn nichts Neues passiert ist, sage nicht "keine Informationen", sondern: "Deine Prioritäten haben sich aktuell nicht verändert."
- Maximal 120 bis 180 Woerter insgesamt.
- Direkte Ansprache mit "du".
- Kein Chatbot-Ton, keine dritte Person, keine Spekulation.
- Keine Fakten außerhalb des Kontextes.
- Wenn die Quellenlage schwach ist, vorsichtig formulieren.
- Schreibe ruhig, klar, wie ein erfahrener Referent.
- Gib ausschließlich valides JSON zurück.

JSON:
{
  "greeting": "Guten Abend, Cem.",
  "priorityStatus": "stable | changed | risk | chance",
  "assessment": "Persoenliche Einschätzung in 2 bis 3 Sätzen",
  "recommendation": "Konkrete Empfehlung in 1 bis 2 Sätzen",
  "whyImportant": "Warum ist das fuer dich wichtig?",
  "risk": "Was passiert, wenn du nicht reagierst?",
  "typingText": "Ein zusammenhaengender Text, der beim Oeffnen geschrieben werden kann"
}

Kontext:
${JSON.stringify(payload, null, 2)}
`;

  try {
    const result = await requestJson(prompt);
    return normalizeHelmutAssessment(result, fallback);
  } catch (error) {
    console.warn("Helmut assessment generation failed", error.message);
    return {
      ...fallback,
      aiEnabled: true,
      model: modelName(),
      sourceNote: "Regelbasierter Fallback, weil die KI-Einschätzung nicht erzeugt werden konnte."
    };
  }
}

function requestJson(prompt) {
  return requestOpenAI(prompt).then((text) => parseJsonText(text));
}

function requestOpenAI(prompt, model = modelName()) {
  const body = JSON.stringify({
    model,
    input: prompt,
    temperature: 0.3,
    max_output_tokens: 900
  });

  return new Promise((resolve, reject) => {
    const request = https.request(
      OPENAI_API_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Length": Buffer.byteLength(body)
        },
        timeout: 20000
      },
      (response) => {
        let data = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          data += chunk;
        });
        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            if (response.statusCode === 400 && model !== FALLBACK_MODEL) {
              requestOpenAI(prompt, FALLBACK_MODEL).then(resolve, reject);
              return;
            }
            reject(new Error(`OpenAI HTTP ${response.statusCode}: ${data.slice(0, 300)}`));
            return;
          }
          try {
            const json = JSON.parse(data);
            resolve(extractOutputText(json));
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    request.on("timeout", () => request.destroy(new Error("OpenAI request timeout")));
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

function extractOutputText(response) {
  if (response.output_text) return response.output_text;
  const texts = [];
  for (const output of response.output || []) {
    for (const content of output.content || []) {
      if (content.type === "output_text" && content.text) texts.push(content.text);
    }
  }
  return texts.join("\n").trim();
}

function parseJsonText(text) {
  const clean = String(text || "").trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(clean);
  } catch (error) {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1));
    throw error;
  }
}

function pickBriefingFields(value) {
  const fields = [
    "whyItMatters",
    "whyNow",
    "recommendedAction",
    "inactionConsequence",
    "riskNote",
    "opportunityNote",
    "recommendedPreparation",
    "suggestedStatement"
  ];
  return Object.fromEntries(fields.filter((field) => typeof value[field] === "string" && value[field].trim()).map((field) => [field, value[field].trim()]));
}

function publicItemPayload(item, profile) {
  return {
    profile: publicProfile(profile),
    item: publicDecision(item)
  };
}

function publicProfile(profile) {
  return {
    fullName: profile.fullName,
    party: profile.party,
    faction: profile.faction,
    function: profile.function,
    committee: profile.committee,
    committees: profile.committees,
    constituency: profile.constituency,
    state: profile.state,
    location: profile.location,
    focusTopics: profile.focusTopics,
    topicPriorities: profile.topicPriorities,
    relevantMinistries: profile.relevantMinistries,
    communicationStyle: profile.communicationStyle,
    noGoTopics: profile.noGoTopics,
    mainQuestion: profile.mainQuestion
  };
}

function publicDecision(item) {
  return {
    title: item.title,
    decision: item.decision,
    summary: item.summary,
    whyItMatters: item.whyItMatters,
    whyNow: item.whyNow,
    recommendedAction: item.recommendedAction,
    inactionConsequence: item.inactionConsequence,
    riskNote: item.riskNote,
    opportunityNote: item.opportunityNote,
    suggestedStatement: item.suggestedStatement,
    confidence: item.confidence,
    sourceCount: item.sourceCount,
    sources: (item.sources || []).slice(0, 4).map((source) => ({
      sourceName: source.sourceName,
      sourceType: source.sourceType,
      publishedAt: source.publishedAt,
      excerpt: source.excerpt,
      confidence: source.confidence,
      relevanceReason: source.relevanceReason,
      url: directSourceUrl(source)
    }))
  };
}

function publicHelmutAssessmentPayload(briefing = {}, profile = {}) {
  const recommendations = (briefing.personalizedRecommendations || []).slice(0, 3).map(publicRecommendation);
  const items = (briefing.items || []).slice(0, 3).map(publicDecision);
  const situational = (briefing.situationalBriefing || []).slice(0, 2).map((item) => ({
    title: item.title,
    summary: item.summary,
    type: item.type || item.contextType,
    sourceName: item.sourceName,
    url: item.url || item.itemUrl || ""
  }));
  return {
    generatedAt: briefing.generatedAt || briefing.date,
    status: briefing.status,
    dayMode: briefing.dayMode,
    executiveSummary: briefing.executiveSummary,
    profile: publicProfile(profile),
    topRecommendations: recommendations,
    topBriefingItems: items,
    situationalBriefing: situational,
    personMentionCount: (briefing.personMentions || []).length,
    sourceStats: briefing.sourceStats || briefing.sourceRun || null,
    quality: briefing.quality || null
  };
}

function publicRecommendation(item = {}) {
  return {
    title: item.title,
    topic: item.topic,
    priority: item.priority,
    relevance_score: item.relevance_score,
    current_priority: item.current_priority,
    previous_priority: item.previous_priority,
    status_change: item.status_change,
    change_reason: item.change_reason,
    personal_relevance_explanation: item.personal_relevance_explanation,
    recommended_action: item.recommended_action,
    consequence_if_ignored: item.consequence_if_ignored,
    possible_upside: item.possible_upside,
    communication_recommendation: item.communication_recommendation,
    sourceStrength: item.sourceStrength,
    sourceBasis: item.sourceBasis,
    sources: (item.sources || []).slice(0, 3).map((source) => ({
      sourceName: source.sourceName,
      sourceType: source.sourceType,
      publishedAt: source.publishedAt,
      confidence: source.confidence,
      relevanceReason: source.relevanceReason,
      url: directSourceUrl(source)
    }))
  };
}

function directSourceUrl(source = {}) {
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

function normalizeHelmutAssessment(result = {}, fallback) {
  const generatedAt = new Date().toISOString();
  const normalized = {
    aiEnabled: true,
    model: modelName(),
    generatedAt,
    time: berlinTime(generatedAt),
    greeting: cleanAssessmentText(result.greeting) || fallback.greeting,
    priorityStatus: cleanAssessmentText(result.priorityStatus) || fallback.priorityStatus,
    assessment: cleanAssessmentText(result.assessment) || fallback.assessment,
    recommendation: cleanAssessmentText(result.recommendation) || fallback.recommendation,
    whyImportant: cleanAssessmentText(result.whyImportant) || fallback.whyImportant,
    risk: cleanAssessmentText(result.risk) || fallback.risk,
    sourceNote: "Basiert auf Briefing, Mandatsprofil, Quellenlage und Priorisierung."
  };
  normalized.typingText = cleanAssessmentText(result.typingText) || helmutTypingText(normalized);
  return normalized;
}

function fallbackHelmutAssessment(briefing = {}, profile = {}) {
  const generatedAt = new Date().toISOString();
  const firstName = String(profile.fullName || "Cem").split(" ")[0] || "Cem";
  const top = (briefing.personalizedRecommendations || [])[0] || (briefing.items || [])[0] || null;
  const topic = top?.title || briefing.themeOfDay?.title || (briefing.situationalBriefing || [])[0]?.title || "deine aktuelle Lage";
  const priorityStatus = top?.status_change && top.status_change !== "Unverändert"
    ? "changed"
    : top?.priority === "kritisch" || top?.priority === "sofort handeln"
      ? "risk"
      : top?.chance_fuer_nutzer >= top?.risiko_fuer_nutzer
        ? "chance"
        : "stable";
  const phase = assessmentPhase(new Date());
  const assessment = top
    ? `${phase.lead} ${topic} ist aktuell deine wichtigste Orientierung. ${top.change_reason || top.personal_relevance_explanation || "Die Lage berührt dein Mandatsprofil und kann politisch aufgegriffen werden."}`
    : `${phase.lead} Deine Prioritäten haben sich aktuell nicht verändert. Ich habe Quellen, Partei, Fraktion und Regierungsagenda geprüft; im Moment entsteht daraus kein akuter Reaktionsdruck.`;
  const recommendation = top
    ? top.recommended_action || "Bereite eine kurze Linie vor und entscheide danach, ob du öffentlich reagierst."
    : `Halte ${topic} vorbereitet, aber veröffentliche nichts ohne neuen Anlass.`;
  const whyImportant = top
    ? top.personal_relevance_explanation || top.whyItMatters || `Das betrifft dich, weil ${topic} an dein Mandatsprofil anschließt.`
    : "Das ist wichtig, weil Nicht-Reagieren manchmal die richtige politische Entscheidung ist, solange keine neue Dynamik entsteht.";
  const risk = top
    ? top.consequence_if_ignored || top.inactionConsequence || "Wenn du nicht reagierst, können andere Akteure die öffentliche Einordnung übernehmen."
    : "Wenn du ohne neuen Anlass reagierst, verbrauchst du Aufmerksamkeit, die du für stärkere Vorgänge brauchst.";
  const fallback = {
    aiEnabled: false,
    generatedAt,
    time: berlinTime(generatedAt),
    greeting: `${phase.greeting}, ${firstName}.`,
    priorityStatus,
    assessment: shortenTo(assessment, 430),
    recommendation: shortenTo(recommendation, 260),
    whyImportant: shortenTo(whyImportant, 240),
    risk: shortenTo(risk, 220)
  };
  fallback.typingText = helmutTypingText(fallback);
  return fallback;
}

function assessmentPhase(date) {
  const hour = Number(new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    hourCycle: "h23"
  }).format(date));
  if (hour >= 5 && hour < 10) return { greeting: "Guten Morgen", lead: "Heute zählt vor allem, was bis Mittag sprechfähig sein muss." };
  if (hour >= 10 && hour < 14) return { greeting: "Mahlzeit", lead: "Seit dem Morgen zählt, ob sich deine Priorität verändert hat." };
  if (hour >= 14 && hour < 18) return { greeting: "Guten Nachmittag", lead: "Jetzt zählt, ob vor Dienstschluss noch eine Linie vorbereitet werden muss." };
  if (hour >= 18 && hour < 23) return { greeting: "Guten Abend", lead: "Für heute zählt, was abgeschlossen und für morgen vorbereitet werden sollte." };
  return { greeting: "Guten Abend", lead: "Für morgen zählt, welche Linie vorbereitet sein sollte." };
}

function helmutTypingText(assessment) {
  return [
    assessment.greeting,
    assessment.assessment,
    `Mein Vorschlag: ${assessment.recommendation}`,
    `Warum wichtig: ${assessment.whyImportant}`,
    `Risiko bei Nichtreaktion: ${assessment.risk}`
  ].filter(Boolean).join("\n\n");
}

function cleanAssessmentText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function berlinTime(value = new Date().toISOString()) {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(new Date(value));
}

function communicationChannel(value) {
  const id = String(value || "press").trim();
  const spec = communicationChannels[id] || communicationChannels.press;
  return { id: communicationChannels[id] ? id : "press", ...spec };
}

function fallbackStatement(decision, channelSpec = communicationChannel("press")) {
  const base = decision?.suggestedStatement || decision?.statement || "Dazu liegt aktuell kein belastbarer Kommunikationsvorschlag vor.";
  const action = decision?.recommendedAction || decision?.action || "";
  const topic = decision?.title || decision?.topic || "dieses Thema";
  if (channelSpec.id === "x") return shortenTo(`${base} ${action}`.trim(), 240);
  if (channelSpec.id === "committee_question") {
    return [
      `Welche konkreten Schritte plant die Bundesregierung bei ${topic}?`,
      "Welche Wirkung auf gute Arbeit, soziale Sicherheit und Armutsvermeidung erwartet sie?",
      "Wann legt sie belastbare Zahlen und einen Zeitplan vor?"
    ].join("\n");
  }
  if (channelSpec.id === "internal_line") {
    return [
      `- Thema: ${topic}`,
      `- Linie: ${base}`,
      `- Nächster Schritt: ${action || "Position fachlich vorbereiten."}`,
      "- Quellenbasis prüfen und Zitat freigeben.",
      "- Bei Rückfragen: soziale Wirkung und Umsetzung betonen."
    ].join("\n");
  }
  if (channelSpec.id === "citizen_dialogue") return `${base} Wichtig ist, dass politische Entscheidungen im Alltag ankommen: bei Arbeit, sozialer Sicherheit und fairen Chancen.`;
  if (channelSpec.id === "instagram") return `${base}\n\nPolitik muss konkret besser machen, was Menschen jeden Tag betrifft. #Sozialstaat #GuteArbeit`;
  if (channelSpec.id === "linkedin") return `${base}\n\nFür Arbeit und Soziales zählt am Ende nicht die Ankündigung, sondern die konkrete Wirkung: bessere Arbeitsbedingungen, soziale Sicherheit und verlässliche Umsetzung.`;
  return `${base} ${action}`.trim();
}

function shortenTo(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).replace(/\s+\S*$/, "")}.`;
}

function buildAiAwareSummary(briefing) {
  const react = briefing.items.filter((item) => item.decision === "Sofort reagieren").length;
  const watch = briefing.items.filter((item) => item.decision === "Beobachten").length;
  const ignore = briefing.items.filter((item) => item.decision === "Ignorieren").length;
  const theme = briefing.themeOfDay;
  return `${currentBerlinGreeting()} Heute solltest du auf ${react} Themen reagieren, ${watch} beobachten und ${ignore} ignorieren. Dein wichtigstes Thema ist: ${theme.title}. ${theme.recommendedAction}`;
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

function modelName() {
  return process.env.HELMUT_TEXT_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL;
}

module.exports = {
  enrichBriefingWithAI,
  generateCommunicationDraft,
  generateHelmutAssessment,
  communicationChannels,
  isAiEnabled
};
