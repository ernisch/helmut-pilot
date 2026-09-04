#!/usr/bin/env node
"use strict";

// Helmut — BETREIBER-CLI: Rückbau der 495er-Testkohorte (Deaktivierung).
// =============================================================================
// Der Rückweg des 500er-Funktionstests. Er deaktiviert AUSSCHLIESSLICH die 495
// deterministischen Kohortenkennungen — eine fremde Kennung bricht den Vorgang
// ab, sie wird nicht gefiltert. Es gibt KEINEN Löschpfad.
//
// STANDARD IST DER TROCKENLAUF. Ohne alle drei Bedingungen wird nichts
// geschrieben:
//   1. `--scharf`
//   2. `HELMUT_TESTKOHORTE_EXECUTE=1`
//   3. `HELMUT_TESTKOHORTE_CONFIRM=TESTKOHORTE_495_DEAKTIVIEREN_BESTAETIGT`
// Fehlt eine davon, fällt der Lauf auf den Trockenlauf zurück und meldet das.
//
// WICHTIG — WARUM DIESER EINE LAUF NICHT ÜBER `scripts/lokal.js` GEHT:
// `lokal.js` entfernt die Production-Kennungen aus der Kindprozess-Umgebung
// (CLAUDE.md §6) — genau richtig für Tests, und genau falsch für den einen Lauf,
// der Production erreichen MUSS. Der scharfe Rückbau wird deshalb direkt
// gestartet. Der Trockenlauf dagegen gehört über `lokal.js`, weil er nichts
// braucht als die Kennungsliste.
//
// Aufrufe:
//   node scripts/lokal.js -- node scripts/testkohorte-rueckbau.js            (Trockenlauf)
//   node scripts/lokal.js -- node scripts/testkohorte-rueckbau.js --ids=a,b  (Teilmenge)
//   node scripts/testkohorte-rueckbau.js --scharf                            (nur mit Freigabe)
//   node scripts/testkohorte-rueckbau.js --spur                              (Trockenlauf Nacharbeit)
//   node scripts/testkohorte-rueckbau.js --spur --scharf                     (nur mit EIGENEM Wort)
//
// DIESER SPRINT HAT DAS WERKZEUG NICHT SCHARF AUSGEFÜHRT.

const R = require("../lib/helmut/testkohorte-rueckbau");
// SR §37.5 (3): reine Logik, keine Netz-/DB-/storage.js-Abhaengigkeit.
const VORFLUG = require("../lib/helmut/speicherpfad-vorflug");

function argument(argv, name) {
  const treffer = argv.find((a) => a.startsWith(`--${name}=`));
  return treffer ? treffer.slice(name.length + 3) : "";
}

async function main() {
  const argv = process.argv.slice(2);
  const scharfGewuenscht = argv.includes("--scharf");
  const rohIds = argument(argv, "ids");
  const kennungen = rohIds ? rohIds.split(",").map((s) => s.trim()).filter(Boolean) : null;

  // ── NACHARBEIT: `--spur` räumt die Scheduler-Spur auf (eigenes Wort) ───────
  if (argv.includes("--spur")) {
    if (scharfGewuenscht) {
      console.log("!!! SCHARFE NACHARBEIT ANGEFORDERT — Production-Datenänderung !!!");
      console.log("    Entfernt AUSSCHLIESSLICH Scheduler-Metadaten der Kohorte.");
      console.log("    Keine Profil-, Inhalts- oder Kontodaten.");
      console.log(`    Nötig: ${R.EXECUTE_FLAG}=1 und ${R.CONFIRM_VARIABLE}=${R.FREIGABEWORT_SPUR}`);
      console.log(`    Vorgesehene Profilanzahl: ${kennungen ? kennungen.length : "gesamte Kohorte"}`);
      console.log("    Aktivierungsstatus      : aktiviert nichts — entfernt nur Scheduler-Metadaten");
      // Auch die Nacharbeit schreibt über den geteilten Blob `main` und läuft
      // dabei durch `compactStore`. Derselbe Riegel, dieselbe Begründung.
      console.log(`\n${VORFLUG.pruefeSpeicherpfad({
        env: process.env, zweck: "Kohorten-Nacharbeit (Scheduler-Spur)"
      }).meldung}\n`);
    }
    const spur = await R.entferneSchedulerSpur({
      kennungen,
      modus: scharfGewuenscht ? R.MODUS_SCHARF : R.MODUS_TROCKENLAUF,
      env: process.env
    });
    console.log(`\n=== Scheduler-Spur (${spur.modus}) ===`);
    console.log(spur.meldung);
    console.log(JSON.stringify({
      modus: spur.modus,
      modusGewuenscht: spur.modusGewuenscht,
      freigabe: spur.freigabe,
      zielGroesse: spur.zielGroesse,
      entfernt: spur.entfernt,
      fehlgeschlagen: spur.fehlgeschlagen,
      beruehrtProfildaten: spur.beruehrtProfildaten,
      ok: spur.ok
    }, null, 2));
    if (spur.fehlgeschlagen > 0) {
      console.log("\nNICHT bestätigt entfernt:");
      for (const e of spur.ergebnisse.filter((x) => !x.entfernt)) {
        console.log(`  ${e.id}: ${e.fehler || "unbekannt"}`);
      }
      process.exit(1);
    }
    return;
  }

  if (scharfGewuenscht) {
    console.log("!!! SCHARFER RÜCKBAU ANGEFORDERT — Production-Datenänderung !!!");
    console.log("    Es werden ausschließlich Kohortenkennungen deaktiviert. Nichts wird gelöscht.");
    console.log(`    Nötig: ${R.EXECUTE_FLAG}=1 und ${R.CONFIRM_VARIABLE}=${R.FREIGABEWORT}`);
    console.log(`    Vorgesehene Profilanzahl: ${kennungen ? kennungen.length : "gesamte Kohorte"}`);
    console.log("    Aktivierungsstatus      : DEAKTIVIERT (profileActive=false) — löscht nichts");
    // ── VORFLUG-RIEGEL (SR §37.5 (3)) ───────────────────────────────────────
    // Der Rückbau ruft je Kennung `storage.saveProfile` und schreibt damit
    // dieselbe geteilte Zeile `main` wie die Provisionierung. Ohne belegte
    // Umgebungswerte gilt hier genau das Risiko vom 04.09.
    console.log(`\n${VORFLUG.pruefeSpeicherpfad({
      env: process.env, zweck: "Kohorten-Rückbau (Deaktivierung)"
    }).meldung}\n`);
  }

  const ergebnis = await R.fuehreRueckbauAus({
    kennungen,
    modus: scharfGewuenscht ? R.MODUS_SCHARF : R.MODUS_TROCKENLAUF,
    env: process.env
  });

  console.log(`\n=== Rückbau (${ergebnis.modus}) ===`);
  console.log(ergebnis.meldung);
  console.log(JSON.stringify({
    modus: ergebnis.modus,
    modusGewuenscht: ergebnis.modusGewuenscht,
    freigabe: ergebnis.freigabe,
    zielGroesse: ergebnis.zielGroesse,
    deaktiviert: ergebnis.deaktiviert,
    bereitsInaktiv: ergebnis.bereitsInaktiv,
    fehlgeschlagen: ergebnis.fehlgeschlagen,
    ok: ergebnis.ok
  }, null, 2));

  if (ergebnis.fehlgeschlagen > 0) {
    console.log("\nNICHT bestätigt inaktiv:");
    for (const e of ergebnis.ergebnisse.filter((x) => x.zustand !== "inaktiv" && x.zustand !== "nicht-vorhanden")) {
      console.log(`  ${e.id}: ${e.zustand}${e.schreibfehler ? ` · Schreibfehler: ${e.schreibfehler}` : ""}`
        + `${e.lesefehler ? ` · Lesefehler: ${e.lesefehler}` : ""}`);
    }
    console.log("\nNächster Schritt: Bestand rein lesend neu erheben "
      + "(`node scripts/testkohorte-495.js sql`) und diesen Lauf für die verbliebenen "
      + "Kennungen wiederholen (`--ids=...`). Der Lauf ist idempotent.");
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
