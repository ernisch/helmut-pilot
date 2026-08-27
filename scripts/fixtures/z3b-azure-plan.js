"use strict";

// Rein lokaler Plan fuer die spaetere Azure Messung. Kein Netz und keine Keys.

const crypto = require("crypto");
const understanding = require("../../lib/helmut/understanding");
const ai = require("../../lib/helmut/ai");
const { KNOWLEDGE_OBJECT_SCHEMA } = require("../../lib/helmut/understanding-schema");

const KLASSEN = Object.freeze(["understanding", "lage", "buero"]);
const MODI = Object.freeze({
  vorprobe: Object.freeze({ jeKlasse: 1, aufrufe: 3, zweck: "Form, Token und Erreichbarkeit" }),
  stichprobe: Object.freeze({ jeKlasse: 7, aufrufe: 21, zweck: "Laufzeitverteilung nach gruener Vorprobe" })
});
const AUFRUFE_UEBER_BEIDE_MODI_MAX = 24;
const PARALLELITAET = 1;
const WIEDERHOLUNGEN = 0;
const LAUFZEIT_MAX_MS = 5 * 60 * 1000;
const ANFRAGE_TIMEOUT_MS = 20000;
const PROMPT_MAX_BYTES = 40000;
const KOSTENLIMIT_MAX_USD = 1;

const BUERO_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["text", "rationale"],
  properties: Object.freeze({
    text: Object.freeze({ type: "string" }),
    rationale: Object.freeze({ type: "string" })
  })
});

function pruefeAzureEndpoint(roh) {
  let url;
  try { url = new URL(String(roh || "")); }
  catch (_) { throw new Error("Z3b Azure Ziel abgelehnt: ungueltige URL"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port
      || (url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) {
    throw new Error("Z3b Azure Ziel abgelehnt: erwartet wird nur die HTTPS Basis URL ohne Pfad");
  }
  if (!/^[a-z0-9][a-z0-9-]{1,62}\.openai\.azure\.com$/.test(url.hostname)) {
    throw new Error("Z3b Azure Ziel abgelehnt: kein Azure OpenAI Ressourcenhost");
  }
  const normalisiert = `https://${url.hostname}`;
  if (String(roh) !== normalisiert) {
    throw new Error("Z3b Azure Ziel abgelehnt: URL muss exakt normalisiert sein");
  }
  return Object.freeze({ url: normalisiert, host: url.hostname });
}

function synthetischerSatz(index, variante, laenge = 220) {
  const kern = `Synthetischer politischer Testvorgang ${index} Variante ${variante}. `
    + "Ein fiktiver Ausschuss beraet einen rein erfundenen Verwaltungsablauf. "
    + "Es gibt keine reale Person, kein echtes Mandat und keine echte Quelle. ";
  return kern.repeat(Math.ceil(laenge / kern.length)).slice(0, laenge);
}

function understandingPrompt(index) {
  const documents = Array.from({ length: 12 }, (_, nr) => ({
    id: `z3b-azure-synth-doc-${index}-${nr}`,
    title: `Synthetischer Vorgang ${index} Meldung ${nr}`,
    summary: synthetischerSatz(index, nr, 240),
    source_name: `Synthetische Quelle ${nr}`,
    published_at: "2026-08-27T08:00:00.000Z",
    confidence: "high",
    link_type: "direct"
  }));
  return understanding.buildUnderstandingPrompt({ documents });
}

function lagePrompt(index) {
  const vorgaenge = Array.from({ length: 10 }, (_, nr) => ({
    vorgang_id: `z3b-azure-synth-vg-${index}-${nr}`,
    headline: `Synthetischer Vorgang ${index}.${nr}`,
    was_ist_passiert: synthetischerSatz(index, nr, 180),
    warum_wichtig: "Nur fuer die technische Messung einer fiktiven politischen Lage.",
    wer_ist_betroffen: "Ausschliesslich kuenstliche Testrollen.",
    sources: [`Synthetische Quelle ${nr}`]
  }));
  return ai.buildLageBriefingPrompt(vorgaenge, { committees: ["Synthetischer Ausschuss"] });
}

function bueroPrompt(index) {
  const kontext = {
    anlass: `Synthetischer Testanlass ${index}`,
    kanal: "Interne Linie",
    profil: {
      ausschuss: "Synthetischer Ausschuss",
      partei: "Fiktive Testpartei",
      themen: ["Testverfahren", "Qualitaetssicherung"]
    },
    entscheidung: {
      titel: `Synthetischer Vorgang ${index}`,
      kurzfassung: synthetischerSatz(index, 1, 700),
      empfehlung: "Eine rein fiktive interne Abstimmung vorbereiten."
    }
  };
  return [
    "Du bist Helmut, der persoenliche politische Stabschef des Nutzers.",
    "Erzeuge eine interne Linie fuer einen ausschliesslich synthetischen Testfall.",
    "Regeln:",
    "- Fuenf kurze, operative Stichpunkte.",
    "- Keine Fakten ausserhalb des Kontexts.",
    "- Keine realen Personen, Mandate oder Quellen ergaenzen.",
    "- Ruhig, klar, kein KI-Ton.",
    "- Gib ausschliesslich valides JSON zurueck.",
    "JSON: {\"text\": \"...\", \"rationale\": \"...\"}",
    "Kontext:",
    JSON.stringify(kontext, null, 2)
  ].join("\n");
}

const KLASSENPLAN = Object.freeze({
  understanding: Object.freeze({
    maxOutputTokens: 3000,
    schemaName: "knowledge_object",
    schema: KNOWLEDGE_OBJECT_SCHEMA,
    prompt: understandingPrompt
  }),
  lage: Object.freeze({
    maxOutputTokens: 3000,
    schemaName: "lage_briefing",
    schema: ai.LAGE_BRIEFING_SCHEMA,
    prompt: lagePrompt
  }),
  buero: Object.freeze({
    maxOutputTokens: 2500,
    schemaName: "buero_entwurf",
    schema: BUERO_SCHEMA,
    prompt: bueroPrompt
  })
});

function baueMessauftraege(modus) {
  const plan = MODI[String(modus || "")];
  if (!plan) throw new Error(`Z3b Azure Modus muss einer von ${Object.keys(MODI).join(", ")} sein`);
  const auftraege = [];
  for (const klasse of KLASSEN) {
    const definition = KLASSENPLAN[klasse];
    for (let index = 0; index < plan.jeKlasse; index += 1) {
      const prompt = definition.prompt(index + (modus === "stichprobe" ? 100 : 0));
      const promptBytes = Buffer.byteLength(prompt, "utf8");
      if (promptBytes > PROMPT_MAX_BYTES) throw new Error(`Z3b Azure Prompt ${klasse} ist zu gross`);
      auftraege.push(Object.freeze({
        klasse,
        nummer: index + 1,
        prompt,
        promptBytes,
        maxOutputTokens: definition.maxOutputTokens,
        schemaName: definition.schemaName,
        schema: definition.schema
      }));
    }
  }
  if (auftraege.length !== plan.aufrufe) throw new Error("Z3b Azure Plan hat eine widerspruechliche Aufrufzahl");
  return Object.freeze(auftraege);
}

function bauePayload(auftrag, deployment) {
  return Object.freeze({
    model: deployment,
    input: auftrag.prompt,
    max_output_tokens: auftrag.maxOutputTokens,
    reasoning: Object.freeze({ effort: "minimal" }),
    store: false,
    text: Object.freeze({
      format: Object.freeze({
        type: "json_schema",
        name: auftrag.schemaName,
        schema: auftrag.schema,
        strict: false
      })
    })
  });
}

function obereKostenUsd(auftraege, preis) {
  // Ein Token kann im konservativen Grenzfall nur ein Byte des serialisierten
  // Requests tragen. Dazu kommt je Aufruf ein fester Puffer fuer Anbieterrahmen.
  // So zaehlt nicht nur der Prompt, sondern auch das JSON Schema in den Riegel.
  const inputTokensMax = auftraege.reduce((summe, auftrag) => {
    const requestBytes = Buffer.byteLength(JSON.stringify(bauePayload(auftrag, "z3b-kostenriegel")), "utf8");
    return summe + requestBytes + 4096;
  }, 0);
  const outputTokensMax = auftraege.reduce((summe, auftrag) => summe + auftrag.maxOutputTokens, 0);
  return {
    inputTokensMax,
    outputTokensMax,
    usd: (inputTokensMax / 1e6) * preis.inputUsdJeMio
      + (outputTokensMax / 1e6) * preis.outputUsdJeMio
  };
}

function endpointFingerabdruck(host) {
  return crypto.createHash("sha256").update(String(host || "")).digest("hex").slice(0, 12);
}

module.exports = {
  KLASSEN,
  MODI,
  AUFRUFE_UEBER_BEIDE_MODI_MAX,
  PARALLELITAET,
  WIEDERHOLUNGEN,
  LAUFZEIT_MAX_MS,
  ANFRAGE_TIMEOUT_MS,
  PROMPT_MAX_BYTES,
  KOSTENLIMIT_MAX_USD,
  KLASSENPLAN,
  pruefeAzureEndpoint,
  baueMessauftraege,
  bauePayload,
  obereKostenUsd,
  endpointFingerabdruck
};
