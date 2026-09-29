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
const parteifeldSchluss = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "betrieb", "500-parteifeld-schluss-20260928.json"), "utf8"));
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

// Die ausdrueckliche Auswahlentscheidung vom 29.09.2026 betrifft genau vier Faelle:
// kein gleichgruppiger Ersatz im vorab bestimmten Pool, aber ein zulaessiger Ersatz
// derselben Parlamentsebene. Sie darf niemals eine Import- oder Aktivierungsfreigabe sein.
const viererAusnahme = [
  ["knodel_sieghard-1045460", "schulze_svenja-1047308", "bundestag"],
  ["antonin-brousek-1", "tobias-schulze", "landtag-berlin"],
  ["40624", "40631", "landtag-brandenburg"],
  ["40627", "40599", "landtag-brandenburg"],
];
a.equal(parteifeldSchluss.bilanz.abnahme.status, "auswahlentscheidung-bestaetigt", "Vierer-Ausnahme braucht die ausdrueckliche Auswahlentscheidung");
a.equal(parteifeldSchluss.bilanz.aktiv, 0, "Schlussquittung darf nicht aktivieren");
a.equal(parteifeldSchluss.bilanz.importfreigegeben, 0, "Schlussquittung darf nicht importfreigeben");
a.deepEqual(parteifeldSchluss.bilanz.abnahme.gruppenwechselNachParlamentsebene,
  viererAusnahme.map(([alt, neu]) => `${alt} -> ${neu}`), "genau vier dokumentierte Ebenenersatzpaare");
for (const [alt, neu, parlament] of viererAusnahme) {
  a.ok(!datensaetze.some((d) => d.amtlicheKennung === alt), `entferntes Ausnahmeprofil darf nicht verbleiben (${alt})`);
  const ersatz = datensaetze.find((d) => d.amtlicheKennung === neu);
  a.ok(ersatz, `Ebenenersatz fehlt (${neu})`);
  a.equal(ersatz.parlament, parlament, `Ebenenersatz bleibt im selben Parlament (${neu})`);
  a.equal(ersatz.aktiv, false, `Ebenenersatz bleibt inaktiv (${neu})`);
  a.equal(ersatz.importfreigegeben, false, `Ebenenersatz bleibt nicht importfreigegeben (${neu})`);
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
const ersetztAlt = [
  "droege_katharina-1044100", "englhardt_kopf_martina-1044208", "frei_thorsten-1044370",
  "gueler_serap-1044642", "hahn_florian-1044694", "hauer_matthias-1044780",
  "hirte_christian-1045006", "lange_ulrich-1048862", "launert_silke-1045740",
  "ludwig_daniela-1045886", "kofler_baerbel-1045482", "claudia-engelmann",
];
const ersetztNeu = [
  "paus_lisa-1046498", "rachel_thomas-1046652", "radomski_kerstin-1046660",
  "radwan_alexander-1049086", "reddig_pascal-1046704", "rehbaum_henning-1049104",
  "reichel_markus-1046714", "roettgen_norbert-1049138", "rohwer_lars-1046822",
  "rothenberger_johannes-1049136", "ruetzel_bernd-1046916", "steffen-zillich",
];
a.ok(ersetztAlt.every((k) => !datensaetze.some((d) => d.amtlicheKennung === k)), "ersetzte Altprofile duerfen nicht mehr vorkommen");
a.ok(ersetztNeu.every((k) => datensaetze.some((d) => d.amtlicheKennung === k)), "alle zwoelf belegten Ersatzprofile muessen vorkommen");

// ── 4 · Partei-/Fraktionsregeln und gepruefte Ergaenzungsquittungen ───────────────────────
// Die allgemeine Quittung fuehrt die geprueften Parteifelder, aktuell 332 Eintraege
// (328 belegt, 4 reine Auditzeilen offen). Uebernommen wird nur status belegt/parteilos;
// offen bleibt offen. Drei zuvor offene Bundestagsfaelle (Otte, Gohlke, Valent) schliesst
// eine eigene enge Zusatzquittung; Boris Pistorius schliesst seine getrennte SPD-Quelle.
const ergaenzung = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "betrieb", "parteifeldpruefung-335-20260927.json"), "utf8"));
a.equal(ergaenzung.umfang, 332, "Quittung muss 332 geprüfte Parteifelder umfassen");
a.equal(ergaenzung.ergebnisse.length, 332, "Quittung muss 332 Ergebnisse tragen");
const ergByKennung = new Map(ergaenzung.ergebnisse.map((e) => [e.kennung, e]));
a.equal(ergByKennung.size, 332, "Quittungskennungen muessen eindeutig sein");
a.equal(ergaenzung.ergebnisse.filter((e) => e.status === "belegt").length, 328, "328 belegte Parteibelege");
a.equal(ergaenzung.ergebnisse.filter((e) => e.status === "offen").length, 4, "4 Auditzeilen bleiben offen");
for (const e of ergaenzung.ergebnisse) {
  if (e.status !== "offen") continue;
  a.equal(e.partei, null, "offene Quittung darf keinen Parteiwert tragen");
}

// Enge, getrennte Zusatzquittung fuer GENAU einen zuvor offenen Bundestags-Parteibeleg
// (Boris Pistorius). Die 335er Quittung bleibt byteidentisch und Pistorius darin offen;
// die Partei stammt aus dem aktuell gelisteten SPD-Parteivorstand, nicht aus der Fraktion.
const pistoriusBeleg = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "betrieb", "pistorius-partei-1-20260928.json"), "utf8"));
a.equal(pistoriusBeleg.umfang, 1, "Pistorius-Zusatzquittung muss genau 1 Fall umfassen");
a.equal(pistoriusBeleg.bilanz.gesamt, 1, "Pistorius-Zusatzquittung: gesamt 1");
a.equal(pistoriusBeleg.ergebnisse.length, 1, "Pistorius-Zusatzquittung muss 1 Ergebnis tragen");
const pistoriusKennung = "bundestag-pistorius-boris-1046550";
const pistoriusQuittung = new Map(pistoriusBeleg.ergebnisse.map((e) => [e.kennung, e]));
a.equal(pistoriusQuittung.size, 1, "Pistorius-Zusatzquittungskennung muss eindeutig sein");
const pistoriusEintrag = pistoriusQuittung.get(pistoriusKennung);
a.ok(pistoriusEintrag, "Pistorius-Eintrag fehlt in der Zusatzquittung");
a.equal(pistoriusEintrag.partei, "SPD", "Pistorius-Partei muss SPD sein");
a.equal(pistoriusEintrag.abschnittH2, "Weitere Mitglieder im SPD-Parteivorstand", "gebundene H2");
a.equal(pistoriusEintrag.abschnittId, "m236604", "gebundener Abschnitt");
a.equal(pistoriusEintrag.liName, "Boris Pistorius", "gebundener exakter li-Name");
a.equal(pistoriusEintrag.importfreigegeben, false, "Pistorius-Beleg darf nicht importfreigeben");
a.equal(pistoriusEintrag.quelle.url, "https://www.spd.de/ueber-uns", "getrennte offizielle Partei-Quelle");
a.equal(pistoriusEintrag.quelle.sha256, "535e62d64e01152270b4a3687fd8cd56c8feb4c561150d6821b6ea97493670c8", "SPD-Quellhash");

// Enge, getrennte Zusatzquittung fuer GENAU drei zuvor offene Bundestags-Parteibelege
// (Karoline Otte, Nicole Gohlke, Aaron Valent). Die drei bleiben in der allgemeinen
// Quittung ausdruecklich offen; jeder Wert stammt aus einer getrennten aktuellen
// offiziellen Partei-Seite und bleibt zusaetzlich an die kanonische Bundestagsquelle
// (URL, sha256, Bytezahl, Datei) gebunden. Der Validator
// (scripts/profil-feldbelege-500-parteizusatz.py) arbeitet fail-closed.
// KEINE Importfreigabe, KEINE Fraktionsableitung.
const parteizusatz = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "betrieb", "parteifelder-zusatz-3-20260928.json"), "utf8"));
a.equal(parteizusatz.vertragsformat, "helmut-parteizusatz/1", "Zusatzquittungsformat");
a.equal(parteizusatz.version, 1, "Zusatzquittungsversion");
a.equal(parteizusatz.umfang, 3, "Zusatzquittung muss genau 3 Faelle umfassen");
a.deepEqual(parteizusatz.bilanz, { gesamt: 3, Bund: 3, Berlin: 0, Brandenburg: 0 }, "Zusatzquittungsbilanz");
a.equal(parteizusatz.ergebnisse.length, 3, "Zusatzquittung muss 3 Ergebnisse tragen");
const parteizusatzByKennung = new Map(parteizusatz.ergebnisse.map((e) => [e.kennung, e]));
a.equal(parteizusatzByKennung.size, 3, "Zusatzquittungskennungen muessen eindeutig sein");
const PARTEIZUSATZ_ERWARTET = {
  "bundestag-otte-karoline-1046442": {
    person: "Karoline Otte", partei: "Bündnis 90/Die Grünen", bindung: "gruene-parteirat",
    profilUrl: "https://www.bundestag.de/abgeordnete/biografien/O/otte_karoline-1046442",
    profilSha256: "14d5ff2fd186946d6209c6e900fa7b4516ad518e79b3f94298ebb446eb4ea1bb", profilBytes: 276706,
    profilDatei: "bundestag-otte_karoline-1046442.html",
    quelleUrl: "https://gruene-niedersachsen.de/partei/parteirat/",
    quelleSha256: "e2ab40d352447107b3863ff32390bb8654f243d59fa88ee03b3e0b8c759be2fc", quelleBytes: 88694,
    quelleDatei: "gruene-nds-parteirat-20260928.html",
  },
  "bundestag-gohlke-nicole-1044540": {
    person: "Nicole Gohlke", partei: "Die Linke", bindung: "linke-landesgruppe",
    profilUrl: "https://www.bundestag.de/abgeordnete/biografien/G/gohlke_nicole-1044540",
    profilSha256: "fea0545ebb917a78b8e8ead376de23f78af903193b9068467aac91330725fa88", profilBytes: 277409,
    profilDatei: "bundestag-gohlke_nicole-1044540.html",
    quelleUrl: "https://www.die-linke-bayern.de/parlamente/bundestag/kategorie/nicole-gohlke-mdb/oder/",
    quelleSha256: "893edd59188b7e130b2fd8895f4ff6741a99b71bd401140124a710499942df67", quelleBytes: 111617,
    quelleDatei: "linke-bayern-bundestag-20260928.html",
  },
  "bundestag-valent-aaron-1047844": {
    person: "Aaron Valent", partei: "Die Linke", bindung: "linke-landesgruppe",
    profilUrl: "https://www.bundestag.de/abgeordnete/biografien/V/valent_aaron-1047844",
    profilSha256: "ccf67ae6be0c9fc9368c235b7ab9f21b571bf6e53ad87cbb3481f5c66e8ae0eb", profilBytes: 277657,
    profilDatei: "bundestag-valent_aaron-1047844.html",
    quelleUrl: "https://www.die-linke-bayern.de/parlamente/bundestag/kategorie/nicole-gohlke-mdb/oder/",
    quelleSha256: "893edd59188b7e130b2fd8895f4ff6741a99b71bd401140124a710499942df67", quelleBytes: 111617,
    quelleDatei: "linke-bayern-bundestag-20260928.html",
  },
};
a.deepEqual(parteizusatz.ergebnisse.map((e) => e.kennung).sort(), Object.keys(PARTEIZUSATZ_ERWARTET).sort(),
  "genau Otte/Gohlke/Valent in der Zusatzquittung");
for (const [kennung, erwartet] of Object.entries(PARTEIZUSATZ_ERWARTET)) {
  const e = parteizusatzByKennung.get(kennung);
  a.ok(e, `Zusatzquittungseintrag fehlt (${kennung})`);
  a.equal(e.status, "belegt", `Zusatzbeleg muss belegt sein (${kennung})`);
  a.equal(e.person, erwartet.person, `Person (${kennung})`);
  a.equal(e.partei, erwartet.partei, `Partei (${kennung})`);
  a.equal(e.bindung, erwartet.bindung, `Bindungsart (${kennung})`);
  a.equal(e.region, "Bund", `Region (${kennung})`);
  a.equal(e.parlament, "bundestag", `Parlament (${kennung})`);
  a.equal(e.importfreigegeben, false, `Zusatzbeleg darf nicht importfreigeben (${kennung})`);
  // Kanonische Profilquelle bleibt bytegenau gebunden.
  a.deepEqual(e.profilQuelle, {
    url: erwartet.profilUrl, sha256: erwartet.profilSha256, bytes: erwartet.profilBytes, datei: erwartet.profilDatei,
  }, `kanonische Profilquelle (${kennung})`);
  // Getrennte offizielle Partei-Quelle, nicht aus der Fraktion abgeleitet.
  a.equal(e.quelle.url, erwartet.quelleUrl, `getrennte Partei-Quelle URL (${kennung})`);
  a.equal(e.quelle.finalUrl, erwartet.quelleUrl, `getrennte Partei-Quelle finalUrl (${kennung})`);
  a.equal(e.quelle.datei, erwartet.quelleDatei, `getrennte Partei-Quelle Datei (${kennung})`);
  a.equal(e.quelle.sha256, erwartet.quelleSha256, `getrennte Partei-Quelle Hash (${kennung})`);
  a.equal(e.quelle.bytes, erwartet.quelleBytes, `getrennte Partei-Quelle Bytezahl (${kennung})`);
  a.equal(e.quelle.http, 200, `getrennte Partei-Quelle HTTP-Status (${kennung})`);
  a.equal(e.quelle.abrufStatus, "abgerufen", `getrennte Partei-Quelle Abrufstatus (${kennung})`);
  // Die allgemeine Quittung bleibt fuer genau dieselben drei ausdruecklich offen.
  a.equal(ergByKennung.get(kennung).status, "offen", `allgemeine Quittung bleibt offen (${kennung})`);
  a.equal(ergByKennung.get(kennung).partei, null, `kein Parteiwert in der allgemeinen Quittung (${kennung})`);
}

const parteiStatus = { belegt: 0, offen: 0, parteilos: 0 };
for (const d of datensaetze) {
  const e = ergByKennung.get(d.kanonischeKennung);
  a.notEqual(d.profil.bundesland, undefined, "Jedes Profil braucht ein Bundesland");
  a.ok(["belegt", "offen", "parteilos"].includes(d.parteiStatus), `unbekannter Parteistatus ${d.parteiStatus}`);
  if (d.parteiStatus === "belegt") {
    a.ok(d.profil.partei, "belegter Parteistatus braucht einen Parteiwert");
    a.ok(d.feldbelege.partei && d.feldbelege.partei.length > 0, "Parteiherkunft muss belegt sein");
    const pq = pistoriusQuittung.get(d.kanonischeKennung);
    const pz = parteizusatzByKennung.get(d.kanonischeKennung);
    if (pq) {
      // Nur der eine kanonische Fall: die allgemeine Quittung bleibt offen, der Parteiwert
      // stammt aus der getrennten offiziellen SPD-Zusatzquittung.
      a.equal(e.status, "offen", "die allgemeine Quittung bleibt fuer Pistorius offen");
      a.equal(d.profil.partei, pq.partei, "Pistorius-Partei muss der Zusatzquittung entsprechen");
      a.deepEqual(d.parteiBeleg.quelle, { datei: "docs/betrieb/pistorius-partei-1-20260928.json", url: pq.quelle.url, sha256: pq.quelle.sha256 });
      a.equal(d.parteiQuittung.datei, "docs/betrieb/pistorius-partei-1-20260928.json", "Zusatzquittungsdatei gebunden");
      a.equal(d.parteiQuittung.abschnittId, "m236604", "Abschnitt im Datensatz gebunden");
      a.equal(d.parteiQuittung.liName, "Boris Pistorius", "li-Name im Datensatz gebunden");
      a.ok(d.feldbelege.parteiQuelle.includes("pistorius-partei-1-20260928.json"), "ParteiQuelle nennt die Zusatzquittung");
    } else if (pz) {
      // Die allgemeine Quittung bleibt offen; der Parteiwert stammt aus der getrennten
      // offiziellen Zusatzquelle (Otte/Gohlke/Valent) und bleibt an die kanonische
      // Bundestags-Profilquelle gebunden.
      a.equal(e.status, "offen", "die allgemeine Quittung bleibt fuer den Zusatzfall offen");
      a.equal(pz.status, "belegt");
      a.equal(d.profil.partei, pz.partei, "Partei muss der Zusatzquittung entsprechen");
      a.deepEqual(d.parteiZusatzQuittung,
        { ...pz, datei: "docs/betrieb/parteifelder-zusatz-3-20260928.json" },
        "Datensatz muss die Zusatzquittung tragen");
      a.equal(d.parteiZusatzQuittung.profilQuelle.url, d.quelle.url, "kanonische Profilquelle gebunden");
      a.equal(d.parteiZusatzQuittung.profilQuelle.sha256, d.quelle.sha256, "kanonischer Profilhash gebunden");
      a.deepEqual(d.parteiBeleg.quelle, {
        datei: "docs/betrieb/parteifelder-zusatz-3-20260928.json", url: pz.quelle.url, sha256: pz.quelle.sha256,
      }, "Parteibeleg bindet die getrennte Partei-Quelle");
      const pzQuelle = (d.profil.offizielleQuellen || []).find((q) => q.art === "partei-profil");
      a.ok(pzQuelle, "getrennte offizielle Partei-Quelle fehlt in profil.offizielleQuellen");
      a.equal(pzQuelle.url, pz.quelle.url, "Partei-Quelle bindet die offizielle URL");
      a.equal(pzQuelle.sha256, pz.quelle.sha256, "Partei-Quelle bindet den Quellhash");
      a.ok(d.feldbelege.parteiQuelle.includes("parteifelder-zusatz-3-20260928.json"), "ParteiQuelle nennt die Zusatzquittung");
    } else if (e) {
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
a.equal(parteiStatus.offen, 0, "keine Partei bleibt offen");
a.equal(parteiStatus.belegt, 498, "498 belegte Parteien (inkl. Pistorius und der drei Zusatzbelege Otte/Gohlke/Valent)");
a.equal(parteiStatus.parteilos, 2, "zwei amtlich belegte parteilose Profile");
a.equal(datensaetze.filter((d) => d.parteiQuittung).length, 1, "genau 1 Profil traegt die Pistorius-Zusatzquittung");
a.equal(datensaetze.find((d) => d.parteiQuittung).kanonischeKennung, pistoriusKennung, "nur Pistorius traegt die Pistorius-Zusatzquittung");
a.equal(datensaetze.filter((d) => d.parteiZusatzQuittung).length, 3, "genau 3 Profile tragen die Partei-Zusatzquittung");
a.deepEqual(
  datensaetze.filter((d) => d.parteiZusatzQuittung).map((d) => d.kanonischeKennung).sort(),
  Object.keys(PARTEIZUSATZ_ERWARTET).sort(),
  "nur Otte/Gohlke/Valent tragen die getrennte Partei-Zusatzquittung",
);

// Brandenburg kommt aus der Parteipruefung, ergaenzt um die Quittung: 48 belegt, 2 parteilos.
const bb = datensaetze.filter((d) => d.parlament === "landtag-brandenburg");
const bbStatus = {};
for (const d of bb) bbStatus[d.parteiStatus] = (bbStatus[d.parteiStatus] || 0) + 1;
a.deepEqual(bbStatus, { belegt: 48, parteilos: 2 }, "Brandenburg: 48 geklaert / 2 parteilos");

// ── 4b · Pistorius: getrennte Partei-Quelle, Unveraendertheit, Import/Storage ─────────────
// Nur die Partei des einen kanonischen Falls aendert sich; Fraktion, Funktionen, Themen,
// Mandat und die kanonische Bundestagsquelle bleiben unveraendert. Der echte Import-/
// Storage-Pfad traegt SPD und aktiviert nie; eine fremde Partei wird gesperrt.
const pistoriusDatensatz = datensaetze.find((d) => d.kanonischeKennung === pistoriusKennung);
a.ok(pistoriusDatensatz, "Pistorius-Datensatz fehlt");
a.equal(pistoriusDatensatz.parteiStatus, "belegt", "Pistorius ist belegt");
a.equal(pistoriusDatensatz.profil.partei, "SPD", "Pistorius-Partei ist SPD");
a.equal(pistoriusDatensatz.profil.fraktion, "SPD", "Pistorius-Fraktion bleibt SPD");
a.deepEqual(pistoriusDatensatz.profil.themen, ["Verteidigung"], "Pistorius-Themen unveraendert");
a.deepEqual(pistoriusDatensatz.profil.funktionen, ["Bundesminister der Verteidigung", "Ressortzuständigkeit Bund (amtlich abgeleitet): Verteidigung; keine persönliche politische Position"], "Pistorius-Funktionen unveraendert");
a.ok(!pistoriusDatensatz.offeneFelder.includes("partei"), "Parteifeld ist geschlossen");
a.equal(pistoriusDatensatz.offeneFelder.length, 0, "Pistorius ist ohne offenes Feld");
a.equal(pistoriusDatensatz.quelle.url, "https://www.bundestag.de/abgeordnete/biografien/P/pistorius_boris-1046550", "kanonische Bundestagsquelle unveraendert");
const parteiQuelle = (pistoriusDatensatz.profil.offizielleQuellen || []).find((q) => q.art === "partei-profil");
a.ok(parteiQuelle, "getrennte offizielle Partei-Quelle fehlt");
a.equal(parteiQuelle.url, "https://www.spd.de/ueber-uns", "Partei-Quelle ist der SPD-Parteivorstand");
a.equal(parteiQuelle.sha256, pistoriusEintrag.quelle.sha256, "Partei-Quelle bindet den SPD-Quellhash");
{
  const importPistorius = require("../lib/helmut/profil-import.js");
  const storagePistorius = require("../lib/helmut/storage.js");
  const gespeichert = importPistorius.zuHelmutProfil(pistoriusDatensatz.profil);
  a.equal(gespeichert.party, "SPD", "Partei erreicht den Importpfad");
  a.equal(gespeichert.faction, "SPD", "Fraktion erreicht den Importpfad");
  a.equal(gespeichert.profileActive, false, "Import aktiviert nie");
  const zeile = storagePistorius.toMandateProfileRow(gespeichert);
  a.equal(zeile.partei, "SPD", "Party erreicht die Storage-Zeile");
  a.equal(zeile.fraktion, "SPD", "Fraktion erreicht die Storage-Zeile");
  a.equal(zeile.aktiv, false, "Storage-Zeile darf nicht aktivieren");
  const gelesen = storagePistorius.fromMandateProfileRow({ id: pistoriusKennung, name: pistoriusDatensatz.profil.vollname }, zeile);
  a.equal(gelesen.party, "SPD", "Partei uebersteht den Storage-Roundtrip");
  a.equal(gelesen.faction, "SPD", "Fraktion uebersteht den Storage-Roundtrip");
  a.equal(gelesen.profileActive, false, "Round-Trip bleibt aktiv=false");
  // Negative Fremdpartei-Probe: eine fremde Partei (AfD) wird vor jedem Import gesperrt.
  const fremd = { ...pistoriusDatensatz.profil, partei: "AfD" };
  a.throws(() => importPistorius.zuHelmutProfil(fremd), /AfD|ausgeschlossen|zulassung|Zielgruppe/i,
    "fremde Partei muss vor dem Import gesperrt werden");
}

// ── 5 · Mandatsachse: Wahlkreiskandidatur ist kein Direktmandat ───────────────────────────
const btDirekt = datensaetze.filter((d) => d.parlament === "bundestag" && d.profil.wahlkreis).length;
const btListe = datensaetze.filter((d) => d.parlament === "bundestag" && d.profil.listenmandat).length;
a.equal(btDirekt, 162, "162 Bundestags-Wahlkreismandate");
a.equal(btListe, 168, "168 Bundestags-Listenmandate");
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
// Der letzte offene Berliner Mandatsfall Claudia Engelmann wurde gleichgruppig
// durch Steffen Zillich ersetzt; dessen Landesliste steht direkt im amtlichen
// Profilkopf. Die historischen Zusatzquittungen bleiben eng begrenzt.
const mandatsartOffen = datensaetze.filter((d) => d.offeneFelder.includes("mandatsart"));
a.equal(mandatsartOffen.length, 0, "keine Mandatsart bleibt offen");
const zillich = datensaetze.find((d) => d.amtlicheKennung === "steffen-zillich");
a.ok(zillich && zillich.profil.listenmandat === true, "Zillichs amtlich belegte Landesliste fehlt");
a.equal(zillich.profil.regionHinweis, "Berlin — Landesliste");

// 5a · Belegte Mandatsart Brandenburg: nur Landesliste + Region, kein Listenplatz.
const ausQuittung = datensaetze.filter((d) => d.mandatsartQuittung);
a.equal(ausQuittung.length, 2, "zwei Brandenburg-Mandate stammen aus der Mandatsartenquittung");
a.deepEqual(
  ausQuittung.map((d) => d.amtlicheKennung).sort(),
  ["40629", "40630"],
  "genau die zwei belegten Brandenburg-Kennungen",
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
  "genau Martin und Lux stammen weiterhin aus der engen Zusatzquittung",
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
a.ok(!datensaetze.some((d) => d.amtlicheKennung === "claudia-engelmann"), "Engelmann wurde gleichgruppig ersetzt");

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
// geprueften Ressort- (19), Aufgaben- (6), beratenden (1), Zusatzaufgaben- (3),
// BMWSB-Aufgaben- (2), die Amthor-Einzelfallquittung (1) und die
// Wahlausschuss-Aufgabenquittung (3) sowie die Jarzombek-Abteilungsquittung (1)
// und die Rohde-, Merz-, Woidke- und Wegner-Einzelfallquittungen (je 1)
// erhalten 40 zuvor offene Profile amtlich abgeleitete Themen; die
// Stellvertretungsquittung schliesst eine weitere zuvor offene Achse ueber eine
// belegte stellvertretende Ausschussmitgliedschaft, ohne Themen zu setzen; die
// Achse schliesst sich ehrlich. Zwei Brandenburg- und zwei Berliner Mandate sind
// ueber die Mandatsartenquittungen belegt (region-fehlt geschlossen).
a.deepEqual(fehlercodes, {}, "keine technische Achsen-/Mandatsluecke darf verbleiben");
a.equal(ergebnis.gueltig, 500, "alle 500 Profile sind ohne offene Achse/Mandatsart technisch importierbar");

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
a.equal(mitWeiterenGremien.length, 120, "120 Bundestagsprofile tragen belegte sonstige Gremien");
a.equal(mitWeiterenGremien.every((d) => d.parlament === "bundestag"), true, "nur Bundestagsprofile betroffen");
a.equal(
  datensaetze.reduce((summe, d) => summe + (d.weitereGremienBeleg || []).length, 0),
  148,
  "148 belegte Mitgliedschaften in sonstigen Gremien",
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
// Unveraendert: die 25 Landtags-Gremien aus der vorhandenen Extraktion bleiben wie sie waren.
const landtagWeitere = datensaetze.filter((d) => d.parlament !== "bundestag" && (d.weitereGremien || []).length > 0);
a.equal(landtagWeitere.length, 25, "Landtags-Gremien bleiben unveraendert erhalten");
a.equal(landtagWeitere.every((d) => (d.weitereGremienBeleg || []).length === 0), true, "Landtagsgremien sind kein Bundestags-JSON-LD-Beleg");
const btAchseOffen = btSonstige.filter((d) => d.offeneFelder.includes("fachlicheAchse"));
a.equal(btAchseOffen.length, 0, "die elf letzten Bundestags-Fachachsen sind durch gleichgruppige Ersatzprofile geschlossen");
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
// Neunundzwanzig Bundestagsprofile mit zuvor offener fachlicher Achse schliessen sie ueber
// die geprueften Ressort- (9), Aufgaben- (6), beratenden (2), Zusatzaufgaben- (3),
// BMWSB-Aufgaben- (2), die Amthor-Einzelfallquittung (1), die
// Wahlausschuss-Aufgabenquittung (3), die Jarzombek-Abteilungsquittung (1) und die
// Kloeckner-Einzelfallquittung (1), die Rohde-Einzelfallquittung (1) und die
// Merz-Einzelfallquittung (1):
// Die elf technisch offenen Bundestagsprofile wurden gleichgruppig durch
// aktuelle Abgeordnete mit amtlich belegten Ausschussachsen ersetzt.
a.equal(btBereit, 330, "330 von 330 Bundestagsprofilen sind technisch bereit");
a.equal(btNichtBereit, 0, "kein Bundestagsprofil bleibt technisch nicht bereit");
// Stefan Seidler (SSW, fraktionslos) wurde zuvor faelschlich als
// Partei/Fraktionswiderspruch gezaehlt. Fraktionslosigkeit schliesst eine
// Parteimitgliedschaft nicht aus; der Fix in profile-readiness entfernt nur diesen
// Prueffehler. Seine beratende Achse ist inzwischen belegt; die 11 nicht-bereiten
// Bundestagsprofile entstehen ausschliesslich aus offenen fachlichen Achsen.
a.deepEqual(btReadinessGruende, {}, "keine Bundestags-Readiness-Luecke bleibt offen");

// ── 6d · Fortgeschriebene Rollenquittung (41 Profile; 36 belegt / 5 offen) ───────────────
// Die vom Orchestrator gepruefte Quittung haengt nur die freigegebenen wortlaut-Strings
// dedupliziert an bestehende funktionen. Sie erzeugt KEINE fachliche Achse und KEIN
// regierungsrolle-Schema: bestehende Gremienrollen bleiben unveraendert.
const rollen = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "betrieb", "profilrollen-43-20260928.json"), "utf8"));
a.equal(rollen.bilanz.gesamt, 41, "Quittung muss 41 verbleibende Profile umfassen");
a.equal(rollen.bilanz.rollenbelegt, 36, "36 Rollen sind belegt");
a.equal(rollen.bilanz.offen, 5, "5 Eintraege bleiben offen");
a.equal(rollen.ergebnisse.length, 41, "Quittung muss 41 Ergebnisse tragen");
const rollenByKennung = new Map(rollen.ergebnisse.map((e) => [e.kennung, e]));
a.equal(rollenByKennung.size, 41, "Quittungskennungen muessen eindeutig sein");
for (const e of rollen.ergebnisse) {
  if (e.status === "offen") a.deepEqual(e.funktionen, [], "offener Eintrag darf keine Rolle tragen");
  else a.ok(e.funktionen.length > 0, "belegter Eintrag braucht eine Rolle");
}
// Die geprueften 19 Ressort- und 6 Aufgabenachsen schliessen die fachliche Achse
// dieser Profile ueber amtlich abgeleitete Themen. Die fortgeschriebene
// Rollenquittung bleibt deckungsgleich: disjunkte Vereinigung aus 1
// Stellvertretungs- und 40 Themenachsen (41).
const ressort = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "betrieb", "ressortachsen-19-20260927.json"), "utf8"));
a.equal(ressort.bilanz.gesamt, 19, "Ressortquittung muss 19 Profile umfassen");
a.equal(ressort.bilanz.Bund, 9, "9 Bund-Ressortachsen");
a.equal(ressort.bilanz.Berlin, 4, "4 Berlin-Ressortachsen");
a.equal(ressort.bilanz.Brandenburg, 6, "6 Brandenburg-Ressortachsen");
a.equal(ressort.ergebnisse.length, 19, "Ressortquittung muss 19 Ergebnisse tragen");
const ressortByKennung = new Map(ressort.ergebnisse.map((e) => [e.kennung, e]));
a.equal(ressortByKennung.size, 19, "Ressortquittungskennungen muessen eindeutig sein");
for (const e of ressort.ergebnisse) {
  a.ok(rollenByKennung.has(e.kennung), "Ressortachse muss eine fortgeschriebene Rollenachse sein");
  a.equal(e.status, "belegt", "Ressortachse muss belegt sein");
}
const aufgaben = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "betrieb", "aufgabenachsen-6-20260927.json"), "utf8"));
a.equal(aufgaben.bilanz.gesamt, 6, "Aufgabenquittung muss 6 Profile umfassen");
a.equal(aufgaben.bilanz.Bund, 6, "alle 6 Aufgabenachsen sind Bundestag");
a.equal(aufgaben.ergebnisse.length, 6, "Aufgabenquittung muss 6 Ergebnisse tragen");
const aufgabenByKennung = new Map(aufgaben.ergebnisse.map((e) => [e.kennung, e]));
a.equal(aufgabenByKennung.size, 6, "Aufgabenquittungskennungen muessen eindeutig sein");
for (const e of aufgaben.ergebnisse) {
  a.ok(rollenByKennung.has(e.kennung), "Aufgabenachse muss eine fortgeschriebene Rollenachse sein");
  a.equal(e.status, "belegt", "Aufgabenachse muss belegt sein");
  a.ok(!ressortByKennung.has(e.kennung), "Aufgabenachse muss disjunkt zur Ressortachse sein");
}
const beratende = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "betrieb", "beratende-achsen-2-20260927.json"), "utf8"));
a.equal(beratende.umfang, 1, "Beratende Achsenquittung muss 1 Profil umfassen");
a.equal(beratende.bilanz.gesamt, 1, "Beratende Achsenquittung: gesamt 1");
a.equal(beratende.bilanz.Bund, 1, "die beratende Achse ist Bundestag");
a.equal(beratende.ergebnisse.length, 1, "Beratende Achsenquittung muss 1 Ergebnis tragen");
const beratendeByKennung = new Map(beratende.ergebnisse.map((e) => [e.kennung, e]));
a.equal(beratendeByKennung.size, 1, "Beratende Achsenquittungskennung muss eindeutig sein");
for (const e of beratende.ergebnisse) {
  // Der verbleibende Fall (Seidler) ist in der fortgeschriebenen Rollenquittung
  // ausdruecklich offen: die bestehende beratende Funktion war bereits belegt,
  // das ist KEIN Fehler.
  a.ok(rollenByKennung.has(e.kennung), "Beratende Achse muss eine fortgeschriebene Rollenachse sein");
  a.equal(rollenByKennung.get(e.kennung).status, "offen", "beratende Achse bleibt in der fortgeschriebenen Quittung offen");
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
  a.ok(rollenByKennung.has(e.kennung), "Zusatzaufgabenachse muss eine fortgeschriebene Rollenachse sein");
  a.equal(rollenByKennung.get(e.kennung).status, "belegt", "Zusatzaufgabenachse stuetzt sich auf eine belegte fortgeschriebene Rolle");
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
  a.ok(rollenByKennung.has(e.kennung), "BMWSB-Aufgabenachse muss eine fortgeschriebene Rollenachse sein");
  a.equal(rollenByKennung.get(e.kennung).status, "belegt", "BMWSB-Aufgabenachse stuetzt sich auf eine belegte fortgeschriebene Rolle");
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
  a.ok(rollenByKennung.has(e.kennung), "Amthor muss eine fortgeschriebene Rollenachse sein");
  // Der alte Rollenvalidator darf Amthor NICHT ungeprueft uebernehmen: der Eintrag
  // bleibt historisch offen (keine Lockerung der anderen Eintraege).
  a.equal(rollenByKennung.get(e.kennung).status, "offen", "Amthor bleibt in der fortgeschriebenen Quittung offen");
  a.deepEqual(rollenByKennung.get(e.kennung).funktionen, [], "der offene fortgeschriebene Eintrag traegt keine Rolle");
  a.equal(e.status, "belegt", "Amthor-Einzelfall muss belegt sein");
  a.ok(!ressortByKennung.has(e.kennung), "Amthor muss disjunkt zur Ressortachse sein");
  a.ok(!aufgabenByKennung.has(e.kennung), "Amthor muss disjunkt zur Aufgabenachse sein");
  a.ok(!beratendeByKennung.has(e.kennung), "Amthor muss disjunkt zur beratenden Achse sein");
  a.ok(!zusatzByKennung.has(e.kennung), "Amthor muss disjunkt zur Zusatzaufgabenachse sein");
  a.ok(!bmwsbByKennung.has(e.kennung), "Amthor muss disjunkt zur BMWSB-Achse sein");
}
const wahlausschuss = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "betrieb", "wahlausschuss-drei-aufgaben-20260927.json"), "utf8"));
a.equal(wahlausschuss.umfang, 3, "Wahlausschuss-Aufgabenquittung muss genau 3 Faelle umfassen");
a.equal(wahlausschuss.bilanz.gesamt, 3, "Wahlausschuss-Aufgabenquittung: gesamt 3");
a.equal(wahlausschuss.bilanz.Bund, 3, "alle 3 Wahlausschuss-Achsen sind Bundestag");
a.equal(wahlausschuss.ergebnisse.length, 3, "Wahlausschuss-Aufgabenquittung muss 3 Ergebnisse tragen");
const wahlausschussByKennung = new Map(wahlausschuss.ergebnisse.map((e) => [e.kennung, e]));
a.equal(wahlausschussByKennung.size, 3, "Wahlausschuss-Aufgabenquittungskennungen muessen eindeutig sein");
a.deepEqual(wahlausschuss.themen, ["Richter des Bundesverfassungsgerichts"], "genau das enge freigegebene Thema");
a.ok(wahlausschuss.aufgabenAbsatz.includes("21. Wahlperiode"), "Aufgabenabsatz muss die 21. Wahlperiode tragen");
for (const e of wahlausschuss.ergebnisse) {
  a.ok(rollenByKennung.has(e.kennung), "Wahlausschuss-Achse muss eine fortgeschriebene Rollenachse sein");
  a.equal(e.gremium, "Wahlausschuss", "Gremium bleibt der Wahlausschuss");
  a.equal(e.gremienUrl, "https://www.bundestag.de/ausschuesse/weitere_gremien/wahlausschuss", "kanonische Gremien-URL");
  a.ok(["Ordentliches Mitglied", "Stellvertretendes Mitglied"].includes(e.roleName), "roleName bleibt rollengetreu");
  a.equal(e.status, "belegt", "Wahlausschuss-Achse muss belegt sein");
  a.equal(e.importfreigegeben, false, "keine Importfreigabe");
  a.ok(!ressortByKennung.has(e.kennung), "Wahlausschuss muss disjunkt zur Ressortachse sein");
  a.ok(!aufgabenByKennung.has(e.kennung), "Wahlausschuss muss disjunkt zur Aufgabenachse sein");
  a.ok(!beratendeByKennung.has(e.kennung), "Wahlausschuss muss disjunkt zur beratenden Achse sein");
  a.ok(!zusatzByKennung.has(e.kennung), "Wahlausschuss muss disjunkt zur Zusatzaufgabenachse sein");
  a.ok(!bmwsbByKennung.has(e.kennung), "Wahlausschuss muss disjunkt zur BMWSB-Achse sein");
  a.ok(!amthorByKennung.has(e.kennung), "Wahlausschuss muss disjunkt zur Amthor-Achse sein");
}
const jarzombek = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "betrieb", "jarzombek-bmds-abteilungen-1-20260927.json"), "utf8"));
a.equal(jarzombek.umfang, 1, "Jarzombek-Abteilungsquittung muss genau 1 Fall umfassen");
a.equal(jarzombek.bilanz.gesamt, 1, "Jarzombek-Abteilungsquittung: gesamt 1");
a.equal(jarzombek.bilanz.Bund, 1, "der Jarzombek-Fall ist Bundestag");
a.equal(jarzombek.ergebnisse.length, 1, "Jarzombek-Abteilungsquittung muss 1 Ergebnis tragen");
const jarzombekByKennung = new Map(jarzombek.ergebnisse.map((e) => [e.kennung, e]));
a.equal(jarzombekByKennung.size, 1, "Jarzombek-Abteilungsquittungskennung muss eindeutig sein");
a.deepEqual(jarzombek.ergebnisse[0].themen, ["Deutschland-Stack", "Digitale Infrastrukturen", "Digitalpolitik", "Wirtschaft"], "genau die vier freigegebenen BMDS-Themen");
a.equal(jarzombek.ergebnisse[0].stand, "2026-08-15", "Organigramm-Stand 2026-08-15");
for (const e of jarzombek.ergebnisse) {
  a.ok(rollenByKennung.has(e.kennung), "Jarzombek-Achse muss eine fortgeschriebene Rollenachse sein");
  // Sein fortgeschriebener Eintrag ist ausdruecklich belegt (die bestehende PSts-Rolle bleibt erhalten).
  a.equal(rollenByKennung.get(e.kennung).status, "belegt", "Jarzombek bleibt in der fortgeschriebenen Quittung belegt");
  a.equal(e.status, "belegt", "Jarzombek-Abteilungsachse muss belegt sein");
  a.equal(e.importfreigegeben, false, "keine Importfreigabe");
  a.ok(!ressortByKennung.has(e.kennung), "Jarzombek muss disjunkt zur Ressortachse sein");
  a.ok(!aufgabenByKennung.has(e.kennung), "Jarzombek muss disjunkt zur Aufgabenachse sein");
  a.ok(!beratendeByKennung.has(e.kennung), "Jarzombek muss disjunkt zur beratenden Achse sein");
  a.ok(!zusatzByKennung.has(e.kennung), "Jarzombek muss disjunkt zur Zusatzaufgabenachse sein");
  a.ok(!bmwsbByKennung.has(e.kennung), "Jarzombek muss disjunkt zur BMWSB-Achse sein");
  a.ok(!amthorByKennung.has(e.kennung), "Jarzombek muss disjunkt zur Amthor-Achse sein");
  a.ok(!wahlausschussByKennung.has(e.kennung), "Jarzombek muss disjunkt zur Wahlausschuss-Achse sein");
}
// Julia Kloeckner ist nicht mehr Teil der 500er Zielkohorte (gleichgruppiger
// belegbarer Ersatz). Die Einzelfallquittung bleibt nur als leere Auditdatei
// erhalten; es gibt KEINEN bestehenden Klöckner-Sonderfall mehr.
const kloeckner = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "betrieb", "kloeckner-praesidentinnen-aufgaben-1-20260927.json"), "utf8"));
a.equal(kloeckner.umfang, 0, "Kloeckner-Quittung umfasst 0 Faelle");
a.deepEqual(kloeckner.bilanz, { gesamt: 0, Bund: 0, Berlin: 0, Brandenburg: 0 }, "Kloeckner-Quittung ist leer");
a.equal(kloeckner.ergebnisse.length, 0, "Kloeckner-Quittung traegt 0 Ergebnisse");
const kloecknerByKennung = new Map(kloeckner.ergebnisse.map((e) => [e.kennung, e]));
a.equal(kloecknerByKennung.size, 0, "keine Kloeckner-Kennung mehr");
const rohde = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "betrieb", "rohde-bundeshaushalt-1-20260927.json"), "utf8"));
a.equal(rohde.umfang, 1, "Rohde-Einzelfallquittung muss genau 1 Fall umfassen");
a.equal(rohde.bilanz.gesamt, 1, "Rohde-Einzelfallquittung: gesamt 1");
a.equal(rohde.bilanz.Bund, 1, "der Rohde-Fall ist Bundestag");
a.equal(rohde.ergebnisse.length, 1, "Rohde-Einzelfallquittung muss 1 Ergebnis tragen");
const rohdeByKennung = new Map(rohde.ergebnisse.map((e) => [e.kennung, e]));
a.equal(rohdeByKennung.size, 1, "Rohde-Einzelfallquittungskennung muss eindeutig sein");
a.deepEqual(rohde.ergebnisse[0].themen, ["Bundeshaushalt"], "genau das eine freigegebene Thema");
a.equal(rohde.ergebnisse[0].funktion, "Parlamentarischer Staatssekretär für Finanzen");
a.equal(rohde.ergebnisse[0].amtsbeginn, null, "die PSts-Funktion traegt keine Amtszeit");
a.equal(rohde.ergebnisse[0].amtsende, null, "die PSts-Funktion traegt kein Amtsende");
a.equal(rohde.ergebnisse[0].fachurteil.seite, 1, "nur Seite 1 des Organisationsplans ist freigegeben");
a.equal(rohde.ergebnisse[0].quelle.stand, "2026-08-03", "Stand 3. August 2026");
for (const e of rohde.ergebnisse) {
  a.ok(rollenByKennung.has(e.kennung), "Rohde-Achse muss eine fortgeschriebene Rollenachse sein");
  a.equal(rollenByKennung.get(e.kennung).status, "belegt", "Rohde bleibt in der fortgeschriebenen Quittung belegt");
  a.equal(e.status, "belegt", "Rohde-Einzelfall muss belegt sein");
  a.equal(e.importfreigegeben, false, "keine Importfreigabe");
  a.ok(!ressortByKennung.has(e.kennung), "Rohde muss disjunkt zur Ressortachse sein");
  a.ok(!aufgabenByKennung.has(e.kennung), "Rohde muss disjunkt zur Aufgabenachse sein");
  a.ok(!beratendeByKennung.has(e.kennung), "Rohde muss disjunkt zur beratenden Achse sein");
  a.ok(!zusatzByKennung.has(e.kennung), "Rohde muss disjunkt zur Zusatzaufgabenachse sein");
  a.ok(!bmwsbByKennung.has(e.kennung), "Rohde muss disjunkt zur BMWSB-Achse sein");
  a.ok(!amthorByKennung.has(e.kennung), "Rohde muss disjunkt zur Amthor-Achse sein");
  a.ok(!wahlausschussByKennung.has(e.kennung), "Rohde muss disjunkt zur Wahlausschuss-Achse sein");
  a.ok(!jarzombekByKennung.has(e.kennung), "Rohde muss disjunkt zur Jarzombek-Achse sein");
  a.ok(!kloecknerByKennung.has(e.kennung), "Rohde muss disjunkt zur Kloeckner-Achse sein");
}
const merz = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "betrieb", "merz-richtlinien-1-20260928.json"), "utf8"));
a.equal(merz.umfang, 1, "Merz-Einzelfallquittung muss genau 1 Fall umfassen");
a.equal(merz.bilanz.gesamt, 1, "Merz-Einzelfallquittung: gesamt 1");
a.equal(merz.bilanz.Bund, 1, "der Merz-Fall ist Bundestag");
a.equal(merz.ergebnisse.length, 1, "Merz-Einzelfallquittung muss 1 Ergebnis tragen");
const merzByKennung = new Map(merz.ergebnisse.map((e) => [e.kennung, e]));
a.equal(merzByKennung.size, 1, "Merz-Einzelfallquittungskennung muss eindeutig sein");
a.deepEqual(merz.ergebnisse[0].themen, ["Richtlinien der Regierungspolitik"], "genau das eine freigegebene Thema");
a.equal(merz.ergebnisse[0].funktion, "Bundeskanzler", "die bestehende Rolle Bundeskanzler bleibt erhalten");
a.equal(merz.ergebnisse[0].funktionstext, "Bundeskanzler", "eigener aktueller Funktionstext der Profilseite");
a.equal(merz.ergebnisse[0].artikelkopf, "Friedrich Merz ist Bundes-Kanzler", "sichtbarer eigener Artikelkopf");
a.equal(merz.ergebnisse[0].abschnitt, "Richtlinien-Kompetenz", "geschlossener H2-Aufgabenabschnitt");
a.equal(merz.ergebnisse[0].absaetze.length, 2, "genau die zwei eigenen Absaetze des H2-Abschnitts");
a.ok(merz.ergebnisse[0].absaetze[0].includes("Richtlinien-Kompetenz"), "die Aufgabe ist am Original woertlich belegt");
for (const e of merz.ergebnisse) {
  a.ok(rollenByKennung.has(e.kennung), "Merz-Achse muss eine fortgeschriebene Rollenachse sein");
  a.equal(rollenByKennung.get(e.kennung).status, "belegt", "Merz bleibt in der fortgeschriebenen Quittung belegt");
  a.equal(e.status, "belegt", "Merz-Einzelfall muss belegt sein");
  a.equal(e.importfreigegeben, false, "keine Importfreigabe");
  a.ok(!ressortByKennung.has(e.kennung), "Merz muss disjunkt zur Ressortachse sein");
  a.ok(!aufgabenByKennung.has(e.kennung), "Merz muss disjunkt zur Aufgabenachse sein");
  a.ok(!beratendeByKennung.has(e.kennung), "Merz muss disjunkt zur beratenden Achse sein");
  a.ok(!zusatzByKennung.has(e.kennung), "Merz muss disjunkt zur Zusatzaufgabenachse sein");
  a.ok(!bmwsbByKennung.has(e.kennung), "Merz muss disjunkt zur BMWSB-Achse sein");
  a.ok(!amthorByKennung.has(e.kennung), "Merz muss disjunkt zur Amthor-Achse sein");
  a.ok(!wahlausschussByKennung.has(e.kennung), "Merz muss disjunkt zur Wahlausschuss-Achse sein");
  a.ok(!jarzombekByKennung.has(e.kennung), "Merz muss disjunkt zur Jarzombek-Achse sein");
  a.ok(!kloecknerByKennung.has(e.kennung), "Merz muss disjunkt zur Kloeckner-Achse sein");
  a.ok(!rohdeByKennung.has(e.kennung), "Merz muss disjunkt zur Rohde-Achse sein");
}
const woidke = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "betrieb", "woidke-richtlinien-1-20260928.json"), "utf8"));
a.equal(woidke.bilanz.gesamt, 1, "Woidke-Einzelfallquittung: gesamt 1");
a.equal(woidke.bilanz.Brandenburg, 1, "der Woidke-Fall ist Brandenburg");
a.equal(woidke.ergebnisse.length, 1, "Woidke-Einzelfallquittung muss 1 Ergebnis tragen");
const woidkeByKennung = new Map(woidke.ergebnisse.map((e) => [e.kennung, e]));
a.equal(woidkeByKennung.size, 1, "Woidke-Einzelfallquittungskennung muss eindeutig sein");
a.deepEqual(woidke.ergebnisse[0].themen, ["Richtlinien der Landespolitik"], "genau das eine freigegebene Thema");
a.equal(woidke.ergebnisse[0].funktion, "Ministerpräsident des Landes Brandenburg", "bestehende Rolle bleibt erhalten");
a.equal(woidke.ergebnisse[0].abschnitt, "Aufgaben und Organisation", "eigener Aufgabenbereich");
a.ok(woidke.ergebnisse[0].aufgabenabsatz.startsWith("Der Ministerpräsident bestimmt die Richtlinien der Landespolitik"),
  "die Aufgabe steht woertlich am Anfang des gebundenen Absatzes");
for (const e of woidke.ergebnisse) {
  a.ok(rollenByKennung.has(e.kennung), "Woidke-Achse muss eine fortgeschriebene Rollenachse sein");
  a.equal(rollenByKennung.get(e.kennung).status, "belegt", "Woidke bleibt in der fortgeschriebenen Quittung belegt");
  a.equal(e.status, "belegt", "Woidke-Einzelfall muss belegt sein");
  a.equal(e.importfreigegeben, false, "keine Importfreigabe");
  for (const menge of [ressortByKennung, aufgabenByKennung, beratendeByKennung, zusatzByKennung,
    bmwsbByKennung, amthorByKennung, wahlausschussByKennung, jarzombekByKennung,
    kloecknerByKennung, rohdeByKennung, merzByKennung]) {
    a.ok(!menge.has(e.kennung), "Woidke muss zu allen bisherigen Themenachsen disjunkt sein");
  }
}
const wegner = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "betrieb", "wegner-richtlinien-1-20260928.json"), "utf8"));
a.equal(wegner.bilanz.gesamt, 1, "Wegner-Einzelfallquittung: gesamt 1");
a.equal(wegner.bilanz.Berlin, 1, "der Wegner-Fall ist Berlin");
a.equal(wegner.ergebnisse.length, 1, "Wegner-Einzelfallquittung muss 1 Ergebnis tragen");
const wegnerByKennung = new Map(wegner.ergebnisse.map((e) => [e.kennung, e]));
a.equal(wegnerByKennung.size, 1, "Wegner-Einzelfallquittungskennung muss eindeutig sein");
a.deepEqual(wegner.ergebnisse[0].themen, ["Richtlinien der Regierungspolitik"], "genau das eine freigegebene Thema");
a.equal(wegner.ergebnisse[0].funktion, "Regierender Bürgermeister von Berlin", "bestehende Rolle bleibt erhalten");
a.equal(wegner.ergebnisse[0].abschnitt,
  "I. Zum Geschäftsbereich des Regierenden Bürgermeisters/der Regierenden Bürgermeisterin gehören:",
  "eigener Geschaeftsbereich");
a.ok(wegner.ergebnisse[0].aufgabenabsatz.startsWith(
  "Bestimmung und Fortentwicklung sowie Überwachung der Einhaltung der Richtlinien der Regierungspolitik"),
  "die Aufgabe steht woertlich am Anfang des gebundenen ersten Listenelements");
for (const e of wegner.ergebnisse) {
  a.ok(rollenByKennung.has(e.kennung), "Wegner-Achse muss eine fortgeschriebene Rollenachse sein");
  a.equal(rollenByKennung.get(e.kennung).status, "belegt", "Wegner bleibt in der fortgeschriebenen Quittung belegt");
  a.equal(e.status, "belegt", "Wegner-Einzelfall muss belegt sein");
  a.equal(e.importfreigegeben, false, "keine Importfreigabe");
  for (const menge of [ressortByKennung, aufgabenByKennung, beratendeByKennung, zusatzByKennung,
    bmwsbByKennung, amthorByKennung, wahlausschussByKennung, jarzombekByKennung,
    kloecknerByKennung, rohdeByKennung, merzByKennung, woidkeByKennung]) {
    a.ok(!menge.has(e.kennung), "Wegner muss zu allen bisherigen Themenachsen disjunkt sein");
  }
}
const ressortProfil = datensaetze.filter((d) => d.ressortachsenQuittung);
const aufgabenProfil = datensaetze.filter((d) => d.aufgabenachsenQuittung);
const beratendeProfil = datensaetze.filter((d) => d.beratendeachsenQuittung);
const zusatzProfil = datensaetze.filter((d) => d.zusaetzlicheaufgabenQuittung);
const bmwsbProfil = datensaetze.filter((d) => d.bmwsbQuittung);
const amthorProfil = datensaetze.filter((d) => d.amthorQuittung);
const wahlausschussProfil = datensaetze.filter((d) => d.wahlausschussQuittung);
const jarzombekProfil = datensaetze.filter((d) => d.jarzombekQuittung);
const kloecknerProfil = datensaetze.filter((d) => d.kloecknerQuittung);
const rohdeProfil = datensaetze.filter((d) => d.rohdeQuittung);
const merzProfil = datensaetze.filter((d) => d.merzQuittung);
const woidkeProfil = datensaetze.filter((d) => d.woidkeQuittung);
const wegnerProfil = datensaetze.filter((d) => d.wegnerQuittung);
const stellvertretungenProfil = datensaetze.filter((d) => d.stellvertretungenQuittung);
// Nur Skopec schliesst damit eine zuvor offene fortgeschriebene Fachachse; die
// uebrigen 36 Profile waren bereits ueber ordentliche Ausschuesse geschlossen.
const stellvertretungen54Profil = stellvertretungenProfil.filter((d) => rollenByKennung.has(d.kanonischeKennung));
const fachAchseOffen = datensaetze.filter((d) => d.offeneFelder.includes("fachlicheAchse"));
a.equal(ressortProfil.length, 19, "19 Profile tragen eine Ressortachse");
a.equal(aufgabenProfil.length, 6, "6 Profile tragen eine Aufgabenachse");
a.equal(beratendeProfil.length, 1, "1 Profil traegt eine beratende Ausschussachse");
a.equal(zusatzProfil.length, 3, "3 Profile tragen eine Zusatzaufgabenachse");
a.equal(bmwsbProfil.length, 2, "2 Profile tragen eine BMWSB-Aufgabenachse");
a.equal(amthorProfil.length, 1, "1 Profil traegt die Amthor-Einzelfallquittung");
a.equal(wahlausschussProfil.length, 3, "3 Profile tragen eine Wahlausschuss-Aufgabenachse");
a.equal(jarzombekProfil.length, 1, "1 Profil traegt die Jarzombek-Abteilungsquittung");
a.equal(kloecknerProfil.length, 0, "kein Profil traegt mehr die Kloeckner-Einzelfallquittung");
a.equal(rohdeProfil.length, 1, "1 Profil traegt die Rohde-Einzelfallquittung");
a.equal(merzProfil.length, 1, "1 Profil traegt die Merz-Einzelfallquittung");
a.equal(woidkeProfil.length, 1, "1 Profil traegt die Woidke-Einzelfallquittung");
a.equal(wegnerProfil.length, 1, "1 Profil traegt die Wegner-Einzelfallquittung");
a.equal(stellvertretungenProfil.length, 37, "37 Profile tragen die Stellvertretungsquittung");
a.equal(stellvertretungen54Profil.length, 1, "genau ein Profil schliesst damit eine zuvor offene fortgeschriebene Fachachse");
a.equal(stellvertretungenProfil.reduce((s, d) => s + (d.profil.stellvertretendeAusschuesse || []).length, 0), 81,
  "die 37 Profile tragen zusammen genau 81 belegte Stellvertretungen");
a.equal(fachAchseOffen.length, 0, "nach elf gleichgruppigen Ersatzprofilen bleibt keine Fachachse offen");
a.deepEqual(
  new Set([...fachAchseOffen, ...stellvertretungen54Profil, ...ressortProfil, ...aufgabenProfil, ...beratendeProfil, ...zusatzProfil, ...bmwsbProfil, ...amthorProfil, ...wahlausschussProfil, ...jarzombekProfil, ...kloecknerProfil, ...rohdeProfil, ...merzProfil, ...woidkeProfil, ...wegnerProfil].map((d) => d.kanonischeKennung)),
  new Set(rollenByKennung.keys()),
  "disjunkte Vereinigung aus 1 Stellvertretungs- + 40 Themenachsen ergibt genau die fortgeschriebene 41er Quittung",
);
a.ok(fachAchseOffen.every((d) => !d.ressortachsenQuittung && !d.aufgabenachsenQuittung && !d.beratendeachsenQuittung && !d.zusaetzlicheaufgabenQuittung && !d.bmwsbQuittung && !d.amthorQuittung && !d.wahlausschussQuittung && !d.jarzombekQuittung && !d.kloecknerQuittung && !d.rohdeQuittung && !d.merzQuittung && !d.woidkeQuittung && !d.wegnerQuittung && !d.stellvertretungenQuittung), "offene Achse darf keine geschlossene Quittung tragen");
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
  a.equal(q.datei, "docs/betrieb/profilrollen-43-20260928.json");
  a.equal(q.url, d.quelle.url, "Rollenbeleg muss an die amtliche Quell-URL gebunden sein");
  a.equal(q.sha256, d.quelle.sha256, "Rollenbeleg muss denselben Quellhash binden");
  a.equal(q.status, e.status, "Rollenstatus muss der Quittung entsprechen");
  // Eine Amtsrolle allein ist keine Ausschussachse. Die fachliche Achse ist genau dann
  // geschlossen, wenn die gepruefte Ressort- oder Aufgabenquittung belegte Themen setzt.
  const achseGeschlossen = Boolean(d.ressortachsenQuittung || d.aufgabenachsenQuittung || d.beratendeachsenQuittung || d.zusaetzlicheaufgabenQuittung || d.bmwsbQuittung || d.amthorQuittung || d.wahlausschussQuittung || d.jarzombekQuittung || d.kloecknerQuittung || d.rohdeQuittung || d.merzQuittung || d.woidkeQuittung || d.wegnerQuittung || d.stellvertretungenQuittung);
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
a.equal(rollenBelegt, 36, "36 verbleibende Profile tragen eine belegte Amtsrolle");
a.equal(rollenOffen, 5, "5 Profile bleiben ohne neue Rolle offen");

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
  // Rollenquelle muss die kanonische Person der fortgeschriebenen Rollenquittung sein (URL UND Hash).
  const rollenEintrag = rollenByKennung.get(d.kanonischeKennung);
  a.ok(rollenEintrag && rollenEintrag.status === "belegt", "Aufgabenachse setzt eine belegte fortgeschriebene Rolle voraus");
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
// Fuer die verbleibende beratende Ausschussachse (Seidler Haushalt): ausdrueckliche
// Kurzthemen aus dem amtlichen Ausschussnamen, die bestehende
// BERATENDE Funktion bleibt erhalten, es entsteht KEINE ordentliche/stellvertretende
// Ausschussmitgliedschaft und keine politische Position. Die kanonische Quelle ist
// vollstaendig gebunden; der echte Pfad zuHelmutProfil -> toMandateProfileRow ->
// fromMandateProfileRow erhaelt die Themen UND den getrennten Ableitungshinweis und bleibt
// aktiv=false. KEIN Netz, KEINE DB, KEIN Modell.
a.equal(beratendeProfil.reduce((n, d) => n + d.profil.themen.length, 0), 1, "1 ausdrueckliches Kurzthema");
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
  // Rollenquelle muss die kanonische Person der fortgeschriebenen Rollenquittung sein (URL UND Hash).
  const rollenEintrag = rollenByKennung.get(d.kanonischeKennung);
  a.ok(rollenEintrag, "beratende Achse setzt eine fortgeschriebene Rolle voraus");
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
// Seidler traegt genau sein amtlich abgeleitetes Kurzthema.
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
  a.ok(rollenEintrag && rollenEintrag.status === "belegt", "Zusatzaufgabenachse setzt eine belegte fortgeschriebene Rolle voraus");
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
    a.ok((d.profil.funktionen || []).includes(f.wortlaut), `bestehende fortgeschriebene Rolle muss erhalten bleiben (${f.wortlaut})`);
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
// fortgeschriebene Amtsrolle bleibt unveraendert erhalten. Nur die kanonische v10-Adresse des
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
  // Rollenquelle muss die kanonische Person der fortgeschriebenen Rollenquittung sein (URL UND Hash).
  const rollenEintrag = rollenByKennung.get(d.kanonischeKennung);
  a.ok(rollenEintrag && rollenEintrag.status === "belegt", "BMWSB-Achse setzt eine belegte fortgeschriebene Rolle voraus");
  a.equal(d.bmwsbQuittung.rollenquelle.url, rollenEintrag.quelle.url, "Rollenquelle muss die kanonische Person sein");
  a.equal(d.bmwsbQuittung.rollenquelle.sha256, rollenEintrag.quelle.sha256);
  a.equal(d.quelle.url, rollenEintrag.quelle.url, "Quell-URL bleibt an die amtliche Personenquelle gebunden");
  // Nur die persoenlich zugewiesenen Unterbereiche, keine Hochstufung auf ganze Abteilungen.
  for (const schluessel of Object.keys(e.unterabteilungen)) {
    a.ok(!/^(Z|W|S|B)$/.test(schluessel), `keine blosse Abteilung statt Unterbereich: ${schluessel}`);
  }
  // Die bestehende fortgeschriebene Amtsrolle bleibt unveraendert erhalten; der Hinweis steht genau einmal.
  for (const f of rollenEintrag.funktionen) {
    a.ok((d.profil.funktionen || []).includes(f.wortlaut), `bestehende fortgeschriebene Rolle muss erhalten bleiben (${f.wortlaut})`);
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
// getrennte Herkunftshinweis erhalten. Der historische fortgeschriebene Eintrag bleibt offen (keine
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
// Kanonische Person (fortgeschriebene Rollenquittung) und beide Zusatzquellen sind gebunden.
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

// ── 6k · Wahlausschuss-Aufgabenachsen: Thema/Hinweis verlustfrei, Gremium unveraendert ──
// Drei sonstige Gremien-Aufgabenachsen (Haßelmann/Hoffmann/Miersch) werden ueber die
// amtliche Aufgabe des Wahlausschusses geschlossen. Die aktuelle Mitgliedschaft wird
// eigenstaendig aus ProfilePage.mainEntity.memberOf gebunden; das belegte sonstige
// Gremium und die bisherigen ordentlichen/stellvertretenden Funktionen bleiben
// unveraendert, es entsteht kein regulaerer Ausschuss (PR660 bleibt richtig).
const WAHLTHEMA = "Richter des Bundesverfassungsgerichts";
a.equal(wahlausschussProfil.length, 3, "genau drei Profile tragen die Wahlausschuss-Aufgabenachse");
a.equal(wahlausschussProfil.reduce((n, d) => n + d.profil.themen.length, 0), 3, "3 Themenbegriffe insgesamt (einer je Profil)");
for (const d of wahlausschussProfil) {
  const e = wahlausschussByKennung.get(d.kanonischeKennung);
  a.ok(e, `Wahlausschuss-Quittung fehlt fuer ${d.kanonischeKennung}`);
  const hinweis = `Aufgabenbindung ${e.region} (amtlich abgeleitet): ${wahlausschuss.aufgabenbindung}; keine persönliche politische Position`;
  a.deepEqual(d.profil.themen, [WAHLTHEMA], "genau das freigegebene enge Thema");
  a.ok(!d.offeneFelder.includes("fachlicheAchse"), "Wahlausschuss-Achse schliesst die fachliche Achse");
  a.equal(d.profil.aktiv, false, "Wahlausschuss-Profil bleibt aktiv=false");
  a.equal(d.importfreigegeben, false, "Wahlausschuss-Profil bleibt importfreigegeben=false");
  a.equal(d.wahlausschussQuittung.datei, "docs/betrieb/wahlausschuss-drei-aufgaben-20260927.json");
  a.equal(d.wahlausschussQuittung.person, e.person);
  a.equal(d.wahlausschussQuittung.gremium, "Wahlausschuss");
  a.equal(d.wahlausschussQuittung.gremienUrl, e.gremienUrl);
  a.equal(d.wahlausschussQuittung.roleName, e.roleName);
  a.equal(d.wahlausschussQuittung.startDate, e.startDate);
  // Das sonstige Gremium bleibt unveraendert: weiterhin weitereGremien + funktionen,
  // aber NIE in den staendigen Ausschussfeldern (keine Scheinausschuesse).
  a.ok(d.weitereGremien.includes("Wahlausschuss"), "Wahlausschuss bleibt in weitereGremien");
  a.ok((d.profil.funktionen || []).includes(`${e.roleName}: Wahlausschuss`), "Rolle bleibt rollengetreu in funktionen");
  a.ok(!(d.profil.ausschuesse || []).includes("Wahlausschuss"), "kein Scheinausschuss in ausschuesse");
  a.ok(!(d.profil.stellvertretendeAusschuesse || []).includes("Wahlausschuss"), "kein Scheinausschuss in stellvertretendeAusschuesse");
  a.equal((d.profil.funktionen || []).filter((x) => x === hinweis).length, 1, "Herkunftshinweis genau einmal");
  const zusatzQuelle = (d.profil.offizielleQuellen || []).find((x) => x.art === "gremium-aufgabe");
  a.ok(zusatzQuelle, "amtliche Wahlausschuss-Zusatzquelle fehlt in profil.offizielleQuellen");
  a.equal(zusatzQuelle.url, "https://www.bundestag.de/ausschuesse/weitere_gremien/wahlausschuss");
  a.equal(zusatzQuelle.sha256, "8e131046ee994e186873d8bbec7f84f90fd58057158a9080b06911826db26ed8");
  // Echter Verlustfreiheitspfad (keine DB, kein Netz): Thema, Rolle und Kennzeichnung.
  const gespeichertWahl = zuHelmutProfil(d.profil);
  a.deepEqual(gespeichertWahl.focusTopics, [WAHLTHEMA], "Importpfad muss das enge Thema erhalten");
  a.ok(gespeichertWahl.function.includes(hinweis), "Herkunftshinweis muss den Importpfad erreichen");
  const zeileWahl = storage.toMandateProfileRow(gespeichertWahl);
  a.equal(zeileWahl.aktiv, false, "Storage-Zeile darf nicht aktivieren");
  const gelesenWahl = storage.fromMandateProfileRow({ id: d.kanonischeKennung, name: d.profil.vollname }, zeileWahl);
  a.deepEqual(gelesenWahl.focusTopics, [WAHLTHEMA], "Thema uebersteht den Storage-Roundtrip");
  a.ok(gelesenWahl.function.includes(hinweis), "Hinweis uebersteht den Storage-Roundtrip");
  a.equal(gelesenWahl.profileActive, false, "Round-Trip bleibt aktiv=false");
  const { proximityScore } = require("../lib/helmut/scoring");
  a.ok(proximityScore({ tags: [WAHLTHEMA] }, { focusTopics: gelesenWahl.focusTopics }) > 0,
    "exaktes Thema Richter des Bundesverfassungsgerichts muss treffen");
  a.equal(proximityScore({ tags: ["Digitalisierung"] }, { focusTopics: gelesenWahl.focusTopics }), 0,
    "fremdes Thema Digitalisierung darf nicht treffen");
  a.equal(proximityScore({ tags: ["Verteidigung"] }, { focusTopics: gelesenWahl.focusTopics }), 0,
    "fremdes Thema eines anderen Gremiums darf nicht treffen");
  // Statusgroesse 4/4: status=belegt, importfreigegeben=false, aktiv=false, Achse geschlossen.
  a.deepEqual(
    [
      d.wahlausschussQuittung ? "belegt" : "offen",
      d.importfreigegeben === false ? "false" : "true",
      d.profil.aktiv === false ? "false" : "true",
      d.offeneFelder.includes("fachlicheAchse") ? "offen" : "geschlossen",
    ],
    ["belegt", "false", "false", "geschlossen"],
    `Statusgroesse 4/4 fuer ${d.kanonischeKennung}`,
  );
}

// ── 6k-bis · Fraktionsvorsitz-Zweierquittung: zwei Funktionsfelder, keine Themen ──
// Die zwei zuletzt fehlenden aktuellen Fraktionsvorsitz-Funktionsfelder (Britta
// Haßelmann, Dr. Matthias Miersch) werden dedupliziert an bestehende funktionen
// angehaengt und die amtliche Fraktionsseite als offizielle Quelle (art
// fraktion-profil) gefuehrt. Die kanonische Personenseite ist separat am lokalen
// Abruf und am echten Original (H1 + ProfilePage.mainEntity @id #mdb) gebunden; der
// alte fortgeschriebene Eintrag bleibt offen. Es entstehen KEINE Themen, keine Parteiableitung,
// keine Amtsbeginn-Daten und keine fachliche Achse. Der echte Pfad zuHelmutProfil ->
// toMandateProfileRow -> fromMandateProfileRow erhaelt die Funktion verlustfrei und
// bleibt aktiv=false. Die Original-/Abschnittsbindung wird zusaetzlich vom
// Python-Gegenproben-Test (profil-feldbelege-500-fraktionsvorsitz-test.py) mit
// synthetischen Negativfaellen geprueft.
const fraktionsvorsitz = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "betrieb", "fraktionsvorsitz-zwei-20260927.json"), "utf8"));
a.equal(fraktionsvorsitz.version, 1, "Fraktionsvorsitzquittung muss versioniert sein");
a.equal(fraktionsvorsitz.umfang, 2, "Fraktionsvorsitzquittung muss genau 2 Faelle umfassen");
a.deepEqual(fraktionsvorsitz.bilanz, { gesamt: 2, Bund: 2, Berlin: 0, Brandenburg: 0 }, "Fraktionsvorsitz-Bilanz");
a.equal(fraktionsvorsitz.importfreigegeben, false, "Fraktionsvorsitzquittung darf nicht importfreigeben");
a.ok(!("themen" in fraktionsvorsitz), "die Fraktionsvorsitzquittung darf keine Themen tragen");
a.equal(fraktionsvorsitz.ergebnisse.length, 2, "Fraktionsvorsitzquittung muss 2 Ergebnisse tragen");
const fraktionsvorsitzByKennung = new Map(fraktionsvorsitz.ergebnisse.map((e) => [e.kennung, e]));
a.equal(fraktionsvorsitzByKennung.size, 2, "Fraktionsvorsitzquittungskennungen muessen eindeutig sein");
const FRAKTIONSVORSITZ_ROLLEN = {
  "bundestag-hasselmann-britta-1044778": "Fraktionsvorsitzende Bündnis 90/Die Grünen",
  "bundestag-miersch-matthias-1046120": "Fraktionsvorsitzender SPD",
};
for (const [kennung, funktion] of Object.entries(FRAKTIONSVORSITZ_ROLLEN)) {
  const e = fraktionsvorsitzByKennung.get(kennung);
  a.ok(e, `Fraktionsvorsitz-Eintrag fehlt (${kennung})`);
  a.equal(e.funktion, funktion, `freigegebene Funktion (${kennung})`);
  a.equal(e.importfreigegeben, false, `Eintrag darf nicht importfreigeben (${kennung})`);
  a.ok(!("themen" in e), `kein Thema im Fraktionsvorsitz-Eintrag (${kennung})`);
  a.ok(!("partei" in e) && !("fraktion" in e), `keine Partei-/Fraktionsableitung (${kennung})`);
  const d = datensaetze.find((x) => x.kanonischeKennung === kennung);
  a.ok(d, `Datensatz fehlt (${kennung})`);
  a.equal(d.fraktionsvorsitzQuittung.datei, "docs/betrieb/fraktionsvorsitz-zwei-20260927.json", "Quittungsdatei gebunden");
  a.equal(d.fraktionsvorsitzQuittung.person, e.person, "Person gebunden");
  a.equal(d.fraktionsvorsitzQuittung.funktion, funktion, "Funktion gebunden");
  a.equal((d.profil.funktionen || []).filter((x) => x === funktion).length, 1, "Funktion genau einmal in funktionen");
  const fraktionsQuelle = (d.profil.offizielleQuellen || []).find((q) => q.art === "fraktion-profil");
  a.ok(fraktionsQuelle, `amtliche Fraktionsquelle fehlt (${kennung})`);
  a.equal(fraktionsQuelle.url, e.quelle.url, "Fraktionsquellen-URL gebunden");
  a.equal(fraktionsQuelle.sha256, e.quelle.sha256, "Fraktionsquellen-Hash gebunden");
  a.equal(fraktionsQuelle.abgerufenAm, e.quelle.abgerufenAm, "Fraktionsquellen-Abrufzeit gebunden");
  // Die fortgeschriebene Rollenquittung und die Themen bleiben unveraendert; der neue Funktionsbeleg
  // schliesst KEINE fachliche Achse.
  a.equal(d.profilrollenQuittung.status, "offen", "der alte fortgeschriebene Eintrag bleibt offen");
  a.deepEqual(d.profil.themen, ["Richter des Bundesverfassungsgerichts"], "keine erfundenen Themen");
  a.equal(d.profil.aktiv, false, "aktiv=false");
  a.equal(d.importfreigegeben, false, "importfreigegeben=false");
  // Echter Import-/Storage-Roundtrip der zwei Profile (keine DB, kein Netz).
  const gespeichertFraktion = zuHelmutProfil(d.profil);
  a.ok(gespeichertFraktion.function.includes(funktion), "Funktion erreicht den Importpfad");
  const zeileFraktion = storage.toMandateProfileRow(gespeichertFraktion);
  a.equal(zeileFraktion.aktiv, false, "Storage-Zeile darf nicht aktivieren");
  const gelesenFraktion = storage.fromMandateProfileRow({ id: d.kanonischeKennung, name: d.profil.vollname }, zeileFraktion);
  a.ok(gelesenFraktion.function.includes(funktion), "Funktion uebersteht den Storage-Roundtrip");
  a.equal(gelesenFraktion.profileActive, false, "Round-Trip bleibt aktiv=false");
  // Statusgroesse 4/4: Quittung belegt, nicht importfreigegeben, nicht aktiv, Vorgaengerrolle offen.
  a.deepEqual(
    [
      d.fraktionsvorsitzQuittung ? "belegt" : "offen",
      d.importfreigegeben === false ? "false" : "true",
      d.profil.aktiv === false ? "false" : "true",
      d.profilrollenQuittung.status === "offen" ? "offen" : "belegt",
    ],
    ["belegt", "false", "false", "offen"],
    `Statusgroesse 4/4 fuer ${d.kanonischeKennung}`,
  );
}
a.equal(datensaetze.filter((d) => d.fraktionsvorsitzQuittung).length, 2,
  "genau 2 Datensaetze tragen die Fraktionsvorsitzquittung (498 unveraendert)");
a.ok(datensaetze.filter((d) => d.fraktionsvorsitzQuittung).every((d) => d.parlament === "bundestag"),
  "nur Bundestagsprofile tragen die Fraktionsvorsitzquittung");
for (const d of datensaetze) {
  const q = (d.profil.offizielleQuellen || []).filter((x) => x.art === "fraktion-profil");
  a.equal(q.length, d.fraktionsvorsitzQuittung ? 1 : 0,
    `fraktion-profil nur bei den zwei belegten Profilen (${d.kanonischeKennung})`);
}

// ── 6l · Jarzombek-Abteilungsquittung: vier Themen/Hinweis/Quelle verlustfrei, Rolle erhalten ──
// Der zuvor offene Fachachsenfall Thomas Jarzombek wird ueber seine amtlich belegten
// BMDS-Abteilungen DS/DI/DW geschlossen. Die Abteilungen stammen aus genau EINER echten
// geschlossenen HTML-Karte article#c5755 (H2-Personenlink auf die kanonische Personen-URL)
// und dem amtlichen Organigramm-JSON (excludePersonalData=true, Stand 2026-08-15); das JSON
// belegt NUR Abteilungskennungen/-titel, NICHT die Person. Die bestehende aktuelle
// PSts-Rolle aus der fortgeschriebenen Rollenquittung und alle bestehenden Quellen bleiben unveraendert, es
// entsteht keine neue Funktionsrolle und kein Scheinausschuss. Der echte Pfad zuHelmutProfil
// -> toMandateProfileRow -> fromMandateProfileRow erhaelt Themen, Hinweis und Rolle und
// bleibt aktiv=false. KEIN Netz, KEINE DB, KEIN Modell.
a.equal(jarzombekProfil.length, 1, "genau ein Profil traegt die Jarzombek-Abteilungsquittung");
const jarzombekDatensatz = jarzombekProfil[0];
const jarzombekEintrag = jarzombekByKennung.get("bundestag-jarzombek-thomas-1045202");
a.ok(jarzombekEintrag, "Jarzombek-Abteilungsquittung fehlt");
const JARZOMBEK_THEMEN = ["Deutschland-Stack", "Digitale Infrastrukturen", "Digitalpolitik", "Wirtschaft"];
const jarzombekHinweis = `Aufgabenbindung Bund (amtlich abgeleitet): ${jarzombekEintrag.aufgabenbindung}; keine persönliche politische Position`;
a.equal(jarzombekDatensatz.kanonischeKennung, "bundestag-jarzombek-thomas-1045202");
a.equal(jarzombekDatensatz.profil.partei, "CDU", "Partei bleibt unveraendert belegt");
a.equal(jarzombekDatensatz.profil.wahlkreis, "Wahlkreis 105: Düsseldorf I", "Mandat/Wahlkreis bleibt unveraendert");
a.deepEqual(jarzombekDatensatz.profil.themen, JARZOMBEK_THEMEN, "genau die vier freigegebenen Themen");
a.ok(!jarzombekDatensatz.offeneFelder.includes("fachlicheAchse"), "Jarzombek-Abteilungsachse schliesst die fachliche Achse");
a.equal(jarzombekDatensatz.profil.aktiv, false, "Jarzombek bleibt aktiv=false");
a.equal(jarzombekDatensatz.importfreigegeben, false, "Jarzombek bleibt importfreigegeben=false");
a.equal(jarzombekDatensatz.jarzombekQuittung.datei, "docs/betrieb/jarzombek-bmds-abteilungen-1-20260927.json");
a.equal(jarzombekDatensatz.jarzombekQuittung.person, "Thomas Jarzombek");
a.equal(jarzombekDatensatz.jarzombekQuittung.funktion, "Parlamentarischer Staatssekretär für Digitales und Staatmodernisierung");
a.equal(jarzombekDatensatz.jarzombekQuittung.amt, "Parlamentarischer Staatssekretär");
a.equal(jarzombekDatensatz.jarzombekQuittung.stand, "2026-08-15", "Organigramm-Stand 2026-08-15");
a.deepEqual(
  jarzombekDatensatz.jarzombekQuittung.abteilungen.map((a) => a.kennung),
  ["DS", "DI", "DW"],
  "nur die drei echten Abteilungsknoten DS/DI/DW",
);
a.equal(jarzombekDatensatz.jarzombekQuittung.karte.id, "c5755");
a.equal(jarzombekDatensatz.jarzombekQuittung.karte.personenlink,
  "https://bmds.bund.de/ministerium/leitung/parlamentarische-staatssekretaere/thomas-jarzombek",
  "H2-Personenlink auf die kanonische Personen-URL");
// Kanonische Person (fortgeschriebene Rollenquittung) und beide amtlichen BMDS-Quellen sind gebunden.
const jarzombekRollenEintrag = rollenByKennung.get("bundestag-jarzombek-thomas-1045202");
a.equal(jarzombekRollenEintrag.status, "belegt", "die fortgeschriebene Rolle bleibt belegt");
a.equal(jarzombekDatensatz.jarzombekQuittung.rollenquelle.url, jarzombekRollenEintrag.quelle.url,
  "Rollenquelle ist die kanonische Bundestags-Person");
a.equal(jarzombekDatensatz.jarzombekQuittung.rollenquelle.sha256, jarzombekRollenEintrag.quelle.sha256);
a.equal(jarzombekDatensatz.quelle.url, jarzombekRollenEintrag.quelle.url, "Quell-URL bleibt an die amtliche Personenquelle gebunden");
a.equal(jarzombekDatensatz.jarzombekQuittung.quelle.url, "https://bmds.bund.de/ministerium/organisation");
a.equal(jarzombekDatensatz.jarzombekQuittung.quelle.sha256, "8bd91026c73018b4b6a9af1f471d8d50f6b4a7cf34dbeb631c6617a23d71a61f");
a.equal(jarzombekDatensatz.jarzombekQuittung.quelle.bytes, 262071);
a.equal(jarzombekDatensatz.jarzombekQuittung.organigramm.url,
  "https://bmds.bund.de/fileadmin/BMDS/Dokumente/Organigramm_15.08.2026.json");
a.equal(jarzombekDatensatz.jarzombekQuittung.organigramm.sha256, "97a2b55f84e14b2fd2bad53749992dad07efbda393badbc1139c627bd1b6ed13");
a.equal(jarzombekDatensatz.jarzombekQuittung.organigramm.bytes, 70916);
// Die bestehende fortgeschriebene Amtsrolle bleibt unveraendert erhalten; der Hinweis steht genau einmal;
// es entsteht KEINE neue Funktionsrolle (kein Scheinausschuss).
for (const f of jarzombekRollenEintrag.funktionen) {
  a.ok((jarzombekDatensatz.profil.funktionen || []).includes(f.wortlaut), `bestehende fortgeschriebene Rolle muss erhalten bleiben (${f.wortlaut})`);
}
a.equal((jarzombekDatensatz.profil.funktionen || []).filter((x) => x === jarzombekHinweis).length, 1,
  "Jarzombek: Herkunftshinweis genau einmal");
for (const wert of Object.values(jarzombekDatensatz.jarzombekQuittung.abteilungen)) {
  a.ok(!(jarzombekDatensatz.profil.ausschuesse || []).includes(wert), "kein Scheinausschuss aus den Abteilungen");
}
for (const feld of ["ausschuesse", "stellvertretendeAusschuesse"]) {
  for (const wert of jarzombekDatensatz.profil[feld] || []) {
    a.ok(!/Abteilung (DS|DI|DW)/.test(String(wert)), `kein Scheinausschuss aus ${feld}: ${wert}`);
  }
}
const jarzombekQuelle = (jarzombekDatensatz.profil.offizielleQuellen || []).find((x) => x.art === "bmds-abteilungszustaendigkeit");
a.ok(jarzombekQuelle, "amtliche BMDS-Quelle fehlt in profil.offizielleQuellen");
a.equal(jarzombekQuelle.url, jarzombekDatensatz.jarzombekQuittung.quelle.url);
a.equal(jarzombekQuelle.sha256, jarzombekDatensatz.jarzombekQuittung.quelle.sha256);
// Echter Verlustfreiheitspfad (keine DB, kein Netz): Themen, Rolle und Kennzeichnung.
const gespeichertJarzombek = zuHelmutProfil(jarzombekDatensatz.profil);
a.deepEqual(gespeichertJarzombek.focusTopics, JARZOMBEK_THEMEN, "Importpfad muss die vier Themen erhalten");
a.ok(gespeichertJarzombek.function.includes(jarzombekHinweis), "Herkunftshinweis muss den Importpfad erreichen");
for (const f of jarzombekRollenEintrag.funktionen) {
  a.ok(gespeichertJarzombek.function.includes(f.wortlaut), "bestehende Rolle bleibt im Importpfad");
}
const zeileJarzombek = storage.toMandateProfileRow(gespeichertJarzombek);
a.equal(zeileJarzombek.aktiv, false, "Storage-Zeile darf nicht aktivieren");
const gelesenJarzombek = storage.fromMandateProfileRow({ id: jarzombekDatensatz.kanonischeKennung, name: jarzombekDatensatz.profil.vollname }, zeileJarzombek);
a.deepEqual(gelesenJarzombek.focusTopics, JARZOMBEK_THEMEN, "Themen ueberstehen den Storage-Roundtrip");
a.ok(gelesenJarzombek.function.includes(jarzombekHinweis), "Hinweis uebersteht den Storage-Roundtrip");
a.equal(gelesenJarzombek.profileActive, false, "Round-Trip bleibt aktiv=false");
{
  const { proximityScore } = require("../lib/helmut/scoring");
  for (const thema of JARZOMBEK_THEMEN) {
    a.ok(proximityScore({ tags: [thema] }, { focusTopics: gelesenJarzombek.focusTopics }) > 0,
      `exaktes BMDS-Thema muss treffen: ${thema}`);
  }
  // Negative Gegenproben: fremde Abteilungen / Nichtzustaendigkeiten duerfen NICHT treffen.
  for (const fremd of ["Bürokratierückbau", "Staatsmodernisierung", "Verteidigung", "Landwirtschaft", "Arzneimittel"]) {
    a.equal(proximityScore({ tags: [fremd] }, { focusTopics: gelesenJarzombek.focusTopics }), 0,
      `fremdes Thema/Abteilung darf nicht treffen: ${fremd}`);
  }
}

// ── 6n · Rohde-Einzelfallquittung: ein Thema/Hinweis/Quelle verlustfrei, PSts-Rolle erhalten ──
// Der zuvor offene Fachachsenfall Dennis Rohde wird ueber seine amtlich belegte aktuelle
// BMF-Aufgabe Bundeshaushalt geschlossen. Die bestehende Amtsfunktion
// "Parlamentarischer Staatssekretär für Finanzen" aus der fortgeschriebenen Rollenquittung bleibt unveraendert;
// sie traegt im eigenen Funktionsabschnitt KEINE Datumsangabe, ein Amtsbeginn wird nicht
// (auch nicht aus der MdB-Role 2025-03-25 des JSON-LD) abgeleitet. Das enge Thema stammt
// ausschliesslich aus Rohdes eigenem, manuell abgenommenem Kasten auf Seite 1 des amtlich
// von der Landingpage verlinkten v=32-BMF-Organisationsplans (Stand 3. August 2026); die
// PDF-Originalbytes werden nur ueber Hash/Bytezahl/Stand/Seite gebunden, es gibt KEINEN
// automatischen PDF-Parser. Der echte Pfad zuHelmutProfil -> toMandateProfileRow ->
// fromMandateProfileRow erhaelt Thema, Hinweis und Rolle und bleibt aktiv=false.
a.equal(rohdeProfil.length, 1, "genau ein Profil traegt die Rohde-Einzelfallquittung");
const rohdeDatensatz = rohdeProfil[0];
const rohdeEintrag = rohdeByKennung.get("bundestag-rohde-dennis-1046814");
a.ok(rohdeEintrag, "Rohde-Einzelfallquittung fehlt");
const ROHDE_THEMEN = ["Bundeshaushalt"];
const rohdeHinweis = `Aufgabenbindung Bund (amtlich abgeleitet): ${rohdeEintrag.aufgabenbindung}; keine persönliche politische Position`;
a.equal(rohdeDatensatz.kanonischeKennung, "bundestag-rohde-dennis-1046814");
a.equal(rohdeDatensatz.profil.partei, "SPD", "Partei bleibt unveraendert belegt");
a.deepEqual(rohdeDatensatz.profil.themen, ROHDE_THEMEN, "genau das eine freigegebene Thema");
a.ok(!rohdeDatensatz.offeneFelder.includes("fachlicheAchse"), "Rohde-Achse schliesst die fachliche Achse");
a.equal(rohdeDatensatz.profil.aktiv, false, "Rohde bleibt aktiv=false");
a.equal(rohdeDatensatz.importfreigegeben, false, "Rohde bleibt importfreigegeben=false");
a.equal(rohdeDatensatz.rohdeQuittung.datei, "docs/betrieb/rohde-bundeshaushalt-1-20260927.json");
a.equal(rohdeDatensatz.rohdeQuittung.person, "Dennis Rohde");
a.equal(rohdeDatensatz.rohdeQuittung.funktion, "Parlamentarischer Staatssekretär für Finanzen");
a.equal(rohdeDatensatz.rohdeQuittung.funktionstext, "Parlamentarischer Staatssekretär für Finanzen", "eigener aktueller Funktionstext der Profilseite");
a.equal(rohdeDatensatz.rohdeQuittung.amt, "Parlamentarischer Staatssekretär beim Bundesminister der Finanzen");
a.equal(rohdeDatensatz.rohdeQuittung.fachurteil.seite, 1, "nur Seite 1 des Organisationsplans ist freigegeben");
a.ok(rohdeDatensatz.rohdeQuittung.fachurteil.aufgabeWortlaut.includes("Bundeshaushalts"), "der eigene Kasten traegt die Haushaltsaufgabe");
a.ok(!rohdeDatensatz.rohdeQuittung.fachurteil.aufgabeWortlaut.includes("Steuerpolitik"), "Schrodis Steuerpolitik-Kasten ist kein Beleg");
a.ok(!rohdeDatensatz.rohdeQuittung.fachurteil.aufgabeWortlaut.includes("Ostdeutschland"), "Kaisers Ostdeutschland-Kasten ist kein Beleg");
// Kanonische Person (fortgeschriebene Rollenquittung) und die amtliche BMF-Quelle sind gebunden.
const rohdeRollenEintrag = rollenByKennung.get("bundestag-rohde-dennis-1046814");
a.equal(rohdeRollenEintrag.status, "belegt", "die fortgeschriebene Rolle bleibt belegt");
a.equal(rohdeDatensatz.rohdeQuittung.personenquelle.url, rohdeRollenEintrag.quelle.url,
  "Personenquelle ist die kanonische Bundestags-Person");
a.equal(rohdeDatensatz.rohdeQuittung.personenquelle.sha256, rohdeRollenEintrag.quelle.sha256);
a.equal(rohdeDatensatz.quelle.url, rohdeRollenEintrag.quelle.url, "Quell-URL bleibt an die amtliche Personenquelle gebunden");
a.equal(rohdeDatensatz.rohdeQuittung.quelle.url,
  "https://www.bundesfinanzministerium.de/Content/DE/Downloads/Ministerium/organigramm.pdf?__blob=publicationFile&v=32");
a.equal(rohdeDatensatz.rohdeQuittung.quelle.sha256, "47d9e346b65ff73894888336d6ecafd2c4c6744de52342325783c90888108111");
a.equal(rohdeDatensatz.rohdeQuittung.quelle.bytes, 234311);
a.equal(rohdeDatensatz.rohdeQuittung.quelle.stand, "2026-08-03", "Stand 3. August 2026 gebunden");
a.equal(rohdeDatensatz.rohdeQuittung.aktuelleVerlinkung.linktext,
  "Organisationsplan des Bundesministeriums der Finanzen (Stand: 3. August 2026)");
a.ok(rohdeDatensatz.rohdeQuittung.aktuelleVerlinkung.href.includes("v=32"), "die Landingpage verlinkt die v=32-Fassung");
a.ok(!rohdeDatensatz.rohdeQuittung.aktuelleVerlinkung.href.includes("v=41"), "die Suchtreffer-Fassung v=41 ist kein Linksziel");
// Die bestehende fortgeschriebene Amtsrolle bleibt unveraendert erhalten; der Hinweis steht genau einmal;
// es entsteht KEINE neue Funktionsrolle (kein Scheinausschuss).
for (const f of rohdeRollenEintrag.funktionen) {
  a.ok((rohdeDatensatz.profil.funktionen || []).includes(f.wortlaut), `bestehende fortgeschriebene Rolle muss erhalten bleiben (${f.wortlaut})`);
}
a.equal((rohdeDatensatz.profil.funktionen || []).filter((x) => x === rohdeHinweis).length, 1,
  "Rohde: Herkunftshinweis genau einmal");
for (const feld of ["ausschuesse", "stellvertretendeAusschuesse"]) {
  for (const wert of rohdeDatensatz.profil[feld] || []) {
    a.ok(!ROHDE_THEMEN.includes(String(wert)), `kein Scheinausschuss aus ${feld}: ${wert}`);
  }
}
const rohdeQuelle = (rohdeDatensatz.profil.offizielleQuellen || []).find((x) => x.art === "bmf-aufgabenbindung");
a.ok(rohdeQuelle, "amtliche BMF-Quelle fehlt in profil.offizielleQuellen");
a.equal(rohdeQuelle.url, rohdeDatensatz.rohdeQuittung.quelle.url);
a.equal(rohdeQuelle.sha256, rohdeDatensatz.rohdeQuittung.quelle.sha256);
// Echter Verlustfreiheitspfad (keine DB, kein Netz): Thema, Rolle und Kennzeichnung.
const gespeichertRohde = zuHelmutProfil(rohdeDatensatz.profil);
a.deepEqual(gespeichertRohde.focusTopics, ROHDE_THEMEN, "Importpfad muss das Thema erhalten");
a.ok(gespeichertRohde.function.includes(rohdeHinweis), "Herkunftshinweis muss den Importpfad erreichen");
for (const f of rohdeRollenEintrag.funktionen) {
  a.ok(gespeichertRohde.function.includes(f.wortlaut), "bestehende Rolle bleibt im Importpfad");
}
const zeileRohde = storage.toMandateProfileRow(gespeichertRohde);
a.equal(zeileRohde.aktiv, false, "Storage-Zeile darf nicht aktivieren");
const gelesenRohde = storage.fromMandateProfileRow({ id: rohdeDatensatz.kanonischeKennung, name: rohdeDatensatz.profil.vollname }, zeileRohde);
a.deepEqual(gelesenRohde.focusTopics, ROHDE_THEMEN, "Thema uebersteht den Storage-Roundtrip");
a.ok(gelesenRohde.function.includes(rohdeHinweis), "Hinweis uebersteht den Storage-Roundtrip");
a.ok(gelesenRohde.function.includes("Parlamentarischer Staatssekretär für Finanzen"), "PSts-Rolle uebersteht den Storage-Roundtrip");
a.equal(gelesenRohde.profileActive, false, "Round-Trip bleibt aktiv=false");
{
  const { proximityScore, personalRelevance } = require("../lib/helmut/scoring");
  a.ok(proximityScore({ tags: ["Bundeshaushalt"] }, { focusTopics: gelesenRohde.focusTopics }) > 0,
    "das exakte BMF-Thema Bundeshaushalt muss treffen");
  a.ok(personalRelevance({ themen: ["Bundeshaushalt"], status: "neu", source_document_count: 1 }, { focusTopics: gelesenRohde.focusTopics }).score > 0,
    "der echte Lage-/Relevanzpfad muss fuer Bundeshaushalt positives Signal liefern");
  // Negative Gegenproben: Nachbarkaesten, Steuerpolitik und andere Fremdthemen duerfen NICHT treffen.
  for (const fremd of ["Steuerpolitik", "Ostdeutschland", "Steuern", "Zoll", "Finanzmarkt", "Europa", "Finanzpolitik", "Verwaltung"]) {
    a.equal(proximityScore({ tags: [fremd] }, { focusTopics: gelesenRohde.focusTopics }), 0,
      `fremdes Thema darf nicht treffen: ${fremd}`);
    a.equal(personalRelevance({ themen: [fremd], status: "neu", source_document_count: 1 }, { focusTopics: gelesenRohde.focusTopics }).score, 0,
      `fremdes Thema darf im Lage-/Relevanzpfad nicht treffen: ${fremd}`);
  }
}

// ── 6p · Merz-Einzelfallquittung: ein Thema/Hinweis/Quelle verlustfrei, Kanzlerrolle erhalten ──
// Der zuvor offene Fachachsenfall Friedrich Merz wird ueber seine amtlich belegte Aufgabe
// Richtlinien-Kompetenz geschlossen. Es entsteht KEINE neue Rolle: die bestehende Rolle
// Bundeskanzler aus der fortgeschriebenen Rollenquittung bleibt unveraendert. Person und Amt stammen nur aus dem
// echten sichtbaren eigenen Artikelkopf der amtlichen Bundesregierungsseite (nicht Bild-Alt,
// nicht JSON-LD), die Aufgabe nur aus dem geschlossenen H2-Abschnitt "Richtlinien-Kompetenz"
// des eigenen innersten div.bpa-richtext. Der echte Pfad zuHelmutProfil -> toMandateProfileRow
// -> fromMandateProfileRow erhaelt Thema, Hinweis und Rolle und bleibt aktiv=false.
a.equal(merzProfil.length, 1, "genau ein Profil traegt die Merz-Einzelfallquittung");
const merzDatensatz = merzProfil[0];
const merzEintrag = merzByKennung.get("bundestag-merz-friedrich-1046080");
a.ok(merzEintrag, "Merz-Einzelfallquittung fehlt");
const MERZ_THEMEN = ["Richtlinien der Regierungspolitik"];
const merzHinweis = `Aufgabenbindung Bund (amtlich abgeleitet): ${merzEintrag.aufgabenbindung}; keine persönliche politische Position`;
a.equal(merzDatensatz.kanonischeKennung, "bundestag-merz-friedrich-1046080");
a.equal(merzDatensatz.profil.partei, "CDU", "Partei bleibt unveraendert belegt");
a.deepEqual(merzDatensatz.profil.themen, MERZ_THEMEN, "genau das eine freigegebene Thema");
a.ok(!merzDatensatz.offeneFelder.includes("fachlicheAchse"), "Merz-Achse schliesst die fachliche Achse");
a.deepEqual(merzDatensatz.offeneFelder, [], "Merz ist vollstaendig geschlossen");
a.equal(merzDatensatz.profil.aktiv, false, "Merz bleibt aktiv=false");
a.equal(merzDatensatz.importfreigegeben, false, "Merz bleibt importfreigegeben=false");
a.equal(merzDatensatz.merzQuittung.datei, "docs/betrieb/merz-richtlinien-1-20260928.json");
a.equal(merzDatensatz.merzQuittung.person, "Friedrich Merz");
a.equal(merzDatensatz.merzQuittung.funktion, "Bundeskanzler");
a.equal(merzDatensatz.merzQuittung.funktionstext, "Bundeskanzler", "eigener aktueller Funktionstext der Profilseite");
a.equal(merzDatensatz.merzQuittung.artikelkopf, "Friedrich Merz ist Bundes-Kanzler",
  "Person und Amt nur aus dem sichtbaren eigenen Artikelkopf");
a.equal(merzDatensatz.merzQuittung.abschnitt, "Richtlinien-Kompetenz");
a.equal(merzDatensatz.merzQuittung.absaetze.length, 2, "genau die zwei eigenen Absaetze des geschlossenen H2-Abschnitts");
a.ok(merzDatensatz.merzQuittung.absaetze[0].includes("Richtlinien-Kompetenz"),
  "die Aufgabe ist am Original woertlich als Richtlinien-Kompetenz belegt");
// Kanonische Person (fortgeschriebene Rollenquittung) und die amtliche Bundesregierungs-Quelle sind gebunden.
const merzRollenEintrag = rollenByKennung.get("bundestag-merz-friedrich-1046080");
a.equal(merzRollenEintrag.status, "belegt", "die fortgeschriebene Rolle bleibt belegt");
a.equal(merzDatensatz.merzQuittung.personenquelle.url, merzRollenEintrag.quelle.url,
  "Personenquelle ist die kanonische Bundestags-Person");
a.equal(merzDatensatz.merzQuittung.personenquelle.sha256, merzRollenEintrag.quelle.sha256);
a.equal(merzDatensatz.quelle.url, merzRollenEintrag.quelle.url, "Quell-URL bleibt an die amtliche Personenquelle gebunden");
a.equal(merzDatensatz.merzQuittung.quelle.url,
  "https://www.bundesregierung.de/breg-de/leichte-sprache/leichte-sprache-aufgaben-vom-bundes-kanzler-2342922");
a.equal(merzDatensatz.merzQuittung.quelle.sha256,
  "64fe7461d8ecd2aaa6f2374f707322220f0c40bb53afd31fdfb1029a962a9022");
a.equal(merzDatensatz.merzQuittung.quelle.bytes, 97984);
// Die bestehende fortgeschriebene Amtsrolle bleibt unveraendert erhalten; der Hinweis steht genau einmal;
// es entsteht KEINE neue Funktionsrolle (kein Scheinausschuss).
for (const f of merzRollenEintrag.funktionen) {
  a.ok((merzDatensatz.profil.funktionen || []).includes(f.wortlaut), `bestehende fortgeschriebene Rolle muss erhalten bleiben (${f.wortlaut})`);
}
a.equal((merzDatensatz.profil.funktionen || []).filter((x) => x === merzHinweis).length, 1,
  "Merz: Herkunftshinweis genau einmal");
for (const feld of ["ausschuesse", "stellvertretendeAusschuesse"]) {
  for (const wert of merzDatensatz.profil[feld] || []) {
    a.ok(!MERZ_THEMEN.includes(String(wert)), `kein Scheinausschuss aus ${feld}: ${wert}`);
  }
}
const merzQuelle = (merzDatensatz.profil.offizielleQuellen || []).find((x) => x.art === "kanzler-richtlinienkompetenz");
a.ok(merzQuelle, "amtliche Bundesregierungs-Quelle fehlt in profil.offizielleQuellen");
a.equal(merzQuelle.url, merzDatensatz.merzQuittung.quelle.url);
a.equal(merzQuelle.sha256, merzDatensatz.merzQuittung.quelle.sha256);
a.equal(merzDatensatz.feldbelege.themen.includes("Richtlinien der Regierungspolitik"), true,
  "der Themenfeldbeleg nennt das enge Thema");
// Echter Verlustfreiheitspfad (keine DB, kein Netz): Thema, Rolle und Kennzeichnung.
const gespeichertMerz = zuHelmutProfil(merzDatensatz.profil);
a.deepEqual(gespeichertMerz.focusTopics, MERZ_THEMEN, "Importpfad muss das Thema erhalten");
a.ok(gespeichertMerz.function.includes(merzHinweis), "Herkunftshinweis muss den Importpfad erreichen");
a.ok(gespeichertMerz.function.includes("Bundeskanzler"), "bestehende Rolle bleibt im Importpfad");
const zeileMerz = storage.toMandateProfileRow(gespeichertMerz);
a.equal(zeileMerz.aktiv, false, "Storage-Zeile darf nicht aktivieren");
const gelesenMerz = storage.fromMandateProfileRow({ id: merzDatensatz.kanonischeKennung, name: merzDatensatz.profil.vollname }, zeileMerz);
a.deepEqual(gelesenMerz.focusTopics, MERZ_THEMEN, "Thema uebersteht den Storage-Roundtrip");
a.ok(gelesenMerz.function.includes(merzHinweis), "Hinweis uebersteht den Storage-Roundtrip");
a.ok(gelesenMerz.function.includes("Bundeskanzler"), "Kanzlerrolle uebersteht den Storage-Roundtrip");
a.equal(gelesenMerz.profileActive, false, "Round-Trip bleibt aktiv=false");
{
  const { proximityScore, personalRelevance } = require("../lib/helmut/scoring");
  a.ok(proximityScore({ tags: ["Richtlinien der Regierungspolitik"] }, { focusTopics: gelesenMerz.focusTopics }) > 0,
    "das exakte Merz-Thema Richtlinien der Regierungspolitik muss treffen");
  a.ok(personalRelevance({ themen: ["Richtlinien der Regierungspolitik"], status: "neu", source_document_count: 1 }, { focusTopics: gelesenMerz.focusTopics }).score > 0,
    "der echte Lage-/Relevanzpfad muss fuer Richtlinien der Regierungspolitik positives Signal liefern");
  // Negative Gegenproben: die Nachbar-Abschnitte des Artikels und allgemeine Ressort-/
  // Koalitions-/Ministeriumsthemen duerfen NICHT treffen.
  for (const fremd of ["Ressort-Prinzip", "Regierungs-Koalition", "Vize-Kanzler", "Regierungs-Verantwortung",
    "Geschäfts-Ordnung", "Regierungs-Bildung", "Koalition", "Ressort", "Ministerium", "Krieg", "Wahl", "Gesetz"]) {
    a.equal(proximityScore({ tags: [fremd] }, { focusTopics: gelesenMerz.focusTopics }), 0,
      `fremdes Thema darf nicht treffen: ${fremd}`);
    a.equal(personalRelevance({ themen: [fremd], status: "neu", source_document_count: 1 }, { focusTopics: gelesenMerz.focusTopics }).score, 0,
      `fremdes Thema darf im Lage-/Relevanzpfad nicht treffen: ${fremd}`);
  }
}

// ── 6q · Woidke-Einzelfall: Landesrichtlinienkompetenz verlustfrei, inaktiv ──────
a.equal(woidkeProfil.length, 1, "genau ein Profil traegt die Woidke-Einzelfallquittung");
const woidkeDatensatz = woidkeProfil[0];
const woidkeEintrag = woidkeByKennung.get("landtag-brandenburg-11263");
const WOIDKE_THEMEN = ["Richtlinien der Landespolitik"];
const woidkeHinweis = woidkeEintrag.ableitungsHinweis;
a.equal(woidkeDatensatz.kanonischeKennung, "landtag-brandenburg-11263");
a.deepEqual(woidkeDatensatz.profil.themen, WOIDKE_THEMEN, "genau das eine freigegebene Thema");
a.ok(!woidkeDatensatz.offeneFelder.includes("fachlicheAchse"), "Woidke-Achse ist geschlossen");
a.deepEqual(woidkeDatensatz.offeneFelder, ["regionbezug"], "nur der unveraenderte Regionbezug bleibt offen");
a.equal(woidkeDatensatz.profil.aktiv, false, "Woidke bleibt aktiv=false");
a.equal(woidkeDatensatz.importfreigegeben, false, "Woidke bleibt importfreigegeben=false");
a.equal(woidkeDatensatz.woidkeQuittung.person, "Dr. Dietmar Woidke");
a.equal(woidkeDatensatz.woidkeQuittung.funktion, "Ministerpräsident des Landes Brandenburg");
a.equal(woidkeDatensatz.woidkeQuittung.quelle.url,
  "https://brandenburg.de/cms/detail.php/bb1.c.481693.de");
a.equal(woidkeDatensatz.woidkeQuittung.quelle.sha256,
  "0b1a81e7893e4ff45ccdd97e2e1b3498d2862a435550e18b750be8ef00991516");
a.ok(woidkeDatensatz.woidkeQuittung.aufgabenabsatz.startsWith(
  "Der Ministerpräsident bestimmt die Richtlinien der Landespolitik"));
a.equal((woidkeDatensatz.profil.funktionen || []).filter((x) => x === woidkeHinweis).length, 1,
  "Woidke: Herkunftshinweis genau einmal");
a.ok((woidkeDatensatz.profil.funktionen || []).includes("Ministerpräsident des Landes Brandenburg"),
  "bestehende Rolle bleibt erhalten");
const woidkeQuelle = (woidkeDatensatz.profil.offizielleQuellen || [])
  .find((x) => x.art === "ministerpraesident-richtlinienkompetenz");
a.ok(woidkeQuelle, "amtliche Staatskanzlei-Quelle fehlt");
a.equal(woidkeQuelle.sha256, woidkeDatensatz.woidkeQuittung.quelle.sha256);
const gespeichertWoidke = zuHelmutProfil(woidkeDatensatz.profil);
a.deepEqual(gespeichertWoidke.focusTopics, WOIDKE_THEMEN, "Importpfad muss das Thema erhalten");
a.ok(gespeichertWoidke.function.includes(woidkeHinweis), "Hinweis erreicht den Importpfad");
const zeileWoidke = storage.toMandateProfileRow(gespeichertWoidke);
a.equal(zeileWoidke.aktiv, false, "Storage-Zeile darf nicht aktivieren");
const gelesenWoidke = storage.fromMandateProfileRow(
  { id: woidkeDatensatz.kanonischeKennung, name: woidkeDatensatz.profil.vollname }, zeileWoidke);
a.deepEqual(gelesenWoidke.focusTopics, WOIDKE_THEMEN, "Thema uebersteht den Storage-Roundtrip");
a.equal(gelesenWoidke.profileActive, false, "Round-Trip bleibt aktiv=false");
{
  const { proximityScore, personalRelevance } = require("../lib/helmut/scoring");
  a.ok(proximityScore({ tags: WOIDKE_THEMEN }, { focusTopics: gelesenWoidke.focusTopics }) > 0,
    "das exakte Woidke-Thema muss treffen");
  a.ok(personalRelevance({ themen: WOIDKE_THEMEN, status: "neu", source_document_count: 1 },
    { focusTopics: gelesenWoidke.focusTopics }).score > 0, "der Relevanzpfad muss positiv sein");
  for (const fremd of ["Staatskanzlei", "Demografischer Wandel", "Pressearbeit", "Internationale Beziehungen",
    "Kabinettsangelegenheiten", "Landtagsangelegenheiten"]) {
    a.equal(proximityScore({ tags: [fremd] }, { focusTopics: gelesenWoidke.focusTopics }), 0,
      `fremdes Staatskanzlei-Thema darf nicht treffen: ${fremd}`);
  }
}

// ── 6r · Wegner-Einzelfall: Richtlinien der Regierungspolitik verlustfrei, inaktiv ─────
// Kai Wegner wird ueber genau das erste Listenelement des amtlichen Geschaeftsbereichs I
// geschlossen. Es entsteht KEINE neue Rolle: die bestehende Rolle Regierender Buergermeister
// von Berlin aus der fortgeschriebenen Rollenquittung bleibt unveraendert. Person/Amt stammen nur aus dem
// sichtbaren eigenen Artikel der amtlichen Berliner Senatsseite; alle uebrigen
// Listenelemente des Geschaeftsbereichs bleiben ausgeschlossen.
a.equal(wegnerProfil.length, 1, "genau ein Profil traegt die Wegner-Einzelfallquittung");
const wegnerDatensatz = wegnerProfil[0];
const wegnerEintrag = wegnerByKennung.get("landtag-berlin-kai-wegner");
const WEGNER_THEMEN = ["Richtlinien der Regierungspolitik"];
const wegnerHinweis = wegnerEintrag.ableitungsHinweis;
a.equal(wegnerDatensatz.kanonischeKennung, "landtag-berlin-kai-wegner");
a.deepEqual(wegnerDatensatz.profil.themen, WEGNER_THEMEN, "genau das eine freigegebene Thema");
a.ok(!wegnerDatensatz.offeneFelder.includes("fachlicheAchse"), "Wegner-Achse ist geschlossen");
a.deepEqual(wegnerDatensatz.offeneFelder, [], "keine weiteren offenen Felder fuer Kai Wegner");
a.equal(wegnerDatensatz.profil.aktiv, false, "Wegner bleibt aktiv=false");
a.equal(wegnerDatensatz.importfreigegeben, false, "Wegner bleibt importfreigegeben=false");
a.equal(wegnerDatensatz.wegnerQuittung.person, "Kai Wegner");
a.equal(wegnerDatensatz.wegnerQuittung.funktion, "Regierender Bürgermeister von Berlin");
a.equal(wegnerDatensatz.wegnerQuittung.quelle.url,
  "https://www.berlin.de/rbmskzl/politik/senat/geschaeftsverteilung/");
a.equal(wegnerDatensatz.wegnerQuittung.quelle.sha256,
  "d729a2ebd65b3b379fc0420292b4993d6b903a33182980f4f44165e250bd2c5c");
a.equal(wegnerDatensatz.wegnerQuittung.quelle.bytes, 206915);
a.equal(wegnerDatensatz.wegnerQuittung.personenquelle.url,
  "https://www.berlin.de/rbmskzl/politik/senat/senatsmitglieder/");
a.equal(wegnerDatensatz.wegnerQuittung.personenquelle.sha256,
  "d35a4e8878b1a9cf8474b2f7f9ea0332b08a9ed59e64f51f791c4d5394ae8bf6");
a.ok(wegnerDatensatz.wegnerQuittung.aufgabenabsatz.startsWith(
  "Bestimmung und Fortentwicklung sowie Überwachung der Einhaltung der Richtlinien der Regierungspolitik"));
a.equal((wegnerDatensatz.profil.funktionen || []).filter((x) => x === wegnerHinweis).length, 1,
  "Wegner: Herkunftshinweis genau einmal");
a.ok((wegnerDatensatz.profil.funktionen || []).includes("Regierender Bürgermeister von Berlin"),
  "bestehende Rolle bleibt erhalten");
const wegnerRollenEintrag = rollenByKennung.get("landtag-berlin-kai-wegner");
a.equal(wegnerDatensatz.wegnerQuittung.rollenquelle.url, wegnerRollenEintrag.quelle.url,
  "Rollenquelle bleibt die kanonische Landtags-Person");
a.equal(wegnerDatensatz.wegnerQuittung.rollenquelle.sha256, wegnerRollenEintrag.quelle.sha256);
a.equal(wegnerDatensatz.quelle.url, wegnerRollenEintrag.quelle.url, "Quell-URL bleibt an die amtliche Personenquelle gebunden");
const wegnerQuelle = (wegnerDatensatz.profil.offizielleQuellen || [])
  .find((x) => x.art === "regierender-buergermeister-richtlinienkompetenz");
a.ok(wegnerQuelle, "amtliche Geschaeftsverteilungs-Quelle fehlt");
a.equal(wegnerQuelle.sha256, wegnerDatensatz.wegnerQuittung.quelle.sha256);
const gespeichertWegner = zuHelmutProfil(wegnerDatensatz.profil);
a.deepEqual(gespeichertWegner.focusTopics, WEGNER_THEMEN, "Importpfad muss das Thema erhalten");
a.ok(gespeichertWegner.function.includes(wegnerHinweis), "Hinweis erreicht den Importpfad");
a.ok(gespeichertWegner.function.includes("Regierender Bürgermeister von Berlin"),
  "bestehende Rolle uebersteht den Importpfad");
const zeileWegner = storage.toMandateProfileRow(gespeichertWegner);
a.equal(zeileWegner.aktiv, false, "Storage-Zeile darf nicht aktivieren");
const gelesenWegner = storage.fromMandateProfileRow(
  { id: wegnerDatensatz.kanonischeKennung, name: wegnerDatensatz.profil.vollname }, zeileWegner);
a.deepEqual(gelesenWegner.focusTopics, WEGNER_THEMEN, "Thema uebersteht den Storage-Roundtrip");
a.equal(gelesenWegner.profileActive, false, "Round-Trip bleibt aktiv=false");
{
  const { proximityScore, personalRelevance } = require("../lib/helmut/scoring");
  a.ok(proximityScore({ tags: WEGNER_THEMEN }, { focusTopics: gelesenWegner.focusTopics }) > 0,
    "das exakte Wegner-Thema muss treffen");
  a.ok(personalRelevance({ themen: WEGNER_THEMEN, status: "neu", source_document_count: 1 },
    { focusTopics: gelesenWegner.focusTopics }).score > 0, "der Relevanzpfad muss positiv sein");
  for (const fremd of ["Geschäftsverteilung des Senats", "Presseangelegenheiten", "Verkündung von Gesetzen",
    "Smart-City", "Klimaschutz", "Europapolitik", "Wohnungsbau", "Open Data", "Koalitionsvertrag",
    "Staatskanzlei", "Senatskanzlei", "Digitalisierung der Verwaltung"]) {
    a.equal(proximityScore({ tags: [fremd] }, { focusTopics: gelesenWegner.focusTopics }), 0,
      `breites Nachbarthema darf nicht treffen: ${fremd}`);
    a.equal(personalRelevance({ themen: [fremd], status: "neu", source_document_count: 1 },
      { focusTopics: gelesenWegner.focusTopics }).score, 0,
      `breites Nachbarthema darf im Lage-/Relevanzpfad nicht treffen: ${fremd}`);
  }
}

// ── 6o · Stellvertretungsquittung Brandenburg: 81 belegte Verluste, nur eine offene Achse ──
// Der belegte Verlust stellvertretender Brandenburger Ausschussmitgliedschaften wird
// ueber die versionierte Ergaenzungsquittung behoben: 81 bislang fehlende
// Stellvertretungen bei 37 der 50 kanonischen Landtagsprofile aus dem amtlichen
// Fachausschussindex 25220 und seinen 14 verlinkten Ausschussseiten. Nur die eigene
// geschlossene Stellvertretungsspalte zaehlt; ordentliche Ausschuesse, Partei,
// Fraktion, Funktionen, Themen und Mandatsart bleiben unveraendert. Genau eine zuvor
// offene fortgeschriebene Fachachse (Skopec) schliesst sich darueber; die uebrigen 36 Profile
// werden nur vollstaendiger. Die Originalbindung der Feldbeleg-JSON wird zusaetzlich
// vom Python-Gegenproben-Test (profil-feldbelege-500-unit.py) synthetisch geprueft.
const stv = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "betrieb", "brandenburg-stellvertretungen-76-20260927.json"), "utf8"));
a.equal(stv.bilanz.gesamt, 81, "81 belegte Stellvertretungen");
a.equal(stv.bilanz.zielprofile, 37, "37 Zielprofile");
a.equal(stv.bilanz.quellen, 14, "14 amtliche Ausschussseiten");
a.equal(stv.bilanz.mitStellvertretungsspalte, 13, "13 Seiten mit eigener Stellvertretungsspalte");
a.equal(stv.bilanz.ohneStellvertretungsspalte, 1, "genau der Unterausschuss 23893 ohne Spalte");
a.equal(stv.index.url, "https://www.landtag.brandenburg.de/de/parlament/ausschuesse_gremien_europa/fachausschuesse/25220", "amtlicher Index 25220");
a.equal(stv.index.sha256, "e38a080df89fb5aa5f6819cdf30a0c84d1133402fb58c13035b4585c76949551", "Index-Hash gebunden");
a.equal(stv.index.bytes, 102254, "Index-Bytezahl gebunden");
a.equal(stv.index.abrufStatus, "abgerufen", "Index erfolgreich abgerufen");
a.equal(stv.quellen.length, 14, "vollstaendige Menge der 14 Quellen");
const stvNull = stv.quellen.filter((q) => q.stellvertretendeSpalten === 0);
a.deepEqual(stvNull.map((q) => q.url),
  ["https://www.landtag.brandenburg.de/de/fachausschuss/unterausschuss_des_ausschusses_fuer_haushaltskontrolle/23893"],
  "nur der Unterausschuss 23893 ist der belegte Nullfall ohne Stellvertretungsspalte");
for (const q of stv.quellen) {
  a.ok(q.h1 && q.h1.trim().length > 0, `H1 fehlt (${q.datei})`);
  a.ok(q.url.startsWith("https://www.landtag.brandenburg.de/de/fachausschuss/"), `amtlicher Fachausschusshost (${q.datei})`);
  a.match(q.sha256, /^[0-9a-f]{64}$/, `Quellhash (${q.datei})`);
  a.ok(q.bytes > 0 && q.abrufStatus === "abgerufen" && q.http === 200 && q.finalUrl === q.url, `Abrufmetadaten (${q.datei})`);
  a.ok([0, 1].includes(q.stellvertretendeSpalten), `Spaltenzahl 0/1 (${q.datei})`);
}
// Slug "landesentwicklung" vs. H1 "Landesplanung": exakter belegter H1, keine Umbenennung.
const stvInfra = stv.quellen.find((q) => q.datei === "bb-ail-mitglieder-20260927.html");
a.ok(stvInfra.url.includes("landesentwicklung") && stvInfra.h1 === "Ausschuss für Infrastruktur und Landesplanung",
  "Infrastruktur: H1 Landesplanung, obwohl der URL-Slug landesentwicklung lautet");
const stvPaare = new Set();
let stvMitgliedschaften = 0;
for (const e of stv.ergebnisse) {
  a.equal(e.parlament, "landtag-brandenburg", `Parlament (${e.kennung})`);
  a.ok(e.person && e.gruppe, `Person und Fraktion/Fraktionslosigkeit (${e.kennung})`);
  a.ok(e.mitgliedschaften.length >= 1, `mindestens eine Stellvertretung (${e.kennung})`);
  a.ok(e.personenquelle.url.startsWith("https://www.landtag.brandenburg.de/de/")
    && e.personenquelle.finalUrl === e.personenquelle.url
    && e.personenquelle.http === 200 && e.personenquelle.abrufStatus === "abgerufen",
    `kanonische Personenquelle gebunden (${e.kennung})`);
  stvMitgliedschaften += e.mitgliedschaften.length;
  for (const m of e.mitgliedschaften) {
    a.equal(m.rolle, "Stellvertretendes Mitglied", `nur stellvertretend, nie ordentlich/Vorsitz (${e.kennung})`);
    a.equal(m.personenlink, e.personenquelle.url, `Personenlink = kanonische Personen-URL (${e.kennung})`);
    a.ok(m.quelleSha256 && m.quelleUrl.startsWith("https://www.landtag.brandenburg.de/de/fachausschuss/"),
      `Mitgliedschaftsquelle gebunden (${e.kennung})`);
    stvPaare.add(`${e.kennung}\u0000${m.ausschuss}`);
  }
}
a.equal(stv.ergebnisse.length, 37, "genau 37 Profilergebnisse");
a.equal(stvMitgliedschaften, 81, "genau 81 Mitgliedschaften");
a.equal(stvPaare.size, 81, "genau 81 eindeutige (Profil, Ausschuss)-Paare");
const bbKennungen = new Set(datensaetze.filter((d) => d.parlament === "landtag-brandenburg").map((d) => d.kanonischeKennung));
a.equal(bbKennungen.size, 50, "50 kanonische Brandenburger Zielprofile");
for (const e of stv.ergebnisse) a.ok(bbKennungen.has(e.kennung), `Kennung ausserhalb der 50 (${e.kennung})`);
a.ok(!stv.ergebnisse.some((e) => /afd/i.test(e.gruppe)), "keine AfD-Stellvertretung");
// Die Quittung deckt sich mit den ausgelieferten Datensaetzen und befoerdert nie.
let stvGeaendert = 0;
for (const d of datensaetze) {
  const q = d.stellvertretungenQuittung;
  if (!q) { continue; }
  stvGeaendert += 1;
  const erwartet = stv.ergebnisse.find((e) => e.kennung === d.kanonischeKennung);
  a.ok(erwartet, `Quittungseintrag fehlt (${d.kanonischeKennung})`);
  a.deepEqual([...d.profil.stellvertretendeAusschuesse].sort(),
    erwartet.mitgliedschaften.map((m) => m.ausschuss).slice().sort(), `nur die belegten Stellvertretungen (${d.kanonischeKennung})`);
  for (const m of erwartet.mitgliedschaften) {
    a.ok(!(d.profil.ausschuesse || []).includes(m.ausschuss), `keine Aufwertung zu ordentlich (${m.ausschuss})`);
  }
  a.ok(typeof d.feldbelege.stellvertretendeAusschuesse === "string" && d.feldbelege.stellvertretendeAusschuesse.length > 0,
    `Feldbeleg der Stellvertretungen fehlt (${d.kanonischeKennung})`);
  a.ok(!d.profil.themen, `keine erfundenen Themen (${d.kanonischeKennung})`);
  a.equal(d.profil.aktiv, false, `aktiv=false (${d.kanonischeKennung})`);
  a.equal(d.importfreigegeben, false, `importfreigegeben=false (${d.kanonischeKennung})`);
  a.equal(q.datei, "docs/betrieb/brandenburg-stellvertretungen-76-20260927.json", "Quittungsdatei gebunden");
  a.equal(q.person, erwartet.person, "Quittungsperson gebunden");
  a.equal(q.gruppe, erwartet.gruppe, "Fraktion/Fraktionslosigkeit gebunden");
  a.equal(q.personenquelle.url, d.quelle.url, "Personenquelle = kanonische Person");
  a.equal(q.personenquelle.sha256, d.quelle.sha256, "Profilhash gebunden");
  a.equal(q.mitgliedschaften.length, erwartet.mitgliedschaften.length, "Mitgliedschaften vollstaendig");
}
a.equal(stvGeaendert, 37, "genau 37 Datensaetze tragen die Stellvertretungsquittung (463 unveraendert)");
a.ok(datensaetze.filter((d) => d.stellvertretungenQuittung).every((d) => d.parlament === "landtag-brandenburg"),
  "nur brandenburgische Profile");
// Positiver Ankerfall Skopec: zwei Stellvertretungen, keine ordentliche Liste, Achse geschlossen.
const skopecStv = datensaetze.find((d) => d.kanonischeKennung === "landtag-brandenburg-40629");
a.deepEqual(skopecStv.profil.stellvertretendeAusschuesse,
  ["Ausschuss für Infrastruktur und Landesplanung", "Ausschuss für Wissenschaft, Forschung und Kultur"],
  "Skopec: Wissenschaft/Forschung/Kultur und Infrastruktur/Landesplanung");
a.ok(!skopecStv.profil.ausschuesse, "Skopec hat keine ordentliche Mitgliedschaft");
a.ok(!skopecStv.offeneFelder.includes("fachlicheAchse"), "Skopecs Achse ist ueber die Stellvertretung geschlossen");
a.equal(skopecStv.offeneFelder.length, 0, "Skopec ist vollstaendig geschlossen");
a.equal(skopecStv.profil.fraktionslos, true, "Skopec bleibt fraktionslos (keine alte BSW-Rolle)");
a.ok(!skopecStv.profil.fraktion && !skopecStv.profil.partei, "keine Fraktions-/Parteiumdeutung");
// Echter Import-/Storage-/Paketpfad fuer Brandenburg: getrennt, verlustfrei, inaktiv.
const pakete = require("../lib/helmut/quellenarchitektur/profile-packages.js");
const stvStichproben = [skopecStv, datensaetze.find((x) => x.stellvertretungenQuittung && x.kanonischeKennung !== "landtag-brandenburg-40629")];
for (const d of stvStichproben) {
  const gespeichert = zuHelmutProfil(d.profil);
  a.deepEqual(gespeichert.deputyCommittees, d.profil.stellvertretendeAusschuesse, `Stellvertretungen erreichen den Importpfad (${d.kanonischeKennung})`);
  a.deepEqual(gespeichert.committees, d.profil.ausschuesse || [], `ordentliche Ausschuesse unveraendert (${d.kanonischeKennung})`);
  a.equal(gespeichert.profileActive, false, "Import aktiviert nie");
  const zeile = storage.toMandateProfileRow(gespeichert);
  a.equal(zeile.aktiv, false, "Storage-Zeile darf nicht aktivieren");
  a.deepEqual(zeile.stellvertretende_ausschuesse, d.profil.stellvertretendeAusschuesse, "Storage-Zeile traegt die Stellvertretungen");
  const gelesen = storage.fromMandateProfileRow({ id: d.kanonischeKennung, name: d.profil.vollname }, zeile);
  a.deepEqual(gelesen.deputyCommittees, d.profil.stellvertretendeAusschuesse, "Storage-Roundtrip erhaelt die Stellvertretungen");
  a.equal(gelesen.profileActive, false, "Round-Trip bleibt aktiv=false");
  const paketeGelesen = pakete.resolveProfilePackages(gelesen);
  a.ok(paketeGelesen.required.includes("bund-basis") && paketeGelesen.required.includes("brandenburg-basis"),
    `Brandenburg-Paketpfad: bund-basis und brandenburg-basis (${d.kanonischeKennung})`);
}

// ── 7 · Reproduzierbarkeit (nur mit lokalen Arbeitsdateien + python3) ────────────────────
let reproduzierbar = "uebersprungen (lokale Eingangsdateien oder python3 fehlen)";
const eingangVorhanden = fs.existsSync(path.join(STANDARD_EINGANG, "bundestagsprofile-330-abruf.json"))
  && fs.existsSync(path.join(STANDARD_EINGANG, "landesprofile-170-abruf.json"))
  // Der Assembler bindet die Pistorius-Parteizusatzquittung fail closed an das private
  // SPD-Original; ohne dieses laeuft die byte-identische Neuerzeugung bewusst nicht.
  && fs.existsSync("/private/tmp/helmut-spd-ueber-uns-20260928.html");
const python = spawnSync("python3", ["--version"], { encoding: "utf8" }).status === 0;
if (python) {
  const gegenprobe = spawnSync("python3", ["-B", path.join(__dirname, "profil-feldbelege-500-unit.py")], { encoding: "utf8" });
  a.equal(gegenprobe.status, 0, `Partei-Gegenprobe fehlgeschlagen: ${gegenprobe.stderr}`);
  const fraktionsgegenprobe = spawnSync("python3", ["-B", path.join(__dirname, "profil-feldbelege-500-fraktionsvorsitz-test.py")], { encoding: "utf8" });
  a.equal(fraktionsgegenprobe.status, 0, `Fraktionsvorsitz-Gegenprobe fehlgeschlagen: ${fraktionsgegenprobe.stderr}`);
  a.match(fraktionsgegenprobe.stdout, /PASS/, "Fraktionsvorsitz-Gegenprobe muss PASS melden");
  // Gezielte Node-Gegenprobe des Pistorius-Validators, ausdruecklich OHNE privates Original:
  // der Validator muss fail closed abbrechen und niemals still einen Parteiwert liefern.
  const fehlend = spawnSync("python3", ["-B", path.join(__dirname, "profil-feldbelege-500-pistorius.py"),
    "--original", path.join(os.tmpdir(), `helmut-pistorius-fehlt-${process.pid}.html`)], { encoding: "utf8" });
  a.notEqual(fehlend.status, 0, "Pistorius-Validator muss ohne privates Original fail closed abbrechen");
  a.match(fehlend.stderr, /Original fehlt/, "fehlendes Original muss benannt werden");
  // Mit privatem Original (nur wenn vorhanden) traegt die versionierte Quittung.
  if (fs.existsSync("/private/tmp/helmut-spd-ueber-uns-20260928.html")) {
    const mitOriginal = spawnSync("python3", ["-B", path.join(__dirname, "profil-feldbelege-500-pistorius.py")], { encoding: "utf8" });
    a.equal(mitOriginal.status, 0, `Pistorius-Validator mit Original fehlgeschlagen: ${mitOriginal.stderr}`);
    a.match(mitOriginal.stdout, /SPD/, "Pistorius-Validator muss SPD liefern");
  }
  // Gezielte Gegenprobe des Partei-Zusatzvalidators (Otte/Gohlke/Valent): die
  // versionierte Quittung wird ohne Drift akzeptiert; manipulierte Person und
  // unvollstaendige Quittung sperren fail closed. Der Validator bindet die kanonische
  // Profilquelle UND die getrennte offizielle Partei-Quelle.
  const zusatzValidator = path.join(__dirname, "profil-feldbelege-500-parteizusatz.py");
  a.ok(fs.existsSync(zusatzValidator), "Partei-Zusatzvalidator fehlt");
  const zusatzQuittungPfad = path.join(ROOT, "docs", "betrieb", "parteifelder-zusatz-3-20260928.json");
  const zusatzProbe = (mutation) => spawnSync("python3", ["-B", "-c",
    "import importlib.util,json,sys\n"
    + "spec=importlib.util.spec_from_file_location('parteizusatz', sys.argv[1])\n"
    + "modul=importlib.util.module_from_spec(spec); spec.loader.exec_module(modul)\n"
    + "quittung=json.load(open(sys.argv[2], encoding='utf-8'))\n"
    + "exec(sys.argv[3])\n"
    + "abrufe={e['kennung']: {'url': e['profilQuelle']['url'], 'sha256': e['profilQuelle']['sha256'],"
    + " 'bytes': e['profilQuelle']['bytes'], 'datei': e['profilQuelle']['datei'],"
    + " 'text': ', '.join(e['person'].split()[::-1])} for e in quittung['ergebnisse']}\n"
    + "index=modul.pruefe_parteizusatz({}, quittung, abrufe)\n"
    + "print('OK', json.dumps({k: v['partei'] for k, v in index.items()}, ensure_ascii=False, sort_keys=True))\n",
    zusatzValidator, zusatzQuittungPfad, mutation], { encoding: "utf8" });
  a.notEqual(zusatzProbe("quittung['ergebnisse'][0]['person']='Erfundene Person'").status, 0,
    "Zusatzvalidator muss Personendrift fail closed ablehnen");
  a.notEqual(zusatzProbe("quittung['ergebnisse']=quittung['ergebnisse'][:2]; quittung['umfang']=2").status, 0,
    "Zusatzvalidator muss unvollstaendige Quittung fail closed ablehnen");
  // Positiv nur mit den lokalen Originalquellen (kein Netz); sonst bleibt es beim Negativnachweis.
  if (fs.existsSync(path.join(STANDARD_EINGANG, "zusatzquellen", "gruene-nds-parteirat-20260928.html"))
    && fs.existsSync(path.join(STANDARD_EINGANG, "zusatzquellen", "linke-bayern-bundestag-20260928.html"))) {
    const zusatzGueltig = zusatzProbe("pass");
    a.equal(zusatzGueltig.status, 0, `Zusatzvalidator muss die gueltige Quittung akzeptieren: ${zusatzGueltig.stderr}`);
    a.match(zusatzGueltig.stdout, /Bündnis 90\/Die Grünen/, "Zusatzvalidator muss Otte als Gruene liefern");
    a.match(zusatzGueltig.stdout, /Die Linke/, "Zusatzvalidator muss Gohlke/Valent als Linke liefern");
  }
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

console.log("PASS: 500 Feldbelege, 330/120/50, Hashbindung, AfD-Sperre, "
  + "echter Importvertrag (500 technisch importierbar, 0 Achsen-/Mandatsluecken), "
  + "12 gleichgruppige Ersatzprofile amtlich gebunden, "
  + "Bundestags-Readiness (330/330), alle Profile inaktiv, Reproduzierbarkeit: " + reproduzierbar);
