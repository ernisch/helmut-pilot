"use strict";

// Helmut — Quellenplattform (Konsolidierung) · EIN kanonisches Laufzeit-Quellobjekt (Aufgabe 2).
//
// Reine, deterministische Logik. KEINE KI, kein Netz, kein Storage. Dies ist KEIN viertes
// Parallelmodell: es ist eine PROJEKTION ueber den bestehenden kanonischen Quellenrecord aus
// Sprint 3 (quellenarchitektur/master/source-record.js + model.js) — dieselbe Wahrheit, angereichert
// um die reinen LAUFZEIT-Overlays, die erst zur Abfragezeit entstehen:
//   - Sichtbarkeit (global | privat) + tenant_id (nur bei privaten Quellen)
//   - vereinheitlichte Gesundheit (health-model)  · vereinheitlichter Qualitaetsstatus (quality-model)
//
// Persistenz bleibt der Master-Katalog (Sprint 3). Dieses Objekt wird NIE pro Mandant kopiert:
// eine globale Quelle existiert genau EINMAL; der Versorgungsplan referenziert sie nur.

const sourceRecord = require("../quellenarchitektur/master/source-record");
const masterModel = require("../quellenarchitektur/master/model");
const taxonomy = require("../quellenarchitektur/master/taxonomy");
const health = require("./health-model");

// Die 20 verbindlichen Felder des kanonischen Laufzeitobjekts (Auftrag Aufgabe 2).
const RUNTIME_FIELDS = Object.freeze([
  "id",               // 1  kanonische Quellen-ID (+ canonical_key)
  "publisher_id",     // 2  Herausgeber
  "retrieval",        // 3  Abrufweg {method,url,query,parser,expected_frequency}
  "source_type",      // 4  Quellentyp
  "institution_id",   // 5  Institution
  "party_id",         // 6a Partei
  "group_id",         // 6b Fraktion
  "committee_ids",    // 7  Ausschuesse
  "policy_fields",    // 8  Politikfelder (abgeleitet aus Ausschuessen/Themen)
  "topics",           // 9  Themen
  "region_ids",       // 10 Regionen
  "authority",        // 11 Autoritaet {role,trust}
  "discovery_origin", // 12 Herkunft
  "license_status",   // 13 Lizenzstatus
  "privacy_status",   // 14 Datenschutzstatus
  "health",           // 15 Gesundheitsstatus (vereinheitlicht)
  "quality_status",   // 16 Qualitaetsstatus
  "visibility",       // 17 global | private
  "tenant_id",        // 18 Tenant-ID (nur bei privaten Quellen)
  "review_status",    // 19 Pruefstatus (Importzustand)
  "updated_at"        // 20 Aktualisierungszeitpunkt
]);

function authorityOf(rec) {
  const t = taxonomy.getSourceType(rec.source_type) || {};
  return {
    role: rec.evidence_role || t.evidence_role || "aggregator",
    trust: rec.trust || t.default_trust || "unbekannt",
    is_official: !!t.is_official,
    primary_capable: !!t.primary_capable,
    is_search_provider: masterModel.isSearchProviderSource(rec)
  };
}

// Politikfelder einer Quelle: abgeleitet aus expliziten Feldern + Themen + Ausschuss-IDs.
function policyFieldsOf(rec) {
  const out = new Set();
  for (const v of rec.policy_fields || []) out.add(String(v));
  for (const v of rec.topics || []) out.add(String(v));
  return [...out];
}

// Normalisiert die Gesundheit auf das vereinheitlichte Vokabular. Akzeptiert:
//   - ein Health-Objekt {state,...}  - einen Zustands-String (aus main/S2/S3)  - undefiniert.
function normalizeHealth(rec) {
  const raw = rec.health;
  if (raw && typeof raw === "object" && raw.state) return { ...raw, state: health.normalize(raw.state) };
  const state = health.normalize(raw || "never_checked");
  // Ein quarantaenisierter/archivierter Importzustand ueberschreibt eine gruene Gesundheit.
  const fromIntake = health.fromIntake(rec.review_status);
  return { state: fromIntake || state, errorStreak: rec.error_streak || 0, lastCheckedAt: rec.last_checked_at || null };
}

// Projiziert einen kanonischen Master-Record (oder eine private Tenant-Quelle) auf das
// Laufzeitobjekt. opts.visibility/opts.tenantId setzen die Sichtbarkeit (Default: global).
function toRuntimeSource(rec = {}, opts = {}) {
  const visibility = opts.visibility || (rec.tenant_id ? "private" : "global");
  const tenant_id = visibility === "private" ? (opts.tenantId || rec.tenant_id || null) : null;
  const h = normalizeHealth(rec);
  return {
    id: rec.id || null,
    canonical_key: rec.canonical_key || null,
    publisher_id: rec.publisher_id || null,
    retrieval: rec.retrieval || { method: rec.method || null, url: rec.canonical_url || rec.url || null, query: rec.query || null, parser: rec.parser || null, expected_frequency: rec.expected_frequency || null },
    canonical_url: rec.canonical_url || null,
    source_type: rec.source_type || null,
    political_level: rec.political_level || null,
    institution_id: rec.institution_id || null,
    party_id: rec.party_id || null,
    group_id: rec.group_id || null,
    committee_ids: rec.committee_ids || [],
    policy_fields: policyFieldsOf(rec),
    topics: rec.topics || [],
    region_ids: rec.region_ids || [],
    language: rec.language || "de",
    authority: authorityOf(rec),
    discovery_origin: rec.discovery_origin || null,
    discovered_at: rec.discovered_at || null,
    last_checked_at: rec.last_checked_at || null,
    release_status: rec.release_status || "unfreigegeben",
    evidence_url: rec.evidence_url || null,
    content_stance: rec.content_stance || null,
    trust: rec.trust || (taxonomy.getSourceType(rec.source_type) || {}).default_trust || "unbekannt",
    license_status: rec.license_status || "unbewertet",
    privacy_status: rec.privacy_status || "unbewertet",
    health: h,
    quality_status: opts.quality_status || rec.quality_status || "unbewertet",
    quality: opts.quality || null,
    visibility,
    tenant_id,
    review_status: rec.review_status || "discovered",
    responsible: rec.responsible || null,
    updated_at: rec.updated_at || rec.last_checked_at || null,
    is_search_provider: masterModel.isSearchProviderSource(rec)
  };
}

// Baut ein Laufzeitobjekt aus rohen Eingaben (delegiert die kanonische Normalisierung + PII-Guard
// an Sprint 3, damit KEINE zweite Record-Baustelle entsteht).
function buildRuntimeSource(input = {}, opts = {}) {
  const rec = sourceRecord.buildSourceRecord(input, opts);
  return toRuntimeSource(rec, opts);
}

// Validiert ein Laufzeitobjekt: kanonische Pflichtpruefung (Sprint 3) PLUS die
// Sichtbarkeits-/Tenant-Invariante (Aufgabe 7):
//   - global  => KEINE tenant_id (globale Quellen sind mandantenneutral, nie dupliziert)
//   - private => MUSS tenant_id tragen (strikte Mandantentrennung)
function validateRuntimeSource(rs = {}) {
  const base = sourceRecord.validateSourceRecord({
    ...rs,
    canonical_url: rs.canonical_url,
    retrieval: rs.retrieval
  });
  const errors = [...base.errors];
  if (rs.visibility === "global" && rs.tenant_id) errors.push("globale Quelle darf KEINE tenant_id tragen (Mandantenneutralität)");
  if (rs.visibility === "private" && !rs.tenant_id) errors.push("private Quelle MUSS eine tenant_id tragen (Mandantentrennung)");
  if (!["global", "private"].includes(rs.visibility)) errors.push(`ungültige Sichtbarkeit: ${rs.visibility}`);
  if (!health.isHealthState(rs.health && rs.health.state)) errors.push(`ungültiger Gesundheitszustand: ${rs.health && rs.health.state}`);
  return { ok: errors.length === 0, errors, warnings: base.warnings };
}

module.exports = {
  RUNTIME_FIELDS,
  toRuntimeSource, buildRuntimeSource, validateRuntimeSource,
  authorityOf, policyFieldsOf, normalizeHealth
};
