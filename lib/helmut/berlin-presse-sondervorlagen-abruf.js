"use strict";

// Helmut — kleinster, geschlossener Abrufadapter fuer EINE amtliche Berliner
// Senats-Pressemitteilung einer eng belegten Sondervorlagen-Pfadfamilie.
// =============================================================================================
// BELEGTER ANLASS (lokale Vorbereitung der Landesversorgung Berlin, 28.09.2026): Der strenge
// Leser (lib/helmut/berlin-presse-sondervorlagen.js) prueft die eng belegten amtlichen Pfadfamilien
// AUSSERHALB des Pressearchivs rein lokal — amtliche URL, Canonical, eigener H1 in der herounit,
// reiner Publikationstag, genau eine geschlossene div.textile und ein gebundener Auszugsabsatz.
// Er braucht dafuer genau die vier beobachteten Felder {url, finalUrl, http, html}. Es fehlte
// genau EIN enger echter HTTP-Einzelabruf, der ihm den tatsaechlich beobachteten HTTP-Status,
// die finalUrl und das HTML zufuehrt.
//
// ADRESSANPASSUNG (06.10.2026): Genau ZWEI weitere unterstuetzte amtliche Familien sind
// als einzelne Alternativen in PFAD ergaenzt — /sen/uvk/presse/pressemitteilungen/<jahr>/... und
// /sen/wgp/presse/<jahr>/... (die WGP-Familie fuehrt KEIN `pressemitteilungen`-Segment). Alle
// uebrigen Schutzgrenzen dieses Moduls bleiben unveraendert.
//
// Vertrag (ladeSondervorlage(doc, deps)):
//   Eingang: doc mit einer VORAB geprueften amtlichen URL einer der belegten Pfadfamilien.
//   Abruf:   ueber die BESTEHENDE Anbietersteuerung `crawler.fetchUrl` mit Hostbindung
//            (deps.allowedHost = berlin.de) und ausdruecklichem Statuswunsch (deps.meldeStatus).
//   Ergebnis:{ ok:true, vorlage } — genau das eingefrorene Leserergebnis aus pruefeSondervorlage;
//            KEIN HTML und KEIN Volltext zusaetzlich im Adapter. Fehler: { ok:false, reason }.
//
// Fail closed:
//   - Nur die exakten amtlichen HTTPS-Adressen auf berlin.de/www.berlin.de, ohne Benutzerinfo,
//     Port, Query/Tracking, Fragment oder Trailing-Slash, und nur die belegten Pfadfamilien
//     .../pressemitteilungen/<jahr>/pressemitteilung.<nr>.php (WGP: /sen/wgp/presse/<jahr>/...).
//   - Die Adresse wird VOR jedem Abruf geprueft; ein fremder Host oder Pfad wird nie angefragt.
//   - Der Abruf folgt KEINEM Hostwechsel (die bestehende `allowedHost`-Sperre bricht vor jedem
//     Redirect auf einen fremden Host ab).
//   - Nur der tatsaechlich beobachtete 200 zaehlt; finalUrl und HTML kommen unveraendert aus der
//     Antwort und werden ausschliesslich durch pruefeSondervorlage bewertet.
//   - Keine Uhrzeit aus dem Publikationstag (published_at bleibt NULL).
//
// KEIN Live-Crawl-Hook, KEINE Quelle wird hier freigeschaltet, KEINE DB-/Productionwirkung.
// Dieses Modul wird von nichts anderem automatisch aufgerufen; es ist ein ausdruecklicher,
// einzeln aufzurufender Einzelabruf.

const VERSION = "berlin-presse-sondervorlagen-abruf-v1";
const BERLIN_HOSTS = new Set(["berlin.de", "www.berlin.de"]);
// Einzige zusaetzliche Abrufoption: `crawler.fetchUrl` liefert bei `true` den beobachteten
// HTTP-Status mit. Ohne das Flag ist die Antwortform unveraendert.
const MELDE_STATUS = true;
// Genau die eng belegten Pfadfamilien, Jahr als eigener Pfadabschnitt, Datei pressemitteilung.<nr>.php.
// UVK und WGP sind exakt als einzelne Alternativen ergaenzt; die WGP-Familie fuehrt kein
// `pressemitteilungen`-Segment. KEINE Verallgemeinerung auf beliebige /sen-Pfade.
const PFAD = /^\/(rbmskzl\/aktuelles\/pressemitteilungen|sen\/web\/presse\/pressemitteilungen|sen\/justv\/presse\/pressemitteilungen|sen\/kultgz\/aktuelles\/pressemitteilungen|sen\/asgiva\/presse\/pressemitteilungen|sen\/uvk\/presse\/pressemitteilungen|sen\/wgp\/presse)\/\d{4}\/pressemitteilung\.\d+\.php$/;

function fordere(ok, grund) { if (!ok) throw new Error("berlin-presse-sondervorlagen-abruf-" + grund); }
function fehlerGrund(error) {
  const nachricht = String((error && error.message) || "");
  const praefix = "berlin-presse-sondervorlagen-abruf-";
  return nachricht.startsWith(praefix) && /^[a-z0-9.-]{1,120}$/.test(nachricht.slice(praefix.length))
    ? nachricht.slice(praefix.length) : null;
}

// Strikt vorab gepruefte amtliche Abrufadresse. Rueckgabe: { url, host } oder null.
// Nur die exakte amtliche Form der belegten Pfadfamilien zaehlt; die www-Fassung ist die
// einzige zulaessige Alternative. Alles andere — http, fremder Host, Port, Benutzerinfo, Query,
// Fragment, Trailing-Slash oder fremder Pfad — wird abgewiesen, BEVOR irgendetwas abgerufen wird.
function pruefeAbrufziel(url) {
  if (typeof url !== "string" || url.length === 0 || url !== url.trim()) return null;
  if (!/^https:\/\/(?:www\.)?berlin\.de\//.test(url)) return null;
  let geparst;
  try { geparst = new URL(url); } catch { return null; }
  if (geparst.protocol !== "https:" || geparst.username !== "" || geparst.password !== ""
    || geparst.port !== "" || geparst.search !== "" || geparst.hash !== "") return null;
  if (geparst.href !== url) return null;
  const hostname = geparst.hostname.toLowerCase();
  if (!BERLIN_HOSTS.has(hostname)) return null;
  if (!PFAD.test(geparst.pathname)) return null;
  return Object.freeze({ url, host: hostname.replace(/^www\./, "") });
}

// Der Fehlergrund eines echten Abrufs. Anbietervertagung und HTTP-Status bleiben unterscheidbar;
// ein Hostwechsel der bestehenden Sperre wird als solcher benannt. Sonst fail closed ohne Rohtext.
function abrufGrund(error) {
  if (error && error.anbieterVertagung) return "anbietergrenze";
  if (Number.isInteger(error && error.statusCode)) return "http-status";
  const nachricht = String((error && error.message) || "");
  if (/hostwechsel/.test(nachricht)) return "hostwechsel";
  return fehlerGrund(error) || "abruf-fehlgeschlagen";
}

// Der Grund eines abgelehnten Lesedurchlaufs (pruefeSondervorlage wirft fail closed).
function vorlageGrund(error) {
  const nachricht = String((error && error.message) || "");
  const praefix = "berlin-presse-sondervorlagen-";
  return nachricht.startsWith(praefix) && /^[a-z0-9.-]{1,120}$/.test(nachricht.slice(praefix.length))
    ? nachricht.slice(praefix.length) : null;
}

async function ladeSondervorlage(doc, deps = {}) {
  let ziel;
  try {
    fordere(doc && typeof doc === "object" && !Array.isArray(doc), "dokument-ungueltig");
    ziel = pruefeAbrufziel(doc.url);
    fordere(ziel, "abrufziel-ungueltig");
  } catch (error) {
    return { ok: false, reason: fehlerGrund(error) || "abrufziel-ungueltig" };
  }

  const fetchUrl = deps.fetchUrl || require("./crawler").fetchUrl;
  let antwort;
  try {
    antwort = await fetchUrl(ziel.url, 0, {
      ...(deps.abruf && typeof deps.abruf === "object" ? deps.abruf : {}),
      allowedHost: ziel.host, meldeStatus: MELDE_STATUS
    });
  } catch (error) {
    return { ok: false, reason: abrufGrund(error) };
  }

  // Nur die tatsaechlich beobachteten Werte weiterreichen. Fehlt der Status (Aufrufer ohne
  // Statusunterstuetzung), bleibt er undefined und der Leser bricht fail closed ab.
  const eingabe = {
    url: ziel.url,
    finalUrl: antwort && antwort.finalUrl,
    http: antwort && antwort.status,
    html: antwort && antwort.body
  };
  try {
    return { ok: true, vorlage: require("./berlin-presse-sondervorlagen").pruefeSondervorlage(eingabe) };
  } catch (error) {
    return { ok: false, reason: vorlageGrund(error) || "vorlage-ungueltig" };
  }
}

module.exports = { VERSION, MELDE_STATUS, pruefeAbrufziel, ladeSondervorlage };
