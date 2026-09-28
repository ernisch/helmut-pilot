"use strict";

// Helmut — gezielter Offline-Test des schmalen, zunaechst INAKTIVEN Code-Dispatches fuer den
// EINEN Berliner Landesregierungs-Abrufweg (Landesversorgung Berlin, vor dem 500er Starttor).
// =============================================================================================
// Kein Netz, keine DB, keine KI, keine Production-Daten, keine Speicherung. Geprueft wird:
//   * die exakte Typzuordnung in lib/helmut/quellenarchitektur/source-mode.js NACH dem
//     bestehenden Landesmandats-/Flag-/Status-/Manual-Gate (0 Profile+Flag, Mandat ohne Flag,
//     beides + manual, erst danach synthetisch aktiv), und dass Bundestag/Brandenburg/Fremdwege
//     unveraendert bleiben — auch bei gleichem Namen;
//   * der Dispatch in lib/helmut/crawler.js: NUR der exakte Typ mit exakter Kennung + Portal-
//     adresse ruft ladeSenatsquellenKette auf; Fehler/Teilergebnisse liefern 0 Items und einen
//     sichtbaren Quellenfehler; die minimierten Stand-Rohzeilen bekommen ueber den bestehenden
//     toRawDocumentRow-Vertrag die echte source_id/source_name/source_type, ohne HTML/Volltext
//     und ohne erfundene Publikationsuhrzeit (ID/Standhash/Tag/Summary unveraendert).
// Alle Abrufe sind AUSNAHMSLOS injiziert (amdliches Original, falls vorhanden, sonst synthetisch).
//
// Aufruf: node scripts/berlin-senat-crawl-dispatch-test.js

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SM = require("../lib/helmut/quellenarchitektur/source-mode");
const C = require("../lib/helmut/crawler");
const D = require("../lib/helmut/dedup");
const B = require("../lib/helmut/berlin-artikelstand");
const M = require("../lib/helmut/berlin-senat-entdeckung");

let bestanden = 0;
function check(name, bedingung) {
  assert.ok(bedingung, name);
  bestanden += 1;
  console.log("OK " + name);
}
const sha = (v) => crypto.createHash("sha256").update(v, "utf8").digest("hex");

// ---------------------------------------------------------------------------------------------
// 1) Source-Mode: Typzuordnung + Gate (rein lokal, synthetische Fixtures)
// ---------------------------------------------------------------------------------------------
const QUELLE = "https://www.berlin.de/presse/";
const BASIS = { aktiv: true, profileActive: true, wahlkreis: "Testwahlkreis", ausschuesse: ["Innenausschuss"] };
const P_BE = { ...BASIS, id: "t-be", name: "Testprofil Berlin", fullName: "Testprofil Berlin",
  politische_ebene: "landtag", partei: "CDU", party: "CDU", state: "Berlin", bundesland: "Berlin" };
const P_BB = { ...BASIS, id: "t-bb", name: "Testprofil Brandenburg", fullName: "Testprofil Brandenburg",
  politische_ebene: "landtag", partei: "SPD", party: "SPD", state: "Brandenburg", bundesland: "Brandenburg" };
const P_BUND = { ...BASIS, id: "t-bund", name: "Testprofil Bund", fullName: "Testprofil Bund",
  politische_ebene: "bundestag", partei: "CDU", party: "CDU", state: "Berlin", bundesland: "Berlin" };

// Die EXAKT passende kuenftige Pfadkonfiguration (Identitaet + Abrufmethode + Portaladresse).
const BE_WEG = { id: "rp-be-landesregierung", legacy_source_id: "be-landesregierung",
  publisher_id: "publisher-berlin.de", name: "Land Berlin — Landespressedienst — landesregierung",
  represents_type: null,
  method: "html", url: QUELLE, status: "healthy", activation_mode: "auto", priority: 60 };
const BB_WEG = { id: "rp-bb-landesregierung", legacy_source_id: "bb-landesregierung",
  name: "Landesregierung Brandenburg", represents_type: "government",
  method: "rss", url: "https://bb.example/rss", status: "healthy", activation_mode: "auto", priority: 55 };
const BUND_WEG = { id: "rp-bundestag", legacy_source_id: "bundestag", name: "Bundestag",
  represents_type: "parliament", method: "rss", url: "https://bund.example/rss",
  status: "healthy", activation_mode: "always_on", priority: 100 };
// GLEICHER Name, aber anderer Abrufweg: darf NIE den speziellen Typ bekommen.
const FREMD_WEG = { id: "rp-be-fremdweg", legacy_source_id: "be-fremdweg",
  name: "Land Berlin — Landespressedienst", represents_type: "media",
  method: "googlenews_search", url: "https://news.google.com/rss/search?q=Senat", status: "healthy",
  activation_mode: "auto", priority: 40 };

const PACKAGES = [
  { id: "pk-be", key: "berlin-basis", status: "active" },
  { id: "pk-bb", key: "brandenburg-basis", status: "active" },
  { id: "pk-bund", key: "bund-basis", status: "active" }
];
const LINKS = [
  { package_id: "pk-be", retrieval_path_id: "rp-be-landesregierung" },
  { package_id: "pk-be", retrieval_path_id: "rp-be-fremdweg" },
  { package_id: "pk-bb", retrieval_path_id: "rp-bb-landesregierung" },
  { package_id: "pk-bund", retrieval_path_id: "rp-bundestag" }
];
const FLAG_BE = { HELMUT_LANDESMODULE: "berlin" };
const iPlan = (retrievalPaths, profiles, env) => SM.buildRelationalCrawlPlan({
  retrievalPaths, packages: PACKAGES, packagePaths: LINKS, profiles, legacySources: [], env
});
const mitWeg = (weg, ueberschreibung) => [ueberschreibung ? { ...weg, ...ueberschreibung } : weg, BB_WEG, BUND_WEG, FREMD_WEG];
const aktivIds = (p) => p.aktiv.map((a) => a.id).sort();
const grundVon = (p, id) => (p.ausgeschlossen.find((a) => a.id === id) || {}).grund || null;
const quelleVon = (p, id) => (p.aktiv.find((a) => a.id === id) || {}).source || null;

{
  let p = iPlan(mitWeg(BE_WEG), [], FLAG_BE);
  check("Gate: 0 aktive Profile sperren den Berliner Weg auch MIT Berlin-Flag",
    !aktivIds(p).includes("rp-be-landesregierung") && /landesmodul-gesperrt/.test(grundVon(p, "rp-be-landesregierung")));

  p = iPlan(mitWeg(BE_WEG), [P_BE], {});
  check("Gate: Berliner Mandat OHNE Berlin-Flag ist gesperrt (fail closed)",
    !aktivIds(p).includes("rp-be-landesregierung") && /nicht freigegeben/.test(grundVon(p, "rp-be-landesregierung")));

  p = iPlan(mitWeg(BE_WEG), [P_BUND], FLAG_BE);
  check("Gate: ein Bundestagsmandat MIT Bundesland Berlin berechtigt Berlin nicht",
    !aktivIds(p).includes("rp-be-landesregierung")
      && /kein berechtigtes Landesmandat/.test(grundVon(p, "rp-be-landesregierung")));

  p = iPlan(mitWeg(BE_WEG, { activation_mode: "manual" }), [P_BE], FLAG_BE);
  check("Gate: weiterhin manual gesperrt, auch mit Flag + berechtigtem Mandat",
    !aktivIds(p).includes("rp-be-landesregierung") && /manuell-gesperrt/.test(grundVon(p, "rp-be-landesregierung")));

  p = iPlan(mitWeg(BE_WEG), [P_BE], FLAG_BE);
  const beQuelle = quelleVon(p, "rp-be-landesregierung");
  check("Synthetisch aktiv: exakte Pfadkonfiguration wird zum speziellen Crawler-Quellentyp",
    Boolean(beQuelle) && beQuelle.crawlMethod === SM.BERLIN_SENATSQUELLEN.crawlMethod
      && beQuelle.id === "be-landesregierung" && beQuelle.url === QUELLE
      && beQuelle.name === "Land Berlin — Landespressedienst" && beQuelle.type === "government");

  p = iPlan(mitWeg(BE_WEG, { publisher_id: "publisher-fremd" }), [P_BE], FLAG_BE);
  check("Fremder Publisher trotz gleicher Kennung und URL bekommt keinen speziellen Typ",
    quelleVon(p, "rp-be-landesregierung")?.crawlMethod === "html");

  check("Fremdweg mit GLEICHEM Namen bleibt unveraendert (kein spezieller Typ)",
    quelleVon(p, "rp-be-fremdweg")?.crawlMethod === "rss");
  check("Bundestag bleibt unveraendert", quelleVon(p, "rp-bundestag")?.crawlMethod === "rss");

  p = iPlan(mitWeg(BB_WEG), [P_BE], FLAG_BE);
  check("Brandenburg bleibt bei Berlin-Flag gesperrt",
    !aktivIds(p).includes("rp-bb-landesregierung")
      && /landesmodul-gesperrt/.test(grundVon(p, "rp-bb-landesregierung")));
  p = iPlan(mitWeg(BB_WEG, { method: "googlenews_search", url: "https://news.google.com/rss/search?q=BB" }),
    [P_BB], { HELMUT_LANDESMODULE: "brandenburg" });
  check("Brandenburg wird nie speziell typisiert", quelleVon(p, "rp-bb-landesregierung")?.crawlMethod === "rss");

  p = iPlan(mitWeg(BE_WEG, { url: "https://www.berlin.de/presse/pressemitteilungen/" }), [P_BE], FLAG_BE);
  check("Falsche (nicht zulaessige) URL bleibt beim bisherigen HTML-Verhalten",
    quelleVon(p, "rp-be-landesregierung")?.crawlMethod === "html");
  p = iPlan(mitWeg(BE_WEG, { method: "googlenews_search", url: "https://news.google.com/rss/search?q=Senat" }),
    [P_BE], FLAG_BE);
  check("Falsche Methode bleibt beim bisherigen RSS-/Google-Verhalten",
    quelleVon(p, "rp-be-landesregierung")?.crawlMethod === "rss");
  p = iPlan(mitWeg(BE_WEG, { url: "https://berlin.de/presse/" }), [P_BE], FLAG_BE);
  check("Kanonisch gleichwertige Portalschreibform (ohne www) wird als exakt akzeptiert",
    quelleVon(p, "rp-be-landesregierung")?.crawlMethod === SM.BERLIN_SENATSQUELLEN.crawlMethod);
}

// ---------------------------------------------------------------------------------------------
// 2) Crawler-Dispatch: synthetische amtliche Portal-/Artikelstruktur
// ---------------------------------------------------------------------------------------------
const H2_TEXT = M.H2_TEXT;
const ABSENDER = "Das Presse- und Informationsamt des Landes Berlin teilt mit:";
const dmY = (iso) => { const [j, m, t] = iso.split("-"); return `${t}.${m}.${j}`; };
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
const portalEintrag = (pfad, titel, tag) => li(dmY(tag), pfad, titel);
const MARGINAL = `<div id="layout-grid__area--marginal" role="complementary">`
  + `<div class="modul-contact"><div class="textile">Kontakt</div></div></div>`;
function presseSeite(url, titel, tag) {
  const absaetze = ["Erster Absatz der synthetischen Kette.", "Zweiter Absatz der synthetischen Kette."];
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">`
    + `<meta name="dcterms.date" content="${tag}"><meta name="dcterms.title" content="${titel}">`
    + `<link rel="canonical" href="${url}"></head><body>`
    + `<div id="layout-grid__area--herounit"><h1 class="title">${titel}</h1></div>`
    + `<div id="layout-grid__area--maincontent"><p class="pressnumber">Pressemitteilung vom ${dmY(tag)}</p>`
    + `<section class="modul-text_bild imagealignleft teaser"><div class="text"><div class="textile">`
    + `${absaetze.map((a) => `<p>${a}</p>`).join("")}</div></div></section></div>${MARGINAL}</body></html>`;
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
    + `<div class="textile">${absaetze.map((a) => `<p>${a}</p>`).join("")}</div></div>${MARGINAL}</body></html>`;
}
function injektion(resolver) {
  const calls = [];
  const fetchUrl = async (url, depth, deps) => { calls.push({ url, depth, deps }); return resolver(url); };
  return { fetchUrl, calls };
}
const ROUTEN = (portal, seiten) => (url) => {
  if (url === QUELLE) return { body: portal, finalUrl: QUELLE, status: 200 };
  if (seiten.has(url)) return { body: seiten.get(url), finalUrl: url, status: 200 };
  const fehler = new Error("unerwartete Adresse: " + url);
  fehler.statusCode = 500;
  throw fehler;
};
// Die ECHTE, aus dem exakten Plan-Typ entstandene Quelle (Kennung + Portaladresse + Typ).
const senatsQuelle = (over = {}) => ({ id: "be-landesregierung", name: "Land Berlin — Landespressedienst",
  type: "government", url: QUELLE, priority: 60, active: true,
  crawlMethod: SM.BERLIN_SENATSQUELLEN.crawlMethod, ...over });
// Kein HTML/Volltext und keine erfundene Publikationsuhrzeit in Items bzw. projizierten Zeilen.
function ohneRohinhalte(items) {
  const s = JSON.stringify(items);
  return !/<[a-z/]/i.test(s) && !/"volltext"/.test(s) && !/13:05/.test(s)
    && !/\d{4}-\d{2}-\d{2}T\d{2}/.test(s)
    && items.every((it) => it.published_at === null && it.publishedAt === null && !it.volltext && !it.html);
}

const P_PATH = "/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php";
const RB_PATH = "/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1717887.php";
const SW_PATH = "/sen/web/presse/pressemitteilungen/2026/pressemitteilung.1717406.php";
const P_URL = "https://www.berlin.de" + P_PATH;
const RB_URL = "https://www.berlin.de" + RB_PATH;
const SW_URL = "https://www.berlin.de" + SW_PATH;
function synthetischeSeiten() {
  return new Map([
    [P_URL, presseSeite(P_URL, "Erste synthetische Meldung", "2026-09-25")],
    [RB_URL, sonderSeite("rbmskzl", RB_URL, "Zweite synthetische Meldung", "2026-09-24")],
    [SW_URL, sonderSeite("senweb", SW_URL, "Dritte synthetische Meldung", "2026-09-23")]
  ]);
}
function synthetischesPortal() {
  return portalHtml([
    portalEintrag(P_PATH, "Erste synthetische Meldung", "2026-09-25"),
    portalEintrag(RB_PATH, "Zweite synthetische Meldung", "2026-09-24"),
    portalEintrag(SW_PATH, "Dritte synthetische Meldung", "2026-09-23")
  ]);
}

async function crawlerPruefungen() {
  // --- Positiv: Crawl -> Dedup/Storage-Projektion (kein Netz) --------------------------------
  {
    const { fetchUrl, calls } = injektion(ROUTEN(synthetischesPortal(), synthetischeSeiten()));
    const quelle = senatsQuelle();
    const items = await C.crawlSource(quelle, { fetchUrl });

    check("Crawler: genau drei minimierte Rohitems, Abruf der Portalseite + drei Fundstellen",
      items.length === 3 && calls.length === 4 && calls[0].url === QUELLE);
    check("Crawler: jeder Abruf mit Hostbindung und Statuswunsch",
      calls.every((c) => c.deps.allowedHost === "berlin.de" && c.deps.meldeStatus === true));
    check("Crawler: jede Zeile traegt die ECHTE, gebundene Quellenkennung",
      items.every((it) => it.sourceId === "be-landesregierung"
        && it.sourceName === "Land Berlin — Landespressedienst" && it.sourceType === "government"));
    check("Crawler: kein HTML/Volltext und keine erfundene Uhrzeit",
      ohneRohinhalte(items) && !JSON.stringify(items).includes("Zweiter Absatz der synthetischen Kette."));

    // Bestandsprojektion: exakt der bestehende toRawDocumentRow-Vertrag + Dedup.
    const zeilen = items.map(D.toRawDocumentRow);
    const rows = D.dedupeRawDocuments(zeilen.filter((r) => r && r.id));
    check("Storage-Projektion: drei eindeutige Zeilen, ID/Standhash unveraendert",
      rows.length === 3 && rows.every((row, i) => {
        const stand = B.pruefeArtikelstand(items[i].raw.helmutBerlinArtikelstand);
        return row.id === "rd-" + stand.standHash && row.content_hash === stand.standHash
          && B.leseArtikelstand(row)?.standHash === stand.standHash;
      }));
    check("Storage-Projektion: echte, nicht leere source_id/source_name/source_type",
      rows.every((row) => row.source_id === "be-landesregierung"
        && row.source_name === "Land Berlin — Landespressedienst" && row.source_type === "government"));
    check("Storage-Projektion: Tag ohne Uhrzeit (published_at null), Kalendertag gebunden",
      rows.every((row) => row.published_at === null
        && /^\d{4}-\d{2}-\d{2}$/.test(row.raw.helmutBerlinArtikelstand.publikationstag)));
    check("Storage-Projektion: Summary bleibt der gebundene Absatz, kein Rohfeld dringt ein",
      rows.every((row) => row.summary === items[rows.indexOf(row)].summary
        && row.summary === B.standZusammenfassung(row.summary, B.pruefeArtikelstand(row.raw.helmutBerlinArtikelstand)))
      && rows.every((row) => JSON.stringify(Object.keys(row.raw)) === JSON.stringify(
        ["sourcePriority", "originalUrl", "helmutBerlinArtikelstand"])));
  }

  // --- Negativ A: eine spaetere Fundstelle scheitert -> atomar 0 Items + sichtbarer Fehler ----
  {
    const portal = synthetischesPortal();
    const seiten = synthetischeSeiten();
    seiten.delete(SW_URL); // dritte Fundstelle: Abruf schlaegt fehl
    const { fetchUrl } = injektion((url) => {
      if (url === SW_URL) return { body: "kaputt", finalUrl: url, status: 500 };
      return ROUTEN(portal, seiten)(url);
    });
    // crawlSource bricht fail closed ab; crawlAllSources macht genau daraus den sichtbaren
    // Quellenfehler (0 Items) — die Anbieter-Engstelle wird dafuer injiziert, kein Netzabruf.
    let geworfen = null;
    try { await C.crawlSource(senatsQuelle(), { fetchUrl }); } catch (error) { geworfen = error; }
    const lauf = await C.crawlAllSources([senatsQuelle()], { fetchUrl });
    check("Spaete Fehlfundstelle: crawlSource bricht fail closed ab (keine Teilitems)",
      Boolean(geworfen) && /^berlin-senatsquellen-kette-/.test(String(geworfen.message)));
    check("Spaete Fehlfundstelle: crawlAllSources liefert 0 Items und zaehlt den Quellenfehler sichtbar",
      lauf.rawItems.length === 0 && lauf.newCandidateItems === 0
        && lauf.failedSources === 1 && lauf.successfulSources === 0
        && lauf.results[0].ok === false && lauf.results[0].status === "error");
  }

  // --- Negativ B: falsche Kennung/URL wird gesperrt, OHNE irgendetwas abzurufen --------------
  {
    const { fetchUrl, calls } = injektion(() => { throw new Error("Netz verboten"); });
    let falscheId = null, falscheUrl = null;
    try { await C.crawlSource(senatsQuelle({ id: "rp-be-landesregierung" }), { fetchUrl }); }
    catch (error) { falscheId = error; }
    try { await C.crawlSource(senatsQuelle({ url: "https://www.berlin.de/" }), { fetchUrl }); }
    catch (error) { falscheUrl = error; }
    check("Dispatch: falsche Quellkennung gesperrt, kein Abruf",
      falscheId && /dispatch-ungueltig/.test(falscheId.message) && calls.length === 0);
    check("Dispatch: falsche URL gesperrt, kein Abruf",
      falscheUrl && /dispatch-ungueltig/.test(falscheUrl.message) && calls.length === 0);
    const andere = await C.crawlSource(senatsQuelle({ crawlMethod: "manual" }), { fetchUrl });
    check("Dispatch: nur der exakte Typ ruft die Kette auf (anderer Typ leer, kein Abruf)",
      Array.isArray(andere) && andere.length === 0 && calls.length === 0);
  }
}

// ---------------------------------------------------------------------------------------------
// 3) Optional: dieselbe Projektion ueber die amtlichen lokalen Originale (CI-tauglich, SKIP)
// ---------------------------------------------------------------------------------------------
async function originalPruefung() {
  const dir = process.env.HELMUT_BERLIN_ORIGINALE_DIR || "/private/tmp";
  const o = (rel) => path.join(dir, rel);
  const PORTAL = o("helmut-berlin-portal-20260928.html");
  const ORIGINALE = [
    { url: "https://www.berlin.de/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php",
      datei: o("helmut-landesversorgung-originale/be-bjf-kinder-jugendhilfe-20260925.html") },
    { url: "https://www.berlin.de/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1717887.php",
      datei: o("helmut-berlin-rbmskzl-1717887.html") },
    { url: "https://www.berlin.de/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1717654.php",
      datei: o("helmut-berlin-rbmskzl-1717654.html") },
    { url: "https://www.berlin.de/sen/web/presse/pressemitteilungen/2026/pressemitteilung.1717406.php",
      datei: o("helmut-berlin-senweb-1717406.html") }
  ];
  if (!fs.existsSync(PORTAL) || !ORIGINALE.every((p) => fs.existsSync(p.datei))) {
    console.log("SKIP Originaldispatch: lokale amtliche Originale fehlen (CI-tauglich)");
    return;
  }
  const entdeckt = M.pruefeSenatsblock({ url: QUELLE, finalUrl: QUELLE, http: 200,
    html: fs.readFileSync(PORTAL, "utf8") });
  const probeFuer = new Map(ORIGINALE.map((p) => [p.url, p]));
  const gewaehlt = entdeckt.fundstellen.filter((f) => probeFuer.has(f.url));
  const portal = portalHtml(gewaehlt.map((f) => portalEintrag(f.url.replace("https://www.berlin.de", ""), f.titel, f.publikationstag)));
  const { fetchUrl, calls } = injektion((url) => {
    if (url === QUELLE) return { body: portal, finalUrl: QUELLE, status: 200 };
    const probe = probeFuer.get(url);
    if (!probe) throw new Error("unerwartete Adresse: " + url);
    return { body: fs.readFileSync(probe.datei, "utf8"), finalUrl: url, status: 200 };
  });
  const items = await C.crawlSource(senatsQuelle(), { fetchUrl });
  const rows = items.map(D.toRawDocumentRow);
  check("Original: der Dispatch liefert vier gebundene Zeilen aus den amtlichen Originalen",
    items.length === 4 && calls.length === 5 && rows.every((row) => row && row.id === "rd-" + row.content_hash
      && row.source_id === "be-landesregierung" && row.source_type === "government" && row.published_at === null));
}

(async () => {
  await crawlerPruefungen();
  await originalPruefung();
  check("Kopplung: source-mode-Typ und Crawler-Dispatch-Kennung stimmen ueberein",
    SM.BERLIN_SENATSQUELLEN.crawlMethod === "berlin_senatsquellen_kette");
  console.log(`PASS berlin-senat-crawl-dispatch-test: ${bestanden} Pruefungen erfolgreich`);
})().catch((error) => { console.error("FAIL " + ((error && error.stack) || error)); process.exitCode = 1; });
