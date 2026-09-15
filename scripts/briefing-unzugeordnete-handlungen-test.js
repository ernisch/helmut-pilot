"use strict";
const A = require("node:assert/strict");
const B = require("../lib/helmut/briefingContract");
const now = new Date("2026-09-15T13:58:24.881Z");
const profile = { id: "unzugeordnet-test", constituency: "Testwahlkreis 001" };
const ko = { id: "ko-test", vorgang_id: "vg-test", understanding_status: "complete", status: "ready",
  display_title: "Bericht ueber kommunale Verwaltung", display_summary: "Die Quelle beschreibt eine kommunale Verwaltung.",
  why_relevant: "Gefaehrdet die Fristwahrung in deinem Wahlkreis und erfordert dein sofortiges Handeln.",
  recommendation: "Nimm sofort Kontakt zur Verwaltung in deinem Wahlkreis auf.",
  risk_of_no_action: "Deinem Mandat droht ein persoenlicher Nachteil.", opportunity_summary: "Deine Fraktion profitiert.",
  recommended_communication: "Veroeffentliche eine politische Stellungnahme.",
  action_items: ["Starte eine oeffentliche Kampagne."], created_at: now.toISOString(), updated_at: now.toISOString() };
const docs = [{ id: "rd-test", url: "https://example.org/bericht/verwaltung-12345", title: ko.display_title,
  summary: ko.display_summary, published_at: now.toISOString() }];
const decision = { knowledge_object_id: ko.id, vorgang_id: ko.vorgang_id, score: 0,
  decision: "Ignorieren", priority_type: "ignore", matched_features: [], risk: ko.risk_of_no_action, chance: ko.opportunity_summary };
const original = structuredClone({ ko, docs, decision, profile });
const build = d => B.toBriefingContractV3({ profile, decisions: [d], kosById: { [ko.id]: ko },
  sourcesByVorgang: { [ko.vorgang_id]: docs }, now });
let n = 0;
function test(name, fn) { fn(); console.log("PASS " + name); n++; }
test("Ignorierter Vorgang ohne Profilzuordnung uebernimmt keine globale Profilbehauptung", () => {
  const b = build(decision), i = b.items[0];
  A.equal(i.whyItMatters, "Für diesen Vorgang ist kein konkreter Bezug zum gespeicherten Profil belegt.");
  A.equal(i.recommendedAction, ""); A.equal(i.riskNote, ""); A.equal(i.opportunityNote, "");
  A.equal(i.summary, ko.display_summary); A.equal(i.title, ko.display_title);
  A.equal(i.sources[0].url, docs[0].url); A.equal(i.sourceCount, 1);
  A.equal(i.decision, "Ignorieren"); A.equal(i.finalScore, 0); A.deepEqual(i.matchedFeatures, []);
});
test("Empfehlungsansicht enthaelt ebenfalls keine erfundenen Mandatsauftraege", () => {
  const r = build(decision).personalizedRecommendations[0];
  for (const k of ["recommended_action", "consequence_if_ignored", "possible_upside", "riskOfNoAction", "opportunitySummary"])
    A.equal(r[k], "", k);
  A.equal(r.recommendedCommunication.communicationLine, ""); A.deepEqual(r.actionItems, []);
  A.equal(r.lastUpdatedAt, ko.updated_at); A.equal(r.helmutQualityStatus, "empty");
  A.equal(r.action_type, "ignore"); A.equal(r.personal_relevance_explanation, build(decision).items[0].whyItMatters);
});
test("Fehlende Zuordnungsangabe ist kein Beleg", () => {
  const d = { ...decision }; delete d.matched_features;
  A.equal(build(d).items[0].recommendedAction, "");
});
test("Vorhandene Zuordnung bleibt fachlich gesondert zu pruefen, bisherige Ausgabe bleibt erhalten", () => {
  const b = build({ ...decision, matched_features: [{ type: "ausschuss", value: "Rechtsausschuss" }] });
  A.equal(b.items[0].whyItMatters, ko.why_relevant); A.equal(b.items[0].recommendedAction, ko.recommendation);
});
test("Nicht ignorierte Entscheidungen werden durch diesen engen Riegel nicht umgestuft", () => {
  const b = build({ ...decision, decision: "Beobachten", score: 40, priority_type: "watch" });
  A.equal(b.items[0].decision, "Beobachten"); A.equal(b.items[0].whyItMatters, ko.why_relevant);
});
test("Keine Mutation der gespeicherten Eingaben und keine erfundene Fachfreigabe", () => {
  const b = build(decision);
  A.deepEqual({ ko, docs, decision, profile }, original);
  A.equal(b.currentHelmutState.primaryVorgangId, null);
  A.equal(Object.hasOwn(b, "fachlicheFreigabe"), false);
  A.equal(Object.hasOwn(b, "funktionsnachweis500"), false);
});
test("Vorhandener Verarbeitungsfehler bleibt trotz geleerter Handlung sichtbar", () => {
  const previous = ko.understanding_status;
  try {
    ko.understanding_status = "failed";
    const r = build(decision).personalizedRecommendations[0];
    A.equal(r.helmutQualityStatus, "error");
    A.equal(r.recommended_action, ""); A.deepEqual(r.actionItems, []);
  } finally { ko.understanding_status = previous; }
});
console.log(`${n}/${n} Gruppen bestanden`);
