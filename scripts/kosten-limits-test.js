"use strict";

// Kosten- und Limit-Schutz (Audit-Fix 2026-07, Sprint 2). KEIN Netz, KEINE KI.
// Prueft drei Schutzschichten:
//   1. llmDailyCallLimit: GESETZTER, aber UNGUELTIGER Wert faellt fail-closed auf
//      ein Schutzlimit (50) statt still auf "unbegrenzt" (frueher: Number("2Oo")
//      -> NaN -> Infinity — ein Tippfehler hob den Kostendeckel auf).
//      Dokumentiertes Verhalten bleibt: leer/0 = bewusst kein Limit.
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
    ["", Infinity, "leer = dokumentiert kein Limit"],
    ["0", Infinity, "0 = dokumentiert kein Limit"],
    ["150", 150, "gueltiger Wert wirkt exakt"],
    ["150.9", 150, "Dezimalwert wird abgerundet"],
    [" 25 ", 25, "Whitespace wird toleriert"],
    ["2Oo", 50, "Tippfehler -> Schutzlimit 50 (fail-closed, NICHT unbegrenzt)"],
    ["abc", 50, "Unsinn -> Schutzlimit 50"],
    ["-5", 50, "negativ (undokumentiert) -> Schutzlimit 50"]
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

  // ── 3) Client: Obergrenze pro App-Start ───────────────────────────────────
  const clientSource = fs.readFileSync(path.join(root, "client.js"), "utf8");
  check("Buero-Loop hat harte Obergrenze pro Lauf (OFFICE_DRAFTS_MAX_CALLS_PER_RUN)",
    /OFFICE_DRAFTS_MAX_CALLS_PER_RUN = \d+/.test(clientSource) &&
    clientSource.includes("missing.slice(0, OFFICE_DRAFTS_MAX_CALLS_PER_RUN)"));
  check("Buero-Loop iteriert ueber das gedeckelte Batch, nicht ueber alle fehlenden",
    /for \(const \{ decision, format, key \} of batch\)/.test(clientSource));
  const capMatch = clientSource.match(/OFFICE_DRAFTS_MAX_CALLS_PER_RUN = (\d+)/);
  check("Obergrenze ist konservativ (<= 8)", capMatch && Number(capMatch[1]) <= 8, capMatch && capMatch[1]);

  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("TESTFEHLER", e); process.exit(1); });
