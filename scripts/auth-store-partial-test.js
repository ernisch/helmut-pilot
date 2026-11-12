"use strict";

// Echte Storage-/Kontomutationen, nur der Transport ist ersetzt. Unabhaengiger
// SQL-/REST-Nachweis: fixtures/auth-store-partial-datenbank.js im bestehenden DB Job.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
process.env.HELMUT_STORAGE_BACKEND = "supabase";
process.env.SUPABASE_URL = "https://example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-test-key";
process.env.HELMUT_AUTH_PATCH_V1 = "on";
const storage = require("../lib/helmut/storage");
const accounts = require("../lib/helmut/accounts");
const selectedRow = require("./fixtures/store-json-selection");
const originalFetch = globalThis.fetch;
let blob, calls, peer, loseReply, rpcMissing, passed = 0;
const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
function reset() {
  process.env.HELMUT_AUTH_PATCH_V1 = "on";
  blob = { _authStoreRevision: crypto.randomUUID(), users: [], sessions: [],
    llmUsage: [{ id: "retained", history: "x".repeat(3000000) }],
    betriebskostenBudget: { calls: { held: { status: "ungeklaert", reserved: 212000 } } },
    futureField: { nested: { keep: true } } };
  calls = []; peer = false; loseReply = false; rpcMissing = false;
}
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input), method = options.method || "GET";
  assert.equal(url.origin, "https://example.invalid");
  const body = options.body ? JSON.parse(options.body) : null;
  calls.push({ method, path: url.pathname, body, bytes: Buffer.byteLength(options.body || "") });
  const response = (status, data) => ({ ok: status < 400, status,
    text: async () => JSON.stringify(data) });
  if (method === "GET") {
    assert.equal(url.pathname, "/rest/v1/helmut_store");
    return response(200, blob ? [selectedRow("main-auth", blob, input)] : []);
  }
  if (url.pathname === "/rest/v1/rpc/helmut_auth_cas_patch_v1") {
    assert.equal(method, "POST"); assert.equal(body.p_id, "main-auth");
    if (rpcMissing) return response(404, { code: "PGRST202" });
    if (peer) { peer = false; blob = { ...blob, peerField: "preserved", _authStoreRevision: crypto.randomUUID() }; }
    if (!blob || (blob._authStoreRevision ?? null) !== body.p_expected_revision) return response(200, []);
    const next = structuredClone(blob);
    for (const key of body.p_remove) delete next[key];
    blob = { ...next, ...body.p_set, _authStoreRevision: body.p_new_revision };
    if (loseReply) { loseReply = false; throw Error("simulierter Antwortverlust nach gespeichertem RPC"); }
    return response(200, [{ id: "main-auth" }]);
  }
  assert.equal(url.pathname, "/rest/v1/helmut_store");
  if (method === "POST") {
    if (blob) return response(409, {});
    blob = body.data;
  } else {
    assert.equal(method, "PATCH");
    const expected = url.searchParams.get("data->>_authStoreRevision");
    if (!blob || expected !== `eq.${blob._authStoreRevision}`) return response(200, []);
    blob = body.data;
  }
  return response(200, [{ id: "main-auth" }]);
};
async function check(name, run) { reset(); await run(); passed++; console.log("PASS " + name); }
(async () => {
  try {
    await check("Neue Session uebertraegt keine unveraenderte Kostenhistorie; Vollstand bleibt gleich", async () => {
      const before = hash(blob.llmUsage), budget = hash(blob.betriebskostenBudget), full = Buffer.byteLength(JSON.stringify(blob));
      await accounts.createSession("synthetic-user");
      const writes = calls.filter(c => c.method !== "GET");
      assert.equal(writes.length, 1); assert.equal(writes[0].path, "/rest/v1/rpc/helmut_auth_cas_patch_v1");
      assert.ok(writes[0].bytes < full / 100);
      assert.equal(writes[0].body.p_set.llmUsage, undefined);
      assert.equal(writes[0].body.p_set.betriebskostenBudget, undefined);
      assert.equal(hash(blob.llmUsage), before); assert.equal(hash(blob.betriebskostenBudget), budget);
      assert.deepEqual(blob.futureField, { nested: { keep: true } }); assert.equal(blob.sessions.length, 1);
      console.log(`Synthetische Schreibanfrage: ${writes[0].bytes} statt ${full} Requestbytes; keine RAM-/Production-Aussage.`);
    });
    await check("Verschachtelte Aenderung wird gegen unveraenderliche Fingerabdruecke erkannt", async () => {
      const store = await storage.readAuthStore(); store.futureField.nested.keep = false;
      await storage.writeAuthStore(store);
      assert.deepEqual(calls[1].body.p_set.futureField, { nested: { keep: false } });
      assert.equal(calls[1].body.p_set.llmUsage, undefined);
    });
    await check("Explizites Entfernen, JSON-null und neue Felder entsprechen dem ganzen JSON", async () => {
      const store = await storage.readAuthStore(); delete store.futureField;
      store.explicitNull = null; store.omitted = undefined; store.newField = [1, 2];
      const expected = JSON.parse(JSON.stringify(store));
      await storage.writeAuthStore(store); expected._authStoreRevision = blob._authStoreRevision;
      assert.deepEqual(blob, expected); assert.ok(calls[1].body.p_remove.includes("futureField"));
      assert.equal(Object.hasOwn(blob, "omitted"), false); assert.equal(blob.explicitNull, null);
    });
    await check("Fehlende Defaultfelder werden wie beim alten Gesamtschreiben ergaenzt", async () => {
      const store = await storage.readAuthStore(); await storage.writeAuthStore(store);
      assert.deepEqual(blob.assignments, []); assert.ok(Object.hasOwn(calls[1].body.p_set, "assignments"));
    });
    await check("Auch ein anderer Feldpatch macht einen alten Gesamtschreiber ungueltig", async () => {
      const a = await storage.readAuthStore(), stale = { ...a };
      a.adminSettings = { a: true }; await storage.writeAuthStore(a);
      stale.systemErrors = [{ id: "stale" }];
      await assert.rejects(storage.writeAuthStore(stale), { code: "AUTH_STORE_CONFLICT" });
      assert.deepEqual(blob.adminSettings, { a: true }); assert.deepEqual(blob.systemErrors, []);
    });
    await check("Nur bestaetigter CAS Konflikt liest frisch; paralleler fremder Stand bleibt erhalten", async () => {
      peer = true; await accounts.createSession("synthetic-user");
      assert.equal(blob.sessions.length, 1); assert.equal(blob.peerField, "preserved");
      assert.equal(calls.filter(c => c.path.endsWith("helmut_auth_cas_patch_v1")).length, 2);
    });
    await check("Verlorene RPC Antwort wird weder wiederholt noch ueber altes PATCH umgangen", async () => {
      loseReply = true;
      await assert.rejects(accounts.createSession("synthetic-user"), /Antwortverlust/);
      assert.equal(blob.sessions.length, 1);
      assert.equal(calls.filter(c => c.method !== "GET").length, 1);
      assert.ok(calls.every(c => c.method !== "PATCH"));
    });
    await check("Fehlende Migration bei gesetztem Flag bleibt ein Fehler ohne Ersatzschreiben", async () => {
      rpcMissing = true; const before = hash(blob);
      await assert.rejects(accounts.createSession("synthetic-user"), /404/);
      assert.equal(hash(blob), before); assert.equal(calls.filter(c => c.method !== "GET").length, 1);
    });
    await check("Ohne exakt on bleibt der alte CAS-Schreibweg aktiv", async () => {
      for (const flag of [undefined, "off", "true", "1", "ON"]) {
        if (flag === undefined) delete process.env.HELMUT_AUTH_PATCH_V1; else process.env.HELMUT_AUTH_PATCH_V1 = flag;
        calls = []; await accounts.createSession("synthetic-user");
        assert.equal(calls[1].method, "PATCH"); assert.equal(calls[1].path, "/rest/v1/helmut_store");
      }
    });
    await check("Aktivierung legitimiert keinen zuvor ohne Fingerabdruecke gelesenen Stand", async () => {
      delete process.env.HELMUT_AUTH_PATCH_V1;
      const old = await storage.readAuthStore(); process.env.HELMUT_AUTH_PATCH_V1 = "on";
      await assert.rejects(storage.writeAuthStore(old), { code: "AUTH_STORE_SNAPSHOT_MISSING" });
      assert.equal(calls.filter(c => c.method !== "GET").length, 0);
    });
    await check("Fehlende Zeile bleibt ein einzelner Insert, Altstand ohne Revision wird bedingt gepatcht", async () => {
      blob = null; await accounts.createSession("synthetic-user"); assert.equal(calls[1].path, "/rest/v1/helmut_store");
      assert.equal(calls[1].method, "POST");
      delete blob._authStoreRevision; calls = [];
      await accounts.createSession("synthetic-user"); assert.equal(calls[1].body.p_expected_revision, null);
      assert.equal(blob.sessions.length, 2);
    });
    await check("Teilsichten und nicht gelesene Objekte bleiben unbeschreibbar", async () => {
      const view = await storage.readAuthStore({ fields: ["users"] });
      await assert.rejects(storage.writeAuthStore({ ...view }), { code: "AUTH_STORE_READ_ONLY" });
      await assert.rejects(storage.writeAuthStore({ users: [] }), { code: "AUTH_STORE_SNAPSHOT_MISSING" });
      assert.equal(calls.filter(c => c.method !== "GET").length, 0);
    });
    console.log(`${passed}/${passed} Auth-Feldpatchgruppen bestanden; kein Production-Funktionsnachweis.`);
  } finally { globalThis.fetch = originalFetch; }
})().catch(error => { console.error(error); process.exitCode = 1; });
