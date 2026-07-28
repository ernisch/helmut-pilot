"use strict";

// Sprint 23B-1 — belegte Signale und deterministische Kurzbegruendung.
//
// REIN OFFLINE: 0 KI, 0 Netz, 0 Datenbank, 0 Zufall. Gleiche Eingabe ergibt
// immer exakt denselben Satz.
//
// BELEGPFLICHT (START_HERE.md §5.2, CLAUDE.md §4.3): Es wird ausschliesslich
// genannt, was im Matching tatsaechlich als Treffer belegt ist. Ohne Beleg gibt
// es KEINEN Satz — keine Ersatzformulierung, keine erfundene Verbindung,
// keine Ausweichfloskel. `null` ist die ehrliche Antwort und entspricht der
// Produktregel „lieber ein ehrlicher Leerzustand als eine erfundene Lage".
//
// KEINE ZAHLEN: Der Nutzer sieht nie einen Score, nie einen Rang, nie ein
// Prozent und nie die Woerter „Aehnlichkeit", „Vektor", „Matching" oder
// „Score". Der Satz nennt politische Gruende, nicht Mathematik.
//
// SICHTBARKEIT: In Sprint 23B-1 wird die Begruendung NUR GESPEICHERT. Die
// sichtbare Ausspielung an der Vorgangskarte ist Sprint 23C.

// Prioritaet der Gruende. Die ersten zwei vorhandenen gewinnen.
//
// Partei steht bewusst ZULETZT: sie stellt heute 55 von 79 Merkmalstreffern
// (Sprint 23A §5.3) und wuerde die Begruendung sonst dominieren, ohne etwas
// Entscheidungsrelevantes zu sagen. Ein Ausschuss- oder Fachbezug ist fuer ein
// Mandat immer die staerkere Aussage. Ist Partei der EINZIGE Beleg, wird sie
// genannt — sie ist dann der einzige vorhandene Grund.
const PRIORITAET = Object.freeze(["ausschuss", "thema", "wahlkreis", "partei"]);

// Feste Satzbausteine je Signalart. Keine Varianten, keine Synonyme —
// identische Signale muessen identische Formulierungen erzeugen.
const BAUSTEIN = Object.freeze({
  ausschuss: (v) => `deinen Ausschuss ${v}`,
  thema: (v) => `deinen Schwerpunkt ${v}`,
  wahlkreis: (v) => `deinen Wahlkreis ${v}`,
  partei: (v) => `deine Partei ${v}`
});

const MAX_GRUENDE = 2;
const MAX_LABEL = 80;

function bereinige(value) {
  const s = String(value == null ? "" : value)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.;:,]+$/, "")
    .trim();
  return s.slice(0, MAX_LABEL).trim();
}

// Belegte Signale aus den tatsaechlich berechneten Merkmalstreffern.
//
// EHRLICH GENAU DAS, WAS EXISTIERT: `legacy_vektor` ist der real berechnete
// Aehnlichkeitswert; die Merkmalslisten sind die real getroffenen Labels.
// Es entstehen KEINE fachlichen, geografischen oder institutionellen
// Teilscores — die berechnet das Rezept legacy_relevance_v1 nicht
// (Sprint 23A §4.4). Eine Signalart ohne Treffer taucht gar nicht erst auf,
// statt als leeres Feld „vorhanden aber null" zu suggerieren.
function buildSignals(matchedFeatures = [], similarity = null) {
  const out = {};
  const sim = Number(similarity);
  if (Number.isFinite(sim)) out.legacy_vektor = sim;

  const gesehen = new Map();
  for (const f of Array.isArray(matchedFeatures) ? matchedFeatures : []) {
    if (!f || !f.type) continue;
    const art = String(f.type);
    const wert = bereinige(f.value);
    if (!wert) continue;
    if (!gesehen.has(art)) gesehen.set(art, new Set());
    gesehen.get(art).add(wert);
  }
  for (const art of [...gesehen.keys()].sort()) {
    const werte = [...gesehen.get(art)];
    if (werte.length) out[art] = werte;
  }
  return out;
}

// Gruende in Prioritaetsreihenfolge einsammeln — aus `signale` (bevorzugt,
// weil bereits normalisiert) oder ersatzweise direkt aus matched_features.
function sammleGruende(signale = {}, matchedFeatures = []) {
  const quelle = signale && typeof signale === "object" && !Array.isArray(signale)
    ? signale
    : {};
  const ausFeatures = buildSignals(matchedFeatures, null);
  const gruende = [];
  for (const art of PRIORITAET) {
    const werte = Array.isArray(quelle[art]) && quelle[art].length
      ? quelle[art]
      : (Array.isArray(ausFeatures[art]) ? ausFeatures[art] : []);
    const wert = bereinige(werte[0]);
    if (wert) gruende.push({ art, wert });
  }
  return gruende;
}

// Deterministische Kurzbegruendung.
//
// Rueckgabe: ein Satz mit hoechstens zwei Gruenden — oder `null`, wenn kein
// Signal belegt ist. Es wird NIE ein Grund genannt, der nicht als Treffer
// vorliegt, und NIE ein Zusammenhang konstruiert.
//
// Beispiel:
//   Betrifft deinen Ausschuss Arbeit und Soziales und deinen Schwerpunkt Rente.
function begruendungAusSignalen(signale = {}, matchedFeatures = []) {
  const gruende = sammleGruende(signale, matchedFeatures).slice(0, MAX_GRUENDE);
  if (!gruende.length) return null;
  const teile = gruende.map((g) => BAUSTEIN[g.art](g.wert));
  return `Betrifft ${teile.join(" und ")}.`;
}

module.exports = {
  PRIORITAET,
  MAX_GRUENDE,
  MAX_LABEL,
  buildSignals,
  begruendungAusSignalen
};
