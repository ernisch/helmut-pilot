"use strict";

// Radar-Ausschuss-Normalisierung — Offline, 0 KI, 0 Netz, 0 Kosten.
// Hintergrund: Der Radar verwarf einen vom Matching KORREKT erzeugten Ausschuss-Treffer
// wieder, weil er den Ausschuss mit rohem slug() verglich ("arbeit und soziales" !=
// "ausschuss fuer arbeit und soziales"), waehrend das Matching die matched_features zentral
// ueber normalizeCommittee/slugCommittee erzeugt. Fix: radarState nutzt jetzt fuer die
// Mitgliedschafts-/Belegpruefung committeeMatchKey — denselben Synonym-Katalog wie
// normalizeCommittee, aber KOLLISIONSSICHER (laengster/spezifischster Schluessel zuerst).
//
// WICHTIG (Design-Entscheidung, explizit getestet): normalizeCommittee/slugCommittee selbst
// bleiben UNVERAENDERT — sie speisen die Aehnlichkeits-/Embedding-Pipeline (Ranking/Score/
// Top-50-Cut). Eine Aenderung DORT hatte nachweislich Ranking-Nebenwirkungen (Dynamiken
// verschoben sich 7->8, obwohl Cems eigener Ausschuss nicht betroffen war — geteilter
// Feature-Vektor-Raum). committeeMatchKey ist eine SEPARATE, kollisionssichere Funktion NUR
// fuer Mitgliedschafts-/Belegvergleiche (Radar-Ausschuss-Reiter). Dieser Test PINNT beide
// Verhalten explizit, damit ein spaeteres "Aufraeumen" (Zusammenlegen beider Funktionen) die
// Ranking-Neutralitaet nicht versehentlich wieder bricht.
//
// KEINE Cem-Sonderregel: die Kette wird ueber mehrere Ausschuesse + Schreibweisen + Gross-/
// Kleinschreibung + Profilfeldvarianten getestet. matched_features werden mit der ECHTEN
// Matching-Engine erzeugt (matching.matchedFeatures) — kein hand-authored Feature.

const radarState = require("../lib/helmut/radarState");
const matching = require("../lib/helmut/matching");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const NOW = new Date("2026-07-14T09:00:00Z").getTime();
const nowDate = new Date(NOW);
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
const KOBASE = { status: "neu", understanding_status: "complete" };

// Fuehrt die ECHTE Kette aus: profileFeatures + knowledgeObjectFeatures -> matchedFeatures
// -> buildCurrentRadarState -> environment.committees. Gibt zurueck, ob der Vorgang im
// Ausschuss-Reiter erscheint (granted) + die erzeugten matched_features.
function runCommittee({ profileFields, ausschuesse, mentioned_committees = [], title = "" }) {
  const profile = { id: "p", fullName: "Test Person", ...profileFields };
  const ko = { ...KOBASE, id: "k", vorgang_id: "v", display_title: title, ausschuesse,
    mentioned_committees, created_at: iso(24 * 3600e3), best_source_url: "https://example.org/d" };
  const pf = matching.profileFeatures(profile);
  const kf = matching.knowledgeObjectFeatures(ko);
  const mf = matching.matchedFeatures(pf, kf);
  const decision = { knowledge_object_id: "k", vorgang_id: "v", score: 50, matched_features: mf };
  const st = radarState.buildCurrentRadarState({
    profile, decisions: [decision], kosById: { k: ko }, knowledgeObjects: [ko],
    sourcesByVorgang: {}, now: nowDate
  });
  return { granted: st.environment.committees.some((e) => e.vorgangId === "v"),
    committeeCount: st.environment.committees.length, mf };
}

// =============================================================================
// 1) Zentrale Ausschuss-Normalisierung (committeeMatchKey): Kernmatrix
// =============================================================================
const committeeKey = (v) => [...radarState.radarProfileTerms({ committee: v }).committees][0];

check("1 'Arbeit und Soziales' == 'Ausschuss für Arbeit und Soziales'",
  committeeKey("Arbeit und Soziales") === committeeKey("Ausschuss für Arbeit und Soziales"));
check("1b 'Arbeit und Soziales' == 'Bundestagsausschuss für Arbeit und Soziales'",
  committeeKey("Arbeit und Soziales") === committeeKey("Bundestagsausschuss für Arbeit und Soziales"));
check("1c 'Gesundheit' == 'Ausschuss für Gesundheit'", committeeKey("Gesundheit") === committeeKey("Ausschuss für Gesundheit"));
check("1d 'Gesundheit' == 'Gesundheitsausschuss'", committeeKey("Gesundheit") === committeeKey("Gesundheitsausschuss"));
check("1e 'Recht und Verbraucherschutz' == 'Rechtsausschuss'", committeeKey("Recht und Verbraucherschutz") === committeeKey("Rechtsausschuss"));

// Kollisions-Regressionstest: DAS war der konkrete Fehler (Menschenrechte kollabierte
// faelschlich auf Recht, weil "recht" ein Teilwort von "menschenrechte" ist).
check("1f Menschenrechte und Recht bleiben UNTERSCHIEDLICHE Ausschuesse (keine Kollision)",
  committeeKey("Menschenrechte und humanitäre Hilfe") !== committeeKey("Recht und Verbraucherschutz"),
  `menschenrechte-key=${committeeKey("Menschenrechte und humanitäre Hilfe")} recht-key=${committeeKey("Recht und Verbraucherschutz")}`);
check("1g 'Ausschuss für Menschenrechte und humanitäre Hilfe' == 'Menschenrechte und humanitäre Hilfe'",
  committeeKey("Ausschuss für Menschenrechte und humanitäre Hilfe") === committeeKey("Menschenrechte und humanitäre Hilfe"));

// Sieben verschiedene Ausschuesse -> sieben unterscheidbare Schluessel (kein Cross-Merge).
const distinctCommittees = ["Arbeit und Soziales", "Gesundheit", "Menschenrechte und humanitäre Hilfe",
  "Recht und Verbraucherschutz", "Auswärtiger Ausschuss", "Finanzausschuss", "Verteidigung"];
const distinctKeys = distinctCommittees.map(committeeKey);
check("1h Sieben Ausschuesse -> sieben unterscheidbare Schluessel", new Set(distinctKeys).size === 7, JSON.stringify(distinctKeys));

// =============================================================================
// 2) Gross-/Kleinschreibung — irrelevant fuer den Schluessel
// =============================================================================
check("2 Grossschreibung: 'AUSSCHUSS FÜR ARBEIT UND SOZIALES' == 'arbeit und soziales'",
  committeeKey("AUSSCHUSS FÜR ARBEIT UND SOZIALES") === committeeKey("arbeit und soziales"));
check("2b Kleinschreibung: 'ausschuss für gesundheit' == 'Gesundheit'",
  committeeKey("ausschuss für gesundheit") === committeeKey("Gesundheit"));

// =============================================================================
// 3) Profilfeld-Varianten: singular (committee) + Array (committees) kombinieren
// =============================================================================
{
  const terms = radarState.radarProfileTerms({ committee: "Arbeit und Soziales", committees: ["Gesundheit"] });
  check("3 committee (singular) UND committees (Array) fliessen beide in die Profil-Terme ein",
    terms.committees.has(committeeKey("Arbeit und Soziales")) && terms.committees.has(committeeKey("Gesundheit")));
}
{
  // Nur committees-Array (kein singular committee-Feld) — muss trotzdem greifen.
  const terms = radarState.radarProfileTerms({ committees: ["Recht und Verbraucherschutz"] });
  check("3b Nur committees-Array (kein 'committee'-Feld) -> Ausschuss dennoch erkannt",
    terms.committees.has(committeeKey("Recht und Verbraucherschutz")));
}

// =============================================================================
// 4) B-Fix (radarState nutzt zentrale Normalisierung): echte Kette Matching -> Radar
// =============================================================================
check("4 Profil 'Arbeit und Soziales' + KO ['Ausschuss für Arbeit und Soziales'] -> Ausschuss-Reiter",
  runCommittee({ profileFields: { committee: "Arbeit und Soziales" }, ausschuesse: ["Ausschuss für Arbeit und Soziales"] }).granted);
check("4b Profil 'Arbeit und Soziales' + KO ['Bundestagsausschuss für Arbeit und Soziales'] -> erkannt",
  runCommittee({ profileFields: { committee: "Arbeit und Soziales" }, ausschuesse: ["Bundestagsausschuss für Arbeit und Soziales"] }).granted);
check("4c Profil 'Ausschuss für Gesundheit' + KO ['Ausschuss für Gesundheit'] (volle amtliche Form) -> erkannt",
  runCommittee({ profileFields: { committee: "Ausschuss für Gesundheit" }, ausschuesse: ["Ausschuss für Gesundheit"] }).granted);
check("4c-2 Profil 'Ausschuss für Gesundheit' + KO ['Gesundheitsausschuss'] (bloße Kurzform, kein Beleg) -> NICHT erkannt (siehe radar-committee-evidence-test.js fuer die Beleg-Verschaerfung)",
  !runCommittee({ profileFields: { committee: "Ausschuss für Gesundheit" }, ausschuesse: ["Gesundheitsausschuss"] }).granted);
check("4d Profil 'Menschenrechte und humanitäre Hilfe' + KO ['Recht und Verbraucherschutz'] -> NICHT erkannt (keine Kollision)",
  !runCommittee({ profileFields: { committee: "Menschenrechte und humanitäre Hilfe" }, ausschuesse: ["Recht und Verbraucherschutz"] }).granted);
check("4e Profil 'Recht und Verbraucherschutz' + KO ['Ausschuss für Menschenrechte und humanitäre Hilfe'] -> NICHT erkannt (umgekehrt)",
  !runCommittee({ profileFields: { committee: "Recht und Verbraucherschutz" }, ausschuesse: ["Ausschuss für Menschenrechte und humanitäre Hilfe"] }).granted);
check("4f Profil 'Menschenrechte und humanitäre Hilfe' + KO ['Ausschuss für Menschenrechte und humanitäre Hilfe'] -> erkannt (eigener Ausschuss funktioniert)",
  runCommittee({ profileFields: { committee: "Menschenrechte und humanitäre Hilfe" }, ausschuesse: ["Ausschuss für Menschenrechte und humanitäre Hilfe"] }).granted);

// =============================================================================
// 5) Aehnliche Ausschussnamen — keine Verwechslung (Arbeit/Soziales vs. Gesundheit)
// =============================================================================
check("5 Fremder Ausschuss: Gesundheit-Profil am reinen Arbeit-und-Soziales-KO -> KEIN Treffer",
  !runCommittee({ profileFields: { committee: "Gesundheit" }, ausschuesse: ["Ausschuss für Arbeit und Soziales"] }).granted);
check("5b Aehnlicher Klang, anderer Ausschuss: 'Recht' vs. 'Ausschuss für Recht und Verbraucherschutz' (volle Form) greift korrekt",
  runCommittee({ profileFields: { committee: "Recht und Verbraucherschutz" }, ausschuesse: ["Ausschuss für Recht und Verbraucherschutz"] }).granted);
check("5b-2 'Rechtsausschuss' (bloße Kurzform, kein Beleg) allein genuegt NICHT mehr (siehe radar-committee-evidence-test.js)",
  !runCommittee({ profileFields: { committee: "Recht und Verbraucherschutz" }, ausschuesse: ["Rechtsausschuss"] }).granted);

// =============================================================================
// 6) Bloße Ausschusserwähnung vs. strukturelle Verankerung
// =============================================================================
check("6 Nur mentioned_committees (bloße Erwähnung), NICHT in ausschuesse -> KEIN Ausschuss-Reiter",
  !runCommittee({ profileFields: { committee: "Arbeit und Soziales" }, ausschuesse: [], mentioned_committees: ["Ausschuss für Arbeit und Soziales"] }).granted);

// =============================================================================
// 7) Reine Themennennung ohne Ausschussbeleg
// =============================================================================
{
  // KO hat KEIN ausschuesse-Feld ueberhaupt, nur ein Thema/Titel, das den Ausschussnamen
  // enthaelt — darf NICHT in den Ausschuss-Reiter rutschen (kein Themen-Fallback).
  const profile = { id: "p", fullName: "Test Person", committee: "Arbeit und Soziales" };
  const ko = { ...KOBASE, id: "k", vorgang_id: "v", display_title: "Debatte über Arbeit und Soziales im Bundestag",
    tags: ["Arbeit und Soziales"], ausschuesse: [], created_at: iso(24 * 3600e3), best_source_url: "https://example.org/d" };
  const mf = matching.matchedFeatures(matching.profileFeatures(profile), matching.knowledgeObjectFeatures(ko));
  const st = radarState.buildCurrentRadarState({ profile, decisions: [{ knowledge_object_id: "k", vorgang_id: "v", score: 50, matched_features: mf }], kosById: { k: ko }, knowledgeObjects: [ko], sourcesByVorgang: {}, now: nowDate });
  check("7 Reine Themen-/Titelnennung ohne ausschuesse-Feld -> KEIN Ausschuss-Reiter", !st.environment.committees.some((e) => e.vorgangId === "v"));
}

// =============================================================================
// 8) Konsistenz: Dedup + sichtbare Zahl == belegte Liste
// =============================================================================
{
  const r = runCommittee({ profileFields: { committee: "Arbeit und Soziales" }, ausschuesse: ["Ausschuss für Arbeit und Soziales"] });
  check("8 Genau ein belegter Ausschuss-Treffer -> environment.committees.length === 1", r.committeeCount === 1);
}
{
  const profile = { id: "p", fullName: "Test Person", committee: "Arbeit und Soziales" };
  const ko = { ...KOBASE, id: "k", vorgang_id: "v", ausschuesse: ["Ausschuss für Arbeit und Soziales"], created_at: iso(24 * 3600e3), best_source_url: "https://example.org/d" };
  const mf = matching.matchedFeatures(matching.profileFeatures(profile), matching.knowledgeObjectFeatures(ko));
  const decisions = [
    { knowledge_object_id: "k", vorgang_id: "v", score: 60, matched_features: mf },
    { knowledge_object_id: "k", vorgang_id: "v", score: 60, matched_features: mf }
  ];
  const st = radarState.buildCurrentRadarState({ profile, decisions, kosById: { k: ko }, knowledgeObjects: [ko], sourcesByVorgang: {}, now: nowDate });
  check("8b Dedup: derselbe Vorgang erscheint nur einmal im Ausschuss-Reiter", st.environment.committees.filter((e) => e.vorgangId === "v").length === 1);
}

// =============================================================================
// 9) Ranking-Neutralitaet (explizit gepinnt): normalizeCommittee/slugCommittee bleiben
//    UNVERAENDERT (speisen die Embedding-/Aehnlichkeits-Pipeline). committeeMatchKey ist
//    SEPARAT. Ein spaeteres Zusammenlegen wuerde die Ranking-Nebenwirkung reintroduzieren.
// =============================================================================
check("9 normalizeCommittee bleibt UNVERAENDERT (Ranking-Pfad): 'Menschenrechte...' weiterhin 'recht' (bekannte, bewusst nicht angefasste Alt-Kollision)",
  matching.normalizeCommittee("Menschenrechte und humanitäre Hilfe") === "recht");
check("9b committeeMatchKey ist SEPARAT und kollisionssicher: 'Menschenrechte...' -> 'menschenrechte'",
  matching.committeeMatchKey("Menschenrechte und humanitäre Hilfe") === "menschenrechte");
check("9c slugCommittee (Ranking) und committeeMatchKey (Beleg) liefern fuer den Kollisionsfall UNTERSCHIEDLICHE Werte (Beweis der Trennung)",
  matching.slugCommittee("Menschenrechte und humanitäre Hilfe") !== matching.committeeMatchKey("Menschenrechte und humanitäre Hilfe"));
check("9d Fuer Arbeit-und-Soziales (kein Kollisionsfall) liefern beide Funktionen DASSELBE Ergebnis",
  matching.slugCommittee("Ausschuss für Arbeit und Soziales") === matching.committeeMatchKey("Ausschuss für Arbeit und Soziales"));

// =============================================================================
// 10) Regression: Partei/Wahlkreis unveraendert durch die Ausschuss-Aenderung
// =============================================================================
{
  const profile = { id: "p", fullName: "Test Person", party: "Die Linke", committee: "Arbeit und Soziales", constituency: "Salzgitter-Wolfenbüttel" };
  const koParty = { ...KOBASE, id: "kp", vorgang_id: "vp", display_title: "Die Linke fordert Reform", parteien: ["Die Linke"], created_at: iso(3600e3), best_source_url: "https://example.org/p" };
  const koRegion = { ...KOBASE, id: "kr", vorgang_id: "vr", display_title: "Investitionen im Wahlkreis", mentioned_locations: ["Salzgitter-Wolfenbüttel"], created_at: iso(3600e3), best_source_url: "https://example.org/r" };
  const mfParty = matching.matchedFeatures(matching.profileFeatures(profile), matching.knowledgeObjectFeatures(koParty));
  const decisions = [
    { knowledge_object_id: "kp", vorgang_id: "vp", score: 60, matched_features: mfParty },
    { knowledge_object_id: "kr", vorgang_id: "vr", score: 58, matched_features: [{ type: "wahlkreis", value: "Salzgitter-Wolfenbüttel" }] }
  ];
  const st = radarState.buildCurrentRadarState({ profile, decisions, kosById: { kp: koParty, kr: koRegion }, knowledgeObjects: [koParty, koRegion], sourcesByVorgang: { vp: [{ source_type: "party", url: "https://example.org/p", published_at: iso(3600e3) }] }, now: nowDate });
  check("10 Partei-Segment unveraendert funktionsfaehig (unabhaengig von Ausschuss-Fix)", st.environment.party.some((e) => e.vorgangId === "vp"));
  check("10b Wahlkreis-Segment unveraendert funktionsfaehig (unabhaengig von Ausschuss-Fix)", st.environment.constituency.some((e) => e.vorgangId === "vr"));
}

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Radar-Ausschuss-Normalisierungs-Assertions`);
process.exit(failed > 0 ? 1 : 0);
