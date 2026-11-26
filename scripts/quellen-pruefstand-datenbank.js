"use strict";

const assert = require("node:assert/strict");
const { createHmac, randomBytes } = require("node:crypto");
const { execFileSync, spawn } = require("node:child_process");
const { once } = require("node:events");
const { readFileSync } = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { setTimeout: warte } = require("node:timers/promises");
const { starteDatenbankTor } = require("./fixtures/z3-plattform");

const SUPABASE = path.join(__dirname, "../supabase");
const MIGRATIONEN = Object.freeze([
  "20260712_mandate_profile_fields.sql",
  "20260712_mandate_profile_completeness.sql",
  "20260712_tenant_rls_policies.sql",
  "20260713_source_architecture.sql",
  "20260714_ko_classification.sql",
  "20260715_dedup_findings.sql",
  "20260716_gate_shadow_telemetry.sql",
  "20260716_llm_usage_source_attribution.sql",
  "20260717_llm_budget_reservation.sql",
  "20260718_source_crawl_telemetry.sql",
  "20260719_pipeline_lock_atomic.sql",
  "20260720_crawl_runs_relational.sql",
  "20260727_process_runs_relational.sql",
  "20260728_matching_audit.sql",
  "20260808_scalable_job_queue.sql",
  "20260808_jobqueue_abhaengigkeiten.sql",
  "20260808_jobqueue_bereinigung.sql",
  "20260808_llm_budget_fairness.sql",
  "20260809_jobqueue_narrativ.sql",
  "20260809_jobqueue_wiedervorlage.sql",
  "20260812_jobqueue_altersmessung.sql",
  "20260813090000_jobqueue_outbox.sql",
  "20260813090100_verteilte_grenzen.sql",
  "20260814090000_queue_verbraucher.sql",
  "20260814090100_anbieter_steuerung.sql",
  "20260814180000_verstehen_cas.sql",
  "20260825101500_jobqueue_ankunftskennzahl.sql",
  "20260826190000_jobqueue_vorbedingung_mandatsfilter.sql",
  "20260829123132_z22_mandatsfilter_zeilenkennung_korrigieren.sql",
  "20260902121500_llm_usage_relational.sql",
  "20261109173143_raw_document_cas.sql",
  "20261112130226_auth_store_cas_patch_v1.sql",
  "20261113165614_frische_tagesarbeit.sql",
  "20261119091317_quellenfaelligkeit_claim.sql",
  "20261123110000_quellen_dlq.sql",
  "20261126005158_morgenpflicht_artikelprioritaet.sql"
]);
const PROFILE_FLAGS = {
  HELMUT_V3_STORE: "1",
  HELMUT_PROFILE_DB_MODE: "1",
  HELMUT_PROFILE_DB_EXCLUSIVE: "1"
};

function pruefeIsolation() {
  assert.equal(process.env.HELMUT_LOKALER_SCHUTZ, "aktiv", "Nur über scripts/lokal.js starten");
  const schnittstellen = readFileSync("/proc/net/dev", "utf8").split("\n")
    .flatMap(zeile => /^\s*([^ :]+):/.exec(zeile)?.[1] || []);
  assert.deepEqual(schnittstellen, ["lo"], "Die Datenbankprobe benötigt einen eigenen Netzwerk-Namespace mit Loopback");
  const restZugang = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_SECRET_KEY"];
  assert(restZugang.every(name => !process.env[name]), "Vor der lokalen Bindung sind keine REST-Zugangsdaten zulässig");
}

async function freierPort(host) {
  const reservierung = net.createServer();
  reservierung.listen(0, host);
  await once(reservierung, "listening");
  const port = reservierung.address().port;
  await new Promise((resolve, reject) => reservierung.close(error => error ? reject(error) : resolve()));
  return port;
}

function rolleToken(secret, role, laufzeitS = 3600) {
  const claims = { role, exp: Math.floor((performance.timeOrigin + performance.now()) / 1000) + laufzeitS };
  const text = [{ alg: "HS256", typ: "JWT" }, claims].map(objekt => Buffer.from(JSON.stringify(objekt)).toString("base64url")).join(".");
  return `${text}.${createHmac("sha256", secret).update(text).digest("base64url")}`;
}

async function warteAufRest({ api, url, token }) {
  let startfehler;
  api.on("error", error => { startfehler = error.code; });
  const deadline = performance.now() + 15000;
  while (performance.now() < deadline && api.exitCode === null && !startfehler) {
    try {
      const antwort = await fetch(`${url}/helmut_store?select=id&id=eq.main`, {
        headers: { Authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(500)
      });
      if (antwort.ok && (await antwort.json())?.[0]?.id === "main") return;
      await antwort.body?.cancel().catch(() => {});
    } catch { /* PostgREST lädt beim Start den Schema-Cache. */ }
    await warte(100);
  }
  throw Error(`Isoliertes PostgREST nicht bereit (${startfehler || api.exitCode || "Zeitgrenze"})`);
}

async function starteQuellenDatenbank({ begrenzterPool = false, monatslauf = false } = {}) {
  pruefeIsolation();
  const env = process.env;
  const host = env.HELMUT_TEST_PG_HOST, port = env.HELMUT_TEST_PG_PORT, user = env.HELMUT_TEST_PG_USER;
  const binary = env.HELMUT_TEST_POSTGREST_BIN;
  assert.equal(host, "127.0.0.1");
  assert.match(port || "", /^\d{1,5}$/);
  assert(Number(port) >= 1 && Number(port) <= 65535);
  assert.match(user || "", /^[a-z_][a-z0-9_]*$/);
  assert(binary && path.isAbsolute(binary), "Absoluter Pfad zum gepinnten PostgREST erforderlich");

  const werkzeugEnv = { PATH: env.PATH, LANG: "C.UTF-8", TZ: "UTC" };
  const postgrestVersion = execFileSync(binary, ["--version"], { env: werkzeugEnv, timeout: 5000, encoding: "utf8" }).trim();
  assert.match(postgrestVersion, /\b12\.2\.3\b/);
  const kennung = randomBytes(6).toString("hex");
  const db = `helmut_quellenprobe_${kennung}`;
  const restRolle = `helmut_quellenapi_${kennung}`;
  const restPasswort = randomBytes(24).toString("hex");
  const psqlArgs = datenbank => ["-X", "-q", "-w", "-h", host, "-p", port, "-U", user,
    "-d", datenbank, "-tA", "-v", "ON_ERROR_STOP=1"];
  const psqlEnv = { ...werkzeugEnv, PGCONNECT_TIMEOUT: "3", ...(env.PGPASSWORD ? { PGPASSWORD: env.PGPASSWORD } : {}) };
  const psql = (input, datenbank = db) => execFileSync("psql", psqlArgs(datenbank), {
    input, env: psqlEnv,
    encoding: "utf8", timeout: 25000, stdio: ["pipe", "pipe", "pipe"]
  }).trim();
  const postgresVersion = psql("show server_version;", "postgres");
  assert.match(postgresVersion, /^17\.6\b/);

  let api, gateway, datenbankErstellt = false, rolleErstellt = false;
  const beweisFlags = { ...PROFILE_FLAGS, HELMUT_STORAGE_BACKEND: "supabase", HELMUT_SUPABASE_STORE_ID: "main",
    HELMUT_SUPABASE_AUTH_STORE_ID: "main-auth", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" };
  const vorwerte = Object.fromEntries(Object.keys(beweisFlags).map(k => [k, env[k]]));
  async function stoppe() {
    for (const [name, wert] of Object.entries(vorwerte)) {
      if (wert === undefined) delete env[name];
      else env[name] = wert;
    }
    if (gateway) { await gateway.stoppe(); gateway = null; }
    if (api?.pid && api.exitCode === null && api.signalCode === null) {
      const ausgang = once(api, "exit");
      api.kill("SIGTERM");
      await ausgang;
    }
    if (datenbankErstellt) { psql(`drop database ${db} with (force);`, "postgres"); datenbankErstellt = false; }
    if (rolleErstellt) { psql(`drop role ${restRolle};`, "postgres"); rolleErstellt = false; }
  }

  try {
    psql(`create database ${db};`, "postgres");
    datenbankErstellt = true;
    psql(`do $$ begin
      if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    create role ${restRolle} login noinherit password '${restPasswort}';
    grant anon, authenticated, service_role to ${restRolle};`);
    rolleErstellt = true;
    // Supabase gibt neu angelegten öffentlichen Funktionen die Dienstrollenrechte.
    // Das gilt auch für DROP/CREATE von helmut_job_metrics in der Altersmigration.
    psql(`grant usage on schema public to service_role;
      alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
      alter default privileges in schema public grant usage, select on sequences to service_role;
      alter default privileges in schema public grant execute on functions to service_role;
      create schema auth;
      grant usage on schema auth to authenticated, service_role;
      create function auth.jwt() returns jsonb language sql stable as $jwt$
        select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
      $jwt$;`);

    psql(readFileSync(path.join(SUPABASE, "schema.sql"), "utf8"));
    for (const name of MIGRATIONEN) {
      try { psql(readFileSync(path.join(SUPABASE, "migrations", name), "utf8")); }
      catch (error) { throw Error(`Migration im Prüfstand fehlgeschlagen (${name}): ${String(error.stderr || "").split("\n").find(zeile => zeile.startsWith("ERROR:")) || error.code}`); }
    }
    psql(`insert into public.helmut_store(id,data) values ('main-auth','{"users":[],"sessions":[]}');`);

    const claimSignatur = "public.helmut_claim_quellenfaelligkeit(text,bigint,boolean)";
    const claimMd5 = psql(`select md5(prosrc) from pg_proc where oid = '${claimSignatur}'::regprocedure;`);
    assert.equal(claimMd5, "6a88011286ac4a1beae5ac5fc10f0e8d", "Quellenclaim weicht vom dokumentierten Stand des 19.11. ab");
    const apiPort = await freierPort(host), secret = randomBytes(32).toString("hex");
    // Das lokal signierte Monats-Token muss die echte Laufzeit überstehen.
    // Rollen, Signaturprüfung und der tägliche Produktionsvertrag ändern sich nicht.
    const token = rolleToken(secret, "service_role", monatslauf ? 7200 : 3600);
    api = spawn(binary, [], { env: { ...werkzeugEnv, PGRST_DB_URI: `postgresql://${restRolle}:${restPasswort}@${host}:${port}/${db}`,
      PGRST_DB_SCHEMAS: "public", PGRST_DB_ANON_ROLE: "anon", PGRST_JWT_SECRET: secret,
      PGRST_SERVER_HOST: host, PGRST_SERVER_PORT: String(apiPort), PGRST_LOG_LEVEL: "crit",
      ...(begrenzterPool ? { PGRST_DB_POOL: "1", PGRST_DB_POOL_ACQUISITION_TIMEOUT: "1" } : {}) }, stdio: "ignore" });
    await warteAufRest({ api, url: `http://${host}:${apiPort}`, token });
    gateway = await starteDatenbankTor({ postgrestPort: apiPort });
    Object.assign(env, beweisFlags, { SUPABASE_URL: gateway.url, SUPABASE_SERVICE_ROLE_KEY: token });
    const storage = require("../lib/helmut/storage");
    for (const [rolle, status] of [["anon", 401], ["authenticated", 403]]) {
      await assert.rejects(storage.supabaseRequest("/rest/v1/rpc/helmut_claim_quellenfaelligkeit", { method: "POST",
        headers: { Authorization: rolle === "anon" ? "" : `Bearer ${rolleToken(secret, rolle)}` },
        body: JSON.stringify({ p_owner: `pruefstand-${rolle}`, p_lease_ms: 1000, p_alt_vorrang: false }) }),
      new RegExp(`Supabase storage failed \\(${status}\\)`));
    }
    assert.deepEqual(await storage.jobQueueTageskernBereit(), { verfuegbar: true });

    async function seed({ profile, catalog, legacySources = [] }) {
      if (profile) {
        assert.match(profile.id || "", /^(?:synthetik|testmandat)-[a-z0-9-]+$/);
        await storage.saveProfile(profile);
        assert.equal((await storage.listFullProfiles()).length, 1);
      }
      if (legacySources.length) {
        psql(`update public.helmut_store set data = jsonb_set(data, '{sources}', $quellen$${JSON.stringify(legacySources).replaceAll("$", "\\u0024")}$quellen$::jsonb, true) where id = 'main';`);
      }
      const tabellen = { geographies: "geographies", publishers: "publishers", retrievalPaths: "retrieval_paths",
        packages: "source_packages", packagePaths: "package_paths" };
      for (const [name, tabelle] of Object.entries(tabellen)) {
        const gruppen = new Map();
        for (const zeile of catalog?.[name] || []) {
          const felder = Object.keys(zeile).sort().join(",");
          if (!gruppen.has(felder)) gruppen.set(felder, []);
          gruppen.get(felder).push(zeile);
        }
        for (const gruppe of gruppen.values()) await storage.supabaseRequest(`/rest/v1/${tabelle}`, { method: "POST",
          headers: { Prefer: "return=minimal, missing=default" }, body: JSON.stringify(gruppe) });
      }
      return { catalog: await storage.listSourceArchitectureRows(), profiles: await storage.listFullProfiles() };
    }

    async function pruefeEngpass() {
      assert(begrenzterPool, "Datenbank-Engpass benötigt den Prüfpool mit einer Verbindung");
      // Eine separate SQL-Sitzung hält die Anbieterreservierung in PostgREST an.
      // Die REST-Anfrage selbst führt den unveränderten Produktions-RPC aus.
      const sperre = spawn("psql", psqlArgs(db), { env: psqlEnv, stdio: ["pipe", "ignore", "ignore"] });
      const sperreEnde = once(sperre, "exit");
      sperre.stdin.on("error", () => {});
      sperre.stdin.write("begin; lock table public.helmut_anbieter_fenster in access exclusive mode;\n");
      let ersteReservierung;
      async function warteAufSql(abfrage) {
        const deadline = performance.now() + 1400;
        while (performance.now() < deadline) {
          if (psql(abfrage) === "t") return;
          await warte(25);
        }
        throw Error("Datenbank-Engpass: Sperre nicht rechtzeitig bestätigt");
      }
      const reserviere = schluessel => storage.anbieterReserviere({ schluessel, grenzeTag: 10 });
      const ersterSchluessel = "pruefstand-engpass-blockiert", zweiterSchluessel = "pruefstand-engpass-wartet";
      try {
        await warteAufSql(`select exists(select from pg_locks where relation='public.helmut_anbieter_fenster'::regclass
          and mode='AccessExclusiveLock' and granted);`);
        ersteReservierung = reserviere(ersterSchluessel);
        await warteAufSql(`select exists(select from pg_stat_activity where datname=current_database()
          and usename='${restRolle}' and wait_event_type='Lock');`);
        const abgewiesen = await reserviere(zweiterSchluessel);
        assert.equal(abgewiesen.verfuegbar, false);
        assert.match(abgewiesen.grund, /\bPGRST003\b/);
        sperre.stdin.end("rollback;\n");
        const [code] = await sperreEnde;
        assert.equal(code, 0);
        assert.equal((await ersteReservierung).erlaubt, true);
        assert.equal(psql(`select count(*) from public.helmut_anbieter_fenster where schluessel='${zweiterSchluessel}';`), "0");
        assert.equal((await reserviere(zweiterSchluessel)).erlaubt, true);
        assert.equal(psql(`select verbraucht from public.helmut_anbieter_fenster where schluessel='${zweiterSchluessel}';`), "1");
        return { poolVerbindungen: 1, wartefristSekunden: 1, fehler: "PGRST003", spaetereReservierung: 1 };
      } finally {
        if (sperre.pid && sperre.exitCode === null && sperre.signalCode === null) sperre.kill("SIGTERM");
        await sperreEnde;
        await ersteReservierung;
      }
    }

    function stand() {
      return JSON.parse(psql(`select jsonb_build_object(
        'maxConnections', current_setting('max_connections')::integer,
        'superuserReservedConnections', current_setting('superuser_reserved_connections')::integer,
        'reservedConnections', current_setting('reserved_connections')::integer,
        'dbBytes', pg_database_size(current_database()),
        'indizes', (select jsonb_build_object('gueltig', count(*) filter (where i.indisvalid),
          'ungueltig', count(*) filter (where not i.indisvalid))
          from pg_index i join pg_class c on c.oid = i.indrelid where c.relnamespace = 'public'::regnamespace),
        'rls', (select jsonb_object_agg(c.relname, jsonb_build_object('aktiv', c.relrowsecurity, 'force', c.relforcerowsecurity))
          from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
            and c.relname in ('helmut_store', 'profiles', 'mandate_profiles', 'publishers', 'retrieval_paths',
              'source_packages', 'package_paths', 'raw_documents', 'document_findings', 'knowledge_objects', 'briefings',
              'helmut_jobs', 'process_runs', 'helmut_anbieter_fenster', 'helmut_anbieter_schutzschalter'))
      );`));
    }

    return { psql, storage, seed, stoppe, stand, pruefeEngpass, restBericht: gateway.bericht, konfiguration: {
      postgresVersion, postgrestVersion, migrationen: MIGRATIONEN, basis: "supabase/schema.sql",
      pgvectorVersion: psql("select extversion from pg_extension where extname = 'vector';"), claimMd5,
      begrenzterPool, start: stand(),
      abweichungen: ["Lokaler REST-Proxy, Production-PostgREST-Version und Poolkonfiguration nicht bestätigt",
        "Verwalteter Supabase-Auth, Supabase-Pg-Cron und übrige fachfremde Migrationen fehlen im Prüfcluster"]
    } };
  } catch (error) {
    await stoppe();
    throw error;
  }
}

module.exports = { starteQuellenDatenbank };
