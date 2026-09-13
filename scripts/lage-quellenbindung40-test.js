"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const storage = require("../lib/helmut/storage");
const L = require("../lib/helmut/lage");
const Q = require("../lib/helmut/lage-quellenbeleg");
const ai = require("../lib/helmut/ai");
const file = path.resolve(__dirname, "../lib/helmut/storage.js");
const code = fs.readFileSync(file, "utf8");
// Unveraenderte echte Leser, ausschliesslich Transport und Bereitschaft injiziert.
const start = code.indexOf("async function listAktuelleLageQuellen(");
const end = code.indexOf("// --- Helmut Core V3 — C9:", start);
assert(start >= 0 && end > start);
let rows = [], requests = [], corrupt = null, lastInput = null;
const now = new Date(), fresh = new Date(now - 3600000).toISOString();
const ko = { id: "ko-vg-forty", vorgang_id: "vg-forty", status: "neu", understanding_status: "complete",
  headline: "Beratung zur Pflege", was_ist_passiert: "Beratung zur Pflege", best_source_url: "https://example.org/pflege", updated_at: fresh };
const profile = { id: "synthetisch-vierzig" };
function doc(n, current = false) { return { id: "d-" + n, title: "Beratung zur Pflege " + n,
  url: "https://example.org/pflege/" + n, published_at: current ? fresh : "2024-01-01T00:00:00Z",
  summary: "Die Beratung zur Pflege ist vorgesehen.", source_name: "Testquelle" }; }
function setup(docs) { rows = docs.map(d => ({ knowledge_object_id: ko.id, raw_document_id: d.id, raw_documents: d })); requests = []; corrupt = null; lastInput = null; }
async function transport(endpoint) {
  const p = new URL("https://example.invalid" + endpoint).searchParams; requests.push(p);
  let result = structuredClone(rows);
  const filter = p.get("knowledge_object_id");
  if (filter.startsWith("in.")) {
    const ids = JSON.parse("[" + filter.slice(4, -1) + "]");
    result = result.filter(r => ids.includes(r.knowledge_object_id));
    for (const f of p.getAll("raw_documents.published_at")) {
      result = result.filter(r => f.startsWith("gte.") ? Date.parse(r.raw_documents.published_at) >= Date.parse(f.slice(4))
        : Date.parse(r.raw_documents.published_at) <= Date.parse(f.slice(4)));
    }
    result.sort((a, b) => a.knowledge_object_id.localeCompare(b.knowledge_object_id) || a.raw_document_id.localeCompare(b.raw_document_id));
    result = result.map(r => ({ knowledge_object_id:r.knowledge_object_id,raw_documents:Object.fromEntries(
      ["id","title","url","canonical_url","published_at"].filter(f=>r.raw_documents[f]!==undefined).map(f=>[f,r.raw_documents[f]])) }));
  } else result = result.filter(r => r.knowledge_object_id === filter.slice(3));
  const ids = p.get("raw_document_id");
  if (ids) result = result.filter(r => JSON.parse("[" + ids.slice(4, -1) + "]").includes(r.raw_document_id));
  const offset = Number(p.get("offset") || 0);
  result = result.slice(offset, offset + Number(p.get("limit")));
  if (ids && corrupt) result = corrupt(result);
  return result;
}
const readers = vm.runInNewContext(code.slice(start, end) + "\n({listAktuelleLageQuellen,getSourcesForVorgang})", {
  require: createRequire(file), v3StoreReady: () => true, supabaseRequest: transport,
  KO_ID_STAPEL: 100, RAW_DOC_SEITE: 1000, StorageReadError: storage.StorageReadError,
  console, Date, Set, Map, encodeURIComponent
});
const names = ["v3StoreReady", "listKnowledgeObjects", "listMatchingResults", "listAktuelleLageQuellen", "getSourcesForVorgang",
  "getRenderedBriefingV3", "acquirePipelineLock", "canSpendLlmForTenant", "saveRenderedBriefingV3", "insertRenderedBriefingV3"];
const saved = Object.fromEntries(names.map(n => [n, storage[n]]));
const oldAi = ai.generateLageBriefing;
const originalInput = Q.baueEingabe;
Q.baueEingabe = (kos,quellen,...rest) => {
  const result=originalInput(kos,quellen,...rest);
  if (Object.values(quellen).some(docs=>docs.some(d=>Object.hasOwn(d,"summary")))) lastInput=result;
  return result;
};
let forbidden = 0;
const deny = () => { forbidden++; throw new Error("Modell oder Schreiben unzulaessig"); };
storage.v3StoreReady = () => true;
storage.listKnowledgeObjects = async () => [ko];
storage.listMatchingResults = async ({userId}) => { assert.equal(userId, profile.id); return [{ knowledge_object_id: ko.id }]; };
storage.listAktuelleLageQuellen = readers.listAktuelleLageQuellen;
storage.getSourcesForVorgang = readers.getSourcesForVorgang;
storage.getRenderedBriefingV3 = async () => null;
for (const n of names.slice(6)) storage[n] = deny;
ai.generateLageBriefing = deny;
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
(async () => {
  try {
    await test("Aktuelle Quelle an Position41 erreicht den echten Lagepfad ohne Modell", async () => {
      setup([...Array.from({length:40},(_,i)=>doc(i)),doc(40,true)]);
      const out = await L.buildLageBriefing(profile, {cacheOnly:true});
      assert.equal(out.available, true); assert.equal(out.pendingNarrative, true); assert.equal(forbidden, 0);
      assert(out.vorgaenge[0].sources.some(s => s.url === doc(40).url));
      assert.equal(lastInput[0].quellenbelege[0].url,doc(40).url);
      assert.equal(lastInput[0].quellenbelege[0].auszug,doc(40).summary);
      const targeted = requests.filter(p => p.has("raw_document_id"));
      assert.equal(targeted.length, 1); assert.equal(targeted[0].get("knowledge_object_id"), "eq." + ko.id);
    });
    await test("Gleicher41er Bestand in anderer Reihenfolge liefert dieselbe aktuelle Quelle", async () => {
      rows = [rows[40], ...rows.slice(0,40)]; requests = [];
      const out = await L.buildLageBriefing(profile, {cacheOnly:true});
      assert.equal(out.available,true); assert(out.vorgaenge[0].sources.some(s => s.url===doc(40).url));
    });
    await test("Direkter gebundener Leser verwirft fehlende,fremde,doppelte und geaenderte Antworten", async () => {
      setup([doc(40,true)]);
      for (const change of [() => [], () => null, r => [...r,...r],
        r => [{...r[0],knowledge_object_id:"ko-fremd"}], r => [{...r[0],raw_document_id:"fremd"}],
        r => [{...r[0],raw_documents:{...r[0].raw_documents,id:"fremd"}}],
        r => [{...r[0],raw_documents:{...r[0].raw_documents,published_at:"2024-01-01"}}],
        r => [{...r[0],raw_documents:{...r[0].raw_documents,title:"Anderer Inhalt"}}],
        r => [{...r[0],raw_documents:{...r[0].raw_documents,url:"https://example.org/fremd"}}]]) {
        corrupt = change;
        await assert.rejects(() => readers.getSourcesForVorgang(ko.vorgang_id,{lageQuellen:[doc(40,true)],lageKoId:ko.id}));
        assert.equal((await L.buildLageBriefing(profile,{cacheOnly:true})).reason,"store-error");
      }
    });
    await test("Zwei aktuelle Belege inklusive neuestem ausserhalb der40er Teilmenge kommen im Text an", async () => {
      const older={...doc(0,true),published_at:new Date(now-7200000).toISOString()};
      setup([older,...Array.from({length:39},(_,i)=>doc(i+1)),doc(40,true)]);
      const out=await L.buildLageBriefing(profile,{cacheOnly:true});assert.equal(out.available,true);
      assert.deepEqual(lastInput[0].quellenbelege.map(q=>q.url),[doc(40).url,older.url]);
    });
    await test("Gezielt ausgewaehlter Beleg wird nicht durch eine aeltere URL und Titeldublette verdrängt", async () => {
      const selected={...doc(40,true),id:"a-ausgewaehlt"};
      const older={...selected,id:"z-alt",published_at:new Date(now-7200000).toISOString(),summary:"Frueherer Beleginhalt."};
      setup([older,...Array.from({length:39},(_,i)=>doc(i)),selected]);
      assert.equal((await L.buildLageBriefing(profile,{cacheOnly:true})).available,true);
      assert.equal(lastInput[0].quellenbelege[0].veroeffentlichtAm,selected.published_at);
      assert.equal(lastInput[0].quellenbelege[0].auszug,selected.summary);
    });
    await test("Ungueltige Bindung und mehr als sechs Kennungen starten keinen Abruf", async () => {
      setup([doc(40,true)]);
      for (const opts of [{lageQuellen:[]},{lageQuellen:[{}]},
        {lageQuellen:[doc(40,true),doc(40,true)],lageKoId:ko.id},
        {lageQuellen:Array.from({length:7},(_,i)=>doc(i,true)),lageKoId:ko.id},
        {lageQuellen:[doc(40,true)],lageKoId:null}]) {
        await assert.rejects(()=>readers.getSourcesForVorgang(ko.vorgang_id,opts));
      }
      assert.equal(requests.length,0);
    });
    await test("Sonderzeichen in Dokumentkennungen veraendern keine Filter", async () => {
      const d={...doc(40,true),id:'d-\")&knowledge_object_id=eq.fremd,\\quelle'};
      setup([d]);
      const out=await readers.getSourcesForVorgang(ko.vorgang_id,{lageKoId:ko.id,lageQuellen:[d]});
      assert.equal(out[0].id,d.id);assert.equal(requests.length,1);
      assert.equal(requests[0].getAll("knowledge_object_id").length,1);
      assert.equal(requests[0].get("knowledge_object_id"),"eq."+ko.id);
    });
    await test("Aktueller Beleg fehlt nach Metadatenlesen:kein stiller Leerzustand oder Modell", async () => {
      setup([...Array.from({length:40},(_,i)=>doc(i)),doc(40,true)]); corrupt = () => [];
      const out=await L.buildLageBriefing(profile); assert.equal(out.reason,"store-error"); assert.equal(forbidden,0);
    });
    await test("Ohne aktuelle Quellen bleibt historischer Leerzustand und es gibt keinen Zusatzabruf", async () => {
      setup([doc(0)]); const out=await L.buildLageBriefing(profile);
      assert.equal(out.reason,"no-current-sources"); assert(!requests.some(p=>p.has("raw_document_id"))); assert.equal(forbidden,0);
    });
    await test("Zaehlmodus und allgemeiner Detailabruf behalten ihre40er Grenze", async () => {
      setup([...Array.from({length:40},(_,i)=>doc(i)),doc(40,true)]);
      assert.equal((await readers.getSourcesForVorgang(ko.vorgang_id)).length,40);
      await L.buildLageBriefing(profile,{countOnly:true});
      assert(!requests.some(p=>p.has("raw_document_id")||p.get("knowledge_object_id").startsWith("in.")));
    });
    await test("Hohe Quellzahl bleibt auf sechs gezielte Belege je Vorgang begrenzt", async () => {
      setup(Array.from({length:80},(_,i)=>doc(i,true)));
      const out=await L.buildLageBriefing(profile,{cacheOnly:true}); assert.equal(out.available,true);
      const p=requests.find(p=>p.has("raw_document_id"));assert(p);
      const ids=JSON.parse("["+p.get("raw_document_id").slice(4,-1)+"]");assert.equal(ids.length,Q.MAX_BELEGE);
    });
    console.log(passed+"/"+passed+" Gruppen bestanden; echte Modelle und persistente Writes: "+forbidden);
  } finally { Object.assign(storage,saved); ai.generateLageBriefing=oldAi; Q.baueEingabe=originalInput; }
})().catch(e=>{console.error(e);process.exitCode=1;});
