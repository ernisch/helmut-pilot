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
//      Schreibvorgang statt — ZWEIFACH belegt: ein Schreibspion im Kindprozess
//      protokolliert jeden Dateischreibvorgang unter dem Repo (Positivkontrolle
//      zeigt, dass der Spion sieht), und der lokale Speicher enthält vor wie
//      nach jedem Aufruf keine einzige Kohortenzeile,
//   h) eine Kennung einer anderen Stufe kann nicht eingeschleust werden.
//
// Umgebung des Kindes: Production-Kennungen entfernt, Quellenmodus aus, Speicher
// lokal, Netz-Guard (`run-offline-tests.js`) und Schreibspion als Preload. Wird
// die Suite selbst über `scripts/lokal.js` gestartet, erbt das Kind zusätzlich
// den lokalen Netzschutz über NODE_OPTIONS; im CI-Pfad (Runner ohne lokal.js)
// trägt es die beiden Preloads — das genügt, weil dort keine Kennungen liegen.
//
// Ein vollständig scharfer Lauf wird hier BEWUSST NICHT ausgeführt — er würde
// in den lokalen Dateispeicher schreiben. Den scharfen Pfad decken
// `testkohorte-vorwaerts-test.js` (Attrappen) und
// `testkohorte-provisionierung-inaktiv-test.js` (echter Provisionierer im
// Arbeitsspeicher) ab. `--jetzt=` (Prüfuhr) wird vom CLI im scharfen Lauf
// abgewiesen; die Fensterlogik wird deshalb im Trockenlauf mit Prüfuhr belegt,
// die scharfen Negativfälle laufen gegen die echte Systemuhr und sind
// UNABHÄNGIG von ihr deterministisch (falsches Wort, fehlendes Flag, kein Fenster).

const fs = require("fs");
const os = require("os");
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
// frei ist; eine Prüfuhr darin und eine draußen (nur im Trockenlauf zulässig).
const FENSTER = ["--start=21:40", "--dauer=240"];
const JETZT_DRIN = "--jetzt=2026-09-10T23:00:00Z";
const JETZT_DRAUSSEN = "--jetzt=2026-09-10T05:47:00Z";

// ── Schreibspion: ein Preload für den Kindprozess ───────────────────────────
// Protokolliert jeden schreibenden fs-Aufruf, dessen Ziel unter dem Repo liegt,
// in eine Datei AUSSERHALB des Repos. Ein Trockenlauf des CLI darf hier nichts
// hinterlassen. Die Positivkontrolle unten beweist, dass der Spion sieht.
const SPION_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-schreibspion-"));
const SPION_PRELOAD = path.join(SPION_DIR, "schreibspion.js");
const SPION_LOG = path.join(SPION_DIR, "schreibvorgaenge.log");
fs.writeFileSync(SPION_PRELOAD, `"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = ${JSON.stringify(ROOT)};
const LOG = ${JSON.stringify(SPION_LOG)};
const echtesAppend = fs.appendFileSync;
function melde(art, ziel) {
  const p = typeof ziel === "string" ? path.resolve(ziel) : String(ziel);
  if (p.startsWith(ROOT + path.sep) && !p.startsWith(LOG)) echtesAppend(LOG, art + " " + p + "\\n");
}
for (const fn of ["writeFileSync", "appendFileSync", "mkdirSync", "renameSync", "rmSync", "unlinkSync", "copyFileSync", "truncateSync"]) {
  const orig = fs[fn];
  fs[fn] = function (ziel, ...rest) { melde(fn, ziel); return orig.call(this, ziel, ...rest); };
}
for (const fn of ["writeFile", "appendFile", "mkdir", "rename", "rm", "unlink", "copyFile", "truncate"]) {
  const orig = fs[fn];
  fs[fn] = function (ziel, ...rest) { melde(fn, ziel); return orig.call(this, ziel, ...rest); };
  const origP = fs.promises[fn];
  if (origP) fs.promises[fn] = function (ziel, ...rest) { melde("promises." + fn, ziel); return origP.call(this, ziel, ...rest); };
}
const origOpen = fs.openSync;
fs.openSync = function (ziel, flags, ...rest) {
  if (typeof flags === "string" ? /[wa+]/.test(flags) : (Number(flags) & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT))) melde("openSync(" + flags + ")", ziel);
  return origOpen.call(this, ziel, flags, ...rest);
};
`);

function spionZuruecksetzen() { try { fs.rmSync(SPION_LOG, { force: true }); } catch { /* egal */ } }
function spionLesen() {
  try { return fs.readFileSync(SPION_LOG, "utf8").split("\n").filter(Boolean); } catch { return []; }
}

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

// ── Semantischer Schnappschuss: Kohortenzeilen im lokalen Speicher ──────────
// Gezählt werden die Kohortenzeilen (`test-kohorte-…`) in store.json und
// auth.json. „Nichts geschrieben" heißt: vor und nach dem Aufruf 0. Ein
// bytegenauer Hash war im Gesamtlauf nicht stabil (fremde Schreiber auf
// denselben Dateien); die Kohortenzählung ist genau die Zusicherung, um die es
// geht, und gegen fremde Schreiber unempfindlich. Eine halb geschriebene Datei
// wird erneut gelesen; bleibt sie unlesbar, gilt das als Abweichung, nie als 0.
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

// ── Die JSON-Ausgabe des CLI: am Marker verankert, genau EIN Block ───────────
// `null` heißt „kein Block"; ein vorhandener, aber nicht parsebarer Block wird
// als `"unparsebar"` unterschieden (Reviewbefund 03.09.).
function jsonAusAusgabe(stdout) {
  const bloecke = [];
  const re = /\n=== [^\n]+ ===\n(\{[\s\S]*?\n\})/g;
  let m;
  while ((m = re.exec(stdout)) !== null) bloecke.push(m[1]);
  if (bloecke.length === 0) return null;
  if (bloecke.length > 1) return "mehrere-bloecke";
  try { return JSON.parse(bloecke[0]); } catch { return "unparsebar"; }
}

const ALLE = [];
function cli(args, extraEnv = {}) {
  spionZuruecksetzen();
  const vorher = speicherSchnappschuss();
  const r = spawnSync(process.execPath, ["--require", NETZ_GUARD, "--require", SPION_PRELOAD, CLI, ...args], {
    cwd: ROOT, env: kindUmgebung(extraEnv), encoding: "utf8", timeout: 90000
  });
  const nachher = speicherSchnappschuss();
  const schreibvorgaenge = spionLesen();
  const json = jsonAusAusgabe(String(r.stdout || ""));
  const ergebnis = {
    args,
    status: r.status,
    stdout: String(r.stdout || ""),
    stderr: String(r.stderr || ""),
    json: json && typeof json === "object" ? json : null,
    jsonRoh: json,
    schreibvorgaenge,
    // Unverändert heißt: kein Schreibvorgang unter dem Repo UND vorher wie
    // nachher keine Kohortenzeile im Speicher.
    speicherUnveraendert: schreibvorgaenge.length === 0
      && vorher === nachher && speicherOhneKohorte(vorher) && speicherOhneKohorte(nachher)
  };
  ALLE.push(ergebnis);
  return ergebnis;
}

function main() {
  console.log("Helmut — Vertragstest des Betreiberprogramms testkohorte-vorwaerts.js (echte Kindprozesse)\n");

  // ── 0 · Positivkontrolle des Schreibspions ────────────────────────────────
  console.log("0 · Der Schreibspion sieht Schreibvorgänge unter dem Repo (Positivkontrolle)");
  spionZuruecksetzen();
  const probe = path.join(DATEN, `schreibspion-probe-${process.pid}.tmp`);
  const kontrolle = spawnSync(process.execPath, ["--require", SPION_PRELOAD, "-e",
    `const fs=require("fs");fs.mkdirSync(${JSON.stringify(DATEN)},{recursive:true});fs.writeFileSync(${JSON.stringify(probe)},"probe");fs.rmSync(${JSON.stringify(probe)});`],
  { cwd: ROOT, env: kindUmgebung(), encoding: "utf8", timeout: 30000 });
  const gesehen = spionLesen();
  check("0.1 Ein Schreib- und ein Löschvorgang unter .helmut-data werden protokolliert",
    kontrolle.status === 0 && gesehen.some((z) => z.startsWith("writeFileSync ") && z.endsWith(probe))
      && gesehen.some((z) => z.startsWith("rmSync ") && z.endsWith(probe)),
    gesehen.join(" | ").slice(0, 200) || "nichts protokolliert");
  spionZuruecksetzen();

  // ── A · Stufe A: 20 Profile, stufengenaues Wort ────────────────────────────
  console.log("\nA · --stufe=a zielt auf genau 20 Profile und verlangt das Stufenwort");
  const a = cli(["provisionierung", "--stufe=a"]);
  check("A1 Der Aufruf endet regulär (Exit 0)", a.status === 0, `exit=${a.status} ${a.stderr.trim().slice(0, 160)}`);
  check("A2 Er meldet zielGroesse 20 — nicht 495",
    a.json && a.json.zielGroesse === 20 && a.json.stufenUmfang === 20 && a.json.stufe === "a",
    a.json ? `zielGroesse=${a.json.zielGroesse}` : `keine JSON-Ausgabe (${a.jsonRoh})`);
  check("A3 Er verlangt TESTKOHORTE_STUFE_A_PROVISIONIERUNG_BESTAETIGT",
    a.json && a.json.freigabe && a.json.freigabe.erwartetesWort === WORT("a")
      && a.json.freigabe.erwartetesWort !== PAUSCHALWORT,
    a.json && a.json.freigabe ? a.json.freigabe.erwartetesWort : "—");
  check("A4 Ohne --scharf ist es ein Trockenlauf, der nichts schreibt (Spion: 0 Schreibvorgänge, 0 Kohortenzeilen)",
    a.json && a.json.modus === "trockenlauf" && a.json.angelegt === 0 && a.speicherUnveraendert
      && /Es wurde nichts geschrieben/.test(a.stdout) && a.json.uhr === "systemuhr",
    a.schreibvorgaenge.join(" | ").slice(0, 200));
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
    ohne.status === 2 && ohne.jsonRoh === null && !/zielGroesse/.test(ohne.stdout), `exit=${ohne.status}`);
  check("C2 Die Meldung nennt die Pflichtangabe und den ausgeschlossenen Rückfall",
    /--stufe=a\|b\|c fehlt/.test(ohne.stderr) && /KEINEN Rückfall/.test(ohne.stderr));
  check("C3 Nichts geschrieben", ohne.speicherUnveraendert);
  const leer = cli(["provisionierung", "--stufe="]);
  check("C4 Eine LEERE Stufe (--stufe=) bricht ebenso ab",
    leer.status === 2 && leer.jsonRoh === null && leer.speicherUnveraendert, `exit=${leer.status}`);
  // Auch mit gesetztem Pauschalwort und --scharf: ohne Stufe passiert NICHTS.
  const ohneAberScharf = cli(["provisionierung", "--scharf", ...FENSTER],
    { [K.EXECUTE_FLAG]: "1", [K.CONFIRM_VARIABLE]: PAUSCHALWORT });
  check("C5 Ohne Stufe hilft auch das Pauschalwort mit --scharf und Fenster nicht (Exit 2, nichts geschrieben, kein Banner)",
    ohneAberScharf.status === 2 && ohneAberScharf.jsonRoh === null && ohneAberScharf.speicherUnveraendert
      && !/SCHARFER VORWÄRTSSCHRITT/.test(ohneAberScharf.stdout),
    `exit=${ohneAberScharf.status}`);

  // ── D · Unbekannte Stufe / unbekannte oder doppelte Angabe ────────────────
  console.log("\nD · Eine unbekannte, doppelte oder ungültige Angabe bricht geschlossen ab");
  for (const wert of ["z", "ab", "495", "alle", "a,b"]) {
    const r = cli(["provisionierung", `--stufe=${wert}`]);
    check(`D-${wert} --stufe=${wert} → Exit 2, keine Zielmenge, nichts geschrieben`,
      r.status === 2 && r.jsonRoh === null && /unbekannte Stufe/.test(r.stderr) && r.speicherUnveraendert,
      `exit=${r.status}`);
  }
  const tippfehler = cli(["provisionierung", "--stuffe=a"]);
  check("D6 Ein Tippfehler in der Angabe (--stuffe=a) wird nicht still ignoriert",
    tippfehler.status === 2 && /unbekannte Angabe/.test(tippfehler.stderr) && tippfehler.speicherUnveraendert);
  const gruppe = cli(["provisionierung", "--gruppe=a"]);
  check("D7 --gruppe= gehört zur Aktivierung und wird bei der Provisionierung abgewiesen, nicht ignoriert",
    gruppe.status === 2 && /unbekannte Angabe/.test(gruppe.stderr) && gruppe.jsonRoh === null);
  const ohneWerkzeug = cli([]);
  check("D8 Ohne Werkzeug: Exit 2", ohneWerkzeug.status === 2 && ohneWerkzeug.jsonRoh === null);
  // Reviewbefund 03.09.: „die erste gewinnt" wäre dieselbe stille Verschiebung.
  const doppelteStufe = cli(["provisionierung", "--stufe=c", "--stufe=a"]);
  check("D9 --stufe=c --stufe=a: mehrfach gesetzte Angabe → Exit 2 (nicht „die erste gewinnt“)",
    doppelteStufe.status === 2 && /mehrfach gesetzte Angabe/.test(doppelteStufe.stderr) && doppelteStufe.jsonRoh === null
      && doppelteStufe.speicherUnveraendert);
  const doppelteIds = cli(["provisionierung", "--stufe=a", "--ids=test-kohorte-a-001", "--ids=test-kohorte-c-001"]);
  check("D10 --ids= zweimal: Exit 2, die zweite Liste wird nicht still verworfen",
    doppelteIds.status === 2 && /mehrfach gesetzte Angabe/.test(doppelteIds.stderr) && doppelteIds.jsonRoh === null);
  const doppelterSchalter = cli(["provisionierung", "--stufe=a", "--scharf", "--scharf"]);
  check("D11 Auch ein doppelter Schalter (--scharf --scharf) ist ein Aufruffehler",
    doppelterSchalter.status === 2 && doppelterSchalter.jsonRoh === null && doppelterSchalter.speicherUnveraendert);
  const kaputtesFenster = cli(["provisionierung", "--stufe=a", "--start=zz:zz", "--dauer=abc"]);
  check("D12 Ungültige Fensterangaben (--start=zz:zz --dauer=abc) sind ein Aufruffehler, kein stiller Trockenlauf",
    kaputtesFenster.status === 2 && /keine Uhrzeit HH:MM/.test(kaputtesFenster.stderr) && kaputtesFenster.jsonRoh === null);
  const halbesFenster = cli(["provisionierung", "--stufe=a", "--start=21:40"]);
  check("D13 --start ohne --dauer: Exit 2 (kein prüfbares Fenster)",
    halbesFenster.status === 2 && /gehören zusammen/.test(halbesFenster.stderr));
  const kaputteUhr = cli(["provisionierung", "--stufe=a", "--jetzt=kaputt"]);
  check("D14 --jetzt=kaputt: Exit 2", kaputteUhr.status === 2 && /kein gültiger Zeitpunkt/.test(kaputteUhr.stderr));

  // ── E · Die Fensterlogik (Prüfuhr NUR im Trockenlauf) ─────────────────────
  console.log("\nE · Fenster und Uhr: die Prüfuhr gilt nur im Trockenlauf, im scharfen Lauf zählt die Systemuhr");
  const uhrDrin = cli(["provisionierung", "--stufe=a", ...FENSTER, JETZT_DRIN]);
  check("E1 Trockenlauf mit Prüfuhr IM Fenster: Fenster gilt, Modus bleibt Trockenlauf (kein --scharf)",
    uhrDrin.status === 0 && uhrDrin.json && uhrDrin.json.modus === "trockenlauf"
      && uhrDrin.json.startfenster.frei === true && uhrDrin.json.startfenster.grund === "fenster-gilt-jetzt"
      && uhrDrin.json.uhr === "pruefuhr-trockenlauf" && uhrDrin.speicherUnveraendert);
  const uhrDraussen = cli(["provisionierung", "--stufe=a", ...FENSTER, JETZT_DRAUSSEN]);
  check("E2 Trockenlauf mit Prüfuhr AUSSERHALB: startzeit-ausserhalb-des-fensters",
    uhrDraussen.status === 0 && uhrDraussen.json && uhrDraussen.json.startfenster.frei === false
      && uhrDraussen.json.startfenster.grund === "startzeit-ausserhalb-des-fensters");
  const scharfMitUhr = cli(["provisionierung", "--stufe=a", "--scharf", ...FENSTER, JETZT_DRIN],
    { [K.EXECUTE_FLAG]: "1", [K.CONFIRM_VARIABLE]: WORT("a") });
  check("E3 --scharf mit --jetzt= wird ABGEWIESEN (Exit 2, kein Banner, nichts geschrieben) — der dritte Riegel ist nicht setzbar",
    scharfMitUhr.status === 2 && /Systemuhr/.test(scharfMitUhr.stderr) && scharfMitUhr.jsonRoh === null
      && !/SCHARFER VORWÄRTSSCHRITT/.test(scharfMitUhr.stdout) && scharfMitUhr.speicherUnveraendert,
    `exit=${scharfMitUhr.status}`);

  // ── F · --scharf ohne Riegel bleibt Trockenlauf; kein Schreibvorgang ──────
  // Alle Fälle hier sind UNABHÄNGIG von der Systemuhr deterministisch.
  console.log("\nF · Ohne passende Freigabe und gültiges Startfenster findet kein Schreibvorgang statt");
  const scharfOhneAlles = cli(["provisionierung", "--stufe=a", "--scharf"]);
  check("F1 --scharf ohne Freigabe und Fenster: Trockenlauf, Systemuhr, nichts geschrieben",
    scharfOhneAlles.status === 0 && scharfOhneAlles.json && scharfOhneAlles.json.modus === "trockenlauf"
      && scharfOhneAlles.json.modusGewuenscht === "scharf" && scharfOhneAlles.json.angelegt === 0
      && scharfOhneAlles.json.uhr === "systemuhr" && scharfOhneAlles.speicherUnveraendert);
  // ANGEPASST 04.09. (SR §37.5 (4)): Das Banner ist jetzt strukturiert und weist
  // zusaetzlich das tatsaechliche Schreibziel aus. Die Zusicherung ist unveraendert
  // — es nennt die STUFE und deren Umfang, nie die Gesamtkohorte. Der frueher
  // gedruckte Satz „Nichts wird gelöscht" ist entfallen: er war eine ungemessene
  // Behauptung VOR jeder Pruefung (SR §36.9).
  check("F2 Das Banner nennt die STUFE und ihren Umfang, nicht die Gesamtkohorte",
    /Stufe\s+:\s*A\b/.test(scharfOhneAlles.stdout)
      && /Vorgesehene Profilanzahl:\s*20\b/.test(scharfOhneAlles.stdout)
      && !/495/.test(scharfOhneAlles.stdout));
  check("F2b Das Banner weist Schreibziel, beide Schreibmodi und die wirksame Aufbewahrung aus",
    /Blob-Backend/.test(scharfOhneAlles.stdout)
      && /Blob-Schreibmodus/.test(scharfOhneAlles.stdout)
      && /Relationaler Schreibmodus/.test(scharfOhneAlles.stdout)
      && /crawlRuns-Aufbewahrung/.test(scharfOhneAlles.stdout));
  check("F2c Das Banner nennt den Aktivierungsstatus (legt inaktiv an)",
    /Aktivierungsstatus\s+:\s*legt INAKTIV an/.test(scharfOhneAlles.stdout));
  const freigabeOhneFenster = cli(["provisionierung", "--stufe=a", "--scharf"],
    { [K.EXECUTE_FLAG]: "1", [K.CONFIRM_VARIABLE]: WORT("a") });
  check("F3 Richtiges Stufenwort und Flag, aber KEIN Fenster: Trockenlauf (startfenster-nicht-geprueft), nichts geschrieben",
    freigabeOhneFenster.json && freigabeOhneFenster.json.modus === "trockenlauf"
      && freigabeOhneFenster.json.freigabe.erteilt === true
      && freigabeOhneFenster.json.startfenster.grund === "startfenster-nicht-geprueft"
      && freigabeOhneFenster.speicherUnveraendert);
  const nurWort = cli(["provisionierung", "--stufe=a", "--scharf", ...FENSTER],
    { [K.CONFIRM_VARIABLE]: WORT("a") });
  check("F4 Wort ohne Flag, mit Fenster: Trockenlauf, nichts geschrieben",
    nurWort.json && nurWort.json.modus === "trockenlauf" && nurWort.json.freigabe.flagAn === false
      && nurWort.speicherUnveraendert);
  const nurFlag = cli(["provisionierung", "--stufe=a", "--scharf", ...FENSTER],
    { [K.EXECUTE_FLAG]: "1" });
  check("F5 Flag ohne Wort, mit Fenster: Trockenlauf, nichts geschrieben",
    nurFlag.json && nurFlag.json.modus === "trockenlauf" && nurFlag.json.freigabe.wortStimmt === false
      && nurFlag.speicherUnveraendert);

  // ── G · Ein fremdes Wort schaltet nicht scharf ────────────────────────────
  console.log("\nG · Das Wort einer anderen Stufe oder das Pauschalwort schaltet die Stufe A nicht scharf");
  const wortB = cli(["provisionierung", "--stufe=a", "--scharf", ...FENSTER],
    { [K.EXECUTE_FLAG]: "1", [K.CONFIRM_VARIABLE]: WORT("b") });
  check("G1 Wort der Stufe B bei --stufe=a: Trockenlauf, wortStimmt=false, nichts geschrieben",
    wortB.json && wortB.json.modus === "trockenlauf" && wortB.json.freigabe.wortStimmt === false
      && wortB.json.zielGroesse === 20 && wortB.speicherUnveraendert);
  const pauschal = cli(["provisionierung", "--stufe=a", "--scharf", ...FENSTER],
    { [K.EXECUTE_FLAG]: "1", [K.CONFIRM_VARIABLE]: PAUSCHALWORT });
  check("G2 Das Pauschalwort TESTKOHORTE_495_ANLEGEN_BESTAETIGT schaltet die Stufe A NICHT scharf",
    pauschal.json && pauschal.json.modus === "trockenlauf" && pauschal.json.freigabe.wortStimmt === false
      && pauschal.json.freigabe.erwartetesWort === WORT("a") && pauschal.speicherUnveraendert);
  const aktivierungswort = cli(["provisionierung", "--stufe=a", "--scharf", ...FENSTER],
    { [K.EXECUTE_FLAG]: "1", [K.CONFIRM_VARIABLE]: K.FREIGABEWORTE["aktivierung-a"] });
  check("G3 Das Aktivierungswort der Stufe A legt nichts an",
    aktivierungswort.json && aktivierungswort.json.modus === "trockenlauf" && aktivierungswort.speicherUnveraendert);

  // ── H · Kennungen einer anderen Stufe lassen sich nicht einschleusen ──────
  console.log("\nH · Eine Kennung einer anderen Stufe kann nicht eingeschleust werden");
  const fremdeStufe = cli(["provisionierung", "--stufe=a", "--ids=test-kohorte-c-001", "--scharf", ...FENSTER],
    { [K.EXECUTE_FLAG]: "1", [K.CONFIRM_VARIABLE]: WORT("a") });
  check("H1 --stufe=a mit einer Kennung der Stufe C: Abbruch (falsche-stufe), Exit 1, KEIN Banner, nichts geschrieben",
    fremdeStufe.status === 1 && /falsche-stufe/.test(fremdeStufe.stderr) && fremdeStufe.jsonRoh === null
      && !/SCHARFER VORWÄRTSSCHRITT/.test(fremdeStufe.stdout) && fremdeStufe.speicherUnveraendert,
    `exit=${fremdeStufe.status}`);
  const gemischt = cli(["provisionierung", "--stufe=a", "--ids=test-kohorte-a-001,test-kohorte-b-001"]);
  check("H2 Auch eine gemischte Liste (A + B) bricht ab — kein stilles Filtern",
    gemischt.status === 1 && /falsche-stufe/.test(gemischt.stderr) && gemischt.jsonRoh === null);
  const fremd = cli(["provisionierung", "--stufe=a", "--ids=ein-reales-mandat"]);
  check("H3 Eine kohortenfremde Kennung bricht ab (fremde-kennung)",
    fremd.status === 1 && /fremde-kennung/.test(fremd.stderr) && fremd.jsonRoh === null);
  const erfunden = cli(["provisionierung", "--stufe=a", "--ids=test-kohorte-a-999"]);
  check("H4 Eine erfundene Kennung derselben Familie bricht ab",
    erfunden.status === 1 && /fremde-kennung/.test(erfunden.stderr));
  const doppelt = cli(["provisionierung", "--stufe=a", "--ids=test-kohorte-a-001,test-kohorte-a-001"]);
  check("H5 Ein Duplikat bricht ab (doppelte-kennung)",
    doppelt.status === 1 && /doppelte-kennung/.test(doppelt.stderr));
  const teilmenge = cli(["provisionierung", "--stufe=a", "--ids=test-kohorte-a-003,test-kohorte-a-004"]);
  check("H6 Eine Teilmenge DERSELBEN Stufe ist erlaubt (zielGroesse 2, Stufenwort, Trockenlauf)",
    teilmenge.status === 0 && teilmenge.json && teilmenge.json.zielGroesse === 2
      && teilmenge.json.freigabe.erwartetesWort === WORT("a") && teilmenge.json.modus === "trockenlauf");
  const idsLeer = cli(["provisionierung", "--stufe=a", "--ids="]);
  check("H7 --ids= ohne Kennung bricht ab (Exit 2)", idsLeer.status === 2 && idsLeer.jsonRoh === null);

  // ── I · Die Aktivierung nimmt --stufe als Alias und weist Widersprüche ab ──
  console.log("\nI · Aktivierung: --stufe ist Alias von --gruppe, Widersprüche brechen ab");
  const aktAlias = cli(["aktivierung", "--stufe=a"]);
  check("I1 aktivierung --stufe=a → Gruppe A, 20 Profile, Trockenlauf",
    aktAlias.status === 0 && aktAlias.json && aktAlias.json.zielGroesse === 20 && aktAlias.json.modus === "trockenlauf"
      && /Aktivierung Gruppe A/.test(aktAlias.stdout));
  const aktWiderspruch = cli(["aktivierung", "--gruppe=a", "--stufe=b"]);
  check("I2 --gruppe=a mit --stufe=b widerspricht sich: Exit 2",
    aktWiderspruch.status === 2 && /widersprechen/.test(aktWiderspruch.stderr));
  const aktOhne = cli(["aktivierung"]);
  check("I3 Aktivierung ohne Gruppe/Stufe: Exit 2, kein Rückfall", aktOhne.status === 2 && aktOhne.jsonRoh === null);
  const aktAlt = cli(["aktivierung", "--gruppe=a", "--vorstufen-vollstaendig=ja"]);
  check("I4 Das abgeschaffte --vorstufen-vollstaendig wird abgewiesen, nicht ignoriert",
    aktAlt.status === 2 && /unbekannte Angabe/.test(aktAlt.stderr));
  const aktScharfMitUhr = cli(["aktivierung", "--gruppe=a", "--scharf", ...FENSTER, JETZT_DRIN]);
  check("I5 Auch die Aktivierung weist --jetzt im scharfen Lauf ab", aktScharfMitUhr.status === 2);

  // ── J · Über alle Aufrufe hinweg wurde nichts geschrieben ─────────────────
  console.log("\nJ · Über ALLE Aufrufe dieser Suite hinweg wurde nichts geschrieben");
  check(`J1 Keiner der ${ALLE.length} Aufrufe hat unter dem Repo geschrieben oder eine Kohortenzeile hinterlassen`,
    ALLE.every((r) => r.speicherUnveraendert),
    ALLE.filter((r) => !r.speicherUnveraendert).map((r) => `${r.args.join(" ")}: ${r.schreibvorgaenge.slice(0, 2).join(" | ")}`).join(" ; ").slice(0, 300));
  check("J2 Kein Aufruf hat den Netz-Guard ausgelöst",
    ALLE.every((r) => !/NETZ-GUARD/.test(r.stderr) && !/NETZ-GUARD/.test(r.stdout)));
  check("J3 Jede JSON-Ausgabe war genau EIN parsebarer Block (nie „mehrere“, nie „unparsebar“)",
    ALLE.every((r) => r.jsonRoh === null || (r.jsonRoh && typeof r.jsonRoh === "object")));

  try { fs.rmSync(SPION_DIR, { recursive: true, force: true }); } catch { /* egal */ }
  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main();
