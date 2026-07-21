"use strict";

// Helmut — Master Quellenkatalog · Sprint 3 · Mandatsbezogene Zuweisung (Belang 4).
//
// Reine, DATENGETRIEBENE Zuweisungslogik. Ein Paket beschreibt ueber `criteria` (reine Daten),
// welche Quellen es aufnimmt. assignSourceToPackages prueft eine Quelle gegen diese Kriterien —
// OHNE eine einzige Partei/Ausschuss/Region im Code. Eine neue Partei, ein neuer Ausschuss oder
// ein neues Bundesland entsteht durch HINZUFUEGEN eines Kriteriums bzw. einer Entitaet, nie durch
// Code-Aenderung (Abnahme §7/§8, Tests §23/§24/§25).
//
// Kriterien-Dimensionen (alle optional; ODER innerhalb einer Dimension, UND ueber Dimensionen):
//   source_types[], political_levels[], party_ids[], group_ids[], committee_ids[],
//   institution_ids[], topics[], region_ids[], official_only(bool), search_provider_ok(bool).
// Zusatz: is_base markiert Pflicht-Basispakete; matchAll:true fordert Treffer in ALLEN gesetzten
// Dimensionen (Default), matchAny:true genuegt EIN Dimensionstreffer.

const taxonomy = require("./taxonomy");
const model = require("./model");

function arr(v) { return Array.isArray(v) ? v : (v == null ? [] : [v]); }
function intersects(a, b) {
  const sb = new Set(arr(b).map(String));
  return arr(a).some((x) => sb.has(String(x)));
}
function normTopic(s) {
  return String(s == null ? "" : s).toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}
function topicIntersects(sourceTopics, criteriaTopics) {
  const set = new Set(arr(criteriaTopics).map(normTopic).filter(Boolean));
  if (!set.size) return false;
  return arr(sourceTopics).some((t) => {
    const n = normTopic(t);
    if (!n) return false;
    for (const c of set) if (n === c || n.includes(c) || c.includes(n)) return true;
    return false;
  });
}

// Prueft, ob eine Quelle die Kriterien EINES Pakets erfuellt. Liefert {match, matchedDimensions}.
function matchesCriteria(record = {}, criteria = {}) {
  const dims = [];
  const c = criteria || {};

  // Suchanbieter duerfen ein Paket NUR versorgen, wenn es das ausdruecklich erlaubt
  // (search_provider_ok) — nie als stille Grundversorgung (Abnahme §9). Robuste Erkennung
  // ueber model.isSearchProviderSource (deckt Google-News-via-RSS + Aggregator-Herausgeber ab).
  const isSearch = model.isSearchProviderSource(record);
  if (isSearch && !c.search_provider_ok) return { match: false, matchedDimensions: [], blockedBySearchRule: true };

  let considered = 0;
  const hit = (name, cond) => { considered += 1; if (cond) dims.push(name); return cond; };

  if (arr(c.source_types).length) hit("source_type", arr(c.source_types).map(String).includes(String(record.source_type)));
  if (arr(c.political_levels).length) hit("political_level", arr(c.political_levels).map(String).includes(String(record.political_level)));
  if (arr(c.party_ids).length) hit("party_id", arr(c.party_ids).map(String).includes(String(record.party_id)));
  if (arr(c.group_ids).length) hit("group_id", arr(c.group_ids).map(String).includes(String(record.group_id)));
  if (arr(c.committee_ids).length) hit("committee_ids", intersects(record.committee_ids, c.committee_ids));
  if (arr(c.institution_ids).length) hit("institution_id", arr(c.institution_ids).map(String).includes(String(record.institution_id)));
  if (arr(c.region_ids).length) hit("region_ids", intersects(record.region_ids, c.region_ids));
  if (arr(c.topics).length) hit("topics", topicIntersects(record.topics, c.topics));
  if (c.official_only === true) hit("official_only", !!(taxonomy.getSourceType(record.source_type) && taxonomy.getSourceType(record.source_type).is_official));

  if (considered === 0) return { match: false, matchedDimensions: [] };
  const match = c.matchAny ? dims.length > 0 : dims.length === considered;
  return { match, matchedDimensions: dims };
}

// Alle Paket-Keys, in die eine Quelle datengetrieben gehoert.
function assignSourceToPackages(record = {}, packages = []) {
  const keys = [];
  for (const pkg of Array.isArray(packages) ? packages : []) {
    if (!pkg || !pkg.criteria) continue;
    const r = matchesCriteria(record, pkg.criteria);
    if (r.match) keys.push(pkg.key);
  }
  return [...new Set(keys)];
}

// Baut die vollstaendige Zuweisungssicht: je Paket die Menge zugewiesener Quellen-IDs.
function buildAssignments(records = [], packages = []) {
  const byPackage = new Map();
  for (const pkg of packages) byPackage.set(pkg.key, new Set());
  for (const rec of records) {
    for (const key of assignSourceToPackages(rec, packages)) {
      if (!byPackage.has(key)) byPackage.set(key, new Set());
      byPackage.get(key).add(rec.id);
    }
  }
  const out = {};
  for (const [key, set] of byPackage.entries()) out[key] = [...set];
  return out;
}

module.exports = { matchesCriteria, assignSourceToPackages, buildAssignments, topicIntersects };
