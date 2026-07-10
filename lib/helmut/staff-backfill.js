"use strict";

// =============================================================================
// Stabschef-Fields-Backfill (einmaliger, MANUELLER Wartungsbefehl) — DRY-RUN by default.
// =============================================================================
// Zweck: BESTEHENDE knowledge_objects, die VOR Einfuehrung der Stabschef-Felder
// verstanden wurden, einmalig durch die AKTUELLE Understanding Engine laufen lassen,
// damit sie die fehlenden Stabschef-Felder erhalten und im Helmut-Tab von "partial"
// auf "valid" gehoben werden:
//   risk_of_no_action, opportunity_summary, risk_level, opportunity_level,
//   recommended_communication_struct, action_items_struct,
//   recommended_communication (legacy), action_items (legacy)
//
// STRENG modelliert nach lib/helmut/presentation-backfill.js. Bewusst KEIN neuer
// Datenmotor, KEIN Cron, KEIN Scheduler, KEINE Migration, KEINE Client-KI. Es ist ein
// Orchestrator ueber die BESTEHENDE Engine (derselbe Prompt/Schema/Modell/Validator/
// Speicher-Naht). deps injizierbar -> vollstaendig offline testbar (ohne Supabase/KI).
//
// Sicherheits-/Wartbarkeitsgarantien:
//   1. DEFAULT DRY-RUN: ohne explizites dryRun:false werden KEINE KI-Calls gemacht und
//      KEINE Daten geschrieben — nur Plan + Kostenschaetzung + Kandidatenliste.
//   2. Nur COMPLETE-KOs mit ECHTEM V3-Kern (recommendation/handlungsempfehlung ODER
//      why_relevant/warum_wichtig) UND mindestens einem fehlenden Stabschef-Feld werden
//      Kandidaten. failed/pending/kernlos/bereits-vollstaendig -> uebersprungen (idempotent).
//   3. Pro KO GENAU EIN KI-Call (wie die Engine). Gespeichert werden AUSSCHLIESSLICH die
//      zuvor FEHLENDEN Stabschef-Felder (Partial-Upsert) — vorhandene gute Felder, Raw
//      Fields, Quellen, Dokumente, IDs werden NIE angefasst/ueberschrieben.
//   4. Fehler brechen den Lauf nie sofort ab: pro KO try/catch, protokollieren, weiter —
//      ABER Gesamt-Abbruch, wenn die Fehlerquote > FAILURE_RATE_ABORT (Default 20%) liegt.
//   5. Budget-Gate wie die Engine (storage.canSpendLlm(null)); erschoepft -> sauberer Stopp,
//      Rest "skipped-budget".
//   6. Eigener callType "understanding-staff-backfill" -> Kosten sauber vom regulaeren
//      Understanding trennbar.

const { buildUnderstandingPrompt, assembleKnowledgeObject } = require("./understanding");
const { KNOWLEDGE_OBJECT_SCHEMA, validateKnowledgeObject } = require("./understanding-schema");

// Die 8 Ziel-Felder des Stabschef-Backfills. Single source of truth. NUR diese Spalten
// werden je geschrieben — nichts anderes.
const STAFF_FIELDS = [
  "risk_of_no_action",
  "opportunity_summary",
  "risk_level",
  "opportunity_level",
  "recommended_communication_struct",
  "action_items_struct",
  "recommended_communication",
  "action_items"
];

// Eigenes Kostenlog-Label -- KEIN zweiter Prompt/Motor, nur Nachvollziehbarkeit.
const BACKFILL_CALLTYPE = "understanding-staff-backfill";

// Grobe Token-Schaetzung NUR fuer die Kostenvorschau (identisch zur presentation-backfill-
// Vorlage). Nutzt dieselbe Preis-Tabelle wie die echten Kosten (storage.estimateLlmCost ->
// HELMUT_LLM_PRICE_JSON wirkt auf beide). TATSAECHLICHE Kosten kommen nach dem Lauf aus dem Log.
const EST_INPUT_TOKENS = 2500;
const EST_OUTPUT_TOKENS = 800;

// Fehlerquoten-Abbruch: ueberschreitet failed/(processed+failed) diese Grenze (nach einer
// Mindest-Stichprobe), stoppt der Lauf, statt weiter Kosten zu verursachen.
const FAILURE_RATE_ABORT = 0.2;
const FAILURE_RATE_MIN_SAMPLE = 5;

// Wie viele Fehler-/Kandidaten-Details maximal gesammelt werden (Zaehler laufen weiter).
const MAX_ERROR_DETAILS = 100;
const MAX_CANDIDATE_DETAILS = 200;

function cleanStr(v) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim();
}
function isMissingText(value) {
  return cleanStr(value) === "";
}

// --- Feld-Praesenz: exakt an der Adapter-Semantik (briefingContract) ausgerichtet ------
// Enum-Level: "unknown" ist ein GUELTIGER abgeleiteter Wert -> gilt als VORHANDEN (sonst
// wuerden nie-ableitbare Level ewig nachverarbeitet). Fehlt nur, wenn null/leer.
function isMissingEnumLevel(value) {
  return value == null || cleanStr(value) === "";
}
// recommended_communication_struct (jsonb): vorhanden, wenn Objekt mit echtem Inhalt
// (communicationLine ODER bekannter channel/format ODER suggestedOutputs).
function hasCommStruct(s) {
  if (!s || typeof s !== "object" || Array.isArray(s)) return false;
  const known = (v) => cleanStr(v) && cleanStr(v) !== "unknown" && cleanStr(v) !== "none";
  return Boolean(cleanStr(s.communicationLine)) || known(s.recommendedFormat) || known(s.recommendedChannel) ||
    (Array.isArray(s.suggestedOutputs) && s.suggestedOutputs.some((x) => cleanStr(x)));
}
// action_items_struct (jsonb-Liste): vorhanden, wenn >=1 Element mit Titel.
function hasActionsStruct(a) {
  return Array.isArray(a) && a.some((it) => it && typeof it === "object" && !Array.isArray(it) && cleanStr(it.title));
}
// action_items (legacy text[]): vorhanden, wenn >=1 nicht-leerer Eintrag.
function hasActionsLegacy(a) {
  return Array.isArray(a) && a.some((x) => cleanStr(x));
}

// Fehlt genau DIESES Zielfeld (typ-bewusst)?
function isMissingStaffField(ko, field) {
  switch (field) {
    case "risk_of_no_action":
    case "opportunity_summary":
    case "recommended_communication":
      return isMissingText(ko[field]);
    case "risk_level":
    case "opportunity_level":
      return isMissingEnumLevel(ko[field]);
    case "recommended_communication_struct":
      return !hasCommStruct(ko[field]);
    case "action_items_struct":
      return !hasActionsStruct(ko[field]);
    case "action_items":
      return !hasActionsLegacy(ko[field]);
    default:
      return true;
  }
}

// Welche der 8 Stabschef-Felder fehlen / sind vorhanden?
function missingStaffFields(ko = {}) {
  return STAFF_FIELDS.filter((f) => isMissingStaffField(ko, f));
}
function presentStaffFields(ko = {}) {
  return STAFF_FIELDS.filter((f) => !isMissingStaffField(ko, f));
}

// Echter V3-Kern (rueckwaertsvertraeglich) — identisch zur Adapter-Definition
// (briefingContract.hasCoreV3Content). was_ist_passiert zaehlt bewusst NICHT.
function hasCoreV3Content(ko = {}) {
  return Boolean(
    cleanStr(ko.recommendation) || cleanStr(ko.handlungsempfehlung) ||
    cleanStr(ko.why_relevant) || cleanStr(ko.warum_wichtig)
  );
}

// Kandidat = complete + echter Kern + mindestens ein fehlendes Stabschef-Feld.
// failed/pending/kernlos/bereits-vollstaendig sind KEINE Kandidaten.
function isBackfillCandidate(ko = {}) {
  if (!ko || typeof ko !== "object") return false;
  if (!ko.vorgang_id) return false;
  if (ko.understanding_status !== "complete") return false;      // nur complete (failed/pending raus)
  if (ko.status === "pending") return false;
  if (!hasCoreV3Content(ko)) return false;                       // kein Kern -> nie anfassen
  return missingStaffFields(ko).length > 0;                      // schon vollstaendig -> ueberspringen
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
    // DERSELBE Prompt/Schema/Modell wie die Engine; nur der callType-Log-Tag ist eigen.
    requestUnderstanding: (prompt) =>
      ai.requestStructuredJson(prompt, KNOWLEDGE_OBJECT_SCHEMA, { callType: BACKFILL_CALLTYPE, politicianId: null }, ai.understandingModelName()),
    // Partial-Upsert: schreibt NUR die im patch enthaltenen Spalten.
    save: (patch) => storage.saveKnowledgeObject(patch),
    modelName: () => ai.understandingModelName(),
    estimateCost: (inTok, outTok) => storage.estimateLlmCost(ai.understandingModelName(), inTok, outTok),
    // Tatsaechliche Kosten dieses Laufs = Summe der estimatedCost aller Staff-Backfill-
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

// Histogramm: wie oft fehlt welches Feld ueber alle Kandidaten (fuer den Plan).
function missingHistogram(candidates) {
  const hist = {};
  for (const f of STAFF_FIELDS) hist[f] = 0;
  for (const c of candidates) for (const f of c.missingFields) hist[f] += 1;
  return hist;
}

function buildPlan(deps, understoodCount, candidates, loaded, limit) {
  const estPerCall = deps.estimateCost(EST_INPUT_TOKENS, EST_OUTPUT_TOKENS);
  const warnings = [];
  if (loaded >= limit) warnings.push(`Ladegrenze ${limit} erreicht — weitere KOs koennten unberuecksichtigt sein (--limit erhoehen).`);
  if (estPerCall == null) warnings.push("Kosten unbekannt: Modellpreis nicht in llmPriceTable — HELMUT_LLM_PRICE_JSON pruefen (keine erfundenen Preise).");
  return {
    loaded,
    loadLimit: limit,
    loadCapReached: loaded >= limit,
    checked: understoodCount,
    skippedNonCandidate: understoodCount - candidates.length,
    toProcess: candidates.length,
    targetFields: STAFF_FIELDS.slice(),
    missingFieldHistogram: missingHistogram(candidates),
    model: deps.modelName(),
    // Kostenschaetzung: NUR aus interner estimateLlmCost + Code-Schaetzwerten (2500/800).
    estTokensPerCall: { input: EST_INPUT_TOKENS, output: EST_OUTPUT_TOKENS },
    estCostPerCallUsd: round6(estPerCall),
    estTotalCostUsd: estPerCall == null ? null : round6(estPerCall * candidates.length),
    // Budget-Gate ist verdrahtet (im echten Lauf pro KO ausgewertet); Default-Batch bewusst klein.
    budgetGateWired: typeof deps.canSpend === "function",
    plannedBatchLimit: limit,
    failureRateAbort: FAILURE_RATE_ABORT,
    warnings
  };
}

// Haupteinstieg. opts: { limit?, dryRun? }. dryRun DEFAULT true (sicher):
// ein echter, kostenverursachender Lauf erfordert explizit dryRun:false.
async function backfillStaffFields(opts = {}, depsOverride = {}) {
  const deps = { ...defaultDeps(), ...depsOverride };
  const limit = Number(opts.limit) > 0 ? Math.floor(Number(opts.limit)) : 2000;
  const dryRun = opts.dryRun !== false;
  const startedAtMs = nowMs(deps);
  const startedIso = new Date(startedAtMs).toISOString();

  if (!deps.storeReady()) return { skipped: true, reason: "v3-store-not-ready" };
  if (!dryRun && !deps.aiEnabled()) return { skipped: true, reason: "ai-disabled" };

  const all = await deps.listKnowledgeObjects({ limit });
  const understood = (all || []).filter((k) => k && k.vorgang_id && k.understanding_status === "complete");
  const candidateKos = understood.filter(isBackfillCandidate);
  const candidates = candidateKos.map((k) => ({
    id: k.id,
    vorgang_id: k.vorgang_id,
    missingFields: missingStaffFields(k),
    presentFields: presentStaffFields(k)
  }));
  const plan = buildPlan(deps, understood.length, candidates, (all || []).length, limit);
  plan.candidates = candidates.slice(0, MAX_CANDIDATE_DETAILS);
  plan.candidatesTruncated = candidates.length > MAX_CANDIDATE_DETAILS;

  if (typeof deps.onPlan === "function") {
    try { deps.onPlan(plan, { dryRun }); } catch (_) { /* Reporting darf den Lauf nie stoeren */ }
  }

  const res = {
    dryRun, plan,
    processed: 0, fullyCompleted: 0, partiallyFilled: 0,
    failed: 0, skippedNoSources: 0, skippedBudget: 0, abortedFailureRate: false,
    actualCostUsd: 0, errors: [], durationMs: 0
  };
  const logError = (entry) => { if (res.errors.length < MAX_ERROR_DETAILS) res.errors.push(entry); };

  // DRY-RUN: hier ist SCHLUSS — kein KI-Call, kein Write. Nur Plan + Kandidaten zurueck.
  if (dryRun || !candidateKos.length) {
    res.durationMs = nowMs(deps) - startedAtMs;
    return res;
  }

  for (let i = 0; i < candidateKos.length; i++) {
    const ko = candidateKos[i];
    try {
      // Fehlerquoten-Abbruch: nach Mindest-Stichprobe stoppen, wenn zu viele fehlschlagen.
      const attempted = res.processed + res.failed;
      if (attempted >= FAILURE_RATE_MIN_SAMPLE && res.failed / attempted > FAILURE_RATE_ABORT) {
        res.abortedFailureRate = true;
        res.skippedBudget += (candidateKos.length - i);
        logError({ id: ko.id, reason: "aborted-failure-rate", detail: `failed ${res.failed}/${attempted}` });
        break;
      }

      // Budget-Gate wie die Engine. Erschoepft -> Rest nicht mehr versuchen.
      const budget = await deps.canSpend();
      if (!budget || !budget.allowed) {
        res.skippedBudget += (candidateKos.length - i);
        logError({ id: ko.id, reason: "budget-exhausted", detail: budget && budget.reason });
        break;
      }

      // Cluster aus den ECHTEN, verknuepften Quell-Dokumenten rekonstruieren ->
      // exakt derselbe Prompt-Pfad wie beim Erst-Verstehen.
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

      const assembled = assembleKnowledgeObject(aiResult, cluster, ko.vorgang_id, {
        understanding_status: "complete", model: deps.modelName()
      });
      const validation = validateKnowledgeObject(assembled);
      if (!validation.valid) {
        res.failed += 1;
        logError({ id: ko.id, reason: "invalid", detail: validation.errors.slice(0, 3) });
        continue;
      }

      // NUR die zuvor FEHLENDEN Stabschef-Felder uebernehmen, und nur wenn der frisch
      // erzeugte Wert selbst NICHT leer ist. Vorhandene gute Felder bleiben unberuehrt.
      const missing = missingStaffFields(ko);
      const patch = { id: ko.id, vorgang_id: ko.vorgang_id };
      let wrote = 0;
      for (const f of missing) {
        if (!isMissingStaffField(assembled, f)) { patch[f] = assembled[f]; wrote += 1; }
      }
      if (wrote === 0) {
        res.failed += 1;
        logError({ id: ko.id, reason: "no-valid-fields" });
        continue;
      }

      const saved = await deps.save(patch);
      if (saved && saved.saved) {
        res.processed += 1;
        const stillMissing = missing.filter((f) => isMissingStaffField(assembled, f));
        if (stillMissing.length === 0) res.fullyCompleted += 1; else res.partiallyFilled += 1;
      } else {
        res.failed += 1;
        logError({ id: ko.id, reason: "save-skipped", detail: saved && saved.reason });
      }
    } catch (error) {
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
  backfillStaffFields,
  isBackfillCandidate,
  missingStaffFields,
  presentStaffFields,
  hasCoreV3Content,
  STAFF_FIELDS,
  BACKFILL_CALLTYPE,
  EST_INPUT_TOKENS,
  EST_OUTPUT_TOKENS,
  FAILURE_RATE_ABORT
};
