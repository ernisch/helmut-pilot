"use strict";

// Synthetische Regression: heutige Uhrzeiten ohne das optionale Wort "bis".
// Keine echten Inhalte, kein Modell und keine fachliche Fristfreigabe.
const assert = require("node:assert/strict");
const Q = require("../lib/helmut/briefing-quellenqualitaet");
const storage = require("../lib/helmut/storage");
const decisions = require("../lib/helmut/decisions");
process.env.HELMUT_BRIEFING_RELEVANZ_TAGE = "14";
delete process.env.HELMUT_REVIEW_FIXTURE;
const evening = new Date("2026-09-13T19:10:55Z"); // Berlin 21:10
const before = new Date("2026-09-13T13:00:00Z"); // Berlin 15:00
const profile = { id: "uhrzeit-test", fullName: "Alex Beispiel", committees: ["Innenausschuss"] };
const ko = {
  id: "ko-uhrzeit", vorgang_id: "vg-uhrzeit", status: "active", understanding_status: "complete",
  headline: "Ausschuss beraet den elektronischen Ausweis",
  display_title: "Ausschuss beraet den elektronischen Ausweis",
  was_ist_passiert: "Der Ausschuss beraet den elektronischen Ausweis.",
  warum_wichtig: "Digitale Identitaet betrifft die Verwaltung.",
  recommendation: "Die Unterlagen zur Beratung vorbereiten.",
  updated_at: "2026-09-13T12:00:00Z",
  action_items_struct: [{ title: "Unterlagen einreichen", description: "Die Einladung nennt die Abgabefrist.",
    dueHint: "heute 16 Uhr", priority: "high", actionType: "delegate" }]
};
const doc = { id: "d-uhrzeit", title: ko.headline,
  summary: "Die Unterlagen zur Ausweisberatung sind am 13.09.2026 bis 16 Uhr Berliner Zeit einzureichen.",
  url: "https://www.bundestag.de/dokumente/beispiel-ausweisfrist",
  source_name: "Deutscher Bundestag", source_type: "parliament", published_at: "2026-09-13T08:00:00Z" };
let input = structuredClone(ko), docs = [structuredClone(doc)];
storage.v3StoreReady = () => true;
storage.listKnowledgeObjects = async () => structuredClone([input]);
storage.getSourcesForVorgang = async () => structuredClone(docs);
// Ranking ist nicht Gegenstand dieses Tests; der echte Builder, Zeitfilter und
// Ausgabevertrag bleiben aktiv. Der private Ursprungsbeleg nutzt echtes Ranking.
decisions.decideForUser = () => [{ knowledge_object_id: ko.id, vorgang_id: ko.vorgang_id,
  score: 60, decision: "Sofort reagieren", priority_type: "chance", matched_features: [] }];
const server = require("../server");
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("PASS " + name); }
  catch (e) { failed++; console.error("FAIL " + name + ": " + e.message); }
}
const withHint = dueHint => ({ ...ko, action_items_struct: [{ ...ko.action_items_struct[0], dueHint }] });
(async () => {
  for (const hint of ["heute 16 Uhr", "heute 18 Uhr", "Heute 16:30 Uhr", "heute 16.30 Uhr", "heute Mittag", "bis heute 16 Uhr", "bis 16 Uhr"])
    await test("Abgelaufene Frist: " + hint, () => assert.equal(Q.relativeFristZulaessig(withHint(hint), [doc], evening), false));
  await test("Heutige Uhrzeit im alten Aufgabenfeld", () => assert.equal(Q.relativeFristZulaessig({ action_items: ["Unterlagen einreichen (Frist: heute 18 Uhr)."] }, [doc], evening), false));
  await test("Heutige Uhrzeit in Handlungsempfehlung", () => assert.equal(Q.relativeFristZulaessig({ recommendation: "Heute 16 Uhr Unterlagen einreichen." }, [doc], evening), false));
  await test("Synthetisch belegte Frist bleibt vor 16 Uhr erhalten", () => assert.equal(Q.relativeFristZulaessig(ko, [doc], before), true));
  await test("Exakte Grenze ist abgelaufen", () => assert.equal(Q.relativeFristZulaessig(ko, [doc], new Date("2026-09-13T14:00:00Z")), false));
  await test("Eine Minute vor der Grenze bleibt erreichbar", () => assert.equal(Q.relativeFristZulaessig(ko, [doc], new Date("2026-09-13T13:59:00Z")), true));
  for (const hint of ["morgen 16 Uhr", "bis morgen 16 Uhr", "Morgen bis 16 Uhr", "übermorgen 16 Uhr"])
    await test("Keine Verwechslung mit heute: " + hint, () => assert.equal(Q.relativeFristZulaessig(withHint(hint), [{ ...doc, summary: `Abgabe am ${hint.includes("übermorgen") ? "15" : "14"}.09.2026 bis 16 Uhr.` }], evening), true));
  for (const hint of ["heute 16 Uhr", "bis heute 16 Uhr"])
    await test("Morgen in einem Nachbarfeld verschiebt kein explizites heute: " + hint, () => {
      const mixed = withHint(hint);
      mixed.action_items_struct[0].description = "Weitere Beratung erst morgen";
      assert.equal(Q.relativeFristZulaessig(mixed, [doc], evening), false);
      assert.equal(Q.relativeFristZulaessig(mixed, [{ ...doc, summary: doc.summary + " Weitere Beratung morgen." }], before), true);
    });
  for (const date of [null, "unbekannt", "2020-01-01T08:00:00Z", "2026-09-14T08:00:00Z"])
    await test("Fehlender, alter oder zukuenftiger Zeitbeleg: " + date, () => assert.equal(Q.relativeFristZulaessig(ko, [{ ...doc, published_at: date }], before), false));
  await test("Ohne Quelldokument keine relative Frist", () => assert.equal(Q.relativeFristZulaessig(ko, [], before), false));
  await test("Winterzeit: vor Berliner 16 Uhr", () => assert.equal(Q.relativeFristZulaessig(ko, [{ ...doc, summary: doc.summary.replace("13.09.2026", "13.01.2026"), published_at: "2026-01-13T08:00:00Z" }], new Date("2026-01-13T14:00:00Z")), true));
  await test("Winterzeit: ab Berliner 16 Uhr", () => assert.equal(Q.relativeFristZulaessig(ko, [{ ...doc, summary: doc.summary.replace("13.09.2026", "13.01.2026"), published_at: "2026-01-13T08:00:00Z" }], new Date("2026-01-13T15:00:00Z")), false));
  await test("Keine Uhrzeit erfunden bei Hintergrund ohne Frist", () => assert.equal(Q.relativeFristZulaessig({ recommendation: "Die bisherigen Erfahrungen einordnen." }, [], evening), true));
  await test("Echter Builder erhaelt die synthetisch belegte erreichbare Frist", async () => {
    const b = await server.__buildV3Briefing(profile, profile.id, { now: before });
    assert.equal(b.items.length, 1);
    assert.equal(b.personalizedRecommendations[0].actionItems[0].dueHint, "heute 16 Uhr");
    assert.equal(b.currentHelmutState.actionItems[0].dueHint, "heute 16 Uhr");
  });
  for (const hint of ["heute 16 Uhr", "heute 18 Uhr"])
    await test("Echter Builder verbreitet keine abgelaufene Frist: " + hint, async () => {
      input = withHint(hint);
      const snapshot = JSON.stringify({ input, docs });
      const b = await server.__buildV3Briefing(profile, profile.id, { now: evening });
      assert.equal(b.items.length, 0);
      assert(!JSON.stringify(b).includes(hint), "Auch abgeleitete Ansichten enthalten die Frist nicht");
      assert.equal(JSON.stringify({ input, docs }), snapshot, "Gespeicherte Eingaben bleiben erhalten");
    });
  await test("Echter Builder lehnt eine Frist ohne Quelldatum ab", async () => {
    input = structuredClone(ko); docs = [{ ...doc, published_at: null }];
    const b = await server.__buildV3Briefing(profile, profile.id, { now: before });
    assert.equal(b.items.length, 0);
  });
  await test("Echter Builder erhaelt explizites heute trotz morgiger Nachbaraufgabe", async () => {
    input = structuredClone(ko); docs = [structuredClone(doc)];
    input.action_items_struct[0].description = "Weitere Beratung erst morgen";
    docs[0].summary += " Weitere Beratung morgen.";
    const snapshot = JSON.stringify({ input, docs });
    const future = await server.__buildV3Briefing(profile, profile.id, { now: before });
    assert.equal(future.items.length, 1);
    const expired = await server.__buildV3Briefing(profile, profile.id, { now: evening });
    assert.equal(expired.items.length, 0);
    assert(!JSON.stringify(expired).includes("heute 16 Uhr"));
    assert.equal(JSON.stringify({ input, docs }), snapshot);
  });
  await test("Echter Builder erhaelt Sachinformationen und entfernt unbelegte Fristfelder", async () => {
    input = structuredClone(ko); docs = [{ ...doc, summary:null }];
    input.recommendation = "Heute 16 Uhr eine Position festlegen.";
    const snapshot = JSON.stringify({input,docs});
    const b = await server.__buildV3Briefing(profile,profile.id,{now:before});
    assert.equal(b.items.length,1);
    assert(!JSON.stringify(b).includes("heute 16 Uhr"));
    assert(!JSON.stringify(b).includes("Heute 16 Uhr"));
    assert.equal(b.personalizedRecommendations[0].actionItems[0].title,"Unterlagen einreichen");
    assert.equal(b.personalizedRecommendations[0].actionItems[0].dueHint,"");
    assert.equal(JSON.stringify({input,docs}),snapshot);
  });
  console.log(`${passed}/${passed + failed} Gruppen bestanden; ${failed} fehlgeschlagen.`);
  if (failed) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
