const https = require("https");

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.5";
const FALLBACK_MODEL = "gpt-4.1";
// SICHERHEIT: harte Obergrenze fuer akkumulierte LLM-Antwort-Bodies (Defense-in-Depth
// gegen eine fehlerhafte/kompromittierte Upstream-Antwort ohne Ende — der bestehende
// 20s-Timeout deckt nur die Gesamtdauer ab, keine Groesse).
const MAX_AI_RESPONSE_BYTES = 8 * 1024 * 1024;


// GPT-5- und o-Reihe sind Reasoning-Modelle: akzeptieren nur die Standard-
// Temperatur und verbrauchen Reasoning-Tokens, brauchen also mehr Output-Budget.
function isReasoningModel(model) {
  return /^(gpt-5|o\d)/i.test(String(model || ""));
}

function isAzure() {
  return Boolean(process.env.AZURE_OPENAI_KEY && process.env.AZURE_OPENAI_ENDPOINT);
}

function isAiEnabled() {
  return isAzure() || Boolean(process.env.OPENAI_API_KEY);
}

// Nur der Provider-NAME (kein Secret) — fuer Diagnose/Backfill-Report sichtbar.
function aiProviderName() {
  if (isAzure()) return "azure";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "none";
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
  return requestJson(prompt, { callType: "refineBriefingItem", politicianId: profile?.id });
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

async function generateCommunicationDraft({ prompt, decision, profile, channel, learningProfile }) {
  const channelSpec = communicationChannel(channel);
  if (!isAiEnabled()) {
    return {
      aiEnabled: false,
      degraded: true,
      fallbackReason: "kein-ki-schluessel",
      channel: channelSpec.id,
      channelLabel: channelSpec.label,
      text: fallbackStatement(decision, channelSpec),
      sourceNote: "Regelbasiert erzeugt, weil kein OPENAI_API_KEY gesetzt ist."
    };
  }

  // KOSTENSCHUTZ (Audit-Fix 2026-07): Der Kommunikations-/Entwurfspfad war der
  // einzige produktive LLM-Pfad OHNE Budget-Gate (nur IP-Rate-Limit) — bis zu
  // 16 Calls pro App-Start. Jetzt gelten hier dieselben Deckel wie beim
  // Lage-Narrativ: globales Tageslimit + optionales per-Mandant-EUR-Budget aus
  // dem Profil. Bei erschoepftem Budget: ehrlicher Regel-Fallback, KEIN LLM-Call;
  // der Skip wird als Info-Eintrag protokolliert (zaehlt nicht als billable).
  try {
    const storage = require("./storage");
    const tenantBudgets = {
      dailyBudgetCent: profile && profile.aiBudgetDailyCents != null ? Number(profile.aiBudgetDailyCents) : null,
      monthlyBudgetCent: profile && profile.aiBudgetMonthlyCents != null ? Number(profile.aiBudgetMonthlyCents) : null
    };
    const budget = await storage.canSpendLlmForTenant(profile?.id || null, tenantBudgets);
    if (!budget || !budget.allowed) {
      logLlmUsage({ callType: "skipped-communicationDraft", politicianId: profile?.id, success: false, error: (budget && budget.reason) || "budget" });
      return {
        aiEnabled: false,
        degraded: true,
        fallbackReason: "budget-erschoepft",
        budgetReason: (budget && budget.reason) || null,
        channel: channelSpec.id,
        channelLabel: channelSpec.label,
        text: fallbackStatement(decision, channelSpec),
        sourceNote: "Regelbasiert erzeugt, weil das KI-Tagesbudget erreicht ist."
      };
    }
  } catch (_) {
    // Unerwarteter Fehler der Budget-PRUEFUNG (nicht des Budgets): wie im
    // Lage-Pfad weiterlaufen lassen — die fail-open/fail-closed-Entscheidung
    // fuer Storage-Fehler trifft bereits canSpendLlm/llmBudgetFailResult zentral.
  }

  const payload = {
    prompt: String(prompt || "").slice(0, 1200),
    channel: channelSpec,
    profile: publicProfile(profile),
    decision: publicDecision(decision),
    ...(learningProfile && learningProfile.eventCount >= 5 ? { lernprofil: compactLearningProfile(learningProfile) } : {})
  };
  const lernhinweis = learningProfile && learningProfile.eventCount >= 5
    ? `\n- Lernprofil beachten: Passe Ton und Schwerpunkt an die gelernten Präferenzen an, ohne sie explizit zu erwähnen.`
    : "";
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
- Der Text muss nach einem Menschen klingen: klare Sätze, kein Abstract, keine Phrasen.${lernhinweis}
- Gib ausschließlich valides JSON zurück.

JSON:
{
  "text": "veröffentlichbarer Text",
  "rationale": "kurz, warum diese Linie und Laenge zum Kanal passt"
}

Kontext:
${JSON.stringify(payload, null, 2)}
`;
  // PRODUKTWAHRHEIT (Audit-Fix 2026-07): Ein KI-Fehler oder eine unbrauchbare
  // KI-Antwort darf NIE als KI-Entwurf ausgegeben werden. Der Aufrufer erhält in
  // beiden Fällen einen ehrlich gekennzeichneten regelbasierten Fallback
  // (aiEnabled=false, degraded=true, fallbackReason) statt eines 500ers — der
  // Client kann den Zustand anzeigen, ohne selbst still zu ersetzen.
  let result;
  try {
    result = await requestJson(aiPrompt, { callType: "communicationDraft", politicianId: profile?.id });
  } catch (error) {
    return {
      aiEnabled: false,
      degraded: true,
      fallbackReason: "ki-fehler",
      channel: channelSpec.id,
      channelLabel: channelSpec.label,
      text: fallbackStatement(decision, channelSpec),
      sourceNote: `Regelbasiert erzeugt, weil die KI nicht erreichbar war (${String(error && error.message || "Fehler").slice(0, 120)}).`
    };
  }
  const aiText = String(result.text || "").trim();
  if (!aiText) {
    return {
      aiEnabled: false,
      degraded: true,
      fallbackReason: "ki-antwort-leer",
      channel: channelSpec.id,
      channelLabel: channelSpec.label,
      text: fallbackStatement(decision, channelSpec),
      sourceNote: "Regelbasiert erzeugt, weil die KI keinen verwendbaren Text geliefert hat."
    };
  }
  return {
    aiEnabled: true,
    model: modelName(),
    channel: channelSpec.id,
    channelLabel: channelSpec.label,
    text: aiText,
    rationale: String(result.rationale || "").trim(),
    sourceNote: "Basiert auf Briefing, Mandatsprofil und Quellenbasis."
  };
}

async function assessParliamentaryItem({ item = {}, profile = {} }) {
  const fallback = {
    whyRelevant: `Betrifft ${item.type || "einen Vorgang"} im Themenfeld deines Mandats.`,
    recommendedAction: "Dokument prüfen und entscheiden, ob eine Reaktion (Stellungnahme, Frage oder Wortbeitrag) sinnvoll ist."
  };
  if (!isAiEnabled()) return { aiEnabled: false, ...fallback };
  const prompt = `
Du bist Helmut, der persönliche politische Stabschef des Nutzers.
Bewerte kurz diesen offiziellen Bundestags-Vorgang fuer das Mandat.

Vorgang:
- Typ: ${item.type || ""}
- Titel: ${item.title || ""}
- Urheber: ${(item.urheber || []).join(", ")}
- Datum: ${item.date || ""}

Mandatsprofil:
${JSON.stringify(publicProfile(profile), null, 2)}

Regeln:
- Kurz, konkret, kein KI-Ton, klingt wie ein Mensch.
- "whyRelevant": genau 1 Satz, bezogen auf Ausschuss, Themen oder politische Linie des Mandats.
- "recommendedAction": 1 konkreter naechster Schritt (z. B. Stellungnahme, Kleine Anfrage, Wortbeitrag im Plenum, im Ausschuss ansprechen, beobachten/abwarten).
- Keine unbelegten Behauptungen. Nur valides JSON.

JSON:
{ "whyRelevant": "...", "recommendedAction": "..." }
`;
  try {
    const result = await requestJson(prompt, { callType: "parliamentAssessment", politicianId: profile?.id });
    return {
      aiEnabled: true,
      model: modelName(),
      whyRelevant: String(result.whyRelevant || fallback.whyRelevant).trim(),
      recommendedAction: String(result.recommendedAction || fallback.recommendedAction).trim()
    };
  } catch (error) {
    console.error("Parliament assessment failed", error);
    return { aiEnabled: true, ...fallback };
  }
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
  // Anrede aus dem Profil ableiten (kein hardcodierter Name). Ohne Namen: neutral.
  const firstName = String(profile?.fullName || "").split(" ")[0] || "";
  const greetingExample = firstName ? `Guten Abend, ${firstName}.` : "Guten Abend.";
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

Hero-Felder (werden direkt und ungekuerzt angezeigt — kein Fliesstext):
- heroWhy: max. 6 Woerter, Aussagesatz, kein "Weil"-Einstieg. Beispiel: "Betrifft deine Kernthemen direkt."
- heroRisk: max. 7 Woerter, Aussagesatz, kein "Wenn du"-Einstieg. Beispiel: "Deutungshoheit droht verloren zu gehen."
- heroNextStep: max. 4 Woerter, Infinitiv-Phrase. Beispiel: "Gegenlinie vorbereiten."

JSON:
{
  "greeting": ${JSON.stringify(greetingExample)},
  "priorityStatus": "stable | changed | risk | chance",
  "assessment": "Persoenliche Einschätzung in 2 bis 3 Sätzen",
  "recommendation": "Konkrete Empfehlung in 1 bis 2 Saetzen (fuer Detailbereich)",
  "whyImportant": "Ausfuehrliche Begruendung in 2 bis 3 Saetzen (fuer Detailbereich)",
  "risk": "Ausfuehrliche Risikoerlaeuterung in 1 bis 2 Saetzen (fuer Detailbereich)",
  "heroWhy": "Kernsatz max. 6 Woerter (kein Weil-Einstieg)",
  "heroRisk": "Risikostatement max. 7 Woerter (kein Wenn-Einstieg)",
  "heroNextStep": "Infinitiv-Phrase max. 4 Woerter",
  "typingText": "Ein zusammenhaengender Text, der beim Oeffnen geschrieben werden kann"
}

Kontext:
${JSON.stringify(payload, null, 2)}
`;

  try {
    const result = await requestJson(prompt, { callType: "helmutAssessment", politicianId: profile?.id });
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

function requestJson(prompt, meta = {}, model = modelName()) {
  return requestOpenAI(prompt, model, meta).then((text) => parseJsonText(text));
}

// V3 (C7): strukturierte JSON-Ausgabe gegen ein Schema erzwingen. meta traegt NUR
// nicht-inhaltliche Felder (callType/politicianId) — es werden KEINE Prompt- oder
// Antwortinhalte geloggt (siehe logLlmUsage/recordLlmUsage).
function requestStructuredJson(prompt, jsonSchema, meta = {}, model = modelName()) {
  return requestOpenAI(prompt, model, meta, { jsonSchema, jsonSchemaName: "knowledge_object", maxOutputTokens: 3000 })
    .then((text) => parseJsonText(text));
}

// Modell fuer den globalen Understanding-Call. Auf Azure das konfigurierte
// Deployment (gpt-5-mini); sonst per Env, Default gpt-5-mini.
function understandingModelName() {
  if (isAzure()) return modelName();
  return process.env.HELMUT_UNDERSTANDING_MODEL || "gpt-5-mini";
}

// V3 (C9): Freier-Text-Output fuer Buero-Engine (Rede, PM, Social, ...).
// meta traegt NUR nicht-inhaltliche Felder — kein Prompt, kein userId, keine Antwort.
function requestText(prompt, meta = {}, opts = {}) {
  const m = opts.model || modelName();
  return requestOpenAI(prompt, m, meta, { maxOutputTokens: opts.maxOutputTokens || 1500 });
}

// Fire-and-forget-Logging jedes LLM-Calls (Kosten/Token/Dauer). Lazy require,
// damit Ladereihenfolge/Zyklen egal sind; ein Logging-Fehler darf den LLM-Pfad
// niemals beeintraechtigen.
function logLlmUsage(info) {
  try {
    const storage = require("./storage");
    if (storage && typeof storage.recordLlmUsage === "function") {
      Promise.resolve(storage.recordLlmUsage(info)).catch(() => {});
    }
  } catch (_) { /* ignore */ }
}

function requestOpenAI(prompt, model = modelName(), meta = {}, options = {}) {
  const reasoning = isReasoningModel(model);
  const payload = {
    model,
    input: prompt,
    max_output_tokens: options.maxOutputTokens || (reasoning ? 2500 : 900)
  };
  if (reasoning) {
    // Minimaler Reasoning-Aufwand: schnell, günstig, und das Token-Budget geht
    // an die sichtbare Antwort statt an verborgene Reasoning-Tokens.
    payload.reasoning = { effort: "minimal" };
  } else {
    // Reasoning-Modelle (gpt-5*, o*) erlauben nur die Standard-Temperatur.
    payload.temperature = options.temperature != null ? options.temperature : 0.3;
  }
  // Strukturierte JSON-Ausgabe erzwingen (Responses-API: text.format json_schema).
  // Additiv: bestehende Aufrufer (ohne options) sind unveraendert. strict=false, weil
  // wir zusaetzlich selbst gegen den Validator pruefen (die eigentliche Absicherung).
  if (options.jsonSchema) {
    payload.text = {
      format: {
        type: "json_schema",
        name: options.jsonSchemaName || "structured_output",
        schema: options.jsonSchema,
        strict: false
      }
    };
  }
  const body = JSON.stringify(payload);

  const apiUrl = isAzure()
    ? `${process.env.AZURE_OPENAI_ENDPOINT}/openai/v1/responses`
    : OPENAI_API_URL;
  const authHeader = isAzure()
    ? { "api-key": process.env.AZURE_OPENAI_KEY }
    : { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` };

  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const request = https.request(
      apiUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
          "Content-Length": Buffer.byteLength(body)
        },
        timeout: 20000
      },
      (response) => {
        let data = "";
        let receivedBytes = 0;
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          receivedBytes += Buffer.byteLength(chunk, "utf8");
          if (receivedBytes > MAX_AI_RESPONSE_BYTES) {
            response.destroy();
            reject(new Error("AI response too large"));
            return;
          }
          data += chunk;
        });
        response.on("end", () => {
          const durationMs = Date.now() - startedAt;
          if (response.statusCode < 200 || response.statusCode >= 300) {
            // Modell-Fallback nur bei OpenAI direkt — auf Azure ist nur das
            // konfigurierte Deployment vorhanden, ein Modellwechsel scheitert dort.
            // Hier NICHT loggen: der delegierte Retry loggt seinen eigenen Versuch.
            if (response.statusCode === 400 && !isAzure() && model !== FALLBACK_MODEL) {
              requestOpenAI(prompt, FALLBACK_MODEL, meta).then(resolve, reject);
              return;
            }
            // DSGVO: NUR Statuscode ins persistente llm_usage-Log — NIE der rohe
            // Antwort-Body (koennte KI-Inhalt/PII enthalten). Der (ephemere) reject-
            // Error darf zum Debuggen mehr tragen; er wird nicht persistiert.
            logLlmUsage({
              ...meta, model, durationMs, success: false,
              error: `${isAzure() ? "Azure" : "OpenAI"} HTTP ${response.statusCode}`
            });
            // SICHERHEIT: KEIN roher Antwort-Body mehr in der Error.message — dieser
            // Error ist NICHT rein ephemer/nur fuers Server-Log (Annahme oben war falsch):
            // ai.js:~373 reicht error.message als "reason" in ein gespeichertes und an den
            // Client ausgeliefertes Briefing durch. Ein Azure/OpenAI-Fehlerbody kann u.U.
            // Content-Filter-Details oder interne Diagnosen enthalten, die kein Endnutzer
            // sehen soll.
            reject(new Error(`${isAzure() ? "Azure" : "OpenAI"} HTTP ${response.statusCode}`));
            return;
          }
          try {
            const json = JSON.parse(data);
            // usage-Block der Responses-API auslesen; fehlt er, loggt recordLlmUsage "unknown".
            logLlmUsage({ ...meta, model, usage: json.usage, durationMs, success: true });
            resolve(extractOutputText(json));
          } catch (error) {
            // DSGVO: Parse-Fehlermeldungen koennen Antwortfragmente enthalten ->
            // nur eine generische Kategorie persistieren, nie error.message.
            logLlmUsage({ ...meta, model, durationMs, success: false, error: "response-parse-error" });
            reject(error);
          }
        });
      }
    );
    request.on("timeout", () => request.destroy(new Error("OpenAI request timeout")));
    request.on("error", (error) => {
      // DSGVO: nur der symbolische Node-Fehlercode (z. B. ECONNREFUSED) — kein
      // roher error.message (koennte URLs/Request-Zustand tragen).
      logLlmUsage({ ...meta, model, durationMs: Date.now() - startedAt, success: false, error: error && error.code ? `request-error:${String(error.code)}` : "request-error" });
      reject(error);
    });
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

// Letzte Rettung fuer LLM-Antworten mit ROHEN Steuerzeichen in JSON-Strings:
// JSON verbietet unescaped U+0000-U+001F in String-Literalen, Modelle liefern aber
// gelegentlich echte Zeilenumbrueche mitten im Wert -> "Bad control character in
// string literal" (real in Production beobachtet, generateCommunicationDraft).
// Kleiner Zustandsscanner: ersetzt Steuerzeichen NUR INNERHALB von String-Literalen
// durch die korrekte Escape-Sequenz; Struktur-Whitespace zwischen Tokens bleibt
// unveraendert. Fuer bereits gueltiges JSON ist die Funktion ein No-op.
function escapeControlCharsInJsonStrings(text) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of String(text || "")) {
    if (inString) {
      if (escaped) { out += ch; escaped = false; continue; }
      if (ch === "\\") { out += ch; escaped = true; continue; }
      if (ch === '"') { out += ch; inString = false; continue; }
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        out += ch === "\n" ? "\\n" : ch === "\r" ? "\\r" : ch === "\t" ? "\\t" : `\\u${code.toString(16).padStart(4, "0")}`;
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"') inString = true;
    out += ch;
  }
  return out;
}

function parseJsonText(text) {
  const clean = String(text || "").trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(clean);
  } catch (error) {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const sliced = clean.slice(start, end + 1);
      try {
        return JSON.parse(sliced);
      } catch {
        return JSON.parse(escapeControlCharsInJsonStrings(sliced));
      }
    }
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

// SICHERHEIT: analog zu understanding.js' cleanEntry — Freitextfelder vor dem Prompt
// deckeln. Diese Felder sind zwar bereits regelbasiert/KI-veredelt (nicht roher
// Crawler-Input), aber ohne Kappung koennte ein ueberlanger Wert unverhaeltnismaessig
// viel Gewicht im Prompt bekommen, der einen extern veroeffentlichbaren Kommunikations-
// entwurf erzeugt (generateCommunicationDraft).
function capText(value, max = 800) {
  const text = String(value ?? "");
  return text.length > max ? text.slice(0, max) : text;
}

function publicDecision(item) {
  return {
    title: capText(item.title, 200),
    decision: item.decision,
    summary: capText(item.summary),
    whyItMatters: capText(item.whyItMatters),
    whyNow: capText(item.whyNow),
    recommendedAction: capText(item.recommendedAction),
    inactionConsequence: capText(item.inactionConsequence),
    riskNote: capText(item.riskNote),
    opportunityNote: capText(item.opportunityNote),
    suggestedStatement: capText(item.suggestedStatement),
    confidence: item.confidence,
    sourceCount: item.sourceCount,
    sources: (item.sources || []).slice(0, 4).map((source) => ({
      sourceName: capText(source.sourceName, 200),
      sourceType: source.sourceType,
      publishedAt: source.publishedAt,
      excerpt: capText(source.excerpt, 240),
      confidence: source.confidence,
      relevanceReason: capText(source.relevanceReason),
      url: directSourceUrl(source)
    }))
  };
}

function compactLearningProfile(lp) {
  const pos = (lp.topicWeights || []).filter((e) => e.score > 0).slice(0, 5).map((e) => e.label);
  const neg = (lp.topicWeights || []).filter((e) => e.score < 0).slice(0, 3).map((e) => e.label);
  const channels = (lp.actionWeights || []).filter((e) => e.score > 0).slice(0, 3).map((e) => e.label);
  const keywords = (lp.keywordWeights || []).filter((e) => e.score > 0).slice(0, 6).map((e) => e.label);
  return {
    vertrauen: lp.confidence,
    bevorzugteThemen: pos,
    gemiedeneThemen: neg,
    bevorzugteKanaele: channels,
    schluesselbegriffe: keywords
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
    heroWhy: cleanAssessmentText(result.heroWhy) || "",
    heroRisk: cleanAssessmentText(result.heroRisk) || "",
    heroNextStep: cleanAssessmentText(result.heroNextStep) || "",
    sourceNote: "Basiert auf Briefing, Mandatsprofil, Quellenlage und Priorisierung."
  };
  normalized.typingText = cleanAssessmentText(result.typingText) || helmutTypingText(normalized);
  return normalized;
}

function fallbackHelmutAssessment(briefing = {}, profile = {}) {
  const generatedAt = new Date().toISOString();
  const firstName = String(profile.fullName || "").split(" ")[0] || "";
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
    greeting: firstName ? `${phase.greeting}, ${firstName}.` : `${phase.greeting}.`,
    priorityStatus,
    assessment: shortenTo(assessment, 430),
    recommendation: shortenTo(recommendation, 260),
    whyImportant: shortenTo(whyImportant, 240),
    risk: shortenTo(risk, 220),
    heroWhy: "",
    heroRisk: "",
    heroNextStep: ""
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
  if (hour >= 23) return { greeting: "Guten Abend", lead: "Für morgen zählt, welche Linie vorbereitet sein sollte." };
  return { greeting: "Guten Morgen", lead: "Für heute zählt, welche Linie vorbereitet sein sollte." };
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
  if (hour >= 18) return "Guten Abend.";
  return "Guten Morgen.";
}

function modelName() {
  if (isAzure()) return process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-5-mini";
  return process.env.HELMUT_TEXT_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL;
}

// ─────────────────────────────────────────────────────────────────────────
// Lage-Briefing-Generator: das politische Morgen-Briefing des Referenten.
// Erzeugt AUSSCHLIESSLICH aus den bereits analysierten Vorgaengen (knowledge_
// objects) einen ruhigen, sachlichen Fliesstext (max 250 Woerter) im Ton eines
// wissenschaftlichen Mitarbeiters. KEINE Empfehlung/Bewertung/Priorisierung.
// Jeder Absatz referenziert die vorgang_ids seiner Quellenbasis. Bei KI-Ausfall:
// null (KEIN Fake-Briefing) — der Aufrufer zeigt dann nur die Vorgaenge.
// ─────────────────────────────────────────────────────────────────────────
const LAGE_BRIEFING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["paragraphs"],
  properties: {
    paragraphs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "vorgang_ids"],
        properties: {
          text: { type: "string" },
          vorgang_ids: { type: "array", items: { type: "string" } }
        }
      }
    }
  }
};

function buildLageBriefingPrompt(vorgaenge, profile = {}) {
  const ausschuss = (Array.isArray(profile.committees) && profile.committees[0]) || profile.committee || "";
  const bloecke = (vorgaenge || []).map((v) => {
    const teile = [
      v.headline ? `Titel: ${v.headline}` : "",
      v.was_ist_passiert ? `Was ist passiert: ${v.was_ist_passiert}` : "",
      v.warum_wichtig ? `Hintergrund: ${v.warum_wichtig}` : "",
      v.wer_ist_betroffen ? `Betroffen: ${v.wer_ist_betroffen}` : ""
    ].filter(Boolean).join(" ");
    const src = (v.sources || []).length ? ` Quellen: ${v.sources.join(", ")}.` : "";
    return `[${v.vorgang_id}] ${teile}${src}`;
  }).join("\n");

  return [
    "Du bist wissenschaftlicher Mitarbeiter eines Mitglieds des Deutschen Bundestages.",
    ausschuss ? `Schwerpunkt des Mandats: ${ausschuss}.` : "",
    "Schreibe das politische Morgen-Briefing (\"Lage\") ausschliesslich aus den unten aufgefuehrten,",
    "bereits analysierten politischen Vorgaengen. Das Briefing fasst NUR zusammen, was politisch geschieht.",
    "",
    "HARTE REGELN:",
    "- Maximal 250 Woerter insgesamt.",
    "- 2 bis 4 Absaetze; jeder Absatz behandelt einen oder mehrere zusammengehoerige Vorgaenge.",
    "- Ton: sachlich, praezise, nuechtern — Sprache eines wissenschaftlichen Mitarbeiters im Bundestag.",
    "- KEINE Handlungsempfehlung, KEINE Bewertung, KEINE Priorisierung, KEINE Meinung, keine Spekulation.",
    "- KEINE Floskeln, keine Marketing- oder Clickbait-Sprache, keine journalistische Zuspitzung, keine Ueberschriften.",
    "- KEINE Begruessung, keine einleitenden oder abschliessenden Meta-Saetze (kein \"Zusammenfassend\").",
    "- Nenne ausschliesslich Fakten, die aus den Vorgaengen ableitbar sind. Erfinde nichts, keine Namen/Zahlen/Termine ausserhalb der Vorgaenge.",
    "- Jeder Absatz MUSS in vorgang_ids die ids der Vorgaenge nennen, auf denen er beruht (nur ids aus der Liste unten).",
    "",
    "Antworte NUR mit JSON in genau dieser Form (kein Markdown, keine Erklaerung):",
    "{ \"paragraphs\": [ { \"text\": \"...\", \"vorgang_ids\": [\"vg-...\"] } ] }",
    "",
    "VORGAENGE (nutze nur diese; die eckige Klammer am Zeilenanfang ist die vorgang_id):",
    bloecke
  ].filter(Boolean).join("\n");
}

function lageWordCount(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

// Haelt die Gesamtwortzahl <= maxWords ein (letzten Absatz ggf. hart kuerzen).
function capLageWords(paragraphs, maxWords = 250) {
  const out = [];
  let total = 0;
  for (const p of (Array.isArray(paragraphs) ? paragraphs : [])) {
    const words = String(p && p.text || "").trim().split(/\s+/).filter(Boolean);
    if (!words.length || total >= maxWords) continue;
    if (total + words.length <= maxWords) {
      out.push(p); total += words.length;
    } else {
      const take = maxWords - total;
      out.push({ text: words.slice(0, take).join(" ") + " …", vorgang_ids: p.vorgang_ids || [] });
      break;
    }
  }
  return out;
}

// Reine, testbare Nachbearbeitung der KI-Antwort: normalisiert, filtert vorgang_ids
// auf die vorgelegte Menge (keine halluzinierten Quellen), deckelt auf 250 Woerter.
function assembleLageParagraphs(rawResult, allowedIds) {
  const allowed = allowedIds instanceof Set ? allowedIds : new Set(allowedIds || []);
  const list = rawResult && Array.isArray(rawResult.paragraphs) ? rawResult.paragraphs : [];
  const paragraphs = list.map((p) => ({
    text: String((p && p.text) || "").replace(/\s+/g, " ").trim(),
    vorgang_ids: Array.isArray(p && p.vorgang_ids) ? [...new Set(p.vorgang_ids.filter((id) => allowed.has(id)))] : []
  })).filter((p) => p.text);
  return capLageWords(paragraphs, 250);
}

async function generateLageBriefing(vorgaenge, profile = {}, meta = {}) {
  if (!isAiEnabled()) return null;
  const list = (Array.isArray(vorgaenge) ? vorgaenge : []).filter((v) => v && v.vorgang_id);
  if (!list.length) return null;
  const allowed = new Set(list.map((v) => v.vorgang_id));
  let raw;
  try {
    raw = await requestStructuredJson(
      buildLageBriefingPrompt(list, profile),
      LAGE_BRIEFING_SCHEMA,
      { callType: "lageBriefing", politicianId: meta.politicianId || null },
      understandingModelName()
    );
  } catch (_) {
    return null; // KEIN Fake-Briefing bei KI-Fehler
  }
  const paragraphs = assembleLageParagraphs(raw, allowed);
  if (!paragraphs.length) return null;
  return {
    paragraphs,
    model: understandingModelName(),
    wordCount: paragraphs.reduce((n, p) => n + lageWordCount(p.text), 0)
  };
}

// --- KO-Anreicherung: Themen-Tags aus dem Vorgangstext (P1-1 Backfill) --------
// Extrahiert 3–6 belegte deutsche Themen-Schlagworte. Der Aufrufer validiert
// zusaetzlich gegen den Text (Evidence-Guard) — hier KEIN Fake bei Fehler (null).
const KO_TAGS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { tags: { type: "array", items: { type: "string" }, maxItems: 6 } },
  required: ["tags"]
};

function buildKoTagsPrompt(ko = {}) {
  const text = [ko.headline, ko.was_ist_passiert, ko.warum_wichtig, ko.wer_ist_betroffen]
    .map((s) => String(s || "").trim()).filter(Boolean).join("\n");
  return [
    "Du bist wissenschaftlicher Mitarbeiter im Bundestag.",
    "Extrahiere aus dem folgenden politischen Vorgang 3 bis 6 praezise, kurze deutsche THEMEN-Schlagworte",
    "(policy-Themen wie 'Mindestlohn', 'Pflegereform', 'Buergergeld', 'Tarifbindung', 'Wohnungsbau').",
    "HARTE REGELN:",
    "- NUR Themen, die im Text WOERTLICH oder eindeutig belegt sind. KEINE Erfindung, KEINE Spekulation.",
    "- KEINE Partei-, Personen-, Ausschuss- oder Ministeriumsnamen als Tag (die werden separat gefuehrt).",
    "- Kurze Substantive/Nominalphrasen, kein Satz. Deutsch.",
    "Antworte NUR als JSON: {\"tags\": [\"...\", \"...\"]}.",
    "",
    "VORGANG:",
    text
  ].join("\n");
}

async function extractKnowledgeObjectTags(ko = {}, meta = {}) {
  if (!isAiEnabled()) return null;
  const text = [ko.headline, ko.was_ist_passiert, ko.warum_wichtig].map((s) => String(s || "").trim()).filter(Boolean).join(" ");
  if (!text) return { tags: [] };
  let raw;
  try {
    raw = await requestStructuredJson(
      buildKoTagsPrompt(ko),
      KO_TAGS_SCHEMA,
      { callType: "koTagsBackfill", politicianId: meta.politicianId || null },
      understandingModelName()
    );
  } catch (_) {
    return null; // KI-Fehler: KEIN Fake -> Aufrufer schreibt nicht
  }
  const tags = Array.isArray(raw && raw.tags)
    ? [...new Set(raw.tags.map((t) => String(t || "").trim()).filter(Boolean))].slice(0, 6)
    : [];
  return { tags };
}

module.exports = {
  enrichBriefingWithAI,
  generateLageBriefing,
  extractKnowledgeObjectTags,
  aiProviderName,
  buildKoTagsPrompt,
  assembleLageParagraphs,
  capLageWords,
  buildLageBriefingPrompt,
  LAGE_BRIEFING_SCHEMA,
  generateCommunicationDraft,
  generateHelmutAssessment,
  assessParliamentaryItem,
  communicationChannels,
  isAiEnabled,
  requestStructuredJson,
  requestText,
  understandingModelName,
  // Fuer Offline-Tests (LLM-Antwort-Robustheit): reine Parser-Helfer, kein Netz.
  parseJsonText,
  escapeControlCharsInJsonStrings,
  activeModelName: modelName
};
