"use strict";

// Mutationsprobe zu Befund 27A-2 — traegt die symmetrische Zustaendigkeitspruefung wirklich?
// =============================================================================
// Ein gruener Test beweist nichts, solange nicht gezeigt ist, dass er auch ROT
// werden kann. Diese Probe nimmt die Zustaendigkeitspruefung des Ausschussbelegs
// einzeln zurueck — an neun unabhaengigen Stellen — und prueft, dass
// `matching-ausschuss-zustaendigkeit-test.js` jede Ruecknahme bemerkt.
//
// DIE ZENTRALE FRAGE DIESES SPRINTS: wird der Fix wieder durch die BISHERIGE
// BUNDES-SONDERBEHANDLUNG ersetzt ("Bundesprofil -> Beleg immer zulaessig"), muss
// die Suite rot werden. Genau das prueft N1; N6 baut denselben Rueckschritt an
// anderer Stelle ein. Die uebrigen Mutationen sichern die Nachbarschaft ab:
// Aufrufstelle, Regelkopf, Landeszweig (Befund 27A-1), der bewusst unveraenderte
// EU-Nebenbefund, die Strenge bei unbelegter Ebene und die beiden
// Zustaendigkeitsableitungen.
//
// ARBEITSWEISE (Konvention wie brandenburg-e2e-mutationsprobe.js): die
// Arbeitskopie des Repos wird NICHT angefasst — fuer jede Mutation entsteht ein
// vollstaendiger Abzug in einem temporaeren Verzeichnis; mutiert und ausgefuehrt
// wird ausschliesslich dort. Der technische Unterbau liegt im gemeinsamen
// e2e-mutationsprobe-geruest.js.
//
// Aufruf:  node scripts/befund-27a2-mutationsprobe.js [--verbose]
// Exit 0 nur, wenn JEDE Mutation die Suite rot macht.
//
// BEWUSST NICHT im Offline-Runner: die Probe fuehrt die Suite (9+1)x aus — sie ist
// ein gezielter Beweislauf je Sprint, kein Dauertest. (Der Runner sammelt nur
// *-test.js ein; diese Datei endet absichtlich auf -mutationsprobe.js.)
//
// REIN OFFLINE: 0 KI, 0 Netz, 0 Datenbank, 0 Zufall, kein Production-Zugriff.

const { fuehreMutationsprobe } = require("./e2e-mutationsprobe-geruest");

const SUITE = "matching-ausschuss-zustaendigkeit-test.js";
const MATCHING = "lib/helmut/matching.js";

// Jede Mutation nimmt GENAU EINE Garantie zurueck.
const MUTATIONEN = [
  {
    name: "N1 · Rueckkehr zur bisherigen BUNDES-SONDERBEHANDLUNG (Befund 27A-2 zurueck)",
    beschreibung: "Fuer ein Bundesmandat waere jeder Ausschussbeleg wieder zulaessig — der Landesausschuss gaelte erneut als Bundestagsmitgliedschaft samt Begruendung, Erklaerung, Gewicht und M8 (0b/0c/F3/F4/F4b/F4c/I1-I6).",
    datei: MATCHING,
    von: "    return kz.ebene === \"bund\";                                      // sonst: nur die POSITIV belegte Bundesebene",
    nach: "    return true;"
  },
  {
    name: "N2 · Der gesamte Bundeszweig entfaellt (faellt auf 'nichts entscheidbar' zurueck)",
    beschreibung: "Bundesmandate landen wieder im unveraenderten Endzweig `return true` — dieselbe Sonderbehandlung, an anderer Stelle eingebaut (0b/0c/F3/F4).",
    datei: MATCHING,
    von: "  if (pz.ebene === \"bund\") {",
    nach: "  if (false) {"
  },
  {
    name: "N3 · Die Aufrufstelle des Riegels entfaellt (matchedFeatures fragt nicht mehr)",
    beschreibung: "Jede Ausschussueberschneidung waere wieder ein Mitgliedschaftsbeleg — Befund 27A-1 UND 27A-2 gleichzeitig zurueck (0b/0c/C1/C2/F4/I1).",
    datei: MATCHING,
    von: "  if (ausschussBelegZulaessig(pf && pf.zustaendigkeit, kf && kf.zustaendigkeit)) {",
    nach: "  if (true) {"
  },
  {
    name: "N4 · Die Regel sagt im Kopf immer ja",
    beschreibung: "Die Regel bleibt aufgerufen, erlaubt aber alles — faengt eine Umgehung, die nur den Regelkopf trifft (0b/0c/C1/C2/F4/G13).",
    datei: MATCHING,
    von: "  if (!pz || !pz.ebene) return true;                                 // Profilebene unbelegt -> nichts entscheidbar",
    nach: "  return true;"
  },
  {
    name: "N5 · Der LANDESzweig verlangt kein passendes Bundesland mehr (Befund 27A-1 zurueck)",
    beschreibung: "Der fremde Landesausschuss gaelte beim Landesmandat wieder als eigene Mitgliedschaft — die Symmetrie waere einseitig (C1/C2/C6/G1/G13).",
    datei: MATCHING,
    von: "    return Array.isArray(kz.laender) && kz.laender.includes(pz.land);",
    nach: "    return true;"
  },
  {
    name: "N6 · Der bewusst unveraenderte EU-/international-Nebenbefund verschwindet still",
    beschreibung: "EU-Vorgaenge verloeren fuer Bundesmandate ihren Ausschussbeleg — eine fachliche Entscheidung, die dieser Sprint ausdruecklich NICHT trifft; sie darf nicht unbemerkt einziehen (J1/J2).",
    datei: MATCHING,
    von: "    if (SUPRANATIONALE_EBENEN.has(kz.ebene)) return true;            // offener Nebenbefund (§52.7), bewusst unveraendert",
    nach: "    ;"
  },
  {
    name: "N7 · Die Ebenenableitung des Wissensobjekts behauptet immer Bundesebene",
    beschreibung: "Jeder Landesvorgang saehe fuer ein Bundesmandat wie ein Bundesvorgang aus — der Fix waere umgangen, ohne die Regel selbst anzufassen (0c/B5/B7/F4/F4b).",
    datei: MATCHING,
    von: "  return { ebene: roh && roh !== \"unknown\" ? roh : null, laender: [...laender].sort() };",
    nach: "  return { ebene: \"bund\", laender: [...laender].sort() };"
  },
  {
    name: "N8 · Die Mandatsebene 'Bundestag' wird nicht mehr erkannt",
    beschreibung: "Bundesmandate gaelten als unbestimmt, die Regel waere fuer sie inert — der Fix waere wirkungslos, ohne dass eine Zeile der Regel fehlt (0b/0c/B2/F4).",
    datei: MATCHING,
    von: "  else if (roh.includes(\"bundestag\") || roh.startsWith(\"bund\")) ebene = \"bund\";",
    nach: "  ;"
  },
  {
    // Umgedreht im Nachtrag vom 2026-07-30: fehlende/unbekannte Ebenen sind jetzt
    // fail-closed. Die Mutation baut die frueher benannte Ausnahme WIEDER EIN und
    // muss dabei auffallen — sonst koennte die Luecke still zurueckkehren.
    name: "N9 · Fehlende/unbekannte Vorgangsebene wird wieder zugelassen",
    beschreibung: "Ein Bundesmandat bekaeme bei einem Vorgang ohne belegte Ebene wieder einen Ausschussbeleg — genau die Luecke, die der Nachtrag geschlossen hat (0b/0c/F3/G8/G8c/G11b/G13; radar-committee-evidence 14/14b/14c/14e).",
    datei: MATCHING,
    von: "    if (SUPRANATIONALE_EBENEN.has(kz.ebene)) return true;            // offener Nebenbefund (§52.7), bewusst unveraendert",
    nach: "    if (!kz.ebene) return true;\n    if (SUPRANATIONALE_EBENEN.has(kz.ebene)) return true;"
  }
];

fuehreMutationsprobe({
  titel: "MUTATIONSPROBE BEFUND 27A-2 (symmetrische Ausschuss-Zustaendigkeit)",
  suite: SUITE,
  mutationen: MUTATIONEN
});
