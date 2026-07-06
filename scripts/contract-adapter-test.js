"use strict";

// Offline-Tests des V3-Contract-Adapters (lib/helmut/briefingContract.js).
// KEIN Netz, KEINE KI. Prüft, dass der Adapter aus V3-Daten die EXAKTE
// /api/app/start-Vertragsform erzeugt (dieselben REQUIRED_KEYS + Enums +
// die heilige 60/40-Konsistenz, die scripts/contract-snapshot-test.js einfriert).

const { toBriefingContractV3, buildContractFromKnowledgeObjects } = require("../lib/helmut/briefingContract");

// --- Vertragskonstanten (1:1 aus contract-snapshot-test.js) -----------------
const DECISION_ENUM = ["Sofort reagieren", "Beobachten", "Ignorieren"];
const PRIORITY_TYPE_ENUM = ["action", "watch", "chance", "risk", "ignore", "high"];
const BRIEFING_REQUIRED_KEYS = [
  "items", "personalizedRecommendations", "situationalBriefing", "homeSections",
  "helmutAssessment", "decisionMetrics", "status", "generatedAt", "personMentions"
];
const ITEM_REQUIRED_KEYS = ["id", "title", "decision", "priority", "finalScore", "recommendedAction", "primarySource", "sources"];
const REC_REQUIRED_KEYS = ["id", "relevance_score", "current_priority", "recommended_action", "personal_relevance_explanation", "action_type", "status"];

function clientDecisionFromScore(score) {
  return score >= 60 ? "Sofort reagieren" : score >= 40 ? "Beobachten" : "Ignorieren";
}

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// Rekursive Feld-Sammler (wie im Snapshot-Test).
function collectField(node, key, out) {
  if (Array.isArray(node)) { node.forEach((n) => collectField(n, key, out)); return; }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === key) out.push(v);
      collectField(v, key, out);
    }
  }
}
function collectObjectsWith(node, keyA, keyB, out) {
  if (Array.isArray(node)) { node.forEach((n) => collectObjectsWith(n, keyA, keyB, out)); return; }
  if (node && typeof node === "object") {
    if (keyA in node && keyB in node) out.push(node);
    for (const v of Object.values(node)) collectObjectsWith(v, keyA, keyB, out);
  }
}

// --- Synthetische V3-Daten ---------------------------------------------------
const kos = [
  {
    id: "ko-1", vorgang_id: "vg-1", status: "neu", understanding_status: "complete",
    headline: "Pflegereform", display_title: "Bundesregierung legt Pflegereform vor",
    display_summary: "Die Regierung stellt eine Reform der Pflegeversicherung vor.",
    why_relevant: "Betrifft deinen Ausschuss Gesundheit unmittelbar.",
    recommendation: "Position mit Referent abstimmen.",
    was_ist_passiert: "Reform der Pflegeversicherung vorgestellt.", warum_wichtig: "Millionen betroffen.",
    parteien: ["SPD"], ausschuesse: ["Gesundheit"], ministerien: ["BMG"], tags: ["Pflege"],
    risiken: ["Leistungskürzung"], chancen: [], mentioned_mps: ["Karl Lauterbach"],
    source_document_count: 3, confidence_score: 80, best_source_url: "https://bmg.bund.de/pflege"
  },
  {
    id: "ko-2", vorgang_id: "vg-2", status: "neu", understanding_status: "complete",
    headline: "Klimaförderung", display_title: "Länder fordern mehr Klima-Fördermittel",
    display_summary: "Neue Fördermittel für Kommunen angekündigt.",
    why_relevant: "Chance für deinen Wahlkreis.", recommendation: "Fördertopf prüfen.",
    was_ist_passiert: "Förderprogramm angekündigt.", warum_wichtig: "Mittel für Kommunen.",
    parteien: ["SPD"], ausschuesse: ["Gesundheit"], tags: ["Pflege"],
    risiken: [], chancen: ["Fördermittel für den Wahlkreis"],
    source_document_count: 2, confidence_score: 70, best_source_url: "https://example.org/klima"
  },
  {
    id: "ko-3", vorgang_id: "vg-3", status: "neu", understanding_status: "complete",
    headline: "Verteidigung", was_ist_passiert: "Beschaffung debattiert.", warum_wichtig: "Haushalt.",
    parteien: ["CDU"], ausschuesse: ["Verteidigung"], tags: ["Bundeswehr"], source_document_count: 1
  },
  { id: "ko-4", vorgang_id: "vg-4", status: "pending", understanding_status: "pending" }
];
const sourcesByVorgang = {
  "vg-1": [{ url: "https://bmg.bund.de/pflege", source_name: "BMG", link_type: "direct", published_at: "2026-07-05" }],
  "vg-2": [{ url: "https://example.org/klima", source_name: "Beispiel", link_type: "direct" }]
};
const profile = { id: "u-health", fullName: "Test Abgeordnete", firstName: "Test", party: "SPD", committee: "Gesundheit", focusTopics: ["Pflege"] };
const NOW = new Date("2026-07-06T08:00:00Z");

const briefing = buildContractFromKnowledgeObjects(profile, kos, sourcesByVorgang, { userId: "u-health", now: NOW });

// --- 1) Alle Pflicht-Keys der Briefing-Ebene --------------------------------
check("Briefing trägt alle BRIEFING_REQUIRED_KEYS",
  BRIEFING_REQUIRED_KEYS.every((k) => k in briefing),
  BRIEFING_REQUIRED_KEYS.filter((k) => !(k in briefing)).join(","));

// --- 2) Items + Recommendations: Pflichtfelder ------------------------------
check("Es gibt Items (KOs bewertet)", Array.isArray(briefing.items) && briefing.items.length > 0, `n=${briefing.items.length}`);
check("Jedes Item trägt ITEM_REQUIRED_KEYS",
  briefing.items.every((it) => ITEM_REQUIRED_KEYS.every((k) => k in it)),
  briefing.items.map((it) => ITEM_REQUIRED_KEYS.filter((k) => !(k in it))).flat().join(","));
check("Jede Recommendation trägt REC_REQUIRED_KEYS",
  briefing.personalizedRecommendations.every((r) => REC_REQUIRED_KEYS.every((k) => k in r)));
check("Pending-KOs erscheinen NICHT im Vertrag",
  !briefing.items.some((it) => it.vorgangId === "vg-4"));

// --- 3) Enums überall im Baum -----------------------------------------------
const decisionsFound = [];
collectField(briefing, "decision", decisionsFound);
check("Alle decision-Werte ∈ DECISION_ENUM",
  decisionsFound.every((d) => typeof d !== "string" || DECISION_ENUM.includes(d)),
  decisionsFound.filter((d) => typeof d === "string" && !DECISION_ENUM.includes(d)).join(","));
const ptFound = [];
collectField(briefing, "priorityType", ptFound);
check("Alle priorityType-Werte ∈ PRIORITY_TYPE_ENUM",
  ptFound.every((p) => typeof p !== "string" || PRIORITY_TYPE_ENUM.includes(p)),
  ptFound.filter((p) => typeof p === "string" && !PRIORITY_TYPE_ENUM.includes(p)).join(","));

// --- 4) HEILIGE Konsistenz: relevance_score + decision ----------------------
const both = [];
collectObjectsWith(briefing, "relevance_score", "decision", both);
check("Wo BEIDES vorhanden (relevance_score + decision): Client-Schwelle stimmt überein",
  both.length > 0 && both.every((o) => clientDecisionFromScore(o.relevance_score) === o.decision),
  both.filter((o) => clientDecisionFromScore(o.relevance_score) !== o.decision)
    .map((o) => `score=${o.relevance_score} decision=${o.decision}`).slice(0, 3).join(", "));

// --- 5) Item-Konsistenz: finalScore <-> decision + priority-Label -----------
check("Item.decision == decisionFromScore(finalScore)",
  briefing.items.every((it) => clientDecisionFromScore(it.finalScore) === it.decision));
check("Höchster Score steht auf Position 1 (Sortierung absteigend)",
  briefing.items.every((it, i, arr) => i === 0 || arr[i - 1].finalScore >= it.finalScore));

// --- 6) homeSections + Metriken ---------------------------------------------
const HS = briefing.homeSections;
check("homeSections trägt alle Standard-Sektionen",
  ["topTasks", "needsAttention", "opportunities", "risks", "situational", "governmentPlans", "partyFaction", "changedSinceLastVisit"]
    .every((k) => Array.isArray(HS[k])));
check("Risiko-Vorgang landet in homeSections.risks", HS.risks.some((i) => i.id === "item-vg-1"));
check("Chance-Vorgang landet in homeSections.opportunities", HS.opportunities.some((i) => i.id === "item-vg-2"));
check("decisionMetrics.total == Anzahl bewerteter Vorgänge",
  briefing.decisionMetrics.total === briefing.items.length);
check("decisionMetrics react+observe+ignore == total",
  briefing.decisionMetrics.react + briefing.decisionMetrics.observe + briefing.decisionMetrics.ignore === briefing.decisionMetrics.total);

// --- 7) helmutAssessment: gültig, ohne decision-Key -------------------------
check("helmutAssessment.priorityStatus ∈ {stable,changed,risk,chance}",
  ["stable", "changed", "risk", "chance"].includes(briefing.helmutAssessment.priorityStatus));
check("helmutAssessment trägt KEINEN decision-Key (nur priorityStatus)",
  !("decision" in briefing.helmutAssessment));
check("helmutAssessment ist deterministisch/0-KI (source=deterministic)", briefing.helmutAssessment.source === "deterministic");

// --- 8) Determinismus + Leerfall --------------------------------------------
const briefing2 = buildContractFromKnowledgeObjects(profile, kos, sourcesByVorgang, { userId: "u-health", now: NOW });
check("Adapter ist deterministisch (2 Läufe gleich)", JSON.stringify(briefing) === JSON.stringify(briefing2));
const empty = buildContractFromKnowledgeObjects(profile, [], {}, { userId: "u-health", now: NOW });
check("Leerfall: alle Pflicht-Keys vorhanden, Arrays leer, kein Crash",
  BRIEFING_REQUIRED_KEYS.every((k) => k in empty) && empty.items.length === 0 && empty.personalizedRecommendations.length === 0);

// --- 9) DSGVO: keine Profil-PII in der Ausgabe ------------------------------
const serialized = JSON.stringify(briefing);
check("Keine Profil-PII in der Vertragsausgabe (nur öffentliche Vorgangsdaten + Vorname in Begrüßung)",
  !serialized.includes(profile.fullName) && !serialized.toLowerCase().includes("email"));

// --- 10) primarySource/sources korrekt geformt ------------------------------
const it1 = briefing.items.find((i) => i.vorgangId === "vg-1");
check("Item mit Quelle: primarySource gesetzt, sources nicht leer, linkType direct",
  it1 && it1.primarySource && it1.primarySource.url === "https://bmg.bund.de/pflege" && it1.sources.length >= 1 && it1.linkType === "direct");

console.log(`\n${passed}/${passed + failed} Contract-Adapter-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
