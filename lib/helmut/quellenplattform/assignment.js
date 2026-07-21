"use strict";

// Helmut — Quellenplattform (Konsolidierung) · EINE dynamische Zuweisungsmaschine (Aufgabe 3).
//
// Reine, deterministische Logik. KEINE KI, kein Netz, kein Storage. Dies ist die EINE verbindliche
// Zuweisung. Sie vereint:
//   - die MANDATSWAHRHEIT aus Sprint 1 (mandate-register.resolveMandate) als EINZIGE
//     Profil->Anforderungs-Ableitung — es gibt KEINE zweite deriveRequirement daneben.
//   - die QUELLENWAHRHEIT aus Sprint 3 (Master-Katalog-Records / runtime-source).
//   - die kriterienbasierte, gewichtete, NACHVOLLZIEHBARE Auswahl aus Sprint 2
//     (Match-Dimensionen + Score + Gruende).
//
// Ergebnis ist NIE ein dauerhaft gespeichertes Paket, sondern die Laufzeit-Auswahl fuer EIN
// Mandat zu EINEM Zeitpunkt. Eine globale Quelle wird nur REFERENZIERT, nie pro Mandant kopiert.

const mandateRegister = require("../mandate-register");
const { slug, normalizeParty, normalizeCommittee } = require("../matching");
const masterModel = require("../quellenarchitektur/master/model");
const taxonomy = require("../quellenarchitektur/master/taxonomy");

// Match-Dimensionen + Gewichte (uebernommen aus S2 assignment.js — spezifischer = schwerer).
const MATCH_DIMENSIONS = Object.freeze([
  { key: "factions", weight: 5 },      // eigene Fraktion: sehr direkt
  { key: "parties", weight: 4 },       // eigene Partei
  { key: "policyFields", weight: 3 },  // Ausschuss / Politikfeld / Thema
  { key: "ministries", weight: 3 },    // fachlich zustaendige Ministerien
  { key: "regions", weight: 2 }        // Wahlkreis / Bundesland
]);
const DIMENSION_WEIGHTS = MATCH_DIMENSIONS.reduce((o, d) => { o[d.key] = d.weight; return o; }, {});
const UNIVERSAL_WEIGHT = 3;

function uniq(list) { return [...new Set((list || []).filter((x) => x != null && String(x).trim() !== ""))]; }
// Token-Menge fuer robustes Matchen ueber verschiedene ID-Raeume (Registry-Keys vs. Katalog-IDs):
// jeder Wert wird sowohl roh als auch geslugt aufgenommen.
function tokenSet(values) {
  const s = new Set();
  for (const v of uniq(values)) { s.add(String(v)); s.add(slug(v)); }
  s.delete(""); return s;
}
function overlapTokens(haveValues, wantSet) {
  const hits = [];
  for (const v of uniq(haveValues)) {
    if (wantSet.has(String(v)) || wantSet.has(slug(v))) hits.push(String(v));
  }
  return hits;
}

// --- Mandatsregister (Sprint 1) -> Anforderungsprofil ---------------------------------------
// EINZIGE Profil->Anforderungs-Ableitung. Baut NICHT selbst aus dem Rohprofil, sondern aus dem
// bereits aufgeloesten Mandat (resolveMandate) — Partei/Fraktion/Ausschuesse/Themen/Regionen
// kommen ausschliesslich aus der Sprint-1-Wahrheit.
function buildRequirement(profileOrMandate = {}, opts = {}) {
  const mandate = isResolvedMandate(profileOrMandate)
    ? profileOrMandate
    : mandateRegister.resolveMandate(profileOrMandate, opts);
  const profile = opts.profile || (isResolvedMandate(profileOrMandate) ? {} : profileOrMandate);

  const level = parliamentToLevel(mandate.parliamentType);

  // Partei/Fraktion: Registry-Key UND Entity-ID (Katalog referenziert Entities per ID).
  const parties = uniq([mandate.party && mandate.party.key, mandate.party && mandate.party.entity_id]);
  const factions = uniq([mandate.fraction && mandate.fraction.key, mandate.fraction && mandate.fraction.entity_id]);

  // Ausschuesse (Keys) + daraus/aus Themen abgeleitete Politikfelder (Bruecke Ausschuss<->Thema).
  const committees = uniq((mandate.committees || []).map((c) => c.key));
  const themes = mandate.themes || {};
  const policyFields = uniq([
    ...committees,
    ...(themes.policyFields || []).map(slug),
    ...(themes.themeTerms || []).map(slug),
    ...(themes.explicitTopics || []).map(slug)
  ]);
  const ministries = uniq([
    ...(themes.ministries || []).map(slug),
    ...(themes.ministryEntities || [])
  ]);

  // Regionen: aus dem Mandat/Profil (Bundesland/Wahlkreis/Geografie). S1 loest Region nur zur
  // Disambiguierung intern auf; die Regionsableitung hier ist eine reine Feld-Normalisierung
  // (KEINE zweite Mandatsableitung — Partei/Ausschuss/Thema stammen komplett aus S1).
  const regions = uniq([
    slug(profile.bundesland || profile.state),
    slug(profile.constituency || profile.wahlkreis),
    ...toArr(profile.regionale_interessen).map(slug),
    ...toArr(profile.geographyIds)
  ]);

  const usable = opts.usable != null ? !!opts.usable
    : (mandate.versorgungsstatus ? mandate.versorgungsstatus.registerReady !== false && mandate.validation && mandate.validation.usable !== false : true);

  return {
    mandateId: mandate.profileId || null,
    level, parties, factions, committees, policyFields, ministries, regions,
    coverageStatus: mandate.coverageStatus || null,
    usable,
    // vorberechnete Token-Mengen fuer schnelles, robustes Matchen
    _want: {
      parties: tokenSet(parties), factions: tokenSet(factions),
      policyFields: tokenSet(policyFields), ministries: tokenSet(ministries), regions: tokenSet(regions)
    }
  };
}

function isResolvedMandate(x) { return x && typeof x === "object" && (x.identity || x.coverageStatus || x.versorgungsstatus); }
function parliamentToLevel(t) { if (t === "Landtag") return "land"; if (t === "Bundestag") return "bund"; return "bund"; }
function toArr(v) { return Array.isArray(v) ? v : (v == null || v === "" ? [] : [v]); }

// --- Quellseitige Merkmale je Dimension (aus dem kanonischen Record/Laufzeitobjekt) ---------
function sourceDimensionValues(src) {
  return {
    parties: [src.party_id],
    factions: [src.group_id],
    policyFields: [...(src.topics || []), ...(src.committee_ids || []), ...(src.policy_fields || [])],
    ministries: [src.institution_id, ...(src.topics || [])],
    regions: src.region_ids || []
  };
}

// Universale Grundversorgung: bundesweit, ohne Partei-/Fraktions-/Ausschuss-/Regionsbindung, amtlich.
// DATENGETRIEBEN (kein hartkodierter Sonderfall): gilt fuer JEDES Mandat.
function isUniversalSource(src) {
  const broad = ["bund", "eu", "international"].includes(src.political_level);
  const unbound = !src.party_id && !src.group_id && (src.committee_ids || []).length === 0 && (src.region_ids || []).length === 0;
  const t = taxonomy.getSourceType(src.source_type) || {};
  // Grundversorgung fuer JEDES Mandat: bundesweit, ungebunden, KEIN Suchanbieter und KEINE
  // Positionsquelle (Partei/Fraktion/Verband). Amtliche Fakten, Daten UND ueberregionaler
  // Journalismus zaehlen zur neutralen Grundversorgung.
  return broad && unbound && !masterModel.isSearchProviderSource(src) && t.content_stance !== "position";
}

// Kandidat abruf-/nutzungsfaehig? Harte Ausschluesse (blockiert/untersagt/unzulaessig/gesperrt).
function isEligible(src) {
  if (src.trust === "blockiert") return false;
  if (src.license_status === "untersagt") return false;
  if (src.privacy_status === "unzulaessig") return false;
  if (["quarantined", "archived", "superseded"].includes(src.review_status)) return false;
  return true;
}

function tierPriority(src) {
  const t = taxonomy.getSourceType(src.source_type);
  const tier = t && t.acquisition_tier ? t.acquisition_tier : 5; // 1 = hoechste
  return (6 - tier) * 20; // 0..100
}

// --- Kern: Quelle x Anforderung -> Relevanzurteil (nachvollziehbar) --------------------------
function scoreSource(src, requirement) {
  const reasons = [];
  let score = 0;
  const want = requirement._want || {};

  if (isUniversalSource(src)) { reasons.push({ dimension: "universal", weight: UNIVERSAL_WEIGHT }); score += UNIVERSAL_WEIGHT; }

  const have = sourceDimensionValues(src);
  for (const dim of MATCH_DIMENSIONS) {
    const wantSet = want[dim.key];
    if (!wantSet || !wantSet.size) continue;
    const matched = overlapTokens(have[dim.key], wantSet);
    if (matched.length) { score += dim.weight * matched.length; reasons.push({ dimension: dim.key, matched: uniq(matched), weight: dim.weight }); }
  }

  // Regionale/kommunale Quelle OHNE Regionstreffer ist NICHT relevant (verhindert Fremdregion-Zuweisung).
  const isRegionalSource = ["land", "kommune", "bezirk", "kreis"].includes(src.political_level) && (src.region_ids || []).length > 0;
  if (isRegionalSource && !reasons.some((r) => r.dimension === "regions")) return { relevant: false, score: 0, reasons: [] };

  const relevant = score > 0;
  const finalScore = relevant ? Math.round((score + tierPriority(src) / 100) * 100) / 100 : 0;
  return { relevant, score: finalScore, reasons };
}

// --- Zuweisung eines Mandats gegen einen Quellenbestand -------------------------------------
// sources: Array kanonischer Records/Laufzeitobjekte (global + optional private des Mandanten).
// Rueckgabe: { requirement, sources:[{...,score,reasons}], count, byDimensionCount, excluded:[...] }
function assignSources(sources, profileOrMandate, opts = {}) {
  const requirement = opts.requirement || buildRequirement(profileOrMandate, opts);
  if (opts.requireUsable && requirement.usable === false) {
    return { requirement, sources: [], excluded: [], count: 0, reason: "mandat-nicht-aktivierbar", byDimensionCount: {} };
  }
  const list = Array.isArray(sources) ? sources : [];
  const chosen = [];
  const excluded = [];
  const byDimensionCount = {};

  for (const src of list) {
    if (!isEligible(src)) { excluded.push({ id: src.id, reason: `nicht-abrufbar:${exclusionReason(src)}` }); continue; }
    const verdict = scoreSource(src, requirement);
    if (!verdict.relevant) { excluded.push({ id: src.id, reason: "keine-anforderungsueberschneidung" }); continue; }
    for (const r of verdict.reasons) byDimensionCount[r.dimension] = (byDimensionCount[r.dimension] || 0) + 1;
    chosen.push({
      id: src.id, publisher_id: src.publisher_id, source_type: src.source_type,
      visibility: src.visibility || (src.tenant_id ? "private" : "global"),
      trust: src.trust, review_status: src.review_status,
      is_search_provider: masterModel.isSearchProviderSource(src),
      score: verdict.score, reasons: verdict.reasons
    });
  }
  // Deterministisch: Score desc, dann id asc.
  chosen.sort((a, b) => (b.score - a.score) || String(a.id).localeCompare(String(b.id)));
  return { requirement, sources: chosen, excluded, count: chosen.length, byDimensionCount };
}

function exclusionReason(src) {
  if (src.trust === "blockiert") return "blockiert";
  if (src.license_status === "untersagt") return "lizenz-untersagt";
  if (src.privacy_status === "unzulaessig") return "datenschutz-unzulaessig";
  if (["quarantined", "archived", "superseded"].includes(src.review_status)) return src.review_status;
  return "unbekannt";
}

module.exports = {
  MATCH_DIMENSIONS, DIMENSION_WEIGHTS, UNIVERSAL_WEIGHT,
  buildRequirement, scoreSource, assignSources,
  isUniversalSource, isEligible, sourceDimensionValues
};
