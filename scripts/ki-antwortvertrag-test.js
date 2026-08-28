"use strict";

// Reiner Offline-Vertrag fuer die zentrale KI-HTTP-Engstelle. Kein Anbieter,
// keine Datenbank und kein echtes Geheimnis. Belegt drei Zusagen:
// 1. HTTP 200 + status incomplete ist ein kostenwirksamer Fehlschlag.
// 2. Syntaxfehler geben niemals Antwortfragmente an Fachpfade weiter.
// 3. Nur status completed liefert Modelltext aus und wird als Erfolg gebucht.

const { EventEmitter } = require("events");
const https = require("https");
const storage = require("../lib/helmut/storage");

const originalRequest = https.request;
const originalReserve = storage.reserveLlmCall;
const originalRecord = storage.recordLlmUsage;
const envSnapshot = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  AZURE_OPENAI_KEY: process.env.AZURE_OPENAI_KEY,
  AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT,
  HELMUT_ANBIETER_STEUERUNG: process.env.HELMUT_ANBIETER_STEUERUNG
};

let pass = 0;
let fail = 0;
function check(name, ok) {
  if (ok) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

let naechsteAntwort = null;
const protokoll = [];

function installiereAttrappe() {
  process.env.OPENAI_API_KEY = "sk-testwert-nur-offline-000000";
  delete process.env.AZURE_OPENAI_KEY;
  delete process.env.AZURE_OPENAI_ENDPOINT;
  delete process.env.HELMUT_ANBIETER_STEUERUNG;
  storage.reserveLlmCall = async () => ({ allowed: true, used: 1, limit: 50 });
  storage.recordLlmUsage = async (eintrag) => { protokoll.push({ ...eintrag }); };
  https.request = function fakeRequest(_url, _options, callback) {
    const request = new EventEmitter();
    request.write = () => {};
    request.destroy = (error) => { if (error) request.emit("error", error); };
    request.end = () => {
      const response = new EventEmitter();
      response.statusCode = 200;
      response.setEncoding = () => {};
      setImmediate(() => {
        callback(response);
        response.emit("data", naechsteAntwort);
        response.emit("end");
      });
    };
    return request;
  };
}

function aufraeumen() {
  https.request = originalRequest;
  storage.reserveLlmCall = originalReserve;
  storage.recordLlmUsage = originalRecord;
  for (const [name, wert] of Object.entries(envSnapshot)) {
    if (wert === undefined) delete process.env[name];
    else process.env[name] = wert;
  }
}

async function main() {
  installiereAttrappe();
  const ai = require("../lib/helmut/ai");
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: { text: { type: "string" } },
    required: ["text"]
  };
  const geheim = "MODELLFRAGMENT_DARF_NICHT_AUSTRETEN_4711";

  naechsteAntwort = JSON.stringify({
    status: "incomplete",
    incomplete_details: { reason: "max_output_tokens", intern: geheim },
    output_text: `{"text":"${geheim}`,
    usage: { input_tokens: 21, output_tokens: 34, total_tokens: 55 }
  });
  let incompleteFehler = null;
  try {
    await ai.requestStructuredJson("offline", schema, { callType: "vertrag-incomplete" }, "gpt-4.1");
  } catch (error) { incompleteFehler = error; }
  const incompleteLog = protokoll.find((eintrag) => eintrag.callType === "vertrag-incomplete");
  check("1 HTTP 200 mit status incomplete wird abgelehnt",
    incompleteFehler && incompleteFehler.code === "AI_RESPONSE_NOT_COMPLETED");
  check("2 Der Fachfehler enthaelt weder Modelltext noch incomplete_details",
    !String(incompleteFehler && incompleteFehler.message).includes(geheim)
      && !String(incompleteFehler && incompleteFehler.message).includes("max_output_tokens"));
  check("3 Der bezahlte Fehlschlag behaelt Usage und success false",
    incompleteLog && incompleteLog.success === false
      && incompleteLog.error === "response-not-completed"
      && incompleteLog.usage && incompleteLog.usage.total_tokens === 55);

  naechsteAntwort = `{"status":"completed","output_text":"${geheim}`;
  let umschlagFehler = null;
  try {
    await ai.requestStructuredJson("offline", schema, { callType: "vertrag-umschlag" }, "gpt-4.1");
  } catch (error) { umschlagFehler = error; }
  const umschlagLog = protokoll.find((eintrag) => eintrag.callType === "vertrag-umschlag");
  check("4 Ein kaputter Anbieterumschlag bleibt ein Fehler",
    umschlagFehler && umschlagFehler.code === "AI_RESPONSE_INVALID_JSON");
  check("5 Auch der Umschlagfehler enthaelt kein Eingabefragment",
    !String(umschlagFehler && umschlagFehler.message).includes(geheim));
  check("6 Der Umschlagfehler wird nur als generische Kategorie protokolliert",
    umschlagLog && umschlagLog.success === false && umschlagLog.error === "response-parse-error");

  naechsteAntwort = JSON.stringify({
    status: "completed",
    output_text: JSON.stringify({ text: "vollstaendig" }),
    usage: { input_tokens: 8, output_tokens: 5, total_tokens: 13 }
  });
  const ergebnis = await ai.requestStructuredJson(
    "offline", schema, { callType: "vertrag-completed" }, "gpt-4.1");
  const erfolgLog = protokoll.find((eintrag) => eintrag.callType === "vertrag-completed");
  check("7 status completed liefert den strukturierten Modelltext aus", ergebnis.text === "vollstaendig");
  check("8 Nur der vollstaendige Abschluss wird als Erfolg gebucht",
    erfolgLog && erfolgLog.success === true && erfolgLog.usage.total_tokens === 13);

  console.log(`\nPASS ${pass}  FAIL ${fail}`);
  process.exitCode = fail ? 1 : 0;
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
}).finally(aufraeumen);
