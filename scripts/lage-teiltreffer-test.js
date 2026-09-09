"use strict";
const assert = require("node:assert/strict");
const L = require("../lib/helmut/lage");
const Q = require("../lib/helmut/lage-textqualitaet");
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
const ko = id => ({ id, vorgang_id: "vg-" + id, understanding_status: "complete", status: "neu",
  was_ist_passiert: "Belegter Vorgang", best_source_url: "https://example.org/" + id });
(async () => {
  await test("Ein alter Resttreffer verdraengt nicht den aktuellen mandatsbezogenen Bestand", async () => {
    const current = Array.from({ length: 15 }, (_, i) => ko("aktuell-" + i));
    const alt = ko("historisch"); let matches = 0;
    const store = { listKnowledgeObjects: async () => [alt, ...current],
      listMatchingResults: async ({ userId }) => { assert.equal(userId, "mandat-test");
        return [{ knowledge_object_id: "historisch" }, { knowledge_object_id: "ausserhalb-des-fensters" }]; } };
    const profile = { id: "mandat-test", committees: ["Arbeit und Soziales"] };
    const rows = await L.loadRankedVorgaenge(store, (p, pool) => {
      matches++; assert.equal(p, profile); assert.equal(pool.length, 16);
      return current.map(k => ({ knowledge_object_id: k.id }));
    }, profile, profile.id);
    assert.equal(matches, 1); assert.equal(rows.length, 12);
    assert(rows.some(k => k.id.startsWith("aktuell-")));
    assert.equal(new Set(rows.map(k => k.id)).size, rows.length);
  });
  await test("Vollstaendige gespeicherte Auswahl wird nicht ungefragt neu gematcht", async () => {
    const current = Array.from({ length: 12 }, (_, i) => ko("bestand-" + i));
    const store = { listKnowledgeObjects: async () => current,
      listMatchingResults: async () => current.map(k => ({ knowledge_object_id: k.id })) };
    const rows = await L.loadRankedVorgaenge(store, () => { throw new Error("Kein neuer Match erwartet"); }, {}, "mandat-test");
    assert.equal(rows.length, 12);
  });
  await test("Fachliche Ablehnungsgruende sind genau und enthalten keine Modelltexte", () => {
    const p = [{ text: "Ein belegter Vorschlag.", vorgang_ids: ["vg-test"] }];
    const d = [{ vorgang_id: "vg-test", quellenbelege: [{ quelle_id: "q-test", titel: p[0].text }] }];
    const r = { pruefungen: [{ absatz: 0, quelle_id: "q-test", beleg: p[0].text,
      vollstaendig_belegt: false, themenrein: true, profilbezug: false, textart: "konkreter_sachverhalt", pruefbegruendung: "Benannter Vorschlag mit Quellenbeleg und Bezug zum Ausschuss." }] };
    const result = Q.pruefe(p, d, r);
    assert.equal(result.ok, false); assert.equal(result.grund, "ai-text-source-support");
    assert.deepEqual(result.diagnose, { absatz: 0, fehler: ["aussage-unbelegt", "profilbezug-fehlt"] });
    assert.deepEqual(Q.sichereDiagnose({ absatz: 99, fehler: ["themen-vermischt", "privater Text"], text: "privat" }),
      { absatz: null, fehler: ["themen-vermischt"] });
    assert.equal(Q.sichereDiagnose({ fehler: ["privat"] }), null);
  });
  console.log(`${passed}/${passed} Testgruppen bestanden.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
