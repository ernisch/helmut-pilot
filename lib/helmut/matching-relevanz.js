"use strict";

// Sprint M-8 — Relevanzriegel fuer Matching-Ergebnisse. DEFAULT AUS.
//
// BEFUND M-8: `match_knowledge_objects` liefert die Top-N UNBEDINGT — kein
// Mindestwert, keine relative Schwelle, kein nachgelagerter Filter. Es werden
// je Mandant immer genau 20 Zeilen erzeugt, auch wenn nur drei davon einen
// fachlichen Bezug zum Mandat haben. Der Rest ist Auffuellung.
//
// WARUM HIER KEIN SCHWELLENWERT STEHT (Messung 2026-07-29, Production, rein
// lesend — `scripts/matching-schwellenwert-analyse.js`):
//
//   * Das gesamte heutige Top-20 aller sechs gepflegten Mandanten liegt in
//     [0,2211 … 0,4319]. Eine absolute Schwelle bis 0,20 entfernt NICHTS;
//     ab 0,22 entfernt sie belegte, gute Treffer (ein Mandant verliert bei
//     0,25 zehn von zwanzig).
//   * Die Aehnlichkeit trennt belegbare von unbelegbaren Treffern NICHT: bei
//     einem Mandanten liegen die beiden unbelegbaren Treffer bei 0,2487 und
//     0,2741 — ueber dem Median (0,2617) seiner achtzehn belegten Treffer.
//   * Zwei Platzhalterprofile (ohne Partei, Ausschuss und Schwerpunkt)
//     erzeugen ein BYTE-IDENTISCHES, vollstaendig unbelegbares Top-20 im Band
//     0,1768…0,3162 — also mitten im Band der echten Mandate. Ein globaler
//     Schwellenwert liesse dieses Rauschen durch und schnitte zugleich
//     Substanz weg. Er behandelt duenne und gepflegte Profile damit genau
//     falsch herum.
//
// DIE REGEL IST DESHALB KEINE ZAHL, SONDERN DIE BELEGPFLICHT:
// veroeffentlicht wird nur, was dem Mandat gegenueber BEGRUENDBAR ist —
// also eine Ueberschneidung in Partei, Ausschuss, Wahlkreis oder Schwerpunkt
// traegt (`matched_features`). Genau daraus entsteht die sichtbare Erklaerung
// (`matching-begruendung.js`): ein Treffer ohne Merkmal kann dem Nutzer
// konstruktionsbedingt keinen Grund nennen. Die Regel ist damit dieselbe wie
// START_HERE.md §5.2 und CLAUDE.md §4.3 — lieber eine kurze belegte Lage als
// eine aufgefuellte.
//
// KEINE KUENSTLICHE AUFFUELLUNG: Es gibt bewusst KEINE Mindestmenge. Bleiben
// drei Treffer uebrig, werden drei veroeffentlicht. Bleibt keiner uebrig,
// wird keiner veroeffentlicht — die Lage zeigt dann ihren ehrlichen
// Leerzustand statt zwanzig beliebiger Vorgaenge.
//
// WAS DIESES MODUL NICHT TUT: Es berechnet nichts neu. Aehnlichkeiten, Raenge,
// Reihenfolge, Ergebniskennungen und `matched_features` entstehen unveraendert
// im Schreibpfad; dieses Modul waehlt aus der bereits fertigen Liste aus und
// laesst jedes uebrig bleibende Feld unangetastet — insbesondere wird `rank`
// NICHT neu vergeben: der Rang bleibt die Position in der Kandidatenliste.
//
// REIN OFFLINE: 0 KI, 0 Netz, 0 Datenbank, 0 Zufall, keine Migration.

const FLAG = "HELMUT_MATCHING_RELEVANZ_GATE";

function isFlagOn(value) {
  return ["1", "true", "on", "yes"].includes(String(value || "").trim().toLowerCase());
}

// DEFAULT AUS. Aus = exakt das bisherige Verhalten (Top-N unbedingt).
function relevanzGateAktiv(env = process.env) {
  return isFlagOn(env && env[FLAG]);
}

// Traegt die Zeile einen Beleg, der dem Nutzer als Grund gezeigt werden kann?
//
// Bewusst genau dieselbe Quelle, aus der `matching-begruendung.js` den Satz
// baut: `matched_features`. Damit koennen Riegel und Anzeige nicht
// auseinanderlaufen — was veroeffentlicht wird, ist erklaerbar, und was
// erklaerbar ist, wird veroeffentlicht.
function hatBelegtenBezug(row) {
  return Boolean(row && Array.isArray(row.matched_features) && row.matched_features.length > 0);
}

// Der Riegel. Reine Funktion: gleiche Eingabe -> gleiche Ausgabe, keine
// Sortierung, keine Umnummerierung, keine Mutation der Eingabezeilen.
//
// Rueckgabe:
//   zeilen     — die veroeffentlichungsfaehigen Zeilen in unveraenderter
//                Reihenfolge (identische Objektreferenzen)
//   kandidaten — wie viele Treffer hereinkamen
//   verworfen  — wie viele ohne Beleg blieben (fuer das Auditprotokoll und die
//                ehrliche Betriebsmeldung; kein falsches Grün)
function wendeRelevanzGateAn(rows = [], opts = {}) {
  const liste = Array.isArray(rows) ? rows : [];
  const aktiv = opts.aktiv === true;
  if (!aktiv) return { zeilen: liste, kandidaten: liste.length, verworfen: 0, aktiv: false };
  const zeilen = liste.filter(hatBelegtenBezug);
  return { zeilen, kandidaten: liste.length, verworfen: liste.length - zeilen.length, aktiv: true };
}

module.exports = {
  FLAG,
  relevanzGateAktiv,
  hatBelegtenBezug,
  wendeRelevanzGateAn
};
