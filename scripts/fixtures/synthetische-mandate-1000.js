"use strict";

// Helmut — DETERMINISTISCHER synthetischer Mandatsdatensatz (OP-30, Auftrag §12).
// =============================================================================================
// ZWECK: 1 000 Mandatsprofile fuer den lokalen Skalierungsnachweis — ohne echte
// personenbezogene Daten und ohne Bezug zu einem realen Mandat.
//
// MANDANTENNEUTRALITAET (CLAUDE.md §4.2): die Namen sind offensichtlich synthetisch
// ("Testperson 0042"), die Kennungen tragen das Praefix `synth-`. Es gibt KEINEN Bezug zum
// Pilotmandanten und zu keinem realen Abgeordneten. Diese Profile werden NIE aktiviert und
// NIE in eine Ablage geschrieben — sie existieren ausschliesslich im Testprozess.
//
// DETERMINISMUS: kein Math.random. Alle Merkmale entstehen aus dem Index ueber feste
// Teilerreste. Derselbe Aufruf liefert immer denselben Datensatz — sonst waere der
// Skalierungsnachweis nicht wiederholbar.
//
// REALITAETSNAEHE, die fuer den Nachweis zaehlt: die Verteilung muss die ECHTE Struktur
// abbilden, sonst misst der Test etwas anderes als Production.
//   * Ebenen:      Bundestag und Landtag gemischt (Landtag hat 8 statt 7 eigene Wege).
//   * Parteien:    wenige Parteien, viele Mandate — genau die Konstellation, in der geteilte
//                  Fraktionssuchen etwas bringen.
//   * Ausschuesse: begrenzte Zahl, viele Mandate je Ausschuss.
//   * Themen:      begrenzter Themenvorrat, ueberlappende Kombinationen.
//   * Regionen:    16 Bundeslaender, viele Wahlkreise.
// Die Wahlkreise sind BEWUSST fast eindeutig (wie in der Wirklichkeit) — sie sind damit der
// harte Fall fuer den Compiler und werden NICHT kuenstlich zusammenfassbar gemacht.

const PARTEIEN = [
  { partei: "Partei Alpha", fraktion: "Fraktion Alpha" },
  { partei: "Partei Beta", fraktion: "Fraktion Beta" },
  { partei: "Partei Gamma", fraktion: "Fraktion Gamma" },
  { partei: "Partei Delta", fraktion: "Fraktion Delta" },
  { partei: "Partei Epsilon", fraktion: "Fraktion Epsilon" },
  { partei: "Partei Zeta", fraktion: "Fraktion Zeta" }
];

const LAENDER = [
  "Baden-Wuerttemberg", "Bayern", "Berlin", "Brandenburg", "Bremen", "Hamburg",
  "Hessen", "Mecklenburg-Vorpommern", "Niedersachsen", "Nordrhein-Westfalen",
  "Rheinland-Pfalz", "Saarland", "Sachsen", "Sachsen-Anhalt",
  "Schleswig-Holstein", "Thueringen"
];

const AUSSCHUESSE = [
  "Ausschuss fuer Arbeit und Soziales",
  "Ausschuss fuer Gesundheit",
  "Ausschuss fuer Bildung und Forschung",
  "Ausschuss fuer Verkehr",
  "Ausschuss fuer Umwelt und Naturschutz",
  "Ausschuss fuer Wirtschaft und Energie",
  "Ausschuss fuer Inneres und Heimat",
  "Haushaltsausschuss",
  "Ausschuss fuer Digitales",
  "Ausschuss fuer Wohnen und Stadtentwicklung"
];

const MINISTERIEN = [
  "Bundesministerium fuer Arbeit und Soziales",
  "Bundesministerium fuer Gesundheit",
  "Bundesministerium fuer Bildung und Forschung",
  "Bundesministerium fuer Digitales und Verkehr",
  "Bundesministerium fuer Umwelt",
  "Bundesministerium fuer Wirtschaft und Klimaschutz",
  "Bundesministerium des Innern",
  "Bundesministerium der Finanzen"
];

const THEMEN = [
  "Rente", "Pflege", "Arbeitsmarkt", "Mindestlohn", "Kinderbetreuung",
  "Wohnungsbau", "Mietrecht", "Energiewende", "Klimaschutz", "Verkehrswende",
  "Digitalisierung", "Breitbandausbau", "Bildungsfinanzierung", "Ganztagsschule",
  "Pflegeversicherung", "Krankenhausreform", "Buergergeld", "Fachkraeftemangel",
  "Industriepolitik", "Landwirtschaft"
];

// Erzeugt genau `anzahl` Profile in der Form, die `scheduler.getSourcesForProfile`,
// `personNewsSource` und `mandateNewsSources` erwarten.
function erzeugeMandate(anzahl = 1000) {
  const profile = [];
  for (let i = 0; i < anzahl; i += 1) {
    const nr = String(i).padStart(4, "0");
    // Jedes 8. Mandat ist ein Landtagsmandat (8 statt 7 eigene Wege — der teurere Fall
    // ist damit im Datensatz vertreten, aber nicht dominant).
    const istLandtag = i % 8 === 0;
    const land = LAENDER[i % LAENDER.length];
    const partei = PARTEIEN[i % PARTEIEN.length];
    const ausschuss = AUSSCHUESSE[i % AUSSCHUESSE.length];
    const ministerium = MINISTERIEN[i % MINISTERIEN.length];
    // Drei Themen aus einem begrenzten Vorrat, mit ueberlappenden Kombinationen.
    const themen = [
      THEMEN[i % THEMEN.length],
      THEMEN[(i * 7 + 3) % THEMEN.length],
      THEMEN[(i * 13 + 11) % THEMEN.length]
    ].filter((t, idx, arr) => arr.indexOf(t) === idx);

    profile.push({
      id: `synth-mandat-${nr}`,
      // Offensichtlich synthetisch. Kein realer Name, keine reale Person.
      fullName: `Testperson ${nr}`,
      parliamentType: istLandtag ? "Landtag" : "Bundestag",
      party: partei.partei,
      faction: partei.fraktion,
      committee: ausschuss,
      committees: [ausschuss],
      relevantMinistries: [ministerium],
      focusTopics: themen,
      topicPriorities: themen.reduce((akk, t, idx) => { akk[t] = 3 - idx; return akk; }, {}),
      state: land,
      // Wahlkreise sind fast eindeutig — wie in der Wirklichkeit. Der Compiler darf sie
      // NICHT zusammenfassen, und der Test misst genau das.
      constituency: `Wahlkreis ${nr}`,
      regionalInterests: [land],
      disabled: false
    });
  }
  return profile;
}

// Verteilungskennzahlen — damit der Test belegen kann, dass der Datensatz wirklich
// vielfaeltig ist und die Verdichtung nicht auf einem entarteten Datensatz beruht.
function verteilung(profile) {
  const zaehle = (f) => {
    const m = new Map();
    for (const p of profile) { const k = f(p); m.set(k, (m.get(k) || 0) + 1); }
    return m;
  };
  return {
    profile: profile.length,
    ebenen: zaehle((p) => p.parliamentType),
    parteien: zaehle((p) => p.party).size,
    ausschuesse: zaehle((p) => p.committee).size,
    laender: zaehle((p) => p.state).size,
    wahlkreise: zaehle((p) => p.constituency).size,
    themenkombinationen: zaehle((p) => p.focusTopics.join("|")).size
  };
}

module.exports = { erzeugeMandate, verteilung, PARTEIEN, LAENDER, AUSSCHUESSE, MINISTERIEN, THEMEN };
