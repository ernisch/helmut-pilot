"use strict";
const assert = require("node:assert/strict");
const Q = require("../lib/helmut/briefing-quellenqualitaet");
const storage = require("../lib/helmut/storage");
const decisions = require("../lib/helmut/decisions");
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("PASS " + name); }
  catch (e) { failed++; console.error("FAIL " + name + ": " + e.message); }
}
const ko = { id: "ko-quellenpflicht", vorgang_id: "vg-quellenpflicht", status: "active",
  understanding_status: "complete", display_title: "Bericht zur kommunalen Energieberatung",
  was_ist_passiert: "Die Kommune stellt ihren Bericht zur Energieberatung vor.",
  warum_wichtig: "Die Energieberatung betrifft kommunale Aufgaben.",
  recommendation: "Den Bericht fachlich einordnen.", updated_at: new Date().toISOString() };
const doc = { id: "d-quellenpflicht", title: ko.display_title, summary: ko.was_ist_passiert,
  url: "https://www.bundestag.de/dokumente/beispiel-energieberatung",
  source_name: "Deutscher Bundestag", source_type: "parliament", published_at: new Date().toISOString() };
(async () => {
  await test("Ohne Dokument entsteht keine Quellenbindung", () => assert.equal(Q.quellengebunden(ko, []), false));
  await test("Ein Quelltitel ohne auslieferbare URL reicht nicht", () => assert.equal(Q.quellengebunden(ko, [{ ...doc, url: null }]), false));
  await test("Ein Portal statt eines Artikels reicht nicht", () => assert.equal(Q.quellengebunden(ko, [{ ...doc, url: "https://www.bundestag.de/" }]), false));
  await test("Eine ungueltige bevorzugte URL wird nicht durch canonical verdeckt", () => assert.equal(Q.quellengebunden(ko, [{ ...doc, url: "javascript:alert(1)", canonical_url: doc.url }]), false));
  await test("Ein alter best_source_url ersetzt kein Quelldokument", () => assert.equal(Q.quellengebunden({ ...ko, best_source_url: doc.url }, []), false));
  await test("Ein konkretes Quelldokument bleibt zulaessig", () => assert.equal(Q.quellengebunden(ko, [doc]), true));
  await test("Eine alleinige kanonische Artikeladresse bleibt zulaessig", () => assert.equal(Q.quellengebunden(ko, [{ ...doc, url: null, canonical_url: doc.url }]), true));
  const old = [{ ...doc, published_at: "2020-03-20T08:00:00Z" }], now = new Date("2026-09-11T08:00:00Z");
  for (const text of ["Bis Monatsende entscheiden.", "In einer Woche abstimmen.", "Innerhalb von zwei Wochen pruefen.", "Bis Ende des Monats vorlegen.", "Bis Mitte nächster Woche abstimmen.", "Bis Ende kommender Woche vorlegen."])
    await test("Alte Quelle traegt keine Frist: " + text, () => assert.equal(Q.relativeFristZulaessig({ recommendation: text }, old, now), false));
  await test("Aktuelle Quelle behaelt die bestehende Alterspruefung", () => assert.equal(Q.relativeFristZulaessig({ recommendation: "Bis Monatsende entscheiden." }, [doc], new Date()), true));
  await test("Historischer Hintergrund ohne neue Frist bleibt erhalten", () => assert.equal(Q.relativeFristZulaessig({ recommendation: "Historische Erfahrungen fachlich einordnen." }, old, now), true));
  const sommer = new Date("2026-09-11T11:00:00Z"), winter = new Date("2026-01-11T10:00:00Z");
  const aktuell = at => [{ ...doc, published_at: new Date(at.getTime()-60000).toISOString() }];
  await test("Heutiger Mittag ist nach Berliner Mittag nicht mehr zulaessig", () => assert.equal(Q.relativeFristZulaessig({ recommendation: "Bis heute Mittag abstimmen." }, aktuell(sommer), sommer), false));
  await test("Heutige Uhrzeit bleibt vor ihrer Grenze zulaessig", () => assert.equal(Q.relativeFristZulaessig({ recommendation: "Bis heute 14 Uhr abstimmen." }, aktuell(sommer), sommer), true));
  await test("Uhrzeit an ihrer Grenze ist abgelaufen", () => assert.equal(Q.relativeFristZulaessig({ recommendation: "Bis 13 Uhr abstimmen." }, aktuell(sommer), sommer), false));
  await test("Berliner Winterzeit wird korrekt verwendet", () => assert.equal(Q.relativeFristZulaessig({ recommendation: "Bis heute Mittag abstimmen." }, aktuell(winter), winter), true));
  await test("Morgen vor der Uhrzeit bleibt ein zukuenftiger Auftrag", () => assert.equal(Q.relativeFristZulaessig({ recommendation: "Morgen bis 12 Uhr abstimmen." }, aktuell(sommer), sommer), true));
  await test("Morgen nach bis bleibt ein zukuenftiger Auftrag", () => assert.equal(Q.relativeFristZulaessig({ recommendation: "Bis morgen 12 Uhr abstimmen." }, aktuell(sommer), sommer), true));
  const profile = { id: "quellenpflicht-test", fullName: "Alex Beispiel", committees: ["Innenausschuss"] };
  const ohne = { ...ko, id: "ko-ohne-quelle", vorgang_id: "vg-ohne-quelle",
    display_title: "Unbelegte Sondersteuer", was_ist_passiert: "Eine neue Sondersteuer soll Einnahmen bringen." };
  const original = JSON.stringify({ ko, ohne, doc });
  storage.v3StoreReady = () => true;
  storage.listKnowledgeObjects = async () => [ohne, ko];
  storage.getSourcesForVorgang = async id => id === ko.vorgang_id ? [doc] : [];
  decisions.decideForUser = () => [ohne, ko].map((k, i) => ({ knowledge_object_id: k.id,
    vorgang_id: k.vorgang_id, score: 80-i*10, decision: "Sofort reagieren", priority_type: "chance", matched_features: [] }));
  const server = require("../server");
  await test("Echter Briefingpfad liefert nur den quellengebundenen Eintrag", async () => {
    const b = await server.__buildV3Briefing(profile, profile.id);
    assert.equal(b.items.length, 1);
    assert.equal(b.items[0].vorgangId, ko.vorgang_id);
    assert.equal(b.currentHelmutState.primaryVorgangId, ko.vorgang_id);
    assert(!JSON.stringify(b).includes(ohne.display_title));
  });
  await test("Die Lesepruefung veraendert keinen gespeicherten Inhalt", () => assert.equal(JSON.stringify({ ko, ohne, doc }), original));
  console.log(`${passed}/${passed+failed} Quellenpflichtgruppen bestanden`);
  if (failed) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
