"use strict";

// Helmut — kleinste, geschlossene lokale KOMPOSITIONSKETTE der amtlichen Berliner
// Senatsquellen bis zur minimierten Rohzeile (Landesversorgung Berlin, vor dem 500er Starttor).
// =============================================================================================
// BELEGTER ANLASS (28.09.2026): Die Einzelbausteine sind fertig und je einzeln offline/einmalig
// live geprueft:
//   * lib/helmut/berlin-portal-einzelabruf.js  — der EINE feste Portalseiten-Abruf,
//   * lib/helmut/berlin-senat-entdeckung.js    — der strenge Senatsblock mit abrufzielFuer,
//   * lib/helmut/berlin-presseartikel-abruf.js — Pressearchiv-Einzelabruf,
//   * lib/helmut/berlin-presse-sondervorlagen-abruf.js — Sondervorlagen-Einzelabruf,
//   * lib/helmut/berlin-artikelstand.js        — der minimierte Stand der Rohzeile.
// Es fehlte genau EINE getrennte, ausdruecklich lokale Komposition, die daraus die aktuelle
// Senatsversorgung als minimierte Rohzeilen bildet — ohne neue URL-Familie und ohne eigenen
// Netzweg.
//
// Vertrag (ladeSenatsquellenKette(doc, deps)):
//   Eingang: doc mit GENAU der festen amtlichen Portalseite https://www.berlin.de/presse/.
//            deps.fetchUrl ist injizierbar (Tests) und wird fuer die Portalseite UND die
//            Einzelabrufe verwendet; sonst die bestehende Anbietersteuerung `crawler.fetchUrl`.
//   Ablauf:  1) die feste Portalseite ueber den bestehenden Portaladapter laden,
//            2) genau einen geschlossenen Senatsblock mit 1..8 Fundstellen verlangen,
//            3) fuer JEDE Fundstelle weiterreichbar=true UND genau ein durch `abrufzielFuer`
//               bestaetigtes Ziel verlangen,
//            4) seriell pro Fundstelle den passenden bestehenden Einzelabruf aufrufen und den
//               exakten Titel und den reinen Publikationstag der Fundstelle erneut an das
//               Original binden; fuer Sondervorlagen den vorhandenen minimierten Stand erzeugen,
//            5) jede minimierte Rohzeile vor der Rueckgabe gegen die bestehenden Standvalidierer
//               pruefen.
//   Ergebnis: nur bei vollstaendigem Erfolg
//             { ok:true, quelle, kennungen:[rd-<Standhash>…], rows:[minimierte Rohzeile…] }.
//             KEIN HTML, KEIN Volltext, keine Uhrzeit — der reine Kalendertag steht im Stand,
//             `published_at` bleibt null. Bei EINEM Fehler: fail closed
//             { ok:false, reason, kennungen:null, rows:null } — keine Teilfreigabe.
//
// Fail closed:
//   - Die Portalseite wird ausschliesslich ueber den bestehenden Portaladapter geladen; jeder
//     Fehler dort (Adresse, Status, Hostwechsel, Entdecker) wird unveraendert weitergegeben.
//   - 0 Fundstellen, mehr als 8 Fundstellen, eine nicht weiterreichbare Fundstelle, ein
//     fehlendes/mehrdeutiges Ziel, ein Abruffehler oder ein Titel-/Tagesdrift brechen die GANZE
//     Kette ab. Es wird nie abgeschnitten, nie ein Teilergebnis freigegeben.
//   - Keine generische neue URL-Familie: das Ziel kommt ausschliesslich aus `abrufzielFuer`.
//   - Keine Personen-/Parteifilterung, kein erfundener Quellentext, kein Mandat. Weder Quelle
//     noch Herausgeber werden gesetzt: die minimierte Fundstelle traegt keine solchen Angaben.
//   - Keine Speicherung, kein Live-Crawl-Hook, keine Source-Mode-/Flag-/Cron-/DB-/Profilwirkung.
//     Dieses Modul wird von nichts anderem automatisch aufgerufen.

const VERSION = "berlin-senatsquellen-kette-v1";
// Hoechstens acht Fundstellen im geschlossenen Senatsblock. Mehr Fundstellen sind kein Grund
// zum Abschneiden, sondern brechen die ganze Kette fail closed ab.
const MAX_FUNDSTELLEN = 8;

function grundVon(error, praefix) {
  const nachricht = String((error && error.message) || "");
  return nachricht.startsWith(praefix) && /^[a-z0-9-]{1,120}$/.test(nachricht.slice(praefix.length))
    ? nachricht.slice(praefix.length) : null;
}

function fehler(reason) {
  return { ok: false, reason: /^[a-z0-9-]{1,120}$/.test(String(reason)) ? String(reason) : "kette-fehlgeschlagen",
    kennungen: null, rows: null };
}

// Das EINE sichere Abrufziel einer Fundstelle. Genau eine der beiden belegten Adressfamilien
// darf passen: `abrufzielFuer` nennt sie, die jeweils andere Familie muss dieselbe Adresse
// abweisen. Sonst ist das Ziel mehrdeutig oder fehlt — fail closed.
function abrufzielGenau(url) {
  const { abrufzielFuer } = require("./berlin-senat-entdeckung");
  const { pruefeAbrufziel } = require("./berlin-presseartikel-abruf");
  const { pruefeAbrufziel: pruefeSonder } = require("./berlin-presse-sondervorlagen-abruf");
  const ziel = abrufzielFuer(url);
  if (!ziel || !ziel.ziel || ziel.ziel.url !== url) return null;
  if (ziel.art === "pressearchiv") {
    if (pruefeAbrufziel(url) === null || pruefeSonder(url) !== null) return null;
  } else if (ziel.art === "sondervorlage") {
    if (pruefeSonder(url) === null || pruefeAbrufziel(url) !== null) return null;
  } else {
    return null;
  }
  return ziel;
}

// Nur die belegten Felder der minimierten Portal-Fundstelle. Titel und reiner Kalendertag werden
// erneut an das Original gebunden (der bestehende Standvertrag verlangt exakte Gleichheit). Kein
// Quellen-/Herausgebername, kein Mandat, kein erfundener Text.
function quelleDoc(fundstelle) {
  return { url: fundstelle.url, canonical_url: fundstelle.url, title: fundstelle.titel,
    published_at: fundstelle.publikationstag, retrieved_at: null, summary: "" };
}

// Der minimierte Stand wird VOR der Rueckgabe erneut gegen die bestehenden Standvalidierer
// geprueft. Nur die Rohzeile verlaesst die Kette — kein HTML, kein Volltext, keine Uhrzeit.
function pruefeRohzeile(ergebnis) {
  try {
    const B = require("./berlin-artikelstand");
    const stand = B.pruefeArtikelstand(ergebnis && ergebnis.stand);
    const row = ergebnis && ergebnis.row;
    if (!row || typeof row !== "object" || Array.isArray(row)) return { ok: false, reason: "rohzeile-ungueltig" };
    if (row.id !== "rd-" + stand.standHash || row.content_hash !== stand.standHash) {
      return { ok: false, reason: "kennung-abweichend" };
    }
    if (row.published_at !== null || (row.publishedAt != null)) return { ok: false, reason: "uhrzeit-widerspruch" };
    if (Object.hasOwn(row, "volltext") || Object.hasOwn(row, "html") || Object.hasOwn(row, "rohtext")) {
      return { ok: false, reason: "rohtext-im-ergebnis" };
    }
    if (B.leseArtikelstand(row)?.standHash !== stand.standHash) {
      return { ok: false, reason: "rohzeile-stand-abweichend" };
    }
    return { ok: true, row };
  } catch (error) {
    return { ok: false, reason: grundVon(error, "berlin-artikelstand-") || "stand-ungueltig" };
  }
}

// Seriell: genau der passende bestehende Einzelabruf. Der Ergebnisbeleg wird unveraendert an den
// bestehenden Standvertrag gebunden; nur die fertige minimierte Rohzeile kommt zurueck.
async function ladeFundstelle(fundstelle, ziel, deps) {
  const doc = quelleDoc(fundstelle);
  if (ziel.art === "pressearchiv") {
    const abruf = await require("./berlin-presseartikel-abruf").ladePresseartikelStand(doc, deps);
    if (!abruf || abruf.ok !== true) return { ok: false, reason: (abruf && abruf.reason) || "abruf-fehlgeschlagen" };
    return pruefeRohzeile(abruf);
  }
  const abruf = await require("./berlin-presse-sondervorlagen-abruf").ladeSondervorlage(doc, deps);
  if (!abruf || abruf.ok !== true) return { ok: false, reason: (abruf && abruf.reason) || "abruf-fehlgeschlagen" };
  const stand = require("./berlin-artikelstand").erzeugeSondervorlagenstand(doc, abruf.vorlage);
  if (!stand || stand.ok !== true) return { ok: false, reason: (stand && stand.reason) || "vorlage-ungueltig" };
  return pruefeRohzeile(stand);
}

function tiefKuehl(wert) {
  if (wert && typeof wert === "object" && !Object.isFrozen(wert)) {
    Object.freeze(wert);
    for (const schluessel of Object.keys(wert)) tiefKuehl(wert[schluessel]);
  }
  return wert;
}

async function ladeSenatsquellenKette(doc, deps = {}) {
  const portal = await require("./berlin-portal-einzelabruf").ladePortalFundstellen(doc, deps);
  if (!portal || portal.ok !== true) return fehler((portal && portal.reason) || "portal-fehlgeschlagen");

  const fundstellen = portal.fundstellen;
  if (!Array.isArray(fundstellen) || fundstellen.length === 0) return fehler("keine-fundstelle");
  if (fundstellen.length > MAX_FUNDSTELLEN) return fehler("zu-viele-fundstellen");

  try {
    const rows = [];
    for (const fundstelle of fundstellen) {
      if (!fundstelle || fundstelle.weiterreichbar !== true) return fehler("fundstelle-nicht-weiterreichbar");
      const ziel = abrufzielGenau(fundstelle.url);
      if (!ziel) return fehler("abrufziel-mehrdeutig-oder-fehlend");
      const ergebnis = await ladeFundstelle(fundstelle, ziel, deps);
      if (!ergebnis || ergebnis.ok !== true) return fehler((ergebnis && ergebnis.reason) || "abruf-fehlgeschlagen");
      rows.push(ergebnis.row);
    }
    const eingefroren = Object.freeze(rows.map(row => tiefKuehl(row)));
    const kennungen = Object.freeze(eingefroren.map(row => row.id));
    return Object.freeze({ ok: true, quelle: portal.quelle, kennungen, rows: eingefroren });
  } catch (error) {
    return fehler(grundVon(error, "berlin-artikelstand-")
      || grundVon(error, "berlin-senatsquellen-kette-") || "kette-fehlgeschlagen");
  }
}

module.exports = { VERSION, MAX_FUNDSTELLEN, ladeSenatsquellenKette };
