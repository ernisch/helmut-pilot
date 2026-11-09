"use strict";
// Echter Lagepfad, vorhandene Metadatenfixture, injizierte Generator- und
// Speicherantworten. Kein Originalabruf und kein bezahlter Modellaufruf.
const A = require("node:assert/strict");
const L = require("../lib/helmut/lage");
const S = require("../lib/helmut/storage");
const ai = require("../lib/helmut/ai");
const metadata = require("./fixtures/lage-quellenmetadaten");
const profile = { id: "lage-versorgung-isoliert", fullName: "Isoliertes Pflegeprofil", party: "SPD",
  parliamentType: "Bundestag", focusTopics: ["Pflege"], committees: ["Gesundheitsausschuss"], state: "Berlin" };
const fresh = new Date(Date.now() - 3600000).toISOString();
const kos = [0, 1].map(i => ({ id: `ko-isolierte-pflege-${i}`, vorgang_id: `vg-isolierte-pflege-${i}`,
  headline: `Pflege: Beratung zu Vorhaben ${i}`, was_ist_passiert: `Die Pflegeberatung zum Vorhaben ${i} ist vorgesehen.`,
  understanding_status: "complete", status: "neu", updated_at: fresh, ausschuesse: ["Gesundheitsausschuss"],
  best_source_url: `https://example.org/isolierte-pflege/bericht-${i}` }));
const sources = Object.fromEntries(kos.map((k, i) => [k.vorgang_id, [{ id: `rd-isolierte-pflege-${i}`,
  title: k.headline, summary: `Die öffentliche Beratung zum Vorhaben ${i} betrifft die Pflegeversorgung. Der Gesundheitsausschuss behandelt die Unterlagen des Vorhabens.`,
  url: k.best_source_url, source_name: "Deklariertes Testmedium", published_at: fresh }]]));
let cache = null, calls = 0, writes = 0, allowed = true, count = 0;
S.v3StoreReady = () => true;
S.listKnowledgeObjects = async () => kos;
S.listKnowledgeObjectsByIds = async ids => kos.filter(k => ids.includes(k.id));
S.listMatchingResults = async o => { A.equal(o.userId, profile.id); return kos.map(k => ({ knowledge_object_id: k.id })); };
S.getSourcesForVorgang = async id => sources[id] || [];
S.listAktuelleLageQuellen = metadata(kos, id => sources[id] || []);
S.getRenderedBriefingV3 = async () => structuredClone(cache);
S.acquirePipelineLock = async () => true;
S.releasePipelineLock = async () => {};
S.canSpendLlmForTenant = async () => ({ allowed });
S.recordLlmUsage = async () => {};
S.saveRenderedBriefingV3 = async (entry, opts) => {
  A.deepEqual(opts.expectedLage, cache); cache = structuredClone(entry); writes++; return { saved: true };
};
ai.generateLageBriefing = async input => {
  calls++;
  return { paragraphs: input.slice(0, 2).map(v => ({ text: v.quellenbelege[0].titel,
    vorgang_ids: [v.vorgang_id], quellen_ids: [v.quellenbelege[0].quelle_id],
    belegstellen: [{ quelle_id: v.quellenbelege[0].quelle_id, text: v.quellenbelege[0].titel }] })),
  qualitaet: { version: require("../lib/helmut/lage-textqualitaet").VERSION, vollstaendigeFaktenpruefung: false } };
};
async function test(name, fn) { await fn(); count++; console.log("PASS " + name); }
(async () => {
  await test("Neue Lage speichert den technischen Stand ohne Quellen- oder Modellvertrag zu aendern", async () => {
    const result = await L.buildLageBriefing(profile, { versorgung: { version: 1, zustand: "offen", privateNotiz: "nicht-uebernehmen" } });
    A.equal(result.available, true); A.equal(result.fromCache, false); A.equal(calls, 1); A.equal(writes, 1);
    A.deepEqual(cache.payload.versorgung, { version: 1, zustand: "offen" });
    A.deepEqual(result.versorgung, cache.payload.versorgung);
    A.equal(require("../lib/helmut/lage-quellenbeleg").gespeicherterTextGueltig(cache.payload), true);
  });
  await test("Aktueller Stand begleitet positiven Cachetext ohne erneute Generierung oder Write", async () => {
    const before = structuredClone(cache);
    const result = await L.buildLageBriefing(profile, { cacheOnly: true,
      versorgung: { version: 1, zustand: "kein-bekannter-rueckstand" } });
    A.equal(result.fromCache, true); A.equal(result.paragraphs.length, 2);
    A.deepEqual(result.versorgung, { version: 1, zustand: "kein-bekannter-rueckstand" });
    A.deepEqual(cache, before, "Historischer Text und sein gespeichertes Signal bleiben unveraendert");
    A.deepEqual(result.paragraphs.map(p => p.text), before.payload.paragraphs.map(p => p.text));
    A.equal(calls, 1); A.equal(writes, 1);
  });
  await test("Ohne aktuellen Messwert bleibt ein gespeichertes Signal erhalten; ungueltige Enums werden unbekannt", async () => {
    A.deepEqual((await L.buildLageBriefing(profile, { cacheOnly: true })).versorgung, { version: 1, zustand: "offen" });
    A.deepEqual((await L.buildLageBriefing(profile, { cacheOnly: true,
      versorgung: { version: 9, zustand: "alles-vollstaendig" } })).versorgung, { version: 1, zustand: "unbekannt" });
    A.equal(calls, 1); A.equal(writes, 1);
  });
  await test("CountOnly, fehlendes Narrativ und Budgetstopp ignorieren den aktuellen Versorgungsstand nicht", async () => {
    const opts = { versorgung: { version: 1, zustand: "unbekannt" } };
    A.deepEqual((await L.buildLageBriefing(profile, { ...opts, countOnly: true })).versorgung, opts.versorgung);
    cache = null;
    const missing = await L.buildLageBriefing(profile, { ...opts, cacheOnly: true });
    A.equal(missing.pendingNarrative, true); A.deepEqual(missing.versorgung, opts.versorgung);
    allowed = false;
    const stopped = await L.buildLageBriefing(profile, opts);
    A.equal(stopped.reason, "budget"); A.deepEqual(stopped.versorgung, opts.versorgung);
    A.equal(calls, 1); A.equal(writes, 1);
  });
  await test("Historischer finalize-Vertrag bleibt ohne Signal unveraendert", () => {
    const out = L.finalize({ paragraphs: [], generatedAt: "2026-11-09T05:00:00Z" }, [], {});
    A.equal(Object.hasOwn(out, "versorgung"), false);
    A.deepEqual(L.finalize({ paragraphs: [], versorgung: { version: 1, zustand: "offen" } }, [], {}).versorgung,
      { version: 1, zustand: "offen" });
  });
  console.log(`${count}/${count} Lage-Versorgungsgruppen bestanden, Modellantworten ausschliesslich injiziert.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
