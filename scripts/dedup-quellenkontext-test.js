"use strict";
// Kontext muss die globale Zusammenfuehrung UND den echten Storage-Aufrufer
// ueberstehen. Kein Netz und keine Production Daten; API Antworten sind isoliert.
const assert = require("node:assert/strict");
process.env.HELMUT_V3_STORE = "on";
process.env.SUPABASE_URL = "http://127.0.0.1:9";
process.env.SUPABASE_SERVICE_ROLE_KEY = "offline-test-kein-geheimnis";
const D = require("../lib/helmut/dedup");
const G = require("../lib/helmut/quellenarchitektur/dedup-global");
const storage = require("../lib/helmut/storage");
const item = { title: "Ausschuss beraet Beratungsstellen", url: "https://example.org/beratung",
  content: "Der Ausschuss hoert am Dienstag Fachleute zur Finanzierung der Beratungsstellen an.",
  sourceId: "quelle-a", sourceName: "Amtliche Quelle", sourceType: "rss", confidence: "high",
  linkType: "direct", publishedAt: "2026-09-19T12:00:00Z", retrievedAt: "2026-09-19T12:05:00Z",
  documentType: "meldung", wahlperiode: 21,
  raw: { fremdesFeld: "nicht speichern" }, author: "nicht speichern", body: "kein Volltext" };
const fields = ["summary", "url", "source_name", "source_type", "confidence", "link_type",
  "retrieved_at", "document_type", "wahlperiode"];
function contextEqual(actual, expected) { for (const field of fields) assert.deepEqual(actual[field], expected[field], field); }
let passed = 0;
function test(name, fn) { fn(); passed++; console.log("PASS  " + name); }
async function main() {
  test("Originalauszug und Quellenmetadaten bleiben in beiden Eingabeformen erhalten", () => {
    const row = D.toRawDocumentRow(item);
    for (const input of [item, row]) contextEqual(G.planDedupWrites([input]).persists[0], row);
  });
  test("Titel ohne Kontext erzeugt weder Auszug noch erfundene Zeit oder Bedeutung", () => {
    const doc = G.planDedupWrites([{ title: "Ausschuss beraet", url: "https://example.org/leer" }]).persists[0];
    assert.equal(Object.hasOwn(doc, "summary"), false);
    assert.equal(doc.published_at, null);
    assert.equal(Object.hasOwn(doc, "retrieved_at"), false);
    assert.equal(Object.hasOwn(doc, "source_name"), false);
  });
  test("Titelwiederholung ist kein Quellenbeleg; fehlende Felder werden nicht als null geschrieben", () => {
    const row = D.toRawDocumentRow({ title: item.title, content: item.title, url: item.url });
    const doc = G.planDedupWrites([row]).persists[0];
    assert.equal(Object.hasOwn(doc, "summary"), false);
    assert.equal(Object.hasOwn(doc, "raw"), false);
    assert.equal(Object.hasOwn(doc, "cluster_id"), false);
  });
  test("Volltext und Rohpayload werden minimiert; eigene Schnittgrenze erzeugt keinen Halbsatz", () => {
    const doc = G.planDedupWrites([{ ...item, content: item.content + " " + "Offener weiterer Absatz ".repeat(30) }]).persists[0];
    assert.equal(doc.summary, item.content);
    for (const field of ["raw", "author", "body", "content", "excerpt", "cluster_id"]) assert.equal(Object.hasOwn(doc, field), false);
  });
  test("Gewaehlte Primaerquelle behaelt zusammengehoerigen Auszug und Metadaten", () => {
    const weak = { ...item, sourceId: "quelle-b", sourceName: "Andere Quelle", confidence: "low", linkType: "search", content: "Andere Aussage." };
    const plan = G.planDedupWrites([weak, item]);
    assert.equal(plan.persists.length, 1); assert.equal(plan.findings.length, 2);
    contextEqual(plan.persists[0], D.toRawDocumentRow(item));
    assert.equal(plan.persists[0].primary_source_id, item.sourceId);
    const without = G.planDedupWrites([weak, { ...item, content: "" }]).persists[0];
    assert.equal(Object.hasOwn(without, "summary"), false);
  });
  test("Bekannte Dokumente bleiben reine Fundstellentreffer ohne Quellenueberschreibung", () => {
    const existing = { id: "geschuetztes-dokument", canonical_target_url: D.canonicalizeUrl(item.url) };
    const plan = G.planDedupWrites([item], [existing]);
    assert.deepEqual(plan.persists, []);
    assert.equal(plan.findings[0].raw_document_id, existing.id);
    assert.deepEqual(plan.countIncrements, { [existing.id]: 1 });
  });
  const actualFetch = global.fetch;
  const writes = [];
  let conflict = false, rejectBulk = false;
  global.fetch = async (url, opts = {}) => {
    const u = new URL(url); assert.equal(u.origin, "http://127.0.0.1:9");
    if ((opts.method || "GET") === "GET" && u.pathname === "/rest/v1/raw_documents") return new Response("[]");
    assert.equal(opts.method, "POST");
    assert(["/rest/v1/raw_documents", "/rest/v1/document_findings"].includes(u.pathname));
    const body = JSON.parse(opts.body); writes.push({ path: u.pathname, body });
    if (u.pathname.endsWith("raw_documents")) {
      assert.equal(opts.headers.Prefer, "resolution=ignore-duplicates,return=representation");
      if (rejectBulk) { rejectBulk = false; return new Response("isolierter Bulkfehler", { status: 400 }); }
      if (conflict) return new Response("[]");
    }
    return new Response(JSON.stringify(body));
  };
  try {
    const row = D.toRawDocumentRow(item);
    const globalResult = await storage.persistRawDocumentsDeduped([row]);
    assert.equal(globalResult.persisted, 1);
    const globalRow = writes.find(w => w.path.endsWith("raw_documents")).body[0];
    contextEqual(globalRow, row); assert.equal(Object.hasOwn(globalRow, "raw"), false);
    assert.equal(globalRow.source_id, item.sourceId);
    assert.equal(writes.find(w => w.path.endsWith("document_findings")).body[0].raw_document_id, row.id);
    passed++; console.log("PASS  Speicheraufrufer und Spaltenfilter uebertragen Quellenkontext und verknuepfte Fundstelle");
    writes.length = 0;
    const queueResult = await storage.persistiereRohdokumenteWarteschlange([item]);
    assert.equal(queueResult.ok, true); assert.deepEqual(queueResult.neuIds, [row.id]);
    contextEqual(writes[0].body[0], globalRow);
    passed++; console.log("PASS  Schwesterpfad Warteschlange behaelt denselben minimierten Quellenkontext");
    writes.length = 0; conflict = true;
    assert.equal((await storage.persistRawDocumentsDeduped([row])).persisted, 0);
    passed++; console.log("PASS  atomar abgewiesene Dublette wird nicht als Neuanlage gezaehlt");
    writes.length = 0; rejectBulk = true;
    const fallback = await storage.persistRawDocumentsDeduped([row]);
    assert.equal(fallback.persisted, 0); assert.equal(fallback.einzelnNachgezogen, 1);
    assert.equal(writes.filter(w => w.path.endsWith("raw_documents")).length, 2);
    passed++; console.log("PASS  Einzelrueckfall behaelt denselben atomaren Schutz und bestaetigte Zaehler");
  } finally { global.fetch = actualFetch; }
  console.log(`${passed}/10 Pruefgruppen erfolgreich; kein Production Funktionsnachweis.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
