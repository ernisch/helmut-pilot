#!/usr/bin/env node
// =============================================================================
// C8 Understanding — Live-Smoke gegen einen lokalen HTTPS-Mock
// =============================================================================
// Beweist EINEN ECHTEN Understanding-Call Ende-zu-Ende, OHNE echte Kosten/Keys:
// ein lokaler HTTPS-Server (self-signed Zertifikat) spielt die Azure/OpenAI-
// Responses-API. Der Pfad ist der PRODUKTIVE:
//   ai.requestStructuredJson (echter https-Request, TLS, JSON-Schema im Payload)
//     -> Antwort parsen -> assemble -> gegen KNOWLEDGE_OBJECT_SCHEMA validieren
//     -> speichern (hier in-memory injiziert, da Node<18 kein globales fetch hat)
//     -> Kosten/Token via recordLlmUsage loggen (OHNE Prompt-/Antwortinhalt).
//
// Fuer den ECHTEN Azure-Call: AZURE_OPENAI_ENDPOINT/-KEY/-DEPLOYMENT setzen und
// runPendingUnderstandingShadow gegen echte raw_documents fahren (HELMUT_V3_STORE=1
// + HELMUT_UNDERSTANDING_LOCK=1 + Supabase). Dieses Skript ist die kostenfreie Probe.
//
// Ausfuehren:
//   node scripts/understanding-live-smoke.js
//   npm run test:understanding-smoke
//
// Exitcode 0 = echter Call + Validierung + Kostenlog OK, 1 = sonst.

const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");

function fail(msg) { console.log(`FAIL  ${msg}`); process.exit(1); }

function makeSelfSignedCert() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-smoke-"));
  const keyPath = path.join(dir, "key.pem");
  const certPath = path.join(dir, "cert.pem");
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", keyPath, "-out", certPath, "-days", "2",
    "-subj", "/CN=127.0.0.1"
  ], { stdio: "ignore" });
  return { dir, key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
}

async function main() {
  console.log("== Helmut C8 Understanding — Live-Smoke (lokaler HTTPS-Mock) ==\n");

  // Eine valide Analyse als Modell-Antwort (aus dem Goldset), damit assemble+validate greifen.
  const goldset = JSON.parse(fs.readFileSync(path.join(root, "scripts/goldset/understanding-goldset.json"), "utf8"));
  const analysis = goldset.cases[0].expected;

  let cert;
  try {
    cert = makeSelfSignedCert();
  } catch (error) {
    fail(`openssl nicht verfuegbar / Zertifikat fehlgeschlagen: ${error.message}`);
  }

  // Lokaler HTTPS-Server, der die Responses-API mimt (mit usage-Block fuer das Kostenlog).
  let requestSeen = false;
  const server = https.createServer({ key: cert.key, cert: cert.cert }, (req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      requestSeen = true;
      const payload = {
        status: "completed",
        output_text: JSON.stringify(analysis),
        usage: { input_tokens: 420, output_tokens: 180, total_tokens: 600 }
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  // Produktive KI-Konfiguration auf den lokalen Mock zeigen lassen.
  process.env.AZURE_OPENAI_ENDPOINT = `https://127.0.0.1:${port}`;
// Der Azure-Endpunktguard (lib/helmut/azure-endpunkt.js) laesst die
// Schleifenadresse nur auf ausdrueckliche Anforderung zu. Dieses Werkzeug
// faehrt den ECHTEN KI-Pfad gegen einen lokalen HTTPS-Ersatz und fordert sie
// deshalb hier an. Der Wert verlaesst die Maschine nicht.
  process.env.HELMUT_KI_LOOPBACK_ERLAUBT = "1";
  process.env.AZURE_OPENAI_KEY = "dummy-smoke-key";
  process.env.AZURE_OPENAI_DEPLOYMENT = "gpt-5-mini";
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // nur fuer das self-signed Mock-Zertifikat
  process.env.HELMUT_STORAGE_BACKEND = "local";   // recordLlmUsage schreibt lokal (kein Supabase)

  // Module NACH dem Setzen der Env laden.
  const u = require(path.join(root, "lib/helmut/understanding.js"));
  const ai = require(path.join(root, "lib/helmut/ai.js"));
  const storage = require(path.join(root, "lib/helmut/storage.js"));

  if (!ai.isAiEnabled()) fail("KI gilt trotz Azure-Endpoint als deaktiviert.");
  console.log(`KI-Endpoint: ${process.env.AZURE_OPENAI_ENDPOINT} (Modell: ${ai.understandingModelName()})`);

  const cluster = { documents: [{ title: "Rentenpaket 2026 im Kabinett beschlossen", summary: "Kabinett beschliesst Rentenpaket 2026.", source_name: "BMAS", published_at: "2026-06-30" }] };
  const pendingKo = { id: "ko-vg-smoke", vorgang_id: "vg-smoke", status: "pending", understanding_status: "pending", headline: "Rentenpaket 2026" };
  const saved = [];

  // ECHTER Call: requestUnderstanding NICHT injiziert -> ai.requestStructuredJson (https).
  // Nur Storage-Writes injiziert (Node<18 hat kein globales fetch fuer Supabase).
  let result;
  try {
    result = await u.understandOneCluster(cluster, {
      canSpend: () => ({ allowed: true }),
      save: (k) => { saved.push(k); return { saved: true, id: k.id }; },
      markFailed: () => ({ saved: true }),
      modelName: () => ai.understandingModelName(),
      requestUnderstanding: (prompt) =>
        ai.requestStructuredJson(prompt, require(path.join(root, "lib/helmut/understanding-schema.js")).KNOWLEDGE_OBJECT_SCHEMA,
          { callType: "understanding-smoke", politicianId: null }, ai.understandingModelName()),
      logSkip: () => {}
    }, { vorgangId: "vg-smoke", existing: pendingKo });
  } catch (error) {
    server.close();
    fail(`Echter Call ist abgestuerzt (kein sauberes Ergebnis): ${error.message}`);
  }

  server.close();

  const { validateKnowledgeObject } = require(path.join(root, "lib/helmut/understanding-schema.js"));

  // 1) Es wurde tatsaechlich ueber das Netzwerk gesprochen.
  console.log(`${requestSeen ? "PASS" : "FAIL"}  Echter HTTPS-Request an den Mock-Endpoint erfolgt (TLS-Pfad genutzt)`);
  if (!requestSeen) process.exit(1);

  // 2) Ergebnis ist gespeichert, valide, complete.
  const ok2 = result && result.status === "saved" && saved.length === 1
    && validateKnowledgeObject(saved[0]).valid === true
    && saved[0].status === "neu" && saved[0].understanding_status === "complete";
  console.log(`${ok2 ? "PASS" : "FAIL"}  Antwort geparst, gegen Schema validiert, KO complete gespeichert  — status=${saved[0] && saved[0].status}/${saved[0] && saved[0].understanding_status}`);
  if (!ok2) process.exit(1);

  // 3) Kosten/Token wurden geloggt — OHNE Prompt-/Antwortinhalt.
  const usage = await storage.getLlmUsage(null, 20);
  const entry = usage.find((e) => e.callType === "understanding-smoke");
  const contentFree = entry && !("prompt" in entry) && !("response" in entry) && !("answer" in entry) && !("input" in entry);
  const ok3 = entry && entry.success === true && entry.totalTokens === 600 && contentFree;
  console.log(`${ok3 ? "PASS" : "FAIL"}  Kostenlog geschrieben (Modell=${entry && entry.model}, Tokens=${entry && entry.totalTokens}, Kosten=${entry && entry.estimatedCost}$) — ohne Prompt-/Antwortinhalt`);
  if (!ok3) process.exit(1);

  try { fs.rmSync(cert.dir, { recursive: true, force: true }); } catch (_) { /* egal */ }

  console.log("\nPASS  Ein echter Understanding-Call lief Ende-zu-Ende: HTTPS -> Schema-Validierung -> complete -> Kostenlog (DSGVO-konform).");
  process.exit(0);
}

main().catch((error) => {
  console.error("Live-Smoke abgestuerzt:", error);
  process.exit(1);
});
