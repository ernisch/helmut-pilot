"use strict";

// Helmut — Master Quellenkatalog · Sprint 3 · Verbindliche Quellen-Taxonomie (Phase 2).
//
// Reine Daten + reine Nachschlagelogik. KEINE KI, kein Netz, kein Storage, KEINE Produkt-
// logik. Die Taxonomie ist DATENGETRIEBEN: eine neue Kategorie, Institution, Partei, Region
// oder politische Ebene entsteht durch HINZUFUEGEN einer Datenzeile — nie durch Code-Aenderung
// (Abnahmekriterium §7/§8 sowie Tests §23/§24/§25).
//
// Jede Kategorie traegt nur STRUKTURELLE Vor-Einstufungen (Belegfunktion, inhaltliche Haltung,
// amtlich ja/nein, primaerquellen-faehig, Beschaffungsprioritaet). Diese Defaults werden pro
// konkreter Quelle ueberschreibbar — die Taxonomie zwingt NIE eine Bewertung auf.
//
// Wichtig fuer politische Ausgewogenheit (Phase 9): content_stance trennt FAKT von POSITION.
// Eine Partei/Fraktion/ein Verband ist Primaerquelle fuer die EIGENE Position, aber niemals
// ein neutraler Faktenbeleg. Amtliche Statistik/Gerichte/Rechnungshoefe sind Faktenquellen.

const base = require("../model"); // Wiederverwendung statt Parallelmodell (Belegfunktion/Enums)

// --- Inhaltliche Haltung einer Quelle (Fakt vs. Position vs. Journalismus vs. Analyse) ------
// Verbindlich fuer die Gewichtung: Positionen duerfen NIE als neutrale Fakten gewertet werden.
const CONTENT_STANCES = Object.freeze(["fact", "position", "journalistic", "analysis"]);

// --- Belegfunktion ---------------------------------------------------------------------------
// Konsolidierung: die eine Wahrheit ist ../model.EVIDENCE_ROLES — bezogen statt redeklariert
// (der bisherige „konsistent mit"-Kommentar ist jetzt strukturell erzwungen). Doppelung entfernt.
const EVIDENCE_ROLES = Object.freeze([...base.EVIDENCE_ROLES]);

// --- Beschaffungs-Prioritaet (Phase 4): 1 = hoechste (amtliche strukturierte Primaerquelle) --
const ACQUISITION_TIERS = Object.freeze([1, 2, 3, 4, 5]);

// --- Grobe fachliche Gruppen (nur Anzeige/Aggregation, keine Logik) -------------------------
const TAXONOMY_GROUPS = Object.freeze([
  "parlament", "exekutive", "kontrolle_justiz", "parteipolitik",
  "interessenvertretung", "wissenschaft_analyse", "medien", "daten"
]);

// t(id, name, group, {evidence_role, content_stance, is_official, primary_capable, default_trust, tier})
function t(id, name, group, o = {}) {
  return {
    id,
    name,
    group,
    evidence_role: o.evidence_role,
    content_stance: o.content_stance,
    is_official: !!o.is_official,
    // primary_capable: kann diese Kategorie eine amtliche/originale Primaerquelle liefern?
    primary_capable: !!o.primary_capable,
    default_trust: o.default_trust || "unbekannt",
    // Standard-Beschaffungsprioritaet (Phase 4). Pro Quelle ueberschreibbar.
    acquisition_tier: o.tier
  };
}

// --- Die 26 verbindlichen Quellenkategorien (Auftrag Phase 2) -------------------------------
// Reihenfolge = die 26 Punkte des Auftrags. Jede ist ein reiner Datensatz.
const SOURCE_TYPES = [
  // 1) Parlament (Bundestag, Landtage als eigene Kategorie 12)
  t("parlament", "Parlament", "parlament",
    { evidence_role: "official_primary", content_stance: "fact", is_official: true, primary_capable: true, default_trust: "hoch", tier: 1 }),
  // 2) Bundesregierung
  t("bundesregierung", "Bundesregierung", "exekutive",
    { evidence_role: "official_primary", content_stance: "fact", is_official: true, primary_capable: true, default_trust: "hoch", tier: 1 }),
  // 3) Ministerien
  t("ministerium", "Ministerium", "exekutive",
    { evidence_role: "official_primary", content_stance: "fact", is_official: true, primary_capable: true, default_trust: "hoch", tier: 1 }),
  // 4) Behoerden
  t("behoerde", "Behörde", "exekutive",
    { evidence_role: "data_source", content_stance: "fact", is_official: true, primary_capable: true, default_trust: "hoch", tier: 1 }),
  // 5) Bundesrat
  t("bundesrat", "Bundesrat", "parlament",
    { evidence_role: "official_primary", content_stance: "fact", is_official: true, primary_capable: true, default_trust: "hoch", tier: 1 }),
  // 6) Parteien
  t("partei", "Partei", "parteipolitik",
    { evidence_role: "direct_interest", content_stance: "position", is_official: false, primary_capable: true, default_trust: "mittel", tier: 1 }),
  // 7) Fraktionen
  t("fraktion", "Fraktion", "parteipolitik",
    { evidence_role: "direct_interest", content_stance: "position", is_official: false, primary_capable: true, default_trust: "mittel", tier: 1 }),
  // 8) Ausschuesse
  t("ausschuss", "Ausschuss", "parlament",
    { evidence_role: "official_primary", content_stance: "fact", is_official: true, primary_capable: true, default_trust: "hoch", tier: 1 }),
  // 9) Abgeordnete
  t("abgeordnete", "Abgeordnete", "parteipolitik",
    { evidence_role: "direct_interest", content_stance: "position", is_official: false, primary_capable: true, default_trust: "mittel", tier: 3 }),
  // 10) Bundeslaender (Landesportal / Landesebene allgemein)
  t("bundesland", "Bundesland", "exekutive",
    { evidence_role: "official_primary", content_stance: "fact", is_official: true, primary_capable: true, default_trust: "hoch", tier: 1 }),
  // 11) Landesregierungen
  t("landesregierung", "Landesregierung", "exekutive",
    { evidence_role: "official_primary", content_stance: "fact", is_official: true, primary_capable: true, default_trust: "hoch", tier: 1 }),
  // 12) Landtage
  t("landtag", "Landtag", "parlament",
    { evidence_role: "official_primary", content_stance: "fact", is_official: true, primary_capable: true, default_trust: "hoch", tier: 1 }),
  // 13) Wahlkreise (Wahlkreis-bezogene amtliche/kommunale Quellen)
  t("wahlkreis", "Wahlkreis", "parlament",
    { evidence_role: "official_primary", content_stance: "fact", is_official: true, primary_capable: true, default_trust: "mittel", tier: 3 }),
  // 14) Kommunale Institutionen
  t("kommunal", "Kommunale Institution", "exekutive",
    { evidence_role: "official_primary", content_stance: "fact", is_official: true, primary_capable: true, default_trust: "mittel", tier: 3 }),
  // 15) Gerichte
  t("gericht", "Gericht", "kontrolle_justiz",
    { evidence_role: "official_primary", content_stance: "fact", is_official: true, primary_capable: true, default_trust: "hoch", tier: 1 }),
  // 16) Rechnungshoefe
  t("rechnungshof", "Rechnungshof", "kontrolle_justiz",
    { evidence_role: "data_source", content_stance: "fact", is_official: true, primary_capable: true, default_trust: "hoch", tier: 1 }),
  // 17) Fachverbaende
  t("fachverband", "Fachverband", "interessenvertretung",
    { evidence_role: "direct_interest", content_stance: "position", is_official: false, primary_capable: true, default_trust: "mittel", tier: 3 }),
  // 18) Gewerkschaften
  t("gewerkschaft", "Gewerkschaft", "interessenvertretung",
    { evidence_role: "direct_interest", content_stance: "position", is_official: false, primary_capable: true, default_trust: "mittel", tier: 3 }),
  // 19) Arbeitgeberverbaende
  t("arbeitgeberverband", "Arbeitgeberverband", "interessenvertretung",
    { evidence_role: "direct_interest", content_stance: "position", is_official: false, primary_capable: true, default_trust: "mittel", tier: 3 }),
  // 20) Wissenschaft und Forschung
  t("wissenschaft", "Wissenschaft und Forschung", "wissenschaft_analyse",
    { evidence_role: "data_source", content_stance: "analysis", is_official: false, primary_capable: true, default_trust: "hoch", tier: 3 }),
  // 21) Thinktanks
  t("thinktank", "Thinktank", "wissenschaft_analyse",
    { evidence_role: "journalistic", content_stance: "analysis", is_official: false, primary_capable: false, default_trust: "mittel", tier: 3 }),
  // 22) Nichtregierungsorganisationen
  t("ngo", "Nichtregierungsorganisation", "interessenvertretung",
    { evidence_role: "direct_interest", content_stance: "position", is_official: false, primary_capable: true, default_trust: "mittel", tier: 3 }),
  // 23) Ueberregionale Medien
  t("medien_ueberregional", "Überregionale Medien", "medien",
    { evidence_role: "journalistic", content_stance: "journalistic", is_official: false, primary_capable: false, default_trust: "mittel", tier: 4 }),
  // 24) Regionale Medien
  t("medien_regional", "Regionale Medien", "medien",
    { evidence_role: "journalistic", content_stance: "journalistic", is_official: false, primary_capable: false, default_trust: "mittel", tier: 4 }),
  // 25) Fachmedien
  t("fachmedien", "Fachmedien", "medien",
    { evidence_role: "journalistic", content_stance: "journalistic", is_official: false, primary_capable: false, default_trust: "mittel", tier: 3 }),
  // 26) Oeffentliche Datenportale
  t("datenportal", "Öffentliches Datenportal", "daten",
    { evidence_role: "data_source", content_stance: "fact", is_official: true, primary_capable: true, default_trust: "hoch", tier: 1 }),
  // Aggregator/Suchanbieter ist BEWUSST KEINE der 26 inhaltlichen Kategorien: ein Suchanbieter
  // ist ein Abrufweg-/Discovery-Mechanismus, kein Herausgeber und keine Quellenkategorie.
  // Er wird als eigener technischer Typ gefuehrt, damit die Coverage-Matrix (Phase 9) seine
  // Abhaengigkeit sichtbar macht und er nie als alleinige Versorgung zaehlt (Abnahmekriterium §9).
  t("suchanbieter", "Suchanbieter (Discovery/Rückfallebene)", "medien",
    { evidence_role: "aggregator", content_stance: "journalistic", is_official: false, primary_capable: false, default_trust: "niedrig", tier: 5 })
];

const TYPE_BY_ID = new Map(SOURCE_TYPES.map((x) => [x.id, x]));

// Die 26 inhaltlichen Kategorien (ohne den technischen Aggregator-Typ) — fuer Abdeckungspruefungen.
const CONTENT_SOURCE_TYPE_IDS = SOURCE_TYPES.filter((x) => x.id !== "suchanbieter").map((x) => x.id);

function getSourceType(id) {
  return TYPE_BY_ID.get(String(id || "")) || null;
}
function isKnownSourceType(id) {
  return TYPE_BY_ID.has(String(id || ""));
}
// Ein Suchanbieter (Google News o. ae.) ist NIE Primaerquelle und NIE amtlich.
function isSearchProviderType(id) {
  return String(id || "") === "suchanbieter";
}
// Faktenquelle vs. Positionsquelle — Grundlage der Gewichtung (Phase 9).
function isFactualType(id) {
  const t2 = getSourceType(id);
  return !!t2 && t2.content_stance === "fact";
}
function isPositionType(id) {
  const t2 = getSourceType(id);
  return !!t2 && t2.content_stance === "position";
}

module.exports = {
  CONTENT_STANCES, EVIDENCE_ROLES, ACQUISITION_TIERS, TAXONOMY_GROUPS,
  SOURCE_TYPES, CONTENT_SOURCE_TYPE_IDS,
  getSourceType, isKnownSourceType, isSearchProviderType, isFactualType, isPositionType
};
