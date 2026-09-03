#!/usr/bin/env node
"use strict";

// Helmut — CLI des VORWÄRTSWEGS (stufenweise Provisionierung + gestufte Aktivierung).
// =============================================================================
// Gegenstück zu `scripts/testkohorte-rueckbau.js`. Standard ist IMMER der
// Trockenlauf: ohne `--scharf` wird nichts aufgerufen und nichts geschrieben.
//
// BEFUND 03.09. (am Kopf a839c1b reproduziert): Die Bibliothek konnte die
// Provisionierung längst STUFENGENAU ausführen (`fuehreProvisionierungAus({stufe})`,
// Stufe A = 20 Profile, Wort TESTKOHORTE_STUFE_A_PROVISIONIERUNG_BESTAETIGT). Dieses
// CLI reichte die Stufe aber NICHT weiter: `--stufe=a` wurde still ignoriert, der
// Lauf zielte auf alle 495 und verlangte das Pauschalwort. Ein Betreiber, der
// „nur die 20 der Stufe A" anlegen wollte, hätte mit dem Pauschalwort alle 495
// angelegt — genau die Verwechslung, die stufengenaue Freigaben verhindern sollen.
//
// SEITDEM GILT: `--stufe=a|b|c` ist für die Provisionierung PFLICHT.
//   * Fehlt die Stufe, ist sie leer oder unbekannt, bricht das CLI mit Exitcode 2
//     ab — BEVOR irgendein Modul angesprochen wird, das Production erreichen
//     könnte, und ohne Rückfall auf die vollständige Kohorte (495).
//   * Eine unbekannte Angabe (Tippfehler wie `--stuffe=a`, oder `--gruppe=` bei der
//     Provisionierung) wird NICHT still ignoriert, sondern ist ebenfalls ein
//     geschlossener Abbruch. Still ignorierte Angaben waren die Ursache des Befunds.
//   * Eine MEHRFACH gesetzte Angabe (`--stufe=c --stufe=a`) ist ein Abbruch —
//     „die erste gewinnt" wäre dieselbe Klasse stiller Verschiebung
//     (Reviewbefund 03.09.).
//   * `--start`/`--dauer`/`--jetzt` werden geprüft: falsches Format oder ein
//     unvollständiges Fensterpaar ist ein Aufruffehler, kein stiller Trockenlauf.
//   * Die Bibliothek behält ihre Rückwärtsverträglichkeit (ohne `stufe` weiter
//     495 + Pauschalwort) — nur der Betreiberweg hier verlangt die Stufe.
//
// Ein scharfer Lauf verlangt DREI voneinander unabhängige Dinge:
//   1. `--scharf` auf der Kommandozeile,
//   2. `HELMUT_TESTKOHORTE_EXECUTE=1` UND `HELMUT_TESTKOHORTE_CONFIRM=<Wort GENAU
//      DIESER Stufe und DIESES Schrittes>`,
//   3. ein geprüfter Startfensterbefund, der JETZT gilt (`--start`/`--dauer`) —
//      gemessen an der SYSTEMUHR. `--jetzt=` ist eine Prüfuhr für den
//      Trockenlauf und wird im scharfen Lauf ABGEWIESEN (Reviewbefund 03.09.:
//      eine vom Betreiber gesetzte Uhr hätte den dritten Riegel ausgehebelt).
// Fehlt eines davon, fällt der Lauf auf den Trockenlauf zurück und sagt warum.
//
// Aufruf:
//   node scripts/lokal.js -- node scripts/testkohorte-vorwaerts.js provisionierung --stufe=a
//   node scripts/lokal.js -- node scripts/testkohorte-vorwaerts.js provisionierung --stufe=a --start=21:40 --dauer=240 --jetzt=2026-09-10T23:00:00Z
//   node scripts/testkohorte-vorwaerts.js provisionierung --stufe=a --start=21:40 --dauer=240 --scharf
//   node scripts/testkohorte-vorwaerts.js provisionierung --stufe=a --ids=test-kohorte-a-003 --start=… --dauer=… --scharf
//   node scripts/testkohorte-vorwaerts.js aktivierung --gruppe=a --grundlinie=g.json --bestand=b.json --start=21:40 --dauer=240
//   node scripts/testkohorte-vorwaerts.js aktivierung --gruppe=a --grundlinie=g.json --bestand=b.json --start=21:40 --dauer=240 --scharf
//
// Exitcodes: 0 Lauf beendet (Trockenlauf oder bestätigter scharfer Lauf) ·
// 1 Abbruch aus der Bibliothek (fremde/falsche/doppelte Kennung, Fehlschlag je Zeile) ·
// 2 Aufruffehler (Werkzeug, Stufe, Angabe, Fenster oder Uhr fehlt/unbekannt/ungültig)
// — VOR jedem Zugriff.
//
// Der RÜCKWEG liegt bewusst in einem ANDEREN Werkzeug
// (`scripts/testkohorte-rueckbau.js`) und braucht KEIN Fenster.

const path = require("path");
const V = require("../lib/helmut/testkohorte-vorwaerts");
const F = require("../lib/helmut/funktionstest-500");
const K = require("../lib/helmut/testkohorte-betrieb");
const S = require("../lib/helmut/testkohorte-stufen");

const VERCEL = require(path.join(__dirname, "..", "vercel.json"));
const CRONS = VERCEL.crons || [];
const WERKZEUGE = ["provisionierung", "aktivierung"];

// Erlaubte Angaben je Werkzeug. Alles andere ist ein Abbruch — eine still
// ignorierte Angabe hat in diesem Vorhaben schon einmal die Zielmenge von 20 auf
// 495 verschoben (Befund 03.09.).
const ERLAUBTE_ANGABEN = Object.freeze({
  provisionierung: Object.freeze(["stufe", "ids", "start", "dauer", "jetzt"]),
  aktivierung: Object.freeze(["gruppe", "stufe", "start", "dauer", "jetzt", "grundlinie", "bestand"])
});
const ERLAUBTE_SCHALTER = Object.freeze(["--scharf"]);

const EXIT_AUFRUFFEHLER = 2;
const EXIT_BIBLIOTHEK = 1;

function argument(argv, name) {
  const treffer = argv.find((a) => a.startsWith(`--${name}=`));
  return treffer ? treffer.slice(name.length + 3) : null;
}

function drucke(titel, wert) {
  console.log(`\n=== ${titel} ===`);
  console.log(JSON.stringify(wert, null, 2));
}

function abbruch(meldung, code = EXIT_AUFRUFFEHLER) {
  console.error(`Abbruch: ${meldung}`);
  process.exit(code);
}

// Unbekannte UND mehrfach gesetzte Angaben sind ein Abbruch, kein Hinweis.
function pruefeAngaben(werkzeug, argv) {
  const unbekannt = [];
  const gesehen = new Map();
  for (const a of argv) {
    if (ERLAUBTE_SCHALTER.includes(a)) { gesehen.set(a, (gesehen.get(a) || 0) + 1); continue; }
    const m = /^--([^=]+)=/.exec(a);
    if (m && ERLAUBTE_ANGABEN[werkzeug].includes(m[1])) {
      gesehen.set(`--${m[1]}=`, (gesehen.get(`--${m[1]}=`) || 0) + 1);
      continue;
    }
    unbekannt.push(a);
  }
  if (unbekannt.length) {
    abbruch(`unbekannte Angabe(n) für ${werkzeug}: ${unbekannt.map((u) => String(u).slice(0, 40)).join(", ")}. `
      + `Erlaubt sind ${ERLAUBTE_ANGABEN[werkzeug].map((n) => `--${n}=`).join(", ")} und --scharf. `
      + "Eine unbekannte Angabe wird nie still ignoriert.");
  }
  const mehrfach = [...gesehen.entries()].filter(([, n]) => n > 1).map(([name, n]) => `${name} (${n}-mal)`);
  if (mehrfach.length) {
    abbruch(`mehrfach gesetzte Angabe(n): ${mehrfach.join(", ")}. `
      + "Welche gilt, wird nicht geraten — jede Angabe genau einmal.");
  }
}

// Die Stufe: Pflicht, normalisiert, geschlossen geprüft. Kein Rückfall.
function pflichtStufe(argv, name) {
  const roh = argument(argv, name);
  if (roh === null || !String(roh).trim()) {
    abbruch(`--${name}=a|b|c fehlt. Ohne Stufe gibt es keine Zielmenge und kein Freigabewort — `
      + `es gibt KEINEN Rückfall auf die vollständige Kohorte (${K.KOHORTE_KENNUNGEN.length}).`);
  }
  const stufe = String(roh).trim().toLowerCase();
  if (!S.STUFEN.includes(stufe)) {
    abbruch(`unbekannte Stufe "${String(roh).slice(0, 20)}" — erlaubt sind ${S.STUFEN.join(", ")}. `
      + "Kein Rückfall auf die vollständige Kohorte.");
  }
  return stufe;
}

function kennungenAusArgv(argv) {
  const roh = argument(argv, "ids");
  if (roh === null) return null;
  const liste = String(roh).split(",").map((s) => s.trim()).filter(Boolean);
  if (!liste.length) abbruch("--ids= ist angegeben, enthält aber keine Kennung.");
  return liste;
}

// Fenster und Uhr: geprüft, nicht geraten. Ein unvollständiges Paar oder ein
// falsches Format ist ein Aufruffehler — der Betreiber erfährt es sofort, statt
// im JSON einen stillen Trockenlauf zu lesen.
function fensterAusArgv(argv, scharfGewuenscht) {
  const start = argument(argv, "start");
  const dauer = argument(argv, "dauer");
  const jetzt = argument(argv, "jetzt");
  if ((start === null) !== (dauer === null)) {
    abbruch("--start= und --dauer= gehören zusammen — eines allein ergibt kein prüfbares Fenster.");
  }
  if (start !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(start).trim())) {
    abbruch(`--start=${String(start).slice(0, 12)} ist keine Uhrzeit HH:MM (UTC).`);
  }
  if (dauer !== null && !/^[1-9]\d*$/.test(String(dauer).trim())) {
    abbruch(`--dauer=${String(dauer).slice(0, 12)} ist keine positive ganze Minutenzahl.`);
  }
  if (jetzt !== null) {
    if (scharfGewuenscht) {
      abbruch("--jetzt= ist eine Prüfuhr für den Trockenlauf. Im scharfen Lauf gilt ausschließlich die "
        + "Systemuhr — eine gesetzte Uhr würde den dritten Riegel (Fenster gilt JETZT) aushebeln.");
    }
    if (!Number.isFinite(Date.parse(String(jetzt)))) {
      abbruch(`--jetzt=${String(jetzt).slice(0, 30)} ist kein gültiger Zeitpunkt (ISO 8601, UTC).`);
    }
  }
  return { start, dauer, jetzt };
}

async function main() {
  const argv = process.argv.slice(2);
  const werkzeug = (argv[0] || "").trim();
  if (!WERKZEUGE.includes(werkzeug)) {
    console.error(`Werkzeug fehlt oder ist unbekannt. Erlaubt: ${WERKZEUGE.join(", ")}`);
    process.exit(EXIT_AUFRUFFEHLER);
  }
  const rest = argv.slice(1);
  pruefeAngaben(werkzeug, rest);
  const scharfGewuenscht = rest.includes("--scharf");

  // ── Die Zielstufe wird ZUERST festgelegt — vor Fenster, Banner und Bibliothek ──
  let stufe = null;
  let gruppe = null;
  let kennungen = null;
  if (werkzeug === "provisionierung") {
    stufe = pflichtStufe(rest, "stufe");
    kennungen = kennungenAusArgv(rest);
    // Eine übergebene Teilmenge wird HIER gegen die Erlaubnisliste GENAU DIESER
    // Stufe gerechnet (reine Logik, kein Zugriff) — vor dem Banner, damit kein
    // Protokolleintrag etwas verspricht, was der Lauf danach abbricht.
    if (kennungen) {
      try {
        kennungen = [...S.pruefeStufenZielmenge(stufe, kennungen, `Provisionierung (Stufe ${stufe.toUpperCase()})`)];
      } catch (fehler) {
        abbruch(`(${fehler.grund || "zielmenge"}) ${fehler.message}`, EXIT_BIBLIOTHEK);
      }
    }
  } else {
    // Die Aktivierung heißt ihre Stufe „Gruppe" (Bestandsbegriff). `--stufe=`
    // wird als Alias angenommen; ein Widerspruch zwischen beiden ist ein Abbruch.
    const g = argument(rest, "gruppe");
    const s = argument(rest, "stufe");
    if (g !== null && s !== null
        && String(g).trim().toLowerCase() !== String(s).trim().toLowerCase()) {
      abbruch(`--gruppe=${String(g).slice(0, 20)} und --stufe=${String(s).slice(0, 20)} widersprechen sich.`);
    }
    gruppe = pflichtStufe(rest, g !== null ? "gruppe" : "stufe");
  }

  const { start, dauer, jetzt } = fensterAusArgv(rest, scharfGewuenscht);

  // Der Fensterbefund wird HIER gerechnet, gegen die echten 13 Bestandscrons und
  // MIT der Watchdog-Vorsichtsspanne — ein Tor darf nie schwächer prüfen als die
  // Empfehlung, die es durchsetzt.
  const startfensterBefund = start !== null
    ? F.pruefeStartfenster({
      startUtc: `2026-01-01T${start}:00Z`,
      dauerMinuten: Number(dauer),
      crons: CRONS,
      watchdogBeruecksichtigen: true
    })
    : null;
  // Die Uhr: im Trockenlauf wahlweise die Prüfuhr, im scharfen Lauf IMMER die
  // Systemuhr (siehe fensterAusArgv). Der Befund muss JETZT gelten.
  const jetztUtc = jetzt !== null ? new Date(jetzt).toISOString() : new Date().toISOString();

  if (scharfGewuenscht) {
    const zielStufe = stufe || gruppe;
    console.log("!!! SCHARFER VORWÄRTSSCHRITT ANGEFORDERT — Production-Datenänderung !!!");
    console.log(`    Es wirkt ausschließlich auf die ${S.STUFEN_UMFANG[zielStufe]} Kohortenkennungen `
      + `der Stufe ${zielStufe.toUpperCase()}${kennungen ? ` (geprüfte Teilmenge: ${kennungen.length})` : ""}. Nichts wird gelöscht.`);
    console.log("    Der Rückweg bleibt jederzeit und ohne Zeitfenster ausführbar:");
    console.log("      node scripts/testkohorte-rueckbau.js --scharf\n");
  }

  if (werkzeug === "provisionierung") {
    const ergebnis = await V.fuehreProvisionierungAus({
      stufe,
      kennungen,
      modus: scharfGewuenscht ? V.MODUS_SCHARF : V.MODUS_TROCKENLAUF,
      env: process.env,
      startfensterBefund,
      jetztUtc
    });
    drucke(`Provisionierung Stufe ${stufe.toUpperCase()} (${ergebnis.modus})`, {
      modus: ergebnis.modus,
      modusGewuenscht: ergebnis.modusGewuenscht,
      stufe: ergebnis.stufe,
      stufenUmfang: S.STUFEN_UMFANG[stufe],
      uhr: jetzt !== null ? "pruefuhr-trockenlauf" : "systemuhr",
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
      process.exit(EXIT_BIBLIOTHEK);
    }
    return;
  }

  // ─── DER STUFENVERTRAG WIRD GERECHNET, NICHT ZUGESAGT ─────────────────────
  // KORRIGIERT 02.09. (dritter Reviewbefund): Hier stand ein handgetipptes
  // `--vorstufen-vollstaendig=ja`. Das ist dieselbe Klasse Fehler, die dieser
  // Sprint bei A01/A06/A10 beseitigt hat: ein Riegel, dessen Bedingung ein
  // Mensch behauptet, ist kein Riegel. `planeAktivierung` rechnet den
  // Stufenvertrag aus dem rein lesend erhobenen BESTAND — genau das wird jetzt
  // verlangt. Ohne `--grundlinie` und `--bestand` bleibt es beim Trockenlauf.
  const grundlinieDatei = argument(rest, "grundlinie");
  const bestandDatei = argument(rest, "bestand");
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
    uhr: jetzt !== null ? "pruefuhr-trockenlauf" : "systemuhr",
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
    process.exit(EXIT_BIBLIOTHEK);
  }
}

main().catch((fehler) => {
  const grund = fehler && fehler.grund ? ` (${fehler.grund})` : "";
  console.error(`Abbruch${grund}: ${(fehler && fehler.message) || fehler}`);
  process.exit(EXIT_BIBLIOTHEK);
});
