#!/usr/bin/env node
"use strict";

// Helmut — BETREIBER-CLI: der Ablaufplan des 500er-Funktionstests.
// =============================================================================
// Druckt den vollständigen Ablauf, seine Vorbedingungen, seine Einzelfreigaben
// und die exakten, später zu setzenden Betreiberwerte.
//
// DIESES WERKZEUG FÜHRT NICHTS AUS. Es liest keine Datenbank, kein Netz, keine
// Umgebung mit Secrets; es aktiviert nichts, setzt nichts und provisioniert
// nichts. Ein `--scharf` gibt es hier bewusst nicht — jede Production-Aktion
// bleibt eine eigene, ausdrückliche Betreiberfreigabe (CLAUDE.md §5).
//
// Aufrufe:
//   node scripts/lokal.js -- node scripts/funktionstest-500-ablauf.js plan
//   node scripts/lokal.js -- node scripts/funktionstest-500-ablauf.js plan --belegt=grundlinie-erhoben,sicherung-geprueft
//   node scripts/lokal.js -- node scripts/funktionstest-500-ablauf.js werte
//   node scripts/lokal.js -- node scripts/funktionstest-500-ablauf.js fenster [--dauer=120]
//   node scripts/lokal.js -- node scripts/funktionstest-500-ablauf.js regeln

const A = require("../lib/helmut/funktionstest-ablaufplan");
const F = require("../lib/helmut/funktionstest-500");
const CRONS = require("../vercel.json").crons;

const WERKZEUGE = ["plan", "werte", "fenster", "regeln", "vorbedingungen"];

function argument(argv, name) {
  const treffer = argv.find((a) => a.startsWith(`--${name}=`));
  return treffer ? treffer.slice(name.length + 3) : "";
}

function drucke(titel, objekt) {
  console.log(`\n=== ${titel} ===`);
  console.log(JSON.stringify(objekt, null, 2));
}

function main() {
  const argv = process.argv.slice(2);
  const werkzeug = (argv[0] || "").trim();

  if (!WERKZEUGE.includes(werkzeug)) {
    console.error(`Werkzeug fehlt oder ist unbekannt. Erlaubt: ${WERKZEUGE.join(", ")}`);
    process.exit(2);
  }
  if (argv.includes("--scharf")) {
    console.error(
      "Dieses Werkzeug hat keinen scharfen Lauf. Es druckt den Ablauf, es führt ihn nicht aus.\n"
      + "Jede Production-Aktion des Plans ist nach CLAUDE.md §5 einzeln freigabepflichtig."
    );
    process.exit(2);
  }

  if (werkzeug === "plan") {
    const roh = argument(argv, "belegt");
    const belegt = roh ? roh.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const plan = A.ablaufplan({ belegt });
    console.log("\n=== Ablaufplan 500er-Funktionstest (GESPERRT, führt nichts aus) ===");
    for (const s of plan.schritte) {
      const marke = s.erledigt ? "✔" : (s.darfBeginnen ? "·" : "×");
      console.log(`\n${marke} ${String(s.nr).padStart(2)} ${s.titel}`);
      console.log(`     Art:        ${s.art}${s.immerErlaubt ? " (Rückweg — nie gesperrt)" : ""}`);
      console.log(`     Befehl:     ${s.befehl}`);
      if (s.freigabe) {
        console.log(`     Freigabe:   ${s.freigabe.art}`
          + (s.freigabe.flag ? ` · ${s.freigabe.flag}=1 · ${s.freigabe.variable}=${s.freigabe.wort}` : ""));
      }
      if (s.abbruchkontrolle) console.log(`     Abbruch:    ${s.abbruchkontrolle}`);
      console.log(`     Zustand:    ${s.meldung}`);
    }
    console.log(`\nNächster möglicher Schritt: ${plan.naechsterSchritt || "(keiner — alle Vorbedingungen offen oder erledigt)"}`);
    console.log(`Production-/Umgebungsschritte mit eigener Freigabe: ${plan.einzelfreigabenGesamt}`);
    console.log(plan.hinweis);
    return;
  }

  if (werkzeug === "werte") {
    drucke("Vorbereitete Betreiberwerte (NICHT gesetzt)", A.vorbereitung());
    return;
  }

  if (werkzeug === "fenster") {
    const dauer = Number(argument(argv, "dauer") || 60);
    drucke("Sichere Startfenster (UTC)", F.sichereStartfenster({
      crons: CRONS,
      mindestDauerMinuten: Number.isFinite(dauer) && dauer > 0 ? Math.floor(dauer) : 60
    }));
    return;
  }

  if (werkzeug === "regeln") {
    drucke("Abbruchregeln", {
      anzahl: F.ABBRUCHREGELN.length,
      pflichtgrenzen: F.GRENZEN_PFLICHT,
      regeln: F.ABBRUCHREGELN.map((r) => ({
        id: r.id, name: r.name, beobachtung: r.beobachtung,
        grenze: r.grenzeFest !== null ? r.grenzeFest : `konfiguriert: ${r.grenzeSchluessel}`,
        quelle: r.quelle
      }))
    });
    return;
  }

  drucke("Vorbedingungen", A.VORBEDINGUNGEN);
}

try {
  main();
} catch (fehler) {
  console.error(`Abbruch: ${(fehler && fehler.message) || fehler}`);
  process.exit(1);
}
