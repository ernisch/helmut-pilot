"use strict";

// Tests für P1-2 (Label-Normalisierung Ausschuss/Partei) + Mehr-Profil-Matching
// (profile-coverage.md §4/§5). KEIN Netz, KEINE KI — reiner In-Memory-Ranker.

const m = require("../lib/helmut/matching");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// ── 1) Ausschuss-Normalisierung ────────────────────────────────────────────
const cEq = (a, b) => m.slugCommittee(a) === m.slugCommittee(b);
check("Ausschuss: 'Ausschuss für Arbeit und Soziales' == 'Arbeit und Soziales'", cEq("Ausschuss für Arbeit und Soziales", "Arbeit und Soziales"));
check("Ausschuss: 'Sozialausschuss' == 'Arbeit und Soziales'", cEq("Sozialausschuss", "Arbeit und Soziales"));
check("Ausschuss: 'Finanzausschuss' == 'Finanzen'", cEq("Finanzausschuss", "Finanzen"));
check("Ausschuss: 'Ausschuss für Gesundheit' == 'Gesundheit'", cEq("Ausschuss für Gesundheit", "Gesundheit"));
check("Ausschuss: 'Gesundheitsausschuss' == 'Gesundheit'", cEq("Gesundheitsausschuss", "Gesundheit"));
check("Ausschuss: verschiedene bleiben verschieden (Finanzen != Gesundheit)", !cEq("Finanzen", "Gesundheit"));

// ── 2) Partei-Normalisierung ───────────────────────────────────────────────
const pEq = (a, b) => m.slugParty(a) === m.slugParty(b);
check("Partei: 'Die Linke' == 'Linke'", pEq("Die Linke", "Linke"));
check("Partei: 'DIE LINKE' == 'Linke'", pEq("DIE LINKE", "Linke"));
check("Partei: 'Bündnis 90/Die Grünen' == 'Grüne'", pEq("Bündnis 90/Die Grünen", "Grüne"));
check("Partei: 'Grünen' == 'Grüne'", pEq("Grünen", "Grüne"));
check("Partei: SPD != CDU", !pEq("SPD", "CDU"));
check("Partei: 'Alternative für Deutschland' == 'AfD'", pEq("Alternative für Deutschland", "AfD"));

// ── 3) matchedFeatures feuert jetzt für Label-Varianten (vorher tot) ───────
const pfLinke = m.profileFeatures({ party: "Linke", committee: "Arbeit und Soziales" });
const koLinke = m.knowledgeObjectFeatures({ parteien: ["Die Linke"], ausschuesse: ["Ausschuss für Arbeit und Soziales"] });
const feats = m.matchedFeatures(pfLinke, koLinke);
check("matchedFeatures: partei-Treffer trotz 'Linke' vs 'Die Linke'", feats.some((f) => f.type === "partei"), JSON.stringify(feats));
check("matchedFeatures: ausschuss-Treffer trotz Präfix-Variante", feats.some((f) => f.type === "ausschuss"), JSON.stringify(feats));

// ── 4) Mehr-Profil-Matching: unterschiedliche Profile → unterschiedliche Treffer ──
const KOS = [
  { id: "ko-arbeit", vorgang_id: "vg-1", understanding_status: "complete", status: "update", headline: "Bundestariftreuegesetz im Ausschuss", was_ist_passiert: "Der Ausschuss berät die Tarifbindung.", parteien: ["Die Linke"], ausschuesse: ["Ausschuss für Arbeit und Soziales"], mentioned_parties: [], mentioned_committees: [] },
  { id: "ko-gesundheit", vorgang_id: "vg-2", understanding_status: "complete", status: "neu", headline: "Pflegereform im Gesundheitsausschuss", was_ist_passiert: "Das BMG stellt Eckpunkte vor.", parteien: ["SPD"], ausschuesse: ["Gesundheitsausschuss"], mentioned_parties: [], mentioned_committees: [] },
  { id: "ko-finanz", vorgang_id: "vg-3", understanding_status: "complete", status: "neu", headline: "Haushalt im Finanzausschuss", was_ist_passiert: "Der Finanzausschuss berät den Etat.", parteien: ["CDU"], ausschuesse: ["Finanzausschuss"], mentioned_parties: [], mentioned_committees: [] }
];
const linkeProfile = { id: "p-linke", party: "Linke", committee: "Arbeit und Soziales", focusTopics: ["Tarifbindung"] };
const spdGesundheit = { id: "p-spd", party: "SPD", committee: "Gesundheit", focusTopics: ["Pflege"] };
const cduFinanz = { id: "p-cdu", party: "CDU", committee: "Finanzen", focusTopics: ["Haushalt"] };

function topFeatures(profile) {
  const ranked = m.matchProfileToKnowledgeObjects(profile, KOS, { limit: 3 });
  // Karte mit den meisten Identitätstreffern zuerst
  const withFeats = ranked.filter((r) => (r.matched_features || []).length > 0);
  return { ranked, withFeats };
}

const rLinke = topFeatures(linkeProfile);
const rSpd = topFeatures(spdGesundheit);
const rCdu = topFeatures(cduFinanz);

check("Linke-Profil trifft das Arbeit-und-Soziales-KO mit Identitätsmerkmalen", rLinke.ranked.find((r) => r.knowledge_object_id === "ko-arbeit")?.matched_features?.length > 0, JSON.stringify(rLinke.ranked.map((r) => [r.knowledge_object_id, r.matched_features])));
check("SPD/Gesundheit-Profil trifft das Gesundheits-KO", rSpd.ranked.find((r) => r.knowledge_object_id === "ko-gesundheit")?.matched_features?.length > 0);
check("CDU/Finanz-Profil trifft das Finanz-KO", rCdu.ranked.find((r) => r.knowledge_object_id === "ko-finanz")?.matched_features?.length > 0);

// Personalisierung: Linke-Profil bekommt am Arbeit-KO andere/mehr Treffer als am Finanz-KO.
const linkeArbeit = rLinke.ranked.find((r) => r.knowledge_object_id === "ko-arbeit")?.matched_features?.length || 0;
const linkeFinanz = rLinke.ranked.find((r) => r.knowledge_object_id === "ko-finanz")?.matched_features?.length || 0;
check("Personalisierung: Linke trifft Arbeit-KO stärker als Finanz-KO", linkeArbeit > linkeFinanz, `arbeit=${linkeArbeit} finanz=${linkeFinanz}`);

// Kein Cross-Contamination: SPD-Profil bekommt am Arbeit-KO KEINEN partei-Treffer (SPD != Die Linke).
const spdArbeitFeats = rSpd.ranked.find((r) => r.knowledge_object_id === "ko-arbeit")?.matched_features || [];
check("Keine Fehl-Zuordnung: SPD-Profil erhält am Linke-KO keinen partei-Treffer", !spdArbeitFeats.some((f) => f.type === "partei"), JSON.stringify(spdArbeitFeats));

// ── 5) Leeres Profil: keine Identitätstreffer (fachlich korrekt) ───────────
const emptyRanked = m.matchProfileToKnowledgeObjects({ id: "leer" }, KOS, { limit: 3 });
check("Leeres Profil: keine matched_features (korrekt, kein erfundener Treffer)", emptyRanked.every((r) => (r.matched_features || []).length === 0));

console.log(`\n${passed}/${passed + failed} Matching-Normalisierungs-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
