"use strict";

// Helmut — Master Quellenkatalog · Sprint 3 · Shadow-Vergleich Alt-relational vs. Master (Phase 1).
//
// Reine, REPRODUZIERBARE Diff-Logik (keine Zufalls-/Zeitabhaengigkeit, keine KI, kein Netz,
// kein Storage). Vergleicht den aus dem BESTEHENDEN relationalen Bestand adaptierten Kanon
// (adapter.adaptRelationalCatalog) gegen ein NEUES Master-Katalogmodell und beantwortet exakt
// die sechs Auftragsfragen aus Phase 1:
//   1 onlyOld               — Quelle existiert nur im alten System
//   2 onlyNew               — Quelle existiert nur im neuen Modell
//   3 differingClassification — Quelle wird unterschiedlich klassifiziert
//   4 conflictingUrls       — Quelle besitzt widerspruechliche URLs
//   5 likelyDuplicates      — Quelle ist vermutlich doppelt
//   6 differingAssignment   — bestehende Paketzuweisung wuerde die neue Logik anders entscheiden
//
// Philosophie (wie supply-shadow-compare.js): ein Unterschied ist NICHT automatisch ein Fehler.
// onlyOld/onlyNew sind bei einem bewusst neuen Startkatalog erwartbar; nur echte Widersprueche
// (Punkt 4) sind hart. Unbekanntes bleibt sichtbar, wird nie stillschweigend als 0 gewertet.

const model = require("./model");
const { assignSourceToPackages } = require("./assignment");

function keyOf(rec) { return rec.canonical_key || model.canonicalSourceKey(rec); }
function setEq(a, b) {
  const sa = new Set(a), sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const x of sa) if (!sb.has(x)) return false;
  return true;
}

// Identitaets-Anker fuer die URL-Widerspruchspruefung: derselbe Herausgeber + dieselbe direkte
// Abrufmethode + dieselbe STARKE inhaltliche Rolle (Partei/Fraktion/Ausschuss/Institution) sollte
// auf DIESELBE kanonische URL zeigen. OHNE starke Rolle liefert die Funktion null -> es wird KEIN
// Konflikt gemeldet (zwei legitime Feeds eines Mediums ohne Institution sind kein Widerspruch;
// Review-Fund gegen Over-Flagging).
function identityAnchor(rec) {
  const method = String(rec.retrieval && rec.retrieval.method || "").toLowerCase();
  const anchor = rec.party_id || rec.group_id || (rec.committee_ids || []).join("+") || rec.institution_id || "";
  return anchor ? `${rec.publisher_id}|${method}|${anchor}` : null;
}

function compareCatalogs(input = {}) {
  const oldRecords = Array.isArray(input.oldRecords) ? input.oldRecords : [];
  const newRecords = Array.isArray(input.newRecords) ? input.newRecords : [];
  const newPackages = Array.isArray(input.newPackages) ? input.newPackages : [];
  // Alt-Zuweisung: Map source_id -> Set(package_key). packageKeyById normalisiert Paket-IDs->Keys.
  const packageKeyById = input.packageKeyById || {};
  const oldAssignmentBySource = buildOldAssignment(input.oldAssignments || [], packageKeyById);

  const oldByKey = new Map(oldRecords.map((r) => [keyOf(r), r]));
  const newByKey = new Map(newRecords.map((r) => [keyOf(r), r]));

  // 1/2 onlyOld / onlyNew
  const onlyOld = [];
  const onlyNew = [];
  const shared = [];
  for (const [k, r] of oldByKey) {
    if (newByKey.has(k)) shared.push({ key: k, old: r, neu: newByKey.get(k) });
    else onlyOld.push(summ(r));
  }
  for (const [k, r] of newByKey) if (!oldByKey.has(k)) onlyNew.push(summ(r));

  // 3 differingClassification (nur geteilte Schluessel)
  const differingClassification = [];
  for (const s of shared) {
    const diffs = classificationDiff(s.old, s.neu);
    if (diffs.length) differingClassification.push({ key: s.key, id: s.neu.id, diffs });
  }

  // 4 conflictingUrls — gleiche Identitaet (Herausgeber+Methode+Rolle), aber unterschiedliche
  //   kanonische URL; nur direkte Feeds (rss/api/html), da Suchwege ueber die Query identisch sind.
  const conflictingUrls = detectUrlConflicts([...oldRecords, ...newRecords]);

  // 5 likelyDuplicates — Dubletten INNERHALB eines Katalogs. Die erwartete Alt<->Neu-Ueberlappung
  // ist bereits 'shared' und wird NICHT als Dublette gezaehlt (Review-Fund: sonst zaehlte jede
  // geteilte Quelle faelschlich als Dublette).
  const dupOld = model.dedupeCandidates(oldRecords).duplicates.map((d) => ({ key: d.key, duplicateOf: d.of, catalog: "alt" }));
  const dupNew = model.dedupeCandidates(newRecords).duplicates.map((d) => ({ key: d.key, duplicateOf: d.of, catalog: "neu" }));
  const likelyDuplicates = [...dupOld, ...dupNew];

  // 6 differingAssignment — Alt-Paketzuweisung vs. neue datengetriebene Zuweisung (geteilte Quellen).
  const differingAssignment = [];
  for (const s of shared) {
    const oldKeys = [...(oldAssignmentBySource.get(s.old.id) || new Set())].sort();
    const newKeys = assignSourceToPackages(s.neu, newPackages).sort();
    if (!setEq(oldKeys, newKeys)) {
      differingAssignment.push({ key: s.key, id: s.neu.id, altPakete: oldKeys, neuePakete: newKeys });
    }
  }

  const verdict =
    conflictingUrls.length ? "konflikt"
    : (differingClassification.length || differingAssignment.length || likelyDuplicates.length) ? "pruefbeduerftig"
    : (onlyOld.length || onlyNew.length) ? "erklaerbare_abweichung"
    : "identisch";

  const summary =
    `alt=${oldRecords.length} neu=${newRecords.length} geteilt=${shared.length} · ` +
    `nurAlt=${onlyOld.length} nurNeu=${onlyNew.length} · klassifikation≠${differingClassification.length} · ` +
    `urlKonflikt=${conflictingUrls.length} · dublette≈${likelyDuplicates.length} · zuweisung≠${differingAssignment.length} · Urteil=${verdict}`;

  return {
    verdict, summary,
    counts: {
      old: oldRecords.length, neu: newRecords.length, shared: shared.length,
      onlyOld: onlyOld.length, onlyNew: onlyNew.length,
      differingClassification: differingClassification.length,
      conflictingUrls: conflictingUrls.length,
      likelyDuplicates: likelyDuplicates.length,
      differingAssignment: differingAssignment.length
    },
    onlyOld, onlyNew, differingClassification, conflictingUrls, likelyDuplicates, differingAssignment
  };
}

function buildOldAssignment(oldAssignments, packageKeyById) {
  const m = new Map();
  for (const a of oldAssignments) {
    const key = packageKeyById[a.package_id] || a.package_key || a.package_id;
    if (!m.has(a.source_id)) m.set(a.source_id, new Set());
    m.get(a.source_id).add(key);
  }
  return m;
}

function classificationDiff(a, b) {
  const out = [];
  const cmp = (f, x, y) => { if (String(x == null ? "" : x) !== String(y == null ? "" : y)) out.push({ field: f, alt: x, neu: y }); };
  cmp("source_type", a.source_type, b.source_type);
  cmp("political_level", a.political_level, b.political_level);
  cmp("party_id", a.party_id, b.party_id);
  cmp("group_id", a.group_id, b.group_id);
  cmp("institution_id", a.institution_id, b.institution_id);
  const ca = [...new Set(a.committee_ids || [])].sort().join(",");
  const cb = [...new Set(b.committee_ids || [])].sort().join(",");
  if (ca !== cb) out.push({ field: "committee_ids", alt: a.committee_ids, neu: b.committee_ids });
  return out;
}

function detectUrlConflicts(records) {
  const byAnchor = new Map();
  for (const r of records) {
    const method = String(r.retrieval && r.retrieval.method || "").toLowerCase();
    if (!["rss", "api", "html", "structured_download", "sitemap"].includes(method)) continue; // Suchwege ausgenommen
    const url = r.canonical_url;
    if (!url) continue;
    const anchor = identityAnchor(r);
    if (!anchor) continue; // keine starke Rolle -> kein Widerspruch bewertbar
    if (!byAnchor.has(anchor)) byAnchor.set(anchor, new Map());
    const urlMap = byAnchor.get(anchor);
    if (!urlMap.has(url)) urlMap.set(url, []);
    urlMap.get(url).push(r.id);
  }
  const conflicts = [];
  for (const [anchor, urlMap] of byAnchor) {
    if (urlMap.size > 1) {
      conflicts.push({ anchor, urls: [...urlMap.keys()], ids: [].concat(...urlMap.values()) });
    }
  }
  return conflicts.sort((a, b) => a.anchor < b.anchor ? -1 : 1);
}

function summ(r) {
  return { id: r.id, key: keyOf(r), publisher_id: r.publisher_id, source_type: r.source_type, url: r.canonical_url, review_status: r.review_status };
}

module.exports = { compareCatalogs, classificationDiff, detectUrlConflicts, identityAnchor };
