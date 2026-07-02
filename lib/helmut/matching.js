"use strict";

// Helmut Core V3 — C7a: Matching Engine (pgvector, KEINE KI).
// "Einmal verstehen (global) -> mehrfach bewerten (pro Nutzer, 0 KI)".
//
// Diese Engine bewertet mandantenlose knowledge_objects gegen ein Nutzerprofil —
// deterministisch, reproduzierbar, ohne KI und ohne Netzwerk:
//   1. Merkmalsvektor (Embedding) aus OEFFENTLICHEN Profilmerkmalen
//      (Partei/Fraktion, Ausschuss, Themen, Wahlkreis/Region) — regelbasiert
//      per Hashing-Trick, KEIN Modell-Call.
//   2. Kosinus-Aehnlichkeit zwischen Profil- und Vorgangs-Vektor.
//   3. Harte, erklaerbare Filter (Partei/Ausschuss/Wahlkreis) — optional.
//   4. matched_features: welches Merkmal warum getroffen hat (Erklaerbarkeit).
//
// In Produktion traegt pgvector die Suche (storage.matchKnowledgeObjectsByEmbedding
// -> SQL-RPC). Der reine Kern hier ist identisch deterministisch und dient dem
// Offline-Test (P1) und als Fallback ohne Supabase.
//
// DSGVO: Es werden ausschliesslich oeffentliche politische Merkmale verarbeitet.
// matched_features sind kurze oeffentliche Labels (z. B. "SPD", "Ausschuss fuer
// Arbeit"), keine Freitext-PII, keine privaten Personenprofile.

const crypto = require("crypto");

// Muss zur vector(N)-Spalte in supabase/schema.sql passen.
const EMBEDDING_DIM = Number(process.env.HELMUT_MATCHING_DIM || 256);

// Merkmalsgewichte: harte Identitaetsmerkmale zaehlen mehr als freier Inhalt.
const WEIGHTS = { partei: 3, ausschuss: 3, region: 2, thema: 2, inhalt: 1 };

// --- kleine, reine Helfer ---------------------------------------------------
function slug(value) {
  return String(value == null ? "" : value)
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

function label(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, 120);
}

function uniq(list) {
  return [...new Set((Array.isArray(list) ? list : []).map((v) => String(v || "").trim()).filter(Boolean))];
}

function contentTokens(text) {
  return [...new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]+/gi, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 4)
  )];
}

function round4(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

// pgvector liefert Vektoren als Literal-String "[a,b,c]"; Testdaten als Array.
function toVector(value) {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try { return JSON.parse(value).map(Number); } catch { return null; }
  }
  return null;
}

// --- Hashing-Trick: Token -> (Index, Vorzeichen). Deterministisch (sha256) ---
function hashToIndex(token, dim) {
  const h = crypto.createHash("sha256").update(String(token)).digest();
  const raw = ((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >>> 0;
  const sign = (h[4] & 1) === 0 ? 1 : -1;
  return { index: raw % dim, sign };
}

function l2normalize(vec) {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum);
  if (!norm) return vec.slice();
  return vec.map((v) => v / norm);
}

function embed(weightedTokens, dim = EMBEDDING_DIM) {
  const vec = new Array(dim).fill(0);
  for (const wt of weightedTokens) {
    if (!wt || !wt.token) continue;
    const { index, sign } = hashToIndex(wt.token, dim);
    vec[index] += sign * (Number(wt.weight) || 0);
  }
  return l2normalize(vec);
}

function cosineSimilarity(a, b) {
  const va = toVector(a);
  const vb = toVector(b);
  if (!va || !vb || va.length !== vb.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < va.length; i += 1) {
    dot += va[i] * vb[i];
    na += va[i] * va[i];
    nb += vb[i] * vb[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// --- Merkmalsextraktion (nur oeffentliche Merkmale) -------------------------
function profileFeatures(profile = {}) {
  return {
    parties: uniq([profile.party, profile.partei, profile.faction, profile.fraktion]),
    committees: uniq([profile.committee, ...(profile.committees || [])]),
    regions: uniq([
      profile.constituency, profile.wahlkreis, profile.state, profile.bundesland,
      profile.location, ...(profile.regionalInterests || [])
    ]),
    topics: uniq([...(profile.focusTopics || []), ...(profile.reportingTopics || []), ...(profile.topics || [])])
  };
}

function knowledgeObjectFeatures(ko = {}) {
  return {
    parties: uniq([...(ko.parteien || []), ...(ko.mentioned_parties || [])]),
    committees: uniq([...(ko.ausschuesse || []), ...(ko.mentioned_committees || [])]),
    regions: uniq([...(ko.mentioned_locations || []), ...(ko.regions || [])]),
    topics: uniq([...(ko.tags || []), ...(ko.policy_field || [])])
  };
}

function profileWeightedTokens(profile = {}) {
  const f = profileFeatures(profile);
  const out = [];
  f.parties.forEach((p) => out.push({ token: `partei:${slug(p)}`, weight: WEIGHTS.partei }));
  f.committees.forEach((c) => out.push({ token: `ausschuss:${slug(c)}`, weight: WEIGHTS.ausschuss }));
  f.regions.forEach((r) => out.push({ token: `region:${slug(r)}`, weight: WEIGHTS.region }));
  f.topics.forEach((t) => {
    out.push({ token: `thema:${slug(t)}`, weight: WEIGHTS.thema });
    contentTokens(t).forEach((ct) => out.push({ token: `inhalt:${ct}`, weight: WEIGHTS.inhalt }));
  });
  return out;
}

function knowledgeObjectWeightedTokens(ko = {}) {
  const f = knowledgeObjectFeatures(ko);
  const out = [];
  f.parties.forEach((p) => out.push({ token: `partei:${slug(p)}`, weight: WEIGHTS.partei }));
  f.committees.forEach((c) => out.push({ token: `ausschuss:${slug(c)}`, weight: WEIGHTS.ausschuss }));
  f.regions.forEach((r) => out.push({ token: `region:${slug(r)}`, weight: WEIGHTS.region }));
  f.topics.forEach((t) => {
    out.push({ token: `thema:${slug(t)}`, weight: WEIGHTS.thema });
    contentTokens(t).forEach((ct) => out.push({ token: `inhalt:${ct}`, weight: WEIGHTS.inhalt }));
  });
  contentTokens(`${ko.headline || ""} ${ko.was_ist_passiert || ""} ${ko.warum_wichtig || ""}`)
    .forEach((ct) => out.push({ token: `inhalt:${ct}`, weight: WEIGHTS.inhalt }));
  return out;
}

function embedProfile(profile, dim = EMBEDDING_DIM) {
  return embed(profileWeightedTokens(profile), dim);
}

function embedKnowledgeObject(ko, dim = EMBEDDING_DIM) {
  return embed(knowledgeObjectWeightedTokens(ko), dim);
}

// Stabiler Hash der Profilmerkmale -> erkennt Profiländerungen (Embedding neu?).
function profileHash(profile = {}) {
  const f = profileFeatures(profile);
  const parts = [["p", f.parties], ["c", f.committees], ["r", f.regions], ["t", f.topics]]
    .map(([k, arr]) => `${k}:${[...new Set(arr.map(slug))].sort().join(",")}`);
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

// --- Filter (Partei/Ausschuss/Wahlkreis) + Erklaerbarkeit -------------------
function overlapLabels(aList, bList) {
  const bSlugs = new Set((bList || []).map(slug));
  const seen = new Set();
  const out = [];
  for (const a of aList || []) {
    const s = slug(a);
    if (s && bSlugs.has(s) && !seen.has(s)) { seen.add(s); out.push(label(a)); }
  }
  return out;
}

// filters = { parties?:[], committees?:[], regions?:[] }. Eine gesetzte Dimension
// muss ueberlappen (AND ueber Dimensionen, OR innerhalb). Leer/nicht gesetzt = egal.
function passesFilters(koFeatures, filters) {
  if (!filters) return true;
  const dimOk = (want, have) => {
    if (!want || !want.length) return true;
    const haveSlugs = new Set((have || []).map(slug));
    return want.some((w) => haveSlugs.has(slug(w)));
  };
  return dimOk(filters.parties, koFeatures.parties)
    && dimOk(filters.committees, koFeatures.committees)
    && dimOk(filters.regions, koFeatures.regions);
}

function matchedFeatures(pf, kf) {
  const feats = [];
  overlapLabels(pf.parties, kf.parties).forEach((v) => feats.push({ type: "partei", value: v }));
  overlapLabels(pf.committees, kf.committees).forEach((v) => feats.push({ type: "ausschuss", value: v }));
  overlapLabels(pf.regions, kf.regions).forEach((v) => feats.push({ type: "wahlkreis", value: v }));
  overlapLabels(pf.topics, kf.topics).forEach((v) => feats.push({ type: "thema", value: v }));
  return feats;
}

// --- Reiner deterministischer Match (P1-testbar, ohne Storage/Netz) ---------
// Rankt knowledge_objects gegen ein Profil. Nutzt vorhandene ko.embedding, sonst
// berechnet es deterministisch. Gibt erklaerbare, sortierte Treffer zurueck.
function matchProfileToKnowledgeObjects(profile, knowledgeObjects = [], opts = {}) {
  const dim = opts.dim || EMBEDDING_DIM;
  const threshold = opts.threshold != null ? Number(opts.threshold) : 0;
  const limit = opts.limit != null ? Number(opts.limit) : 20;
  const filters = opts.filters || null;
  const pf = profileFeatures(profile);
  const pEmb = opts.profileEmbedding ? toVector(opts.profileEmbedding) : embedProfile(profile, dim);

  const scored = [];
  for (const ko of knowledgeObjects || []) {
    if (!ko || !ko.id) continue;
    if (ko.status === "pending") continue; // noch nicht verstanden -> nicht matchbar
    const kf = knowledgeObjectFeatures(ko);
    if (!passesFilters(kf, filters)) continue;
    const kEmb = toVector(ko.embedding) || embedKnowledgeObject(ko, dim);
    const similarity = cosineSimilarity(pEmb, kEmb);
    const matched = matchedFeatures(pf, kf);
    if (similarity < threshold && !matched.length) continue;
    scored.push({
      knowledge_object_id: ko.id,
      vorgang_id: ko.vorgang_id || null,
      similarity: round4(similarity),
      matched_features: matched
    });
  }
  scored.sort((a, b) =>
    (b.similarity - a.similarity) ||
    (b.matched_features.length - a.matched_features.length) ||
    String(a.knowledge_object_id).localeCompare(String(b.knowledge_object_id))
  );
  return scored.slice(0, Math.max(0, limit)).map((r, i) => ({ ...r, rank: i + 1 }));
}

// --- Shadow-Runner (Produktion): pgvector-Suche + Persistenz, hinter Flag ---
function defaultDeps() {
  const storage = require("./storage");
  return {
    enabled: () => storage.v3MatchingEnabled(),
    getProfile: (userId) => storage.getProfile(userId),
    listKnowledgeObjects: (o) => storage.listKnowledgeObjects(o),
    saveProfileEmbedding: (e) => storage.saveProfileEmbedding(e),
    matchByEmbedding: (p) => storage.matchKnowledgeObjectsByEmbedding(p),
    saveMatchingResults: (rows) => storage.saveMatchingResults(rows)
  };
}

async function runMatchingShadow(input = {}, overrides = {}) {
  const deps = { ...defaultDeps(), ...overrides };
  if (!deps.enabled()) return { skipped: true, reason: "matching-disabled" };

  const profile = input.profile || (input.userId ? await deps.getProfile(input.userId) : null);
  const userId = input.userId || (profile && (profile.id || profile.userId || profile.politicianId));
  if (!profile || !userId) return { skipped: true, reason: "no-profile" };

  const dim = input.dim || EMBEDDING_DIM;
  const embedding = embedProfile(profile, dim);
  await deps.saveProfileEmbedding({ user_id: userId, embedding, profile_hash: profileHash(profile), dim });

  const filters = input.filters || null;
  const matchCount = input.limit || 20;

  // Produktionspfad: pgvector-Aehnlichkeitssuche (harte Filter laufen in SQL).
  const search = await deps.matchByEmbedding({
    embedding,
    matchCount,
    filterParties: filters && filters.parties,
    filterCommittees: filters && filters.committees,
    filterRegions: filters && filters.regions
  });
  if (search && search.skipped) return { skipped: true, reason: search.reason };

  // Erklaerbarkeit: matched_features aus den gefundenen KOs berechnen.
  const kos = await deps.listKnowledgeObjects({ limit: 200 });
  const byId = new Map((Array.isArray(kos) ? kos : []).map((k) => [k.id, k]));
  const pf = profileFeatures(profile);
  const rows = (search.results || []).map((hit, i) => {
    const ko = byId.get(hit.id) || {};
    return {
      id: `mr-${userId}-${hit.id}`,
      user_id: userId,
      knowledge_object_id: hit.id,
      vorgang_id: hit.vorgang_id || ko.vorgang_id || null,
      similarity: round4(hit.similarity),
      rank: i + 1,
      matched_features: matchedFeatures(pf, knowledgeObjectFeatures(ko)),
      filters: filters || {}
    };
  });
  const saved = await deps.saveMatchingResults(rows);
  return { userId, candidates: rows.length, saved: (saved && saved.saved) || 0, filters: filters || {} };
}

module.exports = {
  EMBEDDING_DIM,
  slug,
  cosineSimilarity,
  profileFeatures,
  knowledgeObjectFeatures,
  embedProfile,
  embedKnowledgeObject,
  profileHash,
  passesFilters,
  matchedFeatures,
  matchProfileToKnowledgeObjects,
  runMatchingShadow,
  defaultDeps
};
