"use strict";

// LLM-Budget-Rollout (2026-07): Funktionale Gesamtdeckel-Matrix.
// KEIN Netz — der OpenAI-Transport (https.request) wird prozesslokal gefakt,
// alles andere (Gate, Zaehler, Usage-Log, Fallbacks) laeuft ECHT ueber den
// lokalen Datei-Store. Beweist end-to-end:
//   - Kommunikation/Buero und Understanding teilen EINEN globalen Tagesdeckel
//   - Calls vor dem Limit laufen, Calls ab dem Limit werden kontrolliert gestoppt
//   - exaktes Erreichen (used == limit -> Stopp), kein sequentielles Ueberschreiten
//   - Skips werden protokolliert und zaehlen NICHT als billable
//   - Fail-Closed: echter Budget-Pruefungsfehler blockt (Flag an) bzw. laesst
//     kontrolliert weiterlaufen (Flag aus) — nie ein roher Fehler beim Nutzer
//   - Parallel-Burst: begrenzte, dokumentierte Abweichung; der Zaehler ist
//     store-basiert (KEIN Prozess-/Instanz-Gedaechtnis) und konvergiert

const fs = require("fs");
const path = require("path");
const https = require("https");
const { EventEmitter } = require("events");
const root = path.join(__dirname, "..");

// Datei-Backend erzwingen (kein Supabase im Normalteil).
delete process.env.HELMUT_STORAGE_BACKEND;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED;
delete process.env.AZURE_OPENAI_KEY;
delete process.env.AZURE_OPENAI_ENDPOINT;
process.env.OPENAI_API_KEY = "test-only-key-niemals-echt";

// Hermetik: beruehrte Store-Dateien sichern/wiederherstellen.
const dataDir = path.join(root, ".helmut-data");
const GUARDED = ["auth.json", "store.json"];
const snapshots = new Map();
for (const name of GUARDED) {
  const file = path.join(dataDir, name);
  snapshots.set(name, fs.existsSync(file) ? fs.readFileSync(file) : null);
}
const envSnapshot = {
  limit: process.env.HELMUT_MAX_LLM_CALLS_PER_DAY,
  failClosed: process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED
};
process.on("exit", () => {
  for (const [name, content] of snapshots.entries()) {
    const file = path.join(dataDir, name);
    try {
      if (content === null) { if (fs.existsSync(file)) fs.rmSync(file); }
      else fs.writeFileSync(file, content);
    } catch (_) { /* Hygiene */ }
  }
});

// ── Fake-OpenAI-Transport: NUR api.openai.com wird gefakt, alles andere echt ──
const realHttpsRequest = https.request.bind(https);
let fakeAiCalls = 0;
https.request = function fakeRequest(url, options, callback) {
  const target = String(url || "");
  if (!target.includes("api.openai.com")) return realHttpsRequest(url, options, callback);
  fakeAiCalls += 1;
  const req = new EventEmitter();
  req.write = () => {};
  req.destroy = () => {};
  req.end = () => {
    const res = new EventEmitter();
    res.statusCode = 200;
    res.setEncoding = () => {};
    setImmediate(() => {
      callback(res);
      res.emit("data", JSON.stringify({
        output_text: JSON.stringify({ text: "Test-Entwurf aus der Fake-KI.", rationale: "Testlauf" }),
        usage: { input_tokens: 10, output_tokens: 12 }
      }));
      res.emit("end");
    });
  };
  return req;
};

const storage = require("../lib/helmut/storage");
const ai = require("../lib/helmut/ai");
const { understandOneCluster } = require("../lib/helmut/understanding");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}
const settle = (ms = 120) => new Promise((r) => setTimeout(r, ms));

async function resetUsage() {
  const store = await storage.readAuthStore();
  store.llmUsage = [];
  await storage.writeAuthStore(store);
}
async function billableCount() {
  const usage = await storage.getLlmUsageToday(null);
  return usage.calls;
}

const decision = { title: "Testvorgang Budget", suggestedStatement: "Wir stehen fuer soziale Sicherheit.", recommendedAction: "Kleine Anfrage vorbereiten." };
const profile = { id: "cem-test", fullName: "Test MdB" };
const commDraft = () => ai.generateCommunicationDraft({ prompt: "Kurzes Statement", decision, profile, channel: "press" });

function understandingDeps(track) {
  return {
    getExisting: async () => null,
    canSpend: () => storage.canSpendLlm(null),
    requestUnderstanding: async () => {
      track.aiCalls += 1;
      // wie ai.js: der echte Call landet als billable Eintrag im Usage-Log
      await storage.recordLlmUsage({ callType: "understanding", model: "fake", politicianId: null, success: true });
      return { was_ist_passiert: "x" }; // bewusst minimal — Validierung ist hier egal
    },
    save: async () => {},
    saveSources: async () => {},
    markFailed: async () => { track.failed += 1; },
    modelName: () => "fake",
    logSkip: (callType) => { track.skips.push(callType); storage.recordLlmUsage({ callType, model: "none", politicianId: null, success: false }).catch(() => {}); }
  };
}
const cluster = { documents: [{ title: "Testdokument", url: "https://example.org/x" }], headline: "Test" };

(async () => {
  // ── A) Gesamtdeckel: Kommunikation + Understanding teilen EIN Budget (Limit 3)
  process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "3";
  await resetUsage();

  const fresh = await storage.canSpendLlm(null);
  check("A1 frisch: allowed, used=0, limit=3, remaining=3",
    fresh.allowed === true && fresh.used === 0 && fresh.limit === 3 && fresh.remaining === 3, JSON.stringify(fresh));

  const c1 = await commDraft(); await settle();
  check("A2 Kommunikation VOR Limit: echter KI-Entwurf (aiEnabled=true)", c1.aiEnabled === true && /Fake-KI/.test(c1.text), JSON.stringify(c1).slice(0, 200));
  check("A3 Call wurde als billable gezaehlt", (await billableCount()) === 1);

  const track1 = { aiCalls: 0, failed: 0, skips: [] };
  await understandOneCluster(cluster, understandingDeps(track1)); await settle();
  check("A4 Understanding VOR Limit: KI-Call laeuft (Budget erlaubt)", track1.aiCalls === 1, JSON.stringify(track1));
  check("A5 gemischter Zaehler: 2 billable (1 Comm + 1 Understanding)", (await billableCount()) === 2);

  const c2 = await commDraft(); await settle();
  check("A6 Kommunikation #2 VOR Limit: laeuft", c2.aiEnabled === true);
  const exact = await storage.canSpendLlm(null);
  check("A7 Budget EXAKT erreicht: used=3, allowed=false, remaining=0, klarer Grund",
    exact.used === 3 && exact.allowed === false && exact.remaining === 0 && exact.reason === "daily-llm-budget-reached", JSON.stringify(exact));

  const c3 = await commDraft(); await settle();
  check("A8 Kommunikation NACH Limit: kontrollierter Regel-Fallback (kein KI-Call, kein Rohfehler)",
    c3.aiEnabled === false && c3.degraded === true && c3.fallbackReason === "budget-erschoepft" && typeof c3.text === "string" && c3.text.length > 10, JSON.stringify(c3).slice(0, 220));

  const track2 = { aiCalls: 0, failed: 0, skips: [] };
  const u2 = await understandOneCluster(cluster, understandingDeps(track2)); await settle();
  check("A9 Understanding NACH Limit: skipped-budget, KEIN KI-Call (derselbe Topf wie Buero)",
    u2.status === "skipped-budget" && track2.aiCalls === 0 && track2.skips.includes("skipped-understanding-budget"), JSON.stringify({ u2, track2 }));

  check("A10 sequentiell KEIN Ueberschreiten: billable bleibt exakt 3", (await billableCount()) === 3);
  const usageAll = await storage.getLlmUsage(null, 50);
  const skipEntries = usageAll.filter((e) => String(e.callType || "").startsWith("skipped-"));
  check("A11 Skips protokolliert (communicationDraft + understanding), zaehlen nicht als billable",
    skipEntries.some((e) => e.callType === "skipped-communicationDraft") && skipEntries.some((e) => e.callType === "skipped-understanding-budget"), JSON.stringify(skipEntries.map((e) => e.callType)));

  // ── B) Limit 1 (Minimalwert) funktional ─────────────────────────────────────
  process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "1";
  await resetUsage();
  const b1 = await commDraft(); await settle();
  const b2 = await commDraft(); await settle();
  check("B1 Limit 1: erster Call laeuft, zweiter faellt kontrolliert zurueck",
    b1.aiEnabled === true && b2.aiEnabled === false && b2.fallbackReason === "budget-erschoepft");

  // ── C) Parallel-Burst: dokumentierte, BEGRENZTE Abweichung + Konvergenz ─────
  process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "3";
  await resetUsage();
  const burst = await Promise.all(Array.from({ length: 6 }, () => commDraft()));
  await settle(250);
  const allowedInBurst = burst.filter((r) => r.aiEnabled === true).length;
  check("C1 Parallel-Burst (6 Calls, Limit 3): mindestens das Limit laeuft, Abweichung bleibt auf Burst begrenzt",
    allowedInBurst >= 3 && allowedInBurst <= 6, `erlaubt=${allowedInBurst}`);
  console.log(`      (dokumentierte Race-Abweichung in diesem Lauf: ${Math.max(0, allowedInBurst - 3)} Call(s) ueber Limit)`);
  // Konvergenz: sequentielle Folge-Calls lesen den ECHTEN Store-Zaehler und
  // muessen binnen weniger Schritte hart auf "gesperrt" laufen.
  let denied = false;
  let extra = 0;
  for (; extra < 10 && !denied; extra += 1) {
    const r = await commDraft(); await settle();
    denied = r.aiEnabled === false && r.fallbackReason === "budget-erschoepft";
  }
  const afterBurst = await storage.canSpendLlm(null);
  check("C2 Zaehler konvergiert (store-basiert, kein Prozess-Gedaechtnis): sequentiell wird hart gesperrt",
    denied === true && afterBurst.allowed === false && afterBurst.used >= 3, JSON.stringify({ extra, afterBurst }));
  const storeEntries = (await storage.getLlmUsage(null, 100)).filter((e) => !String(e.callType || "").startsWith("skipped-")).length;
  check("C3 Ein-Quellen-Wahrheit: canSpendLlm.used == billable Eintraege im Store",
    afterBurst.used === storeEntries, `used=${afterBurst.used} store=${storeEntries}`);

  // ── D) Fail-Closed: ECHTER Budget-Pruefungsfehler (Store unerreichbar) ──────
  process.env.HELMUT_STORAGE_BACKEND = "supabase";
  process.env.SUPABASE_URL = "http://127.0.0.1:9";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy-niemals-echt";

  process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED = "1";
  const closed = await storage.canSpendLlm(null);
  check("D1 Fail-Closed AN + Pruefung kaputt: allowed=false (kein unbegrenztes Weiterlaufen)",
    closed.allowed === false && closed.reason === "budget-check-failed-closed", JSON.stringify(closed));
  const cClosed = await commDraft();
  check("D2 Buero unter Fail-Closed-Fehler: kontrollierter Fallback statt Rohfehler",
    cClosed.aiEnabled === false && cClosed.degraded === true && typeof cClosed.text === "string" && cClosed.text.length > 10, JSON.stringify(cClosed).slice(0, 200));

  delete process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED;
  const open = await storage.canSpendLlm(null);
  check("D3 Fail-Closed AUS + Pruefung kaputt: bisheriges fail-open Verhalten, klar begruendet",
    open.allowed === true && open.reason === "budget-check-failed-open", JSON.stringify(open));

  delete process.env.HELMUT_STORAGE_BACKEND;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  // ── E) Lage-Skip-Protokoll (strukturell): Budget-Ablehnung im Lage-Narrativ
  //      schreibt denselben Skip-Eintrag wie Understanding/Kommunikation,
  //      gekapselt in try/catch (Telemetrie darf Lage nie brechen).
  const lageSource = fs.readFileSync(path.join(root, "lib/helmut/lage.js"), "utf8");
  check("E1 Lage protokolliert Budget-Skips (skipped-lage-narrativ, fail-safe gekapselt)",
    /skipped-lage-narrativ/.test(lageSource) && /try \{ storage\.recordLlmUsage\(\{ callType: "skipped-lage-narrativ"/.test(lageSource));

  // ── F) Env wiederherstellen ─────────────────────────────────────────────────
  if (envSnapshot.limit === undefined) delete process.env.HELMUT_MAX_LLM_CALLS_PER_DAY;
  else process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = envSnapshot.limit;
  if (envSnapshot.failClosed === undefined) delete process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED;
  else process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED = envSnapshot.failClosed;

  console.log(`\n${passed} PASS, ${failed} FAIL  (Fake-KI-Transportaufrufe: ${fakeAiCalls})`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("TESTFEHLER", e); process.exit(1); });
