#!/usr/bin/env node
"use strict";

// Helmut — BETREIBER-CLI: Fälligkeitsbefund eines Testfensters (rein lesend).
// =============================================================================
// Es rechnet und schreibt nichts. Kein Netzaufruf, keine Datenbank, keine Route.
// Alle Zahlen entstehen aus der ECHTEN Planungsfunktion
// `source-demand.planeMandatsarbeit` — derselben, die der Motor benutzt.
//
// WOZU. Seit der Betreiberentscheidung vom 02.09. prüft das Startfenster-Tor die
// FÄLLIGKEIT (`due_at <= jetzt`) statt einer Schnittmenge mit dem Streuintervall.
// Dieses Werkzeug macht den Befund für ein konkretes Fenster sichtbar, bevor
// irgendetwas gestartet wird.
//
// Aufrufe (immer über `lokal.js` — es braucht keine Zugangsdaten):
//   node scripts/lokal.js -- node scripts/funktionstest-500-faelligkeit.js \
//        --stufe=c --start=2026-09-03T21:36:00Z --ende=2026-09-04T03:59:00Z
//   … zusätzlich --geplant=2026-09-03T20:00:00Z  (Planungszeitpunkt; Standard: Fensterbeginn)
//   … zusätzlich --offen=495,495                 (mandate_projection,briefing_materialization)
//   … zusätzlich --weitere=<kennung,…>          die am Testtag AKTIVEN Mandate AUSSERHALB
//                  der Kohorte. Sie stehen in Production mit in der Rangkarte und
//                  verschieben die Fälligkeiten. Ohne sie meldet der Befund
//                  `rotationVollstaendig: false` und die Startbedingung ist NICHT erfüllt.
//                  Bewusst OHNE eingebauten Standardwert: kein Mandant steht in diesem Repo.
//   … --sql        gibt die rein lesende Abfrage aus, die `--offen` liefert
//                  (gefiltert mit --ende=, --fenster=<JJJJ-MM-TThhZ> und --stufe=)
//   … --alle       rechnet alle drei empfohlenen Fenster gegen alle drei Stufen
//
// DER PLANUNGSZEITPUNKT IST NICHT KOSMETIK. Er entscheidet über den
// Frischefensterschlüssel: eine Planung nach 00:00 UTC legt die Fälligkeiten auf
// den FOLGETAG, und im Nachtfenster ist dann kein einziger Auftrag beanspruchbar.

const F = require("../lib/helmut/funktionstest-faelligkeit");
const S = require("../lib/helmut/testkohorte-stufen");

function argument(argv, name) {
  const treffer = argv.find((a) => a.startsWith(`--${name}=`));
  return treffer ? treffer.slice(name.length + 3) : "";
}

function zeit(roh, was) {
  const ms = Date.parse(String(roh || ""));
  if (!Number.isFinite(ms)) {
    console.error(`Abbruch: ${was} ist kein gültiger Zeitpunkt (erwartet ISO-8601 mit Z): ${roh || "(leer)"}`);
    process.exit(2);
  }
  return ms;
}

function zeigeBefund(b, praefix = "") {
  if (b.bewertbar !== true) {
    console.log(`${praefix}NICHT BEWERTBAR: ${b.grund}`);
    return;
  }
  console.log(`${praefix}Fenster ${b.fensterStartIso} → ${b.fensterEndeIso} (${b.fensterMinuten} min)`
    + `${b.ueberschreitetMitternacht ? " · überschreitet Mitternacht" : ""}`);
  console.log(`${praefix}Kohorte ${b.kohortenGroesse} · Plan geschrieben ${b.planungsZeitpunktIso}`);
  console.log(`${praefix}Rotation: ${b.rotationsQuelle} über ${b.rotationsGroesse} Mandate · `
    + `vollständig: ${b.rotationVollstaendig}`
    + (b.rotationVollstaendig ? "" : "  ← ohne die übrigen aktiven Mandate NICHT Production"));
  console.log(`${praefix}Frischefenster: Plan ${b.frischefensterDesPlans} · Fensterbeginn `
    + `${b.frischefensterDesFensterbeginns} · passt: ${b.planPasstZumFenster}`);
  for (const k of b.klassen) {
    console.log(`${praefix}  ${k.jobType}`);
    console.log(`${praefix}    geplant ${k.geplant} · bei Start fällig ${k.beiStartFaellig} · `
      + `im Fenster zusätzlich ${k.imFensterZusaetzlichFaellig}`);
    console.log(`${praefix}    bis Fensterende beanspruchbar ${k.bisFensterendeBeanspruchbar} · `
      + `nicht beanspruchbar ${k.nichtBeanspruchbar} · Abdeckung `
      + `${k.abdeckungProzent.toFixed(1)} % · vollständig: ${k.vollstaendigeAbdeckung}`);
    console.log(`${praefix}    Fälligkeit ${k.fruehesteFaelligkeitIso} … ${k.spaetesteFaelligkeitIso}`);
  }
  console.log(`${praefix}Abdeckung erreicht: ${b.abdeckungErreicht} · offene Aufträge gemessen: `
    + `${b.offeneAuftraegeGemessen} · vollständiger Zyklus: `
    + `${b.vollstaendigerZyklus === null ? "NICHT BEWERTBAR" : b.vollstaendigerZyklus}`);
  console.log(`${praefix}${b.urteil}`);
}

function main() {
  const argv = process.argv.slice(2);

  if (argv.includes("--sql")) {
    const ende = argument(argv, "ende");
    const fenster = argument(argv, "fenster");
    const stufeSql = argument(argv, "stufe");
    console.log(F.erhebungsSql({
      ...(ende ? { fensterEndeIso: ende } : {}),
      ...(fenster ? { frischefenster: fenster } : {}),
      ...(stufeSql ? { stufe: stufeSql } : {})
    }));
    process.exit(0);
  }

  // `--alle`: die drei empfohlenen Fenster gegen alle drei Stufen. Der Tag ist
  // frei wählbar, weil die Fälligkeit datumsabhängig ist.
  if (argv.includes("--alle")) {
    const tag = argument(argv, "tag") || "2026-09-03";
    const rohW = argument(argv, "weitere");
    const weitereUebersicht = rohW ? rohW.split(",").map((x) => x.trim()).filter(Boolean) : null;
    const folgetag = new Date(Date.parse(`${tag}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    const fenster = [
      ["11:36–15:59 UTC", `${tag}T11:36:00Z`, `${tag}T15:59:00Z`],
      ["17:36–19:59 UTC", `${tag}T17:36:00Z`, `${tag}T19:59:00Z`],
      ["21:36–03:59 UTC", `${tag}T21:36:00Z`, `${folgetag}T03:59:00Z`]
    ];
    console.log(`\n=== Fälligkeitsbefund aller empfohlenen Fenster · Tag ${tag} (rein lesend) ===`);
    for (const [name, s, e] of fenster) {
      console.log(`\n── ${name} ──`);
      for (const stufe of S.STUFEN) {
        const b = F.faelligkeitsBefund({
          stufe, fensterStartMs: Date.parse(s), fensterEndeMs: Date.parse(e),
          planungsZeitpunktMs: Date.parse(s), weitereAktiveMandate: weitereUebersicht
        });
        const p = b.bewertbar ? b.produktstufe : null;
        console.log(`   Stufe ${stufe.toUpperCase()} (${b.kohortenGroesse ?? "?"} Profile): `
          + (p
            ? `Produktstufe ${p.bisFensterendeBeanspruchbar}/${p.geplant} = `
              + `${p.abdeckungProzent.toFixed(1)} % · Abdeckung erreicht: ${b.abdeckungErreicht}`
            : `NICHT BEWERTBAR (${b.grund})`));
      }
    }
    console.log("\nHinweis: „Abdeckung erreicht\" ist die FÄLLIGKEIT. Für das Urteil "
      + "„vollständiger Zyklus\" fehlt die rein lesend erhobene Zahl OFFENER Aufträge "
      + "(`--sql` gibt die Abfrage aus).");
    if (!weitereUebersicht) {
      console.log("Ohne `--weitere=` fehlen die übrigen am Testtag aktiven Mandate in der "
        + "Rangkarte — die Prozentwerte sind dann NICHT die von Production.");
    }
    // ÜBERSICHT IST KEIN URTEIL. `--alle` hat keine `--offen`-Zahlen, kann also
    // keinen vollständigen Zyklus belegen — und darf deshalb keinen
    // Erfolgs-Exitcode liefern: eine Automatisierung läse sonst ein Grün.
    console.log("Dieser Übersichtslauf FÄLLT KEIN URTEIL und endet mit Exitcode 1. "
      + "Ein Urteil liefert nur der Einzellauf mit `--offen=`.");
    process.exit(1);
  }

  const stufe = argument(argv, "stufe");
  if (!stufe) {
    console.error("Abbruch: --stufe=a|b|c fehlt. Ohne Stufe gibt es keine Kohorte und keinen Befund.");
    console.error("Übersicht aller Fenster und Stufen: --alle");
    process.exit(2);
  }
  const start = zeit(argument(argv, "start"), "--start");
  const ende = zeit(argument(argv, "ende"), "--ende");
  const rohGeplant = argument(argv, "geplant");
  const geplant = rohGeplant ? zeit(rohGeplant, "--geplant") : start;

  // `--offen=495,495` — die rein lesend erhobenen Zahlen. Ohne sie bleibt das
  // Urteil ausdrücklich NICHT BEWERTBAR.
  const rohOffen = argument(argv, "offen");
  let offeneAuftraege = null;
  if (rohOffen) {
    const teile = rohOffen.split(",").map((x) => Number(String(x).trim()));
    if (teile.length !== 2 || !teile.every((n) => Number.isFinite(n) && n >= 0)) {
      console.error("Abbruch: --offen erwartet zwei nicht-negative Zahlen "
        + "(mandate_projection,briefing_materialization), z. B. --offen=495,495");
      process.exit(2);
    }
    offeneAuftraege = { mandate_projection: teile[0], briefing_materialization: teile[1] };
  }

  const rohWeitere = argument(argv, "weitere");
  const weitereAktiveMandate = rohWeitere
    ? rohWeitere.split(",").map((x) => x.trim()).filter(Boolean)
    : null;

  const befund = F.faelligkeitsBefund({
    stufe, fensterStartMs: start, fensterEndeMs: ende,
    planungsZeitpunktMs: geplant, offeneAuftraege, weitereAktiveMandate
  });

  console.log(`\n=== Fälligkeitsbefund Stufe ${String(stufe).toUpperCase()} (rein lesend) ===`);
  zeigeBefund(befund, "");

  if (befund.bewertbar === true && befund.offeneAuftraegeGemessen !== true) {
    console.log("\nDie fehlende Zahl liefert diese rein lesende Abfrage:");
    // MIT Frischefenster- und Stufenfilter — ohne sie zählte die Abfrage
    // zurückgestellte Aufträge FRÜHERER Tage und fremde Stufen mit.
    console.log(F.erhebungsSql({
      fensterEndeIso: befund.fensterEndeIso,
      frischefenster: befund.frischefensterDesPlans,
      stufe: befund.stufe
    }));
  }

  // Exitcode: 0 nur bei einem belegten vollständigen Zyklus. `null` (nicht
  // bewertbar) ist ausdrücklich KEIN Erfolg — sonst wäre eine fehlende Messung
  // ein grünes Ergebnis.
  process.exit(befund.bewertbar === true && befund.vollstaendigerZyklus === true ? 0 : 1);
}

// ABBRUCH STATT STACKTRACE (02.09., zweiter adversarialer Review): `erhebungsSql`
// wirft bei ungueltigen Eingaben — richtig so, aber der Aufrufer soll dann eine
// lesbare Meldung ausgeben, nicht einen Stacktrace. Vorbild:
// `scripts/testkohorte-entfernung.js`.
try {
  main();
} catch (fehler) {
  console.error(`Abbruch: ${(fehler && fehler.message) || fehler}`);
  process.exit(2);
}
