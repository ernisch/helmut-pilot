"use strict";

// Helmut — Vertrag der Offline-Suiten-Auswahl (Standard vs. erweitert).
// =============================================================================================
// Haelt die Trennung aus dem Testorganisations-Sprint vom 2026-09-23 technisch fest: die vier
// historischen Skalierungssuiten (OP-30, August 2026 — lokale Simulationen ohne
// Production-Beweis, ausdruecklich kein Abnahmekriterium) laufen NICHT mehr im kanonischen
// Standardlauf und damit nicht im Pflicht-CI-Gate. Sie bleiben unveraendert im Repo und sind
// ueber `--extended` bewusst ausfuehrbar.
//
// KEIN echter Netzzugriff und KEIN Testlauf: der Beweis fuehrt ausschliesslich `--list` des
// Runners aus (der vor dem Ausfuehren jeder Suite zurueckkehrt). Zusaetzlich sichert diese
// Suite, dass die Trennung KEINE aktuelle Absicherung verliert: 500er-, Netzschutz-,
// Security- und Mandantentrennungssuiten muessen weiter im Standardlauf stehen.
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

// Diese vier stammen aus den OP-30-Skalierungsnachweisen und sind aus dem Standardlauf
// ausgelagert (in scripts/run-offline-tests.js als HISTORISCHE_SKALIERUNG gefuehrt).
const HISTORISCH = [
  "narrativ-stress-1000-test.js",
  "narrativ-stufen-test.js",
  "skalierung-simulation-test.js",
  "skalierung-stufen-test.js"
];

// Aktuelle Absicherungen, die UNVERAENDERT im Standardlauf stehen muessen (Netzschutz,
// 500er, Security, Mandantentrennung). Faellt eine hiervon aus dem Standardlauf, ist das
// ein Sicherheitsverlust — genau davor schuetzt diese Liste.
const MUSS_STANDARD = [
  "netzschutz-test.js",
  "github-direkt500-test.js",
  "funktionstest-500-test.js",
  "kapazitaet-500-test.js",
  "testfenster-null500-test.js",
  "testkohorte-direkt500-test.js",
  "testnachweis-ziel500-test.js",
  "planung-500-durchsatz-test.js",
  "github-testfenster-500-test.js",
  "github-null500-ende-test.js",
  "github-briefingnachweis-500-test.js",
  "github-privater-inhaltsnachweis-500-test.js",
  "github-quellenkontext-500-test.js",
  "quellenvorlauf-500-test.js",
  "briefing-pruefaufnahme-500-test.js",
  "mandantentrennung-test.js",
  "cross-tenant-security-test.js",
  "p1-security-check.js",
  "security-hardening-sql-test.js"
];

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

// Eine SAUBERE Umgebung: ohne jede Production-Kennung, ohne DB-Adressen, Quellenmodus aus.
// Ohne NODE_OPTIONS, damit ein vererbter Preload-Pfad (mit Leerzeichen im Arbeitsverzeichnis)
// die Kindprozesse nicht stoert.
function sauber() {
  const env = { ...process.env };
  for (const n of S.PRODUCTION_KENNUNGEN) delete env[n];
  for (const n of [...S.DB_HOST_VARIABLEN, ...S.DB_URL_VARIABLEN]) delete env[n];
  delete env.NODE_OPTIONS;
  delete env.HELMUT_LOKALER_SCHUTZ_NUR_LADEN;
  env.HELMUT_SOURCE_MODE = "off";
  return env;
}

// Fuehrt `run-offline-tests.js --list [weitere]` aus und liefert Ausgabe und Suitenliste.
function liste(...extra) {
  const r = spawnSync(process.execPath, [RUNNER, "--list", ...extra],
    { encoding: "utf8", env: sauber(), timeout: 60000 });
  const aus = `${r.stdout || ""}\n${r.stderr || ""}`;
  // Suitenzeilen stehen ohne Einrueckung; die ausgelagerte Historie ist eingerueckt.
  const suiten = new Set(
    aus.split("\n").filter((l) => /\.js$/.test(l) && !/^\s/.test(l))
  );
  const zahl = (aus.match(/^(\d+) Offline-Suiten/gm) || []).map((m) => Number(m.split(" ")[0]));
  return { status: r.status, aus, suiten, zahl };
}

function main() {
  console.log("Helmut — Vertrag der Offline-Suiten-Auswahl (Standard vs. erweitert)\n");

  console.log("== A · Standardlauf (`--list`) ==");
  const standard = liste();
  check("A1 Der Standardlisten-Aufruf endet mit Exit 0", standard.status === 0,
    `exit ${standard.status}`);
  check("A2 Der Standardlauf enthaelt KEINE der vier historischen Skalierungssuiten",
    HISTORISCH.every((f) => !standard.suiten.has(f)),
    HISTORISCH.filter((f) => standard.suiten.has(f)).join(", ") || "keine");
  check("A3 Der Standardlauf enthaelt alle aktuellen Absicherungen",
    MUSS_STANDARD.every((f) => standard.suiten.has(f)),
    MUSS_STANDARD.filter((f) => !standard.suiten.has(f)).join(", ") || "alle");
  check("A4 Die Standardliste benennt die vier ausdruecklich als NICHT im Standardlauf",
    /NICHT im Standardlauf/.test(standard.aus) && HISTORISCH.every((f) => standard.aus.includes(f)),
    "");
  check("A5 Die Standardliste nennt ihre Groesse", standard.zahl.length === 1 && standard.zahl[0] > 0,
    `gemeldet: ${standard.zahl.join(", ") || "keine"}`);

  console.log("\n== B · Erweiterter Lauf (`--list --extended`) ==");
  const erweitert = liste("--extended");
  check("B1 Der erweiterte Listen-Aufruf endet mit Exit 0", erweitert.status === 0,
    `exit ${erweitert.status}`);
  check("B2 Der erweiterte Lauf enthaelt ALLE vier historischen Skalierungssuiten",
    HISTORISCH.every((f) => erweitert.suiten.has(f)),
    HISTORISCH.filter((f) => !erweitert.suiten.has(f)).join(", ") || "alle");
  check("B3 Der erweiterte Lauf enthaelt weiterhin alle aktuellen Absicherungen",
    MUSS_STANDARD.every((f) => erweitert.suiten.has(f)),
    MUSS_STANDARD.filter((f) => !erweitert.suiten.has(f)).join(", ") || "alle");
  check("B4 Der erweiterte Lauf ist eine Obermenge des Standardlaufs",
    [...standard.suiten].every((f) => erweitert.suiten.has(f)),
    [...standard.suiten].filter((f) => !erweitert.suiten.has(f)).join(", ") || "alle");
  const mehr = [...erweitert.suiten].filter((f) => !standard.suiten.has(f));
  check("B5 Die Differenz Standard -> erweitert ist GENAU die vier historischen Suiten",
    mehr.length === HISTORISCH.length && HISTORISCH.every((f) => mehr.includes(f)),
    mehr.join(", ") || "keine");
  check("B6 Die erweiterte Liste traegt KEINE Standard-Ausgrenzung",
    !/NICHT im Standardlauf/.test(erweitert.aus), "");
  check("B7 Der erweiterte Lauf hat genau vier Suiten mehr als der Standardlauf",
    standard.zahl.length === 1 && erweitert.zahl.length === 1
      && erweitert.zahl[0] - standard.zahl[0] === HISTORISCH.length,
    `Standard ${standard.zahl.join(",") || "?"} · erweitert ${erweitert.zahl.join(",") || "?"}`);

  console.log("\n== C · Die Suiten bleiben unveraendert im Repo erhalten ==");
  check("C1 Alle vier historischen Suiten existieren weiterhin",
    HISTORISCH.every((f) => fs.existsSync(path.join(ROOT, "scripts", f))),
    HISTORISCH.filter((f) => !fs.existsSync(path.join(ROOT, "scripts", f))).join(", ") || "alle");

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main();
