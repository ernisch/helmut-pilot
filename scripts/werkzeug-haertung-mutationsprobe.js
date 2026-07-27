"use strict";

// Mutationsprobe zur Werkzeug-Haertung W-1/W-2 — sind die neuen Tests tragend?
// =============================================================================
// Ein gruener Test beweist nichts, solange nicht gezeigt ist, dass er auch ROT
// werden kann. Diese Probe nimmt die Haertung Stueck fuer Stueck zurueck und
// prueft, dass die zustaendige Suite jede Ruecknahme bemerkt.
//
// ARBEITSWEISE — die Arbeitskopie des Repos wird NICHT angefasst:
// Fuer jede Mutation entsteht ein vollstaendiger Abzug von `lib/` und den
// beteiligten `scripts/`-Dateien in einem temporaeren Verzeichnis; mutiert und
// ausgefuehrt wird ausschliesslich dort. Ein Abbruch mitten im Lauf kann keine
// mutierte Datei im Repo hinterlassen.
//
// Aufruf:  node scripts/werkzeug-haertung-mutationsprobe.js [--verbose]
// Exit 0 nur, wenn JEDE Mutation die zustaendige Suite rot macht.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const VERBOSE = process.argv.includes("--verbose");
const W1_SUITE = "werkzeug-lesefehler-test.js";
const W2_SUITE = "prozesslauf-telemetrie-test.js";

// Jede Mutation nimmt GENAU EINEN Teil der Haertung zurueck.
const MUTATIONEN = [
  // ── W-1 ────────────────────────────────────────────────────────────────────
  {
    name: "M1 · Lesefehler wieder in [] umwandeln (der Originaldefekt W-1)",
    beschreibung: "listRawDocuments faengt seinen Fehler wieder selbst und liefert [] — ein DNS-Fehler sieht wieder aus wie 'keine Dokumente'.",
    datei: "lib/helmut/storage.js",
    suite: W1_SUITE,
    von: `    console.error("[v3Store] listRawDocuments fehlgeschlagen:", error.message);
    throw new StorageReadError("raw_documents", error);`,
    nach: `    console.error("[v3Store] listRawDocuments fehlgeschlagen:", error.message);
    return [];`
  },
  {
    name: "M2 · Exit-Code bei Lesefehler wieder auf 0",
    beschreibung: "Das Werkzeug meldet den Lesefehler zwar, endet aber wieder als Erfolg — ein Cron-Wrapper saehe Gruen.",
    datei: "scripts/vorgangsbildung-nachholen.js",
    suite: W1_SUITE,
    von: "      return process.exit(6);",
    nach: "      return process.exit(0);"
  },
  {
    name: "M3 · Lesefehler wieder als 'nichts nachzuholen' behandeln",
    beschreibung: "Der Fehlerzweig ersetzt die Fehlermeldung durch leere Ergebnismengen — exakt das beobachtete Production-Verhalten.",
    datei: "scripts/vorgangsbildung-nachholen.js",
    suite: W1_SUITE,
    von: `    if (error && error.name === "StorageReadError") {`,
    nach: `    if (error && error.name === "StorageReadError") {
      [rawDocs, links, kos] = [[], [], []];
    } else if (false) {`
  },
  // ── W-2 ────────────────────────────────────────────────────────────────────
  {
    name: "M4 · atomaren relationalen Append entfernen (nur noch Blob-RMW)",
    beschreibung: "recordProcessRun schreibt wieder ausschliesslich den Lese-Aendere-Schreibe-Blob — parallele Laeufe verlieren einander.",
    datei: "lib/helmut/storage.js",
    suite: W2_SUITE,
    von: `  const fehler = [];
  let relationalGespeichert = false;
  if (relationalAktiv) {`,
    nach: `  const fehler = [];
  let relationalGespeichert = false;
  if (false && relationalAktiv) {`
  },
  {
    name: "M5 · Idempotenzschutz im Blob entfernen",
    beschreibung: "Derselbe (runId, process) wird wieder dupliziert statt ersetzt.",
    datei: "lib/helmut/storage.js",
    suite: W2_SUITE,
    von: `    const ohneSelbst = (Array.isArray(store.processRuns) ? store.processRuns : [])
      .filter((r) => !(r && r.runId === clean.runId && r.process === clean.process));`,
    nach: `    const ohneSelbst = (Array.isArray(store.processRuns) ? store.processRuns : [])
      .filter(() => true);`
  },
  {
    name: "M6 · Telemetriefehler wieder als Erfolg melden",
    beschreibung: "ok haengt nicht mehr am kanonischen Speicherpfad — ein kompletter Telemetrieausfall meldet wieder Gruen (und das Werkzeug verliert seinen Exit 7).",
    datei: "lib/helmut/storage.js",
    suite: W2_SUITE,
    von: "  const ok = relationalAktiv ? relationalGespeichert : blobGespeichert;",
    nach: "  const ok = true;"
  },
  {
    name: "M7 · Telemetriefehler wieder still verschlucken (kein Log, kein systemError)",
    beschreibung: "Die strukturierte TELEMETRIEFEHLER-Meldung entfaellt — der Fehler ist nur noch im Rueckgabewert sichtbar, nirgends im Betrieb.",
    datei: "lib/helmut/storage.js",
    suite: W2_SUITE,
    von: "  if (fehler.length) await meldeProcessRunTelemetrieFehler(clean, fehler);",
    nach: "  if (false) await meldeProcessRunTelemetrieFehler(clean, fehler);"
  },
  {
    name: "M8 · Status-Kanonisierung entfernen ('ok' geht wieder roh Richtung Tabelle)",
    beschreibung: "Der historische Blob-Status wird nicht mehr abgebildet — jede Zeile liefe in den CHECK-Constraint.",
    datei: "lib/helmut/blob-relational.js",
    suite: W2_SUITE,
    von: `  if (s === "ok") return "success";`,
    nach: `  if (s === "ok") return "ok";`
  }
];

function kopiereAbzug() {
  const ziel = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-w1w2-mutation-"));
  fs.cpSync(path.join(ROOT, "lib"), path.join(ziel, "lib"), { recursive: true });
  fs.mkdirSync(path.join(ziel, "scripts"), { recursive: true });
  for (const s of ["vorgangsbildung-nachholen.js", W1_SUITE, W2_SUITE]) {
    fs.cpSync(path.join(ROOT, "scripts", s), path.join(ziel, "scripts", s));
  }
  return ziel;
}

function laufeSuite(abzug, suite) {
  const r = spawnSync(process.execPath, [path.join(abzug, "scripts", suite)], {
    cwd: abzug, encoding: "utf8", timeout: 180000,
    env: { PATH: process.env.PATH || "", HOME: process.env.HOME || "/tmp" }
  });
  return { code: r.status, out: String(r.stdout || "") + String(r.stderr || "") };
}

let gruen = 0, rot = 0;

// Vorbedingung: unmutiert muessen BEIDE Suiten gruen sein — sonst beweist eine
// rote Mutation nichts.
const referenz = kopiereAbzug();
for (const suite of [W1_SUITE, W2_SUITE]) {
  const r = laufeSuite(referenz, suite);
  if (r.code === 0) { gruen += 1; console.log(`PASS  Vorbedingung: ${suite} unmutiert gruen`); }
  else { rot += 1; console.log(`FAIL  Vorbedingung: ${suite} unmutiert NICHT gruen (Exit ${r.code})`); if (VERBOSE) console.log(r.out.slice(-1500)); }
}
fs.rmSync(referenz, { recursive: true, force: true });

for (const m of MUTATIONEN) {
  const abzug = kopiereAbzug();
  try {
    const dateiPfad = path.join(abzug, m.datei);
    const inhalt = fs.readFileSync(dateiPfad, "utf8");
    if (!inhalt.includes(m.von)) {
      rot += 1;
      console.log(`FAIL  ${m.name}  — Mutationsziel nicht gefunden (Code hat sich veraendert; Probe aktualisieren)`);
      continue;
    }
    fs.writeFileSync(dateiPfad, inhalt.replace(m.von, m.nach));
    const r = laufeSuite(abzug, m.suite);
    if (r.code !== 0) {
      gruen += 1;
      console.log(`PASS  ${m.name}  -> ${m.suite} wird ROT (Exit ${r.code})`);
    } else {
      rot += 1;
      console.log(`FAIL  ${m.name}  — Suite bleibt GRUEN, der Test traegt nicht`);
      if (VERBOSE) console.log(r.out.slice(-1500));
    }
  } finally {
    fs.rmSync(abzug, { recursive: true, force: true });
  }
}

console.log(`\n${gruen} PASS, ${rot} FAIL (${MUTATIONEN.length} Mutationen + 2 Vorbedingungen)`);
process.exit(rot ? 1 : 0);
