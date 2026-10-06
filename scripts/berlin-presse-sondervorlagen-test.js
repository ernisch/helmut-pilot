"use strict";

// Helmut — gezielter Offline-Test des strengen Lesers fuer die eng belegten amtlichen Berliner
// Senats-Pressemitteilungs-Pfadfamilien AUSSERHALB des Pressearchivs.
// =============================================================================================
// Prueft lib/helmut/berlin-presse-sondervorlagen.js mit kleinen SYNTHETISCHEN Proben
// (Positiv + Negativ) fuer alle Pfadfamilien sowie — falls vorhanden — gegen die drei lokalen
// amtlichen Originale unter /private/tmp. Fehlen die Originale, laeuft derselbe Test vollstaendig
// weiter (CI-tauglich ohne /private/tmp); die Originalproben werden dann uebersprungen und
// ausdruecklich als SKIP gemeldet.
//
// KEIN Netzwerk, KEINE Datei-, DB-, Modell- oder Productionwirkung, keine Profile, kein
// Live-Crawl und kein neuer Netzabruf. Aufruf:
//   node scripts/berlin-presse-sondervorlagen-test.js

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const M = require("../lib/helmut/berlin-presse-sondervorlagen");
// Verzeichnis der lokalen Originale. Nur fuer den Offline-Nachweis; ohne die Dateien laeuft
// derselbe Test CI-tauglich und meldet die Originalproben als SKIP.
const ORIGINAL_DIR = process.env.HELMUT_BERLIN_ORIGINALE_DIR || "/private/tmp";

let bestanden = 0;
function check(name, bedingung) {
  assert.ok(bedingung, name);
  bestanden += 1;
  console.log("OK " + name);
}
const sha256 = wert => crypto.createHash("sha256").update(wert, "utf8").digest("hex");
const dmY = iso => { const [j, m, t] = iso.split("-"); return `${t}.${m}.${j}`; };

const ABSENDER = "Das Presse- und Informationsamt des Landes Berlin teilt mit:";
const SACH = "Die synthetische Meldung beschreibt einen amtlich belegten Sachverhalt der "
  + "Berliner Landesversorgung und dient ausschliesslich der lokalen Offlinepruefung dieser Vorlage.";
const SACH2 = "Ein zweiter, ebenfalls vollstaendiger Sachabsatz derselben synthetischen Meldung "
  + "fuer die gebundene Auszugsgrenze dieser Vorlage.";
const ASGIVA_HINWEIS = "Weitere amtliche Hinweise zu diesem Sachverhalt:";
const ASGIVA_STARK = "Weiterführende Informationen";
const ASGIVA_LISTE1 = "Erste amtliche Informationsseite";
const ASGIVA_LISTE2 = "Zweite amtliche Informationsseite";
const ASGIVA_ZUSATZ = ASGIVA_HINWEIS + `<strong>${ASGIVA_STARK}</strong>`
  + `<ul><li><a href="/sen/asgiva/themen/information-eins">${ASGIVA_LISTE1}</a></li>`
  + `<li><a href="https://www.berlin.de/sen/asgiva/themen/information-zwei">${ASGIVA_LISTE2}</a></li></ul>`;
const ASGIVA_EXTERN = "https://www.kaeltehilfe-berlin.de";
const ASGIVA_INLINE_STARK = "Sozialsenatorin Cansel Kiziltepe";
const ASGIVA_INLINE_TEXT = "Die Senatorin informiert zur Berliner Kaeltehilfe.";

// SenWEB hat zwischen Artikeltext und Randbereich ein PDF-Downloadmodul; der Kontaktblock steht im
// Randbereich. Beides darf nie Artikeltext werden.
const PDF_MODUL = `<section class="modul-download-multi"><h3 class="title">Diese Pressemitteilung `
  + `als PDF downloaden</h3><ul class="modul-download-multi"><li class="modul-download">`
  + `<div class="modul-download__left"><p class="caption"><span class="doc-type">PDF-Dokument `
  + `(94.1 kB)</span></p></div><div class="modul-download__right"><a `
  + `href="/sen/web/presse/pressemitteilungen/2026/20260923_pm_probe.pdf?ts=1790150970" `
  + `class="link link--download" download>Download</a></div></li></ul></section>`;
const MARGINAL = `<div id="layout-grid__area--marginal" role="complementary">`
  + `<div id="kontakt" class="sprungmarke"></div><div class="modul-contact"><h2 class="title">`
  + `Kontakt</h2><div class="textile"><p>Presse- und Informationsamt des Landes Berlin</p></div>`
  + `<address><ul class="list--contact"><li class="address"><div class="loc">Jüdenstr. 1<br>`
  + `10178 Berlin</div></li><li class="tel">Tel.: <a href="tel:03090262411">(030) 9026-2411</a>`
  + `</li><li class="email"><a href="mailto:presse-information@senatskanzlei.berlin.de">E-Mail`
  + `</a></li></ul></address></div></div>`;

// ---------------------------------------------------------------------------------------------
// Synthetische Seite in der belegten Struktur beider Pfadfamilien.
// ---------------------------------------------------------------------------------------------
function seite(optionen = {}) {
  const familie = optionen.familie || "rbmskzl";
  const datum = optionen.datum || "2026-09-24";
  const jahr = optionen.jahr || datum.slice(0, 4);
  const praefix = Object.freeze({
    rbmskzl: "/rbmskzl/aktuelles/pressemitteilungen",
    senweb: "/sen/web/presse/pressemitteilungen",
    justv: "/sen/justv/presse/pressemitteilungen",
    kultgz: "/sen/kultgz/aktuelles/pressemitteilungen",
    asgiva: "/sen/asgiva/presse/pressemitteilungen",
    uvk: "/sen/uvk/presse/pressemitteilungen",
    wgp: "/sen/wgp/presse"
  })[familie];
  const host = optionen.host || "www.berlin.de";
  const url = optionen.url || `https://${host}${praefix}/${jahr}/pressemitteilung.${optionen.nummer || "1717887"}.php`;
  const titel = optionen.titel === undefined ? "Synthetische Senatsmeldung zur lokalen Vorlage" : optionen.titel;
  const absaetze = optionen.absaetze === undefined
    ? (familie === "rbmskzl" ? [ABSENDER, SACH] : [SACH, SACH2]) : optionen.absaetze;
  const textileInner = optionen.textileInner === undefined
    ? absaetze.map(absatz => `<p>${absatz}</p>`).join("") : optionen.textileInner;
  const textileTag = optionen.textileTag === undefined ? `<div class="textile">${textileInner}</div>` : optionen.textileTag;
  const pmDatum = optionen.pmDatum === undefined ? dmY(datum) : optionen.pmDatum;
  const pressnumber = optionen.pressnumber === undefined
    ? `<p class="pressnumber">Pressemitteilung vom ${pmDatum}</p>` : optionen.pressnumber;
  const download = optionen.download === undefined ? (familie === "senweb" ? PDF_MODUL : "") : optionen.download;
  const meta = optionen.meta === undefined
    ? `<meta name="dcterms.date" content="${datum}"><meta name="dcterms.title" content="${titel}">` : optionen.meta;
  const canonicalHref = optionen.canonicalHref === undefined ? url : optionen.canonicalHref;
  const canonicalTag = optionen.canonicalTag === undefined
    ? (canonicalHref === null ? "" : `<link rel="canonical" href="${canonicalHref}">`) : optionen.canonicalTag;
  const herounit = optionen.herounit === undefined
    ? `<div id="layout-grid__area--herounit"><h1 class="title">${titel}</h1></div>` : optionen.herounit;
  const kopf = `<div class="anker-jumptocontact"><a href="#kontakt">Direkt zur Kontaktinformation</a></div>`;
  const artikel = optionen.vorPressnumber
    ? kopf + textileTag + pressnumber + download : kopf + pressnumber + textileTag + download;
  const marginal = optionen.marginal === undefined ? MARGINAL : optionen.marginal;
  const canonicalOrt = optionen.canonicalImBody ? `<body>${canonicalTag}` : `<body>`;
  const canonicalKopf = optionen.canonicalImBody ? "" : canonicalTag;
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">${meta}${canonicalKopf}</head>`
    + `${canonicalOrt}${herounit}<div id="layout-grid__area--maincontent">${artikel}</div>${marginal}</body></html>`;
  const eingabe = {
    url: optionen.eingangUrl || url,
    finalUrl: optionen.eingangFinalUrl || url,
    http: optionen.http === undefined ? 200 : optionen.http,
    html: optionen.html === undefined ? html : optionen.html
  };
  return { eingabe, url, titel, datum, absaetze };
}

function erwarteAbbruch(eingabe, label, grund) {
  let meldung = null;
  try { M.pruefeSondervorlage(eingabe); } catch (error) { meldung = error && error.message; }
  assert.ok(meldung, `nicht abgelehnt: ${label}`);
  assert.ok(/^berlin-presse-sondervorlagen-/.test(meldung), `fremder Fehler bei ${label}: ${meldung}`);
  if (grund) assert.equal(meldung, `berlin-presse-sondervorlagen-${grund}`, `Grund bei ${label}`);
  bestanden += 1;
  console.log(`OK negativ abgelehnt: ${label} (${meldung.slice("berlin-presse-sondervorlagen-".length)})`);
}

// ---------------------------------------------------------------------------------------------
// 1) Vertragsoberflaeche
// ---------------------------------------------------------------------------------------------
check("Version und Pfadfamilien exakt", M.VERSION === "berlin-presse-sondervorlagen-v1"
  && M.FAMILIEN_NAMEN.join(",") === "rbmskzl,senweb,justv,kultgz,asgiva,uvk,wgp");
check("Vertragsausgang exakt neun Felder", M.AUSGANG_FELDER.join(",")
  === "url,pfadfamilie,titel,publikationstag,volltext,volltextHash,htmlHash,auszug,auszugHash");
check("Auszugsgrenzen gebunden", M.MIN_AUSZUG_ZEICHEN > 0
  && M.MAX_AUSZUG_ZEICHEN >= M.MIN_AUSZUG_ZEICHEN && M.MAX_AUSZUG_ZEICHEN <= 2000);
check("Absenderformel exakt", M.ABSENDER_RB === ABSENDER);

// ---------------------------------------------------------------------------------------------
// 2) Positive beider Pfadfamilien
// ---------------------------------------------------------------------------------------------
{
  const s = seite({ familie: "rbmskzl" });
  const e = M.pruefeSondervorlage(s.eingabe);
  check("rbmskzl: Felder exakt und Ergebnis eingefroren",
    Object.keys(e).join(",") === M.AUSGANG_FELDER.join(",") && Object.isFrozen(e));
  check("rbmskzl: URL und Pfadfamilie", e.url === s.url && e.pfadfamilie === "rbmskzl");
  check("rbmskzl: Titel und reiner Publikationstag", e.titel === s.titel && e.publikationstag === s.datum);
  check("rbmskzl: Volltext ist die Absatzfolge", e.volltext === `${ABSENDER}\n\n${SACH}\n`);
  check("rbmskzl: Auszug ist exakt der zweite Absatz nach der Absenderformel", e.auszug === SACH);
  check("rbmskzl: eigene Hashes stimmen", e.volltextHash === sha256(e.volltext)
    && e.htmlHash === sha256(s.eingabe.html) && e.auszugHash === sha256(e.auszug));
  check("rbmskzl: kein Kontakt-/Modulinhalt und keine erfundene Uhrzeit",
    !/Jüdenstr|mailto:|Tel\.:|PDF-Dokument|link--download/.test(e.volltext + e.auszug)
    && !Object.hasOwn(e, "publishedAt") && !Object.hasOwn(e, "uhrzeit")
    && !/[T ]\d{2}:\d{2}/.test([e.url, e.titel, e.publikationstag, e.volltextHash, e.htmlHash].join(" ")));
}
{
  const s = seite({ familie: "senweb" });
  const e = M.pruefeSondervorlage(s.eingabe);
  check("senweb: Pfadfamilie und Tag", e.pfadfamilie === "senweb" && e.publikationstag === s.datum);
  check("senweb: Auszug ist exakt der erste Sachabsatz", e.auszug === SACH
    && e.volltext === `${SACH}\n\n${SACH2}\n`);
  check("senweb: PDF-Downloadmodul wird nicht Artikeltext",
    s.eingabe.html.includes("modul-download") && !e.volltext.includes("PDF-Dokument")
    && !e.volltext.includes("Download") && !e.volltext.includes(".pdf"));
  check("senweb: Kontaktblock bleibt ausgeschlossen",
    !/mailto:|Tel\.:|Jüdenstr|Kontakt</.test(e.volltext + e.auszug));
  check("senweb: eigener Auszughash", e.auszugHash === sha256(SACH) && e.auszugHash !== e.volltextHash);
}
{
  const s = seite({ familie: "justv" });
  const e = M.pruefeSondervorlage(s.eingabe);
  check("justv: Pfadfamilie, Tag und erster Sachabsatz", e.pfadfamilie === "justv"
    && e.publikationstag === s.datum && e.auszug === SACH && e.volltext.includes(SACH2));
}
{
  const artikel = "<p>" + SACH + ' <a href="mailto:kontakt@ehrenamtskarte.berlin.de">E-Mail</a></p>'
    + "<p>" + SACH2 + "</p>";
  const s = seite({ familie: "kultgz", textileInner: artikel });
  const e = M.pruefeSondervorlage(s.eingabe);
  check("kultgz: exakt ein sichtbarer Sach-Mailto-Link", e.pfadfamilie === "kultgz"
    && e.auszug.includes("E-Mail") && e.volltext.includes(SACH2));
  const zwei = "<p>" + SACH + ' <a href="mailto:a@ehrenamtskarte.berlin.de">A</a>'
    + ' <a href="mailto:b@ehrenamtskarte.berlin.de">B</a></p><p>' + SACH2 + "</p>";
  erwarteAbbruch(seite({ familie: "kultgz", textileInner: zwei }).eingabe,
    "kultgz zwei Mailto-Links", "kontaktblock-im-artikel");
  const query = "<p>" + SACH + ' <a href="mailto:kontakt@ehrenamtskarte.berlin.de?x=1">E-Mail</a></p>'
    + "<p>" + SACH2 + "</p>";
  erwarteAbbruch(seite({ familie: "kultgz", textileInner: query }).eingabe,
    "kultgz Mailto mit Query", "kontaktblock-im-artikel");
  const frei = "<p>" + SACH + " mailto:kontakt@ehrenamtskarte.berlin.de</p><p>" + SACH2 + "</p>";
  erwarteAbbruch(seite({ familie: "kultgz", textileInner: frei }).eingabe,
    "kultgz Mailto ausserhalb eines Links", "kontaktblock-im-artikel");
  const telefon = "<p>" + SACH + ' <a href="mailto:kontakt@ehrenamtskarte.berlin.de">E-Mail</a>'
    + ' <a href="tel:+49301234567">Telefon</a></p><p>' + SACH2 + "</p>";
  erwarteAbbruch(seite({ familie: "kultgz", textileInner: telefon }).eingabe,
    "kultgz Telefon neben Sach-Mailto", "kontaktblock-im-artikel");
  const kontakt = "<div class=\"contact\"><p>" + SACH
    + ' <a href="mailto:kontakt@ehrenamtskarte.berlin.de">E-Mail</a></p></div><p>' + SACH2 + "</p>";
  erwarteAbbruch(seite({ familie: "kultgz", textileInner: kontakt }).eingabe,
    "kultgz Kontaktmodul mit Sach-Mailto", "kontaktblock-im-artikel");
}
{
  const textileInner = `<p>${SACH}</p><p>${SACH2}</p>${ASGIVA_ZUSATZ}`;
  const s = seite({ familie: "asgiva", nummer: "1719881", datum: "2026-09-30", textileInner });
  const e = M.pruefeSondervorlage(s.eingabe);
  check("asgiva: exakte Pfadfamilie mit engem Hinweis-/Strong-/Listenblock",
    e.pfadfamilie === "asgiva" && e.url.includes("/sen/asgiva/presse/pressemitteilungen/")
    && e.auszug === SACH);
  check("asgiva: Volltext bindet nur sichtbare Texte in Quellenreihenfolge",
    e.volltext === [SACH, SACH2, ASGIVA_HINWEIS, ASGIVA_STARK, ASGIVA_LISTE1, ASGIVA_LISTE2]
      .join("\n\n") + "\n"
    && !/href=|<\/?(?:a|strong|ul|li)/i.test(e.volltext));
  check("asgiva: keine erfundene Uhrzeit", !Object.hasOwn(e, "publishedAt")
    && !Object.hasOwn(e, "uhrzeit") && !/[T ]\d{2}:\d{2}/.test(e.publikationstag));
}
{
  const textileInner = `<p>${SACH}</p>`
    + `<p><strong>${ASGIVA_INLINE_STARK}</strong> ${SACH2}</p>`
    + `<p>${ASGIVA_INLINE_TEXT}</p>${ASGIVA_HINWEIS}`
    + `<ul><li><a href="/kaeltehilfe">${ASGIVA_LISTE1}</a></li>`
    + `<li><a href="${ASGIVA_EXTERN}">${ASGIVA_LISTE2}</a></li></ul>`;
  const s = seite({ familie: "asgiva", nummer: "1719881", datum: "2026-09-30", textileInner });
  const e = M.pruefeSondervorlage(s.eingabe);
  check("asgiva: inline STRONG im direkten P wird als Text gebunden",
    e.auszug === SACH
    && e.volltext === [SACH, `${ASGIVA_INLINE_STARK} ${SACH2}`, ASGIVA_INLINE_TEXT,
      ASGIVA_HINWEIS, ASGIVA_LISTE1, ASGIVA_LISTE2].join("\n\n") + "\n"
    && !/href=|<\/?(?:a|strong|ul|li)/i.test(e.volltext));
  check("asgiva: exakte Kaeltehilfe-URL zusaetzlich zu berlin.de-Links erlaubt",
    s.eingabe.html.includes(ASGIVA_EXTERN) && e.volltext.includes(ASGIVA_LISTE2));
}

// ---------------------------------------------------------------------------------------------
// Eng belegte ASGIVA-Faktenblattform: Sach-Mail ist kein Kontaktkasten.
{
  const adresse = "pressestelle@senasgiva.berlin.de";
  const mail = `<a href="mailto:${adresse}" title="${adresse}">${adresse}</a>`;
  const sach = `<p>${SACH}</p><p>${SACH2}</p><p>Dritter synthetischer Sachabsatz zur Gewalthilfe.</p>`;
  const angebot = `<p>Sie können unter ${mail} ein Faktenblatt zur Gewalthilfe in Berlin anfordern.</p>`;
  const form = sach + angebot;
  const probe = textileInner => seite({ familie: "asgiva", nummer: "1721958",
    datum: "2026-10-06", textileInner });
  const s = probe(form);
  const e = M.pruefeSondervorlage(s.eingabe);
  check("asgiva Faktenblatt: kompletter Sachtext und eigene Hashes, ohne Randkontakt",
    e.volltext.endsWith(`Sie können unter ${adresse} ein Faktenblatt zur Gewalthilfe in Berlin anfordern.\n`)
    && e.auszug === SACH && e.htmlHash === sha256(s.eingabe.html)
    && e.volltextHash === sha256(e.volltext) && e.publikationstag === "2026-10-06"
    && !e.volltext.includes("Jüdenstr") && !e.volltext.includes("href="));
  for (const [label, html] of [
    ["zweiter Mail-Link", form.replace(mail, mail + mail)],
    ["zweite Mailto-Nennung", form.replace("Sie können", "mailto: Sie können")],
    ["fremde Mail-Adresse", form.replaceAll(adresse, "presse@example.com")],
    ["Mail-Query", form.replace(`href="mailto:${adresse}"`, `href="mailto:${adresse}?subject=Info"`)],
    ["Mail-Fragment", form.replace(`href="mailto:${adresse}"`, `href="mailto:${adresse}#info"`)],
    ["zusaetzliches Linkattribut", form.replace("<a href", '<a class="kontakt" href')],
    ["doppeltes href", form.replace(`href="mailto:${adresse}"`, `href="mailto:${adresse}" href="mailto:${adresse}"`)],
    ["anderes Linklabel", form.replace(`>${adresse}</a>`, ">Kontakt</a>")],
    ["verschachteltes Linklabel", form.replace(`>${adresse}</a>`, `><span>${adresse}</span></a>`)],
    ["anderer Titel", form.replace(`title="${adresse}"`, 'title="Kontakt"')],
    ["loser Mail-Link", sach + mail],
    ["Mail in Liste", sach + `<ul><li>${mail}</li></ul>`],
    ["anderer Satz", form.replace("ein Faktenblatt zur Gewalthilfe in Berlin anfordern.", "Kontakt aufnehmen.")],
    ["weiterer Absatz", form + "<p>Kontakt aufnehmen.</p>"],
    ["versteckter Mail-Link", form.replace("<a href", "<a hidden href")],
    ["Download-Mail", form.replace("<a href", "<a download href")],
    ["Kontaktkennung im Absatz", form.replace("<p>Sie können", '<p class="contact">Sie können')],
    ["Address im Angebot", form.replace(mail, `<address>${mail}</address>`)],
    ["Telefon im Angebot", form.replace(mail, mail + '<a href="tel:030123">Telefon</a>')]
  ]) erwarteAbbruch(probe(html).eingabe, "asgiva Faktenblatt " + label);
  for (const familie of ["justv", "senweb", "rbmskzl"])
    erwarteAbbruch(seite({ familie, textileInner: form }).eingabe,
      "Faktenblatt-Ausnahme gilt nicht fuer " + familie, "kontaktblock-im-artikel");
}

// Amtlich belegte UVK/WGP-Familien; alle gemeinsamen Abbruchgrenzen bleiben Pflicht.
for (const familie of ["uvk", "wgp"]) {
  const s = seite({ familie });
  const e = M.pruefeSondervorlage(s.eingabe);
  check(familie + ": eigene exakte Familie, voller Sachauszug und Text-/HTML-Pins",
    e.pfadfamilie === familie && e.auszug === SACH && e.volltext === `${SACH}\n\n${SACH2}\n`
    && e.htmlHash === sha256(s.eingabe.html) && e.volltextHash === sha256(e.volltext));
  for (const [label, inner] of [
    ["Kontaktkasten", `<div class="contact"><p>${SACH}</p></div>`],
    ["Address", `<p>${SACH}</p><address>Kontakt</address>`],
    ["Mail", `<p>${SACH} <a href="mailto:presse@berlin.de">Mail</a></p>`],
    ["Telefon", `<p>${SACH} <a href="tel:030123">Telefon</a></p>`],
    ["versteckter Absatz", `<p hidden>${SACH}</p>`],
    ["Skript", `<p>${SACH}<script>hidden</script></p>`]
  ]) erwarteAbbruch(seite({ familie, textileInner: inner }).eingabe, familie + " " + label);
}
{
  const vorspann = "Dr. Ina Czyborra, Senatorin für Wissenschaft, Gesundheit und Pflege zur heutigen Verkündung des Nobelpreiskomitees:";
  const titel = "Berlin ist stolz auf seinen neuen Nobel-Preisträger: Senatorin Ina Czyborra gratuliert Professor Peter Hegemann";
  const optionen = { familie: "wgp", nummer: "1721444", datum: "2026-10-05", titel,
    absaetze: [vorspann, SACH] };
  const e = M.pruefeSondervorlage(seite(optionen).eingabe);
  check("WGP Attribution: nur gebundener zweiter Sachabsatz, erster bleibt vollstaendig",
    vorspann.length < M.MIN_AUSZUG_ZEICHEN && e.auszug === SACH
    && e.volltext === `${vorspann}\n\n${SACH}\n` && e.auszugHash === sha256(SACH));
  for (const [label, delta] of [
    ["andere Kennung", { nummer: "1721445" }],
    ["anderer Titel", { titel: titel + " Drift" }],
    ["anderer Tag", { datum: "2026-10-06" }],
    ["anderer Vorspann", { absaetze: [vorspann.replace("Dr.", "Prof."), SACH] }],
    ["zusaetzlicher Absatz", { absaetze: [vorspann, SACH, SACH2] }],
    ["kein Sachabsatz", { absaetze: [vorspann] }],
    ["zu kurzer Sachabsatz", { absaetze: [vorspann, "Kurzer Absatz."] }],
    ["zu langer Sachabsatz", { absaetze: [vorspann, "X".repeat(M.MAX_AUSZUG_ZEICHEN + 1)] }]
  ]) erwarteAbbruch(seite({ ...optionen, ...delta }).eingabe, "WGP Attribution " + label);
}

// 3) Eingang und Adresse
// ---------------------------------------------------------------------------------------------
erwarteAbbruch({ ...seite().eingabe, extra: 1 }, "zusaetzliches Eingabefeld", "eingabefelder-ungueltig");
erwarteAbbruch({ url: seite().url, finalUrl: seite().url, http: 200 }, "html fehlt", "eingabefelder-ungueltig");
erwarteAbbruch(seite({ http: 204 }).eingabe, "HTTP nicht 200", "http-nicht-ok");
erwarteAbbruch(seite({ url: "http://www.berlin.de/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1717887.php" }).eingabe,
  "unverschluesselte URL", "url-ungueltig");
erwarteAbbruch(seite({ host: "example.com" }).eingabe, "fremder Host", "url-ungueltig");
erwarteAbbruch(seite({ url: "https://www.berlin.de:8443/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1717887.php" }).eingabe,
  "Portangabe", "url-ungueltig");
erwarteAbbruch(seite({ url: "https://presse@www.berlin.de/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1717887.php" }).eingabe,
  "Benutzerinfo", "url-ungueltig");
erwarteAbbruch(seite({ url: "https://www.berlin.de/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1717887.php?ts=1790150970" }).eingabe,
  "Query/Tracking", "url-ungueltig");
erwarteAbbruch(seite({ url: "https://www.berlin.de/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1717887.php#top" }).eingabe,
  "Fragment", "url-ungueltig");
erwarteAbbruch(seite({ eingangFinalUrl: "https://www.berlin.de/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1717654.php" }).eingabe,
  "finalUrl abweichend", "url-nicht-finalurl");
erwarteAbbruch(seite({ url: "https://www.berlin.de/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php" }).eingabe,
  "Pressearchivpfad", "pfadfamilie-ungueltig");
erwarteAbbruch(seite({ url: "https://www.berlin.de/sen/inn/presse/pressemitteilungen/2026/pressemitteilung.1717887.php" }).eingabe,
  "anderer Senatspfad", "pfadfamilie-ungueltig");
erwarteAbbruch(seite({ url: "https://www.berlin.de/sen/asgiva/aktuelles/pressemitteilungen/2026/pressemitteilung.1719881.php" }).eingabe,
  "ASGIVA-Pfad ausserhalb der exakten Familie", "pfadfamilie-ungueltig");
erwarteAbbruch(seite({ url: "https://www.berlin.de/rbmskzl/aktuelles/pressemitteilungen/pressemitteilung.1717887.php" }).eingabe,
  "Pfad ohne Jahressgement", "pfadfamilie-ungueltig");
erwarteAbbruch(seite({ url: "https://www.berlin.de/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1717887.html" }).eingabe,
  "Pfadfamilie mit falscher Endung", "pfadfamilie-ungueltig");
erwarteAbbruch(seite({ url: "https://www.berlin.de/rbmskzl/aktuelles/2026/pressemitteilung.1717887.php" }).eingabe,
  "verkuerzter Senatskanzleipfad", "pfadfamilie-ungueltig");

// ---------------------------------------------------------------------------------------------
// 4) Canonical, Meta, H1, Pressnumber
// ---------------------------------------------------------------------------------------------
erwarteAbbruch(seite({ canonicalHref: null }).eingabe, "Canonical fehlt", "canonical-mehrdeutig-oder-fehlend");
{
  const s = seite();
  const doppelt = { ...s.eingabe, html: s.eingabe.html.replace("<link rel=\"canonical\"",
    `<link rel="canonical" href="${s.url}"><link rel="canonical"`) };
  erwarteAbbruch(doppelt, "Canonical doppelt", "canonical-mehrdeutig-oder-fehlend");
}
erwarteAbbruch(seite({ canonicalImBody: true }).eingabe, "Canonical ausserhalb head", "canonical-nicht-im-head");
erwarteAbbruch(seite({ canonicalHref: "https://www.berlin.de/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1717654.php" }).eingabe,
  "Canonical auf andere amtliche Seite", "finalurl-nicht-canonical");
erwarteAbbruch(seite({ canonicalHref: "https://example.com/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1717887.php" }).eingabe,
  "Canonical auf fremdem Host", "canonical-ungueltig");
erwarteAbbruch(seite({ jahr: "2025" }).eingabe, "Pfadjahr weicht vom Tag ab", "pfadjahr-abweichend");
erwarteAbbruch(seite({ datum: "2026-02-30" }).eingabe, "ungueltiger Kalendertag", "dcterms.date-ungueltig");
erwarteAbbruch(seite({ meta: `<meta name="dcterms.title" content="X">` }).eingabe,
  "dcterms.date fehlt", "dcterms.date-mehrdeutig-oder-fehlend");
erwarteAbbruch(seite({ herounit: `<div id="layout-grid__area--herounit"><h1 class="title">Anderer Titel</h1></div>` }).eingabe,
  "H1 weicht vom Titel ab", "h1-titel-abweichend");
erwarteAbbruch(seite({ herounit: `<div id="layout-grid__area--herounit"></div>` }).eingabe,
  "H1 fehlt", "h1-mehrdeutig-oder-fehlend");
erwarteAbbruch(seite({ pmDatum: dmY("2026-09-20") }).eingabe, "Pressnumber-Datum abweichend", "pressemitteilung-datum-abweichend");
erwarteAbbruch(seite({ pressnumber: "" }).eingabe, "Pressnumber fehlt", "pressemitteilung-datum-mehrdeutig-oder-fehlend");
erwarteAbbruch(seite({ pressnumber: `<p class="pressnumber">Pressemitteilung vom 24.09.2026</p>`
  + `<p class="pressnumber">Pressemitteilung vom 24.09.2026</p>` }).eingabe,
  "Pressnumber doppelt", "pressemitteilung-datum-mehrdeutig-oder-fehlend");

// ---------------------------------------------------------------------------------------------
// 5) Artikelgrenze, versteckte Strukturen, Fremdinhalt
// ---------------------------------------------------------------------------------------------
erwarteAbbruch(seite({ textileTag: "" }).eingabe, "Textile fehlt", "textile-mehrdeutig-oder-fehlend");
erwarteAbbruch(seite({ textileTag: `<div class="textile"><p>${ABSENDER}</p></div>`
  + `<div class="textile"><p>${SACH}</p></div>` }).eingabe,
  "zwei Textile im Artikelbereich", "textile-mehrdeutig-oder-fehlend");
erwarteAbbruch(seite({ vorPressnumber: true }).eingabe, "Textile vor dem Pressnumber", "textile-mehrdeutig-oder-fehlend");
erwarteAbbruch(seite({ textileTag: `<div hidden><div class="textile"><p>${SACH}</p></div></div>` }).eingabe,
  "versteckte Huelle um Textile", "textile-in-versteckter-huelle");
erwarteAbbruch(seite({ textileTag: `<div class="textile"><p>${SACH}</p></div>`
  + `<!-- <div class="textile"><p>${SACH2}</p></div> -->` }).eingabe,
  "kommentierter Textile-Doppler", "versteckter-doppler");
erwarteAbbruch(seite({ textileInner: `<p>${SACH}</p><p hidden>${SACH2}</p>` }).eingabe,
  "versteckter Absatz", "versteckter-inhalt-im-textile");
erwarteAbbruch(seite({ textileInner: `<p>${SACH}</p><script>var x = 1;</script>` }).eingabe,
  "Skript im Artikeltext", "skript-oder-kommentar-im-artikel");
erwarteAbbruch(seite({ textileTag: `<div class="textile"><p>${SACH}</p><p>${SACH2}</div></p>` }).eingabe,
  "ausbrechende Absatzgrenze", "absatz-nicht-geschlossen");
erwarteAbbruch(seite({ download: `<p>Loser Absatz zwischen Artikeltext und Randbereich.</p>` }).eingabe,
  "loser Absatz neben dem Artikel", "absatz-ausserhalb-artikel");
erwarteAbbruch(seite({ textileInner: `<p>${SACH}</p><div class="modul-download">`
  + `<a href="/x.pdf">Download</a></div>` }).eingabe,
  "PDF-Modul im Artikeltext", "downloadmodul-im-artikel");
erwarteAbbruch(seite({ textileInner: `<p>${SACH}</p><address>Kontakt</address>` }).eingabe,
  "Kontaktblock im Artikeltext", "kontaktblock-im-artikel");
erwarteAbbruch(seite({ textileInner: `<p>${SACH} <a href="mailto:presse@berlin.de">Mail</a></p>` }).eingabe,
  "Mailto im Artikeltext", "kontaktblock-im-artikel");
erwarteAbbruch(seite({ textileInner: `<p>${SACH}</p><ul><li>Fremd</li></ul>` }).eingabe,
  "Fremdinhalt statt nur Absaetzen", "textile-fremdinhalt");
erwarteAbbruch(seite({ absaetze: [ABSENDER, SACH, SACH] }).eingabe, "Absatz-Doppler", "absatz-doppler");

// Die ASGIVA-Ausnahme bleibt eine eigene, direkte Grammatik und weitet keine andere Familie aus.
const asgivaSeite = textileInner => seite({ familie: "asgiva", nummer: "1719881",
  datum: "2026-09-30", textileInner }).eingabe;
const asgivaLinkSeite = href => asgivaSeite(`<p>${SACH}</p>`
  + `<ul><li><a href="${href}">${ASGIVA_LISTE1}</a></li></ul>`);
erwarteAbbruch(asgivaSeite(`<p>${SACH}</p>${ASGIVA_ZUSATZ}<ul><li>Zusatzliste</li></ul>`),
  "asgiva mehrere UL", "asgiva-struktur-ungueltig");
erwarteAbbruch(asgivaSeite(`<p>${SACH}</p><strong>${ASGIVA_STARK}</strong><strong>Zweiter Titel</strong>`),
  "asgiva mehrere STRONG", "asgiva-struktur-ungueltig");
erwarteAbbruch(asgivaSeite(`<p>${SACH}</p><p><strong>${ASGIVA_STARK}</strong> ${SACH2}</p>`
  + `${ASGIVA_HINWEIS}<strong>Zweiter Titel</strong>`),
  "asgiva direktes und inline STRONG zusammen", "asgiva-struktur-ungueltig");
erwarteAbbruch(asgivaSeite(`<p>${SACH}</p><ul><li><strong>${ASGIVA_STARK}</strong> ${ASGIVA_LISTE1}</li></ul>`),
  "asgiva STRONG in LI", "asgiva-struktur-ungueltig");
erwarteAbbruch(asgivaSeite(`<p>${SACH}</p><p><em><strong>${ASGIVA_STARK}</strong></em> ${SACH2}</p>`),
  "asgiva STRONG unter Inline-Element", "asgiva-struktur-ungueltig");
erwarteAbbruch(asgivaSeite(`<p>${SACH}</p><p><strong></strong> ${SACH2}</p>`),
  "asgiva leeres STRONG", "asgiva-strong-ungueltig");
erwarteAbbruch(asgivaSeite(`<p>${SACH}</p><p><strong>   </strong> ${SACH2}</p>`),
  "asgiva STRONG nur Leerraum", "asgiva-strong-ungueltig");
erwarteAbbruch(asgivaSeite(`<p>${SACH}</p><p><strong><em>${ASGIVA_STARK}</em></strong> ${SACH2}</p>`),
  "asgiva STRONG mit Elementkind", "asgiva-strong-ungueltig");
erwarteAbbruch(asgivaSeite(`<p>${SACH}</p><ul></ul>`),
  "asgiva leere UL", "asgiva-liste-ungueltig");
erwarteAbbruch(asgivaSeite(`<p>${SACH}</p>${ASGIVA_HINWEIS}<strong>${ASGIVA_STARK}</strong>`
  + `<ul><li>${ASGIVA_LISTE1}<ul><li>Verschachtelt</li></ul></li></ul>`),
  "asgiva verschachtelte Liste", "asgiva-struktur-ungueltig");
erwarteAbbruch(asgivaSeite(`<p>${SACH}</p><ul><li><a href="https://example.com/info">Extern</a></li></ul>`),
  "asgiva externer HTTPS-Link", "asgiva-link-ungueltig");
erwarteAbbruch(asgivaLinkSeite("https://www.kaeltehilfe-berlin.de/kaeltehilfe"),
  "asgiva Kaeltehilfe fremder Pfad", "asgiva-link-ungueltig");
erwarteAbbruch(asgivaLinkSeite("https://www.kaeltehilfe-berlin.de/"),
  "asgiva Kaeltehilfe Root mit Slash", "asgiva-link-ungueltig");
erwarteAbbruch(asgivaLinkSeite("https://kaeltehilfe-berlin.de"),
  "asgiva Kaeltehilfe ohne www", "asgiva-link-ungueltig");
erwarteAbbruch(asgivaLinkSeite("https://www.kaeltehilfe-berlin.de.evil.example"),
  "asgiva Kaeltehilfe fremder Suffixhost", "asgiva-link-ungueltig");
erwarteAbbruch(asgivaLinkSeite("https://user@www.kaeltehilfe-berlin.de"),
  "asgiva Kaeltehilfe Benutzerinfo", "asgiva-link-ungueltig");
erwarteAbbruch(asgivaLinkSeite("https://www.kaeltehilfe-berlin.de:8443"),
  "asgiva Kaeltehilfe Port", "asgiva-link-ungueltig");
erwarteAbbruch(asgivaLinkSeite("https://www.kaeltehilfe-berlin.de?x=1"),
  "asgiva Kaeltehilfe Query", "asgiva-link-ungueltig");
erwarteAbbruch(asgivaLinkSeite("https://www.kaeltehilfe-berlin.de#top"),
  "asgiva Kaeltehilfe Fragment", "asgiva-link-ungueltig");
erwarteAbbruch(asgivaLinkSeite("http://www.kaeltehilfe-berlin.de"),
  "asgiva Kaeltehilfe HTTP", "asgiva-link-ungueltig");
erwarteAbbruch(asgivaSeite(`<p>${SACH}</p><ul><li><a href="http://berlin.de/info">HTTP</a></li></ul>`),
  "asgiva unsicherer HTTP-Link", "asgiva-link-ungueltig");
erwarteAbbruch(asgivaSeite(`<p>${SACH}</p><ul><li><a href="https://user@berlin.de/info">Benutzerinfo</a></li></ul>`),
  "asgiva Link mit Benutzerinfo", "asgiva-link-ungueltig");
erwarteAbbruch(asgivaSeite(`<p>${SACH}</p><ul><li><a href="https://berlin.de:8443/info">Port</a></li></ul>`),
  "asgiva Link mit Port", "asgiva-link-ungueltig");
erwarteAbbruch(asgivaSeite(`<p>${SACH}</p><ul><li><a href="/sen/asgiva/info?x=1">Query</a></li></ul>`),
  "asgiva Root-Link mit Query", "asgiva-link-ungueltig");
erwarteAbbruch(asgivaSeite(`<p>${SACH}</p><ul><li><a href="https://berlin.de/sen/asgiva/info#anker">Fragment</a></li></ul>`),
  "asgiva HTTPS-Link mit Fragment", "asgiva-link-ungueltig");
erwarteAbbruch(asgivaSeite(`<p>${SACH}</p><ul><li><a href="mailto:presse@berlin.de">Mail</a></li></ul>`),
  "asgiva Mailto", "kontaktblock-im-artikel");
erwarteAbbruch(asgivaSeite(`<p>${SACH}</p><ul><li><a href="tel:+493012345">Telefon</a></li></ul>`),
  "asgiva Telefon", "kontaktblock-im-artikel");
erwarteAbbruch(asgivaSeite(`<p>${SACH}</p><ul hidden><li>${ASGIVA_LISTE1}</li></ul>`),
  "asgiva verborgene Liste", "versteckter-inhalt-im-textile");
erwarteAbbruch(asgivaSeite(`<p>${SACH}</p><ul aria-hidden="true"><li>${ASGIVA_LISTE1}</li></ul>`),
  "asgiva aria-hidden-Liste", "versteckter-inhalt-im-textile");
erwarteAbbruch(asgivaSeite(`<p>${SACH}</p><ul style="display: none"><li>${ASGIVA_LISTE1}</li></ul>`),
  "asgiva display-none-Liste", "versteckter-inhalt-im-textile");
erwarteAbbruch(asgivaSeite(`<p>${SACH}</p>${ASGIVA_ZUSATZ}Nicht erlaubter Zusatztext.`),
  "asgiva nackter Zusatztext nach der Liste", "asgiva-struktur-ungueltig");
erwarteAbbruch(asgivaSeite(`<p>${SACH}</p><div class="contact"><p>${SACH2}</p></div>`),
  "asgiva Kontaktblock", "kontaktblock-im-artikel");
erwarteAbbruch(asgivaSeite(`<p>${SACH}</p><ul><li><a download href="/sen/asgiva/datei.pdf">Download</a></li></ul>`),
  "asgiva Downloadlink", "downloadmodul-im-artikel");

// ---------------------------------------------------------------------------------------------
// 6) Auszug: belegte Form je Familie, substanziell, gebunden
// ---------------------------------------------------------------------------------------------
erwarteAbbruch(seite({ absaetze: ["Das Presse- und Informationsamt des Landes Berlin teilt mit", SACH] }).eingabe,
  "RB ohne exakte Absenderformel", "absenderformel-abweichend");
erwarteAbbruch(seite({ absaetze: [ABSENDER] }).eingabe, "RB ohne zweiten Absatz", "absenderformel-oder-sachabsatz-fehlend");
erwarteAbbruch(seite({ absaetze: [ABSENDER, "Zu kurz."] }).eingabe, "RB mit zu kurzem Sachabsatz", "auszug-zu-kurz");
erwarteAbbruch(seite({ familie: "senweb", absaetze: [ABSENDER, SACH] }).eingabe,
  "SenWEB ohne ersten Sachabsatz", "sachabsatz-fehlend");
erwarteAbbruch(seite({ familie: "senweb", absaetze: ["Kurz.", SACH] }).eingabe,
  "SenWEB mit zu kurzem ersten Absatz", "auszug-zu-kurz");
erwarteAbbruch(seite({ familie: "senweb", absaetze: [SACH + " " + "Weiterer Satz der synthetischen Probe.".repeat(40)] }).eingabe,
  "Auszug laenger als die gebundene Grenze", "auszug-zu-lang");
erwarteAbbruch(seite({ familie: "senweb", absaetze: ["x".repeat(M.MAX_AUSZUG_ZEICHEN + 1)] }).eingabe,
  "Auszug ueber Grenze (Zeichenprobe)", "auszug-zu-lang");

// ---------------------------------------------------------------------------------------------
// 7) Hash-Bindung: stabil, inhaltsabhaengig, keine Kuerzung des Auszugs
// ---------------------------------------------------------------------------------------------
{
  const s = seite({ familie: "rbmskzl" });
  const a = M.pruefeSondervorlage(s.eingabe);
  const b = M.pruefeSondervorlage(seite({ familie: "rbmskzl" }).eingabe);
  check("Hash-Drift: gleicher Inhalt ergibt gleiche Hashes",
    a.volltextHash === b.volltextHash && a.auszugHash === b.auszugHash && a.htmlHash === b.htmlHash);
  const geaendert = M.pruefeSondervorlage(seite({ familie: "rbmskzl",
    absaetze: [ABSENDER, SACH.replace("synthetische", "synthetisch geaenderte")] }).eingabe);
  check("Hash-Drift: Textaenderung im Auszug veraendert Volltext- und Auszughash",
    geaendert.volltextHash !== a.volltextHash && geaendert.auszugHash !== a.auszugHash
    && geaendert.htmlHash !== a.htmlHash);
  const nurHtml = M.pruefeSondervorlage({ ...s.eingabe, html: s.eingabe.html.replace("<body>", "<body><!-- probe -->") });
  check("Hash-Drift: reine HTML-Aenderung laesst den Volltexthash unveraendert",
    nurHtml.htmlHash !== a.htmlHash && nurHtml.volltextHash === a.volltextHash
    && nurHtml.auszugHash === a.auszugHash);
  check("Auszug ist ungekuerzt der ganze Absatz", a.auszug === SACH && !a.auszug.endsWith("..."));
}

// ---------------------------------------------------------------------------------------------
// 8) Echte lokale Originale (nur wenn vorhanden) — CI-tauglich ohne /private/tmp
// ---------------------------------------------------------------------------------------------
const ORIGINALE = [
  { familie: "rbmskzl", datei: "helmut-berlin-rbmskzl-1717887.html",
    url: "https://www.berlin.de/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1717887.php",
    sha: "9fbe8472be24f8f6f15c02dd58b4780381cecb31a600dfd685eed858ae3efffa", groesse: 42025,
    tag: "2026-09-24", titel: "Berlin zieht Olympiabewerbung zurück – BERLIN+ wird bei der DOSB-Mitgliederversammlung nicht zur Wahl gestellt",
    auszugZeichen: 625, textZeichen: 3697 },
  { familie: "rbmskzl", datei: "helmut-berlin-rbmskzl-1717654.html",
    url: "https://www.berlin.de/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1717654.php",
    sha: "41ee95dc3ad942cf7ec3a1b1da5558cd077ee02e8082f63352aefb5634583b0b", groesse: 38810,
    tag: "2026-09-23", titel: "Pressekonferenz zur Bewerbung Berlins für Olympische und Paralympische Spiele",
    auszugZeichen: 344, textZeichen: 524 },
  { familie: "senweb", datei: "helmut-berlin-senweb-1717406.html",
    url: "https://www.berlin.de/sen/web/presse/pressemitteilungen/2026/pressemitteilung.1717406.php",
    sha: "987f3aef0890eff51caef25bc14671116c98bf7faf5ead1b3a211cfeeb569bbd", groesse: 35850,
    tag: "2026-09-23", titel: "30 Jahre internationale Leitmesse für Verkehrstechnologie",
    auszugZeichen: 240, textZeichen: 3288 }
];
let originalGeprueft = 0;
for (const probe of ORIGINALE) {
  const pfad = path.join(ORIGINAL_DIR, probe.datei);
  if (!fs.existsSync(pfad)) continue;
  const html = fs.readFileSync(pfad, "utf8");
  const ergebnis = M.pruefeSondervorlage({ url: probe.url, finalUrl: probe.url, http: 200, html });
  originalGeprueft += 1;
  check(`Original ${probe.familie} ${probe.url.slice(-18)}: Datei bindet sich (Groesse/SHA256)`,
    Buffer.byteLength(html) === probe.groesse && sha256(html) === probe.sha && ergebnis.htmlHash === probe.sha);
  check(`Original ${probe.familie} ${probe.url.slice(-18)}: Pfadfamilie, Titel, reiner Tag`,
    ergebnis.pfadfamilie === probe.familie && ergebnis.titel === probe.titel
    && ergebnis.publikationstag === probe.tag);
  check(`Original ${probe.familie} ${probe.url.slice(-18)}: Auszug und Textlaenge wie belegt`,
    ergebnis.auszug.length === probe.auszugZeichen
    && ergebnis.volltext.replace(/\n$/, "").length === probe.textZeichen
    && ergebnis.auszugHash === sha256(ergebnis.auszug)
    && ergebnis.volltextHash === sha256(ergebnis.volltext));
  check(`Original ${probe.familie} ${probe.url.slice(-18)}: kein PDF-/Kontaktinhalt, keine Uhrzeit`,
    !/PDF-Dokument|link--download|mailto:|Tel\.:|Jüdenstr/.test(ergebnis.volltext + ergebnis.auszug)
    && !Object.hasOwn(ergebnis, "publishedAt")
    && !/[T ]\d{2}:\d{2}/.test([ergebnis.url, ergebnis.titel, ergebnis.publikationstag,
      ergebnis.volltextHash, ergebnis.htmlHash].join(" ")));
}
if (originalGeprueft === 0) {
  console.log("SKIP lokale Originale: /private/tmp-Originale nicht vorhanden (CI-tauglich)");
}

console.log(`PASS berlin-presse-sondervorlagen-test: ${bestanden} Pruefungen erfolgreich`
  + (originalGeprueft === 0 ? " (ohne lokale Originale)" : ` (mit ${originalGeprueft} lokalen Originalen)`));
