"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const net = require("node:net");
const { execFileSync, spawn } = require("node:child_process");
const { once } = require("node:events");
const { starteDatenbankTor } = require("./fixtures/z3-plattform");
const authPatch = require("./fixtures/auth-store-partial-datenbank");
const kontext = require("./fixtures/quellenkontext-datenbank");
const rohbeleg = require("./fixtures/raw-document-cas-datenbank");

async function main() {
  assert.equal(process.env.HELMUT_LOKALER_SCHUTZ, "aktiv");
  const host = process.env.HELMUT_TEST_PG_HOST;
  const port = process.env.HELMUT_TEST_PG_PORT;
  const user = process.env.HELMUT_TEST_PG_USER;
  const password = process.env.PGPASSWORD;
  assert.equal(host, "127.0.0.1");
  assert.match(port || "", /^\d{1,5}$/);
  assert.match(user || "", /^[a-z_][a-z0-9_]*$/);
  assert.ok(password);
  const binary = process.env.HELMUT_TEST_POSTGREST_BIN || "/tmp/postgrest";
  const toolEnv = { PATH: process.env.PATH, LANG: "C.UTF-8" };
  const version = execFileSync(binary, ["--version"], { env: toolEnv, timeout: 5000, encoding: "utf8" });
  assert.match(version, /\b12\.2\.3\b/);
  const db = `helmut_test_auth_quellen_${crypto.randomBytes(6).toString("hex")}`;
  const psql = (sql, name = db) => execFileSync("psql",
    ["-X", "-h", host, "-p", port, "-U", user, "-d", name, "-tA", "-v", "ON_ERROR_STOP=1"], {
      input: sql, encoding: "utf8", timeout: 20000,
      env: { ...toolEnv, PGPASSWORD: password, PGCONNECT_TIMEOUT: "3" },
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
  assert.match(psql("show server_version", "postgres"), /^17\./);
  psql(`create database ${db}`, "postgres");
  let api, gateway;
  try {
    psql(`do $$ begin if not exists (select 1 from pg_roles where rolname='service_role') then
      create role service_role nologin bypassrls; end if; end $$;
      create table public.helmut_store(id text primary key, data jsonb not null);
      grant usage on schema public to service_role;
      grant select, insert, update on public.helmut_store to service_role;
      insert into public.helmut_store values ('main-auth','{"users":[],"adminSettings":{"baseline":1}}');`);
    for (const fixture of [authPatch, kontext, rohbeleg]) fixture.bereiteVor({ psql });

    const listener = net.createServer();
    listener.listen(0, host);
    await once(listener, "listening");
    const apiPort = listener.address().port;
    await new Promise(resolve => listener.close(resolve));
    const secret = crypto.randomBytes(32).toString("hex");
    const unsigned = [{ alg: "HS256", typ: "JWT" }, { role: "service_role", exp: Math.floor(Date.now() / 1000) + 600 }]
      .map(v => Buffer.from(JSON.stringify(v)).toString("base64url")).join(".");
    const token = unsigned + "." + crypto.createHmac("sha256", secret).update(unsigned).digest("base64url");
    api = spawn(binary, [], { env: { ...toolEnv,
      PGRST_DB_URI: `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${db}`,
      PGRST_DB_SCHEMAS: "public", PGRST_DB_ANON_ROLE: "service_role", PGRST_JWT_SECRET: secret,
      PGRST_SERVER_HOST: host, PGRST_SERVER_PORT: String(apiPort), PGRST_LOG_LEVEL: "crit"
    }, stdio: "ignore" });
    let startError;
    api.on("error", error => { startError = error.code; });
    let ready = false;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && !startError && api.exitCode === null) {
      try {
        const res = await fetch(`http://${host}:${apiPort}/helmut_store?select=id`, { signal: AbortSignal.timeout(500) });
        await res.text();
        if (res.ok) { ready = true; break; }
      } catch { /* begrenzte Startphase */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, "PostgREST nicht bereit");
    gateway = await starteDatenbankTor({ postgrestPort: apiPort });
    const base = gateway.url;
    Object.assign(process.env, { HELMUT_STORAGE_BACKEND: "supabase", SUPABASE_URL: base,
      SUPABASE_SERVICE_ROLE_KEY: token, HELMUT_SUPABASE_AUTH_STORE_ID: "main-auth" });
    const storage = require("../lib/helmut/storage");
    const first = await storage.readAuthStore(), stale = { ...first };
    first.adminSettings = { baseline: 2 };
    await storage.writeAuthStore(first);
    stale.adminSettings = { baseline: 999 };
    await assert.rejects(storage.writeAuthStore(stale), { code: "AUTH_STORE_CONFLICT" });
    const projected = await storage.readAuthStore({ fields: ["users", "sessions"] });
    assert.equal(Object.hasOwn(projected, "adminSettings"), false);
    await assert.rejects(storage.writeAuthStore(projected), { code: "AUTH_STORE_READ_ONLY" });
    assert.equal(psql("select data->'adminSettings'->>'baseline' from helmut_store where id='main-auth'"), "2");
    console.log("PASS Auth-Altbestand: CAS und schreibgeschützte Projektion über echtes PostgREST");

    const accounts = require("../lib/helmut/accounts");
    await Promise.all(["eins", "zwei"].map(name => accounts.createUser({ email: `${name}@fixture.invalid`, name,
      politicianId: `synthetisch-${name}`, role: "abgeordneter", active: false })));
    const users = (await storage.readAuthStore({ fields: ["users"] })).users;
    assert.deepEqual(users.map(account => account.politicianId).sort(), ["synthetisch-eins", "synthetisch-zwei"]);
    assert(users.every(account => account.active === false));
    assert.equal(psql("select data->'adminSettings'->>'baseline' from helmut_store where id='main-auth'"), "2");
    console.log("PASS Zwei konkurrierende Konten bleiben eindeutig, inaktiv und ohne Verlust des Altbestands");

    const { runWriters } = require("./fixtures/store-cas-processes");
    for (const key of ["main", "p-cas-existing", "p-cas-new"]) {
      const id = key === "main" ? "main" : `main-${key}`;
      if (key !== "p-cas-new") psql(`insert into helmut_store values ('${id}','{"userNotes":[]}')`);
      await runWriters({ base, token, key });
      const notes = JSON.parse(psql(`select data->'userNotes' from helmut_store where id='${id}'`));
      assert.deepEqual(notes.map(n => n.id).sort(), [0, 1, 2, 3, 4].map(i => `prozess-${i}`));
    }
    console.log("PASS Gleichzeitige Schreiber bewahren fünf Änderungen je gemeinsamer und mandatsgebundener Zeile");
    await authPatch.pruefe({ psql, base, token, secret });
    await kontext.pruefe({ base, token });
    await rohbeleg.pruefe({ psql, base, token });
    await require("./fixtures/quellenplan-cursor-cas-datenbank").pruefe({ psql, base, token });
    await require("./fixtures/testkosten-datenbank").pruefeKosten({ psql, base, token });
  } finally {
    if (gateway) await gateway.stoppe();
    if (api?.pid && api.exitCode === null && api.signalCode === null) {
      const ended = once(api, "exit");
      api.kill("SIGTERM");
      await ended;
    }
    psql(`drop database ${db} with (force)`, "postgres");
  }
}

main().catch(error => {
  // Wie beim bisherigen CAS-Nachweis keine Test-Anmeldedaten, Querys oder Rohantworten ausgeben.
  const { failureDiagnostic } = require("./auth-store-cas-datenbank-test");
  console.error("Kernprüfung PostgreSQL/PostgREST fehlgeschlagen", failureDiagnostic(error, "fixtures"));
  process.exitCode = 1;
});
