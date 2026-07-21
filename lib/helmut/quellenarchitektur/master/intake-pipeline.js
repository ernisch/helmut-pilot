"use strict";

// Helmut — Master Quellenkatalog · Sprint 3 · Discovery- und Importstrecke (Phase 5).
//
// Reine Logik. KEIN Storage-Write: ingestBatch bekommt den aktuellen Katalogzustand als
// Eingabe und liefert einen NEUEN Zustand + Bericht zurueck. Der Aufrufer entscheidet, ob und
// wohin er persistiert (Testdaten/Fixture/vorbereiteter Seed — nie direkt Production).
//
// Garantien (Auftrag Phase 5 + Abnahme §5/§6):
//   * IDEMPOTENT: dieselbe Eingabe zweimal ausgefuehrt erzeugt keine Dubletten und keine
//     unkontrollierten Aenderungen (bestehende Records werden NIE still mutiert).
//   * Keine Quelle springt direkt von 'discovered' auf 'active' — Neuzugaenge landen auf
//     'normalized' (oder 'duplicate_candidate' bei Verdacht), nie hoeher.
//   * Unklare/widerspruechliche Quellen bekommen Review-Status ('duplicate_candidate').
//   * Reproduzierbar: keine Zufalls-/Zeitabhaengigkeit im Kern (Zeit wird injiziert).

const model = require("./model");
const { buildSourceRecord, validateSourceRecord } = require("./source-record");

// Indexiert einen bestehenden Katalog nach kanonischem Schluessel (Dedup-Basis).
function indexByKey(catalog = []) {
  const idx = new Map();
  for (const r of Array.isArray(catalog) ? catalog : []) {
    if (!r || typeof r !== "object") continue;
    const key = r.canonical_key || model.canonicalSourceKey(r);
    if (!idx.has(key)) idx.set(key, r);
  }
  return idx;
}

// Vergleicht die inhaltliche Klassifikation zweier Records auf Widerspruch (nicht auf Gleichheit
// der Betriebsfelder). Nur klassifikationsrelevante Felder — Prüf-/Freigabestatus aendern sich
// im Betrieb und sind KEIN Widerspruch.
function classificationConflict(a = {}, b = {}) {
  const diffs = [];
  const cmp = (field, x, y) => { if (norm(x) !== norm(y)) diffs.push({ field, existing: x, incoming: y }); };
  cmp("source_type", a.source_type, b.source_type);
  cmp("political_level", a.political_level, b.political_level);
  cmp("party_id", a.party_id, b.party_id);
  cmp("group_id", a.group_id, b.group_id);
  cmp("institution_id", a.institution_id, b.institution_id);
  if (setKey(a.committee_ids) !== setKey(b.committee_ids)) diffs.push({ field: "committee_ids", existing: a.committee_ids, incoming: b.committee_ids });
  return diffs;
}
function norm(v) { return v == null ? "" : String(v); }
function setKey(arr) { return [...new Set(Array.isArray(arr) ? arr.map(String) : [])].sort().join(","); }

// Fuehrt eine Charge Roh-Kandidaten kontrolliert in den Katalog ueber.
//   existingCatalog: Array bestehender Records (unveraendert gelassen).
//   candidates:      Array roher Eingaben (werden zu Records normalisiert).
// opts.clock: injizierte Zeit (ISO-String oder Date) fuer discovered_at — Determinismus.
function ingestBatch(existingCatalog = [], candidates = [], opts = {}) {
  const idx = indexByKey(existingCatalog);
  const catalog = [...(Array.isArray(existingCatalog) ? existingCatalog : [])];
  const seenInBatch = new Map(); // canonical_key -> record (Batch-interne Dedup)

  const report = {
    received: 0, added: 0, unchanged: 0,
    duplicatesInBatch: 0, duplicatesOfExisting: 0, conflicts: [],
    invalid: 0, byState: {}, addedIds: []
  };

  for (const raw of Array.isArray(candidates) ? candidates : []) {
    if (!raw || typeof raw !== "object") continue;
    report.received += 1;

    // 1) entdeckt -> normalisiert: Record bauen (kanonische URL/Herausgeber/Schluessel).
    const rec = buildSourceRecord(raw, { clock: opts.clock });
    const key = rec.canonical_key;

    // Roh-Validierung: fehlt Pflicht/Herkunft grob, bleibt der Kandidat 'discovered' (Review).
    const v = validateSourceRecord(rec);
    if (!v.ok && v.errors.some((e) => /publisher_id fehlt|weder canonical_url/.test(e))) {
      report.invalid += 1;
      // Unbrauchbarer Kandidat: nicht aufnehmen (kein Muell im Katalog), im Bericht gezaehlt.
      continue;
    }

    // 2) Dublette gegen bestehenden Katalog?
    if (idx.has(key)) {
      const existing = idx.get(key);
      const conflict = classificationConflict(existing, rec);
      if (conflict.length) {
        // Widerspruch -> Review-Notiz, bestehender Record bleibt unveraendert (idempotent/sicher).
        report.conflicts.push({ key, id: existing.id, diffs: conflict });
      } else {
        report.unchanged += 1; // idempotenter Wiederholimport: nichts zu tun
      }
      continue;
    }

    // 3) Batch-interne Dublette?
    if (seenInBatch.has(key)) {
      report.duplicatesInBatch += 1;
      continue;
    }

    // 4) Neuzugang: bewusst NUR bis 'normalized' (bzw. 'duplicate_candidate' bei URL-Aehnlichkeit).
    rec.review_status = likelyNearDuplicate(rec, idx) ? "duplicate_candidate" : "normalized";
    seenInBatch.set(key, rec);
    catalog.push(rec);
    // BEWUSST NICHT in idx eintragen: idx bleibt der BESTEHENDE Katalog. So wird eine batch-
    // interne Wiederholung ueber seenInBatch als Batch-Dublette gezaehlt (nicht als "unchanged").
    report.added += 1;
    report.addedIds.push(rec.id);
    if (rec.review_status === "duplicate_candidate") report.duplicatesOfExisting += 1;
  }

  for (const r of catalog) report.byState[r.review_status] = (report.byState[r.review_status] || 0) + 1;
  return { catalog, report };
}

// Weiche Duplikat-Heuristik: gleicher Herausgeber + sehr aehnliche Ziel-URL, aber anderer
// kanonischer Schluessel (z. B. zwei Feeds desselben Herausgebers) -> Review statt Auto-Aufnahme.
function likelyNearDuplicate(rec, idx) {
  if (!rec.publisher_id) return false;
  for (const other of idx.values()) {
    if (other.publisher_id !== rec.publisher_id) continue;
    if (other.canonical_url && rec.canonical_url && other.canonical_url === rec.canonical_url && other.canonical_key !== rec.canonical_key) {
      return true;
    }
  }
  return false;
}

// Bringt einen Record kontrolliert einen Schritt weiter (delegiert an die Zustandsmaschine).
// Erzwingt: der Ziel-Uebergang muss erlaubt sein; Aktivierung nur, wenn der Record es zulaesst.
function promote(record, targetState, opts = {}) {
  const { isEligibleForActivation } = require("./source-record");
  if (targetState === "active") {
    const elig = isEligibleForActivation(record);
    if (!elig.ok) return { ok: false, state: record.review_status, reason: `nicht-aktivierbar:${elig.reason}` };
  }
  const res = model.advanceIntake(record.review_status, targetState, opts);
  if (res.ok) return { ok: true, state: res.state, reason: res.reason, record: { ...record, review_status: res.state } };
  return { ok: false, state: record.review_status, reason: res.reason };
}

module.exports = { indexByKey, classificationConflict, ingestBatch, promote };
