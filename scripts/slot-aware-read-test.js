"use strict";

// Helmut Core V3 — Tests fuer den slot-aware Read-Pfad (kleinster sicherer Schritt).
// KEIN Netz, KEINE KI. Prueft ausschliesslich die sichere, rueckwaertskompatible
// DURCHREICHUNG des briefingType (Slot) im Read-Pfad — KEINE Persistenz, KEIN
// Scheduler, KEIN neuer LLM-Call, KEINE Frische-Aussage:
//   a) Slot-Ableitung Europe/Berlin (Zeitgrenzen morning/midday/evening).
//   b) Override (daily/morning/midday/evening; ungueltig -> daily, kein Crash).
//   c) Contract-Threading (toBriefingContractV3 -> currentHelmutState.briefingType).
//   d) Read-Pfad (__buildV3Briefing setzt briefingType aus Ableitung ODER Override).
//   e) 0-KI-Invariante (Slot-aware Read loest keinen LLM-Call aus).
//   f) Security (keine Kostenwerte/Demo-Texte/Frontend-Fallbacks/Client-LLM; keine
//      falsche Frische — Slot aendert NUR das Label, nie die Daten/lastUpdated).

const bl = require("../lib/helmut/briefingLanguage");
const contract = require("../lib/helmut/briefingContract");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const TZ = "Europe/Berlin";

// --- a) Slot-Ableitung Europe/Berlin ----------------------------------------
// Die geforderten Grenzen sind LOKALE Berlin-Wanduhrzeiten. Um DST-unabhaengig
// zu testen, werden sie als UTC-Instants eines WINTER-Tages (Berlin = UTC+1)
// konstruiert: Berlin-lokal = UTC + 1h.
const WINTER = {
  "morning@00:00": { iso: "2026-01-14T23:00:00Z", exp: "morning" }, // Berlin 00:00
  "morning@10:59": { iso: "2026-01-15T09:59:00Z", exp: "morning" }, // Berlin 10:59
  "midday@11:00":  { iso: "2026-01-15T10:00:00Z", exp: "midday" },  // Berlin 11:00
  "midday@16:59":  { iso: "2026-01-15T15:59:00Z", exp: "midday" },  // Berlin 16:59
  "evening@17:00": { iso: "2026-01-15T16:00:00Z", exp: "evening" }, // Berlin 17:00
  "evening@23:59": { iso: "2026-01-15T22:59:00Z", exp: "evening" }  // Berlin 23:59
};
for (const [label, { iso, exp }] of Object.entries(WINTER)) {
  const got = bl.deriveBriefingTypeFromDate(new Date(iso), TZ);
  check(`Ableitung ${label} -> ${exp}`, got === exp, `got=${got}`);
}
// Sommer (Berlin = UTC+2): Berlin 11:00 = UTC 09:00 -> midday (DST greift korrekt).
check("Ableitung DST-bewusst (Sommer Berlin 11:00 -> midday)",
  bl.deriveBriefingTypeFromDate(new Date("2026-07-15T09:00:00Z"), TZ) === "midday");
// Default-Zone: ohne timezone-Argument wird Europe/Berlin genutzt (kein Crash).
check("Ableitung nutzt Default-Zone Europe/Berlin ohne Argument",
  ["morning", "midday", "evening", "daily"].includes(bl.deriveBriefingTypeFromDate(new Date("2026-01-15T10:00:00Z"))));
// Robustheit: ungueltige Date/Zone -> 'daily' (nie Crash, keine erfundene Tageszeit).
check("Ableitung: ungueltiges Date -> daily", bl.deriveBriefingTypeFromDate(new Date("nope"), TZ) === "daily");
check("Ableitung: ungueltige Zeitzone -> daily", bl.deriveBriefingTypeFromDate(new Date("2026-01-15T10:00:00Z"), "Not/AZone") === "daily");
check("Ableitung liefert NIE 'daily' aus gueltiger Zeit (immer Tageszeit-scharf)",
  Object.values(WINTER).every(({ iso }) => bl.deriveBriefingTypeFromDate(new Date(iso), TZ) !== "daily"));

// --- b) Override (normalizeBriefingType, eine Quelle) ------------------------
check("Override daily -> daily", bl.normalizeBriefingType("daily") === "daily");
check("Override morning -> morning", bl.normalizeBriefingType("morning") === "morning");
check("Override midday -> midday", bl.normalizeBriefingType("midday") === "midday");
check("Override evening -> evening", bl.normalizeBriefingType("evening") === "evening");
check("Override case-insensitiv (EVENING -> evening)", bl.normalizeBriefingType("EVENING") === "evening");
check("Override ungueltig -> daily (kein Crash)",
  bl.normalizeBriefingType("banana") === "daily" && bl.normalizeBriefingType("") === "daily" &&
  bl.normalizeBriefingType(null) === "daily" && bl.normalizeBriefingType(undefined) === "daily");

// --- c) Contract-Threading --------------------------------------------------
const profile = { id: "u-1", tenantId: "t-1", firstName: "Test" };
function contractWith(briefingType) {
  const args = { profile, decisions: [], kosById: {}, sourcesByVorgang: {} };
  if (briefingType !== undefined) args.briefingType = briefingType;
  return contract.toBriefingContractV3(args);
}
check("Threading: briefingType=evening -> currentHelmutState.briefingType=evening",
  contractWith("evening").currentHelmutState.briefingType === "evening");
check("Threading: briefingType=midday -> currentHelmutState.briefingType=midday",
  contractWith("midday").currentHelmutState.briefingType === "midday");
check("Rueckwaertskompatibel: OHNE briefingType bleibt currentHelmutState.briefingType=daily",
  contractWith(undefined).currentHelmutState.briefingType === "daily");
check("Robust: ungueltiger briefingType im Contract -> daily (kein Crash)",
  contractWith("banana").currentHelmutState.briefingType === "daily");
// buildCurrentHelmutState direkt (Default + Normalisierung).
check("buildCurrentHelmutState Default -> daily",
  contract.buildCurrentHelmutState({ profile, decisions: [], kosById: {}, sourcesByVorgang: {} }).briefingType === "daily");
check("buildCurrentHelmutState normalisiert ungueltig -> daily",
  contract.buildCurrentHelmutState({ profile, decisions: [], kosById: {}, sourcesByVorgang: {}, briefingType: "xyz" }).briefingType === "daily");

// --- d) Read-Pfad (__buildV3Briefing) ---------------------------------------
// server.js laedt offline sauber (listen ist hinter require.main===module). Ohne
// V3-Store liefert buildV3Briefing den ehrlichen Leerzustand — TRAEGT aber den Slot.
const server = require("../server.js");
check("server.js exportiert Test-Hook __buildV3Briefing", typeof server.__buildV3Briefing === "function");

async function main() {
  const prof = { id: "u-1" };
  // Override gewinnt:
  const stMorning = await server.__buildV3Briefing(prof, "u-1", { slot: "morning" });
  const stEvening = await server.__buildV3Briefing(prof, "u-1", { slot: "evening" });
  check("Read-Pfad: Override slot=morning -> currentHelmutState.briefingType=morning",
    stMorning.currentHelmutState.briefingType === "morning");
  check("Read-Pfad: Override slot=evening -> currentHelmutState.briefingType=evening",
    stEvening.currentHelmutState.briefingType === "evening");
  check("Read-Pfad: ungueltiger Override -> daily (kein Crash)",
    (await server.__buildV3Briefing(prof, "u-1", { slot: "banana" })).currentHelmutState.briefingType === "daily");
  // Kein Override -> Ableitung aus Serverzeit; entspricht deriveBriefingTypeFromDate(now).
  const stAuto = await server.__buildV3Briefing(prof, "u-1");
  const expectedAuto = bl.deriveBriefingTypeFromDate(new Date(), TZ);
  check("Read-Pfad: ohne Override -> Slot aus Serverzeit (Europe/Berlin) abgeleitet",
    stAuto.currentHelmutState.briefingType === expectedAuto,
    `got=${stAuto.currentHelmutState.briefingType} exp=${expectedAuto}`);
  check("Read-Pfad: abgeleiteter Slot ist ein gueltiger Wert",
    ["morning", "midday", "evening", "daily"].includes(stAuto.currentHelmutState.briefingType));

  // --- e) 0-KI-Invariante ---------------------------------------------------
  // Der Slot-aware Read darf keinen LLM-Call anstossen. Wir verproben, dass die
  // KI-/Kosten-Naht waehrend des Reads NICHT beruehrt wird.
  const ai = require("../lib/helmut/ai");
  const storage = require("../lib/helmut/storage");
  let llmCalls = 0;
  const origReq = ai.requestStructuredJson;
  const origRec = storage.recordLlmUsage;
  ai.requestStructuredJson = () => { llmCalls += 1; throw new Error("KI-Call im Read-Pfad verboten"); };
  storage.recordLlmUsage = () => { llmCalls += 1; return Promise.resolve({ skipped: true }); };
  try {
    await server.__buildV3Briefing(prof, "u-1", { slot: "evening" });
    await server.__buildV3Briefing(prof, "u-1");
  } catch (e) {
    llmCalls += 1; // ein geworfener KI-Call zaehlt als Verletzung
  } finally {
    ai.requestStructuredJson = origReq;
    storage.recordLlmUsage = origRec;
  }
  check("0-KI-Invariante: Slot-aware Read loest KEINEN LLM-/Kosten-Call aus", llmCalls === 0, `llmCalls=${llmCalls}`);

  // --- f) Security + keine falsche Frische -----------------------------------
  // Der Slot aendert NUR das Label — niemals Daten, Reihenfolge oder lastUpdated.
  const NOW = new Date("2026-07-07T08:30:00Z");
  const koPrimary = {
    id: "ko-vg-1", vorgang_id: "vg-1", status: "neu", understanding_status: "complete",
    display_title: "Bundesregierung legt Pflegereform vor",
    was_ist_passiert: "Reform vorgestellt.", warum_wichtig: "Millionen betroffen.",
    why_relevant: "Betrifft deinen Ausschuss.", recommendation: "Heute nicht zuspitzen.",
    ausschuesse: ["Gesundheit"], zeitdruck: "hoch", confidence_score: 85, source_document_count: 4,
    risk_of_no_action: "Ohne Reaktion droht uneinheitliche Kommunikation.",
    opportunity_summary: "Soziale Entlastung glaubwuerdig besetzen.",
    risk_level: "high", opportunity_level: "high",
    updated_at: "2026-07-07T07:45:00Z"
  };
  const decisions = [{ knowledge_object_id: "ko-vg-1", vorgang_id: "vg-1", score: 88, decision: "Sofort reagieren", priority_type: "risk", risk: "Kritik", chance: "", matched_features: [] }];
  const kosById = { "ko-vg-1": koPrimary };
  const mk = (slot) => contract.buildCurrentHelmutState({ profile, decisions, kosById, sourcesByVorgang: {}, now: NOW, briefingType: slot });
  const sM = mk("morning"), sE = mk("evening");
  check("Keine falsche Frische: Slot aendert NUR briefingType (sonst identisch)",
    JSON.stringify({ ...sM, briefingType: null }) === JSON.stringify({ ...sE, briefingType: null }));
  check("Keine falsche Frische: lastUpdated bleibt die Wahrheit (unabhaengig vom Slot)",
    sM.sourcesSummary.lastUpdated === sE.sourcesSummary.lastUpdated);
  const serialized = JSON.stringify(sE);
  check("Keine Delta-/Frische-Floskeln im State (keine kuenstliche Aktualitaet)",
    !/seit heute Morgen|seit dem Morgen|aktualisiert seit|neu seit|seit Mittag/i.test(serialized));
  const FORBIDDEN_COST = ["estimatedCost", "estimated_cost", "costEstimate", "promptTokens", "completionTokens",
    "totalTokens", "inputTokens", "outputTokens", "pipelineStep", "llmUsage"];
  check("Security: KEINE Kosten-/Token-Felder im slot-aware State",
    FORBIDDEN_COST.every((k) => !serialized.includes(k)), FORBIDDEN_COST.filter((k) => serialized.includes(k)).join(","));
  // koPrimary traegt bewusst KEINE Partei -> der Slot darf keine erfinden.
  check("Security: keine hartkodierte Partei/Cem-Logik durch den Slot",
    !/cem|ince|\bspd\b|\bcdu\b|gruene|grüne|\blinke\b|\bafd\b|\bfdp\b/i.test(JSON.stringify(mk("morning"))));
  // Keine neue Persistenz durch den Slot: briefingLanguage/briefingContract schreiben nichts.
  const fs = require("fs"), path = require("path");
  const blSrc = fs.readFileSync(path.join(__dirname, "..", "lib/helmut/briefingLanguage.js"), "utf8");
  check("Keine Persistenz/KI in briefingLanguage (kein save*/fetch/ai/openai)",
    !/saveRenderedBriefingV3|\bfetch\b|require\(["']\.\/ai|openai|azure/i.test(blSrc));

  console.log(`\n${passed}/${passed + failed} Slot-aware-Read-Assertions erfolgreich.`);
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
}

main().catch((e) => { console.error("Testlauf-Fehler:", e && e.stack || e); process.exit(1); });
