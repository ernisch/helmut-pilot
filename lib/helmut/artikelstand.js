"use strict";

// Helmut — zentrale, REIN LESENDE Weiterleitung fuer geschlossene Quellen-Artikelstaende.
// =============================================================================================
// Mehrere amtliche Quellenwege tragen einen eigenen, unveraenderlichen Artikelstand
// (eigener Namespace, eigene Kennung, tagesgenauer Zeitvertrag):
//   * Bundestag  — raw.helmutBundestagArtikelstand (Bundestags-Textarchiv-Leitabsatz)
//   * Berlin     — raw.helmutBerlinArtikelstand   (Berlin.de-Presseartikel: Pressearchiv ODER
//                  die beiden Senatspfadfamilien; Herkunft und Identitaet bleiben getrennt)
//
// Die vorhandenen Leser (dedup, dedup-global, quellen-auszug, quellen-zeitvertrag,
// lage-quellenbeleg, storage) brauchen nur eine Frage: "Traegt diese Zeile einen
// gepruefte Artikelstand — und wenn ja, welchen?" Diese Datei beantwortet sie an EINER
// kanonischen Stelle. Sie ist bewusst rein lesend und aendert keine Schwelle, keinen
// Namespace und keine Schutzregel.
//
// Fail closed: Die einzelnen Stand-Module validieren ihre Metadaten selbst und werfen bei
// ungueltigen oder widerspruechlichen Angaben. Diese Weiterleitung faengt das NICHT ab und
// faellt niemals still auf die URL-Identitaet zurueck. Eine Zeile mit zwei verschiedenen
// Staenden ist widerspruechlich und wird laut abgewiesen.

const STAENDE = Object.freeze([
  Object.freeze({
    name: "bundestag",
    rohFeld: "helmutBundestagArtikelstand",
    abgerufenFeld: "bundestag_abgerufen_at",
    modulPfad: "./bundestag-artikelstand",
    identitaet: stand => `bundestag-textarchiv|${stand.standHash}|leitabsatz`
  }),
  Object.freeze({
    name: "berlin",
    rohFeld: "helmutBerlinArtikelstand",
    abgerufenFeld: "berlin_abgerufen_at",
    modulPfad: "./berlin-artikelstand",
    // Feld und Kennungswahrheit teilen sich beide belegten Berliner Standvertraege, NIE
    // aber die Identitaet: Pressearchiv = gebundener ERSTER Absatz, die beiden
    // Senatspfadfamilien = gebundener SACHABSATZ. Die alte Identitaet bleibt exakt gleich.
    identitaet: stand => require("./berlin-artikelstand").HERKUNFT_SONDER === stand.herkunft
      ? `berlin-senatsvorlage|${stand.standHash}|sachabsatz`
      : `berlin-presse|${stand.standHash}|erster-absatz`
  })
]);

const cache = new Map();
function standModul(eintrag) {
  if (!cache.has(eintrag.modulPfad)) cache.set(eintrag.modulPfad, require(eintrag.modulPfad));
  return cache.get(eintrag.modulPfad);
}

// Rueckgabe: null (kein Stand) oder { stand, standModul, name, rohFeld, abgerufenFeld, identitaet }.
// Zwei verschiedene Staende an derselben Zeile sind widerspruechlich und brechen ab.
function leseStand(item) {
  const treffer = [];
  for (const eintrag of STAENDE) {
    const stand = standModul(eintrag).leseArtikelstand(item);
    if (stand) treffer.push({ stand, standModul: standModul(eintrag), name: eintrag.name,
      rohFeld: eintrag.rohFeld, abgerufenFeld: eintrag.abgerufenFeld, identitaet: eintrag.identitaet });
  }
  if (treffer.length > 1) throw new Error("artikelstand-mehrdeutig");
  return treffer[0] || null;
}

module.exports = { STAENDE, leseStand };
