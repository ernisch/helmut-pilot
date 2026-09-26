#!/usr/bin/env node
"use strict";

// =============================================================================
// Transport-Wiretest: DENKSTUFE (reasoning.effort) IM TATSAECHLICHEN PAYLOAD
// =============================================================================
// ANLASS (belegt, PR #621 / Production-Commit 61d4772f, Diagnose 36254207276):
// Der isolierte Prüfaufwand-Vergleich forderte über lage-vorstart.js ausdrücklich
// `reasoningEffort: "medium"`. ai.js setzte im Responses-Payload jeden Wert außer
// "low" auf "minimal" — der Lauf war deshalb tatsächlich minimal und KEIN
// Medium-Vergleich.
//
// WAS DIESER TEST BEWEIST — über die echte Transportstrecke, NICHT über
// Options-Attrappen (es wird KEIN requestUnderstanding/reviewModell injiziert):
//   Der PRODUKTIVE Pfad wird gefahren: ai.requestStructuredJson -> echter
//   Aufbau des Responses-Payloads in ai.js -> JSON.stringify -> Absenden. Der
//   dabei entstehende, serialisierte Body wird an der Transportgrenze abgegriffen
//   und ausgewertet. Wird ein lokaler Listen-Socket erlaubt, läuft der identische
//   Abgriff hinter einem echten lokalen HTTPS-Mock (self-signed); ist das Binden
//   gesperrt (z. B. in einer Netz-Sandbox), wird derselbe Body an der
//   `https.request`-Naht erfasst — genau die Bytes, die der Mock empfangen hätte.
//   Geprüft werden die tatsächlich serialisierten Werte:
//     * explizit "medium"  -> payload.reasoning.effort === "medium"
//     * explizit "low"     -> payload.reasoning.effort === "low"
//     * ohne Angabe        -> payload.reasoning.effort === "minimal" (Default)
//     * unerlaubt "high"   -> payload.reasoning.effort === "minimal" (fail-closed)
//     * text.format.strict === true und max_output_tokens UNVERAENDERT.
//   Azure und der OpenAI-Direktweg teilen sich denselben Payload-Aufbau; der
//   Azure-Pfad wird hier gefahren, weil er sich lokal spiegeln lässt.
//
// KEIN echtes Netz nach außen, KEIN Schlüssel, KEIN Modellaufruf, KEINE Kosten.
// Attrappenwerte tragen ihre Unechtheit im Namen (CLAUDE.md §4.7).
//
// Ausfuehren: node scripts/lage-pruefaufwand-transport-test.js
// Exitcode 0 = alle Wire-Behauptungen belegt, 1 = sonst.

const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const { EventEmitter } = require("events");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const MODEL = "gpt-5-mini";
const MAX_OUTPUT_TOKENS = 3000;
const SCHEMA = {
  type: "object",
  properties: { ok: { type: "boolean" } },
  required: ["ok"],
  additionalProperties: false
};
const ANTWORT = {
  status: "completed",
  output_text: JSON.stringify({ ok: true }),
  usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18 }
};

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`); }
}

function makeSelfSignedCert() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-wire-"));
  const keyPath = path.join(dir, "key.pem");
  const certPath = path.join(dir, "cert.pem");
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", keyPath, "-out", certPath, "-days", "2",
    "-subj", "/CN=127.0.0.1"
  ], { stdio: "ignore" });
  return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
}

// Bevorzugt: echter lokaler HTTPS-Mock. Der server-seitig EMPFANGENE Body ist der Beweis.
async function starteEchtenMock() {
  const cert = makeSelfSignedCert();
  const gesehen = [];
  const server = https.createServer({ key: cert.key, cert: cert.cert }, (req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      gesehen.push({ pfad: req.url, payload: JSON.parse(body) });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(ANTWORT));
    });
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
  } catch (error) {
    server.close();
    throw error;
  }
  return {
    modus: "echter lokaler HTTPS-Mock",
    gesehen,
    port: server.address().port,
    schliessen: () => {
      server.close();
      if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    }
  };
}

// Rueckfall, wenn das Binden gesperrt ist (Netz-Sandbox): derselbe serialisierte
// Body wird an der `https.request`-Naht erfasst — identisch zu
// scripts/quellen-mehrfachabruf-test.js. Es wird nichts ersetzt, was den Payload
// baut; nur der letzte Transportaufruf wird beobachtet und mit einer
// Responses-förmigen Antwort bedient.
function starteTransportNaht() {
  const gesehen = [];
  const echtesRequest = https.request;
  https.request = function (apiUrl, options, cb) {
    const req = new EventEmitter();
    let body = "";
    req.write = (chunk) => { body += chunk; return true; };
    req.end = () => {
      gesehen.push({ pfad: new URL(String(apiUrl)).pathname, payload: JSON.parse(body) });
      const res = new EventEmitter();
      res.statusCode = 200;
      res.setEncoding = () => {};
      res.destroy = () => {};
      setImmediate(() => {
        if (typeof cb === "function") cb(res);
        res.emit("data", JSON.stringify(ANTWORT));
        res.emit("end");
      });
    };
    req.destroy = () => {};
    req.setTimeout = () => {};
    return req;
  };
  return { modus: "https.request-Naht (Socket-Binden gesperrt)", gesehen, port: 38179,
    schliessen: () => { https.request = echtesRequest; } };
}

async function main() {
  console.log("== Lage-Prüfaufwand: Transport-Wiretest (lokaler Mock) ==\n");

  let mock;
  try {
    mock = await starteEchtenMock();
    mock.lokalerServer = true;
  } catch (error) {
    // Kein Socket, kein openssl (z. B. Netz-Sandbox): derselbe serialisierte
    // Body wird an der Transportnaht erfasst. Der Grund wird ehrlich genannt.
    mock = starteTransportNaht();
    mock.lokalerServer = false;
    mock.grund = error.code || error.message;
  }
  console.log(`Transportgrenze: ${mock.modus}${mock.grund ? `  [Grund: ${mock.grund}]` : ""}\n`);

  // Produktive KI-Konfiguration auf den lokalen Mock zeigen lassen. Die
  // Schleifenadresse erlaubt der Azure-Guard nur auf ausdrückliche Anforderung.
  process.env.AZURE_OPENAI_ENDPOINT = `https://127.0.0.1:${mock.port}`;
  process.env.HELMUT_KI_LOOPBACK_ERLAUBT = "1";
  process.env.AZURE_OPENAI_KEY = "NUR_LOKALE_ATTRAPPE_KEY_123456";
  process.env.AZURE_OPENAI_DEPLOYMENT = MODEL;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // nur für das self-signed Mock-Zertifikat
  process.env.HELMUT_STORAGE_BACKEND = "local";

  // Module NACH dem Setzen der Env laden (isAzure() hängt an der Env).
  const ai = require(path.join(ROOT, "lib/helmut/ai.js"));

  function aufruf(effort) {
    const options = { strict: true, maxOutputTokens: MAX_OUTPUT_TOKENS };
    if (effort !== undefined) options.reasoningEffort = effort;
    return ai.requestStructuredJson("Nur lokaler Transporttest.", SCHEMA,
      { callType: `wiretest-${effort || "default"}`, politicianId: null }, MODEL, options);
  }

  try {
    await aufruf(undefined); // bisheriger Default
    await aufruf("low");     // Quellenreview, unverändert
    await aufruf("medium");  // isolierter Prüfaufwand-Vergleich (Ziel dieser Änderung)
    await aufruf("high");    // NICHT erlaubt -> fail-closed minimal
  } finally {
    mock.schliessen();
  }

  const gesehen = mock.gesehen;

  // 0) Es wurde tatsächlich pro Fall ein Request bis zur Transportgrenze gebaut.
  check("Vier echte Requests bis zur Transportgrenze", gesehen.length === 4,
    `gesehen=${gesehen.length}`);
  check("Ziel-Pfad ist der Responses-Endpunkt der geprüften Azure-Basis",
    gesehen.every((g) => g.pfad === "/openai/v1/responses"),
    gesehen.map((g) => g.pfad).join(", "));

  // 1) Denkstufe im serialisierten Body — der Kern der Abnahme.
  const erwartet = [
    ["Default ohne Angabe bleibt minimal", 0, "minimal"],
    ["Explizites low bleibt low", 1, "low"],
    ["Explizites medium kommt als medium an (statt minimal)", 2, "medium"],
    ["Unerlaubtes high bleibt fail-closed minimal", 3, "minimal"]
  ];
  for (const [name, i, wert] of erwartet) {
    const p = gesehen[i] && gesehen[i].payload;
    check(name, Boolean(p) && p.reasoning && p.reasoning.effort === wert,
      p ? `reasoning=${JSON.stringify(p.reasoning)}` : "kein Payload");
  }

  // 2) Keine neue, permissive Denkstufe: reasoning trägt NUR `effort`.
  check("reasoning trägt ausschließlich `effort` (kein high/max-Zusatz)",
    gesehen.every((g) => Object.keys(g.payload.reasoning || {}).join(",") === "effort"),
    gesehen.map((g) => Object.keys(g.payload.reasoning || {}).join(",")).join(" | "));

  // 3) strict und max_output_tokens sind unverändert.
  check("strict bleibt true (text.format.strict) — alle vier Aufrufe",
    gesehen.every((g) => g.payload.text?.format?.strict === true),
    JSON.stringify(gesehen.map((g) => g.payload.text?.format?.strict)));
  check(`max_output_tokens bleibt unverändert ${MAX_OUTPUT_TOKENS}`,
    gesehen.every((g) => g.payload.max_output_tokens === MAX_OUTPUT_TOKENS),
    JSON.stringify(gesehen.map((g) => g.payload.max_output_tokens)));
  check("Modell bleibt unverändert", gesehen.every((g) => g.payload.model === MODEL),
    JSON.stringify(gesehen.map((g) => g.payload.model)));

  console.log(`\n${pass}/${pass + fail} Wire-Behauptungen bestanden; kein echtes Netz, kein Modellaufruf, keine Kosten.`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`FAIL  Wiretest abgestürzt: ${error && error.message}`);
  process.exitCode = 1;
});
