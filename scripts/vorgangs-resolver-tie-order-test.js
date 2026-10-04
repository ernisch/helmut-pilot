"use strict";

// Gleichstandsregression: synthetische UUIDs, echte Resolverlogik, nur Localhost.
// node scripts/lokal.js scripts/vorgangs-resolver-tie-order-test.js
const A = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const storage = require("../lib/helmut/storage");
const { resolveVorgang } = require("../lib/helmut/understanding");
const { clusterRawDocuments, deriveVorgangId } = require("../lib/helmut/vorgang-identity");
const { contentHash, canonicalizeUrl, dedupeRawDocuments, toRawDocumentRow } = require("../lib/helmut/dedup");
const ISO = "2026-10-04T08:00:00.000000+00:00";
const uuid = n => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
function doc(slug, title = "Zitterpappel") {
  const url = `https://example.org/${slug}`;
  return { id: "rd-" + contentHash({ url, publishedAt: ISO, title }), title,
    content_hash: contentHash({ url, publishedAt: ISO, title }), url,
    canonical_url: canonicalizeUrl(url), published_at: ISO, retrieved_at: ISO,
    confidence: "high", link_type: "direct", summary: null, source_name: null };
}
const clusters = clusterRawDocuments(dedupeRawDocuments([toRawDocumentRow(doc("new"))]));
A.equal(clusters.length, 1);
const cluster = clusters[0], proposal = deriveVorgangId(cluster);
function ko(id, opts = {}) {
  A.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,
    "Fixture muss eine UUID enthalten");
  return { id, vorgang_id: `vg-fixture-${id.toLowerCase()}`, status: "complete",
    understanding_status: "complete", headline: "Haselnussstrauch",
    updated_at: ISO, created_at: ISO, ...opts };
}
async function resolve(rows, { exact = null, matching = false, readError = null } = {}) {
  const seen = [];
  let effects = 0;
  const forbidden = async () => { effects++; throw Error("Modell/Schreiben verboten"); };
  const result = await resolveVorgang(cluster, {
    findVorgangCandidates: async (_, limit) => { A.equal(limit, 8); if (readError) throw readError; return rows; },
    getExistingStreng: async () => exact,
    listVorgangDocuments: async id => {
      seen.push(id);
      return [doc("old-a", matching ? "Zitterpappel" : "Haselnussstrauch"),
        doc("old-b", matching ? "Zitterpappel" : "Haselnussstrauch")];
    },
    requestUnderstanding: forbidden, save: forbidden, saveSources: forbidden
  });
  A.equal(effects, 0);
  return { result, seen };
}
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log("PASS " + name); }

(async () => {
  await check("Gleiche Zeit: beide Eingangsreihenfolgen ergeben denselben fachlichen Gewinner", async () => {
    const a = ko(uuid(15)), b = ko(uuid(16));
    for (const rows of [[b, a], [a, b]]) {
      const { result, seen } = await resolve(rows, { matching: true });
      A.equal(result.resolution, "bestand");
      A.equal(result.existing.id, a.id);
      A.deepEqual(seen, [a.id]);
    }
  });
  await check("UUID-Reihenfolge entspricht Bytevergleich, auch bei gross geschriebenen Hexziffern", async () => {
    const ids = [uuid(65535).toUpperCase(), uuid(256), uuid(255), uuid(16), uuid(15)];
    const expected = ids.slice().sort((a, b) => Buffer.compare(
      Buffer.from(a.replaceAll("-", ""), "hex"), Buffer.from(b.replaceAll("-", ""), "hex")));
    const { seen } = await resolve(ids.map(id => ko(id)));
    A.deepEqual(seen, expected);
  });
  await check("Exakter aelterer Treffer bleibt vor kleinerer UUID", async () => {
    const exact = ko(uuid(65535), { vorgang_id: proposal, updated_at: "2021-01-01T00:00:00Z" });
    const { result, seen } = await resolve([ko(uuid(1))], { exact, matching: true });
    A.equal(result.existing.id, exact.id);
    A.deepEqual(seen, [exact.id]);
  });
  await check("Deduplizieren vor dem Acht-Fenster: spaete kleine UUID wird nicht hineinsortiert", async () => {
    const exact = ko(uuid(99), { vorgang_id: proposal });
    const retained = [9, 8, 7, 6, 5, 4, 3].map(n => ko(uuid(n)));
    const { seen, result } = await resolve([exact, ...retained, ko(uuid(1))], { exact });
    A.equal(result.spuren.length, 8);
    A.deepEqual(seen, [exact.id, ...retained.map(k => k.id).reverse()]);
  });
  await check("Verschiedene Mikrosekunden bleiben vor der UUID massgeblich", async () => {
    const older = ko(uuid(1), { updated_at: "2026-10-04T08:00:00.123455+00:00" });
    const newer = ko(uuid(2), { updated_at: "2026-10-04T08:00:00.123456+00:00" });
    A.deepEqual((await resolve([older, newer])).seen, [newer.id, older.id]);
  });
  await check("Bestehender created_at-Ersatz bleibt erhalten", async () => {
    const older = ko(uuid(1), { updated_at: null, created_at: "2020-01-01T00:00:00Z" });
    const newer = ko(uuid(2), { updated_at: null, created_at: "2021-01-01T00:00:00Z" });
    A.deepEqual((await resolve([older, newer])).seen, [newer.id, older.id]);
  });
  await check("Gleichstandsfix macht aus Lesefehlern keine neue Vorgangsauswahl", async () => {
    const error = Object.assign(Error("synthetic read error"), { fehlerklasse: "fixture" });
    const { result, seen } = await resolve([], { readError: error });
    A.equal(result.resolution, "bestand-lesefehler");
    A.deepEqual(seen, []);
  });
  await check("PostgREST-Leser bindet UUID aufsteigend vor der Acht-Grenze", async () => {
    const requests = [], rows = [ko(uuid(15)), ko(uuid(16))];
    const server = http.createServer((req, res) => {
      requests.push(new URL(req.url, "http://127.0.0.1"));
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(rows));
    });
    const keys = ["HELMUT_V3_STORE", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
    const before = Object.fromEntries(keys.map(k => [k, process.env[k]]));
    try {
      server.listen(0, "127.0.0.1"); await once(server, "listening");
      process.env.HELMUT_V3_STORE = "1";
      process.env.SUPABASE_URL = `http://127.0.0.1:${server.address().port}`;
      process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-local-test-key-no-real-secret";
      for (let i = 0; i < 2; i++) A.deepEqual(await storage.listKnowledgeObjectsByVorgangPrefix(["vg-fixture"], 8), rows);
      A.equal(requests.length, 2);
      for (const request of requests) {
        A.equal(request.pathname, "/rest/v1/knowledge_objects");
        A.equal(request.searchParams.get("order"), "updated_at.desc,id.asc");
        A.equal(request.searchParams.get("limit"), "8");
      }
    } finally {
      for (const k of keys) { if (before[k] === undefined) delete process.env[k]; else process.env[k] = before[k]; }
      const closed = new Promise(resolve => server.close(resolve));
      server.closeAllConnections?.(); await closed;
    }
  });
  await check("Fehlende oder fehlerhafte Fixture-UUIDs werden ausgeschlossen", async () => {
    for (const id of ["", "ko-unqualified", "00000000-0000-4000-8000-zzzzzzzzzzzz"]) A.throws(() => ko(id));
  });
  console.log(`${passed}/${passed} Gleichstandsregressionen bestanden (nur Offline/Localhost).`);
})().catch(error => { console.error(error); process.exitCode = 1; });
