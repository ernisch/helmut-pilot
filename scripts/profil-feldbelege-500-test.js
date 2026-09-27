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
// Genau 3 Berliner Landtagsmandate bleiben mangels belegter Angabe offen. Die vier
// Brandenburg-Mandate sind ueber die versionierte Mandatsartenquittung als
// Landesliste belegt (nur Mandatsart + Region, kein Listenplatz, keine Partei).
const mandatsartOffen = datensaetze.filter((d) => d.offeneFelder.includes("mandatsart"));
a.equal(mandatsartOffen.length, 3, "3 Berliner Mandatsarten bleiben ehrlich offen");
a.ok(mandatsartOffen.every((d) => d.parlament === "landtag-berlin"), "nur Berlin bleibt offen");

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
// "schwerpunkt-fehlt". Vier Bundestagsprofile verlieren mit der Gremien-Trennung
// eine Scheinausschussachse (Wahlausschuss ist kein staendiger Ausschuss) und
// werden daher ehrlich wieder offen (50 -> 54). Vier Brandenburg-Mandate sind
// ueber die Mandatsartenquittung belegt (7 -> 3 region-fehlt).
a.deepEqual(fehlercodes, { "schwerpunkt-fehlt": 54, "region-fehlt": 3 }, "offene Felder muessen genau die bekannten Luecken sein");
a.equal(ergebnis.gueltig, 443, "443 Profile sind ohne offene Achse/Mandatsart technisch importierbar");

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
a.equal(btAchseOffen.length, 41, "37 + 4 Bundestagsprofile ohne belegte fachliche Achse");
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
a.equal(btBereit, 289, "289 von 330 Bundestagsprofilen sind bereit (vorher 179)");
a.equal(btNichtBereit, 41, "41 Bundestagsprofile bleiben nicht bereit");
a.deepEqual(
  btReadinessGruende,
  { "fehlend:schwerpunkt_oder_ausschuss": 41, "widerspruch:party/faction": 1 },
  "nur offene fachliche Achse und ein bestehender Partei/Fraktions-Widerspruch",
);

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

console.log("PASS: 500 Feldbelege, 330/120/50, Hashbindung, AfD-Sperre, offene Felder, echter Importvertrag (443 technisch importierbar, 57 offen), Gremien-Trennung (141 Mitgliedschaften in 15 sonstigen Gremien rollengetreu erhalten, 4 Scheinausschussachsen offen), Mandatsartenquittung (4 Brandenburg-Landeslisten), Bundestags-Readiness (289/330 bereit), Reproduzierbarkeit: " + reproduzierbar);
