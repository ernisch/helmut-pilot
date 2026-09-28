"use strict";

// Helmut — gezielter Offline-Test der kleinsten lokalen Kompositionskette der amtlichen
// Berliner Senatsquellen (lib/helmut/berlin-senatsquellen-kette.js).
// =============================================================================================
// AUSNAHMSLOS injizierte Abrufe: KEIN Netz, KEINE DB, KEIN Modell, keine Production-Daten und
// keine Speicherung. Geprueft wird der positive Mix aus Pressearchiv + beiden Sonderfamilien,
// Titel-/Tagesdrift, unbekannter Pfad, mehr als acht Fundstellen und eine spaetere fehlschlagende
// Fundstelle (fail closed, null Ergebnisse). Alle Ausgaben werden mit den bestehenden
// Standvalidierern geprueft; Roh-HTML, Volltext und Uhrzeit sind ausgeschlossen.
//
// Falls vorhanden, laeuft zusaetzlich eine echte Offline-Kette ueber die lokalen amtlichen
// Originale unter /private/tmp (Portal, BJF-Pressearchiv und drei Sondervorlagen). Fehlen sie,
// bleibt der Test CI-tauglich und meldet die Originalprobe ausdruecklich als SKIP.
//
// Aufruf: node scripts/berlin-senatsquellen-kette-test.js

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const KETTE = require("../lib/helmut/berlin-senatsquellen-kette");
const M = require("../lib/helmut/berlin-senat-entdeckung");
const B = require("../lib/helmut/berlin-artikelstand");

let bestanden = 0;
function check(name, bedingung) {
  assert.ok(bedingung, name);
  bestanden += 1;
  console.log("OK " + name);
}

const QUELLE = "https://www.berlin.de/presse/";
const H2_TEXT = M.H2_TEXT;
const ABSENDER = "Das Presse- und Informationsamt des Landes Berlin teilt mit:";
const dmY = iso => { const [j, m, t] = iso.split("-"); return `${t}.${m}.${j}`; };
const sha = value => crypto.createHash("sha256").update(value, "utf8").digest("hex");

// Roh-HTML und Volltext duerfen NIE in einem Ergebnis stehen, und es darf keine erfundene
// Publikationszeit entstehen: `published_at`/`retrieved_at` bleiben leer (kein Zeitstempel), die
// Listenuhrzeit der Portalseite ("13:05 Uhr") taucht nirgends auf. Ein echtes Uhrzeitwort im
// amtlichen Artikeltext (z. B. "10.00 Uhr") ist Artikelinhalt und keine Publikationszeit.
function ohneRohinhalte(ergebnis) {
  const s = JSON.stringify(ergebnis);
  const rows = ergebnis && Array.isArray(ergebnis.rows) ? ergebnis.rows : [];
  return !/<[a-z/]/i.test(s) && !/"volltext"/.test(s) && !Object.hasOwn(ergebnis || {}, "volltext")
    && rows.every(row => row.published_at === null && !row.retrieved_at)
    && !/\d{4}-\d{2}-\d{2}T\d{2}/.test(s) && !/13:05/.test(s);
}

// ---------------------------------------------------------------------------------------------
// Synthetische Portalseite in der beobachteten amtlichen Struktur.
// ---------------------------------------------------------------------------------------------
function li(datum, pfad, titel) {
  return `<li><div class="cell date">${datum} 13:05 Uhr</div>`
    + `<div class="cell text"><a href="${pfad}" >${titel}</a><div class="category"> `
    + `<strong>Behörde: </strong>Presse- und Informationsamt des Landes Berlin</div></div></li>`;
}
function portalHtml(lis) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">`
    + `<meta name="dcterms.date" content="2026-09-28"><link rel="canonical" href="${QUELLE}"></head>`
    + `<body><div id="page-wrapper"><div id="layout-grid__area--maincontent">`
    + `<div class="modul-rss_list block"><h2 class="title">${H2_TEXT}</h2><div class="inner">`
    + `<ul class="list--tablelist ruler  has-date">${lis.join("")}</ul></div></div>`
    + `<section class="modul-text_bild"><h2 class="title">Aktuelle Mitteilungen der Bezirksämter</h2>`
    + `<div class="text"><div class="textile"><ul><li><a href="/presse/mitte">Bezirksamt Mitte</a></li>`
    + `</ul></div></div></section></div></div></body></html>`;
}
function portalEintrag(path, titel, tag /* ISO */) {
  return li(dmY(tag), path, titel);
}

// ---------------------------------------------------------------------------------------------
// Synthetische Artikel in der belegten Struktur der beiden bestehenden Leser.
// ---------------------------------------------------------------------------------------------
const MARGINAL = `<div id="layout-grid__area--marginal" role="complementary">`
  + `<div class="modul-contact"><div class="textile">Kontakt</div></div></div>`;
function presseSeite(url, titel, tag, absaetze = ["Erster Absatz der synthetischen Kette.",
  "Zweiter Absatz der synthetischen Kette."]) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">`
    + `<meta name="dcterms.date" content="${tag}"><meta name="dcterms.title" content="${titel}">`
    + `<link rel="canonical" href="${url}"></head><body>`
    + `<div id="layout-grid__area--herounit"><h1 class="title">${titel}</h1></div>`
    + `<div id="layout-grid__area--maincontent"><p class="pressnumber">Pressemitteilung vom ${dmY(tag)}</p>`
    + `<section class="modul-text_bild imagealignleft teaser"><div class="text"><div class="textile">`
    + `${absaetze.map(a => `<p>${a}</p>`).join("")}</div></div></section></div>${MARGINAL}</body></html>`;
}
const SACH = "Die synthetische Meldung beschreibt einen amtlich belegten Sachverhalt der Berliner "
  + "Landesversorgung und dient ausschliesslich der lokalen Offlinepruefung dieser Vorlage.";
const SACH2 = "Ein zweiter, ebenfalls vollstaendiger Sachabsatz derselben synthetischen Meldung "
  + "fuer die gebundene Auszugsgrenze dieser Vorlage.";
function sonderSeite(familie, url, titel, tag) {
  const absaetze = familie === "rbmskzl" ? [ABSENDER, SACH] : [SACH, SACH2];
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">`
    + `<meta name="dcterms.date" content="${tag}"><meta name="dcterms.title" content="${titel}">`
    + `<link rel="canonical" href="${url}"></head><body>`
    + `<div id="layout-grid__area--herounit"><h1 class="title">${titel}</h1></div>`
    + `<div id="layout-grid__area--maincontent"><div class="anker-jumptocontact">`
    + `<a href="#kontakt">Direkt zur Kontaktinformation</a></div>`
    + `<p class="pressnumber">Pressemitteilung vom ${dmY(tag)}</p>`
    + `<div class="textile">${absaetze.map(a => `<p>${a}</p>`).join("")}</div></div>${MARGINAL}</body></html>`;
}

// ---------------------------------------------------------------------------------------------
// Injektion: EINE Abrufstelle fuer Portalseite UND Einzelabrufe. `resolver(url)` liefert
// { body, finalUrl, status } oder wirft. Reihenfolge und Abrufoptionen werden protokolliert.
// ---------------------------------------------------------------------------------------------
function injektion(resolver) {
  const calls = [];
  const fetchUrl = async (url, depth, deps) => {
    calls.push({ url, depth, deps });
    return resolver(url);
  };
  return { fetchUrl, calls };
}
const ROUTEN = (portal, seiten) => url => {
  if (url === QUELLE) return { body: portal, finalUrl: QUELLE, status: 200 };
  if (seiten.has(url)) return { body: seiten.get(url), finalUrl: url, status: 200 };
  const fehler = new Error("unerwartete Adresse: " + url);
  fehler.statusCode = 500;
  throw fehler;
};
const nurPortal = (portal, status = 200) => injektion(() => ({ body: portal, finalUrl: QUELLE, status }));

function stehtImStand(row, art) {
  const stand = B.pruefeArtikelstand(row.raw.helmutBerlinArtikelstand);
  return stand.version === B.VERSION
    && stand.herkunft === (art === "sondervorlage" ? B.HERKUNFT_SONDER : B.HERKUNFT)
    && row.id === "rd-" + stand.standHash && row.content_hash === stand.standHash
    && B.leseArtikelstand(row)?.standHash === stand.standHash;
}

async function laufe() {
  // -------------------------------------------------------------------------------------------
  // 1) Positiv-Mix: ein Pressearchiv und beide Sonderfamilien, seriell in Portallistenreihenfolge.
  // -------------------------------------------------------------------------------------------
  const P_PATH = "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php";
  const RB_PATH = "/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1717887.php";
  const SW_PATH = "/sen/web/presse/pressemitteilungen/2026/pressemitteilung.1717406.php";
  const P_URL = "https://www.berlin.de" + P_PATH;
  const RB_URL = "https://www.berlin.de" + RB_PATH;
  const SW_URL = "https://www.berlin.de" + SW_PATH;
  {
    const portal = portalHtml([
      portalEintrag(P_PATH, "Erste synthetische Meldung", "2026-09-25"),
      portalEintrag(RB_PATH, "Zweite synthetische Meldung", "2026-09-24"),
      portalEintrag(SW_PATH, "Dritte synthetische Meldung", "2026-09-23")
    ]);
    const seiten = new Map([
      [P_URL, presseSeite(P_URL, "Erste synthetische Meldung", "2026-09-25")],
      [RB_URL, sonderSeite("rbmskzl", RB_URL, "Zweite synthetische Meldung", "2026-09-24")],
      [SW_URL, sonderSeite("senweb", SW_URL, "Dritte synthetische Meldung", "2026-09-23")]
    ]);
    const { fetchUrl, calls } = injektion(ROUTEN(portal, seiten));
    const ergebnis = await KETTE.ladeSenatsquellenKette({ url: QUELLE }, { fetchUrl });

    check("mix: vollstaendiger Erfolg mit Quelle", ergebnis.ok === true && ergebnis.quelle === QUELLE);
    check("mix: genau drei minimierte Rohzeilen und Kennungen",
      ergebnis.rows.length === 3 && ergebnis.kennungen.length === 3
      && ergebnis.kennungen.every(k => /^rd-[a-f0-9]{64}$/.test(k))
      && ergebnis.rows.map(r => r.id).join(",") === ergebnis.kennungen.join(","));
    check("mix: genau ein Abruf der Portalseite, danach seriell die drei Fundstellen",
      calls.length === 4 && calls[0].url === QUELLE && calls[1].url === P_URL
      && calls[2].url === RB_URL && calls[3].url === SW_URL);
    check("mix: jeder Abruf mit Hostbindung und Statuswunsch",
      calls.every(c => c.deps.allowedHost === "berlin.de" && c.deps.meldeStatus === true));
    check("mix: jede Rohzeile mit den bestehenden Standvalidierern geprueft",
      ergebnis.rows.map((r, i) => stehtImStand(r, i === 0 ? "pressearchiv" : "sondervorlage")).every(Boolean));
    check("mix: exakter Titel und reiner Tag der Fundstelle sind erneut gebunden",
      ergebnis.rows[0].title === "Erste synthetische Meldung"
      && ergebnis.rows[1].title === "Zweite synthetische Meldung"
      && ergebnis.rows[2].title === "Dritte synthetische Meldung"
      && ergebnis.rows.map(r => r.raw.helmutBerlinArtikelstand.publikationstag).join(",")
        === "2026-09-25,2026-09-24,2026-09-23");
    check("mix: eigene Herkuenfte getrennt (Pressearchiv + Sondervorlagen)",
      ergebnis.rows[0].raw.helmutBerlinArtikelstand.herkunft === B.HERKUNFT
      && ergebnis.rows[1].raw.helmutBerlinArtikelstand.herkunft === B.HERKUNFT_SONDER
      && ergebnis.rows[2].raw.helmutBerlinArtikelstand.herkunft === B.HERKUNFT_SONDER);
    check("mix: published_at null, kein HTML/Volltext, keine Uhrzeit",
      ergebnis.rows.every(r => r.published_at === null) && ohneRohinhalte(ergebnis));
    check("mix: kein Volltext der Probe in einer Rohzeile",
      !JSON.stringify(ergebnis.rows).includes("Erster Absatz der synthetischen Kette.\n\n"));
    check("mix: Ergebnis, Kennungen und Rohzeilen sind eingefroren",
      Object.isFrozen(ergebnis) && Object.isFrozen(ergebnis.kennungen) && Object.isFrozen(ergebnis.rows)
      && ergebnis.rows.every(r => Object.isFrozen(r) && Object.isFrozen(r.raw)));
  }

  // -------------------------------------------------------------------------------------------
  // 2) Titel- und Tagesdrift (beide Zweige) bricht fail closed ab, ohne Teilfreigabe.
  // -------------------------------------------------------------------------------------------
  {
    const portal = portalHtml([portalEintrag(P_PATH, "Portaltitel", "2026-09-25")]);
    const drift = injektion(ROUTEN(portal,
      new Map([[P_URL, presseSeite(P_URL, "Abweichender Artikeltitel", "2026-09-25")]])));
    const ergebnis = await KETTE.ladeSenatsquellenKette({ url: QUELLE }, { fetchUrl: drift.fetchUrl });
    check("pressearchiv-Titeldrift: fail closed mit knappem Grund und null Ergebnissen",
      ergebnis.ok === false && ergebnis.reason === "titel-abweichend"
      && ergebnis.rows === null && ergebnis.kennungen === null && ohneRohinhalte(ergebnis));
    const driftTag = injektion(ROUTEN(portal,
      new Map([[P_URL, presseSeite(P_URL, "Portaltitel", "2026-09-24")]])));
    const tag = await KETTE.ladeSenatsquellenKette({ url: QUELLE }, { fetchUrl: driftTag.fetchUrl });
    check("pressearchiv-Tagesdrift: fail closed (datum-nicht-tagesgenau)",
      tag.ok === false && tag.reason === "datum-nicht-tagesgenau" && tag.rows === null);
    const sonderPortal = portalHtml([portalEintrag(RB_PATH, "Sondertitel", "2026-09-24")]);
    const sonderDrift = injektion(ROUTEN(sonderPortal,
      new Map([[RB_URL, sonderSeite("rbmskzl", RB_URL, "Sondertitel (falsch)", "2026-09-24")]])));
    const sonder = await KETTE.ladeSenatsquellenKette({ url: QUELLE }, { fetchUrl: sonderDrift.fetchUrl });
    check("sondervorlagen-Titeldrift: fail closed (titel-abweichend)",
      sonder.ok === false && sonder.reason === "titel-abweichend" && sonder.rows === null);
  }

  // -------------------------------------------------------------------------------------------
  // 3) Unbekannter (nicht unterstuetzter) Pfad: keine Weiterreichung, kein Abruf, fail closed.
  // -------------------------------------------------------------------------------------------
  {
    const portal = portalHtml([portalEintrag("/sen/bjf/service/presse/pressemitteilung.1700001.php",
      "Nicht unterstuetzte Meldung", "2026-09-25")]);
    const { fetchUrl, calls } = nurPortal(portal);
    const ergebnis = await KETTE.ladeSenatsquellenKette({ url: QUELLE }, { fetchUrl });
    check("unbekannter Pfad: fail closed ohne Einzelabruf",
      ergebnis.ok === false && ergebnis.reason === "fundstelle-nicht-weiterreichbar"
      && ergebnis.rows === null && ergebnis.kennungen === null && calls.length === 1 && calls[0].url === QUELLE);
  }

  // -------------------------------------------------------------------------------------------
  // 4) Mehr als acht Fundstellen: kein stilles Abschneiden, fail closed, kein Einzelabruf.
  // -------------------------------------------------------------------------------------------
  {
    const lis = [];
    for (let i = 0; i < 9; i += 1) {
      const nr = String(1717900 + i);
      lis.push(portalEintrag(`/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.${nr}.php`,
        `Meldung ${i + 1}`, "2026-09-25"));
    }
    const { fetchUrl, calls } = nurPortal(portalHtml(lis));
    const ergebnis = await KETTE.ladeSenatsquellenKette({ url: QUELLE }, { fetchUrl });
    check("mehr als acht Fundstellen: fail closed statt Abschneiden, kein Einzelabruf",
      ergebnis.ok === false && ergebnis.reason === "zu-viele-fundstellen"
      && ergebnis.rows === null && ergebnis.kennungen === null && calls.length === 1);
  }

  // -------------------------------------------------------------------------------------------
  // 5) Eine spaeter fehlschlagende Fundstelle: null Ergebnisse, keine Teilfreigabe.
  // -------------------------------------------------------------------------------------------
  {
    const portal = portalHtml([
      portalEintrag(P_PATH, "Erste synthetische Meldung", "2026-09-25"),
      portalEintrag(RB_PATH, "Zweite synthetische Meldung", "2026-09-24"),
      portalEintrag(SW_PATH, "Dritte synthetische Meldung", "2026-09-23")
    ]);
    const seiten = new Map([
      [P_URL, presseSeite(P_URL, "Erste synthetische Meldung", "2026-09-25")],
      [RB_URL, sonderSeite("rbmskzl", RB_URL, "Zweite synthetische Meldung", "2026-09-24")]
    ]);
    const { fetchUrl, calls } = injektion(url => {
      if (url === SW_URL) return { body: "kaputt", finalUrl: url, status: 500 };
      return ROUTEN(portal, seiten)(url);
    });
    const ergebnis = await KETTE.ladeSenatsquellenKette({ url: QUELLE }, { fetchUrl });
    check("spaete Fehlfundstelle: fail closed mit null Ergebnissen, keine Teilfreigabe",
      ergebnis.ok === false && ergebnis.reason === "http-nicht-ok"
      && ergebnis.rows === null && ergebnis.kennungen === null && ohneRohinhalte(ergebnis));
    check("spaete Fehlfundstelle: alle drei Fundstellen wurden der Reihe nach versucht",
      calls.length === 4 && calls[3].url === SW_URL);
  }

  // -------------------------------------------------------------------------------------------
  // 6) Feste Portalseite bleibt Pflicht: fremde Adresse wird vor jedem Abruf abgewiesen.
  // -------------------------------------------------------------------------------------------
  {
    const { fetchUrl, calls } = nurPortal(portalHtml([portalEintrag(P_PATH, "Meldung", "2026-09-25")]));
    const fremd = await KETTE.ladeSenatsquellenKette({ url: "https://example.com/presse/" }, { fetchUrl });
    check("feste Portalseite: fremde Adresse fail closed vor jedem Abruf",
      fremd.ok === false && fremd.reason === "abrufziel-ungueltig" && fremd.rows === null && calls.length === 0);
  }

  // -------------------------------------------------------------------------------------------
  // 7) Echte lokale Originale (nur wenn vorhanden) — CI-tauglich.
  //    Die Portalliste wird aus dem amtlichen Portal-Original gebildet und auf die vier
  //    Fundstellen begrenzt, fuer die die amtlichen Originale lokal vorliegen (BJF-Pressearchiv
  //    und die drei Sondervorlagen). Alle Antworten sind injizierte lokale Dateien.
  // -------------------------------------------------------------------------------------------
  const originalDir = process.env.HELMUT_BERLIN_ORIGINALE_DIR || "/private/tmp";
  const originalPath = rel => path.join(originalDir, rel);
  const PORTAL_ORIGINAL = originalPath("helmut-berlin-portal-20260928.html");
  const ORIGINALE = Object.freeze([
    { url: "https://www.berlin.de/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php",
      datei: originalPath("helmut-landesversorgung-originale/be-bjf-kinder-jugendhilfe-20260925.html"),
      sha: "6f026cd9b508e7c15e1c54960918201c3401d54ec6335daec4c9f5b2e88b871e",
      art: "pressearchiv", summaryZeichen: 619 },
    { url: "https://www.berlin.de/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1717887.php",
      datei: originalPath("helmut-berlin-rbmskzl-1717887.html"),
      sha: "9fbe8472be24f8f6f15c02dd58b4780381cecb31a600dfd685eed858ae3efffa",
      art: "sondervorlage", summaryZeichen: 625 },
    { url: "https://www.berlin.de/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1717654.php",
      datei: originalPath("helmut-berlin-rbmskzl-1717654.html"),
      sha: "41ee95dc3ad942cf7ec3a1b1da5558cd077ee02e8082f63352aefb5634583b0b",
      art: "sondervorlage", summaryZeichen: 344 },
    { url: "https://www.berlin.de/sen/web/presse/pressemitteilungen/2026/pressemitteilung.1717406.php",
      datei: originalPath("helmut-berlin-senweb-1717406.html"),
      sha: "987f3aef0890eff51caef25bc14671116c98bf7faf5ead1b3a211cfeeb569bbd",
      art: "sondervorlage", summaryZeichen: 240 }
  ]);
  const verfuegbar = fs.existsSync(PORTAL_ORIGINAL)
    && ORIGINALE.every(p => fs.existsSync(p.datei));
  if (verfuegbar) {
    const portalOriginal = fs.readFileSync(PORTAL_ORIGINAL, "utf8");
    assert.equal(sha(portalOriginal), "1cb44ddadae2caf701333f6acb47de57a8f3da69f4764bdab71434a17d84fac8");
    for (const probe of ORIGINALE) assert.equal(sha(fs.readFileSync(probe.datei, "utf8")), probe.sha);
    const entdeckt = M.pruefeSenatsblock({ url: QUELLE, finalUrl: QUELLE, http: 200, html: portalOriginal });
    const probeFuer = new Map(ORIGINALE.map(p => [p.url, p]));
    const gewaehlt = entdeckt.fundstellen.filter(f => probeFuer.has(f.url));
    check("original: aus der amtlichen Portalseite sind genau vier Fundstellen lokal belegbar",
      gewaehlt.length === 4 && gewaehlt.every(f => f.weiterreichbar === true && M.abrufzielFuer(f.url) !== null));
    const portal = portalHtml(gewaehlt.map(f =>
      portalEintrag(f.url.replace("https://www.berlin.de", ""), f.titel, f.publikationstag)));
    const { fetchUrl, calls } = injektion(url => {
      if (url === QUELLE) return { body: portal, finalUrl: QUELLE, status: 200 };
      const probe = probeFuer.get(url);
      if (!probe) throw new Error("unerwartete Adresse: " + url);
      return { body: fs.readFileSync(probe.datei, "utf8"), finalUrl: url, status: 200 };
    });
    const ergebnis = await KETTE.ladeSenatsquellenKette({ url: QUELLE }, { fetchUrl });
    check("original: echte Offline-Kette liefert vier gepruefte Rohzeilen",
      ergebnis.ok === true && ergebnis.rows.length === 4 && calls.length === 5 && calls[0].url === QUELLE);
    check("original: alle Rohzeilen bestehen die bestehenden Standvalidierer",
      ergebnis.rows.every(row => {
        const probe = probeFuer.get(row.url);
        return probe && stehtImStand(row, probe.art);
      }));
    check("original: Absatzlaengen entsprechen den gesicherten Originalen",
      ergebnis.rows.every(row => {
        const probe = probeFuer.get(row.url);
        return probe && row.summary.length === probe.summaryZeichen
          && row.raw.helmutBerlinArtikelstand.herkunft
            === (probe.art === "sondervorlage" ? B.HERKUNFT_SONDER : B.HERKUNFT);
      }));
    check("original: published_at null, kein HTML/Volltext, keine Uhrzeit",
      ergebnis.rows.every(r => r.published_at === null) && ohneRohinhalte(ergebnis));
  } else {
    console.log("SKIP Originalkette: lokale amtliche Originale fehlen (CI-tauglich)");
  }

  assert.equal(KETTE.MAX_FUNDSTELLEN, 8);
  assert.ok(KETTE.VERSION >= "berlin-senatsquellen-kette-v1");
  console.log(`PASS berlin-senatsquellen-kette-test: ${bestanden} Pruefungen erfolgreich`);
}

laufe().catch(error => { console.error("FAIL " + ((error && error.stack) || error)); process.exitCode = 1; });
