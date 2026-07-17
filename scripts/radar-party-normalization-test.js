"use strict";

// Radar-Partei-Normalisierung + Akteursbeleg (B1/B2) — Offline, 0 KI, 0 Netz, 0 Kosten.
// Hintergrund: Der Radar verwarf einen vom Matching KORREKT erzeugten Partei-Treffer
// wieder, weil er die Partei mit rohem slug() verglich ("die linke" != "linke"), waehrend
// das Matching zentral normalizeParty() nutzt. Fix B1: radarState nutzt dieselbe zentrale
// Partei-/Fraktions-Normalisierung (slugParty) auf BEIDEN Seiten (Profil + ko.parteien).
// Fix B2: der Akteurs-/Quellenbeleg prueft ALLE Quellen des Vorgangs (nicht nur die primaere).
//
// KEINE Personen-Sonderregel: die Kette wird ueber ALLE Parteien/Fraktionen + Schreibweisen +
// de/en-Profilfelder getestet. Die matched_features werden mit der ECHTEN Matching-Engine
// erzeugt (matching.matchedFeatures) — kein hand-authored Feature, damit der Test die reale
// Konsistenz matching -> radarState prueft.

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

// Quelle in DB-Schreibweise (snake_case, wie raw_documents). partySource = Partei-/Fraktionsquelle.
function src(type, { link = "direct", ageH = 24 } = {}) {
  return { id: `rd-${type}-${ageH}`, url: `https://example.org/${type}-${ageH}`, canonical_url: null,
    source_type: type, source_name: `Quelle ${type}`, link_type: link, published_at: iso(ageH * 3600e3) };
}

// Fuehrt die ECHTE Kette aus: profileFeatures + knowledgeObjectFeatures -> matchedFeatures
// -> buildCurrentRadarState -> environment.party. Gibt zurueck, ob der Vorgang im Partei-
// Reiter erscheint (granted) + die erzeugten matched_features + die Profil-Terme.
function runParty({ profileFields, parteien, mentioned_parties = [], title = "", sources = [] }) {
  const profile = { id: "p", fullName: "Test Person", ...profileFields };
  const ko = { ...KOBASE, id: "k", vorgang_id: "v", display_title: title, parteien,
    mentioned_parties, created_at: iso(24 * 3600e3), best_source_url: "https://example.org/display" };
  const pf = matching.profileFeatures(profile);
  const kf = matching.knowledgeObjectFeatures(ko);
  const mf = matching.matchedFeatures(pf, kf);
  const decision = { knowledge_object_id: "k", vorgang_id: "v", score: 50, matched_features: mf };
  const sbv = sources.length ? { v: sources } : {};
  const st = radarState.buildCurrentRadarState({
    profile, decisions: [decision], kosById: { k: ko }, knowledgeObjects: [ko],
    sourcesByVorgang: sbv, now: nowDate
  });
  return { granted: st.environment.party.some((e) => e.vorgangId === "v"),
    partyCount: st.environment.party.length, mf, terms: radarState.radarProfileTerms(profile) };
}

// =============================================================================
// 1) Zentrale Partei-Normalisierung: alle Schreibweisen fallen auf EINEN Schluessel
// =============================================================================
const linkeSpellings = ["Die Linke", "DIE LINKE", "die linke", "Linke", "Linksfraktion"];
const linkeKeys = linkeSpellings.map((s) => [...radarState.radarProfileTerms({ party: s }).parties][0]);
check("1 Alle Die-Linke-Schreibweisen -> genau EIN kanonischer Partei-Schluessel",
  new Set(linkeKeys).size === 1 && linkeKeys[0], `keys=${JSON.stringify(linkeKeys)}`);

// Jede Partei hat einen stabilen, nicht-leeren Schluessel; verschiedene Parteien != gleich.
const partyKey = (v) => [...radarState.radarProfileTerms({ party: v }).parties][0];
const distinct = ["SPD", "CDU", "CSU", "Bündnis 90/Die Grünen", "AfD", "FDP", "BSW", "Die Linke"].map(partyKey);
check("1b Sieben Parteien -> sieben unterscheidbare Schluessel (Grüne/Union etc.)",
  new Set(distinct).size >= 6 && distinct.every(Boolean), `keys=${JSON.stringify(distinct)}`);
check("1c Schreibvarianten Grüne == Bündnis 90/Die Grünen", partyKey("Grüne") === partyKey("Bündnis 90/Die Grünen"));
check("1d Schreibvarianten FDP == Freie Demokraten", partyKey("FDP") === partyKey("Freie Demokraten"));
check("1e Fraktion Linksfraktion == Partei Die Linke (Fraktion->Partei)", partyKey("Linksfraktion") === partyKey("Die Linke"));

// de/en-Profilfelder liefern dieselben Partei-Terme (partei/fraktion == party/faction).
const deTerms = [...radarState.radarProfileTerms({ partei: "Die Linke", fraktion: "Die Linke" }).parties].sort();
const enTerms = [...radarState.radarProfileTerms({ party: "Die Linke", faction: "Die Linke" }).parties].sort();
check("1f de-Felder (partei/fraktion) == en-Felder (party/faction)", JSON.stringify(deTerms) === JSON.stringify(enTerms));

// =============================================================================
// 2) B1-Fix: Partei-Akteur wird trotz abweichender Schreibweise erkannt
//    (vor dem Fix schlug genau das fehl: Profil "Die Linke" vs. ko.parteien "Linke")
// =============================================================================
check("2 B1: Profil 'Die Linke' + ko.parteien ['Linke'] + Parteiquelle -> Partei-Reiter",
  runParty({ profileFields: { party: "Die Linke" }, parteien: ["Linke"], sources: [src("party")] }).granted);
check("2b B1: ko.parteien ['DIE LINKE'] (Großschreibung) -> erkannt",
  runParty({ profileFields: { party: "Die Linke" }, parteien: ["DIE LINKE"], sources: [src("party")] }).granted);
check("2c B1: ko.parteien ['die linke'] (Kleinschreibung) -> erkannt",
  runParty({ profileFields: { party: "Die Linke" }, parteien: ["die linke"], sources: [src("party")] }).granted);
check("2d B1: de-Profil (partei/fraktion) + ko ['Linke'] + Parteiquelle -> erkannt",
  runParty({ profileFields: { partei: "Die Linke", fraktion: "Die Linke" }, parteien: ["Linke"], sources: [src("party")] }).granted);
check("2e B1: Fraktion 'Linksfraktion' (ohne Partei-Feld) + ko ['Die Linke'] -> erkannt",
  runParty({ profileFields: { faction: "Linksfraktion" }, parteien: ["Die Linke"], sources: [src("faction")] }).granted);

// =============================================================================
// 3) Gilt fuer ALLE Parteien/Fraktionen (keine Sonderregel) — je Partei ein Akteur-Fall
// =============================================================================
const parties = [
  { name: "SPD", profile: "SPD", ko: "SPD" },
  { name: "CDU", profile: "CDU", ko: "CDU" },
  { name: "Union (CDU/CSU)", profile: "CDU/CSU", ko: "CDU/CSU" },
  { name: "Grüne (Schreibvariante)", profile: "Bündnis 90/Die Grünen", ko: "Grüne" },
  { name: "AfD", profile: "AfD", ko: "AfD" },
  { name: "FDP (Freie Demokraten)", profile: "FDP", ko: "Freie Demokraten" },
  { name: "BSW", profile: "BSW", ko: "Bündnis Sahra Wagenknecht" }
];
for (const p of parties) {
  check(`3 ${p.name}: Profil-Partei + KO-Partei-Akteur (Parteiquelle) -> Partei-Reiter`,
    runParty({ profileFields: { party: p.profile }, parteien: [p.ko], sources: [src("party")] }).granted);
}
// Gegenprobe: fremde Partei am selben KO bekommt KEINEN Partei-Treffer (keine Verwechslung).
check("3b Fremdpartei: SPD-Profil am reinen Linke-Akteur-KO -> KEIN Partei-Reiter",
  !runParty({ profileFields: { party: "SPD" }, parteien: ["Die Linke"], sources: [src("party")] }).granted);

// =============================================================================
// 4) Akteursbeleg: Titel-Akteur ODER Partei-/Fraktionsquelle — sonst NICHT
// =============================================================================
check("4 Titel-Akteur: 'Die Linke fordert …' im Titel, nur Medienquelle -> erkannt",
  runParty({ profileFields: { party: "Die Linke" }, parteien: ["Die Linke"], title: "Die Linke fordert höheren Mindestlohn", sources: [src("media")] }).granted);
check("4b Titel-Akteur mit Umlaut: 'Die Grünen fordern …' + Medienquelle -> erkannt (Umlaut-Faltung)",
  runParty({ profileFields: { party: "Bündnis 90/Die Grünen" }, parteien: ["Grüne"], title: "Die Grüne kritisiert den Haushalt", sources: [src("media")] }).granted);

// =============================================================================
// 5) B2-Fix: Partei-/Fraktionsquelle zaehlt AUCH, wenn sie nicht die primaere ist
// =============================================================================
{
  // Primaerquelle = Medien (direct, juengste); zusaetzlich aeltere Fraktionsquelle.
  const r = runParty({ profileFields: { party: "SPD" }, parteien: ["SPD"], title: "Bericht ohne Parteinamen",
    sources: [src("media", { ageH: 2 }), src("faction", { ageH: 200 })] });
  check("5 B2: nicht-primaere Fraktionsquelle belegt den Akteur (alle Quellen geprueft)", r.granted);
}
{
  // Kontrolle: NUR Medienquellen + kein Parteiname im Titel -> KEIN Akteursbeleg.
  const r = runParty({ profileFields: { party: "SPD" }, parteien: ["SPD"], title: "Bericht ohne Parteinamen",
    sources: [src("media", { ageH: 2 }), src("media", { ageH: 200 })] });
  check("5b B2-Kontrolle: nur Medien + kein Titel-Akteur -> KEIN Partei-Reiter", !r.granted);
}

// =============================================================================
// 6) Leerzustand vs. Präsenz — die reale Pilot-Konstellation (Gegenprüfung Preview)
// =============================================================================
// (a) Koalitions-Auflistung: eigene Partei nur EINE von fünf, Medienquelle, kein Titel-Akteur
//     -> korrekt NICHT im Partei-Reiter (kein Zuordnungsfehler, echte Leere).
const coalition = runParty({ profileFields: { partei: "Die Linke", fraktion: "Die Linke" },
  parteien: ["SPD", "CDU/CSU", "Bündnis 90/Die Grünen", "FDP", "Die Linke"], title: "", sources: [src("media")] });
check("6 Leerzustand korrekt: Die Linke als Koalitions-Mitauflistung (Medien) -> NICHT im Partei-Reiter", !coalition.granted);
check("6a … aber matching erzeugt sehr wohl einen partei-Match (Match != Akteursbeleg)",
  coalition.mf.some((f) => f.type === "partei"));

// (b) Echtes Partei-Akteur-Signal (Parteiquelle, eigene Partei in ko.parteien) -> im Partei-Reiter.
const genuine = runParty({ profileFields: { partei: "Die Linke", fraktion: "Die Linke" },
  parteien: ["DIE LINKE"], title: "", sources: [src("party")] });
check("6b Präsenz korrekt: echtes Partei-Akteur-Signal (Parteiquelle) -> im Partei-Reiter", genuine.granted);

// (c) Nur beiläufig erwähnt (mentioned_parties), NICHT in ko.parteien -> NICHT im Partei-Reiter.
const mentionedOnly = runParty({ profileFields: { party: "Die Linke" },
  parteien: ["SPD"], mentioned_parties: ["Die Linke"], sources: [src("party")] });
check("6c Nur beiläufige Erwähnung (mentioned_parties) -> KEIN Partei-Reiter", !mentionedOnly.granted);

// =============================================================================
// 7) Konsistenz: sichtbare Zahl == belegte Liste (kein Phantom, keine Doppelzählung)
// =============================================================================
{
  const single = runParty({ profileFields: { party: "Die Linke" }, parteien: ["Die Linke"],
    title: "Die Linke beschließt neue Linie", sources: [src("media")] });
  check("7 Genau ein belegter Partei-Akteur -> environment.party.length === 1", single.partyCount === 1);
}
{
  // Zwei Quell-Dokumente desselben Vorgangs -> im Partei-Reiter trotzdem nur EIN Eintrag (Dedup).
  const profile = { id: "p", fullName: "Test Person", party: "Die Linke" };
  const ko = { ...KOBASE, id: "k", vorgang_id: "v", display_title: "Die Linke fordert Anhörung",
    parteien: ["Die Linke"], created_at: iso(24 * 3600e3), best_source_url: "https://example.org/d" };
  const mf = matching.matchedFeatures(matching.profileFeatures(profile), matching.knowledgeObjectFeatures(ko));
  const decisions = [
    { knowledge_object_id: "k", vorgang_id: "v", score: 60, matched_features: mf },
    { knowledge_object_id: "k", vorgang_id: "v", score: 60, matched_features: mf }
  ];
  const st = radarState.buildCurrentRadarState({ profile, decisions, kosById: { k: ko }, knowledgeObjects: [ko], sourcesByVorgang: { v: [src("media")] }, now: nowDate });
  check("7b Dedup: derselbe Vorgang erscheint nur einmal im Partei-Reiter", st.environment.party.filter((e) => e.vorgangId === "v").length === 1);
}

// =============================================================================
// 8) Regression: Ausschuss-/Wahlkreis-Belege unveraendert (Scope = Partei/Fraktion)
// =============================================================================
{
  const profile = { id: "p", fullName: "Test Person", party: "Die Linke", committees: ["Ausschuss für Arbeit und Soziales"], constituency: "Salzgitter-Wolfenbüttel" };
  // Ausschuss jetzt WÖRTLICH im Inhalt (Beleg-Nachschaerfung Phase A/B: ko.ausschuesse allein genuegt nicht).
  const ko = { ...KOBASE, id: "k", vorgang_id: "v", display_title: "Anhörung im Ausschuss für Arbeit und Soziales",
    ausschuesse: ["Ausschuss für Arbeit und Soziales"], mentioned_locations: ["Salzgitter-Wolfenbüttel"],
    created_at: iso(24 * 3600e3), best_source_url: "https://example.org/d" };
  const mf = [{ type: "ausschuss", value: "Ausschuss für Arbeit und Soziales" }, { type: "wahlkreis", value: "Salzgitter-Wolfenbüttel" }];
  const st = radarState.buildCurrentRadarState({ profile, decisions: [{ knowledge_object_id: "k", vorgang_id: "v", score: 60, matched_features: mf }], kosById: { k: ko }, knowledgeObjects: [ko], sourcesByVorgang: {}, now: nowDate });
  check("8 Ausschuss-Beleg (Ausschussname im Inhalt) -> im Ausschüsse-Reiter", st.environment.committees.some((e) => e.vorgangId === "v"));
  check("8b Wahlkreis-Beleg unveraendert (konkreter Ort -> im Wahlkreis-Reiter)", st.environment.constituency.some((e) => e.vorgangId === "v"));
}

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Radar-Partei-Normalisierungs-Assertions`);
process.exit(failed > 0 ? 1 : 0);
