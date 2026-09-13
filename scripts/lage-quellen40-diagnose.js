"use strict";

// Diagnose der bestehenden 40er Grenze. Keine Produktkorrektur.
// Beide Leser laufen mit unveraendertem Funktionsquelltext; ausschliesslich
// Transport und Speicherbereitschaft sind synthetisch. Kein REST Integrationsbeleg.
// Aufruf: node scripts/lokal.js -- node scripts/lage-quellen40-diagnose.js
// Benoetigt den unten exakt benannten Elterncommit lokal. Bewusst ein Diagnosewerkzeug,
// keine automatisch eingesammelte Produktsuite: es belegt eine bekannte Grenze.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire, Module } = require("node:module");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const storagePath = path.join(root, "lib/helmut/storage.js");
const storage = require(storagePath);
const L = require("../lib/helmut/lage");
const Q = require("../lib/helmut/lage-quellenbeleg");
const ai = require("../lib/helmut/ai");
const now = new Date();
const currentDate = new Date(now.getTime() - 3600000).toISOString();
const oldDate = "2024-01-01T00:00:00Z";
const profile = { id: "synthetisch-quellen40", committees: ["Arbeit und Soziales"] };
const ko = { id: "ko-vg-grenze", vorgang_id: "vg-grenze", status: "neu",
  understanding_status: "complete", headline: "Beratung zur Pflege", was_ist_passiert: "Beratung zur Pflege",
  best_source_url: "https://example.org/beratung", updated_at: currentDate };
const doc = (n, fresh = false) => ({ id: "d-" + String(n).padStart(3, "0"),
  title: "Beratung zur Pflege " + n, summary: "Die Beratung zur Pflege findet im Ausschuss statt.",
  url: "https://example.org/beratung/" + n, published_at: fresh ? currentDate : oldDate });
const source = fs.readFileSync(storagePath, "utf8");
function extract(code, name, next) {
  const start = code.indexOf("async function " + name + "(");
  const end = code.indexOf(next, start);
  assert(start >= 0 && end > start);
  return code.slice(start, end).trim();
}
const metaCode = extract(source, "listAktuelleLageQuellen", "// Die Originalquellen eines Vorgangs:");
const docsCode = extract(source, "getSourcesForVorgang", "// --- Helmut Core V3 — C9:");
const parentLage = new Module(path.join(root, "lib/helmut/lage.js"), module);
parentLage.filename = path.join(root, "lib/helmut/lage.js");
parentLage.paths = Module._nodeModulePaths(path.dirname(parentLage.filename));
parentLage._compile(execFileSync("git", ["show", "6e52a5336325086888ba2b39e049b33be632e92a:lib/helmut/lage.js"],
  { cwd: root, encoding: "utf8" }), parentLage.filename);
let rows = [], requests = [];
async function transport(endpoint) {
  const p = new URL("https://example.invalid" + endpoint).searchParams;
  requests.push(Object.fromEntries(p));
  let selected = rows;
  if (p.get("knowledge_object_id").startsWith("in.")) {
    const ids = JSON.parse("[" + p.get("knowledge_object_id").slice(4, -1) + "]");
    selected = selected.filter(r => ids.includes(r.knowledge_object_id));
    for (const f of p.getAll("raw_documents.published_at")) {
      const t = Date.parse(f.slice(4));
      selected = selected.filter(r => f.startsWith("gte.") ? Date.parse(r.raw_documents.published_at) >= t
        : Date.parse(r.raw_documents.published_at) <= t);
    }
    assert.equal(p.get("order"), "knowledge_object_id.asc,raw_document_id.asc");
    selected = [...selected].sort((a, b) => a.knowledge_object_id.localeCompare(b.knowledge_object_id)
      || a.raw_documents.id.localeCompare(b.raw_documents.id));
  } else {
    selected = selected.filter(r => r.knowledge_object_id === p.get("knowledge_object_id").slice(3));
    assert.equal(p.get("order"), null);
    assert.equal(p.get("limit"), "40");
  }
  const offset = Number(p.get("offset") || 0);
  return structuredClone(selected.slice(offset, offset + Number(p.get("limit"))));
}
const readers = vm.runInNewContext(metaCode + "\n" + docsCode
  + "\n({ listAktuelleLageQuellen, getSourcesForVorgang })", {
  require: createRequire(storagePath), v3StoreReady: () => true, supabaseRequest: transport,
  KO_ID_STAPEL: 100, RAW_DOC_SEITE: 1000, StorageReadError: storage.StorageReadError,
  console, Date, Set, Map, encodeURIComponent
});
function setDocs(docs) { rows = docs.map(d => ({ knowledge_object_id: ko.id, raw_documents: d })); requests = []; }
async function read() {
  const metadata = await readers.listAktuelleLageQuellen([ko.id], now);
  const docs = await readers.getSourcesForVorgang(ko.vorgang_id);
  return { metadata, docs, input: Q.baueEingabe([ko], { [ko.vorgang_id]: docs }, now) };
}
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
(async () => {
  await test("Bei40 Dokumenten bleibt der aktuelle letzte Beleg in der Texteingabe", async () => {
    setDocs([...Array.from({ length: 39 }, (_, i) => doc(i)), doc(40, true)]);
    const r = await read(); assert.equal(r.docs.length, 40); assert.equal(r.input.length, 1);
    assert.equal(r.input[0].quellenbelege[0].url, doc(40).url);
  });
  await test("Bei41 Dokumenten kann die Metadatenwahl aktuell sein und die Texteingabe leer", async () => {
    setDocs([...Array.from({ length: 40 }, (_, i) => doc(i)), doc(40, true)]);
    const r = await read(); assert.equal(r.metadata.length, 1); assert.equal(r.docs.length, 40);
    assert.equal(Q.baueEingabe([ko], { [ko.vorgang_id]: r.metadata.map(r => r.raw_documents) }, now).length, 1);
    assert.equal(r.input.length, 0);
    console.log("BELEG " + JSON.stringify({ links: rows.length, metadata: r.metadata.length,
      loaded: r.docs.length, input: r.input.length, requests }));
  });
  await test("Dieselben41 Dokumente mit aktueller Quelle zuerst liefern eine Texteingabe", async () => {
    const before = rows.map(r => r.raw_documents.id).sort().join();
    rows = [rows[40], ...rows.slice(0, 40)];
    const r = await read(); assert.equal(rows.map(r => r.raw_documents.id).sort().join(), before);
    assert.equal(r.input.length, 1);
  });
  await test("Teilmenge kann aktuell bleiben und trotzdem den neuesten Beleg verlieren", async () => {
    const older = { ...doc(0, true), published_at: new Date(now.getTime() - 7200000).toISOString() };
    setDocs([older, ...Array.from({ length: 39 }, (_, i) => doc(i + 1)), doc(40, true)]);
    const r = await read(); assert.equal(r.metadata.length, 2); assert.equal(r.input[0].quellenbelege.length, 1);
    assert.equal(r.input[0].quellenbelege[0].url, older.url);
    assert(!JSON.stringify(r.input).includes(doc(40).url));
  });
  await test("Begrenzter Dokumentenleser ist gegen den Elternstand unveraendert", async () => {
    const parent = execFileSync("git", ["show", "6e52a5336325086888ba2b39e049b33be632e92a:lib/helmut/storage.js"], { cwd: root, encoding: "utf8" });
    assert.equal(extract(parent, "getSourcesForVorgang", "// --- Helmut Core V3 — C9:"), docsCode);
  });
  const names = ["v3StoreReady", "listKnowledgeObjects", "listMatchingResults", "listAktuelleLageQuellen",
    "getSourcesForVorgang", "getRenderedBriefingV3", "acquirePipelineLock", "saveRenderedBriefingV3",
    "insertRenderedBriefingV3", "canSpendLlmForTenant"];
  const original = Object.fromEntries(names.map(n => [n, storage[n]]));
  const oldAi = ai.generateLageBriefing;
  let forbidden = 0;
  const deny = () => { forbidden++; throw new Error("Modell oder Schreibpfad unerlaubt"); };
  storage.v3StoreReady = () => true;
  storage.listKnowledgeObjects = async () => [ko];
  storage.listMatchingResults = async ({ userId }) => { assert.equal(userId, profile.id); return [{ knowledge_object_id: ko.id }]; };
  storage.listAktuelleLageQuellen = readers.listAktuelleLageQuellen;
  storage.getSourcesForVorgang = readers.getSourcesForVorgang;
  for (const n of names.slice(5)) storage[n] = deny;
  ai.generateLageBriefing = deny;
  try {
    await test("Echter Lagepfad bleibt ohne geladenen aktuellen Beleg vor Modell und Schreiben leer", async () => {
      setDocs([...Array.from({ length: 40 }, (_, i) => doc(i)), doc(40, true)]);
      const selected = await L.loadRankedVorgaenge(storage, null, profile, profile.id, { quellenzeit: now });
      assert.equal(selected.length, 1);
      const out = await L.buildLageBriefing(profile);
      assert.equal(out.available, false); assert.equal(out.reason, "no-current-sources");
      assert.equal(out.paragraphs.length, 0); assert.equal(forbidden, 0);
      console.log("LEERZUSTAND " + JSON.stringify({ reason: out.reason, paragraphs: out.paragraphs.length,
        historicalCards: out.vorgaenge.length, forbiddenCalls: forbidden }));
      const hidden = Q.baueEingabe([ko], { [ko.vorgang_id]: [doc(40, true)] }, now)[0].quellenbelege[0];
      assert.equal(Q.gueltigeAbsaetze([{ text: "Nicht geladener Beleg", vorgang_ids: [ko.vorgang_id],
        quellen_ids: [hidden.quelle_id] }], []).length, 0);
    });
    await test("Elternstand liefert im identischen41er Fall denselben sicheren Leerzustand", async () => {
      const out = await parentLage.exports.buildLageBriefing(profile);
      assert.equal(out.available, false); assert.equal(out.reason, "no-current-sources");
      assert.equal(out.paragraphs.length, 0); assert.equal(forbidden, 0);
    });
  } finally { Object.assign(storage, original); ai.generateLageBriefing = oldAi; }
  console.log(passed + "/" + passed + " Diagnosegruppen bestanden. Keine Modellaufrufe, kein Datenbankzugriff.");
})().catch(e => { console.error(e); process.exitCode = 1; });
