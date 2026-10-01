"use strict";

// Echter lokaler HTTPS-Transport, kuenstliche Antworten, Kostenbuchung nur im
// Speicher. Laufende Chunks verhindern den Socket-Inaktivitaetstimeout und
// muessen trotzdem die gesamte Providerfrist einhalten. Kein Azure/DB-Zugriff.
const assert = require("node:assert/strict");
const https = require("node:https");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { execFileSync } = require("node:child_process");

const originalRequest = https.request;
const originalSetTimeout = global.setTimeout;
const originalClearTimeout = global.clearTimeout;
const envNames = ["AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_KEY", "AZURE_OPENAI_DEPLOYMENT", "OPENAI_API_KEY", "HELMUT_KI_LOOPBACK_ERLAUBT", "HELMUT_KI_TIMEOUT_MS"];
const savedEnv = Object.fromEntries(envNames.map((n) => [n, process.env[n]]));
const storagePath = require.resolve("../lib/helmut/storage");
const storage = require(storagePath);
const costsPath = require.resolve("../lib/helmut/testkosten-budget");
const costs = require(costsPath);
let reservations = [], receipts = [], completions = [], notSent = [];
let testCostsActive = true;
require.cache[storagePath].exports = {
  ...storage,
  reserveLlmCall: async () => { reservations.push("call"); return { allowed: true }; },
  recordLlmUsage: async (info) => { receipts.push(info); return info; }
};
require.cache[costsPath].exports = {
  ...costs, aktiv: () => testCostsActive,
  reserviere: async () => { reservations.push("usd"); return { id: "synthetisches-ticket" }; },
  abschliessen: async (ticket, receipt) => { completions.push({ ticket, receipt }); },
  nichtGesendet: async (ticket, error) => { notSent.push({ ticket, marked: error.kiNichtGesendet === true }); }
};

let requests = [], timers = [], responseStreams = [], socketTimeouts = 0;
let mode = "ok", chunks = 0, calls = 0;
let passed = 0, failed = 0;
const certDir = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-ai-deadline-"));
const server = https.createServer();

async function check(name, run) {
  try { await run(); passed += 1; console.log(`PASS  ${name}`); }
  catch (error) { failed += 1; console.error(`FAIL  ${name}: ${error.message}`); }
}
function reset() {
  reservations = []; receipts = []; completions = []; notSent = [];
  requests = []; timers = []; responseStreams = []; socketTimeouts = 0; chunks = 0; calls = 0;
}
function finished(expectSuccess) {
  assert.equal(requests.length, 1, "kein Retry/Modellwechsel");
  assert.equal(receipts.length, 1, "genau eine Kostenquittung");
  assert.equal(completions.length, 1, "genau ein Dollarabschluss");
  assert.deepEqual(reservations, ["usd", "call"]);
  assert.equal(receipts[0].success, expectSuccess);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].cleared, true);
  assert.doesNotMatch(JSON.stringify(receipts), /127\.0\.0\.1|ATTRAPPE|private-body/);
}

(async () => {
  try {
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", path.join(certDir, "key.pem"), "-out", path.join(certDir, "cert.pem"),
      "-days", "2", "-subj", "/CN=127.0.0.1"], { stdio: "ignore", timeout: 10000 });
    server.setSecureContext({ key: fs.readFileSync(path.join(certDir, "key.pem")), cert: fs.readFileSync(path.join(certDir, "cert.pem")) });
    server.on("request", (req, res) => {
      calls += 1;
      req.resume();
      if (mode === "headers-stall") return;
      if (mode === "body-trickle" || mode === "error-body-trickle") {
        res.writeHead(mode === "body-trickle" ? 200 : 522, { "Content-Type": "application/json" });
        res.flushHeaders();
        const interval = setInterval(() => { chunks += 1; res.write(" "); }, 80);
        res.once("close", () => clearInterval(interval));
        return;
      }
      if (mode === "invalid-json") { res.end("private-body invalid-json"); return; }
      if (mode === "http-error") { res.writeHead(400); res.end("private-body"); return; }
      if (mode === "existing-fallback" && calls === 1) { res.writeHead(400); res.end("private-body"); return; }
      res.end(JSON.stringify({ status: "completed", output_text: "synthetisch-ok", usage: { input_tokens: 12, output_tokens: 3, total_tokens: 15 } }));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const port = server.address().port;
    process.env.AZURE_OPENAI_ENDPOINT = `https://127.0.0.1:${port}`;
    process.env.AZURE_OPENAI_KEY = "LOKALE_KEY_ATTRAPPE_NICHT_ECHT";
    process.env.AZURE_OPENAI_DEPLOYMENT = "gpt-5-mini";
    process.env.HELMUT_KI_LOOPBACK_ERLAUBT = "1";
    global.setTimeout = (callback, ms, ...args) => {
      const timer = originalSetTimeout(callback, ms, ...args);
      timers.push({ timer, ms, cleared: false });
      return timer;
    };
    global.clearTimeout = (timer) => {
      const entry = timers.find((x) => x.timer === timer);
      if (entry) entry.cleared = true;
      originalClearTimeout(timer);
    };
    https.request = (url, options, callback) => {
      const target = new URL(url);
      if (mode === "existing-fallback") {
        assert.equal(target.hostname, "api.openai.com");
        url = `https://127.0.0.1:${port}${target.pathname}`;
      } else {
        assert.equal(target.hostname, "127.0.0.1", "kein externes Ziel erlaubt");
        assert.equal(Number(target.port), port);
      }
      if (mode === "construction-error") {
        const error = new Error("private-body"); error.code = "ERR_INVALID_CHAR"; throw error;
      }
      const request = originalRequest(url, { ...options, rejectUnauthorized: false, agent: false }, (response) => {
        responseStreams.push(response);
        callback(response);
      });
      requests.push({ request, options });
      request.on("timeout", () => { socketTimeouts += 1; });
      return request;
    };
    const ai = require("../lib/helmut/ai");
    const run = () => ai.requestText("synthetischer Testprompt ohne Personen", { callType: "synthetischer-deadline-test" });

    for (const [value, expected] of [["60000", 20000], [undefined, 20000], ["-1", 20000], ["1000", 1000]]) {
      await check(`Timeoutsetting ${String(value)} begrenzt Socket und Gesamtfrist auf ${expected}ms`, async () => {
        reset(); mode = "ok";
        if (value === undefined) delete process.env.HELMUT_KI_TIMEOUT_MS;
        else process.env.HELMUT_KI_TIMEOUT_MS = value;
        assert.equal(await run(), "synthetisch-ok");
        assert.equal(timers[0].ms, expected);
        assert.equal(requests[0].options.timeout, expected);
        finished(true);
      });
    }
    for (const phase of ["headers-stall", "body-trickle", "error-body-trickle"]) {
      await check(`${phase}: ganze Antwort endet, Verbindung geschlossen, Ausgang unbekannt`, async () => {
        reset(); mode = phase; process.env.HELMUT_KI_TIMEOUT_MS = "1000";
        let watchdog;
        const started = Date.now();
        try {
          await assert.rejects(Promise.race([run(), new Promise((_, reject) => {
            watchdog = originalSetTimeout(() => reject(new Error("Testwaechter: harter Abruf blieb offen")), 3000);
          })]), (error) => error.code === "ETIMEDOUT" && error.kiNichtGesendet !== true);
        } finally { originalClearTimeout(watchdog); }
        assert.ok(Date.now() - started < 2200, "Gesamtdauer folgt der kurzen Deadline");
        assert.equal(calls, 1);
        assert.equal(requests[0].request.destroyed, true);
        if (phase !== "headers-stall") {
          assert.ok(chunks >= 3, "Antwortdaten flossen weiter");
          assert.equal(socketTimeouts, 0, "kein Socket-Inaktivitaetstimeout: echte Gesamtfrist erforderlich");
          assert.equal(responseStreams[0].destroyed, true);
        }
        assert.equal(notSent.length, 1);
        assert.equal(notSent[0].marked, false, "keine false-safe Wiederholungsmarke");
        finished(false);
      });
    }
    for (const phase of ["invalid-json", "http-error"]) {
      await check(`${phase}: bereinigter Fehler mit geloeschtem Timer`, async () => {
        reset(); mode = phase;
        await assert.rejects(run(), (error) => !error.message.includes("private-body"));
        finished(false);
      });
    }
    await check("synchroner Requestaufbaufehler loescht Deadline und bleibt nicht gesendet", async () => {
      reset(); mode = "construction-error";
      await assert.rejects(run(), (error) => error.kiNichtGesendet === true);
      assert.equal(timers[0].cleared, true);
      assert.equal(receipts.length, 1);
      assert.equal(completions.length, 1);
      assert.equal(notSent[0].marked, true);
      assert.doesNotMatch(JSON.stringify(receipts), /private-body|127\.0\.0\.1/);
    });
    await check("bestehender OpenAI-400-Fallback raeumt die erste Deadline vor Weitergabe auf", async () => {
      reset(); mode = "existing-fallback"; testCostsActive = false;
      delete process.env.AZURE_OPENAI_KEY;
      delete process.env.AZURE_OPENAI_ENDPOINT;
      process.env.OPENAI_API_KEY = "LOKALE_OPENAI_KEY_ATTRAPPE_NICHT_ECHT";
      assert.equal(await run(), "synthetisch-ok");
      assert.equal(requests.length, 2, "nur unveraenderter bestehender OpenAI-Fallback");
      assert.equal(timers.length, 2);
      assert.equal(timers.every((timer) => timer.cleared), true);
      assert.equal(receipts.length, 1, "bestehende einzelne finale Quittung erhalten");
      assert.deepEqual(reservations, ["call"]);
    });
  } finally {
    https.request = originalRequest;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    require.cache[storagePath].exports = storage;
    require.cache[costsPath].exports = costs;
    for (const name of envNames) {
      if (savedEnv[name] === undefined) delete process.env[name]; else process.env[name] = savedEnv[name];
    }
    server.closeAllConnections();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    fs.rmSync(certDir, { recursive: true, force: true });
  }
  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exitCode = failed ? 1 : 0;
})().catch((error) => { console.error(error); process.exitCode = 1; });
