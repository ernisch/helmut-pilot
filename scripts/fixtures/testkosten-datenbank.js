"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawn } = require("node:child_process");
const B = require("../../lib/helmut/testkosten-budget");
async function worker() {
  const base = process.env.HELMUT_TEST_AUTH_CAS_URL;
  assert.equal(new URL(base).hostname, "127.0.0.1");
  Object.assign(process.env, { HELMUT_STORAGE_BACKEND: "supabase", SUPABASE_URL: base,
    SUPABASE_SERVICE_ROLE_KEY: process.env.HELMUT_TEST_AUTH_CAS_KEY,
    HELMUT_SUPABASE_AUTH_STORE_ID: "test-auth-kosten" });
  const storage = require("../../lib/helmut/storage");
  const deps = { storage, now: () => new Date("2026-09-09T12:00:00.000Z"),
    env: { VERCEL_ENV: "production", HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt", AZURE_OPENAI_KEY: "offline" } };
  if (process.argv[2] === "freeze") {
    const auth = await storage.readAuthStore(), day = "2026-09-09";
    const [id, call] = Object.entries(auth[B.KEY][day].calls)[0];
    await assert.rejects(B.abschliessen({ id, day, reserved: call.reserved }, null, deps), { code: "TEST_USD_UNKNOWN" });
    console.log(JSON.stringify({ ungeklärt: true })); return;
  }
  if (process.argv[2] === "settle") {
    const auth = await storage.readAuthStore(), day = "2026-09-09";
    const [id, call] = Object.entries(auth[B.KEY][day].calls).find(([, c]) => c.status === "reserviert");
    await B.abschliessen({ id, day, reserved: call.reserved }, { model: "gpt-5-mini", promptTokens: 100,
      completionTokens: 20, _ablage: { blob: true } }, deps);
    console.log(JSON.stringify({ abgerechnet: true })); return;
  }
  let allowed = 0, blocked = 0;
  for (let i = 0; i < 8; i++) {
    try {
      await B.reserviere({ model: "gpt-5-mini", maxOutputTokens: 3000, runId: "nachlauf500-123456789" }, deps);
      allowed++;
    } catch (e) {
      assert(["test-usd-grenze-erreicht", "test-usd-ausgang-unklar"].includes(e.reason), e.reason);
      blocked++;
    }
  }
  console.log(JSON.stringify({ allowed, blocked }));
}
function start({ base, token, mode = "reserve" }) {
  const env = { ...process.env, HELMUT_STORAGE_BACKEND: "local",
    HELMUT_TEST_AUTH_CAS_URL: base, HELMUT_TEST_AUTH_CAS_KEY: token };
  for (const key of require("../lokaler-netzschutz").PRODUCTION_KENNUNGEN) delete env[key];
  delete env.HELMUT_V3_STORE;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, "../lokal.js"), __filename, mode],
      { env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", c => { output += c; });
    child.stderr.resume(); child.once("error", reject);
    child.once("exit", code => {
      if (code !== 0) reject(Error("Kosten Testprozess meldet Exit " + code));
      else { try { resolve(JSON.parse(output.trim().split("\n").at(-1))); } catch { reject(Error("Kosten Testquittung fehlt")); } }
    });
  });
}
async function pruefeKosten({ psql, base, token }) {
  assert.equal(new URL(base).hostname, "127.0.0.1");
  psql("create table public.llm_budget_counters(day text, scope text, used integer); grant select on public.llm_budget_counters to service_role;");
  psql(`insert into public.helmut_store values ('test-auth-kosten', '{"users":[{"id":"bestand"}],"llmUsage":[]}'::jsonb); notify pgrst, 'reload schema';`);
  let ready = false;
  const until = Date.now() + 10000;
  while (Date.now() < until) {
    const res = await fetch(base + "/rest/v1/llm_budget_counters?select=used", {
      headers: { apikey: token, Authorization: "Bearer " + token }, signal: AbortSignal.timeout(1000) });
    await res.text(); if (res.ok) { ready = true; break; }
    await new Promise(r => setTimeout(r, 100));
  }
  assert(ready, "Lokaler Kostenzaehler muss durch echtes PostgREST lesbar sein");
  async function five() {
    const runs = await Promise.allSettled(Array.from({ length: 5 }, () => start({ base, token })));
    const bad = runs.find(r => r.status === "rejected"); if (bad) throw bad.reason;
    return runs.map(r => r.value);
  }
  const results = await five();
  assert.equal(results.reduce((n, r) => n + r.allowed, 0), 18);
  const read = () => JSON.parse(psql("select data from public.helmut_store where id='test-auth-kosten'"));
  let auth = read(), t = B.pruefeTag(auth[B.KEY]["2026-09-09"], "2026-09-09");
  assert.equal(B.belegt(t), 3816000); assert.equal(t.manualCalls, 18);
  assert.deepEqual(auth.users, [{ id: "bestand" }]);
  console.log("PASS  Fuenf getrennte Prozesse: 18 von 40 Geldreservierungen, gemeinsam 3,816 USD unter 4 USD");
  await start({ base, token, mode: "freeze" });
  const restarted = await five();
  assert.equal(restarted.reduce((n, r) => n + r.allowed, 0), 0);
  auth = read(); t = B.pruefeTag(auth[B.KEY]["2026-09-09"], "2026-09-09");
  assert.equal(B.belegt(t), 3816000); assert.equal(t.manualCalls, 18); assert.equal(t.frozen, null);
  assert.equal(Object.values(t.calls).filter(c => c.status === "ungeklaert").length, 1);
  console.log("PASS  Unklarer Ausgang bleibt nach fuenf Prozessneustarts voll reserviert, Geldgrenze unveraendert");
  await start({ base, token, mode: "settle" });
  const continued = await five();
  assert.equal(continued.reduce((n, r) => n + r.allowed, 0), 1);
  auth = read(); t = B.pruefeTag(auth[B.KEY]["2026-09-09"], "2026-09-09");
  assert.equal(B.belegt(t), 3816130); assert.equal(t.manualCalls, 19);
  assert.equal(Object.values(t.calls).filter(c => c.status === "ungeklaert").length, 1);
  assert.deepEqual(auth.users, [{ id: "bestand" }]);
  console.log("PASS  Fuenf Neustarts nutzen nur belegbar freien Rest, ungeklaerte Reserve bleibt unangetastet");
}
module.exports = { pruefeKosten };
if (require.main === module) worker().catch(() => { console.error("FAIL Kosten Datenbank Worker"); process.exitCode = 1; });
