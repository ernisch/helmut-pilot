"use strict";

// Helmut — gezielter Offline-Test des engen Berliner Presseartikel-Abrufs.
// =============================================================================================
// Prueft lib/helmut/berlin-presseartikel-abruf.js. Der echte Abruf wird AUSNAHMSLOS injiziert
// (deps.fetchUrl): es gibt KEIN Netz, KEINE DB, KEIN Modell und KEINE Production-Daten.
// Synthetische Positiv-/Negativproben decken unamtliche URL/Host, Hostwechsel/Redirect, Status,
// falschen Canonical/Tag und die Speicherfreiheit bei Fehlern ab. Zusaetzlich wird — falls
// vorhanden — die lokale amtliche Originalprobe unter /private/tmp ueber einen injizierten
// Dateiabruf durch denselben Adapter gefahren (rein lesend, ohne Netz).
//
// Aufruf: node scripts/berlin-presseartikel-abruf-test.js

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ABRUF = require("../lib/helmut/berlin-presseartikel-abruf");
const B = require("../lib/helmut/berlin-artikelstand");

const sha = value => crypto.createHash("sha256").update(value, "utf8").digest("hex");
let bestanden = 0;
function check(name, bedingung) {
  assert.ok(bedingung, name);
  bestanden += 1;
  console.log("OK " + name);
}

const ORIGINAL_DIR = "/private/tmp/helmut-landesversorgung-originale";
const ORIGINAL_BASIS = "be-bjf-kinder-jugendhilfe-20260925";
const ORIGINAL_URL = "https://www.berlin.de/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php";
const ORIGINAL_TITEL = "Reform der Kinder- und Jugendhilfe: Berlin fordert verbindlichen Fahrplan und verlässliche Finanzierung";
const ORIGINAL_SHA = "6981f4be2aba74e8a8372aa29f0317c8193596111bc2ea448e86b4302a64d24a";

// --- Synthetische amtliche Berlin.de-Seite (echte Struktur des strengen Lesers) -------------
const TAG = "2026-09-24";
const TITEL = "Synthetische Berliner Pressemitteilung zum Beispielprogramm";
const URL_WWW = "https://www.berlin.de/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1999999.php";
const ABSATZ = "Die synthetische Senatsverwaltung hat am Beispieltag ein Beispielprogramm fuer die "
  + "Beispielbezirke angekuendigt. Das Programm soll im kommenden Haushaltsjahr beginnen und wird aus "
  + "Landesmitteln finanziert. Eine Entscheidung des Abgeordnetenhauses steht noch aus.";
const ABSATZ_ZWEI = "Ein zweiter Absatz beschreibt die Begruendung und die naechsten Schritte des Vorhabens.";
const VOLLTEXT = ABSATZ + "\n\n" + ABSATZ_ZWEI + "\n";
function dmY(iso) { const teile = iso.split("-"); return teile[2] + "." + teile[1] + "." + teile[0]; }
function seite(optionen = {}) {
  const datum = optionen.datum || TAG;
  const titel = optionen.titel === undefined ? TITEL : optionen.titel;
  const h1 = optionen.h1 === undefined ? titel : optionen.h1;
  const canonical = optionen.canonical || URL_WWW;
  const pmDatum = optionen.pmDatum || dmY(datum);
  const absaetze = optionen.absaetze || [ABSATZ, ABSATZ_ZWEI];
  const teile = [
    "<!doctype html><html lang=\"de\"><head><meta charset=\"utf-8\">",
    "<meta name=\"dcterms.date\" content=\"" + datum + "\">",
    "<meta name=\"dcterms.title\" content=\"" + titel + "\">",
    "<link rel=\"canonical\" href=\"" + canonical + "\"></head><body>",
    "<div id=\"layout-grid__area--herounit\"><h1 class=\"title\">" + h1 + "</h1></div>",
    "<div id=\"layout-grid__area--maincontent\"><p class=\"pressnumber\">Pressemitteilung vom " + pmDatum + "</p>",
    "<section class=\"modul-text_bild\"><div class=\"text\"><div class=\"textile\">",
    absaetze.map(absatz => "<p>" + absatz + "</p>").join(""),
    "</div></div></section></div>",
    "<div id=\"layout-grid__area--marginal\"><div class=\"modul-contact\">Kontakt: pressestelle@senbjf.berlin.de</div></div>",
    "</body></html>"
  ];
  return { html: teile.join(""), canonical, datum, titel };
}
function dokument(url, patch = {}) {
  return { id: "local-synthetischer-abruf", title: TITEL, url, canonical_url: url,
    published_at: TAG, retrieved_at: null, summary: "", ...patch };
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
const keinSpeicher = ergebnis => Object.hasOwn(ergebnis, "row") === false && Object.hasOwn(ergebnis, "stand") === false;

async function laufe() {
  // 1) Positiv: injizierter Abruf -> genau der minimierte Stand.
  {
    const s = seite();
    const p = abruf({ html: s.html, status: 200 });
    const ergebnis = await ABRUF.ladePresseartikelStand(dokument(s.canonical), { fetchUrl: p.fn });
    check("Positiv: Stand wird gebildet", ergebnis.ok === true);
    check("Positiv: genau ein Abruf mit URL, Depth, Hostbindung und Statuswunsch",
      p.calls.length === 1 && p.calls[0].url === URL_WWW && p.calls[0].depth === 0
      && p.calls[0].deps.allowedHost === "berlin.de" && p.calls[0].deps.meldeStatus === true);
    check("Positiv: Stand ist an URL/Titel/Tag/Volltext gebunden",
      ergebnis.stand.url === B.kanonischeArtikelUrl(URL_WWW) && ergebnis.stand.titel === TITEL
      && ergebnis.stand.publikationstag === TAG && ergebnis.stand.absatzHash === sha(ABSATZ)
      && ergebnis.stand.volltextHash === sha(VOLLTEXT));
    check("Positiv: Rohzeile mit eigener Kennung, published_at null, summary = erster Absatz",
      ergebnis.row.id === "rd-" + ergebnis.stand.standHash && ergebnis.row.content_hash === ergebnis.stand.standHash
      && ergebnis.row.published_at === null && ergebnis.row.summary === ABSATZ && ergebnis.absatz === ABSATZ);
    const text = JSON.stringify(ergebnis);
    check("Positiv: kein HTML und kein Volltext im Ergebnis",
      text.includes("<section") === false && text.includes("<html") === false
      && text.includes(ABSATZ_ZWEI) === false && JSON.stringify(ergebnis.row.raw).includes("<") === false);
    check("Positiv: keine erfundene Uhrzeit",
      (ergebnis.row.publishedAt == null) && /[T ]\d{2}:\d{2}/.test(JSON.stringify(ergebnis.stand)) === false);
  }

  // 2) Unamtliche URL/Host: fail closed VOR jedem Abruf.
  {
    const faelle = [
      ["http statt https", URL_WWW.replace("https://", "http://")],
      ["fremder Host", "https://www.berlin.example/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1999999.php"],
      ["Port", URL_WWW.replace("berlin.de", "berlin.de:8443")],
      ["Benutzerinfo", URL_WWW.replace("https://", "https://user:pw@")],
      ["kein Pressearchiv-Pfad", "https://www.berlin.de/sen/bjf/service/presse/presse-2026/pressemitteilung.1999999.php"],
      ["anderer Dateiname", "https://www.berlin.de/sen/bjf/service/presse/pressearchiv-2026/meldung.1999999.php"],
      ["Trailing-Slash", URL_WWW + "/"],
      ["Tracking-Query", URL_WWW + "?utm=1"]
    ];
    for (const fall of faelle) {
      const p = abruf({ html: seite().html, status: 200 });
      const ergebnis = await ABRUF.ladePresseartikelStand(dokument(fall[1]), { fetchUrl: p.fn });
      check("Negativ (" + fall[0] + "): kein Abruf und abrufziel-ungueltig",
        p.calls.length === 0 && ergebnis.ok === false && ergebnis.reason === "abrufziel-ungueltig" && keinSpeicher(ergebnis));
    }
    const leer = await ABRUF.ladePresseartikelStand({ title: TITEL }, { fetchUrl: abruf({}).fn });
    check("Negativ (fehlende URL): abrufziel-ungueltig ohne Speicherung",
      leer.ok === false && leer.reason === "abrufziel-ungueltig" && keinSpeicher(leer));
  }

  // 3) Hostwechsel/Redirect: die bestehende Sperre bricht ab; kein fremder Host.
  {
    const p = abruf({ throw: new Error("quellenkontext-hostwechsel") });
    const ergebnis = await ABRUF.ladePresseartikelStand(dokument(URL_WWW), { fetchUrl: p.fn });
    check("Negativ (Hostwechsel): reason hostwechsel, keine Speicherung",
      ergebnis.ok === false && ergebnis.reason === "hostwechsel" && keinSpeicher(ergebnis));
    check("Negativ (Hostwechsel): genau ein Abruf an den geprueften Host",
      p.calls.length === 1 && p.calls[0].url === URL_WWW && p.calls[0].deps.allowedHost === "berlin.de");
    const anderesZiel = URL_WWW.replace("1999999", "1888888");
    const verschoben = abruf({ html: seite().html, status: 200, finalUrl: anderesZiel });
    const drif = await ABRUF.ladePresseartikelStand(dokument(URL_WWW), { fetchUrl: verschoben.fn });
    check("Negativ (Redirect auf andere finale Adresse): url-nicht-finalurl",
      drif.ok === false && drif.reason === "url-nicht-finalurl" && keinSpeicher(drif));
  }

  // 4) Status: nur der tatsaechlich beobachtete 200 zaehlt.
  {
    const html = seite().html;
    for (const fall of [["302", 302], ["500", 500], ["fehlend", undefined]]) {
      const p = abruf({ html, status: fall[1] });
      const ergebnis = await ABRUF.ladePresseartikelStand(dokument(URL_WWW), { fetchUrl: p.fn });
      check("Negativ (Status " + fall[0] + "): http-nicht-ok ohne Speicherung",
        ergebnis.ok === false && ergebnis.reason === "http-nicht-ok" && keinSpeicher(ergebnis));
    }
    const fehl = new Error("HTTP 503 for " + URL_WWW); fehl.statusCode = 503;
    const pFehl = abruf({ throw: fehl });
    const ereignis = await ABRUF.ladePresseartikelStand(dokument(URL_WWW), { fetchUrl: pFehl.fn });
    check("Negativ (echter HTTP-Fehler): reason http-status, keine Speicherung",
      ereignis.ok === false && ereignis.reason === "http-status" && keinSpeicher(ereignis));
    const vertagung = new Error("anbietergrenze: Rate");
    vertagung.anbieterVertagung = { bereich: {}, wartenMs: 1000, grund: "rate" };
    const pVert = abruf({ throw: vertagung });
    const vert = await ABRUF.ladePresseartikelStand(dokument(URL_WWW), { fetchUrl: pVert.fn });
    check("Negativ (Anbietervertagung): reason anbietergrenze, keine Speicherung",
      vert.ok === false && vert.reason === "anbietergrenze" && keinSpeicher(vert));
  }

  // 5) Quelle mit falschem Canonical/Tag/Titel/Jahr: der strenge Leser lehnt ab, nichts wird gespeichert.
  {
    const fremd = URL_WWW.replace("1999999", "1777777");
    const pCanon = abruf({ html: seite({ canonical: fremd }).html, status: 200 });
    const eCanon = await ABRUF.ladePresseartikelStand(dokument(URL_WWW), { fetchUrl: pCanon.fn });
    check("Negativ (fremder Canonical): finalurl-nicht-canonical",
      eCanon.ok === false && eCanon.reason === "finalurl-nicht-canonical" && keinSpeicher(eCanon));
    const pTag = abruf({ html: seite({ pmDatum: "23.09.2026" }).html, status: 200 });
    const eTag = await ABRUF.ladePresseartikelStand(dokument(URL_WWW), { fetchUrl: pTag.fn });
    check("Negativ (Meldungsdatum weicht ab): pressemitteilung-datum-abweichend",
      eTag.ok === false && eTag.reason === "pressemitteilung-datum-abweichend" && keinSpeicher(eTag));
    const u2025 = URL_WWW.replace("pressearchiv-2026", "pressearchiv-2025");
    const pJahr = abruf({ html: seite({ canonical: u2025 }).html, status: 200 });
    const eJahr = await ABRUF.ladePresseartikelStand(dokument(u2025), { fetchUrl: pJahr.fn });
    check("Negativ (Archivjahr != Datumsjahr): pressearchiv-jahr-abweichend",
      eJahr.ok === false && eJahr.reason === "pressearchiv-jahr-abweichend" && keinSpeicher(eJahr));
    const pH1 = abruf({ html: seite({ h1: "Ein anderer Titel" }).html, status: 200 });
    const eH1 = await ABRUF.ladePresseartikelStand(dokument(URL_WWW), { fetchUrl: pH1.fn });
    check("Negativ (H1 != dcterms.title): h1-titel-abweichend",
      eH1.ok === false && eH1.reason === "h1-titel-abweichend" && keinSpeicher(eH1));
    const pDocTitel = abruf({ html: seite().html, status: 200 });
    const eDocTitel = await ABRUF.ladePresseartikelStand(dokument(URL_WWW, { title: "Abweichender Dokumenttitel" }), { fetchUrl: pDocTitel.fn });
    check("Negativ (Dokumenttitel weicht ab): titel-abweichend",
      eDocTitel.ok === false && eDocTitel.reason === "titel-abweichend" && keinSpeicher(eDocTitel));
    const pDocTag = abruf({ html: seite().html, status: 200 });
    const eDocTag = await ABRUF.ladePresseartikelStand(dokument(URL_WWW, { published_at: "2026-09-19" }), { fetchUrl: pDocTag.fn });
    check("Negativ (Dokumenttag weicht vom Artikel ab): datum-nicht-tagesgenau",
      eDocTag.ok === false && eDocTag.reason === "datum-nicht-tagesgenau" && keinSpeicher(eDocTag));
  }

  // 6) Echte lokale Originalprobe — nur wenn vorhanden; Abruf aus der Datei, nicht aus dem Netz.
  {
    const htmlDatei = path.join(ORIGINAL_DIR, ORIGINAL_BASIS + ".html");
    if (fs.existsSync(htmlDatei)) {
      const html = fs.readFileSync(htmlDatei, "utf8");
      const p = abruf({ html, status: 200 });
      const doc = { id: "local-originalprobe", title: ORIGINAL_TITEL, url: ORIGINAL_URL,
        canonical_url: ORIGINAL_URL, published_at: "2026-09-25", retrieved_at: null, summary: "" };
      const ergebnis = await ABRUF.ladePresseartikelStand(doc, { fetchUrl: p.fn });
      check("Originalprobe: Stand aus der lokalen amtlichen Datei",
        ergebnis.ok === true && ergebnis.stand.url === B.kanonischeArtikelUrl(ORIGINAL_URL)
        && ergebnis.stand.publikationstag === "2026-09-25" && ergebnis.stand.volltextHash === ORIGINAL_SHA);
      check("Originalprobe: erster Absatz 619 Zeichen, kein Volltext/HTML im Ergebnis",
        ergebnis.absatz.length === 619 && ergebnis.row.summary === ergebnis.absatz
        && JSON.stringify(ergebnis.row.raw).includes("<") === false
        && JSON.stringify(ergebnis).includes(ABSATZ_ZWEI) === false);
      check("Originalprobe: kein Netz — genau ein injizierter Dateiabruf",
        p.calls.length === 1 && p.calls[0].url === ORIGINAL_URL && p.calls[0].deps.meldeStatus === true);
    } else {
      console.log("SKIP Originalprobe: " + ORIGINAL_DIR + " nicht vorhanden (CI-tauglich)");
    }
  }

  console.log("\nberlin-presseartikel-abruf-test: " + bestanden + " Pruefungen bestanden");
}

laufe().catch(error => { console.error(error); process.exit(1); });
