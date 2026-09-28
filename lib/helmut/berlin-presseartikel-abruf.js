"use strict";

// Helmut — kleinster, geschlossener Abrufadapter fuer EINEN amtlichen Berlin.de-Pressearchiv-Artikel.
// =============================================================================================
// BELEGTER ANLASS (Roadmap-Vorbereitung der Landesversorgung Berlin): Der strenge Leser
// (lib/helmut/berlin-presseartikel.js) prueft amtliche URL, Titel, Publikationstag (reiner
// Kalendertag) und Volltext rein lokal; der Stand-/Speichervertrag
// (lib/helmut/berlin-artikelstand.js) bildet daraus den hashgebundenen minimierten Rohstand bis
// zur sichtbaren Lage-Ausgabe ab. Es fehlte genau EIN enger echter HTTP-Abruf, der dem Leser den
// tatsaechlich beobachteten HTTP-Status, die finalUrl und das HTML zufuehrt.
//
// Vertrag (ladePresseartikelStand(doc, deps)):
//   Eingang: doc mit einer VORAB geprueften amtlichen Berlin.de-Pressearchiv-Artikel-URL.
//   Abruf:   ueber die BESTEHENDE Anbietersteuerung `crawler.fetchUrl` mit Hostbindung
//            (deps.allowedHost = berlin.de) und ausdruecklichem Statuswunsch (deps.meldeStatus).
//   Ergebnis:{ ok:true, stand, row, absatz } — genau der minimierte Artikelstand aus
//            standAusOriginal; KEIN HTML, KEIN Volltext. Fehler: { ok:false, reason }.
//
// Fail closed:
//   - Nur die amtliche HTTPS-Form auf berlin.de/www.berlin.de, ohne Benutzerinfo, Port, Hash
//     oder Trailing-Slash, mit Pressearchiv-Pfad und pressemitteilung.NNNN.php.
//   - Der Abruf folgt KEINEM Hostwechsel (die bestehende `allowedHost`-Sperre bricht vor jedem
//     Redirect auf einen fremden Host ab).
//   - Der Status muss der tatsaechlich beobachtete 200 sein; finalUrl/HTML kommen unveraendert
//     aus der Antwort und werden ausschliesslich durch pruefePresseartikel bewertet.
//   - Keine Uhrzeit aus dem Publikationstag, kein Volltext in raw_documents.summary, keine
//     generische HTML-Normalisierung — das leistet der bestehende Stand-Vertrag.
//
// KEIN Live-Crawl-Hook, KEINE Quelle wird hier freigeschaltet, KEINE DB-/Productionwirkung.
// Dieses Modul wird von nichts anderem automatisch aufgerufen; es ist ein ausdruecklicher,
// einzeln aufzurufender Einzelabruf.

const VERSION = "berlin-presseartikel-abruf-v1";
const BERLIN_HOSTS = new Set(["berlin.de", "www.berlin.de"]);
// Einzige zusaetzliche Abrufoption: `crawler.fetchUrl` liefert bei `true` den beobachteten
// HTTP-Status mit. Ohne das Flag ist die Antwortform unveraendert.
const MELDE_STATUS = true;

function fordere(ok, grund) { if (!ok) throw new Error("berlin-presseartikel-abruf-" + grund); }
function fehlerGrund(error) {
  const nachricht = String((error && error.message) || "");
  return /^[a-z0-9-]{1,100}$/.test(nachricht) && nachricht.startsWith("berlin-presseartikel-abruf-")
    ? nachricht.slice("berlin-presseartikel-abruf-".length) : null;
}

// Strikt vorab gepruefte amtliche Abrufadresse. Rueckgabe: { url, host } oder null.
// Nur die exakte amtliche Form zaehlt; die www-Fassung ist die einzige zulaessige Alternative
// (der amtliche Leser akzeptiert beide). Alles andere — http, fremder Host, Port, Benutzerinfo,
// Hash, Trailing-Slash, Tracking, anderer Pfad — wird abgewiesen, BEVOR irgendetwas abgerufen wird.
function pruefeAbrufziel(url) {
  if (typeof url !== "string" || url.length === 0 || url !== url.trim()) return null;
  let geparst;
  try { geparst = new URL(url); } catch { return null; }
  if (geparst.protocol !== "https:" || geparst.username !== "" || geparst.password !== ""
    || geparst.port !== "" || geparst.hash !== "") return null;
  const hostname = geparst.hostname.toLowerCase();
  if (!BERLIN_HOSTS.has(hostname)) return null;
  // Amtliche Pressearchiv-Form ueber den bestehenden, kanonischen Vertrag belegen.
  let kanonisch;
  try { kanonisch = require("./berlin-artikelstand").kanonischeArtikelUrl(url); } catch { return null; }
  if (!kanonisch) return null;
  // Nur die www-Variante derselben kanonischen Form ist zulaessig; sonst muesste die Adresse
  // bereits die Normalform sein (keine Abweichung durch Tracking/Slash/Gross-/Kleinschreibung).
  if (url !== kanonisch && url !== kanonisch.replace("https://", "https://www.")) return null;
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

async function ladePresseartikelStand(doc, deps = {}) {
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
  // Statusunterstuetzung), bleibt er undefined und pruefePresseartikel bricht fail closed ab.
  const eingabe = {
    url: ziel.url,
    finalUrl: antwort && antwort.finalUrl,
    http: antwort && antwort.status,
    html: antwort && antwort.body
  };
  return require("./berlin-artikelstand").standAusOriginal(doc, eingabe);
}

module.exports = { VERSION, MELDE_STATUS, pruefeAbrufziel, ladePresseartikelStand };
