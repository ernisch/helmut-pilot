"use strict";

// Helmut — gezielter Offline-Test des engen Einzelabrufs fuer die belegten Berliner
// Senats-Pressemitteilungs-Pfadfamilien (inkl. der bounded ergaenzten Basen UVK und WGP).
// =============================================================================================
// Prueft lib/helmut/berlin-presse-sondervorlagen-abruf.js. Der echte Abruf wird AUSNAHMSLOS
// injiziert (deps.fetchUrl): es gibt KEIN Netz, KEINE DB, KEIN Modell und KEINE Production-Daten.
// Synthetische Positiv-/Negativproben decken unamtliche URL/Host/Pfad (Ablehnung VOR dem Abruf),
// falsche finale URL, Status, Hostwechsel und Anbietergrenze ab. Zusaetzlich werden — falls
// vorhanden — die drei lokal gesicherten amtlichen Originale unter /private/tmp ueber einen
// injizierten Dateiabruf durch denselben Adapter gefahren (rein lesend, ohne Netz). Fehlen die
// Originale, laeuft derselbe Test vollstaendig weiter (CI-tauglich ohne /private/tmp).
//
// Aufruf: node scripts/berlin-presse-sondervorlagen-abruf-test.js

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ABRUF = require("../lib/helmut/berlin-presse-sondervorlagen-abruf");

const sha256 = wert => crypto.createHash("sha256").update(wert, "utf8").digest("hex");
let bestanden = 0;
function check(name, bedingung) {
  assert.ok(bedingung, name);
  bestanden += 1;
  console.log("OK " + name);
}
const dmY = iso => { const [j, m, t] = iso.split("-"); return `${t}.${m}.${j}`; };

const ABSENDER = "Das Presse- und Informationsamt des Landes Berlin teilt mit:";
const SACH = "Die synthetische Meldung beschreibt einen amtlich belegten Sachverhalt der "
  + "Berliner Landesversorgung und dient ausschliesslich der lokalen Offlinepruefung dieses "
  + "Einzelabrufs.";
const SACH2 = "Ein zweiter, ebenfalls vollstaendiger Sachabsatz derselben synthetischen Meldung "
  + "fuer die gebundene Auszugsgrenze dieser Vorlage.";
const MARGINAL = `<div id="layout-grid__area--marginal" role="complementary">`
  + `<div class="modul-contact"><h2 class="title">Kontakt</h2>`
  + `<address>Presse- und Informationsamt, Tel.: <a href="tel:03090262411">(030) 9026-2411</a>, `
  + `<a href="mailto:presse-information@senatskanzlei.berlin.de">E-Mail</a></address></div></div>`;

// ---------------------------------------------------------------------------------------------
// Synthetische Seite in der belegten Struktur der Pfadfamilien, inklusive der beiden bounded
// ergaenzten Basen UVK und WGP. UVK/WGP nutzen die absenderformelfreie Sachabsatzform [SACH, SACH2].
// ---------------------------------------------------------------------------------------------
function seite(optionen = {}) {
  const familie = optionen.familie || "rbmskzl";
  const datum = optionen.datum || "2026-09-24";
  const jahr = datum.slice(0, 4);
  const basis = Object.freeze({
    rbmskzl: "rbmskzl/aktuelles/pressemitteilungen",
    senweb: "sen/web/presse/pressemitteilungen",
    justv: "sen/justv/presse/pressemitteilungen",
    kultgz: "sen/kultgz/aktuelles/pressemitteilungen",
    asgiva: "sen/asgiva/presse/pressemitteilungen",
    uvk: "sen/uvk/presse/pressemitteilungen",
    wgp: "sen/wgp/presse"
  })[familie];
  const host = optionen.host || "www.berlin.de";
  const url = optionen.url
    || `https://${host}/${basis}/${jahr}/pressemitteilung.${optionen.nummer || "1717887"}.php`;
  const titel = optionen.titel === undefined
    ? "Synthetische Senatsmeldung zur lokalen Vorlage" : optionen.titel;
  const absaetze = optionen.absaetze === undefined
    ? (familie === "rbmskzl" ? [ABSENDER, SACH] : [SACH, SACH2]) : optionen.absaetze;
  const textile = optionen.textile === undefined
    ? `<div class="textile">${absaetze.map(absatz => `<p>${absatz}</p>`).join("")}</div>`
    : optionen.textile;
  const pressnumber = optionen.pressnumber === undefined
    ? `<p class="pressnumber">Pressemitteilung vom ${dmY(datum)}</p>` : optionen.pressnumber;
  const meta = optionen.meta === undefined
    ? `<meta name="dcterms.date" content="${datum}"><meta name="dcterms.title" content="${titel}">`
    : optionen.meta;
  const canonicalHref = optionen.canonicalHref === undefined ? url : optionen.canonicalHref;
  const canonical = canonicalHref === null ? "" : `<link rel="canonical" href="${canonicalHref}">`;
  const herounit = optionen.herounit === undefined
    ? `<div id="layout-grid__area--herounit"><h1 class="title">${titel}</h1></div>` : optionen.herounit;
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">${meta}${canonical}</head>`
    + `<body>${herounit}<div id="layout-grid__area--maincontent">${pressnumber}${textile}</div>`
    + `${MARGINAL}</body></html>`;
  return { url, titel, datum, html };
}

// Injizierter Abruf mit protokollierten Aufrufen. Standardantwort: die synthetische Seite.
function abruf(optionen = {}) {
  const calls = [];
  const fn = async (url, depth, deps) => {
    calls.push({ url, depth, deps });
    if (optionen.throw) throw optionen.throw;
    return { body: optionen.html, finalUrl: optionen.finalUrl || url, status: optionen.status };
  };
  return { calls, fn };
}
const keinErgebnis = ergebnis => Object.hasOwn(ergebnis, "vorlage") === false;

async function laufe() {
  // 1) Vertragsoberflaeche
  check("Version und Statuswunsch exakt", ABRUF.VERSION === "berlin-presse-sondervorlagen-abruf-v1"
    && ABRUF.MELDE_STATUS === true);

  // 2) Positive der Pfadfamilien: injizierter Abruf -> genau das eingefrorene Leserergebnis.
  {
    const s = seite({ familie: "rbmskzl" });
    const p = abruf({ html: s.html, status: 200 });
    const ergebnis = await ABRUF.ladeSondervorlage({ url: s.url }, { fetchUrl: p.fn });
    check("rbmskzl: Erfolg mit eingefrorenem Leserergebnis",
      ergebnis.ok === true && Object.isFrozen(ergebnis.vorlage));
    check("rbmskzl: genau ein Abruf mit URL, Depth, Hostbindung und Statuswunsch",
      p.calls.length === 1 && p.calls[0].url === s.url && p.calls[0].depth === 0
      && p.calls[0].deps.allowedHost === "berlin.de" && p.calls[0].deps.meldeStatus === true);
    check("rbmskzl: Pfadfamilie, Titel, Tag und eigener Auszug",
      ergebnis.vorlage.pfadfamilie === "rbmskzl" && ergebnis.vorlage.titel === s.titel
      && ergebnis.vorlage.publikationstag === s.datum && ergebnis.vorlage.auszug === SACH
      && ergebnis.vorlage.volltext === `${ABSENDER}\n\n${SACH}\n`);
    check("rbmskzl: keine erfundene Uhrzeit und kein Kontakt/PDF im Ergebnis",
      !Object.hasOwn(ergebnis.vorlage, "publishedAt") && !Object.hasOwn(ergebnis.vorlage, "uhrzeit")
      && !/[T ]\d{2}:\d{2}/.test([ergebnis.vorlage.url, ergebnis.vorlage.titel,
        ergebnis.vorlage.publikationstag, ergebnis.vorlage.volltextHash,
        ergebnis.vorlage.htmlHash].join(" "))
      && !/mailto:|Tel\.:|Jüdenstr|PDF-Dokument|link--download|\.pdf/.test(
        ergebnis.vorlage.volltext + ergebnis.vorlage.auszug));
  }
  {
    const s = seite({ familie: "senweb", nummer: "1717406", datum: "2026-09-23" });
    const p = abruf({ html: s.html, status: 200 });
    const ergebnis = await ABRUF.ladeSondervorlage({ url: s.url }, { fetchUrl: p.fn });
    check("senweb: Erfolg, Pfadfamilie und erster Sachabsatz",
      ergebnis.ok === true && ergebnis.vorlage.pfadfamilie === "senweb"
      && ergebnis.vorlage.auszug === SACH && ergebnis.vorlage.publikationstag === "2026-09-23");
    check("senweb: genau ein Abruf an den geprueften Host",
      p.calls.length === 1 && p.calls[0].url === s.url && p.calls[0].deps.allowedHost === "berlin.de");
  }
  {
    const s = seite({ familie: "justv", nummer: "1719894", datum: "2026-09-30" });
    const p = abruf({ html: s.html, status: 200 });
    const ergebnis = await ABRUF.ladeSondervorlage({ url: s.url }, { fetchUrl: p.fn });
    check("justv: Erfolg, Pfadfamilie und genau ein hostgebundener Abruf",
      ergebnis.ok === true && ergebnis.vorlage.pfadfamilie === "justv"
      && ergebnis.vorlage.auszug === SACH && p.calls.length === 1
      && p.calls[0].url === s.url && p.calls[0].deps.allowedHost === "berlin.de");
  }
  {
    const s = seite({ familie: "kultgz", nummer: "1719812", datum: "2026-09-30",
      textile: '<div class="textile"><p>' + SACH
        + ' <a href="mailto:kontakt@ehrenamtskarte.berlin.de">E-Mail</a></p><p>' + SACH2 + "</p></div>" });
    const p = abruf({ html: s.html, status: 200 });
    const ergebnis = await ABRUF.ladeSondervorlage({ url: s.url }, { fetchUrl: p.fn });
    check("kultgz: Erfolg und genau ein hostgebundener Abruf",
      ergebnis.ok === true && ergebnis.vorlage.pfadfamilie === "kultgz" && p.calls.length === 1
      && p.calls[0].url === s.url && p.calls[0].deps.allowedHost === "berlin.de");
  }
  {
    const zusatz = "Weitere amtliche Hinweise:" + "<strong>Weiterführende Informationen</strong>"
      + '<ul><li><a href="/sen/asgiva/info/eins">Erste Informationsseite</a></li>'
      + '<li><a href="https://www.berlin.de/sen/asgiva/info/zwei">Zweite Informationsseite</a></li></ul>';
    const s = seite({ familie: "asgiva", nummer: "1719881", datum: "2026-09-30",
      textile: `<div class="textile"><p>${SACH}</p><p>${SACH2}</p>${zusatz}</div>` });
    const p = abruf({ html: s.html, status: 200 });
    const ergebnis = await ABRUF.ladeSondervorlage({ url: s.url }, { fetchUrl: p.fn });
    check("asgiva: Erfolg mit engem Hinweis-/Listenblock und genau einem hostgebundenen Abruf",
      ergebnis.ok === true && ergebnis.vorlage.pfadfamilie === "asgiva"
      && ergebnis.vorlage.auszug === SACH && p.calls.length === 1
      && p.calls[0].url === s.url && p.calls[0].deps.allowedHost === "berlin.de");
    check("asgiva: Adapter gibt nur gebundene sichtbare Texte ohne Uhrzeit weiter",
      ergebnis.vorlage.volltext.includes("Erste Informationsseite")
      && ergebnis.vorlage.volltext.includes("Zweite Informationsseite")
      && !ergebnis.vorlage.volltext.includes("href=")
      && !Object.hasOwn(ergebnis.vorlage, "publishedAt"));
  }
  {
    // Beide zulaessigen Hosts (mit/ohne www) sind erlaubt; die Hostbindung bleibt berlin.de.
    const s = seite({ host: "berlin.de" });
    const p = abruf({ html: s.html, status: 200 });
    const ergebnis = await ABRUF.ladeSondervorlage({ url: s.url }, { fetchUrl: p.fn });
    check("Ohne www: Erfolg und Hostbindung berlin.de",
      ergebnis.ok === true && p.calls[0].deps.allowedHost === "berlin.de");
  }
  {
    // UVK und WGP: kanonische Adresse ausdruecklich als kanonisch injiziert (canonicalHref === url).
    // WGP traegt kein `pressemitteilungen`-Segment und wird dennoch exakt getragen.
    const urlUvk = "https://www.berlin.de/sen/uvk/presse/pressemitteilungen/2026/pressemitteilung.1719901.php";
    const sUvk = seite({ familie: "uvk", url: urlUvk, canonicalHref: urlUvk,
      nummer: "1719901", datum: "2026-09-29" });
    const pUvk = abruf({ html: sUvk.html, status: 200 });
    const eUvk = await ABRUF.ladeSondervorlage({ url: sUvk.url }, { fetchUrl: pUvk.fn });
    check("uvk: Erfolg, Pfadfamilie und erster Sachabsatz",
      eUvk.ok === true && eUvk.vorlage.pfadfamilie === "uvk"
      && eUvk.vorlage.auszug === SACH && eUvk.vorlage.publikationstag === "2026-09-29");
    check("uvk: genau ein Abruf mit URL, Depth, Hostbindung und Statuswunsch",
      pUvk.calls.length === 1 && pUvk.calls[0].url === urlUvk && pUvk.calls[0].depth === 0
      && pUvk.calls[0].deps.allowedHost === "berlin.de" && pUvk.calls[0].deps.meldeStatus === true);
    check("uvk: keine erfundene Uhrzeit und kein Kontakt/PDF",
      !Object.hasOwn(eUvk.vorlage, "publishedAt")
      && !/mailto:|Tel\.:|PDF-Dokument|\.pdf/.test(eUvk.vorlage.volltext + eUvk.vorlage.auszug));

    const urlWgp = "https://www.berlin.de/sen/wgp/presse/2026/pressemitteilung.1719902.php";
    const sWgp = seite({ familie: "wgp", url: urlWgp, canonicalHref: urlWgp,
      nummer: "1719902", datum: "2026-09-28" });
    const pWgp = abruf({ html: sWgp.html, status: 200 });
    const eWgp = await ABRUF.ladeSondervorlage({ url: sWgp.url }, { fetchUrl: pWgp.fn });
    check("wgp: Erfolg, Pfadfamilie und erster Sachabsatz",
      eWgp.ok === true && eWgp.vorlage.pfadfamilie === "wgp"
      && eWgp.vorlage.auszug === SACH && eWgp.vorlage.publikationstag === "2026-09-28");
    check("wgp: genau ein Abruf mit URL, Depth, Hostbindung und Statuswunsch",
      pWgp.calls.length === 1 && pWgp.calls[0].url === urlWgp && pWgp.calls[0].depth === 0
      && pWgp.calls[0].deps.allowedHost === "berlin.de" && pWgp.calls[0].deps.meldeStatus === true);
    check("wgp: keine erfundene Uhrzeit und kein Kontakt/PDF",
      !Object.hasOwn(eWgp.vorlage, "publishedAt")
      && !/mailto:|Tel\.:|PDF-Dokument|\.pdf/.test(eWgp.vorlage.volltext + eWgp.vorlage.auszug));
  }

  // 3) Unamtliche URL/Host/Pfad: fail closed VOR jedem Abruf.
  {
    const basis = seite();
    const faelle = [
      ["http statt https", basis.url.replace("https://", "http://")],
      ["fremder Host", seite({ host: "www.berlin.example" }).url],
      ["fremder Host mit Suffix",
        "https://berlin.de.evil.test/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1717887.php"],
      ["Port", basis.url.replace("berlin.de", "berlin.de:8443")],
      ["expliziter Standardport", basis.url.replace("berlin.de", "berlin.de:443")],
      ["normalisierte Protokollschreibweise", basis.url.replace("https://", "HTTPS://")],
      ["Benutzerinfo", basis.url.replace("https://", "https://presse:pw@")],
      ["Query/Tracking", basis.url + "?ts=1790150970"],
      ["Fragment", basis.url + "#top"],
      ["Trailing-Slash", basis.url + "/"],
      ["Pressearchivpfad", "https://www.berlin.de/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php"],
      ["anderer Senatspfad", "https://www.berlin.de/sen/inn/presse/pressemitteilungen/2026/pressemitteilung.1717887.php"],
      ["ASGIVA ausserhalb der exakten Familie", "https://www.berlin.de/sen/asgiva/aktuelles/pressemitteilungen/2026/pressemitteilung.1719881.php"],
      ["Pfad ohne Jahressegment", "https://www.berlin.de/rbmskzl/aktuelles/pressemitteilungen/pressemitteilung.1717887.php"],
      ["falsche Endung", basis.url.replace(".php", ".html")],
      ["verkuerzter Pfad", "https://www.berlin.de/rbmskzl/aktuelles/2026/pressemitteilung.1717887.php"],
      ["UVK ohne pressemitteilungen-Segment",
        "https://www.berlin.de/sen/uvk/presse/2026/pressemitteilung.1719901.php"],
      ["WGP mit pressemitteilungen-Segment",
        "https://www.berlin.de/sen/wgp/presse/pressemitteilungen/2026/pressemitteilung.1719902.php"],
      ["UVK fremder Host",
        "https://www.berlin.example/sen/uvk/presse/pressemitteilungen/2026/pressemitteilung.1719901.php"],
      ["WGP fremder Host mit Suffix",
        "https://berlin.de.evil.test/sen/wgp/presse/2026/pressemitteilung.1719902.php"],
      ["UVK expliziter Port",
        "https://www.berlin.de:8443/sen/uvk/presse/pressemitteilungen/2026/pressemitteilung.1719901.php"],
      ["WGP expliziter Standardport",
        "https://www.berlin.de:443/sen/wgp/presse/2026/pressemitteilung.1719902.php"],
      ["UVK Query/Tracking",
        "https://www.berlin.de/sen/uvk/presse/pressemitteilungen/2026/pressemitteilung.1719901.php?ts=1790150970"],
      ["WGP Query/Tracking",
        "https://www.berlin.de/sen/wgp/presse/2026/pressemitteilung.1719902.php?ts=1790150970"]
    ];
    for (const fall of faelle) {
      const p = abruf({ html: basis.html, status: 200 });
      const ergebnis = await ABRUF.ladeSondervorlage({ url: fall[1] }, { fetchUrl: p.fn });
      check("Negativ (" + fall[0] + "): kein Abruf und abrufziel-ungueltig",
        p.calls.length === 0 && ergebnis.ok === false && ergebnis.reason === "abrufziel-ungueltig"
        && keinErgebnis(ergebnis));
    }
    const leer = await ABRUF.ladeSondervorlage({}, { fetchUrl: abruf({}).fn });
    check("Negativ (fehlende URL): abrufziel-ungueltig ohne Abruf",
      leer.ok === false && leer.reason === "abrufziel-ungueltig" && keinErgebnis(leer));
    const keinDoc = await ABRUF.ladeSondervorlage(null, { fetchUrl: abruf({}).fn });
    check("Negativ (kein Dokument): dokument-ungueltig",
      keinDoc.ok === false && keinDoc.reason === "dokument-ungueltig" && keinErgebnis(keinDoc));
  }

  // 4) Falsche finale URL: der Leser bindet Eingang, finale und kanonische Adresse.
  {
    const s = seite();
    const anders = seite({ nummer: "1717654" }).url;
    const p = abruf({ html: s.html, status: 200, finalUrl: anders });
    const ergebnis = await ABRUF.ladeSondervorlage({ url: s.url }, { fetchUrl: p.fn });
    check("Negativ (finale Adresse abweichend): url-nicht-finalurl",
      ergebnis.ok === false && ergebnis.reason === "url-nicht-finalurl" && keinErgebnis(ergebnis));
    const pFremd = abruf({ html: s.html, status: 200,
      finalUrl: s.url.replace("www.berlin.de", "example.com") });
    const eFremd = await ABRUF.ladeSondervorlage({ url: s.url }, { fetchUrl: pFremd.fn });
    check("Negativ (finale Adresse fremder Host): finalurl-ungueltig",
      eFremd.ok === false && eFremd.reason === "finalurl-ungueltig" && keinErgebnis(eFremd));

    const urlUvk = "https://www.berlin.de/sen/uvk/presse/pressemitteilungen/2026/pressemitteilung.1719901.php";
    const sUvk = seite({ familie: "uvk", url: urlUvk, canonicalHref: urlUvk, nummer: "1719901" });
    const pUvk = abruf({ html: sUvk.html, status: 200,
      finalUrl: urlUvk.replace("1719901", "1799901") });
    const eUvk = await ABRUF.ladeSondervorlage({ url: sUvk.url }, { fetchUrl: pUvk.fn });
    check("Negativ (uvk finale Adresse abweichend): url-nicht-finalurl",
      eUvk.ok === false && eUvk.reason === "url-nicht-finalurl" && keinErgebnis(eUvk));

    const urlWgp = "https://www.berlin.de/sen/wgp/presse/2026/pressemitteilung.1719902.php";
    const sWgp = seite({ familie: "wgp", url: urlWgp, canonicalHref: urlWgp, nummer: "1719902" });
    const pWgp = abruf({ html: sWgp.html, status: 200,
      finalUrl: urlWgp.replace("www.berlin.de", "example.com") });
    const eWgp = await ABRUF.ladeSondervorlage({ url: sWgp.url }, { fetchUrl: pWgp.fn });
    check("Negativ (wgp finale Adresse fremder Host): finalurl-ungueltig",
      eWgp.ok === false && eWgp.reason === "finalurl-ungueltig" && keinErgebnis(eWgp));
  }

  // 5) Status: nur der tatsaechlich beobachtete 200 zaehlt.
  {
    const s = seite();
    for (const fall of [["302", 302], ["500", 500], ["fehlend", undefined]]) {
      const p = abruf({ html: s.html, status: fall[1] });
      const ergebnis = await ABRUF.ladeSondervorlage({ url: s.url }, { fetchUrl: p.fn });
      check("Negativ (Status " + fall[0] + "): http-nicht-ok ohne Ergebnis",
        ergebnis.ok === false && ergebnis.reason === "http-nicht-ok" && keinErgebnis(ergebnis));
    }
    const fehl = new Error("HTTP 503 for " + s.url); fehl.statusCode = 503;
    const pFehl = abruf({ throw: fehl });
    const eFehl = await ABRUF.ladeSondervorlage({ url: s.url }, { fetchUrl: pFehl.fn });
    check("Negativ (echter HTTP-Fehler): http-status ohne Ergebnis",
      eFehl.ok === false && eFehl.reason === "http-status" && keinErgebnis(eFehl));
  }

  // 6) Hostwechsel/Redirect bricht ueber die bestehende Sperre ab.
  {
    const p = abruf({ throw: new Error("quellenkontext-hostwechsel") });
    const ergebnis = await ABRUF.ladeSondervorlage({ url: seite().url }, { fetchUrl: p.fn });
    check("Negativ (Hostwechsel): reason hostwechsel, kein Ergebnis",
      ergebnis.ok === false && ergebnis.reason === "hostwechsel" && keinErgebnis(ergebnis));
    check("Negativ (Hostwechsel): genau ein Abruf an den geprueften Host",
      p.calls.length === 1 && p.calls[0].deps.allowedHost === "berlin.de");
  }

  // 7) Anbietergrenze bleibt unterscheidbar.
  {
    const vertagung = new Error("anbietergrenze: Rate");
    vertagung.anbieterVertagung = { bereich: {}, wartenMs: 1000, grund: "rate" };
    const p = abruf({ throw: vertagung });
    const ergebnis = await ABRUF.ladeSondervorlage({ url: seite().url }, { fetchUrl: p.fn });
    check("Negativ (Anbietergrenze): reason anbietergrenze, kein Ergebnis",
      ergebnis.ok === false && ergebnis.reason === "anbietergrenze" && keinErgebnis(ergebnis));
  }

  // 8) Ungueltiges HTML: der strenge Leser lehnt fail closed ab, kein Ergebnis.
  {
    const kaputt = abruf({ html: "<html><body>kein amtliches Dokument</body></html>", status: 200 });
    const ergebnis = await ABRUF.ladeSondervorlage({ url: seite().url }, { fetchUrl: kaputt.fn });
    check("Negativ (ungueltiges HTML): Leser lehnt fail closed ab",
      ergebnis.ok === false && typeof ergebnis.reason === "string"
      && ergebnis.reason.length > 0 && keinErgebnis(ergebnis));
    const kanonisch = seite();
    const pCanon = abruf({ html: kanonisch.html, status: 200,
      finalUrl: kanonisch.url.replace("1717887", "1777777") });
    const eCanon = await ABRUF.ladeSondervorlage({ url: kanonisch.url }, { fetchUrl: pCanon.fn });
    check("Negativ (fremder Canonical in der Antwort): fail closed ohne Ergebnis",
      eCanon.ok === false && keinErgebnis(eCanon));
  }

  // 9) Echte lokale Originale — nur wenn vorhanden; Abruf aus der Datei, nicht aus dem Netz.
  {
    const dir = process.env.HELMUT_BERLIN_ORIGINALE_DIR || "/private/tmp";
    const originale = [
      { familie: "rbmskzl", datei: "helmut-berlin-rbmskzl-1717887.html",
        url: "https://www.berlin.de/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1717887.php",
        sha: "9fbe8472be24f8f6f15c02dd58b4780381cecb31a600dfd685eed858ae3efffa",
        tag: "2026-09-24", auszugZeichen: 625 },
      { familie: "rbmskzl", datei: "helmut-berlin-rbmskzl-1717654.html",
        url: "https://www.berlin.de/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1717654.php",
        sha: "41ee95dc3ad942cf7ec3a1b1da5558cd077ee02e8082f63352aefb5634583b0b",
        tag: "2026-09-23", auszugZeichen: 344 },
      { familie: "senweb", datei: "helmut-berlin-senweb-1717406.html",
        url: "https://www.berlin.de/sen/web/presse/pressemitteilungen/2026/pressemitteilung.1717406.php",
        sha: "987f3aef0890eff51caef25bc14671116c98bf7faf5ead1b3a211cfeeb569bbd",
        tag: "2026-09-23", auszugZeichen: 240 }
    ];
    let geprueft = 0;
    for (const probe of originale) {
      const pfad = path.join(dir, probe.datei);
      if (!fs.existsSync(pfad)) continue;
      const html = fs.readFileSync(pfad, "utf8");
      const p = abruf({ html, status: 200 });
      const ergebnis = await ABRUF.ladeSondervorlage({ url: probe.url }, { fetchUrl: p.fn });
      geprueft += 1;
      check(`Original ${probe.familie} ${probe.url.slice(-18)}: Erfolg und Dateibindung`,
        ergebnis.ok === true && ergebnis.vorlage.htmlHash === probe.sha && sha256(html) === probe.sha);
      check(`Original ${probe.familie} ${probe.url.slice(-18)}: Familie, reiner Tag, Auszug`,
        ergebnis.vorlage.pfadfamilie === probe.familie
        && ergebnis.vorlage.publikationstag === probe.tag
        && ergebnis.vorlage.auszug.length === probe.auszugZeichen
        && ergebnis.vorlage.auszugHash === sha256(ergebnis.vorlage.auszug));
      check(`Original ${probe.familie} ${probe.url.slice(-18)}: kein Kontakt/PDF, keine Uhrzeit`,
        !/PDF-Dokument|link--download|mailto:|Tel\.:|Jüdenstr/.test(
          ergebnis.vorlage.volltext + ergebnis.vorlage.auszug)
        && !Object.hasOwn(ergebnis.vorlage, "publishedAt")
        && p.calls.length === 1 && p.calls[0].deps.meldeStatus === true);
    }
    if (geprueft === 0) {
      console.log("SKIP lokale Originale: " + dir + " nicht vorhanden (CI-tauglich)");
    }
  }

  console.log("\nberlin-presse-sondervorlagen-abruf-test: " + bestanden + " Pruefungen bestanden");
}

laufe().catch(error => { console.error(error); process.exit(1); });
