"use strict";

// Helmut Core V3 — Contract-Adapter (Home / Briefing / Helmut, KEINE KI).
// "Einmal verstehen (global) -> mehrfach bewerten (pro Nutzer, 0 KI)".
//
// Baut aus V3-Daten (verstandene knowledge_objects + deterministische decisions
// aus decisions.js) die BESTEHENDE /api/app/start-Vertrags­form, die Home,
// Briefing und der Helmut-Tab (client.js) lesen. So kann V3 die Sekundär-Ober­
// flächen bedienen, ohne den Frontend-Vertrag zu brechen — und der V2-
// personalization.js/runtime.js-Pfad wird danach ersetzbar.
//
// Rein deterministisch, ohne KI, ohne Netzwerk: die einzige KI liegt (global,
// einmalig) in der Understanding-Engine; dieser Adapter formt nur um.
//
// Die "heilige" Schwellenregel (Server == Client, contract-snapshot-test):
//   score >= 60 -> "Sofort reagieren", >= 40 -> "Beobachten", sonst "Ignorieren".
// Jedes Objekt, das BEIDES trägt (relevance_score + decision), ist per Konstruktion
// konsistent (beide leiten sich aus demselben score ab).

const decisionsEngine = require("./decisions");
// Radar-Lesevertrag (currentRadarState) — additiv, deterministisch, 0 KI, keine Kostenwerte.
const radarState = require("./radarState");
// Sprint 5: Handlungsfaehigkeit + unterscheidbarer Leerzustand (flag-gesichert, Default aus).
const scoring = require("./scoring");
const { HELMUT_LEVEL_ENUM, HELMUT_COMM_CHANNEL_ENUM, HELMUT_COMM_FORMAT_ENUM,
  HELMUT_ACTION_PRIORITY_ENUM, HELMUT_ACTION_TYPE_ENUM } = require("./understanding-schema");
// Slot-Normalisierung (slot-aware Read-Pfad): eine einzige Quelle in briefingLanguage.
// Ungueltiger/fehlender briefingType -> 'daily' (nie Crash, keine erfundene Tageszeit).
// dateKeyInTimezone: ehrlicher Tages-Frische-Guard (ist der angezeigte Stand von HEUTE?).
const { normalizeBriefingType, dateKeyInTimezone, DEFAULT_TIMEZONE } = require("./briefingLanguage");
// Verbindlicher Frischevertrag (Berliner Tageswechsel, Briefingfenster,
// Meldungsklassen). EINE Quelle fuer jede Frischeaussage — siehe briefing-frische.js.
const briefingFrische = require("./briefing-frische");

const HOME_SECTION_CAP = 3;

// Ab wann gelten die Stabschef-Felder eines Vorgangs als "stale" (veraltet)?
// Konfigurierbar, SaaS-faehig (kein tenant-spezifischer Sonderfall). Default 21 Tage.
const STAFF_STALE_DAYS = Number(process.env.HELMUT_STAFF_STALE_DAYS || 21);

function firstSentence(text, maxLen = 160) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const cut = s.split(/(?<=[.!?])\s/)[0] || s;
  return cut.length > maxLen ? cut.slice(0, maxLen).replace(/\s+\S*$/, "") : cut;
}

function hostFromUrl(url) {
  try { return new URL(String(url)).hostname.replace(/^www\./, ""); }
  catch { return ""; }
}

// Letzter Ausweg für den Titel: aus der stabilen vorgang_id einen lesbaren Text
// machen (Präfix weg, Trenner zu Leerzeichen, Wörter groß). NIE leer, NIE "Thema".
function humanizeVorgang(vorgangId) {
  const raw = String(vorgangId || "").replace(/^(vg|ko)[-_]/i, "").replace(/[-_]+/g, " ").trim();
  if (!raw) return "Politischer Vorgang";
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Robuster, IMMER gefüllter Titel aus V3-Feldern (kein "Thema"-Platzhalter mehr).
// Reihenfolge: display_title -> headline -> 1. Satz display_summary/was_ist_passiert
// -> Titel/1. Satz der Primärquelle -> lesbare vorgang_id.
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

// Kurzfassung: bevorzugt die display_summary, sonst 1. Satz der Analyse/Quelle.
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

// Handlungsempfehlung mit stabilem Fallback (nie leer, wenn Analyse vorhanden).
function koAction(ko = {}) {
  return cleanStr(ko.recommendation) || cleanStr(ko.handlungsempfehlung) || "";
}

// "Warum wichtig" mit stabilem Fallback.
function koWhy(ko = {}) {
  return cleanStr(ko.why_relevant) || cleanStr(ko.warum_wichtig) || firstSentence(ko.was_ist_passiert, 160) || "";
}

function cleanStr(v) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim();
}

// Enum-Normalisierung fuer die Lesepfad-Ausgabe (Frontend raet NICHTS): unbekannt/
// fehlend -> "unknown". Identisch zur Assemble-Sanitisierung, nur read-seitig.
function normEnum(value, allowed) {
  const v = cleanStr(value);
  return allowed.includes(v) ? v : "unknown";
}

// Strukturierte Kommunikationsempfehlung LESEN — rueckwaertsverträglich:
//   1. Ist recommended_communication_struct (jsonb) vorhanden -> normalisieren.
//   2. Sonst aus der Alt-Kurzzeile recommended_communication (text) bauen
//      (communicationLine = Alt-Zeile, Rest unknown/[]). KEIN erfundener Inhalt.
function normCommStruct(ko = {}) {
  const s = ko.recommended_communication_struct;
  if (s && typeof s === "object" && !Array.isArray(s)) {
    return {
      communicationLine: cleanStr(s.communicationLine) || cleanStr(ko.recommended_communication),
      recommendedChannel: normEnum(s.recommendedChannel, HELMUT_COMM_CHANNEL_ENUM),
      recommendedFormat: normEnum(s.recommendedFormat, HELMUT_COMM_FORMAT_ENUM),
      suggestedOutputs: Array.isArray(s.suggestedOutputs) ? s.suggestedOutputs.map(cleanStr).filter(Boolean) : []
    };
  }
  return {
    communicationLine: cleanStr(ko.recommended_communication),
    recommendedChannel: "unknown",
    recommendedFormat: "unknown",
    suggestedOutputs: []
  };
}

// Strukturierte naechste Schritte LESEN — rueckwaertsverträglich:
//   1. Ist action_items_struct (jsonb-Liste) vorhanden -> normalisieren.
//   2. Sonst aus der Alt-Liste action_items (text[]) bauen (title = Alt-String,
//      Rest leer/unknown). Ein Eintrag ohne title wird verworfen.
function normActionItems(ko = {}) {
  const src = ko.action_items_struct;
  if (Array.isArray(src) && src.length) {
    return src
      .filter((it) => it && typeof it === "object" && !Array.isArray(it) && cleanStr(it.title))
      .map((it) => ({
        title: cleanStr(it.title),
        description: cleanStr(it.description),
        dueHint: cleanStr(it.dueHint),
        priority: normEnum(it.priority, HELMUT_ACTION_PRIORITY_ENUM),
        actionType: normEnum(it.actionType, HELMUT_ACTION_TYPE_ENUM)
      }));
  }
  return (Array.isArray(ko.action_items) ? ko.action_items : [])
    .map(cleanStr)
    .filter(Boolean)
    .map((title) => ({ title, description: "", dueHint: "", priority: "unknown", actionType: "unknown" }));
}

// Praesenz-Checks fuer den Qualitaetsstatus (strukturiert ODER Alt-Feld gefuellt).
function hasComm(ko = {}) {
  const s = ko.recommended_communication_struct;
  if (s && typeof s === "object" && !Array.isArray(s)) {
    const knownEnum = (v, none) => v && v !== "unknown" && v !== none;
    return Boolean(cleanStr(s.communicationLine)) ||
      knownEnum(s.recommendedFormat, "none") || knownEnum(s.recommendedChannel, "none") ||
      (Array.isArray(s.suggestedOutputs) && s.suggestedOutputs.some((x) => cleanStr(x)));
  }
  return Boolean(cleanStr(ko.recommended_communication)); // Alt-Feld
}
function hasActions(ko = {}) {
  if (Array.isArray(ko.action_items_struct) && ko.action_items_struct.some((i) => i && cleanStr(i.title))) return true;
  return Array.isArray(ko.action_items) && ko.action_items.some((x) => cleanStr(x)); // Alt-Feld
}

// Rueckwaertsvertraeglicher V3-KERN aelterer KOs (die VOR Einfuehrung der vier
// Stabschef-Felder verstanden wurden): eine echte Handlungsempfehlung UND/ODER ein echtes
// "Warum wichtig" sind belastbarer V3-Inhalt aus dem Motor. Traegt ein KO das, ist es
// NICHT leer -- der Vorschlag ist renderbar. was_ist_passiert zaehlt bewusst NICHT (reine
// Ereignisbeschreibung; sonst waere "empty" nie erreichbar und ein echtes Datenloch
// wuerde verdeckt). KEIN erfundener Inhalt, rein aus vorhandenen KO-Feldern.
function hasCoreV3Content(ko = {}) {
  return Boolean(
    cleanStr(ko.recommendation) || cleanStr(ko.handlungsempfehlung) ||
    cleanStr(ko.why_relevant) || cleanStr(ko.warum_wichtig)
  );
}

// Ehrlicher Qualitaetszustand der Stabschef-Felder EINES Vorgangs (KEINE KI, KEIN
// Fallback-Text). Spaetere Adapter/UI (CurrentHelmutState) koennen damit sauber
// unterscheiden, statt erfundene Inhalte zu zeigen:
//   error   = Understanding fehlgeschlagen (understanding_status='failed') / kein KO
//   empty   = kein Stabschef-Inhalt befuellt (oder Vorgang noch 'pending')
//   stale   = Inhalt vorhanden, aber KO aelter als HELMUT_STAFF_STALE_DAYS
//   partial = nur ein Teil der vier Inhalts-Dimensionen befuellt
//   valid   = alle vier Inhalts-Dimensionen befuellt UND frisch
// riskLevel/opportunityLevel sind Klassifikationen -- "unknown" ist ausdruecklich
// erlaubt und senkt den Status NICHT (die vier Inhaltsfelder bestimmen die Qualitaet).
function deriveHelmutQualityStatus(ko = {}, now = new Date()) {
  if (!ko || typeof ko !== "object") return "error";
  if (ko.understanding_status === "failed") return "error";
  if (ko.status === "pending" || ko.understanding_status === "pending") return "empty";
  const dims = [
    Boolean(cleanStr(ko.risk_of_no_action)),
    Boolean(cleanStr(ko.opportunity_summary)),
    hasComm(ko),
    hasActions(ko)
  ];
  const present = dims.filter(Boolean).length;
  const ts = Date.parse(ko.updated_at || ko.created_at || "");
  const ref = (now instanceof Date ? now : new Date(now)).getTime();
  const isStale = Boolean(ts && Number.isFinite(ref) && ref - ts > STAFF_STALE_DAYS * 86400000);
  if (present === 0) {
    // Keine der vier neuen Stabschef-Dimensionen befuellt. Traegt das (aeltere) KO aber
    // echten V3-Kern (Empfehlung/Warum), ist es NICHT leer -> ehrlich "partial" (bzw.
    // "stale", wenn alt), damit der vorhandene Vorschlag sichtbar bleibt statt versteckt.
    // Nur wenn AUCH der Kern fehlt, ist es wirklich leer.
    if (!hasCoreV3Content(ko)) return "empty";
    return isStale ? "stale" : "partial";
  }
  if (isStale) return "stale";
  return present === dims.length ? "valid" : "partial";
}

// Die Stabschef-Werte als camelCase-Vertragsform (fuer CurrentHelmutState). Kommen
// AUSSCHLIESSLICH aus dem V3-Motor (KO), rueckwaertsverträglich aus struct ODER Alt-Feld.
// KEIN Demo-Text, KEINE erfundene Partei/Person: fehlt etwas -> "" / [] / "unknown"
// (der helmutQualityStatus macht das ehrlich sichtbar).
function koStaffFields(ko = {}, now = new Date()) {
  return {
    riskOfNoAction: cleanStr(ko.risk_of_no_action),
    opportunitySummary: cleanStr(ko.opportunity_summary),
    riskLevel: normEnum(ko.risk_level, HELMUT_LEVEL_ENUM),
    opportunityLevel: normEnum(ko.opportunity_level, HELMUT_LEVEL_ENUM),
    recommendedCommunication: normCommStruct(ko),
    actionItems: normActionItems(ko),
    // Meta fuer die spaetere Ansicht ("Letzte Aktualisierung"): reine Zeitstempel-
    // Durchreichung aus dem KO (kein erfundener Wert; null wenn unbekannt).
    lastUpdatedAt: ko.updated_at || ko.created_at || null,
    helmutQualityStatus: deriveHelmutQualityStatus(ko, now)
  };
}

// Prioritäts-Label aus Score — 1:1 wie der bisherige V2-Vertrag (personalization.js).
function priorityLabelFromScore(score) {
  const s = Number(score) || 0;
  if (s >= 90) return "Sofort handeln";
  if (s >= 80) return "Kritisch";
  if (s >= 60) return "Wichtig";
  if (s >= 40) return "Relevant";
  return "Beobachten";
}

function actionTypeFromDecision(decision) {
  if (decision === "Sofort reagieren") return "react";
  if (decision === "Beobachten") return "observe";
  return "ignore";
}

function buildSources(ko = {}, docs = []) {
  const list = (Array.isArray(docs) ? docs : [])
    .map((d) => {
      const url = d.url || d.canonical_url || "";
      return {
        name: d.source_name || d.name || hostFromUrl(url) || "Quelle",
        title: cleanStr(d.title),
        summary: cleanStr(d.summary),
        url,
        linkType: d.link_type || d.linkType || null,
        sourceType: d.source_type || d.sourceType || null,
        publishedAt: d.published_at || d.publishedAt || null
      };
    })
    .filter((s) => s.url);
  if (!list.length && ko.best_source_url) {
    list.push({
      name: hostFromUrl(ko.best_source_url) || "Quelle",
      title: cleanStr(ko.display_title) || cleanStr(ko.headline),
      summary: "",
      url: ko.best_source_url,
      linkType: ko.best_link_type || null,
      sourceType: null,
      publishedAt: ko.updated_at || null
    });
  }
  return list;
}

// Ein Briefing-Item (ITEM_REQUIRED_KEYS: id,title,decision,priority,finalScore,
// recommendedAction,primarySource,sources).
function toItem(decision, ko, sources) {
  const score = decision.score;
  const primarySource = sources[0] || null;
  return {
    id: `item-${ko.vorgang_id}`,
    signalId: ko.id,
    knowledgeObjectId: ko.id,
    vorgangId: ko.vorgang_id,
    title: koTitle(ko, primarySource),
    decision: decision.decision,
    priority: priorityLabelFromScore(score),
    priorityType: decision.priority_type,
    finalScore: score,
    relevance_score: score,
    recommendedAction: koAction(ko),
    whyItMatters: koWhy(ko),
    summary: koSummary(ko, primarySource),
    riskNote: decision.risk || "",
    opportunityNote: decision.chance || "",
    matchedFeatures: Array.isArray(decision.matched_features) ? decision.matched_features : [],
    primarySource,
    sources,
    sourceCount: sources.length,
    linkType: (primarySource && primarySource.linkType) || ko.best_link_type || "missing",
    url: (primarySource && primarySource.url) || ko.best_source_url || ""
  };
}

// Eine personalisierte Empfehlung (REC_REQUIRED_KEYS: id,relevance_score,
// current_priority,recommended_action,personal_relevance_explanation,action_type,status).
function toRecommendation(decision, ko, sources, now = new Date()) {
  const score = decision.score;
  const primarySource = sources[0] || null;
  return {
    id: `rec-${ko.vorgang_id}`,
    // Stabschef-Felder (V3-Motor -> spaeter CurrentHelmutState). Additiv, ehrlich leer
    // statt erfunden; helmutQualityStatus ∈ {valid,partial,stale,empty,error}.
    ...koStaffFields(ko, now),
    knowledge_object_id: ko.id,
    vorgang_id: ko.vorgang_id,
    // Robuster Titel + Kurzfassung (nie leer -> kein "Thema"-Platzhalter im Helmut-Tab).
    title: koTitle(ko, primarySource),
    summary: koSummary(ko, primarySource),
    relevance_score: score,
    decision: decision.decision,
    priorityType: decision.priority_type,
    current_priority: priorityLabelFromScore(score),
    previous_priority: null,
    recommended_action: koAction(ko),
    personal_relevance_explanation: koWhy(ko),
    consequence_if_ignored: decision.risk || "",
    possible_upside: decision.chance || "",
    action_type: actionTypeFromDecision(decision.decision),
    status: "new",
    // Quelle explizit mitgeben -> Helmut-Karte zeigt Beleg/Link zuverlässig.
    primarySource,
    source_count: sources.length,
    sources
  };
}

// Home-Kachel (client compactHomeItem-Form). Trägt bewusst KEINEN `decision`-Key
// neben `relevanceScore` (camelCase) — der Konsistenz-Check greift nur bei
// `relevance_score` + `decision` zusammen.
function toHomeItem(item) {
  return {
    id: item.id,
    signalId: item.signalId,
    title: item.title,
    priority: item.priority,
    priorityLabel: item.priority,
    priorityType: item.priorityType,
    relevanceScore: item.finalScore,
    summary: item.summary,
    action: item.recommendedAction,
    whyItMatters: item.whyItMatters,
    contextType: null,
    sourceName: item.primarySource && item.primarySource.name,
    url: item.url,
    linkType: item.linkType,
    sources: item.sources.slice(0, 2)
  };
}

function cap(list, n = HOME_SECTION_CAP) {
  return list.slice(0, n).map(toHomeItem);
}

function buildHomeSections(items) {
  const active = items.filter((i) => i.decision !== "Ignorieren");
  return {
    topTasks: cap(active),
    needsAttention: cap(items.filter((i) => i.decision === "Sofort reagieren")),
    opportunities: cap(items.filter((i) => i.priorityType === "chance")),
    risks: cap(items.filter((i) => i.priorityType === "risk")),
    situational: cap(items.filter((i) => i.decision === "Beobachten")),
    governmentPlans: cap(items.filter((i) => i.matchedFeatures.some((f) => f.type === "ausschuss"))),
    partyFaction: cap(items.filter((i) => i.matchedFeatures.some((f) => f.type === "partei"))),
    changedSinceLastVisit: []
  };
}

function buildDecisionMetrics(items, generatedAt) {
  const count = (pred) => items.filter(pred).length;
  return {
    total: items.length,
    react: count((i) => i.decision === "Sofort reagieren"),
    observe: count((i) => i.decision === "Beobachten"),
    ignore: count((i) => i.decision === "Ignorieren"),
    risks: count((i) => i.priorityType === "risk"),
    chances: count((i) => i.priorityType === "chance"),
    generatedAt
  };
}

// Deterministische Tages-Einschätzung (KEIN KI-Call). priorityStatus ∈
// {stable,changed,risk,chance} — bewusst NICHT das decision-Enum (kein `decision`-Key).
function buildHelmutAssessment(profile, items, generatedAt) {
  const top = items[0] || null;
  const reactCount = items.filter((i) => i.decision === "Sofort reagieren").length;
  const riskTop = items.find((i) => i.priorityType === "risk");
  const chanceTop = items.find((i) => i.priorityType === "chance");
  const priorityStatus = riskTop ? "risk" : chanceTop ? "chance" : "stable";
  const first = profile && (profile.firstName || String(profile.fullName || "").split(" ")[0]);
  return {
    greeting: first ? `Guten Tag, ${first}.` : "Guten Tag.",
    priorityStatus,
    assessment: top
      ? `${reactCount} Vorgang/Vorgänge mit akutem Handlungsbedarf, ${items.length} insgesamt bewertet.`
      : "Heute keine Vorgänge mit ausreichendem Mandatsbezug.",
    recommendation: top ? top.recommendedAction : "",
    whyImportant: top ? top.whyItMatters : "",
    risk: riskTop ? riskTop.riskNote : "",
    chance: chanceTop ? chanceTop.opportunityNote : "",
    generatedAt,
    engine: "v3",
    source: "deterministic"
  };
}

function buildPersonMentions(kos) {
  const seen = new Map();
  for (const ko of kos) {
    for (const name of [].concat(ko.mentioned_mps || [], ko.mentioned_people || [])) {
      const key = String(name || "").trim();
      if (!key) continue;
      seen.set(key, (seen.get(key) || 0) + 1);
    }
  }
  return [...seen.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([name, mentions]) => ({ name, mentions }));
}

// =============================================================================
// CurrentHelmutState — deterministischer Adapter fuer den Helmut-Stabschefstand.
// =============================================================================
// Formt aus BESTEHENDEN V3-Daten (verstandene knowledge_objects + deterministische
// decisions + echte Quellen) EINEN Tages-Zustand fuer den Helmut-Tab. Rein
// deterministisch: KEINE KI, KEIN Netzwerk, KEINE Client-Logik, KEINE neuen LLM-Calls.
//
// Grundregeln (wie das uebrige V3-Fundament):
//   - Nichts erfinden. Fehlt ein Wert -> "" / null / "unknown" / [] (ehrlich leer).
//   - Keine Demo-Texte, keine politischen Fallbacks, keine hartkodierte Partei,
//     keine personenspezifische Logik. contextChips/riskSummary etc. stammen NUR aus KO-/Decision-Daten.
//   - KEINE Kostenwerte: dieser Adapter liest ausschliesslich ko/decision/source —
//     das interne llm_usage/costEstimate wird nie beruehrt und kann nicht durchsickern.

const CONTEXT_CHIP_CAP = 4;   // wenige, praegnante Kontext-Chips (keine Schlagwortwolke)
const HELMUT_RELATED_CAP = 3; // "weitere relevante Vorgaenge": wenige, KEINE Monitoring-Liste

// Ranking-Gewichte fuer die Auswahl des primaeren Vorgangs (nur vorhandene V3-Signale).
const DECISION_RANK = { "Sofort reagieren": 2, "Beobachten": 1, "Ignorieren": 0 };
const QUALITY_RANK = { valid: 4, partial: 3, stale: 2, empty: 1, error: 0 };

// Kontext-Chips aus KO-Strukturdaten (ausschuesse -> policy_field -> parteien -> tags).
// Alles oeffentliche Vorgangs-Labels aus DEM KO (kein hartkodierter Wert), dedupliziert,
// klein gehalten. Keine Chips ableitbar -> [].
function buildContextChips(ko = {}) {
  const chips = [];
  const push = (v) => {
    const s = cleanStr(v);
    if (s && !chips.some((c) => c.toLowerCase() === s.toLowerCase())) chips.push(s);
  };
  for (const field of ["ausschuesse", "policy_field", "parteien", "tags"]) {
    for (const v of (Array.isArray(ko[field]) ? ko[field] : [])) push(v);
  }
  return chips.slice(0, CONTEXT_CHIP_CAP);
}

// Echte Quellen-IDs eines Vorgangs (aus den geladenen raw_documents). Nie geraten.
function helmutSourceIds(docs) {
  return (Array.isArray(docs) ? docs : []).map((d) => cleanStr(d && d.id)).filter(Boolean);
}

// sourceCount = die STORED Clustergroesse (source_document_count, echt), sonst die
// Anzahl echter Quellen-IDs. Kein Ratewert.
function helmutSourceCount(ko = {}, sourceIds = []) {
  const stored = Number(ko.source_document_count);
  if (Number.isFinite(stored) && stored > 0) return stored;
  return sourceIds.length;
}

// "Letzte Aktualisierung" aus ECHTEN Zeitstempeln: juengster von ko.updated_at und
// den published_at der Quellen. Kein Zeitstempel vorhanden -> null (nicht "jetzt").
function helmutLastUpdated(ko = {}, docs = []) {
  const candidates = [];
  if (ko.updated_at) candidates.push(ko.updated_at);
  if (ko.created_at) candidates.push(ko.created_at);
  for (const d of (Array.isArray(docs) ? docs : [])) {
    if (d && d.published_at) candidates.push(d.published_at);
  }
  const times = candidates.map((t) => ({ t, ms: Date.parse(t) })).filter((x) => Number.isFinite(x.ms));
  if (!times.length) return null;
  return times.sort((a, b) => b.ms - a.ms)[0].t;
}

// Ein Vorgangs-Item fuer den Helmut-Stand (primaryItem / items[]). withWhy fuellt
// zusaetzlich whyRelevant (nur fuer die "weiteren" Vorgaenge). Alles aus dem KO.
function toHelmutVorgangItem(ko = {}, docs = [], now = new Date(), opts = {}) {
  const sourceIds = helmutSourceIds(docs);
  const primarySource = buildSources(ko, docs)[0] || null;
  const item = {
    id: ko.vorgang_id || null,
    title: koTitle(ko, primarySource),
    displayTitle: cleanStr(ko.display_title),
    urgency: cleanStr(ko.zeitdruck) || "unknown",
    contextChips: buildContextChips(ko),
    sourceIds,
    sourceCount: helmutSourceCount(ko, sourceIds),
    lastUpdated: helmutLastUpdated(ko, docs),
    qualityStatus: deriveHelmutQualityStatus(ko, now)
  };
  if (opts.withWhy) item.whyRelevant = koWhy(ko);
  return item;
}

// Deterministische Rangordnung: Entscheidung > Score > Qualitaet > Aktualitaet >
// stabiler vorgang_id-Tiebreak. Nutzt ausschliesslich vorhandene V3-Signale.
function helmutCompare(a, b) {
  const dr = (DECISION_RANK[b.d.decision] || 0) - (DECISION_RANK[a.d.decision] || 0);
  if (dr) return dr;
  const sc = (Number(b.d.score) || 0) - (Number(a.d.score) || 0);
  if (sc) return sc;
  const qr = (QUALITY_RANK[b.quality] || 0) - (QUALITY_RANK[a.quality] || 0);
  if (qr) return qr;
  const at = Date.parse((a.ko.updated_at || a.ko.created_at) || "") || 0;
  const bt = Date.parse((b.ko.updated_at || b.ko.created_at) || "") || 0;
  if (bt !== at) return bt - at;
  return String(a.ko.vorgang_id || "").localeCompare(String(b.ko.vorgang_id || ""));
}

// Fresh-aware Primary-Auswahl (rein deterministisch, KEINE KI, KEIN erfundener Inhalt,
// KEIN Score-Boost). Behebt die "Score-Stickiness": ein alter High-Score-Vorgang bleibt
// sonst dauerhaft Primary, obwohl heute frische relevante Vorgaenge existieren.
//
// Regeln (bewusst konservativ):
//   1. Ist der Top-Kandidat FRISCH (angezeigtes Datum = heute, Europe/Berlin) ODER seine
//      Frische unbestimmbar -> alles bleibt wie bisher (kein Eingriff).
//   2. Ist der Top-Kandidat NACHWEISLICH STALE (bekanntes Datum != heute) -> suche den
//      besten FRISCHEN, relevanten, renderbaren Kandidaten aus der BEREITS sortierten
//      Liste (erster Treffer = staerkster, da helmutCompare-Ordnung). "relevant/renderbar"
//      = decision != 'Ignorieren' UND Qualitaet valid|partial (also NICHT empty/error/
//      pending -> kein leerer/erfundener Ersatz).
//   3. Kein passender frischer Kandidat -> Top bleibt Primary (Status darf ehrlich
//      "Nicht aktuell" bleiben).
// Rueckgabe: { primary, displaced } — displaced = der verdraengte alte Top (oder null),
// damit der Aufrufer ihn vorne in die "weiteren Vorgaenge" setzen kann (nicht verlieren).
// Die Stale-Definition ist IDENTISCH zum Tages-Frische-Guard (dateKeyInTimezone), damit
// Auswahl und Status konsistent sind.
function selectFreshAwarePrimary(candidates = [], now = new Date()) {
  const top = Array.isArray(candidates) ? candidates[0] : null;
  if (!top) return { primary: null, displaced: null };
  const todayKey = dateKeyInTimezone(now, DEFAULT_TIMEZONE);
  const dayKeyOf = (c) => dateKeyInTimezone(helmutLastUpdated(c.ko, c.docs), DEFAULT_TIMEZONE);
  const topKey = dayKeyOf(top);
  // Nur eingreifen, wenn der Top-Vorgang NACHWEISLICH stale ist (bekanntes Datum != heute).
  const topStale = Boolean(todayKey && topKey && topKey !== todayKey);
  if (!topStale) return { primary: top, displaced: null };
  const isFreshRelevant = (c) => {
    if (c === top) return false;
    if (c.d.decision === "Ignorieren") return false;         // nicht sichtbar relevant
    if (c.quality !== "valid" && c.quality !== "partial") return false; // kein leerer/pending Ersatz
    const key = dayKeyOf(c);
    return Boolean(key && todayKey && key === todayKey);      // heutiger Datenstand
  };
  const fresh = candidates.find(isFreshRelevant);
  return fresh ? { primary: fresh, displaced: top } : { primary: top, displaced: null };
}

// Fresh-aware Kandidaten-Vervollstaendigung (rein deterministisch, KEINE KI, KEIN
// erfundener Inhalt). Behebt die eigentliche Ursache hinter der Score-Stickiness:
//
// Der Read-Pfad bewertet nur die TOP-N verstandenen Vorgaenge (decideForUser ->
// matchProfileToKnowledgeObjects rankt nach PROFIL-AEHNLICHKEIT und kappt auf `limit`,
// z. B. 50). Ein FRISCHER, hoch relevanter Vorgang von HEUTE kann so unter dem Cut
// liegen — nicht wegen mangelnder Relevanz, sondern weil viele etablierte Vorgaenge
// eine hoehere Aehnlichkeit haben. Dann sieht selectFreshAwarePrimary den frischen
// Kandidaten NIE und der stale Dauervorgang bleibt Primary.
//
// Diese Funktion reicht die WENIGEN fehlenden FRISCHEN (heutiger Berliner Kalendertag)
// verstandenen Vorgaenge zusaetzlich als Kandidaten nach — ueber den uebergebenen
// `decide`-Callback bewertet (dieselbe deterministische Engine, 0 KI). Dedupliziert
// gegen die bereits bewerteten. Es wird NICHTS erfunden und NICHTS bevorzugt: ein
// frischer Vorgang, der auch nachbewertet 'Ignorieren'/leer bleibt, wird von
// selectFreshAwarePrimary weiterhin NICHT gewaehlt (kein irrelevanter Primary).
//
// Frische = dateKeyInTimezone(updated_at||created_at) == heute (identische Definition
// wie der Tages-Frische-Guard). Ist "heute" unbestimmbar (defekte Date/Zone) -> KEINE
// Augmentierung (ehrlich: keine Frische behaupten).
function augmentFreshCandidates(understood = [], decisions = [], decide = null, now = new Date()) {
  const base = Array.isArray(decisions) ? decisions : [];
  if (typeof decide !== "function" || !Array.isArray(understood) || !understood.length) return base;
  const todayKey = dateKeyInTimezone(now, DEFAULT_TIMEZONE);
  if (!todayKey) return base; // keine Frische-Aussage moeglich -> nichts nachreichen
  const decidedIds = new Set(base.map((d) => d && d.knowledge_object_id).filter(Boolean));
  const freshMissing = understood.filter((k) =>
    k && k.id && !decidedIds.has(k.id) &&
    dateKeyInTimezone(k.updated_at || k.created_at, DEFAULT_TIMEZONE) === todayKey
  );
  if (!freshMissing.length) return base;
  const extra = (decide(freshMissing) || [])
    .filter((d) => d && d.knowledge_object_id && !decidedIds.has(d.knowledge_object_id));
  return extra.length ? base.concat(extra) : base;
}

// Read-only Auswahl-Diagnose fuer /api/app/start?debugPrimary=1 (KEINE KI, KEINE
// Secrets, KEINE Dokumenttexte, KEINE Kostenwerte, KEINE privaten PII). Erklaert aus
// dem ECHTEN Read-Pfad, warum ein bestimmter Vorgang Primary wurde und was mit den
// frischen Vorgaengen von heute passiert ist (geladen -> understood -> vor/nach Augment
// -> eligible?). Rein technische Auswahl-Felder (vorgang_id, oeffentlicher Titel, Datum,
// decision/score, freshness/renderable/reason) — nichts, was der Abgeordnete nicht ohnehin
// sieht. Deterministisch, spiegelt exakt selectFreshAwarePrimary/deriveHelmutQualityStatus.
function buildPrimarySelectionDebug({ knowledgeObjectsLoaded = null, understood = [], decisionsBefore = [], decisionsAfter = [], kosById = {}, sourcesByVorgang = {}, now = new Date(), state = null } = {}) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const todayKey = dateKeyInTimezone(nowDate, DEFAULT_TIMEZONE);
  const getKo = (id) => (kosById instanceof Map ? kosById.get(id) : kosById[id]);
  const docsOf = (ko) => (ko && sourcesByVorgang && sourcesByVorgang[ko.vorgang_id]) || [];
  const beforeIds = new Set((Array.isArray(decisionsBefore) ? decisionsBefore : []).map((d) => d && d.knowledge_object_id).filter(Boolean));
  const afterIds = new Set((Array.isArray(decisionsAfter) ? decisionsAfter : []).map((d) => d && d.knowledge_object_id).filter(Boolean));
  const decByKoId = new Map((Array.isArray(decisionsAfter) ? decisionsAfter : []).filter((d) => d && d.knowledge_object_id).map((d) => [d.knowledge_object_id, d]));

  // Frische EXAKT wie selectFreshAwarePrimary (juengster echter Zeitstempel == heute).
  const freshOf = (ko) => {
    const key = dateKeyInTimezone(helmutLastUpdated(ko, docsOf(ko)), DEFAULT_TIMEZONE);
    return Boolean(key && todayKey && key === todayKey);
  };

  // Kandidatenliste + gewaehlter Primary rekonstruieren (identisch zu buildCurrentHelmutState).
  const candidatesAfter = (Array.isArray(decisionsAfter) ? decisionsAfter : [])
    .map((d) => { const ko = getKo(d.knowledge_object_id); return ko ? { d, ko, docs: docsOf(ko), quality: deriveHelmutQualityStatus(ko, nowDate) } : null; })
    .filter(Boolean)
    .sort(helmutCompare);
  const { primary, displaced } = selectFreshAwarePrimary(candidatesAfter, nowDate);
  const top = candidatesAfter[0] || null;

  const annotate = (ko) => {
    const quality = deriveHelmutQualityStatus(ko, nowDate);
    const renderable = quality === "valid" || quality === "partial";
    const fresh = freshOf(ko);
    const dec = decByKoId.get(ko.id) || null;
    const decision = dec ? dec.decision : null;
    const inAfter = afterIds.has(ko.id);
    let eligible = false, reason = null;
    if (!fresh) reason = "nicht frisch (Datenstand nicht heute, Europe/Berlin)";
    else if (!inAfter) reason = "nicht in Kandidatenliste (weder Top-50 noch Augment)";
    else if (!dec) reason = "keine Decision vorhanden";
    else if (decision === "Ignorieren") reason = "Decision 'Ignorieren' (Score < 40, unter Relevanzschwelle)";
    else if (!renderable) reason = `nicht renderbar (quality=${quality}: leer/pending/error)`;
    else eligible = true;
    return {
      vorgang_id: ko.vorgang_id || null,
      title: koTitle(ko),
      created_at: ko.created_at || null,
      updated_at: ko.updated_at || null,
      understanding_status: ko.understanding_status || null,
      status: ko.status || null,
      decision,
      score: dec ? dec.score : null,
      fresh,
      renderable,
      inDecisionsBeforeAugment: beforeIds.has(ko.id),
      inDecisionsAfterAugment: inAfter,
      eligibleForFreshPrimary: eligible,
      reasonIfRejected: eligible ? null : reason
    };
  };

  const freshUnderstood = (Array.isArray(understood) ? understood : []).filter((ko) => ko && ko.id && freshOf(ko));
  const freshAnnotated = freshUnderstood.map(annotate);

  const briefCand = (c) => (c && c.ko) ? {
    vorgang_id: c.ko.vorgang_id || null,
    title: koTitle(c.ko),
    created_at: c.ko.created_at || null,
    updated_at: c.ko.updated_at || null,
    freshness: freshOf(c.ko) ? "fresh" : "stale",
    decision: c.d ? c.d.decision : null,
    score: c.d ? c.d.score : null
  } : null;

  const selectedBecause = !primary ? "kein Kandidat vorhanden"
    : displaced ? "frischer relevanter Vorgang (Datenstand heute) hat den stale Top-Vorgang verdraengt"
    : (top && freshOf(top.ko)) ? "Top-Vorgang (Entscheidung>Score>Qualitaet) ist frisch -> unveraendert Primary"
    : "kein frischer relevanter/renderbarer Kandidat eligible -> stale Top bleibt Primary (Header zeigt 'Letzter Stand')";

  const selectedPrimary = primary ? { ...briefCand(primary), selectedBecause } : null;

  return {
    currentHelmutStateStatus: state ? state.status : null,
    generatedAt: state ? state.generatedAt : null,
    selectedPrimary,
    previousTopCandidate: displaced ? briefCand(displaced) : null,
    candidateStats: {
      knowledgeObjectsLoaded,
      understoodCount: (Array.isArray(understood) ? understood : []).length,
      decisionCountBeforeAugment: (Array.isArray(decisionsBefore) ? decisionsBefore : []).length,
      decisionCountAfterAugment: (Array.isArray(decisionsAfter) ? decisionsAfter : []).length,
      freshUnderstoodCount: freshUnderstood.length,
      freshDecisionCountBeforeAugment: freshUnderstood.filter((ko) => beforeIds.has(ko.id)).length,
      freshDecisionCountAfterAugment: freshUnderstood.filter((ko) => afterIds.has(ko.id)).length,
      freshEligibleCount: freshAnnotated.filter((a) => a.eligibleForFreshPrimary).length,
      freshRejectedCount: freshAnnotated.filter((a) => !a.eligibleForFreshPrimary).length
    },
    freshCandidates: freshAnnotated.slice(0, 10)
  };
}

// Interner Qualitaets-Leitzustand -> OEFFENTLICHER Status (Mapping NUR hier, nie im
// Frontend). valid/partial => "fresh" (Inhalt vorhanden), sonst 1:1 ehrlich.
function publicStatusFromQuality(q) {
  if (q === "error") return "error";
  if (q === "empty") return "empty";
  if (q === "stale") return "stale";
  return "fresh"; // valid | partial
}

// Ehrlicher Leerzustand: dieselbe Struktur wie der befuellte State, nur leer/unknown.
// emptyState (Sprint 5, additiv/optional): unterscheidbarer Helmut-Leerzustand mit
// Frische-/Qualitaetssignal (gap | stale | quiet=kein-handlungsbedarf).
function emptyCurrentHelmutState({ generatedAt, briefingType, profileId = null, tenantId = null } = {}, emptyState = null) {
  const out = {
    tenantId, profileId, generatedAt, briefingType,
    status: "empty",
    headline: "", recommendation: "", urgency: "unknown",
    contextChips: [], whyItMatters: "",
    riskOfNoAction: "", riskSummary: "", riskLevel: "unknown",
    opportunitySummary: "", opportunityLevel: "unknown",
    recommendedCommunication: { communicationLine: "", recommendedChannel: "unknown", recommendedFormat: "unknown", suggestedOutputs: [] },
    actionItems: [],
    primaryVorgangId: null, primaryItem: null,
    relatedVorgangIds: [], items: [],
    sourceIds: [],
    sourcesSummary: { sourceCount: 0, qualityStatus: "empty", lastUpdated: null, sourceIds: [] },
    qualityStatus: "empty", staleState: false, errorState: false
  };
  if (emptyState) out.emptyState = emptyState;
  return out;
}

// KO-Werte (fuer die Frische-Bewertung des Leerzustands) aus Map ODER Objekt.
function kosValuesForFreshness(kosById) {
  if (!kosById) return [];
  if (kosById instanceof Map) return [...kosById.values()];
  return Object.values(kosById);
}

// --- Haupt-Adapter: CurrentHelmutState --------------------------------------
// Input = derselbe V3-Kontext wie toBriefingContractV3 (profile, decisions, kosById,
// sourcesByVorgang). Output = EIN CurrentHelmutState-Objekt (siehe Zielstruktur).
// Rein deterministisch, 0 KI, keine Kostenwerte.
// frischeFenster (optional, additiv): der verbindliche Briefingfenster-Anfang aus
// `briefing-frische.js` — „neu seit dem letzten erfolgreichen Morgenbriefing".
// Wird er UEBERGEBEN, ersetzt er den bisherigen reinen Kalendertags-Guard: eine
// Meldung vom spaeten Vorabend ist dann im Morgenbriefing zu Recht frisch, behaelt
// aber ihr TATSAECHLICHES Datum. Fehlt er, bleibt das Verhalten unveraendert
// (Rueckwaertsvertraeglichkeit: Kalendertag Europe/Berlin).
function buildCurrentHelmutState({ profile = {}, decisions = [], kosById = {}, sourcesByVorgang = {}, now = new Date(), tenantId = null, briefingType = "daily", knowledgeObjects = null, frischeFenster = null } = {}) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const generatedAt = nowDate.toISOString();
  // Defensiv normalisieren: ein ungueltiger/roher Slot faellt hier sicher auf 'daily'
  // (nie Crash, keine erfundene Tageszeit). Nur Label/Sprache — keine Datenaenderung.
  const slot = normalizeBriefingType(briefingType);
  const getKo = (id) => (kosById instanceof Map ? kosById.get(id) : kosById[id]);
  const profileId = cleanStr(profile && (profile.id || profile.userId || profile.politicianId)) || null;
  const tid = cleanStr(tenantId || (profile && (profile.tenantId || profile.tenant_id || profile.mandateId))) || null;
  const meta = { generatedAt, briefingType: slot, profileId, tenantId: tid };

  // Kandidaten = Entscheidungen mit vorhandenem KO, deterministisch nach Helmut-Rang.
  const candidates = (Array.isArray(decisions) ? decisions : [])
    .map((d) => {
      const ko = d && getKo(d.knowledge_object_id);
      if (!ko) return null;
      const docs = (sourcesByVorgang && sourcesByVorgang[ko.vorgang_id]) || [];
      return { d, ko, docs, quality: deriveHelmutQualityStatus(ko, nowDate) };
    })
    .filter(Boolean)
    .sort(helmutCompare);

  // Sprint 5 (flag-gesichert): Helmut priorisiert HANDLUNGSFAEHIGKEIT. Bei aktivem
  // Scoring wird primaer nach actionability sortiert, Tie-Break = die bestehende
  // deterministische Rangordnung (helmutCompare). Default aus -> unveraendert.
  if (scoring.scoringActive() && candidates.length > 1) {
    const act = new Map(candidates.map((c) => [c, scoring.actionability(c.ko, profile).score]));
    candidates.sort((x, y) => (act.get(y) - act.get(x)) || helmutCompare(x, y));
  }

  if (!candidates.length) {
    // Unterscheidbarer Helmut-Leerzustand: Frische aus ALLEN verstandenen KOs (nicht nur
    // den profilgematchten Entscheidungen) -> gap (keine Daten) / stale (alt) / quiet
    // (frisch, aber kein Handlungsansatz fuers Mandat). Im Read-Pfad 'keine-treffer' ist
    // kosById bewusst leer, die breite Menge kommt als knowledgeObjects (wie beim Radar) --
    // sonst meldete Helmut faelschlich 'gap', obwohl frische Vorgaenge ohne Mandatsbezug vorliegen.
    const freshnessKos = (Array.isArray(knowledgeObjects) && knowledgeObjects.length)
      ? knowledgeObjects
      : kosValuesForFreshness(kosById);
    const es = scoring.scoringActive()
      ? scoring.tabEmptyState("helmut", { kos: freshnessKos, hasRankedItems: false, now: nowDate.getTime() })
      : null;
    return emptyCurrentHelmutState(meta, es);
  }

  // Fresh-aware Auswahl: ein STALE High-Score-Top wird durch den besten frischen,
  // relevanten Vorgang ersetzt, falls vorhanden (sonst unveraendert). displaced =
  // der verdraengte alte Top -> vorne in die weiteren Vorgaenge, damit er nicht verloren geht.
  const { primary, displaced } = selectFreshAwarePrimary(candidates, nowDate);
  // Weitere relevante Vorgaenge: NICHT-ignorierte, ohne den Primary, wenige (keine
  // Monitoring-Liste). Der verdraengte alte Top steht VORNE (dedupliziert, kein Doppel).
  const relatedRest = candidates.filter((c) => c !== primary && c !== displaced && c.d.decision !== "Ignorieren");
  const related = (displaced ? [displaced, ...relatedRest] : relatedRest).slice(0, HELMUT_RELATED_CAP);

  const pKo = primary.ko, pDec = primary.d, pDocs = primary.docs;
  const staff = koStaffFields(pKo, nowDate);                       // strukturierte Stabschef-Werte
  const primaryItem = toHelmutVorgangItem(pKo, pDocs, nowDate, { withWhy: false });
  const items = related.map((c) => toHelmutVorgangItem(c.ko, c.docs, nowDate, { withWhy: true }));

  const qualityStatus = primary.quality;                          // Tages-Leitzustand = wichtigster Vorgang
  const sourceIds = primaryItem.sourceIds;

  // Ehrlicher Tages-Frische-Guard (KEINE KI, KEINE neuen Daten, KEINE Persistenz):
  // Der Slot-NAME kommt weiterhin aus der aktuellen Uhrzeit — der oeffentliche STATUS
  // aber spiegelt die Frische der TATSAECHLICH angezeigten Daten. Ist der im Kopf
  // gezeigte Datenstand NICHT vom heutigen Kalendertag (Europe/Berlin), darf das
  // Badge nicht "Aktuell" (fresh) sein -> vorhandener 'stale'-Status. Nur HERABSTUFEN
  // (fresh -> stale), nie hochstufen; qualityStatus (Feld-Vollstaendigkeit) bleibt
  // unveraendert. displayedTs = exakt der im Header gerenderte Zeitpunkt.
  const baseStatus = publicStatusFromQuality(qualityStatus);
  const displayedTs = primaryItem.lastUpdated || generatedAt;
  const todayKey = dateKeyInTimezone(nowDate, DEFAULT_TIMEZONE);
  const dataKey = dateKeyInTimezone(displayedTs, DEFAULT_TIMEZONE);
  // Mit Briefingfenster: frisch = im Fenster seit dem letzten erfolgreichen
  // Morgenbriefing (schliesst den spaeten Vorabend ein). Ohne Fenster: bisheriger
  // Kalendertags-Guard. In BEIDEN Faellen wird nur HERABGESTUFT, nie hochgestuft.
  const fensterStart = frischeFenster && frischeFenster.start ? Date.parse(frischeFenster.start) : NaN;
  const displayedMs = Date.parse(displayedTs);
  const dayStale = Number.isFinite(fensterStart)
    ? Boolean(Number.isFinite(displayedMs) && displayedMs < fensterStart)
    : Boolean(todayKey && dataKey && dataKey !== todayKey);
  const publicStatus = (baseStatus === "fresh" && dayStale) ? "stale" : baseStatus;
  // Meldungsklassen (Vertragspunkte 3 und 4): additiv am Item, ohne jedes Datum
  // zu veraendern und ohne Umsortierung. Ohne Fenster bleibt alles unveraendert.
  const geordnet = frischeFenster && frischeFenster.start
    ? briefingFrische.ordneMeldungen([primaryItem, ...items], frischeFenster, nowDate)
    : null;
  const primaerGeordnet = geordnet ? geordnet.items[0] : primaryItem;
  const itemsGeordnet = geordnet ? geordnet.items.slice(1) : items;

  return {
    tenantId: tid,
    profileId,
    generatedAt,
    briefingType: slot,
    status: publicStatus,
    headline: primaryItem.displayTitle || primaryItem.title,
    recommendation: koAction(pKo),
    urgency: primaryItem.urgency,
    contextChips: primaryItem.contextChips,
    whyItMatters: koWhy(pKo),
    // Risiko/Chance: Prosa + strukturierte Stufe aus dem KO; riskSummary = das
    // wichtigste Risiko-Label der Entscheidung (kurz), NICHT erfunden.
    riskOfNoAction: staff.riskOfNoAction,
    riskSummary: cleanStr(pDec.risk) || cleanStr((Array.isArray(pKo.risiken) ? pKo.risiken[0] : "")),
    riskLevel: staff.riskLevel,
    opportunitySummary: staff.opportunitySummary,
    opportunityLevel: staff.opportunityLevel,
    recommendedCommunication: staff.recommendedCommunication,
    actionItems: staff.actionItems,
    primaryVorgangId: pKo.vorgang_id || null,
    primaryItem: primaerGeordnet,
    relatedVorgangIds: items.map((i) => i.id).filter(Boolean),
    items: itemsGeordnet,
    // Additiv: die Einordnung der gezeigten Vorgaenge nach dem Frischevertrag.
    // Null, solange kein Fenster uebergeben wird (unveraendertes Altverhalten).
    frische: geordnet
      ? { fenster: frischeFenster, kennzahlen: geordnet.kennzahlen }
      : null,
    sourceIds,
    sourcesSummary: {
      sourceCount: primaryItem.sourceCount,
      qualityStatus,
      lastUpdated: primaryItem.lastUpdated,
      sourceIds
    },
    qualityStatus,
    // staleState folgt dem oeffentlichen Status (inkl. Tages-Frische-Guard), damit
    // Kopf-Badge und staleState konsistent sind (alte Daten -> stale, auch bei valid).
    staleState: publicStatus === "stale",
    errorState: qualityStatus === "error"
  };
}

// --- Haupteinstieg: V3-Daten -> V2-Vertrag ----------------------------------
// decisions: Zeilen aus decisions.decideForUser / der decisions-Tabelle
//   (jede mit knowledge_object_id, score, decision, priority_type, chance, risk,
//    matched_features). kosById: id -> KO. sourcesByVorgang: vorgang_id -> docs[].
// briefingType (optional): der slot-aware Read-Pfad reicht hier den abgeleiteten/
// override-Slot durch (morning|midday|evening|daily). Fehlt er -> buildCurrentHelmutState
// defaultet rueckwaertsverträglich auf 'daily'. REIN sprachlich/Label — KEINE Datenaenderung,
// KEINE Frische-Aussage, KEIN KI-Call.
function toBriefingContractV3({ profile = {}, decisions = [], kosById = {}, sourcesByVorgang = {}, now = new Date(), reason = null, briefingType, knowledgeObjects = null, frischeFenster = null } = {}) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const generatedAt = nowDate.toISOString();
  const getKo = (id) => (kosById instanceof Map ? kosById.get(id) : kosById[id]);

  // Nach Score absteigend — höchste Relevanz zuerst (Position 1 = höchster Score).
  const ordered = [...(Array.isArray(decisions) ? decisions : [])]
    .filter((d) => d && d.knowledge_object_id && getKo(d.knowledge_object_id))
    .sort((a, b) => (b.score - a.score) || String(a.knowledge_object_id).localeCompare(String(b.knowledge_object_id)));

  const items = [];
  const recommendations = [];
  const usedKos = [];
  for (const d of ordered) {
    const ko = getKo(d.knowledge_object_id);
    const sources = buildSources(ko, sourcesByVorgang[ko.vorgang_id]);
    items.push(toItem(d, ko, sources));
    recommendations.push(toRecommendation(d, ko, sources, nowDate));
    usedKos.push(ko);
  }

  const assessment = buildHelmutAssessment(profile, items, generatedAt);
  // Hero-Felder (bestehender Frontend-Vertrag) aus den bewerteten Items ableiten —
  // kein separates Ranking, keine KI. themeOfDay = wichtigster nicht-ignorierter
  // Vorgang; riskOfDay/chanceOfDay = wichtigstes Risiko/Chance-Item.
  const themeOfDay = items.find((i) => i.decision !== "Ignorieren") || items[0] || null;
  const riskOfDay = items.find((i) => i.priorityType === "risk") || null;
  const chanceOfDay = items.find((i) => i.priorityType === "chance") || null;

  return {
    // Leerer V3-Zustand ist EXPLIZIT (available:false + reason) — kein stiller
    // V2-Fallback. Das Frontend kann daraus einen klaren Leerzustand rendern.
    available: items.length > 0,
    reason: items.length ? null : (reason || "keine-vorgaenge"),
    engine: "v3",
    items,
    personalizedRecommendations: recommendations,
    situationalBriefing: items.filter((i) => i.decision === "Beobachten"),
    homeSections: buildHomeSections(items),
    helmutAssessment: assessment,
    executiveSummary: assessment.assessment,
    themeOfDay,
    riskOfDay,
    chanceOfDay,
    decisionMetrics: buildDecisionMetrics(items, generatedAt),
    personMentions: buildPersonMentions(usedKos),
    // Additiv (rueckwaertsverträglich): der deterministische Helmut-Stabschefstand.
    // Bestehende Vertragsfelder bleiben unveraendert. Enthaelt KEINE Kostenwerte.
    currentHelmutState: buildCurrentHelmutState({ profile, decisions: ordered, kosById, sourcesByVorgang, knowledgeObjects, now: nowDate, frischeFenster, ...(briefingType !== undefined ? { briefingType } : {}) }),
    // Additiv: der Radar-Lesevertrag (Über dich / Umfeld / Dynamiken / Artikel).
    // Deterministisch, 0 KI, keine Kostenwerte. Die Erwaehnungssuche nutzt die BREITE
    // Menge verstandener KOs (knowledgeObjects), damit Eigenerwaehnungen nicht am
    // Top-N-Relevanz-Cut verloren gehen; fehlt sie -> Fallback auf die bewerteten KOs.
    currentRadarState: radarState.buildCurrentRadarState({ profile, decisions: ordered, kosById, sourcesByVorgang, knowledgeObjects, now: nowDate, reason }),
    status: items.length ? "Aktuell" : "Keine aktuellen Vorgänge",
    generatedAt
  };
}

// Bequemer Read-Pfad-Einstieg: aus Profil + verstandenen KOs (+ Quellen) direkt
// den Vertrag bauen (Matching + Decision intern, deterministisch, 0 KI).
function buildContractFromKnowledgeObjects(profile = {}, knowledgeObjects = [], sourcesByVorgang = {}, opts = {}) {
  const userId = opts.userId || profile.id || profile.userId || profile.politicianId;
  const decisions = decisionsEngine.decideForUser(profile, knowledgeObjects, { userId, limit: opts.limit || 50 });
  const kosById = {};
  for (const ko of knowledgeObjects) if (ko && ko.id) kosById[ko.id] = ko;
  return toBriefingContractV3({ profile, decisions, kosById, sourcesByVorgang, now: opts.now || new Date(), reason: opts.reason || null });
}

module.exports = {
  toBriefingContractV3,
  buildContractFromKnowledgeObjects,
  buildCurrentHelmutState,
  priorityLabelFromScore,
  actionTypeFromDecision,
  buildSources,
  koTitle,
  koSummary,
  koStaffFields,
  deriveHelmutQualityStatus,
  selectFreshAwarePrimary,
  augmentFreshCandidates,
  buildPrimarySelectionDebug
};
