#!/usr/bin/env node
"use strict";

// Helmut — CLI des FACHZYKLUS-STARTWEGS (500er-Funktionstest).
// =============================================================================
// Standard ist IMMER der Trockenlauf: ohne `--scharf` wird KEIN Netzaufruf
// gemacht. Ein scharfer Lauf verlangt vier voneinander unabhängige Dinge:
//   1. `--scharf`,
//   2. `HELMUT_TESTKOHORTE_EXECUTE=1` UND
//      `HELMUT_TESTKOHORTE_CONFIRM=TESTKOHORTE_FACHZYKLUS_STARTEN_BESTAETIGT`,
//   3. ein geprüftes Startfenster, das JETZT gilt (`--start`/`--dauer`),
//   4. eine ausdrücklich bestätigte Startbereitschaft (`--startbereit=ja`) —
//      und die meldet `funktionstest-500.startbereitschaft()` derzeit NICHT.
//
// Aufruf:
//   node scripts/funktionstest-500-zyklus.js --start=11:36 --dauer=263
//   node scripts/funktionstest-500-zyklus.js --start=11:36 --dauer=263 --faelligkeit
//   node scripts/funktionstest-500-zyklus.js --start=11:36 --dauer=263 --scharf

const path = require("path");
const Z = require("../lib/helmut/funktionstest-zyklus");
const F = require("../lib/helmut/funktionstest-500");
const kapazitaet = require("../lib/helmut/kapazitaet-500");

const VERCEL = require(path.join(__dirname, "..", "vercel.json"));
const CRONS = VERCEL.crons || [];

function argument(argv, name) {
  const treffer = argv.find((a) => a.startsWith(`--${name}=`));
  return treffer ? treffer.slice(name.length + 3) : null;
}

function drucke(titel, wert) {
  console.log(`\n=== ${titel} ===`);
  console.log(JSON.stringify(wert, null, 2));
}

async function main() {
  const argv = process.argv.slice(2);
  const scharfGewuenscht = argv.includes("--scharf");
  const start = argument(argv, "start");
  const dauer = argument(argv, "dauer");
  const jetztUtc = argument(argv, "jetzt") || new Date().toISOString();

  const startfensterBefund = start && dauer
    ? F.pruefeStartfenster({
      startUtc: `2026-01-01T${start}:00Z`,
      dauerMinuten: Number(dauer),
      crons: CRONS,
      watchdogBeruecksichtigen: true
    })
    : null;

  // --faelligkeit beantwortet die entscheidende Vorfrage rein rechnerisch:
  // welche Arbeitsklasse ist in diesem Fenster überhaupt fällig?
  if (argv.includes("--faelligkeit")) {
    const befund = Z.arbeitsklassenImFenster({
      fensterStartMinuteUtc: startfensterBefund && startfensterBefund.startMinuteUtc,
      fensterEndeMinuteUtc: startfensterBefund && startfensterBefund.endeMinuteUtc
    });
    drucke("Fälligkeit der Arbeitsklassen im Fenster", befund);
    if (befund.bewertbar && !befund.sichtbareProduktstufeErreichbar) {
      console.log("\nBLOCKER: Die sichtbare Produktstufe je Mandat entsteht in diesem Fenster NICHT.");
      console.log("Das ist ein struktureller Zeitkonflikt der Phasenfenster, kein Kapazitätsproblem.");
      process.exit(1);
    }
    return;
  }

  const parallel = Number(argument(argv, "parallel") || 1);
  const rpm = Number(argument(argv, "rpm") || 82);
  const fensterMinuten = startfensterBefund
    && Number.isFinite(startfensterBefund.startMinuteUtc)
    && Number.isFinite(startfensterBefund.endeMinuteUtc)
    ? startfensterBefund.endeMinuteUtc - startfensterBefund.startMinuteUtc
    : null;

  drucke("Passt ein vollständiger Zyklus in das Fenster?", kapazitaet.zyklusPasstInsFenster({
    fensterMinuten, parallel, szenario: "konservativ", maxAnfragenJeMinute: rpm
  }));

  if (scharfGewuenscht) {
    console.log("\n!!! SCHARFER FACHZYKLUS ANGEFORDERT — Production-Wirkung !!!");
    console.log(`    Aufgerufen wird ausschließlich die bestehende Route ${Z.ROUTEN.zyklus}.`);
    console.log("    Kein Cron wird verändert, kein Motor angefasst, keine Route neu gebaut.");
    console.log(`    Nötig: ${Z.EXECUTE_FLAG}=1 und ${Z.CONFIRM_VARIABLE}=${Z.FREIGABEWORT}\n`);
  }

  const ergebnis = await Z.fuehreZyklusAus({
    modus: scharfGewuenscht ? Z.MODUS_SCHARF : Z.MODUS_TROCKENLAUF,
    env: process.env,
    startfensterBefund,
    jetztUtc,
    parallel,
    maxScheiben: argument(argv, "scheiben") ? Number(argument(argv, "scheiben")) : null,
    startbereit: argument(argv, "startbereit") === "ja" ? true : null
  });

  drucke(`Fachzyklus (${ergebnis.modus})`, {
    modus: ergebnis.modus,
    modusGewuenscht: ergebnis.modusGewuenscht,
    freigabe: ergebnis.freigabe,
    startfenster: ergebnis.startfenster,
    route: ergebnis.route,
    treibtMandatsgebundeneBriefingRoutenAn: ergebnis.treibtMandatsgebundeneBriefingRoutenAn,
    plan: ergebnis.plan,
    blockadeGruende: ergebnis.blockadeGruende,
    erfolgreich: ergebnis.erfolgreich,
    fehlgeschlagen: ergebnis.fehlgeschlagen,
    abgebrochen: ergebnis.abgebrochen,
    ok: ergebnis.ok
  });
  console.log(`\n${ergebnis.meldung}`);
  if (ergebnis.fehlgeschlagen > 0) process.exit(1);
}

main().catch((fehler) => {
  console.error(`Abbruch: ${(fehler && fehler.message) || fehler}`);
  process.exit(1);
});
