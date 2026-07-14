"use strict";

// Offline-Test + Shadow-Vergleich der Understanding-Priorisierung. REINE LOGIK.
// Zeigt: unter einem knappen Budget waehlt die Prioritaetslogik amtliche/relevante Vorgaenge,
// waehrend die heutige ANKUNFTSREIHENFOLGE spaet eintreffende amtliche Vorgaenge verdraengt.

const P = require("../lib/helmut/quellenarchitektur/understanding-priority");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }
const NOW = Date.parse("2026-07-14T00:00:00Z");

// --- 1. Stufen-Reihenfolge exakt nach Auftrag ---
check("1 amtlich = Stufe 1", P.priorityTier({ amtlich: true }) === P.TIER.AMTLICH);
check("1b hohe Relevanz (verstehen+institution) = Stufe 2", P.priorityTier({ decision: "verstehen", relevance: { hasInstitution: true } }) === P.TIER.HOHE_RELEVANZ);
check("1c Frist (deadline) = Stufe 3", P.priorityTier({ decision: "zurueckstellen", deadline: "2026-07-20" }) === P.TIER.FRIST);
check("1d hohe Wichtigkeit = Stufe 4", P.priorityTier({ importance: 85 }) === P.TIER.WICHTIGKEIT);
check("1e regional (land) = Stufe 5", P.priorityTier({ relevance: { level: "land" } }) === P.TIER.REGIONAL);
check("1f Grenzfall (zurueckstellen) = Stufe 6", P.priorityTier({ decision: "zurueckstellen" }) === P.TIER.GRENZFALL);
check("1g sonst = Stufe 7", P.priorityTier({ decision: "parken" }) === P.TIER.NIEDRIG);

// --- 2. Ordnung: amtlich vor Grenzfall, egal in welcher Eingangsreihenfolge ---
const mix = [
  { id: "grenz1", decision: "zurueckstellen" },
  { id: "amt1", amtlich: true },
  { id: "verstehen1", decision: "verstehen", relevance: { hasInstitution: true } }
];
const ord = P.orderByPriority(mix, NOW).map((c) => c.id);
check("2 Ordnung amtlich > verstehen > grenzfall (unabhaengig vom Eingang)", ord[0] === "amt1" && ord[1] === "verstehen1" && ord[2] === "grenz1");

// --- 3. Shadow-Vergleich: knappes Budget. Prioritaet vs. Ankunftsreihenfolge ---
// 30 Kandidaten: 6 amtliche kommen SPAET (Index 24-29), davor 24 Grenzfaelle. Budget = 10.
const cand = [];
for (let i = 0; i < 24; i++) cand.push({ id: `grenz${i}`, decision: "zurueckstellen", importance: 20 });
for (let i = 0; i < 6; i++) cand.push({ id: `amt${i}`, amtlich: true, structured: true, importance: 50 });
const BUDGET = 10;

// Heutige Logik: Ankunftsreihenfolge -> erste 10 (alle Grenzfaelle), amtliche verdraengt.
const ankunft = cand.slice(0, BUDGET);
const amtlichAnkunft = ankunft.filter((c) => c.amtlich).length;
// Neue Logik: nach Prioritaet.
const sel = P.selectWithinBudget(cand, BUDGET, NOW);

check("3 Ankunftsreihenfolge verdraengt ALLE 6 amtlichen (0 von 6 gewaehlt)", amtlichAnkunft === 0);
check("3b Prioritaet waehlt ALLE 6 amtlichen (0 verdraengt)", sel.amtlichGewaehlt === 6 && sel.amtlichVerdraengt === 0);
check("3c Prioritaet fuellt Restbudget mit hoechster Rest-Prioritaet", sel.gewaehlt.length === BUDGET);
check("3d zurueckgestellt statt verworfen (Deckel-Rest erhalten)", sel.zurueckgestellt.length === cand.length - BUDGET);

// --- 4. Determinismus/Stabilitaet ---
const s1 = P.orderByPriority(cand, NOW).map((c) => c.id).join(",");
const s2 = P.orderByPriority(cand, NOW).map((c) => c.id).join(",");
check("4 deterministisch (identische Ordnung bei Wiederholung)", s1 === s2);

// --- 5. Budget Infinity -> alle gewaehlt, nichts zurueckgestellt ---
const alle = P.selectWithinBudget(cand, Infinity, NOW);
check("5 Budget unbegrenzt -> alle gewaehlt", alle.gewaehlt.length === cand.length && alle.zurueckgestellt.length === 0);

console.log(`\n== Understanding-Priorisierung: ${fail === 0 ? "ALLE TESTS GRÜN" : fail + " FEHLGESCHLAGEN"} · amtlich verdraengt: Ankunft=${6 - amtlichAnkunft>=0?6:0}/6 vs. Prioritaet=${sel.amtlichVerdraengt}/6 ==`);
process.exit(fail > 0 ? 1 : 0);
