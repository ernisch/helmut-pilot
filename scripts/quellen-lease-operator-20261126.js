"use strict";

// Ausschliesslich NEUE native Operatorfaelle. Kein Wiederholen der Defer-,
// Prozess-, Morgen- oder Monatsabnahme. Ein eigener neuer tmpfs-Container.
const A = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const { readFileSync, writeFileSync, existsSync } = require("node:fs");
const { createHash, randomBytes } = require("node:crypto");
const { setTimeout: warten } = require("node:timers/promises");
const path = require("node:path");
const IMAGE = "postgres:17.6-bookworm", DB = "helmut_lease_operator";
const SQL_DATEI = path.join(__dirname, "ops/quellen-lease-20261126.sql");
const SQL_SHA = "716b99808ea8f684507d1d154c53dc018cbc18dbf85b43068f70354b17633bd1";
const FIX = "20261126132654_job_defer_leaseablauf.sql";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const q = text => "'" + String(text).replaceAll("'", "''") + "'";
const bericht = { version: 1, status: "RUNNING", gestartet: new Date().toISOString(),
  dateiSha256: hash(readFileSync(__filename)), operatorSha256: hash(readFileSync(SQL_DATEI)),
  befehl: [process.execPath, ...process.argv.slice(1)], pruefungen: [], providerAufrufe: 0,
  productionAktionen: 0, grenzen: [
    "Nur neue Operatorfaelle; bestehende Defer-/Neustart-/Morgen-/Monatspruefungen nicht wiederholt.",
    "Eigener lokaler PostgreSQL17.6-Container ohne Netzwerk mit tmpfs, kein Supabase-/Hetznerbetrieb.",
    "Leases laufen natuerlich ab. Rueckweg stellt historische abgelaufene Markierung, kein altes Laufrecht her.",
    "Kosten-/Plan-/CAS-Sentinelzeilen sind deklarierte Fixtures, keine reale Budget- oder Inhaltsabnahme."
  ] };
let container, aktiv = false, belegDatei, operatorSql;
function docker(args, options = {}) {
  return execFileSync("docker", args, { encoding: "utf8", timeout: 20000,
    maxBuffer: 4 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"], ...options }).trim();
}
function sql(input, db = DB, vars = {}) {
  const parameter = Object.entries(vars).flatMap(([k, v]) => ["-v", `${k}=${v}`]);
  return docker(["exec", "-i", container, "psql", "-X", "-q", "-At", "-U", "postgres", "-d", db,
    "-v", "ON_ERROR_STOP=1", ...parameter], { input });
}
const json = input => JSON.parse(sql(input));
const migration = name => readFileSync(path.join(__dirname, "../supabase/migrations", name), "utf8");
function geschuetzt() {
  return json("select jsonb_build_object('store',(select jsonb_agg(to_jsonb(s) order by id) from helmut_store s), 'cas',(select jsonb_agg(to_jsonb(c) order by vorgang_id) from helmut_verstehen_reservierungen c));");
}
function stand() {
  return { jobs: json("select coalesce(jsonb_agg(to_jsonb(j) order by id),'[]') from helmut_jobs j;"), geschuetzt: geschuetzt() };
}
function row(id) { return json(`select to_jsonb(j) from helmut_jobs j where id=${q(id)};`); }
function ops(modus, jobId, bindung = {}) {
  return JSON.parse(sql(operatorSql, DB, { modus, job_id: jobId, bindung: JSON.stringify(bindung) }).split("\n").at(-1));
}
function ablehnung(name, modus, id, bindung = {}) {
  const vor = stand(); let fehler;
  try { ops(modus, id, bindung); } catch (error) { fehler = String(error.stderr || error); }
  A(fehler && /lease:/.test(fehler), "Operator muss vor Mutation nachvollziehbar ablehnen");
  A.deepEqual(stand(), vor); return { name, fehler, vor };
}
function fall(name, details) { bericht.pruefungen.push({ name, ...details }); console.log("PASS " + name); }
function seed(name) {
  sql("truncate helmut_jobs,helmut_quellen_dlq;");
  const tag = new Date().toISOString().slice(0, 10);
  const id = sql(`select id from helmut_enqueue_job('document_understanding',${q(name)},${q(tag + "T00Z")},'{"synthetischerBeleg":"unveraendert"}',now(),40::smallint,3,null);`);
  const [job] = json("select jsonb_agg(j) from helmut_claim_jobs('historischer-owner',1,1000,array['document_understanding']::text[]) j;");
  A.equal(job.id, id); A.equal(job.attempts, 1); return job;
}
async function ablauf(id) {
  const bis = performance.now() + 5000;
  while (performance.now() < bis) {
    if (sql(`select lease_expires_at<clock_timestamp() from helmut_jobs where id=${q(id)};`) === "t") return;
    await warten(35);
  }
  throw Error("Fixturelease nicht natuerlich abgelaufen");
}
function stabil(job) { const { status, lease_owner, lease_expires_at, updated_at, ...rest } = job; return rest; }
async function neuPruefen() {
  let job = seed("operator-rueckweg"); await ablauf(job.id);
  const schutz = geschuetzt(), vor = row(job.id), vorschau = ops("vorschau", job.id);
  A.equal(vorschau.modus, "vorschau"); A.deepEqual(vorschau.vor.job, vor);
  const frei = ops("freigeben", job.id, vorschau), nach = row(job.id);
  A.equal(frei.modus, "freigegeben"); A.deepEqual(frei.nach.job, nach);
  A.equal(nach.status, "wartend"); A.equal(nach.lease_owner, null); A.equal(nach.lease_expires_at, null);
  A.deepEqual(stabil(nach), stabil(vor)); A.deepEqual(geschuetzt(), schutz);
  const doppelt = ablehnung("doppelteFreigabe", "freigeben", job.id, vorschau);
  const rueck = ops("rueckweg", job.id, frei), wieder = row(job.id);
  A.equal(rueck.modus, "zurueckgenommen"); A.equal(wieder.status, "laeuft");
  A.equal(wieder.lease_owner, vor.lease_owner); A.equal(wieder.lease_expires_at, vor.lease_expires_at);
  A.deepEqual(stabil(wieder), stabil(vor)); A.deepEqual(geschuetzt(), schutz);
  A.equal(sql(`select helmut_extend_job_lease(${q(job.id)},'historischer-owner',10000);`), "f");
  A.equal(json(`select to_jsonb(r) from helmut_finish_job(${q(job.id)},'historischer-owner',true) r;`).uebernommen, false);
  A.equal(json(`select to_jsonb(r) from helmut_defer_job(${q(job.id)},'historischer-owner',1000,'fixture') r;`).uebernommen, false);
  A.deepEqual(row(job.id), wieder);
  fall("Vorschau/Freigabe per Reaper0/Rueckweg erhalten Belege und geben altem Owner kein Laufrecht", { vorschau, frei, doppelt, rueck, nachRueckweg: wieder });

  job = seed("operator-stale-vorwert"); await ablauf(job.id);
  let bindung = ops("vorschau", job.id);
  sql(`update helmut_jobs set last_error='echter neuer Fixturevorwert' where id=${q(job.id)};`);
  fall("Veralteter vollstaendiger Vorwert stoppt ohne Mutation", ablehnung("stale", "freigeben", job.id, bindung));

  job = seed("operator-stale-zeit"); await ablauf(job.id); bindung = ops("vorschau", job.id);
  const alt = { ...bindung, gelesenAm: new Date(Date.now() - 16 * 60000).toISOString() };
  const falscherTag = { ...bindung, tag: new Date(Date.now() - 86400000).toISOString().slice(0, 10) };
  fall("Alte 15-Minuten-Bindung und anderer UTC-Tag stoppen", { alteZeit: ablehnung("alteZeit", "freigeben", job.id, alt),
    falscherTag: ablehnung("falscherTag", "freigeben", job.id, falscherTag) });

  job = seed("operator-anderer-laeuft");
  sql("select id from helmut_enqueue_job('source_fetch','fremder-lauf','synthetik','{}',now(),40::smallint,3,null);");
  const [fremd] = json("select jsonb_agg(j) from helmut_claim_quellenfaelligkeit('fremder-owner',10000,false) j;");
  A(fremd); await ablauf(job.id);
  fall("Weitere laufende fremde Lease sperrt Operator schon vor Freigabe", ablehnung("fremdeLease", "vorschau", job.id));

  job = seed("operator-erschoepfter-anderer"); await ablauf(job.id);
  sql("insert into helmut_jobs(job_type,idempotency_key,freshness_window,status,payload,attempts,max_attempts) values('document_understanding','erschoepfte-fixture','synthetik','wartend','{}',3,3);");
  fall("Anderer wartender erschoepfter Auftrag sperrt den globalen Reaper", ablehnung("erschoepft", "vorschau", job.id));

  job = seed("operator-folgeclaim"); await ablauf(job.id);
  const frei2 = ops("freigeben", job.id, ops("vorschau", job.id));
  const [folge] = json("select jsonb_agg(j) from helmut_claim_jobs('neuer-owner',1,10000,array['document_understanding']::text[]) j;");
  A.equal(folge.id, job.id); A.equal(folge.attempts, job.attempts + 1);
  fall("Nach echtem Folgeclaim ist Rueckweg gesperrt", { folge, abgelehnt: ablehnung("folgeclaim", "rueckweg", job.id, frei2) });

  job = seed("operator-ohne-deferfix"); await ablauf(job.id);
  sql(migration("rollback_" + FIX));
  bindung = ops("vorschau", job.id);
  fall("Ungepatchter Defer erlaubt keine Freigabe", ablehnung("ohneFix", "freigeben", job.id, bindung));
  const altDefer = sql("select pg_get_functiondef('public.helmut_defer_job(uuid,text,bigint,text)'::regprocedure);") + "\n";
  const kommentar = altDefer.replace("v_due timestamptz;", "v_due timestamptz; -- and j.lease_expires_at > clock_timestamp()");
  A.notEqual(kommentar, altDefer); sql(kommentar + ";");
  fall("Scheinbarer Leasefix im Kommentar umgeht den vollen Funktionshash nicht", ablehnung("KommentarDrift", "freigeben", job.id, ops("vorschau", job.id)));
  sql(altDefer + ";"); sql(migration(FIX));

  job = seed("operator-claimdrift"); await ablauf(job.id);
  const nativeClaim = bericht.claimOriginal.definition;
  const drift = nativeClaim.replace("v_now   timestamptz := now();", "v_now   timestamptz := now(); -- unbekannte Driftfixture");
  A.notEqual(drift, nativeClaim); sql(drift + ";");
  fall("Unbekannter Claimkoerper sperrt die Vorschau vor globaler Arbeit", ablehnung("ClaimDrift", "vorschau", job.id));
  sql(nativeClaim + ";");
  A.equal(sql("select count(*) from helmut_quellen_dlq;"), "0");
}
async function main() {
  A.equal(process.env.HELMUT_LOKALER_SCHUTZ, "aktiv", "Nur ueber scripts/lokal.js starten");
  A.equal(process.argv.length, 6); A.equal(process.argv[2], "--beleg"); A.equal(process.argv[4], "--claim-original");
  belegDatei = process.argv[3]; A(path.isAbsolute(belegDatei) && belegDatei.endsWith(".json") && !existsSync(belegDatei));
  A.equal(bericht.operatorSha256, SQL_SHA, "Root-Operator muss eingefrorenem Review entsprechen");
  operatorSql = readFileSync(SQL_DATEI, "utf8");
  const bytes = readFileSync(process.argv[5]), claim = JSON.parse(bytes)[0].claim_definition;
  A.equal(hash(claim), "a388e5e2f7e63d3a8c3e9c3e5352190fbe9629c98eafa4a4e98c6901d5c3c238");
  bericht.claimOriginal = { datei: process.argv[5], sha256: hash(bytes), definition: claim };
  bericht.codeCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", cwd: path.join(__dirname, "..") }).trim();
  bericht.image = { name: IMAGE, id: docker(["image", "inspect", IMAGE, "--format", "{{.Id}}"] ) };
  container = `helmut-lease-operator-${process.pid}-${randomBytes(4).toString("hex")}`; bericht.container = container;
  docker(["run", "--detach", "--pull=never", "--name", container, "--network=none", "--restart=no", "--memory=512m",
    "--tmpfs", "/var/lib/postgresql/data:rw,size=256m", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", IMAGE]); aktiv = true;
  const inspect = JSON.parse(docker(["inspect", container]))[0];
  A.equal(inspect.HostConfig.NetworkMode, "none"); A(inspect.HostConfig.Tmpfs["/var/lib/postgresql/data"]);
  A.equal(inspect.HostConfig.Memory, 512 * 1024 * 1024);
  const ende = performance.now() + 15000; let bereit = false;
  while (performance.now() < ende) {
    try {
      // Der offizielle Entrypoint betreibt zuerst einen temporaeren Initserver.
      // Erst nach exec postgres ist PID1 der endgueltige Postmaster.
      if (docker(["exec", container, "cat", "/proc/1/comm"]) === "postgres"
        && sql("select 1;", "postgres") === "1") { bereit = true; break; }
    } catch { /* Startbereitschaft */ }
    await warten(50);
  }
  A(bereit); A.match(sql("show server_version;", "postgres"), /^17\.6\b/);
  sql(`create database ${DB}; create role anon; create role authenticated; create role service_role bypassrls;`, "postgres");
  const basis = ["20260808_scalable_job_queue.sql", "20260808_jobqueue_abhaengigkeiten.sql", "20260809_jobqueue_wiedervorlage.sql",
    "20261119091317_quellenfaelligkeit_claim.sql", "20261123110000_quellen_dlq.sql", FIX];
  bericht.migrationen = Object.fromEntries(basis.map(n => [n, hash(migration(n))]));
  for (const name of basis) sql(migration(name));
  sql("alter table helmut_jobs add column last_seen_window text;"); sql(claim + ";");
  sql("create table helmut_store(id text primary key,data jsonb); create table helmut_verstehen_reservierungen(vorgang_id text primary key,zustand text,ki_aufrufe int);");
  sql("insert into helmut_store values('fixture-kosten','{\"historischeReserve\":123}'),('fixture-plan','{\"zustand\":\"fertig\"}'); insert into helmut_verstehen_reservierungen values('fixture-vorgang','unbekannt',2);");
  bericht.schutzVorwert = geschuetzt();
  await neuPruefen(); A.deepEqual(geschuetzt(), bericht.schutzVorwert); bericht.status = "PASS";
}
(async () => {
  try { await main(); } catch (error) {
    bericht.status = "FAIL"; bericht.erstfehler = String(error.stack || error);
    if (error.stderr) bericht.erstfehlerStderr = String(error.stderr);
    console.error(bericht.erstfehler); process.exitCode = 1;
  } finally {
    if (aktiv) try {
      const streams = spawnSync("docker", ["logs", container], { encoding: "utf8", timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
      A.equal(streams.status, 0); const log = "STDOUT\n" + streams.stdout + "\nSTDERR\n" + streams.stderr;
      const datei = belegDatei.replace(/\.json$/, ".postgres.log"); writeFileSync(datei, log, { flag: "wx", mode: 0o600 });
      bericht.postgresLog = { datei, sha256: hash(log) }; docker(["rm", "--force", container]);
      aktiv = false; bericht.eigeneRessourcenEntfernt = true;
    } catch (error) { bericht.cleanupFehler = String(error); bericht.status = "FAIL"; process.exitCode = 1; }
    bericht.beendet = new Date().toISOString();
    if (belegDatei) writeFileSync(belegDatei, JSON.stringify(bericht, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  }
  if (bericht.status === "PASS") console.log(`PASS ${bericht.pruefungen.length}/${bericht.pruefungen.length} ausschliesslich neue Leaseoperatorgruppen; Provideraufrufe 0`);
})().catch(error => { console.error(error); process.exitCode = 1; });
