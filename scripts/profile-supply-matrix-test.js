"use strict";

// Profilversorgungsmatrix (Mehrmandantenfaehigkeit Phase 6/7).
// Fuehrt die 13 repraesentativen Testprofile durch die ECHTE In-Memory-Matching-
// Engine gegen einen repraesentativen KO-Korpus und beweist:
//  - jedes vollstaendige Profil trifft SEIN Fachfeld (Ausschuss/Partei/Region),
//  - unterschiedliche Profile bekommen UNTERSCHIEDLICHE passende Ergebnisse
//    (Kernkriterium: „Kunde A != Kunde B"),
//  - keine Cross-Contamination (fremdes Partei-/Ausschuss-KO feuert nicht),
//  - unvollstaendige/leere Profile bekommen korrekt (fast) nichts — kein erfundener
//    Treffer,
//  - der Validierungszustand pro Profil stimmt.
// KEIN Netz, KEINE KI, KEINE DB — reiner Ranker + Validierung.

const m = require("../lib/helmut/matching");
const { validateProfile } = require("../lib/helmut/profile-validation");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// --- Repraesentativer KO-Korpus (verschiedene Felder/Parteien/Regionen) ---
const KOS = [
  { id: "ko-arbeit", vorgang_id: "vg-arbeit", understanding_status: "complete", status: "update", headline: "Tariftreuegesetz", was_ist_passiert: "Ausschuss berät Tarifbindung.", parteien: ["Die Linke"], ausschuesse: ["Ausschuss für Arbeit und Soziales"], mentioned_locations: ["Salzgitter"], tags: ["Tarifbindung", "Mindestlohn"] },
  { id: "ko-gesundheit", vorgang_id: "vg-gesundheit", understanding_status: "complete", status: "neu", headline: "Pflegereform", was_ist_passiert: "BMG stellt Eckpunkte vor.", parteien: ["SPD"], ausschuesse: ["Gesundheitsausschuss"], mentioned_locations: ["Berlin"], tags: ["Pflege"] },
  { id: "ko-finanz", vorgang_id: "vg-finanz", understanding_status: "complete", status: "neu", headline: "Haushalt", was_ist_passiert: "Finanzausschuss berät Etat.", parteien: ["CDU"], ausschuesse: ["Finanzausschuss"], mentioned_locations: ["München"], tags: ["Haushalt"] },
  { id: "ko-innen", vorgang_id: "vg-innen", understanding_status: "complete", status: "neu", headline: "Sicherheitspaket", was_ist_passiert: "Innenausschuss berät.", parteien: ["AfD"], ausschuesse: ["Innenausschuss"], mentioned_locations: ["Dresden"], tags: ["Innere Sicherheit"] },
  { id: "ko-wirtschaft", vorgang_id: "vg-wirtschaft", understanding_status: "complete", status: "neu", headline: "Digitalstrategie", was_ist_passiert: "Wirtschaftsausschuss berät Digitales.", parteien: ["FDP"], ausschuesse: ["Wirtschaftsausschuss"], mentioned_locations: ["Frankfurt"], tags: ["Digitalisierung"] },
  { id: "ko-umwelt", vorgang_id: "vg-umwelt", understanding_status: "complete", status: "neu", headline: "Klimaschutzgesetz", was_ist_passiert: "Umweltausschuss berät.", parteien: ["Bündnis 90/Die Grünen"], ausschuesse: ["Umweltausschuss"], mentioned_locations: ["Stuttgart"], tags: ["Klimaschutz"] },
  { id: "ko-nrw", vorgang_id: "vg-nrw", understanding_status: "complete", status: "neu", headline: "NRW-Schulgesetz", was_ist_passiert: "Landtag NRW berät Bildung.", parteien: ["SPD"], ausschuesse: ["Bildungsausschuss"], mentioned_locations: ["Düsseldorf", "Köln"], tags: ["Bildung"] },
  { id: "ko-bayern", vorgang_id: "vg-bayern", understanding_status: "complete", status: "neu", headline: "Bayern-Landwirtschaft", was_ist_passiert: "Landtag Bayern berät.", parteien: ["CSU"], ausschuesse: ["Landwirtschaftsausschuss"], mentioned_locations: ["München", "Nürnberg"], tags: ["Landwirtschaft"] }
];

// --- 13 repraesentative Testprofile (profile-coverage.md §5) ---
const PROFILES = {
  T1_cdu_bt_grossstadt: { id: "t1", fullName: "T1 CDU", party: "CDU", parliamentType: "Bundestag", constituency: "München-Mitte", committee: "Finanzen", focusTopics: ["Haushalt"], profileActive: true, expectTop: "ko-finanz" },
  T2_spd_bt_laendlich: { id: "t2", fullName: "T2 SPD", party: "SPD", parliamentType: "Bundestag", constituency: "Uckermark", committee: "Gesundheit", focusTopics: ["Pflege"], profileActive: true, expectTop: "ko-gesundheit" },
  T3_gruene: { id: "t3", fullName: "T3 Grüne", party: "Bündnis 90/Die Grünen", parliamentType: "Bundestag", constituency: "Stuttgart", committee: "Umwelt", focusTopics: ["Klimaschutz"], profileActive: true, expectTop: "ko-umwelt" },
  T4_linke_arbeit: { id: "t4", fullName: "T4 Linke", party: "Die Linke", parliamentType: "Bundestag", constituency: "Salzgitter", committee: "Arbeit und Soziales", focusTopics: ["Tarifbindung"], profileActive: true, expectTop: "ko-arbeit" },
  T5_fdp_wirtschaft: { id: "t5", fullName: "T5 FDP", party: "FDP", parliamentType: "Bundestag", constituency: "Frankfurt", committee: "Wirtschaft", focusTopics: ["Digitalisierung"], profileActive: true, expectTop: "ko-wirtschaft" },
  T6_afd_innen: { id: "t6", fullName: "T6 AfD", party: "AfD", parliamentType: "Bundestag", constituency: "Dresden", committee: "Innenausschuss", focusTopics: ["Innere Sicherheit"], profileActive: true, expectTop: "ko-innen" },
  T7_fraktionslos: { id: "t7", fullName: "T7 Fraktionslos", party: "Fraktionslos", parliamentType: "Bundestag", constituency: "Hamburg", committee: "Gesundheit", focusTopics: ["Pflege"], profileActive: true, expectTop: "ko-gesundheit" },
  T8_landtag_nrw: { id: "t8", fullName: "T8 NRW", party: "SPD", parliamentType: "Landtag", state: "Nordrhein-Westfalen", constituency: "Köln I", committee: "Bildung", focusTopics: ["Bildung"], profileActive: true, expectTop: "ko-nrw" },
  T9_landtag_bayern: { id: "t9", fullName: "T9 Bayern", party: "CSU", parliamentType: "Landtag", state: "Bayern", constituency: "Nürnberg-Nord", committee: "Landwirtschaft", focusTopics: ["Landwirtschaft"], profileActive: true, expectTop: "ko-bayern" },
  T10_neu_ohne_historie: { id: "t10", fullName: "T10 Neu", party: "FDP", parliamentType: "Bundestag", constituency: "Köln II", committee: "Wirtschaft", focusTopics: ["Digitalisierung"], profileActive: true, expectTop: "ko-wirtschaft" },
  T11_unvollstaendig: { id: "t11", fullName: "T11 Unvollständig", party: "SPD", parliamentType: "Bundestag", profileActive: true }, // kein Ausschuss/Region
  T12_leer: { id: "t12", profileActive: true }, // komplett leer
  T13_deaktiviert: { id: "t13", fullName: "T13 Deaktiviert", party: "CDU", parliamentType: "Bundestag", constituency: "Berlin", committee: "Finanzen", focusTopics: ["Haushalt"], profileActive: false }
};

function topMatch(profile) {
  const ranked = m.matchProfileToKnowledgeObjects(profile, KOS, { limit: 8 });
  const withFeats = ranked.filter((r) => (r.matched_features || []).length > 0)
    .sort((a, b) => (b.matched_features.length - a.matched_features.length));
  return { ranked, withFeats, top: withFeats[0] || null };
}

console.log("== 1) Jedes vollständige Profil trifft SEIN Fachfeld ==");
const results = {};
for (const [name, p] of Object.entries(PROFILES)) {
  results[name] = topMatch(p);
  if (p.expectTop) {
    const hit = results[name].ranked.find((r) => r.knowledge_object_id === p.expectTop);
    check(`${name}: trifft ${p.expectTop} mit Identitätsmerkmalen`, hit && (hit.matched_features || []).length > 0,
      JSON.stringify(results[name].withFeats.map((r) => [r.knowledge_object_id, (r.matched_features || []).map((f) => f.type)])));
  }
}

console.log("== 2) Unterschiedliche Profile → unterschiedliche Top-Treffer (Kunde A != Kunde B) ==");
const tops = {};
for (const [name, p] of Object.entries(PROFILES)) {
  if (p.expectTop) tops[name] = results[name].top ? results[name].top.knowledge_object_id : null;
}
// Die sechs Bundestags-Fachprofile (T1-T6) muessen sechs UNTERSCHIEDLICHE Top-KOs haben.
const btTops = ["T1_cdu_bt_grossstadt", "T2_spd_bt_laendlich", "T3_gruene", "T4_linke_arbeit", "T5_fdp_wirtschaft", "T6_afd_innen"].map((n) => tops[n]);
check("T1-T6: sechs unterschiedliche Top-Treffer", new Set(btTops).size === 6, JSON.stringify(btTops));

console.log("== 3) Keine Cross-Contamination ==");
// CDU/Finanz-Profil bekommt am Arbeit-KO (Die Linke) KEINEN partei-Treffer.
const cduAtArbeit = results.T1_cdu_bt_grossstadt.ranked.find((r) => r.knowledge_object_id === "ko-arbeit")?.matched_features || [];
check("CDU-Profil: kein partei-Treffer am Linke-Arbeit-KO", !cduAtArbeit.some((f) => f.type === "partei"), JSON.stringify(cduAtArbeit));
// Linke/Arbeit-Profil bekommt am Finanz-KO (CDU) KEINEN partei-Treffer.
const linkeAtFinanz = results.T4_linke_arbeit.ranked.find((r) => r.knowledge_object_id === "ko-finanz")?.matched_features || [];
check("Linke-Profil: kein partei-Treffer am CDU-Finanz-KO", !linkeAtFinanz.some((f) => f.type === "partei"), JSON.stringify(linkeAtFinanz));

console.log("== 4) Unvollständige/leere Profile → kein erfundener Treffer ==");
const unvoll = results.T11_unvollstaendig || topMatch(PROFILES.T11_unvollstaendig);
// Nur Partei (SPD) kann feuern; Ausschuss/Region/Thema NICHT (nicht gesetzt).
const t11Feats = (unvoll.withFeats || []).flatMap((r) => (r.matched_features || []).map((f) => f.type));
check("T11 unvollständig: kein ausschuss-Treffer (nicht gesetzt)", !t11Feats.includes("ausschuss"));
const leer = topMatch(PROFILES.T12_leer);
check("T12 leer: gar keine Identitätstreffer", (leer.withFeats || []).length === 0, JSON.stringify(leer.withFeats));

console.log("== 5) Validierungszustand pro Profil stimmt ==");
check("T1 vollständig", validateProfile(PROFILES.T1_cdu_bt_grossstadt).state === "vollstaendig");
check("T8 Landtag NRW vollständig (Bundesland gesetzt)", validateProfile(PROFILES.T8_landtag_nrw).state === "vollstaendig");
check("T11 unvollständig → teilweise", validateProfile(PROFILES.T11_unvollstaendig).state === "teilweise");
check("T12 leer → nicht_bereit", validateProfile(PROFILES.T12_leer).state === "nicht_bereit");
check("T13 deaktiviert → deaktiviert", validateProfile(PROFILES.T13_deaktiviert).state === "deaktiviert");

console.log("");
const total = pass + fail;
if (fail === 0) { console.log(`${pass}/${total} Profilversorgungsmatrix-Assertions erfolgreich.`); process.exit(0); }
console.log(`${pass}/${total} erfolgreich, ${fail} fehlgeschlagen.`);
process.exit(1);
