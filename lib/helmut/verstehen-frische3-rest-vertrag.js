"use strict";
// Rest3: genau die drei noch offenen Quellen des gestoppten Fuenferlaufs
// `verstehen5-36277841330`. Kein neuer Rohdatenimport — die bestehende
// Fuenfer-Eingabe `quellen-frische5-20260926-a` bleibt unveraendert. Der alte
// unknown-Vorgang (`vg-bundesaußenminister-…`) wird nie freigegeben.
const crypto = require("node:crypto");
const A = require("./artikelkontext");
const F30 = require("./verstehen-frische30-vertrag");
const F5 = require("./verstehen-frische5-vertrag");
const hash = s => crypto.createHash("sha256").update(s).digest("hex");

// Kanonische Hashform eines historischen Belegs: rekursiv nach Schluesseln
// sortiert, ohne Zeitnormalisierung — exakt die Form, in der die beiden Belege
// (Fuenfer-Quittung und Quarantaenearchiv) gesichert und nachgeprueft werden.
// Nur DIESE eine Form, keine zweite Deutung; kein gespeicherter Wert wird geaendert.
function kanonischerHash(wert) {
  const sortiert = w => Array.isArray(w) ? w.map(sortiert)
    : (w && typeof w === "object")
      ? Object.fromEntries(Object.keys(w).sort().map(k => [k, sortiert(w[k])]))
      : w;
  return hash(JSON.stringify(sortiert(wert)));
}

// Der historische Codebeleg des verwendeten Artikelkontexts — bewusst GETRENNT
// vom TATSAECHLICH ausgefuehrten Runtime-Commit (der Bedienweg bindet den Runtime-
// Commit an den echten Checkout, siehe `scripts/verstehen-frische3-rest.js`).
const FRISCHE3_REST = Object.freeze({
  commit: F5.FRISCHE5.commit,
  dokumente: 3,
  idHash: "ba00708446fe2a059f52f9068dad796886e477864952452024408d0b8e6ff27f",
  cluster: 3, clusterGroessen: Object.freeze({ 1: 3 }),
  maxModellaufrufe: 3, maxUsd: 0.25, maxMs: 7 * 60000
});
// Eigene, neue Quittung. Die Fuenfer-Quittung selbst bleibt unveraendert und
// verbraucht; dieser Auftrag schreibt unter KEINER alten Kennung.
const QUITTUNG = "verstehen-frische3-rest-20260926-a";
const EINGABE = F5.EINGABE;
const VORGAENGER_QUITTUNG = F5.QUITTUNG;
const VORGAENGER_RUN = "verstehen5-36277841330";
// Der alte, durch die Fehlbindung beruehrte Vorgang bleibt gesperrt. Nie freigeben.
const VORGANG = "vg-bundesaußenminister-20260916-ddcd4d";
const ALT_KO_ID = "ko-vg-bundesaußenminister-20260916-ddcd4d";
// Exakt die drei noch offenen Restkennungen (alphabetisch sortiert).
const IDS = Object.freeze([
  "rd-130b01fbfafa7befb99cee5726ad519535ab4732d0364508855d7d80117cb6fd",
  "rd-c7a4f76593c1bc1e2ad06282d84cf9f9938647ece79fb798b9e26306a08abac0",
  "rd-f6626eeb6eb85d5473ca1c7087bfdb9eca0804a688cc5ff8d5f0076047464bf1"
]);
// Die zwei Fuenferquellen, die der gestoppte Lauf bereits gespeichert/aktualisiert
// hat — sie gehoeren NICHT in diesen Restauftrag.
const AUSGESCHLOSSEN = Object.freeze([
  "rd-c5a6091bacb5eac160cae5d1bd16e8b7892ec407fda84978d1b2187e1b06a5b8",
  "rd-e5928421844a05ceb26be008e7fd6915922e5a10a4a9af0513df646379e17e73"
]);
const INHALT_HASH = "ed40733c536a108475a878aa6018f0fa084d38c2d2671244bc23265853106e58";
const BELEGE_HASH = "fbcee1518221ecc970d2c49dfa45111e5fab629c82c89ed6338c5c7f7a0a0ff5";
// Vollstaendige kanonische Hashes der beiden historischen Belege (Root-Beleg).
const F5_QUITTUNG_HASH = "1d3476b6b13b0d1007f204d468d3a59fa2b0253f69ce332d43048cc840f793df";
const ARCHIV_HASH = "72212ee5264065b947e48a8c325f30aad828e38dffa2eb77bafc471d8f69df54";
// Archivierte alte Wirkung: KO und CAS unveraendert erwartet, Vormerkung fehlt.
const ARCHIV_KO_HASH = "e8dece6863df6235b6228a4c51bac1872b620611a3646bb7ee6bbf9de845c179";
const ARCHIV_CAS_HASH = "c6abed0673de0ef84d5b610c6bc2fb26676b2595d587cbf86d03bd2f406ccd5f";
const ARCHIV_VORMERKUNG_HASH = "fe22c3e83c759316533086b003b663d2fad9de84621922fc58e2bc72a4e0917f";
const SPEICHERZEIT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const versorgungen = new WeakSet();

// Bestandsdokumente tragen ihre kanonischen Speicherzeitpunkte. Nur die
// BESTEHENDE Fuenferbindung wird verwendet; kein Datum wird neu erfunden.
function kanonischeSpeicherzeiten(doc) {
  const out = { ...doc };
  for (const feld of ["published_at", "retrieved_at"]) {
    const wert = doc[feld];
    if (typeof wert !== "string" || !SPEICHERZEIT.test(wert)
      || /\.\d{3}\d*[1-9]\d*(?:Z|[+-]\d{2}:\d{2})$/.test(wert)
      || !Number.isFinite(Date.parse(wert))) throw new Error("frische3-rest-speicherzeit-ungueltig");
    out[feld] = new Date(wert).toISOString();
  }
  return out;
}

// Genau die drei Restquellen aus der VOLL validierten Fuenfer-Eingabe: gleiche
// Kennungen, gleicher Inhalt, gleiche Belege. Nichts wird neu geladen.
function pruefeInhalt(docs, now = Date.now()) {
  try {
    return Array.isArray(docs) && docs.length === 3 && F30.inhaltsHash(docs) === INHALT_HASH
      && docs.every(d => IDS.includes(d && d.id))
      && docs.every(d => [d.published_at, d.retrieved_at]
        .every(t => Date.parse(t) <= now && Date.parse(t) >= now - 48 * 3600000));
  } catch { return false; }
}

function ausGesichertenBelegen(f5Docs, f5Belege, now = Date.now()) {
  // 1) ZUERST die vollstaendige Fuenfer-Eingabe pruefen (Inhalt, Belegbindung,
  //    Alter). Wirft sie, ist auch die Teilauswahl nichtig — es wird nichts
  //    ausgewaehlt, kein Modell aufgerufen und nichts gespeichert.
  F5.ausGesichertenBelegen(f5Docs, f5Belege, now);
  // 2) Dann exakt die drei Restkennungen auswaehlen und jeden Teilhash hart binden.
  const liste = IDS.map(id => (Array.isArray(f5Docs) ? f5Docs : []).find(d => d && d.id === id));
  if (liste.some(d => !d) || !pruefeInhalt(liste, now)) throw new Error("frische3-rest-eingabe-abweichend");
  const clean = (Array.isArray(f5Belege) ? f5Belege : []).filter(b => IDS.includes(b && b.dokumentId))
    .map(b => A.pruefeArtikelkontext(f5Docs.map(kanonischeSpeicherzeiten), b))
    .sort((a, b) => a.dokumentId.localeCompare(b.dokumentId));
  if (clean.length !== 3 || hash(JSON.stringify(clean)) !== BELEGE_HASH
    || new Set(clean.map(b => b.dokumentId)).size !== 3
    || clean.some(b => b.version !== 2 || b.gewinnung.verfahren !== "deutschlandfunk-artikel-leitabsatz-v1"
      || Date.parse(b.gelesenAm) > now)) throw new Error("frische3-rest-belege-abweichend");
  const frozenDocs = structuredClone(f5Docs), frozen = structuredClone(clean);
  const versorgung = async (selected) => {
    const docs = Array.isArray(selected) ? selected : [];
    // Kein fremdes Dokument: nur die drei gebundenen Restkennungen sind lieferbar.
    if (docs.some(d => !d || !IDS.includes(d.id))) {
      return { angefordert: true, ok: false, reason: "frische3-rest-fremdes-dokument" };
    }
    const matching = frozen.filter(b => docs.some(d => d.id === b.dokumentId));
    if (matching.length !== 1) return { angefordert: true, ok: false, reason: "frische3-rest-kontext-mehrdeutig-oder-fehlend" };
    const b = matching[0];
    try {
      if (!F5.pruefeInhalt(frozenDocs)) throw new Error("veraltet");
      if (F30.inhaltsHash(docs.filter(d => d.id === b.dokumentId))
        !== F30.inhaltsHash(frozenDocs.filter(d => d.id === b.dokumentId))) throw new Error("veraendert");
      return { angefordert: true, ok: true, beleg: F5.pruefeSpeicherbindung(docs, b) };
    } catch { return { angefordert: true, ok: false, reason: "frische3-rest-quellenstand-abweichend" }; }
  };
  versorgungen.add(versorgung);
  return versorgung;
}
const istVersorgung = fn => typeof fn === "function" && versorgungen.has(fn);

module.exports = {
  FRISCHE3_REST, QUITTUNG, EINGABE, VORGAENGER_QUITTUNG, VORGAENGER_RUN, VORGANG, ALT_KO_ID,
  IDS, AUSGESCHLOSSEN, INHALT_HASH, BELEGE_HASH,
  F5_QUITTUNG_HASH, ARCHIV_HASH, ARCHIV_KO_HASH, ARCHIV_CAS_HASH, ARCHIV_VORMERKUNG_HASH,
  kanonischerHash, pruefeInhalt, ausGesichertenBelegen, istVersorgung,
  pruefeSpeicherbindung: F5.pruefeSpeicherbindung
};
