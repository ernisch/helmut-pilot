"use strict";

// SIMULATION der Kosten/Einsparung des Understanding-Gate fuer 1000 Crawlfunde.
// =============================================================================================
// KEINE erfundenen Production-Zahlen: alle Verhaeltnisse stammen aus READ-ONLY gemessenen
// echten 7-Tage-Werten (09.-14.07.2026) und sind unten mit Quelle kommentiert. Nur die
// Promotion-Rate zurueckgestellter Grenzfaelle ist eine ANNAHME -> als Sensitivitaetsband
// (0 % / 40 % / 100 %) ausgewiesen. Die Modell-/Preislogik ist die im Code TATSAECHLICH
// verwendete (storage.llmPriceTable + ai.understandingModelName).

// --- Real gemessene Konstanten (read-only, Production) ---------------------------------------
const REAL = {
  // crawlRuns (helmut_store 'main'), 7 Tage: Summe newCandidateItems und neue eindeutige docs.
  crawlfundeKandidaten: 20240,        // Kandidaten nach Crawl-Dedup + Cap
  neueEindeutigeDocs: 2280,           // raw_documents (alle distinct content_hash) 7 Tage
  // llmUsage (helmut_store 'main-auth'), 7 Tage, callType 'understanding' (+ skipped-budget):
  understandingNachfrageCluster: 574, // 99 ausgefuehrt + 475 durch Tagesdeckel geblockt
  understandingPromptTokAvg: 3049,    // 301846 / 99
  understandingComplTokAvg: 881,      // 87186 / 99
  // Gate-Entscheidung, gemessen auf den echten 2280 Titeln (SQL-Signalzaehlung):
  gate: { verstehen: 630, zurueckstellen: 629, parken: 1021 } // 35 amtlich +541 Inst +54 T&P / 380 T +249 P / 1021
};

// Preise EXAKT wie storage.llmPriceTable() (USD je 1 Mio. Token).
const PRICE = { "gpt-5-mini": { in: 0.25, out: 2.0 }, "gpt-4o-mini": { in: 0.15, out: 0.6 } };
function callCost(model, inTok, outTok) { const p = PRICE[model]; return (inTok / 1e6) * p.in + (outTok / 1e6) * p.out; }

// Abgeleitete reale Kennzahlen -----------------------------------------------------------------
const anteilNeu = REAL.neueEindeutigeDocs / REAL.crawlfundeKandidaten;                 // 0.1126
const clusterDichte = REAL.neueEindeutigeDocs / REAL.understandingNachfrageCluster;    // 3.972 docs/cluster
const kostenProUnderstanding = callCost("gpt-5-mini", REAL.understandingPromptTokAvg, REAL.understandingComplTokAvg);
const kostenProVerstandenemDoc = kostenProUnderstanding / clusterDichte;               // effektiv je Doc
// Guenstiges Relevanz-Check-Modell fuer Grenzfaelle: kleiner Prompt (Titel+Summary+kurze Regelfrage).
const cheapInTok = 400, cheapOutTok = 40;
const kostenProCheap = callCost("gpt-4o-mini", cheapInTok, cheapOutTok);

const g = REAL.gate, gTot = g.verstehen + g.zurueckstellen + g.parken;
const pVerstehen = g.verstehen / gTot, pZurueck = g.zurueckstellen / gTot, pParken = g.parken / gTot;

function eur(x) { return "$" + x.toFixed(4); }
function pct(x) { return (x * 100).toFixed(1) + "%"; }

function simulate(basisDocs, promoteRate) {
  const verstehen = basisDocs * pVerstehen;
  const zurueck = basisDocs * pZurueck;
  const parken = basisDocs * pParken;
  const kostenOhneGate = basisDocs * kostenProVerstandenemDoc;               // alle Docs voll verstehen
  const kostenVerstehen = verstehen * kostenProVerstandenemDoc;
  const kostenCheap = zurueck * kostenProCheap;                             // jeder Grenzfall 1 guenstiger Check
  const kostenPromoted = zurueck * promoteRate * kostenProVerstandenemDoc;  // Anteil danach voll verstanden
  const kostenMitGate = kostenVerstehen + kostenCheap + kostenPromoted;
  return { verstehen, zurueck, parken, kostenOhneGate, kostenMitGate,
    einsparung: kostenOhneGate - kostenMitGate, einsparPct: 1 - kostenMitGate / kostenOhneGate };
}

console.log("== SIMULATION Understanding-Gate — reale 7-Tage-Verhaeltnisse (keine erfundenen Zahlen) ==\n");
console.log("Reale Anker (read-only gemessen, 09.-14.07.2026):");
console.log(`  Crawlfunde(Kandidaten)=${REAL.crawlfundeKandidaten}  neue eindeutige Docs=${REAL.neueEindeutigeDocs}  (Anteil neu ${pct(anteilNeu)})`);
console.log(`  Understanding-Nachfrage=${REAL.understandingNachfrageCluster} Cluster  Cluster-Dichte=${clusterDichte.toFixed(2)} Docs/Cluster`);
console.log(`  Kosten/Understanding-Call (gpt-5-mini, Ø ${REAL.understandingPromptTokAvg}in/${REAL.understandingComplTokAvg}out) = ${eur(kostenProUnderstanding)}`);
console.log(`  -> effektiv ${eur(kostenProVerstandenemDoc)}/verstandenem Doc   guenstiger Check (gpt-4o-mini) = ${eur(kostenProCheap)}/Doc`);
console.log(`  Gate-Verteilung (real gemessen): verstehen ${pct(pVerstehen)} · zurueckstellen ${pct(pZurueck)} · parken ${pct(pParken)}\n`);

for (const [label, basis] of [["1000 CRAWLFUNDE (Kandidaten)", 1000 * anteilNeu], ["1000 NEUE eindeutige Dokumente", 1000]]) {
  console.log(`--- Bezug: ${label}  (=> ${basis.toFixed(0)} neue Docs in die Vorpruefung) ---`);
  console.log(`    Gate: verstehen=${(basis*pVerstehen).toFixed(0)}  zurueckstellen=${(basis*pZurueck).toFixed(0)}  parken=${(basis*pParken).toFixed(0)}`);
  for (const promote of [0.0, 0.4, 1.0]) {
    const r = simulate(basis, promote);
    console.log(`    Promotion ${pct(promote).padStart(6)} der Grenzfaelle: ohne Gate ${eur(r.kostenOhneGate)}  ->  mit Gate ${eur(r.kostenMitGate)}   Einsparung ${eur(r.einsparung)} (${pct(r.einsparPct)})`);
  }
  console.log("");
}

console.log("Hinweise: 'ohne Gate' = alle neuen Docs voll verstehen (heute nur durch blinden Tages-");
console.log("Call-Deckel gebremst, der nach Ankunftszeit statt Relevanz verwirft). Promotion-Rate =");
console.log("Anteil zurueckgestellter Grenzfaelle, die ein guenstiges Modell als relevant bestaetigt");
console.log("(ANNAHME, als Band gezeigt). Alle uebrigen Zahlen sind real gemessen.");
