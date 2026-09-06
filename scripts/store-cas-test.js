"use strict";

// Getrennte Modulinstanzen teilen ausschliesslich den simulierten Datenbankinhalt.
// Keine gemeinsame Cachekopie, Lesemarke oder Warteschlange zwischen Schreibern.
process.env.HELMUT_STORAGE_BACKEND = "supabase";
process.env.SUPABASE_URL = "https://store-cas.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-test";
process.env.HELMUT_SUPABASE_STORE_ID = "main";
process.env.HELMUT_STORE_CACHE_MS = "10000";
process.env.HELMUT_BLOB_RETRY_BASE_MS = "1";

const assert = require("node:assert/strict");
const rows = new Map();
const copy = (value) => JSON.parse(JSON.stringify(value));
const originalFetch = globalThis.fetch;
let writes = 0;
const writesById = new Map();
let responseOverride;
let passed = 0;
let failed = 0;
const reply = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  assert.equal(url.hostname, "store-cas.invalid");
  assert.equal(url.pathname, "/rest/v1/helmut_store");
  const method = options.method || "GET";
  const payload = options.body ? JSON.parse(options.body) : null;
  const id = payload?.id || url.searchParams.get("id")?.replace(/^eq\./, "");
  if (method === "GET") return reply(200, rows.has(id) ? [{ data: copy(rows.get(id)) }] : []);
  writes += 1;
  writesById.set(id, (writesById.get(id) || 0) + 1);
  if (method === "POST") {
    if (rows.has(id) && !String(options.headers.Prefer).includes("resolution=merge-duplicates")) {
      return reply(409, { code: "23505" });
    }
  } else {
    assert.equal(method, "PATCH");
    const condition = url.searchParams.get("data->>_storeRevision");
    assert.ok(condition, "Ersetzen braucht eine Datenbankbedingung");
    const current = rows.get(id)?._storeRevision ?? null;
    if (!rows.has(id) || (condition === "is.null" ? current !== null : condition !== `eq.${current}`)) {
      return reply(200, []);
    }
  }
  rows.set(id, copy(payload.data));
  return reply(200, responseOverride === undefined ? [{ id }] : responseOverride);
};
function instance() {
  delete require.cache[require.resolve("../lib/helmut/storage")];
  return require("../lib/helmut/storage");
}
async function check(name, run) {
  try { await run(); passed += 1; console.log(`PASS  ${name}`); }
  catch (error) { failed += 1; console.error(`FAIL  ${name}: ${error.message}`); }
}

(async () => {
  try {
    for (const key of ["main", "p-mandat"]) {
      const id = key === "main" ? "main" : `main-${key}`;
      await check(`${key}: fremde Instanz kann den bestaetigten Stand nicht ersetzen`, async () => {
        rows.set(id, { userNotes: [{ id: "alt" }] });
        const a = instance(); const b = instance();
        const first = await a.readStore(key); const stale = await b.readStore(key);
        first.userNotes.push({ id: "eins" }); stale.userNotes.push({ id: "zwei" });
        await a.writeStore(first, key);
        await assert.rejects(b.writeStore(stale, key), { code: "STORE_WRITE_CONFLICT" });
        assert.deepEqual(rows.get(id).userNotes.map((n) => n.id).sort(), ["alt", "eins"]);
        const fresh = await b.readStore(key);
        fresh.userNotes.push({ id: "zwei" });
        await b.writeStore(fresh, key);
        assert.deepEqual(rows.get(id).userNotes.map((n) => n.id).sort(), ["alt", "eins", "zwei"]);
        assert.equal(typeof rows.get(id)._storeRevision, "string");
      });
      await check(`${key}: auch zwei erste Anlagen koennen einander nicht ersetzen`, async () => {
        rows.delete(id);
        const a = instance(); const b = instance();
        const first = await a.readStore(key); const stale = await b.readStore(key);
        first.userNotes.push({ id: "erhalten" }); stale.userNotes.push({ id: "veraltet" });
        await a.writeStore(first, key);
        await assert.rejects(b.writeStore(stale, key), { code: "STORE_WRITE_CONFLICT" });
        assert.deepEqual(rows.get(id).userNotes.map((n) => n.id), ["erhalten"]);
      });
      await check(`${key}: blindes Schreiben ohne Lesestand wird vor dem Zugriff verweigert`, async () => {
        const before = copy(rows.get(id)); const count = writes;
        await assert.rejects(instance().writeStore({ userNotes: [] }, key), { code: "STORE_WRITE_SNAPSHOT_MISSING" });
        assert.equal(writes, count);
        assert.deepEqual(rows.get(id), before);
      });
      await check(`${key}: ungueltige gespeicherte Revision wird nicht wie Altbestand behandelt`, async () => {
        rows.set(id, { userNotes: [], _storeRevision: 7 });
        const count = writes;
        await assert.rejects(instance().readStore(key), { code: "STORE_READ_INVALID" });
        assert.equal(writes, count);
      });
    }
    await check("Ein alter Objektspread erhaelt keine neue Schreibberechtigung", async () => {
      rows.set("main-p-spread", { userNotes: [] });
      const a = instance();
      const first = await a.readStore("p-spread");
      const stale = { ...first, userNotes: [{ id: "veraltet" }] };
      first.userNotes.push({ id: "erhalten" });
      const saved = await a.writeStore(first, "p-spread");
      await assert.rejects(a.writeStore(stale, "p-spread"), { code: "STORE_WRITE_CONFLICT" });
      saved.userNotes.push({ id: "folge" });
      await a.writeStore(saved, "p-spread");
      assert.deepEqual(rows.get("main-p-spread").userNotes.map((n) => n.id).sort(), ["erhalten", "folge"]);
    });
    await check("Eine Lesemarke gilt nur fuer genau ihren Speicherschluessel", async () => {
      const a = instance(); const read = await a.readStore("p-quelle"); const count = writes;
      await assert.rejects(a.writeStore(read, "p-fremd"), { code: "STORE_WRITE_CONFLICT" });
      assert.equal(writes, count);
    });
    await check("Eine unklare Schreibquittung erzeugt keinen bestaetigten Cache", async () => {
      rows.set("main-p-quittung", { userNotes: [] });
      const a = instance(); const read = await a.readStore("p-quittung");
      read.userNotes.push({ id: "geschrieben" }); responseOverride = [{ id: "falsch" }];
      const count = writesById.get("main-p-quittung") || 0;
      await assert.rejects(a.writeStore(read, "p-quittung"));
      responseOverride = undefined;
      assert.equal(writesById.get("main-p-quittung"), count + 1, "keine blinde Wiederholung");
      assert.deepEqual((await a.readStore("p-quittung")).userNotes.map((n) => n.id), ["geschrieben"]);
    });
    await check("500 getrennte Mandatsspeicher bleiben vollstaendig und isoliert", async () => {
      const a = instance();
      await Promise.all(Array.from({ length: 500 }, async (_, i) => {
        const key = `p-last-${i}`; const store = await a.readStore(key);
        store.userNotes.push({ id: `notiz-${i}` });
        await a.writeStore(store, key);
      }));
      for (let i = 0; i < 500; i += 1) {
        assert.deepEqual(rows.get(`main-p-last-${i}`).userNotes.map((n) => n.id), [`notiz-${i}`]);
      }
    });
    await check("Fuenf echte Prozesse erkennen Konflikte und erhalten nach erneutem Lesen alle Aenderungen", async () => {
      const http = require("node:http");
      const { once } = require("node:events");
      const server = http.createServer(async (req, res) => {
        try {
          let body = "";
          for await (const chunk of req) body += chunk;
          const result = require("./fixtures/store-rest-memory")(rows, `http://127.0.0.1${req.url}`, {
            method: req.method, headers: req.headers, body: body || undefined
          });
          res.writeHead(result.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result.body));
        } catch (_) { res.writeHead(500); res.end(); }
      });
      server.listen(0, "127.0.0.1"); await once(server, "listening");
      try {
        const { runWriters } = require("./fixtures/store-cas-processes");
        for (const key of ["main", "p-cas-existing", "p-cas-new"]) {
          const id = key === "main" ? "main" : `main-${key}`;
          const existing = key !== "p-cas-new";
          if (existing) rows.set(id, { userNotes: [{ id: "alt" }] });
          else rows.delete(id);
          await runWriters({ base: `http://127.0.0.1:${server.address().port}`, token: "synthetic-test", key });
          assert.deepEqual(rows.get(id).userNotes.map((n) => n.id).sort(),
            [...(existing ? ["alt"] : []), ...Array.from({ length: 5 }, (_, i) => `prozess-${i}`)].sort());
        }
      } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
    });
  } finally { globalThis.fetch = originalFetch; }
  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exitCode = failed ? 1 : 0;
})().catch((error) => { console.error(error); process.exitCode = 1; });
