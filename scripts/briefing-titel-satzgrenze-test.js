"use strict";

// Regression fuer die im 500er Beleg beobachtete 90-Zeichen-Kuerzung.
// Synthetische Texte; keine Production Profile oder gespeicherten Originalkarten.
const A = require("node:assert/strict");
const B = require("../lib/helmut/briefingContract");
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
const first = "Die zuständige Arbeitsgruppe berät mit den beteiligten Kommunen über die Finanzierung der neuen Beratungsstellen.";
const rest = " Die Entscheidung steht noch aus.";
const source = { title: "Kommunen beraten Finanzierung", summary: first + rest,
  url: "https://example.org/kommunen/beratung", source_name: "Beispielquelle",
  published_at: "2026-09-17T06:00:00Z", link_type: "direct" };

test("Lange display_summary endet an der Satzgrenze statt bei 90 Zeichen", () => {
  A.ok(first.length > 90);
  A.equal(B.koTitle({ display_summary: first + rest }, source), first);
});
test("Legacy Sachtext bleibt als ganzer erster Satz erhalten", () => {
  A.equal(B.koTitle({ was_ist_passiert: first + rest }, source), first);
});
test("Quellenzusammenfassung wird als Ersatztitel nicht abgeschnitten", () => {
  A.equal(B.koTitle({}, { summary: first + rest }), first);
});
test("Vorhandene Titel und die bestehende Feldreihenfolge bleiben erhalten", () => {
  A.equal(B.koTitle({ display_title: "Kurzer Anzeigetitel", headline: "Alter Titel", display_summary: first }, source), "Kurzer Anzeigetitel");
  A.equal(B.koTitle({ headline: "Alter Titel", display_summary: first }, source), "Alter Titel");
  A.equal(B.koTitle({}, source), source.title);
});
test("Kurzer Satz und trennbare Verbendung ein bleiben unveraendert", () => {
  const s = "Die Regierung bringt den Antrag ein.";
  A.equal(B.koTitle({ display_summary: s + rest }), s);
  A.equal(B.koTitle({ display_title: s }), s);
});
test("Langer Text ohne Satzzeichen wird nicht erfunden oder gekuerzt", () => {
  const s = first.slice(0, -1);
  A.equal(B.koTitle({ display_summary: s }), s);
  A.equal(B.koTitle({ display_summary: `  ${s.replaceAll(" ", "  ")}  ` }), s);
});
test("Fehlende Sachtexte behalten den ehrlichen bisherigen Ersatz", () => {
  A.equal(B.koTitle({ vorgang_id: "vg-beratung" }), "Beratung");
  A.equal(B.koTitle({}), "Politischer Vorgang");
});
test("Briefing, Empfehlungen, Startkarten und Detailstand tragen denselben ganzen Titel", () => {
  const ko = { id: "ko-test", vorgang_id: "vg-test", status: "neu", understanding_status: "complete",
    display_summary: first + rest, source_document_count: 1, created_at: source.published_at };
  const decision = { knowledge_object_id: ko.id, vorgang_id: ko.vorgang_id, score: 70,
    decision: "Sofort reagieren", priority_type: "action", matched_features: [], risk: "", chance: "" };
  const input = { profile: { id: "test-titel" }, decisions: [decision], kosById: { [ko.id]: ko },
    sourcesByVorgang: { [ko.vorgang_id]: [source] }, now: new Date("2026-09-17T08:00:00Z") };
  const before = JSON.stringify(input);
  const b = B.toBriefingContractV3(input);
  A.equal(b.items[0].title, first);
  A.equal(b.personalizedRecommendations[0].title, first);
  A.equal(b.homeSections.topTasks[0].title, first);
  A.equal(b.currentHelmutState.primaryItem.title, first);
  A.equal(b.currentHelmutState.headline, first);
  A.equal(b.items[0].summary, first + rest);
  A.equal(b.items[0].primarySource.url, source.url);
  A.equal(b.items[0].finalScore, 70);
  A.equal(JSON.stringify(input), before);
  A.deepEqual(B.toBriefingContractV3(input), b);
});
console.log(`${passed}/${passed} Titelgruppen erfolgreich`);
