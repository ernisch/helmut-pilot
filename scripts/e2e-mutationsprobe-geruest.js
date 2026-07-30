"use strict";

// Gemeinsamer TECHNISCHER Unterbau der E2E-Mutationsproben (26A Berlin, 27A Brandenburg).
// =============================================================================
// Ein gruener Vertrag beweist nichts, solange nicht gezeigt ist, dass er auch ROT
// werden kann. Eine Mutationsprobe nimmt zentrale Garantien einzeln zurueck und
// prueft, dass die jeweilige Suite jede Ruecknahme bemerkt.
//
// ARBEITSWEISE (Konvention wie geografie-mutationsprobe.js): die Arbeitskopie des
// Repos wird NICHT angefasst — fuer jede Mutation entsteht ein vollstaendiger Abzug
// in einem temporaeren Verzeichnis; mutiert und ausgefuehrt wird ausschliesslich dort.
// Exit 0 nur, wenn JEDE Mutation die Suite rot macht. Ein nicht gefundener oder
// mehrdeutiger Ankertext beendet die Probe mit Exit 2 (veraltete Probe, keine Aussage).
//
// Die MUTATIONEN selbst (welche Garantie, welcher Anker, welche Ruecknahme) bleiben
// landes-/suitespezifisch in den aufrufenden Probedateien.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");

// Dateien, die jede E2E-Vertragssuite zusaetzlich zum lib/-Baum braucht.
// helmut-flags.json wird von lib/helmut/flags.js gelesen (Datei-Flags) — mitkopieren,
// damit der Abzug dieselben Default-AUS-Flags sieht wie das Repo. Das gemeinsame
// Testgeruest wird von beiden Vertragssuiten per require("./e2e-vertrag-geruest") geladen.
const GETEILTE_SCRIPTDATEIEN = ["e2e-vertrag-geruest.js"];

function kopiereVerzeichnis(quelle, ziel) {
  fs.mkdirSync(ziel, { recursive: true });
  for (const eintrag of fs.readdirSync(quelle, { withFileTypes: true })) {
    const q = path.join(quelle, eintrag.name);
    const z = path.join(ziel, eintrag.name);
    if (eintrag.isDirectory()) kopiereVerzeichnis(q, z);
    else if (eintrag.isFile()) fs.copyFileSync(q, z);
  }
}

function baueAbzug(suite) {
  const basis = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-e2e-mutation-"));
  kopiereVerzeichnis(path.join(ROOT, "lib"), path.join(basis, "lib"));
  kopiereVerzeichnis(path.join(ROOT, "test", "fixtures", "pardok"), path.join(basis, "test", "fixtures", "pardok"));
  fs.mkdirSync(path.join(basis, "scripts"), { recursive: true });
  for (const datei of [suite, ...GETEILTE_SCRIPTDATEIEN]) {
    fs.copyFileSync(path.join(ROOT, "scripts", datei), path.join(basis, "scripts", datei));
  }
  for (const datei of ["helmut-flags.json"]) {
    const q = path.join(ROOT, datei);
    if (fs.existsSync(q)) fs.copyFileSync(q, path.join(basis, datei));
  }
  return basis;
}

function fuehreSuiteAus(basis, suite) {
  const ergebnis = spawnSync(process.execPath, [path.join(basis, "scripts", suite)], {
    cwd: basis, encoding: "utf8", timeout: 180000,
    env: { ...process.env, SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", HELMUT_V3_STORE: "" }
  });
  const text = `${ergebnis.stdout || ""}${ergebnis.stderr || ""}`;
  const rot = (text.match(/^FAIL /gm) || []).length;
  return { status: ergebnis.status, rot, text };
}

// mutationen: [{ name, beschreibung, datei, von, nach }] — jede Mutation nimmt GENAU EINE
// Garantie zurueck; `von` muss in `datei` genau einmal vorkommen.
function fuehreMutationsprobe({ titel, suite, mutationen }) {
  const verbose = process.argv.includes("--verbose");

  const referenz = baueAbzug(suite);
  const rLauf = fuehreSuiteAus(referenz, suite);
  fs.rmSync(referenz, { recursive: true, force: true });
  console.log(`\n${titel} — Suite: scripts/${suite}\n`);
  console.log(`Referenzlauf (unmutiert): ${rLauf.status === 0 ? "GRUEN" : "ROT"} (${rLauf.rot} FAIL)`);
  if (rLauf.status !== 0) {
    console.error("\nAbbruch: die Suite ist schon unmutiert rot — die Probe waere ohne Aussage.");
    if (verbose) console.error(rLauf.text);
    process.exit(1);
  }

  let ueberlebt = 0;
  const zeilen = [];
  for (const m of mutationen) {
    const basis = baueAbzug(suite);
    const ziel = path.join(basis, m.datei);
    const inhalt = fs.readFileSync(ziel, "utf8");
    if (!inhalt.includes(m.von)) {
      console.error(`\n${m.name}: Ankertext nicht gefunden in ${m.datei} — die Probe ist veraltet.`);
      console.error(`  gesucht: ${m.von}`);
      fs.rmSync(basis, { recursive: true, force: true });
      process.exit(2);
    }
    if (inhalt.split(m.von).length - 1 !== 1) {
      console.error(`\n${m.name}: Ankertext ist nicht eindeutig in ${m.datei}.`);
      fs.rmSync(basis, { recursive: true, force: true });
      process.exit(2);
    }
    fs.writeFileSync(ziel, inhalt.replace(m.von, m.nach));
    const lauf = fuehreSuiteAus(basis, suite);
    fs.rmSync(basis, { recursive: true, force: true });
    const erkannt = lauf.status !== 0;
    if (!erkannt) ueberlebt += 1;
    zeilen.push({ name: m.name, erkannt, rot: lauf.rot, beschreibung: m.beschreibung });
    console.log(`${erkannt ? "ROT  " : "GRUEN"}  ${m.name}  — ${lauf.rot} Assertion(en) rot`);
    if (verbose && !erkannt) console.log(lauf.text);
  }

  console.log(`\n${mutationen.length - ueberlebt} von ${mutationen.length} Mutationen werden erkannt.`);
  for (const z of zeilen) console.log(`  ${z.erkannt ? "✓" : "✗"} ${z.name}\n      ${z.beschreibung}`);
  if (ueberlebt) {
    console.error(`\n${ueberlebt} Mutation(en) haben ueberlebt — die Garantie ist an dieser Stelle nicht durch Tests abgesichert.`);
    process.exit(1);
  }
  console.log("\nJede einzelne Ruecknahme wird von der Suite bemerkt.");
  console.log("Die Arbeitskopie des Repos wurde nicht veraendert (Mutation nur im temporaeren Abzug).");
  process.exit(0);
}

module.exports = { fuehreMutationsprobe };
