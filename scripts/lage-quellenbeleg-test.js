"use strict";

const assert = require("node:assert/strict");
const Q = require("../lib/helmut/lage-quellenbeleg");
const lage = require("../lib/helmut/lage");
const ai = require("../lib/helmut/ai");
const storage = require("../lib/helmut/storage");
const safety = require("../lib/helmut/sourceSafety");
let bestanden = 0;
async function pruefe(name, fn) { await fn(); bestanden++; console.log("OK " + name); }
const jetzt = new Date("2026-09-07T08:00:00Z");
const ko = { id: "ko-test", vorgang_id: "vg-test", status: "neu", understanding_status: "complete",
  headline: "Unbelegte Modellbehauptung", was_ist_passiert: "Erfundene Rechtsfolge", updated_at: jetzt.toISOString(),
  best_source_url: "https://example.org/quelle" };
const quelle = { title: "Bericht ueber einen Vorschlag", summary: "Eine Beratung ist vorgesehen.",
  source_name: "Testquelle", url: ko.best_source_url, published_at: "2026-09-06T12:00:00Z" };
const input = (docs, date = jetzt) => Q.baueEingabe([ko], { "vg-test": docs }, date);

(async () => {
  await pruefe("Analyse von heute macht Quelle von 2023 nicht aktuell", () => {
    assert.deepEqual(input([{ ...quelle, published_at: "2023-01-10T05:50:22Z", retrieved_at: jetzt.toISOString() }]), []);
  });
  await pruefe("Unbelegte, zukuenftige und undatierte Quellen sperren neue KI Arbeit", () => {
    assert.deepEqual(input([{ ...quelle, published_at: null }, { ...quelle, published_at: "ungueltig" },
      { ...quelle, published_at: "2026-09-08T08:00:00Z" }, { ...quelle, url: "javascript:1" }]), []);
  });
  await pruefe("Vierzehntagegrenze aus bestehendem Frischevertrag", () => {
    assert.equal(input([{ ...quelle, published_at: "2026-08-24T08:00:00Z" }]).length, 1);
    assert.equal(input([{ ...quelle, published_at: "2026-08-24T07:59:59Z" }]).length, 0);
  });
  await pruefe("Prompt enthaelt Quellen und Datum, keine fruehere Halluzination", () => {
    const p = ai.buildLageBriefingPrompt(input([quelle]), {}, { briefingDatum: jetzt.toISOString() });
    assert(p.includes(quelle.title) && p.includes(quelle.summary) && p.includes("2026-09-06T12:00:00.000Z"));
    assert(!p.includes(ko.headline) && !p.includes(ko.was_ist_passiert));
  });
  await pruefe("Quellenmenge und Eingabe bleiben auch bei langen Quellen begrenzt", () => {
    const kos = Array.from({ length: 12 }, (_, i) => ({ ...ko, vorgang_id: "vg-" + i }));
    const docs = Object.fromEntries(kos.map(k => [k.vorgang_id, Array.from({ length: 20 }, (_, i) =>
      ({ ...quelle, url: "https://example.org/" + i, title: "A".repeat(1000), summary: "B".repeat(5000) }))]));
    const r = Q.baueEingabe(kos, docs, jetzt);
    assert(r.length > 0 && r.every(v => v.quellenbelege.length <= Q.MAX_BELEGE));
    assert(JSON.stringify(r).length <= Q.MAX_EINGABE_ZEICHEN);
  });
  await pruefe("Quellenkorrektur invalidiert Cache ohne KO Aenderung", () => {
    const a = input([quelle]);
    assert.notEqual(Q.hashEingabe(a), Q.hashEingabe(input([{ ...quelle, summary: "Beratung abgesagt." }])));
    const payload = { paragraphs: [{ text: "Text", vorgang_ids: ["vg-test"] }], koSetHash: "k", quellenHash: Q.hashEingabe(a), quellenVersion: Q.VERSION };
    assert(Q.cacheGueltig(payload, "k", Q.hashEingabe(a), a));
    assert(!Q.cacheGueltig({ ...payload, quellenVersion: undefined }, "k", Q.hashEingabe(a), a));
    assert(!Q.cacheGueltig(payload, "anderer-ko", Q.hashEingabe(a), a));
  });
  await pruefe("Unbekannte Referenz verwirft den ganzen Absatz", () => {
    const p = [{ text: "Ohne Beleg", vorgang_ids: [] }, { text: "Gemischt", vorgang_ids: ["vg-test", "vg-fremd"] },
      { text: "Belegt", vorgang_ids: ["vg-test"] }];
    assert.deepEqual(ai.assembleLageParagraphs({ paragraphs: p }, ["vg-test"]), [p[2]]);
    assert.deepEqual(Q.gueltigeAbsaetze(p, input([quelle])), [p[2]]);
  });

  const namen = ["v3StoreReady", "listKnowledgeObjects", "listMatchingResults", "getSourcesForVorgang",
    "getRenderedBriefingV3", "saveRenderedBriefingV3", "acquirePipelineLock", "releasePipelineLock", "canSpendLlmForTenant"];
  const vorher = Object.fromEntries(namen.map(n => [n, storage[n]]));
  const vorAi = ai.generateLageBriefing, vorSafety = safety.guardKnowledgeObject;
  let calls = 0, saved = null, lock = true, cached = null;
  let docs = [{ ...quelle, published_at: new Date(Date.now() - 3600000).toISOString() }];
  storage.v3StoreReady = () => true;
  storage.listKnowledgeObjects = async () => [ko];
  storage.listMatchingResults = async () => [{ knowledge_object_id: ko.id }];
  storage.getSourcesForVorgang = async () => docs;
  storage.getRenderedBriefingV3 = async () => cached;
  storage.saveRenderedBriefingV3 = async (r) => { saved = r; return { saved: true }; };
  storage.acquirePipelineLock = async () => { if (lock instanceof Error) throw lock; return lock; };
  storage.releasePipelineLock = async () => {};
  storage.canSpendLlmForTenant = async () => ({ allowed: true });
  safety.guardKnowledgeObject = () => ({ status: "ok" });
  ai.generateLageBriefing = async (v) => { calls++; assert(!JSON.stringify(v).includes(ko.was_ist_passiert));
    return { paragraphs: [{ text: "Die Quelle berichtet von einem Vorschlag.", vorgang_ids: ["vg-test"] }] }; };
  try {
    await pruefe("Echter Lagepfad speichert neue Quellenbindung und nutzt passenden Cache", async () => {
      assert.equal((await lage.buildLageBriefing({ id: "test-quellenbeleg" })).available, true);
      assert.equal(calls, 1); assert.equal(saved.payload.quellenVersion, Q.VERSION);
      cached = { payload: saved.payload };
      assert.equal((await lage.buildLageBriefing({ id: "test-quellenbeleg" }, { cacheOnly: true })).fromCache, true);
      assert.equal(calls, 1);
    });
    await pruefe("Gesperrter Generator liefert keinen alten Cache aus", async () => {
      cached = { payload: { ...saved.payload, quellenVersion: undefined } }; lock = false;
      const r = await lage.buildLageBriefing({ id: "test-quellenbeleg" });
      assert.equal(r.reason, "generating"); assert.equal(r.paragraphs.length, 0); assert.equal(calls, 1);
    });
    await pruefe("Lock Fehler verhindert kostenpflichtigen Aufruf", async () => {
      cached = null; lock = new Error("Datenbank nicht erreichbar");
      assert.equal((await lage.buildLageBriefing({ id: "test-quellenbeleg" })).reason, "store-error");
      assert.equal(calls, 1);
    });
    await pruefe("Alte Quellen behalten Karten, aber erzeugen keinen heutigen Text", async () => {
      lock = true; docs = [{ ...quelle, published_at: "2023-01-10T05:50:22Z" }];
      const r = await lage.buildLageBriefing({ id: "test-quellenbeleg" });
      assert.equal(r.reason, "no-current-sources"); assert.equal(r.vorgaenge.length, 1);
      assert.equal(calls, 1);
    });
  } finally { Object.assign(storage, vorher); ai.generateLageBriefing = vorAi; safety.guardKnowledgeObject = vorSafety; }
  console.log(`${bestanden}/${bestanden} Quellenbelegpruefungen bestanden`);
})().catch(e => { console.error(e); process.exitCode = 1; });
