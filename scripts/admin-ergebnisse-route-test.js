"use strict";

// Route GET /api/admin/ergebnisse: Rollen (401/403/200), ehrlicher Zustand ohne V3-Speicher,
// Paging ueber 20 / 500 / 2000 aktive Profile mit Bilanz ueber alle, Mandantentrennung.
// Muster wie admin-neue-routen-test.js: Loopback, lokales Backend, Store-Hermetik, kein Netz, keine KI.
const http = require("http");
const fs = require("fs");
const path = require("path");
const assert = require("assert/strict");
const root = path.join(__dirname, "..");

process.env.HELMUT_AUTH_MODE = "accounts";
process.env.HELMUT_STORAGE_BACKEND = "local";
process.env.HELMUT_STORE_CACHE_MS = "0";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.HELMUT_V3_STORE;

const dataDir = path.join(root, ".helmut-data");
const snapshots = new Map();
if (fs.existsSync(dataDir)) for (const f of fs.readdirSync(dataDir)) snapshots.set(f, fs.readFileSync(path.join(dataDir, f)));
process.on("exit", () => {
  try {
    if (!fs.existsSync(dataDir)) return;
    for (const f of fs.readdirSync(dataDir)) if (!snapshots.has(f)) fs.unlinkSync(path.join(dataDir, f));
    for (const [f, buf] of snapshots) fs.writeFileSync(path.join(dataDir, f), buf);
  } catch (_) { /* best effort */ }
});

const handler = require("../server.js");
const accounts = require("../lib/helmut/accounts");
const S = require("../lib/helmut/admin-ergebnisstand");
const L = require("../lib/helmut/briefing-lauf");

let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log(`PASS  ${name}`); }
function req(port, reqPath, headers = {}, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : JSON.stringify(body);
    const r = http.request({ host: "127.0.0.1", port, method, path: reqPath, timeout: 20000,
      headers: { ...(data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}), ...headers } }, res => {
      let out = ""; res.on("data", c => { out += c; }); res.on("end", () => resolve({ status: res.statusCode, body: out, headers: res.headers }));
    });
    r.on("error", reject); r.on("timeout", () => r.destroy(new Error("timeout")));
    if (data) r.write(data); r.end();
  });
}
async function login(port, email, password) {
  const res = await req(port, "/api/auth/login", {}, "POST", { email, password });
  assert.equal(res.status, 200, res.body.slice(0, 200));
  return String(res.headers["set-cookie"][0]).split(";")[0];
}
// Synthetischer Speicher: je Profil eine Fehlerquittung, sonst nichts. Zaehlt Abfragen.
function fakeStorage() {
  const calls = [];
  return { calls, v3StoreReady: () => true,
    listRenderedBriefingsV3ForTenants: async (ids, slots, tag) => {
      calls.push(ids.length * slots.length);
      return ids.flatMap(id => [{ id: L.laufId(id, tag, L.SLOT_FEHLER), user_id: id, slot: L.SLOT_FEHLER, payload: {} },
        { id: L.laufId("fremd-" + id, tag), user_id: "fremd-" + id, slot: L.SLOT_ERFOLG, payload: {} }]);
    } };
}
const profiles = n => Array.from({ length: n + 3 }, (_, i) => ({ id: `synthetic-${String(i).padStart(4, "0")}`, fullName: `Fiktiv ${i}`, profileActive: i < n }));

(async () => {
  const server = http.createServer(handler);
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    await accounts.createUser({ email: "admin-e@example.org", name: "Admin E", role: "admin", password: "sicher-genug-1" });
    await accounts.createUser({ email: "mdb-e@example.org", name: "MdB E", role: "abgeordneter", password: "sicher-genug-1", politicianId: "test-mandat" });
    const admin = await login(port, "admin-e@example.org", "sicher-genug-1");
    const mdb = await login(port, "mdb-e@example.org", "sicher-genug-1");

    await test("Anonym 401, Abgeordneter 403, Admin 200", async () => {
      assert.equal((await req(port, "/api/admin/ergebnisse")).status, 401);
      assert.equal((await req(port, "/api/admin/ergebnisse", { Cookie: mdb })).status, 403);
      assert.equal((await req(port, "/api/admin/ergebnisse", { Cookie: admin })).status, 200);
    });
    await test("Ohne V3-Speicher ehrlich nicht verfügbar statt lauter „Fehlt“", async () => {
      const body = JSON.parse((await req(port, "/api/admin/ergebnisse?tag=2026-09-19", { Cookie: admin })).body);
      assert.deepEqual(body, { tag: "2026-09-19", verfuegbar: false, grund: "speicher-nicht-verfuegbar" });
    });
    await test("Ungültiger Tag 400", async () => {
      assert.equal((await req(port, "/api/admin/ergebnisse?tag=gestern", { Cookie: admin })).status, 400);
    });
    for (const n of [20, 500, 2000]) await test(`Paging ${n} aktive Profile: Bilanz über alle, Seite begrenzt, Abfragen in Stapeln`, async () => {
      const storage = fakeStorage();
      const r = await S.lade({ profiles: profiles(n), tag: "2026-09-19", seite: 2, storage });
      assert.equal(r.aktiv, n); assert.equal(r.seiten, Math.ceil(n / 20));
      assert.equal(r.seite, Math.min(2, r.seiten)); assert.equal(r.profile.length, 20);
      for (const p of S.POSITIONEN) assert.equal(r.bilanz[p].fehler + r.bilanz[p].fehlt, n, p);
      assert.equal(r.bilanz.zustellung.fehler, n, "fremde Erfolgsquittungen zählen nie");
      assert.equal(r.bilanz.lage.fehlt, n);
      assert.equal(storage.calls.length, Math.ceil(n / 25)); assert.ok(storage.calls.every(c => c <= 100));
      assert.ok(r.profile.every(p => p.ursacheTop === "fehler" && p.aktiv === true));
      const gross = await S.lade({ profiles: profiles(n), tag: "2026-09-19", proSeite: 9999, storage: fakeStorage() });
      assert.equal(gross.profile.length, Math.min(n, 500));
    });
  } finally { server.close(); }
  console.log(`${passed}/6 Routenprüfungen bestanden.`);
})().catch(error => { console.error(error); process.exit(1); });
