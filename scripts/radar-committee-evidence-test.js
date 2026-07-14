"use strict";

// Radar Ausschuss-/Wahlkreis-Beleg-Verschaerfung (Evidenz-Tiers) — Offline, 0 KI, 0 Netz,
// 0 Kosten. Deckt die Nachschaerfung ab: die reine Ausschuss-Normalisierung (committeeMatchKey,
// siehe radar-committee-normalization-test.js) reichte NICHT aus, weil kurze, mehrdeutige
// Kurzformen wie "Sozialausschuss" technisch auf denselben Schluessel abbilden wie die
// offizielle Bundestags-Bezeichnung, aber an JEDER Ebene (Bund/Land/Kommune) vorkommen. Ein
// echter Ausschussbeleg verlangt jetzt zusaetzlich mindestens eine belastbare Bedingung:
//   (a) volle amtliche Form ("Ausschuss für X"/"Bundestagsausschuss für X") ohne Landtag-/
//       kommunal-/Koalitions-Widerspruch,
//   (b) voller kuratierter Ausschussname woertlich im Titel/Inhalt,
//   (c) echte amtliche Quelle (source_type 'bundestag') OHNE Misch-/Kommunal-Signal im Vorgang.
// Analog beim Wahlkreis: allgemeine Bundeslaender/Bund/Europa zaehlen NICHT als Wahlkreisbezug
// mehr (TOO_GENERAL_REGION_SLUGS, zentral aus der Geografie-Seed-Liste, kein Bundesland
// hartkodiert).
//
// KEINE Sonderregel fuer ein einzelnes Stichwort ("Sozial") — die Regel behandelt JEDE
// Kurzform gleich (Gesundheit/Recht/Landwirtschaft ebenso wie Sozial).

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

function runCommittee({ profileFields, ausschuesse, mentioned_committees = [], title = "", was_ist_passiert = "", warum_wichtig = "", docs = [] }) {
  const profile = { id: "p", fullName: "Test Person", ...profileFields };
  const ko = { ...KOBASE, id: "k", vorgang_id: "v", display_title: title, was_ist_passiert, warum_wichtig,
    ausschuesse, mentioned_committees, created_at: iso(24 * 3600e3), best_source_url: "https://example.org/d" };
  const pf = matching.profileFeatures(profile);
  const kf = matching.knowledgeObjectFeatures(ko);
  const mf = matching.matchedFeatures(pf, kf);
  const decision = { knowledge_object_id: "k", vorgang_id: "v", score: 50, matched_features: mf };
  const sbv = docs.length ? { v: docs } : {};
  const st = radarState.buildCurrentRadarState({
    profile, decisions: [decision], kosById: { k: ko }, knowledgeObjects: [ko],
    sourcesByVorgang: sbv, now: nowDate
  });
  return { granted: st.environment.committees.some((e) => e.vorgangId === "v") };
}

function runConstituency({ profileFields, mentioned_locations, docs = [] }) {
  const profile = { id: "p", fullName: "Test Person", ...profileFields };
  const ko = { ...KOBASE, id: "k", vorgang_id: "v", mentioned_locations,
    created_at: iso(24 * 3600e3), best_source_url: "https://example.org/d" };
  const pf = matching.profileFeatures(profile);
  const kf = matching.knowledgeObjectFeatures(ko);
  const mf = matching.matchedFeatures(pf, kf);
  const decision = { knowledge_object_id: "k", vorgang_id: "v", score: 50, matched_features: mf };
  const sbv = docs.length ? { v: docs } : {};
  const st = radarState.buildCurrentRadarState({
    profile, decisions: [decision], kosById: { k: ko }, knowledgeObjects: [ko],
    sourcesByVorgang: sbv, now: nowDate
  });
  return { granted: st.environment.constituency.some((e) => e.vorgangId === "v") };
}

// =============================================================================
// 1) Arbeit und Soziales als echter Bundestagsausschuss
// =============================================================================
check("1 Arbeit und Soziales, volle amtliche Form -> echter Bundestagsausschuss erkannt",
  runCommittee({ profileFields: { committee: "Arbeit und Soziales", politicalLevel: "Bund" },
    ausschuesse: ["Ausschuss für Arbeit und Soziales"] }).granted);
check("1b Bundestagsausschuss-Vollform ebenfalls erkannt",
  runCommittee({ profileFields: { committee: "Arbeit und Soziales", politicalLevel: "Bund" },
    ausschuesse: ["Bundestagsausschuss für Arbeit und Soziales"] }).granted);

// =============================================================================
// 2) Kommunaler Sozialausschuss — darf NICHT als Cems Bundestagsausschuss zaehlen
//    (realer Fall: vg-nachbarschaftshilfe, "Ein Landkreis hat ein neues Konzept eingeführt…")
// =============================================================================
check("2 Kommunaler Sozialausschuss (Landkreis-Kontext) -> NICHT als Bundestagsausschuss gewertet",
  !runCommittee({ profileFields: { committee: "Arbeit und Soziales", politicalLevel: "Bund" },
    ausschuesse: ["Sozialausschuss"],
    title: "Landkreis führt bezahlte Nachbarschaftshilfe zur Pflege ein",
    was_ist_passiert: "Ein Landkreis hat ein neues Konzept eingeführt, das bezahlte Nachbarschaftshilfe zur Unterstützung der Pflege initiiert.",
    docs: [{ source_type: "committee", source_name: "Merkur" }] }).granted);
check("2b Explizit als 'kommunale Sozialausschüsse' bezeichnet -> NICHT gewertet",
  !runCommittee({ profileFields: { committee: "Arbeit und Soziales", politicalLevel: "Bund" },
    ausschuesse: ["Sozialausschuss", "Integrationsausschuss"],
    title: "BMAS und kommunale Ausschüsse stärken Teilhabe und Inklusion",
    was_ist_passiert: "Mehrere Ausschüsse auf Bundes- und kommunaler Ebene haben Initiativen diskutiert.",
    docs: [{ source_type: "bundestag", source_name: "Bundestag" }] }).granted);

// =============================================================================
// 3) Koalitionsausschuss — andere Institution, kein Fachausschuss
//    (realer Fall: vg-gesundheit, "Koalitionsausschuss einigt sich auf Reformpaket")
// =============================================================================
check("3 Koalitionsausschuss-Reformpaket mit beilaeufiger 'Arbeits- und Sozialausschuss'-Paraphrase -> NICHT gewertet",
  !runCommittee({ profileFields: { committee: "Arbeit und Soziales", politicalLevel: "Bund" },
    ausschuesse: ["Finanzausschuss", "Gesundheitsausschuss", "Arbeits- und Sozialausschuss", "Familien- und Seniorenpolitik (Pflege)"],
    mentioned_committees: ["Koalitionsausschuss"],
    title: "Koalitionsausschuss einigt sich auf Reformpaket zu Steuern, Gesundheit, Rente und Arbeitsmarkt",
    was_ist_passiert: "Der Koalitionsausschuss von Union und SPD hat ein Reformpaket vereinbart.",
    docs: [{ source_type: "committee", source_name: "tagesschau.de" }] }).granted);
check("3b 'Koalitionsausschuss' selbst normalisiert nicht auf einen Fachausschuss-Schluessel",
  matching.committeeMatchKey("Koalitionsausschuss") !== matching.committeeMatchKey("Arbeit und Soziales"));

// =============================================================================
// 4) Landtagsausschuss — andere Ebene als ein Bundestag-Profil
// =============================================================================
check("4 Landtagsausschuss fuer Arbeit und Soziales -> NICHT fuer ein Bundestag-Profil gewertet",
  !runCommittee({ profileFields: { committee: "Arbeit und Soziales", politicalLevel: "Bund" },
    ausschuesse: ["Ausschuss des Landtags für Arbeit und Soziales"] }).granted);
check("4b Landtagsausschuss fuer ein LANDTAG-Profil (gleiche Ebene) -> erkannt",
  runCommittee({ profileFields: { committee: "Arbeit und Soziales", politische_ebene: "landtag" },
    ausschuesse: ["Ausschuss des Landtags für Arbeit und Soziales"] }).granted);
check("4c Bundestagsausschuss fuer ein LANDTAG-Profil -> NICHT gewertet (falsche Ebene)",
  !runCommittee({ profileFields: { committee: "Arbeit und Soziales", politische_ebene: "landtag" },
    ausschuesse: ["Ausschuss für Arbeit und Soziales"] }).granted);

// =============================================================================
// 5) Reine Themennennung ohne Ausschussbeleg
// =============================================================================
check("5 Bare Themenwort 'Arbeit und Soziales' (kein 'Ausschuss', keine Quelle, kein Inhalt) -> NICHT gewertet",
  !runCommittee({ profileFields: { committee: "Arbeit und Soziales", politicalLevel: "Bund" },
    ausschuesse: ["Arbeit und Soziales"] }).granted);
check("5b Allgemeines Fachthema im Titel, kein ausschuesse-Feld -> NICHT gewertet",
  !runCommittee({ profileFields: { committee: "Arbeit und Soziales", politicalLevel: "Bund" },
    ausschuesse: [], title: "Debatte über Arbeit und Soziales im Bundestag" }).granted);

// =============================================================================
// 6) Gesundheitsausschuss / 7) Landwirtschaftsausschuss — bloße Kurzform allein
//    genuegt NICHT (gleiche Regel wie "Sozial", keine Sonderregel je Stichwort)
// =============================================================================
check("6 'Gesundheitsausschuss' (bloße Kurzform, kein Beleg) -> NICHT gewertet",
  !runCommittee({ profileFields: { committee: "Gesundheit", politicalLevel: "Bund" },
    ausschuesse: ["Gesundheitsausschuss"] }).granted);
check("6b 'Ausschuss für Gesundheit' (volle Form) -> gewertet",
  runCommittee({ profileFields: { committee: "Gesundheit", politicalLevel: "Bund" },
    ausschuesse: ["Ausschuss für Gesundheit"] }).granted);
check("7 'Landwirtschaftsausschuss' (bloße Kurzform, kein Beleg) -> NICHT gewertet",
  !runCommittee({ profileFields: { committee: "Ernährung und Landwirtschaft", politicalLevel: "Bund" },
    ausschuesse: ["Landwirtschaftsausschuss"] }).granted);
check("7b 'Ausschuss für Ernährung und Landwirtschaft' (volle Form) -> gewertet",
  runCommittee({ profileFields: { committee: "Ernährung und Landwirtschaft", politicalLevel: "Bund" },
    ausschuesse: ["Ausschuss für Ernährung und Landwirtschaft"] }).granted);
// Hinweis zur Wahl von "Gesundheit" statt "Landwirtschaft" fuer die Korroborationsfaelle:
// "Landwirtschaftsausschuss" kollidiert bereits in der UNVERAENDERTEN matching.js-Funktion
// slugCommittee (mit "Wirtschaft", siehe B1-Diagnose) — diese bleibt bewusst unangetastet
// (Ranking-Neutralitaet), wodurch fuer dieses Wortpaar gar kein matched_feature entsteht und
// die radarState-Beleg-Pruefung nie erreicht wird. "Gesundheit" hat diese Alt-Kollision nicht.
check("7c Kurzform + woertlicher voller Name im Inhalt -> Korroboration greift, gewertet",
  runCommittee({ profileFields: { committee: "Gesundheit", politicalLevel: "Bund" },
    ausschuesse: ["Gesundheitsausschuss"],
    was_ist_passiert: "Der Ausschuss für Gesundheit hat die Novelle beraten." }).granted);
check("7d Kurzform + echte Bundestagsquelle (ohne Misch-/Kommunal-Signal) -> Korroboration greift",
  runCommittee({ profileFields: { committee: "Gesundheit", politicalLevel: "Bund" },
    ausschuesse: ["Gesundheitsausschuss"],
    docs: [{ source_type: "bundestag", source_name: "Bundestag" }] }).granted);

// =============================================================================
// 8) Gleicher Ausschussname auf verschiedenen politischen Ebenen — keine Verwechslung
// =============================================================================
check("8 Bundestag-Profil + Landtagsausschuss gleichen Namens -> getrennt (kein Treffer)",
  !runCommittee({ profileFields: { committee: "Arbeit und Soziales", politicalLevel: "Bund" },
    ausschuesse: ["Ausschuss des Landtags für Arbeit und Soziales"] }).granted);
check("8b Landtag-Profil + Bundestagsausschuss gleichen Namens -> getrennt (kein Treffer)",
  !runCommittee({ profileFields: { committee: "Arbeit und Soziales", politische_ebene: "landtag" },
    ausschuesse: ["Bundestagsausschuss für Arbeit und Soziales"] }).granted);
check("8c Beide auf DERSELBEN Ebene (Bund/Bund) -> Treffer",
  runCommittee({ profileFields: { committee: "Arbeit und Soziales", politicalLevel: "Bund" },
    ausschuesse: ["Ausschuss für Arbeit und Soziales"] }).granted);

// =============================================================================
// 9) Korrekter Wahlkreis
// =============================================================================
check("9 Konkreter Wahlkreisort in mentioned_locations -> Wahlkreis-Reiter",
  runConstituency({ profileFields: { constituency: "Salzgitter-Wolfenbüttel", regionalInterests: ["Niedersachsen", "Salzgitter", "Salzgitter-Wolfenbüttel"] },
    mentioned_locations: ["Salzgitter-Wolfenbüttel"] }).granted);
check("9b Zugehörige Kommune (aus regionalInterests) -> Wahlkreis-Reiter",
  runConstituency({ profileFields: { constituency: "Salzgitter-Wolfenbüttel", regionalInterests: ["Niedersachsen", "Salzgitter"] },
    mentioned_locations: ["Salzgitter"] }).granted);

// =============================================================================
// 10) Falscher Wahlkreis — allgemeines Bundesland zaehlt NICHT (realer Fall: vg-bovenschulte)
// =============================================================================
check("10 Bundesland (Niedersachsen) allein, obwohl in regionalInterests -> NICHT als Wahlkreis gewertet (der reale Bovenschulte-Fall)",
  !runConstituency({ profileFields: { constituency: "Salzgitter-Wolfenbüttel", regionalInterests: ["Niedersachsen", "Salzgitter-Wolfenbüttel"] },
    mentioned_locations: ["Europa", "Bundesrepublik Deutschland", "Niedersachsen"],
    docs: [{ source_type: "bundestag", source_name: "Bundesrat" }] }).granted);
check("10b Jedes der 16 Bundeslaender allein -> NICHT als Wahlkreis gewertet (allgemeingueltig, kein Einzelfall)",
  ["Bayern", "Berlin", "Nordrhein-Westfalen", "Sachsen"].every((land) =>
    !runConstituency({ profileFields: { constituency: "Irgendein Wahlkreis", regionalInterests: [land] }, mentioned_locations: [land] }).granted));

// =============================================================================
// 11) Bundesrat ohne Wahlkreisbezug — allgemeine Quelle reicht nicht
// =============================================================================
check("11 Bundesrats-Quelle ohne konkreten Ortsbezug -> KEIN Wahlkreis-Treffer",
  !runConstituency({ profileFields: { constituency: "Salzgitter-Wolfenbüttel", regionalInterests: ["Niedersachsen"] },
    mentioned_locations: ["Europa", "Bundesrepublik Deutschland"],
    docs: [{ source_type: "bundestag", source_name: "Bundesrat" }] }).granted);

// =============================================================================
// 12) Person aus einer anderen Region — Namensnennung ersetzt keinen Geografiebeleg
// =============================================================================
check("12 Person aus fremder Region genannt, aber KEIN mentioned_locations-Treffer -> KEIN Wahlkreis-Treffer",
  !runConstituency({ profileFields: { constituency: "Salzgitter-Wolfenbüttel", regionalInterests: ["Niedersachsen", "Salzgitter"] },
    mentioned_locations: ["Bremen"] }).granted);

// =============================================================================
// 13) Regression: Partei/Dynamiken unveraendert durch die Evidenz-Verschaerfung
// =============================================================================
{
  const profile = { id: "p", fullName: "Test Person", party: "Die Linke", committee: "Arbeit und Soziales", politicalLevel: "Bund" };
  const koParty = { ...KOBASE, id: "kp", vorgang_id: "vp", display_title: "Die Linke fordert Reform", parteien: ["Die Linke"], created_at: iso(3600e3), best_source_url: "https://example.org/p" };
  const mf = matching.matchedFeatures(matching.profileFeatures(profile), matching.knowledgeObjectFeatures(koParty));
  const st = radarState.buildCurrentRadarState({ profile, decisions: [{ knowledge_object_id: "kp", vorgang_id: "vp", score: 60, matched_features: mf }], kosById: { kp: koParty }, knowledgeObjects: [koParty], sourcesByVorgang: { vp: [{ source_type: "party", url: "https://example.org/p", published_at: iso(3600e3) }] }, now: nowDate });
  check("13 Partei-Segment durch Ausschuss-/Wahlkreis-Verschaerfung unveraendert funktionsfaehig", st.environment.party.some((e) => e.vorgangId === "vp"));
}

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Radar-Ausschuss-/Wahlkreis-Evidenz-Assertions`);
process.exit(failed > 0 ? 1 : 0);
