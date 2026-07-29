"use strict";

// Sprint 23C — sichtbare Antwort auf „Warum ist dieser Vorgang fuer mich relevant?"
//
// Diese Datei ist die EINZIGE Stelle, die aus einer gespeicherten
// `matching_results`-Zeile eine fuer Menschen bestimmte Erklaerung macht.
//
// SIE RECHNET NICHTS NEU. Sie liest ausschliesslich, was Sprint 23B-1 bereits
// deterministisch persistiert hat (`begruendung`, `signale`) bzw. was der
// Legacy-Pfad seit jeher speichert (`matched_features`). Kein KI-Aufruf, keine
// Datenbankabfrage, kein Netz, kein Zufall, kein Score wird veraendert.
//
// BELEGPFLICHT (START_HERE.md §5.2, CLAUDE.md §4.3): Ohne mindestens EINEN
// belegten Grund gibt es KEINE Erklaerung — `null`, und die Oberflaeche blendet
// den Abschnitt vollstaendig aus. Es gibt bewusst KEINEN Ersatztext, der einen
// Bezug behauptet, den die Daten nicht hergeben. Ein ehrlich fehlender Abschnitt
// ist besser als eine erfundene Relevanz.
//
// WEISSLISTE STATT SCHWARZLISTE: Es werden ausschliesslich die vier politisch
// aussagekraeftigen Signalarten gelesen. Alles andere — `legacy_vektor`,
// `run_id`, `similarity`, `rank`, Fingerabdruecke, Versions- und Hashfelder,
// unbekannte Zukunftsfelder — kann strukturell nicht in die Ausgabe geraten,
// weil es nie gelesen wird. Der Nutzer sieht nie eine Zahl, nie einen Rang,
// nie eine Kennung und nie ein internes Pipeline-Wort.

const { buildSignals, begruendungAusSignalen, PRIORITAET, MAX_LABEL } = require("./matching-begruendung");

// Genau die Signalarten aus `matching-begruendung.PRIORITAET` — dieselbe
// Reihenfolge, damit Satz und Belege nie unterschiedlich priorisieren.
const SICHTBARE_ARTEN = PRIORITAET;

// Belegtexte in Du-Form (START_HERE.md §5.6). Kurz genug fuer eine Zeile auf
// dem Telefon, konkret genug, um ohne den Hauptsatz verstaendlich zu sein.
const BELEG_LABEL = Object.freeze({
  ausschuss: (v) => `Dein Ausschuss: ${v}`,
  thema: (v) => `Dein Schwerpunkt: ${v}`,
  wahlkreis: (v) => `Dein Wahlkreis: ${v}`,
  partei: (v) => `Deine Partei: ${v}`
});

// Zwei bis vier Belege sind die Obergrenze: mehr liest auf dem Telefon niemand,
// und eine lange Liste erzeugt den Eindruck eines technischen Berichts.
const MAX_BELEGE = 4;
// Der Hauptsatz stammt aus `begruendungAusSignalen` (max. 2 Gruende) und ist
// real deutlich kuerzer. Die Grenze ist reiner Schutz gegen manipulierte oder
// defekte Datenbankinhalte, keine erwartete Kuerzung.
const MAX_SATZ = 240;

// Steuerzeichen entfernen, Weissraum normalisieren, hart begrenzen. Schuetzt
// die Oberflaeche vor zerschossenen Zeilenumbruechen und vor ueberlangen
// Werten, die das Layout sprengen. Escaping passiert zusaetzlich im Client.
function bereinige(value, maxLen) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\uFEFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen)
    .trim();
}

// `signale` ist jsonb. Je nach Treiber kommt ein Objekt oder ein String an;
// beides wird akzeptiert, alles andere (Array, null, kaputtes JSON) faellt
// still auf „kein Signal" zurueck — nie auf einen Fehler im Nutzerpfad.
function parseSignale(raw) {
  let value = raw;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch (_) { return {}; }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

// Nur die vier sichtbaren Arten, nur nicht-leere Zeichenketten, ohne Duplikate.
// Zahlen (z. B. `legacy_vektor`) und verschachtelte Strukturen fallen hier raus.
function weissliste(signale) {
  const out = {};
  for (const art of SICHTBARE_ARTEN) {
    const werte = signale && Array.isArray(signale[art]) ? signale[art] : [];
    const sauber = [];
    for (const w of werte) {
      if (typeof w !== "string") continue;
      const s = bereinige(w, MAX_LABEL);
      if (s && !sauber.includes(s)) sauber.push(s);
    }
    if (sauber.length) out[art] = sauber;
  }
  return out;
}

// Belege in zwei Durchgaengen: erst EIN Wert je Signalart in Prioritaets-
// reihenfolge (Breite vor Tiefe — „Ausschuss + Schwerpunkt + Wahlkreis" sagt
// mehr als drei Ausschuesse), danach mit weiteren Werten auffuellen.
function belegeAus(signale) {
  const out = [];
  const gesehen = new Set();
  const nimm = (art, wert) => {
    if (out.length >= MAX_BELEGE) return;
    const text = BELEG_LABEL[art](wert);
    if (gesehen.has(text)) return;
    gesehen.add(text);
    out.push({ art, text });
  };
  for (const art of SICHTBARE_ARTEN) {
    if (signale[art] && signale[art][0]) nimm(art, signale[art][0]);
  }
  for (const art of SICHTBARE_ARTEN) {
    for (const wert of (signale[art] || []).slice(1)) nimm(art, wert);
  }
  return out;
}

// Erklaerung zu EINER gespeicherten Ergebniszeile.
//
// Rueckgabe: { satz, belege: [{ art, text }] } oder `null`.
// `null` bedeutet immer: kein Abschnitt anzeigen. Nie ein Ersatztext.
//
// Faelle (alle in scripts/matching-erklaerung-test.js abgedeckt):
//   1. begruendung + signale  -> gespeicherter Satz, Belege aus signale
//   2. nur signale            -> Satz deterministisch aus signale abgeleitet
//   3. nur begruendung        -> null (ein Satz ohne Beleg waere unbelegt)
//   4. Legacy (run_id = NULL) -> Belege/Satz aus matched_features
//   5. nichts Belegbares      -> null (Abschnitt entfaellt, kein Ersatztext)
//   6. aktuell === false      -> null (abgeloest, gehoert nie in den Nutzerpfad)
//   7. defekt/unvollstaendig  -> null (nie ein Fehler im Lesepfad)
function erklaerungAusErgebnis(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  // Zweiter Riegel zusaetzlich zum Datenbankfilter in listMatchingResults:
  // eine abgeloeste Zeile darf auch dann nicht erklaert werden, wenn sie auf
  // einem anderen Weg (Test, Cache, kuenftiger Aufrufer) hierher gelangt.
  if (row.aktuell === false) return null;

  const ausSignalen = weissliste(parseSignale(row.signale));
  const features = Array.isArray(row.matched_features) ? row.matched_features : [];
  // Gespeicherte Signale haben Vorrang; fuer Legacy-Zeilen ohne Auditlauf
  // liefern die seit jeher gespeicherten matched_features dieselbe Struktur.
  const signale = Object.keys(ausSignalen).length
    ? ausSignalen
    : weissliste(buildSignals(features, null));

  const belege = belegeAus(signale);
  if (!belege.length) return null;

  // Persistierten Satz bevorzugen (nicht neu berechnen), sonst deterministisch
  // aus denselben Signalen ableiten — identische Bausteine, identische Regeln.
  const satz = bereinige(row.begruendung, MAX_SATZ)
    || bereinige(begruendungAusSignalen(signale, features), MAX_SATZ);
  if (!satz) return null;

  return { satz, belege };
}

module.exports = {
  SICHTBARE_ARTEN,
  MAX_BELEGE,
  MAX_SATZ,
  erklaerungAusErgebnis
};
