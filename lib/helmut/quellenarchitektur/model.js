"use strict";

// Helmut — Neue Quellenarchitektur · Kernmodell (reine Logik, KEINE KI, kein Netz, kein Storage).
//
// Trennt die im Ist-Zustand verschmolzenen Begriffe sauber:
//   HERAUSGEBER (publisher)  = die Organisation, die veroeffentlicht — existiert EINMAL zentral.
//   ABRUFWEG   (retrieval_path) = die technische Methode, ueber die Inhalte gefunden werden.
//   QUELLENPAKET (source_package) = ein Buendel von Abrufwegen fuer einen Produktzweck.
//
// Dieses Modul liefert nur die Enums + reinen Funktionen. Der eigentliche Katalog-Mapper
// (bestehende v1Sources -> dieses Modell) liegt in catalog.js. NICHTS hier veraendert das
// Live-Verhalten; die Module sind additiv und werden erst in spaeteren Sprints verdrahtet.
//
// Wiederverwendung statt Parallelmodell: URL-Normalisierung stammt aus dedup.js,
// Domain-/Trust-Ableitung aus sourceSafety.js — keine Duplikate.

const { canonicalizeUrl } = require("../dedup");
const { hostOf, categorizeSource, trustForSource } = require("../sourceSafety");
const { isStrictGoogleNewsUrl } = require("../provider-url");
const crypto = require("crypto");

// --- Enums (verbindliche Wertebereiche) -------------------------------------

// Politische ENTSCHEIDUNGS-Ebenen. Region/Wahlkreis sind KEINE Ebene (das ist Geografie).
const POLITICAL_LEVELS = ["international", "eu", "bund", "land", "kommune"];

// Geografie-Hierarchieebenen.
const GEO_LEVELS = ["bund", "land", "bezirk", "kreis", "kommune"];

// Zentrale politische Entitaetstypen (typisierte Entitaetsschicht statt Doppelmodelle).
const ENTITY_TYPES = [
  "person", "party", "parliamentary_group", "committee", "ministry", "parliament",
  "government", "association", "union", "authority", "statistical_office", "other_institution"
];

// Belegfunktion eines Herausgebers: WIE stark belegt seine Aussage einen Sachverhalt.
// Eine Partei ist Primaerquelle fuer die eigene Position, aber kein neutraler Beleg.
const EVIDENCE_ROLES = ["official_primary", "direct_interest", "journalistic", "data_source", "aggregator"];

// Vertrauensstufen (identisch zu sourceSafety, hier nur re-exportiert fuer Konsistenz).
const TRUST_LEVELS = ["hoch", "mittel", "niedrig", "blockiert", "unbekannt"];

// Abrufweg-Methoden. googlenews_search macht den Aggregator-Charakter explizit (statt ihn
// als rss gegen news.google.com zu verstecken). api deckt die DIP-Schnittstelle ab.
const RETRIEVAL_METHODS = ["rss", "api", "html", "googlenews_search", "structured_download"];

// Status eines Abrufwegs (6-stufig, Auftrag §30).
const PATH_STATUS = ["healthy", "degraded", "broken", "needs_review", "paused", "archived"];

// Status eines Pakets (5-stufig, Auftrag §30).
const PACKAGE_STATUS = ["draft", "prepared", "active", "paused", "archived"];

// Aktivierungsmodus eines Abrufwegs. always_on = kritische Systemquelle/Bund Basis (nie
// automatisch pausiert). dev_only = darf NIE einen Production-Crawl ausloesen.
const ACTIVATION_MODES = ["auto", "always_on", "dev_only", "manual"];

// Herausgeber-Lebenszyklus.
const PUBLISHER_LIFECYCLE = ["active", "paused", "archived"];

// Der Aggregator-Herausgeber fuer Google-News-Themensuchen ohne echten site:-Herausgeber.
const GOOGLE_NEWS_PUBLISHER_ID = "aggregator-google-news";

// --- URL / Domain (Wiederverwendung + duenne Ergaenzung) --------------------

// Bereinigte URL ohne Tracking-Parameter (delegiert an dedup.canonicalizeUrl).
function normalizeUrl(url) {
  return canonicalizeUrl(url);
}

// Kanonische Herausgeber-Domain aus einer URL (www. weg, lowercase). Leer bei ungueltig.
function canonicalDomain(url) {
  return hostOf(url);
}

// Extrahiert die erste site:-Domain aus einer Google-News-Suchdefinition, sonst "".
// Beispiel: "site:verdi.de (Tarif OR Pflege)" -> "verdi.de".
function extractSiteDomain(query) {
  const m = /site:([a-z0-9.-]+)/i.exec(String(query || ""));
  if (!m) return "";
  return m[1].replace(/^www\./, "").toLowerCase();
}

// Dekodiert den q-Parameter aus einer Google-News-RSS-Such-URL (die Suchdefinition).
function googleNewsQuery(rssUrl) {
  try {
    const u = new URL(String(rssUrl || ""));
    return u.searchParams.get("q") || "";
  } catch {
    return "";
  }
}

function isGoogleNewsUrl(url) {
  return isStrictGoogleNewsUrl(url);
}

// --- Abrufweg-Methode klassifizieren ----------------------------------------
// Entscheidet nach der TATSAECHLICHEN URL, nicht nach der Fabrik: eine Personenquelle ("<mandats-id>-news") nutzt zwar
// directSource, seine rssUrl zeigt aber auf news.google.com -> googlenews_search.
function classifyMethod(source = {}) {
  const primary = source.rssUrl || (Array.isArray(source.rssUrls) ? source.rssUrls[0] : "") || source.url || "";
  if (isGoogleNewsUrl(primary)) return "googlenews_search";
  const method = String(source.crawlMethod || "").toLowerCase();
  if (method === "html") return "html";
  if (method === "api") return "api";
  if (method === "rss") return "rss";
  // Fallback: RSS, wenn ein Feed vorhanden ist, sonst HTML.
  return primary ? "rss" : "html";
}

// --- Belegfunktion aus Kategorie/Typ ableiten -------------------------------
// Mappt die sourceSafety-Kategorie (offiziell/medien/partei_fraktion/regional/profil/...)
// + Entitaetstyp auf die Belegfunktion des Herausgebers.
function evidenceRoleFor({ category, entityType } = {}) {
  const cat = String(category || "").toLowerCase();
  const type = String(entityType || "").toLowerCase();
  if (type === "statistical_office" || type === "authority") {
    // Statistik/Behoerde: Datenquelle, ausser sie ist ein Parlament/Regierung (dann Primaer).
    return "data_source";
  }
  if (cat === "offiziell") return "official_primary";
  if (cat === "partei_fraktion" || type === "party" || type === "parliamentary_group" || type === "association" || type === "union") {
    return "direct_interest";
  }
  if (cat === "medien") return "journalistic";
  return "journalistic";
}

// --- Entitaetstyp aus dem Alt-source.type ableiten --------------------------
// Alte Typen (person/ministry/bundestag/committee/party/association/official/media/local)
// -> zentrale ENTITY_TYPES.
const LEGACY_TYPE_TO_ENTITY = {
  person: "person",
  party: "party",
  faction: "parliamentary_group",
  committee: "committee",
  ministry: "ministry",
  bundestag: "parliament",
  government: "government",
  association: "association",
  union: "union",
  official: "authority",
  authority: "authority",
  media: "other_institution", // Medienhaeuser sind Herausgeber, aber keine politische Entitaet i.e.S.
  local: "other_institution"
};

function entityTypeForLegacy(type) {
  return LEGACY_TYPE_TO_ENTITY[String(type || "").toLowerCase()] || "other_institution";
}

// --- Inhaltsfingerabdruck (getrennt vom fehlbenannten content_hash) ---------
// Der bestehende dedup.contentHash ist faktisch ein URL/Titel-Hash. Fuer echte
// Inhalts-Aehnlichkeit braucht es einen Fingerabdruck ueber den bereinigten Inhalt.
// Hier: normalisierter (Titel + Kontext), Tokens sortiert -> stabil gegen Wortstellung/Tracking.
function contentFingerprint({ title, summary } = {}) {
  // Umlaute deterministisch falten (ae/oe/ue/ss), damit Schreibvarianten zusammenfallen;
  // danach nur a-z0-9 + Leerzeichen behalten. Kein NFD noetig.
  const text = `${String(title || "")} ${String(summary || "")}`
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  const tokens = [...new Set(text.split(" ").filter((t) => t.length >= 4))].sort();
  if (!tokens.length) return "";
  return crypto.createHash("sha256").update(tokens.join(" ")).digest("hex");
}

// --- Statuswechsel-Regeln fuer Abrufwege ------------------------------------
// Nachvollziehbare Uebergaenge (Auftrag §30):
//   - >=3 aufeinanderfolgende Abruffehler -> degraded, >=6 -> broken.
//   - Erfolg -> healthy (Reset der Fehlerfolge).
//   - Kritische offizielle Pflichtquellen (isCritical) werden NIE automatisch archiviert
//     und nie ueber 'broken' hinaus verschlechtert -> sichtbarer Alarm statt stiller Tod.
//   - Manuelle Status (paused/archived/needs_review) bleiben, bis sie manuell geloest werden.
const DEGRADE_THRESHOLD = 3;
const BROKEN_THRESHOLD = 6;

function nextPathStatus(current, event = {}) {
  const { success, errorStreak = 0, isCritical = false, manualOverride = false } = event;
  if (manualOverride) return current; // manuelle Status nicht automatisch ueberschreiben
  if (["paused", "archived"].includes(current)) return current;
  if (success) return "healthy";
  if (errorStreak >= BROKEN_THRESHOLD) return "broken";
  if (errorStreak >= DEGRADE_THRESHOLD) return "degraded";
  // Einzelner Fehler unterhalb der Schwelle: gesunde Quelle wird 'needs_review',
  // eine bereits degradierte bleibt degradiert.
  if (current === "healthy") return isCritical ? "needs_review" : "healthy";
  return current;
}

// Darf ein Abrufweg automatisch pausiert werden (unproduktiv, nicht kritisch)?
function mayAutoPause(path = {}) {
  if (path.activation_mode === "always_on") return false;
  if (path.is_critical) return false;
  return true;
}

// --- Referenzzaehlung -------------------------------------------------------
// Ein Abrufweg ist technisch aktiv, wenn mindestens ein aktives Paket ihn benoetigt,
// ODER er dauerhaft aktiv ist (always_on: Bund Basis / kritische Systemquellen).
// dev_only loest NIE einen Production-Crawl aus.
function isPathActive(path = {}, activePackageIdsForPath = []) {
  if (path.activation_mode === "dev_only") return false;
  if (path.status === "archived" || path.status === "paused") return false;
  if (path.activation_mode === "always_on") return true;
  return Array.isArray(activePackageIdsForPath) && activePackageIdsForPath.length > 0;
}

// Referenzzaehlung ueber die gesamte Struktur: liefert je Abrufweg die Menge der aktiven
// Pakete, die ihn benoetigen (aus package_paths + Paketstatus). Reine Aggregation.
function computePathRefcounts({ packagePaths = [], packages = [] } = {}) {
  const activePackageIds = new Set(
    packages.filter((p) => p && p.status === "active").map((p) => p.id)
  );
  const byPath = new Map();
  for (const link of packagePaths) {
    if (!link || !link.retrieval_path_id) continue;
    if (!byPath.has(link.retrieval_path_id)) byPath.set(link.retrieval_path_id, new Set());
    if (activePackageIds.has(link.package_id)) byPath.get(link.retrieval_path_id).add(link.package_id);
  }
  const out = {};
  for (const [pathId, set] of byPath.entries()) out[pathId] = [...set];
  return out;
}

module.exports = {
  // Enums
  POLITICAL_LEVELS, GEO_LEVELS, ENTITY_TYPES, EVIDENCE_ROLES, TRUST_LEVELS,
  RETRIEVAL_METHODS, PATH_STATUS, PACKAGE_STATUS, ACTIVATION_MODES, PUBLISHER_LIFECYCLE,
  GOOGLE_NEWS_PUBLISHER_ID, LEGACY_TYPE_TO_ENTITY,
  DEGRADE_THRESHOLD, BROKEN_THRESHOLD,
  // URL/Domain
  normalizeUrl, canonicalDomain, extractSiteDomain, googleNewsQuery, isGoogleNewsUrl,
  // Klassifikation
  classifyMethod, evidenceRoleFor, entityTypeForLegacy, contentFingerprint,
  // Status / Refcount
  nextPathStatus, mayAutoPause, isPathActive, computePathRefcounts,
  // Wiederverwendete Helfer (re-export fuer Tests/Katalog)
  categorizeSource, trustForSource
};
