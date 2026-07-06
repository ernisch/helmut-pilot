"use strict";

// Offline-Tests der V3-Decision-Engine (lib/helmut/decisions.js).
// KEIN Netz, KEINE KI, KEIN Supabase — reine deterministische Logik + injizierte
// Deps. Prüft: heilige 60/40-Schwelle (Server == Client), Enum-Gültigkeit,
// Determinismus, PROFIL-getriebene (nicht hartkodierte) Bewertung, Fail-safe,
// DSGVO (keine PII in den Entscheidungszeilen).

const decisions = require("../lib/helmut/decisions");

let passed = 0;
let failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// --- Synthetische KOs (wie Goldset: kein Netz) ------------------------------
const koGesundheit = {
  id: "ko-1", vorgang_id: "vg-1", status: "neu", understanding_status: "complete",
  was_ist_passiert: "Reform der Pflegeversicherung vorgestellt.",
  warum_wichtig: "Betrifft Millionen Pflegebedürftige.",
  parteien: ["SPD"], ausschuesse: ["Gesundheit"], tags: ["Pflege"], policy_field: ["Gesundheit"],
  risiken: ["Kürzung der Leistungen"], chancen: [],
  source_document_count: 3, confidence_score: 80
};
const koUmweltChance = {
  id: "ko-2", vorgang_id: "vg-2", status: "neu", understanding_status: "complete",
  was_ist_passiert: "Förderprogramm für Klimaschutz angekündigt.",
  warum_wichtig: "Neue Mittel für Kommunen.",
  parteien: ["Grüne"], ausschuesse: ["Umwelt"], tags: ["Klima"], policy_field: ["Umwelt"],
  risiken: [], chancen: ["Fördermittel für den Wahlkreis"],
  source_document_count: 2, confidence_score: 75
};
const koVerteidigung = {
  id: "ko-3", vorgang_id: "vg-3", status: "neu", understanding_status: "complete",
  was_ist_passiert: "Beschaffung neuer Ausrüstung debattiert.",
  warum_wichtig: "Haushaltsrelevant.",
  parteien: ["CDU"], ausschuesse: ["Verteidigung"], tags: ["Bundeswehr"], policy_field: ["Verteidigung"],
  risiken: [], chancen: [], source_document_count: 1
};
const koPending = { id: "ko-4", vorgang_id: "vg-4", status: "pending", understanding_status: "pending" };

const profileGesundheit = { id: "u-health", party: "SPD", committee: "Gesundheit", focusTopics: ["Pflege", "Krankenhaus"] };
const profileUmwelt = { id: "u-green", party: "Grüne", committee: "Umwelt", focusTopics: ["Klima"] };
const allKos = [koGesundheit, koUmweltChance, koVerteidigung, koPending];

// --- 1) Heilige Schwellenregel (Server == Client) ---------------------------
check("decisionFromScore(60) === 'Sofort reagieren'", decisions.decisionFromScore(60) === "Sofort reagieren");
check("decisionFromScore(59) === 'Beobachten'", decisions.decisionFromScore(59) === "Beobachten");
check("decisionFromScore(40) === 'Beobachten'", decisions.decisionFromScore(40) === "Beobachten");
check("decisionFromScore(39) === 'Ignorieren'", decisions.decisionFromScore(39) === "Ignorieren");
check("decisionFromScore(0) === 'Ignorieren'", decisions.decisionFromScore(0) === "Ignorieren");
check("decisionFromScore(100) === 'Sofort reagieren'", decisions.decisionFromScore(100) === "Sofort reagieren");

// --- 2) scoreKnowledgeObject: deterministisch, 0..100, feature-getrieben -----
const strongMatch = { similarity: 0.7, matched_features: [{ type: "ausschuss", value: "Gesundheit" }, { type: "partei", value: "SPD" }, { type: "thema", value: "Pflege" }] };
const sc = decisions.scoreKnowledgeObject(koGesundheit, strongMatch);
check("Starker Treffer (Ausschuss+Partei+Thema) -> Score >= 60", sc >= 60, `score=${sc}`);
check("Score bleibt in [0,100]", sc >= 0 && sc <= 100, `score=${sc}`);
check("scoreKnowledgeObject ist deterministisch", decisions.scoreKnowledgeObject(koGesundheit, strongMatch) === sc);
const noMatch = decisions.scoreKnowledgeObject(koGesundheit, { similarity: 0, matched_features: [] });
check("Kein Treffer + keine Ähnlichkeit -> niedriger Score (< 40)", noMatch < 40, `score=${noMatch}`);
check("Ausschuss-Treffer wiegt mehr als reiner Themen-Treffer",
  decisions.scoreKnowledgeObject(koGesundheit, { similarity: 0, matched_features: [{ type: "ausschuss", value: "X" }] })
  > decisions.scoreKnowledgeObject(koGesundheit, { similarity: 0, matched_features: [{ type: "thema", value: "X" }] }));

// --- 3) priorityType: gültiger Enum-Wert, Richtung aus Risiko/Chance ---------
check("priorityTypeFor(<40) === 'ignore'", decisions.priorityTypeFor(30, koGesundheit) === "ignore");
check("Risiko-KO -> priority_type 'risk'", decisions.priorityTypeFor(75, koGesundheit) === "risk");
check("Chance-KO -> priority_type 'chance'", decisions.priorityTypeFor(75, koUmweltChance) === "chance");
check("Neutraler KO, hoher Score -> 'high'", decisions.priorityTypeFor(85, koVerteidigung) === "high");
check("Neutraler KO, mittlerer Score -> 'action'", decisions.priorityTypeFor(65, koVerteidigung) === "action");
check("Neutraler KO, Score 40..59 -> 'watch'", decisions.priorityTypeFor(45, koVerteidigung) === "watch");

// --- 4) decideForUser: Konsistenz, Enums, Determinismus, Pending-Ausschluss --
const decA = decisions.decideForUser(profileGesundheit, allKos, { userId: "u-health" });
check("decideForUser liefert Entscheidungen", Array.isArray(decA) && decA.length > 0, `n=${decA.length}`);
check("Pending-KOs werden NIE bewertet", decA.every((d) => d.knowledge_object_id !== "ko-4"));
check("Jede decision ∈ DECISION_ENUM", decA.every((d) => decisions.DECISION_ENUM.includes(d.decision)));
check("Jeder priority_type ∈ PRIORITY_TYPE_ENUM", decA.every((d) => decisions.PRIORITY_TYPE_ENUM.includes(d.priority_type)));
check("HEILIGE Konsistenz: decisionFromScore(score) === decision (jede Zeile)",
  decA.every((d) => decisions.decisionFromScore(d.score) === d.decision),
  decA.map((d) => `${d.knowledge_object_id}:${d.score}/${d.decision}`).join(" "));
const decA2 = decisions.decideForUser(profileGesundheit, allKos, { userId: "u-health" });
check("decideForUser ist deterministisch (2 Läufe gleich)", JSON.stringify(decA) === JSON.stringify(decA2));
const gesEntry = decA.find((d) => d.knowledge_object_id === "ko-1");
check("Gesundheits-KO ist für das Gesundheits-Profil relevant (Sofort reagieren)",
  gesEntry && gesEntry.decision === "Sofort reagieren", gesEntry && `score=${gesEntry.score}`);
check("Risiko-KO trägt priority_type 'risk' + risk-Label", gesEntry && gesEntry.priority_type === "risk" && gesEntry.risk === "Kürzung der Leistungen");

// --- 5) KEIN hartkodierter Mandats-Bias: Bewertung folgt dem PROFIL ----------
const decB = decisions.decideForUser(profileUmwelt, allKos, { userId: "u-green" });
const gesForGreen = decB.find((d) => d.knowledge_object_id === "ko-1");
const umweltForGreen = decB.find((d) => d.knowledge_object_id === "ko-2");
check("Gesundheits-KO für Umwelt-Profil deutlich schwächer (kein universeller Boost)",
  !gesForGreen || gesForGreen.score < (gesEntry ? gesEntry.score : 100),
  `green:${gesForGreen ? gesForGreen.score : "absent"} health:${gesEntry ? gesEntry.score : "?"}`);
check("Umwelt-Chance-KO ist für das Umwelt-Profil relevant + priority_type 'chance'",
  umweltForGreen && umweltForGreen.priority_type === "chance" && umweltForGreen.chance === "Fördermittel für den Wahlkreis",
  umweltForGreen && `score=${umweltForGreen.score}`);

// --- 6) DSGVO: keine PII in den Entscheidungszeilen -------------------------
const serialized = JSON.stringify(decA);
check("Entscheidungszeile enthält keine Profil-PII (nur user_id als Referenz)",
  !serialized.includes("Krankenhaus") && !serialized.toLowerCase().includes("email"));
check("matched_features tragen nur öffentliche Labels {type,value}",
  decA.every((d) => (d.matched_features || []).every((f) => {
    const keys = Object.keys(f).sort();
    return keys.length === 2 && keys[0] === "type" && keys[1] === "value";
  })));
check("Stabile, upsertbare id dec-<user>-<ko>", decA.every((d) => d.id === `dec-u-health-${d.knowledge_object_id}`));

// --- Review-Fixes: Freitext-Kappung + vorgang_id-Verkettung -----------------
const koLongRisk = {
  id: "ko-long", vorgang_id: "vg-long", status: "neu", understanding_status: "complete",
  was_ist_passiert: "x", parteien: ["SPD"], ausschuesse: ["Gesundheit"], risiken: ["R".repeat(500)]
};
const decLong = decisions.buildDecision("u-health", koLongRisk, { similarity: 0.5, matched_features: [{ type: "ausschuss", value: "Gesundheit" }] });
check("Freitext risk/chance wird gekappt (Datenminimierung, <= 240)", decLong.risk != null && decLong.risk.length <= 240, `len=${decLong.risk && decLong.risk.length}`);
check("Entscheidung trägt vorgang_id (Verkettung zum Vorgang)", decLong.vorgang_id === "vg-long");

// --- 7) runDecisionShadow: Fail-safe + Happy-Path (injizierte Deps) ----------
(async () => {
  const off = await decisions.runDecisionShadow({ userId: "u-health" }, { enabled: () => false });
  check("runDecisionShadow: Store aus -> skipped (v3-store-disabled)", off.skipped && off.reason === "v3-store-disabled");

  const noProfile = await decisions.runDecisionShadow({ userId: "u-x" }, { enabled: () => true, getProfile: () => null });
  check("runDecisionShadow: kein Profil -> skipped (no-profile)", noProfile.skipped && noProfile.reason === "no-profile");

  let savedRows = null;
  const ok = await decisions.runDecisionShadow({ userId: "u-health" }, {
    enabled: () => true,
    getProfile: () => profileGesundheit,
    listKnowledgeObjects: () => allKos,
    saveDecisions: (rows) => { savedRows = rows; return { saved: rows.length }; }
  });
  check("runDecisionShadow Happy-Path: candidates == saved > 0", ok.saved > 0 && ok.saved === ok.candidates, JSON.stringify(ok));
  check("runDecisionShadow: gespeicherte Zeilen tragen user_id + score + decision",
    Array.isArray(savedRows) && savedRows.every((r) => r.user_id === "u-health" && typeof r.score === "number" && r.decision));
  check("runDecisionShadow: Pending-KOs nie gespeichert", Array.isArray(savedRows) && savedRows.every((r) => r.knowledge_object_id !== "ko-4"));

  const saveErr = await decisions.runDecisionShadow({ userId: "u-health" }, {
    enabled: () => true, getProfile: () => profileGesundheit, listKnowledgeObjects: () => [], saveDecisions: () => ({ skipped: true })
  });
  check("runDecisionShadow: keine verstandenen KOs -> skipped (no-vorgaenge)", saveErr.skipped && saveErr.reason === "no-vorgaenge");

  console.log(`\n${passed}/${passed + failed} Decision-Assertions erfolgreich.`);
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
})();
