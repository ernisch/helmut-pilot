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
check("Adapter: Inhalte kommen 1:1 aus dem KO (V3-Motor)",
  staff.riskOfNoAction === "Ohne Reaktion droht Kritik." &&
  staff.recommendedCommunication === "Kurzstatement." &&
  JSON.stringify(staff.actionItems) === JSON.stringify(["Referent briefen", "Zitat vorbereiten"]));
check("qualityStatus=valid, wenn alle Felder befuellt & frisch",
  staff.helmutQualityStatus === "valid", staff.helmutQualityStatus);

check("qualityStatus=empty, wenn kein Stabschef-Feld befuellt",
  contract.deriveHelmutQualityStatus(baseKo({ understanding_status: "complete" }), NOW) === "empty");
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
check("Adapter: leere Stabschef-Felder bleiben leer (kein Fallback-Text)",
  staffEmpty.riskOfNoAction === "" && staffEmpty.opportunitySummary === "" &&
  staffEmpty.recommendedCommunication === "" && staffEmpty.actionItems.length === 0 &&
  staffEmpty.helmutQualityStatus === "empty");

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
const FORBIDDEN_COST_KEYS = ["estimatedCost", "estimated_cost", "costEstimate", "promptTokens",
  "completionTokens", "totalTokens", "prompt_tokens", "inputTokens", "outputTokens", "pipelineStep", "tenantId"];
check("Vertrag: KEIN Kosten-/Token-Feld in den (Client-)Vertragsdaten",
  FORBIDDEN_COST_KEYS.every((k) => !serialized.includes(k)),
  FORBIDDEN_COST_KEYS.filter((k) => serialized.includes(k)).join(","));

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
