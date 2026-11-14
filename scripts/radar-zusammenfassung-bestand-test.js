"use strict";

// Nur neue Gegenfaelle zur Bestandszahl: kein Netz, keine Modelle oder DB.
const A = require("node:assert/strict");
const R = require("../lib/helmut/radarState");
if (process.argv.length !== 2) throw new Error("Unbekannte Testargumente");
let anzahl = 0;
function test(name, fn) { fn(); anzahl++; console.log("PASS " + name); }

const now = new Date("2026-11-14T08:04:22Z");
const profile = { id: "radar-bestand-synthetisch", fullName: "Alex Beispiel",
  party: "Testpartei", focusTopics: ["Pflege"] };
const iso = day => `2026-11-${String(day).padStart(2, "0")}T07:00:00Z`;
const ko = (id, title, extra = {}) => ({ id: `ko-${id}`, vorgang_id: `vg-${id}`,
  status: "neu", understanding_status: "complete", display_title: title,
  created_at: iso(7), updated_at: iso(14), ...extra });
const doc = (id, title, day) => ({ id: `rd-${id}`, title,
  summary: title, url: `https://example.org/radar/${id}`,
  source_name: "Synthetische Testquelle", source_type: "media", published_at: iso(day) });

test("Heutige Umfeldquelle macht Gesamtstand frisch, drei alte Dynamiken bleiben neutrale Beobachtungen", () => {
  const party = ko("umfeld", "Testpartei beschliesst eine Resolution", { parteien: ["Testpartei"] });
  const dynamics = [13, 12, 8].map(day => ko(`pflege-${day}`, `Pflegeversicherung: Bericht ${day}`,
    { was_ist_passiert: "Die Pflegeversicherung wird reformiert.", source_document_count: 3 }));
  const kos = [party, ...dynamics];
  const args = { profile, now, knowledgeObjects: kos,
    kosById: Object.fromEntries(kos.map(k => [k.id, k])),
    decisions: kos.map(k => ({ knowledge_object_id: k.id, score: 70,
      matched_features: k === party ? [{ type: "partei", value: "Testpartei" }] : [] })),
    sourcesByVorgang: {
      [party.vorgang_id]: [doc("umfeld-alt", party.display_title, 13), doc("umfeld-heute", party.display_title, 14)],
      ...Object.fromEntries(dynamics.map((k, i) => [k.vorgang_id,
        [0, 1, 2].map(offset => doc(`pflege-${[13, 12, 8][i]}-${offset}`, k.display_title, [13, 12, 8][i] - offset))]))
    } };
  const before = JSON.stringify(args);
  const state = R.buildCurrentRadarState(args), visible = state.anzeige;
  A.equal(visible.environment.party.length, 1);
  A.equal(visible.environment.party[0].publishedAt, iso(14));
  A.equal(visible.environment.party[0].beobachtungsBeleg.publishedAt, iso(14));
  A.equal(visible.dynamics.length, 3);
  A.deepEqual(visible.dynamics.map(d => d.lastUpdatedAt).sort(), [iso(8), iso(12), iso(13)].sort());
  A.equal(visible.mentions.length, 0); A.equal(visible.articles.length, 0);
  A.equal(visible.lastUpdated, iso(14)); A.equal(visible.status, "fresh");
  A.equal(state.lastUpdated, iso(14)); A.equal(state.status, "fresh");
  for (const summary of [state.summary, visible.summary]) {
    A.equal(summary.line2, "In deinem politischen Umfeld werden 3 Entwicklungen beobachtet.");
    A.doesNotMatch(summary.line2, /neu|heute|gelesen|ungelesen/i);
    A.ok(summary.text.includes(summary.line2));
  }
  A.equal(JSON.stringify(args), before, "Zusammenfassung veraendert keine Auswahl oder Quellenzeiten");
});

test("Auch eine alte Dynamik bekommt im Singular keine unbelegte Neuigkeitsbehauptung", () => {
  const environment = { party: [], constituency: [], committees: [] };
  const dynamics = [{ lastUpdatedAt: iso(8), sourceUrl: "https://example.org/radar/alt" }];
  for (const options of [{}, { nurAnzeige: true }]) {
    const summary = R.buildSummary([], environment, dynamics, now, options);
    A.equal(summary.line2, "In deinem politischen Umfeld wird eine Entwicklung beobachtet.");
    A.doesNotMatch(summary.line2, /neu|heute|gelesen|ungelesen/i);
  }
});

console.log(`${anzahl}/${anzahl} neue Radar-Bestandsgruppen bestanden; rein lokal.`);
