"use strict";
const assert = require("node:assert/strict");
const L = require("../lib/helmut/lage");
const Q = require("../lib/helmut/lage-quellenbeleg");
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log("PASS " + name); }
  catch (e) { failed++; console.log("FAIL " + name + ": " + e.message); } }
const ko = (id, title = "Ein belegter Sachverhalt") => ({ id, vorgang_id: "vg-" + id,
  status: "neu", understanding_status: "complete", headline: title, was_ist_passiert: title });
const profile = { id: "mandat-fixture", committees: ["Haushaltsausschuss"] };
function store(pool, matches, read) { return { listKnowledgeObjects: async () => pool,
  listMatchingResults: async ({ userId, limit }) => {
    assert.equal(userId, profile.id); assert.equal(limit, 12); return matches.map(id => ({ knowledge_object_id: id }));
  }, listKnowledgeObjectsByIds: read }; }
(async () => {
  await test("Passender Treffer ausserhalb des Aenderungsfensters erreicht den echten Quellenvertrag", async () => {
    const pool = Array.from({ length: 500 }, (_, i) => ko("neu-" + i));
    const wanted = ko("haushalt", "Bundestag beraet den Haushalt"), before = JSON.stringify(pool);
    let reads = 0;
    const rows = await L.loadRankedVorgaenge(store(pool, [wanted.id], async ids => {
      reads++; assert.deepEqual(ids, [wanted.id]); return [wanted];
    }), null, profile, profile.id);
    assert.equal(reads, 1); assert(rows.some(k => k.id === wanted.id));
    const input = Q.baueEingabe(rows, { [wanted.vorgang_id]: [{ title: wanted.headline,
      url: "https://example.org/haushalt", published_at: "2026-09-10T09:00:00Z" }] }, new Date("2026-09-11T09:00:00Z"), {});
    assert.equal(input.length, 1); assert.equal(input[0].vorgang_id, wanted.vorgang_id);
    assert.equal(JSON.stringify(pool), before, "Vorhandene Daten bleiben unveraendert");
  });
  await test("Ein leeres aktuelles Wissensfenster versteckt keinen vorhandenen Mandatstreffer", async () => {
    const wanted = ko("bestand");
    const rows = await L.loadRankedVorgaenge(store([], [wanted.id], async () => [wanted]), null, profile, profile.id);
    assert.deepEqual(rows.map(k => k.id), [wanted.id]);
  });
  await test("Nur fehlende Kennungen werden einmal gelesen; vorhandene und doppelte werden nicht nachgeladen", async () => {
    const current = ko("vorhanden"), wanted = ko("fehlt"); let reads = 0;
    const rows = await L.loadRankedVorgaenge(store([current], [current.id, wanted.id, wanted.id], async ids => {
      reads++; assert.deepEqual(ids, [wanted.id]); return [wanted];
    }), null, profile, profile.id);
    assert.equal(reads, 1); assert.equal(rows.length, 2); assert.equal(new Set(rows.map(k => k.id)).size, 2);
  });
  await test("Vollstaendig geladene Treffer verursachen keinen Zusatzabruf", async () => {
    const current = ko("vorhanden");
    const rows = await L.loadRankedVorgaenge(store([current], [current.id], async () => { throw new Error("Unerlaubter Zusatzabruf"); }), null, profile, profile.id);
    assert.deepEqual(rows.map(k => k.id), [current.id]);
  });
  await test("Geloeschte und unverstandene Treffer erzeugen keine Ersatzbelege", async () => {
    const pending = { ...ko("pending"), understanding_status: "pending" };
    const rows = await L.loadRankedVorgaenge(store([], [pending.id, "geloescht"], async () => [pending]), null, profile, profile.id);
    assert.deepEqual(rows, []);
  });
  await test("Fehler beim gezielten Abruf werden als Speicherstoerung weitergegeben", async () => {
    await assert.rejects(() => L.loadRankedVorgaenge(store([ko("andere")], ["fehlt"], async () => {
      throw new Error("Transportfehler");
    }), null, profile, profile.id), error => error.storeError === true);
  });
  await test("Fremde oder doppelte Rueckgabe ist kein passender Treffer", async () => {
    for (const reply of [[ko("fremd")], [ko("fehlt"), ko("fehlt")], { error: "unlesbar" }]) {
      await assert.rejects(() => L.loadRankedVorgaenge(store([ko("andere")], ["fehlt"], async () => reply), null, profile, profile.id), error => error.storeError === true);
    }
  });
  console.log(`${passed}/${passed + failed} Testgruppen bestanden.`);
  if (failed) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
