"use strict";

// Echter Lagevorlauf und echte Profilablage, HTTP Transport und Quellenplan
// ersetzt. Belegt die Zahl der Profilabrufe, keine Production Wanduhrleistung.
process.env.HELMUT_STORAGE_BACKEND = "supabase";
process.env.SUPABASE_URL = "https://example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-test-key";
process.env.HELMUT_V3_STORE = "1";
process.env.HELMUT_PROFILE_DB_MODE = "1";
process.env.HELMUT_PROFILE_DB_EXCLUSIVE = "1";
delete process.env.HELMUT_TENANT_JWT_MODE;

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const storage = require("../lib/helmut/storage");
const scheduler = require("../lib/helmut/scheduler");
const LE = require("../lib/helmut/lage-erfassung");
const GP = require("../lib/helmut/cron-globalphase");
const src = fs.readFileSync(path.join(__dirname, "../lib/helmut/scheduler.js"), "utf8");
const body = src.slice(src.indexOf("async function runGeteilteLageErfassung("), src.indexOf("async function runLageCheck("));
const rows = Array.from({ length: 504 }, (_, i) => ({
  id: `local-profile-${String(i + 1).padStart(3, "0")}`, name: `Lokales Profil ${i + 1}`,
  mandate_profiles: [{ aktiv: i < 500, partei: `Partei ${i + 1}` }]
}));
const ids = rows.slice(0, 500).map((row) => row.id).reverse();
const originalFetch = globalThis.fetch;
let calls = 0;
let plans = [];
let failed = 0;
let passed = 0;
let httpStatus = 200;
let now = 1000;
let planTimeMs = 0;
class TestDate extends Date { static now() { return now; } }
globalThis.fetch = async (url) => {
  calls += 1;
  const u = new URL(url);
  assert.equal(u.pathname, "/rest/v1/profiles");
  const filter = u.searchParams.get("id");
  const found = filter ? rows.filter((row) => `eq.${row.id}` === filter) : rows;
  return { ok: httpStatus === 200, status: httpStatus, text: async () => JSON.stringify(httpStatus === 200 ? found : { message: "Lesestoerung" }) };
};
const context = vm.createContext({
  Date: TestDate, Map, Set, Object, Number, String, Array, Math,
  process: { env: {} }, console: { log() {}, error() {} },
  lageErfassung: LE, cronGlobalphase: GP, lageCheckSourceLimit: 90,
  getActiveProfile: scheduler.getActiveProfile,
  listFullProfiles: storage.listFullProfiles,
  mergeProfileDefaults: scheduler.mergeProfileDefaults,
  getSourcesForProfile: async (profile) => { plans.push(profile); now += planTimeMs; return []; },
  selectLageCheckSources: (sources) => sources
});
vm.runInContext(body, context);

async function check(name, run) {
  calls = 0; plans = []; now = 1000; planTimeMs = 0; httpStatus = 200;
  try { await run(); passed += 1; console.log(`PASS  ${name}`); }
  catch (error) { failed += 1; console.error(`FAIL  ${name}: ${error.message}`); }
}
(async () => {
  try {
    await check("500 Mandate: ein Profilabruf, Reihenfolge und Personalisierung bleiben erhalten", async () => {
      const result = await context.runGeteilteLageErfassung({ tenantIds: [...ids, ids[0]], deadlineMs: 200000 });
      assert.equal(result.status, LE.ERFASSUNG_ABGESCHLOSSEN);
      assert.equal(calls, 1);
      assert.deepEqual(plans.map((profile) => profile.id), ids);
      assert.equal(plans[0].party, "Partei 500");
      assert.equal(plans[499].party, "Partei 1");
    });
    await check("Datenbankausfall: ein fehlgeschlagener Vorlauf, keine 500 Wiederholungen", async () => {
      httpStatus = 522;
      const result = await context.runGeteilteLageErfassung({ tenantIds: ids, deadlineMs: 200000 });
      assert.equal(result.status, LE.ERFASSUNG_FEHLGESCHLAGEN);
      assert.equal(calls, 1);
      assert.equal(plans.length, 0);
    });
    await check("Fehlendes Profil wird benannt und nicht durch leere Personalisierung ersetzt", async () => {
      const result = await context.runGeteilteLageErfassung({ tenantIds: [ids[0], "local-missing"], deadlineMs: 200000 });
      assert.equal(result.status, LE.ERFASSUNG_TEILWEISE);
      assert.equal(result.fehlerhafteProfile.length, 1);
      assert.deepEqual(plans.map((profile) => profile.id), [ids[0]]);
      assert.equal(calls, 1);
    });
    await check("Abgelaufene Frist startet keinen Profilabruf", async () => {
      const result = await context.runGeteilteLageErfassung({ tenantIds: ids, deadlineMs: 999 });
      assert.equal(result.status, LE.ERFASSUNG_FEHLGESCHLAGEN);
      assert.equal(calls, 0);
      assert.equal(plans.length, 0);
    });
    await check("Quellenplanung endet an der gemeinsamen Frist", async () => {
      planTimeMs = 10;
      const result = await context.runGeteilteLageErfassung({ tenantIds: ids, deadlineMs: 1020 });
      assert.equal(result.status, LE.ERFASSUNG_FEHLGESCHLAGEN);
      assert.equal(calls, 1);
      assert.equal(plans.length, 2);
    });
  } finally { globalThis.fetch = originalFetch; }
  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exitCode = failed ? 1 : 0;
})().catch((error) => { console.error(error); process.exitCode = 1; });
