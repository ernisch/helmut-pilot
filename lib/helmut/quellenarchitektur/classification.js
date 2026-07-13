"use strict";

// Helmut — Neue Quellenarchitektur · Knowledge-Object-Klassifikation (Sprint 2).
//
// Reine, deterministische Logik (KEINE KI, kein Netz, kein Storage). Erzeugt die
// strukturierten Klassifikationsfelder eines Vorgangs:
//   decision_level / related_levels  (politische Entscheidungsebene, Auftrag §11)
//   affected_geographies / mentioned_geographies  (Geografie, aufgeloest gegen Seed)
//   decision_entities / related_entities  (typisierte Entitaeten, aufgeloest gegen Seed)
//   event_type  (Ereignistyp)  ·  classification_confidence  (dimensioniert)
//
// ZWECK: das Kernproblem "political_level bei allen 231 KOs leer" strukturell beheben.
// Die KI liefert diese Felder (wenn moeglich); dieser Deriver fuellt Luecken deterministisch
// aus den bereits belegten Feldern (Ausschuesse/Ministerien/Erwaehnungen) und garantiert so
// NIE-leere, konsistente Werte. Fuer Alt-KOs (Backfill) laeuft er ganz ohne KI (kostenneutral).
//
// Aufloesung von Namen -> kanonische IDs erfolgt gegen die Sprint-1-Seeds (Geografie/Entitaet).
// Unaufloesbare Namen bleiben mit entity_id/geography_id = null erhalten (kein erfundener Treffer).

const { GEOGRAPHIES } = require("./seeds/geographies");
const { POLITICAL_ENTITIES } = require("./seeds/entities");
const { normalizeParty, normalizeCommittee } = require("../matching");

const LEVELS = ["international", "eu", "bund", "land", "kommune"];
const CONF = ["low", "medium", "high", "unknown"];

const EVENT_TYPES = [
  "gesetzentwurf", "verordnung", "antrag", "anfrage", "anhoerung", "abstimmung",
  "kabinettsbeschluss", "urteil", "bericht", "personalie", "protest", "sonstiges", "unknown"
];

// --- Normalisierung ---------------------------------------------------------
function normText(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

// --- Geografie-Index (Name -> {id, level}) ----------------------------------
const GEO_BY_NAME = (() => {
  const idx = new Map();
  for (const g of GEOGRAPHIES) {
    idx.set(normText(g.name), { id: g.id, level: g.level, name: g.name });
  }
  // "Deutschland" / "Bund" -> geo-bund
  idx.set("deutschland", { id: "geo-bund", level: "bund", name: "Deutschland" });
  idx.set("bund", { id: "geo-bund", level: "bund", name: "Deutschland" });
  return idx;
})();

// --- Entitaets-Index --------------------------------------------------------
// (a) exakter Name/Alias-Match  (b) canonical_key je Typ (Partei/Ausschuss).
const ENTITY_BY_NAME = new Map();
const ENTITY_BY_KEY = new Map(); // `${type}:${canonical_key}` -> entity
for (const ent of POLITICAL_ENTITIES) {
  ENTITY_BY_NAME.set(normText(ent.name), ent);
  for (const al of ent.aliases || []) ENTITY_BY_NAME.set(normText(al), ent);
  if (ent.canonical_key) ENTITY_BY_KEY.set(`${ent.entity_type}:${ent.canonical_key}`, ent);
}

// --- EU / Land / Bund - Signale --------------------------------------------
const EU_TERMS = ["eu", "europaeische union", "europaeische kommission", "eu kommission", "europaeisches parlament", "bruessel", "europarat"];
const LAND_INSTITUTION_TERMS = ["landtag", "abgeordnetenhaus", "senat", "landesregierung", "staatskanzlei", "senatskanzlei", "senatsverwaltung", "landesministerium"];
const BUND_INSTITUTION_TERMS = ["bundestag", "bundesregierung", "bundesrat", "bundeskabinett", "bundesministerium", "bundeskanzler"];

const BUNDESLAND_NAMES = new Set(
  GEOGRAPHIES.filter((g) => g.level === "land").map((g) => normText(g.name))
);

// Wortgrenzen-sicher: kurze Einzelwort-Terme ("eu") duerfen NICHT als Substring
// matchen (sonst "eu" in "deutschland"). Mehrwort-Terme bleiben Substring-Match.
function hasTerm(haystack, term) {
  if (!term) return false;
  if (term.includes(" ")) return haystack.includes(term);
  return new RegExp(`(^| )${term}( |$)`).test(haystack);
}
function anyTermIn(haystack, terms) {
  return terms.some((t) => hasTerm(haystack, t));
}

// Kollisionsfreier Ausschuss-Schluessel: normalizeCommittee liefert fuer
// "Menschenrechte …" faelschlich "recht" (Kollision mit dem Rechtsausschuss).
function committeeKey(name) {
  const n = normText(name);
  if (n.includes("menschenrecht")) return "menschenrechte";
  return normalizeCommittee(name);
}

// --- Geografie aufloesen ----------------------------------------------------
function resolveGeography(name) {
  const key = normText(name);
  if (!key) return null;
  const hit = GEO_BY_NAME.get(key);
  if (hit) return { name: hit.name, level: hit.level, geography_id: hit.id };
  return { name: String(name).slice(0, 120), level: "unknown", geography_id: null };
}

function resolveGeographies(names) {
  const out = [];
  const seen = new Set();
  for (const n of Array.isArray(names) ? names : []) {
    const r = resolveGeography(n);
    if (!r) continue;
    const k = r.geography_id || normText(r.name);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

// --- Entitaet aufloesen -----------------------------------------------------
// typeHint: 'party' | 'committee' | 'ministry' | 'person' | 'organization' | null
function resolveEntity(name, typeHint) {
  const raw = String(name || "").trim();
  if (!raw) return null;
  const nName = normText(raw);
  // 1) exakter Name/Alias
  const byName = ENTITY_BY_NAME.get(nName);
  if (byName) return { name: byName.name, type: byName.entity_type, entity_id: byName.id, confidence: "high" };
  // 2) typ-spezifischer canonical_key
  if (typeHint === "party") {
    const ent = ENTITY_BY_KEY.get(`party:${normalizeParty(raw)}`);
    if (ent) return { name: ent.name, type: ent.entity_type, entity_id: ent.id, confidence: "medium" };
  }
  if (typeHint === "committee") {
    const ent = ENTITY_BY_KEY.get(`committee:${committeeKey(raw)}`);
    if (ent) return { name: ent.name, type: ent.entity_type, entity_id: ent.id, confidence: "medium" };
  }
  // 3) unaufloesbar -> ehrlich mit null-ID erhalten
  return { name: raw.slice(0, 120), type: typeHint || "unknown", entity_id: null, confidence: "low" };
}

function resolveEntities(names, typeHint) {
  const out = [];
  const seen = new Set();
  for (const n of Array.isArray(names) ? names : []) {
    const r = resolveEntity(n, typeHint);
    if (!r) continue;
    const k = r.entity_id || `${r.type}:${normText(r.name)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

// --- Entscheidungsebene deterministisch ableiten ----------------------------
function koHaystack(ko = {}) {
  return normText([
    ...(ko.ausschuesse || []), ...(ko.ministerien || []), ...(ko.parteien || []),
    ...(ko.mentioned_committees || []), ...(ko.mentioned_ministries || []),
    ...(ko.mentioned_organizations || []), ...(ko.mentioned_locations || []),
    ko.headline, ko.was_ist_passiert, ko.warum_wichtig, ko.instrument, ko.stage
  ].filter(Boolean).join(" "));
}

// Liefert { level, confidence, signal }. Konservativ: klare EU/Land-Signale zuerst,
// sonst Bund (der aktuelle Bestand ist bundespolitisch), Konfidenz markiert die Sicherheit.
function deriveDecisionLevel(ko = {}) {
  const hay = koHaystack(ko);
  const hasCommittee = (ko.ausschuesse || []).length > 0 || (ko.mentioned_committees || []).length > 0;
  const hasBundInst = anyTermIn(hay, BUND_INSTITUTION_TERMS) || hasCommittee;
  const hasLandInst = anyTermIn(hay, LAND_INSTITUTION_TERMS);
  const mentionsLand = [...BUNDESLAND_NAMES].some((l) => hay.includes(l));
  const hasEu = anyTermIn(hay, EU_TERMS);

  // EU nur, wenn EU-Institution/Begriff UND keine klare Bundes-Gesetzgebung dominiert.
  if (hasEu && !hasBundInst) return { level: "eu", confidence: "medium", signal: "eu-institution" };
  // Land nur, wenn eine LANDES-Institution genannt ist (nicht bloss ein Bundesland-Ort).
  if (hasLandInst && mentionsLand) return { level: "land", confidence: "medium", signal: "landes-institution" };
  if (hasLandInst) return { level: "land", confidence: "low", signal: "landes-institution-ohne-ort" };
  if (hasBundInst) return { level: "bund", confidence: "high", signal: "bundes-institution" };
  if (hasEu) return { level: "eu", confidence: "low", signal: "eu-begriff" };
  // Default: der kuratierte Bestand ist bundespolitisch -> bund, aber niedrige Konfidenz.
  return { level: "bund", confidence: "low", signal: "default" };
}

function deriveRelatedLevels(ko = {}, decisionLevel) {
  const hay = koHaystack(ko);
  const out = new Set();
  const mentionsLand = [...BUNDESLAND_NAMES].some((l) => hay.includes(l));
  if (anyTermIn(hay, EU_TERMS) && decisionLevel !== "eu") out.add("eu");
  if (mentionsLand && decisionLevel !== "land") out.add("land");
  if (anyTermIn(hay, BUND_INSTITUTION_TERMS) && decisionLevel !== "bund") out.add("bund");
  return [...out];
}

// --- Ereignistyp ableiten ---------------------------------------------------
const EVENT_KEYWORDS = [
  ["gesetzentwurf", ["gesetzentwurf", "referentenentwurf", "gesetz beschlossen", "gesetzespaket"]],
  ["verordnung", ["verordnung", "rechtsverordnung"]],
  ["kabinettsbeschluss", ["kabinettsbeschluss", "bundeskabinett", "kabinett beschliesst"]],
  ["anhoerung", ["anhoerung", "sachverstaendige", "expertenanhoerung"]],
  ["anfrage", ["kleine anfrage", "grosse anfrage", "schriftliche anfrage"]],
  ["abstimmung", ["abstimmung", "namentliche abstimmung", "beschlossen im bundestag", "verabschiedet"]],
  ["antrag", ["antrag", "entschliessungsantrag"]],
  ["urteil", ["urteil", "gericht", "bundesverfassungsgericht", "verfassungsgericht"]],
  ["personalie", ["ernennung", "ruecktritt", "nachfolge", "personalie", "berufen"]],
  ["protest", ["protest", "demonstration", "streik", "warnstreik"]],
  ["bericht", ["bericht", "studie", "gutachten", "statistik", "jahresbericht"]]
];

function deriveEventType(ko = {}) {
  const hay = koHaystack(ko);
  for (const [type, kws] of EVENT_KEYWORDS) {
    if (kws.some((k) => hay.includes(k))) return type;
  }
  return "unknown";
}

// --- Entitaeten trennen: Entscheider vs. Erwaehnte --------------------------
// decision_entities = handelnde Institutionen (Ausschuesse, Ministerien, Parlament/Regierung).
// related_entities  = erwaehnte Akteure (Parteien, Personen, Organisationen).
function buildDecisionEntities(ko = {}) {
  const out = [];
  out.push(...resolveEntities(ko.ausschuesse, "committee"));
  out.push(...resolveEntities(ko.ministerien, "ministry"));
  out.push(...resolveEntities(ko.mentioned_committees, "committee"));
  out.push(...resolveEntities(ko.mentioned_ministries, "ministry"));
  return dedupeEntities(out);
}

function buildRelatedEntities(ko = {}) {
  const out = [];
  out.push(...resolveEntities(ko.parteien, "party"));
  out.push(...resolveEntities(ko.mentioned_parties, "party"));
  out.push(...resolveEntities(ko.mentioned_organizations, "organization"));
  return dedupeEntities(out);
}

function dedupeEntities(list) {
  const seen = new Set();
  const out = [];
  for (const e of list) {
    const k = e.entity_id || `${e.type}:${normText(e.name)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

// --- Hauptfunktion: vollstaendige Klassifikation ----------------------------
// ai: optionale KI-gelieferte Werte (aus dem Understanding-Call). Der Deriver hat
// Vorrang bei Luecken/Unsicherheit; gueltige KI-Werte werden bevorzugt uebernommen.
function classifyKnowledgeObject(ko = {}, ai = {}) {
  const aiLevel = LEVELS.includes(ai.decision_level) ? ai.decision_level : null;
  const derived = deriveDecisionLevel(ko);
  const decision_level = aiLevel || derived.level;
  const levelConf = aiLevel ? "high" : derived.confidence;

  const related_levels = uniqLevels([
    ...(Array.isArray(ai.related_levels) ? ai.related_levels.filter((l) => LEVELS.includes(l)) : []),
    ...deriveRelatedLevels(ko, decision_level)
  ]).filter((l) => l !== decision_level);

  const mentioned_geographies = resolveGeographies(ko.mentioned_locations);
  // affected: bei bund -> Deutschland; bei land -> das erkannte Bundesland (aus mentioned);
  // ergaenzt um explizit als betroffen erwaehnte Geografien.
  const affected_geographies = deriveAffectedGeographies(decision_level, mentioned_geographies);

  const decision_entities = buildDecisionEntities(ko);
  const related_entities = buildRelatedEntities(ko);

  const event_type = EVENT_TYPES.includes(ai.event_type) && ai.event_type !== "unknown"
    ? ai.event_type : deriveEventType(ko);

  const classification_confidence = {
    level: levelConf,
    geography: mentioned_geographies.length ? "medium" : "low",
    entities: decision_entities.length || related_entities.length ? "medium" : "low",
    event_type: event_type === "unknown" ? "low" : "medium"
  };

  return {
    decision_level,
    related_levels,
    affected_geographies,
    mentioned_geographies,
    decision_entities,
    related_entities,
    event_type,
    classification_confidence
  };
}

function deriveAffectedGeographies(level, mentionedGeos) {
  if (level === "bund") return [{ name: "Deutschland", level: "bund", geography_id: "geo-bund" }];
  if (level === "land") {
    const land = mentionedGeos.find((g) => g.level === "land");
    if (land) return [land];
    return [{ name: "Deutschland", level: "bund", geography_id: "geo-bund" }]; // ehrlicher Fallback
  }
  if (level === "eu") return [{ name: "Europäische Union", level: "eu", geography_id: null }];
  const land = mentionedGeos.find((g) => g.level === "land");
  return land ? [land] : [];
}

function uniqLevels(list) {
  return [...new Set(list)];
}

module.exports = {
  LEVELS, CONF, EVENT_TYPES,
  normText,
  resolveGeography, resolveGeographies,
  resolveEntity, resolveEntities,
  deriveDecisionLevel, deriveRelatedLevels, deriveEventType,
  buildDecisionEntities, buildRelatedEntities,
  classifyKnowledgeObject
};
