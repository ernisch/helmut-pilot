"use strict";

// Helmut — Quellenarchitektur · Understanding-Priorisierung (VORBEREITET, Shadow-Logik).
// =============================================================================================
// PROBLEM (real gemessen): der heutige Tages-Call-Deckel laesst ~15-20 Understanding/Tag zu und
// deckelt 75-95% der Nachfrage — die Auswahl entscheidet die ANKUNFTSREIHENFOLGE im Crawl-Loop,
// NICHT die Relevanz. Ein spaet im Loop auftauchender amtlicher/relevanter Vorgang wird von einem
// frueheren Grenzfall verdraengt.
//
// LOESUNG (reine Logik, KEINE KI/Netz/DB): kommt ein Budget von N vollen Understanding-Slots zum
// Tragen, werden die Kandidaten NACH PRIORITAET geordnet statt nach Ankunft. Reihenfolge exakt
// nach Auftrag (hoechste zuerst):
//   1) amtliche Pflichtdokumente   2) hohe politische Relevanz   3) konkrete Frist
//   4) hohe globale Wichtigkeit     5) regionale Pflichtversorgung 6) Grenzfaelle 7) niedrige Relevanz
// Innerhalb einer Stufe: globale Wichtigkeit, dann Aktualitaet. PROFIL-UNABHAENGIG.
//
// NUR SHADOW/VORBEREITET: aendert den Production-Deckel NICHT. Dient der spaeteren, freizugebenden
// Ersetzung der blinden Deckellogik durch eine relevanzbasierte Auswahl.

const TIER = { AMTLICH: 1, HOHE_RELEVANZ: 2, FRIST: 3, WICHTIGKEIT: 4, REGIONAL: 5, GRENZFALL: 6, NIEDRIG: 7 };

function num(x, d = 0) { const n = Number(x); return Number.isFinite(n) ? n : d; }

// Prioritaetsstufe (1 = hoechste) eines Understanding-Kandidaten aus seinen bereits vorhandenen,
// deterministischen Merkmalen (Gate-Entscheidung, Tier, Relevanz, Frist, Wichtigkeit, Region).
function priorityTier(c = {}) {
  const amtlich = c.amtlich === true || c.tier === "amtlich" || c.structured === true;
  if (amtlich) return TIER.AMTLICH;
  const conf = (c.relevance && c.relevance.confidence) || c.confidence;
  const hoheRelevanz = c.decision === "verstehen" && (conf === "high" || (c.relevance && c.relevance.hasInstitution));
  if (hoheRelevanz) return TIER.HOHE_RELEVANZ;
  if (c.deadline || c.zeitdruck === "hoch" || c.zeitdruck === "sehr_hoch") return TIER.FRIST;
  if (num(c.importance) >= 70) return TIER.WICHTIGKEIT;
  const level = (c.relevance && c.relevance.level) || c.decision_level;
  if (c.regionalPflicht === true || level === "land") return TIER.REGIONAL;
  if (c.decision === "verstehen" || c.decision === "zurueckstellen") return TIER.GRENZFALL;
  return TIER.NIEDRIG;
}

// Sekundaerscore innerhalb einer Stufe: globale Wichtigkeit, dann Aktualitaet (neuer = hoeher).
function secondaryScore(c = {}, now = 0) {
  const importance = num(c.importance);
  const t = c.published_at ? Date.parse(c.published_at) : NaN;
  const recency = Number.isFinite(t) ? Math.max(0, 1 - (now - t) / (30 * 86400000)) : 0; // 0..1 ueber 30 Tage
  return importance * 1000 + recency * 100;
}

// Gesamt-Prioritaetsscore (hoeher = wichtiger): Stufe dominiert, Sekundaerscore bricht Gleichstand.
function priorityScore(c = {}, now = 0) {
  return (8 - priorityTier(c)) * 1e6 + secondaryScore(c, now);
}

// Kandidaten nach Prioritaet ordnen (wichtigste zuerst). Stabil, deterministisch.
function orderByPriority(candidates = [], now = 0) {
  return candidates
    .map((c, i) => ({ c, i, s: priorityScore(c, now) }))
    .sort((a, b) => (b.s - a.s) || (a.i - b.i))
    .map((x) => x.c);
}

// Innerhalb eines Budgets N auswaehlen: die Top-N nach Prioritaet -> 'verstehen', Rest -> 'zurueckgestellt'
// (Deckel-Rest, nicht verworfen). Liefert Auswahl + Kennzahlen fuer den Shadow-Vergleich.
function selectWithinBudget(candidates = [], budget = Infinity, now = 0) {
  const ordered = orderByPriority(candidates, now);
  const gewaehlt = ordered.slice(0, budget);
  const zurueckgestellt = ordered.slice(budget);
  const amtlichGesamt = candidates.filter((c) => priorityTier(c) === TIER.AMTLICH).length;
  const amtlichGewaehlt = gewaehlt.filter((c) => priorityTier(c) === TIER.AMTLICH).length;
  return {
    budget, kandidaten: candidates.length,
    gewaehlt, zurueckgestellt,
    amtlichGesamt, amtlichGewaehlt, amtlichVerdraengt: amtlichGesamt - amtlichGewaehlt,
    stufenVerteilung: gewaehlt.reduce((m, c) => { const t = priorityTier(c); m[t] = (m[t] || 0) + 1; return m; }, {})
  };
}

// P1-3 (scharf-schaltbar, freigabepflichtig): einen Prioritäts-Kandidaten aus einem
// CLUSTER + seiner (deterministischen, KI-freien) Gate-Bewertung ableiten. Nutzt
// nur bereits vorhandene Signale: amtlicher Tier, Gate-Entscheidung, Aktualität des
// neuesten Dokuments. Kein KI-Call, kein Netz.
function clusterToCandidate(cluster = {}, assessed = {}) {
  const docs = Array.isArray(cluster.documents) ? cluster.documents : [];
  const newest = docs.reduce((max, d) => {
    const t = Date.parse((d && d.published_at) || 0);
    return Number.isFinite(t) && t > max ? t : max;
  }, 0);
  const amtlich = (assessed.perDoc || []).some((d) => d && d.tier === "amtlich")
    || docs.some((d) => d && (d.structured === true || /drucksache|plenarprotokoll|pardok/i.test(String(d.document_type || ""))));
  return {
    amtlich,
    decision: assessed.decision,
    published_at: newest ? new Date(newest).toISOString() : undefined
  };
}

// Cluster in PRIORITÄTSREIHENFOLGE bringen (wichtigste zuerst) statt Ankunftsreihenfolge.
// assess(cluster) -> { decision, perDoc } (Gate, deterministisch). Stabil, KI-frei.
function clustersInPriorityOrder(clusters = [], assess, now = 0) {
  const doAssess = typeof assess === "function" ? assess : () => ({});
  const wrapped = (Array.isArray(clusters) ? clusters : []).map((cluster, i) => {
    const cand = clusterToCandidate(cluster, doAssess(cluster) || {});
    return { __cluster: cluster, __i: i, ...cand };
  });
  return orderByPriority(wrapped, now).map((w) => w.__cluster);
}

module.exports = { TIER, priorityTier, priorityScore, secondaryScore, orderByPriority, selectWithinBudget, clusterToCandidate, clustersInPriorityOrder };
