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
  A.equal(i.whyItMatters, "Für diesen Vorgang ist derzeit keine Profilzuordnung ausgewiesen.");
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
test("Fester Leerhinweis erscheint in beiden Ansichten nicht als Handlung", () => {
  const d = { ...decision, decision: "Beobachten", score: 40, priority_type: "watch",
    matched_features: [{ type: "topic", value: "Verwaltung" }] };
  const saved = structuredClone(ko);
  try {
    for (const field of ["recommendation", "handlungsempfehlung"]) {
      Object.assign(ko, saved, { recommendation: "", handlungsempfehlung: "" });
      ko[field] = "  Keine Handlung aus den gelieferten Quellen ableitbar.  ";
      const b = build(d), i = b.items[0], r = b.personalizedRecommendations[0];
      A.equal(i.recommendedAction, ""); A.equal(r.recommended_action, "");
      A.equal(i.decision, "Beobachten"); A.equal(i.finalScore, 40);
      A.equal(i.title, saved.display_title); A.equal(i.summary, saved.display_summary);
      A.equal(i.whyItMatters, saved.why_relevant); A.equal(i.riskNote, d.risk);
    }
    ko.recommendation = "Keine Handlung aus den gelieferten Quellen ableitbar.";
    ko.handlungsempfehlung = "Pruefe nach einem konkreten Auftrag die Unterlagen.";
    A.equal(build(d).items[0].recommendedAction, "");
    A.equal(build(d).personalizedRecommendations[0].recommended_action, "");
  } finally { Object.assign(ko, saved); delete ko.handlungsempfehlung; }
});
test("Bedingte Empfehlungen und qualifizierte Eingabegrenzen bleiben vollstaendig", () => {
  const d = { ...decision, decision: "Beobachten", score: 40, priority_type: "watch",
    matched_features: [{ type: "topic", value: "Verwaltung" }] };
  const saved = ko.recommendation;
  try {
    for (const text of [
      "Die Verwaltung koennte die Unterlagen pruefen; Voraussetzung ist ein konkreter Auftrag, der bisher nicht vorliegt.",
      "Keine konkrete Handlung oder Frist aus dem gelieferten Absatz ableitbar.",
      "Interne Verbreitung waere moeglich; dies ist jedoch nicht aus den Quellen ableitbar."
    ]) {
      ko.recommendation = text;
      const b = build(d);
      A.equal(b.items[0].recommendedAction, text);
      A.equal(b.personalizedRecommendations[0].recommended_action, text);
    }
  } finally { ko.recommendation = saved; }
});
console.log(`${n}/${n} Gruppen bestanden`);
