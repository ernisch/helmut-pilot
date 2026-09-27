"use strict";

// Helmut — gezielter Offline-Test der 500er Profil-Feldbelege.
// =============================================================================================
// Prueft die erzeugte Belegdatei docs/betrieb/500-profilfeldbelege-20260927.json gegen die
// Abnahmekriterien des vorgeschalteten Roadmap-Schritts — unabhaengig von der Implementierung:
//   * exakt 500 Datensaetze, 330 Bundestag / 120 Berlin / 50 Brandenburg,
//   * eindeutige Kennungen, URLs und Quellhashes; Quellhash ist ein 64-stelliger Hex-Wert,
//   * der amtlich als AfD-zugehoerig belegte Schmidt (Jan Wenzel) ist NICHT in der Zielauswahl,
//   * Gleichbehandlung: jeder Datensatz traegt dieselben Pflichtabschnitte,
//   * keine falsche Importfreigabe: alle aktiv=false und importfreigegeben=false,
//   * Bundestag ohne abgeleitetes Partei-Feld; Berlin/ Brandenburg nur mit amtlich belegter Partei,
//   * der echte Importvertrag (lib/helmut/profil-import.js) akzeptiert die Menge bis auf die
//     ausdruecklich offenen Felder (fachliche Achse, Mandatsart) — technisches OK ist KEINE
//     fachliche Freigabe.
//
// Zusaetzlich (nur wenn die lokalen Arbeitsdateien vorhanden sind) wird eine byte-identische
// Neuerzeugung durch den Assembler geprueft (Reproduzierbarkeit). Fehlen diese lokalen Dateien,
// laeuft der Test trotzdem: die eingecheckte Belegdatei wird weiterhin vollstaendig geprueft.
//
// KEIN Netzwerk, KEINE DB, KEIN Modellaufruf, KEIN Schreibzugriff auf Repo-Daten.
//
// Aufruf:  node scripts/lokal.js -- node scripts/profil-feldbelege-500-test.js

const a = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const { pruefeImport, pruefeProfil } = require("../lib/helmut/profil-import.js");

const ROOT = path.join(__dirname, "..");
const BELEG = path.join(ROOT, "docs", "betrieb", "500-profilfeldbelege-20260927.json");
const ASSEMBLER = path.join(ROOT, "scripts", "profil-feldbelege-500.py");
const STANDARD_EINGANG = "/private/tmp/helmut-be-bb-start";

const ERWARTET = { bundestag: 330, "landtag-berlin": 120, "landtag-brandenburg": 50 };
const HOSTS = { bundestag: "bundestag.de", "landtag-berlin": "parlament-berlin.de", "landtag-brandenburg": "landtag.brandenburg.de" };
const PFLICHT_ABSCHNITTE = ["kanonischeKennung", "amtlicheKennung", "parlament", "quelle", "profil", "mandatsnachweis", "feldbelege", "offenePunkte", "offeneFelder", "importfreigegeben", "aktiv"];

const datei = JSON.parse(fs.readFileSync(BELEG, "utf8"));
const datensaetze = datei.datensaetze;
const auswahl = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/betrieb/500-namensauswahl-20260927.json"), "utf8")).auswahl;
a.deepEqual(datensaetze.map(d => d.quelle.url), auswahl.map(d => d.url), "Belegbestand muss exakt die aktuelle vorab bestimmte Auswahl abbilden");

// ── 1 · Bilanz und Gleichbehandlung ───────────────────────────────────────────────────────
a.equal(datensaetze.length, 500, "Es muessen exakt 500 Datensaetze sein.");
const zaehlung = {};
for (const d of datensaetze) zaehlung[d.parlament] = (zaehlung[d.parlament] || 0) + 1;
a.deepEqual(zaehlung, ERWARTET, "Verteilung muss 330/120/50 sein.");
for (const d of datensaetze) {
  for (const abschnitt of PFLICHT_ABSCHNITTE) {
    a.ok(Object.prototype.hasOwnProperty.call(d, abschnitt), `Datensatz ${d.kanonischeKennung} fehlt Abschnitt ${abschnitt}`);
  }
  a.equal(d.aktiv, false, "aktiv muss false sein");
  a.equal(d.profil.aktiv, false, "profil.aktiv muss false sein");
  a.equal(d.importfreigegeben, false, "importfreigegeben muss false sein");
  a.ok(typeof d.feldbelege === "object" && !Array.isArray(d.feldbelege), "feldbelege muss ein Objekt sein");
  a.ok(Array.isArray(d.offenePunkte), "offenePunkte muss eine Liste sein");
  a.ok(Array.isArray(d.offeneFelder), "offeneFelder muss eine Liste sein");
}

// ── 2 · Eindeutigkeit und Quellbindung ────────────────────────────────────────────────────
const kennungen = new Set(datensaetze.map((d) => d.kanonischeKennung));
const urls = new Set(datensaetze.map((d) => d.quelle.url));
const hashes = new Set(datensaetze.map((d) => d.quelle.sha256));
a.equal(kennungen.size, 500, "Kennungen muessen eindeutig sein");
a.equal(urls.size, 500, "URLs muessen eindeutig sein");
a.equal(hashes.size, 500, "Quellhashes muessen eindeutig sein");
for (const d of datensaetze) {
  a.match(d.quelle.sha256, /^[0-9a-f]{64}$/, "Quellhash muss sha256-Hex sein");
  a.ok(Number.isInteger(d.quelle.bytes) && d.quelle.bytes > 0, "bytes muss gesetzt sein");
  a.equal(d.quelle.abrufStatus, "abgerufen", "nur erfolgreiche Abrufe sind belegt");
  a.equal(d.quelle.http, 200, "nur HTTP 200 ist belegt");
  const host = new URL(d.quelle.url).hostname.replace(/^www\./, "");
  a.equal(host, HOSTS[d.parlament], `Quellhost passt nicht zu ${d.parlament}`);
  const profilQuelle = (d.profil.offizielleQuellen || []).find((q) => q.art === "parlament-profil");
  a.ok(profilQuelle, "amtliche Profilquelle fehlt");
  a.equal(profilQuelle.url, d.quelle.url, "Profilquelle muss der belegten URL entsprechen");
  a.equal(profilQuelle.sha256, d.quelle.sha256, "Profilquelle muss denselben Quellhash binden");
}

// ── 3 · Zielgruppe: der entfernte AfD-Fall darf nicht vorkommen ────────────────────────────
a.ok(!datensaetze.some((d) => d.quelle.url.includes("schmidt_jan-1047146")), "gesperrte Kennung in der Zielauswahl");
a.ok(!datensaetze.some((d) => d.profil.vollname === "Schmidt, Jan Wenzel"), "gesperrter Name in der Zielauswahl");
a.ok(datensaetze.some((d) => d.quelle.url.includes("preisendanz_david")), "Ersatzprofil fehlt");

// ── 4 · Partei-/Fraktionsregeln ───────────────────────────────────────────────────────────
const parteiStatus = { belegt: 0, offen: 0, parteilos: 0 };
for (const d of datensaetze) {
  if (d.parlament === "bundestag") {
    a.ok(!Object.prototype.hasOwnProperty.call(d.profil, "partei"), "Bundestag darf keine Partei aus Fraktion ableiten");
    a.equal(d.parteiStatus, "offen", "Bundestag-Partei bleibt offen");
  } else {
    a.notEqual(d.profil.bundesland, undefined, "Landtagsprofil braucht ein Bundesland");
    a.ok(["belegt", "offen", "parteilos"].includes(d.parteiStatus), `unbekannter Parteistatus ${d.parteiStatus}`);
  }
  if (d.parteiStatus === "belegt") {
    a.ok(d.profil.partei, "belegter Parteistatus braucht einen Parteiwert");
    a.ok(d.feldbelege.partei && d.feldbelege.partei.length > 0, "Parteiherkunft muss belegt sein");
  } else {
    a.ok(!d.profil.partei, "offene bzw. parteilose Partei darf kein Feld setzen");
    a.ok(d.offenePunkte.length > 0, "offene Partei muss als offener Punkt sichtbar sein");
  }
  parteiStatus[d.parteiStatus] += 1;
}
a.equal(parteiStatus.offen, 335, "335 Profile ohne belegte Partei (330 Bundestag + 2 Berlin + 3 Brandenburg)");
a.equal(parteiStatus.belegt, 163, "163 belegte Parteien (118 Berlin + 45 Brandenburg)");
a.equal(parteiStatus.parteilos, 2, "zwei amtlich belegte parteilose Profile");

// Brandenburg kommt aus der Parteipruefung: 45 Parteien, 3 offen, 2 parteilos.
const bb = datensaetze.filter((d) => d.parlament === "landtag-brandenburg");
const bbStatus = {};
for (const d of bb) bbStatus[d.parteiStatus] = (bbStatus[d.parteiStatus] || 0) + 1;
a.deepEqual(bbStatus, { belegt: 45, offen: 3, parteilos: 2 }, "Brandenburg: 47 geklaert / 3 offen");

// ── 5 · Mandatsachse: Wahlkreiskandidatur ist kein Direktmandat ───────────────────────────
const btDirekt = datensaetze.filter((d) => d.parlament === "bundestag" && d.profil.wahlkreis).length;
const btListe = datensaetze.filter((d) => d.parlament === "bundestag" && d.profil.listenmandat).length;
a.equal(btDirekt, 160, "160 Bundestags-Wahlkreismandate");
a.equal(btListe, 170, "170 Bundestags-Listenmandate");
for (const d of datensaetze.filter((x) => x.parlament === "bundestag")) {
  const kandidatur = (d.mandatsnachweis.mandatsachsen || []).some((m) => m.art === "Wahlkreiskandidatur");
  if (kandidatur && !(d.mandatsnachweis.mandatsachsen || []).some((m) => m.art === "Wahlkreismandat")) {
    a.ok(!d.profil.wahlkreis, "Wahlkreiskandidatur darf kein Direktmandat werden");
    a.ok(d.profil.listenmandat === true, "Wahlkreiskandidatur ohne Wahlkreismandat ist ein Listenmandat");
  }
}
for (const d of datensaetze) {
  const hatRegion = Boolean(d.profil.wahlkreis) || (d.profil.listenmandat === true && d.profil.regionHinweis);
  if (!hatRegion) a.ok(d.offeneFelder.includes("mandatsart"), "fehlende Region muss offen ausgewiesen sein");
}
// Nur ausdrueckliche amtliche Profilkopf-Angaben duerfen eine fehlende Extraktion ergaenzen.
const ausProfilkopf = datensaetze.filter((d) => d.feldbelege.region && d.feldbelege.region.startsWith("amtlicher Profilkopf"));
a.equal(ausProfilkopf.length, 12, "12 Landtagsmandate stammen aus ausdruecklicher Profilkopf-Angabe");
a.equal(ausProfilkopf.filter((d) => d.parlament === "landtag-berlin").length, 6);
a.equal(ausProfilkopf.filter((d) => d.parlament === "landtag-brandenburg").length, 6);
for (const d of ausProfilkopf) {
  a.ok(d.mandatsartBelegt && (typeof d.mandatsartBelegt === "string" || Object.keys(d.mandatsartBelegt).length > 0));
}
// Genau 7 Landtagsmandate bleiben mangels belegter Angabe offen (3 Berlin + 4 Brandenburg).
const mandatsartOffen = datensaetze.filter((d) => d.offeneFelder.includes("mandatsart"));
a.equal(mandatsartOffen.length, 7, "7 Mandatsarten bleiben ehrlich offen");

// ── 6 · Der echte Importvertrag auf allen 500 Profilen ───────────────────────────────────
const importDaten = { version: datei.vertragsformat, profile: datensaetze.map((d) => d.profil) };
const ergebnis = pruefeImport(importDaten);
a.equal(ergebnis.profile, 500, "Importvertrag muss 500 Profile sehen");
a.equal(ergebnis.zusammenfassung.alleAktivFalse, true, "der Import darf nie aktivieren");
a.deepEqual(ergebnis.fehler, [], "keine globalen Fehler (Dubletten, Version, Quelle)");
const erlaubteFehlercodes = new Set(["schwerpunkt-fehlt", "region-fehlt"]);
const fehlercodes = {};
for (const e of ergebnis.ergebnisse) {
  for (const f of e.fehler) {
    a.ok(erlaubteFehlercodes.has(f.code), `unerwarteter Importfehler ${f.code} bei ${e.mandatsId}`);
    fehlercodes[f.code] = (fehlercodes[f.code] || 0) + 1;
  }
  for (const w of e.warnungen) a.ok(!["id-ungueltig", "quelle-falscher-host"].includes(w.code), "kritische Warnung");
  a.equal(e.mandatsId, datensaetze[e.index].kanonischeKennung, "Kennung im Importvertrag weicht ab");
}
// Die fachliche Achse ist nur offen, wenn WEDER ein ordentlicher NOCH ein
// stellvertretender belegter Ausschuss vorliegt: 22 Bundestagsprofile tragen
// ausschliesslich stellvertretende Mitgliedschaften und sind daher nicht mehr
// "schwerpunkt-fehlt" (72 -> 50; gueltig 422 -> 444).
a.deepEqual(fehlercodes, { "schwerpunkt-fehlt": 50, "region-fehlt": 7 }, "offene Felder muessen genau die bekannten Luecken sein");
a.equal(ergebnis.gueltig, 444, "444 Profile sind ohne offene Achse/Mandatsart technisch importierbar");

// Einzelpruefung (pruefeProfil) muss dieselbe Sprache sprechen wie die Mengenpruefung.
for (let i = 0; i < datensaetze.length; i += 1) {
  const einzeln = pruefeProfil(datensaetze[i].profil, { index: i });
  a.equal(einzeln.ok, ergebnis.ergebnisse[i].ok, "pruefeProfil und pruefeImport widersprechen sich");
  a.equal(einzeln.mandatsId, datensaetze[i].kanonischeKennung);
  a.ok(!einzeln.fehler.some((f) => f.code === "profil-zielgruppe-ausgeschlossen"), "AfD-Sperre verletzt");
}

// ── 7 · Reproduzierbarkeit (nur mit lokalen Arbeitsdateien + python3) ────────────────────
let reproduzierbar = "uebersprungen (lokale Eingangsdateien oder python3 fehlen)";
const eingangVorhanden = fs.existsSync(path.join(STANDARD_EINGANG, "bundestagsprofile-330-abruf.json"))
  && fs.existsSync(path.join(STANDARD_EINGANG, "landesprofile-170-abruf.json"));
const python = spawnSync("python3", ["--version"], { encoding: "utf8" }).status === 0;
if (python) {
  const gegenprobe = spawnSync("python3", ["-B", path.join(__dirname, "profil-feldbelege-500-unit.py")], { encoding: "utf8" });
  a.equal(gegenprobe.status, 0, `Partei-Gegenprobe fehlgeschlagen: ${gegenprobe.stderr}`);
}
if (eingangVorhanden && python) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "profilfeldbelege-"));
  const ziel = path.join(tmp, "neu.json");
  const lauf = spawnSync("python3", [ASSEMBLER, "--eingang", STANDARD_EINGANG, "--ausgang", ziel, "--erstellt-am", datei.erstelltAm], { encoding: "utf8" });
  a.equal(lauf.status, 0, `Assembler fehlgeschlagen: ${lauf.stderr}`);
  a.equal(fs.readFileSync(ziel, "utf8"), fs.readFileSync(BELEG, "utf8"), "Belegdatei ist nicht reproduzierbar");
  fs.rmSync(tmp, { recursive: true, force: true });
  reproduzierbar = "byte-identisch neu erzeugt";
}

console.log("PASS: 500 Feldbelege, 330/120/50, Hashbindung, AfD-Sperre, offene Felder, echter Importvertrag (444 technisch importierbar, 56 offen), Reproduzierbarkeit: " + reproduzierbar);
