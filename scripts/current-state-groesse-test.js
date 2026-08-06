"use strict";

// Helmut — Größenkontrolle für docs/CURRENT_STATE.md (Doku-Sprint 2026-08-05):
// =============================================================================================
// CURRENT_STATE.md war bis 2026-08-05 auf 5 983 Zeilen / ~686 000 Zeichen angewachsen, weil
// jeder Sprint seinen vollständigen Bericht dort anhängte. Der Alt-Stand liegt verlustfrei in
// docs/archive/project_state/2026_08_05_CURRENT_STATE_full.md; CURRENT_STATE.md enthält seither
// AUSSCHLIESSLICH den aktuellen, entscheidungsrelevanten Zustand (CLAUDE.md §9).
//
// Dieser Test hält die Regel technisch fest: höchstens 30 000 Zeichen und 350 Zeilen.
// Er hat KEINE Abhängigkeit außer Node-Bordmitteln, läuft offline und wird vom kanonischen
// Runner (scripts/run-offline-tests.js) automatisch eingesammelt — damit prüft ihn auch das
// CI-Gate (.github/workflows/ci.yml, Pflicht-Check „Syntax + Offline-Suiten") ohne eigene
// Workflow-Änderung. Das historische Archiv unter docs/archive/ wird bewusst NICHT begrenzt.
//
// Wenn dieser Test rot wird: nicht die Grenze anheben, sondern historische Inhalte in die
// themenbezogenen Belegdateien bzw. nach docs/archive/ auslagern (docs/archive/README.md).

const fs = require("fs");
const path = require("path");

const MAX_ZEICHEN = 30000;
const MAX_ZEILEN = 350;

const datei = path.join(__dirname, "..", "docs", "CURRENT_STATE.md");

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`); }
}

let inhalt = null;
try {
  inhalt = fs.readFileSync(datei, "utf8");
} catch (e) {
  check("docs/CURRENT_STATE.md ist lesbar", false, e && e.message);
}

if (inhalt !== null) {
  check("docs/CURRENT_STATE.md ist lesbar", true);

  // Zeichen = Unicode-Codepunkte (nicht Bytes), deterministisch und locale-unabhängig.
  const zeichen = [...inhalt].length;
  // Zeilen = Inhaltszeilen; ein abschließender Zeilenumbruch zählt keine Leerzeile hinzu.
  const zeilen = inhalt.length === 0
    ? 0
    : inhalt.split("\n").length - (inhalt.endsWith("\n") ? 1 : 0);

  check(
    `Zeichengrenze eingehalten (${zeichen} von erlaubt ${MAX_ZEICHEN})`,
    zeichen <= MAX_ZEICHEN,
    `docs/CURRENT_STATE.md hat ${zeichen} Zeichen, erlaubt sind ${MAX_ZEICHEN}. ` +
      "Historische Inhalte gehören in Belegdateien bzw. docs/archive/ (siehe docs/archive/README.md), " +
      "nicht in den aktuellen Status."
  );

  check(
    `Zeilengrenze eingehalten (${zeilen} von erlaubt ${MAX_ZEILEN})`,
    zeilen <= MAX_ZEILEN,
    `docs/CURRENT_STATE.md hat ${zeilen} Zeilen, erlaubt sind ${MAX_ZEILEN}. ` +
      "Historische Inhalte gehören in Belegdateien bzw. docs/archive/ (siehe docs/archive/README.md), " +
      "nicht in den aktuellen Status."
  );

  // Schutz gegen ein „bestandenes" Leerdokument: der Status muss ein echtes Statusdokument sein.
  check(
    "Datei ist ein nicht-leeres Statusdokument (Titelzeile vorhanden)",
    /^# CURRENT STATE/m.test(inhalt),
    "Titelzeile '# CURRENT STATE …' fehlt"
  );
}

console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
if (fail === 0) {
  console.log("CURRENT_STATE.md bleibt ein kompakter aktueller Status; Historie liegt im Archiv.");
}
process.exit(fail > 0 ? 1 : 0);
