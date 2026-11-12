"use strict";

// Echte Konto-/Storage-Funktionen, synthetischer grosser Kontenstand. Nur der
// Transport ist ersetzt. Der echte SQL/REST Nachweis steht im bestehenden DB Test.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
process.env.HELMUT_STORAGE_BACKEND = "supabase";
process.env.SUPABASE_URL = "https://example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-test-key";
const storage = require("../lib/helmut/storage");
const accounts = require("../lib/helmut/accounts");
const selection = require("./fixtures/store-json-selection");
const originalFetch = globalThis.fetch;
let blob, calls, bytes, reply;
let passed = 0;
const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
function reset() {
  blob = {
    _authStoreRevision: crypto.randomUUID(),
    users: [{ id: "user-a", active: true, role: "referent", passwordHash: "secret", passwordSalt: "salt" },
      { id: "user-b", active: false, role: "admin" }],
    sessions: [{ userId: "user-a", tokenHash: hash("token-a"), expiresAt: "2099-01-01T00:00:00Z" }],
    assignments: [{ userId: "user-a", politicianId: "mandat-a" }, { userId: "user-b", politicianId: "mandat-b" }],
    llmUsage: [{ id: "large-retained-history", details: "x".repeat(3000000) }],
    testKostenTage: { "2026-11-12": { calls: { unknown: { status: "ungeklaert", reserved: 212000 } } } },
    processRuns: [{ process: "briefing-lage", runId: "run-a", createdAt: "2026-11-12T05:00:00Z" }],
    understandingRetries: { "vorgang-a": 2 }, updateRetries: { "vorgang-b": 1 }
  };
  // hashToken in accounts hashes den Rohtoken, nicht seine JSON Darstellung.
  blob.sessions[0].tokenHash = crypto.createHash("sha256").update("token-a").digest("hex");
  calls = []; bytes = 0; reply = undefined;
}
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input), method = options.method || "GET";
  assert.equal(url.origin, "https://example.invalid");
  assert.equal(url.pathname, "/rest/v1/helmut_store");
  assert.equal(url.searchParams.get("id"), "eq.main-auth");
  calls.push({ method, select: url.searchParams.get("select") });
  let body;
  if (method === "GET") body = reply !== undefined ? reply : blob ? [selection("main-auth", blob, input)] : [];
  else {
    assert.equal(method, "PATCH");
    assert.equal(url.searchParams.get("data->>_authStoreRevision"), "eq." + blob._authStoreRevision);
    blob = JSON.parse(options.body).data;
    body = [{ id: "main-auth" }];
  }
  const text = JSON.stringify(body); bytes += Buffer.byteLength(text);
  return { ok: true, status: 200, text: async () => text };
};
async function check(name, work) { reset(); await work(); passed++; console.log("PASS " + name); }
(async () => {
  try {
    await check("Sitzungspruefung liest ausschliesslich Konten und Sitzungen, ohne Kostenhistorie", async () => {
      const before = hash(blob), fullBytes = Buffer.byteLength(JSON.stringify(blob));
      const result = await accounts.resolveSession("token-a");
      assert.equal(result.user.id, "user-a"); assert.equal(result.user.role, "referent");
      assert.deepEqual(calls, [{ method: "GET", select: "id,users:data->users,sessions:data->sessions" }]);
      assert.ok(bytes < fullBytes / 100, `synthetische Antwort ${bytes}/${fullBytes} Bytes`);
      assert.equal(hash(blob), before);
    });
    await check("Kein Cache: Deaktivierung und Sitzungsentzug wirken beim naechsten Lesen", async () => {
      assert.ok(await accounts.resolveSession("token-a"));
      blob.users[0].active = false; assert.equal(await accounts.resolveSession("token-a"), null);
      blob.users[0].active = true; blob.sessions = []; assert.equal(await accounts.resolveSession("token-a"), null);
      assert.equal(calls.length, 3);
    });
    await check("Fremde, abgelaufene oder fehlende Sitzung erhaelt keinen Zugriff", async () => {
      assert.equal(await accounts.resolveSession("fremd"), null);
      blob.sessions[0].expiresAt = "2000-01-01T00:00:00Z";
      assert.equal(await accounts.resolveSession("token-a"), null);
      assert.equal(await accounts.resolveSession(null), null);
      assert.equal(calls.length, 2);
    });
    await check("Leere Zeile bleibt leer und wird beim Lesen nicht angelegt", async () => {
      blob = null; assert.equal(await accounts.resolveSession("token-a"), null);
      assert.deepEqual(await accounts.listUsers(), []); assert.equal(blob, null);
      assert.ok(calls.every(c => c.method === "GET"));
    });
    await check("Unvollstaendige, fremde und mehrdeutige Antworten scheitern geschlossen", async () => {
      for (reply of [null, {}, [null], [{ id: "main-auth" }], [{ id: "fremd", users: [], sessions: [] }],
        [{ id: "main-auth", users: {}, sessions: [] }], [{ id: "main-auth", users: [], sessions: "invalid" }],
        [{ id: "main-auth", users: [], sessions: [] }, { id: "main-auth", users: [], sessions: [] }]]) {
        await assert.rejects(accounts.resolveSession("token-a"));
      }
      assert.ok(calls.every(c => c.method === "GET"));
    });
    await check("Teilsicht und ihre Kopie koennen keinen vollen Speicher ueberschreiben", async () => {
      const view = await storage.readAuthStore({ fields: ["users"] }), before = hash(blob);
      for (const candidate of [view, { ...view }]) {
        await assert.rejects(storage.writeAuthStore(candidate), { code: "AUTH_STORE_READ_ONLY" });
        await assert.rejects(storage.writeStore(candidate), { code: "AUTH_STORE_READ_ONLY" });
      }
      assert.equal(hash(blob), before); assert.equal(calls.length, 1);
    });
    await check("Teilschreiben ist auch im lokalen Dateimodus gesperrt", async () => {
      const view = await storage.readAuthStore({ fields: ["users"] });
      process.env.HELMUT_STORAGE_BACKEND = "local";
      try { await assert.rejects(storage.writeAuthStore({ ...view }), { code: "AUTH_STORE_READ_ONLY" }); }
      finally { process.env.HELMUT_STORAGE_BACKEND = "supabase"; }
      assert.equal(calls.length, 1);
    });
    await check("Unbekannte Felder und Queryfragmente loesen keinen Transport aus", async () => {
      for (const fields of [[], "users", ["users,data"], ["__proto__"], ["_authStoreRevision"], [null]]) {
        await assert.rejects(storage.readAuthStore({ fields }));
      }
      assert.equal(calls.length, 0);
    });
    await check("Echte Mutation behaelt vollen CAS Stand, Kostenhistorie und unbekannte Reserven", async () => {
      const history = hash(blob.llmUsage), money = hash(blob.testKostenTage);
      await accounts.createSession("user-a");
      assert.deepEqual(calls.map(c => c.method), ["GET", "PATCH"]);
      assert.equal(calls[0].select, "data");
      assert.equal(hash(blob.llmUsage), history); assert.equal(hash(blob.testKostenTage), money);
      assert.equal(blob.sessions.length, 2);
    });
    await check("Kontenausgabe entfernt Hashes, Mandatszuordnung bleibt gefiltert", async () => {
      const users = await accounts.listUsers();
      assert.equal(users[0].passwordHash, undefined); assert.equal(users[0].passwordSalt, undefined);
      assert.deepEqual(await accounts.assignmentsForUser("user-a"), [blob.assignments[0]]);
      assert.equal(calls[1].select, "id,assignments:data->assignments");
    });
    await check("Prozess- und Retryleser uebertragen ausschliesslich ihre jeweiligen Felder", async () => {
      assert.deepEqual(await storage.listProcessRuns({}, { relationalAktiv: false }), blob.processRuns);
      assert.deepEqual(await storage.getUnderstandingRetries(), blob.understandingRetries);
      assert.deepEqual(await storage.getUpdateRetries(), blob.updateRetries);
      assert.deepEqual(calls.map(c => c.select), ["id,processRuns:data->processRuns",
        "id,understandingRetries:data->understandingRetries", "id,updateRetries:data->updateRetries"]);
    });
    await check("Laufkostenbericht verwendet denselben Auth Lesestand genau einmal", async () => {
      let reads = 0;
      const result = await storage.getRunCostReport({ readAuth: async () => { reads++; return blob; } });
      assert.equal(reads, 1); assert.equal(result.laeufe.length, 1); assert.equal(calls.length, 0);
    });
    console.log(`${passed}/${passed} Auth-Lesegruppen bestanden. Kein Production Funktionsnachweis.`);
  } finally { globalThis.fetch = originalFetch; }
})().catch(error => { console.error(error); process.exitCode = 1; });
