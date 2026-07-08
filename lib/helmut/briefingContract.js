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
const { HELMUT_LEVEL_ENUM, HELMUT_COMM_CHANNEL_ENUM, HELMUT_COMM_FORMAT_ENUM,
  HELMUT_ACTION_PRIORITY_ENUM, HELMUT_ACTION_TYPE_ENUM } = require("./understanding-schema");

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
  if (present === 0) return "empty";
  const ts = Date.parse(ko.updated_at || ko.created_at || "");
  const ref = (now instanceof Date ? now : new Date(now)).getTime();
  if (ts && Number.isFinite(ref) && ref - ts > STAFF_STALE_DAYS * 86400000) return "stale";
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

// --- Haupteinstieg: V3-Daten -> V2-Vertrag ----------------------------------
// decisions: Zeilen aus decisions.decideForUser / der decisions-Tabelle
//   (jede mit knowledge_object_id, score, decision, priority_type, chance, risk,
//    matched_features). kosById: id -> KO. sourcesByVorgang: vorgang_id -> docs[].
function toBriefingContractV3({ profile = {}, decisions = [], kosById = {}, sourcesByVorgang = {}, now = new Date(), reason = null } = {}) {
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
  priorityLabelFromScore,
  actionTypeFromDecision,
  buildSources,
  koTitle,
  koSummary,
  koStaffFields,
  deriveHelmutQualityStatus
};
