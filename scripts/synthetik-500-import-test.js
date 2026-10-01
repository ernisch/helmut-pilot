"use strict";

// Standardlauf rein offline. --postgres-local verlangt den isolierten PG17-CI-
// Service; --postgres-container den lokalen network-none Container. Kein Skip,
// keine Production-Verbindung; jede SQL-Abnahme nutzt eine eigene Zufalls-DB.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const S = require("../lib/helmut/synthetik-500-profile");
const I = require("./synthetik-500-import");
const G = require("./import-preflight-500-sql-generator");
let count = 0;
const check = (name, fn) => { fn(); count++; console.log("PASS " + name); };
const literal = s => "'" + String(s).replace(/'/g, "''") + "'";
const paket = S.erzeuge(), bytes = S.serialisiere(paket), loaded = I.ladePaket(bytes);

function fixture(dir) {
  fs.mkdirSync(dir);
  const tab = Object.fromEntries(G.SNAPSHOT_TABELLEN.map(t => [t, []]));
  const p = I.erzeugeZeilen(paket);
  const extra = { created_at: "2026-01-01T00:00:00+00:00", updated_at: "2026-01-01T00:00:00+00:00" };
  for (let i = 0; i < 500; i++) {
    const id = "alt-mandat-" + String(i + 1).padStart(3, "0");
    tab.profiles.push({ id, name: "Alt ' $$ \\ " + i, email: null, ...extra });
    tab.mandate_profiles.push({ ...p.mandateRows[i], user_id: id, partei: "SPD", fraktion: "SPD", freies_feld: "Alt ' $$ \\ " + i, geloescht_at: null, ...extra });
  }
  for (const t of G.FK_KINDTABELLEN.filter(t => t !== "mandate_profiles")) {
    const single = ["matching_weights", "profile_embeddings"].includes(t);
    tab[t] = [{ ...(single ? {} : { id: "alt-" + t }), user_id: "alt-mandat-001", inhalt: { z: ["'", "$$", "\\", "Ä"] },
      ...(t === "matching_results" ? { run_id: "alt-matching_runs" } : {}) }];
  }
  const fremd = [{ id: "fremd-admin", name: "Unveraendert", email: "admin@example.invalid", ...extra }];
  const dateien = {};
  for (const t of G.V2_SNAPSHOT_DATEIEN) {
    const rows = t === "fremd_profiles" ? fremd : tab[t], file = path.join(dir, G.dateiName(t));
    fs.writeFileSync(file, rows.map(r => JSON.stringify(G.kanonisch(r))).join("\n") + "\n");
    dateien[G.dateiName(t)] = { tabelle: t, spalten: Object.keys(rows[0]).sort(), zeilen: rows.length, sha256: G.hashDateiSync(file) };
  }
  const manifest = { snapshotVertrag: G.SNAPSHOT_VERTRAG, operationId: "synthetik500-test-import",
    erstelltAm: new Date().toISOString(), erstelltVon: "offline-test",
    paket: { pfad: "synthetik500.json", sha256: loaded.paketBytesHash },
    bestand: { profilesGesamt: 501, mandateProfilesGesamt: 500, aktivGesamt: 0 },
    ids: { mandat: tab.profiles.map(p => p.id).sort(), fremd: fremd.map(p => p.id) }, dateien };
  manifest.sha256 = G.hashSnapshot(manifest);
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  return { tab, fremd, manifest };
}
function bootstrap(f) {
  const arrays = new Set(["ausschuesse", "berichterstatter_themen", "fachpolitische_schwerpunkte", "namensvarianten",
    "stellvertretende_ausschuesse", "regionale_themen", "relevante_ministerien", "regionale_interessen"]);
  let sql = "drop schema public cascade; create schema public;\n"
    + "create table public.helmut_store(id text primary key,data jsonb not null,updated_at timestamptz default now());\n"
    + "insert into public.helmut_store(id,data) values ('main','{\"unveraendert\":1}'),('main-auth','{\"auth\":2}');\n"
    + "create table public.profiles(id text primary key,name text not null,email text,created_at timestamptz default now(),updated_at timestamptz default now());\n"
    + "create table public.mandate_profiles(" + G.MANDAT_SPALTEN.map(k => k + " "
      + (k === "user_id" ? "text primary key references public.profiles(id) on delete cascade"
        : k === "aktiv" ? "boolean" : k === "profil_extras" ? "jsonb" : arrays.has(k) ? "text[]" : "text")).join(",")
    + ",freies_feld text,geloescht_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());\n";
  for (const t of G.FK_KINDTABELLEN.filter(t => t !== "mandate_profiles")) {
    const single = ["matching_weights", "profile_embeddings"].includes(t);
    sql += `create table public.${t}(${single ? "" : "id text primary key,"}user_id text${single ? " primary key" : ""} references public.profiles(id) on delete cascade,inhalt jsonb${t === "matching_results" ? ",run_id text references public.matching_runs(id) on delete set null" : ""});\n`;
  }
  sql += "create table public.pipeline_locks(expires_at timestamptz);create table public.helmut_jobs(lease_expires_at timestamptz,status text);create table public.process_runs(finished_at timestamptz,status text);create table public.helmut_job_outbox(id text primary key,status text);\n";
  // Physische Reihenfolge unterscheidet sich absichtlich vom Snapshotspaltensatz.
  for (const t of G.SNAPSHOT_TABELLEN) {
    const r = f.tab[t], cols = Object.keys(r[0]).sort().join(",");
    sql += `insert into public.${t} (${cols}) select ${cols} from jsonb_populate_recordset(null::public.${t},${literal(JSON.stringify(r))}::jsonb);\n`;
  }
  const cols = Object.keys(f.fremd[0]).sort().join(",");
  sql += `insert into public.profiles (${cols}) select ${cols} from jsonb_populate_recordset(null::public.profiles,${literal(JSON.stringify(f.fremd))}::jsonb);\n`;
  return sql;
}
function postgresRunner() {
  const argv = process.argv.slice(2), containerMode = argv[0] === "--postgres-container";
  const env = { PATH: process.env.PATH, LANG: "C.UTF-8", LC_ALL: "C.UTF-8", PGPASSWORD: "helmut",
    PGHOSTADDR: "127.0.0.1", PGCONNECT_TIMEOUT: "5", PGOPTIONS: "-c statement_timeout=15000 -c lock_timeout=3000" };
  let cmd, prefix;
  if (containerMode) {
    assert.deepEqual(argv, ["--postgres-container", "synthetik500-import-pg"]);
    const inspect = spawnSync("docker", ["--host=unix:///var/run/docker.sock", "inspect", "--format", "{{.HostConfig.NetworkMode}} {{len .HostConfig.PortBindings}}", argv[1]], { env, encoding: "utf8" });
    assert.equal(inspect.status, 0); assert.equal(inspect.stdout.trim(), "none 0");
    cmd = "docker"; prefix = ["--host=unix:///var/run/docker.sock", "exec", "-i", argv[1], "psql", "-U", "postgres"];
  } else {
    assert.deepEqual(argv, ["--postgres-local"]);
    const host = process.env.HELMUT_TEST_PG_HOST, port = process.env.HELMUT_TEST_PG_PORT || "5433";
    const user = process.env.HELMUT_TEST_PG_USER || "helmut";
    assert(["127.0.0.1", "localhost"].includes(host), "Nur expliziter lokaler CI-PG-Service");
    assert.equal(port, "5433"); assert.equal(user, "helmut");
    cmd = "psql"; prefix = ["-h", host, "-p", port, "-U", user];
  }
  const db = "helmut_synthetik500_import_" + require("node:crypto").randomBytes(8).toString("hex");
  const execute = (sql, expectError = null, database = db) => {
    assert(database === db || database === "postgres");
    const args = [...prefix, "-X", "-w", "-d", database, "-v", "ON_ERROR_STOP=1", "-Atq", "-f", "-"];
    const r = spawnSync(cmd, args, { env, input: sql, encoding: "utf8", timeout: 20000, maxBuffer: 4 * 1024 * 1024 });
    if (expectError) { assert.notEqual(r.status, 0); assert.match(r.stderr, new RegExp(expectError)); }
    else assert.equal(r.status, 0, "Isolierte SQL-Abnahme fehlgeschlagen: " + (r.stderr || "psql nicht verfuegbar"));
    return r.stdout.trim();
  };
  assert(Number(execute("show server_version_num;", null, "postgres")) >= 170000);
  execute(`create database ${db} template template0 lc_collate 'C' lc_ctype 'C';`, null, "postgres");
  return { run: execute, close: () => execute(`drop database ${db};`, null, "postgres") };
}
function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "synthetik-import-test-"));
  try {
  const dir = path.join(tmp, "snapshot"), f = fixture(dir), outDir = path.join(tmp, "sql");
  check("500 synthetische Projektionszeilen mit Landesebenen und echten Fiktionsmarkern", () => {
    const p = I.erzeugeZeilen(paket);
    assert.equal(p.profileRows.length, 500); assert.equal(p.mandateRows.length, 500);
    assert.equal(p.mandateRows.filter(p => p.politische_ebene === "landtag").length, 170);
    assert(p.mandateRows.every(p => p.aktiv === false && p.profil_extras.synthetisch && !Object.hasOwn(p.profil_extras, "offizielleQuellen")));
  });
  check("Originalpaket durch Realvalidator weiterhin abgelehnt", () => assert.equal(G.preflight(paket).ok, false));
  check("Umdeklariertes oder manipuliertes Profil bleibt gesperrt", () => {
    const p = S.erzeuge(); p.profile[0].vollname = "Reale Person";
    assert.throws(() => I.erzeugeZeilen(p));
  });
  check("Nichtkanonische Bytes bleiben gesperrt", () => assert.throws(() => I.ladePaket(JSON.stringify(paket))));
  check("Alternative Fiktionsvariante erzeugt eigene Feldbindung", () => {
    const p = S.erzeuge({ variante: "kontrast-v1" });
    assert.notEqual(I.projizierteBindung(p).rowsHash, I.projizierteBindung(paket).rowsHash);
  });
  check("Vollstaendiger v2-Snapshot durch bestehenden Validator", () => assert(G.pruefeSnapshotVerzeichnis(dir, { paketHash: loaded.paketBytesHash }).ok));
  check("Atomare private SQL-Paar-Ausgabe und Hashmanifest", () => {
    const b = I.baueDateien({ paketBytes: bytes, snapshotDir: dir, outDir });
    assert.equal(b.ausgefuehrt, false); assert.equal(b.aktivierungFreigegeben, false);
    const m = JSON.parse(fs.readFileSync(path.join(outDir, "manifest.json")));
    for (const [name, hash] of Object.entries(m.dateien)) {
      assert.equal(G.hashDateiSync(path.join(outDir, name)), hash);
      assert.equal(fs.statSync(path.join(outDir, name)).mode & 0o777, 0o600);
    }
    assert.equal(fs.statSync(outDir).mode & 0o777, 0o700);
  });
  const forward = fs.readFileSync(path.join(outDir, "synthetik500-ersatz.sql"), "utf8");
  const rollback = fs.readFileSync(path.join(outDir, "synthetik500-rueckweg.sql"), "utf8");
  check("Einzeltransaktionen und volle Kindtabellenlocks vor Mutation", () => {
    for (const sql of [forward, rollback]) {
      assert.equal((sql.match(/^begin;$/gm) || []).length, 1); assert.equal((sql.match(/^commit;$/gm) || []).length, 1);
      assert(sql.indexOf("lock table") < sql.indexOf("delete from public.profiles"));
      assert.match(sql, /synthetik500-import-fk-schema-drift/);
    }
  });
  check("FK-Rueckweg ordnet matching_runs vor matching_results", () => assert(rollback.indexOf("insert into public.matching_runs") < rollback.indexOf("insert into public.matching_results")));
  check("Spaltenprojektion folgt Snapshot statt physischem SELECT-star", () => assert(!/select \* from jsonb_populate_recordset/.test(forward + rollback)));
  check("Blob-Lock- und Outbox-Ruhe stehen in beiden Wegen vor allen permanenten Writes", () => {
    for (const sql of [forward, rollback]) {
      assert(sql.indexOf("public.helmut_job_outbox in access exclusive mode") < sql.indexOf("delete from public.profiles"));
      assert(sql.indexOf("synthetik500-import-blob-lock-aktiv-oder-unklar") < sql.indexOf("delete from public.profiles"));
      assert.match(sql, /jsonb_typeof\(c.value->'expiresAt'\)='number'/);
    }
  });
  check("Vorhandener Output wird nie ueberschrieben", () => assert.throws(() => I.baueDateien({ paketBytes: bytes, snapshotDir: dir, outDir })));
  check("Privatoutput in echtem Gitroot wird abgelehnt und bereinigt", () => {
    const out = path.join(__dirname, "synthetik500-private-test");
    assert.throws(() => I.baueDateien({ paketBytes: bytes, snapshotDir: dir, outDir: out }));
    assert(!fs.existsSync(out));
  });
  check("CLI zeigt nur Metadaten und erzeugt private Dateien", () => {
    const file = path.join(tmp, "paket.json"); fs.writeFileSync(file, bytes, { mode: 0o600 });
    const r = spawnSync(process.execPath, [path.join(__dirname, "synthetik-500-import.js"),
      "--paket", file, "--snapshot", dir, "--out", path.join(tmp, "cli-output")], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const m = JSON.parse(r.stdout); assert.equal(m.ausgefuehrt, false);
    assert(!/Fiktive Testperson|insert into|Altbestand|vollname/.test(r.stdout));
  });
  check("CLI ohne vollstaendigen Vertrag bleibt fail-closed ohne SQL-Ausgabe", () => {
    const r = spawnSync(process.execPath, [path.join(__dirname, "synthetik-500-import.js")], { encoding: "utf8" });
    assert.equal(r.status, 1); assert.equal(r.stdout, ""); assert.equal(r.stderr.trim(), "synthetik500-import-fail-closed");
  });
  check("Manipulierter Snapshot erzeugt kein Artefakt", () => {
    fs.appendFileSync(path.join(dir, "briefings.jsonl"), "{}\n");
    assert.throws(() => I.baueDateien({ paketBytes: bytes, snapshotDir: dir, outDir: path.join(tmp, "bad") }));
    assert(!fs.existsSync(path.join(tmp, "bad")));
  });
  if (process.argv.length > 2) {
    const postgres = postgresRunner(), run = postgres.run, reset = () => run(bootstrap(f));
    try {
    check("Postgres: atomarer 500/501/0 Ersatz mit Journal, Fremdprofil und main/auth erhalten", () => {
      reset(); run(forward);
      assert.equal(run("select (select count(*) from profiles)||'/'||(select count(*) from mandate_profiles)||'/'||(select count(*) from mandate_profiles where aktiv is not false);"), "501/500/0");
      assert.equal(run("select data->>'zustand' from helmut_store where id='synthetik500-import-synthetik500-test-import';"), "inaktiv-importiert");
    });
    check("Postgres: kompletter FK-sicherer Rueckweg ohne Feld-/Kinddatenverlust", () => {
      run(rollback);
      assert.equal(run("select freies_feld from mandate_profiles where user_id='alt-mandat-001';"), "Alt ' $$ \\ 0");
      assert.equal(run("select inhalt->'z'->>3 from matching_results where id='alt-matching_results';"), "Ä");
    });
    check("Postgres: Forward und Rueckweg nach Verbrauch gesperrt", () => {
      run(forward, "operation-verbraucht"); run(rollback, "journal-drift-oder-verbraucht");
    });
    const drift = (name, mutate, expected, direction = "forward") => check("Postgres: " + name, () => {
      reset(); if (direction === "rollback") run(forward);
      run(mutate);
      const state = "select jsonb_build_object('profiles',(select jsonb_agg(to_jsonb(p) order by id) from profiles p),'mandate',(select jsonb_agg(to_jsonb(m) order by user_id) from mandate_profiles m),'store',(select jsonb_agg(to_jsonb(s) order by id) from helmut_store s));";
      const before = run(state);
      run(direction === "rollback" ? rollback : forward, expected);
      assert.equal(run(state), before);
      assert.equal(run("select count(*) from mandate_profiles;"), "500");
    });
    drift("Altfeld-Drift stoppt vor Delete", "update mandate_profiles set freies_feld='drift' where user_id='alt-mandat-001';", "preimage-drift");
    drift("Kinddaten-Drift stoppt vor Delete", "update briefings set inhalt='{}';", "preimage-drift");
    drift("Fremdprofil-Drift stoppt vor Delete", "update profiles set name='drift' where id='fremd-admin';", "fremdprofil-drift");
    drift("Aktivwert NULL stoppt vor Delete", "update mandate_profiles set aktiv=null where user_id='alt-mandat-001';", "500-501-0-verletzt");
    drift("laufender Prozess stoppt vor Delete", "insert into process_runs values(null,'running');", "prozessruhe-fehlt");
    drift("lebender Blob-PipelineLock stoppt atomar", `update helmut_store set data=jsonb_build_object('auth',2,'pipelineLocks',jsonb_build_object('worker',jsonb_build_object('expiresAt',${Date.now() + 60000}))) where id='main-auth';`, "blob-lock-aktiv-oder-unklar");
    drift("unbekannte Blob-Lockablage stoppt atomar", "update helmut_store set data=' {\"pipelineLocks\":[]}' where id='main-auth';", "blob-lock-format");
    drift("fehlendes Blob-Lockablaufdatum stoppt atomar", "update helmut_store set data='{\"pipelineLocks\":{\"worker\":{}}}' where id='main-auth';", "blob-lock-aktiv-oder-unklar");
    drift("untypisiertes Blob-Lockablaufdatum stoppt atomar", "update helmut_store set data='{\"pipelineLocks\":{\"worker\":{\"expiresAt\":\"0\"}}}' where id='main-auth';", "blob-lock-aktiv-oder-unklar");
    drift("offene Outbox stoppt atomar", "insert into helmut_job_outbox values('offen','offen');", "prozessruhe-fehlt");
    drift("versendete Outbox stoppt atomar", "insert into helmut_job_outbox values('versendet','versendet');", "prozessruhe-fehlt");
    drift("unklarer Outboxstatus stoppt atomar", "insert into helmut_job_outbox values('unklar',null);", "prozessruhe-fehlt");
    drift("neue nullable Spalte stoppt vor Delete", "alter table mandate_profiles add column schema_drift text;", "schema-drift");
    drift("neue FK-Tabelle stoppt vor Delete", "create table unbekannt(user_id text references profiles(id) on delete cascade);", "fk-schema-drift");
    drift("Quer-FK zu Fremdprofil rollt gesamten Ersatz zurueck", "insert into matching_results values('fremd-result','fremd-admin','{}','alt-matching_runs');", "nebenbestand-drift");
    drift("gefaelschter Journalhash stoppt Rueckweg", "update helmut_store set data=data||'{\"rowsHash\":\"falsch\"}' where id like 'synthetik500-import-%';", "journal-drift", "rollback");
    drift("ungeprueftes Defaultfeld stoppt Rueckweg", "update mandate_profiles set freies_feld='drift' where user_id='test-kohorte-synthetik-bt-001';", "postimage-drift", "rollback");
    drift("Kinddaten nach Import stoppt Rueckweg", "insert into briefings values('neu','test-kohorte-synthetik-bt-001','{}');", "neue-kinddaten", "rollback");
    drift("lebender Blob-Lock stoppt auch Rueckweg", `update helmut_store set data=jsonb_build_object('pipelineLocks',jsonb_build_object('worker',jsonb_build_object('expiresAt',${Date.now() + 60000}))) where id='main-auth';`, "blob-lock-aktiv-oder-unklar", "rollback");
    check("Postgres: abgelaufener Snapshot stoppt atomar ohne Import", () => {
      reset();
      const stale = forward.replaceAll(literal(f.manifest.erstelltAm), "'2000-01-01T00:00:00Z'");
      run(stale, "snapshot-nicht-frisch");
      assert.equal(run("select count(*) from profiles where id like 'alt-mandat-%';"), "500");
    });
    check("Postgres: unabhaengige Fremd-Kinddaten bleiben bei beiden Wegen erhalten", () => {
      reset(); run("insert into matching_results values('fremd-result','fremd-admin','{\"behalten\":true}',null);");
      run(forward); run(rollback);
      assert.equal(run("select inhalt->>'behalten' from matching_results where id='fremd-result';"), "true");
    });
    check("Postgres: abgelaufene Blob-Locks und terminale Outbox bleiben unveraendert", () => {
      reset(); run("update helmut_store set data='{\"auth\":2,\"pipelineLocks\":{\"worker\":{\"expiresAt\":0}}}' where id='main-auth';insert into helmut_job_outbox values('terminal','bestaetigt');");
      const before = run("select data from helmut_store where id='main-auth';");
      run(forward); run(rollback);
      assert.equal(run("select data from helmut_store where id='main-auth';"), before);
      assert.equal(run("select status from helmut_job_outbox where id='terminal';"), "bestaetigt");
    });
    } finally { postgres.close(); }
  }
  console.log(count + "/" + count + " Synthetik-Importpruefungen gruen");
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
if (require.main === module) main();
module.exports = { fixture, bootstrap, paketBytes: bytes };
