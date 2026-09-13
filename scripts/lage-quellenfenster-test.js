"use strict";
const assert = require("node:assert/strict");
const L = require("../lib/helmut/lage");
const Q = require("../lib/helmut/lage-quellenbeleg");
const storage = require("../lib/helmut/storage");
const now = new Date("2026-09-13T07:18:08Z");
const profile = { id: "mandat-fixture", committees: ["Arbeit und Soziales"] };
const ko = id => ({ id, vorgang_id: "vg-" + id, status: "neu", understanding_status: "complete",
  headline: "Neue Beratung zur Pflege", was_ist_passiert: "Neue Beratung zur Pflege",
  best_source_url: "https://example.org/" + id, updated_at: now.toISOString() });
const source = (id, published_at = "2026-09-12T08:00:00Z") => ({ id: "doc-" + id,
  title: "Beratung zur Pflege wird angesetzt", url: "https://example.org/" + id, published_at });
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
const old = Array.from({ length: 12 }, (_, i) => ko("alt-" + i));
const current = [ko("aktuell-a"), ko("aktuell-b")];
function store(pool, matches = old) { return {
  listKnowledgeObjects: async () => pool,
  listMatchingResults: async ({ userId }) => { assert.equal(userId, profile.id); return matches.map(k => ({ knowledge_object_id: k.id })); },
  listKnowledgeObjectsByIds: async ids => old.filter(k => ids.includes(k.id)),
  listAktuelleLageQuellen: async (ids, zeit) => {
    assert.equal(new Date(zeit).toISOString(), now.toISOString());
    return ids.filter(id => current.some(k => k.id === id)).map(id => ({ knowledge_object_id: id, raw_documents: source(id) }));
  }
}; }
(async () => {
  await test("Zwoelf frisch analysierte Altquellen verdraengen keine zwei aktuellen Sachverhalte", async () => {
    const pool = [...old, ...current], before = JSON.stringify(pool);
    const rows = await L.loadRankedVorgaenge(store(pool), (_p, kos) => kos.map(k => ({ knowledge_object_id: k.id })),
      profile, profile.id, { quellenzeit: now });
    assert.deepEqual(rows.map(k => k.id).sort(), current.map(k => k.id).sort());
    assert.equal(Q.baueEingabe(rows, Object.fromEntries(current.map(k => [k.vorgang_id, [source(k.id)]])), now).length, 2);
    assert.equal(JSON.stringify(pool), before);
  });
  await test("Ein vorhandener Treffer ausserhalb des Fensters behaelt seinen echten aktuellen Quellenbeleg", async () => {
    const outside = ko("aussen"), s = store(current, [outside]);
    s.listKnowledgeObjectsByIds = async () => [outside];
    s.listAktuelleLageQuellen = async ids => ids.map(id => ({ knowledge_object_id: id, raw_documents: source(id) }));
    const rows = await L.loadRankedVorgaenge(s, null, profile, profile.id, { quellenzeit: now });
    assert(rows.some(k => k.id === outside.id));
  });
  await test("Ohne aktuelle Quelle bleibt die historische Kartenauswahl ohne neuen Quellenbeleg erhalten", async () => {
    const s = store(old); s.listAktuelleLageQuellen = async () => [];
    const rows = await L.loadRankedVorgaenge(s, null, profile, profile.id, { quellenzeit: now });
    assert.deepEqual(rows.map(k => k.id), old.map(k => k.id));
    assert.deepEqual(Q.baueEingabe(rows, {}, now), []);
  });
  await test("Undatierte, zukuenftige, alte und nicht oeffnende Belege werden vor der Auswahl ausgeschlossen", async () => {
    const s = store([...old, ...current]);
    s.listAktuelleLageQuellen = async () => [
      ...old.map((k, i) => ({ knowledge_object_id: k.id, raw_documents: source(k.id,
        [null, "2026-09-14T00:00:00Z", "2024-01-01T00:00:00Z"][i % 3]) })),
      { knowledge_object_id: current[0].id, raw_documents: { ...source("portal"), url: "https://example.org/" } },
      { knowledge_object_id: current[1].id, raw_documents: source(current[1].id) }];
    const rows = await L.loadRankedVorgaenge(s, (_p, kos) => kos.map(k => ({ knowledge_object_id: k.id })),
      profile, profile.id, { quellenzeit: now });
    assert.deepEqual(rows.map(k => k.id), [current[1].id]);
  });
  await test("Quellelesefehler sind eine Speicherstoerung, kein leerer ruhiger Tag", async () => {
    const s = store(current); s.listAktuelleLageQuellen = async () => { throw new Error("Lesefehler"); };
    await assert.rejects(() => L.loadRankedVorgaenge(s, null, profile, profile.id, { quellenzeit: now }), e => e.storeError === true);
  });
  await test("Metadaten werden gebuendelt, aktuell und in vollstaendigen Seiten gelesen", async () => {
    const requests = [], rows = Array.from({length:1000},(_,i)=>({knowledge_object_id:"eins",raw_documents:{id:"doc-"+i}}));
    const result = await storage.listAktuelleLageQuellen(["eins", "eins"], now, {
      ready:()=>true, request:async endpoint=>{ requests.push(endpoint); return requests.length===1 ? rows : []; }
    });
    assert.equal(result.length,1000); assert.equal(requests.length,2);
    const p = new URL("https://example.org"+requests[0]).searchParams;
    assert.equal(p.get("select"),"knowledge_object_id,raw_documents!inner(id,title,url,canonical_url,published_at)");
    assert.equal(p.get("knowledge_object_id"),'in.("eins")');
    assert.deepEqual(p.getAll("raw_documents.published_at"),["gte.2026-08-30T07:18:08.000Z","lte.2026-09-13T07:18:08.000Z"]);
    assert.equal(p.get("order"),"knowledge_object_id.asc,raw_document_id.asc");
    assert(new URL("https://example.org"+requests[1]).searchParams.get("offset")==="1000");
  });
  await test("Fehlende Verbindung, fremde Zeilen und unlesbare Antwort sind keine leeren Metadaten", async () => {
    for (const deps of [{ ready:()=>false }, {ready:()=>true,request:async()=>({})},
      {ready:()=>true,request:async()=>[{knowledge_object_id:"fremd",raw_documents:{id:"x"}}]}])
      await assert.rejects(()=>storage.listAktuelleLageQuellen(["eins"],now,deps));
  });
  await test("Quellenfenster gilt auch bei globalem Scoring vor dem Top N Schnitt", async () => {
    const previous = process.env.HELMUT_SCORING_MODE;
    process.env.HELMUT_SCORING_MODE = "on";
    try {
      const rows = await L.loadRankedVorgaenge(store([...old, ...current]), null,
        profile, profile.id, { quellenzeit: now });
      assert.deepEqual(rows.map(k => k.id).sort(), current.map(k => k.id).sort());
    } finally {
      if (previous === undefined) delete process.env.HELMUT_SCORING_MODE;
      else process.env.HELMUT_SCORING_MODE = previous;
    }
  });
  await test("Doppelte Seiten und die Leseobergrenze liefern niemals eine stille Teilmenge", async () => {
    let calls = 0;
    await assert.rejects(() => storage.listAktuelleLageQuellen(["eins"], now, {
      ready: () => true, request: async () => {
        calls++; return Array.from({ length: 1000 }, (_, i) => ({ knowledge_object_id: "eins", raw_documents: { id: "d-" + i } }));
      }
    }));
    assert.equal(calls, 2);
    calls = 0;
    await assert.rejects(() => storage.listAktuelleLageQuellen(["eins"], now, {
      ready: () => true, request: async () => {
        const start = calls++ * 1000;
        return Array.from({ length: 1000 }, (_, i) => ({ knowledge_object_id: "eins", raw_documents: { id: "d-" + (start + i) } }));
      }
    }), /lage-quellen-lesegrenze/);
    assert.equal(calls, 5);
  });
  await test("Grosse Kennungsmengen bleiben in Stapeln ohne zusaetzlichen globalen Scan", async () => {
    const ids = Array.from({ length: 201 }, (_, i) => "ko-" + i), sizes = [];
    await storage.listAktuelleLageQuellen(ids, now, { ready: () => true, request: async endpoint => {
      const p = new URL("https://example.org" + endpoint).searchParams;
      sizes.push(p.get("knowledge_object_id").match(/\"ko-/g).length); return [];
    } });
    assert.deepEqual(sizes, [100, 100, 1]);
  });
  console.log(passed+"/"+passed+" Testgruppen bestanden.");
})().catch(e=>{console.error(e);process.exitCode=1;});
