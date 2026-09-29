"use strict";

// Helmut — gezielter Offline-Test der fail-closed Source-Mode-Klassifikation fuer die amtliche
// Brandenburg-Landtagspresse (Landesversorgung Brandenburg, vor dem 500er Starttor).
// =============================================================================================
// Kein Netz, keine DB, keine KI, keine Production-Daten, keine Speicherung. Geprueft wird
// AUSSCHLIESSLICH die Typzuordnung in lib/helmut/quellenarchitektur/source-mode.js:
//   * der EINE kuenftige amtliche Weg `rp-bb-landesparlament` erhaelt den neuen Crawl-Typ
//     `brandenburg_landtag_presse_kette` mit source type `parliament` — aber erst NACH dem
//     bestehenden Landesmodul-/Mandats-/Flag-/Status-/Manual-Gate;
//   * das Gate bleibt fail-closed: 0 Profile, Mandat ohne Flag, Bundestagsmandat mit
//     Bundesland Brandenburg, Berlin-Flag allein und activation_mode `manual` sperren;
//   * jede Abweichung bei path (id), publisher, legacy, method oder Feed (URL) erhaelt den Typ
//     nicht — insbesondere nie der Regierungsweg `rp-bb-landesregierung`.
//
// Aufruf: node scripts/brandenburg-landtag-source-mode-test.js

const assert = require("node:assert/strict");

const SM = require("../lib/helmut/quellenarchitektur/source-mode");
const RSS = require("../lib/helmut/brandenburg-landtag-presse-rss");

const KETTE = SM.BRANDENBURG_LANDTAG_PRESSE.crawlMethod;
const ANFRAGE_URL = RSS.ANFRAGE_URL;

let bestanden = 0;
function check(name, bedingung) {
  assert.ok(bedingung, name);
  bestanden += 1;
  console.log("OK " + name);
}

// ---------------------------------------------------------------------------------------------
// Synthetische Fixtures (keine Production-Daten, keine reale Mandantenidentitaet)
// ---------------------------------------------------------------------------------------------
const BASIS = { aktiv: true, profileActive: true, wahlkreis: "Testwahlkreis", ausschuesse: ["Innenausschuss"] };
const P_BB = { ...BASIS, id: "t-bb", name: "Testprofil Brandenburg", fullName: "Testprofil Brandenburg",
  politische_ebene: "landtag", partei: "SPD", party: "SPD", state: "Brandenburg", bundesland: "Brandenburg" };
const P_BE = { ...BASIS, id: "t-be", name: "Testprofil Berlin", fullName: "Testprofil Berlin",
  politische_ebene: "landtag", partei: "CDU", party: "CDU", state: "Berlin", bundesland: "Berlin" };
const P_BUND = { ...BASIS, id: "t-bund", name: "Testprofil Bund", fullName: "Testprofil Bund",
  politische_ebene: "bundestag", partei: "CDU", party: "CDU", state: "Brandenburg", bundesland: "Brandenburg" };

// Die EXAKT passende kuenftige Pfadkonfiguration (Identitaet + Publisher + Abrufmethode + Feed).
const BB_WEG = {
  id: "rp-bb-landesparlament", legacy_source_id: "bb-landesparlament",
  publisher_id: "publisher-landtag.brandenburg.de", name: "Landtag Brandenburg — landesparlament",
  represents_type: "parliament", method: "rss", url: ANFRAGE_URL,
  status: "healthy", activation_mode: "auto", priority: 60
};
// Der Regierungsweg darf den Typ NIE erhalten (auch nicht bei sonst aehnlicher Konfiguration).
const REGIERUNG_WEG = {
  id: "rp-bb-landesregierung", legacy_source_id: "bb-landesregierung",
  publisher_id: "publisher-landesregierung-brandenburg.de", name: "Landesregierung Brandenburg — landesregierung",
  represents_type: "government", method: "rss", url: "https://bb.example/rss",
  status: "healthy", activation_mode: "auto", priority: 55
};
// GLEICHER Name/Publisher, aber anderer Abrufweg: darf NIE den speziellen Typ bekommen.
const FREMD_WEG = {
  id: "rp-bb-fremdweg", legacy_source_id: "bb-fremdweg",
  publisher_id: "publisher-landtag.brandenburg.de", name: "Landtag Brandenburg",
  represents_type: "media", method: "googlenews_search",
  url: "https://news.google.com/rss/search?q=site:landtag.brandenburg.de",
  status: "healthy", activation_mode: "auto", priority: 40
};
const BE_WEG = {
  id: "rp-be-landesregierung", legacy_source_id: "be-landesregierung",
  publisher_id: "publisher-berlin.de", name: "Land Berlin — Landespressedienst — landesregierung",
  represents_type: null, method: "html", url: "https://www.berlin.de/presse/",
  status: "healthy", activation_mode: "auto", priority: 60
};

const PACKAGES = [
  { id: "pk-be", key: "berlin-basis", status: "active" },
  { id: "pk-bb", key: "brandenburg-basis", status: "active" },
  { id: "pk-bund", key: "bund-basis", status: "active" }
];
const LINKS = [
  { package_id: "pk-bb", retrieval_path_id: "rp-bb-landesparlament" },
  { package_id: "pk-bb", retrieval_path_id: "rp-bb-landesregierung" },
  { package_id: "pk-bb", retrieval_path_id: "rp-bb-fremdweg" },
  { package_id: "pk-be", retrieval_path_id: "rp-be-landesregierung" }
];
const FLAG_BB = { HELMUT_LANDESMODULE: "brandenburg" };
const FLAG_BE = { HELMUT_LANDESMODULE: "berlin" };

const iPlan = (retrievalPaths, profiles, env) => SM.buildRelationalCrawlPlan({
  retrievalPaths, packages: PACKAGES, packagePaths: LINKS, profiles, legacySources: [], env
});
const mitWeg = (weg, ueberschreibung) => [
  ueberschreibung ? { ...weg, ...ueberschreibung } : weg, REGIERUNG_WEG, FREMD_WEG, BE_WEG
];
const aktivIds = (p) => p.aktiv.map((a) => a.id).sort();
const grundVon = (p, id) => (p.ausgeschlossen.find((a) => a.id === id) || {}).grund || null;
const quelleVon = (p, id) => (p.aktiv.find((a) => a.id === id) || {}).source || null;

// ---------------------------------------------------------------------------------------------
// 1) Konstante / Bindung: exakte Kennung und exakte amtliche Anfrage-Adresse
// ---------------------------------------------------------------------------------------------
check("Konstante: Crawl-Typ ist exakt brandenburg_landtag_presse_kette", KETTE === "brandenburg_landtag_presse_kette");
check("Konstante: Feed ist exakt die ANFRAGE_URL des lokalen Lesers",
  SM.BRANDENBURG_LANDTAG_PRESSE.url === ANFRAGE_URL
    && SM.BRANDENBURG_LANDTAG_PRESSE.pathId === "rp-bb-landesparlament"
    && SM.BRANDENBURG_LANDTAG_PRESSE.legacySourceId === "bb-landesparlament"
    && SM.BRANDENBURG_LANDTAG_PRESSE.publisherId === "publisher-landtag.brandenburg.de"
    && SM.BRANDENBURG_LANDTAG_PRESSE.method === "rss");

// ---------------------------------------------------------------------------------------------
// 2) Gate bleibt fail-closed (der Typ entsteht erst NACH dem Gate)
// ---------------------------------------------------------------------------------------------
{
  let p = iPlan(mitWeg(BB_WEG), [], FLAG_BB);
  check("Gate: 0 aktive Profile sperren den Weg auch MIT Brandenburg-Flag",
    !aktivIds(p).includes("rp-bb-landesparlament")
      && /landesmodul-gesperrt/.test(grundVon(p, "rp-bb-landesparlament")));

  p = iPlan(mitWeg(BB_WEG), [P_BB], {});
  check("Gate: Brandenburger Mandat OHNE Brandenburg-Flag ist gesperrt (fail closed)",
    !aktivIds(p).includes("rp-bb-landesparlament")
      && /nicht freigegeben/.test(grundVon(p, "rp-bb-landesparlament")));

  p = iPlan(mitWeg(BB_WEG), [P_BUND], FLAG_BB);
  check("Gate: ein Bundestagsmandat MIT Bundesland Brandenburg berechtigt Brandenburg nicht",
    !aktivIds(p).includes("rp-bb-landesparlament")
      && /kein berechtigtes Landesmandat/.test(grundVon(p, "rp-bb-landesparlament")));

  p = iPlan(mitWeg(BB_WEG), [P_BE], FLAG_BE);
  check("Gate: Berlin-Flag allein sperrt Brandenburg",
    !aktivIds(p).includes("rp-bb-landesparlament")
      && /landesmodul-gesperrt/.test(grundVon(p, "rp-bb-landesparlament")));

  p = iPlan(mitWeg(BB_WEG, { activation_mode: "manual" }), [P_BB], FLAG_BB);
  check("Gate: weiterhin manual gesperrt, auch mit Flag + berechtigtem Mandat",
    !aktivIds(p).includes("rp-bb-landesparlament")
      && /manuell-gesperrt/.test(grundVon(p, "rp-bb-landesparlament")));
}

// ---------------------------------------------------------------------------------------------
// 3) Positivfall + negative Abweichungen (synthetisch aktiv, nach dem Gate)
// ---------------------------------------------------------------------------------------------
{
  let p = iPlan(mitWeg(BB_WEG), [P_BB], FLAG_BB);
  const bbQuelle = quelleVon(p, "rp-bb-landesparlament");
  check("Synthetisch aktiv: exakte Pfadkonfiguration wird zum neuen Crawler-Quellentyp (parliament)",
    Boolean(bbQuelle) && bbQuelle.crawlMethod === KETTE && bbQuelle.type === "parliament"
      && bbQuelle.id === "bb-landesparlament" && bbQuelle.url === ANFRAGE_URL
      && bbQuelle.name === "Landtag Brandenburg" && bbQuelle.active === true);

  p = iPlan([{ ...BB_WEG, id: "rp-bb-landesregierung" }, FREMD_WEG, BE_WEG], [P_BB], FLAG_BB);
  check("Abweichung path: falsche Kennung erhaelt den neuen Typ nicht (bleibt RSS)",
    quelleVon(p, "rp-bb-landesregierung")?.crawlMethod === "rss"
      && quelleVon(p, "rp-bb-landesregierung")?.crawlMethod !== KETTE);

  p = iPlan(mitWeg(BB_WEG, { publisher_id: "publisher-fremd" }), [P_BB], FLAG_BB);
  check("Abweichung publisher: fremder Publisher erhaelt den neuen Typ nicht (bleibt RSS)",
    quelleVon(p, "rp-bb-landesparlament")?.crawlMethod === "rss");

  p = iPlan(mitWeg(BB_WEG, { legacy_source_id: "bb-fremd" }), [P_BB], FLAG_BB);
  check("Abweichung legacy: falsche legacy_source_id erhaelt den neuen Typ nicht (bleibt RSS)",
    quelleVon(p, "rp-bb-landesparlament")?.crawlMethod === "rss");

  p = iPlan(mitWeg(BB_WEG, { method: "googlenews_search" }), [P_BB], FLAG_BB);
  check("Abweichung method: falsche Methode erhaelt den neuen Typ nicht (bleibt RSS)",
    quelleVon(p, "rp-bb-landesparlament")?.crawlMethod === "rss");

  p = iPlan(mitWeg(BB_WEG, { url: "https://news.google.com/rss/search?q=site:landtag.brandenburg.de" }),
    [P_BB], FLAG_BB);
  check("Abweichung Feed: andere URL erhaelt den neuen Typ nicht (bleibt RSS)",
    quelleVon(p, "rp-bb-landesparlament")?.crawlMethod === "rss");

  p = iPlan(mitWeg(BB_WEG, { url: RSS.FINALE_URL }), [P_BB], FLAG_BB);
  check("Abweichung Feed: die finale Redirect-Adresse ist NICHT die Anfrage-Adresse (bleibt RSS)",
    quelleVon(p, "rp-bb-landesparlament")?.crawlMethod === "rss");

  check("Fremdweg mit GLEICHEM Publisher/Name bleibt unveraendert (kein spezieller Typ)",
    quelleVon(p, "rp-bb-fremdweg")?.crawlMethod === "rss");

  p = iPlan(mitWeg(BB_WEG), [P_BB, P_BE], { HELMUT_LANDESMODULE: "berlin,brandenburg" });
  check("Der Berliner Landesregierungsweg erhaelt den Brandenburg-Typ nie",
    quelleVon(p, "rp-be-landesregierung")?.crawlMethod === SM.BERLIN_SENATSQUELLEN.crawlMethod
      && quelleVon(p, "rp-be-landesregierung")?.crawlMethod !== KETTE);
  check("Auch bei beiden Landesflags schlaegt der Brandenburg-Typ nicht auf den Regierungsweg durch",
    quelleVon(p, "rp-bb-landesregierung")?.crawlMethod === "rss");
}

console.log(`\n${bestanden} Pruefungen bestanden — fail-closed Klassifikation Brandenburg-Landtagspresse.`);
