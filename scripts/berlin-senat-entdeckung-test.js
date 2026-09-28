"use strict";

// Helmut — gezielter Offline-Test des strengen Berliner Senatsblock-Entdeckers.
// =============================================================================================
// Prueft lib/helmut/berlin-senat-entdeckung.js mit kleinen SYNTHETISCHEN Proben (Positiv +
// Negativ) sowie — falls vorhanden — gegen das lokale amtliche Original
// /private/tmp/helmut-berlin-portal-20260928.html (HTTP200, sha256 1cb44dda…fac8). Fehlen die
// lokalen Originale, laeuft der Test weiterhin vollstaendig (CI-tauglich ohne /private/tmp); die
// Originalproben werden dann uebersprungen und ausdruecklich gemeldet.
//
// Der Abruf in der Offline-Verkettung wird AUSNAHMSLOS injiziert: es gibt KEIN Netz, KEINE DB,
// KEIN Modell und KEINE Production-Daten. Aufruf:
//   node scripts/berlin-senat-entdeckung-test.js

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");

const M = require("../lib/helmut/berlin-senat-entdeckung");
const ABRUF = require("../lib/helmut/berlin-presseartikel-abruf");
const SONDER_ABRUF = require("../lib/helmut/berlin-presse-sondervorlagen-abruf");
const B = require("../lib/helmut/berlin-artikelstand");

let bestanden = 0;
function check(name, bedingung) {
  assert.ok(bedingung, name);
  bestanden += 1;
  console.log("OK " + name);
}
const H2_TEXT = M.H2_TEXT;
const QUELLE = "https://www.berlin.de/presse/";
const sha = value => crypto.createHash("sha256").update(value, "utf8").digest("hex");

// ---------------------------------------------------------------------------------------------
// Synthetische Portalseite in der beobachteten amtlichen Struktur.
// ---------------------------------------------------------------------------------------------
function li(datum, pfad, titel, optionen = {}) {
  const dateText = optionen.dateText === undefined ? `${datum} 13:05 Uhr` : optionen.dateText;
  const link = optionen.link === undefined ? `<a href="${pfad}" >${titel}</a>` : optionen.link;
  return `<li${optionen.liAttr || ""}><div class="cell date">${dateText}</div>`
    + `<div class="cell text">${link}<div class="category"> <strong>Behörde: </strong>`
    + `${optionen.behoerde || "Presse- und Informationsamt des Landes Berlin"}</div></div></li>`;
}
function bezirksBlock() {
  return `<section class="modul-text_bild"><h2 class="title" id="headline_1_6">Aktuelle Mitteilungen `
    + `der Bezirksämter</h2><div class="text"><div class="textile"><ul>`
    + `<li><a href="/presse/pressemitteilungen/index/search?institutions%5B%5D=Bezirksamt+Mitte">Bezirksamt Mitte</a></li>`
    + `</ul></div></div></section>`;
}
function portal(optionen = {}) {
  const h2 = optionen.h2 === undefined ? `<h2 class="title" id="headline_1_4">${H2_TEXT}</h2>` : optionen.h2;
  const lis = optionen.lis || [li("25.09.2026", "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php",
    "Reform der Kinder- und Jugendhilfe: Berlin fordert verbindlichen Fahrplan und verlässliche Finanzierung")];
  const ul = optionen.ul === undefined
    ? `<ul class="list--tablelist ruler  has-date">${lis.join("")}</ul>` : optionen.ul;
  const block = optionen.block === undefined
    ? `<div class="modul-rss_list block">${h2}<div class="inner">${ul}</div></div>` : optionen.block;
  const html = optionen.html !== undefined ? optionen.html
    : `<!doctype html><html lang="de"><head><meta charset="utf-8">`
      + `<meta name="dcterms.date" content="2026-09-28"><link rel="canonical" href="${QUELLE}"></head>`
      + `<body><div id="page-wrapper"><div id="layout-grid__area--maincontent">`
      + `${block}${bezirksBlock()}</div></div></body></html>`;
  return { html, eingabe: { url: QUELLE, finalUrl: QUELLE, http: 200, html, ...(optionen.eingabe || {}) } };
}
function erwarteAbbruch(eingabe, label) {
  assert.throws(() => M.pruefeSenatsblock(eingabe),
    error => /^berlin-senat-entdeckung-/.test(error.message), `abgelehnt: ${label}`);
  bestanden += 1;
  console.log("OK abgelehnt: " + label);
}
const ohneZeit = ergebnis => !/Uhr|\d{2}:\d{2}/.test(JSON.stringify(ergebnis));

// ---------------------------------------------------------------------------------------------
// 1) Positiv: synthetischer Block, drei weiterreichbare und ein offener Treffer.
// ---------------------------------------------------------------------------------------------
{
  const RB = "/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1717887.php";
  const SW = "/sen/web/presse/pressemitteilungen/2026/pressemitteilung.1717406.php";
  const FREMD = "/sen/bjf/service/presse/pressemitteilung.1700001.php";
  const s = portal({ lis: [
    li("25.09.2026", "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php", "Erste Meldung"),
    li("24.09.2026", RB, "Zweite Meldung"),
    li("23.09.2026", SW, "Dritte Meldung"),
    li("23.09.2026", FREMD, "Fremde Meldung")
  ] });
  const ergebnis = M.pruefeSenatsblock(s.eingabe);
  check("positiv: geschlossene Eingabefelder, quelle normalisiert",
    Object.keys(ergebnis).join(",") === M.AUSGANG_FELDER.join(",") && ergebnis.quelle === QUELLE);
  check("positiv: genau vier Fundstellen der eigenen UL",
    ergebnis.fundstellen.length === 4
    && ergebnis.fundstellen.every(f => Object.keys(f).join(",") === M.FUNDSTELLE_FELDER.join(",")));
  const [archiv, rb, sw, fremd] = ergebnis.fundstellen;
  check("positiv: Pressearchiv-Link ist weiterreichbar",
    archiv.weiterreichbar === true && archiv.grund === null
    && archiv.url === "https://www.berlin.de/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php"
    && M.abrufzielFuer(archiv.url).art === "pressearchiv"
    && ABRUF.pruefeAbrufziel(archiv.url) !== null && SONDER_ABRUF.pruefeAbrufziel(archiv.url) === null);
  check("positiv: RBMSKZL-Sondervorlage ist weiterreichbar mit dem passenden Abrufziel",
    rb.weiterreichbar === true && rb.grund === null && M.abrufzielFuer(rb.url).art === "sondervorlage"
    && ABRUF.pruefeAbrufziel(rb.url) === null && SONDER_ABRUF.pruefeAbrufziel(rb.url).url === rb.url
    && SONDER_ABRUF.pruefeAbrufziel(rb.url).host === "berlin.de");
  check("positiv: SenWEB-Sondervorlage ist weiterreichbar mit dem passenden Abrufziel",
    sw.weiterreichbar === true && sw.grund === null && M.abrufzielFuer(sw.url).art === "sondervorlage"
    && ABRUF.pruefeAbrufziel(sw.url) === null && SONDER_ABRUF.pruefeAbrufziel(sw.url).url === sw.url);
  check("positiv: nicht unterstuetzter Berliner Pfad bleibt fail closed markiert",
    fremd.weiterreichbar === false && fremd.grund === M.GRUND_PRESSEARCHIV && M.abrufzielFuer(fremd.url) === null
    && ABRUF.pruefeAbrufziel(fremd.url) === null && SONDER_ABRUF.pruefeAbrufziel(fremd.url) === null);
  check("positiv: reine Kalendertage, keine Uhrzeit in der Ausgabe",
    ergebnis.fundstellen.map(f => f.publikationstag).join(",") === "2026-09-25,2026-09-24,2026-09-23,2026-09-23"
    && ohneZeit(ergebnis));
  check("positiv: Eingang eingefroren, Ergebnis eingefroren",
    Object.isFrozen(ergebnis) && Object.isFrozen(ergebnis.fundstellen) && Object.isFrozen(ergebnis.fundstellen[0]));
  const ohneUhrzeit = portal({ lis: [
    li("25.09.2026", "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php", "Meldung nur mit Datum",
      { dateText: "25.09.2026" })
  ] });
  const kurz = M.pruefeSenatsblock(ohneUhrzeit.eingabe);
  check("positiv: Datumsspalte ohne Uhrzeit ergibt denselben Kalendertag",
    kurz.fundstellen[0].publikationstag === "2026-09-25" && ohneZeit(kurz));
}

// ---------------------------------------------------------------------------------------------
// 2) Negative: Quelle, Status, Host, Redirect, Tracking, Eingabefelder.
// ---------------------------------------------------------------------------------------------
erwarteAbbruch(portal({ eingabe: { http: 302 } }).eingabe, "HTTP 302 statt 200");
erwarteAbbruch(portal({ eingabe: { url: "https://www.berlin.de/presse/index.php", finalUrl: "https://www.berlin.de/presse/index.php" } }).eingabe, "falscher Quellpfad");
erwarteAbbruch(portal({ eingabe: { url: "https://example.com/presse/", finalUrl: "https://example.com/presse/" } }).eingabe, "fremder Host");
erwarteAbbruch(portal({ eingabe: { finalUrl: "https://berlin.de/presse" } }).eingabe, "finalUrl ohne Trailing-Slash/abweichend");
erwarteAbbruch(portal({ eingabe: { finalUrl: "https://evil.example/presse/" } }).eingabe, "Redirect auf fremden Host");
erwarteAbbruch(portal({ eingabe: { url: "https://www.berlin.de/presse/?utm_source=x", finalUrl: "https://www.berlin.de/presse/?utm_source=x" } }).eingabe, "Tracking in der Quelle");
erwarteAbbruch(portal({ eingabe: { url: "https://www.berlin.de:8443/presse/", finalUrl: "https://www.berlin.de:8443/presse/" } }).eingabe, "fremder Port");
{
  const s = portal({ eingabe: { url: "https://berlin.de/presse/", finalUrl: "https://www.berlin.de/presse/" } });
  const ergebnis = M.pruefeSenatsblock(s.eingabe);
  check("positiv: amtliche Quelle ohne www mit www-finalUrl ist dieselbe Quelle", ergebnis.fundstellen.length === 1);
}
{
  const s = portal();
  assert.throws(() => M.pruefeSenatsblock({ ...s.eingabe, extra: 1 }),
    error => /eingabefelder-ungueltig/.test(error.message));
  bestanden += 1;
  console.log("OK abgelehnt: zusaetzliches Eingabefeld");
}

// ---------------------------------------------------------------------------------------------
// 3) Negative: verborgene, fremde oder injizierte Struktur.
// ---------------------------------------------------------------------------------------------
erwarteAbbruch(portal({ h2: `<h2 class="title" hidden>${H2_TEXT}</h2>` }).eingabe, "verborgener H2");
{
  const normal = portal();
  erwarteAbbruch({ ...normal.eingabe, html: `<div hidden>${normal.html}</div>` },
    "gesamter Block in verborgenem Elternbereich");
}
erwarteAbbruch(portal({ block: `<div class="modul-rss_list block"><div hidden><h2>${H2_TEXT}</h2></div>`
  + `<ul class="list--tablelist ruler has-date">`
  + li("25.09.2026", "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php", "Meldung")
  + `</ul></div>` }).eingabe, "H2 in verborgenem Elternbereich");
erwarteAbbruch(portal({ block: `<div class="modul-rss_list block"><h2>${H2_TEXT}</h2>`
  + `<div aria-hidden="true"><ul class="list--tablelist ruler has-date">`
  + li("25.09.2026", "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php", "Meldung")
  + `</ul></div></div>` }).eingabe, "UL in verborgenem Elternbereich");
erwarteAbbruch(portal({ lis: [li("25.09.2026",
  "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php", "Meldung",
  { link: `<a href="/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php">Meldung<span hidden> Falsch</span></a>` })]
}).eingabe, "verborgenes Titelfragment");
erwarteAbbruch(portal({ h2: `<h2 class="title">Aktuelle Mitteilungen der Bezirksämter</h2>` }).eingabe, "fremder H2 statt Senatsblock");
erwarteAbbruch(portal({ lis: [
  li("25.09.2026", "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php", "Meldung", { liAttr: " hidden" })
] }).eingabe, "verborgener Listeneintrag");
erwarteAbbruch(portal({ lis: [
  li("25.09.2026", "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php", "Meldung",
    { behoerde: "Bezirksamt Mitte" })
] }).eingabe, "Bezirksamt im Senatsblock");
erwarteAbbruch(portal({ lis: [
  `<li><div class="cell date">25.09.2026 13:05 Uhr</div><div class="cell text">`
  + `<a href="/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php">Meldung</a></div></li>`
] }).eingabe, "fehlende amtliche Behoerdenkategorie");
erwarteAbbruch(portal({ lis: [
  li("25.09.2026", "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php", "Meldung",
    { link: `<a href="/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php" style="display:none">Meldung</a>` })
] }).eingabe, "verborgener Link");
erwarteAbbruch(portal({ ul: `<ul class="list--tablelist ruler  has-date">`
  + `<!-- ${li("25.09.2026", "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1719999.php", "Kommentar-Meldung")} -->`
  + `${li("25.09.2026", "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php", "Echte Meldung")}</ul>` }).eingabe,
  "versteckte LI in einem Kommentar");
erwarteAbbruch(portal({ ul: `<ul class="list--tablelist ruler  has-date">`
  + `${li("25.09.2026", "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php", "Echte Meldung")}`
  + `<script>var x = "<li><div class=\\"cell date\\">25.09.2026 09:40 Uhr</div></li>";</script></ul>` }).eingabe,
  "LI-Doppler in einem Skript");
erwarteAbbruch(portal({ block: `<div class="modul-rss_list block"><h2 class="title">${H2_TEXT}</h2>`
  + `<div class="inner"><ul class="list--tablelist ruler  has-date">`
  + `${li("25.09.2026", "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php", "A")}</ul>`
  + `<ul class="list--tablelist ruler  has-date">`
  + `${li("25.09.2026", "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718346.php", "B")}</ul></div></div>` }).eingabe,
  "zwei UL im Senatsblock");
erwarteAbbruch(portal({ html: `<div class="modul-rss_list block"><h2 class="title">${H2_TEXT}</h2>`
  + `<div class="inner"><ul class="list--tablelist ruler  has-date">`
  + `${li("25.09.2026", "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php", "A")}</ul></div></div>`
  + `<div class="modul-rss_list block"><h2 class="title">${H2_TEXT}</h2>`
  + `<div class="inner"><ul class="list--tablelist ruler  has-date">`
  + `${li("25.09.2026", "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718346.php", "B")}</ul></div></div>` }).eingabe,
  "zwei Senatsbloecke");
erwarteAbbruch(portal({ ul: `<ul class="list--tablelist ruler  has-date">`
  + li("25.09.2026", "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php", "A")
  + `<li><div class="cell date">25.09.2026 09:40 Uhr</div><div class="cell text">`
  + `<a href="/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718346.php">B</a></div>` }).eingabe,
  "ungeschlossenes LI");
erwarteAbbruch(portal({ block: `<div class="modul-rss_list block"><h2 class="title">${H2_TEXT}</h2>`
  + `<div class="inner"><ul class="list--tablelist ruler  has-date">`
  + li("25.09.2026", "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php", "A")
  + `</ul></div>` }).eingabe, "ungeschlossener Block");

// ---------------------------------------------------------------------------------------------
// 4) Negative: Datum und Link.
// ---------------------------------------------------------------------------------------------
erwarteAbbruch(portal({ lis: [
  li("25.09.2026", "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php", "A", { dateText: "32.13.2026 09:40 Uhr" })
] }).eingabe, "ungueltiger Kalendertag");
erwarteAbbruch(portal({ lis: [
  li("25.09.2026", "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php", "A", { dateText: "2026-09-25" })
] }).eingabe, "Datumsformat-Drift");
erwarteAbbruch(portal({ lis: [
  li("25.09.2026", "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php", "A", { dateText: "25.09.2026 9:40 Uhr" })
] }).eingabe, "Uhrzeitformat-Drift");
erwarteAbbruch(portal({ lis: [
  li("25.09.2026", "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php", "A", { dateText: "25.09.2026 99:99 Uhr" })
] }).eingabe, "ungueltige Listen-Uhrzeit");
erwarteAbbruch(portal({ lis: [
  li("25.09.2026", "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php", "A",
    { link: `<a href="https://www.berlin.de/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php">A</a>` })
] }).eingabe, "absoluter statt relativer Link");
erwarteAbbruch(portal({ lis: [
  li("25.09.2026", "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php", "A",
    { link: `<a href="//evil.example/x.php">A</a>` })
] }).eingabe, "protokollrelativer fremder Link");
erwarteAbbruch(portal({ lis: [
  li("25.09.2026", "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php", "A",
    { link: `<a href="/presse/../sen/bjf/geheim.php">A</a>` })
] }).eingabe, "Traversal im Link");
erwarteAbbruch(portal({ lis: [
  li("25.09.2026", "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php", "A",
    { link: `<a href="/sen/bjf/service/presse/pressearchiv-2026/%2e%2e/geheim.php">A</a>` })
] }).eingabe, "codierte Traversal im Link");
erwarteAbbruch(portal({ lis: [
  li("25.09.2026", "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php", "A",
    { link: `<a href="/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php?x=1">A</a>` })
] }).eingabe, "Query im Link");
erwarteAbbruch(portal({ lis: [
  li("25.09.2026", "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php", "A"),
  li("25.09.2026", "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php", "A")
] }).eingabe, "doppelte Fundstelle");
erwarteAbbruch(portal({ lis: [] }).eingabe, "leere LI-Liste");

// ---------------------------------------------------------------------------------------------
// 4b) Gezielt: nur die exakten amtlichen Formen sind weiterreichbar. Beide Sonderfamilien
//     werden erkannt; nicht unterstuetzte oder fremde Berliner Pfade bleiben fail closed.
// ---------------------------------------------------------------------------------------------
{
  const faelle = [
    ["/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1717887.php", true, "sondervorlage"],
    ["/sen/web/presse/pressemitteilungen/2026/pressemitteilung.1717406.php", true, "sondervorlage"],
    ["/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php", true, "pressearchiv"],
    ["/sen/bjf/service/presse/pressemitteilung.1718345.php", false, null],
    ["/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1717887.html", false, null],
    ["/rbmskzl/aktuelles/pressemitteilungen/pressemitteilung.1717887.php", false, null],
    ["/rbmskzl/aktuelles/pressemitteilungen/2026/unterordner/pressemitteilung.1717887.php", false, null],
    ["/sen/web/presse/pressemitteilungen/2026/1717406.php", false, null],
    ["/sen/web/presse/pressemitteilungen/2026/pressemitteilung.php", false, null],
    ["/sen/web/presse/pressemitteilungen/2026/pressemitteilung.1717406.php/", false, null]
  ];
  for (const [pfad, erwartetWeiter, erwartetArt] of faelle) {
    const f = M.pruefeSenatsblock(portal({ lis: [li("25.09.2026", pfad, "Probe")] }).eingabe).fundstellen[0];
    const ziel = M.abrufzielFuer(f.url);
    check(`abrufziel: ${pfad}`,
      f.weiterreichbar === erwartetWeiter
      && f.grund === (erwartetWeiter ? null : M.GRUND_PRESSEARCHIV)
      && (ziel ? ziel.art : null) === erwartetArt
      && (erwartetArt === "sondervorlage"
        ? ABRUF.pruefeAbrufziel(f.url) === null && SONDER_ABRUF.pruefeAbrufziel(f.url) !== null
        : erwartetArt === "pressearchiv"
          ? ABRUF.pruefeAbrufziel(f.url) !== null && SONDER_ABRUF.pruefeAbrufziel(f.url) === null
          : ABRUF.pruefeAbrufziel(f.url) === null && SONDER_ABRUF.pruefeAbrufziel(f.url) === null));
  }
}

// ---------------------------------------------------------------------------------------------
// 5) Echte lokale Originalprobe des Portals (nur wenn vorhanden) — CI-tauglich.
// ---------------------------------------------------------------------------------------------
const PORTAL_ORIGINAL = "/private/tmp/helmut-berlin-portal-20260928.html";
const ARTIKEL_ORIGINAL = "/private/tmp/helmut-landesversorgung-originale/be-bjf-kinder-jugendhilfe-20260925.html";
const BJF_URL = "https://www.berlin.de/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php";
const BJF_TITEL = "Reform der Kinder- und Jugendhilfe: Berlin fordert verbindlichen Fahrplan und verlässliche Finanzierung";
// Die drei weiteren amtlichen Portaltreffer und ihre bereits gesicherten Originale (Hashes wie
// in scripts/berlin-artikelstand-test.js). Nur die lokalen Originale werden offline gelesen.
const SONDER_FUNDSTELLEN = Object.freeze([
  { familie: "rbmskzl", datei: "/private/tmp/helmut-berlin-rbmskzl-1717887.html",
    sha: "9fbe8472be24f8f6f15c02dd58b4780381cecb31a600dfd685eed858ae3efffa",
    url: "https://www.berlin.de/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1717887.php",
    titel: "Berlin zieht Olympiabewerbung zurück – BERLIN+ wird bei der DOSB-Mitgliederversammlung nicht zur Wahl gestellt",
    tag: "2026-09-24", auszugZeichen: 625 },
  { familie: "rbmskzl", datei: "/private/tmp/helmut-berlin-rbmskzl-1717654.html",
    sha: "41ee95dc3ad942cf7ec3a1b1da5558cd077ee02e8082f63352aefb5634583b0b",
    url: "https://www.berlin.de/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1717654.php",
    titel: "Pressekonferenz zur Bewerbung Berlins für Olympische und Paralympische Spiele",
    tag: "2026-09-23", auszugZeichen: 344 },
  { familie: "senweb", datei: "/private/tmp/helmut-berlin-senweb-1717406.html",
    sha: "987f3aef0890eff51caef25bc14671116c98bf7faf5ead1b3a211cfeeb569bbd",
    url: "https://www.berlin.de/sen/web/presse/pressemitteilungen/2026/pressemitteilung.1717406.php",
    titel: "30 Jahre internationale Leitmesse für Verkehrstechnologie",
    tag: "2026-09-23", auszugZeichen: 240 }
]);
let originalErgebnis = null;
if (fs.existsSync(PORTAL_ORIGINAL)) {
  const html = fs.readFileSync(PORTAL_ORIGINAL, "utf8");
  originalErgebnis = M.pruefeSenatsblock({ url: QUELLE, finalUrl: QUELLE, http: 200, html });
  const f = originalErgebnis.fundstellen;
  check("original: sechs eigene Senatstreffer", f.length === 6);
  check("original: exakt 6/6 Senatstreffer weiterreichbar ohne Skipgrund",
    f.length === 6 && f.every(x => x.weiterreichbar === true && x.grund === null));
  check("original: pro Treffer genau das passende sichere Abrufziel",
    f.every(x => {
      const ziel = M.abrufzielFuer(x.url);
      return ziel && ziel.ziel.url === x.url && ziel.ziel.host === "berlin.de";
    })
    && f.filter(x => M.abrufzielFuer(x.url).art === "pressearchiv").length === 3
    && f.filter(x => M.abrufzielFuer(x.url).art === "sondervorlage").length === 3);
  check("original: Pressearchivtreffer nur ueber den bestehenden Pressearchiv-Abruf",
    f.filter(x => M.abrufzielFuer(x.url).art === "pressearchiv")
      .every(x => ABRUF.pruefeAbrufziel(x.url) !== null && SONDER_ABRUF.pruefeAbrufziel(x.url) === null));
  check("original: Sondervorlagentreffer nur ueber den neuen Sondervorlagen-Einzelabruf",
    f.filter(x => M.abrufzielFuer(x.url).art === "sondervorlage")
      .every(x => ABRUF.pruefeAbrufziel(x.url) === null && SONDER_ABRUF.pruefeAbrufziel(x.url) !== null));
  check("original: die drei Sondervorlagen-Fundstellen tragen exakten Titel und reinen Tag",
    SONDER_FUNDSTELLEN.every(p => {
      const eintrag = f.find(x => x.url === p.url);
      return eintrag && eintrag.titel === p.titel && eintrag.publikationstag === p.tag;
    }));
  const bjf = f.find(x => x.url === BJF_URL);
  check("original: bekannte BJF-URL/Titel/Tag exakt",
    bjf && bjf.titel === BJF_TITEL && bjf.publikationstag === "2026-09-25" && bjf.weiterreichbar === true
    && M.abrufzielFuer(bjf.url).art === "pressearchiv");
  check("original: Bezirksamts- und sonstige Listen nicht eingelesen",
    f.every(x => !/\/presse\/pressemitteilungen\/index\/search/.test(x.url))
    && f.every(x => !x.url.includes("?")) && new Set(f.map(x => x.url)).size === f.length);
  check("original: keine Uhrzeit in der Ausgabe", ohneZeit(originalErgebnis));
} else {
  console.log("SKIP Originalportal: " + PORTAL_ORIGINAL + " nicht vorhanden (CI-tauglich)");
}

// ---------------------------------------------------------------------------------------------
// 6) Offline-Verkettung ueber den BESTEHENDEN Einzelabruf.
//    (a) synthetisch, immer: Entdeckung -> ladePresseartikelStand mit injizierter Antwort.
//    (b) optional echt: bekannte BJF-Fundstelle -> lokales Originalartikel-HTML.
// ---------------------------------------------------------------------------------------------
function artikelSeite(url, titel, tag) {
  const [j, m, t] = tag.split("-");
  const pmDatum = `${t}.${m}.${j}`;
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">`
    + `<meta name="dcterms.date" content="${tag}"><meta name="dcterms.title" content="${titel}">`
    + `<link rel="canonical" href="${url}"></head><body>`
    + `<div id="layout-grid__area--herounit"><h1 class="title">${titel}</h1></div>`
    + `<div id="layout-grid__area--maincontent"><p class="pressnumber">Pressemitteilung vom ${pmDatum}</p>`
    + `<section class="modul-text_bild"><div class="text"><div class="textile">`
    + `<p>Erster Absatz der synthetischen Verkettungsprobe.</p></div></div></section></div>`
    + `<div id="layout-grid__area--marginal"><div class="modul-contact">Kontakt</div></div>`
    + `</body></html>`;
}
async function verkette(portalEingabe, htmlFuerUrl) {
  const entdeckt = M.pruefeSenatsblock(portalEingabe);
  const f = entdeckt.fundstellen.find(x => x.weiterreichbar);
  const doc = { id: "local-verkettung", title: f.titel, url: f.url, canonical_url: f.url,
    published_at: f.publikationstag, retrieved_at: null, summary: "" };
  const calls = [];
  const fetchUrl = async (url, depth, deps) => {
    calls.push({ url, deps });
    return { body: htmlFuerUrl, finalUrl: url, status: 200 };
  };
  return { f, calls, ergebnis: await ABRUF.ladePresseartikelStand(doc, { fetchUrl }) };
}
async function laufe() {
  {
    const SYN_URL = "https://www.berlin.de/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1888888.php";
    const SYN_TITEL = "Synthetische Verkettungsmeldung des Senats";
    const s = portal({ lis: [li("24.09.2026", SYN_URL.replace("https://www.berlin.de", ""), SYN_TITEL)] });
    const { f, calls, ergebnis } = await verkette(s.eingabe, artikelSeite(SYN_URL, SYN_TITEL, "2026-09-24"));
    check("verkettung synthetisch: Abruf nur auf die entdeckte amtliche Adresse",
      calls.length === 1 && calls[0].url === f.url && calls[0].deps.allowedHost === "berlin.de" && calls[0].deps.meldeStatus === true);
    check("verkettung synthetisch: bestehender Standvertrag greift",
      ergebnis.ok === true && ergebnis.stand.url === B.kanonischeArtikelUrl(f.url)
      && ergebnis.stand.publikationstag === f.publikationstag
      && ergebnis.absatz === "Erster Absatz der synthetischen Verkettungsprobe.");
  }
  if (originalErgebnis && fs.existsSync(ARTIKEL_ORIGINAL)) {
    const html = fs.readFileSync(ARTIKEL_ORIGINAL, "utf8");
    const portalHtml = fs.readFileSync(PORTAL_ORIGINAL, "utf8");
    const { f, calls, ergebnis } = await verkette({ url: QUELLE, finalUrl: QUELLE, http: 200, html: portalHtml }, html);
    check("verkettung original: BJF-Fundstelle ueber bestehenden Abruf (injiziert)",
      calls.length === 1 && calls[0].url === BJF_URL && f.url === BJF_URL);
    check("verkettung original: bestehender Stand ist der gepruefte BJF-Stand",
      ergebnis.ok === true && ergebnis.stand.url === B.kanonischeArtikelUrl(BJF_URL)
      && ergebnis.stand.publikationstag === "2026-09-25");
    check("verkettung original: kein Volltext/HTML im Ergebnis",
      !Object.hasOwn(ergebnis, "volltext") && !/<html/i.test(JSON.stringify(ergebnis)));
    // Der bestehende Leser bindet den Stand an Titel/Tag der Fundstelle; Widerspruch bricht ab.
    const widerspruch = await ABRUF.ladePresseartikelStand(
      { id: "x", title: "Falscher Titel", url: BJF_URL, canonical_url: BJF_URL,
        published_at: "2026-09-25", retrieved_at: null, summary: "" },
      { fetchUrl: async (url) => ({ body: html, finalUrl: url, status: 200 }) });
    check("verkettung original: Titelabweichung bricht fail-closed ab",
      widerspruch.ok === false && widerspruch.reason === "titel-abweichend");
  } else {
    console.log("SKIP Verkettung mit Original: lokale Originale nicht vorhanden (CI-tauglich)");
  }

  // -------------------------------------------------------------------------------------------
  // 7) Offline-Verkettung der drei echten Sondervorlagen ueber die ENTDECKTE Fundstelle:
  //    Sondervorlagen-EINZELABRUF (injizierte Originalantwort) -> standAusSondervorlage.
  //    Kein Netz, keine DB, kein Modell. Fehlen die Originale, wird ehrlich uebersprungen.
  // -------------------------------------------------------------------------------------------
  const sonderVerfuegbar = SONDER_FUNDSTELLEN.filter(probe =>
    fs.existsSync(probe.datei) && sha(fs.readFileSync(probe.datei, "utf8")) === probe.sha);
  if (originalErgebnis && sonderVerfuegbar.length === SONDER_FUNDSTELLEN.length) {
    const portalHtml = fs.readFileSync(PORTAL_ORIGINAL, "utf8");
    const entdeckt = M.pruefeSenatsblock({ url: QUELLE, finalUrl: QUELLE, http: 200, html: portalHtml });
    for (const probe of SONDER_FUNDSTELLEN) {
      const html = fs.readFileSync(probe.datei, "utf8");
      const f = entdeckt.fundstellen.find(x => x.url === probe.url);
      const ziel = f ? M.abrufzielFuer(f.url) : null;
      check(`sonder original ${probe.familie}: entdeckte Fundstelle ist genau dieser Sondervorlagenpfad`,
        f && f.weiterreichbar === true && f.titel === probe.titel && f.publikationstag === probe.tag
        && ziel && ziel.art === "sondervorlage" && ABRUF.pruefeAbrufziel(f.url) === null
        && SONDER_ABRUF.pruefeAbrufziel(f.url).url === f.url);

      const calls = [];
      const fetchUrl = async (url, depth, deps) => {
        calls.push({ url, deps });
        return { body: html, finalUrl: url, status: 200 };
      };
      const abruf = await SONDER_ABRUF.ladeSondervorlage({ url: f.url }, { fetchUrl });
      check(`sonder original ${probe.familie}: Einzelabruf nur auf die entdeckte Adresse mit Hostbindung`,
        calls.length === 1 && calls[0].url === f.url && calls[0].deps.allowedHost === "berlin.de"
        && calls[0].deps.meldeStatus === true);
      check(`sonder original ${probe.familie}: Leserbeleg stimmt in Titel und Tag exakt mit der Fundstelle ueberein`,
        abruf.ok === true && abruf.vorlage.url === f.url && abruf.vorlage.pfadfamilie === probe.familie
        && abruf.vorlage.titel === f.titel && abruf.vorlage.publikationstag === f.publikationstag);

      const doc = { id: "local-sonder-" + probe.familie, title: f.titel, url: f.url,
        canonical_url: f.url, published_at: f.publikationstag, retrieved_at: null, summary: "" };
      const stand = B.erzeugeSondervorlagenstand(doc, abruf.vorlage);
      check(`sonder original ${probe.familie}: eigener, hashgebundener Sondervorlagenstand`,
        stand.ok === true && stand.stand.herkunft === B.HERKUNFT_SONDER
        && stand.stand.url === f.url.replace("https://www.berlin.de/", "https://berlin.de/")
        && stand.stand.titel === f.titel && stand.stand.publikationstag === f.publikationstag
        && stand.row.id === "rd-" + stand.stand.standHash && stand.row.content_hash === stand.stand.standHash
        && stand.absatz.length === probe.auszugZeichen && stand.absatz === stand.row.summary);
      check(`sonder original ${probe.familie}: kein HTML/Volltext, published_at null, reiner Kalendertag`,
        stand.row.published_at === null && !Object.hasOwn(stand.row, "volltext")
        && !/<[a-z/]/i.test(JSON.stringify(stand.row))
        && !JSON.stringify(stand.row).includes(abruf.vorlage.volltext)
        && stand.row.summary !== abruf.vorlage.volltext
        && /^\d{4}-\d{2}-\d{2}$/.test(stand.stand.publikationstag)
        && !/\d{2}:\d{2}/.test(JSON.stringify({ id: stand.row.id, hash: stand.row.content_hash,
          tag: stand.stand.publikationstag, meta: stand.stand })));

      // Widerspruch zwischen Fundstelle und Originalbeleg bricht fail closed ab.
      const falscherTitel = B.erzeugeSondervorlagenstand({ ...doc, title: f.titel + " (falsch)" }, abruf.vorlage);
      const falscherTag = B.erzeugeSondervorlagenstand({ ...doc, published_at: "2026-01-01" }, abruf.vorlage);
      check(`sonder original ${probe.familie}: Titel-/Tagabweichung bricht fail closed ab`,
        falscherTitel.ok === false && falscherTitel.reason === "titel-abweichend"
        && falscherTag.ok === false && falscherTag.reason === "datum-nicht-tagesgenau");
    }
  } else {
    console.log("SKIP Verkettung Sondervorlagen: lokale Originale fehlen oder weichen ab (CI-tauglich)");
  }

  assert.ok(B.VERSION >= 1);
  console.log(`PASS berlin-senat-entdeckung-test: ${bestanden} Pruefungen erfolgreich`);
}

laufe().catch(error => { console.error("FAIL " + (error && error.message)); process.exitCode = 1; });
