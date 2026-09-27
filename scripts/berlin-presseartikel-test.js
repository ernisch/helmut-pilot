"use strict";

// Helmut — gezielter Offline-Test des strengen Berlin.de-Presseartikel-Parsers.
// =============================================================================================
// Prueft lib/helmut/berlin-presseartikel.js mit kleinen SYNTHETISCHEN Proben (Positiv + Negativ)
// sowie — falls vorhanden — gegen die lokale amtliche Originalprobe unter
// /private/tmp/helmut-landesversorgung-originale. Fehlt diese lokale Probe, laeuft der Test
// weiterhin vollstaendig (CI-Tauglichkeit ohne /private/tmp); dann wird das uebersprungen und
// ausdruecklich gemeldet.
//
// Erwartete Originalwerte (Quelle: be-bjf-kinder-jugendhilfe-pruefung.json):
//   Publikationstag 2026-09-25, Volltext sha256 6981f4be…, Textrumpf 4133 Zeichen.
//   Die amtliche .txt-Vorlage endet mit genau einem Zeilenumbruch; sha256 bindet die Vorlage
//   byteweise (6981f4be…), der belegte Zeichenwert 4133 zaehlt den Textrumpf OHNE diesen
//   abschliessenden Umbruch. Der Test prueft beide Angaben ausdruecklich.
//
// KEIN Netzwerk, KEINE DB, KEIN Modellaufruf. Aufruf: node scripts/berlin-presseartikel-test.js

const A = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const crypto = require("node:crypto");

const { VERSION, AUSGANG_FELDER, pruefePresseartikel } = require("../lib/helmut/berlin-presseartikel");

const ORIGINAL_DIR = "/private/tmp/helmut-landesversorgung-originale";
const BASIS = "be-bjf-kinder-jugendhilfe-20260925";
const BASIS_PRUEFUNG = "be-bjf-kinder-jugendhilfe";
const ERWARTET_SHA = "6981f4be2aba74e8a8372aa29f0317c8193596111bc2ea448e86b4302a64d24a";
const ERWARTET_TITEL = "Reform der Kinder- und Jugendhilfe: Berlin fordert verbindlichen Fahrplan und verlässliche Finanzierung";
const ORIGINAL_URL = "https://www.berlin.de/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php";
const sha256 = value => crypto.createHash("sha256").update(value, "utf8").digest("hex");

A.equal(VERSION, "berlin-presseartikel-v1");

// ---------------------------------------------------------------------------------------------
// Synthetische Probe in der echten Berlin.de-Struktur (Herounit, maincontent, marginal, textile).
// ---------------------------------------------------------------------------------------------
function dmY(iso) { const [j, m, t] = iso.split("-"); return `${t}.${m}.${j}`; }

function seite(optionen = {}) {
  const datum = optionen.datum || "2026-09-25";
  const jahr = optionen.jahr || datum.slice(0, 4);
  const titel = optionen.titel === undefined ? "Reform der Kinder- und Jugendhilfe: Berlin fordert einen Fahrplan" : optionen.titel;
  const dateiname = optionen.dateiname || "pressemitteilung.1718345.php";
  const host = optionen.host || "www.berlin.de";
  const canonical = optionen.canonical || `https://${host}/sen/bjf/service/presse/pressearchiv-${jahr}/${dateiname}`;
  const pmDatum = optionen.pmDatum || dmY(datum);
  const absaetze = optionen.absaetze || ["Erster Absatz der Meldung.", "Zweiter Absatz der Meldung."];
  const herounit = optionen.herounit === undefined ? `<h1 class="title">${titel}</h1>` : optionen.herounit;
  const sectionInhalt = optionen.sectionInhalt === undefined
    ? `<div class="text"><div class="textile">${absaetze.map(absatz => `<p>${absatz}</p>`).join("")}</div></div>`
    : optionen.sectionInhalt;
  const pressnumber = optionen.pressnumber === undefined
    ? `<p class="pressnumber">Pressemitteilung vom ${pmDatum}</p>` : optionen.pressnumber;
  const meta = optionen.meta === undefined
    ? `<meta name="dcterms.date" content="${datum}"><meta name="dcterms.title" content="${titel}">` : optionen.meta;
  const canonicalTag = optionen.canonicalTag === undefined
    ? `<link rel="canonical" href="${canonical}">` : optionen.canonicalTag;
  const marginal = optionen.marginal === undefined
    ? `<div id="layout-grid__area--marginal" role="complementary"><div class="modul-contact"><div class="textile">Kontakt <a href="mailto:pressestelle@senbjf.berlin.de">E-Mail</a></div></div></div>`
    : optionen.marginal;
  const hauptteil = `<div id="layout-grid__area--maincontent">${pressnumber}`
    + `<section class="modul-text_bild  imagealignleft teaser ">${sectionInhalt}</section></div>`;
  const koerper = optionen.marginalZuerst ? `${marginal}${hauptteil}` : `${hauptteil}${marginal}`;
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">${meta}${canonicalTag}</head>`
    + `<body><div id="layout-grid__area--herounit">${herounit}</div>${koerper}</body></html>`;
  const eingabe = { url: optionen.url || canonical, finalUrl: optionen.finalUrl || canonical, http: optionen.http || 200, html };
  return { eingabe, canonical, datum, titel };
}

function erwarteAbbruch(eingabe, label) {
  A.throws(() => pruefePresseartikel(eingabe), error => /^berlin-presseartikel-/.test(error.message), `abgelehnt: ${label}`);
}

// 1) Positiv: genau ein amtlicher Hauptartikel, keine Uhrzeit im Ergebnis.
{
  const { eingabe, datum, titel } = seite();
  const ergebnis = pruefePresseartikel(eingabe);
  A.deepEqual(Object.keys(ergebnis), AUSGANG_FELDER);
  A.equal(Object.isFrozen(ergebnis), true);
  A.equal(ergebnis.url, eingabe.finalUrl);
  A.equal(ergebnis.titel, titel);
  A.equal(ergebnis.publikationstag, datum);
  A.match(ergebnis.publikationstag, /^\d{4}-\d{2}-\d{2}$/);
  A.equal(ergebnis.volltext, "Erster Absatz der Meldung.\n\nZweiter Absatz der Meldung.\n");
  A.equal(ergebnis.volltextHash, sha256(ergebnis.volltext));
  A.equal(ergebnis.htmlHash, sha256(eingabe.html));
  A.equal(Object.hasOwn(ergebnis, "publishedAt"), false);
  A.equal(Object.values(ergebnis).some(wert => typeof wert === "string" && /[T ]\d{2}:\d{2}/.test(wert)), false, "keine synthetische Uhrzeit");
  console.log("PASS Positivprobe: URL, Titel, Kalendertag, Volltext und Hashes ohne Uhrzeit");
}

// 2) Eingangs- und Adresspruefungen.
erwarteAbbruch({ ...seite().eingabe, http: 500 }, "http != 200");
erwarteAbbruch({ ...seite().eingabe, url: seite().canonical.replace("https://", "http://") }, "url ohne HTTPS");
erwarteAbbruch({ ...seite().eingabe, url: "https://www.berlin.de:8443/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php" }, "url mit Port");
erwarteAbbruch({ ...seite().eingabe, url: "https://www.berlin.de:443/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php" }, "expliziter Standardport");
erwarteAbbruch({ ...seite().eingabe, url: "https://user:pw@www.berlin.de/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php" }, "url mit Benutzerinfo");
erwarteAbbruch({ ...seite().eingabe, url: "https://www.berlin.example/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php" }, "fremder Host");
erwarteAbbruch(seite({ canonical: "https://www.berlin.de/sen/bjf/service/presse/presse-2026/pressemitteilung.1718345.php" }).eingabe, "Adresse ohne pressearchiv-Pfad");
erwarteAbbruch(seite({ dateiname: "meldung.1718345.php" }).eingabe, "Adresse ohne pressemitteilung.NNNN.php");
erwarteAbbruch({ ...seite().eingabe, publishedAt: "2026-09-25T13:05:00Z" }, "zusatzfeld publishedAt");
erwarteAbbruch({ url: ORIGINAL_URL, finalUrl: ORIGINAL_URL, http: 200 }, "fehlendes html");
console.log("PASS Eingang, HTTPS/Host/Port/Benutzerinfo und Archivpfad fail closed");

// 3) Kanonische und finale Adresse muessen uebereinstimmen.
{
  const opt = seite();
  erwarteAbbruch({ ...opt.eingabe, finalUrl: opt.canonical + "?utm=1" }, "finalUrl != canonical");
  erwarteAbbruch({ ...opt.eingabe, finalUrl: "https://berlin.de/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php" }, "finalUrl != canonical (Hostform)");
  erwarteAbbruch({ ...opt.eingabe, url: "https://www.berlin.de/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.999999.php" }, "Abrufadresse != finale Artikeladresse");
  erwarteAbbruch(seite({ canonicalTag: "" }).eingabe, "canonical fehlt");
  erwarteAbbruch(seite({ canonicalTag: `<link rel="canonical" href="https://www.berlin.de/x"><link rel="canonical" href="https://www.berlin.de/y">` }).eingabe, "canonical doppelt");
  erwarteAbbruch({ ...opt.eingabe, html: opt.eingabe.html.replace(/<link rel="canonical"[^>]*>/, "").replace("</body>", `<link rel="canonical" href="${opt.canonical}"></body>`) }, "canonical nur im body");
}
console.log("PASS Kanonische und finale Adresse exakt gebunden");

// 4) Eindeutiges dcterms.date und Jahr des pressearchiv-Pfads.
erwarteAbbruch(seite({ meta: `<meta name="dcterms.title" content="Titel ohne Datum">` }).eingabe, "dcterms.date fehlt");
erwarteAbbruch(seite({ meta: `<meta name="dcterms.date" content="2026-09-25"><meta name="dcterms.date" content="2026-09-25"><meta name="dcterms.title" content="T">` }).eingabe, "dcterms.date doppelt");
erwarteAbbruch(seite({ meta: `<meta name="dcterms.date" content="2026-13-40"><meta name="dcterms.title" content="T">` }).eingabe, "dcterms.date ungueltig");
erwarteAbbruch(seite({ meta: `<meta name="dcterms.date" content="2026-09-25T13:05:00Z"><meta name="dcterms.title" content="T">` }).eingabe, "dcterms.date mit Uhrzeit");
erwarteAbbruch(seite({ jahr: "2025" }).eingabe, "Archivjahr != Datumsjahr");
{
  const probe = seite();
  erwarteAbbruch({ ...probe.eingabe, html: probe.eingabe.html.replace('<meta name="dcterms.date" content="2026-09-25">', "").replace("</body>", '<meta name="dcterms.date" content="2026-09-25"></body>') }, "Datumsmetadatum nur im body");
}
console.log("PASS dcterms.date eindeutig, ohne Uhrzeit, Jahr an pressearchiv-Pfad gebunden");

// 5) Genau eine sichtbare eigene H1 im Herounit, im Einklang mit dcterms.title.
erwarteAbbruch(seite({ herounit: "" }).eingabe, "H1 fehlt");
erwarteAbbruch(seite({ herounit: `<h1 class="title">Anderer Titel</h1>` }).eingabe, "H1 != dcterms.title");
erwarteAbbruch(seite({ herounit: `<h1 class="title">T</h1><h1 class="title">T</h1>` }).eingabe, "zwei H1");
erwarteAbbruch(seite({ herounit: `<h1 class="title" hidden>${seite().titel}</h1>` }).eingabe, "versteckte H1");
erwarteAbbruch(seite({ herounit: `<!-- <h1 class="title">${seite().titel}</h1> --><h1 class="title">${seite().titel}</h1>` }).eingabe, "H1 im Kommentar (Doppler)");
erwarteAbbruch(seite({ herounit: `<script>document.write("<h1>${seite().titel}</h1>")</script><h1 class="title">${seite().titel}</h1>` }).eingabe, "H1 im Skript (Doppler)");
erwarteAbbruch(seite({ meta: `<meta name="dcterms.date" content="2026-09-25"><meta name="dcterms.title" content="X"><meta name="dcterms.title" content="Y">` }).eingabe, "dcterms.title doppelt");
console.log("PASS genau eine sichtbare eigene H1; Skript-, Kommentar- und versteckte Doppler abgelehnt");

// 6) Pressemitteilung vom Datum im maincontent, gebunden an dcterms.date.
erwarteAbbruch(seite({ pressnumber: "" }).eingabe, "Pressemitteilung vom fehlt");
erwarteAbbruch(seite({ pressnumber: `<p class="pressnumber">Pressemitteilung vom 24.09.2026</p>` }).eingabe, "Pressemitteilung vom abweichendes Datum");
erwarteAbbruch(seite({ pressnumber: `<p class="pressnumber">Pressemitteilung vom 25.09.2026</p><p class="pressnumber">Pressemitteilung vom 25.09.2026</p>` }).eingabe, "Pressemitteilung vom doppelt");
erwarteAbbruch(seite({ pressnumber: `<p>Einleitung: Pressemitteilung vom 25.09.2026</p>` }).eingabe, "Datum nur in freiem Absatz");
console.log("PASS Pressemitteilung vom Datum im maincontent eindeutig und an dcterms.date gebunden");

// 7) Genau eine geschlossene section.modul-text_bild vor marginal, ohne Kontaktblock.
erwarteAbbruch(seite({ sectionInhalt: `<div class="text"><div class="textile"><p>A</p>` }).eingabe, "section nicht geschlossen");
erwarteAbbruch(seite({ sectionInhalt: `<div class="text"><div class="textile"><p>A</p></div></div></section><section class="modul-text_bild"><div class="textile"><p>B</p></div></section>` }).eingabe, "zweite section.modul-text_bild");
erwarteAbbruch(seite({ sectionInhalt: `<div class="modul-contact"><div class="textile">Kontakt</div></div><div class="text"><div class="textile"><p>A</p></div></div>` }).eingabe, "Kontaktblock im Artikel");
erwarteAbbruch(seite({ sectionInhalt: `<div class="text"><div class="textile"><p>A</p></div><div class="textile"><p>B</p></div></div>` }).eingabe, "zwei div.textile im Artikel");
erwarteAbbruch(seite({ sectionInhalt: `<div class="text"><div class="textile"><p>A</p><ul><li>B</li></ul></div></div>` }).eingabe, "Fremdinhalt statt nur Absaetze");
erwarteAbbruch(seite({ sectionInhalt: `<div class="text"><div class="textile"><p>A</p><!-- <p>B</p> --><p>C</p></div></div>` }).eingabe, "Kommentar im textile");
erwarteAbbruch(seite({ sectionInhalt: `<div class="text"><div class="textile"><p>A</p><script>var x = 1;</script></div></div>` }).eingabe, "Skript im textile");
erwarteAbbruch(seite({ sectionInhalt: `<div class="text"><div class="textile"><p>A</p><p hidden>B</p></div></div>` }).eingabe, "versteckter Absatz");
erwarteAbbruch(seite({ sectionInhalt: `<div class="text"><div class="textile"><p>Gleich</p><p>Gleich</p></div></div>` }).eingabe, "Absatz-Doppler");
erwarteAbbruch(seite({ marginalZuerst: true }).eingabe, "section.modul-text_bild nicht vor marginal");
erwarteAbbruch(seite({ marginal: "" }).eingabe, "marginal fehlt");
console.log("PASS genau eine geschlossene section.modul-text_bild vor marginal, nur Absaetze ohne Kontaktblock");

// 8) Echte lokale Originalprobe (nur wenn vorhanden) — byteidentisch zum amtlichen Textbeleg.
{
  const htmlDatei = path.join(ORIGINAL_DIR, `${BASIS}.html`);
  const txtDatei = path.join(ORIGINAL_DIR, `${BASIS}.txt`);
  const pruefDatei = path.join(ORIGINAL_DIR, `${BASIS_PRUEFUNG}-pruefung.json`);
  if (fs.existsSync(htmlDatei) && fs.existsSync(txtDatei) && fs.existsSync(pruefDatei)) {
    const pruefung = JSON.parse(fs.readFileSync(pruefDatei, "utf8"));
    const html = fs.readFileSync(htmlDatei, "utf8");
    const vorlage = fs.readFileSync(txtDatei, "utf8");
    const ergebnis = pruefePresseartikel({ url: pruefung.quelle.url, finalUrl: pruefung.quelle.finalUrl,
      http: pruefung.quelle.http, html });
    A.equal(ergebnis.url, ORIGINAL_URL);
    A.equal(ergebnis.titel, ERWARTET_TITEL);
    A.equal(ergebnis.publikationstag, "2026-09-25");
    A.equal(ergebnis.volltext, vorlage, "Volltext muss der amtlichen .txt byteidentisch entsprechen");
    A.equal(ergebnis.volltextHash, ERWARTET_SHA);
    A.equal(ergebnis.volltextHash, sha256(vorlage));
    A.equal(ergebnis.volltext.replace(/\n$/, "").length, 4133, "amtlicher Zeichenwert ohne abschliessenden Umbruch");
    A.equal(pruefung.volltext.sha256, ERWARTET_SHA);
    A.equal(pruefung.volltext.zeichen, 4133);
    A.equal(Object.hasOwn(ergebnis, "publishedAt"), false);
    console.log(`PASS echte Originalprobe: ${ergebnis.volltext.replace(/\n$/, "").length} Zeichen, sha ${ergebnis.volltextHash.slice(0, 12)}..., Tag 2026-09-25`);
  } else {
    console.log("SKIP echte Originalprobe: /private/tmp/helmut-landesversorgung-originale nicht vorhanden (CI-tauglich)");
  }
}

console.log("PASS berlin-presseartikel-test abgeschlossen");
