"use strict";

// Sprint 22A — Datenvertrag für Wissensobjekt-Embeddings.
// Rein offline: 0 Netz, 0 KI, 0 Datenbank. Dieses Modul ERZEUGT keine Vektoren
// und ruft KEIN Modell auf — es definiert Berechtigung, kanonischen Eingang,
// Input-Hash, Gültigkeit und Arbeitsplanung, damit ein späterer Backfill
// (Sprint 22B, freigabepflichtig) idempotent und wiederaufnehmbar ist.
//
// BEGRIFFSKLARHEIT (verbindlich, docs/embedding-architektur.md):
//  - "feature_vector": der BESTEHENDE deterministische 256-dim Merkmalsvektor
//    (lib/helmut/matching.js, Token-Hash aus Partei/Ausschuss/Region/Thema/
//    Inhalt). Liegt in der Legacy-benannten Spalte knowledge_objects.embedding.
//    KEIN semantisches Embedding.
//  - "semantic_text": ein künftiges semantisches Text-Embedding eines externen
//    oder lokalen Modells. Existiert heute NICHT in Production; darf die
//    bestehende Spalte NIE überschreiben (Shadow-Tabelle, additiv).
//
// MANDANTENNEUTRALITÄT: Der kanonische Eingang besteht ausschließlich aus
// globalen, mandantenlosen Verstehens-Ergebnissen. Kein Nutzername, kein
// Mandat, keine Priorität, kein Matching-Ergebnis, keine Briefing-Bewertung.
// Fachgebiet, politische Ebene und Geografie bleiben STRUKTURIERTE FILTER und
// sind bewusst NICHT Teil des Eingangs — ihre Korrektur erzwingt keine
// Neuerzeugung des Vektors.

const crypto = require("crypto");

const EMBEDDING_KINDS = Object.freeze({
  FEATURE_VECTOR: "feature_vector",
  SEMANTIC_TEXT: "semantic_text"
});

// Rezeptversion des kanonischen Eingangs. Jede inhaltliche Änderung an
// buildCanonicalEmbeddingInput MUSS diese Version erhöhen — sonst erkennt
// isEmbeddingCurrent veraltete Vektoren nicht.
const RECIPE_VERSION = "ko-kanon-1";

// Felder, die NIE in den Embedding-Eingang dürfen. Zwei Klassen:
//  - mandanten-/nutzerspezifisch (würde den globalen Vektor personalisieren)
//  - instabil/abgeleitet (würde bei jeder Neubewertung eine Neuerzeugung auslösen)
// Die Liste ist dokumentarisch UND testgesichert (embedding-contract-test.js).
const EXCLUDED_INPUT_FIELDS = Object.freeze([
  // mandanten-/nutzerspezifisch
  "user_id", "mandant", "nutzer", "priority", "user_priority",
  // abgeleitete/instabile Bewertungen
  "matching_results", "similarity", "briefing_score", "classification_confidence",
  // strukturierte Filter (bleiben Filter, nicht Vektorinhalt)
  "tags", "policy_field", "political_level", "decision_level", "related_levels",
  "affected_geographies", "mentioned_geographies", "mentioned_locations"
]);

function normText(value) {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

// Entitätsnamen stabil extrahieren: sortiert + dedupliziert, damit eine bloße
// Umsortierung im Verstehens-Output KEINE Neuerzeugung auslöst.
function entityNames(list) {
  if (!Array.isArray(list)) return [];
  const names = list
    .map((e) => normText(e && typeof e === "object" ? e.name : e))
    .filter(Boolean);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, "de"));
}

// Kanonischer Eingangstext eines Wissensobjekts (mandantenneutral, stabil).
// Enthalten: Titel, Vorgang, Bedeutung, Ereignistyp, Entscheidungs-/beteiligte
// Akteure und Institutionen. NICHT enthalten: Fachgebiet, Ebene, Geografie,
// Konfidenzen, Nutzer-/Matching-/Briefing-Daten (EXCLUDED_INPUT_FIELDS).
function buildCanonicalEmbeddingInput(ko = {}) {
  const teile = [
    ["titel", normText(ko.headline)],
    ["vorgang", normText(ko.was_ist_passiert)],
    ["bedeutung", normText(ko.warum_wichtig)],
    ["ereignis", normText(ko.event_type)],
    ["akteure", entityNames(ko.decision_entities).join("; ")],
    ["beteiligte", entityNames(ko.related_entities).join("; ")]
  ];
  const text = teile
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return { text, recipeVersion: RECIPE_VERSION };
}

function computeInputHash(text, recipeVersion = RECIPE_VERSION) {
  return crypto.createHash("sha256")
    .update(`${recipeVersion}\n${String(text == null ? "" : text)}`)
    .digest("hex");
}

function computeEmbeddingInputHash(ko) {
  const input = buildCanonicalEmbeddingInput(ko);
  return computeInputHash(input.text, input.recipeVersion);
}

// Mindestinhalt eines stabilen Wissensobjekts: verstanden UND ein belastbarer
// Kerntext. Die Entscheidung hängt bewusst NICHT an einem einzelnen
// Metadatenfeld (Fachgebiet/Ebene/Geografie sind KEINE Voraussetzungen).
const MIN_CORE_TEXT_LENGTH = 60;

function isEligibleForEmbedding(ko) {
  if (!ko || typeof ko !== "object" || !ko.id) {
    return { eligible: false, reason: "kein-objekt" };
  }
  // Unverstandene Objekte: es existiert kein verstandener Inhalt, den man
  // einbetten könnte (der Rohtext ist kein Wissensobjekt-Inhalt).
  if (ko.understanding_status !== "complete") {
    return { eligible: false, reason: "nicht-verstanden" };
  }
  // Terminal aussortierte Objekte (OP-06-Kennung "aussortiert:<runId>:<vorstatus>").
  if (typeof ko.status === "string" && ko.status.startsWith("aussortiert")) {
    return { eligible: false, reason: "aussortiert" };
  }
  // Zusammengeführte/abgelöste Objekte: der Nachfolger trägt den Inhalt.
  if (ko.merged_into || ko.superseded_by) {
    return { eligible: false, reason: "zusammengefuehrt" };
  }
  const kern = `${normText(ko.headline)} ${normText(ko.was_ist_passiert)} ${normText(ko.warum_wichtig)}`.trim();
  if (kern.length < MIN_CORE_TEXT_LENGTH) {
    return { eligible: false, reason: "mindestinhalt-fehlt" };
  }
  // AUSDRÜCKLICH berechtigt (Sprint-22A-Entscheidung, kein Blocker):
  //  - verstandene Objekte OHNE Fachgebiet (Fachgebiet ist nicht Teil des Eingangs)
  //  - verstandene Objekte mit UNBEKANNTER politischer Ebene (Ebene ist Filter)
  //  - Objekte mit korrigierter Geografie (Geografie ist nicht Teil des Eingangs)
  return { eligible: true, reason: "ok" };
}

// Vektorvalidierung: erkennt fehlende, leere, dimensionsfremde und ungültige
// Vektoren. pgvector liefert Strings "[a,b,c]" — beide Formen werden geprüft.
function validateVector(vector, expectedDim) {
  let vec = vector;
  if (typeof vec === "string" && vec.trim().startsWith("[")) {
    try { vec = JSON.parse(vec); } catch { return { ok: false, reason: "nicht-lesbar" }; }
  }
  if (vec == null) return { ok: false, reason: "fehlt" };
  if (!Array.isArray(vec) || !vec.length) return { ok: false, reason: "leer" };
  if (expectedDim != null && vec.length !== Number(expectedDim)) {
    return { ok: false, reason: "falsche-dimension", dim: vec.length };
  }
  let norm = 0;
  for (const v of vec) {
    const n = Number(v);
    if (typeof v === "boolean" || v == null || Number.isNaN(n) || !Number.isFinite(n)) {
      return { ok: false, reason: "ungueltige-werte" };
    }
    norm += n * n;
  }
  if (norm === 0) return { ok: false, reason: "nullvektor" };
  return { ok: true, reason: "ok", dim: vec.length };
}

// Gültigkeitsentscheidung: Ein Embedding ist aktuell, wenn Vektor, Input-Hash,
// Modell, Dimension und Rezeptversion übereinstimmen. Änderungen an Matching-
// Scores, Briefings oder anderen abgeleiteten Daten kommen hier konstruktiv
// nicht vor und können daher NIE eine Neuerzeugung auslösen.
function isEmbeddingCurrent(meta, expected = {}) {
  if (!meta || typeof meta !== "object") return { current: false, reason: "kein-eintrag" };
  const v = validateVector(meta.vector != null ? meta.vector : meta.embedding, expected.dim);
  if (!v.ok) return { current: false, reason: v.reason };
  if (expected.inputHash && meta.input_hash !== expected.inputHash) {
    return { current: false, reason: "input-veraltet" };
  }
  if (expected.model && meta.model !== expected.model) {
    return { current: false, reason: "modellwechsel" };
  }
  if (expected.recipeVersion && meta.recipe_version !== expected.recipeVersion) {
    return { current: false, reason: "rezeptwechsel" };
  }
  if (expected.dim != null && Number(meta.dim || v.dim) !== Number(expected.dim)) {
    return { current: false, reason: "falsche-dimension" };
  }
  return { current: true, reason: "aktuell" };
}

// Reine Arbeitsplanung für einen späteren Backfill (keine Ausführung!):
// deterministisch, idempotent, wiederaufnehmbar. metaById bildet den bereits
// persistierten Zustand ab (z. B. die Shadow-Tabelle); ein zweiter Lauf mit
// fortgeschriebenem metaById plant die restlichen Objekte — nie dieselben doppelt.
function planEmbeddingWork(objects = [], metaById = {}, expected = {}, opts = {}) {
  const maxPerRun = Number.isFinite(Number(opts.maxPerRun)) && Number(opts.maxPerRun) > 0
    ? Math.floor(Number(opts.maxPerRun)) : Infinity;
  const plan = { toCompute: [], current: [], excluded: [] };
  const sorted = [...objects].filter(Boolean).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (const ko of sorted) {
    const elig = isEligibleForEmbedding(ko);
    if (!elig.eligible) { plan.excluded.push({ id: ko && ko.id, reason: elig.reason }); continue; }
    const inputHash = computeEmbeddingInputHash(ko);
    const meta = metaById[ko.id];
    const cur = isEmbeddingCurrent(meta, { ...expected, inputHash });
    if (cur.current) { plan.current.push({ id: ko.id, reason: cur.reason }); continue; }
    if (plan.toCompute.length < maxPerRun) {
      plan.toCompute.push({ id: ko.id, inputHash, reason: cur.reason });
    }
  }
  plan.remaining = sorted.length - plan.excluded.length - plan.current.length - plan.toCompute.length;
  return plan;
}

module.exports = {
  EMBEDDING_KINDS,
  RECIPE_VERSION,
  EXCLUDED_INPUT_FIELDS,
  MIN_CORE_TEXT_LENGTH,
  buildCanonicalEmbeddingInput,
  computeInputHash,
  computeEmbeddingInputHash,
  isEligibleForEmbedding,
  validateVector,
  isEmbeddingCurrent,
  planEmbeddingWork
};
