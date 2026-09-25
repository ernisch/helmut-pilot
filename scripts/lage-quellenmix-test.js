"use strict";
// Echte Lage-Pipeline, nur Speicher und Modellgrenze synthetisch ersetzt.
const A = require("node:assert/strict");
const L = require("../lib/helmut/lage");
const Q = require("../lib/helmut/lage-quellenbeleg");
const T = require("../lib/helmut/briefing-quellenqualitaet");
const storage = require("../lib/helmut/storage");
const ai = require("../lib/helmut/ai");
const fresh = new Date(Date.now() - 3600000).toISOString();
const profile = { id: "synthetisch-quellenmix" };
const ko = id => ({ id: "ko-" + id, vorgang_id: id, understanding_status: "complete", status: "neu",
  headline: "Beratung zur Pflegeversicherung", was_ist_passiert: "Beratung zur Pflegeversicherung",
  best_source_url: "https://example.org/" + id, updated_at: fresh });
const doc = (id, title) => ({ id, title, summary: title, url: "https://example.org/" + id,
  published_at: fresh, source_name: "Synthetische Quelle" });
const good = ko("pflege"), mixed = ko("gemischt");
const clean = [doc("p1", "Pflegeversicherung: Beratung zur Finanzierung der Pflegeversicherung"),
  doc("p2", "Pflegeversicherung: Beratung zur Finanzierung der Pflegeversicherung")];
const unrelated = [clean[0], doc("s1", "Sternwarte eroeffnet Ausstellung ueber Jupiter und Saturn")];
const names = ["v3StoreReady", "listKnowledgeObjects", "listMatchingResults", "listAktuelleLageQuellen",
  "getSourcesForVorgang", "getRenderedBriefingV3", "acquirePipelineLock", "releasePipelineLock",
  "canSpendLlmForTenant", "saveRenderedBriefingV3"];
const saved = Object.fromEntries(names.map(n => [n, storage[n]]));
const originalAi = ai.generateLageBriefing;
let pool, sources, cached, calls, written;
function setup(rows = [mixed, good], docs = { gemischt: unrelated, pflege: clean }) {
  pool = rows; sources = docs; cached = null; calls = { model: 0, lock: 0, write: 0 }; written = null;
  storage.v3StoreReady = () => true;
  storage.listKnowledgeObjects = async () => pool;
  storage.listMatchingResults = async () => pool.map(k => ({ knowledge_object_id: k.id }));
  storage.listAktuelleLageQuellen = require("./fixtures/lage-quellenmetadaten")(() => pool, vg => sources[vg]);
  storage.getSourcesForVorgang = async vg => sources[vg];
  storage.getRenderedBriefingV3 = async () => written || cached;
  storage.acquirePipelineLock = async () => { calls.lock++; return true; };
  storage.releasePipelineLock = async () => {};
  storage.canSpendLlmForTenant = async () => ({ allowed: true });
  storage.saveRenderedBriefingV3 = async row => { calls.write++; written = row; return { saved: true }; };
  ai.generateLageBriefing = async input => {
    calls.model++;
    A.deepEqual(input.map(k => k.vorgang_id), [good.vorgang_id]);
    return { paragraphs: [{ text: "Beratung zur Pflegeversicherung.", vorgang_ids: [good.vorgang_id],
      quellen_ids: [input[0].quellenbelege[0].quelle_id] }],
      qualitaet: { version: require("../lib/helmut/lage-textqualitaet").VERSION } };
  };
}
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
(async () => {
  try {
    A.equal(T.themenrein(unrelated), false); A.equal(T.themenrein(clean), true);
    await test("cacheOnly sperrt Quellenmix vor Karten und bewahrt den sauberen Vorgang unveraendert", async () => {
      setup(); const before = JSON.stringify({ pool, sources, profile });
      const out = await L.buildLageBriefing(profile, { cacheOnly: true });
      A.deepEqual(out.vorgaenge.map(c => c.vorgangId), [good.vorgang_id]);
      A.deepEqual(out.vorgaenge[0].sources.map(s => s.url), clean.map(d => d.url));
      A.equal(JSON.stringify({ pool, sources, profile }), before);
      A.deepEqual(calls, { model: 0, lock: 0, write: 0 });
    });
    await test("Regulaerer Generator und Speicher erhalten ausschliesslich den sauberen Vorgang", async () => {
      setup(); const out = await L.buildLageBriefing(profile);
      A.equal(calls.model, 1); A.equal(calls.write, 1);
      A.deepEqual(out.vorgaenge.map(c => c.vorgangId), [good.vorgang_id]);
      A(!JSON.stringify(written).includes(mixed.vorgang_id));
    });
    await test("Cache fuer die fruehere gemischte Auswahl wird nicht erneut ausgeliefert", async () => {
      setup(); const input = Q.baueEingabe(pool, sources);
      cached = { payload: { koSetHash: L.hashKoSet(pool), quellenHash: Q.hashEingabe(input),
        quellenVersion: Q.VERSION, paragraphs: [{ text: "ALTER QUELLENMIX", vorgang_ids: [mixed.vorgang_id],
          quellen_ids: [input.find(k => k.vorgang_id === mixed.vorgang_id).quellenbelege[0].quelle_id] }],
        qualitaet: { version: require("../lib/helmut/lage-textqualitaet").VERSION } } };
      A(Q.cacheGueltig(cached.payload, L.hashKoSet(pool), Q.hashEingabe(input), input));
      const out = await L.buildLageBriefing(profile, { cacheOnly: true });
      A.equal(out.fromCache, false); A.deepEqual(out.paragraphs, []);
      A.deepEqual(calls, { model: 0, lock: 0, write: 0 });
    });
    await test("Nur gemischte Vorgaenge ergeben ehrlichen Leerzustand ohne Modell oder Writer", async () => {
      setup([mixed], { gemischt: unrelated });
      const out = await L.buildLageBriefing(profile);
      A.equal(out.available, false); A.equal(out.reason, "no-vorgaenge");
      A.deepEqual(out.vorgaenge, []); A.deepEqual(calls, { model: 0, lock: 0, write: 0 });
    });
    await test("Auch countOnly zaehlt keine unbrauchbare gemischte Karte", async () => {
      setup(); const out = await L.buildLageBriefing(profile, { countOnly: true });
      A.deepEqual(out.vorgaenge.map(c => c.vorgangId), [good.vorgang_id]);
      A.deepEqual(calls, { model: 0, lock: 0, write: 0 });
    });
    await test("Gleicher Titel ueber mehrere Bezugsjahre ist kein einzelnes Ereignis", async () => {
      const old = { ...clean[0], id: "historisch", published_at: "2024-01-01T00:00:00Z",
        title: "Pflegeversicherung 2024: Beratung zur Finanzierung" };
      const current = { ...clean[1], title: "Pflegeversicherung 2026: Beratung zur Finanzierung" };
      setup([mixed], { gemischt: [old, current] });
      const out = await L.buildLageBriefing(profile, { cacheOnly: true });
      A.deepEqual(out.vorgaenge, []); A.deepEqual(calls, { model: 0, lock: 0, write: 0 });
    });
    console.log(passed + "/" + passed + " Testgruppen bestanden.");
  } finally { Object.assign(storage, saved); ai.generateLageBriefing = originalAi; }
})().catch(e => { console.error(e); process.exitCode = 1; });
