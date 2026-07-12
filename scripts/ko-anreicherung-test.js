"use strict";

// Tests für P1-1 (deterministische Themen-Anreicherung, profile-coverage.md §10).
// Prüft die read-time Ableitung des Politikfelds aus den belegten Ausschuss-Feldern
// (kein KI, kein DB-Write) + Vorher/Nachher-Wirkung über mehrere Profile.
// KEIN Netz, KEINE KI.

const m = require("../lib/helmut/matching");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}
const has = (arr, v) => Array.isArray(arr) && arr.includes(v);

// ── 1) derivePolicyFields: echte Fachfelder aus Ausschüssen, Prozedur-Gremien nicht ──
check("Gesundheitsausschuss -> Gesundheit", has(m.derivePolicyFields({ ausschuesse: ["Gesundheitsausschuss"] }), "Gesundheit"));
check("Ausschuss für Arbeit und Soziales -> Arbeit und Soziales", has(m.derivePolicyFields({ ausschuesse: ["Ausschuss für Arbeit und Soziales"] }), "Arbeit und Soziales"));
check("Sozialausschuss -> Arbeit und Soziales (Synonym)", has(m.derivePolicyFields({ ausschuesse: ["Sozialausschuss"] }), "Arbeit und Soziales"));
check("Finanzausschuss -> Finanzen", has(m.derivePolicyFields({ ausschuesse: ["Finanzausschuss"] }), "Finanzen"));
check("mentioned_committees zählt auch", has(m.derivePolicyFields({ mentioned_committees: ["Verteidigungsausschuss"] }), "Verteidigung"));
check("Dedup: Ausschuss + Synonym -> ein Feld", m.derivePolicyFields({ ausschuesse: ["Ausschuss für Arbeit und Soziales", "Sozialausschuss"] }).length === 1);
check("Prozedur-Gremium 'Koalitionsausschuss' -> KEIN Politikfeld", m.derivePolicyFields({ ausschuesse: ["Koalitionsausschuss"] }).length === 0);
check("'Bundesrat (Plenum)' -> KEIN Politikfeld", m.derivePolicyFields({ ausschuesse: ["Bundesrat (Plenum)"] }).length === 0);
check("Leeres KO -> keine Felder (robust)", m.derivePolicyFields({}).length === 0);

// ── 2) knowledgeObjectFeatures.topics: Ableitung nur bei leeren tags/policy_field ──
const koLeer = { ausschuesse: ["Gesundheitsausschuss"], tags: [], policy_field: [] };
check("leere tags/policy_field -> topics abgeleitet", has(m.knowledgeObjectFeatures(koLeer).topics, "Gesundheit"));
const koExplizit = { ausschuesse: ["Gesundheitsausschuss"], tags: ["Krankenhausreform"], policy_field: [] };
check("explizite tags haben Vorrang (keine Überschreibung)", (() => { const t = m.knowledgeObjectFeatures(koExplizit).topics; return has(t, "Krankenhausreform") && !has(t, "Gesundheit"); })());
check("KO ohne Ausschuss + ohne tags -> topics leer (robust, kein Fake)", m.knowledgeObjectFeatures({ headline: "X" }).topics.length === 0);

// ── 3) VORHER/NACHHER: Themen-Treffer über mehrere Profile ─────────────────
// Prod-realistischer KO-Satz: Ausschüsse belegt, tags/policy_field leer (wie Bestand).
const KOS = [
  { id: "ko-g1", vorgang_id: "vg-g1", understanding_status: "complete", status: "neu", headline: "Klinikreform", was_ist_passiert: "Reform.", ausschuesse: ["Gesundheitsausschuss"], parteien: [], tags: [], policy_field: [] },
  { id: "ko-a1", vorgang_id: "vg-a1", understanding_status: "complete", status: "update", headline: "Tarifpaket", was_ist_passiert: "Tarif.", ausschuesse: ["Ausschuss für Arbeit und Soziales"], parteien: [], tags: [], policy_field: [] },
  { id: "ko-f1", vorgang_id: "vg-f1", understanding_status: "complete", status: "neu", headline: "Etat", was_ist_passiert: "Haushalt.", ausschuesse: ["Finanzausschuss"], parteien: [], tags: [], policy_field: [] }
];
// Dieselben KOs OHNE Ausschuss = "Vorher"-Zustand (tote Themen-Dimension).
const KOS_VORHER = KOS.map((k) => ({ ...k, ausschuesse: [], mentioned_committees: [] }));

const profile = { id: "p-gesundheit", committee: "Gesundheit", focusTopics: ["Gesundheit"] };
const themaTreffer = (kos, prof) => m.matchProfileToKnowledgeObjects(prof, kos, { limit: 10 })
  .reduce((n, r) => n + (r.matched_features || []).filter((f) => f.type === "thema").length, 0);

const vorher = themaTreffer(KOS_VORHER, profile);
const nachher = themaTreffer(KOS, profile);
check("VORHER: 0 Themen-Treffer (leere Ausschüsse -> tote Dimension)", vorher === 0, `vorher=${vorher}`);
check("NACHHER: >=1 Themen-Treffer (aus Ausschuss abgeleitet)", nachher >= 1, `nachher=${nachher}`);
console.log(`    Messung Themen-Treffer (Gesundheits-Profil): vorher ${vorher} -> nachher ${nachher}`);

// Mehr-Profil: jedes Profil trifft sein eigenes Politikfeld, nicht das fremde.
const profFinanz = { id: "p-finanz", committee: "Finanzen", focusTopics: ["Finanzen"] };
const profArbeit = { id: "p-arbeit", committee: "Arbeit und Soziales", focusTopics: ["Arbeit und Soziales"] };
const feats = (prof, koId) => (m.matchProfileToKnowledgeObjects(prof, KOS, { limit: 10 }).find((r) => r.knowledge_object_id === koId)?.matched_features || []).filter((f) => f.type === "thema").length;
check("Gesundheits-Profil trifft Gesundheits-KO thematisch", feats(profile, "ko-g1") >= 1);
check("Finanz-Profil trifft Finanz-KO thematisch", feats(profFinanz, "ko-f1") >= 1);
check("Arbeit-Profil trifft Arbeit-KO thematisch", feats(profArbeit, "ko-a1") >= 1);
check("Keine Fehl-Zuordnung: Finanz-Profil trifft Gesundheits-KO NICHT thematisch", feats(profFinanz, "ko-g1") === 0);

console.log(`\n${passed}/${passed + failed} KO-Anreicherungs-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
