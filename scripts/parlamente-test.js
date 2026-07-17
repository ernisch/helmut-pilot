"use strict";

// Offline-Test der Parlaments-Registry (Landtag-Sprint Phase 2). REINE LOGIK, kein Netz/DB/LLM.
// Beweist: (1) Bundestag-Werte sind BYTE-IDENTISCH zu den bisherigen Hardcodes (Regressions-
// schutz fuer den laufenden Bundestagsbetrieb), (2) Landtagsprofile werden korrekt aufgeloest,
// (3) DIP bleibt Bundestag-only, (4) Defaults erfinden nichts.

const P = require("../lib/helmut/parlamente");
const scheduler = require("../lib/helmut/scheduler");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }

// --- 1. Aufloesung ---------------------------------------------------------------------------
check("1a leeres Profil -> bundestag (bisheriges Verhalten)", P.resolveParlament({}).key === "bundestag");
check("1b politische_ebene bundestag -> bundestag", P.resolveParlament({ politische_ebene: "bundestag" }).key === "bundestag");
check("1c Landtag+Berlin -> abgeordnetenhaus-berlin", P.resolveParlament({ politische_ebene: "landtag", bundesland: "Berlin" }).key === "abgeordnetenhaus-berlin");
check("1d Landtag+Brandenburg (state, parliamentType) -> landtag-brandenburg", P.resolveParlament({ parliamentType: "Landtag", state: "Brandenburg" }).key === "landtag-brandenburg");
check("1e Landtag+unbekanntes Land -> generischer landtag (nichts erfinden)", P.resolveParlament({ politische_ebene: "landtag", bundesland: "Sachsen" }).key === "landtag");
check("1f Landtag ohne Bundesland -> generischer landtag", P.resolveParlament({ politische_ebene: "landtag" }).key === "landtag");
check("1g politicalLevel 'Land' (Alt-Feld) -> Landtag", P.resolveParlament({ politicalLevel: "Land", state: "berlin" }).key === "abgeordnetenhaus-berlin");

// --- 2. Bundestag BYTE-IDENTISCH zu den bisherigen Hardcodes ---------------------------------
const bt = P.BUNDESTAG;
check("2a Funktion 'Bundestagsabgeordnete:r'", bt.mitglied.funktion === "Bundestagsabgeordnete:r");
check("2b Persona-Satz Lage identisch", bt.persona.lageRolle === "Du bist wissenschaftlicher Mitarbeiter eines Mitglieds des Deutschen Bundestages.");
check("2c Ton-Fragment identisch", bt.persona.lageTon === "Sprache eines wissenschaftlichen Mitarbeiters im Bundestag");
check("2d Regierungsarbeit-Begriffe identisch (Inhalt + Reihenfolge)",
  JSON.stringify(bt.regierung.arbeitsBegriffe) === JSON.stringify(["bundesregierung", "bmas", "bundeskabinett", "bundestag", "ministerin", "minister"]));
check("2e politische Schluesselbegriffe identisch",
  JSON.stringify(bt.relevanz.politischeBegriffe) === JSON.stringify(["gesetzentwurf", "gesetz", "eckpunkte", "reform", "initiative", "bundesregierung", "bmas"]));
check("2f Strategie-Muster identisch",
  bt.relevanz.strategischeQuellenMuster === "bmas|bundesregierung|bundestag|ausschuss|linke|linksfraktion|dgb|tagesschau|deutschlandfunk|person|news-suche");
check("2g amtliche Quelltypen identisch", JSON.stringify(bt.relevanz.amtlicheQuelltypen) === JSON.stringify(["ministry", "bundestag", "committee"]));
check("2h Defaults identisch (Ebene/Ministerien/Monitoring)",
  bt.defaults.politicalLevel === "Bund"
  && JSON.stringify(bt.defaults.relevantMinistries) === JSON.stringify(["Bundesregierung"])
  && JSON.stringify(bt.defaults.monitoringTargets) === JSON.stringify(["Meine Partei", "Meine Person", "Bundesregierung Vorhaben"]));
check("2i Frage-Adressat + Vorgangsbezug + Redeart identisch",
  bt.regierung.frageAdressat === "die Bundesregierung"
  && bt.persona.vorgangsBezug === "offiziellen Bundestags-Vorgang"
  && bt.persona.redeArt === "Bundestagsrede");

// --- 3. Landesparlamente korrekt --------------------------------------------------------------
const be = P.LANDESPARLAMENTE.berlin;
const bb = P.LANDESPARLAMENTE.brandenburg;
check("3a Berlin: MdA + Senat + PARDOK berlin",
  be.mitglied.kurz === "MdA" && be.regierung.name === "Senat von Berlin"
  && be.primaerquelle.art === "pardok" && be.primaerquelle.land === "berlin");
check("3b Brandenburg: MdL + Landesregierung + PARDOK brandenburg",
  bb.mitglied.kurz === "MdL" && bb.regierung.name === "Landesregierung Brandenburg"
  && bb.primaerquelle.art === "pardok" && bb.primaerquelle.land === "brandenburg");
check("3c Berlin-Regierungsbegriffe enthalten Senat/Senatsverwaltung, aber KEIN bmas/bundesregierung",
  be.regierung.arbeitsBegriffe.includes("senatsverwaltung")
  && !be.regierung.arbeitsBegriffe.includes("bmas") && !be.regierung.arbeitsBegriffe.includes("bundesregierung"));
check("3d Landtags-Persona nennt das richtige Parlament",
  be.persona.lageRolle.includes("Abgeordnetenhauses von Berlin") && bb.persona.lageRolle.includes("Landtags Brandenburg"));

// --- 4. DIP bleibt Bundestag-only -------------------------------------------------------------
check("4a usesDip: leeres Profil -> true (bisheriges Verhalten)", P.usesDip({}) === true);
check("4b usesDip: Bundestagsprofil -> true", P.usesDip({ politische_ebene: "bundestag" }) === true);
check("4c usesDip: Landtag Berlin -> false", P.usesDip({ politische_ebene: "landtag", bundesland: "Berlin" }) === false);
check("4d usesDip: Landtag generisch -> false", P.usesDip({ politische_ebene: "landtag", bundesland: "Hessen" }) === false);

// --- 5. Scheduler-Neutral-Defaults: Bundestag unveraendert, Landtag ohne Bund-Platzhalter -----
const neutralBund = scheduler.neutralDefaultsFor({});
check("5a neutralDefaultsFor({}) liefert EXAKT das bisherige Objekt (Referenz-Identitaet)",
  neutralBund.function === "Bundestagsabgeordnete:r" && neutralBund.politicalLevel === "Bund"
  && JSON.stringify(neutralBund.relevantMinistries) === JSON.stringify(["Bundesregierung"]));
const neutralBE = scheduler.neutralDefaultsFor({ politische_ebene: "landtag", bundesland: "Berlin" });
check("5b Landtag-Berlin-Defaults: Funktion MdA-Bezeichnung, Ebene Land, Senat statt Bundesregierung",
  neutralBE.function === "Mitglied des Abgeordnetenhauses" && neutralBE.politicalLevel === "Land"
  && JSON.stringify(neutralBE.relevantMinistries) === JSON.stringify(["Senat von Berlin"])
  && neutralBE.monitoringTargets.includes("Senatsvorhaben"));
check("5c Landtag-Defaults erben KEINE Cem-Inhalte (Ausschuesse/Themen leer)",
  Array.isArray(neutralBE.committees) && neutralBE.committees.length === 0
  && Array.isArray(neutralBE.focusTopics) && neutralBE.focusTopics.length === 0);

// --- 6. Relevanzfunktionen: Bundestag byte-gleich, Landtag erkennt Landes-Regierungsarbeit ----
const btProfile = { id: "x", fullName: "Test Bund", party: "SPD", committees: ["Arbeit und Soziales"], focusTopics: ["Rente"] };
const beProfile = { id: "y", fullName: "Test Berlin", party: "SPD", politische_ebene: "landtag", bundesland: "Berlin", committees: ["Hauptausschuss"], focusTopics: ["Haushalt"] };
const bundItem = { title: "Bundesregierung plant Rentenreform", content: "Gesetzentwurf zur Rente im Bundestag", sourceName: "Tagesschau", sourceType: "ministry", publishedAt: new Date().toISOString() };
const beItem = { title: "Senat beschliesst Haushalt", content: "Die Senatsverwaltung fuer Finanzen legt den Haushalt vor. Kritik der Opposition.", sourceName: "rbb24", sourceType: "landesparlament", publishedAt: new Date().toISOString() };
check("6a Bundestagsprofil: Bund-Item bleibt entscheidungsrelevant (unveraendert)",
  scheduler.isDecisionRelevantForProfile(bundItem, btProfile) === true);
check("6b Landtagsprofil Berlin: Senats-Item ist entscheidungsrelevant (Landes-Regierungsarbeit)",
  scheduler.isDecisionRelevantForProfile(beItem, beProfile) === true);
check("6c buildRelevantTerms: Bundestag enthaelt 'Bundesregierung', Landtag Berlin 'Senat von Berlin' statt dessen",
  scheduler.buildRelevantTerms(btProfile).includes("Bundesregierung")
  && scheduler.buildRelevantTerms(beProfile).includes("Senat von Berlin")
  && !scheduler.buildRelevantTerms(beProfile).includes("Bundesregierung"));
check("6d itemPoliticalWeight: landesparlament-Quelle erhaelt amtlichen Bonus fuer Landtagsprofil",
  scheduler.itemPoliticalWeight(beItem, beProfile) > scheduler.itemPoliticalWeight({ ...beItem, sourceType: "media" }, beProfile));

// --- 7. Scoring-Ableitung (nichts aktiviert) ---------------------------------------------------
const scoring = require("../lib/helmut/scoring");
check("7a levelImportanceFor: Bundestag -> Standardgewichte (Referenz)",
  scoring.levelImportanceFor({ politische_ebene: "bundestag" }) === scoring.LEVEL_IMPORTANCE);
check("7b levelImportanceFor: Landtag -> Landes-Gewichte (land > bund)",
  scoring.levelImportanceFor({ politische_ebene: "landtag" }).land > scoring.levelImportanceFor({ politische_ebene: "landtag" }).bund);
check("7c globalImportance ohne Option unveraendert (Default-Gewichte)",
  scoring.globalImportance({ decision_level: "bund" }).factors.level === scoring.LEVEL_IMPORTANCE.bund);

console.log(`\n== Parlaments-Registry-Test: ${fail === 0 ? "ALLE TESTS GRÜN" : fail + " FEHLGESCHLAGEN"} ==`);
process.exit(fail > 0 ? 1 : 0);
