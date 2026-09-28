"use strict";

// Helmut — kleinster, geschlossener Einzelabruf der EINEN amtlichen Berliner
// Presseportal-Seite des Senats.
// =============================================================================================
// BELEGTER ANLASS (lokale Vorbereitung der Landesversorgung Berlin, Roadmap-Schritt vor dem
// 500er Starttor, 28.09.2026): Der strenge Entdecker
// (lib/helmut/berlin-senat-entdeckung.js) prueft den amtlichen Senatsblock des Presseportals
// rein lokal aus genau vier beobachteten Feldern {url, finalUrl, http, html}; die zwei
// Artikel-Einzelabrufe (berlin-presseartikel-abruf.js, berlin-presse-sondervorlagen-abruf.js)
// sind fertig. Es fehlte genau EIN enger echter HTTP-Abruf, der dem Entdecker die tatsaechlich
// beobachteten Werte der FESTEN Portalseite zufuehrt.
//
// Vertrag (ladePortalFundstellen(doc, deps)):
//   Eingang: doc mit GENAU der festen amtlichen Portaladresse https://www.berlin.de/presse/
//            (amtliche Fassung ohne www zulaessig). Dies ist KEINE allgemeine URL-Erlaubnis:
//            jede andere Berlin.de-Adresse wird VOR jedem Abruf abgewiesen.
//   Abruf:   ueber die BESTEHENDE Anbietersteuerung `crawler.fetchUrl` mit Hostbindung
//            (deps.allowedHost = "berlin.de") und ausdruecklichem Statuswunsch
//            (deps.meldeStatus = true).
//   Ergebnis:{ ok:true, quelle, fundstellen } — genau der eingefrorene, minimierte Ausgang aus
//            pruefeSenatsblock; die beobachteten Werte {url, finalUrl, http, html} gehen
//            UNVERAENDERT an pruefeSenatsblock. KEIN HTML, KEIN Rohdokument, keine Fundstelle mit
//            Listenuhrzeit. Fehler: { ok:false, reason }.
//
// Fail closed:
//   - Nur die feste amtliche HTTPS-Form der Portalseite auf berlin.de/www.berlin.de, exakt der
//     Pfad /presse/, ohne Benutzerinfo, Port, Query/Tracking, Fragment oder Trailing-Drift.
//   - Die Adresse wird VOR jedem Abruf geprueft; ein fremder Host, Pfad oder eine fremde
//     Berlin.de-Seite wird nie angefragt.
//   - Der Abruf folgt KEINEM Hostwechsel (die bestehende `allowedHost`-Sperre bricht vor jedem
//     Redirect auf einen fremden Host ab).
//   - Nur der tatsaechlich beobachtete 200 zaehlt; finalUrl und HTML kommen unveraendert aus der
//     Antwort und werden ausschliesslich durch pruefeSenatsblock bewertet.
//   - Die Listenuhrzeit ("13:05 Uhr") ist keine belegte Publikationszeit und erscheint nirgends.
//
// KEIN Live-Crawl-Hook, kein Crawl-Anschluss, KEINE Quelle wird hier freigeschaltet, keine
// Source-Mode-/Flag-/Cron-/DB-/Profil-/Productionwirkung. Dieses Modul wird von nichts anderem
// automatisch aufgerufen; es ist ein ausdruecklicher, einzeln aufzurufender Einzelabruf.

const VERSION = "berlin-portal-einzelabruf-v1";
const BERLIN_HOSTS = new Set(["berlin.de", "www.berlin.de"]);
// Die EINE feste amtliche Portalseite. Die Fassung ohne www ist die einzige zulaessige
// Schreibalternative derselben Adresse (beide akzeptiert der bestehende Entdecker).
const PORTAL_URL = "https://www.berlin.de/presse/";
const PORTAL_QUELLEN = new Set([PORTAL_URL, "https://berlin.de/presse/"]);
// Einzige zusaetzliche Abrufoption: `crawler.fetchUrl` liefert bei `true` den beobachteten
// HTTP-Status mit. Ohne das Flag ist die Antwortform unveraendert.
const MELDE_STATUS = true;
const PORTAL_PFAD = "/presse/";

function fordere(ok, grund) { if (!ok) throw new Error("berlin-portal-einzelabruf-" + grund); }
function fehlerGrund(error) {
  const nachricht = String((error && error.message) || "");
  const praefix = "berlin-portal-einzelabruf-";
  return nachricht.startsWith(praefix) && /^[a-z0-9-]{1,120}$/.test(nachricht.slice(praefix.length))
    ? nachricht.slice(praefix.length) : null;
}

// Strikt vorab gepruefte feste Abrufadresse. Rueckgabe: { url, host } oder null.
// Nur die exakte feste Portalseite zaehlt; alles andere — http, fremder Host, Port, Benutzerinfo,
// Query/Tracking, Fragment, anderer Pfad oder jedes andere berlin.de-Ziel — wird abgewiesen,
// BEVOR irgendetwas abgerufen wird.
function pruefeAbrufziel(url) {
  if (typeof url !== "string" || url.length === 0 || url !== url.trim()) return null;
  if (!PORTAL_QUELLEN.has(url)) return null;
  let geparst;
  try { geparst = new URL(url); } catch { return null; }
  if (geparst.protocol !== "https:" || geparst.username !== "" || geparst.password !== ""
    || geparst.port !== "" || geparst.search !== "" || geparst.hash !== "") return null;
  if (geparst.href !== url) return null;
  const hostname = geparst.hostname.toLowerCase();
  if (!BERLIN_HOSTS.has(hostname)) return null;
  if (geparst.pathname !== PORTAL_PFAD) return null;
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

// Der Grund eines abgelehnten Lesedurchlaufs (pruefeSenatsblock wirft fail closed).
function entdeckerGrund(error) {
  const nachricht = String((error && error.message) || "");
  const praefix = "berlin-senat-entdeckung-";
  return nachricht.startsWith(praefix) && /^[a-z0-9-]{1,120}$/.test(nachricht.slice(praefix.length))
    ? nachricht.slice(praefix.length) : null;
}

async function ladePortalFundstellen(doc, deps = {}) {
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
  // Statusunterstuetzung), bleibt er undefined und der Entdecker bricht fail closed ab.
  const eingabe = {
    url: ziel.url,
    finalUrl: antwort && antwort.finalUrl,
    http: antwort && antwort.status,
    html: antwort && antwort.body
  };
  try {
    const ergebnis = require("./berlin-senat-entdeckung").pruefeSenatsblock(eingabe);
    return Object.freeze({ ok: true, quelle: ergebnis.quelle, fundstellen: ergebnis.fundstellen });
  } catch (error) {
    return { ok: false, reason: entdeckerGrund(error) || "fundstellen-ungueltig" };
  }
}

module.exports = { VERSION, MELDE_STATUS, PORTAL_URL, pruefeAbrufziel, ladePortalFundstellen };
