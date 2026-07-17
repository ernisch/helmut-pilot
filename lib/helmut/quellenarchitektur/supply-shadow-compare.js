"use strict";

// Helmut — Quellenarchitektur · Sprint 6: Alt-gegen-Neu-Versorgungsvergleich
// (Bestandsschutz fuer JEDES Mandat).
//
// REINE, DETERMINISTISCHE LOGIK. Kein Netz, keine KI, kein Storage-Write, KEIN Rendering.
// Vergleicht die QUELLENVERSORGUNG eines Profils in der ALTEN Welt (v1Sources-Auswahl, das
// was der Mandant heute erlebt) gegen die NEUE Welt (Paketauflösung -> Abrufwege). Ziel des
// Auftrags: die Versorgung eines bestehenden Mandats darf sich NICHT verschlechtern;
// kein Datenverlust.
//
// EHRLICHKEIT: Ein Unterschied ist NICHT automatisch eine Verschlechterung. Zwei Fälle sind
// ausdrücklich ERKLÄRTE, gewollte Konsolidierung (keine Regression):
//   1. orphan_legacy — eine dynamische Legacy-Mehrfachsuche ("<mandats-id>-news-<suffix>"),
//      die durch die EINE Personenquelle abgelöst wurde (ORPHAN_CLASSIFICATION).
//   2. Personenquellen-Konsolidierung — eine Alt-ID `X-<suffix>`, deren Basis-ID `X` in der
//      neuen Welt vorhanden ist (die Mehrfachsuche wird zur einen Personen-/Paketquelle).
// Nur ein Wegfall OHNE solche Erklärung ist eine echte Regression.
//
// Das Flag HELMUT_V3_SHADOW_COMPARE (default AUS) ist der spätere Live-Schalter für den
// Schattenvergleich. In Stufe 1 wird er NICHT scharf in Scheduler/Server verdrahtet
// (freigabepflichtig) — hier nur die reine Lesefunktion.

// Reiner Flag-Leser (default AUS). Verdrahtung in den Live-Pfad ist freigabepflichtig.
function shadowCompareEnabled(env) {
  const raw = (env && typeof env === "object" ? env.HELMUT_V3_SHADOW_COMPARE : undefined);
  const v = String(raw == null ? "" : raw).trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "shadow";
}

function toIdSet(ids) {
  const out = new Set();
  if (!ids) return out;
  const list = ids instanceof Set ? [...ids] : (Array.isArray(ids) ? ids : []);
  for (const id of list) { const s = String(id == null ? "" : id).trim(); if (s) out.add(s); }
  return out;
}

// Erklärt einen ausschliesslich in ALT vorhandenen Wegfall — oder gibt null zurück (= echte Regression).
// consolidationBases: Set EXPLIZIT deklarierter Basis-IDs (z. B. die Personenquelle "<mandats-id>-news"),
// deren `X-<suffix>`-Mehrfachsuchen als konsolidiert gelten dürfen. Ohne diese Deklaration wird
// KEIN Prefix-Match gemacht (Preflight-Befund M2: ein blinder Prefix-Match würde eine
// eigenständige Quelle „X-fake" fälschlich zu „X" konsolidieren und aus dem Regressions-Konto entfernen).
function explainOnlyAlt(id, newIdSet, orphanClassification, consolidationBases) {
  // NUR die explizite Karte des Aufrufers erklaert Orphans — kein Muster-Fallback
  // (der wuerde lebende Mandats-Mehrfachsuchen "<id>-news-<suffix>" maskieren).
  const klass = orphanClassification && orphanClassification[id];
  if (klass === "orphan_legacy") return { reason: "orphan_legacy", detail: "Legacy-Mehrfachsuche, durch die eine Personenquelle abgelöst (Dokumente bleiben erhalten)." };
  if (klass === "orphan_test") return { reason: "orphan_test", detail: "Testmüll (totes Testprofil), bewusst nicht übernommen." };
  // Personenquellen-Konsolidierung NUR für ausdrücklich deklarierte Basis-IDs (kein blinder Prefix-Match).
  if (consolidationBases && consolidationBases.size) {
    for (const nid of newIdSet) {
      if (nid && consolidationBases.has(nid) && id.startsWith(nid + "-")) {
        return { reason: "konsolidiert", detail: `Zur ausdrücklich deklarierten Basisquelle „${nid}" konsolidiert.` };
      }
    }
  }
  return null; // unerklärt -> echte Regression
}

// Kernvergleich. altSourceIds/newSourceIds = legacy_source_ids (ALT: v1Sources-Auswahl,
// NEU: aktive Abrufwege der aufgelösten Pakete). docsBySource optional: Map/Objekt id->count.
// consolidationBases optional: explizit deklarierte Personenquellen-Basis-IDs (siehe explainOnlyAlt).
function compareSupply({ altSourceIds, newSourceIds, orphanClassification = {}, docsBySource = null, consolidationBases = null } = {}) {
  const alt = toIdSet(altSourceIds);
  const neu = toIdSet(newSourceIds);
  const bases = toIdSet(consolidationBases);
  const both = [], onlyAlt = [], onlyNew = [];
  for (const id of alt) (neu.has(id) ? both : onlyAlt).push(id);
  for (const id of neu) if (!alt.has(id)) onlyNew.push(id);

  // Dokumentzahl: fehlt der Eintrag im Snapshot -> null (UNBEKANNT), NICHT 0 (Preflight-Befund M3:
  // eine seltene Quelle außerhalb des raw_documents-Fensters darf nicht als „0 Dokumente" gelten).
  const docCount = (id) => {
    if (!docsBySource) return null;
    const has = docsBySource instanceof Map ? docsBySource.has(id) : Object.prototype.hasOwnProperty.call(docsBySource, id);
    if (!has) return null;
    const v = docsBySource instanceof Map ? docsBySource.get(id) : docsBySource[id];
    return Number.isFinite(Number(v)) ? Number(v) : null;
  };
  const docsAvailable = docsBySource != null;

  const onlyAltExplained = [], onlyAltUnexplained = [];
  for (const id of onlyAlt) {
    const ex = explainOnlyAlt(id, neu, orphanClassification, bases);
    if (ex) onlyAltExplained.push({ id, ...ex, docs: docCount(id) });
    else onlyAltUnexplained.push({ id, docs: docCount(id) });
  }

  // „Dokumente in Gefahr": Summe bekannter Dokumentzahlen unerklärter Wegfälle. Unbekannte
  // Zahlen (null) werden NICHT auf 0 gesetzt, sondern separat als Risiko markiert.
  let docsAtRisk = null, unknownDocsRisk = false;
  if (docsAvailable) {
    docsAtRisk = onlyAltUnexplained.reduce((s, e) => s + (e.docs || 0), 0);
    unknownDocsRisk = onlyAltUnexplained.some((e) => e.docs == null);
  }

  // Regression = mind. ein unerklärter Wegfall, der real Dokumente liefert ODER dessen
  // Dokumentzahl UNBEKANNT ist (konservativ). Nur unerklärt + nachweislich 0 Dokumente -> Struktur-Warnung.
  const hardRegression = onlyAltUnexplained.length > 0 && (!docsAvailable || docsAtRisk > 0 || unknownDocsRisk);
  const verdict = hardRegression ? "regression"
    : (onlyAltUnexplained.length > 0 ? "struktur_warnung"
      : (onlyAltExplained.length > 0 ? "erklaerte_konsolidierung" : "keine_verschlechterung"));

  return {
    altCount: alt.size, newCount: neu.size,
    bothCount: both.length,
    both: both.sort(),
    onlyAlt: onlyAlt.sort(),
    onlyNew: onlyNew.sort(),
    onlyAltExplained,
    onlyAltUnexplained,
    docsAvailable, docsAtRisk,
    regression: hardRegression,
    verdict,
    // Ehrliche Kurzaussage für Bericht/Admin.
    summary: hardRegression
      ? `REGRESSION: ${onlyAltUnexplained.length} Quelle(n) ohne Erklärung würden dem Mandat wegfallen${docsAvailable ? ` (${docsAtRisk} Dokumente betroffen)` : ""}.`
      : verdict === "struktur_warnung"
        ? `Struktur-Warnung: ${onlyAltUnexplained.length} unerklärte Alt-Quelle(n), aber ohne Dokumente (keine Datenlücke).`
        : `Keine Verschlechterung: ${both.length} Quellen erhalten, ${onlyAltExplained.length} erklärt konsolidiert, ${onlyNew.length} neu.`
  };
}

module.exports = { shadowCompareEnabled, compareSupply, explainOnlyAlt };
