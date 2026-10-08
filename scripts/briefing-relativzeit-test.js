"use strict";
const assert = require("node:assert/strict");
const { zeitgebundenerText: guard } = require("../lib/helmut/briefing-relativzeit");
const contract = require("../lib/helmut/briefingContract");
const NOW = "2026-10-08T01:00:00Z";
const OLD = "2026-09-26T06:53:27Z";
const summary = "Der Deutsche Olympische Sportbund trifft heute eine Entscheidung über die nationale Bewerbung für die Olympischen Spiele.";
const src = publishedAt => ({ publishedAt, url: "https://www.tagesschau.de/inland/olympia-kandidatur-deutschland-faq-100.html" });
assert.equal(guard(summary, [src(OLD)], NOW), "");
assert.equal(guard(summary, [src(OLD)], "2026-09-26T07:00:00Z"), summary);
assert.equal(guard("Die heutige Sitzung beginnt.", [src("2026-10-07T22:30:00Z")], NOW), "Die heutige Sitzung beginnt.");
assert.equal(guard(summary, [src("2026-10-07T21:30:00Z")], NOW), "");
assert.equal(guard(summary, [src("2026-10-08T02:00:00Z")], NOW), "");
for (const value of [null, "invalid", "2026-10-08", "2026-02-30T00:00:00Z", "2026-10-08T01:00:00"]) {
  assert.equal(guard(summary, [src(value)], NOW), "");
}
assert.equal(guard(summary, [], NOW), "");
assert.equal(guard(summary, [src(OLD)], "invalid"), "");
assert.equal(guard(summary, [{ ...src(OLD), updated_at: NOW, created_at: NOW }], NOW), "");
assert.equal(guard(summary, [src(OLD), src(NOW)], NOW), "");
assert.equal(guard(summary, [{ ...src(NOW), variants: [src(OLD)], publishedAtConflict: true }], NOW), "");
assert.equal(guard(summary, [{ ...src(NOW), variants: [src("2026-10-08T00:30:00Z")] }], NOW), "");
assert.equal(guard(summary, [{ ...src(NOW), published_at: OLD }], NOW), "");
assert.equal(guard("Eine Entscheidung wurde am 26. September 2026 angekündigt.", [src(OLD)], NOW), "Eine Entscheidung wurde am 26. September 2026 angekündigt.");
assert.equal(guard("Historischer Hintergrund", [], NOW), "Historischer Hintergrund");
for (const word of ["heute", "Heute", "heutige", "heutigen", "heutiger", "heutiges", "heutigem"]) assert.equal(guard(`Die ${word} Entscheidung.`, [src(OLD)], NOW), "");
assert.equal(guard("Die Heutzutage-Aussage ist ein anderer Wortlaut.", [src(OLD)], NOW), "Die Heutzutage-Aussage ist ein anderer Wortlaut.");

const ko = { id: "ko-vg-konkurrenz-20260926-d7b030", vorgang_id: "vg-konkurrenz-20260926-d7b030",
  display_title: "DOSB entscheidet über deutsche Olympia-Bewerbung", display_summary: summary,
  was_ist_passiert: summary, updated_at: NOW, status: "active", understanding_status: "understood", ko_version: 1 };
const docs = [{ id: "rd-b57540b3d08c1499d5ca6113f8da9eaf58eb41c844aea95f02f1305dae9a953f", url: src(OLD).url,
  title: "Deutsche Olympia-Bewerbung: Wer macht das Rennen?", summary, published_at: OLD, link_type: "direct", source_type: "media" }];
const profile = { id: "local-synthetic-fixture", topics: ["Verkehr"], state: "Brandenburg" };
const args = { profile, decisions: [{ knowledge_object_id: ko.id, score: 20, decision: "Ignorieren", matched_features: [] }],
  kosById: { [ko.id]: ko }, sourcesByVorgang: { [ko.vorgang_id]: docs }, now: NOW };
const original = JSON.stringify(args);
const view = contract.toBriefingContractV3(args);
assert.equal(view.items.length, 1);
assert.equal(view.items[0].summary, "");
assert.equal(view.personalizedRecommendations[0].summary, "");
assert.equal(view.items[0].knowledgeObjectId, ko.id);
assert.equal(view.items[0].primarySource.url, docs[0].url);
assert.equal(view.items[0].primarySource.publishedAt, OLD);
assert.equal(view.items[0].sources[0].summary, summary); // Original bleibt als datierter Quellenbeleg erhalten.
assert.equal(JSON.stringify(args), original);
const current = contract.toBriefingContractV3({ ...args, now: "2026-09-26T07:00:00Z" });
assert.equal(current.items[0].summary, summary);
assert.equal(current.personalizedRecommendations[0].summary, summary);
for (const field of ["display_summary", "was_ist_passiert", "why_relevant", "warum_wichtig"]) {
  assert.equal(contract.koSummary({ [field]: summary }, null, NOW, [src(OLD)]), "");
}
assert.equal(contract.koSummary({}, { ...src(OLD), summary }, NOW), "");
const title = contract.koTitle({ vorgang_id: "vg-heute", display_summary: summary, was_ist_passiert: summary }, { ...src(OLD), summary }, NOW);
assert.equal(title, "Politischer Vorgang");
assert.equal(contract.koTitle({ display_title: "Unveränderter absoluter Titel" }, null, NOW), "Unveränderter absoluter Titel");
// Der belegte spaete Vorabend kann noch im Briefingfenster liegen, aber nicht
// als "heute" datiert werden. Auch der eigene displayTitle-Headline-Pfad muss sperren.
const previousEvening = "2026-10-07T21:30:00Z";
const lateKo = { ...ko, display_title: "DOSB trifft heute eine Entscheidung", headline: "DOSB-Entscheidung", updated_at: previousEvening };
const lateArgs = { ...args, kosById: { [ko.id]: lateKo },
  sourcesByVorgang: { [ko.vorgang_id]: [{ ...docs[0], published_at: previousEvening }] },
  decisions: [{ knowledge_object_id: ko.id, score: 70, decision: "Sofort reagieren", matched_features: [{ type: "thema", value: "Verkehr" }] }] };
const lateView = contract.toBriefingContractV3(lateArgs);
assert.ok(lateView.currentHelmutState.primaryItem, "late previous-evening fixture must reach actual primary headline");
assert.equal(lateView.currentHelmutState.primaryItem.displayTitle, "");
assert.equal(lateView.currentHelmutState.headline, "DOSB-Entscheidung");
assert.equal(lateView.items[0].title, "DOSB-Entscheidung");
assert.equal(lateView.personalizedRecommendations[0].title, "DOSB-Entscheidung");
const aliasDocs = [{ ...docs[0], published_at: NOW, publishedAt: OLD }];
const aliasView = contract.toBriefingContractV3({ ...args, sourcesByVorgang: { [ko.vorgang_id]: aliasDocs } });
assert.equal(aliasView.items[0].primarySource.publishedAtConflict, true);
assert.equal(aliasView.items[0].summary, "");
assert.equal(aliasView.personalizedRecommendations[0].summary, "");
const groupedAliasDocs = [{ ...aliasDocs[0], url: "https://www.welt.de/politik/articleaaaaaaaaaaaaaaaaaaaaaaaa/one.html" },
  { ...docs[0], url: "https://www.welt.de/politik/articleaaaaaaaaaaaaaaaaaaaaaaaa/two.html", id: "local-alias-variant", published_at: NOW }];
const groupedAliasView = contract.toBriefingContractV3({ ...args, sourcesByVorgang: { [ko.vorgang_id]: groupedAliasDocs } });
assert.equal(groupedAliasView.items[0].primarySource.publishedAtConflict, true);
assert.equal(groupedAliasView.items[0].primarySource.publishedAt, null);
assert.equal(groupedAliasView.items[0].summary, "");
console.log("briefing-relativzeit: source-day and shared-contract regressions passed (local, 0 network/model/write calls)");
