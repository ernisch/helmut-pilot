"use strict";

// ============================================================================
// Understanding-Recovery — REIN LESENDE Rekonstruktions-Analyse (Trockenlauf).
// ============================================================================
// Zweck: Fuer zurueckgestellte (`pending`) und fehlgeschlagene (`failed`) Vorgaenge
// des Alt-Bestands pruefen, OB sie aus noch vorhandenen `raw_documents`
// rekonstruierbar sind — OHNE etwas zu schreiben, OHNE KI-Aufruf.
//
// SICHERHEIT (per Konstruktion schreibfrei): Dieses Modul importiert AUSSCHLIESSLICH
// die reinen Cluster-/Ableitungshelfer aus understanding.js. Es besitzt KEINE
// Schreibfunktion, keinen DB-/KI-Client, keine Env-/Flag-Wirkung. Alle Funktionen
// sind pur (Eingabe -> Klassifikation), nebenwirkungsfrei; sie mutieren ihre
// Eingaben nicht.
//
// Klassifikation je Kandidat:
//   eindeutig        genau 1 Dokumentgruppe, abgeleitete vorgang_id == gespeicherte
//   wahrscheinlich   genau 1 Dokumentgruppe, aber vorgang_id-Drift (id aendert sich)
//   mehrdeutig       >1 Dokumentgruppe (mehrere moegliche Zuordnungen -> Konfliktrisiko)
//   duplikat-risiko  Thema traegt bereits ein complete-KO (Recovery wuerde duplizieren)
//   keine-quelle     kein passendes Rohdokument gefunden
//
// Empfehlung je Klasse: eindeutig/wahrscheinlich -> "recovery";
//   duplikat-risiko -> "verwerfen"; mehrdeutig/keine-quelle -> "manuell".

const { clusterRawDocuments, deriveVorgangId } = require("./understanding");

// Spiegelt understanding.js:57-65 (nur der Lese-Vorfilter; die eigentliche
// Clusterung + vorgang_id-Ableitung nutzt die KANONISCHEN Funktionen aus
// understanding.js, damit die Klassifikation der echten Pipeline entspricht).
function anchorTokens(text) {
  return [...new Set(
    String(text || "").toLowerCase().replace(/[^a-z0-9äöüß]+/gi, " ").split(/\s+/).filter((t) => t.length >= 8)
  )];
}
function anchorsMatch(a, b) { return a === b || a.includes(b) || b.includes(a); }

// Anker des Kandidaten aus seiner Headline + dem vorgang_id-Slug (ohne "vg-").
function candidateAnchors(candidate = {}) {
  const slugPart = String(candidate.vorgang_id || "").replace(/^vg-/, "").replace(/-/g, " ");
  return anchorTokens(`${candidate.headline || candidate.display_title || ""} ${slugPart}`);
}

// Waehlt aus rawDocs die Dokumente, die mind. einen Anker mit dem Kandidaten teilen.
// Rein lesend; erzeugt eine neue Liste (mutiert nichts).
function matchDocuments(candidate, rawDocs = []) {
  const canchors = candidateAnchors(candidate);
  if (!canchors.length) return [];
  return (rawDocs || []).filter((d) => {
    if (!d) return false;
    const da = anchorTokens(`${d.title || ""} ${d.summary || ""}`);
    return da.some((a) => canchors.some((c) => anchorsMatch(a, c)));
  });
}

// Themen-Duplikat-Erkennung: markiert Kandidaten, deren Thema bereits von einem
// complete-KO abgedeckt ist (Anker-Ueberlappung Headline<->Headline). Konservativ:
// im Zweifel lieber als Duplikat-Risiko flaggen (-> manuell/verwerfen) als
// versehentlich ein bestehendes Wissensobjekt zu duplizieren.
function completeTopicSet(candidates = [], completeKos = []) {
  const completeAnchors = (completeKos || []).map((k) => anchorTokens(`${k.headline || k.display_title || ""}`));
  const set = new Set();
  for (const c of candidates || []) {
    const ca = candidateAnchors(c);
    if (!ca.length) continue;
    const dup = completeAnchors.some((la) => la.some((a) => ca.some((x) => anchorsMatch(a, x))));
    if (dup) set.add(c.vorgang_id);
  }
  return set;
}

// Reine Klassifikation EINES Kandidaten. opts.completeTopic=true -> Duplikat-Risiko.
function assessCandidate(candidate = {}, rawDocs = [], opts = {}) {
  const completeTopic = opts.completeTopic === true;
  const matched = matchDocuments(candidate, rawDocs);
  const sourceCount = new Set(matched.map((d) => d.source_name || d.source_id || "?")).size;
  if (!matched.length) {
    return baseResult(candidate, { klasse: "keine-quelle", docCount: 0, sourceCount: 0,
      clusterCount: 0, derivedIds: [], idMatch: false, completeTopic });
  }
  const clusters = clusterRawDocuments(matched);
  const derivedIds = clusters.map(deriveVorgangId);
  const idMatch = derivedIds.includes(candidate.vorgang_id);
  let klasse;
  if (completeTopic) klasse = "duplikat-risiko";
  else if (clusters.length > 1) klasse = "mehrdeutig";
  else if (idMatch) klasse = "eindeutig";
  else klasse = "wahrscheinlich";
  return baseResult(candidate, { klasse, docCount: matched.length, sourceCount,
    clusterCount: clusters.length, derivedIds, idMatch, completeTopic });
}

function empfehlungFor(klasse) {
  if (klasse === "eindeutig" || klasse === "wahrscheinlich") return "recovery";
  if (klasse === "duplikat-risiko") return "verwerfen";
  return "manuell";
}

function baseResult(candidate, fields) {
  return {
    vorgangId: candidate.vorgang_id,
    understanding_status: candidate.understanding_status || null,
    klasse: fields.klasse,
    docCount: fields.docCount,
    sourceCount: fields.sourceCount,
    clusterCount: fields.clusterCount,
    derivedIds: fields.derivedIds,
    idMatch: fields.idMatch,
    completeTopic: fields.completeTopic,
    empfehlung: empfehlungFor(fields.klasse)
  };
}

function assessAll(candidates = [], rawDocs = [], opts = {}) {
  const completeSet = opts.completeTopicSet instanceof Set
    ? opts.completeTopicSet
    : new Set(opts.completeTopicSet || []);
  return (candidates || []).map((c) => assessCandidate(c, rawDocs, { completeTopic: completeSet.has(c.vorgang_id) }));
}

// 1 KI-Call pro empfohlenem Vorgang (eindeutig/wahrscheinlich). Andere: 0.
function estimateAiCalls(assessments = []) {
  return (assessments || []).filter((a) => a.empfehlung === "recovery").length;
}

function summarize(assessments = []) {
  const s = { geprueft: (assessments || []).length, eindeutig: 0, wahrscheinlich: 0,
    mehrdeutig: 0, "duplikat-risiko": 0, "keine-quelle": 0 };
  for (const a of assessments || []) s[a.klasse] = (s[a.klasse] || 0) + 1;
  s.empfohlen = estimateAiCalls(assessments);
  s.verwerfen = (assessments || []).filter((a) => a.empfehlung === "verwerfen").length;
  s.manuell = (assessments || []).filter((a) => a.empfehlung === "manuell").length;
  s.geschaetzteKiCalls = s.empfohlen;
  return s;
}

// Datenschutz-Filter der Ausgabe: NUR Slugs/Zahlen/Klassen — nie Rohtitel/-inhalte/PII.
function redactAssessment(a = {}) {
  return { vorgangId: a.vorgangId, understanding_status: a.understanding_status, klasse: a.klasse,
    docCount: a.docCount, sourceCount: a.sourceCount, clusterCount: a.clusterCount,
    idMatch: a.idMatch, derivedIds: a.derivedIds, empfehlung: a.empfehlung };
}

module.exports = {
  anchorTokens, anchorsMatch, candidateAnchors, matchDocuments, completeTopicSet,
  assessCandidate, assessAll, estimateAiCalls, summarize, redactAssessment
};
