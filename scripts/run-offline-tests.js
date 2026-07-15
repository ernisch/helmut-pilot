"use strict";

// Führt ALLE Offline-Testsuiten des Repos nacheinander aus und fasst das Ergebnis
// zusammen. Schließt bewusst nur aus, was Netz/Production/Live-LLM braucht.
//
// Hintergrund (Audit 2026-07): 15 von 76 Testdateien waren in keinem npm-Script
// verdrahtet und "alle Tests grün" war manuell praktisch nicht herstellbar.
// Dieser Runner ist die eine kanonische Antwort auf "läuft die Offline-Suite?"
// und wird vom CI-Gate (.github/workflows/ci.yml) bei jedem PR ausgeführt.
//
// Aufruf:  node scripts/run-offline-tests.js [--list] [--only <substring>]
// Exit-Code 0 nur, wenn jede Suite mit Exit-Code 0 endet.

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// Suiten, die NICHT offline lauffähig sind (Netz, Production-URL, Live-LLM, echte DB)
// oder die keine Tests, sondern Werkzeuge/Backfills sind.
const DENYLIST = new Set([
  "smoke-test.js", // zielt per Default auf die Production-URL
  "understanding-live-smoke.js", // echter HTTP-/LLM-Pfad
  "understanding-eval.js", // Goldset-Eval mit eigener Laufzeit/Reporting, kein PASS/FAIL-Gate
  "gate-realdata-validation.js", // braucht Production-Datenexport
  "gate-shadow-replay.js", // braucht echte DB-Snapshots
  "relational-shadow-compare.js", // Werkzeug gegen echte DB
  "shadow-ingest.js", // Werkzeug
  "shadow-pilot-crawl.js", // echter Crawl
  "pardok-structure-probe.js", // echte Parlaments-Endpunkte
  "sprint6-migration-dryrun.js", // Werkzeug gegen DB
  "sprint9b-verify-abrufwege.js", // echtes Netz
  "sprint9b-summary.js", // Reporting-Werkzeug
  "sprint10-preflight-sql.js", // erzeugt SQL, kein Test-Gate
  "understanding-gate-cost-sim.js", // Simulation/Reporting
  "watchdog-eval.js", // Werkzeug (die Test-Variante ist watchdog-eval-test.js)
  "jwt-diagnose.js", // Live-Diagnose-Werkzeug
  "jwt-endpoint-diagnose-test.js", // ruft Live-Endpunkte auf
  "lage-backfill.js",
  "presentation-backfill.js",
  "staff-backfill.js",
  "ko-classification-backfill.js",
  "generate-landesmodul-seed.js",
  "generate-source-architecture-seed.js",
  "generate-vapid-keys.js",
  "run-offline-tests.js"
]);

function collectSuites() {
  return fs
    .readdirSync(path.join(ROOT, "scripts"))
    .filter((f) => f.endsWith(".js"))
    .filter((f) => !DENYLIST.has(f))
    .filter((f) => f.endsWith("-test.js") || f === "p1-security-check.js")
    .sort();
}

function main() {
  const args = process.argv.slice(2);
  const listOnly = args.includes("--list");
  const onlyIdx = args.indexOf("--only");
  const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

  let suites = collectSuites();
  if (only) suites = suites.filter((f) => f.includes(only));

  if (listOnly) {
    suites.forEach((f) => console.log(f));
    console.log(`\n${suites.length} Offline-Suiten`);
    return 0;
  }

  const failed = [];
  const started = Date.now();
  for (const suite of suites) {
    const t0 = Date.now();
    const res = spawnSync(process.execPath, [path.join("scripts", suite)], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 180000,
      env: { ...process.env, HELMUT_OFFLINE_TEST: "1" }
    });
    const ms = Date.now() - t0;
    const ok = res.status === 0;
    if (!ok) {
      failed.push(suite);
      console.log(`FAIL  ${suite} (${ms}ms, exit=${res.status})`);
      const tail = `${res.stdout || ""}\n${res.stderr || ""}`.trim().split("\n").slice(-15).join("\n");
      console.log(tail.replace(/^/gm, "      "));
    } else {
      console.log(`PASS  ${suite} (${ms}ms)`);
    }
  }

  const secs = Math.round((Date.now() - started) / 1000);
  console.log(`\n${suites.length - failed.length}/${suites.length} Suiten grün in ${secs}s`);
  if (failed.length) {
    console.log(`Fehlgeschlagen: ${failed.join(", ")}`);
    return 1;
  }
  return 0;
}

process.exit(main());
