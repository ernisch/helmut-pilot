"use strict";

// Expliziter lokaler RPC-Pruefer, kein Offline-Sammeltest. Ein eigener neuer
// Network-none-Container mit tmpfs; keine anderen Container, Quellen oder Modelle.
// Der bekannte Altfehler wird zweimal nativ aufgezeichnet, nicht als Schutz-PASS.
const A = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const { readFileSync, writeFileSync, existsSync } = require("node:fs");
const { createHash, randomBytes } = require("node:crypto");
const { setTimeout: warten } = require("node:timers/promises");
const path = require("node:path");
const IMAGE = "postgres:17.6-bookworm", DB = "helmut_defer_lease";
const MIGRATION = "20261126132654_job_defer_leaseablauf.sql";
const ALT = "1523a1c55ff92dfe810908f51dbca1f8deb4d2d1c4d0326eecdcaff4a262fb93";
const NEU = "6af2bcdb614ef003f8aa612bc58cd8cc17c65e8035512daef345631c541be434";
const signatur = "public.helmut_defer_job(uuid,text,bigint,text)";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const quote = text => "'" + String(text).replaceAll("'", "''") + "'";
const bericht = { version: 1, status: "RUNNING", codeCommit: "", dateiSha256: hash(readFileSync(__filename)),
  gestartet: new Date().toISOString(), befehl: [process.execPath, ...process.argv.slice(1)], altFehler: [], pruefungen: [],
  providerAufrufe: 0, productionAktionen: 0, grenzen: [
    "Native RPCs in eigenem lokalem PostgreSQL17.6, keine Supabase-/PostgREST-Probe.",
    "Natuerlicher Ablauf einsekuendiger Testleases; keine SQL-Verkuerzung der Lease.",
    "Keine CAS-/Kosten-/Original-/Morgenverarbeitung; keine Productionmigration."
  ] };
let container, aktiv = false, belegDatei;
function docker(args, options = {}) {
  return execFileSync("docker", args, { encoding: "utf8", timeout: 20000, maxBuffer: 4 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"], ...options }).trim();
}
function sql(input, db = DB) {
  return docker(["exec", "-i", container, "psql", "-X", "-q", "-At", "-U", "postgres", "-d", db,
    "-v", "ON_ERROR_STOP=1"], { input });
}
const migration = name => readFileSync(path.join(__dirname, "../supabase/migrations", name), "utf8");
function json(input) { return JSON.parse(sql(input)); }
function funktion() {
  return json(`select jsonb_build_object('oid',p.oid,'definition',pg_get_functiondef(p.oid),
    'sha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),
    'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'invoker',not p.prosecdef,
    'searchPath',p.proconfig,'rollen',(select jsonb_object_agg(r.rolname,has_function_privilege(r.oid,p.oid,'execute'))
      from pg_roles r where rolname in ('anon','authenticated','service_role','postgres')))
    from pg_proc p where p.oid=${quote(signatur)}::regprocedure;`);
}
function identitaet(f) { const { definition, sha256, ...meta } = f; return meta; }
function fall(name, details) { bericht.pruefungen.push({ name, ...details }); console.log("PASS " + name); }
function zeile(id) { return json(`select to_jsonb(j) from helmut_jobs j where id=${quote(id)};`); }
function seed(name, leaseMs = 1000) {
  sql("truncate public.helmut_jobs,public.helmut_quellen_dlq;");
  const id = sql(`select id from public.helmut_enqueue_job('source_fetch',${quote(name)},'synthetik-defer','{}',now(),40::smallint,3,null);`);
  const [row] = json(`select jsonb_agg(j) from public.helmut_claim_quellenfaelligkeit('eigener-owner',${leaseMs},false) j;`);
  A.equal(row.id, id); A.equal(row.attempts, 1); return row;
}
async function ablauf(id) {
  const ende = performance.now() + 5000;
  while (performance.now() < ende) {
    if (sql(`select lease_expires_at<clock_timestamp() from helmut_jobs where id=${quote(id)};`) === "t") return;
    await warten(35);
  }
  throw Error("Testlease nicht natuerlich abgelaufen");
}
function defer(id, owner = "eigener-owner", grund = "fixture-warten") {
  return json(`select to_jsonb(r) from public.helmut_defer_job(${quote(id)},${quote(owner)},60000,${quote(grund)}) r;`);
}
function transaktionsfall(row) {
  const daten = sql(`begin;
    select jsonb_build_object('beginn',now(),'leaseBis',${quote(row.lease_expires_at)}::timestamptz,
      'beginnVorLease',clock_timestamp()<${quote(row.lease_expires_at)}::timestamptz);
    select pg_sleep(1.2);
    select jsonb_build_object('nowNochVorLease',now()<${quote(row.lease_expires_at)}::timestamptz,
      'clockNachLease',clock_timestamp()>${quote(row.lease_expires_at)}::timestamptz,
      'defer',(select to_jsonb(r) from public.helmut_defer_job(${quote(row.id)},'eigener-owner',60000,'tx-fixture') r));
    commit;`).split("\n").filter(x => x.startsWith("{")).map(JSON.parse);
  A.equal(daten.length, 2); A.equal(daten[0].beginnVorLease, true);
  A.equal(daten[1].nowNochVorLease, true); A.equal(daten[1].clockNachLease, true);
  return daten;
}
async function originalFehler() {
  let row = seed("alt-abgelaufen"); await ablauf(row.id);
  let vor = zeile(row.id), antwort = defer(row.id), nach = zeile(row.id);
  A.equal(antwort.uebernommen, true); A.equal(nach.status, "wartend"); A.equal(nach.attempts, vor.attempts - 1);
  bericht.altFehler.push({ status: "FAIL", fall: "Abgelaufener eigener Owner ohne Nachfolger", erwartet: false, tatsaechlich: antwort, vor, nach });
  console.log("ALT FAIL 1/2: abgelaufener Owner durfte Auftrag aendern und Versuch dekrementieren");
  row = seed("alt-transaktion"); vor = zeile(row.id);
  const daten = transaktionsfall(row); nach = zeile(row.id);
  A.equal(daten[1].defer.uebernommen, true); A.equal(nach.attempts, vor.attempts - 1);
  bericht.altFehler.push({ status: "FAIL", fall: "Transaktion vor Ablauf, Defer nach Ablauf", erwartet: false,
    tatsaechlich: daten, vor, nach });
  writeFileSync(belegDatei.replace(/\.json$/, ".alt-fail.json"), JSON.stringify({ status: "FAIL", erwartetAltFehler: 2,
    originalDefinition: bericht.originalFunktionen, fehler: bericht.altFehler }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log("ALT FAIL 2/2: alte Transaktion durfte nach Leaseablauf vertagen");
}
async function schutzfaelle(fortsetzen) {
  let row, vor, antwort, nach;
  if (!fortsetzen) {
  row = seed("neu-abgelaufen"); await ablauf(row.id);
  vor = zeile(row.id); antwort = defer(row.id); nach = zeile(row.id);
  A.equal(antwort.uebernommen, false); A.equal(antwort.neue_faelligkeit, null); A.deepEqual(nach, vor);
  fall("Abgelaufener eigener Owner ohne Nachfolger abgewiesen, voller Vorwert identisch", { vor, antwort, nach });
  row = seed("neu-gueltig", 10000); vor = zeile(row.id); antwort = defer(row.id); nach = zeile(row.id);
  A.equal(antwort.uebernommen, true); A.equal(nach.status, "wartend"); A.equal(nach.attempts, 0);
  A.equal(nach.lease_owner, null); A.equal(nach.lease_expires_at, null); A.equal(nach.last_error, "zurueckgestellt: fixture-warten");
  const { status, attempts, lease_owner, lease_expires_at, due_at, last_error, updated_at, ...stabil } = nach;
  const { status: s, attempts: a, lease_owner: o, lease_expires_at: e, due_at: d, last_error: g, updated_at: u, ...vorStabil } = vor;
  A.deepEqual(stabil, vorStabil); A(Date.parse(due_at) > Date.parse(vor.lease_expires_at));
  const doppelt = defer(row.id); A.equal(doppelt.uebernommen, false); A.deepEqual(zeile(row.id), nach);
  fall("Gueltiger Owner vertagt einmal ohne Fehlversuch; Wiederholung dekrementiert nicht erneut", { vor, antwort, nach, doppelt });
  row = seed("neu-fremd", 10000); vor = zeile(row.id); antwort = defer(row.id, "fremder-owner");
  A.equal(antwort.uebernommen, false); A.deepEqual(zeile(row.id), vor);
  fall("Fremder Owner trotz gueltiger Lease abgewiesen", { vor, antwort });
  row = seed("neu-transaktion"); vor = zeile(row.id);
  const daten = transaktionsfall(row); A.equal(daten[1].defer.uebernommen, false); A.deepEqual(zeile(row.id), vor);
  fall("clock_timestamp sperrt nach Ablauf auch bei altem Transaktions-now", { vor, daten, nach: zeile(row.id) });
  row = seed("neu-nachfolger"); await ablauf(row.id);
  const [neu] = json("select jsonb_agg(j) from helmut_claim_quellenfaelligkeit('nachfolger',10000,false) j;");
  A.equal(neu.id, row.id); A.equal(neu.attempts, 2); vor = zeile(row.id); antwort = defer(row.id);
  A.equal(antwort.uebernommen, false); A.deepEqual(zeile(row.id), vor);
  const erlaubt = defer(row.id, "nachfolger"); A.equal(erlaubt.uebernommen, true); A.equal(zeile(row.id).attempts, 1);
  fall("Nachfolger uebernimmt natuerlich; alter Owner gesperrt und nur Nachfolger darf vertagen", { vor, alterOwner: antwort, nachfolger: erlaubt, nach: zeile(row.id) });
  }
  row = seed("neu-reaper-ohne-claim"); await ablauf(row.id); vor = zeile(row.id);
  const reaper = json("select coalesce(jsonb_agg(j),'[]') from public.helmut_claim_jobs('reaper-ohne-claim',0,1000,array[]::text[]) j;");
  nach = zeile(row.id); A.deepEqual(reaper, []);
  A.equal(nach.status, "wartend"); A.equal(nach.lease_owner, null); A.equal(nach.lease_expires_at, null);
  // Der unveraenderte helmut_jobs_kappen-Trigger aktualisiert jede echte
  // Zeilenmutation technisch. Diese Zeit ist kein fachlicher Belegverlust.
  const stabilReaper = x => { const { status, lease_owner, lease_expires_at, updated_at, ...rest } = x; return rest; };
  A.deepEqual(stabilReaper(nach), stabilReaper(vor));
  A(Date.parse(nach.updated_at) >= Date.parse(vor.updated_at));
  A.equal(sql("select count(*)||'|'||count(*) filter(where status='wartend') from helmut_jobs;"), "1|1");
  fall("Aktueller nativer Reaper mit p_limit0 und leeren Typen gibt keine Jobs aus und erhaelt Versuch/Belege", { vor, reaper, nach });
}
function erwartetDrift(text, label) {
  const vorher = funktion(); let fehler;
  try { sql(text); } catch (error) { fehler = String(error.stderr || error); }
  A(fehler && /defer-leaseablauf:/.test(fehler)); A.deepEqual(funktion(), vorher);
  fall(label, { funktionSha256: vorher.sha256, fehler });
}
async function main() {
  A.equal(process.env.HELMUT_LOKALER_SCHUTZ, "aktiv", "Nur ueber scripts/lokal.js starten");
  A([8, 10].includes(process.argv.length)); A.equal(process.argv[2], "--beleg"); A.equal(process.argv[4], "--original");
  A.equal(process.argv[6], "--claim-original");
  const fortsetzen = process.argv.length === 10;
  if (fortsetzen) {
    A.equal(process.argv[8], "--fortsetzen-vorbeleg");
    const datei = process.argv[9], bytes = readFileSync(datei), alt = JSON.parse(bytes);
    A.equal(alt.status, "FAIL"); A.equal(alt.pruefungen.length, 6); A.equal(alt.altFehler.length, 2);
    A.equal(alt.dateiSha256, "4ea7425c812e350db74b752f5d0c786ed40930476e617669b81acf1de6da65c9");
    A.match(alt.erstfehler, /updated_at/);
    bericht.fortsetzungAus = { datei, sha256: hash(bytes), status: alt.status,
      grueneDefergruppenUebernommen: 6, altFailBelegeUebernommen: 2,
      grund: "Nur technischer updated_at-Trigger im neuen Reapervergleich falsch angenommen; gruene Defergruppen bleiben unberuehrt." };
  }
  belegDatei = process.argv[3]; const originalPfad = process.argv[5];
  A(path.isAbsolute(belegDatei) && belegDatei.endsWith(".json") && !existsSync(belegDatei));
  A(path.isAbsolute(originalPfad));
  const originalBytes = readFileSync(originalPfad), originale = JSON.parse(originalBytes);
  A.equal(hash(originale.find(x => x.proname === "helmut_defer_job").definition), ALT);
  bericht.originalQuelle = { datei: originalPfad, sha256: hash(originalBytes) };
  const claimPfad = process.argv[7]; A(path.isAbsolute(claimPfad));
  const claimBytes = readFileSync(claimPfad), claim = JSON.parse(claimBytes)[0];
  A.equal(typeof claim.claim_definition, "string"); A.match(claim.claim_definition, /if v_limit = 0 then return; end if;/);
  bericht.claimOriginal = { datei: claimPfad, sha256: hash(claimBytes), definition: claim.claim_definition,
    definitionSha256: hash(claim.claim_definition) };
  bericht.codeCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", cwd: path.join(__dirname, "..") }).trim();
  bericht.image = { name: IMAGE, id: docker(["image", "inspect", IMAGE, "--format", "{{.Id}}"] ) };
  container = `helmut-defer-lease-${process.pid}-${randomBytes(4).toString("hex")}`; bericht.container = container;
  docker(["run", "--detach", "--pull=never", "--name", container, "--network=none", "--restart=no", "--memory=512m",
    "--tmpfs", "/var/lib/postgresql/data:rw,size=256m", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", IMAGE]); aktiv = true;
  const inspect = JSON.parse(docker(["inspect", container]))[0];
  A.equal(inspect.HostConfig.NetworkMode, "none"); A(inspect.HostConfig.Tmpfs["/var/lib/postgresql/data"]);
  A.equal(inspect.HostConfig.Memory, 512 * 1024 * 1024);
  const ende = performance.now() + 15000; let bereit = false;
  while (performance.now() < ende) {
    try { if (sql("select 1;", "postgres") === "1") { bereit = true; break; } } catch { /* nur Startbereitschaft */ }
    await warten(50);
  }
  A(bereit); A.match(sql("show server_version;", "postgres"), /^17\.6\b/);
  sql(`create database ${DB}; create role anon; create role authenticated; create role service_role bypassrls;`, "postgres");
  const basis = ["20260808_scalable_job_queue.sql", "20260808_jobqueue_abhaengigkeiten.sql", "20260809_jobqueue_wiedervorlage.sql",
    "20261119091317_quellenfaelligkeit_claim.sql", "20261123110000_quellen_dlq.sql"];
  bericht.migrationen = Object.fromEntries([...basis, MIGRATION, "rollback_" + MIGRATION].map(n => [n, hash(migration(n))]));
  for (const name of basis) sql(migration(name));
  // Nur Fixture-Schemaangleichung fuer den tatsaechlich gelesenen Tagesclaim;
  // keine historischen Migrationskoerper kopieren oder normalisieren.
  sql("alter table public.helmut_jobs add column last_seen_window text;");
  sql(claim.claim_definition + ";");
  A.equal(sql("select pg_get_functiondef('public.helmut_claim_jobs(text,integer,bigint,text[])'::regprocedure);") + "\n", claim.claim_definition);
  bericht.originalFunktionen = {};
  for (const r of originale) {
    const sig = r.proname === "helmut_defer_job" ? signatur : r.proname === "helmut_finish_job"
      ? "public.helmut_finish_job(uuid,text,boolean,text,bigint)" : "public.helmut_extend_job_lease(uuid,text,bigint)";
    const definition = sql(`select pg_get_functiondef(${quote(sig)}::regprocedure);`) + "\n";
    A.equal(definition, r.definition, "Native Funktion muss dem frischen Production-Original entsprechen");
    bericht.originalFunktionen[r.proname] = { sha256: hash(definition), definition };
  }
  const vor = funktion(); A.equal(vor.sha256, ALT); A.equal(vor.invoker, true);
  A.deepEqual(vor.rollen, { anon: false, authenticated: false, service_role: true, postgres: true });
  if (!fortsetzen) await originalFehler();
  sql(migration(MIGRATION)); const nach = funktion(); A.equal(nach.sha256, NEU); A.deepEqual(identitaet(nach), identitaet(vor));
  bericht.nachMigration = nach;
  if (!fortsetzen) fall("Nur Leasepraedikat geaendert; OID, Signatur, Invoker und Rollen unveraendert", { vorher: vor, nachher: nach });
  await schutzfaelle(fortsetzen);
  const drift = nach.definition.replace("v_due timestamptz;", "v_due timestamptz; -- isolierte Driftfixture");
  A.notEqual(drift, nach.definition); sql(drift + ";");
  erwartetDrift(migration(MIGRATION), "Vorwaertsmigration stoppt vor DDL bei unbekannter Funktion");
  erwartetDrift(migration("rollback_" + MIGRATION), "Rueckweg stoppt bei unbekannter Nachfassung");
  sql(nach.definition + ";"); sql(migration("rollback_" + MIGRATION));
  const zurueck = funktion(); A.equal(zurueck.sha256, ALT); A.deepEqual(identitaet(zurueck), identitaet(vor));
  sql(migration(MIGRATION)); const wieder = funktion(); A.equal(wieder.sha256, NEU); A.deepEqual(identitaet(wieder), identitaet(vor));
  A.equal(sql("select count(*) from helmut_quellen_dlq;"), "0");
  fall("Rueckweg stellt exakten Altkoerper her; Wiederanwendung exakt und keine DLQ-Mutation", { zurueck, wieder });
  bericht.status = "PASS";
}
(async () => {
  try { await main(); } catch (error) {
    bericht.status = "FAIL"; bericht.erstfehler = String(error.stack || error);
    if (error.stderr) bericht.erstfehlerStderr = String(error.stderr);
    console.error(bericht.erstfehler); process.exitCode = 1;
  } finally {
    if (aktiv) {
      try {
        const streams = spawnSync("docker", ["logs", container], { encoding: "utf8", timeout: 10000,
          maxBuffer: 4 * 1024 * 1024 });
        A.equal(streams.status, 0);
        const log = "STDOUT\n" + streams.stdout + "\nSTDERR\n" + streams.stderr;
        const datei = belegDatei.replace(/\.json$/, ".postgres.log");
        writeFileSync(datei, log, { flag: "wx", mode: 0o600 }); bericht.postgresLog = { datei, sha256: hash(log) };
        docker(["rm", "--force", container]); aktiv = false; bericht.eigeneRessourcenEntfernt = true;
      } catch (error) { bericht.cleanupFehler = String(error); bericht.status = "FAIL"; process.exitCode = 1; }
    }
    bericht.beendet = new Date().toISOString();
    if (belegDatei) writeFileSync(belegDatei, JSON.stringify(bericht, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  }
  if (bericht.status === "PASS") console.log(`PASS ${bericht.pruefungen.length}/${bericht.pruefungen.length} neue native Schutzgruppen; ${bericht.fortsetzungAus ? "sechs gruene Defergruppen und zwei ALT-FAILs aus Vorbeleg uebernommen, nicht wiederholt" : "ALT FAIL 2/2 erhalten"}; Provideraufrufe 0`);
})().catch(error => { console.error(error); process.exitCode = 1; });
