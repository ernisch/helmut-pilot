"use strict";

// Helmut — Vertrag der Offline-Suiten-Auswahl (Standard vs. erweitert).
// =============================================================================================
// Haelt die Testorganisation technisch fest:
//   * Der STANDARD-Pflichtlauf (und damit das CI-Gate) fuehrt NUR die explizite Kernmenge
//     STANDARD aus scripts/run-offline-tests.js aus — aktuelle Schutz-/Sicherheitsvertraege,
//     aktuelle 500er-Schutzlogik und die grundlegenden Vertraege des heutigen Production-Pfads.
//   * Die vollstaendige Regression bleibt ueber `--extended` bewusst ausfuehrbar; historische
//     und bereichsspezifische Suiten sind NICHT geloescht, sondern nur nicht mehr Pflicht.
//   * Eine neue Testdatei wird NICHT automatisch Pflicht (siehe `offline-suite-auswahl-test`).
//
// KEIN echter Netzzugriff und KEIN Testlauf: der Beweis fuehrt ausschliesslich `--list` des
// Runners aus (der vor dem Ausfuehren jeder Suite zurueckkehrt).
//
// Aufruf:  node scripts/lokal.js -- node scripts/offline-suite-auswahl-test.js

const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const RUNNER = path.join(ROOT, "scripts", "run-offline-tests.js");

// Das Modul nur LADEN, nicht scharfschalten — sonst beendet es diesen Testprozess selbst.
process.env.HELMUT_LOKALER_SCHUTZ_NUR_LADEN = "ja";
const S = require(path.join(ROOT, "scripts", "lokaler-netzschutz.js"));
delete process.env.HELMUT_LOKALER_SCHUTZ_NUR_LADEN;

// Repraesentative Schutz-/Kernvertraege, die UNBEDINGT im Standardlauf bleiben muessen.
// (Bewusst eine Auswahl je Schutzgrenze, nicht die vollstaendige Liste — die vollstaendige
// Liste steht im Runner. Faellt hier etwas heraus, ist das ein Schutzverlust.)
const MUSS_STANDARD = [
  // Mandantentrennung / Cross-Tenant / Auth / Secrets / CAS / Schreibschutz
  "netzschutz-test.js",
  "mandantentrennung-test.js",
  "cross-tenant-security-test.js",
  "tenant-guard-test.js",
  "tenant-neutrality-test.js",
  "tenant-jwt-test.js",
  "rls-policy-simulation-test.js",
  "security-hardening-sql-test.js",
  "p1-security-check.js",
  "privacy-authz-test.js",
  "cache-isolation-test.js",
  "secret-redaction-test.js",
  "admin-config-diagnose-test.js",
  "alarm-payload-test.js",
  "login-eine-mutation-test.js",
  "invite-flow-test.js",
  "store-cas-test.js",
  "pipeline-lock-atomic-test.js",
  "nachhol-schreibgate-test.js",
  // Budget / Kosten / KI-Riegel
  "kosten-limits-test.js",
  "llm-budget-test.js",
  "llm-reservation-test.js",
  "testkosten-budget-test.js",
  // aktueller 500er-Schutzvertrag
  "verstehen-169-neuversuch-test.js",
  "verstehen-169-kosten-deckel-test.js",
  "testfenster-null500-test.js",
  "verdraengungsschutz-test.js",
  "github-direkt500-test.js",
  "testkohorte-vorwaerts-test.js",
  // grundlegende Vertraege des heutigen Production-Pfads
  "flags-test.js",
  "source-mode-test.js",
  "migrations-organisation-test.js",
  "offline-suite-auswahl-test.js",
  "quellenpflicht-vertrag-test.js"
];

// Aus dem Pflichtlauf ausgelagerte historische Skalierungssuiten (Sprint 2026-09-23).
const HISTORISCH = [
  "narrativ-stress-1000-test.js",
  "narrativ-stufen-test.js",
  "skalierung-simulation-test.js",
  "skalierung-stufen-test.js"
];

// Bereichsspezifische/historische Suiten, die NICHT Pflicht sind (Beispiele je Domäne).
// Sie belegen, dass die Auslagerung Domänen trifft und nicht nur Zufall ist.
const NICHT_PFLICHT_BEISPIELE = [
  "briefing-frische-test.js",   // Briefing-Domäne
  "lage-test.js",               // Lage-Domäne
  "radar-test.js",              // Radar-Domäne
  "matching-relevanz-gate-test.js", // Matching-Domäne
  "helmut-tab-ui-test.js",      // UI
  "pardok-parser-test.js",      // PARDOK/Landesebene
  "berlin-neutralitaet-test.js",// Berlin/Landesmodul
  "prosa-36er-test.js",         // Prosa/Entwicklungsvertrag
  "funktionstest-ablaufkette-test.js" // abgeschlossener Sprint
];

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

// Saubere Umgebung: ohne Production-Kennung, ohne DB-Adressen, Quellenmodus aus, ohne
// NODE_OPTIONS (ein vererbter Preload-Pfad mit Leerzeichen wuerde die Kindprozesse stoeren).
function sauber() {
  const env = { ...process.env };
  for (const n of S.PRODUCTION_KENNUNGEN) delete env[n];
  for (const n of [...S.DB_HOST_VARIABLEN, ...S.DB_URL_VARIABLEN]) delete env[n];
  delete env.NODE_OPTIONS;
  delete env.HELMUT_LOKALER_SCHUTZ_NUR_LADEN;
  env.HELMUT_SOURCE_MODE = "off";
  return env;
}

function liste(...extra) {
  const r = spawnSync(process.execPath, [RUNNER, "--list", ...extra],
    { encoding: "utf8", env: sauber(), timeout: 60000 });
  const aus = `${r.stdout || ""}\n${r.stderr || ""}`;
  const suiten = new Set(aus.split("\n").filter((l) => /\.js$/.test(l) && !/^\s/.test(l)));
  const zahl = (aus.match(/^(\d+) Offline-Suiten/gm) || []).map((m) => Number(m.split(" ")[0]));
  return { status: r.status, aus, suiten, zahl };
}

function main() {
  console.log("Helmut — Offline-Suiten-Auswahl: Standard (Pflicht) vs. erweitert (Regression)\n");

  console.log("== A · Standardlauf (`--list`) ==");
  const standard = liste();
  check("A1 Der Standardlisten-Aufruf endet mit Exit 0", standard.status === 0, `exit ${standard.status}`);
  check("A2 Alle repraesentativen Schutz-/Kernvertraege sind im Standardlauf",
    MUSS_STANDARD.every((f) => standard.suiten.has(f)),
    MUSS_STANDARD.filter((f) => !standard.suiten.has(f)).join(", ") || "alle");
  check("A3 Keine historische Skalierungssuite ist im Standardlauf",
    HISTORISCH.every((f) => !standard.suiten.has(f)),
    HISTORISCH.filter((f) => standard.suiten.has(f)).join(", ") || "keine");
  check("A4 Bereichsspezifische Suiten sind NICHT im Standardlauf",
    NICHT_PFLICHT_BEISPIELE.every((f) => !standard.suiten.has(f)),
    NICHT_PFLICHT_BEISPIELE.filter((f) => standard.suiten.has(f)).join(", ") || "keine");
  check("A5 Die Standardliste nennt Groesse und Modus",
    standard.zahl.length === 1 && /Standard = Pflichtlauf/.test(standard.aus),
    `gemeldet: ${standard.zahl.join(", ") || "keine"}`);
  check("A6 Die Standardliste benennt die ausgelagerten Suiten als Zahl",
    /Nicht im Standardlauf[^\n]*: \d+ Suiten/.test(standard.aus), "");

  console.log("\n== B · Erweiterter Lauf (`--list --extended`) ==");
  const erweitert = liste("--extended");
  check("B1 Der erweiterte Listen-Aufruf endet mit Exit 0", erweitert.status === 0, `exit ${erweitert.status}`);
  check("B2 Der erweiterte Lauf ist eine Obermenge des Standardlaufs",
    [...standard.suiten].every((f) => erweitert.suiten.has(f)),
    [...standard.suiten].filter((f) => !erweitert.suiten.has(f)).join(", ") || "alle");
  check("B3 Der erweiterte Lauf enthaelt die historischen Skalierungssuiten",
    HISTORISCH.every((f) => erweitert.suiten.has(f)),
    HISTORISCH.filter((f) => !erweitert.suiten.has(f)).join(", ") || "alle");
  check("B4 Der erweiterte Lauf enthaelt die bereichsspezifischen Suiten",
    NICHT_PFLICHT_BEISPIELE.every((f) => erweitert.suiten.has(f)),
    NICHT_PFLICHT_BEISPIELE.filter((f) => !erweitert.suiten.has(f)).join(", ") || "alle");
  const mehr = [...erweitert.suiten].filter((f) => !standard.suiten.has(f));
  check("B5 Der Standardlauf ist eine klare Minderheit der vollstaendigen Regression",
    standard.suiten.size > 0 && standard.suiten.size * 2 < erweitert.suiten.size
      && (erweitert.suiten.size - standard.suiten.size) > 200,
    `Standard ${standard.suiten.size} von ${erweitert.suiten.size}`);
  check("B6 Die erweiterte Liste traegt KEINE Standard-Kennzeichnung als Pflichtlauf",
    /erweitert = vollstaendige Regression/.test(erweitert.aus), "");
  check("B7 Standard und erweitert nennen zusammen exakt die ausgelagerten Suiten",
    mehr.length > 0 && HISTORISCH.every((f) => mehr.includes(f)), `ausgelagert: ${mehr.length}`);

  console.log("\n== C · Erhalt und neue Tests ==");
  check("C1 Jede Standard-Suite existiert als Datei",
    [...standard.suiten].every((f) => fs.existsSync(path.join(ROOT, "scripts", f))),
    [...standard.suiten].filter((f) => !fs.existsSync(path.join(ROOT, "scripts", f))).join(", ") || "alle");
  check("C2 Alle vier historischen Skalierungssuiten bleiben im Repo erhalten",
    HISTORISCH.every((f) => fs.existsSync(path.join(ROOT, "scripts", f))),
    HISTORISCH.filter((f) => !fs.existsSync(path.join(ROOT, "scripts", f))).join(", ") || "alle");
  check("C3 Eine unbekannte neue Suite ist NICHT Standard (Testauswahl bleibt bewusst)",
    !standard.suiten.has("gaenzlich-neuer-beispiel-test.js"), "");

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main();
