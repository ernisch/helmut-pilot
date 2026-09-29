"use strict";

// Helmut — kleinster GEMEINSAMER, rein offline/injizierter BE+BB-Nachweis unter dem
// Landesmandatsgate (Landesversorgung, 29.09.2026, vor dem ersten gemischten 500er-Starttor).
// =============================================================================================
// Kein Netz, keine DB, keine KI, keine Production-Daten, keine Speicherung, kein Flag, keine
// Profil-/Cron-/Env-Wirkung. Geprueft wird auf EINEM gemeinsamen relationalen Plan:
//   1) ohne Landesflag UND ohne berechtigtes Landesmandat bleibt BE wie BB gesperrt
//      (fail closed, gate je Land getrennt);
//   2) allein Berlin freigegeben/bemandatiert aktiviert KEINE eigene BB-Quelle, allein BB
//      KEINE eigene Berlin-Quelle (die geteilte rbb24-Zeile bleibt davon unberuehrt, Punkt 5);
//   3) die exakt synthetisch vorbereitete Berlin-Zeile UND Brandenburg-Zeile laufen durch die
//      bestehenden Dispatchketten zu minimalen Stand-Rohzeilen und sichtbaren Lage-Quellenzeilen
//      (published_at immer null, nur Kalendertag sichtbar, kein HTML/Volltext; die EINE belegte
//      UTC-Zeit des Brandenburger Feed-Items bleibt ausschliesslich im geschlossenen BB-Stand,
//      der Berliner Stand kennt keine Zeit);
//   4) die reale, noch unvorbereitete BB-Google-News-Zeile erhaelt NICHT den Spezialtyp;
//   5) der zweilaendrige rbb24-Weg bleibt getrennt und im Plan sichtbar (mehrlaendrig).
// Alle Abrufe sind ausnahmslos injiziert (kleine synthetische Antworten ueber die bestehenden
// fetchUrl-Engstellen); es gibt keinen eigenen Netzweg.
//
// Aufruf: node scripts/landesversorgung-be-bb-gemeinsam-test.js

const assert = require("node:assert/strict");

const SM = require("../lib/helmut/quellenarchitektur/source-mode");
const C = require("../lib/helmut/crawler");
const D = require("../lib/helmut/dedup");
const L = require("../lib/helmut/lage");
const BB = require("../lib/helmut/brandenburg-landtag-presseartikelstand");
const RSS = require("../lib/helmut/brandenburg-landtag-presse-rss");
const M = require("../lib/helmut/berlin-senat-entdeckung");

let bestanden = 0;
function check(name, bedingung) {
  assert.ok(bedingung, name);
  bestanden += 1;
  console.log("OK " + name);
}

// ---------------------------------------------------------------------------------------------
// 0) Gemeinsamer relationaler Plan: BE-Weg, BB-Weg, geteilter rbb24-Weg, Bundestag.
//    Paket-Bindung (package_paths) und Pakete sind rein synthetisch; die Kennungen der beiden
//    speziellen Wege und des rbb24-Weges sind die echten Kennungen aus source-mode bzw. dem Seed.
// ---------------------------------------------------------------------------------------------
const BE_WEG = {
  id: "rp-be-landesregierung", legacy_source_id: "be-landesregierung",
  publisher_id: "publisher-berlin.de", name: "Land Berlin — Landespressedienst",
  represents_type: null, method: "html", url: "https://www.berlin.de/presse/",
  status: "healthy", activation_mode: "auto", priority: 60
};
const BB_WEG_VORBEREITET = {
  id: "rp-bb-landesparlament", legacy_source_id: "bb-landesparlament",
  publisher_id: "publisher-landtag.brandenburg.de", name: "Landtag Brandenburg",
  represents_type: "parliament", method: "rss", url: RSS.ANFRAGE_URL,
  status: "healthy", activation_mode: "auto", priority: 60
};
// Reale, noch UNVORBEREITETE BB-Zeile (Production-Stand: Google-News, manual, needs_review).
const BB_WEG_REAL = {
  ...BB_WEG_VORBEREITET, method: "googlenews_search",
  url: "https://news.google.com/rss/search?q=site:landtag.brandenburg.de&hl=de&gl=DE&ceid=DE:de",
  status: "needs_review", activation_mode: "manual"
};
// Geteilter Zwei-Laender-Weg (rbb = Rundfunk Berlin-Brandenburg). Er traegt KEIN Landespraefix
// und ist allein namentlich als Landesmodul-Kennung gefuehrt.
const RBB24_WEG = {
  id: "rp-rbb24-politik", legacy_source_id: "rbb24-politik",
  publisher_id: "publisher-rbb24.de", name: "rbb24 (Rundfunk Berlin-Brandenburg)",
  represents_type: "media", method: "rss",
  url: "https://www.rbb24.de/politik/index.xml/feed=rss.xml",
  status: "healthy", activation_mode: "auto", priority: 50
};
const BUND_WEG = {
  id: "rp-bundestag", legacy_source_id: "bundestag", name: "Bundestag",
  represents_type: "parliament", method: "rss", url: "https://bund.example/rss",
  status: "healthy", activation_mode: "always_on", priority: 100
};

const PAKETE = [
  { id: "pk-be", key: "berlin-basis", status: "active" },
  { id: "pk-bb", key: "brandenburg-basis", status: "active" },
  { id: "pk-bund", key: "bund-basis", status: "active" }
];
const PAKET_WEGE = [
  { package_id: "pk-be", retrieval_path_id: "rp-be-landesregierung" },
  { package_id: "pk-bb", retrieval_path_id: "rp-bb-landesparlament" },
  { package_id: "pk-be", retrieval_path_id: "rp-rbb24-politik" },
  { package_id: "pk-bb", retrieval_path_id: "rp-rbb24-politik" },
  { package_id: "pk-bund", retrieval_path_id: "rp-bundestag" }
];

// Synthetische, aktivierungsberechtigte Landtagsmandate (Berlin / Brandenburg). Bewusst KEINE
// Profile ausserhalb dieser beiden Laender; die Partei ist frei gewaehlt und fuer die Aktivierung
// unerheblich (das Landespaket ist neutral).
const BASIS = { aktiv: true, profileActive: true, ausschuesse: ["Innenausschuss"] };
const P_BE = { ...BASIS, id: "t-be", name: "Testprofil Berlin", fullName: "Testprofil Berlin",
  politische_ebene: "landtag", partei: "CDU", party: "CDU", state: "Berlin",
  bundesland: "Berlin", wahlkreis: "Berlin-Mitte" };
const P_BB = { ...BASIS, id: "t-bb", name: "Testprofil Brandenburg", fullName: "Testprofil Brandenburg",
  politische_ebene: "landtag", partei: "SPD", party: "SPD", state: "Brandenburg",
  bundesland: "Brandenburg", wahlkreis: "Potsdam" };

const bauPlan = ({ flag, profiles, bbWeg = BB_WEG_VORBEREITET }) => SM.buildRelationalCrawlPlan({
  retrievalPaths: [BE_WEG, bbWeg, RBB24_WEG, BUND_WEG],
  packages: PAKETE, packagePaths: PAKET_WEGE, profiles, legacySources: [],
  env: flag === undefined ? {} : { HELMUT_LANDESMODULE: flag }
});
const aktivIds = (p) => p.aktiv.map((a) => a.id).sort();
const grundVon = (p, id) => (p.ausgeschlossen.find((a) => a.id === id) || {}).grund || null;
const quelleVon = (p, id) => (p.aktiv.find((a) => a.id === id) || {}).source || null;
const sperrGrund = (p, id) => /landesmodul-gesperrt/.test(grundVon(p, id) || "");

// ---------------------------------------------------------------------------------------------
// 1) + 2) Gate: ohne Flag/Profil beides gesperrt; Laender wirken getrennt (kein Uebersprung).
// ---------------------------------------------------------------------------------------------
function gatePruefungen() {
  {
    const p = bauPlan({ flag: undefined, profiles: [] });
    check("Gate: ohne Flag UND ohne Profil bleiben BE und BB gesperrt (fail closed)",
      sperrGrund(p, "rp-be-landesregierung") && sperrGrund(p, "rp-bb-landesparlament")
        && !aktivIds(p).includes("rp-be-landesregierung")
        && !aktivIds(p).includes("rp-bb-landesparlament"));
    check("Gate: der geteilte rbb24-Weg ist ohne jedes Landesmandat ebenfalls gesperrt",
      sperrGrund(p, "rp-rbb24-politik"));
    check("Gate: der Bundesweg bleibt unabhaengig davon unberuehrt",
      aktivIds(p).includes("rp-bundestag") && !quelleVon(p, "rp-bundestag").crawlMethod.includes("kette"));
  }

  {
    // Allein Berlin: nur der Berliner Weg (plus der geteilte rbb24-Weg) laeuft.
    const p = bauPlan({ flag: "berlin", profiles: [P_BE] });
    check("Allein Berlin: der exakte Berliner Weg wird zum speziellen Quellentyp",
      quelleVon(p, "rp-be-landesregierung")?.crawlMethod === SM.BERLIN_SENATSQUELLEN.crawlMethod
        && quelleVon(p, "rp-be-landesregierung")?.id === "be-landesregierung"
        && quelleVon(p, "rp-be-landesregierung")?.type === "government"
        && quelleVon(p, "rp-be-landesregierung")?.url === BE_WEG.url);
    check("Allein Berlin: KEINE eigene Brandenburg-Quelle wird aktiviert",
      !aktivIds(p).includes("rp-bb-landesparlament") && sperrGrund(p, "rp-bb-landesparlament"));
    check("Allein Berlin: die einzige Brandenburg beruehrende aktive Zeile ist der geteilte rbb24-Weg",
      p.landesmodule.aktiveWegeJeLand.brandenburg.length === 1
        && p.landesmodule.aktiveWegeJeLand.brandenburg[0] === "rp-rbb24-politik");
  }

  {
    // Allein Brandenburg: nur der Brandenburger Weg (plus der geteilte rbb24-Weg) laeuft.
    const p = bauPlan({ flag: "brandenburg", profiles: [P_BB] });
    check("Allein BB: der exakte amtliche Landtagspresseweg wird zum speziellen Quellentyp",
      quelleVon(p, "rp-bb-landesparlament")?.crawlMethod === SM.BRANDENBURG_LANDTAG_PRESSE.crawlMethod
        && quelleVon(p, "rp-bb-landesparlament")?.id === "bb-landesparlament"
        && quelleVon(p, "rp-bb-landesparlament")?.type === "parliament"
        && quelleVon(p, "rp-bb-landesparlament")?.url === RSS.ANFRAGE_URL);
    check("Allein BB: KEINE eigene Berlin-Quelle wird aktiviert",
      !aktivIds(p).includes("rp-be-landesregierung") && sperrGrund(p, "rp-be-landesregierung"));
    check("Allein BB: die einzige Berlin beruehrende aktive Zeile ist der geteilte rbb24-Weg",
      p.landesmodule.aktiveWegeJeLand.berlin.length === 1
        && p.landesmodule.aktiveWegeJeLand.berlin[0] === "rp-rbb24-politik");
  }

  {
    // Beide Laender zusammen: beide exakten Wege laufen, die Landesmodule sind ehrlich getrennt.
    const p = bauPlan({ flag: "berlin,brandenburg", profiles: [P_BE, P_BB] });
    check("Beide Laender: BE- und BB-Weg laufen zugleich (jeder mit seinem eigenen Spezialtyp)",
      quelleVon(p, "rp-be-landesregierung")?.crawlMethod === SM.BERLIN_SENATSQUELLEN.crawlMethod
        && quelleVon(p, "rp-bb-landesparlament")?.crawlMethod === SM.BRANDENBURG_LANDTAG_PRESSE.crawlMethod);
    check("Beide Laender: keine Fremdtypisierung — Berlin bleibt government, BB parliament",
      quelleVon(p, "rp-be-landesregierung")?.type === "government"
        && quelleVon(p, "rp-bb-landesparlament")?.type === "parliament");
  }

  {
    // Nur Berlin freigegeben, aber KEIN berechtigtes Berliner Landesmandat (nur Brandenburg).
    const p = bauPlan({ flag: "berlin", profiles: [P_BB] });
    check("Gate: Berlin-Flag ohne berechtigtes Berliner Mandat sperrt den Berliner Weg",
      sperrGrund(p, "rp-be-landesregierung")
        && /kein berechtigtes Landesmandat/.test(grundVon(p, "rp-be-landesregierung") || ""));
  }
}

// ---------------------------------------------------------------------------------------------
// 3) Synthetische, exakt vorbereitete Zeilen durch die BESTEHENDEN Dispatchketten fuehren.
//    Berlin: amtliches Presseportal + Pressearchiv-Artikel. Brandenburg: amtlicher RSS-Feed +
//    amtliche Landtagsmeldung. Rein injizierte Abrufe.
// ---------------------------------------------------------------------------------------------
const QUELLE = "https://www.berlin.de/presse/";
const P_PATH = "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php";
const P_URL = "https://www.berlin.de" + P_PATH;
const BE_TITEL = "Reform der Kinder- und Jugendhilfe: Berlin fordert verbindlichen Fahrplan";
const BE_TAG = "2026-09-25";
const dmY = (iso) => { const [j, m, t] = iso.split("-"); return `${t}.${m}.${j}`; };
function portalLi(datum, pfad, titel) {
  return `<li><div class="cell date">${datum} 13:05 Uhr</div>`
    + `<div class="cell text"><a href="${pfad}" >${titel}</a><div class="category"> `
    + `<strong>Behörde: </strong>Presse- und Informationsamt des Landes Berlin</div></div></li>`;
}
function portalHtml(lis) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">`
    + `<meta name="dcterms.date" content="2026-09-28"><link rel="canonical" href="${QUELLE}"></head>`
    + `<body><div id="page-wrapper"><div id="layout-grid__area--maincontent">`
    + `<div class="modul-rss_list block"><h2 class="title">${M.H2_TEXT}</h2><div class="inner">`
    + `<ul class="list--tablelist ruler  has-date">${lis.join("")}</ul></div></div>`
    + `<section class="modul-text_bild"><h2 class="title">Aktuelle Mitteilungen der Bezirksämter</h2>`
    + `<div class="text"><div class="textile"><ul><li><a href="/presse/mitte">Bezirksamt Mitte</a></li>`
    + `</ul></div></div></section></div></div></body></html>`;
}
function presseSeite(url, titel, tag) {
  const absaetze = ["Erster Absatz der synthetischen Berliner Kette.",
    "Zweiter Absatz der synthetischen Berliner Kette."];
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">`
    + `<meta name="dcterms.date" content="${tag}"><meta name="dcterms.title" content="${titel}">`
    + `<link rel="canonical" href="${url}"></head><body>`
    + `<div id="layout-grid__area--herounit"><h1 class="title">${titel}</h1></div>`
    + `<div id="layout-grid__area--maincontent"><p class="pressnumber">Pressemitteilung vom ${dmY(tag)}</p>`
    + `<section class="modul-text_bild imagealignleft teaser"><div class="text"><div class="textile">`
    + `${absaetze.map((a) => `<p>${a}</p>`).join("")}</div></div></section></div>`
    + `<div id="layout-grid__area--marginal" role="complementary"><div class="modul-contact">`
    + `<div class="textile">Kontakt</div></div></div></body></html>`;
}

const BB_ITEM = { nummer: "50117", slug: "synthetische_meldung",
  titel: "Synthetische Landtagsmeldung zum Beispielvorhaben", datum: "2026-09-23",
  pubDate: "Wed, 23 Sep 2026 12:42:00 +0200" };
const MONATE = ["", "Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August",
  "September", "Oktober", "November", "Dezember"];
const bbItemLink = (item) => `https://www.landtag.brandenburg.de/sixcms/detail.php?id=brandenburg_01.c.${item.nummer}.de`;
const bbKanonisch = (item) => `https://www.landtag.brandenburg.de/de/meldungen/${item.slug}/${item.nummer}`;
function bbArtikelHtml(item) {
  const [jahr, monat, tag] = item.datum.split("-");
  const url = bbKanonisch(item);
  return `<!doctype html><html lang="de"><head><meta charset="UTF-8">`
    + `<meta property="og:title" content="${item.titel} - Landtag Brandenburg">`
    + `<title>${item.titel} - Landtag Brandenburg</title><link rel="canonical" href="${url}"></head>`
    + `<body><div class="wrapper container"><div class="row"><main class="col-lg">`
    + `<nav aria-label="Sie sind hier"><h6>Breadcrumb</h6><ol><li><a href="/de/startseite">Start</a></li></ol></nav>`
    + `<h1>${item.titel}</h1>\n<p><em>Potsdam, ${Number(tag)}. ${MONATE[Number(monat)]} ${jahr} / 134</em></p>\n`
    + `<p>Die synthetische Landtagsmeldung beschreibt einen amtlich belegten Sachverhalt der `
    + `Brandenburger Landesversorgung fuer die lokale Offlinepruefung dieses gemeinsamen Nachweises.</p>\n`
    + `<p>Ein zweiter, ebenfalls vollstaendiger Sachabsatz derselben synthetischen Meldung.</p>\n`
    + `<p><ul class="list-links"><li><a class="download" target="_blank" `
    + `href="/media_fast/6/PM_${item.nummer}.pdf">Pressemitteilung ${item.nummer} <em>[PDF]</em></a></li></ul></p>`
    + `</main><aside class="col-lg-4"><section class="box accent"><h4>Kontakt</h4>`
    + `<p>Die <a href="/sixcms/detail.php/25215">Pressestelle</a> steht zur Verfuegung.</p></section></aside>`
    + `<footer><address class="vcard">Landtag Brandenburg</address></footer></div></div></body></html>`;
}
function bbFeedXml(item) {
  const link = bbItemLink(item);
  return `<?xml version="1.0" encoding="utf-8"?>`
    + `<?xml-stylesheet type="text/css" href="/assets/css/feed.css"?>`
    + `<rss version="2.0"><channel><title>${RSS.KANAL_TITEL}</title><link>${RSS.FINALE_URL}</link>`
    + `<description>Aktuelle Pressemitteilungen aus dem Landtag Brandenburg</description>`
    + `<lastBuildDate>Mon, 28 Sep 2026 16:26:47 +0200</lastBuildDate>`
    + `<item><title><![CDATA[${item.titel}]]></title><link>${link}</link><guid>${link}</guid>`
    + `<pubDate>${item.pubDate}</pubDate><author>brandenburg_01.c.${item.nummer}.de (${item.nummer})</author>`
    + `<description><![CDATA[...]]></description></item></channel></rss>`;
}

// Injizierte Abrufe: die jeweils EINE feste Anfrageadresse plus die jeweils EINE Fundstelle.
function berlinAbruf() {
  const calls = [];
  const fetchUrl = async (url, depth, deps) => {
    calls.push({ url, depth, deps });
    if (url === QUELLE) return { body: portalHtml([portalLi(dmY(BE_TAG), P_PATH, BE_TITEL)]), finalUrl: QUELLE, status: 200 };
    if (url === P_URL) return { body: presseSeite(P_URL, BE_TITEL, BE_TAG), finalUrl: P_URL, status: 200 };
    throw new Error("unerwartete Adresse: " + url);
  };
  return { fetchUrl, calls };
}
function brandenburgAbruf() {
  const calls = [];
  const fetchUrl = async (url, depth, deps) => {
    calls.push({ url, depth, deps });
    if (url === RSS.ANFRAGE_URL) return { body: bbFeedXml(BB_ITEM), finalUrl: RSS.FINALE_URL, status: 200 };
    if (url === bbItemLink(BB_ITEM)) return { body: bbArtikelHtml(BB_ITEM), finalUrl: bbKanonisch(BB_ITEM), status: 200 };
    throw new Error("unerwartete Adresse: " + url);
  };
  return { fetchUrl, calls };
}
const berlinQuelle = () => ({ id: "be-landesregierung", name: "Land Berlin — Landespressedienst",
  type: "government", url: QUELLE, priority: 60, active: true,
  crawlMethod: SM.BERLIN_SENATSQUELLEN.crawlMethod });
const brandenburgQuelle = () => ({ id: "bb-landesparlament", name: "Landtag Brandenburg",
  type: "parliament", url: RSS.ANFRAGE_URL, priority: 60, active: true,
  crawlMethod: SM.BRANDENBURG_LANDTAG_PRESSE.crawlMethod });

// Tatsaechlicher minimaler Standvertrag der beiden projizierten Rohzeilen:
//   BE-Stand: 8 geschlossene Felder (version, herkunft, url, titel, publikationstag, absatzHash,
//             volltextHash, standHash) — kennt KEINE Uhrzeit.
//   BB-Stand: 9 geschlossene Felder, zusaetzlich GENAU EIN gebundenes Zeitfeld
//             publikationszeitpunktUtc, das ausschliesslich die UTC-Fassung des amtlichen
//             Feed-Item-Zeitpunkts ist (hier aus BB_ITEM.pubDate reproduzierbar).
// Die Sicherheitsgarantie lautet daher praezise: keine HTML-/Volltext-Nutzlast, published_at auf
// Zeilenebene null (keine erfundene/sichtbare Uhrzeit) und KEINE weitere Zeitangabe ausserhalb
// des einen belegten, reproduzierbaren BB-Standfelds. Legitime bestehende Stand-Metadaten (der
// belegte BB-Zeitpunkt) duerfen NICHT als "erfundene Uhrzeit" verworfen werden.
function ohneRohinhalte(rows) {
  const be = rows.find((r) => r.source_id === "be-landesregierung");
  const bb = rows.find((r) => r.source_id === "bb-landesparlament");
  const beStand = be.raw.helmutBerlinArtikelstand;
  const bbStand = bb.raw[BB.ROHFELD];
  const zeitregex = /\d{4}-\d{2}-\d{2}T\d{2}/;
  const alleStrings = (wert, out = []) => {
    if (typeof wert === "string") out.push(wert);
    else if (Array.isArray(wert)) wert.forEach((w) => alleStrings(w, out));
    else if (wert && typeof wert === "object") Object.values(wert).forEach((w) => alleStrings(w, out));
    return out;
  };
  const belegtUtc = new Date(BB_ITEM.pubDate).toISOString();
  // (a) Kein HTML-/Volltext-Rohfeld in den Zeilen und kein Markup in irgendeinem Rohwert.
  const felder = [...Object.keys(be.raw), ...Object.keys(bb.raw), ...Object.keys(beStand), ...Object.keys(bbStand)];
  const keineNutzlast = !felder.some((f) => /^(volltext|volltext_html|html|raw_html|html_inhalt|body)$/i.test(f))
    && !/<[a-z!/][^>]*>/i.test(JSON.stringify(rows));
  // (b) Zeilenebene bleibt tagesgenau: keine sichtbare/erfundene Veroeffentlichungszeit.
  const tagesgenau = rows.every((row) => row.published_at === null);
  // (c) Genau EINE Zeitangabe in beiden Zeilen insgesamt: die belegte, reproduzierbare
  //     UTC-Fassung des BB-Feed-Items. Sie liegt im geschlossenen BB-Stand; der Berliner Stand
  //     ist zeitfrei und keine sonstige Zeitangabe (Top-Level wie Rohfelder) ist erlaubt.
  const alleZeiten = alleStrings(rows).filter((v) => zeitregex.test(v));
  const beZeitfrei = !alleStrings(beStand).some((v) => zeitregex.test(v));
  const zeitVertrag = alleZeiten.length === 1 && alleZeiten[0] === belegtUtc
    && bbStand.publikationszeitpunktUtc === belegtUtc;
  return keineNutzlast && tagesgenau && beZeitfrei && zeitVertrag;
}

async function dispatchPruefungen() {
  // Positiv Berlin: Portal -> Pressearchiv -> minimierte Stand-Rohzeile.
  const be = berlinAbruf();
  const beItems = await C.crawlSource(berlinQuelle(), { fetchUrl: be.fetchUrl });
  check("Berlin-Kette: genau eine minimierte Rohzeile (Portal + eine Fundstelle)",
    beItems.length === 1 && be.calls.length === 2 && be.calls[0].url === QUELLE
      && be.calls.every((c) => c.deps.allowedHost === "berlin.de" && c.deps.meldeStatus === true));
  check("Berlin-Kette: die Zeile traegt die echte, gebundene Quellenkennung",
    beItems[0].sourceId === "be-landesregierung"
      && beItems[0].sourceName === "Land Berlin — Landespressedienst"
      && beItems[0].sourceType === "government");

  // Positiv Brandenburg: fester Feed -> amtliche Meldung -> minimierte Stand-Rohzeile.
  const bb = brandenburgAbruf();
  const bbItems = await C.crawlSource(brandenburgQuelle(), { fetchUrl: bb.fetchUrl });
  check("BB-Kette: genau eine minimierte Rohzeile (Feed + eine Meldung)",
    bbItems.length === 1 && bb.calls.length === 2 && bb.calls[0].url === RSS.ANFRAGE_URL
      && bb.calls[0].deps.allowedHost === "landtag.brandenburg.de");
  check("BB-Kette: die Zeile traegt die echte, gebundene Quellenkennung",
    bbItems[0].sourceId === "bb-landesparlament"
      && bbItems[0].sourceName === "Landtag Brandenburg"
      && bbItems[0].sourceType === "parliament");

  // Projektion ueber den BESTEHENDEN toRawDocumentRow-Vertrag + Dedup.
  const rows = D.dedupeRawDocuments([
    ...beItems.map(D.toRawDocumentRow).filter((r) => r && r.id),
    ...bbItems.map(D.toRawDocumentRow).filter((r) => r && r.id)
  ]);
  const beRow = rows.find((r) => r.source_id === "be-landesregierung");
  const bbRow = rows.find((r) => r.source_id === "bb-landesparlament");
  check("Storage-Projektion: genau zwei getrennte Stand-Rohzeilen (BE + BB)",
    rows.length === 2 && Boolean(beRow) && Boolean(bbRow));
  check("Storage-Projektion: BE-ID/Standhash unveraendert ueber beide Stand-Validierer",
    beRow.id === "rd-" + require("../lib/helmut/berlin-artikelstand").pruefeArtikelstand(beRow.raw.helmutBerlinArtikelstand).standHash
      && beRow.content_hash === beRow.id.slice(3));
  check("Storage-Projektion: BB-ID/Standhash unveraendert ueber den eigenen Stand-Validierer",
    bbRow.id === "rd-" + BB.pruefeArtikelstand(bbRow.raw[BB.ROHFELD]).standHash
      && bbRow.content_hash === bbRow.id.slice(3));
  check("Storage-Projektion: Tag ohne Uhrzeit (published_at null), nur Kalendertag gebunden",
    beRow.published_at === null && bbRow.published_at === null
      && beRow.raw.helmutBerlinArtikelstand.publikationstag === BE_TAG
      && bbRow.raw[BB.ROHFELD].publikationstag === BB_ITEM.datum);
  check("Storage-Projektion: kein HTML/Volltext und keine erfundene Uhrzeit in beiden Zeilen",
    ohneRohinhalte(rows));
  check("Storage-Projektion: keine fremden Raw-Felder in die Rohzeile geschmuggelt",
    JSON.stringify(Object.keys(beRow.raw).sort()) === JSON.stringify(
      ["helmutBerlinArtikelstand", "originalUrl", "sourcePriority"].sort())
    && JSON.stringify(Object.keys(bbRow.raw).sort()) === JSON.stringify(
      [BB.ROHFELD, "originalUrl", "sourcePriority"].sort()));

  // Sichtbare Lage-Quellenzeile: genau der belegte Kalendertag, KEINE Uhrzeit.
  const beSicht = L.mapSource(beRow);
  const bbSicht = L.mapSource(bbRow);
  check("Sichtbare Lage-Quellenzeile BE: belegter Kalendertag, publishedAt leer",
    beSicht.dateLabel === "25. September 2026" && beSicht.publishedAt === ""
      && beSicht.url === P_URL && beSicht.name === "Land Berlin — Landespressedienst");
  check("Sichtbare Lage-Quellenzeile BB: belegter Kalendertag, publishedAt leer",
    bbSicht.dateLabel === "23. September 2026" && bbSicht.publishedAt === ""
      && bbSicht.url === bbKanonisch(BB_ITEM) && bbSicht.name === "Landtag Brandenburg");
}

// ---------------------------------------------------------------------------------------------
// 4) Reale, noch unvorbereitete BB-Zeile: KEIN Spezialtyp (kein Kettendispatch).
// ---------------------------------------------------------------------------------------------
function unvorbereitetPruefung() {
  const typ = SM.toCrawlerSource(BB_WEG_REAL, new Map());
  check("Reale BB-Zeile: Google-News/manual/needs_review erhaelt NICHT den Landtagspresse-Spezialtyp",
    typ.crawlMethod === "rss"
      && typ.crawlMethod !== SM.BRANDENBURG_LANDTAG_PRESSE.crawlMethod
      && typ.rssUrl === BB_WEG_REAL.url);
  const p = bauPlan({ flag: "brandenburg", profiles: [P_BB], bbWeg: BB_WEG_REAL });
  check("Reale BB-Zeile: bleibt trotz Brandenburg-Freigabe und Mandat manuell gesperrt",
    !aktivIds(p).includes("rp-bb-landesparlament")
      && /manuell-gesperrt/.test(grundVon(p, "rp-bb-landesparlament") || ""));
}

// ---------------------------------------------------------------------------------------------
// 5) Geteilter rbb24-Weg: getrennt und transparent (mehrlaendrig), kein stiller Landeswechsel.
// ---------------------------------------------------------------------------------------------
function mehrlaendrigPruefung() {
  const nurBe = bauPlan({ flag: "berlin", profiles: [P_BE] });
  const mBe = (nurBe.landesmodule.mehrlaendrig.find((m) => m.id === "rp-rbb24-politik") || {});
  check("rbb24 bei nur Berlin: sichtbar als mehrlaendrig mit Fremdland Brandenburg",
    nichtLeer(mBe) && JSON.stringify(mBe.landesmodule.sort()) === JSON.stringify(["berlin", "brandenburg"])
      && JSON.stringify(mBe.fremdlaender) === JSON.stringify(["brandenburg"]));
  check("rbb24 bei nur Berlin: bleibt ein eigener, geteilter Quelleintrag (kein BE-/BB-Spezialtyp)",
    quelleVon(nurBe, "rp-rbb24-politik")?.crawlMethod === "rss"
      && quelleVon(nurBe, "rp-rbb24-politik")?.url === RBB24_WEG.url);

  const nurBb = bauPlan({ flag: "brandenburg", profiles: [P_BB] });
  const mBb = (nurBb.landesmodule.mehrlaendrig.find((m) => m.id === "rp-rbb24-politik") || {});
  check("rbb24 bei nur BB: sichtbar als mehrlaendrig mit Fremdland Berlin",
    nichtLeer(mBb) && JSON.stringify(mBb.fremdlaender) === JSON.stringify(["berlin"]));

  const beide = bauPlan({ flag: "berlin,brandenburg", profiles: [P_BE, P_BB] });
  check("rbb24 bei beiden Laendern: nicht mehr als mehrlaendrig markiert (beide wirksam)",
    !beide.landesmodule.mehrlaendrig.some((m) => m.id === "rp-rbb24-politik")
      && beide.landesmodule.wirksam.sort().join(",") === "berlin,brandenburg");
}
const nichtLeer = (o) => Boolean(o && Object.keys(o).length);

(async () => {
  check("Kopplung: die beiden Dispatch-Kennungen sind exakt die source-mode-Kennungen",
    SM.BERLIN_SENATSQUELLEN.crawlMethod === "berlin_senatsquellen_kette"
      && SM.BRANDENBURG_LANDTAG_PRESSE.crawlMethod === "brandenburg_landtag_presse_kette"
      && C !== null);
  gatePruefungen();
  await dispatchPruefungen();
  unvorbereitetPruefung();
  mehrlaendrigPruefung();
  console.log(`PASS landesversorgung-be-bb-gemeinsam-test: ${bestanden} Pruefungen erfolgreich`);
})().catch((error) => { console.error("FAIL " + ((error && error.stack) || error)); process.exitCode = 1; });
