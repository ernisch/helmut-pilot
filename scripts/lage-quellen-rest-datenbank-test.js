"use strict";

// Ausschliesslich synthetischer REST Nachweis fuer die zwei Lagequellenleser.
// Vorbild: auth-store-cas-datenbank-test.js; dasselbe unveraenderte Datenbanktor.
// Kein Aufruf der Konten-, Profil-, Modell- oder 500er Tests. Kein CI Start.
// Aufruf und Voraussetzungen: docs/betrieb/500-lage-quellenfenster-2026-09-13.md
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const net = require("node:net");
const { once } = require("node:events");
const { execFileSync, spawn, spawnSync } = require("node:child_process");

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const sqlString = value => "'" + String(value).replace(/'/g, "''") + "'";

async function main() {
  assert.equal(process.env.HELMUT_LOKALER_SCHUTZ, "aktiv", "Nur ueber scripts/lokal.js starten");
  const host = process.env.HELMUT_TEST_PG_HOST;
  const port = process.env.HELMUT_TEST_PG_PORT;
  const user = process.env.HELMUT_TEST_PG_USER || "helmut";
  const binary = process.env.HELMUT_TEST_POSTGREST_BIN || "/tmp/postgrest";
  const missing = [];
  if (host !== "127.0.0.1") missing.push("HELMUT_TEST_PG_HOST muss ausdruecklich 127.0.0.1 sein");
  if (!/^\d+$/.test(port || "") || Number(port) < 1 || Number(port) > 65535)
    missing.push("HELMUT_TEST_PG_PORT muss den isolierten lokalen Cluster benennen");
  for (const [name, command] of [["psql", "psql"], ["PostgREST", binary]]) {
    const result = spawnSync(command, ["--version"], { encoding: "utf8", timeout: 5000 });
    if (result.error || result.status !== 0) missing.push(`${name} nicht verfuegbar (${result.error?.code || result.status})`);
    else if (name === "PostgREST" && !/\b12\.2\.3\b/.test(result.stdout)) missing.push("PostgREST muss wie die bestehende CI Version 12.2.3 verwenden");
    else console.log(`VORAUSSETZUNG ${result.stdout.trim()}`);
  }
  if (missing.length) {
    console.error("BLOCKIERT: " + missing.join("; "));
    console.error("REST_ERGEBNIS: nicht ausgefuehrt; null Integrationsgruppen bestaetigt");
    process.exitCode = 2;
    return;
  }
  assert.match(user, /^[a-z_][a-z0-9_]*$/, "Einfache lokale PostgreSQL Rollenkennung erforderlich");
  const db = `helmut_test_lage_rest_${crypto.randomBytes(8).toString("hex")}`;
  const password = process.env.PGPASSWORD || "helmut";
  // Keine geerbten libpq Service-, Host-, Options- oder Startdateien zulassen.
  const pgEnv = { PATH: process.env.PATH, LANG: "C.UTF-8", PGPASSWORD: password,
    PGCONNECT_TIMEOUT: "3", PGOPTIONS: "-c statement_timeout=10000 -c lock_timeout=3000" };
  const psql = (sql, database = db) => execFileSync("psql", ["-X", "-h", host, "-p", port,
    "-U", user, "-d", database, "-tA", "-v", "ON_ERROR_STOP=1"], {
    input: sql, encoding: "utf8", env: pgEnv, timeout: 15000, maxBuffer: 4 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"]
  }).trim();
  const version = psql("show server_version;", "postgres");
  assert.equal(Number(version.split(".")[0]), 17, "Nachweis benoetigt PostgreSQL 17 wie die CI");
  console.log(`VORAUSSETZUNG PostgreSQL ${version}`);
  let created = false, api, gateway, passed = 0;
  const changed = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "HELMUT_V3_STORE", "HELMUT_BRIEFING_RELEVANZ_TAGE"];
  const original = Object.fromEntries(changed.map(name => [name, process.env[name]]));
  const test = async (name, fn) => { await fn(); passed++; console.log(`PASS ${passed} ${name}`); };
  try {
    psql(`create database ${db};`, "postgres"); created = true;
    // Minimale synthetische Projektion von supabase/schema.sql, keine Migration.
    // Dieselben Textkennungen, timestamptz, FK und zusammengesetzten Schluessel.
    // Keine neue Rolle und kein Konto; der vorhandene lokale DB Eigentuemer liest.
    psql(`create table public.knowledge_objects(id text primary key);
      create table public.raw_documents(id text primary key, title text, url text,
        canonical_url text, published_at timestamptz, summary text, source_name text,
        source_type text, document_type text, link_type text, confidence text);
      create table public.ko_document_links(
        knowledge_object_id text not null references public.knowledge_objects(id) on delete cascade,
        raw_document_id text not null references public.raw_documents(id) on delete cascade,
        primary key(knowledge_object_id,raw_document_id));
      alter table public.knowledge_objects enable row level security;
      alter table public.raw_documents enable row level security;
      alter table public.ko_document_links enable row level security;`);
    const listener = net.createServer(); listener.listen(0, "127.0.0.1");
    await once(listener, "listening");
    const apiPort = listener.address().port;
    await new Promise(resolve => listener.close(resolve));
    const secret = crypto.randomBytes(32).toString("hex");
    const unsigned = [ { alg: "HS256", typ: "JWT" },
      { role: user, exp: Math.floor(Date.now() / 1000) + 600 } ]
      .map(v => Buffer.from(JSON.stringify(v)).toString("base64url")).join(".");
    const token = unsigned + "." + crypto.createHmac("sha256", secret).update(unsigned).digest("base64url");
    api = spawn(binary, [], { env: { PATH: process.env.PATH,
      PGRST_DB_URI: `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${port}/${db}`,
      PGRST_DB_SCHEMAS: "public", PGRST_DB_ANON_ROLE: user, PGRST_JWT_SECRET: secret,
      PGRST_SERVER_HOST: "127.0.0.1", PGRST_SERVER_PORT: String(apiPort),
      PGRST_DB_MAX_ROWS: "1000", PGRST_DB_POOL: "1", PGRST_LOG_LEVEL: "crit"
    }, stdio: ["ignore", "ignore", "ignore"] });
    let startupError = null;
    api.on("error", error => { startupError = error.code; });
    let ready = false;
    const until = Date.now() + 15000;
    while (Date.now() < until && !startupError && api.exitCode === null) {
      try {
        const response = await fetch(`http://127.0.0.1:${apiPort}/ko_document_links?limit=0`,
          { signal: AbortSignal.timeout(500), redirect: "error" });
        await response.text();
        if (response.ok) { ready = true; break; }
      } catch (_) { /* Nur begrenzte lokale Startphase. */ }
      await pause(100);
    }
    assert.ok(ready, `PostgREST nicht bereit (${startupError || "Startfrist"})`);
    gateway = await require("./fixtures/z3-plattform").starteDatenbankTor({ postgrestPort: apiPort });
    process.env.SUPABASE_URL = gateway.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = token;
    process.env.HELMUT_V3_STORE = "1";
    process.env.HELMUT_BRIEFING_RELEVANZ_TAGE = "14";
    // Echte Module und echter Transport: keine Funktionskopie, kein VM, kein Mock.
    const storage = require("../lib/helmut/storage");
    const now = new Date("2026-09-13T09:00:00.000Z");
    const reset = () => psql("truncate public.ko_document_links,public.raw_documents,public.knowledge_objects;");
    const seed = (ko, id, date = "2026-09-13T08:00:00Z") => psql(`
      insert into public.knowledge_objects values (${sqlString(ko)}) on conflict do nothing;
      insert into public.raw_documents(id,title,url,canonical_url,published_at,summary)
      values (${sqlString(id)},${sqlString('Synthetische Quelle ' + id)},
        ${sqlString('https://example.invalid/' + encodeURIComponent(id))},null,
        ${date === null ? "null" : sqlString(date)},'Synthetischer Auszug ohne Originalabruf');
      insert into public.ko_document_links values (${sqlString(ko)},${sqlString(id)});`);
    const meta = ids => storage.listAktuelleLageQuellen(ids, now);
    const bound = (ko, docs) => storage.getSourcesForVorgang("synthetischer-vorgang",
      { lageKoId: ko, lageQuellen: docs });
    const readError = { name: "StorageReadError", quelle: "lage-quellenbindung" };

    await test("Zeitfenster beidseitig, FK Embedding, keine Auszuege im Metadatenleser", async () => {
      seed("ko-zeit", "start", "2026-08-30T09:00:00Z");
      seed("ko-zeit", "ende", now.toISOString());
      seed("ko-zeit", "alt", "2026-08-30T08:59:59Z");
      seed("ko-zeit", "zukunft", "2026-09-13T09:00:01Z");
      seed("ko-zeit", "ohne-datum", null); seed("ko-fremd", "fremd");
      const rows = await meta(["ko-zeit"]);
      assert.deepEqual(rows.map(r => r.raw_documents.id).sort(), ["ende", "start"]);
      assert(rows.every(r => r.knowledge_object_id === "ko-zeit" && !Object.hasOwn(r.raw_documents, "summary")));
    });
    await test("Innerer Join liefert bei ausschliesslich alten Quellen keine Kante", async () => {
      seed("ko-alt", "alt-einzeln", "2020-01-01T00:00:00Z");
      assert.deepEqual(await meta(["ko-alt", "ko-nicht-vorhanden"]), []);
    });
    await test("Gezielter Beleg jenseits von 40 samt Auszug, allgemeines Limit bleibt 40", async () => {
      reset();
      for (let i = 0; i < 40; i++) seed("ko-vierzig", `alt-${i}`, "2020-01-01T00:00:00Z");
      seed("ko-vierzig", "aktuell-41");
      const docs = (await meta(["ko-vierzig"])).map(r => r.raw_documents);
      assert.deepEqual(docs.map(d => d.id), ["aktuell-41"]);
      const loaded = await bound("ko-vierzig", docs);
      assert.equal(loaded[0].summary, "Synthetischer Auszug ohne Originalabruf");
      assert.equal(loaded[0].id, "aktuell-41");
      assert.equal((await storage.getSourcesForVorgang("vierzig")).length, 40);
    });
    await test("Sechs gezielte Kennungen werden in erwarteter Reihenfolge gelesen", async () => {
      reset(); for (let i = 0; i < 7; i++) seed("ko-sechs", `quelle-${i}`);
      const docs = (await meta(["ko-sechs"])).map(r => r.raw_documents).slice(0, 6).reverse();
      assert.deepEqual((await bound("ko-sechs", docs)).map(d => d.id), docs.map(d => d.id));
    });
    await test("Reservierte Zeichen im Dokumentfilter und Unicode im Wissensobjekt", async () => {
      reset(); const ko = "ko-ä,().&";
      for (const id of ['rd-ä,().&', 'rd-"zitat"', 'rd-\\pfad']) seed(ko, id);
      const docs = (await meta([ko])).map(r => r.raw_documents);
      assert.equal(docs.length, 3);
      assert.deepEqual((await bound(ko, docs)).map(d => d.id), docs.map(d => d.id));
    });
    await test("1001 Verknuepfungen werden ueber die Seitengrenze vollstaendig gelesen", async () => {
      reset();
      psql(`insert into public.knowledge_objects values ('ko-seiten');
        insert into public.raw_documents(id,title,url,published_at)
          select 'seite-'||lpad(i::text,4,'0'),'Quelle '||i,'https://example.invalid/'||i,
          '2026-09-13T08:00:00Z'::timestamptz from generate_series(1,1001) i;
        insert into public.ko_document_links select 'ko-seiten',id from public.raw_documents;`);
      const before = gateway.messung.anfragen;
      const rows = await meta(["ko-seiten"]);
      assert.equal(rows.length, 1001); assert.equal(new Set(rows.map(r => r.raw_documents.id)).size, 1001);
      assert.equal(gateway.messung.anfragen - before, 2);
    });
    await test("101 Wissensobjekte werden in zwei Stapeln gelesen", async () => {
      reset();
      psql(`insert into public.knowledge_objects select 'ko-stapel-'||i from generate_series(1,101) i;
        insert into public.raw_documents(id,title,url,published_at)
          values ('geteilt','Quelle','https://example.invalid/geteilt','2026-09-13T08:00:00Z');
        insert into public.ko_document_links select id,'geteilt' from public.knowledge_objects;`);
      const ids = Array.from({ length: 101 }, (_, i) => `ko-stapel-${i + 1}`);
      const before = gateway.messung.anfragen;
      assert.equal((await meta(ids)).length, 101);
      assert.equal(gateway.messung.anfragen - before, 2);
    });
    for (const field of ["title", "url", "canonical_url", "published_at"]) {
      await test(`Geaendertes ${field} wird beim echten Folgelesen verweigert`, async () => {
        reset(); seed("ko-aenderung", "aenderung");
        const docs = (await meta(["ko-aenderung"])).map(r => r.raw_documents);
        const value = field === "published_at" ? "2026-09-13T07:00:00Z" : "https://example.invalid/geaendert";
        psql(`update public.raw_documents set ${field}=${sqlString(value)} where id='aenderung';`);
        await assert.rejects(bound("ko-aenderung", docs), readError);
      });
    }
    await test("Verlorene Bindung und fremdes Wissensobjekt werden verweigert", async () => {
      reset(); seed("ko-bindung", "bindung");
      const docs = (await meta(["ko-bindung"])).map(r => r.raw_documents);
      await assert.rejects(bound("ko-fremd", docs), readError);
      psql("delete from public.ko_document_links where knowledge_object_id='ko-bindung';");
      await assert.rejects(bound("ko-bindung", docs), readError);
    });
    await test("Doppelte oder mehr als sechs erwartete Kennungen vor REST verweigert", async () => {
      const before = gateway.messung.anfragen;
      await assert.rejects(bound("ko-bindung", [{ id: "x" }, { id: "x" }]), readError);
      await assert.rejects(bound("ko-bindung", Array.from({ length: 7 }, (_, i) => ({ id: `x${i}` }))), readError);
      assert.equal(gateway.messung.anfragen, before);
    });
    const report = gateway.bericht();
    assert.deepEqual(Object.keys(report.nachRpc), ["GET /ko_document_links"]);
    assert.equal(report.fehler, 0);
    console.log("REST_MESSUNG " + JSON.stringify(report));
    console.log(`REST_GRUPPEN ${passed}/13 bestanden; Abschluss erst nach Bereinigung`);
    assert.equal(passed, 13);
  } finally {
    for (const name of changed) {
      if (original[name] === undefined) delete process.env[name]; else process.env[name] = original[name];
    }
    if (gateway) await gateway.stoppe();
    if (api?.pid && api.exitCode === null && api.signalCode === null) {
      api.kill("SIGTERM");
      for (let i = 0; i < 30 && api.exitCode === null && api.signalCode === null; i++) await pause(100);
      if (api.exitCode === null && api.signalCode === null) {
        api.kill("SIGKILL"); await once(api, "exit");
      }
    }
    if (created) {
      psql(`drop database ${db};`, "postgres");
      assert.equal(psql(`select count(*) from pg_database where datname=${sqlString(db)};`, "postgres"), "0");
      console.log("BEREINIGUNG eigene synthetische Datenbank entfernt und nachgelesen");
    }
  }
  console.log("REST_ERGEBNIS: erfolgreich, 13/13 Gruppen und Bereinigung bestaetigt");
}

main().catch(error => {
  // Keine nativen Prozessargumente oder Datenbankzugangsdaten ausgeben.
  console.error(`REST_ERGEBNIS: nicht bestanden (${error.name || "Error"}; ${error.code || "Assertion/Start/Bereinigung"})`);
  if (error.name === "AssertionError" || error.name === "StorageReadError") console.error(error.message);
  process.exitCode = 1;
});
