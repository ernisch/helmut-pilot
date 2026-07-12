"use strict";

// Test für den P1-7-Fix: buildLageBriefing({ cacheOnly:true }) liefert die
// deterministischen Karten SOFORT und löst KEINEN Live-LLM-Call aus. So können
// die Lage-Karten im App-Start-Kritikpfad nicht durch ein LLM-Timeout verschwinden.
// KEIN Netz, KEINE echte KI — Storage/AI/SourceSafety werden gemockt.

const storage = require("../lib/helmut/storage");
const ai = require("../lib/helmut/ai");
const sourceSafety = require("../lib/helmut/sourceSafety");
const lage = require("../lib/helmut/lage");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// Ein vollständig verstandenes KO (überlebt den understood-Filter + Source-Guard).
const KO = {
  id: "ko-vg-1", vorgang_id: "vg-1", status: "update", understanding_status: "complete",
  headline: "Rentenpaket 2026", was_ist_passiert: "Kabinett hat beschlossen.", warum_wichtig: "Wichtig.",
  wer_ist_betroffen: "Rentner.", display_title: "Rentenpaket beschlossen", display_summary: "Kurz.",
  why_relevant: "Relevanz.", recommendation: "Position.", display_category: "BMAS",
  best_source_url: "https://bmas.de/rente", updated_at: "2026-07-12T06:00:00Z"
};

// Originale sichern.
const orig = {
  v3StoreReady: storage.v3StoreReady,
  listKnowledgeObjects: storage.listKnowledgeObjects,
  listMatchingResults: storage.listMatchingResults,
  getSourcesForVorgang: storage.getSourcesForVorgang,
  getRenderedBriefingV3: storage.getRenderedBriefingV3,
  saveRenderedBriefingV3: storage.saveRenderedBriefingV3,
  acquirePipelineLock: storage.acquirePipelineLock,
  releasePipelineLock: storage.releasePipelineLock,
  canSpendLlm: storage.canSpendLlm,
  guardKnowledgeObject: sourceSafety.guardKnowledgeObject,
  generateLageBriefing: ai.generateLageBriefing
};

let aiCalls = 0;
function installMocks({ cachedNarrative = null } = {}) {
  storage.v3StoreReady = () => true;
  storage.listKnowledgeObjects = async () => [KO];
  storage.listMatchingResults = async () => []; // -> Fallback: neueste verstandene
  storage.getSourcesForVorgang = async () => [{ url: "https://bmas.de/rente", source_name: "BMAS", title: "Rente", published_at: "2026-07-12T06:00:00Z" }];
  storage.getRenderedBriefingV3 = async () => (cachedNarrative
    ? { payload: { paragraphs: cachedNarrative, koSetHash: null } }
    : null); // Default: Cache-Miss
  storage.saveRenderedBriefingV3 = async () => ({ saved: true });
  storage.acquirePipelineLock = async () => true;
  storage.releasePipelineLock = async () => {};
  storage.canSpendLlm = async () => ({ allowed: true });
  sourceSafety.guardKnowledgeObject = () => ({ status: "ok" });
  aiCalls = 0;
  ai.generateLageBriefing = async () => { aiCalls += 1; return { paragraphs: [{ text: "Narrativ.", vorgang_ids: ["vg-1"] }], model: "gpt-x", wordCount: 1 }; };
}
function restore() { Object.assign(storage, { v3StoreReady: orig.v3StoreReady, listKnowledgeObjects: orig.listKnowledgeObjects, listMatchingResults: orig.listMatchingResults, getSourcesForVorgang: orig.getSourcesForVorgang, getRenderedBriefingV3: orig.getRenderedBriefingV3, saveRenderedBriefingV3: orig.saveRenderedBriefingV3, acquirePipelineLock: orig.acquirePipelineLock, releasePipelineLock: orig.releasePipelineLock, canSpendLlm: orig.canSpendLlm }); sourceSafety.guardKnowledgeObject = orig.guardKnowledgeObject; ai.generateLageBriefing = orig.generateLageBriefing; }

const profile = { id: "cem-ince", fullName: "Cem Ince" };

(async () => {
  // ── 1) cacheOnly + Cache-Miss: Karten sofort, KEIN LLM-Call ──
  installMocks({ cachedNarrative: null });
  const r1 = await lage.buildLageBriefing(profile, { politicianId: "cem-ince", cacheOnly: true });
  check("cacheOnly: available=true", r1.available === true, JSON.stringify(r1).slice(0, 120));
  check("cacheOnly: Karten vorhanden (vorgaenge>0)", Array.isArray(r1.vorgaenge) && r1.vorgaenge.length > 0);
  check("cacheOnly: KEIN Narrativ (paragraphs leer)", Array.isArray(r1.paragraphs) && r1.paragraphs.length === 0);
  check("cacheOnly: pendingNarrative=true", r1.pendingNarrative === true);
  check("cacheOnly: KEIN Live-LLM-Call ausgelöst", aiCalls === 0, `aiCalls=${aiCalls}`);

  // ── 2) Kontrast: OHNE cacheOnly + Cache-Miss -> LLM WIRD aufgerufen ──
  installMocks({ cachedNarrative: null });
  const r2 = await lage.buildLageBriefing(profile, { politicianId: "cem-ince" });
  check("ohne cacheOnly: Live-LLM-Call wird ausgelöst (Kontrollprobe)", aiCalls === 1, `aiCalls=${aiCalls}`);
  check("ohne cacheOnly: Narrativ vorhanden", Array.isArray(r2.paragraphs) && r2.paragraphs.length > 0);

  // ── 3) cacheOnly löst NIE einen LLM-Call aus (Kernsicherheit), auch wenn ein
  //      (hier nicht hash-passender) Cache-Eintrag existiert -> Karten trotzdem sofort.
  installMocks({ cachedNarrative: [{ text: "Gecacht.", vorgang_ids: ["vg-1"] }] });
  const r3 = await lage.buildLageBriefing(profile, { politicianId: "cem-ince", cacheOnly: true });
  check("cacheOnly: Karten immer vorhanden", Array.isArray(r3.vorgaenge) && r3.vorgaenge.length > 0);
  check("cacheOnly: NIE ein LLM-Call (Kernsicherheit)", aiCalls === 0, `aiCalls=${aiCalls}`);

  restore();
  console.log(`\n${passed}/${passed + failed} Lage-cacheOnly-Assertions erfolgreich.`);
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
})().catch((e) => { restore(); console.error("Test-Fehler:", e); process.exit(1); });
