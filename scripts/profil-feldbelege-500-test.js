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

// ── 4 · Partei-/Fraktionsregeln und gepruefte Ergaenzungsquittung ─────────────────────────
// 335 vorher offene Parteifelder wurden von Sol an URL+sha256 geprueft (261 belegt,
// 74 offen). Uebernommen wird nur status belegt/parteilos; offen bleibt offen.
const ergaenzung = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "betrieb", "parteifeldpruefung-335-20260927.json"), "utf8"));
a.equal(ergaenzung.umfang, 335, "Quittung muss 335 geprüfte Parteifelder umfassen");
a.equal(ergaenzung.ergebnisse.length, 335, "Quittung muss 335 Ergebnisse tragen");
const ergByKennung = new Map(ergaenzung.ergebnisse.map((e) => [e.kennung, e]));
a.equal(ergByKennung.size, 335, "Quittungskennungen muessen eindeutig sein");
a.equal(ergaenzung.ergebnisse.filter((e) => e.status === "belegt").length, 261, "261 belegte Parteibelege");
a.equal(ergaenzung.ergebnisse.filter((e) => e.status === "offen").length, 74, "74 bleiben offen");
for (const e of ergaenzung.ergebnisse) {
  if (e.status !== "offen") continue;
  a.equal(e.partei, null, "offene Quittung darf keinen Parteiwert tragen");
}

const parteiStatus = { belegt: 0, offen: 0, parteilos: 0 };
for (const d of datensaetze) {
  const e = ergByKennung.get(d.kanonischeKennung);
  a.notEqual(d.profil.bundesland, undefined, "Jedes Profil braucht ein Bundesland");
  a.ok(["belegt", "offen", "parteilos"].includes(d.parteiStatus), `unbekannter Parteistatus ${d.parteiStatus}`);
  if (d.parteiStatus === "belegt") {
    a.ok(d.profil.partei, "belegter Parteistatus braucht einen Parteiwert");
    a.ok(d.feldbelege.partei && d.feldbelege.partei.length > 0, "Parteiherkunft muss belegt sein");
    if (e) {
      // Uebernommener Wert stammt woertlich aus der geprueften Quittung, gebunden an URL+sha256.
      a.equal(e.status, "belegt");
      a.equal(d.profil.partei, e.partei, "Parteiwert muss der geprueften Quittung entsprechen");
      a.deepEqual(d.parteiBeleg.quelle, { datei: "docs/betrieb/parteifeldpruefung-335-20260927.json", url: d.quelle.url, sha256: d.quelle.sha256 });
    } else {
      // Ohne Quittung darf NUR die amtliche Landtags-h1/Parteipruefung eine Partei liefern —
      // nie eine Bundestags-Fraktion.
      a.notEqual(d.parlament, "bundestag", "Bundestags-Partei nur aus gepruefter Quittung, nie aus der Fraktion");
    }
  } else if (d.parteiStatus === "offen") {
    a.ok(!d.profil.partei, "offene Partei darf kein Feld setzen");
    a.ok(d.offeneFelder.includes("partei"), "offenes Parteifeld muss sichtbar offen bleiben");
    if (e) a.equal(e.status, "offen", "wer offen bleibt, muss in der Quittung offen sein");
  } else {
    // "parteilos" ist ein amtlich belegter Status, kein offenes Feld. Ein Profil kann
    // dadurch voellig geschlossen sein (z. B. von Ossowski: parteilos + Landesliste belegt).
    a.equal(d.parteiStatus, "parteilos");
    a.ok(!d.profil.partei, "parteilose Partei darf kein Feld setzen");
    a.ok(!d.offeneFelder.includes("partei"), "parteilos ist belegt, nicht offen");
  }
  parteiStatus[d.parteiStatus] += 1;
}
a.equal(parteiStatus.offen, 74, "74 Profile bleiben ohne belegte Partei");
a.equal(parteiStatus.belegt, 424, "424 belegte Parteien (163 vorab + 261 aus der Quittung)");
a.equal(parteiStatus.parteilos, 2, "zwei amtlich belegte parteilose Profile");

// Brandenburg kommt aus der Parteipruefung, ergaenzt um die Quittung: 46 belegt, 2 offen, 2 parteilos.
const bb = datensaetze.filter((d) => d.parlament === "landtag-brandenburg");
const bbStatus = {};
for (const d of bb) bbStatus[d.parteiStatus] = (bbStatus[d.parteiStatus] || 0) + 1;
a.deepEqual(bbStatus, { belegt: 46, offen: 2, parteilos: 2 }, "Brandenburg: 48 geklaert / 2 offen");

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
// Genau 1 Berliner Landtagsmandat bleibt mangels belegter Angabe offen (Claudia
// Engelmann). Zwei Berliner und vier Brandenburg-Mandate sind ueber versionierte
// Mandatsartenquittungen belegt (nur Mandatsart + Region, kein Listenplatz, keine
// Partei).
const mandatsartOffen = datensaetze.filter((d) => d.offeneFelder.includes("mandatsart"));
a.equal(mandatsartOffen.length, 1, "1 Berliner Mandatsart bleibt ehrlich offen");
a.ok(mandatsartOffen.every((d) => d.parlament === "landtag-berlin"), "nur Berlin bleibt offen");
a.deepEqual(mandatsartOffen.map((d) => d.amtlicheKennung), ["claudia-engelmann"], "offen bleibt nur Engelmann");

// 5a · Belegte Mandatsart Brandenburg: nur Landesliste + Region, kein Listenplatz.
const ausQuittung = datensaetze.filter((d) => d.mandatsartQuittung);
a.equal(ausQuittung.length, 4, "vier Brandenburg-Mandate stammen aus der Mandatsartenquittung");
a.deepEqual(
  ausQuittung.map((d) => d.amtlicheKennung).sort(),
  ["40624", "40627", "40629", "40630"],
  "genau die vier belegten Brandenburg-Kennungen",
);
for (const d of ausQuittung) {
  a.equal(d.parlament, "landtag-brandenburg");
  a.equal(d.profil.bundesland, "Brandenburg");
  a.equal(d.profil.listenmandat, true, "belegte Landesliste muss ein Listenmandat sein");
  a.ok(d.profil.wahlkreis === undefined, "Listenmandat darf keinen Wahlkreis erfinden");
  a.equal(d.profil.regionHinweis, "Brandenburg — Landesliste", "nur Region + Mandatsart uebernehmen");
  a.ok(!/Platz|WfB|fraktionslos/i.test(d.profil.regionHinweis), "Listenbeschriftung/Listenplatz duerfen NICHT uebernommen werden");
  a.equal(d.mandatsartQuittung.datei, "docs/betrieb/brandenburg-mandatsarten-20260927.json");
  a.match(d.mandatsartQuittung.sha256, /^[0-9a-f]{64}$/);
  a.ok(d.mandatsartQuittung.url.startsWith("https://www.landtag.brandenburg.de/"), "amtliche Quelle");
  a.ok(d.mandatsartQuittung.zeileWortlaut.includes("Landesliste"), "Belegzeile traegt das Wort Landesliste");
  a.ok(!d.offeneFelder.includes("mandatsart"), "belegte Mandatsart darf nicht mehr offen sein");
}

// 5b · Belegte Mandatsart Berlin: Bezirks-/Landesliste + Region, kein Direktwahlkreis.
// Die versionierte Quittung bindet das am Original visuell abgenommene Handbuch-PDF
// (Stand 8.10.2025, Seite 204 linke Spalte) an URL + sha256 + Bytezahl + Abrufzeit,
// die woertliche Transkription sowie Person/Nachrueckdatum/Profilhash. KEIN
// automatischer PDF-Parser-Nachweis; Fremdperson, falsches Datum, vertauschtes Paket
// und Quell-/Metadrift sperrt der Assembler (Python-Gegenproben).
const beQuittung = datensaetze.filter((d) => d.mandatsartQuittungBe);
a.equal(beQuittung.length, 2, "zwei Berliner Mandate stammen aus der Berliner Mandatsartenquittung");
a.deepEqual(
  beQuittung.map((d) => d.amtlicheKennung).sort(),
  ["benedikt-lux", "johannes-martin"],
  "genau Martin und Lux sind belegt; Engelmann bleibt offen",
);
const beDatei = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "betrieb", "berlin-mandatsarten-20260927.json"), "utf8"));
a.equal(beDatei.quelle.seite, 204, "PDF-Seite 204 gebunden");
a.equal(beDatei.quelle.pdfSeiteIndex, 204, "PDF-Seitenindex 204 gebunden");
a.equal(beDatei.quelle.spalte, "links", "linke Nachruecker-Spalte gebunden");
a.equal(beDatei.quelle.stand, "2025-10-08", "Stand 8.10.2025 gebunden");
a.equal(beDatei.quelle.sha256, "3ccd91c80803046da57c2a398c9307dfadf938189cd4db99d9c15f256cf486d8");
a.equal(beDatei.belege.length, 2, "genau zwei genehmigte Berliner Belege");
const beByKennung = new Map(beQuittung.map((d) => [d.amtlicheKennung, d]));
const mArt = { "johannes-martin": "Bezirksliste", "benedikt-lux": "Landesliste" };
const mDatum = { "johannes-martin": "2025-09-27", "benedikt-lux": "2025-05-14" };
const mRegion = { "johannes-martin": "Berlin — Bezirksliste Marzahn-Hellersdorf", "benedikt-lux": "Berlin — Landesliste" };
const importModul = require("../lib/helmut/profil-import.js");
const storageModul = require("../lib/helmut/storage.js");
for (const d of beQuittung) {
  const q = d.mandatsartQuittungBe;
  const kennung = d.amtlicheKennung;
  a.equal(d.parlament, "landtag-berlin");
  a.equal(d.profil.bundesland, "Berlin");
  a.equal(d.profil.listenmandat, true, "belegte Bezirks-/Landesliste muss ein Listenmandat sein");
  a.ok(!("wahlkreis" in d.profil), "Listenmandat darf keinen Direktwahlkreis erfinden");
  a.equal(d.profil.regionHinweis, mRegion[kennung], "belegter Regionshinweis aus der Quittung");
  a.equal(q.mandatsart, mArt[kennung], "nur die belegte Mandatsart uebernehmen");
  a.equal(q.nachgeruecktAm, mDatum[kennung], "exaktes Nachrueckdatum aus dem gebundenen Profilblock");
  a.equal(q.seite, 204);
  a.equal(q.spalte, "links");
  a.equal(q.profilUrl, d.quelle.url, "Profil-URL gebunden");
  a.equal(q.profilSha256, d.quelle.sha256, "Profilhash gebunden");
  a.equal(q.url, "https://www.parlament-berlin.de/media/download/5468", "nur das amtliche Handbuch-PDF");
  a.equal(q.sha256, beDatei.quelle.sha256);
  a.ok(q.zitat.length > 20 && q.profilblockWortlaut.includes("Nachgerückt am"), "woertliche Transkription + Profilblock");
  a.ok(d.feldbelege.mandatsartQuelle.includes("docs/betrieb/berlin-mandatsarten-20260927.json"));
  a.ok(!d.offeneFelder.includes("mandatsart"), "belegte Mandatsart darf nicht mehr offen sein");
  // Keine Partei-/Themen-/Funktionsaenderung durch die Mandatsartenquittung.
  a.ok(!("themen" in d.profil), "Mandatsartenquittung darf keine Themen setzen");
  a.ok(!("funktionen" in d.profil), "Mandatsartenquittung darf keine Funktionen setzen");
  // Echter Import-/Storage-Roundtrip: Listenmandat + Region bleiben, kein Direktwahlkreis.
  const gespeichert = importModul.zuHelmutProfil(d.profil);
  a.ok(!gespeichert.constituency, "kein Direktwahlkreis nach dem Import");
  a.equal(gespeichert.regionNote, mRegion[kennung], "Region muss den Importpfad erreichen");
  a.equal(gespeichert.listenmandat, true, "Listenmandat muss den Importpfad erreichen");
  const zeile = storageModul.toMandateProfileRow(gespeichert);
  a.equal(zeile.wahlkreis, null, "Storage-Zeile darf keinen Wahlkreis tragen");
  a.equal(zeile.aktiv, false, "Storage-Zeile darf nicht aktivieren");
  const gelesen = storageModul.fromMandateProfileRow({ id: d.kanonischeKennung, name: d.profil.vollname }, zeile);
  a.equal(gelesen.regionNote, mRegion[kennung], "Region uebersteht den Storage-Roundtrip");
  a.equal(gelesen.listenmandat, true, "Listenmandat uebersteht den Storage-Roundtrip");
  a.ok(!gelesen.constituency, "kein Direktwahlkreis nach dem Storage-Roundtrip");
}
a.equal(beByKennung.get("johannes-martin").profil.partei, "CDU", "Partei bleibt unveraendert belegt");
a.equal(beByKennung.get("benedikt-lux").profil.partei, "GRÜNE", "Partei bleibt unveraendert belegt");
a.ok(beDatei.belege.find((b) => b.amtlicheKennung === "johannes-martin").aktuelleAbschnittsbindung.href
  === "/Abgeordnete/johannes-martin?groupStrategy=constituency", "Martin braucht die exakte Abschnittsbindung");
a.ok(beDatei.belege.find((b) => b.amtlicheKennung === "benedikt-lux").aktuelleAbschnittsbindung === null,
  "Lux hat keine Wahlkreissuche-Abschnittsbindung");
a.ok(!datensaetze.some((d) => d.amtlicheKennung === "claudia-engelmann" && d.mandatsartQuittungBe), "Engelmann bleibt offen");

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
// stellvertretender belegter Ausschuss NOCH ein belegtes Thema vorliegt. Ueber die
// geprueften Ressort- (19), Aufgaben- (6), beratenden (2), Zusatzaufgaben- (3),
// BMWSB-Aufgaben- (2) und die neue Amthor-Einzelfallquittung (1) erhalten 33
// zuvor offene Profile amtlich abgeleitete Themen; ihre Achse schliesst sich
// ehrlich (54 -> 21). Vier Brandenburg- und zwei Berliner
// Mandate sind ueber die Mandatsartenquittungen belegt (7 -> 1 region-fehlt; offen
// bleibt nur Engelmann).
a.deepEqual(fehlercodes, { "schwerpunkt-fehlt": 21, "region-fehlt": 1 }, "offene Felder muessen genau die bekannten Luecken sein");
a.equal(ergebnis.gueltig, 478, "478 Profile sind ohne offene Achse/Mandatsart technisch importierbar");

// Einzelpruefung (pruefeProfil) muss dieselbe Sprache sprechen wie die Mengenpruefung.
for (let i = 0; i < datensaetze.length; i += 1) {
  const einzeln = pruefeProfil(datensaetze[i].profil, { index: i });
  a.equal(einzeln.ok, ergebnis.ergebnisse[i].ok, "pruefeProfil und pruefeImport widersprechen sich");
  a.equal(einzeln.mandatsId, datensaetze[i].kanonischeKennung);
  a.ok(!einzeln.fehler.some((f) => f.code === "profil-zielgruppe-ausgeschlossen"), "AfD-Sperre verletzt");
}

// ── 6b · Gremien-Trennung: belegte sonstige Gremien sind keine staendigen Ausschuesse ───
// Amtlich belegte sonstige Gremien (Beirat, Unterausschuss, Kommission,
// Kontrollgremium, Wahlausschuss, Rechnungspruefung) duerfen NICHT in den
// staendigen Ausschussfeldern stehen. Sie bleiben als weitereGremien UND
// rollengetreu in funktionen erhalten. Unbekannte echte Ausschuesse bleiben
// gesperrt (Negativkontrolle im Python-Gegenproben-Test).
const SONSTIGE_GREMIEN = [
  "Parlamentarischer Beirat für nachhaltige Entwicklung und Zukunftsfragen",
  "Wahlausschuss",
  "Enquete-Kommission „Corona“",
  "Gremium gemäß Artikel 13 Absatz 6 des Grundgesetzes",
  "Parlamentarisches Kontrollgremium (PKGr)",
  "Unterausschuss Internationale Ordnung, Vereinte Nationen und internationale Organisationen",
  "Unterausschuss Krisenprävention, strategische Vorausschau, Stabilisierung und Friedensförderung",
  "Unterausschuss Rüstungs- und Proliferationskontrolle, Nichtverbreitung und internationale Abrüstung",
  "Unterausschuss Europarecht",
  "Unterausschuss Auswärtige Kultur- und Bildungspolitik",
  "Rechnungsprüfungsausschuss",
  "Bundesfinanzierungsgremium",
  "Vertrauensgremium",
  "Kinderkommission - Kommission zur Wahrnehmung der Belange der Kinder",
  "Unterausschuss zu Fragen der Europäischen Union",
];
for (const d of datensaetze.filter((x) => x.parlament === "bundestag")) {
  for (const feld of ["ausschuesse", "stellvertretendeAusschuesse"]) {
    for (const wert of d.profil[feld] || []) {
      a.ok(!SONSTIGE_GREMIEN.includes(wert), `sonstiges Gremium in ${feld}: ${wert}`);
    }
  }
}

const mitWeiterenGremien = datensaetze.filter((d) => (d.weitereGremienBeleg || []).length > 0);
a.equal(mitWeiterenGremien.length, 114, "114 Bundestagsprofile tragen belegte sonstige Gremien");
a.equal(mitWeiterenGremien.every((d) => d.parlament === "bundestag"), true, "nur Bundestagsprofile betroffen");
a.equal(
  datensaetze.reduce((summe, d) => summe + (d.weitereGremienBeleg || []).length, 0),
  141,
  "141 belegte Mitgliedschaften in sonstigen Gremien",
);
a.equal(
  new Set(datensaetze.flatMap((d) => (d.weitereGremienBeleg || []).map((b) => b.gremium))).size,
  15,
  "genau die 15 amtlich belegten sonstigen Gremien",
);
for (const d of mitWeiterenGremien) {
  for (const beleg of d.weitereGremienBeleg) {
    a.ok(["Ordentliches Mitglied", "Stellvertretendes Mitglied"].includes(beleg.rolle), "Rolle rollengetreu belegt");
    a.ok(beleg.url.startsWith("https://www.bundestag.de/"), "amtliche JSON-LD-URL gebunden");
    a.ok((d.profil.funktionen || []).includes(`${beleg.rolle}: ${beleg.gremium}`), "Rolle muss in funktionen erhalten bleiben");
    a.ok(d.weitereGremien.includes(beleg.gremium), "Gremium muss in weitereGremien stehen");
  }
}
const btSonstige = datensaetze.filter((d) => d.parlament === "bundestag");
// Unveraendert: die 23 Landtags-Gremien aus der vorhandenen Extraktion bleiben wie sie waren.
const landtagWeitere = datensaetze.filter((d) => d.parlament !== "bundestag" && (d.weitereGremien || []).length > 0);
a.equal(landtagWeitere.length, 23, "Landtags-Gremien bleiben unveraendert erhalten");
a.equal(landtagWeitere.every((d) => (d.weitereGremienBeleg || []).length === 0), true, "Landtagsgremien sind kein Bundestags-JSON-LD-Beleg");
const btAchseOffen = btSonstige.filter((d) => d.offeneFelder.includes("fachlicheAchse"));
a.equal(btAchseOffen.length, 18, "41 Bundestagsprofile ohne belegte fachliche Achse, davon 9 ueber die Ressort-, 6 ueber die Aufgaben-, 2 ueber die beratenden, 3 ueber die Zusatzaufgaben-, 2 ueber die BMWSB-Aufgabenquittungen und 1 ueber die Amthor-Einzelfallquittung geschlossen");
const btNurSonstigeGremien = btSonstige.filter((d) => (d.weitereGremienBeleg || []).length
  && (d.profil.ausschuesse || []).length === 0
  && (d.profil.stellvertretendeAusschuesse || []).length === 0);
a.deepEqual(
  btNurSonstigeGremien.map((d) => d.amtlicheKennung).sort(),
  ["bilger_steffen-1048434", "hasselmann_britta-1044778", "hoffmann_alexander-1048720", "miersch_matthias-1046120"],
  "genau vier Profile verlieren eine Scheinausschussachse",
);

// ── 6c · Echte Readiness-Bilanz ueber den vorhandenen Produktcode ───────────────────────
// Nicht geschaetzt: bewerteBundestagsprofil (lib/helmut/profile-readiness) auf allen 330
// Bundestagsprofilen, gespeist ueber den echten Importvertrag zuHelmutProfil.
const { bewerteBundestagsprofil } = require("../lib/helmut/profile-readiness.js");
const { zuHelmutProfil } = require("../lib/helmut/profil-import.js");
const storage = require("../lib/helmut/storage.js");
let btBereit = 0;
let btNichtBereit = 0;
const btReadinessGruende = {};
for (const d of btSonstige) {
  const gespeichert = zuHelmutProfil(d.profil);
  for (const beleg of d.weitereGremienBeleg || []) {
    a.ok(gespeichert.function.includes(`${beleg.rolle}: ${beleg.gremium}`), "Gremienrolle bleibt nach Storage-Abbildung erhalten");
  }
  const r = bewerteBundestagsprofil(gespeichert);
  a.equal(r.zutreffend, true, `Readiness muss fuer ${d.kanonischeKennung} zutreffen`);
  if (r.bereit) { btBereit += 1; continue; }
  btNichtBereit += 1;
  a.equal(r.ungueltig.length, 0, `kein ungueltiger Ausschuss mehr (${d.kanonischeKennung})`);
  for (const f of r.fehlend) btReadinessGruende[`fehlend:${f.feld}`] = (btReadinessGruende[`fehlend:${f.feld}`] || 0) + 1;
  for (const w of r.widersprueche) btReadinessGruende[`widerspruch:${w.feld}`] = (btReadinessGruende[`widerspruch:${w.feld}`] || 0) + 1;
}
// Dreiundzwanzig Bundestagsprofile mit zuvor offener fachlicher Achse schliessen sie ueber
// die geprueften Ressort- (9), Aufgaben- (6), beratenden (2), Zusatzaufgaben- (3),
// BMWSB-Aufgaben- (2) und die Amthor-Einzelfallquittung (1): 289 + 23 = 312 bereit,
// 41 - 23 = 18 nicht bereit.
a.equal(btBereit, 312, "312 von 330 Bundestagsprofilen sind bereit (vorher 179)");
a.equal(btNichtBereit, 18, "18 Bundestagsprofile bleiben nicht bereit");
// Stefan Seidler (SSW, fraktionslos) wurde zuvor faelschlich als
// Partei/Fraktionswiderspruch gezaehlt. Fraktionslosigkeit schliesst eine
// Parteimitgliedschaft nicht aus; der Fix in profile-readiness entfernt nur diesen
// Prueffehler. Seine beratende Achse ist inzwischen belegt; die 18 nicht-bereiten
// Bundestagsprofile entstehen ausschliesslich aus offenen fachlichen Achsen.
a.deepEqual(
  btReadinessGruende,
  { "fehlend:schwerpunkt_oder_ausschuss": 18 },
  "nur noch die offene fachliche Achse; der falsche Partei/Fraktionswiderspruch ist weg",
);

// ── 6d · Rollenquittung der 54 offenen Fachachsen (48 belegt / 6 offen) ──────────────────
// Die vom Orchestrator gepruefte Quittung haengt nur die freigegebenen wortlaut-Strings
// dedupliziert an bestehende funktionen. Sie erzeugt KEINE fachliche Achse und KEIN
// regierungsrolle-Schema: bestehende Gremienrollen bleiben, die 54 Achsen bleiben offen.
const rollen = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "betrieb", "profilrollen-54-20260927.json"), "utf8"));
a.equal(rollen.bilanz.gesamt, 54, "Quittung muss 54 Profile umfassen");
a.equal(rollen.bilanz.rollenbelegt, 48, "48 Rollen sind belegt");
a.equal(rollen.bilanz.offen, 6, "6 Eintraege bleiben offen");
a.equal(rollen.ergebnisse.length, 54, "Quittung muss 54 Ergebnisse tragen");
const rollenByKennung = new Map(rollen.ergebnisse.map((e) => [e.kennung, e]));
a.equal(rollenByKennung.size, 54, "Quittungskennungen muessen eindeutig sein");
for (const e of rollen.ergebnisse) {
  if (e.status === "offen") a.deepEqual(e.funktionen, [], "offener Eintrag darf keine Rolle tragen");
  else a.ok(e.funktionen.length > 0, "belegter Eintrag braucht eine Rolle");
}
// Die geprueften 19 Ressort- und 6 Aufgabenachsen schliessen die fachliche Achse
// dieser Profile ueber amtlich abgeleitete Themen. Die 54er Rollenquittung bleibt
// deckungsgleich: disjunkte Vereinigung aus 29 verbleibend offenen + 25
// geschlossenen = 54.
const ressort = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "betrieb", "ressortachsen-19-20260927.json"), "utf8"));
a.equal(ressort.bilanz.gesamt, 19, "Ressortquittung muss 19 Profile umfassen");
a.equal(ressort.bilanz.Bund, 9, "9 Bund-Ressortachsen");
a.equal(ressort.bilanz.Berlin, 4, "4 Berlin-Ressortachsen");
a.equal(ressort.bilanz.Brandenburg, 6, "6 Brandenburg-Ressortachsen");
a.equal(ressort.ergebnisse.length, 19, "Ressortquittung muss 19 Ergebnisse tragen");
const ressortByKennung = new Map(ressort.ergebnisse.map((e) => [e.kennung, e]));
a.equal(ressortByKennung.size, 19, "Ressortquittungskennungen muessen eindeutig sein");
for (const e of ressort.ergebnisse) {
  a.ok(rollenByKennung.has(e.kennung), "Ressortachse muss eine der 54 offenen Fachachsen sein");
  a.equal(e.status, "belegt", "Ressortachse muss belegt sein");
}
const aufgaben = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "betrieb", "aufgabenachsen-6-20260927.json"), "utf8"));
a.equal(aufgaben.bilanz.gesamt, 6, "Aufgabenquittung muss 6 Profile umfassen");
a.equal(aufgaben.bilanz.Bund, 6, "alle 6 Aufgabenachsen sind Bundestag");
a.equal(aufgaben.ergebnisse.length, 6, "Aufgabenquittung muss 6 Ergebnisse tragen");
const aufgabenByKennung = new Map(aufgaben.ergebnisse.map((e) => [e.kennung, e]));
a.equal(aufgabenByKennung.size, 6, "Aufgabenquittungskennungen muessen eindeutig sein");
for (const e of aufgaben.ergebnisse) {
  a.ok(rollenByKennung.has(e.kennung), "Aufgabenachse muss eine der 54 offenen Fachachsen sein");
  a.equal(e.status, "belegt", "Aufgabenachse muss belegt sein");
  a.ok(!ressortByKennung.has(e.kennung), "Aufgabenachse muss disjunkt zur Ressortachse sein");
}
const beratende = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "betrieb", "beratende-achsen-2-20260927.json"), "utf8"));
a.equal(beratende.umfang, 2, "Beratende Achsenquittung muss 2 Profile umfassen");
a.equal(beratende.bilanz.gesamt, 2, "Beratende Achsenquittung: gesamt 2");
a.equal(beratende.bilanz.Bund, 2, "beide beratenden Achsen sind Bundestag");
a.equal(beratende.ergebnisse.length, 2, "Beratende Achsenquittung muss 2 Ergebnisse tragen");
const beratendeByKennung = new Map(beratende.ergebnisse.map((e) => [e.kennung, e]));
a.equal(beratendeByKennung.size, 2, "Beratende Achsenquittungskennungen muessen eindeutig sein");
for (const e of beratende.ergebnisse) {
  // Diese zwei sind in der 54er Quittung ausdruecklich offen: die bestehende
  // beratende Funktion war bereits belegt, das ist KEIN Fehler.
  a.ok(rollenByKennung.has(e.kennung), "Beratende Achse muss eine der 54 offenen Fachachsen sein");
  a.equal(rollenByKennung.get(e.kennung).status, "offen", "beratende Achse bleibt in der 54er Quittung offen");
  a.equal(e.status, "belegt", "Beratende Achse muss belegt sein");
  a.ok(!ressortByKennung.has(e.kennung), "Beratende Achse muss disjunkt zur Ressortachse sein");
  a.ok(!aufgabenByKennung.has(e.kennung), "Beratende Achse muss disjunkt zur Aufgabenachse sein");
}
const zusatz = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "betrieb", "zusaetzliche-aufgaben-3-20260927.json"), "utf8"));
a.equal(zusatz.umfang, 3, "Zusatzaufgabenquittung muss 3 Profile umfassen");
a.equal(zusatz.bilanz.gesamt, 3, "Zusatzaufgabenquittung: gesamt 3");
a.equal(zusatz.bilanz.Bund, 3, "alle 3 Zusatzaufgabenachsen sind Bundestag");
a.equal(zusatz.ergebnisse.length, 3, "Zusatzaufgabenquittung muss 3 Ergebnisse tragen");
const zusatzByKennung = new Map(zusatz.ergebnisse.map((e) => [e.kennung, e]));
a.equal(zusatzByKennung.size, 3, "Zusatzaufgabenquittungskennungen muessen eindeutig sein");
for (const e of zusatz.ergebnisse) {
  a.ok(rollenByKennung.has(e.kennung), "Zusatzaufgabenachse muss eine der 54 offenen Fachachsen sein");
  a.equal(rollenByKennung.get(e.kennung).status, "belegt", "Zusatzaufgabenachse stuetzt sich auf eine belegte 54er-Rolle");
  a.equal(e.status, "belegt", "Zusatzaufgabenachse muss belegt sein");
  a.ok(!ressortByKennung.has(e.kennung), "Zusatzaufgabenachse muss disjunkt zur Ressortachse sein");
  a.ok(!aufgabenByKennung.has(e.kennung), "Zusatzaufgabenachse muss disjunkt zur Aufgabenachse sein");
  a.ok(!beratendeByKennung.has(e.kennung), "Zusatzaufgabenachse muss disjunkt zur beratenden Achse sein");
}
const bmwsb = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "betrieb", "bmwsb-aufgaben-2-20260927.json"), "utf8"));
a.equal(bmwsb.umfang, 2, "BMWSB-Aufgabenquittung muss 2 Profile umfassen");
a.equal(bmwsb.bilanz.gesamt, 2, "BMWSB-Aufgabenquittung: gesamt 2");
a.equal(bmwsb.bilanz.Bund, 2, "beide BMWSB-Aufgabenachsen sind Bundestag");
a.equal(bmwsb.ergebnisse.length, 2, "BMWSB-Aufgabenquittung muss 2 Ergebnisse tragen");
const bmwsbByKennung = new Map(bmwsb.ergebnisse.map((e) => [e.kennung, e]));
a.equal(bmwsbByKennung.size, 2, "BMWSB-Aufgabenquittungskennungen muessen eindeutig sein");
for (const e of bmwsb.ergebnisse) {
  a.ok(rollenByKennung.has(e.kennung), "BMWSB-Aufgabenachse muss eine der 54 offenen Fachachsen sein");
  a.equal(rollenByKennung.get(e.kennung).status, "belegt", "BMWSB-Aufgabenachse stuetzt sich auf eine belegte 54er-Rolle");
  a.equal(e.status, "belegt", "BMWSB-Aufgabenachse muss belegt sein");
  a.ok(!ressortByKennung.has(e.kennung), "BMWSB-Aufgabenachse muss disjunkt zur Ressortachse sein");
  a.ok(!aufgabenByKennung.has(e.kennung), "BMWSB-Aufgabenachse muss disjunkt zur Aufgabenachse sein");
  a.ok(!beratendeByKennung.has(e.kennung), "BMWSB-Aufgabenachse muss disjunkt zur beratenden Achse sein");
  a.ok(!zusatzByKennung.has(e.kennung), "BMWSB-Aufgabenachse muss disjunkt zur Zusatzaufgabenachse sein");
}
const amthor = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "betrieb", "amthor-aktuelles-amt-1-20260927.json"), "utf8"));
a.equal(amthor.umfang, 1, "Amthor-Einzelfallquittung muss genau 1 Fall umfassen");
a.equal(amthor.bilanz.gesamt, 1, "Amthor-Einzelfallquittung: gesamt 1");
a.equal(amthor.bilanz.Bund, 1, "der Amthor-Fall ist Bundestag");
a.equal(amthor.ergebnisse.length, 1, "Amthor-Einzelfallquittung muss 1 Ergebnis tragen");
const amthorByKennung = new Map(amthor.ergebnisse.map((e) => [e.kennung, e]));
a.equal(amthorByKennung.size, 1, "Amthor-Einzelfallquittungskennung muss eindeutig sein");
for (const e of amthor.ergebnisse) {
  a.ok(rollenByKennung.has(e.kennung), "Amthor muss eine der 54 urspruenglich offenen Fachachsen sein");
  // Der alte Rollenvalidator darf Amthor NICHT ungeprueft uebernehmen: der Eintrag
  // bleibt historisch offen (keine Lockerung der anderen Eintraege).
  a.equal(rollenByKennung.get(e.kennung).status, "offen", "Amthor bleibt in der 54er Quittung offen");
  a.deepEqual(rollenByKennung.get(e.kennung).funktionen, [], "der offene 54er-Eintrag traegt keine Rolle");
  a.equal(e.status, "belegt", "Amthor-Einzelfall muss belegt sein");
  a.ok(!ressortByKennung.has(e.kennung), "Amthor muss disjunkt zur Ressortachse sein");
  a.ok(!aufgabenByKennung.has(e.kennung), "Amthor muss disjunkt zur Aufgabenachse sein");
  a.ok(!beratendeByKennung.has(e.kennung), "Amthor muss disjunkt zur beratenden Achse sein");
  a.ok(!zusatzByKennung.has(e.kennung), "Amthor muss disjunkt zur Zusatzaufgabenachse sein");
  a.ok(!bmwsbByKennung.has(e.kennung), "Amthor muss disjunkt zur BMWSB-Achse sein");
}
const ressortProfil = datensaetze.filter((d) => d.ressortachsenQuittung);
const aufgabenProfil = datensaetze.filter((d) => d.aufgabenachsenQuittung);
const beratendeProfil = datensaetze.filter((d) => d.beratendeachsenQuittung);
const zusatzProfil = datensaetze.filter((d) => d.zusaetzlicheaufgabenQuittung);
const bmwsbProfil = datensaetze.filter((d) => d.bmwsbQuittung);
const amthorProfil = datensaetze.filter((d) => d.amthorQuittung);
const fachAchseOffen = datensaetze.filter((d) => d.offeneFelder.includes("fachlicheAchse"));
a.equal(ressortProfil.length, 19, "19 Profile tragen eine Ressortachse");
a.equal(aufgabenProfil.length, 6, "6 Profile tragen eine Aufgabenachse");
a.equal(beratendeProfil.length, 2, "2 Profile tragen eine beratende Ausschussachse");
a.equal(zusatzProfil.length, 3, "3 Profile tragen eine Zusatzaufgabenachse");
a.equal(bmwsbProfil.length, 2, "2 Profile tragen eine BMWSB-Aufgabenachse");
a.equal(amthorProfil.length, 1, "1 Profil traegt die Amthor-Einzelfallquittung");
a.equal(fachAchseOffen.length, 21, "54 - 19 - 6 - 2 - 3 - 2 - 1 = 21 Fachachsen bleiben offen");
a.deepEqual(
  new Set([...fachAchseOffen, ...ressortProfil, ...aufgabenProfil, ...beratendeProfil, ...zusatzProfil, ...bmwsbProfil, ...amthorProfil].map((d) => d.kanonischeKennung)),
  new Set(rollenByKennung.keys()),
  "disjunkte Vereinigung aus 21 offenen + 19 Ressort- + 6 Aufgaben- + 2 beratenden + 3 Zusatzaufgaben- + 2 BMWSB- + 1 Amthor-Achse ergibt genau die 54er Quittung",
);
a.ok(fachAchseOffen.every((d) => !d.ressortachsenQuittung && !d.aufgabenachsenQuittung && !d.beratendeachsenQuittung && !d.zusaetzlicheaufgabenQuittung && !d.bmwsbQuittung && !d.amthorQuittung), "offene Achse darf keine geschlossene Quittung tragen");
let rollenBelegt = 0;
let rollenOffen = 0;
const zuHelmutProfilRollen = zuHelmutProfil; // echter Import-/Storage-Pfad (bestehender Export)
for (const d of datensaetze) {
  const e = rollenByKennung.get(d.kanonischeKennung);
  const q = d.profilrollenQuittung;
  if (!e) {
    a.equal(q, undefined, "ohne Quittungseintrag darf kein Rollenbeleg gesetzt sein");
    continue;
  }
  a.ok(q, `Rollenbeleg fehlt fuer ${d.kanonischeKennung}`);
  a.equal(q.datei, "docs/betrieb/profilrollen-54-20260927.json");
  a.equal(q.url, d.quelle.url, "Rollenbeleg muss an die amtliche Quell-URL gebunden sein");
  a.equal(q.sha256, d.quelle.sha256, "Rollenbeleg muss denselben Quellhash binden");
  a.equal(q.status, e.status, "Rollenstatus muss der Quittung entsprechen");
  // Eine Amtsrolle allein ist keine Ausschussachse. Die fachliche Achse ist genau dann
  // geschlossen, wenn die gepruefte Ressort- oder Aufgabenquittung belegte Themen setzt.
  const achseGeschlossen = Boolean(d.ressortachsenQuittung || d.aufgabenachsenQuittung || d.beratendeachsenQuittung || d.zusaetzlicheaufgabenQuittung || d.bmwsbQuittung || d.amthorQuittung);
  a.equal(achseGeschlossen, !d.offeneFelder.includes("fachlicheAchse"),
    `Achse muss genau dann geschlossen sein, wenn eine gepruefte Quittung greift (${d.kanonischeKennung})`);
  if (e.status === "offen") {
    rollenOffen += 1;
    a.deepEqual(q.funktionen, [], "ein offener Eintrag haengt keine Rolle an");
    continue;
  }
  rollenBelegt += 1;
  a.equal(q.funktionen.length, e.funktionen.length, "Rollenbeleg muss die freigegebenen Rollen abbilden");
  const gespeichert = zuHelmutProfilRollen(d.profil);
  for (const f of e.funktionen) {
    a.ok(f.wortlaut && f.zitat && f.abschnitt, "Rolle braucht wortlaut/zitat/abschnitt");
    a.ok(f.zitat.includes(f.wortlaut), "Wortlaut muss im belegten Zitat stehen (kein erfundener Wortlaut)");
    const funktionen = d.profil.funktionen || [];
    a.equal(funktionen.filter((x) => x === f.wortlaut).length, 1, `Wortlaut genau einmal angehaengt (${f.wortlaut})`);
    a.ok(gespeichert.function.includes(f.wortlaut), "Wortlaut muss den echten Import-/Storage-Funktionspfad erreichen");
  }
  // Bestehende Gremienrollen bleiben unveraendert erhalten.
  for (const beleg of d.weitereGremienBeleg || []) {
    a.ok((d.profil.funktionen || []).includes(`${beleg.rolle}: ${beleg.gremium}`), "Gremienrolle muss erhalten bleiben");
  }
}
a.equal(rollenBelegt, 48, "48 Profile tragen eine belegte Amtsrolle");
a.equal(rollenOffen, 6, "6 Profile bleiben ohne neue Rolle offen");

// ── 6e · Ressortachse: Verlustfreier Import-/Storage-Round-Trip inkl. Kennzeichnung ──────
// Fuer ALLE 19 Profile: Ressortbegriffe und ein separater Herkunftshinweis aus dem
// amtlichem Ressort; die zuvor offene fachliche Achse ist geschlossen; die Zusatzquelle ist
// vollstaendig gebunden; der echte Pfad zuHelmutProfil -> toMandateProfileRow ->
// fromMandateProfileRow erhaelt die Themen UND getrennte Ableitungskennzeichnung und bleibt
// aktiv=false. KEIN Netz, KEINE DB, KEIN Modell.
a.equal(ressortProfil.reduce((n, d) => n + d.profil.themen.length, 0), 39, "39 ausdrueckliche Ressortbegriffe");
for (const d of ressortProfil) {
  const e = ressortByKennung.get(d.kanonischeKennung);
  a.ok(e, `Ressortquittung fehlt fuer ${d.kanonischeKennung}`);
  const hinweis = `Ressortzuständigkeit ${e.region} (amtlich abgeleitet): ${e.ressort}; keine persönliche politische Position`;
  a.deepEqual(d.profil.themen, e.themen, "genau der freigegebene Themenwortlaut");
  a.ok(!d.offeneFelder.includes("fachlicheAchse"), "Ressortachse schliesst die fachliche Achse");
  a.equal(d.profil.aktiv, false, "Ressortprofil bleibt aktiv=false");
  a.equal(d.importfreigegeben, false, "Ressortprofil bleibt importfreigegeben=false");
  a.equal(d.ressortachsenQuittung.datei, "docs/betrieb/ressortachsen-19-20260927.json");
  a.equal(d.ressortachsenQuittung.region, e.region);
  a.equal(d.ressortachsenQuittung.ressort, e.ressort);
  a.equal(d.ressortachsenQuittung.zitat, e.zitat);
  a.equal(d.ressortachsenQuittung.quelle.url, e.quelle.url);
  a.equal(d.ressortachsenQuittung.quelle.sha256, e.quelle.sha256);
  const zusatz = (d.profil.offizielleQuellen || []).find((x) => x.art === "ressort-zustaendigkeit");
  a.ok(zusatz, "amtliche Zusatzquelle fehlt in profil.offizielleQuellen");
  a.equal(zusatz.url, e.quelle.url, "Zusatzquelle muss die amtliche URL binden");
  a.equal(zusatz.sha256, e.quelle.sha256, "Zusatzquelle muss den Quellhash binden");
  // Echter Verlustfreiheitspfad (keine DB, kein Netz): Themen inkl. Kennzeichnung.
  const gespeichert = zuHelmutProfil(d.profil);
  a.deepEqual(gespeichert.focusTopics, e.themen, "Importpfad muss den Themenwortlaut erhalten");
  const zeile = storage.toMandateProfileRow(gespeichert);
  a.equal(zeile.aktiv, false, "Storage-Zeile darf nicht aktivieren");
  const gelesen = storage.fromMandateProfileRow({ id: d.kanonischeKennung, name: d.profil.vollname }, zeile);
  a.deepEqual(gelesen.focusTopics, e.themen, "Ressortthemen muessen verlustfrei erhalten bleiben");
  a.ok(gelesen.function.includes(hinweis), "Ableitungskennzeichnung bleibt im Rollenkontext erhalten");
  a.equal(d.profil.funktionen.filter(x => x === hinweis).length, 1);
  const { proximityScore } = require("../lib/helmut/scoring");
  // Isolierter Themenbezug: kein Name, keine Partei oder Region als Ersatztreffer.
  for (const thema of e.themen) {
    a.ok(proximityScore({ tags: [thema] }, { focusTopics: gelesen.focusTopics }) > 0,
      `Echter Themenabgleich muss nach Round-Trip greifen: ${thema}`);
  }
  a.equal(proximityScore({ tags: ["Unbelegtes Fremdthema"] }, { focusTopics: gelesen.focusTopics }), 0);
  a.equal(gelesen.profileActive, false, "Round-Trip bleibt aktiv=false");
}

// ── 6f · Aufgabenachsen: Verlustfreier Import-/Storage-Round-Trip inkl. Kennzeichnung ────
// Fuer ALLE 6 Profile: ausdrueckliche amtlich abgeleitete Themen aus einem
// personengebundenen Aufgabenbereich; die zuvor offene fachliche Achse ist geschlossen; die
// amtliche Zusatzquelle ist vollstaendig gebunden; der echte Pfad zuHelmutProfil ->
// toMandateProfileRow -> fromMandateProfileRow erhaelt die Themen UND den getrennten
// Herkunftshinweis und bleibt aktiv=false. KEIN Netz, KEINE DB, KEIN Modell.
a.equal(aufgabenProfil.reduce((n, d) => n + d.profil.themen.length, 0), 14, "14 ausdrueckliche Aufgabenbegriffe");
const konnektoren = new Set(["Digitales", "Staatsmodernisierung"]);
const grieseThemen = new Set((aufgabenByKennung.get("bundestag-griese-kerstin-1044602").themen) || []);
for (const d of aufgabenProfil) {
  const e = aufgabenByKennung.get(d.kanonischeKennung);
  a.ok(e, `Aufgabenquittung fehlt fuer ${d.kanonischeKennung}`);
  const hinweis = `Aufgabenbindung ${e.region} (amtlich abgeleitet): ${e.aufgabenbindung}; keine persönliche politische Position`;
  a.deepEqual(d.profil.themen, e.themen, "genau der freigegebene Themenwortlaut");
  a.ok(!d.offeneFelder.includes("fachlicheAchse"), "Aufgabenachse schliesst die fachliche Achse");
  a.equal(d.profil.aktiv, false, "Aufgabenprofil bleibt aktiv=false");
  a.equal(d.importfreigegeben, false, "Aufgabenprofil bleibt importfreigegeben=false");
  a.equal(d.aufgabenachsenQuittung.datei, "docs/betrieb/aufgabenachsen-6-20260927.json");
  a.equal(d.aufgabenachsenQuittung.region, e.region);
  a.equal(d.aufgabenachsenQuittung.bindungsart, e.bindungsart);
  a.equal(d.aufgabenachsenQuittung.person, e.person);
  a.equal(d.aufgabenachsenQuittung.aufgabenbindung, e.aufgabenbindung);
  a.deepEqual(d.aufgabenachsenQuittung.zitate, e.zitate);
  a.equal(d.aufgabenachsenQuittung.quelle.url, e.quelle.url);
  a.equal(d.aufgabenachsenQuittung.quelle.sha256, e.quelle.sha256);
  // Rollenquelle muss die kanonische Person der 54er Quittung sein (URL UND Hash).
  const rollenEintrag = rollenByKennung.get(d.kanonischeKennung);
  a.ok(rollenEintrag && rollenEintrag.status === "belegt", "Aufgabenachse setzt eine belegte 54er-Rolle voraus");
  a.equal(d.aufgabenachsenQuittung.rollenquelle.url, rollenEintrag.quelle.url, "Rollenquelle muss die kanonische Person sein");
  a.equal(d.aufgabenachsenQuittung.rollenquelle.sha256, rollenEintrag.quelle.sha256);
  const zusatz = (d.profil.offizielleQuellen || []).find((x) => x.art === "aufgaben-zustaendigkeit");
  a.ok(zusatz, "amtliche Aufgabenquelle fehlt in profil.offizielleQuellen");
  a.equal(zusatz.url, e.quelle.url, "Aufgabenquelle muss die amtliche URL binden");
  a.equal(zusatz.sha256, e.quelle.sha256, "Aufgabenquelle muss den Quellhash binden");
  // Existierende Funktionen bleiben erhalten (kein regierungsrolle-Schema, keine Entfernung).
  a.ok((d.profil.funktionen || []).filter((x) => x === hinweis).length === 1,
    "Herkunftshinweis genau einmal in funktionen");
  for (const beleg of d.weitereGremienBeleg || []) {
    a.ok((d.profil.funktionen || []).includes(`${beleg.rolle}: ${beleg.gremium}`), "Gremienrolle muss erhalten bleiben");
  }
  // Fachliche Bindungen: keine Ableitung aus blosser Ministeriumszugehoerigkeit.
  if (e.kennung === "bundestag-connemann-gitta-1043962") {
    for (const thema of e.themen) a.ok(!konnektoren.has(thema), "Connemann: Digitales ist keine Beauftragtenaufgabe");
    a.deepEqual(e.themen, ["Mittelstand"], "Connemann nur Mittelstand");
  }
  if (e.kennung === "bundestag-kaiser-elisabeth-1045268") {
    a.deepEqual(e.themen, ["gleichwertige Lebensverhältnisse"], "Kaiser nur gleichwertige Lebensverhaeltnisse");
  }
  if (e.bindungsart === "abteilungszustaendigkeit") {
    a.ok(e.abteilungsnummern.length > 0, "BMAS: explizite Abteilungsnummern noetig");
    if (e.kennung === "bundestag-mast-katja-1046000") {
      for (const thema of e.themen) a.ok(!grieseThemen.has(thema), `Mast darf kein Griese-Thema tragen: ${thema}`);
      a.deepEqual(e.abteilungsnummern, ["II", "III"], "Mast II/III");
    }
    if (e.kennung === "bundestag-griese-kerstin-1044602") {
      a.deepEqual(e.abteilungsnummern, ["IV", "V"], "Griese IV/V");
    }
  }
  // Echter Verlustfreiheitspfad (keine DB, kein Netz): Themen inkl. Kennzeichnung.
  const gespeichert = zuHelmutProfil(d.profil);
  a.deepEqual(gespeichert.focusTopics, e.themen, "Importpfad muss den Themenwortlaut erhalten");
  const zeile = storage.toMandateProfileRow(gespeichert);
  a.equal(zeile.aktiv, false, "Storage-Zeile darf nicht aktivieren");
  const gelesen = storage.fromMandateProfileRow({ id: d.kanonischeKennung, name: d.profil.vollname }, zeile);
  a.deepEqual(gelesen.focusTopics, e.themen, "Aufgabenthemen muessen verlustfrei erhalten bleiben");
  a.ok(gelesen.function.includes(hinweis), "Herkunftshinweis muss im gespeicherten function erhalten bleiben");
  const { proximityScore } = require("../lib/helmut/scoring");
  for (const thema of e.themen) {
    a.ok(proximityScore({ tags: [thema] }, { focusTopics: gelesen.focusTopics }) > 0,
      `Echter Themenabgleich muss nach Round-Trip greifen: ${thema}`);
  }
  a.equal(proximityScore({ tags: ["Unbelegtes Fremdthema"] }, { focusTopics: gelesen.focusTopics }), 0);
  a.equal(gelesen.profileActive, false, "Round-Trip bleibt aktiv=false");
}

// ── 6g · Beratende Ausschussachsen: Verlustfreier Round-Trip inkl. Kennzeichnung ──────────
// Fuer die 2 beratenden Ausschussachsen (Knodel Landwirtschaft/Ernaehrung/Heimat, Seidler
// Haushalt): ausdrueckliche Kurzthemen aus dem amtlichen Ausschussnamen, die bestehende
// BERATENDE Funktion bleibt erhalten, es entsteht KEINE ordentliche/stellvertretende
// Ausschussmitgliedschaft und keine politische Position. Die kanonische Quelle ist
// vollstaendig gebunden; der echte Pfad zuHelmutProfil -> toMandateProfileRow ->
// fromMandateProfileRow erhaelt die Themen UND den getrennten Ableitungshinweis und bleibt
// aktiv=false. KEIN Netz, KEINE DB, KEIN Modell.
a.equal(beratendeProfil.reduce((n, d) => n + d.profil.themen.length, 0), 4, "4 ausdrueckliche Kurzthemen");
for (const d of beratendeProfil) {
  const e = beratendeByKennung.get(d.kanonischeKennung);
  a.ok(e, `Beratende Achsenquittung fehlt fuer ${d.kanonischeKennung}`);
  const hinweis = `Beratende Ausschussarbeit Bund (amtlich abgeleitet): ${e.amtlicherAusschuss}; keine ordentliche oder stellvertretende Mitgliedschaft, keine persönliche politische Position`;
  a.deepEqual(d.profil.themen, e.themen, "genau der freigegebene Kurzthemenwortlaut");
  a.ok(!d.offeneFelder.includes("fachlicheAchse"), "beratende Achse schliesst die fachliche Achse");
  a.equal(d.profil.aktiv, false, "beratendes Profil bleibt aktiv=false");
  a.equal(d.importfreigegeben, false, "beratendes Profil bleibt importfreigegeben=false");
  a.equal(d.beratendeachsenQuittung.datei, "docs/betrieb/beratende-achsen-2-20260927.json");
  a.equal(d.beratendeachsenQuittung.region, e.region);
  a.equal(d.beratendeachsenQuittung.person, e.person);
  a.equal(d.beratendeachsenQuittung.ausschuss, e.amtlicherAusschuss);
  a.equal(d.beratendeachsenQuittung.rolle, "Beratendes Mitglied");
  a.deepEqual(d.beratendeachsenQuittung.amtlicherRollenbeleg, e.amtlicherRollenbeleg);
  a.deepEqual(d.beratendeachsenQuittung.bestehendeFunktionen, e.bestehendeFunktionen);
  a.equal(d.beratendeachsenQuittung.quelle.url, e.quelle.url);
  a.equal(d.beratendeachsenQuittung.quelle.sha256, e.quelle.sha256);
  a.equal(d.beratendeachsenQuittung.quelle.bytes, e.quelle.bytes);
  // Die Rolle ist BERATEND — niemals ordentliche/stellvertretende Ausschussmitgliedschaft.
  a.equal(d.beratendeachsenQuittung.amtlicherRollenbeleg.roleName, "Beratendes Mitglied", "nur beratende Rolle");
  a.ok(!("endDate" in d.beratendeachsenQuittung.amtlicherRollenbeleg), "keine abgelaufene Rolle (kein endDate)");
  for (const feld of ["ausschuesse", "stellvertretendeAusschuesse"]) {
    a.ok(!(d.profil[feld] || []).includes(e.amtlicherAusschuss), `beratender Ausschuss darf nicht in ${feld} stehen`);
  }
  const funktionen = d.profil.funktionen || [];
  a.equal(funktionen.filter((x) => x === `${"Beratendes Mitglied"}: ${e.amtlicherAusschuss}`).length, 1, "bestehende beratende Funktion genau einmal erhalten");
  a.equal(funktionen.filter((x) => x === hinweis).length, 1, "Ableitungshinweis genau einmal in funktionen");
  const zusatz = (d.profil.offizielleQuellen || []).find((x) => x.art === "beratende-ausschussarbeit");
  a.ok(zusatz, "amtliche beratende Quittungsquelle fehlt in profil.offizielleQuellen");
  a.equal(zusatz.url, e.quelle.url, "Quittungsquelle muss die kanonische URL binden");
  a.equal(zusatz.sha256, e.quelle.sha256, "Quittungsquelle muss den Quellhash binden");
  // Rollenquelle muss die kanonische Person der 54er Quittung sein (URL UND Hash).
  const rollenEintrag = rollenByKennung.get(d.kanonischeKennung);
  a.ok(rollenEintrag, "beratende Achse setzt eine 54er-Rolle voraus");
  a.equal(d.beratendeachsenQuittung.rollenquelle.url, rollenEintrag.quelle.url, "Rollenquelle muss die kanonische Person sein");
  a.equal(d.beratendeachsenQuittung.rollenquelle.sha256, rollenEintrag.quelle.sha256);
  // Echter Verlustfreiheitspfad (keine DB, kein Netz): Themen inkl. Kennzeichnung.
  const gespeichert = zuHelmutProfil(d.profil);
  a.deepEqual(gespeichert.focusTopics, e.themen, "Importpfad muss den Kurzthemenwortlaut erhalten");
  const zeile = storage.toMandateProfileRow(gespeichert);
  a.equal(zeile.aktiv, false, "Storage-Zeile darf nicht aktivieren");
  const gelesen = storage.fromMandateProfileRow({ id: d.kanonischeKennung, name: d.profil.vollname }, zeile);
  a.deepEqual(gelesen.focusTopics, e.themen, "beratende Kurzthemen muessen verlustfrei erhalten bleiben");
  a.ok(gelesen.function.includes(hinweis), "Ableitungshinweis muss im gespeicherten function erhalten bleiben");
  a.ok(gelesen.function.includes("Beratendes Mitglied"), "bestehende beratende Funktion muss erhalten bleiben");
  const { proximityScore } = require("../lib/helmut/scoring");
  for (const thema of e.themen) {
    a.ok(proximityScore({ tags: [thema] }, { focusTopics: gelesen.focusTopics }) > 0,
      `Echter Themenabgleich muss nach Round-Trip greifen: ${thema}`);
  }
  a.equal(proximityScore({ tags: ["Unbelegtes Fremdthema"] }, { focusTopics: gelesen.focusTopics }), 0);
  a.equal(gelesen.profileActive, false, "Round-Trip bleibt aktiv=false");
}
// Knodel/Seidler tragen genau ihre amtlich abgeleiteten Kurzthemen.
a.deepEqual(beratendeByKennung.get("bundestag-knodel-sieghard-1045460").themen, ["Landwirtschaft", "Ernährung", "Heimat"]);
a.deepEqual(beratendeByKennung.get("bundestag-seidler-stefan-1047378").themen, ["Haushalt"]);
for (const d of beratendeProfil) {
  const { proximityScore } = require("../lib/helmut/scoring");
  for (const thema of ["Ausschuss", "Politik", "Fremdthema"]) {
    a.equal(proximityScore({ tags: [thema] }, { focusTopics: d.profil.themen }), 0, `Fremdthema darf nicht treffen: ${thema}`);
  }
}

// ── 6h · Zusaetzliche Fachzustaendigkeiten: Verlustfreier Round-Trip inkl. Kennzeichnung ──
// Fuer die 3 zusaetzlichen Fachzustaendigkeiten (Breher Tierschutz, Krichbaum Europa,
// Kippels BMG-Abteilungen 1/4/5/6): ausdrueckliche amtlich abgeleitete Kurzthemen,
// getrennter Herkunftshinweis, bestehende Rollen bleiben erhalten; Breher erhaelt genau
// EINE neue Funktionsrolle. Die kanonische Quelle ist vollstaendig gebunden; der echte
// Pfad zuHelmutProfil -> toMandateProfileRow -> fromMandateProfileRow erhaelt die Themen
// UND den getrennten Ableitungshinweis und bleibt aktiv=false. KEIN Netz, KEINE DB.
a.equal(zusatzProfil.reduce((n, d) => n + d.profil.themen.length, 0), 14, "14 ausdrueckliche Kurzthemen (1+1+12)");
const FREMDTHEMEN = {
  "bundestag-breher-silvia-1043814": ["Europa", "Gesundheit"],
  "bundestag-krichbaum-gunther-1048828": ["Tierschutz", "Arzneimittel"],
  "bundestag-kippels-georg-1045390": ["Landwirtschaft", "Europa-Ausschuss"],
};
for (const d of zusatzProfil) {
  const e = zusatzByKennung.get(d.kanonischeKennung);
  a.ok(e, `Zusatzaufgabenquittung fehlt fuer ${d.kanonischeKennung}`);
  const hinweis = e.bindungsart === "abteilungszustaendigkeit"
    ? `Aufgabenbindung ${e.region} (amtlich abgeleitet): ${e.aufgabenbindung}; keine persönliche politische Position`
    : (e.bindungsart === "amtshinweis"
      ? `Amtszuständigkeit ${e.region} (amtlich abgeleitet): ${e.amt}; keine persönliche politische Position`
      : `Amtszuständigkeit ${e.region} (amtlich abgeleitet): ${e.funktion}; keine persönliche politische Position`);
  a.deepEqual(d.profil.themen, e.themen, "genau der freigegebene Kurzthemenwortlaut");
  a.ok(!d.offeneFelder.includes("fachlicheAchse"), "Zusatzaufgabenachse schliesst die fachliche Achse");
  a.equal(d.profil.aktiv, false, "Zusatzprofil bleibt aktiv=false");
  a.equal(d.importfreigegeben, false, "Zusatzprofil bleibt importfreigegeben=false");
  a.equal(d.zusaetzlicheaufgabenQuittung.datei, "docs/betrieb/zusaetzliche-aufgaben-3-20260927.json");
  a.equal(d.zusaetzlicheaufgabenQuittung.region, e.region);
  a.equal(d.zusaetzlicheaufgabenQuittung.bindungsart, e.bindungsart);
  a.equal(d.zusaetzlicheaufgabenQuittung.person, e.person);
  a.equal(d.zusaetzlicheaufgabenQuittung.quelle.url, e.quelle.url);
  a.equal(d.zusaetzlicheaufgabenQuittung.quelle.sha256, e.quelle.sha256);
  a.equal(d.zusaetzlicheaufgabenQuittung.quelle.bytes, e.quelle.bytes);
  const rollenEintrag = rollenByKennung.get(d.kanonischeKennung);
  a.ok(rollenEintrag && rollenEintrag.status === "belegt", "Zusatzaufgabenachse setzt eine belegte 54er-Rolle voraus");
  a.equal(d.zusaetzlicheaufgabenQuittung.rollenquelle.url, rollenEintrag.quelle.url, "Rollenquelle muss die kanonische Person sein");
  a.equal(d.zusaetzlicheaufgabenQuittung.rollenquelle.sha256, rollenEintrag.quelle.sha256);
  // Kanonischer Bundestags-Profilname/Hash bleibt die Personenbindung.
  a.equal(d.quelle.url, rollenEintrag.quelle.url, "Quell-URL bleibt an die amtliche Personenquelle gebunden");
  const zusatzQuelle = (d.profil.offizielleQuellen || []).find((x) => x.art === "zusaetzliche-aufgaben-zustaendigkeit");
  a.ok(zusatzQuelle, "amtliche Zusatzquelle fehlt in profil.offizielleQuellen");
  a.equal(zusatzQuelle.sha256, e.quelle.sha256, "Zusatzquelle muss den Quellhash binden");
  // Existierende Rollen bleiben erhalten; der Hinweis steht genau einmal in funktionen.
  a.equal((d.profil.funktionen || []).filter((x) => x === hinweis).length, 1, "Herkunftshinweis genau einmal in funktionen");
  for (const f of rollenEintrag.funktionen) {
    a.ok((d.profil.funktionen || []).includes(f.wortlaut), `bestehende 54er-Rolle muss erhalten bleiben (${f.wortlaut})`);
  }
  // Keine ordentliche/stellvertretende Ausschussmitgliedschaft entsteht.
  for (const feld of ["ausschuesse", "stellvertretendeAusschuesse"]) {
    for (const wert of d.profil[feld] || []) {
      a.ok(!(e.abteilungen && Object.values(e.abteilungen).includes(wert)), `kein Scheinausschuss aus ${feld}: ${wert}`);
    }
  }
  // Echter Verlustfreiheitspfad (keine DB, kein Netz): Themen inkl. Kennzeichnung.
  const gespeichert = zuHelmutProfil(d.profil);
  a.deepEqual(gespeichert.focusTopics, e.themen, "Importpfad muss den Kurzthemenwortlaut erhalten");
  const zeile = storage.toMandateProfileRow(gespeichert);
  a.equal(zeile.aktiv, false, "Storage-Zeile darf nicht aktivieren");
  const gelesen = storage.fromMandateProfileRow({ id: d.kanonischeKennung, name: d.profil.vollname }, zeile);
  a.deepEqual(gelesen.focusTopics, e.themen, "Kurzthemen muessen verlustfrei erhalten bleiben");
  a.ok(gelesen.function.includes(hinweis), "Ableitungshinweis muss im gespeicherten function erhalten bleiben");
  const { proximityScore } = require("../lib/helmut/scoring");
  for (const thema of e.themen) {
    a.ok(proximityScore({ tags: [thema] }, { focusTopics: gelesen.focusTopics }) > 0,
      `Echter Themenabgleich muss nach Round-Trip greifen: ${thema}`);
  }
  for (const fremd of FREMDTHEMEN[d.kanonischeKennung] || []) {
    a.equal(proximityScore({ tags: [fremd] }, { focusTopics: gelesen.focusTopics }), 0,
      `Fremdthema darf nicht treffen: ${fremd}`);
  }
  a.equal(gelesen.profileActive, false, "Round-Trip bleibt aktiv=false");
}
// Breher: neue Funktionsrolle genau einmal, bestehende PSts-Rolle unveraendert erhalten.
const breher = datensaetze.find((d) => d.kanonischeKennung === "bundestag-breher-silvia-1043814");
a.equal((breher.profil.funktionen || []).filter((x) => x === "Beauftragte der Bundesregierung für Tierschutz").length, 1,
  "Breher: neue Funktionsrolle genau einmal");
a.ok((breher.profil.funktionen || []).includes("Parlamentarische Staatssekretärin für Landwirtschaft, Ernährung und Heimat"),
  "Breher: bestehende PSts-Rolle bleibt erhalten");
a.deepEqual(breher.profil.themen, ["Tierschutz"]);
const kippels = datensaetze.find((d) => d.kanonischeKennung === "bundestag-kippels-georg-1045390");
a.deepEqual(kippels.profil.themen, zusatzByKennung.get("bundestag-kippels-georg-1045390").themen);
a.equal(kippels.profil.themen.length, 12);
a.ok((kippels.profil.funktionen || []).includes("Parlamentarischer Staatssekretär für Gesundheit"), "Kippels: bestehende Rolle bleibt");
a.deepEqual(zusatzByKennung.get("bundestag-krichbaum-gunther-1048828").themen, ["Europa"]);
a.ok(!(kippels.profil.funktionen || []).some((x) => /Schenderlein/i.test(x)), "kein fremder Amtstraeger");

// ── 6i · BMWSB-Aufgabenachsen: Verlustfreier Round-Trip inkl. Kennzeichnung ──────────────
// Fuer die 2 persoenlich belegten BMWSB-Aufgabenachsen (Sören Bartol Z I 3/W II/S I/B I/B II,
// Sabine Poschmann Z II/W I/S II/S III): ausdrueckliche amtlich abgeleitete Kurzthemen aus
// den persoenlich zugewiesenen Unterbereichen, getrennter Herkunftshinweis; die bestehende
// 54er-Amtsrolle bleibt unveraendert erhalten. Nur die kanonische v10-Adresse des
// BMWSB-Organigramms ist gebunden (Original UND *.meta.json); der echte Pfad zuHelmutProfil ->
// toMandateProfileRow -> fromMandateProfileRow erhaelt die Themen UND den getrennten
// Ableitungshinweis und bleibt aktiv=false. KEIN Netz, KEINE DB, KEIN Modell.
a.equal(bmwsbProfil.reduce((n, d) => n + d.profil.themen.length, 0), 18, "18 ausdrueckliche BMWSB-Kurzthemen (12+6)");
const FREMDTHEMEN_BMWSB = {
  "bundestag-bartol-soeren-1043546": bmwsbByKennung.get("bundestag-poschmann-sabine-1046592").themen,
  "bundestag-poschmann-sabine-1046592": bmwsbByKennung.get("bundestag-bartol-soeren-1043546").themen,
};
for (const d of bmwsbProfil) {
  const e = bmwsbByKennung.get(d.kanonischeKennung);
  a.ok(e, `BMWSB-Aufgabenquittung fehlt fuer ${d.kanonischeKennung}`);
  const hinweis = `Aufgabenbindung ${e.region} (amtlich abgeleitet): ${e.aufgabenbindung}; keine persönliche politische Position`;
  a.deepEqual(d.profil.themen, e.themen, "genau der freigegebene Kurzthemenwortlaut");
  a.ok(!d.offeneFelder.includes("fachlicheAchse"), "BMWSB-Aufgabenachse schliesst die fachliche Achse");
  a.equal(d.profil.aktiv, false, "BMWSB-Profil bleibt aktiv=false");
  a.equal(d.importfreigegeben, false, "BMWSB-Profil bleibt importfreigegeben=false");
  a.equal(d.bmwsbQuittung.datei, "docs/betrieb/bmwsb-aufgaben-2-20260927.json");
  a.equal(d.bmwsbQuittung.region, e.region);
  a.equal(d.bmwsbQuittung.bindungsart, "unterabteilungszustaendigkeit");
  a.equal(d.bmwsbQuittung.person, e.person);
  a.equal(d.bmwsbQuittung.aufgabenbindung, e.aufgabenbindung);
  a.equal(d.bmwsbQuittung.stand, "1. Juli 2026");
  a.equal(d.bmwsbQuittung.seite, 1);
  a.deepEqual(d.bmwsbQuittung.unterabteilungen, e.unterabteilungen);
  a.equal(d.bmwsbQuittung.quelle.url, e.quelle.url);
  a.equal(d.bmwsbQuittung.quelle.sha256, e.quelle.sha256);
  a.equal(d.bmwsbQuittung.quelle.bytes, 669957, "kanonisches v10-PDF mit 669957 Bytes");
  a.equal(d.bmwsbQuittung.quelle.url.includes("v=10"), true, "nur die tatsaechlich verlinkte v10-Adresse");
  // Rollenquelle muss die kanonische Person der 54er Quittung sein (URL UND Hash).
  const rollenEintrag = rollenByKennung.get(d.kanonischeKennung);
  a.ok(rollenEintrag && rollenEintrag.status === "belegt", "BMWSB-Achse setzt eine belegte 54er-Rolle voraus");
  a.equal(d.bmwsbQuittung.rollenquelle.url, rollenEintrag.quelle.url, "Rollenquelle muss die kanonische Person sein");
  a.equal(d.bmwsbQuittung.rollenquelle.sha256, rollenEintrag.quelle.sha256);
  a.equal(d.quelle.url, rollenEintrag.quelle.url, "Quell-URL bleibt an die amtliche Personenquelle gebunden");
  // Nur die persoenlich zugewiesenen Unterbereiche, keine Hochstufung auf ganze Abteilungen.
  for (const schluessel of Object.keys(e.unterabteilungen)) {
    a.ok(!/^(Z|W|S|B)$/.test(schluessel), `keine blosse Abteilung statt Unterbereich: ${schluessel}`);
  }
  // Die bestehende 54er-Amtsrolle bleibt unveraendert erhalten; der Hinweis steht genau einmal.
  for (const f of rollenEintrag.funktionen) {
    a.ok((d.profil.funktionen || []).includes(f.wortlaut), `bestehende 54er-Rolle muss erhalten bleiben (${f.wortlaut})`);
  }
  a.equal((d.profil.funktionen || []).filter((x) => x === hinweis).length, 1, "Herkunftshinweis genau einmal in funktionen");
  // Keine ordentliche/stellvertretende Ausschussmitgliedschaft aus den Unterbereichen.
  for (const feld of ["ausschuesse", "stellvertretendeAusschuesse"]) {
    for (const wert of d.profil[feld] || []) {
      a.ok(!Object.values(e.unterabteilungen).includes(wert), `kein Scheinausschuss aus ${feld}: ${wert}`);
    }
  }
  const zusatzQuelle = (d.profil.offizielleQuellen || []).find((x) => x.art === "bmwsb-aufgaben-zustaendigkeit");
  a.ok(zusatzQuelle, "amtliche BMWSB-Quelle fehlt in profil.offizielleQuellen");
  a.equal(zusatzQuelle.url, e.quelle.url, "BMWSB-Zusatzquelle muss die kanonische URL binden");
  a.equal(zusatzQuelle.sha256, e.quelle.sha256, "BMWSB-Zusatzquelle muss den Quellhash binden");
  // Echter Verlustfreiheitspfad (keine DB, kein Netz): Themen inkl. Kennzeichnung.
  const gespeichert = zuHelmutProfil(d.profil);
  a.deepEqual(gespeichert.focusTopics, e.themen, "Importpfad muss den Kurzthemenwortlaut erhalten");
  const zeile = storage.toMandateProfileRow(gespeichert);
  a.equal(zeile.aktiv, false, "Storage-Zeile darf nicht aktivieren");
  const gelesen = storage.fromMandateProfileRow({ id: d.kanonischeKennung, name: d.profil.vollname }, zeile);
  a.deepEqual(gelesen.focusTopics, e.themen, "BMWSB-Kurzthemen muessen verlustfrei erhalten bleiben");
  a.ok(gelesen.function.includes(hinweis), "Ableitungshinweis muss im gespeicherten function erhalten bleiben");
  for (const f of rollenEintrag.funktionen) a.ok(gelesen.function.includes(f.wortlaut), "bestehende Rolle bleibt im Storage-Pfad");
  const { proximityScore } = require("../lib/helmut/scoring");
  for (const thema of e.themen) {
    a.ok(proximityScore({ tags: [thema] }, { focusTopics: gelesen.focusTopics }) > 0,
      `Echter Themenabgleich muss nach Round-Trip greifen: ${thema}`);
  }
  for (const fremd of FREMDTHEMEN_BMWSB[d.kanonischeKennung] || []) {
    a.equal(proximityScore({ tags: [fremd] }, { focusTopics: gelesen.focusTopics }), 0,
      `Fremdthema der anderen Person darf nicht treffen: ${fremd}`);
  }
  a.equal(gelesen.profileActive, false, "Round-Trip bleibt aktiv=false");
}
// Kanonische Personenbindung: kein vertauschtes Personenpaket, keine fremde Rolle.
const bartol = datensaetze.find((d) => d.kanonischeKennung === "bundestag-bartol-soeren-1043546");
const poschmann = datensaetze.find((d) => d.kanonischeKennung === "bundestag-poschmann-sabine-1046592");
a.deepEqual(bartol.profil.themen, bmwsbByKennung.get("bundestag-bartol-soeren-1043546").themen);
a.deepEqual(poschmann.profil.themen, bmwsbByKennung.get("bundestag-poschmann-sabine-1046592").themen);
a.notDeepEqual(bartol.profil.themen, poschmann.profil.themen, "die zwei Personenpakete duerfen nicht vertauscht sein");
a.equal(bartol.bmwsbQuittung.person, "Sören Bartol");
a.equal(poschmann.bmwsbQuittung.person, "Sabine Poschmann");
a.ok((bartol.profil.funktionen || []).includes("Parlamentarischer Staatssekretär für Wohnen, Stadtentwicklung und Bauwesen"),
  "Bartol: bestehende PSts-Rolle bleibt erhalten");
a.ok((poschmann.profil.funktionen || []).includes("Parlamentarische Staatssekretärin für Wohnen, Stadtentwicklung und Bauwesen"),
  "Poschmann: bestehende PSts-Rolle bleibt erhalten");
a.ok(!(poschmann.profil.funktionen || []).some((x) => /Z I 3|B I\b|B II\b/.test(x)), "Poschmann traegt keine Bartol-Unterbereiche");

// ── 6j · Amthor-Einzelfall: neue Rolle/Thema/Hinweis verlustfrei durch den echten Pfad ──
// Der zuvor einzeln offene Rollenfall Philipp Amthor wird gesondert neu gebunden: die
// aktuelle Funktionsrolle 'Staatsminister fuer Bund-Laender-Zusammenarbeit beim
// Bundeskanzler' (seit 29. Juli 2026) wird genau einmal an bestehende funktionen
// angehaengt, das eine amtlich abgeleitete Thema 'Bund-Laender-Beziehungen' gesetzt und der
// getrennte Herkunftshinweis erhalten. Der historische 54er-Eintrag bleibt offen (keine
// Rolllockerung); Partei, Mandatsart und Gremien bleiben unveraendert. Der echte Pfad
// zuHelmutProfil -> toMandateProfileRow -> fromMandateProfileRow erhaelt Rolle, Thema und
// Hinweis und bleibt aktiv=false. KEIN Netz, KEINE DB, KEIN Modell.
a.equal(amthorProfil.length, 1, "genau ein Profil traegt die Amthor-Einzelfallquittung");
const amthorDatensatz = amthorProfil[0];
const amthorEintrag = amthorByKennung.get("bundestag-amthor-philipp-1043428");
a.ok(amthorEintrag, "Amthor-Einzelfallquittung fehlt");
const AMTHOR_ROLLE = "Staatsminister für Bund-Länder-Zusammenarbeit beim Bundeskanzler";
const amthorHinweis = `Aufgabenbindung Bund (amtlich abgeleitet): ${amthorEintrag.aufgabenbindung}; keine persönliche politische Position`;
a.equal(amthorDatensatz.kanonischeKennung, "bundestag-amthor-philipp-1043428");
a.equal(amthorDatensatz.profil.partei, "CDU", "Partei bleibt unveraendert belegt");
a.equal(amthorDatensatz.profil.listenmandat, true, "Mandatsart bleibt unveraendert Listenmandat");
a.deepEqual(amthorDatensatz.profil.themen, ["Bund-Länder-Beziehungen"], "genau das freigegebene Thema");
a.ok(!amthorDatensatz.offeneFelder.includes("fachlicheAchse"), "Amthor-Einzelfall schliesst die fachliche Achse");
a.equal(amthorDatensatz.profil.aktiv, false, "Amthor bleibt aktiv=false");
a.equal(amthorDatensatz.importfreigegeben, false, "Amthor bleibt importfreigegeben=false");
a.equal(amthorDatensatz.amthorQuittung.datei, "docs/betrieb/amthor-aktuelles-amt-1-20260927.json");
a.equal(amthorDatensatz.amthorQuittung.person, "Philipp Amthor");
a.equal(amthorDatensatz.amthorQuittung.funktion, AMTHOR_ROLLE);
a.ok(AMTHOR_ROLLE.includes("beim Bundeskanzler"), "Rollenwortlaut beim Bundeskanzler eingeschlossen");
a.ok(!/digital/i.test(AMTHOR_ROLLE) && !/digital/i.test(amthorDatensatz.profil.themen.join(" ")),
  "kein Digitalamt als aktuell und kein Digitalthema");
a.equal(amthorDatensatz.amthorQuittung.amtsbeginn, "29. Juli 2026");
a.equal(amthorDatensatz.amthorQuittung.rolleZitat, "Seit 29. Juli 2026 Staatsminister für Bund-Länder-Zusammenarbeit beim Bundeskanzler");
a.ok(amthorDatensatz.amthorQuittung.vorherigeRolle.includes("2025 bis 2026")
  && amthorDatensatz.amthorQuittung.vorherigeRolle.includes("Digitales"),
  "das vorige PSts-Digitalamt bleibt ausdruecklich historisch");
// Die neue Rolle wurde genau einmal angehaengt; der Hinweis steht genau einmal in funktionen.
a.equal((amthorDatensatz.profil.funktionen || []).filter((x) => x === AMTHOR_ROLLE).length, 1,
  "Amthor: neue Funktionsrolle genau einmal");
a.equal((amthorDatensatz.profil.funktionen || []).filter((x) => x === amthorHinweis).length, 1,
  "Amthor: Herkunftshinweis genau einmal");
// Kanonische Person (54er Quittung) und beide Zusatzquellen sind gebunden.
const amthorRollenEintrag = rollenByKennung.get("bundestag-amthor-philipp-1043428");
a.equal(amthorDatensatz.amthorQuittung.rollenquelle.url, amthorRollenEintrag.quelle.url,
  "Rollenquelle ist die kanonische Bundestags-Person");
a.equal(amthorDatensatz.amthorQuittung.rollenquelle.sha256, amthorRollenEintrag.quelle.sha256);
a.equal(amthorDatensatz.quelle.url, amthorRollenEintrag.quelle.url, "Quell-URL bleibt an die amtliche Personenquelle gebunden");
a.equal(amthorDatensatz.amthorQuittung.quelle.url,
  "https://www.bundesregierung.de/breg-de/bundesregierung/bundeskanzleramt/philipp-amthor-2448320");
a.equal(amthorDatensatz.amthorQuittung.quelle.sha256, "75bcb78966c83ab6c23d725a08e2418f1fc384c6c9c1c7de594f5274d0faf91e");
a.equal(amthorDatensatz.amthorQuittung.quelle.bytes, 128940);
a.equal(amthorDatensatz.amthorQuittung.aufgabenquelle.url,
  "https://www.bundesregierung.de/breg-de/suche/merz-veraenderungen-im-kabinett--2448244");
a.equal(amthorDatensatz.amthorQuittung.aufgabenquelle.sha256, "be03d07df8b134c9d612f634c74cadaec7d5f754a8dd0b2ce67ac65bab2fa20c");
a.equal(amthorDatensatz.amthorQuittung.aufgabenquelle.bytes, 136311);
a.equal(amthorDatensatz.amthorQuittung.quellpublikationsdatum, "2026-07-24", "Ankuendigungsdatum, nicht Amtsantritt");
const amthorZusatzQuelle = (amthorDatensatz.profil.offizielleQuellen || []).find((x) => x.art === "kanzleramt-aufgabe");
a.ok(amthorZusatzQuelle, "amtliche Amthor-Zusatzquelle fehlt in profil.offizielleQuellen");
a.equal(amthorZusatzQuelle.sha256, "75bcb78966c83ab6c23d725a08e2418f1fc384c6c9c1c7de594f5274d0faf91e");
// Echter Verlustfreiheitspfad (keine DB, kein Netz): Rolle, Thema und Kennzeichnung.
const gespeichertAmthor = zuHelmutProfil(amthorDatensatz.profil);
a.deepEqual(gespeichertAmthor.focusTopics, ["Bund-Länder-Beziehungen"], "Importpfad muss das Thema erhalten");
a.ok(gespeichertAmthor.function.includes(AMTHOR_ROLLE), "neue Rolle muss den Importpfad erreichen");
a.ok(gespeichertAmthor.function.includes(amthorHinweis), "Herkunftshinweis muss den Importpfad erreichen");
const zeileAmthor = storage.toMandateProfileRow(gespeichertAmthor);
a.equal(zeileAmthor.aktiv, false, "Storage-Zeile darf nicht aktivieren");
const gelesenAmthor = storage.fromMandateProfileRow({ id: amthorDatensatz.kanonischeKennung, name: amthorDatensatz.profil.vollname }, zeileAmthor);
a.deepEqual(gelesenAmthor.focusTopics, ["Bund-Länder-Beziehungen"], "Thema uebersteht den Storage-Roundtrip");
a.ok(gelesenAmthor.function.includes(AMTHOR_ROLLE), "Rolle uebersteht den Storage-Roundtrip");
a.ok(gelesenAmthor.function.includes(amthorHinweis), "Hinweis uebersteht den Storage-Roundtrip");
{
  const { proximityScore } = require("../lib/helmut/scoring");
  a.ok(proximityScore({ tags: ["Bund-Länder-Beziehungen"] }, { focusTopics: gelesenAmthor.focusTopics }) > 0,
    "exaktes Thema Bund-Laender-Beziehungen muss treffen");
  a.equal(proximityScore({ tags: ["Digitalisierung"] }, { focusTopics: gelesenAmthor.focusTopics }), 0,
    "fremdes Thema Digitalisierung darf nicht treffen");
}
a.equal(gelesenAmthor.profileActive, false, "Round-Trip bleibt aktiv=false");

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

console.log("PASS: 500 Feldbelege, 330/120/50, Hashbindung, AfD-Sperre, offene Felder, echter Importvertrag (478 technisch importierbar, 22 offen), Gremien-Trennung (141 Mitgliedschaften in 15 sonstigen Gremien rollengetreu erhalten, 4 Scheinausschussachsen offen), Mandatsartenquittung Brandenburg (4 Landeslisten) und Berlin (2 Profile: Martin Bezirksliste Marzahn-Hellersdorf, Lux Landesliste; Handbuch-PDF Seite 204 linke Spalte, wörtliche Transkription, exakter H2/H3/Personlink, echter Import-/Storage-Roundtrip, Engelmann bleibt offen), Rollenquittung (48 Amtsrollen dedupliziert angehaengt, 6 offen), Ressortquittung (19 Fachachsen ueber amtliches Ressort geschlossen: 9 Bund/4 Berlin/6 Brandenburg, 39 Themenbegriffe und Herkunftshinweise verlustfrei), Aufgabenquittung (6 personengebundene Aufgabenachsen: Beauftragtenaufgaben + BMAS-Abteilungen, 14 Themenbegriffe und Herkunftshinweise verlustfrei, 14 exakte Themengegenproben, Mast disjunkt zu Griese), Beratende Achsenquittung (2 beratende Ausschussachsen: Knodel Landwirtschaft/Ernaehrung/Heimat + Seidler Haushalt, 4 Kurzthemen und getrennte Ableitungshinweise verlustfrei, bestehende beratende Funktion erhalten, keine ordentliche/stellvertretende Mitgliedschaft, keine endDate-Rolle), Zusatzaufgabenquittung (3 Fachzustaendigkeiten: Breher Tierschutz mit genau einer neuen Funktionsrolle + erhaltener PSts-Rolle, Krichbaum Europa aus der aktuellen AA-Seitenkopf-H1, Kippels BMG-Abteilungen 1/4/5/6 mit 12 Kurzthemen aus visuell abgenommenem PDF-Fachurteil; 14 Kurzthemen und getrennte Herkunftshinweise verlustfrei, Fremdthemen ohne Treffer), BMWSB-Aufgabenquittung (2 personengebundene BMWSB-Unterbereichsachsen: Bartol Z I 3/W II/S I/B I/B II, Poschmann Z II/W I/S II/S III; 18 Kurzthemen und getrennte Herkunftshinweise verlustfrei, kanonische v10-Adresse 669957 Bytes, bestehende PSts-Rolle erhalten, keine Hochstufung auf ganze Abteilungen, keine Scheinausschuesse, Fremdthemen der anderen Person ohne Treffer), Amthor-Einzelfallquittung (1 zuvor offener Rollenfall: aktuelle Rolle Staatsminister fuer Bund-Laender-Zusammenarbeit beim Bundeskanzler seit 29. Juli 2026 aus geschlossenem bpa-richtext-Lebenslauf, Thema Bund-Laender-Beziehungen aus genau einem echten li der Personalien-h2, historischer 54er-Eintrag bleibt offen, kein Digitalamt als aktuell, Fremdthema Digitalisierung ohne Treffer; 21 Fachachsen bleiben offen), Bundestags-Readiness (312/330 bereit), Reproduzierbarkeit: " + reproduzierbar);
