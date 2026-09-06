"use strict";

// Pflichtnachweis gegen einen lokalen PostgreSQL Testcluster und echtes PostgREST.
// Eigene zufaellige Datenbank, synthetische Konten, keine Production Kennungen.
// Fuenf getrennte Node Prozesse haben KEINE gemeinsame Registrierungswarteschlange.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const net = require("node:net");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");
const { once } = require("node:events");

async function worker() {
  const base = process.env.HELMUT_TEST_AUTH_CAS_URL;
  assert.equal(new URL(base).hostname, "127.0.0.1");
  process.env.HELMUT_STORAGE_BACKEND = "supabase";
  process.env.SUPABASE_URL = base;
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.HELMUT_TEST_AUTH_CAS_KEY;
  process.env.HELMUT_SUPABASE_AUTH_STORE_ID = "main-auth";
  const accounts = require("../lib/helmut/accounts");
  const offset = Number(process.argv[3]);
  assert.ok(Number.isInteger(offset) && offset >= 0 && offset < 5);
  const results = await Promise.allSettled(Array.from({ length: 100 }, (_, i) => {
    const id = `db-test-${offset}-${i}`;
    return accounts.createUser({ email: `${id}@registrierung.invalid`, name: id,
      politicianId: id, role: "abgeordneter", active: false });
  }));
  const failures = results.filter((r) => r.status === "rejected");
  console.log(JSON.stringify({ requested: 100, successful: 100 - failures.length,
    errors: failures.map((r) => r.reason.code || r.reason.statusCode || "unbekannt") }));
  if (failures.length) process.exitCode = 1;
}

async function main() {
  const host = process.env.HELMUT_TEST_PG_HOST;
  assert.ok(host === "127.0.0.1" || host === "localhost", "HELMUT_TEST_PG_HOST muss auf einen lokalen Testcluster zeigen");
  const port = process.env.HELMUT_TEST_PG_PORT || "5433";
  assert.match(port, /^\d+$/);
  const user = process.env.HELMUT_TEST_PG_USER || "helmut";
  const password = process.env.PGPASSWORD || "helmut";
  const db = `helmut_test_auth_cas_${crypto.randomBytes(6).toString("hex")}`;
  const psql = (sql, database = db) => execFileSync("psql", ["-h", host, "-p", port, "-U", user,
    "-d", database, "-tA", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8", env: { ...process.env, PGPASSWORD: password }, stdio: ["ignore", "pipe", "pipe"]
  }).trim();
  const version = psql("show server_version", "postgres");
  assert.ok(Number(version.split(".")[0]) >= 17, "Nachweis benoetigt PostgreSQL 17 oder neuer");
  psql(`create database ${db}`, "postgres");
  let api;
  let gateway;
  const children = [];
  try {
    psql("do $$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if; end $$;");
    psql("create table public.helmut_store(id text primary key, data jsonb not null); grant usage on schema public to service_role; grant select, insert, update on public.helmut_store to service_role;");
    // Altbestand ohne Revision: gerade dieser erste CAS Schritt muss sicher sein.
    psql(`insert into public.helmut_store values ('main-auth', '{"users":[],"adminSettings":{"baseline":1}}'::jsonb)`);
    const listener = net.createServer();
    listener.listen(0, "127.0.0.1");
    await once(listener, "listening");
    const apiPort = listener.address().port;
    await new Promise((resolve) => listener.close(resolve));
    const secret = crypto.randomBytes(32).toString("hex");
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ role: "service_role", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
    const unsigned = `${header}.${payload}`;
    const token = `${unsigned}.${crypto.createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
    const apiBase = `http://127.0.0.1:${apiPort}`;
    api = spawn(process.env.HELMUT_TEST_POSTGREST_BIN || "/tmp/postgrest", [], {
      env: { ...process.env,
        PGRST_DB_URI: `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${db}`,
        PGRST_DB_SCHEMAS: "public", PGRST_DB_ANON_ROLE: "service_role", PGRST_JWT_SECRET: secret,
        PGRST_SERVER_HOST: "127.0.0.1", PGRST_SERVER_PORT: String(apiPort), PGRST_LOG_LEVEL: "crit"
      }, stdio: ["ignore", "ignore", "ignore"]
    });
    let startupError;
    api.on("error", (error) => { startupError = error.code; });
    let ready = false;
    const until = Date.now() + 15000;
    while (Date.now() < until && !startupError && api.exitCode == null) {
      try {
        const res = await fetch(`${apiBase}/helmut_store?select=id`, { signal: AbortSignal.timeout(1000) });
        await res.text();
        if (res.ok) { ready = true; break; }
      } catch (_) { /* lokale Startphase */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, `PostgREST Testdienst nicht bereit (${startupError || "Start fehlgeschlagen"})`);

    // Die Anwendung spricht den Supabase Praefix, rohes PostgREST kennt ihn nicht.
    // Das bestehende lokale Tor leitet Status und Inhalt unveraendert weiter.
    gateway = await require("./fixtures/z3-plattform").starteDatenbankTor({ postgrestPort: apiPort });
    const base = gateway.url;
    process.env.HELMUT_STORAGE_BACKEND = "supabase";
    process.env.SUPABASE_URL = base;
    process.env.SUPABASE_SERVICE_ROLE_KEY = token;
    process.env.HELMUT_SUPABASE_AUTH_STORE_ID = "main-auth";
    const storage = require("../lib/helmut/storage");
    const first = await storage.readAuthStore();
    const stale = { ...first };
    first.adminSettings = { baseline: 2 };
    await storage.writeAuthStore(first);
    stale.adminSettings = { baseline: 999 };
    await assert.rejects(storage.writeAuthStore(stale), { code: "AUTH_STORE_CONFLICT" });
    assert.equal(JSON.parse(psql("select data->'adminSettings' from public.helmut_store where id='main-auth'")).baseline, 2);
    console.log("PASS  Echter JSONB Vergleich verweigert veraltetes Schreiben auf den Altbestand");

    const runs = Array.from({ length: 5 }, (_, i) => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(__dirname, "lokal.js"), __filename, "worker", String(i)], {
        env: { ...process.env, HELMUT_TEST_AUTH_CAS_URL: base, HELMUT_TEST_AUTH_CAS_KEY: token },
        stdio: ["ignore", "pipe", "pipe"]
      });
      children.push(child);
      let output = "";
      child.stdout.on("data", (chunk) => { output += chunk; });
      child.stderr.resume();
      child.once("error", reject);
      child.once("exit", (code) => {
        if (code === 0) resolve(output);
        else reject(new Error(`Registrierungsprozess ${i} meldet Exit ${code}: ${output.slice(-300)}`));
      });
    }));
    await Promise.all(runs);
    const counts = psql(`select count(*)||'|'||count(distinct u->>'id')||'|'||count(distinct u->>'email')||'|'||count(distinct u->>'politicianId')||'|'||count(*) filter (where u->>'active'='true') from public.helmut_store s cross join lateral jsonb_array_elements(s.data->'users') u where s.id='main-auth'`);
    assert.equal(counts, "500|500|500|500|0");
    assert.equal(JSON.parse(psql("select data->'adminSettings' from public.helmut_store where id='main-auth'")).baseline, 2);
    console.log("PASS  500 von 500 Konten nach fuenf unabhaengigen Prozessen vollstaendig und eindeutig gespeichert");
    console.log("PASS  Konten bleiben inaktiv und vorhandene Betriebsdaten bleiben erhalten");
    console.log(`PostgreSQL ${version}: 3 PASS, 0 FAIL. Kein Production Funktionsnachweis.`);
  } finally {
    for (const child of children) if (child.exitCode == null) child.kill("SIGTERM");
    if (api && api.pid && api.exitCode == null) {
      const ended = once(api, "exit").catch(() => {});
      api.kill("SIGTERM");
      await ended;
    }
    if (gateway) await gateway.stoppe();
    psql(`drop database ${db} with (force)`, "postgres");
  }
}

(process.argv[2] === "worker" ? worker() : main()).catch((error) => {
  console.error(`FAIL  ${error.message}`);
  process.exitCode = 1;
});
