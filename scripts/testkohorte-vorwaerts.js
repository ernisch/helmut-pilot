#!/usr/bin/env node
"use strict";

// Helmut — CLI des VORWÄRTSWEGS (Provisionierung + gestufte Aktivierung).
// =============================================================================
// Gegenstück zu `scripts/testkohorte-rueckbau.js`. Standard ist IMMER der
// Trockenlauf: ohne `--scharf` wird nichts aufgerufen und nichts geschrieben.
//
// Ein scharfer Lauf verlangt DREI voneinander unabhängige Dinge:
//   1. `--scharf` auf der Kommandozeile,
//   2. `HELMUT_TESTKOHORTE_EXECUTE=1` UND `HELMUT_TESTKOHORTE_CONFIRM=<Wort des
//      Schrittes>` — jeder Schritt hat sein EIGENES Wort,
//   3. ein geprüfter Startfensterbefund, der JETZT gilt (`--start`/`--dauer`).
// Fehlt eines davon, fällt der Lauf auf den Trockenlauf zurück und sagt warum.
//
// Aufruf:
//   node scripts/testkohorte-vorwaerts.js provisionierung
//   node scripts/testkohorte-vorwaerts.js provisionierung --start=11:40 --dauer=240 --scharf
//   node scripts/testkohorte-vorwaerts.js aktivierung --gruppe=a --start=11:40 --dauer=240
//   node scripts/testkohorte-vorwaerts.js aktivierung --gruppe=a --start=11:40 --dauer=240 --scharf
//
// Der RÜCKWEG liegt bewusst in einem ANDEREN Werkzeug
// (`scripts/testkohorte-rueckbau.js`) und braucht KEIN Fenster.

const path = require("path");
const V = require("../lib/helmut/testkohorte-vorwaerts");
const F = require("../lib/helmut/funktionstest-500");
const K = require("../lib/helmut/testkohorte-betrieb");

const VERCEL = require(path.join(__dirname, "..", "vercel.json"));
const CRONS = VERCEL.crons || [];
const WERKZEUGE = ["provisionierung", "aktivierung"];

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
  const werkzeug = (argv[0] || "").trim();
  if (!WERKZEUGE.includes(werkzeug)) {
    console.error(`Werkzeug fehlt oder ist unbekannt. Erlaubt: ${WERKZEUGE.join(", ")}`);
    process.exit(2);
  }
  const scharfGewuenscht = argv.includes("--scharf");
  const start = argument(argv, "start");
  const dauer = argument(argv, "dauer");

  // Der Fensterbefund wird HIER gerechnet, gegen die echten 13 Bestandscrons und
  // MIT der Watchdog-Vorsichtsspanne — ein Tor darf nie schwächer prüfen als die
  // Empfehlung, die es durchsetzt.
  const startfensterBefund = start && dauer
    ? F.pruefeStartfenster({
      startUtc: `2026-01-01T${start}:00Z`,
      dauerMinuten: Number(dauer),
      crons: CRONS,
      watchdogBeruecksichtigen: true
    })
    : null;
  // Die Uhr kommt vom Aufrufer, nicht aus dem Modul: der Befund muss JETZT gelten.
  const jetztUtc = argument(argv, "jetzt") || new Date().toISOString();

  if (scharfGewuenscht) {
    console.log("!!! SCHARFER VORWÄRTSSCHRITT ANGEFORDERT — Production-Datenänderung !!!");
    console.log("    Es wirkt ausschließlich auf die 495 Kohortenkennungen. Nichts wird gelöscht.");
    console.log("    Der Rückweg bleibt jederzeit und ohne Zeitfenster ausführbar:");
    console.log("      node scripts/testkohorte-rueckbau.js --scharf\n");
  }

  if (werkzeug === "provisionierung") {
    const ergebnis = await V.fuehreProvisionierungAus({
      modus: scharfGewuenscht ? V.MODUS_SCHARF : V.MODUS_TROCKENLAUF,
      env: process.env,
      startfensterBefund,
      jetztUtc
    });
    drucke(`Provisionierung (${ergebnis.modus})`, {
      modus: ergebnis.modus,
      modusGewuenscht: ergebnis.modusGewuenscht,
      freigabe: ergebnis.freigabe,
      startfenster: ergebnis.startfenster,
      zielGroesse: ergebnis.zielGroesse,
      angelegt: ergebnis.angelegt,
      bereitsVorhanden: ergebnis.bereitsVorhanden,
      fehlgeschlagen: ergebnis.fehlgeschlagen,
      legtInaktivAn: ergebnis.legtInaktivAn,
      aktiviertNichts: ergebnis.aktiviertNichts,
      realeMandateBeruehrt: ergebnis.realeMandateBeruehrt,
      ok: ergebnis.ok
    });
    console.log(`\n${ergebnis.meldung}`);
    if (ergebnis.fehlgeschlagen > 0) {
      console.log("\nNICHT bestätigt inaktiv angelegt:");
      for (const e of ergebnis.ergebnisse.filter((x) => x.zustand !== "angelegt-inaktiv")) {
        console.log(`  ${e.id}: ${e.zustand}${e.schreibfehler ? ` · Schreibfehler: ${e.schreibfehler}` : ""}`);
      }
      process.exit(1);
    }
    return;
  }

  const gruppe = (argument(argv, "gruppe") || "").trim().toLowerCase();

  // ─── DER STUFENVERTRAG WIRD GERECHNET, NICHT ZUGESAGT ─────────────────────
  // KORRIGIERT 02.09. (dritter Reviewbefund): Hier stand ein handgetipptes
  // `--vorstufen-vollstaendig=ja`. Das ist dieselbe Klasse Fehler, die dieser
  // Sprint bei A01/A06/A10 beseitigt hat: ein Riegel, dessen Bedingung ein
  // Mensch behauptet, ist kein Riegel. `planeAktivierung` rechnet den
  // Stufenvertrag aus dem rein lesend erhobenen BESTAND — genau das wird jetzt
  // verlangt. Ohne `--grundlinie` und `--bestand` bleibt es beim Trockenlauf.
  const grundlinieDatei = argument(argv, "grundlinie");
  const bestandDatei = argument(argv, "bestand");
  let vorstufenVollstaendig = null;
  let stufenbefund = null;
  if (grundlinieDatei && bestandDatei) {
    const fs = require("fs");
    const plan = K.planeAktivierung({
      grundlinie: JSON.parse(fs.readFileSync(grundlinieDatei, "utf8")),
      bestand: JSON.parse(fs.readFileSync(bestandDatei, "utf8")),
      gruppe,
      startfensterBefund,
      jetztUtc
    });
    vorstufenVollstaendig = plan.vorstufenOffen.length === 0 ? true : null;
    stufenbefund = {
      quelle: "planeAktivierung über den erhobenen Bestand",
      vorstufenOffen: plan.vorstufenOffen,
      nichtAngelegt: plan.nichtAngelegt.length,
      anzahlZuAktivieren: plan.anzahlZuAktivieren
    };
  }

  const ergebnis = await V.fuehreAktivierungAus({
    gruppe,
    modus: scharfGewuenscht ? V.MODUS_SCHARF : V.MODUS_TROCKENLAUF,
    env: process.env,
    startfensterBefund,
    jetztUtc,
    vorstufenVollstaendig
  });
  drucke(`Aktivierung Gruppe ${(ergebnis.gruppe || "?").toUpperCase()} (${ergebnis.modus})`, {
    modus: ergebnis.modus,
    modusGewuenscht: ergebnis.modusGewuenscht,
    freigabe: ergebnis.freigabe,
    startfenster: ergebnis.startfenster,
    vorstufenVollstaendig: ergebnis.vorstufenVollstaendig,
    stufenbefund: stufenbefund || "NICHT GERECHNET — ohne --grundlinie und --bestand bleibt es Trockenlauf",
    blockadeGruende: ergebnis.blockadeGruende,
    zielGroesse: ergebnis.zielGroesse,
    aktiviert: ergebnis.aktiviert,
    bereitsAktiv: ergebnis.bereitsAktiv,
    fehlgeschlagen: ergebnis.fehlgeschlagen,
    beruehrtKeineKonten: ergebnis.beruehrtKeineKonten,
    realeMandateBeruehrt: ergebnis.realeMandateBeruehrt,
    ok: ergebnis.ok
  });
  console.log(`\n${ergebnis.meldung}`);
  if (ergebnis.fehlgeschlagen > 0) {
    console.log("\nNICHT bestätigt aktiv:");
    for (const e of ergebnis.ergebnisse.filter((x) => x.zustand !== "aktiv")) {
      console.log(`  ${e.id}: ${e.zustand}${e.schreibfehler ? ` · Schreibfehler: ${e.schreibfehler}` : ""}`);
    }
    process.exit(1);
  }
}

main().catch((fehler) => {
  console.error(`Abbruch: ${(fehler && fehler.message) || fehler}`);
  process.exit(1);
});
