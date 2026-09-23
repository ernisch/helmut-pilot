"use strict";

// Helmut — Vertrag der automatischen Bereichsauswahl (Standard vs. Bereich vs. Extended).
// =============================================================================================
// Beweist die deterministische Zuordnung „geänderte Datei -> Bereich -> Fach-Regressionstests"
// (scripts/bereichsauswahl.js) und dass die Bereichs-Suiten die Standardmenge NICHT doppeln.
// REINE LOGIK plus zwei echte Runner-Aufrufe mit `--list` (führen KEINE Suiten aus).
//
// Aufruf:  node scripts/lokal.js -- node scripts/bereichsauswahl-test.js

const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const RUNNER = path.join(ROOT, "scripts", "run-offline-tests.js");

const R = require(path.join(ROOT, "scripts", "run-offline-tests.js"));
const A = require(path.join(ROOT, "scripts", "bereichsauswahl.js"));

const ALLE = R.collectSuites();
const STANDARD = R.STANDARD;

// Modul nur LADEN (nicht scharfschalten) fuer eine saubere Kindprozess-Umgebung.
process.env.HELMUT_LOKALER_SCHUTZ_NUR_LADEN = "ja";
const S = require(path.join(ROOT, "scripts", "lokaler-netzschutz.js"));
delete process.env.HELMUT_LOKALER_SCHUTZ_NUR_LADEN;

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

function sauber() {
  const env = { ...process.env };
  for (const n of S.PRODUCTION_KENNUNGEN) delete env[n];
  for (const n of [...S.DB_HOST_VARIABLEN, ...S.DB_URL_VARIABLEN]) delete env[n];
  delete env.NODE_OPTIONS;
  delete env.HELMUT_LOKALER_SCHUTZ_NUR_LADEN;
  env.HELMUT_SOURCE_MODE = "off";
  return env;
}

function runnerListe(...extraArgs) {
  const r = spawnSync(process.execPath, [RUNNER, "--list", ...extraArgs],
    { encoding: "utf8", env: sauber(), timeout: 60000 });
  const aus = `${r.stdout || ""}\n${r.stderr || ""}`;
  const suiten = aus.split("\n").filter((l) => /\.js$/.test(l) && !/^\s/.test(l));
  return { status: r.status, aus, suiten };
}

const waehle = (dateien) => A.bereichsSuiten(dateien, ALLE, STANDARD);

function main() {
  console.log("Helmut — automatische Bereichsauswahl (Standard vs. Bereich vs. Extended)\n");

  // ── A · Pflichtbereiche vorhanden ─────────────────────────────────────────────
  console.log("== A · Bereiche und Standardmenge ==");
  const pflicht = ["briefing", "lage", "radar", "quellen", "verstehen", "profil", "auth",
    "admin", "matching-scoring", "ui", "landesmodule-pardok", "warteschlange-pipeline",
    "datenbank-migration"];
  check("A1 Alle geforderten Fachbereiche sind definiert",
    pflicht.every((b) => A.BEREICHE[b]), pflicht.filter((b) => !A.BEREICHE[b]).join(", ") || "alle");
  const leere = Object.keys(A.BEREICHE).filter((b) => A.suitenFuerBereiche(ALLE, [b]).length === 0);
  check("A2 Kein Bereich ist leer (jeder Bereich trifft Suiten)", leere.length === 0,
    leere.join(", ") || "alle belegt");
  check("A3 Die Standardmenge ist unveraendert 93",
    STANDARD.size === 93, `Standard ${STANDARD.size}`);
  check("A4 Die Sammlung waechst nur um bewusst ergaenzte Tests (>= 457) und der neue Auswahltest ist NICHT Standard",
    ALLE.length >= 457 && ALLE.includes("bereichsauswahl-test.js") && !STANDARD.has("bereichsauswahl-test.js"),
    `erweitert ${ALLE.length}`);

  // ── B · Einzelne Fachbereiche ─────────────────────────────────────────────────
  console.log("\n== B · Einzelne Fachbereiche ==");
  const bBriefing = waehle(["lib/helmut/briefing-lauf.js"]);
  check("B1 Briefing-Aenderung waehlt den Bereich briefing",
    bBriefing.bereiche.includes("briefing") && !bBriefing.konservativ, JSON.stringify(bBriefing.bereiche));
  check("B2 Briefing-Aenderung liefert Briefing-Regression",
    bBriefing.suiten.length > 0 && bBriefing.suiten.every((f) => /^briefing|^morgen|^ereignisbindung-heute|^contract-adapter|^ergebnisstand-vertrag|^decisions/.test(f)),
    `${bBriefing.suiten.length} Suiten`);
  const bLage = waehle(["lib/helmut/lage.js"]);
  check("B3 Lage-Aenderung waehlt den Bereich lage",
    bLage.bereiche.includes("lage") && bLage.suiten.length > 0 && bLage.suiten.every((f) => /^lage/.test(f)),
    `${bLage.suiten.length} Suiten`);
  const bQuellen = waehle(["lib/helmut/scheduler.js"]);
  check("B4 Quellen-Aenderung waehlt den Bereich quellen",
    bQuellen.bereiche.includes("quellen") && bQuellen.suiten.length > 0, `${bQuellen.suiten.length} Suiten`);
  const bRadar = waehle(["lib/helmut/radar.js"]);
  check("B5 Radar-Aenderung waehlt den Bereich radar",
    bRadar.bereiche.includes("radar") && bRadar.suiten.every((f) => /^radar/.test(f)),
    `${bRadar.suiten.length} Suiten`);

  // ── C · Mehrere Bereiche = Vereinigung, keine Doppel ─────────────────────────
  console.log("\n== C · Mehrere Bereiche und Doppelvermeidung ==");
  const bMehr = waehle(["lib/helmut/briefing-lauf.js", "lib/helmut/lage.js"]);
  check("C1 Zwei Bereiche liefern die Vereinigung",
    bMehr.bereiche.includes("briefing") && bMehr.bereiche.includes("lage")
      && bBriefing.suiten.every((f) => bMehr.suiten.includes(f))
      && bLage.suiten.every((f) => bMehr.suiten.includes(f)),
    JSON.stringify(bMehr.bereiche));
  const ohneDoppel = (su) => new Set(su).size === su.length;
  check("C2 Keine doppelten Suiten in der Bereichsauswahl", ohneDoppel(bMehr.suiten) && ohneDoppel(bQuellen.suiten), "");
  check("C3 Keine Bereichs-Suite ist gleichzeitig Standard (kein Doppellauf)",
    bMehr.suiten.every((f) => !STANDARD.has(f)) && bQuellen.suiten.every((f) => !STANDARD.has(f)), "");

  // ── D · Fail closed und konservativ ───────────────────────────────────────────
  console.log("\n== D · Fail closed, konservativ, Kerndateien ==");
  const dDoc = waehle(["docs/CURRENT_STATE.md", "README.md", "belege/x.json"]);
  check("D1 Reine Dokumentation startet keine Fachregression",
    dDoc.suiten.length === 0 && dDoc.bereiche.length === 0 && dDoc.unbekannt.length === 0 && !dDoc.konservativ,
    JSON.stringify(dDoc));
  const dUnbekannt = waehle(["lib/helmut/voellig-neu-erfunden.js"]);
  check("D2 Eine unbekannte relevante Datei wird NICHT still ignoriert",
    dUnbekannt.konservativ && dUnbekannt.unbekannt.includes("lib/helmut/voellig-neu-erfunden.js") && dUnbekannt.suiten.length > 0,
    `konservativ, ${dUnbekannt.suiten.length} Suiten`);
  const dKern = waehle(["lib/helmut/storage.js"]);
  check("D3 Eine geteilte Kerndatei fuehrt zur konservativen Sammelmenge",
    dKern.konservativ && dKern.suiten.length > 0, `${dKern.suiten.length} Suiten`);
  const dTestauswahl = waehle(["scripts/bereichsauswahl.js"]);
  check("D4 Eine Aenderung der Testauswahl selbst fuehrt konservativ zu allen Bereichen",
    dTestauswahl.konservativ && dTestauswahl.suiten.length > 0, `${dTestauswahl.suiten.length} Suiten`);
  const dSammlung = waehle(["lib/helmut/voellig-neu.js"]).suiten;
  check("D5 Konservativ ist kleiner als die vollstaendige Regression",
    dSammlung.length < ALLE.length && dSammlung.every((f) => ALLE.includes(f)),
    `${dSammlung.length} < ${ALLE.length}`);

  // ── E · Sammeldateien (server.js/client.js) ──────────────────────────────────
  console.log("\n== E · Sammeldateien ==");
  const eServer = waehle(["server.js"]);
  const alleBereiche = Object.keys(A.BEREICHE).sort();
  check("E1 server.js loest NICHT die gesamte Regression aus",
    !eServer.konservativ && eServer.suiten.length < ALLE.length, `${eServer.suiten.length} < ${ALLE.length}`);
  check("E2 server.js nutzt den kleinen konservativen Sammelsatz",
    A.SAMMEL_BEREICHE.every((b) => eServer.bereiche.includes(b))
      && eServer.bereiche.length < alleBereiche.length,
    JSON.stringify(eServer.bereiche));

  // ── F · Determinismus ────────────────────────────────────────────────────────
  console.log("\n== F · Determinismus ==");
  const f1 = JSON.stringify(waehle(["lib/helmut/briefing-lauf.js", "lib/helmut/scheduler.js"]).suiten);
  const f2 = JSON.stringify(waehle(["lib/helmut/scheduler.js", "lib/helmut/briefing-lauf.js"]).suiten);
  check("F1 Gleiche Dateimenge ergibt unabhaengig von der Reihenfolge dasselbe Ergebnis", f1 === f2, "");

  // ── G · Echte Runner-Aufrufe (--list, keine Ausfuehrung) ─────────────────────
  console.log("\n== G · Runner-Aufrufe ==");
  const gStd = runnerListe();
  check("G1 Standardlauf bleibt bei 93 Suiten",
    gStd.status === 0 && /^93 Offline-Suiten \(Standard = Pflichtlauf\)/m.test(gStd.aus), "");
  const gBriefing = runnerListe("--aendert", "lib/helmut/briefing-lauf.js", "--nur-bereich");
  check("G2 CLI: Briefing-Aenderung listet nur Bereichs-Suiten",
    gBriefing.status === 0 && /Bereich = automatische Fachregression/.test(gBriefing.aus)
      && gBriefing.suiten.length > 0 && gBriefing.suiten.every((f) => !STANDARD.has(f)),
    `${gBriefing.suiten.length} Suiten, exit ${gBriefing.status}`);
  const gDoc = runnerListe("--aendert", "docs/CURRENT_STATE.md", "--nur-bereich");
  check("G3 CLI: reine Dokumentation listet 0 Suiten",
    gDoc.status === 0 && gDoc.suiten.length === 0 && /^0 Offline-Suiten/m.test(gDoc.aus),
    `${gDoc.suiten.length} Suiten, exit ${gDoc.status}`);
  const gUnbekannt = runnerListe("--bereich", "gibt-es-nicht");
  check("G4 CLI: ein unbekannter Bereich bricht kontrolliert ab (Exit 1)",
    gUnbekannt.status === 1, `exit ${gUnbekannt.status}`);

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main();
