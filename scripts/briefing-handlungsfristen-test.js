"use strict";
const assert = require("node:assert/strict");
const storage = require("../lib/helmut/storage");
const decisions = require("../lib/helmut/decisions");
const Q = require("../lib/helmut/briefing-quellenqualitaet");
process.env.HELMUT_BRIEFING_RELEVANZ_TAGE = "14";
const clock = new Date("2026-09-11T08:00:00Z");
const datum = published_at => [{ published_at }];
assert.equal(Q.relativeFristZulaessig({ recommendation: "Bis Mitte der Woche abstimmen." }, datum("2020-01-01"), clock), false);
assert.equal(Q.relativeFristZulaessig({ action_items_struct: [{ title: "Abstimmen", dueHint: "Bis Freitag" }] }, datum("2020-01-01"), clock), false);
assert.equal(Q.relativeFristZulaessig({ recommended_communication_struct: { communicationLine: "Heute Stellung nehmen." } }, datum("2020-01-01"), clock), false);
assert.equal(Q.relativeFristZulaessig({ action_items: ["Binnen sieben Tagen entscheiden."] }, datum("2020-01-01"), clock), false);
assert.equal(Q.relativeFristZulaessig({ recommendation: "Heute abstimmen." }, datum("2026-08-28T08:00:00Z"), clock), true,
  "Das bestehende Relevanzfenster wird nicht verkuerzt");
assert.equal(Q.relativeFristZulaessig({ recommendation: "Heute abstimmen." }, datum("2026-08-28T07:59:59Z"), clock), false);
assert.equal(Q.relativeFristZulaessig({ recommendation: "Heute abstimmen." }, datum("2026-09-12T08:00:00Z"), clock), false);
assert.equal(Q.relativeFristZulaessig({ recommendation: "Heute abstimmen." }, datum("unbekannt"), clock), false);
assert.equal(Q.relativeFristZulaessig({ recommendation: "Historische Erfahrungen einordnen." }, datum("2020-01-01"), clock), true);
const now = new Date();
const old = "2020-03-02T08:00:00Z";
const profile = { id: "fristentest", fullName: "Alex Beispiel", committees: ["Innenausschuss"] };
const ko = { id: "ko-frist", vorgang_id: "vg-frist", status: "active", understanding_status: "complete",
  headline: "Ausschuss beraet den elektronischen Ausweis", display_title: "Ausschuss beraet den elektronischen Ausweis",
  was_ist_passiert: "Der Ausschuss beraet den elektronischen Ausweis.",
  display_summary: "Der Ausschuss beraet den elektronischen Ausweis.", warum_wichtig: "Digitale Identitaet betrifft die Verwaltung.",
  recommendation: "Morgen bis 12 Uhr eine interne Position festlegen.",
  created_at: old, updated_at: now.toISOString(),
  best_source_url: "https://www.bundestag.de/dokumente/beispiel-ausweis" };
let sourceDate = old;
let recommendation = ko.recommendation;
const snapshot = JSON.stringify(ko);
storage.v3StoreReady = () => true;
storage.listKnowledgeObjects = async () => [{ ...ko, recommendation }];
storage.getSourcesForVorgang = async () => [{ id: "d-frist", title: ko.headline,
  summary: ko.was_ist_passiert, url: ko.best_source_url, source_name: "Deutscher Bundestag",
  source_type: "parliament", published_at: sourceDate }];
decisions.decideForUser = () => [{ knowledge_object_id: ko.id, vorgang_id: ko.vorgang_id,
  score: 60, decision: "Sofort reagieren", priority_type: "chance", matched_features: [], chance: "", risk: "" }];
const server = require("../server.js");
(async () => {
  const before = await server.__buildV3Briefing(profile, profile.id);
  assert.equal(before.items.length, 0, "Alte Quellen erhalten durch updated_at keine heutige Handlungsfrist");
  assert(!JSON.stringify(before).includes(recommendation), "Auch Ableitungen und Rollen duerfen die Frist nicht verbreiten");
  sourceDate = now.toISOString();
  const current = await server.__buildV3Briefing(profile, profile.id);
  assert.equal(current.items.length, 1, "Aktuelle Quellen bleiben im bestehenden fachlichen Pruefpfad");
  assert.equal(current.items[0].recommendedAction, recommendation);
  sourceDate = old; recommendation = "Die beschriebenen Erfahrungen als Hintergrund einordnen.";
  assert.equal((await server.__buildV3Briefing(profile, profile.id)).items.length, 1,
    "Historischer Hintergrund ohne relative Handlungsfrist bleibt lesbar");
  sourceDate = null; recommendation = "Diese Woche eine Position festlegen.";
  const undated = await server.__buildV3Briefing(profile, profile.id);
  assert.equal(undated.items.length, 0, "Eine aktuelle Schreibzeit ersetzt kein belegtes Quelldatum");
  assert.equal(JSON.stringify(ko), snapshot, "Der Lesepfad schreibt keine gespeicherten Inhalte um");
  console.log("16/16 Fristenpruefungen inklusive echtem Briefinglesepfad: alte Fristen gesperrt, aktuelle Belege und Hintergrund erhalten.");
})().catch(e => { console.error(e); process.exitCode = 1; });
