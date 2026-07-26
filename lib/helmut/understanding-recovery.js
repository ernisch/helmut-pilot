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

// Trifft eine ABGELEITETE Vorgangskennung die GESPEICHERTE?
// Seit der Reparatur von Betriebsbefund B4 traegt eine neu abgeleitete Kennung
// zusaetzlich Ereignistag und Ankerpruefsumme (`vg-<wurzel>-<tag>-<summe>`),
// waehrend alte gespeicherte Kennungen nur aus der Wurzel bestehen (`vg-<wurzel>`).
// Ein reiner Zeichenkettenvergleich wuerde deshalb JEDEN Altfall als "nicht
// zuordenbar" ausweisen. Massgeblich ist die gemeinsame Themenwurzel.
function idTrifftKandidat(abgeleitet, gespeichert) {
  const a = String(abgeleitet || "");
  const b = String(gespeichert || "");
  if (!a || !b) return false;
  if (a === b) return true;
  return a.startsWith(`${b}-`) || b.startsWith(`${a}-`);
}

// Reine Klassifikation EINES Kandidaten. opts.completeTopic=true -> Duplikat-Risiko.
function assessCandidate(candidate = {}, rawDocs = [], opts = {}) {
  const completeTopic = opts.completeTopic === true;
  const matched = matchDocuments(candidate, rawDocs);
  const sourceCount = new Set(matched.map((d) => d.source_name || d.source_id || "?")).size;
  const clusters = matched.length ? clusterRawDocuments(matched) : [];
  const derivedIds = clusters.map(deriveVorgangId);
  const idMatch = derivedIds.some((id) => idTrifftKandidat(id, candidate.vorgang_id));
  let klasse;
  if (completeTopic) klasse = "duplikat-risiko";        // Vorrang: Thema bereits complete -> nie recovern
  else if (!matched.length) klasse = "keine-quelle";
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

// Rekonstruiert das Cluster eines Kandidaten aus dem (breiten) Rohdok-Pool: die
// passenden Dokumente clustern; bevorzugt das Cluster, dessen abgeleitete vorgang_id
// die GESPEICHERTE trifft, sonst das groesste. Rein lesend, gibt {documents,anchors}
// oder null zurueck.
function reconstructCluster(candidate, rawDocs = []) {
  const matched = matchDocuments(candidate, rawDocs);
  if (!matched.length) return null;
  const clusters = clusterRawDocuments(matched);
  if (!clusters.length) return null;
  const exact = clusters.find((c) => idTrifftKandidat(deriveVorgangId(c), candidate && candidate.vorgang_id));
  return exact || clusters.slice().sort((a, b) => (b.documents || []).length - (a.documents || []).length)[0] || null;
}

// Datenschutz-Filter der Ausgabe: NUR Slugs/Zahlen/Klassen — nie Rohtitel/-inhalte/PII.
function redactAssessment(a = {}) {
  return { vorgangId: a.vorgangId, understanding_status: a.understanding_status, klasse: a.klasse,
    docCount: a.docCount, sourceCount: a.sourceCount, clusterCount: a.clusterCount,
    idMatch: a.idMatch, derivedIds: a.derivedIds, empfehlung: a.empfehlung };
}

// ============================================================================
// ANKER-BASIERTER Recovery-Pfad — STILLGELEGT (2026-07-18, Pending-Sprint).
// ============================================================================
// Der anker-basierte Ausfuehrungspfad ist ungeeignet fuer Multi-Doc-Faelle:
// Teilstring-Anker ziehen fremde Themen an (Production-Beleg: Lauf
// rec-29569461715 erzeugte einen 3-Themen-Digest und wurde zurueckgerollt).
// Die Allowlist ist deshalb LEER — planRecovery liefert strukturell nie einen
// Ausfuehrungsfall, selbst mit Flag+Token. Die reinen Analyse-/Klassifikations-
// funktionen oben bleiben nutzbar (Dry-Run/Diagnose). Ersatz fuer echte
// Recovery: Einzel-Dokument-Pfad je exakter raw_document_id (Restliste OP-05).
// Frueherer Stand (historisch): 6er-Allowlist; davon 1 recovert
// (vg-sozialwohnungen, singledoc-29583280106), 1 Duplikat (vg-psychotherapie ->
// OP-06), 4 offen fuer Einzel-Doc-Recovery.
const RECOVERY_ALLOWLIST = Object.freeze([]);
const RECOVERY_CONFIRM_TOKEN = "RECOVER_6_CONFIRMED";

function recoveryExecuteEnabled(env = process.env) {
  const v = String((env && env.HELMUT_RECOVERY_EXECUTE) || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}
function recoveryConfirmed(value) { return String(value == null ? "" : value) === RECOVERY_CONFIRM_TOKEN; }

// Pure: baut den Ausfuehrungsplan NUR fuer Allowlist-Faelle, die (a) noch offen
// (pending/failed), (b) eindeutig/wahrscheinlich rekonstruierbar, (c) KEIN
// Themen-Duplikat sind. Alles andere -> skip mit Grund. Schreibt/veraendert nichts.
function planRecovery(candidates, rawDocs, opts = {}) {
  const allowlist = new Set(opts.allowlist || RECOVERY_ALLOWLIST);
  const completeSet = opts.completeTopicSet instanceof Set
    ? opts.completeTopicSet : new Set(opts.completeTopicSet || []);
  const execute = [];
  const skip = [];
  const seen = new Set();
  for (const cand of candidates || []) {
    if (!allowlist.has(cand.vorgang_id)) continue;
    seen.add(cand.vorgang_id);
    if (cand.understanding_status !== "pending" && cand.understanding_status !== "failed") {
      skip.push({ vorgangId: cand.vorgang_id, grund: "nicht-mehr-offen" }); continue;
    }
    const a = assessCandidate(cand, rawDocs, { completeTopic: completeSet.has(cand.vorgang_id) });
    if (a.klasse === "duplikat-risiko") { skip.push({ vorgangId: cand.vorgang_id, grund: "duplikat-complete-existiert" }); continue; }
    if (a.klasse === "mehrdeutig") { skip.push({ vorgangId: cand.vorgang_id, grund: "mehrdeutig-manuell" }); continue; }
    if (a.klasse === "keine-quelle") { skip.push({ vorgangId: cand.vorgang_id, grund: "keine-quelldokumente" }); continue; }
    execute.push({ vorgangId: cand.vorgang_id, klasse: a.klasse, docCount: a.docCount,
      sourceCount: a.sourceCount, derivedIds: a.derivedIds, idMatch: a.idMatch });
  }
  for (const vid of allowlist) if (!seen.has(vid)) skip.push({ vorgangId: vid, grund: "nicht-gefunden" });
  return { execute, skip, kiCalls: execute.length };
}

// Reine Ausfuehrungs-KONTROLLE eines EINZELnen Falls (Deps injiziert). Fuehrt zur
// Laufzeit die abschliessenden Re-Checks aus (Idempotenz/Dedup) und delegiert den
// EINZIGEN KI-/Schreibschritt an deps.understandAndSave — der im Default-Skript
// NICHT verdrahtet ist (freigabepflichtig). Diese Funktion selbst schreibt nichts
// und ruft kein Modell; sie orchestriert nur ueber injizierte Deps.
async function recoverOne(planItem, deps = {}) {
  const vid = planItem && planItem.vorgangId;
  const getExisting = deps.getExisting || (async () => null);
  // (Re-Check 1) Idempotenz/Dedup: existiert bereits ein NICHT-pending (complete)-KO?
  const existing = await getExisting(vid);
  if (existing && existing.understanding_status && existing.understanding_status !== "pending" && existing.understanding_status !== "failed") {
    return { vorgangId: vid, done: false, skipped: true, grund: "bereits-complete-idempotent", wrote: false, aiCalls: 0 };
  }
  if (typeof deps.understandAndSave !== "function") {
    return { vorgangId: vid, done: false, skipped: true, grund: "write-pfad-nicht-verdrahtet-freigabepflichtig", wrote: false, aiCalls: 0 };
  }
  const res = (await deps.understandAndSave(planItem)) || {};
  return { vorgangId: vid, done: !!res.wrote, skipped: !res.wrote, wrote: !!res.wrote,
    aiCalls: Number(res.aiCalls) || 0, status: res.status || null, koId: res.koId || null };
}

module.exports = {
  anchorTokens, anchorsMatch, idTrifftKandidat, candidateAnchors, matchDocuments, completeTopicSet,
  assessCandidate, assessAll, estimateAiCalls, summarize, redactAssessment, reconstructCluster,
  RECOVERY_ALLOWLIST, RECOVERY_CONFIRM_TOKEN, recoveryExecuteEnabled, recoveryConfirmed,
  planRecovery, recoverOne
};
