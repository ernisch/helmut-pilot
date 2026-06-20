const https = require("https");

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const OPENAI_SPEECH_URL = "https://api.openai.com/v1/audio/speech";
const DEFAULT_MODEL = "gpt-4.1";
const DEFAULT_TTS_MODEL = "gpt-4o-mini-tts";

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

async function generateCommunicationDraft({ prompt, decision, profile }) {
  if (!isAiEnabled()) {
    return {
      aiEnabled: false,
      text: fallbackStatement(decision),
      sourceNote: "Regelbasiert erzeugt, weil kein OPENAI_API_KEY gesetzt ist."
    };
  }

  const payload = {
    prompt: String(prompt || "").slice(0, 1200),
    profile: publicProfile(profile),
    decision: publicDecision(decision)
  };
  const aiPrompt = `
Du bist Helmut, der persönliche politische Stabschef des Nutzers.
Erzeuge einen Kommunikationsvorschlag.

Regeln:
- Du-Form intern, aber der veröffentlichbare Text selbst darf ohne "du" formuliert sein.
- 2 bis 3 Sätze.
- Keine unbelegten Behauptungen.
- Keine Fakten außerhalb der Quellenbasis.
- Politisch klar, sachlich, nutzbar für Social Media oder Presse.
- Gib ausschließlich valides JSON zurück.

JSON:
{
  "text": "veröffentlichbarer Text",
  "rationale": "kurz, warum diese Linie passt"
}

Kontext:
${JSON.stringify(payload, null, 2)}
`;
  const result = await requestJson(aiPrompt);
  return {
    aiEnabled: true,
    model: modelName(),
    text: String(result.text || fallbackStatement(decision)).trim(),
    rationale: String(result.rationale || "").trim(),
    sourceNote: "Basiert auf Briefing, Mandatsprofil und Quellenbasis."
  };
}

async function generateSpeechAudio({ text, voicePreference }) {
  if (!isAiEnabled()) throw new Error("OPENAI_API_KEY missing");
  const input = String(text || "").replace(/\s+/g, " ").trim().slice(0, 1800);
  if (!input) throw new Error("No speech text provided");

  const voice = speechVoice(voicePreference);
  const body = JSON.stringify({
    model: speechModelName(),
    voice,
    input,
    instructions: speechInstructions(voicePreference),
    response_format: "mp3"
  });

  const buffer = await requestOpenAIBuffer(OPENAI_SPEECH_URL, body, 30000);
  return {
    buffer,
    contentType: "audio/mpeg",
    model: speechModelName(),
    voice
  };
}

function requestJson(prompt) {
  return requestOpenAI(prompt).then((text) => parseJsonText(text));
}

function requestOpenAI(prompt) {
  const body = JSON.stringify({
    model: modelName(),
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

function requestOpenAIBuffer(url, body, timeout) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Length": Buffer.byteLength(body)
        },
        timeout
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => {
          chunks.push(Buffer.from(chunk));
        });
        response.on("end", () => {
          const data = Buffer.concat(chunks);
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`OpenAI speech HTTP ${response.statusCode}: ${data.toString("utf8").slice(0, 300)}`));
            return;
          }
          resolve(data);
        });
      }
    );
    request.on("timeout", () => request.destroy(new Error("OpenAI speech request timeout")));
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
      url: source.itemUrl || source.url || source.sourceUrl
    }))
  };
}

function fallbackStatement(decision) {
  return decision?.suggestedStatement || decision?.statement || "Dazu liegt aktuell kein belastbarer Kommunikationsvorschlag vor.";
}

function buildAiAwareSummary(briefing) {
  const react = briefing.items.filter((item) => item.decision === "Sofort reagieren").length;
  const watch = briefing.items.filter((item) => item.decision === "Beobachten").length;
  const ignore = briefing.items.filter((item) => item.decision === "Ignorieren").length;
  const theme = briefing.themeOfDay;
  return `Guten Morgen. Heute solltest du auf ${react} Themen reagieren, ${watch} beobachten und ${ignore} ignorieren. Dein wichtigstes Thema ist: ${theme.title}. ${theme.recommendedAction}`;
}

function modelName() {
  return process.env.OPENAI_MODEL || DEFAULT_MODEL;
}

function speechModelName() {
  return process.env.OPENAI_TTS_MODEL || DEFAULT_TTS_MODEL;
}

function speechVoice(preference) {
  const value = String(preference || "").toLowerCase();
  if (value.includes("frau") || value.includes("female") || value.includes("marin")) return "marin";
  return "cedar";
}

function speechInstructions(preference) {
  const value = String(preference || "").toLowerCase();
  const isFemale = value.includes("frau") || value.includes("female") || value.includes("marin");
  const role = isFemale ? "eine erfahrene politische Stabschefin" : "ein erfahrener politischer Stabschef";
  return [
    `Sprich auf Deutsch wie ${role}.`,
    "Natürlich, ruhig, warm und präzise.",
    "Nicht wie ein Roboter, nicht wie ein Nachrichtensprecher, nicht werblich.",
    "Setze kurze Pausen zwischen den Empfehlungen.",
    "Mittleres Tempo, souveräne Betonung, vertraulicher Morgenbriefing-Ton."
  ].join(" ");
}

module.exports = {
  enrichBriefingWithAI,
  generateSpeechAudio,
  generateCommunicationDraft,
  isAiEnabled
};
