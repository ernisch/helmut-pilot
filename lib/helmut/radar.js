"use strict";

// Helmut Core V3 — Radar Engine (personenscharf, KEINE KI, server-seitig).
// "Einmal verstehen (global) -> mehrfach lesen (pro Nutzer, 0 KI)".
//
// Ersetzt den bisherigen client-seitigen Keyword-Klassifikator (classifyRadarV3Signal
// in client.js) durch eine DETERMINISTISCHE Server-Engine, die aus den bereits
// global befüllten knowledge_objects-Feldern klassifiziert:
//   - mentioned_people / mentioned_mps  -> "wird mein Name genannt?"
//   - mentioned_parties                 -> "wird meine Partei genannt?"
//   - risiken / chancen / instrument / zeitdruck -> Signalklasse (Bucket)
//
// So trägt jedes Radar-Signal seine Klasse (signalType) bereits vom Server; die
// Oberfläche rendert nur noch. Keine KI, kein Netzwerk, kein Modell-Call.
//
// DSGVO: es werden ausschließlich öffentliche Erwähnungen/Analysefelder verarbeitet;
// die Signale tragen keine privaten Personenprofile.

// Gemeinsame, robuste Titel-/Kurzfassungs-Logik mit Home/Helmut (kein Slug, nie leer).
const { koTitle, koSummary } = require("./briefingContract");
const sourceSafety = require("./sourceSafety");

const RADAR_BUCKETS = ["risk", "demand", "chance", "warning", "mention"];
const WARNING_WINDOW_MS = 48 * 60 * 60 * 1000;
const DEFAULT_CAP = 60;
const SUMMARY_MAX = 240;

// Strukturierte (nicht text-basierte) Marker für "kritische parlamentarische
// Nachfrage": aus instrument/stage/tags des KO, nicht aus Volltext-Keywords.
const DEMAND_MARKERS = ["anfrage", "kleine anfrage", "grosse anfrage", "große anfrage", "antrag", "anhoerung", "anhörung", "ausschuss", "tagesordnung", "fragestunde", "berichterstatter"];

function slug(value) {
  return String(value == null ? "" : value).toLowerCase().replace(/[^a-z0-9äöüß]+/gi, " ").replace(/\s+/g, " ").trim();
}

// Namens-Normalisierung für den personenscharfen Abgleich: robust gegen Diakritika
// und türkisches İ/ı. "Cem İnce", "Cem Ince", "İnce", "Ince" -> alle "cem ince"/"ince".
// Bewusst nur für Namen (NICHT für Partei/Struktur -> dort bleibt slug).
function nameKey(value) {
  return String(value == null ? "" : value)
    .normalize("NFKD")                 // İ -> I + Kombinierungspunkt, ö -> o + Trema ...
    .replace(/[̀-ͯ]/g, "")   // Kombinierungszeichen entfernen
    .replace(/ı/g, "i").replace(/İ/g, "i")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanList(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((v) => String(v || "").trim()).filter(Boolean))];
}

function shortText(value, maxLen = SUMMARY_MAX) {
  const s = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.length > maxLen ? s.slice(0, maxLen).replace(/\s+\S*$/, "") : s;
}

function hostFromUrl(url) {
  try { return new URL(String(url)).hostname.replace(/^www\./, ""); }
  catch { return ""; }
}

function timestampMs(ko) {
  const t = new Date(ko.updated_at || ko.created_at || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

// Öffentliche Merkmale des Profils für den personenscharfen Abgleich.
// Namen werden mit nameKey normalisiert (robust gegen İ/ı/Diakritika), Parteien
// mit slug (unverändert).
function profileRadarTerms(profile = {}) {
  const fullNameRaw = String(profile.fullName || profile.name || "").trim();
  const fullName = nameKey(fullNameRaw);
  const tokens = fullName.split(" ").filter(Boolean);
  // Nachname als distinktiver Einzelbegriff (ab 4 Zeichen), z. B. "özdemir"->"ozdemir", "ince".
  const lastName = tokens.length >= 2 && tokens[tokens.length - 1].length >= 4 ? tokens[tokens.length - 1] : "";
  const parties = cleanList([profile.party, profile.partei, profile.faction, profile.fraktion]).map(slug);
  return { fullName, fullNameRaw, lastName, parties };
}

// Suchbegriff als eigenständige Wortfolge im (normalisierten) Text? Vermeidet
// Teilwort-Treffer wie "ince" in "provinces".
function wholeWordInText(text, term) {
  if (!text || !term) return false;
  return new RegExp(`(^| )${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(text);
}

// Nennt/betrifft dieser Vorgang den Nutzer (Name ODER Partei)? Reihenfolge der
// Prüfung liefert auch den Erwähnungsgrund. Person geht Partei vor.
function mentionReason(ko, terms) {
  if (terms.fullName) {
    // 1. Strukturierte, AI-extrahierte Erwähnungsfelder (deckt auch "İnce" allein).
    const people = cleanList([].concat(ko.mentioned_people || [], ko.mentioned_mps || [])).map(nameKey);
    if (people.some((p) => p === terms.fullName || p.includes(terms.fullName) || terms.fullName.includes(p))) {
      return "person";
    }
    // 2. Fallback: der volle Name steht in den öffentlichen KO-Texten (Titel/
    //    Zusammenfassung/Beschreibung), wurde aber NICHT als strukturierte
    //    Erwähnung extrahiert -> Eigenerwähnung trotzdem zuverlässig erkennen
    //    (deterministisch, kein KI-Call, kein Volltext-Scraping).
    const text = nameKey([ko.display_title, ko.headline, ko.display_summary, ko.was_ist_passiert, ko.warum_wichtig].filter(Boolean).join(" "));
    if (wholeWordInText(text, terms.fullName)) return "person";
    // 3. Distinktiver Nachname als eigenständiges Wort in Erwähnungsfeldern ODER Text.
    if (terms.lastName && (people.some((p) => wholeWordInText(p, terms.lastName)) || wholeWordInText(text, terms.lastName))) {
      return "person";
    }
  }
  if (terms.parties.length) {
    const koParties = cleanList([].concat(ko.parteien || [], ko.mentioned_parties || [])).map(slug);
    if (koParties.some((p) => terms.parties.includes(p))) return "partei";
  }
  return null;
}

// Deterministische Signalklasse AUS STRUKTURFELDERN (nicht aus Volltext-Keywords).
// Priorität: Risiko > Nachfrage > Chance > Frühwarnung (frisch) > Erwähnung.
function classifyRadarSignal(ko = {}, now = Date.now()) {
  const hasRisk = cleanList(ko.risiken).length > 0;
  const hasChance = cleanList(ko.chancen).length > 0;
  const structure = slug(`${ko.instrument || ""} ${ko.stage || ""} ${cleanList(ko.tags).join(" ")}`);
  const isDemand = DEMAND_MARKERS.some((m) => structure.includes(m)) || (String(ko.zeitdruck || "").trim() !== "" && cleanList(ko.ausschuesse).length > 0);
  const ageMs = now - timestampMs(ko);

  if (hasRisk) return "risk";
  if (isDemand) return "demand";
  if (hasChance) return "chance";
  if (ageMs >= 0 && ageMs < WARNING_WINDOW_MS) return "warning";
  return "mention";
}

function koToRadarSignal(ko = {}, reason, signalType) {
  const url = ko.best_source_url || "";
  return {
    id: ko.vorgang_id,
    vorgangId: ko.vorgang_id,
    knowledgeObjectId: ko.id,
    signalType,
    reason,
    // Gemeinsame robuste Logik mit Home/Helmut: nie leer, nie roher vorgang_id-Slug.
    title: koTitle(ko),
    summary: koSummary(ko) || shortText(ko.was_ist_passiert),
    // Client-Kompatibilität (renderRadarV3View liest title/content/excerpt):
    content: shortText(koSummary(ko) || ko.was_ist_passiert),
    excerpt: shortText(koSummary(ko) || ko.was_ist_passiert),
    sourceName: hostFromUrl(url) || "Quelle",
    sourceType: null,
    url,
    linkType: ko.best_link_type || (url ? "direct" : "missing"),
    publishedAt: ko.updated_at || ko.created_at || null,
    retrievedAt: ko.updated_at || ko.created_at || null,
    displayCategory: ko.display_category || "",
    mentionedPeople: cleanList(ko.mentioned_people),
    mentionedParties: cleanList(ko.mentioned_parties)
  };
}

// Baut die personenscharfen Radar-Signale für EIN Profil aus verstandenen KOs.
// Deterministisch, ohne KI/Netz. Rückgabe: gruppierte Buckets + flache Signalliste.
function buildRadarSignals(profile = {}, knowledgeObjects = [], opts = {}) {
  const now = opts.now != null ? Number(opts.now) : Date.now();
  const cap = opts.limit != null ? Number(opts.limit) : DEFAULT_CAP;
  const terms = profileRadarTerms(profile);

  const understood = (Array.isArray(knowledgeObjects) ? knowledgeObjects : []).filter((k) =>
    k && k.vorgang_id && k.status !== "pending" && k.understanding_status === "complete"
  );

  const signals = [];
  for (const ko of understood) {
    const reason = mentionReason(ko, terms);
    if (!reason) continue; // Radar ist personen-/parteischarf: keine Erwähnung -> kein Signal
    // Source Safety Guard: kritische, unbestaetigte Claims aus schwacher/unbekannter
    // Einzelquelle erscheinen NICHT im Radar (regelbasiert, 0 KI). best_source_url pruefen.
    const docs = ko.best_source_url ? [{ url: ko.best_source_url, source_trust: ko.source_trust, source_type: ko.best_source_type }] : [];
    if (sourceSafety.guardKnowledgeObject(ko, docs).status === "quarantine") continue;
    signals.push(koToRadarSignal(ko, reason, classifyRadarSignal(ko, now)));
  }

  signals.sort((a, b) =>
    (new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()) ||
    String(a.vorgangId).localeCompare(String(b.vorgangId))
  );
  // Anzeige deckeln, aber Eigenerwähnungen (reason==="person") NIE wegkappen —
  // sie sollen unabhängig von Risk/Party-Top-Signalen immer sichtbar bleiben.
  let capped;
  if (signals.length <= cap) {
    capped = signals;
  } else {
    const keepRest = new Set(signals.filter((s) => s.reason !== "person").slice(0, Math.max(0, cap - signals.filter((s) => s.reason === "person").length)));
    capped = signals.filter((s) => s.reason === "person" || keepRest.has(s));
  }

  // Bucket-Modell:
  //  - "mention" (Eigene Erwähnung) = QUERSCHNITT: JEDE persönliche Erwähnung
  //    (reason==="person"), unabhängig vom Inhalt. Eine Eigenerwähnung, die auch
  //    Risiko/Chance/Nachfrage ist, erscheint zusätzlich im jeweiligen Inhaltsbucket.
  //  - risk/demand/chance/warning = Inhaltsbuckets. Reine Partei-Erwähnungen
  //    (reason==="partei") landen NIE unter "Eigene Erwähnung"; neutrale
  //    (signalType "mention") werden unter "warning" (Frühwarnung) beobachtet.
  const buckets = { risk: [], demand: [], chance: [], warning: [], mention: [] };
  for (const s of capped) {
    if (s.reason === "person") {
      buckets.mention.push(s);
      if (s.signalType !== "mention") buckets[s.signalType].push(s);
    } else {
      buckets[s.signalType === "mention" ? "warning" : s.signalType].push(s);
    }
  }

  return {
    politicianId: profile.id || profile.userId || opts.userId || null,
    generatedAt: new Date(now).toISOString(),
    total: capped.length,
    buckets,
    signals: capped
  };
}

// --- Shadow-Runner (Produktion): lädt Profil + KOs, baut Signale -------------
// Deps injizierbar (Test = offline). Gatet auf den V3-Store; inert ohne Store.
function defaultDeps() {
  const storage = require("./storage");
  return {
    enabled: () => storage.v3StoreReady(),
    getProfile: (userId) => storage.getProfile(userId),
    listKnowledgeObjects: (o) => storage.listKnowledgeObjects(o)
  };
}

async function buildRadarForUser(input = {}, overrides = {}) {
  const deps = { ...defaultDeps(), ...overrides };
  if (!deps.enabled()) return { skipped: true, reason: "v3-store-disabled", buckets: emptyBuckets(), signals: [] };
  try {
    const profile = input.profile || (input.userId ? await deps.getProfile(input.userId) : null);
    if (!profile) return { skipped: true, reason: "no-profile", buckets: emptyBuckets(), signals: [] };
    // SCAN-Umfang bewusst GROSS und UNABHÄNGIG vom Anzeige-Limit: Eigenerwähnungen
    // dürfen nicht verloren gehen, nur weil das KO nicht unter den jüngsten Top-
    // Signalen liegt. Der Load holt die neuesten Rows (inkl. pending, die danach
    // gefiltert werden) — deshalb hoch ansetzen, damit auch ältere VERSTANDENE KOs
    // erfasst werden. Anzeige wird in buildRadarSignals separat gedeckelt.
    const scanLimit = input.scanLimit != null ? Number(input.scanLimit) : 500;
    const kos = (await deps.listKnowledgeObjects({ limit: scanLimit })) || [];
    return buildRadarSignals(profile, kos, { now: input.now, limit: input.limit, userId: input.userId });
  } catch (error) {
    return { skipped: true, reason: "radar-error", error: error && error.message, buckets: emptyBuckets(), signals: [] };
  }
}

function emptyBuckets() {
  return { risk: [], demand: [], chance: [], warning: [], mention: [] };
}

module.exports = {
  RADAR_BUCKETS,
  classifyRadarSignal,
  mentionReason,
  profileRadarTerms,
  koToRadarSignal,
  buildRadarSignals,
  buildRadarForUser,
  defaultDeps
};
