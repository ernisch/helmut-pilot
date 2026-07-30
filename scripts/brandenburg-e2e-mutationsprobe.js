"use strict";

// Mutationsprobe zu Punkt 27A — traegt der Brandenburger Ende-zu-Ende-Vertrag wirklich?
// =============================================================================
// Ein gruener Test beweist nichts, solange nicht gezeigt ist, dass er auch ROT
// werden kann. Diese Probe nimmt die zentralen Garantien des 27A-Vertrags einzeln
// zurueck und prueft, dass `brandenburg-e2e-vertrag-test.js` jede Ruecknahme bemerkt.
//
// ARBEITSWEISE (Konvention wie geografie-mutationsprobe.js): die Arbeitskopie des
// Repos wird NICHT angefasst — fuer jede Mutation entsteht ein vollstaendiger Abzug
// in einem temporaeren Verzeichnis; mutiert und ausgefuehrt wird ausschliesslich dort.
// Der technische Unterbau (Abzug, Ausfuehrung, Auswertung) liegt im gemeinsamen
// e2e-mutationsprobe-geruest.js; die MUTATIONEN hier sind Brandenburg-spezifisch
// (M2/M3/M4/M13) plus die Kerngarantien des Pfads, erneut gegen DIESE Suite bewiesen.
// M15/M16/M17 sichern die Regression zu Befund 27A-1 ab: wird die
// Zustaendigkeitspruefung des Ausschussbelegs entfernt (auf drei unabhaengige
// Weisen — Aufruf, Regelkopf, Landeszweig), MUSS der Vertrag rot werden — sonst
// waere der Fix nicht durch den Vertrag gedeckt. Die BUNDESseite (Befund 27A-2)
// deckt dieser Vertrag nicht ab (das Brandenburger Profil ist ein Landesmandat);
// dafuer gibt es `scripts/befund-27a2-mutationsprobe.js`.
//
// Aufruf:  node scripts/brandenburg-e2e-mutationsprobe.js [--verbose]
// Exit 0 nur, wenn JEDE Mutation die Suite rot macht.
//
// BEWUSST NICHT im Offline-Runner: die Probe fuehrt die Suite (15+1)x aus — sie ist
// ein gezielter Beweislauf je Sprint, kein Dauertest. (Der Runner sammelt nur
// *-test.js ein; diese Datei endet absichtlich auf -mutationsprobe.js.)

const { fuehreMutationsprobe } = require("./e2e-mutationsprobe-geruest");

const SUITE = "brandenburg-e2e-vertrag-test.js";

const KLASSEN = "lib/helmut/quellenarchitektur/pardok-dokumentklassen.js";
const PARSER = "lib/helmut/quellenarchitektur/pardok-parser.js";
const CLS = "lib/helmut/quellenarchitektur/classification.js";
const MATCHING = "lib/helmut/matching.js";
const UNDERSTANDING = "lib/helmut/understanding.js";
const AUDIT = "lib/helmut/matching-audit.js";
const DECISIONS = "lib/helmut/decisions.js";
const ERKLAERUNG = "lib/helmut/matching-erklaerung.js";

// Jede Mutation nimmt GENAU EINE Garantie des Vertrags zurueck.
const MUTATIONEN = [
  {
    name: "M1 · Herkunft (BRA) faellt aus dem Rohdokument-Vertrag",
    beschreibung: "Ohne raw.herkunft verloere das Brandenburger Dokument seinen Herkunftsnachweis — Vertragsstufe C2.",
    datei: KLASSEN,
    von: "      herkunft: LAND_HERKUNFT[String(doc.land || \"\").toLowerCase()] || null,",
    nach: "      herkunft: null,"
  },
  {
    name: "M2 · Brandenburger Typtabelle vergisst die Kleine Anfrage",
    beschreibung: "Ohne den DokTyp-Eintrag fiele das wichtigste Brandenburger Instrument auf die Dokumentart (Drucksache) zurueck — Klasse anfrage verloren (B3/C3).",
    datei: KLASSEN,
    von: "  \"kleine anfrage\": eintrag(\"anfrage\", \"probe-bb-2026-07-26\"),\n  \"klanfr\": eintrag(\"anfrage\", \"probe-bb-2026-07-26\"),",
    nach: ""
  },
  {
    name: "M3 · Vorgangsbezug entfaellt (vorgangsKennung liefert nichts mehr)",
    beschreibung: "Ohne VNr verloeren alle Brandenburger Dokumente ihren Vorgangsbezug und ihre externe Kennung wuerde zum bra:-Rueckfall (B2/B6/B7/B11/C3/C10).",
    datei: PARSER,
    von: "  return { vnr: vnr || vid || null, konflikt: false };",
    nach: "  return { vnr: null, konflikt: false };"
  },
  {
    name: "M4 · delete-Stubs werden wieder als Inhalt behandelt",
    beschreibung: "Der Tombstone V-369325 wuerde nicht mehr uebersprungen — der ehrliche Stub-Zaehler und die Stub/Vollrecord-Trennung fielen (B2).",
    datei: PARSER,
    von: "  const cfg = LAND_CONFIG.brandenburg;\n  const vFunktion = firstField(vorgangXml, \"VFunktion\");\n  if (vFunktion && /delete/i.test(vFunktion)) return { skipped: \"delete\", documents: [] };",
    nach: "  const cfg = LAND_CONFIG.brandenburg;\n  const vFunktion = firstField(vorgangXml, \"VFunktion\");\n  if (false) return { skipped: \"delete\", documents: [] };"
  },
  {
    name: "M5 · Landes-Institutionen stiften keine Ebene mehr",
    beschreibung: "\"Landtag Brandenburg\" wuerde keine Landesebene mehr ergeben — der Brandenburger Vorgang verloere decision_level=land (D5).",
    datei: CLS,
    von: "const LAND_INSTITUTION_TERMS = [\"landtag\", \"abgeordnetenhaus\", \"senat\", \"landesregierung\", \"staatskanzlei\", \"senatskanzlei\", \"senatsverwaltung\", \"landesministerium\"];",
    nach: "const LAND_INSTITUTION_TERMS = [];"
  },
  {
    name: "M6 · Institutionsnennung im Fliesstext stiftet keine Geografie mehr",
    beschreibung: "\"Landtag Brandenburg\" im Text ergaebe keine betroffene Geografie Brandenburg mehr (D6/D7).",
    datei: CLS,
    von: "    for (const eintrag of SUBNATIONALE_INSTITUTIONSPHRASEN) {",
    nach: "    for (const eintrag of []) {"
  },
  {
    name: "M7 · Ausschuss-Ueberschneidung erzeugt kein matched_feature mehr",
    beschreibung: "Der wichtigste Beleg (Dein Ausschuss) verschwaende aus Matching, Erklaerung und Entscheidung (F5/F9/I2).",
    datei: MATCHING,
    von: "  overlapLabels(pf.committees, kf.committees, slugCommittee).forEach((v) => feats.push({ type: \"ausschuss\", value: v }));",
    nach: "  ;"
  },
  {
    name: "M8 · Vollstaendige Duplikate gelten wieder als neue Arbeit",
    beschreibung: "Ein identischer Zweitlauf wuerde denselben Vorgang erneut anfassen — Idempotenz des Understandings gebrochen (E1/E2).",
    datei: UNDERSTANDING,
    von: "      if (!neueDocs.length) {\n        return { vorgangId, status: \"duplicate\", documents: clusterDocs.length, ...spur };\n      }",
    nach: "      if (false) {\n        return { vorgangId, status: \"duplicate\", documents: clusterDocs.length, ...spur };\n      }"
  },
  {
    name: "M9 · Matching-Idempotenz entfaellt",
    beschreibung: "Ein identischer Eingabefingerabdruck erzeugte wieder eine neue Generation samt Schreibvorgaengen (G1/G2).",
    datei: AUDIT,
    von: "  if (vorhanden && vorhanden.id) {",
    nach: "  if (false) {"
  },
  {
    name: "M10 · Mandanten-/Profilpruefung der Audit-Schicht entfaellt",
    beschreibung: "Ein Lauf mit fremder Profilkennung wuerde nicht mehr abgelehnt — Mandantentrennung durchbrochen (H6).",
    datei: AUDIT,
    von: "  if (!deps.profileBelongsToTenant(descriptor.mandateProfileId, descriptor.tenantId)) {",
    nach: "  if (false) {"
  },
  {
    name: "M11 · Publish-Fehler wird verschluckt statt gemeldet",
    beschreibung: "Ein Abbruch waehrend der Veroeffentlichung saehe wie ein vollstaendiger Lauf aus — falsches Gruen (K5/K6).",
    datei: AUDIT,
    von: "      error.auditStatus = contract.RUN_STATUS.FEHLGESCHLAGEN;\n      throw error;",
    nach: "      return { idempotent: false, runId, status: contract.RUN_STATUS.VOLLSTAENDIG, fingerprint: descriptor.fingerprint, veroeffentlicht: 0, abgeloest: 0, wiederholungen: 0 };"
  },
  {
    name: "M12 · Entscheidungsschwelle entfaellt: alles ist sofort wichtig",
    beschreibung: "Auch die konstituierende Sitzung, der fachfremde Vorgang und der fremde Mandant bekaemen \"Sofort reagieren\" (I4/I5/I7).",
    datei: DECISIONS,
    von: "  return score >= 60 ? \"Sofort reagieren\" : score >= 40 ? \"Beobachten\" : \"Ignorieren\";",
    nach: "  return \"Sofort reagieren\";"
  },
  {
    name: "M13 · Unbelegte Fremdtreffer bleiben in der Entscheidungsliste",
    beschreibung: "Der Berliner Kontrollfall (negative Aehnlichkeit, kein Beleg) erhielte wieder eine Entscheidung beim Brandenburger Profil (I1/I6).",
    datei: MATCHING,
    von: "    if (similarity < threshold && !matched.length) continue;",
    nach: "    if (false) continue;"
  },
  {
    // Regression zu Befund 27A-1. Wird die Zustaendigkeitspruefung entfernt, faellt der
    // Vertrag exakt in den behobenen Fehler zurueck: der Berliner Innenausschuss wird als
    // Brandenburger Ausschussmitgliedschaft belegt, begruendet, erklaert und gewichtet.
    name: "M15 · Zustaendigkeitspruefung des Ausschussbelegs entfaellt (Befund 27A-1 zurueck)",
    beschreibung: "Ohne ausschussBelegZulaessig erhielte der fremde Landesvorgang mit echter Ausschussnennung wieder einen falschen Ausschussbeleg samt Begruendung, Signal, Erklaerung und Entscheidungsgewicht (F11/F13/F14/I8).",
    datei: MATCHING,
    von: "  if (ausschussBelegZulaessig(pf && pf.zustaendigkeit, kf && kf.zustaendigkeit)) {",
    nach: "  if (true) {"
  },
  {
    // Zweite, unabhaengige Ruecknahme: die Regel bleibt aufgerufen, liefert aber immer
    // "zulaessig". Faengt eine Umgehung, die nur die Bedingung, nicht den Aufruf trifft.
    name: "M16 · Zustaendigkeitsregel sagt immer ja (Ruecknahme in der Regel selbst)",
    beschreibung: "Die Regel selbst erlaubt jeden Ausschussbeleg — derselbe Fehler, an anderer Stelle eingebaut (F11/F12/I8).",
    datei: MATCHING,
    von: "  if (!pz || !pz.ebene) return true;                                 // Profilebene unbelegt -> nichts entscheidbar",
    nach: "  return true;"
  },
  {
    // Dritte Ruecknahme, gezielt auf den LANDES-Zweig: die Regel bleibt aufgerufen
    // und greift, aber ihre Landespruefung wird bedingungslos wahr.
    name: "M17 · Landeszweig der Zustaendigkeitsregel verlangt kein passendes Bundesland mehr",
    beschreibung: "Der Berliner Vorgang wuerde beim Brandenburger Profil wieder als eigene Ausschussmitgliedschaft gelten (F11/F13/F14/I8).",
    datei: MATCHING,
    von: "    return Array.isArray(kz.laender) && kz.laender.includes(pz.land);",
    nach: "    return true;"
  },
  {
    name: "M14 · Erklaerung ohne Beleg erfindet einen Ersatztext",
    beschreibung: "Die Berliner Kontrollzeile ohne matched_features bekaeme eine behauptete Relevanz — Belegpflicht gebrochen (F10).",
    datei: ERKLAERUNG,
    von: "  const belege = belegeAus(signale);\n  if (!belege.length) return null;",
    nach: "  const belege = belegeAus(signale);\n  if (!belege.length) return { satz: \"Für dich relevant.\", belege: [{ art: \"thema\", text: \"Dein Schwerpunkt: Politik\" }] };"
  }
];

fuehreMutationsprobe({
  titel: "MUTATIONSPROBE PUNKT 27A (Brandenburger E2E-Vertrag)",
  suite: SUITE,
  mutationen: MUTATIONEN
});
