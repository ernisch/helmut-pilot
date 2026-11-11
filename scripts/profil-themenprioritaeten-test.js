"use strict";

// Fiktive Gegenprofile und reine Funktionen: kein Netz, Modell oder Schreiben.
const A = require("node:assert/strict");
const T = require("../lib/helmut/themenprioritaeten");
const M = require("../lib/helmut/matching");
const D = require("../lib/helmut/decisions");
const S = require("../lib/helmut/scoring");
const P = require("../lib/helmut/lage-profilbezug");
const Q = require("../lib/helmut/lage-textqualitaet");
const B = require("../lib/helmut/briefing-speicher");
const C = require("../lib/helmut/scheduler");
let passed = 0;
function test(name, fn) { fn(); passed++; console.log("PASS " + name); }
const now = Date.parse("2026-11-11T12:00:00Z");
const profile = priority => ({ id: "lokal-themenauswahl", focusTopics: ["Pflege", "Wohnen", "Energie"],
  topicPriorities: { Pflege: priority, Wohnen: 2, Energie: 4, Abgewaehlt: 5 } });
const ko = (id, topic, cosine) => ({ id, vorgang_id: "vg-" + id, status: "neu", understanding_status: "complete",
  headline: topic + ": Neuer Gesetzentwurf vorgestellt", was_ist_passiert: topic + ": Neuer Gesetzentwurf vorgestellt",
  tags: [topic], policy_field: [topic], created_at: new Date(now).toISOString(),
  embedding: [cosine, Math.sqrt(1 - cosine * cosine)], source_document_count: 1 });
const pool = [ko("pflege", "Pflege", 0.6), ko("wohnen", "Wohnen", 0.65), ko("energie", "Energie", 0.75)];

test("Aktive Auswahl einschliesslich Normal gewinnt gegen alte Reglerschluessel", () => {
  A.deepEqual(T.activeTopics(profile(1)), ["Pflege", "Wohnen", "Energie"]);
  A.deepEqual(T.activeTopics({ focusTopics: [], topicPriorities: { Pflege: 5 } }), []);
  A.deepEqual(C.topProfileTopics({ focusTopics: ["Pflege"], topicPriorities: { Pflege: 1, Wohnen: 5 } }), ["Pflege"]);
  A.deepEqual(M.profileFeatures({ focusTopics: [], topicPriorities: { Pflege: 5 } }).topics, []);
});
test("Legacylisten und Zwischenwerte bleiben unterstuetzt, fehlendes Gewicht ist neutral", () => {
  A.deepEqual(T.activeTopics({ fachpolitische_schwerpunkte: ["Pflege"] }), ["Pflege"]);
  A.deepEqual(T.activeTopics({ topicPriorities: { Pflege: 5, Wohnen: 2 } }), ["Pflege"]);
  A.equal(T.priority({ focusTopics: ["Pflege"] }, "Pflege"), 1);
  A.equal(T.priority({ focusTopics: ["Pflege"], topicPriorities: { Pflege: "ungueltig" } }, "Pflege"), 1);
  A.deepEqual([1, 2, 3, 4, 5].map(value => T.priority(profile(value), "Pflege")), [1, 2, 3, 4, 5]);
});
test("1/3/5 veraendern passende Entscheidungswerte und persoenliche Relevanz monoton", () => {
  const scores = [], relevance = [], hashes = [];
  for (const value of [1, 3, 5]) {
    const p = profile(value), row = D.decideForUser(p, [pool[0]])[0];
    scores.push(row.score); relevance.push(S.personalRelevance(pool[0], p, { now }).score); hashes.push(M.profileHash(p));
  }
  A(scores[0] < scores[1] && scores[1] < scores[2], JSON.stringify(scores));
  A(relevance[0] < relevance[1] && relevance[1] < relevance[2], JSON.stringify(relevance));
  A.equal(new Set(hashes).size, 3);
  console.log("  Entscheidung " + scores.join("/") + ", Relevanz " + relevance.join("/"));
});
test("Matching priorisiert bestaetigte Themen, ohne Kosinusaehnlichkeit umzudefinieren", () => {
  const p = value => ({ ...profile(value), topicPriorities: { Pflege: value, Wohnen: 1, Energie: 1 } });
  const rows = [1, 3, 5].map(value => M.matchProfileToKnowledgeObjects(p(value), pool, { profileEmbedding: [1, 0] }));
  A.deepEqual(rows.map(list => list.find(row => row.knowledge_object_id === "pflege").rank), [3, 2, 1]);
  for (const list of rows) A.equal(list.find(row => row.knowledge_object_id === "pflege").similarity, 0.6);
});
test("Nichttreffer, Pending, harte Filter und das Radar-Naehegate erhalten keinen Bonus", () => {
  const other = ko("fremd", "Astronomie", 0.1);
  A.deepEqual(D.decideForUser(profile(1), [other]), D.decideForUser(profile(5), [other]));
  A.equal(S.personalRelevance(other, profile(5), { now }).score, 0);
  A.equal(P.bewerte(other, profile(5)).passt, false);
  A.equal(M.matchProfileToKnowledgeObjects(profile(5), [{ ...pool[0], status: "pending" }]).length, 0);
  A.equal(M.matchProfileToKnowledgeObjects(profile(5), [pool[0]], { filters: { parties: ["Szenariopartei"] } }).length, 0);
  A.deepEqual(D.decideForUser({ focusTopics: [], topicPriorities: { Pflege: 5 }, id: "lokal-leer" }, [pool[0]])[0].matched_features, []);
});
test("Lage gewichtet nur belegte aktive Fachthemen und ordnet 1/3/5 unterschiedlich", () => {
  const ranks = [], weights = [];
  for (const value of [1, 3, 5]) {
    const p = profile(value), rows = P.auswahl(pool, p);
    ranks.push(rows.findIndex(row => row.id === "pflege") + 1); weights.push(P.bewerte(pool[0], p).gewicht);
    const docs = { "vg-pflege": [{ title: pool[0].headline, summary: pool[0].was_ist_passiert }] };
    A.equal(P.mitQuellenbezug([pool[0]], p, docs).length, 1);
    A.equal(P.mitQuellenbezug([pool[0]], p, { "vg-pflege": [{ title: "Astronomie: Neue Beobachtung" }] }).length, 0);
  }
  A.deepEqual(ranks, [3, 2, 1]); A.deepEqual(weights, [75, 80, 85]);
  const p = profile(5); p.committees = ["Gesundheit"];
  A(P.bewerte(pool[0], p).gewicht > P.bewerte(pool[0], { ...p, topicPriorities: { Pflege: 1 } }).gewicht);
});
test("Quellensuche verwendet aktive Themen und deren echte Reihenfolge", () => {
  A.deepEqual(C.topProfileTopics(profile(1)), ["Energie", "Wohnen", "Pflege"]);
  A.deepEqual(C.topProfileTopics(profile(5)), ["Pflege", "Energie", "Wohnen"]);
  const sources = C.mandateNewsSources({ ...profile(1), location: "Szenario-Ort" });
  A(sources.some(source => source.id.endsWith("-news-region") && source.queryTerms.includes("Szenario-Ort")));
  A(sources.every(source => !source.queryTerms.includes("Abgewaehlt")));
  A.equal(C.filterRelevantItemsForProfile([{ title: "Pflege: Gesetzentwurf vorgestellt", content: "Pflegegesetz wird beraten",
    sourceName: "Lokale Testquelle", sourceType: "media", publishedAt: new Date(now).toISOString() }],
    { id: "lokal-normal", focusTopics: ["Pflege"], topicPriorities: { Pflege: 1 } }).length, 1);
});
test("Lagehash bindet alle Modell-/Auswahlfelder und ignoriert verwaiste Gewichte", () => {
  const p = { ...profile(1), party: "Szenariopartei A", faction: "Szenariofraktion A", governmentRole: "opposition",
    location: "Szenario-Ort", regionalInterests: ["Szenario-Region"] }, hash = P.hashProfil(p);
  for (const [field, value] of Object.entries({ party: "Szenariopartei B", faction: "Szenariofraktion B",
    governmentRole: "regierung", location: "Anderer Szenario-Ort", regionalInterests: ["Andere Szenario-Region"] }))
    A.notEqual(P.hashProfil({ ...p, [field]: value }), hash, field);
  A.equal(P.hashProfil({ ...p, topicPriorities: { ...p.topicPriorities, Abgewaehlt: 1 } }), hash);
  const model = Q.modellProfilKontext(p);
  A.equal(model.ort, p.location); A.deepEqual(model.regionale_interessen, p.regionalInterests);
  A(!Object.hasOwn(model.themengewichte, "Abgewaehlt"));
  A(P.bewerte(ko("ort", "Szenario-Ort", 0), { location: "Szenario-Ort" }).passt);
});
test("Historischer Profilkontext bleibt erhalten und fehlende Gewichte sind neutral", () => {
  const p = { committees: ["Petitionsausschuss"], focusTopics: ["Pflege"] };
  A.deepEqual(Q.modellProfilKontext(p), Q.profilKontext(p));
  const historical = B.profilHash(p);
  A.equal(B.profilHash({ ...p, location: "Szenario-Ort" }), historical);
  A.equal(D.decideForUser({ ...p, id: "lokal-neutral" }, [pool[0]])[0].score,
    D.decideForUser({ ...p, id: "lokal-neutral", topicPriorities: { Pflege: 1 } }, [pool[0]])[0].score);
});
(async () => {
  // Der produktive Matchingpfad bekommt ausschliesslich injizierte Speicher-
  // funktionen. Rang, Evidenzgate und Hash werden am wirklichen Aufruf geprueft.
  const ranks = [];
  for (const value of [1, 3, 5]) {
    const p = { ...profile(value), topicPriorities: { Pflege: value, Wohnen: 1, Energie: 1 } };
    let saved, hash;
    await M.runMatchingShadow({ profile: p }, {
      enabled: () => true, auditEnabled: () => false, relevanzGateEnabled: () => true,
      saveProfileEmbedding: async entry => { hash = entry.profile_hash; },
      matchByEmbedding: async () => ({ results: [...pool].reverse().map(k => ({ id: k.id,
        vorgang_id: k.vorgang_id, similarity: k.embedding[0] })) }),
      listKnowledgeObjectsByIds: async () => pool,
      saveMatchingResults: async rows => { saved = rows; return { saved: rows.length }; }
    });
    A.equal(hash, M.profileHash(p));
    A.equal(saved.length, 3);
    A.equal(saved.find(row => row.knowledge_object_id === "pflege").similarity, 0.6);
    ranks.push(saved.find(row => row.knowledge_object_id === "pflege").rank);
  }
  A.deepEqual(ranks, [3, 2, 1]); passed++;
  console.log("PASS Produktiver Matchingpfad persistiert gewichtete Raenge hinter unveraendertem Evidenzgate");
  console.log(passed + "/" + passed + " Themenprioritaetsgruppen bestanden.");
})().catch(error => { console.error(error); process.exitCode = 1; });
