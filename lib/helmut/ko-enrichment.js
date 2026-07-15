"use strict";

// ═══════════════════════════════════════════════════════════════════════════
// KO-Anreicherung (P1-1 Backfill): befuellt tags (KI) + policy_field (deterministisch)
// fuer bestehende Knowledge Objects. Sicherheitsmerkmale:
//   • Dry-Run-Default (execute=false) — plant nur, schreibt/ruft KEINE KI.
//   • Harter Budget-Cap (Cent), FAIL-CLOSED: canSpend-Fehler => Stopp.
//   • Evidence-Guard: nur Tags behalten, die im Vorgangstext belegt sind (kein Fake).
//   • Beruehrt AUSSCHLIESSLICH tags/policy_field (deps.saveEnrichment garantiert das).
//   • Idempotent: nur complete-KOs OHNE tags werden verarbeitet.
//   • KI-Fehler => KO wird NICHT geschrieben (kein Fake-Inhalt).
// Rein orchestrierend, alle Seiteneffekte ueber injizierte deps -> voll unit-testbar.
// ═══════════════════════════════════════════════════════════════════════════

function normalizeForMatch(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9äöüß]+/g, " ").replace(/\s+/g, " ").trim();
}

// Evidence-Guard: behaelt nur Tags, deren signifikantes Wort (>=4 Zeichen) im
// Vorgangstext vorkommt. Verhindert halluzinierte Themen (Auftragsregel: keine
// erfundenen Inhalte). Kurze Tags (<4) muessen als Ganzes im Text stehen.
function filterEvidencedTags(tags, ko = {}) {
  const hay = normalizeForMatch([ko.headline, ko.was_ist_passiert, ko.warum_wichtig, ko.wer_ist_betroffen].join(" "));
  if (!hay) return [];
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(tags) ? tags : []) {
    const tag = String(raw || "").trim();
    if (!tag) continue;
    const norm = normalizeForMatch(tag);
    if (!norm || seen.has(norm)) continue;
    const words = norm.split(" ").filter((w) => w.length >= 4);
    const belegt = words.length ? words.some((w) => hay.includes(w)) : hay.includes(norm);
    if (belegt) { seen.add(norm); out.push(tag); }
  }
  return out.slice(0, 6);
}

// deps: { listKnowledgeObjects, canSpend, extractTags, derivePolicyFields, saveEnrichment, log }
async function runKoEnrichmentBackfill(opts = {}, deps = {}) {
  const execute = opts.execute === true;
  // Harter 5-EUR-Deckel als Default; nie hoeher als opts erlaubt der Aufrufer.
  const capCents = Number.isFinite(Number(opts.maxEurCents)) ? Number(opts.maxEurCents) : 500;
  const estPerCallCents = Number(opts.estPerCallCents) > 0 ? Number(opts.estPerCallCents) : 2;
  const limit = Number(opts.limit) > 0 ? Number(opts.limit) : 500;
  const log = typeof deps.log === "function" ? deps.log : () => {};

  const kos = (await deps.listKnowledgeObjects({ limit })) || [];
  const candidates = (Array.isArray(kos) ? kos : []).filter((k) => k
    && k.understanding_status === "complete"
    && (!Array.isArray(k.tags) || k.tags.length === 0)
    && (k.was_ist_passiert || k.warum_wichtig || k.headline));

  const plan = {
    totalKos: Array.isArray(kos) ? kos.length : 0,
    candidates: candidates.length,
    estCostEur: +(candidates.length * estPerCallCents / 100).toFixed(2),
    capEur: +(capCents / 100).toFixed(2)
  };
  if (!execute) return { dryRun: true, ...plan };

  let spentCents = 0, processed = 0, skipped = 0, failed = 0, aiCalls = 0, stop = null;
  const samples = [];
  // bypassBudget: umgeht NUR das per-Call-Pre-Gate DIESES Backfills (deps.canSpend).
  // Das GLOBALE Tageslimit gilt IMMER: die atomare Reservierung am Modell-Choke-Point
  // (ai.js requestOpenAI) laesst sich seit dem Budget-Rollout von keinem Pfad umgehen —
  // bei erschoepftem Tagesbudget stoppt der Lauf kontrolliert (stop="daily-llm-budget").
  // Der harte Euro-Deckel (capCents) bleibt zusaetzlich immer aktiv.
  const bypassBudget = opts.bypassBudget === true;
  for (const ko of candidates) {
    // Harter Euro-Deckel VOR dem Call (immer aktiv, fail-closed).
    if (spentCents + estPerCallCents > capCents) { stop = "budget-cap"; break; }
    if (!bypassBudget) {
      let budget;
      try { budget = await deps.canSpend(); } catch (_) { budget = { allowed: false }; }
      if (!budget || !budget.allowed) { stop = "daily-budget"; break; }
    }

    let ai;
    try {
      ai = await deps.extractTags(ko);
    } catch (error) {
      // Erschoepftes GLOBALES Tagesbudget (Choke-Point-Reservierung in ai.js):
      // kontrolliert stoppen statt jeden weiteren Kandidaten als "failed" zu
      // zaehlen — auch bypassBudget kann diesen Deckel nicht umgehen (s. oben).
      if (error && error.code === "LLM_BUDGET_EXHAUSTED") { stop = "daily-llm-budget"; break; }
      ai = null;
    }
    if (ai === null) { failed += 1; continue; } // KI-Fehler: nichts schreiben
    aiCalls += 1;
    spentCents += estPerCallCents; // Call fand statt -> zaehlt gegen den Deckel

    const tags = filterEvidencedTags((ai && ai.tags) || [], ko);
    const policy_field = typeof deps.derivePolicyFields === "function" ? deps.derivePolicyFields(ko) : [];
    if (!tags.length && !policy_field.length) { skipped += 1; continue; }
    try {
      await deps.saveEnrichment(ko.id, { tags, policy_field });
      processed += 1;
      if (samples.length < 5) samples.push({ id: ko.id, tags, policy_field });
    } catch (_) { failed += 1; }
    if (processed % 10 === 0) log(`KO-Anreicherung: ${processed} geschrieben, ~${(spentCents / 100).toFixed(2)} EUR`);
  }

  return {
    dryRun: false,
    candidates: candidates.length,
    aiCalls,
    processed,
    skipped,
    failed,
    stop,
    spentEur: +(spentCents / 100).toFixed(2),
    capEur: +(capCents / 100).toFixed(2),
    samples
  };
}

module.exports = { runKoEnrichmentBackfill, filterEvidencedTags, normalizeForMatch };
