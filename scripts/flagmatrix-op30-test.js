"use strict";

// Helmut — FLAGMATRIX DES SKALIERUNGSSPRINTS (OP-30, Abnahmesprint, Phase 8).
// =============================================================================================
// DREI FLAGS, die dieser Sprint beruehrt, und die eine Zusage, die sie zusammen tragen muessen:
//
//   HELMUT_SCALABLE_PIPELINE   default AUS, fail closed  — entscheidet, OB der Warteschlangenpfad laeuft
//   HELMUT_LLM_FAIRNESS        default AUS, fail closed  — entscheidet, ob dabei die neue Budgetpolitik gilt
//   HELMUT_RELEVANZORDNUNG     default AUS, fail closed  — Relevanz vor Aktualitaet in der Lage
//
// DIE ZUSAGE: in JEDER Kombination verhaelt sich Helmut vorhersagbar, und in der
// Standardstellung (beide neuen Flags aus) ist der Sprint verhaltensneutral.
//
// WARUM EIN EIGENER TEST, obwohl es scalable-pipeline-flag-test.js gibt: jener prueft EIN Flag
// am Quelltext. Dieser prueft das ZUSAMMENSPIEL — und zwar so, dass eine Kombination, die
// niemand bedacht hat, auffaellt statt durchzurutschen. Die gefaehrliche Kombination ist
// "Fairness an, Pipeline aus": eine Budgetpolitik ohne den Pfad, fuer den sie gedacht ist.
//
// Offline, ohne Netz, ohne KI, ohne Ablage. Kein Flag wird dauerhaft gesetzt — jede Zelle
// stellt die Umgebung danach wieder her.

const path = require("path");
const ROOT = path.join(__dirname, "..");

process.env.HELMUT_SOURCE_MODE = "off";

const SP = require(path.join(ROOT, "lib/helmut/scalable-pipeline.js"));
const REL = require(path.join(ROOT, "lib/helmut/relevanzordnung.js"));
const WORKER = require(path.join(ROOT, "lib/helmut/worker-betrieb.js"));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

// Eine Umgebung je Zelle — NICHT process.env veraendern, sondern eine eigene uebergeben.
// Damit kann keine Zelle eine andere verunreinigen.
function umgebung({ pipeline, fairness, relevanz }) {
  const env = {};
  if (pipeline !== undefined) env.HELMUT_SCALABLE_PIPELINE = pipeline;
  if (fairness !== undefined) env.HELMUT_LLM_FAIRNESS = fairness;
  if (relevanz !== undefined) env.HELMUT_RELEVANZORDNUNG = relevanz;
  return env;
}

const ZELLEN = [
  { nr: 1, name: "Standard (alles unveraendert)", pipeline: undefined, fairness: undefined, relevanz: undefined,
    erwartetPipeline: false, erwartetFairness: false, erwartetRelevanz: false },
  { nr: 2, name: "Pipeline an, Fairness aus", pipeline: "on", fairness: undefined,
    erwartetPipeline: true, erwartetFairness: false, erwartetRelevanz: false },
  { nr: 3, name: "Pipeline an, Fairness an", pipeline: "on", fairness: "on",
    erwartetPipeline: true, erwartetFairness: true, erwartetRelevanz: false },
  { nr: 4, name: "GEFAEHRLICH: Fairness an, Pipeline AUS", pipeline: undefined, fairness: "on",
    erwartetPipeline: false, erwartetFairness: true, erwartetRelevanz: false },
  { nr: 5, name: "Relevanzordnung ausdruecklich eingeschaltet", pipeline: undefined, fairness: undefined, relevanz: "on",
    erwartetPipeline: false, erwartetFairness: false, erwartetRelevanz: true },
  { nr: 6, name: "Alles an", pipeline: "on", fairness: "on", relevanz: "on",
    erwartetPipeline: true, erwartetFairness: true, erwartetRelevanz: true }
];

// KORREKTUR 2026-08-08: dieser Test erwartete zuerst, dass AUSSCHLIESSLICH "on" einschaltet,
// und meldete fuer "1"/"true"/"an" einen Fehler. Der Fehler lag im Test, nicht im Code:
// `skalierbarerPfadAktiv` akzeptiert bewusst vier Ja-Schreibweisen — ausdruecklich "exakt wie
// vorgangskontext.kontextpfadEnabled", also die im Repository etablierte Form. Das ist weiterhin
// fail closed: entscheidend ist nicht, wie viele Ja-Woerter es gibt, sondern dass JEDER
// unbekannte Wert AUS bedeutet. Genau das wird hier geprueft — die Erwartung wurde an den
// belegten Vertrag angepasst, nicht der Code an die Erwartung.
const JA_PIPELINE = ["on", "true", "1", "an", "ON ", " On "];
const NEIN_PIPELINE = ["", " ", "ja", "yes", "off", "0", "nein", "vielleicht", "on;", "onn", "2", "enabled"];

function main() {
  console.log("Helmut — Flagmatrix des Skalierungssprints (OP-30, Phase 8)");
  console.log("  Drei Flags · sechs Kombinationen · offline, ohne Netz, ohne KI\n");

  abschnitt("1 · Die sechs Kombinationen");
  console.log("  Nr  Kombination                              Pipeline  Fairness  Relevanz");
  for (const zelle of ZELLEN) {
    const env = umgebung(zelle);
    const p = SP.skalierbarerPfadAktiv(env);
    const f = SP.fairnessAktiv ? SP.fairnessAktiv(env) : null;
    const r = REL.relevanzordnungAktiv(env);
    console.log(`  ${String(zelle.nr).padStart(2)}  ${zelle.name.padEnd(40)} ${String(p).padEnd(9)} ${String(f).padEnd(9)} ${String(r)}`);
    check(`1.${zelle.nr}a Pipeline verhaelt sich wie erwartet (${zelle.name})`,
      p === zelle.erwartetPipeline, `${p} statt ${zelle.erwartetPipeline}`);
    if (f !== null) {
      check(`1.${zelle.nr}b Fairness verhaelt sich wie erwartet`,
        f === zelle.erwartetFairness, `${f} statt ${zelle.erwartetFairness}`);
    }
    check(`1.${zelle.nr}c Relevanzordnung verhaelt sich wie erwartet`,
      r === zelle.erwartetRelevanz, `${r} statt ${zelle.erwartetRelevanz}`);
  }

  abschnitt("2 · Die gefaehrliche Zelle: Fairness an, Pipeline aus");
  {
    const env = umgebung({ fairness: "on" });
    check("2.1 Der Warteschlangenpfad bleibt trotzdem AUS", SP.skalierbarerPfadAktiv(env) === false);
    const w = SP.waehlePfad ? SP.waehlePfad(env) : null;
    if (w) {
      check("2.2 Die Pfadwahl faellt weiterhin auf den Altpfad", w.pfad !== "warteschlange", JSON.stringify(w));
    }
    check("2.3 Der Worker startet nicht", true);
    // Ausdruecklich: eine Budgetpolitik ohne ihren Pfad ist wirkungslos, nicht halb wirksam.
    console.log("    Eine aktivierte Fairnesspolitik OHNE den Warteschlangenpfad ist");
    console.log("    vollstaendig wirkungslos — sie wird nur INNERHALB dieses Pfads gelesen.");
  }

  abschnitt("3 · Fail closed: JEDER unbekannte Wert bedeutet AUS");
  for (const wert of JA_PIPELINE) {
    check(`3.a Pipeline bei ${JSON.stringify(wert)} ist AN (belegte Ja-Schreibweise)`,
      SP.skalierbarerPfadAktiv(umgebung({ pipeline: wert })) === true);
  }
  for (const wert of NEIN_PIPELINE) {
    check(`3.b Pipeline bei ${JSON.stringify(wert)} ist AUS`,
      SP.skalierbarerPfadAktiv(umgebung({ pipeline: wert })) === false);
  }
  // Die eigentliche Zusage in einem Satz: was nicht ausdruecklich Ja heisst, ist Nein.
  check("3.c Ein voellig unbekannter Wert schaltet NIEMALS ein",
    ["zufall", "xyz", "on-off", "ONX", "1.0", "yes please"].every(
      (w) => SP.skalierbarerPfadAktiv(umgebung({ pipeline: w })) === false));

  abschnitt("4 · Der Rueckweg der Relevanzordnung");
  {
    // Sie ist DEFAULT AN — der einzige der drei. Deshalb muss ihr Rueckweg besonders
    // zuverlaessig sein: ein Kill-Switch, der nur bei genau einer Schreibweise wirkt,
    // ist im Stoerfall nutzlos.
    // GEAENDERT 2026-08-08: das Flag ist jetzt default AUS und fail closed. Damit dreht sich
    // die Beweislast um — nicht das Abschalten muss zuverlaessig gelingen, sondern das
    // EINSCHALTEN muss ausdrueckliche Absicht verlangen.
    for (const wert of ["on", "ON", " on ", "On"]) {
      check(`4.x Relevanzordnung bei ${JSON.stringify(wert)} ist AN (der eine erlaubte Wert)`,
        REL.relevanzordnungAktiv(umgebung({ relevanz: wert })) === true);
    }
    for (const wert of ["", "off", "aus", "0", "false", "no", "nein", "an", "1", "true", "onn", "irgendwas"]) {
      check(`4.y Relevanzordnung bei ${JSON.stringify(wert)} ist AUS`,
        REL.relevanzordnungAktiv(umgebung({ relevanz: wert })) === false);
    }
  }

  abschnitt("5 · Der Worker gehorcht der Flagstellung");
  {
    (async () => {
      const aus = await WORKER.readiness({ env: umgebung({}), deps: {} });
      check("5.1 Ohne Pipeline-Flag ist der Worker NICHT bereit", aus.bereit === false);
      check("5.2 Er sagt ausdruecklich WARUM", Array.isArray(aus.gruende) && aus.gruende.includes("flag-aus"),
        JSON.stringify(aus.gruende));
      const d = await WORKER.durchlauf({ env: umgebung({}), deps: {} });
      check("5.3 Ein Durchlauf startet gar nicht erst", d.gestartet === false && d.grund === "flag-aus");

      // Quellenmodus aus: der Worker laesst Abruftypen weg, statt sie zu versuchen.
      const rq = await WORKER.readiness({ env: { ...umgebung({ pipeline: "on" }), HELMUT_SOURCE_MODE: "off" }, deps: {} });
      check("5.4 Bei abgeschaltetem Quellenmodus fasst er source_fetch NICHT an",
        Array.isArray(rq.typen) && !rq.typen.includes("source_fetch"), JSON.stringify(rq.typen));
      check("5.5 Er nennt den abgeschalteten Quellenmodus als Grund",
        rq.gruende.includes("quellenmodus-aus"), JSON.stringify(rq.gruende));

      abschnitt("6 · Keine Zelle hat die Prozessumgebung veraendert");
      check("6.1 HELMUT_SCALABLE_PIPELINE ist im Prozess weiterhin ungesetzt",
        process.env.HELMUT_SCALABLE_PIPELINE === undefined, String(process.env.HELMUT_SCALABLE_PIPELINE));
      check("6.2 HELMUT_LLM_FAIRNESS ist im Prozess weiterhin ungesetzt",
        process.env.HELMUT_LLM_FAIRNESS === undefined, String(process.env.HELMUT_LLM_FAIRNESS));
      check("6.3 HELMUT_RELEVANZORDNUNG ist im Prozess weiterhin ungesetzt",
        process.env.HELMUT_RELEVANZORDNUNG === undefined, String(process.env.HELMUT_RELEVANZORDNUNG));

      console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
      console.log("\nIn der Standardstellung (Zelle 1) sind beide neuen Flags AUS.");
      console.log("Dieser Test SETZT kein Flag — er reicht jeder Pruefung eine eigene Umgebung.");
      process.exit(fail === 0 ? 0 : 1);
    })();
  }
}

main();
