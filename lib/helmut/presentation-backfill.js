"use strict";

// =============================================================================
// Presentation-Fields-Backfill (einmaliger, MANUELLER Wartungsbefehl).
// =============================================================================
// Zweck: BESTEHENDE knowledge_objects, die vor Einfuehrung der Presentation
// Fields erzeugt wurden, einmalig durch die AKTUELLE Understanding Engine laufen
// lassen, damit sie die neuen Anzeige-Felder erhalten:
//   display_title, display_summary, why_relevant, recommendation, display_category
// (Praesentations-Vertrag, siehe docs/knowledge-object-contract.md).
//
// Bewusst KEIN neuer Datenmotor, KEIN Cron, KEIN Scheduler, KEINE Migration.
// Es ist ein Orchestrator ueber die BESTEHENDE Engine:
//   - derselbe Prompt      (understanding.buildUnderstandingPrompt)
//   - dasselbe Schema/Modell (ai.requestStructuredJson / understandingModelName)
//   - derselbe Zusammenbau + Validator (assembleKnowledgeObject + validateKnowledgeObject)
//   - dieselbe Speicher-Naht (storage.saveKnowledgeObject, Partial-Upsert)
//
// Sicherheits-/Wartbarkeitsgarantien:
//   1. Nur COMPLETE-KOs mit MINDESTENS EINEM fehlenden Presentation Field werden
//      bearbeitet. Bereits vollstaendige KOs werden uebersprungen (idempotent).
//   2. Es wird pro KO GENAU EIN KI-Call gemacht (wie die Engine). Innerhalb eines
//      Laufs wird jedes KO hoechstens einmal verarbeitet (eine Schleife, kein Retry).
//   3. Gespeichert werden AUSSCHLIESSLICH die zuvor FEHLENDEN Presentation Fields
//      (Partial-Upsert mit nur id + vorgang_id + den fehlenden Feldern). Raw Fields,
//      Quellen, Dokumente und IDs werden NIE angefasst.
//   4. Fehler brechen den Lauf nie ab: pro KO try/catch, protokollieren, weiter.
//   5. Budget-Gate wie die Engine (storage.canSpendLlm(null)); ist das Budget
//      erschoepft, stoppt der Lauf sauber und meldet den Rest als "skipped-budget".
//   6. Default DRY-RUN: ohne explizites dryRun:false werden KEINE KI-Calls gemacht,
//      nur Plan + Kostenschaetzung berechnet.
//
// deps injizierbar -> vollstaendig offline testbar (ohne Supabase / ohne KI).

const { buildUnderstandingPrompt, assembleKnowledgeObject } = require("./understanding");
const { KNOWLEDGE_OBJECT_SCHEMA, validateKnowledgeObject } = require("./understanding-schema");

// Die 5 Felder des Praesentations-Vertrags. Single source of truth fuer den Backfill.
const PRESENTATION_FIELDS = ["display_title", "display_summary", "why_relevant", "recommendation", "display_category"];

// Eigenes Kostenlog-Label -- KEIN zweiter Prompt/Motor, nur Nachvollziehbarkeit
// (damit sich die Backfill-Kosten sauber von den regulaeren Understanding-Kosten
// trennen lassen). Derselbe Prompt, dasselbe Schema, dasselbe Modell.
const BACKFILL_CALLTYPE = "understanding-backfill";

// Grobe Token-Schaetzung NUR fuer die Kostenvorschau. Nutzt dieselbe Preis-Tabelle
// wie die echten Kosten (storage.estimateLlmCost -> HELMUT_LLM_PRICE_JSON wirkt auf
// beide). Die TATSAECHLICHEN Kosten kommen nach dem Lauf aus dem LLM-Log.
const EST_INPUT_TOKENS = 2500;
const EST_OUTPUT_TOKENS = 800;

// Wie viele Fehler-Details maximal gesammelt werden (Zaehler laufen weiter).
const MAX_ERROR_DETAILS = 100;

function isMissing(value) {
  return value == null || String(value).replace(/\s+/g, " ").trim() === "";
}

// Welche der 5 Presentation Fields fehlen (nicht vorhanden / leer)?
function missingPresentationFields(ko = {}) {
  return PRESENTATION_FIELDS.filter((f) => isMissing(ko[f]));
}

function shortErr(e) {
  const m = e && e.message ? String(e.message) : String(e == null ? "unknown" : e);
  return m.slice(0, 200);
}

function round6(n) {
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n * 1e6) / 1e6 : n;
}

function nowMs(deps) {
  return typeof deps.now === "function" ? deps.now() : Date.now();
}

// Produktive Verdrahtung gegen die bestehende Engine/Storage/AI. Alles injizierbar.
function defaultDeps() {
  const storage = require("./storage");
  const ai = require("./ai");
  return {
    storeReady: () => storage.v3StoreReady(),
    aiEnabled: () => ai.isAiEnabled(),
    listKnowledgeObjects: (o) => storage.listKnowledgeObjects(o),
    getSourcesForVorgang: (vid) => storage.getSourcesForVorgang(vid),
    // GLOBAL (mandantenlos), wie die Understanding Engine -- niemals pro Nutzer.
    canSpend: () => storage.canSpendLlm(null),
    // DERSELBE Prompt/Schema/Modell wie C7/C8; nur der callType-Log-Tag ist eigen.
    requestUnderstanding: (prompt) =>
      ai.requestStructuredJson(prompt, KNOWLEDGE_OBJECT_SCHEMA, { callType: BACKFILL_CALLTYPE, politicianId: null }, ai.understandingModelName()),
    // Partial-Upsert: schreibt NUR die im patch enthaltenen Spalten (wie backfillProvenance).
    save: (patch) => storage.saveKnowledgeObject(patch),
    modelName: () => ai.understandingModelName(),
    estimateCost: (inTok, outTok) => storage.estimateLlmCost(ai.understandingModelName(), inTok, outTok),
    // Tatsaechliche Kosten dieses Laufs = Summe der estimatedCost aller Backfill-
    // Log-Eintraege ab dem Startzeitpunkt (aus dem bestehenden LLM-Kostenlog).
    sumActualCost: async (sinceIso) => {
      const usage = await storage.getLlmUsage(null, 5000);
      const sum = (usage || [])
        .filter((e) => e && e.callType === BACKFILL_CALLTYPE
          && String(e.createdAt || "") >= String(sinceIso)
          && typeof e.estimatedCost === "number")
        .reduce((s, e) => s + e.estimatedCost, 0);
      return round6(sum);
    }
  };
}

function buildPlan(deps, understoodCount, candidateCount, loaded, limit) {
  const estPerCall = deps.estimateCost(EST_INPUT_TOKENS, EST_OUTPUT_TOKENS);
  return {
    loaded,
    loadLimit: limit,
    loadCapReached: loaded >= limit,
    checked: understoodCount,
    skippedComplete: understoodCount - candidateCount,
    toProcess: candidateCount,
    model: deps.modelName(),
    estCostPerCallUsd: round6(estPerCall),
    estTotalCostUsd: estPerCall == null ? null : round6(estPerCall * candidateCount)
  };
}

// Haupteinstieg. opts: { limit?, dryRun? }. dryRun DEFAULT true (sicher):
// ein echter, kostenverursachender Lauf erfordert explizit dryRun:false.
async function backfillPresentationFields(opts = {}, depsOverride = {}) {
  const deps = { ...defaultDeps(), ...depsOverride };
  const limit = Number(opts.limit) > 0 ? Math.floor(Number(opts.limit)) : 2000;
  const dryRun = opts.dryRun !== false;
  const startedAtMs = nowMs(deps);
  const startedIso = new Date(startedAtMs).toISOString();

  if (!deps.storeReady()) return { skipped: true, reason: "v3-store-not-ready" };
  if (!dryRun && !deps.aiEnabled()) return { skipped: true, reason: "ai-disabled" };

  // Nur VERSTANDENE (complete) Vorgaenge mit stabiler vorgang_id kommen in Frage --
  // pending/failed-KOs werden nie ausgeliefert, also nicht backgefuellt.
  const all = await deps.listKnowledgeObjects({ limit });
  const understood = (all || []).filter((k) => k && k.vorgang_id && k.understanding_status === "complete");
  const candidates = understood.filter((k) => missingPresentationFields(k).length > 0);
  const plan = buildPlan(deps, understood.length, candidates.length, (all || []).length, limit);

  if (typeof deps.onPlan === "function") {
    try { deps.onPlan(plan, { dryRun }); } catch (_) { /* Reporting darf den Lauf nie stoeren */ }
  }

  const res = {
    dryRun, plan,
    processed: 0, fullyCompleted: 0, partiallyFilled: 0,
    failed: 0, skippedNoSources: 0, skippedBudget: 0,
    actualCostUsd: 0, errors: [], durationMs: 0
  };

  const logError = (entry) => { if (res.errors.length < MAX_ERROR_DETAILS) res.errors.push(entry); };

  if (dryRun || !candidates.length) {
    res.durationMs = nowMs(deps) - startedAtMs;
    return res;
  }

  for (let i = 0; i < candidates.length; i++) {
    const ko = candidates[i];
    try {
      // Budget-Gate wie die Engine. Erschoepft -> Rest nicht mehr versuchen.
      const budget = await deps.canSpend();
      if (!budget || !budget.allowed) {
        res.skippedBudget += (candidates.length - i);
        logError({ id: ko.id, reason: "budget-exhausted", detail: budget && budget.reason });
        break;
      }

      // Cluster aus den ECHTEN, verknuepften Quell-Dokumenten dieses Vorgangs
      // rekonstruieren -> exakt derselbe Prompt-Pfad wie beim Erst-Verstehen.
      const docs = await deps.getSourcesForVorgang(ko.vorgang_id);
      if (!docs || !docs.length) { res.skippedNoSources += 1; continue; }
      const cluster = { documents: docs };

      let aiResult;
      try {
        aiResult = await deps.requestUnderstanding(buildUnderstandingPrompt(cluster));
      } catch (error) {
        res.failed += 1;
        logError({ id: ko.id, reason: "ai-error", detail: shortErr(error) });
        continue;
      }

      // Bestehender Zusammenbau + Validator. Die Presentation Fields werden dabei
      // durch dieselben Sanitizer (isValidDisplayTitle etc.) qualitaetsgeprueft.
      const assembled = assembleKnowledgeObject(aiResult, cluster, ko.vorgang_id, {
        understanding_status: "complete", model: deps.modelName()
      });
      const validation = validateKnowledgeObject(assembled);
      if (!validation.valid) {
        res.failed += 1;
        logError({ id: ko.id, reason: "invalid", detail: validation.errors.slice(0, 3) });
        continue;
      }

      // NUR die zuvor FEHLENDEN Felder uebernehmen, und nur wenn der validierte
      // Wert nicht leer ist (ein verworfener display_title bleibt leer -> spaeterer
      // Lauf kann es erneut versuchen). Nichts anderes wird geschrieben.
      const missing = missingPresentationFields(ko);
      const patch = { id: ko.id, vorgang_id: ko.vorgang_id };
      let wrote = 0;
      for (const f of missing) {
        if (!isMissing(assembled[f])) { patch[f] = assembled[f]; wrote += 1; }
      }
      if (wrote === 0) {
        res.failed += 1;
        logError({ id: ko.id, reason: "no-valid-fields" });
        continue;
      }

      const saved = await deps.save(patch);
      if (saved && saved.saved) {
        res.processed += 1;
        const stillMissing = missing.filter((f) => isMissing(assembled[f]));
        if (stillMissing.length === 0) res.fullyCompleted += 1; else res.partiallyFilled += 1;
      } else {
        res.failed += 1;
        logError({ id: ko.id, reason: "save-skipped", detail: saved && saved.reason });
      }
    } catch (error) {
      // Fail-safe: ein einzelnes KO darf den Batch nie abbrechen.
      res.failed += 1;
      logError({ id: (ko && ko.id) || "?", reason: "unexpected", detail: shortErr(error) });
    }
  }

  res.actualCostUsd = deps.sumActualCost
    ? await deps.sumActualCost(startedIso).catch(() => null)
    : null;
  res.durationMs = nowMs(deps) - startedAtMs;
  return res;
}

module.exports = {
  backfillPresentationFields,
  missingPresentationFields,
  PRESENTATION_FIELDS,
  BACKFILL_CALLTYPE
};
