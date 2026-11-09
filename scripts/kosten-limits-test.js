"use strict";

// Kosten- und Limit-Schutz (Audit-Fix 2026-07, Sprint 2). KEIN Netz, KEINE KI.
// Prueft drei Schutzschichten:
//   1. llmDailyCallLimit: NUR eine positive ganze Zahl setzt das Limit. ALLES
//      andere (fehlend, leer, 0, negativ, unparsebar) faellt fail-closed auf das
//      Schutzlimit 50 — es gibt KEINEN Infinity-Pfad mehr (Budget-Rollout 2026-07:
//      auch das versehentliche LOESCHEN der Vercel-Variable hebt den Deckel nicht
//      mehr still auf).
//   2. generateCommunicationDraft respektiert das Budget-Gate: bei erschoepftem
//      Budget KEIN LLM-Call, ehrlicher Regel-Fallback (fallbackReason
//      'budget-erschoepft'), Skip als Info-Eintrag protokolliert.
//   3. Client: harte Obergrenze pro App-Start im Buero-Loop (frueher bis 16
//      LLM-Calls pro Geraet und Oeffnen).

const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

(async () => {
  const storage = require("../lib/helmut/storage");
  const envBefore = process.env.HELMUT_MAX_LLM_CALLS_PER_DAY;

  // ── 1) llmDailyCallLimit ──────────────────────────────────────────────────
  const cases = [
    ["", 50, "fehlend/geloescht -> Schutzlimit 50 (kein stilles 'unbegrenzt')"],
    ["0", 50, "0 -> Schutzlimit 50 (kein Opt-out-Wert mehr)"],
    ["1", 1, "Limit 1 wirkt exakt (Minimalwert)"],
    ["20", 20, "bisheriger Production-Wert wirkt exakt"],
    ["100", 100, "Rollout-Zielwert wirkt exakt"],
    ["150", 150, "gueltiger Wert wirkt exakt"],
    ["150.9", 150, "Dezimalwert wird abgerundet"],
    [" 25 ", 25, "Whitespace wird toleriert"],
    ["2Oo", 50, "Tippfehler -> Schutzlimit 50 (fail-closed, NICHT unbegrenzt)"],
    ["abc", 50, "Unsinn -> Schutzlimit 50"],
    ["-5", 50, "negativ -> Schutzlimit 50"]
  ];
  for (const [value, expected, label] of cases) {
    if (value === "") delete process.env.HELMUT_MAX_LLM_CALLS_PER_DAY;
    else process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = value;
    const got = storage.llmDailyCallLimit();
    check(`Limit "${value}": ${label}`, got === expected, `erwartet=${expected} erhalten=${got}`);
  }
  if (envBefore === undefined) delete process.env.HELMUT_MAX_LLM_CALLS_PER_DAY;
  else process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = envBefore;

  // ── 2) Budget-Gate im Kommunikationspfad ──────────────────────────────────
  const keyBefore = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only-key-niemals-echt";
  const ai = require("../lib/helmut/ai");

  const origTenant = storage.canSpendLlmForTenant;
  const origRecord = storage.recordLlmUsage;
  const recorded = [];
  let tenantCalls = 0;
  storage.canSpendLlmForTenant = async (pid, budgets) => {
    tenantCalls += 1;
    return { allowed: false, reason: "daily-llm-budget-reached", tenantBudget: { applied: true } };
  };
  storage.recordLlmUsage = async (entry) => { recorded.push(entry); };

  try {
    const decision = { title: "Testvorgang", statement: "Kernaussage.", summary: "Zusammenfassung." };
    const res = await ai.generateCommunicationDraft({
      prompt: "x", decision, channel: "press",
      profile: { id: "mdb-test", aiBudgetDailyCents: 100, aiBudgetMonthlyCents: 1000 }
    });
    check("Budget erschoepft: KEIN KI-Text, ehrlicher Fallback",
      res.aiEnabled === false && res.degraded === true && res.fallbackReason === "budget-erschoepft",
      JSON.stringify({ aiEnabled: res.aiEnabled, reason: res.fallbackReason }));
    check("Budget erschoepft: Grund wird durchgereicht", res.budgetReason === "daily-llm-budget-reached");
    check("Budget erschoepft: regelbasierter Text vorhanden", Boolean(res.text && res.text.length > 10));
    check("Budget-Gate wurde tatsaechlich befragt (per-Mandant)", tenantCalls === 1, `calls=${tenantCalls}`);
    check("Skip wird als Info-Eintrag protokolliert (skipped-communicationDraft)",
      recorded.some((e) => e.callType === "skipped-communicationDraft" && e.politicianId === "mdb-test"),
      JSON.stringify(recorded));
  } finally {
    storage.canSpendLlmForTenant = origTenant;
    storage.recordLlmUsage = origRecord;
    if (keyBefore === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = keyBefore;
  }

  // Struktur: das Gate steht VOR dem LLM-Call.
  const aiSource = fs.readFileSync(path.join(root, "lib/helmut/ai.js"), "utf8");
  const gateIdx = aiSource.indexOf("budget-erschoepft");
  const callIdx = aiSource.indexOf('requestJson(aiPrompt, { callType: "communicationDraft"');
  check("Gate steht im Quelltext VOR dem requestJson-Call", gateIdx > 0 && callIdx > gateIdx);

  // ── 3) Client: keine Massengenerierung, ein gewählter Entwurf ─────────────
  const clientSource = fs.readFileSync(path.join(root, "client.js"), "utf8");
  const selected = clientSource.slice(clientSource.indexOf("async function generateSelectedOfficeDraft()"), clientSource.indexOf("async function shareOfficeDraft("));
  check("Appstart enthält keine automatische Büro-Massenerzeugung",
    !clientSource.includes("generateOfficeDraftsInBackground") && !clientSource.includes("OFFICE_DRAFTS_MAX_CALLS_PER_RUN"));
  check("Ein ausgewählter Entwurf statt Formatbatch",
    selected.includes("const { decision, format } = selectedOfficeDraft") &&
    (selected.match(/await generateStatementWithBackend\(/g) || []).length === 1);
  check("Laufende Anfrage und gültiger Cache verhindern weitere Aufrufe",
    selected.includes("if (officeDraftsGenerating) return") && selected.includes("if (officeDraftEntry(decision, format)) return"));

  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("TESTFEHLER", e); process.exit(1); });
