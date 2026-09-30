"use strict";

// Helmut — gezielter Offline-Test des strengen Landtag-Brandenburg-Presseartikel-Lesers.
// =============================================================================================
// Prueft lib/helmut/brandenburg-landtag-presseartikel.js mit kleinen SYNTHETISCHEN Proben
// (Positiv + Negativ) sowie — falls vorhanden — gegen die lokalen amtlichen Originale
//   /private/tmp/helmut-bb-presse-50117.html  (Artikel 50117)
//   /private/tmp/helmut-bb-presse-liste-kanonisch.html  (amtliche Uebersichtsliste)
// Fehlen diese lokalen Proben, laeuft der Test vollstaendig weiter (CI-tauglich ohne
// /private/tmp); die Originalproben werden dann uebersprungen und ausdruecklich gemeldet.
//
// Erwartete Originalwerte (28.09.2026 beobachtet):
//   URL    .../de/meldungen/fuer_respekt_und_toleranz_im_schulalltag:_…/50117
//   Tag    2026-09-23 (Kalendertag aus der Kopfzeile, KEINE Uhrzeit)
//   Volltext 4 Sachabsaetze, 2750 Zeichen mit abschliessendem Umbruch (2749 ohne ihn)
//   Volltext-SHA256 137e26975c6a7765a8de5bf5bb5fc8ca311d9f0be90b39100b6681a2bec05497
//   HTML-SHA256     91913e5d26bb81f614631281423d716ae1fd0ede43ac2a0d4288e6f402292771
//
// KEIN Netzwerk, KEINE DB, KEIN Modellaufruf.
// Aufruf: node scripts/brandenburg-landtag-presseartikel-test.js

const A = require("node:assert/strict");
const fs = require("fs");
const crypto = require("node:crypto");

const { VERSION, AUSGANG_FELDER, LISTEN_FELDER, pruefePresseartikel,
  pruefeFundstelleGegenListe } = require("../lib/helmut/brandenburg-landtag-presseartikel");

const sha256 = value => crypto.createHash("sha256").update(value, "utf8").digest("hex");

const ARTIKEL_DATEI = "/private/tmp/helmut-bb-presse-50117.html";
const LISTE_DATEI = "/private/tmp/helmut-bb-presse-liste-kanonisch.html";
const ARTIKEL_URL = "https://www.landtag.brandenburg.de/de/meldungen/fuer_respekt_und_toleranz_im_schulalltag:_netzwerk_schule_ohne_rassismus__schule_mit_courage_trifft_sich_im_landtag/50117";
const LISTE_URL = "https://www.landtag.brandenburg.de/de/aktuelles/presse/aktuelle_pressemitteilungen/25216";
const ERWARTET_HTML_SHA = "91913e5d26bb81f614631281423d716ae1fd0ede43ac2a0d4288e6f402292771";
const ERWARTET_LISTEN_SHA = "6b40d9827f713964a48c150553caeee457d7dd6a65721152d99bd601ee7947d6";
const ERWARTET_VOLLTEXT_SHA = "137e26975c6a7765a8de5bf5bb5fc8ca311d9f0be90b39100b6681a2bec05497";
const ERWARTET_TITEL = "Für Respekt und Toleranz im Schulalltag: Netzwerk „Schule ohne Rassismus – Schule mit Courage“ trifft sich im Landtag";
const ERWARTET_KOPFZEILE = "Potsdam, 23. September 2026 / 134";
const MONATSNAMEN = ["", "Januar", "Februar", "März", "April", "Mai", "Juni", "Juli",
  "August", "September", "Oktober", "November", "Dezember"];

A.equal(VERSION, "brandenburg-landtag-presseartikel-v1");

// ---------------------------------------------------------------------------------------------
// Synthetische Seite in der belegten Landtag-Struktur (head, main.col-lg, Sidebar, Fussbereich).
// ---------------------------------------------------------------------------------------------
function seite(optionen = {}) {
  const datum = optionen.datum || "2026-09-23";
  const [jahr, monat, tag] = datum.split("-");
  const slug = optionen.slug || "beispiel_meldung";
  const id = optionen.id || "50117";
  const pfad = `/de/meldungen/${slug}/${id}`;
  const host = optionen.host || "www.landtag.brandenburg.de";
  const url = optionen.url || `https://${host}${pfad}`;
  const titel = optionen.titel === undefined ? "Beispielmeldung des Landtages Brandenburg" : optionen.titel;
  const nummer = optionen.nummer || "134";
  const ort = optionen.ort || "Potsdam";
  const kopfzeile = optionen.kopfzeile === undefined
    ? `${ort}, ${Number(tag)}. ${MONATSNAMEN[Number(monat)]} ${jahr} / ${nummer}` : optionen.kopfzeile;
  const absaetze = optionen.absaetze || ["Erster Sachabsatz mit <strong>Hervorhebung</strong>.",
    "Zweiter Sachabsatz der Meldung."];
  const h1 = optionen.h1 === undefined ? `<h1>${titel}</h1>` : optionen.h1;
  const kopfAbsatz = optionen.kopfAbsatz === undefined ? `<p><em>${kopfzeile}</em></p>` : optionen.kopfAbsatz;
  const pdfAbsatz = optionen.pdfAbsatz === undefined
    ? `<p><ul class="list-links"><li><a class="download" target="_blank" href="/media_fast/6/PM_${nummer}.pdf" title="Pressemitteilung ${nummer}/2026">Pressemitteilung ${nummer} <em>[<abbr title="Portable Document Format">PDF</abbr>]</em></a></li></ul></p>`
    : optionen.pdfAbsatz;
  const seitenTitel = optionen.seitenTitel === undefined ? `${titel} - Landtag Brandenburg` : optionen.seitenTitel;
  const ogTitel = optionen.ogTitel === undefined ? seitenTitel : optionen.ogTitel;
  const canonical = optionen.canonical === undefined ? url : optionen.canonical;
  const nav = optionen.nav === undefined
    ? `<nav aria-label="Sie sind hier"><h6>Breadcrumb</h6><ol><li><a href="/de/startseite">Start</a></li></ol></nav>` : optionen.nav;
  const sachBloecke = absaetze.map(absatz => `<p>${absatz}</p>`).join("\n");
  const mainInhalt = optionen.mainInhalt === undefined
    ? `${nav}\n${h1}\n${kopfAbsatz}\n${sachBloecke}\n${pdfAbsatz}` : optionen.mainInhalt;
  const nachMain = optionen.nachMain === undefined ? `
            <aside class="col-lg-4"><section class="box accent"><h4>Kontakt</h4>
            <p>Die <a href="/sixcms/detail.php/25215">Pressestelle des Landtages</a> steht zur Verfuegung.</p>
            </section></aside>
            <footer><h2>So erreichen Sie uns</h2><address class="vcard">Landtag Brandenburg</address>
            <ul class="list-links"><li><a href="/de/rss-infodienste/12411">RSS-Feeds</a></li></ul></footer>` : optionen.nachMain;
  const metaZusatz = optionen.metaZusatz || "";
  const html = `<!doctype html><html lang="de"><head><meta charset="UTF-8">`
    + `<meta property="og:title" content="${ogTitel}"><title>${seitenTitel}</title>`
    + `<link rel="canonical" href="${canonical}">${metaZusatz}</head>`
    + `<body><div class="wrapper container"><div class="row"><main class="col-lg">${mainInhalt}</main>`
    + `${nachMain}</div></div></body></html>`;
  const eingabe = { url: optionen.url || canonical, finalUrl: optionen.finalUrl || canonical,
    http: optionen.http === undefined ? 200 : optionen.http, html };
  return { eingabe, url, pfad, datum, titel, kopfzeile, nummer };
}

function erwarteAbbruch(eingabe, label, grund) {
  A.throws(() => pruefePresseartikel(eingabe),
    error => /^brandenburg-landtag-presseartikel-/.test(error.message)
      && (!grund || error.message === `brandenburg-landtag-presseartikel-${grund}`),
    `abgelehnt: ${label}`);
}

const basis = seite();

// 1) Positiv: genau eine amtliche Meldung, keine Uhrzeit im Ergebnis.
{
  const ergebnis = pruefePresseartikel(basis.eingabe);
  A.deepEqual(Object.keys(ergebnis), AUSGANG_FELDER);
  A.equal(Object.isFrozen(ergebnis), true);
  A.equal(ergebnis.url, basis.eingabe.finalUrl);
  A.equal(ergebnis.titel, basis.titel);
  A.equal(ergebnis.publikationstag, "2026-09-23");
  A.equal(ergebnis.kopfzeile, basis.kopfzeile);
  A.equal(ergebnis.volltext, "Erster Sachabsatz mit Hervorhebung.\n\nZweiter Sachabsatz der Meldung.\n");
  A.equal(ergebnis.volltextHash, sha256(ergebnis.volltext));
  A.equal(ergebnis.htmlHash, sha256(basis.eingabe.html));
  A.equal(Object.values(ergebnis).some(wert => typeof wert === "string" && /\d{1,2}:\d{2}/.test(wert)),
    false, "keine Uhrzeit");
  A.match(ergebnis.publikationstag, /^\d{4}-\d{2}-\d{2}$/);
  console.log("PASS Positivprobe: URL, Titel, Kalendertag, Kopfzeile, Volltext und Hashes ohne Uhrzeit");
}

// 2) Eingangsfelder und HTTP.
erwarteAbbruch({ ...basis.eingabe, http: 404 }, "http 404");
erwarteAbbruch({ ...basis.eingabe, http: "200" }, "http als String");
erwarteAbbruch({ ...basis.eingabe, publishedAt: "2026-09-23T10:00:00Z" }, "Zusatzfeld publishedAt");
erwarteAbbruch({ url: basis.url, finalUrl: basis.url, http: 200 }, "fehlendes html");
erwarteAbbruch({ ...basis.eingabe, html: "" }, "leeres html");
console.log("PASS Eingangsfelder und HTTP fail closed");

// 3) Adresse: fremd, normalisiert, Drift.
erwarteAbbruch({ ...basis.eingabe, url: basis.url.replace("https://", "http://") }, "kein HTTPS");
erwarteAbbruch({ ...basis.eingabe, url: basis.url.replace("www.landtag", "WWW.Landtag") }, "Grossschreibung im Host");
erwarteAbbruch({ ...basis.eingabe, url: basis.url.replace("landtag.brandenburg.de", "landtag.brandenburg.example") }, "fremder Host");
erwarteAbbruch({ ...basis.eingabe, url: basis.url.replace("landtag.brandenburg.de", "user:pw@landtag.brandenburg.de") }, "Benutzerinfo");
erwarteAbbruch({ ...basis.eingabe, url: basis.url.replace("landtag.brandenburg.de", "landtag.brandenburg.de:8443") }, "Port");
erwarteAbbruch({ ...basis.eingabe, url: basis.url + "?utm=1" }, "Query/Tracking");
erwarteAbbruch({ ...basis.eingabe, url: basis.url + "#absatz" }, "Fragment");
erwarteAbbruch({ ...basis.eingabe, url: basis.url + "/" }, "Trailing Slash");
erwarteAbbruch({ ...basis.eingabe, url: basis.url.replace("/de/meldungen/", "/DE/MELDUNGEN/") }, "Grossschreibung im Pfad");
erwarteAbbruch(seite({ slug: "beispiel/../fremd" }).eingabe, "Pfadausbruch ..");
erwarteAbbruch(seite({ slug: "beispiel%2Ffremd" }).eingabe, "prozentkodierter Schraegstrich");
erwarteAbbruch(seite({ id: "abc" }).eingabe, "nicht-numerische Nummer");
erwarteAbbruch({ ...seite().eingabe, url: "https://www.landtag.brandenburg.de/de/presse/beispiel/50117" }, "fremde Pfadfamilie");
console.log("PASS fremde, normalisierte und driftende Adressen fail closed");

// 4) finalUrl-, canonical- und Kopfbereichsbindung.
{
  const opt = seite();
  erwarteAbbruch({ ...opt.eingabe, url: opt.url.replace(/\/\d+$/, "/50118") }, "Abrufadresse != finale Artikeladresse");
  erwarteAbbruch({ ...opt.eingabe, finalUrl: opt.eingabe.finalUrl + "?x=1" }, "finalUrl mit Query");
  erwarteAbbruch({ ...opt.eingabe, finalUrl: "https://www.landtag.brandenburg.de/de/meldungen/anders/50117" }, "finalUrl fremder Pfad");
  erwarteAbbruch(seite({ canonical: "" }).eingabe, "canonical fehlt");
  erwarteAbbruch(seite({ canonical: `<link rel="canonical" href="https://www.landtag.brandenburg.de/de/meldungen/a/1"><link rel="canonical" href="https://www.landtag.brandenburg.de/de/meldungen/a/1">` }).eingabe, "canonical doppelt");
  erwarteAbbruch(seite({ url: opt.url, finalUrl: opt.url, canonical: "https://www.landtag.brandenburg.de/de/meldungen/anders/50117" }).eingabe, "canonical != finalUrl", "finalurl-nicht-canonical");
  erwarteAbbruch(seite({ canonical: "https://www.landtag.brandenburg.example/de/meldungen/a/50117" }).eingabe, "canonical fremder Host");
  const inBody = seite().eingabe.html.replace(/<link rel="canonical"[^>]*>/, "").replace("</body>", `<link rel="canonical" href="${opt.eingabe.finalUrl}"></body>`);
  erwarteAbbruch({ ...opt.eingabe, html: inBody }, "canonical nur im body");
}
console.log("PASS kanonische, finale und Abrufadresse exakt gebunden");

// 5) H1: falsch, doppelt, versteckt, ausserhalb, getarnt.
erwarteAbbruch(seite({ h1: "" }).eingabe, "H1 fehlt", "h1-mehrdeutig-oder-fehlend");
erwarteAbbruch(seite({ h1: "<h1>Anderer Titel</h1>" }).eingabe, "H1 != Seitentitel", "h1-nicht-im-seitentitel");
erwarteAbbruch(seite({ h1: "<h1>Beispielmeldung</h1>" }).eingabe,
  "gekuerzter H1 als Praefix", "h1-nicht-im-seitentitel");
erwarteAbbruch(seite({ h1: "<h1>Erster</h1><h1>Zweiter</h1>" }).eingabe, "zwei H1");
erwarteAbbruch(seite({ h1: `<h1 hidden>${seite().titel}</h1>` }).eingabe, "versteckte H1");
erwarteAbbruch(seite({ h1: `<h1 aria-hidden="true">${seite().titel}</h1>` }).eingabe, "aria-hidden H1");
{
  const t = seite().titel;
  erwarteAbbruch(seite({ h1: `<h1>${t}</h1>`, mainInhalt: `<nav></nav>\n${h1Bekannt(t)}\n<p><em>Potsdam, 23. September 2026 / 134</em></p>\n<p>A</p>\n<p><ul class="list-links"><li><a class="download" href="/a.pdf">PDF</a></li></ul></p>` }).eingabe,
    "p vor H1", "absatz-vor-h1");
  function h1Bekannt(x) { return `<p>Vorlauf</p><h1>${x}</h1>`; }
}
erwarteAbbruch(seite({ ogTitel: "Etwas anderes" }).eingabe, "og:title != Seitentitel", "og-titel-abweichend");
erwarteAbbruch(seite({ metaZusatz: `<meta property="og:title" content="X">` }).eingabe, "og:title doppelt");
erwarteAbbruch(seite({ mainInhalt: `<nav></nav>\n<p><em>Potsdam, 23. September 2026 / 134</em></p>\n<p>A</p>\n<p><ul class="list-links"><li><a class="download" href="/a.pdf">PDF</a></li></ul></p>`,
  nachMain: `<aside><h1>${seite().titel}</h1><section class="box"><h4>Kontakt</h4></section></aside>` }).eingabe,
  "H1 ausserhalb main", "h1-mehrdeutig-oder-fehlend");
console.log("PASS falsche, doppelte, versteckte und verschobene H1 fail closed");

// 6) Kopfzeile: fehlend, falsches Format, falsches em, Uhrzeit, ungueltiger Tag.
erwarteAbbruch(seite({ kopfAbsatz: "<p>Potsdam, 23. September 2026 / 134</p>" }).eingabe, "Kopfzeile ohne em");
erwarteAbbruch(seite({ kopfAbsatz: "<p><em>Potsdam, 23. September 2026</em></p>" }).eingabe, "Kopfzeile ohne Nummer", "kopfzeile-ungueltig");
erwarteAbbruch(seite({ kopfAbsatz: "<p><em>Potsdam, 23. September 2026, 10:00 Uhr</em></p>" }).eingabe, "Kopfzeile mit Uhrzeit", "kopfzeile-ungueltig");
erwarteAbbruch(seite({ kopfAbsatz: "<p><em>Potsdam, 23. Septembar 2026 / 134</em></p>" }).eingabe, "unbekannter Monat", "kopfzeile-ungueltig");
erwarteAbbruch(seite({ datum: "2026-02-31" }).eingabe, "ungueltiger Kalendertag", "kopfzeile-ungueltig");
erwarteAbbruch(seite({ kopfAbsatz: "<p><em>Potsdam, 23. September 2026 / 134</em> Nachtrag</p>" }).eingabe, "Kopfzeile mit Fremdinhalt", "kopfzeile-fremdinhalt");
console.log("PASS Kopfzeile eindeutig, nur Tag, ohne erfundene Uhrzeit");

// 7) Sachabsaetze: versteckt, leer, doppelt, Blockfremdinhalt, PDF-Leak.
erwarteAbbruch(seite({ absaetze: ["<span hidden>Versteckt</span>"] }).eingabe, "versteckter Sachabsatz");
erwarteAbbruch(seite({ absaetze: [""] }).eingabe, "leerer Sachabsatz", "sachabsatz-leer");
erwarteAbbruch(seite({ absaetze: ["Gleich", "Gleich"] }).eingabe, "Absatz-Doppler", "sachabsatz-doppler");
erwarteAbbruch(seite({ absaetze: ["Erster <ul><li>Punkt</li></ul>"] }).eingabe, "Liste im Sachabsatz");
erwarteAbbruch(seite({ absaetze: ["Erster <div>Block</div>"] }).eingabe, "div im Sachabsatz");
erwarteAbbruch(seite({ absaetze: ['Erster <a href="/media_fast/6/x.pdf">PDF</a>'] }).eingabe, "PDF-Link im Sachabsatz", "pdf-link-im-sachabsatz");
erwarteAbbruch(seite({ absaetze: ['Erster <a class="download" href="/media_fast/6/x.pdf">Download</a>'] }).eingabe, "Downloadlink im Sachabsatz");
erwarteAbbruch(seite({ absaetze: ["Erster <aside>Kontakt</aside>"] }).eingabe, "Kontaktblock im Sachabsatz");
{
  const amtlich = seite({ absaetze: ['Terminabstimmung unter <a href="mailto:petitionsausschuss@landtag.brandenburg.de">petitionsausschuss@landtag.brandenburg.de</a>.'] });
  A.match(pruefePresseartikel(amtlich.eingabe).volltext, /petitionsausschuss@landtag\.brandenburg\.de/);
}
erwarteAbbruch(seite({ absaetze: ['Erster <a href="mailto:pressestelle@example.org">Mail</a>'] }).eingabe,
  "fremde Kontaktmail", "kontakt-im-artikel");
console.log("PASS Sachabsaetze vollstaendig, geschlossen und ohne Fremd-/PDF-Inhalt");

// 7b) Terminankuendigungen duerfen ausschliesslich eine sichtbare, gueltige Tagesueberschrift
// direkt vor einer reinen Uhrzeitzeile enthalten. Die Überschrift bleibt im Volltext erhalten.
{
  const t = seite().titel;
  const termin = seite({ mainInhalt: `<nav></nav>\n<h1>${t}</h1>\n<p><em>Potsdam, 23. September 2026 / 134</em></p>\nMontag, 28. September 2026\n<p class="time-line">10:00 Uhr</p>\n<p>Oeffentliche Sitzung des Ausschusses.</p>\n<p><ul class="list-links"><li><a class="download" href="/a.pdf">PDF</a></li></ul></p>` });
  A.match(pruefePresseartikel(termin.eingabe).volltext,
    /Montag, 28\. September 2026\n\n10:00 Uhr\n\nOeffentliche Sitzung/);
  const mehrtagig = seite({ mainInhalt: "<nav></nav>\n<h1>" + t + "</h1>\n<p><em>Potsdam, 23. September 2026 / 134</em></p>\nFreitag, 2. Oktober bis Samstag, 3. Oktober 2026\n<p>Oeffentliche mehrtaegige Veranstaltung.</p>\n<p><ul class=\"list-links\"><li><a class=\"download\" href=\"/a.pdf\">PDF</a></li></ul></p>" });
  A.match(pruefePresseartikel(mehrtagig.eingabe).volltext,
    /Freitag, 2\. Oktober bis Samstag, 3\. Oktober 2026\n\nOeffentliche mehrtaegige/);
  const gleicheZeit = seite({ mainInhalt: [
    "<nav></nav>", "<h1>" + t + "</h1>", "<p><em>Potsdam, 23. September 2026 / 134</em></p>",
    "Montag, 28. September 2026", '<p class="time-line">10:00 Uhr</p>', "<p>Erste Sitzung.</p>",
    "Dienstag, 29. September 2026", '<p class="time-line">10:00 Uhr</p>', "<p>Zweite Sitzung.</p>",
    '<p><ul class="list-links"><li><a class="download" href="/a.pdf">PDF</a></li></ul></p>'
  ].join("\n") });
  A.match(pruefePresseartikel(gleicheZeit.eingabe).volltext,
    /Erste Sitzung\.\n\nDienstag, 29\. September 2026\n\n10:00 Uhr\n\nZweite Sitzung/);
  const punktzeit = seite({ mainInhalt: [
    "<nav></nav>", "<h1>" + t + "</h1>", "<p><em>Potsdam, 23. September 2026 / 134</em></p>",
    "Samstag, 26. September 2026", '<p class="time-line">19.30 Uhr</p>', "<p>Abendtermin.</p>",
    '<p><ul class="list-links"><li><a class="download" href="/a.pdf">PDF</a></li></ul></p>'
  ].join("\n") });
  A.match(pruefePresseartikel(punktzeit.eingabe).volltext, /19\.30 Uhr\n\nAbendtermin/);
  erwarteAbbruch(seite({ mainInhalt: `<nav></nav>\n<h1>${t}</h1>\n<p><em>Potsdam, 23. September 2026 / 134</em></p>\nUngebundener Text\n<p class="time-line">10:00 Uhr</p>\n<p>A</p>\n<p><ul class="list-links"><li><a class="download" href="/a.pdf">PDF</a></li></ul></p>` }).eingabe,
  "beliebter Text vor Uhrzeitzeile", "fremdinhalt-zwischen-absaetzen");
  erwarteAbbruch(seite({ mainInhalt: `<nav></nav>\n<h1>${t}</h1>\n<p><em>Potsdam, 23. September 2026 / 134</em></p>\nMontag, 28. September 2026\n<p class="time-line">10 Uhr</p>\n<p>A</p>\n<p><ul class="list-links"><li><a class="download" href="/a.pdf">PDF</a></li></ul></p>` }).eingabe,
  "ungueltige Uhrzeitzeile", "fremdinhalt-zwischen-absaetzen");
}
console.log("PASS Termin-Tagesueberschriften nur vor strikter Uhrzeitzeile und mit Volltextbindung");

// 8) PDF-Downloadliste: nicht letzter Block, doppelt, Fremd-Leak, Ausbruch aus main.
erwarteAbbruch(seite({ mainInhalt: `<nav></nav>\n<h1>${seite().titel}</h1>\n<p><em>Potsdam, 23. September 2026 / 134</em></p>\n<p><ul class="list-links"><li><a class="download" href="/a.pdf">PDF</a></li></ul></p>\n<p>Nachlauf</p>` }).eingabe,
  "PDF-Liste nicht letzter Absatz");
erwarteAbbruch(seite({ mainInhalt: `<nav></nav>\n<h1>${seite().titel}</h1>\n<p><em>Potsdam, 23. September 2026 / 134</em></p>\n<p>A</p>\n<p><ul class="list-links"><li><a class="download" href="/a.pdf">PDF</a></li></ul></p>\n<p><ul class="list-links"><li><a class="download" href="/b.pdf">PDF</a></li></ul></p>` }).eingabe,
  "zwei PDF-Listen");
erwarteAbbruch(seite({ mainInhalt: `<nav></nav>\n<h1>${seite().titel}</h1>\n<p><em>Potsdam, 23. September 2026 / 134</em>\n<p>A</p>\n${"<p><ul class=\"list-links\"><li><a class=\"download\" href=\"/a.pdf\">PDF</a></li></ul></p>"}` }).eingabe,
  "Ausbruch aus main (ungeschlossene Kopfzeile)");
erwarteAbbruch(seite({ mainInhalt: `<nav></nav>\n<h1>${seite().titel}</h1>\n<p><em>Potsdam, 23. September 2026 / 134</em></p>\n<p>A</p>\n<aside>Kontakt</aside>\n${"<p><ul class=\"list-links\"><li><a class=\"download\" href=\"/a.pdf\">PDF</a></li></ul></p>"}` }).eingabe,
  "Sidebar/Kontakt innerhalb main");
erwarteAbbruch(seite({ mainInhalt: `<nav></nav>\n<h1>${seite().titel}</h1>\n<p><em>Potsdam, 23. September 2026 / 134</em></p>\n<p>A<a href="mailto:pressestelle@example.org">Mail</a></p>\n${"<p><ul class=\"list-links\"><li><a class=\"download\" href=\"/a.pdf\">PDF</a></li></ul></p>"}` }).eingabe,
  "Kontaktmail innerhalb main", "kontakt-im-artikel");
{
  const original = seite().eingabe;
  erwarteAbbruch({ ...original, html: original.html.replace("</main>", "Nachlauf</main>") },
    "ungebundener Text hinter PDF-Liste", "fremdinhalt-nach-artikel");
}
console.log("PASS PDF-Liste begrenzt, Fremd- und Kontaktanhang sowie main-Ausbruch fail closed");

// 9) Versteckte/inerte Scheinbelege (Kommentar, Skript, verborgene Huellen).
{
  const t = seite().titel;
  erwarteAbbruch(seite({ h1: `<!-- <h1>${t}</h1> --><h1>${t}</h1>` }).eingabe, "H1 im Kommentar", "versteckter-doppler");
  erwarteAbbruch(seite({ h1: `<script>document.write("<h1>${t}</h1>")</script><h1>${t}</h1>` }).eingabe, "H1 im Skript", "versteckter-doppler");
  erwarteAbbruch(seite({ h1: `${h1Aus(t)}<h1>${t}</h1>` }).eingabe, "zweites main im Kommentar", "versteckter-doppler");
  function h1Aus(x) { return `<!-- <main class="col-lg"><h1>${x}</h1></main> -->`; }
  erwarteAbbruch(seite({ mainInhalt: `<nav></nav>\n<h1>${t}</h1><h1 hidden>${t}</h1>\n<p><em>Potsdam, 23. September 2026 / 134</em></p>\n<p>A</p>\n<p><ul class="list-links"><li><a class="download" href="/a.pdf">PDF</a></li></ul></p>` }).eingabe,
    "versteckte zweite H1");
}
console.log("PASS versteckte und inerte Scheinbelege fail closed");

// 10) Optionale Fundstellen-Gegenpruefung gegen die amtliche Uebersichtsliste.
function listeHtml(optionen = {}) {
  const eintraege = optionen.eintraege || [
    { href: "/de/meldungen/andere_meldung/50179", datum: "25.09.2026", titel: "Termine des Landtages" },
    { href: "/de/meldungen/fuer_respekt_und_toleranz_im_schulalltag:_netzwerk_schule_ohne_rassismus__schule_mit_courage_trifft_sich_im_landtag/50117", datum: "23.09.2026", titel: ERWARTET_TITEL }
  ];
  const url = optionen.url || LISTE_URL;
  const canonical = optionen.canonical === undefined ? url : optionen.canonical;
  const inhalt = eintraege.map(eintrag => `<li>\n<a class="list-entry" href="${eintrag.href}" title="zur Meldung: ${eintrag.titel}">\n<div class="list-entry-date">\n${eintrag.datum}\n</div>\n<div class="list-entry-text">\n<div class="list-entry-title">\n${eintrag.titel}\n</div>\n</div>\n</a>\n</li>`).join("\n");
  const html = `<!doctype html><html lang="de"><head><meta charset="UTF-8"><title>Aktuelle Pressemitteilungen - Landtag Brandenburg</title><link rel="canonical" href="${canonical}"></head>`
    + `<body><main class="col-lg"><nav></nav><h1>Aktuelle Pressemitteilungen</h1><ul class="list-entries">\n${inhalt}\n</ul></main></body></html>`;
  return { url: optionen.uebergebeneUrl || url, finalUrl: optionen.finalUrl || url, http: 200, html };
}

const artikelBeleg = Object.freeze({ url: ARTIKEL_URL, titel: ERWARTET_TITEL, publikationstag: "2026-09-23" });
{
  const fundstelle = pruefeFundstelleGegenListe(artikelBeleg, listeHtml());
  A.deepEqual(Object.keys(fundstelle), LISTEN_FELDER);
  A.equal(Object.isFrozen(fundstelle), true);
  A.equal(fundstelle.eintragsId, "50117");
  A.equal(fundstelle.publikationstag, "2026-09-23");
  A.equal(fundstelle.titel, ERWARTET_TITEL);

  const falscherTag = listeHtml({ eintraege: [
    { href: "/de/meldungen/fuer_respekt_und_toleranz_im_schulalltag:_netzwerk_schule_ohne_rassismus__schule_mit_courage_trifft_sich_im_landtag/50117", datum: "24.09.2026", titel: ERWARTET_TITEL }] });
  A.throws(() => pruefeFundstelleGegenListe(artikelBeleg, falscherTag), /liste-tag-widerspruch/);
  const falscherTitel = listeHtml({ eintraege: [
    { href: "/de/meldungen/fuer_respekt_und_toleranz_im_schulalltag:_netzwerk_schule_ohne_rassismus__schule_mit_courage_trifft_sich_im_landtag/50117", datum: "23.09.2026", titel: "Anderer Titel" }] });
  A.throws(() => pruefeFundstelleGegenListe(artikelBeleg, falscherTitel), /liste-titel-widerspruch/);
  const fehlend = listeHtml({ eintraege: [{ href: "/de/meldungen/andere_meldung/50179", datum: "25.09.2026", titel: "Termine" }] });
  A.throws(() => pruefeFundstelleGegenListe(artikelBeleg, fehlend), /liste-fundstelle-mehrdeutig-oder-fehlend/);
  const doppelt = listeHtml({ eintraege: [
    { href: "/de/meldungen/fuer_respekt_und_toleranz_im_schulalltag:_netzwerk_schule_ohne_rassismus__schule_mit_courage_trifft_sich_im_landtag/50117", datum: "23.09.2026", titel: ERWARTET_TITEL },
    { href: "/de/meldungen/fuer_respekt_und_toleranz_im_schulalltag:_netzwerk_schule_ohne_rassismus__schule_mit_courage_trifft_sich_im_landtag/50117", datum: "23.09.2026", titel: ERWARTET_TITEL }] });
  A.throws(() => pruefeFundstelleGegenListe(artikelBeleg, doppelt), /liste-eintrag-doppelt/);
  const fremdeListe = listeHtml({ url: "https://www.landtag.brandenburg.example/de/aktuelles/presse/aktuelle_pressemitteilungen/25216" });
  A.throws(() => pruefeFundstelleGegenListe(artikelBeleg, fremdeListe), /liste-url-ungueltig/);
  const falscheFinal = listeHtml({ finalUrl: LISTE_URL + "?x=1" });
  A.throws(() => pruefeFundstelleGegenListe(artikelBeleg, falscheFinal), /liste-finalurl-ungueltig/);
  const ohneHeadCanonical = listeHtml();
  A.throws(() => pruefeFundstelleGegenListe(artikelBeleg, {
    ...ohneHeadCanonical,
    html: ohneHeadCanonical.html.replace(/<link rel="canonical"[^>]*>/, "")
      .replace("</body>", `<link rel="canonical" href="${LISTE_URL}"></body>`)
  }), /liste-canonical-nicht-im-head/);
  const zweitesMain = listeHtml();
  A.throws(() => pruefeFundstelleGegenListe(artikelBeleg, {
    ...zweitesMain, html: zweitesMain.html.replace("</body>", "<main>Fremdinhalt</main></body>")
  }), /liste-main-mehrdeutig-oder-fehlend/);
  const versteckt = listeHtml({ eintraege: [
    { href: "/de/meldungen/fuer_respekt_und_toleranz_im_schulalltag:_netzwerk_schule_ohne_rassismus__schule_mit_courage_trifft_sich_im_landtag/50117", datum: "23.09.2026", titel: `<!-- ${ERWARTET_TITEL} -->${ERWARTET_TITEL}` }] });
  A.equal(pruefeFundstelleGegenListe(artikelBeleg, versteckt).titel, ERWARTET_TITEL);
  const versteckterElternblock = listeHtml();
  A.throws(() => pruefeFundstelleGegenListe(artikelBeleg, {
    ...versteckterElternblock,
    html: versteckterElternblock.html.replace('<div class="list-entry-text">',
      '<div class="list-entry-text" hidden>')
  }), /liste-eintrag-versteckt/);
  A.throws(() => pruefeFundstelleGegenListe({ ...artikelBeleg, publikationstag: "2026-02-31" }, listeHtml()), /artikel-tag-ungueltig/);
}
console.log("PASS optionale Fundstellen-Gegenpruefung bindet Pfad, Titel und Tag und bricht bei Widerspruch ab");

// 11) Echte lokale Originalproben (nur wenn vorhanden) — byteidentisch zum amtlichen Original.
if (fs.existsSync(ARTIKEL_DATEI) && fs.existsSync(LISTE_DATEI)) {
  const artikelHtml = fs.readFileSync(ARTIKEL_DATEI, "utf8");
  const listenHtml = fs.readFileSync(LISTE_DATEI, "utf8");
  A.equal(sha256(listenHtml), ERWARTET_LISTEN_SHA);
  const ergebnis = pruefePresseartikel({ url: ARTIKEL_URL, finalUrl: ARTIKEL_URL, http: 200, html: artikelHtml });
  A.equal(ergebnis.url, ARTIKEL_URL);
  A.equal(ergebnis.titel, ERWARTET_TITEL);
  A.equal(ergebnis.publikationstag, "2026-09-23");
  A.equal(ergebnis.kopfzeile, ERWARTET_KOPFZEILE);
  A.equal(ergebnis.htmlHash, ERWARTET_HTML_SHA);
  A.equal(ergebnis.volltextHash, ERWARTET_VOLLTEXT_SHA);
  A.equal(ergebnis.volltext.length, 2750);
  A.equal(ergebnis.volltext.replace(/\n$/, "").length, 2749);
  A.equal(ergebnis.volltext.split("\n\n").length, 4);
  A.equal(ergebnis.volltext.split("\n\n")[0].length, 497);
  A.equal(Object.values(ergebnis).some(wert => typeof wert === "string" && /\d{1,2}:\d{2}/.test(wert)), false, "keine Uhrzeit im Originalbeleg");
  const fundstelle = pruefeFundstelleGegenListe(ergebnis,
    { url: LISTE_URL, finalUrl: LISTE_URL, http: 200, html: listenHtml });
  A.equal(fundstelle.eintragsId, "50117");
  A.equal(fundstelle.publikationstag, "2026-09-23");
  A.equal(fundstelle.titel, ERWARTET_TITEL);
  // Die jeweils andere amtliche Seite ist KEIN gueltiger Ersatz (fail closed).
  A.throws(() => pruefePresseartikel({ url: LISTE_URL, finalUrl: LISTE_URL, http: 200, html: listenHtml }),
    error => /^brandenburg-landtag-presseartikel-url-ungueltig$/.test(error.message));
  A.throws(() => pruefeFundstelleGegenListe(ergebnis,
    { url: ARTIKEL_URL, finalUrl: ARTIKEL_URL, http: 200, html: artikelHtml }), /liste-url-ungueltig/);
  console.log(`PASS echte Originale: 4 Sachabsaetze, sha ${ergebnis.volltextHash.slice(0, 12)}…, Tag 2026-09-23, Liste 50117 deckungsgleich`);
} else {
  console.log("SKIP echte Originalprobe: Artikel oder kanonische Liste unter /private/tmp nicht vorhanden (CI-tauglich)");
}

console.log("PASS brandenburg-landtag-presseartikel-test abgeschlossen");
