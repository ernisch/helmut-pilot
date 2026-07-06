"use strict";

// Helmut Core V3 — Decision Engine (pro Nutzer x Vorgang, KEINE KI).
// "Einmal verstehen (global) -> mehrfach bewerten (pro Nutzer, 0 KI)".
//
// Diese Engine ist die V3-Ablösung des V2-Regel-Scorings (personalization.js/
// runtime.js). Sie bewertet mandantenlose knowledge_objects gegen ein Nutzerprofil
// und erzeugt die per-Nutzer-ENTSCHEIDUNG (score/decision/priority_type) für die
// decisions-Tabelle — deterministisch, reproduzierbar, ohne KI, ohne Netzwerk und
// OHNE hartkodierte Mandats-/Personen-Biases (der V2-Cem-Ince/„Arbeit und Soziales"-
// Bias entfällt bewusst — bewertet wird ausschließlich aus PROFIL-Merkmalen).
//
// Signale (alle öffentlich, deterministisch):
//   1. matched_features aus der Matching-Engine (Partei/Ausschuss/Wahlkreis/Thema)
//      — harte, erklärbare Identitätstreffer zwischen Profil und Vorgang.
//   2. Kosinus-Ähnlichkeit (Profil-Vektor ↔ Vorgangs-Vektor).
//   3. Vorgangs-Signale aus dem KO: Zeitdruck/Deadline (Aktualität), Quellenanzahl
//      (Belastbarkeit), Konfidenz, Risiken/Chancen (Richtung der Empfehlung).
//
// Die "heilige" Schwellenregel (Server == Client, siehe contract-snapshot-test):
//   score >= 60 -> "Sofort reagieren", >= 40 -> "Beobachten", sonst "Ignorieren".
//
// DSGVO: es werden nur öffentliche politische Merkmale verarbeitet; die
// erklärenden Felder (matched_features, chance, risk) tragen kurze öffentliche
// Labels aus dem KO — keine Freitext-PII, keine privaten Personenprofile.

const matching = require("./matching");

const DECISION_ENUM = ["Sofort reagieren", "Beobachten", "Ignorieren"];
const PRIORITY_TYPE_ENUM = ["action", "watch", "chance", "risk", "ignore", "high"];

// Gewichte der harten Identitätstreffer (ein Treffer pro Dimension zählt einmal).
// Ausschuss > Partei > Wahlkreis > Thema — fachliche Zuständigkeit wiegt am meisten.
const FEATURE_WEIGHTS = { ausschuss: 34, partei: 22, wahlkreis: 20, thema: 12 };
const SIMILARITY_WEIGHT = 24; // max. Beitrag der Kosinus-Ähnlichkeit
const URGENCY_BONUS = 8;      // Zeitdruck/Deadline vorhanden
const EVIDENCE_BONUS = 4;     // >= 2 Quell-Dokumente
const CONFIDENCE_BONUS = 4;   // hohe KO-Konfidenz

function clamp(n, min = 0, max = 100) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function nonEmptyList(value) {
  return Array.isArray(value) ? value.filter((v) => String(v || "").trim() !== "") : [];
}

// Deterministische, erklärbare 0–100-Bewertung EINES Vorgangs für EIN Profil.
// match = { similarity, matched_features:[{type,value}] } (aus der Matching-Engine).
function scoreKnowledgeObject(ko = {}, match = {}) {
  let score = 0;
  const seen = new Set();
  for (const f of Array.isArray(match.matched_features) ? match.matched_features : []) {
    const type = f && f.type;
    if (!type || seen.has(type)) continue;
    seen.add(type);
    score += FEATURE_WEIGHTS[type] || 0;
  }
  score += clamp(match.similarity, 0, 1) * SIMILARITY_WEIGHT;
  const hasDeadline = Boolean(ko.deadline);
  const hasZeitdruck = String(ko.zeitdruck || "").trim() !== "";
  if (hasDeadline || hasZeitdruck) score += URGENCY_BONUS;
  if (Number(ko.source_document_count) >= 2) score += EVIDENCE_BONUS;
  if (Number(ko.confidence_score) >= 70) score += CONFIDENCE_BONUS;
  return Math.round(clamp(score, 0, 100));
}

// Die heilige Client-Schwellenregel — Server und Client MÜSSEN übereinstimmen.
function decisionFromScore(score) {
  return score >= 60 ? "Sofort reagieren" : score >= 40 ? "Beobachten" : "Ignorieren";
}

// priority_type ∈ PRIORITY_TYPE_ENUM. Richtung (Risiko/Chance) aus dem KO,
// Dringlichkeit aus dem Score. Immer ein gültiger Enum-Wert.
function priorityTypeFor(score, ko = {}) {
  if (score < 40) return "ignore";
  const riskCount = nonEmptyList(ko.risiken).length;
  const chanceCount = nonEmptyList(ko.chancen).length;
  if (riskCount > chanceCount) return "risk";
  if (chanceCount > 0) return "chance";
  if (score >= 80) return "high";
  if (score >= 60) return "action";
  return "watch";
}

// Baut EINE decisions-Zeile (Schema: supabase/schema.sql public.decisions).
function buildDecision(userId, ko, match = {}) {
  if (!userId || !ko || !ko.id) return null;
  const score = scoreKnowledgeObject(ko, match);
  const decision = decisionFromScore(score);
  const risk = nonEmptyList(ko.risiken)[0] || null;
  const chance = nonEmptyList(ko.chancen)[0] || null;
  return {
    id: `dec-${userId}-${ko.id}`,
    user_id: userId,
    knowledge_object_id: ko.id,
    vorgang_id: ko.vorgang_id || null,
    score,
    decision,
    priority_type: priorityTypeFor(score, ko),
    matched_features: Array.isArray(match.matched_features) ? match.matched_features : [],
    chance,
    risk,
    deadline: ko.deadline || null,
    status: "new"
  };
}

// Erzeugt die Entscheidungen für EIN Profil über eine Menge (verstandener) KOs.
// Nutzt die deterministische Matching-Engine für Relevanz + matched_features und
// bewertet dann jeden getroffenen Vorgang. Rein synchron, ohne Netzwerk/KI.
function decideForUser(profile = {}, knowledgeObjects = [], opts = {}) {
  const userId = opts.userId || profile.id || profile.userId || profile.politicianId;
  if (!userId) return [];
  const understood = (Array.isArray(knowledgeObjects) ? knowledgeObjects : [])
    .filter((k) => k && k.id && k.status !== "pending");
  const limit = opts.limit != null ? Number(opts.limit) : 50;
  const matches = matching.matchProfileToKnowledgeObjects(profile, understood, { limit });
  const byId = new Map(understood.map((k) => [k.id, k]));
  return matches
    .map((m) => buildDecision(userId, byId.get(m.knowledge_object_id), m))
    .filter(Boolean);
}

// --- Shadow-Runner (Produktion): lädt Profil + KOs, erzeugt + speichert -------
// Deps injizierbar (Test = offline). Gatet wie Matching/Lazy auf den V3-Store:
// Flag aus / kein Supabase -> inert (skipped), kein Crash.
function defaultDeps() {
  const storage = require("./storage");
  return {
    enabled: () => storage.v3StoreReady(),
    getProfile: (userId) => storage.getProfile(userId),
    listKnowledgeObjects: (o) => storage.listKnowledgeObjects(o),
    saveDecisions: (rows) => storage.saveDecisions(rows)
  };
}

async function runDecisionShadow(input = {}, overrides = {}) {
  const deps = { ...defaultDeps(), ...overrides };
  if (!deps.enabled()) return { skipped: true, reason: "v3-store-disabled" };

  const profile = input.profile || (input.userId ? await deps.getProfile(input.userId) : null);
  const userId = input.userId || (profile && (profile.id || profile.userId || profile.politicianId));
  if (!profile || !userId) return { skipped: true, reason: "no-profile" };

  const all = (await deps.listKnowledgeObjects({ limit: input.limit || 200 })) || [];
  const understood = all.filter((k) =>
    k && k.status !== "pending" && k.understanding_status === "complete" && (k.was_ist_passiert || k.warum_wichtig)
  );
  if (!understood.length) return { skipped: true, reason: "no-vorgaenge" };

  const decisions = decideForUser(profile, understood, { userId, limit: input.limit || 50 });
  const saved = await deps.saveDecisions(decisions);
  return {
    userId,
    candidates: decisions.length,
    saved: (saved && saved.saved) || 0
  };
}

module.exports = {
  DECISION_ENUM,
  PRIORITY_TYPE_ENUM,
  scoreKnowledgeObject,
  decisionFromScore,
  priorityTypeFor,
  buildDecision,
  decideForUser,
  runDecisionShadow,
  defaultDeps
};
