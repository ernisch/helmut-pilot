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

// --- Label-Normalisierung (P1-2, profile-coverage.md §4.1/§6) ---------------
// Harte Identitaetstreffer (Ausschuss 34 P., Partei 22 P.) gingen verloren, weil
// slug() nur lowercase/Sonderzeichen macht: "Ausschuss fuer Arbeit und Soziales"
// != "Arbeit und Soziales", "Linke" != "Die Linke". Diese Normalisierung bringt
// beide Seiten (Profil UND KO) auf eine kanonische Form, BEVOR geslugt/verglichen
// wird. Umlaute werden gefaltet (ae/oe/ue/ss), damit Schreibvarianten zusammenfallen.
function foldUmlauts(s) {
  return String(s || "").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}

// Kanonische Ausschuss-Stems. Deckt die gaengigen Bundestags-Ausschuesse ab; der
// generische Praefix-/Suffix-Abbau faengt den Rest ("Ausschuss fuer X" -> "x").
const COMMITTEE_SYNONYMS = {
  "arbeit und soziales": "arbeit-und-soziales", "soziales": "arbeit-und-soziales", "sozial": "arbeit-und-soziales",
  "gesundheit": "gesundheit", "gesundheit und pflege": "gesundheit",
  "finanzen": "finanzen", "finanz": "finanzen", "haushalt": "haushalt",
  "verteidigung": "verteidigung",
  "inneres": "inneres", "inneres und heimat": "inneres", "innen": "inneres",
  "auswaertiges": "auswaertiges", "auswaertiger": "auswaertiges",
  "umwelt": "umwelt", "umwelt naturschutz nukleare sicherheit und verbraucherschutz": "umwelt",
  "wirtschaft": "wirtschaft", "wirtschaft und energie": "wirtschaft", "wirtschaft und klimaschutz": "wirtschaft",
  "bildung": "bildung", "bildung forschung und technikfolgenabschaetzung": "bildung", "bildung und forschung": "bildung",
  "recht": "recht", "recht und verbraucherschutz": "recht",
  "verkehr": "verkehr", "digitales": "digitales", "digitales und verkehr": "verkehr",
  "familie": "familie", "familie senioren frauen und jugend": "familie",
  "ernaehrung": "ernaehrung", "ernaehrung und landwirtschaft": "ernaehrung", "landwirtschaft": "ernaehrung",
  "wohnen": "wohnen", "wohnen stadtentwicklung bauwesen und kommunen": "wohnen", "bau": "wohnen",
  "menschenrechte": "menschenrechte", "tourismus": "tourismus", "sport": "sport",
  "europa": "europa", "europaeische union": "europa",
  "wirtschaftliche zusammenarbeit und entwicklung": "entwicklung", "entwicklung": "entwicklung",
  "kultur und medien": "kultur", "kultur": "kultur"
};

function normalizeCommittee(value) {
  let s = foldUmlauts(String(value == null ? "" : value).toLowerCase()).replace(/&/g, "und").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "";
  // "ausschuss fuer/zur/zum/des/der X" -> "X"
  s = s.replace(/^ausschuss\s+(fuer|zur|zum|des|der|fur)\s+/, "");
  // generisches Suffix "Xausschuss"/"X ausschuss" -> "X" (Sozialausschuss -> sozial)
  s = s.replace(/\s*ausschuss$/, "").trim();
  if (COMMITTEE_SYNONYMS[s]) return COMMITTEE_SYNONYMS[s];
  for (const key of Object.keys(COMMITTEE_SYNONYMS)) {
    if (key.length >= 5 && s.includes(key)) return COMMITTEE_SYNONYMS[key];
  }
  return s.replace(/\s+/g, "-");
}

// committeeMatchKey: KOLLISIONSSICHERE Variante fuer reine Mitgliedschafts-/Belegpruefungen
// (z. B. Radar-Ausschuss-Reiter, KO-Klassifikation), NICHT fuer die Aehnlichkeits-/Embedding-
// Pipeline. normalizeCommittee/slugCommittee bleiben ABSICHTLICH unveraendert (Insertion-
// Reihenfolge im Substring-Fallback) — sie speisen knowledgeObjectWeightedTokens/
// profileWeightedTokens und damit Ranking/Score/Top-N-Cut; jede Aenderung an ihrem Ergebnis
// verschiebt real die Trefferreihenfolge (Lage/Helmut/Radar-Dynamiken/Top-50-Cut), auch fuer
// Profile, deren eigener Ausschuss von der Aenderung gar nicht betroffen ist (geteilter
// Feature-Vektor-Raum). committeeMatchKey nutzt denselben Synonym-Katalog, aber mit
// "maximal munch" (laengster/spezifischster Schluessel zuerst), damit ein kurzer, generischer
// Schluessel NICHT faelschlich gegen einen laengeren gewinnt, der ihn als Teilwort enthaelt
// (Beispiel: "recht" war Teilwort von "menschenrechte" und gewann in Insertion-Reihenfolge vor
// dem spezifischeren Schluessel -> "Menschenrechte und humanitäre Hilfe" wurde faelschlich wie
// "Recht und Verbraucherschutz" behandelt). Bewusst getrennt von normalizeCommittee, damit die
// Korrektur NUR Mitgliedschafts-/Belegvergleiche schaerft, ohne Ranking/Score zu beruehren.
const COMMITTEE_SYNONYM_KEYS_BY_LENGTH_DESC = Object.keys(COMMITTEE_SYNONYMS).sort((a, b) => b.length - a.length);

function committeeMatchKey(value) {
  let s = foldUmlauts(String(value == null ? "" : value).toLowerCase()).replace(/&/g, "und").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "";
  s = s.replace(/^ausschuss\s+(fuer|zur|zum|des|der|fur)\s+/, "");
  s = s.replace(/\s*ausschuss$/, "").trim();
  if (COMMITTEE_SYNONYMS[s]) return COMMITTEE_SYNONYMS[s];
  for (const key of COMMITTEE_SYNONYM_KEYS_BY_LENGTH_DESC) {
    if (key.length >= 5 && s.includes(key)) return COMMITTEE_SYNONYMS[key];
  }
  return s.replace(/\s+/g, "-");
}

const PARTY_SYNONYMS = {
  "linke": "linke", "linksfraktion": "linke",
  "gruene": "gruene", "gruenen": "gruene", "buendnis 90 die gruenen": "gruene", "b90 die gruenen": "gruene", "buendnis 90": "gruene",
  "spd": "spd", "sozialdemokraten": "spd", "sozialdemokratische partei": "spd",
  "cdu": "cdu", "csu": "csu", "cdu csu": "union", "union": "union",
  "afd": "afd", "alternative fuer deutschland": "afd",
  "fdp": "fdp", "freie demokraten": "fdp", "freie demokratische partei": "fdp",
  "bsw": "bsw", "buendnis sahra wagenknecht": "bsw"
};

function normalizeParty(value) {
  let s = foldUmlauts(String(value == null ? "" : value).toLowerCase()).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "";
  s = s.replace(/^die\s+/, ""); // Artikel entfernen ("die linke" -> "linke")
  if (PARTY_SYNONYMS[s]) return PARTY_SYNONYMS[s];
  return s.replace(/\s+/g, "-");
}

const slugCommittee = (v) => slug(normalizeCommittee(v));
const slugParty = (v) => slug(normalizeParty(v));

// --- Deterministische Themen-Anreicherung (P1-1, profile-coverage.md §10) ----
// Im Prod-Bestand sind tags/policy_field bei ALLEN 217 KOs leer (die Understanding-
// Engine extrahiert sie nicht). Solange sie leer sind, wird das Politikfeld
// read-time aus den STRUKTURIERTEN, belegten Ausschuss-Feldern abgeleitet — der
// Ausschuss IST das Politikfeld. KEINE KI, KEIN erfundenes Thema, KEIN DB-Write
// (rein zur Laufzeit). Nur echte Fachfelder; Prozedur-/Kontrollgremien
// (Koalitionsausschuss, Untersuchungsausschuss, Bundesrat …) liefern KEIN Thema.
const POLICY_FIELD_LABELS = {
  "arbeit-und-soziales": "Arbeit und Soziales", "gesundheit": "Gesundheit",
  "finanzen": "Finanzen", "haushalt": "Haushalt", "verteidigung": "Verteidigung",
  "inneres": "Inneres", "auswaertiges": "Auswärtiges", "umwelt": "Umwelt",
  "wirtschaft": "Wirtschaft", "bildung": "Bildung", "recht": "Recht",
  "verkehr": "Verkehr", "digitales": "Digitales", "familie": "Familie",
  "ernaehrung": "Ernährung und Landwirtschaft", "wohnen": "Wohnen und Bau",
  "sport": "Sport", "kultur": "Kultur und Medien", "europa": "Europa",
  "entwicklung": "Entwicklung", "menschenrechte": "Menschenrechte", "tourismus": "Tourismus"
};

// Politikfelder aus den (belegten) Ausschuss-Feldern eines KO ableiten.
function derivePolicyFields(ko = {}) {
  const committees = [...(ko.ausschuesse || []), ...(ko.mentioned_committees || [])];
  const out = new Set();
  for (const c of committees) {
    const label = POLICY_FIELD_LABELS[normalizeCommittee(c)];
    if (label) out.add(label);
  }
  return [...out];
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
  const explicitTopics = uniq([...(ko.tags || []), ...(ko.policy_field || [])]);
  return {
    parties: uniq([...(ko.parteien || []), ...(ko.mentioned_parties || [])]),
    committees: uniq([...(ko.ausschuesse || []), ...(ko.mentioned_committees || [])]),
    // ko.regions existiert nicht (radar.md §5) -> nur mentioned_locations.
    regions: uniq([...(ko.mentioned_locations || [])]),
    // P1-1: leere tags/policy_field read-time aus den Ausschuessen ableiten, damit
    // die Themen-Dimension nicht komplett tot ist (deterministisch, belegt, ohne KI).
    topics: explicitTopics.length ? explicitTopics : derivePolicyFields(ko)
  };
}

function profileWeightedTokens(profile = {}) {
  const f = profileFeatures(profile);
  const out = [];
  f.parties.forEach((p) => out.push({ token: `partei:${slugParty(p)}`, weight: WEIGHTS.partei }));
  f.committees.forEach((c) => out.push({ token: `ausschuss:${slugCommittee(c)}`, weight: WEIGHTS.ausschuss }));
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
  f.parties.forEach((p) => out.push({ token: `partei:${slugParty(p)}`, weight: WEIGHTS.partei }));
  f.committees.forEach((c) => out.push({ token: `ausschuss:${slugCommittee(c)}`, weight: WEIGHTS.ausschuss }));
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

// WICHTIG (Benennung): Der von embedProfile/embedKnowledgeObject erzeugte 256-dim Vektor
// ist ein TECHNISCHER FEATURE-/MERKMALSVEKTOR (deterministischer Token-Hash aus Partei/
// Ausschuss/Region/Thema/Inhalt), KEIN semantisches Embedding. Die Kosinus-Aehnlichkeit
// darauf misst MERKMALSUEBERLAPPUNG, NICHT Bedeutungsaehnlichkeit — zwei Vorgaenge mit
// gleicher Bedeutung, aber anderen Woertern, sind hier NICHT aehnlich. Er ersetzt daher
// KEIN semantisches Matching. Echte Bedeutungsaehnlichkeit braeuchte eine Embedding-API
// (kostenpflichtig, FREIGABEPFLICHTIG) — bewusst (noch) nicht umgesetzt.
// computeFeatureVector* sind die ehrlich benannten Aliase; die Alt-Namen (embed*) bleiben
// aus Kompatibilitaet, die DB-Spalte heisst weiterhin technisch "embedding".
const computeFeatureVectorForKnowledgeObject = embedKnowledgeObject;
const computeFeatureVectorForProfile = embedProfile;

// Stabiler Hash der Profilmerkmale -> erkennt Profiländerungen (Embedding neu?).
function profileHash(profile = {}) {
  const f = profileFeatures(profile);
  const parts = [["p", f.parties, slugParty], ["c", f.committees, slugCommittee], ["r", f.regions, slug], ["t", f.topics, slug]]
    .map(([k, arr, fn]) => `${k}:${[...new Set(arr.map(fn))].sort().join(",")}`);
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

// --- Filter (Partei/Ausschuss/Wahlkreis) + Erklaerbarkeit -------------------
// slugFn erlaubt dimensionsspezifische Normalisierung (Partei/Ausschuss, P1-2).
function overlapLabels(aList, bList, slugFn = slug) {
  const bSlugs = new Set((bList || []).map(slugFn));
  const seen = new Set();
  const out = [];
  for (const a of aList || []) {
    const s = slugFn(a);
    if (s && bSlugs.has(s) && !seen.has(s)) { seen.add(s); out.push(label(a)); }
  }
  return out;
}

// filters = { parties?:[], committees?:[], regions?:[] }. Eine gesetzte Dimension
// muss ueberlappen (AND ueber Dimensionen, OR innerhalb). Leer/nicht gesetzt = egal.
function passesFilters(koFeatures, filters) {
  if (!filters) return true;
  const dimOk = (want, have, slugFn) => {
    if (!want || !want.length) return true;
    const haveSlugs = new Set((have || []).map(slugFn));
    return want.some((w) => haveSlugs.has(slugFn(w)));
  };
  return dimOk(filters.parties, koFeatures.parties, slugParty)
    && dimOk(filters.committees, koFeatures.committees, slugCommittee)
    && dimOk(filters.regions, koFeatures.regions, slug);
}

function matchedFeatures(pf, kf) {
  const feats = [];
  overlapLabels(pf.parties, kf.parties, slugParty).forEach((v) => feats.push({ type: "partei", value: v }));
  overlapLabels(pf.committees, kf.committees, slugCommittee).forEach((v) => feats.push({ type: "ausschuss", value: v }));
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
    saveMatchingResults: (rows) => storage.saveMatchingResults(rows),
    // Sprint 23B-1 (Roadmap-Punkt 23): Auditpersistenz. DEFAULT AUS.
    // Solange auditEnabled() false liefert, ist der gesamte Auditpfad inert —
    // keine Sperre, kein Lesezugriff, kein Schreibzugriff, keine zusaetzliche
    // Fehlerquelle, und die geschriebenen Ergebniszeilen sind byte-identisch
    // zum Verhalten vor diesem Sprint.
    auditEnabled: () => storage.matchingAuditEnabled(),
    audit: () => require("./matching-audit")
  };
}

async function runMatchingShadow(input = {}, overrides = {}) {
  const deps = { ...defaultDeps(), ...overrides };
  if (!deps.enabled()) return { skipped: true, reason: "matching-disabled" };

  const profile = input.profile || (input.userId ? await deps.getProfile(input.userId) : null);
  const userId = input.userId || (profile && (profile.id || profile.userId || profile.politicianId));
  if (!profile || !userId) return { skipped: true, reason: "no-profile" };

  const auditAktiv = typeof deps.auditEnabled === "function" && deps.auditEnabled() === true;
  if (!auditAktiv) return runMatchingCore(input, deps, profile, userId, null);

  // Nur im Auditpfad: EINE Sperre je Mandant/Profil ueber die bestehende
  // pipeline_locks-Infrastruktur (kein zweites Sperrsystem). Sie schliesst die
  // in Sprint 23A belegte Luecke, dass der Lage-Pfad — anders als der
  // Crawl-Pfad — bisher ungesperrt matcht. Unterschiedliche Profile tragen
  // unterschiedliche Sperrnamen und laufen weiterhin parallel.
  const audit = deps.audit();
  const gotLock = await audit.acquireRunLock(userId);
  if (gotLock === false) return { skipped: true, reason: "matching-locked", userId };
  try {
    return await runMatchingCore(input, deps, profile, userId, audit);
  } finally {
    try { await audit.releaseRunLock(userId); } catch (_) { /* TTL raeumt auf */ }
  }
}

// Der fachliche Kern. Bis einschliesslich `rows` ist er Zeile fuer Zeile
// identisch zum Stand vor Sprint 23B-1: dieselbe Kandidatenmenge, dieselben
// Aehnlichkeitswerte, dieselbe Rangvergabe, dieselben matched_features,
// dieselben Ergebniskennungen. Der Auditpfad haengt sich ausschliesslich
// DANACH ein und veraendert davon nichts.
async function runMatchingCore(input, deps, profile, userId, audit) {
  const startedAt = new Date();
  const dim = input.dim || EMBEDDING_DIM;
  const embedding = embedProfile(profile, dim);
  const pHash = profileHash(profile);
  await deps.saveProfileEmbedding({ user_id: userId, embedding, profile_hash: pHash, dim });

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

  // ── Ohne Auditpersistenz: exakt das bisherige Verhalten ───────────────────
  if (!audit) {
    const saved = await deps.saveMatchingResults(rows);
    return { userId, candidates: rows.length, saved: (saved && saved.saved) || 0, filters: filters || {} };
  }

  // ── Mit Auditpersistenz ───────────────────────────────────────────────────
  const contract = require("./matching-contract");
  const begruendung = require("./matching-begruendung");
  const recipeVersion = contract.LEGACY_RECIPE_VERSION;
  const vectorVersion = contract.legacyVectorVersion(dim);

  // Eingangszustand je Treffer. Der Eingabehash wird aus GENAU DEN Token
  // gebildet, die dieses Rezept verwendet — eine Aenderung ohne fachlichen
  // Einfluss erzeugt deshalb keinen neuen Hash. Liegt das Wissensobjekt nicht
  // im geladenen Fenster (Bestandsverhalten, Befund M-7), bleibt der Hash
  // null; die Aenderungserkennung traegt dann die Aehnlichkeit im
  // Kandidatenhash. Das ist ehrlicher als ein Hash ueber ein leeres Objekt.
  const zusatz = new Map();
  const ranking = rows.map((r) => {
    const ko = byId.get(r.knowledge_object_id);
    const koHash = ko
      ? contract.computeKnowledgeObjectInputHash(knowledgeObjectWeightedTokens(ko), recipeVersion)
      : null;
    const signale = begruendung.buildSignals(r.matched_features, r.similarity);
    const eintrag = {
      knowledge_object_id: r.knowledge_object_id,
      vorgang_id: r.vorgang_id,
      result_id: r.id,
      rank: r.rank,
      similarity: r.similarity,
      signale,
      ko_eingabe_hash: koHash,
      ko_version: ko && ko.ko_version != null ? Number(ko.ko_version) : null,
      begruendung: begruendung.begruendungAusSignalen(signale, r.matched_features)
    };
    zusatz.set(r.knowledge_object_id, eintrag);
    return eintrag;
  });

  const auditErgebnis = await audit.auditRun({
    tenantId: userId,
    // Heute traegt ein Mandant genau ein Profil mit derselben Kennung
    // (Sprint 23A §6a). Der Aufrufer darf eine eigene Profilkennung uebergeben —
    // damit blockiert diese Struktur eine spaetere Trennung nicht.
    mandateProfileId: input.mandateProfileId || userId,
    profileHash: pHash,
    engineVersion: contract.LEGACY_ENGINE_VERSION,
    recipeVersion,
    vectorVersion,
    thresholds: { matchCount, schwelle: null, filter: filters || {} },
    ranking,
    ausloeser: input.ausloeser || "unbekannt",
    pipelineRunId: input.pipelineRunId || null,
    startedAt,
    kandidaten: rows.length,
    // REINE Funktion: baut die operative Projektion, sobald die Laufkennung
    // feststeht. Sie schreibt nichts — die Auditschicht uebergibt das Ergebnis
    // unveraendert an die EINE atomare Veroeffentlichung. Die fachlichen Felder
    // (id, user_id, knowledge_object_id, vorgang_id, similarity, rank,
    // matched_features, filters) werden dabei NICHT angefasst.
    buildRows: ({ runId, descriptor }) => {
      const jetzt = new Date().toISOString();
      return rows.map((r) => {
        const z = zusatz.get(r.knowledge_object_id) || {};
        return {
          ...r,
          run_id: runId,
          profil_hash: pHash,
          ko_eingabe_hash: z.ko_eingabe_hash || null,
          ko_version: z.ko_version != null ? z.ko_version : null,
          engine_version: contract.LEGACY_ENGINE_VERSION,
          rezept_version: recipeVersion,
          vektor_version: vectorVersion,
          eingabe_fingerabdruck: descriptor.fingerprint,
          berechnet_am: jetzt,
          signale: z.signale || {},
          begruendung: z.begruendung || null,
          updated_at: jetzt
        };
      });
    }
  });

  return {
    userId,
    candidates: rows.length,
    saved: auditErgebnis.veroeffentlicht,
    filters: filters || {},
    audit: {
      runId: auditErgebnis.runId,
      status: auditErgebnis.status,
      idempotent: auditErgebnis.idempotent,
      fingerprint: auditErgebnis.fingerprint,
      abgeloest: auditErgebnis.abgeloest,
      wiederholungen: auditErgebnis.wiederholungen
    }
  };
}

module.exports = {
  EMBEDDING_DIM,
  slug,
  normalizeCommittee,
  normalizeParty,
  slugCommittee,
  slugParty,
  committeeMatchKey,
  derivePolicyFields,
  POLICY_FIELD_LABELS,
  cosineSimilarity,
  profileFeatures,
  knowledgeObjectFeatures,
  embedProfile,
  embedKnowledgeObject,
  // Ehrlich benannte Aliase (Sprint 2 Nachschaerfung): Feature-/Merkmalsvektor, KEIN
  // semantisches Embedding. Neuer Code sollte diese Namen verwenden.
  computeFeatureVectorForKnowledgeObject,
  computeFeatureVectorForProfile,
  profileHash,
  passesFilters,
  matchedFeatures,
  matchProfileToKnowledgeObjects,
  runMatchingShadow,
  defaultDeps
};
