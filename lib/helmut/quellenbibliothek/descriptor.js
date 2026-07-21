"use strict";

// Helmut — Universelle Quellenbibliothek · Deskriptor (Normalisierung + Validierung).
//
// Reine, deterministische Logik. KEINE KI, kein Netz, kein Storage. Macht aus einer
// beliebigen Roh-Quellenbeschreibung einen kanonischen `SourceDescriptor` (siehe
// types.js) und prüft ihn gegen einen verbindlichen Vertrag. Ziel des Auftrags §2:
// JEDE Quelle strukturiert beschrieben, KEINE fest codierten Sonderfälle.
//
// Wiederverwendung statt Parallelmodell: Enums/URL-Helfer aus der bestehenden
// quellenarchitektur, Normalisierung von Partei/Ausschuss aus matching.js.

const model = require("../quellenarchitektur/model");
const { normalizeParty, normalizeCommittee } = require("../matching");

// --- Enums (verbindliche Wertebereiche der Bibliothek) ----------------------
const LEVELS = ["international", "eu", "bund", "land", "bezirk", "kreis", "kommune"];
const RETRIEVAL_METHODS = ["rss", "api", "html", "search", "structured_download"];
const EVIDENCE_ROLES = model.EVIDENCE_ROLES; // official_primary/direct_interest/journalistic/data_source/aggregator
const TRUST_LEVELS = model.TRUST_LEVELS;     // hoch/mittel/niedrig/blockiert/unbekannt
const USAGE_STATUS = ["active", "prepared", "paused", "archived"];
const LICENSE_STATUS = ["open", "attribution", "restricted", "prohibited", "unknown"];

// Methoden-Aliase auf den kanonischen Wert (die Alt-Architektur kennt googlenews_search).
const METHOD_ALIASES = {
  googlenews_search: "search",
  google_news: "search",
  websearch: "search",
  feed: "rss",
  atom: "rss",
  json: "api",
  rest: "api",
  scrape: "html",
  download: "structured_download"
};

// --- kleine reine Normalisierer ---------------------------------------------
function str(v) { return v == null ? "" : String(v).trim(); }
function lower(v) { return str(v).toLowerCase(); }

// Generische Schlüssel-Normalisierung (Themen/Regionen/Ministerien): ae/oe/ue falten,
// nur a-z0-9 und Bindestrich behalten, Wortgrenzen -> "-". Deterministisch, stabil.
function slug(v) {
  const s = lower(v)
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s;
}

// Liste normalisieren: Werte durch `fn` schicken, Leeres/Duplikate entfernen, stabil sortieren.
function normList(value, fn) {
  const arr = Array.isArray(value) ? value : (value == null || value === "" ? [] : [value]);
  const out = [];
  for (const v of arr) {
    const n = fn(v);
    if (n && !out.includes(n)) out.push(n);
  }
  return out.sort();
}

function normalizeMethod(method) {
  const m = lower(method);
  const canon = METHOD_ALIASES[m] || m;
  return RETRIEVAL_METHODS.includes(canon) ? canon : "";
}

// --- Kanonischer Dedup-Schlüssel --------------------------------------------
// Zwei Quellen sind DIESELBE, wenn Herausgeber-Domain + Methode + Ziel (URL bzw.
// Suchdefinition) übereinstimmen. Google-News-Suchen werden über ihre q-Definition
// und die site:-Domain unterschieden, nicht über die austauschbare Proxy-URL.
function canonicalKey(desc = {}) {
  const access = desc.access || {};
  const method = normalizeMethod(access.method) || "unknown";
  if (method === "search") {
    const q = model.googleNewsQuery(access.url) || str(access.query);
    const site = model.extractSiteDomain(q);
    return `search|${slug(access.provider) || "aggregator"}|${site || slug(q)}`;
  }
  const domain = model.canonicalDomain(access.url) || slug(desc.publisher);
  const target = model.normalizeUrl(access.url) || str(access.url);
  return `${method}|${domain}|${target}`;
}

// --- Normalisierung eines Roh-Deskriptors -----------------------------------
// Nimmt eine lose Beschreibung entgegen und liefert einen kanonischen Deskriptor.
// Fehlende Listenfelder werden zu [] (nie undefined), damit Downstream nie null-prüfen muss.
function normalizeDescriptor(raw = {}) {
  const access = raw.access || {};
  const method = normalizeMethod(access.method);
  // Aggregator-Suche vereinheitlichen: Google-News-URL und explizite Query-Form sollen
  // DIESELBE Identität ergeben. Provider aus der URL ableiten, Suchdefinition aus dem
  // q-Parameter ziehen, wenn nicht separat angegeben — so ist die Herkunft stabil.
  let provider = lower(access.provider) || undefined;
  let query = str(access.query) || undefined;
  if (method === "search" && model.isGoogleNewsUrl(access.url)) {
    provider = provider || "google_news";
    query = query || (model.googleNewsQuery(access.url) || undefined);
  }
  const desc = {
    id: str(raw.id) || null, // echte ID kann fehlen -> canonicalKey als Fallback (unten)
    publisher: str(raw.publisher),
    name: str(raw.name) || str(raw.publisher),
    evidenceRole: EVIDENCE_ROLES.includes(raw.evidenceRole) ? raw.evidenceRole : "journalistic",
    access: {
      method,
      url: str(access.url) || undefined,
      query,
      provider,
      parser: str(access.parser) || undefined,
      maxItems: Number.isFinite(access.maxItems) ? access.maxItems : undefined
    },
    level: LEVELS.includes(raw.level) ? raw.level : undefined,
    geographyId: str(raw.geographyId) || undefined,
    parties: normList(raw.parties != null ? raw.parties : raw.party, normalizeParty),
    factions: normList(raw.factions != null ? raw.factions : raw.faction, normalizeParty),
    committees: normList(raw.committees != null ? raw.committees : raw.committee, normalizeCommittee),
    topics: normList(raw.topics != null ? raw.topics : raw.themen, slug),
    regions: normList(raw.regions != null ? raw.regions : raw.regionen, slug),
    ministries: normList(raw.ministries != null ? raw.ministries : raw.ministerien, slug),
    universal: raw.universal === true,
    priority: clampInt(raw.priority, 0, 100, 50),
    trust: TRUST_LEVELS.includes(raw.trust) ? raw.trust : "unbekannt",
    expectedFrequency: lower(raw.expectedFrequency) || undefined,
    status: USAGE_STATUS.includes(raw.status) ? raw.status : "prepared",
    license: LICENSE_STATUS.includes(raw.license) ? raw.license : "unknown",
    health: raw.health || undefined,
    meta: raw.meta && typeof raw.meta === "object" ? raw.meta : undefined
  };
  desc.canonicalKey = canonicalKey(desc);
  if (!desc.id) desc.id = desc.canonicalKey;
  return desc;
}

function clampInt(v, min, max, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, Math.round(n)));
}

// --- Validierung ------------------------------------------------------------
// Liefert { ok, errors:[], warnings:[] }. errors = Vertrag verletzt (nicht aufnehmbar);
// warnings = aufnehmbar, aber unvollständig (Discovery/Anreicherung sollte nachziehen).
function validateDescriptor(input = {}) {
  const desc = input.canonicalKey ? input : normalizeDescriptor(input);
  const errors = [];
  const warnings = [];

  if (!desc.publisher) errors.push("publisher-fehlt");
  if (!desc.access.method) errors.push("abrufweg-methode-ungueltig");
  else if (desc.access.method === "search") {
    if (!desc.access.query && !desc.access.url) errors.push("suchdefinition-fehlt");
  } else if (!desc.access.url) {
    errors.push("abruf-url-fehlt");
  }

  // Eine Quelle MUSS mindestens EINE Zuordnungsdimension tragen (sonst ist sie nie
  // zuweisbar) — außer sie ist ausdrücklich universal (Grundversorgung).
  const hasDimension = desc.universal ||
    desc.parties.length || desc.factions.length || desc.committees.length ||
    desc.topics.length || desc.regions.length || desc.ministries.length || !!desc.level;
  if (!hasDimension) errors.push("keine-zuordnungsdimension");

  if (desc.trust === "unbekannt") warnings.push("vertrauensniveau-unbekannt");
  if (desc.license === "unknown") warnings.push("lizenzstatus-unbekannt");
  if (desc.access.method !== "search" && !desc.access.parser) warnings.push("parser-nicht-gesetzt");
  if (!desc.expectedFrequency) warnings.push("aktualitaet-unbekannt");

  return { ok: errors.length === 0, errors, warnings, descriptor: desc };
}

module.exports = {
  LEVELS, RETRIEVAL_METHODS, EVIDENCE_ROLES, TRUST_LEVELS, USAGE_STATUS, LICENSE_STATUS,
  slug, normList, normalizeMethod, canonicalKey,
  normalizeDescriptor, validateDescriptor
};
