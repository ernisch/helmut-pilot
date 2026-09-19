"use strict";

// Echte Storage Leser und Promptbauer, nur der HTTP Transport ist lokal.
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const storage = require("../lib/helmut/storage");
const U = require("../lib/helmut/understanding");
const L = require("../lib/helmut/lage-quellenbeleg");
const ganz = "Die Kommission hoert am Dienstag Fachleute zur Finanzierung kommunaler Beratungsstellen an.";
const fragment = "Die regionale Kommission untersucht gemeinsam mit den Kommunen die Finanzier";
const alterRss = (ganz + " Die nachfolgende Beratung untersucht " + "weitere Einzelheiten ".repeat(20)).slice(0, 240);
const genauGanz = "Die Kommission berät die Finanzierung kommunaler Beratungsstellen. Sie hört am Dienstag Fachleute aus Wissenschaft und Verwaltung an. Ein Beschluss über neue Mittel steht noch aus; die Ergebnisse der Anhörung sollen fachlich geprüft werden.";
assert.equal(genauGanz.length, 240);
const docs = [ganz, ganz + " Anschliessend soll", fragment, "Kurzer vorhandener RSS Kontext", alterRss, genauGanz].map((summary, i) => ({
  id: "rd-satz-" + i, title: "Parlament beraet kommunale Pflegeangebote", summary,
  url: "https://example.org/pflege/" + i, canonical_url: "https://example.org/pflege/" + i,
  published_at: "2026-09-19T06:00:00.000Z", created_at: "2026-09-19T07:00:00.000Z",
  raw: i < 3 ? { helmutQuellenkontext: { version: 1, status: "ergaenzt", herkunft: "artikel-metadaten" } } : {}
}));
const before = JSON.stringify(docs);
const expected = [ganz, ganz, null, docs[3].summary, ganz, genauGanz];
let passed = 0, requests = 0, writes = 0;
async function main() {
  assert.equal(process.env.HELMUT_LOKALER_SCHUTZ, "aktiv");
  const server = http.createServer((req, res) => {
    requests++;
    if (req.method !== "GET") writes++;
    const url = new URL(req.url, "http://127.0.0.1");
    const select = url.searchParams.get("select") || "";
    const projected = docs.map(({ raw, ...d }) => ({ ...d,
      ...(select.includes("quellenauszug_beleg:raw->helmutQuellenkontext")
        ? { quellenauszug_beleg: raw.helmutQuellenkontext || null } : {}) }));
    const result = url.pathname.endsWith("/ko_document_links") ? projected.map(d => ({
      knowledge_object_id: "ko-vg-satz", raw_document_id: d.id, raw_documents: d
    })) : projected;
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(result));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const names = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "HELMUT_V3_STORE"];
  const original = Object.fromEntries(names.map(n => [n, process.env[n]]));
  process.env.SUPABASE_URL = "http://127.0.0.1:" + server.address().port;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "rein-lokaler-testwert";
  process.env.HELMUT_V3_STORE = "1";
  try {
    const readers = [
      ["Erstverstehen", () => storage.listRecentRawDocuments(10, 30)],
      ["Rohdokumentfenster", () => storage.listRawDocuments({ limit: 10, days: 30 })],
      ["Warteschlangenauftrag", () => storage.getRawDocumentsByIds(docs.map(d => d.id))],
      ["Aktualisierung und Pending", () => storage.listKoDocuments("ko-vg-satz")],
      ["Allgemeine Vorgangsquellen", () => storage.getSourcesForVorgang("vg-satz")],
      ["Gebundene Lagequellen", () => storage.getSourcesForVorgang("vg-satz",
        { lageKoId: "ko-vg-satz", lageQuellen: docs })]
    ];
    for (const [name, read] of readers) {
      const result = await read();
      assert.deepEqual(result.map(d => d.summary), expected, name);
      assert(result.every(d => !Object.hasOwn(d, "raw") && !Object.hasOwn(d, "quellenauszug_beleg")));
      assert.equal(JSON.stringify(docs), before);
      const prompt = U.buildUnderstandingPrompt({ documents: result });
      assert(prompt.includes(ganz)); assert(!prompt.includes(fragment)); assert(!prompt.includes("Anschliessend soll"));
      const lage = L.baueEingabe([{ vorgang_id: "vg-satz" }], { "vg-satz": result }, new Date("2026-09-19T09:00:00Z"));
      assert.deepEqual(lage[0].quellenbelege.map(q => q.auszug), expected.map(s => s || ""));
      passed++; console.log("PASS " + name + ": ganzer Kontext in beiden Fachpfaden");
    }
    assert.equal(requests, readers.length); assert.equal(writes, 0);
    console.log(`${passed}/${passed} Quellenlesepfade bestanden; null Schreibvorgaenge und Modellaufrufe`);
  } finally {
    for (const n of names) { if (original[n] === undefined) delete process.env[n]; else process.env[n] = original[n]; }
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
