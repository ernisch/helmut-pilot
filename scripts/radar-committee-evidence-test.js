"use strict";

// Radar Ausschuss-/Wahlkreis-Beleg (Evidenz-Nachschaerfung, Phase A/B) — Offline, 0 KI, 0 Netz.
// Verbindliche Regel nach nicht bestandener Preview-Pruefung: ko.ausschuesse ALLEIN — auch in
// voller amtlicher Form — ist KEIN Ausschussbeleg. Die Understanding-Engine schreibt den Ausschuss
// nachweislich nur aus dem Politikfeld ab (real: 13/13 gezeigte Ausschuss-Vorgaenge nannten den
// Ausschuss NIE im Inhalt, hatten KEIN Ausschussdokument — reine BMAS-/Ministeriums-/Medien-
// meldungen). Belastbar ist read-time NUR: der VOLLE kuratierte Ausschussname steht WÖRTLICH im
// strukturierten Inhalt UND kein widersprechender Ebenen-/Institutionsmarker (Landtag/kommunal/
// Koalition). source_type 'bundestag'/'committee' zaehlt NICHT (im Bestand unspezifisch/unzuverlaessig).
//
// KEINE Sonderregel je Stichwort — gilt gleich fuer Arbeit-Soziales/Gesundheit/Landwirtschaft/…

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

// Echte Kette profileFeatures -> matchedFeatures -> buildCurrentRadarState -> environment.committees.
function runCommittee({ profileFields, ausschuesse, mentioned_committees = [], title = "", was_ist_passiert = "", warum_wichtig = "", docs = [] }) {
  const profile = { id: "p", fullName: "Test Person", ...profileFields };
  const ko = { ...KOBASE, id: "k", vorgang_id: "v", display_title: title, was_ist_passiert, warum_wichtig,
    ausschuesse, mentioned_committees, created_at: iso(24 * 3600e3), best_source_url: "https://example.org/d" };
  const mf = matching.matchedFeatures(matching.profileFeatures(profile), matching.knowledgeObjectFeatures(ko));
  const st = radarState.buildCurrentRadarState({ profile, decisions: [{ knowledge_object_id: "k", vorgang_id: "v", score: 50, matched_features: mf }],
    kosById: { k: ko }, knowledgeObjects: [ko], sourcesByVorgang: docs.length ? { v: docs } : {}, now: nowDate });
  return { granted: st.environment.committees.some((e) => e.vorgangId === "v") };
}
function runConstituency({ profileFields, mentioned_locations, docs = [] }) {
  const profile = { id: "p", fullName: "Test Person", ...profileFields };
  const ko = { ...KOBASE, id: "k", vorgang_id: "v", mentioned_locations, created_at: iso(24 * 3600e3), best_source_url: "https://example.org/d" };
  const mf = matching.matchedFeatures(matching.profileFeatures(profile), matching.knowledgeObjectFeatures(ko));
  const st = radarState.buildCurrentRadarState({ profile, decisions: [{ knowledge_object_id: "k", vorgang_id: "v", score: 50, matched_features: mf }],
    kosById: { k: ko }, knowledgeObjects: [ko], sourcesByVorgang: docs.length ? { v: docs } : {}, now: nowDate });
  return { granted: st.environment.constituency.some((e) => e.vorgangId === "v") };
}

// =============================================================================
// 1) Echter Bundestagsausschuss — Ausschussname WÖRTLICH im Inhalt
// =============================================================================
check("1 Ausschussname im Inhalt ('Ausschuss für Arbeit und Soziales berät …') -> erkannt",
  runCommittee({ profileFields: { committee: "Arbeit und Soziales", politicalLevel: "Bund" }, ausschuesse: ["Ausschuss für Arbeit und Soziales"],
    was_ist_passiert: "Der Ausschuss für Arbeit und Soziales berät den Gesetzentwurf zum Bürgergeld." }).granted);
check("1b Ausschussname im Titel -> erkannt",
  runCommittee({ profileFields: { committee: "Arbeit und Soziales", politicalLevel: "Bund" }, ausschuesse: ["Ausschuss für Arbeit und Soziales"],
    title: "Anhörung im Ausschuss für Arbeit und Soziales" }).granted);

// =============================================================================
// 2) BMAS-Quelle OHNE Ausschussbezug — Ministerium != Ausschuss (der reale Kernfehler)
// =============================================================================
check("2 BMAS-Meldung, Ausschuss NUR in ko.ausschuesse (aus Politikfeld abgeschrieben), Ministerium im Inhalt -> NICHT erkannt",
  !runCommittee({ profileFields: { committee: "Arbeit und Soziales", politicalLevel: "Bund" }, ausschuesse: ["Ausschuss für Arbeit und Soziales"],
    title: "BMAS legt Modelle zur Förderung längeren Arbeitslebens vor",
    was_ist_passiert: "Das Bundesministerium für Arbeit und Soziales (BMAS) hat Maßnahmen vorgestellt.",
    docs: [{ source_type: "ministry", source_name: "BMAS", url: "https://www.bmas.de/x" }] }).granted);
check("2b 'Bundesministerium für Arbeit und Soziales' im Inhalt matcht NICHT die Ausschuss-Form",
  !runCommittee({ profileFields: { committee: "Arbeit und Soziales", politicalLevel: "Bund" }, ausschuesse: ["Ausschuss für Arbeit und Soziales"],
    was_ist_passiert: "Das Bundesministerium für Arbeit und Soziales hat eine Ausschreibung veröffentlicht." }).granted);

// =============================================================================
// 3) Kommunaler Sozialausschuss — andere Ebene
// =============================================================================
check("3 Kommunaler Sozialausschuss (Landkreis-Kontext) -> NICHT als Bundestagsausschuss",
  !runCommittee({ profileFields: { committee: "Arbeit und Soziales", politicalLevel: "Bund" }, ausschuesse: ["Sozialausschuss"],
    title: "Landkreis führt bezahlte Nachbarschaftshilfe ein",
    was_ist_passiert: "Ein Landkreis hat ein Konzept im kommunalen Sozialausschuss beschlossen." }).granted);
check("3b Sogar der VOLLE Name, aber im kommunalen Kontext -> NICHT (Ebenen-Marker 'kommunal' widerspricht)",
  !runCommittee({ profileFields: { committee: "Arbeit und Soziales", politicalLevel: "Bund" }, ausschuesse: ["Ausschuss für Arbeit und Soziales"],
    was_ist_passiert: "Der kommunale Ausschuss für Arbeit und Soziales in Musterstadt hat getagt." }).granted);

// =============================================================================
// 4) Koalitionsausschuss — keine Parlaments-/Fachausschuss-Ebene
// =============================================================================
check("4 Koalitionsausschuss-Reformpaket -> NICHT als Fachausschuss",
  !runCommittee({ profileFields: { committee: "Arbeit und Soziales", politicalLevel: "Bund" },
    ausschuesse: ["Arbeits- und Sozialausschuss"], mentioned_committees: ["Koalitionsausschuss"],
    title: "Koalitionsausschuss einigt sich auf Reformpaket",
    was_ist_passiert: "Der Koalitionsausschuss von Union und SPD hat ein Reformpaket vereinbart." }).granted);
check("4b Selbst mit voller Ausschuss-Form im Inhalt, aber 'Koalitionsausschuss' präsent -> NICHT",
  !runCommittee({ profileFields: { committee: "Arbeit und Soziales", politicalLevel: "Bund" }, ausschuesse: ["Ausschuss für Arbeit und Soziales"],
    was_ist_passiert: "Der Koalitionsausschuss verwies das Thema an den Ausschuss für Arbeit und Soziales." }).granted);

// =============================================================================
// 5) Landtagsausschuss vs. Bundestagsprofil — Ebenentrennung (beide Richtungen)
// =============================================================================
check("5 Landtagsausschuss (Inhalt nennt Landtag) -> NICHT fuer ein Bundestag-Profil",
  !runCommittee({ profileFields: { committee: "Arbeit und Soziales", politicalLevel: "Bund" }, ausschuesse: ["Ausschuss für Arbeit und Soziales"],
    was_ist_passiert: "Der Ausschuss für Arbeit und Soziales des Landtags hat beraten." }).granted);
check("5b Landtagsausschuss fuer ein LANDTAG-Profil (Ausschuss + Landtag + Fachbezug im Inhalt) -> erkannt",
  runCommittee({ profileFields: { committee: "Arbeit und Soziales", politische_ebene: "landtag" }, ausschuesse: ["Ausschuss für Arbeit und Soziales"],
    was_ist_passiert: "Der Ausschuss für Arbeit und Soziales des Landtags hat den Antrag beraten." }).granted);
check("5c Bundestagsausschuss fuer ein LANDTAG-Profil -> NICHT (falsche Ebene)",
  !runCommittee({ profileFields: { committee: "Arbeit und Soziales", politische_ebene: "landtag" }, ausschuesse: ["Ausschuss für Arbeit und Soziales"],
    was_ist_passiert: "Der Ausschuss für Arbeit und Soziales des Bundestags hat beraten." }).granted);

// =============================================================================
// 6) Reines Sozialthema / reines Gesundheitsthema — kein Ausschussbeleg
// =============================================================================
check("6 Reines Sozialthema (Rente/Arbeit) ohne Ausschussnennung -> NICHT",
  !runCommittee({ profileFields: { committee: "Arbeit und Soziales", politicalLevel: "Bund" }, ausschuesse: ["Ausschuss für Arbeit und Soziales"],
    title: "Bund legt Regelungen für Renteneintritt bis 70 vor",
    was_ist_passiert: "Eine Veröffentlichung zeigt, ab welchem Alter Rentner künftig in Rente gehen." }).granted);
check("6b Reines Gesundheitsthema (GKV) ohne Ausschussnennung -> NICHT",
  !runCommittee({ profileFields: { committee: "Gesundheit", politicalLevel: "Bund" }, ausschuesse: ["Ausschuss für Gesundheit"],
    title: "Bund plant GKV-Zuzahlungsregel, die Rentner stärker belastet",
    was_ist_passiert: "Eine geplante GKV-Reform enthält eine Zuzahlungsregelung." }).granted);
check("6c Gesundheit MIT Ausschussname im Inhalt -> erkannt (gleiche Regel wie Sozial)",
  runCommittee({ profileFields: { committee: "Gesundheit", politicalLevel: "Bund" }, ausschuesse: ["Ausschuss für Gesundheit"],
    was_ist_passiert: "Der Ausschuss für Gesundheit hat die GKV-Novelle beraten." }).granted);

// =============================================================================
// 7) source_type ist KEIN Ausschussbeleg (weder 'bundestag' noch 'committee')
// =============================================================================
check("7 Kurzform + source_type 'bundestag', aber Name NICHT im Inhalt -> NICHT (Quelle allein kein Beleg)",
  !runCommittee({ profileFields: { committee: "Arbeit und Soziales", politicalLevel: "Bund" }, ausschuesse: ["Sozialausschuss"],
    was_ist_passiert: "Bericht zur Arbeitsmarktlage.", docs: [{ source_type: "bundestag", source_name: "Bundestag", url: "https://dip.bundestag.de/x" }] }).granted);
check("7b source_type 'committee' (im Bestand unzuverlaessig) -> KEIN Beleg",
  !runCommittee({ profileFields: { committee: "Arbeit und Soziales", politicalLevel: "Bund" }, ausschuesse: ["Ausschuss für Arbeit und Soziales"],
    was_ist_passiert: "Medienbericht ohne Gremiennennung.", docs: [{ source_type: "committee", source_name: "Lebenshilfe", url: "https://www.lebenshilfe.de/x" }] }).granted);

// =============================================================================
// 8) Gleicher Ausschussname auf verschiedenen Ebenen — keine Verwechslung
// =============================================================================
check("8 Bund/Bund (Name im Inhalt, kein Ebenen-Widerspruch) -> Treffer",
  runCommittee({ profileFields: { committee: "Arbeit und Soziales", politicalLevel: "Bund" }, ausschuesse: ["Ausschuss für Arbeit und Soziales"],
    was_ist_passiert: "Der Ausschuss für Arbeit und Soziales hat abgestimmt." }).granted);
check("8b Fremder Ausschuss (Gesundheit-Profil, Arbeit-Ausschuss im Inhalt) -> kein Treffer",
  !runCommittee({ profileFields: { committee: "Gesundheit", politicalLevel: "Bund" }, ausschuesse: ["Ausschuss für Arbeit und Soziales"],
    was_ist_passiert: "Der Ausschuss für Arbeit und Soziales hat getagt." }).granted);

// =============================================================================
// 9-12) Wahlkreis — konkreter Geografiebeleg (unveraendert gueltig)
// =============================================================================
check("9 Konkreter Wahlkreisort in mentioned_locations -> Wahlkreis-Reiter",
  runConstituency({ profileFields: { constituency: "Salzgitter-Wolfenbüttel", regionalInterests: ["Niedersachsen", "Salzgitter", "Salzgitter-Wolfenbüttel"] },
    mentioned_locations: ["Salzgitter-Wolfenbüttel"] }).granted);
check("9b Zugehörige Kommune -> Wahlkreis-Reiter",
  runConstituency({ profileFields: { constituency: "Salzgitter-Wolfenbüttel", regionalInterests: ["Niedersachsen", "Salzgitter"] },
    mentioned_locations: ["Salzgitter"] }).granted);
check("10 Bundesland allein (Niedersachsen) -> NICHT (der reale Bovenschulte-Fall)",
  !runConstituency({ profileFields: { constituency: "Salzgitter-Wolfenbüttel", regionalInterests: ["Niedersachsen", "Salzgitter-Wolfenbüttel"] },
    mentioned_locations: ["Europa", "Bundesrepublik Deutschland", "Niedersachsen"], docs: [{ source_type: "bundestag", source_name: "Bundesrat", url: "https://www.bundesrat.de/x" }] }).granted);
check("10b Jedes der 16 Bundeslaender allein -> NICHT (allgemeingueltig)",
  ["Bayern", "Berlin", "Nordrhein-Westfalen", "Sachsen"].every((land) =>
    !runConstituency({ profileFields: { constituency: "Irgendein Wahlkreis", regionalInterests: [land] }, mentioned_locations: [land] }).granted));
check("11 Bundesrats-Quelle ohne konkreten Ort -> KEIN Wahlkreis-Treffer",
  !runConstituency({ profileFields: { constituency: "Salzgitter-Wolfenbüttel", regionalInterests: ["Niedersachsen"] },
    mentioned_locations: ["Europa", "Bundesrepublik Deutschland"], docs: [{ source_type: "bundestag", source_name: "Bundesrat", url: "https://www.bundesrat.de/x" }] }).granted);
check("12 Person aus fremder Region, kein Ortstreffer -> KEIN Wahlkreis-Treffer",
  !runConstituency({ profileFields: { constituency: "Salzgitter-Wolfenbüttel", regionalInterests: ["Niedersachsen", "Salzgitter"] },
    mentioned_locations: ["Bremen"] }).granted);

// =============================================================================
// 13) Regression: Partei-Segment unabhaengig von der Ausschuss-/Wahlkreis-Verschaerfung
// =============================================================================
{
  const profile = { id: "p", fullName: "Test Person", party: "Die Linke", committee: "Arbeit und Soziales", politicalLevel: "Bund" };
  const koParty = { ...KOBASE, id: "kp", vorgang_id: "vp", display_title: "Die Linke fordert Reform", parteien: ["Die Linke"], created_at: iso(3600e3), best_source_url: "https://example.org/p" };
  const mf = matching.matchedFeatures(matching.profileFeatures(profile), matching.knowledgeObjectFeatures(koParty));
  const st = radarState.buildCurrentRadarState({ profile, decisions: [{ knowledge_object_id: "kp", vorgang_id: "vp", score: 60, matched_features: mf }], kosById: { kp: koParty }, knowledgeObjects: [koParty], sourcesByVorgang: { vp: [{ source_type: "party", url: "https://die-linke.de/p", published_at: iso(3600e3) }] }, now: nowDate });
  check("13 Partei-Segment unveraendert funktionsfaehig", st.environment.party.some((e) => e.vorgangId === "vp"));
}

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Radar-Ausschuss-/Wahlkreis-Evidenz-Assertions`);
process.exit(failed > 0 ? 1 : 0);
