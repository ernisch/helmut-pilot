"use strict";

// focusTopics ist die aktive Auswahl, auch bei Gewicht 1 oder leerer Liste.
// Nur alte Profile ohne Themenliste fallen auf ihre bisherigen Gewichte >=3
// zurueck. Verwaiste Reglerschluessel aktivieren kein abgewähltes Thema.
const list = value => (Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,]/) : [])
  .map(v => typeof v === "string" ? v.trim() : "").filter(Boolean);
const key = value => String(value || "").toLowerCase().normalize("NFKC")
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
function activeTopics(profile = {}) {
  let topics;
  for (const field of ["focusTopics", "fachpolitische_schwerpunkte", "topics", "themen"]) {
    if (Array.isArray(profile[field]) || typeof profile[field] === "string") { topics = list(profile[field]); break; }
  }
  if (!topics) topics = Object.entries(profile.topicPriorities || {})
    .filter(([, value]) => Number(value) >= 3).map(([topic]) => topic);
  const seen = new Set();
  return topics.filter(topic => { const k = key(topic); if (!k || seen.has(k)) return false; seen.add(k); return true; });
}
function priority(profile, topic) {
  const wanted = key(topic);
  if (!activeTopics(profile).some(t => key(t) === wanted)) return 1;
  const entry = Object.entries(profile.topicPriorities || {}).find(([t]) => key(t) === wanted);
  const value = Number(entry?.[1]);
  return Number.isFinite(value) && value >= 1 ? Math.max(1, Math.min(5, value)) : 1;
}
function activePriorities(profile = {}) {
  return Object.fromEntries(activeTopics(profile).map(topic => [topic, priority(profile, topic)]));
}
function matchedPriority(profile = {}, topics = []) {
  const matches = new Set(list(topics).map(key));
  return Math.max(1, ...activeTopics(profile).filter(topic => matches.has(key(topic))).map(topic => priority(profile, topic)));
}
// Normal bleibt neutral. Alle bisherigen Zwischenwerte 1..5 werden unterstuetzt.
const multiplier = value => 1 + (Math.max(1, Math.min(5, Number(value) || 1)) - 1) / 4;
module.exports = { activeTopics, activePriorities, priority, matchedPriority, multiplier };
