"use strict";

// Echter HTTP Handler, synthetisch gestoerte Kontenablage. Keine Production Daten.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const vm = require("node:vm");
process.env.HELMUT_AUTH_MODE = "accounts";
process.env.HELMUT_STORAGE_BACKEND = "local";
delete process.env.PILOT_SECRET;
const accounts = require("../lib/helmut/accounts");
const storage = require("../lib/helmut/storage");
let seedCalls = 0, sessionCalls = 0, profileCalls = 0;
let sessionMode = "broken";
let seedHandler = async () => { throw new Error("synthetischer Datenbankausfall"); };
accounts.ensureAdminSeed = async () => { seedCalls++; return seedHandler(); };
accounts.resolveSession = async () => {
  sessionCalls++;
  if (sessionMode === "broken") throw new Error("synthetischer Datenbankausfall");
  return null;
};
storage.listFullProfiles = storage.listProfiles = async () => { profileCalls++; return []; };
const handler = require("../server");
let passed = 0, failed = 0;
const quiet = console.error;
console.error = () => {};
const server = http.createServer(handler);
function request(path, { cookie = "", timeout = 1500 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port: server.address().port, path,
      headers: cookie ? { Cookie: cookie } : {}, timeout }, (res) => {
      let body = ""; res.on("data", chunk => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("timeout", () => req.destroy(new Error("HTTP Antwort bleibt aus")));
    req.on("error", reject);
  });
}
async function check(name, run) {
  seedCalls = sessionCalls = profileCalls = 0;
  try { await run(); passed++; console.log(`PASS  ${name}`); }
  catch (error) { failed++; console.log(`FAIL  ${name}: ${error.message}`); }
}
function noDatabaseWork() {
  assert.deepEqual({ seedCalls, sessionCalls, profileCalls }, { seedCalls: 0, sessionCalls: 0, profileCalls: 0 });
}

(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    for (const path of ["/", "/api/index", "/api/index.js", "/client.js", "/styles.css", "/sw.js", "/site.webmanifest"]) {
      await check(`${path}: Startdatei ohne Konten oder Mandatsabruf`, async () => {
        const res = await request(path, { cookie: "helmut_session=synthetisch" });
        assert.equal(res.status, 200); noDatabaseWork();
      });
    }
    await check("Haengende Adminvorbereitung kann die Startseite nicht halten", async () => {
      let release;
      seedHandler = () => new Promise(resolve => { release = resolve; });
      try { assert.equal((await request("/", { timeout: 250 })).status, 200); noDatabaseWork(); }
      finally { if (release) release(); await new Promise(resolve => setImmediate(resolve)); seedHandler = async () => { throw new Error("synthetischer Ausfall"); }; }
    });
    await check("Fehlendes Cookie ist sofort ein belegter anonymer Zustand", async () => {
      const res = await request("/api/auth/session");
      assert.equal(res.status, 200); assert.deepEqual(JSON.parse(res.body), { authenticated: false }); noDatabaseWork();
    });
    for (const path of ["/api/auth/session", "/api/app/start"]) {
      await check(`${path}: Kontenausfall ergibt 503 und loescht kein Cookie`, async () => {
        const res = await request(path, { cookie: "helmut_session=synthetisch" });
        assert.equal(res.status, 503); assert.equal(JSON.parse(res.body).reason, "auth-unavailable");
        assert.equal(res.headers["set-cookie"], undefined); assert.equal(seedCalls, 0); assert.equal(profileCalls, 0);
        assert.ok(!res.body.includes("synthetischer") && !res.body.includes("authenticated"));
      });
    }
    sessionMode = "invalid";
    await check("Tatsaechlich ungueltige Session bleibt abgemeldet", async () => {
      const res = await request("/api/auth/session", { cookie: "helmut_session=synthetisch" });
      assert.equal(res.status, 200); assert.equal(JSON.parse(res.body).authenticated, false); assert.equal(seedCalls, 0);
    });
    for (const path of ["/server.js", "/.env", "/lib/helmut/storage.js", "/api/admin/overview"]) {
      await check(`${path}: oeffentliche Startausnahme gibt keine internen Daten frei`, async () => {
        const res = await request(path);
        assert.ok([401, 404].includes(res.status)); assert.ok(!res.body.includes("module.exports")); noDatabaseWork();
      });
    }
    delete process.env.HELMUT_AUTH_MODE;
    process.env.PILOT_SECRET = "rein-lokaler-zugang";
    await check("Legacy Pilotzugang bleibt fuer die Startseite erforderlich", async () => {
      const res = await request("/"); assert.equal(res.status, 200); assert.ok(res.body.includes("/api/pilot/unlock")); noDatabaseWork();
    });
    await check("Legacy API bleibt ohne Zugang gesperrt", async () => {
      assert.equal((await request("/api/app/start")).status, 401); noDatabaseWork();
    });

    const source = fs.readFileSync(require.resolve("../client.js"), "utf8");
    const start = source.indexOf("async function fetchAuthState()");
    const end = source.indexOf("\n// Waehlt", start);
    assert.ok(start >= 0 && end > start);
    const authState = fetchWithTimeout => vm.runInNewContext(`${source.slice(start, end)}; fetchAuthState()`, {
      fetchWithTimeout, AbortController, window: { setTimeout: fn => setTimeout(fn, 30), clearTimeout }
    });
    for (const [name, fetcher] of [
      ["HTTP 503", async () => new Response("{}", { status: 503 })],
      ["Netzwerkabbruch", async () => { throw new Error("offline"); }],
      ["ungueltigem JSON", async () => new Response("kaputt", { headers: { "content-type": "application/json" } })],
      ["ungueltiger Antwortform", async () => Response.json({ error: "kaputt" })]
    ]) await check(`Client wechselt bei ${name} nicht in den Pilotmodus`, async () => {
      await assert.rejects(authState(fetcher), error => error.code === "AUTH_UNAVAILABLE");
    });
    await check("Client erkennt eine gueltige anonyme Antwort", async () => {
      const value = await authState(async () => Response.json({ authenticated: false })); assert.equal(value.authenticated, false);
    });
    await check("Client behaelt nicht vorhandene Legacy Sessionroute bei", async () => {
      assert.equal(await authState(async () => new Response("nicht vorhanden", { status: 404 })), null);
    });
    await check("Client bricht auch einen haengenden Antwortinhalt ab", async () => {
      let signal;
      const task = authState(async (_url, options) => {
        signal = options.signal;
        return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }),
          json: () => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("abgebrochen")))) };
      });
      let guard;
      try {
        await assert.rejects(Promise.race([task, new Promise((_resolve, reject) => { guard = setTimeout(() => reject(new Error("Testfrist abgelaufen")), 300); })]), error => error.code === "AUTH_UNAVAILABLE");
        assert.equal(signal.aborted, true);
      } finally { clearTimeout(guard); }
    });
    await check("Adminvorbereitung kann nach einem Lesefehler spaeter erneut pruefen", async () => {
      const modulePath = require.resolve("../lib/helmut/accounts");
      const cached = require.cache[modulePath]; const oldRead = storage.readAuthStore;
      const oldEmail = process.env.HELMUT_ADMIN_EMAIL; const oldPassword = process.env.HELMUT_ADMIN_PASSWORD;
      let reads = 0;
      try {
        process.env.HELMUT_ADMIN_EMAIL = "admin@lokaler-test.invalid";
        process.env.HELMUT_ADMIN_PASSWORD = "synthetisches-passwort";
        storage.readAuthStore = async () => { if (++reads === 1) throw new Error("synthetischer Ausfall"); return { users: [{ role: "admin" }] }; };
        delete require.cache[modulePath]; const realAccounts = require(modulePath);
        const attempts = await Promise.allSettled([realAccounts.ensureAdminSeed(), realAccounts.ensureAdminSeed()]);
        assert.ok(attempts.every(result => result.status === "rejected")); assert.equal(reads, 1);
        assert.equal((await realAccounts.ensureAdminSeed()).reason, "admin-exists");
        await realAccounts.ensureAdminSeed(); assert.equal(reads, 2);
      } finally {
        storage.readAuthStore = oldRead; require.cache[modulePath] = cached;
        if (oldEmail === undefined) delete process.env.HELMUT_ADMIN_EMAIL; else process.env.HELMUT_ADMIN_EMAIL = oldEmail;
        if (oldPassword === undefined) delete process.env.HELMUT_ADMIN_PASSWORD; else process.env.HELMUT_ADMIN_PASSWORD = oldPassword;
      }
    });
  } finally {
    console.error = quiet; server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
  console.log(`${passed} PASS, ${failed} FAIL`); if (failed) process.exitCode = 1;
})().catch(error => { console.error = quiet; console.error(error); process.exitCode = 1; });
