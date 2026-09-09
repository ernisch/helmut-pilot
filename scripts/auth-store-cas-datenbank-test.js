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

function startRegistrationWorker({ base, token, index }) {
  assert.equal(new URL(base).hostname, "127.0.0.1");
  assert.ok(Number.isInteger(index) && index >= 0 && index < 5);
  // NODE_OPTIONS laedt den Netzschutz bereits VOR lokal.js. Deshalb duerfen
  // selbst die generierten lokalen Supabase Testwerte nicht in dessen erster
  // Prozessumgebung liegen. Der Schutz bleibt fuer beide Prozesse aktiv.
  const env = { ...process.env, HELMUT_STORAGE_BACKEND: "local",
    HELMUT_TEST_AUTH_CAS_URL: base, HELMUT_TEST_AUTH_CAS_KEY: token };
  for (const name of require("./lokaler-netzschutz").PRODUCTION_KENNUNGEN) delete env[name];
  delete env.HELMUT_V3_STORE;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, "lokal.js"), __filename, "worker", String(index)], {
      env, stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    let diagnostics = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { diagnostics += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve(output);
      else {
        // Nur die Fehlerklasse nennen. Ein Rohlog kann Testtokens tragen.
        const guard = /LOKAL|NETZ|PRODUCTION/i.test(diagnostics) ? " (lokaler Schutz)" : "";
        reject(new Error(`Registrierungsprozess ${index} meldet Exit ${code}${guard}: ${output.slice(-300)}`));
      }
    });
  });
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

    // Alle Prozesse abschliessen lassen, auch wenn einer einen Fehler meldet.
    // Kein Prozess bleibt als Schreiber zurueck, waehrend die Testdatenbank faellt.
    const runs = await Promise.allSettled(Array.from({ length: 5 }, (_, index) => startRegistrationWorker({ base, token, index })));
    const rejected = runs.find((r) => r.status === "rejected");
    const counts = psql(`select count(*)||'|'||count(distinct u->>'id')||'|'||count(distinct u->>'email')||'|'||count(distinct u->>'politicianId')||'|'||count(*) filter (where u->>'active'='true') from public.helmut_store s cross join lateral jsonb_array_elements(s.data->'users') u where s.id='main-auth'`);
    console.log(`SQL Bestand: Konten|eindeutige IDs|Adressen|Mandatskennungen|aktiv = ${counts}`);
    if (rejected) throw rejected.reason;
    assert.equal(counts, "500|500|500|500|0");
    assert.equal(JSON.parse(psql("select data->'adminSettings' from public.helmut_store where id='main-auth'")).baseline, 2);
    console.log("PASS  500 von 500 Konten nach fuenf unabhaengigen Prozessen vollstaendig und eindeutig gespeichert");
    console.log("PASS  Konten bleiben inaktiv und vorhandene Betriebsdaten bleiben erhalten");
    // Derselbe echte PostgREST Dienst prueft jetzt auch main und p, jeweils mit
    // fuenf frischen Prozessen und einer Barriere nach dem Lesen. Die bestehenden
    // 500 Registrierungen und ihre SQL Bestandspruefungen bleiben unveraendert.
    const { runWriters } = require("./fixtures/store-cas-processes");
    for (const key of ["main", "p-cas-existing", "p-cas-new"]) {
      const id = key === "main" ? "main" : `main-${key}`;
      const existing = key !== "p-cas-new";
      if (existing) psql(`insert into public.helmut_store values ('${id}', '{"userNotes":[{"id":"alt"}]}'::jsonb)`);
      await runWriters({ base, token, key });
      const actual = JSON.parse(psql(`select data->'userNotes' from public.helmut_store where id='${id}'`));
      const expected = [...(existing ? ["alt"] : []), ...Array.from({ length: 5 }, (_, i) => `prozess-${i}`)].sort();
      assert.deepEqual(actual.map((note) => note.id).sort(), expected);
      console.log(`PASS  ${key}: vier veraltete Writes verweigert, nach frischem Lesen alle fuenf Aenderungen vollstaendig`);
    }
    await require("./fixtures/direkt500-datenbank").pruefeDirektausbau({ psql, base, token });
    await require("./fixtures/testkosten-datenbank").pruefeKosten({ psql, base, token });
    console.log(`PostgreSQL ${version}: 13 PASS, 0 FAIL. Kein Production Funktionsnachweis.`);
  } finally {
    if (api && api.pid && api.exitCode == null) {
      const ended = once(api, "exit").catch(() => {});
      api.kill("SIGTERM");
      await ended;
    }
    if (gateway) await gateway.stoppe();
    psql(`drop database ${db} with (force)`, "postgres");
  }
}

module.exports = { startRegistrationWorker };
if (require.main === module) {
  (process.argv[2] === "worker" ? worker() : main()).catch((error) => {
    console.error(`FAIL  ${error.message}`);
    process.exitCode = 1;
  });
}
