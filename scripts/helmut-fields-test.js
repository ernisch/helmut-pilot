"use strict";

// Helmut Core V3 — Fundament-Tests fuer die vier Stabschef-Felder + Kosten-Logging.
// KEIN Netz, KEINE KI. Prueft ausschliesslich das V3-DATENFUNDAMENT (kein UI):
//   1. Schema akzeptiert die neuen Felder und macht sie NICHT zur Pflicht.
//   2. Die Pipeline (assembleKnowledgeObject) bricht ohne die Felder nicht ab und
//      erzeugt sie fehlertolerant ('' bzw. []) -- ohne Demo-Text/Fallback.
//   3. Storage-Whitelist traegt die Felder (werden gespeichert & gelesen).
//   4. Der Contract-Adapter reicht sie als camelCase durch und leitet einen ehrlichen
//      qualityStatus (valid/partial/stale/empty/error) ab.
//   5. Kein estimatedCost/Token gelangt in die (fuer den Client bestimmten) Vertragsdaten.
//   6. Kosten-Logging erfasst tenantId/profileId/runId/model/Token/estimatedCost/
//      createdAt/pipelineStep und bleibt rueckwaertskompatibel.
//   7. Keine Cem-Logik / keine hartkodierte Partei wird eingefuehrt.

const schema = require("../lib/helmut/understanding-schema");
const understanding = require("../lib/helmut/understanding");
const storage = require("../lib/helmut/storage");
const contract = require("../lib/helmut/briefingContract");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const STAFF_FIELDS = ["risk_of_no_action", "opportunity_summary", "recommended_communication", "action_items"];
const STAFF_CAMEL = ["riskOfNoAction", "opportunitySummary", "recommendedCommunication", "actionItems"];

// Ein vollstaendiges, schema-valides Basis-KO (Pflichtfelder befuellt).
function baseKo(extra = {}) {
  return {
    id: "ko-vg-test", vorgang_id: "vg-test", status: "neu",
    confidence_score: 70, source_document_count: 2,
    was_ist_passiert: "Etwas ist passiert.", warum_wichtig: "Es ist wichtig.",
    wer_ist_betroffen: "Betroffene.", zeitdruck: "mittel", handlungsempfehlung: "Handeln.",
    parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [],
    mentioned_people: [], mentioned_mps: [], mentioned_parties: [], mentioned_committees: [],
    mentioned_ministries: [], mentioned_locations: [], mentioned_organizations: [],
    ...extra
  };
}

// --- 1) Schema: neue Felder erlaubt, aber NICHT Pflicht ----------------------
check("Schema kennt alle vier Stabschef-Properties",
  STAFF_FIELDS.every((f) => f in schema.KNOWLEDGE_OBJECT_SCHEMA.properties),
  STAFF_FIELDS.filter((f) => !(f in schema.KNOWLEDGE_OBJECT_SCHEMA.properties)).join(","));
check("Kein Stabschef-Feld steht in schema.required (Pipeline-Abbruch ausgeschlossen)",
  STAFF_FIELDS.every((f) => !schema.KNOWLEDGE_OBJECT_SCHEMA.required.includes(f)));
check("KO OHNE Stabschef-Felder ist schema-valide (Pipeline bricht nicht ab)",
  schema.validateKnowledgeObject(baseKo()).valid,
  JSON.stringify(schema.validateKnowledgeObject(baseKo()).errors));
check("KO MIT befuellten Stabschef-Feldern ist schema-valide",
  schema.validateKnowledgeObject(baseKo({
    risk_of_no_action: "Ohne Reaktion droht Deutungshoheit an die Opposition zu fallen.",
    opportunity_summary: "Chance, das Thema fachlich zu besetzen.",
    recommended_communication: "Kurzstatement im Ausschuss.",
    action_items: ["Referent briefen", "Zitat vorbereiten"]
  })).valid);
check("Schema lehnt falschen Typ ab (action_items als String)",
  !schema.validateKnowledgeObject(baseKo({ action_items: "kein array" })).valid);
check("Schema kappt zu langes Prosafeld ueber maxLength",
  !schema.validateKnowledgeObject(baseKo({ risk_of_no_action: "x".repeat(1000) })).valid);
check("DSGVO greift auch fuer neue Felder (E-Mail -> invalid)",
  !schema.validateKnowledgeObject(baseKo({ recommended_communication: "Mail an test@example.com" })).valid);

// --- 2) assembleKnowledgeObject: fehlertolerant, kein Fallback-Text ----------
const cluster = { documents: [{ title: "Testvorgang", summary: "Kurz" }, { title: "Testvorgang zwei" }] };
const assembledEmpty = understanding.assembleKnowledgeObject({
  was_ist_passiert: "A", warum_wichtig: "B", wer_ist_betroffen: "C", handlungsempfehlung: "D",
  confidence_score: 60
}, cluster, "vg-test");
check("assemble: fehlende Stabschef-Prosa -> '' (kein Demo-Text)",
  assembledEmpty.risk_of_no_action === "" && assembledEmpty.opportunity_summary === "" &&
  assembledEmpty.recommended_communication === "");
check("assemble: fehlende action_items -> [] (kein Fallback)",
  Array.isArray(assembledEmpty.action_items) && assembledEmpty.action_items.length === 0);
check("assemble: KO ohne KI-Stabschef-Felder bleibt schema-valide",
  schema.validateKnowledgeObject(assembledEmpty).valid,
  JSON.stringify(schema.validateKnowledgeObject(assembledEmpty).errors));

const assembledFull = understanding.assembleKnowledgeObject({
  was_ist_passiert: "A", warum_wichtig: "B", wer_ist_betroffen: "C", handlungsempfehlung: "D",
  confidence_score: 60,
  risk_of_no_action: "  Ohne Reaktion Deutungshoheit verloren.  ",
  opportunity_summary: "Fachliche Chance.",
  recommended_communication: "Kurzstatement.",
  action_items: ["Schritt 1", "Schritt 1", "", "Schritt 2"]
}, cluster, "vg-test");
check("assemble: Prosafelder werden uebernommen + getrimmt",
  assembledFull.risk_of_no_action === "Ohne Reaktion Deutungshoheit verloren." &&
  assembledFull.recommended_communication === "Kurzstatement.");
check("assemble: action_items werden bereinigt (dedupe + leere raus)",
  JSON.stringify(assembledFull.action_items) === JSON.stringify(["Schritt 1", "Schritt 2"]));
check("assemble: langes action_item wird gekappt (kein Volltext)",
  understanding.assembleKnowledgeObject({
    was_ist_passiert: "A", warum_wichtig: "B", wer_ist_betroffen: "C", handlungsempfehlung: "D",
    action_items: ["y".repeat(500)]
  }, cluster, "vg-test").action_items[0].length <= 200);

// --- 3) Storage-Whitelist: gespeichert & gelesen ----------------------------
check("Storage-Whitelist V3_KNOWLEDGE_OBJECT_COLUMNS traegt alle vier Felder",
  STAFF_FIELDS.every((f) => storage.V3_KNOWLEDGE_OBJECT_COLUMNS.includes(f)),
  STAFF_FIELDS.filter((f) => !storage.V3_KNOWLEDGE_OBJECT_COLUMNS.includes(f)).join(","));

// --- 4) Contract-Adapter: camelCase-Durchreichung + qualityStatus -----------
const koFull = baseKo({
  understanding_status: "complete",
  risk_of_no_action: "Ohne Reaktion droht Kritik.", opportunity_summary: "Chance zur Profilierung.",
  recommended_communication: "Kurzstatement.", action_items: ["Referent briefen", "Zitat vorbereiten"],
  updated_at: "2026-07-06T00:00:00Z"
});
const NOW = new Date("2026-07-07T08:00:00Z");
const staff = contract.koStaffFields(koFull, NOW);
check("Adapter: alle vier camelCase-Felder vorhanden",
  STAFF_CAMEL.every((k) => k in staff));
check("Adapter: Prosa-Inhalte kommen 1:1 aus dem KO (V3-Motor)",
  staff.riskOfNoAction === "Ohne Reaktion droht Kritik." &&
  staff.opportunitySummary === "Chance zur Profilierung.");
check("Adapter: recommendedCommunication ist strukturiert (Alt-Zeile -> communicationLine)",
  staff.recommendedCommunication && typeof staff.recommendedCommunication === "object" &&
  staff.recommendedCommunication.communicationLine === "Kurzstatement." &&
  staff.recommendedCommunication.recommendedChannel === "unknown" &&
  staff.recommendedCommunication.recommendedFormat === "unknown");
check("Adapter: actionItems sind strukturiert (Alt-text[] -> {title,...})",
  Array.isArray(staff.actionItems) && staff.actionItems.length === 2 &&
  staff.actionItems[0].title === "Referent briefen" &&
  staff.actionItems[0].priority === "unknown" && staff.actionItems[0].actionType === "unknown");
check("qualityStatus=valid, wenn alle vier Inhalts-Dimensionen befuellt & frisch",
  staff.helmutQualityStatus === "valid", staff.helmutQualityStatus);

// baseKo traegt echten V3-Kern (warum_wichtig + handlungsempfehlung), aber KEINES der
// vier neuen Stabschef-Felder -> rueckwaertsvertraeglich "partial" (nicht "empty"):
// aeltere KOs bleiben mit ihrem vorhandenen Vorschlag sichtbar statt versteckt.
check("qualityStatus=partial, wenn nur V3-Kern (Empfehlung/Warum) vorhanden, keine Stabschef-Felder",
  contract.deriveHelmutQualityStatus(baseKo({ understanding_status: "complete" }), NOW) === "partial");
// Wirklich leer bleibt leer: WEDER Stabschef-Feld NOCH V3-Kern (Empfehlung/Warum) befuellt.
check("qualityStatus=empty, wenn WEDER Stabschef-Feld NOCH V3-Kern befuellt",
  contract.deriveHelmutQualityStatus(baseKo({
    understanding_status: "complete", warum_wichtig: "", handlungsempfehlung: "",
    why_relevant: "", recommendation: ""
  }), NOW) === "empty");
check("qualityStatus=partial, wenn nur ein Teil befuellt",
  contract.deriveHelmutQualityStatus(baseKo({
    understanding_status: "complete", risk_of_no_action: "Nur eins.", updated_at: "2026-07-06T00:00:00Z"
  }), NOW) === "partial");
check("qualityStatus=stale, wenn Felder alt (> Schwelle)",
  contract.deriveHelmutQualityStatus(baseKo({
    understanding_status: "complete", risk_of_no_action: "Alt.", action_items: ["x"],
    opportunity_summary: "y", recommended_communication: "z", updated_at: "2026-01-01T00:00:00Z"
  }), NOW) === "stale");
check("qualityStatus=error, wenn understanding_status='failed'",
  contract.deriveHelmutQualityStatus(baseKo({ understanding_status: "failed" }), NOW) === "error");
check("qualityStatus=empty, wenn Vorgang pending",
  contract.deriveHelmutQualityStatus(baseKo({ status: "pending", understanding_status: "pending" }), NOW) === "empty");

// Leere Felder duerfen NIE erfunden werden (kein Demo-Text, keine Partei/Person).
const staffEmpty = contract.koStaffFields(baseKo({ understanding_status: "complete" }), NOW);
check("Adapter: leere Stabschef-Felder bleiben leer/unknown (kein Fallback-Text)",
  staffEmpty.riskOfNoAction === "" && staffEmpty.opportunitySummary === "" &&
  staffEmpty.recommendedCommunication.communicationLine === "" &&
  staffEmpty.recommendedCommunication.recommendedChannel === "unknown" &&
  staffEmpty.recommendedCommunication.recommendedFormat === "unknown" &&
  staffEmpty.recommendedCommunication.suggestedOutputs.length === 0 &&
  staffEmpty.actionItems.length === 0 &&
  staffEmpty.riskLevel === "unknown" && staffEmpty.opportunityLevel === "unknown" &&
  // Stabschef-Felder leer, aber V3-Kern (warum_wichtig/handlungsempfehlung) vorhanden -> partial.
  staffEmpty.helmutQualityStatus === "partial");

// --- 5) Voller Vertrag: Stabschef-Felder vorhanden, KEINE Kostenwerte --------
const profile = { id: "u-1", firstName: "Test", party: "SPD", committee: "Gesundheit", focusTopics: ["Pflege"] };
const kos = [baseKo({
  id: "ko-vg-1", vorgang_id: "vg-1", understanding_status: "complete",
  ausschuesse: ["Gesundheit"], parteien: ["SPD"], risiken: ["Kritik"],
  risk_of_no_action: "Ohne Reaktion droht Kritik.", opportunity_summary: "Chance.",
  recommended_communication: "Statement.", action_items: ["Briefen"],
  confidence_score: 85, source_document_count: 3, updated_at: NOW.toISOString()
})];
const briefing = contract.buildContractFromKnowledgeObjects(profile, kos, {}, { userId: "u-1", now: NOW });
const rec = briefing.personalizedRecommendations[0];
check("Vertrag: Recommendation traegt die vier Stabschef-Felder + qualityStatus",
  rec && STAFF_CAMEL.every((k) => k in rec) && "helmutQualityStatus" in rec);
check("Vertrag rueckwaertskompatibel: bestehende REC-Pflichtfelder unveraendert vorhanden",
  rec && ["id", "relevance_score", "current_priority", "recommended_action",
    "personal_relevance_explanation", "action_type", "status"].every((k) => k in rec));

const serialized = JSON.stringify(briefing);
// Kosten-/Token-Werte duerfen NIE in die (Client-)Vertragsdaten. Hinweis: tenantId/
// profileId sind KEINE Kostenwerte -- sie sind gueltige oeffentliche CurrentHelmutState-
// Felder (SaaS-Kontext) und daher bewusst NICHT verboten. Verboten ist nur echtes
// Kosten-Logging (estimatedCost/Token/pipelineStep).
const FORBIDDEN_COST_KEYS = ["estimatedCost", "estimated_cost", "costEstimate", "promptTokens",
  "completionTokens", "totalTokens", "prompt_tokens", "inputTokens", "outputTokens", "pipelineStep"];
check("Vertrag: KEIN Kosten-/Token-Feld in den (Client-)Vertragsdaten",
  FORBIDDEN_COST_KEYS.every((k) => !serialized.includes(k)),
  FORBIDDEN_COST_KEYS.filter((k) => serialized.includes(k)).join(","));

// --- 5b) Strukturierte Stabschef-Werte (Runde 2) ----------------------------
const STRUCT_COLS = ["risk_level", "opportunity_level", "recommended_communication_struct", "action_items_struct"];

// Schema: Enum-Validierung riskLevel/opportunityLevel.
check("Schema akzeptiert gueltiges risk_level/opportunity_level",
  schema.validateKnowledgeObject(baseKo({ risk_level: "high", opportunity_level: "low" })).valid);
check("Schema akzeptiert 'unknown' als risk_level (ehrlicher Default erlaubt)",
  schema.validateKnowledgeObject(baseKo({ risk_level: "unknown" })).valid);
check("Schema lehnt ungueltiges risk_level ab (kein Frei-String)",
  !schema.validateKnowledgeObject(baseKo({ risk_level: "kritisch" })).valid);
check("Schema lehnt ungueltiges opportunity_level ab",
  !schema.validateKnowledgeObject(baseKo({ opportunity_level: "gross" })).valid);
// Schema: strukturierte Objekte + verschachtelte Enums.
check("Schema akzeptiert gueltiges recommended_communication_struct",
  schema.validateKnowledgeObject(baseKo({
    recommended_communication_struct: { communicationLine: "X", recommendedChannel: "press", recommendedFormat: "statement", suggestedOutputs: ["qa"] }
  })).valid);
check("Schema lehnt ungueltigen recommendedChannel im Struct ab",
  !schema.validateKnowledgeObject(baseKo({ recommended_communication_struct: { recommendedChannel: "email" } })).valid);
check("Schema lehnt recommended_communication_struct als Array ab (erwartet object)",
  !schema.validateKnowledgeObject(baseKo({ recommended_communication_struct: ["x"] })).valid);
check("Schema akzeptiert gueltige action_items_struct-Liste",
  schema.validateKnowledgeObject(baseKo({
    action_items_struct: [{ title: "T", description: "D", dueHint: "heute", priority: "high", actionType: "prepareStatement" }]
  })).valid);
check("Schema lehnt ungueltigen actionType im action_items_struct ab",
  !schema.validateKnowledgeObject(baseKo({ action_items_struct: [{ title: "T", actionType: "flyDrone" }] })).valid);
check("Kein strukturiertes Feld ist Pflicht (Pipeline bricht ohne sie nicht ab)",
  STRUCT_COLS.every((f) => !schema.KNOWLEDGE_OBJECT_SCHEMA.required.includes(f)) &&
  schema.validateKnowledgeObject(baseKo()).valid);

// assemble: strukturierte Werte fehlertolerant, unknown/leer als Default.
const asmEmpty = understanding.assembleKnowledgeObject({
  was_ist_passiert: "A", warum_wichtig: "B", wer_ist_betroffen: "C", handlungsempfehlung: "D"
}, cluster, "vg-test");
check("assemble: fehlendes risk_level/opportunity_level -> 'unknown'",
  asmEmpty.risk_level === "unknown" && asmEmpty.opportunity_level === "unknown");
check("assemble: fehlender comm-struct -> Objekt mit unknown/leer (kein Fake)",
  asmEmpty.recommended_communication_struct.communicationLine === "" &&
  asmEmpty.recommended_communication_struct.recommendedChannel === "unknown" &&
  asmEmpty.recommended_communication_struct.recommendedFormat === "unknown" &&
  Array.isArray(asmEmpty.recommended_communication_struct.suggestedOutputs) &&
  asmEmpty.recommended_communication_struct.suggestedOutputs.length === 0);
check("assemble: fehlende action_items_struct -> []",
  Array.isArray(asmEmpty.action_items_struct) && asmEmpty.action_items_struct.length === 0);
check("assemble: KO mit strukturierten Defaults bleibt schema-valide (kein Abbruch)",
  schema.validateKnowledgeObject(asmEmpty).valid, JSON.stringify(schema.validateKnowledgeObject(asmEmpty).errors));

const asmStruct = understanding.assembleKnowledgeObject({
  was_ist_passiert: "A", warum_wichtig: "B", wer_ist_betroffen: "C", handlungsempfehlung: "D",
  risk_level: "HIGH", opportunity_level: "medium",
  recommended_communication_struct: {
    communicationLine: "Intern abstimmen.", recommendedChannel: "internal",
    recommendedFormat: "internalLine", recommendedFormatXXX: "ignored", suggestedOutputs: ["talkingPoints", "qa"]
  },
  action_items_struct: [
    { title: "Linie abstimmen", description: "Mit Fraktion", dueHint: "bis 14 Uhr", priority: "high", actionType: "alignInternally" },
    { description: "ohne title -> verworfen", priority: "low" },
    { title: "Monitoring", priority: "quatsch", actionType: "monitor" }
  ]
}, cluster, "vg-test");
check("assemble: risk_level enum-sanitisiert (ungueltige Grossschreibung -> unknown)",
  asmStruct.risk_level === "unknown" && asmStruct.opportunity_level === "medium");
check("assemble: comm-struct uebernimmt gueltige Enums + kappt unbekannte Keys",
  asmStruct.recommended_communication_struct.recommendedChannel === "internal" &&
  asmStruct.recommended_communication_struct.recommendedFormat === "internalLine" &&
  JSON.stringify(asmStruct.recommended_communication_struct.suggestedOutputs) === JSON.stringify(["talkingPoints", "qa"]));
check("assemble: action_items_struct dropped title-lose Eintraege + sanitisiert Enums",
  asmStruct.action_items_struct.length === 2 &&
  asmStruct.action_items_struct[0].title === "Linie abstimmen" &&
  asmStruct.action_items_struct[0].actionType === "alignInternally" &&
  asmStruct.action_items_struct[1].priority === "unknown");
check("assemble: Alt-Spalten rueckwaertsverträglich aus Struct gespiegelt (kein Bruch)",
  asmStruct.recommended_communication === "Intern abstimmen." &&
  JSON.stringify(asmStruct.action_items) === JSON.stringify(["Linie abstimmen", "Monitoring"]));

// Storage-Whitelist traegt die neuen strukturierten Spalten.
check("Storage-Whitelist traegt die vier strukturierten Spalten",
  STRUCT_COLS.every((f) => storage.V3_KNOWLEDGE_OBJECT_COLUMNS.includes(f)),
  STRUCT_COLS.filter((f) => !storage.V3_KNOWLEDGE_OBJECT_COLUMNS.includes(f)).join(","));

// Contract: primaerer Struct-Pfad.
const koStructRead = baseKo({
  understanding_status: "complete", risk_level: "high", opportunity_level: "medium",
  recommended_communication_struct: { communicationLine: "Nicht zuspitzen.", recommendedChannel: "internal", recommendedFormat: "internalLine", suggestedOutputs: ["talkingPoints"] },
  action_items_struct: [{ title: "Abstimmen", description: "", dueHint: "heute", priority: "high", actionType: "alignInternally" }],
  risk_of_no_action: "Risiko.", opportunity_summary: "Chance.", updated_at: NOW.toISOString()
});
const sRead = contract.koStaffFields(koStructRead, NOW);
check("Contract: riskLevel/opportunityLevel aus Struct-KO gelesen",
  sRead.riskLevel === "high" && sRead.opportunityLevel === "medium");
check("Contract: recommendedCommunication.* vollstaendig aus Struct-KO",
  sRead.recommendedCommunication.communicationLine === "Nicht zuspitzen." &&
  sRead.recommendedCommunication.recommendedChannel === "internal" &&
  sRead.recommendedCommunication.recommendedFormat === "internalLine" &&
  JSON.stringify(sRead.recommendedCommunication.suggestedOutputs) === JSON.stringify(["talkingPoints"]));
check("Contract: actionItems[].{title,dueHint,priority,actionType} aus Struct-KO",
  sRead.actionItems[0].title === "Abstimmen" && sRead.actionItems[0].dueHint === "heute" &&
  sRead.actionItems[0].priority === "high" && sRead.actionItems[0].actionType === "alignInternally");
check("Contract: lastUpdatedAt durchgereicht (Letzte Aktualisierung)",
  sRead.lastUpdatedAt === NOW.toISOString());

// Contract: Rueckwaertskompatibilitaet — ALT-Zeile/-Liste ohne Struct.
const koLegacy = baseKo({
  understanding_status: "complete",
  recommended_communication: "Alt-Kurzzeile.", action_items: ["Alt-Schritt A", "Alt-Schritt B"],
  updated_at: NOW.toISOString()
});
const sLegacy = contract.koStaffFields(koLegacy, NOW);
check("Contract backward-compat: Alt recommended_communication -> communicationLine + unknown",
  sLegacy.recommendedCommunication.communicationLine === "Alt-Kurzzeile." &&
  sLegacy.recommendedCommunication.recommendedChannel === "unknown" &&
  sLegacy.recommendedCommunication.recommendedFormat === "unknown");
check("Contract backward-compat: Alt action_items[] -> [{title, unknown-Rest}]",
  sLegacy.actionItems.length === 2 && sLegacy.actionItems[0].title === "Alt-Schritt A" &&
  sLegacy.actionItems[0].priority === "unknown" && sLegacy.actionItems[1].title === "Alt-Schritt B");
check("Contract backward-compat: qualityStatus erkennt Alt-Felder als vorhanden",
  contract.deriveHelmutQualityStatus(koLegacy, NOW) === "partial"); // nur comm+actions -> partial

// Vollstaendigkeits-Check: jeder von CurrentHelmutState benoetigte Pfad ist befuellbar.
const CURRENT_STATE_PATHS = {
  riskLevel: sRead.riskLevel,
  opportunityLevel: sRead.opportunityLevel,
  "recommendedCommunication.communicationLine": sRead.recommendedCommunication.communicationLine,
  "recommendedCommunication.recommendedChannel": sRead.recommendedCommunication.recommendedChannel,
  "recommendedCommunication.recommendedFormat": sRead.recommendedCommunication.recommendedFormat,
  "recommendedCommunication.suggestedOutputs": sRead.recommendedCommunication.suggestedOutputs,
  "actionItems[].title": sRead.actionItems[0] && sRead.actionItems[0].title,
  "actionItems[].description": sRead.actionItems[0] && sRead.actionItems[0].description,
  "actionItems[].dueHint": sRead.actionItems[0] && sRead.actionItems[0].dueHint,
  "actionItems[].priority": sRead.actionItems[0] && sRead.actionItems[0].priority,
  "actionItems[].actionType": sRead.actionItems[0] && sRead.actionItems[0].actionType
};
check("CurrentHelmutState: alle geforderten Pfade sind aus dem V3-Motor befuellbar",
  Object.values(CURRENT_STATE_PATHS).every((v) => v !== undefined),
  Object.entries(CURRENT_STATE_PATHS).filter(([, v]) => v === undefined).map(([k]) => k).join(","));

// --- 6) Kosten-Logging: SaaS-Felder + Rueckwaertskompatibilitaet ------------
const rec1 = storage.buildLlmUsageRecord({
  tenantId: "tenant-a", profileId: "prof-1", runId: "run-9", model: "gpt-5-mini",
  callType: "understanding", pipelineStep: "understanding",
  usage: { input_tokens: 1000, output_tokens: 500 }
}, { id: "fix-1", createdAt: "2026-07-07T00:00:00Z" });
check("Kostenlog erfasst tenantId/profileId/runId/pipelineStep",
  rec1.tenantId === "tenant-a" && rec1.profileId === "prof-1" && rec1.runId === "run-9" &&
  rec1.pipelineStep === "understanding");
check("Kostenlog erfasst model + createdAt",
  rec1.model === "gpt-5-mini" && rec1.createdAt === "2026-07-07T00:00:00Z");
check("Kostenlog erfasst input/output Tokens (prompt/completion)",
  rec1.promptTokens === 1000 && rec1.completionTokens === 500 && rec1.totalTokens === 1500);
check("Kostenlog berechnet estimatedCost numerisch",
  typeof rec1.estimatedCost === "number" && rec1.estimatedCost > 0);
check("Kostenlog: pipelineStep faellt auf callType zurueck, wenn nicht gesetzt",
  storage.buildLlmUsageRecord({ callType: "lageBriefing" }).pipelineStep === "lageBriefing");
check("Kostenlog: profileId faellt auf politicianId zurueck (rueckwaertskompatibel)",
  storage.buildLlmUsageRecord({ politicianId: "pol-7" }).profileId === "pol-7");
check("Kostenlog: fehlender usage-Block -> Token 'unknown' (kein stiller Verlust)",
  storage.buildLlmUsageRecord({ model: "gpt-5-mini" }).totalTokens === "unknown");
check("Kostenlog: fehlende SaaS-Felder -> null (kein Crash, mandantenfaehig)",
  storage.buildLlmUsageRecord({}).tenantId === null && storage.buildLlmUsageRecord({}).runId === null);

// --- 7) Keine Cem-Logik / keine hartkodierte Partei -------------------------
// Ein neutrales Profil OHNE Partei/Ausschuss darf keine erfundenen Stabschef-Inhalte
// oder Partei-Fallbacks bekommen (Felder kommen NUR aus dem KO).
const neutralStaff = contract.koStaffFields(baseKo({ understanding_status: "complete" }), NOW);
const neutralSerialized = JSON.stringify(neutralStaff).toLowerCase();
check("Keine hartkodierte Partei/Person in leeren Stabschef-Feldern",
  !/cem|ince|spd|cdu|grüne|gruene|linke|afd|fdp/.test(neutralSerialized));

console.log(`\n${passed}/${passed + failed} Helmut-Fundament-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
