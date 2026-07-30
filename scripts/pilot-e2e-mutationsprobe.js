"use strict";

// Mutationsprobe zu Punkt 25A — traegt der Pilotmandanten-Ende-zu-Ende-Vertrag wirklich?
// =============================================================================
// Ein gruener Test beweist nichts, solange nicht gezeigt ist, dass er auch ROT
// werden kann. Diese Probe nimmt die zentralen Garantien des 25A-Vertrags einzeln
// zurueck und prueft, dass `pilot-e2e-vertrag-test.js` jede Ruecknahme bemerkt.
//
// ARBEITSWEISE (Konvention wie 26A/27A): die Arbeitskopie des Repos wird NICHT
// angefasst — fuer jede Mutation entsteht ein vollstaendiger Abzug in einem
// temporaeren Verzeichnis; mutiert und ausgefuehrt wird ausschliesslich dort.
// Der technische Unterbau liegt im gemeinsamen e2e-mutationsprobe-geruest.js.
//
// PFLICHTMUTATIONEN des Sprintauftrags Punkt 25A (jede gegen PRODUKTIONSCODE):
//   1. Ausschusszustaendigkeit wird umgangen            -> N1 (und unabhaengig N2)
//   2. Mandantenfilter wird entfernt                    -> N3 (Schreibseite) + N4 (Audit)
//   3. Irrelevanter Vorgang wird zugelassen             -> N5
//   4. Entscheidungsstufe wird falsch berechnet         -> N6
//   5. Sichtbare Begruendung verliert einen Pflichtbeleg -> N7 (und unabhaengig N8)
//   6. Doppelte Verarbeitung erzeugt ein zweites
//      sichtbares Ergebnis                              -> N9 (Matching) + N10 (Understanding)
//
// Aufruf:  node scripts/pilot-e2e-mutationsprobe.js [--verbose]
// Exit 0 nur, wenn JEDE Mutation die Suite rot macht.
//
// BEWUSST NICHT im Offline-Runner: die Probe fuehrt die Suite (10+1)x aus — sie ist
// ein gezielter Beweislauf je Sprint, kein Dauertest. (Der Runner sammelt nur
// *-test.js ein; diese Datei endet absichtlich auf -mutationsprobe.js.)

const { fuehreMutationsprobe } = require("./e2e-mutationsprobe-geruest");

const SUITE = "pilot-e2e-vertrag-test.js";

const MATCHING = "lib/helmut/matching.js";
const AUDIT = "lib/helmut/matching-audit.js";
const DECISIONS = "lib/helmut/decisions.js";
const BEGRUENDUNG = "lib/helmut/matching-begruendung.js";
const ERKLAERUNG = "lib/helmut/matching-erklaerung.js";
const UNDERSTANDING = "lib/helmut/understanding.js";

// Jede Mutation nimmt GENAU EINE Garantie des Vertrags zurueck.
const MUTATIONEN = [
  {
    // Sprint-Pflichtmutation 1: der Bundeszweig der Zustaendigkeitsregel (PR #185)
    // sagt wieder zu allem ja — exakt der Zustand von Befund 27A-2.
    name: "N1 · Bundeszweig der Ausschusszustaendigkeit wird umgangen (Befund 27A-2 zurueck)",
    beschreibung: "Landes- und Kommunalvorgaenge mit aehnlich benanntem Ausschuss erhielten wieder eine Bundestags-Mitgliedschaft samt Begruendung, Signal, Erklaerung und Entscheidungsgewicht (E4/E9/E10/E13/E19/H6/H7).",
    datei: MATCHING,
    von: "    return kz.ebene === \"bund\";                                      // sonst: nur die POSITIV belegte Bundesebene",
    nach: "    return true;"
  },
  {
    // Zweite, unabhaengige Ruecknahme derselben Garantie: der Aufruf der Regel
    // faellt weg. Faengt eine Umgehung, die nur den Aufruf, nicht den Zweig trifft.
    name: "N2 · Zustaendigkeitspruefung am Aufruf entfernt",
    beschreibung: "Ohne ausschussBelegZulaessig gilt jede Ausschussueberschneidung wieder als Mitgliedschaft (E4/E9/E10/E14-Umfeld).",
    datei: MATCHING,
    von: "  if (ausschussBelegZulaessig(pf && pf.zustaendigkeit, kf && kf.zustaendigkeit)) {",
    nach: "  if (true) {"
  },
  {
    // Sprint-Pflichtmutation 2a: der Mandantenfilter der Schreibseite faellt —
    // jede Ergebniszeile wuerde einem fremden Mandanten zugeschrieben.
    name: "N3 · Mandantenfilter der Schreibseite entfernt (Zeilen tragen fremden Mandanten)",
    beschreibung: "Die atomare Veroeffentlichung muss den mandantenfremden Schreibversuch hart ablehnen — der Vertrag bricht sichtbar ab statt still fremde Daten zu schreiben (E1 ff.).",
    datei: MATCHING,
    von: "      user_id: userId,",
    nach: "      user_id: \"fremder-mandant\","
  },
  {
    // Sprint-Pflichtmutation 2b: die Mandanten-/Profilpruefung der Audit-Schicht
    // faellt — ein Lauf mit fremder Profilkennung wuerde nicht mehr abgelehnt.
    name: "N4 · Mandanten-/Profilpruefung der Audit-Schicht entfaellt",
    beschreibung: "Ein Lauf mit fremder Profilkennung wuerde nicht mehr abgelehnt — Mandantentrennung durchbrochen (G8).",
    datei: AUDIT,
    von: "  if (!deps.profileBelongsToTenant(descriptor.mandateProfileId, descriptor.tenantId)) {",
    nach: "  if (false) {"
  },
  {
    // Sprint-Pflichtmutation 3: irrelevante Vorgaenge werden zugelassen —
    // ein Sockelbetrag hebt jeden Vorgang ueber die Ignorieren-Schwelle.
    name: "N5 · Irrelevanter Vorgang wird zugelassen (Score-Sockel)",
    beschreibung: "Der fachfremde Fischerei-Bericht bekaeme trotz 0 Belegen Handlungsrelevanz — Ignorieren faellt (H5, H2-Umfeld).",
    datei: DECISIONS,
    von: "  let score = 0;",
    nach: "  let score = 50;"
  },
  {
    // Sprint-Pflichtmutation 4: die Entscheidungsstufe wird falsch berechnet.
    name: "N6 · Entscheidungsschwelle entfaellt: alles ist sofort wichtig",
    beschreibung: "Auch der irrelevante, der Landes- und der Kommunalfall bekaemen \"Sofort reagieren\" (H5/H6/H8/H9/H11).",
    datei: DECISIONS,
    von: "  return score >= 60 ? \"Sofort reagieren\" : score >= 40 ? \"Beobachten\" : \"Ignorieren\";",
    nach: "  return \"Sofort reagieren\";"
  },
  {
    // Sprint-Pflichtmutation 5: die sichtbare Begruendung verliert den
    // Pflichtbeleg Ausschuss (staerkster Grund, Prioritaet 1).
    name: "N7 · Sichtbare Begruendung verliert den Ausschuss-Pflichtbeleg",
    beschreibung: "Begruendung und sichtbare Erklaerung nennten den echten Ausschussbeleg nicht mehr (E6/E18/I2/I6).",
    datei: BEGRUENDUNG,
    von: "const PRIORITAET = Object.freeze([\"ausschuss\", \"thema\", \"wahlkreis\", \"partei\"]);",
    nach: "const PRIORITAET = Object.freeze([\"thema\", \"wahlkreis\", \"partei\"]);"
  },
  {
    // Unabhaengige Ruecknahme der Belegpflicht: ohne Beleg entsteht ein Ersatztext.
    name: "N8 · Erklaerung ohne Beleg erfindet einen Ersatztext",
    beschreibung: "Eine Zeile ohne matched_features bekaeme eine behauptete Relevanz — Belegpflicht gebrochen (E20).",
    datei: ERKLAERUNG,
    von: "  const belege = belegeAus(signale);\n  if (!belege.length) return null;",
    nach: "  const belege = belegeAus(signale);\n  if (!belege.length) return { satz: \"Für dich relevant.\", belege: [{ art: \"thema\", text: \"Dein Schwerpunkt: Politik\" }] };"
  },
  {
    // Sprint-Pflichtmutation 6a: doppelte Verarbeitung erzeugt eine zweite
    // Generation — die Matching-Idempotenz faellt.
    name: "N9 · Matching-Idempotenz entfaellt (Doppelverarbeitung erzeugt neue Generation)",
    beschreibung: "Ein identischer Eingabefingerabdruck erzeugte wieder eine neue Laufzeile samt Schreibvorgaengen (F1/F2).",
    datei: AUDIT,
    von: "  if (vorhanden && vorhanden.id) {",
    nach: "  if (false) {"
  },
  {
    // Sprint-Pflichtmutation 6b: doppelte Verarbeitung im Understanding —
    // vollstaendige Duplikate gelten wieder als neue Arbeit.
    name: "N10 · Understanding-Duplikate gelten wieder als neue Arbeit",
    beschreibung: "Ein identischer Zweitlauf wuerde dieselben Vorgaenge erneut anfassen — Idempotenz des Understandings gebrochen (D1/D2).",
    datei: UNDERSTANDING,
    von: "      if (!neueDocs.length) {\n        return { vorgangId, status: \"duplicate\", documents: clusterDocs.length, ...spur };\n      }",
    nach: "      if (false) {\n        return { vorgangId, status: \"duplicate\", documents: clusterDocs.length, ...spur };\n      }"
  }
];

fuehreMutationsprobe({
  titel: "MUTATIONSPROBE PUNKT 25A (Pilotmandanten-E2E-Vertrag, Bund)",
  suite: SUITE,
  mutationen: MUTATIONEN,
  zusatzdateien: ["scripts/fixtures/test-profiles.js"]
});
