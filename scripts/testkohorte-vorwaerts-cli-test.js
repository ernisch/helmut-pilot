"use strict";

// Helmut — VERTRAGSTEST DES BETREIBERPROGRAMMS `scripts/testkohorte-vorwaerts.js`.
// =============================================================================
// BEFUND 03.09. (am Kopf a839c1b reproduziert): Die Bibliothek konnte die
// Provisionierung stufengenau ausführen, das Betreiber-CLI reichte die Stufe
// aber nicht durch. `--stufe=a` wurde still ignoriert; der Trockenlauf meldete
// zielGroesse 495 und das Pauschalwort TESTKOHORTE_495_ANLEGEN_BESTAETIGT.
//
// Diese Suite prüft das ECHTE Programm als Kindprozess — keine Quelltextsuche,
// keine Attrappe des CLI. Sie beweist mindestens:
//   a) `--stufe=a` meldet 20 Profile,
//   b) mit dem stufengenauen Bestätigungswort,
//   c) Stufe B und C ergeben 75 und 400,
//   d) eine fehlende Stufe bricht geschlossen ab,
//   e) eine unbekannte Stufe bricht geschlossen ab,
//   f) ohne `--scharf` bleibt alles ein Trockenlauf,
//   g) ohne passende Freigabe und gültiges Startfenster findet kein
//      Schreibvorgang statt (der lokale Speicher enthält vor und nach jedem
//      Aufruf keine einzige Kohortenzeile),
//   h) eine Kennung einer anderen Stufe kann nicht eingeschleust werden.
//
// Das Kind läuft mit denselben Riegeln wie `scripts/lokal.js`: Production-
// Kennungen entfernt, Quellenmodus aus, Speicher lokal, Netz-Guard geladen.
// Ein vollständig scharfer Lauf wird hier BEWUSST NICHT ausgeführt — er würde
// in den lokalen Dateispeicher schreiben. Den scharfen Pfad decken
// `testkohorte-vorwaerts-test.js` (Attrappen) und
// `testkohorte-provisionierung-inaktiv-test.js` (echter Provisionierer im
// Arbeitsspeicher) ab.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const K = require("../lib/helmut/testkohorte-betrieb");
const S = require("../lib/helmut/testkohorte-stufen");

const ROOT = path.join(__dirname, "..");
const CLI = path.join(ROOT, "scripts", "testkohorte-vorwaerts.js");
const NETZ_GUARD = path.join(ROOT, "scripts", "run-offline-tests.js");
const DATEN = path.join(ROOT, ".helmut-data");

// Die Liste der Production-Kennungen kommt aus dem einen zentralen Riegel —
// keine zweite Wahrheit hier.
process.env.HELMUT_LOKALER_SCHUTZ_NUR_LADEN = "ja";
const { PRODUCTION_KENNUNGEN } = require("./lokaler-netzschutz");
delete process.env.HELMUT_LOKALER_SCHUTZ_NUR_LADEN;

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

const WORT = (stufe) => S.STUFEN_FREIGABEWORTE[stufe].provisionierung;
const PAUSCHALWORT = K.FREIGABEWORTE.provisionierung;
// Ein Fenster im Nachtblock (21:40 + 240 min), das gegen die 13 Bestandscrons
// frei ist; eine Uhr darin und eine draußen.
const FENSTER = ["--start=21:40", "--dauer=240"];
const JETZT_DRIN = "--jetzt=2026-09-10T23:00:00Z";
const JETZT_DRAUSSEN = "--jetzt=2026-09-10T05:47:00Z";

function kindUmgebung(extra = {}) {
  const env = { ...process.env };
  for (const name of PRODUCTION_KENNUNGEN) delete env[name];
  delete env[K.EXECUTE_FLAG];
  delete env[K.CONFIRM_VARIABLE];
  env.HELMUT_SOURCE_MODE = "off";
  env.HELMUT_STORAGE_BACKEND = "local";
  delete env.HELMUT_V3_STORE;
  env.NO_NETWORK_TESTS = "1";
  return { ...env, ...extra };
}

// Schnappschuss des lokalen Speichers — SEMANTISCH, nicht bytegenau.
// Gezählt werden die Kohortenzeilen (`test-kohorte-…`) in store.json (Profile,
// Mandatsprofile) und auth.json (Konten). „Nichts geschrieben" heißt: vor und
// nach dem Aufruf 0 Kohortenzeilen. Ein bytegenauer Hash des ganzen
// Verzeichnisses war im Gesamtlauf nicht stabil: andere Suiten schreiben
// dieselben Dateien (Profile fremder Tests), und ein nebenläufiger Schreiber
// ließ den Hash zwischen zwei Aufrufen kippen, ohne dass das CLI irgendetwas
// geschrieben hätte. Die Kohortenzählung ist genau die Zusicherung, um die es
// geht, und sie ist gegen fremde Schreiber unempfindlich. Eine gerade
// halb geschriebene Datei wird kurz erneut gelesen; bleibt sie unlesbar, gilt
// das als Abweichung (fail closed), nie als 0.
const KOHORTE_PRAEFIX = "test-kohorte-";
function zaehleKohorte(objekt) {
  let n = 0;
  const besuche = (wert, tiefe) => {
    if (tiefe > 6 || wert === null || typeof wert !== "object") return;
    if (Array.isArray(wert)) { for (const w of wert) besuche(w, tiefe + 1); return; }
    for (const [schluessel, w] of Object.entries(wert)) {
      if (schluessel.startsWith(KOHORTE_PRAEFIX)) n += 1;
      if ((schluessel === "id" || schluessel === "politicianId") && typeof w === "string" && w.startsWith(KOHORTE_PRAEFIX)) n += 1;
      besuche(w, tiefe + 1);
    }
  };
  besuche(objekt, 0);
  return n;
}
function leseJson(p) {
  for (let versuch = 0; versuch < 5; versuch += 1) {
    if (!fs.existsSync(p)) return { fehlt: true };
    try { return { wert: JSON.parse(fs.readFileSync(p, "utf8")) }; }
    catch { const bis = Date.now() + 50; while (Date.now() < bis) { /* kurz warten */ } }
  }
  return { unlesbar: true };
}
function speicherSchnappschuss() {
  const bild = {};
  for (const d of ["store.json", "auth.json"]) {
    const r = leseJson(path.join(DATEN, d));
    bild[d] = r.fehlt ? "fehlt" : (r.unlesbar ? "UNLESBAR" : `kohorte=${zaehleKohorte(r.wert)}`);
  }
  return JSON.stringify(bild);
}
function speicherOhneKohorte(schnappschuss) {
  return /"store\.json":"(fehlt|kohorte=0)"/.test(schnappschuss) && /"auth\.json":"(fehlt|kohorte=0)"/.test(schnappschuss);
}

function jsonAusAusgabe(stdout) {
  const start = stdout.indexOf("\n{");
  if (start < 0) return null;
  const ende = stdout.indexOf("\n}", start);
  if (ende < 0) return null;
  try { return JSON.parse(stdout.slice(start + 1, ende + 2)); } catch { return null; }
}

function cli(args, extraEnv = {}) {
  const vorher = speicherSchnappschuss();
  const r = spawnSync(process.execPath, ["--require", NETZ_GUARD, CLI, ...args], {
    cwd: ROOT, env: kindUmgebung(extraEnv), encoding: "utf8", timeout: 90000
  });
  const nachher = speicherSchnappschuss();
  return {
    status: r.status,
    stdout: String(r.stdout || ""),
    stderr: String(r.stderr || ""),
    json: jsonAusAusgabe(String(r.stdout || "")),
    // Unverändert heißt: vorher wie nachher KEINE Kohortenzeile im Speicher.
    speicherUnveraendert: vorher === nachher && speicherOhneKohorte(vorher) && speicherOhneKohorte(nachher),
    speicherVorher: vorher,
    speicherNachher: nachher
  };
}

function main() {
  console.log("Helmut — Vertragstest des Betreiberprogramms testkohorte-vorwaerts.js (echte Kindprozesse)\n");

  // ── A · Stufe A: 20 Profile, stufengenaues Wort ────────────────────────────
  console.log("A · --stufe=a zielt auf genau 20 Profile und verlangt das Stufenwort");
  const a = cli(["provisionierung", "--stufe=a"]);
  check("A1 Der Aufruf endet regulär (Exit 0)", a.status === 0, `exit=${a.status} ${a.stderr.trim().slice(0, 160)}`);
  check("A2 Er meldet zielGroesse 20 — nicht 495",
    a.json && a.json.zielGroesse === 20 && a.json.stufenUmfang === 20 && a.json.stufe === "a",
    a.json ? `zielGroesse=${a.json.zielGroesse}` : "keine JSON-Ausgabe");
  check("A3 Er verlangt TESTKOHORTE_STUFE_A_PROVISIONIERUNG_BESTAETIGT",
    a.json && a.json.freigabe && a.json.freigabe.erwartetesWort === WORT("a")
      && a.json.freigabe.erwartetesWort !== PAUSCHALWORT,
    a.json && a.json.freigabe ? a.json.freigabe.erwartetesWort : "—");
  check("A4 Ohne --scharf ist es ein Trockenlauf, der nichts schreibt",
    a.json && a.json.modus === "trockenlauf" && a.json.angelegt === 0 && a.speicherUnveraendert
      && /Es wurde nichts geschrieben/.test(a.stdout));
  check("A5 Die Meldung nennt 20 Profile, nicht 495",
    /Trockenlauf: 20 Profile/.test(a.stdout) && !/495 Profile/.test(a.stdout));
  check("A6 Groß-/Kleinschreibung der Stufe ist unerheblich (--stufe=A)",
    (() => { const r = cli(["provisionierung", "--stufe=A"]); return r.status === 0 && r.json && r.json.zielGroesse === 20; })());

  // ── B · Stufen B und C ────────────────────────────────────────────────────
  console.log("\nB · Stufe B und C ergeben ihre Einzelgrößen mit eigenem Wort");
  for (const [st, n] of [["b", 75], ["c", 400]]) {
    const r = cli(["provisionierung", `--stufe=${st}`]);
    check(`B-${st.toUpperCase()} --stufe=${st} → ${n} Profile, Wort ${WORT(st)}`,
      r.status === 0 && r.json && r.json.zielGroesse === n && r.json.stufe === st
        && r.json.freigabe.erwartetesWort === WORT(st) && r.json.modus === "trockenlauf" && r.speicherUnveraendert,
      r.json ? `zielGroesse=${r.json.zielGroesse}` : `exit=${r.status}`);
  }
  check("B3 Die drei Zielgrößen summieren sich zur Kohorte — kein Schritt zielt auf alle 495",
    20 + 75 + 400 === K.KOHORTE_KENNUNGEN.length);

  // ── C · Fehlende Stufe: geschlossener Abbruch ─────────────────────────────
  console.log("\nC · Eine fehlende Stufe bricht geschlossen ab — kein Rückfall auf 495");
  const ohne = cli(["provisionierung"]);
  check("C1 Exit 2 (Aufruffehler), noch vor jeder Bibliotheksausgabe",
    ohne.status === 2 && ohne.json === null && !/zielGroesse/.test(ohne.stdout), `exit=${ohne.status}`);
  check("C2 Die Meldung nennt die Pflichtangabe und den ausgeschlossenen Rückfall",
    /--stufe=a\|b\|c fehlt/.test(ohne.stderr) && /KEINEN Rückfall/.test(ohne.stderr));
  check("C3 Nichts geschrieben", ohne.speicherUnveraendert);
  const leer = cli(["provisionierung", "--stufe="]);
  check("C4 Eine LEERE Stufe (--stufe=) bricht ebenso ab",
    leer.status === 2 && leer.json === null && leer.speicherUnveraendert, `exit=${leer.status}`);
  // Auch mit gesetztem Pauschalwort und --scharf: ohne Stufe passiert NICHTS.
  const ohneAberScharf = cli(["provisionierung", "--scharf", ...FENSTER, JETZT_DRIN],
    { [K.EXECUTE_FLAG]: "1", [K.CONFIRM_VARIABLE]: PAUSCHALWORT });
  check("C5 Ohne Stufe hilft auch das Pauschalwort mit --scharf und gültigem Fenster nicht (Exit 2, nichts geschrieben)",
    ohneAberScharf.status === 2 && ohneAberScharf.json === null && ohneAberScharf.speicherUnveraendert
      && !/SCHARFER VORWÄRTSSCHRITT/.test(ohneAberScharf.stdout),
    `exit=${ohneAberScharf.status}`);

  // ── D · Unbekannte Stufe / unbekannte Angabe ──────────────────────────────
  console.log("\nD · Eine unbekannte Stufe oder Angabe bricht geschlossen ab");
  for (const wert of ["z", "ab", "495", "alle", "a,b"]) {
    const r = cli(["provisionierung", `--stufe=${wert}`]);
    check(`D-${wert} --stufe=${wert} → Exit 2, keine Zielmenge, nichts geschrieben`,
      r.status === 2 && r.json === null && /unbekannte Stufe/.test(r.stderr) && r.speicherUnveraendert,
      `exit=${r.status}`);
  }
  const tippfehler = cli(["provisionierung", "--stuffe=a"]);
  check("D6 Ein Tippfehler in der Angabe (--stuffe=a) wird nicht still ignoriert",
    tippfehler.status === 2 && /unbekannte Angabe/.test(tippfehler.stderr) && tippfehler.speicherUnveraendert);
  const gruppe = cli(["provisionierung", "--gruppe=a"]);
  check("D7 --gruppe= gehört zur Aktivierung und wird bei der Provisionierung abgewiesen, nicht ignoriert",
    gruppe.status === 2 && /unbekannte Angabe/.test(gruppe.stderr) && gruppe.json === null);
  const ohneWerkzeug = cli([]);
  check("D8 Ohne Werkzeug: Exit 2", ohneWerkzeug.status === 2 && ohneWerkzeug.json === null);

  // ── E · --scharf ohne Riegel bleibt Trockenlauf; kein Schreibvorgang ──────
  console.log("\nE · Ohne passende Freigabe und gültiges Startfenster findet kein Schreibvorgang statt");
  const scharfOhneAlles = cli(["provisionierung", "--stufe=a", "--scharf"]);
  check("E1 --scharf ohne Freigabe und Fenster: Trockenlauf, nichts geschrieben",
    scharfOhneAlles.status === 0 && scharfOhneAlles.json && scharfOhneAlles.json.modus === "trockenlauf"
      && scharfOhneAlles.json.modusGewuenscht === "scharf" && scharfOhneAlles.json.angelegt === 0
      && scharfOhneAlles.speicherUnveraendert);
  check("E2 Das Banner nennt die STUFE, nicht die Gesamtkohorte",
    /20 Kohortenkennungen der Stufe A/.test(scharfOhneAlles.stdout) && !/495 Kohortenkennungen/.test(scharfOhneAlles.stdout));
  const freigabeOhneFenster = cli(["provisionierung", "--stufe=a", "--scharf"],
    { [K.EXECUTE_FLAG]: "1", [K.CONFIRM_VARIABLE]: WORT("a") });
  check("E3 Richtiges Stufenwort, aber KEIN Fenster: Trockenlauf (startfenster-nicht-geprueft)",
    freigabeOhneFenster.json && freigabeOhneFenster.json.modus === "trockenlauf"
      && freigabeOhneFenster.json.freigabe.erteilt === true
      && freigabeOhneFenster.json.startfenster.grund === "startfenster-nicht-geprueft"
      && freigabeOhneFenster.speicherUnveraendert);
  const fensterFalscheZeit = cli(["provisionierung", "--stufe=a", "--scharf", ...FENSTER, JETZT_DRAUSSEN],
    { [K.EXECUTE_FLAG]: "1", [K.CONFIRM_VARIABLE]: WORT("a") });
  check("E4 Freigabe UND Fenster, aber die Uhr steht draußen: Trockenlauf",
    fensterFalscheZeit.json && fensterFalscheZeit.json.modus === "trockenlauf"
      && fensterFalscheZeit.json.startfenster.grund === "startzeit-ausserhalb-des-fensters"
      && fensterFalscheZeit.speicherUnveraendert);
  const nurWort = cli(["provisionierung", "--stufe=a", "--scharf", ...FENSTER, JETZT_DRIN],
    { [K.CONFIRM_VARIABLE]: WORT("a") });
  check("E5 Wort ohne Flag, Fenster gültig: Trockenlauf",
    nurWort.json && nurWort.json.modus === "trockenlauf" && nurWort.json.freigabe.flagAn === false
      && nurWort.speicherUnveraendert);
  const nurFlag = cli(["provisionierung", "--stufe=a", "--scharf", ...FENSTER, JETZT_DRIN],
    { [K.EXECUTE_FLAG]: "1" });
  check("E6 Flag ohne Wort, Fenster gültig: Trockenlauf",
    nurFlag.json && nurFlag.json.modus === "trockenlauf" && nurFlag.json.freigabe.wortStimmt === false
      && nurFlag.speicherUnveraendert);

  // ── F · Ein fremdes Wort schaltet nicht scharf ────────────────────────────
  console.log("\nF · Das Wort einer anderen Stufe oder das Pauschalwort schaltet die Stufe A nicht scharf");
  const wortB = cli(["provisionierung", "--stufe=a", "--scharf", ...FENSTER, JETZT_DRIN],
    { [K.EXECUTE_FLAG]: "1", [K.CONFIRM_VARIABLE]: WORT("b") });
  check("F1 Wort der Stufe B bei --stufe=a: Trockenlauf, wortStimmt=false, nichts geschrieben",
    wortB.json && wortB.json.modus === "trockenlauf" && wortB.json.freigabe.wortStimmt === false
      && wortB.json.zielGroesse === 20 && wortB.speicherUnveraendert);
  const pauschal = cli(["provisionierung", "--stufe=a", "--scharf", ...FENSTER, JETZT_DRIN],
    { [K.EXECUTE_FLAG]: "1", [K.CONFIRM_VARIABLE]: PAUSCHALWORT });
  check("F2 Das Pauschalwort TESTKOHORTE_495_ANLEGEN_BESTAETIGT schaltet die Stufe A NICHT scharf",
    pauschal.json && pauschal.json.modus === "trockenlauf" && pauschal.json.freigabe.wortStimmt === false
      && pauschal.json.freigabe.erwartetesWort === WORT("a") && pauschal.speicherUnveraendert);
  const aktivierungswort = cli(["provisionierung", "--stufe=a", "--scharf", ...FENSTER, JETZT_DRIN],
    { [K.EXECUTE_FLAG]: "1", [K.CONFIRM_VARIABLE]: K.FREIGABEWORTE["aktivierung-a"] });
  check("F3 Das Aktivierungswort der Stufe A legt nichts an",
    aktivierungswort.json && aktivierungswort.json.modus === "trockenlauf" && aktivierungswort.speicherUnveraendert);

  // ── G · Kennungen einer anderen Stufe lassen sich nicht einschleusen ──────
  console.log("\nG · Eine Kennung einer anderen Stufe kann nicht eingeschleust werden");
  const fremdeStufe = cli(["provisionierung", "--stufe=a", "--ids=test-kohorte-c-001", "--scharf", ...FENSTER, JETZT_DRIN],
    { [K.EXECUTE_FLAG]: "1", [K.CONFIRM_VARIABLE]: WORT("a") });
  check("G1 --stufe=a mit einer Kennung der Stufe C: Abbruch (falsche-stufe), Exit 1, nichts geschrieben",
    fremdeStufe.status === 1 && /falsche-stufe/.test(fremdeStufe.stderr) && fremdeStufe.json === null
      && fremdeStufe.speicherUnveraendert, `exit=${fremdeStufe.status}`);
  const gemischt = cli(["provisionierung", "--stufe=a", "--ids=test-kohorte-a-001,test-kohorte-b-001"]);
  check("G2 Auch eine gemischte Liste (A + B) bricht ab — kein stilles Filtern",
    gemischt.status === 1 && /falsche-stufe/.test(gemischt.stderr) && gemischt.json === null);
  const fremd = cli(["provisionierung", "--stufe=a", "--ids=ein-reales-mandat"]);
  check("G3 Eine kohortenfremde Kennung bricht ab (fremde-kennung)",
    fremd.status === 1 && /fremde-kennung/.test(fremd.stderr) && fremd.json === null);
  const erfunden = cli(["provisionierung", "--stufe=a", "--ids=test-kohorte-a-999"]);
  check("G4 Eine erfundene Kennung derselben Familie bricht ab",
    erfunden.status === 1 && /fremde-kennung/.test(erfunden.stderr));
  const doppelt = cli(["provisionierung", "--stufe=a", "--ids=test-kohorte-a-001,test-kohorte-a-001"]);
  check("G5 Ein Duplikat bricht ab (doppelte-kennung)",
    doppelt.status === 1 && /doppelte-kennung/.test(doppelt.stderr));
  const teilmenge = cli(["provisionierung", "--stufe=a", "--ids=test-kohorte-a-003,test-kohorte-a-004"]);
  check("G6 Eine Teilmenge DERSELBEN Stufe ist erlaubt (zielGroesse 2, Stufenwort, Trockenlauf)",
    teilmenge.status === 0 && teilmenge.json && teilmenge.json.zielGroesse === 2
      && teilmenge.json.freigabe.erwartetesWort === WORT("a") && teilmenge.json.modus === "trockenlauf");
  const idsLeer = cli(["provisionierung", "--stufe=a", "--ids="]);
  check("G7 --ids= ohne Kennung bricht ab (Exit 2)", idsLeer.status === 2 && idsLeer.json === null);

  // ── H · Die Aktivierung nimmt --stufe als Alias und weist Widersprüche ab ──
  console.log("\nH · Aktivierung: --stufe ist Alias von --gruppe, Widersprüche brechen ab");
  const aktAlias = cli(["aktivierung", "--stufe=a"]);
  check("H1 aktivierung --stufe=a → Gruppe A, 20 Profile, Trockenlauf",
    aktAlias.status === 0 && aktAlias.json && aktAlias.json.zielGroesse === 20 && aktAlias.json.modus === "trockenlauf"
      && /Aktivierung Gruppe A/.test(aktAlias.stdout));
  const aktWiderspruch = cli(["aktivierung", "--gruppe=a", "--stufe=b"]);
  check("H2 --gruppe=a mit --stufe=b widerspricht sich: Exit 2",
    aktWiderspruch.status === 2 && /widersprechen/.test(aktWiderspruch.stderr));
  const aktOhne = cli(["aktivierung"]);
  check("H3 Aktivierung ohne Gruppe/Stufe: Exit 2, kein Rückfall", aktOhne.status === 2 && aktOhne.json === null);
  const aktAlt = cli(["aktivierung", "--gruppe=a", "--vorstufen-vollstaendig=ja"]);
  check("H4 Das abgeschaffte --vorstufen-vollstaendig wird abgewiesen, nicht ignoriert",
    aktAlt.status === 2 && /unbekannte Angabe/.test(aktAlt.stderr));

  // ── I · Der lokale Speicher ist über die ganze Suite unverändert ──────────
  console.log("\nI · Über alle Aufrufe hinweg wurde nichts geschrieben");
  check("I1 Kein einziger Aufruf dieser Suite hat eine Kohortenzeile in den lokalen Speicher geschrieben",
    [a, ohne, leer, ohneAberScharf, tippfehler, gruppe, scharfOhneAlles, freigabeOhneFenster,
      fensterFalscheZeit, nurWort, nurFlag, wortB, pauschal, aktivierungswort, fremdeStufe,
      gemischt, fremd, erfunden, doppelt, teilmenge, aktAlias, aktWiderspruch, aktOhne]
      .every((r) => r.speicherUnveraendert));
  check("I2 Kein Aufruf hat den Netz-Guard ausgelöst",
    [a, scharfOhneAlles, freigabeOhneFenster, fensterFalscheZeit, wortB, pauschal, fremdeStufe]
      .every((r) => !/NETZ-GUARD/.test(r.stderr) && !/NETZ-GUARD/.test(r.stdout)));

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main();
