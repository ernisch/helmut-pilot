#!/usr/bin/env node
// P1-Sicherheits-/Vertrauens-Checks (offline, in-process).
// Prueft die umgesetzten P1-Fixes:
//   1) Cron ohne Secret  -> blockiert (503, fail closed)
//   2) Cron falsches Secret -> blockiert (403)
//   3) Cron richtiges Secret -> autorisiert (nicht 403/503)
//   2b) TLS: kein rejectUnauthorized im Crawler
//   4) Fake-Fallbacks (Termine/Entwuerfe/Radar) erscheinen nicht mehr im Code
//   3b) LLM-Logging schreibt einen Eintrag (mit und ohne usage-Block)
//
// Ausfuehren:  node scripts/p1-security-check.js
// Exitcode 0 = alle Checks bestanden, 1 = mind. ein Fehlschlag.

const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

// Sauberer Ausgangszustand: kein Pilot-/Account-Gate, definierter CRON-Zustand,
// und lokaler Datei-Store (offline, deterministisch — kein Supabase/Netzwerk).
delete process.env.HELMUT_AUTH_MODE;
delete process.env.PILOT_SECRET;
delete process.env.HELMUT_ADMIN_SECRET;
delete process.env.CRON_SECRET;
// Backend hart auf "local" zwingen. loadLocalEnv() (im Server) ueberschreibt nur
// UNGESETZTE Keys — ein definierter Wert bleibt also erhalten und useSupabase()
// bleibt false (kein Netzwerk/Node-fetch noetig).
process.env.HELMUT_STORAGE_BACKEND = "local";

const handler = require(path.join(root, "server.js"));

function request(server, { method = "GET", pathname, headers = {} }) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: pathname, headers, timeout: 20000 }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    req.on("error", reject);
    req.end();
  });
}

async function cronChecks() {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const cronPath = "/api/cron/health-report"; // leichtester, offline-sicherer Cron-Endpoint

  try {
    // 1) kein Secret gesetzt -> 503 (fail closed)
    delete process.env.CRON_SECRET;
    const a = await request(server, { pathname: cronPath });
    check("Cron ohne CRON_SECRET wird blockiert (503)", a.status === 503, `status=${a.status}`);

    // 2) falsches Secret -> 403
    process.env.CRON_SECRET = "p1-test-secret";
    const b = await request(server, { pathname: cronPath, headers: { Authorization: "Bearer falsch" } });
    check("Cron mit falschem Secret wird blockiert (403)", b.status === 403, `status=${b.status}`);

    // 3) richtiges Secret -> autorisiert (Handler laeuft; nicht 403/503)
    const c = await request(server, { pathname: cronPath, headers: { Authorization: "Bearer p1-test-secret" } });
    check("Cron mit richtigem Secret ist autorisiert (nicht 403/503)", c.status !== 403 && c.status !== 503, `status=${c.status}`);
  } finally {
    delete process.env.CRON_SECRET;
    await new Promise((r) => server.close(r));
  }
}

function staticChecks() {
  const crawler = fs.readFileSync(path.join(root, "lib/helmut/crawler.js"), "utf8");
  check("TLS: kein rejectUnauthorized im Crawler", !crawler.includes("rejectUnauthorized"));

  const client = fs.readFileSync(path.join(root, "client.js"), "utf8");
  check("Fake-Termine entfernt (kein 'Treffen mit Gewerkschaft')", !client.includes("Treffen mit Gewerkschaft"));
  check("fallbackMeetings liefert keine erfundenen Termine", !client.includes("Ausschusssitzung Arbeit und Soziales\","));
  check("Keine Live-Referenz auf meta.fallbackDraft", !client.includes("|| meta.fallbackDraft"));
  check("Keine Live-Referenz auf resolvedMeta.fallbackDraft", !client.includes("resolvedMeta.fallbackDraft"));
  check("Erfundene Radar-Signale entfernt (keine 'Steuerdebatte …')", !client.includes("Steuerdebatte kann in Arbeit und Soziales wandern"));

  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  check("Cron fail-open Helper entfernt (kein isAuthorizedCron)", !server.includes("isAuthorizedCron"));
  check("Cron fail-closed Helper vorhanden (authorizeCron)", server.includes("function authorizeCron"));
}

async function llmLoggingChecks() {
  const storage = require(path.join(root, "lib/helmut/storage.js"));

  // Kostenschaetzung
  const known = storage.estimateLlmCost("gpt-5-mini", 1000, 500);
  check("estimateLlmCost: bekanntes Modell -> Zahl", typeof known === "number" && known > 0, `cost=${known}`);
  const unknown = storage.estimateLlmCost("nicht-existent", 1000, 500);
  check("estimateLlmCost: unbekanntes Modell -> null", unknown === null);

  // Persistenz (mit Cleanup, um den echten Auth-Store nicht zu verschmutzen)
  const authBefore = await storage.readAuthStore();
  const originalUsage = Array.isArray(authBefore.llmUsage) ? authBefore.llmUsage.slice() : [];
  try {
    const withUsage = await storage.recordLlmUsage({
      callType: "p1-test", politicianId: "p1-test-mp", model: "gpt-5-mini",
      usage: { input_tokens: 1200, output_tokens: 300, total_tokens: 1500 }, durationMs: 1234, success: true
    });
    check("LLM-Logging: Eintrag mit usage geschrieben (Token+Kosten erfasst)",
      withUsage && withUsage.totalTokens === 1500 && typeof withUsage.estimatedCost === "number",
      `tokens=${withUsage && withUsage.totalTokens} cost=${withUsage && withUsage.estimatedCost}`);

    const noUsage = await storage.recordLlmUsage({
      callType: "p1-test", politicianId: "p1-test-mp", model: "gpt-5-mini", durationMs: 50, success: false, error: "boom"
    });
    check("LLM-Logging: fehlender usage-Block -> 'unknown' statt stillem Verlust",
      noUsage && noUsage.totalTokens === "unknown" && noUsage.estimatedCost === "unknown" && noUsage.success === false);

    const list = await storage.getLlmUsage("p1-test-mp", 10);
    check("LLM-Logging: getLlmUsage liefert die Testeintraege (Mandanten-gefiltert)", list.length >= 2, `n=${list.length}`);
  } finally {
    // Auth-Store auf den urspruenglichen Stand zuruecksetzen.
    const authNow = await storage.readAuthStore();
    authNow.llmUsage = originalUsage;
    await storage.writeAuthStore(authNow);
  }
}

// Datenmotor V2 — Commit 1: LLM-Budget-Fundament (Tages-Aggregation + Gate).
// Rein additiv; prueft nur die neuen Storage-Helfer, kein Pipeline-Verhalten.
async function llmBudgetChecks() {
  const storage = require(path.join(root, "lib/helmut/storage.js"));
  const ref = "2026-07-01T12:00:00.000Z";
  const mp = "p1-budget-mp";

  const authBefore = await storage.readAuthStore();
  const originalUsage = Array.isArray(authBefore.llmUsage) ? authBefore.llmUsage.slice() : [];
  const originalLimit = process.env.HELMUT_MAX_LLM_CALLS_PER_DAY;
  try {
    // Store deterministisch bestuecken: 2 Calls heute, 1 an einem anderen Tag.
    const auth = await storage.readAuthStore();
    auth.llmUsage = [
      { id: "b1", createdAt: "2026-07-01T09:00:00.000Z", politicianId: mp, userId: mp, model: "gpt-5-mini", callType: "test", estimatedCost: 0.001, success: true },
      { id: "b2", createdAt: "2026-07-01T10:00:00.000Z", politicianId: mp, userId: mp, model: "gpt-5-mini", callType: "test", estimatedCost: 0.002, success: true },
      { id: "b3", createdAt: "2026-06-30T10:00:00.000Z", politicianId: mp, userId: mp, model: "gpt-5-mini", callType: "test", estimatedCost: 0.5, success: true }
    ];
    await storage.writeAuthStore(auth);

    const today = await storage.getLlmUsageToday(mp, ref);
    check("Budget: getLlmUsageToday zaehlt nur heutige Calls (Mandanten-gefiltert)",
      today.calls === 2 && Math.abs(today.estimatedCostUsd - 0.003) < 1e-9,
      `calls=${today.calls} cost=${today.estimatedCostUsd}`);

    // Kein Limit gesetzt -> immer erlaubt.
    delete process.env.HELMUT_MAX_LLM_CALLS_PER_DAY;
    const noLimit = await storage.canSpendLlm(mp, ref);
    check("Budget: ohne Limit erlaubt canSpendLlm (allowed=true, limit=null)",
      noLimit.allowed === true && noLimit.limit === null, `allowed=${noLimit.allowed}`);

    // Limit 5, erst 2 verbraucht -> erlaubt, 3 Rest.
    process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "5";
    const under = await storage.canSpendLlm(mp, ref);
    check("Budget: unter Limit erlaubt (remaining korrekt)",
      under.allowed === true && under.remaining === 3, `remaining=${under.remaining}`);

    // Limit 2, bereits 2 verbraucht -> blockiert.
    process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "2";
    const at = await storage.canSpendLlm(mp, ref);
    check("Budget: bei erreichtem Limit blockiert (allowed=false, Grund gesetzt)",
      at.allowed === false && at.reason === "daily-llm-budget-reached", `allowed=${at.allowed} reason=${at.reason}`);
  } finally {
    if (originalLimit === undefined) delete process.env.HELMUT_MAX_LLM_CALLS_PER_DAY;
    else process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = originalLimit;
    const authNow = await storage.readAuthStore();
    authNow.llmUsage = originalUsage;
    await storage.writeAuthStore(authNow);
  }
}

async function main() {
  console.log("== Helmut P1 Security & Trust Checks ==\n");
  staticChecks();
  await cronChecks();
  await llmLoggingChecks();
  await llmBudgetChecks();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} Checks bestanden.`);
  if (failed.length) {
    console.log("Fehlgeschlagen:", failed.map((f) => f.name).join("; "));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error("P1-Check abgestuerzt:", error);
  process.exit(1);
});
