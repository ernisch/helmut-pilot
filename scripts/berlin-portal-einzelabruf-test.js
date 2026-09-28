"use strict";

// Helmut — gezielter Offline-Test des engen Einzelabrufs der einen festen Berliner
// Senats-Presseportalseite.
// =============================================================================================
// Prueft lib/helmut/berlin-portal-einzelabruf.js. Der echte Abruf wird AUSNAHMSLOS injiziert
// (deps.fetchUrl): es gibt KEIN Netz, KEINE DB, KEIN Modell und KEINE Production-Daten.
// Synthetische Positiv-/Negativproben decken die feste Portaladresse (Ablehnung jeder anderen
// Adresse VOR dem Abruf), fremden Host/Redirect, falsche finale URL, fehlenden/falschen
// HTTP-Status, Parserdrift und Anbieterfehler ab. Zusaetzlich wird — falls vorhanden — das lokal
// gesicherte amtliche Original /private/tmp/helmut-berlin-portal-20260928.html ueber einen
// injizierten Dateiabruf durch denselben Adapter gefahren (rein lesend, ohne Netz). Fehlt die
// Originaldatei, laeuft derselbe Test vollstaendig weiter (CI-tauglich ohne /private/tmp).
//
// Aufruf: node scripts/berlin-portal-einzelabruf-test.js

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ABRUF = require("../lib/helmut/berlin-portal-einzelabruf");
const M = require("../lib/helmut/berlin-senat-entdeckung");

const QUELLE = "https://www.berlin.de/presse/";
const sha256 = wert => crypto.createHash("sha256").update(wert, "utf8").digest("hex");
let bestanden = 0;
function check(name, bedingung) {
  assert.ok(bedingung, name);
  bestanden += 1;
  console.log("OK " + name);
}
const keinErgebnis = ergebnis => Object.hasOwn(ergebnis, "fundstellen") === false;
const ohneUhrzeit = ergebnis => !/Uhr|\d{2}:\d{2}/.test(JSON.stringify(ergebnis));
const ohneHtml = ergebnis => !/<[a-z/!]/i.test(JSON.stringify(ergebnis));

// ---------------------------------------------------------------------------------------------
// Synthetische Portalseite in der beobachteten amtlichen Struktur des Entdeckers.
// ---------------------------------------------------------------------------------------------
function li(datum, pfad, titel, optionen = {}) {
  const dateText = optionen.dateText === undefined ? `${datum} 13:05 Uhr` : optionen.dateText;
  const link = optionen.link === undefined ? `<a href="${pfad}" >${titel}</a>` : optionen.link;
  return `<li${optionen.liAttr || ""}><div class="cell date">${dateText}</div>`
    + `<div class="cell text">${link}<div class="category"> <strong>Behörde: </strong>`
    + `${optionen.behoerde || "Presse- und Informationsamt des Landes Berlin"}</div></div></li>`;
}
function portal(optionen = {}) {
  const h2 = optionen.h2 === undefined ? `<h2 class="title" id="headline_1_4">${M.H2_TEXT}</h2>` : optionen.h2;
  const lis = optionen.lis || [li("25.09.2026",
    "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php", "Synthetische Meldung")];
  const ul = optionen.ul === undefined
    ? `<ul class="list--tablelist ruler  has-date">${lis.join("")}</ul>` : optionen.ul;
  const block = optionen.block === undefined
    ? `<div class="modul-rss_list block">${h2}<div class="inner">${ul}</div></div>` : optionen.block;
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">`
    + `<meta name="dcterms.date" content="2026-09-28"><link rel="canonical" href="${QUELLE}"></head>`
    + `<body><div id="page-wrapper"><div id="layout-grid__area--maincontent">`
    + `${block}</div></div></body></html>`;
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

async function laufe() {
  // 1) Vertragsoberflaeche
  check("Version, feste Portaladresse und Statuswunsch exakt",
    ABRUF.VERSION === "berlin-portal-einzelabruf-v1" && ABRUF.MELDE_STATUS === true
    && ABRUF.PORTAL_URL === QUELLE);

  // 2) Positive amtliche Portalantwort: injizierter Abruf -> minimierte Fundstellen ohne HTML.
  {
    const html = portal({ lis: [
      li("25.09.2026", "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php", "Erste Meldung"),
      li("24.09.2026", "/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1717887.php", "Zweite Meldung"),
      li("23.09.2026", "/sen/web/presse/pressemitteilungen/2026/pressemitteilung.1717406.php", "Dritte Meldung")
    ] });
    const p = abruf({ html, status: 200 });
    const ergebnis = await ABRUF.ladePortalFundstellen({ url: QUELLE }, { fetchUrl: p.fn });
    check("positiv: Erfolg mit eingefrorenem Ergebnis", ergebnis.ok === true && Object.isFrozen(ergebnis));
    check("positiv: genau ein Abruf mit URL, Depth, Hostbindung und Statuswunsch",
      p.calls.length === 1 && p.calls[0].url === QUELLE && p.calls[0].depth === 0
      && p.calls[0].deps.allowedHost === "berlin.de" && p.calls[0].deps.meldeStatus === true);
    check("positiv: quelle und genau drei minimierte Fundstellen",
      ergebnis.quelle === QUELLE && ergebnis.fundstellen.length === 3
      && ergebnis.fundstellen.every(f => Object.keys(f).join(",") === M.FUNDSTELLE_FELDER.join(",")));
    check("positiv: reine Kalendertage, richtige Abrufziele, keine Uhrzeit",
      ergebnis.fundstellen.map(f => f.publikationstag).join(",") === "2026-09-25,2026-09-24,2026-09-23"
      && ergebnis.fundstellen.every(f => f.weiterreichbar === true && f.grund === null)
      && ergebnis.fundstellen.map(f => M.abrufzielFuer(f.url).art).join(",") === "pressearchiv,sondervorlage,sondervorlage"
      && ohneUhrzeit(ergebnis));
    check("positiv: kein HTML, kein Rohdokument, kein Volltext im Ergebnis",
      ohneHtml(ergebnis) && !Object.hasOwn(ergebnis, "html") && !Object.hasOwn(ergebnis, "body")
      && !Object.hasOwn(ergebnis, "volltext") && !Object.hasOwn(ergebnis.fundstellen[0], "html"));
  }
  {
    // Amtliche Fassung ohne www derselben festen Adresse; Hostbindung bleibt berlin.de.
    const html = portal();
    const p = abruf({ html, status: 200 });
    const ergebnis = await ABRUF.ladePortalFundstellen({ url: "https://berlin.de/presse/" }, { fetchUrl: p.fn });
    check("positiv: amtliche Fassung ohne www mit Hostbindung berlin.de",
      ergebnis.ok === true && p.calls.length === 1 && p.calls[0].url === "https://berlin.de/presse/"
      && p.calls[0].deps.allowedHost === "berlin.de");
  }

  // 3) Nicht die feste Portalseite: fail closed VOR jedem Abruf.
  {
    const html = portal();
    const faelle = [
      ["http statt https", "http://www.berlin.de/presse/"],
      ["fremder Host", "https://www.berlin.example/presse/"],
      ["fremder Host mit Suffix", "https://berlin.de.evil.test/presse/"],
      ["Port", "https://www.berlin.de:8443/presse/"],
      ["expliziter Standardport", "https://www.berlin.de:443/presse/"],
      ["normalisierte Protokollschreibweise", "HTTPS://www.berlin.de/presse/"],
      ["Benutzerinfo", "https://presse:pw@www.berlin.de/presse/"],
      ["Query/Tracking", QUELLE + "?ts=1790150970"],
      ["Fragment", QUELLE + "#top"],
      ["fehlender Trailing-Slash", "https://www.berlin.de/presse"],
      ["verschachtelter Portalpfad", "https://www.berlin.de/presse/index.php"],
      ["Unterpfad des Portals", "https://www.berlin.de/presse/aktuell/"],
      ["Portalwurzel ohne Pressepfad", "https://www.berlin.de/"],
      ["anderes berlin.de-Ziel",
        "https://www.berlin.de/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1717887.php"]
    ];
    for (const fall of faelle) {
      const p = abruf({ html, status: 200 });
      const ergebnis = await ABRUF.ladePortalFundstellen({ url: fall[1] }, { fetchUrl: p.fn });
      check("Negativ (" + fall[0] + "): kein Abruf und abrufziel-ungueltig",
        p.calls.length === 0 && ergebnis.ok === false && ergebnis.reason === "abrufziel-ungueltig"
        && keinErgebnis(ergebnis));
    }
    const leer = await ABRUF.ladePortalFundstellen({}, { fetchUrl: abruf({}).fn });
    check("Negativ (fehlende URL): abrufziel-ungueltig ohne Abruf",
      leer.ok === false && leer.reason === "abrufziel-ungueltig" && keinErgebnis(leer));
    const keinDoc = await ABRUF.ladePortalFundstellen(null, { fetchUrl: abruf({}).fn });
    check("Negativ (kein Dokument): dokument-ungueltig ohne Abruf",
      keinDoc.ok === false && keinDoc.reason === "dokument-ungueltig" && keinErgebnis(keinDoc));
    check("Negativ: pruefeAbrufziel lehnt fremde und abweichende Adressen ab",
      ABRUF.pruefeAbrufziel(QUELLE) !== null && ABRUF.pruefeAbrufziel(QUELLE).host === "berlin.de"
      && ABRUF.pruefeAbrufziel("https://www.berlin.de/presse/index.php") === null
      && ABRUF.pruefeAbrufziel("https://example.com/presse/") === null);
  }

  // 4) Falsche finale URL/Redirect: der Entdecker bindet Quelle, finale und kanonische Adresse.
  {
    const html = portal();
    for (const fall of [
      ["Unterpfad statt Portalseite", QUELLE + "aktuell/", "quelle-ungueltig"],
      ["andere berlin.de-Seite statt Portal",
        "https://www.berlin.de/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1717887.php",
        "quelle-ungueltig"],
      ["fremder Host als finale Adresse", "https://evil.example/presse/", "quelle-ungueltig"]
    ]) {
      const p = abruf({ html, status: 200, finalUrl: fall[1] });
      const ergebnis = await ABRUF.ladePortalFundstellen({ url: QUELLE }, { fetchUrl: p.fn });
      check("Negativ (finale Adresse: " + fall[0] + "): " + fall[2] + " ohne Ergebnis",
        ergebnis.ok === false && ergebnis.reason === fall[2] && keinErgebnis(ergebnis));
    }
    // Die amtliche Fassung ohne www als finale Adresse derselben Seite bleibt zulaessig.
    const p = abruf({ html, status: 200, finalUrl: "https://berlin.de/presse/" });
    const ergebnis = await ABRUF.ladePortalFundstellen({ url: QUELLE }, { fetchUrl: p.fn });
    check("positiv: amtliche finale Adresse ohne www derselben Portalseite",
      ergebnis.ok === true && p.calls.length === 1);
  }

  // 5) Status: nur der tatsaechlich beobachtete 200 zaehlt.
  {
    const html = portal();
    for (const fall of [["302", 302], ["500", 500], ["fehlend", undefined]]) {
      const p = abruf({ html, status: fall[1] });
      const ergebnis = await ABRUF.ladePortalFundstellen({ url: QUELLE }, { fetchUrl: p.fn });
      check("Negativ (Status " + fall[0] + "): http-nicht-ok ohne Ergebnis",
        ergebnis.ok === false && ergebnis.reason === "http-nicht-ok" && keinErgebnis(ergebnis));
    }
  }

  // 6) Parserdrift: der strenge Entdecker lehnt fail closed ab, kein Ergebnis.
  {
    const BJF = "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php";
    const driften = [
      ["H2-Wortlaut veraendert", portal({ h2: `<h2 class="title">Irgendwelche Mitteilungen</h2>` })],
      ["fremde Behoerde im Senatsblock",
        portal({ lis: [li("25.09.2026", BJF, "Meldung", { behoerde: "Bezirksamt Mitte von Berlin" })] })],
      ["fehlende Datumsspalte",
        portal({ lis: [`<li><div class="cell text"><a href="${BJF}">Meldung</a>`
          + `<div class="category"> <strong>Behörde: </strong>Presse- und Informationsamt des Landes Berlin</div></div></li>`] })],
      ["ungueltiger Kalendertag", portal({ lis: [li("32.13.2026", BJF, "Meldung")] })],
      ["doppelte Fundstelle", portal({ lis: [li("25.09.2026", BJF, "Meldung"), li("25.09.2026", BJF, "Meldung")] })],
      ["kommentierte Doppelfundstelle in der Liste",
        portal({ ul: `<ul class="list--tablelist ruler  has-date">${li("25.09.2026", BJF, "Meldung")}`
          + `<!-- <li><div class="cell date">25.09.2026 13:05 Uhr</div>`
          + `<div class="cell text"><a href="${BJF}">Meldung</a></div></li> --></ul>` })],
      ["unsichtbares Behoerdenelement",
        portal({ lis: [li("25.09.2026", BJF, "Meldung", { liAttr: " hidden" })] })]
    ];
    for (const fall of driften) {
      const p = abruf({ html: fall[1], status: 200 });
      const ergebnis = await ABRUF.ladePortalFundstellen({ url: QUELLE }, { fetchUrl: p.fn });
      check("Negativ (Parserdrift: " + fall[0] + "): fail closed ohne Ergebnis",
        p.calls.length === 1 && ergebnis.ok === false && typeof ergebnis.reason === "string"
        && ergebnis.reason.length > 0 && keinErgebnis(ergebnis));
    }
    const kaputt = abruf({ html: "<html><body>kein amtliches Dokument</body></html>", status: 200 });
    const ergebnis = await ABRUF.ladePortalFundstellen({ url: QUELLE }, { fetchUrl: kaputt.fn });
    check("Negativ (ungueltiges HTML): Entdecker lehnt fail closed ab",
      ergebnis.ok === false && typeof ergebnis.reason === "string" && keinErgebnis(ergebnis));
  }

  // 7) Anbieterfehler: Hostwechsel, Anbietergrenze, echter HTTP-Fehler, sonstiger Startfehler.
  {
    const p = abruf({ throw: new Error("quellenkontext-hostwechsel") });
    const ergebnis = await ABRUF.ladePortalFundstellen({ url: QUELLE }, { fetchUrl: p.fn });
    check("Negativ (Hostwechsel): reason hostwechsel, kein Ergebnis",
      ergebnis.ok === false && ergebnis.reason === "hostwechsel" && keinErgebnis(ergebnis));
    check("Negativ (Hostwechsel): genau ein Abruf an die feste Adresse mit berlin.de-Bindung",
      p.calls.length === 1 && p.calls[0].url === QUELLE && p.calls[0].deps.allowedHost === "berlin.de");

    const vertagung = new Error("anbietergrenze: Rate");
    vertagung.anbieterVertagung = { bereich: {}, wartenMs: 1000, grund: "rate" };
    const eVertagung = await ABRUF.ladePortalFundstellen({ url: QUELLE }, { fetchUrl: abruf({ throw: vertagung }).fn });
    check("Negativ (Anbietergrenze): reason anbietergrenze, kein Ergebnis",
      eVertagung.ok === false && eVertagung.reason === "anbietergrenze" && keinErgebnis(eVertagung));

    const fehl = new Error("HTTP 503 for " + QUELLE); fehl.statusCode = 503;
    const eFehl = await ABRUF.ladePortalFundstellen({ url: QUELLE }, { fetchUrl: abruf({ throw: fehl }).fn });
    check("Negativ (echter HTTP-Fehler): reason http-status, kein Ergebnis",
      eFehl.ok === false && eFehl.reason === "http-status" && keinErgebnis(eFehl));

    const start = new Error("start fehlgeschlagen: Operation not permitted");
    const eStart = await ABRUF.ladePortalFundstellen({ url: QUELLE }, { fetchUrl: abruf({ throw: start }).fn });
    check("Negativ (sonstiger Abruffehler): reason abruf-fehlgeschlagen, kein Ergebnis",
      eStart.ok === false && eStart.reason === "abruf-fehlgeschlagen" && keinErgebnis(eStart));
  }

  // 8) Echte lokale Originalprobe — nur wenn vorhanden; Datei, nicht Netz. CI-tauglich.
  {
    const dir = process.env.HELMUT_BERLIN_ORIGINALE_DIR || "/private/tmp";
    const original = path.join(dir, "helmut-berlin-portal-20260928.html");
    const SHA = "1cb44ddadae2caf701333f6acb47de57a8f3da69f4764bdab71434a17d84fac8";
    if (fs.existsSync(original)) {
      const html = fs.readFileSync(original, "utf8");
      const p = abruf({ html, status: 200 });
      const ergebnis = await ABRUF.ladePortalFundstellen({ url: QUELLE }, { fetchUrl: p.fn });
      check("Original: Erfolg, Dateibindung und Dateihash der gesicherten Portalseite",
        ergebnis.ok === true && sha256(html) === SHA && p.calls.length === 1
        && p.calls[0].deps.allowedHost === "berlin.de" && p.calls[0].deps.meldeStatus === true);
      check("Original: genau sechs eigene Senatstreffer, alle weiterreichbar",
        ergebnis.fundstellen.length === 6
        && ergebnis.fundstellen.every(f => f.weiterreichbar === true && f.grund === null));
      check("Original: bekannte BJF-Fundstelle exakt (URL, Titel, reiner Tag)",
        ergebnis.fundstellen.some(f =>
          f.url === "https://www.berlin.de/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php"
          && f.titel === "Reform der Kinder- und Jugendhilfe: Berlin fordert verbindlichen Fahrplan und verlässliche Finanzierung"
          && f.publikationstag === "2026-09-25" && M.abrufzielFuer(f.url).art === "pressearchiv"));
      check("Original: pro Treffer genau das passende sichere Abrufziel",
        ergebnis.fundstellen.every(f => { const ziel = M.abrufzielFuer(f.url); return ziel && ziel.ziel.url === f.url; })
        && ergebnis.fundstellen.filter(f => M.abrufzielFuer(f.url).art === "pressearchiv").length === 3
        && ergebnis.fundstellen.filter(f => M.abrufzielFuer(f.url).art === "sondervorlage").length === 3);
      check("Original: kein HTML, keine Uhrzeit im Ergebnis",
        ohneHtml(ergebnis) && ohneUhrzeit(ergebnis));
    } else {
      console.log("SKIP Original: " + original + " nicht vorhanden (CI-tauglich)");
    }
  }

  console.log("\nberlin-portal-einzelabruf-test: " + bestanden + " Pruefungen bestanden");
}

laufe().catch(error => { console.error("FAIL " + (error && error.message)); process.exitCode = 1; });
