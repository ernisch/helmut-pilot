"use strict";

// Explizite lokale Neustartabnahme, kein Offline-Sammeltest. Nur ein neu
// erzeugter Network-none-Container und sein eigener persistenter /tmp-Datenpfad.
// Echte PostgreSQL-RPCs und WAL; keine Quellen, Modelle, Profile oder Production.
// Ein Fixture-Aufsichtsprozess hält den Container beim separaten DB-Crash am Leben.
const A = require("node:assert/strict");
const { execFileSync, spawn } = require("node:child_process");
const { once } = require("node:events");
const { setTimeout: warte } = require("node:timers/promises");
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } = require("node:fs");
const { createHash, randomBytes } = require("node:crypto");
const path = require("node:path");
const IMAGE = "postgres:17.6-bookworm";
const MIGRATIONEN = ["20260808_scalable_job_queue.sql", "20261119091317_quellenfaelligkeit_claim.sql",
  "20260814180000_verstehen_cas.sql"];
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const q = text => "'" + String(text).replaceAll("'", "''") + "'";
const bericht = { version: 1, status: "RUNNING", gestartet: new Date().toISOString(),
  befehl: [process.execPath, ...process.argv.slice(1)], migrationen: {}, pruefungen: [],
  providerAufrufe: 0, grenzen: [
    "Manueller lokaler Containerneustart; keine automatische Docker-Restartpolicy geprüft.",
    "Separater unmittelbarer PostgreSQL-Crash mit WAL-Recovery; kein Strom-/Host-/Docker-Daemonausfall.",
    "RPCs über lokale psql-Sockets als postgres; kein PostgREST-/Supabase-Transportnachweis.",
    "Minimale knowledge_objects-Hülle für CAS, keine fachliche Ergebnis- oder Morgenversorgung.",
    "Keine Entsperrung eines globalen unbekannten Tagesausgangs und kein zweiter Modellstart."
  ] };
let container, tmp, aktiv = false, sitzung, belegDatei;
function docker(args, opts = {}) {
  return execFileSync("docker", args, { encoding: "utf8", timeout: 25000,
    maxBuffer: 4 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"], ...opts }).trim();
}
function sql(db, input) {
  return docker(["exec", "-i", container, "psql", "-X", "-q", "-At", "-U", "postgres", "-d", db,
    "-v", "ON_ERROR_STOP=1"], { input });
}
function pruefung(name, details = {}) {
  bericht.pruefungen.push({ name, ...details }); console.log("PASS " + name);
}
function stand(db) {
  return JSON.parse(sql(db, `select jsonb_build_object(
    'jobs',(select jsonb_agg(to_jsonb(j) order by id) from helmut_jobs j),
    'cas',(select jsonb_agg(to_jsonb(r) order by vorgang_id) from helmut_verstehen_reservierungen r),
    'commits',(select jsonb_agg(id order by id) from neustart_transaktion));`));
}
async function bis(fn, timeoutMs, fehler) {
  const ende = performance.now() + timeoutMs;
  while (performance.now() < ende) { if (await fn()) return; await warte(50); }
  throw Error(fehler);
}
async function bereit() {
  await bis(() => {
    try { return sql("postgres", "select 1;") === "1"; } catch { return false; }
  }, 15000, "Isoliertes PostgreSQL nicht bereit");
}
const pgOptionen = "-c listen_addresses='' -c fsync=on -c synchronous_commit=on -c full_page_writes=on";
const aufsichtsprozess = `set -Eeuo pipefail
install -d -m 700 -o postgres -g postgres "$PGDATA"
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  gosu postgres initdb -D "$PGDATA" --auth=trust --encoding=UTF8 --no-locale >/tmp/initdb.log
fi
trap 'gosu postgres pg_ctl -D "$PGDATA" -m fast -w stop || true; exit 0' TERM INT
gosu postgres pg_ctl -D "$PGDATA" -l "$PGDATA/fixture-postgres.log" -o "${pgOptionen}" -w start
while true; do sleep 1 & wait $! || true; done`;

async function starte() {
  A.equal(process.env.HELMUT_LOKALER_SCHUTZ, "aktiv", "Nur über scripts/lokal.js starten");
  A.deepEqual(process.argv.slice(2, 3), ["--beleg"]);
  A.equal(process.argv.length, 4);
  belegDatei = process.argv[3];
  A(path.isAbsolute(belegDatei) && belegDatei.endsWith(".json"));
  A(existsSync(path.dirname(belegDatei)) && !existsSync(belegDatei), "Neuer privater Belegpfad erforderlich");
  bericht.dateiSha256 = hash(readFileSync(__filename));
  bericht.codeCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", cwd: path.join(__dirname, "..") }).trim();
  bericht.image = { name: IMAGE, id: docker(["image", "inspect", IMAGE, "--format", "{{.Id}}"] ) };
  A.match(bericht.image.id, /^sha256:[0-9a-f]{64}$/);
  tmp = mkdtempSync("/tmp/helmut-neustart-");
  const datadir = path.join(tmp, "pgdata"); mkdirSync(datadir);
  container = `helmut-neustart-${process.pid}-${randomBytes(4).toString("hex")}`;
  bericht.container = container; bericht.testDatadir = datadir;
  // --pull=never verhindert jeden Download, --network=none jeden Anbieterzugriff.
  docker(["run", "--detach", "--pull=never", "--name", container, "--network=none", "--restart=no",
    "--memory=512m", "--cpus=1", "--mount", `type=bind,source=${datadir},target=/var/lib/postgresql/data`,
    "--entrypoint", "bash", IMAGE, "-c", aufsichtsprozess]);
  aktiv = true;
  const inspect = JSON.parse(docker(["inspect", container]))[0];
  A.equal(inspect.HostConfig.NetworkMode, "none"); A.equal(inspect.Config.Image, IMAGE);
  A.equal(inspect.HostConfig.RestartPolicy.Name, "no");
  A.equal(inspect.Mounts.find(m => m.Destination === "/var/lib/postgresql/data").Source, datadir);
  await bereit();
  bericht.postgresVersion = sql("postgres", "show server_version;");
  A.match(bericht.postgresVersion, /^17\.6\b/);
  A.equal(sql("postgres", "show fsync; show synchronous_commit; show full_page_writes;"), "on\non\non");
  sql("postgres", "create role anon; create role authenticated; create role service_role;");
  pruefung("Eigener PostgreSQL-17.6-Container ohne Netzwerk mit persistentem /tmp-Datadir", bericht.image);
}

function befuellen(db) {
  sql("postgres", `create database ${db};`);
  for (const name of MIGRATIONEN) {
    if (name.includes("verstehen_cas")) sql(db, "create table knowledge_objects(id text primary key,vorgang_id text);");
    const bytes = readFileSync(path.join(__dirname, "../supabase/migrations", name));
    bericht.migrationen[name] = hash(bytes); sql(db, bytes);
  }
  A.equal(sql(db, "select md5(prosrc) from pg_proc where oid='public.helmut_claim_quellenfaelligkeit(text,bigint,boolean)'::regprocedure;"), "6a88011286ac4a1beae5ac5fc10f0e8d");
  sql(db, "create table neustart_transaktion(id text primary key); insert into neustart_transaktion values('committed-before-restart');");
  const ids = [];
  for (const [i, phase] of ["vor-marker", "nach-marker"].entries()) {
    const id = sql(db, `select id from helmut_enqueue_job('source_fetch',${q(phase)},'synthetik-neustart','{}',now(),${40 + i}::smallint,3,null);`);
    ids.push(id);
  }
  for (const [i, phase] of ["vor-marker", "nach-marker"].entries()) {
    const [job] = JSON.parse(sql(db, "select jsonb_agg(j) from helmut_claim_quellenfaelligkeit('alter-worker',4000,false) j;"));
    A.equal(job.id, ids[i]); A.equal(job.attempts, 1);
    const [cas] = JSON.parse(sql(db, `select jsonb_agg(r) from helmut_verstehen_reserviere(${q(phase)},'fixture-hash','alter-worker',4000) r;`));
    A.equal(cas.erlaubt, true); A.equal(cas.fencing, 1);
    if (phase === "nach-marker") A.equal(sql(db, "select helmut_verstehen_modellstart('nach-marker','alter-worker',1,4000);"), "t");
  }
  A.equal(sql(db, "select bool_and(lease_expires_at>now()) from helmut_jobs;"), "t");
  A.equal(sql(db, "select bool_and(lease_bis>now()) from helmut_verstehen_reservierungen;"), "t");
  return { ids, vor: stand(db) };
}

async function uebernehmen(db, vorher) {
  // Leasezeiten werden ausschließlich abgewartet, nie SQL-seitig verändert.
  await bis(() => sql(db, "select (select bool_and(lease_expires_at<now()) from helmut_jobs) and (select bool_and(lease_bis<now()) from helmut_verstehen_reservierungen);") === "t",
  8000, "Native Leases sind nicht regulär abgelaufen");
  const nachNeustart = stand(db); A.deepEqual(nachNeustart, vorher.vor);
  const uebernommen = [];
  for (const phase of ["vor-marker", "nach-marker"]) {
    const [job] = JSON.parse(sql(db, "select jsonb_agg(j) from helmut_claim_quellenfaelligkeit('neuer-worker',4000,false) j;"));
    A(job); uebernommen.push(job.id); A.equal(job.attempts, 2); A.equal(job.lease_owner, "neuer-worker");
    A.equal(sql(db, `select uebernommen from helmut_finish_job('${job.id}','alter-worker',true);`), "f");
    A.equal(sql(db, `select helmut_extend_job_lease('${job.id}','alter-worker',4000);`), "f");
    const [cas] = JSON.parse(sql(db, `select jsonb_agg(r) from helmut_verstehen_reserviere(${q(phase)},'fixture-hash','neuer-worker',4000) r;`));
    if (phase === "vor-marker") {
      A.equal(cas.erlaubt, true); A.equal(cas.fencing, 2);
      A.equal(sql(db, "select ki_aufrufe from helmut_verstehen_reservierungen where vorgang_id='vor-marker';"), "0");
    } else {
      A.equal(cas.erlaubt, false); A.equal(cas.grund, "ausgang-unbekannt");
      A.equal(sql(db, "select zustand||'|'||ki_aufrufe from helmut_verstehen_reservierungen where vorgang_id='nach-marker';"), "unbekannt|1");
      A.equal(sql(db, "select helmut_verstehen_modellstart('nach-marker','neuer-worker',1,4000);"), "f");
    }
  }
  A.deepEqual(uebernommen.sort(), vorher.ids.slice().sort());
  A.equal(sql(db, "select count(*) from helmut_claim_quellenfaelligkeit('dritter-worker',4000,false);"), "0");
  A.equal(sql(db, "select count(*)||'|'||count(*) filter(where status='laeuft') from helmut_jobs;"), "2|2");
  A.equal(sql(db, "select count(*) from knowledge_objects;"), "0");
  return { jobsVorHash: hash(JSON.stringify(vorher.vor)), jobsNachNeustartHash: hash(JSON.stringify(nachNeustart)),
    auftragsIdsErhalten: uebernommen, quellclaims: 2, modellstartMarker: 1, providerAufrufe: 0,
    nachUebernahme: stand(db) };
}

async function containerNeustart() {
  const db = "helmut_container_neustart", vorher = befuellen(db);
  const containerVor = JSON.parse(docker(["inspect", container]))[0].State;
  const pgVor = sql(db, "select pg_postmaster_start_time()::text||'|'||system_identifier from pg_control_system();");
  docker(["restart", "--time", "5", container]); await bereit();
  const containerNach = JSON.parse(docker(["inspect", container]))[0].State;
  const pgNach = sql(db, "select pg_postmaster_start_time()::text||'|'||system_identifier from pg_control_system();");
  A.notEqual(containerNach.StartedAt, containerVor.StartedAt); A.notEqual(containerNach.Pid, containerVor.Pid);
  A.notEqual(pgNach.split("|")[0], pgVor.split("|")[0]); A.equal(pgNach.split("|")[1], pgVor.split("|")[1]);
  bericht.containerNeustart = { gestartetVorher: containerVor.StartedAt, gestartetNachher: containerNach.StartedAt,
    pidVorher: containerVor.Pid, pidNachher: containerNach.Pid, postgresVorher: pgVor, postgresNachher: pgNach,
    ...await uebernehmen(db, vorher) };
  pruefung("Echter Containerneustart erhält beide Jobs und CAS, natürliche Leases und Modellstartschutz", bericht.containerNeustart);
}

async function postgresCrash() {
  const db = "helmut_postgres_crash", vorher = befuellen(db);
  const containerVor = JSON.parse(docker(["inspect", container]))[0].State;
  const pgVor = sql(db, "select pg_postmaster_start_time()::text||'|'||system_identifier from pg_control_system();");
  sitzung = spawn("docker", ["exec", "-i", "-e", "PGAPPNAME=helmut-neustart-offene-transaktion", container,
    "psql", "-X", "-q", "-At", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1"],
  { stdio: ["pipe", "pipe", "pipe"] });
  let ausgabe = "", fehler = "";
  sitzung.stdout.on("data", x => { ausgabe += x; }); sitzung.stderr.on("data", x => { fehler += x; });
  const sitzungEnde = once(sitzung, "close");
  sitzung.stdin.end("begin; insert into neustart_transaktion values('uncommitted-crash'); select pg_sleep(30); commit;\n");
  await bis(() => sql(db, "select count(*) from pg_stat_activity where application_name='helmut-neustart-offene-transaktion' and state='active' and xact_start is not null and query like '%pg_sleep(30)%';") === "1",
  5000, "Offene Transaktion wurde nicht aktiv");
  A.equal(sql(db, "select count(*) from neustart_transaktion where id='uncommitted-crash';"), "0");
  docker(["exec", "--user", "postgres", container, "pg_ctl", "-D", "/var/lib/postgresql/data", "-m", "immediate", "-w", "stop"]);
  const [exitCode, signal] = await Promise.race([sitzungEnde, warte(5000).then(() => { throw Error("Abgebrochene SQL-Verbindung hängt"); })]);
  A.notEqual(exitCode, 0); A.equal(signal, null);
  A.match(fehler, /server closed the connection unexpectedly|terminating connection|connection to server was lost/i);
  sitzung = null;
  let verbindungAbgewiesen = false;
  try { sql(db, "select 1;"); } catch { verbindungAbgewiesen = true; }
  A.equal(verbindungAbgewiesen, true, "PostgreSQL muss tatsächlich gestoppt sein");
  const containerBeimAusfall = JSON.parse(docker(["inspect", container]))[0].State;
  A.equal(containerBeimAusfall.Running, true); A.equal(containerBeimAusfall.StartedAt, containerVor.StartedAt);
  docker(["exec", "--user", "postgres", container, "pg_ctl", "-D", "/var/lib/postgresql/data", "-l",
    "/var/lib/postgresql/data/fixture-postgres.log", "-o", pgOptionen, "-w", "start"]);
  await bereit();
  const containerNach = JSON.parse(docker(["inspect", container]))[0].State;
  A.equal(containerNach.StartedAt, containerVor.StartedAt); A.equal(containerNach.Pid, containerVor.Pid);
  const pgNach = sql(db, "select pg_postmaster_start_time()::text||'|'||system_identifier from pg_control_system();");
  A.notEqual(pgNach.split("|")[0], pgVor.split("|")[0]); A.equal(pgNach.split("|")[1], pgVor.split("|")[1]);
  A.equal(sql(db, "select count(*) from neustart_transaktion where id='uncommitted-crash';"), "0");
  A.equal(sql(db, "select count(*) from neustart_transaktion where id='committed-before-restart';"), "1");
  const log = docker(["exec", container, "cat", "/var/lib/postgresql/data/fixture-postgres.log"]);
  A.match(log, /database system was interrupted/); A.match(log, /redo starts at|redo is not required/);
  bericht.postgresCrash = { containerStartUnveraendert: containerNach.StartedAt, containerPidUnveraendert: containerNach.Pid,
    postgresVorher: pgVor, postgresNachher: pgNach, unterbrocheneVerbindung: { exitCode, signal, stdout: ausgabe, stderr: fehler },
    uncommittedNachCrash: 0, committedNachCrash: 1, ...await uebernehmen(db, vorher) };
  pruefung("Echter PostgreSQL-Crash trennt Verbindung, rollt offene Transaktion zurück und schützt Wiederanlauf", bericht.postgresCrash);
}

async function aufraeumen() {
  if (sitzung && sitzung.exitCode === null && sitzung.signalCode === null) { sitzung.kill("SIGKILL"); sitzung = null; }
  if (aktiv) {
    const serverlog = docker(["exec", container, "cat", "/var/lib/postgresql/data/fixture-postgres.log"]);
    const logDatei = belegDatei.replace(/\.json$/, ".postgres.log");
    writeFileSync(logDatei, serverlog, { flag: "wx", mode: 0o600 });
    bericht.postgresLog = { datei: logDatei, sha256: hash(serverlog) };
    docker(["exec", "--user", "postgres", container, "pg_ctl", "-D", "/var/lib/postgresql/data", "-m", "fast", "-w", "stop"]);
    docker(["exec", "--user", "root", container, "chown", "-R", `${process.getuid()}:${process.getgid()}`, "/var/lib/postgresql/data"]);
    docker(["rm", "--force", container]); aktiv = false;
  }
  if (tmp) { rmSync(tmp, { recursive: true, force: true }); bericht.eigeneRessourcenEntfernt = true; }
}
(async () => {
  try { await starte(); await containerNeustart(); await postgresCrash(); bericht.status = "PASS"; }
  catch (error) {
    bericht.status = "FAIL"; bericht.erstfehler = String(error.stack || error);
    if (error.stderr) bericht.erstfehlerStderr = String(error.stderr);
    console.error(bericht.erstfehler); process.exitCode = 1;
  } finally {
    try { await aufraeumen(); } catch (error) {
      bericht.cleanupFehler = String(error.stack || error); bericht.status = "FAIL";
      console.error(bericht.cleanupFehler); process.exitCode = 1;
    }
    bericht.beendet = new Date().toISOString();
    if (belegDatei) writeFileSync(belegDatei, JSON.stringify(bericht, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  }
  if (bericht.status === "PASS") console.log("PASS 2/2 neue Neustartfälle; Container/DB echt, Provideraufrufe 0; keine globale UNKNOWN-Entsperrung");
})().catch(error => { console.error(error); process.exitCode = 1; });
