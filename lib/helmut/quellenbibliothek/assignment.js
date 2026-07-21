"use strict";

// Helmut — Universelle Quellenbibliothek · Automatische Quellenzuweisung (Auftrag §3).
//
// Reine, deterministische Logik. KEINE KI, kein Netz, kein Storage. Ersetzt die
// manuell gepflegten Quellenpakete + fest codierten Sonderfälle (LANDESPAKET_BY_BUNDESLAND,
// SOCIAL_TERMS, `=== "linke"`, `fraction-linke`) durch eine KRITERIENBASIERTE Zuweisung:
//
//   1. Aus dem Mandatsregister wird ein `MandateRequirement` gebildet (WAS braucht das
//      Mandat: Ebene, Parteien, Fraktionen, Ausschüsse, Themen, Regionen, Ministerien).
//   2. Jede Quelle der Registry wird gegen dieses Anforderungsprofil gematcht; die
//      Überschneidung ergibt einen nachvollziehbaren Relevanz-Score.
//   3. Universale Grundversorgung ist IMMER dabei; nicht abrufbare Quellen (Lizenz/
//      Status/blockiert) fallen hart raus.
//
// Ein "Paket" ist damit kein kuratiertes Objekt mehr, sondern das LAUFZEIT-ERGEBNIS
// dieser Funktion. 100 gleiche Mandate ergeben dieselbe Quellenmenge (global einmal).

const { parliamentTypeOf } = require("../config");
const { normalizeParty, normalizeCommittee } = require("../matching");
const { slug } = require("./descriptor");

// Bundesland -> Geografie-/Regions-Keys. KEINE Paket-Zuordnung mehr, nur die
// generische Ableitung "welche Region betrifft dieses Land" (skaliert auf alle 16 Länder).
function normLand(v) { return slug(v); }

function asList(...vals) {
  const out = [];
  for (const v of vals) {
    if (Array.isArray(v)) out.push(...v);
    else if (v != null && String(v).trim()) out.push(v);
  }
  return out;
}

// Ebene des Mandats aus dem Register ableiten (bund/land). parliamentTypeOf ist die
// zentrale, bereits erprobte Quelle dieser Wahrheit — kein Parallelmodell.
function levelOfMandate(profile = {}) {
  const t = parliamentTypeOf(profile);
  if (t === "Landtag") return "land";
  if (t === "Bundestag") return "bund";
  // Explizite Ebene ohne Parlamentszuordnung (z. B. Kommune) tolerant lesen.
  const raw = slug(profile.level || profile.politicalLevel || profile.politische_ebene);
  if (["international", "eu", "bund", "land", "bezirk", "kreis", "kommune"].includes(raw)) return raw;
  return "bund"; // sichere Grundannahme: bundesweite Grundversorgung
}

// --- Mandatsregister -> Anforderungsprofil ----------------------------------
// Rein aus Mandatsdaten. Kennt KEINE Quelle, KEIN Paket, KEINEN Herausgeber.
function deriveRequirement(profile = {}, opts = {}) {
  if (!profile || typeof profile !== "object") profile = {};
  const level = levelOfMandate(profile);
  const parties = uniq(asList(profile.partei, profile.party).map(normalizeParty));
  const factions = uniq(asList(profile.fraktion, profile.faction).map(normalizeParty));
  const committees = uniq(asList(
    profile.ausschuesse, profile.committees, profile.committee, profile.stellvertretende_ausschuesse
  ).map(normalizeCommittee));
  const topics = uniq(asList(
    profile.fachpolitische_schwerpunkte, profile.berichterstatter_themen, profile.focusTopics,
    profile.reportingTopics, profile.themen, profile.regionale_themen
  ).map(slug));
  const regions = uniq(asList(
    profile.regionale_interessen, profile.regionale_themen, profile.constituency,
    profile.wahlkreis, profile.location, profile.bundesland, profile.state
  ).map(slug));
  const ministries = uniq(asList(profile.ministerien, profile.ministries).map(slug));
  const geographyIds = uniq(asList(profile.geographyIds, profile.geographyId).map((g) => String(g).trim()));

  // Bundesland als Region ergänzen (für Landtagsmandate der zentrale regionale Anker).
  const land = normLand(profile.bundesland || profile.state);
  if (land && !regions.includes(land)) regions.push(land);

  // Politikfeld = Ausschuss ∪ Thema (semantische Brücke): die Mitgliedschaft in einem
  // Ausschuss IST ein Politikfeld-Interesse. So matcht eine Fachquelle mit topic
  // "arbeit-und-soziales" ein Mandat, das den AUSSCHUSS "Arbeit und Soziales" trägt —
  // ohne fest codierte Themenwortliste (das war die alte SOCIAL_TERMS-Schuld).
  const policyFields = uniq([...committees, ...topics]);

  const usable = opts.usable != null ? !!opts.usable : true;
  return {
    mandateId: String(profile.id || profile.user_id || profile.politicianId || "").trim() || null,
    level, parties, factions, committees, topics, policyFields, regions, ministries, geographyIds, usable
  };
}

function uniq(list) { return [...new Set((list || []).filter(Boolean))]; }

// --- Match-Dimensionen + Gewichtung -----------------------------------------
// Nachvollziehbar + zentral definiert. Jede Dimension bindet ein Anforderungsfeld
// (`want`) an eine oder mehrere Quell-Felder (`have`). `policyFields` überbrückt
// Ausschuss<->Thema (siehe deriveRequirement) und liest quellenseitig committees∪topics.
// Spezifischere Dimensionen wiegen schwerer, damit direkt zuständige Quellen oben stehen.
const MATCH_DIMENSIONS = [
  { key: "factions", weight: 5, want: "factions", have: ["factions"] },        // eigene Fraktion: sehr direkt
  { key: "parties", weight: 4, want: "parties", have: ["parties"] },           // eigene Partei
  { key: "policyFields", weight: 3, want: "policyFields", have: ["committees", "topics"] }, // Ausschuss/Thema
  { key: "ministries", weight: 3, want: "ministries", have: ["ministries"] },  // fachlich zuständige Ministerien
  { key: "regions", weight: 2, want: "regions", have: ["regions"] }            // Wahlkreis/Bundesland
];

// Rückwärtskompatibler Blick auf die reinen Gewichte (Tests/Doku).
const DIMENSION_WEIGHTS = MATCH_DIMENSIONS.reduce((o, d) => { o[d.key] = d.weight; return o; }, {});

// --- Kern: Quelle x Anforderung -> Relevanzurteil ---------------------------
// Liefert { relevant, score, reasons } — reasons machen die Zuweisung nachvollziehbar.
function scoreSource(descriptor, requirement) {
  const reasons = [];
  let score = 0;

  // Universale Grundversorgung: immer relevant, feste Basiswertung.
  if (descriptor.universal) {
    reasons.push({ dimension: "universal", weight: 3 });
    score += 3;
  }

  // Dimensionale Überschneidung.
  for (const dim of MATCH_DIMENSIONS) {
    const want = requirement[dim.want] || [];
    if (!want.length) continue;
    const have = uniq(dim.have.flatMap((f) => descriptor[f] || []));
    if (!have.length) continue;
    const overlap = have.filter((v) => want.includes(v));
    if (overlap.length) {
      score += dim.weight * overlap.length;
      reasons.push({ dimension: dim.key, matched: overlap, weight: dim.weight });
    }
  }

  // Regionale/kommunale Quelle OHNE Regionsüberschneidung ist NICHT relevant
  // (verhindert, dass ein niedersächsisches Regionalmedium einem bayerischen Mandat
  // zugewiesen wird — ganz ohne hartkodierte Länderliste).
  const regionalNonMatch = (descriptor.level === "land" || descriptor.level === "kommune" ||
    descriptor.level === "bezirk" || descriptor.level === "kreis") &&
    (descriptor.regions || []).length > 0 &&
    !reasons.some((r) => r.dimension === "regions");
  if (regionalNonMatch) return { relevant: false, score: 0, reasons: [] };

  // Relevant, sobald es eine Überschneidung gibt. Die Ebene selbst ist KEIN
  // Ausschlusskriterium mehr: bundesweite Quellen versorgen jedes Mandat, und ein
  // direkter Dimensionstreffer (Region/Partei/Ausschuss/Ministerium) überstimmt die
  // Ebene (ein Bundestagsmandat mit Wahlkreis in Niedersachsen will die Regionalquelle).
  // Regionale Quellen ohne Regionstreffer sind oben bereits ausgeschlossen.
  const relevant = score > 0;
  // Priorität der Quelle als feiner Tie-Breaker (0..100 -> 0..1).
  const finalScore = relevant ? score + (Number(descriptor.priority) || 0) / 100 : 0;
  return { relevant, score: round2(finalScore), reasons };
}

function round2(x) { return Math.round(x * 100) / 100; }

// --- Zuweisung eines Mandats ------------------------------------------------
// Rückgabe: { requirement, sources:[{id,score,reasons,name,evidenceRole,trust}], count, byDimensionCount }
// requireUsable: unbrauchbare Mandate (unvollständig/deaktiviert) bekommen KEINE Zuweisung
// (konsistent mit der bestehenden Aktivierungsberechtigung).
function assignSources(registry, profile, opts = {}) {
  const requirement = opts.requirement || deriveRequirement(profile, opts);
  if (opts.requireUsable && requirement.usable === false) {
    return { requirement, sources: [], count: 0, reason: "mandat-nicht-aktivierbar", byDimensionCount: {} };
  }

  // Kandidatenmenge OHNE Vollscan: Vereinigung der dimensionalen Indextreffer + universale.
  // Je Match-Dimension werden alle Quell-Felder (`have`) im Registry-Index abgefragt.
  const candidateIds = new Set(registry.universalSources().map((d) => d.id));
  for (const dim of MATCH_DIMENSIONS) {
    for (const v of requirement[dim.want] || []) {
      for (const field of dim.have) {
        for (const id of registry.idsFor(field, v)) candidateIds.add(id);
      }
    }
  }

  const sources = [];
  const byDimensionCount = {};
  for (const id of candidateIds) {
    const d = registry.get(id);
    if (!d || !registry.isEligible(d)) continue;
    const verdict = scoreSource(d, requirement);
    if (!verdict.relevant) continue;
    for (const r of verdict.reasons) byDimensionCount[r.dimension] = (byDimensionCount[r.dimension] || 0) + 1;
    sources.push({
      id: d.id, name: d.name, publisher: d.publisher, evidenceRole: d.evidenceRole,
      trust: d.trust, method: d.access.method, score: verdict.score, reasons: verdict.reasons
    });
  }

  // Deterministische Reihenfolge: Score desc, dann id asc (stabil, testbar).
  sources.sort((a, b) => (b.score - a.score) || a.id.localeCompare(b.id));
  return { requirement, sources, count: sources.length, byDimensionCount };
}

// --- Globale Aktivierung (Referenzzählung ohne Paketebene) ------------------
// Aus N Mandaten die GLOBALE Menge zu crawlender Quellen ableiten. Jede Quelle
// erscheint genau EINMAL, mit der Menge der Mandate, die sie benötigen (refCount).
// Ersetzt computeGlobalActivation's Paket-Referenzzählung durch direkte Quellen-Refs.
function computeGlobalAssignment(registry, profiles = [], opts = {}) {
  const perMandate = [];
  const refs = new Map(); // sourceId -> Set(mandateId)
  let usableCount = 0;

  for (const profile of profiles) {
    const requirement = deriveRequirement(profile, opts);
    if (requirement.usable === false) { perMandate.push({ mandateId: requirement.mandateId, sources: [], skipped: "nicht-aktivierbar" }); continue; }
    usableCount += 1;
    const assignment = assignSources(registry, profile, { ...opts, requirement });
    const mid = requirement.mandateId || `anon-${perMandate.length}`;
    for (const s of assignment.sources) {
      if (!refs.has(s.id)) refs.set(s.id, new Set());
      refs.get(s.id).add(mid);
    }
    perMandate.push({ mandateId: mid, sources: assignment.sources.map((s) => s.id) });
  }

  // Universale Quellen laufen immer (always_on), auch ohne Mandat.
  for (const d of registry.universalSources()) {
    if (registry.isEligible(d) && !refs.has(d.id)) refs.set(d.id, new Set());
  }

  const activeSources = [...refs.entries()]
    .map(([id, set]) => ({ id, refCount: set.size, universal: !!(registry.get(id) && registry.get(id).universal) }))
    .filter((s) => s.refCount > 0 || s.universal)
    .sort((a, b) => (b.refCount - a.refCount) || a.id.localeCompare(b.id));

  return {
    mandateCount: profiles.length,
    usableMandateCount: usableCount,
    activeSourceCount: activeSources.length,
    activeSources,
    perMandate
  };
}

module.exports = {
  deriveRequirement,
  levelOfMandate,
  scoreSource,
  assignSources,
  computeGlobalAssignment,
  DIMENSION_WEIGHTS
};
