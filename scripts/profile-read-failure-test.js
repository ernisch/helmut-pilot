"use strict";

// Echte Speicherschicht und Mandantenaufloesung, nur der HTTP Transport ist
// ersetzt. Eine nicht lesbare Datenbank darf keine leere Mandatsliste beweisen.
process.env.HELMUT_STORAGE_BACKEND = "supabase";
process.env.SUPABASE_URL = "https://example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-test-key";
process.env.HELMUT_V3_STORE = "1";
process.env.HELMUT_PROFILE_DB_MODE = "1";
process.env.HELMUT_PROFILE_DB_EXCLUSIVE = "1";
delete process.env.HELMUT_TENANT_JWT_MODE;

const assert = require("node:assert/strict");
const storage = require("../lib/helmut/storage");
const tenantContext = require("../lib/helmut/tenant-context");
const originalFetch = globalThis.fetch;
let status = 200;
let payload = [];
let calls = [];
let passed = 0;
let failed = 0;

globalThis.fetch = async (url, options = {}) => {
  const path = new URL(url).pathname;
  calls.push({ path, method: options.method || "GET" });
  if (path === "/rest/v1/helmut_store") {
    return { ok: true, status: 200, text: async () => JSON.stringify([{ data: {
      profiles: { "blob-profile": { id: "blob-profile", fullName: "Lokales Testprofil", profileActive: true } }
    } }]) };
  }
  assert.equal(path, "/rest/v1/profiles", "ausschliesslich Profilabrufe");
  return { ok: status === 200, status, statusText: "Testantwort", text: async () => JSON.stringify(payload) };
};

async function check(name, run) {
  calls = [];
  try {
    await run();
    assert.ok(calls.every((call) => call.method === "GET"), "Lesepfad schreibt nichts");
    if (storage.profileDbExclusiveEnabled()) {
      assert.ok(calls.every((call) => call.path === "/rest/v1/profiles"), "kein Ersatzbestand aus dem Blob");
    }
    passed += 1; console.log(`PASS  ${name}`);
  } catch (error) { failed += 1; console.error(`FAIL  ${name}: ${error.message}`); }
}

(async () => {
  try {
    status = 522; payload = { message: "Connection timed out" };
    await check("Einzelprofil: Datenbankfehler bleibt Fehler", async () => {
      await assert.rejects(storage.getProfile("local-test"), /522/);
    });
    await check("Profilinventar: Datenbankfehler bleibt Fehler", async () => {
      await assert.rejects(storage.listFullProfiles(), /522/);
    });
    await check("Cron meldet Ladestoerung statt erfolgreichem Leerlauf", async () => {
      assert.deepEqual(await tenantContext.resolveCronTenants(), { tenantIds: [], reason: "mandanten-liste-nicht-ladbar" });
    });
    status = 200;
    for (const invalid of [null, { message: "keine auswertbare Antwort" }]) {
      payload = invalid;
      await check(`Ungueltige Antwort ${JSON.stringify(invalid)} ist kein leerer Bestand`, async () => {
        await assert.rejects(storage.getProfile("local-test"));
        await assert.rejects(storage.listFullProfiles());
        assert.equal((await tenantContext.resolveCronTenants()).reason, "mandanten-liste-nicht-ladbar");
      });
    }
    payload = [];
    await check("Tatsaechlich leere Antwort bleibt ein gueltiger Leerzustand", async () => {
      assert.equal(await storage.getProfile("local-test"), null);
      assert.deepEqual(await storage.listFullProfiles(), []);
      assert.deepEqual(await tenantContext.resolveCronTenants(), { tenantIds: [], reason: "keine-aktiven-mandanten" });
    });
    payload = Array.from({ length: 504 }, (_, i) => ({
      id: `local-profile-${String(i + 1).padStart(3, "0")}`,
      name: `Lokales Testprofil ${i + 1}`,
      mandate_profiles: [{ user_id: `local-profile-${String(i + 1).padStart(3, "0")}`, aktiv: i < 500 }]
    }));
    await check("Nach Erholung werden alle 500 aktiven Mandate aus einem Abruf aufgeloest", async () => {
      const result = await tenantContext.resolveCronTenants();
      assert.equal(result.reason, "ok");
      assert.deepEqual(result.tenantIds, payload.slice(0, 500).map((row) => row.id));
      assert.equal(calls.length, 1);
    });
    delete process.env.HELMUT_PROFILE_DB_EXCLUSIVE;
    status = 522; payload = { message: "Connection timed out" };
    await check("Dualmodus behaelt seinen vorhandenen Blob Ersatzpfad", async () => {
      assert.equal((await storage.getProfile("blob-profile")).id, "blob-profile");
      assert.deepEqual((await storage.listFullProfiles()).map((profile) => profile.id), ["blob-profile"]);
    });
  } finally { globalThis.fetch = originalFetch; }
  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exitCode = failed ? 1 : 0;
})().catch((error) => { console.error(error); process.exitCode = 1; });
