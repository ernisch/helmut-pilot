"use strict";

// Tests fuer die KO-Klassifikation — Sprint 2.
// Deckt ab: Deriver (Ebene/verwandte Ebenen/Ereignistyp), Resolver (Geografie/Entitaeten
// gegen Sprint-1-Seeds), Assembler-Integration (neue Felder + Embedding write-time +
// political_level-Spiegelung + Schema-Gueltigkeit), Schema-Enum-Konsistenz, Whitelist-Falle,
// Backfill-Logik (Dry-Run/execute/Idempotenz) und Migrations-Konsistenz.
// Reine Offline-Tests (Fixtures/injizierte Deps), kein Netz, keine KI, kein DB-Zugriff.

const fs = require("fs");
const path = require("path");
const c = require("../lib/helmut/quellenarchitektur/classification");
const u = require("../lib/helmut/understanding");
const schema = require("../lib/helmut/understanding-schema");
const storage = require("../lib/helmut/storage");
const { runKoClassificationBackfill, buildClassificationPatch } = require("../lib/helmut/ko-classification-backfill");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

// ============================ DERIVER: Entscheidungsebene ============================
console.log("== Deriver: Entscheidungsebene ==");
check("Bundestagsausschuss -> bund/high", (() => { const d = c.deriveDecisionLevel({ ausschuesse: ["Arbeit und Soziales"] }); return d.level === "bund" && d.confidence === "high"; })());
check("Landtag+Bundesland -> land", c.deriveDecisionLevel({ mentioned_organizations: ["Landtag Brandenburg"], mentioned_locations: ["Brandenburg"] }).level === "land");
check("EU-Kommission -> eu", c.deriveDecisionLevel({ mentioned_organizations: ["Europäische Kommission"] }).level === "eu");
check("leeres KO -> unknown (NICHT automatisch bund)", (() => { const d = c.deriveDecisionLevel({}); return d.level === "unknown" && d.confidence === "unknown"; })());
check("nur Bundesland-Ort ohne Institution -> unknown (kein Bund)", c.deriveDecisionLevel({ mentioned_locations: ["Bayern"] }).level === "unknown");
check("unknown-KO erfasst dennoch Land-Bezug (related_levels/affected)", (() => {
  const r = c.classifyKnowledgeObject({ mentioned_locations: ["Bayern"] });
  return r.decision_level === "unknown" && r.related_levels.includes("land") && r.affected_geographies.some((g) => g.name === "Bayern");
})());
check("classification_confidence.level = unknown bei unknown-Ebene", c.classifyKnowledgeObject({ mentioned_locations: ["Bayern"] }).classification_confidence.level === "unknown");
check("'eu' matcht NICHT als Substring in 'Deutschland'", c.deriveDecisionLevel({ mentioned_locations: ["Deutschland"], ausschuesse: ["Finanzen"] }).level === "bund");
check("related_levels leer bei reinem Bund-KO", (() => { const r = c.classifyKnowledgeObject({ ausschuesse: ["Finanzen"], mentioned_locations: ["Deutschland"] }); return r.related_levels.length === 0; })());
check("Bundesland-Erwaehnung -> related_levels enthaelt land", (() => { const r = c.classifyKnowledgeObject({ ausschuesse: ["Finanzen"], mentioned_locations: ["Bayern"] }); return r.related_levels.includes("land"); })());

// ============================ DERIVER: Ereignistyp ============================
console.log("== Deriver: Ereignistyp ==");
check("Gesetzentwurf erkannt", c.deriveEventType({ was_ist_passiert: "Der Bundestag beschließt einen Gesetzentwurf." }) === "gesetzentwurf");
check("Anhoerung erkannt", c.deriveEventType({ was_ist_passiert: "Im Ausschuss findet eine Anhörung mit Sachverständigen statt." }) === "anhoerung");
check("kein Signal -> unknown", c.deriveEventType({ was_ist_passiert: "Allgemeine Lage." }) === "unknown");

// ============================ RESOLVER: Geografie ============================
console.log("== Resolver: Geografie ==");
check("Deutschland -> geo-bund", c.resolveGeography("Deutschland").geography_id === "geo-bund");
check("Brandenburg -> geo-land-brandenburg/land", (() => { const g = c.resolveGeography("Brandenburg"); return g.geography_id === "geo-land-brandenburg" && g.level === "land"; })());
check("Potsdam -> kommune", (() => { const g = c.resolveGeography("Potsdam"); return g.level === "kommune" && g.geography_id === "geo-kommune-bb-potsdam"; })());
check("unbekannter Ort -> level unknown, id null", (() => { const g = c.resolveGeography("Kleinkleckersdorf"); return g.level === "unknown" && g.geography_id === null; })());
check("resolveGeographies dedupliziert", c.resolveGeographies(["Berlin", "Berlin", "Deutschland"]).length === 2);

// ============================ RESOLVER: Entitaeten ============================
console.log("== Resolver: Entitaeten ==");
check("SPD -> party-spd", c.resolveEntity("SPD", "party").entity_id === "party-spd");
check("Ausschuss Arbeit und Soziales -> committee-bt-arbeit-soziales", c.resolveEntity("Arbeit und Soziales", "committee").entity_id === "committee-bt-arbeit-soziales");
check("Menschenrechte NICHT auf Recht gemappt", c.resolveEntity("Menschenrechte und humanitäre Hilfe", "committee").entity_id === "committee-bt-menschenrechte");
check("Recht -> committee-bt-recht", c.resolveEntity("Recht", "committee").entity_id === "committee-bt-recht");
check("BMAS -> ministry-bmas", c.resolveEntity("BMAS", "ministry").entity_id === "ministry-bmas");
check("unbekannte Entitaet -> entity_id null (kein erfundener Treffer)", c.resolveEntity("Fantasieverein e.V.", "organization").entity_id === null);
check("decision_entities = Ausschuss+Ministerium", (() => {
  const e = c.buildDecisionEntities({ ausschuesse: ["Gesundheit"], ministerien: ["BMG"] });
  return e.some((x) => x.entity_id === "committee-bt-gesundheit");
})());
check("related_entities = Parteien", (() => {
  const e = c.buildRelatedEntities({ parteien: ["SPD", "CDU"] });
  return e.some((x) => x.entity_id === "party-spd") && e.some((x) => x.entity_id === "party-cdu");
})());

// ============================ SCHEMA-ENUM-KONSISTENZ ============================
console.log("== Schema-Enum-Konsistenz ==");
check("DECISION_LEVEL_ENUM = classification.LEVELS + unknown", (() => {
  const expected = [...c.LEVELS, "unknown"];
  return JSON.stringify(schema.DECISION_LEVEL_ENUM) === JSON.stringify(expected);
})());
check("EVENT_TYPE_ENUM = classification.EVENT_TYPES", JSON.stringify(schema.EVENT_TYPE_ENUM) === JSON.stringify(c.EVENT_TYPES));

// ============================ ASSEMBLER-INTEGRATION ============================
console.log("== Assembler: neue Felder + Embedding + Schema ==");
const aiResult = {
  was_ist_passiert: "Der Bundestag hat einen Gesetzentwurf zum Bürgergeld beschlossen.",
  warum_wichtig: "Betrifft Millionen.", wer_ist_betroffen: "Leistungsbezieher", handlungsempfehlung: "Abstimmen", zeitdruck: "hoch",
  parteien: ["SPD", "Die Linke"], ausschuesse: ["Arbeit und Soziales"], ministerien: ["BMAS"], risiken: ["Kürzung"], chancen: ["Reform"],
  mentioned_parties: ["SPD"], mentioned_committees: ["Arbeit und Soziales"], mentioned_ministries: ["BMAS"],
  mentioned_locations: ["Deutschland"], mentioned_people: [], mentioned_mps: [], mentioned_organizations: [], confidence_score: 80
};
const ko = u.assembleKnowledgeObject(aiResult, { documents: [{}, {}] }, "vorgang-test", { understanding_status: "complete", model: "gpt-5-mini" });
check("decision_level gesetzt (nie leer)", ko.decision_level === "bund");
check("political_level gespiegelt (Alt-Spalte)", ko.political_level === "bund");
check("event_type gesetzt", ko.event_type === "gesetzentwurf");
check("affected_geographies gesetzt", Array.isArray(ko.affected_geographies) && ko.affected_geographies[0].geography_id === "geo-bund");
check("decision_entities aufgeloest", ko.decision_entities.some((e) => e.entity_id === "ministry-bmas"));
check("related_entities aufgeloest", ko.related_entities.some((e) => e.entity_id === "party-spd"));
check("classification_confidence dimensioniert", ko.classification_confidence && ko.classification_confidence.level === "high");
check("embedding write-time gesetzt (256-dim Array)", Array.isArray(ko.embedding) && ko.embedding.length === 256);
check("KO bleibt schema-valide", schema.validateKnowledgeObject(ko).valid);
check("KI-Wert hat Vorrang: decision_level=land bei explizitem KI-Wert", (() => {
  const ko2 = u.assembleKnowledgeObject({ ...aiResult, decision_level: "land" }, { documents: [{}] }, "v2", {});
  return ko2.decision_level === "land" && ko2.classification_confidence.level === "high";
})());

// ============================ WHITELIST-FALLE ============================
console.log("== Storage: Whitelist ==");
check("decision_level in Lese-Whitelist", storage.V3_KNOWLEDGE_OBJECT_COLUMNS.includes("decision_level"));
check("affected_geographies in Whitelist", storage.V3_KNOWLEDGE_OBJECT_COLUMNS.includes("affected_geographies"));
check("embedding NICHT in Lese-Whitelist (Perf)", !storage.V3_KNOWLEDGE_OBJECT_COLUMNS.includes("embedding"));

// ============================ BACKFILL ============================
console.log("== Backfill: Dry-Run / execute / Idempotenz ==");
const fixtures = [
  { id: "ko-1", understanding_status: "complete", ausschuesse: ["Gesundheit"], mentioned_locations: ["Deutschland"], was_ist_passiert: "Gesetzentwurf" },
  { id: "ko-2", understanding_status: "complete", mentioned_organizations: ["Landtag Brandenburg"], mentioned_locations: ["Brandenburg"] },
  { id: "ko-3", understanding_status: "complete", decision_level: "bund" }, // schon klassifiziert -> Skip (idempotent)
  { id: "ko-4", understanding_status: "pending" } // nicht verstanden -> Skip
];
const fakeEmbed = () => new Array(256).fill(0.1);

(async () => {
  const dry = await runKoClassificationBackfill({ execute: false, limit: 100 }, {
    listKnowledgeObjects: async () => fixtures, embed: fakeEmbed
  });
  check("Dry-Run schreibt nichts (dryRun=true)", dry.dryRun === true);
  check("Kandidaten korrekt (2: ko-1, ko-2; ko-3/ko-4 uebersprungen)", dry.candidates === 2);
  check("Dry-Run-Vorschau vorhanden", Array.isArray(dry.preview) && dry.preview.length === 2);

  const written = {};
  const exec = await runKoClassificationBackfill({ execute: true, limit: 100 }, {
    listKnowledgeObjects: async () => fixtures,
    saveEnrichment: async (id, patch) => { written[id] = patch; },
    embed: fakeEmbed
  });
  check("execute verarbeitet 2 KOs", exec.processed === 2 && exec.failed === 0);
  check("ko-1 -> decision_level bund + political_level gespiegelt", written["ko-1"].decision_level === "bund" && written["ko-1"].political_level === "bund");
  check("ko-2 -> decision_level land", written["ko-2"].decision_level === "land");
  check("ko-3 NICHT angefasst (idempotent)", written["ko-3"] === undefined);
  check("ko-4 NICHT angefasst (pending)", written["ko-4"] === undefined);
  check("Backfill-Patch enthaelt embedding", Array.isArray(written["ko-1"].embedding) && written["ko-1"].embedding.length === 256);
  check("levelHist erfasst Verteilung", exec.levelHist && exec.levelHist.bund === 1 && exec.levelHist.land === 1);

  // buildClassificationPatch pur
  const patch = buildClassificationPatch({ ausschuesse: ["Finanzen"] }, { embed: fakeEmbed });
  check("buildClassificationPatch spiegelt political_level", patch.political_level === patch.decision_level);

  // ============================ MIGRATIONS-KONSISTENZ ============================
  console.log("== Migration: KO-Klassifikation additiv + Rollback ==");
  const migDir = path.join(__dirname, "..", "supabase", "migrations");
  const up = fs.readFileSync(path.join(migDir, "20260714_ko_classification.sql"), "utf8");
  const down = fs.readFileSync(path.join(migDir, "20260714_ko_classification_rollback.sql"), "utf8");
  const added = [...up.matchAll(/add column if not exists (\w+)/g)].map((m) => m[1]);
  const dropped = new Set([...down.matchAll(/drop column if exists (\w+)/g)].map((m) => m[1]));
  check("Migration ergaenzt 8 Klassifikationsspalten", added.length === 8 && added.includes("decision_level") && added.includes("affected_geographies"));
  check("Rollback entfernt jede ergaenzte Spalte", added.every((col) => dropped.has(col)));
  check("Migration ist additiv (nur ALTER ADD, kein DROP/rename an Bestand)", /alter table public\.knowledge_objects/.test(up) && !/drop column/.test(up));
  check("political_level/embedding werden NICHT neu angelegt (bestehende Spalten)", !added.includes("political_level") && !added.includes("embedding"));

  // ============================ RLS-VERSCHAERFUNG (Sprint-1-Migration) ============================
  console.log("== RLS: restriktive Quellentabellen-Policy ==");
  const srcMig = fs.readFileSync(path.join(migDir, "20260713_source_architecture.sql"), "utf8");
  check("keine permissive authenticated-Leserichtlinie mehr", !/for select to authenticated using \(true\)/.test(srcMig));
  check("RLS bleibt aktiviert (service_role-only)", /enable row level security/.test(srcMig) && /BEWUSST KEINE for-select-Policy/.test(srcMig));

  // ============================ NACHSCHAERFUNG P2/P4 ============================
  console.log("== P2: Feature-Vektor ehrlich benannt ==");
  const matching = require("../lib/helmut/matching");
  check("computeFeatureVectorForKnowledgeObject exportiert (ehrlicher Alias)", typeof matching.computeFeatureVectorForKnowledgeObject === "function");
  check("Alias === embedKnowledgeObject (kein neuer Vektor)", matching.computeFeatureVectorForKnowledgeObject === matching.embedKnowledgeObject);
  const koMig = fs.readFileSync(path.join(migDir, "20260714_ko_classification.sql"), "utf8");
  check("DB-Kommentar stellt embedding als Feature-Vektor (kein semantisches Embedding) klar", /Feature-\/Merkmalsvektor.*KEIN semantisches Embedding/.test(koMig) || /comment on column public\.knowledge_objects\.embedding is 'Technischer Feature/.test(koMig));

  console.log("== P4: geography_id/entity_id explizit string|null (nullable) ==");
  const geoItemProps = schema.KNOWLEDGE_OBJECT_SCHEMA.properties.affected_geographies.items.properties;
  const entItemProps = schema.KNOWLEDGE_OBJECT_SCHEMA.properties.decision_entities.items.properties;
  check("geography_id im Schema als nullable string deklariert", geoItemProps.geography_id && geoItemProps.geography_id.type === "string" && geoItemProps.geography_id.nullable === true);
  check("entity_id im Schema als nullable string deklariert", entItemProps.entity_id && entItemProps.entity_id.type === "string" && entItemProps.entity_id.nullable === true);
  check("null-Referenz ist valide (nullable greift)", schema.validateKnowledgeObject({
    ...ko, decision_entities: [{ name: "X", type: "party", entity_id: null }]
  }).valid);
  check("String-Referenz ist valide", schema.validateKnowledgeObject({
    ...ko, decision_entities: [{ name: "SPD", type: "party", entity_id: "party-spd" }]
  }).valid);
  check("Zahl statt string|null bleibt invalide (nullable erlaubt nur null)", !schema.validateKnowledgeObject({
    ...ko, decision_entities: [{ name: "X", type: "party", entity_id: 123 }]
  }).valid);
  check("null in Pflicht-Prosafeld bleibt invalide", !schema.validateKnowledgeObject({ ...ko, was_ist_passiert: null }).valid);

  console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);
  process.exit(fail > 0 ? 1 : 0);
})();
