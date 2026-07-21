"use strict";

// Helmut — Master Quellenkatalog · Sprint 3 · Laufzeitgesundheit (Belang 5), rein LESEND.
//
// Reine Aggregation. Leitet aus den vorhandenen Betriebstelemetrie-Zeilen
// (public.source_crawl_telemetry, Sprint-2-Tabelle) eine GLOBALE, mandantenneutrale
// Gesundheitsbeobachtung je Quelle ab — ohne die Telemetrie zu veraendern und ohne jeden
// Schreibzugriff. Die Gesundheit ist strikt getrennt von der inhaltlichen Klassifikation
// (Belang 3) und vom Prüf-/Freigabestatus (Belang 8): eine gesunde Quelle kann rechtlich
// ungeprueft sein und umgekehrt.
//
// DSGVO: die Telemetrie enthaelt per Konstruktion nur technische Metadaten (kein Volltext/PII).
// Diese Aggregation gibt ausschliesslich Zaehler/Statuswerte zurueck.

const base = require("../model");

// Aggregiert Telemetrie-Zeilen je source_id zu einem Gesundheitsbild.
//   rows: [{source_id, status:'ok'|'empty'|'error', duration_ms, finished_at, error_code, ...}]
// Rueckgabe: Map source_id -> { health, successRate, observations, lastObservedAt, lastError }.
function aggregateHealth(rows = []) {
  const bySource = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || r.source_id == null) continue;
    const id = String(r.source_id);
    if (!bySource.has(id)) bySource.set(id, { ok: 0, empty: 0, error: 0, total: 0, lastObservedAt: null, lastError: null, streak: 0 });
    const agg = bySource.get(id);
    agg.total += 1;
    if (r.status === "ok") { agg.ok += 1; agg.streak = 0; }
    else if (r.status === "empty") { agg.empty += 1; }
    else { agg.error += 1; agg.streak += 1; if (r.error_code) agg.lastError = String(r.error_code); }
    if (r.finished_at && (!agg.lastObservedAt || r.finished_at > agg.lastObservedAt)) agg.lastObservedAt = r.finished_at;
  }

  const out = new Map();
  for (const [id, agg] of bySource) {
    const successRate = agg.total ? agg.ok / agg.total : 0;
    out.set(id, {
      source_id: id,
      health: healthFromStreak(agg.streak, successRate, agg.total),
      successRate: Number(successRate.toFixed(3)),
      observations: agg.total,
      errorStreak: agg.streak,
      lastObservedAt: agg.lastObservedAt,
      lastError: agg.lastError
    });
  }
  return out;
}

// Nutzt dieselben Schwellen wie das Bestandsmodell (model.nextPathStatus): >=6 -> broken,
// >=3 -> degraded, sonst nach Erfolgsquote. Ohne Beobachtung: 'unknown' (nie faelschlich gruen).
function healthFromStreak(streak, successRate, total) {
  if (!total) return "unknown";
  if (streak >= base.BROKEN_THRESHOLD) return "broken";
  if (streak >= base.DEGRADE_THRESHOLD) return "degraded";
  if (successRate >= 0.8) return "healthy";
  if (successRate >= 0.4) return "degraded";
  return "broken";
}

// Reichert kanonische Quellenrecords um die abgeleitete Gesundheit an (rein additiv, neue Objekte).
// Zuordnung ueber legacy_source_id (Telemetrie kennt die Alt-Quell-ID) oder die kanonische ID.
function annotateHealth(records = [], healthMap = new Map()) {
  return (Array.isArray(records) ? records : []).map((r) => {
    const h = healthMap.get(String(r.legacy_source_id)) || healthMap.get(String(r.id)) || null;
    return h ? { ...r, health: h.health, health_success_rate: h.successRate, last_checked_at: h.lastObservedAt || r.last_checked_at } : { ...r, health: r.health || "unknown" };
  });
}

module.exports = { aggregateHealth, annotateHealth, healthFromStreak };
