"use strict";

// Helmut Core V3 — Radar Read-Adapter (currentRadarState). KEINE KI, KEIN Netzwerk,
// KEINE neue Engine, KEINE Kostenwerte, KEIN Client-Fallback.
// "Einmal verstehen (global) -> mehrfach lesen (pro Nutzer, 0 KI)".
//
// Radar beantwortet: "Was passiert gerade rund um mich und mein politisches Umfeld?"
// Dieser Adapter LIEST ausschliesslich bereits vorhandene V3-Daten und formt sie in
// den Radar-Lesevertrag:
//   - knowledge_objects (verstanden)         -> Titel/Kurzfassung/Struktur/Erwaehnungen
//   - decisions (mit matched_features)        -> personenscharfer Profilbezug (Umfeld)
//   - raw_documents (sourcesByVorgang)        -> echte Quelle/URL/Kategorie/Zeit
//   - profile                                 -> Name, Partei/Fraktion, Wahlkreis, Ausschuesse
//
// Grundregeln (identisch zum uebrigen V3-Fundament):
//   - Nichts erfinden. Fehlt ein Wert -> "" / null / [] (ehrlicher Leerzustand).
//   - Keine Demo-Artikel, keine erfundenen Erwaehnungen/Dynamiken/Zahlen.
//   - Keine hartkodierte Person/Partei/Wahlkreis/Ausschuss (alles aus dem Profil).
//   - Keine Handlungsempfehlung, kein Risiko/Chance-Frame (das ist Helmut, nicht Radar).
//   - Keine Kostenwerte: es werden nur die unten gemappten Felder gelesen.
//   - Sichtbare Zahlen == angezeigte Daten (die Zusammenfassung zaehlt exakt die Listen).

// koTitle/koSummary sind bewusst LOKAL nachgebildet (identisch zu briefingContract),
// um eine zirkulaere Abhaengigkeit briefingContract -> radarState -> briefingContract
// zu vermeiden. Rein deterministisch, kein KI-Call.
const sourceSafety = require("./sourceSafety");
const { dateKeyInTimezone, DEFAULT_TIMEZONE } = require("./briefingLanguage");

// --- Konstanten -------------------------------------------------------------
const MENTION_CAP = 30;        // alle Erwaehnungen (Anzeige zeigt 3 + "Alle anzeigen")
const ENV_SEGMENT_CAP = 12;    // pro Umfeld-Segment
const DYNAMICS_CAP = 8;        // belegte Dynamiken (Anzeige zeigt 3 + "Alle anzeigen")
const ARTICLE_CAP = 48;        // kompakte Artikelliste (client-seitig gefiltert)
const RISING_MIN_SOURCES = 3;  // "mehr Quellen" erst ab echter Cluster-Groesse
// "Neue Dynamiken" duerfen nur WIRKLICH neue Aktivitaet zeigen: die juengste belegte
// Aktivitaet (Quellen-/KO-Zeitstempel) muss innerhalb dieses Fensters liegen. Aeltere
// Vorgaenge werden NICHT als "neu" praesentiert (sie bleiben in "Alle Artikel"). SaaS-
// konfigurierbar, kein tenant-Sonderfall, keine kuenstliche Aktualitaet. Default 4 Tage.
const DYNAMICS_FRESH_DAYS = Math.max(1, Number(process.env.RADAR_DYNAMICS_FRESH_DAYS || 4));
const SUMMARY_MAX = 220;

// Quellen-Kategorie -> menschliches Produkt-Label (KEINE technischen Enums im Frontend).
const SOURCE_CATEGORY_LABELS = {
  media: "Medien", press: "Medien", local: "Regionale Medien",
  ministry: "Ministerium", bundestag: "Bundestag", bundesrat: "Bundesrat",
  committee: "Ausschuss", party: "Partei", faction: "Fraktion",
  association: "Verband", official: "Offizielle Quelle", agency: "Behörde",
  court: "Gericht", eu: "EU", person: "Person", ngo: "Organisation"
};
const OFFICIAL_CATEGORIES = new Set(["ministry", "bundestag", "bundesrat", "committee", "party", "faction", "official", "agency", "court", "eu"]);
const MEDIA_CATEGORIES = new Set(["media", "press", "local"]);

// mentionType (Enum) -> neutrales Produkt-Label. Enums erscheinen NIE roh im Frontend.
const MENTION_TYPE_LABELS = {
  directName: "Namentlich erwähnt",
  quote: "Zitat",
  initiative: "Eigene Initiative",
  speech: "Rede",
  criticism: "Kritik",
  response: "Reaktion"
};

// Umfeld-Labels: praezise zur belegten DIMENSION (Partei/Wahlkreis/Ausschuss), aber
// bewusst NEUTRAL in der Relation — die Matching-Engine belegt, DASS der Vorgang die
// Profil-Dimension trifft, nicht die feinere Richtung ("aus" vs. "erwaehnt"). Kein
// Ueber-Claim. Pro Segment nur das eigene Dimensionslabel (kein Cross-Leak).
const RELATION_LABELS = {
  party: "Betrifft deine Partei",
  constituency: "Betrifft deinen Wahlkreis",
  committee: "Betrifft deinen Ausschuss"
};
// matched_features.type (Matching-Engine) -> Radar-Umfeld-Segment.
const FEATURE_TO_SEGMENT = { partei: "party", wahlkreis: "constituency", ausschuss: "committee" };

// --- kleine, reine Helfer ---------------------------------------------------
function cleanStr(v) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim();
}

function cleanList(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((v) => String(v || "").trim()).filter(Boolean))];
}

function shortText(value, maxLen = SUMMARY_MAX) {
  const s = cleanStr(value);
  if (!s) return "";
  return s.length > maxLen ? s.slice(0, maxLen).replace(/\s+\S*$/, "") : s;
}

function firstSentence(text, maxLen = 180) {
  const s = cleanStr(text);
  if (!s) return "";
  const cut = s.split(/(?<=[.!?])\s/)[0] || s;
  return cut.length > maxLen ? cut.slice(0, maxLen).replace(/\s+\S*$/, "") : cut;
}

function slug(value) {
  return String(value == null ? "" : value).toLowerCase().replace(/[^a-z0-9äöüß]+/gi, " ").replace(/\s+/g, " ").trim();
}

// Namens-Normalisierung fuer den personenscharfen Abgleich — robust gegen Diakritika
// und tuerkisches Ä°/Ä± (identische Semantik wie lib/helmut/radar.js nameKey; bewusst
// lokal gehalten, um radar.js unveraendert zu lassen).
function nameKey(value) {
  return String(value == null ? "" : value)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i").replace(/İ/g, "i")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function wholeWordInText(text, term) {
  if (!text || !term) return false;
  return new RegExp(`(^| )${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(text);
}

function hostFromUrl(url) {
  try { return new URL(String(url)).hostname.replace(/^www\./, ""); }
  catch { return ""; }
}

// Letzter Ausweg fuer den Titel (nie leer, nie roher vorgang_id-Slug).
function humanizeVorgang(vorgangId) {
  const raw = String(vorgangId || "").replace(/^(vg|ko)[-_]/i, "").replace(/[-_]+/g, " ").trim();
  if (!raw) return "Politischer Vorgang";
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Robuster, IMMER gefuellter Titel/Kurzfassung aus V3-Feldern (identisch zu
// briefingContract.koTitle/koSummary — lokal gehalten wegen der Zirkularitaet).
function koTitle(ko = {}, primarySource = null) {
  return (
    cleanStr(ko.display_title) ||
    cleanStr(ko.headline) ||
    firstSentence(ko.display_summary, 90) ||
    firstSentence(ko.was_ist_passiert, 90) ||
    cleanStr(primarySource && primarySource.title) ||
    firstSentence(primarySource && primarySource.summary, 90) ||
    humanizeVorgang(ko.vorgang_id)
  );
}

function koSummary(ko = {}, primarySource = null) {
  return (
    cleanStr(ko.display_summary) ||
    firstSentence(ko.was_ist_passiert, 200) ||
    firstSentence(primarySource && primarySource.summary, 200) ||
    cleanStr(ko.why_relevant) ||
    cleanStr(ko.warum_wichtig) ||
    ""
  );
}

// SICHERHEIT: nur echte http(s)-URLs durchlassen (kein javascript:/data:).
function safeUrl(url) {
  const s = cleanStr(url);
  return /^https?:\/\//i.test(s) ? s : "";
}

function timestampMs(value) {
  const t = Date.parse(value || "");
  return Number.isFinite(t) ? t : 0;
}

function isToday(value, now) {
  const todayKey = dateKeyInTimezone(now, DEFAULT_TIMEZONE);
  const key = dateKeyInTimezone(value, DEFAULT_TIMEZONE);
  return Boolean(todayKey && key && key === todayKey);
}

function sourceCategoryLabel(type) {
  const key = slug(type).replace(/\s+/g, "_");
  return SOURCE_CATEGORY_LABELS[key] || "";
}
function isOfficialCategory(type) { return OFFICIAL_CATEGORIES.has(slug(type).replace(/\s+/g, "_")); }
function isMediaCategory(type) { return MEDIA_CATEGORIES.has(slug(type).replace(/\s+/g, "_")); }

// --- Profil-Terme (voller Name) fuer die personenscharfe Erwaehnung ----------
// SaaS-strikt: "Über dich" verlangt einen ECHTEN vollen Namen (Vor- UND Nachname).
// Ein einzelner Vor-/Nachname reicht bewusst NICHT (Namensvetter -> kein Personenbezug).
function profileTerms(profile = {}) {
  const fullNameRaw = cleanStr(profile.fullName || profile.name);
  const fullName = nameKey(fullNameRaw);
  const tokens = fullName.split(" ").filter(Boolean);
  const hasFullName = tokens.length >= 2;
  const firstName = hasFullName ? tokens[0] : "";
  const lastName = hasFullName ? tokens[tokens.length - 1] : "";
  return { fullNameRaw, fullName, tokens, hasFullName, firstName, lastName };
}

// Ist dieser Vorgang eine DIREKTE, belegte persoenliche Erwaehnung? Rueckgabe traegt
// zugleich den Nachweis (method) fuer confidence/evidence.
//
// SaaS-Vertrauensregel (Vertrauen > Fuelle): "Über dich" NUR bei belegter Nennung des
// VOLLEN Namens. KEIN einzelner Vor-/Nachname, KEIN Namensvetter, KEIN Profil-/Decision-
// Match, KEINE Themen-/Partei-/Wahlkreis-/Ausschussrelevanz. Zwei belegte Wege:
//   1. structured (hoch): ein gespeicherter mentioned_people/mentioned_mps-Eintrag traegt
//      den vollen Namen (als Wortfolge ODER Vor- UND Nachname im selben Eintrag; deckt
//      "İnce, Cem" / "Dr. Cem İnce, MdB" ab). Ein bloßer Teilname genuegt NICHT.
//   2. prose-fullname (mittel): der volle Name als zusammenhaengende Wortfolge in den
//      FAKTENFELDERN (display_title/headline/display_summary/was_ist_passiert). Bewusst
//      NICHT in why_relevant/warum_wichtig — das sind Profil-Relevanz-Notizen der Engine
//      (Profil-/Decision-Match), kein Beleg, dass der ARTIKEL ueber die Person berichtet.
function detectPersonMention(ko = {}, terms) {
  if (!terms || !terms.hasFullName) return null;
  const people = cleanList([].concat(ko.mentioned_people || [], ko.mentioned_mps || [])).map(nameKey);
  const entryNamesPerson = (p) =>
    wholeWordInText(p, terms.fullName) ||
    (wholeWordInText(p, terms.firstName) && wholeWordInText(p, terms.lastName));
  if (people.some(entryNamesPerson)) return { method: "structured", confidence: "high" };
  const factualText = nameKey([ko.display_title, ko.headline, ko.display_summary, ko.was_ist_passiert].filter(Boolean).join(" "));
  if (wholeWordInText(factualText, terms.fullName)) return { method: "prose-fullname", confidence: "medium" };
  return null;
}

// mentionType DETERMINISTISCH aus Strukturfeldern (kein KI-Call, kein Volltext-Raten).
// Prioritaet: Kritik (Risiko am Vorgang) > eigene Initiative > Rede > Reaktion > namentlich.
function classifyMentionType(ko = {}) {
  if (cleanList(ko.risiken).length) return "criticism";
  const struct = slug([ko.instrument || "", ko.stage || "", cleanList(ko.tags).join(" ")].join(" "));
  if (/(antrag|anfrage|initiative|gesetzentwurf|entschliess|gesetzesinitiative)/.test(struct)) return "initiative";
  if (/(rede|debatte|plenum|aussprache|bundestagsrede)/.test(struct)) return "speech";
  if (/(reaktion|antwort|stellungnahme|erwiderung|replik)/.test(struct)) return "response";
  return "directName";
}

// Primaere Quelle EINES Vorgangs aus den ECHTEN raw_documents (id/canonical/url/typ/zeit).
// canonical bevorzugt (stabile Identitaet, Dedup). Kein Doc -> best_source_url des KO.
function pickPrimarySource(ko = {}, docs = []) {
  const list = (Array.isArray(docs) ? docs : []).filter((d) => d && (d.url || d.canonical_url));
  const linkRank = (d) => (String(d.link_type || d.linkType || "") === "direct" ? 2 : (d.canonical_url ? 1 : 0));
  list.sort((a, b) => (linkRank(b) - linkRank(a)) || String(b.published_at || b.publishedAt || "").localeCompare(String(a.published_at || a.publishedAt || "")));
  const d = list[0];
  if (d) {
    const url = safeUrl(d.canonical_url || d.url);
    return {
      documentId: cleanStr(d.id) || null,
      url,
      sourceName: cleanStr(d.source_name || d.sourceName) || hostFromUrl(url) || "Quelle",
      sourceType: cleanStr(d.source_type || d.sourceType) || "",
      linkType: cleanStr(d.link_type || d.linkType) || null,
      publishedAt: d.published_at || d.publishedAt || null,
      title: cleanStr(d.title),
      summary: cleanStr(d.summary)
    };
  }
  const url = safeUrl(ko.best_source_url);
  if (url) {
    return {
      documentId: null, url,
      sourceName: hostFromUrl(url) || "Quelle",
      sourceType: "",
      linkType: cleanStr(ko.best_link_type) || null,
      publishedAt: ko.updated_at || ko.created_at || null,
      title: cleanStr(ko.display_title) || cleanStr(ko.headline),
      summary: ""
    };
  }
  return null;
}

function koPublishedAt(ko, src) {
  return (src && src.publishedAt) || ko.updated_at || ko.created_at || null;
}

// Gemeinsame, deterministische Quellen-/Anzeigefelder eines Vorgangs (kein Ratewert).
function baseItemFields(ko, src) {
  const categoryType = src ? src.sourceType : "";
  return {
    documentId: src ? src.documentId : null,
    vorgangId: ko.vorgang_id || null,
    title: koTitle(ko, src ? { title: src.title, summary: src.summary } : null),
    sourceName: (src && src.sourceName) || "Quelle",
    sourceCategory: sourceCategoryLabel(categoryType),
    sourceCategoryType: categoryType || "",
    sourceUrl: (src && src.url) || "",
    linkType: (src && src.linkType) || null,
    publishedAt: koPublishedAt(ko, src),
    // Thumbnails: es existiert KEIN gespeichertes Bildfeld (image_url/og_image) in den
    // V3-Daten -> ehrlich null. Das Frontend zeigt statt eines erfundenen Bildes ein
    // neutrales Quellenzeichen (Initiale). Siehe Abschlussbericht (Fall C).
    thumbnailUrl: null
  };
}

// =============================================================================
// 1) Über dich — direkte, belegte persoenliche Erwaehnungen
// =============================================================================
function buildMentions(profile, knowledgeObjects, sourcesByVorgang, now) {
  const terms = profileTerms(profile);
  if (!terms.fullName) return [];
  const seen = new Set();
  const out = [];
  for (const ko of Array.isArray(knowledgeObjects) ? knowledgeObjects : []) {
    if (!ko || !ko.vorgang_id) continue;
    if (ko.status === "pending" || ko.understanding_status !== "complete") continue;
    const hit = detectPersonMention(ko, terms);
    if (!hit) continue;
    // Source Safety Guard (regelbasiert, 0 KI): kritische, unbestaetigte Claims aus
    // schwacher/unbekannter Einzelquelle erscheinen NICHT im Radar.
    const docs = sourcesByVorgang[ko.vorgang_id]
      || (ko.best_source_url ? [{ url: ko.best_source_url, source_trust: ko.source_trust }] : []);
    if (sourceSafety.guardKnowledgeObject(ko, docs).status === "quarantine") continue;
    const src = pickPrimarySource(ko, sourcesByVorgang[ko.vorgang_id] || []);
    const url = src && src.url;
    if (!url) continue; // eine Erwaehnung ohne echte Quelle/URL zeigen wir nicht
    const key = src.documentId || url || ko.vorgang_id;
    if (seen.has(key)) continue;
    seen.add(key);
    const mentionType = classifyMentionType(ko);
    const base = baseItemFields(ko, src);
    out.push({
      id: `radar-mention-${ko.vorgang_id}`,
      ...base,
      summary: shortText(koSummary(ko, src ? { summary: src.summary } : null) || ko.was_ist_passiert, 180),
      mentionType,
      mentionLabel: MENTION_TYPE_LABELS[mentionType],
      mentionTone: mentionType === "criticism" ? "critical" : "neutral",
      evidence: firstSentence(ko.display_summary || ko.was_ist_passiert || ko.why_relevant || ko.warum_wichtig, 160),
      confidence: hit.confidence
    });
  }
  out.sort((a, b) => (timestampMs(b.publishedAt) - timestampMs(a.publishedAt)) || String(a.vorgangId).localeCompare(String(b.vorgangId)));
  return out.slice(0, MENTION_CAP);
}

// =============================================================================
// 2) Dein Umfeld — Partei / Wahlkreis / Ausschuesse aus matched_features (Profilbezug)
// =============================================================================
function buildEnvironment(decisions, kosById, sourcesByVorgang, now) {
  const segments = { party: [], constituency: [], committees: [] };
  const seen = { party: new Set(), constituency: new Set(), committees: new Set() };
  const getKo = (id) => (kosById instanceof Map ? kosById.get(id) : kosById[id]);

  for (const d of Array.isArray(decisions) ? decisions : []) {
    const ko = d && getKo(d.knowledge_object_id);
    if (!ko || !ko.vorgang_id) continue;
    // Ein belegter Profilbezug PRO Dimension (Partei/Wahlkreis/Ausschuss). Der Bezug
    // stammt IMMER aus der Matching-Engine (Profil ∩ Vorgang), NIE aus dem Client.
    const byType = new Map();
    for (const f of Array.isArray(d.matched_features) ? d.matched_features : []) {
      const seg = FEATURE_TO_SEGMENT[f && f.type];
      if (!seg) continue;                 // 'thema' ist kein Umfeld-Segment
      if (!byType.has(seg)) byType.set(seg, cleanStr(f.value));
    }
    if (!byType.size) continue;
    const src = pickPrimarySource(ko, sourcesByVorgang[ko.vorgang_id] || []);
    const base = baseItemFields(ko, src);
    for (const [seg, evidenceValue] of byType.entries()) {
      const bucket = seg === "committee" ? "committees" : seg;
      const dedupKey = base.documentId || base.sourceUrl || ko.vorgang_id;
      if (seen[bucket].has(dedupKey)) continue;   // innerhalb eines Bereichs kein Duplikat
      seen[bucket].add(dedupKey);
      const relationType = seg === "committees" ? "committee" : seg;
      segments[bucket].push({
        id: `radar-env-${bucket}-${ko.vorgang_id}`,
        ...base,
        summary: shortText(koSummary(ko, src ? { summary: src.summary } : null) || ko.was_ist_passiert, 160),
        relationType,
        relationLabel: RELATION_LABELS[relationType === "committee" ? "committee" : relationType],
        relevanceEvidence: evidenceValue,
        score: Number(d.score) || 0
      });
    }
  }
  for (const k of Object.keys(segments)) {
    segments[k].sort((a, b) => (timestampMs(b.publishedAt) - timestampMs(a.publishedAt)) || (b.score - a.score));
    segments[k] = segments[k].slice(0, ENV_SEGMENT_CAP).map(({ score, ...rest }) => rest);
  }
  return segments;
}

// =============================================================================
// 3) Neue Dynamiken — nur belegte Veraenderung (echte Zaehlungen, kein Trend-Rat)
// =============================================================================
function buildDynamics(decisions, kosById, sourcesByVorgang, now) {
  const getKo = (id) => (kosById instanceof Map ? kosById.get(id) : kosById[id]);
  const nowMs = (now instanceof Date ? now : new Date(now)).getTime();
  const freshWindowMs = DYNAMICS_FRESH_DAYS * 864e5;
  const out = [];
  const seen = new Set();
  for (const d of Array.isArray(decisions) ? decisions : []) {
    const ko = d && getKo(d.knowledge_object_id);
    if (!ko || !ko.vorgang_id || seen.has(ko.vorgang_id)) continue;
    const docs = (sourcesByVorgang && sourcesByVorgang[ko.vorgang_id]) || [];
    // Frische-Gate: die JUENGSTE belegte Aktivitaet (Quellen-Veroeffentlichung oder KO-
    // Aktualisierung) muss im Fenster liegen. Aeltere Vorgaenge sind KEINE "neue" Dynamik
    // (sie erscheinen weiter in "Alle Artikel"). Kein Zeitstempel -> nicht als neu zeigen.
    const activityTimes = [ko.updated_at, ko.created_at, ...docs.map((x) => x && (x.published_at || x.publishedAt))]
      .map(timestampMs).filter(Boolean);
    const latestActivityMs = activityTimes.length ? Math.max(...activityTimes) : 0;
    if (!latestActivityMs || (nowMs - latestActivityMs) > freshWindowMs) continue;
    const storedCount = Number(ko.source_document_count);
    const sourceCount = Math.max(Number.isFinite(storedCount) ? storedCount : 0, docs.length);
    const categoryTypes = cleanList(docs.map((x) => cleanStr(x.source_type || x.sourceType)));
    const hasOfficial = categoryTypes.some(isOfficialCategory);
    const hasMedia = categoryTypes.some(isMediaCategory);
    const distinctCategories = new Set(categoryTypes.map((c) => slug(c).replace(/\s+/g, "_"))).size;

    // Signal DETERMINISTISCH aus echten Belegen. Prioritaet: breiter Widerhall >
    // offizielle Aufmerksamkeit > mehr Quellen. KEIN Signal aus einem Einzeldokument.
    let signalType = null, evidence = "", signalLabel = "";
    if (hasOfficial && hasMedia && sourceCount >= 2) {
      signalType = "broadening"; signalLabel = "Breiter Widerhall";
      evidence = "Der Vorgang wird medial und von offizieller Seite aufgegriffen.";
    } else if (hasOfficial && sourceCount >= 2) {
      signalType = "officialAttention"; signalLabel = "Offiziell aufgegriffen";
      evidence = "Eine offizielle Quelle greift den Vorgang auf.";
    } else if (sourceCount >= RISING_MIN_SOURCES) {
      signalType = "rising"; signalLabel = "Mehr Quellen";
      evidence = `${sourceCount} Quellen berichten über diesen Vorgang.`;
    } else {
      continue; // keine belegbare Dynamik -> nicht anzeigen (ehrlich)
    }
    seen.add(ko.vorgang_id);
    const src = pickPrimarySource(ko, docs);
    const base = baseItemFields(ko, src);
    out.push({
      id: `radar-dyn-${ko.vorgang_id}`,
      vorgangId: ko.vorgang_id,
      title: base.title,
      summary: shortText(koSummary(ko, src ? { summary: src.summary } : null) || ko.was_ist_passiert, 160),
      signalType,
      signalLabel,
      evidence,
      sourceCount,
      sourceCategories: [...new Set(categoryTypes.map(sourceCategoryLabel).filter(Boolean))],
      firstSeenAt: ko.created_at || null,
      lastUpdatedAt: base.publishedAt || ko.updated_at || null,
      sourceName: base.sourceName,
      sourceCategory: base.sourceCategory,
      sourceUrl: base.sourceUrl,
      linkType: base.linkType,
      thumbnailUrl: null,
      relatedSourceIds: cleanList(docs.map((x) => cleanStr(x.id))),
      relatedDocumentIds: base.documentId ? [base.documentId] : []
    });
  }
  const RANK = { broadening: 3, officialAttention: 2, rising: 1 };
  out.sort((a, b) => (RANK[b.signalType] - RANK[a.signalType]) || (timestampMs(b.lastUpdatedAt) - timestampMs(a.lastUpdatedAt)));
  return out.slice(0, DYNAMICS_CAP);
}

// =============================================================================
// 4) Alle relevanten Artikel — kompakte, deduplizierte Liste mit relationTypes
// =============================================================================
function buildArticles(decisions, kosById, sourcesByVorgang, mentions, now) {
  const getKo = (id) => (kosById instanceof Map ? kosById.get(id) : kosById[id]);
  const mentionVorgaenge = new Set(mentions.map((m) => m.vorgangId).filter(Boolean));
  const out = [];
  const seen = new Set();
  for (const d of Array.isArray(decisions) ? decisions : []) {
    const ko = d && getKo(d.knowledge_object_id);
    if (!ko || !ko.vorgang_id) continue;
    const src = pickPrimarySource(ko, sourcesByVorgang[ko.vorgang_id] || []);
    const base = baseItemFields(ko, src);
    const dedupKey = base.documentId || base.sourceUrl || ko.vorgang_id;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    const relationTypes = [];
    if (mentionVorgaenge.has(ko.vorgang_id)) relationTypes.push("mention");
    for (const f of Array.isArray(d.matched_features) ? d.matched_features : []) {
      const seg = FEATURE_TO_SEGMENT[f && f.type];
      if (seg && !relationTypes.includes(seg)) relationTypes.push(seg);
    }
    if (isMediaCategory(base.sourceCategoryType)) relationTypes.push("media");
    if (isOfficialCategory(base.sourceCategoryType)) relationTypes.push("official");
    out.push({
      id: `radar-article-${ko.vorgang_id}`,
      ...base,
      shortSummary: shortText(koSummary(ko, src ? { summary: src.summary } : null) || ko.was_ist_passiert, 150),
      relationTypes: [...new Set(relationTypes)],
      score: Number(d.score) || 0
    });
  }
  out.sort((a, b) => (timestampMs(b.publishedAt) - timestampMs(a.publishedAt)) || (b.score - a.score));
  return out.slice(0, ARTICLE_CAP).map(({ score, ...rest }) => rest);
}

// =============================================================================
// 5) Persoenliche Zusammenfassung — deterministisch, max. 2 Saetze, Zahlen == Anzeige
// =============================================================================
function buildSummary(mentions, environment, dynamics, now) {
  const mentionsToday = mentions.filter((m) => isToday(m.publishedAt, now)).length;
  const mentionsTotal = mentions.length;
  const envTotal = environment.party.length + environment.constituency.length + environment.committees.length;
  const dynTotal = dynamics.length;

  let line1 = "";
  if (mentionsToday > 0) {
    line1 = mentionsToday === 1 ? "Heute wurdest du einmal erwähnt." : `Heute wurdest du ${mentionsToday}× erwähnt.`;
  } else if (mentionsTotal > 0) {
    line1 = mentionsTotal === 1 ? "Aktuell liegt eine direkte Erwähnung über dich vor." : `Aktuell liegen ${mentionsTotal} direkte Erwähnungen über dich vor.`;
  } else {
    line1 = "Heute gibt es keine neuen direkten Erwähnungen.";
  }

  let line2 = "";
  if (dynTotal > 0) {
    line2 = dynTotal === 1 ? "In deinem politischen Umfeld gibt es ein neues Signal." : `In deinem politischen Umfeld gibt es ${dynTotal} neue Signale.`;
  } else if (envTotal > 0) {
    line2 = envTotal === 1 ? "Eine Entwicklung aus deinem politischen Umfeld ist relevant." : `${envTotal} Entwicklungen aus deinem politischen Umfeld sind relevant.`;
  }

  // Beide leer -> genau EIN ehrlicher Satz (keine kuenstliche Dramatik, keine Zahl).
  if (mentionsTotal === 0 && dynTotal === 0 && envTotal === 0) {
    return { line1: "Heute gibt es keine neuen relevanten Signale in deinem politischen Umfeld.", line2: "", text: "Heute gibt es keine neuen relevanten Signale in deinem politischen Umfeld." };
  }
  return { line1, line2, text: [line1, line2].filter(Boolean).join(" ") };
}

// --- Ehrliche Qualitaet + lastUpdated ---------------------------------------
function computeLastUpdated(mentions, environment, dynamics, articles) {
  let best = 0, iso = null;
  const consider = (t) => { const ms = timestampMs(t); if (ms > best) { best = ms; iso = t; } };
  mentions.forEach((m) => consider(m.publishedAt));
  ["party", "constituency", "committees"].forEach((k) => environment[k].forEach((e) => consider(e.publishedAt)));
  dynamics.forEach((d) => consider(d.lastUpdatedAt));
  articles.forEach((a) => consider(a.publishedAt));
  return iso;
}

function emptyRadarState(meta) {
  return {
    generatedAt: meta.generatedAt,
    lastUpdated: null,
    status: "empty",
    profileId: meta.profileId || null,
    summary: { line1: "Heute gibt es keine neuen relevanten Signale in deinem politischen Umfeld.", line2: "", text: "Heute gibt es keine neuen relevanten Signale in deinem politischen Umfeld." },
    mentions: [],
    environment: { party: [], constituency: [], committees: [] },
    dynamics: [],
    articles: [],
    quality: {
      status: "empty", reason: meta.reason || null, lastUpdated: null,
      mentionsFound: 0, environmentMatched: 0, dynamicsDetected: 0, articleCount: 0,
      sourcesLoaded: false, hasThumbnails: false, thumbnailsAvailable: false
    }
  };
}

// --- Haupt-Adapter ----------------------------------------------------------
// Input = derselbe V3-Kontext wie toBriefingContractV3, plus optional die BREITE Menge
// verstandener KOs (knowledgeObjects) fuer die Erwaehnungssuche (Erwaehnungen duerfen
// nicht am Top-N-Relevanz-Cut verloren gehen). Output = EIN currentRadarState.
function buildCurrentRadarState({ profile = {}, decisions = [], kosById = {}, sourcesByVorgang = {}, knowledgeObjects = null, now = new Date(), reason = null } = {}) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const generatedAt = nowDate.toISOString();
  const profileId = cleanStr(profile && (profile.id || profile.userId || profile.politicianId)) || null;
  const meta = { generatedAt, profileId, reason };

  const koList = (Array.isArray(knowledgeObjects) && knowledgeObjects.length)
    ? knowledgeObjects
    : Object.values(kosById instanceof Map ? Object.fromEntries(kosById) : (kosById || {}));

  const mentions = buildMentions(profile, koList, sourcesByVorgang, nowDate);
  const environment = buildEnvironment(decisions, kosById, sourcesByVorgang, nowDate);
  const dynamics = buildDynamics(decisions, kosById, sourcesByVorgang, nowDate);
  const articles = buildArticles(decisions, kosById, sourcesByVorgang, mentions, nowDate);
  const summary = buildSummary(mentions, environment, dynamics, nowDate);

  const envTotal = environment.party.length + environment.constituency.length + environment.committees.length;
  if (!mentions.length && !envTotal && !dynamics.length && !articles.length) {
    return emptyRadarState(meta);
  }

  const lastUpdated = computeLastUpdated(mentions, environment, dynamics, articles);
  // Status ehrlich: "fresh" nur, wenn der juengste angezeigte Stand von HEUTE ist
  // (Europe/Berlin). Sonst "stale" -> das Frontend zeigt "Letzter Stand" statt "Aktuell".
  const status = !lastUpdated ? "stale" : (isToday(lastUpdated, nowDate) ? "fresh" : "stale");
  const sourcesLoaded = Object.keys(sourcesByVorgang || {}).length > 0;

  return {
    generatedAt,
    lastUpdated,
    status,
    profileId,
    summary,
    mentions,
    environment,
    dynamics,
    articles,
    quality: {
      // NUR echte technische Zustaende (keine Bewertung wie "Belastbar").
      status,
      reason: reason || null,
      lastUpdated,
      mentionsFound: mentions.length,
      environmentMatched: envTotal,
      dynamicsDetected: dynamics.length,
      articleCount: articles.length,
      sourcesLoaded,
      // Thumbnails: kein gespeichertes Bildfeld in V3 -> keine echten Vorschaubilder.
      hasThumbnails: false,
      thumbnailsAvailable: false
    }
  };
}

module.exports = {
  buildCurrentRadarState,
  // Fuer Tests / Wiederverwendung:
  detectPersonMention,
  classifyMentionType,
  profileTerms,
  buildMentions,
  buildEnvironment,
  buildDynamics,
  buildArticles,
  buildSummary,
  MENTION_TYPE_LABELS,
  RELATION_LABELS,
  sourceCategoryLabel,
  isOfficialCategory,
  isMediaCategory
};
