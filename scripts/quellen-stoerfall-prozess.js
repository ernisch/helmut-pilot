"use strict";

// Gezielte neue Prozessgegenfälle. Keine Monats-/Mengenwiederholung, keine
// Quellen/Anbieter. SIGKILL ist echt; der Handler und die Scheduleruhr sind Fixtures.
// Native Leases/CAS laufen unverändert in eigener DB des benannten Network-none-
// Containers. Ein Modellstartmarker ist ausdrücklich KEIN Anbieteraufruf.
const A = require("node:assert/strict");
const { spawn, execFileSync } = require("node:child_process");
const { readFileSync, mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { once } = require("node:events");
const { setTimeout: warte } = require("node:timers/promises");
const os = require("node:os"), path = require("node:path");
const W = require("../worker"), Q = require("../lib/helmut/quellen-automatik");
const P = require("../lib/helmut/scalable-pipeline");
const ENV = { HELMUT_QUELLEN_ARBEITSFENSTER: "on", HELMUT_SOURCE_MODE: "off" };
const arg = name => process.argv[process.argv.indexOf(name) + 1];
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const kinder = new Set();
function sql(container, db, input) {
  return execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-q", "-At", "-U", "postgres",
    "-d", db, "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8", timeout: 10000,
    stdio: ["pipe", "pipe", "pipe"], maxBuffer: 4 * 1024 * 1024 }).trim();
}
function kind(args) {
  const child = spawn(process.execPath, [__filename, ...args], { cwd: path.join(__dirname, ".."),
    env: process.env, stdio: ["ignore", "pipe", "pipe", "ipc"] });
  kinder.add(child);
  child.on("exit", () => kinder.delete(child));
  child.fehler = "";
  child.stderr.on("data", chunk => { child.fehler += chunk; });
  return child;
}
async function nachricht(child) {
  const antwort = await Promise.race([
    once(child, "message").then(([m]) => m),
    once(child, "exit").then(([code, signal]) => { throw Error(`Kind beendet: ${code}/${signal} ${child.fehler}`); }),
    warte(10000, undefined, { ref: false }).then(() => { throw Error("Kind-Zeitgrenze"); })
  ]);
  A(!antwort.fehler, antwort.fehler);
  return antwort;
}
async function toete(child) {
  const ende = once(child, "exit");
  A.equal(child.kill("SIGKILL"), true);
  A.deepEqual(await ende, [null, "SIGKILL"]);
}

async function schedulerKind() {
  const [start, stop, zustandDatei] = JSON.parse(arg("--scheduler"));
  const signal = new AbortController();
  let zeit = start;
  const ereignisse = [];
  await W.betreibe({ signal: signal.signal, jetzt: () => zeit,
    lauf: async () => {
      const stand = JSON.parse(readFileSync(zustandDatei, "utf8"));
      stand.versuche.push(zeit);
      writeFileSync(zustandDatei, JSON.stringify(stand));
      if (stand.ausfall) throw Object.assign(Error("lokale Fixture"), { code: "ECONNRESET" });
      return { ok: true, arbeitsfenster: {}, verarbeitung: { erledigt: 0 } };
    }, log: text => ereignisse.push(JSON.parse(text)),
    pause: async () => {
      if (stop === "halten") {
        process.send({ zeit, ereignisse });
        await new Promise(() => {});
      } else if (zeit === start) zeit += 30000;
      else signal.abort();
    }
  });
  process.send({ ereignisse });
  process.disconnect();
}

async function leaseKind() {
  const container = arg("--container"), db = arg("--db"), phase = arg("--phase");
  const run = text => sql(container, db, text);
  const [row] = JSON.parse(run("select coalesce(jsonb_agg(j),'[]') from public.helmut_claim_quellenfaelligkeit('alter-worker',1000,false) j;"));
  A(row);
  await P.fuehreAuftragAus({ auftrag: row, besitzer: "alter-worker", leaseMs: 1000, restzeitMs: 30000,
    deps: { env: { HELMUT_SCALABLE_PIPELINE: "off" }, now: Date.now,
      handler: { source_fetch: async () => {
        const [cas] = JSON.parse(run("select jsonb_agg(r) from public.helmut_verstehen_reserviere('synthetik-prozess','fixture-hash','alter-worker',1000) r;"));
        A.equal(cas.erlaubt, true);
        if (phase === "nach-marker") {
          A.equal(run(`select public.helmut_verstehen_modellstart('synthetik-prozess','alter-worker',${cas.fencing},1000);`), "t");
        }
        process.send({ id: row.id, phase, fencing: cas.fencing });
        await new Promise(() => {});
      } },
      extendLease: async () => ({ verfuegbar: true, verlaengert: run(`select public.helmut_extend_job_lease('${row.id}','alter-worker',1000);`) === "t" }),
      finish: async () => A.fail("Der blockierte Fixturehandler darf keinen Abschluss schreiben")
    } });
}

async function automatikGrenzen() {
  const start = Date.parse("2026-11-26T05:30:00Z"), now = start + 1200000;
  for (const phase of ["vor-reservierung", "nach-slot", "nach-reservierung", "laufend"]) {
    const hatSlot = phase !== "vor-reservierung", hatFenster = ["nach-reservierung", "laufend"].includes(phase);
    let weitereLesungen = 0;
    const result = await Q.pruefe({ env: ENV, now: () => now, deps: {
      leseLaeufe: async o => phase === "laufend" && o.process === "warteschlange-crawl"
        ? [{ runId: "synthetik-prozess", process: o.process, startedAt: new Date(start).toISOString(), status: "running" }] : [],
      request: async () => [ ...(hatSlot ? [{ schluessel: "quellenarbeit|slot|05:30", verbraucht: 1 }] : []),
        ...(hatFenster ? [{ schluessel: "quellenarbeit|fenster", verbraucht: 1 }] : []) ],
      journal: { lesen: async () => { weitereLesungen++; return null; } }
    } });
    A.equal(result.erlaubt, phase === "vor-reservierung");
    A.equal(result.grund, phase === "vor-reservierung" ? "automatik-erster-start" : "automatik-unbekannt");
    A.equal(weitereLesungen, phase === "vor-reservierung" ? 1 : 0);
  }
}

async function schedulerGrenzen() {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "helmut-prozess-"));
  try {
    const state = path.join(tmp, "zustand.json");
    for (const grenze of ["2026-11-26T06:30:00Z", "2026-06-26T05:30:00Z"]) {
      const frist = Date.parse(grenze);
      writeFileSync(state, JSON.stringify({ versuche: [], ausfall: false }));
      // Echter Prozessabbruch eine Sekunde vor 07:30 Berlin: keine Quellenarbeit.
      const vorher = kind(["--scheduler", JSON.stringify([frist - 1000, "halten", state])]);
      A.equal((await nachricht(vorher)).ereignisse.length, 0);
      await toete(vorher);
      A.equal(JSON.parse(readFileSync(state)).versuche.length, 0);
      // Frischer Prozess bei 07:30: Scheduler öffnet den zulässigen Slot.
      const danach = kind(["--scheduler", JSON.stringify([frist, "fertig", state])]);
      const fertig = once(danach, "exit");
      A.equal((await nachricht(danach)).ereignisse.length, 1);
      A.deepEqual(await fertig, [0, null]);
      A.deepEqual(JSON.parse(readFileSync(state)).versuche, [frist]);
      // Ein Fehler direkt im neuen Slot verursacht keinen zweiten Versuch darin.
      writeFileSync(state, JSON.stringify({ versuche: [], ausfall: true }));
      const ausfall = kind(["--scheduler", JSON.stringify([frist, "fertig", state])]);
      const ende = once(ausfall, "exit"), result = await nachricht(ausfall);
      A.deepEqual(await ende, [0, null]);
      A.deepEqual(result.ereignisse, [{ dienst: "quellenworker", ereignis: "quellenfenster-fehler", fehlerklasse: "ECONNRESET" }]);
      A.deepEqual(JSON.parse(readFileSync(state)).versuche, [frist]);
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

async function nativeLeases() {
  const container = arg("--container");
  A.equal(container, "helmut-pflichtanalyse-20261126", "Expliziter isolierter Container erforderlich");
  const inspect = JSON.parse(execFileSync("docker", ["inspect", container], { encoding: "utf8" }))[0];
  A.equal(inspect.HostConfig.NetworkMode, "none");
  A.match(inspect.Config.Image, /^postgres:17\.6-/);
  A(inspect.HostConfig.Tmpfs?.["/var/lib/postgresql/data"]);
  const db = "helmut_prozess_" + process.pid, run = text => sql(container, db, text);
  sql(container, "postgres", `create database ${db};`);
  try {
    sql(container, "postgres", "do $$ begin create role anon; exception when duplicate_object then null; end $$; do $$ begin create role authenticated; exception when duplicate_object then null; end $$; do $$ begin create role service_role; exception when duplicate_object then null; end $$;");
    for (const name of ["20260808_scalable_job_queue.sql", "20261119091317_quellenfaelligkeit_claim.sql"])
      run(readFileSync(path.join(__dirname, "../supabase/migrations", name), "utf8"));
    // Minimale KO-Hülle nur für die unveränderte native CAS-Funktion. Keine
    // Artikel-/Profil-/Ergebnisattrappe wird als fachliches Resultat gespeichert.
    run("create table knowledge_objects(id text primary key,vorgang_id text);");
    run(readFileSync(path.join(__dirname, "../supabase/migrations/20260814180000_verstehen_cas.sql"), "utf8"));
    A.equal(run("select md5(prosrc) from pg_proc where oid='public.helmut_claim_quellenfaelligkeit(text,bigint,boolean)'::regprocedure;"), "6a88011286ac4a1beae5ac5fc10f0e8d");
    for (const phase of ["vor-marker", "nach-marker"]) {
      run("truncate helmut_jobs,helmut_verstehen_reservierungen;");
      run(`select id from public.helmut_enqueue_job('source_fetch',${quote(phase)},'fixture','{}',now(),40::smallint,3,null);`);
      const child = kind(["--lease-child", "--container", container, "--db", db, "--phase", phase]);
      const marker = await nachricht(child);
      A.equal(marker.phase, phase);
      A.equal(run("select count(*) from public.helmut_claim_quellenfaelligkeit('zu-frueh',1000,false);"), "0");
      await toete(child);
      A.equal(run("select status from helmut_jobs;"), "laeuft");
      // Natürlicher Ablauf, keine SQL-Verkürzung einer Lease und kein Zurücksetzen.
      const deadline = performance.now() + 4000;
      while (run("select lease_expires_at<now() from helmut_jobs;") !== "t") {
        A(performance.now() < deadline, "Lease läuft nicht regulär ab");
        await warte(40);
      }
      const [neu] = JSON.parse(run("select jsonb_agg(j) from public.helmut_claim_quellenfaelligkeit('neuer-worker',1000,false) j;"));
      A.equal(neu.id, marker.id); A.equal(neu.attempts, 2); A.equal(neu.lease_owner, "neuer-worker");
      A.equal(run(`select uebernommen from public.helmut_finish_job('${marker.id}','alter-worker',true);`), "f");
      A.equal(run(`select public.helmut_extend_job_lease('${marker.id}','alter-worker',1000);`), "f");
      const [cas] = JSON.parse(run("select jsonb_agg(r) from public.helmut_verstehen_reserviere('synthetik-prozess','fixture-hash','neuer-worker',1000) r;"));
      if (phase === "vor-marker") {
        A.equal(cas.erlaubt, true); A.equal(cas.fencing, marker.fencing + 1);
        A.equal(run("select ki_aufrufe from helmut_verstehen_reservierungen;"), "0");
      } else {
        A.equal(cas.erlaubt, false); A.equal(cas.grund, "ausgang-unbekannt");
        A.equal(run("select zustand||'|'||ki_aufrufe from helmut_verstehen_reservierungen;"), "unbekannt|1");
        A.equal(run(`select public.helmut_verstehen_modellstart('synthetik-prozess','neuer-worker',${marker.fencing},1000);`), "f");
      }
      A.equal(run("select count(*) from knowledge_objects;"), "0");
      console.log(`PASS SIGKILL ${phase}: native Leaseübernahme, alter Besitzer gesperrt, CAS ${cas.grund}`);
    }
  } finally {
    for (const child of kinder) { child.kill("SIGKILL"); await once(child, "exit").catch(() => {}); }
    sql(container, "postgres", `drop database ${db} with (force);`);
  }
}

async function main() {
  A.equal(process.env.HELMUT_LOKALER_SCHUTZ, "aktiv", "Nur über scripts/lokal.js starten");
  await automatikGrenzen(); console.log("PASS vier persistierte Crashphasen: sichere Erstfreigabe oder sichtbares UNKNOWN");
  await schedulerGrenzen(); console.log("PASS echte Scheduler-Neustarts vor/bei 07:30 Berlin im Sommer/Winter; Fehler ohne Wiederholung im selben Prozessslot");
  await nativeLeases();
  A.match(readFileSync(path.join(__dirname, "../compose.yaml"), "utf8"), /^\s+restart: unless-stopped$/m);
  console.log("PASS 4/4 gezielte Prozessgruppen; Compose-Neustartpolicy gelesen, Docker-/Hostneustart und Versorgung bis 07:30 nicht bewiesen; null Anbieteraufrufe");
}
(async () => {
  if (process.argv.includes("--scheduler")) await schedulerKind();
  else if (process.argv.includes("--lease-child")) await leaseKind();
  else await main();
})().catch(error => {
  if (process.send) process.send({ fehler: String(error.stack || error) });
  console.error(error);
  for (const child of kinder) child.kill("SIGKILL");
  process.exitCode = 1;
  process.disconnect?.();
});
