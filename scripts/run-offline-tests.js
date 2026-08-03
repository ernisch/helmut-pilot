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
//
// NETZ-GUARD (Audit-Folgebranch 2026-07): collectSuites() sammelt JEDE künftige
// *-test.js automatisch ein — der Schutz vor Netz-/Production-Zugriff bestand
// nur aus der manuell gepflegten DENYLIST oben (HELMUT_OFFLINE_TEST=1 wurde von
// keinem Modul konsumiert). Deshalb erzwingt der Runner Offline jetzt TECHNISCH:
// jede Suite läuft mit NO_NETWORK_TESTS=1 und `--require` DIESER Datei als
// Preload; der Preload patcht http/https.request/.get und global.fetch und
// BLOCKT Verbindungen zu Nicht-Localhost-Hosts mit einer klaren Fehlermeldung
// (Hard-Fail — alle bestehenden Suiten bleiben damit grün, empirisch geprüft).
// Grenzen: rohe net/tls-Sockets und Kindprozesse der Suiten werden nicht
// abgefangen; der Guard ist ein Sicherheitsnetz gegen vergessene
// DENYLIST-Einträge, kein vollständiger Egress-Filter.

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// ── Netz-Guard (Preload-Modus) ───────────────────────────────────────────────
// Diese Datei dient doppelt: als Runner (require.main === module) und — via
// `node --require scripts/run-offline-tests.js <suite>` — als Offline-Guard im
// Testprozess. So braucht der Zwang keine zweite Datei und gilt automatisch
// für jede eingesammelte Suite.
const NET_GUARD_LOCAL_HOSTS = /^(localhost|127(?:\.\d{1,3}){3}|\[?::1\]?|0\.0\.0\.0)$/i;
const NET_GUARD_MARKER = "[NETZ-GUARD]";

function netGuardHostOf(firstArg) {
  try {
    if (typeof firstArg === "string") return new URL(firstArg).hostname;
    if (firstArg instanceof URL) return firstArg.hostname;
    if (firstArg && typeof firstArg === "object") {
      // http.request(options): host darf "host:port" enthalten, hostname nicht.
      const raw = firstArg.hostname || firstArg.host || "localhost";
      return String(raw).replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
    }
  } catch { /* nicht parsebar -> nicht blocken (kein False-Positive) */ }
  return null;
}

function installNetGuard() {
  const suite = path.basename(process.argv[1] || "unbekannter-prozess");
  const deny = (host, via) => {
    const msg = `${NET_GUARD_MARKER} ${suite}: Nicht-Localhost-Verbindung blockiert (${via} -> ${host}). ` +
      "Offline-Suiten dürfen kein externes Netz nutzen — Suite in die DENYLIST von scripts/run-offline-tests.js " +
      "aufnehmen, falls sie bewusst Netz braucht (dann läuft sie NICHT im CI-Gate).";
    // Marker auch auf stderr, damit der Runner Versuche selbst dann meldet,
    // wenn eine Suite den Fehler fängt und trotzdem grün endet.
    process.stderr.write(msg + "\n");
    return new Error(msg);
  };
  for (const modName of ["http", "https"]) {
    const mod = require(modName);
    for (const fn of ["request", "get"]) {
      const orig = mod[fn];
      mod[fn] = function (...args) {
        const host = netGuardHostOf(args[0]);
        if (host && !NET_GUARD_LOCAL_HOSTS.test(host)) throw deny(host, `${modName}.${fn}`);
        return orig.apply(this, args);
      };
    }
  }
  if (typeof globalThis.fetch === "function") {
    const origFetch = globalThis.fetch;
    globalThis.fetch = function (input, init) {
      let host = null;
      try {
        const raw = (input && typeof input === "object" && !(input instanceof URL) && input.url) ? input.url : input;
        host = new URL(String(raw), "http://localhost").hostname;
      } catch { host = null; }
      if (host && !NET_GUARD_LOCAL_HOSTS.test(host)) return Promise.reject(deny(host, "fetch"));
      return origFetch.call(this, input, init);
    };
  }
}

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
  // Browser-Smoke braucht ein installiertes Chromium und hat seinen EIGENEN
  // CI-Job (ci.yml "Browser-/Mobile-Smoke"), der Playwright installiert und
  // fail-closed ist. Im Offline-Job liefe er nur als stiller SKIP mit — das
  // täuschte eine Abdeckung vor, die der andere Job wirklich erbringt.
  "browser-smoke-test.js",
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
    // Review-Fix: adversarial-gesamttest.js endet nicht auf "-test.js" und lief
    // dadurch in KEINEM CI-Pfad — der Namensfilter kennt das Muster jetzt explizit.
    .filter((f) => f.endsWith("-test.js") || f.endsWith("gesamttest.js") || f === "p1-security-check.js")
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
  const netAttempts = [];
  const started = Date.now();
  for (const suite of suites) {
    const t0 = Date.now();
    // --require dieser Datei = technischer Offline-Zwang (siehe Kopfkommentar);
    // NO_NETWORK_TESTS=1 aktiviert den Guard und steht künftig auch lib-Code
    // (z. B. ai.js/crawler.js) als Fetch-Guard-Signal zur Verfügung.
    const res = spawnSync(process.execPath, ["--require", __filename, path.join("scripts", suite)], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 180000,
      env: { ...process.env, HELMUT_OFFLINE_TEST: "1", NO_NETWORK_TESTS: "1" }
    });
    const ms = Date.now() - t0;
    // Blockierte Netz-Versuche einsammeln — auch wenn die Suite den Fehler
    // fängt und grün endet, soll der Versuch am Ende sichtbar sein.
    for (const line of `${res.stdout || ""}\n${res.stderr || ""}`.split("\n")) {
      if (line.includes(NET_GUARD_MARKER) && !netAttempts.includes(suite)) netAttempts.push(suite);
    }
    const ok = res.status === 0;
    if (!ok) {
      failed.push(suite);
      console.log(`FAIL  ${suite} (${ms}ms, exit=${res.status})`);
      const zeilen = `${res.stdout || ""}\n${res.stderr || ""}`.trim().split("\n");
      // Diagnose-Fix 2026-08-03: der Auszug "letzte 15 Zeilen" verfehlt bei langen
      // Suiten genau die Zeile, die den Fehlschlag BENENNT. Beim CI-Flackern vom
      // 03.08. (Lauf 30806535691, reset-timing-seitenkanal-test.js, "79 passed,
      // 1 failed") war aus dem Log deshalb nicht ablesbar, WELCHE der 80 Pruefungen
      // rot war — die Ursachensuche musste raten. Die FAIL-Zeilen der Suite werden
      // jetzt zusaetzlich ausgegeben (gedeckelt, damit ein Totalausfall das Log
      // nicht flutet). Das versteckt nichts und aendert kein Ergebnis.
      const eigeneFails = zeilen.filter((l) => /^\s*FAIL\b/.test(l));
      if (eigeneFails.length) {
        console.log(eigeneFails.slice(0, 20).join("\n").replace(/^/gm, "      "));
        if (eigeneFails.length > 20) console.log(`      … ${eigeneFails.length - 20} weitere FAIL-Zeilen`);
      }
      const tail = zeilen.slice(-15).join("\n");
      console.log(tail.replace(/^/gm, "      "));
    } else {
      console.log(`PASS  ${suite} (${ms}ms)`);
    }
  }

  const secs = Math.round((Date.now() - started) / 1000);
  console.log(`\n${suites.length - failed.length}/${suites.length} Suiten grün in ${secs}s`);
  if (netAttempts.length) {
    console.log(`${NET_GUARD_MARKER} Suiten mit blockierten Nicht-Localhost-Verbindungen: ${netAttempts.join(", ")}`);
  }
  if (failed.length) {
    console.log(`Fehlgeschlagen: ${failed.join(", ")}`);
    return 1;
  }
  return 0;
}

if (require.main === module) {
  process.exit(main());
} else if (process.env.NO_NETWORK_TESTS === "1") {
  // Als --require-Preload in einem Testprozess geladen -> Offline-Zwang aktiv.
  installNetGuard();
}
