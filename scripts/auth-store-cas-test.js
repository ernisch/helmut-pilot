"use strict";

// Echter Konto- und Speicherpfad. Nur der Transport ist ein deterministischer
// PostgREST Ersatz mit bedingten Updates und einem Primarschluessel.
process.env.HELMUT_STORAGE_BACKEND = "supabase";
process.env.SUPABASE_URL = "https://example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-test-key";
const assert = require("node:assert/strict");
const storage = require("../lib/helmut/storage");
const accounts = require("../lib/helmut/accounts");
const originalFetch = globalThis.fetch;
let blob;
let calls;
let conflictOnce;
let conflictSequence;
let loseReply;
let malformedRead;
let passed = 0;
let failed = 0;

function response(status, payload) {
  const text = payload === undefined ? "" : JSON.stringify(payload);
  return { ok: status < 400, status, statusText: "Testantwort", text: async () => text };
}
globalThis.fetch = async (url, options = {}) => {
  const u = new URL(url);
  assert.equal(u.hostname, "example.invalid");
  assert.equal(u.pathname, "/rest/v1/helmut_store");
  const method = options.method || "GET";
  calls.push({ method, url: u, options });
  if (method === "GET") return response(200, malformedRead ? null : blob ? [{ data: blob }] : []);
  const value = JSON.parse(options.body);
  const prefer = String(options.headers.Prefer || "");
  if (method === "PATCH") {
    assert.equal(u.searchParams.get("id"), "eq.main-auth");
    if (conflictOnce || conflictSequence > 0) {
      conflictOnce = false;
      conflictSequence = Math.max(0, conflictSequence - 1);
      blob = { ...blob, _authStoreRevision: require("node:crypto").randomUUID(), systemErrors: [{ id: "peer" }] };
    }
    const expected = u.searchParams.get("data->>_authStoreRevision");
    const current = blob?._authStoreRevision;
    if (!blob || (current == null ? expected !== "is.null" : expected !== `eq.${current}`)) return response(200, []);
  } else {
    assert.equal(method, "POST");
    assert.equal(value.id, "main-auth");
    if (blob && !prefer.includes("resolution=merge-duplicates")) return response(409, { message: "duplicate key" });
  }
  blob = value.data;
  if (loseReply) { loseReply = false; throw new Error("simulierter Antwortverlust nach Schreiben"); }
  return prefer.includes("return=representation") ? response(200, [{ id: "main-auth" }]) : response(204);
};

function user(i, extra = {}) {
  return { email: `local-${i}@registrierung.invalid`, name: `Lokales Testmandat ${i}`,
    politicianId: `local-${i}`, role: "abgeordneter", active: false, ...extra };
}
async function check(name, run) {
  blob = { users: [], adminSettings: { existing: "preserve" } };
  calls = []; conflictOnce = false; conflictSequence = 0; loseReply = false; malformedRead = false;
  try { await run(); passed += 1; console.log(`PASS  ${name}`); }
  catch (error) { failed += 1; console.error(`FAIL  ${name}: ${error.message}`); }
}
(async () => {
  try {
    await check("500 parallele Kontoanlagen bleiben vollstaendig und getrennt gespeichert", async () => {
      const result = await Promise.all(Array.from({ length: 500 }, (_, i) => accounts.createUser(user(i + 1))));
      assert.equal(result.length, 500);
      assert.equal(blob.users.length, 500);
      assert.equal(new Set(blob.users.map((u) => u.email)).size, 500);
      assert.equal(new Set(blob.users.map((u) => u.politicianId)).size, 500);
      assert.ok(blob.users.every((u) => u.active === false));
      assert.equal(blob.adminSettings.existing, "preserve");
      assert.deepEqual(new Set(blob.users.map((u) => u.id)), new Set(result.map((u) => u.id)));
    });
    await check("Ein veralteter Schreiber kann den frisch gespeicherten Stand nicht ueberschreiben", async () => {
      const first = await storage.readAuthStore();
      const stale = { ...first };
      first.adminSettings = { first: true };
      await storage.writeAuthStore(first);
      stale.adminSettings = { stale: true };
      await assert.rejects(storage.writeAuthStore(stale), { code: "AUTH_STORE_CONFLICT" });
      assert.deepEqual(blob.adminSettings, { first: true });
    });
    await check("Konflikt bei Registrierung liest frisch und bewahrt den parallelen Eintrag", async () => {
      conflictOnce = true;
      await accounts.createUser(user(1));
      assert.equal(blob.users.length, 1);
      assert.deepEqual(blob.systemErrors, [{ id: "peer" }]);
      assert.equal(calls.filter((c) => c.method === "PATCH").length, 2);
    });
    await check("Fortgesetzte Konfliktfolge innerhalb der Eingangsfrist gibt nicht nach 16 Versuchen auf", async () => {
      conflictSequence = 17;
      const result = await accounts.createUser(user(1));
      assert.equal(blob.users.length, 1);
      assert.equal(blob.users[0].id, result.id);
      assert.deepEqual(blob.systemErrors, [{ id: "peer" }]);
      assert.equal(calls.filter((c) => c.method === "PATCH").length, 18);
    });
    await check("Nach Ablauf der Eingangsfrist wird kein Schreibversuch gestartet", async () => {
      const transport = globalThis.fetch;
      const clock = Date.now;
      globalThis.fetch = async (...args) => {
        const result = await transport(...args);
        Date.now = () => clock() + 31000;
        return result;
      };
      try {
        await assert.rejects(accounts.createUser(user(1)), { statusCode: 503 });
        assert.equal(blob.users.length, 0);
        assert.equal(calls.filter((c) => c.method !== "GET").length, 0);
      } finally { Date.now = clock; globalThis.fetch = transport; }
    });
    await check("Registrierung, Sitzungen, Audit und Kostenbelege verdrangen einander nicht", async () => {
      const results = await Promise.all(Array.from({ length: 50 }, async (_, i) => {
        const account = await accounts.createUser(user(i + 1));
        await Promise.all([
          accounts.createSession(account.id),
          accounts.recordAudit({ action: "test.registrierung", userId: account.id }),
          storage.recordLlmUsage({ callType: "test-kein-modellaufruf", politicianId: account.politicianId,
            model: "none", keinAufruf: true, success: false })
        ]);
        return account;
      }));
      assert.equal(blob.users.length, 50);
      assert.equal(blob.sessions.length, 50);
      assert.equal(blob.auditEvents.length, 50);
      assert.equal(blob.llmUsage.length, 50);
      const ids = new Set(results.map((u) => u.id));
      assert.ok(blob.sessions.every((s) => ids.has(s.userId)));
      assert.ok(blob.auditEvents.every((e) => ids.has(e.userId)));
    });
    await check("Nicht gespeicherte Pipeline Sperre wird bei Konkurrenz nicht erteilt", async () => {
      delete process.env.HELMUT_ATOMIC_LOCK;
      conflictOnce = true;
      assert.equal(await storage.acquirePipelineLock("test-konflikt", 5000), false);
      assert.equal(blob.pipelineLocks?.["test-konflikt"], undefined);
    });
    await check("Gleiche E Mail wird unter Konkurrenz nur einmal registriert", async () => {
      const results = await Promise.allSettled([
        accounts.createUser(user(1)), accounts.createUser(user(2, { email: "LOCAL-1@registrierung.invalid" }))
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(blob.users.length, 1);
    });
    await check("Schreiben ohne gelesene Grundlinie wird vor dem Zugriff abgelehnt", async () => {
      await assert.rejects(storage.writeAuthStore({ users: [] }), { code: "AUTH_STORE_SNAPSHOT_MISSING" });
      assert.equal(calls.length, 0);
    });
    await check("Leere Fehlerantwort erzeugt keinen leeren Kontenspeicher", async () => {
      malformedRead = true;
      await assert.rejects(accounts.createUser(user(1)));
      assert.equal(calls.filter((c) => c.method !== "GET").length, 0);
    });
    await check("Fehlende Zeile wird ausschliesslich eingefuegt und danach bedingt geschrieben", async () => {
      blob = null;
      await accounts.createUser(user(1));
      await accounts.createUser(user(2));
      const insert = calls.find((c) => c.method === "POST");
      assert.ok(insert);
      assert.ok(!insert.options.headers.Prefer.includes("merge-duplicates"));
      assert.equal(blob.users.length, 2);
    });
    await check("Unklarer Schreibausgang wird nicht blind wiederholt", async () => {
      loseReply = true;
      await assert.rejects(accounts.createUser(user(1)), /Antwortverlust/);
      assert.equal(calls.filter((c) => c.method !== "GET").length, 1);
      assert.equal(blob.users.length, 1);
      await accounts.createUser(user(2));
      assert.equal(blob.users.length, 2, "ein Fehler blockiert die naechste Kontoanlage nicht");
    });
    await check("Fuenf getrennte Prozesse speichern mit Netzschutz 500 Konten", async () => {
      const http = require("node:http");
      const { once } = require("node:events");
      const { startRegistrationWorker } = require("./auth-store-cas-datenbank-test");
      const server = http.createServer(async (req, res) => {
        try {
          let body = "";
          for await (const chunk of req) body += chunk;
          const answer = await globalThis.fetch(`https://example.invalid${req.url}`, {
            method: req.method, body: body || undefined,
            headers: { Prefer: req.headers.prefer || "" }
          });
          res.writeHead(answer.status, { "Content-Type": "application/json" });
          res.end(await answer.text());
        } catch (_) { res.writeHead(500); res.end("{}"); }
      });
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      try {
        const base = `http://127.0.0.1:${server.address().port}`;
        const results = await Promise.allSettled(Array.from({ length: 5 }, (_, index) =>
          startRegistrationWorker({ base, token: "nur-lokaler-testwert", index })));
        const failure = results.find((r) => r.status === "rejected");
        if (failure) throw failure.reason;
        assert.ok(results.every((r) => r.value.includes('"successful":100')));
        assert.equal(blob.users.length, 500);
        assert.equal(new Set(blob.users.map((u) => u.email)).size, 500);
        assert.equal(new Set(blob.users.map((u) => u.politicianId)).size, 500);
        assert.ok(blob.users.every((u) => u.active === false));
      } finally { await new Promise((resolve) => server.close(resolve)); }
    });
  } finally { globalThis.fetch = originalFetch; }
  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exitCode = failed ? 1 : 0;
})().catch((error) => { console.error(error); process.exitCode = 1; });
