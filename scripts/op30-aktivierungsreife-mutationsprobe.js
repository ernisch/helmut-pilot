"use strict";

// Helmut — MUTATIONSPROBE zu den O1-O5-Korrekturen (OP-30, Sprint Aktivierungsreife).
// =============================================================================================
// EIN TEST, DER AUCH BEI KAPUTTER IMPLEMENTIERUNG GRUEN BLEIBT, BEWEIST NICHTS.
// Diese Probe dreht jede einzelne Korrektur gezielt zurueck und verlangt, dass der zugehoerige
// Nachweis daraufhin ROT wird. Bleibt er gruen, ist er wertlos — und das wird hier gemeldet.
//
// SICHERHEIT: jede Datei wird VOR der Mutation vollstaendig im Speicher gesichert und in
// `finally` zurueckgeschrieben — auch bei Absturz, auch bei SIGINT. Nach dem Lauf prueft die
// Probe selbst, dass alle Dateien byte-identisch wiederhergestellt sind.
//
// AUFRUF (in einer Sitzung mit Zugangsdaten ueber den lokalen Starter):
//   node scripts/lokal.js scripts/op30-aktivierungsreife-mutationsprobe.js
//
// HINWEIS (Befund O22 des Abschlussreviews, weiterhin offen): Dateien ohne `-test.js`-Endung
// werden vom kanonischen Runner NICHT eingesammelt. Diese Probe laeuft also nicht automatisch
// im Pflicht-Gate. Ihr Ergebnis gehoert deshalb in den Sprintbeleg, nicht nur in die Konsole.

const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SUITE = path.join(ROOT, "scripts/op30-aktivierungsreife-test.js");

const MUTATIONEN = [
  {
    name: "O1a — Rotation zurueck auf den tagesunabhaengigen Streuwert",
    datei: "lib/helmut/source-demand.js",
    suchen: `      const versatz = abMs + (rangDesMandats == null
        ? (streuwert(\`\${typ}|\${mandatsId}\`) % spanne)
        : rangVersatz(rangDesMandats, rang.anzahl, spanne));`,
    ersetzen: `      const versatz = abMs + (streuwert(\`\${typ}|\${mandatsId}\`) % spanne);`,
    erwarteRot: ["1.2", "1.3"]
  },
  {
    name: "O1b — `scopeMax` wieder hart auf null",
    datei: "lib/helmut/scalable-pipeline.js",
    suchen: "      const wirksamerScopeMax = scopeMax === undefined ? deckelFuer(art, mandatsId) : scopeMax;",
    ersetzen: "      const wirksamerScopeMax = null;",
    erwarteRot: ["1.6"]
  },
  {
    name: "O1c — Mandatsreserve zurueck auf den festen Anteil (verschenkt die Haelfte)",
    datei: "lib/helmut/llm-budget-fair.js",
    suchen: "  const reserve = Math.min(bedarf, hoechsteReserve);",
    ersetzen: "  const reserve = hoechsteReserve;",
    erwarteRot: ["1.8"]
  },
  {
    name: "O2 — Workerbetrieb wieder umgehen (Direktaufruf von `arbeite`)",
    datei: "server.js",
    suchen: "  const durchlauf = await workerBetrieb.durchlauf({",
    ersetzen: "  const durchlauf = await scalablePipeline.arbeite({",
    erwarteRot: ["2.1"]
  },
  {
    name: "O2b — Aufrufergrenzen wieder ignorieren",
    datei: "lib/helmut/worker-betrieb.js",
    suchen: `    const vorgabe = ueberschreibungen && ueberschreibungen[SCHLUESSEL[name]];`,
    ersetzen: `    const vorgabe = null;`,
    erwarteRot: ["2.2"]
  },
  {
    name: "O3 — Vorbedingung wieder nur mit EINEM Fenster fragen",
    datei: "lib/helmut/scalable-pipeline.js",
    suchen: `  const fensterListe = enthalteneFenster(fenster, deps.env || process.env);`,
    ersetzen: `  const fensterListe = [fenster];`,
    erwarteRot: ["3.2"]
  },
  {
    name: "O4 — Obergrenze des Budgetwartens entfernen (wieder unbegrenzt)",
    datei: "lib/helmut/scalable-pipeline.js",
    suchen: "      if (entstanden && jetztMs - entstanden > BUDGET_MAX_WARTE_MS) {",
    ersetzen: "      if (false) {",
    erwarteRot: ["4.2"]
  },
  {
    name: "O5 — dauerhaft blockierte Auftraege nicht mehr melden (falsches Gruen)",
    datei: "lib/helmut/scalable-pipeline.js",
    suchen: `  if (blockiert && blockiert.verfuegbar && Number(blockiert.blockiert) > 0) {
    zustand = "kritisch";`,
    ersetzen: `  if (false) {
    zustand = "kritisch";`,
    erwarteRot: ["5.3"]
  },
  {
    name: "O5b — Wiedervorlage ohne Obergrenze (endlose Wiederholung)",
    datei: "lib/helmut/scalable-pipeline.js",
    suchen: `    maxWiedervorlagen: WIEDERVORLAGE_MAX,`,
    ersetzen: `    maxWiedervorlagen: 999,`,
    erwarteRot: ["5.2b"]
  }
];

function laufeSuite() {
  const r = spawnSync(process.execPath, [SUITE], {
    encoding: "utf8", cwd: ROOT, maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, HELMUT_SOURCE_MODE: "off" }
  });
  const text = `${r.stdout || ""}${r.stderr || ""}`;
  const rot = [...text.matchAll(/^ {2}FAIL {2}([0-9.a-z]+)/gm)].map((m) => m[1]);
  return { code: r.status, rot, text };
}

function main() {
  console.log("Helmut — Mutationsprobe zu den O1-O5-Korrekturen (OP-30)\n");

  const original = new Map();
  for (const m of MUTATIONEN) {
    const p = path.join(ROOT, m.datei);
    if (!original.has(p)) original.set(p, fs.readFileSync(p, "utf8"));
  }
  const zuruecksetzen = () => {
    for (const [p, inhalt] of original) fs.writeFileSync(p, inhalt, "utf8");
  };
  process.on("SIGINT", () => { zuruecksetzen(); process.exit(130); });

  let ok = 0;
  let schlecht = 0;
  try {
    console.log("== 0 · Ausgangslage: die Suite muss ohne Mutation GRUEN sein ==");
    const basis = laufeSuite();
    if (basis.code !== 0) {
      console.log(`  ABBRUCH — die Suite ist schon unmutiert rot (${basis.rot.join(", ") || "Testlauffehler"}).`);
      console.log("  Eine Mutationsprobe auf roter Basis sagt nichts aus.");
      process.exitCode = 1;
      return;
    }
    console.log("  PASS  Basislauf gruen\n");

    for (const m of MUTATIONEN) {
      const p = path.join(ROOT, m.datei);
      const inhalt = original.get(p);
      if (!inhalt.includes(m.suchen)) {
        console.log(`  FEHLER  ${m.name}`);
        console.log(`          Der zu mutierende Text steht nicht (mehr) in ${m.datei}.`);
        console.log("          Die Probe ist damit WERTLOS und muss nachgezogen werden.");
        schlecht += 1;
        continue;
      }
      fs.writeFileSync(p, inhalt.replace(m.suchen, m.ersetzen), "utf8");
      const r = laufeSuite();
      fs.writeFileSync(p, inhalt, "utf8");

      const getroffen = m.erwarteRot.filter((id) => r.rot.some((x) => x === id || x.startsWith(id)));
      const bestanden = r.code !== 0 && getroffen.length > 0;
      if (bestanden) {
        ok += 1;
        console.log(`  ROT     ${m.name}`);
        console.log(`          -> ${r.rot.join(", ")}`);
      } else {
        schlecht += 1;
        console.log(`  GRUEN   ${m.name}   << DER NACHWEIS IST WERTLOS`);
        console.log(`          erwartet rot: ${m.erwarteRot.join(", ")} · tatsaechlich rot: ${r.rot.join(", ") || "nichts"}`);
      }
    }
  } finally {
    zuruecksetzen();
  }

  // Selbstpruefung: ist wirklich alles zurueckgeschrieben?
  let unversehrt = true;
  for (const [p, inhalt] of original) {
    if (fs.readFileSync(p, "utf8") !== inhalt) { unversehrt = false; console.log(`  ACHTUNG  ${p} weicht ab!`); }
  }

  console.log(`\n${"═".repeat(78)}`);
  console.log(`ERGEBNIS  ${ok}/${MUTATIONEN.length} Mutationen wurden erkannt (rot)`
    + `${schlecht ? ` · ${schlecht} NICHT erkannt` : ""}`);
  console.log(`Alle Dateien byte-identisch wiederhergestellt: ${unversehrt ? "ja" : "NEIN"}`);
  console.log("═".repeat(78));
  process.exit(schlecht === 0 && unversehrt ? 0 : 1);
}

main();
