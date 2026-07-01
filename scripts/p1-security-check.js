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

  // Datenmotor V2, Commit 3: keine hardcodierten Cem-Namen mehr im KI-/Entity-Pfad.
  const ai = fs.readFileSync(path.join(root, "lib/helmut/ai.js"), "utf8");
  check("KI: kein hardcodiertes 'Guten Abend, Cem.'", !ai.includes("Guten Abend, Cem."));
  check("KI: kein 'Cem'-Fallbackname mehr", !ai.includes('|| "Cem"'));
  const runtimeSrc = fs.readFileSync(path.join(root, "lib/helmut/runtime.js"), "utf8");
  check("Entity-Erkennung: kein hardcodiertes 'Cem Ince' in inferEntities-Liste", !/const entities = \[.*Cem Ince/.test(runtimeSrc));
}

// Datenmotor V2, Commit 3: inferEntities leitet Personen/Partei aus dem Profil ab.
function entityChecks() {
  const { inferEntities } = require(path.join(root, "lib/helmut/runtime.js"));
  const item = { title: "Muster fordert mehr Klimaschutz", content: "Die Grünen im Bundestag unterstützen Erika Muster.", sourceId: "source-x" };

  const forMuster = inferEntities(item, { fullName: "Erika Muster", party: "Grüne", faction: "Bündnis 90/Die Grünen", committees: [], relevantMinistries: [], opponents: [] });
  check("Entity: Mandats-Person/Partei aus Profil erkannt (Muster/Grüne)",
    forMuster.includes("Erika Muster") && forMuster.includes("Bundestag"), `entities=${JSON.stringify(forMuster)}`);
  check("Entity: KEIN fremder 'Cem Ince' bei Fremd-Mandat",
    !forMuster.includes("Cem Ince") && !forMuster.includes("Die Linke"), `entities=${JSON.stringify(forMuster)}`);

  const noProfile = inferEntities(item, null);
  check("Entity: ohne Profil nur generische Institutionen (kein Personenname)",
    noProfile.includes("Bundestag") && !noProfile.some((e) => e.includes("Muster")), `entities=${JSON.stringify(noProfile)}`);
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

    // Skip-Eintraege ("skipped-*") zaehlen NICHT gegen das Budget.
    const auth2 = await storage.readAuthStore();
    auth2.llmUsage = [
      { id: "s1", createdAt: "2026-07-01T11:00:00.000Z", politicianId: mp, userId: mp, model: "none", callType: "skipped-budget", estimatedCost: 0, success: true },
      { id: "s2", createdAt: "2026-07-01T11:30:00.000Z", politicianId: mp, userId: mp, model: "gpt-5-mini", callType: "v2ScoreAndPrioritize", estimatedCost: 0.001, success: true }
    ];
    await storage.writeAuthStore(auth2);
    const skipDay = await storage.getLlmUsageToday(mp, ref);
    check("Budget: skipped-* zaehlt NICHT als Call (nur echter Call gezaehlt)",
      skipDay.calls === 1, `calls=${skipDay.calls}`);
  } finally {
    if (originalLimit === undefined) delete process.env.HELMUT_MAX_LLM_CALLS_PER_DAY;
    else process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = originalLimit;
    const authNow = await storage.readAuthStore();
    authNow.llmUsage = originalUsage;
    await storage.writeAuthStore(authNow);
  }
}

// Datenmotor V2 — Commit 2: echte Personalisierung / Cem-Entkopplung.
// Deterministischer Unit-Test der reinen Merge-Funktion (kein Store noetig).
function personalizationChecks() {
  const scheduler = require(path.join(root, "lib/helmut/scheduler.js"));

  // Demo-Profil cem-ince behaelt seine reichhaltigen Defaults (kein Regress).
  const cem = scheduler.mergeProfileDefaults({ id: "cem-ince" });
  check("Personalisierung: cem-ince behaelt Ausschuss 'Arbeit und Soziales'",
    Array.isArray(cem.committees) && cem.committees.includes("Arbeit und Soziales"),
    `committees=${JSON.stringify(cem.committees)}`);
  check("Personalisierung: cem-ince behaelt Fokusthemen (z. B. Bürgergeld)",
    Array.isArray(cem.focusTopics) && cem.focusTopics.includes("Bürgergeld"));

  // Fremdes Mandat erbt KEINE Cem-Inhalte mehr.
  const other = scheduler.mergeProfileDefaults({
    id: "erika-muster", fullName: "Erika Muster", party: "CDU", faction: "CDU/CSU",
    committees: ["Umwelt"], focusTopics: ["Klima"], topicPriorities: { Klima: 5 }
  });
  check("Personalisierung: Fremd-Mandat hat NUR eigene Ausschuesse (kein Cem-Leak)",
    JSON.stringify(other.committees) === JSON.stringify(["Umwelt"]),
    `committees=${JSON.stringify(other.committees)}`);
  check("Personalisierung: Fremd-Mandat erbt KEINE Cem-Themen (kein 'Bürgergeld'/'Mindestlohn')",
    !other.focusTopics.includes("Bürgergeld") && !other.focusTopics.includes("Mindestlohn") && other.focusTopics.includes("Klima"),
    `focusTopics=${JSON.stringify(other.focusTopics)}`);
  check("Personalisierung: Fremd-Mandat erbt KEINE Cem-Topicprioritaeten (nur eigene)",
    JSON.stringify(other.topicPriorities) === JSON.stringify({ Klima: 5 }),
    `topicPriorities=${JSON.stringify(other.topicPriorities)}`);
  check("Personalisierung: Fremd-Mandat erbt KEINE Cem-Gegner/Regionalbezuege",
    (other.opponents || []).length === 0 && (other.regionalInterests || []).length === 0 && (other.upcomingAppointments || []).length === 0);
  check("Personalisierung: Fremd-Mandat behaelt eigene Partei/Fraktion",
    other.party === "CDU" && other.faction === "CDU/CSU");
}

// Datenmotor V2 — Commit 4: Hybrid-Scoring hinter Flag HELMUT_ENGINE_V2.
// Offline-Test: Flag-Parsing + ehrlicher Fallback bei deaktivierter KI (kein Key).
async function engineV2Checks() {
  const ai = require(path.join(root, "lib/helmut/ai.js"));
  const originalFlag = process.env.HELMUT_ENGINE_V2;
  const originalOpenAi = process.env.OPENAI_API_KEY;
  const originalAzKey = process.env.AZURE_OPENAI_KEY;
  const originalAzEnd = process.env.AZURE_OPENAI_ENDPOINT;
  try {
    // Flag-Parsing: Default OFF, diverse Wahr-Werte AN.
    delete process.env.HELMUT_ENGINE_V2;
    check("V2-Flag: Default AUS (kein Env)", ai.isEngineV2Enabled() === false);
    process.env.HELMUT_ENGINE_V2 = "1";
    const on1 = ai.isEngineV2Enabled();
    process.env.HELMUT_ENGINE_V2 = "true";
    const on2 = ai.isEngineV2Enabled();
    process.env.HELMUT_ENGINE_V2 = "off";
    const off = ai.isEngineV2Enabled();
    check("V2-Flag: '1'/'true' AN, 'off' AUS", on1 === true && on2 === true && off === false);

    // KI deaktivieren -> ehrlicher Fallback ohne Fake-Inhalt, Items unveraendert.
    delete process.env.OPENAI_API_KEY;
    delete process.env.AZURE_OPENAI_KEY;
    delete process.env.AZURE_OPENAI_ENDPOINT;
    const briefing = { id: "b-v2", items: [
      { id: "i1", title: "A", decision: "Sofort reagieren", priority: 80 },
      { id: "i2", title: "B", decision: "Beobachten", priority: 50 }
    ] };
    const out = await ai.enrichBriefingWithAiV2(briefing, { id: "cem-ince", fullName: "Cem Ince" });
    check("V2-Fallback (KI aus): Items unveraendert, ehrlich markiert (kein Fake)",
      out.ai && out.ai.enabled === false && out.v2 && out.v2.scored === false
        && out.items.length === 2 && out.items[0].id === "i1" && !out.items[0].aiEnhanced,
      `enabled=${out.ai && out.ai.enabled} scored=${out.v2 && out.v2.scored}`);

    // aiScoreCandidates mit leerer Liste -> [] (kein Call, kein Crash).
    const empty = await ai.aiScoreCandidates([], { id: "x" });
    check("V2: aiScoreCandidates([]) -> [] (kein LLM-Call)", Array.isArray(empty) && empty.length === 0);

    // Kostenoptimierung: V2 nutzt gpt-5-mini (OpenAI direkt, kein Azure).
    const origV2Model = process.env.HELMUT_ENGINE_V2_MODEL;
    delete process.env.HELMUT_ENGINE_V2_MODEL;
    check("V2-Kosten: Default-Modell ist gpt-5-mini (guenstig)", ai.v2ModelName() === "gpt-5-mini", `model=${ai.v2ModelName()}`);
    if (origV2Model !== undefined) process.env.HELMUT_ENGINE_V2_MODEL = origV2Model;
  } finally {
    if (originalFlag === undefined) delete process.env.HELMUT_ENGINE_V2; else process.env.HELMUT_ENGINE_V2 = originalFlag;
    if (originalOpenAi !== undefined) process.env.OPENAI_API_KEY = originalOpenAi;
    if (originalAzKey !== undefined) process.env.AZURE_OPENAI_KEY = originalAzKey;
    if (originalAzEnd !== undefined) process.env.AZURE_OPENAI_ENDPOINT = originalAzEnd;
  }
}

// Datenmotor V2 — Commit 6: Erklaerbarkeit im Pipeline-Debug-Report.
function debugReportChecks() {
  const scheduler = require(path.join(root, "lib/helmut/scheduler.js"));
  const savedBriefing = {
    status: "Aktuell",
    ai: { enabled: true, engine: "v2", model: "gpt-5-mini" },
    v2: { scored: true, candidates: 20, ranked: 5, top1Justification: "Betrifft deinen Ausschuss direkt und ist heute entscheidungsreif." },
    topics: [],
    items: [
      { id: "i1", title: "Top-Thema", decision: "Sofort reagieren", priority: 82, aiRelevanceScore: 91, reactOrObserve: "react", affectsMandate: true, rank: 1, rankReason: "Hoechste Dringlichkeit + Mandatsbezug", whyItMatters: "Kernthema", riskNote: "Deutungshoheit", inactionConsequence: "Andere besetzen das Thema", sources: [] }
    ]
  };
  const report = scheduler.buildPipelineDebugReport({
    profile: { id: "cem-ince", fullName: "Cem Ince", party: "Die Linke", committees: ["Arbeit und Soziales"], focusTopics: [] },
    latestCrawl: null, recentItems: [], situationalRecentItems: [], mentionItems: [],
    relevanceDiagnostics: [], relevantItems: [], situationalItems: [],
    promotedSituationalItems: [], briefingInputItems: [],
    liveBriefing: null, savedBriefing, usesLiveBriefing: true,
    aiBudget: { allowed: true, used: 2, limit: 6, remaining: 4, reason: null }, aiUsed: true
  });

  check("Debug: engine-Block zeigt V2-Modus + Modell",
    report.engine && report.engine.mode === "v2" && report.engine.model === "gpt-5-mini",
    `mode=${report.engine && report.engine.mode}`);
  check("Debug: 'Warum Top 1' (top1Justification) protokolliert",
    typeof report.engine.top1Justification === "string" && report.engine.top1Justification.length > 0);
  check("Debug: Budget-Status im Report (used/limit)",
    report.engine.budget && report.engine.budget.used === 2 && report.engine.budget.limit === 6);
  const fi = report.finalItems[0];
  check("Debug: Final-Item zeigt Regel-Score UND KI-Score getrennt",
    fi.ruleScore === 82 && fi.aiRelevanceScore === 91, `rule=${fi.ruleScore} ai=${fi.aiRelevanceScore}`);
  check("Debug: Final-Item zeigt KI-Entscheid + Rang + Begruendung",
    fi.reactOrObserve === "react" && fi.rank === 1 && fi.rankReason.length > 0 && fi.affectsMandate === true);
}

async function main() {
  console.log("== Helmut P1 Security & Trust Checks ==\n");
  staticChecks();
  personalizationChecks();
  entityChecks();
  debugReportChecks();
  await engineV2Checks();
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
