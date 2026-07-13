"use strict";

// ═══════════════════════════════════════════════════════════════════════════
// KO-Klassifikations-Backfill (Sprint 2): fuellt decision_level/related_levels/
// event_type/affected_geographies/mentioned_geographies/decision_entities/
// related_entities/classification_confidence + political_level + embedding fuer
// bestehende Knowledge Objects.
//
// KOSTENNEUTRAL: rein deterministisch (KEINE KI, kein Netz beim Ableiten). Behebt
// "political_level 0/231" und "embedding 0/231" ohne bezahlten Understanding-Call.
//   • Dry-Run-Default (execute=false) — plant nur, schreibt nichts.
//   • Idempotent: nur complete-KOs OHNE decision_level werden verarbeitet.
//   • Rein orchestrierend, alle Seiteneffekte ueber injizierte deps -> unit-testbar.
//   • DB-Schreibzugriff (deps.saveEnrichment) trifft nur die Klassifikationsspalten.
// ═══════════════════════════════════════════════════════════════════════════

const { classifyKnowledgeObject } = require("./quellenarchitektur/classification");

// Reine Funktion: leitet den vollstaendigen Klassifikations-Patch aus einem KO ab
// (ohne KI-Werte -> reiner Deriver) und ergaenzt das write-time Embedding.
function buildClassificationPatch(ko = {}, deps = {}) {
  const cls = classifyKnowledgeObject(ko, {});
  const patch = {
    decision_level: cls.decision_level,
    political_level: cls.decision_level, // Alt-Spalte spiegeln (Matching/Read)
    related_levels: cls.related_levels,
    event_type: cls.event_type,
    affected_geographies: cls.affected_geographies,
    mentioned_geographies: cls.mentioned_geographies,
    decision_entities: cls.decision_entities,
    related_entities: cls.related_entities,
    classification_confidence: cls.classification_confidence
  };
  const embed = typeof deps.embed === "function" ? deps.embed : defaultEmbed;
  try {
    const vec = embed(ko);
    if (Array.isArray(vec) && vec.length) patch.embedding = vec;
  } catch (_) { /* Embedding optional */ }
  return patch;
}

function defaultEmbed(ko) {
  const { embedKnowledgeObject } = require("./matching");
  return embedKnowledgeObject(ko);
}

// deps: { listKnowledgeObjects, saveEnrichment, embed?, log? }
async function runKoClassificationBackfill(opts = {}, deps = {}) {
  const execute = opts.execute === true;
  const limit = Number(opts.limit) > 0 ? Number(opts.limit) : 500;
  const log = typeof deps.log === "function" ? deps.log : () => {};

  const kos = (await deps.listKnowledgeObjects({ limit })) || [];
  const list = Array.isArray(kos) ? kos : [];
  // Idempotent: nur verstandene KOs OHNE bereits gesetzte Entscheidungsebene.
  const candidates = list.filter((k) => k
    && k.understanding_status === "complete"
    && !k.decision_level);

  const plan = { totalKos: list.length, candidates: candidates.length };
  if (!execute) {
    const preview = candidates.slice(0, 5).map((ko) => {
      const p = buildClassificationPatch(ko, deps);
      return { id: ko.id, decision_level: p.decision_level, event_type: p.event_type, hasEmbedding: Array.isArray(p.embedding) };
    });
    return { dryRun: true, ...plan, preview };
  }

  let processed = 0, failed = 0;
  const samples = [];
  const levelHist = {};
  for (const ko of candidates) {
    const patch = buildClassificationPatch(ko, deps);
    levelHist[patch.decision_level] = (levelHist[patch.decision_level] || 0) + 1;
    try {
      await deps.saveEnrichment(ko.id, patch);
      processed += 1;
      if (samples.length < 5) samples.push({ id: ko.id, decision_level: patch.decision_level, event_type: patch.event_type });
    } catch (_) { failed += 1; }
    if (processed % 25 === 0) log(`KO-Klassifikation: ${processed}/${candidates.length}`);
  }

  return { dryRun: false, candidates: candidates.length, processed, failed, levelHist, samples };
}

module.exports = { runKoClassificationBackfill, buildClassificationPatch };
