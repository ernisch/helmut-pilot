"use strict";
const assert = require("node:assert/strict");
const Q = require("../lib/helmut/lage-quellenbeleg");
const { payload } = require("./fixtures/lage-beleg");
const lage = require("../lib/helmut/lage");
const storage = require("../lib/helmut/storage");
const ai = require("../lib/helmut/ai");
const safety = require("../lib/helmut/sourceSafety");
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
const copy = structuredClone;
(async () => {
  await test("Wiederverwendung braucht Quellenpaket, Pruefung und exakte Belegstellen", () => {
    assert(Q.gespeicherterTextGueltig(payload()));
    for (const change of [p => delete p.qualitaet, p => delete p.quellen, p => p.quellenHash = "falsch",
      p => p.paragraphs.pop(), p => p.paragraphs[0].belegstellen[0].text = "Nicht belegte Behauptung",
      p => p.paragraphs[1].text = p.paragraphs[0].text]) {
      const p = payload(); change(p); assert.equal(Q.gespeicherterTextGueltig(p), false);
    }
  });
  await test("Nur Reparatur eines defekten Texts mit vollstaendiger identischer Historie ist erlaubt", () => {
    const before = { id: "bf-test-lage-2026-09-09", user_id: "test", slot: "lage",
      generated_at: "2026-09-09T05:45:00Z", payload: { paragraphs: [{ text: "Alter Text" }] } };
    const after = { ...before, generated_at: "2026-09-09T12:00:00Z", payload: { ...payload(), vorherigerStand: before } };
    assert(Q.bestandErhalten(before, copy(before))); assert(Q.bestandErhalten(before, after));
    for (const change of [a => delete a.payload.vorherigerStand, a => a.user_id = "fremd",
      a => a.generated_at = before.generated_at, a => a.payload.vorherigerStand.payload.paragraphs[0].text = "Verlust",
      a => delete a.payload.qualitaet]) {
      const a = copy(after); change(a); assert.equal(Q.bestandErhalten(before, a), false);
    }
    const validBefore = { ...before, payload: payload() };
    assert.equal(Q.bestandErhalten(validBefore, { ...after, payload: { ...payload(), vorherigerStand: validBefore } }), false);
  });
  const names = ["v3StoreReady", "listKnowledgeObjects", "listMatchingResults", "getSourcesForVorgang",
    "getRenderedBriefingV3", "saveRenderedBriefingV3", "insertRenderedBriefingV3", "acquirePipelineLock", "releasePipelineLock", "canSpendLlmForTenant"];
  const prior = Object.fromEntries(names.map(n => [n, storage[n]]));
  const generate = ai.generateLageBriefing, guard = safety.guardKnowledgeObject;
  const id = "test-reparatur", day = require("../lib/helmut/briefing-frische").berlinTagKey(new Date());
  const before = { id: `bf-${id}-lage-${day}`, user_id: id, slot: "lage",
    generated_at: new Date(Date.now() - 3600000).toISOString(), payload: { paragraphs: [{ text: "Ungepruefter Alttext" }] } };
  let row, calls, gates, saves;
  storage.v3StoreReady = () => true;
  storage.listKnowledgeObjects = async () => [{ id: "ko-beleg", vorgang_id: "vg-beleg", understanding_status: "complete",
    status: "neu", headline: "Beleg", was_ist_passiert: "Quellenbericht", updated_at: before.generated_at,
    best_source_url: "https://example.org/haushalt" }];
  storage.listMatchingResults = async () => [{ knowledge_object_id: "ko-beleg" }];
  storage.getSourcesForVorgang = async () => payload().quellen[0].quellenbelege.map(q => ({
    title: q.titel, url: q.url, source_name: "Testquelle", published_at: before.generated_at }));
  storage.getRenderedBriefingV3 = async () => copy(row);
  storage.acquirePipelineLock = async () => true;
  storage.releasePipelineLock = async () => {};
  storage.canSpendLlmForTenant = async () => ({ allowed: true });
  storage.insertRenderedBriefingV3 = async () => { throw new Error("Vorhandene Zeile darf nicht neu eingefuegt werden"); };
  storage.saveRenderedBriefingV3 = async (entry, options) => {
    saves++; assert.deepEqual(options.expectedLage, row);
    assert.deepEqual(entry.payload.vorherigerStand, row); row = copy(entry); return { saved: true };
  };
  safety.guardKnowledgeObject = () => ({ status: "ok" });
  ai.generateLageBriefing = async sources => {
    calls++;
    return { paragraphs: sources[0].quellenbelege.map(q => ({ text: q.titel + ".", vorgang_ids: ["vg-beleg"],
      quellen_ids: [q.quelle_id], belegstellen: [{ quelle_id: q.quelle_id, text: q.titel }] })), qualitaet: { version: 1 } };
  };
  const run = () => lage.buildLageBriefing({ id }, { missingOnly: true, repairIncomplete: true,
    beforeGenerate: async owner => { assert.equal(owner, id); gates++; } });
  try {
    await test("Echter Lagepfad repariert ungeprueften Bestand bedingt und behaelt volle Historie", async () => {
      row = copy(before); calls = gates = saves = 0;
      const r = await run(); assert.equal(r.available, true, JSON.stringify(r)); assert.equal(r.fromCache, false);
      assert.equal(calls, 1); assert.equal(gates, 1); assert.equal(saves, 1);
      assert.deepEqual(row.payload.vorherigerStand, before); assert(Q.gespeicherterTextGueltig(row.payload));
    });
    await test("Erneuter Reparaturabschnitt bezahlt denselben gueltigen Text nicht erneut", async () => {
      const r = await run(); assert.equal(r.reason, "existing-result"); assert.equal(calls, 1); assert.equal(saves, 1);
    });
    await test("Qualitaetsablehnung behaelt Alttext unveraendert", async () => {
      row = copy(before);
      ai.generateLageBriefing = async () => { calls++; const e = new Error("ai-text-source-support");
        e.code = "LAGE_AI_FAILURE"; e.grund = "ai-text-source-support"; throw e; };
      const r = await run(); assert.equal(r.reason, "ai-text-source-support"); assert.deepEqual(row, before);
    });
    await test("Schreibkonflikt nach Generierung meldet Fehler statt Erfolg", async () => {
      row = copy(before);
      ai.generateLageBriefing = async () => ({ paragraphs: [{ text: "Text", vorgang_ids: ["vg-beleg"] }] });
      storage.saveRenderedBriefingV3 = async () => ({ saved: false, reason: "conflict" });
      assert.equal((await run()).reason, "store-error"); assert.deepEqual(row, before);
    });
  } finally { Object.assign(storage, prior); ai.generateLageBriefing = generate; safety.guardKnowledgeObject = guard; }
  console.log(`${passed}/${passed} Reparaturpruefungen bestanden`);
})().catch(e => { console.error(e); process.exitCode = 1; });
