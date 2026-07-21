"use strict";

// Helmut — Quellenplattform · Sprint 4 (Shadow) · Interner, reproduzierbarer Bericht (Aufgabe 8).
// =============================================================================================
// Aggregiert einen Shadow-Batch zu einem internen Read-Model (KEINE Admin-Oberflaeche). Reine
// Logik, deterministisch, PII-frei (nur technische Kennzahlen + anonymisierte Referenzen).

function count(arr, pred) { return arr.filter(pred).length; }

// Klassifiziert ein Mandat gesamthaft: blockiert > schlechter > besser > gleichwertig.
// Ehrlich: viele Dimensionen sind ohne Produktions-Read 'nicht_vergleichbar' — das wird als
// Vorbehalt mitgefuehrt (nicht als 'gleichwertig' geschoengt).
function classify(res) {
  if (res.abort.notFreigabefaehig) return "blockiert";
  const b = res.comparison.besser.length, s = res.comparison.schlechter.length;
  if (s > b) return "schlechter";
  if (b > s) return "besser";
  return "gleichwertig";
}

function buildInternalReport(batch, opts = {}) {
  const results = batch.results || [];
  const klass = results.map(classify);

  // Aggregierte Luecken/Unterversorgung.
  const gapCounter = new Map();       // "dim:wert" -> count
  const parteiUnter = new Map();
  const ausschussUnter = new Map();
  const regionUnter = new Map();
  let searchDepAgg = 0, searchDepN = 0;
  const legalUnchecked = new Set();
  const technicalDefects = new Set();
  const differenceCounter = new Map(); // dimension -> {besser, schlechter}

  for (const res of results) {
    const neu = res.shadow.neu;
    if (neu) {
      for (const g of neu.versorgungsluecken || []) {
        bump(gapCounter, `${g.dimension}:${g.wert}`);
        if (g.dimension === "parties" || g.dimension === "factions") bump(parteiUnter, g.wert);
        if (g.dimension === "committees") bump(ausschussUnter, g.wert);
        if (g.dimension === "regions") bump(regionUnter, g.wert);
      }
      searchDepAgg += neu.suchanbieterAbhaengigkeit.anteil; searchDepN += 1;
      for (const s of neu.sources || []) {
        if (s.trust === "unbekannt" || s.trust == null) legalUnchecked.add(s.id);
        if (s.gesundheit === "broken") technicalDefects.add(s.id);
      }
    }
    for (const d of res.comparison.dimensions || []) {
      if (d.verdict === "besser" || d.verdict === "schlechter") {
        const rec = differenceCounter.get(d.dimension) || { besser: 0, schlechter: 0 };
        rec[d.verdict] += 1; differenceCounter.set(d.dimension, rec);
      }
    }
  }

  const report = {
    generatedFrom: opts.label || "shadow-batch",
    // 1
    mandateGesamt: results.length,
    // 2-5
    besser: count(klass, (k) => k === "besser"),
    gleichwertig: count(klass, (k) => k === "gleichwertig"),
    schlechter: count(klass, (k) => k === "schlechter"),
    blockiert: count(klass, (k) => k === "blockiert"),
    // 6
    groessteVersorgungsluecken: topN(gapCounter, 10),
    // 7-9
    parteienUnterversorgt: topN(parteiUnter, 10),
    ausschuesseUnterversorgt: topN(ausschussUnter, 10),
    regionenUnterversorgt: topN(regionUnter, 10),
    // 10
    suchanbieterAbhaengigkeitDurchschnitt: searchDepN ? round3(searchDepAgg / searchDepN) : 0,
    mandateMitSuchanbieterAlleinversorgung: count(results, (r) => r.shadow.neu && (r.shadow.neu.suchanbieterAbhaengigkeit.alleinversorgungPflicht || []).length > 0),
    // 11
    rechtlichUngepruefteQuellen: [...legalUnchecked].sort(),
    // 12
    technischeDefekte: [...technicalDefects].sort(),
    // 13
    unterschiedeLegacyNeu: [...differenceCounter.entries()].map(([dimension, v]) => ({ dimension, ...v })).sort((a, b) => a.dimension.localeCompare(b.dimension)),
    // Vorbehalt: Anteil nicht abschliessend vergleichbarer Dimensionen (Ehrlichkeit).
    nichtVergleichbarAnteil: results.length ? round3(avg(results.map((r) => r.comparison.nichtVergleichbar.length / Math.max(1, r.comparison.dimensions.length)))) : 0,
    // Invarianten
    invarianten: {
      legacyImmerSichtbar: results.every((r) => r.shadow.legacyIntact === true),
      neuNieAutoAktiv: results.every((r) => r.abort.autoActivateNewAllowed === false),
      telemetriePiiFrei: results.every((r) => r.telemetry.clean === true),
      alleBlockerBenannt: results.every((r) => r.abort.blockers.every((b) => b.detail && b.detail.length > 0))
    },
    // 14 klare Empfehlung
    empfehlung: buildRecommendation(results, gapCounter)
  };
  return report;
}

function buildRecommendation(results, gapCounter) {
  const blocked = results.filter((r) => r.abort.notFreigabefaehig).length;
  const searchDep = results.filter((r) => r.shadow.neu && (r.shadow.neu.suchanbieterAbhaengigkeit.alleinversorgungPflicht || []).length > 0).length;
  const steps = [];
  if (searchDep) steps.push("Herausgeber-Wege gegen Suchanbieter-Alleinversorgung der Pflichtbedarfe befuellen (Abbruchregel 3 aufloesen).");
  const topGaps = topN(gapCounter, 3).map((g) => g.key);
  if (topGaps.length) steps.push(`Fach-/Partei-/Regionalquellen fuer die groessten Luecken befuellen: ${topGaps.join(", ")}.`);
  steps.push("Reale Gesundheits-/Qualitaetsdaten ueber einen sicheren, mandantengetrennten Lesepfad anschliessen (heute offline: ehrlich unbekannt).");
  steps.push("Aktivierung bleibt separat + freigabepflichtig — kein automatischer Wechsel.");
  return {
    freigabefaehigeMandate: results.length - blocked,
    blockierteMandate: blocked,
    naechsterSprint: steps
  };
}

function bump(map, key) { map.set(key, (map.get(key) || 0) + 1); }
function topN(map, n) {
  return [...map.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)).slice(0, n);
}
function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function round3(x) { return Math.round(x * 1000) / 1000; }

module.exports = { buildInternalReport, classify };
