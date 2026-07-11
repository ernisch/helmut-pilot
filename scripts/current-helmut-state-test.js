"use strict";

// Helmut Core V3 — Tests fuer den CurrentHelmutState-Adapter (buildCurrentHelmutState).
// KEIN Netz, KEINE KI. Prueft, dass der Adapter aus BESTEHENDEN V3-Daten deterministisch
// die geforderte Stabschefstand-Struktur erzeugt -- ohne erfundene Inhalte, ohne
// Kostenwerte, rueckwaertsverträglich (currentHelmutState ist additiv im /api/app/start-Vertrag).

const contract = require("../lib/helmut/briefingContract");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const NOW = new Date("2026-07-07T08:30:00Z");
const profile = { id: "u-1", tenantId: "t-1", firstName: "Test", party: "SPD", committee: "Gesundheit", focusTopics: ["Pflege"] };

// Vollstaendiger, verstandener Primaervorgang (strukturierte Stabschef-Werte gesetzt).
const koPrimary = {
  id: "ko-vg-1", vorgang_id: "vg-1", status: "neu", understanding_status: "complete",
  display_title: "Bundesregierung legt Pflegereform vor", headline: "Pflegereform",
  was_ist_passiert: "Reform vorgestellt.", warum_wichtig: "Millionen betroffen.",
  why_relevant: "Betrifft deinen Ausschuss Gesundheit.", recommendation: "Heute nicht zuspitzen.",
  handlungsempfehlung: "Intern abstimmen.",
  ausschuesse: ["Gesundheit"], policy_field: ["Pflege"], parteien: ["SPD"], tags: ["Reform"],
  risiken: ["Leistungskuerzung"], chancen: ["Profilierung"], zeitdruck: "hoch",
  confidence_score: 85, source_document_count: 18,
  risk_of_no_action: "Ohne Reaktion droht uneinheitliche Kommunikation.",
  opportunity_summary: "Soziale Entlastung glaubwuerdig besetzen.",
  risk_level: "high", opportunity_level: "high",
  recommended_communication_struct: { communicationLine: "Wir beobachten genau.", recommendedChannel: "press", recommendedFormat: "pressRelease", suggestedOutputs: ["statement", "qa"] },
  action_items_struct: [{ title: "Linie intern abstimmen", description: "Mit Fraktion", dueHint: "bis 14 Uhr", priority: "high", actionType: "alignInternally" }],
  updated_at: "2026-07-07T07:45:00Z"
};
const koRelated = {
  id: "ko-vg-2", vorgang_id: "vg-2", status: "neu", understanding_status: "complete",
  display_title: "Laender fordern Klima-Foerdermittel", was_ist_passiert: "Programm angekuendigt.",
  warum_wichtig: "Mittel fuer Kommunen.", why_relevant: "Chance fuer deinen Wahlkreis.",
  ausschuesse: ["Gesundheit"], parteien: ["SPD"], tags: ["Klima"], chancen: ["Foerdermittel"],
  zeitdruck: "mittel", confidence_score: 70, source_document_count: 4, updated_at: "2026-07-06T09:00:00Z"
};
const sources = {
  "vg-1": [
    { id: "rd-a", url: "https://bmg.bund.de/pflege", source_name: "BMG", link_type: "direct", published_at: "2026-07-07T07:45:00Z" },
    { id: "rd-b", url: "https://x.de/2", source_name: "X", published_at: "2026-07-06T10:00:00Z" }
  ],
  "vg-2": [{ id: "rd-c", url: "https://y.de", source_name: "Y", published_at: "2026-07-06T09:00:00Z" }]
};

const decisions = [
  { knowledge_object_id: "ko-vg-1", vorgang_id: "vg-1", score: 88, decision: "Sofort reagieren", priority_type: "risk", risk: "Leistungskuerzung", chance: "Profilierung", matched_features: [{ type: "ausschuss", value: "Gesundheit" }] },
  { knowledge_object_id: "ko-vg-2", vorgang_id: "vg-2", score: 62, decision: "Sofort reagieren", priority_type: "chance", risk: "", chance: "Foerdermittel", matched_features: [{ type: "partei", value: "SPD" }] }
];
const kosById = { "ko-vg-1": koPrimary, "ko-vg-2": koRelated };

const state = contract.buildCurrentHelmutState({ profile, decisions, kosById, sourcesByVorgang: sources, now: NOW });

// --- 1) Vollstaendige Struktur bei vollstaendigen Daten ---------------------
const TOP_KEYS = ["tenantId", "profileId", "generatedAt", "briefingType", "status", "headline",
  "recommendation", "urgency", "contextChips", "whyItMatters", "riskOfNoAction", "riskSummary",
  "riskLevel", "opportunitySummary", "opportunityLevel", "recommendedCommunication", "actionItems",
  "primaryVorgangId", "primaryItem", "relatedVorgangIds", "items", "sourceIds", "sourcesSummary",
  "qualityStatus", "staleState", "errorState"];
check("CurrentHelmutState traegt alle Top-Level-Felder",
  TOP_KEYS.every((k) => k in state), TOP_KEYS.filter((k) => !(k in state)).join(","));

// --- 2) Kopf/Assessment aus V3-Motor (keine Demo-Texte) ---------------------
check("tenantId/profileId aus Kontext (nicht erfunden)", state.tenantId === "t-1" && state.profileId === "u-1");
check("headline aus display_title des Primaervorgangs", state.headline === "Bundesregierung legt Pflegereform vor");
check("recommendation aus KO (recommendation/handlungsempfehlung)", state.recommendation === "Heute nicht zuspitzen.");
check("urgency aus zeitdruck", state.urgency === "hoch");
check("whyItMatters aus why_relevant", state.whyItMatters === "Betrifft deinen Ausschuss Gesundheit.");
check("contextChips aus KO-Strukturdaten (ausschuesse/policy_field/parteien/tags), gekappt",
  Array.isArray(state.contextChips) && state.contextChips.length <= 4 &&
  state.contextChips[0] === "Gesundheit");

// --- 3) Risiko / Chance / Kommunikation -------------------------------------
check("riskOfNoAction aus KO-Prosa", state.riskOfNoAction === "Ohne Reaktion droht uneinheitliche Kommunikation.");
check("riskSummary aus Entscheidungs-Risiko-Label", state.riskSummary === "Leistungskuerzung");
check("riskLevel durchgereicht", state.riskLevel === "high");
check("opportunitySummary aus KO-Prosa", state.opportunitySummary === "Soziale Entlastung glaubwuerdig besetzen.");
check("opportunityLevel durchgereicht", state.opportunityLevel === "high");
check("recommendedCommunication bleibt strukturiert",
  state.recommendedCommunication && typeof state.recommendedCommunication === "object" &&
  state.recommendedCommunication.communicationLine === "Wir beobachten genau." &&
  state.recommendedCommunication.recommendedChannel === "press" &&
  state.recommendedCommunication.recommendedFormat === "pressRelease" &&
  JSON.stringify(state.recommendedCommunication.suggestedOutputs) === JSON.stringify(["statement", "qa"]));

// --- 4) actionItems strukturiert --------------------------------------------
check("actionItems bleiben strukturiert (title/description/dueHint/priority/actionType)",
  Array.isArray(state.actionItems) && state.actionItems.length === 1 &&
  ["title", "description", "dueHint", "priority", "actionType"].every((k) => k in state.actionItems[0]) &&
  state.actionItems[0].title === "Linie intern abstimmen" && state.actionItems[0].actionType === "alignInternally");

// --- 5) Primaervorgang + weitere Vorgaenge ----------------------------------
check("primaryVorgangId = wichtigster Vorgang (React + hoechster Score)", state.primaryVorgangId === "vg-1");
const PRIMARY_ITEM_KEYS = ["id", "title", "displayTitle", "urgency", "contextChips", "sourceIds", "sourceCount", "lastUpdated", "qualityStatus"];
check("primaryItem traegt alle geforderten Felder",
  state.primaryItem && PRIMARY_ITEM_KEYS.every((k) => k in state.primaryItem),
  state.primaryItem && PRIMARY_ITEM_KEYS.filter((k) => !(k in state.primaryItem)).join(","));
check("primaryItem OHNE whyRelevant (nur weitere Vorgaenge tragen es)", !("whyRelevant" in state.primaryItem));
const ITEM_KEYS = [...PRIMARY_ITEM_KEYS, "whyRelevant"];
check("items = weitere relevante Vorgaenge, wenige (<=3), korrekt geformt",
  Array.isArray(state.items) && state.items.length === 1 && state.items.length <= 3 &&
  ITEM_KEYS.every((k) => k in state.items[0]) && state.items[0].id === "vg-2");
check("relatedVorgangIds spiegeln die items", JSON.stringify(state.relatedVorgangIds) === JSON.stringify(["vg-2"]));
check("primaerer Vorgang NICHT in items dupliziert", !state.items.some((i) => i.id === "vg-1"));

// --- 6) sourcesSummary aus echten Quellen -----------------------------------
check("sourceIds aus echten raw_documents", JSON.stringify(state.sourceIds) === JSON.stringify(["rd-a", "rd-b"]));
check("sourcesSummary.sourceCount aus source_document_count (nicht geraten)", state.sourcesSummary.sourceCount === 18);
check("sourcesSummary.lastUpdated = juengster echter Zeitstempel", state.sourcesSummary.lastUpdated === "2026-07-07T07:45:00Z");
check("sourcesSummary.sourceIds == top-level sourceIds", JSON.stringify(state.sourcesSummary.sourceIds) === JSON.stringify(state.sourceIds));

// --- 7) Status / Qualitaet / stale / error ----------------------------------
check("qualityStatus = Leitzustand des Primaervorgangs (valid)", state.qualityStatus === "valid");
check("status oeffentlich gemappt (valid -> fresh)", state.status === "fresh");
check("staleState/errorState korrekt false bei valid", state.staleState === false && state.errorState === false);

// stale: alter Primaervorgang
const stateStale = contract.buildCurrentHelmutState({
  profile, kosById: { "ko-vg-1": { ...koPrimary, updated_at: "2026-01-01T00:00:00Z" } },
  decisions: [decisions[0]], sourcesByVorgang: sources, now: NOW
});
check("stale: alter Vorgang -> qualityStatus stale, status stale, staleState true",
  stateStale.qualityStatus === "stale" && stateStale.status === "stale" && stateStale.staleState === true && stateStale.errorState === false);

// error: understanding failed
const stateError = contract.buildCurrentHelmutState({
  profile, kosById: { "ko-vg-1": { ...koPrimary, understanding_status: "failed" } },
  decisions: [decisions[0]], sourcesByVorgang: sources, now: NOW
});
check("error: understanding_status failed -> qualityStatus error, status error, errorState true",
  stateError.qualityStatus === "error" && stateError.status === "error" && stateError.errorState === true);

// --- 8) Fehlende Daten brechen NICHT + ehrlich leer/unknown -----------------
const stateEmpty = contract.buildCurrentHelmutState({ profile, decisions: [], kosById: {}, sourcesByVorgang: {}, now: NOW });
check("Leerfall: volle Struktur, status empty, kein Crash",
  TOP_KEYS.every((k) => k in stateEmpty) && stateEmpty.status === "empty" &&
  stateEmpty.qualityStatus === "empty" && stateEmpty.primaryItem === null &&
  stateEmpty.items.length === 0 && stateEmpty.sourceIds.length === 0);
check("Leerfall: keine erfundenen Inhalte (leer/null/unknown)",
  stateEmpty.headline === "" && stateEmpty.recommendation === "" && stateEmpty.riskLevel === "unknown" &&
  stateEmpty.opportunityLevel === "unknown" && stateEmpty.recommendedCommunication.recommendedChannel === "unknown" &&
  stateEmpty.actionItems.length === 0 && stateEmpty.primaryVorgangId === null);

// Duennes KO (nur Pflichtanalyse, keine Stabschef-Felder) -> partial, kein Crash.
const koThin = {
  id: "ko-vg-3", vorgang_id: "vg-3", status: "neu", understanding_status: "complete",
  was_ist_passiert: "Antrag eingebracht.", warum_wichtig: "Betrifft das Mandat.",
  ausschuesse: ["Gesundheit"], zeitdruck: "niedrig", source_document_count: 1, updated_at: NOW.toISOString()
};
const stateThin = contract.buildCurrentHelmutState({
  profile, kosById: { "ko-vg-3": koThin },
  decisions: [{ knowledge_object_id: "ko-vg-3", vorgang_id: "vg-3", score: 55, decision: "Beobachten", risk: "", chance: "", matched_features: [] }],
  sourcesByVorgang: {}, now: NOW
});
check("Duennes KO: kein Crash, strukturierte Defaults (unknown/leer)",
  stateThin.riskLevel === "unknown" && stateThin.opportunityLevel === "unknown" &&
  stateThin.recommendedCommunication.communicationLine === "" && stateThin.actionItems.length === 0);
// Duennes KO traegt echten V3-Kern (warum_wichtig) -> "partial", NICHT "empty":
// der vorhandene Vorschlag bleibt sichtbar (status "fresh"), Stabschef-Felder ehrlich leer.
check("Duennes KO mit V3-Kern -> qualityStatus partial (nicht empty, ehrlich)", stateThin.qualityStatus === "partial");
check("Duennes KO mit V3-Kern -> status fresh + primaryItem vorhanden (kein Leerzustand)",
  stateThin.status === "fresh" && Boolean(stateThin.primaryItem) && stateThin.primaryItem.id === "vg-3");
check("Duennes KO: sourceCount aus source_document_count, sourceIds leer (keine geladenen Quellen)",
  stateThin.sourcesSummary.sourceCount === 1 && stateThin.sourceIds.length === 0);

// --- 9) Determinismus -------------------------------------------------------
const stateB = contract.buildCurrentHelmutState({ profile, decisions, kosById, sourcesByVorgang: sources, now: NOW });
check("Adapter ist deterministisch (2 Laeufe identisch)", JSON.stringify(state) === JSON.stringify(stateB));

// --- 10) KEINE Kostenwerte im oeffentlichen State ---------------------------
const serialized = JSON.stringify(state);
const FORBIDDEN_COST = ["estimatedCost", "estimated_cost", "costEstimate", "promptTokens", "completionTokens",
  "totalTokens", "inputTokens", "outputTokens", "pipelineStep", "tenant_id", "llmUsage"];
check("CurrentHelmutState traegt KEINE Kosten-/Token-Felder",
  FORBIDDEN_COST.every((k) => !serialized.includes(k)),
  FORBIDDEN_COST.filter((k) => serialized.includes(k)).join(","));

// --- 11) Keine Cem-Logik / keine hartkodierte Partei ------------------------
// Ein neutrales Profil OHNE Partei/Ausschuss + KO ohne diese Labels -> keine erfundenen
// Partei-/Personen-Fallbacks (contextChips leer, kein hardcoded String).
const neutralState = contract.buildCurrentHelmutState({
  profile: { id: "u-neutral" },
  kosById: { "ko-n": { id: "ko-n", vorgang_id: "vg-n", status: "neu", understanding_status: "complete", was_ist_passiert: "X.", warum_wichtig: "Y.", zeitdruck: "keiner", source_document_count: 0, updated_at: NOW.toISOString() } },
  decisions: [{ knowledge_object_id: "ko-n", vorgang_id: "vg-n", score: 45, decision: "Beobachten", risk: "", chance: "", matched_features: [] }],
  sourcesByVorgang: {}, now: NOW
});
check("Neutraler Vorgang: contextChips leer (keine erfundene Partei)", neutralState.contextChips.length === 0);
check("Kein hartkodierter Partei-/Cem-String in neutralem State",
  !/cem|ince|\bspd\b|\bcdu\b|gruene|grüne|\blinke\b|\bafd\b|\bfdp\b/i.test(JSON.stringify(neutralState)));

// --- 12) Integration: currentHelmutState haengt am /api/app/start-Vertrag ----
const briefing = contract.buildContractFromKnowledgeObjects(profile, [koPrimary, koRelated], sources, { userId: "u-1", now: NOW });
check("Vertrag: briefing.currentHelmutState vorhanden (additiv)",
  briefing && briefing.currentHelmutState && briefing.currentHelmutState.primaryVorgangId === "vg-1");
check("Vertrag: bestehende Pflichtfelder unveraendert (rueckwaertsverträglich)",
  ["items", "personalizedRecommendations", "helmutAssessment", "decisionMetrics", "status", "generatedAt"].every((k) => k in briefing));
check("Vertrag: KEINE Kostenwerte im gesamten currentHelmutState-Zweig",
  !/cost|estimat|Tokens|pipelineStep/i.test(JSON.stringify(briefing.currentHelmutState)));

// --- 13) Fresh-aware Primary-Auswahl (LLM-freier Ranking-Fix) ----------------
// Ein STALE High-Score-Vorgang darf nicht dauerhaft Primary bleiben, wenn heute ein
// frischer relevanter Vorgang existiert. Reproduziert den Production-Fall: alter
// Flagship (hoher Score, 08.07.) vs. frischer relevanter Vorgang (11.07.).
const NOW11 = new Date("2026-07-11T09:00:00Z"); // Europe/Berlin 11:00, 11. Juli
function mkFullKo(id, vg, updatedAt, title) {
  return {
    id, vorgang_id: vg, status: "neu", understanding_status: "complete",
    display_title: title, was_ist_passiert: "X.", warum_wichtig: "Y.", why_relevant: "Z.", recommendation: "R.",
    risk_of_no_action: "Ri.", opportunity_summary: "Ch.", risk_level: "high", opportunity_level: "high",
    recommended_communication_struct: { communicationLine: "L.", recommendedChannel: "press", recommendedFormat: "statement", suggestedOutputs: ["qa"] },
    action_items_struct: [{ title: "Lege bis uebermorgen vor", description: "", dueHint: "uebermorgen", priority: "high", actionType: "prepareStatement" }],
    ausschuesse: ["A"], zeitdruck: "hoch", source_document_count: 2, updated_at: updatedAt
  };
}
const koFlagship = mkFullKo("ko-vg-destabilisiert", "vg-destabilisiert", "2026-07-08T04:00:00Z", "Staat prueft Massnahmen gegen Tarifflucht");
const koFresh = mkFullKo("ko-vg-neu", "vg-neu-11", "2026-07-11T06:00:00Z", "Frischer relevanter Vorgang");
const decFlag = { knowledge_object_id: "ko-vg-destabilisiert", vorgang_id: "vg-destabilisiert", score: 90, decision: "Sofort reagieren", priority_type: "risk", risk: "r", chance: "", matched_features: [] };
const decFresh = { knowledge_object_id: "ko-vg-neu", vorgang_id: "vg-neu-11", score: 60, decision: "Sofort reagieren", priority_type: "risk", risk: "r", chance: "", matched_features: [] };

// D1: stale Top (Score 90) + frischer relevanter (Score 60) -> frischer wird Primary.
const stFreshWins = contract.buildCurrentHelmutState({
  profile, decisions: [decFlag, decFresh], kosById: { "ko-vg-destabilisiert": koFlagship, "ko-vg-neu": koFresh },
  sourcesByVorgang: {}, now: NOW11
});
check("D1: stale High-Score-Top wird von frischem relevantem Vorgang als Primary verdraengt",
  stFreshWins.primaryVorgangId === "vg-neu-11", stFreshWins.primaryVorgangId);
check("D1: Status wird fresh (frischer Primary vom heutigen Tag)", stFreshWins.status === "fresh");
check("D1: recommendation kommt aus dem NEUEN Primary (echte V3-Daten)", stFreshWins.headline === "Frischer relevanter Vorgang");
// D4: verdraengter alter Top erscheint VORNE in weiteren Vorgaengen (nicht verloren, kein Duplikat).
check("D4: verdraengter Flagship erscheint in weiteren relevanten Vorgaengen (zuerst)",
  stFreshWins.relatedVorgangIds[0] === "vg-destabilisiert" && stFreshWins.items.some((i) => i.id === "vg-destabilisiert"));
check("D4: Primary nicht in weiteren Vorgaengen dupliziert",
  !stFreshWins.items.some((i) => i.id === stFreshWins.primaryVorgangId));

// D2: frischer Top -> unveraendert (kein Eingriff).
const stFreshTop = contract.buildCurrentHelmutState({
  profile, decisions: [decFresh], kosById: { "ko-vg-neu": koFresh }, sourcesByVorgang: {}, now: NOW11
});
check("D2: frischer Top-Vorgang bleibt unveraendert Primary + status fresh",
  stFreshTop.primaryVorgangId === "vg-neu-11" && stFreshTop.status === "fresh");

// D3: stale Top + KEIN frischer relevanter Ersatz -> alter Top bleibt, status stale.
const stNoFresh = contract.buildCurrentHelmutState({
  profile, decisions: [decFlag], kosById: { "ko-vg-destabilisiert": koFlagship }, sourcesByVorgang: {}, now: NOW11
});
check("D3: stale Top ohne frischen Ersatz bleibt Primary + status stale (ehrlich Nicht aktuell)",
  stNoFresh.primaryVorgangId === "vg-destabilisiert" && stNoFresh.status === "stale");

// D3b: frischer Kandidat, aber NICHT relevant genug (Ignorieren) -> kein Ersatz.
const decFreshIgnore = { ...decFresh, decision: "Ignorieren" };
const stFreshIgnored = contract.buildCurrentHelmutState({
  profile, decisions: [decFlag, decFreshIgnore], kosById: { "ko-vg-destabilisiert": koFlagship, "ko-vg-neu": koFresh },
  sourcesByVorgang: {}, now: NOW11
});
check("D3b: frischer aber ignorierter Kandidat verdraengt den stale Top NICHT",
  stFreshIgnored.primaryVorgangId === "vg-destabilisiert" && stFreshIgnored.status === "stale");

// D3c: frischer Kandidat, aber UNVOLLSTAENDIG (pending -> quality empty) -> kein Ersatz.
const koFreshPending = { ...koFresh, id: "ko-vg-pend", vorgang_id: "vg-pend-11", status: "pending", understanding_status: "pending" };
const decFreshPending = { knowledge_object_id: "ko-vg-pend", vorgang_id: "vg-pend-11", score: 60, decision: "Sofort reagieren", priority_type: "risk", risk: "", chance: "", matched_features: [] };
const stFreshPending = contract.buildCurrentHelmutState({
  profile, decisions: [decFlag, decFreshPending], kosById: { "ko-vg-destabilisiert": koFlagship, "ko-vg-pend": koFreshPending },
  sourcesByVorgang: {}, now: NOW11
});
check("D3c: frischer aber unvollstaendiger (pending) Kandidat verdraengt den stale Top NICHT",
  stFreshPending.primaryVorgangId === "vg-destabilisiert");

// Unit-Tests der Hilfsfunktion selectFreshAwarePrimary (deterministisch, erklaerbar).
const candFlag = { d: decFlag, ko: koFlagship, docs: [], quality: contract.deriveHelmutQualityStatus(koFlagship, NOW11) };
const candFresh = { d: decFresh, ko: koFresh, docs: [], quality: contract.deriveHelmutQualityStatus(koFresh, NOW11) };
const selWins = contract.selectFreshAwarePrimary([candFlag, candFresh], NOW11);
check("selectFreshAwarePrimary: stale Top -> frischer Primary + displaced = alter Top",
  selWins.primary === candFresh && selWins.displaced === candFlag);
const selKeep = contract.selectFreshAwarePrimary([candFresh, candFlag], NOW11);
check("selectFreshAwarePrimary: frischer Top -> unveraendert, kein displaced",
  selKeep.primary === candFresh && selKeep.displaced === null);
const selNone = contract.selectFreshAwarePrimary([candFlag], NOW11);
check("selectFreshAwarePrimary: stale Top ohne Ersatz -> Top bleibt, kein displaced",
  selNone.primary === candFlag && selNone.displaced === null);

// D5/6/7: kein Frontend-Fallback, kein Client-LLM, nur V3-Daten (Serialisierung pruefen).
const serFresh = JSON.stringify(stFreshWins);
check("D5-7: kein Kosten-/Token-/LLM-Feld im fresh-aware State (nur V3-Daten)",
  !/estimatedCost|promptTokens|totalTokens|pipelineStep|llmUsage/i.test(serFresh));
check("D5-7: keine hartkodierte Partei/Cem-Logik durch die Auswahl",
  !/\bcem\b|ince|\bspd\b|\bcdu\b|gruene|grüne|\blinke\b|\bafd\b|\bfdp\b/i.test(serFresh));

console.log(`\n${passed}/${passed + failed} CurrentHelmutState-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
