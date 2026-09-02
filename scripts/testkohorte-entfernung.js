#!/usr/bin/env node
"use strict";

// Helmut — BETREIBER-CLI: VOLLSTÄNDIGE ENTFERNUNG einer Teststufe (A/B/C).
// =============================================================================
// Dies ist der gefährlichste Befehl des ganzen Vorhabens: er ENTFERNT Zeilen,
// er deaktiviert sie nicht. Deshalb ist er strenger verriegelt als jeder andere.
//
// STANDARD IST DER TROCKENLAUF. Ohne ALLE vier Bedingungen wird nichts geschrieben:
//   1. `--stufe=a|b|c`  (ohne Stufe gibt es keine Erlaubnisliste, also keinen Lauf)
//   2. `--scharf`
//   3. `HELMUT_TESTKOHORTE_EXECUTE=1`
//   4. `HELMUT_TESTKOHORTE_CONFIRM=TESTKOHORTE_STUFE_<A|B|C>_ENTFERNUNG_BESTAETIGT`
// Das Wort ist STUFENGENAU: die Freigabe für Stufe A kann die 400 Profile der
// Stufe C strukturell nicht treffen.
//
// ZUSÄTZLICHE VORSTUFE: entfernt wird nur, was INAKTIV ist. Ein noch aktives
// Profil wird übersprungen und gemeldet — erst deaktivieren
// (`scripts/testkohorte-rueckbau.js`), dann entfernen.
//
// WICHTIG — WARUM DER SCHARFE LAUF NICHT ÜBER `scripts/lokal.js` GEHT:
// `lokal.js` entfernt die Production-Kennungen aus der Kindprozess-Umgebung
// (CLAUDE.md §6) — richtig für Tests, falsch für den einen Lauf, der Production
// erreichen MUSS. Der Trockenlauf dagegen gehört über `lokal.js`.
//
// Aufrufe:
//   node scripts/lokal.js -- node scripts/testkohorte-entfernung.js --stufe=c
//   node scripts/lokal.js -- node scripts/testkohorte-entfernung.js --stufe=c --ids=a,b
//   node scripts/testkohorte-entfernung.js --stufe=c --scharf     (nur mit Freigabe)
//   node scripts/lokal.js -- node scripts/testkohorte-entfernung.js --vertrag
//
// DIESER SPRINT HAT DAS WERKZEUG NICHT SCHARF AUSGEFÜHRT.

const E = require("../lib/helmut/testkohorte-entfernung");
const S = require("../lib/helmut/testkohorte-stufen");

function argument(argv, name) {
  const treffer = argv.find((a) => a.startsWith(`--${name}=`));
  return treffer ? treffer.slice(name.length + 3) : "";
}

async function main() {
  const argv = process.argv.slice(2);

  // ── `--vertrag`: rein lesende Übersicht aller Stufenfreigaben ─────────────
  if (argv.includes("--vertrag")) {
    const v = S.alleStufenvertraege(process.env);
    console.log("\n=== Stufenvertrag des 500er-Funktionstests (rein lesend) ===");
    console.log(v.meldung + "\n");
    for (const st of v.stufen) {
      console.log(`Stufe ${st.stufe.toUpperCase()}: ${st.umfang} Profile · nach dieser Stufe `
        + `${st.aktivNachStufe} synthetisch aktiv (+5 real = ${st.gesamtAktivMitRealen})`);
      for (const vg of st.vorgaenge) {
        const zeichen = !vg.schreibend ? "lesend " : (vg.erteilt ? "FREI   " : "gesperrt");
        console.log(`   [${zeichen}] ${vg.vorgang}${vg.erwartetesWort ? ` — ${vg.erwartetesWort}` : ""}`);
      }
      console.log("");
    }
    process.exit(0);
  }

  const stufe = argument(argv, "stufe");
  if (!stufe) {
    console.error("Abbruch: --stufe=a|b|c fehlt. Ohne Stufe gibt es keine Erlaubnisliste, also keinen Lauf.");
    process.exit(2);
  }

  const scharfGewuenscht = argv.includes("--scharf");
  const rohIds = argument(argv, "ids");
  const kennungen = rohIds ? rohIds.split(",").map((s) => s.trim()).filter(Boolean) : null;

  if (scharfGewuenscht) {
    const wort = (S.STUFEN_FREIGABEWORTE[String(stufe).toLowerCase()] || {}).entfernung;
    console.log("!!! SCHARFE ENTFERNUNG ANGEFORDERT — Production-Zeilen werden GELÖSCHT !!!");
    console.log(`    Stufe ${String(stufe).toUpperCase()} · ausschließlich Kohortenkennungen DIESER Stufe.`);
    console.log("    Aktive Profile werden übersprungen, nicht gelöscht.");
    console.log(`    Nötig: ${E.EXECUTE_FLAG}=1 und ${E.CONFIRM_VARIABLE}=${wort || "<unbekannte Stufe>"}\n`);
  }

  const ergebnis = await E.fuehreEntfernungAus({
    stufe,
    kennungen,
    modus: scharfGewuenscht ? E.MODUS_SCHARF : E.MODUS_TROCKENLAUF,
    env: process.env
  });

  console.log(`\n=== Entfernung Stufe ${ergebnis.stufe.toUpperCase()} (${ergebnis.modus}) ===`);
  console.log(ergebnis.meldung);
  console.log(JSON.stringify({
    stufe: ergebnis.stufe,
    stufenUmfang: ergebnis.stufenUmfang,
    modus: ergebnis.modus,
    modusGewuenscht: ergebnis.modusGewuenscht,
    freigabe: ergebnis.freigabe,
    zielGroesse: ergebnis.zielGroesse,
    entfernt: ergebnis.entfernt,
    nichtVorhanden: ergebnis.nichtVorhanden,
    uebersprungenAktiv: ergebnis.uebersprungenAktiv,
    fehlgeschlagen: ergebnis.fehlgeschlagen,
    realeMandateBeruehrt: ergebnis.realeMandateBeruehrt,
    ok: ergebnis.ok
  }, null, 2));

  if (ergebnis.uebersprungenAktiv > 0) {
    console.log(`\n${ergebnis.uebersprungenAktiv} Profil(e) sind NOCH AKTIV und wurden NICHT entfernt.`);
    console.log("Nächster Schritt: erst deaktivieren (`node scripts/testkohorte-rueckbau.js --scharf`), "
      + "dann diesen Lauf wiederholen. Er ist idempotent.");
  }

  if (ergebnis.fehlgeschlagen > 0) {
    console.log("\nNICHT bestätigt entfernt:");
    for (const e of ergebnis.ergebnisse.filter((x) => x.zustand !== "entfernt" && x.zustand !== "nicht-vorhanden")) {
      console.log(`  ${e.id}: ${e.zustand}${e.schreibfehler ? ` · Schreibfehler: ${e.schreibfehler}` : ""}`
        + `${e.lesefehler ? ` · Lesefehler: ${e.lesefehler}` : ""}`);
    }
    process.exit(1);
  }

  if (ergebnis.uebersprungenAktiv > 0) process.exit(1);

  // Ein Trockenlauf ist kein Fehler — er ist der Normalfall.
  process.exit(0);
}

main().catch((fehler) => {
  console.error(`Abbruch: ${(fehler && fehler.message) || fehler}`);
  process.exit(1);
});
