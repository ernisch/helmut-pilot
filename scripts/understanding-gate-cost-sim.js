"use strict";

// SIMULATION Kosten/Einsparung des Understanding-Gate. KEINE erfundenen Production-Zahlen:
// alle Anker sind READ-ONLY aus echten 7-14-Tage-Werten gemessen (unten mit Quelle kommentiert).
// Die einzige echte ANNAHME ist die Promotion-Rate des guenstigen Zweitmodells -> als Band
// (Best/Real/Worst) ausgewiesen. Preise/Modelle EXAKT wie im Code (storage.llmPriceTable).
//
// EHRLICHE KERNAUSSAGE (wichtig): Understanding laeuft pro CLUSTER, nicht pro Dokument. Ein
// Cluster wird schon verstanden, wenn EIN Quelldokument relevant ist. Real gemessen haben nur
// ~23% der bestehenden Cluster ein 'verstehen'-Dokument, ~76% sind reine 'zurueckstellen'-
// Grenzfaelle, ~1% komplett unpolitisch. Der Hebel ist daher NICHT "weniger Cluster verstehen",
// sondern das GUENSTIGE TRIAGE (gpt-4o-mini) der 76% Grenzfaelle VOR dem 30x teureren gpt-5-mini.
// Ohne echte Ablehnung im Triage spart das Gate wenig; mit Ablehnung deutlich.

// --- Real gemessene Anker (read-only) --------------------------------------------------------
const REAL = {
  crawlfundeKandidaten: 20240, neueEindeutigeDocs: 2280,     // crawlRuns / raw_documents, 7 Tage
  understandingNachfrageCluster: 574,                         // 99 ausgefuehrt + 475 gedeckelt
  understandingPromptTokAvg: 3049, understandingComplTokAvg: 881, // llmUsage understanding, 7 Tage
  // Gate-Verteilung DOKUMENT-Ebene (kalibriert, 7 Tage): verstehen/zurueckstellen/parken(+hygiene)
  docSplit: { verstehen: 989, zurueckstellen: 742, parken: 549 },
  // Gate-Verteilung CLUSTER-Ebene (echte KOs mit Quelldocs): hat >=1 verstehen / nur zurueck / nur geparkt
  clusterSplit: { mitVerstehen: 39, nurZurueck: 129, nurGeparkt: 2 }
};
const PRICE = { "gpt-5-mini": { in: 0.25, out: 2.0 }, "gpt-4o-mini": { in: 0.15, out: 0.6 } };
const callCost = (m, i, o) => (i / 1e6) * PRICE[m].in + (o / 1e6) * PRICE[m].out;

const kostenFull = callCost("gpt-5-mini", REAL.understandingPromptTokAvg, REAL.understandingComplTokAvg); // je Cluster
const kostenCheap = callCost("gpt-4o-mini", 400, 40);                                                     // je Grenzfall-Check
const clusterDichte = REAL.neueEindeutigeDocs / REAL.understandingNachfrageCluster;                       // Docs/Cluster
const anteilNeu = REAL.neueEindeutigeDocs / REAL.crawlfundeKandidaten;

const dTot = REAL.docSplit.verstehen + REAL.docSplit.zurueckstellen + REAL.docSplit.parken;
const dV = REAL.docSplit.verstehen / dTot, dZ = REAL.docSplit.zurueckstellen / dTot, dP = REAL.docSplit.parken / dTot;
const cTot = REAL.clusterSplit.mitVerstehen + REAL.clusterSplit.nurZurueck + REAL.clusterSplit.nurGeparkt;
const cV = REAL.clusterSplit.mitVerstehen / cTot, cZ = REAL.clusterSplit.nurZurueck / cTot, cP = REAL.clusterSplit.nurGeparkt / cTot;

const usd = (x) => "$" + x.toFixed(4);
const pct = (x) => (x * 100).toFixed(1) + "%";

// Kosten fuer N CLUSTER unter dem Gate (Cluster-Ebene: verstehen-Cluster voll; nur-zurueck-Cluster
// erst Cheap-Check, davon Anteil promote voll; nur-geparkt entfaellt).
function clusterKosten(nCluster, promote) {
  const ohne = nCluster * kostenFull;
  const voll = nCluster * cV * kostenFull;
  const grenz = nCluster * cZ;
  const mit = voll + grenz * kostenCheap + grenz * promote * kostenFull;
  return { ohne, mit, spar: ohne - mit, sparPct: 1 - mit / ohne };
}
// Kosten fuer M NEUE DOKUMENTE (Doc-Ebene -> Cluster ueber Dichte; nur verstehen+promovierte zurueck).
function docKosten(mDocs, promote) {
  const clusterOhne = mDocs / clusterDichte;
  const ohne = clusterOhne * kostenFull;
  const vollDocs = mDocs * dV, zDocs = mDocs * dZ;
  const mit = (vollDocs / clusterDichte) * kostenFull + zDocs * kostenCheap + (zDocs * promote / clusterDichte) * kostenFull;
  return { ohne, mit, spar: ohne - mit, sparPct: 1 - mit / ohne };
}

console.log("== SIMULATION Understanding-Gate — reale Anker, Best/Real/Worst =========================\n");
console.log("Reale Messwerte (read-only):");
console.log(`  neue Docs/7T=${REAL.neueEindeutigeDocs}  Understanding-Nachfrage=${REAL.understandingNachfrageCluster} Cluster  Dichte=${clusterDichte.toFixed(2)} Docs/Cluster`);
console.log(`  Kosten/Cluster(gpt-5-mini ${REAL.understandingPromptTokAvg}in/${REAL.understandingComplTokAvg}out)=${usd(kostenFull)}   Cheap-Check(gpt-4o-mini)=${usd(kostenCheap)} (${(kostenFull/kostenCheap).toFixed(0)}x guenstiger)`);
console.log(`  Doc-Ebene: verstehen ${pct(dV)} / zurueck ${pct(dZ)} / parken ${pct(dP)}`);
console.log(`  Cluster-Ebene: mit verstehen-Doc ${pct(cV)} / nur zurueck ${pct(cZ)} / nur geparkt ${pct(cP)}\n`);

const BANDS = [["Best  (Triage lehnt alle Grenzfaelle ab, promote 0%)", 0.0], ["Real  (promote 50%)", 0.5], ["Worst (Triage bestaetigt alle, promote 100%)", 1.0]];
console.log("--- 100 NEUE VORGANGS-CLUSTER (Cluster-Ebene, ehrlichster Bezug) ---");
for (const [label, p] of BANDS) { const r = clusterKosten(100, p); console.log(`  ${label.padEnd(52)} ohne ${usd(r.ohne)} -> mit ${usd(r.mit)}  Ersparnis ${usd(r.spar)} (${pct(r.sparPct)})`); }
console.log("\n--- 1000 NEUE DOKUMENTE (Doc-Ebene) ---");
for (const [label, p] of BANDS) { const r = docKosten(1000, p); console.log(`  ${label.padEnd(52)} ohne ${usd(r.ohne)} -> mit ${usd(r.mit)}  Ersparnis ${usd(r.spar)} (${pct(r.sparPct)})`); }
console.log(`\n--- 1000 CRAWLFUNDE (=> ${(1000*anteilNeu).toFixed(0)} neue Docs, Anteil neu ${pct(anteilNeu)}) ---`);
for (const [label, p] of BANDS) { const r = docKosten(1000 * anteilNeu, p); console.log(`  ${label.padEnd(52)} ohne ${usd(r.ohne)} -> mit ${usd(r.mit)}  Ersparnis ${usd(r.spar)} (${pct(r.sparPct)})`); }

console.log("\nEHRLICHE BEWERTUNG (Kosten vs. Qualitaet getrennt):");
console.log("- Kosten: Der Hebel ist das guenstige Triage der 76% Grenzfall-Cluster, NICHT das Wegfallen");
console.log("  von Clustern (nur ~1% entfallen ganz). Im Worst Case (Triage bestaetigt alles) kann das");
console.log("  Gate durch den Zusatzschritt minimal teurer sein -> die Triage-Ablehnungsrate ist der");
console.log("  entscheidende, im Shadow-Betrieb zu messende Wert.");
console.log("- Qualitaet: 0 echte kritische Fehler (kein relevantes KO verliert alle Quellen). Amtliche");
console.log("  Dokumente nie geparkt. Grenzfaelle werden zurueckgestellt (Cheap-Check), nie geloescht.");
console.log("- Der groesste Nutzen ist nicht die aktuelle kleine Rechnung (~$0,37/Woche gesamt), sondern");
console.log("  (a) den blinden Tagesdeckel durch Relevanz-Prioritaet ersetzen zu koennen und (b) bei");
console.log("  Skalierung (BE/BB + mehr Quellen) die teuren gpt-5-mini-Calls auf Relevantes zu begrenzen.");
