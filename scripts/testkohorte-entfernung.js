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
// SR §37.5 (3): reine Logik, keine Netz-/DB-/storage.js-Abhaengigkeit.
const VORFLUG = require("../lib/helmut/speicherpfad-vorflug");

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
    console.log(`    Nötig: ${E.EXECUTE_FLAG}=1 und ${E.CONFIRM_VARIABLE}=${wort || "<unbekannte Stufe>"}`);
    console.log(`    Vorgesehene Profilanzahl: ${kennungen ? kennungen.length : (S.STUFEN_UMFANG[String(stufe).toLowerCase()] || "?")}`);
    console.log("    Aktivierungsstatus      : entfernt nur INAKTIVE Zeilen — aktive werden übersprungen");
    // ── VORFLUG-RIEGEL (SR §37.5 (3), Vorfall 04.09.) ───────────────────────
    // Die Entfernung schreibt über `deleteProfileData`/`deleteTenantScopedData`
    // ebenfalls die geteilte Zeile `main` und läuft dabei durch `compactStore`.
    // Ohne belegte Umgebungswerte gilt hier dasselbe Risiko wie bei der
    // Provisionierung: eine fremde Liste im selben Blob würde still gekürzt.
    console.log(`\n${VORFLUG.pruefeSpeicherpfad({
      env: process.env, zweck: `Kohorten-Entfernung Stufe ${String(stufe).toUpperCase()}`
    }).meldung}\n`);
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

  // BEHOBEN 02.09. (adversariale Gegenpruefung): der Bibliotheksvertrag war
  // ehrlich, die PROZESSSCHNITTSTELLE nicht. Ein scharfer Lauf mit `ok: false` —
  // etwa eine leere Zielmenge — beendete sich mit Exitcode 0. Ein Aufruf wie
  //   node scripts/testkohorte-entfernung.js --stufe=c --scharf --ids=,, && echo FERTIG
  // meldete damit Erfolg, ohne eine einzige Zeile entfernt zu haben. Wer den
  // Rueckbau skriptet, haette genau daran vorbeigelesen.
  //
  // Der Trockenlauf bleibt ausdruecklich Exitcode 0 — er ist der Normalfall und
  // kein Fehler. Ein SCHARFER Lauf ohne `ok` ist dagegen ein Fehlschlag.
  if (ergebnis.modus === E.MODUS_SCHARF && ergebnis.ok !== true) {
    console.log("\nScharfer Lauf ohne bestaetigten Erfolg (ok=false) — Exitcode 1.");
    if (ergebnis.zielGroesse === 0) {
      console.log("Die Zielmenge war LEER. Das ist kein Erfolg, sondern ein Aufrufparameterfehler.");
    }
    process.exit(1);
  }

  // Ein Trockenlauf ist kein Fehler — er ist der Normalfall.
  process.exit(0);
}

main().catch((fehler) => {
  const grund = fehler && fehler.grund ? ` (${fehler.grund})` : "";
  console.error(`Abbruch${grund}: ${(fehler && fehler.message) || fehler}`);
  // Ein unsicherer Speicherpfad ist ein UMGEBUNGSfehler (Exitcode 2), kein
  // fachlicher Fehlschlag (Exitcode 1) — er wird VOR dem ersten Schreibvorgang
  // gemeldet (SR §37.5 (3)).
  process.exit(fehler && fehler.grund === "speicherpfad-unsicher" ? 2 : 1);
});
