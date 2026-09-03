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
    // ABGELÖST (Abschlussreview, bestätigter Befund): `arbeitsklassenImFenster`
    // ist die ALTE Schnittmengenrechnung — sie meldete ausgerechnet für das
    // tragende Nachtfenster einen BLOCKER, obwohl dort nach FÄLLIGKEIT 100 % der
    // Kohorte beanspruchbar sind. Seit der Betreiberentscheidung vom 02.09. ist
    // die Fälligkeit maßgeblich; die Schnittmenge bleibt reine BESCHREIBUNG und
    // beendet den Lauf nicht mehr.
    console.log("\nHINWEIS: Die obige Rechnung ist die ALTE Schnittmenge mit dem Streuintervall.");
    console.log("Maßgeblich ist seit dem 02.09. die FÄLLIGKEIT (`due_at <= jetzt`), wie der Motor");
    console.log("sie prüft. Den maßgeblichen Befund liefert `scripts/funktionstest-500-faelligkeit.js`.");
    if (befund.bewertbar && !befund.sichtbareProduktstufeErreichbar) {
      console.log("\nNach der alten Schnittmengenrechnung entstünde hier kein Briefing —");
      console.log("das ist für ein Fenster NACH der Phase erwartbar und KEIN Blocker mehr.");
      console.log("Der Direktpfad /api/cron/lage-briefing ist davon unberührt — er ist aber je");
      console.log("Aufruf auf 240 s begrenzt und wirkt auch auf die fünf REALEN Mandate. Dieser");
      console.log("Startweg treibt ihn bewusst nicht an; das ist eine eigene Freigabe.");
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
    // KORRIGIERT (Abschlussreview): hier stand IMMER das Pauschalwort. Mit
    // `--stufe=` gilt aber das stufengenaue Wort — die Meldung hätte den
    // Betreiber in dieselbe Falle geschickt, die §32.6 A beschreibt.
    const stufeFuerWort = argument(argv, "stufe");
    const noetigesWort = (() => {
      if (!stufeFuerWort) return Z.FREIGABEWORT;
      const st = require("../lib/helmut/testkohorte-stufen");
      const s2 = String(stufeFuerWort).trim().toLowerCase();
      return st.STUFEN.includes(s2) ? st.startfreigabe(s2, {}).erwartetesWort
        : `(unbekannte Stufe „${s2}“ — keine Freigabe möglich)`;
    })();
    console.log(`    Nötig: ${Z.EXECUTE_FLAG}=1 und ${Z.CONFIRM_VARIABLE}=${noetigesWort}\n`);
  }

  // ── DER HANDSCHALTER IST WEG (Kreisschluss-Analyse 02.09., bestätigter Befund) ──
  //
  // Hier stand `startbereit: argument(argv, "startbereit") === "ja" ? true : null`.
  // Das ersetzte die Messung durch eine BEHAUPTUNG: gemessen löste
  // `--startbereit=ja` zwei echte scharfe Routenaufrufe gegen /api/cron/pipeline
  // aus, ohne dass irgendeine Fälligkeits- oder Bestandsmessung stattgefunden
  // hätte. Weil das Tor am alten Stand im Zielfenster praktisch immer rot war,
  // wäre genau dieser Schalter unter Zeitdruck der naheliegende Ausweg gewesen —
  // und damit ein falsches Grün im Sinne von `CLAUDE.md` §4.4.
  //
  // Die Startbereitschaft wird jetzt AUSGERECHNET, nicht behauptet. Wer sie ohne
  // Messung will, bekommt sie nicht.
  const stufe = argument(argv, "stufe") || null;
  const rohFenster = argument(argv, "faelligkeitsfenster");
  let faelligkeitsfenster = null;
  if (rohFenster) {
    try {
      faelligkeitsfenster = JSON.parse(rohFenster);
    } catch (fehler) {
      console.error(`Abbruch: --faelligkeitsfenster ist kein gültiges JSON: `
        + `${(fehler && fehler.message) || fehler}`);
      process.exit(2);
    }
  }
  // ── ALLE EINGABEN DER STARTBEREITSCHAFT DURCHREICHEN ────────────────────
  // BEFUND BEIDER ABSCHLUSSREVIEWS (bestätigt): das CLI übergab weder
  // Konfiguration noch Abbruchgrenzen, Messungen, Isolation oder bestandene
  // Stufen — es blieben unabhängig von der Umgebung 11 bis 12 Hürden offen.
  // `startbereit` war damit über den ausgelieferten Weg unerreichbar, egal wie
  // sorgfältig der Betreiber vorbereitet hatte.
  const jsonArgument = (name) => {
    const roh = argument(argv, name);
    if (!roh) return null;
    try {
      return JSON.parse(roh);
    } catch (fehler) {
      console.error(`Abbruch: --${name} ist kein gültiges JSON: `
        + `${(fehler && fehler.message) || fehler}`);
      process.exit(2);
    }
    return null;
  };
  const konfiguration = jsonArgument("konfiguration");
  const grenzen = jsonArgument("grenzen");
  const messungen = jsonArgument("messungen");
  const bestandeneStufen = jsonArgument("bestandene-stufen");
  const isolation = argv.includes("--isolation-belegt") ? true : null;
  const parallelitaetBelegt = argv.includes("--parallelitaet-belegt");

  const bereitschaft = require("../lib/helmut/funktionstest-500").startbereitschaft({
    stufe, faelligkeitsfenster, env: process.env,
    ...(konfiguration ? { konfiguration } : {}),
    ...(grenzen ? { grenzen } : {}),
    ...(messungen ? { messungen } : {}),
    ...(Array.isArray(bestandeneStufen) ? { bestandeneStufen } : {}),
    isolation,
    parallelitaetBelegt,
    // KORRIGIERT (Abschlussreview, BLOCKIEREND, von beiden Prüfern bestätigt):
    // hier stand `startfensterBefund.eingabe` — dieses Feld gibt es nicht.
    // `pruefeStartfenster` liefert `startErlaubt`, `grund`, `startMinuteUtc`,
    // `endeMinuteUtc`, `gepruefteCrons`, `konflikte`, `meldung` — kein `eingabe`.
    // Der Ausdruck war also IMMER `{}`, die Startfensterhürde damit strukturell
    // unerfüllbar, und `startbereit` im einzigen Betreiber-CLI unerreichbar.
    // Übergeben werden jetzt dieselben Eingaben, aus denen der Befund gebaut wurde.
    startfenster: start && dauer
      ? { startUtc: `2026-01-01T${start}:00Z`, dauerMinuten: Number(dauer), crons: CRONS }
      : {}
  });
  if (argv.includes("--startbereit=ja")) {
    console.error("Abbruch: `--startbereit=ja` gibt es nicht mehr. Die Startbereitschaft war "
      + "damit eine Behauptung statt einer Messung — und der scharfe Fachzyklus lief gegen "
      + "die echte Route, ohne dass je etwas gemessen wurde.");
    console.error("Übergib stattdessen `--stufe=` und `--faelligkeitsfenster=<json>` "
      + "(inklusive `bestand`), damit die Startbereitschaft ausgerechnet werden kann.");
    process.exit(2);
  }
  // Die Startbereitschaft wird IMMER gedruckt, nicht nur im scharfen Lauf —
  // der Trockenlauf ist der Weg, auf dem der Betreiber sie vorbereitet.
  console.log(`\n=== Startbereitschaft (ausgerechnet) ===`);
  console.log(`startbereit: ${bereitschaft.startbereit}`);
  if (bereitschaft.offen.length) {
    console.log(`${bereitschaft.offen.length} offene Hürde(n):`);
    for (const o of bereitschaft.offen) console.log(`  · ${o}`);
    console.log("\nDie Eingaben dafür nimmt dieses CLI entgegen: --konfiguration=<json>, "
      + "--grenzen=<json>, --messungen=<json>, --bestandene-stufen=<json>, "
      + "--faelligkeitsfenster=<json> (mit `bestand`), --isolation-belegt, "
      + "--parallelitaet-belegt, --stufe=.");
  }
  if (scharfGewuenscht && bereitschaft.startbereit !== true) {
    console.log("\nDer scharfe Lauf fällt deshalb auf den Trockenlauf zurück.");
  }

  const ergebnis = await Z.fuehreZyklusAus({
    modus: scharfGewuenscht ? Z.MODUS_SCHARF : Z.MODUS_TROCKENLAUF,
    env: process.env,
    startfensterBefund,
    jetztUtc,
    parallel,
    stufe,
    maxScheiben: argument(argv, "scheiben") ? Number(argument(argv, "scheiben")) : null,
    startbereit: bereitschaft.startbereit === true ? true : null
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
